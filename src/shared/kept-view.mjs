import { NEW_KEYS } from "./renamed-storage.mjs";
import { viewKey } from "./session.mjs";
import { documentKey } from "./workspace-address.mjs";

// Where a reader was in a page, kept in this tab for the next page of the same document or custom page
// (sessionStorage, which a workbench and its frames of one origin share; docs/workbench.md "Where the reader
// was"). A view is { x, y, top, … } as the editor's viewNow or reading-place.mjs placeIn gives it, `top` the
// element at the top of the window, by which the page shown again puts the reader back (goBackTo).
//   keepView   the next page of it starts there, taken once as it starts (takeView): a page asking to be
//              shown again (the editor's reloadView, a custom page's)
//   leaveView  where the reader was as the page went (its pagehide): no page starts there by itself. The
//              workbench loading anew the page it showed by itself (Vite's reload in development: a source file
//              changed, the dev server came back; its report area made again) keeps it for that page (keepLeft),
//              which starts there; the reader's own reload of the workbench (F5) starts it at its top.
//   handedView where the reader left the page earlier, which the workbench, going back to it, hands its frame
//              (the frame's data-view: the workbench's memory, state/recall.ts, not this tab's storage)
// A page alone in a tab reloaded is put back by the browser (and by its own keepView where it asked).

/** Where the reader was as a page of `slug` (a document's slug, a custom page's @<slug>) went: sessionStorage. */
export const leftKey = (slug) => `gallery-edit:${documentKey(slug)}:left`;
/** How long a left view stays good: the workbench's reload follows the page's pagehide at once; its report area made again, once the server answers again. */
export const LEFT_FOR = 10 * 60 * 1000;
// The page the workbench showed as it went (its key), for its next load to know whether that is the same page loaded anew
// (sessionStorage; the name is in renamed-storage.mjs, NEW_KEYS).
const SHOWN_KEY = NEW_KEYS.shown;

const storage = () => {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null; // a sandboxed frame, storage blocked
  }
};
const read = (key) => {
  try {
    const value = JSON.parse(storage()?.getItem(key) ?? "null");
    return value && typeof value === "object" && typeof value.y === "number" ? value : null;
  } catch {
    return null;
  }
};
const write = (key, value) => {
  try {
    if (value === null) storage()?.removeItem(key);
    else storage()?.setItem(key, JSON.stringify(value));
  } catch { /* no storage: the page starts at its top */ }
};

/** The next page of `slug` in this tab starts at `view`. */
export function keepView(slug, view) {
  write(viewKey(slug), view);
}

/**
 * The view the workbench handed this page's frame (its data-view, as JSON: where the reader left the page, the
 * workbench coming back to it; docs/workbench.md "Back where the reader left"), once (the attribute taken away), or null.
 */
export function handedView(win = globalThis) {
  try {
    const frame = win.frameElement;
    const text = frame?.getAttribute("data-view");
    if (!text) return null;
    frame.removeAttribute("data-view");
    const view = JSON.parse(text);
    return view && typeof view === "object" && typeof view.y === "number" ? view : null;
  } catch {
    return null; // a frame of another origin, words that are no view
  }
}

/**
 * The view for this page of `slug` as it starts, once, or null: the one the workbench handed its frame (handedView),
 * else the one kept for it (keepView); either way what was kept and a view it left before (leaveView) are forgotten.
 */
export function takeView(slug) {
  const handed = handedView();
  const view = read(viewKey(slug));
  write(viewKey(slug), null);
  write(leftKey(slug), null);
  return handed ?? view;
}

/** Where the reader was as this page of `slug` goes (`view`, stamped with the time). */
export function leaveView(slug, view) {
  if (view && typeof view === "object") write(leftKey(slug), { ...view, at: Date.now() });
}

/**
 * The page of `slug` shown again by the workbench without the reader asking: the view it left (leaveView), at
 * most LEFT_FOR ago, kept for it (keepView). Whether there was one; the left view is taken either way.
 */
export function keepLeft(slug, now = Date.now()) {
  const left = read(leftKey(slug));
  write(leftKey(slug), null);
  if (!left || !(now - Number(left.at) < LEFT_FOR)) return false;
  const { at, ...view } = left;
  keepView(slug, view);
  return true;
}

/**
 * The workbench's report area going (the workbench's pagehide, or the area taken down: the server not
 * answering, a hot update in development): the key of the page it shows (null: none), and `doc` the
 * workbench document's own mark (performance.timeOrigin), which tells the area made again in it from the
 * next document's; `auto` when the workbench goes because Vite reloads it (in development), not the reader.
 */
export function leaveShown(key, doc, auto = false) {
  try {
    if (typeof key === "string" && key) storage()?.setItem(SHOWN_KEY, JSON.stringify({ key, doc, auto: auto === true }));
    else storage()?.removeItem(SHOWN_KEY);
  } catch {}
}

/**
 * Vite is to load the workbench anew (in development: a source file changed, the dev server lost), heard after
 * the report area already went (leaveShown as the server stopped answering): the page it showed is shown again
 * where the reader was, as for a leaveShown with `auto`.
 */
export function shownByVite() {
  try {
    const left = JSON.parse(storage()?.getItem(SHOWN_KEY) ?? "null");
    if (left && typeof left.key === "string") storage()?.setItem(SHOWN_KEY, JSON.stringify({ ...left, auto: true }));
  } catch {}
}

/**
 * As the report area shows its first page: the key of the page it showed before (leaveShown), when the
 * workbench shows it again on its own: an area made again in the same document (`doc`), or this document
 * the reload of that one (`type`, its navigation's: PerformanceNavigationTiming's "navigate", "reload",
 * "back_forward") that Vite asked for (`auto`: the reader's F5 starts the page at its top, the user's of
 * 2026-11-20); else null. Read once.
 */
export function shownBefore(doc, type) {
  let left = null;
  try {
    left = JSON.parse(storage()?.getItem(SHOWN_KEY) ?? "null");
    storage()?.removeItem(SHOWN_KEY);
  } catch {}
  if (!left || typeof left.key !== "string") return null;
  return left.doc === doc || (type === "reload" && left.auto === true) ? left.key : null;
}
