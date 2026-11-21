import { BLOCKS_QUOTE_MOST, LINE_TAGS, excerptOf, findQuote, squash, tidyLines } from "../../../shared/annotations.mjs";
import { UNIT, isMention, sourceWords, unitElement } from "../core.mjs";

// Anchors on the page (docs/editor.md "Annotations"): what a selection is as an anchor, and where an
// anchor's words or blocks are on the page now. A block's text is read as the server reads it
// (shared/annotations.mjs treeText: a formula its TeX, a chip the words its source gives it, which a
// page block may show otherwise, the blocks in it a line each, white space as one), with where each
// of its characters is, so a quote found in it is a range of the page again.
// What the kit or the editor adds to a block (a code block's tools, a formula's drawing, the editor's
// own nodes) is no part of its text.

const SKIP = [
  "script", "style", "template", "noscript", "svg", "[data-doc-dev]", "[aria-hidden='true']", "button:not(.doc-sheet-tab)",
  ".ge-code-gutter", ".doc-code-tools", ".doc-code-range",
].join(", ");

const elementOf = (node) => (node?.nodeType === 1 ? node : node?.parentElement ?? null);
// A block an anchor may name: the body's, and the header's lines under the title, not the title, the
// page's icon or the header as a whole (v1: no annotation on the title or the page as a whole).
export const annotatable = (unit) => Boolean(unit?.closest("main")) && !unit.matches(".doc-header, main > header") && !unit.closest(".doc-title, .doc-icon");
const unitOf = (node) => {
  const unit = unitElement(elementOf(node));
  return annotatable(unit) ? unit : null;
};

/**
 * The text of `elements` (in page order) as the server reads a block, a line between them: { text,
 * at }, `at[i]` where character `i` comes from ({ node, offset } in a text node, { element } for a
 * formula's TeX, null for a line's end). `skip(child)`: an element of theirs read past (a list item's
 * blocks, when its own words alone are read: changes/).
 */
export function readText(elements, { skip = null } = {}) {
  let text = "";
  const at = [];
  const put = (char, place) => { text += char; at.push(place); };
  const space = (place) => { if (text && !/[ \n]$/.test(text)) put(" ", place); };
  const line = () => {
    if (!text) return;
    if (text.endsWith(" ")) { text = text.slice(0, -1); at.pop(); }
    if (!text.endsWith("\n")) put("\n", null);
  };
  const walk = (parent) => {
    for (const child of parent.childNodes) {
      if (child.nodeType === 3) {
        const value = child.data;
        for (let offset = 0; offset < value.length; offset++) {
          const char = value[offset];
          if (char === "​" || char === "﻿") continue;
          if (/\s/.test(char)) space({ node: child, offset });
          else put(char, { node: child, offset });
        }
        continue;
      }
      if (child.nodeType !== 1) continue;
      if (child.matches(".katex")) { // a formula, as the file writes it: its TeX in its delimiters
        const tex = (child.querySelector('annotation[encoding="application/x-tex"]')?.textContent ?? "").replace(/\s+/g, " ").trim();
        const written = child.closest(".katex-display") ? `\\[${tex}\\]` : `\\(${tex}\\)`;
        space({ element: child });
        for (let index = 0; index < written.length; index++) put(written[index], { element: child });
        space({ element: child });
        continue;
      }
      if (child.matches(SKIP) || skip?.(child)) continue;
      const words = isMention(child) ? sourceWords(child) : null;
      if (words !== null) {
        for (const char of words) (/\s/.test(char) ? space : (place) => put(char, place))({ element: child });
        continue;
      }
      const own = LINE_TAGS.has(child.localName);
      if (own) line();
      walk(child);
      if (own) line();
    }
  };
  for (const element of elements) {
    line();
    walk(element);
  }
  while (text && /[ \n]$/.test(text)) { text = text.slice(0, -1); at.pop(); }
  return { text, at };
}

/** The range of the page from character `start` to `end` of `read` (readText), or null. */
export function rangeOf(read, start, end) {
  const places = read.at.slice(start, end);
  const first = places.find(Boolean);
  const last = places.findLast(Boolean);
  if (!first || !last) return null;
  const range = document.createRange();
  if (first.node) range.setStart(first.node, first.offset);
  else range.setStartBefore(first.element);
  if (last.node) range.setEnd(last.node, last.offset + 1);
  else range.setEndAfter(last.element);
  return range;
}

// Whether character `place` of a text is inside `range`.
function inside(range, place) {
  if (!place) return false;
  if (place.element) return range.intersectsNode(place.element);
  return range.comparePoint(place.node, place.offset) === 0 && range.comparePoint(place.node, place.offset + 1) === 0;
}

/**
 * The blocks a range of text is in, as an anchor names them: the one block holding it; across blocks,
 * the blocks right inside the one holding both ends (or the page's) that it reaches, so their text
 * holds it in order.
 */
export function unitsOfRange(range) {
  const start = unitOf(range.startContainer);
  const end = unitOf(range.endContainer);
  if (!start || !end) return [];
  if (start === end) return [start];
  const common = unitOf(range.commonAncestorContainer);
  if (common && (common === start || common === end)) return [common];
  const scope = common ?? start.closest("main");
  return [...scope.querySelectorAll(UNIT)].filter((unit) => unitOf(unit.parentElement) === common && unitOf(unit) === unit && range.intersectsNode(unit));
}

/**
 * A selection of text as an anchor: { units (the block elements), range (the words, trimmed), excerpt
 * ({ quote, prefix, suffix }) }, or null when it holds no words of the body.
 */
export function textSelection(range) {
  const units = unitsOfRange(range);
  if (units.length === 0) return null;
  const read = readText(units);
  let first = -1;
  let last = -1;
  read.at.forEach((place, index) => {
    if (!inside(range, place) || read.text[index] === " " || read.text[index] === "\n") return;
    if (first < 0) first = index;
    last = index;
  });
  if (first < 0) return null;
  const excerpt = excerptOf(read.text, first, last + 1);
  if (!squash(excerpt.quote)) return null;
  return { kind: "text", units, range: rangeOf(read, first, last + 1), excerpt };
}

/** Blocks selected whole as an anchor: { units, excerpt ({ quote }) }, or null. */
export function blockSelection(units) {
  const list = units.filter(annotatable);
  if (list.length === 0) return null;
  return { kind: "blocks", units: list, range: null, excerpt: { quote: tidyLines(readText(list).text).slice(0, BLOCKS_QUOTE_MOST) } };
}

/** The elements of `ids` on the page, in page order. */
export function elementsOf(ids) {
  const main = document.querySelector("main");
  if (!main) return [];
  const found = [...new Set(ids)].map((id) => main.querySelector(`[data-block-id="${CSS.escape(id)}"]`)).filter(Boolean);
  return found.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
}

// The unit right after `unit` and what it holds (the next one in page order not inside it), or null.
function unitAfter(unit) {
  const main = unit.closest("main");
  if (!main) return null;
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_ELEMENT, { acceptNode: (node) => (node.matches(UNIT) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP) });
  walker.currentNode = unit;
  for (let next = walker.nextNode(); next; next = walker.nextNode()) if (!unit.contains(next)) return annotatable(next) ? next : null;
  return null;
}

/**
 * Where an anchor is on the page now: { range, units } for words (range null for blocks), null when
 * it is not (its words or blocks gone), `unknown` when it cannot be told (kept as it was shown).
 * `units` are the elements of its blocks; with `elements` given, those (blocks named by the page and
 * not given their ids yet, or the blocks the page last found its words in). With `exact`, the words
 * only as they are (shared/annotations.mjs findQuote). Words split by Enter in their middle are found
 * as they are across their blocks and the one right after them (the server reads them so too).
 */
export function locate(anchor, elements = null, { exact = false } = {}) {
  const units = elements?.filter((node) => node.isConnected) ?? elementsOf(anchor.blocks ?? []);
  if (anchor.kind === "blocks") return units.length ? { range: null, units } : null;
  if (units.length > 0) {
    const read = readText(units);
    const found = findQuote(read.text, anchor, { exact });
    if (found && !found.unknown) return { range: rangeOf(read, found.start, found.end), units };
    if (!found) {
      const next = unitAfter(units.at(-1));
      const more = next ? [...units, next] : null;
      const split = more ? readText(more) : null;
      const across = split ? findQuote(split.text, anchor, { exact: true }) : null;
      // Begun in its own blocks and gone on in that one (not words of its own further on).
      if (across && across.start < read.text.length && across.end > read.text.length) return { range: rangeOf(split, across.start, across.end), units: more };
    }
    if (found?.unknown) return { unknown: true, units };
    return null;
  }
  // None of its blocks here (an Agent rewrote them without their ids): its words, found once in the page's blocks.
  const needle = squash(anchor.quote);
  const main = document.querySelector("main");
  if (!needle || !main) return null;
  const holding = [...main.querySelectorAll("[data-ge-unit]")].filter((unit) => annotatable(unit) && squash(readText([unit]).text).includes(needle));
  const innermost = holding.filter((unit) => !holding.some((other) => other !== unit && unit.contains(other)));
  if (innermost.length !== 1) return null;
  const read = readText(innermost);
  const found = findQuote(read.text, anchor);
  return found && !found.unknown ? { range: rangeOf(read, found.start, found.end), units: innermost } : null;
}

/**
 * `range` from its first character of text to its last (white space aside), in text nodes, or null
 * when it holds none: a range the page's edits left with an end between elements (a block taken out
 * moves an end to its parent) is read again from its words.
 */
export function tighten(range) {
  if (!range.startContainer.isConnected || !range.endContainer.isConnected || range.collapsed) return null;
  const root = range.commonAncestorContainer;
  const walker = document.createTreeWalker(root.nodeType === 3 ? root.parentNode : root, NodeFilter.SHOW_TEXT);
  let first = null;
  let last = null;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!range.intersectsNode(node)) continue;
    const from = node === range.startContainer ? range.startOffset : 0;
    const to = node === range.endContainer ? range.endOffset : node.data.length;
    for (let at = from; at < to; at++) {
      if (/\s|​|﻿/.test(node.data[at])) continue;
      first ??= { node, at };
      last = { node, at };
    }
  }
  if (!first) return null;
  const tight = document.createRange();
  tight.setStart(first.node, first.at);
  tight.setEnd(last.node, last.at + 1);
  return tight;
}
