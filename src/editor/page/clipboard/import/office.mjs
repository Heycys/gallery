// Word's clipboard HTML made ready for the paste importer: read.mjs sends Office's HTML here when
// isWordContent says it is a word processor's, then reads the result as it reads any page's (html.mjs).
//
// Microsoft Word, WPS Writer and programs that write HTML the way Word does (Outlook) copy a whole
// document: a head of style sheets, conditional comments for older browsers, Office's own elements
// (o:p, v:shape, st1:*, w:sdt), lists written as paragraphs whose marker is drawn as text, formatting
// and colors in style attributes, every paragraph in a class, and the source wrapped at about 80
// characters. PowerPoint writes the same kind of HTML for the text it copies, a div for each paragraph
// and its bullet a span of its own, and goes through the same steps.
//
//   isWordContent(html)                  a cheap test of the text, no parsing, in one pass over its start
//                                        tags: Office's HTML of a document or slides, and not a
//                                        spreadsheet's (Excel's has mso- styles too)
//   filterWordContent(html, { colors })  the content of its body, cleaned, as a string whose first
//                                        element is the content's first block (a copy of table cells
//                                        starts with <table>); with `colors`, text colors and highlights
//                                        handed over as data-paste-color / data-paste-background, which
//                                        html.mjs markColors reads; without, no color at all. It never
//                                        throws: on an error it returns the HTML as it came.
//
// The filter parses the HTML into a document of its own and works on the tree, one step per rule, in
// this order (each step reads the styles and classes it needs before step 10 takes them away):
//    1. Office's self-closing tags opened and closed, before parsing.
//    2. Conditional comments: what they show older programs kept or dropped; then every comment goes.
//    3. What is not content goes: style sheets, Office's drawings and equations, hidden text, review
//       comments, tracked deletions.
//    4. Word's layout divs unwrapped; a div holding a line of text a paragraph.
//    5. Tabs one space; the source's whitespace as a browser shows it.
//    6. Paragraph styles: titles, outline levels and quotes; numbered headings keep their numbers.
//    7. List paragraphs made lists, nested by level (PowerPoint's by their indent), bulleted or numbered
//       as the list's definition in Word's style sheet says (read before step 3), else as the marker's
//       text reads, and a numbered list from its first number.
//    8. Formatting written as style made tags; colors handed over.
//    9. Page and section breaks; tables.
//   10. Wrappers unwrapped, attributes but a few gone, empty formatting gone, empty paragraphs one &nbsp;.
//
// Clipboard HTML can come from any page, so nothing here may take more than a pass over its input: the
// string tests read each tag once, the conditional comments are paired in one walk, and the style sheet's
// list definitions are read in one walk.

const ELEMENT = 1;
const TEXT = 3;
const COMMENT = 8;

// ---------------------------------------------------------------------------------------------------
// Is it Word's?

// The text is read tag by tag: a start tag's name and what follows it up to its ">" or to the next "<",
// whichever comes first, so that a tag cut short never makes a test read on past it. Each test below is
// on one tag's attributes and runs once over them (an optional quote is followed by its own spaces only,
// so two runs of spaces never compete for the same characters).
const START_TAGS = /<([a-z][\w:.-]*)([^<>]*)/gi;
// A spreadsheet's ProgId or Generator: Excel writes Office's namespaces and mso- styles too, and its
// cells already paste as a table without the filter.
const SPREADSHEET = /\bcontent\s*=\s*(?:["']\s*)?(?:Excel\.Sheet|Microsoft Excel)\b/i;
// What Office's HTML of a document or slides holds, any one of them: the program in a meta's content
// (Word.Document, Microsoft Word 15, WPS Office, PowerPoint.Slide), Word's namespace, a class
// Word names (MsoNormal, MsoListParagraph, MsoTableGrid), an mso- property in a style (Word's
// mso-list:l0 level1 lfo1, PowerPoint's mso-special-format:bullet), and Word's end of a paragraph, <o:p>.
const OFFICE_PROGRAM = /\bcontent\s*=\s*(?:["']\s*)?(?:Word\.Document|Microsoft (?:Word|PowerPoint)|WPS|PowerPoint\.Slide)/i;
const WORD_NAMESPACE = /\bxmlns:w\s*=\s*(?:["']\s*)?urn:schemas-microsoft-com:office:word/i;
const OFFICE_CLASS = /\bclass\s*=\s*(?:["']\s*)?Mso/i;
const OFFICE_STYLE = /\bstyle\s*=\s*(?:"[^"]*?|'[^']*?)\bmso-/i;

/** Whether clipboard HTML is Office's of a document or slides (Word, WPS, Outlook, PowerPoint), to go through filterWordContent. */
export function isWordContent(html) {
  if (typeof html !== "string") return false;
  let found = false;
  for (const [, tagName, attributes] of html.matchAll(START_TAGS)) {
    const name = tagName.toLowerCase();
    if (name === "meta" && SPREADSHEET.test(attributes)) return false;
    // The program's meta stands in the head; once the body has begun, a sign found is the answer.
    if (found && name === "body") return true;
    found ||= name === "o:p" || (name === "meta" && OFFICE_PROGRAM.test(attributes)) || WORD_NAMESPACE.test(attributes)
      || OFFICE_CLASS.test(attributes) || OFFICE_STYLE.test(attributes);
  }
  return found;
}

/** Word's or WPS's clipboard HTML, cleaned for the importer (see the top of this file). */
export function filterWordContent(html, { colors = false } = {}) {
  if (typeof html !== "string") return "";
  if (!html) return html;
  try {
    return clean(html, { colors });
  } catch {
    return html; // a paste with Word's leftovers rather than none
  }
}

function clean(html, { colors }) {
  const doc = new globalThis.DOMParser().parseFromString(openOfficeTags(html), "text/html");
  const body = doc.body;
  if (!body) return "";
  const lists = listDefinitions(doc);
  readConditionalComments(body);
  removeNonContent(body);
  unwrapLayout(body);
  tabsAsSpaces(body);
  collapseWhitespace(body);
  applyParagraphStyles(body, lists);
  buildLists(body, lists);
  styleAsTags(body, { colors });
  removePageBreaks(body);
  cleanTables(body);
  unwrapWrappers(body);
  removeLooseBreaks(body);
  keepAttributes(body);
  removeEmptyFormatting(body);
  fillEmptyParagraphs(body);
  removeSpaceBetweenBlocks(body);
  body.normalize();
  return body.innerHTML;
}

// ---------------------------------------------------------------------------------------------------
// Shared helpers.

// Elements that start and end a block of text, for whitespace, line breaks and wrapping.
const BLOCKS = new Set(["address", "article", "aside", "blockquote", "body", "caption", "center", "col", "colgroup", "dd", "details", "dir", "div",
  "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "li", "main", "menu", "nav",
  "ol", "p", "pre", "section", "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul"]);
const isBlock = (node) => node?.nodeType === ELEMENT && BLOCKS.has(node.localName);
// Things that stand on a line of text as a character does.
const OBJECTS = new Set(["img", "input", "svg", "video", "audio", "iframe", "object", "embed"]);
const SOURCE_SPACE = /[ \t\n\r\f]/;
const onlySourceSpace = (text) => !/[^ \t\n\r\f]/.test(text);

/** Every node under root, in document order. */
function descendants(root) {
  const found = [];
  let node = root.firstChild;
  while (node) {
    found.push(node);
    if (node.firstChild) {
      node = node.firstChild;
      continue;
    }
    while (node !== root && !node.nextSibling) node = node.parentNode;
    node = node === root ? null : node.nextSibling;
  }
  return found;
}

// Nodes are moved one at a time: spreading a long list of children into one call's arguments can
// overflow the stack on a large paste.

/** The nodes moved, in order, to the end of `into`. */
function moveInto(into, nodes) {
  for (const node of [...nodes]) into.appendChild(node);
}

/** An element's content in its place (gathered in a fragment, which goes in as one insertion). */
function unwrap(el) {
  const content = el.ownerDocument.createDocumentFragment();
  while (el.firstChild) content.appendChild(el.firstChild);
  el.replaceWith(content);
}

/** The element under another name, with its attributes (those of a name an element can carry) and content. */
function rename(el, name) {
  const renamed = el.ownerDocument.createElement(name);
  for (const { name: attribute, value } of [...el.attributes]) {
    if (/^[a-z_][\w:.-]*$/i.test(attribute)) renamed.setAttribute(attribute, value);
  }
  el.before(renamed);
  while (el.firstChild) renamed.appendChild(el.firstChild);
  el.remove();
  return renamed;
}

const hasClass = (el, name) => [...el.classList].some((each) => each.toLowerCase() === name);

// Word's style attributes, read from the attribute's text: the browser's style object drops what it does
// not know, mso-list among it. Word quotes font names ('font:7.0pt "Times New Roman"'), WPS ends every
// declaration with ";". Names lower case, values trimmed, !important dropped.
const STYLES = new WeakMap();
function styleOf(el) {
  const text = el.getAttribute("style") ?? "";
  const known = STYLES.get(el);
  if (known?.text === text) return known.declarations;
  const declarations = parseStyle(text);
  STYLES.set(el, { text, declarations });
  return declarations;
}

function parseStyle(text) {
  const declarations = new Map();
  const add = (part) => {
    const colon = part.indexOf(":");
    if (colon <= 0) return;
    const name = part.slice(0, colon).trim().toLowerCase();
    const value = part.slice(colon + 1).replace(/!\s*important\s*$/i, "").trim();
    if (name) declarations.set(name, value);
  };
  let start = 0;
  let quote = "";
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = "";
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "(") depth++;
    else if (c === ")") depth = Math.max(0, depth - 1);
    else if (c === ";" && depth === 0) {
      add(text.slice(start, i));
      start = i + 1;
    }
  }
  add(text.slice(start));
  return declarations;
}

// ---------------------------------------------------------------------------------------------------
// 1. Office's self-closing tags. Word writes Office's empty elements the XML way, <o:lock v:ext="edit"/>,
// <v:imagedata … />. An HTML parser ignores the slash and takes everything after such a tag inside it, so
// removing the element would take the text after it too. Each is written open and closed instead.
// The text is walked once: from each "<" that starts a prefixed name to the tag's ">" (stepping over
// quoted values, which may hold one), then on from there.

const PREFIXED_NAME = /[a-z][\w.-]*:[\w.-]+/iy;
function openOfficeTags(html) {
  let out = "";
  let copied = 0; // the text before this is in `out`
  let at = html.indexOf("<");
  while (at !== -1) {
    PREFIXED_NAME.lastIndex = at + 1;
    const name = PREFIXED_NAME.exec(html)?.[0];
    if (!name) {
      at = html.indexOf("<", at + 1);
      continue;
    }
    const close = tagClose(html, PREFIXED_NAME.lastIndex);
    if (close === -1) break; // a tag cut short runs to the end: nothing after it is a tag
    let slash = close - 1;
    while (slash > at && SOURCE_SPACE.test(html[slash])) slash--;
    if (html[slash] === "/") {
      out += `${html.slice(copied, slash)}></${name}>`;
      copied = close + 1;
    }
    at = html.indexOf("<", close + 1);
  }
  return copied === 0 ? html : out + html.slice(copied);
}

/** Where the tag whose attributes start at `from` ends (its ">"), or -1 when it never does. */
function tagClose(html, from) {
  for (let i = from; i < html.length; i++) {
    const c = html[i];
    if (c === ">") return i;
    if (c === '"' || c === "'") {
      i = html.indexOf(c, i + 1);
      if (i === -1) return -1;
    }
  }
  return -1;
}

// ---------------------------------------------------------------------------------------------------
// 2. Conditional comments. Word writes two kinds.
//   <!--[if gte mso 9]>…<![endif]--> (document settings, VML pictures, equations, field codes) is one
//   comment no browser shows: it goes as every comment does.
//   <![if !X]>…<![endif]> is what programs without X show. The parser makes two comments of it, "[if !X]"
//   and "[endif]", with the content between them as ordinary nodes. The content stays (a picture's <img>
//   for programs without VML, an equation's picture, a footnote's number, an empty paragraph's &nbsp;),
//   except where it stands in for something the page has no use for: a row of empty cells Word adds to a
//   table whose columns do not line up, a second <br> after a line break at a paragraph's end, a review
//   comment's anchor, empty bookmarks. A list's marker there (supportLists) is marked as Word marks it
//   elsewhere, a span styled mso-list:Ignore, for the list step to find; that step leaves a space for it.
// Then every comment goes, <!--StartFragment--> and <!--EndFragment--> among them.
// An [if !X] is closed by the first [endif] after it among its siblings; another [if …] coming first
// leaves it unclosed (Word does not nest them), and it goes alone. So each sibling is looked at once.

const SHOWN_WITHOUT = /^\[if\s*!\s*(\w+)\s*\]$/i;
const OPENING = /^\[if\b[^\]]*\]$/i;
const END_IF = /^\[endif\]$/i;
const NOT_WANTED = new Set(["supportmisalignedcolumns", "supportlinebreaknewline", "supportannotations", "supportnestedanchors"]);
const commentSays = (node, pattern) => node.nodeType === COMMENT && pattern.test(node.data.trim());

function readConditionalComments(body) {
  for (const comment of descendants(body).filter((node) => node.nodeType === COMMENT)) {
    const feature = SHOWN_WITHOUT.exec(comment.data.trim())?.[1].toLowerCase();
    if (!feature || !comment.parentNode) continue;
    const content = [];
    let end = comment.nextSibling;
    while (end && !commentSays(end, END_IF) && !commentSays(end, OPENING)) {
      content.push(end);
      end = end.nextSibling;
    }
    if (end && commentSays(end, END_IF)) {
      if (NOT_WANTED.has(feature)) for (const node of content) node.remove();
      else if (feature === "supportlists") markListMarker(content);
      end.remove();
    }
    comment.remove();
  }
  for (const comment of descendants(body).filter((node) => node.nodeType === COMMENT)) comment.remove();
}

const isIgnored = (el) => /^ignore$/i.test(styleOf(el).get("mso-list") ?? "");

function markListMarker(nodes) {
  const marked = nodes.some((node) => node.nodeType === ELEMENT && (isIgnored(node) || [...node.querySelectorAll("[style]")].some(isIgnored)));
  if (nodes.length === 0 || marked) return;
  const marker = nodes[0].ownerDocument.createElement("span");
  marker.setAttribute("style", "mso-list:Ignore");
  nodes[0].before(marker);
  moveInto(marker, nodes);
}

// ---------------------------------------------------------------------------------------------------
// 3. What is not content goes, with all it holds, wherever it stands:
//   - style sheets, scripts, Office's <xml> data, meta, link and title elements (the head goes anyway:
//     only the body is read; its style sheet is not applied, so class styles give no color or font; its
//     list definitions were read before, for step 7);
//   - Office's drawing (v:*), equation (m:*) and other o:* elements, none of which holds text a reader
//     sees (o:p, the end of a paragraph, and o:wrapblock, around a picture, are unwrapped in step 10);
//   - Word's hidden text: display:none, visibility:hidden, mso-hide:all or screen (a table of
//     contents' page numbers);
//   - review comments: their marks (mso-special-character:comment), anchors (a.msocomanchor) and the list
//     of them at the end (mso-element:comment-list);
//   - tracked deletions, a <del> with its author or time (cite, datetime): the paste is the text as it
//     reads with the changes accepted (a tracked insertion, <ins>, is unwrapped in step 10).

const NOT_CONTENT = new Set(["style", "script", "noscript", "template", "meta", "link", "title", "xml"]);
const OFFICE_WRAPPERS = new Set(["o:p", "o:wrapblock"]);

function removeNonContent(body) {
  for (const el of [...body.querySelectorAll("*")]) if (el.isConnected && isNonContent(el)) el.remove();
}

function isNonContent(el) {
  const name = el.localName;
  if (NOT_CONTENT.has(name)) return true;
  if (/^[vm]:/.test(name) || (name.startsWith("o:") && !OFFICE_WRAPPERS.has(name))) return true;
  if (name === "del" && (el.hasAttribute("cite") || el.hasAttribute("datetime"))) return true;
  if (name === "a" && hasClass(el, "msocomanchor")) return true;
  const style = styleOf(el);
  return /^none$/i.test(style.get("display") ?? "") || /^hidden$/i.test(style.get("visibility") ?? "")
    || /^(?:all|screen)$/i.test(style.get("mso-hide") ?? "")
    || /^comment$/i.test(style.get("mso-special-character") ?? "") || /^comment-list$/i.test(style.get("mso-element") ?? "");
}

// ---------------------------------------------------------------------------------------------------
// 4. Divs. Word's are page layout around blocks, never a block of their own: WordSection1 around the
// whole copy, a border around paragraphs (mso-element:para-border-div), the footnote list and each
// footnote, a frame, align=center around a table; <center> the same. They are unwrapped, so that a list
// running over a section's edge stays one list and the importer never meets bare nested divs (which it
// would read as an AI answer's cards).
// PowerPoint writes each paragraph as a div with its line straight inside, and any div may hold words
// beside its blocks. So, before a div is unwrapped, each stretch of its inline content that holds a word
// or a picture becomes a paragraph; a div that is nothing but such a stretch becomes the paragraph
// itself, keeping its style for the steps after (PowerPoint's indent says a bullet's level). A stretch
// of nothing but spaces and line breaks (the <br clear=all> before the footnotes) stays as it is.

function unwrapLayout(body) {
  for (const el of [...body.querySelectorAll("div, center")]) {
    const lines = inlineStretches(el).filter(holdsContent);
    if (lines.length === 1 && lines[0].length === el.childNodes.length) {
      rename(el, "p");
      continue;
    }
    for (const line of lines) {
      const p = el.ownerDocument.createElement("p");
      line[0].before(p);
      moveInto(p, line);
    }
    unwrap(el);
  }
}

/** The element's children in runs, each ended by a block child. */
function inlineStretches(el) {
  const runs = [];
  let run = [];
  for (const child of el.childNodes) {
    if (!isBlock(child)) run.push(child);
    else if (run.length > 0) {
      runs.push(run);
      run = [];
    }
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

const OBJECT_SELECTOR = [...OBJECTS].join(", ");
const holdsContent = (nodes) => nodes.some((node) => (node.nodeType === TEXT && !onlySourceSpace(node.data))
  || (node.nodeType === ELEMENT && (OBJECTS.has(node.localName) || !onlySourceSpace(node.textContent) || node.querySelector(OBJECT_SELECTOR) !== null)));

// ---------------------------------------------------------------------------------------------------
// 5. Spaces.
// A tab is a span of non-breaking spaces as wide as the tab stop (mso-tab-count:1); the page has no tab
// stops, so it is one ordinary space.

function tabsAsSpaces(body) {
  for (const el of [...body.querySelectorAll("[style]")]) {
    if (el.isConnected && styleOf(el).has("mso-tab-count")) el.replaceWith(el.ownerDocument.createTextNode(" "));
  }
}

// Word wraps its source at about 80 characters, inside text and between tags. It is made what a browser
// shows (outside <pre>, kept exactly): a run of spaces, tabs and line breaks is one space; a run holding a
// line break between two Chinese or Japanese characters is nothing (Word broke the line where there was no
// space; Korean puts spaces between words, so it keeps one, as a browser does); a run at the start or end
// of a block's text, or beside a <br>, is nothing (and with it all whitespace between blocks). U+00A0,
// which Word writes for the spaces it means, is never touched. The text of each stretch of inline content
// is read as one, so a run split over several text nodes ("one <b>two</b>\n<i> three</i>") is one run.

const WIDE = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}　-〿＀-￯]/u;
const OBJECT_CHARACTER = "￼"; // where an image stands in a stretch's text

function collapseWhitespace(body) {
  let stretch = [];
  const close = () => {
    collapseStretch(stretch);
    stretch = [];
  };
  const walk = (parent) => {
    for (const child of [...parent.childNodes]) {
      if (child.nodeType === TEXT) stretch.push(child);
      else if (child.nodeType !== ELEMENT) continue;
      else if (child.localName === "pre" || child.localName === "br") close();
      else if (isBlock(child)) {
        close();
        walk(child);
        close();
      } else if (OBJECTS.has(child.localName)) stretch.push(child);
      else walk(child);
    }
  };
  walk(body);
  close();
}

function collapseStretch(items) {
  const parts = items.map((item) => (item.nodeType === TEXT ? item.data : OBJECT_CHARACTER));
  const line = parts.join("");
  if (!SOURCE_SPACE.test(line)) return;
  const out = line.split("");
  for (const run of line.matchAll(/[ \t\n\r\f]+/g)) {
    const start = run.index;
    const end = start + run[0].length;
    const atEdge = start === 0 || end === line.length;
    const joinsWide = !atEdge && /[\n\r]/.test(run[0]) && WIDE.test(codePointBefore(line, start)) && WIDE.test(String.fromCodePoint(line.codePointAt(end)));
    out[start] = atEdge || joinsWide ? "" : " ";
    for (let i = start + 1; i < end; i++) out[i] = "";
  }
  let offset = 0;
  items.forEach((item, k) => {
    const length = parts[k].length;
    if (item.nodeType === TEXT) {
      const data = out.slice(offset, offset + length).join("");
      if (!data) item.remove();
      else if (data !== item.data) item.data = data;
    }
    offset += length;
  });
}

function codePointBefore(text, index) {
  const low = text.charCodeAt(index - 1);
  const pair = low >= 0xdc00 && low <= 0xdfff && index >= 2;
  return pair ? text.slice(index - 2, index) : text.slice(index - 1, index);
}

// ---------------------------------------------------------------------------------------------------
// The markers drawn for a list paragraph or a numbered heading: the outermost elements in it styled
// mso-list:Ignore (Word's own and step 2's), or PowerPoint's bullet, a span styled
// mso-special-format:bullet (numbullet for a number). Word's text is the bullet or number and then the spacing to
// the text, non-breaking spaces and one space ("·      ", "1.   ", "一. "), or nothing when the list is set
// to follow its number with nothing ("一、"); WPS writes the number alone ("1."), PowerPoint the bullet alone
// ("•"). Their glyph is the first character that is not a space: its font tells a bullet drawn as a letter
// from a letter of a numbering.

const SLIDE_MARKER = /^["']?((?:num)?bullet)\b/i;
const slideMarkerOf = (el) => SLIDE_MARKER.exec(styleOf(el).get("mso-special-format") ?? "")?.[1].toLowerCase() ?? null;
const isSlideBullet = (el) => slideMarkerOf(el) !== null;
const isMarker = (el) => isIgnored(el) || isSlideBullet(el);

function markerOf(container) {
  const nodes = [...container.querySelectorAll("[style]")].filter((el) => isMarker(el) && !markerAbove(el, container));
  if (nodes.length === 0) return null;
  const text = nodes.map((node) => node.textContent).join("");
  const glyph = nodes.flatMap((node) => descendants(node)).find((node) => node.nodeType === TEXT && /\S/.test(node.data)) ?? null;
  // slide: PowerPoint's kind of marker, "bullet" or "numbullet"; null for Word's and WPS's.
  const slide = nodes.map(slideMarkerOf).find(Boolean) ?? null;
  return { nodes, token: text.trim(), spaced: /[  \t]$/.test(text), slide, glyph };
}

function markerAbove(el, container) {
  for (let up = el.parentElement; up && up !== container; up = up.parentElement) if (isMarker(up)) return true;
  return false;
}

// What reads as a number of a numbering, rather than a bullet, whatever follows it: Arabic numbers (1  1.
// 1)  (1)  （1）  1、  1.1.  １．), letters and roman numerals with their punctuation (a.  A)  (a)  a、  iv.
// IV.; a letter alone is a bullet font's: "o", "l", "n"), Chinese numerals (一  一.  一、  （一）  十二、  壹、),
// circled, parenthesized and enclosed numbers (①  ⑴  ⒈  ❶  ㊀), and 第一章, 第3条.
const NUMBER_MARKERS = [
  /^[(（]?[0-9０-９]+(?:[.．][0-9０-９]+)*[.．)）、]?$/,
  /^[(（]?[a-z]{1,8}[.．)）、]$/i,
  /^[(（]?[〇零一二三四五六七八九十百千壹贰貳叁參肆伍陆陸柒捌玖拾佰仟]+[.．)）、]?$/u,
  /^[①-⒛⓫-⓾❶-➓㉑-㉟㊀-㊉㊱-㊿][.．、]?$/u,
  /^第[0-9０-９〇零一二三四五六七八九十百千]+[章节節條条款部篇]$/u,
];
const isNumberToken = (token) => NUMBER_MARKERS.some((pattern) => pattern.test(token));

// Bulleted or numbered, and from what number, for a list paragraph or a numbered heading. The list's own
// definition says first, where the clipboard carries it: Word's @list rule for the paragraph's list and
// level (listDefinitions), mso-level-number-format bullet or image a bullet, any other format a number, no
// format written Word's default, decimal (none, a level that shows no marker, says nothing); and
// PowerPoint's kind of marker, bullet or numbullet.
// Else the marker's text: a number (isNumberToken) not in a symbol font is numbered, whether white space
// follows it or not; anything else (•  o  §  -  *  ■, Wingdings' and Symbol's letters) is a bullet. A
// numbered marker's number is read from its text (numberOf, letters by the definition's format), else it
// is the definition's mso-level-start-at.
function numberingOf(marker, container, definition) {
  const format = formatOf(marker, definition);
  const numbered = format ? format !== "bullet" : Boolean(marker) && isNumberToken(marker.token) && !inSymbolFont(marker, container);
  if (!numbered) return { numbered, number: null };
  const number = (marker ? numberOf(marker.token, format) : null) ?? startAt(definition);
  return { numbered, number };
}

/** "bullet", a numbering format ("decimal", "alpha-lower", "chinese-counting", "number" …), or "" when the list does not say. */
function formatOf(marker, definition) {
  if (marker?.slide) return marker.slide === "numbullet" ? "number" : "bullet";
  if (!definition) return "";
  const format = (definition.get("mso-level-number-format") ?? "decimal").replace(/["']/g, "").trim().toLowerCase();
  if (format === "bullet" || format === "image") return "bullet";
  return format === "none" ? "" : format;
}

function startAt(definition) {
  const start = Number.parseInt(definition?.get("mso-level-start-at") ?? "", 10);
  return Number.isInteger(start) ? start : null;
}

// The number a marker shows: its last number (1.2. is 2, its own level's), Arabic digits half or full
// width, a circled or enclosed number, Chinese numerals (十二 12, 一百零五 105; 一〇 10, written as digits),
// letters (a 1, z 26, aa 27: Word repeats the letter after z) or roman numerals (iv 4). Letters are roman
// where the format says roman, letters where it says alpha; with no format, a run of i, v and x is roman
// and any other letter a letter. A marker of more than a few characters, or of no number, has none (null).
const DIGITS = "0123456789０１２３４５６７８９";
function numberOf(token, format = "") {
  if (token.length > 24) return null;
  const part = token.replace(/^第|[章节節條条款部篇]$/gu, "").split(/[\s()（）.．、:：]+/).filter(Boolean).at(-1) ?? "";
  if (!part) return null;
  if (/^[0-9０-９]+$/.test(part)) return Number([...part].map((digit) => DIGITS.indexOf(digit) % 10).join(""));
  if (/^[a-z]+$/i.test(part)) return letterNumber(part.toLowerCase(), format);
  if (CHINESE_NUMBER.test(part)) return chineseNumber(part);
  return enclosedNumber(part);
}

// Circled, parenthesized and enclosed numbers: [first code point, last, the number of the first].
const ENCLOSED = [[0x2460, 0x2473, 1], [0x2474, 0x2487, 1], [0x2488, 0x249b, 1], [0x24eb, 0x24f4, 11], [0x24f5, 0x24fe, 1],
  [0x2776, 0x277f, 1], [0x2780, 0x2789, 1], [0x278a, 0x2793, 1], [0x3251, 0x325f, 21], [0x3280, 0x3289, 1], [0x32b1, 0x32bf, 36]];
function enclosedNumber(part) {
  const code = [...part].length === 1 ? part.codePointAt(0) : -1;
  const range = ENCLOSED.find(([first, last]) => code >= first && code <= last);
  return range ? range[2] + code - range[0] : null;
}

// Chinese numerals: the digits 0 to 9 at their own place in the list, the everyday and the formal form of
// each (the formal ones as both scripts write them), and the units.
const CHINESE_DIGITS = [/[〇零]/, /[一壹]/, /[二贰貳]/, /[三叁參]/, /[四肆]/, /[五伍]/, /[六陆陸]/, /[七柒]/, /[八捌]/, /[九玖]/];
const CHINESE_UNITS = [[/[十拾]/, 10], [/[百佰]/, 100], [/[千仟]/, 1000]];
const CHINESE_NUMBER = /^[〇零一壹二贰貳三叁參四肆五伍六陆陸七柒八捌九玖十拾百佰千仟]+$/;
const chineseDigit = (character) => CHINESE_DIGITS.findIndex((digit) => digit.test(character));
const chineseUnit = (character) => CHINESE_UNITS.find(([unit]) => unit.test(character))?.[1] ?? 0;
function chineseNumber(part) {
  const characters = [...part];
  if (!characters.some(chineseUnit)) return Number(characters.map(chineseDigit).join(""));
  let total = 0;
  let digit = 0;
  for (const character of characters) {
    const unit = chineseUnit(character);
    if (unit) {
      total += (digit || 1) * unit;
      digit = 0;
    } else digit = chineseDigit(character);
  }
  return total + digit;
}

const ROMAN = /^m{0,3}(?:cm|cd|d?c{0,3})(?:xc|xl|l?x{0,3})(?:ix|iv|v?i{0,3})$/;
const ROMAN_VALUES = new Map([["i", 1], ["v", 5], ["x", 10], ["l", 50], ["c", 100], ["d", 500], ["m", 1000]]);
function letterNumber(letters, format) {
  const roman = format.includes("roman") || (!format.includes("alpha") && /^[ivx]+$/.test(letters));
  if (roman) {
    if (!ROMAN.test(letters)) return null;
    return [...letters].reduce((sum, letter, i) => {
      const value = ROMAN_VALUES.get(letter);
      return (ROMAN_VALUES.get(letters[i + 1]) ?? 0) > value ? sum - value : sum + value;
    }, 0);
  }
  return [...letters].every((letter) => letter === letters[0]) ? (letters.length - 1) * 26 + letters.charCodeAt(0) - 96 : null;
}

// Word draws bullets as letters of symbol fonts: "·" in Symbol, "o" in Courier New, "§", "n", "l", "u",
// "q", "v", "Ø", "ü" in Wingdings. The font is the nearest font-family above the glyph in the paragraph.
const SYMBOL_FONTS = new Set(["symbol", "wingdings", "wingdings 2", "wingdings 3", "webdings", "courier new"]);
function inSymbolFont(marker, container) {
  for (let el = marker.glyph?.parentElement; el; el = el.parentElement) {
    const family = styleOf(el).get("font-family");
    if (family) return SYMBOL_FONTS.has(family.split(",")[0].trim().replace(/^["']|["']$/g, "").toLowerCase());
    if (el === container) break;
  }
  return false;
}

/** The marker taken out of its paragraph, `text` in its place, with the elements it alone filled. */
function replaceMarker(marker, container, text) {
  let place = null;
  for (const node of marker.nodes) {
    let top = node;
    while (top.parentNode !== container && holdsOnly(top.parentNode, top)) top = top.parentNode;
    if (place) top.remove();
    else place = top;
  }
  if (!text) {
    place.remove();
    return;
  }
  const inserted = container.ownerDocument.createTextNode(text);
  place.replaceWith(inserted);
  // The item's own text starting with spaces: the one space the marker left is enough.
  const after = descendants(container);
  for (const node of after.slice(after.indexOf(inserted) + 1)) {
    if (node.nodeType === ELEMENT && (OBJECTS.has(node.localName) || node.localName === "br")) break;
    if (node.nodeType !== TEXT) continue;
    const rest = node.data.replace(/^\s+/, "");
    if (rest !== node.data) node.data = rest;
    if (rest) break;
  }
}

const holdsOnly = (parent, child) => [...parent.childNodes].every((node) => node === child || (node.nodeType === TEXT && onlySourceSpace(node.data)));

// ---------------------------------------------------------------------------------------------------
// 6. Paragraph styles. Word writes its heading styles as h1–h6 (kept, whatever their style says:
// mso-list:none is no list); its other styles are classes on a <p>. Title (MsoTitle) is made an h1,
// Subtitle (MsoSubtitle) stays a paragraph, Quote and Intense Quote (MsoQuote, MsoIntenseQuote) a quote,
// side by side ones one quote of paragraphs; a paragraph with an outline level (mso-outline-level:2, the
// document's own heading style, a list paragraph or not) the heading of that level. A heading Word numbers
// (mso-list with a level, its marker as a list paragraph's) keeps its number as text, "1. 引言": it cannot
// be a list item, and the number is how the document refers to it. One space follows the number, none
// after a full-width mark, which holds its own ("一、总则", "（一）总则"). A bullet on a heading goes (which
// is which as for a list paragraph: numberingOf).

const PARAGRAPH_STYLE = /^Mso(Title|Subtitle|Quote|IntenseQuote)(?:Cx\w*)?$/i;
const FULL_WIDTH_END = /[、．）：]$/;

function applyParagraphStyles(body, lists) {
  const quotes = new Set();
  for (const p of [...body.querySelectorAll("p")]) {
    const style = [...p.classList].map((name) => PARAGRAPH_STYLE.exec(name)?.[1].toLowerCase()).find(Boolean);
    const level = Number.parseInt(styleOf(p).get("mso-outline-level") ?? "", 10);
    if (style === "title") rename(p, "h1");
    else if (level >= 1 && level <= 6) rename(p, `h${level}`);
    else if (style === "quote" || style === "intensequote") {
      const before = p.previousSibling;
      if (quotes.has(before)) before.append(p);
      else {
        const quote = p.ownerDocument.createElement("blockquote");
        p.before(quote);
        quote.append(p);
        quotes.add(quote);
      }
    }
  }
  for (const heading of [...body.querySelectorAll("h1, h2, h3, h4, h5, h6")]) {
    const list = listOf(heading);
    const marker = list && markerOf(heading);
    if (!marker) continue;
    const { numbered } = numberingOf(marker, heading, lists.get(list.definition));
    replaceMarker(marker, heading, numbered ? `${marker.token}${FULL_WIDTH_END.test(marker.token) ? "" : " "}` : "");
  }
}

// ---------------------------------------------------------------------------------------------------
// 7. Lists. Word writes no <ul> or <ol>. Each item is a paragraph whose style names its list and level,
// mso-list:l0 level2 lfo1 (l, the list's definition; lfo, its numbering; any class, MsoListParagraph,
// MsoNormal, …CxSpFirst), and whose marker is drawn as text before its own (see markerOf).
// PowerPoint names no list or level: a paragraph holding its bullet (see markerOf) is an item, its level
// the rank of its left indent among the indents of its run (the least indented the first level).
// Only such paragraphs are items: a paragraph that merely begins with a number ("2026. 这一年…") and has no
// mso-list stays a paragraph, whatever its class.
// Each run of such paragraphs side by side becomes lists:
//   - bulleted or numbered as the list's definition says, else as its marker's text reads, whatever
//     follows the marker (numberingOf): WPS writes its number with nothing after it ("1."), and Word does
//     when a list is set to follow its number with nothing ("一、"), and those are numbered lists too;
//   - a numbered list starts at its first item's number (<ol start="5">, none for 1): a list numbered from
//     5 or 三, or copied from the middle of another, starts there; the importer gives the list that start
//     (html.mjs, to-blocks.mjs) and the page shows it in its own style for the depth (a, i or 一 come in
//     as the numbers they are);
//   - the marker goes and leaves one ordinary space where it was when it ended with spacing (none for
//     WPS's or PowerPoint's); the item's paragraph is <li><p>…</p></li>, so that underlines and line
//     breaks stay in the item's text (html.mjs reads an item's first node and its inline nodes as its text);
//   - nesting by level from the run's first: a deeper level opens a list in the item before it (one level
//     deeper at most: a jump of two is one), a shallower one closes lists; another list (another l or lfo)
//     or a change between bulleted and numbered at the same depth starts a new list there, beside the
//     last one, never inside it; a run that starts at level 2 (a copy from the middle of a list) starts
//     at the top.

const LIST_LEVEL = /\bl(\d+)\s+level(\d+)(?:\s+lfo(\d+))?/i;
function listOf(el) {
  const match = LIST_LEVEL.exec(styleOf(el).get("mso-list") ?? "");
  return match ? { id: `l${match[1]} lfo${match[3] ?? ""}`, level: Number(match[2]), definition: `l${Number(match[1])}:level${Number(match[2])}` } : null;
}

// Word's list definitions, read from its style sheet before step 3 removes it: for each list and level a
// rule, @list l0:level1 {mso-level-number-format:bullet; mso-level-text:…; mso-level-start-at:5; …},
// kept as its declarations under "l0:level1" (a level with no format written has Word's default,
// decimal). Where the clipboard carries none (WPS's copy as the samples have it, PowerPoint's), the
// marker decides. The text is walked once: from each "@list" to its rule's "}", then on from there; a rule
// never closed ends the walk. A rule for one numbering's override (an lfo after the level) is not read.
const LIST_RULE = /\s*l(\d+)\s*:\s*level(\d+)\s*\{/iy;
function listDefinitions(doc) {
  const definitions = new Map();
  for (const style of doc.querySelectorAll("style")) {
    const text = style.textContent;
    let at = text.indexOf("@list");
    while (at !== -1) {
      LIST_RULE.lastIndex = at + 5;
      const rule = LIST_RULE.exec(text);
      if (!rule) {
        at = text.indexOf("@list", at + 5);
        continue;
      }
      const end = text.indexOf("}", LIST_RULE.lastIndex);
      if (end === -1) break;
      definitions.set(`l${Number(rule[1])}:level${Number(rule[2])}`, parseStyle(text.slice(LIST_RULE.lastIndex, end)));
      at = text.indexOf("@list", end + 1);
    }
  }
  return definitions;
}

/** A paragraph's place in a list, { id, level, definition } (a slide's level still to be worked out), or null. */
function itemOf(node) {
  if (node?.nodeType !== ELEMENT || node.localName !== "p") return null;
  const word = listOf(node);
  if (word) return word;
  return [...node.querySelectorAll("[style]")].some(isSlideBullet) ? { id: "slide", level: null } : null;
}

// A paragraph's left indent in points, for ranking PowerPoint's bullets: its own measure
// (mso-margin-left-alt, 576 to an inch) or else the CSS one; none is 0.
const POINTS = { pt: 1, in: 72, cm: 72 / 2.54, mm: 72 / 25.4, pc: 12, px: 0.75, "": 0.75 };
function indentOf(p) {
  const style = styleOf(p);
  const own = Number.parseFloat(style.get("mso-margin-left-alt") ?? "");
  if (Number.isFinite(own)) return Math.round(own / 8);
  const css = /^(-?(?:\d+(?:\.\d*)?|\.\d+))([a-z]*)$/i.exec(style.get("margin-left") ?? "");
  const scale = css ? POINTS[css[2].toLowerCase()] : undefined;
  return scale === undefined ? 0 : Math.round(Number(css[1]) * scale);
}

function buildLists(body, lists) {
  const taken = new Set();
  for (const p of [...body.querySelectorAll("p")]) {
    if (taken.has(p)) continue;
    const first = itemOf(p);
    if (!first) continue;
    const run = [{ p, ...first }];
    for (let next = p.nextSibling; next; next = next.nextSibling) {
      if (next.nodeType === TEXT && onlySourceSpace(next.data)) continue;
      const item = itemOf(next);
      if (!item) break;
      run.push({ p: next, ...item });
    }
    const slides = run.filter((entry) => entry.level === null);
    for (const entry of slides) entry.indent = indentOf(entry.p);
    const rank = new Map([...new Set(slides.map((entry) => entry.indent))].sort((a, b) => a - b).map((indent, i) => [indent, i + 1]));
    for (const entry of slides) entry.level = rank.get(entry.indent);
    for (const entry of run) taken.add(entry.p);
    makeLists(run, lists);
  }
}

function makeLists(run, lists) {
  const doc = run[0].p.ownerDocument;
  const base = run[0].level;
  const open = []; // the lists open, outermost first: { list, id, numbered, item }
  let lastTop = null;
  for (const { p, id, level, definition } of run) {
    const marker = markerOf(p);
    const { numbered, number } = numberingOf(marker, p, lists.get(definition));
    const depth = Math.min(Math.max(level - base, 0), open.length);
    while (open.length > depth + 1) open.pop();
    if (open.length === depth + 1 && (open[depth].id !== id || open[depth].numbered !== numbered)) open.pop();
    if (open.length === depth) {
      const list = doc.createElement(numbered ? "ol" : "ul");
      if (Number.isSafeInteger(number) && number >= 0 && number !== 1) list.setAttribute("start", String(number));
      if (depth > 0) open[depth - 1].item.append(list);
      else {
        if (lastTop) lastTop.after(list);
        else p.before(list);
        lastTop = list;
      }
      open.push({ list, id, numbered, item: null });
    }
    if (marker) replaceMarker(marker, p, marker.spaced ? " " : "");
    const item = doc.createElement("li");
    open[depth].list.append(item);
    item.append(p);
    open[depth].item = item;
  }
}

// ---------------------------------------------------------------------------------------------------
// 8. Formatting written as style (WPS always, Word at times) becomes the tags the importer reads, wrapped
// inside the element: bold (font-weight bold, bolder, or 500 and more), italic (italic, oblique),
// underline (not on a link: its underline is its look), strikethrough, superscript and subscript
// (vertical-align). "normal" adds nothing and undoes nothing. Not where the element is already inside that
// tag, nor bold on a heading's own style. Word's <b style='mso-bidi-font-weight:normal'> is still bold:
// the mso-bidi-* properties are for right-to-left scripts. The rest of the style goes in step 10: fonts,
// letter spacing, raised text and, on purpose, font sizes (the importer makes a heading of any element of
// 24pt and more, a large word in mid-paragraph among them).
// With `colors`, an inline element's text color (color; <font color>) and highlight (background-color,
// background, Word's mso-highlight) are handed over as data-paste-color / data-paste-background, as
// written: the importer matches them to the page's colors (black, windowtext and auto no color, a
// highlight of white or nearly none, any other unsaturated one gray). Not from inside a link (its blue is
// its look), nor from paragraphs, headings, items or cells, whose shading would mark every word of the
// block. Nor a text color of white or nearly (every channel 240 or more over white): Word writes it for
// words on a shaded cell or paragraph, the shading is not carried, and the importer would make it gray;
// the words take the page's own color instead.

const STYLE_TAGS = [
  { tag: "b", already: "b, strong", applies: (style, el) => !/^h[1-6]$/.test(el.localName) && isBold(style.get("font-weight")) },
  { tag: "i", already: "i, em", applies: (style) => /^(?:italic|oblique)\b/i.test(style.get("font-style") ?? "") },
  { tag: "u", already: "u, a[href]", applies: (style) => decorationOf(style).includes("underline") },
  { tag: "s", already: "s, strike, del", applies: (style) => decorationOf(style).includes("line-through") },
  { tag: "sup", already: "sup", applies: (style) => /^super$/i.test(style.get("vertical-align") ?? "") },
  { tag: "sub", already: "sub", applies: (style) => /^sub$/i.test(style.get("vertical-align") ?? "") },
];
const isBold = (weight = "") => /^bold(?:er)?$/i.test(weight) || Number(weight) >= 500;
const decorationOf = (style) => `${style.get("text-decoration") ?? ""} ${style.get("text-decoration-line") ?? ""}`.toLowerCase();
const CARRIES_COLOR = new Set(["span", "font", "b", "strong", "i", "em", "u", "s", "strike", "sup", "sub"]);

function styleAsTags(body, { colors }) {
  for (const el of [...body.querySelectorAll("[style], font[color]")]) {
    const style = styleOf(el);
    if (colors && CARRIES_COLOR.has(el.localName) && !el.closest("a[href]")) {
      const text = style.get("color") || (el.localName === "font" ? el.getAttribute("color") : "");
      const background = style.get("background-color") || colorIn(style.get("background")) || style.get("mso-highlight");
      if (text && !nearlyWhite(text)) el.setAttribute("data-paste-color", text);
      if (background) el.setAttribute("data-paste-background", background);
    }
    for (const { tag, already, applies } of STYLE_TAGS) if (applies(style, el) && !el.closest(already)) wrapInside(el, tag);
  }
}

// The color in a background shorthand (Word writes "background:yellow", at times with more after it).
// A part is a function with its parentheses, which hold no other parenthesis (so an unclosed one is read
// to the next "(" at most, never to the end again for every part), or a word.
const NOT_COLORS = new Set(["none", "repeat", "scroll", "fixed", "local", "top", "bottom", "left", "right", "center", "auto", "inherit", "initial", "unset", "space", "round"]);
function colorIn(value) {
  const parts = (value ?? "").match(/[^\s(]+\([^()]*\)|\S+/g) ?? [];
  if (parts.length <= 1) return parts[0] ?? "";
  return parts.find((part) => /^(?:#|rgba?\(|hsla?\()/i.test(part) || (/^[a-z]+$/i.test(part) && !NOT_COLORS.has(part.toLowerCase()))) ?? "";
}

// White or nearly: "white", #fff, #ffffff (with or without an alpha), rgb() and rgba() in numbers or
// percentages, a color with an alpha taken over white. Other forms are not judged here.
function nearlyWhite(value) {
  const text = value.trim().toLowerCase();
  if (text === "white") return true;
  let channels = null;
  const hex = /^#([0-9a-f]{3,8})$/.exec(text)?.[1];
  if (hex?.length === 3 || hex?.length === 4) channels = [...hex].map((digit) => Number.parseInt(digit + digit, 16));
  else if (hex?.length === 6 || hex?.length === 8) channels = hex.match(/../g).map((pair) => Number.parseInt(pair, 16));
  const call = /^rgba?\(([^()]*)\)$/.exec(text)?.[1];
  if (call) {
    channels = call.split(/[\s,/]+/).filter(Boolean).slice(0, 4)
      .map((part, i) => (part.endsWith("%") ? Number.parseFloat(part) * 2.55 : i < 3 ? Number(part) : Number(part) * 255));
  }
  if (!channels || channels.length < 3 || channels.some(Number.isNaN)) return false;
  const alpha = (channels[3] ?? 255) / 255;
  return channels.slice(0, 3).every((channel) => 255 + (channel - 255) * alpha >= 240);
}

/** The element's content wrapped in a new `name` element; a block's blocks each wrapped inside the same way. */
function wrapInside(el, name) {
  let wrapper = null;
  for (const child of [...el.childNodes]) {
    if (isBlock(child)) {
      wrapper = null;
      wrapInside(child, name);
      continue;
    }
    if (!wrapper) {
      if (child.nodeType === TEXT && onlySourceSpace(child.data)) continue;
      wrapper = el.ownerDocument.createElement(name);
      child.before(wrapper);
    }
    wrapper.append(child);
  }
}

// ---------------------------------------------------------------------------------------------------
// 9. Breaks and tables.
// Shift+Enter is <br style='mso-special-character:line-break'>: a <br>, kept (the second one Word adds
// after a break at a paragraph's end went in step 2). A page, section or column break is a <br clear=all>
// styled page-break-before, mso-break-type:section-break or mso-column-break-before: it goes, the page has
// no pages (a paragraph it leaves empty is an empty paragraph, step 10).

function removePageBreaks(body) {
  for (const br of [...body.querySelectorAll("br[style]")]) {
    const style = styleOf(br);
    if (style.has("page-break-before") || style.has("mso-column-break-before") || /section-break/i.test(style.get("mso-break-type") ?? "")) br.remove();
  }
}

// Tables keep their rows, cells, row and column spans and the cells' paragraphs (lists in a cell were made
// lists in step 7); widths, borders, padding and alignment go with the attributes. Word's filler cell for a
// row shorter than the others (mso-cell-special:placeholder) stays as an empty cell, keeping the columns in
// line. Cells in a <thead> become <th>: the importer knows a header row by them.

function cleanTables(body) {
  for (const cell of [...body.querySelectorAll("td, th")]) {
    if (/^placeholder$/i.test(styleOf(cell).get("mso-cell-special") ?? "")) cell.replaceChildren();
    if (cell.localName === "td" && cell.parentElement?.parentElement?.localName === "thead") rename(cell, "th");
  }
}

// ---------------------------------------------------------------------------------------------------
// 10. What is left of Word's markup.
// Wrappers go, their content stays: spans and <font>, their styles read by now (one that carries a color
// stays, a <font> as a span, since the importer reads spans as inline), links with no address (Word's
// bookmarks, <a name="_Toc…">), tracked insertions (<ins>) and Office's elements left: o:p, at the end of
// nearly every paragraph (an empty paragraph's &nbsp; is in it), o:wrapblock around a picture, content
// controls (w:sdt), smart tags (st1:chsdate, st1:place …).

function unwrapWrappers(body) {
  for (const el of [...body.querySelectorAll("*")]) {
    const name = el.localName;
    const colored = el.hasAttribute("data-paste-color") || el.hasAttribute("data-paste-background");
    if (name === "font" && colored) rename(el, "span");
    else if ((name === "span" || name === "font") && !colored) unwrap(el);
    else if (name === "a" && !el.hasAttribute("href")) unwrap(el);
    else if (name === "ins" || name.includes(":")) unwrap(el);
  }
}

// A <br> standing between blocks rather than in a line of text (<br clear=all> before the footnotes, one
// left beside a table) goes.
function removeLooseBreaks(body) {
  for (const br of [...body.querySelectorAll("br")]) {
    const parent = br.parentElement;
    if (!isBlock(parent) || /^(?:p|h[1-6]|pre|dt|dd|caption|figcaption|summary)$/.test(parent.localName)) continue;
    const beside = (step) => {
      let node = br[step];
      while (node?.nodeType === TEXT && onlySourceSpace(node.data)) node = node[step];
      return node;
    };
    const [before, after] = [beside("previousSibling"), beside("nextSibling")];
    if ((!before || isBlock(before)) && (!after || isBlock(after))) br.remove();
  }
}

// Attributes: only what the importer reads stays: a link's href, as written ("#_ftn1" stays relative, the
// importer makes it absolute), a picture's src, width, height and alt, a cell's colspan and rowspan, a
// numbered list's start (step 7), and step 8's colors. Classes, styles, lang, align, widths, borders, names,
// ids, a list's type and Office's prefixed attributes (v:shapes) go.
// A link to a place in the document (a footnote, a heading in the table of contents) Word writes as
// "#_ftn1", or at times as the document file's address and the place, "file:///C:/…/report.docx#_ftn1".
// The importer drops file: addresses, so a file: address with a place is reduced to the place and reads as
// the first form does.
const KEPT_ATTRIBUTES = { a: ["href"], img: ["src", "width", "height", "alt"], td: ["colspan", "rowspan"], th: ["colspan", "rowspan"], ol: ["start"] };
const COLOR_ATTRIBUTES = ["data-paste-color", "data-paste-background"];

function keepAttributes(body) {
  for (const el of body.querySelectorAll("*")) {
    const kept = KEPT_ATTRIBUTES[el.localName] ?? [];
    for (const { name } of [...el.attributes]) {
      if (!kept.includes(name) && !COLOR_ATTRIBUTES.includes(name)) el.removeAttribute(name);
    }
    const href = el.localName === "a" ? el.getAttribute("href")?.trim() : null;
    const place = href && /^file:/i.test(href) ? href.indexOf("#") : -1;
    if (place !== -1 && place < href.length - 1) el.setAttribute("href", href.slice(place));
  }
}

// Formatting left with nothing in it goes: a <b> around a marker that went, a colored span of nothing.
const FORMATTING = new Set(["a", "b", "strong", "i", "em", "u", "s", "strike", "del", "sup", "sub", "span", "small", "big", "tt", "code"]);
function removeEmptyFormatting(body) {
  for (const el of [...body.querySelectorAll("*")].reverse()) {
    if (FORMATTING.has(el.localName) && !el.textContent && !el.querySelector("img, br")) el.remove();
  }
}

// A paragraph with no text but spaces and no picture is Word's empty paragraph, which Word writes as one
// &nbsp; (in an o:p); one written without it, or left empty by a page break, is written so too. It stays:
// the importer makes no block of it, and a table copied with the empty paragraph after it is still a
// table alone (its &nbsp; is no word).
function fillEmptyParagraphs(body) {
  for (const p of body.querySelectorAll("p")) {
    if (!/\S/.test(p.textContent) && !p.querySelector("img")) p.textContent = " ";
  }
}

// No whitespace between blocks, or at the start or end of the body: the importer would read a space there
// as text of its own.
function removeSpaceBetweenBlocks(body) {
  for (const node of descendants(body)) {
    if (node.nodeType !== TEXT || !onlySourceSpace(node.data)) continue;
    const parent = node.parentNode;
    const before = node.previousSibling;
    const after = node.nextSibling;
    const inStructure = /^(?:table|thead|tbody|tfoot|tr|ul|ol)$/.test(parent.localName);
    if (inStructure || isBlock(before) || isBlock(after) || (parent === body && (!before || !after))) node.remove();
  }
}
