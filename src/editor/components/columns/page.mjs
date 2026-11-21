import { boxKind, newContainer, newHost, placeBefore, unitsOf, withLeads } from "../../page/core.mjs";
import { begin, done, made } from "../../page/made.mjs";
import { caretAt } from "../../page/caret.mjs";
import { accepts, sizeValue } from "../registry.mjs";
import { COUNTS, MAX_COLUMNS, MIN_RATIO, RATIO } from "./index.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// 分栏 on the page: a row of
// 2 to 5 columns side by side, each a flow of blocks. A row is made by dropping blocks beside a
// block (the block in one column, they in another) or by 分栏 in a block's menu (the block and a
// new empty paragraph); a column is added by dropping blocks at a column's edge, by 分栏 on a block
// in a column, or by the pin above a gap (columns/). A column left empty goes, and a row left
// with one column gives its blocks back where it stood (settleRows, after every structural change:
// history.mjs). Widths: each column's share of the row (--doc-column-ratio), on every column of
// a row or on none (equal); a new column takes 1/n and the others make room in proportion, a
// column gone leaves its share to the others in proportion, and dragging a gap moves only the two
// columns beside it (ratiosAfterResize).

export const isRow = (node) => boxKind(node) === "columns";
export const isColumn = (node) => boxKind(node) === "column";
export const columnsOf = (row) => [...row.children].filter(isColumn);

/** The column a block stands in (directly), or null. */
export const columnOf = (unit) => (isColumn(unit?.parentElement) ? unit.parentElement : null);

// ---------- widths ----------

/** n equal shares. */
export const equalRatios = (n) => Array.from({ length: n }, () => 1 / n);

/** A new column at `index` takes 1/(n+1); the others make room in proportion, none going below the least share. */
export function ratiosAfterAdd(ratios, index) {
  const share = 1 / (ratios.length + 1);
  const shrinkable = ratios.filter((ratio) => ratio * (1 - share) > MIN_RATIO);
  const total = shrinkable.reduce((sum, ratio) => sum + ratio, 0);
  const factor = total > 0 ? 1 - share / total : 1;
  const out = ratios.map((ratio) => (ratio * (1 - share) > MIN_RATIO ? ratio * factor : ratio));
  out.splice(index, 0, share);
  return out;
}

/** The columns at `removed` gone: the others take their shares in proportion. */
export function ratiosAfterRemove(ratios, removed) {
  const left = ratios.filter((_, index) => !removed.includes(index));
  const rest = left.reduce((sum, ratio) => sum + ratio, 0);
  return rest > 0 ? left.map((ratio) => ratio / rest) : equalRatios(left.length);
}

/**
 * The gap after column `index` dragged by `fraction` of the row's width: only the two columns
 * beside it change, snapping to their equal split or to a tenth of the row for the left one when
 * within `near` of the row (page/columns/ gives 5px of it; 1% when not said; 0: no snapping), both keeping the least share (1/24, or more where `least` says so for a part: the
 * share its content needs, a flowchart's node as narrow as the kit lets it be, page/columns/).
 * `ratios` are those when the drag started.
 */
export function ratiosAfterResize(ratios, index, fraction, least = [], near = 0.01) {
  const left = ratios[index];
  const right = ratios[index + 1];
  const low = Math.max(MIN_RATIO, least[index] ?? 0);
  const high = Math.max(MIN_RATIO, least[index + 1] ?? 0);
  if (left === undefined || right === undefined || left + right < low + high) return ratios;
  let moved = fraction;
  const equal = (left + right) / 2 - left;
  const step = Math.round(10 * (left + moved)) / 10 - left;
  if (Math.abs(equal - moved) < near) moved = equal;
  else if (Math.abs(step - moved) < near) moved = step;
  moved = Math.min(Math.max(moved, low - left), right - high);
  const out = [...ratios];
  out[index] = left + moved;
  out[index + 1] = right - moved;
  return out;
}

/** A row's shares: its columns' own when every one has one, else equal ones. */
export function ratiosOf(row) {
  const columns = columnsOf(row);
  const own = columns.map((column) => Number.parseFloat(column.style.getPropertyValue(RATIO)));
  if (own.length > 0 && own.every((ratio) => ratio > 0)) {
    const sum = own.reduce((total, ratio) => total + ratio, 0);
    return own.map((ratio) => ratio / sum);
  }
  return equalRatios(columns.length);
}

/** Whether a row's columns have shares of their own (none: equal widths). */
export const sized = (row) => columnsOf(row).some((column) => column.style.getPropertyValue(RATIO).trim() !== "");

/** A row's columns given these shares (written as the file takes them: sizeValue, none below the least), or none (null: equal). */
export function setRatios(row, ratios) {
  columnsOf(row).forEach((column, index) => {
    if (ratios) column.style.setProperty(RATIO, sizeValue("column", RATIO, String(Math.min(1, Math.max(MIN_RATIO, ratios[index])))));
    else column.style.removeProperty(RATIO);
    if (column.getAttribute("style") === "") column.removeAttribute("style");
  });
}

// ---------- making rows and columns ----------

/**
 * A new row where `target` stands: `target` (a block, or blocks next to each other: a folded heading
 * with what it hides) in one column, each of `groups` (lists of nodes: blocks with their leads) in a
 * column of its own, `side` of it ("left" or "right"); equal widths. Returns { focus: the row, created }.
 */
export function rowAround(target, groups, side = "right") {
  begin();
  const own = [target].flat();
  const doc = own[0].ownerDocument;
  const parts = own.flatMap(withLeads);
  const row = made(newContainer(doc, "columns"));
  parts[0].before(row);
  const column = made(newContainer(doc, "column"));
  placeBefore(column, parts, null);
  const others = groups.map((nodes) => {
    const other = made(newContainer(doc, "column"));
    placeBefore(other, nodes, null);
    return other;
  });
  row.append(...(side === "left" ? [...others, column] : [column, ...others]));
  return done(row);
}

/**
 * Blocks next to each other (with their leads), each in a column of its own of a new row where they
 * stood; one may be a list of blocks (a folded heading with what it hides), a column for them all.
 * Returns { focus: the row, created }.
 */
export function rowOf(units) {
  begin();
  const groups = units.map((unit) => [unit].flat());
  const doc = groups[0][0].ownerDocument;
  const row = made(newContainer(doc, "columns"));
  withLeads(groups[0][0])[0].before(row);
  for (const group of groups) {
    const column = made(newContainer(doc, "column"));
    placeBefore(column, group.flatMap(withLeads), null);
    row.append(column);
  }
  return done(row);
}

/**
 * A new column at `index` of `row`, holding `nodes` (blocks with their leads), or an empty
 * paragraph; when the row's columns have shares, the new one takes 1/n and the others make room.
 * Returns { focus: the column's paragraph, or the column; created }.
 */
export function addColumn(row, index, nodes = null) {
  begin();
  const doc = row.ownerDocument;
  const ratios = sized(row) ? ratiosAfterAdd(ratiosOf(row), index) : null;
  const column = made(newContainer(doc, "column"));
  const paragraph = nodes ? null : newHost(doc, "paragraph");
  if (nodes) placeBefore(column, nodes, null);
  else column.append(paragraph);
  row.insertBefore(column, columnsOf(row)[index] ?? null);
  if (ratios) setRatios(row, ratios);
  return done(paragraph ?? column);
}

/**
 * 分两栏 (分三栏, 分四栏: `count` columns) with a block alone (or a folded heading with what it hides,
 * `target` a list: rowAround): a new row, the block in the left column and a new empty paragraph in
 * each of the others. Returns { focus: the first of them, created }.
 */
export function splitBeside(target, count = 2) {
  const paragraphs = Array.from({ length: count - 1 }, () => newHost([target].flat()[0].ownerDocument, "paragraph"));
  const { created } = rowAround(target, paragraphs.map((paragraph) => [paragraph]), "right");
  return { focus: paragraphs[0], created };
}

// ---------- what may be done ----------

const kindOf = (node) => node?.getAttribute?.("data-ge-unit-kind") ?? null;

/**
 * Whether `units` (blocks) may go into a column: every one is a block a column takes (no chapter,
 * no row of columns, no list item on its own).
 */
export const fitColumn = (units) => units.length > 0 && units.every((unit) => accepts("column", kindOf(unit)));

/**
 * "分栏" for blocks (in document order): null when it does not apply, otherwise why it cannot be
 * done, or "". One block in a column adds a column right of its own; one block elsewhere becomes a
 * row with a new empty column beside it; several next to each other in one container (not in a
 * column), a row with a column each. `taken(unit)`: what goes into a unit's column with it (a folded
 * heading's: it and what it hides, fold/ withHidden), each of which a column must take, and which
 * stands between the units it joins as they are next to each other for the reader.
 */
export function columnsCheck(units, taken = (unit) => [unit]) {
  if (units.length === 0) return null;
  const box = units[0].parentElement;
  if (!box?.hasAttribute("data-ge-box") || units.some((unit) => unit.parentElement !== box)) return null;
  const column = isColumn(box) ? box : null;
  if (column) {
    if (units.length > 1) return null;
    return columnsOf(column.parentElement).length >= MAX_COLUMNS ? t("一行最多 {0} 栏", MAX_COLUMNS) : "";
  }
  const all = units.flatMap(taken);
  if (!accepts(boxKind(box), "columns") || !fitColumn(all)) return null;
  if (units.length > MAX_COLUMNS) return t("一行最多 {0} 栏", MAX_COLUMNS);
  if (units.length === 1) return "";
  const blocks = unitsOf(box);
  const first = blocks.indexOf(all[0]);
  return all.every((unit, index) => blocks[first + index] === unit) ? "" : t("只有相邻的块能并排分栏：中间还有没选中的块");
}

// ---------- the commands ----------

/**
 * 分栏 in the block menu and a column added at a gap (columns/), with what the editor gives them:
 * struct (a structural undo step), say, and blocks() (the block handles and selection, blocks.mjs).
 */
export function create({ struct, say, blocks }) {
  // What goes into a block's column with it: a folded heading's section goes with it (fold/ withHidden).
  const taken = (unit) => blocks().folds?.withHidden(unit) ?? [unit];

  // Blocks that pass columnsCheck: a block in a column gets a column right of its own; a block
  // elsewhere becomes a row of `count` columns, it in the first and empty ones beside it (two
  // columns by default; the block menu's 分两栏, 分三栏, 分四栏); several, a row with a column each, a folded
  // heading's with what it hides. The caret goes into the first new column's paragraph, or the row is selected.
  function split(units, count = 2) {
    blocks().clear();
    const column = units.length === 1 ? columnOf(units[0]) : null;
    if (column) {
      add(column.parentElement, columnsOf(column.parentElement).indexOf(column) + 1);
      return;
    }
    const result = struct([units[0].parentElement], [], () => {
      const made = units.length === 1 ? splitBeside(taken(units[0]), count) : rowOf(units.map(taken));
      return { touched: [], focus: made.focus, select: units, created: made.created };
    });
    if (units.length === 1) caretAt(result.focus, "start");
    else blocks().select(result.created[0], { quiet: true });
    say(t("{0} · 拖动栏间的竖线调宽度 · Ctrl+Z 撤销", units.length === 1 ? t("已分成{0}栏", COUNTS[count]) : t("已把 {0} 块并排分栏", units.length)));
  }

  // A new column at `index` of `row` holding an empty paragraph, the caret in it.
  function add(row, index) {
    if (columnsOf(row).length >= MAX_COLUMNS) {
      say(t("一行最多 {0} 栏。", MAX_COLUMNS));
      return;
    }
    blocks().clear();
    const result = struct([row], [], () => {
      const made = addColumn(row, index);
      return { touched: [made.focus], focus: made.focus, created: made.created };
    });
    caretAt(result.focus, "start");
    say(t("已新增一栏 · Ctrl+Z 撤销"));
  }

  return {
    tidy: tidyRows,
    // What the block tools and the gaps between columns read and do by themselves (block-menu/, drag/, page/columns/).
    columnOps: { split, add, columnOf, columnsCheck: (units, take = taken) => columnsCheck(units, take), columnsOf, addColumn, rowAround, ratiosOf, ratiosAfterResize, setRatios, sized },
  };
}

// ---------- keeping rows tidy ----------

/** The rows a structural change over these containers may leave untidy: those they are or stand in. */
export function rowsAround(parents) {
  const rows = new Set();
  for (const parent of parents) {
    if (isRow(parent)) rows.add(parent);
    else if (isColumn(parent) && isRow(parent.parentElement)) rows.add(parent.parentElement);
  }
  return [...rows];
}

/** What a structural change over `rows` touches besides: their columns and where each row stands. */
const rowParts = (rows) => rows.flatMap((row) => [row, ...columnsOf(row), ...(row.parentElement ? [row.parentElement] : [])]);

// A column holding nothing but the editor's own nodes is empty.
const emptyColumn = (column) => ![...column.children].some((child) => !child.hasAttribute("data-doc-dev"));

/**
 * What a structural step (history.mjs) does around rows of columns, as a tidier: the rows the step
 * may leave untidy are tidied after it (settleRows), so the rows, their columns and the containers
 * they stand in are recorded with the step, and the columns' widths (their style) with them.
 */
export function tidyRows(parents) {
  const rows = rowsAround(parents);
  return { parents: rowParts(rows), attributes: [...new Set(rowParts(rows).filter(isColumn))].map((column) => [column, ["style"]]), settle: () => settleRows(rows) };
}

/**
 * After a structural change: a column left empty goes (its share to the others, in proportion), a
 * row left with one column gives its blocks back where it stood, and one left with none goes.
 * Returns whether anything changed.
 */
export function settleRows(rows) {
  let changed = false;
  for (const row of rows) {
    if (!row.isConnected || !isRow(row)) continue;
    const columns = columnsOf(row);
    const empty = columns.flatMap((column, index) => (emptyColumn(column) ? [index] : []));
    if (empty.length > 0) {
      const ratios = sized(row) ? ratiosAfterRemove(ratiosOf(row), empty) : null;
      empty.forEach((index) => columns[index].remove());
      if (ratios && columnsOf(row).length > 1) setRatios(row, ratios);
      changed = true;
    }
    const left = columnsOf(row);
    if (left.length > 1) continue;
    if (left.length === 1) placeBefore(row.parentElement, [...left[0].childNodes].filter((node) => node.nodeType !== 1 || !node.hasAttribute("data-doc-dev")), row);
    row.remove();
    changed = true;
  }
  return changed;
}
