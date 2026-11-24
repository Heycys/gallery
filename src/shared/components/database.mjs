// A database (多维表格): records in a table, their columns and views in a script of JSON
// (src/shared/database.mjs says the format). A whole block the kit draws (render/kit/database/): the
// table, a board, a list, cards, a calendar or a chart of its records, each view's filters, sorts,
// groups and hidden columns its own. Its two parts are written by the kit's drawing as one edit
// (context.edit: the page editor's undo step, src/editor/components/database/), its JSON laid out as
// it was, its table a row per record. With no script, or where nothing runs (an export to Markdown,
// gallery read), it is the table it holds.

/**
 * The class of the blocks whose content is data, never text shown as the file holds it: a database, its
 * script and table its drawing's to read and its drawing the kit's own. The kit's passes over the page's text
 * (runtime/spacing.js: the spaces beside code, ranges, long runs, an item's line; math.js: formulas)
 * leave all of such a block alone, so that nothing of theirs gets into its parts or its drawing.
 */
export const DATA_ONLY = "doc-database";

export default {
  id: "database",
  category: "whole",
  match: "div.doc-database",
  assets: ["database-styles", "database"],
  uses: [/doc-database\b/],
  parts: {
    columns: { at: ':scope > [type="application/json"]', edit: "data", max: 1, optional: true },
    records: { at: ":scope > table", edit: "data", max: 1, optional: true },
  },
  attrs: {
    "data-column": "on a database's header cell: the id of the column its cells are, as its JSON names it",
    "data-record": "on a database's row: the id of its record, which the slot of its body names (data-doc-slot=\"record:<id>\" in its div.doc-database-pages)",
  },
  classes: ["doc-database", "doc-database-pages"],
  runtime: {
    // Its drawing; and what a record's details draw in its pages while they show a body there (kit/database/peek.js).
    generated: [".doc-database-app"],
    // The body says a drag or a resize of a drawing lasts, while it does (kit/database/drag-cursor.js): the whole page shows its cursor.
    // data-doc-views-width: on its drawing, the width its views take (its widest table view's, px: database/across.js), by which its own 宽多维表格 is offered.
    // Its pages while they are a record's details (data-doc-peek, a popover, a surface the page editor draws its tools in), the slot shown.
    attrs: { ".doc-database": ["data-doc-database"], ".doc-database-app": ["data-doc-views-width"], body: ["data-doc-database-drag"], ".doc-database-pages": ["data-doc-peek", "data-doc-surface", "popover", "role", "aria-label", "style"], "[data-doc-slot]": ["data-doc-shown"] },
    // The page's own scrollbar out of sight while details stand at its side (kit/database/peek.js).
    root: { classes: ["doc-peek-side", "doc-peek-gutter"] },
    // What its drawing names in what it draws: its own classes, and the marks of its cells, rows, cards and days.
    internal: ["doc-database-*", "db-*", "data-placeholder", "data-cell", "data-head", "data-axis", "data-rowid", "data-chip", "data-col", "data-opt", "data-card", "data-day", "data-tok", "data-keep-popovers", "data-doc-keep-popovers", "data-key", "data-layout", "data-scroll", "data-field", "data-for", "data-prop", "data-type", "data-editor", "data-arrow", "data-group", "data-shows"],
  },
};
