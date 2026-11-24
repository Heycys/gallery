// Where a thing dragged among others in a row (a database's view tabs and board columns, the cards of a board's
// column, a table's rows and columns, a 选项卡 block's tabs) lands: the place, of those it can take, that is
// nearest to where it stands now. It is measured by the thing dragged itself, never by the pointer, so that a
// wide one held by its edge does not cover most of its neighbour before the neighbour moves. Seen from the
// neighbour, it gives way as soon as the dragged one's leading edge passes its middle (half a gap before it),
// whatever their widths: a wide column takes the place of a narrow one once it covers half of it, a narrow tab
// that of a wide one once it is past that one's middle. Pure: what the page draws and drops goes by it, and
// tests/unit/drag-place.mjs holds it.

/** A box along an axis ("x" or "y") of a DOMRect: `{ start, end }`. */
export const along = (rect, axis) => (axis === "x" ? { start: rect.left, end: rect.right } : { start: rect.top, end: rect.bottom });

/** The room between the one at `from` of `boxes` and the one after it (before it where it is the last), 0 for one alone. */
export function gapOf(boxes, from) {
  const own = boxes[from];
  const next = boxes[from + 1];
  const previous = boxes[from - 1];
  const gap = next ? next.start - own.end : previous ? own.start - previous.end : 0;
  return Math.max(0, gap);
}

/** The others of `boxes` as they would stand with the one at `from` taken out: those after it closer by its size and `gap`. */
export function without(boxes, from, gap = gapOf(boxes, from)) {
  const own = boxes[from];
  const step = own.end - own.start + gap;
  return boxes.flatMap((box, index) => (index === from ? [] : index > from ? [{ start: box.start - step, end: box.end - step }] : [box]));
}

/**
 * The place (0 to `others.length`) a thing dragged takes among `others` (their boxes in order, as they stand
 * without it, `gap` apart), standing at `at` (`{ start, end }`, its box now): the one where the box it would take
 * is nearest to `at`. Of two as near, the first.
 */
export function placeAmong(others, at, gap = 0) {
  if (others.length === 0) return 0;
  const size = at.end - at.start;
  const middle = (at.start + at.end) / 2;
  let best = 0;
  let distance = Infinity;
  for (let place = 0; place <= others.length; place++) {
    const start = place === 0 ? others[0].start : others[place - 1].end + gap;
    const away = Math.abs(start + size / 2 - middle);
    if (away < distance) {
      distance = away;
      best = place;
    }
  }
  return best;
}

/**
 * The place in the new order of the one at `from` of `boxes` (all of its row, as they stood as it was taken up),
 * dragged to stand at `at`: `from` where it stays.
 */
export function placeInRow(boxes, from, at) {
  const gap = gapOf(boxes, from);
  return placeAmong(without(boxes, from, gap), at, gap);
}

/** A place in the new order (`placeInRow`) as one in the order before the move, as `splice`-like moves take it: the one it goes before. */
export const beforeIndex = (from, place) => (place <= from ? place : place + 1);
