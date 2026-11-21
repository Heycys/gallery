import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { deadLinks, filesOf, linkTarget, linksOf, SKILL_FILES, withoutSamples } from "../../src/cli/package-skill.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";

// What the maintainers' and the Agent's documents say stays checkable (docs/testing.md): the
// kit's custom properties named in docs/render.md are the stylesheets' (its design defaults state
// the rules and name the token that owns a number), the src/ paths and the .mjs files the documents
// name exist, every link between them reaches a file and, with an anchor, a heading of it, every
// link of a Markdown file of the skill (src/cli/package-skill.mjs SKILL_FILES, in its source skills/gallery/) a file of the skill,
// references/ holds the Agent's references alone, each linked from SKILL.md, the Agent's documents
// (skills/gallery/: SKILL.md, references/, and the default writing preferences the gallery command ships,
// src/shared/writing-preferences.md) name nothing the skill does not hold (the skill and its
// references no src/, npm run or reports/ either: the tools are the gallery command), and
// every unit test file is named in docs/testing.md. It reads files only; what the documents say of behaviour is held by the tests of
// that behaviour (what the Agent's documents show: skill-docs.mjs).

const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");
// The skill's source in the checkout (paths.mjs skillSourceDirectory), whose files the skill holds at
// their paths from it (SKILL.md, references/…, sdk/…): what SKILL_FILES and filesOf name.
const SKILL = "skills/gallery";
const readSkill = (file) => read(`${SKILL}/${file}`);
const walk = (directory, keep) => fs.readdirSync(path.join(projectRoot, directory), { withFileTypes: true }).flatMap((entry) => {
  const relative = `${directory}/${entry.name}`;
  if (entry.isDirectory()) return walk(relative, keep);
  return keep(relative) ? [relative] : [];
});

// The default writing preferences (写作偏好 as the studio ships it): an Agent's document too.
const PREFERENCES = "src/shared/writing-preferences.md";
const documents = [...fs.readdirSync(projectRoot).filter((name) => /^README(\.[\w-]+)?\.md$/.test(name)).sort(), ".github/CONTRIBUTING.md", ".github/SECURITY.md", "THIRD-PARTY-NOTICES.md", `${SKILL}/SKILL.md`, PREFERENCES, ...walk("docs", (file) => file.endsWith(".md")), ...walk(`${SKILL}/references`, (file) => file.endsWith(".md"))];
const problems = [];
// tests/browser is the repository's alone, so what the documents say of the browser harness is
// checked where that folder is, against its files; elsewhere those names are skipped.
const browserHarness = ["fuzz.mjs", "harness.mjs", "kit-diff.mjs", "scenarios.mjs"];
const hasBrowser = fs.existsSync(path.join(projectRoot, "tests/browser"));
const known = [...walk("src", () => true), ...walk("tests", () => true), ...walk("skills", () => true)];
if (hasBrowser) for (const name of browserHarness) if (!known.includes(`tests/browser/${name}`)) problems.push(`tests/browser/${name} is gone: update browserHarness in tests/unit/docs.mjs`);
const directories = new Set(known.flatMap((file) => { const parts = file.split("/"); return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/")); }));

// 1. A custom property docs/render.md names is in the kit's stylesheets, or read by its scripts.
const kitSources = [...walk("src/render/kit", (file) => /\.(css|js|ts)$/.test(file))].map(read).join("\n");
for (const name of new Set(read("docs/render.md").match(/--doc-[a-z0-9-]+/g) ?? [])) {
  // A name ending in a hyphen stands for a family (`--doc-h1-*`): some property of it is defined.
  const held = name.endsWith("-") ? new RegExp(`${name}[a-z0-9][a-z0-9-]*\\s*:`).test(kitSources) : kitSources.includes(name);
  if (!held) problems.push(`docs/render.md names ${name}, which no stylesheet or kit script holds`);
}

// 2. The src/ paths and .mjs files the documents name exist (only paths under the six systems' src/
//    folders and names ending in .mjs are held to the repository; any other name is not).
for (const document of documents) {
  for (const [, token] of read(document).matchAll(/`([^`\n]+)`/g)) {
    const named = token.replace(/^\/__gallery\/edit\//, "");
    if (!hasBrowser && (named.startsWith("tests/browser/") || browserHarness.includes(named))) continue;
    if (/^src\/(cli|editor|render|server|shared|workbench)\//.test(named) && !/[<*>]/.test(named)) {
      const bare = named.replace(/\/$/, "");
      if (!known.includes(bare) && !directories.has(bare)) problems.push(`${document} names ${token}, which is not in the repository`);
    } else if (/^[\w./-]+\.mjs$/.test(named)) {
      if (!known.some((file) => file === named || file.endsWith(`/${named}`))) problems.push(`${document} names ${token}, which is not in the repository`);
    }
  }
}

// 3. A link of one document to another file (not a web address) reaches it, and its anchor, if any,
//    a heading of that file as GitHub names it (lower case, punctuation left out, spaces as hyphens,
//    a repeated heading numbered). Code samples and inline code hold no links.
assert.deepEqual(linksOf("`[a](a.md)` [b](b.md)\n```md\n[c](c.md)\n```\n"), ["b.md"], "a link in code is none");
assert.deepEqual(linksOf([
  '[t](t.md "a title") [s](<s p.md>) ![i](i.png) [w](https://x.org/a_(b)) `` [k](k.md) ` [k2](k2.md) ``',
  "",
  '[r]: r.md "title"',
  "[^1]: a footnote, no link",
  "",
  '<a href="h.md">h</a> <img alt="" src="m.png">',
  "",
  "~~~md",
  "[f](f.md)",
  "```",
  "[g](g.md)",
  "~~~",
  "  ````html",
  "[e](e.md) ```",
  "  ````",
  "[l](l.md)",
].join("\n")), ["t.md", "s p.md", "i.png", "https://x.org/a_(b)", "r.md", "h.md", "m.png", "l.md"], "every form of a link, none in code");
assert.deepEqual(linkTarget("docs/a.md", "../references/s%20p.md?raw=1#top"), { file: "references/s p.md", anchor: "top" }, "a link's file and anchor");
assert.deepEqual(linkTarget("docs/a.md", "#top"), { file: "docs/a.md", anchor: "top" }, "a heading of its own");
assert.equal(linkTarget("docs/a.md", "mailto:a@b.c"), null, "a web address is no file");
const slugOf = (heading) => heading.trim().toLowerCase().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
const anchorsOf = (file) => {
  const counts = new Map();
  return new Set([...withoutSamples(read(file)).matchAll(/^#{1,6} (.+)$/gm)].map(([, heading]) => {
    const slug = slugOf(heading);
    const count = counts.get(slug) ?? 0;
    counts.set(slug, count + 1);
    return count ? `${slug}-${count}` : slug;
  }));
};
for (const document of documents) {
  for (const link of linksOf(read(document))) {
    const target = linkTarget(document, link);
    if (!target) continue;
    const { file, anchor } = target;
    if (!fs.existsSync(path.join(projectRoot, file))) problems.push(`${document} links ${link}, which is not in the repository`);
    else if (anchor && /\.md$/i.test(file) && !anchorsOf(file).has(anchor)) problems.push(`${document} links ${link}, a heading ${file} does not have`);
  }
}

// 4. A Markdown file of the skill (src/cli/package-skill.mjs, which refuses to make one
//    that does not) links only files of the skill: its reader never meets a link to a maintainers'
//    document, a component card or the Component Catalog. A web address is no file; a folder is held by its
//    files.
const linkedIn = {
  "a.md": '[c](b/c.md) [d](b/d/) [x](x.md#h) [w](https://x.org/y.md) [h](#a) [s](b/s%20p.md?raw=1) [t](b/c.md "t")\n\n[r]: y.md\n\n<a href="z.md">z</a>',
  "b/c.md": "[a](../a.md#top) `[x](x.md)`",
  "b/s p.md": "",
  "b/d/e.md": "",
  "B/UP.MD": "[u](u.md)",
};
assert.deepEqual(deadLinks(Object.keys(linkedIn), (file) => linkedIn[file]), ["a.md links x.md#h", "a.md links y.md", "a.md links z.md", "B/UP.MD links u.md"], "what a package does not hold");
for (const line of deadLinks(filesOf(SKILL_FILES), readSkill)) problems.push(`the skill: ${line}, which it does not hold`);

// references/ holds the Agent's references alone, the ones the skill takes by name: a
// component's card is a maintainers' document, in docs/components/ (one added under the old
// references/components/ on a branch that forked before the move goes there when it merges), and
// any other maintainers' document in docs/.
const agentReferences = SKILL_FILES.filter((file) => file.startsWith("references/"));
for (const file of walk(`${SKILL}/references`, () => true).map((file) => file.slice(SKILL.length + 1))) if (!agentReferences.includes(file)) problems.push(`${SKILL}/${file} is in references/, which holds the Agent's references alone (${agentReferences.join(", ")}): a component's card goes in docs/components/, any other maintainers' document in docs/`);
// SKILL.md links each of them, where the Agent finds what it reads.
const skillLinks = new Set(linksOf(readSkill("SKILL.md")).map((link) => linkTarget("SKILL.md", link)?.file));
for (const file of agentReferences) if (!skillLinks.has(file)) problems.push(`SKILL.md does not link ${file}, a reference the skill ships`);

// 5. What a document names in inline code as a document (a file or folder of references/, docs/,
//    sdk/ or skills/, or the Component Catalog's) is there, and its anchor, if any, a heading of it: for the Agent's
//    documents (SKILL.md, references/), a file of the skill, which holds neither docs/ nor
//    the Component Catalog; for the maintainers', a file of the repository (the skill's under skills/gallery/). The Agent's documents write it
//    from the Skill's root, as SKILL.md says paths resolve: a bare Markdown file's name there is one
//    at the root (`SKILL.md`), never a reference's (`writing-html.md`); the maintainers' may name a
//    document by its name alone, or a plan at the root. And the Agent's documents say nothing of what
//    the skill does not hold: no maintainers' reference, card or Component Catalog by name, no hedge on what
//    "your package" has.
const packaged = new Set(filesOf(SKILL_FILES));
const packagedFolders = new Set([...packaged].flatMap((file) => file.split("/").slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join("/"))));
const agentDocument = (document) => document === `${SKILL}/SKILL.md` || document === PREFERENCES || document.startsWith(`${SKILL}/references/`);
const NOT_FOR_AGENTS = [
  [/if your package has|the full package|the minimal package/i, "hedges on what a package has: the Skill is one package"],
  [/quick-reference|visual-design|report-contract|references\/components|component cards?\b|\bdocs\//i, "names a maintainers' document (docs/), which the skill does not hold"],
  [/Component Catalog|component-catalog/, "names the Component Catalog, which the skill does not hold"],
];
// The skill and its references (not 写作偏好, which the command ships) name none of the tools' insides:
// no source file, no npm script, no reports/ folder of the old layout (the tools are the gallery command).
const NOT_IN_SKILL = [
  [/(?<![\w.-])src\//, "names a source file (src/), which the skill does not hold: the tools are the gallery command"],
  [/\bnpm run\b/, "names an npm script (npm run): the commands are gallery's"],
  [/(?<![\w<>.-])reports\//, "names reports/, the old layout: a document is <workspace>/<slug>/"],
];
for (const document of documents.filter((file) => agentDocument(file) && file !== PREFERENCES)) {
  for (const [pattern, what] of NOT_IN_SKILL) {
    const found = pattern.exec(read(document));
    if (found) problems.push(`${document} ${what} ("${found[0]}")`);
  }
}
// The SDK's types, which the skill carries too: their comments name no source file either.
for (const file of [...packaged].filter((name) => name.startsWith("sdk/"))) {
  const found = NOT_IN_SKILL[0][0].exec(readSkill(file));
  if (found) problems.push(`${SKILL}/${file} ${NOT_IN_SKILL[0][1]} ("${found[0]}")`);
}
for (const document of documents.filter(agentDocument)) {
  for (const [pattern, what] of NOT_FOR_AGENTS) {
    const found = pattern.exec(read(document));
    if (found) problems.push(`${document} ${what} ("${found[0]}")`);
  }
}
for (const document of documents) {
  const agent = agentDocument(document);
  for (const [, token] of withoutSamples(read(document)).matchAll(/(?<!`)`([^`\n]+)`(?!`)/g)) {
    if (/[\s<>*…{}]/.test(token)) continue; // a pattern (`reports/<slug>/`), a command, a selector
    const [name, anchor] = token.split("#");
    const bare = name.replace(/\/$/, "");
    if (/^(?:references|docs|sdk|skills)(?:\/|$)|^tests\/fixtures\/component-catalog(?:\/|$)/.test(name)) {
      if (agent && !packaged.has(bare) && !packagedFolders.has(bare)) problems.push(`${document} names ${token}, which the skill does not hold`);
      else if (!agent && !fs.existsSync(path.join(projectRoot, bare))) problems.push(`${document} names ${token}, which is not in the repository`);
      else if (anchor !== undefined && /\.md$/i.test(bare) && !anchorsOf(agent ? `${SKILL}/${bare}` : bare).has(anchor)) problems.push(`${document} names ${token}, a heading ${bare} does not have`);
    } else if (/^[\w./-]+\.md$/i.test(name) && !/^(?:reports|materials)\//.test(name)) {
      if (!agentDocument(document)) {
        if (!documents.some((file) => file === name || file.endsWith(`/${name}`)) && !fs.existsSync(path.join(projectRoot, name))) problems.push(`${document} names ${token}, which is no document of the repository`);
      } else if (!fs.existsSync(path.join(projectRoot, SKILL, name))) problems.push(`${document} names ${token}: write a document of the Skill from its root (references/…)`);
    }
  }
}

// 6. Every unit test file is named in docs/testing.md (run.mjs and the harness are what runs them).
const testing = read("docs/testing.md");
const unitTests = walk("tests/unit", (name) => name.endsWith(".mjs")).filter((file) => path.posix.dirname(file) === "tests/unit");
for (const file of unitTests) {
  const name = path.posix.basename(file);
  if (name === "run.mjs") continue;
  if (!testing.includes(`tests/unit/${name}`) && !testing.includes(`\`${name}\``)) problems.push(`docs/testing.md does not name ${file}`);
}
const run = read("tests/unit/run.mjs");
for (const file of unitTests) {
  const name = path.posix.basename(file);
  if (name === "run.mjs" || name === "page-harness.mjs") continue;
  if (!run.includes(`"./${name}"`)) problems.push(`tests/unit/run.mjs does not run ${file}`);
}

assert.deepEqual(problems, [], problems.join("\n"));
console.log(`Checked documents: ${documents.length} files, the custom properties of docs/render.md, the paths they name, the links between them, the links of the skill to its own files, references/ holding the Agent's references alone, the documents they name in inline code (the Agent's naming only what the skill holds, and no src/, npm run or reports/; the SDK's comments no src/ either), and the unit tests docs/testing.md names.`);
