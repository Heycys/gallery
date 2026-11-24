import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { loadKitFile } from "../../src/render/kit-build.mjs";
import { readDatabase, writeDatabase } from "../../src/shared/database.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";

// A database's layouts of cards (render/kit/database/views/): what they work out before they draw (views/model.js,
// bundled here as the kit bundles it): a board's columns in its options' order (the records of no value in a column
// of their own while there are any, the hidden apart), the options reordered by a column dragged, a card dropped (its
// cell and its place one change, the same database where nothing changes, the options a cell named written once its
// column changes), a calendar's month in whole weeks from Monday and its records by day; a board's hidden columns as
// the file says them (boardHidden: options by id or name, "__none" the column of no value, none without a board's
// select); the kit's bundle drawing each layout.

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-database-layouts-"));
const out = path.join(folder, "model.mjs");
await build({ entryPoints: [path.join(projectRoot, "src", "render", "kit", "database", "views", "model.js")], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
const model = await import(pathToFileURL(out).href);
fs.rmSync(folder, { recursive: true, force: true });

// ---------- a board's columns ----------
const status = { id: "s", name: "状态", type: "select", options: [{ id: "a", name: "待开始", color: "gray" }, { id: "b", name: "进行中", color: "blue" }, { id: "c", name: "已完成", color: "green", done: true }] };
const title = { id: "t", name: "任务", type: "title" };
const byId = { s: status, t: title };
const rows = [
  { id: "1", values: { t: "甲", s: "b" } },
  { id: "2", values: { t: "乙", s: "a" } },
  { id: "3", values: { t: "丙", s: "b" } },
  { id: "4", values: { t: "丁", s: null } },
];
{
  const { shown, hidden } = model.boardColumns(rows, status, byId);
  assert.deepEqual(shown.map((group) => `${group.key}:${group.rows.map((row) => row.id).join("")}`), ["a:2", "b:13", "c:", ":4"], "a column per option in their order, an empty one too; the records of no value last");
  assert.equal(hidden.length, 0);
  const none = model.boardColumns(rows.slice(0, 3), status, byId);
  assert.deepEqual(none.shown.map((group) => group.key), ["a", "b", "c"], "no column of no value while no record is of none");
  const some = model.boardColumns(rows, status, byId, ["c", model.EMPTY_KEY]);
  assert.deepEqual([some.shown.map((group) => group.key), some.hidden.map((group) => group.key)], [["a", "b"], ["c", ""]], "hidden: an option's column and that of no value");
  assert.equal(model.hiddenKey(""), "__none", "the column of no value is written as a filter's no value");
  assert.equal(model.hiddenKey("b"), "b");
}

// ---------- the options reordered by a column dragged ----------
{
  const options = status.options;
  const ids = (list) => list.map((option) => option.id).join("");
  assert.equal(ids(model.moveOptions(options, ["a", "b", "c"], 1, 0)), "bac", "the second before the first");
  assert.equal(ids(model.moveOptions(options, ["a", "b", "c"], 0, 3)), "bca", "the first to the end");
  assert.equal(ids(model.moveOptions(options, ["a", "c"], 1, 0)), "cba", "a hidden one keeps its place among them");
  assert.ok(model.moveOptions(options, ["a", "b", "c"], 2, 0).every((option) => options.includes(option)), "the options themselves, none lost");
}

// ---------- a card dropped ----------
{
  const doc = { props: [title, status], rows, views: [] };
  const across = model.dropCard(doc, { rowId: "2", prop: status, value: "b", before: "3" });
  assert.deepEqual(across.rows.map((row) => `${row.id}${row.values.s ?? "-"}`), ["1b", "2b", "3b", "4-"], "into 进行中 before 丙: its cell and its place");
  const toEnd = model.dropCard(doc, { rowId: "2", prop: status, value: "b" });
  assert.deepEqual(toEnd.rows.map((row) => row.id), ["1", "3", "2", "4"], "dropped past a column's last card: after its last record");
  const within = model.dropCard(doc, { rowId: "3", prop: status, value: "b", before: "1" });
  assert.deepEqual([within.rows.map((row) => row.id), within.rows.find((row) => row.id === "3").values.s], [["3", "1", "2", "4"], "b"], "within its column: its place alone");
  assert.equal(model.dropCard(doc, { rowId: "1", prop: status, value: "b", before: "2" }), doc, "where it was: the same database (nothing to write)");
  const sorted = model.dropCard(doc, { rowId: "2", prop: status, value: "c", before: null, reorder: false });
  assert.deepEqual([sorted.rows.map((row) => row.id), sorted.rows[1].values.s], [["1", "2", "3", "4"], "c"], "a sort orders the view: its cell alone");
  assert.equal(sorted.props, doc.props, "no column changed but its cell");
  const toNone = model.dropCard(doc, { rowId: "1", prop: status, value: null, before: null });
  assert.deepEqual(toNone.rows.map((row) => `${row.id}${row.values.s ?? "-"}`), ["2a", "3b", "4-", "1-"], "into the column of no value");
  const added = { ...status, options: [...status.options, { id: "x", name: "评审中", color: "orange", added: true }] };
  const withAdded = model.dropCard({ ...doc, props: [title, added] }, { rowId: "2", prop: added, value: "x" });
  assert.ok(withAdded.props[1].options.every((option) => !option.added), "the options a cell named that the column did not list are written once its column changes, as a cell's change writes them");
}

// ---------- where a sort puts a card dropped into another column ----------
{
  const est = { id: "e", name: "估时", type: "number" };
  const sortedById = { s: status, t: title, e: est };
  const records = [
    { id: "1", values: { t: "甲", s: "b", e: 30 } },
    { id: "2", values: { t: "乙", s: "a", e: 12 } },
    { id: "3", values: { t: "丙", s: "b", e: 12 } },
    { id: "4", values: { t: "丁", s: "b", e: 5 } },
  ];
  const order = new Map(records.map((row, at) => [row.id, at]));
  const column = [records[0], records[2], records[3]]; // 进行中 by 估时, the largest first: 30, 12, 5
  const desc = [{ prop: "e", dir: "desc" }];
  assert.equal(model.sortedPlace(column, records[1], status, "b", desc, sortedById, order), 1, "12 among 30, 12, 5: after the 30, before the 12 that comes later in the records");
  assert.equal(model.sortedPlace(column, { ...records[1], values: { ...records[1].values, e: 40 } }, status, "b", desc, sortedById, order), 0, "the largest: first");
  assert.equal(model.sortedPlace(column, { ...records[1], values: { ...records[1].values, e: 1 } }, status, "b", desc, sortedById, order), 3, "the smallest: last");
  assert.equal(model.sortedPlace([], records[1], status, "b", desc, sortedById, order), 0, "an empty column: first");
  const late = new Map([["2", 9], ...[...order].filter(([id]) => id !== "2")]);
  assert.equal(model.sortedPlace(column, records[1], status, "b", desc, sortedById, late), 2, "of equals, the records' own order: after the 12 that comes first");
  // By the board's own column: within one column all are equal, the records' order alone.
  assert.equal(model.sortedPlace(column, records[1], status, "b", [{ prop: "s", dir: "asc" }], sortedById, order), 1, "sorted by the column itself: by the records' order");
}

// ---------- a calendar ----------
{
  const days = model.monthDays(2026, 10); // November 2026: Sunday the 1st
  assert.equal(days.length % 7, 0, "whole weeks");
  assert.equal(days[0].getDay(), 1, "from Monday");
  assert.deepEqual([model.ymd(days[0]), model.ymd(days[6]), model.ymd(days[days.length - 1])], ["2026-10-26", "2026-11-01", "2026-12-06"], "the days of the months around it too");
  assert.equal(model.monthDays(2027, 1).length, 28, "February 2027 starts on a Monday and ends on a Sunday: four weeks");
  assert.deepEqual(model.shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 }, "December, forward: January");
  assert.deepEqual(model.shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
  assert.equal(model.monthKey({ year: 2026, month: 10 }), "2026-11");
  assert.deepEqual(model.readMonth("2026-11"), { year: 2026, month: 10 });
  assert.equal(model.readMonth("2026-13"), null);
  assert.equal(model.readMonth(null), null);
  const due = { id: "d", name: "截止", type: "date" };
  const dated = [{ id: "1", values: { d: "2026-11-12" } }, { id: "2", values: { d: "下周" } }, { id: "3", values: { d: null } }, { id: "4", values: { d: "2026-11-12" } }, { id: "5", values: { d: "2026-02-30" } }];
  const { days: byDay, undated } = model.recordsByDay(dated, due, { d: due });
  assert.deepEqual([[...byDay.keys()], byDay.get("2026-11-12").map((row) => row.id), undated.map((row) => row.id)], [["2026-11-12"], ["1", "4"], ["2", "3", "5"]], "by day; words that are no date, a date of no day (2026-02-30) and none under 未排期");
}

// ---------- a board's hidden columns in the file ----------
{
  const json = JSON.stringify({
    columns: [{ id: "title", name: "任务", type: "title" }, { id: "status", name: "状态", type: "select", options: [{ name: "待开始", color: "gray" }, { id: "s2", name: "进行中", color: "blue" }] }],
    views: [
      { id: "v1", layout: "board", boardBy: "status", boardHidden: ["待开始", "s2", "进行中", "__none", "没有这个"] },
      { id: "v2", layout: "board", boardHidden: ["待开始"] },
      { id: "v3", layout: "board", boardBy: "status", boardHidden: [] },
    ],
  });
  const read = readDatabase({ json, header: [{ column: "title", name: "任务" }, { column: "status", name: "状态" }], rows: [["甲", "待开始"]] });
  assert.deepEqual(read.views[0].boardHidden, ["待开始", "s2", "__none"], "options by id or name, once each, the column of no value; what is no option left out");
  assert.equal(read.views[1].boardHidden, undefined, "none without a board's select");
  assert.equal(read.views[2].boardHidden, undefined, "none where it hides none");
  const written = writeDatabase(read).json.views;
  assert.deepEqual(written[0].boardHidden, ["待开始", "s2", "__none"], "written as read");
  assert.ok(!("boardHidden" in written[1]) && !("boardHidden" in written[2]), "and only where it hides some");
}

// ---------- the kit's bundle ----------
{
  const script = await loadKitFile("database.js");
  const css = await loadKitFile("database.css");
  for (const name of ["board-col", "cal-day", "list-row", "end-zone"]) assert.ok(script.includes(name), `database.js draws ${name}`);
  for (const rule of [".doc-database-app .board-col", ".doc-database-app .cal-day", ".doc-database-app .list-row", ".doc-database-app .card-more"]) assert.ok(css.includes(rule), `database.css styles ${rule}`);
  // Every rule of the drawing's stylesheet is the drawing's (none reaches the page around it but the block's own, its
  // records' bodies' pages while they are a record's details, and the page's cursor while it is dragged).
  for (const file of ["database.css"]) {
    const text = fs.readFileSync(path.join(projectRoot, "src", "render", "kit", "database", "styles", file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const selectors = [...text.matchAll(/(^|})\s*([^{}@]+)\{/g)].map((found) => found[2].trim()).filter((selector) => !/^(from|to|\d+%)/.test(selector));
    const loose = selectors.flatMap((selector) => selector.split(/,(?![^(]*\))/)).map((part) => part.trim()).filter((part) => part && !part.startsWith(".doc-database-app") && !part.startsWith(".doc-database[") && part !== ".doc-database" && !part.startsWith("body[data-doc-database-drag") && !part.startsWith(".doc-database-pages[data-doc-peek") && !part.startsWith(":is(.doc-database-app "));
    assert.deepEqual(loose, [], `${file}: every rule under .doc-database-app`);
  }
}

console.log("Checked a database's layouts of cards: a board's columns in its options' order (the records of no value apart, the hidden apart), the options reordered by a column dragged, a card dropped (cell and place one change, nothing where it was), a calendar's whole weeks from Monday and its records by day, a board's hidden columns read and written, the kit's bundle and stylesheets.");
