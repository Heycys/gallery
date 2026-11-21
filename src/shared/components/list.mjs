// A bulleted, numbered or to-do list or a flowchart, and its items (an item may hold lists of its own): a basic
// block. An item holds blocks after its text (HELD_TAGS); one of a list the kit draws the markers of
// with no text of its own over them keeps a line of its own, its marker on it and they under it: a line
// break ahead of them (ITEM_LINE), which the page editor and the kit put there by one rule (keepsLine),
// the file staying as written.
// Its markers are the kit's, blue: bullets a dot, a ring, a square by depth;
// numbers 1., a., i. by depth. A numbered list counts from its start, or on from the numbered list
// before it in the same flow (data-continue: the editor keeps its start in step). A to-do list
// has a box before each item, filled and checked for an item carrying data-checked.
// A flowchart (流程图, ol.doc-flow) draws its items as the steps of a process: each a node, a
// container as a highlight block is, drawn as a card with its number (or its icon, a lead
// div.doc-icon, in the number's place), arrows between them. A node holds blocks: its first a
// paragraph, its title (<p><strong>…</strong></p>: bold by default, the <strong> the reader's to
// take off), the blocks after it its content (a list there any list, its markers from the first
// depth). The kit lays the nodes out in rows that fill their width (the list's data-direction and
// each node's, and what the kit measures where neither says), a node's --doc-flow-ratio its
// weight in its row, and turns the arrow from a row's last node to the next row's first. A step
// written the short way, its own words first (<li>收集数据<p>…</p></li>), is drawn the same, its words
// its bold title (the editor rewrites it as a node: natural.mjs).

/** A flowchart's class (流程图), on an ol. */
export const FLOW = "doc-flow";
/** A to-do list's class (待办事项), on a ul: a box before each item where a bullet would be. */
export const TODO = "doc-todo";
/** The tags of the blocks a list item may hold after its text (the file's and the page's alike). */
export const HELD_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "div", "figure", "blockquote", "details", "hr", "table", "pre"]);
/**
 * The class of the line break ahead of the blocks an item holds where it keeps a line of its own
 * (keepsLine), so that its marker stands on that line: the kit's (runtime/spacing.js) and the page
 * editor's (keepLine) alike, never written by an author, taken off a copy.
 */
export const ITEM_LINE = "doc-item-line";

// Whether `node` is a list whose items' markers the kit draws (styles/flow.css, todo.css): a bulleted
// or numbered list with no class of its own, or a to-do list (a flowchart holds them in its steps). A
// function, so that a kit script reading only other names of this module leaves it out.
const kitList = (node) => Boolean(node?.matches(`ul:not([class]), ol:not([class]), ul.${TODO}`));
// No text: white space and format characters (the zero-width space the page editor keeps after a mark).
const BLANK = /^[\s\p{Cf}]*$/u;
// What shows with no text in it: a picture, a control, a line break.
const SHOWS = "img, picture, svg, video, audio, canvas, iframe, object, input, br";
const isHeld = (node) => node.nodeType === 1 && HELD_TAGS.has(node.localName);
// A node standing for none of an item's text: white space or a comment; ahead of the blocks it
// holds, an element with no text in it and nothing that shows too (an empty bold or link, which the
// page editor writes as nothing).
const blank = (node) => (node.nodeType === 3 ? BLANK.test(node.data) : node.nodeType !== 1);
const textless = (node) => blank(node) || (node.nodeType === 1 && BLANK.test(node.textContent) && !node.matches(SHOWS) && !node.querySelector(SHOWS));

// Whether `list` is one whose items' markers the kit draws in a flow (`flows`): straight in it, in a
// flowchart's step standing in one, or held by an item of such a list.
function drawnList(list, flows) {
  for (let at = list; kitList(at) || (at !== list && at?.matches(`ol.${FLOW}`));) {
    const holder = at.parentElement;
    if (holder?.localName !== "li") return Boolean(holder?.matches(flows));
    at = holder.parentElement;
  }
  return false;
}

/**
 * Whether the list item `item` keeps a line of its own ahead of the blocks it holds, its marker on it
 * and they under it, as an item keeps its title line however empty: the one rule the page
 * editor (keepLine, editor core.mjs) and the kit (runtime/spacing.js) give an item that line by. It is an
 * item of a list whose markers the kit draws (drawnList; `flows`: the selector of the elements blocks
 * stand straight in, FLOW_BLOCKS of index.mjs), holding blocks (HELD_TAGS) and nothing but blocks and
 * white space after the first, with no text of its own ahead of them (textless: no line break there
 * either, which is that line). An item of a list with a class of its own, or of one in a whole block, a
 * card or a table's cell, never does: its look is the document's, a widget's grid or flex item laid
 * out by its children.
 */
export function keepsLine(item, flows) {
  const nodes = [...item.childNodes];
  const first = nodes.findIndex(isHeld);
  return first >= 0 && nodes.slice(0, first).every(textless) && nodes.slice(first).every((node) => isHeld(node) || blank(node)) && drawnList(item.parentElement, flows);
}

/** Gives the list item `item` its line where it keeps one (keepsLine): a line break of the class ITEM_LINE ahead of the blocks it holds. Returns whether it did. */
export function giveLine(item, flows) {
  if (!keepsLine(item, flows)) return false;
  const line = item.ownerDocument.createElement("br");
  line.className = ITEM_LINE;
  [...item.childNodes].find(isHeld).before(line);
  return true;
}
/** The attribute an author lays a flowchart out with, on the list and on a step: row or column (none: the kit measures, or the list's). */
export const FLOW_DIRECTION = "data-direction";
/** A node's weight in its row (a share: the row's nodes laid out in proportion), in its style attribute. */
export const FLOW_RATIO = "--doc-flow-ratio";
/** What the kit names a flowchart by in the stylesheet it lays it out with (runtime/flowchart.js): never written by an author, taken off a copy. */
export const FLOW_KEY = "data-doc-flow-key";
/** Set by the kit for a moment as items move, so that the browser draws the steps' numbers again (runtime/flowchart.js recount): never left on the page. */
export const FLOW_RECOUNT = "data-doc-flow-recount";
/**
 * What a screen reader calls a flowchart the author gave no name (aria-label) of its own: the kit's name
 * for it, in the language the kit speaks on the page (src/render/kit/words.js "flowchart"); either one is
 * the kit's, never the author's.
 */
export const FLOW_LABEL = { zh: "流程图", en: "Flowchart" };
/** Whether an aria-label is the name the kit gave a flowchart (in either language). */
export const isFlowLabel = (value) => Object.values(FLOW_LABEL).includes(value);

/**
 * What a flowchart's rows go by (the kit lays them out by it, src/render/kit/runtime/flowchart.js;
 * the page editor's gaps keep a node's card no narrower than the kit would, page/columns/): at most
 * `most` nodes a row the kit fills (自动), each card `least` wide at least (px), `gap` between two in
 * a row (px; styles/flowchart.css spells the same gap and the one between rows), a row of the kit's
 * in a flowchart `narrow` wide at least (px), each node's title on `title` lines at most. Pure, so
 * that a kit script reading only other names of this module leaves it out.
 */
export const FLOW_ROW = /* @__PURE__ */ Object.freeze({ most: 5, least: 116, narrow: 520, gap: 28, title: 2 });

/**
 * The shares of their row's width the nodes of a row take (adding up to 1), from their weights
 * (--doc-flow-ratio: a positive number, or null for none): each its weight among the row's, a node
 * with none weighing as the row's weighted ones do on the whole (equal where none has one); one
 * alone in its row all of it. The kit lays a row out by it, and the page editor's gaps start from it.
 */
export function flowShares(weights) {
  if (weights.length === 1) return [1];
  const given = weights.filter((weight) => weight > 0);
  const fill = given.length ? given.reduce((sum, weight) => sum + weight, 0) / given.length : 1;
  const each = weights.map((weight) => (weight > 0 ? weight : fill));
  const all = each.reduce((sum, weight) => sum + weight, 0);
  return each.map((weight) => weight / all);
}

// The description's keys are written out (FLOW_DIRECTION, FLOW): a computed key would keep it in the
// kit's runtime, which imports the names above alone (esbuild drops an unused object of literal keys only).
export default {
  id: "list",
  category: "block",
  match: "ul, ol",
  classes: [TODO, FLOW],
  attrs: {
    start: "an ol's first number (from 1)",
    "data-continue": "an ol that counts on from the numbered list before it in the same flow (its start the next number)",
    "data-checked": "a checked item of a to-do list (ul.doc-todo)",
    "data-direction": "a flowchart's layout (ol.doc-flow), on the list and on a step: row, the next step beside this one (on the list: every step in one row, wrapping only where a card would be narrower than 116px or than its longest word), or column, the row ending here (on the list: one step a row); none on the list, the kit fills rows with as many steps as read well and wraps the rest; none on a step, the list's",
  },
  runtime: {
    // The stylesheet the kit lays a flowchart out with is keyed by it; the numbers drawn again (src/render/kit/runtime/flowchart.js).
    attrs: { "ol.doc-flow": [FLOW_KEY, FLOW_RECOUNT] },
    // The line of an item with no text of its own over the blocks it holds (src/render/kit/runtime/spacing.js).
    generated: ["br.doc-item-line"],
  },
};
