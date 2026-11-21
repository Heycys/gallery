// Where dragged blocks go (docs/editor.md, "Moving blocks"): a pure function of the tree
// geometry.mjs measure() reads (no DOM is read here: an empty box's place is its `content` rect), so
// the rules are tested without a browser (tests/unit/geometry.mjs).
// Geometry proposes, the page's structure (boxes, units) decides the level, and accepts() decides
// what may go where (`takes`, from drag/index.mjs); nothing here changes the page. The tree's shape
// is described in geometry.mjs.

import { MAX_COLUMNS } from "../../components/columns/index.mjs";
import { BLOCK_TYPES, firstBlockOf, isLead } from "../../components/registry.mjs";
import { ADD, HANDLE } from "../handle-sizes.mjs";

const STEP = 12; // past edges that coincide, each step this far out leaves one more container
const NEAR = 3 * STEP; // how far past its edge a container left behind still counts
const SAME = 4; // edges this close are one edge
const NEST = 24; // list items a step right of the item above go under it
const LEAVE = 20; // and leave a list only past its markers, this far left of where its items start
// Beside a block (分栏): the right third of a block and right of it (no further than REACH), or
// left of it, a band REACH out from the block, starting past all of its handle (OUT: the grip and
// the "+" column left of it), not at the grip's edge; a framed Sheet panel's blocks, set in from
// the page by its padding, take that start from the page's left edge, the handle of a page block going by there. In a row of columns: within SIDE of the
// last column's right edge and past it, left of the first by the same band, or left of the
// handle of a column past the first (BETWEEN wide, OUT from that column; the gap, narrower than the
// handle standing in it, leaves the band only the end of the column before). Over a block's text and
// down the handles, whichever way a hand drifts on a drag that goes up or down, a drop goes between
// blocks as ever. Where the band would fall off the window, its start stays in it, as far from where
// the grip then stands as SLACK (FIRST).
const REACH = 200; // the farthest from a block a drop still goes beside it
const OUT = HANDLE.gap + HANDLE.width + ADD.width; // where the band left of a block starts, from its left edge
const SLACK = 16; // the least between the grip's left edge and that start
const FIRST = ADD.edge + ADD.width - SLACK; // the same from the window's left edge, the grip kept in from it there (handle/)
const SIDE = 16; // near a column's edge
const BETWEEN = 2 * SIDE; // how wide the band for a new column between two is, as wide as within SIDE of an edge either way

// How many of a box's units come before its places: its lead (a highlight block's icon, a flowchart
// node's) is its own, no block to fall between, so a place before it is the place after it; so is a
// node's first line, its title (`firstBlock`): nothing lands before it, a place there is the place after it.
const headOf = (box, units) => {
  const lead = isLead(box.kind, units[0]?.kind) ? 1 : 0;
  const first = firstBlockOf(box.kind);
  return lead + (first && units[lead]?.kind === BLOCK_TYPES[first]?.kind ? 1 : 0);
};

// Where a list's items start (their text; the markers stand left of it).
const itemsLeft = (list) => Math.min(list.rect.left + NEST, ...list.children.filter((child) => child.type === "unit").map((item) => item.start));

// In a box whose rows wrap (geometry.mjs sideBySide: a flowchart's nodes), a block alone in its row
// (no other of `rects` at its height: a node holding a picture, a node of a 纵向 flowchart) is one of
// a column there: the places before and after it are above and below it, by its middle height, the
// line across it. In a row of several, the places go across, by their middles, as in any row.
const alone = (box, rects, rect) => box.row === "wrap" && !rects.some((other) => other !== rect && Math.abs(other.top - rect.top) < SAME);

const isRow = (node) => node.kind === "columns";

// The x a point at (x, y) counts at: over the handle of a column's blocks (OUT left of a column past
// the first), at that column's left edge, as one left of the page counts at the page's, so that a drag
// by that handle that goes up or down stays among that column's blocks.
function overHandle(node, x, y) {
  const next = node.children.find(({ rect }) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom);
  if (!next) return x;
  const column = isRow(next) ? next.children.find(({ rect }) => x < rect.left && x >= rect.left - OUT) : null;
  return overHandle(column ?? next, column ? column.rect.left + 1 : x, y);
}

/**
 * Where dragged blocks go with the pointer at (x, y) (page coordinates; beside the page counts as
 * the page), or null where nothing takes them (over a Sheet's tab row, anything but its own tabs):
 * { box, slot, nest, same, line, halo }. `box` takes them before its `slot`-th block (dragged ones
 * not counted), or, with `nest`, at the end of that list item's lists; `same`: that is where they
 * are already; `line`: where to show the place, `halo`: the container to tint (none for the page
 * itself), both { left, top, right, bottom } in page coordinates.
 *
 * The box is the innermost one around the point that takes the blocks (`takes(box)`), the place in
 * it between two of its blocks by their middles (in a row: by rows, then across). How deep a drop
 * goes follows each container's own layout. Containers with edges (sections, panels, disclosures,
 * Sheet panels) go by those edges: inside one, its places; past its edge, the container around it.
 * Where edges coincide (the last section of a Sheet panel ends where the panel does), each further
 * STEP past them leaves one more container, so every one of those places can be reached; the
 * innermost one is reached from inside. Lists go by indentation, as their items show it: at a
 * list's end, left of its markers (LEAVE past where its items start) the blocks leave it for the list around it (after the
 * item holding it), and a step right of the item above they go under that item (`items`: every
 * block dragged is a list item). Blocks of other kinds (a paragraph, an image…, which an item holds
 * as blocks of its own) go under an item too: among the blocks it holds, below its own line, or a step
 * right of the item above the place (over a list, or right after one: the deepest item so reached),
 * at the end of what it holds. `dragged(unit)`: a unit being dragged (`count` of them), which
 * nothing goes into.
 *
 * With `aside(unit)` (the blocks may go into a column; whether a unit may: asideOf), beside a block they go beside it, the
 * two side by side in a new row of columns, and at a column's edge into a new column there:
 * { aside: { target, side } } or { aside: { row, index, whole } } (`whole`: the dragged blocks are
 * all of one column of that row, which then moves instead). `edge`: the window's left edge, in page
 * coordinates, which the band left of a block keeps some of.
 */
export function resolveDrop(tree, x, y, { takes, dragged = () => false, count = 1, items = false, aside = false, edge = -Infinity }) {
  const px = overHandle(tree, Math.min(Math.max(x, tree.rect.left + 1), tree.rect.right - 1), y);
  const holds = (rect, at = px) => at >= rect.left && at <= rect.right && y >= rect.top && y <= rect.bottom;
  const units = (box) => box.children.filter((child) => child.type === "unit" && !dragged(child));
  // An item's box for what it holds ("nest") takes list items through its lists only; other blocks
  // go into it among the blocks it holds, below the item's own line.
  const open = (node) => node.type === "box" && takes(node) && (node.kind !== "nest" || (!items && units(node).length > 0 && y >= units(node)[0].rect.top - SAME));
  const placeIn = (box) => {
    const here = units(box);
    const rects = here.map((unit) => unit.rect);
    const slot = here.findIndex(({ rect }) => (box.row
      ? y < rect.top || (y <= rect.bottom && (alone(box, rects, rect) ? y < (rect.top + rect.bottom) / 2 : px < (rect.left + rect.right) / 2))
      : y < (rect.top + rect.bottom) / 2));
    return Math.max(headOf(box, here), slot < 0 ? here.length : slot);
  };

  // The boxes and units around the point, from the page down, never into a dragged block. `flush`: a
  // point left of the blocks of a detail card or a Sheet panel counts as at their left edge, as one left
  // of the page's does: the padding between leaves them no less at that side.
  const around = (flush) => {
    const nodes = [tree];
    let at = flush ? Math.max(px, tree.content.left + 1) : px;
    for (let node = tree, next; (next = node.children.find((child) => holds(child.rect, at) && !(child.type === "unit" && dragged(child)))); node = next) {
      nodes.push(next);
      if (flush && next.type === "box" && next.role === "root") at = Math.max(at, next.content.left + 1);
    }
    return nodes;
  };
  const path = around(false);
  if (path.some((node) => node.type === "box" && node.role === "tabs" && !takes(node))) return null; // resting there switches Sheets
  if (aside) {
    const beside = asideOf(around(true), x, dragged, count, aside, edge);
    if (beside) return beside;
  }
  let box = path.findLast(open) ?? null;
  let slot = box ? placeIn(box) : 0;

  // Edges just passed: the containers that take the blocks inside the blocks either side of the
  // place and end (above it) or start (below it) flush with that block, when the point has left
  // that edge by at most NEAR.
  const outer = box ?? path.findLast((node) => node.type === "box");
  const near = units(outer);
  const at = box ? slot : placeIn(outer);
  const passed = [];
  const collect = (unit, side) => {
    const flush = unit && (side === "bottom" ? unit.rect.bottom : unit.rect.top);
    const visit = (node, depth) => {
      for (const inner of node.children) {
        if (inner.type === "unit") {
          if (!dragged(inner)) visit(inner, depth);
          continue;
        }
        const edge = side === "bottom" ? inner.rect.bottom : inner.rect.top;
        const past = side === "bottom" ? y - edge : edge - y;
        if (open(inner) && Math.abs(edge - flush) <= SAME && px >= inner.rect.left && px <= inner.rect.right && past > 0 && past <= NEAR) passed.push({ box: inner, edge, side, depth });
        visit(inner, depth + 1);
      }
    };
    if (unit) visit(unit, 0);
  };
  collect(near[at - 1], "bottom");
  collect(near[at], "top");
  if (passed.length > 0) {
    const nearest = passed.reduce((best, entry) => (Math.abs(y - entry.edge) < Math.abs(y - best.edge) ? entry : best));
    const stack = passed.filter((entry) => entry.side === nearest.side && Math.abs(entry.edge - nearest.edge) <= SAME).sort((a, b) => b.depth - a.depth);
    let chosen = null;
    if (stack.every((entry) => entry.box.kind === "list")) {
      // Lists by indentation: the deepest whose markers start left of the pointer, else the outermost.
      chosen = (stack.find((entry) => itemsLeft(entry.box) - LEAVE <= px) ?? stack.at(-1)).box;
    } else {
      const levels = [...stack.slice(1).map((entry) => entry.box), ...(box ? [box] : [])];
      if (levels.length > 0) chosen = levels[Math.min(Math.floor(Math.abs(y - nearest.edge) / STEP), levels.length - 1)];
    }
    if (chosen && chosen !== box) {
      box = chosen;
      slot = nearest.side === "bottom" ? units(box).length : headOf(box, units(box));
    }
  }
  if (!box) return null;

  // At a list's end, left of its markers (past where its items start, by LEAVE): the list around it, after the item holding it
  // (on the path: that list, the item, the item's own box for lists, this list). Having left it,
  // they do not go back under that item.
  let left = false;
  for (let index = path.indexOf(box); box.kind === "list" && index >= 4 && slot === units(box).length && px < itemsLeft(box) - LEAVE; index = path.indexOf(box)) {
    const [list, item, lists] = [path[index - 4], path[index - 3], path[index - 2]];
    if (lists.kind !== "nest" || !open(list)) break;
    box = list;
    slot = units(box).indexOf(item) + 1;
    left = true;
  }
  const others = units(box);
  const above = others[slot - 1];
  const nest = items ? (!left && box.kind === "list" && !box.row && above?.nestable && px > above.start + NEST ? above : null) : held(path, box, above);

  // Where they are already: next to each other in this box, all of them, at this place.
  const all = box.children.filter((child) => child.type === "unit");
  const first = all.findIndex(dragged);
  const run = first < 0 ? 0 : all.slice(first).findIndex((child) => !dragged(child));
  const same = !nest && first >= 0 && (run < 0 ? all.length - first : run) === count && slot === first;
  const line = nest && !items ? { left: nest.start, top: nest.rect.bottom + 2, right: nest.rect.right, bottom: nest.rect.bottom + 5 } : lineOf(box, others, slot, nest, y);
  return { box: box.el, slot, nest: nest?.el ?? null, same, line, halo: nest ? nest.rect : box === tree ? null : box.rect };

  // The item blocks of other kinds go under (at the end of what it holds), or null: over a list the
  // pointer is in (deeper than `box`), the item above the pointer; else, right after a list, its last
  // item; then, down the last lists they hold, the deepest item whose text starts a step (NEST) left
  // of the pointer. Only an item that takes them (`nestable`, its box taking every kind dragged).
  function held(path, box, above) {
    const list = path.findLast((node) => node.type === "box" && node.kind === "list");
    const inside = list && path.indexOf(list) > path.indexOf(box);
    let item = inside ? units(list)[placeIn(list) - 1] : above?.kind === "list" ? lastItem(above) : null;
    let found = null;
    while (item && px > item.start + NEST) {
      if (item.nestable && takes({ kind: "nest", el: item.el })) found = item;
      const nested = item.children.find((child) => child.type === "box" && child.kind === "nest");
      const last = nested ? units(nested).at(-1) : null;
      item = last?.kind === "list" ? lastItem(last) : null;
    }
    return found;
  }
  function lastItem(listUnit) {
    const box = listUnit.children.find((child) => child.type === "box" && child.kind === "list");
    return box ? units(box).at(-1) ?? null : null;
  }
}

// Beside a block (the units on `path`, from the page down, at height y): in the innermost row of
// columns on it, a new column at the row's ends or left of a column's handle; elsewhere the innermost
// block of a flow that may stand in a column, beside it. The line stands down that side, the block (or
// the column beside the line) tinted. Null where the drop goes between blocks as ever.
const FLOW_ROLES = new Set(["root", "flow"]);
function asideOf(path, x, dragged, count, fits, edge) {
  const down = (rect, at) => ({ left: at - 1.5, top: rect.top - 8, right: at + 1.5, bottom: rect.bottom + 8 });
  const leftOf = (left) => x >= left - REACH && x < Math.max(Math.min(left, path[0].content.left) - OUT, edge + FIRST);
  const row = path.findLast((node) => node.type === "unit" && isRow(node) && !dragged(node));
  if (row) {
    const box = row.children.find((child) => child.type === "box");
    const columns = box?.children.filter((child) => child.type === "unit") ?? [];
    if (columns.length === 0) return null;
    // The column whose blocks are all of those dragged (and only they), which moves instead.
    const own = (column) => column.children.flatMap((inner) => inner.children.filter((child) => child.type === "unit"));
    const whole = columns.find((column) => own(column).length === count && own(column).every(dragged)) ?? null;
    const after = columns.findIndex(({ rect }, at) => {
      const next = columns[at + 1]?.rect;
      return next ? x >= next.left - OUT - BETWEEN && x < next.left - OUT
        : x > rect.left + (2 * (rect.right - rect.left)) / 3 && x > rect.right - SIDE && x < rect.right + REACH;
    });
    const index = leftOf(columns[0].rect.left) ? 0 : after < 0 ? -1 : after + 1;
    if (index < 0) return null;
    const from = whole ? columns.indexOf(whole) : -1;
    const same = from >= 0 && (index === from || index === from + 1);
    if (!whole && columns.length >= MAX_COLUMNS) return null;
    const at = index === 0 ? columns[0].rect.left - 6 : index === columns.length ? columns.at(-1).rect.right + 6 : (columns[index - 1].rect.right + columns[index].rect.left) / 2;
    return { box: box.el, slot: 0, nest: null, same, aside: { row: row.el, index, whole: whole?.el ?? null }, line: down(row.rect, at), halo: columns[Math.max(0, index - 1)].rect };
  }
  // The innermost block of a flow, one that may stand in a column and holds none of those dragged.
  let target = null;
  for (let index = 1; index < path.length; index++) {
    const node = path[index];
    if (node.type !== "unit") continue;
    if (FLOW_ROLES.has(path[index - 1].role)) target = node;
  }
  const holdsDragged = (node) => node.children.some((inner) => inner.children.some((unit) => dragged(unit) || holdsDragged(unit)));
  if (!target || !fits(target) || holdsDragged(target)) return null;
  const { rect } = target;
  const side = x > rect.left + (2 * (rect.right - rect.left)) / 3 && x <= rect.right + REACH ? "right"
    : leftOf(rect.left) ? "left" : null;
  if (!side) return null;
  const box = path[path.indexOf(target) - 1];
  return { box: box.el, slot: 0, nest: null, same: false, aside: { target: target.el, side }, line: down(rect, side === "right" ? rect.right + 6 : rect.left - 6), halo: rect };
}

// The line showing a place: across the box between two of its blocks (under an item, from its
// text, where the markers of a list in it would stand; before the first and after the last, from
// no further out than the box's edge, which a divider's band may pass), down between two blocks of
// a row or at the end of the row the pointer is in (across a block alone in its row of a box whose
// rows wrap, above or below it), or along the bottom of an empty box.
function lineOf(box, others, slot, nest, y) {
  // A box's lead (a highlight block's icon) is no block to fall between: the line spans the blocks
  // after it, from the icon's right.
  const head = headOf(box, others);
  slot -= head;
  const rects = others.slice(head).map((unit) => unit.rect);
  if (rects.length === 0) {
    // An empty box: across its content, inside its padding (an empty Sheet panel's 16px).
    const { left, top, right, bottom } = box.content;
    const at = bottom > top ? (top + bottom) / 2 : box.rect.bottom - 6;
    return { left, top: at - 1.5, right, bottom: at + 1.5 };
  }
  if (box.row) {
    const next = rects[slot];
    const previous = rects[slot - 1];
    const sameRow = next && previous && Math.abs(next.top - previous.top) < 4;
    const endOfRow = previous && !sameRow && (!next || (y >= previous.top && y <= previous.bottom));
    const rect = sameRow || !endOfRow ? next ?? previous : previous;
    // Before or after a block alone in its row of a box whose rows wrap (or with the pointer between
    // its row and the next, either of the two alone): across it, between the rows (halfway to the row
    // above or below), or just past it at the box's start or end.
    const between = previous && next && !sameRow && y > previous.bottom && y < next.top;
    const lone = sameRow ? null : [rect, ...(between ? [previous, next] : [])].find((each) => alone(box, rects, each));
    if (lone) {
      const at = lone === previous ? (next ? (previous.bottom + next.top) / 2 : previous.bottom + 6) : previous ? (previous.bottom + next.top) / 2 : next.top - 6;
      return { left: lone.left, top: at - 1.5, right: lone.right, bottom: at + 1.5 };
    }
    const at = sameRow ? (previous.right + next.left) / 2 : endOfRow ? previous.right + 8 : next.left - 8;
    return { left: at - 1.5, top: rect.top, right: at + 1.5, bottom: rect.bottom };
  }
  const left = nest ? nest.start : Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const at = slot === 0 ? Math.max(rects[0].top, box.rect.top) - 6
    : slot === rects.length ? Math.min(rects.at(-1).bottom, box.rect.bottom) + 6
    : (rects[slot - 1].bottom + rects[slot].top) / 2;
  return { left, top: at - 1.5, right, bottom: at + 1.5 };
}
