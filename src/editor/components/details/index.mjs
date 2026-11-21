import { svg } from "../icons.mjs";
import { DETAILS, classOf, stepOf } from "../kit.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { boxed, flowRows } from "../read-rows.mjs";

// 折叠列表: the kit's disclosure (details.doc-details). Its title (the summary's label) is a
// text block that only changes its text; its content region (.doc-details-content) is a box
// that takes what a section takes. A new one is open while edited; saved, it starts closed.
// page.mjs: a new one, Enter in its title; file.mjs: its markup in report.html.
//
// Where the engines reach it (src/editor/page/ unless named): typing/ (Enter in its title: page.mjs `keys`;
// its empty title's placeholder: `placeholders` below), editor.mjs (a click in its title does not toggle it: page.mjs `click`), convert.mjs
// (a block turned into one, one into plain blocks), core.mjs (its title and blocks in a save: nodeOf,
// an empty title holding the save), clipboard/own/ (copying it: `clipboard`, and `build` in page.mjs), commit.mjs (its content box),
// drag/ (a closed one opens while a block is dragged over its title), ../source/ (finding
// its title: the summary label).
// Its look: the kit's styles/details.css (src/render/kit/). Its title and content region are its
// description's parts, the label among them (required by the description: src/shared/components/details.mjs,
// through ../kit.mjs).
export default {
  name: "details",
  listed: () => t("折叠列表"),
  units: {
    // Its color (颜色 in the block menu): a background in place of its own, or
    // its title's and its blocks' text.
    details: {
      name: t("折叠列表"), match: [{ rank: 140, tag: "details" }], boxed: true, removedEmpty: true, colors: ["background"],
      // gallery read (../read-rows.mjs): boxed, its title on its first row (open or not in its {…}), its blocks in it.
      read: {
        name: "折叠列表",
        rows(node, view) {
          const title = detailsTitle(node.el);
          return boxed(node, `折叠列表：${(title && view.tools.own(title)) || "（没有标题）"}${view.tools.looks(node.el)}`, flowRows(node.children, view));
        },
        title: (node, view) => view.tools.plain(detailsTitle(node.el)),
        words: (node, view) => [detailsTitle(node.el) ? view.tools.words(detailsTitle(node.el)) : "", ...view.flowWords(node.children)],
        data: (node, view) => ({ title: detailsTitle(node.el) ? view.tools.words(detailsTitle(node.el)) : "", open: node.el.hasAttribute("open") }),
      },
    },
  },
  boxes: {
    // Its content always holds a block (holdsOne): emptied, it keeps an empty paragraph to write in.
    // Under its last block is its padding: a click there makes no block (endIsPadding).
    details: { role: "flow", name: t("折叠列表"), groups: true, holdsOne: true, endIsPadding: true, emptyIsNothing: true, selectAll: { content: true }, classes: [{ rank: 30, class: classOf(stepOf(DETAILS.content)) }], find: (unit) => detailsContent(unit) },
  },
  placeholders: { label: t("折叠列表标题") },
  hosts: {
    label: { name: t("折叠块标题"), opensBefore: true, caps: () => ["empty"], parts: [["details", "label"]], untitled: true }, // empty, the kit shows nothing but its arrow; the page says 折叠列表标题 whenever it is empty (`untitled`)
  },
  types: {
    details: { // its box is the content region
      turn: 10, menu: ["basic", 10],
      tag: "details", className: "doc-details", kind: "details", box: "details", container: "details.doc-details",
      takesAsIs: true, holder: 1,
      // Copied with its title and its blocks. Its page.mjs makes it again.
      clipboard: {
        kind: "toggle",
        read: (unit) => ({ title: detailsTitle(unit), content: detailsContent(unit) }),
        describe(node, { holding, serializeInner }) {
          if (!node.matches("details.doc-details")) return undefined;
          const title = detailsTitle(node);
          const blocks = holding(detailsContent(node));
          return title && blocks ? { type: "details", html: serializeInner(title), blocks } : null;
        },
        endsIn(unit, { blocksIn, serializeInner }) {
          const title = detailsTitle(unit);
          return title ? [{ type: "details", html: serializeInner(title), blocks: blocksIn([detailsContent(unit)].filter(Boolean)) }] : undefined;
        },
        check: (block, { container, string }) => container(block) && string(block.html),
        text: (block, lines) => [block.html, ...lines(block.blocks)],
      },
      // What the save engines need of it (core.mjs nodeOf, sync-state.mjs): its title (a text block
      // of its own) and its content region; the summary is part of it. Written empty too (no title,
      // no blocks: an empty one stays).
      title: (element) => detailsTitle(element), content: (element) => detailsContent(element), part: "summary",
      written: () => true,
      label: t("折叠列表"),
      icon: svg('<path d="M3.75 4.25 6.75 6l-3 1.75z" fill="currentColor" stroke="none"/><path d="M3.75 12.25l3 1.75-3 1.75z" fill="currentColor" stroke="none"/><path d="M8.75 6h7.75M8.75 14h7.75"/>'),
      words: "折叠列表 折叠块 折叠 展开 zhedie zhankai zdlb zd toggle details disclosure",
      glance: { row: 6, name: "折叠列表", write: "`<details><summary>`, never the kit's classes on it", after: "`details.doc-details`", rule: "Text and lists" },
    },
  },
};

/** A disclosure's title and content region. */
export const detailsTitle = (details) => details.querySelector(DETAILS.label);
export const detailsContent = (details) => details.querySelector(DETAILS.content);
