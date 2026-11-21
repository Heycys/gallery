import { svg } from "../icons.mjs";
import { CALLOUT } from "../kit.mjs";
import { setApart } from "../set-apart.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { boxed, flowRows } from "../read-rows.mjs";

// 提示块: the kit's .doc-callout, a box of blocks that keep their own types set apart on a fill, a
// line at its left (the user's, 2026-11-07: a container as the highlight block is). It is the
// highlight block's kind of block in every rule but its look: no icon leads it, its line, its square
// corners. One written the old way, words straight in it (every callout before 2026-11-07, and what
// an Agent may still write), holds them as one paragraph: natural HTML makes them one in the file
// the first time the page writes it (source/natural.mjs, a box that holds one), the clipboard reads
// it so (set-apart.mjs).
//
// Where the engines reach it (src/editor/page/ unless named): typing/ (Enter on its empty last
// paragraph: `leaveByEnter`, typing/leave.mjs; Backspace in its one empty block: `removedEmpty`),
// convert.mjs (a block turned into one keeps its type; none inside another), clipboard/own/ (copying
// it, and any block with its class: `clipboard`), handle/ (its first line shows its handle:
// `firstLineActs`). Its look: the kit's styles/callout.css (src/render/kit/); its color a background
// only, the palette's blue when it has none (`colorDefaults`: that blue is the one 颜色 › marks, and
// picking it writes no class).

// Its type's icon: a rounded box whose left side is a bar more than twice as thick as its lines (the
// callout's line), the text's T in the middle of the room right of it. Drawn on the 20-unit grid
// as the other types' are.
const CALLOUT_ICON = svg('<rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2.5"/><path d="M5.5 3.26A2.5 2.5 0 0 0 3.25 5.75v8.5a2.5 2.5 0 0 0 2.25 2.49z" fill="currentColor" stroke="none"/><path d="M7.65 7.6v-.85h6.2v.85M10.75 6.75v6.75M9.65 13.5h2.2"/>');

export default {
  name: "callout",
  listed: () => t("提示块"),
  units: {
    callout: {
      name: t("提示块"), match: [{ rank: 130, class: "doc-callout" }],
      boxed: true,
      removedEmpty: true, // Backspace on its one empty block deletes it whole (typing/)
      colors: ["background"], colorDefaults: { background: "blue" },
      // gallery read (../read-rows.mjs): boxed with its blocks; the export's Markdown writes it as a highlight block.
      read: { name: "提示块", rows: (node, view) => boxed(node, `提示块${view.tools.looks(node.el)}`, flowRows(node.children, view)), lost: () => "提示块 {n} 个（和高亮块一样写成 <aside>）" },
    },
  },
  boxes: {
    callout: {
      role: "flow", name: t("提示块"),
      leaveByEnter: true, // Enter on its empty last block moves that block out after it (typing/leave.mjs)
      endIsPadding: true, // under its last block is its padding: a click there makes no block (geometry.mjs endOf)
      firstLineActs: true, // its first block shows its handle
      groups: true,
      holdsOne: true, // emptied, it keeps an empty paragraph (core.mjs tidyEmptied)
      selectAll: { content: true },
      classes: [{ rank: 75, class: "doc-callout" }],
    },
  },
  types: {
    callout: {
      turn: 12, menu: ["basic", 11],
      tag: "div", className: "doc-callout", kind: "callout", box: "callout", leaf: "paragraph", container: ".doc-callout",
      takesAsIs: true, holder: 4,
      nests: false, // none inside another (a drop or a file may still nest one)
      joins: false, // a block turned into one is one of its own, never another's
      // Its blocks, one with words straight in it a paragraph of them (set-apart.mjs, the highlight block's rule too).
      clipboard: { kind: "aside", claims: CALLOUT.match, ...setApart("callout", CALLOUT.match) },
      label: t("提示块"), icon: CALLOUT_ICON,
      words: "提示块 提示框 提示 注意 警告 tishi zhuyi jinggao tsk ts callout tip warning notice",
      glance: { row: 12, name: "提示块", write: "`div.doc-callout` holding `<p>`", rule: "Kit blocks" },
    },
  },
};
