import { SECTION_ICON } from "../icons.mjs";
import { HIGHLIGHT } from "../kit.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { boxed, flowRows } from "../read-rows.mjs";
// 分区: section.doc-section, a container of ordinary blocks (its title is whatever heading it
// holds, a line above it an <hr> at its top) that stands in the page or a Sheet panel only. It is
// a chapter: optional, made and dissolved only by explicit commands, never derived from headings.
// page.mjs: a new section, 组成新分区, 解散分区.
//
// Where the engines reach it (src/editor/page/ unless named): handle/ (its bar along its right side),
// block-menu/ (the menu rows: page.mjs `sectionOps`), drag/drop.mjs (a drop goes by its
// edges), clipboard/own/ (copying sections: `clipboard`), commit.mjs (one made again by undo), ../source/ (a new one
// set apart like the chapters around it: separator).
// Its look: none of its own, its blocks are a flow's (the kit's styles/flow.css, src/render/kit/).
// A section of the page, not a <section> that is a block of another kind (a Sheet area, one with a
// highlight block's class).
const isSection = (node) => node.localName === "section" && node.getAttribute("data-ge-box-kind") === "section" && !node.matches(HIGHLIGHT.match);

export default {
  name: "section",
  listed: () => t("分区"), hideable: false,
  units: {
    section: { name: t("分区"), icon: SECTION_ICON, match: [{ rank: 40, tag: "section" }], chapter: true, fixed: true, handle: "bar", read: { name: "分区", rows: (node, view) => boxed(node, `分区${view.tools.looks(node.el)}`, flowRows(node.children, view)) } },
  },
  boxes: {
    section: { role: "flow", name: t("分区"), groups: true },
  },
  types: {
    section: {
      tag: "section", className: "doc-section", kind: "section", box: "section",
      clipboard: {
        kind: "flatten", html: "section",
        describe(node, { isHost, holding }) {
          if (!isSection(node) || isHost(node)) return undefined;
          const blocks = holding(node);
          return blocks ? { type: "section", blocks } : null;
        },
        endsIn: (unit, { blocksIn, boxesOf }) => (isSection(unit) ? [{ type: "section", blocks: blocksIn(boxesOf(unit)) }] : undefined),
        check: (block, { container }) => container(block),
      },
    },
  },
};
