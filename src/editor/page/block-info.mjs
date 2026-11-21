import { SHEETS } from "../components/kit.mjs";
import { KIND_NAMES, hasOuter, isBlock } from "../components/registry.mjs";
import { OUTER, UNIT, boxKind } from "./core.mjs";
import { pageOfUnit } from "./page-objects.mjs";
import { t } from "../../shared/i18n/index.mjs";

// What the page knows of a block (a unit: a paragraph, a list, a card, a section, a Sheet tab...;
// findUnits in src/editor/source/), shared by the block tools (blocks.mjs wires them: handle/,
// selection/, drag/, block-menu/): its kind and name, the blocks of a container, and why a block may
// not go or move.

export const alive = (target) => Boolean(target?.isConnected);

/** Blocks in document order, none inside another. */
export const ordered = (nodes) => [...new Set(nodes)]
  .filter((node, _, all) => !all.some((other) => other !== node && other.contains(node)))
  .sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));

/** The block around a block, or null: none past a box that has none (`outer`: a detail card's content). */
export const outerOf = (target) => {
  if (!hasOuter(boxKind(target.parentElement))) return null;
  const outer = target.parentElement?.closest(OUTER);
  // A column is no block of its own: from a block in one, the row of columns.
  return outer && !isBlock(outer.getAttribute("data-ge-unit-kind")) ? outer.parentElement?.closest(OUTER) ?? null : outer;
};

/** The other tabs of a tab's row still on the page. */
export const otherTabs = (tab) => [...tab.parentElement.children].filter((child) => child !== tab && child.matches(`:is(${UNIT})` + SHEETS.tab));

/** units: Map(id -> { kind, keep }) and boxes: Map(id -> { kind }) from the edit map. */
export function createBlockInfo({ units, boxes }) {
  const info = (node) => units.get(Number(node.getAttribute("data-ge-unit")));
  // Blocks made or converted on the page carry their kind; the others got it when the editor started.
  const kindOf = (node) => node.getAttribute("data-ge-unit-kind") ?? info(node)?.kind;
  const nameOf = (target) => pageOfUnit(target)?.nameOf?.(target) ?? KIND_NAMES[kindOf(target)] ?? t("整体块");

  return {
    kindOf,
    nameOf,
    /** What the reader calls one block, or several. */
    named: (targets) => targets.length === 1 ? nameOf(targets[0]) : t("{0} 块", targets.length),
    /** The kind of a container (a box). */
    boxKindOf: (container) => container.getAttribute("data-ge-box-kind") ?? boxes.get(Number(container.getAttribute("data-ge-box")))?.kind,

    /** Why a block cannot be deleted on the page (with the others of `group`), or null. */
    keepText(target, group = [target]) {
      if (kindOf(target) === "tab" && otherTabs(target).every((tab) => group.includes(tab))) return t("至少要保留一个选项卡。");
      if (!target.hasAttribute("data-ge-keep")) return null;
      const { keep } = info(target) ?? {};
      const names = keep?.names ?? [];
      const list = names.slice(0, 3).join(t("、")) + (names.length > 3 ? t(" 等") : "");
      return keep?.reason === "ref"
        ? t("页面其他地方引用了这块（{0}，例如链接或详情卡片、无障碍关联），删掉会让它们失效，请让 Agent 删除。", list)
        : t("这块被文档的脚本用到（{0}），在页面上删掉会让脚本出错，请让 Agent 删除。", list);
    },

    /** Why a block cannot move at all, or null. */
    fixedText(target) {
      if (!target.parentElement?.hasAttribute("data-ge-box")) return t("这个{0}不能移动。", nameOf(target));
      return null;
    },
  };
}
