import assert from "node:assert/strict";
import { CELL, GAP, GRID, LEAST, NARROW, cellAt, defaultSize, dropped, exchange, fitHeight, flow, freeSpot, gridFor, landing, moved, narrowPlaces, nearestSize, onBoard, overlaps, pushDown, settle, shared, sizeFor, spanOf } from "../../src/shared/board-places.mjs";

// Where the cards of a custom page's board go (src/shared/board-places.mjs): the one
// set of rules the page service, gallery page add, the kit's board script and the page's board editing
// place a card by. Pure.

const card = (id, x, y, w, h) => ({ id, x, y, w, h });
const at = (cards) => Object.fromEntries(cards.map(({ id, x, y, w, h }) => [id, `${x},${y} ${w}x${h}`]));

// Two cards share a cell, or stand side by side.
assert.ok(overlaps(card("a", 0, 0, 4, 2), card("b", 3, 1, 2, 2)));
assert.ok(!overlaps(card("a", 0, 0, 4, 2), card("b", 4, 0, 2, 2)), "side by side: none shared");
assert.ok(!overlaps(card("a", 0, 0, 4, 2), card("b", 0, 2, 4, 2)), "one right under the other: none shared");

// Held to the board.
assert.deepEqual(onBoard({ x: 11, y: -2, w: 4, h: 30 }), { x: 8, y: 0, w: 4, h: GRID.rows });
assert.deepEqual(onBoard({ x: "a", y: 1.5, w: null, h: 0 }), { x: 0, y: 0, w: 4, h: 1 }, "no whole number: the default; under 1: 1");
assert.deepEqual(onBoard({ x: 2, y: 0, w: 6, h: 1 }, 4), { x: 0, y: 0, w: 4, h: 1 }, "on 4 columns");

// settle: a board that shares no cell stays as it is; one card drawn higher pushes those under it down, never up.
const board = [card("a", 0, 0, 4, 2), card("b", 4, 0, 4, 2), card("c", 0, 2, 4, 2), card("d", 0, 5, 12, 1)];
assert.deepEqual(settle(board), board, "nothing shared: nothing moves");
assert.deepEqual(at(settle([{ ...board[0], h: 4 }, ...board.slice(1)])), { a: "0,0 4x4", b: "4,0 4x2", c: "0,4 4x2", d: "0,6 12x1" }, "a grown: c under it, d under c, b where it was");
assert.deepEqual(at(settle([card("a", 0, 0, 4, 1), card("c", 0, 4, 4, 2)])), { a: "0,0 4x1", c: "0,4 4x2" }, "a card shrunk: the one under it stays down (no pulling up)");

// pushDown: the card moved where it is put, the cards it meets under it, and theirs under them.
assert.deepEqual(at(pushDown(board, card("b", 0, 1, 4, 2))), { a: "0,3 4x2", b: "0,1 4x2", c: "0,5 4x2", d: "0,7 12x1" }, "b onto the lower half of a: a under it, though it stood above, c under a, d under c");
assert.deepEqual(at(pushDown(board, card("c", 0, 0, 4, 2))), { a: "0,2 4x2", b: "4,0 4x2", c: "0,0 4x2", d: "0,5 12x1" }, "c to the top: a right under it, d left alone (no room needed)");
assert.deepEqual(at(pushDown(board, card("a", 2, 0, 4, 2))), { a: "2,0 4x2", b: "4,2 4x2", c: "0,2 4x2", d: "0,5 12x1" }, "a sideways onto b: b under it");
assert.deepEqual(at(pushDown(board, card("e", 0, 0, 12, 1))), { a: "0,1 4x2", b: "4,1 4x2", c: "0,3 4x2", d: "0,5 12x1", e: "0,0 12x1" }, "a card added at the top: those under it pushed a row, as far as they meet it");
assert.deepEqual(at(pushDown(board, card("a", 10, 0, 4, 2))).a, "8,0 4x2", "held to its row");
assert.deepEqual(moved(board, pushDown(board, card("c", 0, 0, 4, 2))).map(({ id }) => id).sort(), ["a", "c"], "moved: the cards whose cells changed");

// landing (the user's word of 2026-11-14: 最近编辑 flashed down and back while 便签 was dragged past it): where a dragged card
// lands. The home page's board of the README take: the note n (4 x 4) under r, the room at 4,4 free.
{
  assert.equal(shared(card("a", 0, 0, 4, 4), card("b", 2, 3, 4, 4)), 2, "the cells two cards share");
  assert.equal(shared(card("a", 0, 0, 4, 2), card("b", 4, 0, 4, 2)), 0, "side by side: none");
  const take = [card("a", 0, 0, 4, 2), card("b", 4, 0, 4, 2), card("c", 8, 0, 4, 4), card("d", 0, 2, 4, 2), card("e", 4, 2, 4, 2), card("r", 0, 4, 4, 4), card("n", 0, 8, 4, 4)];
  const note = { id: "n", w: 4, h: 4 };
  // The take's drag: n's top-left from 0,8 to 4,4 in twelve eased steps, each landing from the one before.
  let was = { x: 0, y: 8 };
  const path = [];
  for (let k = 1; k <= 12; k++) {
    const part = k / 12;
    const eased = part < 0.5 ? 2 * part * part : 1 - (-2 * part + 2) ** 2 / 2;
    was = landing(take, note, { x: 4 * eased, y: 8 - 4 * eased }, was);
    path.push(`${was.x},${was.y}`);
    assert.equal(at(pushDown(take, { ...note, ...was })).r, "0,4 4x4", `step ${k}: r, which n only goes past, is never pushed (n lands at ${was.x},${was.y})`);
  }
  assert.deepEqual(path, ["0,8", "0,8", "1,8", "1,8", "1,8", "1,8", "1,8", "4,5", "4,5", "4,4", "4,4", "4,4"], "on the way: the free places around it where it only clips r, else where it was going; the free place at the end");
  assert.equal(at(pushDown(take, { ...note, x: 1, y: 7 })).r, "0,11 4x4", "the nearest cells alone (the rule before) pushed r away under n at the fourth step");
  // A free place: there.
  assert.deepEqual(landing(take, note, { x: 4.2, y: 4.3 }, { x: 0, y: 8 }), { x: 4, y: 4 });
  // Put on a card: more than half of it covered, it gives way (n, under r, takes r's place and r goes down to n's: the two
  // exchange, which is where pushDown put r too); half or less only clips it.
  assert.deepEqual(landing(take, note, { x: 0.3, y: 4.2 }, { x: 0, y: 8 }), { x: 0, y: 4, swap: "r" }, "onto r's place: the lower card onto the upper one, the two exchange");
  assert.equal(at(pushDown(take, { ...note, x: 0, y: 4 })).r, "0,8 4x4", "and r gives way under it, as the drop writes");
  assert.deepEqual(at(dropped(take, { ...note, x: 0, y: 4, swap: "r" })), at(pushDown(take, { ...note, x: 0, y: 4 })), "the exchange's board the one pushDown gives: one of a size above the other ends as it did");
  assert.deepEqual(landing(take, note, { x: 1.2, y: 4 }, { x: 0, y: 8 }), { x: 0, y: 4, swap: "r" }, "three quarters of r covered: r's place, the two exchanging");
  assert.deepEqual(landing(take, note, { x: 2, y: 4 }, { x: 0, y: 8 }), { x: 0, y: 8 }, "half of r (and half of n): a clip, no free place around it, where it was going");
  assert.deepEqual(landing(take, note, { x: 2, y: 6 }, { x: 1, y: 8 }), { x: 1, y: 8 }, "a quarter of each: where it was going");
  // A small card wholly on a big one is put there (more than half of it covered), the big one giving way.
  assert.deepEqual(landing(take, { id: "s", w: 2, h: 2 }, { x: 1, y: 5 }, { x: 8, y: 8 }), { x: 1, y: 5 }, "a 2 x 2 card inside r: there");
  // A clip beside a free place: the free place, the nearest of the whole cells around the pointer's.
  assert.deepEqual(landing(take, note, { x: 4.4, y: 3.4 }, { x: 0, y: 8 }), { x: 4, y: 4 }, "half of e clipped (4,3): the free 4,4 under a cell off, e not pushed");
  assert.deepEqual(landing(take, note, { x: 0.9, y: 7.2 }, { x: 0, y: 8 }), { x: 1, y: 8 }, "r clipped by a row (1,7): the free 1,8 below");
  // Two free places as near: the top one.
  assert.deepEqual(landing([card("x", 4, 0, 4, 4)], { id: "h", w: 4, h: 2 }, { x: 0.5, y: 0.5 }, { x: 8, y: 8 }), { x: 0, y: 0 }, "0,0 and 0,1 as near: the top one");
  // Held to the row, its own place never in the way.
  assert.deepEqual(landing(take, note, { x: 10.3, y: 12 }, { x: 0, y: 8 }), { x: 8, y: 12 }, "past the row's end: held to it");
  assert.deepEqual(landing(take, note, { x: 0.2, y: 8.3 }, { x: 4, y: 4 }), { x: 0, y: 8 }, "its own place, free of the others");
  // The narrow view, the same rule on 8 columns: n past r to the room beside it, r never pushed; onto r, r gives way.
  const narrow = [card("a", 0, 0, 4, 2), card("b", 4, 0, 4, 2), card("r", 0, 2, 4, 4), card("n", 0, 6, 4, 4)];
  was = { x: 0, y: 6 };
  for (let k = 1; k <= 8; k++) {
    was = landing(narrow, note, { x: (4 * k) / 8, y: 6 - (4 * k) / 8 }, was, NARROW);
    assert.equal(at(pushDown(narrow, { ...note, ...was }, NARROW)).r, "0,2 4x4", `narrow, step ${k}: r never pushed`);
  }
  assert.deepEqual(was, { x: 4, y: 2 }, "narrow: in the room beside r");
  assert.deepEqual(landing(narrow, note, { x: 6.5, y: 2 }, { x: 0, y: 6 }, NARROW), { x: 4, y: 2 }, "narrow: held to its 8 columns");
  assert.deepEqual(landing(narrow, note, { x: 0.4, y: 2.6 }, { x: 0, y: 6 }, NARROW), { x: 0, y: 2, swap: "r" }, "narrow: onto r, three quarters of it: r's place, the two exchanging");
  // Put on a card that cannot exchange (the upper card onto the lower one, which would go up): there, the lower one pushed down.
  assert.deepEqual(landing(take, { id: "d", w: 4, h: 2 }, { x: 0.2, y: 4.6 }, { x: 0, y: 2 }), { x: 0, y: 5 }, "d onto r from above: three quarters of d over r, put there, r pushed (no exchange moves r up)");
}

// exchange and dropped (the user's word of 2026-11-19, of the home page of the README's third act: the countdown and the note
// the first row, the to-dos under them, recent edits added at the lower right, then dragged onto the to-dos, the two to change
// places). The two change sides within the cells they span; a card that cannot (a third card in the way, two put on, one to go
// up) gives way down as it did.
{
  const home = [card("count", 0, 0, 4, 2), card("note", 4, 0, 4, 2), card("todos", 0, 2, 8, 4), card("recent", 8, 2, 4, 4)];
  const recent = { id: "recent", w: 4, h: 4 };
  const todos = { id: "todos", w: 8, h: 4 };
  const exchanged = { count: "0,0 4x2", note: "4,0 4x2", todos: "4,2 8x4", recent: "0,2 4x4" };
  // The picture's drag: recent edits from 8,2 left onto the to-dos in twelve eased steps, each landing from the one before.
  let was = { x: 8, y: 2 };
  const path = [];
  for (let k = 1; k <= 12; k++) {
    const part = k / 12;
    const eased = part < 0.5 ? 2 * part * part : 1 - (-2 * part + 2) ** 2 / 2;
    was = landing(home, recent, { x: 8 - 8 * eased, y: 2.1 }, was);
    path.push(`${was.x},${was.y}${was.swap ? `~${was.swap}` : ""}`);
    const board = at(dropped(home, { ...recent, ...was }));
    assert.ok(board.todos === "0,2 8x4" || board.todos === "4,2 8x4", `step ${k}: the to-dos where they stand or exchanged, never pushed down (${board.todos})`);
    assert.deepEqual([board.count, board.note], ["0,0 4x2", "4,0 4x2"], `step ${k}: the first row untouched`);
  }
  assert.deepEqual(path, ["8,2", "8,2", "8,2", "8,2", ...Array(8).fill("0,2~todos")], "at its own place while it covers half of the to-dos or less (its nearest cells from 8 to 6), exchanged once it covers more (from 5)");
  assert.deepEqual(at(dropped(home, { ...recent, x: 0, y: 2, swap: "todos" })), exchanged, "dropped: recent edits at 0,2, the to-dos at 4,2");
  assert.deepEqual(exchange(home, "recent", "todos"), { moved: { x: 0, y: 2, w: 4, h: 4 }, other: { x: 4, y: 2, w: 8, h: 4 } }, "exchange: each to the other's side of the twelve columns they span");
  // The other way: the to-dos dragged right onto recent edits, the same board; at 2,2 they cover half of it (a clip, where they were).
  assert.deepEqual(landing(home, todos, { x: 2.4, y: 2 }, { x: 0, y: 2 }), { x: 0, y: 2 }, "the to-dos over half of recent edits: where they were");
  assert.deepEqual(landing(home, todos, { x: 2.6, y: 2 }, { x: 0, y: 2 }), { x: 4, y: 2, swap: "recent" }, "over three quarters of it: the two exchange");
  assert.deepEqual(at(dropped(home, { ...todos, x: 4, y: 2, swap: "recent" })), exchanged, "dropped: the same board");
  // The pointer going on: in the clip band the exchange it made stands (nothing put back); at its own place again, none.
  const swapped = { x: 0, y: 2, swap: "todos" };
  assert.deepEqual(landing(home, recent, { x: 6.4, y: 2 }, swapped), swapped, "recent edits back over half of the to-dos: the exchange kept, nothing goes back on the way");
  assert.deepEqual(landing(home, recent, { x: 7.6, y: 2 }, swapped), { x: 8, y: 2 }, "back at its own place: no exchange, the to-dos back too");
  assert.deepEqual(landing(home, recent, { x: 8.4, y: 0.4 }, swapped), { x: 8, y: 0 }, "on to the free place above: no exchange");
  // The narrow view, its own cells: the same exchange on 8 columns.
  const narrowHome = [card("count", 0, 0, 4, 2), card("note", 4, 0, 4, 2), card("todos", 0, 2, 4, 4), card("recent", 4, 2, 4, 4)];
  assert.deepEqual(landing(narrowHome, recent, { x: 0.6, y: 2.2 }, { x: 4, y: 2 }, NARROW), { x: 0, y: 2, swap: "todos" }, "narrow: recent edits onto the to-dos beside it");
  assert.deepEqual(at(dropped(narrowHome, { ...recent, x: 0, y: 2, swap: "todos" }, NARROW)), { count: "0,0 4x2", note: "4,0 4x2", todos: "4,2 4x4", recent: "0,2 4x4" }, "narrow: the two exchanged in its 8 columns");

  // Cards of one size one above the other: the lower onto the upper, the two exchange, the board pushDown gives (as it was); the
  // upper onto the lower, the lower would go up: no exchange, pushed down under it, the room left above.
  const pair = [card("a", 0, 0, 4, 2), card("b", 0, 2, 4, 2)];
  assert.deepEqual(landing(pair, { id: "b", w: 4, h: 2 }, { x: 0, y: 0.2 }, { x: 0, y: 2 }), { x: 0, y: 0, swap: "a" }, "b up onto a: exchanged");
  assert.deepEqual(at(dropped(pair, { id: "b", x: 0, y: 0, w: 4, h: 2, swap: "a" })), at(pushDown(pair, card("b", 0, 0, 4, 2))), "and the board as pushDown had it: b 0,0, a 0,2");
  assert.deepEqual(landing(pair, { id: "a", w: 4, h: 2 }, { x: 0, y: 1.8 }, { x: 0, y: 0 }), { x: 0, y: 2 }, "a down onto b: no exchange");
  assert.deepEqual(at(dropped(pair, { id: "a", x: 0, y: 2, w: 4, h: 2 })), { a: "0,2 4x2", b: "0,4 4x2" }, "b pushed under a, the room a left left (as it was)");
  assert.equal(exchange(pair, "a", "b"), null, "exchange: none that moves the other up");

  // Side by side of other widths: packed as they stood, whichever is held, at the board's right edge too.
  const sides = [card("s", 0, 0, 4, 2), card("w", 4, 0, 8, 2)];
  assert.deepEqual(exchange(sides, "s", "w"), { moved: { x: 8, y: 0, w: 4, h: 2 }, other: { x: 0, y: 0, w: 8, h: 2 } }, "a 4 wide card and an 8 wide one at the row's end: each to the other's side");
  assert.deepEqual(landing(sides, { id: "s", w: 4, h: 2 }, { x: 6.2, y: 0 }, { x: 0, y: 0 }), { x: 8, y: 0, swap: "w" }, "s held over w: it lands at the row's end, w at the start");
  assert.deepEqual(exchange([card("s", 0, 0, 2, 2), card("w", 6, 0, 4, 2)], "s", "w"), { moved: { x: 8, y: 0, w: 2, h: 2 }, other: { x: 0, y: 0, w: 4, h: 2 } }, "the room between them kept: s ends where w ended, w starts where s started");
  // Heights of their own, side by side: each on its own rows; one above the other: each in its own columns.
  assert.deepEqual(exchange([card("t", 0, 0, 4, 4), card("u", 4, 2, 4, 2)], "u", "t"), { moved: { x: 0, y: 2, w: 4, h: 2 }, other: { x: 4, y: 0, w: 4, h: 4 } }, "side by side, of other heights: each on its own rows");
  assert.deepEqual(exchange([card("up", 0, 0, 8, 2), card("lo", 2, 2, 4, 3)], "lo", "up"), { moved: { x: 2, y: 0, w: 4, h: 3 }, other: { x: 0, y: 3, w: 8, h: 2 } }, "one above the other: the lower at the top, the upper ending where it ended, each in its columns");
  // Each on its own rows not clean: both on the lower of their top rows. The README's home as the library adds recent edits to
  // it (the countdown and the note 4 wide each, as their blocks' sizes go: the first free 4 x 4 spot is the first row's end, rows
  // 0 to 4): recent edits at 0,0 would meet the countdown, so both go to row 2, the board of the picture, whichever is held.
  const added = [card("count", 0, 0, 4, 2), card("note", 4, 0, 4, 2), card("todos", 0, 2, 8, 4)];
  assert.deepEqual(freeSpot(added, { w: 4, h: 4 }), { x: 8, y: 0 }, "the library puts recent edits at the first row's end");
  const high = [...added, card("recent", 8, 0, 4, 4)];
  assert.deepEqual(exchange(high, "recent", "todos"), { moved: { x: 0, y: 2, w: 4, h: 4 }, other: { x: 4, y: 2, w: 8, h: 4 } }, "recent edits from the first row's end onto the to-dos: both on row 2");
  assert.deepEqual(exchange(high, "todos", "recent"), { moved: { x: 4, y: 2, w: 8, h: 4 }, other: { x: 0, y: 2, w: 4, h: 4 } }, "the to-dos onto recent edits: the same board, recent edits going down to row 2");
  assert.deepEqual(landing(high, recent, { x: 5.4, y: 2.2 }, { x: 8, y: 0 }), { x: 0, y: 2, swap: "todos" }, "dragged down and left onto the to-dos: the exchange");
  assert.deepEqual(at(dropped(high, { ...recent, x: 0, y: 2, swap: "todos" })), exchanged, "dropped: the picture's board");
  assert.deepEqual(landing(high, recent, { x: 5.4, y: 0.2 }, { x: 8, y: 0 }), { x: 5, y: 0 }, "straight left onto the note, which cannot exchange (recent edits there would meet the to-dos): put there, the cards met pushed down");
  // One above the other, each in its own columns not clean (a card where the lower one would go up): both in the further right
  // of their first columns.
  assert.deepEqual(exchange([card("c", 0, 0, 2, 2), card("up", 2, 0, 4, 2), card("lo", 0, 4, 4, 2)], "lo", "up"), { moved: { x: 2, y: 0, w: 4, h: 2 }, other: { x: 2, y: 4, w: 4, h: 2 } }, "lo at 0,0 would meet c: both at column 2");
  // Apart on both axes: each at the other's corner, held to the board.
  assert.deepEqual(exchange([card("p", 8, 0, 4, 2), card("q", 0, 4, 8, 2)], "q", "p"), { moved: { x: 4, y: 0, w: 8, h: 2 }, other: { x: 0, y: 4, w: 4, h: 2 } }, "apart on both axes: q at p's corner held to the row, p at q's");
  assert.equal(exchange([card("p", 0, 0, 4, 2), card("q", 8, 4, 4, 2)], "p", "q"), null, "the upper apart on both axes onto the lower: it would go up, none");

  // Where the exchange is not clean, as before: a third card where one would go; two cards put on; a card of the board's not
  // there; the cells the drop asks not where the exchange puts it (the board changed meanwhile).
  const crowded = [card("t", 0, 0, 4, 4), card("h", 4, 0, 4, 2), card("z", 4, 2, 4, 2)];
  assert.equal(exchange(crowded, "h", "t"), null, "t (4 high) would go to h's side, where z stands: none");
  assert.deepEqual(landing(crowded, { id: "h", w: 4, h: 2 }, { x: 0.3, y: 0.2 }, { x: 4, y: 0 }), { x: 0, y: 0 }, "h onto t: put there");
  assert.deepEqual(at(dropped(crowded, { id: "h", x: 0, y: 0, w: 4, h: 2, swap: "t" })), { t: "0,2 4x4", h: "0,0 4x2", z: "4,2 4x2" }, "a swap that is no longer clean: pushed down as a place of none");
  const two = [card("l", 0, 0, 4, 2), card("m", 4, 0, 4, 2), card("wide", 0, 2, 8, 2)];
  assert.deepEqual(landing(two, { id: "wide", w: 8, h: 2 }, { x: 0.2, y: 0.1 }, { x: 0, y: 2 }), { x: 0, y: 0 }, "an 8 wide card over two: no exchange");
  assert.deepEqual(at(dropped(two, { id: "wide", x: 0, y: 0, w: 8, h: 2 })), { l: "0,2 4x2", m: "4,2 4x2", wide: "0,0 8x2" }, "both pushed under it");
  assert.deepEqual(landing([card("x", 4, 0, 4, 4)], { id: "new", w: 4, h: 4 }, { x: 4.2, y: 0.2 }, { x: 0, y: 8 }), { x: 4, y: 0 }, "a card not on the board (one added): no exchange");
  assert.equal(exchange([card("one", 0, 0, 4, 2)], "one", "one"), null, "a page of one card: none");
  assert.deepEqual(at(dropped(home, { ...recent, x: 1, y: 2, swap: "todos" })), at(pushDown(home, { ...recent, x: 1, y: 2 })), "the drop's cells not the exchange's: pushDown, as asked");
  assert.deepEqual(at(dropped(home, { ...recent, x: 0, y: 2, swap: "gone" })), at(pushDown(home, { ...recent, x: 0, y: 2 })), "a swap with a card no longer there: pushDown");
  // A file whose cards share cells (an Agent's hand): two that share one never exchange; a third pair that does is settled by the
  // drop as pushDown settles it, the lower under the upper, nothing left shared.
  assert.equal(exchange([card("a", 0, 0, 4, 2), card("b", 2, 1, 4, 2)], "a", "b"), null, "the held card and the one met share a cell: none");
  const sharing = [card("a", 0, 0, 4, 2), card("b", 4, 0, 4, 2), card("c", 8, 0, 4, 2), card("d", 8, 1, 4, 2)];
  assert.deepEqual(at(dropped(sharing, { id: "a", x: 4, y: 0, w: 4, h: 2, swap: "b" })), { a: "4,0 4x2", b: "0,0 4x2", c: "8,0 4x2", d: "8,2 4x2" }, "a and b exchanged, d settled under c");
  assert.equal(exchange([card("a", 0, 0, 4, 2), card("b", 4, 0, 4, 2), card("e", 3, 1, 2, 2)], "a", "b"), null, "a third card sharing cells with either where the other goes: none");
  // A place asked by its cells (gallery page card --move, 大小 ›, an add, an undo) never exchanges: pushDown, as it was.
  assert.deepEqual(at(pushDown(home, { ...recent, x: 0, y: 2 })), { count: "0,0 4x2", note: "4,0 4x2", todos: "0,6 8x4", recent: "0,2 4x4" }, "pushDown: the to-dos under recent edits");
  // None of it moves a card up, nor leaves two sharing a cell.
  for (const board of [dropped(home, { ...recent, x: 0, y: 2, swap: "todos" }), dropped(pair, { id: "b", x: 0, y: 0, w: 4, h: 2, swap: "a" }), dropped(sides, { id: "s", x: 8, y: 0, w: 4, h: 2, swap: "w" })]) {
    assert.ok(board.every((one, index) => board.every((other, place) => place === index || !overlaps(one, other))), `no two share a cell: ${JSON.stringify(board)}`);
  }
}

// freeSpot: the topmost row it fits in, there the leftmost column.
assert.deepEqual(freeSpot(board, { w: 4, h: 2 }), { x: 8, y: 0 });
assert.deepEqual(freeSpot(board, { w: 6, h: 2 }), { x: 4, y: 2 }, "6 wide: under b, beside c");
assert.deepEqual(freeSpot(board, { w: 12, h: 1 }), { x: 0, y: 4 });
assert.deepEqual(freeSpot([], { w: 4, h: 2 }), { x: 0, y: 0 }, "an empty board: its top left");
assert.deepEqual(freeSpot([card("a", 0, 0, 12, 3)], { w: 4, h: 2 }), { x: 0, y: 3 }, "a full row: under it");

// Sizes: the manifest's first size, else its w and h (h null: measured), else 4 x 2.
assert.deepEqual(defaultSize({ sizes: [[2, 2], [4, 2]] }), { w: 2, h: 2, measured: false });
assert.deepEqual(defaultSize({ sizes: null, w: 6, h: 3 }), { w: 6, h: 3, measured: false });
assert.deepEqual(defaultSize({ sizes: null, w: 4, h: null }), { w: 4, h: 2, measured: true }, "no h: its content's, 2 until measured");
assert.deepEqual(defaultSize(null), { w: 4, h: 2, measured: true });
assert.deepEqual(nearestSize([[2, 2], [4, 2], [4, 4]], { w: 5, h: 3 }), { w: 4, h: 2 }, "the nearest corner, the first of two as near");
assert.deepEqual(sizeFor({ sizes: [[2, 2], [4, 2], [4, 4]] }, { w: 4, h: 5 }), { w: 4, h: 4 });
assert.deepEqual(sizeFor({ sizes: null, min: { w: 2, h: 2 }, max: { w: 6, h: 4 } }, { w: 9, h: 1 }), { w: 6, h: 2 }, "held to min and max");
assert.deepEqual(sizeFor({ sizes: null, min: { w: 1, h: 1 }, max: { w: 12, h: 24 } }, { w: 9, h: 3 }, 6), { w: 6, h: 3 }, "never past the room left on the row");

// The grid's cells and pixels: n cells and their gaps; a height of fit content; a pointer's cell.
assert.equal(spanOf(4, 100), 4 * 100 + 3 * GAP);
assert.equal(fitHeight(spanOf(2, 100), 100), 2, "exactly two cells' height: 2");
assert.equal(fitHeight(spanOf(2, 100) + 1, 100), 3, "a pixel more: 3");
assert.equal(fitHeight(10, 100), 1, "at least 1");
assert.equal(fitHeight(100_000, 100), GRID.rows, "at most 24");
assert.equal(cellAt(3 * (100 + GAP) - 40, 100), 3, "the nearest cell");
assert.equal(cellAt(0, 0), 0);

// The cell fixed (the user, 2026-11-09): 64px whatever the room, twelve of them 944px, the wide view. A room that holds 8
// but not 12 shows the narrow view (the user, 2026-11-13): NARROW (8) columns of 64px. One that holds fewer (a phone's) as
// many as it holds, 4 at the least, and only a room under 4 of them has smaller ones.
const wide = { columns: 12, cell: 64, width: 944, view: "wide" };
assert.deepEqual([CELL, NARROW, LEAST, spanOf(GRID.columns, CELL), spanOf(NARROW, CELL)], [64, 8, 4, 944, 624]);
assert.deepEqual([gridFor(1600), gridFor(944), gridFor(947)], [wide, wide, wide], "twelve of 64px however wide the room");
assert.deepEqual([943, 864, 712, 624].map((room) => gridFor(room)), Array(4).fill({ columns: 8, cell: 64, width: 624, view: "narrow" }), "a room for 8 to 11: the narrow view, 8 of 64px");
assert.deepEqual([623, 552, 342, 304].map((room) => [gridFor(room).columns, gridFor(room).cell, gridFor(room).view]), [[7, 64, "tiny"], [7, 64, "tiny"], [4, 64, "tiny"], [4, 64, "tiny"]], "a phone's room: the whole columns it holds");
assert.deepEqual(gridFor(272), { columns: 4, cell: 56, width: 272, view: "tiny" }, "under 4 of them: 4 smaller ones, as wide as the room");
assert.deepEqual(gridFor(0), { columns: 4, cell: 0, width: 48, view: "tiny" }, "no room: nothing negative");

// flow: a board drawn in fewer columns, its cards one after another in the order of their places, each as large as it is (no wider
// than the row), at the first spot at or after where the one before ends, sharing no cell; never written.
const home = [card("c1", 0, 0, 4, 2), card("c2", 4, 0, 4, 2), card("c3", 8, 0, 4, 4), card("c4", 0, 2, 4, 4), card("c5", 4, 2, 4, 2), card("c6", 4, 4, 8, 2)];
assert.deepEqual(at(flow(home, 8)), { c1: "0,0 4x2", c2: "4,0 4x2", c3: "0,2 4x4", c4: "4,2 4x4", c5: "0,6 4x2", c6: "0,8 8x2" }, "8 columns: two of 4 to a row, in order; c6 under c5, a room left beside c5 (none goes back)");
assert.deepEqual(at(flow(home, 4)), { c1: "0,0 4x2", c2: "0,2 4x2", c3: "0,4 4x4", c4: "0,8 4x4", c5: "0,12 4x2", c6: "0,14 4x2" }, "4 columns: one after another, c6 held to 4");
assert.deepEqual(flow(home, 8).map(({ id }) => id), home.map(({ id }) => id), "in the order given");
assert.deepEqual(at(flow([card("b", 4, 0, 2, 2), card("a", 0, 0, 2, 2), card("c", 0, 3, 3, 1)], 5)), { b: "2,0 2x2", a: "0,0 2x2", c: "0,2 3x1" }, "by place, not by the order given: a first, b after it, c on the next row");
assert.deepEqual(at(flow([card("a", 0, 0, 2, 3), card("b", 2, 0, 3, 1), card("c", 5, 0, 2, 1)], 5)), { a: "0,0 2x3", b: "2,0 3x1", c: "2,1 2x1" }, "beside a tall card: the next row's first free spot after it");
assert.deepEqual(flow(home, 12).map(({ x, y, w, h }) => [x, y, w, h]), home.map(({ x, y, w, h }) => [x, y, w, h]).slice(0, 2).concat([[8, 0, 4, 4], [0, 2, 4, 4], [4, 2, 4, 2], [4, 4, 8, 2]]), "twelve columns: a board read row by row stays as it is");
assert.deepEqual(home, [card("c1", 0, 0, 4, 2), card("c2", 4, 0, 4, 2), card("c3", 8, 0, 4, 4), card("c4", 0, 2, 4, 4), card("c5", 4, 2, 4, 2), card("c6", 4, 4, 8, 2)], "the cards given untouched");

// narrowPlaces (the user, 2026-11-13): a board's narrow view. None of its cards with a narrow place: the flow of the wide
// places in 8 columns. Some: each at its own (held to 8 columns, none sharing a cell), every other at the first free spot by
// its size (no wider than 8), in the order of its wide place: a card added in the wide view is on the narrow one too.
{
  const of = (cards, narrow = {}) => cards.map((one) => ({ ...one, narrow: narrow[one.id] ? Object.fromEntries(["x", "y", "w", "h"].map((axis, index) => [axis, narrow[one.id][index]])) : null }));
  assert.deepEqual(at(narrowPlaces(of(home))), at(flow(home, NARROW)), "none arranged: the wide places flowed into 8 columns");
  const own = { c1: [4, 0, 4, 2], c2: [0, 0, 4, 2], c3: [0, 2, 8, 2], c4: [0, 4, 4, 4], c5: [4, 4, 4, 2], c6: [0, 8, 8, 2] };
  assert.deepEqual(at(narrowPlaces(of(home, own))), { c1: "4,0 4x2", c2: "0,0 4x2", c3: "0,2 8x2", c4: "0,4 4x4", c5: "4,4 4x2", c6: "0,8 8x2" }, "all arranged: each at its own");
  const added = [...home, card("c7", 0, 6, 4, 2)];
  assert.deepEqual(at(narrowPlaces(of(added, own))).c7, "4,6 4x2", "one with none (added in the wide view): the first free spot, the room beside c4");
  assert.deepEqual(at(narrowPlaces(of([...added, card("c8", 0, 7, 12, 1)], own))).c8, "0,10 8x1", "a card 12 wide held to 8, under the others");
  const clash = { a: [0, 0, 4, 2], b: [2, 1, 4, 2] };
  assert.deepEqual(at(narrowPlaces(of([card("a", 0, 0, 4, 2), card("b", 4, 0, 4, 2)], clash))), { a: "0,0 4x2", b: "2,2 4x2" }, "two written to share a cell: the later one pushed down");
  assert.deepEqual(at(narrowPlaces(of([card("a", 0, 0, 4, 2)], { a: [6, 0, 12, 2] }))), { a: "0,0 8x2" }, "a narrow place past the view held to its 8 columns");
  assert.deepEqual(narrowPlaces(of(added, own)).map(({ id }) => id), added.map(({ id }) => id), "in the order given");
}

console.log("Checked the board's placement rules: the narrow view's places (narrowPlaces), cards that share a cell, held to the board, settled (nothing shared stays, one drawn higher pushes those under it down, never up), pushed down under a card moved, added or resized, where a dragged card lands (landing: a card it only clips on its way never pushed, one it covers more than half of giving way, a free place around it taken, both views), two cards exchanged where a drag puts one on the other and that is clean (exchange, dropped: the README's to-dos and recent edits both ways, other widths packed, other heights, one above the other as before, a third card, two put on, one to go up, a drop no longer clean pushed down), the first free spot, a block's default size, its sizes and its min and max, the cells and pixels of the board's grid, the fixed cell and the columns a room holds, and a narrow board's flow.");
