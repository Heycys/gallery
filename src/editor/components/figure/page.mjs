import { SPAN } from "../../../shared/media.mjs";
import { ICONS } from "../../page/menu.mjs";
import { lookRow } from "../rows.mjs";
import { addStyle } from "../../page/ui.mjs";
import { CENTERED, CHART_HEIGHT, PLAIN } from "./index.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// 图形 on the page: its rows of the block menu (docs/editor.md, "Resizing cards, tables and
// code blocks"; resize/ drags the same sizes by their edges): the figure centered or at full width,
// back to the default size once a width or height is set, and 显示边框, a switch (a Sheet area's,
// sheets/page.mjs: checked while the frame shows, clicked to take it away, and again to bring it back;
// the class doc-figure--plain, whose look has no room inside it either). Its title and caption take no
// fill while edited.

// A card's title and caption (the `field` kind, a table's scope line with it) are plain text, as a
// media block's caption: no fill under the pointer or the caret (editor.mjs's --ge-text-tint).
const STYLE = `
  [data-ge-editing] [data-ge-kind="field"][contenteditable="true"] { --ge-text-tint: none; }
`;

/**
 * look(element, { classes, sizes }, select): the editor's undoable change of classes and sizes
 * (history.mjs); say: the status line.
 */
export function create({ look, say }) {
  addStyle(STYLE);
  const row = (target, options) => lookRow({ look, say }, target, options);
  return {
    /** The card's rows of the block menu (none for another block). */
    menuItems(target) {
      if (target?.getAttribute?.("data-ge-unit-kind") !== "figure") return [];
      const centered = target.classList.contains(CENTERED);
      const span = target.style.getPropertyValue(SPAN).trim();
      const rows = [
        row(target, { label: t("居中显示"), icon: ICONS.center, current: centered && span === "", change: { classes: { [CENTERED]: true }, sizes: { [SPAN]: null } }, done: t("图形已居中显示") }),
        row(target, { label: t("全宽显示"), icon: ICONS.full, current: !centered && (span === "1" || span === ""), change: { classes: { [CENTERED]: false }, sizes: { [SPAN]: null } }, done: t("图形已全宽显示") }),
      ];
      if (span !== "" || target.style.getPropertyValue(CHART_HEIGHT).trim() !== "") {
        rows.push(row(target, { label: t("恢复默认大小"), icon: ICONS.reset, current: false, change: { sizes: { [SPAN]: null, [CHART_HEIGHT]: null } }, done: t("已恢复默认大小") }));
      }
      const framed = !target.classList.contains(PLAIN);
      rows.push(row(target, { label: t("显示边框"), icon: ICONS.frame, checked: framed, change: { classes: { [PLAIN]: framed } }, done: t("{0}图形的边框", framed ? t("已去掉") : t("已显示")) }));
      return rows;
    },
  };
}
