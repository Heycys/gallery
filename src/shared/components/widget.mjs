// A whole block (整体块): an element of the report's own (a class of its own, no kit component), or
// one the kit draws whole (a diff: diff.mjs): it moves and goes as a whole. Its inside is free: the
// report's markup, styles and script, or the kit's; its words are edited in place, words only (its
// paragraphs, headings and items never split, joined or taken out on their own: src/editor/source/
// blocks.mjs), an inline element of the report's own in them kept whole (src/editor/page/own.mjs).
export default {
  id: "widget",
  category: "whole",
  pending: "the text of a document's own element is still edited in place; a whole block is to be moved alone",
};
