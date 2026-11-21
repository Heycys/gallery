// A table's slots (the HTML table model; docs/editor.md, "Tables"): each row has a slot in each
// column, and a cell covers a rectangle of them, one slot or more when it is merged (its rowspan and
// colspan). A cell is where its top left slot is ({ r, c }), the table's columns are its slots'
// columns. The one reading of a table's cells that the kit lays columns out by (render/kit/tables/),
// the page editor's table tools and operations (editor/components/table/, editor/page/table/) and the
// server's writing of a table (editor/source/table.mjs, components/table/file.mjs) share: tileSlots
// is the one tiling, slotsOf and tileSpans give it the cells of a DOM or the spans of an operation,
// and the cell that holds a column's width is the one columnCells / widthHolder say.

/**
 * Where cells stand, from their spans alone: rows [{ section, cells: [{ ref, rowspan, colspan }] }]
 * in order (`section`: what the row belongs to, a thead or a tbody; a cell never spans past it) →
 * { matrix: per row, the ref covering each slot; places: Map(ref → { r, c, rows, cols }), in reading
 * order; columns }, or null when the cells do not tile a rectangle (a hole, an overlap, a span past
 * its section or the table, a span of 0).
 */
export function tileSlots(rows) {
  const matrix = rows.map(() => []);
  const places = new Map();
  for (let r = 0; r < rows.length; r++) {
    let c = 0;
    for (const { ref, rowspan, colspan } of rows[r].cells) {
      while (matrix[r][c]) c++;
      if (!(rowspan >= 1) || !(colspan >= 1)) return null;
      for (let i = 0; i < rowspan; i++) {
        if (rows[r + i]?.section !== rows[r].section) return null;
        for (let j = 0; j < colspan; j++) {
          if (matrix[r + i][c + j]) return null;
          matrix[r + i][c + j] = ref;
        }
      }
      places.set(ref, { r, c, rows: rowspan, cols: colspan });
      c += colspan;
    }
  }
  const columns = matrix[0]?.length ?? 0;
  // Array holes count as undefined: a slot no cell covers.
  if (columns === 0 || matrix.some((row) => row.length !== columns || row.includes(undefined))) return null;
  return { matrix, places, columns };
}

/**
 * The slots of a table's rows (tr elements, the thead's first): tileSlots with the cells themselves
 * as refs, each row's section its parent.
 */
export const slotsOf = (rows) => tileSlots(rows.map((row) => ({ section: row.parentElement, cells: [...row.cells].map((cell) => ({ ref: cell, rowspan: cell.rowSpan, colspan: cell.colSpan })) })));

/**
 * Where cells given by their spans stand, without a DOM (the server's reading of an operation's rows
 * and of a new table): rows [{ head, cells: [[rowspan, colspan]] }] (the head rows first) → tileSlots
 * with each cell's "row:index" as its ref.
 */
export const tileSpans = (rows) => tileSlots(rows.map((row, r) => ({ section: row.head, cells: row.cells.map(([rowspan, colspan], index) => ({ ref: `${r}:${index}`, rowspan, colspan })) })));

/** The refs of the cells of column `c` alone (beginning there, one column wide), top down. */
export const columnCells = (slots, c) => [...slots.places].filter(([, place]) => place.c === c && place.cols === 1).map(([ref]) => ref);

/**
 * The cell that holds column `c`'s width where the table's tools write it (the page editor's
 * COLUMN_WIDTH): the topmost cell of that column alone, or null (a merged cell holds none).
 */
export const widthHolder = (slots, c) => columnCells(slots, c)[0] ?? null;

/**
 * Each column's width as it is read (the kit lays the table out at them): the first cell of that
 * column alone, top down, that has one (`widthOf(cell)`: a truthy width or null); null each where
 * none has.
 */
export const columnWidths = (slots, widthOf) => Array.from({ length: slots.columns }, (_, c) => {
  for (const cell of columnCells(slots, c)) {
    const width = widthOf(cell);
    if (width) return width;
  }
  return null;
});
