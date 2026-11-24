import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { along, beforeIndex, gapOf, placeAmong, placeInRow, without } from "../../src/shared/drag-place.mjs";

// Where a thing dragged among others in a row lands (src/shared/drag-place.mjs): by the thing itself, the place
// nearest to where it stands, a neighbour giving way as the dragged one's leading edge passes its middle (half a gap
// before it), whatever their widths; as it was taken up it stays; a row it is not in (another column of a board) by
// the same rule; a place as the one it goes before.

const row = (...widths) => {
  let at = 0;
  return widths.map((width) => {
    const box = { start: at, end: at + width };
    at += width + 12;
    return box;
  });
};
const moved = (box, by) => ({ start: box.start + by, end: box.end + by });

// Three board columns 264 wide, 12 apart (a board's): the first dragged right.
{
  const boxes = row(264, 264, 264);
  assert.equal(gapOf(boxes, 0), 12);
  assert.equal(placeInRow(boxes, 0, boxes[0]), 0, "where it was taken up: its own place");
  // Its right edge at the next one's middle less half the gap (276 + 132 − 6 = 402): 138 to the right.
  assert.equal(placeInRow(boxes, 0, moved(boxes[0], 137)), 0, "its leading edge short of the next one's middle: it stays");
  assert.equal(placeInRow(boxes, 0, moved(boxes[0], 139)), 1, "past it: the next gives way, with the pointer far from that one's middle");
  assert.equal(placeInRow(boxes, 0, moved(boxes[0], 139 + 276)), 2, "past the third's middle: after it");
  // The last dragged left: its left edge past the middle of the one before it.
  assert.equal(placeInRow(boxes, 2, moved(boxes[2], -137)), 2);
  assert.equal(placeInRow(boxes, 2, moved(boxes[2], -139)), 1);
  assert.equal(placeInRow(boxes, 2, moved(boxes[2], -139 - 276)), 0);
  // Back again by the same edge: no stickiness either way.
  assert.equal(placeInRow(boxes, 0, moved(boxes[0], 138.5)), 1);
  assert.equal(placeInRow(boxes, 0, moved(boxes[0], 137.5)), 0);
}

// Tabs of different widths: a wide one past a narrow one once it covers half of it; a narrow one onto a wide one
// only once its edge is past that one's middle.
{
  const boxes = row(300, 50);
  assert.equal(placeInRow(boxes, 0, moved(boxes[0], 30)), 0, "the wide one 30 on: short of the narrow one's middle less half the gap (12 + 25 − 6)");
  assert.equal(placeInRow(boxes, 0, moved(boxes[0], 32)), 1, "past it: the narrow one gives way");
  const back = row(50, 300);
  assert.equal(placeInRow(back, 0, moved(back[0], 155)), 0, "the narrow one 155 on: short of the wide one's middle (12 + 150 − 6)");
  assert.equal(placeInRow(back, 0, moved(back[0], 157)), 1, "past it: the wide one gives way");
}

// Others it is not among (a column of a board it is dragged into): the place whose box it would take is nearest.
{
  const cards = [{ start: 0, end: 80 }, { start: 88, end: 168 }];
  assert.equal(placeAmong([], { start: 500, end: 580 }, 8), 0, "an empty column: its only place");
  assert.equal(placeAmong(cards, { start: -30, end: 50 }, 8), 0, "above the first: first");
  assert.equal(placeAmong(cards, { start: 30, end: 110 }, 8), 0, "its top short of the first one's middle and half a gap: before it");
  assert.equal(placeAmong(cards, { start: 46, end: 126 }, 8), 1, "past it: after it");
  assert.equal(placeAmong(cards, { start: 200, end: 280 }, 8), 2, "below the last: last");
  // Its own column the same: the others as they stand without it.
  const column = [{ start: 0, end: 80 }, { start: 88, end: 168 }, { start: 176, end: 256 }];
  assert.deepEqual(without(column, 0, 8), [{ start: 0, end: 80 }, { start: 88, end: 168 }]);
  assert.deepEqual(without(column, 1, 8), [{ start: 0, end: 80 }, { start: 88, end: 168 }]);
  assert.equal(placeAmong(without(column, 1, 8), column[1], 8), 1, "taken out and standing where it was: its place");
}

// A DOMRect along an axis, and a place as the one it goes before.
assert.deepEqual(along({ left: 1, right: 5, top: 2, bottom: 9 }, "x"), { start: 1, end: 5 });
assert.deepEqual(along({ left: 1, right: 5, top: 2, bottom: 9 }, "y"), { start: 2, end: 9 });
assert.equal(beforeIndex(2, 0), 0);
assert.equal(beforeIndex(2, 2), 2);
assert.equal(beforeIndex(0, 1), 2);
assert.equal(gapOf([{ start: 0, end: 10 }], 0), 0, "one alone: no gap");

console.log("drag-place: ok");
