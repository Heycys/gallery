// The column that stays when a table's frame scrolls sideways: a sticky first column
// (.doc-table--sticky-first) or a header column (each body row's first cell a th scope="row").
// Both stick, and are filled, by styles/table.css alone.

/** The first cell of the column that stays when the frame scrolls sideways (a sticky first column, or a header column), or null. */
export function fixedFirstCell(table) {
  return table.classList.contains("doc-table--sticky-first")
    ? table.rows[0]?.cells[0] ?? null
    : table.querySelector(':scope > tbody > tr > th[scope="row"]:first-child');
}
