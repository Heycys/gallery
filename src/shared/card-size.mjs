// What a block's script is told of the custom page it stands on, as the kit's runtime reads it
// (runtime/kernel.js: context.place, context.size,
// context.state): the page's markup, a card's id and the cells the board draws it at. The page's host
// writes that markup and its board script lays the cards out by the rule below (the kit's board/
// imports cellsOf from here, as DocBoard.cellsOf): one rule, so that a block lays out for the card as
// drawn, never for the raw attributes. Pure, for the page.

/** A custom page's root, around every card (page.html's main). */
export const PAGE = "main.gallery-page";

/** A board of a custom page, its cards its children; it says how many columns it has now (data-columns: 12, or NARROW where it is narrower). */
export const BOARD = ".gallery-board";

/**
 * The columns of a board's narrow view (a room narrower than twelve of its cells: shared/board-places.mjs
 * gridFor), which keeps a layout of its own (each card's data-narrow-x, -y, -w and -h), the user's word of
 * 2026-11-13: the wide view and the narrow one each arranged, the same cards on both.
 */
export const NARROW = 8;

/** The attributes of a card's place in the narrow view, by axis. */
export const NARROW_ATTRIBUTES = Object.freeze({ x: "data-narrow-x", y: "data-narrow-y", w: "data-narrow-w", h: "data-narrow-h" });

/** A card of a board, around one instance: the closest one to an instance, whatever its tag. */
export const CARD = ".gallery-card";

/** A card's id, unique in its page: what an instance's reading state goes by there. */
export const CARD_ID = "data-card-id";

/** The most cells a card is wide and high (the manifest's own range for a card). */
export const MOST = Object.freeze({ w: 12, h: 24 });

/** What a card whose cells are no number is drawn at. */
const DEFAULT = Object.freeze({ x: 0, y: 0, w: 4, h: 2 });

const whole = (value, fallback) => {
  const number = Number.parseInt(value ?? "", 10);
  return Number.isFinite(number) ? number : fallback;
};

/**
 * A card's cells as the board draws them: its data-x, data-y, data-w and data-h, each a whole number
 * (parsed as an integer: "8.5" is 8), held to 1 <= w <= 12, 0 <= x <= 12 - w, 0 <= y and
 * 1 <= h <= 24, one that is no number the default (a 4 x 2 card at 0, 0).
 * @param {{ dataset: Record<string, string | undefined> }} card
 */
export function cellsOf(card) {
  const w = Math.min(MOST.w, Math.max(1, whole(card.dataset.w, DEFAULT.w)));
  const h = Math.min(MOST.h, Math.max(1, whole(card.dataset.h, DEFAULT.h)));
  const x = Math.min(MOST.w - w, Math.max(0, whole(card.dataset.x, DEFAULT.x)));
  const y = Math.max(0, whole(card.dataset.y, DEFAULT.y));
  return { x, y, w, h };
}

/**
 * A card's place in its board's narrow view, as written (data-narrow-x, -y, -w and -h, each a whole
 * number, held to NARROW columns as cellsOf holds a place to twelve), or null where the card has none
 * (any of the four missing or no number): the narrow view then places it itself (board-places.mjs
 * narrowPlaces). Read from `dataset` (narrowX, narrowY, narrowW, narrowH).
 * @param {{ dataset: Record<string, string | undefined> }} card
 */
export function narrowCellsOf(card) {
  const read = { x: card.dataset.narrowX, y: card.dataset.narrowY, w: card.dataset.narrowW, h: card.dataset.narrowH };
  if (Object.values(read).some((value) => !Number.isFinite(Number.parseInt(value ?? "", 10)))) return null;
  const w = Math.min(NARROW, Math.max(1, whole(read.w, DEFAULT.w)));
  const h = Math.min(MOST.h, Math.max(1, whole(read.h, DEFAULT.h)));
  return { x: Math.min(NARROW - w, Math.max(0, whole(read.x, 0))), y: Math.max(0, whole(read.y, 0)), w, h };
}

/**
 * The cells a card is drawn at now, what context.size says: the width the board script drew it at
 * (--gallery-w: its place in the view the board shows, the wide view's twelve columns or the narrow
 * view's NARROW), else its cells (cellsOf) held to the board's columns (data-columns; 12 where it says
 * none); its height the one the board script drew it at (--gallery-h: a card whose block lays out by
 * its content is as high as that, whatever data-h says), else its own.
 * @param {Element & { dataset: Record<string, string | undefined>, style?: CSSStyleDeclaration }} card
 * @returns {{ w: number, h: number }}
 */
export function drawnCells(card) {
  const { w, h } = cellsOf(card);
  const columns = Number(/** @type {HTMLElement | null} */ (card.closest(BOARD))?.dataset.columns) || MOST.w;
  const wide = Number.parseInt(card.style?.getPropertyValue?.("--gallery-w") ?? "", 10);
  const drawn = Number.parseInt(card.style?.getPropertyValue?.("--gallery-h") ?? "", 10);
  return { w: Math.min(Number.isFinite(wide) ? Math.max(1, wide) : w, columns), h: Number.isFinite(drawn) ? Math.min(MOST.h, Math.max(1, drawn)) : h };
}
