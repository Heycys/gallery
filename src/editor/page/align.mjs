import { ALIGNS, ALIGN_TOGGLES, INDENT_MOST, alignLook, alignOf, aligns, indentLook, indentOf, indents } from "../components/align.mjs";
import { TOGGLES } from "../components/registry.mjs";
import { svg } from "../components/icons.mjs";
import { TABLE_ICONS } from "./table/icons.mjs";
import { t } from "../../shared/i18n/index.mjs";

// 对齐与缩进 (docs/editor.md, "Alignment and indent"; a row of the block menu), shared by
// the tools that use it (block-menu/, typing/, after/): a
// paragraph's or a heading's alignment and indent, class switches its component takes (components/
// align.mjs) that the file keeps and the kit draws; a table's frame takes the alignment alone (it is
// placed on the page left, centred or right, as a text block's words are), by the same row, named 对齐.
// The block menu's row (block-menu/), for one block or
// for several selected that all take them, one undo step; Enter carrying them to the block it makes
// (core.mjs newBlock: components/align.mjs carry), and Backspace at a block's start taking them off before anything else
// (typing/: unalign), one at a time: a centred or right-aligned block to the left, then its indent a
// level less (with neither left, it joins the block above), each one undo step, the caret
// staying at the start. The same for a paragraph left in a block's place by Backspace after it
// (after/): it takes the alignment the block showed.

// Its icons, in the menus' lines (20 units, the table's alignments beside them): text lines the middle
// two moved in (the row), and the same with an arrow in (增加缩进) or out (减少缩进) at their left.
const LINES = '<path d="M3.75 4.75h12.5M9.25 8.5h7M9.25 11.75h7M3.75 15.25h12.5"/>';
export const ALIGN_ICONS = {
  row: svg('<path d="M3.75 4.75h12.5M7.25 8.5h9M7.25 11.75h9M3.75 15.25h12.5"/>'),
  left: TABLE_ICONS["doc-align-left"],
  center: TABLE_ICONS["doc-align-center"],
  right: TABLE_ICONS["doc-align-right"],
  indent: svg(`${LINES}<path d="m3.75 7.9 2.25 2.25-2.25 2.25"/>`),
  outdent: svg(`${LINES}<path d="M6 7.9 3.75 10.15 6 12.4"/>`),
};

const LABELS = { left: t("左对齐"), center: t("居中对齐"), right: t("右对齐") };

/** Whether a block takes an alignment: its kind's class switches hold it (`kind`: its unit kind). */
export const alignable = (kind) => aligns(TOGGLES[kind]);

/** Whether a block takes an indent too, as a text block does (`kind`: its unit kind). */
export const indentable = (kind) => indents(TOGGLES[kind]);

/**
 * The block menu's 对齐与缩进 › for `units` (one block, or several selected), when they all take one
 * (kindOf(unit): its unit kind), or none: the three alignments (the one they share checked), then 增加缩进
 * and 减少缩进 (each a level for every one of them, disabled where none can go further), one undo step
 * each (look: the editor's change of classes). Where they do not all take an indent (a table's frame
 * has none) the row is 对齐 › with the three alignments alone.
 */
export function alignRows(units, { kindOf, look }) {
  if (units.length === 0 || !units.every((unit) => alignable(kindOf(unit)))) return [];
  const shared = units.every((unit) => alignOf(unit) === alignOf(units[0])) ? alignOf(units[0]) : null;
  const withIndent = units.every((unit) => indentable(kindOf(unit)));
  const levels = units.map(indentOf);
  const indent = (step) => look(units, units.map((unit) => indentLook(Math.max(0, Math.min(INDENT_MOST, indentOf(unit) + step)))), units);
  return [{
    label: withIndent ? t("对齐与缩进") : t("对齐"), icon: ALIGN_ICONS.row,
    submenu: () => [
      ...["left", "center", "right"].map((name) => ({ label: LABELS[name], icon: ALIGN_ICONS[name], current: shared === name, run: () => look(units, alignLook(name), units) })),
      ...(withIndent ? [
        { separator: true },
        { label: t("增加缩进"), icon: ALIGN_ICONS.indent, disabled: levels.every((level) => level >= INDENT_MOST), run: () => indent(1) },
        { label: t("减少缩进"), icon: ALIGN_ICONS.outdent, disabled: levels.every((level) => level === 0), run: () => indent(-1) },
      ] : []),
    ],
  }];
}

/**
 * Backspace at the start of text block `host` (typing/): its alignment taken off (to the left), else its
 * indent a level less, one undo step (look), the caret where it is. Returns whether it did either.
 */
export function unalign(host, look) {
  if (!indentable(host.getAttribute?.("data-ge-unit-kind")) || !ALIGN_TOGGLES.some((name) => host.classList.contains(name))) return false;
  if (alignOf(host) !== "left") return look(host, alignLook("left"));
  return look(host, indentLook(indentOf(host) - 1));
}

/**
 * The alignment a block shows in the text area of the box it stands in (`area`: that area's rect,
 * window coordinates): "center" or "right" when it is narrower and stands there, else "left" (a
 * block as wide as the area has none). How a picture, a card or a table set narrower is placed,
 * whatever says so (its class, its margins): what the reader sees.
 */
export function shownAlign(rect, area) {
  const left = rect.left - area.left;
  const right = area.right - rect.right;
  if (left <= 2 && right <= 2) return "left";
  if (Math.abs(left - right) <= 2) return "center";
  return right <= 2 ? "right" : "left";
}

/** The class that gives a new paragraph the alignment `name`, or null for the left. */
export const alignClass = (name) => ALIGNS[name] ?? null;
