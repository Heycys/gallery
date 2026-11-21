// A table shown whole (docs/render.md, "Table layout internals"): its frame as tall as its rows,
// without the kit's height (styles/table.css, .doc-table-wrap[data-doc-whole]), when it is
// short or mostly words: a table read from top to bottom, which a frame of the kit's height would
// cut into a window of a few rows. A long table of data keeps the kit's height, its rows scrolling
// under the header row that stays. A height written on the frame (--doc-table-height, the
// reader's drag in the preview) is kept either way. layout.js reads the table and marks the frame.

/** The most body rows a table has that is shown whole for being short. */
export const WHOLE_ROWS = 20;

/**
 * Whether a table is shown whole: its body has at most WHOLE_ROWS rows (`rows`: its tbodies' rows,
 * those a filter hides too, so that filtering never changes it), or at least half of its body's
 * text stands in its columns of words (`columns`: each column's { words: whether it is one, width:
 * its body cells' texts measured on one line in the table's font, together }). A column of words is
 * the column allocator's narrative kind (auto-column-widths.ts columnKind: its cells four words or
 * a line as wide as the Latin alphabet on average, about thirteen Chinese characters, and not
 * mostly paths, links or long identifiers). So the length of what a table's sentences say, not how
 * many of its cells hold one, makes it read as words: a table of a date, a title, a group and a note
 * a sentence long is whole at any length, a long list of names, numbers, paths or links is not.
 */
export function shownWhole(rows, columns) {
  if (rows <= WHOLE_ROWS) return true;
  const all = columns.reduce((sum, column) => sum + column.width, 0);
  const words = columns.reduce((sum, column) => sum + (column.words ? column.width : 0), 0);
  return all > 0 && words * 2 >= all;
}
