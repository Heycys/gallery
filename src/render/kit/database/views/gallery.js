// A wall of cards (卡片): a card per record in a grid as wide as the room there is, its columns as the view's card
// size says (`cardSize`: s, m, l), each card the record's title and the values the view shows (its `hidden`); a
// card pressed opens the record, and the round + past the last card a new record, opened.
import { h, kids } from "../ui/dom.js";
import { card, cardProps, endPlus } from "./cards.js";

/** The gallery view of the store's database for `db`. */
export function createGallery(store, db) {
  const element = h("div", { class: "gallery" });

  function draw() {
    const now = db.view();
    const { rows } = store.rowsOf(now);
    const props = cardProps(store, now);
    element.className = `gallery size-${now.cardSize || "m"}`;
    element.replaceChildren(...kids(rows.map((row) => card(store, db, row, props)), endPlus(store, () => db.addRow({}, { open: true }))));
  }

  return { element, update: draw, destroy() {} };
}
