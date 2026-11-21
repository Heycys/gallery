import { componentOf } from "../../../shared/components/index.mjs";
import { svg } from "../icons.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { boxed, fenced, flowRows, plainRow, withoutNodes } from "../read-rows.mjs";

// How a block of it is written out: its words; a declared diff (its lines in the JSON it holds) as a
// fence of its lines, its title in bold.
const WORDS = { kind: "words" };
const DIFF = {
  kind: "code",
  read(unit, { plain }) {
    let lines = [];
    try {
      lines = JSON.parse(unit.querySelector('script[type="application/json"]')?.textContent ?? "{}").lines ?? [];
    } catch {}
    const sign = { added: "+", removed: "-" };
    return { title: plain(unit.querySelector(":scope > .doc-code-title")), language: "diff", lines: lines.map((line) => `${sign[line.type] ?? " "}${line.content ?? ""}`) };
  },
};

// The kit's whole blocks, as their descriptions name them: the classes of the reading state that are
// a block of their own (a filter, its row, the fields, the list of what was kept) and the diff.
const WHOLE = [...componentOf("state").wholes, ...componentOf("diff").classes];

// 整体块 (whole block): a report's own widget, any element with a class of its own that is no kit
// component, and what the kit draws whole (a diff: .doc-diff) or holds whole (a filter: its
// buttons and what they filter; a row of filter buttons, labelled fields, a list of what the reader kept).
// One block that moves and goes as a whole; nothing goes in or out. Its text (a label, a color's
// name, its paragraphs, headings and items, a step a card's drawing makes) is still editable as
// text blocks of words only (this host): emptied but not removed, never split or joined, an inline
// element of the report's own in them an atom kept as written
// (../../page/own.mjs) (pending: a whole
// block is to be moved alone, src/shared/components/widget.mjs); a script that uses it keeps it
// from being deleted. Where the engines reach it:
// ../source/ (its text: textLeaf, and its p, h1–h4 and li made words only in scan; what refers to
// it: keepReferenced), src/editor/page/hints/ (`readOnly`), src/transfer/markdown.mjs (`clipboard`:
// its words, never copied on the page).
// gallery read (../read-rows.mjs): boxed by its tag and classes, its words, its own HTML as the file has it; one that
// holds blocks of the editor's (a plain <div> around a few) those blocks, and its own words beside them.
const READ = {
  name: "整体块",
  rows(node, view) {
    const { tools } = view;
    const title = `整体块 <${node.el.localName}>${tools.looks(node.el, { all: true })}`;
    if (node.children.length) {
      const said = tools.wordsIn(withoutNodes(node.el, node.children));
      return boxed(node, `${title} · 里面是 ${node.children.length} 个块`, [...(said.length ? [plainRow(`它自己的文字：${said.join(" · ")}`), plainRow("")] : []), ...flowRows(node.children, view)]);
    }
    const said = tools.wordsIn(node.el);
    const lines = tools.source(node.el) ?? [node.el.outerHTML];
    return boxed(node, title, [...(said.length ? [plainRow(`文字：${said.join(" · ")}`)] : []), plainRow(`HTML（${lines.length} 行，文件里的原样）：`), ...fenced("html", lines)]);
  },
  words: (node, view) => [view.tools.wordsIn(withoutNodes(node.el, node.children)).join(" · "), ...view.flowWords(node.children)],
  lost: () => "整体块 {n} 个（只有文字）",
};

export default {
  name: "widget",
  glance: { row: 22, name: "整体块", write: "an element of a class of your own that is no figure (a strip of metrics, a panel of your own), styled in the page's `<style>`", rule: "Figures and charts" },
  readOnly: [{ rank: 30, at: ".doc-diff", says: t("代码对比由数据绘制，整块移动；要改内容，请让 Agent 修改。") }],
  units: {
    block: { clipboard: { of: (unit) => (unit.matches(".doc-diff") ? DIFF : WORDS) }, name: t("整体块"), match: WHOLE.map((name, at) => ({ rank: 104 + at, class: name })), boxed: true, icon: svg('<rect x="3.25" y="3.25" width="5.5" height="5.5" rx="1.25"/><rect x="11.25" y="3.25" width="5.5" height="5.5" rx="1.25"/><rect x="3.25" y="11.25" width="5.5" height="5.5" rx="1.25"/><rect x="11.25" y="11.25" width="5.5" height="5.5" rx="1.25"/>'), chapter: true, read: READ }, // and whatever no other rule matches (unitKind in source/units.mjs)
  },
  components: WHOLE, // a diff the kit draws, controls it holds
  hosts: {
    // Text of an element of the report's own (a footer, a line in a widget): it may be cleared, and
    // the element goes only with its block.
    text: { name: t("这段文字"), caps: ({ blockLevel }) => blockLevel ? ["empty", "links"] : ["plain", "empty"] },
  },
};
