import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { componentNotes, databaseFixes, databaseReadings } from "../../src/render/component-checks.mjs";
import { FIELDS, databaseWarnings, problemPlaces } from "../../src/render/database-checks.mjs";
import { parseReport } from "../../src/render/report-tree.mjs";
import { databaseProblems, readDatabase, tableMarkup, writeDatabase } from "../../src/shared/database.mjs";
import { hasClass, walk } from "../../src/shared/html-tree.mjs";
import { skillSourceDirectory } from "../../src/shared/paths.mjs";
import { SAMPLE } from "../fixtures/database/sample.mjs";

// What gallery check notes of a database beyond what makes it read-only (src/render/database-checks.mjs,
// docs/render.md "Databases"): what an Agent writes that the format reads otherwise than meant, each at its
// line and said with how to write it; none on a database as the format writes one (every field a view and a
// column carry, as the page writes them), on the browser scenarios' sample or on the examples of the skill's
// databases.md; and the line of each problem that makes one read-only.

const page = (inner) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>t</title></head><body><main class="doc-page" data-doc-id="t">
<header class="doc-header"><h1 class="doc-title">t</h1></header>
${inner}
</main></body></html>`;
const databasesOf = (html) => {
  const found = [];
  walk(parseReport(html), (node) => { if (node.tagName === "div" && hasClass(node, "doc-database")) found.push(node); });
  return found;
};
const warningsOf = (inner) => databasesOf(page(inner)).flatMap((node) => databaseWarnings(node));
const saidOf = (inner) => warningsOf(inner).map(({ said }) => said);
const lineOf = (warning) => warning.node?.sourceCodeLocation?.startLine ?? null;
const database = (json, rows, header) => `<div class="doc-database">
<script type="application/json">${typeof json === "string" ? json : JSON.stringify(json, null, 2)}</script>
<table>
<thead><tr>${header}</tr></thead>
<tbody>
${rows.join("\n")}
</tbody>
</table>
</div>`;

const COLUMNS = [
  { id: "title", name: "任务", type: "title" },
  { id: "status", name: "状态", type: "select", options: [{ name: "待开始", color: "gray" }, { name: "进行中", color: "blue" }, { name: "已完成", color: "green", done: true }] },
  { id: "tags", name: "标签", type: "multi", options: [{ name: "前端", color: "blue" }, { name: "后端", color: "pink" }] },
  { id: "due", name: "截止", type: "date" },
  { id: "hours", name: "工时", type: "number" },
  { id: "rate", name: "进度", type: "number", numberFormat: { format: "percent" } },
  { id: "done", name: "完成", type: "checkbox" },
  { id: "left", name: "剩余", type: "formula", formula: "{工时} * (1 - {进度})" },
];
const HEADER = COLUMNS.filter((column) => column.type !== "formula").map((column) => `<th data-column="${column.id}">${column.name}</th>`).join("");
const ROWS = ["<tr><td>写方案</td><td>进行中</td><td>前端</td><td>2026-11-12</td><td>3</td><td>0.5</td><td></td></tr>", "<tr><td>评审</td><td>已完成</td><td>前端, 后端</td><td>2026-11-20</td><td>2</td><td>1</td><td>✓</td></tr>"];
const ok = (views, columns = COLUMNS, rows = ROWS, header = HEADER) => database({ columns, views }, rows, header);

// ---------- none where it is written as the format reads it ----------
{
  assert.deepEqual(saidOf(ok([{ id: "all", name: "全部", layout: "table" }])), [], "a database written as the format reads it: nothing to say");
  assert.deepEqual(saidOf(SAMPLE), [], "the browser scenarios' sample: nothing to say");
  // Every field the format writes, of a column and a view, a database read and written back (what the page writes).
  const written = writeDatabase(readDatabase({
    json: JSON.stringify({
      columns: [...COLUMNS.map((column) => ({ ...column, width: 120 })), { id: "hours2", name: "估时", type: "number", align: "right", numberFormat: { format: "cny", decimals: 1, display: "bar" } }, { id: "notes", name: "备注", type: "text", notes: true }],
      views: [
        { id: "v1", name: "表", layout: "table", hidden: ["tags"], filters: [{ id: "f1", prop: "status", op: "is", value: ["进行中"], segments: true }, { prop: "due", op: "before", value: "nextweek" }, { prop: "rate", op: "gte", value: 50 }, { prop: "done", op: "is", value: false }], sorts: [{ prop: "due", dir: "desc" }], groupBy: "status", calc: { hours: "sum", done: "pctChecked", due: "latest" }, showCalc: true, wrap: true, clickEdit: true, open: "center" },
        { id: "v2", layout: "board", boardBy: "status", cardSize: "l" },
        { id: "v3", layout: "calendar", dateBy: "due" },
        { id: "v4", layout: "chart", chart: { kind: "donut", x: "tags", agg: "avg", y: "hours", color: "green" } },
        { id: "v5", layout: "gallery", cardSize: "s" },
        { id: "v6", layout: "list", filters: [{ prop: "tags", op: "has", value: ["前端"] }, { prop: "left", op: "gt", value: 1 }] },
      ],
    }),
    header: [...COLUMNS, { id: "hours2", name: "估时" }, { id: "notes", name: "备注" }].filter((column) => column.type !== "formula").map((column) => ({ column: column.id, name: column.name })),
    rows: [["写方案", "进行中", "前端", "2026-11-12", "3", "0.5", "", "12", "先写大纲"]],
  }));
  for (const view of written.json.views) for (const key of Object.keys(view)) assert.ok(FIELDS.view.includes(key), `the format writes a view's ${key}: FIELDS.view holds it`);
  for (const column of written.json.columns) for (const key of Object.keys(column)) assert.ok(FIELDS.column.includes(key), `the format writes a column's ${key}: FIELDS.column holds it`);
  const markup = `<div class="doc-database">\n<script type="application/json">${JSON.stringify(written.json, null, 2)}</script>\n<table>${tableMarkup(written)}</table>\n</div>`;
  assert.deepEqual(saidOf(markup), [], "a database as the format writes one, every setting in it: nothing to say");
  // The skill's databases.md: each html example a database as the format reads it, nothing to say of it.
  const guide = fs.readFileSync(path.join(skillSourceDirectory, "references", "databases.md"), "utf8");
  const examples = [...guide.matchAll(/```html\n([\s\S]*?)```/g)].map(([, code]) => code);
  assert.ok(examples.length > 0 && examples.every((code) => code.includes("doc-database")), "databases.md shows a database");
  for (const code of examples) {
    const [node] = databasesOf(page(code));
    assert.deepEqual(databaseProblems(node), [], "databases.md's example is no read-only database");
    assert.deepEqual(databaseWarnings(node).map(({ said }) => said), [], "databases.md's example: nothing to say");
  }
}

// ---------- the JSON's fields: a field none, a kind none, a layout none ----------
{
  const said = saidOf(database({
    columns: [
      { id: "title", name: "任务", type: "title" },
      { id: "status", name: "状态", type: "status", options: ["待开始", "进行中"] },
      { id: "owner", name: "负责人", type: "select", options: [{ name: "林夏", color: "grey" }, { name: "林夏", color: "blue" }] },
      { id: "hours", name: "工时", type: "number", format: "percent" },
      { name: "无号", type: "text" },
    ],
    views: [{ id: "b", name: "看板", type: "board", boardBy: "status" }, { id: "k", layout: "kanban" }, { id: "b", name: "重复" }],
    rows: [],
  }, [], '<th data-column="title">任务</th><th data-column="status">状态</th><th data-column="owner">负责人</th><th data-column="hours">工时</th><th>无号</th>'));
  const has = (pattern, why) => assert.ok(said.some((each) => pattern.test(each)), `${why}:\n${said.join("\n")}`);
  has(/^its JSON: "rows" is no field .*the records are the rows of its <table>/, "records written into the JSON");
  has(/column 2 状态: "type": "status" is no kind of column and is read as text: write "type": "select"/, "a kind that is none, with the one meant");
  has(/column 2 状态: 2 options are no object/, "options as words, checked as of the kind meant");
  has(/option 林夏: "color": "grey" is none of gray/, "a color that is none");
  has(/two options are named 林夏/, "two options of one name");
  has(/column 4 工时: "format" is no field of a column and is not read: write "numberFormat"/, "a column's field that is none, with the one meant");
  has(/column 5 无号: it has no "id"/, "a column of no id");
  has(/view 看板: "type" is no field of a view and is not read: write "layout"/, "a view's field that is none");
  has(/view 看板: it has no "layout" and shows as a table: write "layout": "board"/, "a board with no layout");
  has(/view k: "layout": "kanban" is no layout and shows as a table: write "board"/, "a layout that is none");
  has(/view 重复: the id "b" is another view's/, "two views of one id");
}

// ---------- a view's columns, filters, sorts, totals and layouts ----------
{
  const said = saidOf(ok([
    { id: "a", name: "甲", layout: "board", boardBy: "状态", hidden: ["工时", "nothing"], sorts: ["due", { prop: "due", dir: "down" }] },
    { id: "b", name: "乙", layout: "list", filters: [{ prop: "status", op: "is", value: "进行中" }, { prop: "status", op: "isnot", value: ["完成"] }, { prop: "due", op: "before", value: "下周" }, { prop: "done", op: "is", value: "yes" }, { prop: "hours", op: "equals", value: 3 }, { prop: "rate", op: "gte", value: 0.5 }, { prop: "title", op: "contains", value: ["写"] }] },
    { id: "c", name: "丙", layout: "table", calc: { hours: "total", done: "sum" }, groupBy: "left" },
    { id: "d", name: "丁", layout: "calendar", dateBy: "hours" },
    { id: "e", name: "戊", layout: "chart", chart: { kind: "pie", x: "left", agg: "sum" } },
    { id: "f", name: "己", layout: "board", boardBy: "tags", boardHidden: ["设计"], cardSize: "xl", open: "right", wrap: "true" },
    { id: "g", name: "庚", layout: "calendar" },
    { id: "h", name: "辛", layout: "chart" },
  ]));
  const has = (pattern, why) => assert.ok(said.some((each) => pattern.test(each)), `${why}:\n${said.join("\n")}`);
  has(/view 甲: boardBy "状态" is a column's name: a view names a column by its id, "status"/, "a column named by its name");
  has(/view 甲: hidden names "工时" is a column's name.*"hours"/, "hidden by a name");
  has(/view 甲: hidden names "nothing" names no column \(the ids: title, status/, "hidden naming no column");
  has(/view 甲: the sort "due" is no object and not read: write \{ "prop": "due", "dir": "asc" \}/, "a sort written as words");
  has(/view 甲: a sort's "dir": "down" is asc or desc/, "a sort's direction");
  has(/view 乙: the filter on 状态: the value of "is" is a list of option names, \["进行中"\]: as written it hides every record/, "a select's value as words");
  has(/view 乙: the filter on 状态: "完成" is no option of 状态 \(待开始, 进行中, 已完成\)/, "a filter naming no option");
  has(/view 乙: the filter on 截止: the value of "before" is a date, 2026-11-12, or one of today/, "a date filter's words");
  has(/view 乙: the filter on 完成: the value of "is" for a checkbox column is true or false, not "yes"/, "a checkbox filter's words");
  has(/view 乙: the filter on 工时: "op": "equals" is no condition of a number column \(eq, ne, gt, lt, gte, lte, empty, nempty\)/, "a condition of another kind");
  has(/view 乙: the filter on 进度: a percent column's filter takes the percent as it shows \(60 for 60%\)/, "a percent's filter as a fraction");
  has(/view 乙: the filter on 任务: the value of "contains" is words/, "a text filter's list");
  has(/view 丙: calc "total" for 工时 is none of a number column's totals/, "a total that is none");
  has(/view 丙: calc "sum" for 完成 is none of a checkbox column's totals/, "a total of another kind");
  has(/view 丙: its totals \("calc"\) are hidden: "showCalc": true shows them/, "totals not shown");
  has(/view 丙: "groupBy" "left" is a formula column/, "a group by a formula");
  has(/view 丁: "dateBy" "hours" is a number column: a calendar lays records out by a date column/, "a calendar by a number");
  has(/view 戊: chart "kind": "pie" is column, bar, line or donut/, "a chart's kind");
  has(/view 戊: chart "x" "left" is a formula column/, "a chart's categories of a formula");
  has(/view 戊: chart "agg": "sum" needs "y"/, "a sum of nothing");
  has(/view 己: "boardBy" "tags" is a multi column: a board's columns are the options of a select column/, "a board by a multi");
  has(/view 己: "boardHidden" is kept but the board hides no column: it shows a column for every option of 标签; to leave some records out, filter the view \("op": "isnot", "value": \["设计"\]\)/, "a board's hidden columns, which the board does not hide");
  has(/view 己: "cardSize" is s, m or l/, "a card size");
  has(/view 己: "open" is side or center/, "where a record opens");
  has(/view 己: "wrap" is true or false/, "a switch written as words");
  has(/view 庚: a calendar needs "dateBy"/, "a calendar of no date");
  has(/view 辛: a chart view draws nothing until its "chart" names "x"/, "a chart of no categories");
  // A view's note stands at the line of its id in the script.
  const [node] = databasesOf(page(ok([{ id: "all", layout: "table" }, { id: "late", layout: "calendar" }])));
  const [warning] = databaseWarnings(node);
  const script = node.childNodes.find((child) => child.tagName === "script");
  const text = script.childNodes[0].value;
  assert.equal(lineOf(warning), script.sourceCodeLocation.startLine + text.slice(0, text.indexOf('"id": "late"')).split("\n").length - 1, "a view's note at its own line in the script");
}

// ---------- formulas ----------
{
  const said = saidOf(ok([{ id: "all", layout: "table" }], [...COLUMNS, { id: "f1", name: "坏", type: "formula", formula: "{已用} + FOO(1) + IFS(1)" }, { id: "f2", name: "甲", type: "formula", formula: "{乙} + 1" }, { id: "f3", name: "乙", type: "formula", formula: "{甲} * 2" }, { id: "f4", name: "断", type: "formula", formula: "ROUND({工时}" }, { id: "f5", name: "空", type: "formula", formula: "" }]));
  const has = (pattern, why) => assert.ok(said.some((each) => pattern.test(each)), `${why}:\n${said.join("\n")}`);
  has(/坏: its formula names \{已用\}, no column there is/, "a column named that there is not");
  has(/坏: its formula calls FOO\(\), no function of the formula language \(IF, ROUND/, "a function that is none");
  has(/坏: its formula calls IFS\(\)/, "each function that is none");
  has(/column 甲: its formula comes back to itself/, "formulas naming each other round");
  has(/断: its formula does not read; each record shows the error/, "a formula cut short");
  assert.ok(!said.some((each) => each.includes("空")), "a formula column with none written yet is said nothing of (a reader's new one)");
  assert.ok(!said.some((each) => each.includes("剩余")), "a formula naming columns by their names reads");
}

// ---------- the header against the JSON's columns, and the cells against their columns ----------
{
  const header = '<th data-column="title">任务</th><th data-column="state">状态</th><th>工时</th><th>负责</th><th data-column="due">到期</th>';
  const columns = [COLUMNS[0], COLUMNS[1], COLUMNS[3], COLUMNS[4], { id: "done", name: "完成", type: "checkbox" }, { id: "owner", name: "负责人", type: "select", options: [{ name: "林夏", color: "blue" }] }];
  const rows = ["<tr><td>写方案</td><td>进行中</td><td>3天</td><td>林夏</td><td>下周一</td></tr>", "<tr><td>评审</td><td>已完成</td><td>2</td></tr>"];
  const warnings = warningsOf(database({ columns, views: [{ id: "all", layout: "table" }] }, rows, header));
  const said = warnings.map((each) => each.said);
  const has = (pattern, why) => assert.ok(said.some((each) => pattern.test(each)), `${why}:\n${said.join("\n")}`);
  has(/header cell 状态: data-column="state" names no column of the JSON: it is read as a new column of words/, "a header cell naming no column by id");
  has(/header cell 负责 names no column of the JSON \(it has no data-column, and no column is named so\)/, "a header cell naming no column by its words");
  has(/header cell 到期: its column "due" is named 截止 in the JSON, which is the name shown/, "a header cell's words that are not its column's name");
  has(/column 状态 \("status"\) has no header cell, so every record's value of it is empty/, "a column of no header cell");
  has(/column 完成 \("done"\) has no header cell/, "each column of no header cell");
  has(/a row has fewer cells than the header \(row 2, line \d+\)/, "a row of fewer cells");
  has(/column 工时: a cell is no number .*record 写方案, line \d+: "3天"/, "a cell that is no number, its record and line");
  has(/column 截止: a cell is no date .*"下周一"/, "a cell that is no date");
  assert.ok(warnings.find((each) => each.said.startsWith("column 工时: a cell is no number")).node.sourceCodeLocation.startLine === warnings.find((each) => each.said.startsWith("column 截止")).node.sourceCodeLocation.startLine, "a cell's note at its row's line");
  // Options the cells name that the column does not list; two names in a select; a box neither checked nor not.
  const more = saidOf(ok([{ id: "all", layout: "table" }], COLUMNS, ["<tr><td>甲</td><td>完成</td><td>前端, 设计</td><td></td><td></td><td></td><td>是的</td></tr>", "<tr><td>乙</td><td>完成</td><td></td><td></td><td></td><td></td><td></td></tr>", "<tr><td>丙</td><td>待开始, 进行中</td><td></td><td></td><td></td><td></td><td></td></tr>"]));
  const hasMore = (pattern, why) => assert.ok(more.some((each) => pattern.test(each)), `${why}:\n${more.join("\n")}`);
  hasMore(/column 状态: a cell is two options in a single select/, "two names in a single select");
  hasMore(/column 标签: a cell names an option it does not list \(设计\): each shows as a new option .*write one of 前端, 后端/, "an option the cells name and the column does not list");
  hasMore(/column 完成: a cell is neither checked nor not/, "a box neither checked nor not");
  // A table with no JSON: its header names its columns, nothing to say of them.
  assert.deepEqual(saidOf('<div class="doc-database"><table><thead><tr><th>任务</th><th>状态</th></tr></thead><tbody><tr><td>写</td><td>进行中</td></tr></tbody></table></div>'), [], "a table alone: columns of words, nothing to say");
}

// ---------- what the div holds besides its parts ----------
{
  const said = saidOf(`<div class="doc-database"><p>说明</p><script type="text/json">{}</script><div class="doc-table-wrap"><table><tr><th>任务</th></tr></table></div></div>`);
  assert.ok(said.some((each) => each.startsWith("the <p> inside the database is none of it")), said.join("\n"));
  assert.ok(said.some((each) => each.startsWith('its <script type="text/json"> is not read: the columns and views are a <script type="application/json">')), said.join("\n"));
  assert.ok(said.some((each) => each.startsWith("its <table> is not straight inside its div")), said.join("\n"));
}

// ---------- its records' bodies ----------
// Its pages are its own: nothing said of bodies of the records its rows name; a body of no record, one twice, what in
// the pages is no body, two rows of one id, an id that is none and a database in a body each said.
{
  const table = (rows) => `<table><thead><tr><th>任务</th></tr></thead><tbody>${rows}</tbody></table>`;
  assert.deepEqual(saidOf(`<div class="doc-database">${table('<tr data-record="a"><td>甲</td></tr>')}<div class="doc-database-pages"><div data-doc-slot="record:a"><p>正文</p></div></div></div>`), [], "a body of a record its rows name: nothing to say");
  const said = saidOf(`<div class="doc-database">${table('<tr data-record="a"><td>甲</td></tr><tr data-record="a"><td>乙</td></tr><tr data-record="b c"><td>丙</td></tr>')}<div class="doc-database-pages"><div data-doc-slot="record:a"><p>一</p></div><div data-doc-slot="record:a"><p>二</p></div><div data-doc-slot="record:z"><p>三</p></div><p>散</p><div data-doc-slot="record:a2"><div class="doc-database">${table("<tr><td>x</td></tr>")}</div></div></div></div>`);
  for (const start of ['two rows say data-record="a"', 'a row\'s data-record="b c" is no record id', "a second body of record a", "the body record:z is no record's", "the <p> in its div.doc-database-pages is no record's body", "a database in the body record:a2"]) assert.ok(said.some((each) => each.startsWith(start)), `${start}: ${said.join("\n")}`);
}

// ---------- read-only: where each problem stands ----------
{
  const html = page(`<div class="doc-database">
<script type="application/json">{ "columns": [{ "id": "title", "name": "名称", "type": "title" }, { "id": "n", "name": "数", "type": "number" }] }</script>
<table>
<thead><tr><th data-column="title">名称</th><th data-column="n">数</th></tr></thead>
<tbody>
<tr><td><strong>甲</strong></td><td>1</td></tr>
<tr><td colspan="2">乙</td></tr>
<tr><td>丙</td><td style="color: red">3</td></tr>
<tr><td>丁</td><td><a href="https://example.com">4</a></td></tr>
</tbody>
</table>
</div>`);
  const [node] = databasesOf(html);
  const problems = databaseProblems(node);
  const places = problemPlaces(node, problems);
  const line = (words) => html.split("\n").findIndex((each) => each.includes(words)) + 1;
  assert.equal(places.get("markup:strong"), `line ${line("<strong>甲")}, column 名称`, "a cell's markup at its line and column");
  assert.equal(places.get("span:"), `line ${line('colspan="2"')}, column 名称`, "merged cells");
  assert.equal(places.get("attribute:style"), `line ${line("style=")}, column 数`, "an attribute");
  assert.equal(places.get("link:"), `line ${line("example.com")}, column 数`, "a link outside a url column");
  // gallery check's note to act on first (a fix line): read-only, each problem at its line; the warnings are notes, each at its own line.
  const fixes = databaseFixes(parseReport(html));
  assert.ok(fixes.length === 1 && /^line \d+: database read-only: /.test(fixes[0]) && fixes[0].includes(`a cell holds a <strong> (line ${line("<strong>甲")}, column 名称)`) && fixes[0].includes('databases.md, "Read-only"'), fixes.join("\n"));
  assert.ok(!componentNotes(parseReport(html)).some((note) => note.includes("read-only")), "read-only is a fix line, not a note");
  const mistaken = page(ok([{ id: "board", layout: "board", boardBy: "状态" }]));
  const said = componentNotes(parseReport(mistaken));
  assert.ok(said.some((note) => /^line \d+: database: view board: boardBy "状态" is a column's name/.test(note)), said.join("\n"));
  assert.deepEqual(databaseFixes(parseReport(mistaken)), [], "a database that reads is no fix line");
}

// ---------- what gallery check reads of each database: its records, and what each view shows ----------
{
  const views = [
    { id: "all", name: "全部", layout: "table", showCalc: true, calc: { hours: "sum" } },
    { id: "open", name: "未完成", layout: "list", filters: [{ prop: "status", op: "isnot", value: ["已完成"] }], sorts: [{ prop: "due", dir: "asc" }] },
    { id: "board", name: "看板", layout: "board", boardBy: "status", hidden: ["tags", "due", "rate", "done", "left"] },
    { id: "cal", name: "日历", layout: "calendar", dateBy: "due" },
    { id: "chart", name: "工时", layout: "chart", chart: { kind: "bar", x: "status", agg: "sum", y: "hours" } },
    { id: "nothing", name: "空图", layout: "chart" },
  ];
  const rows = [...ROWS, "<tr><td>上线</td><td>待开始</td><td></td><td></td><td>5</td><td>0</td><td></td></tr>"];
  const [reading] = databaseReadings(parseReport(page(ok(views, COLUMNS, rows))));
  const has = (part, why) => assert.ok(reading.includes(part), `${why}: ${reading}`);
  assert.match(reading, /^line \d+: 3 records, 8 columns, editable; views: /, "its records, columns and whether the page edits it");
  assert.ok(reading.endsWith("; formulas: 剩余: 写方案 1.5 · 评审 0 · 上线 5, none failing"), `each formula's values worked out, every record's where there are 20 or fewer, and none failing said: ${reading}`);
  has("全部 (table, 3 of 3 records shown; totals 工时 sum 10)", "a table's records and its totals, worked out");
  has("未完成 (list, filters 状态 isnot 已完成, sorted by 截止 asc, 2 of 3 records shown: 写方案, 上线; cards show the title and 状态, 标签, 截止, 工时, 进度, 完成, 剩余)", "a filtered view's filters in words, its records sorted, by their titles: those of no date last");
  has("看板 (board by 状态: 待开始 1 · 进行中 1 · 已完成 1; cards show the title and 状态, 工时)", "a board's columns and their counts, what its cards show");
  has("日历 (calendar by 截止: 2 dated, 1 undated; cards show the title and 状态, 标签, 工时, 进度, 完成, 剩余)", "a calendar's records with a date and without, what its items show (its date not)");
  has("工时 (bar chart of the sum of 工时 by 状态: 待开始 5 · 进行中 3 · 已完成 2)", "a chart's numbers by category");
  has("空图 (chart of no categories", "a chart of no categories said");
  const [locked] = databaseReadings(parseReport(page('<div class="doc-database"><table><thead><tr><th>任务</th></tr></thead><tfoot><tr><td>合计</td></tr></tfoot><tbody><tr><td>写</td></tr></tbody></table></div>')));
  assert.match(locked, /1 record, 1 column, read-only \(see its fix line\); views: table \(table, 1 of 1 record shown\)/, locked);

  // A grouped table's groups, each with its count and (showCalc) its totals; a card size; a chart's color; numbers drawn
  // as bars and stars; its own width, and the document's; the records that have a body, those keeping notes besides.
  const more = [
    { ...COLUMNS[0] }, COLUMNS[1], { ...COLUMNS[4], numberFormat: { display: "stars" } }, { ...COLUMNS[5], numberFormat: { format: "percent", display: "bar" } }, { id: "notes", name: "备注", type: "text", notes: true },
  ];
  const head = more.map((column) => `<th data-column="${column.id}">${column.name}</th>`).join("");
  const grouped = [
    { id: "by", name: "按状态", layout: "table", groupBy: "status", calc: { hours: "sum" }, showCalc: true },
    { id: "cards", name: "卡片", layout: "gallery", cardSize: "l", hidden: ["hours", "rate"] },
    { id: "pie", name: "占比", layout: "chart", chart: { kind: "donut", x: "status", agg: "sum", y: "hours", color: "green" } },
  ];
  const bodyRows = ['<tr data-record="plan"><td>写方案</td><td>进行中</td><td>3</td><td>0.5</td><td>先列提纲</td></tr>', '<tr data-record="review"><td>评审</td><td>已完成</td><td>2</td><td>1</td><td></td></tr>', "<tr><td>上线</td><td>进行中</td><td>4</td><td>0</td><td></td></tr>"];
  const pages = '<div class="doc-database-pages"><div data-doc-slot="record:plan"><p>先列提纲</p><ul><li><input type="checkbox"> 提纲</li></ul></div><div data-doc-slot="record:review"><figure class="doc-image"></figure></div></div>';
  const withBodies = (wide = "") => `<div class="doc-database"${wide}>\n<script type="application/json">${JSON.stringify({ columns: more, views: grouped })}</script>\n<table><thead><tr>${head}</tr></thead><tbody>${bodyRows.join("")}</tbody></table>\n${pages}\n</div>`;
  const [told] = databaseReadings(parseReport(page(withBodies())));
  const tells = (part, why) => assert.ok(told.includes(part), `${why}: ${told}`);
  assert.ok(!told.includes("grouped by 状态 (待开始"), `a group of no record is not drawn, nor said: ${told}`);
  tells("grouped by 状态 (进行中 2: 工时 sum 7; 已完成 1: 工时 sum 2)", "each group's count and totals, as its heading row shows them");
  tells("cards show the title and 状态; large cards", "what its cards show, the title always, and their size");
  tells("donut chart of the sum of 工时 by 状态 in shades of green: ", "a chart's color");
  tells("numbers drawn: 工时 as stars (0 to 5), 进度 as a bar of its percent", "number columns drawn as stars and bars");
  tells("bodies: 2 records (写方案, 评审), 写方案 keeping 备注 too", "the records that have a body, and those keeping their notes beside it");
  assert.match(told, /^line \d+: 3 records, 5 columns, editable; views:/, `no width said where neither it nor the document says one: ${told}`);
  assert.match(databaseReadings(parseReport(page(withBodies(' data-doc-wide="on"'))))[0], /editable, wide \(its own data-doc-wide="on"\); views/, "its own wide");
  assert.match(databaseReadings(parseReport(page(withBodies(' data-doc-wide="off"'))), { wideLook: true })[0], /editable, as wide as the text \(its own data-doc-wide="off", over the document's wide look\); views/, "its own narrow over the document's wide look");
  assert.match(databaseReadings(parseReport(page(withBodies())), { wideLook: true })[0], /editable, wide \(the document's look\); views/, "the document's wide look");
  // A body that opens with its record's notes word for word: its details show them twice.
  const repeated = saidOf(withBodies());
  assert.ok(repeated.length === 1 && repeated[0].startsWith("the body record:plan (写方案) opens with its record's 备注 word for word"), repeated.join("\n"));
  assert.deepEqual(saidOf(withBodies().replace("<td>先列提纲</td>", "<td></td>")), [], "notes moved into the body, the cell emptied: nothing to say");
}


// ---------- JSON that does not read: the line it stops at ----------
{
  const { componentFailures } = await import("../../src/render/component-checks.mjs");
  const broken = (json) => page(`<div class="doc-database">\n<script type="application/json">${json}</script>\n<table><thead><tr><th>任务</th></tr></thead><tbody><tr><td>写</td></tr></tbody></table>\n</div>`);
  const lineIn = (html, words) => html.split("\n").findIndex((line) => line.includes(words)) + 1;
  for (const [json, words, why] of [
    ['{\n  "columns": [\n    { "id": "title", "name": "任务", "type": "title" },\n  ],\n  "views": []\n}', '"type": "title" },', "a comma before a closing bracket"],
    ['{\n  "columns": [\n    { "id": "title", "name": "任务", "type": "title" }\n    { "id": "n", "name": "数", "type": "number" }\n  ]\n}', '"id": "n"', "two values with no comma between them"],
    ['{\n  "columns": [],\n  // views\n  "views": []\n}', "// views", "a comment"],
  ]) {
    const html = broken(json);
    const [failure] = componentFailures(html).filter((each) => each.startsWith("database"));
    assert.ok(failure?.includes(`near line ${lineIn(html, words)}`), `${why}: ${failure}`);
  }
}
console.log("Checked what gallery check notes of a database: none on one as the format writes it (every field of a column and a view), the browser scenarios' sample or databases.md's example; a field, a kind, a layout or an id that is none, a view naming a column by its name or naming none, a filter's condition and value of another kind, totals of another kind or hidden, a board, a calendar and a chart of the wrong column or none, a formula naming a column or a function there is not, formulas naming each other round, one that does not read; header cells of no column and columns of no header cell, rows of fewer cells, cells that are no value of their column, options the cells name and the column does not list; what the div holds besides its parts; and the line and column of each problem that makes one read-only, in gallery check's notes; and JSON that does not read failed with the line it stops at (a comma before a closing bracket, two values with no comma, a comment); and the line of information on each database (its records, each view's filters, records shown and their titles, a table's totals, a board's columns, a calendar's days, a chart's numbers and its color, a grouped table's groups with their totals, what a card shows and its size, numbers drawn as bars or stars, how wide it is drawn, the records that have a body) and a body repeating its record's notes.");
