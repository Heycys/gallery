// The cards of an AI answer's HTML (the user's, 2026-11-20): ChatGPT draws some of an answer as cards
// (a layered architecture, a row of small boxes, a list of scenes with their pictures) and its copy
// button puts them on the clipboard as nothing but nested <div>s holding <p>s and spans, with no class,
// style or attribute to say what they were. Normalizing (html.mjs) unwraps every such div, so they
// would come in as a run of paragraphs; they are read from their structure here, before html.mjs
// normalizes the HTML, and made the page's own plain blocks: a card a highlight block
// (高亮块, no icon) of its lines, small boxes side by side columns (分栏). No look of ChatGPT's is kept.
//
// Only HTML with no look of its own (bareHtml): no element outside code and formulas carries any
// attribute but the content's (href, src, alt, a cell's spans…). Copies from web pages (Chrome writes
// each element's style), Word, Google Docs, Feishu, Notion and Yuque (classes, styles, data-*) carry
// theirs, so their divs stay wrappers as before; a document's HTML the page or an export wrote has the
// kit's classes. Office's HTML, which its Word filter leaves bare, is never read for cards (read.mjs),
// nor is anything but a paste (a Markdown document's HTML blocks, an import).
//
// What a div is (kindOf; a wrapper, a div of one part, is what that part is):
//   line   one line of words: a <p>, words straight in a div
//   card   two or more parts, at least one of them a <p> or a list of its own; the others lines
//          (words straight in it too), lists, cards and rows of cells (a card in a card gives its
//          lines). Two or more divs alone, one of them a card and the rest lines (a picture's link
//          beside a scene's words), are one card too
//   grid   two or more divs alone, all cards, or all lines of at most SHORT characters each a <p> in
//          its div (labels): cells side by side. Words straight in divs (a text editor's lines,
//          <div>a</div><div>b</div>) are never cells, nor a card; a long line in a div is a paragraph
//          some page wrapped
//   flow   anything else, or anything holding a heading, a table, a quote, code, a picture, a rule, a
//          disclosure or a formula block: a wrapper of the answer's (a section, a table's frame, a
//          diagram of cards and arrows), whose divs are read in turn
// The answer's own wrappers (from the clipboard's root down while a div holds one part) are never a
// card; when they come down to a grid (a row of cards copied alone), that is its rows.
// What each becomes (html.mjs reads the marks: BOX, and the columns' attributes, COLUMN_LIST and COLUMN):
//   card → a box (BOX): its lines paragraphs (bold and links kept), its lists as they are, its rows
//          of cells columns of their lines; no box inside a box
//   grid → rows of columns, at most 3 cells a row and rows as even as they go (4: 2 + 2, 6: 3 + 3), a
//          cell a box of its lines (in a box, the lines alone); cells of more than LONG characters go
//          one under another (boxes, or in a box their lines). In a column (a box of a grid), a grid's
//          cells are lines: no row of columns in a column
//   an empty div (an arrow, a rule ChatGPT draws) nothing; a line its paragraph, as before.

export const BOX = "data-paste-box";
const COLUMN_LIST = "data-notion-column-list"; // html.mjs ATTR.columnList
const COLUMN = "data-notion-column-ratio"; // html.mjs ATTR.column (empty: the columns share the row)
const LONG = 80; // a cell of more characters: cells one under another
const SHORT = 40; // a line cell of at most this many characters (a label)
const PER_ROW = 3;

const INLINE = new Set(["a", "abbr", "b", "bdi", "bdo", "br", "cite", "code", "del", "dfn", "em", "font", "i", "ins", "kbd", "label", "mark", "q", "s", "samp", "small", "span", "strike", "strong", "sub", "sup", "time", "u", "var", "wbr"]);
// What a card never holds: a block that is no line or list. A display formula is a div of
// data-notion-equation (math.mjs).
const BREAKS = "h1, h2, h3, h4, h5, h6, table, blockquote, pre, hr, img, picture, figure, details, iframe, video, audio, dl, section, article, aside, header, footer, nav, form, svg, canvas, [data-notion-equation]";
const LISTS = new Set(["ul", "ol"]);
// The attributes of content, not of a look; elements of their own markup (code, formulas) are not looked into.
const CONTENT = new Set(["href", "src", "alt", "title", "colspan", "rowspan", "start", "reversed", "type", "checked", "disabled", "value", "width", "height", "target", "rel", "lang", "dir", "data-notion-equation", "data-notion-inline-equation"]);
const OPAQUE = "pre, code, svg, math, [data-notion-equation], [data-notion-inline-equation]";

const tagOf = (node) => (node?.nodeType === 1 ? node.localName : "");
const plainDiv = (node) => tagOf(node) === "div" && node.attributes.length === 0;
const said = (node) => (node.textContent ?? "").replace(/[\s\u200b]+/g, "") !== "" || (node.nodeType === 1 && (node.matches(BREAKS) || Boolean(node.querySelector(BREAKS))));

/** Whether the HTML has no look of its own: no element outside code and formulas has an attribute but the content's. */
export function bareHtml(root) {
  return (function bare(element) {
    for (const child of element.children) {
      if (child.matches(OPAQUE)) continue;
      if ([...child.attributes].some((a) => !CONTENT.has(a.name.toLowerCase())) || !bare(child)) return false;
    }
    return true;
  })(root);
}

// An element's parts: its runs of words (text and inline elements together) and its other elements,
// those that say nothing left out.
function partsOf(element) {
  const parts = [];
  let run = null;
  for (const node of element.childNodes) {
    if (node.nodeType === 3 || INLINE.has(tagOf(node))) {
      if (!run) parts.push((run = { run: [] }));
      run.run.push(node);
    } else if (node.nodeType === 1) {
      run = null;
      parts.push({ el: node });
    }
  }
  return parts.filter((part) => (part.run ? part.run.some(said) : said(part.el)));
}

// A wrapper's inside: the element a chain of divs of one part each comes down to (a div of words its
// own, the last of them).
function core(element) {
  let at = element;
  for (;;) {
    if (!plainDiv(at)) return at;
    const parts = partsOf(at);
    if (parts.length !== 1 || !parts[0].el) return at;
    at = parts[0].el;
  }
}

function kindOf(part, memo) {
  if (part.run) return "line";
  const element = part.el;
  if (memo.has(element)) return memo.get(element);
  const kind = (() => {
    const tag = tagOf(element);
    if (tag === "p") return element.querySelector(BREAKS) ? "flow" : "line";
    if (LISTS.has(tag)) return "list";
    if (!plainDiv(element) || element.querySelector(BREAKS)) return "flow";
    const parts = partsOf(element);
    if (parts.length === 0) return "empty";
    if (parts.length === 1) return kindOf(parts[0], memo);
    // A paragraph or a list of its own beside its other parts: a card. Words straight in a div are a
    // line as a text editor writes one (each line a div), never a card's.
    if (parts.some((each) => each.el && !plainDiv(each.el) && !["p", ...LISTS].includes(tagOf(each.el)))) return "flow";
    if (parts.some((each) => each.run)) return parts.some((each) => !each.run && !plainDiv(each.el)) ? "card" : "flow";
    if (parts.some((each) => !plainDiv(each.el))) return "card";
    const kinds = parts.map((each) => kindOf(each, memo));
    // Cells: all cards, or all short lines each a paragraph in its div (a line of words straight in a
    // div is an editor's; a long one a paragraph some page wraps).
    if (kinds.every((k) => k === "card") || parts.every((each, i) => kinds[i] === "line" && tagOf(core(each.el)) === "p" && wordsOf(each).length <= SHORT)) return "grid";
    if (kinds.filter((k) => k === "card").length === 1 && kinds.every((k) => k === "card" || k === "line")) return "card";
    return "flow";
  })();
  memo.set(element, kind);
  return kind;
}

const wordsOf = (part) => (part.run ? part.run.map((node) => node.textContent).join("") : part.el.textContent).replace(/\s+/g, " ").trim();

/**
 * The cards of bare HTML (bareHtml) marked in place, in `root` (parseClipboardHTML's div), for html.mjs
 * to read: a card a div of BOX holding its blocks, a row of cells a div of COLUMN_LIST holding divs of
 * COLUMN. How many it marked.
 */
export function markCards(root) {
  if (!bareHtml(root)) return 0;
  const doc = root.ownerDocument;
  const memo = new Map();
  let marked = 0;

  const paragraph = (nodes) => {
    const p = doc.createElement("p");
    p.append(...nodes);
    return p;
  };
  // One line as a paragraph (a <p> as it is).
  const lineOf = (part) => {
    if (part.run) return paragraph(part.run);
    const inside = core(part.el);
    return tagOf(inside) === "p" ? inside : paragraph([...inside.childNodes]);
  };
  // A card's blocks: its lines, its lists, its rows of cells (lines alone in a column); a card in it its lines.
  const blocksOf = (element, inColumn) => partsOf(element).flatMap((part) => {
    const kind = kindOf(part, memo);
    if (kind === "line") return [lineOf(part)];
    if (kind === "list") return [part.el];
    if (kind === "grid") return gridOf(core(part.el), { inBox: true, inColumn });
    if (kind === "empty") return [];
    return blocksOf(core(part.el), inColumn);
  });
  const boxOf = (element, inColumn = false) => {
    const box = doc.createElement("div");
    box.setAttribute(BOX, "");
    box.append(...blocksOf(element, inColumn));
    marked++;
    return box;
  };
  // A cell's blocks: a line its paragraph; a card a box, or in a box its lines.
  const cellOf = (part, { inBox, inColumn }) => {
    const kind = kindOf(part, memo);
    if (kind === "line") return [lineOf(part)];
    return inBox ? blocksOf(core(part.el), inColumn) : [boxOf(core(part.el), inColumn)];
  };
  function gridOf(element, { inBox = false, inColumn = false } = {}) {
    const cells = partsOf(element);
    if (inColumn || cells.some((cell) => wordsOf(cell).length > LONG)) return cells.flatMap((cell) => cellOf(cell, { inBox, inColumn }));
    const rows = Math.ceil(cells.length / PER_ROW);
    const out = [];
    for (let r = 0, at = 0; r < rows; r++) {
      const size = Math.ceil((cells.length - at) / (rows - r));
      const list = doc.createElement("div");
      list.setAttribute(COLUMN_LIST, "");
      for (const cell of cells.slice(at, at + size)) {
        const column = doc.createElement("div");
        column.setAttribute(COLUMN, "");
        column.append(...cellOf(cell, { inBox, inColumn: true }));
        list.append(column);
      }
      out.push(list);
      at += size;
      marked++;
    }
    return out;
  }
  // The answer's divs in turn: a card a box, a grid its rows, a wrapper of the answer's looked into.
  const walk = (element) => {
    for (const part of partsOf(element)) {
      if (!plainDiv(part.el)) continue;
      const kind = kindOf(part, memo);
      if (kind === "card") part.el.replaceWith(boxOf(core(part.el)));
      else if (kind === "grid") part.el.replaceWith(...gridOf(core(part.el)));
      else if (kind === "flow") walk(part.el);
    }
  };
  // The answer: its wrappers (divs of one part) down to what holds more, which is no card (a grid
  // copied alone is its rows).
  let answer = root;
  for (let parts = partsOf(answer); parts.length === 1 && plainDiv(parts[0].el); parts = partsOf(answer)) answer = parts[0].el;
  if (kindOf({ el: answer }, memo) !== "grid") walk(answer);
  else if (answer === root) root.replaceChildren(...gridOf(root));
  else answer.replaceWith(...gridOf(answer));
  return marked;
}
