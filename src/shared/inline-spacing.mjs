// The one rule for the space beside inline code and formulas, read by the kit's runtime/spacing.js
// (the reading view, for the report's own text) and by the page editor (marks.mjs, typing/, core.mjs
// prepareBlock, the paste): inline code and a formula stand an ordinary space apart from a letter,
// a digit or a Chinese character right beside them, and from one another; none beside a space,
// punctuation or the line's edge. What is beside an element is looked for as the reader sees it:
// out of the wrappers it stands in (strong, a link, a span...) and into those beside it, up to the
// edge of its line (a paragraph, a list item, a cell, a break, a list...) or of the editing host.
// A formula left empty (\(\), which shows nothing) and a link left empty are not there to either
// side. The editor's zero-width pads (pads.mjs) hold no text. DOM only: no globals.

// The magnitudes and measure words a number goes with, written with no space before them (3.6亿, 5个,
// 2024年, 30天), and 第 before a number (第3名): the page editor's typing keeps them together (typing/ autoSpace).
const UNITS = new Set([..."个万亿千百十元角分厘毛倍年月日号时点秒天周岁人位名次家条项种台只件篇页张套份组批期届代级层轮步米克斤吨度里公毫微寸尺两升户所座栋辆架艘本部章节场局首句字行列遍回番成"]);
const DIGIT = /[0-9]/;
/** Whether characters `a` and `b` (`before` the one ahead of `a`) stay together: a number and its unit (3万5千 too). */
export const numberWithUnit = (a, b, before = "") => (DIGIT.test(a) && UNITS.has(b)) || (a === "第" && DIGIT.test(b)) || (UNITS.has(a) && DIGIT.test(b) && DIGIT.test(before));

/** The editor's pads (pads.mjs) hold nothing but this. */
export const ZWSP = String.fromCharCode(0x200b);
/** What a space is put beside: a letter or a digit (a Chinese character is a letter). */
export const WORD = /[\p{L}\p{N}]/u;

const ITEM = "code, .doc-math-inline, .katex";
/** What ends a line of text (an element's tagName): nothing beyond it is a neighbour. */
export const LINE = /^(P|LI|H[1-6]|TD|TH|DT|DD|DIV|SECTION|ARTICLE|ASIDE|HEADER|FOOTER|MAIN|NAV|FIGURE|FIGCAPTION|CAPTION|SUMMARY|DETAILS|BLOCKQUOTE|UL|OL|TABLE|THEAD|TBODY|TR|PRE|BR|HR|DIALOG|BODY|BUTTON|svg)$/;

/** Whether `node` is a text node holding nothing but pads (or nothing). */
export const blank = (node) => node?.nodeType === 3 && node.data.replaceAll(ZWSP, "") === "";

// A formula left empty: \(\) as written, KaTeX's drawing of nothing, or the page editor's chip for
// it (data-ge-empty, as the editor's server serves the page; one that does not read has TeX in it).
const emptyFormula = (element) => element.matches(".doc-math-inline") && (element.getAttribute("data-ge-empty") === "formula" || !element.textContent.replace(/\\[()]/g, "").trim());

/** Whether `node` is inline code or a formula with something in it: what the rule spaces. */
export const isInlineItem = (node) => node?.nodeType === 1 && node.matches(ITEM) && !emptyFormula(node);

/** The inline code and formulas under `root` (itself too) that stand in the text, not in another formula or code. */
export function inlineItems(root) {
  const items = root.nodeType === 1 && root.matches(ITEM) ? [root, ...root.querySelectorAll(ITEM)] : [...root.querySelectorAll(ITEM)];
  return items.filter((item) => isInlineItem(item) && !item.parentElement?.closest(".doc-math-inline, .katex, .katex-display, code"));
}

// The text at one end of a node: its first (or last) character, true for inline code or a formula,
// null at a line's edge, undefined when it holds no text.
function endOf(node, after) {
  if (node.nodeType === 3) {
    const characters = [...node.data.replaceAll(ZWSP, "")];
    return characters.length === 0 ? undefined : after ? characters[0] : characters.at(-1);
  }
  if (node.nodeType !== 1) return undefined;
  if (LINE.test(node.tagName)) return null;
  if (node.matches(ITEM)) return emptyFormula(node) ? undefined : true;
  if (node.hasAttribute("data-ge-empty")) return undefined;
  const children = [...node.childNodes];
  for (const child of after ? children : children.reverse()) {
    const found = endOf(child, after);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * What is beside `node` in its line, before it or `after` it: the character next to it, true where
 * inline code or a formula is, null where there is nothing on the line.
 */
export function sideOf(node, after) {
  for (let at = node; at;) {
    const next = after ? at.nextSibling : at.previousSibling;
    if (!next) {
      at = at.parentElement;
      if (!at || LINE.test(at.tagName) || at.hasAttribute("contenteditable")) return null;
      continue;
    }
    const found = endOf(next, after);
    if (found !== undefined) return found;
    at = next;
  }
  return null;
}

/**
 * A space on each side of the inline code or formula `element` where a word or another one is
 * beside it, as an ordinary text node (inside the wrapper the element stands in, where it stands
 * at the wrapper's edge). Returns the spaces put in: { before, after }, text nodes or null.
 */
export function spaceAround(element) {
  const put = { before: null, after: null };
  for (const after of [false, true]) {
    const side = sideOf(element, after);
    if (side !== true && !(typeof side === "string" && WORD.test(side))) continue;
    const space = element.ownerDocument.createTextNode(" ");
    if (after) element.after(space);
    else element.before(space);
    put[after ? "after" : "before"] = space;
  }
  return put;
}
