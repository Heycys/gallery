import { colorLook } from "../../components/colors.mjs";
import { TABLE } from "../../components/kit.mjs";
import { SPAN } from "../../../shared/media.mjs";
import { lookRow } from "../../components/rows.mjs";
import { GRID, NUMBERS, TABLE_HEIGHT } from "../../components/table/index.mjs";
import { tableOf } from "../../components/table/grid.mjs";
import { columnRange, duplicateColumns, duplicateRows, insertColumn, insertRow, mergeCells, moveColumn, moveRow, optimizeTable, relayout, removeColumns, removeRows, rowRange, setHeaderColumn, setHeaderRow, splitCell, tableParts, tableSlots, tableState } from "../../components/table/page.mjs";
import { cellsIn, closeRect } from "../../components/table/slots.mjs";
import { COLOR_ICON, COLOR_WIDTH, colorItems } from "../block-menu/colors.mjs";
import { caretAt, editable } from "../caret.mjs";
import { gestureLock } from "../gesture.mjs";
import { kept } from "../kept.mjs";
import { ICONS as MENU_ICONS, createMenu } from "../menu.mjs";
import { drawAt, drawBox, layerOf } from "../overlay-layer.mjs";
import { own } from "../overlays.mjs";
import { hideTooltip, tooltip } from "../tooltip.mjs";
import { MENU_WIDTH } from "../type-grid.mjs";
import { addStyle, element } from "../ui.mjs";
import { alignItems, alignLook } from "./aligns.mjs";
import { clearCells, createCells } from "./cells.mjs";
import { createCellPictures } from "./pictures.mjs";
import { TABLE_ICONS } from "./icons.mjs";
import { createViews } from "./views.mjs";
import { createColumnWidths } from "./widths.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// A table's own tools (since 2026-10-18), for a table written as the kit
// writes one (the unit the server marked GRID):
//
// - The selection: cells (a rectangle between two of them, cells.mjs, grown so that it cuts no
//   merged cell), rows or columns, of one table; { unit, type: "cell" | "row" | "column", anchor,
//   focus: [row, column] (slots: shared/table-slots.mjs), editing: the caret in that one cell }.
//   It is drawn as a 2px blue frame around it, light blue inside (not the caret's cell: it is the
//   text's); a row's or column's grip turns blue.
// - Merged cells (合并单元格, from the cells' bar): the selected cells made one, a merged
//   cell made separate cells again (components/table/page.mjs mergeCells, splitCell).
// - The grips: a small grip on the top edge of a column and the left edge of a row, on the edge's
//   line (an 18×6 pill), a white button with drag dots under the pointer. Each shows
//   only with the pointer at its edge (REACH: the table's top edge over that column, its left edge
//   beside that row; the user's, 2026-10-23: none while the pointer, or the caret, is just in a
//   cell), and a selected row's or column's stays while it is selected. A press selects the row or
//   column; let go without moving, its menu opens (列: below the grip; 行: right of it), with a
//   search field: 标题行 / 标题列 (on the first, switched in place), 颜色 ›, 对齐 › (columns), insert
//   either side (the new one selected), 创建副本, 清除内容, 删除 (not the last). Dragged past 3px, it
//   moves (a blue line where it goes, a pale copy under the pointer; Esc cancels); moved first, a
//   row (column) is the header one.
// - The + points: at the ends of a column's top edge and a row's left edge, with that
//   column's (row's) grip, a dot that turns into a blue + with a line across the table: a click puts
//   a column or row in there.
// - The columns' widths (widths.mjs): a strip on each column's right edge sizes it.
// - The corner: with the pointer on the table, a round + just past its bottom right corner (the
//   only one: no bars along its edges). A click adds a row; dragged, it adds rows down and columns
//   right, one more per 32px (rows) or 120px (columns), and dragged back the empty last ones go (it
//   stops at one that is not), across, down or both at once.
// A table wider or taller than its frame scrolls in it: the tools stand by what the frame shows of
// it (the geometry's view), the grips and + points of the rows and columns in sight.
// Each change is one undo step; the page writes it as one operation of the table (grid.mjs). The
// keys and the cells' bar are cells.mjs's; what a view of the table asks (a custom block reading it:
// set a cell, move, add or take out a row), views.mjs's.

const STYLE = `
  .ge-tgrip { display: flex; align-items: center; justify-content: center; cursor: grab; pointer-events: auto; }
  .ge-tgrip > i { box-sizing: border-box; display: flex; align-items: center; justify-content: center; border: 2px solid light-dark(#ffffff, #191919); border-radius: 4px; background: light-dark(#d3d1cb, #5a5a58); transition: width 100ms, height 100ms, background 100ms; }
  .ge-tgrip[data-axis="column"] > i { width: 18px; height: 6px; }
  .ge-tgrip[data-axis="row"] > i { width: 6px; height: 18px; }
  .ge-tgrip > i > svg { display: none; flex: none; width: 16px; height: 16px; fill: var(--ge-tx3); }
  .ge-tgrip[data-axis="column"] > i > svg { transform: rotate(90deg); }
  /* Under the pointer it grows from its dash by the transition above (no keyframe: the grip is drawn before the pointer reaches it, and one blinked it out and in). */
  .ge-tgrip:is(:hover, [data-on], [data-selected]) > i { border: 1px solid var(--ge-line-strong); background: var(--ge-bg); box-shadow: 0 1px 2px rgb(0 0 0 / 8%); }
  .ge-tgrip[data-axis="column"]:is(:hover, [data-on], [data-selected]) > i { width: 22px; height: 14px; }
  .ge-tgrip[data-axis="row"]:is(:hover, [data-on], [data-selected]) > i { width: 14px; height: 22px; }
  .ge-tgrip:is(:hover, [data-on], [data-selected]) > i > svg { display: block; }
  .ge-tgrip[data-selected] > i { border-color: var(--ge-accent); background: var(--ge-accent); }
  .ge-tgrip[data-selected] > i > svg { fill: #ffffff; }
  .ge-tplus { display: grid; place-items: center; width: 18px; height: 18px; cursor: pointer; pointer-events: auto; }
  .ge-tplus > i { display: grid; place-items: center; width: 4px; height: 4px; border-radius: 50%; background: light-dark(#c9c7c2, #6b6b68); transition: width 100ms, height 100ms, background 100ms; }
  .ge-tplus > i > svg { display: none; width: 10px; height: 10px; fill: none; stroke: #ffffff; stroke-width: 2; stroke-linecap: round; }
  .ge-tplus:hover > i { width: 18px; height: 18px; background: var(--ge-accent); box-shadow: 0 0 0 2px light-dark(#ffffff, #191919); }
  .ge-tplus:hover > i > svg { display: block; }
  .ge-tline { border-radius: 1px; background: var(--ge-accent); pointer-events: none; }
  .ge-tgrow { box-sizing: border-box; display: grid; place-items: center; border: 0; border-radius: 50%; background: var(--ge-bg); color: var(--ge-tx3); box-shadow: 0 1px 3px light-dark(rgb(25 25 25 / 18%), rgb(0 0 0 / 45%)); cursor: nwse-resize; pointer-events: auto; transition: background 80ms, color 80ms; }
  .ge-tgrow:hover, .ge-tgrow[data-on] { background: light-dark(#f1f1ef, #2f2f2f); color: light-dark(#55534e, #c4c1bb); }
  .ge-tgrow > svg { width: 10px; height: 10px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
  .ge-tframe { box-sizing: border-box; border: 2px solid var(--ge-accent); border-radius: 2px; background: color-mix(in srgb, var(--ge-accent) 9%, transparent); pointer-events: none; }
  .ge-tghost { overflow: visible; border-radius: 2px; box-shadow: 0 0 0 1px rgb(15 15 15 / 5%), 0 3px 6px rgb(15 15 15 / 10%), 0 9px 24px rgb(15 15 15 / 20%); opacity: .9; pointer-events: none; }
  .ge-tghost > .ge-tghost-cells { position: absolute; inset: 0; overflow: hidden; border-radius: 2px; }
  .ge-tghost-cells > div { position: absolute; box-sizing: border-box; overflow: hidden; }
  .ge-tghost > .ge-tghost-frame { position: absolute; inset: -0.5px; border: 2px solid var(--ge-accent); border-radius: 2px; }
  .ge-tghost > .ge-tghost-grip { position: absolute; display: flex; align-items: center; justify-content: center; box-sizing: border-box; border: 1px solid var(--ge-accent); border-radius: 4px; background: var(--ge-accent); }
  .ge-tghost[data-axis="column"] > .ge-tghost-grip { top: -7.5px; left: 50%; width: 22px; height: 14px; margin-left: -11px; }
  .ge-tghost[data-axis="row"] > .ge-tghost-grip { left: -7.5px; top: 50%; width: 14px; height: 22px; margin-top: -11px; }
  .ge-tghost > .ge-tghost-grip > svg { flex: none; width: 16px; height: 16px; fill: #ffffff; }
  .ge-tghost[data-axis="column"] > .ge-tghost-grip > svg { transform: rotate(90deg); }
  /* A sortable header being written in: no arrow (the kit's, tables/sort.js) to press by mistake. */
  .doc-table th:focus-within > .doc-table-sort-button { display: none; }
  .ge-tsize { width: max-content; padding: 2px 8px; border-radius: 6px; background: var(--ge-tip-bg); color: #ffffff; font: 12px/18px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; white-space: nowrap; pointer-events: none; }
  ${gestureLock("data-ge-tdrag", { cursor: "grabbing", select: true })}
`;
const ICONS = TABLE_ICONS;
const STEP = { row: [32, 8], column: [120, 30] }; // a bar dragged this far adds one more (after the slack)
const DRAG = 3; // a press on a grip moved this far drags it
const REACH = { out: 12, in: 8 }; // the pointer this near the table's top (left) edge, outside it or in, shows a column's (row's) grip and + points

/**
 * active(): whether the tools may show. struct(parents, touched, mutate): the editor's undoable
 * structural change; look(elements, change, select): a change of classes and sizes as one undo step. selectBlock(unit):
 * select the table as a block (Esc). resizeTable(event, unit, axis): a drag of the table's width
 * ("x") or scroll height ("y") from an armed edge (resize/). say: the status line; settle(): takes it off. cellsOf(data): what
 * the clipboard holds as rows of cells, { rows, from } (clipboard/ cellsOf), or null. upload(kind,
 * body): a file sent to the report's folder (POST /__gallery/edit/upload), a picture of a cell's
 * (pictures.mjs).
 * typedKey(event): a key that is the "/" or "@" menu's, standing on a cell's text (slash-menu/, at-menu/), comes before the cell's.
 * recordStep(host, before): a text step of a text block, what a view's set is (history.mjs).
 */
export function createTableEditing({ active, struct, look, selectBlock, resizeTable = () => false, say, settle = () => {}, cellsOf = () => null, upload = async () => { throw new Error("upload"); }, typedKey = () => false, recordStep = () => {} }) {
  addStyle(STYLE);
  const menu = createMenu();
  let hover = null; // { unit, row, column, edges: { row, column } }: the cell under the pointer, and whether it is at the table's left (top) edge (edgesAt)
  let sel = null; // the selection (above)
  let drag = null; // a grip pressed: { unit, axis, from, to, x, y, moved } | the corner: { unit, x, y, ops, counts, moved }
  let keyboard = false; // the keys moved the selection: the hover tools wait for the pointer
  const nodes = new Set();
  const drawn = (node) => (nodes.add(node), own(node, "table tools", { alive: () => nodes.has(node) }));
  const grips = { column: null, row: null }; // the selection's grips drawn now (its menu stands by one)

  // ---------- where things are ----------

  // The table unit with a grid (GRID) a node is in, or null.
  const tableAt = (node) => {
    const unit = node?.closest?.(`main [data-ge-unit-kind="table"][${GRID}]`);
    return unit && !unit.closest("[data-ge-lock], [inert]") ? unit : null;
  };
  const rectOf = (node) => node.getBoundingClientRect();
  // The table's box, what its frame shows of it (view: the box, or the part in sight when the table
  // scrolls inside its frame), its columns (left, right: the slots', shared/table-slots.mjs) and rows (top,
  // bottom); window coordinates.
  function geometry(unit) {
    const { rows, table, slots } = tableState(unit);
    const box = rectOf(table);
    return {
      box,
      view: viewOf(unit, table, box),
      columns: slots ? columnEdges(slots) : [...(rows[0]?.cells ?? [])].map((cell) => ({ left: rectOf(cell).left, right: rectOf(cell).right })),
      rows: rows.map((row) => ({ top: rectOf(row).top, bottom: rectOf(row).bottom })),
    };
  }
  // What a table's frame shows of it (the table's box, or the part in sight when it scrolls inside its frame).
  function viewOf(unit, table = tableOf(unit), box = rectOf(table)) {
    const frame = rectOf(unit);
    const inside = unit === table ? box : { left: frame.left + unit.clientLeft, top: frame.top + unit.clientTop, right: frame.left + unit.clientLeft + unit.clientWidth, bottom: frame.top + unit.clientTop + unit.clientHeight };
    return { left: Math.max(box.left, inside.left), top: Math.max(box.top, inside.top), right: Math.min(box.right, inside.right), bottom: Math.min(box.bottom, inside.bottom) };
  }
  /**
   * Whether a point is at a table's edges where its grips stand ({ column, row }): within REACH of
   * the top edge in sight (over its columns: a column's grip and + points), of the left edge (beside
   * its rows: a row's).
   */
  function edgesAt(unit, x, y) {
    const view = viewOf(unit);
    const across = x >= view.left - REACH.out && x <= view.right + REACH.out;
    const along = y >= view.top - REACH.out && y <= view.bottom + REACH.out;
    return {
      column: across && y >= view.top - REACH.out && y <= view.top + REACH.in,
      row: along && x >= view.left - REACH.out && x <= view.left + REACH.in,
    };
  }
  // The columns' edges: where the cells of one column begin and end (a merged cell's own ones
  // where no such cell says), those no cell says shared out evenly between the ones around them.
  function columnEdges(slots) {
    const edges = Array(slots.columns + 1).fill(null);
    const places = [...slots.places].sort(([, a], [, b]) => a.cols - b.cols);
    for (const [cell, place] of places) {
      const rect = rectOf(cell);
      edges[place.c] ??= rect.left;
      edges[place.c + place.cols] ??= rect.right;
    }
    for (let c = 0; c <= slots.columns; c++) {
      if (edges[c] !== null) continue;
      let next = c + 1;
      while (edges[next] === null) next++;
      edges[c] = edges[c - 1] + (edges[next] - edges[c - 1]) / (next - c + 1);
    }
    return Array.from({ length: slots.columns }, (_, c) => ({ left: edges[c], right: edges[c + 1] }));
  }
  /** Whether a row's (column's) middle is in sight in its frame. */
  function inSight(g, axis, index) {
    const at = axis === "column" ? g.columns[index] : g.rows[index];
    if (!at) return false;
    const middle = axis === "column" ? (at.left + at.right) / 2 : (at.top + at.bottom) / 2;
    return axis === "column" ? middle >= g.view.left && middle <= g.view.right : middle >= g.view.top && middle <= g.view.bottom;
  }
  /** The cell of a table's slots (tableSlots, read once for what is asked of it) covering the slot [row, column], or null. */
  const cellOf = (slots, [r, c]) => slots?.matrix[r]?.[c] ?? null;
  /** Where a cell is in its table's slots: its top left slot [row, column], or null. */
  function placeOf(slots, cell) {
    const place = slots?.places.get(cell);
    return place ? [place.r, place.c] : null;
  }
  /** The cell at a point of the window, the nearest one when it is outside the table: [row, column]. */
  function cellAt(unit, x, y) {
    const g = geometry(unit);
    if (g.rows.length === 0 || g.columns.length === 0) return null;
    const r = g.rows.findIndex((row) => y < row.bottom);
    const c = g.columns.findIndex((column) => x < column.right);
    return [r < 0 ? g.rows.length - 1 : r, c < 0 ? g.columns.length - 1 : c];
  }

  // ---------- the selection ----------

  /**
   * The selection's rectangle: { r0, r1, c0, c1 } (inclusive; a row's all its columns, a column's all
   * its rows; cells grown so that it cuts no merged cell).
   */
  function bounds(s = sel) {
    const { rows, columns, slots } = tableState(s.unit);
    const [ar, ac] = s.anchor;
    const [fr, fc] = s.focus;
    const rect = {
      r0: s.type === "column" ? 0 : Math.min(ar, fr), r1: s.type === "column" ? rows.length - 1 : Math.max(ar, fr),
      c0: s.type === "row" ? 0 : Math.min(ac, fc), c1: s.type === "row" ? columns - 1 : Math.max(ac, fc),
    };
    return s.type === "cell" && slots && rect.r1 < rows.length && rect.c1 < columns ? closeRect(slots, rect) : rect;
  }
  /** The selected cells (those covering the selection's slots), each once, row by row. */
  function selectedCells(s = sel) {
    if (!s?.unit.isConnected) return [];
    const { slots } = tableState(s.unit);
    return slots ? cellsIn(slots, bounds(s)) : [];
  }

  // A selection made (no caret: the text selection goes, and the focus with it).
  function select(next) {
    sel = next;
    if (next && !next.editing) {
      getSelection().removeAllRanges();
      const focused = document.activeElement;
      if (focused?.closest?.("td, th") && next.unit.contains(focused)) focused.blur();
    }
    if (!next) menu.close();
    draw();
  }
  const tools = {
    get sel() { return sel; },
    selectCells: (unit, anchor, focus = anchor) => select({ unit, type: "cell", anchor, focus, editing: false }),
    selectRows: (unit, from, to = from) => select({ unit, type: "row", anchor: [from, 0], focus: [to, 0], editing: false }),
    selectColumns: (unit, from, to = from) => select({ unit, type: "column", anchor: [0, from], focus: [0, to], editing: false }),
    /** The caret in a cell (where: "start" | "end"), the cell its selection. */
    editCell(unit, at, where = "end") {
      const slots = tableSlots(unit);
      const cell = cellOf(slots, at);
      if (!cell) return;
      at = placeOf(slots, cell);
      sel = { unit, type: "cell", anchor: at, focus: at, editing: true };
      caretAt(cell, where);
      draw();
    },
    /** The caret came into a cell by itself (a click, the arrows): its selection. */
    editing(unit, at) {
      sel = { unit, type: "cell", anchor: at, focus: at, editing: true };
      draw();
    },
    clear: () => select(null),
    selectBlock: (unit) => {
      select(null);
      selectBlock(unit);
    },
    bounds, selectedCells, tableAt, placeOf, cellOf, cellAt, geometry, change, insert, removeRange, duplicate, merge, split, look, struct, say, settle,
    active,
    menuOpen: () => menu.isOpen,
    typedKey,
    resizeTable,
    cellsOf,
    dragging: () => drag !== null,
    keys: (on) => {
      keyboard = on;
      draw();
    },
    draw: () => draw(),
  };
  const pictures = createCellPictures({ active, recordStep, say, upload });
  tools.pictures = pictures;
  const cells = createCells(tools);
  const widths = createColumnWidths(tools);

  // ---------- drawing ----------

  const clear = () => {
    for (const node of nodes) node.remove();
    nodes.clear();
    grips.column = grips.row = null;
  };

  // The table the tools stand by, watched: the kit lays it out again after a change (its columns'
  // widths), and the tools follow.
  let watched = null;
  const watch = new ResizeObserver(() => { if (!drag && (hover || sel)) draw(); });
  function follow(unit) {
    const { table, rows } = unit ? tableParts(unit) : {};
    const key = table ? [table, ...rows, ...(rows[0]?.cells ?? [])] : [];
    if (watched && watched.length === key.length && watched.every((node, index) => node === key[index])) return;
    watch.disconnect();
    key.forEach((node) => watch.observe(node));
    watched = key;
  }

  function draw() {
    clear();
    if (sel && !sel.unit.isConnected) sel = null;
    const unit = sel?.unit ?? hover?.unit;
    follow(unit?.isConnected ? unit : null);
    cells.update();
    if (!unit?.isConnected || !active()) return widths.disarm();
    const layer = layerOf(unit);
    const g = geometry(unit);
    // The hovered cell, while the table still has it (a row or column taken out may have been it).
    const pointer = hover?.unit === unit && !keyboard && g.rows[hover.row] && g.columns[hover.column] ? hover : null;
    // The grips: the hovered cell's column with the pointer at the table's top edge, its row at the
    // left edge (edgesAt); the selected rows or columns (blue).
    const shown = { row: new Set(), column: new Set() };
    if (sel?.type === "row" || sel?.type === "column") {
      const { r0, r1, c0, c1 } = bounds();
      const [from, to] = sel.type === "row" ? [r0, r1] : [c0, c1];
      for (let index = from; index <= to; index++) shown[sel.type].add(index);
    }
    if (pointer && !drag?.ops) {
      if ((!drag || drag.axis === "column") && pointer.edges.column) shown.column.add(pointer.column);
      if ((!drag || drag.axis === "row") && pointer.edges.row) shown.row.add(pointer.row);
    }
    // Moved, the rows (columns) dragged are their copy under the pointer, with their frame and grip (dragTo).
    const moving = Boolean(drag?.moved && drag.ghost);
    if (moving) shown.row.clear(), shown.column.clear();
    // The selected cells (rows, columns) framed (under the grips on its edge); the caret's cell is not.
    if (sel && sel.unit === unit && !moving && !sel.editing) frame(layer, g);
    for (const axis of ["column", "row"]) for (const index of shown[axis]) if (inSight(g, axis, index)) grip(layer, unit, axis, index, g);
    if ((pointer && !drag) || widths.dragging) widths.draw(layer, unit, g, drawn);
    else widths.disarm();
    if (pointer && !drag && !widths.dragging) {
      if (pointer.edges.column) for (const at of [pointer.column, pointer.column + 1]) plus(layer, unit, "column", at, g);
      if (pointer.edges.row) for (const at of [pointer.row, pointer.row + 1]) plus(layer, unit, "row", at, g);
    }
    if (drag?.ops || (pointer && !drag)) corner(layer, unit, g);
    if (drag?.moved && drag.to !== undefined && drag.to !== drag.from && (drag.axis === "row" ? g.rows : g.columns)[drag.to]) dropLine(layer, g, drag);
  }

  function grip(layer, unit, axis, index, g) {
    const node = drawn(element("div", { class: "ge-tgrip", "data-axis": axis, "data-doc-dev": "", html: `<i>${ICONS.dots}</i>`, role: "button", "aria-label": axis === "column" ? t("移动列") : t("移动行") }));
    if (sel?.type === axis && sel.unit === unit) {
      const { r0, r1, c0, c1 } = bounds();
      const [from, to] = axis === "row" ? [r0, r1] : [c0, c1];
      if (index >= from && index <= to) node.setAttribute("data-selected", "");
      if (index === from) grips[axis] = node;
    }
    if (drag?.axis === axis && drag.from === index) node.setAttribute("data-on", "");
    // On the line of the table's edge in sight (the frame's border, half a pixel out): across the
    // column's top, along the row's left.
    const size = axis === "column" ? { w: 26, h: 16 } : { w: 16, h: 26 };
    const x = axis === "column" ? (g.columns[index].left + g.columns[index].right) / 2 : g.view.left - 0.5;
    const y = axis === "column" ? g.view.top - 0.5 : (g.rows[index].top + g.rows[index].bottom) / 2;
    drawBox(node, layer, { left: x - size.w / 2, top: y - size.h / 2, right: x + size.w / 2, bottom: y + size.h / 2 });
    node.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      menu.close();
      hideTooltip();
      // The rows or columns selected, no caret left in text, nor the focus (which would bring the
      // caret back): a caret elsewhere would let the selection go (cells.mjs). The keys go to the
      // menu and the selection.
      if (editable(document.activeElement)) document.activeElement.blur();
      getSelection().removeAllRanges();
      if (axis === "row") tools.selectRows(unit, index);
      else tools.selectColumns(unit, index);
      drag = { unit, axis, from: index, to: index, x: event.clientX, y: event.clientY, moved: false };
      document.documentElement.setPointerCapture?.(event.pointerId);
    });
  }

  function plus(layer, unit, axis, at, g) {
    const x = axis === "column" ? (at < g.columns.length ? g.columns[at].left : g.columns[at - 1].right) : g.view.left;
    const y = axis === "column" ? g.view.top : at < g.rows.length ? g.rows[at].top : g.rows[at - 1].bottom;
    // Only on an edge in sight.
    if (axis === "column" ? x < g.view.left - 1 || x > g.view.right + 1 : y < g.view.top - 1 || y > g.view.bottom + 1) return;
    const says = axis === "column" ? t("在这里插入一列") : t("在这里插入一行");
    const node = drawn(element("div", { class: "ge-tplus", "data-doc-dev": "", role: "button", "aria-label": says, html: `<i>${ICONS.plus}</i>` }));
    tooltip(node, says);
    drawBox(node, layer, { left: x - 9, top: y - 9, right: x + 9, bottom: y + 9 });
    const line = element("div", { class: "ge-tline", "data-doc-dev": "" });
    node.addEventListener("pointerenter", () => {
      drawn(line);
      layer.insertBefore(line, node); // under the +, which stays whole
      if (axis === "column") drawBox(line, layer, { left: x - 1, top: g.view.top, right: x + 1, bottom: g.view.bottom });
      else drawBox(line, layer, { left: g.view.left, top: y - 1, right: g.view.right, bottom: y + 1 });
    });
    node.addEventListener("pointerleave", () => line.remove());
    node.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
      insert(unit, axis, at);
    });
  }

  // The corner: a round + just past the bottom right corner of what the frame shows (clear of the
  // right edge's strip, widths.mjs); while it is dragged, pressed.
  function corner(layer, unit, g) {
    const node = drawn(element("div", { class: "ge-tgrow", "data-doc-dev": "", html: ICONS.grow, role: "button", "aria-label": t("添加行或列") }));
    if (drag?.ops) node.setAttribute("data-on", "");
    else tooltip(node, t("点击以添加新行"), t("拖动以添加或移除行和列"));
    drawBox(node, layer, { left: g.view.right + 2, top: g.view.bottom + 2, right: g.view.right + 20, bottom: g.view.bottom + 20 });
    node.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      hideTooltip();
      drag = { unit, x: event.clientX, y: event.clientY, ops: [], counts: { row: 0, column: 0 }, moved: false };
      document.documentElement.setPointerCapture?.(event.pointerId);
    });
  }

  // Around the selection, 2px blue (half a pixel past the cells), cut to what
  // the frame shows.
  function frame(layer, g) {
    const { r0, r1, c0, c1 } = bounds();
    if (!g.rows[r0] || !g.rows[r1] || !g.columns[c0] || !g.columns[c1]) return;
    const box = {
      left: Math.max(g.columns[c0].left, g.view.left) - 0.5, top: Math.max(g.rows[r0].top, g.view.top) - 0.5,
      right: Math.min(g.columns[c1].right, g.view.right) + 0.5, bottom: Math.min(g.rows[r1].bottom, g.view.bottom) + 0.5,
    };
    if (box.right - box.left < 2 || box.bottom - box.top < 2) return;
    drawBox(drawn(element("div", { class: "ge-tframe", "data-doc-dev": "" })), layer, box);
  }

  function dropLine(layer, g, { axis, from, to }) {
    const node = drawn(element("div", { class: "ge-tline", "data-doc-dev": "" }));
    if (axis === "column") {
      const x = to > from ? g.columns[to].right : g.columns[to].left;
      drawBox(node, layer, { left: x - 1.5, top: g.view.top, right: x + 1.5, bottom: g.view.bottom });
    } else {
      const y = to > from ? g.rows[to].bottom : g.rows[to].top;
      drawBox(node, layer, { left: g.view.left, top: y - 1.5, right: g.view.right, bottom: y + 1.5 });
    }
  }

  // The rows (columns) dragged as they look, going with the pointer: their cells in
  // their places, sizes, words and fills on the table's background (no table of the kit's, which its
  // runtime would lay out), the part the frame shows, a shadow under them, the selection's frame
  // around them and their grip on it, blue. Returns { node, size, offset } (offset: where the copy
  // begins along its axis, from the table's edge in sight).
  function ghostOf(unit, axis, [from, to]) {
    const { slots, table, rows, columns } = tableState(unit);
    const g = geometry(unit);
    const box = axis === "column"
      ? { left: g.columns[from].left, right: g.columns[to].right, top: g.view.top, bottom: g.view.bottom }
      : { left: g.view.left, right: g.view.right, top: g.rows[from].top, bottom: g.rows[to].bottom };
    const cells = cellsIn(slots, axis === "column" ? { r0: 0, r1: rows.length - 1, c0: from, c1: to } : { r0: from, r1: to, c0: 0, c1: columns - 1 });
    const copies = cells.map((cell) => {
      const rect = rectOf(cell);
      const style = getComputedStyle(cell);
      const copy = element("div");
      copy.style.cssText = `left: ${rect.left - box.left}px; top: ${rect.top - box.top}px; width: ${rect.width}px; height: ${rect.height}px; padding: ${style.padding}; background: ${style.backgroundColor}; color: ${style.color}; font: ${style.font}; text-align: ${style.textAlign}; border-right: ${style.borderRightWidth} solid ${style.borderRightColor}; border-bottom: ${style.borderBottomWidth} solid ${style.borderBottomColor}`;
      // Its content as shown, without what makes it the page's (block marks, editing, ids).
      copy.append(...[...cell.childNodes].map((node) => node.cloneNode(true)));
      for (const inner of copy.querySelectorAll("*")) for (const { name } of [...inner.attributes]) if (/^(data-ge-|contenteditable$|id$)/.test(name)) inner.removeAttribute(name);
      return copy;
    });
    const node = own(element("div", { class: "ge-tghost", "data-axis": axis, "data-doc-dev": "" },
      element("div", { class: "ge-tghost-cells" }, ...copies), element("i", { class: "ge-tghost-frame" }), element("b", { class: "ge-tghost-grip", html: ICONS.dots })), "table ghost", { alive: () => drag?.ghost === node });
    node.style.background = getComputedStyle(table).backgroundColor;
    return { node, size: { width: box.right - box.left, height: box.bottom - box.top }, offset: axis === "column" ? box.left - g.view.left : box.top - g.view.top };
  }

  // ---------- what they do ----------

  // The parents a change of the table touches: its sections and rows (their child lists).
  const parentsOf = (unit) => {
    const { table, rows } = tableParts(unit);
    return [table, ...table.querySelectorAll(":scope > thead, :scope > tbody"), ...rows];
  };

  // One undo step: the table's sections and rows as child lists (a thead it puts in made), the cells
  // it makes (a new one, a retagged one) and `touched` (cells whose text it changes) with their text.
  // Returns what mutate made, or null.
  function change(unit, mutate, said, touched = []) {
    let made = [];
    const { head, rows: rowsBefore } = tableParts(unit);
    const cellsBefore = new Set(rowsBefore.flatMap((row) => [...row.cells]));
    // The cells' spans and widths, which the change may set, recorded with it; the frame's sizes and
    // 识别数字列 (一键优化).
    const attributes = [...[...cellsBefore].map((cell) => [cell, ["rowspan", "colspan", "style"]]), [unit, ["style", NUMBERS]]];
    const result = struct(parentsOf(unit), touched, () => {
      const out = mutate();
      if (out === false) return null;
      made = Array.isArray(out) ? out : out && out !== true ? [out] : [];
      const now = tableState(unit);
      const created = now.head && now.head !== head ? [now.head] : [];
      const fresh = now.rows.flatMap((row) => [...row.cells]).filter((cell) => !cellsBefore.has(cell));
      return { touched: [...touched, ...fresh], focus: null, created };
    }, { attributes });
    if (result && said) say(t("{0} · Ctrl+Z 撤销", said));
    return result ? made : null;
  }

  /** A row or column put in at `at`, selected. */
  function insert(unit, axis, at) {
    const made = change(unit, () => (axis === "column" ? insertColumn(unit, at) : insertRow(unit, at)), axis === "column" ? t("已插入一列") : t("已插入一行"));
    if (!made) return;
    if (axis === "column") tools.selectColumns(unit, at);
    else tools.selectRows(unit, at);
  }

  /** Columns (rows) `from` … `to` taken out, never every one; returns whether they were. */
  function removeRange(unit, axis, from, to) {
    const done = change(unit, () => (axis === "column" ? removeColumns(unit, from, to) : removeRows(unit, from, to)), axis === "column" ? t("已删除列") : t("已删除行"));
    if (done === null) say(axis === "column" ? t("表格至少要留一列。") : t("表格至少要留一行正文。"));
    draw();
    return done !== null;
  }

  // The menu of the selected rows or columns (对齐 › for columns alone).
  function openMenu() {
    const anchor = sel && grips[sel.type];
    if (!anchor) return;
    const { unit, type } = sel;
    const { r0, r1, c0, c1 } = bounds();
    const [from, to] = type === "row" ? [r0, r1] : [c0, c1];
    const state = tableState(unit);
    const count = type === "row" ? state.rows.length : state.columns;
    const targets = selectedCells();
    const items = [];
    // 标题行 / 标题列: switched in place, the menu stays.
    if (type === "row" && from === 0 && to === 0) items.push({ label: t("标题行"), icon: ICONS.headerRow, checked: state.headerRow, run: () => { headerRow(unit, state); reopen(); } });
    if (type === "column" && from === 0 && to === 0) items.push({ label: t("标题列"), icon: ICONS.headerColumn, checked: state.headerColumn, run: () => { change(unit, () => setHeaderColumn(unit, !state.headerColumn), state.headerColumn ? t("已取消标题列") : t("已设为标题列")); reopen(); } });
    items.push({ label: t("颜色"), icon: COLOR_ICON, width: COLOR_WIDTH, submenu: () => colorItems(targets, (cells, color) => look(cells, colorLook(color, { only: true })), () => menu.close(), { recent: false }) });
    if (type === "column") {
      // The three alignments, then the three vertical ones (aligns.mjs): each the cells' own class of its kind.
      const alignments = alignItems(targets, (name) => look(targets, alignLook(name)));
      items.push({ label: t("对齐"), icon: ICONS["doc-align-left"], submenu: () => [...alignments.filter((item) => !item.vertical), { separator: true }, ...alignments.filter((item) => item.vertical)] });
    }
    items.push({ separator: true });
    if (type === "row") items.push({ label: t("在上方插入"), icon: ICONS.above, run: () => insert(unit, "row", from) }, { label: t("在下方插入"), icon: ICONS.below, run: () => insert(unit, "row", to + 1) });
    else items.push({ label: t("在左侧插入"), icon: ICONS.left, run: () => insert(unit, "column", from) }, { label: t("在右侧插入"), icon: ICONS.right, run: () => insert(unit, "column", to + 1) });
    if (type === "column") {
      // The columns' widths: shared out equally (several selected); the kit's own, or fixed as they are.
      if (to > from) items.push({ label: t("均分列宽"), icon: ICONS.even, run: () => widths.even(unit, from, to) });
      items.push({ label: t("自动调整列宽"), icon: ICONS.autoWidth, run: () => widths.fit(unit) });
    }
    items.push(
      { label: t("创建副本"), icon: ICONS.duplicate, hint: "Ctrl+D", run: () => duplicate(unit, type, from, to) },
      { label: t("清除内容"), icon: ICONS.clear, run: () => { clearCells(tools, targets); tools.clear(); } },
    );
    const all = type === "row" ? from <= state.rows.length - state.body.rows.length && to >= state.rows.length - 1 : to - from + 1 >= count;
    if (count > 1 && !all) items.push({ separator: true }, { label: t("删除"), icon: ICONS.trash, hint: "Del", danger: true, run:() => { if (removeRange(unit, type, from, to)) tools.clear(); } });
    // As wide as the block menu at least (wider with its rows: an English one's), no search field: its rows are few.
    const rect = anchor.getBoundingClientRect();
    menu.open(items, { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, { label: type === "column" ? t("列") : t("行"), side: type === "row" ? "right" : undefined, least: MENU_WIDTH, onClose: () => draw() });
  }
  const reopen = () => requestAnimationFrame(() => { if (sel) openMenu(); });
  // 一键优化 (page.mjs optimizeTable), one undo step.
  function optimize(unit) {
    if (change(unit, () => optimizeTable(unit), t("已一键优化")) === null) say(t("这个表格已经是优化后的样子。"));
    relayout(unit);
  }
  // 识别数字列 (an action, as 一键优化's part of it): the kit reads the table's numeric columns again
  // (index.mjs NUMBERS taken off: centered, sortable by their header's arrow), one undo step; the kit
  // watches the attribute (tables/index.js), undo included.
  function numbers(unit) {
    if (look(unit, { attributes: { [NUMBERS]: null } })) say(t("已识别数字列 · Ctrl+Z 撤销"));
    else say(t("这个表格的数字列已在识别。"));
  }

  // A sortable header's arrow (the kit's control, tables/sort.js) pressed while the page is edited: the
  // kit goes round its three states (no sort, ascending, descending, no sort) and, the page holding the
  // file's order, asks for the rows by a cancelable "doc-table-sort-edit" on the table (detail: rows, all
  // of the body's in the order the press gives; direction, null for the first order put back, which the
  // kit remembers from before the sort began). They are written as an edit, one undo step, saved as the
  // table's order, not the kit's view of them (by the kit's reading of the cells, number-reading.mjs
  // parsedValue; missing values last). The press moves no caret.
  const sortControl = (event) => {
    const header = event.target?.closest?.(".doc-table-sort-button")?.closest("th");
    const unit = header && active() ? tableAt(header) : null;
    return unit ? { unit, header } : null;
  };
  document.addEventListener("pointerdown", (event) => { if (sortControl(event)) event.preventDefault(); }, true);
  document.addEventListener("click", (event) => { if (sortControl(event)) event.preventDefault(); }, true);
  document.addEventListener("doc-table-sort-edit", (event) => {
    const unit = active() ? tableAt(event.target) : null;
    if (!unit) return; // not editing: the kit puts the rows in its view
    const { body } = tableState(unit);
    const { rows, direction } = event.detail;
    event.preventDefault();
    if (!body || rows.length !== body.rows.length || !rows.every((row) => row.parentElement === body)) return;
    if (rows.every((row, index) => row === body.rows[index])) return void say(direction ? t("这一列已经是这个顺序。") : t("已取消这一列的排序。"));
    change(unit, () => {
      body.append(...rows);
      return true;
    }, direction === "desc" ? t("已按这一列降序排列") : direction === "asc" ? t("已按这一列升序排列") : t("已恢复排序前的顺序"));
  });
  // 标题行 switched (refused when a merged cell ties the first row to the ones below it).
  function headerRow(unit, state) {
    if (change(unit, () => setHeaderRow(unit, !state.headerRow), state.headerRow ? t("已取消标题行") : t("已设为标题行")) === null && !state.headerRow) say(t("第一行和下面的行合并了单元格，不能设为标题行。"));
  }

  /** Rows or columns `from` … `to` (grown so that no merged cell is cut) copied after them, the copies selected. */
  function duplicate(unit, type, from, to) {
    const [first, last] = type === "column" ? columnRange(unit, from, to) : rowRange(unit, from, to);
    const made = change(unit, () => (type === "column" ? duplicateColumns(unit, first, last) : duplicateRows(unit, first, last)), t("已创建副本"));
    if (!made) return;
    const size = last - first + 1;
    if (type === "column") tools.selectColumns(unit, last + 1, last + size);
    else tools.selectRows(unit, last + 1, last + size);
  }

  /** The selected cells made one (mergeCells), selected. */
  function merge() {
    if (!sel || sel.type !== "cell") return;
    const { unit } = sel;
    const b = bounds();
    const list = selectedCells();
    if (list.length < 2) return;
    const heads = tableParts(unit).head?.rows.length ?? 0;
    if (b.r0 < heads && b.r1 >= heads) return void say(t("标题行不能和正文合并。"));
    const made = change(unit, () => mergeCells(unit, b), t("已合并单元格"), list);
    if (made) tools.selectCells(unit, [b.r0, b.c0]);
    else say(t("这些单元格不能合并。"));
  }

  /** A selected merged cell made separate cells (splitCell), they selected. */
  function split() {
    const list = selectedCells();
    if (!sel || list.length !== 1) return;
    const { unit } = sel;
    const place = tableState(unit).slots.places.get(list[0]);
    if (!place || (place.rows === 1 && place.cols === 1)) return;
    if (change(unit, () => splitCell(unit, list[0]), t("已拆分单元格"), list)) tools.selectCells(unit, [place.r, place.c], [place.r + place.rows - 1, place.c + place.cols - 1]);
  }

  // ---------- events ----------

  document.addEventListener("pointermove", (event) => {
    if (drag) return dragTo(event);
    if (keyboard) {
      keyboard = false;
      draw();
    }
    // A press on empty space beside a table (selection/marquee.mjs: a box selection, or a click) is
    // not working the table: the tools the pointer showed there before the press (a row's grip and +
    // points, its edges' strips, the corner) go at its first move and wait until it ends (a box
    // selection shows its covered blocks' fills alone).
    if (document.documentElement.hasAttribute("data-ge-marquee")) {
      if (hover) {
        hover = null;
        draw();
      }
      return;
    }
    if (event.buttons || !active() || document.documentElement.hasAttribute("data-ge-drag") || document.documentElement.hasAttribute("data-ge-resize")) return;
    if (event.target?.closest?.("[data-doc-dev]")) return; // on the tools themselves: keep them
    const { clientX: x, clientY: y } = event;
    // Just right of or below a table (its edges' grab, widths.mjs), the cell beside the pointer; just
    // above or left of it (its grips' edges), the cell inside that edge.
    const cell = event.target?.closest?.("td, th") ?? (nearTable(x, y) ? edgeCell(x, y) ?? outerCell(x, y) : null);
    const unit = tableAt(cell);
    if (unit) return point(unit, ...placeOf(tableSlots(unit), cell), edgesAt(unit, x, y));
    // Near a table (its tools stand just outside what its frame shows): keep them, but the grips off
    // its edges; elsewhere they go.
    if (hover) {
      const box = hover.unit.isConnected ? viewOf(hover.unit) : rectOf(tableOf(hover.unit));
      const near = x > box.left - 30 && x < box.right + 30 && y > box.top - 30 && y < box.bottom + 30;
      if (!near) {
        hover = null;
        draw();
      } else point(hover.unit, hover.row, hover.column, { row: false, column: false });
    }
  }, { passive: true, capture: true });
  // Over a frame (an embed's) the moves are its own document's: reaching it is the last the page hears
  // of the pointer, so the hover tools go there, near the table or not (else they stood by it until the
  // pointer came back to the page: the page scrolled under a still pointer, putting the caret in a
  // paragraph past the table, brings the embed under it with no move the page sees). A selection stays.
  document.addEventListener("pointerover", (event) => {
    if (event.target?.localName !== "iframe" || drag || widths.dragging || !hover) return;
    hover = null;
    draw();
  }, { passive: true, capture: true });
  // The pointer at a table's cell [row, column], at its edges or not (edgesAt): drawn again when that changed.
  function point(unit, row, column, edges) {
    const moved = !hover || hover.unit !== unit || hover.row !== row || hover.column !== column || hover.edges.row !== edges.row || hover.edges.column !== edges.column;
    hover = { unit, row, column, edges };
    if (moved) draw();
  }

  // Whether a point is near enough to a table for edgeCell or outerCell to find one of its cells: they
  // look REACH.out at most from the pointer, and only what a table's frame shows of it (or the
  // table, where its frame does not cut it) is found there. Each of their looks is a hit test of the
  // whole page (0.6–2ms on a long report), and the five of them on every move over the rest of the
  // page, where most moves are, came to 2–11ms a move; now none runs there. The tables are kept
  // between moves (kept.mjs), where they are is measured on the move.
  const tables = kept(() => [...document.querySelectorAll(`main [data-ge-unit-kind="table"][${GRID}]`)].map((unit) => [unit, tableOf(unit)]));
  function nearTable(x, y) {
    const near = REACH.out + 10;
    for (const pair of tables()) {
      for (const node of pair) {
        const rect = node?.getBoundingClientRect();
        if (rect && (rect.width > 0 || rect.height > 0) && x >= rect.left - near && x <= rect.right + near && y >= rect.top - near && y <= rect.bottom + near) return true;
      }
    }
    return false;
  }

  // The cell just inside a table's top (left) edge from a point just above (left of) it, within its
  // grips' reach (edgesAt), or null: the cell under the point taken that far into the table (under
  // the tools, when one of them stands there).
  function outerCell(x, y) {
    for (const [dx, dy] of [[0, REACH.out], [REACH.out, 0], [REACH.out, REACH.out]]) {
      const top = document.elementFromPoint(x + dx, y + dy);
      const cell = top?.closest?.("[data-doc-dev]") ? document.elementsFromPoint(x + dx, y + dy).map((node) => node.closest?.("td, th")).find(Boolean) : top?.closest?.("td, th");
      const unit = tableAt(cell);
      if (!unit) continue;
      const view = viewOf(unit);
      const edges = edgesAt(unit, x, y);
      if ((edges.column && y < view.top) || (edges.row && x < view.left)) return cell;
    }
    return null;
  }

  // The cell just inside a table's right (bottom) edge from a point just past it (within the edge's
  // grab, widths.mjs), or null.
  function edgeCell(x, y) {
    const beside = document.elementFromPoint(x - 10, y)?.closest?.("td, th");
    const right = tableAt(beside);
    if (right) {
      const { box, view } = geometry(right);
      if (box.right <= view.right + 1 && x >= box.right - 4 && x <= box.right + 8) return beside;
    }
    const above = document.elementFromPoint(x, y - 10)?.closest?.("td, th");
    const below = tableAt(above);
    if (below) {
      const { view } = geometry(below);
      if (x >= view.left && x <= view.right && y >= view.bottom - 3 && y <= view.bottom + 8) return above;
    }
    return null;
  }

  function dragTo(event) {
    if (drag.ops) return grow(event);
    if (!drag.moved && Math.abs(event.clientX - drag.x) + Math.abs(event.clientY - drag.y) < DRAG) return;
    if (!drag.moved) {
      drag.moved = true;
      // The rows (columns) a merged cell ties to it go with it.
      const range = drag.axis === "column" ? columnRange(drag.unit, drag.from) : rowRange(drag.unit, drag.from);
      const copy = ghostOf(drag.unit, drag.axis, range);
      drag.ghost = copy.node;
      drag.size = copy.size;
      // Where the press was in the copy, which it keeps.
      drag.grab = (drag.axis === "column" ? drag.x : drag.y) - (drag.axis === "column" ? geometry(drag.unit).view.left : geometry(drag.unit).view.top) - copy.offset;
      document.documentElement.setAttribute("data-ge-tdrag", "");
    }
    const g = geometry(drag.unit);
    const list = drag.axis === "column" ? g.columns.map((c) => [c.left, c.right]) : g.rows.map((r) => [r.top, r.bottom]);
    const at = drag.axis === "column" ? event.clientX : event.clientY;
    const to = list.findIndex(([, end]) => at < end);
    drag.to = to < 0 ? list.length - 1 : to;
    draw();
    // The copy follows the pointer along its axis, held where it was pressed, within the table in sight.
    const layer = layerOf(drag.unit);
    layer.append(drag.ghost); // above what was drawn anew, the line where it goes above it
    for (const line of layer.querySelectorAll(":scope > .ge-tline")) layer.append(line);
    const { width, height } = drag.size;
    const clamp = (value, low, high) => Math.max(low, Math.min(value, Math.max(low, high)));
    const left = drag.axis === "column" ? clamp(event.clientX - drag.grab, g.view.left, g.view.right - width) : g.view.left;
    const top = drag.axis === "row" ? clamp(event.clientY - drag.grab, g.view.top, g.view.bottom - height) : g.view.top;
    drawBox(drag.ghost, layer, { left, top, right: left + width, bottom: top + height });
  }

  // The corner dragged: as many rows put in below (columns right) as it went, or the empty last ones
  // taken off as it comes back, across, down or both. Each move starts again from the table as the
  // press found it (what the moves before did undone, the last first), then columns (in the rows
  // there are) and rows (of every column): rows and columns put in and taken off never mix. Undone
  // when it ends, then made again as one undo step; the frame scrolled to its end, where they are.
  function grow(event) {
    const { unit } = drag;
    while (drag.ops.length > 0) drag.ops.pop()();
    const wanted = {};
    for (const axis of ["row", "column"]) {
      const delta = axis === "column" ? event.clientX - drag.x : event.clientY - drag.y;
      const [step, slack] = STEP[axis];
      drag.moved ||= Math.abs(delta) > DRAG;
      wanted[axis] = delta >= 0 ? Math.floor((delta + slack) / step) : -Math.floor((slack - delta) / step);
    }
    drag.counts = { row: 0, column: 0 };
    for (const axis of ["column", "row"]) {
      for (let i = 0; i < wanted[axis]; i++) {
        const made = axis === "column" ? insertColumn(unit, tableState(unit).columns) : [insertRow(unit, tableParts(unit).rows.length)];
        drag.ops.push(() => made.forEach((node) => node.remove()));
        drag.counts[axis]++;
      }
      for (let i = 0; i > wanted[axis]; i--) {
        const taken = takeLast(unit, axis);
        if (!taken) break;
        drag.ops.push(() => restore(taken));
        drag.counts[axis]--;
      }
    }
    toEnd(unit, drag.counts);
    draw();
    showSize(event);
  }
  // A frame that scrolls shows its end where rows (columns) went in.
  function toEnd(unit, counts) {
    if (counts.column > 0) unit.scrollLeft = unit.scrollWidth;
    if (counts.row > 0) unit.scrollTop = unit.scrollHeight;
  }

  // The last row (column) taken off when it is empty, not the last one and holds no merged cell:
  // what puts it back, or null.
  function takeLast(unit, axis) {
    const { rows, columns, body, slots } = tableState(unit);
    if (axis === "row") {
      const r = rows.length - 1;
      const row = rows[r];
      if (body.rows.length < 2 || row.textContent.trim() !== "" || slots.matrix[r].some((cell) => cell.rowSpan > 1 || slots.places.get(cell).r !== r)) return null;
      const parent = row.parentElement;
      row.remove();
      return [{ node: row, parent, before: null }];
    }
    const cells = [...new Set(slots.matrix.map((row) => row[columns - 1]))];
    if (columns < 2 || cells.some((cell) => cell.colSpan > 1 || cell.rowSpan > 1 || cell.textContent.trim() !== "")) return null;
    return cells.map((cell) => {
      const parent = cell.parentElement;
      cell.remove();
      return { node: cell, parent, before: null };
    });
  }
  const restore = (taken) => taken.forEach(({ node, parent, before }) => parent.insertBefore(node, before));

  let sizeTip = null;
  function showSize(event) {
    const { rows, columns } = tableState(drag.unit);
    sizeTip ??= element("div", { class: "ge-tsize", "data-doc-dev": "" });
    drawn(sizeTip); // drawn again after each redraw
    sizeTip.textContent = t("{0} 列 × {1} 行", columns, rows.length);
    // Below right of the pointer, as wide as its words (only placed: never given a size).
    const layer = layerOf(drag.unit);
    const origin = layer.getBoundingClientRect();
    drawAt(sizeTip, layer, event.clientX + 12 - origin.left, event.clientY + 12 - origin.top);
  }

  // The drag ends: a grip's move, or the corner's rows and columns as one undo step (`cancel`: Esc).
  function release(cancel = false) {
    const done = drag;
    drag = null;
    sizeTip = null;
    done?.ghost?.remove();
    document.documentElement.removeAttribute("data-ge-tdrag");
    if (!done) return;
    if (done.ops) {
      const { unit } = done;
      while (done.ops.length > 0) done.ops.pop()();
      const counts = { ...done.counts };
      if (cancel) return draw();
      // A click: one row.
      if (!done.moved) {
        counts.row = 1;
        counts.column = 0;
      }
      if (counts.row === 0 && counts.column === 0) return draw();
      const made = change(unit, () => {
        for (const axis of ["column", "row"]) {
          for (let i = 0; i < counts[axis]; i++) axis === "column" ? insertColumn(unit, tableState(unit).columns) : insertRow(unit, tableParts(unit).rows.length);
          for (let i = 0; i > counts[axis]; i--) takeLast(unit, axis);
        }
        return true;
      }, [counts.row && t("{0} {1} 行", counts.row > 0 ? t("已添加") : t("已移除"), Math.abs(counts.row)), counts.column && t("{0} {1} 列", counts.column > 0 ? t("已添加") : t("已移除"), Math.abs(counts.column))].filter(Boolean).join(t("，")));
      // Laid out by the kit first: a table grown past 20 rows takes the kit's height then (tables/whole.js).
      if (made) requestAnimationFrame(() => {
        relayout(unit);
        toEnd(unit, counts);
      });
      return draw();
    }
    if (cancel) return draw();
    if (!done.moved) return openMenu();
    if (done.to !== done.from) {
      // [first, last] where they are now (with the rows or columns a merged cell ties them to).
      const moved = change(done.unit, () => (done.axis === "column" ? moveColumn(done.unit, done.from, done.to) : moveRow(done.unit, done.from, done.to)), done.axis === "column" ? t("已移动列") : t("已移动行"));
      if (moved?.length === 2) done.axis === "column" ? tools.selectColumns(done.unit, moved[0], moved[1]) : tools.selectRows(done.unit, moved[0], moved[1]);
      else if (moved === null) say(done.axis === "column" ? t("合并的单元格把这几列连在一起，不能这样移动。") : t("合并的单元格把这几行连在一起，不能这样移动。"));
    }
    draw();
  }
  document.addEventListener("pointerup", () => { if (drag) release(); }, true);
  document.addEventListener("pointercancel", () => { if (drag) release(true); }, true);
  // Esc during a drag puts everything back.
  document.addEventListener("keydown", (event) => {
    if (!drag || event.key !== "Escape") return;
    event.preventDefault();
    event.stopImmediatePropagation();
    release(true);
  }, true);

  // The menu's keys, before the page's (window, capturing): ↑/↓ move through it, → opens a submenu
  // (颜色 ›, 对齐 ›) and ← leaves it, Enter runs a row, Esc closes it (the selection stays). A field
  // in it (a submenu's) keeps its own.
  addEventListener("keydown", (event) => {
    if (!menu.isOpen || event.defaultPrevented || event.target?.closest?.("input, textarea") || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === "Escape") menu.close();
    else if (event.key === "ArrowLeft" || event.key === "ArrowRight") menu.move(event.key === "ArrowRight" ? 1 : -1, true);
    else if (event.key === "Enter") menu.choose();
    else if (!menu.arrow(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  addEventListener("scroll", () => { if (!drag) draw(); }, { passive: true, capture: true });

  // What a view of a table asks (views.mjs).
  createViews({ active, change, struct, tableAt, recordStep, drawn: () => draw() });

  // The rows of a table the tools manage. 一键优化 is a split row (menu.mjs): its words run it, its ›
  // opens two of its parts to run alone, 自动调整列宽 and 识别数字列 (the user's, 2026-11-07).
  function toolRows(unit) {
    const state = tableState(unit);
    return [
      { label: t("标题行"), icon: ICONS.headerRow, checked: state.headerRow, run: () => headerRow(unit, state) },
      { label: t("标题列"), icon: ICONS.headerColumn, checked: state.headerColumn, run: () => change(unit, () => setHeaderColumn(unit, !state.headerColumn), state.headerColumn ? t("已取消标题列") : t("已设为标题列")) },
      {
        label: t("一键优化"), icon: ICONS.magic, run: () => optimize(unit),
        submenu: () => [
          { label: t("自动调整列宽"), icon: ICONS.autoWidth, run: () => widths.fit(unit) },
          { label: t("识别数字列"), icon: ICONS.numbers, run: () => numbers(unit) },
        ],
      },
      { label: t("均分列宽"), icon: ICONS.even, run: () => widths.even(unit) },
    ];
  }

  // A table's size: the reading width (in a column 铺满这一栏), and back to the default size
  // once a width or a scroll height is set (resize/ drags both by the table's edges).
  function layoutRows(unit) {
    if (!unit.matches(TABLE.frame)) return [];
    const row = (options) => lookRow({ look, say }, unit, options);
    const span = unit.style.getPropertyValue(SPAN).trim();
    const rows = [row({ label: unit.parentElement?.matches(".doc-column") ? t("铺满这一栏") : t("铺满正文宽度"), icon: MENU_ICONS.full, change: { sizes: { [SPAN]: "1" } }, done: t("表格已铺满") })];
    if (span !== "" || unit.style.getPropertyValue(TABLE_HEIGHT).trim() !== "") {
      rows.push(row({ label: t("恢复默认大小"), icon: MENU_ICONS.reset, change: { sizes: { [SPAN]: null, [TABLE_HEIGHT]: null } }, done: t("已恢复默认大小") }));
    }
    return rows;
  }

  return {
    /** Take every tool away (the page stops editing, a dialog opens). */
    hide() {
      hover = null;
      sel = null;
      drag = null;
      menu.close();
      clear();
      cells.update();
      pictures.hide();
    },
    /** The pictures of cells (pictures.mjs): files pasted into a cell, those of pasted cells made the folder's. */
    pictures,
    /** The table whose cells, rows or columns are selected (no caret in one of them), or null: Ctrl+A's step to the table whole (select-all/). */
    get selectedTable() { return sel && !sel.editing && sel.unit.isConnected ? sel.unit : null; },
    /** The selection let go (blocks selected instead: select-all/). */
    clear: () => { if (sel) tools.clear(); },
    /** A space typed into a text block: in a cell of a table the tools manage, maybe a list's item (lists.mjs). Returns whether it was. */
    typed: (host, data) => /^(TD|TH)$/.test(host?.tagName ?? "") && tableAt(host) !== null && cells.typed(host, data),
    /** Whether the table tools manage a table unit (one written as the kit writes one): its right edge is theirs. */
    owns: (unit) => tableAt(unit) === unit,
    /** Whether a drag from text block `from` into `to` is the table's (two cells of one table): it selects them. */
    claims: (from, to) => {
      const unit = tableAt(from);
      return Boolean(unit) && /^(TD|TH)$/.test(from.tagName) && /^(TD|TH)$/.test(to?.tagName ?? "") && tableAt(to) === unit;
    },
    /** The editor's UI nodes to keep in the top layer when a modal dialog opens. */
    get nodes() { return [...nodes, ...cells.nodes, ...pictures.nodes]; },
    /** Whether a node is one of the tools' (a grip, an edge's strip, the corner's +, the cells' bar). */
    holds: (node) => Boolean(node) && [...nodes, ...cells.nodes, ...pictures.nodes].some((each) => each.contains(node)),
    /**
     * A table's rows of its block menu (its 表格 section, under the menu's one title): a
     * table of the kind these tools manage has 标题行 and 标题列, switches (checked when on); then
     * actions, each applied once (no check): 一键优化 › (自动调整列宽, 识别数字列 in its submenu),
     * 均分列宽; any table in its frame has its size's rows after them (layoutRows). [] for any other block.
     * (The table's 对齐 › is the block menu's own row, above 颜色: page/align.mjs, as a text block's.)
     */
    menuItems(target) {
      if (!target?.matches?.('[data-ge-unit-kind="table"]')) return [];
      return [...(tableAt(target) === target ? toolRows(target) : []), ...layoutRows(target)];
    },
  };
}
