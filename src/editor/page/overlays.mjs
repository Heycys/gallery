// What the editor draws over the page (docs/editor.md, "Overlays"): a selected block's fill, the
// handle and a section's bar, the dashed frame of the text being edited, a drag's line, tint and
// the blocks' faded copy, a box selection, a resize's lines. Each such node is registered with what it stands for
// (own: a block, or the gesture it belongs to) and a test of whether it still does (alive). The
// editor's frames audit them against that: one standing for nothing (a block no longer selected or
// on the page, a gesture over) is a bug, said once with what led to it, and the node goes, so no
// overlay is ever left behind on the screen. window.__galleryOverlays() describes them all, with
// their owners, where each is against where it should be, the frames and the recent events: what
// to look at (and copy) when something drawn looks wrong.

// own() marks each overlay node with this attribute: the audit and the snapshot go through the marked
// nodes on the page, so whatever is registered is audited, whoever draws it. The audit keeps the
// marked nodes it found (and those marked since) and goes through them: looking them up in the whole
// page after every frame took 0.2ms a frame on a long report. It looks through the page again
// whenever a node it does not hold may have come onto it (put in by anyone: a copy of an overlay, one
// taken off and put back), which an observer of what is added says (`arrivals`).
const MARK = "data-ge-overlay";

const owners = new WeakMap(); // node -> { kind, owner, alive, expected }
const owned = new Set(); // the marked nodes the audit goes through
let unknown = true; // a node `owned` does not hold may be on the page: the next audit looks through it

// Watched from an audit to the first node added that `owned` does not hold (or that holds a marked
// node), then not until the next audit: nothing to pay for while the page is built or typed in. Made
// at the first audit (this module is read without a page too: the unit tests).
let arrivals = null;
function arrived(records) {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType === 1 && (!owned.has(node) || node.querySelector(`[${MARK}]`))) return true;
    }
  }
  return false;
}
function stopWatching() {
  unknown = true;
  arrivals?.disconnect();
}
const settlers = new Set(); // what each part drops at once after a structural change
const providers = new Map(); // name -> () => state, for the snapshot
const events = []; // the last things that changed what is drawn: { t, type, detail }
const said = new Map(); // scope -> { message, time }: errors said, not said again within 5s
const errors = []; // the last errors said: { t, scope, message }
let lastStray = "";

/**
 * Register `node` as an overlay of `kind` standing for `owner` (a block, or null for a gesture);
 * alive(): whether it still stands for something (the block selected and on the page, the gesture
 * under way); expected(): where it should be now (client coordinates), when that can be told.
 */
export function own(node, kind, { owner = null, alive = () => true, expected = null } = {}) {
  owners.set(node, { kind, owner, alive, expected });
  if (node.getAttribute(MARK) !== kind) node.setAttribute(MARK, kind); // the block tools own theirs again on every frame they draw
  owned.add(node);
  return node;
}

/**
 * settle(): after a structural change (history.mjs: a change, undo, redo), at once, not on a later
 * frame, each part drops what stands for something no longer on the page (the selection its gone
 * blocks, the handle the block it stood beside, the frame the text it framed). onSettle(fn): a part's.
 */
export function onSettle(fn) {
  settlers.add(fn);
}

export function settle() {
  for (const fn of settlers) {
    try {
      fn();
    } catch (error) {
      report("settling after a change", error);
    }
  }
}

/** Something that changes what is drawn happened (selection, history, a gesture). */
export function note(type, detail = "") {
  events.push({ t: Math.round(performance.now()), type, detail: String(detail).slice(0, 160) });
  if (events.length > 30) events.shift();
}

/** A part of the editor's state for the snapshot (the frames, the block tools). */
export function provide(name, state) {
  providers.set(name, state);
}

/**
 * An error in drawing or in a gesture: said on the console (the same one at most every 5 seconds
 * per scope, never on every frame) and kept for the snapshot.
 */
export function report(scope, error) {
  const message = error?.message ?? String(error);
  const now = performance.now();
  const last = said.get(scope);
  if (last && last.message === message && now - last.time < 5000) return;
  said.set(scope, { message, time: now });
  errors.push({ t: Math.round(now), scope, message });
  if (errors.length > 10) errors.shift();
  note("error", `${scope}: ${message}`);
  console.error(`[gallery] ${scope} failed:`, error);
}

// A short description of a block or node: tag, id, the start of its text.
export function describe(node) {
  if (!node) return null;
  if (!node.localName) return String(node);
  const id = node.getAttribute?.("data-block-id");
  const text = (node.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
  return `${node.localName}${id ? `#${id}` : ""}${text ? ` "${text}"` : ""}`;
}

const rounded = (rect) => rect && { left: Math.round(rect.left), top: Math.round(rect.top), right: Math.round(rect.right), bottom: Math.round(rect.bottom) };

// How far a node's rectangle is from where it should be (the largest difference of an edge), or null.
function offBy(rect, expected) {
  if (!rect || !expected) return null;
  return Math.max(...["left", "top", "right", "bottom"].map((side) => Math.abs(rect[side] - expected[side])));
}

/** Everything drawn and what it stands for, the frames and the recent events (plain data). */
export function snapshot() {
  const overlays = [];
  for (const node of document.querySelectorAll(`[${MARK}]`)) {
    const entry = owners.get(node);
    const rect = node.getBoundingClientRect();
    const shown = !node.hidden && rect.width > 0 && rect.height > 0;
    let expected = null;
    try {
      expected = entry?.expected?.() ?? null;
    } catch {}
    let alive = null;
    try {
      alive = entry ? Boolean(entry.alive()) : null;
    } catch {}
    overlays.push({
      class: node.className,
      kind: entry?.kind ?? null,
      shown,
      rect: rounded(rect),
      owner: describe(entry?.owner),
      ownerOnPage: entry?.owner ? Boolean(entry.owner.isConnected) : null,
      alive,
      expected: rounded(expected),
      offBy: shown ? offBy(rect, expected) : null,
    });
  }
  const state = {};
  for (const [name, provider] of providers) {
    try {
      state[name] = provider();
    } catch (error) {
      state[name] = `unavailable: ${error.message}`;
    }
  }
  return { time: Math.round(performance.now()), scroll: { x: Math.round(scrollX), y: Math.round(scrollY) }, overlays, ...state, errors: [...errors], events: [...events] };
}

/**
 * The overlays standing for nothing, removed (a bug: said once, with the snapshot). Returns how
 * many there were.
 */
export function audit() {
  if (!unknown && arrived(arrivals.takeRecords())) stopWatching();
  if (unknown) {
    owned.clear();
    for (const node of document.querySelectorAll(`[${MARK}]`)) owned.add(node);
    unknown = false;
    arrivals ??= new MutationObserver((records) => {
      if (arrived(records)) stopWatching();
    });
    arrivals.observe(document.documentElement, { childList: true, subtree: true });
  }
  const strays = [...owned].filter((node) => {
    // Off the page (what puts it back is an arrival), or no longer marked (annotate/ unmarks its
    // markers as they fade out, standing for nothing): not the audit's.
    if (!node.isConnected || !node.hasAttribute(MARK)) {
      owned.delete(node);
      return false;
    }
    const entry = owners.get(node);
    try {
      return !entry || !entry.alive();
    } catch {
      return true;
    }
  });
  if (strays.length === 0) {
    lastStray = "";
    return 0;
  }
  const key = strays.map((node) => `${node.className}:${describe(owners.get(node)?.owner)}`).join(" | ");
  if (key !== lastStray) {
    lastStray = key;
    note("stray", key);
    console.error("[gallery] overlay standing for nothing (removed):", key, snapshot());
  }
  strays.forEach((node) => {
    node.remove();
    owned.delete(node);
  });
  return strays.length;
}

globalThis.__galleryOverlays = snapshot;
