import { insertRow, moveRow, removeRows, tableState } from "../../components/table/page.mjs";
import { tableOf } from "../../components/table/grid.mjs";
import { ownHTML } from "../core.mjs";
import { pageOfUnit } from "../page-objects.mjs";

// The views of a table (docs/editor.md, "Table views"): an instance of a custom
// block whose needs hold "tables", bound to a table of the document by the key its frame carries
// (shared/table-chart.mjs VIEW_FROM, the key a chart drawn from a table reads it by), reads the table's
// rows (the kit's context.table()) and changes them only by asking: a doc-table-intent the kit puts on
// the instance (runtime/kernel.js), which these tools answer at once, made as the table's own tools make
// a change, so that a view has no commit, undo or conflict of its own:
//
//   set     one cell's words: a text step of that cell (history.mjs recordStep), its commit a cell's text
//           as typing's is, merged word by word with someone else's change of the cell (source/merge.mjs);
//           or that cell of several rows (`rows`: a board's group renamed, a chart's bar), with a write
//           of the view's own parts (`edit`, what its context.edit asks: the group's place in the order
//           of its settings) or none: one step that holds the words of every cell it changes and what
//           the parts held (history.mjs struct, as the format bar's change of several cells), whose
//           commit is the cells' words and the parts' as the component's own write, each going in or
//           held for the reader as its own;
//   move    a row put before or after another, the cells it names set in the same step (a card dropped
//           in another column: its status and its place);
//   add     a row put in after another or last, its cells' words those it names;
//   remove  a row taken out (never the last of the body, as the tools' 删除);
//   check   nothing: answered as the others would be (the kit's table().canEdit()), so that a view of a
//           table these tools do not manage shows it read-only;
//
// move, add and remove are the table tools' operations (components/table/page.mjs moveRow, insertRow,
// removeRows) in one undo step each (index.mjs change), their commit the table's operation, which a
// change someone else made to the table meanwhile holds back as a conflict with its card, as any. Only a
// table these tools manage (GRID: written as the kit writes one) and with no merged cell takes them: a
// view of any other is read-only, as it is in an export (the kit asks nothing there). Its rows of data
// are those after its header row: the head's rows, or with no head its body's first row, which a view
// reads its columns' names from; no intent puts a row there or takes that one.
//
// Which table a view reads is binding.mjs's: a view made from a menu is bound to the table above it, and
// its 设置 (components/installed/page.mjs) changes it.

/**
 * active(): whether the page edits now. change(unit, mutate, said, touched): the table tools' one undo
 * step (index.mjs). struct(parents, touched, mutate): the editor's undoable change (history.mjs).
 * tableAt(node): the table unit these tools manage that a node is in. recordStep(host, before): a text
 * step of a text block (history.mjs). drawn(): the tools drawn again (a row taken out).
 */
export function createViews({ active, change, struct, tableAt, recordStep, drawn = () => {} }) {
  const merged = (rows) => rows.some((row) => [...row.cells].some((cell) => cell.rowSpan !== 1 || cell.colSpan !== 1));
  const writable = (cell) => cell?.getAttribute("contenteditable") === "true";
  const holds = (cell, text) => cell.textContent === text && cell.childElementCount === 0;

  // What a view asks (`detail` of doc-table-intent: kernel.js tableView), from its instance `view`, made, or refused (false).
  function run({ table, op, row = null, rows = null, before = null, after = null, cells = [], edit = null }, view) {
    if (!active() || !table?.isConnected) return false;
    const unit = tableAt(table);
    if (!unit || tableOf(unit) !== table) return false;
    const state = tableState(unit);
    if (merged(state.rows) || !Array.isArray(cells) || !cells.every(([column, text]) => Number.isInteger(column) && column >= 0 && column < state.columns && typeof text === "string")) return false;
    // A view's table().canEdit(): whether an intent of this table would be taken now, nothing changed.
    if (op === "check") return true;
    // Its rows of data: after the header a view reads its names from (the head, else the body's first row).
    const all = state.rows;
    const data = all.slice(Math.max(1, state.head?.rows.length ?? 0));
    const ofData = (node) => data.includes(node);
    const cellsOf = (target) => cells.map(([column]) => target.cells[column]);
    if (op === "set") {
      const targets = Array.isArray(rows) ? rows : [row];
      if (targets.length === 0 || !targets.every(ofData) || new Set(targets).size !== targets.length || cells.length !== 1) return false;
      const [[column, text]] = cells;
      const list = targets.map((each) => each.cells[column]);
      if (!list.every(writable)) return false;
      // What the view writes of its own parts with it, checked as its context.edit is (components/installed/page.mjs drafted).
      const parts = edit ? (view?.nodeType === 1 && view.hasAttribute("data-ge-unit-kind") ? pageOfUnit(view)?.drafted?.(edit, view) ?? null : null) : null;
      if (edit && !parts) return false;
      const changing = list.filter((cell) => !holds(cell, text));
      const written = parts?.changed.map(([part]) => part) ?? [];
      if (changing.length === 0 && written.length === 0) return true;
      if (!rows && !edit) {
        const [cell] = changing;
        const was = ownHTML(cell);
        cell.textContent = text;
        recordStep(cell, was);
        return true;
      }
      return struct([], [...changing, ...written], () => {
        for (const cell of changing) cell.textContent = text;
        parts?.put();
        return { touched: [...changing, ...written], focus: null };
      }) !== null;
    }
    if (op === "move") {
      const target = before ?? after;
      if (!ofData(row) || (target && !ofData(target)) || !cellsOf(row).every(writable)) return false;
      const from = all.indexOf(row);
      const rest = all.filter((node) => node !== row);
      const to = !target || target === row ? from : before ? rest.indexOf(before) : rest.indexOf(after) + 1;
      if (to === from && cells.every(([column, text]) => holds(row.cells[column], text))) return true;
      return change(unit, () => {
        if (to !== from && moveRow(unit, from, to) === false) return false;
        for (const [column, text] of cells) row.cells[column].textContent = text;
        return true;
      }, null, cellsOf(row)) !== null;
    }
    if (op === "add") {
      if (after && !ofData(after)) return false;
      const at = after ? all.indexOf(after) + 1 : all.length;
      return change(unit, () => {
        const made = insertRow(unit, at);
        for (const [column, text] of cells) if (made.cells[column]) made.cells[column].textContent = text;
        return made;
      }, null) !== null;
    }
    if (op === "remove") {
      if (!ofData(row)) return false;
      const at = all.indexOf(row);
      const done = change(unit, () => removeRows(unit, at, at), null) !== null;
      drawn();
      return done;
    }
    return false;
  }
  document.addEventListener("doc-table-intent", (event) => {
    if (run(event.detail ?? {}, event.target)) event.preventDefault();
  });

  return {};
}
