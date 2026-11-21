// Inline formatting of a selection inside one block: bold, italic, underline, strikethrough, inline
// code, text color and highlight (DOM only; tested with jsdom). Only the selected part is split
// and wrapped, so the rest of the block keeps its markup, including the author's attributes, as
// it was.

import { COLOR_NAMES } from "../../shared/colors.mjs";
import { HELD_TAGS } from "../../shared/components/list.mjs";
import { ZWSP, blank } from "../../shared/inline-spacing.mjs";

// The kit's nine colors (styles/base.css, src/shared/colors.mjs), in the order the toolbar's panel shows them.
export const TEXT_COLORS = COLOR_NAMES;
export const HIGHLIGHTS = TEXT_COLORS;
const INK = new RegExp(`^doc-(text-(${TEXT_COLORS.join("|")})|highlight-(${HIGHLIGHTS.join("|")}))$`);

/** A class of the shared kit's text colors and highlights (kept by the serializer and the server). */
export const isInkClass = (name) => INK.test(name);

// What an underline's line may take besides its default, red and 2px (styles/base.css): a color
// ("plain": the text's own) and a weight, each a class of the u element itself.
export const UNDERLINE_COLORS = ["orange", "blue", "purple", "plain"];
export const UNDERLINE_WEIGHTS = ["thin", "thick"]; // 1px, 3px
const UNDERLINE_CLASS = new RegExp(`^doc-underline-(${[...UNDERLINE_COLORS, ...UNDERLINE_WEIGHTS].join("|")})$`);

/** A class of the kit's underline colors and weights (kept by the serializer on a u). */
export const isUnderlineClass = (name) => UNDERLINE_CLASS.test(name);

// Tag families are on or off; color families carry a value (the color name) as a span's class;
// an underline's color and weight are facets of the u element itself, a class each ("default":
// none, the red and 2px), the values each takes listed in `own`.
const FAMILIES = {
  bold: { tags: ["STRONG", "B"], tag: "strong" },
  italic: { tags: ["EM", "I"], tag: "em" },
  underline: { tags: ["U"], tag: "u" },
  strike: { tags: ["S", "STRIKE", "DEL"], tag: "s" },
  code: { tags: ["CODE"], tag: "code" },
  text: { prefix: "doc-text-" },
  highlight: { prefix: "doc-highlight-" },
  underlineColor: { tags: ["U"], tag: "u", prefix: "doc-underline-", own: UNDERLINE_COLORS },
  underlineWeight: { tags: ["U"], tag: "u", prefix: "doc-underline-", own: UNDERLINE_WEIGHTS },
};
const ATOM = "[data-ge-atom]";

// The family's value carried by this element, or null.
function valueIn(element, family) {
  if (element.nodeType !== 1 || element.hasAttribute("data-ge-atom")) return null;
  if (family.own) {
    if (!family.tags.includes(element.tagName)) return null;
    const name = [...element.classList].find((entry) => entry.startsWith(family.prefix) && family.own.includes(entry.slice(family.prefix.length)));
    return name ? name.slice(family.prefix.length) : "default";
  }
  if (family.tags) return family.tags.includes(element.tagName) ? true : null;
  if (element.tagName !== "SPAN") return null;
  const name = [...element.classList].find((entry) => entry.startsWith(family.prefix) && isInkClass(entry));
  return name ? name.slice(family.prefix.length) : null;
}

// Elements of the block's own markup (not the rendered insides of formula chips).
const inlineElements = (host) => [...host.querySelectorAll("*")].filter((node) => !node.parentElement.closest(ATOM));

// Text nodes and formula chips with at least one character inside the range, in document order.
function leavesIn(host, range) {
  const leaves = [];
  const visit = (node) => {
    for (const child of node.childNodes) {
      if (!range.intersectsNode(child)) continue;
      if (child.nodeType === 3) {
        const start = child === range.startContainer ? range.startOffset : 0;
        const end = child === range.endContainer ? range.endOffset : child.length;
        if (end > start) leaves.push({ node: child, size: end - start });
      } else if (child.nodeType === 1) {
        if (child.hasAttribute("data-ge-atom")) leaves.push({ node: child, size: 1 });
        else visit(child);
      }
    }
  };
  visit(host);
  return leaves;
}

/**
 * The value every selected character shares for a family: true for bold, italic or code, the
 * color name for text and highlight; null when some character lacks it or values differ.
 */
export function markValue(host, range, name) {
  const family = FAMILIES[name];
  let shared = null;
  for (const [index, { node }] of leavesIn(host, fit(host, range)).entries()) {
    let value = null;
    for (let parent = node.parentNode; parent && parent !== host && value === null; parent = parent.parentNode) value = valueIn(parent, family);
    if (value === null || (index > 0 && value !== shared)) return null;
    shared = value;
  }
  return shared;
}

/** Whether text typed at `node` (a point of the caret, in `host`) lands inside an element of a tag family (bold, italic, underline, strike, code): what the browser gives it. */
export function markAround(host, node, name) {
  const family = FAMILIES[name];
  for (let parent = node.nodeType === 3 ? node.parentNode : node; parent && parent !== host; parent = parent.parentNode) if (valueIn(parent, family) === true) return true;
  return false;
}

/**
 * Set a family on the selected text: `value` true or a color name applies it (replacing another
 * color; for an underline's facets, "default" is the red and 2px), false or null removes it.
 * Returns the range covering the same text afterwards.
 */
export function formatRange(host, range, name, value) {
  const family = FAMILIES[name];
  const doc = host.ownerDocument;
  // The other facet of an underline (its weight when its color changes, and the other way round)
  // stays as the selected text had it.
  const kept = family.own ? Object.entries(FAMILIES)
    .filter(([, other]) => other.own && other !== family && other.tag === family.tag)
    .map(([other, facet]) => [facet, markValue(host, range, other)]) : [];
  dropPads(host, range);
  const selection = fit(host, range);
  if (selection.collapsed) return selection;
  const start = doc.createComment("");
  const end = doc.createComment("");
  const tail = selection.cloneRange();
  tail.collapse(false);
  tail.insertNode(end);
  selection.insertNode(start);

  // No element of the family may straddle a boundary: split it there.
  for (const marker of [start, end]) {
    const ancestors = [];
    for (let node = marker.parentNode; node !== host; node = node.parentNode) ancestors.push(node);
    for (const ancestor of ancestors) if (valueIn(ancestor, family) !== null) splitAround(ancestor, marker);
  }
  const between = () => {
    const inner = doc.createRange();
    inner.setStartAfter(start);
    inner.setEndBefore(end);
    return inner;
  };
  const inside = between();
  for (const element of inlineElements(host)) {
    if (valueIn(element, family) !== null && contains(inside, element)) strip(element, family);
  }
  if (value !== null && value !== false) {
    const wrapper = doc.createElement(family.tag ?? "span");
    const classes = family.prefix && value !== "default" ? [family.prefix + value] : [];
    for (const [facet, facetValue] of kept) if (facetValue && facetValue !== "default") classes.push(facet.prefix + facetValue);
    if (classes.length > 0) wrapper.className = classes.join(" ");
    const content = between();
    wrapper.append(content.extractContents());
    content.insertNode(wrapper);
  }

  // Remember the selection as character offsets, tidy up, and find it again.
  const offsets = [offsetAt(host, start.parentNode, indexOf(start)), offsetAt(host, end.parentNode, indexOf(end))];
  start.remove();
  end.remove();
  tidy(host, family);
  return rangeAt(host, offsets);
}

/** A range as character offsets in the block (a formula counts as one), e.g. to restore it after undo. */
export function rangeOffsets(host, range) {
  const fitted = fit(host, range);
  return [offsetAt(host, fitted.startContainer, fitted.startOffset), offsetAt(host, fitted.endContainer, fitted.endOffset)];
}

export function rangeAt(host, [from, to]) {
  const range = host.ownerDocument.createRange();
  range.setStart(...pointAt(host, from, true));
  range.setEnd(...pointAt(host, to, false));
  return range;
}

// The range inside the block, with no boundary inside a formula chip.
function fit(host, range) {
  const fitted = range.cloneRange();
  if (!host.contains(fitted.startContainer)) fitted.setStart(host, 0);
  if (!host.contains(fitted.endContainer)) fitted.setEnd(host, ownEnd(host));
  const atom = (node) => (node.nodeType === 1 ? node : node.parentElement)?.closest(ATOM);
  const first = atom(fitted.startContainer);
  if (first && host.contains(first)) fitted.setStartBefore(first);
  const last = atom(fitted.endContainer);
  if (last && host.contains(last)) fitted.setEndAfter(last);
  return fitted;
}

// Split `element` at `marker` into two copies and leave the marker between them.
function splitAround(element, marker) {
  const tail = element.ownerDocument.createRange();
  tail.setStartAfter(marker);
  tail.setEnd(element, element.childNodes.length);
  const rest = element.cloneNode(false);
  rest.append(tail.extractContents());
  element.after(marker, rest);
}

const indexOf = (node) => [...node.parentNode.childNodes].indexOf(node);

function contains(range, node) {
  const index = indexOf(node);
  return range.comparePoint(node.parentNode, index) === 0 && range.comparePoint(node.parentNode, index + 1) === 0;
}

function strip(element, family) {
  if (family.prefix && !family.own) {
    [...element.classList].filter((entry) => entry.startsWith(family.prefix)).forEach((entry) => element.classList.remove(entry));
    if (element.classList.length > 0) return; // still carries the other color family
  }
  element.replaceWith(...element.childNodes);
}

// The editor's pads (pads.mjs: a zero-width space that only holds a caret, as inside inline code at
// its start) go before a selection is formatted, its ends kept on the text: one left in a piece split
// off would keep that piece, drawn as an empty box (inline code cleared, its start's pad left in a
// <code> of its own).
function dropPads(host, range) {
  const pads = [];
  const walk = (node) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3 && child.data === ZWSP) pads.push(child);
      else if (child.nodeType === 1 && !child.hasAttribute("data-ge-atom")) walk(child);
    }
  };
  walk(host);
  for (const pad of pads) {
    if (range.startContainer === pad) range.setStartAfter(pad);
    if (range.endContainer === pad) range.setEndBefore(pad);
    pad.remove();
  }
}

// The inline elements text carries its marks in: the format bar's (bold… a color), a link.
const MARKS = new Set(["STRONG", "B", "EM", "I", "U", "INS", "S", "STRIKE", "DEL", "CODE", "KBD", "SAMP", "SUP", "SUB", "A", "SPAN", "MARK"]);
/** Whether `node` is an element text carries a mark in (bold… a color, a link; not a chip). */
export const isMark = (node) => node?.nodeType === 1 && MARKS.has(node.tagName) && !node.hasAttribute("data-ge-atom");

/**
 * A collapsed `range` in `host` taken out of the marks around it, each split there (a half left
 * holding nothing goes): what goes in there carries its own marks alone, as pasted text keeps its
 * own (the caret's are not added to it). Returns a range at that place.
 */
export function outOfMarks(host, range) {
  const doc = host.ownerDocument;
  const marker = doc.createComment("");
  range.insertNode(marker);
  while (marker.parentNode !== host && isMark(marker.parentNode)) {
    const mark = marker.parentNode;
    splitAround(mark, marker);
    const rest = marker.nextSibling;
    if (holdsNothing(mark)) mark.remove();
    if (isMark(rest) && holdsNothing(rest)) rest.remove();
  }
  const at = doc.createRange();
  at.setStartBefore(marker);
  at.collapse(true);
  marker.remove();
  return at;
}

// What makes two marks the same: their tag and attributes (a link's address too).
const markSignature = (node) => `${node.tagName} ${[...node.attributes].filter((entry) => entry.name !== "data-ge-src").map((entry) => `${entry.name}=${entry.value}`).sort().join(" ")}`;

/**
 * Two neighbours `left` and `right` (right after it) that are the same mark made one, and so on
 * inward where their insides meet (bold pasted beside bold is one bold).
 * Returns the mark kept (`left`), or null when they are not the same.
 */
export function joinMarks(left, right) {
  if (!isMark(left) || !isMark(right) || left.nextSibling !== right || markSignature(left) !== markSignature(right)) return null;
  for (let [a, b] = [left, right]; isMark(a) && isMark(b) && a.nextSibling === b && markSignature(a) === markSignature(b);) {
    const [inner, next] = [a.lastChild, b.firstChild];
    a.append(...b.childNodes);
    b.remove();
    [a, b] = [inner, next];
  }
  left.normalize();
  return left;
}

/** Whether an inline element holds nothing: no text but pads, no formula, no break (and is no break or formula itself). */
export const holdsNothing = (element) => element.tagName !== "BR" && !element.hasAttribute("data-ge-atom") && element.textContent.replaceAll(ZWSP, "") === "" && !element.querySelector(`${ATOM}, br`);

// Unwrap elements left empty by the splits, merge neighbours that now carry the same mark, and
// join adjacent text nodes.
function tidy(host, family) {
  for (const element of inlineElements(host)) if (holdsNothing(element)) element.replaceWith(...element.childNodes);
  host.normalize(); // drops the empty text nodes the splits leave between neighbours
  const signature = (node) => [...node.attributes].filter((entry) => entry.name !== "data-ge-src").map((entry) => `${entry.name}=${entry.value}`).sort().join(" ");
  for (const element of inlineElements(host)) {
    if (!element.isConnected || valueIn(element, family) === null) continue;
    for (let next = element.nextSibling; next?.nodeType === 1 && next.tagName === element.tagName && signature(next) === signature(element); next = element.nextSibling) {
      element.append(...next.childNodes);
      next.remove();
    }
  }
  host.normalize();
}

// What makes two pieces of inline code the same: their attributes, the editor's marks aside.
const codeSignature = (node) => [...node.attributes].filter((entry) => !/^(data-ge-|contenteditable$)/.test(entry.name))
  .map((entry) => `${entry.name}=${entry.value}`).sort().join(" ");
/**
 * Inline code right after inline code, nothing between them (what stood between deleted, two
 * blocks joined), is one piece: the second's text goes into the first. A caret that
 * was between them (or in a pad of the second) goes to the join, inside; one in the second's text
 * stays where it was. Returns whether any were joined.
 */
export function joinCode(host) {
  const selection = host.ownerDocument.getSelection();
  let joined = false;
  for (const code of [...host.querySelectorAll("code")]) {
    if (!code.isConnected || code.parentElement.closest(ATOM)) continue;
    for (;;) {
      const between = [];
      let next = code.nextSibling;
      for (; blank(next); next = next.nextSibling) between.push(next);
      if (next?.nodeName !== "CODE" || codeSignature(next) !== codeSignature(code)) break;
      const saved = selection?.rangeCount ? [selection.anchorNode, selection.anchorOffset, selection.focusNode, selection.focusOffset] : null;
      const siblings = [...code.parentNode.childNodes];
      const going = (node, offset) => between.includes(node) || node === next || (blank(node) && next.contains(node))
        || (node === code.parentNode && offset > siblings.indexOf(code) && offset <= siblings.indexOf(next));
      const toJoin = saved && selection.isCollapsed && going(saved[0], saved[1]);
      const last = textsOf(code).at(-1);
      const join = last ? [last, last.data.length] : [code, code.childNodes.length];
      between.forEach((node) => node.remove());
      code.append(...[...next.childNodes].filter((node) => !blank(node)));
      next.remove();
      joined = true;
      if (toJoin) selection.setBaseAndExtent(join[0], join[1], join[0], join[1]);
      else if (saved && saved[0].isConnected && saved[2].isConnected) selection.setBaseAndExtent(...saved);
    }
  }
  return joined;
}

// The text nodes with something more than a pad's space in them, in order.
function textsOf(node) {
  const texts = [];
  for (const child of node.childNodes) {
    if (child.nodeType === 3 && !blank(child)) texts.push(child);
    else if (child.nodeType === 1) texts.push(...textsOf(child));
  }
  return texts;
}

// Characters (a formula chip counts as one) between the block start and a boundary point.
function offsetAt(host, container, offset) {
  const before = host.ownerDocument.createRange();
  before.setStart(host, 0);
  before.setEnd(container, offset);
  return leavesIn(host, before).reduce((sum, leaf) => sum + leaf.size, 0);
}

// The point `count` characters into the block. At a node boundary a start prefers the next
// node and an end the previous one, so the selection stays inside what was just formatted.
function pointAt(host, count, forward) {
  const everything = host.ownerDocument.createRange();
  everything.setStart(host, 0);
  everything.setEnd(host, ownEnd(host));
  const leaves = leavesIn(host, everything);
  for (const { node, size } of leaves) {
    if (count < size || (count === size && !forward)) {
      return node.nodeType === 3 ? [node, count] : [node.parentNode, indexOf(node) + count];
    }
    count -= size;
  }
  // No text to count in at all (an emptied block, its placeholder <br> alone): at its start, before
  // the <br>, where an empty block's caret is (caret.mjs atEdge reads it there as the block's start,
  // so Backspace in an emptied item moved out a level still works); past the text, at its end.
  return leaves.length === 0 ? [host, 0] : [host, ownEnd(host)];
}

// Where a block's own content ends: a list item's text stops before the blocks it holds (its lists, a
// paragraph, a task board…), so that no offset of its counts their words.
function ownEnd(host) {
  const index = host.tagName === "LI" ? [...host.childNodes].findIndex((node) => node.nodeType === 1 && HELD_TAGS.has(node.localName)) : -1;
  return index < 0 ? host.childNodes.length : index;
}
