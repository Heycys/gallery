// The table operations' and tools' own reading of a table's slots (docs/editor.md, "Tables"): a
// rectangle of slots grown until it cuts no merged cell, the cells covering one, where a cell goes in
// a row, a cell's spans set. The slots themselves (each row has a slot in each column, a cell covers
// a rectangle of them) are src/shared/table-slots.mjs, which the kit and the server read too.

/** A rectangle { r0, r1, c0, c1 } grown until it cuts no merged cell. */
export function closeRect(slots, rect) {
  let { r0, r1, c0, c1 } = rect;
  for (let grown = true; grown;) {
    grown = false;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const place = slots.places.get(slots.matrix[r][c]);
        const next = { r0: Math.min(r0, place.r), r1: Math.max(r1, place.r + place.rows - 1), c0: Math.min(c0, place.c), c1: Math.max(c1, place.c + place.cols - 1) };
        if (next.r0 !== r0 || next.r1 !== r1 || next.c0 !== c0 || next.c1 !== c1) {
          ({ r0, r1, c0, c1 } = next);
          grown = true;
        }
      }
    }
  }
  return { r0, r1, c0, c1 };
}

/** The cells covering a rectangle, each once, in reading order. */
export function cellsIn(slots, { r0, r1, c0, c1 }) {
  const cells = new Set();
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (slots.matrix[r]?.[c]) cells.add(slots.matrix[r][c]);
  return [...cells].sort((a, b) => slots.places.get(a).r - slots.places.get(b).r || slots.places.get(a).c - slots.places.get(b).c);
}

/** The first cell of row `r` (its element `row`) that begins at column `c` or right of it, or null: where a cell at `c` goes in. */
export const cellFrom = (slots, row, c) => [...row.cells].find((cell) => (slots.places.get(cell)?.c ?? -1) >= c) ?? null;

/** A cell's spans set: rows × columns (an attribute only past 1). */
export function setSpan(cell, rows, cols) {
  if (rows > 1) cell.setAttribute("rowspan", String(rows));
  else cell.removeAttribute("rowspan");
  if (cols > 1) cell.setAttribute("colspan", String(cols));
  else cell.removeAttribute("colspan");
}
