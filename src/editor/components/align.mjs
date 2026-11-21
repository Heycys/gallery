// A block's alignment, and a text block's indent (对齐与缩进 ›, a submenu of the block menu;
// components that say `toggles: ALIGN_TOGGLES`, a paragraph and a heading; a table, whose frame is placed
// on the page the same way, says `toggles: ALIGN_PLACES`). Class switches the file keeps and the
// kit draws (src/render/kit/styles/flow.css, table.css): centred or right-aligned (doc-align-center,
// doc-align-right; left is neither, the kit's own), and for a text block moved in by levels of two body
// characters (doc-indent-1 … doc-indent-8). The page editor's block menu sets them (page/align.mjs), Enter carries them
// to the block it makes (core.mjs newBlock), and Backspace at a block's start takes them off one at a
// time before it joins or deletes (typing/: the alignment first, then a level of indent).

import { TEXT_ALIGN_CLASSES } from "../../shared/components/paragraph.mjs";

/** The alignments a text block may have, by name: none is left (the kit's own). */
export const ALIGNS = { center: "doc-align-center", right: "doc-align-right" };

/** The indents' classes, level 1 first (the kit's: src/shared/components/paragraph.mjs). */
export const INDENTS = TEXT_ALIGN_CLASSES.filter((name) => name.startsWith("doc-indent-"));

/** The deepest indent. */
export const INDENT_MOST = INDENTS.length;

/** The classes of a text block's alignment and indent: its component's `toggles`. */
export const ALIGN_TOGGLES = TEXT_ALIGN_CLASSES;

/** The classes of a block's alignment alone (a table's frame: its component's `toggles`), the same two. */
export const ALIGN_PLACES = Object.values(ALIGNS);

/** The elements that take a text block's alignment and indent (a paragraph, a heading; a cell's alignment is its own classes'). */
export const TEXT_BLOCKS = "p, h1, h2, h3, h4";

/** A block's alignment: "left", "center" or "right". */
export const alignOf = (element) => Object.keys(ALIGNS).find((name) => element.classList.contains(ALIGNS[name])) ?? "left";

/** A block's indent: 0 to INDENT_MOST. */
export const indentOf = (element) => INDENTS.findIndex((name) => element.classList.contains(name)) + 1;

/** The look (class switches) that gives a block the alignment `name` ("left": none). */
export const alignLook = (name) => ({ classes: Object.fromEntries(Object.entries(ALIGNS).map(([each, cls]) => [cls, each === name])) });

/** The look that gives a block the indent `level` (0: none). */
export const indentLook = (level) => ({ classes: Object.fromEntries(INDENTS.map((cls, index) => [cls, index + 1 === level])) });

/**
 * The alignment and indent of text block `from` (a paragraph or a heading) given to `to`, a paragraph
 * made from it (Enter's split: core.mjs newBlock, the half after the caret or the empty line before it,
 * as a word processor's new line keeps its paragraph's). Returns `to`.
 */
export function carry(from, to) {
  if (!from?.matches?.(TEXT_BLOCKS)) return to;
  for (const name of ALIGN_TOGGLES) if (from.classList.contains(name)) to.classList.add(name);
  return to;
}

/** Whether a block takes an alignment (its kind's toggles hold it; `toggles`: TOGGLES of its kind). */
export const aligns = (toggles) => Boolean(toggles?.includes(ALIGNS.center));

/** Whether a block takes an indent too, as a text block does (a table's alignment has none). */
export const indents = (toggles) => Boolean(toggles?.includes(INDENTS[0]));
