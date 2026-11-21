import { newDomNames } from "../../../../shared/old-names.mjs";
import { convertRenderedMath } from "./math.mjs";
import { languageFromFence } from "./languages.mjs";
import { NOTION_COLOR_NAMES, backgroundColor, textColor } from "./colors.mjs";
import { normalize, spec } from "./rich.mjs";
import { BOX, markCards } from "./cards.mjs";

// Pasted HTML as block specs or rich text (read.mjs decides which).
//   parseClipboardHTML(html)       the HTML in a document of its own (no scripts run, no pictures
//                                  load), formulas a page drew made formula marks (math.mjs), cleaned
//                                  as DOMPurify's defaults clean it (sanitize), in a div; a new copy each
//                                  call; the kit's old names (a page or an export made before 2026-10-26)
//                                  new (newDomNames)
//   normalizeHTML(root, { inline }) in place: Slack's emoji pictures as their :name: text; Notion's
//     block-color-* classes as color marks; <br> in a <p> splits it; first pass: Google Sheets'
//     wrapper, whitespace-only text, meta / style / script / head / title go, font-size ≥ 24px (or
//     > 2em) makes an h1, line-through / italic / bold (≥ 500) styles wrap del / em / strong, b →
//     strong, i → em, a font-weight: normal strong (Google Docs' wrapper) → span, section / article
//     → div, display: inline divs → span, checkboxes → "[x] " / "[ ] ", a table of one cell a row
//     (layout) → its contents and dividers, a ul right in a ul moves into the li before it, style and
//     dir go, plain spans unwrapped; second pass: a container of only h1s (or h2s) one heading,
//     empty divs / spans go, p / div holding blocks unwrapped; loose text at the top in <p> (not
//     inline).
//   htmlToBlocks(root)             normalized, element by element as blocks (blockOf)
//   htmlToRichText(root)           normalized, as one rich text (pasted in text)
//   containsRichFormatting(root)   any element but span / div / p (or code, columns, colors,
//                                  formulas); without, the HTML is pasted as plain text
// Blocks (blockOf, in this order): hr → divider; h* → heading 1 / 2 / 3 / 4 (its pictures after it);
//   pre / code / div.sourceCode → code (language from a language-x class or a language's name; a
//   figure's figcaption its caption); data-notion-callout → callout; a card's box (cards.mjs) → box;
//   blockquote → quote (its first node its text, the rest its blocks); details → toggle;
//   data-notion-tab-container → tabs; table →
//   table (row and column spans spread into empty cells; a first row all th a header row, every row
//   starting with th a header column); data-notion-column-list → columns (8 at most); the kit's
//   ol.doc-flow → report_flow of report_step (flowchartBlock); ul / ol → their
//   li; li, or text starting "[x]", "[ ]", "-", "*", "•" → list item / to-do (its first node and inline
//   nodes its text, the rest its blocks; a numbered one its number where its <ol start> says); img → image (700 wide at most, captioned by data-caption or a
//   figcaption); empty download links, video, audio, iframe → embed; data-notion-equation →
//   equation; any other element with text → text (its pictures and list items after it).
// Inline (richTextOf): heading text bold (as one rich text); strong / em / u / code·pre / del·strike·s
//   → b / i / _ / c / s; the nearest a's href → a; color marks (ATTR.highlight,
//   ATTR.backgroundHighlight) → h; inline formulas (ATTR.inlineEquation) → e; control and zero-width
//   characters dropped; 100,000 characters at most. stripText (headings, items): "[ ] ", "[x] " and a
//   leading "-", "*", "•" go, runs of spaces one.
// Left out as the page has no such block: page, user and date mentions, comments, link previews,
//   tables of contents; video and audio are embeds; toggle headings are toggles.
// Also: formulas a page drew (math.mjs); colors (colors.mjs): with `colors` "nearest" (Word, Google
//   Docs, Notion), colors in styles become the page's nearest, with "exact" (any page) only the page's
//   own, with either the kit's doc-text-* / doc-highlight-* classes; without (null), only the color
//   marks the HTML carries (ATTR.highlight, block-color-* classes); with `cards` (a paste's: read.mjs),
//   an AI answer's cards (cards.mjs, before normalizing) a box (a highlight block, to-blocks.mjs) and
//   rows of columns (ATTR.columnList).

/**
 * The attributes Notion writes in the HTML it puts on the clipboard. The import marks the colors,
 * columns and formulas of any other HTML with them too, so that one reading takes them all.
 */
export const ATTR = {
  highlight: "data-notion-highlight", backgroundHighlight: "data-notion-background-highlight", inlineEquation: "data-notion-inline-equation",
  comment: "data-notion-block-comment-id", code: "data-notion-code-syntax", callout: "data-notion-callout", calloutIcon: "data-notion-callout-icon",
  calloutBackground: "data-notion-callout-background", toc: "data-notion-toc", file: "data-notion-file", fileAlias: "data-notion-file-alias",
  columnList: "data-notion-column-list", column: "data-notion-column-ratio", image: "data-notion-image", video: "data-notion-video", audio: "data-notion-audio",
  equation: "data-notion-equation", linkPreview: "data-notion-link-preview", embed: "data-notion-embed", tabContainer: "data-notion-tab-container", tabPage: "data-notion-tab-page",
};
const INLINE = new Set(["a", "strong", "em", "code", "del", "s", "span", "time", "sup", "sub"]); // read as inline (isInline)
const REMOVED = new Set(["meta", "style", "script", "head", "title"]); // dropped with what they hold
const HEADINGS = ["h1", "h2", "h3", "h4", "h5", "h6"];
const BULLETS = ["•", "◦", "▪"]; // a bullet in rich text, by the item's depth
const SOURCE_CODE = "sourceCode";
const BLANK_LINES = /^( |\t)*(\n)+( |\t)*$/;
const TODO_CHECKED = /^\[x\].*/;
const TODO_EMPTY = /^\[ \].*/;
const BULLET_TEXT = /^[-*•].*/; // text read as a list item
// Characters pasted text loses (controls, line and paragraph separators, zero-width spaces, tags, lone surrogates).
const BAD_CHAR = /[\x00-\x08\x0b-\x1f\u2028\u2029\u200b\u{e0000}-\u{e007f}\ud800-\udfff]/gu;
const clean = (text) => text.replace(BAD_CHAR, "");
// The colors a color mark may name: default and the page's nine (and Notion's teal), each as text and as a background.
const COLORS = new Set(["default", ...NOTION_COLOR_NAMES].flatMap((c) => [c, `${c}_background`]));
const color = (value) => (COLORS.has(value) ? value : undefined);

const tagOf = (node) => (node?.nodeType === 1 ? node.tagName.toLowerCase() : "");
const isElement = (node, ...tags) => node?.nodeType === 1 && (!tags.length || tags.includes(tagOf(node)));
const isInline = (node) => node.nodeType === 3 || INLINE.has(tagOf(node));
const ancestors = (node) => {
  const out = [];
  for (let p = node.parentNode; p; p = p.parentNode) out.push(p);
  return out;
};
const listDepth = (node) => ancestors(node).filter((a) => isElement(a, "ul", "ol")).length; // how many lists hold it
// The kit's flowchart (步骤流程图, ol.doc-flow) and its steps, as a reader's page or an exported
// report has them: copied from one, a flowchart again (flowchartBlock).
const FLOW = "doc-flow";
const isFlowchart = (node) => isElement(node, "ol") && node.classList.contains(FLOW);
const isStep = (node) => isElement(node, "li") && isFlowchart(node.parentNode);
const KIT_COLOR = /^doc-(text|highlight)-[a-z]+$/;

// ---------- normalizing ----------

function retag(element, tag) {
  const next = element.ownerDocument.createElement(tag);
  while (element.firstChild) next.appendChild(element.firstChild);
  for (const a of [...element.attributes].reverse()) next.setAttribute(a.name, a.value);
  element.parentNode?.replaceChild(next, element);
  return next;
}
function wrapInside(element, tag) {
  const inner = element.ownerDocument.createElement(tag);
  while (element.firstChild) inner.appendChild(element.firstChild);
  element.appendChild(inner);
}
function unwrap(element) {
  const moved = [];
  let after = element;
  while (element.firstChild) {
    const child = element.firstChild;
    moved.push(child);
    element.parentNode?.insertBefore(child, after.nextSibling);
    after = child;
  }
  const parent = element.parentNode;
  if (parent) {
    parent.removeChild(element);
    parent.normalize();
  }
  return moved;
}
// A container that may be unwrapped or merged.
function plainContainer(element) {
  return isElement(element) && element.childNodes.length > 0 && !["blockquote", "details", "figure", "summary"].includes(tagOf(element))
    && ![ATTR.highlight, ATTR.columnList, ATTR.column, ATTR.callout, ATTR.equation, ATTR.tabContainer, ATTR.tabPage, BOX].some((a) => element.hasAttribute(a));
}
const BLOCK_CHILD = /^(p|div|img|ul|ol|table|hr|video|iframe|figure|details|pre|blockquote|h[1-6])$/;

function firstPass(node, queue) {
  let el = node;
  if (isElement(el, "google-sheets-html-origin") && el.parentNode) {
    const kids = [...el.childNodes];
    for (const kid of kids) el.parentNode.insertBefore(kid, el);
    queue.unshift(...kids);
    el.remove();
    return;
  }
  if (el.parentNode && ((el.nodeType === 3 && BLANK_LINES.test(el.data)) || REMOVED.has(tagOf(el)))) {
    el.parentNode.removeChild(el);
    return;
  }
  if (el.nodeType !== 1) return;
  const style = el.style;
  if (style) {
    const size = style.fontSize || "";
    const px = /px|pt/.test(size) ? parseInt(size, 10) : undefined;
    const em = /em/.test(size) ? parseInt(size, 10) : undefined;
    if (px && px >= 24) el = retag(el, "h1");
    else if (em && em > 2) el = retag(el, "h1");
    if (el.style.textDecoration === "line-through") wrapInside(el, "del");
    if (el.style.fontStyle === "italic") wrapInside(el, "em");
    // Not a step of the kit's flowchart: the kit draws a step's own words at the title's weight
    // (the short form) and its blocks at their own, so its weight is no mark of what it holds (its
    // title's <strong> comes as it is; flowchartBlock).
    if ((el.style.fontWeight === "bold" || (el.style.fontWeight && parseInt(el.style.fontWeight, 10) >= 500)) && !isStep(el)) wrapInside(el, "strong");
  }
  if (tagOf(el) === "img") {
    const m = /^([0-9]+)px$/i.exec(el.style?.width || "");
    if (!el.getAttribute("width") && m) el.setAttribute("width", m[1]);
  }
  if (tagOf(el) === "b") el = retag(el, "strong");
  else if (tagOf(el) === "i") el = retag(el, "em");
  if (tagOf(el) === "strong" && el.style?.fontWeight === "normal") el = retag(el, "span");
  if (tagOf(el) === "section" || tagOf(el) === "article") el = retag(el, "div");
  if (tagOf(el) === "div" && el.style?.display === "inline") el = retag(el, "span");
  if (tagOf(el) === "input" && el.getAttribute("type") === "checkbox") {
    const span = el.ownerDocument.createElement("span");
    span.textContent = `[${el.hasAttribute("checked") ? "x" : " "}] `;
    el.parentNode?.insertBefore(span, el);
    el.remove();
    queue.push(span);
    return;
  }
  if (tagOf(el) === "table" && !el.classList.contains("simple-table")) {
    const rows = [...el.querySelectorAll("tr")].map((row) => row.querySelectorAll("td, th"));
    if (rows.every((cells) => cells.length === 1)) {
      const fragment = el.ownerDocument.createDocumentFragment();
      for (const [cell] of rows) {
        for (const child of [...cell.childNodes]) {
          fragment.appendChild(child.cloneNode(true));
          queue.push(child);
        }
        fragment.appendChild(el.ownerDocument.createElement("hr"));
      }
      el.parentNode?.replaceChild(fragment, el);
    }
  }
  if (isElement(el, "ul", "ol") && isElement(el.parentNode, "ul", "ol") && isElement(el.previousSibling, "li")) el.previousSibling.appendChild(el);
  el.removeAttribute("style");
  el.removeAttribute("dir");
  if (tagOf(el) === "span") {
    const className = el.getAttribute("class");
    if (className === "page-comment" || className?.split(" ").includes("retain-span")) return;
    const keep = [ATTR.highlight, ATTR.backgroundHighlight, "data-notion-block-discussion-id", ATTR.comment, ATTR.inlineEquation].some((a) => el.hasAttribute(a));
    (keep ? [...el.children] : unwrap(el)).forEach((n) => queue.push(n));
    return;
  }
  if (tagOf(el) === "pre" || tagOf(el) === "code") return;
  queue.push(...el.childNodes);
}

function secondPass(node, queue) {
  for (const h of ["h1", "h2"]) {
    if (!(plainContainer(node) && [...node.childNodes].every((child) => isElement(child, h)))) continue;
    const merged = node.ownerDocument.createElement(h);
    for (const child of [...node.childNodes]) for (const grand of [...child.childNodes]) merged.appendChild(grand.cloneNode(true));
    const parent = node.parentNode;
    if (parent) {
      if (isElement(node, "td", "th")) {
        const cell = node.ownerDocument.createElement(tagOf(node));
        cell.appendChild(merged);
        parent.insertBefore(cell, node);
      } else parent.insertBefore(merged, node);
      parent.removeChild(node);
    }
    queue.push(merged);
    return;
  }
  if (isElement(node, "div", "span") && node.parentNode && node.childNodes.length === 0) {
    node.parentNode.removeChild(node);
    return;
  }
  if (plainContainer(node) && isElement(node, "p", "div", "figure") && [...node.childNodes].some((child) => child.nodeType === 1 && BLOCK_CHILD.test(tagOf(child)))) {
    unwrap(node).forEach((n) => queue.push(n));
    return;
  }
  if (node?.childNodes) queue.push(...node.childNodes);
}

// Colors of the kit's classes and of styles (colors.mjs) as color marks (ATTR.highlight,
// ATTR.backgroundHighlight), before the first pass drops styles.
const KIT_TEXT = /^doc-text-(\w+)$/;
const KIT_BACKGROUND = /^doc-highlight-(\w+)$/;
function markColors(root, mode) {
  for (const el of root.querySelectorAll("*")) {
    let text;
    let background;
    for (const name of el.classList) {
      text ??= color(KIT_TEXT.exec(name)?.[1]);
      background ??= color(KIT_BACKGROUND.exec(name) ? `${KIT_BACKGROUND.exec(name)[1]}_background` : "");
    }
    if (mode) {
      const near = { nearest: mode === "nearest" };
      text ??= textColor(el.getAttribute("data-paste-color") ?? el.style?.color ?? "", near);
      background ??= backgroundColor(el.getAttribute("data-paste-background") ?? (el.style?.backgroundColor || el.style?.background) ?? "", near);
    }
    el.removeAttribute("data-paste-color");
    el.removeAttribute("data-paste-background");
    if (text && !el.hasAttribute(ATTR.highlight)) el.setAttribute(ATTR.highlight, text);
    if (background && !el.hasAttribute(ATTR.backgroundHighlight)) el.setAttribute(ATTR.backgroundHighlight, background);
  }
}

export function normalizeHTML(root, { inline = false, colors = null } = {}) {
  const doc = root.ownerDocument;
  // Slack's emoji pictures as their :name:.
  for (const img of root.querySelectorAll("img[data-stringify-emoji]")) {
    const raw = img.getAttribute("data-stringify-emoji") ?? "";
    const m = /^:(.+):$/.exec(raw);
    if (m && img.parentNode) img.parentNode.replaceChild(doc.createTextNode(raw), img);
  }
  // Notion's export's block-color-* classes as color marks.
  for (const el of root.querySelectorAll(`[class*="block-color-"]:not([${ATTR.highlight}]):not(details):not(td):not(th):not([${ATTR.callout}]):not([${ATTR.tabContainer}]):not([${ATTR.tabPage}])`)) {
    const name = [...el.classList].find((x) => x.startsWith("block-color-"));
    if (name) el.setAttribute(ATTR.highlight, name.slice(12));
  }
  if (colors !== null) markColors(root, colors);
  for (const el of root.querySelectorAll(`span[${ATTR.inlineEquation}]`)) {
    if (el.textContent) continue;
    const tex = el.getAttribute(ATTR.inlineEquation);
    if (tex) el.replaceChildren(doc.createTextNode(tex));
  }
  root.normalize();
  // <br> in a <p>: an element of nothing but br's gives them up first, then the paragraph splits at
  // its first br, until it has none.
  for (const p of root.querySelectorAll("p")) {
    let n = p.firstChild;
    for (let guard = 0; n && guard < 1e4; guard++) {
      let moved = false;
      if (n.nodeType === 1 && !n.textContent.trim()) {
        for (const br of [...n.querySelectorAll("br")]) {
          p.insertBefore(br, n);
          moved = true;
        }
      }
      const next = n.nextSibling;
      if (moved) p.removeChild(n);
      n = next;
    }
  }
  const paragraphs = [...root.querySelectorAll("p")];
  for (let guard = 0; guard < 1e4; guard++) {
    const p = paragraphs.shift();
    if (!p || !p.parentNode) break;
    const br = p.querySelector("br");
    if (!br || br.parentElement !== p) continue;
    const next = doc.createElement("p");
    for (const a of [...p.attributes]) next.setAttribute(a.name, a.value);
    p.parentNode.insertBefore(next, p.nextSibling);
    for (let n = br.nextSibling; n;) {
      const after = n.nextSibling;
      next.appendChild(n);
      n = after;
    }
    p.removeChild(br);
    paragraphs.unshift(next);
  }
  const queue = [...root.childNodes];
  while (queue.length) {
    const n = queue.shift();
    if (n) firstPass(n, queue);
  }
  queue.push(...root.childNodes);
  while (queue.length) {
    const n = queue.shift();
    if (n) secondPass(n, queue);
  }
  root.normalize();
  if (!inline) {
    for (const n of [...root.childNodes]) {
      if (n.nodeType !== 3) continue;
      const p = doc.createElement("p");
      root.insertBefore(p, n);
      p.appendChild(n);
    }
  }
  return root;
}

// ---------- rich text ----------

// A formula's text (Notion's attributes, KaTeX's annotation, $$…$$ / $…$).
function equationOf(el) {
  const annotation = el.querySelector('annotation[encoding="application/x-tex"]')?.textContent?.trim();
  const text = el.textContent?.trim() ?? "";
  return el.getAttribute(ATTR.equation) || el.getAttribute(ATTR.inlineEquation) || annotation || /^\$\$([\s\S]+?)\$\$\s*$/.exec(text)?.[1].trim() || /^\$([\s\S]+?)\$$/.exec(text)?.[1].trim();
}

// A picture in a table's cell (`pictures`) is a token of its own, PICTURE annotated
// ["img", its address, its alt, "", its width] (inline.mjs's pieces, the width of an <img width>), which
// a cell of the page shows (to-blocks.mjs richHtml).
const PICTURE = String.fromCodePoint(0xfffc);
function richTextOf(node, { stripText = false, stripSurroundingWhitespace = false, ignoreCodeBlock = false, preserveLineBreaks = false, pictures = false } = {}) {
  const doc = node.ownerDocument;
  if (!stripText) {
    // Paragraphs, headings and items as lines with their bullets (the structure kept in one text).
    for (const p of node.querySelectorAll("p:not(:first-child)")) p.prepend("\n");
    for (const h of node.querySelectorAll(HEADINGS.map((tag) => `${tag}:not(:first-child)`).join(", "))) h.prepend("\n");
    for (const li of node.querySelectorAll("ul > li")) {
      const depth = listDepth(li) - 1;
      li.prepend(`\n${"    ".repeat(depth)}${BULLETS[depth % BULLETS.length]} `);
    }
    for (const ol of node.querySelectorAll("ol")) {
      const indent = "    ".repeat(listDepth(ol));
      [...ol.children].forEach((li, i) => li.prepend(`\n${indent}${i + 1}. `));
    }
    for (const pre of node.querySelectorAll("pre")) pre.parentNode?.insertBefore(doc.createTextNode("\n\n"), pre);
  }
  const all = [];
  (function walk(n) {
    if (n.nodeType === 1 && (n.hasAttribute(ATTR.comment) || (ignoreCodeBlock && tagOf(n) === "pre"))) return;
    all.push(n);
    for (const child of n.childNodes) walk(child);
  })(node);
  const picture = (n) => pictures && tagOf(n) === "img" && Boolean(n.getAttribute("src"));
  const nodes = all.filter((n) => (n.nodeType !== 3 ? (preserveLineBreaks && tagOf(n) === "br") || picture(n) : !(stripText && BLANK_LINES.test(n.data))));
  const tokens = [];
  const seenEquations = new Set();
  nodes.forEach((n, i) => {
    let text = n.nodeType === 3 ? n.data : picture(n) ? PICTURE : "\n";
    if (stripText) text = text.replace(/\[ \] /g, "").replace(/\[x\] /g, "").replace(/^[-*•]\s?/g, "").replace(/(\s)+/g, "$1");
    if (i === 0 && stripSurroundingWhitespace && !node.hasAttribute?.("confluenceTabSpaces")) text = text.trimStart();
    text = clean(text);
    if (i === nodes.length - 1 && stripSurroundingWhitespace) text = text.trimEnd();
    const up = ancestors(n).filter((a) => a.nodeType === 1);
    const annotations = picture(n) ? [["img", n.getAttribute("src"), n.getAttribute("alt") ?? "", "", n.getAttribute("width") ?? ""]] : [];
    if (!stripText && up.some((a) => HEADINGS.includes(tagOf(a)))) annotations.push(["b"]);
    if (up.some((a) => tagOf(a) === "strong")) annotations.push(["b"]);
    if (up.some((a) => tagOf(a) === "em")) annotations.push(["i"]);
    if (up.some((a) => tagOf(a) === "u")) annotations.push(["_"]);
    if (up.some((a) => tagOf(a) === "code" || tagOf(a) === "pre")) annotations.push(["c"]);
    if (up.some((a) => ["del", "strike", "s"].includes(tagOf(a)))) annotations.push(["s"]);
    const colors = new Set();
    for (const a of up) {
      const background = color(a.getAttribute(ATTR.backgroundHighlight) ?? "");
      if (background && background.endsWith("_background")) colors.add(background);
      const highlight = a.getAttribute(ATTR.highlight);
      if (highlight && highlight !== "undefined" && color(highlight)) colors.add(highlight);
    }
    for (const c of colors) annotations.push(["h", c]);
    const link = up.find((a) => tagOf(a) === "a");
    if (link && link.href) {
      let target = link.href;
      try {
        const m = /^#maybeCitation:<(.*)>$/.exec(decodeURIComponent(link.hash));
        if (m) target = decodeURIComponent(m[1]);
      } catch {
        // not a valid encoding: the link as it is
      }
      annotations.push(["a", target]);
    }
    const equation = up.find((a) => a.hasAttribute(ATTR.inlineEquation) || a.classList.contains("notion-text-equation-token"));
    if (equation) {
      if (seenEquations.has(equation)) return;
      seenEquations.add(equation);
      const tex = equationOf(equation) ?? equation.textContent;
      if (tex) tokens.push(["⁍", [["e", tex], ...annotations]]);
      return;
    }
    if (text) tokens.push(annotations.length ? [text, annotations] : [text]);
  });
  // 100,000 characters at most.
  let left = 1e5;
  const cut = [];
  for (const [t, a] of tokens) {
    if (left <= 0) break;
    const s = [...t].slice(0, left).join("");
    left -= [...s].length;
    cut.push(a ? [s, a] : [s]);
  }
  return normalize(cut);
}

// Code's text (br a line break, a div ends one, spaces at line ends dropped).
function codeText(n) {
  if (n.nodeName === "#text") return n.textContent ?? "";
  return [...n.childNodes].map((child) => (tagOf(child) === "br" ? "\n" : tagOf(child) === "div" ? `${codeText(child)}\n` : codeText(child))).join("")
    .split("\n").map((line) => line.trimEnd()).join("\n").trimEnd();
}

// A language in classes (its name, or language-x).
function languageOf(classList) {
  for (const name of classList ?? []) {
    const direct = languageFromFence(name);
    if (direct) return direct;
    const m = /language-(\w+)/.exec(name);
    if (m && languageFromFence(m[1])) return languageFromFence(m[1]);
  }
  return null;
}

// ---------- elements as blocks ----------

const text = (node, type, options) => {
  const props = {};
  const highlight = node.getAttribute(ATTR.highlight);
  const c = highlight ? color(highlight) : undefined;
  if (highlight) node.removeAttribute(ATTR.highlight);
  if (c) props.block_color = c;
  return spec(type, richTextOf(node, options), props);
};

const MEDIA = () => ["img[src]", "a[download]", `a[${ATTR.file}]`, `audio[${ATTR.audio}]`, `video[${ATTR.video}]`, "li"];
// What in a block makes blocks of its own (pictures, downloads, Notion's files and media, items; pre when asked).
function extras(node, withPre = false) {
  const selectors = MEDIA();
  if (withPre) selectors.push("pre");
  return blocksOf([...node.querySelectorAll(selectors.join(","))]);
}

// Video, audio and other links by their address: embeds.
const mediaBlock = (url) => spec("embed", [], { source: url });

const heading = (tag) => ({ h1: "header", h2: "sub_header", h3: "sub_sub_header" })[tag] ?? "header_4";

function codeBlock(node) {
  const code = node.querySelector("code");
  const language = languageFromFence(node.getAttribute(ATTR.code)) || languageOf(code?.parentElement?.classList) || languageOf(code?.classList) || "Plain Text";
  const props = { language, code_wrap: true };
  const caption = node.closest("figure")?.querySelector("figcaption");
  if (caption) {
    const t = richTextOf(caption, { stripText: true, stripSurroundingWhitespace: true });
    if (t.length) props.caption = t;
    caption.parentNode?.removeChild(caption);
  }
  const body = codeText(node);
  return spec("code", body ? [[clean(body)]] : [], props);
}

function calloutBlock(node) {
  const props = {};
  const background = color(node.getAttribute(ATTR.calloutBackground) ?? "");
  if (background) props.block_color = background;
  const icon = node.getAttribute(ATTR.calloutIcon);
  if (icon && !/^(https?:|\/|data:|notion:\/\/custom_emoji)/.test(icon)) props.icon = icon; // an emoji only: a picture's address or a custom emoji of Notion's is no icon here
  const kids = [...node.childNodes].filter((child) => (child.textContent ?? "").trim() !== "");
  const [first, ...rest] = kids;
  let title = [];
  let children = [];
  if (first && isElement(first, "p")) {
    title = richTextOf(first, { stripSurroundingWhitespace: true });
    children = blocksOf(rest);
  } else if (first && !isInline(first)) children = blocksOf(kids);
  else if (first) title = richTextOf(node, { stripSurroundingWhitespace: true });
  // A callout's spec has no title: its text is its first block.
  const body = title.length ? [spec("text", title), ...children] : children;
  return spec("callout", [], props, body.length ? body : [spec("text")]);
}

function quoteBlock(node) {
  const [first, ...rest] = [...node.childNodes];
  const title = isElement(first) ? richTextOf(first, { stripSurroundingWhitespace: true }) : first?.textContent?.trim() ? [[clean(first.textContent.trim())]] : [];
  return spec("quote", title, {}, blocksOf(rest));
}

function detailsBlock(node) {
  const summary = node.querySelector("summary");
  const head = summary?.querySelector(HEADINGS.join(", "));
  const props = {};
  const highlight = node.getAttribute(ATTR.highlight);
  if (highlight) {
    node.removeAttribute(ATTR.highlight);
    if (color(highlight)) props.block_color = color(highlight);
  }
  const kids = blocksOf([...node.childNodes].filter((child) => child !== summary));
  const title = head ? richTextOf(head, { stripSurroundingWhitespace: true }) : summary?.textContent ? richTextOf(summary, { stripSurroundingWhitespace: true }) : [];
  return spec("toggle", title, props, kids);
}

function tabsBlock(node) {
  const pages = [...node.querySelectorAll(`[${ATTR.tabPage}]`)].filter((page) => page.parentElement === node).map((page) => {
    const summary = page.querySelector("summary");
    const title = summary ? richTextOf(summary, { stripSurroundingWhitespace: true }) : [];
    const props = {};
    const icon = page.getAttribute(ATTR.tabPage);
    if (icon && !/^(https?:|data:|notion:\/\/custom_emoji)/.test(icon)) props.icon = icon;
    return spec("text", title, props, blocksOf([...page.childNodes].filter((child) => child !== summary)));
  });
  return spec("tab", [], {}, pages);
}

const int = (value, fallback) => {
  const n = value !== null ? parseInt(value, 10) : fallback;
  return Number.isFinite(n) ? n : fallback;
};

// A table: row and column spans spread into empty cells; a first row all th a header row, every
// row starting with a th a header column (both: the side with more th's). Its cells' pictures kept
// (richTextOf `pictures`).
function tableBlock(node) {
  const rows = [...node.querySelectorAll("tr")].filter((row) => row.closest("table") === node);
  let headerRow = false;
  let headerColumn = false;
  if (rows.length) {
    const firstCells = rows[0].querySelectorAll("td, th");
    const firstTh = rows[0].querySelectorAll("th");
    headerRow = firstCells.length > 0 && firstTh.length === firstCells.length;
    const startsWithTh = (row) => tagOf(row.querySelector("td, th")) === "th";
    headerColumn = rows.every(startsWithTh);
    if (headerRow && headerColumn && !(tagOf(rows[0].querySelector("td, th")) === "th")) {
      if (firstTh.length >= rows.filter(startsWithTh).length) headerColumn = false;
      else headerRow = false;
    }
  }
  const grid = rows.map(() => []);
  const taken = rows.map(() => []);
  rows.forEach((row, r) => {
    let c = 0;
    for (const cell of [...row.querySelectorAll("td, th")].filter((x) => x.closest("tr") === row)) {
      while (taken[r][c]) c++;
      const rowSpan = int(cell.getAttribute("rowspan"), 1);
      const colSpan = int(cell.getAttribute("colspan"), 1);
      grid[r][c] = richTextOf(cell, { stripSurroundingWhitespace: true, preserveLineBreaks: true, pictures: true });
      taken[r][c] = true;
      for (let dr = 0; dr < rowSpan && r + dr < rows.length; dr++) {
        for (let dc = 0; dc < colSpan; dc++) {
          if (dr === 0 && dc === 0) continue;
          grid[r + dr][c + dc] = [];
          taken[r + dr][c + dc] = true;
        }
      }
      c += colSpan;
    }
  });
  const width = grid.reduce((max, row) => Math.max(max, row.length), 0);
  const data = grid.filter((row) => row.length).map((row) => Array.from({ length: width }, (_, i) => row[i] ?? []));
  if (!data.length || !width) return null; // a table only without a single cell
  const columns = Array.from({ length: width }, (_, i) => `c${i}`);
  const props = { table_block_column_order: columns, table_block_column_format: {}, table_block_column_header: headerRow, table_block_row_header: headerColumn };
  return spec("table", [], props, data.map((row) => spec("table_row", [], { cells: Object.fromEntries(row.map((t, i) => [columns[i], t]).filter(([, t]) => t.length)) })));
}

function columnsBlock(node) {
  const columns = [...node.children].filter((child) => child.hasAttribute(ATTR.column)).slice(0, 8).map((column) => {
    const ratio = parseFloat(column.getAttribute(ATTR.column));
    return spec("column", [], !Number.isNaN(ratio) && ratio > 0 && ratio <= 1 ? { ratio } : {}, blocksOf([...column.children]));
  });
  return spec("column_list", [], {}, columns);
}

// A list item: the first node (not a picture, video or audio) and inline nodes its text, the
// rest its blocks; pictures and the like in its text its blocks too.
function listItem(node) {
  const doc = node.ownerDocument;
  let itemColor;
  const highlighted = node.closest(`[${ATTR.highlight}]`);
  if (highlighted && (highlighted === node || highlighted === node.parentElement || highlighted === node.parentElement?.parentElement)) {
    itemColor = color(highlighted.getAttribute(ATTR.highlight) ?? "");
    if (itemColor) highlighted.removeAttribute(ATTR.highlight);
  }
  const title = doc.createElement("span");
  const rest = [];
  [...node.childNodes].forEach((child, i) => {
    if ((isElement(child, "a") && child.hasAttribute("data-confluence-web-image")) || (i === 0 && isElement(child, "a") && child.hasAttribute(ATTR.file))) rest.push(child);
    else if ((i === 0 && !isElement(child, "img", "video", "audio")) || isInline(child)) {
      title.appendChild(child);
      if (child.nodeType === 1) rest.push(...child.querySelectorAll(MEDIA().join(",")));
    } else rest.push(child);
  });
  const children = blocksOf(rest);
  const checked = TODO_CHECKED.test(title.textContent ?? "");
  const todo = checked || TODO_EMPTY.test(title.textContent ?? "");
  const type = todo ? "to_do" : isElement(node.parentNode, "ol") ? "numbered_list" : "bulleted_list";
  const props = {};
  if (todo) props.checked = checked;
  if (itemColor) props.block_color = itemColor;
  if (type === "numbered_list") {
    const number = itemNumber(node);
    if (number !== null) props.number = number;
  }
  return spec(type, richTextOf(title, { stripText: true, stripSurroundingWhitespace: true }), props, children);
}

// A numbered item's number where its list says where it starts, <ol start="5"> (a list copied from the
// middle of another, Word's numbered from 5): to-blocks.mjs starts the list at its first item's. Without a
// start, none (the list starts at 1). The numbers of a list's items are counted once, in one pass.
const ITEM_NUMBERS = new WeakMap();
function itemNumber(item) {
  const list = item.parentNode;
  if (!isElement(list, "ol") || !/^\d{1,9}$/.test(list.getAttribute("start") ?? "")) return null;
  let numbers = ITEM_NUMBERS.get(list);
  if (!numbers) {
    numbers = new Map();
    let next = Number(list.getAttribute("start"));
    for (const child of list.children) if (isElement(child, "li")) numbers.set(child, next++);
    ITEM_NUMBERS.set(list, numbers);
  }
  return numbers.get(item) ?? null;
}

// The kit's flowchart, a report_flow of report_step specs (to-blocks.mjs makes them
// a flowchart of nodes), its direction and first number. A step's icon (an emoji: an icon of a set
// or a picture is the report's own) its icon; its own words before its first block (the short form,
// <li>收集数据<p>…</p></li>) its title, its blocks its content (a title written as the node form,
// <p><strong>…</strong></p>, among them, first); its color (the kit's classes) and direction its
// own. Never list items: an item's paragraphs would be lines of its text, its title and content one.
function flowchartBlock(node) {
  const doc = node.ownerDocument;
  const steps = [...node.children].filter((child) => isElement(child, "li")).map((li) => {
    const icon = [...li.children].find((child) => child.classList.contains("doc-icon")) ?? null;
    const emoji = icon && !icon.hasAttribute("data-icon") ? (icon.querySelector("img")?.getAttribute("alt") ?? icon.textContent ?? "").trim() : "";
    const words = doc.createElement("span");
    const rest = [];
    for (const child of [...li.childNodes]) {
      if (child === icon) continue;
      if (rest.length === 0 && isInline(child)) words.appendChild(child);
      else rest.push(child);
    }
    const colors = [...li.classList].filter((name) => KIT_COLOR.test(name));
    // Its color is the node's, not a mark of its words (markColors read it off its class and style).
    li.removeAttribute(ATTR.highlight);
    li.removeAttribute(ATTR.backgroundHighlight);
    const direction = li.getAttribute("data-direction");
    const props = { ...(emoji ? { icon: emoji } : {}), ...(colors.length ? { colors } : {}), ...(direction ? { direction } : {}) };
    return spec("report_step", richTextOf(words, { stripText: true, stripSurroundingWhitespace: true }), props, blocksOf(rest));
  });
  const direction = node.getAttribute("data-direction");
  const start = node.getAttribute("start");
  return spec("report_flow", [], { ...(direction ? { direction } : {}), ...(start ? { start } : {}) }, steps);
}

function imageBlock(node) {
  const props = { source: node.getAttribute("src") };
  const width = node.width || int(node.getAttribute("width"), 0);
  if (width) props.block_width = Math.min(width, 700);
  const figcaption = node.closest("figure")?.querySelector("figcaption");
  const dataCaption = node.getAttribute("data-caption");
  if (dataCaption) props.caption = [[clean(dataCaption)]];
  else if (figcaption) {
    const t = richTextOf(figcaption, { stripText: true, stripSurroundingWhitespace: true });
    if (t.length) props.caption = t;
    figcaption.parentNode?.removeChild(figcaption);
  }
  return spec("image", [], props);
}

function fileBlock(node) {
  const source = node.getAttribute(ATTR.file) ?? "";
  let name = node.getAttribute(ATTR.fileAlias) ?? "";
  if (!name && source.lastIndexOf("/") >= 0) name = source.slice(source.lastIndexOf("/") + 1);
  return spec("file", name ? [[name]] : [], { source, ...(name ? { title: name } : {}) });
}

function blockOf(node) {
  if (!isElement(node)) return [];
  const tag = tagOf(node);
  if (tag === "div" && node.getAttribute("class") === "page-comments") return [];
  if (tag === "hr") return [spec("divider")];
  if (tag[0] === "h") return [text(node, heading(tag), { stripText: true, stripSurroundingWhitespace: true }), ...extras(node)];
  if (tag === "pre" || tag === "code" || (tag === "div" && node.className === SOURCE_CODE) || node.hasAttribute(ATTR.code)) return [codeBlock(node), ...extras(node)];
  if (node.hasAttribute(ATTR.callout)) return [calloutBlock(node)];
  if (node.hasAttribute(BOX)) return [spec("box", [], {}, blocksOf([...node.children]))]; // an AI answer's card (cards.mjs)
  if (tag === "blockquote") return [quoteBlock(node)];
  if (tag === "details") return [detailsBlock(node)];
  if (node.hasAttribute(ATTR.tabContainer)) return [tabsBlock(node)];
  if (tag === "table") {
    const table = tableBlock(node);
    return table ? [table] : [];
  }
  if (tag === "div" && node.hasAttribute(ATTR.columnList)) return [columnsBlock(node)];
  if (tag === "nav" && node.hasAttribute(ATTR.toc)) return extras(node); // a table of contents: no such block
  if (isFlowchart(node)) return [flowchartBlock(node)];
  if (tag === "ul" || tag === "ol") return blocksOf([...node.children]);
  if (tag === "div" && node.hasAttribute(ATTR.highlight) && node.children.length === 1 && isElement(node.children[0], "ul", "ol")) return blockOf(node.children[0]);
  const content = node.textContent ?? "";
  if (tag === "li" || TODO_CHECKED.test(content) || TODO_EMPTY.test(content) || BULLET_TEXT.test(content)) return [listItem(node)];
  if (tag === "img") return node.getAttribute("src") ? [imageBlock(node)] : [];
  if (tag === "a" && node.getAttribute(ATTR.linkPreview)) return [];
  if (tag === "a" && node.getAttribute(ATTR.embed)) {
    const href = node.getAttribute("href");
    return href ? [mediaBlock(href)] : [];
  }
  if (tag === "a" && node.getAttribute(ATTR.file)) return [fileBlock(node)];
  if (tag === "a" && node.childNodes.length === 0 && node.hasAttribute("download") && node.getAttribute("href")) return [mediaBlock(node.getAttribute("href"))];
  if (tag === "video" || tag === "audio") {
    const source = node.querySelector("source")?.getAttribute("src");
    if (source) return [mediaBlock(source)];
  }
  if (tag === "iframe") {
    const source = node.getAttribute("src");
    if (source) {
      const height = int(node.getAttribute("height"), 0);
      const width = int(node.getAttribute("width"), 0);
      return [spec("embed", [], { source, ...(width ? { block_width: width } : {}), ...(height ? { block_height: height } : {}), block_page_width: !(width || height), block_preserve_scale: true })];
    }
  }
  if (tag === "p" && node.getAttribute("confluenceNewLine")) return [text(node, "text", { stripText: true, stripSurroundingWhitespace: true })];
  if (node.hasAttribute(ATTR.equation)) {
    const tex = equationOf(node) ?? codeText(node);
    return [spec("equation", tex ? [[tex]] : [])];
  }
  if (tag === "figure" && node.hasAttribute(ATTR.image)) {
    const img = node.querySelector("img");
    if (img) return blockOf(img);
  }
  return [...(/^\s*$/.test(content) ? [] : [text(node, "text", { stripSurroundingWhitespace: true })]), ...extras(node)];
}

const blocksOf = (nodes) => nodes.flatMap(blockOf);

/**
 * For another program's cells pasted into a table's (page/clipboard/ cellsOf): the HTML's table,
 * when it holds one and no words outside it, as rows of rich text, its cells' as tableBlock reads
 * them (spans spread into empty cells, pictures kept); a table of one column stays one (normalizing
 * would make its cells blocks with dividers between them). Null for anything else.
 */
export function tableRows(root, options = {}) {
  const tables = [...root.querySelectorAll("table")].filter((table) => !table.parentElement?.closest("table"));
  const outside = (n) => (n.nodeType === 3 ? n.data.trim() !== "" : n.nodeType === 1 && tagOf(n) !== "table" && !REMOVED.has(tagOf(n)) && [...n.childNodes].some(outside));
  if (tables.length !== 1 || [...root.childNodes].some(outside)) return null;
  tables[0].classList.add("simple-table"); // kept a table (firstPass)
  normalizeHTML(root, { ...options, inline: false });
  const table = root.querySelector("table");
  const block = table ? tableBlock(table) : null;
  return block ? block.children.map((row) => block.props.table_block_column_order.map((column) => row.props.cells[column] ?? [])) : null;
}

// ---------- entry points ----------

/** The HTML's blocks; with `cards` (a paste's), an AI answer's cards first (cards.mjs). */
export function htmlToBlocks(root, { cards = false, ...options } = {}) {
  if (cards) markCards(root);
  normalizeHTML(root, { ...options, inline: false });
  return blocksOf([...root.children]);
}

/** The HTML as one rich text. */
export function htmlToRichText(root, { stripText = false, stripSurroundingWhitespace = false, ...options } = {}) {
  normalizeHTML(root, { ...options, inline: true });
  return richTextOf(root, { stripText, stripSurroundingWhitespace });
}

const PLAIN_TAGS = new Set(["span", "div", "p"]);
/**
 * Whether the HTML has any element but span / div / p, or code, columns, colors, formulas;
 * with `cards`, an AI answer's cards (cards.mjs) too.
 */
export function containsRichFormatting(root, { cards = false, ...options } = {}) {
  if (cards) markCards(root);
  normalizeHTML(root, { ...options, inline: false });
  return (function rich(el) {
    const tag = tagOf(el);
    if (!PLAIN_TAGS.has(tag) || (tag === "div" && (el.className === SOURCE_CODE || el.hasAttribute(ATTR.columnList) || el.hasAttribute(BOX))) || el.hasAttribute(ATTR.highlight) || el.hasAttribute(ATTR.backgroundHighlight)) return true;
    if (el.hasAttribute(ATTR.equation) || el.hasAttribute(ATTR.inlineEquation)) return true; // a formula takes the HTML
    return [...el.childNodes].some((child) => child.nodeType === 1 && rich(child));
  })(root);
}

// The HTML cleaned before it goes in a div, as DOMPurify's defaults clean it: only the body's
// content; iframe / noscript / script and the like go with their content; embed / object / link /
// meta / custom elements (google-sheets-html-origin…) go, their content stays; on* attributes go;
// href / src that are no safe address (javascript: …) go (data: only for pictures, audio and video).
const DROP = "script, iframe, noscript, noembed, noframes, plaintext, xmp, frame, frameset";
const UNWRAP = new Set(["embed", "object", "link", "meta", "base", "param", "applet"]);
const SAFE_URI = /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i; // DOMPurify IS_ALLOWED_URI
const DATA_URI_TAGS = new Set(["img", "audio", "video", "source", "track"]);
function sanitize(root) {
  for (const el of root.querySelectorAll(DROP)) el.remove();
  for (const el of [...root.querySelectorAll("*")]) {
    const tag = tagOf(el);
    if (UNWRAP.has(tag) || tag.includes("-")) {
      el.replaceWith(...el.childNodes);
      continue;
    }
    for (const a of [...el.attributes]) {
      const name = a.name.toLowerCase();
      if (name.startsWith("on")) el.removeAttribute(a.name);
      else if (["href", "src", "xlink:href", "action", "formaction"].includes(name)) {
        const value = a.value.replace(/[\x00-\x20\s]/g, "");
        if (!SAFE_URI.test(value) && !(/^data:/i.test(value) && DATA_URI_TAGS.has(tag) && name === "src")) el.removeAttribute(a.name);
      }
    }
  }
}

/**
 * The clipboard's HTML in a document of its own (scripts do not run, pictures do not load), cleaned,
 * moved into a div, which is returned. Relative links resolve against `base` (the page's address).
 * A new copy each call (normalizing changes it).
 */
export function parseClipboardHTML(html, { base = globalThis.location?.href } = {}) {
  const doc = new globalThis.DOMParser().parseFromString(html, "text/html");
  if (base) {
    const element = doc.createElement("base");
    element.href = base;
    doc.head.prepend(element);
  }
  newDomNames(doc.body); // a page of the kit's old names (report-*, data-report-*: shared/old-names.mjs) read as its new ones
  convertRenderedMath(doc.body); // before cleaning: MathJax 2's TeX is in scripts
  sanitize(doc.body);
  const div = doc.createElement("div");
  div.append(...doc.body.childNodes);
  doc.body.append(div);
  return div;
}
