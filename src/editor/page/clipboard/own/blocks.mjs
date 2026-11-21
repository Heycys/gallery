import { escapeText } from "../../../../shared/escape.mjs";
import { heldIn, newContainer, newHost, pastedLines } from "../../core.mjs";
import { pageBuild } from "../../../components/builders.mjs";
import { BLOCK_TYPES, COPIED_AS_ITSELF, HOLDS_ONE, TEXT_TYPES, TOGGLES, UNSAID, accepts, clipboardHooks, clipboardOf, isLead, sizeValue } from "../../../components/registry.mjs";
import { MAX_CELL_HTML } from "../../../components/table/index.mjs";
import { BLOCK_LOOKS, copied, copyOf, projectName } from "./describe.mjs";
import { imageSource, kindOfBlock, webPage } from "./rules.mjs";

// Described blocks (describe.mjs and selection.mjs, and import/to-blocks.mjs for other programs' content) made (build),
// and the clipboard's own data, which is not trusted, checked first (parse, checkBlocks): the
// structure against accepts(), at most 500 blocks, and every piece of inline HTML goes through
// pastedLines() again (the format bar's marks only). Another program's content is not checked
// that way: to-blocks.mjs makes blocks that fit (rules.mjs holds what both go by). What a block must
// be and how it is made again is its definition's (`clipboard.check`, `build`, with a text block
// and a filled container the engine's own), and it is written like any other made on the page.
// Besides the blocks the page makes from its menus: a formula block and a table (their data), and an
// image or an embed of an address, filled once on the page (PASTED_SOURCE: the clipboard fetches
// the picture, checks the page).

const COPIES = COPIED_AS_ITSELF; // the cards, a table, a row of columns
const LIMIT = 500; // blocks in one paste, containers' blocks counted
/** Where an image or embed pasted keeps its address until the clipboard fills it. */
export const PASTED_SOURCE = "data-ge-paste-src";

const string = (value, max = 1e6) => typeof value === "string" && value.length <= max;
// The blocks a description holds, `blocks` or where a definition says (`holds`), each asked whatever
// the block's type: the clipboard's data is not trusted to say only what its type does.
const HOLDS = clipboardHooks("holds");
const heldBy = (block) => [...(block.blocks ?? []), ...HOLDS.flatMap((holds) => holds(block))];
// A block of a type that wants what `preload` brings, as a description says it.
const WANTING = Object.keys(BLOCK_TYPES).filter((type) => BLOCK_TYPES[type].preload).map((type) => `"type":"${type}"`);

/**
 * Described blocks checked, or null when any is not one the page can make where it stands (`box`:
 * the kind of box they go in, null for the top), or they are more than `limit` (LIMIT, a paste's; a cut
 * asks with none, its blocks the page's own: clipboard/index.mjs cutRefusal). `doc`: the document markup a
 * description carries is read on (an instance's: installed `check`), the page's own unless said.
 */
export function checkBlocks(blocks, { limit = LIMIT, doc = globalThis.document } = {}) {
  let count = 0;
  const valid = (block, box = null) => {
    if (!block || typeof block !== "object" || ++count > limit) return false;
    const { type } = block;
    const clip = clipboardOf(type);
    if (box && !accepts(box, kindOfBlock(block)) && clip.pastedIn !== box) return false;
    if (block.color !== undefined && (typeof block.color !== "string" || !block.color.split(" ").every((name) => BLOCK_LOOKS.includes(name)))) return false;
    if (TEXT_TYPES.has(type)) return string(block.html);
    if (type === "copy") return COPIES.has(block.kind) && Number.isInteger(block.unit) && [block.report, block.text, block.html].every((value) => typeof value === "string") && projectName(block.project)
      && (block.data === undefined || (Boolean(clipboardOf(block.data?.type).data) && valid(block.data)));
    return Boolean(clip.check?.(block, {
      box, string, valid, isLead, imageSource, webPage, sizeValue, doc,
      // The blocks of a container, as the box it is takes them; `direction`, the test of a direction, where it may fix one.
      container: (held, direction) => Array.isArray(held.blocks) && (held.direction === undefined || Boolean(direction?.(held.direction))) && held.blocks.every((inner) => valid(inner, BLOCK_TYPES[type].box)),
    }));
  };
  return Array.isArray(blocks) && blocks.length > 0 && blocks.every((block) => valid(block)) ? blocks : null;
}

/**
 * The first copy among described blocks, in boxes too, that cannot be made on `doc`: its unit is not
 * on the page (another report's, or gone since) and it carries no data to make a new one of, or null.
 * With no `doc` (null: a cut takes them off the page) a copy is made only of its data.
 */
export function unmadeCopy(doc, blocks) {
  for (const block of blocks) {
    // A copy made of its data is made of what that holds too (an instance's slots: a card in one).
    const found = block.type === "copy" ? ((doc && copied(doc, block)) ? null : block.data ? unmadeCopy(doc, heldBy(block.data)) : block) : unmadeCopy(doc, heldBy(block));
    if (found) return found;
  }
  return null;
}

/**
 * The files of the folder that described blocks made of their data name (a media block's: its definition's
 * `files`, { path, kind } with `kind` the upload kind it is kept as), in boxes and copies' data too, each
 * once: what a paste into another document copies into its folder first (clipboard/carry.mjs). A copy made of
 * its unit (`doc` holds it: its own document) names none, the file copying that unit's source.
 */
export function filesOf(doc, blocks, found = new Map()) {
  for (const block of blocks) {
    if (block.type === "copy") {
      if (block.data && !(doc && copied(doc, block))) filesOf(doc, [block.data], found);
      continue;
    }
    for (const file of clipboardOf(block.type).files?.(block) ?? []) if (!found.has(file.path)) found.set(file.path, file);
    filesOf(doc, heldBy(block), found);
  }
  return [...found.values()];
}

/** Described blocks from the clipboard's own data (its MIME type): checked, or null when it is not such data. */
export function parse(data) {
  let value;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  return value?.v === 1 ? checkBlocks(value.blocks) : null;
}

/**
 * Cells copied from a table of the page (components/table CELLS_MIME: { v: 1, cells }) as rows of
 * their inline HTML, or null when it is no such data.
 */
export function parseCells(data) {
  let value;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  const rows = value?.v === 1 && Array.isArray(value.cells) ? value.cells : null;
  return rows?.length > 0 && rows.every((row) => Array.isArray(row) && row.length > 0 && row.every((cell) => string(cell, MAX_CELL_HTML))) ? rows : null;
}

/**
 * Text copied in one block from the clipboard's own data (its inline HTML: selection.mjs
 * selectedHtml), or null when it holds none. Not trusted either: pastedLines() makes of it the format
 * bar's marks alone, as of any inline HTML.
 */
export function parseText(data) {
  let value;
  try {
    value = JSON.parse(data);
  } catch {
    return null;
  }
  return value?.v === 1 && string(value.html) ? value.html : null;
}

/**
 * Inline HTML as nodes of the format bar's marks only, its lines with <br> between them; formulas
 * of other pages made the page's own by `formula(tex)` where given, links shown with their icon by
 * `mention(parts)`, pictures by `picture(img)` (a table cell's: pastedLines).
 */
function inline(doc, html, { formula = null, mention = null, picture = null } = {}) {
  return pastedLines(doc, html, { formula, mention, picture }).flatMap((line, index) => (index > 0 ? [doc.createElement("br"), ...line] : line));
}


// A block's colors (`color`: their classes, one of each family, and a text block's alignment and indent), those its kind takes (TOGGLES).
function colored(element, block) {
  for (const name of block.color?.split(" ") ?? []) if (TOGGLES[element.getAttribute("data-ge-unit-kind")]?.includes(name)) element.classList.add(name);
  return element;
}

/**
 * A new block of the page from a described one (checked). `formula(tex)`: an inline formula chip of
 * the page (none: their TeX as text); `mention(parts)`: a link shown with its icon (none: a link of
 * its title); `picture(img)`: a table cell's picture (none: nothing; `what.inline(html, { pictures:
 * true })` asks for it, a cell's text alone holding pictures). What each type adds is its definition's: `clipboard.build`, or the `build` of its
 * page.mjs (builders.mjs); a container is filled with its blocks, a text type with its inline HTML.
 */
export function build(doc, block, options = {}) {
  if (block.type === "copy") {
    // copied() found its unit: a copy of it, written by the commit as one (core.mjs nodeOf).
    const unit = copied(doc, block);
    if (unit) {
      const copy = copyOf(unit, { editable: true });
      copy.setAttribute("data-ge-new", "");
      copy.setAttribute("data-ge-type", "copy");
      copy.setAttribute("data-ge-copy", String(block.unit));
      copy.setAttribute("data-ge-unit-kind", block.kind);
      return copy;
    }
    // Elsewhere: a new one of its data (pasteBlocks checked it has some), with the key a chart or a
    // view reads a table by, which the paste then keeps, gives anew or takes off, in another document
    // too (chart-keys.mjs relinkCopies: a table pasted there alone loses it, one with its reader is a pair).
    return build(doc, block.data, options);
  }
  const what = {
    doc,
    block,
    host: (type = block.type) => newHost(doc, type),
    box: (type = block.type) => newContainer(doc, type),
    inline: (html, { pictures = false } = {}) => inline(doc, html, pictures ? options : { ...options, picture: null }),
    inner: (blocks) => blocks.map((each) => build(doc, each, options)),
    one: (each) => build(doc, each, options),
    colored: (element) => colored(element, block),
    pending(figure, src) {
      figure.setAttribute(PASTED_SOURCE, src);
      return figure;
    },
    // A file of the folder the description names, as a file of this document's folder (`options.files`: the
    // ones a paste copied in from another document, by the path they had there; else the same file), or null.
    fileHere: (path) => (options.files ? options.files.get(path) ?? null : path),
    // Where the page serves a file of this document's folder (`route`: shared/media.mjs MEDIA_ROUTES).
    served: (route, path) => options.served?.(route, path) ?? path,
  };
  const made = clipboardOf(block.type).build ?? pageBuild(block.type);
  if (made) return made(what);
  const { box, leaf } = BLOCK_TYPES[block.type] ?? {};
  const element = box ? what.box() : what.host();
  element.append(...(box ? what.inner(block.blocks) : what.inline(block.html)));
  // A box that always holds a block (holdsOne: a highlight block, a callout) described with none (one
  // the file has empty, copied or cut) holds an empty block of its `leaf` (a paragraph, as a new one
  // made from "/" holds), after its lead (a highlight block's icon), as one a change empties does
  // (core.mjs tidyEmptied) and a disclosure's content made again (details/page.mjs): a block to write
  // in, and one the commit writes, where a box of no blocks is written by none (core.mjs nodeOf) and
  // was gone at the next reload.
  if (leaf && HOLDS_ONE.has(box) && heldIn(element).length === 0) element.append(what.host(leaf));
  return what.colored(element);
}

// What a block copied as itself says where it carries no data (a card, a row of columns): the words
// of its markup on one line, UNSAID left out; no line when it says nothing.
function wordsOf({ html }) {
  const template = globalThis.document.createElement("template");
  template.innerHTML = html;
  for (const node of template.content.querySelectorAll(UNSAID)) node.remove();
  const words = template.content.textContent.replace(/\s+/g, " ").trim();
  return words ? [escapeText(words)] : [];
}

/**
 * The text of described blocks as inline HTML of the format bar's marks, one `<p>` for each line of
 * it (a block's text, an item's, a table's cell, a line of code, a tab's name, what a block copied
 * as itself says), for a place that cannot split (a table's cell, a title): pastedLines() reads it
 * as it reads any inline HTML.
 */
export function joinedHtml(blocks) {
  const lines = (list) => list.flatMap((block) => {
    if (block.type === "copy") return block.data ? lines([block.data]) : wordsOf(block);
    const text = clipboardOf(block.type).text;
    return text ? text(block, lines) : block.blocks ? lines(block.blocks) : [block.html];
  });
  return lines(blocks).map((line) => `<p>${line}</p>`).join("");
}

/** Whether described blocks hold formulas (inline ones, or a block that wants what `preload` brings), which want KaTeX on the page. */
export function holdsFormulas(blocks) {
  const json = JSON.stringify(blocks);
  return json.includes("doc-math-inline") || WANTING.some((type) => json.includes(type));
}
