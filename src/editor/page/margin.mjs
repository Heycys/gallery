import { OLD_OUTLINE_OPEN_KEY, OLD_PREFERENCES_KEY, OUTLINE_OPEN_KEY, PREFERENCES_KEY } from "../../shared/preferences.mjs";
import { LOOK_ATTRIBUTES } from "../../shared/document-look.mjs";
import { ADD, HANDLE } from "./handle-sizes.mjs";

// The right side of the page while it is edited (docs/editor.md, "The outline and the right side"): the
// outline (目录, outline/) docked at the window's right edge, the cards of 批注 (annotate/) between it and
// the column, and where the body column goes beside them. The outline is a panel at the window's right
// edge, in full (its list, 200px unless the reader dragged its guide wider or narrower: `outlineWidth`;
// the list 8px in, its guide a little further in, close to its top level's titles: outline/list.mjs
// LIST) or as its strip (36px: a short line a heading, its card shown while the pointer is
// on it), as the room allows; or as its strip wherever the reader collapsed it (a click on its guide:
// `collapsed`, the preference outlineCollapsed, until a click on the guide in the strip's card takes it
// back, which gives the list only where the room allows it).
//
// One rule places the column: in the middle of what the outline leaves of the page, as far from the
// window's left edge as from the outline (its list's edge, or its strip). With the outline the rooms at the
// column's two sides are the same, and they stay the same as the guide is dragged (each gives or takes
// half of what the list takes or gives) and as the window is resized; without it the column is
// centered in the page as ever. Each room is the edge room at least (64: the block handle at the left,
// a section's bar and the annotation markers at the right). The list keeps the width the reader gave it
// whatever the page's width does (the window resized, the workbench's sidebar dragged or sliding: its
// guide stays where it is); where the page is short of room for it, the two rooms give (down to the
// block handle's, 52), and below that the outline takes its strip, the column in the middle of what
// the strip leaves; only then does the column narrow, as the page narrows on a small window
// (MARGIN_STYLE, a rule of the page's width, so it holds while the window is resized). A report read
// full width keeps the rooms at its two sides and gives the outline its own, the list in full only
// while the column keeps 560px.
//
// A form laid out is kept for 16px under the width it needs (a scrollbar coming or a pixel of a
// resize never flips it back and forth: a full-width report's column, narrower beside the list, can
// grow taller and bring a scrollbar), the column narrower by what is short (16px at most). A form
// changes as soon as the width says, while it moves too (the sidebar dragged or sliding): the list
// comes the moment it fits and goes the moment it does not, never at the end of a drag. Nothing of it
// depends on the headings, so typing the first heading moves nothing.
//
// 批注 take what the outline leaves, never what it has: the outline's form depends on them in nothing.
// While the page has one (`notes`), their cards stand right of the column where that holds them, the
// column going left of the page's middle to give them their room. A card's room right of the column is
// 342: 10 to the card (as near as a marker stands: the user's 2026-11-12, 32 still too far), 308 of
// card, 24 past it. So on
// what the outline leaves, the column goes left of its middle by max(0, (1396 − width) / 2) (712 + 2 ×
// 342), down to the 52 of the handle's room, at 1106; below that the card gives what is short, down to
// 180, at 978 (52 + 712 + 10 + 180 + 24: a card as wide as the page leaves it, rather than a marker,
// the user's), and below that they fold back into markers in the column's right room and move nothing.
// A column read full width gives them their room at its right: it narrows by what a card takes, while
// it keeps 560. The move is a page's rule of its width as
// the rest (`--ge-card-room`, `--ge-floor`), so a window resized holds it; it slides over 200ms only
// when the page comes to have an annotation or has none left, and each width lays it out at once.
//
// Its numbers are custom properties in a sheet of their own (`--ge-outline-room`, what the outline
// takes of the page's width beside the column's rooms, `--ge-side`, the least room either side of the
// column keeps, `--ge-card-room` and `--ge-floor` as above), set from the start by the page's head
// (EARLY_MARGIN, which the edit service puts in it, saying whether the document has 批注: the page's
// width read again once its content is in, its scrollbar with it, before the kit shows it), so the
// column stands where it will stay from the first paint, and by setMargin() after that.
// When they move the column, the page hears a resize, so what stands over the text (the format bar, a
// selection's strips, a card) is placed again.
//
// The edge room is also the page's gutters (the kit's --doc-page-gutter and --doc-wide-gutter, page.css),
// set by MARGIN_STYLE, which the edit service puts in the page's head: the column the kit lets show
// (data-doc-ready, the frame a workbench swaps the page in on) stands where the editor keeps it, its lines
// broken as they stay, before the editor has started, the outline off and no 批注 as much as with them.
// (Until 2026-11-09 the handle put them in once the page edited: in a workbench with its sidebar open, a
// page 795px wide came in with the kit's 20px gutters, its column 712 wide and 42 in, and moved to 667 and
// 64 a few frames later, its lines breaking anew: the user's report on 0.1.1.)

/**
 * The numbers: the edge room (the least room either side of the column keeps, and the page's gutters:
 * the bar's square left of the block handle's grip, the grip, its gap and room to breathe, 64), the least it gives up
 * to (the block handle's: its 38px, its 12px gap, 2px), the column, the least a full-width column
 * keeps, the outline in full (its default width, the least and the most it is dragged to), its
 * list's inset in its panel (`guide`: the column's right room ends there, at the list's edge, its
 * guide's hairline LIST.guide further in, outline/list.mjs; the guide stood there
 * until 2026-11-07, the numbers kept so the forms switch at the same widths), how far left of the guide's
 * hairline its grip reaches (and how far short of the list what stands in the column's right room stays), its strip, the hysteresis; how far right of the column a card of 批注 stands (where
 * a marker stands, shared/annotations.mjs RAIL.markerAt: the button beside a block shows only where no
 * card stands, annotate/), a card's width, the least it gives up to, and the room past it (clear of the
 * outline's list: its guide and grip).
 */
export const MARGIN = Object.freeze({ edge: ADD.width + HANDLE.width + HANDLE.gap + 12, start: 52, column: 712, least: 560, full: 200, fullMin: 160, fullMax: 360, guide: 8, grip: 4, strip: 36, hysteresis: 16, lane: 10, card: 308, cardLeast: 180, cardEnd: 24 });

/**
 * The outline's width in full for the reader's choice `chosen` (px; 0 or none: the default), within
 * its least and most. Written with no outside name, so the page's head can carry it (EARLY_MARGIN).
 */
export function outlineWidth(chosen, { full = 200, fullMin = 160, fullMax = 360 } = {}) {
  return Number.isFinite(chosen) && chosen > 0 ? Math.round(Math.min(fullMax, Math.max(fullMin, chosen))) : full;
}

/**
 * Where the right side's parts go on a page `width` px wide (its window less its scrollbar): `outline`,
 * whether the outline is on, `collapsed`, whether the reader collapsed it to its strip, `notes`,
 * whether the page has 批注, `full`, its width in full (outlineWidth), `wide`, a report read full
 * width, `was`, the layout given last for the same request (a form it laid out is kept for
 * `hysteresis` px under the width it needs).
 * Returns { dock: the outline's width at the window's right edge (0, its strip's or its list's),
 * outline: its form, "full" | "strip" | null, room: what the outline takes of the page's width beside
 * the column's rooms (the list's less its inset, the strip's, 0), side: the least room either
 * side of the column keeps, left: the room at the column's left on this page, right: the room right of
 * it to the window's edge (its own and the outline's), column: its width, cards: the width of a card
 * of 批注 standing right of it (0: they fold into markers), cardRoom: what the page's rule keeps right of
 * the column for them (0: none), floor: the least room at its left }. Written with no outside name, so
 * the page's head can carry it as it is (EARLY_MARGIN).
 */
export function marginLayout({ width, outline = false, collapsed = false, notes = false, wide = false, was = null, edge = 64, start = 52, column = 712, least = 560, full = 200, guide = 8, strip = 36, hysteresis = 16, lane = 10, card = 308, cardLeast = 180, cardEnd = 24 }) {
  const body = wide ? least : column;
  // The column in the middle of what the outline leaves, its rooms `side` at least (narrower only below
  // that), and left of there as far as a card's room asks, down to `start`, the card giving what is short.
  const held = was?.cards ? hysteresis : 0; // cards laid out are kept under the width they need
  const placed = (form, dock, room, side) => {
    if (wide) {
      // Read full width: the column gives the cards their room at its right while it keeps `least`
      // (its right margin making room for them), at the side's room on its left.
      const spare = width - room - side - least - lane - cardEnd;
      const cards = notes && spare + held >= cardLeast ? Math.min(card, spare) : 0;
      const cardRoom = cards ? lane + cards + cardEnd : 0;
      const across = width - room - side - Math.max(side, cardRoom);
      return { dock, outline: form, room, side, left: side, right: width - side - across, column: across, cards, cardRoom, floor: side };
    }
    const across = Math.min(body, width - room - 2 * side);
    const middle = Math.max(side, (width - room - across) / 2);
    const spare = width - room - across - start - lane - cardEnd;
    const cards = notes && spare + held >= cardLeast ? Math.min(card, spare) : 0;
    const cardRoom = cards ? lane + card + cardEnd : 0;
    const left = cards ? Math.max(start, Math.min(middle, width - room - across - cardRoom)) : middle;
    return { dock, outline: form, room, side, left, right: width - left - across, column: across, cards, cardRoom, floor: cards ? start : side };
  };
  if (!outline) return placed(null, 0, 0, edge);
  // In full while the list, as wide as the reader gave it, leaves the column the handle's room at both
  // sides (its rooms the edge room, less down to the handle's where the page is short); a form kept
  // under the width it needs (the hysteresis) narrows the column by what is short. Else, or collapsed by
  // the reader, its strip.
  const spare = width + guide - body; // the page beside the column, the list's room counted from its edge (its inset `guide`)
  const kept = was?.outline === "full" ? hysteresis : 0;
  if (!collapsed && spare + kept >= 2 * start + full) return placed("full", full, full - guide, Math.max(start, Math.min(edge, (spare - full) / 2)));
  return placed("strip", strip, strip, edge);
}

const SLIDE = 200; // ms: the column's slide as the page comes to have 批注 or has none left

/**
 * The page's rules for the room: its gutters the edge room, and on screen the column placed (and
 * narrowed only when it must).
 */
export const MARGIN_STYLE = `
  /* The handle's room beside the page's blocks, the page's gutters from its first paint (a page the editor edits: this sheet is in the head the edit service serves); resize/ and the workbench's sidebar read --ge-edge-room. */
  :root { --ge-edge-room: ${MARGIN.edge}px; --doc-page-gutter: var(--ge-edge-room); --doc-wide-gutter: var(--ge-edge-room); }
  @media screen {
    :root[data-ge-margin] {
      /* The least room either side of the column keeps (marginLayout's side: the edge room, less where the page is short of it, down to the handle's). */
      --ge-margin-side: var(--ge-side, var(--ge-edge-room, 64px));
      /* The column as wide as the page gives it beside the outline's room and its own two (100% resolves where it is used: the page's width). */
      --ge-margin-column: min(var(--doc-content-max-width, 712px), calc(100% - var(--ge-outline-room, 0px) - 2 * var(--ge-margin-side)));
    }
    :root[data-ge-margin] .doc-page {
      width: var(--ge-margin-column);
      /* In the middle of what the outline leaves: as far from the window's left edge as from the outline; left of there as far as the cards of 批注 ask (--ge-card-room), never past --ge-floor. */
      margin-left: max(var(--ge-floor, var(--ge-margin-side)), min(calc((100% - var(--ge-outline-room, 0px) - var(--ge-margin-column)) / 2), calc(100% - var(--ge-outline-room, 0px) - var(--ge-margin-column) - var(--ge-card-room, 0px))));
      margin-right: 0;
      transition: margin-left var(--ge-slide, 0s) ease;
    }
    :root[data-ge-margin][data-doc-width="full"] .doc-page {
      /* Read full width: the cards of 批注 take their room at its right (--ge-card-room), the side's room where there are none. */
      width: calc(100% - var(--ge-outline-room, 0px) - var(--ge-margin-side) - max(var(--ge-margin-side), var(--ge-card-room, 0px)));
      max-width: none;
      margin-left: var(--ge-margin-side);
    }
  }
  /* The column sliding as the page comes to have 批注 or has none left (setMargin's notes). */
  @media screen and (prefers-reduced-motion: no-preference) {
    :root[data-ge-margin-sliding] { --ge-slide: ${SLIDE}ms; }
  }
`;

const ROOM = "data-ge-margin-room"; // the sheet holding the numbers
const EARLY = "data-ge-margin-early"; // on that sheet while the head's script holds it: what it was asked and gave (JSON)
const SLIDING = "data-ge-margin-sliding"; // on the root while the column slides
// With them, the page's area at full width (the kit's --doc-area-start and --doc-area-end, page.css: the room a
// table wider than the text may take past it, 宽表格, tables/across.js) as MARGIN_STYLE's rule of a page read
// full width has it: the side's room at its left, the outline's and the side's (or the cards') at its right; beside
// the cards of 批注 of a page read in its column, the column's right edge, as they stand right of it there; never
// inside the column.
const roomCss = ({ room, side, cardRoom = 0, floor = side, left = side, right = room + side, cards = 0 }) => `:root[data-ge-margin] { --ge-outline-room: ${room}px; --ge-side: ${side}px; --ge-card-room: ${cardRoom}px; --ge-floor: ${floor}px; --doc-area-start: ${Math.min(side, left)}px; --doc-area-end: ${Math.min(right, cards ? right : room + Math.max(side, cardRoom))}px; }`;

// The head's script (EARLY_MARGIN): the outline's room before the page shows, when the report has it
// on (`keys.open`: the reports that have it on, shared/preferences.mjs outlineOpen; `slug`: this page's), as
// wide as the reader's preferences say and in the form they chose (`keys.preferences`: outlineWidth,
// outlineCollapsed, the same for every report), and the cards' room, when it has 批注 (`notes`, the
// edit service's word).
// Never on a page opened on its own in a frame (?solo, the 写作偏好 dialog), which has none.
// In the head the page has no content yet, so no scrollbar: its width is read again at
// DOMContentLoaded, when the content is in and the kit has not shown it yet (a frame later), unless the
// editor has taken the room over by then.
function earlyMargin(layout, widthOf, numbers, keys, slug, notes, room, early, css) {
  try {
    if (new URLSearchParams(location.search).has("solo")) return;
    const read = (key, old) => localStorage.getItem(key) ?? localStorage.getItem(old); // before 2026-10-26 under its old name, not carried yet
    const open = JSON.parse(read(keys.open, keys.oldOpen) || "[]");
    const outline = Array.isArray(open) && open.includes(slug);
    if (!outline && !notes) return;
    const prefs = JSON.parse(read(keys.preferences, keys.oldPreferences) || "{}") || {};
    const asked = { outline, notes, outlineWidth: Number(prefs.outlineWidth) || 0, collapsed: prefs.outlineCollapsed === true };
    const root = document.documentElement;
    const sheet = document.createElement("style");
    sheet.setAttribute("data-doc-dev", "");
    sheet.setAttribute(room, "");
    const lay = () => {
      // The column the kit's stylesheet gives (a document's look, its 正文宽度 alone, makes it another
      // than 712px: src/shared/document-look.mjs), read as the editor reads it (numbers() below); the kit's
      // stylesheet stands before this script in the head, so it is in.
      const column = parseFloat(getComputedStyle(root).getPropertyValue("--doc-content-max-width")) || numbers.column;
      const given = layout({ ...numbers, column, width: root.clientWidth, outline, collapsed: asked.collapsed, notes, full: widthOf(asked.outlineWidth, numbers), wide: root.getAttribute("data-doc-width") === "full" });
      sheet.textContent = css(given);
      sheet.setAttribute(early, JSON.stringify({ given, asked }));
    };
    lay();
    document.head.append(sheet);
    root.setAttribute("data-ge-margin", "");
    document.addEventListener("DOMContentLoaded", () => { if (sheet.hasAttribute(early)) lay(); }, { once: true });
  } catch {}
}

/**
 * The script the edit service puts in the head of report `slug`'s page (the outline's room when that
 * report has it on: the keys it reads are shared/preferences.mjs's; the cards' room when it has 批注: `notes`).
 */
export const earlyMarginScript = (slug, { notes = false } = {}) => {
  const keys = JSON.stringify({ open: OUTLINE_OPEN_KEY, preferences: PREFERENCES_KEY, oldOpen: OLD_OUTLINE_OPEN_KEY, oldPreferences: OLD_PREFERENCES_KEY });
  const name = JSON.stringify(String(slug)).replace(/</g, "\\u003c"); // in a <script>: never a tag
  return `(${earlyMargin})(${marginLayout}, ${outlineWidth}, ${JSON.stringify(MARGIN)}, ${keys}, ${name}, ${JSON.stringify(notes)}, ${JSON.stringify(ROOM)}, ${JSON.stringify(EARLY)}, ${roomCss})`;
};

// ---------- on the page ----------

const asked = { outline: false, notes: false, outlineWidth: 0, collapsed: false }; // what the outline and 批注 ask for
const listeners = new Set();
let now = null; // the layout given last
let request = null; // what it was given for: { outline, wide } (the outline's width keeps the form laid out)
let started = false;
let lastWidth = null;
let ownResize = false; // the resize this module sends (the column moved) is no width changing
let sliding = 0; // the timer of the column's slide, while it goes

function pageWidth() {
  const root = document.documentElement;
  return root.clientWidth || innerWidth;
}

const isWide = () => document.documentElement.getAttribute("data-doc-width") === "full";

function numbers() {
  const style = getComputedStyle(document.documentElement);
  const edge = parseFloat(style.getPropertyValue("--ge-edge-room")) || MARGIN.edge;
  const column = parseFloat(style.getPropertyValue("--doc-content-max-width")) || MARGIN.column;
  return { edge, column };
}

const layoutFor = (wide, was) => marginLayout({ ...MARGIN, width: pageWidth(), ...numbers(), ...asked, full: outlineWidth(asked.outlineWidth, MARGIN), wide, was });

// The column moved without the window changing: what is placed over the page's text is placed
// again, as after a resize (this module hears it too, and finds nothing more to change).
function tell() {
  ownResize = true;
  try {
    dispatchEvent(new Event("resize"));
  } finally {
    ownResize = false;
  }
}

// `slide`: the column goes over SLIDE, frames.mjs's followers keeping what stands over the text with it
// (it goes as a transition, so they hear it); else at once, one under way ending there.
function apply({ slide = false } = {}) {
  const wide = isWide();
  const same = request && request.outline === asked.outline && request.wide === wide;
  const next = layoutFor(wide, same ? now : null);
  request = { outline: asked.outline, wide };
  const root = document.documentElement;
  let sheet = document.head.querySelector(`style[${ROOM}]`);
  sheet?.removeAttribute(EARLY); // the editor's from now on
  // The page's rule on, with these numbers: whether that changed anything.
  const rule = (layout) => {
    if (!sheet) {
      sheet = document.createElement("style");
      sheet.setAttribute("data-doc-dev", "");
      sheet.setAttribute(ROOM, "");
      document.head.append(sheet);
    }
    const css = roomCss(layout);
    const written = sheet.textContent !== css;
    if (written) sheet.textContent = css;
    const on = root.hasAttribute("data-ge-margin");
    if (!on) root.setAttribute("data-ge-margin", "");
    return written || !on;
  };
  const page = document.querySelector("main");
  if (slide && now && page && now.left !== next.left) {
    // What it slides from is a length, the page's rule on as it stands (a margin of `auto` slides nowhere).
    rule(now);
    getComputedStyle(page).marginLeft;
    root.setAttribute(SLIDING, "");
    clearTimeout(sliding);
    sliding = setTimeout(() => {
      sliding = 0;
      root.removeAttribute(SLIDING);
      apply();
      tell();
    }, SLIDE + 40);
  } else if (!slide && sliding) {
    clearTimeout(sliding);
    sliding = 0;
    root.removeAttribute(SLIDING);
  }
  let moved = false;
  if (next.dock || next.cards || sliding) moved = rule(next);
  else if (sheet || root.hasAttribute("data-ge-margin")) {
    sheet?.remove();
    root.removeAttribute("data-ge-margin");
    moved = true;
  }
  const changed = !now || ["dock", "outline", "room", "side", "cards"].some((name) => now[name] !== next[name]);
  now = next;
  if (changed) for (const listener of listeners) listener(next);
  if (moved) tell();
}

// The page's width changed (the window, or its scrollbar; the workbench's sidebar dragged or sliding):
// laid out again at once.
function resized() {
  if (ownResize) return;
  const width = pageWidth();
  if (width === lastWidth) return; // the page grew taller or shorter (the observer sees that too), or the same width told twice: nothing moves
  lastWidth = width;
  apply();
}

function start() {
  if (started) return;
  started = true;
  if (!document.head.querySelector("style[data-ge-margin-style]")) { // the edit service's head has it from the start
    const style = document.createElement("style");
    style.setAttribute("data-doc-dev", "");
    style.setAttribute("data-ge-margin-style", "");
    style.textContent = MARGIN_STYLE;
    document.head.append(style);
  }
  // What the head gave the page (the outline's form and width), kept as the
  // layout given last and as what is asked until the tools say otherwise, so the editor keeps it within
  // the hysteresis: the column does not move as the editor starts.
  let early = null;
  try { early = JSON.parse(document.head.querySelector(`style[${ROOM}][${EARLY}]`)?.getAttribute(EARLY) ?? "null"); } catch {}
  if (early?.given && early.asked) {
    now = early.given;
    Object.assign(asked, early.asked);
    request = { outline: asked.outline, wide: isWide() };
  }
  addEventListener("resize", resized);
  // The page's width changes without the window's too: its scrollbar comes or goes.
  new ResizeObserver(resized).observe(document.documentElement);
  // A report read full width, or no longer; the document's look changed (its column's width with its
  // 正文宽度, never its 字体大小: the kit's ui.js puts it on the root, src/shared/document-look.mjs).
  new MutationObserver(() => apply()).observe(document.documentElement, { attributes: true, attributeFilter: ["data-doc-width", ...Object.values(LOOK_ATTRIBUTES)] });
}

/**
 * Ask for room: { outline } (whether it shows), { outlineWidth } (its width in full as the reader
 * chose it, px; 0: the default), { collapsed } (the reader collapsed it to its strip), { notes }
 * (whether the page has 批注: the column slides when that changes it). The layout is given at once and
 * again whenever the page's width changes it.
 */
export function setMargin(part) {
  start();
  const slide = part.notes !== undefined && part.notes !== asked.notes;
  Object.assign(asked, part);
  apply({ slide });
  return now;
}

/** The layout given last ({ dock, outline, room, side, left, right, column, cards, cardRoom, floor }; see marginLayout). */
export const margin = () => now ?? layoutFor(isWide(), null);

/**
 * Whether the page's room gives the outline its list in full now, the reader's collapse aside: what a
 * click on the guide in the strip's card would bring (the whole width needed, as for any strip going up).
 */
export const listFits = () => marginLayout({ ...MARGIN, width: pageWidth(), ...numbers(), ...asked, outline: true, collapsed: false, full: outlineWidth(asked.outlineWidth, MARGIN), wide: isWide(), was: null }).outline === "full";

/** How far right of the column what stands in its right room may reach, by `layout` (marginLayout): MARGIN.grip short of the outline's list (its guide and grip further in), or of its strip, or of the window's edge. */
export const rightRoom = ({ right, room } = margin()) => right - room - MARGIN.grip;

/** Call `listener(layout)` whenever the layout changes (the outline's form or width, the column's least rooms, the cards' width). */
export function onMargin(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * The widest the outline's list can be dragged to on this page now: as wide as leaves the column its
 * edge room at both sides (the two rooms giving it half each, never the column narrowed), within its
 * least and most.
 */
export function outlineMost() {
  const { edge, column } = numbers();
  const body = isWide() ? MARGIN.least : column;
  return Math.max(MARGIN.fullMin, Math.min(MARGIN.fullMax, pageWidth() + MARGIN.guide - body - 2 * edge));
}
