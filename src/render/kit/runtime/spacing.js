// Inline code and formulas stand an ordinary space apart from the words beside them (a letter, a
// digit or a Chinese character), as the page editor types one there: where the report's text has
// none, the kit puts one in as the page renders, the file staying as written. The rule is
// src/shared/inline-spacing.mjs's, the page editor's too: none beside a space, punctuation or the
// line's edge; none for a formula left empty (\(\), which shows nothing). Formulas rendered later
// (math.js) and what a report's script adds are spaced as they come. Text the page editor edits
// ([contenteditable]) is the editor's: it rebuilds that text from the file and spaces it by the same
// rule (editor core.mjs prepareBlock). What stands in the own region of an instance of a component
// package is its component's: nothing here goes in; what its slots hold is the document's.
//
// A closing punctuation mark right after an inline formula never starts a line. KaTeX draws a
// formula as boxes a line may break after, its last one too, so the formula (or the bold, link or
// colored run it ends) and the marks right after it are held in one span the line does not break
// in between its children (.doc-math-tie, styles/math.css; the run still wraps between its
// words): as the page renders, the file staying as written, and never in text the page editor
// edits. The marks are the closing ones, Chinese and Latin (，。、；）… and , . ; ) …), and the rest
// of a range the formula begins (\(\rho\approx3\)–5: the dash and the number after it). Chrome
// breaks after an inline-block by the white-space of the block's parent, so KaTeX's boxes are held
// too (nowrap), and the formula wraps between them only where a zero-width space in a span that
// wraps stands (.doc-math-break, between each two boxes, where KaTeX lets a line break: after a
// relation or an operator), never after the last. Chrome breaks after a wrapper's end by the
// wrapper's white-space (a bold run wraps between its words), where a line may start with ；：or a
// dash after a box, so a word joiner (U+2060, which no line breaks beside) stands between the
// formula or its wrapper and the marks: drawn by an empty span (.doc-math-joiner, styles/math.css),
// no text of the page's (a copy, the page editor's comparison with the file). An export of the
// current view lets the span go (untie, math.js's dehydrate), its children back where they were, the
// breaks and the joiner gone.
//
// A number range (3–13, 1–3B, 22.8%–23.7%, 100M–400M, 1606—1614, 3～5) is one word: the line never
// breaks at its dash, as the browser would after it. Its text is held in a span the line does not
// break in (.doc-range, styles/base.css), the same way: as the page renders, the file staying as
// written, never in text the page editor edits, nor in code, a formula or a drawing; an export of the
// current view lets the span go (untie, the runtime's dehydrate). Only the report's text (its main) is
// looked in, never the page's title or a menu's options; and a text node a script puts in later is
// the script's, which may write to it again: it stays whole (an element a script adds is held).
//
// A long run (src/shared/long-runs.mjs: more than 20 characters with no place to break inside it, a
// path, a URL, a long identifier) breaks where its line ends, while an ordinary word stays whole: its
// text is held in a span that breaks anywhere (.doc-long-run, word-break: break-all, styles/base.css),
// the same way as a range: as the page renders and in what is added later, the file staying as
// written; never in text the page editor edits (it marks such a block itself: editor/page/
// long-runs.mjs), nor in a formula, a drawing, a range, kbd or an instance's own region; an export of
// the current view lets the span go (untie, the runtime's dehydrate). Inline code is no text a span
// goes into: a piece of it holding a long run is held whole, the span around it (all its words then
// break anywhere), but in a table's cell, where code keeps its own rule (styles/table.css). A run is
// looked for within one text node (one parted by a bold letter is two). What a cell keeps whole (a
// header, a short field) keeps the run whole (table.css).
//
// A list item with no text of its own over the blocks it holds (<li><p>…</p></li>, a task board, a
// list) keeps a line of its own, its marker on it and the blocks under it, as the page editor shows
// it (an item keeps its title line however empty): a line break stands ahead of them
// (br.doc-item-line), as the page renders and in what is added later, the file staying as written.
// Which items is the rule the page editor gives the line by (keepsLine, src/shared/components/list.mjs):
// an item of a list whose markers the kit draws in a flow; never one of a list with a class of its own
// or of one in a whole block of the document's, a card or a table's cell, whose look is the document's,
// nor a flowchart's step (a node holding blocks, no item); never in text the page editor edits, which
// it gives the line itself. An export of the current view takes it off (the list's description's
// runtime), the copy's kit putting it back.

import { giveLine } from "../../../shared/components/list.mjs";
import { INSTANCE, componentAt } from "../../../shared/components/installed.mjs";
import { ZWSP, inlineItems, spaceAround } from "../../../shared/inline-spacing.mjs";
import { holdsLongRun, longRuns } from "../../../shared/long-runs.mjs";

// What a component's: an instance's own region (installed.mjs componentAt), not what its slots hold.
const inert = (element) => element.closest("pre, svg, [contenteditable], [data-doc-dev], script, style, textarea") || element.matches(INSTANCE) || componentAt(element);
// A number, its unit or percent sign after it (3B, 400M, 23.7%), and one with a dash before it.
const NUMBER = String.raw`\d(?:[\d.,]*\d)?(?:%|[A-Za-z]{1,3})?`;
const DASH = "[–—~～]";
const CLOSING = new RegExp(String.raw`^(?:${DASH}${NUMBER})?[，。、；：！？）」』》】〉〕”’,.;:!?)\]]*`);
const RANGE = new RegExp(`${NUMBER} ?${DASH} ?${NUMBER}`);
// The text a range or a long run is not looked for in: code, a formula's drawing, a range or a run
// held already, a menu's option; and text holding a formula not drawn yet (\( \) \[ \] $$, or $ where
// single dollars delimit one: math.js), which a span inside it would part from its delimiters.
const OWN_TEXT = "code, kbd, samp, .katex, .doc-range, .doc-long-run, option";
const TEX = /\\[()[\]]|\$\$/;
// The inline wrappers a formula may end (a bold formula before a comma): the marks follow the wrapper.
const WRAPPER = /^(STRONG|B|EM|I|U|S|MARK|SPAN|A|SUB|SUP|SMALL)$/;

/** Holds `formula` (an inline formula, or KaTeX's drawing of one written bare) and the closing marks right after it on one line: the span, or null. */
export function tieClosing(formula) {
  let at = formula;
  while (!at.nextSibling && at.parentElement && WRAPPER.test(at.parentElement.tagName) && !at.parentElement.classList.contains("doc-math-tie")) at = at.parentElement;
  if (at.parentElement?.classList.contains("doc-math-tie")) return null;
  const next = at.nextSibling;
  const marks = next?.nodeType === 3 ? CLOSING.exec(next.data)?.[0] : null;
  if (!marks) return null;
  if (next.data.length > marks.length) next.splitText(marks.length);
  const tie = formula.ownerDocument.createElement("span");
  tie.className = "doc-math-tie";
  at.before(tie);
  const joiner = formula.ownerDocument.createElement("span");
  joiner.className = "doc-math-joiner";
  tie.append(at, joiner, next);
  tie.querySelectorAll(".katex-html").forEach(breakBetweenBoxes); // a formula drawn already
  return tie;
}

// Where a held formula's line may break: between each two of KaTeX's boxes (.katex-base) a span
// that wraps holding a zero-width space, none after the last (once).
function breakBetweenBoxes(html) {
  if (html.querySelector(":scope > .doc-math-break")) return;
  const boxes = [...html.children].filter((child) => child.classList.contains("katex-base"));
  for (const box of boxes.slice(0, -1)) {
    const gap = html.ownerDocument.createElement("span");
    gap.className = "doc-math-break";
    gap.textContent = ZWSP;
    box.after(gap);
  }
}

/** Lets a span tieClosing, holdRanges or holdRuns made go: its children where it stood (a formula's breaks and the joiner taken out), its text joined to the words beside it again. */
export function untie(tie) {
  tie.querySelectorAll(":scope > .doc-math-joiner, .doc-math-break").forEach((added) => added.remove());
  const parent = tie.parentNode;
  tie.replaceWith(...tie.childNodes);
  parent?.normalize();
}

/** Holds each number range in the text node `text` on one line: the spans made (none when it has no range). */
export function holdRanges(text) {
  const held = [];
  for (let rest = text; rest;) {
    const found = RANGE.exec(rest.data);
    if (!found) break;
    const range = found.index > 0 ? rest.splitText(found.index) : rest;
    rest = range.data.length > found[0].length ? range.splitText(found[0].length) : null;
    const span = range.ownerDocument.createElement("span");
    span.className = "doc-range";
    range.before(span);
    span.append(range);
    held.push(span);
  }
  return held;
}

/** Holds each long run in the text node `text` in a span that breaks anywhere: the spans made (none when it has no long run). */
export function holdRuns(text) {
  const held = [];
  for (const { index, length } of longRuns(text.data).reverse()) {
    if (index + length < text.data.length) text.splitText(index + length);
    held.unshift(breaking(index > 0 ? text.splitText(index) : text));
  }
  return held;
}

// `node` held in a span that breaks anywhere (.doc-long-run): the span.
function breaking(node) {
  const span = node.ownerDocument.createElement("span");
  span.className = "doc-long-run";
  node.before(span);
  span.append(node);
  return span;
}

// The text nodes under `root`.
function textsIn(root) {
  const texts = [];
  const walker = root.ownerDocument.createTreeWalker(root, 4); // NodeFilter.SHOW_TEXT
  for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node);
  return texts;
}

// Whether a range or a run is looked for in the text node `text`: the report's text (its main), not
// text that is a formula's, code's, a drawing's or the page editor's.
function looked(text) {
  const parent = text.parentElement;
  return Boolean(parent?.closest("main")) && !TEX.test(text.data) && !inert(parent) && !parent.closest(OWN_TEXT)
    && !(text.data.includes("$") && parent.closest("[data-doc-math-dollar]"));
}

// The ranges in the report's text (its main) under the element `root`, then its long runs: in its
// text, and a piece of inline code holding one held whole (not in a table's cell).
function holdIn(root) {
  for (const text of textsIn(root)) if (RANGE.test(text.data) && looked(text)) holdRanges(text);
  for (const text of textsIn(root)) if (holdsLongRun(text.data) && looked(text)) holdRuns(text);
  for (const code of [...(root.matches("code") ? [root] : []), ...root.querySelectorAll("code")]) {
    if (code.closest("main") && !inert(code) && !code.parentElement?.closest(`${OWN_TEXT}, td, th`) && holdsLongRun(code.textContent)) breaking(code);
  }
}

// The items in the report's text under `root` (itself and the item it stands in among them) that keep a
// line of their own (keepsLine; `flows`: every element blocks stand straight in), each given it.
function keepLines(root, flows) {
  const items = [...(root.matches("li") ? [root] : []), ...(root.parentElement?.matches("li") ? [root.parentElement] : []), ...root.querySelectorAll("li")];
  for (const item of items) if (item.closest("main") && !inert(item)) giveLine(item, flows);
}

function spaceIn(root, flows) {
  for (const element of inlineItems(root)) {
    if (inert(element)) continue;
    spaceAround(element);
    if (element.matches(".doc-math-inline, .katex")) tieClosing(element);
  }
  // A formula drawn inside one held already (KaTeX renders after the page has loaded).
  for (const html of [root, ...root.querySelectorAll(".katex-html")]) if (html.matches(".katex-html") && html.closest(".doc-math-tie")) breakBetweenBoxes(html);
  holdIn(root);
  keepLines(root, flows);
}

/**
 * Spaces the page's inline code and formulas now, and those added later; holds its number ranges, and
 * the marks after its formulas, on their lines, and its long runs in spans that break anywhere; gives
 * an item with no text over the blocks it holds its line (`flows`: the selector of every element
 * blocks stand straight in, FLOW_BLOCKS).
 */
export function startSpacing(document, flows) {
  const run = () => spaceIn(document.body, flows);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
  else run();
  new MutationObserver((records) => {
    for (const record of records) for (const node of record.addedNodes) if (node.nodeType === 1 && node.isConnected) spaceIn(node, flows);
  }).observe(document.documentElement, { childList: true, subtree: true });
}
