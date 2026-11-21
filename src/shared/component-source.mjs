// What a component that hears `source` hears of attributes (src/render/kit/runtime/kernel.js;
// docs/render.md "A custom block on a page"): a change of an attribute in a part or a slot that says
// something of the file, and of a class only where a look class changes, so that what the kit and the
// editor toggle as they lay the page out is no change of the file's.

import { COLOR_NAMES } from "./colors.mjs";

/**
 * The attributes that say something of the file in a part or a slot, which a component hearing
 * `source` hears change (runtime/kernel.js): a to-do item checked, a cell's spans, what a table's
 * header and cells say of its sort (the table description's data-sort-*, listed one by one, as an
 * observer takes them). A class is one only where a look class changes (lookChanged); `hidden` and
 * `open` are the reader's, which `reveal` tells.
 */
export const SOURCE_ATTRIBUTES = ["data-checked", "rowspan", "colspan", "data-sort-status", "data-sort-type", "data-sort-key", "data-sort-default", "data-sort-ignore", "data-sort-value", "data-sort-rank"];

/**
 * The classes that are a block's or a cell's look, which a reader sets and the file keeps: a text color
 * or a fill (doc-text-<color>, doc-highlight-<color>), a text block's alignment and indent (a table's frame's alignment is the same two classes), a cell's alignments and its bold (table.mjs's
 * CELL_ALIGN_CLASSES, CELL_VALIGN_CLASSES, CELL_BOLD_CLASS, the editor's CELL_LOOKS). What the kit and
 * the editor toggle as they lay a page out (a table's number and doc-table--auto, a code block's
 * folds) is none, so that no component hears its own layout as a change of the file, and draws again
 * for ever.
 */
export const LOOK_CLASSES = new Set([
  ...COLOR_NAMES.flatMap((name) => [`doc-text-${name}`, `doc-highlight-${name}`]),
  // table.mjs's CELL_ALIGN_CLASSES, CELL_VALIGN_CLASSES and CELL_BOLD_CLASS, written out: an import of that
  // file would bring its description, prose and all, into the kit's runtime (tests/unit/installed.mjs
  // holds the two lists together).
  "doc-align-left", "doc-align-center", "doc-align-right", "doc-valign-top", "doc-valign-middle", "doc-valign-bottom", "doc-bold",
  // A paragraph's or a heading's indent (the editor's components/align.mjs INDENTS; its alignment is a cell's classes above).
  ...Array.from({ length: 8 }, (_, index) => `doc-indent-${index + 1}`),
]);

/** Whether a class attribute's look classes (LOOK_CLASSES) differ from `before` to `after`, either null for none. */
export function lookChanged(before, after) {
  const looks = (value) => [...new Set(String(value ?? "").split(/\s+/).filter((name) => LOOK_CLASSES.has(name)))].sort().join(" ");
  return looks(before) !== looks(after);
}
