// Where the cards of a custom page's board go (docs/render.md
// "A custom page"): the one set of rules every side places a card by, so that what the
// page shows while a card is dragged, what the page service writes and what gallery page add writes
// are the same. The page service (src/editor/page-service.mjs) and gallery page add place and push
// cards in the file by them; the kit's board script (src/render/kit/board/) draws a board by them,
// cards of `fit: "content"` as high as what they hold, those under them pushed down; the page's board
// editing (src/editor/page/board/) shows a drag's spot and the cards it pushes by them before it asks
// the service. Pure: no DOM, no Node.
//
// A card is { id, x, y, w, h } in whole cells of a board 12 columns wide, at most 24 cells high: what the
// file says, wherever it is drawn. A cell's side is fixed (CELL), as a document's reading width is, so a
// board is as wide whatever the window (the workbench's sidebar open or folded). A board has two views
// (the user's word of 2026-11-13: both arranged, dragged, resized and added to, the same cards on both):
// the wide view, twelve columns, where the room holds them, and the narrow view, NARROW columns, where it
// holds NARROW but not twelve (gridFor), each card at its narrow place (data-narrow-*: card-size.mjs
// narrowCellsOf); a board none of whose cards has one yet draws its narrow view by its wide places, one
// card after another in their order (flow), written by nothing until the narrow view is first arranged
// (narrowPlaces). A room that holds fewer than NARROW (a phone's) draws the narrow view's cards one after
// another in as many columns as it holds (flow), LEAST at the least, which nothing places or writes. Nothing
// here ever moves a card up: a card pushed down stays where it was pushed, the room it left a room on the
// board, as on a board things are pinned to. A card held by a drag lands where `landing` says, which pushes
// a card only where the held one is really put on it, never one it merely clips on its way past (the user's
// word of 2026-11-14), and where it is put on one card alone that can take its place, the two exchange
// (`exchange`: the user's word of 2026-11-19); the drop then sends those cells, and the card it exchanges
// with, which the service writes by `dropped` (pushDown where there is no clean exchange), as the page
// drew them.

import { NARROW } from "./card-size.mjs";

export { NARROW };

/** The cells of a board's row, and the most a card is high (the manifest's own range). */
export const GRID = Object.freeze({ columns: 12, rows: 24 });

/** The pixels between two cells. */
export const GAP = 16;

/**
 * A cell's side in pixels, the same however wide the window (the user's word of 2026-11-09: the cards no
 * larger with the sidebar folded, only further in): twelve of them and their gaps are 944px, which the
 * workbench's content holds on a 1280px laptop with the sidebar open at its default width.
 */
export const CELL = 64;

/** The fewest columns a room narrower than the narrow view draws in: where not even these fit their cells are drawn smaller. */
export const LEAST = 4;

/** The pixels `n` cells take on a board whose cell is `cell` pixels (n cells and the n - 1 gaps between them). */
export const spanOf = (n, cell, gap = GAP) => n * cell + Math.max(0, n - 1) * gap;

/**
 * A board drawn in `room` pixels: { columns, cell, width, view }, its cells CELL, GAP apart: the wide view,
 * twelve of them, where the room holds them; the narrow view, NARROW, where it holds NARROW but not twelve;
 * else ("tiny", a phone's room) as many as it holds, LEAST at the least, smaller cells only where not even
 * LEAST fit, the narrow view's cards one after another (flow), placed by nothing. `width` is what its
 * columns take (the board stands them in its middle).
 */
export function gridFor(room) {
  const fit = Math.floor((Math.max(0, room) + GAP) / (CELL + GAP));
  if (fit >= GRID.columns) return { columns: GRID.columns, cell: CELL, width: spanOf(GRID.columns, CELL), view: "wide" };
  if (fit >= NARROW) return { columns: NARROW, cell: CELL, width: spanOf(NARROW, CELL), view: "narrow" };
  const columns = Math.max(LEAST, fit);
  const cell = fit >= LEAST ? CELL : Math.max(0, (room - (LEAST - 1) * GAP) / LEAST);
  return { columns, cell, width: spanOf(columns, cell), view: "tiny" };
}

const whole = (value, fallback) => (Number.isInteger(value) ? value : fallback);

/** Whether cards `a` and `b` share a cell. */
export const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Cells `{ x, y, w, h }` held to a board of `columns`: 1 <= w <= columns, 1 <= h <= 24, 0 <= x <=
 * columns - w, 0 <= y; what is no whole number the default, a 4 x 2 card at 0, 0.
 */
export function onBoard({ x, y, w, h }, columns = GRID.columns) {
  const width = Math.min(columns, Math.max(1, whole(w, 4)));
  const height = Math.min(GRID.rows, Math.max(1, whole(h, 2)));
  return { x: Math.min(columns - width, Math.max(0, whole(x, 0))), y: Math.max(0, whole(y, 0)), w: width, h: height };
}

/**
 * The cards of a board with none sharing a cell, none moved up: `fixed` (ids) stay where they are,
 * and every other card, in the order of its place (top to bottom, left to right, then as given), goes
 * down until it shares no cell with one placed before it, right under the one it met. What the file
 * says of a board that shares no cell is what this gives back. Returns new cards, in the order given.
 * @template {{ id: string, x: number, y: number, w: number, h: number }} Card
 * @param {Card[]} cards
 * @param {Iterable<string>} fixed
 * @returns {Card[]}
 */
export function settle(cards, fixed = []) {
  const kept = new Set(fixed);
  const placed = cards.filter((card) => kept.has(card.id)).map((card) => ({ ...card }));
  const rest = cards.map((card, index) => ({ card, index })).filter(({ card }) => !kept.has(card.id))
    .sort((a, b) => a.card.y - b.card.y || a.card.x - b.card.x || a.index - b.index);
  for (const { card } of rest) {
    const going = { ...card };
    for (let met = placed.filter((other) => overlaps(going, other)); met.length > 0; met = placed.filter((other) => overlaps(going, other))) {
      going.y = Math.max(...met.map((other) => other.y + other.h));
    }
    placed.push(going);
  }
  const at = new Map(placed.map((card) => [card.id, card]));
  return cards.map((card) => at.get(card.id));
}

/**
 * The cards with card `moved.id` at `moved`'s cells (held to the board), and those it now shares a cell
 * with pushed down under it, and so on (settle): what a drop, a resize and a card put on a board at a
 * place of its own do. A card of no id there joins them (a card added).
 */
export function pushDown(cards, moved, columns = GRID.columns) {
  const cells = onBoard(moved, columns);
  const next = cards.some((card) => card.id === moved.id)
    ? cards.map((card) => (card.id === moved.id ? { ...card, ...cells } : card))
    : [...cards, { ...moved, ...cells }];
  return settle(next, [moved.id]);
}

/** The cells cards `a` and `b` share (0 where they share none). */
export const shared = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * Where cards `id` and `other` go when they exchange places (the user's word of 2026-11-19, of the home page:
 * the card added beside the to-dos dragged onto them, the two to change places, where the met card had only
 * ever been pushed down): `cards` the board's cards at their places in the view it shows (`columns` wide), `id`
 * the card a drag holds, at the place the drag took it from. The two change sides within the cells they span:
 * side by side (rows in common, no column), each to the other's side, the one on the left ending where the
 * right one ended, the right one starting where the left one started (so that a 4 wide card and an 8 wide one
 * stay packed as they stood, the room between them kept), each on its own rows, or, where that is not clean,
 * both on the lower of their two top rows (recent edits 4 x 4 at the first row's end, rows 0 to 4, the to-dos
 * 8 x 4 under the first row's two cards at 0,2: recent edits at 0,0 would meet the countdown, so both go to
 * row 2, recent edits at 0,2 and the to-dos at 4,2, whichever of the two is held); one above the other
 * (columns in common, no row), each to the other's end, the lower one starting where the upper one started,
 * the upper one ending where the lower one ended, each in its own columns, or, where that is not clean, both
 * in the further right of their two first columns; apart on both axes, each at the other's top-left corner,
 * held to the board by its own size. { moved, other }, each its cells, where that is clean: the two share no
 * cell, neither shares one with a third card, and `other` goes no higher than it was (nothing here moves a
 * card up: of two cards one above the other the lower dragged onto the upper one takes its place and the
 * upper one goes down, as pushDown would put it, while the upper dragged onto the lower one pushes it down).
 * Null where none of them is clean, where the two share a cell already, or where either is not on the board:
 * no exchange, the cards met give way down (pushDown). Pure: what the page draws while a card is held, its
 * drop and the service's write go by it alike, from the board's places alone, never the pointer's.
 * @param {{ id: string, x: number, y: number, w: number, h: number }[]} cards
 * @param {string} id
 * @param {string} other
 * @returns {{ moved: { x: number, y: number, w: number, h: number }, other: { x: number, y: number, w: number, h: number } } | null}
 */
export function exchange(cards, id, other, columns = GRID.columns) {
  const from = cards.find((card) => card.id === id);
  const met = cards.find((card) => card.id === other);
  if (!from || !met || id === other) return null;
  const a = onBoard(from, columns);
  const b = onBoard(met, columns);
  const rows = a.y < b.y + b.h && b.y < a.y + a.h;
  const sides = a.x < b.x + b.w && b.x < a.x + a.w;
  if (rows && sides) return null;
  // The ways the two may go, the first that is clean taken: each on its own rows (columns), then both on the
  // lower of the two (the further right).
  let ways;
  if (rows) {
    const left = Math.min(a.x, b.x);
    const right = Math.max(a.x + a.w, b.x + b.w);
    const x = { moved: a.x < b.x ? right - a.w : left, back: b.x < a.x ? right - b.w : left };
    const low = Math.max(a.y, b.y);
    ways = [[{ ...a, x: x.moved }, { ...b, x: x.back }], [{ ...a, x: x.moved, y: low }, { ...b, x: x.back, y: low }]];
  } else if (sides) {
    const top = Math.min(a.y, b.y);
    const bottom = Math.max(a.y + a.h, b.y + b.h);
    const y = { moved: a.y < b.y ? bottom - a.h : top, back: b.y < a.y ? bottom - b.h : top };
    const far = Math.max(a.x, b.x);
    ways = [[{ ...a, y: y.moved }, { ...b, y: y.back }], [onBoard({ ...a, x: far, y: y.moved }, columns), onBoard({ ...b, x: far, y: y.back }, columns)]];
  } else {
    ways = [[onBoard({ x: b.x, y: b.y, w: a.w, h: a.h }, columns), onBoard({ x: a.x, y: a.y, w: b.w, h: b.h }, columns)]];
  }
  const clean = ([moved, back]) => back.y >= b.y && !overlaps(moved, back)
    && !cards.some((card) => card.id !== id && card.id !== other && (overlaps(card, moved) || overlaps(card, back)));
  const way = ways.find(clean);
  return way ? { moved: way[0], other: way[1] } : null;
}

/**
 * The cards once card `moved.id` is dropped at `moved`'s cells: where `moved.swap` names the card it
 * exchanges with, the exchange is clean (`exchange`) and `moved` is where it puts the card, the two at their
 * new places and every other card as it was (settle, the two kept: what a board that shares no cell stays);
 * else as pushDown puts them (`moved`'s cells taken as they are asked, the cards they meet under them). What
 * the page draws while a card is held, what it shows at its drop and what the page service writes of the
 * drop's `place`, so that the three are the same. Returns new cards, in the order given.
 */
export function dropped(cards, moved, columns = GRID.columns) {
  const { swap, ...cells } = moved;
  const at = onBoard(cells, columns);
  const done = typeof swap === "string" ? exchange(cards, cells.id, swap, columns) : null;
  if (!done || done.moved.x !== at.x || done.moved.y !== at.y || done.moved.w !== at.w || done.moved.h !== at.h) return pushDown(cards, cells, columns);
  return settle(cards.map((card) => (card.id === cells.id ? { ...card, ...at } : card.id === swap ? { ...card, ...done.other } : card)), [cells.id, swap]);
}

/**
 * Where a card held by a drag lands, { x, y } and, where it exchanges places with the card it is put on,
 * `swap`, that card's id (the user's word of 2026-11-14, of the home page: a card the dragged one only went
 * past flashed down out of its way and back; and of 2026-11-19: a card dragged onto its neighbour takes its
 * place, the neighbour its own): `cards` the board's cards at their places in the view it shows (the held
 * one among them, at the place the drag took it from, or not), `held` { id, w, h } the card held, `at`
 * where the pointer has its top-left, in cells (its pixels from the board's left and top over a cell and
 * its gap: fractions, as cellAt would round them), `was` where it landed before this (its own place as the
 * drag begins; with its `swap` where it was an exchange). The whole cells nearest to `at` (held to the row)
 * where they share no cell with another card; where they cover more than half of exactly one card they
 * meet, or it covers more than half of them, and the two can exchange cleanly (`exchange`), where the
 * exchange puts the held card (for two side by side the other one's side: that card's corner where they are
 * as wide) and the exchange, the met card drawn where it goes, at the held card's side or end of the cells
 * they span; else where they cover more than half of a card they meet, or a card they meet covers
 * more than half of them: the reader puts it there, and the cards it meets give way (pushDown, as the drop
 * then writes). Where they only clip the cards they meet, half of neither: the free place nearest `at`
 * among the whole cells around it (less than a cell off on each axis: the two columns and the two rows `at`
 * lies between), the top one, then the left one of two as near; and where none of those is free, where it
 * landed before (an exchange with it, where it is one still), so that a card it passes is neither pushed
 * nor put back. What the page shows while a card is dragged and what its drop sends (`place`, its `swap`
 * with it, written by `dropped`); a place asked by its cells (gallery page card, 大小 ›, an undo) is taken
 * as it is asked and does not come here.
 * @param {{ id: string, x: number, y: number, w: number, h: number }[]} cards
 * @param {{ id: string, w: number, h: number }} held
 * @param {{ x: number, y: number }} at
 * @param {{ x: number, y: number, swap?: string }} was
 * @returns {{ x: number, y: number, swap?: string }}
 */
export function landing(cards, held, at, was, columns = GRID.columns) {
  const { w, h } = onBoard({ x: 0, y: 0, w: held.w, h: held.h }, columns);
  const spotAt = (x, y) => ({ x: Math.min(columns - w, Math.max(0, x)), y: Math.max(0, y), w, h });
  const others = cards.filter((card) => card.id !== held.id);
  const spot = spotAt(Math.round(at.x), Math.round(at.y));
  const met = others.filter((card) => overlaps(spot, card));
  if (met.length === 0) return { x: spot.x, y: spot.y };
  // More than half of either: twice what they share past the smaller of the two. Of exactly one such card, the
  // exchange where it is clean.
  const over = met.filter((card) => 2 * shared(spot, card) > Math.min(card.w * card.h, w * h));
  if (over.length === 1) {
    const swap = exchange(cards, held.id, over[0].id, columns);
    if (swap) return { x: swap.moved.x, y: swap.moved.y, swap: over[0].id };
  }
  if (over.length > 0) return { x: spot.x, y: spot.y };
  let best = null;
  for (const y of new Set([Math.floor(at.y), Math.ceil(at.y)])) {
    for (const x of new Set([Math.floor(at.x), Math.ceil(at.x)])) {
      const near = spotAt(x, y);
      if (others.some((card) => overlaps(near, card))) continue;
      const far = Math.hypot(near.x - at.x, near.y - at.y);
      if (!best || far < best.far || (far === best.far && (near.y < best.y || (near.y === best.y && near.x < best.x)))) best = { x: near.x, y: near.y, far };
    }
  }
  if (best) return { x: best.x, y: best.y };
  const kept = typeof was.swap === "string" ? exchange(cards, held.id, was.swap, columns) : null;
  return kept && kept.moved.x === was.x && kept.moved.y === was.y ? { x: was.x, y: was.y, swap: was.swap } : { x: was.x, y: was.y };
}

/**
 * The first place a card of `w` x `h` cells takes on a board holding `cards`, reading the board as a
 * page is read: the topmost row it fits in, and there the leftmost column, sharing a cell with none.
 * @returns {{ x: number, y: number }}
 */
export function freeSpot(cards, { w, h }, columns = GRID.columns) {
  const { w: width, h: height } = onBoard({ x: 0, y: 0, w, h }, columns);
  const bottom = cards.reduce((most, card) => Math.max(most, card.y + card.h), 0);
  for (let y = 0; y <= bottom; y++) {
    for (let x = 0; x + width <= columns; x++) {
      if (!cards.some((card) => overlaps({ x, y, w: width, h: height }, card))) return { x, y };
    }
  }
  return { x: 0, y: bottom };
}

/**
 * The size a card of a block takes when it is put on a board (the manifest's `card`, as the catalog
 * reads it: component-catalog.mjs cardOf): the first of its `sizes`, else its `w` and `h`; `h` null
 * where the manifest says none, the fewest whole cells its content takes, which only the page measures
 * (`measured`: 2 until then).
 * @param {{ sizes?: number[][] | null, w?: number, h?: number | null } | null | undefined} card
 * @returns {{ w: number, h: number, measured: boolean }}
 */
export function defaultSize(card) {
  if (card?.sizes?.length) return { w: card.sizes[0][0], h: card.sizes[0][1], measured: false };
  return { w: card?.w ?? 4, h: card?.h ?? 2, measured: card?.h === null || card?.h === undefined };
}

/** Of `sizes` ([w, h] each), the nearest to `w` x `h` (by the distance of their corners; the first of two as near). */
export function nearestSize(sizes, { w, h }) {
  let best = sizes[0];
  let far = Infinity;
  for (const size of sizes) {
    const distance = (size[0] - w) ** 2 + (size[1] - h) ** 2;
    if (distance < far) {
      far = distance;
      best = size;
    }
  }
  return { w: best[0], h: best[1] };
}

/**
 * What a card of a block may be resized to, for `w` x `h` asked: the nearest of the manifest's `sizes`
 * where it lists them (unless `any`: a manifest that wrote a min or a max beside them frees the card,
 * its sizes only the common ones its menu lists), else whole cells between its `min` and `max`
 * (1 x 1 and 12 x 24 where it says none), never past the board.
 */
export function sizeFor(card, { w, h }, columns = GRID.columns) {
  if (card?.sizes?.length && !card.any) {
    const near = nearestSize(card.sizes, { w, h });
    return { w: Math.min(columns, near.w), h: near.h };
  }
  const min = { w: card?.min?.w ?? 1, h: card?.min?.h ?? 1 };
  const max = { w: Math.min(columns, card?.max?.w ?? GRID.columns), h: Math.min(GRID.rows, card?.max?.h ?? GRID.rows) };
  return { w: Math.min(max.w, Math.max(min.w, Math.round(w))), h: Math.min(max.h, Math.max(min.h, Math.round(h))) };
}

/**
 * The cells high a card of `fit: "content"` is drawn, for its content `height` in pixels (what it
 * needs, its frame and padding with it) on a board whose cell is `cell` pixels:
 * ceil((height + 16) / (cell + 16)), 1 at least and 24 at most.
 */
export function fitHeight(height, cell, gap = GAP) {
  if (!(cell > 0)) return 1;
  return Math.min(GRID.rows, Math.max(1, Math.ceil((height + gap) / (cell + gap) - 1e-6)));
}

/**
 * The cards of a board drawn in `columns` fewer than twelve (a narrow room: gridFor): one after another
 * in the order of their places (top to bottom, left to right, then as given), each as wide as it is but
 * never wider than the row (`w` held to `columns`) and as high, each at the first spot at or after where
 * the one before it ends, row by row, that shares no cell with those before it (as a grid flows its items
 * with no place of their own: no card goes before one it came after, so a room may be left beside a tall
 * one). The narrow view of a board none of whose cards has a narrow place yet (narrowPlaces), what it is
 * drawn at until it is first arranged. Returns new cards, in the order given.
 * @template {{ id: string, x: number, y: number, w: number, h: number }} Card
 * @param {Card[]} cards
 * @param {number} columns
 * @returns {Card[]}
 */
export function flow(cards, columns) {
  const order = cards.map((card, index) => ({ card, index })).sort((a, b) => a.card.y - b.card.y || a.card.x - b.card.x || a.index - b.index);
  const placed = [];
  const at = new Map();
  let row = 0;
  let column = 0;
  for (const { card, index } of order) {
    const w = Math.max(1, Math.min(card.w, columns));
    let x = column;
    let y = row;
    for (;;) {
      if (x + w > columns) {
        x = 0;
        y += 1;
        continue;
      }
      const spot = { x, y, w, h: card.h };
      if (!placed.some((other) => overlaps(spot, other))) break;
      x += 1;
    }
    const going = { ...card, x, y, w };
    placed.push(going);
    at.set(index, going);
    row = y;
    column = x + w;
  }
  return cards.map((_, index) => at.get(index));
}

/**
 * The cards of a board in its narrow view (NARROW columns): `cards` [{ id, x, y, w, h, narrow }], each its
 * wide place and `narrow` its narrow one as the file writes it (card-size.mjs narrowCellsOf: null where it
 * has none). None with one: the wide places one after another (flow), what the view shows until it is
 * first arranged. Else those with one at it (held to the view, none sharing a cell: settle), and each
 * without one (a card added in the wide view, or by an Agent's write) at the first free spot by its size
 * (freeSpot, no wider than the view), in the order of its wide place. What the page draws, what an
 * op of the narrow view starts from and what it writes back, each card's then (the view arranged once,
 * every card has its narrow place). Returns { id, x, y, w, h } each, in the order given.
 * @param {{ id: string, x: number, y: number, w: number, h: number, narrow: { x: number, y: number, w: number, h: number } | null }[]} cards
 */
export function narrowPlaces(cards) {
  const plain = cards.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
  if (!cards.some((card) => card.narrow)) return flow(plain, NARROW);
  const placed = settle(cards.filter((card) => card.narrow).map((card) => ({ id: card.id, ...onBoard(card.narrow, NARROW) })));
  const rest = cards.map((card, index) => ({ card, index })).filter(({ card }) => !card.narrow)
    .sort((a, b) => a.card.y - b.card.y || a.card.x - b.card.x || a.index - b.index);
  for (const { card } of rest) {
    const size = { w: Math.min(card.w, NARROW), h: card.h };
    placed.push({ id: card.id, ...freeSpot(placed, size, NARROW), ...size });
  }
  const at = new Map(placed.map((card) => [card.id, card]));
  return cards.map((card) => at.get(card.id));
}

/** The whole cells `pixels` are nearest to, from a board's edge: what a drag snaps to. */
export const cellAt = (pixels, cell, gap = GAP) => (cell > 0 ? Math.round(pixels / (cell + gap)) : 0);

/** The cards whose cells changed from `before` to `after` (lists of cards), by id: [{ id, x, y, w, h }] as `after` has them. */
export function moved(before, after) {
  const was = new Map(before.map((card) => [card.id, card]));
  return after.filter((card) => {
    const old = was.get(card.id);
    return !old || old.x !== card.x || old.y !== card.y || old.w !== card.w || old.h !== card.h;
  });
}
