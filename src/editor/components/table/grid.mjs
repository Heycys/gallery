// A table's rows and cells on the page (docs/editor.md, "Tables"), as the commits compare them: the
// table unit's grid when the file has it written as the kit writes one (its thead's rows, then its tbody's,
// each of cells, merged ones tiling a rectangle with the others), else null (only its cells' text is
// edited). Whether it is, the server judged once (source/table.mjs plainTable) and marked on the unit
// (index.mjs GRID); this reads the mark, it judges nothing. What a commit sends of a table whose grid
// changed is its rows anew (source/table.mjs): each row and cell by where it was when the page last
// committed, or new; a cell's text where it changed, its spans where they changed.

import { GRID, lookOf, widthOf } from "./index.mjs";
// An element's identity (core.mjs ELEMENT_ID): a cell retagged (td and th) stays the same cell, as
// its new element takes the old one's identity (page.mjs retagCell).
const ID = "data-ge-id";
const PREFIX = `${Math.random().toString(36).slice(2, 6)}t`;
let count = 0;
const idOf = (element) => element.getAttribute(ID) ?? (element.setAttribute(ID, `${PREFIX}${(count++).toString(36)}`), element.getAttribute(ID));

/** The table element of a table unit (its frame's, or the table itself). */
export const tableOf = (unit) => (unit?.localName === "table" ? unit : unit?.querySelector?.(":scope > table") ?? null);

/** A table unit's grid: { table, rows: [{ el, head, cells: [{ el, tag, scope, look, width, rowspan, colspan }] }] }, or null when the unit has none (GRID). */
export function gridOf(unit) {
  const table = unit?.hasAttribute?.(GRID) ? tableOf(unit) : null;
  if (!table) return null;
  return {
    table,
    rows: [...table.querySelectorAll(":scope > thead > tr, :scope > tbody > tr")].map((row) => ({
      el: row,
      id: idOf(row),
      head: row.parentElement.localName === "thead",
      cells: [...row.children].map((cell) => ({ el: cell, id: idOf(cell), tag: cell.localName, scope: cell.localName === "th" ? cell.getAttribute("scope") : null, look: lookOf(cell), width: widthOf(cell), rowspan: cell.rowSpan, colspan: cell.colSpan })),
    })),
  };
}

const sameGrid = (a, b) => a.rows.length === b.rows.length && a.rows.every((row, r) => {
  const other = b.rows[r];
  return row.id === other.id && row.head === other.head && row.cells.length === other.cells.length
    && row.cells.every((cell, c) => cell.id === other.cells[c].id && cell.tag === other.cells[c].tag && cell.scope === other.cells[c].scope && cell.look === other.cells[c].look && cell.width === other.cells[c].width
      && cell.rowspan === other.cells[c].rowspan && cell.colspan === other.cells[c].colspan);
});

/**
 * What a commit sends of a table whose grid changed since `before` (its grid when the page last
 * committed): { rows } (source/table.mjs), or null when it did not change or is not plain now.
 * textOf(cell): a cell's text, and whether it changed ({ html, changed }).
 */
export function tableChange(before, unit, textOf) {
  const now = gridOf(unit);
  if (!before || !now || sameGrid(before, now)) return null;
  const position = new Map(before.rows.flatMap((row, r) => row.cells.map((cell, c) => [cell.id, [r, c]])));
  const looks = new Map(before.rows.flatMap((row) => row.cells.map((cell) => [cell.id, cell.look])));
  const widths = new Map(before.rows.flatMap((row) => row.cells.map((cell) => [cell.id, cell.width])));
  const spans = new Map(before.rows.flatMap((row) => row.cells.map((cell) => [cell.id, `${cell.rowspan}x${cell.colspan}`])));
  const rows = now.rows.map((row) => {
    const from = before.rows.findIndex((other) => other.id === row.id);
    return {
      head: row.head,
      from: from < 0 ? null : from,
      cells: row.cells.map((cell) => {
        const at = position.get(cell.id) ?? null;
        const { html, changed } = textOf(cell.el);
        // Its look where it changed (a new cell's when it has one).
        const look = at === null ? (cell.look ? cell.look : undefined) : cell.look !== looks.get(cell.id) ? cell.look : undefined;
        // Its column's width where it changed (a new cell's when it has one).
        const width = at === null ? (cell.width ?? undefined) : cell.width !== widths.get(cell.id) ? cell.width : undefined;
        // Its spans where they changed (a new cell's when it is merged).
        const spanned = at === null ? cell.rowspan > 1 || cell.colspan > 1 : spans.get(cell.id) !== `${cell.rowspan}x${cell.colspan}`;
        return { from: at, tag: cell.tag, ...(cell.scope ? { scope: cell.scope } : {}), ...(at === null || changed ? { html } : {}), ...(look !== undefined ? { look } : {}), ...(width !== undefined ? { width } : {}), ...(spanned ? { rowspan: cell.rowspan, colspan: cell.colspan } : {}) };
      }),
    };
  });
  return { rows };
}
