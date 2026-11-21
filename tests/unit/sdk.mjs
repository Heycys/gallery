import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chartDeclarationFailures } from "../../src/render/chart-declarations.mjs";
import { checkReports, notesOf } from "../../src/render/pipeline.mjs";
import { diagnoseReports, typecheckReports } from "../../src/render/typecheck.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";

const cases = [
  ['valid', 'const chart = DocCharts.get("#chart"); if (chart) { chart.redraw([1, 2]); chart.redraw(); chart.destroy(); }', false],
  ['callback', 'const chart = DocCharts.get("#chart"); chart.redraw();', true],
  ['state-value', 'DocState.create({id: "test", version: 1, defaults: {memo: ""}}).set("memo", 1);', true],
  ['table-state', 'DocTables.setState("#table", {sort: {column: "score", direction: "up"}});', true],
  ['sheets', 'const area = DocSheets.get("#sheets"); if (area) area.set(area.get());', false],
  ['removed-sheets', 'DocSheets.mount("#sheets", {state: DocState.create({id: "s", version: 1, defaults: {sheet: "a"}})});', true],
  ['removed-code', 'DocCode.DiffView("#diff", {lines: []});', true],
  ['dialogs', 'DocDialogs.open("#card"); DocDialogs.close("#card", "done");', false],
  ['removed-tables', 'DocTables.enhanceAll();', true],
  ['removed-dialogs', 'DocDialogs.enhance("#card");', true],
  ['global-access', 'window.DocCharts.get("#chart"); globalThis.DocState.create({id:"g", version:1, defaults:{memo:""}});', false],
  ['column-widths', 'const layout = DocTables.allocateColumnWidths([{key:"a", header:"A", cells:[1,null,"text"]}], {totalWidth:300}); layout[0].ratio.toFixed(2); DocTables.layout("#table");', false],
  ['column-widths-invalid', 'DocTables.allocateColumnWidths([{key:"a", header:"A", cells:[{}]}], {totalWidth:300});', true],
  ['syntax', 'const data = ;', true],
  ['define', 'DocCharts.define("strip", ({host, data, tokens, width, height}) => { host.append(`${width + (height ?? 0)} ${tokens.muted} ${data}`); }); const drawn = DocCharts.get("#x");', false],
  ['define-part', 'DocCharts.define("ticker", { mount({host, signal, width}) { const timer = setInterval(() => host.append(String(width)), 1000); signal.addEventListener("abort", () => clearInterval(timer)); return { update({width}) { host.dataset.width = String(width); } }; } });', false],
  ['define-callback', 'DocCharts.define("strip", ({width}) => width.toUpperCase());', true],
  // A chart drawn from a table: its data typed by DocTableRows (no import), a value a number, its words or null.
  // (JSDoc types the declaration it stands right before, on a line of its own.)
  ['table-rows', 'DocCharts.define("lollipop", ({host, data}) => {\n  /** @type {DocTableRows} */\n  const rows = data;\n  const [name, value] = rows.columns; host.textContent = rows.map((row) => `${row[name]}: ${row[value]}`).join(", "); const v = rows[0]?.[value]; if (typeof v === "number") host.dataset.first = v.toFixed(1); });', false],
  ['table-rows-value', 'DocCharts.define("lollipop", ({host, data}) => {\n  /** @type {DocTableRows} */\n  const rows = data;\n  host.dataset.first = rows[0][rows.columns[1]].toFixed(1); });', true],
  ['validate-gone', 'DocCharts.validate("area", {});', true],
  // A component of a package, as its kit.js writes one.
  ['component', 'DocKit.component({ id: "local/board", on: ["source", "resize", "editable"], example(host, context) { context.edit("tasks", (part) => { part.textContent = ""; }); }, mount(host, context) { const table = context.part("tasks"); const state = context.state({ version: 1, defaults: { filter: "" } }); host.title = state.get("filter") + (table?.textContent ?? ""); if (context.canEdit()) context.edit("tasks", (part) => part.remove()); return { update(reason, detail, options) { host.title = `${reason} ${options?.quiet}`; }, destroy() {} }; }, dehydrate(host) { host.title = ""; } });', false],
  ['component-async', 'DocKit.component({ id: "local/later", async mount(host) { await document.fonts.ready; return { update() { host.title = "x"; } }; } });', false],
  ['component-signal', 'DocKit.component({ id: "local/board", on: ["clicked"], mount() {} });', true],
  ['component-context', 'DocKit.component({ id: "local/board", mount(host, context) { context.write("tasks"); } });', true],
  // What a context holds since 2026-11-07, and the kit's two gestures, as a kit.js writes them with no cast.
  ['component-members', 'DocKit.component({ id: "local/board", on: ["source", "clock", "data", "layout"], mount(host, context) { const data = context.readJSON("scores"); host.title = String(data?.scale ?? ""); context.editJSON("scores", (draft) => { draft.scale = 5; }); const rows = context.rows("tasks"); if (rows) { const first = rows.rows[0]; host.title = rows.columns.join() + String(first?.values[rows.columns[0]] ?? "") + first?.links.map(({ slug, block }) => slug + (block ?? "")).join(); rows.add({ [rows.columns[0]]: "x" }, { after: first }); if (first) { rows.move(first, { after: rows.rows[1], values: { [rows.columns[1]]: "done" } }); rows.remove(first); first.el.cells[0].focus(); } } const id = context.interval(() => {}, 1000) + context.timeout(() => {}, 10); host.dataset.id = String(id); context.listen(window, "keydown", (event) => { host.title = event.key; }); context.listen(host, "pointerdown", (event) => { host.title = String(event.clientX); }, { capture: true }); host.dataset.place = context.place; host.dataset.width = String(context.size?.width ?? 0); const field = document.createElement("input"); const typed = DocKit.input(field, { commit: (value) => { host.title = value; }, signal: context.signal }); typed.set(typed.value); const drag = DocKit.drag(host, { items: "li", marker: null, signal: context.signal, enabled: () => context.canEdit(), over: (x, y, item) => ({ into: host, before: item, at: x + y }), drop: (item, spot) => { host.title = item.id + spot.at; } }); drag.cancel(); return { update(reason, detail) { if (reason === "clock") host.title = String(detail); } }; } });', false],
  ['component-place', 'DocKit.component({ id: "local/board", mount(host, context) { if (context.place === "paper") host.title = ""; } });', true],
  // DocKit.choose (the kit's menu of choices, 2026-11-09): a menu from a button of the block's own, answered with the value or null.
  ['choose', 'DocKit.component({ id: "local/pick", mount(host, context) { const button = document.createElement("button"); host.append(button); button.addEventListener("click", async () => { const value = await DocKit.choose(button, { options: [["a", "Alpha"], { value: "b", label: "Beta", disabled: true }, { group: "More" }, "c"], value: "a", label: "Pick", signal: context.signal }); if (value !== null) host.title = value.toUpperCase(); }, { signal: context.signal }); } });', false],
  ['choose-needs-options', 'DocKit.choose(document.body, {});', true],
  ['choose-answer-may-be-null', 'DocKit.choose(document.body, { options: ["a"] }).then((value) => value.toUpperCase());', true],
  ['component-rows-shape', 'DocKit.component({ id: "local/board", mount(host, context) { context.rows("tasks")?.move(context.rows("tasks").rows[0], { first: true }); } });', true],
];
const diffJson = '"path": "a.ts", "lines": [{"type": "added", "content": "x", "lineNumber": 1}]';
const diffs = [
  ['diff', '{"path": "a.ts", "lines": [{"type": "added", "content": "x", "lineNumber": 1}]}', false],
  ['diff-wrong-line', '{"lines": [{"type": "inserted", "content": "x"}]}', true],
];
const reports = cases.map(([name, code]) => ({htmlPath: path.join(projectRoot, `reports/__check__/${name}.html`), html: `<html>\n<script type="application/json">{"description":"Ignored JSON"}</script>\n<script>\n${code}\n</script></html>`}));
reports.push({htmlPath: path.join(projectRoot, 'reports/__check__/html-parser.html'), html: '<!-- <script>const broken = ;</script> --><script type="module">const separate = 1;</script><script type="module">const separate = 2;</script><script type="application/json">{"x":1}</script>'});
for (const [name, options] of diffs) reports.push({htmlPath: path.join(projectRoot, `reports/__check__/${name}.html`), html: `<html>\n<div class="doc-diff">\n<script type="application/json">${options}</script>\n</div>\n</html>`});
// A start tag broken over lines: the call goes on the nearest line above with room (a diff's always
// has one: its type, application/json, is longer than the call).
reports.push({htmlPath: path.join(projectRoot, 'reports/__check__/declared-split.html'), html: `<html>\n<figure>\n<div class="doc-diff"><script\ntype="application/json">{${diffJson}, "colouredLineNumbers": true}</script></div>\n</figure>\n</html>`});
const diagnostics = typecheckReports(reports);
assert.ok(diagnostics.some((error) => error.includes('declared-split.html:') && error.includes('colouredLineNumbers')), diagnostics.join("\n"));
assert.equal(diagnostics.some((error) => error.includes(`${path.sep}html-parser.html:`)), false, diagnostics.join("\n"));
for (const [name, , shouldFail] of cases) {
  assert.equal(diagnostics.some((error) => error.includes(`${path.sep}${name}.html:`)), shouldFail, `${name}: ${diagnostics.join("\n")}`);
}
for (const [name, , shouldFail] of diffs) {
  assert.equal(diagnostics.some((error) => error.includes(`${path.sep}${name}.html:`)), shouldFail, `${name}: ${diagnostics.join("\n")}`);
}
assert.ok(diagnostics.some((error) => error.includes('callback.html:4:')), 'Diagnostics must use HTML line numbers');
assert.ok(diagnostics.some((error) => error.includes('diff-wrong-line.html:3:') && error.includes('inserted')), 'and so must those of declared diffs');

// Scripts are read as a page is (one parse5 tree, render/report-tree.mjs): what a <template> holds is inert and
// what a <noscript> holds is text, so neither is checked, a script in an <svg> is; the lines and columns are
// the HTML's with LF, CRLF and a BOM alike.
{
  const page = '<html>\n<template><script>inert.nothere();</script></template>\n<noscript><script>text.here();</script></noscript>\n<svg><script>drawn.here();</script></svg>\n<script>const n: number = 1;</script>\n</html>';
  for (const [name, html] of [['lf', page], ['crlf', page.replace(/\n/g, '\r\n')], ['bom', '﻿' + page]]) {
    assert.deepEqual(typecheckReports([{htmlPath: path.join(projectRoot, `reports/__check__/scripts-${name}.html`), html}]), [
      `${path.join(projectRoot, "reports", "__check__", `scripts-${name}.html`)}:4:14 TS2304: Cannot find name 'drawn'.`,
      `${path.join(projectRoot, "reports", "__check__", `scripts-${name}.html`)}:5:18 TS8010: Type annotations can only be used in TypeScript files.`,
    ], name);
  }
}

// What gallery check makes of them: TypeScript's word on a type alone in a report's own script is a
// note (typeOnly), never a failure: a drawing of the Agent's own, plain browser JavaScript, runs as
// written; a syntax error, TypeScript's syntax in a JS file, a name nothing defines, and what a
// declared diff's options say stay failures.
{
  const typed = new Map(diagnoseReports(reports).filter(({ htmlPath }) => htmlPath).map(({ htmlPath, typeOnly }) => [path.basename(htmlPath, ".html"), typeOnly]));
  for (const [name, note] of [["callback", true], ["state-value", true], ["define-callback", true], ["table-rows-value", true], ["syntax", false], ["diff-wrong-line", false]]) assert.equal(typed.get(name), note, name);
  const parsed = diagnoseReports([{ htmlPath: path.join(projectRoot, "reports/__check__/scripts-x.html"), html: '<html>\n<script>drawn.here();\nconst n: number = 1;</script>\n</html>' }]);
  assert.deepEqual(parsed.map(({ text, typeOnly }) => [text.match(/TS\d+/)[0], typeOnly]), [["TS2304", false], ["TS8010", false]], "a name nothing defines, TypeScript's syntax: failures");
  // What the checker, not the parser, says of code a browser refuses or throws on: an `await` in a
  // function that is not async, a const declared again by a second classic script (one global
  // scope), a const used before its declaration. Failures too.
  const refused = diagnoseReports([
    { htmlPath: path.join(projectRoot, "reports/__check__/await-sync.html"), html: "<html>\n<script>function later() { await Promise.resolve(1); }</script>\n</html>" },
    { htmlPath: path.join(projectRoot, "reports/__check__/twice.html"), html: "<html>\n<script>const data = 1;</script>\n<script>const data = 2;</script>\n</html>" },
    { htmlPath: path.join(projectRoot, "reports/__check__/early.html"), html: "<html>\n<script>console.log(early);\nconst early = 1;</script>\n</html>" },
  ]).filter(({ htmlPath }) => htmlPath);
  const failing = (code) => refused.find(({ text }) => text.includes(` TS${code}: `))?.typeOnly === false;
  for (const code of [1308, 2451, 2448]) assert.ok(failing(code), `TS${code}: ${refused.map(({ text, typeOnly }) => `${typeOnly} ${text}`).join("\n")}`);
  // Its "used before being assigned" beside it stays a type's (the browser reads undefined there).
  assert.equal(refused.find(({ text }) => text.includes(" TS2454: "))?.typeOnly, true);
  const htmlPath = path.join(projectRoot, "reports/__check__/drawn.html");
  const drawing = [
    '<html><main data-doc-id="drawn"><div id="c"></div></main>',
    "<script>",
    'const box = document.querySelector("#c");',
    'box.setAttribute("width", 300);',
    "const rows = [{ v: 1 }, { v: 2 }];",
    "const first = rows.find((row) => row.v > 1);",
    "box.textContent = String(first.v);",
    "</script></html>",
  ].join("\n");
  const report = { slug: "drawn", htmlPath, html: drawing, metadata: {}, directory: path.dirname(htmlPath) };
  const messages = checkReports([report]).get("drawn") ?? [];
  assert.ok(!messages.some((message) => /TS\d+/.test(message)), messages.join("\n"));
  assert.deepEqual(report.scriptNotes.map((note) => note.match(/^line (\d+): (TS\d+) in the document's script \(column \d+\): /)?.slice(1).join(" ")), ["4 TS18047", "4 TS2345", "7 TS18047", "7 TS18048"], report.scriptNotes.join("\n"));
  assert.ok(report.scriptNotes.every((note) => note.endsWith("(strict TypeScript's word on a type: a note, not a failure; the browser runs the script as written: guard the value where it can really be null or of another type)")));
  assert.ok(notesOf(report).includes(report.scriptNotes[0]), "printed among the document's notes");
  // d3.min and d3.max over a drawing's untyped data (found testing the skill with Agents, 2026-10-26): a note on their line
  // (or naming d3's NumberValue) says the fix is a type (JSDoc), not a guard; given one, those notes go.
  const ranged = (typed) => [
    '<html><main data-doc-id="ranged"></main>',
    "<script>",
    'DocCharts.define("window-range", ({ host, data, width }) => {',
    typed ? "  /** @type {{ rows: Array<{ label: string, lo: number, hi: number }> }} */ const chart = data;" : "  const chart = data;",
    "  const values = chart.rows.flatMap((row) => [row.lo, row.hi]);",
    "  const x = d3.scaleLinear([(d3.min(values) ?? 0) - 0.002, (d3.max(values) ?? 0) + 0.002], [0, width]);",
    "  host.textContent = String(x(0));",
    "});",
    "</script></html>",
  ].join("\n");
  const untyped = { slug: "ranged", htmlPath: path.join(projectRoot, "reports/__check__/ranged.html"), html: ranged(false), metadata: {} };
  checkReports([untyped]);
  assert.ok(untyped.scriptNotes.length > 0 && untyped.scriptNotes.every((note) => note.startsWith("line 6: ") && note.endsWith("; here d3 reads values of no type as strings: give the data its shape once with JSDoc, /** @type {Array<{ label: string, value: number }>} */ const rows = data;, and d3.min or d3.max may give undefined (?? 0))")), untyped.scriptNotes.join("\n"));
  const typedRange = { ...untyped, html: ranged(true) };
  checkReports([typedRange]);
  assert.deepEqual(typedRange.scriptNotes, [], "a type, and the notes go");
}

// The SDK declares no chart of its own: a chart is of a type the report defines (DocCharts.define), its
// data its JSON or its table's rows (DocTableRows), its handle redraw and destroy.
{
  const sdk = fs.readFileSync(path.join(projectRoot, "skills/gallery/sdk/doc-charts.d.ts"), "utf8");
  assert.ok(!/BarChart|LineChart|PieChart|DotChart|DocShared|__declaredChart|__tableChart|validate\(|setState|hiddenKeys|legend|tooltip/i.test(sdk), "no shared chart's word in sdk/doc-charts.d.ts");
  assert.match(sdk, /export interface DocTableRows extends Array<DocTableRow> \{\s+columns: string\[\];/);
}

// A diff's lines get the kit's own check too, which the types cannot say (single-line content).
{
  const diff = (lines) => `<div class="doc-diff doc-x">\n<script type="application/json">{"lines": ${lines}}</script></div>`;
  assert.deepEqual(chartDeclarationFailures(diff('[{"type": "added", "content": "x", "lineNumber": 1}]')), [], "a diff that passes");
  assert.deepEqual(chartDeclarationFailures(diff('[{"type": "added", "content": "a\\nb"}]')), ['.doc-diff (line 1): diff: each line needs a valid type and single-line content.'], "content over two lines");
  assert.deepEqual(chartDeclarationFailures(diff('[{"type": "added", "content": "x", "lineNumber": 0}]')), ['.doc-diff (line 1): diff: lineNumber must be a positive integer.']);
  assert.deepEqual(chartDeclarationFailures('<div class="doc-diff"><script type="application/json">{"lines": "x"}</script></div>'), ['.doc-diff (line 1): diff: lines must be an array.'], "no name of a removed call (DiffView) in what it says");
  assert.match(chartDeclarationFailures('<div class="doc-diff"><script type="application/json">{</script></div>')[0], /^\.doc-diff \(line 1\): its options are not valid JSON/);
}
// A chart type of the report's own: defined, it passes; defined with a name the kit refuses (camelCase),
// the check says the name rule, not that the script does not define it.
{
  const own = (name) => `<div data-doc-chart="${name}"><script type="application/json">[]</script></div>\n<script>DocCharts.define("${name}", ({ host }) => { host.textContent = "x"; });</script>`;
  assert.deepEqual(chartDeclarationFailures(own("ci-plot")), []);
  assert.deepEqual(chartDeclarationFailures(own("ciPlot")), ['data-doc-chart="ciPlot" (line 1): the document\'s script defines "ciPlot" with DocCharts.define, which refuses that name: a chart type\'s name is lowercase letters, digits and hyphens, a letter first ("interval", "ci-plot"); rename it in both places']);
}

console.log(`Checked SDK compiler regressions: ${cases.length} valid/invalid inline-script cases (the removed calls refused; a chart's handle redraw and destroy; a chart drawn from a table typed by DocTableRows, a value of it a number, words or null), ${diffs.length + 1} declared diffs (one with its start tag broken over lines); no shared chart in the SDK; a type's word alone in a document's own script a note (one of d3.min or d3.max over untyped data saying to give it a type), a syntax error (the checker's grammar errors among them), an undefined name, a name declared twice or used before its declaration and a declaration's options failures.`);
