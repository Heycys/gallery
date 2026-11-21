import { svg } from "../icons.mjs";
import { HIGHLIGHT } from "../kit.mjs";
import { setApart } from "../set-apart.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { boxed, flowRows } from "../read-rows.mjs";

// 高亮块: the kit's .doc-panel, a box of blocks that keep their own types, with the opening
// summary's look. The opening summary (.doc-summary) is one like any other: only the writing
// rules put it first. There is none inside another.
//
// Where the engines reach it (src/editor/page/ unless named): typing/ (Enter on its empty last
// paragraph: `leaveByEnter`, typing/leave.mjs),
// convert.mjs (a block turned into one keeps its type; none inside another), clipboard/own/ (copying
// it, and any block with its class: `clipboard`).
// Its look: the kit's styles/highlight.css (src/render/kit/).
const SUMMARY = "doc-summary";

export default {
  name: "highlight",
  listed: () => t("高亮块"),
  glance: { row: 1, name: "开头概括", write: "`section.doc-summary`, `<p><strong>` headings", rule: "The page" },
  units: {
    highlight: {
      name: t("高亮块"),
      match: [
        { rank: 10, class: "doc-summary" }, // the opening summary: a highlight panel that comes first
        { rank: 220, class: "doc-panel" },
      ],
      boxed: true,
      removedEmpty: true, // Backspace on its one empty block deletes it whole (typing/)
      colors: ["background"],
      // gallery read (../read-rows.mjs): boxed with its blocks, the opening summary by its name (its aria-label the kit's).
      read: {
        name: "高亮块",
        label: (node) => (node.el.classList.contains(SUMMARY) ? "开头概括" : "高亮块"),
        rows: (node, view) => boxed(node, `${node.el.classList.contains(SUMMARY) ? "开头概括" : "高亮块"}${view.tools.looks(node.el, { skip: node.el.classList.contains(SUMMARY) ? ["aria-label"] : [] })}`, flowRows(node.children, view)),
      },
    },
  },
  boxes: {
    highlight: {
      role: "flow", name: t("高亮块"),
      also: ["icon"], // a highlight block's icon
      leaveByEnter: true, // Enter on its empty last block moves that block out after it (typing/leave.mjs)
      endIsPadding: true, // under its last block is its padding: a click there makes no block (the user's, 2026-11-06; geometry.mjs endOf)
      lead: "icon", // its icon, first in it
      firstLineActs: true, // its first block shows its handle
      groups: true,
      holdsOne: true, // emptied, it keeps an empty paragraph after its icon (core.mjs tidyEmptied)
      selectAll: { content: true },
      classes: [
        { rank: 50, class: "doc-summary" },
        { rank: 70, class: "doc-panel" },
      ],
    },
  },
  types: {
    highlight: {
      turn: 11, menu: ["basic", 12],
      tag: "div", className: "doc-panel", kind: "highlight", box: "highlight", leaf: "paragraph", container: ".doc-panel:not(details)",
      takesAsIs: true, holder: 3,
      nests: false, // none inside another (a drop or a file may still nest one)
      joins: false, // a block turned into one is one of its own, never another's
      leadIcon: "💡", // a new highlight block's icon
      // Its blocks, one with words straight in it a paragraph of them (set-apart.mjs, the callout's rule too).
      clipboard: { kind: "aside", claims: HIGHLIGHT.match, ...setApart("highlight", HIGHLIGHT.match) },
      label: t("高亮块"), icon: svg('<rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2.5"/><rect x="6" y="6.5" width="8" height="2.75" rx=".6" fill="currentColor" stroke="none" opacity=".35"/><path d="M6.25 12.75h7.5"/>'),
      words: "高亮块 高亮 概述 摘要 gaoliang gaishu zhaiyao glk gl highlight panel summary",
      glance: { row: 12, name: "高亮块", before: "; ", write: "`<aside>`", after: "`aside.doc-panel` (one made in the preview a `div.doc-panel`, the same block)", rule: "Kit blocks" },
    },
  },
};
