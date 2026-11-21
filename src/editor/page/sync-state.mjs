import { ELEMENT_ID, atomSources, knowAtoms } from "./core.mjs";
import { BLOCK_TYPES, blockTypeOf, boxRole } from "../components/registry.mjs";
import { COPY_KEYS } from "../components/figure/index.mjs";
import { ownTypeOf } from "./convert.mjs";
import { pageOfUnit } from "./page-objects.mjs";

// The page's sync state, as the marks the editor reads (docs/editor.md, "Sync state"). What of
// the file each element is lives in the commits' table (commit.mjs), under the element's identity
// (core.mjs ELEMENT_ID), which never changes; the marks are written from that table here, and
// nowhere else once the page is edited:
//
//   data-ge-unit, data-block-id    the unit it is, and the unit's id in the file
//   data-ge-block                  the text block it is (not while its unit is turned into another type)
//   data-ge-box                    the box it is (an empty value: a box made on the page)
//   data-ge-new                    made on the page: what the file does not have (yet)
//   data-ge-part                   a text block of a block made on the page whose words the file writes
//                                  from elsewhere (components/installed/page.mjs), until the answer names it
//   data-ge-convert, data-ge-type  turned into another type than its unit showed as when last
//                                  committed: the next commit converts the unit (the type it goes as)
//   data-ge-keep, data-ge-keep-own what the file says keeps it
//   data-ge-grid                   the file's table is one the table tools are for (a table made on the
//                                  page has it until the file says: components/table/page.mjs newTable)
//
// So undo, which brings elements back as they were, never brings back what the file had: an
// element it puts back is marked from the table like every other (the element a block was turned
// from is that unit again, of the type it shows, and turns the unit back). An element whose unit
// the file dropped while the page still showed it (emptied, or a list going with its last item)
// is marked as made on the page (asMade), as is everything of the file it was.

const set = (node, name, value) => {
  if (node.getAttribute(name) !== value) node.setAttribute(name, value);
};

/**
 * Write the marks of `nodes` (elements with an identity) from the commits' table, `view`:
 *   entry(identity)   { unit, block, box }: what of the file it is (undefined: made on the page)
 *   dropped(identity) { unit, block, box }: what of the file it was, which the file dropped
 *   keyed(identity)   a keyed block (a detail card) made on the page that the file has
 *   proposal(identity) the id a block made on the page proposes, once it proposes one
 *   units, blocks, boxes  the map's entries
 *   shown(unit)       the type a unit showed as when last committed (convert.mjs ownTypeOf), if known
 *   element(unit)     the element standing for a unit on the page, if any
 */
export function project(nodes, view) {
  // A unit whose element on the page is of another type than it showed: converted, until committed.
  const turnedOn = (unit, node) => {
    const shown = view.shown(unit);
    return shown !== undefined && Boolean(node) && ownTypeOf(node) !== shown;
  };
  const turned = new Map();
  const turnedUnit = (unit) => {
    if (!turned.has(unit)) turned.set(unit, turnedOn(unit, view.element(unit)));
    return turned.get(unit);
  };
  for (const node of nodes) {
    const key = node.getAttribute(ELEMENT_ID);
    const gone = view.dropped(key);
    if (gone) {
      asMade(node, gone);
      continue;
    }
    if (view.keyed(key)) for (const name of ["data-ge-new", "data-ge-type", "data-ge-unit-kind"]) node.removeAttribute(name);
    const entry = view.entry(key);
    if (entry?.unit === undefined && view.proposal(key)) set(node, "data-block-id", view.proposal(key));
    if (!entry) continue;
    const { unit, block, box } = entry;
    let other = false;
    if (unit === undefined) {
      node.removeAttribute("data-ge-unit");
      node.removeAttribute("data-ge-convert");
    } else {
      const info = view.units[unit];
      other = turnedOn(unit, node);
      set(node, "data-ge-unit", String(unit));
      if (info.blockId) set(node, "data-block-id", info.blockId);
      if (info.keep) set(node, "data-ge-keep", info.keep.reason);
      else node.removeAttribute("data-ge-keep");
      node.toggleAttribute("data-ge-keep-own", Boolean(info.keep?.own));
      node.toggleAttribute("data-ge-grid", Boolean(info.grid));
      if (node.hasAttribute("data-ge-copy")) { // a copy, a unit of the file now
        node.removeAttribute("data-ge-copy");
        node.removeAttribute("data-ge-type");
        node.removeAttribute(COPY_KEYS); // its charts' keys, written
      }
      if (other) {
        set(node, "data-ge-convert", String(unit));
        set(node, "data-ge-type", ownTypeOf(node));
        set(node, "data-ge-new", "");
      } else {
        node.removeAttribute("data-ge-convert");
        node.removeAttribute("data-ge-new");
        if (info.kind) set(node, "data-ge-unit-kind", info.kind);
      }
    }
    if (block === undefined) node.removeAttribute("data-ge-block");
    else {
      const info = view.blocks[block];
      const owner = info?.unit;
      // The text of a unit turned into another type goes with the conversion: a text block made
      // on the page until it is committed.
      const off = !info || info.gone || (owner !== null && owner !== undefined && (owner === unit ? other : turnedUnit(owner)));
      if (off) {
        node.removeAttribute("data-ge-block");
        if (node.getAttribute("contenteditable") === "true") set(node, "data-ge-new", "");
      } else {
        set(node, "data-ge-block", String(block));
        node.removeAttribute("data-ge-part");
        if (unit === undefined) node.removeAttribute("data-ge-new");
      }
    }
    if (box !== undefined) {
      set(node, "data-ge-box", String(box));
      if (view.boxes[box]?.kind) set(node, "data-ge-box-kind", view.boxes[box].kind);
      if (unit === undefined && block === undefined) node.removeAttribute("data-ge-new");
    }
  }
}

/**
 * The marks of an element the file dropped while the page still showed it (`what`: the unit, text
 * block or box it was): made on the page from now on, written as a new block where it stands
 * once it has something to write, never named as what the file dropped (that would be a conflict,
 * or text lost). A container whose blocks went elsewhere is a new one of its type (undo putting it
 * back makes it again around the blocks it held); a block its component writes from what it holds
 * says so (`renew`: what the page shows of it is the reader's, and it is known by no tag or class); a
 * text block a new one; a box a box made on the page.
 */
export function asMade(element, what) {
  if (what.unit !== undefined) {
    const type = pageOfUnit(element)?.renew?.(element) ? null : containerTypeOf(element);
    if (type) reviveMarks(element, type);
    else renewMarks(element);
  } else if (what.block !== undefined) {
    element.removeAttribute("data-ge-block");
    set(element, "data-ge-new", "");
  } else if (what.box !== undefined && boxRole(element.getAttribute("data-ge-box-kind")) !== "nest") {
    set(element, "data-ge-box", "");
  }
}

// A text block's or other unit's marks, as made on the page: of its own type (a quote's paragraph
// as a paragraph, a divider as a divider, a highlight block's icon as an icon: the type its class
// tells before the first of its tag); an item's box for lists went with it (a new item's lists are
// written with it).
function renewMarks(element) {
  if (!element.hasAttribute("data-ge-type")) {
    const own = ownTypeOf(element);
    const type = BLOCK_TYPES[own] ? own : blockTypeOf(element) ?? Object.keys(BLOCK_TYPES).find((each) => !BLOCK_TYPES[each].box && BLOCK_TYPES[each].tag === element.localName) ?? "paragraph";
    element.setAttribute("data-ge-type", type);
  }
  for (const name of ["data-ge-block", "data-ge-unit", "data-ge-convert", "data-block-id"]) element.removeAttribute(name);
  set(element, "data-ge-new", "");
  if (boxRole(element.getAttribute("data-ge-box-kind")) === "nest") {
    element.removeAttribute("data-ge-box");
    element.removeAttribute("data-ge-box-kind");
  }
}

// A container's marks, as one made on the page (core.mjs newContainer): a section, a list, quote,
// panel or disclosure, a row of columns or a column.
function reviveMarks(element, type) {
  const spec = BLOCK_TYPES[type];
  for (const [name, value] of [["data-ge-new", ""], ["data-ge-type", type], ["data-ge-unit-kind", spec.kind], ["data-ge-pure", ""]]) set(element, name, value);
  for (const name of ["data-ge-unit", "data-block-id", "data-ge-convert"]) element.removeAttribute(name);
  const box = spec.content?.(element) ?? element;
  if (box) {
    set(box, "data-ge-box", "");
    set(box, "data-ge-box-kind", spec.box);
  }
  const title = spec.title?.(element) ?? null;
  if (title) {
    title.removeAttribute("data-ge-block");
    set(title, "data-ge-new", "");
  }
}

/** The type of container a unit's element is (a section, a list, quote, panel or disclosure, a row of columns or a column: a type with a box), or null. */
export function containerTypeOf(element) {
  const own = ownTypeOf(element);
  const type = BLOCK_TYPES[own]?.box ? own : blockTypeOf(element);
  return BLOCK_TYPES[type]?.box && !BLOCK_TYPES[type].keyed ? type : null;
}

// ---------- kept for the next page ----------
// What the commits know goes to the crash buffer with the page as it is (autosave.mjs), so that a
// page opening once this one is gone takes up exactly where it was: the commit whose answer it
// never learned taken in on the answer, the next one found against what that left (recover).

const REF = "data-ge-ref";

/**
 * `value` (the commits' save()) as JSON: its Maps and Sets, and the elements it names as marks in
 * `document`'s body (as it is, the editor's own UI left out) or, off the page, in the trees they are
 * in, with the sources of the chips there, which this page alone knows (core.mjs atomSources).
 * { html, detached: [html], data, atoms }
 */
export function pack(document, value) {
  const refs = new Map();
  const encode = (item) => {
    if (item === null || typeof item !== "object") return item;
    if (item.nodeType === 9) return { $doc: 1 };
    if (item.nodeType === 1) {
      if (!refs.has(item)) refs.set(item, refs.size);
      return { $el: refs.get(item) };
    }
    if (item instanceof Map) return { $map: [...item].map(([key, entry]) => [encode(key), encode(entry)]) };
    if (item instanceof Set) return { $set: [...item].map(encode) };
    if (Array.isArray(item)) return item.map(encode);
    return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, encode(entry)]));
  };
  const data = encode(value);
  const roots = new Set();
  for (const [element, index] of refs) {
    element.setAttribute(REF, String(index));
    if (element.isConnected) continue;
    let top = element;
    while (top.parentElement) top = top.parentElement;
    roots.add(top);
  }
  try {
    const body = document.body.cloneNode(true);
    body.querySelectorAll("[data-doc-dev]").forEach((node) => node.remove());
    return { html: body.innerHTML, detached: [...roots].map((root) => root.outerHTML), data, atoms: atomSources([body, ...roots]) };
  } finally {
    for (const element of refs.keys()) element.removeAttribute(REF);
  }
}

/**
 * What pack() kept, back as values, its elements in a document of their own (`parse`: html -> a
 * document), its chips known to this page (knowAtoms); one that cannot be found stands as an element
 * off the page. { document, value }
 */
export function unpack({ html, detached = [], data, atoms = {} }, parse) {
  knowAtoms(atoms);
  const document = parse(`<!doctype html><html><head></head><body>${html}</body></html>`);
  const found = new Map();
  const take = (root) => {
    for (const node of [root, ...root.querySelectorAll(`[${REF}]`)]) {
      if (!node.hasAttribute(REF)) continue;
      found.set(Number(node.getAttribute(REF)), node);
      node.removeAttribute(REF);
    }
  };
  take(document.documentElement);
  for (const tree of detached) {
    const template = document.createElement("template");
    template.innerHTML = tree;
    const root = template.content.firstElementChild;
    if (!root) continue;
    take(document.adoptNode(root));
  }
  const elementOf = (index) => {
    if (!found.has(index)) found.set(index, document.createElement("div"));
    return found.get(index);
  };
  const decode = (item) => {
    if (item === null || typeof item !== "object") return item;
    if (Array.isArray(item)) return item.map(decode);
    if ("$doc" in item) return document;
    if ("$el" in item) return elementOf(item.$el);
    if ("$map" in item) return new Map(item.$map.map(([key, entry]) => [decode(key), decode(entry)]));
    if ("$set" in item) return new Set(item.$set.map(decode));
    return Object.fromEntries(Object.entries(item).map(([key, entry]) => [key, decode(entry)]));
  };
  return { document, value: decode(data) };
}
