// /kit/board.js (an esbuild bundle of this folder): a custom page's boards laid out (docs/render.md
// "A custom page"), loaded by every custom page
// and by no document (assets.mjs, `page`). What it does, each time a board or a card changes:
//   - each card (.gallery-card) gets its place and size as the CSS reads them, --gallery-x,
//     --gallery-y, --gallery-w and --gallery-h, from its data-x, data-y, data-w and data-h, whole
//     cells (0 <= x, 1 <= w <= 12, x + w <= 12, 0 <= y, 1 <= h <= 24: a number past them is held to
//     them, one that is no number is the default, a 4 x 2 card at 0, 0);
//   - a card whose block lays out by its content (`fit: "content"`, which the server says as
//     data-ge-fit="content": shared/page-cards.mjs servedPage) is drawn as high as what it holds needs,
//     in whole cells (ceil((height + 16) / (cell + 16)), at least 1), measured again as that
//     changes; the cards under one drawn higher than the file says are drawn pushed down, as far as they
//     must, never up (shared/board-places.mjs settle, the page service's own rule), so that none shares
//     a cell; the file says where each card is, and the page draws it there or lower;
//   - the rows above a board's first card are not drawn (each card's --gallery-y is its row less the
//     board's skip, DocBoard.skipped): its first row of cards stands at the board's top, the page's own
//     top padding, wherever the file puts them, so that a card taken out of the top row leaves no empty
//     band; while the editing shows a draft no more rows are skipped than as it began (a card dragged
//     down from the top row is drawn where it is held, the rows closing up once it is dropped);
//   - each board (.gallery-board) gets how many columns it has now as data-columns (and as the CSS reads
//     it, --gallery-columns) and its cell's side in pixels as --gallery-cell: a cell is CELL (64px) square
//     whatever the window, as a document's reading width is (shared/board-places.mjs gridFor; the user's
//     word of 2026-11-09: folding the workbench's sidebar makes no card larger, it only leaves more room
//     on either side), twelve to a row, 944px, in the middle of the board: its wide view, each card at its
//     data-x, -y, -w and -h. Where the board's width holds 8 but not 12, its narrow view: NARROW (8)
//     columns, each card at its data-narrow-x, -y, -w and -h (card-size.mjs narrowCellsOf), a card without
//     them at the first free spot, a board none of whose cards has them one card after another in the
//     order of their wide places (board-places.mjs narrowPlaces: the user's word of 2026-11-13, each view
//     arranged on its own, the same cards on both). Narrower still (a phone's), as many columns as it
//     holds, 4 at the least (smaller cells only where not even 4 fit), the narrow view's cards one after
//     another in their order (flow), the board drawn in the columns they take, none of it written;
//   - when a card's size in cells or in pixels changed (a board gone narrow or wide, the window
//     resized, a card's data-w or data-h written, one of fit content grown), the window hears
//     doc-layout-change once that frame, which the kit's runtime tells every instance that listens
//     for "layout" (runtime/kernel.js); an instance on a page reads its card's size there (the
//     contract below).
// Nothing here writes the file: the attributes are the page's, the custom properties this script's
// alone. The page's board editing (src/editor/page/board/) moves a card by asking the page service,
// and while a card is dragged or resized shows where it would go by a draft (DocBoard.draft: cells of
// the editing's own for some cards, the others pushed down around them by the service's own rule, then
// drawn as the file would draw them once it says so: what the drop leaves), which a drop or an Escape
// takes away.
//
// The contract a block's runtime reads on a custom page: the page is <main class="gallery-page">
// (context.place "page"); an instance's card is its closest .gallery-card, data-card-id its key, and
// its size { w, h, width, height } is the cells the card is drawn at (shared/card-size.mjs
// drawnCells: what this script drew it at, --gallery-w and --gallery-h, which are DocBoard.cellsOf
// but for a card of fit content, as high as its content), w no more than its board's data-columns,
// and the pixels of the card's content box (its clientWidth and clientHeight less its padding). Never
// the raw data-w or data-h: a card written 30 high is drawn 24 high, and its block lays out for 24.

// A card's cells as the CSS takes them (its data-* held to the board's 12 columns, each a whole
// number): the one rule the kit's runtime also reads a card's size by (context.size, drawnCells).
import { cellsOf, narrowCellsOf } from "../../../shared/card-size.mjs";
import { GRID, NARROW, fitHeight, flow, gridFor, narrowPlaces, settle } from "../../../shared/board-places.mjs";

export { cellsOf };

/** A board's columns, cell side and the width its columns take, for its width in pixels (gridFor). */
export const gridOf = gridFor;

if (typeof document !== "undefined" && !globalThis.DocBoard) {
  let told = false;
  // doc-layout-change once a frame, however many cards changed in it.
  const tell = () => {
    if (told) return;
    told = true;
    requestAnimationFrame(() => {
      told = false;
      dispatchEvent(new Event("doc-layout-change"));
    });
  };
  const said = new WeakMap(); // a card -> the size it last had: "w h width height"
  const drafts = new WeakMap(); // a board -> Map(card -> cells) while the editing shows a drag
  const skips = new WeakMap(); // a board -> the rows above its first card it does not draw now
  const kept = new WeakMap(); // a board -> its skip as a draft began, which the draft's own rows never raise
  const drawnOf = new WeakMap(); // a card -> the cells it is drawn at now
  const placeOf = new WeakMap(); // a card -> its place in the view its board shows now, as the file has it (no draft, no content's height)
  const fits = (card) => card.dataset.geFit === "content";
  const instanceOf = (card) => [...card.children].find((child) => child.matches("[data-doc-component]")) ?? null;

  // What a card of fit content needs, in pixels: what its instance takes, its padding and border with it.
  const needed = (card) => {
    const inner = instanceOf(card);
    if (!inner) return 0;
    const style = getComputedStyle(card);
    const sides = ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"].reduce((sum, side) => sum + (parseFloat(style[side]) || 0), 0);
    return inner.getBoundingClientRect().height + sides;
  };
  const cardsIn = (board) => [...board.querySelectorAll(":scope > .gallery-card")];
  // A card at its cells, its row drawn `skip` rows up (the board's empty rows above its first card).
  const setCells = (card, cells, skip = 0) => {
    drawnOf.set(card, cells);
    for (const name of ["x", "y", "w", "h"]) {
      const property = `--gallery-${name}`;
      const value = String(name === "y" ? cells.y - skip : cells[name]);
      if (card.style.getPropertyValue(property) !== value) card.style.setProperty(property, value);
    }
  };
  // Whether a card's size (cells, as its board has them now, or pixels) is not what it was: told.
  const measureCard = (card, columns) => {
    const { w, h } = drawnOf.get(card) ?? cellsOf(card);
    const size = `${Math.min(w, columns)} ${h} ${card.clientWidth} ${card.clientHeight}`;
    if (said.get(card) === size) return;
    const first = !said.has(card);
    said.set(card, size);
    if (!first) tell();
  };
  // A board's columns as drawn: data-columns, what a block's size and the editing read, and
  // --gallery-columns, what the CSS lays the grid by.
  const setColumns = (board, columns) => {
    if (board.dataset.columns !== String(columns)) board.dataset.columns = String(columns);
    if (board.style.getPropertyValue("--gallery-columns") !== String(columns)) board.style.setProperty("--gallery-columns", String(columns));
  };
  const layBoard = (board) => {
    const { columns, cell, view } = gridOf(board.clientWidth);
    setColumns(board, columns);
    const side = `${Math.round(cell * 100) / 100}px`;
    if (board.style.getPropertyValue("--gallery-cell") !== side) board.style.setProperty("--gallery-cell", side);
    const draft = drafts.get(board);
    const cards = cardsIn(board);
    // The file's places; with a draft, its cards at the cells it gives them and those they then meet
    // pushed down under them, as the page service writes a drop (pushDown: settle with them held), so
    // that what a drag shows is what its drop leaves. Then drawn: each card of fit content as high as what
    // it holds, those under one drawn higher than the file says lower (settle, nothing held), a draft's
    // card too: a card dropped over the room a card of fit content takes above it is drawn under that card
    // once dropped, so it is shown under it while it is held.
    // The view's places: the wide view's are the file's data-x, -y, -w and -h; the narrow view's (and a
    // phone's, which flows them) its narrow places, or where it says none, where narrowPlaces puts them.
    const wide = view === "wide";
    let placed = cards.map((card, index) => ({ id: String(index), ...cellsOf(card), narrow: wide ? null : narrowCellsOf(card) }));
    placed = wide ? placed.map(({ narrow, ...cells }) => cells) : narrowPlaces(placed);
    cards.forEach((card, index) => placeOf.set(card, { x: placed[index].x, y: placed[index].y, w: placed[index].w, h: placed[index].h }));
    if (draft) {
      const held = [];
      placed = placed.map((cells, index) => {
        const own = draft.get(cards[index]);
        if (!own) return cells;
        held.push(cells.id);
        return { id: cells.id, x: own.x, y: own.y, w: own.w, h: own.h };
      });
      placed = settle(placed, held);
    }
    // Each card of fit content as high as what it holds, those under one drawn higher than its place
    // says pushed down (settle), in either view; a phone's room the cards one after another (flow), the
    // board drawn in the columns they take (the cards in the middle of the room).
    const cells = placed.map((one, index) => (fits(cards[index]) && !draft?.get(cards[index])?.fixed ? { ...one, h: fitHeight(needed(cards[index]), cell) } : one));
    const laid = view === "tiny" ? flow(cells, columns) : settle(cells);
    if (view === "tiny" && laid.length) setColumns(board, Math.max(...laid.map(({ x, w }) => x + w)));
    // The rows above the board's first card are not drawn: its first row of cards stands where the board
    // starts, the page's own top padding, wherever the file puts them (a card taken out of the top row
    // leaves no empty band). While a draft is shown no more are skipped than as it began, so that a card
    // dragged down from the top row is drawn where it is held (the rows close up once it is dropped), and
    // fewer where one is held above the first row, which is then drawn at the top.
    const least = laid.length ? Math.min(...laid.map(({ y }) => y)) : 0;
    const skip = draft && kept.has(board) ? Math.min(kept.get(board), least) : least;
    skips.set(board, skip);
    cards.forEach((card, index) => setCells(card, laid[index], skip));
  };

  const boards = new Set();
  const resized = new ResizeObserver((entries) => {
    const again = new Set();
    for (const { target } of entries) {
      if (target.matches(".gallery-board")) again.add(target);
      else if (!target.matches(".gallery-card")) {
        const card = target.parentElement;
        if (card && fits(card) && boards.has(card.parentElement)) again.add(card.parentElement);
      }
    }
    for (const board of again) layBoard(board);
    for (const board of boards) {
      const columns = Number(board.dataset.columns) || 12;
      for (const card of cardsIn(board)) measureCard(card, columns);
    }
  });
  const watchCard = (card) => {
    resized.observe(card);
    const inner = instanceOf(card);
    if (inner && fits(card)) resized.observe(inner);
  };
  const watchBoard = (board) => {
    if (boards.has(board)) return;
    boards.add(board);
    layBoard(board);
    resized.observe(board);
    for (const card of cardsIn(board)) watchCard(card);
  };
  const look = (root = document) => {
    for (const board of root.querySelectorAll?.(".gallery-board") ?? []) watchBoard(board);
  };
  // A card's data-x, -y, -w or -h (or its narrow view's) written, a card or a board come or gone: laid out again.
  new MutationObserver((records) => {
    const again = new Set();
    for (const record of records) {
      if (record.type === "attributes") {
        const card = record.target;
        if (card.matches?.(".gallery-card") && boards.has(card.parentElement)) again.add(card.parentElement);
        continue;
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches(".gallery-board")) watchBoard(node);
        else if (node.matches(".gallery-card") && boards.has(node.parentElement)) {
          watchCard(node);
          again.add(node.parentElement);
        } else if (node.matches("[data-doc-component]") && node.parentElement?.matches(".gallery-card") && boards.has(node.parentElement.parentElement)) {
          watchCard(node.parentElement);
          again.add(node.parentElement.parentElement);
        } else look(node);
      }
      for (const node of record.removedNodes) {
        if (node.nodeType !== 1) continue;
        if (boards.has(node)) {
          boards.delete(node);
          resized.unobserve(node);
        } else if (node.matches(".gallery-card") && boards.has(record.target)) again.add(record.target);
      }
    }
    for (const board of again) {
      layBoard(board);
      const columns = Number(board.dataset.columns) || 12;
      for (const card of cardsIn(board)) measureCard(card, columns);
    }
  }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-x", "data-y", "data-w", "data-h", "data-narrow-x", "data-narrow-y", "data-narrow-w", "data-narrow-h", "data-ge-fit"] });

  // The boards the parser has read when this runs (its tag stands after the page's main), and any the
  // rest of the page holds once it is read.
  look();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => look(), { once: true });
  globalThis.DocBoard = Object.freeze({
    cellsOf,
    gridOf,
    /** The cells card `card` is drawn at now ({ x, y, w, h }: its file's, or lower, or as high as its content), its row as the file counts them (skipped: how many it is drawn up). */
    drawn: (card) => ({ ...(drawnOf.get(card) ?? cellsOf(card)) }),
    /** Card `card`'s place in the view its board shows now, as the file has it ({ x, y, w, h }): its data-x … in the wide view, its narrow place (or where the narrow view puts it) in the narrow one. */
    placeOf: (card) => ({ ...(placeOf.get(card) ?? cellsOf(card)) }),
    /** Which view board `board` shows now: "wide" (twelve columns), "narrow" (NARROW) or "tiny" (fewer: a phone's, the cards flowed, placed by nothing). */
    view: (board) => { const columns = Number(board.dataset.columns) || GRID.columns; return columns >= GRID.columns ? "wide" : columns === NARROW ? "narrow" : "tiny"; },
    /** How many rows above its first card board `board` does not draw now: its drawn row r is the file's row r + skipped. */
    skipped: (board) => skips.get(board) ?? 0,
    /**
     * Board `board` drawn as it would be with some of its cards at cells of the editing's (`cells`:
     * Map(card -> { x, y, w, h, fixed? }), `fixed` a height kept for a card of fit content): the cards
     * they meet pushed down under them (the page service's pushDown), then all drawn as the file would
     * draw them (fit content as high as it is, what is under it lower: a draft's card too); null draws it
     * as the file says again. Laid out at once.
     */
    draft(board, cells) {
      if (cells && cells.size) {
        if (!drafts.has(board)) kept.set(board, skips.get(board) ?? 0);
        drafts.set(board, cells);
      } else {
        drafts.delete(board);
        kept.delete(board);
      }
      layBoard(board);
      const columns = Number(board.dataset.columns) || 12;
      for (const card of cardsIn(board)) measureCard(card, columns);
    },
    /** Board `board` laid out again now (a card put in or taken out by the editing). */
    layout(board) {
      if (!boards.has(board)) return watchBoard(board);
      layBoard(board);
    },
  });
}
