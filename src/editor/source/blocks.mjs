import { parse } from "parse5";
import { HOSTS, IDENTITY } from "../components/registry.mjs";
import { FILES } from "../components/files.mjs";
import { CODE, MATH, MEDIA, PAGE, TABLE } from "../components/kit.mjs";
import { TAB } from "../components/paragraph/index.mjs";
import { COMPONENTS, componentOf, isInstance, matchesNode, partOf } from "../../shared/components/index.mjs";
import { texSource } from "../components/math/index.mjs";
import { MENTION, MENTION_ICON, MENTION_PAGE } from "../../shared/components/mention.mjs";
import { imageFile } from "../../shared/media.mjs";
import { isFileLink } from "../../shared/page-address.mjs";
import { isInkClass } from "../page/marks.mjs";
import { ownInline } from "../page/own.mjs";
import { BLOCK_LEVEL, hashOf } from "./html.mjs";
import { attr, hasClass } from "../../shared/html-tree.mjs";
import { currentCatalog } from "../../shared/component-catalog.mjs";
import { flowNode, heldBoxesOf, isComponent, scanUnits, trailingBlocks, unitKind } from "./units.mjs";

// Finding the text blocks of a report (docs/editor.md, "In-place text editing"): which elements are
// editable text (flow text, a title, code, a card's fields, cells, a disclosure's title, a Sheet tab,
// text of the report's own elements), what each may do (its capabilities), where its source starts and ends, and why a candidate stays read-only. scan() also finds the units
// (units.mjs) in the same pass. An inline element of the report's own (page/own.mjs: a badge, a
// citation) is an atom of the text block it stands in, kept as written.

const FLOW_TAGS = new Set(["h1", "h2", "h3", "h4", "p", "li"]);

const FIELD_TAGS = new Set(["h3", "h4", "p", "figcaption"]); // text children of a figure card

// The text blocks that are parts of a component: its description's parts edited as text (`edit:
// "text"`), each of the kind of text block that names it (HOSTS `parts`).
const TEXT_PARTS = Object.entries(HOSTS).flatMap(([kind, host]) => (host.parts ?? []).map(([id, name]) => {
  const component = componentOf(id);
  if (component?.parts?.[name]?.edit !== "text") throw new Error(`Host ${kind}: ${id} has no part ${name} edited as text`);
  return { kind, match: component.match, at: component.parts[name].at };
}));
const textPartsOf = (node) => TEXT_PARTS.filter(({ match }) => matchesNode(node, match)).flatMap(({ kind, at }) => partOf(node, at).map((part) => ({ kind, part })));
const inFileOrder = (parts) => parts.sort((a, b) => a.part.sourceCodeLocation.startOffset - b.part.sourceCodeLocation.startOffset);

// The kit's components whose drawing writes their parts (a database: its JSON and its table, edited as data):
// what stands in one is its drawing's to write, no text block of the document's, as an instance's own region is.
const WRITTEN_WHOLE = COMPONENTS.filter((component) => component.match && Object.values(component.parts ?? {}).some((part) => part.edit === "data")).map((component) => component.match).join(", ");

const INLINE_TAGS = new Set(["strong", "em", "b", "i", "u", "s", "code", "a", "br", "sup", "sub"]);

const LIST_WRAPPERS = new Set(["ul", "ol", "blockquote"]); // removed with their last block

// Text inside these is code, interactive UI or drawing, never an editable block.
const STOP = new Set([
  "pre", "summary", "button", "label", "select", "textarea", "form", "template", "script", "style",
  "svg", "math", "iframe", "object", "noscript", "canvas", "video", "audio",
]);

// Enter splits a block into a new sibling of this type (a heading into a paragraph).
export const NEW_SIBLING = { p: "p", h1: "p", h2: "p", h3: "p", h4: "p", li: "li" };

// What the reader may do with a block beyond changing its text:
//   split   Enter makes a new sibling block     remove  the block may be deleted
//   merge   joins a neighbouring block          empty   may be saved with no text (table cells)
//   plain   no format from the editor (the report title, mirrored in <title> and report.json, and
//           Sheet tab labels, which are buttons and are renamed through a small input: text alone;
//           the text of an inline element of the report's own: the markup the file gives it kept)
//   links   links may be added
// A block is bound when something refers to its element: another element (a link, ARIA, a dialog
// trigger) by its id, or the report's script by its id, a data-* attribute or its class
// (keepReferenced). Its attributes alone bind nothing (an id with nothing pointing at it is an
// anchor like any other), nor does data-block-id (IDENTITY), the block's identity. A bound block
// keeps its element: it still splits (the element keeps the first part) and takes the next block
// in, but does not go, nor merge into the one before.
// What each kind of text block can do is its component's (HOSTS: components/registry.mjs).
function capsOf(kind, tag, bound) {
  const host = HOSTS[kind];
  if (!host) throw new Error(`Unknown block kind ${kind}`);
  return host.caps({ bound, blockLevel: BLOCK_LEVEL.has(tag) });
}

const isAtom = (node) => node.tagName === "span" && matchesNode(node, MATH.inline);

// A link shown as its page's icon and title (图标视图, page/links/), or a page block, the same element
// with a document's address as a file writes it: <a class="doc-link-mention"> with nothing but its
// address, its icon first (a picture of the report's folder, or an empty <span> the kit draws in),
// then its title, text only. A whole, as a formula is: written back as it was. One left empty (the
// "/" menu's 链接 or 页面 given no address) is <a class="doc-link-mention"></a>, or with data-doc-page
// alone, which the kit shows to no reader. Written any other way, it locks its block, with a reason
// of its own: the form is what an Agent has to be told.
const isMention = (node) => node.tagName === "a" && hasClass(node, MENTION);
const WEB = /^https?:\/\/[^\s"<>]+$/i;
const names = (node) => node.attrs.map((entry) => entry.name).sort().join();
const leftEmpty = (node) => attr(node, "class") === MENTION && node.childNodes.length === 0 && (names(node) === "class" || (names(node) === `class,${MENTION_PAGE}` && attr(node, MENTION_PAGE) === ""));
function mentionProblem(node) {
  if (leftEmpty(node)) return null;
  if (names(node) !== "class,href" || attr(node, "class") !== MENTION || !(WEB.test(attr(node, "href")) || isFileLink(attr(node, "href")))) return "mention";
  const [icon, ...title] = node.childNodes;
  const drawn = icon?.tagName === "img"
    ? names(icon) === "alt,class,src" && attr(icon, "class") === MENTION_ICON && attr(icon, "alt") === "" && imageFile(attr(icon, "src"))
    : icon?.tagName === "span" && names(icon) === "class" && attr(icon, "class") === MENTION_ICON && icon.childNodes.length === 0;
  return drawn && title.length > 0 && title.every((child) => child.nodeName === "#text") && title.some((child) => child.value.trim()) ? null : "mention";
}

// Text color or highlight from the shared kit: a span with nothing but those classes.
const isInk = (node) => node.tagName === "span" && node.attrs.length === 1 && node.attrs[0].name === "class"
  && node.attrs[0].value.trim().split(/\s+/).every(isInkClass);

// Small text's end part (the page editor's Tab in 小字), at the line's right end: a span with that class alone.
const isTab = (node) => node.tagName === "span" && node.attrs.length === 1 && node.attrs[0].name === "class" && node.attrs[0].value === TAB;

const isInline = (node) => INLINE_TAGS.has(node.tagName) || isInk(node) || isTab(node);

const hasWords = (node) => (node.childNodes ?? []).some((child) => child.nodeName === "#text" ? child.value.trim() !== "" : hasWords(child));

// An inline element of the report's own (page/own.mjs): an atom, written back as it was.
const isOwn = (node) => ownInline(node.tagName, node.attrs, hasWords(node));

const isBound = (node) => node.attrs.some((entry) => entry.name === "id" || (entry.name.startsWith("data-") && entry.name !== IDENTITY));

const unsafeHref = (value) => /^(javascript|vbscript|data):/i.test(value.replace(/[\u0000- ]/g, ""));

// What a text block of `kind` (its element's `tag`, its `caps` when known) holds besides words:
// false, the editor's inline markup and atoms (any text block); true, nothing (the report's title,
// code, TeX, a Sheet tab's label); "atoms", nothing the editor makes, each element in it an atom kept
// as written (the text of an inline element of the report's own, plain: a word in <i>, a drawn
// swatch, <span><i class="dot"></i>words</span>). The page reads the same (core.mjs prepareBlock).
export const inlineMode = (kind, tag, caps = {}) => kind === "text" ? (BLOCK_LEVEL.has(tag) ? false : "atoms")
  : kind === "title" || kind === "code" || kind === "codeTitle" || kind === "tex" || Boolean(caps.plain);

// A block may contain only text, allowlisted inline tags, the kit's color spans, and inline formulas,
// links shown with their icon and inline elements of the report's own (atoms, written back verbatim).
// Anything else (comments, block or interactive tags, implied end tags, event handlers...) makes it
// read-only, so content can never be dropped silently. `known(location)`: whether an inline element
// of the report's own at that place is one the file has (a commit's text is checked so: the page
// writes each back as it was, and nothing else); none given, any. `cell`: a table cell's text, which
// holds lists (单元格里的列表) and pictures too (cellPictureProblem), a picture anywhere in it (in a
// link, a mark, a list's item). Returns the reason, or null.
export function inlineProblem(node, atoms, plain = false, { cell = false, pictures = cell, known = null } = {}) {
  for (const child of node.childNodes) {
    if (child.nodeName === "#text") continue;
    if (!child.tagName) return "comment";
    if (plain === true) return `tag:${child.tagName}`;
    if (child.attrs.some((entry) => /^on/i.test(entry.name))) return "markup";
    if (plain === "atoms") {
      if (!child.sourceCodeLocation?.endTag && child.tagName !== "br") return "markup";
      if (known && !known(child.sourceCodeLocation)) return `tag:${child.tagName}`;
      atoms.push(child.sourceCodeLocation);
      continue;
    }
    if (cell && (child.tagName === "ul" || child.tagName === "ol")) {
      const problem = listProblem(child, atoms, known);
      if (problem) return problem;
      continue;
    }
    if (pictures && child.tagName === "img") {
      if (cellPictureProblem(child)) return "picture";
      continue;
    }
    if (isAtom(child)) {
      if (child.childNodes.some((inner) => inner.nodeName !== "#text")) return "markup";
      atoms.push(child.sourceCodeLocation);
      continue;
    }
    if (isMention(child)) {
      const problem = mentionProblem(child);
      if (problem) return problem;
      atoms.push(child.sourceCodeLocation);
      continue;
    }
    if (isOwn(child)) {
      if (!child.sourceCodeLocation?.endTag) return "markup";
      if (known && !known(child.sourceCodeLocation)) return `tag:${child.tagName}`;
      atoms.push(child.sourceCodeLocation);
      continue;
    }
    if (!isInline(child)) return `tag:${child.tagName}`;
    if (child.tagName !== "br" && !child.sourceCodeLocation?.endTag) return "markup";
    if (child.tagName === "a" && unsafeHref(attr(child, "href") ?? "")) return "link";
    const inner = inlineProblem(child, atoms, false, { known, pictures });
    if (inner) return inner;
  }
  return null;
}

// A picture in a table cell's text (单元格里的图片: no image block, a light one amid the words): an <img>
// of a picture of the report's folder (src="assets/<file>"), its alt words and its width in pixels at
// most (width="120"; none: the kit's own size), no other attribute. A whole, as a line break is: the
// page writes it back from its element (core.mjs serializeNode), its width the one a drag of its edge
// set (page/table/pictures.mjs). Any other <img> in a cell locks the cell (reason "picture"). Null, or
// what is wrong with it.
export const CELL_PICTURE_ATTRIBUTES = ["src", "alt", "width"];
const PICTURE_WIDTH = /^[1-9]\d{0,3}$/; // pixels, 1 to 9999
export function cellPictureProblem(node) {
  const names = node.attrs.map((entry) => entry.name);
  const other = names.find((name) => !CELL_PICTURE_ATTRIBUTES.includes(name));
  if (other) return `the attribute ${other}`;
  const src = attr(node, "src");
  if (!imageFile(src)) return `its src (${src === undefined ? "none" : src.slice(0, 80)}): no picture of the document's assets/ folder`;
  const width = attr(node, "width");
  return width === undefined || PICTURE_WIDTH.test(width) ? null : `its width (${width}): a whole number of pixels`;
}

// A list in a table cell (单元格里的列表: part of the cell's text, `cell` above): no attributes,
// explicit items alone (blank text between them), each of inline content (no list in it).
function listProblem(list, atoms, known) {
  if (list.attrs.length > 0 || !list.sourceCodeLocation?.endTag) return "markup";
  for (const item of list.childNodes) {
    if (item.nodeName === "#text" && !item.value.trim()) continue;
    if (item.tagName !== "li") return `tag:${item.tagName ?? "text"}`;
    if (item.attrs.length > 0 || !item.sourceCodeLocation?.endTag) return "markup";
    const problem = inlineProblem(item, atoms, false, { known, pictures: true });
    if (problem) return problem;
  }
  return null;
}

export function scan(source) {
  const blocks = [];
  const locks = [];
  const byNode = new Map();
  let packages = null; // the workspace's component packages, asked for at the first instance of a page

  // Returns true when the node became a block; otherwise records why it stays read-only. `until`:
  // the first of the lists a list item holds after its text, where its text block ends. A kind no
  // component defines is no text block: what a file holds of a component that is gone stays as written.
  const candidate = (node, kind, until = null) => {
    const location = node.sourceCodeLocation;
    if (!HOSTS[kind] || !location?.startTag || attr(node, "contenteditable") !== undefined) return false;
    const atoms = [];
    const plain = inlineMode(kind, node.tagName);
    const own = until ? { childNodes: node.childNodes.slice(0, node.childNodes.indexOf(until)) } : node;
    const problem = !location.endTag ? "markup"
      : inlineProblem(own, atoms, plain, { cell: kind === "cell" }); // a cell's sort key follows its text (apply.mjs sortKey)
    if (problem) {
      locks.push({ at: location.startTag.endOffset - 1, reason: problem });
      return false;
    }
    const innerStart = location.startTag.endOffset;
    // An item's text ends before its lists, without the line break and indentation ahead of them.
    const innerEnd = until ? innerStart + source.slice(innerStart, until.sourceCodeLocation.startOffset).replace(/[ \t\r\n\f]+$/, "").length : location.endTag.startOffset;
    const block = {
      id: blocks.length,
      tag: node.tagName,
      kind,
      bound: false, // and caps: once the references are known (below)
      caps: {},
      start: location.startOffset,
      end: location.endOffset,
      innerStart,
      innerEnd,
      atoms: atoms.map((atom) => [atom.startOffset - innerStart, atom.endOffset - innerStart]),
      wrapper: null,
      nested: Boolean(until), // a list item holding blocks: its text block is only its text
      node,
    };
    blocks.push(block);
    byNode.set(node, block);
    return true;
  };

  const elements = (node) => (node.childNodes ?? []).filter((child) => child.tagName);
  // An element's source between its tags, as written (entities and all).
  const rawInner = (node) => {
    const location = node.sourceCodeLocation;
    return location?.startTag && location.endTag ? source.slice(location.startTag.endOffset, location.endTag.startOffset) : null;
  };
  // An element of the report's own holding text and nothing but inline markup (a footer, a label
  // in a widget). Not a link, and not one a script may hook into (id, data-*): scripts rewrite
  // such text. One holding an inline element of the report's own with words in it (a step's title
  // in a <b> and its description in a <span>) is walked into instead, so those words are a text
  // block of their own rather than an atom of it; one with no words (a drawn arrow) is its atom.
  const textLeaf = (node) => node.tagName !== "a" && !isBound(node) && hasWords(node)
    && elements(node).every((inner) => isOwn(inner) ? !hasWords(inner) : isInline(inner) || isAtom(inner));

  const table = (node) => {
    for (const child of elements(node)) {
      if (child.tagName === "td" || child.tagName === "th") candidate(child, "cell");
      else if (["thead", "tbody", "tfoot", "tr"].includes(child.tagName)) table(child);
    }
  };

  // Inside a component only tables are searched (for cells); everything else is its own UI.
  const component = (node) => {
    for (const child of elements(node)) {
      if (child.tagName === "table") table(child);
      else if (!STOP.has(child.tagName) && !isInstance(child)) component(child);
    }
  };

  // A code block's text: its one `code` element, or the `pre` itself; plain text only.
  const codeBlock = (pre) => {
    const kids = elements(pre);
    if (kids.length === 1 && kids[0].tagName === "code" && pre.childNodes.every((child) => child.tagName || !child.value?.trim())) candidate(kids[0], "code");
    else if (kids.length === 0) candidate(pre, "code");
    else if (pre.sourceCodeLocation?.startTag) locks.push({ at: pre.sourceCodeLocation.startTag.endOffset - 1, reason: "markup" });
  };

  // `own`: text of the report's own elements counts too (textLeaf); not inside the kit's
  // components, whose labels are their UI, nor inside text that stays read-only.
  const flow = (node, own = true) => {
    for (const child of elements(node)) {
      const tag = child.tagName;
      // The parts of a component that are text blocks of their own (a code block's title, a disclosure's
      // title, a Sheet's tabs, a media block's caption), as its description says.
      // Of an instance of a component package, those its manifest declares: all else in it is the component's.
      // What its slots hold is the document's: blocks as in any flow, each of its own unit.
      const instance = isInstance(child);
      for (const { kind, part } of inFileOrder(instance ? FILES[unitKind(child)].textParts(child, packages ??= currentCatalog().packages) : textPartsOf(child))) candidate(part, kind);
      if (instance) {
        for (const { element } of heldBoxesOf(child)) flow(element, own);
        continue;
      }
      // A database: its drawing's, none of its words a text block, but for its records' bodies (the boxes its
      // file says: the document's blocks, as in an instance's slots).
      if (WRITTEN_WHOLE && matchesNode(child, WRITTEN_WHOLE)) {
        for (const { element } of FILES[unitKind(child)]?.boxes ? heldBoxesOf(child) : []) flow(element, own);
        continue;
      }
      // A code block: its title (above) and its code (plain text).
      if (tag === "div" && matchesNode(child, CODE.match)) {
        for (const part of elements(child)) if (part.tagName === "pre" && attr(part, "contenteditable") === undefined) codeBlock(part);
        continue;
      }
      if (STOP.has(tag) || attr(child, "contenteditable") !== undefined) continue; // the report's own input areas
      if (tag === "table") table(child);
      else if (tag === "figure") {
        const media = matchesNode(child, MEDIA);
        for (const part of elements(child)) {
          if (media && part.tagName === "figcaption") continue; // a media block's caption: a text part (above)
          if (FIELD_TAGS.has(part.tagName)) candidate(part, "field");
          else if (part.tagName === "table") table(part);
          else if (STOP.has(part.tagName)) continue;
          else if (isInstance(part)) flow({ childNodes: [part] }, own);
          else if (media || isComponent(part) || isBound(part)) component(part); // a chart, or a host a script may draw in (id, data-*)
          else flow({ childNodes: [part] }, own); // a drawing of the report's own (step cards, boxes and their labels): its words its elements' text
        }
      } else if (tag === "details") {
        for (const part of elements(child)) {
          if (isInstance(part)) flow({ childNodes: [part] }, own);
          else if (part.tagName !== "summary") flow(part, own); // its title is a text part (above)
        }
      } else if (tag === "h1" && (node.tagName === "header" || matchesNode(child, PAGE.title))) {
        candidate(child, "title"); // the report's title, mirrored in <title> and report.json
      } else if (tag === "li" && flowNode(child)) {
        flow({ childNodes: elements(child) }, own); // a flowchart's step written as a node: its blocks (its title a paragraph), no text of its own
      } else if (FLOW_TAGS.has(tag)) {
        // A list item holding blocks after its text (lists, paragraphs, images…): its text is a
        // block, and what they hold is walked as a flow's (a list's items, a paragraph, a figure's caption).
        const held = tag === "li" ? trailingBlocks(child) : [];
        if (held?.length > 0) {
          candidate(child, "flow", held[0]);
          flow({ childNodes: held }, own);
        } else if (!candidate(child, "flow")) flow(child, false); // e.g. an <li> with a list amid its text: its inner items stay editable
      } else if (tag === "div" && matchesNode(child, MATH.block) && elements(child).length === 0 && texSource(rawInner(child))) {
        candidate(child, "tex"); // a display formula: its TeX alone (components/math/)
      } else if (tag === "div" && matchesNode(child, TABLE.lead)) {
        for (const part of elements(child)) if (part.tagName === "span") candidate(part, "field");
      } else if (own && !isComponent(child) && textLeaf(child)) {
        candidate(child, "text");
      } else {
        flow(child, own && !isComponent(child));
        if (LIST_WRAPPERS.has(tag)) wrap(child);
      }
    }
  };

  // A list or quote made only of blocks goes away with its last block instead of staying empty.
  const wrap = (node) => {
    const location = node.sourceCodeLocation;
    const members = elements(node).map((child) => byNode.get(child));
    const onlyBlocks = members.length > 0 && members.every(Boolean)
      && node.childNodes.every((child) => child.tagName || (child.nodeName === "#text" && !child.value.trim()));
    if (!onlyBlocks || !location?.endTag) return;
    const wrapper = { start: location.startOffset, end: location.endOffset, ids: members.map((block) => block.id) };
    members.forEach((block) => (block.wrapper = wrapper));
  };

  const outside = (node) => {
    for (const child of elements(node)) (child.tagName === "main" ? flow : outside)(child);
  };
  const document = parse(source, { sourceCodeLocationInfo: true });
  outside(document);
  const { units, boxes, referenced } = scanUnits(document, source);
  // A unit the page's tools for its rows and cells are for (a table written as the kit writes one: files.mjs `plain`).
  for (const unit of units) unit.grid = Boolean(FILES[unit.kind]?.plain?.(unit.node));
  // What its component writes, part by part, as hashes of what the file holds (an instance's data parts:
  // files.mjs `dataOf`), which a write of a part is held to where someone else changed the rest of the
  // unit (source/commit.mjs).
  for (const unit of units) {
    const data = FILES[unit.kind]?.dataOf?.(source, unit.node, packages ??= currentCatalog().packages);
    if (data) unit.parts = Object.fromEntries(Object.entries(data).map(([name, inside]) => [name, hashOf(inside)]));
  }
  // Each text block belongs to the innermost unit around it (`self` when it is that unit); a
  // table's scope line counts as part of the table.
  for (const block of blocks) {
    let inner = null;
    for (const unit of units) {
      if (unit.start <= block.start && block.start < unit.end && (!inner || unit.start > inner.start)) inner = unit;
    }
    block.unit = inner?.id ?? null;
    block.self = inner && inner.at === block.innerStart - 1 ? inner.id : null;
    if (block.self !== null) inner.text = block.id; // the unit is this text block
    block.path = inner && block.self === null ? pathIn(inner, block.node) : null;
    // A paragraph, a heading or an item inside a whole block (the report's own, or one of the kit's:
    // a filter's items) or a card's drawing, no unit of its own: words only (the `text` host, as
    // a text leaf there is), fixed in place but never split, joined or taken out on its own, nor
    // turned into another block; its element goes with its block (docs/editor.md, "Editable blocks").
    // With no component to define that host it stays the text block it was found to be.
    if (HOSTS.text && block.kind === "flow" && block.self === null && (inner?.kind === "block" || inner?.kind === "figure")) block.kind = "text";
    block.bound = referenced(block.node) !== null;
    block.caps = Object.fromEntries(capsOf(block.kind, block.tag, block.bound).map((cap) => [cap, true]));
  }
  return { blocks, locks, units, boxes };
}

// Where a text block sits in the unit it belongs to, when it is not the unit itself (a card's
// title, a cell, a section's title): which of the unit's elements it is under ("unit", or the
// table's scope line, "lead"), then the element steps down to it, each [tag, index among the
// parent's children of that tag, how many of them there are]. Found again in a changed file, the
// counts tell whether the structure around it stayed the same (commitEdits).
function pathIn(unit, node) {
  const steps = [];
  let at = node;
  for (; at && !unit.nodes.includes(at); at = at.parentNode) {
    const same = (at.parentNode?.childNodes ?? []).filter((child) => child.tagName === at.tagName);
    steps.unshift([at.tagName, same.indexOf(at), same.length]);
  }
  if (!at) return null;
  return [at === unit.node ? "unit" : at === unit.nodes[0] && unit.lead !== null ? "lead" : "panel", ...steps];
}

export const findBlocks = (source) => scan(source).blocks;

export function findUnits(source) {
  const { units, boxes } = scan(source);
  return { units, boxes };
}
