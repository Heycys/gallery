import { svg } from "../icons.mjs";
import { PARAGRAPH, classOf } from "../kit.mjs";
import { ALIGN_TOGGLES } from "../align.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { textRows } from "../read-rows.mjs";

// 文本 and 小字: the plain text blocks. A paragraph is the editor's default block: Enter makes one,
// an emptied list item or quote paragraph becomes one, a click below the last block starts one.
// 小字 is the kit's .doc-note. Being the
// default, a paragraph is the engines' own: core.mjs (newHost, splitBlock), insert/
// (paragraphBefore, newParagraph, clickBlank), convert.mjs (typeOf tells 小字 from text), clipboard/own/
// (a text block's description is the engine's own, and a block that says no kind is written as a paragraph).
// Its color (颜色 in the block menu): class switches, colors.mjs; its alignment and indent (对齐与缩进), align.mjs.
// Its look: the kit's styles/flow.css (src/render/kit/).
/** The class of small text's end part (the page editor's Tab), a span at the line's right end (the kit's styles/flow.css). */
export const TAB = classOf(PARAGRAPH.tail);

/** Small text: a p of the kit's .doc-note. The one place that knows it. */
export const isNote = (element) => element.localName === "p" && element.classList.contains("doc-note");

/** Whether a span is small text's end part (what the Tab key makes). */
export const isNoteTab = (node) => node.localName === "span" && node.classList.contains(TAB) && Boolean(node.parentElement && isNote(node.parentElement));

const NOTE = "doc-note";
// How gallery read writes one (read-rows.mjs): its words with their marks, small text and its look in its {…}.
const READ = {
  name: "文本",
  label: (node) => (node.el.classList.contains(NOTE) ? "小字" : "文本"),
  rows(node, { tools }) {
    const rows = textRows(node, tools.own(node.el) || "（空的文本块）");
    rows[rows.length - 1] = { ...rows.at(-1), text: `${rows.at(-1).text}${tools.looks(node.el, { keep: [NOTE] })}` };
    return rows;
  },
  words: (node, { tools }) => tools.words(node.el).split("\n"),
  lost: (node) => (node.el.classList.contains(NOTE) ? "小字 {n} 段（写成普通段落）" : null),
};

export default {
  name: "paragraph",
  listed: () => t("文本"), hideable: false,
  units: {
    paragraph: { name: t("文本"), match: [{ rank: 180, tag: "p" }], colors: ["text", "background"], toggles: ALIGN_TOGGLES, emptyIsNothing: true, fromWords: true, replacedByFile: true, read: READ },
  },
  types: {
    paragraph: {
      turn: 1, menu: ["basic", 1],
      tag: "p", kind: "paragraph", leaf: "paragraph", text: true, empty: true,
      label: t("文本"), icon: svg('<path d="M4.75 5.5V4.25h10.5V5.5M10 4.25v11.5M8.25 15.75h3.5"/>'), words: "文本 正文 段落 wenben zhengwen duanluo wb zw dl text paragraph p",
      glance: { row: 2, name: "文本", write: "`<p>`", rule: "Text and lists" },
    },
    note: { // 小字: a brief label, unit or scope note
      turn: 2, menu: ["basic", 2],
      tag: "p", className: "doc-note", kind: "paragraph", leaf: "note", text: true, empty: true, emptyToText: true,
      corner: "paragraph", // seldom picked: the gray corner of 文本's cell (type-grid.mjs), so 文本 and the headings fill one line
      label: t("小字"), icon: svg('<path d="M6.25 8.5v-.9h7.5v.9M10 7.6v8.15M8.75 15.75h2.5"/>'), words: "小字 注释 说明 备注 标注 xiaozi zhushi shuoming beizhu xz zs sm note small caption",
      glance: { row: 11, name: "小字", write: "`<p class=\"doc-note\">`, `span.doc-tab` at its right", rule: "Kit blocks" },
    },
  },
};
