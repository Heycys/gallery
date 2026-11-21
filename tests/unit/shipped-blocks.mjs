import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { JSDOM } from "jsdom";
import { sizeFor } from "../../src/shared/board-places.mjs";
import { readCatalog } from "../../src/shared/component-catalog.mjs";
import { jsonIn } from "../../src/shared/json-layout.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { addShipped, fingerprintOf, followOnRead, shippedBlocks, shippedNewer, shippedState, versionAfter } from "../../src/shared/shipped-blocks.mjs";
import { createPageService } from "../../src/editor/page-service.mjs";
import { textIn } from "../../src/render/kit/runtime/gestures.js";
import { createComponentSettings } from "../../src/server/component-settings.mjs";
import { adoptWorkspace } from "../../src/server/index.mjs";
import { findBrowser } from "../../src/transfer/browser.mjs";
import { DENSITY, WIDEST, webpSize } from "../../src/cli/block-picture.mjs";

// Gallery's own blocks (src/packs/gallery/, shared/shipped-blocks.mjs; decided 2026-11-07):
// every one ships its files, loads through the catalog as its manifest means it (places, card,
// settings), and passes gallery block check with nothing to say, in a real browser where the machine has
// one. The pages' blocks today, note, static, countdown, habit and weather are tested by their logic: each
// kit.js run as a page runs it, in a function of its own, with a DocKit that keeps what it registers,
// jsdom's document and, where the test moves the clock, a Date of the test's; its functions read back by
// name. today greets by the hour and moves its date at midnight (the clock's "day"); countdown counts
// whole days of the calendar; habit's streak goes back from today, or from yesterday while today is not
// checked, and stops at a gap; note's words go to the file and back, lines and a </script> among them, as
// context.editJSON writes them (json-layout.mjs jsonIn). The workspace's four (todos, recent,
// stats, heatmap: their needs "workspace") are run on a context.workspace of the test's: what each asks,
// draws of the answer and says where none can be read (an export: "offline"), a click opening its document.
// weather looks its city up and fetches its weather through context.fetch (a test's), at the two hosts its
// needs name, and says why where there is none. The views of a table (kanban, metric,
// chart-view: their places a document's, their needs "tables") are run on a context.table() of the
// test's over a table of jsdom's: what each reads by default and as its settings say, the board's groups
// and its cards kept a row while the row is the same object, its intents and its links, read-only where
// the table takes no change.

const PACKS = path.join(projectRoot, "src", "packs");
const BLOCKS = path.join(PACKS, "gallery");
const SOFT = path.join(PACKS, "gallery-soft");
const PAGES = ["countdown", "habit", "heatmap", "note", "recent", "static", "stats", "today", "todos", "weather"];
const WORKSPACE = ["heatmap", "recent", "stats", "todos"];
const VIEWS = ["chart-view", "kanban", "metric"];

// The list: Gallery 风格's (the pack gallery): the documents' two (card, chart-card), the pages' ten (six,
// and the workspace's four) and the documents' three views of a table; 柔光风格's (gallery-soft): the pages'
// ten again, in a soft look of their own (decided 2026-11-09); each with its files.
const shipped = shippedBlocks(PACKS);
const own = shipped.filter(({ pack }) => pack === "gallery");
const soft = shipped.filter(({ pack }) => pack === "gallery-soft");
assert.deepEqual(own.map(({ name }) => name), ["card", "chart-card", ...VIEWS, ...PAGES].sort(), "Gallery 风格's blocks, by name");
assert.deepEqual([soft.map(({ name }) => name), shipped.length], [PAGES, own.length + soft.length], "柔光风格's: the ten page cards, and no other pack");
for (const { id, folder } of shipped) {
  const files = fs.readdirSync(folder).sort();
  for (const file of ["component.json", "example.html", "preview-dark.en.webp", "preview-dark.webp", "preview-light.en.webp", "preview-light.webp", "style.css", "template.html", "writing.md"]) assert.ok(files.includes(file), `${id} ships ${file}`);
  assert.ok(!files.includes("preview.svg"), `${id} ships no drawing (preview.svg): its pictures are its own (src/cli/pack-pictures.mjs)`);
  assert.ok(fs.readFileSync(path.join(folder, "writing.md"), "utf8").startsWith(`# `) && fs.readFileSync(path.join(folder, "writing.md"), "utf8").includes(`(${id})`), `${id}'s writing.md names it`);
  // Its pictures as gallery block check makes them (src/cli/block-picture.mjs, by src/cli/pack-pictures.mjs): WebP at twice their CSS size, WIDEST CSS px wide at most,
  // a light one and a dark one, in Chinese (its example's) and in English (LANGUAGE_PICTURES), each pair of one size.
  const [light, dark, enLight, enDark] = ["preview-light.webp", "preview-dark.webp", "preview-light.en.webp", "preview-dark.en.webp"].map((file) => fs.readFileSync(path.join(folder, file)));
  for (const [which, bytes] of [["light", light], ["dark", dark], ["English light", enLight], ["English dark", enDark]]) {
    const size = webpSize(bytes);
    assert.ok(size && size.width <= DENSITY * WIDEST && size.width >= 200 && size.height >= 40, `${id}'s ${which} picture is a WebP of the menus' size: ${JSON.stringify(size)}`);
  }
  assert.ok(!light.equals(dark) && !enLight.equals(enDark), `${id}'s two pictures are of two themes`);
  assert.ok(!light.equals(enLight), `${id}'s English pair is its own`);
}
for (const pack of [BLOCKS, SOFT]) assert.deepEqual(PAGES.filter((name) => fs.existsSync(path.join(pack, name, "kit.js"))), PAGES.filter((name) => name !== "static"), "the static card alone has no script");
// Each JSON part of template.html and example.html stands as context.editJSON (and a card's 设置…, the page
// service's jsonIn) writes it back: a part on one line compact, as skills/gallery/references/building-blocks.md's Writing back
// tells an Agent to write one, which `gallery block new --recipe habit` copies from here.
const jsonParts = [];
for (const { name, id, folder, pack } of shipped) {
  for (const file of ["template.html", "example.html"]) {
    for (const [, json] of fs.readFileSync(path.join(folder, file), "utf8").matchAll(/<script type="application\/json"[^>]*>([\s\S]*?)<\/script>/g)) {
      if (pack === "gallery") jsonParts.push(`${name}/${file}`);
      assert.equal(json, jsonIn(json, JSON.parse(json)), `${id}'s ${file}: its JSON as editJSON writes it back`);
    }
  }
}
assert.deepEqual(jsonParts, ["chart-view/template.html", "chart-view/example.html", "countdown/template.html", "countdown/example.html", "habit/template.html", "habit/example.html", "heatmap/template.html", "heatmap/example.html", "kanban/template.html", "kanban/example.html", "metric/template.html", "metric/example.html", "metric/example.html", "note/template.html", "note/example.html", "todos/template.html", "todos/example.html", "weather/template.html", "weather/example.html"], "the JSON parts looked at");
// What the static card's notes say a picture is: a file of the page's assets/, served at
// /pages/<slug>/assets/<file> (server/media-route.mjs servePageAsset), which gallery page check says is
// there, or a data: address; never a name alone, which nothing serves. Its places are a page's alone, so
// nothing is said of a document's.
const staticNotes = fs.readFileSync(path.join(BLOCKS, "static", "writing.md"), "utf8");
for (const said of ["a file of the page's `assets/` (`pages/<slug>/assets/`), written `assets/<file>`", "which the server serves at `/pages/<slug>/assets/<file>`", "`gallery page check` says a picture whose file is not there", "never `cover.png` alone, which nothing serves", "may be a `data:` address in the `<img>` itself"]) {
  assert.ok(staticNotes.includes(said), `the static card's picture: ${said}`);
}
assert.ok(staticNotes.includes("Its places are `page` alone") && !staticNotes.includes("In a document it is the document's `assets/`"), "the static card's places: a page's alone, so its notes say nothing of a document's pictures");

// The catalog reads each as its manifest means it, in a workspace that has added them all.
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-shipped-"));
const workspace = path.join(root, "workspace");
fs.mkdirSync(workspace, { recursive: true });
fs.writeFileSync(path.join(workspace, "gallery.json"), `${JSON.stringify({ gallery: "workspace", version: 1 }, null, 2)}\n`);
for (const block of shipped) assert.equal(addShipped(workspace, block).did, "added", block.id);
const catalog = readCatalog(workspace);
assert.deepEqual([...catalog.problems.keys()], [], "every one loads");
const of = (name) => catalog.packages.get(`gallery/${name}`);
assert.deepEqual(PAGES.map((name) => [name, of(name).places]), PAGES.map((name) => [name, ["page"]]), "where each may stand: a custom page (the static card too: a document has its own blocks for what only shows)");
assert.deepEqual(PAGES.map((name) => [name, of(name).needs]), PAGES.map((name) => [name, WORKSPACE.includes(name) ? ["workspace"] : name === "weather" ? ["net:api.open-meteo.com", "net:geocoding-api.open-meteo.com"] : []]), "the workspace's four read it (needs workspace, no consent), the weather names its two hosts of the net, no other needs anything");
assert.deepEqual(WORKSPACE.map((name) => [name, of(name).card.sizes, of(name).card.resize]), [["heatmap", [[8, 4], [12, 4], [4, 4], [12, 3], [8, 3], [8, 2]], true], ["recent", [[4, 4], [4, 2], [4, 6]], true], ["stats", [[8, 2], [12, 2], [4, 4]], true], ["todos", [[4, 4], [4, 6], [8, 4]], true]], "their sizes, the default first, as Gallery 风格 draws them: the heatmap four rows high, a year three, 8 x 2 its squares alone (the user's word of 2026-11-09), the stats a row of four");
// A note and the documents edited last (the user's word of 2026-11-09): any height from 2 to 8 cells at their widths (2 to 4, and 4), their listed sizes the common ones.
for (const name of ["note", "recent"]) {
  const { card } = of(name);
  assert.deepEqual([card.any, card.min, card.max], [true, { w: name === "note" ? 2 : 4, h: 2 }, { w: 4, h: 8 }], `${name}: any height from 2 to 8 at its widths`);
  assert.deepEqual([2, 3, 5, 7, 8, 12].map((h) => sizeFor(card, { w: 4, h }).h), [2, 3, 5, 7, 8, 8], `${name}: every height between, none past 8`);
  assert.ok(card.sizes.every(([w, h]) => w >= card.min.w && w <= card.max.w && h >= card.min.h && h <= card.max.h), `${name}: each listed size inside its bounds`);
}
assert.deepEqual([of("todos").settings.map(({ key, type }) => [key, type]), of("heatmap").settings.map(({ key, type }) => [key, type])], [[["document", "document"], ["done", "switch"]], [["words", "switch"]]], "the to-dos' settings (one document, the done ones too) and the heatmap's (words, not edits)");
assert.deepEqual([of("today").card.sizes, of("note").card.sizes, of("countdown").card.sizes, of("habit").card.sizes], [[[4, 2], [2, 2], [4, 1]], [[4, 2], [2, 2], [4, 4]], [[2, 2], [4, 2]], [[4, 2], [2, 2], [4, 4]]], "the sizes a user picks from, the default first: a greeting a line high too, a habit's five weeks");
assert.deepEqual([of("today").card.w, of("today").card.h, of("today").card.resize], [4, 2, true], "a greeting a phone widget's 4 x 2");
const { card: staticCard } = of("static");
assert.deepEqual([staticCard.sizes[0], staticCard.sizes.length >= 6, staticCard.any, staticCard.w, staticCard.h, staticCard.min, staticCard.max, staticCard.resize, staticCard.fit], [[4, 4], true, true, 4, 4, { w: 1, h: 1 }, { w: 12, h: 24 }, true, "fixed"], "the static card: 4 x 4 by default (Gallery 风格's common size), the common sizes listed, any whole size between 1 x 1 and 12 x 24 (the corner reaches any), its height its own, never its content's");
assert.deepEqual([[1, 1], [12, 24], [5, 7], [3, 1]].map(([w, h]) => sizeFor(staticCard, { w, h })), [{ w: 1, h: 1 }, { w: 12, h: 24 }, { w: 5, h: 7 }, { w: 3, h: 1 }], "held to none of the listed sizes: every w x h the board allows");
assert.ok(staticCard.sizes.every(([w, h]) => w >= staticCard.min.w && w <= staticCard.max.w && h >= staticCard.min.h && h <= staticCard.max.h), "each listed size is inside its bounds");
assert.deepEqual(of("countdown").settings.map(({ key, type }) => [key, type]), [["title", "text"], ["date", "date"]], "the countdown's settings");
assert.deepEqual(of("countdown").parts.settings.edit, "data", "kept in its settings part");
assert.deepEqual([of("weather").card.sizes, of("weather").card.resize], [[[4, 2], [2, 2], [4, 4]], true], "the weather's sizes: now, the temperature alone, and the days ahead");
assert.deepEqual(of("weather").settings.map(({ key, type, options = null }) => [key, type, options]), [["city", "text", null], ["unit", "select", ["℃", "℉"]]], "the weather's settings");
assert.deepEqual(of("weather").needs, ["net:api.open-meteo.com", "net:geocoding-api.open-meteo.com"], "the weather reaches the two hosts of Open-Meteo it names, and no other");
assert.ok(PAGES.filter((name) => name !== "weather").every((name) => !of(name).needs.some((need) => need.startsWith("net:"))), "no other of them goes online (the workspace's four need workspace alone)");
// The weather's settings, in template.html and example.html, as a card's 设置… (the page service's jsonIn)
// writes them back: on one line, compact, as its writing.md shows them.
for (const file of ["template.html", "example.html"]) {
  const [, json] = /<script type="application\/json">([\s\S]*?)<\/script>/.exec(fs.readFileSync(path.join(BLOCKS, "weather", file), "utf8"));
  assert.equal(json, jsonIn(json, JSON.parse(json)), `the weather's ${file}: its settings as 设置… writes them back`);
}
assert.ok(fs.readFileSync(path.join(BLOCKS, "weather", "writing.md"), "utf8").includes('as example.html does: `{"city":"上海","unit":"℃"}` (on one line and compact'), "and its writing.md shows them so");
assert.ok(PAGES.every((name) => Object.values(of(name).parts).every(({ edit }) => edit !== "flow" && edit !== "text")), "no slot, and nothing a custom page leaves read-only");
// The views of a table: a document's (a custom page holds no table), reading tables (the kanban the
// workspace too, to open a document a card links to), their settings in their data part.
assert.deepEqual(VIEWS.map((name) => [name, of(name).places, of(name).needs, of(name).parts.settings.edit]), [["chart-view", ["document"], ["tables"], "data"], ["kanban", ["document"], ["tables", "workspace"], "data"], ["metric", ["document"], ["tables"], "data"]], "the views: a document's, reading tables, their settings their data");
assert.deepEqual(VIEWS.map((name) => of(name).settings.map(({ key }) => key)), [["by", "op", "value", "title"], ["group", "order"], ["op", "column", "where", "is", "title", "unit"]], "their settings");

// ---------- each script's logic, run as a page runs it ----------

/**
 * The kit.js of block `name` run in a function of its own: { def, ...its functions named in `names` },
 * `def` what it registered; `document` and `Date` what it is given (jsdom's, the test's).
 */
function loadBlock(name, names, { document, Date: clock = Date, input = null, drag = null, text = textIn, globals = {}, pack = "gallery" } = {}) {
  const source = fs.readFileSync(path.join(PACKS, pack, name, "kit.js"), "utf8");
  let def = null;
  const kit = { component: (registered) => { def = registered; }, input, drag, text };
  const made = new Function("DocKit", "document", "Date", ...Object.keys(globals), `${source}\nreturn { ${names.join(", ")} };`)(kit, document, clock, ...Object.values(globals));
  assert.equal(def?.id, `${pack}/${name}`, `${name} registers itself`);
  return { def, ...made };
}

// A Date whose now is the test's (`clock.now`, a Date), anything given it read as Date reads it.
function testClock() {
  const clock = { now: new Date(2026, 10, 7, 9, 0) };
  class TestDate extends Date {
    constructor(...given) {
      if (given.length === 0) super(clock.now.getTime());
      else super(...given);
    }
    static now() {
      return clock.now.getTime();
    }
  }
  clock.Date = TestDate;
  return clock;
}

const page = (lang = "zh-CN") => new JSDOM(`<!doctype html><html lang="${lang}"><body></body></html>`).window.document;
const rootWith = (attributes, lang = "") => ({ getAttribute: (name) => attributes[name] ?? null, lang });

// today: the greeting by the hour, the date and the weekday, in the page's language; drawn again by the clock.
{
  const clock = testClock();
  const document = page();
  const today = loadBlock("today", ["partOfDay", "faceOf", "languageOf"], { document, Date: clock.Date });
  assert.deepEqual([0, 4, 5, 11, 12, 17, 18, 23].map(today.partOfDay), ["evening", "evening", "morning", "morning", "afternoon", "afternoon", "evening", "evening"], "早上好 from 5 to 11, 下午好 from 12 to 17, 晚上好 from 18 to 4");
  assert.deepEqual(today.faceOf(new Date(2026, 10, 7, 9, 30), "zh"), { greeting: "早上好", line: ["11月7日", "星期六"], datetime: "2026-11-07" }, "Chinese: the date, then its weekday");
  assert.deepEqual(today.faceOf(new Date(2026, 0, 1, 14, 0), "en"), { greeting: "Good afternoon", line: ["Thursday,", "January 1"], datetime: "2026-01-01" }, "English: the weekday first, as English writes a date");
  assert.deepEqual([rootWith({ "data-ge-language": "en" }, "zh-CN"), rootWith({ "data-ge-language": "zh" }, "en"), rootWith({}, "en-US"), rootWith({}, "en"), rootWith({}, "zh-CN"), rootWith({}, "")].map(today.languageOf), ["en", "zh", "en", "en", "zh", "zh"], "the UI's language where Gallery says it, else the page's lang");
  const host = document.createElement("div");
  host.setAttribute("data-doc-component", "gallery/today");
  document.body.append(host);
  assert.deepEqual(today.def.on, ["clock", "layout"], "it hears the clock, and its card's size (its layout) and nothing else");
  clock.now = new Date(2026, 10, 7, 11, 59, 40);
  const handle = today.def.mount(host, {});
  const said = () => [host.querySelector(".gallery-today-greeting").textContent, host.querySelector(".gallery-today-date").textContent, host.querySelector(".gallery-today-date").getAttribute("datetime")];
  assert.deepEqual(said(), ["早上好", "11月7日 星期六", "2026-11-07"], "drawn as it mounts");
  assert.equal(host.children.length, 1, "one face, all of it what the manifest's runtime names");
  clock.now = new Date(2026, 10, 7, 12, 0, 5);
  handle.update("clock", "minute");
  assert.deepEqual(said(), ["下午好", "11月7日 星期六", "2026-11-07"], "the minute noon comes: the greeting moves");
  clock.now = new Date(2026, 10, 7, 23, 59, 50);
  handle.update("clock", "minute");
  assert.equal(said()[0], "晚上好");
  clock.now = new Date(2026, 10, 8, 0, 0, 5);
  handle.update("clock", "day");
  assert.deepEqual(said(), ["晚上好", "11月8日 星期日", "2026-11-08"], "midnight (the clock's day): the date and the weekday move");
  clock.now = new Date(2026, 11, 31, 23, 59);
  handle.update("clock", "minute");
  clock.now = new Date(2027, 0, 1, 0, 0);
  handle.update("clock", "day");
  assert.deepEqual(said(), ["晚上好", "1月1日 星期五", "2027-01-01"], "and a year's end");
  const english = page("en");
  const there = english.createElement("div");
  english.body.append(there);
  loadBlock("today", [], { document: english, Date: clock.Date }).def.mount(there, {});
  assert.equal(there.querySelector(".gallery-today-greeting").textContent + there.querySelector(".gallery-today-date").textContent, "Good eveningFriday, January 1", "an English page, English words in English order");
  // The week it is in, Monday first, for the eye alone (the date says it): each day's initial over its date, today's Today (今) over its date and marked, the days gone before it.
  const week = there.querySelector(".gallery-today-week");
  assert.equal(week.getAttribute("aria-hidden"), "true", "the week is for the eye alone");
  assert.deepEqual([...week.children].map((day) => [day.textContent, day.classList.contains("gallery-today-now"), day.classList.contains("gallery-today-past")]),
    [["M28", false, true], ["T29", false, true], ["W30", false, true], ["T31", false, true], ["Today1", true, false], ["S2", false, false], ["S3", false, false]], "Monday to Sunday across the year's end, today marked and said (Today), the days before it gone");
  assert.deepEqual([...there.querySelectorAll(".gallery-today-date > span")].map((piece) => piece.textContent), ["Friday,", "January 1"], "two pieces a line breaks between, never inside");
}

// countdown: whole days of the calendar, before, on and after the day; a date it cannot read asks for one.
{
  const countdown = loadBlock("countdown", ["dateOf", "countdownOf", "faceOf"], { document: page() });
  const at = new Date(2026, 10, 7, 23, 59);
  assert.deepEqual(countdown.countdownOf("2027-02-06", at), { kind: "left", days: 91 }, "91 days to 2027-02-06, late in the evening of 11-07 as early");
  assert.deepEqual(countdown.countdownOf("2027-02-06", new Date(2026, 10, 7, 0, 1)), { kind: "left", days: 91 });
  assert.deepEqual(countdown.countdownOf("2026-11-08", at), { kind: "left", days: 1 });
  assert.deepEqual(countdown.countdownOf("2026-11-07", at), { kind: "today", days: 0 });
  assert.deepEqual(countdown.countdownOf("2026-10-01", at), { kind: "since", days: 37 });
  assert.deepEqual(countdown.countdownOf("2024-02-29", new Date(2025, 2, 1)), { kind: "since", days: 366 }, "across a leap day");
  assert.deepEqual(countdown.countdownOf("2026-03-30", new Date(2026, 2, 28, 12)), { kind: "left", days: 2 }, "across a change of the clocks, where there is one");
  for (const wrong of ["2027-02-30", "2027/02/06", "2027-2-6", "", null, undefined, 20270206]) assert.deepEqual(countdown.countdownOf(wrong, at), { kind: "none" }, `${wrong}: no date`);
  assert.deepEqual(countdown.faceOf({ title: "春节", date: "2027-02-06" }, at, "zh"), { head: "春节", label: "还有", count: "91", unit: "天", big: "", foot: ["2027年2月6日", "周六"], empty: null }, "the day's name its head, the count's label over it, the date under it (its weekday short)");
  assert.deepEqual(countdown.faceOf({ title: "发布 0.2.0", date: "2026-11-20" }, at, "zh").head, "发布 0.2.0", "a name as written, on its own line");
  assert.deepEqual(countdown.faceOf({ date: "2026-10-01" }, at, "zh"), { head: "倒计时", label: "已经过去", count: "37", unit: "天", big: "", foot: ["2026年10月1日", "周四"], empty: null }, "no title: 倒计时, the label the words");
  assert.deepEqual(countdown.faceOf({ title: " 上线 ", date: "2026-11-07" }, at, "zh"), { head: "上线", label: "", count: null, unit: "", big: "就是今天", foot: ["2026年11月7日", "周六"], empty: null });
  assert.deepEqual(countdown.faceOf({}, at, "zh"), { head: "倒计时", label: "", count: null, unit: "", big: "", foot: [], empty: { title: "选一个日子", where: "在卡片右上角的 设置… 里填日期", whereShort: "在 设置… 里填日期" } }, "no date yet: the cards' empty face, where to set one (the grip's menu), shorter on a narrow card");
  assert.deepEqual(countdown.faceOf({ title: "Launch", date: "2026-11-08" }, at, "en"), { head: "Launch", label: "Days left", count: "1", unit: "day", big: "", foot: ["Sun,", "Nov 8, 2026"], empty: null });
  // The two cards that write a day write it in one order: the weekday first in English, after the date in
  // Chinese (the countdown's foot, a faint caption, its weekday short: 2027年2月6日 周六).
  const { faceOf: todayFace } = loadBlock("today", ["faceOf"], { document: page() });
  const [enLine, enFoot] = [todayFace(at, "en").line, countdown.faceOf({ date: "2026-11-07" }, at, "en").foot];
  assert.ok(enLine[0].startsWith(enFoot[0].replace(",", "")) && enFoot[1].startsWith(enLine[1].slice(0, 3)), `English: "${enLine.join(" ")}" as the countdown's "${enFoot.join(" ")}", the weekday first`);
  const [zhLine, zhFoot] = [todayFace(at, "zh").line, countdown.faceOf({ date: "2026-11-07" }, at, "zh").foot];
  assert.ok(zhFoot[0].endsWith(zhLine[0]) && zhLine[1].endsWith(zhFoot[1].slice(1)), `Chinese: "${zhLine.join(" ")}" as the countdown's "${zhFoot.join(" ")}", the weekday after`);
  const { monthOf } = loadBlock("countdown", ["monthOf"], { document: page() });
  assert.deepEqual(monthOf({ year: 2027, month: 2 }).map((week) => week.join(",")), ["1,2,3,4,5,6,7", "8,9,10,11,12,13,14", "15,16,17,18,19,20,21", "22,23,24,25,26,27,28"], "a wide card's month, Monday first: February 2027 four whole weeks");
  assert.deepEqual(monthOf({ year: 2026, month: 11 }).map((week) => week.map((day) => day ?? "").join(",")), [",,,,,,1", "2,3,4,5,6,7,8", "9,10,11,12,13,14,15", "16,17,18,19,20,21,22", "23,24,25,26,27,28,29", "30,,,,,,"], "and November 2026 six, none before its first nor after its last");
  assert.equal(countdown.faceOf({ date: "2026-11-10" }, at, "en").unit, "days");
}

// habit: the streak from today, or from yesterday while today is open, to the first gap; today pressed in and out.
{
  const habit = loadBlock("habit", ["dayOf", "dayAfter", "readHabit", "streakOf", "toggled", "weekOf", "monthOf", "pressToday", "rename"], { document: page() });
  assert.equal(habit.dayOf(new Date(2026, 0, 5, 23, 59)), "2026-01-05", "a day of the reader's clock");
  assert.deepEqual([habit.dayAfter("2026-12-31", 1), habit.dayAfter("2026-03-01", -1), habit.dayAfter("2024-03-01", -1), habit.dayAfter("2026-11-07", -6)], ["2027-01-01", "2026-02-28", "2024-02-29", "2026-11-01"]);
  const days = ["2026-10-30", "2026-10-31", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
  assert.equal(habit.streakOf(days, "2026-11-06"), 5, "today checked: back to the gap of 11-01");
  assert.equal(habit.streakOf(days, "2026-11-07"), 5, "today open: from yesterday, the streak still standing");
  assert.equal(habit.streakOf(days, "2026-11-08"), 0, "yesterday open too: broken");
  assert.equal(habit.streakOf([...days, "2026-11-07"], "2026-11-07"), 6);
  assert.equal(habit.streakOf(["2026-12-30", "2026-12-31", "2027-01-01"], "2027-01-01"), 3, "across a year's end");
  assert.equal(habit.streakOf([], "2026-11-07"), 0);
  assert.deepEqual(habit.toggled(["2026-11-05"], "2026-11-07"), ["2026-11-05", "2026-11-07"], "pressed: today in");
  assert.deepEqual(habit.toggled(["2026-11-07", "2026-11-05"], "2026-11-07"), ["2026-11-05"], "pressed again: today out, the rest in order");
  assert.deepEqual(habit.toggled(["2026-11-06", "2026-11-05", "2026-11-06"], "2026-11-07"), ["2026-11-05", "2026-11-06", "2026-11-07"], "each once");
  assert.deepEqual(habit.weekOf(days, "2026-11-07").map(({ day, weekday, done, today, future }) => `${day.slice(5)}:${weekday}:${done ? 1 : 0}${today ? "T" : future ? "F" : ""}`), ["11-02:1:1", "11-03:2:1", "11-04:3:1", "11-05:4:1", "11-06:5:1", "11-07:6:0T", "11-08:0:0F"], "the week today is in, Monday to Sunday (seven circles), today and the day to come marked");
  const month = habit.monthOf(days, "2026-11-07");
  assert.deepEqual([month.length, month[0].day, month[34].day, month.filter(({ streak }) => streak).map(({ day }) => day.slice(5)).join(",")], [35, "2026-10-05", "2026-11-08", "11-02,11-03,11-04,11-05,11-06"], "five weeks Monday first, ending with today's; the days of the streak (from yesterday while today is open) marked, not 10-30 and 10-31 before its gap");
  assert.deepEqual(habit.readHabit({}), { name: "", days: [] }, "a new card's");
  for (const [wrong, why] of [[null, /no object/], [[], /no object/], [{ name: 3 }, /name is no string/], [{ days: "2026-11-07" }, /no list of dates/], [{ days: ["2026-11-7"] }, /no list of dates/]]) assert.throws(() => habit.readHabit(wrong), why);
  // One press, one write: the JSON written back as editJSON writes it, on its one line; again, taken back.
  let text = '{ "name": "读书", "days": ["2026-11-06"] }';
  const context = { editJSON: (name, change) => {
    assert.equal(name, "habit");
    const data = JSON.parse(text);
    const result = change(data);
    text = jsonIn(text, result === undefined ? data : result);
    return true;
  } };
  assert.ok(habit.pressToday(context, "2026-11-07"));
  assert.equal(text, '{"name":"读书","days":["2026-11-06","2026-11-07"]}');
  habit.pressToday(context, "2026-11-07");
  assert.deepEqual(JSON.parse(text).days, ["2026-11-06"], "pressed again: as it was");
  habit.rename(context, "  每天读书 ");
  assert.equal(JSON.parse(text).name, "每天读书", "a name, trimmed");
}

// note: the words typed go to the file and come back as they were, its field read-only where nothing writes.
{
  const document = page();
  /** @type {{ field: any, commit: (value: string) => void } | null} */
  let given = null;
  const input = (field, { commit }) => {
    given = { field, commit };
    return { set(value) { field.value = value; }, get value() { return field.value; } };
  };
  const note = loadBlock("note", ["textOf", "writeNote"], { document, input });
  assert.deepEqual([note.textOf({}), note.textOf({ text: "a\nb" })], ["", "a\nb"]);
  for (const wrong of [null, "x", [], { text: 3 }]) assert.throws(() => note.textOf(wrong), /no object|no string/);
  let text = '{ "text": "" }';
  let writable = false;
  const host = document.createElement("div");
  document.body.append(host);
  const script = document.createElement("script");
  script.type = "application/json";
  host.append(script);
  const context = {
    signal: new AbortController().signal,
    canEdit: () => writable,
    readJSON: () => JSON.parse(text),
    fail: (error) => { throw error; },
    editJSON: (name, change) => {
      assert.equal(name, "note");
      if (!writable) return false;
      const data = JSON.parse(text);
      const result = change(data);
      text = jsonIn(text, result === undefined ? data : result);
      return true;
    },
  };
  const handle = note.def.mount(host, context);
  const field = host.querySelector("textarea.gallery-note-field");
  assert.ok(field && given?.field === field, "its field, DocKit.input's");
  assert.deepEqual([field.readOnly, field.value, field.placeholder], [true, "", "写点什么…"], "read-only until the page takes edits; empty, it says 写点什么…");
  writable = true;
  handle.update("editable");
  assert.equal(field.readOnly, false, "editable: the reader types");
  const typed = "第一行\n第二行 </script> 和 <!-- 也在";
  given.commit(typed);
  assert.equal(text, '{"text":"第一行\\n第二行 <\\/script> 和 \\u003c!-- 也在"}', "one write, on its one line, what could end the script escaped");
  assert.equal(JSON.parse(text).text, typed, "and read back as typed");
  handle.update("source");
  assert.equal(field.value, typed, "drawn from the file again: the same words");
  text = '{ "text": "Agent 写的" }';
  handle.update("source");
  assert.equal(field.value, "Agent 写的", "another's write shows");
}

// weather: the sky a WMO code says, the two addresses, the face of each state; its mount through a test's context.fetch.
{
  const document = page();
  const weather = loadBlock("weather", ["skyOf", "searchAddress", "forecastAddress", "placeOf", "faceOf", "degrees"], { document });
  assert.deepEqual([0, 1, 2, 3, 45, 61, 65, 73, 80, 95, 99, 42].map((code) => weather.skyOf(code).words), ["clear", "mostly", "partly", "overcast", "fog", "light-rain", "heavy-rain", "snow", "showers", "thunder", "hail", "unknown"], "WMO's codes, a code it does not know said so");
  assert.deepEqual([weather.skyOf(0, false).picture, weather.skyOf(2, false).picture, weather.skyOf(0).picture], ["moon", "partly-night", "sun"], "a clear night: the moon");
  assert.equal(weather.searchAddress("上海 浦东", "zh"), "https://geocoding-api.open-meteo.com/v1/search?name=%E4%B8%8A%E6%B5%B7%20%E6%B5%A6%E4%B8%9C&count=1&language=zh&format=json");
  const place = { name: "上海", latitude: 31.22222, longitude: 121.45806, region: "上海市" };
  assert.ok(weather.forecastAddress(place, "℃").startsWith("https://api.open-meteo.com/v1/forecast?latitude=31.22&longitude=121.46&current=") && !weather.forecastAddress(place, "℃").includes("fahrenheit") && weather.forecastAddress(place, "℉").endsWith("&temperature_unit=fahrenheit"), "the weather at two decimals of its place, ℉ asked for as such");
  assert.deepEqual([weather.placeOf({ results: [{ name: "Berlin", latitude: 52.52, longitude: 13.41, country: "Deutschland" }] }), weather.placeOf({}), weather.placeOf({ results: [] }), weather.placeOf(null)], [{ name: "Berlin", latitude: 52.52, longitude: 13.41, region: "Deutschland" }, null, null, null], "the first match, or none");
  assert.deepEqual([weather.degrees(23.6), weather.degrees(-2.4), weather.degrees(null)], ["24°", "−2°", "–"]);
  const forecast = { current: { temperature_2m: 23.4, apparent_temperature: 24.1, relative_humidity_2m: 61, wind_speed_10m: 12.3, wind_direction_10m: 44, weather_code: 2, is_day: 1 }, daily: { time: ["2026-11-08", "2026-11-09", "2026-11-10"], weather_code: [2, 61, 3], temperature_2m_max: [26.2, 21, 19.5], temperature_2m_min: [18.4, 15.1, 14] } };
  const face = weather.faceOf({ kind: "weather", city: "上海", place, forecast, at: new Date(2026, 10, 8, 14, 5).toISOString() }, "zh");
  assert.deepEqual(face.head, { city: "上海", at: "更新于 14:05", stale: false });
  const kept = weather.faceOf({ kind: "weather", city: "上海", place, forecast, at: new Date(2026, 10, 7, 21, 40).toISOString(), cached: true }, "zh", new Date(2026, 10, 8, 9, 5));
  assert.deepEqual(kept.head, { city: "上海", at: "昨天 21:40", stale: true }, "an answer kept from before the network went: when, its sign in the head");
  assert.deepEqual(face.now, { picture: "partly", sky: "多云", temperature: "23°", range: "18° / 26°", span: [18.4, 26.2], more: [{ icon: "feels", text: "体感 24°" }, { icon: "humidity", text: "61%" }, { icon: "wind", text: "东北风 12 km/h" }] }, "now: the lowest first, the wind's direction and speed");
  assert.deepEqual(face.days.map(({ weekday, sky, range }) => [weekday, sky, range]), [["周一", "小雨", "15° / 21°"], ["周二", "阴", "14° / 20°"]], "the days after today, today's being the head's");
  assert.deepEqual(["pick", "loading", "consent", "offline", "private", "failed"].map((kind) => weather.faceOf({ kind, city: "上海" }, "zh").note), ["写上一个城市", "正在取天气…", "允许联网之后显示天气", "现在连不上网，取不到天气", "取不到天气", "没能取到天气"]);
  assert.deepEqual(["pick", "consent", "offline", "private"].map((kind) => weather.faceOf({ kind, city: "上海" }, "zh").hint), ["在卡片右上角的 设置… 里填，比如「杭州」", "数据来自 open-meteo.com", "连上以后会自己再取", "网络设置把天气服务指向了本地地址"], "each state's what to do, faint, under it");
  assert.equal(weather.faceOf({ kind: "private", city: "Berlin" }, "en").hint, "The network setup sends the weather service to a local address", "a local address said as such, in English too");
  assert.deepEqual([weather.faceOf({ kind: "unknown", city: "Atlantis" }, "en").note, weather.faceOf({ kind: "pick" }, "en").hint], ["No place called “Atlantis”", "In Settings… at the card's top right, such as “Berlin”"]);
  // Its mount, through a context.fetch of the test's: refused for consent, then allowed; a city no lookup knows; no city.
  const mounted = async (settings, fetch) => {
    const host = document.createElement("div");
    document.body.append(host);
    const asked = [];
    const context = { readJSON: () => settings, fetch: (url, options) => { asked.push(url); return fetch(url, options); }, interval: () => 0, fail: (error) => { throw error; } };
    weather.def.mount(host, context);
    await new Promise((resolve) => setTimeout(resolve, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    return { host, asked, kind: host.querySelector(".gallery-weather-face")?.dataset.kind, text: host.textContent };
  };
  const refusal = (code) => Object.assign(new Error(code), { code });
  const consent = await mounted({ city: "上海" }, async () => { throw refusal("consent"); });
  assert.deepEqual([consent.kind, consent.asked.length, consent.text], ["consent", 1, "上海允许联网之后显示天气数据来自 open-meteo.com"], "refused for consent: it says so, and asks nothing more");
  const shown = await mounted({ city: "上海" }, async (url) => ({ data: url.includes("geocoding") ? { results: [place] } : forecast, at: new Date(2026, 10, 8, 14, 5).toISOString(), cached: false }));
  assert.deepEqual([shown.kind, shown.asked.map((url) => new URL(url).host)], ["weather", ["geocoding-api.open-meteo.com", "api.open-meteo.com"]], "allowed: the city looked up, then its weather, at the hosts its needs name");
  assert.ok(shown.text.includes("23°") && shown.text.includes("多云") && shown.host.querySelectorAll(".gallery-weather-day").length === 2, "the weather drawn, the days after today");
  assert.equal((await mounted({ city: "Atlantis" }, async () => ({ data: { results: [] }, at: "", cached: false }))).kind, "unknown");
  assert.deepEqual([(await mounted({}, async () => { throw new Error("no fetch for no city"); })).kind, (await mounted({ city: "上海" }, async () => { throw refusal("offline"); })).kind], ["pick", "offline"], "no city: nothing fetched; the network not there: said so");
  assert.deepEqual([(await mounted({ city: "上海" }, async () => { throw refusal("private"); })).kind, (await mounted({ city: "上海" }, async () => { throw refusal("status"); })).kind], ["private", "failed"], "refused as a local address: said so, not the generic failure, which another refusal still is");
}

// ---------- the workspace's four, on a context.workspace of the test's ----------

// A context of the test's for a block that reads the workspace: its settings part's JSON, the answers its
// queries get (by kind: data, or an Error with a code), what it asked and what it opened.
function workspaceContext(answers, settings = {}) {
  const asked = [];
  const opened = [];
  const controller = new AbortController();
  return {
    asked, opened, signal: controller.signal, end: () => controller.abort(),
    listen: (target, type, run, options = {}) => { target.addEventListener(type, run, options); controller.signal.addEventListener("abort", () => target.removeEventListener(type, run, options)); },
    readJSON: () => settings,
    fail: (error) => { throw error; },
    workspace: {
      query: (kind, options) => {
        asked.push([kind, options]);
        const answer = answers[kind];
        return answer instanceof Error ? Promise.reject(answer) : Promise.resolve({ data: answer, at: "2026-11-11T02:00:00.000Z" });
      },
      open: (target) => opened.push(target),
    },
  };
}
const offline = () => Object.assign(new Error("an exported file has no workspace to read"), { code: "offline" });
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

// todos: grouped by document, the open ones (the done ones too where its setting says), a click opening it there.
{
  const todos = loadBlock("todos", ["askedOf", "groupsOf", "emptyLine"], { document: page() });
  const data = [
    { ref: { slug: "plan", block: "aaaaaaaa", text: "写周报", path: ["本周"], nth: 0 }, text: "写周报", done: false, slug: "plan", title: "计划", path: ["本周"] },
    { ref: { slug: "plan", block: null, text: "开会", path: [], nth: 0 }, text: "开会", done: true, slug: "plan", title: "计划", path: [] },
    { ref: { slug: "notes", block: null, text: "买牛奶", path: [], nth: 0 }, text: "买牛奶", done: false, slug: "notes", title: "笔记", path: [] },
  ];
  assert.deepEqual([todos.askedOf({}), todos.askedOf({ document: "plan", done: true }), todos.askedOf(null), todos.askedOf({ document: "" })], [{ document: null, done: false }, { document: "plan", done: true }, { document: null, done: false }, { document: null, done: false }]);
  const open = todos.groupsOf(data, { document: null, done: false }, new Set());
  assert.deepEqual(open.groups.map(({ slug, items }) => [slug, items.map(({ text }) => text)]), [["plan", ["写周报"]], ["notes", ["买牛奶"]]], "the open ones, by document, in the order they came");
  assert.deepEqual([open.open, open.all], [2, 3]);
  assert.deepEqual(todos.groupsOf(data, { document: null, done: true }, new Set()).groups[0].items.map(({ text }) => text), ["写周报", "开会"], "the done ones too, where its setting says");
  assert.deepEqual(todos.groupsOf(data, { document: null, done: false }, new Set([JSON.stringify(["plan", [], "开会"])])).groups[0].items.map(({ text }) => text), ["写周报", "开会"], "a done one checked on the card kept in it");
  assert.deepEqual([todos.emptyLine({ groups: [], all: 0 }, { document: null }, "zh"), todos.emptyLine({ groups: [], all: 2 }, { document: null }, "zh"), todos.emptyLine({ groups: [], all: 0 }, { document: "plan" }, "zh"), todos.emptyLine({ groups: [{}], all: 1 }, { document: null }, "zh")],
    ["所有文档里的待办会出现在这里", "待办都完成了", "这篇文档里没有待办", null], "what it says where it lists nothing, and nothing where it lists some");
  assert.deepEqual(todos.def.on, ["source", "data", "layout"]);
  const document = page();
  const host = document.createElement("div");
  document.body.append(host);
  const context = workspaceContext({ todos: data });
  const handle = todos.def.mount(host, context);
  await settled();
  assert.deepEqual(context.asked, [["todos", { limit: 1000 }]], "it asks for the to-dos of every document");
  assert.deepEqual([...host.querySelectorAll(".gallery-todos-doc")].map((node) => node.textContent), ["计划", "笔记"]);
  assert.deepEqual([...host.querySelectorAll(".gallery-todos-text")].map((node) => node.textContent), ["写周报", "买牛奶"]);
  assert.equal(host.querySelector(".gallery-todos-path").textContent, "本周", "the headings it stands under");
  assert.equal(host.querySelector(".gallery-todos-count").textContent, "2 项", "how many are open, the head's quiet note");
  assert.deepEqual([host.querySelector(".gallery-todos-progress").textContent, host.querySelectorAll(".gallery-todos-tick").length, host.querySelectorAll(".gallery-todos-tick.gallery-todos-on").length], ["已完成 1 / 333%", 3, 1], "已完成 1 / 3 and its percent, over a tick an item, the done ones lit (the 4 x 4 face)");
  assert.deepEqual([...host.querySelectorAll(".gallery-todos-group-count")].map((node) => node.textContent), ["1", "1"], "each group's open count after its title");
  assert.deepEqual([...host.querySelectorAll(".gallery-todos-key-count")].map((node) => node.textContent), ["1", "2", "2"], "the key (a wide card's): done, open, the documents they are in");
  assert.equal(host.querySelector(".gallery-todos-percent").textContent, "33%", "the share done in the ring");
  const titled = document.createElement("div");
  document.body.append(titled);
  todos.def.mount(titled, workspaceContext({ todos: [{ ...data[0], path: ["计划", "本周"] }] }));
  await settled();
  assert.equal(titled.querySelector(".gallery-todos-path").textContent, "本周", "its document's title, its first heading, not said again under the group's");
  host.querySelector(".gallery-todos-todo").click();
  host.querySelectorAll(".gallery-todos-todo")[1].click();
  host.querySelectorAll(".gallery-todos-doc")[1].click();
  assert.deepEqual(context.opened, [{ slug: "plan", block: "aaaaaaaa" }, { slug: "notes", block: null }, { slug: "notes" }], "a click opens its document, at its block where it has one");
  handle.update("data", "recent");
  handle.update("data", "todos");
  await settled();
  assert.equal(context.asked.length, 2, "read again for the to-dos alone");
  const export_ = page();
  const there = export_.createElement("div");
  export_.body.append(there);
  loadBlock("todos", [], { document: export_ }).def.mount(there, workspaceContext({ todos: offline() }));
  await settled();
  assert.deepEqual([there.querySelector(".gallery-todos-line").textContent, there.querySelector(".gallery-todos-hint").textContent], ["在 Gallery 里打开时显示", "现在读不到工作区"], "an export: where it shows, and why not here");
  const one = workspaceContext({ todos: [] }, { document: "plan" });
  const lone = document.createElement("div");
  document.body.append(lone);
  todos.def.mount(lone, one);
  await settled();
  assert.deepEqual([one.asked[0], lone.querySelector(".gallery-todos-line").textContent], [["todos", { limit: 1000, slugs: ["plan"] }], "这篇文档里没有待办"], "one document: its to-dos alone");
  assert.equal(host.querySelector(".gallery-todos-check"), null, "no setTodo (an export): no box to press, the box drawn alone");

  // Where the workspace takes checks (setTodo): a box of its own beside the words, drawn
  // checked at once and written by its ref; kept on the card, struck through, as the to-dos are read again;
  // a refusal puts the box back, says why and reads again.
  const checking = workspaceContext({ todos: data });
  const set = [];
  let refuse = null;
  checking.workspace.setTodo = (ref, done) => {
    set.push([ref.text, done]);
    return refuse ? Promise.reject(Object.assign(new Error("refused"), { code: refuse })) : Promise.resolve(true);
  };
  checking.timeout = (fn, ms) => setTimeout(fn, ms);
  const card = document.createElement("div");
  document.body.append(card);
  // (the block run in this document, so that what it reads of the focus is this one's)
  loadBlock("todos", [], { document }).def.mount(card, checking);
  await settled();
  const items = () => [...card.querySelectorAll(".gallery-todos-item")].map((item) => `${item.querySelector(".gallery-todos-text").textContent}${item.querySelector(".gallery-todos-check").getAttribute("aria-checked") === "true" ? " ✓" : ""}`);
  assert.deepEqual(items(), ["写周报", "买牛奶"], "a box to press on each item");
  // The keys stay on the box that was used: the list drawn anew by the check puts the focus back on the box of the same
  // to-do (Space, then Tab, goes on from where it was, not from the top of the page).
  const used = card.querySelector(".gallery-todos-check");
  const usedKey = used.dataset.focusKey;
  used.focus();
  assert.equal(document.activeElement, used, "the first box has the focus");
  used.click();
  assert.deepEqual([items(), set, checking.opened.length], [["写周报 ✓", "买牛奶"], [["写周报", true]], 0], "checked at once, written by its ref, its document not opened");
  assert.ok(usedKey?.startsWith("check:") && document.activeElement !== used && card.contains(document.activeElement) && document.activeElement.dataset.focusKey === usedKey, "the list drawn anew (a new box), the focus on the new box of the same to-do");
  assert.equal(card.querySelectorAll(".gallery-todos-key-count")[1].textContent, "1", "one open left");
  await settled();
  checking.workspace.query = () => Promise.resolve({ data: data.map((todo) => (todo.text === "写周报" ? { ...todo, done: true } : todo)), at: "" });
  refuse = "changed";
  card.querySelectorAll(".gallery-todos-check")[1].click();
  assert.deepEqual(items(), ["写周报 ✓", "买牛奶 ✓"], "the second drawn checked at once");
  await settled();
  await settled();
  const note = card.querySelector(".gallery-todos-note");
  assert.deepEqual([items(), note.hidden, note.textContent], [["写周报 ✓", "买牛奶"], false, "这一项刚被改过，已重新读取"], "refused: its box put back, the reason said, read again (the first kept, struck through, though done)");
  refuse = "locked";
  card.querySelectorAll(".gallery-todos-check")[1].click();
  await settled();
  await settled();
  assert.equal(note.textContent, "这一项在文档里是只读的，不能勾选", "a to-do of a place the document's own page cannot check: said so, not called changed");

  // A box checked writes its document, which is then the one edited last: the facts put its group first. The
  // card keeps the groups where they were drawn, so that the next box aimed at the group is still under the
  // pointer; a document that comes new to it, first.
  const order = todos.groupsOf(data, { document: null, done: false }, new Set(), ["notes", "plan"]);
  assert.deepEqual(order.groups.map(({ slug }) => slug), ["notes", "plan"], "groupsOf given the order drawn before: kept");
  assert.deepEqual(todos.groupsOf([...data, { ref: { slug: "new", block: null, text: "新的", path: [], nth: 0 }, text: "新的", done: false, slug: "new", title: "新", path: [] }], { document: null, done: false }, new Set(), ["notes", "plan"]).groups.map(({ slug }) => slug), ["new", "notes", "plan"], "one not in it first");
  const three = ["a", "b", "c"].map((slug) => ({ ref: { slug, block: null, text: `事${slug}`, path: [], nth: 0 }, text: `事${slug}`, done: false, slug, title: slug.toUpperCase(), path: [] }));
  const moving = workspaceContext({ todos: three });
  moving.workspace.setTodo = () => Promise.resolve(true);
  moving.timeout = (fn, ms) => setTimeout(fn, ms);
  const there3 = document.createElement("div");
  document.body.append(there3);
  const handle3 = todos.def.mount(there3, moving);
  await settled();
  const groups = () => [...there3.querySelectorAll(".gallery-todos-doc")].map((node) => node.textContent).join("");
  assert.equal(groups(), "ABC");
  there3.querySelectorAll(".gallery-todos-check")[2].click();
  moving.workspace.query = () => Promise.resolve({ data: [{ ...three[2], done: true }, three[0], three[1]], at: "" }); // C written: edited last, first
  handle3.update("data", "todos");
  await settled();
  assert.equal(groups(), "ABC", "C's box checked: C edited last, read again, its group still where it was");
  assert.deepEqual([...there3.querySelectorAll(".gallery-todos-item")].map((item) => item.querySelector(".gallery-todos-check").getAttribute("aria-checked")), ["false", "false", "true"], "and its item struck through there");
  const free = workspaceContext({ todos: three });
  const there4 = document.createElement("div");
  document.body.append(there4);
  const handle4 = todos.def.mount(there4, free);
  await settled();
  free.workspace.query = () => Promise.resolve({ data: [three[2], three[0], three[1]], at: "" });
  handle4.update("data", "todos");
  await settled();
  assert.equal([...there4.querySelectorAll(".gallery-todos-doc")].map((node) => node.textContent).join(""), "CAB", "before a box is checked here the card follows the workspace's order");
}

// recent: the documents edited last, when each was said as a person says it, a click opening it.
{
  const recent = loadBlock("recent", ["whenOf", "groupOf", "iconKindOf"], { document: page() });
  const now = new Date(2026, 10, 11, 10, 0);
  const ago = (minutes) => new Date(now.getTime() - minutes * 60_000).toISOString();
  assert.deepEqual([0, 5, 59, 60, 61 * 3, 60 * 9, 60 * 11].map((minutes) => recent.whenOf(ago(minutes), now, "zh")), ["刚刚", "5 分钟前", "59 分钟前", "09:00", "06:57", "01:00", "23:00"], "within the hour minutes, then the hour of the day (today's and, under 昨天, yesterday's)");
  assert.equal(recent.whenOf(ago(60 * 11), now, "zh", false), "昨天", "a short card's, with no groups: 昨天");
  // 2026-11-11 is a Wednesday: this week holds Monday the 9th and Tuesday the 10th.
  assert.deepEqual([recent.whenOf(new Date(2026, 10, 9, 9).toISOString(), now, "zh"), recent.whenOf(new Date(2026, 10, 8, 9).toISOString(), now, "zh"), recent.whenOf(new Date(2026, 9, 2, 9).toISOString(), now, "zh"), recent.whenOf(new Date(2025, 9, 2, 9).toISOString(), now, "zh")],
    ["周一", "11月8日", "10月2日", "2025年10月2日"], "a day earlier this week its weekday, else the date (the year where it is another)");
  assert.deepEqual([ago(5), new Date(2026, 10, 10, 9).toISOString(), new Date(2026, 10, 9, 9).toISOString(), new Date(2026, 10, 8, 9).toISOString()].map((edited) => recent.groupOf(edited, now)), ["today", "yesterday", "week", "earlier"], "its groups: 今天, 昨天, 本周 (from its Monday), 更早");
  assert.deepEqual([recent.whenOf(ago(5), now, "en"), recent.whenOf(new Date(2026, 9, 2, 9).toISOString(), now, "en")], ["5 min ago", "Oct 2"]);
  assert.equal(recent.whenOf(new Date(2026, 10, 10, 23, 30).toISOString(), new Date(2026, 10, 11, 0, 30), "zh"), "23:30", "an hour ago across midnight: yesterday's, its hour");
  assert.deepEqual(["/icons/book_gray.svg", "assets/icon.png", "📝", null, ""].map(recent.iconKindOf), ["glyph", "image", "emoji", null, null]);
  const document = page();
  const host = document.createElement("div");
  document.body.append(host);
  const context = workspaceContext({ recent: [{ slug: "plan", title: "计划", icon: "📝", edited: new Date().toISOString() }, { slug: "notes", title: "笔记", icon: null, edited: new Date(Date.now() - 3 * 60_000).toISOString() }] });
  const handle = recent.def.mount(host, context);
  await settled();
  assert.deepEqual(context.asked, [["stats", undefined], ["recent", { limit: 50 }]], "the documents edited last, and how many there are in all (还有 N 篇)");
  assert.deepEqual([...host.querySelectorAll(".gallery-recent-group")].map((node) => node.textContent), ["今天"], "grouped by when");
  assert.deepEqual([...host.querySelectorAll(".gallery-recent-name")].map((node) => node.textContent), ["计划", "笔记"]);
  assert.deepEqual([...host.querySelectorAll(".gallery-recent-when")].map((node) => node.textContent), ["刚刚", "3 分钟前"]);
  assert.ok(host.querySelector(".gallery-recent-picture img").getAttribute("src").startsWith("/__gallery/edit/icon?value="), "an emoji's picture from the server's icon route, as the sidebar's");
  assert.equal(host.querySelectorAll(".gallery-recent-icon")[1].children.length, 0, "no icon: the page its style draws");
  host.querySelectorAll(".gallery-recent-document")[1].click();
  assert.deepEqual(context.opened, [{ slug: "notes" }], "a click opens the document");
  handle.update("clock", "minute");
  handle.update("data", "todos");
  await settled();
  assert.equal(context.asked.length, 2, "the clock moves the times alone; another kind's change reads nothing");
  const empty = document.createElement("div");
  document.body.append(empty);
  recent.def.mount(empty, workspaceContext({ recent: [] }));
  await settled();
  assert.equal(empty.querySelector(".gallery-recent-line").textContent, "还没有文档", "none: its empty line");
}

// stats: four cells, each over a small picture of itself, a dash each where nothing can be read, a big count short.
{
  const stats = loadBlock("stats", ["countOf", "cellsOf", "trendOf", "wordsOf", "squares"], { document: page() });
  assert.deepEqual([stats.countOf(12345, "zh"), stats.countOf(123456, "zh"), stats.countOf(123456, "en"), stats.countOf(0, "en")], ["12,345", "12.3万", "123.5K", "0"]);
  assert.deepEqual([stats.wordsOf(176, "zh"), stats.wordsOf(124380, "zh"), stats.wordsOf(124380, "en")], [{ value: "176", unit: "字" }, { value: "12.4", unit: "万字" }, { value: "124.4K", unit: "" }], "the words: 万字 from ten thousand");
  // A Wednesday: this week Monday to Wednesday, the week before its Monday to Wednesday too.
  const today = new Date(2026, 10, 11, 10);
  const record = [["2026-11-02", 4, 100], ["2026-11-03", 6, 50], ["2026-11-04", 10, 0], ["2026-11-05", 99, 0], ["2026-11-09", 8, 300], ["2026-11-10", 0, 0], ["2026-11-11", 15, 200]].map(([date, edits, words]) => ({ date, edits, words }));
  const trend = stats.trendOf(record, 1000, today);
  assert.deepEqual([trend.week, trend.edits, trend.last, trend.delta], [[8, 0, 15, null, null, null, null], 23, 20, 15], "this week's edits a day (the days to come none), against the same days of the week before: +15%");
  assert.deepEqual([trend.curve.length, trend.curve.at(-1), trend.curve.at(-2), trend.curve.at(-3), trend.added], [30, 1000, 800, 800, 650], "the words in all at the end of each of the last 30 days, and what they added");
  // The record counts each edit's change and a deleted document takes none of its words out of it: its days add up to more than there are.
  const over = stats.trendOf(record, 400, today);
  assert.deepEqual([over.added, Math.min(...over.curve), over.curve.at(-1)], [400, 0, 400], "never more added than the words there are, and no day below none");
  const gone = stats.trendOf(record, 0, today);
  assert.deepEqual([gone.added, gone.curve.every((value) => value === 0)], [0, true], "a workspace emptied: +0 and a flat line, whatever its record says");
  // The documents' squares: rows as even as they can be, none left alone on a row of its own.
  const rows = (count, columns) => {
    const squaresOf = [...stats.squares(count, 0, { columns, side: 6, gap: 2 }).matchAll(/<rect x="(\d+)" y="(\d+)"/g)].map(([, , y]) => Number(y));
    return [...new Set(squaresOf)].map((y) => squaresOf.filter((at) => at === y).length);
  };
  assert.deepEqual([rows(12, 11), rows(23, 11), rows(33, 11), rows(9, 8), rows(11, 11), rows(40, 11)], [[6, 6], [8, 8, 7], [11, 11, 11], [5, 4], [11], [11, 11, 11]], "12 in two rows of 6, 23 in 8, 8 and 7; three rows at the most");
  assert.deepEqual(stats.cellsOf({ documents: 5, todos: { done: 4, total: 10 }, words: 176, editedThisWeek: 4 }, trend, "zh").map(({ label, value, unit, of, caption }) => [label, value, unit, of, caption.join("")]),
    [["文档", "5", "篇", "", "4 篇本周改过"], ["总字数", "176", "字", "", "近 30 天 +650"], ["待办完成", "4", "", "/ 10", "40% · 还剩 6 项"], ["本周编辑", "23", "次", "", "比上周同期 +15%"]], "its four cells: documents, words, to-dos done, edits this week");
  assert.deepEqual(stats.cellsOf(null, null, "zh").map(({ value }) => value), ["—", "—", "—", "—"], "none read: a dash each");
  const document = page();
  const host = document.createElement("div");
  document.body.append(host);
  const context = workspaceContext({ stats: { documents: 0, todos: { done: 0, total: 0 }, words: 0, editedThisWeek: 0 }, activity: [] });
  const handle = stats.def.mount(host, context);
  await settled();
  assert.deepEqual([...host.querySelectorAll(".gallery-stats-number")].map((node) => node.textContent), ["0", "0", "0", "0"], "an empty workspace: each 0");
  assert.deepEqual([...host.querySelectorAll(".gallery-stats-caption")].map((node) => node.textContent), ["新建一篇就从这里开始", "近 30 天 +0", "还没有待办", "这周还没动过"], "and what each waits for");
  assert.deepEqual(context.asked.map(([kind]) => kind).sort(), ["activity", "stats"], "the numbers and the record of edits");
  handle.update("clock", "minute");
  handle.update("clock", "day");
  handle.update("data", "stats");
  handle.update("data", "activity");
  await settled();
  assert.equal(context.asked.length, 8, "read again as a day begins and when its numbers or the record changed, never each minute");
  // The week's caption where documents were edited this week and the record of edits has none of it: a record just begun, not "nothing done" beside 篇本周改过.
  const edited = { documents: 5, todos: { done: 0, total: 0 }, words: 0, editedThisWeek: 4 };
  assert.deepEqual([stats.cellsOf(edited, null, "zh")[3].caption.join(""), stats.cellsOf(edited, null, "en")[3].caption.join(""), stats.cellsOf({ ...edited, editedThisWeek: 0 }, null, "zh")[3].caption.join("")], ["刚开始记录", "Just started", "这周还没动过"], "the week's caption: 刚开始记录 where documents were edited and the record has none yet, 这周还没动过 where none was");
  // The layout by the card's cells: four wide and under four high (the phone's flow keeps a card's height and cuts its width) is the compact two by two, so that all four numbers fit.
  const layouts = [];
  for (const [w, h] of [[8, 2], [12, 2], [4, 4], [4, 2], [4, 3], [2, 2]]) {
    const sized = document.createElement("div");
    document.body.append(sized);
    stats.def.mount(sized, { ...workspaceContext({ stats: edited, activity: [] }), size: { w, h } });
    await settled();
    layouts.push(sized.querySelector(".gallery-stats-face").dataset.layout);
  }
  assert.deepEqual(layouts, ["row", "wide", "square", "compact", "compact", "compact"], "row 8 × 2, wide 12 × 2, square 4 × 4, compact where it is four wide or less and under four high");
}

// heatmap: the layout by the card's cells, the squares that fit, the weeks ending today (Monday
// first), the level of a day among the days recorded, the figures beside the squares.
{
  const heatmap = loadBlock("heatmap", ["layoutOf", "fitOf", "weeksOf", "levelsOf", "levelOf", "summaryOf"], { document: page() });
  assert.deepEqual([null, { w: 8, h: 4 }, { w: 12, h: 4 }, { w: 4, h: 4 }, { w: 12, h: 3 }, { w: 8, h: 3 }, { w: 8, h: 2 }, { w: 4, h: 2 }].map(heatmap.layoutOf), ["full", "full", "full", "compact", "strip", "strip", "grid", "grid"], "four high and wide: the figures beside; four wide: a line over; three high: a strip; two (8 x 2): the squares alone");
  assert.deepEqual(heatmap.fitOf("full", 412, Infinity), { pitch: 27, cell: 23, gap: 4, weeks: 14 }, "an 8 x 4 card: 14 weeks of 23px squares 4px apart");
  assert.deepEqual(heatmap.fitOf("full", 732, Infinity).weeks, 26, "a 12 x 4 card: 26 weeks");
  assert.deepEqual(heatmap.fitOf("compact", 272, Infinity), { pitch: 25, cell: 21, gap: 4, weeks: 10 }, "a 4 x 4 card: 10 weeks of 21px");
  assert.deepEqual(heatmap.fitOf("strip", 912, 138), { pitch: 17, cell: 14, gap: 3, weeks: 52 }, "a 12 x 3 card: a year of 14px");
  assert.deepEqual(heatmap.fitOf("strip", 592, 60), { pitch: 6, cell: 4, gap: 2, weeks: 53 }, "a lower one: smaller squares, 2px apart, 4px at the least");
  const today = new Date(2026, 10, 11, 10); // a Wednesday
  const weeks = heatmap.weeksOf(today, 2);
  assert.deepEqual(weeks.map((column) => column.map(({ day }) => day)), [["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"], ["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"]], "a column a week, Monday first, the last today's");
  assert.deepEqual(weeks[1].map(({ future }) => future), [false, false, false, true, true, true, true], "the days after today are not drawn");
  const levels = heatmap.levelsOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 0, -3]);
  assert.deepEqual(levels, [4, 7, 10], "the bounds of the shades: the values at 38%, 68% and 90% of the days with any");
  assert.deepEqual([0, 1, 4, 5, 7, 8, 10, 30, -3].map((value) => heatmap.levelOf(value, levels)), [0, 1, 1, 2, 2, 3, 3, 4, 0], "a day's shade among them, none for none (or a day that took more away)");
  assert.deepEqual(heatmap.levelsOf([0, 4, 8]), [2, 4, 6], "fewer than five days with any: by the most");
  const record = [["2026-11-09", 0, 0, 0], ["2026-11-10", 5, 1200, 2], ["2026-11-11", 3, -40, 1]].map(([date, edits, words, agent]) => ({ date, edits, words, reader: { edits: edits - agent, words: 0 }, agent: { edits: agent, words: 0 } }));
  const summary = heatmap.summaryOf(record, false, 14, today);
  assert.deepEqual([summary.since, summary.total, summary.active, summary.run, summary.today, summary.you, summary.agent, summary.fresh, Math.round(summary.average * 100) / 100], ["2026-11-09", 8, 2, 2, 3, 5, 3, true, 2.67], "the figures: the edits, the days with any and the longest run of them, today's, the reader's and the Agent's; a record begun this week");
  assert.deepEqual([...heatmap.summaryOf(record, true, 14, today).values], [["2026-11-09", 0], ["2026-11-10", 1200], ["2026-11-11", 0]], "by words: a day that took words away drawn as none");
  const document = page();
  const host = document.createElement("div");
  document.body.append(host);
  const context = workspaceContext({ activity: [{ date: "2026-11-11", edits: 1, words: 5, reader: { edits: 1, words: 5 }, agent: { edits: 0, words: 0 } }] });
  const handle = heatmap.def.mount(host, context);
  await settled();
  assert.deepEqual(context.asked, [["activity", { days: 371 }]], "53 weeks of the record, as many as its widest card draws");
  assert.ok(host.querySelectorAll(".gallery-heatmap-day").length > 0 && host.querySelector(".gallery-heatmap-legend"), "its squares and its less to more");
  handle.update("data", "activity");
  handle.update("source");
  await settled();
  assert.equal(context.asked.length, 2, "read again when the record changed; its settings drawn again, nothing read");
  const export_ = page();
  const there = export_.createElement("div");
  export_.body.append(there);
  loadBlock("heatmap", [], { document: export_ }).def.mount(there, workspaceContext({ activity: offline() }));
  await settled();
  assert.equal(there.querySelector(".gallery-heatmap-overlay").textContent, "在 Gallery 里打开时显示", "an export with nothing of the record: where it shows, over empty squares");
  // A card of 53 weeks (a strip a year wide, on a Sunday: its first square 370 days back), of a record older
  // than a year: every square a day of the record, none drawn as one not recorded yet; of a record started
  // ten days ago, the days before it alone a dot.
  const clock = testClock();
  clock.now = new Date(2026, 10, 8, 10); // a Sunday
  const wide = page();
  Object.defineProperty(wide.defaultView.HTMLElement.prototype, "clientWidth", { configurable: true, get() { return this.classList.contains("gallery-heatmap-field") ? 940 : 0; } });
  Object.defineProperty(wide.defaultView.HTMLElement.prototype, "clientHeight", { configurable: true, get() { return this.classList.contains("gallery-heatmap-field") ? 160 : 0; } });
  const dayBack = (back) => {
    const date = new Date(2026, 10, 8 - back, 12);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };
  const recordOf = (kept) => Array.from({ length: kept }, (_, index) => ({ date: dayBack(kept - 1 - index), edits: 1, words: 3, reader: { edits: 1, words: 3 }, agent: { edits: 0, words: 0 } }));
  const drawn = async (days) => {
    const card = wide.createElement("div");
    wide.body.append(card);
    const asked = [];
    loadBlock("heatmap", [], { document: wide, Date: clock.Date }).def.mount(card, {
      signal: new AbortController().signal, readJSON: () => ({}), fail: (error) => { throw error; }, size: { w: 12, h: 3 }, listen: (target, type, run, options) => target.addEventListener(type, run, options),
      workspace: { query: (kind, { days: count }) => (asked.push(count), Promise.resolve({ data: days.slice(-count), at: "2026-11-08T02:00:00.000Z" })), open() {} },
    });
    await settled();
    const squares = [...card.querySelectorAll(".gallery-heatmap-day:not(.gallery-heatmap-future)")];
    return { asked, squares: squares.length, before: squares.filter((square) => square.classList.contains("gallery-heatmap-before")).length, first: squares[0]?.getAttribute("aria-label") };
  };
  const older = await drawn(recordOf(500).slice(-371));
  assert.deepEqual([older.squares, older.before], [371, 0], `53 weeks drawn, each a day of the record (it asked for ${older.asked[0]}), none "not recorded yet"`);
  assert.equal(older.first, "11月3日 周一 · 1 次编辑（你 1 次 · Agent 0 次）", "its first square, a Monday 370 days back, a day of the record, said as its tip says it");
  const recent = await drawn(recordOf(11));
  assert.deepEqual([recent.squares, recent.before], [371, 360], "a record begun ten days ago: the days before it drawn apart");
}

// ---------- the views of a table (kanban, metric, chart-view) ----------

// A table of jsdom's read as context.table() reads one: its header's words and a row object a row, its
// values numbers where a cell writes one (as cellValue reads them), its links to documents; a row object
// kept while its cells are the same, so that a view's cards can be held to it. `asked` records each intent,
// which answers `taking`; `editable` is what canEdit() answers.
function viewOf(document, header, body, { editable = true, taking = true } = {}) {
  const table = document.createElement("table");
  table.innerHTML = `<thead><tr>${header.map((name) => `<th>${name}</th>`).join("")}</tr></thead><tbody>${body.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>`;
  document.body.append(table);
  const kept = new Map();
  const asked = [];
  const valueOf = (text) => {
    const plain = text.replace(/[\s,，]/g, "");
    return text.trim() === "" ? null : /^-?\d+(?:\.\d+)?$/.test(plain) ? Number(plain) : text.replace(/\s+/g, " ").trim();
  };
  const read = () => [...table.tBodies[0].rows].map((el) => {
    const sign = el.innerHTML;
    if (kept.get(el)?.sign === sign) return kept.get(el).row;
    const values = Object.fromEntries(header.map((name, at) => [name, valueOf(el.cells[at]?.textContent ?? "")]));
    const links = [...el.querySelectorAll("a[href]")].flatMap((link) => {
      const match = /^\.\.\/([a-z0-9-]+)\/doc\.html(?:#(.+))?$/.exec(link.getAttribute("href"));
      return match ? [{ slug: match[1], title: link.textContent.trim(), block: match[2] ?? null }] : [];
    });
    const row = Object.freeze({ el, values: Object.freeze(values), links: Object.freeze(links) });
    kept.set(el, { sign, row });
    return row;
  });
  const view = () => {
    const rows = read();
    const ask = (op, detail) => (asked.push({ op, ...detail }), taking);
    return {
      columns: [...header],
      rows,
      canEdit: () => editable,
      // One row, or several (as one write), and what it carries of the view's own parts (`also`, kept as given).
      set: (row, column, text, also) => ask("set", { row: Array.isArray(row) ? row.map((each) => each.values[header[0]]) : row.values[header[0]], column, text, ...(also ? { also } : {}) }),
      add: (values, at = {}) => ask("add", { values, after: at.after ? at.after.values[header[0]] : null }),
      move: (row, to = {}) => ask("move", { row: row.values[header[0]], before: to.before?.values[header[0]] ?? null, after: to.after?.values[header[0]] ?? null, values: to.values ?? null }),
      remove: (row) => ask("remove", { row: row.values[header[0]] }),
      subscribe: () => () => {},
    };
  };
  return { table, view, asked };
}

// A context of the test's for a view on `host`: its settings, its table, and what it opened and wrote.
function viewContext(host, { settings = {}, table, place = "document", editable = true }) {
  const opened = [];
  const written = [];
  let held = settings;
  const context = {
    host, signal: new host.ownerDocument.defaultView.AbortController().signal, place, frame: (draw) => draw(), fail: (error) => { throw error; },
    canEdit: () => editable,
    readJSON: () => held,
    editJSON: (part, change) => {
      const draft = structuredClone(held);
      held = change(draft) ?? draft;
      written.push([part, held]);
      return true;
    },
    table: () => table?.() ?? null,
    workspace: { open: (target) => opened.push(target), query: () => Promise.reject(new Error("none")) },
  };
  return { context, opened, written };
}

const viewGlobals = (document) => {
  const w = document.defaultView;
  return { HTMLElement: w.HTMLElement, HTMLAnchorElement: w.HTMLAnchorElement, HTMLSelectElement: w.HTMLSelectElement, HTMLInputElement: w.HTMLInputElement, Element: w.Element, Option: w.Option };
};
const noInput = () => ({ set() {}, value: "" });
const noDrag = () => ({ cancel() {}, dragging: false });

// kanban: grouped by the column that reads as a status, or as its settings say, the groups its order
// lists first (an empty one too), the empty value last; a card its row's first cell and the other cells'
// words; each card kept while its row is the same object, the one typed in alone made again; a group's +
// adds a row after the group's last, its cell of the group set; a link to a document a chip that opens it;
// its words typed in where they stand (DocKit.text): a card's title or the words under it their cell, one
// holding a link none, a group's name each cell of its rows with its place in the order, empty nothing.
{
  const document = page();
  const kanban = loadBlock("kanban", ["groupColumnOf", "askedOf"], { document, input: noInput, drag: noDrag, globals: viewGlobals(document) });
  const columnsOf = (header, body) => kanban.groupColumnOf(viewOf(document, header, body).view());
  assert.equal(columnsOf(["任务", "负责人", "状态"], [["a", "小王", "待办"], ["b", "小李", "待办"]]), "状态", "a column named as a status");
  assert.equal(columnsOf(["客户", "金额", "区域", "联系人"], [["a", "12", "华东", "甲"], ["b", "8", "华东", "乙"], ["c", "3", "华北", "丙"]]), "区域", "else the column of words whose values repeat most, numbers left out");
  assert.equal(columnsOf(["名称"], [["a"]]), "名称", "a table of one column: that one");
  assert.deepEqual(kanban.askedOf({ group: " 阶段 ", order: "待办，进行中、已完成" }), { group: "阶段", order: ["待办", "进行中", "已完成"] }, "its settings: the order by any comma");
  assert.deepEqual(kanban.askedOf(null), { group: "", order: [] }, "none: the defaults");

  const host = document.createElement("div");
  host.setAttribute("data-doc-component", "gallery/kanban");
  host.setAttribute("data-doc-from", "t1");
  document.body.append(host);
  const bench = viewOf(document, ["任务", "状态", "负责人"], [["<a href=\"../plan/doc.html\">写方案</a>", "待办", "小王"], ["做评审", "进行中", "小李"], ["发布", "", ""], ["整理", "待办", ""]]);
  const { context, opened } = viewContext(host, { settings: { order: "待办,进行中,已完成" }, table: bench.view });
  const handle = kanban.def.mount(host, context);
  const look = () => [...host.querySelectorAll(".gallery-kanban-group")].map((group) => [group.querySelector(".gallery-kanban-name").textContent || group.querySelector(".gallery-kanban-name").getAttribute("data-doc-text-empty"), ...[...group.querySelectorAll(".gallery-kanban-card")].map((card) => [card.querySelector(".gallery-kanban-title").textContent, ...[...card.querySelectorAll(".gallery-kanban-prop")].map((prop) => prop.textContent)].join("/"))]);
  assert.deepEqual(look(), [["待办", "写方案/小王", "整理"], ["进行中", "做评审/小李"], ["已完成"], ["（空）", "发布"]], "its groups: the order's (已完成 empty), then the empty value; a card its title and its other cells, the grouping column left out");
  assert.equal(host.querySelector(".gallery-kanban-caption").textContent, "按“状态”分组 · 4 张卡片");
  assert.ok(host.querySelector(".gallery-kanban-groups").hasAttribute("data-writes") && host.querySelector(".gallery-kanban-line").hidden, "it writes, nothing to say");
  const cardsBefore = [...host.querySelectorAll(".gallery-kanban-card")];
  const titleBefore = cardsBefore[2].querySelector(".gallery-kanban-title");
  bench.table.tBodies[0].rows[1].cells[0].textContent = "做评审了";
  handle.update("data", "table");
  const cardsAfter = [...host.querySelectorAll(".gallery-kanban-card")];
  assert.deepEqual([cardsAfter.map((card, at) => card === cardsBefore[at]), cardsAfter[2].querySelector(".gallery-kanban-title") === titleBefore, titleBefore.textContent], [[true, true, true, true], true, "做评审了"], "a cell typed in: no card made again, that one's words drawn in place, the rest untouched");
  // A link to a document: a chip that opens it (its words its title's: 打开).
  const chip = host.querySelector(".gallery-kanban-link");
  assert.deepEqual([chip.dataset.page, chip.textContent], ["plan", "打开"]);
  chip.dispatchEvent(new document.defaultView.MouseEvent("click", { bubbles: true, cancelable: true }));
  assert.deepEqual(opened, [{ slug: "plan", block: null }], "a document's chip opens it through the workspace");
  // 新建 in 已完成, with no card: a row at the end, its title empty and its status 已完成; in 待办, after its last.
  host.querySelector('.gallery-kanban-group[data-value="已完成"] .gallery-kanban-add').click();
  host.querySelector('.gallery-kanban-group[data-value="待办"] .gallery-kanban-add').click();
  host.querySelector('.gallery-kanban-group[data-value="待办"] .gallery-kanban-card .gallery-kanban-remove').click();
  assert.deepEqual(bench.asked, [
    { op: "add", values: { 任务: "", 状态: "已完成" }, after: null },
    { op: "add", values: { 任务: "", 状态: "待办" }, after: "整理" },
    { op: "remove", row: "写方案" },
  ], "a group's + and 🗑 each one intent");
  // Its words typed in where they stand: a title holding words alone, the words under a title, a group's name.
  const typable = (node) => node.getAttribute("contenteditable") === "plaintext-only" && node.hasAttribute("data-doc-text");
  const titles = Object.fromEntries([...host.querySelectorAll(".gallery-kanban-title")].map((node) => [node.textContent, node]));
  assert.ok(typable(titles["整理"]) && typable(titles["做评审了"]) && !typable(titles["写方案"]), "a card's title typed in where it stands, but one holding a link (the table has it)");
  assert.ok([...host.querySelectorAll(".gallery-kanban-prop, .gallery-kanban-name")].every(typable), "the words under a title and each group's name too");
  // Words left (a blur), done once what took the focus has run (a microtask), as they are in a page.
  const typeOver = async (node, words) => {
    node.textContent = words;
    node.dispatchEvent(new document.defaultView.FocusEvent("blur"));
    await Promise.resolve();
  };
  bench.asked.length = 0;
  await typeOver(titles["整理"], "  整理  文档 ");
  await typeOver(host.querySelector('.gallery-kanban-card .gallery-kanban-prop'), "小张");
  assert.deepEqual(bench.asked, [{ op: "set", row: "整理", column: "任务", text: "整理 文档" }, { op: "set", row: "写方案", column: "负责人", text: "小张" }], "a title typed: its first cell, its white space one space; the words under it: theirs");
  bench.asked.length = 0;
  await typeOver(host.querySelector('.gallery-kanban-group[data-value="待办"] .gallery-kanban-name'), "计划");
  const [renamed] = bench.asked;
  assert.deepEqual([renamed.op, renamed.row, renamed.column, renamed.text, renamed.also.editJSON[0]], ["set", ["写方案", "整理"], "状态", "计划", "settings"], "a group's name: each cell of its rows, one write carrying its settings");
  assert.deepEqual(renamed.also.editJSON[1]({ order: "待办,进行中,已完成" }), { order: "计划,进行中,已完成" }, "its place in the order, renamed where it stood");
  assert.deepEqual(renamed.also.editJSON[1]({ order: "待办、进行中、计划" }), { order: "进行中、计划" }, "named as a group the order lists: the two one, written with the order's comma");
  // A name holding a comma the order splits at (、 , ，): out of the order, which can name no such group (a review of 2026-11-20).
  bench.asked.length = 0;
  await typeOver(host.querySelector('.gallery-kanban-group[data-value="待办"] .gallery-kanban-name'), "设计、评审");
  assert.deepEqual([bench.asked[0].text, bench.asked[0].also.editJSON[1]({ order: "待办,进行中,已完成" }), bench.asked[0].also.editJSON[1]({ order: "待办" })], ["设计、评审", { order: "进行中,已完成" }, {}], "a name holding the order's comma: its cells so named, the old name out of the order (an order left empty taken out)");
  bench.asked.length = 0;
  const named = host.querySelector('.gallery-kanban-group[data-value="进行中"] .gallery-kanban-name');
  await typeOver(named, " ");
  assert.deepEqual([bench.asked, named.textContent], [[], "进行中"], "a name typed empty: nothing asked, the name shown again");
  // A table the editor's tools do not manage: read-only, said so; no table: said so.
  const hostTwo = host.cloneNode(false);
  document.body.append(hostTwo);
  const readOnly = viewOf(document, ["任务", "状态"], [["a", "待办"]], { editable: false });
  kanban.def.mount(hostTwo, viewContext(hostTwo, { table: readOnly.view }).context);
  assert.ok(!hostTwo.querySelector(".gallery-kanban-groups").hasAttribute("data-writes") && hostTwo.querySelector(".gallery-kanban-line").textContent.startsWith("这张表格有表尾"), "a table it cannot change: read-only, said");
  assert.ok(hostTwo.querySelectorAll("[contenteditable]").length === 0 && hostTwo.querySelectorAll("[data-doc-text]").length > 0, "and no words of it typed in");
  const hostThree = document.createElement("div");
  document.body.append(hostThree);
  kanban.def.mount(hostThree, viewContext(hostThree, { table: null }).context);
  assert.equal(hostThree.querySelector(".gallery-kanban-line").textContent, "这个看板还没有接到表格上：在它的菜单里选“设置…”，选一张表格。", "no key: how to bind it");
}

// metric: the rows counted, a column summed or averaged (its numbers alone), over the rows of one value.
{
  const document = page();
  const metric = loadBlock("metric", ["metricOf", "askedOf", "WORDS"], { document, input: noInput, globals: viewGlobals(document) });
  const sales = viewOf(document, ["客户", "金额", "状态"], [["a", "12,800", "已成交"], ["b", "8,600", "洽谈中"], ["c", "", "已成交"], ["d", "1,000.5", "已成交"]]).view();
  const of = (settings) => {
    const said = metric.metricOf(sales, metric.askedOf(settings), metric.WORDS.zh);
    return said.line ?? [said.label, said.value, said.foot];
  };
  assert.deepEqual(of({}), ["行数", 4, null], "the rows, by default");
  assert.deepEqual(of({ op: "sum" }), ["金额合计", 22400.5, "有 1 行没有数，没算进去"], "the first column of numbers summed, an empty cell left out and said so");
  assert.deepEqual(of({ op: "average", column: "金额", unit: "元" }), ["金额平均", 22400.5 / 3, "有 1 行没有数，没算进去"]);
  assert.deepEqual(of({ where: "状态", is: "已成交" }), ["状态为“已成交”", 3, "共 4 行"], "the rows of one value");
  assert.deepEqual(of({ op: "sum", where: "状态", is: "已成交", title: "成交额" }), ["成交额", 13800.5, "有 1 行没有数，没算进去"], "its own name");
  assert.deepEqual(of({ op: "sum", where: "状态", is: "洽谈中" }), ["金额合计（状态为“洽谈中”）", 8600, null], "every row of its numbers: nothing more to say under it");
  const en = (settings) => { const said = metric.metricOf(sales, metric.askedOf(settings), metric.WORDS.en); return said.foot; };
  assert.deepEqual([en({ op: "sum" }), en({ where: "状态", is: "已成交" })], ["1 row has no number, left out", "4 rows in all"], "and in English");
  assert.equal(of({ op: "sum", column: "数量" }), "找不到列“数量”：表格的列名改过了吗？");
  const words = viewOf(document, ["任务", "状态"], [["a", "待办"]]).view();
  assert.equal(metric.metricOf(words, metric.askedOf({ op: "sum" }), metric.WORDS.zh).line, "表格里没有写数的列：合计和平均要一列数。");
  // Drawn, and drawn again as the table changes.
  const host = document.createElement("div");
  document.body.append(host);
  const bench = viewOf(document, ["客户", "金额"], [["a", "1,200"], ["b", "800"]]);
  const handle = metric.def.mount(host, viewContext(host, { settings: { op: "sum", unit: "元" }, table: bench.view }).context);
  const shown = () => [host.querySelector(".gallery-metric-label").textContent, host.querySelector(".gallery-metric-number").textContent, host.querySelector(".gallery-metric-unit").textContent];
  assert.deepEqual(shown(), ["金额合计", "2,000", "元"]);
  bench.table.tBodies[0].rows[1].cells[1].textContent = "1,800.256";
  handle.update("data", "table");
  assert.deepEqual(shown(), ["金额合计", "3,000.26", "元"], "typed in: the sum again, two decimals at most");
  // Its name and its unit typed in where they stand: each its setting; its number nobody's words.
  const typedIn = viewContext(host, { settings: { op: "sum", unit: "元" }, table: bench.view });
  host.replaceChildren();
  metric.def.mount(host, typedIn.context);
  const [label, number, unit] = [".gallery-metric-label", ".gallery-metric-number", ".gallery-metric-unit"].map((selector) => host.querySelector(selector));
  assert.ok(label.getAttribute("contenteditable") === "plaintext-only" && unit.getAttribute("contenteditable") === "plaintext-only" && !number.hasAttribute("contenteditable"), "its name and unit typed in, its number not");
  for (const [node, words] of [[label, "收入"], [unit, "万元"], [label, ""]]) {
    node.textContent = words;
    node.dispatchEvent(new document.defaultView.FocusEvent("blur"));
    await Promise.resolve();
  }
  assert.deepEqual(typedIn.written.map(([, settings]) => settings), [{ op: "sum", unit: "元", title: "收入" }, { op: "sum", unit: "万元", title: "收入" }, { op: "sum", unit: "万元" }], "each its setting, one write each; the name emptied taken out");
  assert.equal(label.textContent, "金额合计", "and the name it makes shown again");
  const exported = document.createElement("div");
  document.body.append(exported);
  metric.def.mount(exported, viewContext(exported, { settings: { op: "sum" }, table: bench.view, editable: false }).context);
  assert.equal(exported.querySelectorAll("[contenteditable]").length, 0, "where nothing is written (an export): none typed in");
}

// chart-view: by the status-like column (or one that repeats) by default, summed where there are
// numbers, else counted; a bar a row where nothing repeats; at most 50 bars.
{
  const document = page();
  const chart = loadBlock("chart-view", ["chartOf", "askedOf", "WORDS", "MAX_BARS"], { document, input: noInput, globals: viewGlobals(document) });
  const of = (header, body, settings = {}) => {
    const said = chart.chartOf(viewOf(document, header, body).view(), chart.askedOf(settings), chart.WORDS.zh);
    return said.line ?? [said.title, said.bars.map(({ label, value }) => `${label}:${value}`), said.all];
  };
  assert.deepEqual(of(["任务", "状态"], [["a", "待办"], ["b", "进行中"], ["c", "待办"], ["d", ""]]), ["各状态的行数", ["待办:2", "进行中:1", "（空）:1"], 3], "tasks: counted by status, in the order the rows say them");
  assert.deepEqual(of(["客户", "区域", "金额"], [["a", "华东", "10"], ["b", "华北", "5"], ["c", "华东", "2.5"]]), ["各区域的金额合计", ["华东:12.5", "华北:5"], 2], "sales: summed by the column that repeats");
  assert.deepEqual(of(["客户", "区域", "金额"], [["a", "华东", "10"], ["b", "华北", "5"], ["c", "华东", "2"]], { op: "average" }), ["各区域的金额平均", ["华东:6", "华北:5"], 2]);
  assert.deepEqual(of(["渠道", "本月"], [["搜索", "48"], ["社交", "27"]]), ["各渠道的本月", ["搜索:48", "社交:27"], 2], "nothing repeats: a bar a row");
  assert.deepEqual(of(["客户", "区域", "金额"], [["a", "华东", "10"]], { by: "区域", op: "count", title: "客户数" }), ["客户数", ["华东:1"], 1], "as its settings say");
  assert.equal(of(["任务", "状态"], [["a", "待办"]], { by: "阶段" }), "找不到列“阶段”：表格的列名改过了吗？");
  const many = of(["编号", "数"], Array.from({ length: 80 }, (_, at) => [`n${at}`, String(at)]));
  assert.deepEqual([many[1].length, many[2], chart.MAX_BARS], [50, 80, 50], "at most 50 bars of 80");
  // Drawn: a bar kept by its group while the table is typed in, its length written anew.
  const host = document.createElement("div");
  document.body.append(host);
  const bench = viewOf(document, ["客户", "区域", "金额"], [["a", "华东", "10"], ["b", "华北", "5"]]);
  const handle = chart.def.mount(host, viewContext(host, { settings: { by: "区域" }, table: bench.view }).context);
  const bars = () => [...host.querySelectorAll(".gallery-chart-view-row")];
  const before = bars();
  assert.deepEqual(before.map((row) => [row.querySelector(".gallery-chart-view-label").textContent, row.querySelector(".gallery-chart-view-value").textContent, row.querySelector(".gallery-chart-view-bar").style.width]), [["华东", "10", "100%"], ["华北", "5", "50%"]]);
  bench.table.tBodies[0].rows[1].cells[2].textContent = "20";
  handle.update("data", "table");
  assert.deepEqual(bars().map((row, at) => [row === before[at], row.querySelector(".gallery-chart-view-bar").style.width]), [[true, "50%"], [true, "100%"]], "typed in: the same bars, their lengths anew");
  // Its title and its bars' names typed in where they stand: the title its setting, a group's name each cell of its rows.
  const typedIn = viewContext(host, { settings: { by: "区域" }, table: bench.view });
  host.replaceChildren();
  chart.def.mount(host, typedIn.context);
  const typeOver = async (node, words) => {
    node.textContent = words;
    node.dispatchEvent(new document.defaultView.FocusEvent("blur"));
    await Promise.resolve();
  };
  assert.ok([".gallery-chart-view-title", ".gallery-chart-view-label"].every((selector) => host.querySelector(selector).getAttribute("contenteditable") === "plaintext-only") && !host.querySelector(".gallery-chart-view-value").hasAttribute("contenteditable"), "its title and its bars' names typed in, its numbers not");
  await typeOver(host.querySelector(".gallery-chart-view-title"), "区域金额");
  bench.asked.length = 0;
  await typeOver(host.querySelector(".gallery-chart-view-label"), "华南");
  assert.deepEqual([typedIn.written.at(-1)[1], bench.asked], [{ by: "区域", title: "区域金额" }, [{ op: "set", row: ["a"], column: "区域", text: "华南" }]], "the title its setting; a bar's name each cell of its group's rows");
}

// ---------- 柔光风格 (gallery-soft): Gallery 风格's page cards in a soft look, the same logic ----------

// Each of its ten is the card of Gallery 风格's of its name, so that a user may switch packs: its places, needs,
// settings and parts as that one's, its sizes its own (the default first), its version 1.0.0; its pure
// functions answer as the Gallery 风格 one's do (each kit.js copies that one's logic and draws its own face);
// and each, mounted on a context of the test's, draws, reads what the other reads and writes what it writes.
{
  const ofSoft = (name) => catalog.packages.get(`gallery-soft/${name}`);
  const fieldsOf = (block) => ({
    places: block.places,
    needs: block.needs,
    settings: block.settings.map(({ key, type, options = null, default: value = null, required = false }) => [key, type, options, value, required]),
    parts: Object.entries(block.parts).map(([part, { edit }]) => [part, edit]).sort(),
    resize: block.card.resize,
  });
  for (const name of PAGES) assert.deepEqual(fieldsOf(ofSoft(name)), fieldsOf(of(name)), `gallery-soft/${name}: its places, needs, settings and parts as gallery/${name}'s`);
  assert.deepEqual(PAGES.map((name) => [name, ofSoft(name).card.sizes]), [
    ["countdown", [[2, 2], [4, 2]]], ["habit", [[4, 2], [2, 2], [4, 4]]], ["heatmap", [[8, 4], [6, 4], [12, 4], [8, 3], [8, 2]]], ["note", [[4, 2], [2, 2], [4, 4]]], ["recent", [[4, 4], [4, 2], [4, 6]]],
    ["static", [[4, 2], [2, 2], [4, 4], [8, 2], [2, 1], [4, 1]]], ["stats", [[8, 2], [12, 2], [4, 2], [4, 4]]], ["today", [[4, 2], [2, 2]]], ["todos", [[4, 4], [4, 6], [8, 4]]], ["weather", [[4, 2], [2, 2], [4, 4]]],
  ], "柔光风格's sizes, the default first");
  assert.deepEqual([ofSoft("static").card.min, ofSoft("static").card.max, ofSoft("static").card.any], [{ w: 1, h: 1 }, { w: 12, h: 24 }, true], "the static card any whole size, as Gallery 风格's");
  for (const name of ["note", "recent"]) assert.deepEqual(["any", "min", "max"].map((key) => ofSoft(name).card[key]), ["any", "min", "max"].map((key) => of(name).card[key]), `${name}: any height from 2 to 8, as Gallery 风格's`);
  assert.ok(soft.every(({ version }) => version === "1.0.0"), "each at 1.0.0");

  // The same answers as Gallery 风格's.
  const both = (name, names) => [loadBlock(name, names, { document: page() }), loadBlock(name, names, { document: page(), pack: "gallery-soft" })];
  // Its functions `names`, which both have, called as `calls` say on each, answer alike; `extra`, its own, read back too.
  const same = (name, names, calls, extra = []) => {
    const theirs = loadBlock(name, names, { document: page() });
    const mine = loadBlock(name, [...names, ...extra], { document: page(), pack: "gallery-soft" });
    for (const [fn, ...args] of calls) assert.deepEqual(mine[fn](...args), theirs[fn](...args), `gallery-soft/${name}'s ${fn}(${JSON.stringify(args).slice(1, -1)}) as gallery/${name}'s`);
    return mine;
  };
  const dates = [new Date(2026, 10, 7, 9, 30), new Date(2026, 0, 1, 14, 0), new Date(2027, 0, 3, 23, 5), new Date(2026, 11, 28, 4, 0)];
  same("today", ["partOfDay", "faceOf", "weekOf", "weekNumberOf"], [...Array.from({ length: 24 }, (_, hour) => ["partOfDay", hour]), ...dates.flatMap((date) => [["faceOf", date, "zh"], ["faceOf", date, "en"], ["weekOf", date, "zh"], ["weekOf", date, "en"], ["weekNumberOf", date]])]);
  const at = new Date(2026, 10, 7, 23, 59);
  same("countdown", ["dateOf", "countdownOf"], [["dateOf", "2027-02-06"], ["dateOf", "2027-02-30"], ["dateOf", 3], ["countdownOf", "2027-02-06", at], ["countdownOf", "2026-11-07", at], ["countdownOf", "2026-10-31", at], ["countdownOf", "nope", at]]);
  const days = ["2026-10-30", "2026-10-31", "2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06"];
  const habit = same("habit", ["dayOf", "dayAfter", "readHabit", "streakOf", "toggled", "weekOf"], [["dayOf", at], ["dayAfter", "2026-12-31", 1], ["dayAfter", "2024-03-01", -1], ["readHabit", {}], ["readHabit", { name: "读书", days }], ...["2026-11-06", "2026-11-07", "2026-11-08"].map((today) => ["streakOf", days, today]), ["toggled", days, "2026-11-07"], ["toggled", days, "2026-11-06"]], ["longestOf", "calendarOf", "weekOf"]);
  // Its week is its face's own (柔光风格's from Sunday, Gallery 风格's from Monday with the streak's days marked): what the two share is the data and the streak.
  assert.deepEqual([habit.longestOf(days), habit.longestOf([]), habit.longestOf(["2026-12-31", "2027-01-01", "2026-12-30", "2026-12-31"])], [5, 0, 3], "the longest run of days in a row (the 4 × 4 card's 最长), across a year's end, each day once");
  const month = habit.calendarOf(days, "2026-11-07");
  assert.deepEqual([month.length, month[0].day, month.at(-1).day, month.filter(({ done }) => done).length, month.find(({ today }) => today)?.day, month.filter(({ future }) => future).map(({ day }) => day)], [28, "2026-10-12", "2026-11-08", 7, "2026-11-07", ["2026-11-08"]], "the last four weeks, Monday first, to the end of today's week");
  same("note", ["textOf"], [["textOf", {}], ["textOf", { text: "a\nb" }]]);
  const place = { name: "上海", latitude: 31.22222, longitude: 121.45806, region: "上海市" };
  const weather = same("weather", ["skyOf", "searchAddress", "forecastAddress", "placeOf", "degrees"], [...[0, 1, 2, 3, 45, 61, 65, 73, 80, 95, 99, 42].flatMap((code) => [["skyOf", code], ["skyOf", code, false]]), ["searchAddress", "上海 浦东", "zh"], ["placeOf", { results: [{ name: "Berlin", latitude: 52.52, longitude: 13.41, country: "Deutschland" }] }], ["placeOf", {}], ["degrees", 23.6], ["degrees", -2.4], ["degrees", null]], ["faceOf"]);
  // Each asks the forecast its face draws (Gallery 风格's six days and the wind's direction), of the same place and site.
  const asksOf = (block) => ["℃", "℉"].map((unit) => block.forecastAddress(place, unit).split("&").slice(0, 2).join("&"));
  assert.deepEqual(asksOf(weather), asksOf(loadBlock("weather", ["forecastAddress"], { document: page() })), "gallery-soft/weather asks Open-Meteo for the same place as gallery/weather");
  const forecast = { current: { temperature_2m: 16.2, apparent_temperature: 15.1, relative_humidity_2m: 72, wind_speed_10m: 11.4, weather_code: 2, is_day: 1 }, daily: { time: ["2026-11-08", "2026-11-09"], weather_code: [2, 61], temperature_2m_max: [19, 17], temperature_2m_min: [12, 13] } };
  const { now } = weather.faceOf({ kind: "weather", city: "上海", place, forecast, at: new Date(2026, 10, 8, 14, 5).toISOString() }, "zh");
  assert.deepEqual([now.temperature, now.sky, now.low, now.high, now.feels, now.humidity, now.wind, now.value], ["16°", "多云", "12°", "19°", "体感 15°", "湿度 72%", "风 11 km/h", 16.2], "now: its lowest and highest apart, each piece of the more line apart");
  const todosData = [
    { ref: { slug: "plan", block: "aaaaaaaa", text: "写周报", path: ["本周"], nth: 0 }, text: "写周报", done: false, slug: "plan", title: "计划", path: ["本周"] },
    { ref: { slug: "plan", block: null, text: "开会", path: [], nth: 0 }, text: "开会", done: true, slug: "plan", title: "计划", path: [] },
    { ref: { slug: "notes", block: null, text: "买牛奶", path: [], nth: 0 }, text: "买牛奶", done: false, slug: "notes", title: "笔记", path: [] },
  ];
  const [theirTodos, myTodos] = both("todos", ["askedOf", "groupsOf", "emptyLine"]);
  for (const asked of [{}, { document: "plan", done: true }, null, { document: "" }]) assert.deepEqual(myTodos.askedOf(asked), theirTodos.askedOf(asked));
  for (const [asked, kept] of [[{ document: null, done: false }, new Set()], [{ document: null, done: true }, new Set()], [{ document: null, done: false }, new Set([JSON.stringify(["plan", [], "开会"])])], [{ document: "notes", done: false }, new Set()]]) {
    const { documents, ...shown } = myTodos.groupsOf(todosData, asked, kept);
    // Gallery 风格's groups carry their document's icon and how many documents there are, which its face draws.
    const { documents: _, ...theirs } = theirTodos.groupsOf(todosData, asked, kept);
    assert.deepEqual(shown, { ...theirs, groups: theirs.groups.map(({ icon, ...group }) => group) }, "the to-dos grouped as Gallery 风格's groups them");
    assert.equal(documents, new Set(todosData.filter((todo) => asked.document === null || todo.slug === asked.document).map((todo) => todo.slug)).size, "and in how many documents (all done: 分在 N 篇文档里)");
  }
  for (const shown of [{ groups: [], all: 0 }, { groups: [], all: 2 }, { groups: [{}], all: 1 }]) for (const asked of [{ document: null }, { document: "plan" }]) assert.equal(myTodos.emptyLine(shown, asked, "zh"), theirTodos.emptyLine(shown, asked, "zh"));
  const clockNow = new Date(2026, 10, 7, 15, 0);
  const recent = same("recent", ["whenOf", "iconKindOf"], [...["2026-11-07T14:59:40", "2026-11-07T14:20:00", "2026-11-07T09:00:00", "2026-11-06T22:00:00", "2026-11-04T10:00:00", "2026-10-01T10:00:00", "2025-10-01T10:00:00"].flatMap((edited) => [["whenOf", new Date(edited).toISOString(), clockNow, "zh"], ["whenOf", new Date(edited).toISOString(), clockNow, "en"]]), ["iconKindOf", "/icons/star"], ["iconKindOf", "assets/a.png"], ["iconKindOf", "📋"], ["iconKindOf", null]].filter(([fn, edited]) => fn !== "whenOf" || Date.parse(clockNow) - Date.parse(edited) < 3600_000), ["sectionOf"]);
  // Its time words past the hour are its face's own (柔光风格's 6 小时前, 昨天, 3 天前; Gallery 风格's the hour, its group's 周三): within the hour both say 刚刚 and N 分钟前.
  assert.deepEqual(["2026-11-07T08:00:00", "2026-11-06T20:00:00", "2026-11-03T10:00:00", "2026-11-01T10:00:00"].map((edited) => recent.sectionOf(new Date(edited).toISOString(), clockNow)), ["today", "yesterday", "week", "earlier"], "a tall card's labels: today, yesterday, this week (since Monday), earlier");
  const stats = same("stats", ["countOf"], [12345, 123456, 0, 99999].flatMap((value) => [["countOf", value, "zh"], ["countOf", value, "en"]]), ["wordsOf", "trendOf", "percentDone"]);
  // The share done as every soft card says it, one rule in the to-dos' ring and the stats' bar (18 of 27 had been 66% in one, 67% in the other).
  const shares = [[18, 27], [26, 27], [199, 200], [1, 300], [1, 2], [0, 27], [27, 27], [0, 0]];
  const ring = loadBlock("todos", ["percentDone"], { document: page(), pack: "gallery-soft" }).percentDone;
  assert.deepEqual([shares.map(([done, all]) => ring(done, all)), shares.map(([done, all]) => stats.percentDone(done, all))], [[67, 96, 99, 1, 50, 0, 100, 0], [67, 96, 99, 1, 50, 0, 100, 0]], "rounded, 100 only when all are done and 0 only when none is, the same in both");
  assert.deepEqual([stats.wordsOf(8420, "zh"), stats.wordsOf(126480, "zh"), stats.wordsOf(130000, "zh"), stats.wordsOf(126480, "en")], [{ value: "8,420", unit: "字" }, { value: "12.6", unit: "万字" }, { value: "13", unit: "万字" }, { value: "126.5K", unit: "words" }], "the words: grouped under 10,000, in 万 past it, short in English");
  const record = [{ date: "2026-11-02", edits: 3, words: 100 }, { date: "2026-11-03", edits: 0, words: 0 }, { date: "2026-11-04", edits: 5, words: -20 }, { date: "2026-10-31", edits: 2, words: 50 }];
  assert.deepEqual(stats.trendOf(record, 1000, new Date(2026, 10, 4, 15)), { climb: [920, 1020, 1020, 1000], added: 80, week: [3, 0, 5, null, null, null, null] }, "the words held at each day's end (the words now less what later days added), this week's added and its edits by day, the days to come none");
  same("heatmap", ["weeksOf"], [["weeksOf", new Date(2026, 10, 7, 12), 3], ["weeksOf", new Date(2026, 10, 9, 12), 2]]);
  const square = loadBlock("heatmap", ["fitOf", "levelsOf", "levelOf", "figuresOf"], { document: page(), pack: "gallery-soft" });
  assert.deepEqual([square.fitOf(670, 194, 8), square.fitOf(483, 180, 6).cell, square.fitOf(670, 120, 12).cell, square.fitOf(10, 194, 8).weeks], [{ cell: 22, gap: 5, weeks: 25, pitch: 27 }, 20, 12, 1], "squares of 22px (20 on a narrow card), as many weeks as fit, smaller only where the height is short");
  const levels = square.levelsOf([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.deepEqual([levels, [0, 1, 4, 7, 10, 11].map((value) => square.levelOf(value, levels))], [[4, 7, 10], [0, 1, 1, 2, 3, 4]], "a day's level by where it stands among the days of any edit");
  const recorded = [{ date: "2026-11-05", edits: 4, words: 120, reader: { edits: 1, words: 30 }, agent: { edits: 3, words: 90 } }, { date: "2026-11-06", edits: 0, words: 0, reader: { edits: 0, words: 0 }, agent: { edits: 0, words: 0 } }, { date: "2026-11-07", edits: 6, words: -10, reader: { edits: 3, words: 0 }, agent: { edits: 3, words: -10 } }];
  const figures = square.figuresOf(recorded, false, "2026-10-19", "2026-11-07", 3, "zh");
  assert.deepEqual([figures.label, figures.total, figures.active, figures.recorded, figures.today, figures.average, figures.most, figures.share, figures.since, figures.empty], ["11月5日以来编辑", 10, 2, 3, 6, 3, { date: "2026-11-07", value: 6 }, 40, "2026-11-05", false], "the figures of the days drawn: since the record began, the reader's share of the edits");
  assert.deepEqual([square.figuresOf(recorded, true, "2026-11-05", "2026-11-07", 1, "zh").total, square.figuresOf([], false, "2026-10-19", "2026-11-07", 3, "zh").empty], [120, true], "by words, a day that took more away none; no record, nothing counted");

  // Each mounted: what it reads, what it draws, what it writes.
  const document = page();
  const mountIn = (name, context, extra = {}) => {
    const host = document.createElement("div");
    host.setAttribute("data-doc-component", `gallery-soft/${name}`);
    document.body.append(host);
    const block = loadBlock(name, [], { document, pack: "gallery-soft", ...extra });
    return { host, handle: block.def.mount(host, { size: null, listen: () => {}, timeout: () => 0, interval: () => 0, ...context }), def: block.def };
  };
  const today = mountIn("today", { size: { w: 2, h: 2, width: 106, height: 106 } });
  assert.deepEqual([today.host.querySelector(".gallery-soft-today-face")?.dataset.w, today.host.querySelector(".gallery-soft-today-face")?.dataset.pad, today.host.querySelector(".gallery-soft-today-greeting")?.textContent.length > 0, today.def.on], ["2", "s", true, ["clock", "layout"]], "today: laid out by its card's size, its greeting drawn");
  // note and habit: their writes, one context.editJSON a gesture, the JSON on its one line.
  let noteText = '{"text":""}';
  let given = null;
  const editing = (name, read, write) => ({ signal: new document.defaultView.AbortController().signal, canEdit: () => true, readJSON: () => JSON.parse(read()), fail: (error) => { throw error; }, editJSON: (part, change) => {
    assert.equal(part, name);
    const data = JSON.parse(read());
    const result = change(data);
    write(jsonIn(read(), result === undefined ? data : result));
    return true;
  } });
  const note = mountIn("note", editing("note", () => noteText, (text) => { noteText = text; }), { input: (field, { commit }) => { given = { field, commit }; return { set(value) { field.value = value; } }; } });
  assert.ok(note.host.querySelector("textarea.gallery-soft-note-field") === given?.field, "note: its field, DocKit.input's");
  given.commit("第一行\n第二行");
  assert.equal(noteText, '{"text":"第一行\\n第二行"}', "note: one write, on its one line");
  let habitText = '{"name":"读书","days":[]}';
  const habitBlock = mountIn("habit", editing("habit", () => habitText, (text) => { habitText = text; }), { input: () => ({ set() {} }) });
  const todayDay = habit.dayOf(new Date());
  habitBlock.host.querySelector(".gallery-soft-habit-today-press").click();
  assert.deepEqual(JSON.parse(habitText).days, [todayDay], "habit: today's dot pressed, today checked in");
  habitBlock.handle.update("source");
  habitBlock.host.querySelector(".gallery-soft-habit-check").click();
  assert.deepEqual(JSON.parse(habitText).days, [], "and its button pressed, taken back");
  const countdown = mountIn("countdown", { readJSON: () => ({ title: "春节", date: habit.dayAfter(todayDay, 3) }), fail: (error) => { throw error; } });
  assert.ok(/还有\s*3\s*天/.test(countdown.host.querySelector(".gallery-soft-countdown-count").textContent) && countdown.host.querySelector(".gallery-soft-countdown-name").textContent === "春节", "countdown: the days to its date");
  assert.equal(mountIn("countdown", { readJSON: () => ({}), fail: (error) => { throw error; } }).host.querySelector(".gallery-soft-countdown-line").textContent, "还没有设日期", "with no date: its empty face");
  // weather: through a context.fetch of the test's.
  const fetched = [];
  const weatherBlock = mountIn("weather", { readJSON: () => ({ city: "上海" }), fail: (error) => { throw error; }, fetch: async (url) => { fetched.push(new URL(url).host); return { data: url.includes("geocoding") ? { results: [place] } : forecast, at: new Date(2026, 10, 8, 14, 5).toISOString(), cached: false }; } });
  await settled();
  await settled();
  assert.deepEqual([weatherBlock.host.querySelector(".gallery-soft-weather-face").dataset.kind, fetched, weatherBlock.host.querySelector(".gallery-soft-weather-temperature").textContent], ["weather", ["geocoding-api.open-meteo.com", "api.open-meteo.com"], "16°"], "weather: its city looked up, then its weather, at the hosts its needs name");
  const refusedWeather = mountIn("weather", { readJSON: () => ({ city: "上海" }), fail: (error) => { throw error; }, fetch: async () => { throw Object.assign(new Error("consent"), { code: "consent" }); } });
  await settled();
  assert.equal(refusedWeather.host.querySelector(".gallery-soft-weather-face").dataset.kind, "consent", "refused for consent: it says so");
  // The workspace's four: what each asks, draws and opens.
  const checked = [];
  const todosContext = { ...workspaceContext({ todos: todosData, recent: [{ slug: "plan", title: "计划", icon: "📋", edited: "2026-11-07T10:00:00.000Z" }] }), timeout: () => 0 };
  todosContext.workspace.setTodo = async (ref, done) => { checked.push([ref.text, done]); return true; };
  const todos = mountIn("todos", todosContext);
  await settled();
  assert.deepEqual(todosContext.asked, [["todos", { limit: 1000 }], ["recent", { limit: 50 }]], "todos: the to-dos of every document, and the documents edited last for their icons");
  assert.deepEqual([[...todos.host.querySelectorAll(".gallery-soft-todos-doc")].map((node) => node.textContent), [...todos.host.querySelectorAll(".gallery-soft-todos-text")].map((node) => node.textContent), todos.host.querySelector(".gallery-soft-todos-icon > img")?.getAttribute("src") ?? null, todos.host.querySelector(".gallery-soft-todos-percent")?.textContent ?? null], [["计划", "笔记"], ["写周报", "买牛奶"], "/__gallery/edit/icon?value=%F0%9F%93%8B&slug=plan", null], "grouped by document, a group's icon its document's (an emoji as the server's picture of it, Twemoji, not the system font's; no ring on a 4 × 4 card's face but the head's)");
  todos.host.querySelector(".gallery-soft-todos-todo").click();
  // The keys stay on the box that was used: the list drawn anew puts the focus back on the box of the same to-do.
  const usedBox = todos.host.querySelector(".gallery-soft-todos-check");
  const usedBoxKey = usedBox.dataset.focusKey;
  usedBox.focus();
  assert.equal(document.activeElement, usedBox, "the soft card's first box has the focus");
  usedBox.click();
  await settled();
  assert.ok(usedBoxKey?.startsWith("check:") && document.activeElement !== usedBox && todos.host.contains(document.activeElement) && document.activeElement.dataset.focusKey === usedBoxKey, "drawn anew, the focus on the new box of the same to-do");
  assert.deepEqual([todosContext.opened, checked], [[{ slug: "plan", block: "aaaaaaaa" }], [["写周报", true]]], "a click on its words opens its document there; its box checks it in its document");
  const recentContext = workspaceContext({ recent: [{ slug: "plan", title: "计划", icon: "📋", edited: new Date().toISOString() }, { slug: "notes", title: "笔记", icon: null, edited: "2026-10-01T10:00:00.000Z" }] });
  const recentBlock = mountIn("recent", recentContext);
  await settled();
  assert.deepEqual([recentContext.asked, [...recentBlock.host.querySelectorAll(".gallery-soft-recent-name")].map((node) => node.textContent), recentBlock.host.querySelector(".gallery-soft-recent-meta").textContent], [[["recent", { limit: 20 }]], ["计划", "笔记"], "今天 1 篇"], "recent: the documents edited last, today's counted");
  recentBlock.host.querySelector(".gallery-soft-recent-document").click();
  assert.deepEqual(recentContext.opened, [{ slug: "plan" }], "a click opens it");
  const statsContext = workspaceContext({ stats: { documents: 38, todos: { done: 18, total: 27 }, words: 126480, editedThisWeek: 11 }, activity: record });
  const statsBlock = mountIn("stats", statsContext);
  await settled();
  assert.deepEqual([statsContext.asked.map(([kind]) => kind).sort(), [...statsBlock.host.querySelectorAll(".gallery-soft-stats-figure")].map((node) => node.textContent)], [["activity", "stats"], ["38篇", "12.6万字", "18/ 27", "11篇"]], "stats: the four numbers, and the record of edits for their feet");
  const offlineStats = mountIn("stats", workspaceContext({ stats: offline(), activity: offline() }));
  await settled();
  assert.ok([...offlineStats.host.querySelectorAll(".gallery-soft-stats-number")].every((node) => node.textContent === "—") && offlineStats.host.querySelector(".gallery-soft-stats-line").textContent === "在 Gallery 里打开时显示", "in an export: dashes, and a line saying why");
  const heatContext = workspaceContext({ activity: recorded });
  const heat = mountIn("heatmap", heatContext);
  await settled();
  assert.deepEqual([heatContext.asked, heat.host.querySelectorAll(".gallery-soft-heatmap-day").length > 0], [[["activity", { days: 371 }]], true], "heatmap: every day 53 weeks draw, its squares drawn");
  const offlineHeat = mountIn("heatmap", workspaceContext({ activity: offline() }));
  await settled();
  assert.equal(offlineHeat.host.querySelector(".gallery-soft-heatmap-line").textContent, "在 Gallery 里打开时显示", "in an export: its empty face says why");
}

// A workspace's copies follow Gallery (followShipped; the user, 2026-11-09: a home page made with 1.0.0's
// cards kept their plain look after 1.1.0 came): a copy as an older Gallery added it is brought up to
// Gallery's as the workspace's server starts (adoptWorkspace, the dev server's start), a file the new one
// has not taken out, its record the new version's; one changed since it was added stays as it is, the log
// saying so once and 设置 › 组件列表's row giving Gallery's newer version (`newer`). Each block and version
// once a process: a second start says nothing. Then the catalog of the server's workspace follows as it
// reads (followOnRead), and the page service's library; another workspace's catalog writes nothing.
{
  const block = (name) => shipped.find((one) => one.name === name);
  const workspaceAt = (name) => {
    const folder = path.join(root, name);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "gallery.json"), `${JSON.stringify({ gallery: "workspace", version: 1 }, null, 2)}\n`);
    return folder;
  };
  // A copy of block `name` in `at` as an older Gallery added it: version 1.0.0, `change` made to its
  // files then, and recorded as that Gallery's add recorded it.
  const older = (at, name, change = () => {}) => {
    addShipped(at, block(name));
    const folder = path.join(at, "components", "gallery", name);
    const manifest = path.join(folder, "component.json");
    fs.writeFileSync(manifest, fs.readFileSync(manifest, "utf8").replace(/"version": "[^"]*"/, '"version": "1.0.0"'));
    change(folder);
    const file = path.join(at, ".gallery", "blocks.json");
    fs.writeFileSync(file, `${JSON.stringify({ ...JSON.parse(fs.readFileSync(file, "utf8")), [`gallery/${name}`]: { version: "1.0.0", fingerprint: fingerprintOf(folder) } }, null, 2)}\n`);
    assert.ok(shippedState(at, block(name)).behind, `${name}: behind, as added`);
    return folder;
  };
  // 1.0.0's today drew no chip in its head, nor a desk calendar.
  const chipless = (folder) => {
    const kit = path.join(folder, "kit.js");
    const text = fs.readFileSync(kit, "utf8");
    assert.ok(text.includes("face.append(chip, greeting, date, number, week, big, foot);"), "today's face as 2.0.0 writes it");
    fs.writeFileSync(kit, text.replace("face.append(chip, greeting, date, number, week, big, foot);", "face.append(greeting, date, number, week);"));
    fs.writeFileSync(path.join(folder, "old.css"), "/* 1.0.0 */\n");
  };
  const studio = workspaceAt("follow");
  const today = older(studio, "today", chipless);
  const note = older(studio, "note");
  fs.appendFileSync(path.join(note, "style.css"), "/* mine */\n"); // the user's own change, after it was added
  const heard = [];
  const log = console.log;
  console.log = (line) => heard.push(String(line));
  try {
    await adoptWorkspace(studio);
  } finally {
    console.log = log;
  }
  assert.equal(fingerprintOf(today), fingerprintOf(block("today").folder), "today is Gallery's again, as the server starts");
  assert.ok(!fs.existsSync(path.join(today, "old.css")) && fs.readFileSync(path.join(today, "kit.js"), "utf8").includes("face.append(chip, greeting, date, number, week, big, foot);"), "the old one's file gone, its desk calendar back");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(studio, ".gallery", "blocks.json"), "utf8"))["gallery/today"], { version: block("today").version, fingerprint: fingerprintOf(block("today").folder) }, "recorded as the new version's add");
  assert.ok(fs.readFileSync(path.join(note, "style.css"), "utf8").endsWith("/* mine */\n") && JSON.parse(fs.readFileSync(path.join(note, "component.json"), "utf8")).version === "1.0.0", "the note, changed since it was added, kept as it is");
  assert.deepEqual([shippedNewer(studio, block("note")), shippedNewer(studio, block("today"))], [block("note").version, null], "Gallery's newer version, of the changed copy alone");
  // Checking an up-to-date version must not read the block's content just to say there is no update.
  const readFile = fs.readFileSync;
  const contentReads = [];
  fs.readFileSync = (file, ...args) => {
    if (String(file).endsWith("style.css") || String(file).endsWith("kit.js")) contentReads.push(String(file));
    return readFile(file, ...args);
  };
  try {
    assert.equal(shippedNewer(studio, block("today")), null);
    assert.deepEqual(contentReads, [], "same-version update checks do not hash component content");
  } finally {
    fs.readFileSync = readFile;
  }
  assert.deepEqual(heard.filter((line) => line.includes("gallery/")), [
    `[gallery] Gallery's own blocks in ${path.resolve(studio)}, as they were added, updated to this Gallery's: gallery/today 1.0.0 -> ${block("today").version}`,
    `[gallery] gallery/note in ${path.resolve(studio)} was changed after it was added, so it stays at 1.0.0: Gallery's is ${block("note").version} (设置 › 组件列表 says how to take it)`,
  ], "the log says each once");
  heard.length = 0;
  console.log = (line) => heard.push(String(line));
  try {
    await adoptWorkspace(studio);
  } finally {
    console.log = log;
  }
  assert.deepEqual(heard.filter((line) => line.includes("gallery/")), [], "once a process for each block and version");
  const panel = createComponentSettings({ root: studio, taken: () => {} }).read();
  assert.deepEqual(["gallery/note", "gallery/today"].map((id) => panel.packages.find((item) => item.id === id).newer), [block("note").version, null], "设置 › 组件列表: the changed one's row says Gallery's newer version");
  assert.deepEqual([versionAfter("1.10.0", "1.9.0"), versionAfter("1.1.0", "1.1.0"), versionAfter("1.0.0", "1.1.0"), versionAfter("1.1.0", null)], [true, false, false, true], "versions by their numbers");

  // The catalog of the server's workspace follows as it reads; another's writes nothing.
  const served = workspaceAt("follow-read");
  const elsewhere = workspaceAt("follow-elsewhere");
  for (const at of [served, elsewhere]) older(at, "today", chipless);
  const told = [];
  followOnRead(served, (line) => told.push(line));
  assert.equal(readCatalog(served).packages.get("gallery/today").version, block("today").version, "read as Gallery's new version");
  assert.ok(told.length === 1 && told[0].includes(`gallery/today 1.0.0 -> ${block("today").version}`), told.join("\n"));
  assert.equal(readCatalog(elsewhere).packages.get("gallery/today").version, "1.0.0", "another workspace's catalog: its server's to follow");
  assert.ok(shippedState(elsewhere, block("today")).behind, "nothing of it written");
  // The page service's library (the top bar's list of cards to add) follows its workspace too.
  const paged = workspaceAt("follow-page");
  older(paged, "note");
  const pageTold = [];
  const library = createPageService({ root: paged, edits: null, stateDirectory: path.join(paged, ".gallery", "state"), catalog: () => readCatalog(paged), log: (line) => pageTold.push(line) }).library();
  assert.ok(library.find(({ id }) => id === "gallery/note")?.installed && fingerprintOf(path.join(paged, "components", "gallery", "note")) === fingerprintOf(block("note").folder), "the library: the note updated, listed as there");
  assert.ok(pageTold.length === 1 && pageTold[0].includes("gallery/note 1.0.0 ->"), pageTold.join("\n"));
}

// 柔光风格's ten stylesheets each declare the --soft-* values they use on their instance (a block is checked and shipped
// on its own, so one may name nothing of another's): what they declare is one palette, so a value two of them declare is the
// same in both: the palette is one, written ten times, and changing one of the ten alone would split it. The static
// card's grip room is its own.
{
  const dir = path.join(PACKS, "gallery-soft");
  /** @type {Map<string, Map<string, string>>} */
  const declared = new Map();
  const sheets = fs.readdirSync(dir).filter((name) => fs.existsSync(path.join(dir, name, "style.css")));
  assert.equal(sheets.length, 10, "the ten page cards");
  for (const name of sheets) {
    const css = fs.readFileSync(path.join(dir, name, "style.css"), "utf8");
    const start = css.indexOf(`[data-doc-component="gallery-soft/${name}"] {`);
    assert.ok(start >= 0, `${name}: the rule of its instance`);
    for (const [, key, value] of css.slice(start, css.indexOf("> .gallery-soft-", start)).matchAll(/(--soft-[\w-]+):\s*([^;]+);/g)) {
      if (!declared.has(key)) declared.set(key, new Map());
      declared.get(key).set(name, value.trim());
    }
  }
  const shared = [...declared].filter(([key, byName]) => key !== "--soft-grip-room" && byName.size > 1);
  assert.ok(shared.length >= 14, `the palette the ten share: ${shared.length} values`);
  for (const [key, byName] of shared) assert.equal(new Set(byName.values()).size, 1, `${key} reads alike in every stylesheet that declares it: ${JSON.stringify(Object.fromEntries(byName))}`);
}

// gallery block check: each passes with nothing to say, in a browser where the machine has one.
if (findBrowser()) {
  const run = promisify(execFile);
  const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
  for (const { id } of shipped) {
    const { stdout = "", stderr = "", message = "" } = await run(process.execPath, [bin, "--workspace", workspace, "block", "check", id], { cwd: root, env: { ...process.env, GALLERY_DEFAULT_WORKSPACE: workspace, GALLERY_NO_PREVIEW: "1", GALLERY_NO_BROWSER: "1", GALLERY_NO_UPDATE_CHECK: "1" }, maxBuffer: 1 << 24 }).catch((error) => error);
    assert.ok(stdout.trimEnd().endsWith(`OK   ${id}`), `${id} passes gallery block check:\n${stdout}${stderr}${message}`);
    assert.ok(!/^\s*(?:note|FAIL)\b/m.test(stdout), `${id}: nothing to say:\n${stdout}`);
  }
} else console.log("shipped-blocks: no Chrome or Edge here, gallery block check of each not run");

fs.rmSync(root, { recursive: true, force: true });
console.log("shipped-blocks: ok");
