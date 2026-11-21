import { accepts, attributeValue, BLOCK_TYPES, boxRole, CHAPTER, holdsStraight, IDENTITY, isLead, SIZES, sizeValue, TOGGLES } from "../components/registry.mjs";
import { tabButton } from "../components/sheets/file.mjs";
import { FILES, foreignFields } from "../components/files.mjs";
import { iconMarkup, iconValueOf, validIcon } from "../components/icon/index.mjs";
import { scan } from "./blocks.mjs";
import { checkParts, convertible, emptyLeaf, leafHtml, LEAVES, validAttributes, validCell, validLeaf } from "./checks.mjs";
import { hashOf } from "./html.mjs";
import { currentCatalog } from "../../shared/component-catalog.mjs";
import { attr } from "../../shared/html-tree.mjs";
import { pageLanguage } from "../../shared/components/page.mjs";
import { SHEETS } from "../components/kit.mjs";
import { BLOCK_ID } from "../../shared/ids.mjs";
import { ID_PATTERN, randomBlockId } from "./ids.mjs";
import { attributeSplices } from "./tag.mjs";
import { attributesText, attributeSpan, cutLines, declarationsWith, lineIndent, reindent, removeLines, restoredUnit, retitle, tagEnd, textOf } from "./text.mjs";
import { carriedOf, heldBoxesOf, kindIn } from "./units.mjs";

// edits: [{ id, parts }]. `parts` are the blocks this block becomes, in order.
//   { keep: true, html } reuses the original start and end tags (attributes untouched);
//   { tag, html } is a new block split off with Enter; an empty `parts` removes the block.
// Everything is applied to `current`, the file as it is now, by the indexes of its blocks and
// units (findBlocks, findUnits): finding what the page named in a file that changed is
// commitEdits's job (it resolves each name first), nothing here looks for a block again.
// With `partial`, edits that conflict are left out (and listed) instead of failing the whole
// call: a commit (commitEdits) writes what it can and holds the rest back for the reader.
// units: [{ id, remove: true }] deletes units (findUnits) with everything inside them
// (a Sheet tab with its panel; never a Sheet's last tab); text edits inside a deleted unit go with
// it. [{ id, toggle, on }] switches one of the
// classes the unit's kind allows (TOGGLES: a section's divider line, a centered card) in its start
// tag; [{ id, size, value }] sets one of the sizes it takes (SIZES: a card's or table's width and
// height) in its style attribute, or removes it (value null); [{ id, attribute, value }] sets one of the
// attributes it takes (ATTRIBUTES: a code block's language) in its start tag, or removes it (value
// null). [{ id, replace: { type, html } }]
// turns a text block that is a unit of its own (a plain p, h3, h4, li or 小字) into another type
// of text block in place (BLOCK_TYPES), keeping the comments above it (a code block, back into text); [{ id, retag }] turns a list
// into the other kind of list. [{ id, table }] and [{ id, source }] write a unit's inside anew by its
// component (`rewrite`: a table's rows, an instance's data parts). [{ id: "n<k>", insert, place }] writes a block made on the page
// { after } or { before } a unit that stays, or { into } a box: a text block { type, html }, or a
// container { type, children } (a section also has a `title`) whose children may be original units
// { unit: id }, taken from their place with everything inside them; { restore, type, children } a
// unit deleted around its blocks put back around them, as its source was; { restore, type, children,
// boxKeys } a block written whole (an instance, from its manifest or what the page carried) whose boxes
// (an instance's slots) take the blocks made on the page, each child in the box its key names. A Sheet tab { type: "tab",
// title, sheet, children } goes { after } or { before } a tab of its row, its panel (key `sheet`,
// holding `children`, maybe none) next to that tab's panel; a tab put back likewise.
// Where the page's icon and a Sheet's tabs go, and that a Sheet keeps its last tab, are rules of
// this engine, not of the components' markup (their `file.mjs` write that): the icon has one place
// (first in a box it leads, a highlight block or a flowchart's node, else before the report's title)
// whatever place the page names, and
// report.json mirrors it; a tab is placed in its own row beside its panel (it moves only there and is
// never taken along by a new container), and a Sheet's last one is never removed.
// What a box takes (accepts) is what the reader may put there; a file may hold more (a section in a
// section), and what it held goes back: `stood` on a move, a block put back or a unit taken along is
// the kind of box the file had it in, which takes it again.
export function applyEdits({ current, edits, units = [], partial = false, ids = false, touch = [], proposals = null }) {
  const origin = scan(current);
  const blocks = origin.blocks;
  const eol = current.includes("\r\n") ? "\r\n" : "\n";
  const conflicts = [];
  const splices = [];
  const cuts = []; // deleted units
  const removed = new Map(); // block id -> the splice that removes it
  let title = null;
  // The page's icon, made or taken away by this commit (report.json mirrors it): its emoji, the
  // one taken away, or untouched (undefined).
  let iconMade;
  let iconTaken = false;

  const unitConflict = (unit, reason) => conflicts.push({ unit: unit.id, reason });

  // A cell's sort key (data-sort-value: what the kit sorts a formatted cell by) follows the text the
  // reader wrote, in the key's own scale (3.4亿 with 340000000: 3.6亿 gets 360000000): the new text's
  // number times what the old key was to the old text's number (1 when that had none); a text with
  // no number keeps a key a text without one had (a missing value's), and otherwise the key goes,
  // the kit sorting the cell by its text as any other. A splice of the attribute alone, so that a
  // cell's look switched in the same commit is no overlap.
  const numberIn = (html) => {
    const digits = textOf(html).replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[\s,，]/g, "").replace(/[−–]/g, "-");
    const found = digits.match(/-?\d+(?:\.\d+)?/)?.[0];
    return found === undefined ? null : Number(found);
  };
  const sortKey = (target, html, id) => {
    if (target.kind !== "cell") return;
    const open = current.slice(target.start, target.innerStart);
    const found = /\sdata-sort-value(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/.exec(open);
    if (!found) return;
    const old = (found[1] ?? found[2] ?? found[3] ?? "").trim();
    const key = /^-?\d+(\.\d+)?(e[-+]?\d+)?$/i.test(old) ? Number(old) : null;
    const [was, now] = [numberIn(current.slice(target.innerStart, target.innerEnd)), numberIn(html)];
    let next = "";
    if (key !== null && now !== null) next = ` data-sort-value="${Number((now * (was ? key / was : 1)).toPrecision(12))}"`;
    else if (key !== null && was === null) next = found[0]; // still no number: a missing value's key stays
    if (next !== found[0]) splices.push({ start: target.start + found.index, end: target.start + found.index + found[0].length, text: next, of: [{ id }] });
  };

  const removeUnit = (unit) => {
    if (unit.keep && stays(unit)) unitConflict(unit, "referenced");
    else cuts.push({ start: unit.start, end: unit.end }, ...(unit.companion ? [unit.companion] : []));
  };

  // Switch classes of the unit's start tag (a centered card, a folded code block), all of a unit's
  // at once (`changes`: name -> on). Content changes in the file do not matter.
  const toggleUnit = (target, changes) => {
    const attribute = target.classAttr;
    const tokens = attribute ? attribute.value.split(/\s+/).filter(Boolean) : [];
    let next = tokens;
    for (const [name, on] of changes) next = on ? (next.includes(name) ? next : [...next, name]) : next.filter((token) => token !== name);
    if (next.join(" ") === tokens.join(" ")) return;
    ensureId(target);
    // A block without classes (a paragraph given a color) gets the attribute right after its tag
    // name; one whose last class goes loses it.
    if (!attribute) {
      const tag = /^<[A-Za-z][\w-]*/.exec(current.slice(target.elStart, target.elStart + 40));
      if (!tag) return unitConflict(target, "unknown");
      const at = target.elStart + tag[0].length;
      splices.push({ start: at, end: at, text: ` class="${next.join(" ")}"` });
      return;
    }
    if (next.length === 0) {
      splices.push({ ...attributeSpan(current, attribute.start, attribute.end), text: "" });
      return;
    }
    const quote = /=\s*'/.test(current.slice(attribute.start, attribute.end)) ? "'" : '"';
    splices.push({ start: attribute.start, end: attribute.end, text: `class=${quote}${next.join(" ")}${quote}` });
  };

  // Ids given as blocks are touched (`ids`: true for random ones, or a function returning the next
  // one): a unit the reader edits, moves, resizes or converts for the first time gets one in its
  // start tag, and every block made on the page gets one. Nothing else in the file changes, so a
  // report never gains ids just because a page opened. With `ids` false (the default) they are
  // left alone, though a block keeps the one it has.
  const nextId = typeof ids === "function" ? ids : ids ? randomBlockId : null;
  const blockIds = new Set([...current.matchAll(ID_PATTERN)].map((match) => match[1] ?? match[2]));
  const freshId = () => {
    for (;;) {
      const id = nextId();
      if (!blockIds.has(id)) return blockIds.add(id) && id;
    }
  };
  // The ids given, reported back (commitEdits): `assigned` to units of the file now (by the ">" of
  // their start tag), `created` to blocks made on the page (by the key the page gave them).
  const assigned = [];
  const created = [];
  const idText = (id) => id ? ` ${IDENTITY}="${id}"` : "";
  // A block made on the page may bring the id it is to have (commitEdits: the page proposes one, so
  // that a commit sent twice writes it once): taken when it is an id and the file has none such.
  const proposable = (id) => typeof id === "string" && BLOCK_ID.test(id) && !blockIds.has(id);
  const idAttr = (key, proposed) => {
    const id = !nextId ? null : proposable(proposed) ? (blockIds.add(proposed), proposed) : freshId();
    if (id && key !== undefined) created.push({ key, id });
    return idText(id);
  };
  const named = new Set(); // start tags (their ">") given an id in this save
  // A unit of the file the page proposed an id for (commitEdits, `proposals`: unit -> id) gets that one.
  const assign = (record) => {
    named.add(record.at);
    const proposed = proposals?.get(record.id);
    const id = !nextId ? null : proposable(proposed) ? (blockIds.add(proposed), proposed) : freshId();
    if (id) assigned.push({ at: record.at, id });
    return idText(id);
  };
  // Give a unit of the file (a record of origin.units) an id, unless it has one.
  const ensureId = (record) => {
    if (!nextId || !record || record.blockId || record.at === undefined || named.has(record.at)) return;
    const at = tagEnd(current, record.at);
    splices.push({ start: at, end: at, text: assign(record) });
  };
  // A unit put back as it was deleted (commitEdits, restore) keeps its id, unless the file has
  // given that one to another block since: then, as every block without one, it gets a new one.
  const restoredText = (node) => {
    const { element, source } = restoredUnit(node.restore);
    const location = element.sourceCodeLocation;
    const own = attr(element, IDENTITY);
    if (own && !blockIds.has(own)) {
      blockIds.add(own);
      if (node.key !== undefined) created.push({ key: node.key, id: own });
      return source;
    }
    let text = source;
    let at = location.startTag.endOffset - 1;
    if (own) {
      const range = location.attrs[IDENTITY];
      const cut = attributeSpan(text, range.startOffset, range.endOffset);
      text = text.slice(0, cut.start) + text.slice(cut.end);
      at -= cut.end - cut.start;
    }
    at = tagEnd(text, at);
    return text.slice(0, at) + idAttr(node.key, node.blockId) + text.slice(at);
  };
  // The innermost unit around a text block.
  const ownerOf = (target) => {
    let inner = null;
    for (const unit of origin.units) if (unit.elStart <= target.start && target.start < unit.end && (!inner || unit.elStart > inner.elStart)) inner = unit;
    return inner;
  };

  // Units whose own text this save takes out (emptied): they go, as an empty block is not written,
  // so nothing moves them, stands next to them or takes them along (below).
  const emptied = new Set();
  for (const edit of edits) {
    const { id, parts } = edit ?? {};
    const target = Number.isInteger(id) ? blocks[id] : undefined;
    if (!target) {
      conflicts.push({ id, reason: "unknown" });
      continue;
    }
    // A block something refers to does not go (said as such, before what its caps say).
    if (Array.isArray(parts) && parts.length === 0 && target.self !== null && origin.units[target.self].keep) {
      conflicts.push({ id, reason: "referenced" });
      continue;
    }
    const problem = checkParts(target, parts, current);
    if (problem) {
      conflicts.push({ id, reason: problem });
      continue;
    }
    if (parts.length === 0) {
      const splice = { ...removeLines(current, target.start, target.end), of: [{ id }] };
      splices.push(splice);
      removed.set(id, splice);
      if (target.self !== null) emptied.add(target.self);
      continue;
    }
    const indent = lineIndent(current, target.start);
    const gap = indent === null ? "" : eol + indent; // new blocks reuse the original line break and indent
    const render = (part) => `<${part.tag}${part.classes ? ` class="${part.classes.join(" ")}"` : ""}${attributesText(part.attributes)}${idAttr(part.key, part.blockId)}>${part.html}</${part.tag}>`;
    const kept = parts.findIndex((part) => part.keep);
    const owner = ownerOf(target);
    const own = owner && owner.at === target.innerStart - 1; // the block is that unit: its start tag is rewritten below
    if (!own || target.tag === "li") ensureId(owner);
    if (target.tag === "li" && kept >= 0) {
      // A list item holds (or may be given) lists of its own, written by other operations: only its
      // text is replaced, and the items split off it go right before and after it, with it wherever
      // it goes (`edge`: at its very start or end, they are its own, not of what is around it).
      const before = parts.slice(0, kept);
      const after = parts.slice(kept + 1);
      const edge = owner ? { start: owner.start, end: owner.end } : null;
      splices.push({ start: target.innerStart, end: target.innerEnd, text: parts[kept].html, of: [{ id }] });
      if (before.length > 0) splices.push({ start: target.start, end: target.start, seq: Infinity, text: before.map(render).join(gap) + gap, edge, of: [{ id }] });
      if (after.length > 0) splices.push({ start: target.end, end: target.end, text: gap + after.map(render).join(gap), edge, of: [{ id }] });
    } else {
      let open = current.slice(target.start, target.innerStart);
      if (own && nextId && !owner.blockId && !named.has(owner.at)) open = `${open.slice(0, -1)}${assign(owner)}>`;
      // Its text alone changed (its start tag as it was): only the text is replaced, so that a class
      // switched on it in the same commit (a color given to what was just typed) is no overlap.
      if (parts.length === 1 && kept === 0 && open === current.slice(target.start, target.innerStart)) {
        splices.push({ start: target.innerStart, end: target.innerEnd, text: parts[0].html, of: [{ id }] });
        sortKey(target, parts[0].html, id);
        if (target.kind === "title") title = { from: textOf(current.slice(target.innerStart, target.innerEnd)), to: textOf(parts[0].html) };
        continue;
      }
      const text = parts
        .map((part) => part.keep ? open + part.html + current.slice(target.innerEnd, target.end) : render(part))
        .join(gap);
      splices.push({ start: target.start, end: target.end, text, of: [{ id }] });
    }
    if (target.kind === "title") title = { from: textOf(current.slice(target.innerStart, target.innerEnd)), to: textOf(parts[0].html) };
  }

  // The whitespace between two neighbouring units of a box: what a unit moved there is set apart by.
  const separator = (boxId, anchor, place) => {
    const siblings = origin.units.filter((other) => other.box === boxId);
    const gaps = [];
    for (let index = 1; index < siblings.length; index++) {
      const gap = current.slice(siblings[index - 1].end, siblings[index].start);
      if (!gap.trim()) gaps.push({ pair: [siblings[index - 1], siblings[index]], gap });
    }
    const near = gaps.find(({ pair }) => pair.includes(anchor)) ?? gaps[0];
    if (near) return near.gap.replace(/\r?\n/g, eol);
    // Nothing to learn from: a line of its own; chapters set apart by a blank line, as the kit writes them.
    const indent = lineIndent(current, place.start);
    const apart = boxRole(origin.boxes[boxId]?.kind) === "root" ? eol : "";
    return indent === null ? "" : apart + eol + indent;
  };

  // A list item whose text and end tag share a line (<li>text</li>), taking its first list: the
  // indentation of the item's line, so that the list goes on lines of its own below the text; null
  // for any other box.
  const itemIndent = (box) => {
    if (box.kind !== "nest" || lineIndent(current, box.innerEnd) !== null) return null;
    const owner = origin.units[box.unit];
    return owner ? lineIndent(current, owner.elStart) : null;
  };

  // The indentation of a box's children: that of its first line of content, or one level more
  // than its end tag.
  const childIndent = (box, close) => {
    const inner = current.slice(box.at + 1, box.innerEnd).match(/\n([ \t]*)\S/);
    return inner ? inner[1] : `${close ?? ""}  `;
  };

  // Blocks go at the end of a root box (a page, a Sheet panel) on lines of their own ahead of its end
  // tag's, which keeps its indentation: nothing is left on a line alone when one is set apart by a
  // blank line. Other boxes take them right at the end tag, as the last lists of an item go up to it.
  const onLastLine = (box, close) => close !== null && boxRole(box.kind) === "root";

  // Move a unit next to a unit that stays where it is ({ after } or { before } it), or into a box
  // where no original unit stayed ({ into }, after the box's content). The target must take the
  // unit (accepts) or be a box of the kind the file had it in (`stood`), never inside the unit itself,
  // and a Sheet tab stays in its row. The unit travels with everything inside it (text edits
  // included) and takes the indentation of its new place.
  const moves = [];
  const moveUnit = (unit, where, anchorIds, stood) => {
    const into = Number.isInteger(where?.into) ? origin.boxes[where.into] : null;
    const after = Number.isInteger(where?.after);
    const anchor = into ? null : origin.units[after ? where.after : where?.before];
    const target = into ?? (anchor ? origin.boxes[anchor.box] : null);
    const within = (offset) => offset >= unit.start && offset < unit.end;
    if (!target || !(accepts(target.kind, kindOf(unit)) || stood === target.kind) || (unit.kind === "tab" && target.id !== unit.box)
      || (anchor && (anchor === unit || !anchorIds.has(anchor.id) || within(anchor.elStart)))
      || (into && within(target.at))) return unitConflict(unit, "position");
    const from = lineIndent(current, unit.start);
    ensureId(unit);
    if (into) {
      if (into.innerEnd === null) return unitConflict(unit, "missing");
      const item = itemIndent(into);
      if (item !== null) {
        moves.push({ start: unit.start, end: unit.end, at: into.innerEnd, seq: seq++, from, to: item + indentStep, wrap: (text) => eol + item + indentStep + text + eol + item });
        return;
      }
      const close = lineIndent(current, into.innerEnd);
      const inner = childIndent(into, close);
      const step = close !== null && inner.startsWith(close) ? inner.slice(close.length) : "  ";
      const lined = onLastLine(into, close);
      moves.push({ start: unit.start, end: unit.end, at: lined ? into.innerEnd - close.length : into.innerEnd, seq: seq++, from, to: inner, wrap: (text) => close === null ? text : lined ? close + step + text + eol : step + text + eol + close });
      return;
    }
    const sep = separator(anchor.box, anchor, anchor);
    const to = after ? (sep.includes("\n") ? sep.slice(sep.lastIndexOf("\n") + 1) : null) : lineIndent(current, anchor.start);
    moves.push({ start: unit.start, end: unit.end, at: after ? anchor.end : anchor.start, seq: seq++, from, to, wrap: (text) => after ? sep + text : text + sep });
  };

  // ---------- conversions and new blocks ----------

  // Turn a text block into another type in place: its element (not the comments above it) is
  // written anew; where it stays, its box must take the new kind (a move or a new container checks
  // its own target). A unit its component wrote (a code block) becomes text only (undo of a
  // conversion into it), leaving the attributes its writer sets (FILES `attribute`).
  // The class switches a block made or turned on the page carries: some of its kind's, each once.
  const validClasses = (node, spec) => node.classes === undefined
    || (Array.isArray(node.classes) && new Set(node.classes).size === node.classes.length && node.classes.every((name) => (TOGGLES[spec.kind] ?? []).includes(name)));
  // A text block made or turned on the page: its type's own fields (FILES `check`: a code block's
  // language) and none of another type's, its class switches and the attributes its kind sets.
  const validLeafNode = (node, spec) => !foreignFields(node) && (FILES[node.type]?.check?.(node) ?? true) && validClasses(node, spec) && validAttributes(node.attributes, spec.kind);

  // A component's own check of a new block's text (components/*/file.mjs): with this file in hand.
  const fileLeaf = (spec, html, options = {}) => validLeaf(spec, html, { ...options, file: current });

  const replaceUnit = (unit, node) => {
    if (removals.has(unit.id)) return;
    const spec = BLOCK_TYPES[node?.type];
    const from = convertible(unit, origin.boxes);
    if (!(from === "text" || (from === "written" && spec?.kind !== unit.kind)) || !LEAVES.has(node?.type) || !validLeaf(spec, node.html, { empty: emptyLeaf(spec), file: current })) return unitConflict(unit, "invalid");
    if (!movedIds.has(unit.id) && !refs.has(unit.id) && !accepts(origin.boxes[unit.box].kind, spec.kind)) return unitConflict(unit, "position");
    if (!validLeafNode(node, spec)) return unitConflict(unit, "invalid");
    const idPart = unit.blockId ? idText(unit.blockId) : assign(unit); // a converted block stays the same block
    named.add(unit.at);
    const carried = from === "written" && unit.node ? carriedOf(current, unit.node, FILES[unit.kind].attribute) : unit.carried;
    splices.push({ start: unit.elStart, end: unit.end, text: leafHtml(spec, node, carried + idPart) });
  };

  // A unit's inside as the page has it now, by what its component writes (`rewrite`, components/*/
  // file.mjs): a table's rows and columns, what stays as the file has it; an instance's data parts,
  // each part's inside and not a byte around it.
  const rewriteUnit = (unit, op) => {
    if (removals.has(unit.id)) return;
    const rewrite = FILES[unit.kind]?.rewrite;
    if (!rewrite) return unitConflict(unit, "invalid");
    const written = rewrite(current, unit.node, op, { validCell: (tag, html) => validCell(tag, html, current), get packages() { return currentCatalog().packages; } });
    if (!written) return unitConflict(unit, "invalid");
    ensureId(unit); // named by its id from now on (the page takes in its cells by it)
    splices.push(...[written].flat());
  };

  // Turn a list into the other kind of list: only its tag names change, whatever is inside.
  const retagUnit = (unit, tag) => {
    if (convertible(unit, origin.boxes) !== "list" || (tag !== "ul" && tag !== "ol")) return unitConflict(unit, "invalid");
    const open = /^<(ul|ol)\b/i.exec(current.slice(unit.elStart, unit.elStart + 3));
    const close = /<\/(ul|ol)\s*>$/i.exec(current.slice(unit.elStart, unit.end));
    if (!open || !close) return unitConflict(unit, "unknown");
    if (open[1].toLowerCase() === tag) return;
    ensureId(unit);
    const end = unit.end - close[0].length + 2;
    splices.push({ start: unit.elStart + 1, end: unit.elStart + 3, text: tag }, { start: end, end: end + 2, text: tag });
  };

  // Ids the file uses, so that a new detail card gets one of its own.
  const usedIds = new Set([...current.matchAll(/\sid\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/gi)].map((match) => match[1] ?? match[2] ?? match[3]));
  const refEntries = new Map(); // unit id -> its entry in `moves`: taken from its place, written by the new block holding it
  const placedRefs = new Set();
  const indentStep = /\n(\t|[ ]+)</.exec(current)?.[1] ?? "  "; // the file's indentation step

  // A block made on the page, going into a box of this kind: what each container may hold, and the
  // original units it takes along (each once; never one deleted, moved or pinned, nor a tab).
  const checkNode = (node, boxKind) => {
    const fits = (kind) => accepts(boxKind, kind) || node?.stood === boxKind;
    if (node?.restore !== undefined) {
      // Read from its source alone, an li is of the kind it is in the box it goes into (a flowchart's
      // step there, an item elsewhere: kindIn).
      const restored = restoredUnit(node.restore);
      const kind = restored?.kind === "item" ? kindIn(restored.element, boxKind) : restored?.kind;
      if (!restored || !fits(kind)) return false;
      if (node.children === undefined) return true;
      // Written whole, holding blocks made on the page in boxes of its own (`boxKeys`: an instance's
      // slots, by key, as its type's file finds them, heldBoxesOf): each block one its box takes.
      if (node.boxKeys !== undefined) {
        const boxes = heldBoxesOf(restored.element, restored.kind);
        return Array.isArray(node.boxKeys) && node.boxKeys.length === node.children.length && node.children.every((child, index) => {
          const box = boxes.find(({ key }) => key === node.boxKeys[index]);
          return Boolean(box) && checkNode(child, box.kind);
        });
      }
      // Put back around blocks: of the kind it was, in a box of its element.
      const spec = BLOCK_TYPES[node.type];
      return holdsStraight(spec) && spec.kind === kind && node.children.every((child) => checkNode(child, spec.box));
    }
    if (node?.unit !== undefined) {
      const unit = Number.isInteger(node.unit) ? origin.units[node.unit] : undefined;
      if (!unit || placedRefs.has(unit.id) || removals.has(unit.id) || movedIds.has(unit.id) || emptied.has(unit.id) || unit.kind === "tab" || !fits(kindOf(unit))) return false;
      placedRefs.add(unit.id);
      return true;
    }
    const spec = BLOCK_TYPES[node?.type];
    if (!spec || !fits(spec.kind)) return false;
    if (node.type === "divider") return true;
    if (node.type === "icon") return validIcon(node.icon);
    const own = FILES[node.type]; // what the type's component checks (components/files.mjs)
    if (spec.bare && own?.check) return own.check(node, { validLeaf: fileLeaf, usedIds }) && validClasses(node, spec); // an image
    if (!spec.box) {
      if (!LEAVES.has(node.type) || !validLeaf(spec, node.html, { empty: emptyLeaf(spec), file: current })) return false;
      if (!validLeafNode(node, spec)) return false;
      // A leaf holds blocks of its own only where its component says so (a list item's lists).
      if (node.children === undefined) return true;
      return Array.isArray(node.children) && own?.children?.(node, checkNode) === true;
    }
    // A section, list, quote or panel holds a block; a disclosure, which has a title, or a detail card
    // may be empty; its color some of the classes its kind switches (a highlight block's background).
    if (!Array.isArray(node.children) || (node.children.length === 0 && !own?.empty) || !validClasses(node, spec)) return false;
    if (own?.check && !own.check(node, { validLeaf: fileLeaf, usedIds })) return false;
    return node.children.every((child) => checkNode(child, spec.box));
  };

  // A block made on the page as markup, its lines indented from `indent` (null: all on one line).
  const renderNode = (node, indent) => {
    if (node.unit !== undefined) {
      const ref = refEntries.get(node.unit);
      return reindent(compose(ref), ref.from, indent);
    }
    if (node.restore !== undefined && node.children === undefined) return reindent(restoredText(node), "", indent);
    const spec = BLOCK_TYPES[node.type];
    if (node.type === "divider") return `<hr${idAttr(node.key, node.blockId)}>`;
    if (node.type === "icon") return iconMarkup(node.icon, idAttr(node.key, node.blockId)); // checked: its value holds no markup
    const inner = indent === null ? null : indent + indentStep;
    const block = (open, lines, close, at = indent, step = inner) => step === null
      ? open + lines.join("") + close
      : open + lines.map((line) => eol + step + line).join("") + eol + at + close;
    const children = (at) => node.children.map((child) => renderNode(child, at));
    // Written whole, its boxes empty, then the blocks of each written in it (`boxKeys`), one a line
    // a step in from the box's line, its end tag on a line of its own: an instance's lines stand as its
    // own markup has them wherever it goes (reindent), and so do those of the blocks in its slots.
    if (node.restore !== undefined && node.boxKeys !== undefined) {
      const text = restoredText(node);
      const { element, kind } = restoredUnit(text);
      const filled = heldBoxesOf(element, kind).flatMap(({ element: box, key }) => {
        const held = node.children.filter((_, index) => node.boxKeys[index] === key);
        if (held.length === 0) return [];
        const { startTag, endTag } = box.sourceCodeLocation;
        const at = indent === null ? null : lineIndent(text, startTag.startOffset);
        const step = at === null ? null : at + indentStep;
        return [{ start: startTag.endOffset, end: endTag.startOffset, text: block("", held.map((child) => renderNode(child, step)), "", at, step) }];
      }).sort((a, b) => b.start - a.start).reduce((out, { start, end, text: put }) => out.slice(0, start) + put + out.slice(end), text);
      return reindent(filled, "", indent);
    }
    // Put back around the blocks it holds now: of its source, what stands above it, its tags and the
    // comments after its last block, which no block took along.
    if (node.restore !== undefined) {
      const text = restoredText(node);
      const { element } = restoredUnit(text);
      const { startTag, endTag } = element.sourceCodeLocation;
      const last = element.childNodes.findLastIndex((child) => child.tagName);
      const comments = element.childNodes.slice(last + 1).filter((child) => child.nodeName === "#comment").map(({ sourceCodeLocation: { startOffset, endOffset } }) => reindent(text.slice(startOffset, endOffset), lineIndent(text, startOffset), inner));
      return block(reindent(text.slice(0, startTag.endOffset), "", indent), [...children(inner), ...comments], endTag ? text.slice(endTag.startOffset) : `</${spec.tag}>`);
    }
    // What a component's writer works with (components/files.mjs); its id is given where it is read.
    // `language`: the file's (its <html lang>, "zh" or "en"), which the kit's markup it writes is said in.
    const writer = {
      get id() { return idAttr(node.key, node.blockId); },
      get language() { return pageLanguage(current); },
      idOf: (child) => idAttr(child.key, child.blockId), // a block it writes itself (a Sheet area's tabs)
      render: (child, at) => renderNode(child, at), // a block it holds elsewhere than its children (a tab's, in its panel)
      indent, inner, step: indentStep, block, children,
      deep: (level) => indent === null ? null : indent + indentStep.repeat(level),
    };
    const own = FILES[node.type]?.write;
    if (spec.bare && own) return own(node, writer); // an image
    if (!spec.box) {
      if (!node.children) return leafHtml(spec, node, idAttr(node.key, node.blockId));
      return own(node, writer); // a leaf holding blocks of its own: an item and the lists it holds
    }
    if (own) return own(node, writer);
    const names = [spec.className, ...(node.classes ?? [])].filter(Boolean).join(" "); // its color after the kit's class, as a text block's
    return block(`<${spec.tag}${names ? ` class="${names}"` : ""}${idAttr(node.key, node.blockId)}>`, children(inner), `</${spec.tag}>`);
  };

  // A new block goes next to a unit that stays ({ after } or { before } it), or at the end of a box
  // where no original unit stayed ({ into }), with the same checks as a move. It takes a line of
  // its own at its neighbour's indentation; a new section is set apart like the other sections.
  const inserts = [];
  const insertUnit = (op) => {
    const { insert: node, place } = op;
    const refused = (reason) => conflicts.push({ unit: op.id, reason });
    // An icon has one place, whatever the page gave: one of a box it leads (a highlight block's, a
    // flowchart node's) comes first in it, the page's right before the report's title. So has one
    // taken away and brought back (undo).
    const restoring = node?.restore !== undefined ? restoredUnit(node.restore) : null;
    if (node?.type === "icon" || restoring?.kind === "icon") {
      const into = Number.isInteger(place?.into) ? origin.boxes[place.into] : null;
      const anchor = into ? null : origin.units[Number.isInteger(place?.after) ? place.after : place?.before];
      const holder = into ?? (anchor ? origin.boxes[anchor.box] : null);
      if (isLead(holder?.kind, "icon")) {
        if (!checkNode(node, holder.kind)) return refused("invalid");
        if (holder.innerEnd === null) return refused("missing");
        const first = origin.units.find((unit) => unit.box === holder.id && unit.kind !== "icon"); // not the icon it may replace
        const at = first ? first.start : holder.innerEnd;
        const indent = lineIndent(current, at);
        inserts.push({ at, seq: seq++, text: () => renderNode(node, indent) + (indent === null ? "" : eol + indent) });
        return;
      }
      if (!checkNode(node, "header")) return refused("invalid");
      const heading = blocks.find((block) => block.kind === "title");
      if (!heading) return refused("missing");
      const indent = lineIndent(current, heading.start);
      inserts.push({ at: heading.start, seq: seq++, text: () => renderNode(node, indent) + (indent === null ? "" : eol + indent) });
      iconMade = restoring ? iconValueOf(restoring.source) : node.icon;
      return;
    }
    if (node?.type === "tab" || restoring?.kind === "tab") return insertTab(op, restoring, refused);
    const into = Number.isInteger(place?.into) ? origin.boxes[place.into] : null;
    const after = Number.isInteger(place?.after);
    const anchor = into ? null : origin.units[after ? place.after : place?.before];
    const target = into ?? (anchor ? origin.boxes[anchor.box] : null);
    const restored = node?.restore !== undefined ? restoredUnit(node.restore) : null;
    const kind = restored ? (target && restored.kind === "item" ? kindIn(restored.element, target.kind) : restored.kind) : BLOCK_TYPES[node?.type]?.kind;
    if (!target || !kind || !(accepts(target.kind, kind) || node.stood === target.kind) || (anchor && !anchorIds.has(anchor.id))) return refused("position");
    const earlier = new Set(placedRefs);
    if (!checkNode(node, target.kind)) return refused("invalid");
    for (const id of placedRefs) {
      if (earlier.has(id)) continue;
      const self = origin.units[id];
      ensureId(self);
      const entry = { start: self.start, end: self.end, at: null, from: lineIndent(current, self.start) };
      refEntries.set(id, entry);
      moves.push(entry);
    }
    if (into) {
      if (into.innerEnd === null) return refused("missing");
      const item = itemIndent(into);
      if (item !== null) {
        inserts.push({ at: into.innerEnd, seq: seq++, text: () => eol + item + indentStep + renderNode(node, item + indentStep) + eol + item });
        return;
      }
      const close = lineIndent(current, into.innerEnd);
      const inner = childIndent(into, close);
      const lead = close !== null && inner.startsWith(close) ? inner.slice(close.length) : indentStep;
      // A chapter after chapters is set apart by a blank line, as the kit writes them, and so is one put
      // back, or in the place of blocks a box held, after what is no block (the page's header).
      const others = origin.units.filter((unit) => unit.box === into.id);
      const apart = boxRole(into.kind) === "root" && CHAPTER.has(kind) && (others.some((unit) => anchorIds.has(unit.id)) || (!into.pure && (others.length > 0 || node.restore !== undefined))) ? eol : "";
      const lined = onLastLine(into, close);
      inserts.push({ at: lined ? into.innerEnd - close.length : into.innerEnd, seq: seq++, text: () => close === null ? renderNode(node, null) : lined ? apart + close + lead + renderNode(node, inner) + eol : lead + renderNode(node, inner) + eol + close });
      return;
    }
    const at = after ? anchor.end : anchor.start;
    if (boxRole(target.kind) === "root") {
      const sep = separator(anchor.box, anchor, anchor);
      const indent = after ? (sep.includes("\n") ? sep.slice(sep.lastIndexOf("\n") + 1) : null) : lineIndent(current, anchor.start);
      inserts.push({ at, seq: seq++, text: () => after ? sep + renderNode(node, indent) : renderNode(node, indent) + sep });
      return;
    }
    const indent = lineIndent(current, anchor.start);
    const gap = indent === null ? "" : eol + indent;
    inserts.push({ at, seq: seq++, text: () => after ? gap + renderNode(node, indent) : renderNode(node, indent) + gap });
  };

  // A Sheet tab: the button next to a tab of its row that stays, its panel next to that tab's panel
  // (after it, or before it), each at its neighbour's indentation. Its key must be new in the area.
  const insertTab = ({ insert: node, place }, restoring, refused) => {
    const after = Number.isInteger(place?.after);
    const anchor = origin.units[after ? place.after : place?.before];
    if (anchor?.kind !== "tab" || !anchorIds.has(anchor.id)) return refused("position");
    if (!checkNode(node, "tabs")) return refused("invalid");
    const panel = anchor.companion; // where the file has its panel
    const area = origin.units[anchor.parent ?? -1];
    if (!panel || !area) return refused("missing");
    const sheet = restoring ? attr(restoring.element, SHEETS.tabKey) : node.sheet;
    const shell = current.slice(area.start, area.end);
    if (shell.includes(`data-sheet-tab="${sheet}"`) || shell.includes(`data-doc-sheet="${sheet}"`)) return refused("invalid");
    const tabIndent = lineIndent(current, anchor.start);
    const panelIndent = lineIndent(current, panel.start);
    const near = (indent, text) => indent === null ? text : after ? eol + indent + text : text + eol + indent;
    const button = () => restoring ? reindent(restoredText(node), "", tabIndent)
      : tabButton({ ...node, sheet }, idAttr(node.key, node.blockId));
    const content = () => {
      if (restoring) return reindent(restoring.panel, "", panelIndent);
      const open = `<div data-doc-sheet="${sheet}">`;
      if (node.children.length === 0) return panelIndent === null ? `${open}</div>` : `${open}${eol}${panelIndent}</div>`; // its end on a line of its own: blocks go in on lines of their own
      const inner = panelIndent === null ? null : panelIndent + indentStep;
      const lines = node.children.map((child) => renderNode(child, inner));
      return inner === null ? open + lines.join("") + "</div>" : open + lines.map((line) => eol + inner + line).join("") + eol + panelIndent + "</div>";
    };
    inserts.push({ at: after ? anchor.end : anchor.start, seq: seq++, text: () => near(tabIndent, button()) });
    // The panel set apart from its neighbour as that one is from the next (a blank line between panels, say).
    const gap = after ? /^\s*/.exec(current.slice(panel.end))[0] : /\s*$/.exec(current.slice(0, panel.start))[0];
    const apart = panelIndent !== null && /\n[ \t]*\r?\n/.test(gap) ? eol : "";
    inserts.push({ at: after ? panel.end : panel.start, seq: seq++, text: () => after ? apart + near(panelIndent, content()) : near(panelIndent, content()) + apart });
  };

  // Set sizes (SIZES) in the style attribute of the unit's start tag, all of a unit's at once:
  // only the declarations named change, every other byte of the attribute stays. As with classes,
  // content changes in the file do not matter.
  const sizeUnit = (target, changes) => {
    const location = target.node?.sourceCodeLocation;
    if (target.at === undefined || !location) return unitConflict(target, "unknown");
    ensureId(target);
    splices.push(...attributeSplices(current, location.startTag, [["style", (old) => declarationsWith(old?.value ?? "", changes) || null]]));
  };
  // Set attributes (ATTRIBUTES) in the unit's start tag, or remove them (null), all of a unit's at
  // once; every other byte of the tag stays. As with classes, content changes in the file do not matter.
  const attributeUnit = (target, changes) => {
    const location = target.node?.sourceCodeLocation;
    if (target.at === undefined || !location) return unitConflict(target, "unknown");
    ensureId(target);
    splices.push(...attributeSplices(current, location.startTag, changes));
  };
  const toggled = new Map(); // unit -> Map(class -> on)
  const resized = new Map(); // unit -> Map(size -> value)
  const attributed = new Map(); // unit -> Map(attribute -> value)

  const removals = new Set(units.filter((op) => op?.remove === true).map((op) => op.id));
  const movedIds = new Set(units.filter((op) => op?.move).map((op) => op.id));
  // Units that new containers take along (unit -> the operation making the container holding it),
  // and the kind a converted unit has now.
  const refs = new Map();
  const collectRefs = (op, node) => node?.unit !== undefined ? refs.set(node.unit, op.id) : Array.isArray(node?.children) && node.children.forEach((child) => collectRefs(op, child));
  units.forEach((op) => collectRefs(op, op?.insert));
  const replaced = new Map(units.filter((op) => Number.isInteger(op?.id) && op.replace).map((op) => [op.id, op.replace]));
  const kindOf = (unit) => BLOCK_TYPES[replaced.get(unit.id)?.type]?.kind ?? unit.kind;
  const anchorIds = new Set(origin.units.map((unit) => unit.id).filter((id) => !removals.has(id) && !movedIds.has(id) && !refs.has(id) && !emptied.has(id)));
  // A unit something refers to stays, unless every part referred to leaves it in this save (the
  // blocks of a section merged into the one before it): then only the rest of it goes.
  const leaving = origin.units.filter((unit) => movedIds.has(unit.id) || refs.has(unit.id));
  const heldBy = (unit, others) => (offset) => others.some((other) => other !== unit
    && unit.start <= other.start && other.end <= unit.end && other.start <= offset && offset < other.end);
  const stays = (unit) => Boolean(unit.keep) && !unit.keep.at.every(heldBy(unit, leaving));
  // What an operation writes (the pieces it adds) is its own: a piece that cannot go in is a
  // conflict of that operation (`of`), never left out in silence.
  const owned = (of, write) => {
    const lists = [splices, cuts, moves, inserts];
    const marks = lists.map((list) => list.length);
    write();
    lists.forEach((list, index) => list.slice(marks[index]).forEach((piece) => (piece.of ??= of)));
  };
  let seq = 0; // placements at the same place keep the order of the operations
  for (const op of units) {
    const { id, remove, toggle, on, move, size, value, attribute, stood } = op ?? {};
    const unit = Number.isInteger(id) ? origin.units[id] : undefined;
    owned([{ unit: id }], () => {
      if (op?.insert && typeof id === "string") insertUnit(op);
      else if (unit && op.replace) {
        // Refused, the unit keeps its kind: a move or place checked after it sees that (never a
        // paragraph put in a list for the item it was to be).
        const refusedBefore = conflicts.length;
        replaceUnit(unit, op.replace);
        if (conflicts.length > refusedBefore) replaced.delete(unit.id);
      }
      else if (unit && op.retag) retagUnit(unit, op.retag);
      else if (unit && (op.table || op.source)) rewriteUnit(unit, op.table ?? op.source);
      else if (unit && remove === true) {
        if (stays(unit)) conflicts.push({ unit: id, reason: "referenced" });
        else if (unit.kind === "tab" && origin.units.every((other) => other.box !== unit.box || removals.has(other.id))) conflicts.push({ unit: id, reason: "last" });
        else {
          if (unit.kind === "icon" && !isLead(origin.boxes[unit.box]?.kind, "icon")) iconTaken = true; // the page's (report.json mirrors it)
          removeUnit(unit);
        }
      } else if (unit && move && typeof move === "object" && !removals.has(id)) {
        if (!emptied.has(id)) moveUnit(unit, move, anchorIds, stood); // emptied, it goes: moving it is done
      } else if (unit && typeof on === "boolean" && (TOGGLES[unit.kind] ?? []).includes(toggle)) (toggled.get(unit) ?? toggled.set(unit, new Map()).get(unit)).set(toggle, on);
      else if (unit && SIZES[unit.kind]?.[size] && (value === null || sizeValue(unit.kind, size, value) !== null)) {
        if (!removals.has(id)) (resized.get(unit) ?? resized.set(unit, new Map()).get(unit)).set(size, value === null ? null : sizeValue(unit.kind, size, value));
      } else if (unit && typeof attribute === "string" && attributeValue(unit.kind, attribute, value)) {
        if (!removals.has(id)) (attributed.get(unit) ?? attributed.set(unit, new Map()).get(unit)).set(attribute, value);
      } else conflicts.push({ unit: id, reason: size === undefined && attribute === undefined ? "unknown" : "invalid" });
    });
  }
  // A list (or quote) whose every unit this save deletes or takes elsewhere, with nothing put into
  // it, goes too, as one whose items' texts were all taken out does (below): with nothing in it, it
  // is no content (the page may still show it, around a new item not written yet, empty). One a
  // block is placed next to stays, empty, as the page shows it (going, it took that block along).
  // A unit whose deletion or move was refused, or the block that was to take it along, stays in it.
  const refused = new Set(conflicts.map((conflict) => conflict.unit).filter((id) => id !== undefined));
  const leaves = (unit) => (removals.has(unit.id) || movedIds.has(unit.id) || refs.has(unit.id)) && !refused.has(refs.get(unit.id) ?? unit.id);
  for (const box of origin.boxes) {
    if (!["list", "quote"].includes(box.kind) || !box.pure || box.unit === null) continue;
    const owner = origin.units[box.unit];
    if (!owner || removals.has(owner.id) || movedIds.has(owner.id) || refs.has(owner.id)) continue;
    const children = origin.units.filter((child) => child.box === box.id);
    if (children.length === 0 || !children.every(leaves)) continue;
    const into = (place) => Boolean(place) && (place.into === box.id || [owner, ...children].some((unit) => place.after === unit.id || place.before === unit.id));
    if (units.some((op) => into(op?.insert ? op.place : op?.move))) continue;
    removeUnit(owner);
  }
  for (const [unit, changes] of toggled) owned([{ unit: unit.id }], () => toggleUnit(unit, changes));
  for (const [unit, changes] of resized) owned([{ unit: unit.id }], () => sizeUnit(unit, changes));
  for (const [unit, changes] of attributed) owned([{ unit: unit.id }], () => attributeUnit(unit, changes));
  // Units whose text the commit changes (commitEdits): each gets an id, if it has none yet.
  for (const id of touch) ensureId(origin.units[id]);

  // Every item of a list (or quote) removed: remove the list itself, unless this save deletes it
  // already (the page deleted it too).
  const wrappers = new Set([...removed.keys()].map((id) => blocks[id].wrapper).filter(Boolean));
  for (const wrapper of wrappers) {
    const members = wrapper.ids.map((id) => removed.get(id));
    if (members.some((member) => !member)) continue;
    if (cuts.some((cut) => cut.start <= wrapper.start && wrapper.end <= cut.end)) continue;
    members.forEach((member) => (member.skip = true));
    splices.push({ ...removeLines(current, wrapper.start, wrapper.end), of: wrapper.ids.map((id) => ({ id })) });
  }

  if (title && title.from !== title.to) {
    const splice = retitle(current, title);
    title.synced = Boolean(splice);
    if (splice) splices.push(splice);
  } else title = null;

  // Writing it all: units that leave their place (deleted or moved) go from there as runs of
  // neighbours with only whitespace between, each taking its lines and one blank line along.
  // Whatever lies inside a deleted unit goes with it; whatever lies inside a moved unit (text
  // edits, deletions, class switches, units moved within it) is applied to the text that moves.
  const once = new Map(); // a unit may be deleted twice (a list and its item)
  for (const cut of cuts) {
    const key = `${cut.start}:${cut.end}`;
    if (once.has(key)) once.get(key).of = [...(once.get(key).of ?? []), ...(cut.of ?? [])];
    else once.set(key, cut);
  }
  cuts.splice(0, cuts.length, ...once.values());
  // A piece that cannot go in: what it is of (a text edit, by its block; an operation, by its unit
  // or key) is a conflict.
  const refusePiece = (piece, reason) => {
    if (!piece.of?.length) conflicts.push({ reason });
    for (const owner of piece.of ?? []) conflicts.push({ ...owner, reason });
  };
  const holds = (outer, start, end) => start === end ? outer.start < start && start < outer.end : outer.start <= start && end <= outer.end;
  // The innermost moved unit a piece lies in; one at the very start or end of a unit (`edge`: the
  // items split off a list item) is that unit's, when it moves.
  const holder = (start, end, self, edge = null) => {
    let inner = null;
    for (const move of moves) {
      const own = edge !== null && move.start === edge.start && move.end === edge.end;
      if (move !== self && (own || holds(move, start, end)) && (!inner || move.start >= inner.start)) inner = move;
    }
    return inner;
  };
  // Deleted along with a unit, unless a moved unit it lies in takes it away first (a paragraph
  // moved out of a wrapper that went because it was left empty keeps its edits).
  const dropped = (start, end, self, edge = null) => {
    const keeper = holder(start, end, self, edge);
    return cuts.some((cut) => cut !== self && holds(cut, start, end) && !(keeper && holds(cut, keeper.start, keeper.end)));
  };
  const composing = new Set(); // regions being written: a block never ends up inside itself
  const compose = (region) => {
    if (composing.has(region)) {
      refusePiece(region, "position");
      return "";
    }
    composing.add(region);
    try {
      return composeRegion(region);
    } finally {
      composing.delete(region);
    }
  };
  const composeRegion = (region) => {
    const [from, to] = region ? [region.start, region.end] : [0, current.length];
    const mine = (start, end, self = null, edge = null) => holder(start, end, self, edge) === region && !dropped(start, end, self, edge);
    const runs = [];
    for (const item of [...cuts, ...moves].filter((entry) => entry !== region && mine(entry.start, entry.end, entry)).sort((a, b) => a.start - b.start)) {
      const last = runs.at(-1);
      if (last && (item.start <= last.end || !current.slice(last.end, item.start).trim())) {
        last.end = Math.max(last.end, item.end);
        last.of.push(...(item.of ?? []));
      } else runs.push({ start: item.start, end: item.end, of: [...(item.of ?? [])] });
    }
    const pieces = [
      ...splices.filter((splice) => !splice.skip && mine(splice.start, splice.end, null, splice.edge ?? null)).map((splice) => ({ ...splice, seq: splice.seq ?? -2 })),
      ...runs.map((run) => ({ ...cutLines(current, run.start, run.end), seq: -1, of: run.of })),
      ...[...moves.filter((move) => move.at !== null), ...inserts].filter((entry) => mine(entry.at, entry.at, entry)).map((entry) => ({
        start: entry.at,
        end: entry.at,
        seq: entry.seq,
        text: entry.text ? entry.text() : entry.wrap(reindent(compose(entry), entry.from, entry.to)),
        of: entry.of,
      })),
    ].sort((a, b) => a.start - b.start || (a.end - a.start) - (b.end - b.start) || a.seq - b.seq); // insertions first, in op order
    const active = [];
    for (const piece of pieces) {
      if (active.length > 0 && piece.start < active.at(-1).end) refusePiece(piece, "overlap");
      else active.push(piece);
    }
    let output = current.slice(from, to);
    for (const piece of active.reverse()) output = output.slice(0, piece.start - from) + piece.text + output.slice(piece.end - from);
    return output;
  };
  const output = compose(null);
  if (conflicts.length > 0 && !partial) return { ok: false, conflicts };
  const icon = iconMade ?? (iconTaken ? null : undefined);
  return { ok: conflicts.length === 0, text: output, version: hashOf(output), ids: { assigned, created }, ...(title ? { title } : {}), ...(icon !== undefined ? { icon } : {}), ...(partial ? { conflicts } : {}) };
}
