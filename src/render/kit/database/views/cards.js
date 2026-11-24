// What the layouts of cards share (a board, a wall of cards, a list, a calendar): a record's card (its title, the
// values the view shows, its ··· where the page takes edits), the round + at the end of a list or a wall of cards
// (shown as the pointer comes near), and the click a drag ends with swallowed.
import { getValue, isEmpty, isRowDone, titleOf } from "../data/values.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { valueView, visibleProps } from "../ui/values.js";
import { w } from "../words.js";

/** The columns a card of `view` shows besides its title, in their order: none hidden, no notes. */
export const cardProps = (store, view) => visibleProps(store.doc.props, view.hidden ?? []);

/** The end of a list, a board's column, a wall of cards: a round + shows as the pointer comes near, a new record. */
export function endPlus(store, onAdd, title = w("新建")) {
  if (!store.editable) return null;
  return h("div", { class: "end-zone" }, h("button", { type: "button", class: "end-plus", "aria-label": title, "data-doc-tip": title, on: { click: onAdd } }, icon("plus", 14, { bold: 2.2 })));
}

/**
 * A record's card (a board's, a wall of cards'): pressed, the record opens; a right click and its ··· its menu where
 * the page takes edits. `onDown(event, card)`: a press on it (a board's drag).
 */
export function card(store, db, row, props, { onDown } = {}) {
  const done = isRowDone(row, store.doc.props);
  const shown = props.filter((prop) => prop.type === "checkbox" || !isEmpty(getValue(row, prop, store.byId)));
  const { stale } = store.rowsOf();
  const title = titleOf(row, store.doc.props);
  const node = h("div", { class: `card${stale.has(row.id) ? " stale" : ""}`, "data-card": row.id },
    h("div", { class: `card-title${done ? " done" : ""}` }, title || h("span", { class: "muted" }, w("无标题"))),
    shown.length ? h("div", { class: "card-props" }, shown.map((prop) => h("div", { class: `card-prop t-${prop.type}`, "data-doc-tip": prop.name },
      prop.type === "checkbox" ? h("span", { class: "card-prop-name" }, prop.name) : null,
      valueView(store, row, prop, "card")))) : null,
    store.editable ? h("button", { type: "button", class: "card-more", "aria-label": w("更多"), on: {
      mousedown: (event) => event.stopPropagation(),
      click: (event) => { event.stopPropagation(); db.openRowMenu(row.id, event.currentTarget); },
    } }, icon("more", 14)) : null);
  if (onDown) node.addEventListener("mousedown", (event) => onDown(event, node));
  node.addEventListener("click", () => db.openRow(row.id));
  node.addEventListener("contextmenu", (event) => {
    if (!store.editable) return;
    event.preventDefault();
    db.openRowMenu(row.id, { left: event.clientX, top: event.clientY, right: event.clientX, bottom: event.clientY });
  });
  return node;
}

export const appOf = (node) => node?.closest?.(".doc-database-app") ?? null;

/** The click a drag ends with, which the browser sends after the release, swallowed. */
export function swallowClick() {
  const swallow = (event) => { event.stopPropagation(); event.preventDefault(); };
  addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => removeEventListener("click", swallow, { capture: true }), 0);
}
