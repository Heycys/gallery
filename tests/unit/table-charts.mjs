import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import katex from "katex";
import { parse } from "parse5";
import { naturalize } from "../../src/editor/source.mjs";
import { chartDeclarationFailures, chartDeclarationNotes, tableCells, tableChartReadings } from "../../src/render/chart-declarations.mjs";
import { componentFailures } from "../../src/render/component-checks.mjs";
import { loadKitFile } from "../../src/render/kit-build.mjs";
import { layoutNotes } from "../../src/render/layout-notes.mjs";
import { notesOf } from "../../src/render/pipeline.mjs";
import { loadReports } from "../../src/render/reports.mjs";
import { walk } from "../../src/shared/html-tree.mjs";
import { cellValue, nextChartKey, rowsReading, tableRows } from "../../src/shared/table-chart.mjs";

// Charts drawn from a table (src/shared/table-chart.mjs; docs/render.md, "Charts from a table"): the
// rows a table gives a chart of the report's own type (tableRows: d3.csvParse's shape, an object a
// body row keyed by the header's words, data.columns those words in order; each value read as the
// table's sort reads it: a number, its words, null; the header a first row of <th> or, with none,
// the first row; <tfoot> left out; merged cells nothing), the checks of such a chart (its type
// defined, no JSON, its table there once, merged cells; no word of the shared charts there were), the
// notes (no title, a header naming no column or one twice) and the line of what it reads of its
// table, and the kit drawing one in the page: from its table's rows, again when a cell, a row or its
// key changes, as it was after a reader's sort, standing while its table reads as nothing for a
// moment, the card's line and layout note once its table has gone (at once when nothing stood), drawn
// again when it comes back; a part told the new rows; redraw() reading its table again and refusing
// data. The intake is tests/unit/natural.mjs's, a copied pair's keys tests/unit/commit.mjs's.

const page = (body, script = "") => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>t</title></head><body>
<main class="doc-page" data-doc-id="t">
${body}
</main>
${script}</body></html>
`;
// A table of the file read for a chart (the checks' reading, tableCells, as the kit's in the page).
const cellsOf = (table) => {
  let found = null;
  walk(parse(page(table)), (node) => { if (node.tagName === "table" && !found) found = node; });
  return tableCells(found);
};
const rowsOf = (table) => tableRows(cellsOf(table));
// The rows as plain data (an array with its columns, as JSON drops them).
const plain = ({ data }) => ({ rows: data.map((row) => ({ ...row })), columns: data.columns });

// ---------- the rows a table gives a chart ----------
{
  assert.equal(nextChartKey(new Set(["t1", "t3"])), "t2", "the first key not taken");
  // Each value as the table's sort reads it: a number its words write (a unit, a scale, a qualifier,
  // grouping, an accountant's negative), its sort value first when it has one, null for none (an
  // empty cell, a dash, n/a), its words otherwise (a range, two numbers, words).
  const read = rowsOf(`<table><thead><tr><th>组</th><th>值</th></tr></thead><tbody>
    <tr><td>甲</td><td>12.5%</td></tr><tr><td>乙</td><td>3.6亿</td></tr><tr><td>丙</td><td>1,234</td></tr><tr><td>丁</td><td>(12)</td></tr>
    <tr><td>戊</td><td>约 20</td></tr><tr><td>己</td><td>120 ms</td></tr><tr><td>庚</td><td data-sort-value="30">约三成</td></tr><tr><td>辛</td><td></td></tr>
    <tr><td>壬</td><td>—</td></tr><tr><td>癸</td><td>n/a</td></tr><tr><td>子</td><td>3–5 天</td></tr><tr><td>丑</td><td>3 / 4</td></tr><tr><td>寅</td><td>待定</td></tr>
  </tbody></table>`);
  assert.deepEqual(plain(read), {
    columns: ["组", "值"],
    rows: [
      { 组: "甲", 值: 12.5 }, { 组: "乙", 值: 360000000 }, { 组: "丙", 值: 1234 }, { 组: "丁", 值: -12 },
      { 组: "戊", 值: 20 }, { 组: "己", 值: 120 }, { 组: "庚", 值: 30 }, { 组: "辛", 值: null },
      { 组: "壬", 值: null }, { 组: "癸", 值: null }, { 组: "子", 值: "3–5 天" }, { 组: "丑", 值: "3 / 4" }, { 组: "寅", 值: "待定" },
    ],
  });
  assert.ok(Array.isArray(read.data) && Object.hasOwn(read.data, "columns"), "an array with its columns, as d3.csvParse gives");
  // A column its header says holds words or dates: its words, numbers or not.
  assert.deepEqual(plain(rowsOf('<table><tr><th>年</th><th data-sort-type="text">编号</th><th data-sort-type="date">日期</th><th data-sort-type="number">值</th></tr><tr><td>2024</td><td>101</td><td>2024-05-01</td><td>7</td></tr></table>')).rows,
    [{ 年: 2024, 编号: "101", 日期: "2024-05-01", 值: 7 }], "a first row of <th> is the header; text and date columns keep their words");
  assert.deepEqual([cellValue({ words: "12", sort: null }, "text"), cellValue({ words: "", sort: "5" }), cellValue(undefined)], ["12", 5, null]);
  // A formula's TeX, the editor's zero-width pads none; a header's words as the checks read them.
  assert.deepEqual(plain(rowsOf(String.raw`<table><thead><tr><th>拟合 \(R^2\)</th><th>值</th></tr></thead><tbody><tr><td>\(x_1\)</td><td>0.9</td></tr></tbody></table>`)), { columns: ["拟合 R^2", "值"], rows: [{ "拟合 R^2": "x_1", 值: 0.9 }] });
  // <tfoot> left out, a total in the body a row like the others; a row shorter than the header null
  // where it has no cell, cells past the header not read.
  const footed = rowsOf("<table><thead><tr><th>组</th><th>值</th></tr></thead><tbody><tr><td>甲</td><td>1</td></tr><tr><td>合计</td><td>1</td></tr><tr><td>乙</td></tr><tr><td>丙</td><td>2</td><td>多</td></tr></tbody><tfoot><tr><td>注</td><td>9</td></tr></tfoot></table>");
  assert.deepEqual(plain(footed).rows, [{ 组: "甲", 值: 1 }, { 组: "合计", 值: 1 }, { 组: "乙", 值: null }, { 组: "丙", 值: 2 }]);
  // No header row: the first row is the header, as csvParse takes it. A header cell with no words is
  // the key ""; of two alike, the later column's value kept (both in columns).
  assert.deepEqual(plain(rowsOf("<table><tr><td>组</td><td>值</td></tr><tr><td>甲</td><td>4</td></tr></table>")), { columns: ["组", "值"], rows: [{ 组: "甲", 值: 4 }] });
  const pivot = rowsOf("<table><thead><tr><th></th><th>值</th><th>值</th></tr></thead><tbody><tr><td>甲</td><td>1</td><td>2</td></tr></tbody></table>");
  assert.deepEqual(plain(pivot), { columns: ["", "值", "值"], rows: [{ "": "甲", 值: 2 }] });
  assert.deepEqual(plain(rowsOf("<table></table>")), { columns: [], rows: [] }, "a table of nothing: no rows");
  // Merged cells: nothing, by the kit's word "merged-cells".
  assert.deepEqual(rowsOf('<table><tr><th>组</th><th>值</th></tr><tr><td rowspan="2">甲</td><td>1</td></tr><tr><td>2</td></tr></table>'), { error: "has merged cells: write each value in its own cell, the category on every row", message: ["merged-cells"] });
  assert.ok(rowsOf('<table><tr><th colspan="2">组</th></tr><tr><td>甲</td><td>1</td></tr></table>').error, "in the header too");
  // What the checks say of it (rowsReading): per column how many numbers, words, nulls; a blank or
  // repeated header word; <tfoot> rows and rows past the header.
  const table = cellsOf("<table><thead><tr><th>组</th><th>值</th></tr></thead><tbody><tr><td>甲</td><td>1</td></tr><tr><td>乙</td><td></td><td>x</td></tr></tbody><tfoot><tr><td>注</td></tr></tfoot></table>");
  assert.deepEqual(rowsReading(table, tableRows(table).data), { rows: 2, columns: [{ name: "组", numbers: 0, words: 2, empty: 0 }, { name: "值", numbers: 1, words: 0, empty: 1 }], blank: false, twice: [], foot: 1, extra: 1 });
  const pivoted = cellsOf("<table><thead><tr><th></th><th>值</th><th>值</th></tr></thead><tbody><tr><td>甲</td><td>1</td><td>2</td></tr></tbody></table>");
  assert.deepEqual(rowsReading(pivoted, tableRows(pivoted).data), { rows: 1, columns: [{ name: "", numbers: 0, words: 1, empty: 0 }, { name: "值", numbers: 1, words: 0, empty: 0 }], blank: true, twice: ["值"], foot: 0, extra: 0 });
}

// ---------- the checks ----------
{
  const DEFINE = '<script>DocCharts.define("dots", ({ host, data }) => { host.textContent = String(data.length); });</script>\n';
  const checked = (body, script = DEFINE) => {
    // As gallery check reads it: the file as the intake makes it in memory, the file's text beside it.
    const file = page(body, script);
    const { text } = naturalize(file);
    return { failures: chartDeclarationFailures(text), notes: chartDeclarationNotes(text, { written: file }), readings: tableChartReadings(text), text };
  };
  const table = (rows = "<tr><td>甲</td><td>12</td></tr><tr><td>乙</td><td>7</td></tr>", type = "dots") => `<table data-doc-chart="${type}"><caption>得分</caption><tr><th>组</th><th>得分</th></tr>${rows}</table>`;
  const ok = checked(table());
  assert.deepEqual([ok.failures, ok.notes], [[], []], "a table's chart of a type the script defines passes, its host holding no JSON");
  assert.ok(/<figure class="doc-figure"><h3>得分<\/h3><div data-doc-chart="dots" data-doc-chart-data="t1"><\/div><\/figure>/.test(ok.text), ok.text);
  // What it reads, information alone: no note to look at (the skill's example passes with none).
  assert.deepEqual(ok.readings, { readings: ['dots (line 4) reads its table (line 4): 2 rows; "组": words; "得分": numbers'], notes: [] });
  assert.ok(!layoutNotes(ok.text).some((note) => note.includes("reads its table")), "no layout note");
  // A type the script does not define (a name of the shared charts there were among them): the one
  // failure, saying how to define it; none names a shared type.
  const undefinedType = checked(table(undefined, "bar"), "");
  assert.deepEqual(undefinedType.failures, ['data-doc-chart="bar" (line 4): the document\'s script does not define "bar": define it once in the document\'s <script> with DocCharts.define("bar", ({ host, data, tokens, width, height }) => { … }) (references/writing-html.md, "Figures and charts")']);
  // A slip of the name, a type the script defines a letter apart (or holding it): said as that, with the name it defines.
  assert.deepEqual(checked(table(undefined, "dot"), '<script>DocCharts.define("dots", () => {});</script>').failures, ['data-doc-chart="dot" (line 4): the document\'s script does not define "dot", and defines "dots": write the same name in both places']);
  for (const type of ["bar", "line", "pie", "dot"]) {
    const said = checked(`<figure class="doc-figure"><div data-doc-chart="${type}"><script type="application/json">{"data":[]}</script></div></figure>`, "").failures.join("\n");
    assert.match(said, new RegExp(`does not define "${type}"`), type);
    assert.ok(!/shared|preset|bar, line|options/.test(said), said);
  }
  // A name the kit refuses: said as such.
  assert.match(checked(`<figure class="doc-figure"><div data-doc-chart="ciPlot"><script type="application/json">[]</script></div></figure>`, '<script>DocCharts.define("ciPlot", () => {});</script>').failures.join("\n"), /defines "ciPlot" with DocCharts.define, which refuses that name/);
  // A chart of JSON: its data a JSON script, valid.
  assert.deepEqual(checked(`<figure class="doc-figure"><div data-doc-chart="dots"></div></figure>`).failures, ['data-doc-chart="dots" (line 4) needs its data in a <script type="application/json"> child']);
  assert.deepEqual(checked(`<figure class="doc-figure"><div data-doc-chart="dots"><script type="application/json">[1,</script></div></figure>`).failures.map((failure) => failure.replace(/JSON \(.*\)$/, "JSON (…)")), ['data-doc-chart="dots" (line 4): its data is not valid JSON (…)']);
  // Drawn from a table: no JSON in its host; its table there, once, of no merged cells.
  const made = ok.text;
  assert.deepEqual(chartDeclarationFailures(made.replace('data-doc-chart-data="t1"></div>', 'data-doc-chart-data="t1"><script type="application/json">[]</script></div>')), ['data-doc-chart="dots" (line 4): a chart drawn from a table takes its data from the table: take its <script type="application/json"> out']);
  const gone = made.replace(/<div class="doc-table-wrap"[\s\S]*?<\/table><\/div>/, "");
  assert.deepEqual(chartDeclarationFailures(gone), ['data-doc-chart="dots" (line 4): no table\'s frame carries data-doc-chart-source="t1", so the chart has nothing to draw: put the table back, or delete the card']);
  const twice = made.replace(/(<div class="doc-table-wrap"[\s\S]*?<\/table><\/div>)/, "$1\n$1");
  assert.match(chartDeclarationFailures(twice).join("\n"), /2 tables carry data-doc-chart-source="t1" \(lines 4, 5\): a key names one table/);
  assert.match(chartDeclarationFailures(made.replace(/<table class="doc-table">[\s\S]*?<\/table>/, "")).join("\n"), /the frame carrying data-doc-chart-source="t1" \(line 4\) holds no table/);
  assert.deepEqual(checked(table('<tr><td rowspan="2">甲</td><td>1</td></tr><tr><td>2</td></tr>')).failures, ['data-doc-chart="dots" (line 4): its table (line 4) has merged cells: write each value in its own cell, the category on every row']);
  // A table left as written where a card stands in no flow: said how to write it.
  assert.match(checked(`<div class="kpi">${table()}</div>`).failures.join("\n"), /on a table the tools leave as written \(inside a whole block/);
  const figured = checked(`<figure>${table()}<figcaption>图注</figcaption></figure>`);
  assert.match(figured.failures.join("\n"), /is on a table inside a <figure>: the chart's card is a figure of its own, so write the table outside it, its <caption> the chart's title/);
  // data-doc-chart-options is no attribute of the kit's: the generic check of attributes says so.
  const optioned = checked(`<table data-doc-chart="dots" data-doc-chart-options='{"horizontal":true}'><caption>得分</caption><tr><th>组</th><th>得分</th></tr><tr><td>甲</td><td>1</td></tr></table>`);
  assert.ok(optioned.text.includes("data-doc-chart-options='{\"horizontal\":true}'"), "left on the table as written");
  assert.deepEqual(optioned.failures, []);
  assert.match(componentFailures(optioned.text).join("\n"), /data-doc-chart-options/);
  // A flowchart's mark asks for no chart.
  assert.deepEqual(chartDeclarationFailures(page('<div class="steps"><ol data-doc-chart="flow"><li>一</li></ol></div>')), []);

  // Notes: a card with no title, said where the Agent writes its title (a caption on the table the
  // file still holds, the card made in memory; else an h3 in the card the file holds).
  const bare = checked('<table data-doc-chart="dots"><tr><th>组</th><th>得分</th></tr><tr><td>甲</td><td>12</td></tr></table>');
  assert.deepEqual(bare.notes, ['data-doc-chart="dots" (line 4): this chart card has no title: write a <caption> on its table (the one with data-doc-chart), which becomes the card\'s h3']);
  assert.deepEqual(chartDeclarationNotes(bare.text), ['data-doc-chart="dots" (line 4): this chart card has no title: write an h3 in the card\'s figure, before the chart']);
  assert.deepEqual(chartDeclarationNotes(bare.text.replace('<figure class="doc-figure">', '<figure class="doc-figure"><h3>各组得分</h3>')), []);
  // A p.doc-note above the table titles nothing (and stays as it is).
  const noted = checked('<p class="doc-note">各组得分<span class="doc-tab">单位：分</span></p>\n<table data-doc-chart="dots"><tr><th>组</th><th>得分</th></tr><tr><td>甲</td><td>12</td></tr></table>');
  assert.ok(noted.text.includes('<p class="doc-note">各组得分<span class="doc-tab">单位：分</span></p>') && noted.text.includes('<figure class="doc-figure"><div data-doc-chart="dots"'), noted.text);
  assert.equal(noted.notes.length, 1);
  // A header that names no column, or one twice: noted (the rows keyed "", the later column kept).
  const pivotNotes = checked('<table data-doc-chart="dots"><caption>t</caption><tr><th></th><th>值</th><th>值</th></tr><tr><td>甲</td><td>1</td><td>2</td></tr></table>');
  assert.deepEqual(pivotNotes.notes, [
    'data-doc-chart="dots" (line 4): its table\'s header (line 4) has a cell with no words, so that column\'s values are keyed "" in data: write the column\'s name there',
    'data-doc-chart="dots" (line 4): its table\'s header (line 4) names "值" twice, so data keeps the later column\'s value under it: give each column a name of its own',
  ]);
  // gallery check reads a report's file as the intake makes it in memory (loadReports' prepare),
  // keeping the file's text as `written`, which notesOf hands on.
  {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), "table-chart-notes-"));
    const file = page('<p>正文。</p>\n<table data-doc-chart="dots"><tr><th>组</th><th>得分</th></tr><tr><td>甲</td><td>12</td></tr></table>', DEFINE);
    await fs.mkdir(path.join(folder, "untitled"));
    await fs.writeFile(path.join(folder, "untitled", "report.html"), file);
    await fs.writeFile(path.join(folder, "untitled", "report.json"), JSON.stringify({ title: "t", description: "d", type: "report" }));
    const { reports: [report] } = await loadReports(["untitled"], { directory: folder, prepare: ({ html }) => naturalize(html).text });
    assert.equal(report.written, file);
    assert.ok(notesOf(report).some((note) => note.endsWith("write a <caption> on its table (the one with data-doc-chart), which becomes the card's h3")), notesOf(report).join("\n"));
    await fs.rm(folder, { recursive: true, force: true });
  }

  // The line of what each reads of its table: its rows, each column as its values read (numbers,
  // words, or the counts, null for empty); a note for what is worth a look: a column of numbers and
  // words, its <tfoot> rows left out, cells past the header. None for one that fails.
  const lines = checked(`<table data-doc-chart="dots"><caption>记录</caption>
<thead><tr><th>年号</th><th data-sort-type="text">公历</th><th>记录数</th><th>之后</th></tr></thead>
<tbody><tr><td>文禄</td><td>1592</td><td>6</td><td>2</td></tr><tr><td>庆长</td><td>1596</td><td>109</td><td></td></tr><tr><td>宽永</td><td>1624</td><td>12</td><td>约三成</td><td>多</td></tr></tbody>
<tfoot><tr><td>注</td></tr></tfoot>
</table>
${table('<tr><td rowspan="2">甲</td><td>1</td></tr><tr><td>2</td></tr>')}`).readings;
  assert.deepEqual(lines, {
    readings: ['dots (line 8) reads its table (line 4): 3 rows; "年号": words; "公历": words; "记录数": numbers; "之后": 1 number, 1 as words, 1 empty (null)'],
    notes: [
      'data-doc-chart="dots" (line 8): its table\'s column "之后" (line 4) reads as numbers in 1 row and as words in 1: write each of its cells as one number (an empty cell, "—" or "n/a" for none: null in data), or, for a column of words, data-sort-type="text" on its header cell',
      'data-doc-chart="dots" (line 8): its table\'s <tfoot> (line 4) holds 1 row the chart leaves out, and a table with a <tfoot> has no table tools in the preview: keep a total out of a table you chart and say it in the text',
      'data-doc-chart="dots" (line 8): 1 row of its table (line 4) has cells past the header, which the chart does not read: give each column a header cell',
    ],
  });
}

// ---------- the kit, in the page ----------
{
  const [runtime, tokens, charts] = await Promise.all([loadKitFile("runtime.js"), loadKitFile("tokens.js"), loadKitFile("charts.js")]);
  const dom = new JSDOM(`<!doctype html><html><head></head><body><main class="doc-page">
    <figure class="doc-figure"><h3>得分</h3><div id="chart" data-doc-chart="rows" data-doc-chart-data="t1"></div></figure>
    <div class="doc-table-wrap" data-doc-chart-source="t1"><table class="doc-table"><thead><tr><th>组</th><th>得分</th></tr></thead><tbody>
      <tr><td>甲</td><td>12.5%</td></tr><tr><td>乙</td><td data-sort-value="30">约三成</td></tr><tr><td>丙</td><td></td></tr>
    </tbody><tfoot><tr><td>合计</td><td>42.5</td></tr></tfoot></table></div>
    <div class="doc-table-wrap" data-doc-chart-source="t2"><table class="doc-table"><thead><tr><th>组</th><th>人数</th></tr></thead><tbody><tr><td>甲</td><td>7</td></tr></tbody></table></div>
    <figure class="doc-figure"><div id="part" data-doc-chart="rows-part" data-doc-chart-data="t2"></div></figure>
    <figure class="doc-figure"><div id="marked" data-doc-chart="rows" data-doc-chart-data="t4"></div></figure>
    <div class="doc-table-wrap" data-doc-chart-source="t4"><table class="doc-table"><thead><tr><th>组</th><th>耗时<code>ms</code></th><th>拟合 <span class="doc-math-inline">${katex.renderToString("R^2")}</span></th></tr></thead><tbody>
      <tr><td>甲</td><td>12</td><td>0.9</td></tr></tbody></table></div>
    <figure class="doc-figure"><div id="orphan" data-doc-chart="rows" data-doc-chart-data="t9"></div></figure>
    <figure class="doc-figure"><div id="merged" data-doc-chart="rows" data-doc-chart-data="t5"></div></figure>
    <div class="doc-table-wrap" data-doc-chart-source="t5"><table class="doc-table"><tbody><tr><th>组</th><th>值</th></tr><tr><td colspan="2">甲</td></tr></tbody></table></div>
    </main></body></html>`, { url: "https://report.test/report.html", runScripts: "outside-only" });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const frames = new Map();
  let frame = 0;
  w.requestAnimationFrame = (fn) => { frames.set(++frame, fn); return frame; };
  w.cancelAnimationFrame = (id) => frames.delete(id);
  for (const source of [runtime, tokens, charts]) w.eval(source);
  // The page's changes told (the observers' microtasks), then every frame of drawing drawn; `wait`:
  // ms to let pass first (a drawn chart saying its table gives nothing waits a moment).
  const settle = async (wait = 0) => {
    await new Promise((resolve) => setTimeout(resolve, wait));
    for (let pass = 0; frames.size && pass < 10; pass++) {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((fn) => fn());
    }
  };
  const SETTLED = 900; // past from-table.js SETTLE
  // The report's types: one that draws its rows as an svg of a <text> each (what it was given kept
  // on its host for the test), and a part told the new rows by update.
  w.__given = new Map(); // a host -> the data it was last drawn with
  w.eval(`DocCharts.define("rows", ({ host, data }) => {
    window.__given.set(host, data);
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    for (const row of data) { const text = document.createElementNS("http://www.w3.org/2000/svg", "text"); text.textContent = Object.values(row).join("|"); svg.append(text); }
    host.append(svg);
  });
  DocCharts.define("rows-part", { mount({ host, data, signal }) {
    window.__part = { mounted: data, updates: [], destroyed: false };
    signal.addEventListener("abort", () => { window.__part.aborted = true; });
    host.append(document.createElement("svg"));
    return { update: ({ data: next }) => window.__part.updates.push(next), destroy: () => { window.__part.destroyed = true; } };
  } });`);
  await settle();
  const host = w.document.querySelector("#chart");
  const drawn = (node = host) => [...node.querySelectorAll("svg text")].map((text) => text.textContent);
  const note = (node = host) => node.getAttribute("data-doc-layout") ?? "";
  const data = (node = host) => w.__given.get(node);
  assert.deepEqual(drawn(), ["甲|12.5", "乙|30", "丙|"], "drawn from its table's body rows: numbers as the sort reads them, null for an empty cell, its <tfoot> left out");
  assert.deepEqual([[...data()].map((row) => ({ ...row })), [...data().columns]], [[{ 组: "甲", 得分: 12.5 }, { 组: "乙", 得分: 30 }, { 组: "丙", 得分: null }], ["组", "得分"]], "data: an object a row by the header's words, and data.columns");
  assert.equal(note(), "", "nothing noted");
  assert.equal(host.children.length, 1, "its host holds no JSON: the drawing alone");
  // Headers the page shows otherwise than the file writes them: a space beside inline code (the
  // kit's spacing), a formula drawn by KaTeX: named as the checks read them from the file.
  const marked = w.document.querySelector("#marked");
  assert.deepEqual([...data(marked).columns], ["组", "耗时 ms", "拟合 R^2"], "the page's words, a formula by its TeX");
  // Nothing drawn yet: the card's line at once. No table: the kit's line and a data-missing note.
  const orphan = w.document.querySelector("#orphan");
  assert.equal(orphan.querySelector(".doc-chart-message")?.textContent, "这张图的数据表格不在页面上了。");
  assert.equal(note(orphan), 'data-missing: no table carries data-doc-chart-source="t9": put the table back, or delete the card');
  const merged = w.document.querySelector("#merged");
  assert.equal(merged.querySelector(".doc-chart-message")?.textContent, "数据表格有合并的单元格，画不出这张图。");
  assert.equal(note(merged), "data-missing: its table has merged cells: write each value in its own cell, the category on every row");
  // A part: mounted with its rows, told new ones by update.
  assert.deepEqual([...w.__part.mounted].map((row) => ({ ...row })), [{ 组: "甲", 人数: 7 }]);
  w.document.querySelector('[data-doc-chart-source="t2"] tbody td:nth-child(2)').textContent = "9";
  await settle();
  assert.deepEqual([...w.__part.updates].map((rows) => [...rows].map((row) => row.人数)), [[9]], "a cell typed: the part told the new rows");
  w.document.querySelector('[data-doc-chart-source="t2"] tbody td:nth-child(2)').textContent = "9";
  await settle();
  assert.equal(w.__part.updates.length, 1, "the same rows: nothing told");

  // A cell typed into, a row added, a row taken away: drawn again each time.
  const body = w.document.querySelector('[data-doc-chart-source="t1"] tbody');
  body.rows[0].cells[1].firstChild.data = "40%";
  await settle();
  assert.deepEqual(drawn(), ["甲|40", "乙|30", "丙|"], "a cell's new number drawn");
  const added = body.rows[0].cloneNode(true);
  added.cells[0].textContent = "丁";
  body.append(added);
  await settle();
  assert.deepEqual(drawn(), ["甲|40", "乙|30", "丙|", "丁|40"], "a row added");
  added.remove();
  await settle();
  assert.deepEqual(drawn(), ["甲|40", "乙|30", "丙|"], "and taken away");
  // A reader's sort (sort.js: the rows moved, the header's aria-sort): the chart as it was.
  const rows = [...body.rows];
  body.append(rows[1], rows[0], rows[2]);
  w.document.querySelector('[data-doc-chart-source="t1"] thead th:nth-child(2)').setAttribute("aria-sort", "ascending");
  await settle();
  assert.deepEqual(drawn(), ["甲|40", "乙|30", "丙|"], "a reader's sort leaves its order");
  w.document.querySelector('[data-doc-chart-source="t1"] thead th:nth-child(2)').setAttribute("aria-sort", "none");
  await settle();
  assert.deepEqual(drawn(), ["乙|30", "甲|40", "丙|"], "the order the page holds otherwise (the preview's sort is an edit of it)");
  // A header made text: its words.
  w.document.querySelector('[data-doc-chart-source="t1"] thead th:nth-child(2)').setAttribute("data-sort-type", "text");
  await settle();
  assert.deepEqual(drawn(), ["乙|约三成", "甲|40%", "丙|"], "a column made text: its words");
  w.document.querySelector('[data-doc-chart-source="t1"] thead th:nth-child(2)').removeAttribute("data-sort-type");
  await settle();

  // Its key changed (a commit's answer giving it another): drawn from that table; back again.
  host.setAttribute("data-doc-chart-data", "t2");
  await settle();
  assert.deepEqual(drawn(), ["甲|9"], "drawn from the table of its new key");
  host.setAttribute("data-doc-chart-data", "t1");
  await settle();
  assert.deepEqual(drawn(), ["乙|30", "甲|40", "丙|"]);

  // redraw(): its table read again; redraw(data): refused, its data is its table's.
  const handle = w.DocCharts.get(host);
  assert.deepEqual(Object.keys(handle).sort(), ["destroy", "redraw"]);
  handle.redraw();
  await settle();
  assert.deepEqual(drawn(), ["乙|30", "甲|40", "丙|"], "drawn again from its table");
  assert.throws(() => handle.redraw([{ a: 1 }]), /a chart drawn from a table \(data-doc-chart-data\) draws its table's rows; change the table/);

  // Its table gone: the chart stands a moment (a cell merged and split again in one edit), then a
  // line in the card, the layout note; put back: drawn again at once.
  const wrap = w.document.querySelector('[data-doc-chart-source="t1"]');
  wrap.remove();
  await settle();
  assert.ok(host.querySelector("svg") && !host.querySelector(".doc-chart-message"), "standing a moment");
  await settle(SETTLED);
  assert.equal(host.querySelector(".doc-chart-message")?.textContent, "这张图的数据表格不在页面上了。", "the card says its table is gone");
  assert.equal(host.querySelector("svg"), null);
  assert.match(note(), /^data-missing: no table carries data-doc-chart-source="t1"/);
  w.document.querySelector("main").prepend(wrap);
  await settle();
  assert.ok(host.querySelector("svg") && !host.querySelector(".doc-chart-message") && note() === "", "its table back: drawn again at once");
  // Merged for a moment, then split again: never the line.
  const first = body.rows[0].cells[0];
  first.setAttribute("colspan", "2");
  await settle();
  first.removeAttribute("colspan");
  await settle(SETTLED);
  assert.ok(host.querySelector("svg") && !host.querySelector(".doc-chart-message"), "the line never shown");
  // In English (the UI's, or an English page's): the kit's line in English.
  w.document.documentElement.setAttribute("data-ge-language", "en");
  first.setAttribute("rowspan", "2");
  await settle(SETTLED);
  assert.equal(host.querySelector(".doc-chart-message")?.textContent, "The data table has merged cells, so this chart can't be drawn.");
  first.removeAttribute("rowspan");
  w.document.documentElement.removeAttribute("data-ge-language");
  await settle();
  assert.ok(host.querySelector("svg"), "drawn again");
  // Destroyed with its host: nothing stays, and no table change reaches it; a part destroyed, its signal aborted.
  host.remove();
  await settle();
  assert.equal(host.children.length, 0, "its host emptied");
  assert.equal(w.DocCharts.get(host), null);
  const part = w.document.querySelector("#part");
  part.remove();
  await settle();
  assert.deepEqual([w.__part.destroyed, w.__part.aborted], [true, true]);
  dom.window.close();
}

console.log("Checked charts drawn from a table: the rows a table gives a chart of the document's own type (an object a body row keyed by the header's words, data.columns; numbers as the table's sort reads them, a sort value first, null for an empty cell or a dash, words for a range, two numbers or words, a text or date column's words; a formula's TeX; the header a first row of <th> or the first row; a header cell with no words keyed \"\", the later of two alike kept; <tfoot> left out, a total in the body kept, a short row null, cells past the header not read; merged cells nothing, in the header too; what the checks say of the reading), the checks (a type the script does not define, a leftover shared type among them, said with how to define it and no word of the shared charts; a name the kit refuses; JSON needed, valid; no JSON in a bound host; its table gone, doubled, no table in its frame, merged cells; a table left in a whole block or a figure; data-doc-chart-options left on a table and failed by the attributes' check; a flowchart's mark no chart), the notes (no title, where it is written; a note above its table titling nothing; a header naming no column or one twice), what gallery check reads passed on to the notes, the line of what it reads of its table, and the kit drawing one in the page from its table's rows (no JSON in its host; headers as the checks read them; the card's line at once with nothing drawn, for no table and for merged cells; a part mounted with its rows and told new ones, not told the same ones; again as a cell, a row or its key changes, as it was after a reader's sort, a column made text; redraw() reading its table again, redraw(data) refused; standing while its table reads as nothing for a moment, saying so once its table has gone and drawing again when it comes back, in English too; destroyed with its host, a part's signal aborted).");
