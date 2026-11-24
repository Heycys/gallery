import { loadScript } from "../../page/ui.mjs";
import { BLOCK_COLORS } from "../colors.mjs";
import { capsFor } from "../registry.mjs";
import { tableOf } from "./grid.mjs";
import { CELL_LOOKS, COLUMN_WIDTH, GRID, HEADER_LOOK, NUMBERS, TABLE_HEIGHT, cellNodes, lookOf, rowNames, scrollHeight, tableTiling, widthOf } from "./index.mjs";
import { columnWidths as widthsOf, slotsOf, widthHolder } from "../../../shared/table-slots.mjs";
import { CHART_SOURCE } from "../../../shared/table-chart.mjs";
import { WIDE } from "../../../shared/table-across.mjs";
import { cellFrom, cellsIn, closeRect, setSpan } from "./slots.mjs";

// 表格 on the page: a new one, made by a paste (clipboard/) or the "/" menu (convert.mjs), its cells
// text blocks made on the page (newCell): once saved it is a table like the Agent's (its cells text
// blocks the commit takes in).

// The kit's table script (/kit/tables.js) on a page served without it (a report with no table yet):
// loaded when the page makes its first table, so that the kit lays it out at once (its columns, its
// frame filled when its width is dragged) and not only after a reload.
const loadKit = () => loadScript("/kit/tables.js", () => globalThis.DocTables);

/**
 * Widths that share `share` of the width a table stands in (its frame's parent, inside its padding
 * and the frame's border) equally among `count` columns, px each: a new table from the "/" menu.
 */
export function sharedWidths(wrap, count, share = 1) {
  const parent = wrap.parentElement;
  const style = getComputedStyle(parent);
  const available = parent.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight) - 2;
  return Array.from({ length: count }, () => Math.floor(((available * share - 1) / count) * 100) / 100);
}

/**
 * A new table of `rows` (each an array of its cells: inline HTML, already sanitized, or the nodes
 * made of it, formula chips and lists among them: clipboard/), its first row a header row with
 * `header`, its first column a header column with `column`, its numeric columns read unless
 * `numbers` is false (识别数字列: index.mjs NUMBERS). `looks`, `widths` and `spans` as tableData
 * describes them: each cell's look classes, each column's width, each cell's [rowspan, colspan]
 * (a cell merged makes a row hold fewer cells); where `looks` is given the cells have just those,
 * where not a header row's cell takes the header's look (a header column's none). `chart`: the key a chart drawn from it reads it
 * by (its frame's data-doc-chart-source), when it has one.
 */
export function newTable(doc, { rows, header = false, column = false, numbers = true, looks, widths, spans, chart }) {
  const wrap = doc.createElement("div");
  wrap.className = "doc-table-wrap";
  for (const [name, value] of [["data-ge-new", ""], ["data-ge-type", "table"], ["data-ge-unit-kind", "table"]]) wrap.setAttribute(name, value);
  if (!numbers) wrap.setAttribute(NUMBERS, "off");
  if (chart) wrap.setAttribute(CHART_SOURCE, chart);
  const table = doc.createElement("table");
  table.className = "doc-table";
  // The column each cell stands in (a merged cell takes the places of the ones it covers).
  const tiling = tableTiling({ rows, header, spans });
  const at = rows.map((cells, r) => cells.map((_, index) => tiling?.places.get(`${r}:${index}`).c ?? index));
  const row = (cells, head, r) => {
    const tr = doc.createElement("tr");
    cells.forEach((html, index) => {
      const first = at[r][index] === 0;
      const cell = newCell(doc, head || (column && first) ? "th" : "td", !head && column && first ? "row" : null);
      if (looks) cell.classList.add(...(looks[r][index] ?? "").split(" ").filter(Boolean));
      else if (head) headerLook(cell, true);
      const [down, across] = spans?.[r]?.[index] ?? [1, 1];
      setSpan(cell, down, across);
      if (Array.isArray(html)) cell.append(...html);
      else cell.innerHTML = html;
      tr.append(cell);
    });
    return tr;
  };
  const [first, ...rest] = rows;
  if (header) table.createTHead().append(row(first, true, 0));
  const body = doc.createElement("tbody");
  body.append(...(header ? rest : rows).map((cells, index) => row(cells, false, index + (header ? 1 : 0))));
  if (body.rows.length > 0) table.append(body);
  wrap.append(table);
  // The server writes it as the kit writes a table (file.mjs), a plain one when it has a body row: its
  // tools are for it from now on, and the file's word (a commit's answer) takes the place of this.
  if (body.rows.length > 0) wrap.setAttribute(GRID, "");
  // Each column's width on the topmost cell of that column alone (shared/table-slots.mjs widthHolder).
  if (widths?.some(Boolean)) {
    const slots = slotsOf([...table.rows]);
    widths.forEach((width, c) => width && widthHolder(slots, c)?.style.setProperty(COLUMN_WIDTH, width));
  }
  if (doc === globalThis.document) loadKit();
  return wrap;
}

/**
 * A table made again from the clipboard's description (its type's `build`, builders.mjs): each cell's
 * nodes as made, its formulas chips the page draws at once (as HTML again they would be their TeX
 * until the page opened again), its lists the cell's. One from elsewhere comes in 一键优化'd: a header
 * row, its names' column a header column, its numeric columns read (the page's own copy as it was).
 */
export function build({ doc, block, lines }) {
  const rows = block.rows.map((row) => row.map((html) => cellNodes(doc, html, (text) => lines(text, { pictures: true })))); // a cell's pictures its own
  const table = newTable(doc, { rows, header: Boolean(block.header), column: Boolean(block.column), numbers: block.numbers !== false, looks: block.looks, widths: block.widths, spans: block.spans, chart: block.chart });
  if (block.outside) optimizeTable(table);
  return table;
}

// ---------- its rows and columns ----------
// What the table's own tools do (the grips, their menus, the corner's +, merging cells:
// page/table/), on the page, each called inside one undo step (editor.mjs struct, which records the
// cells' spans and widths too): rows and cells made here are text blocks made on the page
// (data-ge-new), written with the table's operation (grid.mjs). Rows and columns are slots'
// (shared/table-slots.mjs): indexes count the thead's rows first, a merged cell stands in each row and column it
// covers. A row or column put in across a merged cell makes it bigger, one taken out of it smaller;
// rows (columns) a merged cell ties together move and are copied together. A table that is not
// plain (the server's judgement, source/table.mjs plainTable, marked on the unit: GRID) has no such tools.

/**
 * A table standing for an empty block (its type's `create`): three columns, a header row and two rows
 * (a new table has a header row, decided 2026-10-18), the caret in its first cell. It is two fifths as wide as the text
 * it stands in, its columns equal and fixed (typing does not move them); 自动调整列宽 is the reader's
 * to choose (a pasted table has the kit's widths). Its numeric columns are not read (识别数字列 off):
 * typing numbers does not center or sort them.
 */
export function make({ doc, put }) {
  const table = newTable(doc, { rows: [["", "", ""], ["", "", ""], ["", "", ""]], header: true, numbers: false });
  put(table);
  const first = [...table.querySelector("tr").cells];
  sharedWidths(table, first.length, 2 / 5).forEach((width, index) => first[index].style.setProperty(COLUMN_WIDTH, `${width}px`));
  return table.querySelector("th, td");
}

/** The table's page object: page/table/ is its editing, in the tools' folders for its size. */
export function create({ tables, look, active }) {
  return {
    create: make,
    // The page's 宽表格 flipped in the workbench's 更多 (the session's `look` with `follow`: doc-wide-follow) sets every
    // table of the page: each one's own word (WIDE, the block menu's 宽表格) taken away, one undo step.
    install() {
      addEventListener("doc-wide-follow", (event) => {
        if (!active() || !event.detail?.kinds?.includes("tables")) return;
        const units = [...document.querySelectorAll(`main [data-ge-unit-kind="table"][${WIDE}]`)];
        if (units.length > 0) look(units, { attributes: { [WIDE]: null } });
      });
    },
    /** Its rows of the block menu: its tools' (page/table/), made once the block tools are. */
    menuItems: (target) => tables()?.menuItems(target) ?? [],
    /** Its row heading the block menu's rows of its look, right above 对齐 (page/table/: 宽表格). */
    menuLead: (target) => tables()?.menuLead(target) ?? [],
    /** A space typed in a cell at a line's start: "- " or "1. " makes a list of the line (table/lists.mjs). True when it did. */
    shortcut: (host, data) => tables()?.typed(host, data) ?? false,
  };
}

/**
 * A new cell: a text block made on the page (td, or th with its scope). A header cell made in a
 * header row takes the look of the header cell beside it (`model`: lookLike), one of a new table
 * the header's (newTable); a header column's cell is made plain.
 */
export function newCell(doc, tag = "td", scope = null, model = null) {
  const cell = doc.createElement(tag);
  for (const [name, value] of [["contenteditable", "true"], ["data-ge-new", ""], ["data-ge-kind", "cell"], ["data-ge-caps", capsFor("cell")], ["data-ge-framed", ""]]) cell.setAttribute(name, value);
  if (scope) cell.setAttribute("scope", scope);
  if (tag === "th" && model) lookLike(cell, model);
  return cell;
}

// Whether a cell of `tag` and `scope` wears the header row's look (index.mjs HEADER_LOOK): a th that is
// no row's header. A header column's th (scope="row") has no look of its own: 标题列 only makes the
// column stay at the left when the frame scrolls sideways (the user's, 2026-11-06).
const wearsHeaderLook = (tag, scope) => tag === "th" && (scope ?? "").trim().toLowerCase() !== "row";

// A cell that becomes a header row's cell (wearsHeaderLook) takes the header's look (index.mjs
// HEADER_LOOK: bold, and the gray fill unless it has a color of its own); one that stops being one
// loses it; a header column's cell has none (标题列 only sticks). These are looks as any other: the
// reader may change them.
function headerLook(cell, on) {
  const [bold, fill] = HEADER_LOOK;
  if (!on) return cell.classList.remove(bold, fill);
  cell.classList.add(bold);
  if (!BLOCK_COLORS.some((name) => cell.classList.contains(name))) cell.classList.add(fill);
}

// A header cell made beside another of its header row: its color and bold as that one's
// (a header the reader made plain, or the Agent wrote plain, stays so).
function lookLike(cell, model) {
  const [bold] = HEADER_LOOK;
  for (const name of [...BLOCK_COLORS, bold]) cell.classList.toggle(name, model.classList.contains(name));
}

/**
 * What is read of a table unit without its slots: its table, its rows (the thead's first), its
 * thead and its tbody. What only needs these asks for these (tableState reads the slots too).
 */
export function tableParts(unit) {
  const table = tableOf(unit);
  return {
    table,
    rows: table ? [...table.querySelectorAll(":scope > thead > tr, :scope > tbody > tr")] : [],
    head: table?.querySelector(":scope > thead") ?? null,
    body: table?.querySelector(":scope > tbody") ?? null,
  };
}

/** A table unit's slots (shared/table-slots.mjs), null when its cells tile no rectangle: what cellOf and placeOf are asked of. */
export function tableSlots(unit) {
  const { rows } = tableParts(unit);
  return rows.length ? slotsOf(rows) : null;
}

/**
 * A table unit's parts (tableParts), its slots (shared/table-slots.mjs; null when its cells
 * tile no rectangle), its columns and whether it has a header row and a header column. It reads the
 * slots each time it is asked: a caller that goes on reading the table keeps the result.
 */
export function tableState(unit) {
  const parts = tableParts(unit);
  const { rows, body, head } = parts;
  const bodyRows = body ? [...body.rows] : [];
  const slots = rows.length ? slotsOf(rows) : null;
  const first = rows.length - bodyRows.length;
  return {
    ...parts, slots,
    columns: slots?.columns ?? rows[0]?.cells.length ?? 0,
    headerRow: Boolean(head?.rows.length),
    headerColumn: bodyRows.length > 0 && (slots ? bodyRows.every((row, index) => slots.matrix[first + index][0].localName === "th") : bodyRows.every((row) => row.cells[0]?.localName === "th")),
  };
}

/**
 * The kit lays a table out again at once (tables/: its columns' widths; a style written to a cell
 * is no change it watches), for the tools that measure what it drew: the columns as they are
 * dragged, the table after 一键优化.
 */
export const relayout = (unit) => globalThis.DocTables?.layout?.(tableOf(unit));

/** Rows `from` … `to` grown so that no merged cell is cut: [first, last]. */
export function rowRange(unit, from, to = from) {
  const { slots, columns } = tableState(unit);
  const rect = closeRect(slots, { r0: from, r1: to, c0: 0, c1: columns - 1 });
  return [rect.r0, rect.r1];
}

/** Columns `from` … `to` grown so that no merged cell is cut: [first, last]. */
export function columnRange(unit, from, to = from) {
  const { slots, rows } = tableState(unit);
  const rect = closeRect(slots, { r0: 0, r1: rows.length - 1, c0: from, c1: to });
  return [rect.c0, rect.c1];
}

// The look the cells a new one is put in among all wear (index.mjs lookOf: their color, alignments
// and bold), "" when they are all plain, null when they differ or there are none. A new row's cell
// wears its column's in the body rows, a new column's cell its row's beside the header column (the
// user's, 2026-11-22: a look set on a whole column or row is meant for what is put in it too).
function sharedLook(cells) {
  const looks = new Set([...new Set(cells)].filter(Boolean).map(lookOf));
  return looks.size === 1 ? [...looks][0] : null;
}
// A new cell wearing `look` (sharedLook's): its look classes those alone, its other classes kept.
function wearLook(cell, look) {
  if (look === lookOf(cell)) return;
  cell.classList.remove(...CELL_LOOKS);
  if (look) cell.classList.add(...look.split(" "));
}

// The cell a new row has in column `c`: as the row it is made beside has it there (a header
// column's th, plain), never a header row's th.
const cellLike = (doc, slots, r, c) => {
  const model = r === null ? null : slots.matrix[r]?.[c];
  return model?.localName === "th" && model.getAttribute("scope") === "row" && c === 0 ? newCell(doc, "th", "row") : newCell(doc);
};

/**
 * A new row at `at` (0 … rows): in the tbody (in the thead only between its rows). A body row's cell
 * wears the look its column's body cells all share (sharedLook), a header row's that of the cell
 * above it (lookLike). Returns it.
 */
export function insertRow(unit, at) {
  const { rows, body, head, columns, slots } = tableState(unit);
  const doc = unit.ownerDocument;
  const heads = head?.rows.length ?? 0;
  const row = doc.createElement("tr");
  row.setAttribute("data-ge-new", "");
  const inHead = heads > 0 && at > 0 && at < heads;
  const offset = Math.max(0, at - heads);
  const model = inHead ? null : heads + Math.min(offset, body.rows.length - 1);
  const grown = new Set();
  for (let c = 0; c < columns; c++) {
    // A merged cell across the place (above it and below it): a row taller, nothing new there.
    const across = at > 0 && at < rows.length ? slots.matrix[at][c] : null;
    const place = across && slots.places.get(across);
    if (place && place.r < at) {
      if (!grown.has(across)) setSpan(across, place.rows + 1, place.cols);
      grown.add(across);
      continue;
    }
    const cell = inHead ? newCell(doc, "th", null, slots.matrix[at - 1][c]) : cellLike(doc, slots, model, c);
    const look = inHead ? null : sharedLook(slots.matrix.slice(heads).map((cells) => cells[c]));
    if (look !== null) wearLook(cell, look);
    row.append(cell);
  }
  if (inHead) head.insertBefore(row, head.rows[at]);
  else body.insertBefore(row, body.rows[offset] ?? null);
  return row;
}

/**
 * A new column at `at` (0 … columns): a cell in each row (a header row's th, a header column's when it
 * is the first). Each wears the look its row's cells beside the header column all share (sharedLook;
 * a header row's cell the cell's before it when they differ, lookLike), but a new header column's
 * cell, which is plain. Returns its cells.
 */
export function insertColumn(unit, at) {
  const { rows, columns, headerColumn, slots } = tableState(unit);
  const doc = unit.ownerDocument;
  const grown = new Set();
  const made = [];
  rows.forEach((row, r) => {
    // A merged cell across the place (left of it and right of it): a column wider, nothing new there.
    const across = at > 0 && at < columns ? slots.matrix[r][at] : null;
    const place = across && slots.places.get(across);
    if (place && place.c < at) {
      if (!grown.has(across)) setSpan(across, place.rows, place.cols + 1);
      grown.add(across);
      return;
    }
    const head = row.parentElement.localName === "thead";
    const first = slots.matrix[r][0];
    const beside = slots.matrix[r][Math.max(0, at - 1)];
    const header = !head && at === 0 && headerColumn;
    const cell = head ? newCell(doc, "th", null, beside) : header ? newCell(doc, "th", "row") : newCell(doc);
    const look = header ? null : sharedLook(slots.matrix[r].slice(headerColumn ? 1 : 0));
    if (look !== null) wearLook(cell, look);
    row.insertBefore(cell, cellFrom(slots, row, at));
    made.push(cell);
    // A header column stays the first: the cell that was first is a plain one now.
    if (at === 0 && headerColumn && !head && slots.places.get(first).r === r) retagCell(first, "td");
  });
  return made;
}

/** Rows `from` … `to` taken out (never every body row). Returns whether it did. */
export function removeRows(unit, from, to) {
  const { rows, body, slots } = tableState(unit);
  const going = rows.slice(from, to + 1);
  if (going.length === 0 || [...body.rows].every((row) => going.includes(row))) return false;
  return keepWidths(unit, () => {
    const next = rows[to + 1];
    const column = new Map([...slots.places].map(([cell, place]) => [cell, place.c]));
    for (const [cell, place] of slots.places) {
      const bottom = place.r + place.rows - 1;
      if (bottom < from || place.r > to) continue;
      const overlap = Math.min(bottom, to) - Math.max(place.r, from) + 1;
      // From above them: shorter. Beginning in them and going on below: moved down to the row
      // after them, shorter.
      if (place.r < from) setSpan(cell, place.rows - overlap, place.cols);
      else if (bottom > to) {
        setSpan(cell, bottom - to, place.cols);
        next.insertBefore(cell, [...next.cells].find((other) => column.get(other) > place.c) ?? null);
      }
    }
    going.forEach((row) => row.remove());
    dropEmptyHead(unit);
    return true;
  });
}

/** Columns `from` … `to` taken out (never every column): a merged cell across them narrower. Returns whether it did. */
export function removeColumns(unit, from, to) {
  const { columns, slots } = tableState(unit);
  if (to - from + 1 >= columns) return false;
  for (const [cell, place] of slots.places) {
    const right = place.c + place.cols - 1;
    if (right < from || place.c > to) continue;
    const overlap = Math.min(right, to) - Math.max(place.c, from) + 1;
    if (overlap === place.cols) cell.remove();
    else setSpan(cell, place.rows, place.cols - overlap);
  }
  return true;
}

// The header row and column are whatever row and column are first. After a move of
// rows the thead holds as many rows as before: a row that came into it is of th, one that left it of
// td, its first cell the header column's th when the table has one.
function settleHeaderRows(unit, order, heads, headerColumn) {
  const { head, body } = tableParts(unit);
  const moved = order.filter((row, index) => (index < heads) !== (row.parentElement === head));
  head.append(...order.slice(0, heads));
  body.append(...order.slice(heads));
  for (const row of moved) {
    [...row.cells].forEach((cell, index) => (row.parentElement === head ? retagCell(cell, "th") : retagCell(cell, headerColumn && index === 0 ? "th" : "td", headerColumn && index === 0 ? "row" : null)));
  }
}

// After a move of columns, each body row's cell in the first column is the header column's th, the
// one that was first a td.
function settleHeaderColumn(unit) {
  const { rows, body, slots } = tableState(unit);
  for (let r = rows.length - body.rows.length; r < rows.length; r++) {
    for (const cell of [...rows[r].cells]) {
      if (slots.places.get(cell).c === 0) retagCell(cell, "th", "row");
      else if (cell.localName === "th" && cell.getAttribute("scope") === "row") retagCell(cell, "td");
    }
  }
}

/**
 * Row `from` moved to `to` (its place among the rows once moved), with the rows a merged cell ties
 * it to, never into another such group; one moved to the top is the header row (rows tied together
 * go neither into nor out of it). Returns [first, last] of where they are now, or false.
 */
export function moveRow(unit, from, to) {
  const { rows, head, headerColumn } = tableState(unit);
  if (!rows[from] || !rows[to]) return false;
  const [g0, g1] = rowRange(unit, from);
  const [t0, t1] = rowRange(unit, to);
  if (t0 === g0) return false;
  const heads = head?.rows.length ?? 0;
  if ((g1 > g0 || t1 > t0) && heads > 0 && (g0 < heads || t0 < heads)) return false;
  const group = rows.slice(g0, g1 + 1);
  const order = rows.filter((row) => !group.includes(row));
  const at = t0 > g0 ? order.indexOf(rows[t1]) + 1 : order.indexOf(rows[t0]);
  order.splice(at, 0, ...group);
  return keepWidths(unit, () => {
    if (heads > 0) settleHeaderRows(unit, order, heads, headerColumn);
    else tableParts(unit).body.append(...order);
    return [at, at + group.length - 1];
  });
}

/**
 * Column `from` moved to `to`, with the columns a merged cell ties it to, never into another such
 * group; one moved to the front is the header column. Returns [first, last] of where they are now, or false.
 */
export function moveColumn(unit, from, to) {
  const { rows, columns, headerColumn, slots } = tableState(unit);
  if (from < 0 || to < 0 || from >= columns || to >= columns) return false;
  const [g0, g1] = columnRange(unit, from);
  const [t0, t1] = columnRange(unit, to);
  if (t0 === g0) return false;
  const order = [...Array(columns).keys()];
  const group = order.splice(g0, g1 - g0 + 1);
  const at = t0 > g0 ? order.indexOf(t1) + 1 : order.indexOf(t0);
  order.splice(at, 0, ...group);
  const column = new Map(order.map((old, index) => [old, index]));
  for (const row of rows) row.append(...[...row.cells].sort((a, b) => column.get(slots.places.get(a).c) - column.get(slots.places.get(b).c)));
  if (headerColumn && (g0 === 0 || at === 0)) settleHeaderColumn(unit);
  return [at, at + group.length - 1];
}

/** The header row on (the first body row into a thead, its cells th) or off (back to the tbody's top, td). */
export function setHeaderRow(unit, on) {
  const { table, head, body, headerRow, headerColumn } = tableState(unit);
  if (on === headerRow) return false;
  if (on) {
    const first = body.rows[0];
    if (!first || body.rows.length < 2) return false; // a table keeps a body row
    if ([...first.cells].some((cell) => cell.rowSpan > 1)) return false; // a merged cell ties it to the rows below
    const thead = head ?? unit.ownerDocument.createElement("thead");
    if (!head) table.insertBefore(thead, body);
    thead.append(first);
    for (const cell of [...first.cells]) retagCell(cell, "th");
  } else {
    for (const row of [...head.rows].reverse()) {
      body.insertBefore(row, body.firstChild);
      [...row.cells].forEach((cell, index) => (index === 0 && headerColumn ? retagCell(cell, "th", "row") : retagCell(cell, "td")));
    }
    head.remove();
  }
  return true;
}

/**
 * Whether a table's first column holds its rows' names, so that 一键优化 makes it the header column:
 * its body cells (none merged down it) read as the rows' names (index.mjs rowNames: none a number by
 * the kit's reading).
 */
export function labelColumn(unit) {
  const { rows, body, slots } = tableState(unit);
  if (!body || !slots || slots.columns < 2) return false;
  const cells = [];
  for (let r = rows.length - body.rows.length; r < rows.length; r++) {
    const cell = slots.matrix[r][0];
    const place = slots.places.get(cell);
    if (place.r !== r || place.rows > 1) return false;
    cells.push(cell);
  }
  return rowNames(cells);
}

/**
 * 一键优化 (the table's block menu; a table pasted from elsewhere comes in so): the kit's column
 * widths (自动调整列宽: many columns scroll sideways in the frame), a header row, the first column a
 * header column when its words are the rows' names, its numeric columns read (识别数字列: centered,
 * sorted by their header), and a frame shown whole (显示全部行) that is taller than the kit's scroll
 * height scrolling again (one that scrolls already stays as it is). Inside one undo step (the
 * caller's). Returns whether it changed anything.
 */
export function optimizeTable(unit) {
  let changed = setHeaderRow(unit, true);
  if (!tableState(unit).headerColumn && labelColumn(unit)) changed = setHeaderColumn(unit, true) || changed;
  const widths = columnWidths(unit);
  if (widths) {
    placeWidths(unit, widths.map(() => null));
    changed = true;
  }
  if (unit.getAttribute(NUMBERS) === "off") {
    unit.removeAttribute(NUMBERS);
    changed = true;
  }
  const { table } = tableParts(unit);
  if (unit.style.getPropertyValue(TABLE_HEIGHT).trim() === "none" && table.offsetHeight > scrollHeight(unit)) {
    unit.style.removeProperty(TABLE_HEIGHT);
    if (unit.getAttribute("style") === "") unit.removeAttribute("style");
    changed = true;
  }
  return changed;
}

/** The header column on (each body row's cell in the first column th scope="row") or off (td); its cells' looks untouched either way (the header column only sticks). */
export function setHeaderColumn(unit, on) {
  const { rows, body, headerColumn, slots } = tableState(unit);
  if (on === headerColumn) return false;
  for (let r = rows.length - body.rows.length; r < rows.length; r++) {
    const cell = slots.matrix[r][0];
    if (slots.places.get(cell).r === r) retagCell(cell, on ? "th" : "td", on ? "row" : null);
  }
  return true;
}

// A copy of a cell: its text (a locked cell's words alone: what a script drew in it is not its
// text), its look (index.mjs CELL_LOOKS) and its spans.
const copyCell = (from, to) => {
  if (from.hasAttribute("data-ge-lock")) to.textContent = from.textContent;
  else to.innerHTML = from.innerHTML;
  for (const name of from.classList) if (CELL_LOOKS.includes(name)) to.classList.add(name);
  setSpan(to, from.rowSpan, from.colSpan);
};

/** Rows `from` … `to` (grown so that no merged cell is cut) copied after them (their text and look; new rows). Returns the copies. */
export function duplicateRows(unit, from, to) {
  const [r0, r1] = rowRange(unit, from, to);
  const { rows } = tableParts(unit);
  const doc = unit.ownerDocument;
  const copies = rows.slice(r0, r1 + 1).map((row) => {
    const copy = doc.createElement("tr");
    copy.setAttribute("data-ge-new", "");
    for (const cell of [...row.cells]) {
      const made = newCell(doc, cell.localName, cell.getAttribute("scope"));
      copyCell(cell, made);
      copy.append(made);
    }
    return copy;
  });
  rows[r1].after(...copies);
  return copies;
}

/** Columns `from` … `to` (grown so that no merged cell is cut) copied after them. Returns the new cells. */
export function duplicateColumns(unit, from, to) {
  const [c0, c1] = columnRange(unit, from, to);
  const { rows, slots } = tableState(unit);
  const doc = unit.ownerDocument;
  return rows.flatMap((row) => {
    const before = cellFrom(slots, row, c1 + 1);
    return [...row.cells].filter((cell) => slots.places.get(cell).c >= c0 && slots.places.get(cell).c <= c1).map((cell) => {
      const copy = newCell(doc, cell.localName === "th" && cell.getAttribute("scope") !== "row" ? "th" : "td");
      copyCell(cell, copy);
      row.insertBefore(copy, before);
      return copy;
    });
  });
}

// ---------- merged cells ----------

const filled = (cell) => cell.innerHTML.replace(/<br\s*\/?>/gi, "").trim() !== "";

/**
 * The cells of a rectangle { r0, r1, c0, c1 } (grown so that no merged cell is cut) made one
 * (合并单元格): the top left one spans it, holding its own content and then each other
 * cell's that has any, each on a line of its own; the others go. Not across the header row and the
 * body, nor with a cell a script fills. Returns the cell, or false.
 */
export function mergeCells(unit, rect) {
  const { slots, head } = tableState(unit);
  const { r0, r1, c0, c1 } = closeRect(slots, rect);
  const heads = head?.rows.length ?? 0;
  if (r0 < heads && r1 >= heads) return false;
  const list = cellsIn(slots, { r0, r1, c0, c1 });
  if (list.length < 2 || list.some((cell) => cell.getAttribute("contenteditable") !== "true")) return false;
  const [first, ...others] = list;
  return keepWidths(unit, () => {
    const doc = unit.ownerDocument;
    let lines = filled(first) ? 1 : 0;
    if (!lines) first.replaceChildren();
    for (const cell of others) {
      if (!filled(cell)) continue;
      if (lines++ > 0) first.append(doc.createElement("br"));
      first.append(...[...cell.childNodes].map((node) => node.cloneNode(true)));
    }
    setSpan(first, r1 - r0 + 1, c1 - c0 + 1);
    others.forEach((cell) => cell.remove());
    return first;
  });
}

/**
 * A merged cell made separate cells again (拆分单元格): it keeps its content in its top left slot,
 * new empty cells (of its tag; a header column's th only in the first column) fill the others.
 * Returns the cells of its rectangle, or false.
 */
export function splitCell(unit, cell) {
  const { rows, slots } = tableState(unit);
  const place = slots?.places.get(cell);
  if (!place || (place.rows === 1 && place.cols === 1)) return false;
  const doc = unit.ownerDocument;
  const rowHeader = cell.localName === "th" && cell.getAttribute("scope") === "row";
  return keepWidths(unit, () => {
    const made = [cell];
    for (let r = place.r; r < place.r + place.rows; r++) {
      const before = cellFrom(slots, rows[r], place.c + place.cols);
      for (let c = place.c; c < place.c + place.cols; c++) {
        if (r === place.r && c === place.c) continue;
        const piece = rowHeader ? (c === 0 ? newCell(doc, "th", "row") : newCell(doc)) : newCell(doc, cell.localName, null, cell);
        rows[r].insertBefore(piece, before);
        made.push(piece);
      }
    }
    setSpan(cell, 1, 1);
    return made;
  });
}

// ---------- its columns' widths ----------

/**
 * Each column's width (index.mjs COLUMN_WIDTH) as the kit reads it: the first cell of that column
 * alone, top down, that has one; null each where none has; null when no column has one.
 */
export function columnWidths(unit) {
  const { slots } = tableState(unit);
  if (!slots) return null;
  const widths = widthsOf(slots, widthOf);
  return widths.some(Boolean) ? widths : null;
}

/**
 * The columns' widths (px strings or null each) written where the table's tools write them: on the
 * topmost cell of each column alone (shared/table-slots.mjs widthHolder), off every other cell.
 */
export function placeWidths(unit, widths) {
  const { slots } = tableState(unit);
  if (!slots) return;
  const holders = new Map(widths.map((width, c) => [widthHolder(slots, c), width]).filter(([cell, width]) => cell && width));
  for (const cell of slots.places.keys()) {
    const width = holders.get(cell) ?? null;
    if (width) cell.style.setProperty(COLUMN_WIDTH, width);
    else if (widthOf(cell)) cell.style.removeProperty(COLUMN_WIDTH);
    if (cell.getAttribute("style") === "") cell.removeAttribute("style");
  }
}

// A change that may take away or merge the cells holding the columns' widths: the widths written
// again after it, each where its column holds it now.
function keepWidths(unit, mutate) {
  const widths = columnWidths(unit);
  const out = mutate();
  if (out && widths) placeWidths(unit, widths);
  return out;
}

/**
 * A cell as a td or th (`scope`: a th's, null for none): a new element of that tag in its place,
 * taking its attributes, a copy of its content (the old cell keeps its own, for undo to put back)
 * and its identity (it stays the same cell to the commits); the header row's look taken or lost when
 * the cell comes into or leaves the kind that wears it (wearsHeaderLook): a header column's th wears
 * none, and a cell switched between td and it keeps its looks. A th only given another scope stays
 * itself unless its look changes (a new element then too, so undo puts its classes back).
 */
export function retagCell(cell, tag, scope = null) {
  if (!cell) return cell;
  const look = wearsHeaderLook(tag, tag === "th" ? scope : null);
  const changes = wearsHeaderLook(cell.localName, cell.getAttribute("scope")) !== look;
  if (cell.localName === tag && !changes) {
    if (tag === "th" && scope) cell.setAttribute("scope", scope);
    else cell.removeAttribute("scope");
    return cell;
  }
  const next = cell.ownerDocument.createElement(tag);
  for (const { name, value } of [...cell.attributes]) if (name !== "scope") next.setAttribute(name, value);
  if (tag === "th" && scope) next.setAttribute("scope", scope);
  if (changes) headerLook(next, look);
  next.append(...[...cell.childNodes].map((node) => node.cloneNode(true)));
  cell.replaceWith(next);
  return next;
}

// A thead left with no rows goes.
function dropEmptyHead(unit) {
  const { head } = tableParts(unit);
  if (head && head.rows.length === 0) head.remove();
}
