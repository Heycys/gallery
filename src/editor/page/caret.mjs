import { DIALOG } from "../components/kit.mjs";
import { SEALED, texOnly } from "../components/registry.mjs";
import { slotsOf } from "../../shared/table-slots.mjs";
import { isHost, nestedBlocks, textEnd } from "./core.mjs";
import { pageAt } from "./page-objects.mjs";

// Caret and line helpers of the preview editor: where the caret is, the lines of a block, the
// block above or below, and moving between blocks with the arrow keys (editor.mjs handles the keys).

/**
 * The editable block (a contenteditable host) a node is in, or null. What stands in what is sealed
 * (`sealed`: an instance of a component package) is no text of a text block around that: a list item
 * holding it is that to closest, whatever contenteditable="false" says between them.
 */
export const editable = (node) => {
  const start = node?.nodeType === 1 ? node : node?.parentElement;
  const host = start?.closest?.('[contenteditable="true"]');
  if (!isHost(host)) return null;
  const seal = SEALED ? node.parentElement?.closest(SEALED) : null;
  return seal && !seal.contains(host) ? null : host;
};

/**
 * The text block holding the caret inside text block `outer`, or `outer`: a list item holding a
 * paragraph (or a heading) is edited by Chrome as one editable element, the outermost, which then has
 * the focus and gets the paragraph's keys, input and paste; the caret tells which block they are for.
 */
export function innerHost(outer) {
  const selection = getSelection();
  const inner = selection.rangeCount ? editable(selection.anchorNode) : null;
  return inner && outer && inner !== outer && outer.contains(inner) ? inner : outer;
}

/** The text block an event (a key, input, a paste) is for: the one around its target, or the caret's inside it (innerHost). */
export const hostOf = (event) => innerHost(editable(event.target));

export function select(range) {
  const selection = getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  // Chrome may keep the caret it put at the start of a text block just focused, removeAllRanges and
  // all, and then takes no range added (a list item Tab moved into the list the item above holds,
  // where the caret went back to its start): the range replaces it.
  const now = selection.rangeCount ? selection.getRangeAt(0) : null;
  if (!now || now.startContainer !== range.startContainer || now.startOffset !== range.startOffset || now.endContainer !== range.endContainer || now.endOffset !== range.endOffset) {
    selection.setBaseAndExtent(range.startContainer, range.startOffset, range.endContainer, range.endOffset);
  }
}

/** The chip of the text `node` is in, or null. */
export const atomOf = (node) => (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.("[data-ge-atom]") ?? null;

/**
 * A caret inside a formula, where nothing can be typed: a click right of one whose superscript
 * reaches past its text (\mathbb{R}^n, x^2) puts it in the formula's own text. It goes after the
 * formula, or before it when `x` (the click) is on its left half. Returns whether it moved.
 */
export function outOfAtom(x = null) {
  const selection = getSelection();
  if (!selection.rangeCount || !selection.isCollapsed) return false;
  const atom = atomOf(selection.anchorNode);
  if (!atom) return false;
  const rect = atom.getBoundingClientRect();
  const range = document.createRange();
  besideAtom(range, atom, x === null || x >= rect.left + rect.width / 2);
  select(range);
  return true;
}

// Where a block's text ends: before the blocks an item holds, and before the line break that keeps an
// empty item's line ahead of them (keepLine), past which there is no line of its, only theirs.
const lineEnd = (host) => {
  const end = textEnd(host);
  return end < host.childNodes.length && host.childNodes[end - 1]?.nodeName === "BR" ? end - 1 : end;
};

/** The caret at a block's start or end, the page staying where it is. Returns whether it went there. */
export function placeCaret(host, where, offset = null) {
  if (!host?.isConnected) return false;
  host.focus({ preventScroll: true });
  const range = document.createRange();
  range.setStart(host, offset !== null ? Math.min(offset, host.childNodes.length) : where === "start" ? 0 : lineEnd(host));
  range.collapse(true);
  select(range);
  return true;
}

export function caretAt(host, where, offset = null) {
  if (!placeCaret(host, where, offset)) return;
  host.scrollIntoView({ block: "nearest", inline: "nearest" });
  showEnd(); // a detail card's last block: its content to the end
}

/** Put the caret after this many characters of a block. */
export function caretAtOffset(host, offset) {
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  let rest = offset;
  let last = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (rest <= node.length) {
      const caret = document.createRange();
      caret.setStart(node, rest);
      return select(caret);
    }
    rest -= node.length;
    last = node;
  }
  caretAt(host, last ? "end" : "start"); // past its text, or in a block with none (emptied)
}

/** The selection when it is non-empty and inside a single block: { host, range }, or null. */
export function selectionContext() {
  const selection = getSelection();
  if (!selection.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  const host = editable(range.startContainer);
  return host && editable(range.endContainer) === host ? { host, range } : null;
}

function edgeRange(host, toEnd) {
  const selection = getSelection();
  if (!selection.rangeCount || !selection.isCollapsed) return null;
  const range = document.createRange();
  if (toEnd) {
    range.setStart(selection.anchorNode, selection.anchorOffset);
    range.setEnd(host, textEnd(host));
  } else {
    range.setStart(host, 0);
    range.setEnd(selection.anchorNode, selection.anchorOffset);
  }
  return range;
}

// Nothing (no text, formula or line break) between the caret and the block edge. A <br> the
// browser keeps at the very end of a block to hold its last line does not count.
export function atEdge(host, toEnd) {
  const range = edgeRange(host, toEnd);
  if (!range || range.toString() !== "") return false;
  const content = range.cloneContents();
  if (content.querySelector("[data-ge-atom]")) return false;
  return content.querySelectorAll("br").length <= (toEnd && host.childNodes[textEnd(host) - 1]?.nodeName === "BR" ? 1 : 0);
}

// Editable hosts the reader can reach now, in document order: visible, and inside the open
// modal dialog when there is one. A closed disclosure's content is not (the browser still lays it
// out, under the title and over the blocks after it, but draws none of it: checkVisibility).
export function hosts() {
  const scope = document.querySelector("dialog[open]") ?? document;
  return [...scope.querySelectorAll("[data-ge-block], [data-ge-new]")]
    .filter((node) => isHost(node) && shown(node));
}

const shown = (node) => node.getClientRects().length > 0 && !node.closest("[inert]") && node.checkVisibility?.() !== false;

/**
 * The text block nearest `host` going `step` (1 on, -1 back) in `list` (hosts()) that has text to type
 * in, or undefined: not a formula block, which has none (a block with no text is passed over, as the
 * arrow keys pass over it: places()).
 */
export function textNear(host, step, list = hosts()) {
  for (let at = list.indexOf(host) + step; at >= 0 && at < list.length; at += step) if (!texOnly(list[at])) return list[at];
  return undefined;
}

// Where the arrow keys take the caret between blocks, in document order: the editable hosts (hosts())
// and the code blocks a press opens for editing (a pre marked data-ge-code: components/code/page.mjs
// openAt), whose code is text to move into; not a formula block, which has no text to type in (the
// keys pass over it, and Enter on it selected opens its editor).
function places() {
  const scope = document.querySelector("dialog[open]") ?? document;
  const codes = [...scope.querySelectorAll("main pre[data-ge-code]")].filter(shown);
  const list = hosts().filter((node) => !texOnly(node));
  if (codes.length === 0) return list;
  return [...list, ...codes].sort(inOrder);
}
const closedCode = (node) => node.localName === "pre";
const inOrder = (a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
// Preformatted text (a code block's), where a line break is a line of its own.
const preformatted = (node) => /^(pre|break-spaces)/.test(getComputedStyle(node.nodeType === 1 ? node : node.parentElement).whiteSpace);

// Line boxes of a block: its text and its formula chips (not the glyph boxes inside a formula, nor
// anything the blocks a list item holds show: a paragraph's words, a task board's drawn labels); of a
// code block not open yet (a pre), its code's. An empty line of code has a box too, for the caret to
// stop on: in open code the line break ending it (a break stands at the end of the line it ends), in a
// code block not open yet the kit's line's content.
function lineRects(host) {
  const rects = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const closed = closedCode(host);
  const held = nestedBlocks(host);
  const own = closed ? () => true : (node) => node.parentElement.closest('[contenteditable="true"]') === host && !held.some((block) => block.contains(node));
  const pre = preformatted(host);
  let last = "\n"; // the character before, in the block's own text (its start begins a line)
  for (let node; (node = walker.nextNode());) {
    if (node.parentElement.closest("[data-ge-atom]") || !own(node)) continue;
    for (let at = pre ? node.data.indexOf("\n") : -1; at >= 0; at = node.data.indexOf("\n", at + 1)) {
      const empty = (at > 0 ? node.data[at - 1] : last) === "\n" ? charRect(node, at) : null;
      if (empty) rects.push(empty);
    }
    if (node.length > 0) last = node.data.at(-1);
    if (!node.data.trim()) continue;
    range.selectNodeContents(node);
    rects.push(...range.getClientRects());
  }
  if (closed) host.querySelectorAll(".doc-code-content").forEach((line) => { if (line.textContent === "") rects.push(...line.getClientRects()); });
  host.querySelectorAll("[data-ge-atom]").forEach((chip) => { if (own(chip)) rects.push(...chip.getClientRects()); });
  return rects.filter((rect) => rect.height >= 4);
}

// The box of the character at `at` in a text node, or null.
function charRect(node, at) {
  const probe = document.createRange();
  probe.setStart(node, at);
  probe.setEnd(node, at + 1);
  return probe.getClientRects()[0] ?? null;
}

// A block's box without the blocks a list item holds (its text line, for moving between lines).
export function ownRect(host) {
  const rect = host.getBoundingClientRect();
  const list = nestedBlocks(host)[0];
  if (!list) return rect;
  const bottom = Math.max(rect.top, list.getBoundingClientRect().top);
  return { left: rect.left, right: rect.right, top: rect.top, bottom, width: rect.width, height: bottom - rect.top };
}

// The caret's box. A caret between elements (or in an empty block) has none of its own, so the
// end of the node before it (or the start of the node after it) is measured instead. `drawn`: the
// range is the selection's, measured where the browser draws its caret at a wrapped line's end
// (atLineEnd, for the arrow keys: it touches the selection, so never from a selectionchange).
export function caretRect(range, drawn = false) {
  const { startContainer: node, startOffset: offset } = range;
  if (node.nodeType === 3) return textRect(node, offset, drawn);
  const before = node.childNodes[offset - 1];
  const after = node.childNodes[offset];
  return (before && edgeRect(before, true)) ?? (after && edgeRect(after, false)) ?? node.getBoundingClientRect();
}

function edgeRect(node, end) {
  if (node.nodeType === 3) return textRect(node, end ? node.length : 0);
  if (node.nodeType !== 1) return null;
  const rects = node.getClientRects();
  return rects.length > 0 ? rects[end ? rects.length - 1 : 0] : null;
}

// A caret's place in text: the left edge of the character
// after it (a collapsed range measures the end of the line before at a line wrapped there, wherever
// the caret stands), at the end of the text the right edge of the character before. Where the
// browser wrapped a line, the end of the one and the start of the next are one place: the caret is
// taken at the next line's start (where a range selected stands), or where the browser draws it
// (`drawn`: atLineEnd). In preformatted text (a code block's) a line break is measured itself: before
// one, its own box, at the end of the line it ends (an empty line's too); right after one, the start
// of the next line.
function textRect(node, offset, drawn = false) {
  const pre = preformatted(node);
  if (pre && offset > 0 && node.data[offset - 1] === "\n") return afterBreak(node, offset);
  const wrap = wrapAt(node, offset, pre);
  if (wrap) return drawn && atLineEnd(node, offset) ? caretBox(wrap.before.right, wrap.before) : caretBox(wrap.after.left, wrap.after);
  const after = offset < node.length ? charRect(node, offset) : null;
  if (after) return caretBox(after.left, after);
  const before = offset > 0 ? charRect(node, offset - 1) : null;
  if (before) return caretBox(before.right, before);
  const probe = document.createRange();
  probe.setStart(node, offset);
  probe.collapse(true);
  return probe.getClientRects()[0] ?? null;
}

// The boxes of the characters on both sides of a place in text where the browser wrapped a line (the
// one before on a line above the one after's: between two Chinese characters, after a space, inside
// a long word), or null; never at a line break of preformatted text.
function wrapAt(node, offset, pre = preformatted(node)) {
  if (offset === 0 || offset >= node.length || (pre && (node.data[offset - 1] === "\n" || node.data[offset] === "\n"))) return null;
  const before = charRect(node, offset - 1);
  const after = charRect(node, offset);
  return before && after && after.top >= (before.top + before.bottom) / 2 ? { before, after } : null;
}

// Whether the caret at a wrapped line's end (wrapAt) stands at the end of the line before rather than
// at the start of the next. A range does not tell (the browser's affinity: End, or a click past the
// line's end, puts the caret at the end; a click at the next line's start, Home, the keys and a range
// selected, at the start), the selection does: moved to the start of its line, it stays where it is
// only at that line's start, and from the end it goes back as End takes it there. (Stretched to its
// line's end instead, a caret at the end is left at the next line's start.)
function atLineEnd(node, offset) {
  const selection = getSelection();
  if (!selection.modify || !selection.isCollapsed || selection.anchorNode !== node || selection.anchorOffset !== offset) return false;
  selection.modify("move", "backward", "lineboundary");
  if (selection.anchorNode === node && selection.anchorOffset === offset) return false;
  selection.modify("move", "forward", "lineboundary");
  if (selection.anchorNode !== node || selection.anchorOffset !== offset) selection.collapse(node, offset);
  return true;
}

/**
 * Put the caret at `range`, a place found on the line at height y (the keys', a click's). Where the
 * browser wrapped a line there (wrapAt) the place is also the next line's start, where a range
 * selected stands: on the line before, its end is reached as the browser's End reaches it.
 */
export function selectAt(range, y) {
  select(range);
  const { startContainer: node, startOffset: offset } = range;
  const wrap = node.nodeType === 3 ? wrapAt(node, offset) : null;
  if (!wrap || y >= (wrap.before.bottom + wrap.after.top) / 2) return;
  const selection = getSelection();
  selection.modify?.("move", "backward", "character");
  selection.modify?.("move", "forward", "lineboundary");
}

const caretBox = (x, line) => ({ left: x, right: x, top: line.top, bottom: line.bottom, width: 0, height: line.height });

// Right after a line break of preformatted text: the next character's place, or with none (an empty
// last line) the line below the break's, at the text's left.
function afterBreak(node, offset) {
  const root = editable(node) ?? node.parentElement;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  walker.currentNode = node;
  for (let text = node, at = offset; text; text = walker.nextNode(), at = 0) {
    const rect = at < text.length ? charRect(text, at) : null;
    if (rect) return caretBox(rect.left, rect);
  }
  const rect = charRect(node, offset - 1);
  if (!rect) return null;
  const left = root.getBoundingClientRect().left;
  return { left, right: left, top: rect.bottom, bottom: rect.bottom + rect.height, width: 0, height: rect.height };
}

// The lines of a block that lie below the caret (or above it): where the caret can still move to
// inside the block.
function linesBeyond(host, caret, down) {
  const middle = (rect) => (rect.top + rect.bottom) / 2;
  return lineRects(host).filter((rect) => (down ? middle(rect) > caret.bottom : middle(rect) < caret.top));
}

// The caret is on the first (or last) line when no line of the block lies above (or below) it.
function onEdgeLine(host, caret, down) {
  return !caret || linesBeyond(host, caret, down).length === 0;
}

// The line a caret coming from above (or below) meets first: the top one of `lines` when moving down,
// the bottom one when moving up.
const entryLine = (lines, down) => lines.reduce((a, b) => ((down ? b.top < a.top : b.bottom > a.bottom) ? b : a));

// The caret place on `line` (a line box of the block's own text) at column x, held within the block;
// null when the browser puts it outside the block or in a formula, where nothing can be typed.
function placeOnLine(host, line, x) {
  const { left, right } = ownRect(host);
  const range = onLine(host, { left, right, top: line.top, bottom: line.bottom }, x);
  const node = range && (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement);
  return node && !node.closest("[data-ge-atom]") ? range : null;
}

export function pointRange(x, y) {
  if (document.caretPositionFromPoint) {
    const position = document.caretPositionFromPoint(x, y);
    if (!position) return null;
    const { offsetNode: node, offset } = position;
    if (offset > (node.nodeType === 1 ? node.childNodes.length : node.length)) return null; // on a field holding words, a place in its value, which is no node's
    const range = document.createRange();
    range.setStart(node, offset);
    return range;
  }
  return document.caretRangeFromPoint?.(x, y) ?? null;
}

/**
 * Where a drag from `from` ([node, offset]) reaches with the pointer at (x, y), as [node, offset], or
 * null. On a chip of the text, whose whole it takes as one character, it is the chip's far side from
 * `from`: the browser's own place there comes and goes as the pointer passes the chip's pieces. Beside a
 * chip whose text the browser's place is in (a line ending in it), it is the side the pointer is on.
 */
export function dragPlace(from, x, y) {
  const at = pointRange(x, y);
  const atom = atomOf(document.elementFromPoint(x, y)) ?? atomOf(at?.startContainer);
  if (!atom) return at && [at.startContainer, at.startOffset];
  const { left, right } = atom.getBoundingClientRect();
  const start = document.createRange();
  start.setStart(...from);
  const after = x < left ? false : x > right ? true : start.comparePoint(atom, 0) >= 0;
  return [atom.parentNode, [...atom.parentNode.childNodes].indexOf(atom) + (after ? 1 : 0)];
}

/**
 * A press whose caret the editor placed itself (its mousedown cancelled, so the browser selects
 * nothing as the pointer moves): dragging from it still selects the block's text, from that place
 * to the pointer, until the button is let go. Past the block, text-select/ takes the selection over.
 */
export function followPress(host, anchor) {
  const from = [anchor.startContainer, anchor.startOffset];
  const move = (event) => {
    if (!(event.buttons & 1)) return stop();
    const to = from[0].isConnected ? dragPlace(from, event.clientX, event.clientY) : null;
    if (to && editable(to[0]) === host) getSelection().setBaseAndExtent(...from, ...to);
  };
  const stop = () => {
    removeEventListener("pointermove", move, true);
    removeEventListener("pointerup", stop, true);
  };
  addEventListener("pointermove", move, true);
  addEventListener("pointerup", stop, true);
}

/**
 * Where a press on the text of a block holding chips of the text goes, for the editor to take its drag
 * over (followPress: whole chips, where the browser's selection comes and goes as the pointer passes
 * their pieces): the browser's place, beside a chip when that is in one; null in any other block, or on
 * a chip, which a press puts no caret by.
 */
export function chipsPress(host, x, y) {
  if (!host.querySelector("[data-ge-atom]") || atomOf(document.elementFromPoint(x, y))) return null;
  const at = pointRange(x, y);
  const atom = at && atomOf(at.startContainer);
  if (atom) besideAtom(at, atom, x > atom.getBoundingClientRect().left);
  return at && editable(at.startContainer) === host ? at : null;
}

// A place in a chip's own text taken right after the chip, or right before it.
function besideAtom(range, atom, after) {
  if (after) range.setStartAfter(atom);
  else range.setStartBefore(atom);
  range.collapse(true);
}

/**
 * A press beside a line of a block's own text, on the block's empty space (right of a line that
 * ends early, say): the caret goes where that line is nearest the press, as the browser puts it.
 * Returns that place when the browser would put the caret elsewhere, else null (on the text, not
 * at a line's height, or where the browser gets it right). Chrome does, after a list item's text
 * followed by its lists (not editable): it puts the caret at the start of the line.
 */
export function besideLine(host, x, y) {
  const row = rowAt(host, y);
  if (!row || (x >= row.left && x <= row.right)) return null;
  const nearest = onLine(host, row, x);
  const own = pointRange(x, y);
  if (!nearest || (own && own.startContainer === nearest.startContainer && own.startOffset === nearest.startOffset)) return null;
  // Beside a chip the browser's nearest place is in its own text: the place beside it.
  const atom = atomOf(nearest.startContainer);
  if (atom) besideAtom(nearest, atom, x > row.left);
  return nearest;
}

/** The place on the line of a block's own text nearest to (x, y): that line's, or the nearest line's. */
export function nearestOnLine(host, x, y) {
  const row = rowAt(host, y, true);
  return row && onLine(host, row, x);
}

// The line of a block's own text at height y ({ left, right, top, bottom } over its pieces): the
// one at that height, or with `near`, else the nearest one.
function rowAt(host, y, near = false) {
  const lines = lineRects(host);
  const gap = (rect) => Math.max(rect.top - y, y - rect.bottom, 0);
  const line = lines.find((rect) => gap(rect) === 0) ?? (near && lines.length > 0 ? lines.reduce((a, b) => (gap(b) < gap(a) ? b : a)) : null);
  if (!line) return null;
  const row = lines.filter((rect) => rect.top < line.bottom && rect.bottom > line.top);
  return { left: Math.min(...row.map((rect) => rect.left)), right: Math.max(...row.map((rect) => rect.right)), top: line.top, bottom: line.bottom };
}

// The caret place on a line nearest to x (the point taken onto the line, where the browser finds it).
function onLine(host, row, x) {
  const range = pointRange(within(x, row), (row.top + row.bottom) / 2);
  return range && host.contains(range.startContainer) ? range : null;
}

// Put the caret into the target block at the same horizontal position, on its first line when
// moving down and its last line when moving up. A code block not open yet
// opens (`open`) with the caret there.
function placeAt(target, x, down) {
  target.scrollIntoView({ block: "nearest", inline: "nearest" });
  const lines = lineRects(target);
  const line = lines.length > 0 ? entryLine(lines, down) : null;
  if (closedCode(target)) return openCode(target, line, x);
  const range = x === undefined || !line ? null : placeOnLine(target, line, x);
  if (!range) return caretAt(target, down ? "start" : "end");
  target.focus({ preventScroll: true });
  range.collapse(true);
  selectAt(range, (line.top + line.bottom) / 2);
}

// A code block opened from the keys, as a press on it would (its component's `openAt`), the caret at
// column x on `line` (a line box of its code), held within that line's row (x Infinity: the row's
// end); at the code's start with no line.
function openCode(pre, line, x) {
  const open = (at, point) => pageAt(at)?.openAt?.(at, point);
  if (!line) return void open(pre, null);
  const row = lineRects(pre).filter((rect) => rect.top < line.bottom && rect.bottom > line.top);
  const left = Math.min(...row.map((rect) => rect.left));
  const right = Math.max(...row.map((rect) => rect.right));
  open(pre, { x: within(x, { left, right }), y: (line.top + line.bottom) / 2 });
}

// Column x held inside a row's ends (just inside, where the browser finds the place there); the
// row's start for an empty line (a box of no width).
const within = (x, { left, right }) => (right - left > 2 ? Math.min(Math.max(x, left + 1), right - 1) : left);

// Show a line the caret was put on without the browser's help (it scrolls only for its own moves):
// in the page, or in an open modal dialog's content, which scrolls by itself. The room kept clear at
// the edges is the one the browser keeps when it follows the caret there, the box's scroll-padding
// (a detail card's content keeps its padding, so a line of its last block takes it to its end), else
// `margin`.
export function reveal(host, line, margin = 24) {
  const scroller = host.closest(DIALOG.openContent);
  const view = scroller ? scroller.getBoundingClientRect() : { top: 0, bottom: innerHeight };
  const style = getComputedStyle(scroller ?? document.documentElement);
  const above = kept(style.scrollPaddingTop, margin);
  const below = kept(style.scrollPaddingBottom, margin);
  const exact = line.bottom > view.bottom - below ? line.bottom - view.bottom + below : line.top < view.top + above ? line.top - view.top - above : 0;
  // Whole pixels, away from the line: a scroll by a fraction is rounded by the browser, and rounded
  // down it left a line at the window's bottom a fraction of a pixel past it.
  const delta = exact > 0 ? Math.ceil(exact) : Math.floor(exact);
  if (!delta) return;
  if (scroller) scroller.scrollTop += delta;
  else scrollBy(0, delta);
}

const kept = (padding, margin) => (padding === "auto" ? margin : parseFloat(padding) || 0);

/**
 * The caret shown after text went in, as the browser shows it after a key (reveal, with no room of
 * the page's own): Chrome follows an input method's composition as it is typed but not the text that
 * replaces it, so a phrase put in that wrapped onto a new line stood in a detail card's padding, or
 * below the page's edge, until the next key. After a key the browser has shown it already: nothing moves.
 */
export function showCaret() {
  const selection = getSelection();
  const host = selection.rangeCount && selection.isCollapsed ? editable(selection.anchorNode) : null;
  if (!host) return;
  const rect = caretRect(selection.getRangeAt(0), true);
  if (rect && (rect.top !== 0 || rect.bottom !== 0)) reveal(host, rect, 0);
  showEnd();
}

/**
 * A detail card's content taken to its very end when the caret is in its last block and that
 * block's end is in view (the user's ask of 2026-10-23: the padding under the last block shown,
 * never the block stopped against the card's bottom edge with more to scroll). A line of text gets
 * there by the content's scroll-padding (dialog.css), the room the browser and reveal keep under the
 * caret's line; a component holds room of its own under its last line (a code block's, a highlight
 * block's or a callout's, a table's last row), and the content stopped that much short of its end.
 * The caret's line stays in view. Run when the caret is put in a block (caretAt), after a key
 * (followEnd) and after text put in (showCaret).
 */
export function showEnd() {
  const selection = getSelection();
  const host = selection.rangeCount ? editable(selection.focusNode) : null;
  const scroller = host?.closest(DIALOG.openContent);
  if (!scroller) return;
  const rest = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
  const last = [...scroller.children].findLast((node) => node.getClientRects().length > 0);
  const view = scroller.getBoundingClientRect();
  if (rest < 1 || !last?.contains(host) || last.getBoundingClientRect().bottom > view.bottom + 1) return;
  const caret = document.createRange();
  caret.setStart(selection.focusNode, selection.focusOffset);
  const line = caretRect(caret, true);
  const room = line.top || line.bottom ? line.top - view.top - kept(getComputedStyle(scroller).scrollPaddingTop, 0) : rest;
  if (room > 0) scroller.scrollTop += Math.min(rest, room);
}

// After a key, once the browser has followed the caret (before the frame is drawn): showEnd.
let endFrame = 0;

/** A key pressed in an open detail card: its content taken to its end after it where showEnd says. */
export function followEnd() {
  if (endFrame || !document.querySelector(DIALOG.open)) return;
  endFrame = requestAnimationFrame(() => {
    endFrame = 0;
    showEnd();
  });
}

// The next line of the same block at column x, for a caret that left its column on a short line
// (the browser would keep the caret's own column instead).
function lineStep(host, caret, x, down) {
  const lines = linesBeyond(host, caret, down);
  const line = lines.length > 0 ? entryLine(lines, down) : null;
  const range = line && placeOnLine(host, line, x);
  if (!range) return false;
  range.collapse(true);
  selectAt(range, (line.top + line.bottom) / 2);
  reveal(host, line);
  return true;
}

// The column a run of ↑/↓ presses keeps, as in any text editor: passing a short line (in a
// block, or a short block) does not pull the caret left for the lines after it. Any other key,
// a click or typing ends the run.
let goalX = null;

/** Any key but ↑/↓, a click or typing ends a run of ↑/↓ presses. */
export function endArrowRun() {
  goalX = null;
}

/**
 * ←/→ at a block's edge, ↑/↓ on its first or last line: the caret into the block before or after it
 * in the page's order (places()): ← at the end of the one
 * before, → at the start of the one after, ↑ on the last line of the one before and ↓ on the first
 * line of the one after, at the column a run of ↑/↓ began at. Blocks with no text (a divider, a
 * picture, a card) are passed over; columns go one after the other. In a table ←/→ go cell by cell,
 * row by row, and ↑/↓ to the cell above or below in the column (the user's rule: vertical()).
 * Inside a block ↑/↓ are the browser's, but past a line shorter than that column (lineStep). Returns whether it moved the caret.
 */
export function arrow(host, key) {
  const selection = getSelection();
  if (!selection.rangeCount || !selection.isCollapsed) return false;
  if (key === "ArrowLeft" || key === "ArrowRight") {
    const forward = key === "ArrowRight";
    if (!atEdge(host, forward)) return false;
    const target = step(host, forward);
    if (!target) return false;
    if (!closedCode(target)) caretAt(target, forward ? "start" : "end");
    else {
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
      const lines = lineRects(target);
      openCode(target, forward || lines.length === 0 ? null : entryLine(lines, false), Infinity);
    }
    return true;
  }
  const down = key === "ArrowDown";
  const caret = caretRect(selection.getRangeAt(0), true);
  const x = goalX ?? caret?.left ?? host.getBoundingClientRect().left;
  goalX = x;
  if (!onEdgeLine(host, caret, down)) return caret && Math.abs(caret.left - x) > 2 ? lineStep(host, caret, x, down) : false;
  const target = vertical(host, x, down);
  if (!target) return false;
  placeAt(target, x, down, open);
  return true;
}

// Where ↑/↓ take the caret from a block's first or last line. From a table's cell: the cell above or
// below it in the column at x (the table's slots, shared/table-slots.mjs: from a merged cell the row
// past all of its rows, among the cells under its columns the one at x; a merged cell once), and from
// the first row up (the last row down) the place before (after) the table. Into a table from the
// place before it, its first row's cell at x; from the place after it, its last row's. Elsewhere, or
// in a table whose cells tile no rectangle, the place before or after (step).
function vertical(host, x, down) {
  const grid = gridOf(host);
  const place = grid?.slots.places.get(host);
  const inside = place ? inColumn(grid, down ? place.r + place.rows : place.r - 1, place, x, down) : null;
  if (inside) return inside;
  const target = step(place ? grid.table : host, down);
  const entered = gridOf(target);
  if (!entered || entered.table === grid?.table) return target;
  return inColumn(entered, down ? 0 : entered.slots.matrix.length - 1, { c: 0, cols: entered.slots.columns }, x, down) ?? target;
}

// A table cell's table and slots ({ table, slots }), or null (not a cell, or cells that tile no rectangle).
function gridOf(node) {
  if (node?.localName !== "td" && node?.localName !== "th") return null;
  const table = node.closest("table");
  const slots = table ? slotsOf([...table.rows]) : null;
  return slots?.places.has(node) ? { table, slots } : null;
}

// The cell the caret goes into from row r on (down: r and the rows after it; up: r and the ones
// before), under the columns of `span` ({ c, cols }): in the first row with one the keys reach
// (places()), the one whose box holds x, else the nearest to x; null past the table's end.
function inColumn({ slots }, r, span, x, down) {
  const reach = new Set(places());
  const gap = (cell) => {
    const { left, right } = cell.getBoundingClientRect();
    return x < left ? left - x : x >= right ? x - right + 1 : 0;
  };
  for (; r >= 0 && r < slots.matrix.length; r += down ? 1 : -1) {
    const cells = [...new Set(slots.matrix[r].slice(span.c, span.c + span.cols))].filter((cell) => reach.has(cell));
    if (cells.length > 0) return cells.reduce((a, b) => (gap(b) < gap(a) ? b : a));
  }
  return null;
}

// The place before or after `host` (places()), or null; from a block the keys pass over (a formula
// block holding the caret), the nearest one on that side.
function step(host, forward) {
  const list = places();
  const index = list.indexOf(host);
  if (index >= 0) return list[index + (forward ? 1 : -1)] ?? null;
  return (forward ? list.find((node) => inOrder(host, node) < 0 && !host.contains(node)) : list.findLast((node) => inOrder(node, host) < 0 && !node.contains(host))) ?? null;
}
