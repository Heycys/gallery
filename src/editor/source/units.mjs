import { ATTRIBUTES, BOX_CLASSES, COMPONENT_ATTRIBUTES, COMPONENT_CLASSES, GROUPING, IDENTITY, TOGGLES, UNIT_KINDS } from "../components/registry.mjs";
import { blank, BLOCK_LEVEL, findElement, hashOf } from "./html.mjs";
import { attr, hasClass } from "../../shared/html-tree.mjs";
import { idsNamed } from "../../shared/copy-ids.mjs";
import { DIALOG, PAGE, SECTION, SHEETS, TABLE } from "../components/kit.mjs";
import { matchesNode, partOf } from "../../shared/components/index.mjs";
import { currentCatalog } from "../../shared/component-catalog.mjs";
import { FILES } from "../components/files.mjs";
import { FLOW, HELD_TAGS } from "../components/list/index.mjs";

// ---------- units: the blocks the reader can select and delete ----------
// Units are the element children of boxes: main, Sheet panels, sections, highlight panels (the
// opening summary is one), callouts, plain (class-less) divs grouping blocks in a flow, rows of columns and
// their columns, class-less lists and quotes, a flowchart's steps written as nodes (flowNode),
// disclosure and dialog contents, and the report's header
// (the lines under its title; the title itself is no unit: it is the report's name). Components (cards, tables, code, formulas,
// disclosures) and anything with a class of its own (a report widget) are units whose
// inside is not; their text stays editable. A unit's range
// takes along the comments on the lines right above it and, for a table, the .doc-table-meta
// line above it (its lead). A box is pure when it holds nothing but units: emptied, it may go too.
// A unit that the report's script or other elements refer to (by id, data-* attribute or class)
// is kept: deleting it would break the script or a link.

const BOX_TAGS = new Set(["section", "div", "blockquote", "ul", "ol", "aside", "article"]);

// Never units themselves: page furniture, scripts, dialogs (their content is a box of its own),
// form controls, and what only exists inside other elements.
const NOT_UNITS = new Set([
  "script", "style", "template", "noscript", "link", "meta", "header", "dialog", "form", "fieldset", "label",
  "input", "select", "textarea", "button", "summary", "main", "caption", "dd", "dt", "tbody", "thead", "tfoot",
  "tr", "td", "th", "figcaption",
]);

const MEDIA = new Set(["img", "picture", "svg", "canvas", "video", "audio", "iframe", "object"]);

export const VOID_UNITS = new Set(["hr", "img"]);

const CONTROLS = new Set(["label", "input", "select", "textarea", "button"]);

// The kit's components, containers and unit kinds: src/editor/components/ (registry.mjs).
export const isComponent = (node) => COMPONENT_CLASSES.some((name) => hasClass(node, name)) || COMPONENT_ATTRIBUTES.some((name) => attr(node, name) !== undefined);

// The blocks a list item holds after its text (<li>text<p>…</p><ul>…</ul></li>: lists, and any
// other block, components/list/ HELD_TAGS): [] for none, null when text or inline markup follows
// one (the item stays read-only).
export function trailingBlocks(node) {
  const kids = node.childNodes ?? [];
  const first = kids.findIndex((child) => HELD_TAGS.has(child.tagName));
  if (first < 0) return [];
  const rest = kids.slice(first);
  return rest.every((child) => HELD_TAGS.has(child.tagName) || blank(child)) ? rest.filter((child) => child.tagName) : null;
}

/**
 * Whether a list item is a flowchart's step written as a node (an li of an ol.doc-flow holding
 * blocks alone, no words of its own: its icon first maybe, its title a paragraph): a box of kind
 * "node" whose blocks are its units, and no text block of its own. A step written the short way (its
 * own words first, which natural HTML rewrites before a page shows it: natural.mjs) is still read as
 * a list item holding blocks after its text, and so is an empty one.
 */
export function flowNode(node) {
  return node.tagName === "li" && node.parentNode?.tagName === "ol" && hasClass(node.parentNode, FLOW)
    && node.childNodes.some((child) => child.tagName)
    && node.childNodes.every((child) => (child.tagName ? HELD_TAGS.has(child.tagName) : child.nodeName !== "#text" || !child.value.trim()));
}

function isUnitElement(node) {
  const tag = node.tagName;
  const location = node.sourceCodeLocation;
  if (NOT_UNITS.has(tag) || !(BLOCK_LEVEL.has(tag) || MEDIA.has(tag))) return false;
  if (attr(node, "contenteditable") !== undefined) return false;
  return Boolean(location?.startTag && (location.endTag || VOID_UNITS.has(tag)));
}

// What kind of box an element is, or null when its children are not units (a component, a
// paragraph-like div with inline content, a widget holding form controls).
// The kit's containers, by class. Any other class makes an element a component of its own (a
// report widget, say): it moves and goes as one block, and nothing is put into or taken out of it.

/**
 * The boxes a unit of `kind` holds that its type's file says (`boxes` of components/files.mjs: an
 * instance's slots, by the marks of its markup, which no class or tag of the kit's tells): [{ element,
 * kind, key }], those that hold blocks, or nothing (an empty one takes blocks, as a Sheet panel does).
 * One holding words or inline markup straight in it is none: its words stay read-only, which
 * readOnlyTexts says.
 */
export const heldBoxesOf = (node, kind = unitKind(node)) => (FILES[kind]?.boxes?.(node, currentCatalog().packages) ?? [])
  .filter(({ element }) => holdsBlocks(element) || (element.sourceCodeLocation?.endTag && element.childNodes.every(blank)));

// Block-level children only: no text of its own, no form controls, no inline elements.
function holdsBlocks(node) {
  if (!node.childNodes.every((child) => child.nodeName !== "#text" || !child.value.trim())) return false;
  const kids = node.childNodes.filter((child) => child.tagName);
  return kids.length > 0 && !kids.some((kid) => CONTROLS.has(kid.tagName) || !(BLOCK_LEVEL.has(kid.tagName) || MEDIA.has(kid.tagName) || NOT_UNITS.has(kid.tagName)));
}

// What kind of box an element is, inside a box of `parent` kind, or null when its children are
// not units of their own (a component, a report widget, text with inline content).
export function boxKind(node, parent = null) {
  const tag = node.tagName;
  if (!BOX_TAGS.has(tag) || isComponent(node) || attr(node, "contenteditable") !== undefined) return null;
  const classes = (attr(node, "class") ?? "").split(/\s+/).filter(Boolean);
  const kids = node.childNodes.filter((child) => child.tagName);
  // A list with no items left still takes them, as the kit's containers do (below). Of classes, a
  // list has only its kind's own (a to-do list's): any other makes it a component of its own. A
  // flowchart (ol.doc-flow, nothing else of a class) is a box of its steps (components/flowchart/).
  const items = () => kids.every((kid) => kid.tagName === "li") && node.childNodes.every((child) => child.tagName || !child.value?.trim());
  if (tag === "ol" && classes.includes(FLOW)) return classes.every((name) => name === FLOW) && items() ? "flowchart" : null;
  if (tag === "ul" || tag === "ol") {
    return classes.every((name) => (TOGGLES.list ?? []).includes(name)) && items() ? "list" : null;
  }
  // A section is a chapter: form controls or other non-blocks in it only stay where they are. The
  // kit's (section.doc-section) takes blocks even when it has none left, as its other containers
  // do: its last paragraph gone, what the reader writes next still goes in.
  const textless = node.childNodes.every((child) => child.nodeName !== "#text" || !child.value.trim());
  const kitSection = matchesNode(node, SECTION.match);
  if (tag === "section" && (classes.length === 0 || kitSection)) return textless && (kids.length > 0 || kitSection) ? "section" : null;
  const kit = BOX_CLASSES.find(([name]) => classes.includes(name))?.[1];
  if (kit && textless && kids.length === 0) return kit; // an empty one of the kit's containers still takes blocks
  if (!holdsBlocks(node)) return null;
  if (kit) return kit;
  if (classes.length > 0) return null;
  if (tag === "blockquote") return "quote";
  // A plain <div> (no class) groups blocks in the flows the descriptions say (`groups`: the same as "body
  // text in flows" in the kit's styles/flow.css, which styles the text blocks of such a div only there).
  return GROUPING.has(parent) ? "plain" : null;
}

// The attributes a unit converted in place carries over, as the file writes them: all but its class
// (which tells its type) and its id; `leaves(name, value)`: others it leaves behind.
export const carriedOf = (source, node, leaves = () => false) => Object.entries(node.sourceCodeLocation.attrs ?? {})
  .filter(([name]) => name !== "class" && name !== IDENTITY && !leaves(name, attr(node, name)))
  .sort((a, b) => a[1].startOffset - b[1].startOffset).map(([, at]) => ` ${source.slice(at.startOffset, at.endOffset)}`).join("");

// What kind of unit an element is (registry.mjs UNIT_KINDS: its tag, class and attribute, and the
// element it stands in, `parent`: a flowchart's step is an li of an ol.doc-flow). `parent` the
// element it stands in, or one standing for the box it is to go into (a unit put back: kindIn).
export function unitKind(node, parent = node.parentNode) {
  const is = (element, tag, name) => (!tag || [tag].flat().includes(element?.tagName)) && (!name || hasClass(element, name));
  const rule = UNIT_KINDS.find(({ tag, class: name, attr: attribute, parent: around }) => is(node, tag, name)
    && (!attribute || attr(node, attribute) !== undefined) && (!around || (parent?.tagName && is(parent, around.tag, around.class))));
  return rule?.kind ?? "block";
}

// The element a box of each kind is, as a unit's `parent` sees it, for the kinds whose units are told
// apart by it: a flowchart's (its steps are steps, an li anywhere else an item).
const BOX_ELEMENTS = { flowchart: { tagName: "ol", attrs: [{ name: "class", value: FLOW }] } };

/** The kind of unit an element is once it stands in a box of `boxKind` (an element put back by undo, read from its source alone). */
export const kindIn = (node, boxKind) => unitKind(node, BOX_ELEMENTS[boxKind] ?? null);

export function scanUnits(document, source) {
  const units = [];
  const boxes = [];
  const siblings = (node) => node.parentNode.childNodes;
  const before = (node) => siblings(node)[siblings(node).indexOf(node) - 1] ?? null;
  const startsLine = (offset) => /^[ \t]*$/.test(source.slice(source.lastIndexOf("\n", offset - 1) + 1, offset));
  // The previous element sibling when only whitespace lies between.
  const adjacentBefore = (node) => {
    let previous = before(node);
    while (previous && blank(previous)) previous = before(previous);
    return previous?.tagName ? previous : null;
  };

  // A table's scope line right above it goes wherever the table goes.
  const leadOf = (node) => {
    if (!matchesNode(node, TABLE.frame)) return null;
    const previous = adjacentBefore(node);
    return previous && matchesNode(previous, TABLE.lead) && previous.sourceCodeLocation?.endTag ? previous : null;
  };

  // Where an element's range starts: comments on their own lines right above it (no blank line
  // between) belong to it.
  const ownStart = (node, owned) => {
    let start = node.sourceCodeLocation.startOffset;
    for (let gap = before(node); gap;) {
      if (blank(gap) && (gap.value.match(/\n/g)?.length ?? 0) <= 1) gap = before(gap);
      else if (gap.nodeName === "#comment" && gap.sourceCodeLocation && startsLine(gap.sourceCodeLocation.startOffset)) {
        owned.add(gap);
        start = gap.sourceCodeLocation.startOffset;
        gap = before(gap);
      } else break;
    }
    return start;
  };

  const addUnit = (node, box, parent, owned) => {
    const location = node.sourceCodeLocation;
    const lead = leadOf(node);
    const classAttr = location.attrs?.class;
    const unit = {
      id: units.length,
      tag: node.tagName,
      kind: unitKind(node),
      box: box.id,
      parent: parent?.id ?? null,
      start: ownStart(lead ?? node, owned),
      end: location.endOffset,
      elStart: location.startOffset,
      at: location.startTag.endOffset - 1,
      lead: lead ? lead.sourceCodeLocation.startTag.endOffset - 1 : null,
      classAttr: classAttr ? { start: classAttr.startOffset, end: classAttr.endOffset, value: attr(node, "class") } : null,
      attrs: node.attrs.map(({ name, value }) => ({ name, value })),
      blockId: attr(node, IDENTITY) ?? null,
      // What it carries to another type: not what its own kind sets (a to-do item's checked state).
      carried: carriedOf(source, node, (name) => Boolean(ATTRIBUTES[unitKind(node)]?.[name])),
      blockIdAttr: location.attrs?.[IDENTITY] ? { start: location.attrs[IDENTITY].startOffset, end: location.attrs[IDENTITY].endOffset } : null,
      companion: null, // a Sheet tab's panel, elsewhere in the file, goes with the tab
      keep: null,
      node,
      nodes: lead ? [lead, node] : [node],
    };
    units.push(unit);
    if (lead) owned.add(lead);
    return unit;
  };

  // A box: where it starts (the ">" of its start tag) and ends (its end tag), and what tells it
  // apart from other boxes of the same unit (a Sheet panel's key, a dialog's id).
  const boxAt = (node, kind, parent, key = null) => {
    const location = node.sourceCodeLocation;
    const box = { id: boxes.length, kind, unit: parent?.id ?? null, key, at: location.startTag.endOffset - 1, innerEnd: location.endTag?.startOffset ?? null, pure: true };
    boxes.push(box);
    return box;
  };

  // A Sheet's tab row: each tab is a unit that takes its panel along.
  const walkTabs = (row, parent, panels) => {
    const box = boxAt(row, "tabs", parent);
    const owned = new Set();
    for (const child of row.childNodes) {
      if (!child.tagName) {
        if (child.nodeName === "#text" && child.value.trim()) box.pure = false;
        continue;
      }
      const key = attr(child, SHEETS.tabKey);
      const panel = key && panels.find((candidate) => attr(candidate, SHEETS.panelKey) === key);
      if (child.tagName !== "button" || !matchesNode(child, SHEETS.tab) || !panel?.sourceCodeLocation?.endTag || !child.sourceCodeLocation?.endTag) {
        box.pure = false;
        continue;
      }
      const unit = addUnit(child, box, parent, owned);
      unit.kind = "tab";
      unit.key = key;
      const location = panel.sourceCodeLocation;
      unit.companion = { tag: panel.tagName, start: ownStart(panel, new Set()), end: location.endOffset, elStart: location.startOffset };
      unit.nodes.push(panel);
    }
    // A comment ahead of a later tab is only known to be owned once that tab is reached.
    for (const child of row.childNodes) if (child.nodeName === "#comment" && !owned.has(child)) box.pure = false;
  };

  const walkBox = (node, kind, parent, key = null) => {
    const box = boxAt(node, kind, parent, key);
    const owned = new Set(); // leads and comments that belong to a unit
    const kids = node.childNodes.filter((child) => child.tagName);
    kids.forEach((child, index) => {
      if (kids[index + 1] && leadOf(kids[index + 1]) === child) return; // taken along by the table below
      const reportTitle = kind === "header" && child.tagName === "h1";
      if (reportTitle || !isUnitElement(child)) {
        box.pure = false;
        if (child.tagName === "dialog") dialog(child, parent);
        if (kind === "main" && matchesNode(child, PAGE.header) && child.sourceCodeLocation?.endTag) walkBox(child, "header", null);
        return;
      }
      descend(child, addUnit(child, box, parent, owned), kind);
    });
    for (const child of node.childNodes) {
      if (child.nodeName === "#text" ? child.value.trim() : !child.tagName && !owned.has(child)) box.pure = false;
    }
  };

  // Into a unit that holds blocks of its own; `parent` is the kind of the box the unit sits in.
  const descend = (node, unit, parent) => {
    if (unit.kind === "sheets") {
      const panels = partOf(node, SHEETS.panels);
      const [row] = partOf(node, SHEETS.row);
      if (row) walkTabs(row, unit, panels);
      // An empty panel (a tab just added, or emptied) is a box too: blocks go into it.
      for (const panel of panels) if (holdsBlocks(panel) || (panel.sourceCodeLocation?.endTag && panel.childNodes.every(blank))) walkBox(panel, "panel", unit, attr(panel, SHEETS.panelKey));
    } else if (node.tagName === "details") {
      for (const part of node.childNodes) if (part.tagName && boxKind(part) === "details") walkBox(part, "details", unit);
    } else if (node.tagName === "li" && flowNode(node)) {
      walkBox(node, "node", unit); // a flowchart's step: its blocks, its title among them
    } else if (node.tagName === "li") {
      items.push([node, unit]); // after everything else, so that the other boxes keep their numbers
    } else {
      const kind = boxKind(node, parent);
      if (kind) walkBox(node, kind, unit);
      // What its type's file says it holds besides (an instance's slots, the rest of it its component's).
      for (const box of FILES[unit.kind]?.boxes ? heldBoxesOf(node, unit.kind) : []) walkBox(box.element, box.kind, unit, box.key);
    }
  };

  const dialog = (node, parent) => {
    const [content] = partOf(node, DIALOG.content);
    if (content && boxKind(content) === "dialog") walkBox(content, "dialog", parent, attr(node, "id") ?? null);
  };

  // After its text a list item holds blocks (units of a box of its own, "nest"), or may be given some.
  const items = [];
  const nest = (node, unit) => {
    const held = trailingBlocks(node);
    if (held === null || !node.sourceCodeLocation?.endTag) return;
    const box = boxAt(node, "nest", unit);
    box.pure = false;
    unit.nested = held.length > 0;
    const owned = new Set();
    for (const block of held) if (isUnitElement(block)) descend(block, addUnit(block, box, unit, owned), "nest");
  };

  const main = findElement(document, "main");
  if (main?.sourceCodeLocation?.startTag) walkBox(main, "main", null);
  for (let index = 0; index < items.length; index++) nest(...items[index]); // nested items join the queue
  const referenced = keepReferenced(document, units);
  return { units, boxes, referenced };
}

// Whether a <script> of this type runs (HTML's rule: none, empty, "module" or a JavaScript MIME
// type); any other type is a data block (application/json, text/plain, a template's text).
const isCode = (type) => type === undefined || /^\s*(?:module|(?:text|application)\/(?:x-)?(?:javascript|ecmascript)|text\/javascript1\.[0-5]|text\/(?:jscript|livescript))?\s*$/i.test(type);

/**
 * What `code` (JavaScript) can select an element by class with (found testing the skill with Agents,
 * 2026-10-28): `names`, the
 * quoted names a class API is given (classList.add/remove/toggle/contains/replace, d3's .classed,
 * getElementsByClassName, className compared or set or read with includes/indexOf/startsWith/
 * endsWith or split(…).includes/indexOf, jQuery's hasClass/addClass/removeClass/toggleClass, a
 * selector's [class~=name]), and, when the code builds a selector or a class API's argument from a
 * variable ("." + cls, `.${c}`, classList.toggle(cls)), every quoted string that is one name alone
 * (the name it may be built from); `partial`, the values of a selector's [class*=…], [class^=…],
 * [class$=…], which a name inside them matches; and `selectors`, its string literals' text (a
 * template's too, not its ${…}), where a selector names `.name` (querySelector(".grid i.lo"),
 * d3.select("i.lo")). Not a property the code reads (row.lo, d3's .on(…) for a class "on") nor, in
 * code that builds no selector, a quoted word anywhere else (an object's "lo" key): both kept a
 * figure of class "lo", and the section around it, from the reader. A name the code reads from
 * elsewhere (getAttribute("class"), a selector built from data) is not seen: that block can be
 * deleted, and the script then finds nothing.
 */
export function classesSelected(code) {
  const strings = stringLiterals(code);
  const names = new Set();
  const partial = [];
  const quoted = /(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g;
  const add = (value) => value.split(/\s+/).filter(Boolean).forEach((name) => names.add(name));
  const api = /(?:\bclassList\s*\.\s*(?:add|remove|toggle|contains|replace)|\.classed|\bgetElementsByClassName|\.(?:has|add|remove|toggle)Class|\bclassName\s*\.\s*(?:includes|indexOf|startsWith|endsWith)|\bclassName\s*\.\s*split\s*\([^)]*\)\s*\.\s*(?:includes|indexOf))\s*\(\s*((?:(["'`])(?:(?!\2)[^\\\n]|\\.)*\2\s*,?\s*)+)/g;
  for (const [, args] of code.matchAll(api)) for (const [, , value] of args.matchAll(quoted)) add(value);
  // A name the code builds a selector or a class API's argument from (".", + a variable; `.${c}`; a
  // class API given a variable): any quoted string that is exactly one name may be it (const cls =
  // "lo"; querySelectorAll("." + cls)). Not row.lo, d.lo or a JSON key: nothing is built there.
  const built = /(["'`])[^"'`\n]*\.\1\s*\+|\.\$\{/.test(code)
    || /(?:\bclassList\s*\.\s*(?:add|remove|toggle|contains|replace)|\.classed|\.(?:has|add|remove|toggle)Class)\s*\(\s*[A-Za-z_$][\w$.]*\s*[,)]/.test(code);
  if (built) for (const text of strings) if (/^-?[A-Za-z_][\w-]*$/.test(text)) names.add(text);
  const compared = /\bclassName\s*(?:[!=]==?|=)\s*(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1|(["'`])((?:(?!\3)[^\\\n]|\\.)*)\3\s*[!=]==?\s*[\w$.]*\bclassName\b/g;
  for (const match of code.matchAll(compared)) add(match[2] ?? match[4]);
  const attribute = /\[\s*class\s*([~|^$*]?)=\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]+))\s*(?:[is]\s*)?\]/g;
  for (const text of strings) {
    for (const match of text.matchAll(attribute)) {
      const value = match[2] ?? match[3] ?? match[4];
      if (match[1] === "" || match[1] === "~" || match[1] === "|") add(value);
      else partial.push(value);
    }
  }
  return { names, partial, selectors: strings.join("\n") };
}

// The text of each string literal in JavaScript `code`, a template's text pieces each one (what its
// ${…} holds is code again), not comments' and regular expressions'. A reading for names, no parser:
// a regular expression is told from a division by what comes before it.
function stringLiterals(code) {
  const strings = [];
  const holes = []; // the brace depth each open ${ of a template returns at
  let depth = 0;
  let last = ""; // the last character of code before here, but for spaces
  let at = 0;
  const template = (from) => {
    let text = "";
    for (let index = from; index < code.length; index++) {
      const character = code[index];
      if (character === "\\") { text += code.slice(index, index + 2); index++; continue; }
      if (character === "`") { strings.push(text); return index + 1; }
      if (character === "$" && code[index + 1] === "{") { strings.push(text); holes.push(depth); return index + 2; }
      text += character;
    }
    strings.push(text);
    return code.length;
  };
  while (at < code.length) {
    const character = code[at];
    const next = code[at + 1];
    if (character === "/" && next === "/") { const end = code.indexOf("\n", at); at = end < 0 ? code.length : end; continue; }
    if (character === "/" && next === "*") { const end = code.indexOf("*/", at + 2); at = end < 0 ? code.length : end + 2; continue; }
    if (character === '"' || character === "'") {
      let index = at + 1;
      let text = "";
      while (index < code.length && code[index] !== character && code[index] !== "\n") {
        if (code[index] === "\\") { text += code.slice(index, index + 2); index += 2; } else text += code[index++];
      }
      strings.push(text);
      at = index + 1;
      last = "a";
      continue;
    }
    if (character === "`") { at = template(at + 1); last = "a"; continue; }
    if (character === "}" && holes.length && holes.at(-1) === depth) { holes.pop(); at = template(at + 1); last = "a"; continue; }
    if (character === "/" && (!/[\w$)\]}]/.test(last) || /(?:^|[^\w$.])(?:return|typeof|case|in|of|void|delete|throw|yield|await|else|do)\s*$/.test(code.slice(Math.max(0, at - 12), at)))) {
      // A regular expression: to its closing / (not one in a [class]), then its flags.
      let index = at + 1;
      let inClass = false;
      while (index < code.length && code[index] !== "\n" && (inClass || code[index] !== "/")) {
        if (code[index] === "\\") index++;
        else if (code[index] === "[") inClass = true;
        else if (code[index] === "]") inClass = false;
        index++;
      }
      if (code[index] === "/") {
        at = index + 1;
        while (/[a-z]/i.test(code[at] ?? "")) at++;
        last = "a";
        continue;
      }
    }
    if (character === "{") depth++;
    else if (character === "}") depth--;
    if (!/\s/.test(character)) last = character;
    at++;
  }
  return strings;
}

// A script that reads a Sheet area's state, the tab it shows: the kit's API for it (DocSheets.get),
// the state it keeps it in (DocState "sheets-<name>", its "sheet"), the mark the kit sets on the
// area (data-active-sheet, dataset.activeSheet).
const READS_SHEETS = /\bDocSheets\b|["'`]sheets-|\bactiveSheet\b|data-active-sheet|["'`]sheet["'`]|\bsheet\s*:/;
const escapeKey = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/**
 * Whether a script reads or sets a Sheet tab by its key (`key`, quoted alike on both sides): only a
 * script that reads the Sheet state (READS_SHEETS), and only where the key stands as a tab does there:
 * the tab a state starts on or is given (sheet: "key", .set("key"), .set("sheet", "key")), one compared
 * with the tab shown (=== "key", "key" !==, case "key":), the area's mark ([data-active-sheet="key"]).
 * Not anywhere the key's word stands in the report's code: a D3 drawing's .attr("text-anchor",
 * "middle") is no reference to a tab named "middle".
 */
export function sheetKeyRead(key, code) {
  if (!READS_SHEETS.test(code)) return false;
  const name = escapeKey(key);
  const quoted = `(["'\`])${name}\\1`; // each pattern below its own expression: \1 is its first group
  return [
    `\\bsheet["'\`]?\\s*:\\s*${quoted}`,
    `\\.set\\(\\s*(["'\`])${name}\\1`,
    `\\.set\\(\\s*(["'\`])sheet\\1\\s*,\\s*(["'\`])${name}\\2`,
    `[!=]==?\\s*${quoted}`,
    `${quoted}\\s*[!=]==?`,
    `\\bcase\\s+${quoted}\\s*:`,
    `active-sheet\\s*=\\s*["']?${name}["'\\]]`,
  ].some((pattern) => new RegExp(pattern).test(code));
}

// Units that something else refers to stay: the report's script (by id, data-* attribute name or
// class; a Sheet tab by its key where a script reads the Sheet state: sheetKeyRead) or another element
// (href="#id", aria-*, for, dialog triggers, a drawing's url(#id)...). Scripts inside the unit itself,
// and references from inside it (a figure's own markers), do not count. Returns referenced(element): whether something refers to that element's own
// attributes ("script", "ref" or null), what binds a text block (capsOf).
function keepReferenced(document, units) {
  const scripts = [];
  const refs = new Map(); // id -> offsets of the elements that refer to it
  const visit = (node) => {
    for (const child of node.childNodes ?? []) {
      if (!child.tagName) continue;
      const at = child.sourceCodeLocation?.startOffset ?? -1;
      if (child.tagName === "script" && attr(child, "src") === undefined) {
        scripts.push({ at, code: isCode(attr(child, "type")), text: child.childNodes.map((text) => text.value ?? "").join("") });
      }
      for (const { name, value } of child.attrs) {
        if (name === "aria-labelledby" && child.tagName === "section") continue; // a section's own label keeps no heading in it
        for (const id of idsNamed(name, value)) (refs.get(id) ?? refs.set(id, []).get(id)).push(at);
      }
      visit(child.tagName === "template" ? child.content : child);
    }
  };
  visit(document);
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const camel = (name) => name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  // The code the names are looked for in: every script's but those inside a range (the unit's own,
  // the element's), which is all of it, the one string made once, unless a script is inside. A
  // report's charts write their options as scripts, so joining them again for each of its hundreds
  // of units and text blocks, and testing each name against them again, made instrument() cost its
  // blocks times its scripts' size (a report of 620 blocks and 14 KB of scripts: 36 ms, now 8). A
  // name's test against all of the code is made once (`tested`): the same test on the same text
  // says the same. Only scripts the page runs: a data block's (a chart's <script type="application/json">,
  // the kit's state) names nothing it selects; its "lo" key is a key (found testing the skill with
  // Agents, 2026-10-28).
  const running = scripts.filter((script) => script.code);
  const allCode = running.map((script) => script.text).join("\n");
  const codeOutside = (inside) => (running.some((script) => inside(script.at)) ? running.filter((script) => !inside(script.at)).map((script) => script.text).join("\n") : allCode);
  const tested = new Map(); // "<kind> <name>" -> whether all of the code uses it
  const once = (kind, test) => (name, code) => {
    if (code !== allCode) return test(name, code);
    const key = `${kind} ${name}`;
    if (!tested.has(key)) tested.set(key, test(name, code));
    return tested.get(key);
  };
  const idUsed = once("id", (id, code) => new RegExp(`#${escape(id)}(?![\\w-])|(["'\`])${escape(id)}\\1`).test(code));
  const dataUsed = once("data", (name, code) => new RegExp(`${escape(name)}(?![\\w-])|dataset\\.${camel(name)}(?![\\w$])`).test(code));
  // A class only where the code can select an element by it (classesSelected): a d3 drawing's row.lo
  // or its "lo" field is no use of class "lo", and kept the figure and its section from the reader.
  const selected = new Map(); // code -> classesSelected(code), each text read once
  const classUsed = once("class", (name, code) => {
    if (!selected.has(code)) selected.set(code, classesSelected(code));
    const { names, partial, selectors } = selected.get(code);
    return names.has(name) || partial.some((value) => value.includes(name)) || new RegExp(`\\.${escape(name)}(?![\\w-])`).test(selectors);
  });
  const ownClasses = (value) => value.split(/\s+/).filter((token) => token && !/^(doc-|katex)/.test(token));
  for (const unit of units) {
    const ranges = [[unit.start, unit.end], ...(unit.companion ? [[unit.companion.start, unit.companion.end]] : [])];
    const inside = (offset) => ranges.some(([start, end]) => offset >= start && offset < end);
    // Each name with the offsets of the elements in the unit that carry it.
    const ids = new Map();
    const data = new Map();
    const classes = new Map();
    const carried = (names, name, at) => (names.get(name) ?? names.set(name, []).get(name)).push(at);
    const collect = (node) => {
      if (!node.tagName) return;
      const at = node.sourceCodeLocation?.startOffset ?? unit.start;
      for (const { name, value } of node.attrs) {
        if (name === "id" && value) carried(ids, value, at);
        else if (name.startsWith("data-") && name !== IDENTITY) carried(data, name, at);
        else if (name === "class") ownClasses(value).forEach((token) => carried(classes, token, at));
      }
      (node.tagName === "template" ? node.content : node).childNodes?.forEach(collect);
    };
    unit.nodes.forEach(collect);
    const code = codeOutside(inside);
    const named = (names, test, show) => [...names].filter(([name]) => test(name)).map(([name, at]) => ({ name: show(name), at }));
    const used = [
      // A Sheet a script reads or sets by its key stays (sheetKeyRead).
      ...(unit.key && scripts.some((script) => !inside(script.at) && sheetKeyRead(unit.key, script.text)) ? [{ name: `"${unit.key}"`, at: [unit.start] }] : []),
      ...named(ids, (id) => idUsed(id, code), (id) => `#${id}`),
      ...named(data, (name) => dataUsed(name, code), (name) => `[${name}]`),
      ...named(classes, (name) => classUsed(name, code), (name) => `.${name}`),
    ];
    const linked = named(ids, (id) => (refs.get(id) ?? []).some((offset) => !inside(offset)), (id) => `#${id}`);
    const kept = used.length > 0 ? used : linked;
    // `at`: where the parts referred to are. `own`: some of them are the unit's own, not in a unit
    // it holds (a section's title, the section itself), so they cannot leave it.
    const at = kept.flatMap((entry) => entry.at);
    const own = at.some((offset) => !units.some((other) => other !== unit && unit.start <= other.start && other.end <= unit.end && other.start <= offset && offset < other.end));
    unit.keep = kept.length > 0 ? { reason: used.length > 0 ? "script" : "ref", names: kept.map((entry) => entry.name), at, own } : null;
  }
  return (node) => {
    const location = node.sourceCodeLocation;
    if (!location) return null;
    // Only an id, a data-* attribute or a class is referred to: an element with none (most text
    // blocks) needs no code at all.
    if (!node.attrs.some(({ name }) => name === "id" || name === "class" || name.startsWith("data-"))) return null;
    const inside = (offset) => offset >= location.startOffset && offset < location.endOffset;
    const code = codeOutside(inside);
    let reason = null;
    for (const { name, value } of node.attrs) {
      if (name === "id" && value) {
        if (idUsed(value, code)) return "script";
        if ((refs.get(value) ?? []).some((offset) => !inside(offset))) reason = "ref";
      } else if (name.startsWith("data-") && name !== IDENTITY && dataUsed(name, code)) return "script";
      else if (name === "class" && ownClasses(value).some((token) => classUsed(token, code))) return "script";
    }
    return reason;
  };
}

// The data-block-id attributes of these elements and of every element inside them (in a template's
// content too), each with the one whitespace character before it, in the file's order: the
// attributes alone, never text that merely spells one (in code, a comment or a script), however the
// value is quoted. What an id-blind reading of their source leaves out (unitHash, locate.mjs). One
// character, never all the whitespace there: an id is given as ` data-block-id="…"` right before the
// tag's ">" or "/>" (addBlockIds, a commit's touch), after whatever whitespace the tag ends in
// (`<hr />`, `<p class="lead" >`, a ">" on a line of its own), so taking out exactly what was put
// in reads the tag as it was before.
export function blockIdSpans(source, nodes) {
  const spans = [];
  const walk = (node) => {
    const at = node.sourceCodeLocation?.attrs?.[IDENTITY];
    if (at) {
      const start = at.startOffset > 0 && /\s/.test(source[at.startOffset - 1]) ? at.startOffset - 1 : at.startOffset;
      spans.push({ start, end: at.endOffset });
    }
    for (const child of node.content?.childNodes ?? node.childNodes ?? []) walk(child);
  };
  nodes.forEach(walk);
  return spans.sort((a, b) => a.start - b.start);
}

// A piece of source, start to end, without the block ids in it (spans: blockIdSpans).
const withoutSpans = (source, start, end, spans) => {
  let text = "";
  let at = start;
  for (const span of spans) {
    if (span.start < at || span.end > end) continue;
    text += source.slice(at, span.start);
    at = span.end;
  }
  return text + source.slice(at, end);
};

// What a unit says, as a hash: the page's guard that a unit it deletes or converts is still the one
// it saw (commitEdits), and how a unit untouched since the page opened is found again. What goes
// with the unit elsewhere in the file (a Sheet tab's panel) is part of it: changed, the unit is changed.
// Its block ids are not (its own and those of the blocks in it, data-block-id taken out of their
// start tags; text that spells one stays): an id is who the block is, not what it says, so giving
// ids (an export, add-block-ids.mjs, a commit's touch) changes no unit's hash, and a page opened before
// still finds every unit it names by the hash it saw, the id the file gives it now kept.
export const unitHash = (source, unit) => {
  const spans = blockIdSpans(source, unit.nodes);
  const own = withoutSpans(source, unit.start, unit.end, spans);
  return hashOf(unit.companion ? `${own}\u0000${withoutSpans(source, unit.companion.start, unit.companion.end, spans)}` : own);
};

// Text with `cuts` ([{ start, end }], any order, nested ones inside others) taken out of each of `ranges`,
// the ranges joined by a character no text has, its whitespace folded to one space: what is left of a
// source once its words and the blocks in it are gone, read the same however it is indented. But where
// whitespace is content (what a <pre> or a <textarea> holds that no text block is, a quoted attribute's
// value): kept as it is.
const KEPT_SPACE = /<(pre|textarea)\b[\s\S]*?<\/\1\s*>|"[^"]*"|'[^']*'/gi;
const foldSpace = (text) => {
  let out = "";
  let at = 0;
  for (const hit of text.matchAll(KEPT_SPACE)) {
    out += text.slice(at, hit.index).replace(/\s+/g, " ") + hit[0];
    at = hit.index + hit[0].length;
  }
  return (out + text.slice(at).replace(/\s+/g, " ")).trim();
};
const folded = (source, ranges, cuts) => {
  const sorted = [...cuts].sort((a, b) => a.start - b.start || b.end - a.end);
  return foldSpace(ranges.map(([start, end]) => withoutSpans(source, start, end, sorted)).join("\u0000"));
};

/**
 * What a unit is besides its words (`scanned`: the scan `unit` is of): its source (and its companion's,
 * a Sheet tab's panel) with the insides of its own text blocks, the units in it (whole) and the block ids
 * taken out, its whitespace folded, as a hash. Two versions of a file with one shell for a unit, and the
 * same units in it, differ in that unit only by the words of its text blocks: what the page takes in place
 * from a write of someone else's (docs/editor.md "Someone else's writes": the page's pull). Units added
 * into it, taken out of it or moved within it change no shell (the page's pull reads its units apart);
 * an attribute, a class, a picture or anything else that is no text changes it. What its companion holds
 * (the units in a tab's panel are the Sheet's, not the tab's, and so are the words of a text block in it)
 * is taken out as its own units are: the panel's frame is the tab's, what is in it is not.
 */
export function unitShell(source, unit, scanned) {
  const ranges = [[unit.start, unit.end], ...(unit.companion ? [[unit.companion.start, unit.companion.end]] : [])];
  const inCompanion = (start, end) => Boolean(unit.companion) && unit.companion.start <= start && end <= unit.companion.end;
  const cuts = [
    ...blockIdSpans(source, unit.nodes),
    ...scanned.blocks.filter((block) => block.unit === unit.id || inCompanion(block.innerStart, block.innerEnd)).map((block) => ({ start: block.innerStart, end: block.innerEnd })),
    ...scanned.units.filter((other) => other !== unit && (other.parent === unit.id || inCompanion(other.start, other.end))).flatMap((other) => [{ start: other.start, end: other.end }, ...(other.companion ? [other.companion] : [])]),
  ];
  return hashOf(folded(source, ranges, cuts));
}

/**
 * What a document is besides its units and the words of the text blocks outside them (its title): its
 * head, the page's frame around its blocks (the header, a detail card's frame), its scripts, as a hash,
 * with the units outside any unit taken out whole, the insides of those text blocks and of <title> (the
 * title the page's commits keep it in step with), and its whitespace folded. As unitShell is a unit's.
 */
export function frameShell(source, scanned) {
  const head = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(source.slice(0, Math.max(0, source.search(/<body\b/i))));
  const cuts = [
    ...scanned.units.filter((unit) => unit.parent === null).flatMap((unit) => [{ start: unit.start, end: unit.end }, ...(unit.companion ? [unit.companion] : [])]),
    ...scanned.blocks.filter((block) => block.unit === null).map((block) => ({ start: block.innerStart, end: block.innerEnd })),
    ...(head ? [{ start: head.index + head[0].length - head[1].length - "</title>".length, end: head.index + head[0].length - "</title>".length }] : []),
  ];
  return hashOf(folded(source, [[0, source.length]], cuts));
}
