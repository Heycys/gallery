import { FLOW, FLOW_DIRECTION, FLOW_KEY, FLOW_RATIO, FLOW_RECOUNT, FLOW_ROW, flowShares, isFlowLabel } from "../../../shared/components/list.mjs";
import { holdsLongRun } from "../../../shared/long-runs.mjs";
import { sayRuntime as say } from "../words.js";

// 流程图 (ol.doc-flow, styles/flowchart.css): a flowchart laid out in rows, worked out as the page is
// drawn and again when its width, the fonts, its content, its direction or a step's direction or
// weight change. Its steps go in rows from left to right, each row filling the flowchart's width
// (each step's share of it its weight, --doc-flow-ratio, among the row's: equal where none is
// written), the rows one under another; an arrow leads across from a step to the next one in its
// row, and from a row's last step down to the next row's first: straight down where that one stands
// right under it (a row of one), else turning, down half the gap between the rows, across, and down
// into the next row's first step, from one number's (or icon's) column to the other's.
//
// Where a row ends is the authors' (data-direction, "row" or "column", on the list for every joint
// and on a step for the joint after it, a step's own winning) or the kit's where neither says
// (自动): a step goes on the row of the step before it while the row reads well, at most
// FLOW_ROW.most steps in a flowchart FLOW_ROW.narrow wide at least, each card at least FLOW_ROW.least
// wide and as wide as its longest word needs (with what stands beside it: the step's number, the
// indent of a list in its content), each step's title on FLOW_ROW.title lines at most and no card
// taller than it is wide, its content included (its words laid out at the card's width as the
// browser lays them: its title, then each block it holds, a paragraph's or a heading's lines, a
// list's items with what each holds, a quote's paragraphs, a divider, the margins between them as
// the browser collapses them; a block with no box, an empty media block a reader is not shown, left
// out; a step holding any other block, a picture, a table, code, a disclosure, a flowchart, reads
// beside no other, so it takes a row of its own); else the row ends there. "column" ends the row
// there; "row" puts the next step on it whatever the count and the lengths, as long as every card
// of the row keeps FLOW_ROW.least and its longest word (else the row ends there all the same: a row
// too narrow for its cards wraps, it never falls back to one step a row). The weights (a reader's
// widths, dragged in the page editor) count where a card would be narrower than it may be (each
// card at its weighted share keeps FLOW_ROW.least and its longest word), not in how many read well
// a row (自动 counts them at equal widths): a row the reader made wider or narrower stays the row it
// was, the narrow card as tall as its content makes it, rather than wrapping under the pointer.
//
// The kit writes the layout into one stylesheet of its own (a constructed one, adopted by the
// document: nothing is written on the steps, so the page editor sees no change of them), its rules
// named by the list's data-doc-flow-key (an export of the current view takes it off: the copy's
// kit lays it out again). Widths are shares of the row and the turning arrows' reach a calc() of the
// step's own width, so the layout holds at any width the rows are drawn at (a resize before the kit
// works it out again). Printed, it is worked out again where it prints: as the browser lays the page
// out for paper (Ctrl+P, a PDF it prints) at the paper's width, and the workbench's PDF lays the page
// out at the paper's width first; an arrow a page's break parts from its next row is left out there
// (pagedApart; a flowchart that fits on a page is kept on one: PAGE). A flowchart of
// one step a row writes no rows: the stylesheet's own column is that. A step written the short way
// (its own words its title, until the editor rewrites it as a node) has its content the list's gap
// under its words, by a rule of the kit's too. A flowchart the author gave no name of its own
// (aria-label, aria-labelledby) is named 流程图 for screen readers (still an ordered list to them),
// by the kit as it starts it.

// What the layout goes by (FLOW_ROW: at most `most` steps a row the kit fills, 自动; each card `least`
// wide at least, px; `gap` between two in a row, px; a row of the kit's in a flowchart `narrow` wide
// at least, px; each step's title on `title` lines at most) is the shared description's, which the
// page editor's gaps go by too (a node dragged narrower stops where the kit would wrap it).
export { FLOW_ROW };

// ---------- the lines a text takes ----------

// A line may break before and after each Chinese, Japanese or Korean character (and full-width
// form), and at a space: the words a line cannot break in are the runs of other characters (but a
// long run, a path or a URL of more than 20 characters, src/shared/long-runs.mjs, which breaks
// anywhere, and every run of a block that breaks anywhere, word-break: break-all: piecesOf).
const CJK = "\\u2e80-\\u9fff\\uac00-\\ud7af\\uf900-\\ufaff\\uff00-\\uffef";
const WORDS = new RegExp(`[${CJK}]|[^\\s${CJK}]+`, "g");
const PIECES = new RegExp(`[${CJK}]|[^\\s${CJK}]+|\\s+`, "g");
const WIDE = new RegExp(`[${CJK}]`);
/** The words of a text a line cannot break in (a Chinese character each, a run of letters, digits and marks). */
export const wordsOf = (text) => String(text).match(WORDS) ?? [];

/**
 * The lines a text takes in `width` (px), its `pieces` ({ width, space }: its words and the spaces
 * between them, in order) laid as a browser lays them: a line broken before a word that would pass
 * the edge (a space at the break hanging past it), a word wider than a whole line broken in it
 * (the cards' overflow-wrap). None for no words.
 */
export function linesOf(pieces, width) {
  let lines = 0;
  let used = 0; // the words on the line so far (px)
  let pending = 0; // the spaces after them
  for (const piece of pieces) {
    if (piece.space) {
      if (used > 0) pending += piece.width;
      continue;
    }
    if (lines === 0) lines = 1;
    if (used > 0 && used + pending + piece.width > width + 0.5) {
      lines++;
      used = 0;
    } else used += pending;
    pending = 0;
    if (used === 0 && piece.width > width) {
      lines += Math.ceil(piece.width / width) - 1;
      used = piece.width - (Math.ceil(piece.width / width) - 1) * width;
    } else used += piece.width;
  }
  return lines;
}

// The height (px) of a block a step holds, its margins left out, laid out `width` (px) wide: a text
// block its lines (a line at least: an empty one is a line high), a list its items (each its lines
// and what it holds, at the list's indent; the gap between two above the second), a quote its blocks
// (at its indent, its padding above and below), a divider its line; any other block more than any
// card (Infinity: a step holding it reads beside no other).
function blockHeight(block, width) {
  const inner = width - (block.indent ?? 0);
  if (block.pieces) return Math.max(1, linesOf(block.pieces, inner)) * block.line;
  if (block.items) return block.items.reduce((sum, item, index) => sum + (index > 0 ? item.gap : 0) + Math.max(1, linesOf(item.pieces, inner)) * item.line + stackHeight(item.blocks, inner), 0);
  if (block.blocks) return block.down + stackHeight(block.blocks, inner);
  return block.height ?? Infinity;
}
// The height (px) of blocks one under another after words (a title, an item's text) or inside
// padding (a card's, a quote's), with their margins as the browser lays them: the first one's above
// it (`gap`), between two the larger of the one's below (`after`) and the next one's above (they
// collapse), and the last one's below.
function stackHeight(blocks, width) {
  let height = 0;
  let below = 0; // the margin under the block before
  blocks.forEach((block, index) => {
    height += (index === 0 ? block.gap : Math.max(below, block.gap)) + blockHeight(block, width);
    below = block.after ?? 0;
  });
  return height + below;
}

/**
 * The height (px) a step's card takes at the width `content` (px) of its words: its padding and
 * border (`down`), its title's lines (a line at least), and the blocks of its content after them
 * with their margins (stackHeight).
 */
export function cardHeight(step, content) {
  return step.down + Math.max(1, linesOf(step.title.pieces, content)) * step.title.line + stackHeight(step.blocks, content);
}

// ---------- the rows ----------

// Whether a step fits `width` (px) at all: FLOW_ROW.least, and its longest word with what stands beside it.
const fits = (step, width) => width >= Math.max(FLOW_ROW.least, step.word);
// Whether it reads well that wide beside others: its title on FLOW_ROW.title lines at most, its card
// no taller than it is wide.
const reads = (step, width) => linesOf(step.title.pieces, width - step.across) <= FLOW_ROW.title && cardHeight(step, width - step.across) <= width;

/**
 * The shares of a row's width its steps take (adding up to 1): each its weight (`ratios`, the steps'
 * --doc-flow-ratio, a positive number or null) among the row's, a step with none weighing as the
 * row's weighted ones do on the whole (equal where none has one); one alone in its row all of it.
 * The shared description's rule (flowShares), which the page editor's gaps start a drag from.
 */
export const sharesOf = (row, ratios = []) => flowShares(row.map((index) => ratios[index] ?? null));

/**
 * A flowchart's layout: from its width (px), its steps as measured (`steps`: each { word, across,
 * down, title, blocks }: the width its card needs at least for its longest word and what stands
 * beside it, its padding and border across and down, its title's pieces and line height, and the
 * blocks it holds after it, stepShape), the direction of the whole (`direction`: "row", "column" or
 * null, 自动), each step's own (`directions`, for the joint after it: the same, null following the
 * whole) and its weight (`ratios`). { rows, nodes }: the rows, each the indexes of its steps in
 * order; and for each step its row (`row`), its place in it (`index`) and the row's length (`count`),
 * its share of the row's width (`share`) and the shares before it (`before`), and where its arrow
 * goes (`out`): "right" to the next step beside it, "down" to the next row's first step right under
 * it (it stands alone in its row), "turn" from the row's end to the next row's start, null for the
 * last step; and whether it is written the short way (`short`: its own words its title, stepShape).
 * A flowchart not shown (no width: a hidden panel) is one step a row, laid out again when it is.
 */
export function flowLayout({ width, steps, direction = null, directions = [], ratios = [] }) {
  const rows = [];
  if (steps.length > 0) {
    let row = [0];
    for (let next = 1; next < steps.length; next++) {
      const way = directions[next - 1] ?? direction;
      const candidate = [...row, next];
      // Each card at its share (`weighed`: the steps' weights, the reader's; else equal) passing `test`.
      const each = (test, weighed) => {
        const shares = weighed ? sharesOf(candidate, ratios) : candidate.map(() => 1 / candidate.length);
        return candidate.every((index, place) => test(steps[index], (width - FLOW_ROW.gap * (candidate.length - 1)) * shares[place]));
      };
      const join = width > 0 && way !== "column" && each(fits, true)
        && (way === "row" || (width >= FLOW_ROW.narrow && candidate.length <= FLOW_ROW.most && each(reads, false)));
      if (join) row = candidate;
      else {
        rows.push(row);
        row = [next];
      }
    }
    rows.push(row);
  }
  const nodes = [];
  rows.forEach((row, at) => {
    const shares = sharesOf(row, ratios);
    let before = 0;
    row.forEach((step, index) => {
      const last = step === steps.length - 1;
      const out = last ? null : index < row.length - 1 ? "right" : index === 0 ? "down" : "turn";
      nodes[step] = { row: at, index, count: row.length, share: shares[index], before, out, short: Boolean(steps[step].short) };
      before += shares[index];
    });
  });
  return { rows, nodes };
}

/**
 * How far a turning arrow reaches left (`out` "turn"), from its step's number column to the next
 * row's first step's, the first of the row standing at the flowchart's left edge: the widths of the
 * steps before it in its row and the gaps between them, as a calc() of the step's own width (its
 * ::after's 100%, its border inside: 1px each side), so it holds at any width the row is drawn at.
 * `px` (the flowchart's width) gives it in pixels instead.
 */
export function reachOf(node, px = null) {
  const gaps = node.index * FLOW_ROW.gap;
  if (px !== null) return (px - FLOW_ROW.gap * (node.count - 1)) * node.before + gaps;
  return `calc((100% + 2px) * ${number(node.before / node.share)} + ${gaps}px)`;
}
const number = (value) => String(Math.round(value * 100000) / 100000);

/**
 * The rules flowchart `key` (its data-doc-flow-key) is laid out with, `layout` being flowLayout's:
 * its steps in rows, unless it is one step a row (the stylesheet's own column): each step's basis
 * its share of the row less the row's gaps, a pixel less, its growth the pixel back, so the row is
 * full and the next step cannot join it; the arrow across after each step but a row's last, and a
 * turning one after a row's last that has steps before it. And for a step written the short way,
 * the list's gap above its first block, under its own words (a node's first block is its title,
 * with none). On paper: `keep`, the flowchart kept on one page (it fits on one: its rows and the
 * arrows between them never parted by a page's break); `cut`, the steps whose arrow down to the
 * next row a page's break parts from it (pagedApart), drawn with none. "" for none of these.
 */
export function flowRules(key, { rows, nodes }, { cut = [], keep = false } = {}) {
  const list = `ol.${FLOW}[${FLOW_KEY}="${key}"]`;
  const at = (step) => `${list} > li:nth-of-type(${step + 1})`;
  const rules = [];
  if (rows.some((row) => row.length > 1)) {
    rules.push(`${list} { flex-flow: row wrap; column-gap: ${FLOW_ROW.gap}px; }`);
    nodes.forEach((node, step) => {
      const basis = node.count === 1 ? "100%" : `calc((100% - ${(node.count - 1) * FLOW_ROW.gap}px) * ${number(node.share)} - 1px)`;
      rules.push(`${at(step)} { flex: 1 1 ${basis}; }`);
      if (node.out === "right") rules.push(`${at(step)}::after { top: calc(9px + var(--doc-flow-mid) - 5px); left: calc(100% + 5px); width: 20px; height: 10px; clip-path: var(--doc-flow-right); }`);
      if (node.out === "turn") rules.push(`${at(step)}::after { --doc-flow-reach: ${reachOf(node)}; left: calc(18px - var(--doc-flow-reach)); width: calc(var(--doc-flow-reach) + 10px); clip-path: var(--doc-flow-turn-shape, none); -webkit-mask: var(--doc-flow-turn-mask, var(--doc-flow-turn)); mask: var(--doc-flow-turn-mask, var(--doc-flow-turn)); }`);
    });
  }
  nodes.forEach((node, step) => {
    if (node.short) rules.push(`${at(step)} > :is(:first-child, .doc-icon + *):not(.doc-icon, div, figure, details, table, pre) { margin-top: var(--doc-list-gap); }`);
  });
  if (keep) rules.push(`@media print { ${list} { break-inside: avoid; } }`);
  for (const step of cut) rules.push(`${at(step)}::after { content: none; }`);
  return rules.join("\n");
}

/**
 * On paper, the steps whose arrow down to the next row a page's break parts from it: the last step of
 * each row the next one does not stand `gap` (px, the list's row gap) under, as the browser lays the
 * page out in pages (a page break between them: the next row starts the next page). `rows`: the
 * layout's; `rects`: each step's box as printed (getBoundingClientRect while the page is laid out
 * for paper), a step not drawn (no width) left out of its row's measure. Such an arrow would point at
 * nothing at the foot of a page, or be cut by its edge and drawn awry: it is left out (flowRules `cut`).
 */
export function pagedApart(rows, rects, gap) {
  const shown = (row) => row.filter((step) => rects[step]?.width > 0);
  const cut = [];
  for (let at = 0; at + 1 < rows.length; at++) {
    const here = shown(rows[at]);
    const next = shown(rows[at + 1]);
    if (here.length === 0 || next.length === 0) continue;
    const bottom = Math.max(...here.map((step) => rects[step].bottom));
    const top = Math.min(...next.map((step) => rects[step].top));
    if (Math.abs(top - bottom - gap) > 1) cut.push(rows[at].at(-1));
  }
  return cut;
}

// ---------- a step measured ----------

// The blocks a step holds: its title (a paragraph first, or its own words, written the short way) and
// its content (a paragraph, a list, a picture…), of which text blocks (TEXTS), lists, quotes and
// dividers are measured. Its icon (a lead div.doc-icon) stands in its number's place: no block.
const BLOCKS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "UL", "OL", "DIV", "FIGURE", "BLOCKQUOTE", "DETAILS", "HR", "TABLE", "PRE"]);
const TEXTS = new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6"]);
const ICON = "doc-icon";
const ownNodes = (item) => [...item.childNodes].filter((node) => node.nodeType === 3 || (node.nodeType === 1 && !BLOCKS.has(node.tagName)));
const ownText = (item) => ownNodes(item).map((node) => node.textContent).join("");
const pixels = (value) => parseFloat(value) || 0;
const across = (style) => pixels(style.paddingLeft) + pixels(style.paddingRight) + pixels(style.borderLeftWidth) + pixels(style.borderRightWidth);
const down = (style) => pixels(style.paddingTop) + pixels(style.paddingBottom) + pixels(style.borderTopWidth) + pixels(style.borderBottomWidth);
const lineOf = (style) => pixels(style.lineHeight) || (pixels(style.fontSize) || 16) * 1.2;

// The 2D context words are measured with; where the browser has none, a word is taken as a full
// width for each wide character and 0.6 of it for any other (wider than most).
let context;
function measurer(style) {
  context ??= document.createElement("canvas").getContext?.("2d") ?? null;
  const size = pixels(style.fontSize) || 16;
  if (!context) return (text) => [...text].reduce((sum, character) => sum + size * (WIDE.test(character) ? 1 : 0.6), 0);
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  return (text) => {
    context.font = font;
    return context.measureText(text).width;
  };
}
// A text's pieces in a style (linesOf), and the widest of its words. A long run (a path, a URL:
// src/shared/long-runs.mjs, which the kit holds in a span that breaks anywhere, runtime/spacing.js),
// and every run where the line breaks anywhere (word-break: break-all: a block the page editor marks
// for holding a long run, editor/page/long-runs.mjs), is a piece a character, the line ending inside
// it as the browser's does; an ordinary word is one piece. `split` false keeps every run whole (the
// widest word: a card is never narrower than it, flowLayout's fits).
function piecesOf(text, style, split = true) {
  const measure = measurer(style);
  const space = measure(" ");
  const anywhere = split && style.wordBreak === "break-all";
  const pieces = [];
  let widest = 0;
  for (const piece of String(text).match(PIECES) ?? []) {
    if (/^\s/.test(piece)) {
      pieces.push({ width: space, space: true });
      continue;
    }
    const width = measure(piece);
    widest = Math.max(widest, width);
    if (split && !WIDE.test(piece) && (anywhere || holdsLongRun(piece))) for (const character of piece) pieces.push({ width: measure(character) });
    else pieces.push({ width });
  }
  return { pieces, widest };
}
// The pieces of the text of `nodes` (a block's children, or a step's or an item's own words) in
// `style`, its inline code each in its own font (monospace, wider than the words around it) with its
// padding and border at its ends: a word of code is as wide as it is drawn, so a step holding one
// (http://localhost:5180) is not laid out narrower than it and broken inside it. A piece running on
// from the words before it to the code (no space or Chinese character between) is one piece. Text
// holding no code is measured as before, all in `style` (piecesOf).
function inlinePieces(nodes, style) {
  const holds = (node) => node.nodeType === 1 && (node.tagName === "CODE" || node.querySelector("code"));
  if (!nodes.some(holds)) return piecesOf(nodes.map((node) => node.textContent).join(""), style);
  const segments = []; // { text, code }: the text in order, each run of code its own
  const walk = (node, code) => {
    if (node.nodeType === 3) {
      const last = segments.at(-1);
      if (last && last.code === code) last.text += node.textContent;
      else segments.push({ text: node.textContent, code });
    } else if (node.nodeType === 1) node.childNodes.forEach((child) => walk(child, code ?? (node.tagName === "CODE" ? node : null)));
  };
  nodes.forEach((node) => walk(node, null));
  const collect = (split) => {
    const pieces = [];
    let joins = false; // whether the last piece runs on into the next segment's first
    for (const { text, code } of segments) {
      if (!text) continue;
      const look = code ? getComputedStyle(code) : style;
      const own = piecesOf(text, look, split).pieces;
      if (code && own.length) {
        own[0].width += pixels(look.paddingLeft) + pixels(look.borderLeftWidth);
        own.at(-1).width += pixels(look.paddingRight) + pixels(look.borderRightWidth);
      }
      own.forEach((piece, at) => {
        if (at === 0 && joins && !piece.space && !WIDE.test(text[0])) pieces.at(-1).width += piece.width;
        else pieces.push(piece);
      });
      joins = !/\s$/.test(text) && !WIDE.test(text.at(-1));
    }
    return { pieces, widest: Math.max(0, ...pieces.filter((piece) => !piece.space).map((piece) => piece.width)) };
  };
  // The widest word whole (code and the words it runs on from one), the pieces as the line breaks.
  const whole = collect(false);
  return { pieces: collect(true).pieces, widest: whole.widest };
}

// Blocks (an item's, a quote's, a step's content) measured for blockHeight, and the width the widest
// word of them needs with the indents it stands in: { blocks, word }. A block with no box (an empty
// picture, file, bookmark or embed, which a reader is not shown: media.css) is not measured.
function contentOf(elements) {
  const blocks = [];
  let word = 0;
  for (const block of elements) {
    if (!BLOCKS.has(block.tagName)) continue;
    const look = getComputedStyle(block);
    if (look.display === "none") continue;
    const measured = blockShape(block, look);
    blocks.push(measured.block);
    word = Math.max(word, measured.word);
  }
  return { blocks, word };
}
// A block of a step's content measured, with its margins above and below (`gap`, `after`): a text
// block its pieces and line height; a list (but a flowchart) its items', each with what it holds, and
// its indent (its padding, where its markers stand); a quote its blocks, its indent and its padding; a
// divider its line; any other block its margins alone (blockHeight: it reads beside no other).
// { block, word }.
function blockShape(block, look) {
  const margins = { gap: pixels(look.marginTop), after: pixels(look.marginBottom) };
  if (TEXTS.has(block.tagName)) {
    const words = inlinePieces([...block.childNodes], look);
    return { block: { ...margins, pieces: words.pieces, line: lineOf(look) }, word: words.widest };
  }
  if ((block.tagName === "UL" || block.tagName === "OL") && !block.classList.contains(FLOW)) {
    const indent = pixels(look.paddingLeft) + pixels(look.borderLeftWidth);
    const items = [];
    let word = 0;
    for (const item of block.children) {
      if (item.tagName !== "LI") continue;
      const style = getComputedStyle(item);
      const words = inlinePieces(ownNodes(item), style);
      const held = contentOf(item.children);
      items.push({ gap: pixels(style.marginTop), pieces: words.pieces, line: lineOf(style), blocks: held.blocks });
      word = Math.max(word, words.widest, held.word);
    }
    return { block: { ...margins, indent, items }, word: word + indent };
  }
  if (block.tagName === "BLOCKQUOTE") {
    const indent = pixels(look.paddingLeft) + pixels(look.borderLeftWidth);
    const held = contentOf(block.children);
    return { block: { ...margins, indent, down: down(look), blocks: held.blocks }, word: held.word + indent };
  }
  if (block.tagName === "HR") return { block: { ...margins, height: pixels(look.height) + down(look) }, word: 0 };
  return { block: margins, word: 0 };
}

// A step's title: its first paragraph, as a node writes it (<p><strong>…</strong></p>: its words
// measured in the bold they are drawn in, a paragraph all of one element taking that element's
// font), or, written the short way, its own words before its blocks (the kit draws them bold). Its
// content is what comes after it. { nodes, style, line, content, short } (`nodes`: what holds its
// words, measured by inlinePieces; `short`: its own words).
function titleOf(item, style) {
  const blocks = [...item.children].filter((child) => BLOCKS.has(child.tagName) && !child.classList.contains(ICON));
  const own = ownText(item);
  const short = /\S/.test(own);
  const [first] = blocks;
  if (short || first?.tagName !== "P") return { nodes: ownNodes(item), style, line: lineOf(style), content: blocks, short };
  const look = getComputedStyle(first);
  const whole = first.children.length === 1 && first.textContent === first.firstElementChild.textContent ? getComputedStyle(first.firstElementChild) : look;
  return { nodes: [...first.childNodes], style: whole, line: lineOf(look), content: blocks.slice(1), short };
}

/**
 * A step of the page measured for flowLayout: its longest word's need, its padding and border, its
 * title, its content (contentOf), and whether it is written the short way.
 */
export function stepShape(item) {
  const style = getComputedStyle(item);
  const title = titleOf(item, style);
  const words = inlinePieces(title.nodes, title.style);
  const content = contentOf(title.content);
  return { word: Math.ceil(Math.max(words.widest, content.word) + across(style)), across: across(style), down: down(style), title: { pieces: words.pieces, line: title.line }, blocks: content.blocks, short: title.short };
}

const DIRECTIONS = ["row", "column"];
const directionOf = (element) => (DIRECTIONS.includes(element.getAttribute(FLOW_DIRECTION)) ? element.getAttribute(FLOW_DIRECTION) : null);
// A step's weight, as its style attribute writes it (--doc-flow-ratio: .4): a positive number, else none.
const RATIO = new RegExp(`(?:^|;)\\s*${FLOW_RATIO}\\s*:\\s*([^;]*)`);
const ratioOf = (step) => {
  const value = Number(RATIO.exec(step.getAttribute("style") ?? "")?.[1].trim());
  return value > 0 && Number.isFinite(value) ? value : null;
};
const stepsOf = (list) => [...list.children].filter((child) => child.tagName === "LI");

/** The layout a flowchart on the page takes now (it reads the page). */
export function layoutOf(list) {
  const steps = stepsOf(list);
  return flowLayout({ width: list.clientWidth, steps: steps.map(stepShape), direction: directionOf(list), directions: steps.map(directionOf), ratios: steps.map(ratioOf) });
}

// ---------- the stylesheet ----------

// The tallest a flowchart drawn at a page's width is kept on one printed page at (px): a Letter page's
// height inside its 1-inch margins, the shortest of the papers the workbench's PDF prints on (864px at
// 100%), a little to spare.
const PAGE = 840;

// Every flowchart of the document is laid out in one stylesheet, made by the kit and adopted by the
// document (never an element of the page), its rules each flowchart's by its key.
let sheet = null;
const rules = new Map(); // key -> its rules
const live = new Map(); // key -> the flowchart it names
function writeRules(document, key, text) {
  if ((rules.get(key) ?? "") === text) return;
  if (text) rules.set(key, text);
  else rules.delete(key);
  if (!sheet) {
    sheet = new document.defaultView.CSSStyleSheet();
    document.adoptedStyleSheets = [...(document.adoptedStyleSheets ?? []), sheet];
  }
  sheet.replaceSync([...rules.values()].join("\n"));
}
// The key a flowchart is laid out by: the one it carries when no other flowchart has it (one put back
// by an undo keeps its own, nothing written), else a new one.
function keyFor(list) {
  const own = list.getAttribute(FLOW_KEY);
  if (own && !live.has(own)) return own;
  let next = live.size + 1;
  while (live.has(String(next))) next++;
  list.setAttribute(FLOW_KEY, String(next));
  return String(next);
}

// Chrome may leave a step's number (counter(list-item) in its ::before) as it was drawn when items
// come, go or move after the page was drawn (before steps were nodes, an item the page editor's Tab
// put in the step before it left the steps after it their old numbers; nodes the editor adds,
// deletes or drags come and go the same way): the numbers taken off for a moment (FLOW_RECOUNT, the
// stylesheet's content: none) and the style worked out with them off, they are drawn again, counted
// afresh. Only the numbers change, nothing of the layout, so the page keeps its height and its scroll
// position.
function recount(list) {
  const first = list.querySelector(":scope > li");
  if (!first) return;
  list.setAttribute(FLOW_RECOUNT, "");
  void getComputedStyle(first, "::before").content;
  list.removeAttribute(FLOW_RECOUNT);
}

/**
 * Starts the flowchart `list` (DocKit's mount, runtime/index.js): its key given, its layout worked
 * out in the kit's frame, again as its direction or a step's direction or weight changes (the page
 * editor's 方向, a width dragged) and as the kit tells it its width, the fonts or its content changed
 * (its numbers drawn again when items came, went or moved); its name given when it has none.
 */
export function startFlowchart(list, { signal, frame }) {
  const named = !list.hasAttribute("aria-label") && !list.hasAttribute("aria-labelledby");
  if (named) list.setAttribute("aria-label", say("flowchart"));
  const key = keyFor(list);
  live.set(key, list);
  let moved = false; // items came, went or moved since it was last drawn
  // On paper a flowchart that fits on a page is kept on one, so no arrow from a row's end stands at a
  // page's foot pointing at nothing or is cut by its edge (`keep`): one as tall as it is drawn here at
  // most PAGE (a page printed as the workbench's PDF prints one, which lays the page out at the paper's
  // width first); one taller breaks between its rows from where it stands, rather than starting a
  // page left empty before it for nothing.
  let keep = true;
  const lay = () => frame(() => {
    if (moved) recount(list);
    moved = false;
    const layout = layoutOf(list);
    writeRules(list.ownerDocument, key, flowRules(key, layout, { keep }));
    const fits = list.getBoundingClientRect().height <= PAGE;
    if (fits === keep) return;
    keep = fits;
    writeRules(list.ownerDocument, key, flowRules(key, layout, { keep }));
  });
  // Printed (Ctrl+P, a PDF the browser prints): as the browser lays the page out for paper, the
  // print media matching, the page is laid out at the paper's width already, in its pages; the
  // layout is worked out there at once (the browser prints right after), 自动 measuring at the
  // printed width as it does on screen. Kept on one page; one a page's break still parts is taller
  // than a page, and breaks between its rows from where it stands, the arrows its breaks part from
  // their rows left out (pagedApart). Laid out for the screen again after.
  const forPaper = () => {
    const layout = layoutOf(list);
    const document = list.ownerDocument;
    const apart = () => pagedApart(layout.rows, stepsOf(list).map((step) => step.getBoundingClientRect()), pixels(getComputedStyle(list).rowGap));
    writeRules(document, key, flowRules(key, layout, { keep: true }));
    if (apart().length === 0) return;
    writeRules(document, key, flowRules(key, layout));
    const cut = apart();
    if (cut.length > 0) writeRules(document, key, flowRules(key, layout, { cut }));
  };
  const paper = list.ownerDocument.defaultView?.matchMedia?.("print") ?? null;
  paper?.addEventListener("change", (event) => (event.matches ? forPaper() : lay()), { signal });
  // Its direction, a step's direction or weight (a style attribute, in it or deeper: a picture's
  // width changes a card's height).
  const directions = new MutationObserver(lay);
  directions.observe(list, { attributes: true, attributeFilter: [FLOW_DIRECTION, "style"], subtree: true });
  signal.addEventListener("abort", () => directions.disconnect());
  lay();
  return {
    update(reason, records) {
      if (reason === "content" && records.some((record) => record.type === "childList")) moved = true;
      lay();
    },
    // Gone from the page (turned into another kind of list, deleted): its rules go, and the name it
    // was given with it; its key stays on it, so put back (an undo) it is laid out by the same.
    destroy() {
      if (live.get(key) === list) live.delete(key);
      writeRules(list.ownerDocument, key, "");
      if (named && isFlowLabel(list.getAttribute("aria-label"))) list.removeAttribute("aria-label");
    },
  };
}

/** A copy of a flowchart (an export of the current view): the name the kit gave it off (the copy's kit gives it again; its key the description's runtime marks take off). */
export function dehydrateFlowchart(list) {
  if (isFlowLabel(list.getAttribute("aria-label"))) list.removeAttribute("aria-label");
}

/** The selector of the flowcharts the kit starts. */
export const FLOWCHART = `ol.${FLOW}`;
