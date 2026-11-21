import { isHost, nestedBlocks, serializeInner, unitsOf } from "../../core.mjs";
import { BLOCK_TYPES, COPIED_AS_ITSELF, COPY_KEEPS, TEXT_TYPES, askClipboard, clipboardOf, sizeValue, unitClipboard } from "../../../components/registry.mjs";
import { ALIGN_TOGGLES, TEXT_BLOCKS } from "../../../components/align.mjs";
import { BLOCK_COLORS } from "../../../components/colors.mjs";
import { containerType, typeOf } from "../../convert.mjs";
import { pageOfType, pageOfUnit } from "../../page-objects.mjs";
import { referencedIds } from "../../../../shared/copy-ids.mjs";
import { currentProjectBase } from "../../../../shared/workspace-address.mjs";
import { checkBlocks } from "./blocks.mjs"; // (each imports the other: used when called, never at load)

// Selected blocks as the clipboard's own description (docs/editor.md, "Copying blocks"): each
// block's type and inline HTML, its color, and what lists, quotes, panels, disclosures, sections and
// tabs areas hold (any block can be copied). Blocks the page can make are copied as what they
// are, each block saying what it carries (`clipboard.describe` of the unit it is: a block is an
// element, with no record of it to copy), a text block its text and color, a list or a
// quote what it holds. A card (a chart card, an image, a file, a bookmark, an embed), a table or a
// row of columns is copied as itself (a "copy" of its unit; a row's cards and tables can only be
// copied with it): the page shows a copy of the one on
// the page (what the kit drew taken off, so that it draws again) and the file gets a copy of the
// block's own source, its ids taken out (source/commit.mjs, { copy }), within the page it was copied
// from (the clipboard names the report, its workspace and the block). Elsewhere (another document, or
// once its unit is gone: a cut) a table pastes as a new one from its cells, a row of columns from its
// columns and a media block (an image, a file, an embed, a bookmark) from what a new one is written with
// (`data`, its files of the folder copied with it: ../carry.mjs). A report's own widget is bound to the
// report's script or its ids, and is the Agent's to copy.

export const MIME = "application/x-gallery-blocks";
// Its name before the product's rename (2026-10-26): a copy writes the same data under it too, so
// that a page of the old version still open in another tab pastes it as blocks, and a paste reads it
// when the new one is not there (a copy made on such a page).
export const OLD_MIME = "application/x-report-studio-blocks";
/**
 * The attribute of the clipboard's HTML that holds the same data where the system clipboard has no room for
 * its own type: a picture copied (clipboard/picture.mjs), whose write (navigator.clipboard, the only one
 * that takes a PNG) holds the standard types alone. Not trusted either: what it holds is checked as the own
 * type's data is.
 */
export const HTML_MARK = "data-gallery-blocks";
/** The clipboard's own data in `data` (a DataTransfer): under MIME, else under OLD_MIME, else in its HTML (HTML_MARK); "" when none. */
export const ownData = (data) => data.getData(MIME) || data.getData(OLD_MIME) || markedIn(data.getData("text/html"));
function markedIn(html) {
  if (!html?.includes(HTML_MARK)) return "";
  const template = globalThis.document.createElement("template");
  template.innerHTML = html;
  return template.content.querySelector(`[${HTML_MARK}]`)?.getAttribute(HTML_MARK) ?? "";
}
const COPIES = COPIED_AS_ITSELF; // the cards, a table, a row of columns
export const reportOf = (doc) => doc.querySelector(".doc-page")?.dataset.docId ?? null;
/**
 * The workspace of the page (shared/workspace-address.mjs: its address's /~ws-… base, "" for the first),
 * which the clipboard names with the document: two workspaces may each have a document of the same name.
 */
export const projectOf = () => currentProjectBase();
const PROJECT = /^(\/~ws-[0-9a-f]{6})?$/;
/** Whether `project` (what a copy says, "" or none for the first workspace) is a workspace's name as projectOf says one. */
export const projectName = (project) => project === undefined || (typeof project === "string" && PROJECT.test(project));
/** Whether what the clipboard names (`report`, `project`) is this page's document. */
export const sameDocument = (doc, report, project) => report === reportOf(doc) && (project ?? "") === projectOf();

// The editor marks: data-ge-*, and data-rs-*, their name before 2026-10-28, which a file may keep.
const EDITOR_MARK = /^data-(?:ge|rs)-/;

/**
 * A copy of a card or a table on the page, as the kit would start it anew: its
 * drawing, the kit's marks, the editor's marks, its block id and ids taken out. `editable`: its
 * fields stay editable (a copy pasted on the page, whose fields the commit takes in as text blocks),
 * its tables keep their tools (COPY_KEEPS: the file gets the same source) and the ids it names itself (an
 * SVG's markers: src/shared/copy-ids.mjs) stay, to be given a prefix of its own (ids.mjs prefixCopies);
 * `named`: those ids alone stay, a copy's markup to be made anew somewhere else.
 */
export function copyOf(element, { editable = false, named: keepsNamed = editable } = {}) {
  const clone = element.cloneNode(true);
  clone.querySelectorAll("[data-doc-dev]").forEach((node) => node.remove());
  globalThis.DocKit?.dehydrate(clone);
  const all = [clone, ...clone.querySelectorAll("*")];
  const named = keepsNamed ? referencedIds(all.flatMap((node) => [...node.attributes])) : new Set();
  for (const node of all) {
    const marks = [...node.attributes].filter(({ name, value }) => (EDITOR_MARK.test(name) && !(editable && COPY_KEEPS.has(name))) || name === "data-block-id" || (name === "id" && !named.has(value)));
    if (!editable && marks.some(({ name }) => EDITOR_MARK.test(name))) node.removeAttribute("contenteditable");
    marks.forEach(({ name }) => node.removeAttribute(name));
  }
  return clone;
}

/**
 * The unit on the page a described copy is of, or null when it is gone (or of another page). One whose
 * description carries its markup (`data.html`: an instance of a package) is that unit only while the
 * unit holds that markup: what its component wrote may differ where its words do not (a row marked
 * done), and the file's copy of the unit would hold the file's, not what was copied; so is one carrying
 * no data. One carrying any other data (a media block, a table, a row of columns) is that unit only while
 * the unit, described again, carries the same: its number names another block once the page numbers its
 * units anew (it was drawn again, or opened again, after a cut), and two images with no caption say the
 * same words (none), so that the file would copy the other one's source. Where it is not, it is made of
 * what it carries; one carrying none is then no copy the page can make (unmadeCopy).
 */
export function copied(doc, block) {
  if (!sameDocument(doc, block.report, block.project)) return null;
  const unit = doc.querySelector(`main [data-ge-unit="${block.unit}"]`);
  if (!unit || unit.getAttribute("data-ge-unit-kind") !== block.kind) return null;
  // One whose unit's copy cannot stand for it (`copiesAsItself`: an instance with slots) is made of
  // what it carries, here too: that copy would hold blocks the file writes whole, with ids no answer
  // of a commit gives the page (source/apply.mjs restoredText names the block alone).
  if (pageOfUnit(unit)?.copiesAsItself?.(unit) === false) return null;
  if (block.data && typeof block.data.html !== "string") return JSON.stringify(dataOf(unit)) === JSON.stringify(block.data) ? unit : null;
  // One carrying no data (a chart card, a picture of a web address), or its markup (an instance), is its
  // unit only while the unit's markup is what was copied (`html`, as describe wrote it): two pictures of a
  // web address with no caption say the same words, none.
  return copyOf(unit).outerHTML === block.html ? unit : null;
}

// What an element holds: its units, each described. One that is no box has none (a list of a class of its
// own: source/units.mjs boxKind), and what stands in it is read as it stands. Null where one is no copy.
function holding(box) {
  if (!box) return null;
  const units = unitsOf(box);
  const blocks = (units.length > 0 || box.hasAttribute("data-ge-box") ? units : [...box.children]).map(describe);
  return blocks.every(Boolean) ? blocks : null;
}

/**
 * What a unit copied as itself carries where its unit is not (its definition's `data`: what a new one is
 * written with), or null: where its definition gives none, and where what it gives is no data a paste
 * takes (checkBlocks, as the paste checks the clipboard's: a file block whose size an Agent wrote "2.3 MB",
 * a picture's words of two lines, a width of 0.50). A paste refuses the clipboard's data whole when any of
 * it fails, falling back to its HTML (a link where a file block was, its port in the file), so a copy
 * carrying such data would be no copy in its own document either, and once cut no block at all: it
 * carries none, and is copied within its document as it always was (the file copying its source), its cut
 * refused (clipboard/index.mjs).
 */
function dataOf(node) {
  const data = unitClipboard(node).data?.(node, { serializeInner, copyOf, clipboardOf, copiedType, page: pageOfType, holding });
  return data && checkBlocks([data], { doc: node.ownerDocument }) ? data : null;
}

/** The classes a block's copy carries as its `color`: its colors, and a paragraph's or a heading's alignment and indent. */
export const BLOCK_LOOKS = [...BLOCK_COLORS, ...ALIGN_TOGGLES];

/** A block's colors, and a text block's alignment and indent (their classes, space-separated), or null. */
export const colorOf = (node) => (node.matches?.(TEXT_BLOCKS) ? BLOCK_LOOKS : BLOCK_COLORS).filter((name) => node.classList.contains(name)).join(" ") || null;

/** The type a text block is copied as: its own, the type of the text blocks of what wraps it (a quote's paragraph), or null (code, whose text is no text block's). */
export function copiedType(host) {
  const type = typeOf(host);
  const own = BLOCK_TYPES[type]?.wraps ? BLOCK_TYPES[type].leaf : type;
  return TEXT_TYPES.has(own) ? own : null;
}

// An element's words on one line.
const plain = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();

/** What copies of a block the page could make: { type, html, text, blocks, lists }, or null. */
export function describe(node) {
  const kind = node.getAttribute("data-ge-unit-kind");
  // Copied as itself. One whose unit's copy cannot stand for it (`copiesAsItself` of its page object:
  // an instance with slots, whose blocks that copy would write whole) is copied by what it carries
  // alone (`data`, those blocks described apart), and is no copy where it carries nothing (a block in a
  // slot the page cannot make).
  if (COPIES.has(kind)) {
    if (!node.hasAttribute("data-ge-unit") || node.hasAttribute("data-ge-new")) return null; // not in the file yet
    const copy = copyOf(node);
    const data = dataOf(node);
    if (!data && pageOfUnit(node)?.copiesAsItself?.(node) === false) return null;
    const project = projectOf();
    return { type: "copy", kind, unit: Number(node.getAttribute("data-ge-unit")), report: reportOf(node.ownerDocument), ...(project ? { project } : {}), text: copy.textContent, html: copy.outerHTML, ...(data ? { data } : {}) };
  }
  const what = { page: pageOfType, holding, describe, copiedType, isHost, nestedBlocks, serializeInner, plain, colorOf, sizeValue };
  const block = askClipboard("describe", node, what);
  if (block !== undefined) return block;
  // A text block, of any type: as what it is (a quote's paragraph a paragraph), with its color; a
  // block of code is none.
  if (isHost(node)) {
    const type = copiedType(node);
    const color = colorOf(node);
    return type ? { type, html: serializeInner(node), ...(color ? { color } : {}) } : null;
  }
  // A list or a quote, as the blocks it holds.
  const type = containerType(node);
  const blocks = type ? holding(node) : null;
  return blocks ? { type, blocks } : null;
}
