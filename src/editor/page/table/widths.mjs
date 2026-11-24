import { SPAN } from "../../../shared/media.mjs";
import { COLUMN_WIDTH, MIN_COLUMN_WIDTH, widthOf } from "../../components/table/index.mjs";
import { relayout, tableParts, tableState } from "../../components/table/page.mjs";
import { widthHolder } from "../../../shared/table-slots.mjs";
import { ACROSS } from "../../../shared/table-across.mjs";
import { GONE_WORDS } from "../core.mjs";
import { gestureLock } from "../gesture.mjs";
import { drawBox } from "../overlay-layer.mjs";
import { hideTooltip, tooltip } from "../tooltip.mjs";
import { addStyle, element } from "../ui.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// A table's column widths (a 3px line on each column's right edge; decided 2026-10-18:
// the kit's own widths until the reader sizes a column; the line is drawn 3px, the strip that takes a press is wider: GRAB
// each side of it, 8px in all, 2026-11-20: the user found a 3px one hard to hit). Dragging a strip sizes its column (35px at
// least; the last one's, the table's right edge, snaps where the table is exactly as wide as the
// text: SNAP), shown as it goes (Esc puts it back), written when let go as one undo
// step: every column's width on the topmost cell of that column alone (--doc-column-width,
// index.mjs COLUMN_WIDTH; shared/table-slots.mjs widthHolder: a merged cell holds none), the kit laying the table
// out at them (tables/layout.js manualLayout); the first
// drag of a table the kit lays out gives every column the width it has then. A double click fits
// the column to its widest cell, unwrapped. The menus' 自动调整列宽 takes the widths off (the kit's
// again) or gives each column its width as it is; 均分列宽 shares the columns' room out equally.
// Sizing columns takes the table's own width off (--doc-span: the table is as wide as its
// columns again).
//
// The table's edges: the last column's strip covers its right edge too, a strip along its bottom
// edge is its bottom one, GRAB_BELOW below the table (not so far as the right edge's reach: a press below the table is more often meant for what is under it). A click on either arms it (a thicker line, ↔ or ↕ on it), and a drag then
// sizes the whole table, the resize tool's drag (resize/, its snapping and its label): its width
// (原宽度, 铺满正文; --doc-span, the kit filling the frame with every column in proportion:
// tables/layout.js) or its scroll height (原高度, 显示全部行; TABLE_HEIGHT, the rows past it
// scrolling under the header). Once dragged, with the pointer off it, on a press elsewhere or Esc,
// it is plain again.

const STYLE = `
  .ge-tcol { pointer-events: auto; cursor: col-resize; }
  /* A turn of the wheel over a strip went to the table under it (passWheel): the strips let the wheel through until the pointer moves. */
  :root[data-ge-wheel] :is(.ge-tcol, .ge-trows) { pointer-events: none; }
  .ge-tcol > i { position: absolute; top: 0; bottom: 0; left: 2.5px; width: 3px; border-radius: 1.5px; transition: background 150ms; }
  .ge-tcol:hover > i, .ge-tcol[data-on] > i { background: var(--ge-accent); }
  .ge-tcol[data-mode="table"] { cursor: ew-resize; }
  .ge-tcol[data-mode="table"] > i { left: 2px; width: 4px; background: var(--ge-accent); }
  .ge-tcol > b { display: none; }
  .ge-tcol[data-mode="table"] > b { position: absolute; top: 50%; left: -3.5px; display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 16px; height: 28px; margin-top: -14px; border: 1.5px solid var(--ge-accent); border-radius: 8px; background: var(--ge-bg); color: var(--ge-accent); }
  .ge-tcol[data-in] > b, .ge-trows[data-in] > b { animation: ge-tcol-in 120ms ease-out; }
  .ge-tcol > b > svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  @keyframes ge-tcol-in { from { opacity: 0; transform: scale(.7); } }
  @media (prefers-reduced-motion: reduce) { :is(.ge-tcol, .ge-trows)[data-in] > b { animation: none; } }
  .ge-trows { pointer-events: auto; cursor: pointer; }
  .ge-trows > i { position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 1.5px; transition: background 150ms; }
  .ge-trows:hover > i { background: var(--ge-accent); }
  .ge-trows[data-mode="table"] { cursor: ns-resize; }
  .ge-trows[data-mode="table"] > i { top: -0.5px; height: 4px; background: var(--ge-accent); }
  .ge-trows > b { display: none; }
  .ge-trows[data-mode="table"] > b { position: absolute; left: 50%; top: -6px; display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 28px; height: 16px; margin-left: -14px; border: 1.5px solid var(--ge-accent); border-radius: 8px; background: var(--ge-bg); color: var(--ge-accent); }
  .ge-trows > b > svg { width: 12px; height: 12px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; transform: rotate(90deg); }
  ${gestureLock("data-ge-tresize", { cursor: "col-resize", select: true })}
`;
const SNAP = 6; // px: the last column's edge within this of the width that fills the text lands on it (as the resize tool's: resize/)
const LIVE = 60000; // ms: the notice saying the table is full stays while the drag lasts (taken off when it ends)
const DOUBLE = 500; // two presses on a strip within this many ms are a double click (a press on the armed edge after its click too)
const EDGE = 8; // the last column's strip reaches this far past the table's right edge (the resize tool's grab)
const GRAB = 4; // a column's strip reaches this far each side of its line (the line is 3px: 1.5 each side of the cell's edge)
const GRAB_BELOW = 5; // the bottom edge's strip reaches this far below the table (it was EDGE, 8; 1.5 above the edge too)
const ARROWS = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M1.5 6h9M3.5 4 1.5 6l2 2M8.5 4l2 2-2 2"/></svg>';

/** t: the table tools (index.mjs); t.resizeTable(event, unit, axis) starts a drag of the table's width ("x") or height ("y") (resize/). */
export function createColumnWidths(tools) {
  addStyle(STYLE);
  let drag = null; // { unit, index, x, last, start: [px], before: Map(cell -> width), widths }
  let pressed = null; // the last press on a strip: { unit, index, time } (a second one soon after is a double click)
  let armed = null; // an edge clicked: { unit, axis: "x" (right) | "y" (bottom), at: when, shown }, the next drag of it the table's size
  let quick = null; // the armed right edge pressed soon after its click: { unit, index, x } (let go there, a double click)

  /**
   * Each column's width as the table shows it now, px: the width of its cells, not the distance
   * between their edges. A table scrolled sideways keeps its first column in sight (position: sticky,
   * tables.css: a header column or .doc-table--sticky-first), so the edges of those cells are not the
   * columns' and the column under them would read as the part of it in sight: every width then sums
   * to the frame's, the table seeming full, the columns before the border squeezed when it was pressed.
   */
  const shown = (unit) => {
    const { slots } = tableState(unit);
    if (!slots) return tools.geometry(unit).columns.map((column) => Math.round((column.right - column.left) * 100) / 100);
    const cells = [...slots.places].map(([cell, place]) => ({ ...place, width: cell.getBoundingClientRect().width }));
    const widths = Array(slots.columns).fill(null);
    for (const { c, cols, width } of cells) if (cols === 1) widths[c] ??= width;
    // A column no single cell gives a width: what the cells merged over it leave, shared out.
    for (const { c, cols, width } of cells.filter((cell) => cell.cols > 1).sort((a, b) => a.cols - b.cols)) {
      const over = Array.from({ length: cols }, (_, i) => c + i);
      const open = over.filter((i) => widths[i] === null);
      if (open.length === 0) continue;
      const left = Math.max(0, width - over.reduce((sum, i) => sum + (widths[i] ?? 0), 0));
      for (const i of open) widths[i] = left / open.length;
    }
    return widths.map((width) => Math.round((width ?? 0) * 100) / 100);
  };
  /** The cells holding the columns' widths: per column, its topmost cell alone, or null. */
  const holders = (unit) => {
    const { slots } = tableState(unit);
    return Array.from({ length: slots.columns }, (_, c) => widthHolder(slots, c));
  };

  // The table's cells that carry a width or are to: each column's holder (the widths), and any
  // other with one (a row moved down from the top keeps its widths: taken off); widths given, the
  // table's own width goes (it is as wide as its columns).
  function changesFor(unit, widths) {
    const { slots } = tableState(unit);
    const cells = [];
    const changes = [];
    if (widths && unit.style.getPropertyValue(SPAN).trim()) {
      cells.push(unit);
      changes.push({ sizes: { [SPAN]: null } });
    }
    const held = new Map(holders(unit).map((cell, c) => [cell, c]).filter(([cell]) => cell));
    for (const cell of slots.places.keys()) {
      const width = widths && held.has(cell) ? `${Math.max(MIN_COLUMN_WIDTH, Math.round(widths[held.get(cell)] * 100) / 100)}px` : null;
      if (widthOf(cell) === width) continue;
      cells.push(cell);
      changes.push({ sizes: { [COLUMN_WIDTH]: width } });
    }
    return { cells, changes };
  }

  /** The columns at `widths` (px each; null: the kit's own), one undo step. */
  function set(unit, widths, said) {
    const { cells, changes } = changesFor(unit, widths);
    if (cells.length === 0) return false;
    const done = tools.look(cells, changes);
    if (done && said) tools.say(t("{0} · Ctrl+Z 撤销", said));
    relayout(unit);
    return done;
  }

  // Shown as it goes: the holders' widths set straight (taken back before the undo step), the
  // table's own width (--doc-span) off while it lasts, as the kit would else keep the columns in
  // proportion to it and the table where it was.
  function preview(drag, widths) {
    const { unit } = drag;
    if (drag.span === undefined) {
      drag.span = unit.style.getPropertyValue(SPAN);
      unit.style.removeProperty(SPAN);
    }
    holders(unit).forEach((cell, c) => cell?.style.setProperty(COLUMN_WIDTH, `${widths[c]}px`));
    relayout(unit);
  }
  // 宽表格 (the document's look; the kit's tables/across.js): a table wider than the text stands centred on
  // its line, so a column made wider moves the table's left edge too, and the column's right edge goes half as far
  // as the pointer. Its width is brought on until that edge is under the pointer again (where it was pressed, moved
  // as far as the pointer moved): each step lays the table out at a width and reads where the edge went, the next
  // taking the width the edge moved by (twice the pointer's while the table grows on both sides, as much where the
  // page's area stops it at one side), three at most. A table in the text (its left edge where it was) needs none.
  const edgeAt = (unit, index) => tools.geometry(unit).columns[index]?.right ?? null;
  function follow(drag, widths, x) {
    const { unit, index } = drag;
    if (!unit.hasAttribute(ACROSS)) return;
    const wanted = drag.edge + (x - drag.x);
    let gain = drag.gain ?? 2;
    for (let step = 0; step < 3; step++) {
      const edge = edgeAt(unit, index);
      if (edge === null || Math.abs(wanted - edge) < 0.5) break;
      const width = Math.max(MIN_COLUMN_WIDTH, Math.round(widths[index] + (wanted - edge) * gain));
      if (width === widths[index]) break;
      const was = widths[index];
      widths[index] = width;
      preview(drag, widths);
      const moved = (edgeAt(unit, index) ?? edge) - edge;
      if (Math.abs(moved) > 0.25) gain = Math.min(4, Math.max(0.5, (width - was) / moved));
    }
    drag.gain = gain;
  }

  function putBack({ unit, before, span }) {
    for (const [cell, width] of before) {
      if (width) cell.style.setProperty(COLUMN_WIDTH, width);
      else cell.style.removeProperty(COLUMN_WIDTH);
      if (cell.getAttribute("style") === "") cell.removeAttribute("style");
    }
    if (span) unit.style.setProperty(SPAN, span);
    relayout(unit);
  }

  // The columns' widths together (px) at which the table is exactly as wide as the text (or the
  // column it stands in): the room its frame has, as the kit lays a table out at the reader's widths
  // (tables/layout.js manualLayout: a table of that width or more has the frame at 100%, one less
  // a frame as wide as it). Null where the frame has none.
  function fillOf(unit) {
    const parent = unit.parentElement;
    if (!parent) return null;
    const sides = (node) => {
      const style = getComputedStyle(node);
      return ["borderLeftWidth", "borderRightWidth", "paddingLeft", "paddingRight"].reduce((sum, name) => sum + (parseFloat(style[name]) || 0), 0);
    };
    const room = parent.getBoundingClientRect().width - sides(parent) - sides(unit);
    return room > 0 ? room : null;
  }

  // The last column's right edge is the table's: within SNAP of the width that fills the text, the
  // last column takes what the others leave of it (rounded down: never a hair past the frame).
  // True when it did. `widths` is changed in place.
  function snapFull({ last, fill, start, index }, widths) {
    if (!last || fill === null) return false;
    const rest = start.reduce((sum, width, c) => (c === index ? sum : sum + width), 0);
    const wanted = Math.floor((fill - rest) * 100) / 100;
    if (wanted < MIN_COLUMN_WIDTH || Math.abs(rest + widths[index] - fill) > SNAP) return false;
    widths[index] = wanted;
    return true;
  }
  const FULL = () => [t("表格"), t("宽度"), t("铺满正文")];

  // A column fitted to its widest cell of it alone, unwrapped (+1px): by its words, not the words an
  // Agent took out that the page shows in it (changes/: out of the layout while it is measured).
  function fit(unit, index) {
    const { slots } = tableState(unit);
    const widest = Math.max(0, ...[...slots.places].filter(([, place]) => place.c === index && place.cols === 1).map(([cell]) => {
      const style = getComputedStyle(cell);
      const was = cell.style.whiteSpace;
      const gone = [...cell.querySelectorAll(GONE_WORDS)];
      for (const mark of gone) mark.hidden = true;
      cell.style.whiteSpace = "nowrap";
      const range = document.createRange();
      range.selectNodeContents(cell);
      const width = range.getBoundingClientRect().width + parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      cell.style.whiteSpace = was;
      if (cell.getAttribute("style") === "") cell.removeAttribute("style");
      for (const mark of gone) mark.hidden = false;
      return width;
    }));
    const widths = shown(unit);
    widths[index] = Math.ceil(widest) + 1;
    set(unit, widths, t("已按内容调整列宽"));
  }

  // ---------- the strips ----------

  const isArmed = (unit, axis) => armed?.unit === unit && armed.axis === axis;
  // An armed edge's strip: its pill comes in once, not again each time the strips are drawn anew.
  function shownArmed(node) {
    node.setAttribute("data-mode", "table");
    node.toggleAttribute("data-in", !armed.shown);
    armed.shown = true;
  }
  // Plain again: the pointer off the armed edge (not pressed), or a press elsewhere.
  const offEdge = (event) => !event.target?.closest?.('.ge-tcol[data-mode="table"], .ge-trows[data-mode="table"]');
  document.addEventListener("pointermove", (event) => {
    if (!armed || drag || event.buttons || !offEdge(event)) return;
    armed = null;
    tools.draw();
  }, true);
  document.addEventListener("pointerdown", (event) => {
    if (!armed || !offEdge(event)) return;
    armed = null;
    tools.draw();
  }, true);
  function arm(unit, axis) {
    armed = { unit, axis, at: performance.now() };
    hideTooltip();
    tools.draw();
  }
  // An armed edge pressed: the resize tool's drag of the table's size; plain again. The right edge
  // pressed again soon after the click that armed it and let go where it was pressed is a double
  // click on the last column's strip: that column fitted.
  function sizeTable(event, unit, axis, index = null) {
    event.preventDefault();
    quick = axis === "x" && performance.now() - armed.at < DOUBLE ? { unit, index, x: event.clientX } : null;
    armed = null;
    tools.resizeTable(event, unit, axis);
    tools.draw();
  }
  document.addEventListener("pointerup", (event) => {
    const done = quick;
    quick = null;
    if (done && Math.abs(event.clientX - done.x) < 2) fit(done.unit, done.index);
  }, true);

  // The stretches of rows along which column `index`'s right edge is a cell's edge (not inside a
  // merged cell), [top, bottom] each; the last column's, the whole table's.
  function edgeRuns(slots, g, index, last) {
    if (last || !slots) return [[g.box.top, g.box.bottom]];
    const runs = [];
    slots.matrix.forEach((row, r) => {
      if (row[index] === row[index + 1]) return;
      if (runs.at(-1)?.end === r - 1) runs.at(-1).end = r;
      else runs.push({ start: r, end: r });
    });
    return runs.map(({ start, end }) => [g.rows[start].top, g.rows[end].bottom]);
  }

  // A strip comes under a pointer at rest as the table scrolls under it (its column's edge brought there), and then
  // took the wheel's next turns from the table, which stopped scrolling: a turn of the wheel over a strip scrolls the
  // table it stands on, and the strips let the wheel through (data-ge-wheel) until the pointer moves, so that the
  // turns after it go to the table itself, as the browser scrolls it. A motionless move the browser makes after a
  // scroll (to say again what is under the pointer) is no move.
  function passWheel(event, unit) {
    const frame = tableParts(unit).table?.closest(".doc-table-wrap");
    if (!frame || event.ctrlKey) return;
    event.preventDefault();
    const step = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? frame.clientHeight : 1;
    const sideways = event.deltaX || (event.shiftKey ? event.deltaY : 0);
    frame.scrollBy({ left: sideways * step, top: event.shiftKey ? 0 : event.deltaY * step, behavior: "instant" });
    document.documentElement.setAttribute("data-ge-wheel", "");
  }
  document.addEventListener("pointermove", (event) => {
    if ((event.movementX || event.movementY) && document.documentElement.hasAttribute("data-ge-wheel")) document.documentElement.removeAttribute("data-ge-wheel");
  }, true);

  /** The strips of the table's columns whose right edge is in sight and of its bottom edge, in the tools' layer (index.mjs draw). */
  function draw(layer, unit, g, drawn) {
    const { slots } = tableState(unit);
    g.columns.forEach((column, index) => {
      if (column.right < g.view.left || column.right > g.view.right + 1) return;
      const last = index === g.columns.length - 1;
      // Along the rows where its right edge is a cell's (not inside a merged cell).
      for (const [top, bottom] of edgeRuns(slots, g, index, last)) {
        if (bottom <= g.view.top || top >= g.view.bottom) continue;
        const node = drawn(element("div", { class: "ge-tcol", "data-doc-dev": "", role: "separator", "aria-label": last ? t("拖动调整列宽；点击后拖动调整整个表格的宽度") : t("拖动调整列宽，双击按内容调整"), html: `<i></i>${last ? `<b>${ARROWS}</b>` : ""}` }));
        if (drag?.unit === unit && drag.index === index) node.setAttribute("data-on", "");
        // The last one reaches past the table: its right edge is there too.
        drawBox(node, layer, { left: column.right - GRAB, top: Math.max(top, g.view.top), right: column.right + (last ? EDGE : GRAB), bottom: Math.min(bottom, g.view.bottom) });
        if (last && isArmed(unit, "x")) shownArmed(node);
        tooltip(node, () => (node.getAttribute("data-mode") === "table" ? t("拖动调整整个表格的宽度") : last ? t("拖动调整列宽 · 点击后可拖动调整整个表格的宽度") : t("拖动调整列宽，双击按内容调整")));
        node.addEventListener("wheel", (event) => passWheel(event, unit), { passive: false });
        node.addEventListener("pointerdown", (event) => {
          if (event.button !== 0) return;
          event.stopImmediatePropagation();
          if (last && isArmed(unit, "x")) return sizeTable(event, unit, "x", index);
          // A second press on the strip soon after the first: a double click (the strips are drawn anew between them).
          const again = pressed?.unit === unit && pressed.index === index && event.timeStamp - pressed.time < DOUBLE;
          pressed = again ? null : { unit, index, time: event.timeStamp };
          if (again) {
            event.preventDefault(); // nor its mousedown: no selection, no focus moved
            armed = null;
            return fit(unit, index);
          }
          const { rows } = tableParts(unit);
          drag = { unit, index, x: event.clientX, edge: edgeAt(unit, index) ?? event.clientX, last, fill: last ? fillOf(unit) : null, told: false, fresh: true, start: shown(unit), before: new Map(rows.flatMap((row) => [...row.cells]).map((cell) => [cell, widthOf(cell)])) };
          document.documentElement.setAttribute("data-ge-tresize", "");
          document.documentElement.setPointerCapture?.(event.pointerId);
        });
      }
    });
    // The bottom edge, in sight: a click arms it, a drag then sizes the table's scroll height.
    const node = drawn(element("div", { class: "ge-trows", "data-doc-dev": "", role: "separator", "aria-label": t("点击后拖动调整表格的高度"), html: `<i></i><b>${ARROWS}</b>` }));
    if (isArmed(unit, "y")) shownArmed(node);
    drawBox(node, layer, { left: g.view.left, top: g.view.bottom - 1.5, right: g.view.right, bottom: g.view.bottom + GRAB_BELOW });
    tooltip(node, () => (isArmed(unit, "y") ? t("拖动调整表格的高度，超出的行上下滚动") : t("点击后可拖动调整表格的高度")));
    node.addEventListener("wheel", (event) => passWheel(event, unit), { passive: false });
    node.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.stopImmediatePropagation();
      if (isArmed(unit, "y")) return sizeTable(event, unit, "y");
      event.preventDefault();
      arm(unit, "y");
    });
  }

  // The press's mousedown (the pointerdown is not cancelled, so that it comes): no selection, no
  // focus moved; one that counts two clicks (a double click sent as one press) is a fit, not a drag.
  document.addEventListener("mousedown", (event) => {
    if (!drag || drag.fresh !== true) return;
    drag.fresh = false;
    event.preventDefault();
    if (event.detail < 2) return;
    const { unit, index } = drag;
    drag = null;
    pressed = null;
    document.documentElement.removeAttribute("data-ge-tresize");
    fit(unit, index);
  }, true);

  document.addEventListener("pointermove", (event) => {
    if (!drag) return;
    // A press is a click until it moves (the last strip clicked arms the right edge).
    if (!drag.moved && Math.abs(event.clientX - drag.x) < 2) return;
    drag.moved = true;
    const widths = [...drag.start];
    widths[drag.index] = Math.max(MIN_COLUMN_WIDTH, Math.round(drag.start[drag.index] + event.clientX - drag.x));
    // The last column's edge snaps to the table that fills the text; the bottom notice says so while it holds.
    const snapped = snapFull(drag, widths);
    drag.widths = widths;
    drag.snapped = snapped;
    preview(drag, widths);
    if (!snapped) follow(drag, widths, event.clientX);
    if (snapped !== drag.told) {
      drag.told = snapped;
      if (snapped) tools.say(t("{0}{1}：{2}", ...FULL()), "note", LIVE);
      else tools.settle();
    }
    tools.draw();
  }, true);

  function end(cancel) {
    const done = drag;
    drag = null;
    document.documentElement.removeAttribute("data-ge-tresize");
    if (!done) return;
    putBack(done);
    if (done.told) tools.settle(); // the notice of the table filling the text: the result's follows, or nothing
    // Back at the widths it had, snapped to a table that was full already (or dragged out and back): nothing to write.
    const unchanged = done.widths?.every((width, c) => Math.abs(width - done.start[c]) < 0.5);
    if (!cancel && done.widths) {
      if (!unchanged && set(done.unit, done.widths) && done.snapped) tools.say(t("已调整{0}{1}：{2} · Ctrl+Z 撤销", ...FULL()));
    // The last strip clicked (pressed, not moved): the table's right edge armed.
    } else if (!cancel && done.last) return arm(done.unit, "x");
    tools.draw();
  }
  document.addEventListener("pointerup", () => end(false), true);
  document.addEventListener("pointercancel", () => end(true), true);
  document.addEventListener("keydown", (event) => {
    if ((!drag && !armed) || event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (drag) end(true);
    else {
      armed = null;
      tools.draw();
    }
  }, true);

  return {
    draw,
    /** The edges plain again (the tools no longer stand by the table). */
    disarm() { armed = null; },
    get dragging() { return drag !== null; },
    /** 自动调整列宽: the kit's widths, from the columns' words (the reader's taken off; sizing a column fixes them again). */
    fit(unit) {
      if (set(unit, null, t("已自动调整列宽"))) return true;
      tools.say(t("列宽已按内容调整，无需再调。"));
      return false;
    },
    /** 均分列宽: columns `from` … `to` (every column without them) share their room equally. */
    even(unit, from = 0, to = tableState(unit).columns - 1) {
      const widths = shown(unit);
      const share = widths.slice(from, to + 1).reduce((sum, width) => sum + width, 0) / (to - from + 1);
      for (let c = from; c <= to; c++) widths[c] = share;
      return set(unit, widths, t("已均分列宽"));
    },
  };
}
