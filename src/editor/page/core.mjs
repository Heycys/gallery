import { localPath } from "../../shared/workspace-address.mjs";
import { escapeAttribute, escapeText, escapeTyped, unescapeText } from "../../shared/escape.mjs";
import { formatRange, isInkClass, isUnderlineClass, markValue } from "./marks.mjs";
import { ZWSP, inlineItems, spaceAround } from "../../shared/inline-spacing.mjs";
import { ATTRIBUTES, BLOCK_TYPES, HOLDS_ONE, HOSTS, HOST_NAMES, PART_SELECTOR, REMOVED_EMPTY, SIZES, TEXT_BLOCKS, TOGGLES, attributeValue, blockTypeOf, capsFor, firstBlockOf, leadOf, removedFromAnywhere, sizeValue, textTypeOf } from "../components/registry.mjs";
import { isNoteTab } from "../components/paragraph/index.mjs";
import { DIALOG_TRIGGER, cardNamed } from "../components/dialog/index.mjs";
import { COPY_KEYS } from "../components/figure/index.mjs";
import { panelOf } from "../components/sheets/index.mjs";
import { gridOf, tableChange } from "../components/table/grid.mjs";
import { HELD_TAGS, heldListType, listType } from "../components/list/index.mjs";
import { isFlowchart, isStep } from "../components/flowchart/index.mjs";
import { markEmpty } from "../components/placeholder.mjs";
import { carry } from "../components/align.mjs";
import { unread } from "./tex.mjs";
import { MENTION, MENTION_ICON, MENTION_PAGE } from "../../shared/components/mention.mjs";
import { FLOW_BLOCKS } from "../../shared/components/index.mjs";
import { giveLine } from "../../shared/components/list.mjs";
import { isFileLink } from "../../shared/page-address.mjs";
import { ownInline } from "./own.mjs";
import { pageOfUnit } from "./page-objects.mjs";
import { t } from "../../shared/i18n/index.mjs";

// Browser core of in-place text editing (DOM only; tested with jsdom).
// The editing DOM of a block is rebuilt from the block's source, never from the
// component-enhanced runtime DOM. Inline formulas stay rendered as non-editable chips and are
// written back as their exact source text. Markers are data-ge-* attributes, so a block can be
// restored from an innerHTML snapshot (undo/redo) without losing them; they are never saved.

// Atoms: inline formulas, and links shown as their page's icon and title (图标视图: links/views.mjs),
// and inline elements of the report's own (own.mjs: a badge, a citation), kept whole as the file
// writes them (data-ge-own: none of a formula's looks).
const FORMULA = ".doc-math-inline";
const ATOM_SELECTOR = `${FORMULA}, .${MENTION}`;
const ATOM_SOURCE = new Map(); // data-ge-atom value -> its source (a formula's delimiters and escapes included)
const ATOM_PREFIX = Math.random().toString(36).slice(2, 7); // keys of another page never collide with this page's
let atomCount = 0;
const TAGS = { STRONG: "strong", B: "strong", EM: "em", I: "em", U: "u", S: "s", STRIKE: "s", DEL: "s", CODE: "code", A: "a", BR: "br", SUP: "sup", SUB: "sub" };
// (and data-rs-*, their name before 2026-10-28: a file may keep one an older page left in it)
const MARKER = /^(contenteditable|data-ge-|data-rs-)/;
const WRAPPERS = new Set(["UL", "OL", "BLOCKQUOTE"]);

// An inline element of the report's own, as the scanner judges it (source/blocks.mjs): its
// attributes as the file writes them (not the page's data-ge-* markers).
const isOwnAtom =(node) => ownInline(node.localName, [...node.attributes].filter(({ name }) => !MARKER.test(name)), node.textContent.trim() !== "");

// A block's atoms in `root` (its source parsed), in the order of the file, as the scanner lists
// them (source/blocks.mjs inlineMode): the outermost formulas, links shown with their icon and inline
// elements of the report's own; `all`, every element (the text of an inline element of the report's own).
function atomsIn(root, all = false) {
  const atom = (node) => all || node.matches(ATOM_SELECTOR) || isOwnAtom(node);
  const inAtom = (node) => { for (let at = node.parentElement; at; at = at.parentElement) if (atom(at)) return true; return false; };
  return [...root.querySelectorAll("*")].filter((node) => atom(node) && !inAtom(node));
}

/**
 * What prepareBlock makes editable or not of a block, set ahead of it (editor.mjs enter: every block
 * first, then every block rebuilt): the host, the lists and blocks an item holds (not its text), the
 * formulas the kit drew in it. Chrome recalculates the page's style and lays it out at once whenever an
 * element's contenteditable changes; once blocks have been rebuilt (their content put in again, not
 * laid out yet) that is most of the page each time, a report of 800 blocks taking 12s to open. Set
 * while the page is as it was served, each costs nothing, and content put into a host already
 * editable forces nothing.
 */
export function editableAhead(element, { kind = "flow" } = {}) {
  const lists = nestedBlocks(element);
  lists.forEach((list) => list.setAttribute("contenteditable", "false"));
  for (const atom of element.querySelectorAll(ATOM_SELECTOR)) if (!lists.some((list) => list.contains(atom))) atom.setAttribute("contenteditable", "false");
  if (!HOSTS[kind]?.wrapped) element.setAttribute("contenteditable", "true");
}

// contenteditable set only where it changes (setting it again to what it is costs as a change: editableAhead).
const editable = (element, value) => { if (element.getAttribute("contenteditable") !== value) element.setAttribute("contenteditable", value); };

/** A text block the reader may not write in from now on, and why (`reason`, which hints/ says on a hover). */
export function lockHost(host, reason) {
  editable(host, "false");
  host.setAttribute("data-ge-lock", reason);
}

/**
 * Rebuild one [data-ge-block] element for editing from its source. Returns its baseline
 * serialization. A host whose element must keep its own behaviour (`wrapped`: a Sheet tab, a button
 * that must keep switching Sheets) gets its text in a span of its own, which becomes the block;
 * the editor makes that span contenteditable only while the tab is renamed.
 */
export function prepareBlock(element, { inner, atoms, kind = "flow", caps = [] }) {
  element.setAttribute("data-ge-kind", kind);
  element.setAttribute("data-ge-caps", caps.join(" "));
  const template = element.ownerDocument.createElement("template");
  template.innerHTML = inner;
  template.content.querySelectorAll("*").forEach((node) => node.setAttribute("data-ge-src", ""));
  HOSTS[kind]?.pictures?.show(template.content); // a cell's pictures shown where the server serves them
  const sourceAtoms = atomsIn(template.content, kind === "text" && caps.includes("plain"));
  const drawnAtoms = sourceAtoms.filter((atom) => atom.matches(ATOM_SELECTOR)); // a formula as the kit drew it
  // The blocks a list item holds are blocks of their own: only its text before them is rebuilt.
  const lists = nestedBlocks(element);
  const rendered = [...element.querySelectorAll(ATOM_SELECTOR)].filter((atom) => !lists.some((list) => list.contains(atom)));
  sourceAtoms.forEach((atom, index) => {
    const drawn = drawnAtoms.indexOf(atom);
    const chip = drawn >= 0 && rendered.length === drawnAtoms.length ? rendered[drawn] : atom; // mismatch: show the raw TeX
    if (drawn < 0) chip.setAttribute("data-ge-own", ""); // the report's own: as the file has it
    // The breaks the kit put between the boxes of a formula it held with the marks after it go with
    // the span that held them (runtime/spacing.js: the block's text is rebuilt from the file).
    chip.querySelectorAll(".doc-math-break").forEach((gap) => gap.remove());
    const key = `${ATOM_PREFIX}-${atomCount++}`;
    editable(chip, "false");
    chip.setAttribute("data-ge-atom", key);
    const source = inner.slice(atoms[index][0], atoms[index][1]);
    ATOM_SOURCE.set(key, source);
    // One left empty is its gray chip (as served already, components/placeholder.mjs).
    const empty = emptyKind(source);
    if (empty) markEmpty(chip, empty);
    else if (drawn >= 0 && chip.matches(FORMULA) && unread(chip, formulaParts(chip)?.tex ?? "")) markEmpty(chip, "invalid");
    atom.replaceWith(chip);
  });
  if (lists.length > 0) {
    ownNodes(element).forEach((node) => node.remove());
    lists[0].before(template.content);
    // Nothing after the blocks it holds (the source's line breaks), where a caret could put text that is not the item's.
    while (lists.at(-1).nextSibling) lists.at(-1).nextSibling.remove();
    lists.forEach((list) => editable(list, "false"));
    keepLine(element);
    element.setAttribute("data-ge-nested", ""); // it stays an item (convert.mjs)
  } else element.replaceChildren(template.content);
  // Inline code and formulas stand a space apart from the words beside them, where the report's
  // text has none (the rule the kit shows it by, shared/inline-spacing.mjs); an empty formula and a
  // link shown with its icon do not. What the commits compare with (the baseline returned) has the
  // spaces, and what they send as the block's source does not: the file takes them only with the
  // reader's own edit of the block.
  const wrapped = Boolean(HOSTS[kind]?.wrapped);
  if (!wrapped) {
    editable(element, "true"); // the edge of the line the rule looks along (as shownAs, on a detached element, finds it)
    for (const inline of inlineItems(element)) if (inline !== element && !lists.some((list) => list.contains(inline))) spaceAround(inline);
  }
  if (wrapped) {
    const name = element.ownerDocument.createElement("span");
    name.append(...element.childNodes);
    element.append(name);
    for (const marker of ["data-ge-block", "data-ge-kind", "data-ge-caps"]) {
      name.setAttribute(marker, element.getAttribute(marker));
      element.removeAttribute(marker);
    }
    return serializeInner(name);
  }
  return serializeInner(element);
}

/**
 * The html the page compares a block with (its baseline) when the file has `inner` for it (its
 * formulas at `atoms`): what prepareBlock makes of that text as the page opens, worked out on an
 * element of its own, so that `host` is not touched. Null when the formulas are not given.
 */
export function shownAs(host, inner, atoms = []) {
  const template = host.ownerDocument.createElement("template");
  template.innerHTML = inner;
  const kind = host.getAttribute("data-ge-kind") ?? "flow";
  const caps = (host.getAttribute("data-ge-caps") ?? "").split(" ");
  if (atomsIn(template.content, kind === "text" && caps.includes("plain")).length !== atoms.length) return null;
  return prepareBlock(host.ownerDocument.createElement(host.localName), { inner, atoms, kind, caps });
}

/**
 * A new inline formula (formula/): a chip showing `rendered` (KaTeX's markup of `tex`), written
 * back as the kit's `<span class="doc-math-inline">\(tex\)</span>`; `parts` (formulaParts of
 * the formula it replaces): its own tags kept, with whatever attributes the file gave them.
 */
export function newFormula(doc, tex, rendered, parts = null) {
  const chip = doc.createElement("span");
  chip.className = "doc-math-inline";
  chip.innerHTML = rendered;
  const key = `${ATOM_PREFIX}-${atomCount++}`;
  chip.setAttribute("contenteditable", "false");
  chip.setAttribute("data-ge-atom", key);
  ATOM_SOURCE.set(key, `${parts?.open ?? '<span class="doc-math-inline">'}\\(${spaced(tex)}\\)${parts?.close ?? "</span>"}`);
  if (!tex.trim()) markEmpty(chip, "formula");
  return chip;
}

/**
 * A link left empty (the "/" menu's 链接 given no address): a gray chip, 链接 (data-ge-empty="link",
 * components/placeholder.mjs), written as an empty <a class="doc-link-mention"></a>, which the kit
 * shows to no reader; a click on it asks for its address (links/). With `page` a page block left
 * empty, 页面, written with data-doc-page. An empty formula is newFormula's of no TeX (\(\)). Each
 * stays as an empty block does, a whole as a character is (its icon and name are in it, so the browser
 * keeps a caret beside it and deletes it as a formula).
 */
export function newEmptyLink(doc, page = false) {
  const chip = doc.createElement("a");
  chip.className = MENTION;
  const key = `${ATOM_PREFIX}-${atomCount++}`;
  chip.setAttribute("contenteditable", "false");
  chip.setAttribute("data-ge-atom", key);
  markEmpty(chip, page ? "page" : "link");
  ATOM_SOURCE.set(key, page ? `<a class="${MENTION}" ${MENTION_PAGE}></a>` : `<a class="${MENTION}"></a>`);
  return chip;
}

const EMPTY_FORMULA = /^<span\b[^>]*>\s*\\\(\s*\\\)\s*<\/span>$/;
const EMPTY_LINK = new RegExp(`^<a class="${MENTION}">\\s*</a>$`);
const EMPTY_PAGE = new RegExp(`^<a\\b[^>]*\\b${MENTION_PAGE}\\b[^>]*>\\s*</a>$`);

/** What an atom's source leaves empty: "formula" (\(\)), "link" (an empty link shown with its icon), "page" (an empty page block), or null. */
export const emptyKind = (source) => (EMPTY_FORMULA.test(source) ? "formula" : EMPTY_LINK.test(source) ? "link" : EMPTY_PAGE.test(source) ? "page" : null);

/**
 * A chip standing for `source` (written back as it is): a display formula's KaTeX in its block
 * (components/math/page.mjs), `nodes` its content. Like an inline formula's, its source lives in
 * the chip's key, so undo, which puts the chip back, puts the source back too.
 */
export function newAtom(doc, source, nodes, tag = "span") {
  const chip = doc.createElement(tag);
  chip.append(...nodes);
  const key = `${ATOM_PREFIX}-${atomCount++}`;
  chip.setAttribute("contenteditable", "false");
  chip.setAttribute("data-ge-atom", key);
  ATOM_SOURCE.set(key, source);
  return chip;
}

/** Whether `html` holds a chip of this page (data-ge-atom: a formula, a link shown with its icon, one left empty). */
export function holdsAtoms(doc, html) {
  const template = doc.createElement("template");
  template.innerHTML = html;
  return [...template.content.querySelectorAll("[data-ge-atom]")].some((node) => ATOM_SOURCE.has(node.getAttribute("data-ge-atom")));
}

/** What a chip is written back as (its source), or null for no chip of this page. */
export const atomSource = (chip) => ATOM_SOURCE.get(chip?.getAttribute?.("data-ge-atom")) ?? null;
/** The sources of the chips in `roots`, by key: what another page needs to write them back (sync-state.mjs pack). */
export function atomSources(roots) {
  const sources = {};
  for (const root of roots) {
    for (const chip of root.querySelectorAll("[data-ge-atom]")) {
      const key = chip.getAttribute("data-ge-atom");
      if (ATOM_SOURCE.has(key)) sources[key] = ATOM_SOURCE.get(key);
    }
  }
  return sources;
}
/** Chips of another page (atomSources) known to this one, so that a text holding them writes them back; its keys never collide with this page's. */
export function knowAtoms(sources) {
  for (const [key, source] of Object.entries(sources ?? {})) {
    if (typeof source === "string" && !ATOM_SOURCE.has(key)) ATOM_SOURCE.set(key, source);
  }
}

/** The words the file gives a chip, which the page may show otherwise (a page block's title now), or null for no chip of this page. */
export function sourceWords(chip) {
  const source = atomSource(chip);
  if (source === null) return null;
  const template = chip.ownerDocument.createElement("template");
  template.innerHTML = source;
  return template.content.textContent;
}

/**
 * A new link shown as its page's icon and title (图标视图, links/views.mjs), or a page block: a chip
 * of the page (`assetUrl(path)`: where the preview serves the icon, a file of the report's folder),
 * written back as shared/components/mention.mjs says, its icon an empty span (the kit's globe or page)
 * when it has none. `drawn`: the image shown for a page block's icon, which no file holds.
 */
export function newMention(doc, { href, title, icon = null, drawn = null }, assetUrl = (path) => path) {
  const chip = doc.createElement("a");
  chip.className = MENTION;
  chip.setAttribute("href", href);
  if (icon || drawn) {
    const img = doc.createElement("img");
    img.className = MENTION_ICON;
    img.src = drawn ?? assetUrl(icon);
    img.alt = "";
    img.draggable = false;
    if (icon) img.setAttribute("data-ge-src", icon);
    chip.append(img);
  } else {
    const globe = doc.createElement("span");
    globe.className = MENTION_ICON;
    chip.append(globe);
  }
  chip.append(doc.createTextNode(title));
  const key = `${ATOM_PREFIX}-${atomCount++}`;
  chip.setAttribute("contenteditable", "false");
  chip.setAttribute("data-ge-atom", key);
  const picture = icon ? `<img class="${MENTION_ICON}" src="${escapeAttribute(icon)}" alt="">` : `<span class="${MENTION_ICON}"></span>`;
  ATOM_SOURCE.set(key, `<a class="${MENTION}" href="${escapeAttribute(href)}">${picture}${spaced(title)}</a>`);
  return chip;
}

/**
 * What a link shown with its icon is: { href, title, icon } (its icon a file of the report's folder,
 * or null), from the chip on the page, or from one pasted (its icon where the preview served it,
 * when it was: `slug`, the report's folder it was served from; `drawn`: the image a page block shows,
 * by the icon route).
 */
export function mentionOf(chip) {
  const img = chip.querySelector(`img.${MENTION_ICON}`);
  const src = img?.getAttribute("data-ge-src") ?? img?.getAttribute("src") ?? "";
  const served = /^\/__gallery\/edit\/asset\/([^/]+)\/(assets\/[^/?#]+)(?:\?v=[0-9a-f]*)?$/.exec(localPath(src)); // named by its stamp (render/media-ref.mjs servedUrl)
  return {
    href: chip.getAttribute("href") ?? "",
    title: chip.textContent.replace(/\s+/g, " ").trim(),
    icon: served ? served[2] : /^assets\/[^/]+$/.test(src) ? src : null,
    slug: served ? decodeURIComponent(served[1]) : null,
    drawn: localPath(src).startsWith("/__gallery/edit/icon?") ? src : null,
  };
}

/** The words the page shows for a link shown with its icon to `href`, which those of the file may be behind (a page block's title), or null for none on the page. */
export function shownWords(doc, href) {
  return [...doc.querySelectorAll(`main .${MENTION}`)].find((chip) => chip.getAttribute("href") === href)?.textContent ?? null;
}

/** Whether a node is a link shown with its icon (a chip of the page, or one pasted). */
export const isMention = (node) => node?.nodeType === 1 && node.matches(`a.${MENTION}`);

/**
 * An inline formula's source in parts (formula/): the tag that opens it, its TeX and the tag that
 * closes it; null when it is not written as \(…\) in one span (then the page leaves it alone).
 */
export function formulaParts(chip) {
  const source = ATOM_SOURCE.get(chip.getAttribute("data-ge-atom"));
  const match = source?.match(/^(<span\b[^>]*>)\s*\\\(([\s\S]*)\\\)\s*(<\/span>)$/);
  return match ? { open: match[1], tex: unescapeText(match[2]), close: match[3] } : null;
}

/**
 * Whether the page still shows the block's source text. Scripts fill some elements at runtime
 * (status lines, counters); rebuilding those from source would wipe what the script wrote, so the
 * editor leaves them alone. Formulas and decorative (aria-hidden) parts are not compared, nor
 * whitespace (the kit spaces inline code and formulas apart from the words beside them).
 */
export function matchesSource(element, inner) {
  // The blocks a list item holds are blocks of their own, not its text (a table cell's lists are its text).
  const text = (root, nested) => {
    const copy = root.cloneNode(true);
    if (nested) nestedBlocks(copy).forEach((node) => node.remove());
    copy.querySelectorAll(`${ATOM_SELECTOR}, [aria-hidden="true"]`).forEach((node) => node.remove());
    return copy.textContent.replace(/\s+/g, "");
  };
  const template = element.ownerDocument.createElement("template");
  template.innerHTML = inner;
  return text(element, element.tagName === "LI") === text(template.content, false);
}

export function serializeInner(element) {
  const inner = HOSTS[element.getAttribute?.("data-ge-kind")]?.inner;
  if (inner) return inner(element);
  // A kind of text block that holds pictures (a cell's: HOSTS `pictures`) writes them; any other none.
  const kind = element.getAttribute?.("data-ge-kind");
  return serializeNodes(ownNodes(element), listsAreText(kind), HOSTS[kind]?.pictures ?? null).replace(/<br>\s*$/, "");
}

// Whether a kind of text block's lists are its text: a table cell's (单元格里的列表: a list straight in
// it and its items, no deeper); any other block's are blocks of their own (serializeInner, strayIn).
const listsAreText = (kind) => kind === "cell";

// A list in a table cell, its items' inline content (a line break holding an empty item's caret left out).
function serializeList(list, pictures = null) {
  const tag = list.tagName.toLowerCase();
  const items = [...list.children].filter((item) => item.tagName === "LI").map((item) => `<li>${serializeNodes([...item.childNodes], false, pictures).replace(/<br>\s*$/, "")}</li>`);
  return items.length > 0 ? `<${tag}>${items.join("")}</${tag}>` : "";
}

// ---------- list items holding blocks ----------
// A list item's text comes first, the blocks it holds after it (its children): its nested lists
// (with items of their own) and any other block, a paragraph, an image, a code block…: <li>text<p>…</p><ul><li>…</li></ul></li> (components/list/ HELD_TAGS). The item's text
// block is only the text; the blocks it holds are never part of its content, its snapshots or its
// caret positions. A flowchart's step is an li too, but no list item: a node holding blocks and no
// text (components/flowchart/), which the lines and the items below never go through (parentItem,
// holderItem, previousLine and nextLine stop at it), as they never go through a highlight block.

const isList = (node) => node?.nodeType === 1 && (node.tagName === "UL" || node.tagName === "OL");
const isHeld = (node) => node?.nodeType === 1 && HELD_TAGS.has(node.localName);

/** The blocks a list item holds after its text, in order ([] for any other element). */
export const nestedBlocks = (element) => element?.tagName === "LI" ? [...element.children].filter(isHeld) : [];

/** The lists nested in a list item, in order ([] for any other element). */
export const nestedLists = (element) => nestedBlocks(element).filter(isList);

/** The list item holding a block (a list nested in it, a paragraph under it), or null; a flowchart's step holds blocks as a container does, no item. */
export const holderItem = (block) => (block?.parentElement?.tagName === "LI" && !isStep(block.parentElement) && isHeld(block) ? block.parentElement : null);

/** The child offset where an element's own content ends: before the first block a list item holds. */
export function textEnd(element) {
  const index = element.tagName === "LI" ? [...element.childNodes].findIndex(isHeld) : -1;
  return index < 0 ? element.childNodes.length : index;
}

const ownNodes = (element) => [...element.childNodes].slice(0, textEnd(element));

// ---------- structure no text block's words hold ----------
// A text block's words are text and inline markup alone (a table cell's lists too). Block structure
// in them (a list, an item, a paragraph, a division…) is none of the page's own steps' making: the
// browser's editing left an Enter or a deletion (a host without its marks), a step gone wrong. Neither
// is it written: serializeInner drops a list there and an item's blocks after its text that are no
// blocks of the page's (no unit, none made on the page), so such a block once wrote its words away,
// emptied in the file while the page still showed them (a paragraph holding an item holding a list:
// two markers on one line, its placeholder over them). So a block holding such structure is never
// split there (typing/ split, splitsAt) and never written (collectEdits: held back as a draft and
// flagged, the file keeping what it had), and the reader is told.
const STRUCTURE = "ul, ol, li, p, div, h1, h2, h3, h4, h5, h6, blockquote, table, pre, figure, details, section, aside, hr, dl, dt, dd, header, footer, article, nav, main";
// What stands in a block's words as a whole of its own (a formula, a link's icon, an element of the
// document's own), the editor's own UI, and the words an Agent took out shown in it: never its structure.
const WHOLE_IN_TEXT = "[data-ge-atom], [data-doc-dev], [data-ge-gone-words]";
const insideOf = (node, host, selector) => {
  for (let at = node; at && at !== host; at = at.parentElement) if (at.matches(selector)) return true;
  return false;
};
// A table cell's own list (单元格里的列表): a list straight in the cell, and its items; nothing deeper.
const cellList = (element, cell) => (isList(element) && element.parentElement === cell)
  || (element.tagName === "LI" && isList(element.parentElement) && element.parentElement.parentElement === cell);

/**
 * The first element of block structure in a text block's own words (its text before the blocks it
 * holds, for an item), or for an item a block after its text that holds words and is no block of the
 * page's: what the block's source cannot hold, or null.
 */
export function strayIn(host) {
  const kind = host.getAttribute("data-ge-kind");
  if (HOSTS[kind]?.inner) return null; // written by a rule of its own (a code block's text)
  for (const node of ownNodes(host)) {
    if (node.nodeType !== 1) continue;
    for (const element of [node, ...node.querySelectorAll(STRUCTURE)]) {
      if (!element.matches(STRUCTURE) || insideOf(element, host, WHOLE_IN_TEXT)) continue;
      if (listsAreText(kind) && cellList(element, host)) continue;
      return element;
    }
  }
  for (const block of nestedBlocks(host)) if (!block.matches(UNIT) && !block.hasAttribute("data-doc-dev") && block.textContent.trim() !== "") return block;
  return null;
}

/**
 * The text blocks of `root` holding such structure (strayIn), found from the structure itself: the
 * text block an element of it stands in (the nearest editable one around it), asked once a block. One
 * pass over the page's block elements; those standing in no text block (a page's lists, its
 * paragraphs) ask nothing.
 */
export function strayHosts(root) {
  const asked = new Map();
  for (const element of root.querySelectorAll(STRUCTURE)) {
    const host = element.parentElement?.closest('[contenteditable="true"]');
    if (!host || asked.has(host) || !isHost(host)) continue;
    asked.set(host, strayIn(host) !== null);
  }
  return [...asked].filter(([, stray]) => stray).map(([host]) => host);
}

/**
 * Whether `range` stands in `host`'s own words, where Enter may split it: both its ends in the host,
 * before the blocks an item holds, and in no block structure inside it (strayIn's), which a split
 * there would take along into the new block.
 */
export function splitsAt(host, range) {
  const own = (container, offset) => {
    if (!host.contains(container)) return false;
    if (container === host) return offset <= textEnd(host);
    let child = container;
    while (child.parentNode !== host) child = child.parentNode;
    if (nestedBlocks(host).includes(child)) return false;
    const start = container.nodeType === 1 ? container : container.parentElement;
    return !insideOf(start, host, STRUCTURE);
  };
  return own(range.startContainer, range.startOffset) && own(range.endContainer, range.endOffset);
}

/**
 * A block's own content as HTML (innerHTML, without the blocks a list item holds, nor the words an
 * Agent took out that the page shows in it: GONE_WORDS), what undo and redo record of it.
 */
export function ownHTML(element) {
  const shown = element.querySelector(GONE_WORDS);
  if (nestedBlocks(element).length === 0 && !shown) return element.innerHTML;
  const copy = element.ownerDocument.createElement("div");
  copy.append(...ownNodes(element).map((node) => node.cloneNode(true)));
  if (shown) copy.querySelectorAll(GONE_WORDS).forEach((node) => node.remove());
  return copy.innerHTML;
}

/** Replace a block's own content (the blocks a list item holds stay as they are). */
export function setOwnHTML(element, html) {
  const lists = nestedBlocks(element);
  if (lists.length === 0) {
    element.innerHTML = html;
    return;
  }
  const template = element.ownerDocument.createElement("template");
  template.innerHTML = html;
  ownNodes(element).forEach((node) => node.remove());
  lists[0].before(template.content);
  keepLine(element);
}

/**
 * An item with no text over the blocks it holds keeps a line of its own, its text line however
 * empty: a line break ahead of them, which Backspace leaves there too and its
 * text leaves out (serializeInner), so that a click on its marker or an arrow key puts the caret in it.
 * Which items, and the line break's class, are the kit's wherever it draws the page (keepsLine of
 * src/shared/components/list.mjs, src/render/kit/runtime/spacing.js): an item of a list whose markers
 * the kit draws in a flow, never one of a widget's list or a list with a class of its own; an export
 * of the view takes the line break off.
 */
export function keepLine(element) {
  giveLine(element, FLOW_BLOCKS); // none but an item of a list keeps one
}

/** The list item a nested item's list hangs from, or null for an item of a top-level list (one of a list in a flowchart's step among them: the step is no item). */
export const parentItem = (item) => item?.tagName === "LI" && item.parentElement?.parentElement?.tagName === "LI" && !isStep(item.parentElement.parentElement) ? item.parentElement.parentElement : null;

// Spaces are written as the page shows them. The non-breaking spaces a browser types to keep a
// space visible while it is edited (at the end of a text, before a mark, next to another space),
// with the spaces beside them, become one ordinary space: left in the file they would glue the
// words around them, and lines would break early. Runs of ordinary spaces (the source's own line
// indentation) stay as they are. Reports write no &nbsp; of their own; one in a text the reader
// edits becomes a space too.
const spaced = (text) => escapeTyped(text).replace(/ *\u00a0[ \u00a0]*/g, " ");

// The editor's own nodes in a text block (data-doc-dev: the words an Agent took out, which the page
// shows where they were, changes/) are no content: left out, the text on either side of one is
// written as one text, as it was before the node split it (a space either side of it the one space
// it was, never two).
function serializeNodes(nodes, lists = false, pictures = null) {
  let html = "";
  let text = null; // a text node's, not written yet: the text after an editor's node joins it
  let across = false; // an editor's node stands between it and what comes next
  for (const node of nodes) {
    if (node.nodeType === 1 && node.hasAttribute("data-doc-dev")) {
      across = text !== null;
      continue;
    }
    if (node.nodeType === 3 && node.data !== ZWSP) {
      if (text !== null && !across) html += spaced(text);
      text = text !== null && across ? text + node.data : node.data;
      across = false;
      continue;
    }
    if (text !== null) html += spaced(text);
    text = null;
    across = false;
    html += serializeNode(node, lists, pictures);
  }
  return text === null ? html : html + spaced(text);
}

// `pictures`: the host's (HOSTS `pictures`: write(element) its markup, "" for one of no file, null for no picture).
function serializeNode(node, lists = false, pictures = null) {
  // A text node holding nothing but a zero-width space keeps the caret after a mark the editor
  // made (markdown/, typing shortcuts); it is never content.
  if (node.nodeType === 3) return node.data === ZWSP ? "" : spaced(node.data);
  if (node.nodeType !== 1) return "";
  if (isList(node)) return lists ? serializeList(node, pictures) : "";
  const picture = pictures?.write(node) ?? null;
  if (picture !== null) return picture;
  const atom = node.getAttribute("data-ge-atom");
  if (atom !== null && ATOM_SOURCE.has(atom)) return ATOM_SOURCE.get(atom);
  // Elements from the source keep the author's tag and attributes; only elements the browser
  // created while editing are normalized (<b> -> <strong>). Text colors and highlights are spans
  // with the kit's classes only. Unknown wrappers such as <span style> or <font> are unwrapped
  // and their text kept.
  const fromSource = node.hasAttribute("data-ge-src") && node.tagName in TAGS;
  const tag = fromSource ? node.tagName.toLowerCase() : TAGS[node.tagName];
  const inner = serializeNodes([...node.childNodes], false, pictures);
  const ink = node.tagName === "SPAN" ? [...node.classList].filter(isInkClass) : [];
  if (ink.length > 0) return inner ? `<span class="${ink.join(" ")}">${inner}</span>` : "";
  // Small text's end part (its Tab: components/paragraph/page.mjs), at the line's right end.
  if (isNoteTab(node)) return inner ? `<span class="doc-tab">${inner}</span>` : "";
  if (!tag) return inner;
  if (tag === "br") return "<br>";
  if (!inner) return "";
  // Made on the page: a link's address (and a detail card's class), an underline's kit color and weight.
  const attributes = [...node.attributes].filter((attribute) =>
    fromSource ? !MARKER.test(attribute.name)
      : tag === "a" ? attribute.name === "href" || (attribute.name === "class" && attribute.value === DIALOG_TRIGGER)
      : tag === "u" && attribute.name === "class" && attribute.value.trim().split(/\s+/).every(isUnderlineClass));
  const attributeText = attributes.map((attribute) => ` ${attribute.name}="${escapeAttribute(attribute.value)}"`).join("");
  return `<${tag}${attributeText}>${inner}</${tag}>`;
}

/** An editable host: an original block or one created while editing. */
export function isHost(node) {
  return node?.nodeType === 1 && node.getAttribute("contenteditable") === "true"
    && (node.hasAttribute("data-ge-block") || node.hasAttribute("data-ge-new") || node.hasAttribute("data-ge-part"));
}

/** Capabilities: split, merge, remove, empty, plain, links (see src/editor/source/). */
export function can(element, cap) {
  return (element.getAttribute("data-ge-caps") ?? "").split(" ").includes(cap);
}

/**
 * Why a text block refuses an action ("split", "remove", "merge", "links", "format", "formula"), in
 * the reader's terms (what each kind of text block is called: HOST_NAMES).
 */
export function limitText(host, action) {
  const kind = host.getAttribute("data-ge-kind");
  if (kind === "flow" && !can(host, "remove")) {
    return t("页面其他地方引用了这一段（链接、无障碍关联或文档的脚本），不能删除，也不能并入上一段。");
  }
  if (kind === "text" && action === "remove") return t("这段文字可以清空，但不能单独删除；要删掉整块，点左侧的手柄后按 Delete。");
  const name = HOST_NAMES[kind] ?? t("这一段");
  if (action === "split") return can(host, "plain") ? t("{0}不能分段或换行。", name) : t("{0}不能分段；需要换行可以用 Shift+Enter。", name);
  if (action === "remove") return can(host, "empty") ? t("{0}不能删除，但可以清空。", name) : t("{0}不能清空或删除，只能改字。", name);
  if (action === "links") return t("{0}里不能加链接。", name);
  if (action === "format") return t("{0}不能设置格式。", name);
  if (action === "formula") return t("{0}不能放公式。", name);
  return t("{0}不能与相邻段落合并。", name);
}

/** No text and no formula (a trailing <br> or spaces do not count). */
export function isEmpty(element) {
  return serializeInner(element).replace(/&nbsp;/g, " ").trim() === "";
}

const siblingTag = (element) => element.tagName === "LI" ? "li" : "p";

/**
 * A text block made on the page: data-ge-new, with its type and unit kind, a text block of the flow
 * (every type's that is one: a callout's words, its own kind until 2026-11-07, are a paragraph of it
 * now). Inside a component it leaves the frame to the component, as `from` (the block it was split off) does.
 */
export function newHost(doc, type, from = null) {
  const spec = BLOCK_TYPES[type];
  const block = doc.createElement(spec.tag);
  if (spec.className) block.className = spec.className;
  block.setAttribute("contenteditable", "true");
  block.setAttribute("data-ge-new", "");
  block.setAttribute("data-ge-type", type);
  block.setAttribute("data-ge-unit-kind", spec.kind);
  block.setAttribute("data-ge-kind", "flow");
  block.setAttribute("data-ge-caps", capsFor("flow"));
  if (from?.hasAttribute("data-ge-framed")) block.setAttribute("data-ge-framed", "");
  return block;
}

/** A container made on the page (a list, a quote, a section): a box of its own that goes once empty. */
export function newContainer(doc, type) {
  const spec = BLOCK_TYPES[type];
  const box = doc.createElement(spec.tag);
  if (spec.className) box.className = spec.className;
  for (const [name, value] of [["data-ge-new", ""], ["data-ge-type", type], ["data-ge-unit-kind", spec.kind], ["data-ge-box", ""], ["data-ge-box-kind", spec.box], ["data-ge-pure", ""]]) {
    box.setAttribute(name, value);
  }
  if (spec.box === "list") box.setAttribute("contenteditable", "false"); // nested in an item, it is not the item's text
  return box;
}

/**
 * A new container of `type` for the blocks after the place where `container` (a list, a quote, a
 * panel) splits in two, as newContainer makes it, with what its type keeps of the whole (`onSplit`); a
 * numbered list's starts at 1 again.
 */
export function newTail(container, type) {
  const tail = newContainer(container.ownerDocument, type);
  BLOCK_TYPES[type].onSplit?.(container, tail);
  return tail;
}

// New blocks split off `from` are paragraphs, or list items in a list.
// A paragraph split off a paragraph or a heading keeps its alignment and indent (components/align.mjs carry).
const newBlock = (doc, tag, from) => (tag === "li" ? newHost(doc, "item", from) : carry(from, newHost(doc, "paragraph", from)));

/** A new, empty paragraph, as a split makes one outside a list (the page's title's Enter: typing/ enterBody). */
export const newParagraphHost = (doc) => newBlock(doc, "p", null);

// The element a text block made on the page is part of when it is not a block of its own: the
// summary of a new disclosure, a new code block (its code's pre, its title's block), the header of a
// new detail card.
const partOf = (host) => host.hasAttribute("data-ge-new") ? host.parentElement?.closest(PART_SELECTOR) ?? null : null;

function extractTail(element, range) {
  const tail = element.ownerDocument.createRange();
  tail.setStart(range.startContainer, range.startOffset);
  tail.setEnd(element, textEnd(element));
  return tail.extractContents();
}

/**
 * Enter: at the block start insert an empty block before it; otherwise move the content after
 * the caret into a new block (after a list item holding lists, the first item of its first list).
 * Returns the block that should receive the caret. The caller skips IME composition and checks
 * that the block may split. A box's first line (a flowchart node's title: firstLineOf) has nothing
 * before it: it always splits, what follows the caret (all of it at its start) a plain paragraph
 * below it, its bold taken off when the line was bold throughout (its title's <strong>: the second
 * half is a plain paragraph), the line left empty at its start (bold armed there again: format-bar/).
 * `carry` (the Enter key's, typing/): a list item holding blocks splits with its children moved:
 * the new item goes right after it in its list, and everything
 * the item held (its lists, the paragraphs and pictures under it) goes under the new item, which an
 * Enter at the end of its text leaves with no text of its own over them (keepLine). Without it (the
 * "/" menu's block below, insertBelow) the new item opens what the item holds, as before.
 */
export function splitBlock(element, range, { carry = false } = {}) {
  if (!range.collapsed) range.deleteContents();
  const first = isFirstLine(element);
  const head = element.ownerDocument.createRange();
  head.setStart(element, 0);
  head.setEnd(range.startContainer, range.startOffset);
  if (!first && head.toString().trim() === "" && !isEmpty(element)) {
    element.before(newBlock(element.ownerDocument, siblingTag(element), element));
    return element;
  }
  const held = carry && !first ? nestedBlocks(element) : []; // a list item's ([] for any other block)
  if (held.length > 0) {
    const next = newBlock(element.ownerDocument, siblingTag(element), element);
    next.append(extractTail(element, range));
    element.after(next);
    next.append(...held);
    keepLine(next);
    return next;
  }
  const bold = first && boldThroughout(element);
  const next = splitBelow(element, extractTail(element, range), bold);
  // An empty mark left at either end of the split (the title's <strong> the caret stood at an end of) holds no caret: gone.
  if (first) for (const node of [element, next]) if (isEmpty(node)) node.replaceChildren();
  return next;
}

/**
 * What stood after a caret (`rest`, taken out of `element`) as a new block on the line below it (after
 * a list item holding lists, the first item of its first list). `plain`: its bold taken off, a
 * title's. Returns the new block.
 */
export function splitBelow(element, rest, plain = false) {
  const next = newBlock(element.ownerDocument, siblingTag(element), element);
  next.append(rest);
  placeAfterText(element, [next]);
  if (plain && !isEmpty(next)) {
    const all = element.ownerDocument.createRange();
    all.selectNodeContents(next);
    formatRange(next, all, "bold", false);
  }
  return next;
}

/** Whether a text block's text is bold throughout (some text, all of it in <strong> or <b>): a node's title as written. */
export function boldThroughout(element) {
  if (isEmpty(element)) return false;
  const all = element.ownerDocument.createRange();
  all.selectNodeContents(element);
  return markValue(element, all, "bold") === true;
}

/**
 * The first line of a box whose first block is always of one type (`firstBlock`: a flowchart node's
 * title, its first paragraph after its icon), when it is one, or null.
 */
export function firstLineOf(box) {
  const type = box ? firstBlockOf(boxKind(box)) : null;
  const first = type ? heldIn(box)[0] : null;
  return first && textTypeOf(first) === type ? first : null;
}

/** Whether a text block is the first line of its box (firstLineOf): turned into nothing, nothing goes before it. */
export const isFirstLine = (host) => Boolean(host?.parentElement) && firstLineOf(host.parentElement) === host;

// New blocks split off a block go right after it; after a list item holding blocks, they open them
// (the line right below the item's text): its first list's first items, or, when another block comes
// first, a new list of the item's own kind put before it (a numbered one in a 流程图's step: heldListType).
function placeAfterText(element, blocks) {
  const first = nestedBlocks(element)[0];
  if (!first) element.after(...blocks);
  else if (isList(first)) first.prepend(...blocks);
  else {
    const list = newContainer(element.ownerDocument, heldListType(listType(element.parentElement)));
    list.append(...blocks);
    first.before(list);
  }
}

// ---------- pasting formatted text ----------

const PASTE_BLOCKS = new Set([
  "P", "DIV", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "TR", "TABLE", "TBODY", "THEAD", "UL", "OL", "DL", "DT", "DD",
  "SECTION", "ARTICLE", "ASIDE", "HEADER", "FOOTER", "MAIN", "NAV", "FIGURE", "FIGCAPTION", "DETAILS", "SUMMARY",
]);

// The mark of the format bar a pasted element stands for (bold, italic, inline code, a link, the
// kit's text color or highlight, super- and subscript), as a new element; null for any other.
// A pasted u keeps the kit's underline color and weight.
function underlineOf(doc, from) {
  const mark = doc.createElement("u");
  const kept = [...from.classList].filter(isUnderlineClass);
  if (kept.length > 0) mark.className = kept.join(" ");
  return mark;
}

function markOf(doc, node, links) {
  const tag = node.tagName;
  const style = node.getAttribute("style") ?? "";
  if (tag === "STRONG" || (tag === "B" && !/font-weight:\s*(normal|[1-5]00)\b/i.test(style))) return doc.createElement("strong");
  if (tag === "EM" || tag === "I") return doc.createElement("em");
  if (tag === "U" || tag === "INS") return underlineOf(doc, node);
  if (tag === "S" || tag === "STRIKE" || tag === "DEL") return doc.createElement("s");
  if (tag === "CODE" || tag === "KBD" || tag === "SAMP") return doc.createElement("code");
  if (tag === "SUP" || tag === "SUB") return doc.createElement(tag.toLowerCase());
  if (tag === "A") {
    const href = node.getAttribute("href") ?? "";
    if (!links || !href || /^(javascript|vbscript|data):/i.test(href.replace(/[\u0000- ]/g, ""))) return null;
    const link = doc.createElement("a");
    // A detail card's entry pasted in the page of its card stays its entry (its look, its card).
    if (node.classList.contains(DIALOG_TRIGGER) && cardNamed(doc, href)) link.className = DIALOG_TRIGGER;
    link.setAttribute("href", href);
    return link;
  }
  if (tag !== "SPAN") return null;
  const ink = [...node.classList].filter(isInkClass);
  if (ink.length > 0) {
    const span = doc.createElement("span");
    span.className = ink.join(" ");
    return span;
  }
  if (/font-weight:\s*(bold|[6-9]00)\b/i.test(style)) return doc.createElement("strong");
  if (/font-style:\s*italic/i.test(style)) return doc.createElement("em");
  if (/text-decoration[^;]*line-through/i.test(style)) return doc.createElement("s");
  if (/text-decoration[^;]*underline/i.test(style)) return doc.createElement("u");
  return null;
}

const isFormula = (node) => node.matches(".doc-math-inline");

/**
 * The lines of pasted HTML (the clipboard's text/html), each an array of nodes for a text block:
 * text with the format bar's marks (marks: false drops them, links: false drops links), a formula
 * of this page as its chip (another one, KaTeX's or the kit's \(…\), as the chip formula(tex) makes,
 * or else as its TeX source; `formulas` false, each as its source), a link shown with its icon as the
 * chip mention(mentionOf(it)) makes (else a link of its title), an element what picture(element)
 * makes of it (a cell's picture: page/table/pictures.mjs; null nothing, undefined no picture: none
 * given, no picture is one); blocks and line breaks start new lines, and everything else gives only
 * its text. Each line goes without the white space at its ends but where `edges` keeps it: `start`
 * the space the first line begins with, `end` the one the last ends with (words copied with a space
 * beside them: text pasted keeps every character of it), each run of it one space.
 */
export function pastedLines(doc, html, { marks = true, links = true, formula = null, formulas = true, mention = null, picture = null, edges = null } = {}) {
  const template = doc.createElement("template");
  template.innerHTML = html;
  const lines = [[]];
  const newLine = () => {
    if (lines.at(-1).length > 0) lines.push([]);
  };
  const push = (target, node) => (target ? target.append(node) : lines.at(-1).push(node));
  const walk = (node, target) => {
    for (const child of node.childNodes) {
      if (child.nodeType === 3) {
        const text = child.data.replace(/[\t\n\r ]+/g, " ");
        if (text) push(target, doc.createTextNode(text));
        continue;
      }
      if (child.nodeType !== 1) continue;
      const atom = child.getAttribute("data-ge-atom");
      if (atom !== null && ATOM_SOURCE.has(atom) && (formulas || !isFormula(child))) {
        // A chip of this page: a copy of it as the page shows it (the browser's copy of a selection
        // writes its look into inline styles), else as it came.
        const shown = [...doc.querySelectorAll("[data-ge-atom]")].find((node) => node.getAttribute("data-ge-atom") === atom);
        const chip = shown ? shown.cloneNode(true) : doc.importNode(child, true);
        chip.removeAttribute("data-ge-formula-edit");
        chip.removeAttribute("data-ge-link-edit");
        chip.setAttribute("contenteditable", "false");
        push(target, chip);
        continue;
      }
      // A formula of another page (KaTeX's, or the kit's \(…\) not drawn yet): a formula of this page
      // where `formula` makes one, else its TeX between \( \).
      const foreign = child.matches(".katex") ? child.querySelector('annotation[encoding="application/x-tex"]')?.textContent
        : isFormula(child) ? /^\s*\\\(([\s\S]*)\\\)\s*$/.exec(child.textContent)?.[1] : undefined;
      if (foreign !== undefined) {
        const made = foreign.trim() && formula ? formula(foreign.trim()) : null;
        if (made) push(target, made);
        else if (foreign.trim()) push(target, doc.createTextNode(`\\(${foreign}\\)`));
        else if (formula) push(target, newFormula(doc, "", "")); // one left empty stays so
        continue;
      }
      // A link left empty, and a link shown with its icon (of another page, or its source from the
      // clipboard's own blocks).
      if (marks && links && mention && isMention(child) && !child.hasAttribute("href")) {
        push(target, newEmptyLink(doc, child.hasAttribute(MENTION_PAGE)));
        continue;
      }
      if (marks && links && mention && isMention(child)) {
        const parts = mentionOf(child);
        const made = (/^https?:\/\//i.test(parts.href) || isFileLink(parts.href)) && parts.title ? mention(parts) : null;
        if (made) {
          push(target, made);
          continue;
        }
      }
      if (/^(STYLE|SCRIPT|TEMPLATE|META|TITLE|LINK|NOSCRIPT|BUTTON|SVG)$/i.test(child.tagName) || child.matches('[aria-hidden="true"], .ge-code-gutter, [data-doc-dev]')) continue;
      // A picture, where `picture` takes it (undefined: no picture): what it makes of it, else nothing.
      const made = picture?.(child);
      if (made !== undefined) {
        if (made) push(target, made);
        continue;
      }
      if (child.tagName === "BR") {
        if (target) push(target, doc.createTextNode(" "));
        else newLine();
        continue;
      }
      if (!target && PASTE_BLOCKS.has(child.tagName)) {
        newLine();
        walk(child, null);
        newLine();
        continue;
      }
      const mark = marks ? markOf(doc, child, links) : null;
      if (!mark) {
        walk(child, target);
        continue;
      }
      walk(child, mark);
      if (mark.textContent.trim() || mark.querySelector("[data-ge-atom]") || (picture && mark.firstElementChild)) push(target, mark);
      else if (mark.textContent) push(target, doc.createTextNode(mark.textContent));
    }
  };
  walk(template.content, null);
  // Each line without the spaces at its ends, but those `edges` keeps (one space each).
  const last = lines.findLastIndex((line) => line.length > 0);
  const trim = (line, index) => {
    const edge = (node, end) => {
      if (node?.nodeType !== 3) return;
      const kept = end ? index === last && edges?.end : index === 0 && edges?.start;
      node.data = end ? node.data.replace(/\s+$/, kept ? " " : "") : node.data.replace(/^\s+/, kept ? " " : "");
    };
    edge(line[0], false);
    edge(line.at(-1), true);
    return line.filter((node) => node.nodeType !== 3 || node.data !== "");
  };
  // Inline code and formulas stand a space apart from the words beside them in the line, as everywhere
  // (shared/inline-spacing.mjs); the ones at its ends are spaced from the text they join (the paste).
  const spaced = (line) => {
    const holder = doc.createElement("div");
    holder.append(...line);
    inlineItems(holder).forEach((item) => spaceAround(item));
    return [...holder.childNodes];
  };
  return lines.map(trim).filter((line) => line.some((node) => node.nodeType !== 3 || node.data.trim())).map(spaced);
}

// An item holding blocks merges into an item that may hold them too (they go under it: Delete at the end
// of the line above).
const holdsLists = (item) => item.getAttribute("data-ge-box-kind") === "nest" || (item.hasAttribute("data-ge-new") && !item.hasAttribute("data-ge-unit"));
// `sameKind`: an item joins only an item and a paragraph only a paragraph (Backspace, Delete); else
// any text joins any (a selection across blocks deleted: the last block's rest joins the first).
const joinable = (into, from, sameKind) => isHost(into) && can(into, "merge") && can(from, "merge") && can(from, "remove")
  && !from.hasAttribute("data-ge-keep") && (!sameKind || (into.tagName === "LI") === (from.tagName === "LI"))
  && (nestedBlocks(from).length === 0 || (into.tagName === "LI" && holdsLists(into) && nestedBlocks(from).every((block) => block.matches(UNIT))));

/**
 * The block on the line right above a block: its previous sibling, or for a list item, the last
 * block held by the one before it (at any depth: an item, a paragraph…), or the item its list (or
 * the block) hangs from. A flowchart is a container (its steps are nodes): the line above the block
 * after one is the flowchart itself, as a highlight block is the line above the block after it; and
 * nothing in a node has a line above it outside the node.
 */
export function previousLine(element) {
  let previous = element.previousElementSibling;
  if (!previous) return parentItem(element) ?? holderItem(element);
  // A block right after a list: the list's last item (the line above it).
  if (isList(previous) && !isFlowchart(previous) && previous.lastElementChild?.tagName === "LI") previous = previous.lastElementChild;
  if (isStep(previous)) return previous;
  for (let held = nestedBlocks(previous).at(-1); held; held = nestedBlocks(previous).at(-1)) {
    if (!isList(held)) return held; // the last block it holds: a paragraph, an image…
    if (held.lastElementChild?.tagName !== "LI") break;
    previous = held.lastElementChild;
  }
  return previous;
}

/**
 * The block on the line right below a text block: the first item it holds, its next sibling, or
 * for the last item of a list, the item after the one its list hangs from, or the block after the
 * outermost list (previousLine's counterpart).
 */
export function nextLine(element) {
  const held = nestedBlocks(element)[0];
  const first = isList(held) ? held.firstElementChild : held;
  if (first) return first;
  let at = element;
  // The last block an item holds: the line after the item.
  if (!at.nextElementSibling && holderItem(at)) at = holderItem(at);
  while (!at.nextElementSibling && at.tagName === "LI" && !isStep(at)) {
    const list = at.parentElement;
    // Out of a list a node holds, its line below is the next block in the node, or none: the line
    // after a node's last block is not the next node's, nor the block after the flowchart.
    if (list?.parentElement?.tagName === "LI" && !isStep(list.parentElement)) at = list.parentElement;
    else return list?.nextElementSibling ?? null;
  }
  return at.nextElementSibling;
}

/**
 * Backspace at a block start: append it to the block on the line above (a block right after a list
 * to the list's last item, whatever its kind). Returns that block, or null.
 */
export const mergeWithPrevious = (element) => mergeInto(previousLine(element), element, { anyKind: isList(element.previousElementSibling) || (!element.previousElementSibling && Boolean(holderItem(element))) });

/**
 * A text block appended to another's text (the lists it holds going under that one); it goes.
 * `anyKind`: whatever their kinds (see joinable). Returns `into`, or null when they do not join.
 */
export function mergeInto(into, from, { anyKind = false } = {}) {
  if (!into || into === from || !joinable(into, from, !anyKind)) return null;
  const end = into.childNodes[textEnd(into)] ?? null;
  const lists = nestedBlocks(from);
  for (const node of [...from.childNodes].filter((node) => !lists.includes(node))) into.insertBefore(node, end);
  into.append(...lists); // the blocks it held, under the line it joined
  const list = from.parentElement;
  from.remove();
  if (isList(list) && list.children.length === 0 && list.parentElement?.tagName === "LI") list.remove(); // a nested list left empty goes
  return into;
}

// ---------- identity ----------
// Every element the commits know (a unit, a text block, a box, a block made on the page) carries
// an identity of its own, data-ge-id, given once and never changed (docs/editor.md, "Sync state"):
// what of the file it is lives in the commits' table under that identity, and the marks below
// (data-ge-unit, data-ge-block, data-ge-box, data-ge-new…) are written from that table. A block
// turned into another type keeps it (convert.mjs), as does a list turned into the other kind; a
// copy never has one (it is taken off with every other mark), and undo brings an element back
// with its own.

export const ELEMENT_ID = "data-ge-id";

/** The words an Agent took out of a text block, shown where they were (changes/): never its content. */
export const GONE_WORDS = "[data-ge-gone-words]";
const ELEMENT_ID_PREFIX = Math.random().toString(36).slice(2, 6); // a page's own, as formulas' keys
let elementIds = 0;

/** The identity of an element, given now when it has none. */
export function identityOf(element) {
  let id = element.getAttribute(ELEMENT_ID);
  if (!id) {
    id = `${ELEMENT_ID_PREFIX}${(elementIds++).toString(36)}`;
    element.setAttribute(ELEMENT_ID, id);
  }
  return id;
}

/** The elements of `root` the commits know. */
export const knownElements = (root) => root.querySelectorAll("[data-ge-unit], [data-ge-block], [data-ge-box], [data-ge-new], [data-ge-id]");

// ---------- units: the blocks the reader can select and delete ----------
// The preview server marks them (see findUnits in src/editor/source/): data-ge-unit on each,
// data-ge-lead on a table's scope line that goes with it, data-ge-keep on those the report's
// script or other elements refer to, data-ge-box (and data-ge-pure) on the containers.

/** What marks a block: a unit the file has (data-ge-unit) or one made on the page (data-ge-new). */
export const UNIT = "[data-ge-unit], [data-ge-new]";

// The containers Backspace deletes once nothing is written in them (each goes with its only empty
// line), the kinds of block whose component says so (`removedEmpty`):
// text blocks may stand in them, empty, and their own parts (a highlight block's icon, a code block's
// language); nothing else.
const EMPTIED = REMOVED_EMPTY.map((kind) => `[data-ge-unit-kind="${kind}"]`).join(", ");

/** The container `host` stands first in (or anywhere in, where it says so: `removedEmpty`) when nothing is written in it, or null. */
export function emptyContainer(host) {
  const container = host.parentElement?.closest(EMPTIED);
  if (!container || !container.matches(UNIT)) return null;
  const own = [...container.querySelectorAll('[contenteditable="true"]')].filter(isHost);
  if (own.length === 0 || !own.every(isEmpty) || (own[0] !== host && !removedFromAnywhere(container.getAttribute("data-ge-unit-kind")))) return null;
  const units = [...container.querySelectorAll(UNIT)];
  const lead = leadOf(boxKind(container));
  return units.every((unit) => isHost(unit) || unit.matches(TEXT_BLOCKS) || (lead !== null && unit.getAttribute("data-ge-unit-kind") === lead)) ? container : null;
}
// ...and a table's scope line, which goes with its table.
const UNIT_OR_LEAD = "[data-ge-unit], [data-ge-lead], [data-ge-new]";
// The block around a node (outerOf): a text host made on the page (contenteditable) is no block around anything.
export const OUTER = "[data-ge-unit], [data-ge-new]:not([contenteditable])";

/** The blocks directly in a container: the file's and those made on the page (not a section's title row). */
export const unitsOf = (container) => [...container.children].filter((child) => child.matches(UNIT));

// A row or cell made on the page (components/table/page.mjs): part of its table, written by its operation.
export const inTable = (node) => /^(TR|TD|TH)$/.test(node?.tagName ?? "") && node.hasAttribute("data-ge-new");

/** The unit an element belongs to (a new, unsaved block counts as one), or null. */
export function unitElement(node) {
  let found = node?.closest?.(UNIT_OR_LEAD) ?? null;
  while (inTable(found)) found = found.parentElement?.closest(UNIT_OR_LEAD) ?? null;
  // Text made on the page that is part of a block (a new code block's code, a media block's new
  // caption) stands for that block: the part's own block, not the one around it.
  const part = found && !found.hasAttribute("data-ge-unit") ? partOf(found) : null;
  if (part) found = part.closest(UNIT);
  if (!found?.hasAttribute("data-ge-lead")) return found;
  const id = found.getAttribute("data-ge-lead");
  let next = found.nextElementSibling;
  while (next && next.getAttribute("data-ge-unit") !== id) next = next.nextElementSibling;
  return next;
}

/** A unit and the elements right before it that go with it (a table's scope line), in document order. */
export function withLeads(node) {
  const id = node.getAttribute("data-ge-unit");
  const nodes = [node];
  for (let previous = node.previousElementSibling; id !== null && previous?.getAttribute("data-ge-lead") === id; previous = previous.previousElementSibling) {
    nodes.unshift(previous);
  }
  return nodes;
}

/** Everything that goes away with a unit: its leads, itself and, for a Sheet tab, its panel. */
export function partsOf(node) {
  const panel = panelOf(node);
  return [...withLeads(node), ...(panel ? [panel] : [])];
}

/** A unit taken out of the page with what goes with it (partsOf): the one step of every deletion. */
export function takeOut(node) {
  partsOf(node).forEach((part) => part.remove());
  return node;
}

const sizesOf = (node, kind) => Object.fromEntries(Object.keys(SIZES[kind] ?? {}).map((name) => [name, node.style.getPropertyValue(name).trim()]));
const attributesOf = (node, kind) => Object.fromEntries(Object.keys(ATTRIBUTES[kind] ?? {}).map((name) => [name, node.getAttribute(name)]));

/**
 * Where the dashed frame of what is being edited goes (editor.mjs shows it only then): text that
 * is a block of its own has its own outline; any other block (a card, a table and its scope line,
 * a disclosure, code, a formula, a Sheet tab, a report widget...) a frame around the whole
 * (data-ge-frame, shown while text inside it is edited), and the text inside it (`hosts` among
 * them) none (data-ge-framed). Chapters (sections, Sheet areas) and the groups in them (rows of
 * columns and their columns, lists, plain divs) have none of their own.
 */
/**
 * The formulas in `element` drawn as the kit draws a page's as it loads (DocMath.render, which draws none put in
 * later: what the page's pull puts in, or shows the words of anew, page/pull/), and nowhere else: the element alone
 * marked for the moment as a place formulas render in (single-dollar ones too where a container around it opts into
 * them), so that no text of the page's around it (\( typed by the reader) is drawn. Nothing where the page has no
 * formulas of the kit's (no math on it as it loaded).
 */
export function drawFormulas(element) {
  const render = globalThis.DocMath?.render;
  if (!render) return;
  let dollar = false;
  for (let at = element.parentElement; at && !dollar; at = at.parentElement) dollar = at.hasAttribute("data-doc-math-dollar");
  const marks = ["data-doc-math", ...(dollar ? ["data-doc-math-dollar"] : [])].filter((name) => !element.hasAttribute(name));
  for (const name of marks) element.setAttribute(name, "");
  try {
    render(element);
  } finally {
    for (const name of marks) element.removeAttribute(name);
  }
}

export function markFrames(root, layout, hosts) {
  const frames = [];
  for (const [id, node] of layout.elements) {
    if (!isHost(node) && !node.hasAttribute("data-ge-box") && layout.kinds.get(id) !== "sheets") frames.push(node);
  }
  frames.push(...root.querySelectorAll("[data-ge-lead]"));
  for (const node of frames) {
    node.setAttribute("data-ge-frame", "");
    const round = cornersOf(node);
    if (round) node.setAttribute("data-ge-round", round);
  }
  for (const host of hosts) if (frameOf(host)) host.setAttribute("data-ge-framed", "");
}

// A frame follows its element's corners. One with square corners gets rounded ones while the page
// is edited: a block that draws a box (a fill or a border: a report widget, say) the kit's, as
// every component has them ("box"); one that draws none (a formula) or only a line (a divider)
// the corners of a text block's outline ("text"), its frame being all there is to round. Not
// media, nor a box that clips its content, whose look that would change.
const MEDIA_TAGS = new Set(["img", "picture", "video", "audio", "canvas", "iframe", "object", "svg"]);
function cornersOf(node) {
  if (MEDIA_TAGS.has(node.localName)) return null;
  if (node.localName === "hr") return "text";
  const style = node.ownerDocument.defaultView.getComputedStyle(node);
  const corners = [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius];
  if (corners.some((corner) => parseFloat(corner) > 0)) return null;
  const clips = [style.overflowX, style.overflowY].some((value) => value && value !== "visible");
  const boxed = style.backgroundImage !== "none" || !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(style.backgroundColor)
    || [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].some((width) => parseFloat(width) > 0);
  if (clips && boxed) return null;
  return boxed ? "box" : "text";
}

/** The frame that carries the outline of text inside a component: the nearest around it, unless a container comes first. */
export function frameOf(host) {
  for (let node = host?.parentElement; node && node.tagName !== "MAIN"; node = node.parentElement) {
    if (node.hasAttribute("data-ge-frame")) return node;
    if (node.hasAttribute("data-ge-box")) return null;
  }
  return null;
}

/** Whether a child of a box is a block (a unit, a table's scope line, a block made on the page). */
export const holdsBlocks = (node) => node.matches(UNIT_OR_LEAD);

/** The blocks of a box, in order. */
export const blocksIn = (box) => [...box.children].filter(holdsBlocks);

/** The kind of box an element is (data-ge-box-kind), or null. */
export const boxKind = (node) => node?.getAttribute?.("data-ge-box-kind") ?? null;

/** The blocks a box holds as its own: its blocks without its lead (a highlight block's icon, `lead`). */
export function heldIn(box) {
  const lead = leadOf(boxKind(box));
  return lead === null ? blocksIn(box) : blocksIn(box).filter((child) => child.getAttribute("data-ge-unit-kind") !== lead);
}

/**
 * What a structural step (history.mjs) does to the boxes that always hold a block (`holdsOne`: a
 * disclosure's content, a highlight block, a flowchart's node), as a tidier: one of the containers
 * it changes that it leaves empty (its blocks deleted, cut, dragged or turned out of it) gets an
 * empty paragraph, in the same step (undo takes it out with the rest), the step's `caret`: what is
 * deleted leaves it there to write in; and one whose first block is always of one type
 * (`firstBlock`: a node's title) that it leaves with another first gets an empty one of that type
 * before it (a node's title deleted or dragged away: an empty title, bold armed there, format-bar/).
 * A box the step takes off the page is left alone.
 */
export function tidyEmptied(parents) {
  const boxes = parents.filter((node) => HOLDS_ONE.has(boxKind(node)) || firstBlockOf(boxKind(node)));
  return {
    parents: [],
    settle: (result) => boxes.filter((box) => box.isConnected).forEach((box) => {
      const held = heldIn(box);
      const type = firstBlockOf(boxKind(box));
      if (held.length === 0 && HOLDS_ONE.has(boxKind(box))) box.append(result.caret = newHost(box.ownerDocument, type ?? "paragraph"));
      else if (type && held.length > 0 && textTypeOf(held[0]) !== type) withLeads(held[0])[0].before(newHost(box.ownerDocument, type));
    }),
  };
}

/**
 * Whether deleting `node` would change nothing: it is what tidyEmptied puts back, the one block of a
 * box that always holds one, an empty paragraph with no look of its own (no color, not small text).
 */
export const keptAnyway = (node) => node?.localName === "p" && node.classList.length === 0 && isHost(node) && isEmpty(node)
  && HOLDS_ONE.has(boxKind(node.parentElement)) && heldIn(node.parentElement).length === 1;

/** An emptied container goes when it may: made on the page, or a pure unit nothing refers to. */
export function dropIfEmpty(node) {
  if (!node?.isConnected || blocksIn(node).length > 0) return;
  if (node.hasAttribute("data-ge-pure") && node.matches(UNIT) && !node.hasAttribute("data-ge-keep")) node.remove();
}

/** The first text block of a container that shows (Enter in a title, Enter on a selected block). */
export const firstHost = (container) => [...container.querySelectorAll("[data-ge-block], [data-ge-new]")].find((node) => isHost(node) && node.getClientRects().length > 0);

/**
 * The node that goes away with a block: the block, or its container once nothing else is left in
 * it, when that container is itself a unit that may go (a list, quote or plain div, a column, or
 * any container made on the page). Outside marked containers (a list nested in a list item) a
 * list or quote left empty goes too. `gone`: elements going at the same time (other selected
 * blocks), which leave nothing behind either.
 */
export function removalTarget(element, gone = new Set()) {
  let node = element;
  for (let parent = node.parentElement; parent; parent = node.parentElement) {
    const own = new Set(withLeads(node));
    const others = [...parent.children].filter((child) => !own.has(child) && !gone.has(child));
    if (parent.hasAttribute("data-ge-box")) {
      const free = parent.hasAttribute("data-ge-pure") && parent.matches(UNIT) && !parent.hasAttribute("data-ge-keep");
      if (!free || others.some(holdsBlocks)) return node;
    } else if (!WRAPPERS.has(parent.tagName) || others.length > 0) return node;
    node = parent;
  }
  return node;
}

// The page's units by id: the elements marked as units (or a snapshot's), the last of an id kept.
function unitElements(root, snapshot = null, unitOf = markedUnit) {
  const nodes = (snapshot ? snapshot.units : [...root.querySelectorAll("[data-ge-unit]")]).filter((node) => unitOf(node) !== null);
  return new Map(nodes.map((node) => [unitOf(node), node]));
}

/**
 * Every unit of the page marked with its kind from the map (data-ge-unit-kind), as captureLayout marks
 * them (it calls this): what reads the page by its units' kinds before the editor has started finds
 * them as it will after (the outline, drawn before enter(): editor.mjs start). A mark already right is
 * not set again (the outline's observer would take it for a change of a heading and read the page
 * again). `elements`: the units by id (unitElements). Returns the kinds by unit id.
 */
export function markKinds(root, map, elements = unitElements(root)) {
  const kinds = new Map((map.units ?? []).map((unit) => [unit.id, unit.kind]));
  for (const [id, node] of elements) {
    if (kinds.has(id) && node.getAttribute("data-ge-unit-kind") !== kinds.get(id)) node.setAttribute("data-ge-unit-kind", kinds.get(id));
  }
  return kinds;
}

/**
 * The page's units as the editor found them when it started (or as the last commit left them,
 * commit.mjs): elements by id (a deleted unit is no longer in the document, but its element is),
 * which unit each text block lies in, each unit's source hash, and the switchable classes it had. Every
 * unit and box is also marked with its kind (data-ge-unit-kind, data-ge-box-kind), so blocks made
 * or converted on the page, which the map does not know, read the same way. `data`: what the file
 * holds of what each unit's component writes, by unit id, as the commits say it (commit.mjs apply);
 * without it, what the page holds of that now.
 */
export function captureLayout(root, map, snapshot = null, { unitOf = markedUnit, boxOf = markedBox, typeOf = null, data = null } = {}) {
  const elements = unitElements(root, snapshot, unitOf);
  const kinds = markKinds(root, map, elements);
  const boxKinds = new Map((map.boxes ?? []).map((box) => [box.id, box.kind]));
  const boxes = (snapshot ? snapshot.boxes : [...root.querySelectorAll("[data-ge-box]")].map((box) => [box, [...box.children]])).filter(([box]) => boxOf(box) !== null);
  for (const [box] of boxes) {
    const kind = boxKinds.get(boxOf(box));
    if (kind) box.setAttribute("data-ge-box-kind", kind);
  }
  // Classes, sizes and attributes as they were when the snapshot was taken, else as they are now.
  const look = (node) => snapshot?.looks.get(node) ?? node;
  const toggles = new Map([...elements].map(([id, node]) => [id, new Set((TOGGLES[kinds.get(id)] ?? []).filter((name) => look(node).classList.contains(name)))]));
  const sizes = new Map([...elements].map(([id, node]) => [id, sizesOf(look(node), kinds.get(id))]));
  const attributes = new Map([...elements].map(([id, node]) => [id, attributesOf(look(node), kinds.get(id))]));
  return {
    root,
    elements,
    kinds,
    // The type each showed as (convert.mjs ownTypeOf, when given): turned into another, it is converted.
    types: new Map(typeOf ? [...elements].map(([id, node]) => [id, typeOf(look(node))]) : []),
    toggles,
    sizes,
    attributes,
    // By box id: a list turned into the other kind of list is a new element with the same id.
    orders: new Map(boxes.map(([box, children]) => [boxOf(box), children.map(unitOf).filter((id) => id !== null)])),
    blockUnit: new Map((map.blocks ?? []).map((block) => [block.id, block.unit ?? null])),
    hashes: new Map((map.units ?? []).map((unit) => [unit.id, unit.hash])),
    // Each table's rows and cells (components/table/grid.mjs): a change of them is one operation.
    tables: new Map([...elements].filter(([id]) => kinds.get(id) === "table").map(([id, node]) => [id, snapshot?.tables?.get(node) ?? gridOf(node)])),
    // What the file holds of what each block's component writes, so that a part left as it was is never
    // written: as the page opened on it (ownData), then what its commits say (`data`, commit.mjs apply).
    data: new Map([...elements].flatMap(([id, node]) => {
      const held = data ? data.get(id) : ownData(node);
      return held ? [[id, held]] : [];
    })),
  };
}

// What of a block its component writes, by part (`dataOf` of its page object: an instance's data
// parts), as the file is to hold it, or nothing where it writes nothing.
const ownData = (node) => pageOfUnit(node)?.dataOf?.(node) ?? null;

// What a unit or box of the map an element is, as its marks say (the commits' table says it once
// they run: commit.mjs).
const markedUnit = (node) => (node.getAttribute("data-ge-unit") ?? "") === "" ? null : Number(node.getAttribute("data-ge-unit"));
const markedBox = (node) => (node.getAttribute("data-ge-box") ?? "") === "" ? null : Number(node.getAttribute("data-ge-box"));

/**
 * The page's structure at one moment, by element: every unit (and every block made on the page,
 * which a commit may make one), the blocks of each box in order, and a copy of each one's start
 * tag (its classes and sizes). Taken when a commit is built; captureLayout(root, map, snapshot)
 * turns it into the layout the next commit is found against, so what changes on the page while a
 * commit is on its way is not taken as committed.
 */
export function snapshotLayout(root) {
  const units = [...root.querySelectorAll(UNIT)];
  const boxes = [...root.querySelectorAll("[data-ge-box]")].map((box) => [box, unitsOf(box)]);
  const tables = new Map(units.filter((node) => node.getAttribute("data-ge-unit-kind") === "table").map((node) => [node, gridOf(node)]));
  return { units, boxes, looks: new Map(units.map((node) => [node, node.cloneNode(false)])), tables };
}

// Whether a text block may be written with no text: it is of a type whose component says so (its
// `empty`: a paragraph, a heading, a list item; the server's emptyLeaf reads the same)
// and can be emptied (can "empty"), an item holding blocks too, its line kept over them (keepLine). A
// field that may be emptied (a cell, a caption) is no block written empty; a new code block is
// written empty by its type (describeNode).
const clearable = (element) => can(element, "empty");
/** Whether an empty text block stays, written with no text (a paragraph, a heading, a list item, a code block). */
const keepsWhenEmpty = (element) => BLOCK_TYPES[textTypeOf(element)]?.empty === true && clearable(element);

/** Whether a text block may go: it can be removed, is not kept (data-ge-keep) and holds no blocks (it would show no line of its own). */
export const removable = (element) => can(element, "remove") && !element.hasAttribute("data-ge-keep") && nestedBlocks(element).length === 0;
/** Whether a text block left empty goes with its save: it may go and does not stay empty. */
const dropsWhenEmpty = (element) => removable(element) && !keepsWhenEmpty(element);

// A block converted on the page (data-ge-convert) and then emptied goes, like an emptied block
// that cannot be empty.
const gone = (node) => node.hasAttribute("data-ge-convert") && !BLOCK_TYPES[node.getAttribute("data-ge-type")]?.box && isEmpty(textOf(node)) && !keepsWhenEmpty(textOf(node));

// Whether a unit goes with this collect: one a conversion emptied (gone), or one of `emptied`, the
// units of the file whose own text collectEdits took out, with nothing split off them (`[]`): a
// block that cannot be empty (can "empty": a free paragraph, heading or list item can) goes with
// that commit. Like a block converted and then emptied, such a block is placed nowhere (no move of
// it, no block placed next to it) and taken along into no block made on the page. collectEdits
// finds the set and hands it to every function that asks.
const leaves = (node, emptied) => gone(node) || emptied.has(node);

// The text block of a block: the block itself, or where its component says (a code block's code).
const textOf = (node) => BLOCK_TYPES[blockTypeOf(node)]?.textHost?.(node) ?? node;

// What a component's description is given to say what goes with a block (`extras`). `nodes(box)`: the
// blocks of a box of its own as the commit writes them (nodeOf), a block written whole holding those of
// boxes of its own apart from its markup (an instance's slots: installed/index.mjs).
const HELPERS = { sizeValue, serializeInner, unitsOf };
const helpersFor = (emptied) => ({ ...HELPERS, nodes: (box) => unitsOf(box).map((child) => nodeOf(child, emptied)).filter(Boolean) });

/**
 * The first element in `root` (in document order, `root` itself left out) carrying each value of
 * the attributes `names`, by value: what root.querySelector(`[name="value"]`) (one of them, for
 * several names) finds, for every value at once. Attribute selectors are not indexed, so a search
 * per value walks the page until it matches: one per block of the report made every collect
 * O(blocks × elements), 35-90 ms on a large report each time the reader paused, and many times
 * over whenever the page was left. One pass over the elements that carry them instead.
 */
export function firstByAttribute(root, ...names) {
  const found = new Map();
  for (const element of root.querySelectorAll(names.map((name) => `[${name}]`).join(", "))) {
    for (const name of names) {
      const value = element.getAttribute(name);
      if (value !== null && !found.has(value)) found.set(value, element);
    }
  }
  return found;
}

// An index of the page made the first time it is asked for (firstByAttribute), for one pass of a
// function that does not change the page: most collects never need some of them.
const lazyIndex = (root, ...names) => {
  let index = null;
  return () => (index ??= firstByAttribute(root, ...names));
};

// The element a unit has on the page now: its own, or the one it was converted into. `units`: the
// page's elements by data-ge-unit (firstByAttribute), when the caller has them.
function live(root, id, units = null) {
  const node = units ? units.get(String(id)) ?? null : root.querySelector(`[data-ge-unit="${id}"]`);
  return node && !gone(node) ? node : null;
}

/**
 * Deleted units: on the page neither as their element nor as one they were converted into, and
 * outermost only: out of the document with no parent, or inside a container made on the page
 * that was deleted (and no unit around it).
 */
export function removedUnits(layout) {
  if (!layout) return [];
  const top = (node) => {
    while (node.parentElement) node = node.parentElement;
    return node;
  };
  const units = lazyIndex(layout.root, "data-ge-unit"); // asked only for the units off the page
  return [...layout.elements].filter(([id, node]) => {
    if (node.isConnected || live(layout.root, id, units())) return false;
    if (!node.parentNode) return true;
    return !node.parentElement?.closest("[data-ge-unit]") && top(node).hasAttribute?.("data-ge-new") === true;
  }).map(([id]) => id);
}

// The ids of the units directly in a box, in page order.
const unitsIn = (box) => [...box.children].map((child) => child.getAttribute("data-ge-unit")).filter((id) => id !== null).map(Number);

// Longest common subsequence of two lists of ids.
function common(xs, ys) {
  const table = Array.from({ length: xs.length + 1 }, () => new Array(ys.length + 1).fill(0));
  for (let i = xs.length - 1; i >= 0; i--) {
    for (let j = ys.length - 1; j >= 0; j--) table[i][j] = xs[i] === ys[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const kept = new Set();
  for (let i = 0, j = 0; i < xs.length && j < ys.length;) {
    if (xs[i] === ys[j]) {
      kept.add(xs[i]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return kept;
}

// A new paragraph or list item split off an original text block (Enter, a multi-line paste) is
// written with that block, as `parts` of its edit, when only such blocks lie between them.
// One with no text (Enter at a block's start or end) is a block of its own, placed next to it: the
// block it came from is not edited by it (an empty part once made the reader's untouched paragraph
// conflict with the Agent deleting it).
const splitOff = (node) => node.hasAttribute("data-ge-new") && !node.hasAttribute("data-ge-unit")
  && (node.tagName === "P" || node.tagName === "LI") && !node.parentElement?.closest("[data-ge-new]") && nestedBlocks(node).length === 0
  && !BLOCK_TYPES[textTypeOf(node)]?.className && !isEmpty(node);

// An original block accepts new sibling blocks of the type it splits into (li -> li, p/h3/h4 -> p).
const takesNew = (original, node) => Boolean(original?.hasAttribute("data-ge-block"))
  && can(original, "split")
  && (original.tagName === "LI") === (node.tagName === "LI");

/** The original text block a new block is written with ({ owner, where: "after" | "before" }), or null. */
export function partOwner(node) {
  if (!splitOff(node)) return null;
  for (const [direction, where] of [["previousElementSibling", "after"], ["nextElementSibling", "before"]]) {
    let sibling = node[direction];
    while (sibling && splitOff(sibling)) sibling = sibling[direction];
    if (takesNew(sibling, node)) return { owner: sibling, where };
  }
  return null;
}

/**
 * A block made on the page as the server writes it: a leaf { type, html }, a container
 * { type, children } (a disclosure also has its `title`, a detail card its `id`, a column its
 * `ratio` when it has one), an original unit placed in a container made on the page, { unit: id }, or a copy of
 * one, { copy: id }. Null when there is nothing to write (no text, no blocks; a row of columns
 * until each of its columns has something). `emptied`: the units collectEdits takes out (leaves).
 */
export function nodeOf(element, emptied) {
  const node = describeNode(element, emptied);
  if (node) madeFrom.set(node, element);
  return node;
}

// The class switches a block made or turned on the page carries (its color: TOGGLES) and the
// attributes its kind sets (a to-do item's checked state: ATTRIBUTES), as the file is to have them:
// { classes, attributes } or nothing. A bare attribute (one whose value is "": a to-do item's
// checked state) that the file wrote with a value (data-checked="true", which the kit reads as
// there) goes bare, as the file takes it: an element the file had, put back by undo, writes again.
const fileValue = (kind, name, value) => (!attributeValue(kind, name, value) && attributeValue(kind, name, "") ? "" : value);
const switched = (element, kind) => {
  const classes = (TOGGLES[kind] ?? []).filter((name) => element.classList.contains(name));
  const attributes = Object.fromEntries(Object.keys(ATTRIBUTES[kind] ?? {}).filter((name) => element.hasAttribute(name)).map((name) => [name, fileValue(kind, name, element.getAttribute(name))]));
  return { ...(classes.length > 0 ? { classes } : {}), ...(Object.keys(attributes).length > 0 ? { attributes } : {}) };
};

function describeNode(element, emptied) {
  if (element.hasAttribute("data-ge-unit")) return leaves(element, emptied) ? null : { unit: Number(element.getAttribute("data-ge-unit")) };
  const type = element.getAttribute("data-ge-type");
  // A copy of a card or a table (clipboard/own/): the file copies that unit, with the keys of the
  // charts drawn from tables in it that the paste gave it (clipboard/own/chart-keys.mjs).
  if (type === "copy") {
    const keys = element.hasAttribute(COPY_KEYS) ? JSON.parse(element.getAttribute(COPY_KEYS)) : null;
    return { copy: Number(element.getAttribute("data-ge-copy")), ...(keys ? { keys } : {}) };
  }
  const spec = BLOCK_TYPES[type];
  if (!spec) return null;
  // Everything about a type is its component's (registry.mjs, `types`): what goes with it besides
  // its text and blocks (`extras`: a code block's language and title, a column's share of its row),
  // whether it has text at all (`bare`: a divider), where its text is (`textHost`) and its blocks
  // (`content`: a disclosure's content region), its title (`title`), its id (`keyed`: a detail
  // card's), when it is written at all (`written`: a row once each of its columns has something, a
  // detail card while a link opens it; else once it holds something).
  const extras = spec.extras?.(element, helpersFor(emptied)) ?? {};
  if (spec.bare) return spec.written?.(element, []) === false ? null : { type, ...extras };
  if (!spec.box) {
    const text = textOf(element);
    if (isEmpty(text) && !keepsWhenEmpty(text) && !spec.empty) return null; // a code block is written empty too (its text host has no type of its own)
    const lists = nestedBlocks(element).map((block) => nodeOf(block, emptied)).filter(Boolean);
    return { type, html: serializeInner(text), ...extras, ...switched(element, spec.kind), ...(lists.length > 0 ? { children: lists } : {}) };
  }
  const box = spec.content?.(element) ?? element;
  const children = (box ? unitsOf(box) : []).map((child) => nodeOf(child, emptied)).filter(Boolean);
  const title = spec.title?.(element) ?? null;
  const written = spec.written ? spec.written(element, children, HELPERS) : children.length > 0 || Boolean(title && !isEmpty(title));
  if (!written) return null;
  // Its color too, as a text block's (switched): a highlight block or a disclosure made of a colored
  // node, or pasted with its color, is written so (the type's own class is no switch of it: a to-do
  // list's doc-todo).
  const classes = switched(element, spec.kind).classes?.filter((name) => name !== spec.className) ?? [];
  return { type, ...(spec.keyed ? { id: element.id } : {}), ...(spec.title ? { title: title ? serializeInner(title) : "" } : {}), children, ...(classes.length > 0 ? { classes } : {}), ...extras };
}

// The blocks directly in a box: original ones (a converted one too) and new ones written as
// blocks of their own; not one that goes (emptied, or a conversion emptied), which is placed nowhere.
const placedIn = (box, emptied) => [...box.children].filter((child) => !leaves(child, emptied)
  && (child.hasAttribute("data-ge-unit") || (child.hasAttribute("data-ge-new") && !partOwner(child))));

/** What a part, a node or an insert of collectEdits was made from: its element on the page (commits). */
export const madeFrom = new WeakMap();

/**
 * Moved and new blocks, box by box: [{ id, move }] and [{ id: "n<k>", insert, place }]. In each
 * box the longest run of units still in their original order stays; every other unit there (moved
 * within the box or from another one) and every new block goes { after } the unit that stayed
 * before it or { before } the one after it. In a box where no original unit stayed, blocks go
 * { into } the box, in order. In page order, so blocks placed next to the same one keep their order.
 * `emptied`: the units collectEdits takes out (leaves).
 */
export function placedUnits(layout, emptied) {
  if (!layout) return [];
  const ops = [];
  let fresh = 0;
  const boxes = firstByAttribute(layout.root, "data-ge-box"); // each box as a search for it would find it, the first of that id
  for (const [boxId, before] of layout.orders) {
    const box = boxes.get(String(boxId));
    if (!box) continue;
    const children = placedIn(box, emptied);
    const idOf = (child) => child.hasAttribute("data-ge-unit") ? Number(child.getAttribute("data-ge-unit")) : null;
    const now = children.map(idOf).filter((id) => id !== null);
    const kept = before.filter((id) => now.includes(id));
    if (children.length === now.length && kept.join() === now.join()) continue;
    const stay = common(kept, now);
    children.forEach((child, index) => {
      const id = idOf(child);
      if (id !== null && stay.has(id)) return;
      const previous = children.slice(0, index).reverse().map(idOf).find((other) => other !== null && stay.has(other));
      const next = children.slice(index + 1).map(idOf).find((other) => other !== null && stay.has(other));
      const place = previous !== undefined ? { after: previous } : next !== undefined ? { before: next } : { into: boxId };
      if (id !== null) {
        ops.push({ id, move: place });
        return;
      }
      const node = nodeOf(child, emptied);
      if (!node) return;
      const op = { id: `n${fresh++}`, insert: node, place };
      madeFrom.set(op, child);
      ops.push(op);
    });
  }
  return ops;
}

/**
 * Units converted on the page into another type: [{ id, replace: { type, html } }] for a text
 * block, [{ id, retag }] for a list turned into the other kind of list.
 */
export function convertedUnits(layout) {
  if (!layout) return [];
  const ops = [];
  for (const node of layout.root.querySelectorAll("[data-ge-convert]")) {
    const id = Number(node.getAttribute("data-ge-convert"));
    const type = node.getAttribute("data-ge-type");
    if (BLOCK_TYPES[type]?.box) {
      if (node.localName !== layout.elements.get(id)?.localName) ops.push({ id, retag: node.localName });
      // Its class switches too (a bulleted list turned into a to-do list keeps its tag).
      const had = layout.toggles.get(id) ?? new Set();
      for (const name of TOGGLES[layout.kinds.get(id)] ?? []) if (node.classList.contains(name) !== had.has(name)) ops.push({ id, toggle: name, on: !had.has(name) });
    } else if (!gone(node)) ops.push({ id, replace: { type, html: serializeInner(textOf(node)), ...(BLOCK_TYPES[type]?.extras?.(node, HELPERS) ?? {}), ...switched(node, BLOCK_TYPES[type]?.kind) } });
  }
  return ops;
}

/** Classes switched on units still on the page: [{ id, toggle, on }]. */
export function toggledUnits(layout) {
  if (!layout) return [];
  const changes = [];
  for (const [id, node] of layout.elements) {
    if (!node.isConnected) continue;
    for (const name of TOGGLES[layout.kinds.get(id)] ?? []) {
      const on = node.classList.contains(name);
      if (on !== layout.toggles.get(id).has(name)) changes.push({ id, toggle: name, on });
    }
  }
  return changes;
}

/** Sizes changed on units still on the page: [{ id, size, value }], value null when removed. */
export function sizedUnits(layout) {
  if (!layout) return [];
  const changes = [];
  for (const [id, node] of layout.elements) {
    if (!node.isConnected) continue;
    const now = sizesOf(node, layout.kinds.get(id));
    for (const [name, value] of Object.entries(now)) {
      if (value !== (layout.sizes.get(id)?.[name] ?? "")) changes.push({ id, size: name, value: value || null });
    }
  }
  return changes;
}

/** Attributes set or removed on units still on the page: [{ id, attribute, value }], value null when removed. */
export function attributedUnits(layout) {
  if (!layout) return [];
  const changes = [];
  for (const [id, node] of layout.elements) {
    if (!node.isConnected) continue;
    const now = attributesOf(node, layout.kinds.get(id));
    for (const [name, value] of Object.entries(now)) {
      if (value !== (layout.attributes.get(id)?.[name] ?? null)) changes.push({ id, attribute: name, value });
    }
  }
  return changes;
}

/**
 * Tables whose rows or columns changed on the page (components/table/grid.mjs): [{ id, table }],
 * each cell's text with it where it changed against `baselines` (a new cell's always).
 */
export function tableChanges(layout, baselines = new Map()) {
  if (!layout?.tables) return [];
  const ops = [];
  for (const [id, before] of layout.tables) {
    const node = layout.elements.get(id);
    if (!node?.isConnected || !before) continue;
    // A cell of the file not edited on the page (no baseline: locked, a script changed what it shows)
    // keeps what the file has.
    const table = tableChange(before, node, (cell) => {
      const html = serializeInner(cell);
      const block = cell.getAttribute("data-ge-block");
      const baseline = block === null ? undefined : baselines.get(Number(block));
      return { html, changed: block === null || (baseline !== undefined && html !== baseline) };
    });
    if (table) ops.push({ id, table });
  }
  return ops;
}

/**
 * Parts a block's component wrote on the page (ownData): [{ id, source, definition }], `source` the
 * parts that differ from what the layout holds of them, by name, `definition` the stamp of what it
 * was written by. A part left as it was is written by nothing, so what a component cannot read and
 * leaves alone stays as the file has it.
 */
export function dataChanges(layout) {
  if (!layout?.data) return [];
  const ops = [];
  for (const [id, before] of layout.data) {
    const node = layout.elements.get(id);
    if (!node?.isConnected) continue;
    const source = Object.fromEntries(Object.entries(ownData(node) ?? {}).filter(([name, html]) => html !== before[name]));
    if (Object.keys(source).length > 0) ops.push({ id, source, definition: pageOfUnit(node).definitionOf(node) });
  }
  return ops;
}

// Every change of units: conversions before placements, which may name a converted unit. `tables`:
// the tables' operations (tableChanges), asked for once by whoever collects the edits; `emptied`: the
// units that go (leaves).
const unitChanges = (layout, removal, tables, emptied) => [
  ...removedUnits(layout).map(removal), ...toggledUnits(layout), ...sizedUnits(layout), ...attributedUnits(layout), ...convertedUnits(layout), ...tables, ...dataChanges(layout), ...placedUnits(layout, emptied),
];

// A text block that went away with the unit around it (deleted, or converted: the conversion
// carries its text) is not a text edit of its own. Converted, an element stands for the unit
// (data-ge-convert), also when the layout knows that one as the unit's element (a unit an undo put
// back, converted before the commit putting it back was answered: model seed 5087, where the old
// text went as emptied with the conversion, and the file took the block out). `converted`: the
// page's elements by data-ge-convert (firstByAttribute).
const covered = (layout, id, converted) => {
  const unit = layout?.blockUnit.get(id);
  if (unit === null || unit === undefined) return false;
  return layout.elements.get(unit)?.isConnected === false || converted().has(String(unit));
};

/**
 * Save: turn the DOM into the edits the server expects. Deleted units (with `layout`, see
 * captureLayout) become `units: [{ id, remove: true }]`, and the text blocks inside them no edit
 * of their own; switched classes become `units: [{ id, toggle, on }]`, changed sizes
 * `[{ id, size, value }]`, set or removed attributes `[{ id, attribute, value }]`, converted units `[{ id, replace }]` or `[{ id, retag }]`
 * (convertedUnits), what a component wrote `[{ id, source, definition }]` (dataChanges), moved units `[{ id, move }]` and new blocks `[{ id, insert, place }]`
 * (placedUnits); other removed original blocks become empty `parts`. A new paragraph or list
 * item split off an original block is written with it (partOwner). `unplaced` lists new,
 * non-empty blocks that have no place (not a block of a box, next to no block that can take
 * them) and `blank` lists blocks emptied that must keep some text (a new disclosure's title
 * among them); the caller must not save while either is non-empty. `strays` lists the text blocks
 * holding structure their words cannot (strayIn), which `blank` holds back too, with the block of the
 * file a block split off one is written with.
 */
export function collectEdits(root, baselines, layout = null) {
  const edits = [];
  const unplaced = [];
  const blank = [];
  // The cells of a table whose rows or columns changed go with its operation (their text in it).
  const tables = tableChanges(layout, baselines);
  const restructured = new Set(tables.map((op) => op.id));
  const withTable = (id) => restructured.has(layout?.blockUnit.get(id));
  const edit = (id, parts) => { if (!withTable(id)) edits.push({ id, parts }); };
  // A code block not opened for editing (data-ge-code) is unchanged. Whether each block is on the
  // page is looked up in one index of the page (firstByAttribute), as nothing here changes it.
  const present = firstByAttribute(root, "data-ge-block", "data-ge-code");
  const converted = lazyIndex(layout?.root ?? root, "data-ge-convert"); // asked only for the blocks off the page
  for (const [id] of baselines) {
    if (!present.has(String(id)) && !covered(layout, id, converted)) edit(id, []);
  }
  // Text blocks holding structure their words cannot (strayHosts), changed or not: held back as blocks no
  // commit can carry yet (`blank`), whatever they are written with (a block split off one, the block made
  // on the page around one), never written emptied or taken out as emptied; `strays` names them (the
  // commits hold everything while there is one: page/commit.mjs).
  const strays = strayHosts(root);
  const strayed = new Set(strays);
  const stray = (node) => strayed.has(node);
  blank.push(...strays);
  const groups = new Map();
  const group = (element) => groups.get(element) ?? groups.set(element, { before: [], after: [] }).get(element);
  for (const node of root.querySelectorAll("[data-ge-new]:not([data-ge-unit])")) {
    if (inTable(node)) continue; // a new row or cell: its table's operation writes it
    const owner = partOwner(node);
    const parent = node.parentElement;
    // A block of a box is a block of its own (placedUnits), or part of a container made on the
    // page (nodeOf), as a new disclosure's title is; a block held by an item made on the page is
    // part of that item.
    const placed = (parent?.hasAttribute("data-ge-box") && (layout || parent.hasAttribute("data-ge-new")))
      || (isHeld(node) && parent?.tagName === "LI" && parent.hasAttribute("data-ge-new") && !parent.hasAttribute("data-ge-unit"));
    if (owner) group(owner.owner)[owner.where].push(node);
    else if (!owner && !placed && !partOf(node) && !isEmpty(node)) unplaced.push(node);
  }
  const emptied = new WeakSet([...root.querySelectorAll("[data-ge-unit][data-ge-block]")].filter((element) => {
    const id = Number(element.getAttribute("data-ge-block"));
    return baselines.has(id) && !groups.has(element) && isEmpty(element) && dropsWhenEmpty(element) && serializeInner(element) !== baselines.get(id) && !stray(element);
  }));
  // Parts a new block's component says the reader must fill before it is written (`blanks`: a row
  // of columns, one of which holds something).
  for (const block of root.querySelectorAll("[data-ge-new][data-ge-type]")) {
    const spec = BLOCK_TYPES[block.getAttribute("data-ge-type")];
    if (spec?.blanks) blank.push(...spec.blanks(block, { nodeOf: (node) => nodeOf(node, emptied), unitsOf }));
  }
  const part = (node) => {
    // Its class switches go with it (a new paragraph given a color: TOGGLES), as with a block made whole.
    const entry = { tag: node.tagName.toLowerCase(), html: serializeInner(node), ...switched(node, node.getAttribute("data-ge-unit-kind")) };
    madeFrom.set(entry, node);
    return entry;
  };
  for (const element of root.querySelectorAll("[data-ge-block]")) {
    const id = Number(element.getAttribute("data-ge-block"));
    if (!baselines.has(id)) continue;
    const { before = [], after = [] } = groups.get(element) ?? {};
    const html = serializeInner(element);
    const empty = isEmpty(element);
    // Spaces alone are written as nothing (`keep`), so they are no change of a block the file has empty.
    if ((html === baselines.get(id) || (empty && baselines.get(id) === "")) && before.length + after.length === 0) continue;
    // Its words, or those of a block split off it, holding structure no source holds: the file keeps
    // what it has, all of it waiting until the page holds words alone again (undo).
    if (stray(element) || [...before, ...after].some(stray)) {
      blank.push(element);
      continue;
    }
    if (empty && !removable(element) && !clearable(element)) blank.push(element);
    const keep = empty && dropsWhenEmpty(element) ? [] : [{ keep: true, html: empty ? "" : html }];
    edit(id, [...before.map(part), ...keep, ...after.map(part)]);
  }
  return { edits, units: unitChanges(layout, (id) => ({ id, remove: true }), tables, emptied), unplaced, blank, strays };
}

// ---------- moving nodes ----------

/** Move nodes before `reference` (null: to the end), keeping their state where the browser can. */
export function placeBefore(parent, nodes, reference) {
  for (const node of nodes) {
    if (node === reference) continue;
    try {
      if (typeof parent.moveBefore === "function" && node.isConnected && parent.isConnected) {
        parent.moveBefore(node, reference);
        continue;
      }
    } catch {}
    parent.insertBefore(node, reference);
  }
}

// ---------- plain text ----------

/** Readable text of block source: tags dropped, formulas shown as their TeX source. */
export function plainText(html, doc = globalThis.document) {
  const template = doc.createElement("template");
  template.innerHTML = html;
  return template.content.textContent.replace(/\s+/g, " ").trim();
}

/**
 * The text of the editable blocks in `element` (itself among them), one a line, an item's lists
 * apart from its own text: what the reader wrote there, closed disclosures included (innerText
 * leaves out what is not shown).
 */
export function blocksText(element) {
  const hosts = [element, ...element.querySelectorAll("[contenteditable='true']")].filter((node) => node.getAttribute?.("contenteditable") === "true");
  return hosts.map(ownText).filter(Boolean).join("\n");
}

/** A text block's own text: what the reader wrote in it, the blocks an item holds apart, on one line. */
export const ownText = (host) => [...host.childNodes].filter((node) => !(host.tagName === "LI" && isHeld(node))).map((node) => node.textContent).join("").replace(/\s+/g, " ").trim();
