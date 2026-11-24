// A board's card dragged (board.js): it lifts and follows the pointer, and the cards of the column it is over slide
// apart to open the room where it will land, those of the column it left closing up behind it, as a view's tabs and a
// board's columns make way (ui/reorder.js). Where it lands goes by the card itself, not the pointer
// (src/shared/drag-place.mjs): the column its middle is over (the nearest where it is over none), and there the place
// nearest to where it stands, a card giving way as its leading edge passes that card's middle; where a sort orders the
// view the room opens where the sort will put it (its own column: where it was, nothing moving). Let go, the one
// change is written (model.js dropCard: its cell, and with no sort its place among the records; one step of undo),
// the board drawn again and the card flying from where it was let go into its place, each other card sliding from
// where it stood; Esc, the window losing the focus or the page hidden: everything slides back, nothing written. The
// board and the page scroll as the pointer comes near their edges (ui/edge-scroll.js). A press that does not go 5px
// is a click: the record opens. For a reader who asks for less motion nothing slides or flies.
import { placeAmong } from "../../../../shared/drag-place.mjs";
import { paint } from "../ui/colors.js";
import { h } from "../ui/dom.js";
import { edgeScroll, scrollerOf } from "../ui/edge-scroll.js";
import { calm, cancelOn, swallowClick, swallowRelease } from "../ui/reorder.js";
import { appOf } from "./cards.js";
import { dropCard, sortedPlace } from "./model.js";

const EASE = "transform .18s cubic-bezier(.2, 0, 0, 1)";
const LAND = 180; // ms: the card's way into its place, or back to it
const DRAG = 5; // px a press goes before it drags

/**
 * The drag of `node` (the card of record `row`) from the press `event`. `board`: the board's element; `prop`: its
 * select; `rowsOf(key)`: the records a column shows, in order; `colorOf(key)`: its option's color; `hold(on)`: the
 * board told not to draw meanwhile (true) and that it may again (false, which draws it where a change came meanwhile);
 * `draw()`: the board drawn again.
 */
export function dragCard(event, node, { store, db, board, row, prop, rowsOf, colorOf, hold, draw }) {
  if (event.button !== 0 || !store.editable || event.target.closest(".card-more")) return;
  const slot = node.parentElement;
  if (!slot?.classList.contains("card-slot")) return;
  const app = appOf(node);
  const x0 = event.clientX;
  const y0 = event.clientY;
  const still = calm();
  let started = false;
  let pointer = { x: x0, y: y0 };
  let box = null; // the card as it was pressed
  let ghost = null; // its copy under the pointer
  let columns = []; // each column: { col, key, cards, slots: its cards but the one held, boxes: where those stand without it }
  let gap = 8;
  let home = null; // where it stood: { c, p }
  let at = null; // where it would land: { c, p }
  const sorts = db.view().sorts;
  const sorted = new Map(); // a column's place by the sort, worked out once
  const page = scrollerOf(board.parentElement, "y", { page: true });
  const edges = edgeScroll(() => [{ el: board, axis: "x" }, ...(page ? [{ el: page, axis: "y" }] : [])], () => follow());
  const pageEvents = page === document.scrollingElement ? window : page;
  let stopCancel = () => {};

  const begin = () => {
    started = true;
    hold(true);
    box = node.getBoundingClientRect();
    const own = slot.parentElement;
    gap = parseFloat(getComputedStyle(own).rowGap) || 8;
    columns = [...board.querySelectorAll(".board-col[data-col]")].map((col) => {
      const cards = col.querySelector(".board-cards");
      return { col, key: col.dataset.col, cards, slots: [...cards.children].filter((each) => each !== slot), boxes: [] };
    });
    // Where each card stands with the one held taken out: what the place it lands at is worked out among.
    slot.style.display = "none";
    for (const column of columns) {
      const top = column.cards.getBoundingClientRect().top;
      column.boxes = column.slots.map((each) => {
        const rect = each.getBoundingClientRect();
        return { start: rect.top - top, end: rect.bottom - top };
      });
    }
    slot.style.display = "";
    const c = columns.findIndex((column) => column.cards === own);
    home = { c, p: [...own.children].indexOf(slot) };
    at = home;
    app?.classList.add("is-dragging");
    slot.classList.add("card-gap");
    const copy = node.cloneNode(true);
    ghost = paint(h("div", { class: "drag-ghost board-lift", style: { width: `${box.width}px`, left: `${box.left}px`, top: `${box.top}px` } }, copy), colorOf(columns[c]?.key));
    ghost.dataset.col = columns[c]?.key ?? "";
    store.layer.append(ghost);
    db.closeMenus?.();
    stopCancel = cancelOn(cancel);
  };

  // The copy under the pointer, and the room where it would land opened.
  const follow = () => {
    if (!started) return;
    const left = pointer.x - (x0 - box.left);
    const top = pointer.y - (y0 - box.top);
    ghost.style.left = `${left}px`;
    ghost.style.top = `${top}px`;
    const middle = left + box.width / 2;
    let c = 0;
    let distance = Infinity;
    columns.forEach((column, index) => {
      const rect = column.col.getBoundingClientRect();
      const away = middle < rect.left ? rect.left - middle : middle > rect.right ? middle - rect.right : 0;
      if (away < distance) {
        distance = away;
        c = index;
      }
    });
    const column = columns[c];
    if (!column) return;
    let p;
    if (sorts.length) p = c === home.c ? home.p : placeBySort(c);
    else {
      const from = top - column.cards.getBoundingClientRect().top;
      p = placeAmong(column.boxes, { start: from, end: from + box.height }, gap);
    }
    if (c !== at.c || p !== at.p) open(c, p);
  };

  // Where the sort puts the record in column `c` once its cell is that column's.
  const placeBySort = (c) => {
    if (!sorted.has(c)) {
      const order = new Map(store.doc.rows.map((each, index) => [each.id, index]));
      sorted.set(c, sortedPlace(rowsOf(columns[c].key), row, prop, valueOf(columns[c].key), sorts, store.byId, order));
    }
    return sorted.get(c);
  };

  // The room moved to place `p` of column `c`: the cards of the column it leaves and of the one it goes to slide
  // from where they are drawn now (a slide under way included) to where they then stand.
  const open = (c, p) => {
    const moving = new Set([...columns[at.c].slots, ...columns[c].slots]);
    const before = new Map([...moving].map((each) => [each, each.getBoundingClientRect()]));
    for (const each of moving) {
      each.style.transition = "none";
      each.style.transform = "";
    }
    columns[c].cards.insertBefore(slot, columns[c].slots[p] ?? null);
    if (columns[c].key !== columns[at.c].key && ghost) {
      paint(ghost, colorOf(columns[c].key));
      ghost.dataset.col = columns[c].key;
    }
    at = { c, p };
    slide(moving, (each) => before.get(each));
  };

  // Each of `nodes` slid from where `from(node)` says it was drawn to where it stands now; what the slide wrote on it
  // taken off once it is over (a node slid again meanwhile is the later slide's).
  const slide = (nodes, from) => {
    const run = ++slides;
    const shifted = [];
    for (const each of nodes) {
      slidBy.set(each, run);
      const was = still ? null : from(each);
      if (!was || !each.isConnected) continue;
      const now = each.getBoundingClientRect();
      const dx = was.left - now.left;
      const dy = was.top - now.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
      each.style.transition = "none";
      each.style.transform = `translate(${dx}px, ${dy}px)`;
      shifted.push(each);
    }
    if (shifted.length) {
      void board.offsetWidth;
      for (const each of shifted) {
        each.style.transition = EASE;
        each.style.transform = "";
      }
    }
    const tidy = () => {
      for (const each of nodes) {
        if (slidBy.get(each) !== run) continue;
        each.style.removeProperty("transition");
        each.style.removeProperty("transform");
      }
    };
    if (shifted.length) setTimeout(tidy, LAND + 40);
    else tidy();
  };
  let slides = 0;
  const slidBy = new WeakMap(); // a node -> the last slide it took part in

  const valueOf = (key) => (prop.type === "checkbox" ? key === "yes" : key === "" ? null : key);

  const onMove = (moved) => {
    pointer = { x: moved.clientX, y: moved.clientY };
    if (!started) {
      if (Math.hypot(moved.clientX - x0, moved.clientY - y0) < DRAG) return;
      begin();
    }
    follow();
    edges.at(moved.clientX, moved.clientY);
  };
  const onScroll = () => follow();

  const stop = () => {
    removeEventListener("mousemove", onMove);
    removeEventListener("mouseup", up);
    board.removeEventListener("scroll", onScroll);
    pageEvents?.removeEventListener("scroll", onScroll);
    edges.stop();
    stopCancel();
    app?.classList.remove("is-dragging");
  };

  // The copy flown to `target` (a card's box, or none: it fades), then taken away and `done()`.
  const land = (target, done) => {
    if (still || !ghost) {
      ghost?.remove();
      done();
      return;
    }
    const from = ghost.getBoundingClientRect();
    ghost.classList.add("landing");
    if (target) ghost.style.transform = `translate(${target.left - from.left}px, ${target.top - from.top}px)`;
    else ghost.style.opacity = "0";
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      ghost.remove();
      done();
    };
    ghost.addEventListener("transitionend", (event) => { if (event.propertyName === (target ? "transform" : "opacity")) end(); });
    setTimeout(end, LAND + 60);
  };

  function up() {
    stop();
    if (!started) return;
    swallowClick();
    const column = columns[at.c];
    const before = column.slots[at.p]?.querySelector("[data-card]")?.dataset.card ?? null;
    // Where every other card is drawn as it is let go (a slide under way included), so that each goes on from there.
    const seen = new Map([...board.querySelectorAll("[data-card]")].filter((each) => each !== node).map((each) => [each.dataset.card, each.getBoundingClientRect()]));
    const was = store.doc;
    hold(false);
    store.commit((d) => dropCard(d, { rowId: row.id, prop, value: valueOf(column.key), before, reorder: sorts.length === 0 }));
    // Nothing changed (let go where it was): drawn again as it was.
    if (store.doc === was) draw();
    const cards = [...board.querySelectorAll("[data-card]")];
    const landed = cards.find((each) => each.dataset.card === row.id) ?? null;
    slide(cards.filter((each) => each !== landed).map((each) => each.parentElement), (each) => seen.get(each.firstElementChild?.dataset.card));
    if (landed) landed.style.visibility = "hidden";
    land(landed?.getBoundingClientRect() ?? null, () => {
      if (landed) landed.style.visibility = "";
    });
  }

  // Given up: the room back where it was, the copy flown back into it, nothing written.
  function cancel() {
    stop();
    if (!started) return;
    swallowRelease();
    if (at.c !== home.c || at.p !== home.p) open(home.c, home.p);
    land(slot.getBoundingClientRect(), () => slot.classList.remove("card-gap"));
    // The board free to draw again at once (a change that came meanwhile drawn now), so that a card pressed while
    // this one flies back drags on a board that is held for it alone.
    hold(false);
  }

  addEventListener("mousemove", onMove);
  addEventListener("mouseup", up);
  board.addEventListener("scroll", onScroll, { passive: true });
  pageEvents?.addEventListener("scroll", onScroll, { passive: true });
}
