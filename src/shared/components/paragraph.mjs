// A paragraph (文本), or small text (小字, p.doc-note): a basic block. Small text may end in a part at
// the line's right end (span.doc-tab: the page editor's Tab).

/**
 * A paragraph's or a heading's alignment and indent (the page editor's 对齐与缩进): centred or at the
 * right (left is neither), moved in by levels of two body characters (styles/flow.css).
 */
export const TEXT_ALIGN_CLASSES = ["doc-align-center", "doc-align-right", ...Array.from({ length: 8 }, (_, index) => `doc-indent-${index + 1}`)];

export default {
  id: "paragraph",
  category: "block",
  match: "p",
  tail: ".doc-tab", // small text's end part, a span at the line's right end
  classes: ["doc-note", "doc-tab", ...TEXT_ALIGN_CLASSES.filter((name) => name.startsWith("doc-indent-"))], // the alignments are the table's (a cell's), the same classes
};
