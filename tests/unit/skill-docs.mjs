import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import { naturalize, readOnlyTexts } from "../../src/editor/source.mjs";
import { kitTags } from "../../src/render/assets.mjs";
import { tableChartReadings } from "../../src/render/chart-declarations.mjs";
import { layoutNotes } from "../../src/render/layout-notes.mjs";
import { checkReports } from "../../src/render/pipeline.mjs";
import { diagnoseScript } from "../../src/render/typecheck.mjs";
import { withGlance } from "../../src/cli/glance-table.mjs";
import { BOOTSTRAP, buildSkill, skillRange, withRange } from "../../src/cli/package-skill.mjs";
import { recordedVersion, recordOf } from "../../src/cli/skill-record.mjs";
import { NEWER_LINE, SKILL_LINE } from "../../src/cli/updates.mjs";
import { wantsPinyin } from "../../src/cli/component-check.mjs";
import { INSIDE_ALONE, OPEN_IT, TRY_LINES } from "../../src/cli/component-try.mjs";
import { readCatalog, templateProblem } from "../../src/shared/component-catalog.mjs";
import { PAGE_INSIDE_ALONE } from "../../src/cli/page-try.mjs";
import { GALLERYS_MARK, USERS_MARK } from "../../src/cli/page-check.mjs";
import { ALIASES, COMMANDS, USAGE } from "../../src/cli/usage.mjs";
import { jsonIn } from "../../src/shared/json-layout.mjs";
import { rowSet, tableOf } from "../../src/render/kit/runtime/rows.js";
import { BLOCK_TYPES, COMPONENTS, GLANCE } from "../../src/editor/components/registry.mjs";
import { t } from "../../src/shared/i18n/index.mjs";
import { projectRoot, skillSourceDirectory } from "../../src/shared/paths.mjs";

// What the Agent's documents (SKILL.md, references/, and the default writing preferences
// src/shared/writing-preferences.md, which the studio ships as 写作偏好) hold to (docs/testing.md).
// Until 2026-11-13 the default writing preferences were the user's own writing rules (项目报告写作,
// moved there from SKILL.md and content-catalog.md on 2026-10-23, translated into Chinese on
// 2026-10-24), and this test held each of their blocks byte for byte by its SHA-256. On 2026-11-13 the
// user took them out of Gallery (they keep their own copy) and had a short generic default written in
// their place (通用写作), so nothing in the default is frozen any more. And every HTML example
// is markup the tools take as it says: an example
// marked `<!-- you write -->` (the line right before its fence) is natural HTML that one naturalize
// makes the kit's with no note, a second leaving it as it is, and the result passes the checks; one
// marked `<!-- the file holds -->` is the kit's markup as a file keeps it, which naturalize leaves as
// it is and which passes the checks; one marked `<!-- the file then holds -->` is that too, and is
// what the `you write` example before it becomes. Neither leaves text read-only in the preview or a
// layout note, and only what an example becomes shows the markup the tools write for plain HTML (a
// table's wrapper, the header look, a disclosure's label, a formula's wrapper): an Agent copying an
// example would write it by hand. Every HTML example carries one of the marks. The component cards, the
// maintainers' reference in docs/components/ since they left the package, are held the same way. The
// table of writing-html.md's "Blocks at a glance" is the one the components' definitions make (`glance`).

// The skill's files are named as the skill holds them (SKILL.md, references/…, sdk/…, agents/…) and read
// from its source in the checkout (skills/gallery/); any other file from the checkout's root.
const placeOf = (file) => path.join(/^(?:SKILL\.md|references|sdk|agents)(?:\/|$)/.test(file) ? skillSourceDirectory : projectRoot, file);
const read = (file) => fs.readFileSync(placeOf(file), "utf8");
const walk = (directory) => fs.readdirSync(placeOf(directory), { withFileTypes: true }).flatMap((entry) => {
  const relative = `${directory}/${entry.name}`;
  if (entry.isDirectory()) return walk(relative);
  return relative.endsWith(".md") ? [relative] : [];
});

// ---------- sections and items ----------

// A section: its heading's line up to the next heading of its level or above, blank lines at its end
// left out. A list item (a step, a bullet) of a section: its text after the marker, with every line
// Markdown reads as part of it: indented lines (after a blank line too) and lazy continuation lines
// (unindented text right after it that starts no block of its own).
function sectionOf(text, heading) {
  const lines = text.split("\n");
  const start = lines.indexOf(heading);
  if (start < 0) return null;
  let end = lines.findIndex((line, index) => index > start && /^#{1,2} /.test(line));
  if (end < 0) end = lines.length;
  const block = lines.slice(start, end);
  while (block.length && !block.at(-1).trim()) block.pop();
  return { text: block.join("\n"), from: start, to: start + block.length };
}
const MARKER = /^(?:\d+\.|-) /;
const STARTS_BLOCK = /^(?:#{1,6}(?:\s|$)|```|~~~|<!--|>|(?:\d+[.)]|[-*+])(?:\s|$)|\|)/;
function itemOf(text, prefix, { from, to }) {
  const lines = text.split("\n");
  const start = lines.findIndex((line, index) => index >= from && index < to && MARKER.test(line) && line.replace(MARKER, "").startsWith(prefix));
  if (start < 0) return null;
  let end = start + 1;
  for (let index = start + 1; index < lines.length; index++) {
    const line = lines[index];
    if (!line.trim()) continue;
    if (/^\s/.test(line) || (index === end && !STARTS_BLOCK.test(line))) end = index + 1;
    else break;
  }
  const block = [lines[start].replace(MARKER, ""), ...lines.slice(start + 1, end)];
  return { text: block.join("\n"), from: start, to: end };
}

// How the two read Markdown, on lines made for it.
{
  const text = "## A\n\n1. One\n   two\n2. Three\nlazy\n\n   indented after a blank\n3. Four\n- Five\n\n## B\n- Six\n";
  const a = sectionOf(text, "## A");
  assert.equal(itemOf(text, "One", a).text, "One\n   two");
  assert.equal(itemOf(text, "Three", a).text, "Three\nlazy\n\n   indented after a blank");
  assert.equal(itemOf(text, "Four", a).text, "Four");
  assert.equal(itemOf(text, "Five", a).text, "Five");
  assert.equal(itemOf(text, "Six", a), null, "an item of another section");
}

// The default writing preferences (写作偏好): its HTML examples, if it has any, hold as the others do.
const F = "src/shared/writing-preferences.md";

// ---------- examples ----------

const KINDS = { "<!-- you write -->": "written", "<!-- the file holds -->": "held", "<!-- the file then holds -->": "then" };
const NAMES = { written: "you write", held: "the file holds", then: "the file then holds" };
const documents = ["SKILL.md", F, ...walk("references"), ...walk("docs/components")];
const examples = [];
for (const file of documents) {
  const lines = read(file).split("\n");
  for (let index = 0; index < lines.length; index++) {
    if (lines[index] !== "```html") continue;
    const end = lines.indexOf("```", index + 1);
    assert.ok(end > index, `${file}:${index + 1}: an html example is not closed`);
    const mark = lines.slice(0, index).reverse().find((line) => line.trim());
    const kind = KINDS[mark?.trim()] ?? null;
    assert.ok(kind, `${file}:${index + 1}: an html example without its mark: put <!-- you write -->, <!-- the file holds --> or <!-- the file then holds --> on the line before its fence`);
    const before = examples.at(-1);
    const from = kind === "then" ? before : undefined;
    assert.ok(kind !== "then" || (from?.file === file && from.kind === "written"), `${file}:${index + 1}: <!-- the file then holds --> follows no <!-- you write --> example of its document`);
    examples.push({ file, line: index + 1, kind, from, code: lines.slice(index + 1, end).join("\n") });
    index = end;
  }
}

// What the tools write for plain HTML (writing-html.md, "Blocks at a glance", After export): shown
// only as what a `you write` example becomes.
const WRITTEN_BY_TOOLS = [
  ["a table's wrapper", /class="doc-table-wrap"/],
  ["the header look on a header cell", /<th\b[^>]*class="[^"]*doc-bold doc-highlight-gray/],
  ["a disclosure's label", /doc-details-summary-label/],
  ["a formula's wrapper", /doc-math-(?:inline|block)/],
];

// An example as the page a report would be: a whole page as it is, with the kit's tags as the starter
// has them, a fragment in the main of one; beside them, in the report's script, the chart types that
// custom-chart.md and charts-and-figures.md define in their js samples, so that a
// card of a type of the report's own is checked as a report holding its script would be.
const links = kitTags.filter(({ tag }) => tag.startsWith("<link")).map(({ tag }) => tag).join("\n");
const scripts = kitTags.filter(({ tag }) => tag.startsWith("<script")).map(({ tag }) => tag).join("\n");
const SCRIPTED = ["docs/components/custom-chart.md", "references/charts-and-figures.md"];
const customScripts = new Map(SCRIPTED.map((file) => [file, [...read(file).matchAll(/```js\n([\s\S]*?)```/g)].map(([, code]) => code).join("\n")]));
for (const file of SCRIPTED) assert.ok(customScripts.get(file).includes("DocCharts.define("), `${file}: no js sample defines a chart type`);
function pageOf({ file, code }, slug) {
  const script = customScripts.has(file) ? `<script>\n${customScripts.get(file)}\n</script>\n` : "";
  if (/<html[\s>]/i.test(code)) {
    if (code.includes("data-doc-kit=")) return code;
    return code.replace("</head>", `${links}\n</head>`).replace("</body>", `${scripts}\n${script}</body>`);
  }
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>t</title>
${links}
</head>
<body>
<main class="doc-page" data-doc-id="${slug}">
${code}
</main>
${scripts}
${script}</body>
</html>
`;
}
// A fragment's main as markup reads: the white space between tags and its indentation left out.
const mainOf = (html) => html.slice(html.indexOf(">", html.indexOf("<main")) + 1, html.lastIndexOf("</main>"));
const shape = (html) => html.replace(/>\s+</g, "><").replace(/\s+/g, " ").trim();

// ---------- the example report ----------

// references/example-report.html, the page an Agent opens for the markup of a block it writes (SKILL.md, step 3): a
// catalogue of the blocks, every block the studio has once, its words saying what each is and its
// numbers placeholders (no report's subject or voice to imitate). One naturalize makes it the
// kit's with no note, writing no paragraph of loose words and no node of a step written the short
// way (the example writes both as the file holds them), and a second changes nothing; what it
// becomes holds each kind of block below, leaves nothing read-only in the preview and no layout note;
// and it passes the checks as a report with its files (its picture a real one), its script's chart
// type and all, with no note on that script.
const EXAMPLE = "references/example-report.html";
const BLOCKS = [
  ["the header's icon", ".doc-header > .doc-icon"],
  ["the source line", ".doc-header > p.doc-note"],
  ["the opening summary", "section.doc-summary > p > strong"],
  ["a section's divider", "section.doc-section > hr:first-child"],
  ["a heading h2", "section.doc-section > h2"],
  ["a heading h3", "section.doc-section > h3"],
  ["a heading h4", "section.doc-section > h4"],
  ["bold", "p > strong"],
  ["inline code", "p > code"],
  ["a link", 'p > a[href^="https://"]'],
  ["an inline formula", "p > span.doc-math-inline"],
  ["a highlight", "p > span.doc-highlight-yellow"],
  ["a bulleted list", "section.doc-section > ul:not([class])"],
  ["a block of a color", ":is(p, li, h2, h3, h4)[class*=\"doc-highlight-\"], :is(p, li, h2, h3, h4)[class*=\"doc-text-\"]"],
  ["a numbered list with a nested level", "section.doc-section > ol:not([class]) > li > ol"],
  ["a to-do list, an item checked", "ul.doc-todo > li[data-checked]"],
  ["a quote", "blockquote > p"],
  ["a callout", "div.doc-callout"],
  ["a highlight panel with its icon", ".doc-panel > .doc-icon"],
  ["a disclosure", "details.doc-details"],
  ["a scope line", "p.doc-note > span.doc-tab"],
  ["a table with a caption", "p.doc-note + div.doc-table-wrap:not([data-doc-chart-source])"],
  ["a chart from a table", "figure.doc-figure > [data-doc-chart][data-doc-chart-data]"],
  ["a chart from its JSON", "figure.doc-figure > [data-doc-chart]:not([data-doc-chart-data]) > script[type=\"application/json\"]"],
  ["a drawing of the document's own in a card", "figure.doc-figure > div[class]:not([class*=\"doc-\"])"],
  ["a picture with its caption", 'figure.doc-image > img[src^="assets/"] + figcaption'],
  ["a flowchart, a node with an icon", "ol.doc-flow > li > .doc-icon + p > strong"],
  ["Sheet tabs", "section.doc-sheet-shell > div[data-doc-sheet] + div[data-doc-sheet]"],
  ["columns", "div.doc-columns > div.doc-column + div.doc-column"],
  ["a database, its columns and views as JSON, a record a row", "div.doc-database > script[type=\"application/json\"] + table > thead > tr > th[data-column]"],
  ["a code block with a title and a language", "div.doc-code[data-language] > .doc-code-title"],
  ["a formula block", "div.doc-math-block"],
  ["a file and its size", "figure.doc-file > a.doc-file-link[download] > .doc-file-name + .doc-file-size"],
  ["a bookmark", 'figure.doc-bookmark > a.doc-bookmark-card[href^="https://"]'],
  ["an embed of a file of assets/, its height set", "figure.doc-embed.doc-embed--file[style*=\"--doc-embed-height\"] > iframe.doc-embed-frame[sandbox][src^=\"assets/\"]"],
];
// A picture a browser shows (a 1×1 PNG), for the example's own: the others' files are empty.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
function exampleReport(studio) {
  const where = EXAMPLE;
  const page = read(EXAMPLE);
  const slug = /data-doc-id="([a-z0-9-]+)"/.exec(page)?.[1];
  assert.ok(slug, `${where}: no data-doc-id`);
  const directory = path.join(studio, `example-${slug}`);
  fs.mkdirSync(path.join(directory, "assets"), { recursive: true });
  for (const [asset] of page.matchAll(/assets\/[\w.-]+/g)) fs.writeFileSync(path.join(directory, asset), /\.png$/.test(asset) ? PNG : "示例\n");
  const once = naturalize(page);
  for (const { line, rule, note } of once.changes) {
    if (note) problems.push(`${where}: naturalize notes line ${line}, ${rule}: ${note}`);
    else if (rule === "loose words" || rule === "step title") problems.push(`${where}: naturalize makes ${rule} at line ${line}: write it as the file holds it`);
  }
  const twice = naturalize(once.text);
  if (twice.changes.length || twice.text !== once.text) problems.push(`${where}: a second naturalize still changes ${twice.changes.map(({ rule }) => rule).join(", ")}`);
  for (const note of readOnlyTexts(once.text)) problems.push(`${where}: read-only in the preview: ${note}`);
  for (const note of layoutNotes(once.text)) problems.push(`${where}: layout note: ${note}`);
  for (const note of tableChartReadings(once.text).notes) problems.push(`${where}: note: ${note}`);
  const { document } = new JSDOM(once.text).window;
  for (const [name, selector] of BLOCKS) if (!document.querySelector(selector)) problems.push(`${where}: lacks ${name} (${selector})`);
  // The blocks a selector does not tell: a detail card its link opens, a code block's title in
  // words, every chart's type defined in its script, a whole block (outside a figure) its <style> styles.
  const trigger = document.querySelector('a.doc-dialog-trigger[href^="#"]');
  if (!trigger || !document.querySelector(`dialog.doc-dialog${trigger.getAttribute("href")}`)) problems.push(`${where}: holds no detail card a link in the text opens`);
  if (!document.querySelector(".doc-code-title")?.textContent.trim()) problems.push(`${where}: its code block has no title`);
  const script = [...document.querySelectorAll("body > script:not([src])")].map((element) => element.textContent).join("\n");
  const types = [...document.querySelectorAll("[data-doc-chart]:not(ol)")].map((host) => host.getAttribute("data-doc-chart"));
  for (const type of types) if (!script.includes(`DocCharts.define("${type}"`)) problems.push(`${where}: a chart of type "${type}" its script does not define`);
  const style = [...document.querySelectorAll("head > style")].map((element) => element.textContent).join("\n");
  const whole = [...document.querySelectorAll("main [class]:not(figure *)")].some((element) => [...element.classList].some((name) => !name.startsWith("doc-") && style.includes(`.${name}`)));
  if (!whole) problems.push(`${where}: holds no whole block, an element of a class of the document's own outside a figure its <style> styles`);
  return { slug, where, html: once.text, directory, htmlPath: path.join(projectRoot, "reports", "__docs__", `${slug}.html`), metadata: { title: "t", description: "d", type: "t" } };
}

// Each example in a folder of its own, holding an empty file for every assets/<file> it names.
const studio = fs.mkdtempSync(path.join(os.tmpdir(), "skill-docs-"));
const reports = [];
const problems = [];
const made = new Map(); // a `you write` example -> the page one naturalize makes of it
try {
  examples.forEach((example, index) => {
    const where = `${example.file}:${example.line} (${NAMES[example.kind]})`;
    const slug = /data-doc-id="([a-z0-9-]+)"/.exec(example.code)?.[1] ?? `docs-example-${index}`;
    const directory = path.join(studio, slug);
    fs.mkdirSync(path.join(directory, "assets"), { recursive: true });
    for (const [asset] of example.code.matchAll(/assets\/[\w.-]+/g)) fs.writeFileSync(path.join(directory, asset), "");
    const page = pageOf(example, slug);
    const once = naturalize(page);
    let html = page;
    if (example.kind === "written") {
      if (!once.changes.length) problems.push(`${where}: naturalize changes nothing: mark it <!-- the file holds -->`);
      for (const { line, rule, note } of once.changes.filter((change) => change.note)) problems.push(`${where}: naturalize notes line ${line}, ${rule}: ${note}`);
      const twice = naturalize(once.text);
      if (twice.changes.length || twice.text !== once.text) problems.push(`${where}: a second naturalize still changes ${twice.changes.map(({ rule }) => rule).join(", ")}`);
      html = once.text;
      made.set(example, once.text);
    } else {
      if (once.changes.length) problems.push(`${where}: naturalize would rewrite ${once.changes.map(({ rule }) => rule).join(", ")}: the file holds the kit's markup (or mark it <!-- you write -->)`);
      if (example.kind === "then") {
        const becomes = mainOf(made.get(example.from));
        if (shape(becomes) !== shape(example.code)) problems.push(`${where}: the example at line ${example.from.line} becomes, after one naturalize:\n${becomes.trim()}`);
      } else {
        for (const [name, pattern] of WRITTEN_BY_TOOLS) {
          if (pattern.test(example.code)) problems.push(`${where}: shows ${name}, which the export writes for plain HTML: show the plain HTML (<!-- you write -->), and this only as what it becomes (<!-- the file then holds -->)`);
        }
      }
    }
    for (const note of readOnlyTexts(html)) problems.push(`${where}: read-only in the preview: ${note}`);
    for (const note of layoutNotes(html)) problems.push(`${where}: layout note: ${note}`);
    for (const note of tableChartReadings(html).notes) problems.push(`${where}: note: ${note}`);
    reports.push({ slug, where, html, directory, htmlPath: path.join(projectRoot, "reports", "__docs__", `${slug}.html`), metadata: { title: "t", description: "d", type: "t" } });
  });
  reports.push(exampleReport(studio));
  for (const [slug, messages] of checkReports(reports)) {
    const { where } = reports.find((report) => report.slug === slug);
    for (const message of messages) problems.push(`${where}: ${message}`);
  }
  // A type error in an example's script is only a note for a report, but an example an Agent copies
  // holds none.
  for (const { where, scriptNotes } of reports) for (const note of scriptNotes ?? []) problems.push(`${where}: a note on its script: ${note}`);
} finally {
  fs.rmSync(studio, { recursive: true, force: true });
}

assert.deepEqual(problems, [], problems.join("\n"));

// ---------- the command's version range ----------

// SKILL.md's first section (BOOTSTRAP) names the versions of the gallery command it works with:
// npm's caret range of package.json's version, and in words what it takes, and the version that made
// it ("This skill is Gallery x.y.z's", which gallery --version reads in an installed skill and compares
// with its own: src/cli/updates.mjs); the packager writes them (withRange), and the repository's
// SKILL.md says the current ones already, so that the skill made from it, the ZIP's and the npm
// package's alike, says what the checkout says. The version stands in that sentence of the first
// section, not in the front matter, so that the one function writes it with the range and the one
// check here holds both (a field of the front matter would be one more for each agent's reader). Since
// the skill's rewrite of 2026-11-11 the section is short, the decision tree of the install being
// gallery doctor's: it has the Agent ask before it installs anything (unless the user already said to),
// install the range with npm, fall back to npx where that cannot be done, install nothing over a newer
// gallery (this skill is the older one), tell the user in the task of a 技能 / 新版本 line of gallery --version
// with the command it names (the user's of 2026-11-13: told of an update in time, choosing whether to take it;
// doctor, which these lines once sent the Agent to, only said them again), run gallery doctor for a 需要处理
// line and do what its last 下一步 line says, and update nothing without the user's yes.
const { version } = JSON.parse(read("package.json"));
const { range, takes } = skillRange(version);
assert.deepEqual(skillRange("0.1.0"), { range: "^0.1.0", takes: "0.1.0 or a later 0.1.x" });
assert.deepEqual(skillRange("1.2.3"), { range: "^1.2.3", takes: "1.2.3 or a later 1.x" });
const skill = read("SKILL.md");
assert.equal(withRange(skill, version), skill, `SKILL.md's first section does not say ${range} (${takes}) and "${recordOf(version)}": write package.json's version there (npm run skill:package would)`);
const bootstrap = sectionOf(skill, BOOTSTRAP);
assert.ok(bootstrap && bootstrap.from === skill.split("\n").findIndex((line) => /^## /.test(line)), `SKILL.md's first section is "${BOOTSTRAP}"`);
assert.ok(bootstrap.text.includes(recordOf(version)) && recordedVersion(skill) === version, `SKILL.md's first section says ${recordOf(version)}: package.json's version (npm run skill:package would write it)`);
for (const said of [`@heycys/gallery\` ${range}`, takes, "Run `gallery --version`", "ask the user (no need when they already said to install)", `npm i -g @heycys/gallery@${range}`, `npx -y @heycys/gallery@${range} doctor`, "`需要处理：…`", `\`${SKILL_LINE}…\``, "this skill is older than the gallery", `\`${NEWER_LINE}…\``, "tell the user in this task, with the command the line names", "A command printing `需要处理：…`: run `gallery doctor` and do what its last `下一步：` line says", "tell the user once, and update nothing without their yes unless they already said to", "`gallery *`", "`gallery.cmd *`", "Chrome or Edge", "--workspace", "cloud sandbox"]) {
  assert.ok(bootstrap.text.includes(said), `SKILL.md's first section says ${said}`);
}
// A gallery older than the range is installed (after asking, unless the user already said to); a newer
// one is never taken back by an install: this skill is the older one.
assert.ok(bootstrap.text.includes(`older than \`${range}\` takes, ask the user`) && new RegExp(`newer than \`\\${range}\` takes means this skill is the older one: install nothing`).test(bootstrap.text), "an older gallery is installed (asking first); a newer one is left alone, the skill being the older");
assert.ok(!/EACCES|sudo|Set-ExecutionPolicy|nodejs\.org/.test(skill), "the install's decision tree is gallery doctor's, not the skill's");
assert.ok(!/prefer it even when|even when not named/i.test(skill), "the skill is used when the user names it");
// The numbers the skill's rewrite of 2026-11-11 set: SKILL.md within 15 KB, five steps in its workflow, at most ten
// "never", and the reading before a new document within 40 KB: SKILL.md and writing-html.md, the rest
// read when a block or a chart needs it (the example, charts-and-figures.md, the other references).
const bytesOf = (file) => Buffer.byteLength(read(file));
assert.ok(bytesOf("SKILL.md") <= 15_000, `SKILL.md is ${bytesOf("SKILL.md")} bytes: within 15 KB, the Agent's reading before every task`);
assert.ok((skill.match(/never/gi) ?? []).length <= 10, `SKILL.md has ${(skill.match(/never/gi) ?? []).length} "never": at most 10, the rules that need judgment; what a tool checks or fixes is its check's to say`);
{
  const steps = sectionOf(skill, "## Workflow").text.split("\n").filter((line) => /^\d+\. /.test(line));
  assert.deepEqual(steps.map((line) => /^\d+\. \*\*([^*]+)\*\*/.exec(line)?.[1]), ["Read the rules:", "Create it, send the address.", "Write `doc.html`.", "Export and check.", "Hand over"], "the workflow is five steps");
  assert.ok(bytesOf("SKILL.md") + bytesOf("references/writing-html.md") <= 40_000, `the reading before a new document: SKILL.md ${bytesOf("SKILL.md")} + writing-html.md ${bytesOf("references/writing-html.md")} bytes, within 40 KB`);
  assert.ok(skill.includes("(it shows every block once; do not read it through)"), "the example report is opened for the markup of one block, not read through");
}
// The rule on what an Agent may add: a document's own content in doc.html, and a feature the user asks for, small
// as it is, a custom block (found testing the skill with Agents, 2026-11-17: asked for each document's created and edited time,
// every Agent wrote fixed words into one doc.html or stopped, none made a block, as the rule said "only when
// the user clearly wants one to use again"). The check after it: asked who edited a document last, Agents kept
// a stamp each later write had to renew (the facts now say `editedBy`, and a stand-in is no answer); asked for
// a filter, one followed writing-html.md's "controls ... a whole block your script handles"; asked for a table
// of contents, one built its own, as nothing named Gallery's 目录.
const kitRule = skill.split("\n").find((line) => line.startsWith("- A document's words")) ?? "";
for (const said of ["are not yours to change", "A feature the user asks for, however small, is a custom block", "never a script or fixed words in one document", "(a ledger, a checklist, a form: `gallery block new <id> --data`)", "shows what changes by itself", "last edited and by whom", "a reader's control (a filter, a toggle)", "one-off writing, a chart of the document's data or a look is content", "a table of contents is Gallery's 目录", "`gallery block list` first", "`gallery block add <name>`", "[references/building-blocks.md](references/building-blocks.md)", "[references/block-script.md](references/block-script.md)"]) {
  assert.ok(kitRule.includes(said), `SKILL.md's rule on the kit says ${said}`);
}
assert.ok(read("references/writing-html.md").includes("a control a reader uses (a filter, a toggle) a custom block ([SKILL.md](../SKILL.md#output-contract))"), "writing-html.md sends a reader's control to SKILL.md's rule, not to a document's own script");
assert.ok(read("references/pages-and-data.md").includes("What no kind answers, tell the user so rather than keep a stand-in up by hand"), "pages-and-data.md: what the workspace's data cannot answer is said, not faked");
// A package asked for with a document that uses it: the document first, so that the user watches it
// from the start (found testing the skill with Agents, 2026-11-05: every run made the package first, the user left
// with no page for minutes), in SKILL.md's rule and at the head of building-blocks.md's flow.
assert.ok(kitRule.indexOf("make the document first") > kitRule.indexOf("(references/building-blocks.md)"), `SKILL.md's rule on the kit has the document made first: ${kitRule}`);
const flow = sectionOf(read("references/building-blocks.md"), "## The flow");
assert.ok((flow?.text ?? "").split("\n").find((line) => line.trim() && !line.startsWith("#"))?.startsWith("When the user wants a document that uses the block too, the document comes first"), "building-blocks.md's flow starts with the document first");
// What the document says around an instance: how to use the block on the editing page goes in the handoff,
// as its export is read-only (in a test of the skill with Agents, every run restated the block's counts and taught
// the drag in the document).
// How a block is tried in the page: each gesture a reader makes by gallery block try, one command
// a gesture, the line it prints of the write quoted as it prints it of the board's drag
// (tests/unit/component-try.mjs holds that line), its undo, --keep and what an exit 1 asks (found retesting
// the skill with Agents, 2026-11-05: of two runs one drove a Chrome of its own, a hundred lines of it, and the other
// skipped the step as too long, asking for the command); a gesture the command cannot make on the
// Agent's own address by the DevTools protocol, the save waited for by data-ge-save, the file read back
// and one undo (no run of a test of the skill with Agents made a gesture and read the file, and one took the
// workbench's address for the page).
const trying = itemOf(read("references/building-blocks.md"), "Try each gesture a reader makes", flow)?.text ?? "";
for (const said of ["with `gallery block try`, one command for each", "`--drag <selector> --to <selector>`", "`--press <selector>`", "`--key <selector> <key>`", "`--type <selector> <words>`", "`--select <selector> <value>`", "`--then <key>` presses a key after it", "`--steps <file>`: a JSON list of steps", `\`${TRY_LINES.wrote}tasks (-1 +1 of its 8 lines); ${INSIDE_ALONE}\``, "and under it those lines, `-` and `+`: read them", `\`${TRY_LINES.undone}one Ctrl+Z, and the copy of doc.html is as it was (data-block-id aside)\``, `\`${TRY_LINES.readBack}…\``, "`--keep` makes the trial on `doc.html` itself and leaves the write", `\`${TRY_LINES.picture}…\``, "Exit 1 is a problem to fix in the block", "cancels `dragenter` as well as `dragover`", "A gesture the command cannot make"]) {
  assert.ok(trying.includes(said), `building-blocks.md's step on trying a block says ${said}`);
}
// The trial on a scratch copy, doc.html not written and the user's page showing nothing of it (decided
// 2026-11-07); the picture to open, as its line asks (found retesting the skill with Agents, 2026-11-06: no run opened
// after.png); an instance in a slot one of them; the fresh page that reads the write back.
for (const said of ["The command makes the trial on a scratch copy of the document", "`doc.html` is not written and the user's page shows nothing of it", "one in another block's slot is one of them", "names a picture to open when you want to see it", "a fresh page that shows the block otherwise than the page did after the gestures"]) assert.ok(trying.includes(said), `building-blocks.md's step on trying a block says ${said}`);
assert.ok(OPEN_IT.includes("open it when you want to see it"), "the Picture line asks no look, as the guide says");
for (const said of ["`Agent 自用`", "DevTools protocol", "`data-ge-save`", "says `saved` again once the file has it", "Ctrl+Z", "`doc.html` is your copy again", "say plainly in the handoff that you did not try it in the page"]) assert.ok(trying.includes(said), `building-blocks.md's step on trying a block says ${said}`);
// What a try asks beyond its write and its undo: doc.html copied first; a note asking what the check's
// do; a FAIL saying doc.html holds the gesture's write, a trial cut off after it, which is the Agent's
// to put back; exit 3 a trial not seen through that left nothing of the gesture, run again; and that
// each try shows on the user's page too (a review of the try command, 2026-11-05: a server gone as the drag's
// write landed said nothing reached doc.html, which held it, and the skill sent the Agent to run it
// again).
for (const said of ["Copy `doc.html` first", "A `note` line asks what the check's notes ask", "Exit 3 (`UNVERIFIED`) is a trial not seen through, its line saying why", "which every page open on the document shows, the user's too: say so in the handoff"]) assert.ok(trying.includes(said), `building-blocks.md's step on trying a block says ${said}`);
assert.ok(!trying.includes("a try that did not run") && !trying.includes("that write is yours to put back"), `building-blocks.md's step on trying a block sends no one to put back a trial's write the copy took: ${trying}`);
// And how doc.html is the copy again: compared with the ids a save gives taken out, which an undo
// leaves, the trial's steps undone and whatever is left of it taken out with the Agent's Chrome closed,
// and the whole copy written back over nothing the user wrote meanwhile (a review of 2026-11-05: eight
// undos never gave back the copy byte for byte, the section keeping the id the first save gave it, and
// the copy written back took the user's words out, a card on their page and on the Agent's). What to read
// again before that is the Agent's (the user's of 2026-11-13: it said "`doc.html` read again first").
for (const said of ["nothing outside it changed but `data-block-id`", "an undo leaves it", "with every `data-block-id` taken out", "see the part as it was", "but for those ids and what the user changed meanwhile", "take out yourself once your Chrome is closed", "Write the whole copy back only where `doc.html` differs from it in what the trial left alone", "never while a page of yours is open on the document"]) assert.ok(trying.includes(said), `building-blocks.md's step on trying a block says ${said}`);
assert.ok(!trying.includes("or write the copy back") && !trying.includes("see the file as it was"), `building-blocks.md's step on trying a block sends no one to write the copy back over the file: ${trying}`);
// The pictures the check leaves, opened by the overviews first, which hold the three widths of a theme
// (in a test of the skill with Agents, no run opened more than two of six).
const checking = itemOf(read("references/building-blocks.md"), "`gallery block check <id>`", flow)?.text ?? "";
for (const said of ["`overview-light.png` and `overview-dark.png`", "`edit-1024-light.png` and `edit-360-light.png`, as the editing page draws it", "A block that draws nothing more there gives the export's pictures again, and the check says so", "open them when you want to see it, nothing asks you to"]) assert.ok(checking.includes(said), `building-blocks.md's step on the check says ${said}`);
assert.ok(!checking.includes("which an export draws none of"), `building-blocks.md's step on the check says what canEdit() changes, if anything: ${checking}`);
// What a try prints and what its exit codes ask is building-blocks.md's, in the step above (it was a table
// of SKILL.md's until the skill's rewrite of 2026-11-11): the Agent's own address, the exit codes 1, 2 and 3.
for (const said of ["`Agent 自用`", "Exit 1 is a problem to fix in the block", "Exit 2 is a mistake in the command", "Exit 3 (`UNVERIFIED`) is a trial not seen through"]) assert.ok(trying.includes(said), `building-blocks.md's step on trying a block says ${said}`);
// What the commands print is the legend of the fixed words (since the skill's rewrite of 2026-11-11): the lines that ask
// something of the Agent start with 交给用户, 下一步, 问题, 提示 or 需要处理, each saying what to do,
// with the exit codes and --json; the table of every line of every command is gone.
const printed = sectionOf(skill, "## What the commands print")?.text ?? "";
for (const said of ["`交给用户：` or `交给用户（…）：` an address or file for the user: copy it whole into your message", "`下一步：` do it", "`问题：` fails: fix each, run the command again (checks mark each `FAIL`, a pass `OK`)", "`提示：` advice, not a failure", "`需要处理：` something outside the document", "`gallery doctor`", "Exit codes: 0 done, 1 something to fix, 2 a mistake in the command, 3 (and qa's 4) `UNVERIFIED`: not looked at, or in part", "take `--json`", "`gallery help <command> [<subcommand>]`"]) assert.ok(printed.includes(said), `SKILL.md's legend of the fixed words says ${said}`);
assert.ok(!skill.includes("| Line | Means |") && !skill.includes("Not opened yet"), "SKILL.md holds no table of the lines of the commands");
// What to read, and what to read again, is the Agent's (the user's of 2026-11-13: "现在的 agent 自己都会知道该不该读，读什么"):
// no 重读 line and no rule to re-read a file or a part before an edit, in SKILL.md or a reference; the commands
// say what they wrote. A revision reads writing-html.md as its change needs, not whole.
for (const [name, body] of [["SKILL.md", skill], ...fs.readdirSync(placeOf("references")).filter((file) => file.endsWith(".md")).map((file) => [`references/${file}`, read(`references/${file}`)])]) {
  assert.ok(!/重读|re-read|read again first|Re-read/.test(body), `${name} asks no re-read: the Agent decides what to read again`);
}
assert.ok(skill.includes("whole, for a new document") && skill.includes("**What to read:** for words or numbers changed in place, nothing more"), "writing-html.md is read whole for a new document; a revision reads what its change needs");
// Step 4 (the user's of 2026-11-13): qa exports first, so no export of its own before it; the review 写作偏好 may ask
// for comes first, where new documents and revisions both pass, so that one qa checks what it changed; an UNVERIFIED
// line is done as it says, nothing installed; the offline file made after the last edit only when one is handed over.
const step4 = skill.slice(skill.indexOf("4. **Export and check.**"), skill.indexOf("5. **Hand over**"));
assert.ok(step4.includes("First, do the review 写作偏好 asks for, if it asks for one.") && step4.includes("`gallery qa <slug>` exports first whenever `doc.html` changed") && !/gallery export <slug>` writes/.test(step4), `SKILL.md's step 4 has qa export first, the review before it: ${step4}`);
assert.ok(step4.includes("do what its line says, installing nothing and taking no pictures of your own unless the user asks") && !step4.includes("run qa once more"), "an UNVERIFIED line is done as it says, nothing installed");
assert.ok(!skill.includes("Before you hand over, do the review") && !skill.includes("Export again after the last source edit") && !skill.includes("byte-identical"), "no review after qa, no export after every last edit");
// qa: run it, fix each FAIL, run it again; open only the pictures of its 要看的图（N 张）list, one for each place
// flagged, none when none is listed (the user's 2026-11-13: a dozen pictures opened for each change); the words are the
// output's (gallery qa prints 要看的图（N 张）： and 不用看：). No look of the Agent's own at three widths, and no list of
// the pictures opened in the handoff; the handoff gives the address, the offline file only when the user asks for one.
assert.ok(skill.includes("Run `gallery qa <slug>`, fix each `FAIL`") && skill.includes("and run it again until nothing fails") && skill.includes("Its `要看的图（N 张）：` list has a picture of each place it flagged, for when a finding's words are not enough; nothing else needs a look"), "SKILL.md says what to do with qa");
assert.ok(!skill.includes("1024, 736 and 360px") && !skill.includes("the pictures you opened") && !skill.includes("Fix what reads badly though nothing flagged it"), "no pictures of the Agent's own, none named in the handoff");
const handoff = sectionOf(skill, "## Handoff")?.text ?? "";
assert.ok(handoff.includes("the document's address") && handoff.includes("only when they ask for a file to send or keep") && !skill.includes("交给用户（离线文件）"), "the handoff gives the address; the offline file when asked");
assert.ok(skill.includes("a mechanical fix (a number, a typo, a script or a style) needs none") && skill.includes("no address to send yet, it comes with the handoff"), "no preferences read for a mechanical fix, no address before a revision");
// Delete, status, undo and annotations: the user's request lets the Agent do them,
// the Agent does not unasked; nothing deleted by hand, nothing for good unless asked; no gallery open before a revision
// (the server records the version before an outside change itself); the ids the tools cannot keep (an id stays on its
// own element, a deleted id is not reused) are the one place the skill still says it (gallery check holds the rest).
const organizing = sectionOf(skill, "## Organizing documents")?.text ?? "";
for (const said of ["**Delete** with `gallery trash <entry>…`", "the documents under a trashed one move up", "not by removing folders", "`gallery trash restore`", "`gallery trash empty` deletes for good: only when the user explicitly asks", "`gallery duplicate <document>`", "`gallery copy <document> --to <workspace>`", "Reorder, rename or trash pages only when asked"]) assert.ok(organizing.includes(said), `SKILL.md's Organizing documents says ${said}`);
const revising = sectionOf(skill, "## Revising a document")?.text ?? "";
for (const said of ["`gallery status` first", "ask the user to settle them before you change the file", "`gallery notes <slug>` lists them", "`gallery notes done <slug> <id>…`", "`gallery notes remove` only when the user asks", "`gallery revert <slug>`", "`gallery history <slug>`", "`gallery history <slug>`'s `--restore` brings back", "Gallery keeps the version before your change by itself", "(a conflict or unsaved changes come as a `问题：` line)", "an id stays on its own element, not moved from an item or a container onto a paragraph in it", "a deleted id is not reused"]) assert.ok(revising.includes(said), `SKILL.md's Revising a document says ${said}`);
assert.ok(!skill.includes("gallery open <slug> --no-browser"), "no gallery open before a revision: the server keeps the version before an outside change by itself");
const using = itemOf(read("references/building-blocks.md"), "Use it where the user asked", flow)?.text ?? "";
for (const said of ["goes in the handoff and in writing.md, not in the document", "step 6 tries the block there", "`gallery block check <id> --documents`", "It writes no document."]) assert.ok(using.includes(said), `building-blocks.md's step on using a block says ${said}`);
// The instance written before it is tried (found retesting the skill with Agents, 2026-11-06: step 5 tried an instance that only
// step 6 said how to write): writing it is step 5, trying it step 6.
assert.ok(/^5\. Use it where the user asked/m.test(flow?.text ?? "") && /^6\. Try each gesture a reader makes/m.test(flow?.text ?? ""), "building-blocks.md writes the instance at step 5 and tries it at step 6");
// The two examples are made with --script, which the table says (found retesting the skill with Agents, 2026-11-06: the board
// was made without it, its kit.js written by hand).
const twoExamples = sectionOf(read("references/block-script.md"), "### Two examples: a table and a script of data")?.text ?? "";
for (const said of ["make each with `gallery block new <id> --script`", "`gallery block new local/board --script`", "`gallery block new local/scorecard --script`"]) assert.ok(twoExamples.includes(said), `block-script.md's two examples say ${said}`);
// A script that replaces several spans is Node's, which is always there (found testing the skill with Agents, 2026-11-02:
// `python` was Windows' app alias, which ran nothing and said nothing, and the file stayed as it was).
const scriptRule = skill.split("\n").find((line) => line.includes("A script may replace exact spans")) ?? "";
assert.ok(scriptRule.includes("write it for Node (`python` may be a stub)") && scriptRule.includes("each found once") && scriptRule.includes("stopping when a span is missing or repeated"), `SKILL.md's rule on a script that replaces spans names Node: ${scriptRule}`);
// The address sent as a step of its own, right after gallery new and before the references are read
// (left to a sub-item and the output's last line, it came at the end, 6 times of 6: found testing the skill
// with Agents, 2026-10-28); no line asks for text to be sent "as it is". The command's 下一步 line is followed.
const sendAt = skill.indexOf("send that address to the user now, in a message of its own, so that they can open the document while you work");
assert.ok(sendAt > skill.indexOf("2. **Create it, send the address.**") && sendAt < skill.indexOf("3. **Write `doc.html`.**"), "the address sent in step 2, between making and writing");
assert.ok(skill.includes("Follow its `下一步：`"), "SKILL.md says to follow the 下一步 line of gallery new");
// The skill says nothing of how a document is written or what it should be: its tone, structure (an opening
// summary, a skeleton first, sections), length, wording, which block to use more or less, a chart's form,
// emoji, headings, nor that its numbers and conclusions trace back to the materials (the user's word: all
// of it is 写作偏好's, the user's own files). It holds the tool's rules (HTML the kit knows, blocks,
// checks, assets, the trash, status, conflicts) and the order to read 写作偏好 and follow it.
for (const [name, body] of [["SKILL.md", skill], ...["writing-html", "building-blocks", "pages-and-data", "charts-and-figures", "block-script", "previews", "preference-files"].map((each) => [`references/${each}.md`, read(`references/${each}.md`)])]) {
  for (const style of ["polished", "trace back", "traces back", "as rare as", "Draw what the materials call for", "your own inference", "Take numbers and conclusions", "Show each set of values once", "where a reader would want the gist", "It is optional: 写作偏好", "a risk, warning, state or caveat", "where a visual break is useful", "only where the content needs them", "only with when it held", "never at a number picked to fit the data", "not said in a caption or repeated in a table", "when the reader needs it"]) {
    assert.ok(!body.includes(style), `${name} says nothing of writing style or fidelity: ${style}`);
  }
}
for (const [name, body] of [["agents/openai.yaml", read("agents/openai.yaml")], ["the starter", read("src/render/starter/doc.html")]]) {
  assert.ok(!/polished|大纲|口径/.test(body), `${name} says nothing of writing style`);
}
// How a document is written is the Agent's (the user's word): one write or several, a skeleton first or not.
// No order of writing, no step to take at every section, no fixed number of sections is asked, and the
// address is asked for "now", not "before any other step" or "before you read further".
for (const [name, body] of [["SKILL.md", skill], ["references/writing-html.md", read("references/writing-html.md")], ["references/building-blocks.md", read("references/building-blocks.md")], ["references/pages-and-data.md", read("references/pages-and-data.md")]]) {
  assert.ok(!/skeleton|section at a time|section per edit|before any other step|before you read further|before you write any card|watch it grow/i.test(body), `${name} asks for no order of writing`);
}
assert.ok(!/as it is, now|原样/.test(skill), "nothing to forward as it is");
// building-blocks.md's manifest keeps the rule it gives, a Chinese name spelled in pinyin among its
// words (the check's note: a test of the skill with Agents, 2026-11-02, found the example without), and its repeated
// group is parts a manifest holds as they stand; it says what min and max count, that the parts of one
// item are not held to each other, what the user does with an instance in the page (no item of text
// parts added there, one of a data part by the component's own control), and how a block is tried there.
{
  const guide = read("references/building-blocks.md");
  const scriptGuide = read("references/block-script.md");
  const pagesGuide = read("references/pages-and-data.md");
  // The manifest's example first; the repeated group, a manifest's parts alone (pages-and-data.md's Places, cards, settings
  // and needs has a json of its own, read below).
  const jsons = [...guide.matchAll(/```json\n([\s\S]*?)```/g)].map(([, code]) => code);
  const [manifestJson, groupJson] = [jsons[0], jsons.find((code) => code.startsWith('"parts": {'))];
  const manifest = JSON.parse(manifestJson);
  assert.ok(!wantsPinyin(manifest), `building-blocks.md: the example's words spell ${manifest.name.zh} in no pinyin: ${manifest.words}`);
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skill-docs-group-"));
  try {
    const folder = path.join(workspace, "components", ...manifest.id.split("/"));
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "component.json"), JSON.stringify({ ...manifest, ...JSON.parse(`{${groupJson}}`) }));
    const catalog = readCatalog(workspace);
    assert.ok(catalog.packages.has(manifest.id) && Object.values(catalog.packages.get(manifest.id).parts).every((part) => part.min === 3 && part.max === 4), `building-blocks.md: the repeated group is no manifest's parts: ${JSON.stringify([...catalog.problems.values()].map((found) => found.problem))}`);
    // Places, cards, settings and needs: its example is fields a manifest takes, with the settings part it asks for.
    const placed = JSON.parse([...pagesGuide.matchAll(/```json\n([\s\S]*?)```/g)].map(([, code]) => code).find((code) => code.includes('"places"')));
    fs.writeFileSync(path.join(folder, "component.json"), JSON.stringify({ ...manifest, ...placed, parts: { ...manifest.parts, settings: { at: ":scope > script", edit: "data" } } }));
    const read = readCatalog(workspace);
    assert.ok(read.packages.get(manifest.id)?.places.includes("page"), `pages-and-data.md: its example of places, card, settings and needs is no manifest's: ${JSON.stringify([...read.problems.values()].map((found) => found.problem))}`);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
  for (const said of ["A part counts the elements `at` finds in one instance", "does not hold the parts of one item to each other", "In the page the user types words in the text parts", "No item of a repeated group of text parts is added or taken out", "adds, renames or removes one by `context.edit`", "say plainly in the handoff that you did not try it in the page"]) {
    assert.ok(guide.includes(said), `building-blocks.md says ${said}`);
  }
  // The board's drop and the scorecard's press it shows do what the fixtures do, run on their examples:
  // a row moved with the blank before it, a table written a row a line staying so, and the JSON
  // written back as it was laid out, the score's line alone changed (packageKanban, packageScorecard).
  const [, sketch] = scriptGuide.split("The board's drop and the scorecard's press");
  const code = /```js\n([\s\S]*?)```/.exec(sketch)[1];
  const example = (id) => new JSDOM(fs.readFileSync(path.join(projectRoot, "tests", "fixtures", "components", "local", id, "example.html"), "utf8"));
  // A context as the kit gives one (runtime/kernel.js), its parts the elements `parts` names: an edit
  // runs on the part itself, context.rows is the kit's rows.js, and context.editJSON writes by the kit's
  // jsonIn (shared/json-layout.mjs), what it holds unchanged writing nothing.
  const contextOf = (parts) => {
    const edit = (name, change) => (name in parts ? (change(parts[name]), true) : false);
    return {
      edit,
      rows: (name) => (tableOf(parts[name]) ? rowSet(tableOf(parts[name]), (change) => edit(name, (draft) => change(tableOf(draft)))) : null),
      editJSON: (name, change) => edit(name, (script) => {
        const data = JSON.parse(script.textContent);
        const next = change(data) ?? data;
        if (JSON.stringify(next) !== JSON.stringify(JSON.parse(script.textContent))) script.textContent = jsonIn(script.textContent, next);
      }),
    };
  };
  const run = (window, parts, values) => new Function("context", "Node", ...Object.keys(values), code)(contextOf(parts), window.Node, ...Object.values(values));
  const board = example("kanban");
  const body = board.window.document.querySelector("tbody");
  const lines = body.innerHTML.split("\n");
  run(board.window, { tasks: board.window.document.querySelector("table") }, { from: 0, status: "已完成", before: null, option: 0, criterion: 0, score: 0 });
  assert.equal(body.innerHTML, [...lines.slice(0, 1), ...lines.slice(2, -1), lines[1].replace("<td>待办</td>", "<td>已完成</td>"), lines.at(-1)].join("\n"), "building-blocks.md: the board's drop moves the row with its blank");
  const card = example("scorecard");
  const script = card.window.document.querySelector("script");
  const written = script.textContent;
  run(card.window, { scores: script }, { from: 0, status: "", before: null, option: 2, criterion: 2, score: 3 });
  assert.equal(script.textContent, written.replace('"scores": [5, 2, null]', '"scores": [5, 2, 3]'), "building-blocks.md: the scorecard's press writes the JSON as it was laid out");
  // Keeping the layout is a rule, and the JSON it shows is laid out as editJSON writes it, at the start of
  // a line and indented: a press giving a score it has changes nothing, and another changes the line of
  // that score alone (a scorecard of a test of the skill with Agents wrote its criteria on one line, and its first
  // press laid them out anew, 11 lines becoming 17).
  assert.ok(scriptGuide.includes("A write keeps the part as it is laid out"), "block-script.md says a write keeps the part's layout, as a rule");
  const [, laidOut] = /So lay out the JSON[^\n]*\n\n```json\n([\s\S]*?)```/.exec(scriptGuide) ?? [];
  assert.ok(laidOut, "building-blocks.md shows the JSON laid out as editJSON writes it");
  for (const indent of ["", "    "]) {
    const text = `\n${laidOut.trimEnd().split("\n").map((line) => indent + line).join("\n")}\n  `;
    const press = (option, criterion, score) => {
      const { window } = new JSDOM('<script type="application/json"></script>');
      const node = window.document.querySelector("script");
      node.textContent = text;
      run(window, { scores: node }, { from: 0, status: "", before: null, option, criterion, score });
      return node.textContent;
    };
    // What editJSON writes of it as it stands is it (a press that changes nothing writes nothing at all).
    assert.equal(jsonIn(text, JSON.parse(text)), text, `building-blocks.md: its JSON, indented by ${indent.length}, is as editJSON writes it`);
    assert.equal(press(0, 0, 4), text, `building-blocks.md: a press of the score it has writes nothing`);
    const pressed = press(0, 1, 5).split("\n");
    const lines = text.split("\n");
    assert.ok(pressed.length === lines.length && pressed.filter((line, index) => line !== lines[index]).length === 1, `building-blocks.md: a press on its JSON, indented by ${indent.length}, changes one line: ${pressed.join("\n")}`);
  }
  // What the guide says editJSON keeps on one line is what it keeps: each one-line example of the sentence,
  // written as an entry of JSON laid out over lines, comes back from a press as it was but for the score
  // pressed, and a list of objects written on one line comes back spread over lines.
  const layoutSaid = scriptGuide.split("\n").find((line) => line.startsWith("A write keeps the part as it is laid out")) ?? "";
  const kept = [.../\(((?:`[^`]+`(?:, )?)+)\): a list of objects/.exec(layoutSaid)?.[1].matchAll(/`([^`]+)`/g) ?? []].map(([, json]) => json);
  assert.ok(kept.length >= 2 && kept.some((json) => /^\[\[/.test(json)), `building-blocks.md says what editJSON keeps on one line, a list of lists among them: ${layoutSaid}`);
  const pressedOn = (entry) => {
    const text = `\n  {\n    "scale": 5,\n    "kept": ${entry},\n    "options": [\n      { "name": "甲", "scores": [4] }\n    ]\n  }\n  `;
    const { window } = new JSDOM('<script type="application/json"></script>');
    const node = window.document.querySelector("script");
    node.textContent = text;
    run(window, { scores: node }, { from: 0, status: "", before: null, option: 0, criterion: 0, score: 5 });
    return { text, pressed: node.textContent };
  };
  for (const json of kept) {
    const { text, pressed } = pressedOn(json);
    assert.equal(pressed, text.replace('"scores": [4]', '"scores": [5]'), `block-script.md: editJSON keeps ${json} on one line, as the guide says`);
  }
  const { pressed: spread } = pressedOn('[{ "name": "价格" }, { "name": "质量" }]');
  assert.ok(spread.includes('"kept": [\n      { "name": "价格" },\n      { "name": "质量" }\n    ],'), `block-script.md: editJSON spreads a list of objects over lines, as the guide says: ${spread}`);
  // The Writing back sample's example calls the move a drop calls, which keeps the table's layout: run
  // on a body written a row a line, it leaves no line blank and no two rows on one (an example that
  // moved a row its own way tried nothing a reader's drag runs, and the sample's move left a blank).
  const [, backSample] = /## Writing back\n[\s\S]*?```js\n([\s\S]*?)```/.exec(scriptGuide);
  const registered = [];
  const { window: boardWindow } = new JSDOM("<table><thead><tr><th>任务</th></tr></thead><tbody>\n  <tr><td>一</td></tr>\n  <tr><td>二</td></tr>\n  <tr><td>三</td></tr>\n</tbody></table>");
  new Function("DocKit", "Node", backSample)({ component: (definition) => registered.push(definition) }, boardWindow.Node);
  const boardTable = boardWindow.document.querySelector("table");
  assert.ok(/example\(host, context\) \{\s*move\(context, 0, null\);\s*\}/.test(backSample) && registered.length === 1, "block-script.md: the Writing back sample's example calls move");
  registered[0].example(null, contextOf({ tasks: boardTable }));
  const moved = boardTable.tBodies[0].innerHTML.split("\n");
  assert.ok(moved.every((line, index) => line.trim() || index === 0 || index === moved.length - 1) && moved.every((line) => (line.match(/<tr>/g) ?? []).length <= 1) && boardTable.tBodies[0].rows[2].textContent === "一", `block-script.md: the Writing back sample's move keeps a row a line: ${boardTable.tBodies[0].innerHTML}`);
  // Its code passes the check's type check with nothing said, the notes too: what an Agent copies into
  // kit.js (the Writing back sample read tBodies off an HTMLElement). A sketch that registers no
  // component is checked in one's mount, the values it names typed.
  const SKETCH_VALUES = "/** @type {number} */ const from = 0;\n/** @type {string} */ const status = \"\";\n/** @type {number | null} */ const before = null;\n/** @type {number} */ const option = 0;\n/** @type {number} */ const criterion = 0;\n/** @type {number} */ const score = 0;\n";
  for (const [, sample] of [guide, scriptGuide, pagesGuide].flatMap((reference) => [...reference.matchAll(/```js\n([\s\S]*?)```/g)])) {
    const checked = sample.includes("DocKit.component(") ? sample : `${SKETCH_VALUES}DocKit.component({ id: "local/x", mount(host, context) {\n${sample}\n} });\n`;
    assert.deepEqual(diagnoseScript(checked).map(({ line, code: number, message }) => `${line}: TS${number}: ${message}`), [], `building-blocks.md: a js sample the type check has words for:\n${sample}`);
  }
  // kit.js names the SDK's types as they stand, which sdk/doc-kit.d.ts declares for every script: the
  // Script section's sample passes the type check with nothing said, and the type is the SDK's, a field
  // it has not refused (found retesting the skill with Agents, 2026-11-05: one run guessed import("./sdk/doc-kit.js"), a path
  // from no package's folder, another a typedef of Parameters<…> of DocKit.component).
  const [, typed] = /The SDK's types are named as they stand[^\n]*\n\n```js\n([\s\S]*?)```/.exec(scriptGuide) ?? [];
  assert.ok(typed?.includes("/** @param {DocComponentContext} context */"), "block-script.md's Script section shows kit.js naming DocComponentContext");
  const inMount = (sample) => `DocKit.component({ id: "local/x", mount(host, context) {\n${sample}\n} });\n`;
  assert.deepEqual(diagnoseScript(inMount(typed)).map(({ line, code: number, message }) => `${line}: TS${number}: ${message}`), [], "block-script.md: the sample naming the SDK's types type-checks");
  assert.ok(diagnoseScript(inMount(typed.replace("context.part(", "context.parts("))).some(({ refused, message }) => refused && message.includes("DocComponentContext")), "block-script.md: the type it names is the SDK's, a field it has not refused");
  for (const name of ["DocComponentContext", "DocComponentHandle", "DocComponentSignal", "DocComponent"]) {
    assert.ok(new RegExp(`^ {2}type ${name} = import\\("\\./doc-kit\\.js"\\)\\.${name};$`, "m").test(read("sdk/doc-kit.d.ts")), `sdk/doc-kit.d.ts declares ${name} for every script`);
  }
  assert.ok(guide.includes("A block with no script draws nothing of its scripts of data"), "building-blocks.md says what Gallery draws of a script of data as the kit does");
  // How the board hides its table, one way, the fixture's, and what a list a card drops on cancels (in a
  // test of the skill with Agents, three boards guessed a way of their own, one cancelling dragover alone).
  assert.ok(scriptGuide.includes("`table.hidden = true`") && scriptGuide.includes('`"attrs": { ":scope > table": ["hidden"] }`') && scriptGuide.includes("cancels `dragenter` as well as `dragover`"), "block-script.md says how the board hides its table and what a drop list cancels");
  assert.ok(!scriptGuide.includes("data-board-ready"), "block-script.md gives one way to hide the table");
  // What a component cannot fully read: a table left showing, a script of data handed to Gallery by
  // context.fail, which draws it (a scorecard hid its data behind a message of its own).
  const unread = guide.split("\n").find((line) => line.includes("A block that cannot fully read what it finds")) ?? "";
  assert.ok(unread.includes("A table part it leaves showing") && unread.includes("A script of data it hands to Gallery with `context.fail(error)`"), `building-blocks.md ties data a component cannot read to context.fail: ${unread}`);
  // What an export shows of a block with a script, said whole (a handoff said its export showed the
  // table, where the export runs the script read-only).
  assert.ok(sectionOf(guide, "## States")?.text.includes("In an export the block's script runs with `context.canEdit()` false") && scriptGuide.includes("| Where its script does not run |"), "building-blocks.md says what an export shows of a block with a script");
  // Its list of what `on` hears is every signal the SDK has, `owns` beside it, and it says when `source`
  // comes after an edit: once it has returned, never inside it.
  const signals = /export type DocComponentSignal = ([^;]+);/.exec(read("sdk/doc-kit.d.ts"))[1].match(/"[a-z]+"/g).map((name) => name.slice(1, -1));
  const heard = scriptGuide.split("\n").find((line) => line.startsWith("- `on` lists the signals")) ?? "";
  assert.deepEqual(signals.filter((name) => !heard.includes(`\`${name}\``)), [], `building-blocks.md's list of what \`on\` hears names every DocComponentSignal: ${heard}`);
  assert.ok(heard.includes("`owns` (default true)") && scriptGuide.includes("on `source`, which comes once `edit` has returned"), "block-script.md says what owns watches and when source comes");
}
// building-blocks.md opens with which kind of part to choose and with the two hosts side by side, before
// its flow (decided 2026-11-07): a row for each kind of part the catalog takes (text,
// data, none, flow), each saying what a document's editor and a custom page do with it; flow refused on
// a custom page, as the catalog refuses a slot to a block whose places hold page, which takes the other
// three; the hosts' table naming each of context.place's values the SDK has, the card's id the page's
// service writes by, context.size and the layout signal; and no second table of the two places further
// down to drift from them.
{
  const guide = read("references/building-blocks.md");
  const kinds = sectionOf(guide, "## Which kind of part");
  const hosts = sectionOf(guide, "## A document and a custom page");
  const flowAt = sectionOf(guide, "## The flow")?.from ?? -1;
  assert.ok(kinds && hosts && kinds.to <= hosts.from && hosts.to <= flowAt, "building-blocks.md opens with which kind of part, then the two hosts, then its flow");
  const cells = (line) => line.slice(1, -1).split(" | ").map((cell) => cell.trim());
  const rows = kinds.text.split("\n").filter((line) => line.startsWith("| ")).map(cells);
  assert.deepEqual(rows[0], ["What the part holds", "Its kind", "In a document", "On a custom page"], `building-blocks.md's table of the kinds of part has its columns: ${rows[0]}`);
  const byKind = new Map(rows.slice(2).map((row) => [/^`(\w+)`/.exec(row[1])?.[1], row]));
  assert.deepEqual([...byKind.keys()].sort(), ["data", "flow", "none", "text"], `building-blocks.md's table has a row for each kind of part: ${[...byKind.keys()]}`);
  for (const [kind, row] of byKind) assert.ok(row.length === 4 && [row[0], row[2], row[3]].every((cell) => cell.length > 8), `building-blocks.md: the row of ${kind} says what it holds, what a document does with it and what a custom page does: ${row.join(" | ")}`);
  assert.ok(byKind.get("text")[3].startsWith("shown, read-only") && byKind.get("flow")[3].startsWith("not allowed") && /`context\.edit`[^|]*page's service/.test(byKind.get("data")[3]) && byKind.get("none")[3].startsWith("shown"), `building-blocks.md says what a custom page does with each kind: ${rows.map((row) => row.join(" | ")).join("\n")}`);
  const manifest = JSON.parse([...guide.matchAll(/```json\n([\s\S]*?)```/g)][0][1]);
  const PARTS = { text: { at: ":scope > h3", edit: "text" }, data: { at: ":scope > script", edit: "data" }, none: { at: ":scope > div", edit: "none" }, flow: { edit: "flow" } };
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skill-docs-kinds-"));
  try {
    const folder = path.join(workspace, "components", ...manifest.id.split("/"));
    fs.mkdirSync(folder, { recursive: true });
    const loads = (fields) => {
      fs.writeFileSync(path.join(folder, "component.json"), JSON.stringify({ ...manifest, ...fields }));
      return readCatalog(workspace).packages.has(manifest.id);
    };
    for (const kind of byKind.keys()) assert.ok(loads({ parts: { [kind === "data" ? "items" : "body"]: PARTS[kind] } }), `building-blocks.md's kind ${kind} is one a manifest takes`);
    assert.ok(!loads({ parts: { body: { at: ":scope > div", edit: "bogus" } } }), "and one it does not name is none");
    assert.ok(!loads({ places: ["page"], parts: { body: PARTS.flow } }), "a slot on a block whose places hold page is refused, as its row says");
    assert.ok(loads({ places: ["page"], parts: { title: PARTS.text, items: PARTS.data, body: PARTS.none } }), "and text, data and none parts are not");
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
  const places = /readonly place: ([^;]+);/.exec(read("sdk/doc-kit.d.ts"))[1].match(/"[a-z]+"/g);
  assert.ok(places.length === 3 && places.every((place) => hosts.text.includes(`\`${place}\``)), `building-blocks.md's two hosts name each place the SDK has (${places}): ${hosts.text}`);
  for (const said of ["`data-card-id`", "the page's service", "`context.size`", "`layout`", "`null`", "设置…", "添加自定义块"]) assert.ok(hosts.text.includes(said), `building-blocks.md's two hosts say ${said}`);
  assert.ok(!guide.includes("The two places differ") && !guide.includes("| Part | In a document | On a custom page |"), "building-blocks.md sets the two places side by side once");
}
const older = withRange(skill.replaceAll(range, "^0.0.9").replaceAll(takes, "0.0.9 or a later 0.0.x").replaceAll(recordOf(version), recordOf("0.0.9")), version);
assert.equal(older, skill, "withRange writes the range wherever the first section says one");
const built = fs.mkdtempSync(path.join(os.tmpdir(), "skill-docs-built-"));
try {
  const files = buildSkill(path.join(built, "gallery"), { version: "0.7.2" });
  assert.deepEqual(files.filter((file) => !file.startsWith("sdk/")), ["agents/openai.yaml", "references/block-script.md", "references/building-blocks.md", "references/charts-and-figures.md", "references/databases.md", "references/example-report.html", "references/extensions.md", "references/pages-and-data.md", "references/preference-files.md", "references/previews.md", "references/writing-html.md", "SKILL.md"]);
  const packaged = fs.readFileSync(path.join(built, "gallery", "SKILL.md"), "utf8");
  assert.ok(packaged.includes("@heycys/gallery@^0.7.2") && packaged.includes("0.7.2 or a later 0.7.x") && packaged.includes("newer than `^0.7.2` takes") && !packaged.includes(range), "the packaged SKILL.md says the version it was made for");
  assert.equal(recordedVersion(packaged), "0.7.2", "and that it is Gallery 0.7.2's");
  assert.equal(packaged.replaceAll("^0.7.2", range).replaceAll("0.7.2 or a later 0.7.x", takes).replaceAll(recordOf("0.7.2"), recordOf(version)), skill, "and nothing else changed");
} finally {
  fs.rmSync(built, { recursive: true, force: true });
}

// Every --doc-* name writing-html.md gives an Agent is one the kit has (its stylesheets define or
// read it), but the one it names as a guess that names nothing; the fonts and sizes it lists among
// them (found testing the skill with Agents, 2026-10-28: one guessed --doc-mono-font and fell back silently).
{
  const kitCss = fs.readdirSync(path.join(projectRoot, "src/render/kit/styles")).filter((file) => file.endsWith(".css"))
    .map((file) => fs.readFileSync(path.join(projectRoot, "src/render/kit/styles", file), "utf8")).join("\n");
  const writing = read("references/writing-html.md") + read("references/charts-and-figures.md");
  const named = [...new Set(writing.match(/--doc-[a-z0-9]+(?:-[a-z0-9]+)*/g))];
  assert.deepEqual(named.filter((name) => !new RegExp(`${name}(?![\\w-])\\s*[:,)]`).test(kitCss)), ["--doc-mono-font"], "each name writing-html.md gives is the kit's");
  for (const name of ["--doc-font", "--doc-mono", "--doc-code-font", "--doc-small-font-size", "--doc-table-height", "--doc-code-height"]) assert.ok(named.includes(name), `writing-html.md names ${name}`);
  assert.match(read("references/writing-html.md"), /min\(72vh, 720px\)[^\n]*style="--doc-table-height: none"/, "a long table's frame and how to show every row");
  assert.match(read("references/writing-html.md"), /40 lines[^\n]*style="--doc-code-height: none"` on its `<pre>`/, "a code block's frame and how to show every line");
}
// Every --doc-* name building-blocks.md gives a package's style is one the kit's tokens define,
// and it says what text on the accent's fill is (found testing the skill with Agents, 2026-11-05: white on the dark
// theme's light accent, 2.35:1).
{
  const tokens = fs.readFileSync(path.join(projectRoot, "src/render/kit/styles/tokens.css"), "utf8");
  const guide = ["building-blocks", "block-script", "pages-and-data"].map((name) => read(`references/${name}.md`)).join("\n");
  const named = [...new Set(guide.match(/--doc-[a-z0-9]+(?:-[a-z0-9]+)*/g))];
  assert.deepEqual(named.filter((name) => !tokens.includes(`${name}:`)), [], "each --doc-* name building-blocks.md gives is one tokens.css defines");
  assert.ok(named.includes("--doc-accent-soft") && guide.includes("Text on a `--doc-accent` fill is `--doc-bg`, never `#fff`"), "building-blocks.md says the text on an accent's fill");
}

// "Blocks at a glance" (references/writing-html.md): the table between its two marks is what the
// definitions say, each part of a row of a section the file has, naming a block of a menu by what
// the menu calls it, a block of the "/" menu has a part unless it is one of those with no row, a
// type's part names its element, by its tag and class, in what an Agent writes or what the file holds
// after an export, and the rows of no type are there, each by the part of its component. The rest of
// their words are held only by being read, here and in the examples of natural HTML above.
{
  const { text, made } = withGlance();
  assert.equal(text, made, 'skills/gallery/references/writing-html.md: the table of "Blocks at a glance" is not what the components\' definitions say (node src/cli/glance-table.mjs writes it)');
  const sections = read("references/writing-html.md").split("\n").filter((line) => line.startsWith("## ")).map((line) => line.slice(3));
  for (const parts of GLANCE) {
    assert.ok(sections.includes(parts[0].rule), `row ${parts[0].row} of "Blocks at a glance": no section "${parts[0].rule}" in references/writing-html.md`);
    assert.equal(new Set(parts.map((part) => part.rule)).size, 1, `the parts of row ${parts[0].row} of "Blocks at a glance" name one section`);
  }
  const NO_ROW = ["heading1", "heading2", "heading3", "heading4"]; // the headings' one row is their component's own part
  const NO_CLASS_SAID = ["dialog", "math"]; // natural HTML, which the row says as an Agent writes it: `<dialog id="x">`, `<p>\[…\]</p>`
  const NO_TAG_SAID = ["math"];
  for (const [type, spec] of Object.entries(BLOCK_TYPES)) {
    if (spec.glance && spec.label) assert.equal(t(spec.glance.name), spec.label, `${type}: its row of "Blocks at a glance" calls it what its menu row does`);
    if (spec.menu) assert.equal(Boolean(spec.glance), !NO_ROW.includes(type), `${type}: a block of the "/" menu has a row of "Blocks at a glance" (\`glance\`), but those of NO_ROW`);
    if (!spec.glance) continue;
    const said = `${spec.glance.write} ${spec.glance.after ?? ""}`;
    const element = spec.className && !NO_CLASS_SAID.includes(type) ? [`${spec.tag}.${spec.className}`, `<${spec.tag} class="${spec.className}"`] : [`<${spec.tag}`, `${spec.tag}.`];
    if (!NO_TAG_SAID.includes(type)) assert.ok(element.some((name) => said.includes(name)), `${type}: its row of "Blocks at a glance" names its element, one of ${element.join(" ")}`);
  }
  const OWN_PARTS = { heading: ["标题 2–4"], highlight: ["开头概括"], figure: ["图表", "图 (示意图、时间线)"], columns: ["分栏"], math: ["a formula in a line"], widget: ["整体块"] };
  for (const { name, glance } of COMPONENTS) {
    if (OWN_PARTS[name]) assert.deepEqual([glance ?? []].flat().map((part) => part.name), OWN_PARTS[name], `${name}: the parts of "Blocks at a glance" that no type of it stands for`);
  }
}

// Every command the Agent's documents name in code is one the gallery command has (src/cli/usage.mjs:
// its commands and their other names), a subcommand of one that has them among that command's Usage
// lines, and each option the span gives one its usage names: a command an Agent copies runs.
{
  for (const file of ["SKILL.md", ...walk("references")]) {
    for (const [, span] of read(file).matchAll(/`(gallery [^`]+)`/g)) {
      const [, word, rest = ""] = /^gallery (\S+)(?: (.*))?$/.exec(span) ?? [];
      if (!word || !/^[a-z]+$/.test(word)) continue; // gallery *, gallery <command>
      const command = ALIASES[word] ?? word;
      assert.ok(COMMANDS.includes(command) || command === "help", `${file}: \`${span}\` names no command of gallery's`);
      const usage = USAGE[command] ?? "";
      const sub = /^([a-z]+)(?:\s|$)/.exec(rest)?.[1];
      const usageLines = usage.split("\n").filter((line) => /^(?:Usage:)?\s*gallery /.test(line));
      if (sub && usageLines.some((line) => new RegExp(`^(?:Usage:)?\\s*gallery ${command} [a-z]+[ |]`).test(line))) {
        assert.ok(usageLines.some((line) => new RegExp(`^(?:Usage:)?\\s*gallery ${command} (?:[a-z]+\\|)*${sub}(?:[ |]|$)`).test(line)), `${file}: \`${span}\`: gallery ${command} has no ${sub}`);
      }
      for (const [, option] of rest.matchAll(/(?:^|\s)(--[a-z][a-z-]*)/g)) assert.ok(new RegExp(`${option}\\b`).test(usage), `${file}: \`${span}\`: gallery ${command} takes no ${option}`);
    }
  }
}

// pages-and-data.md's Working on a custom page: the flow an Agent follows on a page (in SKILL.md until the skill's rewrite of 2026-11-11), and its
// block for a page, whose example is a manifest and a template a workspace loads, its script passing the
// type check with the other samples.
{
  const pages = sectionOf(read("references/pages-and-data.md"), "## Working on a custom page")?.text ?? "";
  for (const said of ["`gallery page list` and `gallery block list` first", "\"首页\" is `pages/home` (a page as any: the user may rename or trash it). Gallery makes it once, when its server first starts in a workspace (`gallery init` does too), with its own cards", "until then `gallery page list` and the commands of `home` say it is not made yet, and `gallery open --no-browser` makes it", "Extend it with `gallery page add home <block>`, not by writing its `page.html` over whole", "A blank page they made in the sidebar (新建页面, `page-…`, an empty main) is one to write whole", "any HTML, CSS and script of yours", "no 写作偏好 to read for rules", "Send the user the address now, in a message of its own", "the `交给用户（…）：` line of `gallery page new <slug> \"<title>\"`", "and the address again", "`gallery block new <id> --recipe habit`", "`gallery block new <id> --page --data`", "one the user trashed stays away", "it is for a custom page alone, a document's HTML is written as it is", "Every other card keeps its `data-card-id`, its place and its data parts as they are", "`gallery page add <slug> <block>`", "`gallery/static` for a card that only shows what you write", "`places` holding `page`", "`gallery page try <slug> <card id> --press <selector>`", "Then `gallery page check <slug>` until it prints `OK`", "are there to open when you want to see the page", "read its `Changes since …` lines", `but those that end \`${USERS_MARK}\`, the user's own gestures on the page since the last check`, "leave those as they are, and do not put one back", `A line that ends \`${GALLERYS_MARK}\` is the home page's own today or note, there before you came`, "where: the page's title in the sidebar", "no opening summary, no source line", "written for both themes", "Its own scripts are yours too, a board or none"]) {
    assert.ok(pages.includes(said), `pages-and-data.md's Working on a custom page says ${said}`);
  }
  // What the user asks of the Agent on a page (since 2026-11-11): reorder, rename, trash and a card's
  // settings, place and size by command, the switches of 组件列表; none unasked; a block goes online only when asked.
  for (const said of ["`gallery page set <page> --title … --icon …` renames", "`gallery page move <page> --after <page>|--first` reorders", "`gallery trash <page>` trashes", "`gallery page card <page> <card id>`", "`--set k=v`", "`--move x,y`", "`--size w,h`", "`--remove`", "`gallery page reset-cards <page>`", "not yours to do unasked", "`gallery block pack on|off <pack>`", "`gallery block menu on|off <block>`", "`gallery block net on|off <block>`", "only when the user explicitly asks for that block"]) {
    assert.ok(pages.includes(said), `pages-and-data.md's Working on a custom page says ${said}`);
  }
  for (const [, word] of pages.matchAll(/`gallery page ([a-z]+)/g)) assert.ok(["new", "list", "open", "add", "try", "check", "set", "move", "card", "reset"].includes(word), `pages-and-data.md's Working on a custom page names gallery page ${word}`);
  const guide = read("references/building-blocks.md");
  const pagesGuide = read("references/pages-and-data.md");
  const forPage = sectionOf(pagesGuide, "## A block for a custom page")?.text ?? "";
  for (const said of ["`gallery page add <slug> <id>`", "`gallery page try <slug> <card id> <gesture>`", "`nothing else in page.html changed (card ids aside)`", "`gallery page check <slug>`", "a text part, which a page shows read-only", "no slot"]) assert.ok(forPage.includes(said), `pages-and-data.md's block for a custom page says ${said}`);
  assert.ok(forPage.includes(`\`${PAGE_INSIDE_ALONE}\``.replace("`nothing", "`nothing")), "and quotes page try's Wrote line as the command writes it");
  const manifest = JSON.parse(/```json\n([\s\S]*?)```/.exec(forPage)[1]);
  const template = /<!-- the file holds -->\n```html\n([\s\S]*?)```/.exec(forPage)[1];
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "skill-docs-goals-"));
  try {
    const folder = path.join(workspace, "components", "local", "goals");
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "component.json"), JSON.stringify(manifest));
    fs.writeFileSync(path.join(folder, "template.html"), template);
    const found = readCatalog(workspace).packages.get("local/goals");
    assert.ok(found && found.places.join() === "page" && found.settings.length === 1 && templateProblem(found) === null, `pages-and-data.md: the goals card is a block a page takes: ${JSON.stringify([...readCatalog(workspace).problems.values()].map((one) => one.problem))}`);
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

// The Agent's documents are each read whole by one Read (the tool's cap is 25,000 tokens, about 60,000
// characters of these documents): kept under 50,000 so that none is read by halves and an Agent never misses
// what stands at its end. Testing the skill with Agents, 2026-11-09, found building-blocks.md, 82,000 characters, read to
// its line 428, with Going online and Gallery's own blocks after it: it is three references by topic now.
{
  for (const file of ["SKILL.md", ...walk("references")]) {
    const size = [...read(file)].length;
    assert.ok(size <= 50_000, `${file} is ${size} characters, over the 50,000 one Read takes whole with room to spare: split it by topic`);
  }
  // Going online's sample asks the host its needs name, and an Agent is told to curl an address first (the
  // sample's old host, api.frankfurter.app, came to redirect to another, which the policy refuses).
  const online = sectionOf(read("references/pages-and-data.md"), "## Going online")?.text ?? "";
  const [, needed] = /"needs": \["net:([^"]+)"\]/.exec(online) ?? [];
  const [, asked] = /context\.fetch\("https:\/\/([^/"]+)\//.exec(online) ?? [];
  assert.ok(needed && needed === asked, `pages-and-data.md's Going online names in its needs the host its sample asks (${needed}, ${asked})`);
  assert.ok(online.includes("`curl -i` the address you mean to ask") && online.includes("rejects `host`"), "and tells an Agent to curl an address for a redirect before it writes the block");
  // pages-and-data.md's Working on a custom page: a read-only card over the workspace's or the web's data is a block of the Agent's own.
  const own = sectionOf(read("references/pages-and-data.md"), "## Working on a custom page")?.text ?? "";
  assert.ok(own.includes("a read-only card over the workspace's data or the web's that none of Gallery's shows") && own.includes("start from `heatmap` or `weather` with `--recipe`"), "pages-and-data.md says a read-only card over the workspace's or the web's data is a block of the Agent's own");
  // Records seen as a board or a chart are a database; a number over a table is the view of it Gallery ships.
  for (const said of ["多维表格, `div.doc-database`", "`gallery/metric`", "`data-doc-chart-source=\"<key>\"`", "`data-doc-from=\"<key>\"`"]) assert.ok(skill.includes(said), `SKILL.md says ${said}`);
  for (const said of ["`div.doc-database`", "`gallery/metric`", "`table.canEdit()`", "it reads the nearest table above it"]) assert.ok(read("references/pages-and-data.md").includes(said), `pages-and-data.md's A view of a table says ${said}`);
}

const counted = (kind) => examples.filter((example) => example.kind === kind).length;
console.log(`Checked the Agent's documents and the cards' examples: ${counted("written")} examples of natural HTML made the kit's at once with no note (${counted("then")} of them shown as they become), ${counted("held") + counted("then")} of the kit's markup left as they are, and the example report, its ${BLOCKS.length + 4} kinds of block all there, made the kit's with no note, all passing the checks; the table of "Blocks at a glance" as the definitions make it; building-blocks.md's manifest spelling its name in pinyin and its repeated group a manifest's parts; SKILL.md's first section asks for @heycys/gallery ${range} and says it is Gallery ${version}'s, as the skill made from it does, with gallery doctor for what the commands ask to be handled; SKILL.md within 15 KB, five steps, at most ten "never", its legend of the fixed words (交给用户, 下一步, 问题, 提示, 需要处理), no re-read asked in the skill, and the reading before a new document (SKILL.md and writing-html.md) within 40 KB.`);
