import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { MARGIN, MARGIN_STYLE, earlyMarginScript, marginLayout, outlineWidth } from "../../src/editor/page/margin.mjs";
import { ADD, HANDLE } from "../../src/editor/page/handle-sizes.mjs";

// The outline's part of the layout: its width at the window's edge, its form, what it takes of the page beside the column's rooms.
const part = ({ dock, outline, room }) => ({ dock, outline, room });
// Where the column goes: the rooms at its left and right (to the window's edge).
const place = ({ left, right }) => ({ left, right });
import { FOLDS_KEY, carryFolds, foldsOf, keepFolds } from "../../src/editor/page/outline/folds.mjs";
import { entriesOf, headingText, texReading, touchesOutline } from "../../src/editor/page/outline/read.mjs";
import { TICK, currentOf, followTop, glideFrom, keyAction, keysOf, markedRow, nodesOf, pathTo, rowsOf, signatureOf, spyLine, ticksOf, treeOf } from "../../src/editor/page/outline/tree.mjs";
import { OUTLINE_OPEN_KEY, PREFERENCES_KEY, onOutlineOpen, outlineOpen, preference, setOutlineOpen, setPreference } from "../../src/shared/preferences.mjs";
import { captureLayout, markKinds, prepareBlock } from "../../src/editor/page/core.mjs";
import { instrument } from "../../src/editor/source.mjs";

// The outline (目录, editor/page/outline/) and the right side's room (editor/page/margin.mjs), their
// pure parts: the layout numbers at the workbench's widths, the tree from the page's entries, the rows
// with folds and the row marking the current heading, the keys, the strip's lines, what is folded kept
// per report, and the page read into entries (jsdom).

// ---------- the room at the page's right ----------
{
  const at = (width, outline = true) => part(marginLayout({ width, outline }));
  // The page's width at the workbench's windows (Windows' 15px scrollbar counted; the sidebar 270, or 216 at its narrowest).
  assert.deepEqual(at(1635), { dock: 200, outline: "full", room: 192 }, "1920, sidebar open: the outline in full (its guide 8px in)");
  assert.deepEqual(at(1155), { dock: 200, outline: "full", room: 192 }, "1440, sidebar open: in full");
  assert.deepEqual(at(1049), { dock: 200, outline: "full", room: 192 }, "1280, the sidebar at its narrowest: in full");
  assert.deepEqual(at(995), { dock: 36, outline: "strip", room: 36 }, "1280, sidebar open: its strip (the list keeps its 200px, never narrower)");
  assert.deepEqual(at(1265), { dock: 200, outline: "full", room: 192 }, "1280, sidebar closed: in full");
  assert.deepEqual(at(1009), { dock: 200, outline: "full", room: 192 }, "1024, sidebar closed: in full, its rooms under the edge room");
  assert.deepEqual(at(739), { dock: 36, outline: "strip", room: 36 }, "1024, sidebar open: its strip (the column narrower)");
  // One rule: the column in the middle of what the outline leaves, as far from the window's left edge as from the outline's guide.
  for (const width of [1905, 1635, 1265, 1155, 1085, 1032, 1009, 1008, 995, 885]) {
    const { left, right, room } = marginLayout({ width, outline: true });
    assert.equal(left, right - room, `${width}: the rooms at the column's two sides the same`);
  }
  assert.deepEqual(place(marginLayout({ width: 1155, outline: true })), { left: 125.5, right: 317.5 }, "1440, sidebar open: 125.5 either side (the column 96 left of the page's middle)");
  assert.deepEqual(place(marginLayout({ width: 1032, outline: true })), { left: 64, right: 256 }, "the edge room either side");
  assert.deepEqual(place(marginLayout({ width: 1009, outline: true })), { left: 52.5, right: 244.5 }, "shorter: the rooms under the edge room, still the same, the list as wide");
  assert.equal(at(1008).outline, "full", "in full from 52 + 712 + 52 + 200 less the guide's 8");
  assert.equal(at(1007).outline, "strip");
  assert.deepEqual(place(marginLayout({ width: 885, outline: true })), { left: 68.5, right: 104.5 }, "the strip: the column in the middle of what it leaves");
  assert.deepEqual(place(marginLayout({ width: 739, outline: true })), { left: 64, right: 100 }, "the strip on a narrow page: the edge room either side, the column narrower");
  assert.deepEqual(marginLayout({ width: 1155, outline: false }), { dock: 0, outline: null, room: 0, side: 64, left: 221.5, right: 221.5, column: 712, cards: 0, cardRoom: 0, floor: 64 }, "off: no room asked, the column centered");
}

// The cards of 批注: in the margin of a page of 1150 and up, the page going left by max(0, (1500 −
// width) / 2), on our numbers: a card's room 10 + 308 + 24 = 342 (10: where a marker stands, the user's
// 2026-11-12), on what the outline leaves; a card as narrow as 180 rather than a marker.
{
  const { lane, card, cardEnd, cardLeast, start, column } = MARGIN;
  const notes = (width, more = {}) => marginLayout({ width, notes: true, ...more });
  const shift = (width) => Math.max(0, (column + 2 * (lane + card + cardEnd) - width) / 2);
  assert.equal(column + 2 * (lane + card + cardEnd), 1396, "where the column need not move");
  assert.equal(start + column + lane + card + cardEnd, 1106, "where a card has its 308");
  assert.equal(start + column + lane + cardLeast + cardEnd, 978, "where the cards fold");
  for (const width of [1905, 1635, 1500, 1396, 1300, 1155, 1110, 1106]) {
    const { cards, left } = notes(width);
    assert.equal(cards, card, `${width}: a card's whole width`);
    assert.equal(left, (width - column) / 2 - shift(width), `${width}: the column left of its middle by max(0, (1396 − width) / 2)`);
  }
  assert.equal(notes(1635).left, marginLayout({ width: 1635 }).left, "1920, sidebar open: nothing moves");
  assert.deepEqual(place(notes(1155)), { left: 101, right: 342 }, "1440, sidebar open: a card's room right of the column, the rest left of it");
  assert.deepEqual([notes(1080).cards, notes(1080).left], [282, 52], "shorter: the column at the handle's room, the card giving what is short");
  assert.deepEqual([notes(978).cards, notes(978).left], [180, 52], "down to 180");
  assert.deepEqual([notes(977).cards, notes(977).left, notes(977).cardRoom], [0, marginLayout({ width: 977 }).left, 0], "below that they fold, and the column stays in its middle");
  assert.equal(notes(995).cards, 197, "1280, sidebar open: a card of 197");
  assert.equal(notes(1081).cards, 283, "the page of a 1366 window, sidebar open: a card of 283");
  assert.equal(marginLayout({ width: 1900, notes: false }).cards, 0, "no 批注: nothing");
  // A form laid out is kept under the width it needs, as the outline's (a scrollbar a card brings).
  assert.equal(notes(964, { was: notes(1000) }).cards, 166, "kept 14px under, a little narrower");
  assert.equal(notes(962, { was: notes(1000) }).cards, 164, "and 16px under");
  assert.equal(notes(961, { was: notes(1000) }).cards, 0, "not 17px under");
  assert.equal(notes(977, { was: notes(900) }).cards, 0, "folded, they stand again only at 978");
  // Beside the outline, which they never change: on what it leaves, between the column and its guide.
  assert.deepEqual(part(notes(1425, { outline: true })), part(marginLayout({ width: 1425, outline: true })), "the outline's form, width and rooms as they are");
  assert.deepEqual([notes(1425, { outline: true }).cards, notes(1425, { outline: true }).left], [308, 179], "1440, sidebar closed, the list: a card's room left of its guide");
  assert.equal(notes(1635, { outline: true }).left, (1635 - 192 - column) / 2, "1920, sidebar open, the list: nothing moves");
  assert.equal(notes(1155, { outline: true }).cards, 0, "1440, sidebar open, the list: markers, the list as it was");
  assert.equal(notes(1155, { outline: true }).outline, "full");
  assert.equal(notes(1170, { outline: true }).cards, 180, "the list and a card of 180 from 978 + 192");
  const stripped = notes(1140, { outline: true, full: 360 });
  assert.deepEqual([stripped.outline, stripped.cards], ["strip", 306], "the strip beside them where the list does not fit");
  // Read full width, the column gives them their room at its right, while it keeps 560.
  assert.deepEqual([notes(1900, { wide: true }).cards, notes(1900, { wide: true }).left, notes(1900, { wide: true }).column, notes(1900, { wide: true }).cardRoom], [308, 64, 1900 - 64 - 342, 342], "full width: a card's room at its right");
  assert.deepEqual([notes(900, { wide: true }).cards, notes(900, { wide: true }).column], [242, 560], "narrower: the column at its 560, the card giving what is short");
  assert.deepEqual([notes(800, { wide: true }).cards, notes(800, { wide: true }).column], [0, 800 - 128], "below 180 they fold, the column as wide as ever");
  assert.equal(marginLayout({ width: 1900, wide: true }).column, 1900 - 128, "no 批注: the column as wide as ever");
}

// The outline's width: the reader's (dragged) within 160 and 360, kept whatever the page's width (the
// strip where it does not fit); dragged, each room gives or takes half.
{
  assert.equal(outlineWidth(0), 200, "none chosen: the default");
  assert.equal(outlineWidth(300), 300);
  assert.equal(outlineWidth(100), 160, "never under 160");
  assert.equal(outlineWidth(999), 360, "never over 360");
  assert.equal(outlineWidth(Number.NaN), 200);
  const wide = (width) => marginLayout({ width, outline: true, full: 300 });
  assert.deepEqual(part(wide(1155)), { dock: 300, outline: "full", room: 292 }, "300px where it fits");
  assert.deepEqual(place(wide(1155)), { left: 75.5, right: 367.5 }, "the column in the middle of what it leaves");
  assert.deepEqual([wide(1108).outline, wide(1108).dock, wide(1108).left], ["full", 300, 52], "as wide down to its own threshold (52 + 712 + 52 + 300 less 8)");
  assert.deepEqual(part(wide(1107)), { dock: 36, outline: "strip", room: 36 }, "under it the strip, never a narrower list");
  const before = marginLayout({ width: 1155, outline: true });
  const dragged = marginLayout({ width: 1155, outline: true, full: 240 });
  assert.deepEqual([before.left - dragged.left, dragged.left], [20, dragged.right - dragged.room], "40px wider: each room 20px less, still the same");
}

// A form laid out is kept 16px under the width it needs, for the same request (a scrollbar coming, a
// pixel of a resize); going up needs the whole width. A report read full width keeps 560px of column.
{
  const full = marginLayout({ width: 1200, outline: true });
  const strip = marginLayout({ width: 900, outline: true });
  assert.equal(marginLayout({ width: 1000, outline: true, was: full }).outline, "full", "in full kept 8px under 1008");
  assert.equal(marginLayout({ width: 992, outline: true, was: full }).outline, "full", "and 16px under");
  assert.deepEqual([marginLayout({ width: 992, outline: true, was: full }).dock, place(marginLayout({ width: 992, outline: true, was: full }))], [200, { left: 52, right: 244 }], "the rooms at the handle's, the list as wide, the column narrower by what is short (16px at most)");
  assert.equal(marginLayout({ width: 991, outline: true, was: full }).outline, "strip", "not 17px under");
  assert.equal(marginLayout({ width: 1007, outline: true, was: strip }).outline, "strip", "the strip goes up to the list only at 1008");
  assert.equal(marginLayout({ width: 1000, outline: true, was: { dock: 240, outline: "full" } }).outline, "full", "a layout given as its dock and form alone keeps as well");
  assert.equal(marginLayout({ width: 856, outline: true, wide: true }).outline, "full", "full width: the list beside a column of 560 (52 + 560 + 52 + 200 less 8)");
  assert.equal(marginLayout({ width: 855, outline: true, wide: true }).outline, "strip");
  assert.deepEqual(place(marginLayout({ width: 1200, outline: true, wide: true })), { left: 64, right: 256 }, "full width: the edge room at both sides of the column, the outline's room beside it");
  assert.equal(2 * MARGIN.start + MARGIN.column + MARGIN.full - MARGIN.guide, 1008, "the threshold of the default width");
}

// Collapsed by the reader (a click on its guide: the preference outlineCollapsed): its strip wherever
// the room would give the list, the column in the middle of what the strip leaves; the cards of 批注
// on what it leaves; off, nothing asked all the same.
{
  const collapsed = (width, more = {}) => marginLayout({ width, outline: true, collapsed: true, ...more });
  for (const width of [1905, 1635, 1155, 1008, 995]) {
    assert.deepEqual(part(collapsed(width)), { dock: 36, outline: "strip", room: 36 }, `${width}: its strip`);
    assert.deepEqual(place(collapsed(width)), place(marginLayout({ width, outline: true, full: 9999 })), `${width}: the column where the strip leaves it`);
  }
  assert.equal(collapsed(1200, { was: marginLayout({ width: 1200, outline: true }) }).outline, "strip", "collapsed while in full: the strip at once");
  assert.equal(collapsed(1200, { full: 360, wide: true }).outline, "strip", "a width chosen, a column read full width: the strip all the same");
  assert.deepEqual(marginLayout({ width: 1155, collapsed: true }), marginLayout({ width: 1155 }), "the outline off: no room asked");
  assert.deepEqual([collapsed(1425, { notes: true }).cards, collapsed(1155, { notes: true }).cards], [308, 308], "the cards of 批注 on what the strip leaves (1440 with the sidebar open: a card of 308 where the list left markers)");
}

// The outline's switch is each report's (shared/preferences.mjs): off for every report until switched
// on there, on for one leaving the others as they are, the reports that have it on kept in a short list
// (the one switched on last at the end, 100 at most); the old switch for every report no longer read,
// and let go as a preference is kept; another page's switch heard (the storage event) for its key alone.
{
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url: "http://127.0.0.1/" });
  const names = ["localStorage", "addEventListener"];
  const saved = Object.fromEntries(names.map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  Object.defineProperty(globalThis, "localStorage", { value: dom.window.localStorage, configurable: true, writable: true });
  Object.defineProperty(globalThis, "addEventListener", { value: dom.window.addEventListener.bind(dom.window), configurable: true, writable: true });
  try {
    const open = () => JSON.parse(dom.window.localStorage.getItem(OUTLINE_OPEN_KEY) ?? "null");
    dom.window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify({ editFrame: true, outline: true }));
    assert.deepEqual([outlineOpen("a"), outlineOpen("b")], [false, false], "off for every report at first, the old switch for every report on or not");
    setOutlineOpen("a", true);
    assert.deepEqual([outlineOpen("a"), outlineOpen("b"), open()], [true, false, ["a"]], "on for one report: the others as they were");
    setOutlineOpen("b", true);
    setOutlineOpen("a", true);
    assert.deepEqual(open(), ["b", "a"], "switched on again: the one switched on last");
    setOutlineOpen("a", false);
    assert.deepEqual([outlineOpen("a"), outlineOpen("b"), open()], [false, true, ["b"]], "off: taken out, the other kept");
    setOutlineOpen("", true);
    setOutlineOpen(undefined, true);
    assert.deepEqual([open(), outlineOpen(""), outlineOpen(undefined)], [["b"], false, false], "no report named: nothing kept");
    for (let index = 0; index < 120; index++) setOutlineOpen(`r${index}`, true);
    assert.deepEqual([open().length, open()[0], open().at(-1), outlineOpen("b"), outlineOpen("r19"), outlineOpen("r20")], [100, "r20", "r119", false, false, true], "100 reports at most: the ones switched on longest ago let go");
    dom.window.localStorage.setItem(OUTLINE_OPEN_KEY, "{not json");
    assert.equal(outlineOpen("r20"), false, "what cannot be read: off");
    setOutlineOpen("c", true);
    assert.deepEqual(open(), ["c"], "and written anew");
    assert.equal(preference("outline"), undefined, "the old switch for every report is no preference");
    setPreference("quietNotices", true);
    assert.deepEqual(JSON.parse(dom.window.localStorage.getItem(PREFERENCES_KEY)), { editFrame: true, quietNotices: true }, "let go as a preference is kept");
    assert.equal(preference("outlineCollapsed"), false, "the outline not collapsed until the reader does");
    setPreference("outlineCollapsed", true);
    assert.deepEqual([preference("outlineCollapsed"), JSON.parse(dom.window.localStorage.getItem(PREFERENCES_KEY)).outlineCollapsed], [true, true], "collapsed: kept, for every report");
    setPreference("outlineCollapsed", false);
    let heard = 0;
    onOutlineOpen(() => { heard++; });
    const told = (key) => dom.window.dispatchEvent(new dom.window.StorageEvent("storage", { key }));
    told(PREFERENCES_KEY);
    assert.equal(heard, 0, "a preference changed: not the outline's switch");
    told(OUTLINE_OPEN_KEY);
    told(null);
    assert.equal(heard, 2, "the switch changed in another page (or the storage cleared): heard");
  } finally {
    for (const name of names) {
      if (saved[name]) Object.defineProperty(globalThis, name, saved[name]);
      else delete globalThis[name];
    }
  }
}

// The head's script: the outline's room before the page shows, when its report has it on (the
// reports' switches, its own slug named by the edit service), as wide as the preferences say; never
// with ?solo. The page's width read again at DOMContentLoaded (the content in, its scrollbar with it),
// unless the editor has taken the room over.
{
  const run = (url, open, { slug = "a", width = 1440, later = null, taken = false, prefs = null, notes = false } = {}) => {
    const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { url, runScripts: "outside-only" });
    let now = width;
    Object.defineProperty(dom.window.document.documentElement, "clientWidth", { get: () => now, configurable: true });
    if (open) dom.window.localStorage.setItem(OUTLINE_OPEN_KEY, JSON.stringify(open));
    if (prefs) dom.window.localStorage.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
    dom.window.eval(earlyMarginScript(slug, { notes }));
    const doc = dom.window.document;
    const sheet = () => doc.head.querySelector("style[data-ge-margin-room]");
    const first = sheet()?.textContent ?? null;
    if (later !== null) {
      now = later;
      if (taken) sheet()?.removeAttribute("data-ge-margin-early");
      doc.dispatchEvent(new dom.window.Event("DOMContentLoaded"));
    }
    return { margin: doc.documentElement.hasAttribute("data-ge-margin"), sheet: later === null ? first : sheet()?.textContent ?? null, early: sheet()?.getAttribute("data-ge-margin-early") ?? null };
  };
  const none = { margin: false, sheet: null, early: null };
  const shown = run("http://127.0.0.1/generated/a.html", ["b", "a"]);
  assert.equal(shown.margin, true, "the outline on for this report: the room taken before the page shows");
  assert.match(shown.sheet, /--ge-outline-room: 192px; --ge-side: 64px;/);
  assert.equal(JSON.parse(shown.early).given.outline, "full", "the form the head gave, for the editor to keep (with what it was asked)");
  const chosen = run("http://127.0.0.1/generated/a.html", ["a"], { prefs: { outlineWidth: 300 } });
  assert.match(chosen.sheet, /--ge-outline-room: 292px;/, "the width the reader dragged it to (the same for every report)");
  assert.equal(JSON.parse(chosen.early).asked.outlineWidth, 300);
  const folded = run("http://127.0.0.1/generated/a.html", ["a"], { prefs: { outlineWidth: 300, outlineCollapsed: true } });
  assert.match(folded.sheet, /--ge-outline-room: 36px;/, "collapsed by the reader: its strip before the page shows, however wide the page");
  assert.deepEqual([JSON.parse(folded.early).given.outline, JSON.parse(folded.early).asked.collapsed], ["strip", true], "what it gave and was asked, for the editor to keep");
  assert.equal(JSON.parse(run("http://127.0.0.1/generated/a.html", ["a"], { prefs: { outlineCollapsed: "yes" } }).early).given.outline, "full", "what is no switch: not collapsed");
  const band = run("http://127.0.0.1/generated/a.html", ["a"], { width: 1015, later: 1000 });
  assert.deepEqual([band.sheet.includes("--ge-outline-room: 36px"), JSON.parse(band.early).given.outline], [true, "strip"], "1015 in the head, 1000 once the scrollbar is in: its strip before the page shows (the column never moves as it opens)");
  const taken = run("http://127.0.0.1/generated/a.html", ["a"], { width: 1015, later: 1000, taken: true });
  assert.ok(taken.sheet.includes("--ge-outline-room: 192px"), "the editor took the room over first: the head leaves it");
  assert.deepEqual(run("http://127.0.0.1/generated/a.html", ["b"]), none, "on for another report only: nothing here");
  assert.deepEqual(run("http://127.0.0.1/generated/a.html", [], { prefs: { outline: true, outlineWidth: 300 } }), none, "the old switch for every report on: off all the same");
  assert.deepEqual(run("http://127.0.0.1/generated/a.html", null), none, "never switched: off");
  assert.deepEqual(run("http://127.0.0.1/generated/a.html", { a: true }), none, "what is no list of reports: off");
  assert.deepEqual(run("http://127.0.0.1/generated/a.html?solo", ["a"]), none, "a page on its own in a frame (?solo): no outline");
  assert.ok(!earlyMarginScript("x</script>").includes("</script>"), "a name in the script never closes its tag");
  // A document with 批注: the cards' room before the page shows, as the column will stand.
  const noted = run("http://127.0.0.1/generated/a.html", null, { notes: true, width: 1155 });
  assert.equal(noted.margin, true);
  assert.match(noted.sheet, /--ge-outline-room: 0px; --ge-side: 64px; --ge-card-room: 342px; --ge-floor: 52px;/, "with the outline off");
  assert.deepEqual([JSON.parse(noted.early).asked.notes, JSON.parse(noted.early).given.cards], [true, 308], "what it was asked and gave, for the editor to keep");
  assert.match(run("http://127.0.0.1/generated/a.html", ["a"], { notes: true, width: 1425 }).sheet, /--ge-outline-room: 192px; --ge-side: 64px; --ge-card-room: 342px;/, "and on");
  assert.deepEqual(run("http://127.0.0.1/generated/a.html?solo", null, { notes: true }), none, "never on a page on its own in a frame");
}

// The handle's room (the bar's square, the grip, its gap and 12px to breathe) is the page's gutters from
// its first paint: the head's sheet sets them on its own, before any rule of a medium and of no attribute
// the editor or the head's script puts on later, so the column the kit lets show stands where the editor
// keeps it with the outline off and no 批注 too (the user's report on 0.1.1, 2026-11-09).
{
  assert.equal(MARGIN.edge, ADD.width + HANDLE.width + HANDLE.gap + 12);
  assert.equal(MARGIN.edge, 64);
  const rule = ":root { --ge-edge-room: 64px; --doc-page-gutter: var(--ge-edge-room); --doc-wide-gutter: var(--ge-edge-room); }";
  assert.ok(MARGIN_STYLE.includes(rule) && MARGIN_STYLE.indexOf(rule) < MARGIN_STYLE.indexOf("@media"), "the gutters the edge room, in the head's sheet, of no attribute and no medium");
}

// On the page: the head's form kept as the editor starts; the page hears a resize when the room moves
// the column (what stands over the text is placed again); the list's width dragged; the page's width
// moving (the sidebar dragged or sliding), each width laid out at once, the list as wide all along.
{
  const head = marginLayout({ width: 1008, outline: true }); // the list in full, the rooms at the handle's
  const early = { given: head, asked: { outline: true, outlineWidth: 0 } };
  const attribute = JSON.stringify(early).replace(/"/g, "&quot;");
  const dom = new JSDOM(`<!doctype html><html data-ge-margin><head><style data-ge-margin-room data-ge-margin-early="${attribute}">:root[data-ge-margin] { --ge-outline-room: ${head.room}px; --ge-side: ${head.side}px; --ge-card-room: 0px; --ge-floor: ${head.floor}px; --doc-area-start: ${head.side}px; --doc-area-end: ${head.room + head.side}px; }</style></head><body><main class="doc-page"></main></body></html>`, { url: "http://127.0.0.1/generated/a.html" });
  const { window } = dom;
  let width = 1000; // in the hysteresis under 1008: the head's form kept
  Object.defineProperty(window.document.documentElement, "clientWidth", { get: () => width, configurable: true });
  const names = ["document", "getComputedStyle", "addEventListener", "dispatchEvent", "ResizeObserver", "MutationObserver", "innerWidth", "Event"];
  const saved = Object.fromEntries(names.map((name) => [name, globalThis[name]]));
  Object.assign(globalThis, {
    document: window.document, getComputedStyle: window.getComputedStyle.bind(window), addEventListener: window.addEventListener.bind(window),
    dispatchEvent: window.dispatchEvent.bind(window), ResizeObserver: class { observe() {} }, MutationObserver: window.MutationObserver, innerWidth: width, Event: window.Event,
  });
  try {
    const page = await import("../../src/editor/page/margin.mjs?page");
    let resized = 0;
    window.addEventListener("resize", () => { resized++; });
    const given = page.setMargin({ outline: true });
    assert.deepEqual([part(given), given.left, given.side], [{ dock: 200, outline: "full", room: 192 }, 52, 52], "the head's form kept as the editor starts, 8px under 1008: the list as wide, the column where the head put it");
    assert.equal(resized, 0, "nothing moved: no resize");
    assert.equal(window.document.querySelector("style[data-ge-margin-room]").hasAttribute("data-ge-margin-early"), false, "the room the editor's from now on");
    // The list's width dragged: the room follows (the column in the middle of what it leaves), within
    // what leaves the column its edge room at both sides.
    width = 1200;
    window.dispatchEvent(new window.Event("resize"));
    assert.ok(resized > 0, "wider, the room moved the column: the page hears a resize");
    assert.equal(page.outlineMost(), 360, "at 1200 the list may go to its most");
    page.setMargin({ outlineWidth: 280 });
    assert.deepEqual([page.margin().dock, page.margin().room, page.margin().left], [280, 272, 108], "dragged to 280: the column in the middle of what it leaves");
    width = 1050;
    assert.equal(page.outlineMost(), 218, "at 1050 as far as leaves the column its edge room at both sides (1050 + 8 - 712 - 128)");
    width = 1200;
    page.setMargin({ outlineWidth: 0 });
    // The page's width moving (the sidebar dragged or sliding, a window dragged): each width laid out at
    // once, the list coming the moment it fits and going the moment it does not, as wide all along (a
    // width told twice, the window's resize and the page's observer, changes nothing).
    width = 900;
    window.dispatchEvent(new window.Event("resize"));
    assert.equal(page.margin().outline, "strip", "a page of 900: the strip");
    const seen = [];
    for (const step of [940, 1000, 1000, 1008, 1100, 1050, 1000, 992, 991]) {
      width = step;
      window.dispatchEvent(new window.Event("resize"));
      seen.push(`${step}:${page.margin().outline}:${page.margin().dock}`);
    }
    assert.deepEqual(seen, ["940:strip:36", "1000:strip:36", "1000:strip:36", "1008:full:200", "1100:full:200", "1050:full:200", "1000:full:200", "992:full:200", "991:strip:36"], "each width at once: the list at 1008 going up, kept to 992 going down, 200px all along");
    // Collapsed by the reader: the strip where the list fits; taken back, the list where the room
    // allows it (listFits: the whole width, as a strip going up), else the strip until there is room.
    width = 1100;
    window.dispatchEvent(new window.Event("resize"));
    page.setMargin({ collapsed: true });
    assert.deepEqual([page.margin().outline, page.listFits()], ["strip", true], "collapsed at 1100: the strip, the list would fit");
    page.setMargin({ collapsed: false });
    assert.equal(page.margin().outline, "full", "taken back: the list");
    page.setMargin({ collapsed: true });
    width = 1000;
    window.dispatchEvent(new window.Event("resize"));
    assert.equal(page.listFits(), false, "at 1000 (under 1008) the list would not fit, the hysteresis aside");
    page.setMargin({ collapsed: false });
    assert.equal(page.margin().outline, "strip", "taken back where the room is short: still the strip (never forced)");
    width = 1008;
    window.dispatchEvent(new window.Event("resize"));
    assert.deepEqual([page.margin().outline, page.listFits()], ["full", true], "wider, at 1008: the list");
    page.setMargin({ outline: false });
    assert.equal(window.document.documentElement.hasAttribute("data-ge-margin"), false, "nothing asked: no room");
  } finally {
    Object.assign(globalThis, saved);
  }
}

// ---------- the tree ----------
const h = (level, text, key = text) => ({ kind: "heading", level, text, key });
const shape = (tree) => tree.map((node) => (node.children.length ? { [node.text]: shape(node.children) } : node.text));
{
  assert.deepEqual(shape(treeOf([h(2, "A"), h(3, "a1"), h(3, "a2"), h(4, "a2x"), h(2, "B")])), [{ A: ["a1", { a2: ["a2x"] }] }, "B"], "nested by level");
  assert.deepEqual(shape(treeOf([h(2, "A"), h(4, "deep"), h(3, "mid")])), [{ A: ["deep", "mid"] }], "a level skipped does not indent twice; the next h3 is deep's sibling");
  assert.deepEqual(shape(treeOf([h(3, "x"), h(3, "y")])), ["x", "y"], "a report starting at h3: its h3s at the top");
  assert.deepEqual(shape(treeOf([h(1, "top"), h(2, "under")])), [{ top: ["under"] }], "an h1 heads what follows");
  // A scope stands where its highest heading would; when it ends, its own headings are closed.
  const scope = (...entries) => ({ kind: "scope", entries });
  assert.deepEqual(shape(treeOf([h(2, "A"), h(3, "intro"), scope(h(3, "left")), scope(h(3, "right")), h(3, "after")])), [{ A: ["intro", "left", "right", "after"] }], "columns of h3 after an h3: siblings of it, under the section");
  assert.deepEqual(shape(treeOf([h(2, "A"), scope(h(3, "c"), h(4, "c1")), h(4, "after")])), [{ A: [{ c: ["c1"] }, "after"] }], "a column's h3 never takes in what follows the row");
  assert.deepEqual(shape(treeOf([h(2, "Md"), scope(h(1, "H1"), h(2, "H2")), h(2, "Next")])), ["Md", { H1: ["H2"] }, "Next"], "a column's h1 stands as an h1 does; the h2 after the row is the section's sibling");
  assert.deepEqual(shape(treeOf([h(2, "A"), scope(h(4, "deep")), h(3, "b")])), [{ A: ["deep", "b"] }], "one of a deeper level nests under the heading open");
  assert.deepEqual(shape(treeOf([h(2, "A"), scope(), h(3, "a")])), [{ A: ["a"] }], "an empty scope changes nothing");
  // Tabs: a node per tab holding a heading, in the row's order, the tab's headings under it.
  const tabs = { kind: "tabs", key: "a:s", tabs: [
    { key: "tab:s:1", text: "图表", shown: false, entries: [h(2, "C")] },
    { key: "tab:s:2", text: "空的", shown: false, entries: [] },
    { key: "tab:s:3", text: "交互", shown: true, entries: [h(2, "I"), h(3, "i")] },
  ] };
  const tree = treeOf([tabs]);
  assert.deepEqual(shape(tree), [{ 图表: ["C"] }, { 交互: [{ I: ["i"] }] }], "tabs with headings, in their row's order; one with none left out");
  assert.equal(tree[1].kind, "tab");
  assert.equal(tree[1].shown, true, "the tab shown is told");
  assert.deepEqual(shape(treeOf([h(2, "S"), tabs])), ["S", { 图表: ["C"] }, { 交互: [{ I: ["i"] }] }], "an area of h2s after an h2: its tabs beside it");
  const deeper = { kind: "tabs", key: "a:d", tabs: [{ key: "tab:d:1", text: "甲", entries: [h(3, "x")] }] };
  assert.deepEqual(shape(treeOf([h(2, "S"), deeper, h(3, "y")])), [{ S: [{ 甲: ["x"] }, "y"] }], "an area of h3s in an h2's section: its tabs under that heading, and what follows after them");
  assert.deepEqual(treeOf([{ kind: "tabs", key: "a:t", tabs: [{ key: "x", text: "x", entries: [] }] }]), [], "an area with no heading adds nothing");
  assert.deepEqual([...keysOf(tree)], ["tab:s:1", "C", "tab:s:3", "I", "i"]);
  assert.deepEqual(nodesOf(tree).map((node) => node.text), ["图表", "C", "交互", "I", "i"], "reading order");
  assert.notEqual(signatureOf(treeOf([h(2, "A")])), signatureOf(treeOf([h(2, "B")])), "a renamed heading is drawn again");
  assert.notEqual(signatureOf(treeOf([h(2, "A"), h(3, "b")])), signatureOf(treeOf([h(2, "A"), h(2, "b")])), "so is one moved a level");
  assert.equal(signatureOf(treeOf([h(2, "A")])), signatureOf(treeOf([h(2, "A")])), "the same tree read again draws nothing");
}

// ---------- rows, folds, the current row ----------
{
  const tree = treeOf([h(2, "A"), h(3, "a1"), h(4, "a1x"), h(3, "a2"), h(2, "B")]);
  const texts = (rows) => rows.map((row) => `${row.depth}:${row.node.text}`);
  assert.deepEqual(texts(rowsOf(tree)), ["0:A", "1:a1", "2:a1x", "1:a2", "0:B"]);
  const folded = new Set(["a1"]);
  const rows = rowsOf(tree, folded);
  assert.deepEqual(texts(rows), ["0:A", "1:a1", "1:a2", "0:B"], "a folded row's children left out");
  assert.deepEqual(rows.map((row) => row.parent), [-1, 0, 0, -1], "each row's parent row");
  const a1x = nodesOf(tree).find((node) => node.text === "a1x");
  assert.equal(markedRow(rows, pathTo(tree, a1x), folded), 1, "the current heading inside a folded row marks that row");
  assert.equal(markedRow(rowsOf(tree), pathTo(tree, a1x)), 2, "unfolded, its own row");
  const a1 = nodesOf(tree).find((node) => node.text === "a1");
  assert.equal(markedRow(rows, pathTo(tree, a1), folded), 1, "a folded row current itself is marked");
  assert.equal(markedRow(rows, null), -1, "above the first heading nothing is marked");
  assert.deepEqual(texts(rowsOf(tree, new Set(["A"]))), ["0:A", "0:B"], "folding the top row");

  // Keys (aria's tree view).
  const all = rowsOf(tree);
  assert.deepEqual(keyAction(all, 0, "ArrowDown"), { focus: 1 });
  assert.deepEqual(keyAction(all, 4, "ArrowDown"), { focus: 4 }, "the last row stays");
  assert.deepEqual(keyAction(all, 0, "ArrowUp"), { focus: 0 });
  assert.deepEqual(keyAction(all, 3, "Home"), { focus: 0 });
  assert.deepEqual(keyAction(all, 0, "End"), { focus: 4 });
  assert.deepEqual(keyAction(all, 1, "ArrowLeft"), { fold: all[1].node }, "← folds an open row");
  assert.deepEqual(keyAction(all, 2, "ArrowLeft"), { focus: 1 }, "← on a leaf: its parent");
  assert.deepEqual(keyAction(rows, 1, "ArrowLeft", folded), { focus: 0 }, "← on a folded row: its parent");
  assert.deepEqual(keyAction(rows, 1, "ArrowRight", folded), { unfold: rows[1].node }, "→ unfolds a folded row");
  assert.deepEqual(keyAction(all, 1, "ArrowRight"), { focus: 2 }, "→ on an open row: its first child");
  assert.deepEqual(keyAction(all, 4, "ArrowRight"), { focus: 4 }, "→ on a leaf: stays");
  assert.deepEqual(keyAction(all, 3, "Enter"), { jump: all[3].node });
  assert.deepEqual(keyAction(all, 3, " "), { jump: all[3].node });
  assert.equal(keyAction(all, 3, "a"), null, "not its key");
  assert.equal(keyAction([], 0, "ArrowDown"), null);
}

// ---------- the strip's lines ----------
{
  const rows = (depths) => depths.map((depth, index) => ({ node: { key: String(index) }, depth, parent: -1 }));
  const plain = ticksOf(rows([0, 1, 2, 3, 4]), 400, 2);
  assert.equal(plain.gap, TICK.gap, "6px apart while they fit");
  assert.deepEqual(plain.ticks.map((tick) => tick.width), [16, 12, 9, 6, 6], "as wide as the row is shallow");
  assert.equal(plain.current, 2);
  const tight = ticksOf(rows(Array(30).fill(0)), 200, -1);
  assert.ok(tight.gap < TICK.gap && tight.gap >= TICK.least && tight.ticks.length === 30, "more than fit: the gap shrinks", JSON.stringify(tight.gap));
  assert.ok(30 * 2 + 29 * tight.gap <= 200);
  // Too many even 4px apart: the deepest levels left out, the current one's ancestor marked.
  const deep = rows(Array.from({ length: 60 }, (_, index) => index % 3));
  deep.forEach((row, index) => { row.parent = row.depth === 0 ? -1 : index - 1; });
  const fewer = ticksOf(deep, 150, 5);
  assert.ok(fewer.ticks.length < 60 && fewer.ticks.length * 2 + (fewer.ticks.length - 1) * fewer.gap <= 150, "the deepest levels left out until they fit");
  assert.ok(fewer.gap >= TICK.least, "never nearer than 4px");
  assert.ok(fewer.ticks.every((tick) => deep[tick.row].depth <= 1));
  assert.equal(deep[fewer.ticks[fewer.current].row].depth < deep[5].depth, true, "a row left out: its ancestor's line marks it");
  // A long report (130 headings, three levels) on a tall window: no comb down the window's height.
  const long = rows(Array.from({ length: 130 }, (_, index) => [0, 1, 1, 2, 2][index % 5]));
  const capped = ticksOf(long, 900, 129);
  const height = capped.ticks.length * 2 + (capped.ticks.length - 1) * capped.gap;
  assert.ok(height <= TICK.most && capped.gap >= TICK.least, "240px at the most, 4px apart at the least", JSON.stringify({ height, gap: capped.gap, lines: capped.ticks.length }));
  assert.equal(capped.ticks[capped.current].row <= 129 && capped.current === capped.ticks.length - 1, true, "the last heading current: the last line");
  // A run of top-level rows longer than the strip: taken every so many, over the whole list.
  const flat = ticksOf(rows(Array(200).fill(0)), 900, 120);
  assert.ok(flat.ticks.length * 2 + (flat.ticks.length - 1) * flat.gap <= TICK.most, "they fit");
  assert.ok(flat.ticks[0].row === 0 && flat.ticks.at(-1).row > 190, "from the first row to near the last");
  assert.ok(flat.ticks[flat.current].row <= 120 && flat.ticks[flat.current + 1].row > 120, "the line marking a row left out: the last before it");
  assert.deepEqual(ticksOf([], 100, -1), { gap: TICK.gap, current: -1, ticks: [] }, "no rows: no lines (the strip shows its icon)");
}

// ---------- the current heading, the list following it ----------
{
  assert.equal(currentOf([10, 50, 300], 120), 1, "the last one passed");
  assert.equal(currentOf([500, 600], 120), -1, "above the first: none");
  assert.equal(currentOf([10, null, 40], 120), 2, "one with no box (a hidden tab) passed over");
  assert.equal(currentOf([-400, 80, 80, 80], 120), 1, "headings side by side in columns (one top): the first of them, not the last column's");
  assert.equal(currentOf([-400, 80, 30, 80], 120), 1, "of those passed, the one furthest down");
  // The line a heading's top must pass comes down over the page's last window of scroll, so the last
  // short sections (which never reach the top) each get their turn and the last is current at the end.
  const line = (scrollY, maxScroll, view = 800) => spyLine({ scrollY, maxScroll, view, base: 120 });
  assert.equal(line(0, 5000), 120, "far from the end: the line near the top");
  assert.equal(line(4200, 5000), 120, "a window from the end: still");
  assert.equal(line(4600, 5000), 460, "half way into the last window: half way down");
  assert.equal(line(5000, 5000), 800, "at the end: the window's bottom, every heading on screen passed");
  assert.equal(line(0, 0), 120, "a page that does not scroll: where it is");
  assert.equal(line(100, 200), 460, "a page scrolling less than a window: down over what it scrolls");
  assert.equal(currentOf([-1900, -700, 124, 708], line(3000, 3000, 1080)), 3, "the sample's tab at its bottom (1920 x 1080): its last heading, on screen, current (the one above the window was)");
  assert.equal(currentOf([-300, 200, 420, 610], line(3000, 3000)), 3, "the last rows of a long report: the last at the end");
  assert.equal(currentOf([-300, 200, 420, 610], line(2300, 3000)), 1, "a little before: the line a little lower (205px)");
  // The list keeps the current row in a band of its view (its faded ends left out): at least two rows
  // below the view's top, at most a third of the way down, so reading down the rows to come fill two
  // thirds of it; it moves as little as that takes (a row for each heading passed), either way.
  const at = (top, scrollTop, view = 600) => followTop({ top, row: 28, scrollTop, view, full: 3000, least: 56, fade: { top: 24, bottom: 32 } });
  assert.equal(at(200, 0), null, "inside the band: nothing");
  assert.equal(at(240, 0), 240 - 24 - 181, "past a third of the clear view: back to the third");
  assert.equal(at(268, 35), 63, "the next heading: a row on");
  assert.equal(at(560, 0), 560 - 24 - 181, "far below: to the third");
  assert.equal(at(300, 300), 300 - 24 - 56, "reading up, within two rows of the top: two rows above it");
  assert.equal(at(40, 300), 0, "never above the list's top");
  assert.equal(at(2990, 0), 2400, "nor past its end");
  assert.equal(at(200, 0, 150), Math.round(200 - 24 - (150 - 56 - 28) / 2), "a view too short for the band: centered in what is clear");
  // A long jump: at once to a window short of its heading, gliding only the rest.
  assert.equal(glideFrom(0, 1500, 800), null, "two windows or less: the whole way smoothly");
  assert.equal(glideFrom(0, 14000, 800), 13200, "far down: at once to a window short");
  assert.equal(glideFrom(27000, 0, 800), 800, "far up: the same");
}

// ---------- what is folded, kept per report ----------
{
  const store = new Map();
  const storage = { get: (key) => store.get(key) ?? null, set: (key, value) => store.set(key, value) };
  assert.deepEqual([...foldsOf(storage, "a")], [], "nothing kept: everything open");
  keepFolds(storage, "a", new Set(["b:1", "b:2"]), new Set(["b:1", "b:2", "b:3"]));
  assert.deepEqual([...foldsOf(storage, "a")], ["b:1", "b:2"]);
  keepFolds(storage, "a", new Set(["b:1", "b:gone"]), new Set(["b:1"]));
  assert.deepEqual([...foldsOf(storage, "a")], ["b:1"], "keys no longer on the page dropped as it saves");
  keepFolds(storage, "a", new Set());
  assert.equal(JSON.parse(store.get(FOLDS_KEY)).folds.a, undefined, "none folded: the report forgotten");
  for (let index = 0; index < 105; index++) keepFolds(storage, `r${index}`, new Set(["x"]));
  const kept = Object.keys(JSON.parse(store.get(FOLDS_KEY)).folds);
  assert.equal(kept.length, 100, "the 100 reports folded last");
  assert.deepEqual([kept[0], kept.at(-1)], ["r5", "r104"], "the oldest go first");
  keepFolds(storage, "r5", new Set(["y"]));
  assert.equal(Object.keys(JSON.parse(store.get(FOLDS_KEY)).folds).at(-1), "r5", "folding again makes it the last");
  store.set(FOLDS_KEY, "{not json");
  assert.deepEqual([...foldsOf(storage, "a")], [], "what cannot be read is nothing");
}

// A fold carried to the key its node has now (a heading with no block id typed in, then given its id).
{
  const folded = new Set(["t:h3:表格模板", "b:other"]);
  assert.equal(carryFolds(folded, [["t:h3:表格模板", "t:h3:表格模板x"], ["b:other", "b:other"]]), true);
  assert.deepEqual([...folded].sort(), ["b:other", "t:h3:表格模板x"], "typed in: the fold follows");
  carryFolds(folded, [["t:h3:表格模板x", "b:abc"]]);
  assert.deepEqual([...folded].sort(), ["b:abc", "b:other"], "given its id: the fold follows");
  assert.equal(carryFolds(folded, [["t:h3:gone", "t:h3:new"]]), false, "what was not folded: nothing");
}

// A formula as a row reads it.
{
  const r = String.raw;
  const reads = [
    ["E = mc^2", "E = mc²"], [r`\frac{a}{b}`, "a/b"], [r`\frac{a+1}{2}`, "(a + 1)/2"], [r`\frac{\partial f}{\partial x}`, "∂f/∂x"], [r`\sin\theta`, "sin θ"], [r`\sqrt{x}`, "√x"], [r`\sqrt[3]{x+y}`, "√(x + y)"],
    [r`\alpha+\beta \le \gamma`, "α + β ≤ γ"], ["x_1, x_{12}", "x₁, x₁₂"], ["x^{n+1}", "xⁿ⁺¹"], ["x^{ab}", "x^ab"], ["a_{ij}", "a_ij"],
    [r`\Delta = S_e - S_b`, "Δ = S_e - S_b"], [r`\text{收益率} \times 100\%`, "收益率 × 100%"], [r`\left( x \right)`, "( x )"], [r`\ce{H2O}`, "H₂O"],
    [r`\log_2 n`, "log₂ n"], [r`\sum_{i=1}^{n} x_i`, "∑_(i=1)ⁿ x_i"], [r`\mathbf{v}\cdot\vec{w}`, "v · w"],
  ];
  for (const [tex, text] of reads) assert.equal(texReading(tex), text, tex);
}

// ---------- the page read ----------
{
  const dom = new JSDOM(`<!doctype html><body><main class="doc-page">
    <header class="doc-header"><h1 class="doc-title" data-ge-kind="title">报告标题</h1></header>
    <section class="doc-section"><h2 data-ge-unit-kind="heading" data-block-id="aaaaaaaa">第一节</h2>
      <p>正文</p>
      <h3 data-ge-unit-kind="heading">公式 <span class="doc-math-inline"><span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">x^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">x2</span></span></span> 与​链接 <a class="doc-link-mention" href="https://x.org"><span class="doc-link-mention-icon"></span>示例页</a></h3>
      <figure class="doc-figure"><h3>图的标题</h3></figure>
      <div class="doc-columns"><div class="doc-column"><h1 data-ge-unit-kind="heading">栏里的 H1</h1><h2 data-ge-unit-kind="heading">栏里的 H2</h2></div></div>
      <h3 data-ge-unit-kind="heading">栏后</h3>
      <h3 data-ge-unit-kind="heading"> </h3>
      <ul><li><h4 data-ge-unit-kind="heading">项里的</h4></li></ul>
      <details class="doc-details"><summary>折叠</summary><div class="doc-details-content"><h3 data-ge-unit-kind="heading">折叠里的</h3></div></details>
    </section>
    <section class="doc-sheet-shell" data-doc-sheets="s" data-block-id="tabsarea">
      <div class="doc-sheet-tabs"><button class="doc-sheet-tab" data-sheet-tab="two">第二</button><button class="doc-sheet-tab" data-sheet-tab="one">第一</button><button class="doc-sheet-tab" data-sheet-tab="none">无标题</button></div>
      <div data-doc-sheet="one"><h2 data-ge-unit-kind="heading">一里的</h2></div>
      <div data-doc-sheet="none"><p>只有正文</p></div>
      <div data-doc-sheet="two" hidden><h2 data-ge-unit-kind="heading">二里的</h2></div>
    </section>
    <dialog class="doc-dialog"><h3 data-ge-unit-kind="heading">卡片里的</h3></dialog>
  </main></body>`);
  const main = dom.window.document.querySelector("main");
  const tree = treeOf(entriesOf(main));
  assert.deepEqual(shape(tree), [
    { 第一节: ["公式 x² 与链接 示例页"] },
    { "栏里的 H1": ["栏里的 H2"] },
    "栏后",
    "折叠里的",
    { 第二: ["二里的"] },
    { 第一: ["一里的"] },
  ], "the title, a figure's title, an empty heading, one in a list item and a detail card's left out; columns and a disclosure keep theirs; tabs in their row's order, the hidden one too, one with no heading left out");
  assert.equal(tree[0].key, "b:aaaaaaaa", "a heading with a block id keyed by it");
  assert.equal(tree[4].key, "tab:s:two", "a tab by its area's name (kept when the area gets a block id) and its key");
  assert.equal(tree[4].shown, false, "the hidden tab told");
  assert.equal(tree[5].shown, true);
  assert.equal(tree[0].children[0].key, "t:h3:公式 x² 与链接 示例页", "one with none by its level and text");
  assert.equal(tree[0].children[0].ref.localName, "h3");
  const doc = new JSDOM(`<h2 data-ge-unit-kind="heading">同名</h2><h2 data-ge-unit-kind="heading">同名</h2>`).window.document;
  assert.deepEqual(nodesOf(treeOf(entriesOf(doc.body))).map((node) => node.key), ["t:h2:同名", "t:h2:同名#1"], "two of a name told apart");
  const plain = new JSDOM(`<h2>  a <code>b</code>​ <strong>c</strong>  <span data-doc-dev>x</span><span class="doc-math-inline">\\(y\\)</span></h2>`).window.document.querySelector("h2");
  assert.equal(headingText(plain), "a b c y", "inline code and marks as their text, the editor's nodes and pads left out, a formula not drawn yet as it reads");
  const twice = new JSDOM(`<section data-doc-sheets="s"><div class="doc-sheet-tabs"><button class="doc-sheet-tab" data-sheet-tab="a">甲</button></div><div data-doc-sheet="a"><h2 data-ge-unit-kind="heading">一</h2></div></section>
    <section data-doc-sheets="s" data-block-id="x"><div class="doc-sheet-tabs"><button class="doc-sheet-tab" data-sheet-tab="a">乙</button></div><div data-doc-sheet="a"><h2 data-ge-unit-kind="heading">二</h2></div></section>`).window.document;
  assert.deepEqual(treeOf(entriesOf(twice.body)).map((node) => node.key), ["tab:s:a", "tab:s#1:a"], "two areas of a name told apart");
}

// What may change the rows: words typed in a heading or a tab, a heading put in or taken out, an
// attribute it reads; not words typed in a paragraph, nor a paragraph added.
{
  const dom = new JSDOM(`<main><h2 data-ge-unit-kind="heading">标题</h2><p>正文</p><div class="box"><h3 data-ge-unit-kind="heading">小节</h3></div>
    <section data-doc-sheets="s"><div class="doc-sheet-tabs"><button class="doc-sheet-tab" data-sheet-tab="a">甲</button></div><div data-doc-sheet="a"></div></section></main>`);
  const { document, MutationObserver } = dom.window;
  const main = document.querySelector("main");
  const changed = async (change) => {
    const records = [];
    const observer = new MutationObserver((list) => records.push(...list));
    observer.observe(main, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "open"] });
    change();
    await new Promise((resolve) => setTimeout(resolve, 0));
    observer.disconnect();
    return touchesOutline(records);
  };
  assert.equal(await changed(() => { document.querySelector("p").firstChild.data += "字"; }), false, "a word typed in a paragraph");
  assert.equal(await changed(() => { document.querySelector("p").after(document.createElement("p")); }), false, "a paragraph added");
  assert.equal(await changed(() => { document.querySelector("p").append(document.createElement("strong")); }), false, "a mark in a paragraph");
  assert.equal(await changed(() => { document.querySelector("h2").firstChild.data += "字"; }), true, "a word typed in a heading");
  assert.equal(await changed(() => { document.querySelector(".doc-sheet-tab").firstChild.data = "乙"; }), true, "a tab renamed");
  assert.equal(await changed(() => { document.querySelector(".box").remove(); }), true, "a box holding a heading taken out");
  assert.equal(await changed(() => { const h = document.createElement("h4"); h.setAttribute("data-ge-unit-kind", "heading"); main.append(h); }), true, "a heading put in");
  assert.equal(await changed(() => { document.querySelector("[data-doc-sheet]").hidden = true; }), true, "a panel hidden");
}

// The page read as it is served, before the editor makes it editable (editor.mjs start: the units'
// kinds marked from the map, core.mjs markKinds, the outline drawn, then enter): the same entries,
// keys, levels and words as once every block is prepared and the layout captured; captureLayout then
// sets none of those marks again (the outline's observer would read the page again for nothing).
{
  const { html, map } = instrument(`<main class="doc-page" data-doc-id="early">
  <header class="doc-header"><h1 class="doc-title">报告</h1></header>
  <section class="doc-section"><h2>第一节</h2><p>正文 <code>x</code> 与公式</p><h3>小节 <code>y</code> 的名字</h3></section>
  <div class="doc-columns"><div class="doc-column"><h2>栏里的</h2></div><div class="doc-column"><p>右栏</p></div></div>
  <details class="doc-details"><summary>折叠</summary><div class="doc-details-content"><h3>折叠里的</h3></div></details>
</main>`);
  const { document, MutationObserver } = new JSDOM(html).window;
  const main = document.querySelector("main");
  const read = () => {
    const tree = treeOf(entriesOf(main));
    return { shape: shape(tree), keys: nodesOf(tree).map((node) => node.key) };
  };
  assert.deepEqual(read().keys, [], "as served, no heading is known for one");
  markKinds(document, map);
  const early = read();
  assert.deepEqual(early.shape, [{ 第一节: ["小节 y 的名字"] }, "栏里的", "折叠里的"], "marked from the map: the headings by level, the title left out");
  for (const block of map.blocks) {
    const node = document.querySelector(`[data-ge-block="${block.id}"]`);
    if (node && block.kind !== "code") prepareBlock(node, block);
  }
  const marks = new MutationObserver(() => {});
  marks.observe(main, { subtree: true, attributes: true, attributeFilter: ["data-ge-unit-kind"] });
  captureLayout(document, map);
  assert.equal(marks.takeRecords().length, 0, "captureLayout sets no kind markKinds set");
  marks.disconnect();
  assert.deepEqual(read(), early, "every block prepared and the layout captured: the same entries, keys and words");
}

console.log("Checked the outline: the room at the page's right at the workbench's widths (the column in the middle of what the outline leaves, its two rooms the same, the list in full from 1008, as wide as the reader gave it whatever the page (its strip where it does not fit), the width dragged, its hysteresis, a full-width report, the head's script with the width and its second look once the scrollbar is in, never with ?solo, the head's form kept as the editor starts, a resize when the column moves, each width laid out at once as it moves, the list as wide all along; collapsed by the reader: the strip wherever, in the head too, taken back the list only where it fits), the switch kept per report (off at first, on for one leaving the others, 100 at most, the old one for every report ignored and let go) and the head's script reading its own report's, the tree by levels with scopes and tabs, rows with folds and the row marking the current heading, the keys, the strip's lines, the current heading (the line coming down over the last window) and the list following it in its band, a far jump gliding its last window, folds kept per report and carried to a new key, a formula as it reads, the page read into entries (as served, its units' kinds marked from the map, the same as once the editor has prepared it), and which changes of it are read again.");
