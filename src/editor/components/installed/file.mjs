import { parseFragment, serializeOuter } from "parse5";
import { instanceMarkup, templateOf } from "../../../shared/component-catalog.mjs";
import { heldByNode, instanceSlots, isInstance, isSlot, ownSlots, partOf } from "../../../shared/components/index.mjs";
import { ATTRIBUTE, DATA_MOST, NO_TEXT, PACKAGE_ID, SCHEMA, SLOT, fitsDataScript, isDataScript, noDataPart, refusedInCopy, refusedInData, schemaAhead } from "../../../shared/components/installed.mjs";
import { attr, walk } from "../../../shared/html-tree.mjs";
import { CHART_KEY, VIEW_FROM } from "../../../shared/table-chart.mjs";

// 组件 in report.html (the server's, source/): an instance is written by whoever made it and copied
// from its own source, so what the server reads of it is what the scan does: which of its elements
// its package's manifest edits as text. What stands in its slots (data-doc-slot) is the document's
// blocks, no part of it, and a slot itself is none of its text or data parts: the scan goes on in it
// (units.mjs slotBoxesOf). An instance in an instance is the inner one's, an element the
// parser implied has no place in the file, one that holds no text stays out whatever a selector of no
// tag finds (a manifest that names its tag does not load), a part in another part is that one's
// words, an element two parts name is one text block, and what stands in a part edited as data, or
// holds one, is the component's and no text block at all. An instance past its manifest (schemaAhead)
// has no text block either: what it says is read as a newer version of the package meant it, and
// nothing here writes it.
//
// What it writes of one made on the page is what the file is to say, never what the page drew:
// from "/" the markup of its manifest's template, however old the page's list is, and from what it
// carries the markup the clipboard or the page sent, of which nothing may run. Each comes through
// instanceMarkup, so that a block stands in the file as one block whatever came in. What its slots hold
// comes apart, blocks made on the page (`source`): its slots are written empty, and those blocks in them.
//
// A component writes back by `rewrite`, as a table's rows are written: a part edited as data gets a
// new inside, every other byte of the file staying, and only what would read as that inside and no
// more goes in, whoever sent it (`fits`). `definition` is what a commit is held to: the page ran the
// component by the manifest of that stamp.

const inside = (part, other) => {
  for (let around = part.parentNode; around; around = around.parentNode) if (around === other) return true;
  return false;
};

const instanceAround = (node) => {
  let around = node.parentNode;
  while (around && !isInstance(around)) around = around.parentNode;
  return around ?? null;
};

// Whether a parsed element is of instance `node`'s own: in its own region (components/index.mjs
// heldByNode: not in one of its slots), in no instance in it, and no slot itself.
const ownOf = (part, node) => instanceAround(part) === node && heldByNode(part) === node && !isSlot(part);

// The elements of an instance its component writes, [[name, element]]: of each part its manifest edits
// as data the first it holds, as `context.part` finds it. One in another is written with that one, and
// an element two parts name is the first's.
function dataParts(node, packages) {
  const parts = Object.entries(packages.get(attr(node, ATTRIBUTE))?.parts ?? {}).filter(([, { edit }]) => edit === "data");
  const first = parts.map(([name, { at }]) => [name, partOf(node, at).find((part) => part.sourceCodeLocation && !isInstance(part) && ownOf(part, node))]).filter(([, part]) => part);
  return first.filter(([, part], index) => !first.some(([, other], at) => inside(part, other) || (other === part && at < index)));
}

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const HTML_SPACE = "http://www.w3.org/1999/xhtml";
const childrenOf = (node) => (node.content ?? node).childNodes;
// Whether `node`'s children, read from `text`, are all that stands from `from` to `to`, in order, each
// closed by its own end tag: anything a parser would drop or move (an end tag of nothing, a stray
// doctype, what a table sends out of itself) or put in (a tbody, an end tag left out) leaves a gap
// or an element with no place. So what a browser's serializer writes passes and nothing that leans on
// the parser does, as what passes in a parse of its own reads the same around anything in the file.
function wholly(node, text, from, to) {
  let at = from;
  for (const child of childrenOf(node)) {
    const place = child.sourceCodeLocation;
    if (place?.startOffset !== at) return false;
    if (child.tagName) {
      const { startTag, endTag } = place;
      const closed = VOID.has(child.tagName) || (child.namespaceURI !== HTML_SPACE && text.startsWith("/>", place.endOffset - 2)); // a drawing's <path/>
      if (endTag ? !wholly(child, text, startTag.endOffset, endTag.startOffset) : !closed) return false;
    }
    at = place.endOffset;
  }
  return at === to;
}

// Whether `html` can be the inside of `part` (an element of the file `source`): it reads as just that,
// the part closed by its own end tag at the end of it, and holds nothing refusedInData says. A script
// of data holds JSON (fitsDataScript).
export function fits(source, part, html) {
  if (part.tagName === "script") return isDataScript(part.tagName, part.attrs) && fitsDataScript(html);
  if (noDataPart(part.tagName)) return false;
  const { startTag, endTag } = part.sourceCodeLocation;
  const open = source.slice(startTag.startOffset, startTag.endOffset);
  const text = `${open}${html}${source.slice(endTag.startOffset, endTag.endOffset)}`;
  const [read, ...more] = parseFragment(part.parentNode, text, { sourceCodeLocationInfo: true }).childNodes;
  if (more.length > 0 || read?.tagName !== part.tagName || read.sourceCodeLocation?.endOffset !== text.length || !read.sourceCodeLocation.endTag) return false;
  if (!wholly(read, text, open.length, open.length + html.length)) return false;
  let refused = false;
  walk(read, (node) => { refused ||= refusedInData(node.tagName, node.attrs); });
  return !refused;
}

// The elements of an instance's own region its manifest names as parts edited as text or data.
const namedParts = (node, packages) => Object.values(packages.get(attr(node, ATTRIBUTE))?.parts ?? {})
  .filter(({ edit }) => edit === "text" || edit === "data").flatMap(({ at }) => partOf(node, at).filter((part) => ownOf(part, node)));

export default {
  installed: {
    /**
     * Its slots whose insides are the document's (components/index.mjs instanceSlots), but one in a part
     * its manifest edits as text or data, which is the component's to write (the checks fail it). With
     * no package, every one.
     */
    slots(node, packages) {
      const parts = namedParts(node, packages);
      return instanceSlots(node).filter((slot) => !parts.some((part) => inside(slot, part)));
    },
    /** The boxes it holds (the scan's, source/units.mjs): its slots, of kind "slot", keyed by their name. */
    boxes(node, packages) {
      return this.slots(node, packages).map((element) => ({ element, kind: "slot", key: attr(element, SLOT) }));
    },
    textParts(node, packages) {
      const found = packages.get(attr(node, ATTRIBUTE));
      if (schemaAhead(attr(node, SCHEMA), found?.schema)) return [];
      const said = Object.values(found?.parts ?? {}).filter(({ edit }) => edit === "text");
      const data = dataParts(node, packages).map(([, part]) => part);
      const parts = [...new Set(said.flatMap(({ at }) => partOf(node, at)))].filter((part) => part.sourceCodeLocation && !isInstance(part) && !NO_TEXT.has(part.tagName) && ownOf(part, node))
        .filter((part) => !data.some((other) => other === part || inside(part, other) || inside(other, part)));
      return parts.filter((part) => !parts.some((other) => inside(part, other))).map((part) => ({ kind: "installed", part }));
    },
    /**
     * The markup of an instance made on the page: its template's, or what the page carried (`html`).
     * What its slots hold comes apart, blocks of the page's own (`children`, each in the slot of the name
     * `boxKeys` gives at its index): the slots are written empty here, and those blocks then written in
     * them as any block made on the page, each with an id the page knows (source/apply.mjs). Blocks
     * written whole with the markup would take none, so what a page carried holds none in a slot, and
     * a template's slot holds none where nothing came apart (a page from before such a page could). A view
     * of a table (`from`: the key of the table it reads as the page has it, src/shared/table-chart.mjs: a
     * view made from a menu of its template (bound to the table above it), or a paste gave the one it carried a key of its own) is written
     * with that key on it (VIEW_FROM), in place of any its markup carries; `from` null (one carried with no
     * key on the page: pasted into another document) with none.
     */
    source({ package: id, html, children, boxKeys, from }, { packages, written }) {
      if (typeof id !== "string" || !PACKAGE_ID.test(id)) return null;
      const apart = children !== undefined;
      if (apart && !(Array.isArray(children) && Array.isArray(boxKeys) && boxKeys.length === children.length)) return null;
      if (from !== undefined && from !== null && (typeof from !== "string" || !CHART_KEY.test(from))) return null;
      const text = html === undefined ? (packages.has(id) ? templateOf(packages.get(id)) : null) : html;
      let read = typeof text === "string" ? instanceMarkup(text, id) : null;
      if (read && (typeof from === "string" || (from === null && attr(read.root, VIEW_FROM) !== undefined))) {
        read.root.attrs = [...read.root.attrs.filter(({ name }) => name !== VIEW_FROM), ...(from === null ? [] : [{ name: VIEW_FROM, value: from }])];
        read = instanceMarkup(serializeOuter(read.root), id);
      }
      if (!read) return null;
      const slots = ownSlots(read.root);
      const holds = (slot) => !slot.childNodes.every((child) => child.nodeName === "#text" && !child.value.trim());
      if ((html !== undefined || !apart) && slots.some(holds)) return null;
      if (apart && !boxKeys.every((key) => slots.some((slot) => attr(slot, SLOT) === key))) return null;
      if (html !== undefined) {
        let refused = false;
        walk({ childNodes: [read.root] }, (node) => { refused ||= refusedInCopy(node.tagName, node.attrs); });
        if (refused) return null;
      }
      // Each slot emptied, from the last on, its end tag right after its start tag.
      const emptied = slots.map((slot) => slot.sourceCodeLocation).sort((a, b) => b.startOffset - a.startOffset)
        .reduce((markup, { startTag, endTag }) => markup.slice(0, startTag.endOffset) + markup.slice(endTag.startOffset), read.markup);
      return written(apart ? emptied : read.markup);
    },
    /** Why `source` wrote nothing, as a commit says it: "no-package" where the reader is to hear that, of a menu's block whose package is gone. */
    unwritten: ({ package: id, html }, { packages }) => (html === undefined && PACKAGE_ID.test(id) && !packages.has(id) ? "no-package" : "invalid"),
    /** What a commit that writes an instance is held to: the stamp of its package's manifest now, or undefined for one that does not load. */
    definition: (node, packages) => packages.get(attr(node, ATTRIBUTE))?.definition,
    /** What its component writes, as the file holds it: the inside of each data part, by name, or null where it writes nothing. */
    dataOf(source, node, packages) {
      const parts = dataParts(node, packages).filter(([, part]) => part.sourceCodeLocation.endTag);
      return parts.length > 0 ? Object.fromEntries(parts.map(([name, part]) => [name, source.slice(part.sourceCodeLocation.startTag.endOffset, part.sourceCodeLocation.endTag.startOffset)])) : null;
    },
    /**
     * What a component wrote to its data parts (`parts`: name -> what the part is to hold, as the page
     * serialized it), each a splice of the part's inside alone, in the file's line endings, or null: an
     * instance past its manifest (schemaAhead) is read-only, and nothing of such a commit goes in when any
     * of it may not.
     */
    rewrite(source, node, parts, { packages }) {
      const written = new Map(dataParts(node, packages));
      const names = Object.keys(parts);
      const held = names.map((name) => parts[name]);
      if (schemaAhead(attr(node, SCHEMA), packages.get(attr(node, ATTRIBUTE))?.schema) || names.length === 0 || !held.every((html) => typeof html === "string") || !names.every((name) => written.has(name))) return null;
      if (held.reduce((sum, html) => sum + Buffer.byteLength(html), 0) > DATA_MOST) return null;
      if (!names.every((name) => written.get(name).sourceCodeLocation.endTag && fits(source, written.get(name), parts[name]))) return null;
      const eol = source.includes("\r\n") ? "\r\n" : "\n";
      return names.map((name) => {
        const { startTag, endTag } = written.get(name).sourceCodeLocation;
        return { start: startTag.endOffset, end: endTag.startOffset, text: parts[name].replace(/\r?\n/g, eol) };
      });
    },
  },
};
