import { slotsOf } from "../../../shared/table-slots.mjs";

// The cells of a framed table along the frame's right and bottom edges, where the frame's line is
// theirs (styles/table.css: they draw none of their own, the line drawn once). The stylesheet finds
// them itself from the first paint: a row's last cell, the last row's cells. A cell spanning rows
// makes that wrong, which only the table's slots can tell (src/shared/table-slots.mjs): a cell
// spanning down to the last row lies on the bottom edge, and in the last column the rows it spans
// down into end with a cell inside the table. So in a table with one, the cells on each edge are
// marked (data-doc-edge: "right", "bottom" or both; the stylesheet clears their lines by it),
// again whenever the table's content changes. A table whose cells do not tile a rectangle keeps the
// stylesheet's reading.

const EDGE = 'data-doc-edge';

/** Marks the cells on the frame's right and bottom edges of a framed table with a cell spanning rows; takes the marks off any other. */
export function markEdges(table) {
  const rows = [...table.rows];
  const edges = new Map();
  const spans = table.parentElement?.classList.contains('doc-table-wrap') && rows.some(row => [...row.cells].some(cell => cell.rowSpan !== 1));
  const slots = spans ? slotsOf(rows) : null;
  if (slots) {
    for (const [cell, {r, c, rows: down, cols}] of slots.places) {
      const sides = [c + cols === slots.columns && 'right', r + down === rows.length && 'bottom'].filter(Boolean).join(' ');
      if (sides) edges.set(cell, sides);
    }
  }
  // Written only when it changes.
  for (const cell of table.querySelectorAll(`:scope > * > tr > [${EDGE}]`)) if (!edges.has(cell)) cell.removeAttribute(EDGE);
  for (const [cell, sides] of edges) if (cell.getAttribute(EDGE) !== sides) cell.setAttribute(EDGE, sides);
}
