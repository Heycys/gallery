import { svg } from "../icons.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { rowOf } from "../read-rows.mjs";

// 分割线: an <hr>, a block like any other (a line above a section is one at its top). Made only
// from an empty block ("---", the "/" menu, the block menu), followed by an empty paragraph to write
// in; turned into another type it becomes an empty block of that type. A press on its line selects it.
//
// Where the engines reach it (src/editor/page/ unless named): convert.mjs (`create`; turned into
// another type: `turnsEmpty`), markdown/ ("---": `markdown`), handle/ (a press on its line selects it:
// lineAt), geometry.mjs (its band ±12px: extentOf), core.mjs (its frame's corners), clipboard/own/ (`clipboard`),
// ../source/ (a void element), src/transfer/ (a line of Markdown).
// Its look: the kit's styles/flow.css (src/render/kit/).

/** A new divider line. */
export function newDivider(doc) {
  const rule = doc.createElement("hr");
  for (const [name, value] of [["data-ge-new", ""], ["data-ge-type", "divider"], ["data-ge-unit-kind", "rule"], ["data-ge-frame", ""], ["data-ge-round", "text"]]) rule.setAttribute(name, value);
  return rule;
}

export default {
  name: "divider",
  listed: () => t("分割线"),
  units: {
    rule: { name: t("分割线"), match: [{ rank: 230, tag: "hr" }], boxed: true, turnsEmpty: true, leadsChapter: true, read: { name: "分割线", rows: (node, { tools }) => [rowOf(node, `---${tools.looks(node.el)}`)], words: () => [] } },
  },
  types: {
    divider: {
      menu: ["basic", 15], fresh: 1, // no type a block turns into: made by "/" or 在下方新建
      tag: "hr", kind: "rule", bare: true,
      clipboard: {
        kind: "hr",
        describe: (node) => (node.localName === "hr" ? { type: "divider" } : undefined),
        check: () => true,
        build: ({ doc }) => newDivider(doc),
        text: () => [],
      },
      // It replaces an empty block; the empty paragraph after it is where the caret goes.
      create({ doc, put, paragraph }) {
        put(newDivider(doc));
        return put(paragraph());
      },
      label: t("分割线"), icon: svg('<path d="M3 10h14"/><path d="M5.5 6h9M5.5 14h9" stroke-opacity=".35"/>'),
      hint: "---", markdown: [{ match: /^---$/, alone: true }], words: "分割线 分隔线 横线 fengexian fgx hr divider line rule",
      glance: { row: 5, name: "分割线", write: "`<hr>`", rule: "The page" },
    },
  },
};
