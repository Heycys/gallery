import { TABLE } from "../../components/kit.mjs";
import { CHART_SOURCE, TABLE_READERS, VIEW_FROM, nextChartKey } from "../../../shared/table-chart.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { menuRow } from "../page-objects.mjs";

// Which table a view reads (docs/editor.md, "Table views"). A view of a table (an instance of a custom
// block whose needs hold "tables") names its table by a key: VIEW_FROM on the instance, CHART_SOURCE on
// the table's frame, never by an id or the blocks' order. A view made on the page ("/", 在下方新建, 转换成)
// is bound to the nearest table above it as it is made, in the same undo step; the table it reads is the
// reader's to change after that, in the block's 设置 (installed/page.mjs), which lists the document's tables.
// A table with no key gets one in the same step (the first of t1, t2 … the page does not hold), and so
// does the second of two an Agent wrote with one key: a view by that key would read the first.

const FRAME_WITH_TABLE = (frame) => frame.querySelector("table") !== null && !frame.closest("[data-doc-dev]");

/** The tables of the page, in the document's order: their frames (.doc-table-wrap). */
export const tableFrames = () => [...document.querySelectorAll(TABLE.frame)].filter(FRAME_WITH_TABLE);

/** The frame a key names, as the kit reads it (runtime/table-reading.js frameOf) and the checks do: the first that carries it. */
export const frameOf = (key) => tableFrames().find((frame) => frame.getAttribute(CHART_SOURCE) === key) ?? null;

/** The nearest table above `node`, in the document's order, that does not hold it; null where there is none. */
export function tableAbove(node) {
  let found = null;
  for (const frame of tableFrames()) {
    if (frame.contains(node)) continue;
    if (frame.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) found = frame;
  }
  return found;
}

// Every key a chart or a view names, or a frame carries.
const takenKeys = () => new Set([...document.querySelectorAll([CHART_SOURCE, ...TABLE_READERS].map((name) => `[${name}]`).join(", "))]
  .flatMap((node) => [CHART_SOURCE, ...TABLE_READERS].map((name) => node.getAttribute(name)).filter((value) => value !== null)));

/** The key `frame` is read by: its own where it names this frame, else a new one (not yet written). */
export function keyOf(frame) {
  const own = frame.getAttribute(CHART_SOURCE);
  return own !== null && frameOf(own) === frame ? own : nextChartKey(takenKeys());
}

/**
 * `instance` made a view of `frame` (or of none: null takes its key off): its VIEW_FROM set, and the key
 * on the frame where it carried none that names it. Records nothing: the caller's undo step does
 * (`viewFrames`, struct's `attributes`). Returns whether anything changed.
 */
export function bindView(instance, frame) {
  if (!frame) {
    if (!instance.hasAttribute(VIEW_FROM)) return false;
    instance.removeAttribute(VIEW_FROM);
    return true;
  }
  const key = keyOf(frame);
  let changed = false;
  if (instance.getAttribute(VIEW_FROM) !== key) {
    instance.setAttribute(VIEW_FROM, key);
    changed = true;
  }
  if (frame.getAttribute(CHART_SOURCE) !== key) {
    frame.setAttribute(CHART_SOURCE, key);
    changed = true;
  }
  return changed;
}

/** A view that was made bound to the table above it. */
export function bindAbove(instance) {
  return bindView(instance, tableAbove(instance));
}

/**
 * What the undo step that makes a block of the menu's key records of the tables' keys (struct's
 * `attributes`): every table's frame when the block reads tables, as the table it is bound to is only
 * known as the block is made; nothing for any other block.
 */
export const viewFrames = (key) => (menuRow(key)?.readsTables ? tableFrames().map((frame) => [frame, [CHART_SOURCE]]) : []);

// A table named for a reader: its place among the document's tables and the words of its first row.
function labelOf(frame, place) {
  const first = frame.querySelector("tr");
  const words = first ? [...first.cells].map((cell) => cell.textContent.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 4).join("、") : "";
  const shown = words.length > 28 ? `${words.slice(0, 27)}…` : words;
  return shown ? t("表格 {0} · {1}", place, shown) : t("表格 {0}", place);
}

/** The document's tables for a list to choose from: [{ frame, label }], the label naming the table by its place and its first row. */
export const tableChoices = () => tableFrames().map((frame, at) => ({ frame, label: labelOf(frame, at + 1) }));
