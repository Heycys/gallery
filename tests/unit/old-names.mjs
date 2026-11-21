import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { JSDOM } from "jsdom";
import { naturalInMemory } from "../../src/cli/natural.mjs";
import { handedInSource, naturalize, shownSource } from "../../src/editor/source.mjs";
import { componentFailures } from "../../src/render/component-checks.mjs";
import { checkReports } from "../../src/render/pipeline.mjs";
import { loadReports } from "../../src/render/reports.mjs";
import { newNames } from "../../src/shared/new-names.mjs";
import { OLD_GLOBALS, OLD_NAMES, kitNamespace, newDomNames } from "../../src/shared/old-names.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { oldNames } from "./fixtures/old-names.mjs";

// The format's old names (report-*, data-report-*, --report-*, Report*: before 2026-10-26) read as
// the new ones (doc-*, data-doc-*, --doc-*, Doc*): src/shared/old-names.mjs and new-names.mjs.

const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");

// ---------- the table: the old set is the kit's names, each standing in the kit now or retired ----------
{
  const kit = ["src", "skills/gallery/sdk", "tests/unit", "tests/browser", "docs"].flatMap(function files(directory) {
    return fs.readdirSync(path.join(projectRoot, directory), { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? (entry.name === "fixtures" ? [] : files(file)) : /\.(mjs|js|css|ts|md)$/.test(entry.name) ? [read(file)] : [];
    });
  }).join("\n");
  // The names of the shared charts, retired with them (2026-10-27): an old report's still read as
  // doc-…, which nothing of the kit's styles or draws any more, and none left in src/ or skills/gallery/sdk/.
  const RETIRED = new Set(["bar", "bar-series", "bar-shares", "legend", "pie-", "pie-center", "pie-labels", "pie-slice", "pie-slices", "plot-clip", "plot-clip-", "reference-legend", "swatch", "tooltip", "tooltip-row"]);
  for (const name of OLD_NAMES) assert.ok(RETIRED.has(name) || kit.includes(`doc-${name}`), `report-${name} was the kit's: doc-${name} is in its code`);
  const code = ["src", "skills/gallery/sdk"].flatMap(function files(directory) {
    return fs.readdirSync(path.join(projectRoot, directory), { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? files(file) : /\.(mjs|js|css|ts)$/.test(entry.name) && !/old-names\.mjs$/.test(entry.name) ? [read(file)] : [];
    });
  }).join("\n");
  for (const name of RETIRED) assert.ok(!new RegExp(`doc-${name}(?![\\w-])`).test(code), `doc-${name} retired with the shared charts: none left in src/ or sdk/`);
  // The SDK's types of the shared charts, retired with them: none left in src/ or skills/gallery/sdk/.
  const RETIRED_TYPES = new Set(["ChartBaseOptions", "ChartHandle", "ChartState", "DotDatum", "PieDatum", "SharedChartOptions", "SharedChartType", "TableChartChoices", "TableChartOptions", "TableChoices", "TableSeriesChoices", "ValueFormat"]);
  for (const name of RETIRED_TYPES) assert.ok(!new RegExp(`\\bDoc${name}\\b`).test(code), `Doc${name} retired with the shared charts: none left in src/ or sdk/`);
  for (const name of OLD_GLOBALS) assert.ok(RETIRED_TYPES.has(name) || kit.includes(`Doc${name}`) || read(`skills/gallery/sdk/index.d.ts`).includes(`Doc${name}`) || fs.readdirSync(path.join(projectRoot, "skills", "gallery", "sdk")).some((file) => read(`skills/gallery/sdk/${file}`).includes(`Doc${name}`)), `Report${name} was the kit's: Doc${name} is`);
  assert.ok(kitNamespace("doc-note") && kitNamespace("report-calout") && !kitNamespace("mine") && !kitNamespace("ge-unit"));
}

// ---------- no old name back in what the studio and the Agent read: src/ and the skill's sdk/, references/, SKILL.md (skills/gallery/) ----------
// Outside comments, an old name stands only in the compatibility (old-names.mjs, new-names.mjs), the
// runtime's alias lines (global.ReportCharts = global.DocCharts), ui.js's report-theme-change told
// beside doc-theme-change, code-grammars.mjs's NAMES_CODE reading ReportCode beside DocCode (a script no
// tool rewrote draws code through code.js's alias, and an export keeps every grammar for it), and a
// family named as one (report-*, data-report-*). The workbench's own
// report-state is its class, no name of the format's (the page never sees it).
{
  const OLD = new RegExp(String.raw`(?<![\w$/-])report-([a-z0-9]+(?:-{1,2}[a-z0-9]+)*-{0,2})(?![\w-])|(?<![\w-])data-report-|(?<![\w-])--report-|\bdataset\??\.report[A-Z]|\bReport(?:${OLD_GLOBALS.join("|")})\b|\bReport Segoe\b`, "g");
  const ALIAS = /^\s*global(?:This)?\.Report\w+ = global(?:This)?\.Doc\w+;/;
  const WORKBENCH_OWN = new Set(["report-state", "report-state-actions"]);
  const uncommented = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
  const files = ["src", "skills/gallery/sdk", "skills/gallery/references"].flatMap(function files(directory) {
    return fs.readdirSync(path.join(projectRoot, directory), { withFileTypes: true }).flatMap((entry) => {
      const file = `${directory}/${entry.name}`;
      if (entry.isDirectory()) return ["fixtures", "node_modules", "vendor"].includes(entry.name) ? [] : files(file);
      return /\.(mjs|js|ts|mts|tsx|css|html|md|json)$/.test(entry.name) ? [file] : [];
    });
  }).concat("skills/gallery/SKILL.md").filter((file) => !/^src\/shared\/(?:old|new)-names\.mjs$/.test(file));
  const found = [];
  for (const file of files) {
    const text = read(file);
    (/\.(md|html|json)$/.test(file) ? text : uncommented(text)).split("\n").forEach((line, index) => {
      if (ALIAS.test(line) || (file === "src/render/kit/ui.js" && line.includes('"doc-theme-change", "report-theme-change"')) || (file === "src/shared/code-grammars.mjs" && line.startsWith("export const NAMES_CODE = "))) return;
      for (const match of line.matchAll(OLD)) {
        if (match[1] !== undefined && !OLD_NAMES.has(match[1])) continue; // a word, a slug: no name of the old set
        if (line[match.index + match[0].length] === "*") continue; // the family named as one
        if (file.startsWith("src/workbench/") && WORKBENCH_OWN.has(match[0])) continue;
        found.push(`${file}:${index + 1}: ${match[0]}`);
      }
    });
  }
  assert.deepEqual(found, [], `old names back in the sources:\n${found.join("\n")}`);
}

// ---------- a page in the old names: what stands for the kit made new, nothing else ----------
const oldPage = `<!doctype html>
<html lang="zh-CN" data-report-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="report-export-id" content="old.v1">
  <title>旧</title>
  <style>
    .report-note, .mine { color: var(--report-muted); font-family: "Report Segoe", sans-serif; }
    main.report-page [data-report-chart="dots"] { animation: report-dialog-in 1s; }
  </style>
</head>
<body>
  <main class="report-page" data-report-id="old">
    <header class="report-header"><div class="report-icon">🎯</div><h1 class="report-title">旧</h1></header>
    <section class="report-section mine report-calout">
      <p class="report-note">来源：<span class="report-text-red">红</span>，看 <code>.report-note</code> 和 report-page。</p>
      <figure class="report-image" style="--report-span: 0.8"><img src="assets/a.png" alt=""><figcaption></figcaption></figure>
      <div data-report-chart="dots" data-report-bind="series"><script type="application/json">{"title": "report-note --report-ink ReportCharts"}</script></div>
      <svg><rect fill="var(--report-series-1)" width="1" height="1"></rect></svg>
      <button type="button" onclick="ReportDialogs.open('d')">开</button>
      <a href="javascript:ReportCharts.get('#c')">图</a>
      <pre><code>&lt;div class="report-callout"&gt;</code></pre>
      <!-- report-callout in a comment -->
      <template><p class="report-note" data-report-show="a:b">模板</p></template>
    </section>
  </main>
  <script data-report-kit="charts">/* the kit's own: ReportCharts, .report-chart */</script>
  <script>
    /** @type {import('../../sdk/report-charts.js').ReportChartsApi} */
    const charts = ReportCharts;
    charts.define("mine", ({ host }) => host.dataset.reportChart);
    document.querySelectorAll(".report-note, [data-report-bind]").forEach((node) => node.classList.add("report-highlight-" + "blue", "report-text-red"));
    addEventListener("report-theme-change", () => ReportTokens.read(document.body));
    // reports/report-2/assets/a.png html-report-studio /__gallery/edit/ x-report-studio-blocks report-frame report-calout
  </script>
</body>
</html>
`;
const newPage = `<!doctype html>
<html lang="zh-CN" data-doc-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="doc-export-id" content="old.v1">
  <title>旧</title>
  <style>
    .doc-note, .mine { color: var(--doc-muted); font-family: "Doc Segoe", sans-serif; }
    main.doc-page [data-doc-chart="dots"] { animation: doc-dialog-in 1s; }
  </style>
</head>
<body>
  <main class="doc-page" data-doc-id="old">
    <header class="doc-header"><div class="doc-icon">🎯</div><h1 class="doc-title">旧</h1></header>
    <section class="doc-section mine report-calout">
      <p class="doc-note">来源：<span class="doc-text-red">红</span>，看 <code>.report-note</code> 和 report-page。</p>
      <figure class="doc-image" style="--doc-span: 0.8"><img src="assets/a.png" alt=""><figcaption></figcaption></figure>
      <div data-doc-chart="dots" data-doc-bind="series"><script type="application/json">{"title": "report-note --report-ink ReportCharts"}</script></div>
      <svg><rect fill="var(--doc-series-1)" width="1" height="1"></rect></svg>
      <button type="button" onclick="DocDialogs.open('d')">开</button>
      <a href="javascript:DocCharts.get('#c')">图</a>
      <pre><code>&lt;div class="report-callout"&gt;</code></pre>
      <!-- report-callout in a comment -->
      <template><p class="doc-note" data-doc-show="a:b">模板</p></template>
    </section>
  </main>
  <script data-doc-kit="charts">/* the kit's own: ReportCharts, .report-chart */</script>
  <script>
    /** @type {import('../../sdk/doc-charts.js').DocChartsApi} */
    const charts = DocCharts;
    charts.define("mine", ({ host }) => host.dataset.docChart);
    document.querySelectorAll(".doc-note, [data-doc-bind]").forEach((node) => node.classList.add("doc-highlight-" + "blue", "doc-text-red"));
    addEventListener("doc-theme-change", () => DocTokens.read(document.body));
    // reports/report-2/assets/a.png html-report-studio /__gallery/edit/ x-report-studio-blocks report-frame report-calout
  </script>
</body>
</html>
`;
{
  assert.equal(newNames(oldPage), newPage, "attributes, classes, a meta's name, style and SVG properties, on* code, javascript: addresses, the page's own style and script; never text, a code sample, a comment, a JSON script, the kit's own text, a slug, what the project is named after or a typo");
  assert.equal(newNames(newPage), newPage, "a second pass changes nothing");
  assert.equal(newNames(newNames(oldPage)), newPage);
  const mixed = oldPage.replace('<p class="report-note">', '<p class="doc-note">').replace("var(--report-muted)", "var(--doc-muted)").replace("ReportTokens", "DocTokens");
  assert.equal(newNames(mixed), newPage, "a file of both, the new names kept");
  const plain = "<!doctype html><main><p>A report-specific note on html-report-studio.</p></main>";
  assert.equal(newNames(plain), plain, "a text of none is given back as it is");
  // A typo of an old name is left as written, and the checks say it as the file writes it.
  const failures = componentFailures(newPage);
  assert.ok(failures.some((failure) => failure.startsWith("class report-calout (line 15) is no class of the kit's (doc-callout?)")), failures.join("\n"));
  assert.ok(!failures.some((failure) => /class (?:doc|report)-(?:section|note|page)\b/.test(failure)), failures.join("\n"));
}

// ---------- an id of the report's spelled as an old name: renamed with all that names it; paths stay ----------
{
  const own = (old) => {
    const name = (n) => (old ? `report-${n}` : `doc-${n}`);
    return `<!doctype html><html><head><style>#${name("flow")} { outline: 3px solid red; } .${name("chart")} { background: url(assets/report-chart.png) } /* .${name("note")} */</style></head><body><main class="${name("page")}">
<div class="mine" id="${name("flow")}" aria-describedby="${name("summary")} mine">a</div><label for="${name("flow")}">l</label>
<a href="#${name("flow")}">to</a><a href="other.html#report-flow">there</a><a href="assets/report-chart.png">file</a><button ${old ? "data-report" : "data-doc"}-dialog-open="#${name("dialog")}">d</button>
<img src="assets/report-chart.png" alt=""><svg><rect fill="url(#${name("chart")})"></rect></svg>
<section id="report-intro"><p class="${name("chart")}">c</p></section>
</main><script>document.getElementById("${name("flow")}").dataset.seen = "1"; img.src = "assets/report-chart.png"; const file = "report-chart.svg", url = "https://example.com/report-chart";
document.querySelector(".${name("chart")}.js-on, #report-intro"); location.hash = "#${name("summary")}";</script></body></html>`;
  };
  assert.equal(newNames(own(true)), own(false), "an id spelled as an old name renamed with its selectors, script strings, for, aria-*, href=\"#…\", a kit attribute's \"#…\" and url(#…); another file's fragment, a path, a file name, an address and another id as written");
  assert.equal(newNames(own(false)), own(false));
  const { window } = new JSDOM('<!doctype html><body><p id="report-summary"><a href="#report-summary">x</a><img src="assets/report-chart.png" alt=""></p></body>');
  newDomNames(window.document.body);
  assert.equal(window.document.body.innerHTML, '<p id="doc-summary"><a href="#doc-summary">x</a><img src="assets/report-chart.png" alt=""></p>', "a paste: ids with what points to them, never a path");
}

// ---------- the tools: naturalize reads the old names as new, silently, and every writer writes them ----------
{
  // The Agent's example in the old names: made the same as the new one, its natural HTML too, the same changes.
  const example = read("skills/gallery/references/example-report.html");
  const old = oldNames(example);
  assert.notEqual(old, example);
  assert.equal(newNames(old), example, "the example in the old names, made new, is the example");
  const [now, then] = [naturalize(example), naturalize(old)];
  assert.equal(then.text, now.text, "naturalized alike");
  assert.deepEqual(then.changes, now.changes, "the same changes: the old names are none");
  assert.equal(shownSource(old).text, shownSource(example).text, "shown alike");
  assert.equal(naturalize(then.text).text, then.text, "once is enough");
  // A file of the kit's markup alone (nothing natural): shown with its names new, no change said.
  const starter = read("src/render/starter/doc.html");
  const shown = shownSource(oldNames(starter));
  assert.deepEqual(shown.changes, [], "no change: renaming says nothing");
  assert.equal(shown.text, starter, "the starter in the old names shown as the starter");
  const handed = handedInSource(oldNames(starter), { next: (() => { let n = 0; return () => `id${n++}`; })() });
  assert.ok(!/report-(?:page|header|title|section)|data-report-/.test(handed.text) && /class="doc-page"/.test(handed.text), "the hand-in writes the new names");
}

// ---------- gallery check reads an old report as its new self ----------
{
  const scratch = await fsp.mkdtemp(path.join(os.tmpdir(), "report-old-names-"));
  try {
    const example = read("skills/gallery/references/example-report.html");
    for (const [slug, html] of [["example-report", example], ["old-example", oldNames(example).replace('data-report-id="example-report"', 'data-report-id="old-example"')]]) {
      await fsp.mkdir(path.join(scratch, slug));
      await fsp.writeFile(path.join(scratch, slug, "report.html"), html);
      await fsp.writeFile(path.join(scratch, slug, "report.json"), JSON.stringify({ title: "块的写法", description: "d", type: "report" }));
    }
    const { reports } = await loadReports(["example-report", "old-example"], { directory: scratch, prepare: naturalInMemory({ say: false }) });
    const failures = checkReports(reports);
    assert.deepEqual(failures.get("old-example"), failures.get("example-report"), "the old file checked as the new one");
    assert.equal(reports[1].html.replace('data-doc-id="old-example"', 'data-doc-id="example-report"'), reports[0].html, "read as the new one");
    assert.ok(!/report-(?:page|title)\b/.test(reports[1].written.split("<main")[1].split(">")[0]), "the file's text for the notes with its names new too");
  } finally {
    await fsp.rm(scratch, { recursive: true, force: true });
  }
}

// ---------- the commands write an old report in the new names: add-block-ids.mjs, gallery export ----------
{
  const data = await fsp.mkdtemp(path.join(os.tmpdir(), "report-old-names-cli-"));
  try {
    const example = read("skills/gallery/references/example-report.html");
    const written = (slug) => fsp.readFile(path.join(data, "reports", slug, "report.html"), "utf8");
    for (const slug of ["ids", "handed"]) {
      await fsp.mkdir(path.join(data, "reports", slug), { recursive: true });
      await fsp.writeFile(path.join(data, "reports", slug, "report.html"), oldNames(example).replace('data-report-id="example-report"', `data-report-id="${slug}"`));
      await fsp.writeFile(path.join(data, "reports", slug, "report.json"), JSON.stringify({ title: "块的写法", description: "d", type: "report" }));
      // The files the example shows.
      await fsp.mkdir(path.join(data, "reports", slug, "assets"));
      await fsp.writeFile(path.join(data, "reports", slug, "assets", "picture.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));
      await fsp.writeFile(path.join(data, "reports", slug, "assets", "data.csv"), "a,b\n1,2\n");
      await fsp.writeFile(path.join(data, "reports", slug, "assets", "embed.html"), "<!doctype html><p>x</p>");
    }
    const run = (command, slug) => spawnSync(process.execPath, [...command, slug], { encoding: "utf8", env: { ...process.env, GALLERY_WORKSPACE: path.join(data, "reports") } });
    const ids = run([path.join(projectRoot, "src", "cli", "add-block-ids.mjs")], "ids");
    assert.equal(ids.status, 0, ids.stdout + ids.stderr);
    assert.match(ids.stdout, /the kit's old names \(report-\*, data-report-\*, --report-\*, Report\*\) written as its new ones/, ids.stdout);
    const exported = run([path.join(projectRoot, "src", "cli", "bin.mjs"), "export"], "handed");
    assert.equal(exported.status, 0, exported.stdout + exported.stderr);
    for (const slug of ["ids", "handed"]) {
      const text = await written(slug);
      assert.ok(text.includes(`<main class="doc-page" data-doc-id="${slug}">`) && !/class="[^"]*\breport-|data-report-|--report-|\bReport(?:Charts|Kit)\b/.test(text), `${slug}: written in the new names`);
    }
    const deliverable = await fsp.readFile(path.join(data, "reports", "exports", "handed.html"), "utf8");
    assert.ok(deliverable.includes('<meta name="doc-export-source"') && deliverable.includes('class="doc-page"'), "the export in the new names");
  } finally {
    await fsp.rm(data, { recursive: true, force: true });
  }
}

// ---------- a paste of a page in the old names ----------
{
  const { window } = new JSDOM('<!doctype html><body><ol class="report-flow" data-report-flow-key="1" style="--report-box-radius: 8px; font-family: &quot;Report Segoe&quot;"><li class="report-highlight-blue mine">甲 report-flow</li></ol></body>');
  newDomNames(window.document.body);
  assert.equal(window.document.body.innerHTML, '<ol class="doc-flow" style="--doc-box-radius: 8px; font-family: &quot;Doc Segoe&quot;" data-doc-flow-key="1"><li class="doc-highlight-blue mine">甲 report-flow</li></ol>');
}

console.log("Checked the kit's old names (report-*, data-report-*, --report-*, Report*: before 2026-10-26): the old set the kit's names, a page made new where they stand (attributes, classes, a meta's name, properties in any attribute, on* code, javascript: addresses, its own style and script) and never in text, code samples, comments, JSON, the kit's own text, slugs or the project's name, a typo left and said as written, twice the same, a mixed file; naturalize, the preview's text, the hand-in and gallery check reading an old report as its new self, add-block-ids.mjs and gallery export writing it in the new names; a pasted old page.");
