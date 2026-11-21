import { escapeText } from "../../../../shared/escape.mjs";
import { UNIT, serializeInner, textEnd } from "../../core.mjs";
import { askClipboard, clipboardOf, sizeValue } from "../../../components/registry.mjs";
import { isMark } from "../../marks.mjs";
import { colorOf, copiedType, describe } from "./describe.mjs";
import { groupItems } from "./rules.mjs";

// Selected text as the clipboard's own description (docs/editor.md, "Copying text"):
//   in one text block  its inline HTML (selectedHtml: the format bar's marks, a chip as its source),
//                      and no block: neither a list's marker nor a heading's size goes with it;
//   across blocks      blocks, each of its type (describeAcross): the first from where the selection
//                      starts, those between whole, the last up to where it ends; a list's items each an
//                      item of its kind (`list`, as an item selected on its own) with its checked state
//                      and what of the blocks it holds the selection reaches, a quote's paragraphs in a
//                      quote, and a highlight block, a callout, a disclosure or a section the selection ends in
//                      with what of it comes before the end (its icon, its title), a tabs area with the
//                      tab shown and what of its panel comes before the end; a flowchart's nodes a
//                      flowchart with its direction (never loose paragraphs: its steps are no items),
//                      the node it ends in a node with what of it comes before the end. Around where it
//                      starts, a highlight block, a callout, a disclosure, a section, a flowchart's node, an item
//                      whose own text comes before it, a row of columns, a column or a tabs area are not
//                      copied, only what of them it holds: no block the start is in is copied as itself.
// What of a block this takes is the unit's to say (`clipboard.piece`, `across`, `endsIn`).

/**
 * `range` (a selection in `host`) kept to the block's own text (a list item's ends before the blocks
 * it holds) and widened over a chip (a formula, a link shown with its icon) an end stands inside;
 * an end at a chip's very start (where Chrome's triple click stops) or a start at its very end
 * leaves it out, as the selection drawn does.
 */
export function ownRange(host, range) {
  const part = range.cloneRange();
  const own = host.ownerDocument.createRange();
  own.setStart(host, 0);
  own.setEnd(host, textEnd(host));
  if (part.compareBoundaryPoints(part.START_TO_START, own) < 0) part.setStart(host, 0);
  if (part.compareBoundaryPoints(part.END_TO_END, own) > 0) part.setEnd(host, textEnd(host));
  const chipOf = (node) => {
    const chip = (node?.nodeType === 1 ? node : node?.parentElement)?.closest("[data-ge-atom]");
    return chip && chip !== host && host.contains(chip) ? chip : null;
  };
  // Whether nothing of `chip` stands between its start (or its end) and the point.
  const atEdge = (chip, node, offset, end) => {
    const between = host.ownerDocument.createRange();
    between.selectNodeContents(chip);
    if (end) between.setStart(node, offset);
    else between.setEnd(node, offset);
    return between.toString() === "";
  };
  const first = chipOf(part.startContainer);
  if (first && atEdge(first, part.startContainer, part.startOffset, true)) part.setStartAfter(first);
  else if (first) part.setStartBefore(first);
  const last = chipOf(part.endContainer);
  if (last && atEdge(last, part.endContainer, part.endOffset, false)) part.setEndBefore(last);
  else if (last) part.setEndAfter(last);
  return part;
}

/**
 * The inline HTML of `range` in `host` (ownRange), as serializeInner writes a block's: the format
 * bar's marks (those around it too, as a word selected in bold), a chip as its source, a table
 * cell's lists; code as its text, a line break between its lines. Its spaces are those the page
 * shows (`shownSpaces`): a space selected before or after the words is copied with them; the
 * source's line breaks and indentation are not.
 */
export function selectedHtml(host, range) {
  const doc = host.ownerDocument;
  const holder = doc.createElement("div");
  const kind = host.getAttribute("data-ge-kind");
  if (kind) holder.setAttribute("data-ge-kind", kind); // a cell's lists are its text, code is text alone
  const code = kind === "code"; // its spaces as they are, a line break between its lines
  const part = ownRange(host, range);
  let content = part.cloneContents();
  for (let node = part.commonAncestorContainer; node && node !== host && host.contains(node); node = node.parentNode) {
    if (!isMark(node)) continue; // a word selected in bold is bold: the marks around the selection go with it
    const mark = node.cloneNode(false);
    mark.append(content);
    content = mark;
  }
  holder.append(content);
  if (!code) shownSpaces(host, part, holder);
  const html = serializeInner(holder);
  return code ? html.replace(/\n/g, "<br>") : html;
}

// White space a text block does not show (white-space: normal): what an Agent's source has around a
// block's words (`<p>\n  words\n</p>`), and a run of it more than one space.
const COLLAPSED = /[ \t\n\r]+/g;
const UNSEEN = /^[ \t\n\r\u200b]*$/; // the editor's zero-width pads hold nothing either
const SHOWN = "[data-ge-atom], img, svg, video, iframe, br, hr";

/**
 * `holder`, the copy of `part` of `host`, with the white space the page shows of it: each run one
 * space, and none at an end of it that is an end of the block's text (nothing shown between them),
 * where the block shows none (a non-breaking space, typed there, stays). Spaces selected beside the
 * words stay.
 */
function shownSpaces(host, part, holder) {
  const doc = host.ownerDocument;
  const texts = [];
  for (let walker = doc.createTreeWalker(holder, 4 /* NodeFilter.SHOW_TEXT */), node; (node = walker.nextNode());) {
    node.data = node.data.replace(COLLAPSED, " ");
    texts.push(node);
  }
  // Whether nothing the page shows stands between the block's text's start (or its end) and `part`.
  const unseen = (end) => {
    const between = doc.createRange();
    if (end) {
      between.setStart(part.endContainer, part.endOffset);
      between.setEnd(host, textEnd(host));
    } else {
      between.setStart(host, 0);
      between.setEnd(part.startContainer, part.startOffset);
    }
    const held = between.cloneContents();
    return UNSEEN.test(held.textContent) && !held.querySelector?.(SHOWN);
  };
  // The white space at one end of the copy, up to what it shows first there (words, a chip, a picture).
  const shown = [...holder.querySelectorAll(SHOWN)];
  const strip = (order, start) => {
    for (const node of order) {
      if (shown.some((element) => node.compareDocumentPosition(element) & (start ? 2 : 4))) return; // DOCUMENT_POSITION_PRECEDING, _FOLLOWING
      node.data = start ? node.data.replace(/^[ \t\n\r]+/, "") : node.data.replace(/[ \t\n\r]+$/, "");
      if (node.data.replace(/\u200b/g, "") !== "") return;
    }
  };
  if (unseen(false)) strip(texts, true);
  if (unseen(true)) strip([...texts].reverse(), false);
}

// A block's words, what the page shows of it (what it draws for readers' sake and the editor's left out).
function wordsOf(unit) {
  const copy = unit.cloneNode(true);
  copy.querySelectorAll('[aria-hidden="true"], [data-doc-dev], .ge-code-gutter').forEach((node) => node.remove());
  return copy.textContent.replace(/\s+/g, " ").trim();
}

/**
 * A selection across blocks described: `range` the selection, `texts` its
 * text by text block ([{ host, range }]: body text, headings, list items),
 * `wholes` the blocks it takes whole (text-select/ piecesOf). The list's items at the top carry their
 * list's kind; inside a block, runs of them are lists (groupItems). Were none of it found among the
 * page's blocks, its texts are paragraphs: a copy of a selection is never empty.
 */
export function describeAcross(range, { texts, wholes }) {
  const pieces = new Map(texts.map((piece) => [piece.host, piece.range]));
  const taken = new Set(wholes);
  const holdsAny = (unit) => texts.some(({ host }) => unit.contains(host)) || wholes.some((node) => unit.contains(node));
  const holdsAll = (unit) => {
    const own = unit.ownerDocument.createRange();
    own.selectNode(unit);
    return range.compareBoundaryPoints(range.START_TO_START, own) <= 0 && range.compareBoundaryPoints(range.END_TO_END, own) >= 0;
  };
  // The blocks of a box it holds some of, in a group of blocks too (a tab not shown holds none), and
  // through what stands in a box but is neither block nor box (a detail card, its panel).
  const walk = (box) => [...box.children].flatMap((child) => (child.hidden ? []
    : child.matches(UNIT) || pieces.has(child) || taken.has(child) ? blocksOf(child) : walk(child)));
  // A block taken whole as a copy of blocks describes it; one the page cannot make (a report's own
  // widget, a card not saved yet) as its words.
  const whole = (unit) => {
    const block = describe(unit);
    if (block) return [block];
    const words = wordsOf(unit);
    return words ? [{ type: "paragraph", html: escapeText(words) }] : [];
  };
  // A text block's part, of its type as a copy of the block describes it (a quote's paragraph a
  // paragraph, the quote around it); a title or a caption, no block of its own, a paragraph.
  const piece = (host) => {
    const html = selectedHtml(host, pieces.get(host));
    const part = askClipboard("piece", host, html, what);
    if (part) return part;
    const type = host.parentElement?.hasAttribute("data-ge-box") && (host.getAttribute("data-ge-kind") ?? "flow") === "flow" ? copiedType(host) : null;
    const color = colorOf(host);
    return { type: type ?? "paragraph", html, ...(color ? { color } : {}) };
  };
  // The boxes of a block it holds some of (a row's columns are blocks, its tabs area's panels boxes).
  const boxesOf = (unit) => (unit.hasAttribute("data-ge-box") ? [unit]
    : [...unit.querySelectorAll("[data-ge-box]")].filter((box) => !box.hidden && box.parentElement?.closest(UNIT) === unit));
  // What a block's hooks are told.
  const what = {
    walk, holdsAll, holdsAny, boxesOf, groupItems, colorOf, sizeValue, serializeInner, describe,
    startsIn: (unit) => unit.contains(range.startContainer), // the selection starts in it
    blocksIn: (boxes) => groupItems(boxes.flatMap(walk)),
  };
  const container = (unit) => {
    const through = askClipboard("across", unit, what);
    if (through) return through;
    if (holdsAll(unit)) {
      const block = describe(unit);
      if (block) return [block];
    }
    // Where it ends: the block with what of it comes before the end.
    const ending = what.startsIn(unit) ? undefined : askClipboard("endsIn", unit, what);
    return ending ?? walk(unit).filter((block) => !clipboardOf(block.type).lead);
  };
  function blocksOf(unit) {
    if (taken.has(unit)) return whole(unit);
    if (pieces.has(unit)) return [piece(unit)];
    return holdsAny(unit) ? container(unit) : [];
  }
  const main = range.startContainer.ownerDocument.querySelector("main");
  const blocks = main ? walk(main) : [];
  return blocks.length > 0 ? blocks : texts.map(({ host, range: part }) => ({ type: "paragraph", html: selectedHtml(host, part) }));
}
