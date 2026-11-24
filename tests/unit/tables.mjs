import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { captureLayout, prepareBlock } from "../../src/editor/page/core.mjs";
import { createCommits } from "../../src/editor/page/commit.mjs";
import { commitEdits, hashOf, instrument } from "../../src/editor/source.mjs";
import { duplicateRows, insertColumn, newTable, insertRow, mergeCells, moveColumn, moveRow, removeColumns, removeRows, setHeaderColumn, setHeaderRow, splitCell, tableState } from "../../src/editor/components/table/page.mjs";
import { applyEdits } from "../../src/editor/source.mjs";
import { CELL_ALIGNS, CELL_BOLD, CELL_VALIGNS, lookOf, rowNames } from "../../src/editor/components/table/index.mjs";
import { alignItems, alignLook, sharedAlign } from "../../src/editor/page/table/aligns.mjs";
import tableDescription from "../../src/shared/components/table.mjs";
import fs from "node:fs";
import { isMissingValue, numberValue, parsedValue } from "../../src/shared/number-reading.mjs";
import { gridOf } from "../../src/editor/components/table/grid.mjs";
import { columnCells, columnWidths, slotsOf, tileSpans, widthHolder } from "../../src/shared/table-slots.mjs";
import { inferColumnSemantics } from "../../src/render/kit/tables/cells.js";
import { WHOLE_ROWS, shownWhole } from "../../src/render/kit/tables/whole.js";
import { markEdges } from "../../src/render/kit/tables/edges.js";

// Tables' rows and columns (components/table/: page.mjs, grid.mjs; source/table.mjs): what the
// table's tools do on the page, committed as one operation of the table and written as its new
// inside, what stayed as the file had it; the page then knows its cells where the file has them
// (their text edits go on as any), and a table someone else changed meanwhile is a conflict.

const page = (body) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>报告</title></head><body>
<main class="doc-page" data-doc-id="demo">
${body}</main>
</body></html>
`;
const seal = (source) => hashOf(`test:${source}`);

function studio(source) {
  const { html, map } = instrument(source);
  const { document } = new JSDOM(html).window;
  const baselines = new Map();
  for (const block of map.blocks) baselines.set(block.id, prepareBlock(document.querySelector(`[data-ge-block="${block.id}"]`), block));
  let layout = captureLayout(document, map);
  const state = { document, map, file: source };
  state.commits = createCommits({ root: document, map, baselines, units: new Map(), boxes: new Map(), getLayout: () => layout, setLayout: (next) => (layout = next) });
  state.commit = () => {
    const built = state.commits.build();
    if (!built) return null;
    const receipt = commitEdits({ current: state.file, ...built.request, opening: source, seal });
    state.file = receipt.text;
    state.last = { request: built.request, receipt };
    return { receipt, request: built.request, ...state.commits.apply(built.pending, receipt) };
  };
  state.table = () => document.querySelector("main .doc-table-wrap");
  state.cell = (r, c) => tableState(state.table()).rows[r].cells[c];
  return state;
}

const TABLE = page(`  <p>前文</p>
  <div class="doc-table-wrap">
    <table class="doc-table">
      <thead>
        <tr><th>名称</th><th>数值</th></tr>
      </thead>
      <tbody>
        <tr><td>一</td><td data-sort-value="1">1.0</td></tr>
        <tr><td>二</td><td>2</td></tr>
      </tbody>
    </table>
  </div>
  <p>后文</p>
`);
// A table's operation as the page sends it (page/commit.mjs): the unit by where it was when the page opened, with its hash.
const tableOp = (map, rows) => {
  const unit = map.units.find((each) => each.kind === "table");
  return { unit: { key: 0, open: unit.id, hash: unit.hash }, table: { rows } };
};
// The server's answer to a table operation made of these rows. A refusal reads "invalid" whatever its cause
// (a unit named wrongly gets the same word), so a test of a refusal first runs `control`: the operation with the
// offending value made valid is applied, and the refusal that follows is the value's doing.
const control = (file, rows, why) => assert.equal(commitEdits({ current: file, texts: [], units: [tableOp(instrument(file).map, rows)], opening: file, seal }).units[0].status, "applied", `control: ${why}`);
const rowsOf = (file) => [...file.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)].map((match) => match[1].replace(/ data-block-id="[^"]*"/g, ""));

// A column put in, its cells typed into; a row at the end. One operation, the rest as it was.
{
  const s = studio(TABLE);
  const cells = insertColumn(s.table(), 1);
  cells[0].textContent = "单位";
  cells[1].textContent = "个";
  const row = insertRow(s.table(), 3);
  row.cells[0].textContent = "三";
  const first = s.commit();
  assert.deepEqual(first.receipt.units.map((entry) => entry.status), ["applied"], JSON.stringify(first.receipt.units));
  assert.deepEqual(first.request.texts, [], "the cells' text goes with the table's operation");
  assert.deepEqual(rowsOf(s.file), ["<th>名称</th><th>单位</th><th>数值</th>", '<td>一</td><td>个</td><td data-sort-value="1">1.0</td>', "<td>二</td><td></td><td>2</td>", "<td>三</td><td></td><td></td>"]);
  assert.match(s.file, /<\/tr>\n        <tr>/, "rows on lines of their own, as the file has them");
  assert.equal(s.commits.build(), null, "nothing left to commit");
  // The page knows the new cells now: their text is edited as any.
  s.cell(3, 2).textContent = "3";
  s.cell(1, 0).textContent = "一（改）";
  const second = s.commit();
  assert.equal(second.request.units.length, 0, "no table operation for text alone");
  assert.deepEqual(second.receipt.texts.map((entry) => entry.status), ["applied", "applied"]);
  assert.deepEqual(rowsOf(s.file).slice(1), ['<td>一（改）</td><td>个</td><td data-sort-value="1">1.0</td>', "<td>二</td><td></td><td>2</td>", "<td>三</td><td></td><td>3</td>"]);
  // A cell with a sort key edits as any: its key follows the text, the number in it, else it goes.
  s.cell(1, 2).textContent = "1,250.5";
  assert.deepEqual(s.commit().receipt.texts.map((entry) => entry.status), ["applied"]);
  assert.equal(rowsOf(s.file)[1], '<td>一（改）</td><td>个</td><td data-sort-value="1250.5">1,250.5</td>', "the number the text holds");
  s.cell(1, 2).textContent = "—";
  s.commit();
  assert.equal(rowsOf(s.file)[1], "<td>一（改）</td><td>个</td><td>—</td>", "none: the kit sorts the cell by its text");
}
{
  // In the key's own scale; a missing value's key kept while the cell still holds no number.
  const s = studio(TABLE.replace('<td data-sort-value="1">1.0</td>', '<td data-sort-value="340000000">3.4亿</td>').replace("<td>2</td>", '<td data-sort-value="-1">—</td>'));
  s.cell(1, 1).textContent = "3.6亿";
  s.cell(2, 1).textContent = "暂无";
  s.commit();
  assert.deepEqual(rowsOf(s.file).slice(1), ['<td>一</td><td data-sort-value="360000000">3.6亿</td>', '<td>二</td><td data-sort-value="-1">暂无</td>']);
}

// Moved, taken out, copied; the header row off and on, a header column.
{
  const s = studio(TABLE);
  assert.ok(moveRow(s.table(), 2, 1) && moveColumn(s.table(), 1, 0));
  s.commit();
  assert.deepEqual(rowsOf(s.file), ["<th>数值</th><th>名称</th>", "<td>2</td><td>二</td>", '<td data-sort-value="1">1.0</td><td>一</td>']);
  assert.ok(removeColumns(s.table(), 1, 1) && !removeColumns(s.table(), 0, 0), "never every column");
  assert.ok(removeRows(s.table(), 1, 1) && !removeRows(s.table(), 1, 1), "never every body row");
  s.commit();
  assert.deepEqual(rowsOf(s.file), ["<th>数值</th>", '<td data-sort-value="1">1.0</td>']);
  duplicateRows(s.table(), 1, 1);
  assert.ok(setHeaderRow(s.table(), false));
  s.commit();
  assert.ok(!/<thead/.test(s.file), "the header row off: no thead");
  assert.deepEqual(rowsOf(s.file), ["<td>数值</td>", '<td data-sort-value="1">1.0</td>', "<td>1.0</td>"]);
  assert.ok(setHeaderRow(s.table(), true) && setHeaderColumn(s.table(), true));
  s.commit();
  assert.match(s.file, /<thead>\n\s*<tr><th class="doc-bold doc-highlight-gray">数值<\/th><\/tr>\n\s*<\/thead>/, "a thead again, its cell with the header's look");
  assert.deepEqual(rowsOf(s.file).slice(1), ['<th data-sort-value="1" scope="row">1.0</th>', '<th scope="row">1.0</th>'], "a header column: th scope=row with no look (it only sticks), the cell's attributes kept");
}

// The header row and column are the first: a row moved to the top is the header row
// (with the header's look), the one it displaced a body row; so a column moved to the front (a header
// row's with the header's look, a header column's with none).
{
  const s = studio(TABLE);
  assert.ok(moveRow(s.table(), 2, 0));
  s.commit();
  assert.deepEqual(rowsOf(s.file), ['<th class="doc-bold doc-highlight-gray">二</th><th class="doc-bold doc-highlight-gray">2</th>', "<td>名称</td><td>数值</td>", '<td>一</td><td data-sort-value="1">1.0</td>']);
  assert.ok(setHeaderColumn(s.table(), true) && moveColumn(s.table(), 1, 0));
  s.commit();
  assert.deepEqual(rowsOf(s.file), ['<th class="doc-bold doc-highlight-gray">2</th><th class="doc-bold doc-highlight-gray">二</th>', '<th scope="row">数值</th><td>名称</td>', '<th data-sort-value="1" scope="row">1.0</th><td>一</td>']);
}

// 标题列 only makes the first column stay at the left when the frame scrolls sideways (the user's,
// 2026-11-06): it gives the cells no look and takes none (a reader's look and an older file's kept), a
// cell made in it is plain, and a cell going between the header row and the header column takes or
// loses the header row's look as the rest of its row.
{
  const s = studio(TABLE);
  s.cell(1, 0).classList.add("doc-highlight-yellow");
  assert.ok(setHeaderColumn(s.table(), true));
  s.commit();
  assert.ok(rowsOf(s.file)[1].startsWith('<th class="doc-highlight-yellow" scope="row">一</th>'), "the reader's look on the first column kept: " + rowsOf(s.file)[1]);
  assert.ok(rowsOf(s.file)[2].startsWith('<th scope="row">二</th>'), "no look given: " + rowsOf(s.file)[2]);
  insertRow(s.table(), 3);
  insertColumn(s.table(), 0);
  s.commit();
  assert.deepEqual(rowsOf(s.file).slice(1).map((row) => row.match(/^<th[^>]*>[^<]*<\/th>/)?.[0]), ['<th scope="row"></th>', '<th scope="row"></th>', '<th scope="row"></th>'], "a cell made in the header column is plain");
  assert.ok(rowsOf(s.file)[1].includes('<td class="doc-highlight-yellow">一</td>'), "the cell that was first a td with its look: " + rowsOf(s.file)[1]);
  assert.ok(setHeaderColumn(s.table(), false));
  s.commit();
  assert.ok(rowsOf(s.file)[1].includes('<td class="doc-highlight-yellow">一</td>'), "off: the looks untouched");
}
{
  const s = studio(TABLE);
  assert.ok(setHeaderRow(s.table(), false) && setHeaderRow(s.table(), true));
  assert.ok(setHeaderColumn(s.table(), true) && setHeaderRow(s.table(), false));
  s.commit();
  assert.equal(rowsOf(s.file)[0], '<th scope="row">名称</th><td>数值</td>', "out of the header row into the header column: the header row's look gone, as its row's");
  assert.ok(setHeaderRow(s.table(), true));
  s.commit();
  assert.equal(rowsOf(s.file)[0], '<th class="doc-bold doc-highlight-gray">名称</th><th class="doc-bold doc-highlight-gray">数值</th>', "into the header row: its look");
}
{
  const s = studio(TABLE.replace("<td>一</td>", '<th class="doc-bold doc-highlight-gray" scope="row">一</th>').replace("<td>二</td>", '<th class="doc-bold doc-highlight-gray" scope="row">二</th>'));
  assert.ok(setHeaderColumn(s.table(), false));
  s.commit();
  assert.deepEqual(rowsOf(s.file).slice(1).map((row) => row.match(/^<td[^>]*>[^<]*<\/td>/)?.[0]), ['<td class="doc-bold doc-highlight-gray">一</td>', '<td class="doc-bold doc-highlight-gray">二</td>'], "an older file's header column with the look: off keeps it");
  const made = newTable(s.document, { rows: [["a", "b"], ["c", "d"], ["e", "f"]], header: true, column: true });
  assert.deepEqual([...made.querySelectorAll("thead th")].map((cell) => cell.className), ["doc-bold doc-highlight-gray", "doc-bold doc-highlight-gray"], "a new table: its header row with the look");
  assert.deepEqual([...made.querySelectorAll('tbody th[scope="row"]')].map((cell) => cell.className), ["", ""], "its header column plain");
}

// Undone: the rows as they were, written back as they were.
{
  const s = studio(TABLE);
  const body = tableState(s.table()).body;
  const before = [...body.children];
  insertRow(s.table(), 1);
  s.commit();
  body.replaceChildren(...before); // what undo puts back
  s.commit();
  assert.equal(s.file.replace(/ data-block-id="[^"]*"/g, ""), TABLE, "the file as it was");
}

// Someone else changed the table meanwhile: the operation is a conflict, nothing written.
{
  const s = studio(TABLE);
  s.file = s.file.replace("<td>二</td>", "<td>二（AI）</td>");
  insertRow(s.table(), 3);
  const clash = s.commit();
  assert.deepEqual(clash.receipt.units.map((entry) => entry.status), ["conflict"]);
  assert.ok(s.file.includes("<td>二（AI）</td>") && rowsOf(s.file).length === 3, "the file keeps theirs");
}

// A cell's look (its color, fill, alignment: CELL_LOOKS) is written as its classes, the file's own
// classes kept; a new cell's with it; copies keep it; taken off again; a look the page may not send
// is refused.
{
  const s = studio(page(`  <div class="doc-table-wrap">
    <table class="doc-table">
      <thead>
        <tr><th>名称</th><th>数值</th></tr>
      </thead>
      <tbody>
        <tr><td class="note">一</td><td>1</td></tr>
      </tbody>
    </table>
  </div>
`));
  s.cell(1, 0).classList.add("doc-highlight-yellow", "doc-align-center");
  const cells = insertColumn(s.table(), 2);
  cells[1].classList.add("doc-text-red");
  const first = s.commit();
  assert.equal(first.request.units.length, 1);
  assert.deepEqual(rowsOf(s.file), ["<th>名称</th><th>数值</th><th></th>", '<td class="note doc-align-center doc-highlight-yellow">一</td><td>1</td><td class="doc-text-red"></td>']);
  duplicateRows(s.table(), 1, 1);
  s.commit();
  assert.deepEqual(rowsOf(s.file).slice(2), ['<td class="doc-align-center doc-highlight-yellow">一</td><td>1</td><td class="doc-text-red"></td>'], "a copy keeps the look (not the file's own classes)");
  s.cell(1, 0).classList.remove("doc-highlight-yellow", "doc-align-center");
  s.commit();
  assert.equal(rowsOf(s.file)[1], '<td class="note">一</td><td>1</td><td class="doc-text-red"></td>', "taken off: the file's own class stays");
  s.cell(1, 2).classList.remove("doc-text-red");
  s.commit();
  assert.equal(rowsOf(s.file)[1], '<td class="note">一</td><td>1</td><td></td>', "no class left: no class attribute");
  const before = s.file;
  const withLook = (look) => [{ head: true, from: 0, cells: [{ from: [0, 0], tag: "th" }, { from: [0, 1], tag: "th" }, { from: [0, 2], tag: "th" }] }, { head: false, from: 1, cells: [{ from: [1, 0], tag: "td", look }, { from: [1, 1], tag: "td" }, { from: [1, 2], tag: "td" }] }, { head: false, from: 2, cells: [{ from: [2, 0], tag: "td" }, { from: [2, 1], tag: "td" }, { from: [2, 2], tag: "td" }] }];
  control(s.file, withLook("doc-text-red"), "a look the kit has");
  for (const look of ["note", "doc-text-red doc-text-blue", "doc-text-red doc-highlight-yellow", "doc-align-left doc-align-right", "x".repeat(300)]) {
    const receipt = commitEdits({ current: s.file, texts: [], units: [tableOp(instrument(s.file).map, withLook(look))], opening: s.file, seal });
    assert.notEqual(receipt.units[0].status, "applied", `look ${JSON.stringify(look.slice(0, 40))} refused`);
    assert.equal(receipt.text ?? s.file, before);
  }
}

// A row put in wears, in each column, the look that column's body cells all share (the header row
// aside), a column put in, in each row, the look that row's cells share (the header column aside); where
// they differ, or in a new header column's cell, plain. Only the look: no words, no spans. Written.
{
  const s = studio(page(`  <div class="doc-table-wrap">
    <table class="doc-table">
      <thead>
        <tr><th class="doc-bold doc-highlight-gray">名称</th><th class="doc-bold doc-highlight-gray">数值</th><th class="doc-bold doc-highlight-gray">备注</th></tr>
      </thead>
      <tbody>
        <tr><td class="doc-text-red doc-bold">一</td><td class="doc-align-right doc-valign-middle">1</td><td class="doc-highlight-yellow">甲</td></tr>
        <tr><td class="doc-bold doc-text-red">二</td><td class="doc-valign-middle doc-align-right">2</td><td>乙</td></tr>
      </tbody>
    </table>
  </div>
`));
  const row = insertRow(s.table(), 3);
  assert.deepEqual([...row.cells].map(lookOf), ["doc-bold doc-text-red", "doc-align-right doc-valign-middle", ""], "a row: each column's shared look, plain where they differ (the header row's not counted)");
  const above = insertRow(s.table(), 1);
  assert.deepEqual([...above.cells].map(lookOf), ["doc-bold doc-text-red", "doc-align-right doc-valign-middle", ""], "the same put in first, under the header row");
  const column = insertColumn(s.table(), 3);
  assert.deepEqual(column.map(lookOf), ["doc-bold doc-highlight-gray", "", "", "", ""], "a column: the header row's shared look; the body rows' looks differ, plain");
  s.commit();
  assert.deepEqual(rowsOf(s.file), [
    '<th class="doc-bold doc-highlight-gray">名称</th><th class="doc-bold doc-highlight-gray">数值</th><th class="doc-bold doc-highlight-gray">备注</th><th class="doc-bold doc-highlight-gray"></th>',
    '<td class="doc-bold doc-text-red"></td><td class="doc-align-right doc-valign-middle"></td><td></td><td></td>',
    '<td class="doc-text-red doc-bold">一</td><td class="doc-align-right doc-valign-middle">1</td><td class="doc-highlight-yellow">甲</td><td></td>',
    '<td class="doc-bold doc-text-red">二</td><td class="doc-valign-middle doc-align-right">2</td><td>乙</td><td></td>',
    '<td class="doc-bold doc-text-red"></td><td class="doc-align-right doc-valign-middle"></td><td></td><td></td>',
  ], "written with their looks, the rest as it was");
}
{
  const s = studio(page(`  <div class="doc-table-wrap">
    <table class="doc-table">
      <thead>
        <tr><th class="doc-bold doc-highlight-gray">名称</th><th class="doc-bold doc-highlight-gray">一月</th><th class="doc-align-center doc-bold doc-highlight-gray">二月</th></tr>
      </thead>
      <tbody>
        <tr><th scope="row">收入</th><td class="doc-highlight-green">1</td><td class="doc-highlight-green">2</td></tr>
        <tr><th scope="row" class="doc-text-blue">支出</th><td class="doc-text-red">3</td><td>4</td></tr>
      </tbody>
    </table>
  </div>
`));
  const column = insertColumn(s.table(), 3);
  assert.deepEqual(column.map(lookOf), ["doc-bold doc-highlight-gray", "doc-highlight-green", ""], "the header row's looks differ: the cell before it's color and bold; a row's shared look beside the header column; plain where they differ");
  const first = insertColumn(s.table(), 0);
  assert.deepEqual(first.map(lookOf), ["doc-bold doc-highlight-gray", "", ""], "a new header column's cell plain");
  const row = insertRow(s.table(), 3);
  assert.deepEqual([...row.cells].map((cell) => [cell.localName, lookOf(cell)].join(":")), ["th:", "td:", "td:", "td:", "td:"], "a row: its columns' body looks differ, plain (the header column's plain th)");
  s.commit();
  assert.deepEqual(rowsOf(s.file).slice(1, 3), ['<th scope="row"></th><td>收入</td><td class="doc-highlight-green">1</td><td class="doc-highlight-green">2</td><td class="doc-highlight-green"></td>', '<th scope="row"></th><td class="doc-text-blue">支出</td><td class="doc-text-red">3</td><td>4</td><td></td>'], "written");
}
{
  // No header row: every row counts. A merged cell counts once in each column it covers; its spans are not the new cell's.
  const s = studio(page(`  <div class="doc-table-wrap">
    <table class="doc-table">
      <tbody>
        <tr><td class="doc-text-blue" rowspan="2">甲</td><td>1</td></tr>
        <tr><td>2</td></tr>
        <tr><td class="doc-text-blue">乙</td><td class="doc-bold">3</td></tr>
      </tbody>
    </table>
  </div>
`));
  const row = insertRow(s.table(), 3);
  assert.deepEqual([...row.cells].map((cell) => [lookOf(cell), cell.rowSpan]), [["doc-text-blue", 1], ["", 1]], "a merged cell's look counted, its spans not taken");
  s.commit();
  assert.equal(rowsOf(s.file)[3], '<td class="doc-text-blue"></td><td></td>');
}

// A column's width (--doc-column-width on its first row's cell, the kit's manual layout) goes
// with the table's operation: written into the cell's style (its other properties kept), taken
// off again; a width the page may not send is refused.
{
  const s = studio(page(`  <div class="doc-table-wrap">
    <table class="doc-table">
      <thead>
        <tr><th style="color: red">名称</th><th>数值</th></tr>
      </thead>
      <tbody>
        <tr><td>一</td><td>1</td></tr>
      </tbody>
    </table>
  </div>
`));
  s.cell(0, 0).style.setProperty("--doc-column-width", "160px");
  s.cell(0, 1).style.setProperty("--doc-column-width", "80.5px");
  s.commit();
  assert.equal(rowsOf(s.file)[0], '<th style="color: red; --doc-column-width: 160px">名称</th><th style="--doc-column-width: 80.5px">数值</th>');
  s.cell(0, 0).style.removeProperty("--doc-column-width");
  s.cell(0, 1).style.removeProperty("--doc-column-width");
  s.commit();
  assert.equal(rowsOf(s.file)[0], '<th style="color: red">名称</th><th>数值</th>', "taken off: the cell's own style stays, an empty one goes");
  const before = s.file;
  const withWidth = (width) => [{ head: true, from: 0, cells: [{ from: [0, 0], tag: "th", width }, { from: [0, 1], tag: "th" }] }, { head: false, from: 1, cells: [{ from: [1, 0], tag: "td" }, { from: [1, 1], tag: "td" }] }];
  control(s.file, withWidth("160px"), "a width the page may send");
  for (const width of ["10px", "160", "1e3px", "160px; color: red", 160]) {
    const receipt = commitEdits({ current: s.file, texts: [], units: [tableOp(instrument(s.file).map, withWidth(width))], opening: s.file, seal });
    assert.notEqual(receipt.units[0].status, "applied", `width ${JSON.stringify(width)} refused`);
    assert.equal(receipt.text ?? s.file, before);
  }
}

// A cell's start tag is rewritten where it stands (source/tag.mjs, the one writer of attribute changes
// that sizes and attributes of units use too): a style with a semicolon inside a url() or an entity
// (&quot;) is read as written and written back as written, the cell's other attributes keep their
// places (the scope the first of them), its look and spans change where the file has them.
{
  const style = "background: url(data:image/png;base64,AAAA); font-family: &quot;Noto Sans&quot;; color: red";
  const s = studio(page(`  <div class="doc-table-wrap">
    <table class="doc-table">
      <thead>
        <tr><th scope="col" class="own" style="${style}">名称</th><th>数值</th></tr>
      </thead>
      <tbody>
        <tr><td>一</td><td>1</td></tr>
      </tbody>
    </table>
  </div>
`));
  s.cell(0, 0).style.setProperty("--doc-column-width", "160px");
  s.commit();
  assert.equal(rowsOf(s.file)[0], `<th scope="col" class="own" style="${style}; --doc-column-width: 160px">名称</th><th>数值</th>`, "the file's style as written, the width at its end");
  s.cell(0, 0).classList.add("doc-align-center");
  s.commit();
  assert.equal(rowsOf(s.file)[0], `<th scope="col" class="own doc-align-center" style="${style}; --doc-column-width: 160px">名称</th><th>数值</th>`, "the look written in the class where it stands");
  s.cell(0, 0).style.removeProperty("--doc-column-width");
  s.commit();
  assert.equal(rowsOf(s.file)[0], `<th scope="col" class="own doc-align-center" style="${style}">名称</th><th>数值</th>`, "taken off: the rest of the style as it was");
  mergeCells(s.table(), { r0: 0, r1: 0, c0: 0, c1: 1 });
  s.commit();
  assert.equal(rowsOf(s.file)[0], `<th scope="col" class="own doc-align-center" style="${style}" colspan="2">名称<br>数值</th>`, "a span goes at the end of the tag");
}

// A table with a merged cell: its text edited alone is no operation of the table.
{
  const s = studio(page(`  <table class="doc-table"><tbody><tr><td colspan="2">合</td></tr><tr><td>a</td><td>b</td></tr></tbody></table>\n`));
  s.document.querySelector("td").textContent = "合（改）";
  const commit = s.commit();
  assert.equal(commit.request.units.length, 0);
  assert.ok(s.file.includes('<td colspan="2">合（改）</td>'));
}

// Merged cells (shared/table-slots.mjs): a rectangle made one, its cells' contents on lines
// of their own; a row put in across it makes it taller, its top row taken out moves it down; a
// column put in across it wider, one taken out narrower; split again; each written as the table's
// operation (rowspan, colspan), the rest as the file had it.
{
  const s = studio(page(`  <div class="doc-table-wrap">
    <table class="doc-table">
      <thead>
        <tr><th>A</th><th>B</th><th>C</th></tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>2</td><td>3</td></tr>
        <tr><td>4</td><td>5</td><td>6</td></tr>
        <tr><td>7</td><td>8</td><td>9</td></tr>
      </tbody>
    </table>
  </div>
`));
  const unit = s.table();
  assert.equal(mergeCells(unit, { r0: 0, r1: 1, c0: 0, c1: 0 }), false, "never across the header row and the body");
  const merged = mergeCells(unit, { r0: 1, r1: 2, c0: 0, c1: 1 });
  assert.equal(merged.innerHTML, "1<br>2<br>4<br>5", "the cells' contents, each on a line of its own");
  s.commit();
  assert.deepEqual(rowsOf(s.file), ["<th>A</th><th>B</th><th>C</th>", '<td colspan="2" rowspan="2">1<br>2<br>4<br>5</td><td>3</td>', "<td>6</td>", "<td>7</td><td>8</td><td>9</td>"]);
  assert.equal(s.last.receipt.units[0].status, "applied");
  // The selection's rectangle grows over it (slots): a cell inside it is it.
  const { slots } = tableState(unit);
  assert.equal(slots.columns, 3);
  assert.equal(slots.matrix[2][1], tableState(unit).rows[1].cells[0]);

  insertRow(unit, 2);
  s.commit();
  assert.deepEqual(rowsOf(s.file).slice(1, 4), ['<td colspan="2" rowspan="3">1<br>2<br>4<br>5</td><td>3</td>', "<td></td>", "<td>6</td>"], "a row put in across it: taller");
  removeRows(unit, 1, 1);
  s.commit();
  assert.deepEqual(rowsOf(s.file).slice(1), ['<td colspan="2" rowspan="2">1<br>2<br>4<br>5</td><td></td>', "<td>6</td>", "<td>7</td><td>8</td><td>9</td>"], "its top row taken out: it moves down, shorter");
  insertColumn(unit, 1);
  s.commit();
  assert.deepEqual(rowsOf(s.file).slice(1, 3), ['<td colspan="3" rowspan="2">1<br>2<br>4<br>5</td><td></td>', "<td>6</td>"], "a column put in across it: wider");
  assert.equal(rowsOf(s.file)[0], "<th>A</th><th></th><th>B</th><th>C</th>");
  removeColumns(unit, 0, 1);
  s.commit();
  assert.deepEqual(rowsOf(s.file), ["<th>B</th><th>C</th>", '<td rowspan="2">1<br>2<br>4<br>5</td><td></td>', "<td>6</td>", "<td>8</td><td>9</td>"], "two of its columns taken out: one wide again");
  // Merged again and split: its content in its top left cell, empty cells in the others.
  const again = mergeCells(unit, { r0: 1, r1: 3, c0: 1, c1: 1 });
  s.commit();
  assert.deepEqual(rowsOf(s.file).slice(1), ['<td rowspan="2">1<br>2<br>4<br>5</td><td rowspan="3">6<br>9</td>', "", "<td>8</td>"], "merged down a column (a row left with no cell of its own)");
  assert.ok(splitCell(unit, again));
  s.commit();
  assert.equal(s.last.receipt.units[0].status, "applied");
  assert.deepEqual(s.file.match(/(row|col)span="\d+"/g), ['rowspan="2"'], "split: the other merged cell's span alone left");
  assert.deepEqual(rowsOf(s.file).slice(1), ['<td rowspan="2">1<br>2<br>4<br>5</td><td>6<br>9</td>', "<td></td>", "<td>8</td><td></td>"]);
  assert.equal(tableState(unit).slots.columns, 2);
}

// The file's spans are checked: an operation whose cells overlap or leave a hole is refused.
{
  const s = studio(TABLE);
  const before = s.file;
  control(s.file, [{ head: true, from: 0, cells: [{ from: [0, 0], tag: "th", rowspan: 1, colspan: 1 }, { from: [0, 1], tag: "th" }] }, { head: false, from: 1, cells: [{ from: [1, 0], tag: "td", rowspan: 1, colspan: 1 }, { from: [1, 1], tag: "td" }] }], "spans that tile the grid");
  for (const rows of [
    [{ head: true, from: 0, cells: [{ from: [0, 0], tag: "th", rowspan: 1, colspan: 2 }, { from: [0, 1], tag: "th" }] }, { head: false, from: 1, cells: [{ from: [1, 0], tag: "td" }, { from: [1, 1], tag: "td" }] }],
    [{ head: true, from: 0, cells: [{ from: [0, 0], tag: "th" }, { from: [0, 1], tag: "th" }] }, { head: false, from: 1, cells: [{ from: [1, 0], tag: "td", rowspan: 3, colspan: 1 }, { from: [1, 1], tag: "td" }] }],
    [{ head: true, from: 0, cells: [{ from: [0, 0], tag: "th", rowspan: 2, colspan: 1 }, { from: [0, 1], tag: "th" }] }, { head: false, from: 1, cells: [{ from: [1, 1], tag: "td" }] }],
    [{ head: true, from: 0, cells: [{ from: [0, 0], tag: "th" }, { from: [0, 1], tag: "th" }] }, { head: false, from: 1, cells: [{ from: [1, 0], tag: "td", rowspan: 1 }] }],
  ]) {
    const receipt = commitEdits({ current: s.file, texts: [], units: [tableOp(instrument(s.file).map, rows)], opening: s.file, seal });
    assert.notEqual(receipt.units[0].status, "applied", JSON.stringify(rows));
    assert.equal(receipt.text ?? s.file, before);
  }
}

// A new table with merged cells (made and merged before it was first written: index.mjs tableData,
// file.mjs) is written with its spans, its widths on its columns' own cells.
{
  const base = "<main>\n  <p>前文</p>\n</main>\n";
  const add = (node) => applyEdits({ current: base, edits: [], units: [{ id: "n0", insert: { key: "n0", type: "table", ...node }, place: { after: 0 } }] });
  const text = add({ rows: [["A", "B", "C"], ["合", "x"], ["y"]], header: true, spans: [[[1, 1], [1, 1], [1, 1]], [[2, 2], [1, 1]], [[1, 1]]], widths: ["120px", "130px", "140px"] }).text;
  assert.ok(text.includes('<tr><th style="--doc-column-width: 120px">A</th><th style="--doc-column-width: 130px">B</th><th style="--doc-column-width: 140px">C</th></tr>'), text);
  assert.ok(text.includes('<tr><td colspan="2" rowspan="2">合</td><td>x</td></tr>') && text.includes("<tr><td>y</td></tr>"), text);
  // A cell merged down over a whole row leaves that row with no cell: still a table.
  const covered = add({ rows: [["a"], []], spans: [[[2, 1]], []] });
  assert.ok(!covered.conflicts?.length && covered.text.includes("<td rowspan=\"2\">a</td>"), "a row a merged cell covers whole: written");
  for (const bad of [{ rows: [["a", "b"], ["c"]] }, { rows: [["a"], ["b"]], spans: [[[3, 1]], [[1, 1]]] }, { rows: [["a", "b"]], spans: [[[1, 0], [1, 1]]] }]) {
    assert.deepEqual(add(bad).conflicts.map((entry) => entry.reason), ["invalid"], JSON.stringify(bad));
  }
}

// Lists in a cell (page/table/lists.mjs): part of the cell's text, the cell a text block with
// one (source/blocks.mjs inlineProblem, core.mjs serializeInner), its edits written as its text; a
// list the page never writes (attributes, a list in an item) refused.
{
  const s = studio(page(`  <div class="doc-table-wrap">
    <table class="doc-table">
      <tbody>
        <tr><td>前<ul><li>一</li><li>二</li></ul>后</td><td>x</td></tr>
      </tbody>
    </table>
  </div>
`));
  const cell = s.cell(0, 0);
  assert.ok(cell.hasAttribute("data-ge-block") && !cell.hasAttribute("data-ge-lock"), "a cell holding a list is a text block");
  cell.querySelectorAll("li")[1].textContent = "二（改）";
  const numbered = s.document.createElement("ol");
  numbered.innerHTML = "<li>甲</li><li><br></li>";
  cell.append(numbered);
  const built = s.commits.build();
  const sent = built.request.texts[0].parts[0].html;
  assert.equal(sent, "前<ul><li>一</li><li>二（改）</li></ul>后<ol><li>甲</li><li></li></ol>", "written as its text, an empty item's caret holder left out");
  assert.equal(commitEdits({ current: s.file, ...built.request, opening: s.file, seal }).texts[0].status, "applied", "control: the text as the page sent it");
  for (const bad of ['前<ul class="x"><li>一</li></ul>', "前<ul><li>一<ul><li>二</li></ul></li></ul>", "前<ul>字<li>一</li></ul>", '<li>一</li>']) {
    const request = { ...built.request, texts: [{ ...built.request.texts[0], parts: [{ ...built.request.texts[0].parts[0], html: bad }] }] };
    const receipt = commitEdits({ current: s.file, ...request, opening: s.file, seal });
    assert.notEqual(receipt.texts[0].status, "applied", bad);
  }
  s.commit();
  assert.ok(s.file.includes("<tr><td>前<ul><li>一</li><li>二（改）</li></ul>后<ol><li>甲</li><li></li></ol></td><td>x</td></tr>"), s.file);
}

// Pictures in a cell (单元格里的图片, page/table/pictures.mjs): <img src="assets/<file>" alt width> amid
// a cell's words keeps the cell a text block (source/blocks.mjs cellPictureProblem), shown where the
// server serves the folder, the file in data-ge-src (components/table/ showPictures), written back from
// its element with its width (core.mjs serializeInner, the host's `pictures`), checked as a cell's text
// (a table's operation too: source/checks.mjs validCell); any other <img> in a cell locks it, and no
// other text block takes one.
{
  const { serveFiles } = await import("../../src/editor/page/served.mjs");
  const { cellPicture } = await import("../../src/editor/components/table/index.mjs");
  const { validCell } = await import("../../src/editor/source/checks.mjs");
  const { scan } = await import("../../src/editor/source/blocks.mjs");
  serveFiles((path) => `/__gallery/edit/asset/demo/${path}`);
  const s = studio(page(`  <p>前文<img src="assets/a.png" alt=""></p>
  <div class="doc-table-wrap">
    <table class="doc-table">
      <tbody>
        <tr><td>猫 <img src="assets/cat.png" alt="小猫" width="60"> 在此</td><td><a href="https://e.com/"><img alt="" src="assets/b.png"></a></td><td><img src="https://e.com/c.png"></td></tr>
      </tbody>
    </table>
  </div>
`));
  const [first, linked, remote] = [0, 1, 2].map((c) => s.cell(0, c));
  assert.ok(first.hasAttribute("data-ge-block") && linked.hasAttribute("data-ge-block") && !first.hasAttribute("data-ge-lock"), "a cell holding pictures (one in a link too) is a text block");
  assert.ok(!remote.hasAttribute("data-ge-block") && !s.document.querySelector("main > p").hasAttribute("data-ge-block"), "one of a web address locks its cell; no paragraph takes a picture");
  const img = first.querySelector("img");
  assert.deepEqual([img.getAttribute("src"), img.getAttribute("data-ge-src")], ["/__gallery/edit/asset/demo/assets/cat.png", "assets/cat.png"], "shown where the server serves it, the file kept");
  assert.equal(s.commits.build(), null, "as the file has it: nothing to write");
  img.setAttribute("width", "90");
  first.append(cellPicture(s.document, "assets/dog.png", { alt: "狗" }));
  const strange = s.document.createElement("img");
  strange.src = "https://e.com/pasted.png"; // one the browser put in from elsewhere: no part of the text
  first.append(strange);
  const sent = s.commits.build().request.texts[0].parts[0].html;
  assert.equal(sent, '猫 <img src="assets/cat.png" alt="小猫" width="90"> 在此<img src="assets/dog.png" alt="狗">', "written back from its element: its width now, a new one's file, none of no file");
  s.commit();
  assert.ok(s.file.includes('<td>猫 <img src="assets/cat.png" alt="小猫" width="90"> 在此<img src="assets/dog.png" alt="狗"></td>'), s.file);
  // What the server takes in a cell's text, and why a cell is locked.
  for (const [html, ok] of [['a<img src="assets/x.png" alt="" width="40">', true], ['<img src="assets/x.png">', true], ['<strong><img src="assets/x.png"></strong>', true], ['<ul><li><img src="assets/x.png"></li></ul>', true],
    ['<img src="assets/x.png" class="k">', false], ['<img src="assets/x.png" width="50%">', false], ['<img src="https://e.com/x.png">', false], ['<img src="assets/x.pdf">', false], ['<img src="../x.png">', false], ['<img src="assets/x.png" onerror="y()">', false]]) {
    assert.equal(validCell("td", html), ok, html);
  }
  assert.deepEqual(scan(page('<div class="doc-table-wrap"><table class="doc-table"><tbody><tr><td><img src="assets/x.png" style="width:9px"></td></tr></tbody></table></div>')).locks.map((lock) => lock.reason), ["picture"], "a picture written another way locks its cell, saying so");
}

// A cell's words read as a number (src/shared/number-reading.mjs): the one reading of the kit (a column
// is numeric only when every cell has a value; a sort compares them) and of 一键优化 (the header column
// holds no number). A number as tables write it: a qualifier, a sign (a Unicode minus too), a currency,
// grouped digits, a decimal part (a point alone too, as a number being typed), an exponent, a percent,
// a multiplier or a unit (千, 万 and 亿 scale it), a range (its first number), an accountant's negative,
// full-width characters as their ASCII.
for (const [words, value] of [
  ["12", 12], ["1.", 1], ["-3.5", -3.5], ["+7%", 7], ["$1,234.50", 1234.5], ["¥ 20", 20], ["15 ms", 15], [".5", 0.5], ["3 million", 3],
  ["€5", 5], ["±2", 2], ["~4", 4], ["约 30", 30], ["≥ 90%", 90], ["−3", -3], ["(12)", -12], ["1e3", 1000], ["50 元/月", 50],
  ["1,234,567", 1234567], ["1 234 567", 1234567], ["12,3456", 123456], ["１２，３４５％", 12345], ["3.2万", 32000], ["1.2万", 12000], ["3.4亿", 3.4e8], ["2千", 2000],
  ["3~5 天", 3], ["3–5", 3], ["1,2,3", null], ["A12", null], ["Q3", null], ["Alice", null], ["-", null], ["–", null], ["", null],
]) assert.equal(numberValue(words), value, `the shared reading takes "${words}" for ${value}`);
for (const raw of ["", "-", "—", "–", "−", "N/A", "n/a", "NA", "null"]) assert.equal(isMissingValue(raw), true, `"${raw}" is a missing value`);
for (const raw of ["0", "a", "12"]) assert.equal(isMissingValue(raw), false, `"${raw}" is not`);
// The value a sort reads from a cell (the kit's sort and the page editor's sortRows read it alike): a number,
// a date or its words by the header's sort type; null when the cell is missing or holds none.
{
  const { document } = new JSDOM("").window;
  const cell = (text, sortValue) => {
    const td = Object.assign(document.createElement("td"), { textContent: text });
    if (sortValue) td.dataset.sortValue = sortValue;
    return td;
  };
  assert.equal(parsedValue(cell("1,200 ms"), "number"), 1200);
  assert.equal(parsedValue(cell("−"), "number"), null, "a dash is missing");
  assert.equal(parsedValue(cell("3 / 4"), "number"), null, "a composite is no scalar");
  assert.equal(parsedValue(cell("2026-01-02"), "date"), Date.parse("2026-01-02"));
  assert.equal(parsedValue(cell("soon"), "date"), null);
  assert.equal(parsedValue(cell("Alice"), "text"), "Alice");
  assert.equal(parsedValue(cell("shown", "7"), "number"), 7, "its sort value first");
}
// The header column: names, none of the cells a number by that reading (its sort value when it has one), no two alike.
{
  const { document } = new JSDOM("").window;
  const column = (...texts) => texts.map((text) => Object.assign(document.createElement("td"), { textContent: text }));
  assert.equal(rowNames(column("Alice", "Bob")), true);
  assert.equal(rowNames(column("Alice", "€5")), false, "a currency amount: not a name");
  assert.equal(rowNames(column("Alice", "约 30")), false, "a qualified number: not a name");
  assert.equal(rowNames(column("Alice", "N/A")), true, "a missing value is no number");
  assert.equal(rowNames(column("Alice", "Alice")), false);
  assert.equal(rowNames(column("Alice")), false, "two at least");
  const dated = column("Alice", "Bob");
  dated[1].dataset.sortValue = "5";
  assert.equal(rowNames(dated), false, "a cell whose sort value is a number: the kit reads it as one");
}

// A cell's alignments and bold are classes in three places besides the editor's lists: the table's
// description (what an Agent may write) and styles/table.css (what draws it). A new one that misses one fails here.
const tableCss = fs.readFileSync(new URL("../../src/render/kit/styles/table.css", import.meta.url), "utf8");
for (const name of [...CELL_ALIGNS, ...CELL_VALIGNS].map(([each]) => each).concat(CELL_BOLD)) {
  assert.ok(tableDescription.classes.includes(name), `the table's description lists ${name}`);
  assert.ok(tableCss.includes(`.${name}`), `styles/table.css draws ${name}`);
}

// The alignments a cells' bar and a column's menu offer (page/table/aligns.mjs): the three, then the three vertical ones,
// the current one of each kind the cells' common one (the kit's own for cells with none, none for cells that differ).
{
  const { document } = new JSDOM("<table><tr><td class='doc-align-right doc-valign-middle'>a</td><td class='doc-align-right'>b</td><td>c</td></tr></table>").window;
  const [a, b, c] = document.querySelectorAll("td");
  const current = (cells) => alignItems(cells).filter((item) => item.current).map((item) => item.name);
  assert.deepEqual(alignItems([a]).map((item) => [item.vertical, item.name]), [...CELL_ALIGNS.map(([name]) => [false, name]), ...CELL_VALIGNS.map(([name]) => [true, name])]);
  assert.deepEqual(current([a]), ["doc-align-right", "doc-valign-middle"]);
  assert.deepEqual(current([a, b]), ["doc-align-right"], "the horizontal one shared, the vertical ones differ");
  assert.deepEqual(current([c]), ["doc-align-left", "doc-valign-top"], "the kit's own");
  assert.deepEqual(current([a, c]), [], "cells that differ in both: none");
  assert.equal(sharedAlign([a, b], CELL_ALIGNS), "doc-align-right");
  assert.equal(sharedAlign([c], CELL_ALIGNS), null);
  assert.equal(sharedAlign([a, c], CELL_ALIGNS), undefined);
  let chosen = null;
  alignItems([a], (name) => { chosen = name; }).find((item) => item.name === "doc-valign-bottom").run();
  assert.equal(chosen, "doc-valign-bottom");
  assert.deepEqual(alignLook("doc-valign-bottom"), { classes: { "doc-valign-top": false, "doc-valign-middle": false, "doc-valign-bottom": true } });
  assert.deepEqual(alignLook("doc-align-center").classes, { "doc-align-left": false, "doc-align-center": true, "doc-align-right": false });
}

// Whether a table is plain is judged once, by the server from the source (source/table.mjs plainTable, behind
// components/table/file.mjs `plain`): instrument() marks the table units it judges plain data-ge-grid (and
// the map's units say grid), the page only reads the mark (grid.mjs gridOf: no mark, no grid; reading it
// gives no row or cell an id), and an operation on a table the server does not judge plain is refused:
// the page never has tools for a table whose commit the file would turn down. Tags the file leaves out
// (a cell, a row, the tbody), a tbody before the thead, and cells that tile no rectangle are judged by
// the source, not by what the browser makes of it. A commit asks for a table's operation once
// (collectEdits hands the same one to the unit changes): the grid of the table is built once for it (not
// once for the cells to leave out and again for the unit's changes).
{
  const wrap = (inside) => `<div class="doc-table-wrap"><table class="doc-table">${inside}</table></div>`;
  const body = "<tbody><tr><td>1</td><td>2</td></tr></tbody>";
  const head = "<thead><tr><th>A</th><th>B</th></tr></thead>";
  const variants = {
    plain: [head + body, true],
    caption: ["<caption>c</caption>" + head + body, true],
    noHead: [body, true],
    merged: ['<thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td colspan="2" rowspan="2">m</td><td>3</td></tr><tr><td>6</td></tr></tbody>', true],
    footer: [body + "<tfoot><tr><td>1</td><td>2</td></tr></tfoot>", false],
    twoBodies: [body + body, false],
    noBody: ["<thead><tr><th>A</th></tr></thead>", false],
    emptyBody: [head + "<tbody></tbody>", true],
    noRows: ["<tbody></tbody>", false],
    bodyFirst: [body + head, false],
    hole: ["<tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td></tr></tbody>", false],
    pastSection: ['<thead><tr><th rowspan="2">A</th><th>B</th></tr></thead>' + body, false],
    noCellEnd: [head + "<tbody><tr><td>1<td>2</tr></tbody>", false],
    noRowEnd: [head + "<tbody><tr><td>1</td><td>2</td></tbody>", false],
    noBodyTag: [head + "<tr><td>1</td><td>2</td></tr>", false],
    noHeadEnd: ["<thead><tr><th>A</th><th>B</th></tr>" + body, false],
  };
  for (const [name, [inside, plain]] of Object.entries(variants)) {
    const source = page(`  ${wrap(inside)}
`);
    const { html, map } = instrument(source);
    const { document } = new JSDOM(html).window;
    const unit = document.querySelector(".doc-table-wrap");
    assert.equal(unit.hasAttribute("data-ge-grid"), plain, `${name}: marked plain or not`);
    assert.equal(map.units.find((each) => each.kind === "table").grid === true, plain, `${name}: the map says so too`);
    assert.equal(unit.querySelector("[data-ge-id]"), null, `${name}: the mark writes no id`);
    assert.equal(gridOf(unit) !== null, plain, `${name}: the page has a grid for the marked ones alone`);
    // The server writes an operation on the plain ones and turns down any other.
    const rows = [{ head: false, from: null, cells: [{ from: null, tag: "td", html: "x" }] }];
    const receipt = commitEdits({ current: source, texts: [], units: [tableOp(map, rows)], opening: source, seal });
    assert.equal(receipt.units[0].status === "applied", plain, `${name}: its operation is written or refused as the mark says`);
  }
  // A table made on the page has its tools from the start (the server writes it as the kit writes one), a header-only one has not (no body to write).
  const { document } = new JSDOM("<main></main>").window;
  assert.equal(newTable(document, { rows: [["a", "b"], ["c", "d"]], header: true }).hasAttribute("data-ge-grid"), true);
  assert.equal(newTable(document, { rows: [["a", "b"]], header: true }).hasAttribute("data-ge-grid"), false);
  // The file's word is taken in with a commit's answer: the table written is plain, and its unit has the mark still.
  const written = studio(TABLE);
  assert.ok(written.table().hasAttribute("data-ge-grid"));
  insertColumn(written.table(), 1);
  const answer = written.commit().receipt.units;
  assert.ok(answer.length > 0 && answer.every((entry) => entry.status === "applied"));
  assert.ok(written.table().hasAttribute("data-ge-grid"), "marked after a commit of its operation");
  assert.equal(written.map.units.find((each) => each.kind === "table").grid, true, "and the page's map says grid");
  const s = studio(TABLE);
  insertColumn(s.table(), 1);
  const window = s.document.defaultView;
  const read = window.Element.prototype.querySelectorAll;
  let reads = 0;
  window.Element.prototype.querySelectorAll = function (...args) { if (args[0] === ":scope > thead > tr, :scope > tbody > tr") reads++; return read.apply(this, args); };
  s.commits.build();
  window.Element.prototype.querySelectorAll = read;
  assert.equal(reads, 2, "a commit of one table whose rows changed builds its grid twice: for its operation, and for the snapshot the next commit is found against");
}

// A table's slots (src/shared/table-slots.mjs): the one tiling that the kit (render/kit/tables/layout.js),
// the page editor (a DOM's rows: slotsOf) and the server (an operation's spans: tileSpans) read a table by.
// The three agree on every table, among them the ones that tile no rectangle (a hole, an overlap, a
// span past its section, a span of 0), and the cell holding a column's width is the topmost one of that
// column alone.
{
  const tables = {
    plain: "<thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody>",
    merged: "<thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td colspan=\"2\" rowspan=\"2\">m</td><td>3</td></tr><tr><td>6</td></tr><tr><td>7</td><td>8</td><td>9</td></tr></tbody>",
    pastSection: "<thead><tr><th rowspan=\"2\">A</th><th>B</th></tr></thead><tbody><tr><td>2</td></tr></tbody>",
    pastTable: "<tbody><tr><td rowspan=\"2\">A</td><td>B</td></tr></tbody>",
    hole: "<tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td></tr></tbody>",
    overlap: "<tbody><tr><td rowspan=\"2\">1</td><td>2</td></tr><tr><td colspan=\"2\">3</td></tr></tbody>",
    zero: "<tbody><tr><td rowspan=\"0\">1</td></tr></tbody>",
  };
  const tiled = {};
  for (const [name, html] of Object.entries(tables)) {
    const { document } = new JSDOM(`<table>${html}</table>`).window;
    const rows = [...document.querySelectorAll("thead > tr, tbody > tr")];
    const dom = slotsOf(rows);
    const spans = tileSpans(rows.map((row) => ({ head: row.parentElement.localName === "thead", cells: [...row.cells].map((cell) => [cell.rowSpan, cell.colSpan]) })));
    tiled[name] = { dom, spans, rows };
    assert.equal(Boolean(dom), Boolean(spans), `${name}: the DOM and the spans tile alike`);
    if (!dom) continue;
    assert.equal(dom.columns, spans.columns);
    for (let r = 0; r < rows.length; r++) {
      for (let c = 0; c < dom.columns; c++) {
        const [row, index] = spans.matrix[r][c].split(":").map(Number);
        assert.equal(dom.matrix[r][c], rows[row].cells[index], `${name}: slot ${r},${c}`);
      }
    }
    for (const [cell, place] of dom.places) {
      const [row, index] = [rows.findIndex((each) => [...each.cells].includes(cell)), [...cell.parentElement.cells].indexOf(cell)];
      assert.deepEqual(spans.places.get(`${row}:${index}`), place, `${name}: where its cells are`);
    }
  }
  for (const name of ["plain", "merged"]) assert.ok(tiled[name].dom, `${name} tiles`);
  for (const name of ["pastSection", "pastTable", "hole", "overlap", "zero"]) assert.equal(tiled[name].dom, null, `${name} tiles no rectangle`);
  // The width of a column is held by the topmost cell of that column alone (a merged cell holds none)
  // and read from the first cell of that column alone that has one.
  const { dom, rows } = tiled.merged;
  const widthed = (...cells) => { for (const [cell, width] of cells) cell.style.setProperty("--doc-column-width", width); };
  assert.deepEqual([0, 1, 2].map((c) => widthHolder(dom, c)), [rows[0].cells[0], rows[0].cells[1], rows[0].cells[2]], "the header row's cells");
  assert.deepEqual(columnCells(dom, 2), [rows[0].cells[2], rows[1].cells[1], rows[2].cells[0], rows[3].cells[2]], "a column's cells alone, top down");
  assert.deepEqual(columnCells(dom, 0), [rows[0].cells[0], rows[3].cells[0]], "a merged cell is in no column alone");
  const widthOf = (cell) => cell.style.getPropertyValue("--doc-column-width").trim() || null;
  assert.deepEqual(columnWidths(dom, widthOf), [null, null, null]);
  widthed([rows[3].cells[0], "90px"], [rows[2].cells[0], "70px"], [rows[0].cells[2], "50px"]);
  assert.deepEqual(columnWidths(dom, widthOf), ["90px", null, "50px"], "the first cell of the column alone with a width, top down");
  // A cell whose `rowspan` ends in the next row holds the column of a table the server tiles the same way.
  assert.equal(widthHolder(tileSpans([{ head: false, cells: [[2, 1], [1, 1]] }, { head: false, cells: [[1, 1]] }]), 0), "0:0");
}

// The kit's numeric columns (render/kit/tables/cells.js): a column of numbers is centered and sorted
// by number; one whose header says it holds text or dates (data-sort-type) is read as written,
// left-aligned, however numeric its cells look (dates written 10.16, versions 1.10).
{
  const { document } = new JSDOM(`<table class="doc-table"><thead><tr><th>名称</th><th>数量</th><th data-sort-type="text">日期</th><th data-sort-type="date">截止</th></tr></thead>
    <tbody><tr><td>甲</td><td>12</td><td>10.9</td><td>10.16</td></tr><tr><td>乙</td><td>3.5</td><td>10.16</td><td>11.1</td></tr></tbody></table>`).window;
  const table = document.querySelector("table");
  assert.deepEqual(inferColumnSemantics(table), [1], "only the column of numbers its header leaves alone");
  const centered = [...table.rows[1].cells].map((cell) => cell.classList.contains("number"));
  assert.deepEqual(centered, [false, true, false, false]);
  assert.deepEqual([...table.tHead.rows[0].cells].map((cell) => cell.dataset.sortType ?? null), [null, "number", "text", "date"], "the headers' sorts as written");
}
// A footer's rows (<tfoot>: a total) are not read for which columns hold numbers, but its cells in a
// numeric column take the column's look where they hold a number or nothing (a total centered under
// its column); words stay as written, and a cell spanning columns is no one column's.
{
  const { document } = new JSDOM(`<table class="doc-table"><thead><tr><th>名称</th><th>数量</th><th>金额</th><th>备注</th></tr></thead>
    <tbody><tr><td>甲</td><td>12</td><td>3.5</td><td>好</td></tr><tr><td>乙</td><td>7</td><td>1</td><td>差</td></tr></tbody>
    <tfoot><tr><td>合计</td><td>19</td><td>—</td><td>4.5</td></tr><tr><td colspan="2">注</td><td>平均</td><td></td></tr></tfoot></table>`).window;
  const table = document.querySelector("table");
  assert.deepEqual(inferColumnSemantics(table), [1, 2], "the body's columns of numbers, the footer not read");
  const looks = [...table.tFoot.rows].map((row) => [...row.cells].map((cell) => cell.classList.contains("number")));
  assert.deepEqual(looks, [[false, true, true, false], [false, false, false]], "a total under its numeric column centered; words, a column of words and a spanning cell not");
}

// The cells on a framed table's right and bottom edges, marked where a cell spans rows (render/kit/
// tables/edges.js; styles/table.css clears their lines by the mark, the frame's line drawn once): a
// cell spanning down to the last row is on the bottom edge, one of the last column spanning rows on
// the right edge where the rows below it end inside; none in a table without one, outside a frame, or
// whose cells tile no rectangle, and the marks go when the span does.
{
  const edges = (html, framed = true) => {
    const { document } = new JSDOM(framed ? `<div class="doc-table-wrap"><table class="doc-table">${html}</table></div>` : `<table class="doc-table">${html}</table>`).window;
    const table = document.querySelector("table");
    markEdges(table);
    return { table, marks: [...table.rows].map((row) => [...row.cells].map((cell) => cell.getAttribute("data-doc-edge") ?? "")) };
  };
  assert.deepEqual(edges("<tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody>").marks, [["", ""], ["", ""]], "no merged cell: the stylesheet finds the edges itself");
  assert.deepEqual(edges("<tbody><tr><td>1</td><td rowspan=\"2\">x</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody>").marks, [["", "bottom", "right"], ["bottom", "right bottom"]], "a cell spanning down to the last row is on the bottom edge");
  assert.deepEqual(edges("<tbody><tr><td>1</td><td>2</td><td rowspan=\"2\">x</td></tr><tr><td>3</td><td>4</td></tr></tbody>").marks, [["", "", "right bottom"], ["bottom", "bottom"]], "the last column's merged cell on the right edge, the row below it ending inside");
  assert.deepEqual(edges("<thead><tr><th rowspan=\"2\">a</th><th>b</th></tr><tr><th>c</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody><tfoot><tr><td colspan=\"2\">合计</td></tr></tfoot>").marks, [["", "right"], ["right"], ["", "right"], ["right bottom"]], "a span in the head; the footer's last row the bottom");
  assert.deepEqual(edges("<tbody><tr><td>1</td><td rowspan=\"2\">x</td></tr><tr><td>3</td></tr></tbody>", false).marks, [["", ""], [""]], "a table outside a frame: its edges are its own lines");
  assert.deepEqual(edges("<tbody><tr><td rowspan=\"2\">x</td><td>1</td></tr><tr><td>2</td><td>3</td></tr></tbody>").marks, [["", ""], ["", ""]], "cells that tile no rectangle: none");
  const split = edges("<tbody><tr><td>1</td><td rowspan=\"2\">x</td></tr><tr><td>3</td></tr></tbody>");
  split.table.rows[0].cells[1].rowSpan = 1;
  split.table.rows[1].append(split.table.ownerDocument.createElement("td"));
  markEdges(split.table);
  assert.equal(split.table.querySelectorAll("[data-doc-edge]").length, 0, "the span split: the marks go");
}

// A table shown whole or at the kit's height (render/kit/tables/whole.js): whole when its body has
// WHOLE_ROWS rows at most, or at least half of its body's text (each column's measured together)
// stands in its columns of words (the allocator's narrative columns); a long table of data is not.
{
  const words = (width) => ({ words: true, width });
  const fields = (width) => ({ words: false, width });
  assert.equal(WHOLE_ROWS, 20);
  assert.equal(shownWhole(20, []), true, "a short table, its cells unread");
  assert.equal(shownWhole(21, [fields(300), fields(400)]), false, "a long table of short fields, names, paths or links");
  assert.equal(shownWhole(21, [fields(300), words(300)]), true, "half of its text in a column of words");
  assert.equal(shownWhole(21, [fields(100), fields(100), fields(100), words(600)]), true, "one column of words in four, most of the text (a date, a title, a group, a note)");
  assert.equal(shownWhole(21, [fields(400), fields(400), words(300)]), false, "a column of words holding less than half of the text");
  assert.equal(shownWhole(21, [words(0)]), false, "a long table of empty cells");
}

console.log("Checked tables' rows and columns: put in (wearing the look their column's or row's cells share), typed into, moved, taken out (never the last), copied, header row and column switched, written as one operation with what stayed as it was, the cells known where the file has them after it, undone, a conflict when someone else changed the table; merged cells made, grown and shrunk by rows and columns put in and taken out, split, the file's spans checked, and a new table written with its merged cells; lists in a cell as its text; a cell's words read as a number (the one reading of the kit and 一键优化, with its missing values); the alignments the cells' bar and a column's menu offer, and the classes of a cell's look in the table's description and styles/table.css; whether a table is plain judged once, by the server from the source, marked on its unit and only read by the page (the tags a file leaves out, a tbody before the thead, cells that tile no rectangle), the operation on a table the server does not judge plain refused, a table's operation built once per commit; a cell's start tag rewritten where it stands (a style kept as written); the slots the kit, the editor and the server share; the kit's numeric columns, none where a header says text or dates; the cells on a framed table's edges marked where a cell spans rows; a table shown whole when short or mostly words.");
