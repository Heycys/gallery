// The layouts a database's view is drawn in (docs/render.md, "Databases: views"): each a module of its own
// that the drawing (app.js) puts in its body, one at a time, the one the view shown says (`layout`). A layout
// is a function `(store, db) => view`:
//
//   store   the database and the reader's state (store.js): store.doc (props, rows, views), store.byId,
//           store.view, store.rowsOf(view) ({ rows, stale }: the records the view shows, in order, and those
//           kept where they were though the filters no longer let them through), store.ui (the record open,
//           the search), store.editable, store.layer (where its cards and ghosts stand), and what changes the
//           records, each one step of undo: setCell, writeCells, addRow, moveRow, deleteRows, duplicateRow,
//           commit (a change of the whole database), updateView, snack (a word for a moment)
//   db      what the drawing shares: view() (the view shown), updateView(patch, merge), openRow(id),
//           closePeek(), openRowMenu(id, anchor), addRow(prefill, options), filterBy(prop), cycleSort(id),
//           sortFromHeader(sorts), closeMenus()
//   view    { element, update(change), destroy(), focusRow?(id), headOf?(id) }: `element` goes in the body as
//           it is made; `update(change)` draws it as the store is now, `change` saying what changed
//           ({ views, props, rows: true | a Set of the ids of records whose values changed, ui: words of
//           what of the reading changed }: a record's change redraws what shows that record alone);
//           `focusRow(id)` a record just made, its title edited (true where it was); `headOf(id)` the element
//           that stands for a column (a new formula's menu opens on it); `destroy()` as another view shows.
//
// A view writes nothing itself: what the reader changes goes through the store, which writes both parts of
// the block as one edit. Where the store reads only (store.editable false: an export, a block the format
// cannot hold), a view still switches, sorts and opens records, and shows nothing to change them with.
import { createTable } from "./table.js";
import { createChart } from "./views/chart.js";
import { createBoard } from "./views/board.js";
import { createCalendar } from "./views/calendar.js";
import { createGallery } from "./views/gallery.js";
import { createList } from "./views/list.js";
import { layoutLabel } from "./layouts.js";
import { h } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import { w } from "./words.js";

/** The layouts drawn so far, by name. */
export const LAYOUT_VIEWS = {
  table: createTable,
  chart: createChart,
  board: createBoard,
  list: createList,
  gallery: createGallery,
  calendar: createCalendar,
};

/** The view of `layout` (a placeholder for a layout not drawn yet). */
export function makeView(store, db, layout) {
  return (LAYOUT_VIEWS[layout] ?? placeholder)(store, db, layout);
}

// A layout whose drawing is still to come: what it is, and that its records show in a table meanwhile.
function placeholder(store, db, layout) {
  const element = h("div", { class: "db-empty-state db-later", "data-layout": layout },
    icon(layout, 26),
    h("div", null, w("{0}视图正在重做，记录可以在表格视图里看和改", layoutLabel(layout))));
  return { element, update() {}, destroy() {} };
}
