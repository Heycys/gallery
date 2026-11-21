import { parsedValue } from "../../../shared/number-reading.mjs";
import { elementFor, inferColumnSemantics, mergedCells } from "./cells.js";
import { applyLayoutDefaults } from "./layout.js";
import { sayTables as say } from "../words.js";

// Sorting (makeSortable): a sort control in each sortable header (data-sort-type, or a numeric
// column), the arrow hung after its name, rows reordered (ties keep their order), the ranks and the
// sort status updated; and the table's state (its sort) for report state and linkage.
//
// A press on a header's control goes round three states: no sort (the rows as the file has them; the
// arrow shows both its triangles), ascending (only the upward one), descending (only the downward
// one), no sort again, the rows put back in their first order. aria-sort and the control's label say
// the state and what the next press does.
//
// On the page editor's page (html[data-ge-order="file"]) the rows are the file's own, so a press is
// an edit, not a view: the kit asks for it with a cancelable "doc-table-sort-edit" event on the
// table (detail: rows, the whole body in the order the press gives, and direction), and the editor
// writes that order (one undo step, page/table/index.mjs) and cancels the event. The arrow still
// says the state, kept only while the rows are in that order (an undo, a value typed or a row put
// in that breaks the order takes it back to no sort). Nothing else of the page is written by the
// kit then: no ranks, no status line, no state for a bound key.

const collator = new Intl.Collator("zh-CN", {
  numeric: true,
  sensitivity: "base",
});

export const controllers = new WeakMap();

/**
 * Whether the page holds its tables' rows in the file's order: the page the editor serves says so
 * (html[data-ge-order="file"], src/editor/service.mjs preview), because its blocks and its table
 * tools count rows as the file has them. The order a table opens in (data-sort-default, the sort
 * a bound key holds) is not applied there; sorting by a header still sorts. Not
 * data-doc-table-static: that one leaves a table without sort buttons, and the editor's arrows
 * are those buttons.
 */
export const heldOrder = () => document.documentElement.getAttribute("data-ge-order") === "file";

function compareValues(left, right, direction) {
  if (left == null && right == null) return 0;
  if (left == null) return 1;
  if (right == null) return -1;

  const comparison =
    typeof left === "number" && typeof right === "number"
      ? left - right
      : collator.compare(String(left), String(right));

  return direction === "asc" ? comparison : -comparison;
}

function statusElement(table) {
  const selector = table.dataset.sortStatus;
  if (!selector) return null;
  try {
    return document.querySelector(selector);
  } catch {
    return null;
  }
}

// A sortable header's control: a small button after its words (styles/table.css draws its arrow in
// the cell's right padding), not the header itself, so that the header's words stay the header's
// (the page editor edits them; a press on them sorts nothing). It holds no text.
function controlFor(header) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "doc-table-sort-button";
  button.setAttribute("contenteditable", "false");
  header.append(button);
  return button;
}

/**
 * The table made sortable, or its sort controls brought in line with its headers again (a column
 * read as numbers or no longer, its numeric columns switched off, a header row taken away: the
 * page editor's changes, undone too): a control on each sortable header, none on any other.
 */
export function makeSortable(target) {
  const table = elementFor(target);
  const known = controllers.get(table);
  if (known) {
    known.sync();
    return table;
  }

  applyLayoutDefaults(table);
  inferColumnSemantics(table);

  const body = table.tBodies[0];
  // Rows tied by merged cells keep their order.
  if (!body || mergedCells(table) || sortableColumns(table).length === 0) return table;

  let columns = [];
  const originalOrder = new WeakMap();
  let next = 0;
  const orderOf = (row) => {
    if (!originalOrder.has(row)) originalOrder.set(row, next++);
    return originalOrder.get(row);
  };
  Array.from(body.rows).forEach(orderOf);
  let current = null;
  const listeners = new Set();
  const getState = () => ({ sort: current ? { column: current.index, key: current.header.dataset.sortKey || null, direction: current.direction } : null });
  const notify = () => {
    for (const listener of listeners) listener(getState());
    table.dispatchEvent(new CustomEvent("doc-table-sort", { detail: getState().sort }));
  };

  // Each control as its column stands: "none", "asc" or "desc" for the arrow's triangles (styles/table.css).
  function updateHeaders() {
    for (const column of columns) {
      const direction = current?.header === column.header ? current.direction : null;
      column.header.setAttribute("aria-sort", direction === "asc" ? "ascending" : direction === "desc" ? "descending" : "none");
      column.button.setAttribute(
        "aria-label",
        say(direction === "asc" ? "sorted-ascending" : direction === "desc" ? "sorted-descending" : "sort-ascending", column.label),
      );
      column.button.dataset.docSortArrow = direction ?? "none";
    }
  }

  function updateStatus(column, direction) {
    const status = statusElement(table);
    if (!status) return;
    status.textContent = direction ? say(direction === "asc" ? "status-ascending" : "status-descending", column.label) : say("original-order");
  }

  // The rows ordered by a column's values (ties in their first order), in the direction asked.
  function sortedRows(column, direction) {
    return Array.from(body.rows).sort((leftRow, rightRow) => {
      const comparison = compareValues(
        parsedValue(leftRow.cells[column.index], column.type),
        parsedValue(rightRow.cells[column.index], column.type),
        direction,
      );
      return comparison || orderOf(leftRow) - orderOf(rightRow);
    });
  }

  // Whether the rows stand in a column's order as they are (what an arrow may go on saying on the page editor's page).
  function inOrder(column, direction) {
    const rows = Array.from(body.rows);
    return rows.every((row, index) => index === 0 || compareValues(
      parsedValue(rows[index - 1].cells[column.index], column.type),
      parsedValue(row.cells[column.index], column.type),
      direction,
    ) <= 0);
  }

  function updateRanks() {
    Array.from(body.rows).forEach((row, index) => {
      const rank = row.querySelector("[data-sort-rank]");
      if (rank) rank.textContent = String(index + 1);
    });
  }

  /**
   * The table sorted by `column` in `direction` ("asc", "desc"), or put back in its first order
   * (direction null). `pressed`: by a press on a control, which on the page editor's page asks
   * the editor to write the rows (the header's comment above).
   */
  function sortBy(column, direction, pressed = false) {
    if (mergedCells(table)) return; // merged since (the page editor): its rows stay as they are
    if (direction ? current?.header === column.header && current.direction === direction : !current) return;
    const held = pressed && heldOrder();
    // The first order the rows are put back in: on the page editor's page, as they stand when the sort begins
    // (they are the file's, which its edits may have changed since the page opened).
    if (held && direction && !current) {
      let place = 0;
      for (const row of body.rows) originalOrder.set(row, place++);
      next = place;
    }
    const rows = direction ? sortedRows(column, direction) : Array.from(body.rows).sort((a, b) => orderOf(a) - orderOf(b));
    const edited = held && !table.dispatchEvent(new CustomEvent("doc-table-sort-edit", { bubbles: true, cancelable: true, detail: { rows, direction } }));
    if (!edited) {
      const fragment = document.createDocumentFragment();
      rows.forEach((row) => fragment.appendChild(row));
      body.appendChild(fragment);
    }
    current = direction ? { header: column.header, index: column.index, direction } : null;
    updateHeaders();
    if (edited) return;
    updateRanks();
    updateStatus(column, direction);
    notify();
  }

  // A press on a control: no sort, ascending, descending, no sort.
  function press(column) {
    const was = current?.header === column.header ? current.direction : null;
    sortBy(column, was === null ? "asc" : was === "asc" ? "desc" : null, true);
  }

  // The controls as the headers are now: each sortable header keeps its control (the last thing in
  // it) or gets one, any other control goes (one left in a cell the page editor copied, too).
  function sync() {
    const wanted = mergedCells(table) ? [] : sortableColumns(table);
    for (const column of columns) {
      if (wanted.some((each) => each.header === column.header)) continue;
      column.header.removeAttribute("aria-sort");
    }
    columns = wanted.map((column) => {
      const kept = columns.find((each) => each.header === column.header);
      const button = kept?.button.isConnected && kept.button.parentElement === column.header ? kept.button : controlFor(column.header);
      if (button.nextSibling) column.header.append(button); // after its words, typed after it too
      return { ...column, button };
    });
    const buttons = new Set(columns.map((column) => column.button));
    table.querySelectorAll(".doc-table-sort-button").forEach((button) => { if (!buttons.has(button)) button.remove(); });
    if (current) {
      const column = columns.find((each) => each.header === current.header);
      current = column ? { ...current, index: column.index } : null;
      // The page editor's page: the rows are the file's, so the arrow says a sort only while they are in its order.
      if (current && heldOrder() && !inOrder(column, current.direction)) current = null;
    }
    for (const column of columns) {
      if (column.type !== "number") continue;
      column.header.classList.add("number");
      Array.from(body.rows).forEach((row) => row.cells[column.index]?.classList.add("number"));
    }
    Array.from(body.rows).forEach(orderOf);
    updateHeaders();
  }

  // A press on a control sorts by its column (whichever index the column has now).
  table.addEventListener("click", (event) => {
    const button = event.target.closest?.(".doc-table-sort-button");
    const column = button && columns.find((each) => each.button === button);
    if (column) press(column);
  });

  controllers.set(table, {
    getState,
    sync,
    setState(next) {
      if (!next || !("sort" in next)) throw new Error("Table state requires sort.");
      if (next.sort === null) {
        if (current) sortBy(columns.find((entry) => entry.header === current.header), null);
        return;
      }
      const column = columns.find((entry) => entry.index === next.sort.column);
      if (!column || !["asc", "desc"].includes(next.sort.direction)) throw new Error("Invalid table sort column or direction.");
      sortBy(column, next.sort.direction);
    },
    subscribe(listener) {
      if (typeof listener !== "function") throw new Error("Table subscribe requires a function.");
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  });
  table.dataset.docSortableReady = "true";
  sync();

  const defaultColumn = columns.find((column) => column.header.hasAttribute("data-sort-default"));
  if (defaultColumn && !heldOrder()) sortBy(defaultColumn, defaultColumn.defaultDirection);
  return table;
}

// The header row's sortable columns: those with a sort type (written, or read as numbers:
// cells.js), not ignored.
function sortableColumns(table) {
  return Array.from(table.tHead?.rows[0]?.cells || [])
    .map((header, index) => ({
      header,
      index,
      type: header.dataset.sortType,
      label: header.textContent.trim(),
      defaultDirection:
        header.dataset.sortDefault || (header.dataset.sortType === "text" ? "asc" : "desc"),
    }))
    .filter((column) => column.type && !column.header.hasAttribute("data-sort-ignore"));
}
