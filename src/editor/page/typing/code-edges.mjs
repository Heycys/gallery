import { isPad, padCaret } from "../pads.mjs";
import { ZWSP, blank } from "../../../shared/inline-spacing.mjs";
import { editable, pointRange, select } from "../caret.mjs";
import { ENTRIES } from "../../components/registry.mjs";

// Inline code's edges: each of its edges has two caret stops, outside it, where what
// is typed is plain text, and inside it, where it is code (its padding sets them apart). ←/→ step
// through both, and across a space between two pieces of code stop outside each; a press lands on
// the side of the edge it was made on at once (codePress); and the caret types on the side it
// shows on. The browser alone keeps neither the stop after the code (what is typed there goes into
// the code) nor the one inside at its start (typed there it goes before the code), so those hold
// the caret in a pad (pads.mjs). Code blocks are text blocks of their own (components/code/) and
// have none of this. A component's entry in the text (`entry`: a chip as padded as code) has the
// same stops, and Backspace at the stop after it (Delete at the one before it) takes the whole
// entry away (takeEntry, on the key's keydown through beforeDelete and on its beforeinput where an
// input method's keydown says 229; it says what the page says of that, editor.mjs records the step).
// A Backspace that takes the last character between inline code or an entry and the caret after it
// leaves the caret outside it, at the stop after it (deletingBack, deletedBack): the browser puts it
// in at the end (an entry's: left of its icon), its end and the text after it one place to it.

const EDGED = ["code", ...ENTRIES.map(({ at }) => at)].join(", ");
const isEdged = (node) => node?.nodeType === 1 && node.matches(EDGED);
const entryOf = (node) => (node?.nodeType === 1 ? ENTRIES.find(({ at }) => node.matches(at)) : undefined);

// A text node with more than a pad's space in it.
const real = (node) => node.nodeType === 3 && !blank(node);
const textOf = (range) => range.toString().replaceAll(ZWSP, "");

// The node right before or after a caret at (node, offset) outside code, pads and empty text
// skipped; null when there is text in between.
function besides(node, offset, after) {
  let from;
  if (node.nodeType === 3) {
    const rest = after ? node.data.slice(offset) : node.data.slice(0, offset);
    if (rest.replaceAll(ZWSP, "") !== "") return null;
    from = after ? node.nextSibling : node.previousSibling;
  } else from = after ? node.childNodes[offset] : node.childNodes[offset - 1];
  while (from && from.nodeType === 3 && !real(from)) from = after ? from.nextSibling : from.previousSibling;
  return from ?? null;
}

/**
 * Where a collapsed caret stands at an edge of inline code: { code, side: "start" | "end", inside,
 * padded }, or null away from any edge.
 */
function edgeAt(host, node, offset) {
  const element = node.nodeType === 1 ? node : node.parentElement;
  const code = element.closest(EDGED);
  const padded = isPad(node);
  if (code && host.contains(code) && code !== host) {
    const range = host.ownerDocument.createRange();
    range.selectNodeContents(code);
    range.setEnd(node, offset);
    if (textOf(range) === "") return { code, side: "start", inside: true, padded };
    range.selectNodeContents(code);
    range.setStart(node, offset);
    if (textOf(range) === "") return { code, side: "end", inside: true, padded };
    return null;
  }
  const before = besides(node, offset, false);
  if (isEdged(before) && host.contains(before)) return { code: before, side: "end", inside: false, padded };
  const after = besides(node, offset, true);
  if (isEdged(after) && host.contains(after)) return { code: after, side: "start", inside: false, padded };
  return null;
}

const caretAtEdge = (host) => {
  const selection = getSelection();
  if (!selection.rangeCount || !selection.isCollapsed || !host.contains(selection.anchorNode)) return null;
  return edgeAt(host, selection.anchorNode, selection.anchorOffset);
};

// The stops: inside at the end is where the browser keeps the caret anyway; the other three may
// need a pad.
function insideEnd(code) {
  const texts = [];
  const walker = code.ownerDocument.createTreeWalker(code, NodeFilter.SHOW_TEXT);
  for (let node; (node = walker.nextNode());) if (real(node)) texts.push(node);
  const last = texts.at(-1);
  if (!last) return padCaret(code, "start");
  const caret = code.ownerDocument.createRange();
  caret.setStart(last, last.data.length);
  caret.collapse(true);
  select(caret);
}
function outsideBefore(code) {
  const before = code.previousSibling;
  if (before?.nodeType === 3 && real(before)) {
    const caret = code.ownerDocument.createRange();
    caret.setStart(before, before.data.length);
    caret.collapse(true);
    return select(caret);
  }
  padCaret(code, "before"); // nothing to hold the caret before the code: typed there it would go in
}

// A caret one character from an edge, on the side the arrow (`right`) moves towards it: the stop on
// this side of the edge it lands on (the browser would put it on the other side), or null.
function nearEdge(host, node, offset, right) {
  const chars = (text) => [...text.replaceAll(ZWSP, "")].length;
  const element = node.nodeType === 1 ? node : node.parentElement;
  const code = element.closest(EDGED);
  if (code && host.contains(code) && code !== host) {
    const range = host.ownerDocument.createRange();
    range.selectNodeContents(code);
    if (right) range.setStart(node, offset);
    else range.setEnd(node, offset);
    if (chars(range.toString()) !== 1) return null;
    return right ? () => insideEnd(code) : () => padCaret(code, "start");
  }
  if (node.nodeType !== 3) return null;
  let next = right ? node.nextSibling : node.previousSibling;
  while (next && next.nodeType === 3 && !real(next)) next = right ? next.nextSibling : next.previousSibling;
  if (!isEdged(next) || chars(right ? node.data.slice(offset) : node.data.slice(0, offset)) !== 1) return null;
  return right ? () => outsideBefore(next) : () => padCaret(next, "after");
}

/**
 * ←/→ at an edge of inline code: the stop outside it, or inside it; and one character from an
 * edge, the stop on this side of it. Returns true when handled.
 */
export function codeArrow(host, key) {
  if (key !== "ArrowLeft" && key !== "ArrowRight") return false;
  const selection = getSelection();
  if (!selection.rangeCount || !selection.isCollapsed || !host.contains(selection.anchorNode)) return false;
  const right = key === "ArrowRight";
  const edge = edgeAt(host, selection.anchorNode, selection.anchorOffset);
  if (edge) {
    const { code, side, inside } = edge;
    if (right && side === "end" && inside) padCaret(code, "after");
    else if (right && side === "start" && !inside) padCaret(code, "start");
    else if (!right && side === "end" && !inside) insideEnd(code);
    else if (!right && side === "start" && inside) outsideBefore(code);
    // Moving away from this edge, the caret may come one character from another: the space between
    // two pieces of code, ← from before the second stops after the first, not inside it.
    if (side === "end" ? right === inside : right !== inside) return true;
  }
  const move = nearEdge(host, selection.anchorNode, selection.anchorOffset, right);
  if (!move) return false;
  move();
  return true;
}

/**
 * A caret that shows on one side of an edge but would type on the other goes into a pad on the
 * side it shows on (after a move, typing or the browser's own placement): after the code, and
 * inside at its start. (selectionchange)
 */
export function settleCodeEdge(host) {
  const edge = host && caretAtEdge(host);
  if (!edge || edge.padded) return;
  if (edge.side === "end" && !edge.inside) padCaret(edge.code, "after");
  else if (edge.side === "start" && edge.inside) padCaret(edge.code, "start");
  else if (edge.side === "start" && !edge.inside && !(edge.code.previousSibling && real(edge.code.previousSibling))) padCaret(edge.code, "before");
}

// The stop on the side of an edge a press or click at `x` was made on: outside past the code's box
// (its margin, or the space beside it), inside within it.
function stopAt(edge, x) {
  const rects = [...edge.code.getClientRects()];
  if (rects.length === 0) return false;
  if (edge.side === "end") {
    if (x >= rects.at(-1).right) padCaret(edge.code, "after");
    else insideEnd(edge.code);
  } else if (x <= rects[0].left) outsideBefore(edge.code);
  else padCaret(edge.code, "start");
  return true;
}

/** A click (`x`) that put the caret at an edge of inline code: the stop on the side it was made on. */
export function codeClick(host, x) {
  const edge = caretAtEdge(host);
  if (edge) stopAt(edge, x);
}

/**
 * A mouse press at an edge of inline code (beside it, on its margin or a space next to it): the
 * caret goes to the stop on that side at once. The browser would put it inside the code first (its
 * end and the text after it are one place to it) and it would jump out on release, a flash. Returns
 * the caret's range when it placed it (the caller cancels the press and follows the drag), else null.
 */
export function codePress(host, x, y) {
  const at = pointRange(x, y);
  if (!at || editable(at.startContainer) !== host) return null;
  const edge = edgeAt(host, at.startContainer, at.startOffset);
  if (!edge) return null;
  host.focus({ preventScroll: true });
  if (!stopAt(edge, x)) return null;
  const selection = getSelection();
  return selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
}

/**
 * Backspace (`back`) at the stop after a component's entry, or Delete at the one before it: the whole
 * entry goes, as a chip of the text does, the caret where it stood, and what the page says of that is
 * returned; nothing otherwise. The keydown's (beforeDelete) and the beforeinput's, for a key whose
 * keydown the editor passed by (an input method's, keyCode 229: editor.mjs). The pads beside it go
 * with it, before the text either side of it is joined, so that no zero-width space is left in that
 * text (a pad an undo step put back is part of the text beside it by then).
 */
export function takeEntry(host, back) {
  const selection = getSelection();
  if (!selection.rangeCount || !selection.isCollapsed) return;
  const outside = caretAtEdge(host);
  const entry = outside && !outside.inside ? entryOf(outside.code) : undefined;
  if (!entry || (back ? outside.side !== "end" : outside.side !== "start")) return;
  const { code } = outside;
  for (const [next, trim] of [["previousSibling", new RegExp(`${ZWSP}+$`)], ["nextSibling", new RegExp(`^${ZWSP}+`)]]) {
    for (let node = code[next]; node?.nodeType === 3; node = code[next]) {
      node.data = node.data.replace(trim, "");
      if (node.data !== "") break;
      node.remove();
    }
  }
  const caret = host.ownerDocument.createRange();
  caret.setStartBefore(code);
  caret.collapse(true);
  code.remove();
  host.normalize();
  select(caret);
  return entry.removed;
}

/**
 * Backspace or Delete with the caret in a pad at an edge: the pad goes first, the caret where the
 * key then takes the character beside it, as it would without the pad (keydown, before the browser
 * deletes or the editor merges blocks). At the stop beside a component's entry the whole entry goes
 * (takeEntry), and what the page says of that is returned; nothing otherwise.
 */
export function beforeDelete(host, key) {
  const back = key === "Backspace";
  const removed = takeEntry(host, back);
  if (removed) return removed;
  const selection = getSelection();
  if (!selection.rangeCount || !selection.isCollapsed) return;
  const pad = selection.anchorNode;
  if (!isPad(pad) || !host.contains(pad)) return;
  const edge = caretAtEdge(host);
  if (!edge) return;
  const { code, side } = edge;
  pad.remove();
  if (side === "end" && back) {
    insideEnd(code);
    return;
  }
  const caret = host.ownerDocument.createRange();
  if (side === "end") caret.setStartAfter(code); // Delete after the code: what follows it
  else if (back) caret.setStartBefore(code); // Backspace at its start: what precedes it
  else caret.selectNodeContents(code); // Delete at its start: its first character
  caret.collapse(true);
  select(caret);
}

// The host whose caret a deletion backward found in text outside any inline code or entry (no pad),
// for the input after it (deletedBack).
let backFrom = null;

/** A deletion backward about to happen (its beforeinput): where the caret stands, for deletedBack. */
export function deletingBack(host) {
  const selection = getSelection();
  const node = selection.rangeCount && selection.isCollapsed ? selection.anchorNode : null;
  backFrom = node?.nodeType === 3 && !isPad(node) && !node.parentElement.closest(EDGED) ? host : null;
}

/**
 * The deletion done (its input): a caret it took from the text after inline code or an entry into
 * it, at its end, goes back out to the stop after it, where the reader deleting back stays.
 */
export function deletedBack(host) {
  const was = backFrom === host;
  backFrom = null;
  const edge = was && caretAtEdge(host);
  if (edge && edge.inside && edge.side === "end") padCaret(edge.code, "after");
}
