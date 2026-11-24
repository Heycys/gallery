// A list: a line per record, its title at the left and the values the view shows (its `hidden`) at the right, a
// record done drawn faded. A line pressed opens the record, a right click its menu where the page takes edits, and
// the round + past the last line a new record, opened.
import { getValue, isEmpty, isRowDone, titleOf } from "../data/values.js";
import { h, kids } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { valueView } from "../ui/values.js";
import { w } from "../words.js";
import { cardProps, endPlus } from "./cards.js";

/** The list view of the store's database for `db`. */
export function createList(store, db) {
  const element = h("div", { class: "list" });

  function line(row, props, stale) {
    const shown = props.filter((prop) => prop.type === "checkbox" || !isEmpty(getValue(row, prop, store.byId)));
    const title = titleOf(row, store.doc.props);
    const node = h("div", { class: `list-row${stale ? " stale" : ""}` },
      icon("text", 15, { cls: "list-ic" }),
      h("span", { class: `list-title${isRowDone(row, store.doc.props) ? " done" : ""}` }, title || h("span", { class: "muted" }, w("无标题"))),
      h("span", { class: "grow" }),
      h("span", { class: "list-props" }, shown.map((prop) => h("span", { class: `list-prop t-${prop.type}` }, valueView(store, row, prop, "list")))));
    node.addEventListener("click", () => db.openRow(row.id));
    node.addEventListener("contextmenu", (event) => {
      if (!store.editable) return;
      event.preventDefault();
      db.openRowMenu(row.id, { left: event.clientX, top: event.clientY, right: event.clientX, bottom: event.clientY });
    });
    return node;
  }

  function draw() {
    const now = db.view();
    const { rows, stale } = store.rowsOf(now);
    const props = cardProps(store, now);
    element.replaceChildren(...kids(rows.map((row) => line(row, props, stale.has(row.id))), endPlus(store, () => db.addRow({}, { open: true }))));
  }

  return { element, update: draw, destroy() {} };
}
