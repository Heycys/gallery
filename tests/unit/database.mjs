import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { loadKitFile } from "../../src/render/kit-build.mjs";
import { cellText, cellValue, fileDate, fileNumber, isDate, layoutOf, newDatabase, numberText, optionName, optionNames, problemSaid, readDatabase, readElement, safeAddress, tableMarkup, writeDatabase } from "../../src/shared/database.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { allOf, fullRows, nodesOf, openForReading, viewOf } from "../../src/transfer/read-view.mjs";
import { EN } from "../../src/render/kit/database/words-en.js";

// A database (多维表格: src/shared/database.mjs, render/kit/database/): the file's values read and written
// back as they were (a number as its value, an option by its name, several apart by ", ", a date, ✓),
// what is no value of its kind kept as written, a table with no JSON read as columns of words, options a
// cell names that its column does not list added and not written until the column changes, the markup of
// its table read back as itself; the formula language and a view's filters, sorts, groups and counts (the
// kit's data modules, bundled here as the kit bundles them); every word the drawing says in Chinese with
// its English and none left over; the kit's files, React bundled in with its licence; gallery read's rows.

// ---------- values ----------
{
  const select = { id: "s", name: "状态", type: "select", options: [{ id: "todo", name: "待开始", color: "gray" }, { id: "done", name: "已完成", color: "green", done: true }] };
  const multi = { id: "m", name: "标签", type: "multi", options: [{ id: "前端", name: "前端", color: "blue" }, { id: "后端", name: "后端", color: "purple" }] };
  const cases = [
    [{ type: "number" }, "0.6", 0.6, "0.6"],
    [{ type: "number" }, "1,234.5", 1234.5, "1234.5"],
    [{ type: "number" }, "60%", 0.6, "0.6"],
    [{ type: "number" }, "很多", "很多", "很多"],
    [{ type: "number" }, "", null, ""],
    [{ type: "date" }, "2026-11-12", "2026-11-12", "2026-11-12"],
    [{ type: "date" }, "2026/11/2", "2026-11-02", "2026-11-02"],
    [{ type: "date" }, "下周", "下周", "下周"],
    [{ type: "checkbox" }, "✓", true, "✓"],
    [{ type: "checkbox" }, "", false, ""],
    [{ type: "checkbox" }, "否", false, ""],
    [{ type: "checkbox" }, "也许", "也许", "也许"],
    [select, "已完成", "done", "已完成"],
    [multi, "前端, 后端", ["前端", "后端"], "前端, 后端"],
    [multi, "前端、前端", ["前端"], "前端"],
    [{ type: "text" }, "两行\n文字", "两行\n文字", "两行\n文字"],
    [{ type: "url" }, "https://example.com/a", "https://example.com/a", "https://example.com/a"],
  ];
  for (const [column, written, value, back] of cases) {
    const read = cellValue(written, column);
    assert.deepEqual(read, value, `${column.type} ${JSON.stringify(written)} reads as ${JSON.stringify(value)}`);
    assert.equal(cellText(read, column), back, `${column.type} ${JSON.stringify(written)} is written back as ${JSON.stringify(back)}`);
  }
  // A number is written as every digit it holds and read back as itself (none rounded to 12 places, none past the largest).
  for (const value of [0.1 + 0.2, 1e-13, 0.1234567890123456, 1e300, -1e300, 12345678901234567000, 5e-324, -0.5]) {
    assert.equal(cellValue(cellText(value, { type: "number" }), { type: "number" }), value, `${value} written and read back as itself`);
  }
  assert.equal(cellText(0.6, { type: "number" }), "0.6", "a number with no more digits than it has");
  assert.equal(cellValue("1e400", { type: "number" }), "1e400", "a number past the largest is words, kept as written");
  assert.equal(fileNumber("12.3456%"), 0.123456, "a percent read by moving its point: 12.3456% is 0.123456 as that reads");
  assert.equal(fileNumber("7%"), 0.07);
  for (const value of [0.123456, 0.07, 1 / 3, 1e-9, 123.456, -0.35]) assert.equal(fileNumber(`${numberText(value, 2)}%`), value, `${value} as a percent's words (${numberText(value, 2)}%) and back`);
  assert.equal(numberText(0.123456, 2), "12.3456");
  assert.equal(fileNumber("¥12"), 12);
  assert.equal(fileDate("2026-13-01"), null, "no month 13");
  assert.equal(fileDate("2026-02-30"), null, "no 30 February");
  assert.equal(fileDate("2028-02-29"), "2028-02-29", "a leap day");
  assert.deepEqual([isDate("2026-11-12"), isDate("2026-13-45"), isDate("2026-02-29")], [true, false, false], "a date is a day of the calendar");
  assert.equal(cellValue("2026-13-45", { type: "date" }), "2026-13-45", "words that are no day kept as written");
  // An option's name holds nothing that parts names in a cell: a comma, a Chinese one, 、 are spaces.
  assert.equal(optionName(" 甲，乙、丙,丁 "), "甲 乙 丙 丁");
  const named = { id: "k", name: "标签", type: "multi", options: [{ id: "a", name: "甲，乙", color: "blue" }] };
  assert.equal(cellText(["a"], named), "甲 乙", "written by the name as the format holds it, which reads back as one option");
  // What parts several names is one rule, the file's as the kit's (typed, pasted, filled): a comma, a Chinese
  // one, 、 and a line break; a semicolon is part of a name, which a cell names as one option.
  assert.deepEqual(optionNames("前端\n后端；测试, 运维、产品，设计"), ["前端", "后端；测试", "运维", "产品", "设计"]);
  assert.equal(optionName("甲\n乙;丙"), "甲 乙;丙", "a line break parts names, so a name holds none; a semicolon stays");
  assert.deepEqual(cellValue("研发;测试", { id: "m", name: "团队", type: "multi", options: [{ id: "x", name: "研发;测试", color: "blue" }] }), ["x"], "a semicolon in a cell: one option");
  // Addresses a link may not go to.
  assert.deepEqual(["https://example.com", "javascript:alert(1)", " JaVaScript:x", "java\tscript:x", "data:text/html,x", "vbscript:x", ""].map(safeAddress), [true, false, false, false, false, false, false]);
}

// ---------- the whole: read, written, read back ----------
{
  const json = JSON.stringify({
    columns: [
      { id: "title", name: "任务", type: "title" },
      { id: "status", name: "状态", type: "select", options: [{ name: "待开始", color: "gray" }, { name: "已完成", color: "green", done: true }] },
      { id: "est", name: "估时", type: "number" },
      { id: "remain", name: "剩余", type: "formula", formula: "{估时} * 2" },
      { id: "notes", name: "备注", type: "text", notes: true },
    ],
    views: [{ id: "v1", name: "全部", layout: "table", filters: [{ id: "f1", prop: "status", op: "is", value: ["已完成"] }], sorts: [{ prop: "est", dir: "desc" }] }, { id: "v2", layout: "board", boardBy: "status" }],
  });
  const header = [{ column: "title", name: "任务" }, { column: "status", name: "状态" }, { column: "est", name: "估时" }, { column: "notes", name: "备注" }];
  const rows = [["登录页", "已完成", "12", ""], ["公式", "评审中", "x", "只做四则运算"]];
  const read = readDatabase({ json, header, rows });
  assert.equal(read.json, true);
  assert.deepEqual(read.columns.map((column) => column.type), ["title", "select", "number", "formula", "text"]);
  assert.equal(read.columns.find((column) => column.id === "remain").formula, "{est} * 2", "a formula's references by name read as ids");
  const status = read.columns.find((column) => column.id === "status");
  assert.deepEqual(status.options.map((option) => [option.id, option.name, Boolean(option.added)]), [["待开始", "待开始", false], ["已完成", "已完成", false], ["评审中", "评审中", true]], "an option a cell names is added, marked as such");
  assert.equal(read.rows[1].values.est, "x", "a number that is none kept as written");
  assert.deepEqual(read.views[0].filters[0].value, ["已完成"], "a filter's option by its name read as its id");
  const written = writeDatabase(read);
  assert.ok(!JSON.stringify(written.json).includes("评审中"), "an option added as the file was read is not written");
  assert.deepEqual(written.header.map(({ column }) => column), ["title", "status", "est", "notes"], "the formula has no column in the table");
  assert.deepEqual(written.rows, rows, "the records written back as they were");
  assert.equal(written.json.columns.find((column) => column.id === "status").options[0].id, undefined, "an option whose id is its name is written by its name alone");
  // A view names an option by its id or by its name as the format holds names (optionName): "C、D" is the
  // option of id cd named C D, found in a filter and in a board's hidden columns, and written back by its id.
  const groups = JSON.stringify({
    columns: [{ id: "t", name: "任务", type: "title" }, { id: "g", name: "组", type: "select", options: [{ id: "cd", name: "C、D", color: "blue" }, { id: "e", name: "E", color: "red" }] }],
    views: [{ id: "v1", layout: "board", boardBy: "g", boardHidden: ["C、D"], filters: [{ id: "f1", prop: "g", op: "is", value: ["C、D", "E"] }] }],
  });
  const grouped = readDatabase({ json: groups, header: [{ column: "t", name: "任务" }, { column: "g", name: "组" }], rows: [["a", "C D"]] });
  assert.deepEqual([grouped.views[0].filters[0].value, grouped.views[0].boardHidden], [["cd", "e"], ["cd"]], "an option a view names by a name of 、 found");
  assert.deepEqual([writeDatabase(grouped).json.views[0].filters[0].value, writeDatabase(grouped).json.views[0].boardHidden], [["cd", "e"], ["cd"]], "and written back by its id, none lost");
  // The table's markup, read back by a browser's parser as itself.
  const markup = tableMarkup(written, layoutOf("\n        <thead>"));
  const { document } = new JSDOM("<!doctype html><body></body>").window;
  const host = document.createElement("div");
  host.className = "doc-database";
  host.innerHTML = `<script type="application/json">${JSON.stringify(written.json)}</script><table>${markup}</table>`;
  assert.equal(host.querySelector("table").innerHTML, markup, "the table's markup reads back as itself");
  const again = readDatabase(readElement(host));
  const writtenAgain = writeDatabase(again);
  assert.deepEqual([writtenAgain.json, writtenAgain.rows, tableMarkup(writtenAgain, layoutOf("\n        <thead>"))], [written.json, written.rows, markup], "read again, the same");
  // A table laid out as an Agent writes one, its rows further in than its sections: written anew in that layout.
  const nested = `\n        <thead><tr><th data-column="title">任务</th><th data-column="status">状态</th><th data-column="est">估时</th><th data-column="notes">备注</th></tr></thead>\n        <tbody>\n          <tr><td>登录页</td><td>已完成</td><td>12</td><td></td></tr>\n          <tr><td>公式</td><td>评审中</td><td>x</td><td>只做四则运算</td></tr>\n        </tbody>\n      `;
  host.innerHTML = `<script type="application/json">${JSON.stringify(written.json)}</script><table>${nested}</table>`;
  assert.equal(tableMarkup(writeDatabase(readDatabase(readElement(host))), layoutOf(host.querySelector("table").innerHTML)), nested, "its rows' indentation kept (layoutOf: rows, last)");
  // Words that need escaping, and lines.
  const odd = readDatabase({ header: [{ column: null, name: "a<b" }], rows: [["x & y\nz"]] });
  const oddMarkup = tableMarkup(writeDatabase(odd));
  host.innerHTML = `<table>${oddMarkup}</table>`;
  assert.equal(host.querySelector("table").innerHTML, oddMarkup);
  assert.equal(readElement(host).rows[0][0], "x & y\nz", "a line break written as <br> and read back");
}

// ---------- an Agent's table with no JSON ----------
{
  const read = readDatabase({ json: null, header: [{ column: null, name: "任务" }, { column: null, name: "日期" }], rows: [["写方案", "2026-11-12"]] });
  assert.equal(read.json, false);
  assert.deepEqual(read.columns.map((column) => `${column.id}:${column.name}:${column.type}`), ["c1:任务:title", "c2:日期:text"], "columns of words named by the header, the first the title; no type guessed");
  assert.equal(read.views.length, 1, "one view of a table");
  const broken = readDatabase({ json: "{ not json", header: [{ column: null, name: "A" }], rows: [] });
  assert.equal(broken.problems.length, 1, "JSON that does not read is said, and the table read alone");
  const fresh = newDatabase("en");
  assert.deepEqual(fresh.columns.map((column) => column.name), ["Name", "Status", "Date"]);
}

// ---------- each header cell a column of its own: no column of the file lost by a write ----------
{
  const edited = (database) => writeDatabase({ ...database, rows: database.rows.map((row, at) => (at === 0 ? { ...row, values: { ...row.values, [database.columns[0].id]: "改" } } : row)) });
  // Two header cells of the same words, no JSON: two columns, both written back with their cells.
  const twice = readDatabase({ header: [{ column: null, name: "任务" }, { column: null, name: "备注" }, { column: null, name: "备注" }], rows: [["写方案", "第一份", "第二份"], ["评审", "甲", "乙"]] });
  assert.deepEqual([twice.readOnly, twice.columns.map((column) => `${column.id}:${column.name}`)], [false, ["c1:任务", "c2:备注", "c3:备注"]], "two header cells of the same words: two columns");
  assert.deepEqual(edited(twice).rows, [["改", "第一份", "第二份"], ["评审", "甲", "乙"]], "the first edit writes every column back");
  // A header cell of a JSON column's words beside the one that names it: a column of its own.
  const json = JSON.stringify({ columns: [{ id: "t", name: "任务", type: "title" }, { id: "o", name: "负责人", type: "text" }, { id: "est", name: "估时", type: "number" }, { id: "f", name: "翻倍", type: "formula", formula: "{est} * 2" }] });
  const beside = readDatabase({ json, header: [{ column: "t", name: "任务" }, { column: null, name: "负责人" }, { column: "o", name: "负责人" }], rows: [["a", "周舟", "林夏"]] });
  assert.equal(beside.readOnly, false);
  assert.deepEqual(edited(beside).header.map(({ column, name }) => `${column}:${name}`), ["t:任务", "o:负责人", "est:估时", "c2:负责人"], "the named one is the JSON's, the other a column of words");
  assert.deepEqual(edited(beside).rows[0], ["改", "林夏", "", "周舟"], "and each keeps its cells");
  // Two header cells naming one column, cells under a formula's header: read-only, said, every cell shown.
  for (const [what, header, code] of [
    ["two header cells of one data-column", [{ column: "t", name: "任务" }, { column: "o", name: "负责人" }, { column: "o", name: "负责人 2" }], "same-column"],
    ["a header cell naming a formula column", [{ column: "t", name: "任务" }, { column: "est", name: "估时" }, { column: "f", name: "翻倍" }], "formula-cells"],
    ["a header cell of a formula column's words", [{ column: "t", name: "任务" }, { column: "est", name: "估时" }, { column: null, name: "翻倍" }], "formula-cells"],
  ]) {
    const database = readDatabase({ json, header, rows: [["a", "3", "手写的 6"]] });
    assert.equal(database.readOnly, true, `${what}: read-only`);
    assert.ok(database.problems.some((problem) => problem.code === code), `${what}: said (${JSON.stringify(database.problems)})`);
    for (const language of ["zh", "en"]) assert.ok(database.problems.every((problem) => problemSaid(problem, language).length > 10 && !problemSaid(problem, language).includes("{0}")), `${what}: said in ${language}`);
    assert.ok(Object.values(database.rows[0].values).includes("手写的 6"), `${what}: its cells drawn all the same`);
  }
}

// ---------- the kit's data modules: the formula language, a view's records ----------
{
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-database-"));
  const entry = path.join(folder, "entry.ts");
  const kit = path.join(projectRoot, "src", "render", "kit", "database", "data").split(path.sep).join("/");
  fs.writeFileSync(entry, `export * from "${kit}/formula";\nexport * from "${kit}/query";\nexport * from "${kit}/values";\n`);
  const out = path.join(folder, "data.mjs");
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
  const data = await import(pathToFileURL(out).href);
  fs.rmSync(folder, { recursive: true, force: true });
  const value = (expr, values = {}, props = []) => {
    const byId = Object.fromEntries([...props, { id: "f", name: "f", type: "formula", formula: expr }].map((p) => [p.id, p]));
    return data.getValue({ id: "r", values }, byId.f, byId);
  };
  const est = { id: "est", name: "估时", type: "number" };
  const progress = { id: "progress", name: "进度", type: "number" };
  assert.equal(value("ROUND({est} * (1 - {progress}), 1)", { est: 30, progress: 0.35 }, [est, progress]), 19.5);
  assert.equal(value('IF({est} > 10, "大", "小")', { est: 30 }, [est]), "大");
  assert.equal(value('"共 " & {est} & " 小时"', { est: 3 }, [est]), "共 3 小时");
  assert.equal(value("DAYS(\"2026-12-01\", \"2026-11-24\")"), 7);
  assert.equal(value("MAX(1, 4, 2) + MIN(3, 5) * 2"), 10);
  assert.deepEqual(value("1 / 0"), { error: "除以 0" }, "a division by 0 is a failure, not Infinity");
  assert.ok(value("{nothing} + 1").error.includes("nothing"), "an unknown column said");
  assert.ok(value("SUM(1, ").error, "a formula cut short");
  assert.equal(value(""), null, "no formula yet: empty");
  const select = { id: "s", name: "状态", type: "select", options: [{ id: "a", name: "甲", color: "gray" }, { id: "b", name: "乙", color: "blue" }] };
  assert.equal(value('IF({s} = "乙", 1, 0)', { s: "b" }, [select]), 1, "an option is its name in a formula");
  // A view: filtered, sorted (what is empty last), grouped, counted.
  const props = [{ id: "t", name: "任务", type: "title" }, select, est];
  const rows = [{ id: "1", values: { t: "A", s: "a", est: 5 } }, { id: "2", values: { t: "B", s: "b", est: null } }, { id: "3", values: { t: "C", s: "b", est: 2 } }];
  const view = (filters, sorts) => data.applyView(rows, props, { filters, sorts }, "").map((row) => row.id);
  assert.deepEqual(view([{ id: "f", prop: "s", op: "is", value: ["b"] }], []), ["2", "3"]);
  assert.deepEqual(view([], [{ prop: "est", dir: "asc" }]), ["3", "1", "2"], "ascending, the empty last");
  assert.deepEqual(view([], [{ prop: "est", dir: "desc" }]), ["1", "3", "2"], "descending, the empty last too");
  assert.deepEqual(view([{ id: "f", prop: "est", op: "gt", value: "3" }], []), ["1"]);
  assert.deepEqual(data.groupRows(rows, select, Object.fromEntries(props.map((p) => [p.id, p]))).map((group) => [group.label, group.rows.length]), [["甲", 1], ["乙", 2]]);
  assert.equal(data.calc(rows, est, "sum", Object.fromEntries(props.map((p) => [p.id, p]))), "7");
  assert.equal(data.parseInput(est, "60%").value, 0.6);
  assert.equal(data.parseInput({ id: "d", name: "d", type: "date" }, "2026年3月4日").value, "2026-03-04");
  // What a reader types reads as a file's cell does: every digit of a number, none past the largest or of hex.
  for (const [typed, value] of [["1e300", 1e300], ["Infinity", "Infinity"], ["0x10", "0x10"], ["1e400", "1e400"], ["1e-13", 1e-13], ["0.1234567890123456", 0.1234567890123456], ["1,234.5", 1234.5], ["¥12", 12]]) {
    assert.equal(data.parseInput(est, typed).value, value, `${typed} typed is ${value}`);
  }
  const percent = { id: "p", name: "进度", type: "number", numberFormat: { format: "percent", decimals: 0, display: "number" } };
  for (const value of [0.123456, 0.35, 1 / 3, 0.0000123]) {
    const opened = data.editText(value, percent);
    assert.equal(data.parseInput(percent, opened).value, value, `a percent of ${value} opens as ${opened}, which reads back as itself`);
  }
  assert.equal(data.editText(0.123456, percent), "12.3456", "every digit of a percent in its editor");
  assert.equal(data.exactText(0.123456, percent), "12.3456%", "copied as every digit where what shows (12%) is another number");
  assert.equal(data.exactText(0.35, percent), "35%", "and as it shows where that is the number");
  // A box typed: checked, unchecked, or words that are neither kept as they are (shown gray).
  const box = { id: "c", name: "验收", type: "checkbox" };
  assert.deepEqual(["是", "✓", "已", "", "否", "需要复查"].map((typed) => data.parseInput(box, typed).value), [true, true, true, false, false, "需要复查"]);
  // A date that is no day of the calendar is no date: its words, gray.
  const day = { id: "d", name: "d", type: "date" };
  assert.deepEqual([data.normalizeDate("2026-13-45"), data.normalizeDate("2月30日"), data.normalizeDate("2026-11-25")], [null, null, "2026-11-25"]);
  assert.deepEqual([data.parseInput(day, "2026-13-45").value, data.isDirty("2026-13-45", day)], ["2026-13-45", true]);
  // An option typed: the one of that very name, then another case; a new one named as the format holds names.
  const kinds = { id: "k", name: "k", type: "select", options: [{ id: "a", name: "Done", color: "gray" }, { id: "b", name: "done", color: "blue" }] };
  assert.deepEqual(["Done", "done", "DONE"].map((typed) => data.parseInput(kinds, typed).value), ["a", "b", "a"]);
  assert.equal(data.parseInput(kinds, "甲，乙").newOptions[0].name, "甲 乙", "a single select's new option: what parts names a space");
  // Several options typed, pasted or filled are parted as a file's cell parts them (optionNames): a name the
  // reader made with a semicolon stays one option as its words go through a fill or a copy.
  const team = { id: "m", name: "团队", type: "multi", options: [{ id: "x", name: "研发;测试", color: "blue" }, { id: "y", name: "运维", color: "red" }] };
  assert.deepEqual([data.parseInput(team, "研发;测试").value, data.parseInput(team, "研发;测试").newOptions], [["x"], undefined], "a semicolon parts no names");
  const refilled = data.parseInput(team, data.editText(["x", "y"], team));
  assert.deepEqual([refilled.value, refilled.newOptions], [["x", "y"], undefined], "filled down from its words: the same options, none made");
  assert.deepEqual(data.parseInput(team, "运维\n产品").value.length, 2, "a line break parts names, as in a cell of the file");
  // A date that is no day of the calendar (2026-02-30) is none wherever dates count: no filter of days keeps it,
  // no earliest or latest, no day's words, no difference of days in a formula.
  const due = { id: "d", name: "截止", type: "date" };
  const dated = [{ id: "1", values: { d: "2026-02-28" } }, { id: "2", values: { d: "2026-02-30" } }];
  const dueBy = { d: due };
  assert.deepEqual(dated.filter((row) => data.matchFilter(row, { id: "f", prop: "d", op: "after", value: "2026-02-01" }, dueBy)).map((row) => row.id), ["1"], "a date filter counts real days alone");
  assert.equal(data.calc(dated, due, "latest", dueBy), data.friendlyDate("2026-02-28"), "the latest is a real day");
  assert.equal(data.friendlyDate("2026-02-30"), "2026-02-30", "no day's words for what is no day");
  assert.equal(value('DAYS("2026-02-30", "2026-02-28")'), null, "no difference of days from what is no day");
  // A url's value is a link only where it is no address of code.
  assert.deepEqual([data.safeHref("https://example.com/a"), data.safeHref("javascript:alert(1)"), data.safeHref(" data:text/html,x"), data.safeHref(3)], ["https://example.com/a", null, null, null]);
  // A column's kind changed: every value kept, as a file's cell of that kind reads its words.
  const title = { id: "t", name: "任务", type: "title" };
  const many = { props: [title, { id: "k", name: "类别", type: "text" }], rows: Array.from({ length: 65 }, (_, at) => ({ id: `r${at + 1}`, values: { t: `任务${at + 1}`, k: `类别${at + 1}` } })), views: [] };
  const selected = data.convertProp(many, "k", "select");
  const made = selected.props.find((prop) => prop.id === "k");
  assert.equal(made.options.length, 65, "an option for every value, however many");
  assert.deepEqual(writeDatabase({ columns: selected.props, rows: selected.rows, views: [] }).rows.map((row) => row[1]), many.rows.map((row) => row.values.k), "every value written by its option's name");
  const cased = data.convertProp({ props: [title, { id: "k", name: "k", type: "text" }], rows: [{ id: "1", values: { t: "a", k: "Done" } }, { id: "2", values: { t: "b", k: "done" } }, { id: "3", values: { t: "c", k: "甲，乙" } }], views: [] }, "k", "select");
  assert.deepEqual(writeDatabase({ columns: cased.props, rows: cased.rows, views: [] }).rows.map((row) => row[1]), ["Done", "done", "甲 乙"], "Done and done two options; a name with a comma one, as a file's cell reads it");
  const boxed = data.convertProp({ props: [title, { id: "k", name: "说明", type: "text" }, est], rows: [{ id: "1", values: { t: "a", k: "需要复查", est: 5 } }, { id: "2", values: { t: "b", k: "是", est: 1 } }, { id: "3", values: { t: "c", k: "", est: 0 } }], views: [] }, "k", "checkbox");
  assert.deepEqual(boxed.rows.map((row) => row.values.k), ["需要复查", true, false], "words to a box: checked, unchecked, or kept as they are");
  assert.deepEqual(data.convertProp(boxed, "est", "checkbox").rows.map((row) => row.values.est), ["5", true, false], "a number to a box: 1 and 0 checked and not, any other kept");
  assert.deepEqual(data.convertProp({ props: [title, percent], rows: [{ id: "1", values: { t: "a", p: 0.123456 } }], views: [] }, "p", "text").rows[0].values.p, "12.3456%", "a number to words: every digit of it");
  const tags = { id: "m", name: "标签", type: "multi", options: [{ id: "x", name: "前端", color: "blue" }, { id: "y", name: "后端", color: "red" }] };
  assert.equal(data.convertProp({ props: [title, tags], rows: [{ id: "1", values: { t: "a", m: ["y", "x"] } }], views: [] }, "m", "select").rows[0].values.m, "y", "a multi-select to a single one: its first option");
  // CSV: a formula worked out of every column, a hidden one too; what a spreadsheet would run starts with '.
  const twice = { id: "dbl", name: "翻倍", type: "formula", formula: "{est} * 2" };
  const csv = data.toCSV([{ id: "1", values: { t: "=HYPERLINK(\"http://x\")", est: 3 } }, { id: "2", values: { t: "-5", est: -5 } }, { id: "3", values: { t: "@x\r", est: 1 } }], [title, twice], [title, est, twice]);
  assert.equal(csv, '\ufeff任务,翻倍\n"\'=HYPERLINK(""http://x"")",6\n-5,-10\n"\'@x\r",2', `the CSV: ${JSON.stringify(csv)}`);
}

// ---------- its words: each in Chinese with its English, none left over ----------
{
  const folder = path.join(projectRoot, "src", "render", "kit", "database");
  const said = new Set();
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).forEach((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(full);
    if (!/\.(ts|tsx|js)$/.test(entry.name) || /^words(-en)?\.js$/.test(entry.name)) return;
    const text = fs.readFileSync(full, "utf8");
    for (const found of text.matchAll(/\bw\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) said.add(found[2]);
    if (entry.name === "formula.js") for (const found of text.matchAll(/(?:sig|desc): '([^']*)'/g)) said.add(found[1]);
    // No Chinese the drawing shows outside w(): in its modules' code (their comments aside), every Chinese
    // word goes through it. The data modules read what a reader types (今天, 2026年3月4日) and are left out.
    if (full.includes(`${path.sep}data${path.sep}`)) return;
    const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:'"`])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    const loose = code.split("\n").filter((line) => /[一-鿿]/.test(line) && !/\bw\(/.test(line) && !/(?:sig|desc): '/.test(line));
    assert.deepEqual(loose, [], `${entry.name}: Chinese outside w()`);
  });
  walk(folder);
  const missing = [...said].filter((key) => !(key in EN));
  assert.deepEqual(missing, [], "every word said has its English (words-en.js)");
  const unsaid = Object.keys(EN).filter((key) => !said.has(key));
  assert.deepEqual(unsaid, [], "every English is of a word said");
  const placeholders = (text) => [...String(text).matchAll(/\{(\d+)\}/g)].map((found) => found[1]).sort().join();
  for (const [key, english] of Object.entries(EN)) {
    if (typeof english === "string") assert.equal(placeholders(english), placeholders(key), `"${key}": the same {0}, {1}… in English`);
    else assert.ok(!/[一-鿿]/.test(english(1, 2)) && !/[一-鿿]/.test(english(3, 4)), `"${key}": its English counts`);
  }
}

// ---------- the kit's files ----------
{
  const script = await loadKitFile("database.js");
  const css = await loadKitFile("database.css");
  assert.ok(script.includes('component({id:"database"') || /component\(\{\s*id:\s*"database"/.test(script), "database.js registers the database");
  assert.ok(!/react|__SECRET_INTERNALS|process\.env/i.test(script), "no UI framework and no Node global in the bundle");
  assert.ok(script.length < 260_000, `database.js stays small: ${script.length}`);
  assert.ok(css.includes(".doc-database[data-doc-database] > table") && !/:root\b/.test(css.replace(/\/\*[\s\S]*?\*\//g, "")), "database.css hides the file's table while it draws, and sets nothing of the page's root");
}

// ---------- gallery read ----------
{
  const source = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>T</title></head><body><main class="doc-page" data-doc-id="t">
  <header class="doc-header"><h1 class="doc-title">T</h1></header>
  <div class="doc-database" data-block-id="db000001">
    <script type="application/json">{ "columns": [{ "id": "title", "name": "任务", "type": "title" }, { "id": "status", "name": "状态", "type": "select", "options": [{ "name": "进行中", "color": "blue" }] }], "views": [{ "id": "v1", "name": "全部", "layout": "table" }] }</script>
    <table><thead><tr><th data-column="title">任务</th><th data-column="status">状态</th></tr></thead><tbody><tr><td>写方案</td><td>进行中</td></tr><tr><td>a | b</td><td></td></tr></tbody></table>
  </div>
</main></body></html>`;
  const opened = await openForReading(source);
  const model = nodesOf(opened);
  const view = viewOf(opened, model);
  const rows = fullRows(model.roots, view).map((row) => row.text);
  const node = allOf(model.roots).find((each) => each.kind === "database");
  assert.ok(node, "a database is a unit of its own");
  assert.ok(rows.some((row) => row.includes("多维表格 · 2 列 · 2 条记录")), rows.join("\n"));
  assert.ok(rows.some((row) => row.includes("列：任务（title · 标题） · 状态（status · 单选：进行中）")), rows.join("\n"));
  assert.ok(rows.some((row) => row.includes("| 写方案 | 进行中 |")) && rows.some((row) => row.includes("| a \\| b |  |")), rows.join("\n"));
  assert.ok(!allOf(model.roots).some((each) => each.kind === "table"), "its table is no table unit of the document");
  // Each record at its line in doc.html, the table before the JSON, its formula columns said to be in no cell, the
  // ids of its columns and views, an option the cells name that the JSON does not list; and its data's records.
  const withFormula = source
    .replace('{ "id": "status", "name": "状态", "type": "select", "options": [{ "name": "进行中", "color": "blue" }] }]', '{ "id": "status", "name": "状态", "type": "select", "options": [{ "name": "进行中", "color": "blue" }] }, { "id": "twice", "name": "两倍", "type": "formula", "formula": "LEN({任务}) * 2" }]')
    .replace("<tr><td>a | b</td><td></td></tr>", "<tr><td>a | b</td><td></td></tr>\n<tr><td>c</td><td>完成</td></tr>");
  const reopened = await openForReading(withFormula);
  const remodel = nodesOf(reopened);
  const all = fullRows(remodel.roots, viewOf(reopened, remodel));
  const texts = all.map((row) => row.text);
  const lineOfWords = (words) => withFormula.split("\n").findIndex((line) => line.includes(words)) + 1;
  assert.ok(texts.some((text) => text.includes("多维表格 · 3 列（公式 1 列） · 3 条记录")), texts.join("\n"));
  assert.ok(texts.some((text) => text.includes("列：任务（title · 标题） · 状态（status · 单选：进行中；格子里另写了（JSON 没列）：完成） · 两倍（twice · 公式：= LEN({任务}) * 2）")), texts.join("\n"));
  assert.ok(texts.some((text) => text.includes("视图：全部（v1 · 表格）")), texts.join("\n"));
  // A number column's format and its bar or stars said beside its kind.
  const drawn = withFormula.replace('{ "id": "twice"', '{ "id": "rate", "name": "进度", "type": "number", "numberFormat": { "format": "percent", "display": "bar" } }, { "id": "score", "name": "评分", "type": "number", "numberFormat": { "display": "stars" } }, { "id": "twice"');
  const drawnOpened = await openForReading(drawn);
  const drawnModel = nodesOf(drawnOpened);
  const drawnTexts = fullRows(drawnModel.roots, viewOf(drawnOpened, drawnModel)).map((row) => row.text);
  assert.ok(drawnTexts.some((text) => text.includes("进度（rate · 数字：percent；显示成进度条） · 评分（score · 数字：显示成星级）")), drawnTexts.join("\n"));
  assert.ok(texts.some((text) => text.includes("公式列（两倍）没有格子，不在上表")), texts.join("\n"));
  const record = all.find((row) => row.text.includes("| 写方案 | 进行中 |"));
  assert.equal(record.line, lineOfWords("<td>写方案</td>"), "a record's row at its line in doc.html");
  assert.ok(texts.findIndex((text) => text.includes("| 写方案 |")) < texts.findIndex((text) => text.includes("列和视图的 JSON")), "its records before its JSON");
  assert.equal(all.find((row) => row.text.includes('"columns"')).line, lineOfWords('<script type="application/json">'), "its JSON's lines at their lines in doc.html");
  const data = allOf(remodel.roots).find((each) => each.kind === "database");
  const { READS } = await import("../../src/editor/components/registry.mjs");
  const read = READS.database.data(data);
  assert.deepEqual(read.records, [{ title: "写方案", status: "进行中" }, { title: "a | b", status: "" }, { title: "c", status: "完成" }], "--format json: each record's words by column id");
  assert.equal(read.readOnly, false);
  assert.deepEqual(read.problems, []);
}

// ---------- what a clipboard carries: a database of its format alone comes onto a page ----------
{
  const { document: doc } = new JSDOM("<!doctype html><body></body>").window;
  const { types } = (await import("../../src/editor/components/database/index.mjs")).default;
  const clip = types.database.clipboard;
  const string = (value, most) => typeof value === "string" && value.length <= most;
  const block = (html) => ({ type: "database", html, header: true, rows: [["a"]] });
  const json = '<script type="application/json">{"columns":[{"id":"t","name":"任务","type":"title"},{"id":"u","name":"链接","type":"url"}],"views":[]}</script>';
  const of = (body, head = '<thead><tr><th data-column="t">任务</th><th data-column="u">链接</th></tr></thead>') => `<div class="doc-database">${json}<table>${head}<tbody>${body}</tbody></table></div>`;
  assert.equal(clip.check(block(of('<tr><td>a<br>b</td><td><a href="https://example.com/x">x</a></td></tr>')), { string, doc }), true, "a database of its format is taken: words, a line break, a url cell's link");
  for (const [said, html] of [
    ["a picture with a handler, of its own", '<div class="doc-database"><img src="x" onerror="alert(1)"><table><tbody><tr><td>a</td></tr></tbody></table></div>'],
    ["a picture with a handler, in a cell", of('<tr><td><img src="x" onerror="alert(1)">a</td><td></td></tr>')],
    ["a handler on a cell", of('<tr><td onclick="alert(1)">a</td><td></td></tr>')],
    ["a link to code", of('<tr><td>a</td><td><a href="javascript:alert(1)">x</a></td></tr>')],
    ["a cell's style", of('<tr><td style="color: red">a</td><td></td></tr>')],
    ["words in bold", of('<tr><td><strong>a</strong></td><td></td></tr>')],
    ["a script of code", `<div class="doc-database"><script>alert(1)</script><table><tbody><tr><td>a</td></tr></tbody></table></div>`],
    ["a script of linked data, no part of its", `<div class="doc-database"><script type="application/ld+json">{}</script><table><tbody><tr><td>a</td></tr></tbody></table></div>`],
    ["another element in it", `<div class="doc-database"><p>x</p><table><tbody><tr><td>a</td></tr></tbody></table></div>`],
    ["an attribute of its own", '<div class="doc-database" onmouseover="alert(1)"><table><tbody><tr><td>a</td></tr></tbody></table></div>'],
  ]) assert.equal(clip.check(block(html), { string, doc }), false, `refused: ${said}`);
  // The server takes a new one alike (file.mjs source): one of the format, nothing else.
  const FILES = (await import("../../src/editor/components/database/file.mjs")).default.database;
  const written = (markup) => markup;
  assert.ok(FILES.source({ html: of('<tr><td>a</td><td><a href="https://example.com/x">x</a></td></tr>') }, { written }), "the server writes one of the format");
  for (const html of [of('<tr><td><strong>a</strong></td><td></td></tr>'), of('<tr><td style="color: red">a</td><td></td></tr>'), of('<tr><td>a</td><td><a href="javascript:alert(1)">x</a></td></tr>')]) assert.equal(FILES.source({ html }, { written }), null, `the server refuses ${html.slice(120, 190)}`);
}

// ---------- what the format holds of a table, and what it does not ----------
{
  const S = await import("../../src/shared/database.mjs");
  const { document } = new JSDOM("<!doctype html><body></body>").window;
  const hostOf = (inner) => {
    const host = document.createElement("div");
    host.className = "doc-database";
    host.innerHTML = inner;
    return host;
  };
  const columns = '{"columns":[{"id":"t","name":"任务","type":"title"},{"id":"u","name":"链接","type":"url"},{"id":"s","name":"负责人","type":"select","options":[{"name":"林夏"},{"name":"周舟"}]},{"id":"n","name":"估时","type":"number"},{"id":"d","name":"截止","type":"date"},{"id":"c","name":"验收","type":"checkbox"}],"views":[]}';
  const head = '<thead><tr><th data-column="t">任务</th><th data-column="u">链接</th><th data-column="s">负责人</th><th data-column="n">估时</th><th data-column="d">截止</th><th data-column="c">验收</th></tr></thead>';
  const row = '<tr><td>写方案</td><td><a href="https://example.com/pr/12">PR #12</a></td><td>林夏, 周舟</td><td>1,234.5</td><td>下周</td><td>否</td></tr>';
  const host = hostOf(`<script type="application/json">${columns}</script><table>${head}<tbody>${row}</tbody></table>`);
  const cellsOf = (markup) => [...markup.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((found) => found[1]);
  const writtenOf = (database) => cellsOf(S.tableMarkup(S.writeDatabase(database)));
  const read = S.readDatabase(S.readElement(host));
  assert.equal(read.readOnly, false, "a table of the format is written");
  assert.equal(read.rows[0].values.u, "https://example.com/pr/12", "a url cell holding a link: its value the link's address");
  assert.deepEqual(writtenOf(read), cellsOf(row), "each cell written back as it was while the reader has not changed it: the link with its words, two names in a single select, a number with a comma, words that are no date, a box's 否");
  const changed = structuredClone(read);
  Object.assign(changed.rows[0].values, { u: "https://example.com/pr/13", n: 7, c: true });
  assert.deepEqual(writtenOf(changed), ["写方案", "https://example.com/pr/13", "林夏, 周舟", "7", "下周", "✓"], "a cell the reader changed written from its value, the others as they were");
  const plain = hostOf(`<script type="application/json">${columns}</script><table>${head}<tbody><tr><td>写方案</td><td></td><td>林夏</td><td>3</td><td>2026-11-12</td><td>✓</td></tr></tbody></table>`);
  const option = S.readDatabase(S.readElement(plain));
  option.columns.find((column) => column.id === "s").options[0].name = "林";
  assert.equal(writtenOf(option)[2], "林", "an option renamed: its cells say the new name");
  // What the kit's passes over a page's text put in (a long run held whole, a range) is none of the file's
  // markup: a page's database whose cells carry such spans reads as the file has it, writable, the spans
  // in no cell's markup.
  const decorated = hostOf(`<script type="application/json">${columns}</script><table>${head}<tbody><tr><td>写方案 <span class="doc-range">3–5</span> 天</td><td><span class="doc-long-run">https://example.com/spec/login</span></td><td>林夏</td><td>3</td><td>2026-11-12</td><td></td></tr></tbody></table>`);
  const fromPage = S.readElement(decorated);
  const readPage = S.readDatabase(fromPage);
  assert.deepEqual([readPage.readOnly, readPage.problems], [false, []], "a database the kit decorated is not read-only");
  assert.deepEqual([readPage.rows[0].values.t, readPage.rows[0].values.u], ["写方案 3–5 天", "https://example.com/spec/login"], "its values the file's words");
  assert.ok(fromPage.cells[0].every((markup) => !markup.includes("<span")), `no span in a cell's markup: ${JSON.stringify(fromPage.cells[0])}`);
  // Structure the format cannot hold: read-only, said, never rewritten.
  const shapes = {
    tfoot: `<table><thead><tr><th>任务</th></tr></thead><tbody><tr><td>a</td></tr></tbody><tfoot><tr><td>合计</td></tr></tfoot></table>`,
    "header-rows": `<table><thead><tr><th>任务</th></tr><tr><th>说明</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table>`,
    "wide-row": `<table><thead><tr><th>任务</th></tr></thead><tbody><tr><td>a</td><td>多出来的</td></tr></tbody></table>`,
    markup: `<table><thead><tr><th>任务</th></tr></thead><tbody><tr><td><strong>重要</strong>的事</td></tr></tbody></table>`,
    caption: `<table><caption>任务</caption><thead><tr><th>任务</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table>`,
    span: `<table><thead><tr><th>任务</th><th>负责人</th></tr></thead><tbody><tr><td colspan="2">a</td></tr></tbody></table>`,
    attribute: `<table><thead><tr><th>任务</th></tr></thead><tbody><tr><td style="color: red">a</td></tr></tbody></table>`,
    bodies: `<table><thead><tr><th>任务</th></tr></thead><tbody><tr><td>a</td></tr></tbody><tbody><tr><td>b</td></tr></tbody></table>`,
  };
  for (const [code, table] of Object.entries(shapes)) {
    const database = S.readDatabase(S.readElement(hostOf(table)));
    assert.equal(database.readOnly, true, `${code}: read-only`);
    assert.ok(database.problems.some((problem) => problem.code === code), `${code}: said (${JSON.stringify(database.problems)})`);
    for (const language of ["zh", "en"]) assert.ok(database.problems.every((problem) => typeof S.problemSaid?.(problem, language) === "string" && S.problemSaid(problem, language).length > 2), `${code}: said in ${language}`);
  }
  const linkElsewhere = S.readDatabase(S.readElement(hostOf(`<table><thead><tr><th>任务</th></tr></thead><tbody><tr><td><a href="https://example.com/">a</a></td></tr></tbody></table>`)));
  assert.equal(linkElsewhere.readOnly, true, "a link in a column that is no url's: read-only");
  // An attribute that changes nothing the format holds, but that no write of the table could carry (what the
  // page and the server refuse in a data part: refusedInData), makes it read-only at once, said; never a table
  // that looks editable while every change of it is refused.
  const { refusedInData } = await import("../../src/shared/components/installed.mjs");
  const unwritable = [
    ["a block's identity on a row", `<script type="application/json">${columns}</script><table>${head}<tbody>${row.replace("<tr>", '<tr data-block-id="b-1">')}</tbody></table>`, "attribute", "tr"],
    ["an address of code in a cell's title", `<script type="application/json">${columns}</script><table>${head}<tbody>${row.replace("<td>写方案", '<td title="javascript:alert(1)">写方案')}</tbody></table>`, "code", "td"],
    ["an address of code, spaced, in a header's data-*", `<script type="application/json">${columns}</script><table>${head.replace('<th data-column="t">', '<th data-column="t" data-note=" vbscript:x">')}<tbody>${row}</tbody></table>`, "code", "th"],
    ["an address of code as a header's column", `<table><thead><tr><th data-column="javascript:x">任务</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table>`, "code", "th"],
    ["an address of code on a url cell's link", `<script type="application/json">${columns}</script><table>${head}<tbody>${row.replace('<a href="https://example.com/pr/12">', '<a href="https://example.com/pr/12" title="javascript:void(0)">')}</tbody></table>`, "markup", "a"],
  ];
  for (const [what, inner, code, tag] of unwritable) {
    const element = hostOf(inner);
    const database = S.readDatabase(S.readElement(element));
    assert.ok([...element.querySelector("table").querySelectorAll(tag)].some((node) => refusedInData(node.localName, [...node.attributes])), `${what}: what a data part refuses`);
    assert.equal(database.readOnly, true, `${what}: read-only`);
    assert.ok(database.problems.some((problem) => problem.code === code), `${what}: said (${JSON.stringify(database.problems)})`);
    for (const language of ["zh", "en"]) assert.ok(database.problems.every((problem) => S.problemSaid(problem, language).length > 4 && !S.problemSaid(problem, language).includes("{0}")), `${what}: said in ${language}`);
    assert.ok(S.databaseProblems(element).some((problem) => problem.code === code), `${what}: the server's checks say so too (databaseProblems)`);
  }
  // And every attribute it keeps is one a data part may hold: none of a readable table's elements is refused there.
  assert.ok(![...host.querySelector("table").querySelectorAll("*")].some((node) => refusedInData(node.localName, [...node.attributes])), "a table of the format holds nothing a data part refuses");
  // JSON that does not read: read-only, its error said.
  const broken = S.readDatabase(S.readElement(hostOf(`<script type="application/json">{ "columns": [ }</script><table><thead><tr><th>任务</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table>`)));
  assert.equal(broken.readOnly, true, "JSON that does not read: read-only");
  assert.ok(broken.problems.some((problem) => problem.code === "json" && problem.detail), JSON.stringify(broken.problems));
  // Only application/json is its JSON: a script of linked data is none of its parts.
  const linked = S.readElement(hostOf(`<script type="application/ld+json">{"@type":"Thing"}</script><table><thead><tr><th>任务</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table>`));
  assert.equal(linked.json, null, "an ld+json script is not its JSON");
  // gallery check: JSON that does not read fails, a table the format cannot hold is a note.
  const { componentFailures, databaseFixes } = await import("../../src/render/component-checks.mjs");
  const { parseReport } = await import("../../src/render/report-tree.mjs");
  const page = (body) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>T</title></head><body><main class="doc-page" data-doc-id="t">\n${body}\n</main></body></html>`;
  const failed = componentFailures(page(`<div class="doc-database"><script type="application/json">{ "columns": [ }</script><table><thead><tr><th>任务</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table></div>`));
  assert.ok(failed.some((failure) => /database/.test(failure) && /JSON/.test(failure) && /line \d+/.test(failure)), `gallery check fails JSON that does not read: ${JSON.stringify(failed)}`);
  const noted = databaseFixes(parseReport(page(`<div class="doc-database">${shapes.tfoot}</div>`)));
  assert.ok(noted.some((note) => /database read-only/.test(note) && /tfoot/.test(note)), `and notes a table it cannot hold, among the notes to act on first: ${JSON.stringify(noted)}`);
}

// ---------- the server: a part the file does not hold is empty, and an empty one is none ----------
{
  const { parse } = await import("parse5");
  const FILES = (await import("../../src/editor/components/database/file.mjs")).default.database;
  const nodeOf = (text) => {
    const found = [];
    const visit = (node) => {
      if (node.tagName === "div" && node.attrs?.some(({ name, value }) => name === "class" && value === "doc-database")) found.push(node);
      for (const child of node.childNodes ?? []) visit(child);
    };
    visit(parse(text, { sourceCodeLocationInfo: true }));
    return found[0];
  };
  const splice = (text, splices) => [...splices].sort((a, b) => b.start - a.start).reduce((out, { start, end, text: put }) => out.slice(0, start) + put + out.slice(end), text);
  const source = `<!doctype html><html><head></head><body><main>\n<div class="doc-database">\n  <script type="application/ld+json">{"@type":"Thing"}</script>\n  <table>\n    <thead><tr><th>任务</th></tr></thead>\n    <tbody><tr><td>a</td></tr></tbody>\n  </table>\n</div>\n</main></body></html>`;
  assert.equal(FILES.dataOf(source, nodeOf(source)).columns, "", "a database with no script of JSON (an ld+json one is none) holds an empty one");
  const filled = splice(source, FILES.rewrite(source, nodeOf(source), { columns: '\n{ "columns": [] }\n' }));
  assert.ok(filled.includes('<script type="application/json">\n{ "columns": [] }\n</script>') && filled.includes('<script type="application/ld+json">{"@type":"Thing"}</script>'), "its JSON written in, the ld+json left");
  const back = FILES.rewrite(filled, nodeOf(filled), { columns: "" });
  assert.ok(Array.isArray(back), "an empty JSON part is written: the script taken out");
  assert.equal(splice(filled, back), source, "and the file is as it was, byte for byte");
  // A write of its table keeps every row it did not change as the file has it, byte for byte (an Agent's
  // attributes as it spelled them, its entities, a row of no end tags), in the file's line endings.
  const { document } = new JSDOM("<!doctype html><body></body>").window;
  for (const eol of ["\n", "\r\n"]) {
    const table = ["<table>", "  <thead><tr><th data-column='t'>任务</th><th data-column=\"n\">估时</th></tr></thead>", "  <tbody>", "    <tr class='row' title=\"a<b>c\" data-x=\"&#65;&amp;\"><td>写方案</td><td>3</td></tr>", "    <tr><td>评审</td><td>5</td></tr>", "    <tr><td>&#65;BC<td>7", "  </tbody>", "</table>"].join(eol);
    const file = `<!doctype html><html><head></head><body><main>${eol}<div class="doc-database">${eol}<script type="application/json">{"columns":[]}</script>${eol}${table}${eol}</div>${eol}</main></body></html>`;
    const page = document.createElement("div");
    page.innerHTML = table;
    const records = page.querySelector("table");
    records.querySelector("tbody").children[1].outerHTML = "<tr><td>评审</td><td>8</td></tr>";
    const written = splice(file, FILES.rewrite(file, nodeOf(file), { records: records.innerHTML }));
    // A row of implied end tags cannot stand in a part as it is (installed/file.mjs `fits`): written as the page writes it.
    const implied = `<tr><td>&#65;BC<td>7${eol}  </tbody>`;
    assert.equal(written, file.replace("<td>5</td>", "<td>8</td>").replace(implied, `<tr><td>ABC</td><td>7${eol}  </td></tr></tbody>`), `${JSON.stringify(eol)}: the changed row alone written anew, every other byte as it was: ${written}`);
    const whole = file.replace(implied, `<tr><td>&#65;BC</td><td>7</td></tr>${eol}  </tbody>`);
    const wholePage = document.createElement("div");
    wholePage.innerHTML = /<table>[\s\S]*<\/table>/.exec(whole)[0];
    wholePage.querySelector("tbody").children[1].outerHTML = "<tr><td>评审</td><td>8</td></tr>";
    assert.equal(splice(whole, FILES.rewrite(whole, nodeOf(whole), { records: wholePage.querySelector("table").innerHTML })), whole.replace("<td>5</td>", "<td>8</td>"), "rows written whole: every byte but the changed row's as it was");
    const added = records.cloneNode(true);
    added.querySelector("thead th").textContent = "事项";
    added.querySelector("tbody").append(document.createElement("tr"));
    added.querySelector("tbody").lastElementChild.innerHTML = "<td>新</td><td>1</td>";
    const again = splice(written, FILES.rewrite(written, nodeOf(written), { records: added.innerHTML }));
    assert.ok(again.includes(`<tr class='row' title="a<b>c" data-x="&#65;&amp;"><td>写方案</td><td>3</td></tr>`) && again.includes(">事项</th>") && again.includes("<td>新</td>"), `a header renamed and a record added: the rows it did not change as they were: ${again}`);
    const read = document.createElement("div");
    read.innerHTML = /<table>[\s\S]*<\/table>/.exec(again)[0];
    assert.equal(read.querySelector("table").innerHTML.replace(/\r\n/g, "\n"), added.innerHTML.replace(/\r\n/g, "\n"), "and what the file holds reads as the page's");
  }
  // The page lays the table out anew (a row a line, as tableMarkup writes it) where the file had it on one line:
  // the blanks are the page's, every row it did not change the file's bytes.
  const flat = `<!doctype html><html><head></head><body><main>\n<div class="doc-database"><script type="application/json">{"columns":[]}</script><table><thead><tr><th data-column="t">任务</th><th data-column="n">估时</th></tr></thead><tbody><tr class='row' title="a<b>c"><td>写方案</td><td>3</td></tr><tr><td>评审</td><td>5</td></tr></tbody></table></div>\n</main></body></html>`;
  const laidOut = '\n<thead><tr><th data-column="t">任务</th><th data-column="n">估时</th></tr></thead>\n<tbody>\n<tr class="row" title="a&lt;b&gt;c"><td>写方案</td><td>3</td></tr>\n<tr><td>评审</td><td>8</td></tr>\n</tbody>\n';
  const relaid = splice(flat, FILES.rewrite(flat, nodeOf(flat), { records: laidOut }));
  assert.ok(relaid.includes(`<tbody>\n<tr class='row' title="a<b>c"><td>写方案</td><td>3</td></tr>\n<tr><td>评审</td><td>8</td></tr>\n</tbody>`), `the page's blanks, the untouched row's bytes: ${relaid}`);
  // An Agent's table of a tag a line, every cell on a line of its own: the rows the reader did not change keep
  // those lines (the blanks between a row's cells are nothing its format reads), the changed one the page's.
  const S = await import("../../src/shared/database.mjs");
  for (const eol of ["\n", "\r\n"]) {
    const row = (cells) => ["      <tr>", ...cells.map((cell) => `        <td>${cell}</td>`), "      </tr>"].join(eol);
    const inner = [
      "",
      "    <thead>",
      "      <tr>",
      '        <th data-column="t">任务</th>',
      '        <th data-column="n">估时</th>',
      "      </tr>",
      "    </thead>",
      "    <tbody>",
      row(["写方案", "3"]),
      row(["评审", "5"]),
      row(["上线", "2"]),
      "    </tbody>",
      "  ",
    ].join(eol);
    const file = `<!doctype html><html><head></head><body><main>${eol}<div class="doc-database">${eol}  <script type="application/json">{"columns":[{"id":"t","name":"任务","type":"title"},{"id":"n","name":"估时","type":"number"}],"views":[]}</script>${eol}  <table>${inner}</table>${eol}</div>${eol}</main></body></html>`;
    const host = document.createElement("div");
    host.className = "doc-database";
    host.innerHTML = /<div class="doc-database">([\s\S]*)<\/div>/.exec(file)[1];
    const database = S.readDatabase(S.readElement(host));
    database.rows[1].values.n = 8;
    // What the page sends: the whole table as the format writes it, in the layout of its first lines.
    const records = S.tableMarkup(S.writeDatabase(database), S.layoutOf(host.querySelector("table").innerHTML));
    const written = splice(file, FILES.rewrite(file, nodeOf(file), { records }));
    assert.ok(written.includes(row(["写方案", "3"])) && written.includes(row(["上线", "2"])), `${JSON.stringify(eol)}: the rows not changed as the Agent laid them out: ${written}`);
    assert.ok(written.includes("<tr><td>评审</td><td>8</td></tr>") && !written.includes(row(["评审", "5"])), `${JSON.stringify(eol)}: the changed one written anew: ${written}`);
    assert.ok(written.includes(inner.slice(0, inner.indexOf("    <tbody>"))), `${JSON.stringify(eol)}: its header as the Agent laid it out`);
    const back = document.createElement("div");
    back.className = "doc-database";
    back.innerHTML = /<div class="doc-database">([\s\S]*)<\/div>/.exec(written)[1];
    assert.deepEqual(S.readDatabase(S.readElement(back)).rows.map((each) => each.values), database.rows.map((each) => each.values), "and it reads as the page holds it");
  }
  // A long table, one cell changed: the server's write costs a few readings of the table, no more (the rows
  // whose bytes are the file's already are left as they are; 2026-11-24 a write had come to some 110 ms for
  // 500 records of 14 columns, ten times its reading).
  {
    const { parseFragment } = await import("parse5");
    const columns = 14;
    const head = `<thead><tr>${Array.from({ length: columns }, (_, c) => `<th data-column="c${c}">列${c}</th>`).join("")}</tr></thead>`;
    const line = (r, said = r) => `<tr>${Array.from({ length: columns }, (_, c) => `<td>${c === 1 ? said : `第${r}行第${c}列的一些字`}</td>`).join("")}</tr>`;
    const lines = Array.from({ length: 500 }, (_, r) => line(r));
    const json = JSON.stringify({ columns: Array.from({ length: columns }, (_, c) => ({ id: `c${c}`, name: `列${c}`, type: c === 0 ? "title" : "text" })), views: [] });
    const body = (rows) => `\n      ${head}\n      <tbody>\n${rows.join("\n")}\n      </tbody>\n    `;
    const file = `<!doctype html><html><body><main>\n<div class="doc-database">\n<script type="application/json">${json}</script>\n<table>${body(lines)}</table>\n</div>\n</main></body></html>`;
    const changed = [...lines];
    changed[250] = line(250, "改");
    const records = body(changed);
    const node = nodeOf(file);
    const best = (run) => Math.min(...Array.from({ length: 5 }, () => {
      const began = performance.now();
      run();
      return performance.now() - began;
    }));
    const writing = best(() => FILES.rewrite(file, node, { records }));
    const reading = best(() => parseFragment(node, `<table>${records}</table>`, { sourceCodeLocationInfo: true }));
    assert.equal(splice(file, FILES.rewrite(file, node, { records })), file.replace(line(250), line(250, "改")), "the changed row alone written");
    assert.ok(writing < reading * 6, `a write of one cell of 500 records costs ${writing.toFixed(1)} ms, ${(writing / reading).toFixed(1)} readings of the table (${reading.toFixed(1)} ms)`);
  }
}

// ---------- attributes that change nothing it holds, and its JSON's type in any case ----------
{
  const S = await import("../../src/shared/database.mjs");
  const { document } = new JSDOM("<!doctype html><body></body>").window;
  const hostOf = (inner) => {
    const host = document.createElement("div");
    host.className = "doc-database";
    host.innerHTML = inner;
    return host;
  };
  // An Agent's table with harmless attributes (scope, class, id, lang, dir, title, data-*): writable, each kept
  // as it was on a row or cell not changed, and on a cell changed; colspan, rowspan and style still read-only.
  const json = '<script type="application/json">{"columns":[{"id":"t","name":"任务","type":"title"},{"id":"n","name":"估时","type":"number"}],"views":[]}</script>';
  const table = '\n<thead class="head"><tr data-kind="head"><th scope="col" data-column="t">任务</th><th scope="col" title="小时" data-column="n">估时</th></tr></thead>\n<tbody id="records">\n<tr class="row" data-id="a"><td class="name" lang="zh">写方案</td><td dir="ltr" data-unit="h">3</td></tr>\n<tr><td>评审</td><td class="num">5</td></tr>\n</tbody>\n';
  const host = hostOf(`${json}<table>${table}</table>`);
  const read = S.readDatabase(S.readElement(host));
  assert.deepEqual([read.readOnly, read.problems], [false, []], "harmless attributes leave it writable");
  const markup = (database) => S.tableMarkup(S.writeDatabase(database), S.layoutOf(table));
  assert.equal(markup(read), host.querySelector("table").innerHTML, "written back as it was, every attribute in its place");
  const changed = structuredClone(read);
  changed.rows[0].values.n = 4;
  changed.rows[1].values.t = "评审会";
  const after = markup(changed);
  assert.ok(after.includes('<td dir="ltr" data-unit="h">4</td>') && after.includes('<tr><td>评审会</td><td class="num">5</td></tr>') && after.includes('<tr class="row" data-id="a"><td class="name" lang="zh">写方案</td>'), `a changed cell keeps its attributes, the rest as it was: ${after}`);
  for (const [said, inner] of [["colspan", '<tr><td colspan="2">a</td></tr>'], ["rowspan", '<tr><td rowspan="2">a</td><td>1</td></tr>'], ["style", '<tr><td style="color: red">a</td><td>1</td></tr>'], ["a handler", '<tr><td onclick="x()">a</td><td>1</td></tr>'], ["a column named in a row", '<tr><td data-column="t">a</td><td>1</td></tr>']]) {
    assert.equal(S.readDatabase(S.readElement(hostOf(`${json}<table><thead><tr><th data-column="t">任务</th><th data-column="n">估时</th></tr></thead><tbody>${inner}</tbody></table>`))).readOnly, true, `${said}: read-only`);
  }
  // Its JSON's type in another case (application/JSON) is its JSON, kept as it is spelled.
  const cased = hostOf(`<script type="application/JSON">{"columns":[{"id":"t","name":"任务","type":"title"},{"id":"f","name":"两倍","type":"formula","formula":"1 * 2"}],"views":[{"id":"v1","name":"全部","layout":"table"}]}</script><table><thead><tr><th data-column="t">任务</th></tr></thead><tbody><tr><td>a</td></tr></tbody></table>`);
  const casedRead = S.readDatabase(S.readElement(cased));
  assert.ok(casedRead.json && casedRead.columns.some((column) => column.type === "formula") && casedRead.views[0].name === "全部", "application/JSON is its JSON");
  const { parse } = await import("parse5");
  const FILES = (await import("../../src/editor/components/database/file.mjs")).default.database;
  const nodeOf = (text) => {
    const found = [];
    const visit = (node) => {
      if (node.tagName === "div" && node.attrs?.some(({ name, value }) => name === "class" && value === "doc-database")) found.push(node);
      for (const child of node.childNodes ?? []) visit(child);
    };
    visit(parse(text, { sourceCodeLocationInfo: true }));
    return found[0];
  };
  const source = `<!doctype html><html><head></head><body><main>\n<div class="doc-database"><script type="application/JSON">{ "columns": [] }</script><table><tbody><tr><td>a</td></tr></tbody></table></div>\n</main></body></html>`;
  assert.equal(FILES.dataOf(source, nodeOf(source)).columns, '{ "columns": [] }', "the server reads it as its JSON part");
  const splices = FILES.rewrite(source, nodeOf(source), { columns: '{ "columns": [1] }' });
  const written = [...splices].sort((a, b) => b.start - a.start).reduce((out, { start, end, text: put }) => out.slice(0, start) + put + out.slice(end), source);
  assert.ok(written.includes('<script type="application/JSON">{ "columns": [1] }</script>') && (written.match(/<script/g) ?? []).length === 1, `written inside it, its spelling kept, no second script: ${written}`);
}

console.log("Checked the database: values read and written back (numbers, options, dates, checkboxes, what is none kept as written), a whole read, written and read back byte for byte, an Agent's table with no JSON, options a cell adds not written, the formula language and a view's filters, sorts, groups and counts, every word in Chinese and English, the kit's files, gallery read's rows; a clipboard's database taken only as its format, cells the reader did not change written as they were, a table the format cannot hold and JSON that does not read read-only and said by gallery check, an empty JSON part none; attributes that change nothing it holds kept where they were, its JSON's type in any case.");

// ---------- its records' bodies ----------
// A row's data-record is its record's id (the first of an id, an id's form alone; the others by their place, none a
// row's id); its pages a slot each, which the scan makes boxes of kind "record"; a commit putting a block into a
// body the file holds none of makes its slot (and the pages where there are none), one emptying it takes it out
// again; no database goes into a body; a copy's markup holds its bodies' slots empty, of records its rows name,
// each once; a clipboard's database made anew keeps its rows' ids and its pages.
{
  const { databasePages, bodyOf, cleanDatabase, newRecordId, slotRecord, recordSlot, RECORD_ID } = await import("../../src/shared/database.mjs");
  const read = readDatabase({ header: [{ column: null, name: "任务" }], rows: [["a"], ["b"], ["c"], ["d"]], rowAttrs: [[{ name: "data-record", value: "r2" }], [], [{ name: "data-record", value: "r2" }], [{ name: "data-record", value: "no id!" }]] });
  assert.deepEqual(read.rows.map((row) => row.id), ["r2", "r2-2", "r3", "r4"], "a row's data-record is its id once; the others by their place, none another's");
  assert.deepEqual(read.rows.map((row) => Boolean(row.named)), [true, false, false, false], "only the row whose id it is is named so");
  assert.equal(slotRecord("record:a-1_B"), "a-1_B");
  assert.equal(slotRecord("record:no id"), null);
  assert.equal(slotRecord(recordSlot("x9")), "x9");
  const taken = new Set(["r1"]);
  for (let at = 0; at < 20; at++) {
    const id = newRecordId(taken);
    assert.ok(RECORD_ID.test(id) && !taken.has(id), "a new id is an id, none of those taken");
  }

  const { parse } = await import("parse5");
  const { scan } = await import("../../src/editor/source/blocks.mjs");
  const { commitEdits } = await import("../../src/editor/source/commit.mjs");
  const FILES = (await import("../../src/editor/components/database/file.mjs")).default.database;
  const page = (inner) => [
    "<!doctype html>",
    '<html><head><title>t</title></head><body><main class="doc-page">',
    '  <header class="doc-header"><h1 class="doc-title">T</h1></header>',
    '  <p data-block-id="pbefore1">前文</p>',
    '  <div class="doc-database" data-block-id="database1">',
    '    <script type="application/json">{ "columns": [{ "id": "t", "name": "任务", "type": "title" }], "views": [{ "id": "v1", "layout": "table" }] }</script>',
    "    <table>",
    '      <thead><tr><th data-column="t">任务</th></tr></thead>',
    "      <tbody>",
    '        <tr data-record="ra"><td>甲</td></tr>',
    "        <tr><td>乙</td></tr>",
    "      </tbody>",
    `    </table>${inner}`,
    "  </div>",
    "</main></body></html>",
    "",
  ].join("\n");
  const withBody = page(["", '    <div class="doc-database-pages">', '      <div data-doc-slot="record:ra">', "        <h2>甲的正文</h2>", "        <p>一段</p>", "      </div>", "    </div>"].join("\n"));
  const scanned = scan(withBody);
  const database = scanned.units.find((unit) => unit.kind === "database");
  const box = scanned.boxes.find((each) => each.unit === database.id && each.kind === "record");
  assert.equal(box?.key, "record:ra", "a body is a box of its database, of kind record, by its slot's name");
  assert.deepEqual(scanned.units.filter((unit) => unit.box === box.id).map((unit) => unit.kind), ["heading", "paragraph"], "its blocks are the document's units");
  assert.ok(scanned.blocks.some((block) => withBody.slice(block.innerStart, block.innerEnd) === "甲的正文"), "and its words text blocks");
  const find = (node) => {
    if (node.tagName === "div" && node.attrs.some(({ value }) => value === "doc-database")) return node;
    for (const child of node.childNodes ?? []) {
      const found = find(child);
      if (found) return found;
    }
    return null;
  };
  const host = find(parse(withBody, { sourceCodeLocationInfo: true }));
  assert.deepEqual(databasePages(host).slots.map((slot) => [slot.name, slot.record, slot.first]), [["record:ra", "ra", true]], "the pages read on parse5's tree");
  // A body made by the commit that puts its first block in, and the pages with it where there are none.
  const insert = (key, text) => ({ key: "n1", insert: { type: "paragraph", html: text }, place: { into: { unit: { key: 1, id: "database1" }, kind: "record", key } } });
  const second = commitEdits({ current: withBody, units: [insert("record:rb", "乙的正文")] });
  assert.equal(second.units[0].status, "applied");
  assert.match(second.text, /<div data-doc-slot="record:rb">\n {8}<p data-block-id="[a-z0-9]+">乙的正文<\/p>\n {6}<\/div>\n {4}<\/div>/, "a slot made after the others, its block on a line of its own");
  const bare = page("");
  const first = commitEdits({ current: bare, units: [insert("record:ra", "甲的正文")] });
  assert.match(first.text, /<\/table>\n {4}<div class="doc-database-pages">\n {6}<div data-doc-slot="record:ra">\n {8}<p data-block-id="[a-z0-9]+">甲的正文<\/p>\n {6}<\/div>\n {4}<\/div>\n {2}<\/div>/, `the pages made after the table: ${first.text.slice(first.text.indexOf("</table>"), first.text.indexOf("</main>"))}`);
  // Its last block taken out: the slot goes, and the pages with it.
  const id = /data-block-id="([a-z0-9]+)">甲的正文/.exec(first.text)[1];
  const emptied = commitEdits({ current: first.text, units: [{ key: 7, unit: { key: 7, id }, remove: true }] });
  assert.equal(emptied.text, bare, "a body emptied by a commit is taken out: the file as before");
  // No database goes into a body, however far in.
  const nested = commitEdits({ current: withBody, units: [{ key: "n1", insert: { type: "database", html: '<div class="doc-database">\n<table><thead><tr><th>a</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table>\n</div>' }, place: { into: { unit: { key: 1, id: "database1" }, kind: "record", key: "record:ra" } } }] });
  assert.equal(nested.units[0].status, "conflict", "a database put in a body is refused");
  // A copy's markup: its bodies' slots empty, of records its rows name, each once; what they hold apart.
  const copy = (pages) => `<div class="doc-database">\n<table><thead><tr><th>a</th></tr></thead><tbody><tr data-record="ra"><td>x</td></tr></tbody></table>\n${pages}\n</div>`;
  const written = (text) => text;
  assert.ok(FILES.source({ html: copy('<div class="doc-database-pages">\n  <div data-doc-slot="record:ra"></div>\n</div>'), children: [{ type: "paragraph", html: "p" }], boxKeys: ["record:ra"] }, { written }), "a copy with a body: its slot empty, its block apart");
  assert.equal(FILES.source({ html: copy('<div class="doc-database-pages"><div data-doc-slot="record:ra"><p>x</p></div></div>'), children: [], boxKeys: [] }, { written }), null, "a slot holding blocks in a copy's markup is refused");
  assert.equal(FILES.source({ html: copy('<div class="doc-database-pages"><div data-doc-slot="record:zz"></div></div>'), children: [{ type: "paragraph", html: "p" }], boxKeys: ["record:zz"] }, { written }), null, "a slot of no record its rows name is refused");
  assert.equal(FILES.source({ html: copy('<div class="doc-database-pages"><div data-doc-slot="record:ra"></div></div>') }, { written }), null, "a slot with nothing carried for it is refused");
  // A clipboard's database made anew: its rows' ids and its pages of empty slots.
  const { window } = new JSDOM("");
  const template = window.document.createElement("template");
  template.innerHTML = copy('<div class="doc-database-pages"><div data-doc-slot="record:ra"></div></div>');
  const made = cleanDatabase(template.content.firstElementChild, window.document);
  assert.ok(made?.querySelector('tr[data-record="ra"]') && databasePages(made).slots.length === 1 && bodyOf(made, "ra"), "made anew: the row's id, the pages and the slot");
  template.innerHTML = copy('<div class="doc-database-pages"><div data-doc-slot="record:ra" onclick="x()"></div></div>');
  assert.equal(cleanDatabase(template.content.firstElementChild, window.document), null, "a slot with anything else on it is no database of its format");
}
console.log("Checked its records' bodies: a row's id, its pages read, the scan's record boxes, a body made by its first block's commit (and its pages), taken out once emptied, no database in one, a copy's markup of empty slots, a clipboard's database made anew with its ids and pages.");
