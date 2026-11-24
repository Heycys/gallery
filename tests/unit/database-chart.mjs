import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";
import { readDatabase, readElement, writeDatabase } from "../../src/shared/database.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { SAMPLE } from "../fixtures/database/sample.mjs";

// A database's chart view: what it draws, worked out from the records (render/kit/database/data/chart.js,
// bundled here as the kit bundles it): the sample's 工时统计 (the sum of 估时 by 负责人), a count by a multi's
// options (a record in each of its), the categories' order (an option's, the others by their words, the records with
// none last), the words of a value and of the axis, an axis of even steps, and a chart's colors (the shades of one of the
// nine its categories take, kept in the file as the view's chart.color).

const folder = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-database-chart-"));
const entry = path.join(folder, "entry.js");
const kit = path.join(projectRoot, "src", "render", "kit", "database", "data").split(path.sep).join("/");
fs.writeFileSync(entry, `export * from "${kit}/chart.js";\n`);
const out = path.join(folder, "chart.mjs");
await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
const C = await import(pathToFileURL(out).href);
fs.rmSync(folder, { recursive: true, force: true });

// The sample database, read as the kit reads its host.
const { document } = new JSDOM(`<!doctype html><body>${SAMPLE}</body>`).window;
const read = readDatabase(readElement(document.querySelector(".doc-database")));
const props = read.columns;
const rows = read.rows;
const byId = Object.fromEntries(props.map((prop) => [prop.id, prop]));
const view = (id) => read.views.find((each) => each.id === id);
const pairs = (data) => data.map((each) => `${each.key}=${each.value}`);

// ---------- the sample's 工时统计 ----------
{
  const chart = view("v5").chart;
  const data = C.chartData(rows, chart, byId[chart.x], byId[chart.y], byId);
  assert.deepEqual(pairs(data), ["林夏=49", "周舟=77", "陈默=41", "苏禾=58"], "the sum of 估时 by 负责人, in the options' order");
  assert.deepEqual(data.map((each) => each.raw), byId.owner.options.map((option) => option.id), "each by its option");
  // Filtered: the records the view shows are what is counted.
  const doing = rows.filter((row) => row.values.status === "s2");
  assert.deepEqual(pairs(C.chartData(doing, chart, byId.owner, byId.est, byId)), ["林夏=16", "周舟=54", "陈默=22", "苏禾=0"], "an option no record has: 0, still there");
  // A count, the sum of a formula, the average of a percent.
  assert.deepEqual(pairs(C.chartData(rows, { ...chart, agg: "count" }, byId.owner, null, byId)), ["林夏=5", "周舟=4", "陈默=5", "苏禾=4"]);
  assert.equal(C.chartData(rows, chart, byId.owner, byId.remain, byId)[1].value.toFixed(1), "47.4", "a formula's numbers summed");
  assert.equal(C.valueWords(chart, byId.remain)(47.4000001), "47.4");
  assert.equal(C.valueWords({ agg: "count" }, null)(18), "18");
  assert.equal(C.valueWords({ agg: "avg" }, byId.progress)(0.4889), "48.9%", "an average a decimal more");
}

// ---------- categories ----------
{
  // A multi: a record in each of its options.
  assert.deepEqual(pairs(C.chartData(rows, { kind: "donut", agg: "count" }, byId.tags, null, byId)), ["前端=12", "后端=2", "设计=5", "测试=3", "文档=2"]);
  // A checkbox: no, then yes (its words' order).
  assert.deepEqual(pairs(C.chartData(rows, { kind: "column", agg: "count" }, byId.accepted, null, byId)), ["未勾选=14", "已勾选=4"]);
  // Dates ascending, the records with none last.
  const dates = C.chartData(rows, { kind: "column", agg: "count" }, byId.due, null, byId);
  assert.equal(dates.length, 17);
  assert.equal(dates[0].raw, "2026-11-08");
  assert.deepEqual(dates.at(-1), { raw: "", key: "无截止日期", value: 2 }, "the records with none last");
  // The records with none left out where they measure nothing.
  const est = { id: "e", name: "估时", type: "number" };
  const who = { id: "w", name: "人", type: "text" };
  const some = [{ id: "1", values: { w: "甲", e: 4 } }, { id: "2", values: { w: "甲", e: null } }, { id: "3", values: { w: null, e: null } }];
  assert.deepEqual(pairs(C.chartData(some, { kind: "column", agg: "sum" }, who, est, { e: est, w: who })), ["甲=4"]);
  assert.deepEqual(pairs(C.chartData(some, { kind: "column", agg: "count" }, who, null, { e: est, w: who })), ["甲=2", "无人=1"]);
}

// ---------- the axis ----------
{
  assert.deepEqual(C.niceTicks(77), [0, 20, 40, 60, 80]);
  assert.deepEqual(C.niceTicks(18), [0, 5, 10, 15, 20]);
  assert.deepEqual(C.niceTicks(0.9), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual([0, 20, 25000].map(C.tickWords), ["0", "20", "2.5万"]);
  globalThis.document = { documentElement: { getAttribute: (name) => (name === "lang" ? "en" : null) } };
  try {
    assert.deepEqual([20, 25000].map(C.tickWords), ["20", "25k"], "in English: k");
  } finally {
    delete globalThis.document;
  }
}

// ---------- its colors ----------
{
  assert.deepEqual(C.CHART_COLORS, ["auto", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"], "自动 and the kit's nine");
  // The categories' places among the shades: the first the deepest, evenly apart, a few over less of the way.
  assert.deepEqual(C.shadeSteps(0), []);
  assert.deepEqual(C.shadeSteps(1), [0.5], "one alone: the middle");
  assert.deepEqual(C.shadeSteps(2), [0.25, 0.75]);
  assert.deepEqual(C.shadeSteps(3), [0.125, 0.5, 0.875]);
  assert.deepEqual(C.shadeSteps(4), [0, 0.333, 0.667, 1], "four or more: the whole way");
  const nine = C.shadeSteps(9);
  assert.ok(nine[0] === 0 && nine[8] === 1 && nine.every((step, at) => at === 0 || step > nine[at - 1]), "evenly from the deepest to the palest");
  // A shade: the color's light and dark inks (src/shared/colors.mjs) in a light-dark() of two mixes.
  const deepest = C.shadeOf("blue", 0);
  assert.equal(deepest, "light-dark(color-mix(in oklab, #387dc9 88%, #000), color-mix(in oklab, #5e87c9 64%, #fff))", "the deepest: the ink a little deeper in light, brighter in dark");
  assert.equal(C.shadeOf("blue", 1), "light-dark(color-mix(in oklab, #387dc9 40%, #fff), color-mix(in oklab, #5e87c9 62%, #202020))", "the palest: the ink paled in light, dimmed toward the page in dark");
  assert.ok(C.shadeOf("blue", 0.25).startsWith("light-dark(color-mix(in oklab, color-mix(in oklab, #387dc9 88%, #000) 75%, "), "between: the two mixed by its place");
  assert.equal(C.shadeOf("default", 0.5), null, "none for a name not of the nine");
  // The file: a view's chart keeps a color of the nine, nothing else (自动 is none), and writes it back as it was.
  const views = [
    { id: "a", layout: "chart", chart: { kind: "column", x: "owner", agg: "count", color: "blue" } },
    { id: "b", layout: "chart", chart: { kind: "donut", x: "owner", agg: "count", color: "auto" } },
    { id: "c", layout: "chart", chart: { kind: "bar", x: "owner", agg: "count", color: "teal" } },
  ];
  const host = new JSDOM(`<!doctype html><body>${SAMPLE}</body>`).window.document.querySelector(".doc-database");
  const script = host.querySelector("script");
  script.textContent = JSON.stringify({ ...JSON.parse(script.textContent), views });
  const charts = readDatabase(readElement(host)).views.map((each) => each.chart);
  assert.deepEqual(charts.map((chart) => chart.color ?? null), ["blue", null, null], "read: blue kept, auto and an unknown name none");
  const written = writeDatabase(readDatabase(readElement(host))).json.views.map((each) => each.chart);
  assert.equal(written[0].color, "blue", "written back");
  assert.ok(!("color" in written[1]) && !("color" in written[2]), "none written where it is none");
}

console.log("Checked the database's chart: the sample's sum of 估时 by 负责人, a filter's records, a count, a formula's sum, an average's words; a multi's options, no and yes, dates in order with the records of none last and left out where they measure nothing; an axis of even steps and its words in Chinese and English; its colors: 自动 and the nine, the shades' places and values, and the view's chart.color read and written back.");
