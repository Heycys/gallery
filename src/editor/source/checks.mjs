import { parseFragment } from "parse5";
import { attributeValue, BLOCK_TYPES, HOSTS, TOGGLES } from "../components/registry.mjs";
import { FILES } from "../components/files.mjs";
import { inlineMode, inlineProblem, NEW_SIBLING } from "./blocks.mjs";
import { attributesText } from "./text.mjs";
import { texSource } from "../components/math/index.mjs";

// What may be written (docs/editor.md, "New blocks and conversions"): the text types a block may
// become and their markup, a text's inline markup checked in the context it is written to, a
// split-off part's tag, and whether a unit may be converted.

// Text blocks a conversion or a new block may be: the types that hold inline text and nothing else
// (no box, not bare): the text leaves, list items, code and display formulas.
export const LEAVES = new Set(Object.entries(BLOCK_TYPES).filter(([, spec]) => !spec.box && !spec.bare).map(([type]) => type));

// A text block's markup, `node` being what the page made ({ type, html, classes?, attributes? }): a
// type whose component writes it its own way (FILES `leaf`: a code block's title, its text in its
// code element, its language, folded lines and height) is written so, any other as the kit's plain
// <tag class>text</tag>. `id`: its id attribute (` data-block-id="…"`), or none.
// `classes`: the class switches it carries (its color: checked by the caller against TOGGLES);
// `attributes`: those its kind sets (a to-do item's checked state, against ATTRIBUTES).
export const leafHtml = (spec, node, id = "") => {
  const own = FILES[node.type]?.leaf;
  if (own) return own(spec, node, id);
  const names = [spec.className, ...(node.classes ?? [])].filter(Boolean).join(" ");
  return `<${spec.tag}${names ? ` class="${names}"` : ""}${attributesText(node.attributes)}${id}>${node.html}</${spec.tag}>`;
};

/** Whether a block made on the page carries only attributes its kind sets, with values it takes. */
export const validAttributes = (attributes, kind) => attributes === undefined
  || (Boolean(attributes) && typeof attributes === "object" && !Array.isArray(attributes) && Object.entries(attributes).every(([name, value]) => typeof value === "string" && attributeValue(kind, name, value)));

// The text blocks the reader may leave empty, made on the page or converted: the types whose
// component says so (`empty`: a paragraph, 小字, a heading, a list item, a code block).
export const emptyLeaf = (spec) => spec?.empty === true;

// The inline elements of the report's own a commit may write (page/own.mjs): those the file has,
// `file` the text it applies to (`written`: what was parsed, holding the element); none given, any.
const knownIn = (file, written) => (file === undefined ? null : (at) => file.includes(written.slice(at.startOffset, at.endOffset)));

// Some text (none at all where `empty`), and only allowlisted inline content (none in code) that
// cannot close its element; inline elements of the report's own only as `file` has them.
export function validLeaf(spec, html, { empty = false, file } = {}) {
  if (typeof html !== "string" || (!html.trim() && !(empty && html === ""))) return false;
  if (html === "") return true;
  if (spec.tex && !texSource(html)) return false; // a display formula: its TeX alone
  const tag = spec.inside ?? spec.tag; // where its text is written, as plain text when that is not the block's own element
  const written = `<${tag}>${html}</${tag}>`;
  const [first, ...rest] = parseFragment(written, { sourceCodeLocationInfo: true }).childNodes;
  return rest.length === 0 && first?.tagName === tag && inlineProblem(first, [], spec.inside !== undefined, { cell: tag === "td" || tag === "th", known: knownIn(file, written) }) === null;
}

// The unit kinds of the text leaves told by a class of their own (小字).
const CLASSED_LEAVES = new Set(Object.values(BLOCK_TYPES).filter((spec) => spec.text && spec.className).map((spec) => spec.kind));

// What the reader may turn a unit into: "text" for a text block that is a unit of its own (a p,
// h1–h4, li or classed leaf; the conversion drops its class, which tells the type, and carries its
// other attributes, an id among them); "list" for a list of the kit's (class-less); "written" for a unit
// as its component writes it (FILES `written`: a code block as a conversion writes it), which only
// becomes text again (the page converts no such unit: undo of a conversion into it turns it back,
// leaving the attributes its writer sets, FILES `attribute`); or null.
// Never a unit the report's script refers to (it may count on its element); one a link or ARIA names
// by its id keeps that id.
export function convertible(unit, boxes) {
  if (unit.keep?.reason === "script") return null;
  if (unit.kind === "list") return boxes.some((box) => box.unit === unit.id && box.kind === "list") ? "list" : null;
  const own = FILES[unit.kind];
  if (own?.written) return own.written(unit) ? "written" : null;
  if (unit.text === undefined || unit.nested) return null;
  return ["p", "h1", "h2", "h3", "h4", "li"].includes(unit.tag) || CLASSED_LEAVES.has(unit.kind) ? "text" : null;
}

export function checkParts(target, parts, file) {
  if (!Array.isArray(parts) || !parts.every((part) => validPart(target, part, file))) return "invalid";
  const kept = parts.filter((part) => part.keep);
  if (kept.length > 1) return "invalid";
  if (parts.length > kept.length && !target.caps.split) return "fixed";
  if (kept.length === 0 && !target.caps.remove) return "fixed";
  if (parts.length === 0 && target.nested) return "fixed"; // an item holding lists goes only as a whole block
  if (kept.length === 1 && kept[0].html.trim() === "" && !target.caps.empty) return "empty";
  return null;
}

/**
 * Whether `html` may be a table cell's text (allowlisted inline content and lists of it, that cannot
 * close the cell; inline elements of the report's own only as `file` has them).
 */
export function validCell(tag, html, file) {
  const written = `<table><tbody><tr><${tag}>${html}</${tag}></tr></tbody></table>`;
  const [first, ...rest] = parseFragment(written, { sourceCodeLocationInfo: true }).childNodes;
  const body = rest.length === 0 && first?.tagName === "table" && first.childNodes.length === 1 ? first.childNodes[0] : null;
  const row = body?.childNodes.length === 1 ? body.childNodes[0] : null;
  const cell = row?.childNodes.length === 1 ? row.childNodes[0] : null;
  return cell?.tagName === tag && inlineProblem(cell, [], false, { cell: true, known: knownIn(file, written) }) === null;
}

// The class switches a new part may carry, by its tag (a paragraph's color, a heading's).
const PART_KINDS = { p: "paragraph", h1: "heading", h2: "heading", h3: "heading", h4: "heading", li: "item" };
const validPartClasses = (part, tag) => part.classes === undefined
  || (!part.keep && Array.isArray(part.classes) && new Set(part.classes).size === part.classes.length && part.classes.every((name) => (TOGGLES[PART_KINDS[tag]] ?? []).includes(name)));

// The server re-validates every part in the context it will be written to: allowlisted inline
// content only, and it cannot close its own element and break out of it.
function validPart(target, part, file) {
  if (!part || typeof part.html !== "string") return false;
  if (HOSTS[target.kind]?.tex && !texSource(part.html)) return false; // a display formula stays its TeX alone
  const tag = part.keep ? target.tag : part.tag;
  if (!part.keep && NEW_SIBLING[target.tag] !== tag) return false;
  if (!validPartClasses(part, tag) || (part.attributes !== undefined && (part.keep || !validAttributes(part.attributes, PART_KINDS[tag])))) return false;
  const cell = tag === "td" || tag === "th";
  const wrapped = cell ? `<table><tbody><tr><${tag}>${part.html}</${tag}></tr></tbody></table>` : `<${tag}>${part.html}</${tag}>`;
  const [first, ...rest] = parseFragment(wrapped, { sourceCodeLocationInfo: true }).childNodes;
  if (rest.length > 0 || !first) return false;
  let only = first;
  if (cell) {
    const body = first.tagName === "table" && first.childNodes.length === 1 ? first.childNodes[0] : null;
    const row = body?.childNodes.length === 1 ? body.childNodes[0] : null;
    only = row?.childNodes.length === 1 ? row.childNodes[0] : null;
  }
  return only?.tagName === tag && inlineProblem(only, [], inlineMode(target.kind, target.tag, target.caps), { cell, known: knownIn(file, wrapped) }) === null;
}
