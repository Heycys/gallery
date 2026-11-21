// Usage: npm run skill:package
// The Gallery skill, thin and apart from the gallery command (docs/internals.md, "Packaging"): the
// Agent's documents (from its source in the checkout, skills/gallery/: SKILL.md, references/writing-html.md, references/charts-and-figures.md,
// references/building-blocks.md, block-script.md, pages-and-data.md, extensions.md, preference-files.md, previews.md and the example, references/example-report.html), the SDK's types (sdk/*.d.ts) and Codex's display metadata
// (agents/openai.yaml); no src/, no package.json: the tools are the npm package @heycys/gallery,
// which SKILL.md's first section has the Agent check for (the version range it needs, and the version
// that made it, which gallery --version compares with its own, written in by this script from
// package.json's version). Made as release/skill/gallery/ and
// release/gallery-skill-<version>.zip (one folder in it, gallery/), with its SHA-256
// (gallery-skill-<version>.zip.sha256) and PACKAGE-MANIFEST.json (what was packaged) beside it; it
// removes only those (and an older skill:package's release/gallery/). The npm package carries the
// same skill (npm run release:build writes it with buildSkill), which gallery skill install writes.
// Refused, before anything is written, while a file is missing, a Markdown file of it links a file it
// does not hold, or an SDK file imports one outside sdk/.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { projectRoot, skillSourceDirectory } from "../shared/paths.mjs";
import { sha256 } from "../shared/files.mjs";
import { createZip } from "../transfer/zip.mjs";
import { scriptArguments, usageFailureText, usageOf } from "./arguments.mjs";
import { RECORD, recordOf } from "./skill-record.mjs";

/**
 * What the skill takes from its source folder (paths.mjs skillSourceDirectory, the checkout's skills/gallery/;
 * a folder: its files), by name, each at the same path in the skill: no other file ships unless it is added here.
 */
export const SKILL_FILES = [
  "SKILL.md",
  "references/writing-html.md",
  "references/charts-and-figures.md",
  "references/building-blocks.md",
  "references/block-script.md",
  "references/pages-and-data.md",
  "references/extensions.md",
  "references/preference-files.md",
  "references/previews.md",
  "references/example-report.html",
  "sdk",
  "agents/openai.yaml",
];

/** The heading of SKILL.md's first section, where the version range of the command it needs stands, and the version that made it. */
export const BOOTSTRAP = "## Before anything: the gallery command";

/**
 * The versions of @heycys/gallery a skill made with Gallery `version` works with: `range`, npm's caret
 * range (`^0.1.0`), and `takes`, what it takes in words ("0.1.0 or a later 0.1.x": below 1.0.0 the
 * minor number is the one that breaks; from 1.0.0 the major).
 */
export function skillRange(version) {
  const [major, minor] = version.split(/[.+-]/).map(Number);
  return { range: `^${version}`, takes: `${version} or a later ${major === 0 ? `0.${minor}` : major}.x` };
}

/**
 * SKILL.md's text with the version range of its bootstrap section (BOOTSTRAP, up to the next section)
 * written for Gallery `version`: every `^x.y.z` there, every "x.y.z or a later … .x", and the version
 * that made it, "This skill is Gallery x.y.z's" (./skill-record.mjs RECORD: gallery --version reads it
 * in an installed skill and says when it is older than itself). The rest of the text is left as it is.
 */
export function withRange(text, version) {
  const start = text.indexOf(`\n${BOOTSTRAP}\n`);
  if (start < 0) throw new Error(`SKILL.md has no section "${BOOTSTRAP}" (the version range of the command stands there)`);
  const next = text.indexOf("\n## ", start + BOOTSTRAP.length + 1);
  const end = next < 0 ? text.length : next;
  const { range, takes } = skillRange(version);
  const section = text.slice(start, end)
    .replace(new RegExp(RECORD.source, "g"), recordOf(version))
    .replace(/\^\d+\.\d+\.\d+(?:-[\w.]+)?/g, range)
    .replace(/\b\d+\.\d+\.\d+(?:-[\w.]+)? or a later \d+(?:\.\d+)?\.x\b/g, takes);
  return text.slice(0, start) + section + text.slice(end);
}

/**
 * Why the skill cannot be made from `source`, its source folder (empty: it can): a file of SKILL_FILES missing, a link of
 * its Markdown files to a file it does not hold, an SDK file importing a file outside sdk/ (the skill
 * holds no source: a type the SDK needs is written in sdk/).
 */
export function skillProblems(source = skillSourceDirectory) {
  const missing = SKILL_FILES.filter((relativePath) => !fs.existsSync(path.join(source, relativePath)));
  if (missing.length) return missing.map((file) => `the skill takes ${file}, which is not there`);
  const files = filesOf(SKILL_FILES, source);
  const read = (file) => fs.readFileSync(path.join(source, file), "utf8");
  const problems = deadLinks(files, read).map((line) => `${line}, which the skill does not hold: link only what it holds`);
  for (const file of files.filter((name) => name.startsWith("sdk/") && name.endsWith(".ts"))) {
    for (const [, imported] of read(file).matchAll(/\bfrom\s+["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g)) {
      if (imported && (!imported.startsWith("./") || imported.includes("/../"))) problems.push(`${file} imports ${imported}, outside sdk/: write the types it needs in sdk/`);
    }
  }
  return problems;
}

/**
 * The skill made in `target` (made afresh: whatever was there goes) from its source folder `source`, for Gallery
 * `version` (package.json's): SKILL_FILES copied, SKILL.md with its version range written in.
 * Throws, writing nothing, when skillProblems finds any. Returns the paths of its files, "/" between
 * their parts, in name order.
 */
export function buildSkill(target, { source = skillSourceDirectory, version = checkoutVersion() } = {}) {
  const problems = skillProblems(source);
  if (problems.length) throw new Error(`The skill cannot be made:\n${problems.map((line) => `  ${line}`).join("\n")}`);
  fs.rmSync(target, { recursive: true, force: true });
  for (const relativePath of filesOf(SKILL_FILES, source)) {
    const destination = path.join(target, relativePath);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    if (relativePath === "SKILL.md") fs.writeFileSync(destination, withRange(fs.readFileSync(path.join(source, relativePath), "utf8"), version));
    else fs.copyFileSync(path.join(source, relativePath), destination);
  }
  return listFiles(target);
}

/** Every file under `directory`, as a path relative to it with "/" between its parts, in name order. */
export function listFiles(directory, prefix = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(path.join(directory, entry.name), relativePath));
    else if (entry.isFile()) files.push(relativePath);
  }
  return files;
}

/** The files a set of paths (SKILL_FILES: files, and folders for all their files) takes from `root` (the skill's source folder); a path not there gives none. */
export function filesOf(paths, root = skillSourceDirectory) {
  return paths.flatMap((relativePath) => {
    const source = path.join(root, relativePath);
    if (!fs.existsSync(source)) return [];
    return fs.statSync(source).isDirectory() ? listFiles(source, relativePath) : [relativePath];
  });
}

/** The version of Gallery in the checkout (its package.json's), which the skill is made for unless another is named. */
function checkoutVersion() {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, "package.json"), "utf8")).version;
}

/**
 * A Markdown text without its code samples: each fenced block (``` or ~~~, the fence indented or not,
 * up to a fence of the same character at least as long, or to the end), its lines left empty. An
 * indented line is not taken for a sample: list items go on in indented lines.
 */
export function withoutSamples(text) {
  let fence = null;
  return text.split("\n").map((line) => {
    const marker = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (marker && marker[1][0] === fence[0] && marker[1].length >= fence.length && !marker[2].trim()) fence = null;
      return "";
    }
    // A run of backticks with a backtick after it on its line is inline code, not a fence.
    if (marker && !(marker[1][0] === "`" && marker[2].includes("`"))) {
      fence = marker[1];
      return "";
    }
    return line;
  }).join("\n");
}

/**
 * The links of a Markdown text to other files or web pages, in the order they stand: inline links
 * (`[a](x.md)`, with a title, or `[a](<x y.md>)`), a reference's definition (`[a]: x.md`), and the
 * `href` of an `<a>` and the `src` of an `<img>` written in the text; none in a code sample or in
 * inline code (a span of any number of backticks).
 */
export function linksOf(text) {
  const prose = withoutSamples(text).replace(/(`+)(?!`)(?:(?!\n[ \t]*\n)[\s\S])*?[^`]\1(?!`)/g, (code) => " ".repeat(code.length));
  const found = [
    ...[...prose.matchAll(/\]\(\s*(?:<([^<>\n]*)>|((?:[^\s()<>]|\([^\s()<>]*\))+))(?:\s+(?:"[^"\n]*"|'[^'\n]*'|\([^()\n]*\)))?\s*\)/g)].map((match) => [match.index, match[1] ?? match[2]]),
    ...[...prose.matchAll(/^ {0,3}\[(?!\^)[^\]\n]+\]:[ \t]*(?:<([^<>\n]*)>|(\S+))/gm)].map((match) => [match.index, match[1] ?? match[2]]),
    ...[...prose.matchAll(/<(?:a|img)\s[^>]*?\b(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi)].map((match) => [match.index, match[1] ?? match[2]]),
  ];
  return found.sort(([a], [b]) => a - b).map(([, target]) => target);
}

/**
 * Where a link of the file `from` (a path from the root, "/" between its parts) leads: `{ file,
 * anchor }`, the file a path from the root (`from` itself for a heading of its own), its query left
 * out and its escapes (`%20`) read; null for a web address or another scheme (`mailto:`).
 */
export function linkTarget(from, link) {
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(link)) return null;
  const [, name, anchor = ""] = /^([^?#]*)(?:\?[^#]*)?(?:#(.*))?$/s.exec(link);
  const decoded = (value) => {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  };
  const file = name ? path.posix.normalize(path.posix.join(path.posix.dirname(from), decoded(name))).replace(/\/$/, "") : from;
  return { file, anchor: decoded(anchor) };
}

/**
 * What a set of files (paths relative to one root) links and does not hold: for each of its Markdown
 * files (`read` gives a file's text), each link to a file or folder (not a web page, not a heading of
 * its own) that is not among them, said as "SKILL.md links references/x.md".
 */
export function deadLinks(files, read) {
  const held = new Set(files);
  const folders = new Set(files.flatMap((file) => file.split("/").slice(0, -1).map((_, index, parts) => parts.slice(0, index + 1).join("/"))));
  const dead = [];
  for (const file of files.filter((name) => /\.md$/i.test(name))) {
    for (const link of linksOf(read(file))) {
      const target = linkTarget(file, link);
      if (!target || target.file === file) continue;
      if (!held.has(target.file) && !folders.has(target.file)) dead.push(`${file} links ${link}`);
    }
  }
  return dead;
}

/**
 * The skill packaged into `releaseDirectory` (release/ of the checkout) from `source`: skill/gallery/ (buildSkill),
 * gallery-skill-<version>.zip of it (one folder in it, gallery/), its .sha256 and PACKAGE-MANIFEST.json.
 * Removes first only what it writes (the skill's folder, the skill's ZIPs of any version, their
 * .sha256, the manifest) and the folder an older skill:package made (gallery/ holding
 * PACKAGE-MANIFEST.json, the whole tools); release:build's npm/ stays. Throws, writing nothing, when
 * skillProblems finds any. Returns { archive (its path), skill (the folder's), files, bytes, zipBytes, sha256, range }.
 */
export function packageSkill(releaseDirectory, { source = skillSourceDirectory, version = checkoutVersion() } = {}) {
  const problems = skillProblems(source);
  if (problems.length) throw new Error(`The skill cannot be made:\n${problems.map((line) => `  ${line}`).join("\n")}`);
  const skillDirectory = path.join(releaseDirectory, "skill", "gallery");
  const archiveName = `gallery-skill-${version}.zip`;
  const archivePath = path.join(releaseDirectory, archiveName);
  fs.rmSync(path.join(releaseDirectory, "skill"), { recursive: true, force: true });
  if (fs.existsSync(path.join(releaseDirectory, "gallery", "PACKAGE-MANIFEST.json"))) fs.rmSync(path.join(releaseDirectory, "gallery"), { recursive: true, force: true });
  for (const name of fs.existsSync(releaseDirectory) ? fs.readdirSync(releaseDirectory) : []) {
    if (/^gallery-skill-.+\.zip(?:\.sha256)?$|^PACKAGE-MANIFEST\.json$/.test(name)) fs.rmSync(path.join(releaseDirectory, name), { force: true });
  }
  const files = buildSkill(skillDirectory, { source, version });

  // The ZIP: one folder, gallery/, the name of the skill's folder where it is installed.
  const entries = files.map((relativePath) => ({ name: `gallery/${relativePath}`, data: fs.readFileSync(path.join(skillDirectory, relativePath)) }));
  const archive = createZip(entries);
  fs.writeFileSync(archivePath, archive);
  const archiveHash = sha256(archive);
  fs.writeFileSync(`${archivePath}.sha256`, `${archiveHash}  ${archiveName}\n`);

  // The manifest says what was packaged, as the folder holds it.
  const { range } = skillRange(version);
  const manifest = {
    name: "gallery",
    version,
    archive: archiveName,
    holds: "The Agent's documents (SKILL.md, references/writing-html.md, references/charts-and-figures.md, references/building-blocks.md, references/block-script.md, references/pages-and-data.md, references/extensions.md, references/preference-files.md, references/previews.md, the example references/example-report.html), the SDK's types (sdk/) and Codex's display metadata (agents/openai.yaml). The tools are the npm package @heycys/gallery, which SKILL.md has the Agent check for and install (with the user's consent); gallery skill install writes this same skill.",
    skillEntrypoint: "SKILL.md",
    requires: `@heycys/gallery@${range}`,
    files: entries.map(({ name, data }) => ({ path: name.slice("gallery/".length), bytes: data.byteLength, sha256: sha256(data) })),
  };
  fs.writeFileSync(path.join(releaseDirectory, "PACKAGE-MANIFEST.json"), `${JSON.stringify(manifest, null, 2)}\n`);
  const bytes = entries.reduce((sum, { data }) => sum + data.byteLength, 0);
  return { archive: archivePath, skill: skillDirectory, files, bytes, zipBytes: archive.byteLength, sha256: archiveHash, range };
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { positional } = await scriptArguments(import.meta.url);
  if (positional.length > 0) {
    console.error(usageFailureText(usageOf(import.meta.url), `Unknown argument: ${positional[0]} (skill:package takes none: there is one skill).`));
    process.exit(2);
  }
  const problems = skillProblems();
  if (problems.length > 0) {
    console.error(`Not packaged:\n${problems.map((line) => `  ${line}`).join("\n")}`);
    process.exit(1);
  }
  const made = packageSkill(path.join(projectRoot, "release"));
  console.log(`Packaged ${made.archive} (${made.files.length} files, ${made.bytes.toLocaleString("en-US")} bytes; the ZIP ${made.zipBytes.toLocaleString("en-US")} bytes), for @heycys/gallery ${made.range}`);
  console.log(`The skill's folder: ${made.skill}`);
  console.log(`SHA-256 ${made.sha256}`);
}
