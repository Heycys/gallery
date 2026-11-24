// Where a reader is in a page, for the way back from a link to a block of it (docs/render.md, "Links
// to blocks"; the page editor's and the workbench's too): the scroll position and the element that
// stands at the top of the window, with how far down the window its top is. A jump opens what hides
// its block (a disclosure, a tab, a detail card), and what opens above the place moves the rest, so
// the way back goes by that element where it can, by the scroll position where it cannot. The element
// is named by where it stands in the page's main (the steps down to it, each a tag and its number among
// its siblings of that tag: an Agent's blocks carry no id until a commit or an export gives them one),
// checked by the id of the block it is in; on a page with no block ids (a custom page), by the board's
// card it is in (data-card-id) and its own id.

const rootOf = (doc) => doc.querySelector("main") ?? doc.body;

/** `value` for a quoted CSS string: the window's CSS.escape, where there is one (a DOM of a test may have none). */
export const cssString = (win, value) => (win?.CSS?.escape ? win.CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&").replace(/\n/g, "\\a "));

const blockOf = (element) => element.closest("[data-block-id]")?.getAttribute("data-block-id") ?? null;
// The steps from `from` down to `element` (in it), each "<tag>:<n>": the element's tag and how many of its
// parent's children before it have that tag. What a page adds as it lays itself out stands among elements of
// other tags (the kit's scrollbars layer, a div put first in a table's frame; a table's colgroup before its
// rows), so a place read on a page laid out names the same element on the page before it is: a page shown
// again is put there as it is first shown, not at the top of the table the element was in.
const pathFrom = (from, element) => {
  const path = [];
  for (let node = element; node !== from; node = node.parentElement) {
    let nth = 0;
    for (let other = node.previousElementSibling; other; other = other.previousElementSibling) if (other.localName === node.localName) nth += 1;
    path.unshift(`${node.localName}:${nth}`);
  }
  return path;
};
// The child of `parent` a step names; a step that is a number (a place kept before steps named their tag) by
// its index among all the children.
const childAt = (parent, step) => {
  if (Number.isInteger(step)) return parent.children[step] ?? null;
  const [, tag, nth] = /^([^:]+):(\d+)$/.exec(typeof step === "string" ? step : "") ?? [];
  if (!tag) return null;
  let left = Number(nth);
  for (const child of parent.children) if (child.localName === tag && left-- === 0) return child;
  return null;
};
const down = (from, path) => {
  let element = from;
  for (const step of Array.isArray(path) ? path : [null]) element = element ? childAt(element, step) : null;
  return element;
};
const cardOf = (element) => element.closest("[data-card-id]")?.getAttribute("data-card-id") ?? null;

// The tab each Sheet area of `win`'s page shows, by the area's name (sheets.js keeps one state per name).
const tabsIn = (win) => {
  const tabs = {};
  for (const area of win.document.querySelectorAll("[data-doc-sheets]")) {
    const key = win.DocSheets?.get(area)?.get();
    if (typeof key === "string") tabs[area.getAttribute("data-doc-sheets")] = key;
  }
  return tabs;
};

/**
 * `win`'s place: { x, y, top, tabs }, `top` { path, id, at } the first element of the page's main, in
 * its order, whose top is in the window or below it (none in a detail card, none that sticks or is
 * fixed, none that takes no room), or null where none is; `tabs` the tab each Sheet area shows. In a
 * block, `top` has `inner` too: the steps from that block down to it (an element in a block that
 * began above the window: a table's row, a list's item); in none (`id` null), `card` and `name`: the card
 * it is in and its own id, or null.
 */
export function placeIn(win) {
  const doc = win.document;
  const root = rootOf(doc);
  let top = null;
  if (root) {
    const walker = doc.createTreeWalker(root, 1, (element) => {
      if (element.localName === "dialog") return 2; // a card's blocks stand over the page, not in it
      const box = element.getBoundingClientRect();
      if (box.bottom <= 0 && box.height > 0) return 2; // what ends above the window holds nothing in it
      const { position } = win.getComputedStyle(element);
      return position === "fixed" || position === "sticky" ? 2 : 1; // what stands still as the page scrolls (a heading that sticks, a bar of the document's own), and what is in it, names no place in it
    });
    for (let element = walker.nextNode(); element; element = walker.nextNode()) {
      const box = element.getBoundingClientRect();
      if (box.height === 0 || box.top < 0) continue;
      const block = element.closest("[data-block-id]");
      const id = block?.getAttribute("data-block-id") ?? null;
      top = { path: pathFrom(root, element), id, at: Math.round(box.top), ...(id === null ? { card: cardOf(element), name: element.id || null } : { inner: pathFrom(block, element) }) };
      break;
    }
  }
  return { x: Math.round(win.scrollX), y: Math.round(win.scrollY), top, tabs: tabsIn(win) };
}

// The element `top` names: at its path when that is still in the block it was in, else in that block where
// it stood in it (what changed above moved the block), else that block; in no block, at its path when that
// is still in the card it was in with the id it had, else the element of that id, else that card. (The
// page's pull holds that element where it stood while it puts someone else's words in: editor/page/pull/.)
export function elementOf(doc, top) {
  const root = rootOf(doc);
  if (!root || !top) return null;
  const element = down(root, top.path);
  const id = typeof top.id === "string" ? top.id : null;
  if (id !== null) {
    if (element && blockOf(element) === id) return element;
    const block = doc.querySelector(`[data-block-id="${cssString(doc.defaultView, id)}"]`);
    const inner = block && Array.isArray(top.inner) ? down(block, top.inner) : null;
    return inner && blockOf(inner) === id ? inner : block;
  }
  const card = typeof top.card === "string" ? top.card : null;
  const name = typeof top.name === "string" && top.name ? top.name : null;
  if (element && (card === null || cardOf(element) === card) && (name === null || element.id === name)) return element;
  const named = name ? doc.getElementById(name) : null;
  if (named && root.contains(named)) return named;
  return card ? root.querySelector(`[data-card-id="${cssString(doc.defaultView, card)}"]`) : null;
}

/**
 * `win` back at `place` (placeIn's): the tabs it names shown again (a jump to a block in another tab of
 * an area showed that one), then its top element where it stood in the window, else its scroll position.
 */
export function goBackTo(win, place) {
  const tabs = place?.tabs && typeof place.tabs === "object" ? place.tabs : {};
  for (const area of win.document.querySelectorAll("[data-doc-sheets]")) {
    const key = tabs[area.getAttribute("data-doc-sheets")];
    if (typeof key === "string" && win.DocSheets?.get(area)?.get() !== key) win.DocSheets?.get(area)?.set(key);
  }
  const element = elementOf(win.document, place?.top);
  const box = element && !element.closest("dialog") ? element.getBoundingClientRect() : null;
  const x = Number(place?.x) || 0;
  if (box && box.height > 0 && Number.isFinite(place.top.at)) win.scrollTo(x, win.scrollY + box.top - place.top.at);
  else win.scrollTo(x, Number(place?.y) || 0);
}

// What the reader does that moves the page or acts on it: a wheel, a touch, a key, a press (on the scrollbar too).
const MOVES = ["wheel", "touchstart", "keydown", "pointerdown"];
const MOVED = "__galleryReaderMoved";

/**
 * A script for the page's head (the editor's, which is imported only once the page has loaded: editor/service.mjs):
 * it marks the window as the reader first moves the page (MOVES), for onReaderMove to know from the page's start.
 */
export const earlyMoveScript = `(() => { const types = ${JSON.stringify(MOVES)}; const moved = () => { window.${MOVED} = true; for (const type of types) removeEventListener(type, moved, true); }; for (const type of types) addEventListener(type, moved, { capture: true, passive: true }); })();`;

/**
 * `moved()` called once, the first time the reader moves `win`'s page themselves (MOVES; at once where they
 * have since the page started, earlyMoveScript): a page putting the reader back where they were as it is shown
 * again stops then, the reader's own scrolling winning.
 */
export function onReaderMove(win, moved) {
  if (win[MOVED] === true) return void moved();
  const heard = () => {
    for (const type of MOVES) win.removeEventListener(type, heard, true);
    moved();
  };
  for (const type of MOVES) win.addEventListener(type, heard, { capture: true, passive: true });
}

/**
 * Whether `win` stands where goBackTo put it (`put`: [x, y] then) or where the browser puts an entry's
 * scroll position back on the way back (`place`'s own x and y, Chrome's after popstate), so that a
 * second goBackTo, once what lays itself out later has, is no reader's scroll taken back.
 */
export function unmoved(win, place, put) {
  const at = (x, y) => Math.abs(win.scrollX - x) < 1 && Math.abs(win.scrollY - y) < 1;
  return at(put[0], put[1]) || at(Number(place?.x) || 0, Number(place?.y) || 0);
}
