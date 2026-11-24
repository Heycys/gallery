/** A cell's alignments (styles/table.css): its words to the left, the middle, the right. */
export const CELL_ALIGN_CLASSES = ["doc-align-left", "doc-align-center", "doc-align-right"];
/** A cell's vertical alignments (styles/table.css): its words at its top (the kit's own), middle, bottom. */
export const CELL_VALIGN_CLASSES = ["doc-valign-top", "doc-valign-middle", "doc-valign-bottom"];
/** A cell's words bold (styles/table.css). */
export const CELL_BOLD_CLASS = "doc-bold";

// A table, a container of cells: sortable by its headers unless static, its columns sized by
// tables/ (auto widths, a colgroup it adds), sticky header and first column, scrollbars of its own
// in a wrapper.
export default {
  id: "table",
  category: "container",
  match: "table.doc-table",
  frame: ".doc-table-wrap", // what the table scrolls in, a block with it
  lead: ".doc-table-meta", // its scope line right above its frame, which goes where the table goes
  assets: ["tables"],
  uses: [/<table[\s>]/i, /doc-table/],
  attrs: {
    "data-doc-table-static": "its row order means something: readers cannot sort it",
    "data-sortable-table": "a table not of the kit's class, sortable",
    "data-sort-status": "shows the current sort",
    "data-sort-type": "text, number or date",
    "data-sort-key": "a column's name",
    "data-sort-default": "asc or desc",
    "data-sort-ignore": "a column that does not sort",
    "data-sort-value": "a formatted cell's value to sort by",
    "data-sort-rank": "a cell numbered again after a sort",
    "data-column-key": "a column's name for its width",
    "data-number-columns": "off: no column read as numbers (none centered, none sortable by number), on the table or its frame",
    "data-doc-chart-source": "on its frame: the key a chart drawn from it reads it by (data-doc-chart-data on the chart's host)",
  },
  // The frame may be placed centred or at the right (doc-align-center, doc-align-right, a text block's: the page editor's 对齐 ›).
  // A cell may also be given a text color or a fill (doc-text-*, doc-highlight-*: text.mjs), an alignment, a vertical one and bold
  // (doc-bold); a header row's cell's look is doc-bold doc-highlight-gray, as the page editor gives it (a header column's th scope="row" none).
  classes: ["doc-table", "doc-table-wrap", "doc-table-meta", "doc-table--sticky-first", ...CELL_ALIGN_CLASSES, ...CELL_VALIGN_CLASSES, CELL_BOLD_CLASS],
  fills: { "th": ["data-sort-type"] },
  runtime: {
    generated: ["colgroup[data-doc-columns]", ".doc-scrollbars"],
    attrs: {
      "table.doc-table": ["data-doc-sortable-ready", "data-doc-filled"],
      ".doc-table-wrap": ["data-doc-min-width", "data-doc-layout", "data-doc-whole", "data-doc-across"], // data-doc-layout: the columns or rows it hides (tables/scrollbars.js); data-doc-whole: shown whole (tables/whole.js); data-doc-across: placed past the text (宽表格, tables/across.js)
      "th, td": ["data-column-kind", "data-column-wrap", "data-run-wrap", "data-doc-edge"], // data-run-wrap: a run of its code, or a number range, wider than its column (tables/layout.js); data-doc-edge: on the frame's right or bottom edge, in a table with a cell spanning rows (tables/edges.js)
    },
    classes: {
      "table.doc-table": ["doc-table--auto"],
    },
    // doc-scrollbar*, data-active, data-drag, data-timeline: the kit's scrollbars (kit/scrollbar.js), a frame's and a database's.
    internal: ["doc-code-run", "doc-table-sort-button", "doc-scrollbar*", "data-doc-sort-arrow", "data-active", "data-drag", "data-timeline", "data-x", "data-y", "data-more"],
  },
};
