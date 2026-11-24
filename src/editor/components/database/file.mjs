import { parseFragment, serializeOuter } from "parse5";
import { DATA_MOST, SLOT, fitsDataScript, refusedInCopy } from "../../../shared/components/installed.mjs";
import { DATABASE_CLASS, DATABASE_FORMAT, PAGES_CLASS, RECORD_ATTRIBUTE, databasePages, databaseProblems, harmlessAttribute, isJsonType, slotRecord } from "../../../shared/database.mjs";
import { attr, walk } from "../../../shared/html-tree.mjs";
import { fits } from "../installed/file.mjs";

// 多维表格 in report.html (the server's, source/): a database is one block, div.doc-database, and what its
// drawing writes is its two parts (src/shared/database.mjs): its script of JSON and its <table>, each a
// splice of the part's inside alone, as an instance's data parts are written (installed/file.mjs
// `rewrite`, whose check of what reads as just that inside it shares: `fits`). A part the file does not
// hold yet (an Agent's table with no JSON) is written in where it goes: the script first in the block, the
// table after it; a part the page writes empty is none, taken out where the file holds it (the undo of
// the change that wrote it in), and a part the file does not hold reads as empty. None of it is text of
// the document's (`textParts`: none, and the scan goes no further in: source/blocks.mjs). A new one (the
// "/" menu, a copy from another document) is written from the markup the page sends, checked to be a
// database of its format and nothing else. Its JSON is a script of type application/json alone, in any case
// (isJsonType), spelled as the file has it.
//
// Its records' bodies (src/shared/database.mjs databasePages: div.doc-database-pages after its table, a slot
// data-doc-slot="record:<id>" a record) are the document's blocks: boxes of kind "record" (`boxes`), which the
// scan goes on in as in an instance's slots, every block in one edited, moved and written as anywhere. A record
// given its first body on the page has no slot in the file yet: the commit that puts a block into it makes
// the slot first (`makeSlot`, source/commit.mjs), and the pages after the table where there are none. A copy
// carrying bodies (another document's, or one of a database holding any) is written as its markup with those
// slots empty and its blocks apart, each in its slot (`source`'s `children`, `boxKeys`), as an instance's.

const isScript = (node) => node.tagName === "script" && isJsonType(attr(node, "type"));
const isPages = (node) => node.tagName === "div" && (attr(node, "class") ?? "").split(/\s+/).includes(PAGES_CLASS);
// The ids its rows say (data-record), of parse5's table.
const recordIds = (table) => {
  const ids = new Set();
  walk({ childNodes: table ? [table] : [] }, (node) => { if (node.tagName === "tr" && attr(node, RECORD_ATTRIBUTE)) ids.add(attr(node, RECORD_ATTRIBUTE)); });
  return ids;
};
// Whether a parsed node is blank text.
const blankNode = (node) => node.nodeName === "#text" && !node.value.trim();
// The blanks before the line `offset` is on, in `source`.
const lineIndent = (source, offset) => /[ \t]*$/.exec(source.slice(source.lastIndexOf("\n", offset - 1) + 1, offset))?.[0] ?? "";
// Its two parts in the file, its own children: the first script of data and the first table.
const partsOf = (node) => ({
  columns: node.childNodes.find((child) => isScript(child) && child.sourceCodeLocation?.endTag) ?? null,
  records: node.childNodes.find((child) => child.tagName === "table" && child.sourceCodeLocation?.endTag) ?? null,
});
const inside = (source, part) => source.slice(part.sourceCodeLocation.startTag.endOffset, part.sourceCodeLocation.endTag.startOffset);

// The markup of a database the page sends: one div.doc-database of no attribute but its class (and an
// id the commit gives it), holding a script of JSON and a table (of no attribute but those that change nothing) at most, blanks between
// them, nothing any copy may not bring (refusedInCopy), and nothing its format does not hold (a table the
// drawing could not write: databaseProblems); after them, where it carries bodies, its div.doc-database-pages of
// empty slots alone, each of no attribute but its name and of a record its table names (data-record), none twice
// (what they hold comes apart: `source`). Its markup as a parser reads it, or null.
function databaseMarkup(html) {
  if (typeof html !== "string" || html.length > DATA_MOST) return null;
  const [root, ...more] = parseFragment(html.trim()).childNodes;
  if (!root || more.length > 0 || root.tagName !== "div" || attr(root, "class") !== DATABASE_CLASS || root.attrs.some(({ name }) => name !== "class" && name !== "data-block-id")) return null;
  const children = root.childNodes.filter((child) => !blankNode(child));
  const scripts = children.filter((child) => child.tagName === "script");
  const tables = children.filter((child) => child.tagName === "table");
  const pages = children.filter(isPages);
  if (scripts.length > 1 || tables.length > 1 || pages.length > 1 || scripts.length + tables.length + pages.length !== children.length || (pages.length > 0 && children.at(-1) !== pages[0])) return null;
  if (scripts.some((script) => !isScript(script) || script.attrs.length !== 1 || !fitsDataScript(script.childNodes.map((child) => child.value ?? "").join("")))) return null;
  if (tables.some((table) => table.attrs.some(({ name }) => !harmlessAttribute(name))) || databaseProblems(root).length > 0) return null;
  let refused = false;
  walk({ childNodes: tables }, (node) => { refused ||= node.tagName === "script" || refusedInCopy(node.tagName, node.attrs); });
  if (refused) return null;
  if (pages.length > 0) {
    const ids = recordIds(tables[0]);
    const slots = pages[0].childNodes.filter((child) => !blankNode(child));
    const names = new Set();
    const empty = (slot) => slot.tagName === "div" && slot.attrs.length === 1 && slot.attrs[0].name === SLOT && slot.childNodes.every(blankNode);
    if (pages[0].attrs.length !== 1 || slots.length === 0 || !slots.every((slot) => empty(slot) && ids.has(slotRecord(attr(slot, SLOT))) && !names.has(attr(slot, SLOT)) && names.add(attr(slot, SLOT)))) return null;
  }
  root.attrs = root.attrs.filter(({ name }) => name === "class");
  return serializeOuter(root);
}

// A node of parse5's as what it reads as (its serialization): two that say the same are the same node. In a
// table, its sections and its rows, the blanks between the elements are none of it: a browser keeps them as
// text that nothing reads (the format reads a row's cells alone: src/shared/database.mjs), so that a row an
// Agent laid out a cell a line reads as the page's row of one line.
const HTML = "http://www.w3.org/1999/xhtml";
const LAID_OUT = new Set(["table", "thead", "tbody", "tfoot", "tr"]);
const blankText = (node) => node.nodeName === "#text" && /^[ \t\n\f\r]*$/.test(node.value);
// A node as the serializer is to take it: a table's, a section's or a row's copy with no blank between its children.
const unlaid = (node) => (node.tagName && LAID_OUT.has(node.tagName) && node.namespaceURI === HTML ? { ...node, childNodes: node.childNodes.filter((child) => !blankText(child)).map(unlaid) } : node);
const sameAs = (node) => (node.tagName ? serializeOuter(unlaid(node)) : node.nodeName === "#text" ? `#text:${node.value}` : node.nodeName === "#comment" ? `#comment:${node.data}` : node.nodeName);
const located = (node) => Boolean(node.sourceCodeLocation);
// Whether a node of the file is written whole: every element in it closed by its own end tag (a <br> needs
// none), which is what a part's inside may hold (installed/file.mjs `fits`); a row of implied end tags is
// written anew as the page writes it.
const whole = (node) => !node.tagName || node.tagName === "br" || (Boolean(node.sourceCodeLocation?.endTag) && (node.childNodes ?? []).every(whole));

/**
 * What the records part (`part`, the file's <table>) is to hold in the file for `html`, what the page wrote
 * of it (in the file's line endings): the page's markup, but for each section and row that reads as one of the
 * file's, which stays the file's own bytes (an Agent's attributes as it spelled them, its entities: a row the
 * reader did not change stays as the file had it, byte for byte). The blanks between them are the page's (the
 * file's where the page kept them). A section's rows are lined up one by one where as many are there as before
 * (a cell typed, a column filled), else those at its start and its end that read the same (a record added or
 * taken out between). One whose bytes are the file's already is left as it is (a long table's every other row,
 * as the page writes them after its first write): nothing put back, nothing compared. Checked, where anything
 * was put back, to read as `html` reads (the blanks between a table's rows and cells aside: `sameAs`), else
 * `html` itself.
 */
function keptInside(source, part, html) {
  const { startTag, endTag } = part.sourceCodeLocation;
  const open = source.slice(startTag.startOffset, startTag.endOffset);
  const close = source.slice(endTag.startOffset, endTag.endOffset);
  const after = `${open}${html}${close}`;
  const read = (text, located = true) => {
    const nodes = parseFragment(part.parentNode, text, { sourceCodeLocationInfo: located }).childNodes;
    return nodes.length === 1 && nodes[0].tagName === part.tagName ? nodes[0] : null;
  };
  // The file's table is its node as the file was read (its offsets in `source`: no second reading of a long
  // table); the page's is read here.
  const was = part;
  const now = read(after);
  if (!now) return html;
  const splices = []; // on the page's markup: the file's bytes put back
  const from = (node) => node.sourceCodeLocation.startOffset;
  const to = (node) => node.sourceCodeLocation.endOffset;
  const fileBytes = (node) => source.slice(from(node), to(node));
  const pageBytes = (node) => after.slice(from(node), to(node));
  const elements = (node) => node.childNodes.filter((child) => child.tagName);
  const shapes = new Map(); // what each node reads as, worked out once
  const shapeOf = (node) => {
    if (!shapes.has(node)) shapes.set(node, sameAs(node));
    return shapes.get(node);
  };
  // Whether the file's node stays as its bytes are for the page's node there: the same bytes, or the same
  // reading of a node written whole.
  const alike = (a, b) => fileBytes(a) === pageBytes(b);
  const keeps = (a, b) => alike(a, b) || (whole(a) && shapeOf(a) === shapeOf(b));
  const section = (a, b) => a.tagName === b.tagName && /^(?:thead|tbody|tfoot)$/.test(a.tagName) && Boolean(a.sourceCodeLocation?.startTag && a.sourceCodeLocation.endTag && b.sourceCodeLocation?.startTag && b.sourceCodeLocation.endTag) && JSON.stringify(a.attrs) === JSON.stringify(b.attrs);
  const pair = (a, b, depth) => {
    if (alike(a, b)) return;
    if (keeps(a, b)) splices.push({ start: from(b), end: to(b), text: fileBytes(a) });
    else if (depth === 0 && section(a, b)) line(a, b, 1);
  };
  const line = (was, now, depth) => {
    const old = elements(was);
    const fresh = elements(now);
    if (![...old, ...fresh].every(located)) return;
    if (old.length === fresh.length) return old.forEach((node, at) => pair(node, fresh[at], depth));
    let head = 0;
    while (head < old.length && head < fresh.length && keeps(old[head], fresh[head])) head++;
    let tail = 0;
    while (tail < old.length - head && tail < fresh.length - head && keeps(old[old.length - 1 - tail], fresh[fresh.length - 1 - tail])) tail++;
    for (let at = 0; at < head; at++) pair(old[at], fresh[at], depth);
    for (let at = 1; at <= tail; at++) pair(old[old.length - at], fresh[fresh.length - at], depth);
  };
  line(was, now, 0);
  if (splices.length === 0) return html;
  // The page's markup with the file's bytes in their places, in one pass (a long table is long).
  const pieces = [];
  let at = 0;
  for (const { start, end, text } of splices.sort((a, b) => a.start - b.start)) {
    pieces.push(after.slice(at, start), text);
    at = end;
  }
  pieces.push(after.slice(at));
  const kept = pieces.join("");
  const back = read(kept, false); // what it reads as alone: no offsets needed
  if (!back || sameAs(back) !== shapeOf(now) || !kept.startsWith(open) || !kept.endsWith(close)) return html;
  return kept.slice(open.length, kept.length - close.length);
}

export default {
  database: {
    /** None of it is a text block: its words are its drawing's to write. */
    textParts: () => [],
    /** What a write of it goes by: the shape of what it holds (one sent by another is refused, and the page shown again). */
    definition: () => DATABASE_FORMAT,
    /** What its drawing writes, as the file holds it: the inside of each part, by name, empty for one it does not hold. */
    dataOf(source, node) {
      const parts = partsOf(node);
      return { columns: parts.columns ? inside(source, parts.columns) : "", records: parts.records ? inside(source, parts.records) : "" };
    },
    /**
     * What its drawing wrote (`parts`: columns, records, as the page serialized them): each part's inside
     * spliced, in the file's line endings, a part the file has not written in its place, an empty one taken
     * out where the file holds it (the element alone, so that a part written in and taken out again leaves
     * the file as it was), or null when any of it may not go in.
     */
    rewrite(source, node, parts) {
      const names = Object.keys(parts ?? {});
      if (names.length === 0 || !names.every((name) => (name === "columns" || name === "records") && typeof parts[name] === "string")) return null;
      if (names.reduce((sum, name) => sum + Buffer.byteLength(parts[name]), 0) > DATA_MOST) return null;
      const eol = source.includes("\r\n") ? "\r\n" : "\n";
      const lined = (text) => text.replace(/\r?\n/g, eol);
      const held = partsOf(node);
      const { startTag, endTag } = node.sourceCodeLocation;
      if (!endTag) return null;
      const splices = [];
      for (const name of names) {
        if (parts[name] !== "" || !held[name]) continue;
        const { startTag: from, endTag: to } = held[name].sourceCodeLocation;
        splices.push({ start: from.startOffset, end: to.endOffset, text: "" });
      }
      if (typeof parts.columns === "string" && parts.columns !== "") {
        if (held.columns) {
          if (!fits(source, held.columns, parts.columns)) return null;
          splices.push({ start: held.columns.sourceCodeLocation.startTag.endOffset, end: held.columns.sourceCodeLocation.endTag.startOffset, text: lined(parts.columns) });
        } else {
          if (!fitsDataScript(parts.columns)) return null;
          splices.push({ start: startTag.endOffset, end: startTag.endOffset, text: lined(`<script type="application/json">${parts.columns}</script>`) });
        }
      }
      if (typeof parts.records === "string" && parts.records !== "") {
        if (held.records) {
          if (!fits(source, held.records, parts.records)) return null;
          const page = lined(parts.records);
          const kept = keptInside(source, held.records, page);
          // The file's bytes put back are checked as the page's were; none put back, the page's stand.
          const inside = kept === page || fits(source, held.records, kept) ? kept : page;
          splices.push({ start: held.records.sourceCodeLocation.startTag.endOffset, end: held.records.sourceCodeLocation.endTag.startOffset, text: inside });
        } else {
          const made = databaseMarkup(`<div class="${DATABASE_CLASS}"><table>${parts.records}</table></div>`);
          if (!made) return null;
          splices.push({ start: endTag.startOffset, end: endTag.startOffset, text: lined(`<table>${parts.records}</table>`) });
        }
      }
      return splices;
    },
    /**
     * A new one's markup (`html`: what the page made or a copy carried), checked, as the file is to hold it, or
     * null. What its records' bodies hold comes apart (`children`, each in the slot of the name `boxKeys` gives at
     * its index): its markup holds those slots empty, every one of them some block's, and those blocks are then
     * written in them as any block made on the page, each with the id the page knows (source/apply.mjs).
     */
    source({ html, children, boxKeys }, { written }) {
      const markup = databaseMarkup(html);
      if (!markup) return null;
      const slots = databasePages(parseFragment(markup).childNodes[0]).slots.map((slot) => slot.name);
      if (children === undefined ? slots.length > 0 : !(Array.isArray(children) && Array.isArray(boxKeys) && boxKeys.length === children.length && boxKeys.every((key) => slots.includes(key)) && slots.every((name) => boxKeys.includes(name)))) return null;
      return written(markup);
    },
    unwritten: () => "invalid",
    /**
     * The boxes it holds (the scan's, source/units.mjs): its records' bodies, of kind "record", keyed by their
     * slot's name, the first of each name of a record (src/shared/database.mjs databasePages).
     */
    boxes(node) {
      return databasePages(node).slots.filter((slot) => slot.first && slot.record && slot.node.sourceCodeLocation?.startTag).map((slot) => ({ element: slot.node, kind: "record", key: slot.name }));
    },
    /** Its record bodies are made in the file as a block first goes into one (makeSlot), and taken out once a commit empties one (dropSlot). */
    slotKinds: ["record"],
    /**
     * The splice that takes the slot `name` out of database `node` (parse5's, of `source`): a body a commit left
     * with no block (the undo of its first word), its lines with it, and its pages where it was their last; null
     * where it holds none of that name.
     */
    dropSlot(source, node, name) {
      const { pages, slots } = databasePages(node);
      const slot = slots.find((each) => each.name === name)?.node;
      if (!slot?.sourceCodeLocation?.endTag || !pages?.sourceCodeLocation?.endTag) return null;
      const whole = slots.length === 1 ? pages : slot;
      const { startOffset, endOffset } = whole.sourceCodeLocation;
      // Its own lines: from the blanks before it on its line to the line's end after it, where nothing else stands there.
      const lineStart = source.lastIndexOf("\n", startOffset - 1) + 1;
      const before = source.slice(lineStart, startOffset);
      const rest = /^[ \t]*\r?\n/.exec(source.slice(endOffset))?.[0];
      return /^[ \t]*$/.test(before) && rest !== undefined ? { start: lineStart, end: endOffset + rest.length, text: "" } : { start: startOffset, end: endOffset, text: "" };
    },
    /**
     * The splice that gives database `node` (parse5's, of `source`) the empty slot `name` (`record:<id>`) a block
     * goes into, the first of a record's body (source/commit.mjs: a commit putting blocks into a body the file does
     * not hold yet): at the end of its pages, or with a div.doc-database-pages of its own after the rest, each on a
     * line of its own a step in from its container's. Null where it holds that slot already, or cannot be given one.
     */
    makeSlot(source, node, name) {
      if (!slotRecord(name) || !node.sourceCodeLocation?.endTag) return null;
      const { pages, slots } = databasePages(node);
      if (slots.some((slot) => slot.name === name)) return null;
      const eol = source.includes("\r\n") ? "\r\n" : "\n";
      const own = lineIndent(source, node.sourceCodeLocation.startTag.startOffset);
      const step = /^\t+$/.test(own) ? "\t" : "  ";
      // Its end tag on a line of its own, so that the blocks going in stand on lines of their own.
      const slot = (at) => `<div ${SLOT}="${name}">${eol}${at}</div>`;
      if (pages) {
        if (!pages.sourceCodeLocation?.endTag) return null;
        const at = pages.sourceCodeLocation.endTag.startOffset;
        const line = lineIndent(source, pages.sourceCodeLocation.startTag.startOffset);
        const before = source.slice(pages.sourceCodeLocation.startTag.endOffset, at);
        // On a line of its own before the end tag, where that stands on a line of its own; else after what stands before it.
        const closeOnOwnLine = /\n[ \t]*$/.test(before);
        return closeOnOwnLine
          ? { start: at - lineIndent(source, at).length, end: at - lineIndent(source, at).length, text: `${line}${step}${slot(line + step)}${eol}` }
          : { start: at, end: at, text: `${eol}${line}${step}${slot(line + step)}${eol}${line}` };
      }
      const at = node.sourceCodeLocation.endTag.startOffset;
      const inner = own + step;
      const block = `<div class="${PAGES_CLASS}">${eol}${inner}${step}${slot(inner + step)}${eol}${inner}</div>`;
      const closeOnOwnLine = /\n[ \t]*$/.test(source.slice(node.sourceCodeLocation.startTag.endOffset, at));
      return closeOnOwnLine
        ? { start: at - lineIndent(source, at).length, end: at - lineIndent(source, at).length, text: `${inner}${block}${eol}` }
        : { start: at, end: at, text: `${eol}${inner}${block}${eol}${own}` };
    },
  },
};
