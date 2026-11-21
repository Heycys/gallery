import { isPad } from "../pads.mjs";

// The words an Agent took out of a text block, shown where they were (docs/editor.md "Agent's
// changes"): an empty inline span of the editor's own in the block's text (`span.ge-diff-del`,
// `data-ge-gone-words` holding the words, drawn by its ::before, contenteditable="false",
// aria-hidden, data-doc-dev). It holds no text node, so whatever reads the block's words (its
// textContent, a selection's text, readText, the search, the outline, a copy's plain text) reads none
// of them; what reads its markup leaves it out (core.mjs serializeNodes, writing the text on either side
// of it as one; ownHTML, which undo records; a copy's clipboard.own, which drops data-doc-dev). Put in, it
// splits the text node it stands in (the live ranges, the selection and the added words' highlight
// among them, follow); taken out, the two halves are one text node again, the caret where it was (and
// the live ranges it is given: a selection across blocks', which keeps its ends as points of its own).

const ATTRIBUTE = "data-ge-gone-words";

/**
 * A mark of `words` taken out (not on the page yet). `before`, `after`: the characters of the text on
 * either side of where it goes. A space at either end of the words is drawn apart from them, neither
 * struck nor filled (data-ge-gone-lead, -tail), and only where the text beside has none: "words
 * [that were removed] stay", never a struck space.
 */
export function goneMark(words, doc = document, { before, after } = {}) {
  const span = doc.createElement("span");
  span.className = "ge-diff-del";
  const bare = words.trim();
  span.setAttribute(ATTRIBUTE, bare || words);
  if (bare && /^\s/.test(words) && before !== undefined && !/\s/.test(before)) span.setAttribute("data-ge-gone-lead", "");
  if (bare && /\s$/.test(words) && after !== undefined && !/\s/.test(after)) span.setAttribute("data-ge-gone-tail", "");
  span.setAttribute("contenteditable", "false");
  span.setAttribute("aria-hidden", "true");
  span.setAttribute("data-doc-dev", "");
  return span;
}

/**
 * Where words taken out at character `at` of `read` (annotate/anchors.mjs readText of the block)
 * stand: before that character, or after the one before it when it is a line's end or there is
 * none (the words taken out at the block's end). { place, side }, or null for a block with no text.
 */
export function placeOf(read, at) {
  if (read.at[at]) return { place: read.at[at], side: "before" };
  if (at > 0 && read.at[at - 1]) return { place: read.at[at - 1], side: "after" };
  for (let index = at + 1; index < read.at.length; index++) if (read.at[index]) return { place: read.at[index], side: "before" };
  for (let index = Math.min(at, read.at.length) - 1; index >= 0; index--) if (read.at[index]) return { place: read.at[index], side: "after" };
  return null;
}

/** Put `mark` at `where` (placeOf): in a text node split there, or beside a formula or a chip, never inside one. */
export function putMark(mark, { place, side }) {
  if (place.node) {
    const { node } = place;
    const at = side === "before" ? place.offset : place.offset + 1;
    if (at <= 0) node.before(mark);
    else if (at >= node.length) node.after(mark);
    else node.splitText(at).before(mark);
    return;
  }
  const beside = place.element.closest("[data-ge-atom]") ?? place.element;
  if (side === "before") beside.before(mark);
  else beside.after(mark);
}

/**
 * Take `mark` off the page, the text on either side of it one text node again, the selection where it
 * was, and so each of `ranges` (live ranges a tool keeps: a selection across blocks' pieces,
 * text-select/), whose ends in the second half would otherwise fall out of the text with it.
 */
export function takeMark(mark, ranges = []) {
  const first = mark.previousSibling;
  const second = mark.nextSibling;
  mark.remove();
  if (first?.nodeType !== 3 || second?.nodeType !== 3 || isPad(first) || isPad(second)) return;
  const selection = first.ownerDocument.getSelection();
  const { anchorNode, anchorOffset, focusNode, focusOffset } = selection;
  const length = first.length;
  const held = ranges.map((range) => [range, range.startContainer === second ? range.startOffset : -1, range.endContainer === second ? range.endOffset : -1]);
  first.appendData(second.data);
  second.remove();
  for (const [range, start, end] of held) {
    if (start >= 0) range.setStart(first, length + start);
    if (end >= 0) range.setEnd(first, length + end);
  }
  if (anchorNode !== second && focusNode !== second) return; // where it is still says the same (a point in `first`, or in their parent)
  const point = (node, offset) => (node === second ? [first, length + offset] : [node, offset]);
  selection.setBaseAndExtent(...point(anchorNode, anchorOffset), ...point(focusNode, focusOffset));
}

// The reader edits a block holding marks: they go first, before the edit touches it (changes/index.mjs).
// A key edits unless it only moves the caret or the view, or copies, selects all, finds, saves or prints.
const MOVES = /^(Arrow(Up|Down|Left|Right)|Home|End|PageUp|PageDown|Escape|Shift|Control|Alt|Meta|AltGraph|CapsLock|NumLock|ScrollLock|ContextMenu|F\d{1,2})$/;
const KEEPS = /^[acfsp]$/;

/** Whether a keydown may edit the block the caret is in (an input method's Process key does). */
export const editsBy = (event) => !MOVES.test(event.key) && !((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && KEEPS.test(event.key));
