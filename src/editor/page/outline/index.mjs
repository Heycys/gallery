import { IN_LAYER, Z } from "../../../shared/layers.mjs";
import { onOutlineOpen, onPreferences, outlineOpen, preference, setPreference } from "../../../shared/preferences.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { SHEETS } from "../../components/kit.mjs";
import { reveal } from "../folded.mjs";
import { task } from "../frames.mjs";
import { cancelOnEscape, endsGesture, gestureLock } from "../gesture.mjs";
import { MARGIN, listFits, onMargin, outlineMost, outlineWidth, setMargin } from "../margin.mjs";
import { drawOver, shapeOf } from "../overlay-layer.mjs";
import { onSettle, own } from "../overlays.mjs";
import { local } from "../storage.mjs";
import { hideTooltip, tooltipAt } from "../tooltip.mjs";
import { addStyle, element } from "../ui.mjs";
import { carryFolds, foldsOf, keepFolds } from "./folds.mjs";
import { LIST, ROW, createList } from "./list.mjs";
import { entriesOf, touchesOutline } from "./read.mjs";
import { STRIP_TOP, createStrip } from "./strip.mjs";
import { currentOf, followTop, glideFrom, keysOf, markedRow, nodesOf, pathTo, rowsOf, signatureOf, spyLine, treeOf } from "./tree.mjs";

// 目录: the page's outline at the right of the editor area (docs/editor.md, "The outline and the right side"), while the
// reader has it on for this report (the top bar's 更多 › 目录: shared/preferences.mjs outlineOpen, each
// report's own, off until switched on there; the page follows a switch at once, made in the workbench
// or in another tab of the same report). Never on a page opened on its own in a frame (?solo), in 演示视图 (no
// editor), an export or print. The editor starts it before the page's blocks are made editable
// (editor.mjs start, before enter: the headings' kinds marked from the map, core.mjs markKinds), and it
// is drawn at once, with no fade, and given a frame to show in: it comes with the page; switched on, it
// fades in; switched off, it goes at once.
//
// What it lists (read.mjs, tree.mjs): the heading blocks, nested by level, a tabs area's tabs as pills
// with their headings under them. Its form is margin.mjs's: the list in full at the window's right
// edge, the column in the middle of what it leaves (200px unless the reader dragged its guide: a quiet
// list on the page's background, a hairline guide down its left close to its top level's titles, the
// current row's segment dark on it), or, with less room, its strip (strip.mjs), which shows the list
// as a card while the pointer is on it, each of its lines lighting its own row. A form that changes after the page came is faded in (the list sliding a
// little from the right), never there all at once.
//
// - A click on a heading's row scrolls the page smoothly (at once with reduced motion; from more than
//   two windows away at once to a window short of it, gliding the rest) to put the heading 24px below
//   the window's top, as 演示视图's 上一节/下一节, then lights it for a moment (a quiet gray, in the
//   overlay layer of its block; gone with the heading, or once it is hidden). A hidden tab is shown
//   first, a closed disclosure opened (reading state: nothing is saved). The row is current at once and
//   stays so until the page has moved 40px from where the jump left it. The reader taking the page over
//   during the jump (the wheel, a key that scrolls, the scrollbar, a press in the page) ends it there:
//   it never pulls the page back. A tab's row shows that tab and scrolls to its tab row.
// - A jump leaves the text: its selection goes (the format bar with it, which stood over the heading
//   gone to). Chosen by the pointer, the page is the reader's: the focus leaves the outline (the keys
//   that read scroll the page, a letter types nothing; a click in the text edits there). Chosen by a key
//   (Enter, Space), the focus stays in the tree, where PageUp/PageDown scroll the page. Esc leaves the
//   tree: for the caret where it was while no jump has moved the page, else for the page where it is.
// - The current heading (the spy): the one furthest down, of those with a box on the page, whose top
//   has passed a line min(120px, 30% of the window) below the window's top, the first in order of those
//   level with it (headings side by side in columns); none above the first. Over the page's last window
//   the line comes down with the scroll to the window's bottom (tree.mjs spyLine), so the last short
//   sections each get their turn. Inside a folded row, that row is marked. The list keeps the current
//   row at most a third of its clear view down (the rows to come below it) and two rows from its top
//   at least, scrolling (smoothly) as little as that takes; not while the pointer is over it, or the
//   reader scrolled it in the last 1.5s (the pointer gone after that, a row scrolled out of sight is
//   brought back). The wheel over it scrolls it, and at its ends the page.
// - A triangle at a parent's left folds or unfolds it (a folded one always shows it; an open one while
//   the pointer is over the rows or the keyboard is in the list, the guide fading out meanwhile: each
//   just short of its title, a top-level one on the guide, the titles never moving); what is folded is kept for the report (folds.mjs), so the page the workbench shows again after an Agent's write folds the same, and
//   follows a heading whose key changes (one with no block id, keyed by its text, typed in or given its
//   id as it is saved). The top level's headings are bold.
// - Its guide line, dragged, makes the list wider or narrower (160 to 360px, as far as the room lets
//   it while the column keeps its edge room at both sides), the column staying in the middle of what
//   it leaves (margin.mjs: its two rooms giving or taking half each); let go, the width is the
//   reader's for every report (shared/preferences.mjs outlineWidth); Esc puts it back.
// - Its guide line clicked (pressed and let go before the pointer went CLICK px across, the sidebar's
//   edge's rule) collapses the list to its strip, even where the room gives the list: the reader's for
//   every report, as the width (outlineCollapsed, which the page's head reads too: margin.mjs). The
//   guide in the strip's card clicked takes it back: the list in full where the room allows it
//   (margin.mjs listFits), else the strip stays (never forced) and the list comes once there is room.
//   Each guide says so in a tooltip by the pointer (a tall target), the card's why nothing opened.
// - It follows the page as it changes (one reading a frame at most, the rows drawn again only when
//   what they show changed): headings typed, renamed, added, deleted, moved, undone, tabs renamed or
//   shown; not while an input method composes (its letters are no title yet: read once it commits).
//   It is the editor's own UI (data-doc-dev): a press on it starts no box selection, the handle
//   does not show by it, and while a block is dragged or a box drawn it lets the pointer through.

const DOCK = { top: 52, left: MARGIN.guide, right: 8 }; // the list's room in the dock: below the page's top room, from 8px in (where the column's right room ends: margin.mjs; its guide LIST.guide further in), 8px short of the scrollbar
const CARD = 56; // the strip's card: as wide as the list chosen, and this much more
const CARD_PAD = 8; // and its list this far in from its left edge (as far in as the card's right padding)
const GUIDE_FADE = 120; // ms the guide fades out as the triangles show, and in as they go (at once with reduced motion: the kit's base.css)
// The pointer's rest after it left the rows (for the grip, or along the guide from one top-level triangle to another,
// across the grip between them) before the triangles go and the guide comes back (the grip's darker bar comes as late).
const LEAVE = 120;
// What shows the triangles and fades the guide: the pointer on a row (its triangle included), the keys in the list (the
// focus seen). The pointer on the list but on no row (its gutter, left of the grip) shows nothing: crossing it to the grip
// changes nothing.
const OVER = ":has(.ge-outline-row:hover), :focus-visible, :has(:focus-visible)";
const GRIPS = ".ge-outline-grip, .ge-outline-card-grip"; // the guide's grips (in the list's scroller, the card's)
const ENTER = { ms: 160, slide: 8 }; // the list in full coming after the page did: faded in, sliding this far from the right
const RESIZING = "data-ge-outline-resize"; // on the document element while the guide is dragged
const CLICK = 3; // px across the pointer goes on the guide before a press is a drag, not a click (the workbench's sidebar edge: Sidebar.tsx Resizer)
const JUMP_TOP = 24; // a heading's top after a jump, below the window's
const STAY = 40; // px the page moves after a jump before the heading gone to stops being the current one
const FOLLOW_QUIET = 1500; // ms after the reader scrolled the list, it is not scrolled to the current row
const FOLLOW_LEAST = 2 * ROW; // the current row at least two rows below the list's clear top (tree.mjs followTop)
const FADE = { top: 24, bottom: 32 }; // the list's faded ends while there is more (STYLE)
const PAGE = 0.875; // PageUp/PageDown in the tree scroll the page by this much of the window, as the browser's do
const LINE = 40; // and ↑/↓ by this much, with the focus on the page after a press in the list (as the browser does)
const FLASH = { hold: 600, fade: 600 };
const UI_FONT = `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Helvetica, "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;
// The current row and the tabs' pills in a medium weight where the system's Chinese face has one
// (PingFang, on Apple's systems). Elsewhere (Microsoft YaHei has none) 500 draws a title's Latin words in
// Segoe's semibold beside regular Chinese, so they keep 400 there: the color and the guide's segment
// mark the current row, the fill the tab shown.
const MEDIUM = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? "") ? 500 : 400;
// The keys that scroll the page: pressed during a jump, the reader takes the page over.
const SCROLL_KEYS = new Set(["PageUp", "PageDown", "Home", "End", " ", "ArrowUp", "ArrowDown"]);

const STYLE = `
  .ge-outline, .ge-outline-strip, .ge-outline-card { font: 400 14px/22px ${UI_FONT}; color: var(--ge-tx2); -webkit-user-select: none; user-select: none; }
  .ge-outline svg, .ge-outline-strip svg, .ge-outline-card svg { display: block; width: 100%; height: 100%; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
  .ge-outline[hidden], .ge-outline-strip[hidden], .ge-outline-card[hidden] { display: none; }

  /* The dock: fixed at the window's right edge, its whole height, the list from the page's top room down; only the list and its guide take the pointer. */
  /* The right edges of the dock, the strip and the card are in from the window's by the page's scrollbar room while a detail card holds the page still (the kit's dialog.css, --doc-page-bar; 0 otherwise): they stay where they were. */
  .ge-outline { position: fixed; top: 0; right: var(--doc-page-bar, 0px); bottom: 0; z-index: ${Z.outline}; width: ${MARGIN.full}px; box-sizing: border-box; padding: ${DOCK.top}px ${DOCK.right}px 0 ${DOCK.left}px; display: flex; flex-direction: column; pointer-events: none; }
  .ge-outline-frame { position: relative; flex: 0 1 auto; min-height: 0; display: flex; flex-direction: column; }
  /* The list scrolls by itself with no scrollbar (none to move its rows as it comes and goes, none beside the page's own): its fades say there is more; the wheel and a touch move it, and at its ends go on to the page (no wheel trapped over it). */
  .ge-outline-scroll { flex: 0 1 auto; min-height: 0; overflow-y: auto; scrollbar-width: none; }
  .ge-outline-scroll::-webkit-scrollbar { display: none; }
  .ge-outline-frame > .ge-outline-scroll { padding-bottom: 24px; pointer-events: auto; }
  .ge-outline-scroll[data-more="up"] { -webkit-mask-image: linear-gradient(transparent, #000 24px); mask-image: linear-gradient(transparent, #000 24px); }
  .ge-outline-scroll[data-more="down"] { -webkit-mask-image: linear-gradient(#000 calc(100% - 32px), transparent); mask-image: linear-gradient(#000 calc(100% - 32px), transparent); }
  .ge-outline-scroll[data-more="up down"] { -webkit-mask-image: linear-gradient(transparent, #000 24px, #000 calc(100% - 32px), transparent); mask-image: linear-gradient(transparent, #000 24px, #000 calc(100% - 32px), transparent); }
  /* The guide's grip (MARGIN.grip left of its hairline, 5px right): dragged, the list wider or narrower; clicked, the list collapsed to its strip; under the pointer (a moment after it came) and while dragged, the guide a wider, darker bar. It stands in the list's scroller, placed by the frame (the card), so it lies under a top-level triangle shown (z-index): that triangle, its row's, takes its own box; the grip the rest of the guide (rows with no triangle shown, above and below one), and every one hidden (visibility: no target). */
  .ge-outline-grip, .ge-outline-card-grip { position: absolute; z-index: 1; width: 9px; pointer-events: auto; }
  .ge-outline-grip { left: ${LIST.guide - MARGIN.grip}px; top: 0; bottom: 24px; cursor: col-resize; }
  .ge-outline-grip::after, .ge-outline-card-grip::after { content: ""; position: absolute; left: 3px; top: 4px; bottom: 4px; width: 3px; border-radius: 2px; transition: background-color 120ms ease; }
  .ge-outline-grip:hover::after, .ge-outline-card-grip[data-fits]:hover::after { background: var(--ge-line-strong); transition-delay: 120ms; }
  :root[${RESIZING}] .ge-outline-grip::after { background: color-mix(in srgb, var(--ge-tx3) 70%, transparent); transition-delay: 0s; }
  :root[${RESIZING}] .ge-outline-scroll { pointer-events: none; }
  ${gestureLock(RESIZING, { cursor: "col-resize", select: true })}

  /* The list (list.mjs LIST): a hairline guide a little in from its left edge, close to the top level's titles, the current row's segment darker on it, the lit row's blue (whole pixels: crisp at any scale); the rows from right of the guide (a top-level one's fill reaching across it to take in its triangle: below). */
  .ge-outline-list { position: relative; padding-left: ${LIST.row}px; outline: none; }
  .ge-outline-list::before { content: ""; position: absolute; left: ${LIST.guide}px; top: 4px; bottom: 4px; width: 1px; background: var(--ge-line-strong); }
  .ge-outline-list[data-empty]::before { display: none; }
  .ge-outline-mark { position: absolute; left: ${LIST.guide - 1}px; top: 0; width: 2px; height: 16px; border-radius: 1px; background: var(--ge-tx); pointer-events: none; }
  .ge-outline-mark[data-hot] { background: var(--ge-accent); }
  .ge-outline-mark[hidden] { display: none; }
  /* While the pointer is on the rows or the keys are in the list (OVER), the triangles show and the guide (its hairline, its segments) fades out at once; the rows left, it comes back a moment later (LEAVE), so the pointer going along the guide from one top-level triangle to another, across the grip, keeps them. */
  .ge-outline-list::before, .ge-outline-list > .ge-outline-mark { transition: opacity ${GUIDE_FADE}ms ease ${LEAVE}ms; }
  .ge-outline-list:is(${OVER})::before, .ge-outline-list:is(${OVER}) > .ge-outline-mark { opacity: 0; transition-delay: 0s; }
  .ge-outline-row { position: relative; display: flex; align-items: center; height: ${ROW}px; box-sizing: border-box; padding: 0 6px 0 calc(${LIST.text}px + var(--ge-depth, 0) * ${LIST.step}px); border-radius: var(--ge-r-ctl); cursor: pointer; white-space: nowrap; outline: none; }
  .ge-outline-text { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
  /* A row's fill (under the pointer, the keys' focus, lit from the strip, pressed) takes in its triangle's column: it starts at the row's left (2px clear of the hairline) or ${LIST.step + LIST.text - LIST.twist - LIST.gap}px left of the column, whichever is further left (that room is what a second-level row's fill leaves left of its triangle). Only a top-level row's column stands left of the row (across the guide), so only its fill reaches further, a step (LIST.step) further left, past the hairline, its triangle in the grey as a deeper one is (the user's of 2026-11-07), a leaf's as its siblings'. That part is the row's shadow, no target: the pointer there is still the list's gutter or the grip. */
  .ge-outline-row { --ge-row-fill: transparent; background: var(--ge-row-fill); box-shadow: min(0px, calc((var(--ge-depth, 0) - 1) * ${LIST.step}px)) 0 var(--ge-row-fill); }
  .ge-outline-row:is(:hover, :focus-visible, [data-hot]) { color: var(--ge-tx); --ge-row-fill: var(--ge-hover); }
  .ge-outline-row:active { --ge-row-fill: var(--ge-press); }
  .ge-outline-row[data-current] { color: var(--ge-tx); font-weight: ${MEDIUM}; }
  /* The top level's headings bold: at the top, or right under a tab (its pill keeps its own look). */
  .ge-outline-row[data-top] { font-weight: 600; }
  /* The triangle at a parent's left, out of the row's flow (its title where a leaf's is), in its indentation just short of its title, at every level the same: a top-level one on the guide, over its grip (above it: z-index). A folded one always shows (pointing right), an open one (pointing down) while the pointer is on the rows or the keys are in the list (the focus seen: a fold by the pointer leaves the focus on its row, unseen; the timing above). No grey under the pointer, only while pressed. */
  .ge-outline-twist { position: absolute; z-index: 2; top: ${(ROW - 16) / 2}px; left: calc(var(--ge-depth, 0) * ${LIST.step}px + ${LIST.text - LIST.twist - LIST.gap}px); width: ${LIST.twist}px; height: 16px; border-radius: 4px; color: var(--ge-tx3); }
  .ge-outline-twist svg { width: 16px; margin-left: ${(LIST.twist - 16) / 2}px; fill: currentColor; transition: transform 200ms ease-out; }
  .ge-outline-twist:hover { color: var(--ge-tx2); }
  .ge-outline-twist:active { background: var(--ge-press); }
  .ge-outline-row[aria-expanded="true"] .ge-outline-twist svg { transform: rotate(90deg); }
  .ge-outline-row[aria-expanded="true"] .ge-outline-twist { visibility: hidden; transition: visibility 0s linear ${LEAVE}ms; }
  .ge-outline-list:is(${OVER}) .ge-outline-row[aria-expanded="true"] .ge-outline-twist { visibility: visible; transition-delay: 0s; }
  /* A tabs area's tab: its name as a pill at the rows' size (its text in line with the rows beside it), the tab shown filled as the page's pills, the others in the secondary gray, no line (no outlined control: the user's rule). */
  .ge-outline-row[data-kind="tab"] .ge-outline-text { margin-left: -4px; }
  .ge-outline-tab { display: inline-block; max-width: 100%; box-sizing: border-box; height: 22px; padding: 0 6px; border-radius: 6px; overflow: hidden; text-overflow: ellipsis; vertical-align: top; font-weight: ${MEDIUM}; line-height: 22px; color: var(--ge-tx2); }
  .ge-outline-row[data-shown] .ge-outline-tab { background: var(--ge-hover); color: var(--ge-tx); }
  .ge-outline-row[data-shown]:is(:hover, :focus-visible, [data-hot]) .ge-outline-tab { background: transparent; }
  .ge-outline-empty { padding: 4px 0 4px ${LIST.text}px; color: var(--ge-tx3); white-space: normal; }

  /* The strip: short lines, each its own target: the one under the pointer blue, longer and thicker. */
  .ge-outline-strip { position: fixed; top: 0; right: var(--doc-page-bar, 0px); bottom: 0; z-index: ${Z.outline}; width: ${MARGIN.strip}px; pointer-events: none; }
  .ge-outline-ticks { position: absolute; top: ${STRIP_TOP}px; right: 4px; width: 28px; box-sizing: border-box; display: flex; flex-direction: column; align-items: flex-end; gap: var(--ge-tick-gap, 6px); padding: 8px 6px; border-radius: 6px; cursor: pointer; pointer-events: auto; outline: none; }
  .ge-outline-ticks:focus-visible { background: var(--ge-hover); }
  .ge-outline-ticks i { display: block; flex: none; width: var(--ge-tick, 16px); height: 2px; border-radius: 1px; background: var(--ge-line-strong); transform-origin: right center; transition: width 120ms ease-out, transform 120ms ease-out, background-color 120ms ease-out; }
  .ge-outline-ticks:is(:hover, :focus-visible, [aria-expanded="true"]) i { background: color-mix(in srgb, var(--ge-tx3) 75%, transparent); }
  .ge-outline-ticks i[data-current] { background: var(--ge-tx); }
  .ge-outline-ticks i[data-hot] { width: calc(var(--ge-tick, 16px) + 6px); background: var(--ge-accent); transform: scaleY(1.5); }
  .ge-outline-none { display: block; width: 16px; height: 16px; color: var(--ge-tx3); }
  /* Its card: the list over the page beside the strip, its top level with the strip's lines, the menus' surface; the list scrolls inside it, faded at its ends as in full. */
  .ge-outline-card { position: fixed; z-index: ${Z.menu}; top: ${STRIP_TOP}px; right: calc(${MARGIN.strip + 4}px + var(--doc-page-bar, 0px)); width: ${MARGIN.full + CARD}px; max-height: calc(100vh - ${STRIP_TOP + 16}px); box-sizing: border-box; display: flex; flex-direction: column; padding: 8px 8px 8px ${CARD_PAD}px; border-radius: var(--ge-r-card); background: var(--ge-bg); box-shadow: var(--ge-shadow-card); }
  /* Its guide's grip (about the hairline, CARD_PAD + LIST.guide in; in the card's scroller as the dock's is in its own, under a top-level triangle shown): clicked, the list in full again; a hand and the darker bar only where the room allows it (data-fits). */
  .ge-outline-card-grip { left: ${CARD_PAD + LIST.guide - MARGIN.grip}px; top: 8px; bottom: 8px; }
  .ge-outline-card-grip[data-fits] { cursor: pointer; }

  /* While a block is dragged, a box drawn, text selected across blocks or something resized, the outline lets the pointer through. */
  :root:is([data-ge-drag], [data-ge-marquee], [data-ge-cross], [data-ge-resize], [data-ge-gap-drag], [data-ge-tdrag], [data-ge-tresize], [data-ge-tcells]) :is(.ge-outline-scroll, .ge-outline-ticks, .ge-outline-grip, .ge-outline-card-grip) { pointer-events: none; }

  /* A heading lit for a moment after a jump: its fill's shape, a quiet gray. */
  .ge-outline-flash { z-index: ${IN_LAYER.tint}; pointer-events: none; background: var(--ge-outline-flash); }

  @media print { .ge-outline, .ge-outline-strip, .ge-outline-card { display: none; } }
`;

const still = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
const editableAt = (node) => (node?.nodeType === 1 && node.closest?.('[contenteditable="true"]')) || null;
const shown = (node) => Boolean(node?.isConnected && node.getClientRects().length > 0);

let made = null; // the page's outline: one

/** slug: the report's (what is folded is kept under it). Returns { holds(target): a node of the outline, shown: whether it shows (in full or as its strip) }. */
export function createOutline({ slug }) {
  if (made) return made;
  const main = document.querySelector("main");
  if (!main) return { holds: () => false, shown: false };
  addStyle(STYLE);

  let on = outlineOpen(slug); // this report's switch (off until switched on here)
  let chosen = preference("outlineWidth"); // the list's width in full as the reader dragged it (0: the default)
  let collapsed = preference("outlineCollapsed"); // the reader collapsed the list to its strip (a click on its guide)
  let form = null; // the form shown: "full", "strip" or null
  let tree = [];
  let rows = [];
  let heads = []; // the heading nodes in the outline's order
  let drawnSignature = null; // what the rows drawn show (tree.mjs signatureOf), and with which folds
  let dirty = true; // the page changed: read it again
  const folded = foldsOf(local, slug);
  const keyOfRef = new WeakMap(); // a node's element -> its key read last (a fold follows a key that changes)
  let chosenKey = null; // the heading a click went to: current until the page moves STAY from where it landed
  let jumping = false; // a jump's scroll under way (from the click until it lands)
  let jumps = 0; // jumps begun (a frame's start of one taken over meanwhile, or followed by another, does nothing)
  let landedAt = null; // the page's scrollY where the jump landed
  let settling = null; // the jump's scroll waiting for its end: (arrived) => void ends it
  let markedKey = null; // the node marked last (to keep it in view only when it changes)
  let pointerIn = false;
  let listScrolled = 0; // when the reader last scrolled the list
  let returnTo = null; // { host, range }: where the caret was when the outline took the focus
  let composing = false; // an input method composing: its letters are no title yet
  let flashing = null; // { node, heading }: the heading lit after a jump

  const list = createList({ jump: go, fold: toggle, escape: giveBack, page: (direction) => page(direction) });
  // The grip in the scroller, before the list, placed by the frame (it neither scrolls nor counts in what
  // scrolls): in one stacking context with the rows' triangles (the scroller's, masked at its ends), so a
  // top-level one shown stands over it (STYLE).
  const grip = element("div", { class: "ge-outline-grip", role: "separator", "aria-orientation": "vertical", "aria-label": t("拖动调整目录宽度") });
  const scroller = element("div", { class: "ge-outline-scroll" }, grip, list.node);
  const dock = element("nav", { class: "ge-outline", "aria-label": t("目录"), "data-doc-dev": "", hidden: "" }, element("div", { class: "ge-outline-frame" }, scroller));
  const strip = createStrip({
    list,
    opened: () => frames.wake(),
    closed: () => frames.wake(),
    escape: () => giveBack(),
    choose: (index) => { if (rows[index]) go(rows[index].node); },
  });
  document.body.append(dock, strip.strip, strip.card);

  // ---------- reading the page ----------

  function read() {
    tree = treeOf(entriesOf(main));
    const nodes = nodesOf(tree);
    const moves = [];
    for (const node of nodes) {
      if (!node.ref) continue;
      const before = keyOfRef.get(node.ref);
      if (before !== undefined && before !== node.key) moves.push([before, node.key]);
      keyOfRef.set(node.ref, node.key);
    }
    if (carryFolds(folded, moves)) keepFolds(local, slug, folded, keysOf(tree));
    heads = nodes.filter((node) => node.kind === "heading");
    rows = rowsOf(tree, folded);
  }

  // The heading the reader is at (tree.mjs currentOf), of those with a box on the page; the line it
  // must pass comes down over the page's last window (spyLine: the last short sections each get their turn).
  function spied() {
    const tops = heads.map((node) => (node.ref?.isConnected ? node.ref.getClientRects()[0]?.top ?? null : null));
    const line = spyLine({ scrollY, maxScroll: document.documentElement.scrollHeight - innerHeight, view: innerHeight, base: Math.min(120, innerHeight * 0.3) });
    const at = currentOf(tops, line);
    return at >= 0 ? heads[at] : null;
  }

  function currentNode() {
    if (chosenKey !== null) {
      const chosen = heads.find((node) => node.key === chosenKey);
      if (shown(chosen?.ref)) return chosen; // not one a tab switched since has hidden
      chosenKey = null;
    }
    return spied();
  }

  // One frame: the page read again when it changed (not while an input method composes), the rows
  // drawn when what they show did, the current row marked, the strip's lines, the edges of the list.
  function run() {
    if (!form) return false;
    if (dirty && !composing) {
      dirty = false;
      read();
      const signature = `${signatureOf(tree)}\u0003${[...folded].join("\u0001")}`;
      if (signature !== drawnSignature) {
        drawnSignature = signature;
        list.render(rows, folded, -1);
        markedKey = null;
      } else list.update(rows);
    }
    if (flashing && !shown(flashing.heading)) unflash(); // its heading hidden (a tab switched) or gone
    const current = currentNode();
    const marked = markedRow(rows, current && pathTo(tree, current), folded);
    list.mark(marked);
    if (form === "strip") strip.draw(rows, marked);
    const key = rows[marked]?.node.key ?? null;
    if (key !== markedKey) {
      const first = markedKey === null;
      markedKey = key;
      follow(marked, { smooth: !first });
    }
    edges();
    return false;
  }
  const frames = task("outline", {
    run,
    fail: () => { drawnSignature = null; dirty = true; },
  });
  const wake = () => { if (form) frames.wake(); };

  // The list scrolled to keep the current row in its band (tree.mjs followTop: at most a third of the
  // way down, so reading down the rows to come fill the rest; two rows from the top at least), as little
  // as that takes; not while the pointer is over the outline or the reader just scrolled it. `hidden`:
  // only when the row is out of the list's clear view (the reader's own scroll kept while it shows).
  function follow(index, { smooth = true, hidden = false } = {}) {
    const box = form === "full" ? scroller : strip.open ? strip.scroll : null;
    const row = list.rowAt(index);
    if (!box || !row || pointerIn || Date.now() - listScrolled < FOLLOW_QUIET) return;
    const frame = box.getBoundingClientRect();
    const rect = row.getBoundingClientRect();
    if (hidden && rect.top >= frame.top + FADE.top && rect.bottom <= frame.bottom - FADE.bottom) return;
    const top = rect.top - frame.top + box.scrollTop;
    const to = followTop({ top, row: ROW, scrollTop: box.scrollTop, view: box.clientHeight, full: box.scrollHeight, least: FOLLOW_LEAST, fade: FADE });
    if (to !== null) box.scrollTo({ top: to, behavior: smooth && !still() ? "smooth" : "instant" });
  }

  // The pointer gone from the outline: once the list has been left alone FOLLOW_QUIET, it comes back to
  // the current row if the reader scrolled it out of sight (the wheel over it).
  let backTimer = 0;
  function backSoon() {
    clearTimeout(backTimer);
    backTimer = setTimeout(() => { if (!pointerIn) follow(list.marked, { hidden: true }); }, Math.max(0, FOLLOW_QUIET - (Date.now() - listScrolled)) + 50);
  }

  // The list's fades at its ends while there is more above or below (in full, or in the strip's card).
  function edges() {
    const box = form === "full" ? scroller : strip.open ? strip.scroll : null;
    if (!box) return;
    const more = [];
    if (box.scrollTop > 1) more.push("up");
    if (box.scrollTop + box.clientHeight < box.scrollHeight - 1) more.push("down");
    const value = more.join(" ");
    if ((box.getAttribute("data-more") ?? "") !== value) {
      if (value) box.setAttribute("data-more", value);
      else box.removeAttribute("data-more");
    }
  }

  // The grips stand in the scrollers but are not the list (placed by the frame, the card): the wheel over one scrolls the page.
  const onList = (target) => holds(target) && !target.closest?.(GRIPS) ? target.closest?.(".ge-outline-scroll") ?? null : null;
  for (const box of [scroller, strip.scroll]) {
    box.addEventListener("scroll", edges, { passive: true });
    for (const type of ["wheel", "touchmove"]) box.addEventListener(type, (event) => { if (onList(event.target)) listScrolled = Date.now(); }, { passive: true });
  }
  for (const node of [dock, strip.strip, strip.card]) {
    node.addEventListener("pointerenter", () => { pointerIn = true; });
    node.addEventListener("pointerleave", () => { pointerIn = false; backSoon(); wake(); });
  }

  // ---------- folding ----------

  function toggle(node) {
    if (folded.has(node.key)) folded.delete(node.key);
    else folded.add(node.key);
    keepFolds(local, slug, folded, keysOf(tree));
    dirty = true;
    frames.wake();
  }

  // ---------- going to a heading ----------

  // The page scrolled to put `target` JUMP_TOP below the window's top; `then(end, wanted)` once the
  // scroll is over (`end`: the scrollY it went for, `wanted`: where the target was then, unclamped).
  // More than two windows away, the page goes at once to a window short of it and glides the rest
  // (tree.mjs glideFrom: the browser's glide over 14000px took 1.5s). Over means: at its end, or no
  // longer moving towards it (a scrollend, or 1.5s gone by, then looked at again while it still moves:
  // a slow machine's glide is waited for, the reader's scroll is not).
  function scrollToTarget(target, then) {
    settling?.(false);
    const top = Math.round(target.getBoundingClientRect().top + scrollY - JUMP_TOP);
    const end = Math.max(0, Math.min(top, document.documentElement.scrollHeight - innerHeight));
    let timer = 0;
    const done = (arrived = true) => {
      if (settling !== done) return;
      settling = null;
      clearTimeout(timer);
      removeEventListener("scrollend", check);
      if (arrived) then?.(end, top);
    };
    function check() {
      if (settling !== done) return;
      const left = Math.abs(scrollY - end);
      if (left < 1) return done(true);
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (Math.abs(scrollY - end) < left - 0.5) timer = setTimeout(check, 250); // still on its way
        else done(true);
      }, 60);
    }
    settling = done;
    if (Math.abs(end - scrollY) < 1) {
      done(true);
      return;
    }
    const from = still() ? null : glideFrom(scrollY, end, innerHeight);
    if (from !== null) scrollTo({ top: from, behavior: "instant" });
    addEventListener("scrollend", check);
    timer = setTimeout(check, 1500);
    scrollTo({ top: end, behavior: still() ? "instant" : "smooth" });
  }

  // Scrolled to `target`, and again while it is not there yet and the page can still go (what was just
  // shown lays itself out as the page scrolls: a tab's tables, a disclosure's content), then `then()`.
  // A scroll that ended somewhere else than it went for, the page laid out as it was, was the reader's
  // (the scrollbar): the jump ends there, never pulling the page back. One the page's layout moved (the
  // browser keeping what was in view where it was as a tab's tables laid themselves out above it) lands
  // again. While it goes, the list says so (data-going: the browser scenarios wait for it).
  function land(target, then, tries = 0) {
    jumping = true;
    list.node.setAttribute("data-going", "");
    scrollToTarget(target, (end, wanted) => {
      const max = document.documentElement.scrollHeight - innerHeight;
      const clamped = end > max && scrollY >= max - 1; // the page got shorter meanwhile: as far as it goes
      const shifted = Math.abs(Math.round(target.getBoundingClientRect().top + scrollY - JUMP_TOP) - wanted) > 1;
      if (Math.abs(scrollY - end) > 1 && !clamped && !shifted) return stopJump();
      const off = Math.round(target.getBoundingClientRect().top) - JUMP_TOP;
      const room = off > 0 ? max - scrollY : scrollY;
      if (Math.abs(off) > 2 && room > 1 && tries < 3 && target.isConnected) return land(target, then, tries + 1);
      jumping = false;
      list.node.removeAttribute("data-going");
      then?.();
    });
  }

  // The jump ended before it landed: the page is the reader's, the spy says where they are.
  function stopJump() {
    settling?.(false);
    jumping = false;
    chosenKey = null;
    landedAt = null;
    list.node.removeAttribute("data-going");
    wake();
  }

  function unflash() {
    flashing?.node.remove();
    flashing = null;
  }

  function flash(heading) {
    unflash();
    const shape = shown(heading) ? shapeOf(heading) : null;
    if (!shape) return;
    const node = element("div", { class: "ge-outline-flash", "data-doc-dev": "" });
    const entry = { node, heading };
    own(node, "outline-flash", { owner: heading, alive: () => flashing === entry && heading.isConnected });
    drawOver(node, shape, { x: 4, y: 2, radius: 4 });
    flashing = entry;
    setTimeout(() => {
      if (flashing !== entry) return;
      const gone = () => { if (flashing === entry) unflash(); };
      const fade = still() ? null : node.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: FLASH.fade, easing: "ease-in", fill: "forwards" });
      if (fade) fade.onfinish = gone;
      else gone();
    }, FLASH.hold);
  }
  // After a change of the page (history: a change, an undo, a redo), at once: a heading lit and gone with it is let go.
  onSettle(() => { if (flashing && !shown(flashing.heading)) unflash(); });

  // A jump leaves the text: its selection goes (the format bar, a selection's strips with it: they stood
  // over the heading gone to), and Esc has no caret to give back (the page is where the reader went).
  function leaveText() {
    returnTo = null;
    const selection = getSelection();
    if (selection.rangeCount && main.contains(selection.anchorNode)) selection.removeAllRanges();
  }

  // `keyboard`: chosen by Enter or Space, the focus stays in the tree; by the pointer, the page is the
  // reader's: the focus leaves the outline (the keys that read scroll the page, a letter types nothing).
  function go(node, { keyboard = false } = {}) {
    const jump = ++jumps;
    const begin = (target, then) => requestAnimationFrame(() => { if (jump === jumps && jumping) land(target, then); });
    if (node.kind === "tab") {
      const area = node.ref?.closest(SHEETS.match);
      if (!area) return;
      const key = node.ref.getAttribute(SHEETS.tabKey);
      reveal([...area.children].find((child) => child.getAttribute(SHEETS.panelKey) === key) ?? area);
      chosenKey = null;
      landedAt = null;
      jumping = true;
      begin(node.ref.closest(SHEETS.rowAt) ?? area);
    } else {
      const heading = node.ref;
      if (!heading?.isConnected) return;
      reveal(heading); // a fold hiding it opened, not its own (fold/)
      chosenKey = node.key;
      landedAt = null;
      jumping = true;
      begin(heading, () => {
        landedAt = scrollY;
        flash(heading);
      });
    }
    leaveText();
    // Chosen by a key, the card closes (the focus back on the strip); by the pointer, it stays while the pointer is on it.
    if (strip.open && (keyboard || (!strip.keyed && !pointerIn))) strip.closeCard({ focus: keyboard });
    if (!keyboard) toPage();
    frames.wake();
  }

  // The focus on the page itself, out of the outline and the text: a letter types nothing, the keys that
  // read scroll the page (below), the editor's keys for the page (undo, select-all) are the page's.
  function toPage() {
    const active = document.activeElement;
    if (active && active !== document.body && (holds(active) || main.contains(active))) active.blur();
  }

  // With the focus on the page itself after a press in the list (a jump by the pointer), the browser
  // scrolls the list with the keys that read (it scrolls what holds the focus, else what was pressed
  // last): the page is scrolled instead, by what those keys scroll it with nothing pressed there.
  let pressedInList = false;
  document.addEventListener("pointerdown", (event) => { pressedInList = Boolean(event.target?.closest?.(".ge-outline-scroll")); }, true);
  addEventListener("keydown", (event) => {
    if (!pressedInList || event.defaultPrevented || document.activeElement !== document.body || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const step = Math.round(innerHeight * PAGE);
    const by = event.shiftKey ? (event.key === " " ? -step : undefined) : { PageDown: step, PageUp: -step, " ": step, ArrowDown: LINE, ArrowUp: -LINE }[event.key];
    const behavior = still() ? "instant" : "smooth";
    if (by !== undefined) scrollBy({ top: by, behavior });
    else if (!event.shiftKey && (event.key === "Home" || event.key === "End")) scrollTo({ top: event.key === "Home" ? 0 : document.documentElement.scrollHeight, behavior });
    else return;
    event.preventDefault();
  });

  // PageUp/PageDown in the tree: the page scrolls, as with the focus on it (the list, with no scrollbar, is not paged).
  function page(direction) {
    scrollBy({ top: direction * Math.round(innerHeight * PAGE), behavior: still() ? "instant" : "smooth" });
  }

  // The reader taking the page over during a jump: the wheel or a touch (not on the outline's own
  // list), a key that scrolls the page (not the rows' own keys), a press in the page or on its scrollbar.
  const takeOver = () => { if (jumping) stopJump(); };
  // The wheel over the list scrolls it, and at its end in the wheel's way the page: then it is the reader's.
  const listEnd = (box, down) => (down ? box.scrollTop + box.clientHeight >= box.scrollHeight - 1 : box.scrollTop <= 0);
  addEventListener("wheel", (event) => {
    const box = onList(event.target);
    if (!box || listEnd(box, event.deltaY > 0)) takeOver();
  }, { passive: true, capture: true });
  addEventListener("touchstart", (event) => { if (!holds(event.target)) takeOver(); }, { passive: true, capture: true });
  addEventListener("keydown", (event) => {
    if (!jumping || !SCROLL_KEYS.has(event.key)) return;
    if (list.holds(event.target) && event.key !== "PageUp" && event.key !== "PageDown") return;
    takeOver();
  }, true);
  addEventListener("pointerdown", (event) => { if (!holds(event.target)) takeOver(); }, true);
  // After it landed, the heading gone to stays current until the page has moved STAY px.
  addEventListener("scroll", () => {
    if (!jumping && chosenKey !== null && (landedAt === null || Math.abs(scrollY - landedAt) > STAY)) {
      chosenKey = null;
      landedAt = null;
    }
    wake();
  }, { passive: true });

  // ---------- the focus ----------

  // The caret's place when the outline takes the focus from the text, given back by Esc.
  document.addEventListener("focusin", (event) => {
    if (!holds(event.target)) return;
    const host = editableAt(event.relatedTarget);
    if (!host || holds(host)) return;
    const selection = getSelection();
    const range = selection.rangeCount ? selection.getRangeAt(0) : null;
    returnTo = { host, range: range && host.contains(range.startContainer) ? range.cloneRange() : null };
  }, true);

  function giveBack() {
    if (strip.open) {
      strip.closeCard({ focus: true });
      return;
    }
    const back = returnTo;
    returnTo = null;
    if (back?.host?.isConnected) {
      back.host.focus({ preventScroll: true });
      if (back.range) {
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(back.range);
      }
    } else toPage();
  }

  // ---------- shown or not, in which form ----------

  // The outline in the form the room gives it (null: none), the list as wide as the room gives it. Drawn
  // at once as the page comes (no frame shows it empty); a form coming after that fades in (`fade`);
  // one going goes at once (the reader switching it off too). The focus in it stays in it as its form
  // changes (on its row in full, on the strip's button).
  function show(layout, { fade = false } = {}) {
    if (layout.outline === "full") dock.style.width = `${layout.dock}px`;
    const next = on ? layout.outline : null;
    if (next === form) return;
    const active = document.activeElement;
    const focusedRow = list.node.contains(active) ? Number(active.closest?.(".ge-outline-row")?.dataset.index ?? -1) : -1;
    const hadFocus = holds(active);
    const was = form;
    form = next;
    if (was === "full") dock.hidden = true;
    if (was === "strip") strip.show(false);
    if (form === "full") {
      if (list.node.parentNode !== scroller) scroller.append(list.node);
      for (const animation of dock.getAnimations?.() ?? []) animation.cancel();
      dock.hidden = false;
      if (fade && !still()) dock.animate?.([{ opacity: 0, transform: `translateX(${ENTER.slide}px)` }, { opacity: 1, transform: "none" }], { duration: ENTER.ms, easing: "ease-out" });
    } else if (form === "strip") strip.show(true, { fade });
    if (!form) return;
    dirty = true;
    markedKey = null;
    try {
      run();
    } catch {
      drawnSignature = null;
      dirty = true;
      frames.wake(); // drawn by the loop, which says what went wrong
    }
    if (hadFocus) {
      if (form === "full") list.focus(focusedRow >= 0 ? focusedRow : Math.max(0, list.marked));
      else strip.focusButton();
    }
  }

  // The strip's card as wide as the list chosen, and a little more.
  const cardWidth = () => { strip.card.style.width = `${outlineWidth(chosen, MARGIN) + CARD}px`; };
  cardWidth();

  // Shown in the form the room gives it as the editor starts, at once (it comes with the page), then
  // as the room changes (the window, the list's width, the reader's collapse) and switched on or off by
  // the reader, faded in (switched off, gone at once). Another page of the origin dragging the list's
  // width or collapsing it (every report's): followed. This report's outline switched by another page (the workbench's top bar,
  // the report in another tab): followed; another report's switch changes nothing here.
  show(setMargin({ outline: on, outlineWidth: chosen, collapsed }));
  onMargin((layout) => show(layout, { fade: true }));
  onPreferences(() => {
    const fold = preference("outlineCollapsed");
    if (fold !== collapsed) {
      endSizing(false);
      collapsed = fold;
      setMargin({ collapsed });
    }
    const width = preference("outlineWidth");
    if (width === chosen || sizing) return;
    chosen = width;
    cardWidth();
    setMargin({ outlineWidth: chosen });
  });
  onOutlineOpen(() => {
    const next = outlineOpen(slug);
    if (next === on) return;
    on = next;
    show(setMargin({ outline: on }), { fade: true });
  });

  // ---------- the width, collapsed ----------

  // The guide dragged: the list wider or narrower as the pointer goes (the column staying in the middle
  // of what it leaves: margin.mjs), within 160px and what leaves the column its edge room at both sides
  // (outlineMost), once the pointer has gone CLICK px across (let go short of that, it was a click: the
  // list collapsed); let go, the
  // width is the reader's (every report, every page of the origin); Esc, the window losing the focus or
  // the pointer taken away put it back.
  let sizing = null; // { x, width, most, now, before, moved }
  grip.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || form !== "full") return;
    event.preventDefault();
    const width = Math.round(dock.getBoundingClientRect().width);
    sizing = { x: event.clientX, width, most: Math.max(width, outlineMost()), now: width, before: chosen, moved: false };
    try { document.documentElement.setPointerCapture(event.pointerId); } catch {}
    document.documentElement.setAttribute(RESIZING, "");
  });
  document.documentElement.addEventListener("pointermove", (event) => {
    if (!sizing) return;
    if (!sizing.moved && Math.abs(event.clientX - sizing.x) < CLICK) return;
    sizing.moved = true;
    const width = Math.round(Math.max(MARGIN.fullMin, Math.min(sizing.most, sizing.width + sizing.x - event.clientX)));
    if (width === sizing.now) return;
    sizing.now = width;
    setMargin({ outlineWidth: width });
  });
  // Let go where it began (or never moved): nothing chosen, the width chosen before laid out again (the
  // drag gave the layout the width shown, narrower than the one chosen where the room is short). Let go
  // before it moved: a click, the list collapsed.
  function endSizing(keep) {
    if (!sizing) return;
    const { now, before, width, moved } = sizing;
    sizing = null;
    document.documentElement.removeAttribute(RESIZING);
    if (keep && !moved) setCollapsed(true);
    else if (!keep || now === width) setMargin({ outlineWidth: before });
    else {
      chosen = now;
      setPreference("outlineWidth", now);
      cardWidth();
    }
  }
  document.documentElement.addEventListener("pointerup", () => endSizing(true));
  endsGesture({ active: () => Boolean(sizing), cancel: () => endSizing(false) });
  cancelOnEscape({ active: () => Boolean(sizing), cancel: () => endSizing(false) });

  // The reader's collapse, kept for every report and every page of the origin (the page's head reads it
  // before the page shows); the form is the room's to give (margin.mjs): taken back where the room is
  // short, the strip stays and the list comes once there is room.
  function setCollapsed(value) {
    if (value === collapsed) return;
    collapsed = value;
    setPreference("outlineCollapsed", value);
    setMargin({ collapsed: value });
  }

  // A tooltip by the pointer on a guide (a tall target: over where the pointer rests, as the
  // workbench's sidebar edge has it), once it has rested there a moment; none while the guide is pressed.
  const tipAt = (event, text, hint) => tooltipAt({ left: event.clientX, right: event.clientX, top: event.clientY, bottom: event.clientY, width: 0, height: 0 }, text, hint);
  function guideTip(node, says) {
    const rest = (event) => {
      if (sizing || event.buttons || document.querySelector(".ge-tip")) return; // shown: it stays where it came
      tipAt(event, ...says());
    };
    node.addEventListener("pointerenter", rest);
    node.addEventListener("pointermove", rest);
    node.addEventListener("pointerleave", hideTooltip);
    node.addEventListener("pointerdown", hideTooltip);
  }
  const waiting = () => t("页面不够宽，变宽后展开");
  guideTip(grip, () => [t("收起目录"), t("拖动调整宽度")]);
  // The card's guide: a hand and its darker bar only where the room gives the list (data-fits), else
  // its tooltip says why a click opens nothing (the list comes once there is room).
  const fits = () => {
    const now = listFits();
    strip.guide.toggleAttribute("data-fits", now);
    return now;
  };
  guideTip(strip.guide, () => [t("展开目录"), fits() ? null : waiting()]);
  strip.guide.addEventListener("pointerenter", fits);
  strip.guide.addEventListener("click", (event) => {
    if (event.button !== 0 || form !== "strip") return;
    const room = fits();
    setCollapsed(false);
    if (!room) tipAt(event, t("展开目录"), waiting());
  });


  // The page changing: read again on the next frame when it may change what is listed (one reading
  // a frame however much changed; words typed elsewhere only move the headings: the current one again).
  // Off, nothing is read (showing it reads the page anew).
  new MutationObserver((records) => {
    if (!form) return;
    if (touchesOutline(records)) dirty = true;
    wake();
  }).observe(main, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "open", "aria-selected", "data-block-id", "data-sheet-tab", "data-ge-unit-kind"] });
  // Where the headings are changes without a scroll too (a picture loaded, a disclosure opened, the window resized).
  new ResizeObserver(wake).observe(main);
  addEventListener("resize", wake);
  // An input method composing: what it types is read once it commits (compositionend; Chrome does
  // not always send one, editor.mjs compositionOver: a key, an input or a press that is no part of one ends it too).
  const composed = () => {
    if (!composing) return;
    composing = false;
    wake();
  };
  document.addEventListener("compositionstart", () => { composing = true; }, true);
  document.addEventListener("compositionend", composed, true);
  for (const type of ["keydown", "input"]) document.addEventListener(type, (event) => { if (composing && !event.isComposing && event.keyCode !== 229) composed(); }, true);
  document.addEventListener("pointerdown", composed, true);

  function holds(target) {
    return Boolean(target?.nodeType === 1 && (dock.contains(target) || strip.holds(target)));
  }
  made = { holds, get shown() { return form !== null; } };
  return made;
}
