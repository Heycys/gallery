import { headingIcon } from "../icons.mjs";
import { ALIGN_TOGGLES } from "../align.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { textRows } from "../read-rows.mjs";

// 标题 1–4: headings h1–h4 (the fourth is body-sized, set apart by its weight; an author's h5 or h6 is
// kept as it is, never offered). A section's title is whatever heading it holds: no heading
// makes a section by itself.
//
// Where the engines reach it (src/editor/page/ unless named): typing/ (an empty heading's
// placeholder, `placeholder` below), convert.mjs and markdown/ ("# " to "#### "), core.mjs (Enter splits a
// heading into a paragraph), clipboard/own/ and src/transfer/markdown.mjs (written by its level: `clipboard`).
// Folding its section: page/fold/ (the triangle right of its words, what is hidden, the section going with
// it wherever blocks are taken away whole) and page.mjs (Ctrl/⌘+Enter in its words).
// Its color (颜色 in the block menu): class switches, colors.mjs; its alignment and indent (对齐与缩进), align.mjs.
// Its levels (`levels` on each type: what it becomes a level larger, `up`, or smaller, `down`; 标题 4
// smaller a paragraph whose words go bold, `boldDown`): the level badge's 所有标题增大一级 and 所有标题减小一级
// (page/fold/, convert.mjs headingShifts).
// Its look: the kit's styles/flow.css (src/render/kit/).
// How a heading of a level is written out: # … #### by level.
const writtenAs = (level) => ({ kind: "heading", level });

export default {
  name: "heading",
  listed: () => t("标题"), hideable: false,
  glance: { row: 2, name: "标题 2–4", write: "`<h2>`–`<h4>`", rule: "Text and lists" }, // no row of 标题 1: the page's title is written by gallery new
  units: {
    heading: {
      name: t("标题"),
      match: [{ rank: 190, tag: ["h1", "h2", "h3", "h4", "h5", "h6"] }],
      colors: ["text", "background"], toggles: ALIGN_TOGGLES,
      emptyIsNothing: true, fromWords: true,
      clipboard: { of: (unit) => writtenAs(Math.min(4, Number(unit.localName.slice(1)) || 2)) }, // h5 and h6, which no type stands for, as heading 4
      // gallery read (../read-rows.mjs): "#" by its level, its words with their marks, its look in its {…}.
      read: {
        name: "标题",
        rows: (node, { tools }) => textRows(node, `${"#".repeat(Number(node.el.localName.slice(1)) || 2)} ${tools.own(node.el) || "（空标题）"}${tools.looks(node.el)}`),
        words: (node, { tools }) => tools.words(node.el).split("\n"),
        data: (node) => ({ level: Number(node.el.localName.slice(1)) || 2 }),
      },
    },
  },
  types: {
    heading1: {
      turn: 3, menu: ["basic", 3],
      tag: "h1", kind: "heading", leaf: "heading1", text: true, empty: true, emptyToText: true, placeholder: t("标题 1"), untitled: true, clipboard: writtenAs(1), levels: { down: "heading2" },
      label: t("标题 1"), icon: headingIcon(1), hint: "#", markdown: [{ match: /^(#|＃)[ \u00a0\u3000]$/ }], words: "标题1 一级标题 大标题 biaoti1 yiji bt1 bt heading1 h1 title",
    },
    heading2: {
      turn: 4, menu: ["basic", 4],
      tag: "h2", kind: "heading", leaf: "heading2", text: true, empty: true, emptyToText: true, placeholder: t("标题 2"), untitled: true, clipboard: writtenAs(2), levels: { up: "heading1", down: "heading3" },
      label: t("标题 2"), icon: headingIcon(2), hint: "##", markdown: [{ match: /^(##|＃＃)[ \u00a0\u3000]$/ }], words: "标题2 二级标题 biaoti2 erji bt2 bt heading2 h2",
    },
    heading3: {
      turn: 5, menu: ["basic", 5],
      tag: "h3", kind: "heading", leaf: "heading3", text: true, empty: true, emptyToText: true, placeholder: t("标题 3"), untitled: true, clipboard: writtenAs(3), levels: { up: "heading2", down: "heading4" },
      label: t("标题 3"), icon: headingIcon(3), hint: "###", markdown: [{ match: /^(###|＃＃＃)[ \u00a0\u3000]$/ }], words: "标题3 三级标题 小标题 biaoti3 sanji bt3 bt heading3 h3",
    },
    heading4: {
      turn: 6, menu: ["basic", 6],
      tag: "h4", kind: "heading", leaf: "heading4", text: true, empty: true, emptyToText: true, placeholder: t("标题 4"), untitled: true, clipboard: writtenAs(4), levels: { up: "heading3", down: "paragraph", boldDown: true },
      label: t("标题 4"), icon: headingIcon(4), hint: "####", markdown: [{ match: /^(####|＃＃＃＃)[ \u00a0\u3000]$/ }], words: "标题4 四级标题 biaoti4 siji bt4 bt heading4 h4",
    },
  },
};
