import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// Where the reader was, kept across a page shown again (docs/workbench.md "Where the reader was";
// decided 2026-11-14): the views a tab keeps for the next page of a document or a custom
// page (src/shared/kept-view.mjs: kept and taken once, left as a page goes and kept for it only when the
// workbench shows that page again on its own, Vite's reload of it and not the reader's F5; and the view the
// workbench hands a frame, coming back to a page the reader left: handedView), the element a place names when the page changed above it
// (src/shared/reading-place.mjs elementOf: by its block and where it stood in it, on a custom page by its
// card and its own id), and the reader's own move that stops a page putting them back (onReaderMove).

const saved = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
const area = new Map();
const working = { getItem: (key) => area.get(key) ?? null, setItem: (key, value) => void area.set(key, String(value)), removeItem: (key) => void area.delete(key) };
const refusing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("blocked"); } };
const use = (storage) => Object.defineProperty(globalThis, "sessionStorage", { value: storage, configurable: true, writable: true });
use(working);

const { LEFT_FOR, handedView, keepLeft, keepView, leaveShown, leaveView, leftKey, shownBefore, shownByVite, takeView } = await import("../../src/shared/kept-view.mjs");
const { viewKey } = await import("../../src/shared/session.mjs");
const { earlyMoveScript, elementOf, onReaderMove, placeIn } = await import("../../src/shared/reading-place.mjs");

// ---------- views kept for the next page ----------
{
  const view = { x: 0, y: 1200, top: { path: [3, 1], id: "b1", at: 40, inner: [] }, unit: null };
  keepView("sample", view);
  assert.deepEqual(takeView("sample"), view, "a view kept comes back");
  assert.equal(takeView("sample"), null, "once");
  area.set(viewKey("sample"), "{not json");
  assert.equal(takeView("sample"), null, "unreadable: none");
  area.set(viewKey("sample"), JSON.stringify({ x: 0 }));
  assert.equal(takeView("sample"), null, "no scroll position: none");
  assert.equal(area.has(viewKey("sample")), false, "and taken away");

  // Left as a page goes: no page starts there by itself; a page starting forgets it.
  leaveView("sample", view);
  assert.ok(Number(JSON.parse(area.get(leftKey("sample"))).at) > 0, "left with the time");
  assert.equal(takeView("sample"), null, "a left view is no view to start at");
  assert.equal(area.has(leftKey("sample")), false, "a page starting forgets what an earlier one left");

  // The workbench showing the page again on its own: the left view kept for it, without its time.
  leaveView("@long", view);
  assert.equal(keepLeft("@long"), true, "a view left a moment ago: kept for the page");
  assert.deepEqual(takeView("@long"), view, "the page starts there");
  assert.equal(keepLeft("@long"), false, "nothing left any more");
  leaveView("sample", view);
  assert.equal(keepLeft("sample", Date.now() + LEFT_FOR + 1), false, "left longer ago than LEFT_FOR: not kept");
  assert.equal(area.has(leftKey("sample")) || area.has(viewKey("sample")), false, "and taken away");
}

// ---------- which page the workbench shows again ----------
{
  leaveShown("sample", 100);
  assert.equal(shownBefore(100, "navigate"), "sample", "the report area made again in the same workbench document");
  assert.equal(shownBefore(100, "reload"), null, "read once");
  leaveShown("sample", 100, true);
  assert.equal(shownBefore(200, "reload"), "sample", "the workbench reloaded by Vite: the page it showed as it went");
  leaveShown("sample", 100);
  assert.equal(shownBefore(200, "reload"), null, "reloaded by the reader (F5): none, the page at its top (the user's 2026-11-20)");
  leaveShown("sample", 100);
  shownByVite();
  assert.equal(shownBefore(200, "reload"), "sample", "the area gone first, Vite reloading it after: the page it showed");
  shownByVite();
  assert.equal(shownBefore(200, "reload"), null, "nothing left: nothing made");
  leaveShown("@home", 100);
  assert.equal(shownBefore(200, "navigate"), null, "another document come to otherwise (a link, an address typed): none");
  leaveShown("@home", 100);
  assert.equal(shownBefore(200, "back_forward"), null, "nor back to it from another site");
  leaveShown("sample", 100);
  leaveShown(null, 100);
  assert.equal(shownBefore(100, "reload"), null, "it went showing nothing (a web link): none");
  area.set("gallery-workbench:shown", "sample");
  assert.equal(shownBefore(200, "reload"), null, "unreadable: none");
}

// ---------- the view a workbench hands a frame ----------
{
  const view = { x: 0, y: 900, top: { path: [4], id: "b2", at: 37, inner: [] }, unit: "b3", self: true, offset: 3 };
  const frame = (text) => {
    const attributes = new Map(text === null ? [] : [["data-view", text]]);
    return { getAttribute: (name) => attributes.get(name) ?? null, removeAttribute: (name) => void attributes.delete(name), has: () => attributes.has("data-view") };
  };
  const handed = frame(JSON.stringify(view));
  assert.deepEqual(handedView({ frameElement: handed }), view, "the frame's data-view");
  assert.equal(handed.has(), false, "taken away");
  assert.equal(handedView({ frameElement: handed }), null, "once");
  assert.equal(handedView({ frameElement: null }), null, "no frame (a page alone, another origin): none");
  assert.equal(handedView({ frameElement: frame("{no") }), null, "unreadable: none");
  assert.equal(handedView({ frameElement: frame(JSON.stringify({ x: 0 })) }), null, "no scroll position: none");
  assert.equal(handedView({ get frameElement() { throw new Error("cross-origin"); } }), null, "unreachable: none");
  // A page starting takes it over what was kept, and both go.
  globalThis.frameElement = frame(JSON.stringify(view));
  keepView("sample", { x: 0, y: 5 });
  assert.deepEqual(takeView("sample"), view, "takeView: the handed view first");
  assert.equal(area.has(viewKey("sample")), false, "what was kept forgotten too");
  delete globalThis.frameElement;
}

// ---------- where the reader left a page, in the workbench's memory (src/workbench/app/state/recall.ts) ----------
{
  const { RECALL_FOR, arrive, caretIn, leftPage, recall } = await import("../../src/workbench/app/state/recall.ts");
  const clock = Date.now;
  let now = 1_000_000;
  Date.now = () => now;
  try {
    assert.equal(RECALL_FOR, 5 * 60 * 1000, "five minutes (decided for the user, 2026-11-20)");
    const view = { x: 0, y: 1200, top: { path: [3], id: "b1", at: 37, inner: [] }, unit: "b3", self: true, offset: 2 };
    assert.equal(recall("sample"), null, "never left: from its top");
    leftPage("sample", view);
    view.y = 5;
    assert.equal(recall("sample")?.y, 1200, "back: where the reader left it, a copy of what the page said");
    now += RECALL_FOR - 1;
    assert.ok(recall("sample"), "back just under RECALL_FOR: there still (the memory stays until the page is left again)");
    now += 2;
    assert.equal(recall("sample"), null, "back past RECALL_FOR: from its top");
    now -= 2;
    assert.equal(recall("sample"), null, "and forgotten");
    leftPage("@home", { x: 0, y: 300, top: null });
    arrive("@home", true);
    assert.equal(recall("@home"), null, "going to a place of its own (fresh): not where the reader left it");
    arrive("sample", true);
    assert.equal(recall("@home")?.y, 300, "another page asked fresh: this one comes back, the ask taken");
    assert.equal(recall("@home")?.y, 300, "and again");
    for (const no of [null, undefined, "x", { x: 0 }]) leftPage("other", no);
    assert.equal(recall("other"), null, "nothing readable left: nothing kept");
    assert.equal(caretIn({ x: 0, y: 0, unit: "b3", offset: 0 }), true, "a caret: its block and offset");
    assert.equal(caretIn({ x: 0, y: 0, unit: null, offset: null }), false, "none in the page");
    assert.equal(caretIn(null), false, "no view");
  } finally {
    Date.now = clock;
  }
}

// ---------- no storage (a private window, storage blocked) ----------
{
  use(refusing);
  keepView("sample", { x: 0, y: 1 });
  leaveView("sample", { x: 0, y: 1 });
  leaveShown("sample", 1);
  assert.equal(takeView("sample"), null, "nothing kept, nothing thrown");
  assert.equal(keepLeft("sample"), false);
  assert.equal(shownBefore(1, "reload"), null);
  use(working);
}

// ---------- the element a place names, the page changed above it ----------
{
  const { window } = new JSDOM(`<!doctype html><body><main>
    <p data-block-id="a">一</p>
    <table data-block-id="t"><tbody><tr><td>1</td></tr><tr><td id="cell">2</td></tr></tbody></table>
    <section data-block-id="s"><p data-block-id="b">二</p></section>
  </main></body>`);
  const doc = window.document;
  const main = doc.querySelector("main");
  const row = doc.querySelectorAll("tr")[1];
  // A table's second row at the top of the window: its path, its block, and where it stands in the block.
  const top = { path: [1, 0, 1], id: "t", at: 12, inner: [0, 1] };
  assert.equal(elementOf(doc, top), row, "at its path");
  main.insertAdjacentHTML("afterbegin", "<p>Agent 加的</p><p>又一段</p>");
  assert.equal(elementOf(doc, top), row, "more above: the path names another block's element; found in its block where it stood");
  assert.equal(elementOf(doc, { ...top, inner: undefined }), doc.querySelector('[data-block-id="t"]'), "a place kept before inner: its block");
  row.remove();
  assert.equal(elementOf(doc, top), doc.querySelector('[data-block-id="t"]'), "that element gone: its block");
  assert.equal(elementOf(doc, { path: [9], id: "gone", at: 0, inner: [] }), null, "the block gone: none (the scroll position then)");

  // A custom page: no block ids; by the card it is in and its own id.
  const page = new JSDOM(`<!doctype html><body><main class="gallery-page">
    <p id="p0">零</p><p id="p1">一</p>
    <div class="gallery-board"><section class="gallery-card" data-card-id="c1"><div><p>卡片里</p></div></section><section class="gallery-card" data-card-id="c2"><div><p>另一张</p></div></section></div>
  </main></body>`).window.document;
  const named = { path: [1], id: null, at: 30, card: null, name: "p1" };
  assert.equal(elementOf(page, named).id, "p1", "at its path, with its id");
  page.querySelector("main").insertAdjacentHTML("afterbegin", "<p id='new0'>新</p>");
  assert.equal(elementOf(page, named).id, "p1", "more above: by its own id");
  const inCard = { path: [3, 1, 0, 0], id: null, at: 0, card: "c2", name: null };
  assert.equal(elementOf(page, inCard).textContent, "另一张", "in a card, at its path");
  page.querySelector('[data-card-id="c1"]').remove();
  assert.equal(elementOf(page, inCard), page.querySelector('[data-card-id="c2"]'), "the path in another card now: its card");
  assert.equal(elementOf(page, { path: [0], id: null, at: 0, card: null, name: null }).id, "new0", "neither: at its path, as before");
}

// ---------- a place read on a page laid out, found on the page before it is ----------
{
  // A table's frame across the window's top: its rows above the window end above it, the 3rd body row the first in it.
  const { window } = new JSDOM(`<!doctype html><body><main>
    <p>前面</p>
    <section><div class="doc-table-wrap" data-block-id="t"><table><thead><tr><th>甲</th></tr></thead><tbody>
      <tr data-top="-60"><td>1</td></tr><tr data-top="-20"><td>2</td></tr><tr data-top="12"><td>3</td></tr><tr data-top="52"><td>4</td></tr>
    </tbody></table></div></section>
  </main></body>`);
  const doc = window.document;
  // Each element's box: a row's by its data-top; the section, the frame, the table and its body across the window's
  // top; anything else (the header row, the paragraph before) ends above the window.
  window.HTMLElement.prototype.getBoundingClientRect = function box() {
    const row = this.closest("tr[data-top]");
    const across = this.matches("section, .doc-table-wrap, table, tbody");
    const top = row ? Number(row.dataset.top) : across ? -100 : this.closest("thead") ? -140 : -400;
    const bottom = across ? 400 : top + 30;
    return { top, bottom, height: bottom - top, left: 0, right: 100, width: 100 };
  };
  const wrap = doc.querySelector(".doc-table-wrap");
  const table = wrap.querySelector("table");
  const row = doc.querySelectorAll("tbody tr")[2];
  // The kit, laying the table out, puts its scrollbars layer first in the frame and the columns first in the table.
  const layOut = () => {
    wrap.insertAdjacentHTML("afterbegin", '<div class="doc-scrollbars" aria-hidden="true"><div class="doc-scrollbars-frame"></div></div>');
    table.insertAdjacentHTML("afterbegin", "<colgroup data-doc-columns><col></colgroup>");
  };
  const unlay = () => {
    wrap.querySelector(".doc-scrollbars").remove();
    table.querySelector("colgroup").remove();
  };
  layOut();
  const { top } = placeIn(window);
  assert.equal(elementOf(doc, top), row, "read on the page laid out: the first row in the window");
  assert.ok(top.path.every((step) => typeof step === "string" && /^[a-z]+:\d+$/.test(step)), `each step a tag and its number: ${JSON.stringify(top.path)}`);
  unlay();
  assert.equal(elementOf(doc, top), row, "the same row on the page before the kit laid the table out: not the table's top");
  assert.equal(elementOf(doc, { ...top, path: ["main:9"] }), row, "by its block where its path names nothing");
  const before = placeIn(window).top;
  layOut();
  assert.equal(elementOf(doc, before), row, "and read before, found after");
  // A place kept before steps named their tag: its numbers, each a child's index, still read.
  assert.equal(elementOf(doc, { path: [1, 0, 1, 2, 2], id: "t", at: 12, inner: [1, 2, 2] }), row, "a place of numbers: at its path");
}

// ---------- the reader's own move ----------
{
  const { window } = new JSDOM("<!doctype html><body><main></main></body>", { runScripts: "outside-only" });
  let moved = 0;
  onReaderMove(window, () => moved++);
  window.dispatchEvent(new window.Event("scroll"));
  assert.equal(moved, 0, "a scroll of the page's own (put back, laid out) is no move of the reader's");
  window.dispatchEvent(new window.WheelEvent("wheel"));
  window.dispatchEvent(new window.KeyboardEvent("keydown"));
  assert.equal(moved, 1, "a wheel: once, and no more");
  // The editor is imported once the page has loaded: the head's early script marks a move before it.
  const early = new JSDOM("<!doctype html><body><main></main></body>", { runScripts: "outside-only" }).window;
  early.eval(earlyMoveScript);
  early.dispatchEvent(new early.Event("pointerdown"));
  let heard = 0;
  onReaderMove(early, () => heard++);
  assert.equal(heard, 1, "moved before it listened: told at once");
  const still = new JSDOM("<!doctype html><body><main></main></body>", { runScripts: "outside-only" }).window;
  still.eval(earlyMoveScript);
  let none = 0;
  onReaderMove(still, () => none++);
  assert.equal(none, 0, "not moved: not told");
  still.dispatchEvent(new still.Event("touchstart"));
  assert.equal(none, 1, "then a touch: told");
}

if (saved) Object.defineProperty(globalThis, "sessionStorage", saved);
else delete globalThis.sessionStorage;
console.log("kept-view: ok");
