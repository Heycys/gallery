import { svg } from "../icons.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { flowRows, labeled, prefixed } from "../read-rows.mjs";

// 引用块: a blockquote, a box of paragraphs. A paragraph turned into a quote joins the quote right
// before or after it; an empty quote paragraph leaves the quote on Enter, as a paragraph, and so
// does Backspace at the start of its first (`resettable`, typing/leave.mjs).
//
// Where the engines reach it (src/editor/page/ unless named): typing/ (Enter, Backspace),
// convert.mjs (joining and splitting quotes, "> "), clipboard/own/ (`clipboard`), commit.mjs.
// Its look: the kit's styles/flow.css (src/render/kit/).
export default {
  name: "quote",
  listed: () => t("引用块"),
  units: {
    quote: { name: t("引用块"), match: [{ rank: 170, tag: "blockquote" }], removedEmpty: true, emptyIsNothing: true,
      // gallery read (../read-rows.mjs): a ── row, then its blocks behind "> ".
      read: { name: "引用块", rows: (node, view) => labeled(node, `引用块${view.tools.looks(node.el)}`, prefixed(flowRows(node.children, view), "> ")) } }, // no color: a paragraph turned into a quote is joined to it, its color staying the paragraph's
  },
  boxes: {
    quote: { role: "quote", name: t("引用块"), firstLineActs: true, selectAll: { content: true } }, // its first paragraph shows its handle
  },
  types: {
    quote: {
      turn: 13, menu: ["basic", 13],
      tag: "blockquote", kind: "quote", box: "quote", leaf: "paragraph", wraps: true, resettable: true, container: "blockquote", holder: 2,
      clipboard: {
        kind: "quote",
        across: (unit, { walk }) => (unit.localName === "blockquote" ? [{ type: "quote", blocks: walk(unit) }] : undefined), // its paragraphs in a quote
        check: (block, { container }) => container(block),
      },
      label: t("引用块"), icon: svg('<path d="M4.75 5v10"/><path d="M8.5 7h8M8.5 10h8M8.5 13h5"/>'), hint: ">", markdown: [{ match: /^[>＞》][ \u00a0\u3000]$/ }], words: "引用块 引用 引文 yinyong yinwen yyk yy quote blockquote",
      glance: { row: 3, name: "引用块", write: "`<blockquote><p>`", rule: "Text and lists" },
    },
  },
};
