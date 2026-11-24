import { RAIL } from "../../../shared/annotations.mjs";
import { IN_LAYER } from "../../../shared/layers.mjs";
import { NOTE_ADD_ICON } from "../../components/icons.mjs";
import { SHEETS, SURFACE, SURFACE_BODY } from "../../components/kit.mjs";
import { firstLineActs, handleOf, isLead, standsAsPicture, standsBeside } from "../../components/registry.mjs";
import { UNIT, isEmpty, isHost, nestedBlocks, unitElement, unitsOf, withLeads } from "../core.mjs";
import { atHeight, blankTarget, extentOf, hoverAt, measure, measuredNode } from "../geometry.mjs";
import { ADD, BAR, HANDLE } from "../handle-sizes.mjs";
import { kept } from "../kept.mjs";
import { ICONS } from "../menu.mjs";
import { own } from "../overlays.mjs";
import { shortcut, tooltip } from "../tooltip.mjs";
import { deviceSize, drawAt, onDevice, shapeOf } from "../overlay-layer.mjs";
import { addStyle, element, swallowNext } from "../ui.mjs";
import { nodeBefore } from "../../components/flowchart/index.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { placedIn } from "../../../shared/table-across.mjs";

// A block's handle (docs/editor.md, "Deleting blocks" and "Selecting blocks"). While the pointer
// is inside a block, or on the empty space beside it (within 150px, geometry.mjs hoverAt), a handle
// appears left of its first line: a grip (18×24, six dots of the quietest icon gray, 10px left of
// the block), filled with the hover gray while the pointer is on it. Clicking it (or the right
// button) selects the block and opens the block menu (block-menu/, where "在下方新建" makes a new
// block below); pressing it and moving more than a few pixels drags it (drag/). No "+" stands
// beside the grip all the time (the user's, 2026-10-26): while the grip is filled, a bar of its fill
// stands just left of it, in a 24px square (all of it the bar's to reach); the pointer moving
// on to the bar turns it into a "+" (no fill) and the grip's fill goes, back on the grip the other
// way round. A click on the "+" makes an empty block below the block at its level (Alt: above),
// the caret in it and the "/" menu open there (`add`: the editor's addNear, which
// knows what goes beside each block: a flowchart's node gets a node). The pointer right of a block's
// middle line (at 50% of its width, with a few pixels' slack so that a pointer resting on it leaves
// what stands there) finds its 批注 button instead (24×24, quiet gray, the same fill under the
// pointer), where a marker of that block stands
// (annotate/ markerSpot: the same place to the pixel, right of a section's strip beside the block, the
// strip pressable on the way to it): neither grip nor bar shows there, and a press annotates the block,
// or all those selected when it is one of them. A block that cannot take an annotation (one has it
// already, annotate/ annotated), whose button's place a marker stands on, or that stands beside another
// (registry.mjs standsBeside) has the handle across its whole width. A section (分区) has no handle at
// its left (its heading and a divider line at its top are blocks with handles of their own): with the
// pointer at its right side a light bar spans it, and the bar is its handle; where a table or a 多维表格 placed past the
// text (宽表格, 宽多维表格) crosses it, the bar goes on across the block as a line of round dots, which takes no pointer
// (the block keeps it there), solid again below it (crossings). A Sheet area's stands on
// its tab row, with the pointer there (its tabs are pills with no handles,
// components/sheets/pills.mjs). Typing, or scrolling by the wheel, hides the handle until the pointer
// moves (a section's bar stays). A press on a divider line (an <hr>) selects it, as its handle does
// (lineAt, blocks.mjs). The handle and the bar are drawn in the editor's own layer (overlay-layer.mjs:
// the one of the block they stand beside), never inside a block, each belonging to the block it stands
// beside (overlays.mjs). A press ends when the pointer comes up, is cancelled, or the handle loses the
// pointer capture (then a drag under way is cancelled, never dropped). On a page the editor edits, its
// side gutters (the kit's --doc-page-gutter, --doc-wide-gutter) are at least the room the
// handle takes left of a block, and a little (margin.mjs MARGIN.edge, from the page's first paint: the
// head's MARGIN_STYLE): on a narrow window the handle stands in the margin, never over the text;
// the section bar has the same room on the right. A wide window, whose column
// leaves more than that, does not change.

const STYLE = `
  .ge-handle { position: absolute; left: 0; top: 0; z-index: ${IN_LAYER.handle}; display: flex; align-items: center; height: ${HANDLE.height}px; touch-action: none; }
  .ge-grip { box-sizing: border-box; display: flex; align-items: center; justify-content: center; width: ${HANDLE.width}px; height: ${HANDLE.height}px; border-radius: var(--ge-r-small); color: var(--ge-ico3); cursor: grab; user-select: none; }
  .ge-handle[data-over="grip"] > .ge-grip { background: var(--ge-hover); }
  .ge-handle-dots { display: block; width: 10px; height: 16px; fill: currentColor; pointer-events: none; }
  /* The bar, and the "+" it turns into: reached only while the grip is filled or the "+" shows; not
     while the grip is pressed, nor while the block menu is open (data-menu: it opens left of the
     grip, over the bar's square). */
  .ge-handle-add { position: absolute; top: 0; right: 100%; display: flex; align-items: center; justify-content: center; width: ${ADD.width}px; height: ${HANDLE.height}px; color: var(--ge-ico3); cursor: pointer; pointer-events: none; }
  .ge-handle[data-over]:not([data-pressed], [data-menu]) > .ge-handle-add { pointer-events: auto; }
  /* The bar: the grip's own fill, three quarters of its height, 4px wide (the user's, 2026-10-26). */
  .ge-handle-add::before { content: ""; position: absolute; top: 3px; bottom: 3px; right: 3px; width: 4px; border-radius: 2px; background: var(--ge-hover); visibility: hidden; }
  .ge-handle[data-over="grip"]:not([data-pressed], [data-menu]) > .ge-handle-add::before { visibility: visible; }
  .ge-handle[data-narrow] > .ge-handle-add::before { right: 1px; width: 3px; } /* in a flowchart's gap (5px beside the grip): clear of the card's border before it */
  /* The editor's 20-unit plus at 20px with 1.32px lines and round ends, 12.8px across. */
  .ge-handle-add svg { display: block; flex: none; width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.32; stroke-linecap: round; visibility: hidden; pointer-events: none; }
  /* Where what is left of the grip is cut off (a detail card's edge, past which is the backdrop, where a press closes the card): its square takes half of itself, the 12px there are, and its "+" 16px, 10.5px across, its lines as heavy. */
  .ge-handle[data-tight] > .ge-handle-add { width: ${ADD.width / 2}px; }
  .ge-handle[data-tight] > .ge-handle-add svg { width: 16px; height: 16px; stroke-width: 1.65; }
  .ge-handle[data-over="add"]:not([data-menu]) > .ge-handle-add svg { visibility: visible; }
  /* A node beside the one before it in a flowchart's row: its handle in the gap between them (the
     mock's grip), the arrow under it dimmed (as under the gap's line, columns/). */
  ol.doc-flow > li[data-ge-handle-dim]::after { opacity: .15; }
  /* The 批注 button right of a block. */
  .ge-note-add { position: absolute; left: 0; top: 0; z-index: ${IN_LAYER.button}; box-sizing: border-box; display: flex; align-items: center; justify-content: center; width: ${RAIL.marker}px; height: ${RAIL.marker}px; border-radius: 6px; color: var(--ge-ico3); cursor: pointer; pointer-events: auto; user-select: none; }
  .ge-note-add:hover { background: var(--ge-hover); }
  .ge-note-add svg { display: block; width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.55; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
  /* A section's handle: a bar along its right side (the strip is wider than the bar it shows), drawn in pieces down it:
     solid strips, each the pointer's, and across a block placed past the text a stretch of dots, the block's (the bar
     itself none: the overlay layer's rule gives the pieces it). One colour, the bar's, in every piece. */
  .ge-section-bar { position: absolute; left: 0; top: 0; z-index: ${IN_LAYER.handle}; width: 16px; cursor: pointer; touch-action: none; --ge-bar-ink: light-dark(rgb(55 53 47 / 14%), rgb(255 255 255 / 14%)); }
  .ge-section-bar:hover { --ge-bar-ink: light-dark(rgb(55 53 47 / 28%), rgb(255 255 255 / 26%)); }
  .ge-section-bar[data-active] { --ge-bar-ink: color-mix(in srgb, var(--doc-accent, #2678d8) 60%, transparent); }
  .ge-section-bar-line, .ge-section-bar-dots { position: absolute; left: 0; width: 16px; }
  .ge-section-bar-line::before { content: ""; position: absolute; top: 0; bottom: 0; left: 6px; width: 4px; border-radius: 2px; background: var(--ge-bar-ink); transition: background 20ms ease-in; }
  .ge-section-bar-dots svg { display: block; overflow: visible; }
  .ge-section-bar-dots path { fill: var(--ge-bar-ink); transition: fill 20ms ease-in; }
`;

// The grip's dots: 2.5px across, 5px apart across and 6px down (not 5px down, which made the grip 2px too short: the user, 2026-10-26).
const DOTS = '<svg class="ge-handle-dots" viewBox="0 0 10 16" aria-hidden="true"><circle cx="2.5" cy="2" r="1.25"/><circle cx="7.5" cy="2" r="1.25"/><circle cx="2.5" cy="8" r="1.25"/><circle cx="7.5" cy="8" r="1.25"/><circle cx="2.5" cy="14" r="1.25"/><circle cx="7.5" cy="14" r="1.25"/></svg>';
// The dots of a section's bar across a block placed past the text: as wide as its solid line (4px, its middle 8px into
// the 16px strip), 8px from one to the next.
const DOT = { size: 4, pitch: 8, middle: 8 };
const MIDDLE_SLACK = 3; // what stands by a block's middle line stays until the pointer is this far past it
// What floats over the page and owns the pointer while it is on it: no section's strip lights up under it.
const FLOATING = ".ge-note-card, .ge-format, .ge-pop, .ge-link, .ge-fx, .ge-media-bar, .ge-picker, .ge-board-form";

// The first line of a text block left empty, where it shows: an inline one's box (a disclosure's
// title), a block's first line inside its border and padding.
function emptyLine(host) {
  const style = getComputedStyle(host);
  const box = host.getClientRects()[0];
  if (style.display.startsWith("inline")) return box;
  const top = box.top + (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.paddingTop) || 0);
  return { top, bottom: top + (parseFloat(style.lineHeight) || (parseFloat(style.fontSize) || 16) * 1.5) };
}

/**
 * info: block-info.mjs. active(): whether block tools may show. selection: selection/index.mjs.
 * drag: drag/index.mjs. menu: the menu card (menu.mjs createMenu). openMenu(target, rect, side):
 * the block menu (block-menu/). drawing(): a box selection is being drawn (selection/marquee.mjs),
 * or another gesture the handle steps aside for (a part of the block tools `busy`: a Sheet's tab
 * dragged along its row). schedule(): the block tools' next frame (blocks.mjs). keeps(node): another
 * tool's node over a block (a table's grips and the strips on its lines), where the pointer keeps the
 * handle as it is, as those tools keep themselves. add(target, where): the "+" clicked, an empty
 * block "below" the block (or "above" it: Alt) with the "/" menu open in it. notes: 批注 on blocks,
 * notes.can(units) whether they can take one, notes.at(unit) where the button beside the block stands
 * (window coordinates, null where it has none), notes.write(units) the annotation begun. aside(node):
 * a node over a block the 批注 button steps aside for while the pointer is on it (a heading's fold
 * triangle, fold/, which may stand where the button would).
 */
export function createHandle({ info, active, selection, drag, menu, openMenu, drawing, schedule, keeps = () => false, aside = () => false, add = () => {}, notes = { can: () => false, at: () => null, write: () => {} } }) {
  addStyle(STYLE);
  const { kindOf, boxKindOf } = info;
  const grip = element("div", { class: "ge-grip", role: "button", "aria-label": t("打开块菜单") });
  grip.insertAdjacentHTML("beforeend", DOTS);
  tooltip(grip, t("拖动以移动"), t("点击打开菜单"));
  const plus = element("div", { class: "ge-handle-add", role: "button", "aria-label": t("点击在下方添加块") });
  plus.insertAdjacentHTML("beforeend", ICONS.plus);
  tooltip(plus, t("点击在下方添加块"), t("{0}+点击在上方添加", shortcut("alt")));
  const handle = element("div", { class: "ge-handle" }, plus, grip);
  const note = element("div", { class: "ge-note-add", role: "button", "aria-label": t("批注"), html: NOTE_ADD_ICON });
  tooltip(note, t("批注"));
  const bar = element("div", { class: "ge-section-bar", role: "button", "aria-label": t("分区菜单") });
  tooltip(bar, t("点击打开分区菜单"), t("拖动移动分区")); // as the grip beside it
  let hovered = null; // the block under the pointer, or beside it
  let beside = null; // the pointer is on empty space: { x, y }, for the next frame to find the block beside it
  let barOver = null; // the section whose right side the pointer is at
  let barShown = null; // the section the bar stands beside
  let shown = null; // the block the handle stands beside
  let noted = null; // the block the 批注 button stands beside
  let noteWait = null; // { target, ready, timer }: a new block must stay eligible for 400 ms
  let pointer = null; // { x, y, target }: where the pointer last moved over the page, and what it was on
  let typing = false; // the handle hides while the reader types, until the pointer moves
  let still = null; // the page scrolled with the pointer here: the handle hides until it moves away
  let press = null; // the handle is pressed: { target, x, y }
  let line = { node: null, width: -1, offset: 0 }; // where the handle sits on the block's first line
  let dimmed = null; // the node whose arrow the handle stands over (nodeBefore), dimmed

  const box = extentOf; // where a block shows: a list item with its marker
  // Where a kind's handle stands is its description's (`handle`): a section's is its bar, at its right; a
  // Sheet area, a row of columns, a column and the page's icon have none the pointer finds at them
  // (their blocks have theirs: a Sheet area's is found on its tab row).
  const barred = (target) => handleOf(kindOf(target)) === "bar";
  const none = (kind) => ["bar", "none"].includes(handleOf(kind));
  // A Sheet tab stands for its area: the area's handle, on the tab row.
  const areaOf = (unit) => unit && handleOf(kindOf(unit)) === "outer" ? unitElement(unit.parentElement) : unit;

  // ---------- where it stands ----------

  // The middle of the block's first line of visible text, relative to its top (cached per width).
  function lineOffset(target, rect) {
    const width = Math.round(rect.right - rect.left);
    if (line.node === target && line.width === width) return line.offset;
    let offset = Math.min(rect.bottom - rect.top, HANDLE.height) / 2;
    const skip = '[aria-hidden="true"], .katex-mathml, svg, [hidden], [data-doc-dev]';
    for (const part of withLeads(target)) {
      // A table: its first row's first line, written or not (its first words may be rows below).
      const cell = part.matches(".doc-table-wrap") ? part.querySelector("tr > :is(td, th)") : null;
      if (cell) {
        const style = getComputedStyle(cell);
        offset = cell.getBoundingClientRect().top - rect.top + (parseFloat(style.paddingTop) || 0) + (parseFloat(style.lineHeight) || 20) / 2;
        break;
      }
      // The first line is the first words, the first picture standing as a block (an image's picture comes before its caption's words)
      // or the first text block left empty that shows (a disclosure's title not written yet: its title row, the handle
      // standing by the empty title), of the block's own content: its lead (a highlight block's icon, a picture too) is not.
      const leadKind = boxKindOf(target);
      const ownContent = (node) => { const unit = unitElement(node.nodeType === 3 ? node.parentElement : node); return unit === target || !unit || !isLead(leadKind, kindOf(unit)); };
      const blank = (node) => isHost(node) && isEmpty(node) && node.getClientRects().length > 0;
      // An item of no text over the blocks it holds: its own line, ahead of them (keepLine), where its
      // marker is, never the first line of what it holds.
      if (blank(part) && nestedBlocks(part).length > 0) {
        const own = emptyLine(part);
        offset = (own.top + own.bottom) / 2 - rect.top;
        break;
      }
      const seen = (node) => (node.nodeType === 3
        ? Boolean(node.data.trim()) && !node.parentElement?.closest(skip) && ownContent(node)
        : (standsAsPicture(node) || blank(node)) && !node.closest(skip) && ownContent(node));
      const walker = document.createTreeWalker(part, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, { acceptNode: (node) => (seen(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
      // The first words drawn: words that take no room on the page (a block's data in a <script>, a table a
      // drawing stands for, hidden) are passed by, so that a 多维表格's handle stands by its tabs, not 12px from its
      // top by the words of its data (the user's 2026-11-24).
      let text = null;
      let first = null;
      while ((text = walker.nextNode())) {
        if (text.nodeType === 1 && !blank(text)) break; // a picture: the handle stands at the block's top
        const range = document.createRange();
        range.selectNodeContents(text);
        first = text.nodeType === 1 ? emptyLine(text) : [...range.getClientRects()].find((r) => r.height > 0);
        if (first) break;
      }
      if (!text) continue;
      if (first) offset = (first.top + first.bottom) / 2 - rect.top;
      break;
    }
    line = { node: target, width, offset };
    return offset;
  }

  // Where a section's bar is crossed (宽表格, 宽多维表格: what stands past the text in it, shared/table-across.mjs placedIn,
  // reaching over `line`, the bar's line, its left and right in the window): each such block's top and bottom (client
  // coordinates), down the section, those that overlap one stretch. There the pointer is the block's, not the bar's
  // (barAt), and the bar goes on across it as dots (placeBar).
  function crossings(section, line) {
    const spans = placedIn(section).map((each) => each.getBoundingClientRect()).filter((rect) => rect.left < line.right && rect.right > line.left)
      .map((rect) => ({ top: rect.top, bottom: rect.bottom })).sort((a, b) => a.top - b.top);
    const merged = [];
    for (const span of spans) {
      const last = merged.at(-1);
      if (last && span.top <= last.bottom) last.bottom = Math.max(last.bottom, span.bottom);
      else merged.push({ ...span });
    }
    return merged;
  }

  // The bar's pieces down it, `height` tall, crossed by `spans` (relative to its top, which is `top` in the window):
  // solid strips (the pointer's; the bar of a section crossed by nothing is one) and across each block a stretch of dots
  // (no pointer: the block's). The dots are as wide as the solid line and DOT.pitch apart, a dot's gap clear of the solid
  // line's round ends, centred in their stretch; on a scaled screen each is on the same place of the device's pixels
  // (onDevice, deviceSize: 8px is ten of them at 125%, eighteen at 225%; a dot an odd number of them across has its
  // middle in the middle of one), so that every dot is drawn as the others, round and sharp. Made again only when
  // they change.
  let pieces = "";
  function drawPieces(spans, height, top) {
    const parts = [];
    let at = 0;
    const snap = (value) => onDevice(value, top); // the pieces' ends on the device's pixels too
    for (const span of spans) {
      const from = Math.max(at, Math.min(height, snap(span.top)));
      const to = Math.max(from, Math.min(height, snap(span.bottom)));
      if (to - from < 1) continue;
      if (from - at >= 1) parts.push({ dots: false, top: at, bottom: from });
      parts.push({ dots: true, top: from, bottom: to });
      at = to;
    }
    if (height - at >= 1 || parts.length === 0) parts.push({ dots: false, top: at, bottom: height });
    const ratio = globalThis.devicePixelRatio || 1;
    const size = deviceSize(DOT.size);
    const pitch = deviceSize(DOT.pitch);
    const phase = Math.round(size * ratio) % 2 === 1 ? 0.5 / ratio : 0;
    const shapes = parts.map((part) => {
      if (!part.dots) return part;
      const first = part.top + pitch - size / 2; // the first dot's middle: a gap (pitch less a dot) below the line's end
      const room = part.bottom - pitch + size / 2 - first; // to the last one's, as far above the line's end below
      const count = room < 0 ? 0 : Math.floor(room / pitch) + 1;
      const start = onDevice(first + (room - (count - 1) * pitch) / 2, top) + phase;
      return { ...part, middles: Array.from({ length: count }, (_, index) => start + index * pitch - part.top) };
    });
    const key = JSON.stringify([size, shapes]);
    if (key === pieces && bar.childElementCount === shapes.length) return;
    pieces = key;
    const radius = size / 2;
    bar.replaceChildren(...shapes.map((part) => {
      const node = element("div", { class: part.dots ? "ge-section-bar-dots" : "ge-section-bar-line" });
      Object.assign(node.style, { top: `${part.top}px`, height: `${part.bottom - part.top}px` });
      if (part.dots) {
        const circle = (y) => `M${DOT.middle - radius} ${y}a${radius} ${radius} 0 1 0 ${2 * radius} 0a${radius} ${radius} 0 1 0 ${-2 * radius} 0`;
        node.innerHTML = `<svg width="16" height="${part.bottom - part.top}" aria-hidden="true"><path d="${part.middles.map(circle).join("")}"/></svg>`;
      }
      return node;
    }));
  }

  // The bar along the right side of the section the pointer is at, or of the one dragged: at the text's right edge,
  // where it always stands, a table or a 多维表格 placed past the text in it or not (the user's, 2026-11-24: 原本就是在
  // 标准正文宽度内的就仍然是和之前一样的右边，然后仍然是竖线，并且穿过宽表，只是穿过的部分变成了圆点虚线，穿出的恢复正常), on the
  // device's pixels.
  function placeBar() {
    const picked = selection.picked;
    const candidates = [drag.target, barOver].filter((node) => node && barred(node));
    const target = candidates[0] ?? null;
    const shape = target && shapeOf(target);
    barShown = shape ? target : null;
    if (!shape) return void bar.remove();
    own(bar, "section bar", { owner: target, alive: () => barShown === target && target.isConnected });
    const { rect, origin } = shape;
    drawAt(bar, shape.layer, rect.right + BAR.gap, rect.top, origin);
    const height = Math.max(24, Math.round(rect.bottom - rect.top));
    bar.style.height = `${height}px`;
    // Where drawAt put it in the window, and its line there.
    const left = origin.left + onDevice(Math.round(rect.right + BAR.gap), origin.left);
    const top = origin.top + onDevice(Math.round(rect.top), origin.top);
    const spans = crossings(target, { left: left + DOT.middle - DOT.size / 2, right: left + DOT.middle + DOT.size / 2 });
    drawPieces(spans.map((span) => ({ top: span.top - top, bottom: span.bottom - top })), height, top);
    bar.toggleAttribute("data-active", picked.includes(target));
  }

  // The handle beside the block dragged, else the block under the pointer or beside it: it follows
  // the pointer only (a selected block has its fill, not a handle that
  // stays); none while typing, while a box selection is drawn or while a gap is dragged (between two
  // columns or two nodes of a flowchart's row: columns/).
  function placeHandle() {
    const gesture = drawing() || typing || drag.active || document.documentElement.hasAttribute("data-ge-gap-drag"); // (from outside: drop-in/)
    const candidate = drag.target ?? (gesture ? null : hovered);
    const target = candidate && !barred(candidate) && handleOf(kindOf(candidate)) !== "outer" ? candidate : null; // a tab dragged by itself has none
    const shape = target && shapeOf(target);
    // While dragging by it, the handle holds the pointer capture: it stays in the page even when the
    // dragged block is out of sight (another Sheet shown), or the drop would never come; it is
    // not moved to another layer meanwhile either (that would let the capture go).
    if (drag.active && press && (!shape || (handle.parentNode && handle.parentNode !== shape.layer))) return;
    // Right of the block's middle line its 批注 button stands for the handle (none while a menu is open
    // or blocks are dragged).
    const spot = shape && !drag.target ? noteSpot(target) : null;
    placeNote(spot && !menu?.isOpen ? target : null, shape, spot);
    const gripped = shape && !spot ? target : null;
    if (gripped !== shown) reach(null); // another block's handle: no fill, no bar until the pointer is on it
    shown = gripped;
    // A node beside the one before it in a flowchart's row: the 28px gap between them is all the room
    // there is (left of the node the grip would cover that node's corner and the arrow), so the grip
    // stands in the middle of it, the arrow under it dimmed while it shows (the mock's grip); its bar
    // and "+" stand over the corner of the node before.
    const before = shown ? nodeBefore(target) : null;
    if (dimmed !== before) {
      dimmed?.removeAttribute("data-ge-handle-dim");
      dimmed = before;
      dimmed?.setAttribute("data-ge-handle-dim", "");
    }
    if (shown) {
      own(handle, "handle", { owner: target, alive: () => shown === target && target.isConnected });
      const { rect, origin } = shape;
      const client = { left: rect.left + origin.left, top: rect.top + origin.top, right: rect.right + origin.left, bottom: rect.bottom + origin.top };
      const top = rect.top + lineOffset(target, client) - HANDLE.height / 2;
      const gap = before ? (before.getBoundingClientRect().right - origin.left + rect.left) / 2 : null; // the gap's middle, in the layer
      const left = gap !== null ? gap - HANDLE.width / 2 : Math.max(ADD.edge + ADD.width - origin.left, rect.left - HANDLE.gap - HANDLE.width); // the bar's square in from the window's edge
      handle.toggleAttribute("data-narrow", gap !== null);
      handle.toggleAttribute("data-tight", Boolean(shape.clip) && left - ADD.width < shape.clip.left);
      handle.toggleAttribute("data-menu", Boolean(menu?.isOpen));
      drawAt(handle, shape.layer, left, top);
    } else {
      reach(null);
      handle.remove();
    }
  }

  // What a press on the 批注 button beside `target` annotates: all the blocks selected when it is one of
  // them, else it alone.
  const notedBlocks = (target) => (selection.holderOf(target) ? selection.picked : [target]);

  // The blocks the pointer is at as the reader sees them: a container whose first line acts for it
  // (`firstLineActs`) and the block on that line.
  function pointedAt(target) {
    const kind = boxKindOf(target);
    const first = firstLineActs(kind) ? unitsOf(target).find((child) => !isLead(kind, kindOf(child))) : null;
    return first ? [target, first] : [target];
  }

  // Where the 批注 button beside `target` stands (annotate/ markerSpot), with the pointer right of the
  // block's middle line, or null where it has none: a block that takes an annotation, as do those
  // selected with it, standing beside nothing, nor in anything that does, with its place free.
  function noteSpot(target) {
    const rect = pointer && !aside(pointer.target) && box(target);
    if (!rect || pointer.x <= (rect.left + rect.right) / 2 + (noted === target ? -MIDDLE_SLACK : MIDDLE_SLACK)) return null;
    if (!pointedAt(target).every((unit) => notes.can([unit])) || !notes.can(notedBlocks(target))) return null;
    for (let unit = target; unit; unit = unitElement(unit.parentElement)) if (standsBeside(kindOf(unit), unit)) return null;
    return notes.at(target);
  }

  // The 批注 button beside `target` (shown by its `shape`) at `spot`, or none.
  function placeNote(target, shape, spot) {
    if (noteWait?.target !== target) {
      clearTimeout(noteWait?.timer);
      noteWait = null;
      noted = null;
      note.remove();
      if (target) {
        const waiting = { target, ready: false, timer: null };
        waiting.timer = setTimeout(() => { waiting.ready = true; schedule(); }, 400);
        noteWait = waiting;
      }
    }
    if (!target || !noteWait?.ready) return;
    noted = target;
    own(note, "note button", { owner: target, alive: () => noted === target && target.isConnected });
    drawAt(note, shape.layer, spot.left - shape.origin.left, spot.top - shape.origin.top);
  }

  // Where on the handle the pointer is: "grip" (filled, the bar beside it), "add" (the bar a "+"), or
  // null. The bar is reached only from the grip (it takes the pointer only while the grip is filled
  // or the "+" shows), so a pointer coming from the left finds the block's text, not a "+".
  function reach(where) {
    if (where) handle.setAttribute("data-over", where);
    else handle.removeAttribute("data-over");
  }
  grip.addEventListener("pointerenter", () => reach("grip"));
  grip.addEventListener("pointerleave", (event) => reach(plus.contains(event.relatedTarget) ? "add" : null));
  plus.addEventListener("pointerenter", () => { if (handle.hasAttribute("data-over")) reach("add"); });
  plus.addEventListener("pointerleave", (event) => reach(grip.contains(event.relatedTarget) ? "grip" : null));
  // A click on the "+": the block below (Alt: above), the "/" menu open in it; the handle steps
  // aside until the pointer moves. No caret moves and no box selection
  // starts on the press (blocks.mjs passes presses on the handle by).
  plus.addEventListener("pointerdown", (event) => event.preventDefault());
  plus.addEventListener("click", (event) => {
    const target = shown;
    if (!target || drag.active || !handle.hasAttribute("data-over")) return;
    menu?.close();
    reach(null);
    hovered = null;
    beside = null;
    schedule();
    swallowNext(event); // the handle has stepped aside: on the page under it the second press would take the caret out of the new block and close its menu
    add(target, event.altKey ? "above" : "below");
  });

  // A click on the 批注 button: the block annotated, or those selected with it, the button stepping
  // aside as the handle does after a click on the "+". No caret moves, no box selection starts and the
  // blocks selected stay so on the press, until the card has taken them.
  note.addEventListener("pointerdown", (event) => event.preventDefault());
  note.addEventListener("click", (event) => {
    const target = noted;
    if (!target) return;
    hovered = null;
    beside = null;
    schedule();
    swallowNext(event);
    notes.write(notedBlocks(target));
  });

  // The arrow the handle stood over shows again.
  function undim() {
    dimmed?.removeAttribute("data-ge-handle-dim");
    dimmed = null;
  }

  // ---------- which block the pointer is at ----------

  const inside = (rect, x, y, margin = 0) => rect && x >= rect.left - margin && x <= rect.right + margin && y >= rect.top - margin && y <= rect.bottom + margin;

  // The section whose right side the pointer is at: from its right edge out past its bar, along
  // its height (the innermost, when a Sheet area holds sections). The sections are kept between
  // moves (kept.mjs), not looked up in the whole page on each.
  const sections = kept(() => [...document.querySelectorAll(`main section:is(${UNIT})`)]);
  function barAt(x, y) {
    let found = null;
    for (const section of sections()) {
      if (!barred(section) || section.closest("[data-ge-dragging]")) continue;
      const rect = box(section);
      if (!rect || y < rect.top || y > rect.bottom || x < rect.right - 2 || x > rect.right + BAR.reach) continue;
      // Over a block placed past the text there (宽表格, 宽多维表格) the pointer is the block's: its cells, its scroll bar.
      if (!crossings(section, { left: x, right: x }).some((span) => y >= span.top && y <= span.bottom)) found = section;
    }
    return found;
  }

  function blockAt(target, x, y) {
    if (!target?.closest || !target.closest("main")) return null;
    // What a preview says on the page is none of it, but for a note right in a block: its top line.
    const said = target.closest("[data-doc-dev]");
    if (said && !said.parentElement.matches(UNIT)) return null;
    let unit = unitElement(target);
    // Between the blocks of a container (their margins) the nearest block wins over the
    // container; in a Sheet's tab row, the nearest tab.
    const container = target.closest("[data-ge-box]");
    // The body a surface of the document over the page shows (a database's record details) is its page: its blank
    // is the page's, the block beside it found as on the page (besideAt), never the block around it.
    if (container === target && container.parentElement?.matches(SURFACE)) return null;
    if (container === target && container.getAttribute("data-ge-box-kind") !== "nest") {
      const children = [...container.children].map((child) => unitElement(child)).filter((child) => child && child.parentElement === container);
      const row = container.matches(SHEETS.rowAt);
      const distance = (child) => {
        const rect = box(child);
        return rect ? Math.max(rect.left - x, x - rect.right, 0) + (row ? 0 : Math.max(rect.top - y, y - rect.bottom, 0)) : Infinity;
      };
      const near = children.map((child) => [child, distance(child)]).sort((a, b) => a[1] - b[1])[0];
      if (near && (row || near[1] <= 10)) unit = near[0];
    }
    unit = atPointer(unit, x, y);
    // On a tab row, the Sheet area's handle; elsewhere in the area (its frame, a panel's empty
    // space) none. A section's handle is its bar. A row of columns and its columns have
    // none: the blocks in them do, and empty space in a column finds them. The page's icon has
    // its own controls.
    if (unit && handleOf(kindOf(unit)) === "outer") return areaOf(unit);
    if (unit && none(kindOf(unit))) return null;
    return unit?.closest("main") ? unit : null;
  }

  // The divider line (an <hr>) a press is on, anywhere on its band (extentOf); null elsewhere, and
  // never over text being edited or the report's controls.
  function lineAt(target, x, y) {
    if (!target?.closest?.("main") || target.closest('[data-doc-dev], [contenteditable="true"], a, button, input, select, textarea, summary')) return null;
    for (const rule of document.querySelectorAll(`main hr:is(${UNIT})`)) {
      if (inside(box(rule), x, y)) return rule;
    }
    return null;
  }

  // The block beside empty space at the pointer (geometry.mjs hoverAt): only what reaches its
  // height is measured. Sections, Sheet areas and rows of columns have no handle there; their blocks do.
  const skip = (node) => none(node.kind);
  // `target`: what the pointer is on; in a surface of the document over the page (a database's record details), the
  // body it shows is the page, never a block behind it.
  function besideAt(x, y, target) {
    const main = target?.closest?.(SURFACE)?.querySelector(SURFACE_BODY) ?? document.querySelector("main");
    if (!main) return null;
    const top = y + scrollY;
    return atPointer(hoverAt(measure(main, { top, bottom: top }), x + scrollX, top, { skip }), x, y);
  }

  // Of a block holding blocks (a list item and its lists, a quote, a disclosure), the one at the
  // pointer's height (geometry.mjs atHeight): the handle follows the pointer's height, never the
  // outer block's first line while the pointer is by an inner one, or in
  // the gap beside one.
  function atPointer(unit, x, y) {
    if (!unit || !unit.querySelector(UNIT)) return firstOfPanel(unit);
    const root = unit.parentElement?.closest("[data-ge-box]") ?? document.querySelector("main"); // measured from the box it stands in
    if (!root) return unit;
    const top = y + scrollY;
    const node = measuredNode(measure(root, { top: top - 80, bottom: top + 80 }), unit);
    return firstOfPanel(node ? atHeight(node, x + scrollX, top, { skip }).el : unit);
  }

  // The first block of a container whose first line acts for it (its description's `firstLineActs`: a
  // highlight block's, after its icon; a callout's; a quote's) shows no
  // handle of its own: the container's stands on its line (a disclosure's is its title row).
  function firstOfPanel(el) {
    const panel = el?.parentElement;
    const kind = panel && boxKindOf(panel);
    if (!firstLineActs(kind)) return el;
    const first = unitsOf(panel).find((child) => !isLead(kind, kindOf(child)));
    return first === el ? panel : el;
  }

  // The strip between the handle and the block's left edge keeps the handle of that block, at the
  // heights where it is that block's (not by a block it holds).
  function inGutter(target, x, y) {
    const rect = box(target);
    const before = rect ? nodeBefore(target) : null; // a node beside another: the gap between them alone, not that node
    const from = before ? before.getBoundingClientRect().right : rect?.left - HANDLE.gap - HANDLE.width - 6;
    return Boolean(rect) && y >= rect.top && y <= rect.bottom && x >= from && x <= rect.left + 2
      && atPointer(target, rect.left + 2, y) === target;
  }

  // The way from a block to its 批注 button keeps the block, at the heights where it is that block's:
  // so the button stands still for a pointer going to it, past what the block holds or the hover's reach.
  function onWay(target, x, y) {
    if (noted !== target) return false;
    const rect = box(target);
    return Boolean(rect) && y >= rect.top && y <= rect.bottom && x >= rect.right - 2 && x <= note.getBoundingClientRect().right
      && atPointer(target, rect.right - 2, y) === target;
  }

  function onMove(event) {
    const { clientX: x, clientY: y, target } = event;
    // The move the browser makes up when the page stops scrolling under a still pointer is none.
    if (still && x === still.x && y === still.y) return;
    still = null;
    if (!active() || event.buttons) return;
    typing = false;
    pointer = { x, y, target };
    // The pointer on the way to a 批注's marker or button finds a section's strip, which stands left of
    // them. A card at a section's edge is the card's, and so is what floats over the page (the format bar
    // and its menus, a menu, the link and formula cards, a media block's bar, the icon picker): the strip
    // under them lit up as the pointer went over their right side.
    if (!bar.contains(target)) barOver = target?.closest?.(FLOATING) ? null : barAt(x, y);
    if (!handle.contains(target) && !note.contains(target) && !menu?.contains(target) && !bar.contains(target) && !keeps(target) && !(hovered && (inGutter(hovered, x, y) || onWay(hovered, x, y)))) {
      const block = blockAt(target, x, y);
      // On empty space, the block beside it: found on the next frame, not on every move; the handle
      // stays where it is until then, so crossing the gap between two blocks never makes it blink.
      beside = !block && blankTarget(target) ? { x, y, target } : null;
      if (!beside) hovered = block;
    }
    schedule();
  }

  // ---------- pressing it ----------

  // Pressing the handle: a click selects the block and opens its menu; moving more than a few
  // pixels drags it.
  const openAtHandle = (target) => {
    const rect = handle.getBoundingClientRect(); // the menu leaves the handle in sight
    openMenu(target, { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom });
    handle.toggleAttribute("data-menu", Boolean(menu?.isOpen)); // no bar beside the grip meanwhile
  };
  // A section's menu stands right of its bar, where it was pressed.
  const openAtBar = (target, y) => {
    const rect = bar.getBoundingClientRect();
    openMenu(target, { left: rect.left, right: rect.right, top: y - 12, bottom: y + 12 }, "right");
  };
  // A block's handle and a section's bar: a click selects the block and opens its menu, a press
  // moved more than a few pixels drags it.
  const pressable = (control, current, open) => {
    control.addEventListener("pointerdown", (event) => {
      event.preventDefault(); // no caret, no text selection
      if (event.button !== 0 || !current()) return;
      press = { target: current(), x: event.clientX, y: event.clientY };
      control.setPointerCapture?.(event.pointerId);
    });
    // A press drags once: a drag it started and that was cancelled (Esc, the focus lost) does not
    // start again as the pointer goes on moving, and letting go then does nothing.
    control.addEventListener("pointermove", (event) => {
      if (!press) return;
      if (press.dragged) {
        if (drag.active) drag.move(event.clientX, event.clientY);
        return;
      }
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 4) return;
      if (drag.start(press.target, event.clientX, event.clientY)) press.dragged = true;
      else press = null;
    });
    control.addEventListener("pointerup", (event) => {
      const pressed = press;
      press = null;
      const target = pressed && !pressed.dragged ? pressed.target : null;
      if (drag.active) drag.end(true);
      else if (target) {
        // A block among several selected (or one inside one of them: an item of a selected list)
        // keeps them selected: its menu is theirs.
        const holder = selection.holderOf(target);
        const reopen = menu.isOpen && (holder !== null || selection.picked[0] === target);
        if (holder) menu.close();
        else selection.select(target);
        if (!reopen) open(holder ?? target, event.clientY); // a second click closes the menu again
      }
    });
    control.addEventListener("pointercancel", () => {
      press = null;
      if (drag.active) drag.end(false);
    });
    // After pointerup the capture goes too (the drag has ended then); lost any other way, the press
    // is over: a drag under way is cancelled.
    control.addEventListener("lostpointercapture", () => {
      press = null;
      if (drag.active) drag.end(false);
    });
    control.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      const target = current();
      if (!target) return;
      const holder = selection.holderOf(target);
      if (!holder) selection.select(target, { quiet: true });
      open(holder ?? target, event.clientY);
    });
  };
  pressable(grip, () => shown, openAtHandle);
  // While the grip is pressed (a click, a drag) the bar stays away; the grip keeps its fill.
  grip.addEventListener("pointerdown", (event) => { if (event.button === 0) handle.setAttribute("data-pressed", ""); });
  for (const type of ["pointerup", "pointercancel", "lostpointercapture"]) grip.addEventListener(type, () => handle.removeAttribute("data-pressed"));
  pressable(bar, () => barShown, openAtBar);
  document.addEventListener("mousemove", onMove, { passive: true, capture: true });
  // Over a frame (an embed's) the moves are its own document's: reaching it is the page's last one.
  document.addEventListener("mouseover", (event) => { if (event.target?.localName === "iframe") onMove(event); }, { passive: true, capture: true });
  // Scrolling the page by the wheel (or a touchpad) hides the handle until the pointer moves; not
  // while it is pressed or dragged. Scrolling the page does itself (the caret kept in sight, a block brought into view) leaves it: that scroll's event may come after the
  // pointer has moved on to a block, and would hide the handle it just found. The keys hide it anyway
  // (typing). A section's bar stays.
  addEventListener("wheel", (event) => {
    if (press || drag.active || !hovered || scrollsInside(event)) return;
    still = { x: event.clientX, y: event.clientY };
    hovered = null;
    beside = null;
    schedule();
  }, { passive: true, capture: true });
  // A wheel over a box of the page that scrolls its way (a table's frame) scrolls that box, not the
  // page: the handle stays (it blinked as the pointer moved on while a table scrolled).
  function scrollsInside(event) {
    const down = Math.abs(event.deltaY) >= Math.abs(event.deltaX);
    for (let node = event.target instanceof Element ? event.target : null; node && node.localName !== "main" && node !== document.body; node = node.parentElement) {
      const style = getComputedStyle(node);
      const scrolls = (overflow, size, client) => (overflow === "auto" || overflow === "scroll") && size > client + 1;
      if (down ? scrolls(style.overflowY, node.scrollHeight, node.clientHeight) : scrolls(style.overflowX, node.scrollWidth, node.clientWidth)) return true;
    }
    return false;
  }
  document.documentElement.addEventListener("mouseleave", () => {
    hovered = null;
    barOver = null;
    schedule();
  });

  return {
    /** A frame: the block beside empty space found, one taken off the page forgotten. */
    track() {
      if (beside) {
        hovered = areaOf(besideAt(beside.x, beside.y, beside.target));
        beside = null;
      }
      if (hovered && !hovered.isConnected) hovered = null;
    },
    /** A frame: the bar and the handle where their blocks are now. */
    place() {
      placeBar();
      placeHandle();
    },
    /**
     * The block the pointer is at as the reader sees it, for what shows beside it but the handle (a
     * heading's fold triangle, fold/): none while dragging, typing, drawing a box or dragging a gap;
     * of a container whose first line acts for it (a highlight block), that first block.
     */
    get pointed() {
      if (drag.active || drawing() || typing || document.documentElement.hasAttribute("data-ge-gap-drag") || !hovered?.isConnected) return null;
      return pointedAt(hovered).at(-1);
    },
    /** The handle, the 批注 button or the bar shows (the frames go on). */
    get showing() { return Boolean(shown || noted || barShown); },
    /** Whether a node is part of the handle, the 批注 button or the bar. */
    holds: (node) => handle.contains(node) || note.contains(node) || bar.contains(node),
    lineAt,
    /** The pointer is on this block (a divider line pressed). */
    hover(target) {
      hovered = target;
    },
    /** Blocks taken off the page: the handle or the bar beside one goes at once (not while dragging). */
    settle() {
      if (hovered && !hovered.isConnected) hovered = null;
      if (barOver && !barOver.isConnected) barOver = null;
      if (shown && !shown.isConnected && !drag.active) {
        shown = null;
        reach(null);
        handle.remove();
      }
      if (!handle.isConnected || !dimmed?.isConnected) undim();
      if (noteWait && !noteWait.target.isConnected) placeNote(null);
      if (barShown && !barShown.isConnected) {
        barShown = null;
        bar.remove();
      }
    },
    /** The block the handle stood beside went (deleted). */
    forget() {
      hovered = null;
      barOver = null;
    },
    /** The reader is typing: the handle steps aside until the pointer moves. */
    typing() {
      typing = true;
    },
    /** The editing stops. */
    hide() {
      press = null;
      hovered = null;
      beside = null;
      barOver = null;
      shown = null;
      barShown = null;
      reach(null);
      handle.removeAttribute("data-pressed");
      handle.remove();
      placeNote(null);
      bar.remove();
      undim();
    },
  };
}
