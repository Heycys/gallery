import { readTable, rowsOf } from "./table-reading.js";

// A table a package's data part holds, as rows (context.rows(name), docs/render.md "A custom block on a
// page"): its header's words, and each row of its body with the values it says, read as a chart drawn
// from a table reads them (table-reading.js, the kit's one reading of a table: a number, its words, or
// null), and the links its cells hold to documents. What changes it is a write of the part (context.edit,
// one undo step), made on the part's draft at the place the row stands on the page: a row added, moved
// (its cells set as it goes, in the same write) or removed takes the blank before it along, so that a
// table written a row a line stays so, and a reader's change is a change of a line or two in the file.
// A table of the document a view reads (context.table()) has the same rows and the same three writes,
// which there ask the page editor (kernel.js) instead of writing a draft.
//
// Pure but for the elements it is given, so that the tests run it in a DOM of their own.

const TEXT = 3; // Node.TEXT_NODE, with no Node to ask

/** The white space a person writes before a row, a row a line, or null. */
const blankBefore = (node) => {
  const blank = node?.previousSibling;
  return blank?.nodeType === TEXT && !blank.data.trim() ? blank : null;
};
/** The white space a section ends with, before its end tag, or null. */
const blankAtEnd = (section) => {
  const last = section.lastChild;
  return last?.nodeType === TEXT && !last.data.trim() ? last : null;
};

/** The table a part is, or holds first. */
export const tableOf = (part) => (part?.localName === "table" ? part : part?.querySelector?.("table") ?? null);

/**
 * A name the header does not have, among those of `values`, throws, saying the columns there are: what a
 * row of a part's table and of a view's are written by.
 */
export function namedIn(columns, values) {
  const unknown = Object.keys(values ?? {}).filter((name) => !columns.includes(name));
  if (unknown.length > 0) throw new Error(`no column ${unknown.map((name) => `"${name}"`).join(", ")} in the table: its columns are ${columns.map((name) => `"${name}"`).join(", ") || "none"}`);
  return values ?? {};
}

/**
 * The rows of `table` (a part's, on the page), or null where it cannot be read as rows. `edit(change)`
 * writes the part: `change` is handed the table of the part's draft, and its answer is whether that
 * was taken (context.edit's). `own` is the document's slug, which a link within it names.
 * @param {HTMLTableElement} table
 * @param {(change: (draft: HTMLTableElement) => void) => boolean} edit
 * @param {string | null} own
 */
export function rowSet(table, edit, own = null) {
  const found = readTable(table);
  if (found.merged) return null;
  const columns = Object.freeze([...found.names]);
  const rows = Object.freeze(rowsOf(found, own));
  // Where a row of this set stands in its table now (table.rows' place), -1 for one that left it or is no row of this set.
  const placeOf = (row) => (rows.includes(row) && row.el.parentNode && table.contains(row.el) ? [...table.rows].indexOf(row.el) : -1);
  const named = (values) => namedIn(columns, values);
  // `values` written in the cells of `row` (a row of the draft), by the header's place of each name; a cell it has not made.
  const setCells = (row, values) => {
    columns.forEach((name, index) => {
      if (!Object.hasOwn(values, name)) return;
      while (row.cells.length <= index) row.append(row.ownerDocument.createElement("td"));
      row.cells[index].textContent = String(values[name] ?? "");
    });
  };
  // `nodes` (a row, the blank before it) put before `next`'s blank, or at the end of `section`, before the blank that ends it.
  const put = (nodes, next, section) => {
    const at = next ? blankBefore(next) ?? next : blankAtEnd(section);
    for (const node of nodes) if (node) (next?.parentNode ?? section).insertBefore(node, at);
  };
  // The row after `row` in its section, `skipped` left out: what a row put after it goes before.
  const after = (row, skipped) => {
    let next = row.nextElementSibling;
    while (next && (next === skipped || next.localName !== "tr")) next = next.nextElementSibling;
    return next;
  };
  return Object.freeze({
    columns,
    rows,
    add(values, at = {}) {
      const given = named(values);
      const place = at?.after ? placeOf(at.after) : null;
      if (place === -1) return false;
      return edit((draft) => {
        const all = [...draft.rows];
        const previous = place === null ? null : all[place];
        const section = previous?.parentNode ?? draft.tBodies[draft.tBodies.length - 1] ?? draft.createTBody();
        // A row as the body's first row of data is made: a header cell where it has one, with its scope.
        const model = readTable(draft).rows[0] ?? null;
        const row = draft.ownerDocument.createElement("tr");
        columns.forEach((name, index) => {
          const like = model?.cells[index];
          const cell = draft.ownerDocument.createElement(like?.localName === "th" ? "th" : "td");
          if (like?.hasAttribute("scope")) cell.setAttribute("scope", like.getAttribute("scope"));
          cell.textContent = String(given[name] ?? "");
          row.append(cell);
        });
        const blank = blankBefore(previous ?? model ?? section.lastElementChild);
        put([blank ? draft.ownerDocument.createTextNode(blank.data) : null, row], previous ? after(previous, null) : null, section);
      });
    },
    move(row, to = {}) {
      const from = placeOf(row);
      const target = to?.before ?? to?.after ?? null;
      const there = target ? placeOf(target) : null;
      const values = to?.values ? named(to.values) : null;
      if (from === -1 || there === -1) return false;
      return edit((draft) => {
        const all = [...draft.rows];
        const moved = all[from];
        if (values) setCells(moved, values);
        if (there === null || there === from) return;
        const nodes = [blankBefore(moved), moved];
        if (to.before) put(nodes, all[there], all[there].parentNode);
        else put(nodes, after(all[there], moved), all[there].parentNode);
      });
    },
    remove(row) {
      const from = placeOf(row);
      if (from === -1) return false;
      return edit((draft) => {
        const gone = [...draft.rows][from];
        blankBefore(gone)?.remove();
        gone.remove();
      });
    },
  });
}
