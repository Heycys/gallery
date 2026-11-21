import { UNIT, isEmpty, isHost, nestedBlocks, withLeads } from "./core.mjs";
import { boxRole, endIsPadding, isBlock, isLead, isSelectable } from "../components/registry.mjs";

// Where the blocks are on the screen (docs/editor.md, "Selecting blocks"). measure() reads the
// page once into a tree of boxes and units with their rectangles. hoverAt, atHeight, measuredNode, pick,
// endOf and gapScore are pure functions of that tree, so their rules are tested without a browser
// (tests/unit/geometry.mjs); what reads the DOM is measure() and the readers of one element it and the
// overlays use: extentOf, fillExtentOf, clipOf, markerRect, markerAt, blankTarget:
//
//   hoverAt      the block whose handle shows while the pointer is on empty space beside it (and,
//                of text blocks, the one a click there puts the caret into)
//   pick         the blocks a box selection takes: the ones it touches, lifted to one level
//   endOf        what a click below the last block of a box does: a new paragraph there, or the
//                caret into the empty paragraph already at the end (none in a box whose end is its padding)
//   innerBox     the innermost box at a click's height, whose blocks are those beside it
//
// Where dragged blocks would go (resolveDrop) is drag/drop.mjs, from the same tree.
//
// Geometry proposes, the page's structure (boxes, units) decides the level, and accepts() and the
// block rules decide what may happen; nothing here changes the page.
//
// A box: { type: "box", el, kind, role, rect, content, row, children: [unit | box] }, its units and the
// boxes standing loose in it (the report's header in the page); `content`: its rect inside its
// padding and border (where an empty box takes a block); `row`: it lays its blocks side by side (a
// tab row, a row of columns), "wrap" when in rows that wrap (a flowchart's nodes). A unit: { type: "unit", el, kind, rect, start, empty, text,
// nestable, children: [box] }, the boxes it holds (itself when it is one: a section, a list); its
// rect is where it shows (extentOf: a list item with its marker), `start` where its own content
// starts (a list item's text, right of the marker; its left otherwise); `text`: it is a text block
// itself, `nestable`: a list item that may take lists. Rects are { left, top, right, bottom } in
// page coordinates (scrolling does not change them); what is not shown (a hidden Sheet panel, a
// closed disclosure) is not in the tree.

const FLOWS = new Set(["root", "flow", "column"]);

const RULE = 12; // a divider line shows as a band this far above and below it (as tall as the handle)

/**
 * Whether the page leaves `el` out of what it shows though the browser lays it out and gives it a
 * rectangle: the content of a closed disclosure (Chrome places it under the title, over the blocks
 * after the disclosure, but draws none of it). `checkVisibility` says so, for this as for
 * content-visibility: hidden; a rectangle with width and height both zero (display: none: a folded
 * heading's section, a Sheet tab no longer shown) is the other way a block is not there. The one rule
 * for where a block shows (extentOf) and for what is drawn at a block's place (the ghosts of changes/).
 */
export const undrawn = (el) => el.checkVisibility?.() === false;

/**
 * Where a block shows (client coordinates), or null when it does not: its own box and those of its
 * leads, a list item's marker left of it, out to its list's edge (the list's room for markers), and
 * a divider line (an <hr>) as a band around the line, a line of text tall (the line alone is a
 * pixel or two), as the reader sees the block. Its fill, its handle, where the pointer finds it and
 * what a box selection touches go by this.
 */
export function extentOf(el) {
  let rect = null;
  for (const part of withLeads(el)) {
    const next = part.getBoundingClientRect();
    if ((next.width === 0 && next.height === 0) || undrawn(part)) continue;
    rect = rect
      ? { left: Math.min(rect.left, next.left), top: Math.min(rect.top, next.top), right: Math.max(rect.right, next.right), bottom: Math.max(rect.bottom, next.bottom) }
      : { left: next.left, top: next.top, right: next.right, bottom: next.bottom };
  }
  const marker = rect ? markerLeft(el) : null;
  if (marker !== null) rect.left = Math.min(rect.left, marker);
  if (rect && el.localName === "hr") {
    const middle = (rect.top + rect.bottom) / 2;
    rect.top = Math.min(rect.top, middle - RULE);
    rect.bottom = Math.max(rect.bottom, middle + RULE);
  }
  return rect;
}

const RULE_FILL = 7; // ...and as what the editor draws over it shows it: a divider row 13px tall

/**
 * Where what the editor draws over a block lies (a selected block's fill, the frame of what is
 * edited): its extent (extentOf), a divider line's band 13px tall, a divider's row; the band
 * the pointer finds it by stays taller (it once showed the fill 36px high around a 1px line).
 */
export function fillExtentOf(el) {
  const rect = extentOf(el);
  if (!rect || el.localName !== "hr") return rect;
  const middle = (rect.top + rect.bottom) / 2;
  return { ...rect, top: middle - RULE_FILL, bottom: middle + RULE_FILL };
}

/**
 * The part of the window a block can show in (client coordinates): inside every element around it
 * that cuts off what overflows it (a dialog's scrolling content, a Sheet's tab row), or null when
 * none does. What the editor draws over a block (its fill, its frame) is cut to it, as the block is.
 */
export function clipOf(el) {
  let clip = null;
  for (let node = el.parentElement; node && node !== document.body; node = node.parentElement) {
    const style = getComputedStyle(node);
    if (style.overflowX === "visible" && style.overflowY === "visible") continue;
    const rect = node.getBoundingClientRect();
    const left = rect.left + node.clientLeft;
    const top = rect.top + node.clientTop;
    const inner = { left, top, right: left + node.clientWidth, bottom: top + node.clientHeight }; // inside its borders and scroll bars
    clip = clip
      ? { left: Math.max(clip.left, inner.left), top: Math.max(clip.top, inner.top), right: Math.min(clip.right, inner.right), bottom: Math.min(clip.bottom, inner.bottom) }
      : inner;
  }
  return clip;
}

/**
 * The kit's marker of a list item (its number, bullet or to-do box, drawn left of its text by the
 * item's ::before: flow.css, todo.css) where the browser laid it out, or null when the item has
 * none. The one reading of it: the handle's reach, a number's tooltip and menu, a to-do's box.
 */
export function markerRect(el) {
  if (el.localName !== "li") return null;
  const before = getComputedStyle(el, "::before");
  if (before.position !== "absolute" || !before.content || before.content === "none" || before.content === "normal") return null;
  // One drawn inside the item is none (a flowchart's step number, in its card: flowchart.css).
  if (parseFloat(before.left) >= 0) return null;
  const number = (value) => parseFloat(value) || 0;
  const box = el.getBoundingClientRect();
  const width = number(before.width) + (before.boxSizing === "border-box" ? 0 : number(before.paddingLeft) + number(before.paddingRight) + number(before.borderLeftWidth) + number(before.borderRightWidth));
  const right = box.left - number(before.marginRight);
  const top = box.top + number(before.top);
  const height = number(before.height) || number(getComputedStyle(el).lineHeight) || 26;
  return { left: right - width, right, top, bottom: top + height, width, height };
}

/**
 * The marker of a list item when a point is on it: its width (2px more to either side) on the
 * item's first line. Null when it is not, or the item has none.
 */
export function markerAt(el, x, y) {
  const rect = markerRect(el);
  if (!rect) return null;
  const top = el.getBoundingClientRect().top;
  const line = Math.max(rect.height, parseFloat(getComputedStyle(el).lineHeight) || 0);
  return x >= rect.left - 2 && x <= rect.right + 2 && y >= top && y <= top + line ? rect : null;
}

// Where the marker of a list item standing outside its box starts (the browser's, in its list's
// padding; the kit's, markerRect), or null when it has none there.
function markerLeft(el) {
  if (el.localName !== "li" || !el.parentElement?.matches("ul, ol")) return null;
  const list = el.parentElement.getBoundingClientRect().left;
  const style = getComputedStyle(el);
  if (style.display.includes("list-item") && style.listStylePosition === "outside" && style.listStyleType !== "none") return list;
  const marker = markerRect(el);
  return marker && Math.min(list, marker.left);
}

/**
 * Whether a press or the pointer is on empty space: the page around the report, or a box between
 * its blocks. Never text: a list item is the box of its lists too, yet a press on it is in its text.
 */
export function blankTarget(target) {
  if (!target?.closest || target.closest("[data-doc-dev]")) return false;
  if (target === document.documentElement || target === document.body) return true;
  if (!target.closest("main")) return false; // the report's own controls outside it
  return target.localName === "main" || (target.hasAttribute("data-ge-box") && target.getAttribute("contenteditable") !== "true");
}

/**
 * The tree of `root` (a box, the page's main by default). With `band` ({ top, bottom }, page
 * coordinates) only the units reaching into it are measured, and what they hold (reaching it with
 * a divider's band to spare: a divider at a section's top reaches past the section).
 */
export function measure(root = document.querySelector("main"), band = null) {
  const dx = scrollX;
  const dy = scrollY;
  const onPage = (rect) => rect && { left: rect.left + dx, top: rect.top + dy, right: rect.right + dx, bottom: rect.bottom + dy };
  const ownRect = (el) => {
    const rect = el.getBoundingClientRect();
    return rect.width === 0 && rect.height === 0 ? null : onPage(rect);
  };
  const reaches = (rect) => Boolean(rect) && (!band || (rect.bottom + RULE >= band.top && rect.top - RULE <= band.bottom));

  function boxNode(el) {
    const kind = el.getAttribute("data-ge-box-kind");
    const style = getComputedStyle(el);
    const rect = ownRect(el);
    const node = { type: "box", el, kind, role: boxRole(kind), rect, content: rect && contentOf(rect, style), row: sideBySide(style), children: [] };
    for (const child of el.children) {
      if (child.matches(UNIT)) {
        const unit = unitNode(child);
        if (unit) node.children.push(unit);
      } else if (child.hasAttribute("data-ge-box")) {
        const box = boxNode(child);
        if (reaches(box.rect)) node.children.push(box);
      }
    }
    return node;
  }

  function unitNode(el) {
    const rect = onPage(extentOf(el));
    if (!reaches(rect)) return null;
    const start = el.localName === "li" ? el.getBoundingClientRect().left + dx : rect.left;
    const text = isHost(el);
    const empty = text && el.localName === "p" && el.classList.length === 0 && isEmpty(el);
    // An item takes lists when the file's has its box for them, or it was made on the page.
    const nestable = el.localName === "li" && (el.getAttribute("data-ge-box-kind") === "nest" || (el.hasAttribute("data-ge-new") && !el.hasAttribute("data-ge-unit")));
    // An item holding blocks: its own line, above them (a box selection touching it takes the item).
    const lists = text ? nestedBlocks(el) : [];
    const own = lists.length > 0 ? { ...rect, bottom: lists[0].getBoundingClientRect().top + dy } : null;
    const node = { type: "unit", el, kind: el.getAttribute("data-ge-unit-kind"), rect, start, empty, text, nestable, own, children: [] };
    for (const inner of boxesOf(el)) {
      if (folded(inner)) continue;
      const box = boxNode(inner);
      if (box.rect) node.children.push(box);
    }
    return node;
  }

  return boxNode(root);
}

/**
 * Whether a box is a closed disclosure's content: none of it is on the page. (The browser still
 * places its blocks, under the title, over the blocks after the disclosure: a box selection or the
 * pointer there would find them.)
 */
const folded = (box) => box.parentElement?.localName === "details" && !box.parentElement.open;

// The boxes a unit holds: itself when it is one, otherwise those inside it with no unit or box between.
function boxesOf(el) {
  if (el.hasAttribute("data-ge-box")) return [el];
  return [...el.querySelectorAll("[data-ge-box]")].filter((box) => box.parentElement.closest(`${UNIT}, [data-ge-box]`) === el);
}

/** A box's rect inside its padding and border (its text area: insert/ boxedBeside too). */
export function contentOf(rect, style) {
  const inset = (side) => (parseFloat(style[`padding${side}`]) || 0) + (parseFloat(style[`border${side}Width`]) || 0);
  return { left: rect.left + inset("Left"), top: rect.top + inset("Top"), right: rect.right - inset("Right"), bottom: rect.bottom - inset("Bottom") };
}

// A box laying its blocks side by side (a tab row, a grid of cards) rather than one below another:
// true, or "wrap" when its rows wrap (a flowchart's nodes, as the kit lays them out: rows that fill
// its width, a node alone in a row of its own where nothing goes beside it), false for none.
export function sideBySide(style) {
  if (style.display.includes("grid")) return style.gridTemplateColumns.trim().split(/\s+/).length > 1;
  if (!style.display.includes("flex") || style.flexDirection.startsWith("column")) return false;
  return style.flexWrap.startsWith("wrap") ? "wrap" : true;
}

/**
 * The block beside the point (page coordinates) whose handle shows while the pointer is on empty
 * space: of the units whose rectangle, widened by `reach` on both sides, holds the point, the one
 * nested deepest (a list item rather than its list, a paragraph rather than its section), and of
 * those side by side the nearest. `skip(unit)`: a unit with no handle of its own (a section, a
 * Sheet area), whose blocks still count.
 */
export function hoverAt(tree, x, y, { reach = 150, skip = () => false } = {}) {
  let best = null;
  const visit = (box, depth) => {
    for (const child of box.children) {
      if (child.type === "box") {
        visit(child, depth);
        continue;
      }
      const { left, top, right, bottom } = child.rect;
      const distance = Math.max(left - x, x - right, 0);
      if (y >= top && y <= bottom && distance <= reach && !skip(child) && (!best || depth > best.depth || (depth === best.depth && distance < best.distance))) {
        best = { unit: child, depth, distance };
      }
      // Looked into either way: what it holds may reach past it (a divider's band at its top).
      for (const inner of child.children) visit(inner, depth + 1);
    }
  };
  visit(tree, 0);
  return best?.unit.el ?? null;
}

// The units a node holds, through its boxes; a skipped unit (one with no handle of its own: a row of
// columns, a column) is looked into.
function innerUnits(node, skip) {
  const found = [];
  const visit = (each) => {
    for (const child of each.children) {
      if (child.type === "box" || skip(child)) visit(child);
      else found.push(child);
    }
  };
  visit(node);
  return found;
}

/**
 * The block whose handle shows with the pointer at (x, y) (page coordinates) in a measured unit
 * holding blocks (a list item and its lists, a quote, a disclosure): the handle follows the
 * pointer's height, never staying on the outer block's first line. The innermost block reaching that height; between
 * blocks (their gaps), the nearest by height, then by width (blocks side by side). The unit's own
 * head (a list item's own line, a title above what it holds) is one of them: there it is the unit
 * itself. `skip(unit)`: a unit with no handle of its own, whose blocks count.
 */
export function atHeight(node, x, y, { skip = () => false } = {}) {
  const score = (rect) => gapScore(rect, x, y);
  for (;;) {
    const inner = innerUnits(node, skip).filter((unit) => unit.rect);
    if (inner.length === 0) return node;
    const first = Math.min(...inner.map((unit) => unit.rect.top));
    const head = node.own ?? (first - node.rect.top >= 8 ? { ...node.rect, bottom: first } : null);
    let best = head ? { unit: null, score: score(head) } : null;
    for (const unit of inner) {
      const each = score(unit.rect);
      if (!best || each[0] < best.score[0] || (each[0] === best.score[0] && each[1] < best.score[1])) best = { unit, score: each };
    }
    if (!best.unit) return node;
    node = best.unit;
  }
}

/** The measured node of an element in a tree, or null. */
export function measuredNode(tree, el) {
  if (tree.el === el && tree.type === "unit") return tree;
  for (const child of tree.children) {
    const found = measuredNode(child, el);
    if (found) return found;
  }
  return null;
}

const meets = (a, b) => a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top;

/**
 * The blocks a box selection over `rect` (page coordinates) takes, in document order: the units it
 * touches that hold no other unit it touches, each lifted to the child of the innermost box around
 * all of them. Two paragraphs of a section give those paragraphs; a paragraph of each of two
 * sections gives both sections; blocks in two columns of a row give those blocks (a column is no
 * block of its own); items of a list give the items, an item and the paragraph before
 * the list give that paragraph and the list; an item holding lists whose own line it touches is
 * taken whole (below that line, the nested items it touches). A box standing loose in that box, no
 * block of its own (the report's header in the page, around its lines), is looked into: the blocks it
 * touches there, as they stand in it, so a box from the header's small text into the summary takes
 * that line and the summary (it once took the summary alone).
 */
export function pick(tree, rect) {
  const hits = []; // [path from the tree down to the unit, the unit last]
  // A box's lead (a highlight block's icon) is no block to pick: it is the block's own, so a box
  // touching only it, or only the block's padding, takes the whole highlight block, as a
  // disclosure's title row takes the disclosure. A unit that is never selected (`selectable: false`:
  // the page's icon in the header, which is no block) is passed over as well: a box from above the
  // icon and the title into the page takes the header's lines and the page's blocks alone.
  const visit = (node, path) => {
    for (const child of node.children) {
      const next = [...path, child];
      if (child.type === "unit" && ((node.type === "box" && isLead(node.kind, child.kind)) || !isSelectable(child.kind))) continue;
      if (child.type === "unit" && meets(child.rect, rect)) hits.push(next);
      visit(child, next); // what it holds may reach past it (a divider's band at its top)
    }
  };
  visit(tree, [tree]);
  const outer = new Set(hits.flatMap((path) => path.slice(0, -1)));
  // A list item whose own line it touches counts as one, the lists it holds with it.
  const whole = (node) => node.type === "unit" && Boolean(node.own) && meets(node.own, rect);
  const leaves = hits.filter((path) => (whole(path.at(-1)) || !outer.has(path.at(-1))) && !path.slice(0, -1).some(whole));
  if (leaves.length === 0) return [];
  // The innermost box on every leaf's path.
  let common = 0;
  while (leaves.every((path) => path.length > common + 1 && path[common + 1] === leaves[0][common + 1])) common++;
  let level = common;
  while (leaves[0][level].type !== "box") level--;
  const picked = [];
  for (const path of leaves) {
    // Past a box standing loose in it (the page's header): the block the leaf is, or holds it, in there.
    let at = level + 1;
    while (path[at].type === "box") at++;
    let lifted = path[at];
    // A column is no block of its own: across columns, the blocks touched in each.
    if (lifted.type === "unit" && !isBlock(lifted.kind)) lifted = path[at + 2];
    if (lifted?.type === "unit" && !picked.includes(lifted)) picked.push(lifted);
  }
  return picked.map((unit) => unit.el);
}

/**
 * A click on the empty space of `box` (measured) at height `y` (page coordinates): below its last
 * block, a flow or the page takes a new paragraph at its end ({ box, after }: after its last
 * block, or at its start); when the last block, followed down through the flows it holds (a
 * section's, a panel's, a disclosure's), is an empty paragraph, the caret goes there instead
 * ({ focus }), so clicking again does not pile them up. A box whose end is its own padding
 * (endIsPadding: a highlight block, a disclosure's content) takes none: under its last block is a gap
 * like any other (insert/ clickBlank). Anywhere else, null.
 */
export function endOf(box, y) {
  if (!FLOWS.has(box.role) || endIsPadding(box.kind)) return null;
  const last = box.children.at(-1) ?? null;
  if (last && y <= last.rect.bottom) return null;
  let deepest = last;
  while (deepest?.type === "unit") {
    const next = deepest.children.filter((inner) => FLOWS.has(inner.role)).at(-1)?.children.at(-1);
    if (!next) break;
    deepest = next;
  }
  if (deepest?.type === "unit" && deepest.empty) return { focus: deepest.el };
  return { box: box.el, after: last?.el ?? null };
}

/**
 * The innermost box of `box` (measured) reaching height `y` (page coordinates), `box` itself when
 * none does: a Sheet's panel, a section, a disclosure's content, a list; of those side by side (the
 * columns of a row) the nearest to `x`. What stands beside a click on the page's margin goes by it,
 * as the margin is no box's but the page's.
 */
export function innerBox(box, x, y) {
  const inner = box.children.flatMap((child) => (child.type === "box" ? [child] : child.children)).filter(({ rect }) => y >= rect.top && y <= rect.bottom);
  if (inner.length === 0) return box;
  const gap = ({ rect }) => gapScore(rect, x, y)[1];
  return innerBox(inner.reduce((a, b) => (gap(b) < gap(a) ? b : a)), x, y);
}

/**
 * How far a rectangle is from the point (x, y): [the gap by height, the gap by width], 0 where the
 * point is within it. The nearest block to a point goes by it, height first (then width: blocks
 * side by side); how a tie goes is each caller's.
 */
export const gapScore = (rect, x, y) => [
  y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0,
  x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0,
];
