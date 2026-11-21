import { ELEMENT_ID, blocksText, ownHTML, ownText, captureLayout, collectEdits, drawFormulas, editableAhead, firstByAttribute, identityOf, keepLine, knownElements, lockHost, madeFrom, markFrames, matchesSource, nestedBlocks, prepareBlock, serializeInner, setOwnHTML, shownAs, snapshotLayout, textEnd, withLeads } from "./core.mjs";
import { BLOCK_TYPES, HOSTS, SEALED, accepts, blockTypeOf, boxIn, boxOwner, boxRole, capsFor, holdsStraight, takesBox } from "../components/registry.mjs";
import { COPY_KEYS } from "../components/figure/index.mjs";
import { select } from "./caret.mjs";
import { ownTypeOf } from "./convert.mjs";
import { rangeAt, rangeOffsets } from "./marks.mjs";
import { pageOfHost, pageOfKind, pageOfUnit } from "./page-objects.mjs";
import { containerTypeOf, pack, project } from "./sync-state.mjs";
import { ITEM_LINE } from "../../shared/components/list.mjs";
import { outsideKey, randomBlockId } from "../../shared/ids.mjs";
import { CHART_SOURCE, TABLE_READERS } from "../../shared/table-chart.mjs";

// The page's commits (autosave; docs/editor.md, "Commits"). A commit is what changed on the page
// since the last one, as collectEdits finds it against the layout and baselines the last commit
// left, sent to POST /__gallery/edit/commit with everything named by identity instead of by where
// it was: a unit by its data-block-id, or, untouched since the page opened and without one yet, by
// its number in the page's map and its hash; a text block by its unit (the unit's own text, or a
// field of it by the path the map gives) and the source it had at the last commit (`before`).
// Every unit whose text the commit changes, and the units around it, is named too (`touch`), so
// that it has an id afterwards, and so are the units right beside a block it makes (touchBeside: where
// it stood, for the revert check); so is a unit something of the page's own asked to name (idFor: the
// blocks a 批注 is about, annotate/), with the next commit, alone when nothing else waits.
//
// What of the file each element is lives in a table here, under the element's identity (core.mjs
// ELEMENT_ID), never on the element: the unit, text block and box it is, what the file dropped
// that the page still shows, the ids blocks made on the page propose. The marks the rest of the
// editor reads (data-ge-unit, data-ge-new…) are written from it (sync-state.mjs project) before
// every look at the page and after every answer, so an element undo brings back is marked from
// what the file has now, not from what it had when the element went.
//
// The answer is taken in without reloading: text blocks start from what was committed (a block
// merged with someone else's change shows the merge), blocks and containers made on the page join
// the map as ordinary ones, ids and hashes are kept, and the next layout is the one the commit was
// built from (snapshotLayout), so what the reader did while it was on its way goes with the next.
// A block or operation the file refused (a conflict) is held back from later commits until the
// reader decides (resolve). A block made or moved on the page whose place the file no longer has
// goes to the end of its box instead, once; only then is it a conflict. The texts committed are
// kept (the journal), and so is what components wrote (`writes`), so that the page can ask whether
// someone else's write put them back as they were (revertedTexts, revertedParts) before it shows
// that write.
//
// Undo reaches across commits: what it puts back is a change like any other. A unit deleted whole
// comes back from the source the file gave for it (a restore); a container deleted while its blocks
// went elsewhere (a merged section, a list turned into paragraphs) comes back around them, as made
// on the page, with the start tag that source has: the same unit, its id and all it carried in the
// file (around); the element a conversion replaced is the same unit, of the type it was, and converts back.

// How many writes of a part of an instance the revert check asks of, the newest (noteWrite), and how
// many texts a block's commits left it as between its first and its last (committedText).
const WRITES_KEPT = 100;
export const TEXTS_KEPT = 20;
// How many units on each side of a block made on the page the revert check is told of (besideOf): where a
// write took that many of the file's out with it, its place is told no more.
const BESIDE = 3;

/**
 * root: the document; map: the page's map (instrument), extended here as blocks are committed;
 * baselines: text block id -> the html the page compares with; units, boxes: the editor's maps of
 * the map's units and boxes; getLayout, setLayout: the layout collectEdits works against;
 * restore: what a page that is gone knew (save), to take up where it was (autosave.mjs recover).
 */
export function createCommits({ root, map, baselines, units, boxes, getLayout, setLayout, restore = null }) {
  // The version the page names its units by where it has no id for one (`opening`: map.version), and each unit's
  // place in it (its number there, and its hash there), by page unit: the one the page opened on, every unit of
  // it at its own number, until the page takes in someone else's write in place (pulled: that version from
  // then on, each unit it keeps at the number it has there). So are the text blocks outside any unit, by
  // their number among that version's blocks. A page of an earlier Gallery kept the count of the units and
  // blocks it opened on and their hashes (openingUnits, openingBlocks, openingHashes): read so.
  const openUnits = restore?.openUnits instanceof Map ? restore.openUnits : new Map(Array.from({ length: restore?.openingUnits ?? map.units.length }, (_, id) => [id, id]));
  const openHashes = restore?.openHashes instanceof Map ? restore.openHashes : new Map((restore?.openingHashes ?? map.units.map((unit) => unit.hash)).map((hash, id) => [id, hash]));
  const openBlocks = restore?.openBlocks instanceof Map ? restore.openBlocks : new Map(Array.from({ length: restore?.openingBlocks ?? map.blocks.length }, (_, id) => [id, id]));
  // Each text block's source as the file has it since the last commit: its next edit's `before`.
  const sources = restore?.sources ?? new Map(map.blocks.map((block) => [block.id, block.inner]));
  // Text block id -> { from, over }: 保留我的 made the file's words (the card's `theirs`, `over`) the block's
  // `before`, so that the reader's go over them; `from` is what the reader's words were written from, which
  // its commits send along (the text's `from`) for the review of the Agent's changes to apply them to its
  // baseline as the reader made them (service.mjs, rebaseOnto): what the reader kept is the reader's. Good while
  // the block's `before` is still `over`, until its text goes in.
  const keptOver = restore?.keptOver instanceof Map ? restore.keptOver : new Map();
  const keptFrom = (id) => (keptOver.has(id) && keptOver.get(id).over === sources.get(id) ? keptOver.get(id).from : undefined);
  // What the file did not take, until the reader decides: by issueKey (a text of a block, an
  // operation of a unit, a block made or put back on the page by the id it proposes) -> the
  // conflict, with the reader's words (`mine`) where there are any.
  const issues = restore?.issues ?? new Map();
  const refused = restore?.refused ?? new Map(); // identity of a block made (or put back) on the page the file did not take -> its key in issues
  // unit id -> { source, seal, type, types, blocks: [[id, source, baseline]], element }: deleted
  // whole by a commit, with the text blocks that went with it and the types it and the units that
  // went with it showed as; undo puts it back.
  const removed = restore?.removed ?? new Map();
  const removedWith = restore?.removedWith ?? new Map(); // unit id -> the unit deleted whole it went with (in removed)
  // Held keys the reader gave up, never sent again (the page shows the file's once nothing else waits): by
  // issueKey -> what was given up, of a unit's change { kind: of that change (kindOf); change: that change as
  // the card held it, the one never sent again, the unit's other changes going as any, another of that kind
  // too; reason: the conflict's, a unit the file has no one of (`lacks`) giving up all of it; words: whether
  // the texts in it went with it (holdsWords) }. A page of an earlier Gallery kept a set of keys, each giving
  // up all there was, or no `change`, giving up every change of that kind: read so.
  const discarded = restore?.discarded instanceof Map ? restore.discarded : new Map([...(restore?.discarded ?? [])].map((key) => [key, { words: true }]));
  const unwritten = restore?.unwritten ?? new Set(); // units whose component's writes are never sent again: by a manifest that is no more (the page is shown again)
  // Unit id -> the reader's word to make a change of it whatever the file did to it (仍然删除, 仍然转换类型,
  // 仍然调整), until that change goes in: { kind } of the change it was given for (`kindOf`), with the hash of
  // the unit the refusal they were shown gave (`hash`), or for what its component writes the parts still to
  // go (`parts`). A set of units, as a page of an earlier Gallery kept it, says no kind or hash: no word,
  // each change asking again.
  const forced = restore?.forced instanceof Map ? restore.forced : new Map();
  const elsewhere = restore?.elsewhere ?? new Set(); // identities of blocks made or put back on the page, sent to the end of their box
  const movedElsewhere = restore?.movedElsewhere ?? new Set(); // unit ids likewise, for a move
  const removedElsewhere = restore?.removedElsewhere ?? new Set(); // unit ids likewise, for a deletion that would have taken along blocks with no place yet
  const journal = restore?.journal ?? new Map(); // "b<block>" -> { key, block, original, mine, earlier? }: texts committed (committedText)
  // What components wrote that went in, by unit: { parts, time }, each part written by name { before,
  // after }: every hash it had in the file as the page wrote it but the one it has now, and that one
  // (noteWrite); `time`, when it was last written.
  const writes = restore?.writes ?? new Map();
  // Units this load made or moved, as the commits left them: unit id -> { parent, from, around } (the
  // file's id of the unit it is in, null for none; for one it moved, of the one it was in before; for
  // one put back around its blocks, the source it came back with: dropped's `around`).
  const placed = restore?.placed ?? new Map();
  const keyedBlocks = restore?.keyedBlocks ?? new Map(); // id -> the element of a keyed block (a detail card) made on the page and saved (adoptKeyed)
  // Units the page opened on standing where their box takes none of their kind from the reader (a
  // section in a section): unit id -> the kind of that box. The reader can put none there, so undo alone
  // brings one back, and every commit says so of it (`stood`), or the file would refuse what it held.
  const stood = restore?.stood ?? new Map();
  let serial = restore?.serial ?? 0;
  // Units of the file without an id yet that the page asked to name (idFor), until a commit has.
  const naming = new Set();

  // ---------- the table ----------
  // identity -> { unit, block, box }: what of the file the element of that identity is (a paragraph
  // is a unit and its own text block, a list a unit and its box). The map's entries know their
  // element's identity back (`cid`).
  const table = restore?.table ?? new Map();
  // identity -> { unit, block, box, around }: what of the file it was, which the file dropped while the
  // page still had it: made on the page from now on (sync-state.mjs asMade). `around`: a container
  // deleted while its blocks went elsewhere, the source the file gave ({ source, seal, type }).
  const dropped = restore?.dropped ?? new Map();
  const keyedIds = restore?.keyedIds ?? new Set(); // identities of keyed blocks (detail cards) made on the page that the file has
  const proposals = restore?.proposals ?? new Map(); // identity of a block made (or put back) on the page -> the id it proposes
  const LISTS = { unit: map.units, block: map.blocks, box: map.boxes };

  const entryOf = (node) => {
    const key = node?.getAttribute?.(ELEMENT_ID);
    return key ? table.get(key) : undefined;
  };
  const idOf = (node) => entryOf(node)?.unit ?? null;
  const blockOf = (node) => entryOf(node)?.block ?? null;
  const boxOf = (node) => entryOf(node)?.box ?? null;
  // The element of `field` `id` (a unit, block or box of the map) is `element` from now on.
  const bind = (element, field, id) => {
    const key = identityOf(element);
    const entry = LISTS[field][id];
    const before = entry.cid !== undefined && entry.cid !== key ? table.get(entry.cid) : undefined;
    if (before?.[field] === id) delete before[field];
    table.set(key, { ...table.get(key), [field]: id });
    entry.cid = key;
    dropped.delete(key);
  };
  // No element is `field` `id` any more; `drop`: the one that was is made on the page from now on.
  const unbind = (field, id, drop = false) => {
    const key = LISTS[field][id]?.cid;
    const entry = key === undefined ? undefined : table.get(key);
    if (entry?.[field] !== id) return;
    delete entry[field];
    if (drop) {
      dropped.set(key, { ...dropped.get(key), [field]: id });
      proposals.delete(key);
    }
  };
  const onPage = (key) => key === undefined ? null : root.querySelector(`[${ELEMENT_ID}="${key}"]`);
  const unitElement = (id) => entryOf(onPage(map.units[id]?.cid))?.unit === id ? onPage(map.units[id].cid) : null;
  const hostOf = (id) => {
    const key = map.blocks[id]?.cid;
    return key !== undefined && table.get(key)?.block === id ? onPage(key) : null;
  };
  // The unit an element is or is in.
  const unitAround = (node) => {
    for (let at = node; at?.nodeType === 1; at = at.parentElement) {
      const id = idOf(at);
      if (id !== null) return id;
    }
    return null;
  };
  // The id the file has for a unit of the page, or the one a block made on the page proposes.
  const fileIdOf = (node) => {
    const unit = idOf(node);
    return unit !== null ? map.units[unit].blockId : proposals.get(node?.getAttribute?.(ELEMENT_ID));
  };

  // Elements not seen yet get their identity; one that carries the marks of a block of the file
  // (the page as it was served; a code block opened for editing, components/code/) is that block. One
  // given an identity before the commits saw it is not seen yet either: a table's cells, which the
  // layout's grid names by identity before the page's first marks (components/table/grid.mjs).
  function learn() {
    for (const node of knownElements(root)) {
      if (table.has(node.getAttribute(ELEMENT_ID))) continue;
      identityOf(node);
      for (const [field, name] of [["unit", "data-ge-unit"], ["block", "data-ge-block"], ["box", "data-ge-box"]]) {
        const value = node.getAttribute(name) ?? "";
        if (value !== "" && LISTS[field][Number(value)]) bind(node, field, Number(value));
      }
    }
  }

  // Identities more than one element on the page carries: none ever should (a copy has none of
  // its own, core.mjs); tests look.
  let doubled = [];
  const view = {
    entry: (key) => table.get(key),
    dropped: (key) => dropped.get(key),
    keyed: (key) => keyedIds.has(key),
    proposal: (key) => proposals.get(key),
    units: map.units,
    blocks: map.blocks,
    boxes: map.boxes,
    shown: (unit) => getLayout()?.types?.get(unit),
    element: (unit) => unitElement(unit),
  };
  /** Write the page's marks from the table (sync-state.mjs): before every look at the page, after every answer. */
  function marks() {
    learn();
    // What is sealed goes by its id from the moment it is on the page (the kit keeps a component's
    // state under it): one made there proposes it now, where any other block does with its commit.
    if (SEALED) for (const node of root.querySelectorAll(`:is(${SEALED})[data-ge-new]`)) proposedId(node);
    const nodes = [...root.querySelectorAll(`[${ELEMENT_ID}]`)];
    const index = new Map();
    doubled = [];
    for (const node of nodes) {
      const key = node.getAttribute(ELEMENT_ID);
      if (index.has(key)) doubled.push(key);
      else index.set(key, node);
    }
    const shown = (id) => {
      const key = map.units[id]?.cid;
      return key !== undefined && table.get(key)?.unit === id ? index.get(key) ?? null : null;
    };
    // A unit a commit deleted that the page shows again as another type than it had (an item put
    // back by undo, then its list turned into paragraphs): its source would put back what it was,
    // where that cannot stand, so it is a block made on the page instead, as is what went with it.
    for (const [id, entry] of removed) {
      const element = shown(id);
      if (!element || entry.type === undefined || ownTypeOf(element) === entry.type) continue;
      touched(); // its text blocks leave the baselines
      removed.delete(id);
      for (const [other, owner] of removedWith) {
        if (owner !== id) continue;
        removedWith.delete(other);
        drop(other);
      }
      drop(id);
    }
    project(nodes, { ...view, element: shown });
    // Words no commit will send any more, given up for the file's (保留 Agent 的, 用文件里的; the page shows
    // the file's once nothing else waits), and what the reader would write beside them: read-only until
    // then, whatever element stands for them (the block converted, or put back by undo), as the server's
    // locks are (a hover says why).
    if (discarded.size > 0) {
      for (const host of root.querySelectorAll("[contenteditable='true']")) if (discarded.has(issueKey("text", blockOf(host))) || givenWords(unitAround(host))) lockHost(host, "given-up");
    }
  }

  // ---------- naming ----------
  const unitRef = (id) => {
    const unit = map.units[id];
    const open = openUnits.get(id);
    // With its id, what it was in the version it is named by too: found by that if a file written from an
    // earlier read has lost the id.
    if (unit.blockId) return { key: id, id: unit.blockId, hash: unit.hash, ...(open !== undefined ? { open, openHash: openHashes.get(id) } : {}) };
    unit.proposed ??= randomBlockId(); // the id it is to get: the same in every commit until it has one
    return { key: id, open: open ?? -1, hash: unit.hash, blockId: unit.proposed };
  };
  const blockRef = (id) => {
    const block = map.blocks[id];
    const before = sources.get(id) ?? "";
    if (block.kind === "title") return { title: true, before };
    if (block.unit === null || block.unit === undefined) return openBlocks.has(id) ? { open: openBlocks.get(id), before } : { outside: true, before };
    return block.self ? { unit: unitRef(block.unit), self: true, before } : { unit: unitRef(block.unit), path: block.path, before };
  };
  const boxRef = (id) => {
    const box = map.boxes[id];
    if (box.kind === "main") return { main: true };
    if (box.unit === null || box.unit === undefined) return { kind: box.kind, ...(box.key !== undefined && box.key !== null ? { key: box.key } : {}) }; // in no unit: the report's header, a detail card's content (by its key)
    return { unit: unitRef(box.unit), kind: box.kind, ...(box.key !== undefined && box.key !== null ? { key: box.key } : {}) };
  };
  const placeRef = (place) => place.into !== undefined ? { into: boxRef(place.into) }
    : place.after !== undefined ? { after: unitRef(pastWaiting(place.after)) } : { before: unitRef(place.before) };
  // The box of the layout a unit stands in, or undefined.
  const layoutBox = (id) => [...(getLayout()?.orders ?? [])].find(([, list]) => list.includes(id))?.[0];
  // The units the layout has right after a unit in its box that wait off the page where the file has them
  // still (a deletion held for the reader, or given up, of a unit the file has one of: not `lacks`). What is
  // placed after the unit goes after them, as the page shows none of them, and what stood after them stays
  // after them (a section dissolved after a paragraph whose deletion waits: its blocks go after that
  // paragraph, not before it: pastWaiting); where the unit leaves a container the commit deletes, they go
  // with it (a section dissolved around such a paragraph: build).
  const waitingAfter = (id) => {
    const order = getLayout()?.orders.get(layoutBox(id)) ?? [];
    const units = [];
    for (const other of order.slice(order.indexOf(id) + 1)) {
      const key = issueKey("unit", other);
      const waits = issues.get(key) ?? discarded.get(key);
      if (unitElement(other) || !waits || lacks(waits)) break;
      units.push(other);
    }
    return units;
  };
  const pastWaiting = (id) => waitingAfter(id).at(-1) ?? id;
  // The end of the box an element is in, when the box is one the file has.
  const endOf = (element) => {
    const value = element?.parentElement?.closest("[data-ge-box]")?.getAttribute("data-ge-box") ?? "";
    return value === "" ? null : { into: Number(value) };
  };
  // The id a block made on the page is to have in the file, proposed by the page and kept for its
  // identity, so every commit that carries the block proposes the same one: sent twice (its answer
  // lost, or again from the crash buffer), a commit makes it once (commitEdits). A unit put back
  // proposes the id it had, and so does one the file dropped, written anew (a column of a row put back).
  const proposedId = (element) => {
    if (!element) return undefined;
    const unit = idOf(element);
    if (unit !== null && map.units[unit].blockId) return map.units[unit].blockId;
    const key = identityOf(element);
    if (!proposals.has(key)) proposals.set(key, map.units[dropped.get(key)?.unit]?.blockId ?? randomBlockId()); // never one an element carries: a copy's would be its original's
    return proposals.get(key);
  };
  const identity = (element) => element?.getAttribute?.(ELEMENT_ID) ?? null;
  // The ids the page knows its blocks by: its units' (the file's, as far as the page knows) and those
  // it proposed for the blocks it made. Every commit carries them, so that a unit the page names by
  // what it said when it opened is never one of these (commitEdits, `pageIds`): a block's hash
  // leaves its id out, and an empty paragraph made on the page says what an empty one of the file says.
  const pageIds = () => [...new Set([...map.units.map((unit) => unit.blockId), ...proposals.values()].filter(Boolean))];
  // The units a unit is in, as the map has them (the file's, as far as the page knows): the unit
  // itself first, then the one around it, outward.
  function* chain(id) {
    for (let at = id; at !== null && at !== undefined && map.units[at]; at = map.units[at].parent) yield at;
  }
  const isInside = (unit, id) => { // unit is somewhere in unit `id`
    for (const at of chain(unit.parent)) if (at === id) return true;
    return false;
  };

  // What a commit leaves out: a block or operation held back (unless `all`), a block that must keep
  // some text and has none (a new section's title), a block made on the page the file refused.
  // A unit (or one around it) whose change is held back or given up, where that holds its words
  // (holdsWords, the `words` of what was given up; a deletion those of the blocks it took off the page,
  // `off`): so are the texts in it. Any other holds none of them: they go as words do, the change held or
  // given up alone.
  const givenWords = (id, off = false) => [...chain(id)].some((at) => {
    const given = discarded.get(issueKey("unit", at));
    return given?.words || (off && given?.kind === "remove");
  });
  const unitHeld = (id, all, off = false) => givenWords(id, off) || (!all && [...chain(id)].map((at) => issues.get(issueKey("unit", at))).some((entry) => entry && holdsWords(entry, off)));
  // Whether a unit's change is one the reader gave up: the one its card was about, as it was (of what a
  // component writes, each part as it was: givenParts), or any where the file has no one unit for it. Another
  // change of that kind made since (the block moved elsewhere, converted to another type, its table's rows
  // changed too) goes as any does, and asks where the file has the unit otherwise.
  const givenUp = (change) => {
    const given = discarded.get(issueKey("unit", change.id));
    if (!given?.kind || lacks(given)) return Boolean(given);
    if (given.kind !== kindOf(change)) return false;
    if (change.source) return Object.keys(change.source).every((name) => givenParts(change).has(name));
    return !given.change || JSON.stringify({ ...given.change, id: undefined }) === JSON.stringify({ ...change, id: undefined });
  };
  // Of what a unit's component writes (`change.source`), the parts given up as they are now: none other goes.
  const givenParts = (change) => {
    const given = discarded.get(issueKey("unit", change.id))?.change?.source;
    return new Set(Object.keys(change.source).filter((name) => given?.[name] === change.source[name]));
  };
  // A text block in the content of a keyed block (a detail card) made on the page and saved,
  // while the block is off the page (its making undone): the file keeps it, and it is no unit to
  // delete, so nothing in it is taken out either (adoptKeyed).
  const keyedAway = (edit) => {
    const key = map.blocks[edit.id]?.cid;
    return key !== undefined && [...keyedBlocks.values()].some((block) => !block.isConnected && block.querySelector(`[${ELEMENT_ID}="${key}"]`));
  };
  // A text block off the page of a kind that goes with its block alone (a part a component's drawing
  // took out, the block still there): the file keeps it, as nothing can take it out.
  const stays = (edit) => edit.parts.length === 0 && !capsFor(map.blocks[edit.id].kind).split(" ").includes("remove");
  const skipText = (edit, blanks, all) => {
    const host = hostOf(edit.id);
    return (issues.has(issueKey("text", edit.id)) && !all) || discarded.has(issueKey("text", edit.id)) || (host && blanks.has(host)) || !map.blocks[edit.id] || unitHeld(map.blocks[edit.id].unit, all, !host) || keyedAway(edit) || stays(edit);
  };
  // Of what a unit's component wrote (`change.source`), the parts a write held back for the reader holds,
  // with those one edit wrote together with any of them: the rest goes, as the write of another part
  // does where someone else changed one (source/commit.mjs). Null where no such write is held.
  const heldParts = (change) => {
    const entry = issues.get(issueKey("unit", change.id));
    if (!change.source || !entry?.change?.source) return null;
    const held = new Set(Object.keys(entry.change.source));
    const element = unitElement(change.id);
    const groups = element ? pageOfUnit(element)?.together?.(element, [...new Set([...held, ...Object.keys(change.source)])]) ?? [] : [];
    for (const group of groups) if (group.some((name) => held.has(name))) group.forEach((name) => held.add(name));
    return held;
  };
  const skipUnit = (change, blanks, all) => {
    if (change.insert) {
      const element = madeFrom.get(change);
      return !element || (refused.has(identity(element)) && !all) || [...blanks].some((node) => element.contains(node));
    }
    const held = all ? null : heldParts(change);
    const apart = Boolean(held) && Object.keys(change.source).some((name) => !held.has(name));
    if ((issues.has(issueKey("unit", change.id)) && !all && !apart) || givenUp(change) || (change.source && unwritten.has(change.id))) return true;
    // A unit in a block not finished (a new row of columns one of which is still empty): it stays as
    // the file has it, its move and its conversion going with that block once it is written.
    if (blanks.size > 0) {
      const element = unitElement(change.id);
      if (element && unfinished(blanks).some((top) => top.contains(element))) return true;
    }
    if (change.move && removed.has(change.id)) {
      const element = unitElement(change.id);
      return !element || (refused.has(identity(element)) && !all);
    }
    return false;
  };

  // ---------- what changed since ----------
  // collect() reads the page and what the commits know of it (the baselines, the layout, the table
  // the marks are written from), and nothing else. Asked again with neither changed, it gives the
  // answer it gave: a page that is left asked twelve to seventeen times (the last keystrokes
  // counted, the flush and the crash buffer in prepare-close, then all of it again in pagehide and
  // visibilitychange as its frame went: 0.3-1 s on a large report before the next one was even
  // asked for), and so does a commit after the pause that was counted, each a pass over every block
  // of the report. The page changing is any mutation of the document (a MutationObserver, its
  // records taken at once when asked: takeRecords) but the attributes of <html> itself (data-ge-save
  // and the like, which no block is in); what the commits know changes
  // with an answer taken in (apply), a decision on a conflict (resolve), a block put back (putBack)
  // and a unit to name (idFor), which count as a change too (touched). The marks collect writes
  // first are a change like any other: they are counted after they are written. A document of its
  // own with no window (recover's) has no observer: there every collect is anew. Watched from once
  // the page has its first marks (the end of createCommits).
  const Observer = root.defaultView?.MutationObserver ?? null;
  let changes = 0;
  const matters = (records) => records.some((record) => record.type !== "attributes" || record.target !== root.documentElement);
  const observer = Observer ? new Observer((records) => { if (matters(records)) changes += 1; }) : null;
  const touched = () => { changes += 1; };
  /**
   * Where the page and what the commits know of it stand: the same number as long as neither
   * changed (null when not watched: never the same).
   */
  function generation() {
    if (!observer) return null;
    if (matters(observer.takeRecords())) changes += 1;
    return changes;
  }
  let last = null; // collect()'s last answer: { collected, generation, layout }

  /**
   * What changed on the page since the last commit (collectEdits), its marks written first; the
   * answer it gave last when nothing changed since (generation).
   */
  function collect() {
    const now = generation();
    if (now !== null && last?.generation === now && last.layout === getLayout()) return last.collected;
    marks();
    const collected = collectEdits(root, baselines, getLayout());
    last = { collected, generation: generation(), layout: getLayout() };
    return collected;
  }

  /** Whether `collected` (collect()'s) is what collect() would answer now: nothing changed since. */
  const current = (collected) => collected !== null && collected !== undefined && last?.collected === collected && last.generation !== null && last.generation === generation() && last.layout === getLayout();

  /** How many changes the next commit would carry (of `collected`: collect()'s result). */
  function waiting(collected = collect()) {
    if (holdsAll(collected)) return 0;
    const blanks = new Set(collected.blank);
    return collected.edits.filter((edit) => !skipText(edit, blanks, false)).length + collected.units.filter((change) => !skipUnit(change, blanks, false)).length
      + [...naming].filter((id) => map.units[id] && !map.units[id].blockId && !removed.has(id) && unitElement(id)).length;
  }

  // The outermost blocks made on the page around blocks no commit can carry yet (`nodes`).
  const unfinished = (nodes) => {
    const roots = new Set();
    for (const node of nodes) {
      let top = null;
      for (let at = node; at && at !== root; at = at.parentElement) if (at.hasAttribute?.("data-ge-new")) top = at;
      if (top) roots.add(top);
    }
    return [...roots].filter((top) => ![...roots].some((other) => other !== top && other.contains(top)));
  };

  // Blocks no commit can carry yet (a new disclosure's title still empty, a new block with no place,
  // a row of columns one of which holds nothing): the text of the outermost block made on the page
  // around each, where it has any. A block of the file that must keep some text is not one of them:
  // the file has its text.
  function drafts(collected) {
    return heldBack(collected).map(blocksText).filter(Boolean);
  }

  // Those blocks, and a block of the file holding structure its words cannot (collectEdits `strays`): the
  // file keeps what it had while the page shows more, so it is no more saved than they are.
  const heldBack = ({ blank, unplaced, strays = [] }) => [...unfinished([...blank, ...unplaced]), ...strays.filter((node) => unfinished([node]).length === 0)];
  // Whether every change waits (a block holding such structure: build).
  const holdsAll = (collected) => (collected.strays?.length ?? 0) > 0;

  /**
   * How many changes the next commit would carry, and how many blocks none can carry yet (drafts):
   * counted with or without text, as the page shows them and the file does not have them (an empty
   * paragraph is written once it has a place: a row holding one beside an empty code block is not).
   */
  function counts(collected = collect()) {
    return { waiting: waiting(collected), drafts: heldBack(collected).length };
  }

  /** The texts of the page's blocks, as the reader sees them (the crash buffer's safety net: checkLeft). */
  const texts = () => [...root.querySelectorAll("[data-ge-block], [data-ge-new], [data-ge-part]")].filter((node) => node.getAttribute("contenteditable") === "true").map(ownText).filter(Boolean);

  // Words typed in a text block the file writes from elsewhere, before it has: no commit can carry them.
  const typedParts = () => [...root.querySelectorAll("[data-ge-part]")].filter((host) => host.getAttribute("data-ge-part") !== ownHTML(host)).map(ownText).filter(Boolean);

  /**
   * What the crash buffer keeps: the commit of everything not in the file (what is held back too),
   * the texts of the blocks no commit can carry yet, and those typed in a block the commit makes
   * (they go with the next commit, once it has made it). { request, drafts: [text], typed: [text] }
   * `collected`: collect()'s result, when the caller has it from the same task.
   */
  function buffer(collected = collect()) {
    return { request: build({ held: true, whole: true, collected })?.request ?? null, drafts: drafts(collected), typed: typedParts() };
  }

  /**
   * The commit of everything changed since the last one: { request, pending }, or null when
   * nothing is left to commit. What is held back is left out, unless `held` (the crash buffer), and
   * of what components wrote what one commit carries goes, unless `whole` (the crash buffer again,
   * which keeps all a page leaves).
   */
  function build({ held: all = false, whole = false, collected = null } = {}) {
    collected ??= collect();
    // A text block holding structure its words cannot (collectEdits `strays`): what the page lost track
    // of may be anywhere (the words of a list taken into a paragraph, the list gone from its place), so
    // nothing is written until it holds words alone again (undo), but by the crash buffer (`all`).
    if (!all && holdsAll(collected)) return null;
    const { edits, units: changes, blank } = collected;
    const snapshot = snapshotLayout(root);
    const blanks = new Set(blank);
    const texts = [];
    const ops = [];
    const touch = new Map();
    // `moves`: the units the page shows moved, whether or not the commit carries their move (apply: a unit that
    // waits stands where the file has it).
    const pending = { texts: new Map(), units: new Map(), made: new Map(), restores: new Map(), html: new Map(), snapshot, moves: new Set(changes.filter((change) => change.move).map((change) => change.id)) };
    // Every new text block's html as sent: what it starts from once committed.
    for (const host of root.querySelectorAll("[data-ge-new][contenteditable='true'], [data-ge-convert] [contenteditable='true'], [contenteditable='true'][data-ge-convert]")) pending.html.set(host, serializeInner(host));
    // A unit takes along what its component says (a Sheet tab, its panel: boxOwner), so a change in
    // such a box is a change of that unit too (its hash covers the box).
    const touchOwner = (box) => {
      const owner = box ? boxOwner(box) : null;
      const id = owner ? idOf(owner) : null;
      if (id !== null && !removed.has(id)) touchUnits(id);
    };
    // The boxes a unit stood in when the last commit left it: what leaves them changes them. Each box
    // as a search for it finds it, from one index of the page's boxes (nothing here moves one).
    let boxElements = null;
    const touchLeft = (id) => {
      for (const [box, order] of getLayout()?.orders ?? []) if (order.includes(id)) touchOwner((boxElements ??= firstByAttribute(root, "data-ge-box")).get(String(box)) ?? null);
    };
    function touchUnits(id) {
      for (const at of chain(id)) {
        if (touch.has(at)) continue;
        touch.set(at, unitRef(at));
        touchLeft(at);
      }
    }
    const touchAround = (node) => {
      for (let at = node; at?.nodeType === 1; at = at.parentElement) {
        const id = idOf(at);
        if (id !== null && !removed.has(id) && !touch.has(id)) touch.set(id, unitRef(id));
        if (at.hasAttribute("data-ge-box")) touchOwner(at);
      }
    };
    // The units right beside a block made on the page (not one undo put back), the nearest on each side in its box, past
    // what is no block: named, so that the revert check finds where it stood by their ids (besideOf), its place
    // then told though the write that took it out changed the one beside it, and a write from before this
    // commit, which has them without, told from one after it (revertedUnits; feedback of 2026-11-17).
    const touchBeside = (element) => {
      for (const step of ["previousElementSibling", "nextElementSibling"]) {
        for (let at = element?.[step]; at; at = at[step]) {
          if (!at.hasAttribute(ELEMENT_ID)) continue;
          const id = idOf(at);
          if (id !== null && !removed.has(id) && !touch.has(id)) touch.set(id, unitRef(id));
          break;
        }
      }
    };
    // The units inside one that moves go to a new indentation with it: their text changes too.
    const touchWithin = (element) => {
      for (const node of element?.querySelectorAll?.(`[${ELEMENT_ID}]`) ?? []) {
        const id = idOf(node);
        if (id !== null && !removed.has(id) && !touch.has(id)) touch.set(id, unitRef(id));
      }
    };
    const key = () => `n${serial++}`;
    // The parts of what a component wrote that this commit carries: as many as one commit takes (`most`,
    // its page object's `dataMost`, in bytes) with what it carries already, the first whatever it is (the
    // server says what it makes of it), the parts one edit wrote together (`groups`) all or none. Those
    // left out still differ from what the file holds, and go with the next commit.
    let carried = 0;
    const within = (source, most, groups) => {
      const kept = {};
      const apart = Object.keys(source).filter((name) => !groups.some((group) => group.includes(name))).map((name) => [name]);
      for (const names of [...groups, ...apart]) {
        const bytes = names.reduce((sum, name) => sum + new TextEncoder().encode(source[name]).length, 0);
        if (carried > 0 && carried + bytes > most) continue;
        carried += bytes;
        for (const name of names) kept[name] = source[name];
      }
      return Object.fromEntries(Object.keys(source).filter((name) => Object.hasOwn(kept, name)).map((name) => [name, kept[name]]));
    };
    const stoodOf = (id) => (stood.has(id) ? { stood: stood.get(id) } : {});
    // A deleted unit undo put back: its source, to be written again.
    const restoreNode = (id, element) => {
      const nodeKey = key();
      const { source, seal } = removed.get(id);
      pending.made.set(nodeKey, element);
      pending.restores.set(nodeKey, id);
      return { restore: { source, seal }, key: nodeKey, blockId: proposedId(element), ...stoodOf(id) };
    };
    const nodeRef = (node) => {
      // A copy of a card or a table: the file copies the unit's own source (with the keys the
      // paste gave the charts drawn from tables in it: core.mjs nodeOf).
      if (node.copy !== undefined) {
        const nodeKey = key();
        const element = madeFrom.get(node);
        if (element) pending.made.set(nodeKey, element);
        return { copy: unitRef(node.copy), key: nodeKey, blockId: proposedId(element), ...(node.keys ? { keys: node.keys } : {}) };
      }
      if (node.unit !== undefined) {
        if (removed.has(node.unit)) return restoreNode(node.unit, madeFrom.get(node) ?? unitElement(node.unit));
        touchUnits(map.units[node.unit]?.parent); // taken from its place
        touchLeft(node.unit);
        touchWithin(madeFrom.get(node) ?? unitElement(node.unit));
        return { unit: unitRef(node.unit), ...stoodOf(node.unit) };
      }
      const nodeKey = key();
      const element = madeFrom.get(node);
      if (element) pending.made.set(nodeKey, element);
      const { children, ...rest } = node;
      const blockId = BLOCK_TYPES[node.type]?.keyed ? undefined : proposedId(element); // a keyed block (a detail card) is known by its own id
      // One of the file put back around its blocks, still of the type the source says.
      const was = dropped.get(identity(element));
      const put = was?.around?.type === node.type ? { restore: { source: was.around.source, seal: was.around.seal } } : {};
      return { ...rest, ...put, ...stoodOf(was?.unit), key: nodeKey, ...(blockId ? { blockId } : {}), ...(children ? { children: children.map(nodeRef) } : {}) };
    };

    for (const edit of edits) {
      const textKey = issueKey("text", edit.id); // the key of a conflict of its text too
      const host = hostOf(edit.id);
      if (skipText(edit, blanks, all)) continue;
      const parts = edit.parts.map((part) => {
        if (part.keep) return { keep: true, html: part.html };
        const partKey = key();
        const element = madeFrom.get(part);
        pending.made.set(partKey, element);
        touchBeside(element);
        return { tag: part.tag, html: part.html, ...(part.classes ? { classes: part.classes } : {}), ...(part.attributes ? { attributes: part.attributes } : {}), key: partKey, ...(element ? { blockId: proposedId(element) } : {}) };
      });
      const from = keptFrom(edit.id);
      texts.push({ key: textKey, block: { ...blockRef(edit.id), ...(from !== undefined ? { from } : {}) }, parts });
      pending.texts.set(textKey, { id: edit.id, parts, before: sources.get(edit.id) ?? "" });
      if (host) touchAround(host);
      else touchUnits(map.blocks[edit.id].unit);
    }

    // Units put back (undo of a deletion an earlier commit made): what changed meanwhile in them and in
    // what they hold or took along (converted, moved within or out, resized) waits for the next commit,
    // once the file has them back (it names nothing of them before).
    const restored = changes.filter((change) => change.move && removed.has(change.id)).map((change) => change.id);
    const restoring = restored.map(unitElement).filter(Boolean);
    // The units a change concerns: its own, or those a block made on the page takes along.
    const concerned = (change) => {
      if (!change.insert) return [change.id];
      const units = [];
      const visit = (node) => {
        if (node.unit !== undefined) units.push(node.unit);
        node.children?.forEach(visit);
      };
      visit(change.insert);
      return units;
    };
    // Units that went with one deleted whole (an earlier commit) and stand on the page again without
    // it (undo put it back, then the reader took them out of it; or it put back a block made on the
    // page holding them): the file has them only inside it, so it comes back first, from its source,
    // where the first of them stands, holding them; taking them out of it (and it away) goes with the
    // next commit, once the file has them back.
    const ownerOf = (change) => (change.move || change.insert ? concerned(change).map((id) => removedWith.get(id)).find((owner) => owner !== undefined) : undefined);
    const orphans = new Map(); // owner -> the first of them (its move, or the block made holding it)
    for (const change of changes) {
      const owner = ownerOf(change);
      if (owner !== undefined && removed.has(owner) && !unitElement(owner) && !orphans.has(owner)) orphans.set(owner, change);
    }
    const withinRestored = (change) => {
      if (change.move && removed.has(change.id)) return false;
      if (concerned(change).some((id) => restored.includes(removedWith.get(id)))) return true;
      if (change.insert) return false;
      const element = unitElement(change.id);
      return Boolean(element) && restoring.some((other) => other.contains(element));
    };
    // Items the file has holding lists (in their own box) that the page turned into another type:
    // what this commit does to their lists (taken out of them, or away) goes first, their
    // conversion and their move (a paragraph again, in a box that takes no items) with the next
    // commit, once the file has them holding none (an indent undone while it was on its way).
    const holding = new Set([...(getLayout()?.orders ?? [])].filter(([box, order]) => boxRole(map.boxes[box]?.kind) === "nest" && order.length > 0).map(([box]) => map.boxes[box].unit));
    const waitsForLists = (change) => holding.has(change.id) && Boolean(change.replace || change.move) && ownTypeOf(unitElement(change.id) ?? root.documentElement) !== getLayout()?.types?.get(change.id);
    const removing = new Set(); // the units this commit deletes (a unit's deletion is among its changes before any move)
    const leavesRemoved = (id) => removing.has(map.boxes[layoutBox(id)]?.unit);
    // A unit held for the reader that leaves a container this commit deletes (a section dissolved around a block
    // whose conversion waits) goes with the blocks around it, its place alone (`along`): what it waits with stands.
    const leaves = (change) => {
      const held = change.move && !all ? issues.get(issueKey("unit", change.id)) : null;
      return held?.kind === "unit" && kindOf(held.change) !== "move" && leavesRemoved(change.id);
    };
    for (const change of changes) {
      const opKey = `u${serial++}`; // this operation's key in the request (the key of its conflict is issueKey("unit", unit))
      const along = leaves(change);
      if (skipUnit(change, blanks, all || along)) continue;
      if (withinRestored(change) || waitsForLists(change)) continue;
      const owner = ownerOf(change);
      if (orphans.has(owner)) {
        if (orphans.get(owner) !== change) continue;
        const element = removed.get(owner).element;
        const node = restoreNode(owner, element);
        ops.push({ key: opKey, insert: node, place: placeRef(change.move ?? change.place) });
        pending.units.set(opKey, { insert: true, element, node });
        continue;
      }
      if (change.insert) {
        const element = madeFrom.get(change);
        const node = nodeRef(change.insert);
        const place = (elsewhere.has(identity(element)) && endOf(element)) || change.place;
        ops.push({ key: opKey, insert: node, place: placeRef(place) });
        pending.units.set(opKey, { insert: true, element, node });
        touchAround(element.parentElement);
        touchBeside(element);
        continue;
      }
      const element = unitElement(change.id);
      if (change.move && removed.has(change.id)) {
        // Deleted by an earlier commit, back on the page (undo).
        const node = restoreNode(change.id, element);
        ops.push({ key: opKey, insert: node, place: placeRef((elsewhere.has(identity(element)) && endOf(element)) || change.move) });
        pending.units.set(opKey, { insert: true, element, node });
        touchAround(element.parentElement);
        continue;
      }
      const unit = unitRef(change.id);
      const hash = map.units[change.id].hash;
      let op;
      if (change.remove) {
        // A container that goes when emptied (a list, a quote) names the units it held: if the file
        // has it changed by someone else, only these go (commitEdits), what they added stays.
        const items = getLayout()?.elements.get(change.id)?.hasAttribute("data-ge-pure") ? map.units.filter((other) => other.parent === change.id && !removed.has(other.id)).map((other) => unitRef(other.id)) : [];
        op = { remove: true, hash, ...(items.length > 0 ? { items } : {}) };
        touchUnits(map.units[change.id].parent);
        touchLeft(change.id);
      } else if (change.move) {
        op = { move: placeRef((movedElsewhere.has(change.id) && endOf(element)) || change.move), ...stoodOf(change.id) };
        touchUnits(map.units[change.id].parent);
        touchLeft(change.id);
        touchAround(element);
        touchWithin(element);
      } else if (change.replace) op = { replace: change.replace, hash };
      else if (change.table) op = { table: change.table, hash }; // its rows and columns (components/table/grid.mjs)
      else if (change.source) { // what its component wrote, but the parts a write held back holds (heldParts) and those given up (givenParts)
        const waits = new Set([...(all ? [] : heldParts(change) ?? []), ...givenParts(change)]);
        const going = Object.fromEntries(Object.entries(change.source).filter(([name]) => !waits.has(name)));
        const written = pageOfUnit(element).together?.(element, Object.keys(going)) ?? [];
        const source = whole ? going : within(going, pageOfUnit(element).dataMost, written);
        if (Object.keys(source).length === 0) continue;
        // What each part held as the file last said: it goes in where someone else changed only the rest,
        // the parts one edit wrote together together.
        const held = map.units[change.id].parts ?? {};
        const parts = Object.fromEntries(Object.keys(source).filter((name) => held[name]).map((name) => [name, held[name]]));
        const together = written.filter((group) => group.every((name) => Object.hasOwn(source, name)));
        op = { source, hash, parts, ...(together.length > 0 ? { together } : {}), definition: change.definition };
      } else if (change.retag) op = { retag: change.retag };
      else if (change.toggle) op = { toggle: change.toggle, on: change.on };
      else if (change.size) op = { size: change.size, value: change.value };
      else if (change.attribute) op = { attribute: change.attribute, value: change.value };
      else continue;
      // The reader said so, of a change of this kind: whatever the file did to it, so long as the file still
      // has the unit as the refusal they were shown gave it (its `hash`). A change of another kind made since
      // (the block converted anyway deleted meanwhile) is held to what the page saw, as any is.
      const word = forced.get(change.id);
      if (word && word.kind === kindOf(change)) Object.assign(op, { force: true }, word.hash !== undefined ? { hash: word.hash } : {});
      if (!change.remove) touchAround(element);
      ops.push({ key: opKey, unit, ...op });
      pending.units.set(opKey, { id: change.id, change: op.source ? { ...change, source: op.source } : change, ...(op.source ? { parts: op.parts } : {}), ...(op.force ? { forced: true } : {}), ...(along ? { along } : {}) });
      // What waits off the page right after a unit that leaves a container this commit deletes (a section
      // dissolved around a paragraph whose deletion waits: waitingAfter) goes with it, where the file has it
      // still, so that the blocks keep their order and none stands in the container alone, its place alone
      // too (`along`). An answer that does not take such a place says nothing: the unit waits as it did.
      if (change.remove) removing.add(change.id);
      for (const id of change.move && !all && leavesRemoved(change.id) ? waitingAfter(change.id) : []) {
        const alongKey = `u${serial++}`;
        ops.push({ key: alongKey, unit: unitRef(id), move: op.move });
        pending.units.set(alongKey, { id, change: { id, move: change.move }, along: true });
      }
    }
    // The units asked to be named, each with the id it proposes (unitRef), alone when nothing else changed.
    pending.named = [];
    for (const id of naming) {
      if (!map.units[id] || map.units[id].blockId) naming.delete(id);
      else if (!removed.has(id) && unitElement(id)) {
        if (!touch.has(id)) touch.set(id, unitRef(id));
        pending.named.push(id);
      }
    }
    marks(); // the ids proposed
    if (texts.length === 0 && ops.length === 0 && pending.named.length === 0) return null;
    return { request: { opening: map.version, texts, units: ops, touch: [...touch.values()], pageIds: pageIds() }, pending };
  }

  // ---------- taking in the answer ----------
  // A text block of the page is block `id` of the map from now on (a new one, unless it is one
  // already): in the page unit `unit` (null: in none), at the place the file
  // says (`file`: { self } or { path }, never counted on the page). It starts from what the commit
  // sent when it sent it as new (a block made on the page, the text of a unit turned into another
  // type), else from what it shows, when that is what the file says it is (`file`: { inner, atoms };
  // a copy's text, which the page shows as it was pasted). Showing other words (typed while the commit was on its way into a block the file
  // has, though the page took it for gone), it starts from the file's text, as the page shows
  // that, so that the page's own words go with the next commit.
  const registerBlock = (host, pending, file = null, unit = null) => {
    const start = () => pending.html.get(host)
      ?? (file && !matchesSource(host, file.inner) ? shownAs(host, file.inner, file.atoms) : null)
      ?? serializeInner(host);
    const known = blockOf(host);
    if (known !== null && map.blocks[known]) {
      const block = map.blocks[known];
      if (file?.path && !block.self) block.path = file.path;
      if (block.gone || pending.html.has(host)) {
        const html = start();
        Object.assign(block, { gone: false, tag: host.localName, kind: host.getAttribute("data-ge-kind") ?? block.kind });
        sources.set(known, html);
        baselines.set(known, html);
      }
      return known;
    }
    const id = map.blocks.length;
    // Words of a block the file wrote from what it holds (`source`), as the page made them: those it
    // made them from were old, or hold what only the file's text says how to write back, and it shows
    // the file's. Others were typed, and go with the next commit.
    if (file && host.getAttribute("data-ge-part") === ownHTML(host) && (file.atoms || !matchesSource(host, file.inner))) asLoaded(host, file);
    const html = start();
    map.blocks.push({
      id,
      tag: host.localName,
      kind: host.getAttribute("data-ge-kind") ?? "flow",
      caps: (host.getAttribute("data-ge-caps") ?? "").split(/\s+/).filter(Boolean),
      inner: html,
      atoms: [],
      unit,
      ...(file?.self ? { self: true } : file?.path ? { path: file.path } : {}), // where in its unit the file has it
    });
    bind(host, "block", id);
    sources.set(id, html);
    baselines.set(id, html);
    return id;
  };
  // How many blocks holding text blocks of their own (a list item's paragraphs) asLoaded made anew, those
  // in them made anew with them: pathIndex finds a unit's blocks again then.
  let rewrites = 0;
  const holdsBlocks = (host) => host.querySelector("[contenteditable='true']") !== null;
  // A text block as a load of the page shows the file's (its inline elements of the report's own
  // atoms, written back as they are: core.mjs prepareBlock), the caret where it stood.
  const asLoaded = (host, { inner, atoms = [], kind, caps }) => {
    const selection = host.ownerDocument.getSelection();
    const place = selection?.rangeCount && host.contains(selection.anchorNode) ? rangeOffsets(host, selection.getRangeAt(0)) : null;
    const held = holdsBlocks(host);
    prepareBlock(host, { inner, atoms, kind, caps });
    if (held || holdsBlocks(host)) rewrites++;
    if (place) select(rangeAt(host, place));
  };
  // The selection in a text block someone else's words are about to be merged into, as it stands among the
  // reader's words: what puts it back there once they are in. Counted from the block's end where the words
  // after it are still what follows it (theirs went in before it), from its start where the words before it
  // are still what precedes it (theirs went in after it), else right after as much of the reader's words
  // before it as the merged text holds, the place nearest where it was (theirs went in on both sides).
  const caretKept = (host) => {
    const selection = host.ownerDocument.getSelection();
    if (!selection?.rangeCount || !host.contains(selection.anchorNode)) return () => {};
    const length = () => rangeOffsets(host, rangeAt(host, [0, Infinity]))[1];
    const words = (from, to) => rangeAt(host, [from, to]).toString();
    const [from, to] = rangeOffsets(host, selection.getRangeAt(0));
    const [total, before, after] = [length(), words(0, from), words(to, Infinity)];
    // How many characters of `text` there are up to the end of the longest end of the reader's words before
    // it that `text` holds, the one nearest where it was.
    const pastTail = (text) => {
      for (let size = before.length; size > 0; size -= 1) {
        const ends = [];
        for (let at = text.indexOf(before.slice(-size)); at >= 0; at = text.indexOf(before.slice(-size), at + 1)) ends.push(at + size);
        if (ends.length > 0) return ends.reduce((best, end) => (Math.abs(end - before.length) < Math.abs(best - before.length) ? end : best));
      }
      return 0;
    };
    // The place `count` characters of the block's words in (a line break is a place, and no character).
    const placeOf = (count) => {
      let [low, high] = [0, length()];
      while (low < high) {
        const middle = (low + high) >> 1;
        if (words(0, middle).length < count) low = middle + 1;
        else high = middle;
      }
      return low;
    };
    return () => {
      const now = length();
      const shift = now - total;
      if (to + shift >= 0 && words(to + shift, Infinity) === after) return select(rangeAt(host, [Math.max(0, from + shift), to + shift]));
      if (from <= now && words(0, from) === before) return select(rangeAt(host, [from, Math.min(to, now)]));
      const place = placeOf(pastTail(words(0, Infinity)));
      select(rangeAt(host, [place, Math.min(place + to - from, now)]));
    };
  };
  // A block the file knows by its id, not as a unit (`keyed`: a detail card).
  const keyedBlock = (node) => Boolean(BLOCK_TYPES[blockTypeOf(node)]?.keyed);
  const registerBox = (node, kind, key = null) => {
    const id = map.boxes.length;
    // A keyed block's box is named by the block's id; any other box by the unit it is in (and its
    // key there: a Sheet panel's).
    let keyed = node;
    while (keyed && !(keyedBlock(keyed) && BLOCK_TYPES[blockTypeOf(keyed)].box === kind)) keyed = keyed.parentElement;
    const entry = { id, kind, unit: unitAround(keyed ?? node), ...(keyed ? { key: keyed.id } : key !== null && key !== undefined ? { key } : {}) };
    map.boxes.push(entry);
    boxes?.set(id, entry);
    bind(node, "box", id);
    return id;
  };
  // ---------- what the file says ----------
  // After a commit the page knows of the file only what the file says (the answer's `file`: the
  // units the commit named or made, by id; commitEdits in source/), never what it sent and
  // expects the file to hold: a text's `before` is the file's text (its whitespace too), a block the
  // commit wrote is known whether or not it is still on the page (deleted while the commit was on
  // its way, it is in the file all the same, and the next commit takes it out), and the boxes a
  // unit has are those the file gives it (every list item takes lists, for one).

  // The box of `element` (a unit of the page) that is the file's box of `kind` (and `key`), as its component says.
  const boxElement = (element, { kind, key }) => boxIn(element, kind, key ?? null);
  // The text blocks of a sealed unit (what a component drew around them moves a path off), which are
  // those the file gives in its order, or null: what is sealed holds no blocks of its own.
  const inFileOrder = (element, blocks) => {
    if (!SEALED || !element.matches(SEALED)) return null;
    const hosts = [...element.querySelectorAll("[contenteditable='true']")].filter((host) => host.parentElement?.closest("[data-ge-unit], [data-ge-unit-kind]") === element);
    return hosts.length === blocks.length ? hosts : null;
  };
  // The text block of `element` (a unit of the page) that is the file's { self } or { path } one: the first
  // of its own whose path (pathFrom) is that one. `find`: the unit's text blocks by path (pathIndex), which a
  // caller asking of each of a unit's blocks makes once: found anew for each block, a table of 500 rows had
  // its thousand cells walked, each past its row's 500 siblings, for each of the thousand the answer named,
  // the page standing still for a minute after each commit there.
  const blockElement = (element, block, find = pathIndex(element)) => {
    // Its own text: the element itself, or the span of its own its description's `title` names (a Sheet tab's name).
    if (block.self) return element.matches("[contenteditable='true']") ? element : BLOCK_TYPES[blockTypeOf(element)]?.title?.(element) ?? null;
    if (!Array.isArray(block.path) || block.path[0] !== "unit") return null;
    return find(JSON.stringify(block.path));
  };
  // The text blocks of `element` by path, for asking of many in turn: found once (hostsByPath), and again only
  // once a block holding blocks of its own was made anew as the file gives it (asLoaded's `rewrites`).
  const pathIndex = (element) => {
    let index = null;
    let made = -1;
    return (want) => {
      if (made !== rewrites) [index, made] = [hostsByPath(element), rewrites];
      return index.get(want) ?? null;
    };
  };

  /**
   * Take in what the file says of the units a commit named or made (`facts`, by id): `elements`,
   * the page's elements by the id they carry, are those units; `skip`, page units whose operation
   * the file refused (they keep what the page knew); `converted`, page units the commit turned
   * into another type -> that change; `written`, the text blocks the commit wrote; `data`, what the next layout
   * holds of what components write, by page unit (apply), to which it adds what the file says of the
   * units the commit wrote whole, made or put back; `wrote`, page unit -> the parts of what its component
   * writes that the commit wrote, as sent; `given`, the hashes the answer gives (`hashes`: of the units the
   * page named, by page unit, and of the blocks it made, by key). Returns { orders: the order of the units in each
   * box of those units, by page box id, as the file has them; madeIn: page unit made by this commit ->
   * the page unit the file has it in (null: the page); arounds: page unit put back around its blocks ->
   * the source it was put back with }.
   *
   * `alone`: nobody but this page wrote the file since the page showed it, so what the file says
   * is what the page's own commits made of it, all of which the page takes in. Otherwise the file
   * holds someone else's changes the page does not show yet (it shows them once nothing is left to
   * commit): those must stay changes of theirs, not become what the page started from (its next
   * commit would undo them: move a block back, write over their words). Then the page takes in
   * only what the commit itself wrote: the blocks it made and their boxes, and the texts it sent.
   */
  function adopt(facts, elements, skip, converted, pending, written, alone, data, wrote, given) {
    const orders = new Map();
    const adopted = new Map(); // id -> [page unit id, element]
    const made = new Set(); // page units this commit made (or converted)
    const gone = new Set([...removed.keys(), ...removedWith.keys()]); // page units deleted whole, and what went with them: those the file has are put back
    const madeIn = new Map(); // page unit made by this commit -> the page unit the file has it in (null: the page)
    const parents = new Map(); // page unit -> the file's id of the unit the file has it in (null: none)
    const strays = new Map(); // page unit id -> the units that went with it, standing elsewhere on the page
    const arounds = new Map(); // page unit put back around its blocks -> its source (dropped's `around`)
    // The keys the commit made blocks under (pending.made), by element: the answer gives the hash of each
    // it holds as the page sent it.
    const madeKeys = new Map([...pending.made].map(([key, element]) => [element, key]));
    for (const [id, fact] of Object.entries(facts)) {
      const element = elements.get(id);
      if (!element) continue;
      let unit = idOf(element);
      if (unit !== null && skip.has(unit)) {
        // Of what its component wrote, the parts that went in are the file's, the rest held.
        if (wrote.has(unit)) map.units[unit].parts = { ...map.units[unit].parts, ...Object.fromEntries(Object.keys(wrote.get(unit)).filter((name) => fact.parts?.[name]).map((name) => [name, fact.parts[name]])) };
        continue;
      }
      const fresh = unit === null;
      if (fresh) {
        // Put back around its blocks, it is the unit it was; else a new one.
        const was = dropped.get(identity(element));
        unit = was?.around ? was.unit : map.units.length;
        if (!was?.around) {
          const entry = { id: unit, kind: fact.kind, parent: null, hash: fact.hash };
          map.units.push(entry);
          units?.set(unit, entry);
        }
        bind(element, "unit", unit);
        if (was?.around) arounds.set(unit, was.around);
        if (stood.has(was?.unit)) stood.set(unit, stood.get(was.unit)); // whichever unit it comes back as
        // Back under the id it had (proposedId): one unit of the map has an id, the file naming units by it.
        if (was?.unit !== unit && map.units[was?.unit]?.blockId === id) map.units[was.unit].blockId = undefined;
      }
      if (fresh || converted.has(unit)) made.add(unit);
      // Written whole, from its template, what was copied or the source it went with: what its component
      // writes is what the file says it holds, whatever the page shows (that goes with the next commit).
      if (fact.markup !== undefined && (made.has(unit) || gone.has(unit))) data.set(unit, pageOfKind(fact.kind)?.dataIn?.(fact.markup) ?? null);
      // Its hash is the file's where nobody else wrote, or where the file holds it as this commit wrote it:
      // put back from its source, converted whole, or made, the answer giving the hash of what it made
      // (none of one made around a unit someone else changed, or copied from one: their change is in it).
      // A unit retagged, or whose table's rows and cells changed, holds the rest as the file had it: as for
      // any other, its hash is the one the answer gave (`hashes`) or the one the page saw, and one made
      // holding someone else's change has none the page saw (null). Someone else's change of it stays
      // theirs: deleting, converting or writing it asks first. So do the hashes of the parts its component
      // writes, but those this commit wrote or made, the file's now.
      const own = alone || gone.has(unit) || (converted.has(unit) ? Boolean(converted.get(unit).replace) : fresh && Object.hasOwn(given, madeKeys.get(element) ?? ""));
      const hash = own ? fact.hash : fresh ? null : map.units[unit].hash;
      const shell = own ? fact.shell : fresh ? null : map.units[unit].shell; // what it is besides its words (the pull's), as its hash
      const parts = own || fresh ? fact.parts : { ...map.units[unit].parts, ...Object.fromEntries(Object.keys(wrote.get(unit) ?? {}).filter((name) => fact.parts?.[name]).map((name) => [name, fact.parts[name]])) };
      Object.assign(map.units[unit], { kind: fact.kind, hash, shell, parts, blockId: id, keep: fact.keep ?? undefined, grid: fact.grid || undefined });
      // Put back (undo): its text blocks, as the file gave them when it went, are its own again.
      for (const [block, source, baseline] of removed.get(unit)?.blocks ?? []) {
        if (source !== undefined) sources.set(block, source);
        if (baseline !== undefined) baselines.set(block, baseline);
      }
      removed.delete(unit);
      for (const [other, owner] of removedWith) {
        if (owner !== unit) continue;
        removedWith.delete(other);
        const stray = unitElement(other);
        if (stray && !element.contains(stray)) strays.set(unit, [...(strays.get(unit) ?? []), stray]);
      }
      adopted.set(id, [unit, element]);
    }
    for (const [id, [unit, element]] of adopted) {
      const fact = facts[id];
      const parent = fact.parent ? adopted.get(fact.parent)?.[0] : undefined;
      if (fact.parent === null) map.units[unit].parent = null;
      else if (parent !== undefined) map.units[unit].parent = parent;
      // Made by this commit: where the file has it is what the commit wrote, whoever else wrote.
      const owner = fact.parent === null ? null : (parent ?? map.units.find((other) => other.blockId === fact.parent)?.id);
      if (made.has(unit) && owner !== undefined) madeIn.set(unit, owner);
      parents.set(unit, fact.parent);
      // Its boxes, with the units in each: by id, or by hash for those the file gives none (units
      // the commit did not change), matched in order with the page's units of that box.
      for (const box of fact.boxes) {
        const node = boxElement(element, box);
        if (!node) continue;
        const fresh = boxOf(node) === null; // joins the map now: it holds only what the commit put there
        if (fresh) registerBox(node, box.kind, box.key);
        if (alone || fresh) orders.set(boxOf(node), orderOf(node, box.units, adopted, strays.get(unit)));
      }
      // Its text blocks, with the file's texts. Of a unit it converted, one that stays (a table's cell, a
      // list's item retagged) holds what the file held, someone else's words too, which are no `before`
      // of the page's (its words would go over theirs): it keeps the one the page had, but where nobody else wrote.
      const matched = new Set();
      const inOrder = inFileOrder(element, fact.blocks);
      const find = pathIndex(element);
      for (const [index, block] of fact.blocks.entries()) {
        const host = blockElement(element, block, find) ?? inOrder?.[index];
        if (!host) continue;
        const fresh = blockOf(host) === null;
        const own = registerBlock(host, pending, block, unit);
        matched.add(own);
        const taken = alone || fresh || written.has(own) || (made.has(unit) && !converted.has(unit));
        if (!issues.has(issueKey("text", own)) && taken) sources.set(own, block.inner);
      }
      // What the page made a text block of a block it made, and the file takes for none: not one, as
      // a load of the page shows it.
      if (made.has(unit)) for (const host of element.querySelectorAll("[data-ge-part]")) if (blockOf(host) === null) pageOfUnit(element)?.notText?.(host);
      // Its text blocks the file no longer has went with it: off the page, or the text of what it
      // was before this commit converted it.
      for (const block of map.blocks) {
        if (block.unit !== unit || block.gone || matched.has(block.id) || (hostOf(block.id) && !converted.has(unit))) continue;
        block.gone = true;
        sources.delete(block.id);
        baselines.delete(block.id);
        unbind("block", block.id);
      }
    }
    return { orders, madeIn, made, parents, arounds };
  }

  // The page's units of box `node` in the order the file has them (`units`: the file's units of
  // the box, by id, or { hash } for those without, matched in order with the page's units of that
  // box that have none). `adopted`: id -> [page unit id, element], the units just taken in;
  // `elsewhere`: page units of that box standing elsewhere on the page (taken out of a unit put back).
  function orderOf(node, units, adopted = new Map(), elsewhere = []) {
    const plain = [...node.children, ...elsewhere].filter((child) => idOf(child) !== null && !map.units[idOf(child)]?.blockId);
    const order = [];
    for (const child of units) {
      if (typeof child === "string") {
        const known = adopted.get(child)?.[0] ?? map.units.find((other) => other.blockId === child)?.id;
        if (known !== undefined) order.push(known);
      } else {
        const at = plain.findIndex((other) => map.units[idOf(other)].hash === child.hash);
        if (at >= 0) order.push(idOf(plain.splice(0, at + 1).at(-1)));
      }
    }
    return order;
  }

  /**
   * Take in what the file says of the keyed blocks (detail cards) a commit made (the answer's
   * `keyed`: by id, the units of its content). A keyed block is no unit: the file knows it by its id.
   * It becomes one of the file, as the page shows one it opened with: its content a box of the map
   * (the units the commit wrote in it already taken in by adopt; a block made in it later goes in as
   * a new block of that box). Nothing of it is made again. Its making undone, it stays in the file
   * with nothing opening it (as one whose entry the reader took out), and redone the page shows the
   * file's again. Adds the box's order to `orders`.
   */
  function adoptKeyed(facts, pending, orders) {
    for (const [key, card] of Object.entries(facts ?? {})) {
      // The block made on the page the file knows by that id (of a type that is `keyed`).
      const block = [...pending.made.values()].find((element) => element?.id === key && keyedBlock(element));
      if (!block || keyedIds.has(identityOf(block))) continue;
      const spec = BLOCK_TYPES[blockTypeOf(block)];
      const content = spec.content?.(block) ?? block;
      if (content && boxOf(content) === null) orders.set(registerBox(content, spec.box), orderOf(content, card.units));
      keyedIds.add(identityOf(block));
      keyedBlocks.set(key, block); // see keyedAway
    }
  }

  // Whether what the file gave of a deleted unit is all of it: not `around`, its blocks gone elsewhere,
  // and not nothing, the file having had it no more.
  const deletedWhole = (source) => Boolean(source?.source && source.seal && !source.around);
  const elementDeleted = (id, pending) => unitElement(id) ?? pending.snapshot.units.find((node) => idOf(node) === id) ?? getLayout()?.elements.get(id) ?? null;
  // The units a deleted one took with it (`source`: what the file gave of it): itself, and those inside
  // it or in a box it takes along (a Sheet tab, its panel) that were not on the page when the commit
  // was built (the others went elsewhere: a merged section's blocks). One deleted by itself, by an
  // earlier commit or by this one, is none of them, nor is what it holds: it comes back from its own
  // source. Of one deleted whole, what this commit deleted in it is among them: that source holds it.
  const deletedWith = (id, source, pending) => {
    // Those the commit moved are elsewhere, on the page or waiting off it (`along`).
    const present = new Set([...pending.snapshot.units.map(idOf), ...[...pending.units.values()].filter((sent) => sent.change?.move).map((sent) => sent.id)].filter((unit) => unit !== null));
    const itself = new Set(deletedWhole(source) ? [] : [...pending.units.values()].filter((sent) => sent.change?.remove).map((sent) => sent.id));
    const element = elementDeleted(id, pending);
    const apart = (unit) => present.has(unit) || itself.has(unit) || removed.has(unit) || removedWith.has(unit);
    const along = new Set(map.boxes.filter((box) => box.unit === map.units[id]?.parent && takesBox(element, box)).flatMap((box) => getLayout()?.orders.get(box.id) ?? []));
    const within = (unit) => {
      for (const at of chain(unit)) {
        if (at === id) return true;
        if (apart(at)) return false;
        if (along.has(at)) return true;
      }
      return false;
    };
    return new Set([id, ...map.units.map((unit) => unit.id).filter(within)]);
  };
  // The units inside a deleted one that the page showed elsewhere when the commit was built but the
  // commit placed nowhere (no move takes them, nor a block made on the page holding them: they
  // stand in a container not written yet, a new row of columns one of whose columns is still
  // empty). The file deleted them with it all the same.
  const leftBehind = (id, pending) => {
    const placed = new Set();
    const visit = (node) => {
      if (node?.unit && typeof node.unit === "object") placed.add(node.unit.key);
      for (const child of node?.children ?? []) visit(child);
    };
    for (const sent of pending.units.values()) {
      if (sent.change?.move) placed.add(sent.id);
      if (sent.insert) visit(sent.node);
    }
    for (const unit of pending.restores.values()) placed.add(unit); // put back by the same commit, from its own source
    const present = new Set(pending.snapshot.units.map(idOf).filter((unit) => unit !== null));
    const away = (unit) => {
      for (const at of chain(unit.id)) {
        if (at === id) break;
        if (placed.has(at)) return false;
      }
      return true;
    };
    return map.units.filter((unit) => present.has(unit.id) && isInside(unit, id) && away(unit)).map((unit) => unit.id);
  };
  // A unit the file dropped while the page may still show it: its element (whichever stands for it)
  // is made on the page from now on, and so are its text blocks and boxes (sync-state.mjs asMade).
  const drop = (id) => {
    if (!map.units[id]) return;
    unbind("unit", id, true);
    for (const block of map.blocks) {
      if (block.unit !== id || block.gone) continue;
      block.gone = true;
      sources.delete(block.id);
      baselines.delete(block.id);
      unbind("block", block.id, true);
    }
    for (const box of map.boxes) if (box.unit === id) unbind("box", box.id, true);
  };
  // A text block the file dropped (emptied), likewise.
  const dropBlock = (id) => {
    if (!map.blocks[id]) return;
    map.blocks[id].gone = true;
    unbind("block", id, true);
  };
  // A unit deleted by a commit. Its text blocks leave the commits (they went with it); deleted
  // whole, it keeps the source the file gave, for undo: whatever stands for it on the page (undo put
  // it back while the commit was on its way, or later) is that unit put back, and the next commit
  // writes its source again. Else (`around`, its blocks went elsewhere; or the file had it no more)
  // it and what went with it are made on the page from now on: a container whose blocks went
  // elsewhere comes back holding them, around them from that source when they stand straight in it.
  const registerRemoved = (id, source, pending) => {
    // What it took along that the page still shows elsewhere is made on the page from now on (it is
    // written anew once it stands where the file can have it).
    for (const unit of leftBehind(id, pending)) drop(unit);
    const element = elementDeleted(id, pending);
    const gone = deletedWith(id, source, pending);
    const blocks = map.blocks.filter((block) => gone.has(block.unit) && !block.gone).map((block) => [block.id, sources.get(block.id), baselines.get(block.id)]);
    for (const [block] of blocks) {
      sources.delete(block);
      baselines.delete(block);
    }
    if (deletedWhole(source)) {
      // The types it and what went with it showed as, and their looks and tables' rows and cells as the
      // layout had them: what its source puts back.
      const types = new Map([...gone].map((unit) => [unit, getLayout()?.types?.get(unit)]));
      const looks = new Map([...gone].map((unit) => [unit, Object.fromEntries(LOOKS.map((part) => [part, getLayout()?.[part]?.get(unit)]))]));
      removed.set(id, { source: source.source, seal: source.seal, type: types.get(id), types, looks, blocks, element });
      for (const unit of gone) if (unit !== id) removedWith.set(unit, id);
      return;
    }
    for (const unit of gone) drop(unit);
    const was = dropped.get(map.units[id]?.cid);
    const type = element && containerTypeOf(element);
    if (was && source?.around && source.seal && holdsStraight(BLOCK_TYPES[type])) was.around = { source: source.source, seal: source.seal, type };
  };
  // The units a commit deleted (`deletions`: unit id -> what the file gave of it). One deleted in a unit
  // deleted whole is no deletion of its own, however the page took it out (a selection across blocks
  // empties a list item by item): it went with that unit, and comes back with it.
  const registerDeletions = (deletions, pending) => {
    const taken = new Set();
    for (const [id, source] of deletions) {
      if (!deletedWhole(source)) continue;
      for (const unit of deletedWith(id, source, pending)) if (unit !== id) taken.add(unit);
    }
    for (const [id, source] of deletions) if (!taken.has(id)) registerRemoved(id, source, pending);
  };

  // The text the file has of a text block outside any unit (the answer's `outside`, by key: the
  // report title's "title", else the element's id; shared/ids.mjs outsideKey), or undefined.
  const outsideText = (id, outside) => {
    const block = map.blocks[id];
    if (!block || (block.unit !== null && block.unit !== undefined)) return undefined;
    const key = outsideKey(block.kind === "title", hostOf(id)?.id);
    return key ? outside?.[key] : undefined;
  };

  /**
   * Take in the answer to a commit (build's `pending`, the endpoint's receipt; `alone`: nobody but
   * this page wrote the file since it showed it, see adopt). Returns { conflicts, merged: hosts now
   * showing a merge, stale: a merge the page could not show, outdated: it runs a manifest that is no
   * more, forced: the page units a change the reader said to make anyway went in for, all it held,
   * rekeyed: the keys of tables it set otherwise on the page, [element, name, old, new | null] }.
   * A conflict of a change sent as the reader said to make it anyway says so (`again`).
   */
  function apply(pending, receipt, { alone = true } = {}) {
    touched(); // the baselines, the layout and the table change: collect() anew
    // Asked once: a unit the file could not name (gone meanwhile) is not asked for again and again.
    for (const id of pending.named ?? []) naming.delete(id);
    marks();
    const conflicts = [];
    const merged = [];
    let stale = false;
    let shownAgain = false; // what a component wrote went by a manifest that is no more
    const written = new Set(); // text blocks the commit wrote
    // The page's elements the commit was built from, by page unit id (on the page or not by now).
    const built = new Map(pending.snapshot.units.filter((node) => idOf(node) !== null).map((node) => [idOf(node), node]));
    const elementOf = (id) => built.get(id) ?? unitElement(id) ?? getLayout()?.elements.get(id) ?? null;
    // The ids the file gives: to units the page named, and to the blocks it made or put back (the
    // one the page proposed, or another when the file has that one already).
    for (const [key, id] of Object.entries(receipt.ids ?? {})) if (map.units[Number(key)]) map.units[Number(key)].blockId = id;
    for (const [key, id] of Object.entries(receipt.made ?? {})) {
      const element = pending.made.get(key);
      if (element && idOf(element) !== null) map.units[idOf(element)].blockId = id; // put back
      else if (element) proposals.set(identityOf(element), id);
    }
    for (const [key, hash] of Object.entries(receipt.hashes ?? {})) if (map.units[Number(key)]) map.units[Number(key)].hash = hash;
    for (const [key, shell] of Object.entries(receipt.shells ?? {})) if (map.units[Number(key)]) map.units[Number(key)].shell = shell;
    // What the document is besides its units, as the file has it now: the page's own write over what it showed.
    if (alone && typeof receipt.frame === "string") map.frame = receipt.frame;
    // The keys of tables the file gave the blocks the commit made and the tables it keyed (a view
    // made from a menu: the key its frame took, an attribute of the unit), other than the page chose
    // (source/chart-keys.mjs: one the file had meanwhile): theirs on the page too, so that each card and
    // view reads the table the file links it to ({ old: new | null }, null: off a table); `rekeyed` says
    // which it changed ([element, name, old, new | null]), for the undo steps that recorded them (history.mjs).
    const rekeyed = [];
    if (receipt.chartKeys) {
      const keyed = [...pending.units.values()].filter(({ change }) => change?.attribute === CHART_SOURCE).map(({ id }) => unitElement(id)).filter(Boolean);
      for (const element of [...pending.made.values(), ...keyed]) {
        // A copy not written yet sends its keys again: the file's now.
        const sent = element?.getAttribute(COPY_KEYS);
        if (sent) {
          const keys = Object.fromEntries(Object.entries(JSON.parse(sent)).map(([from, to]) => [from, to !== null && Object.hasOwn(receipt.chartKeys, to) ? receipt.chartKeys[to] : to]));
          element.setAttribute(COPY_KEYS, JSON.stringify(keys));
        }
        const names = [CHART_SOURCE, ...TABLE_READERS];
        for (const node of element ? [element, ...element.querySelectorAll(names.map((name) => `[${name}]`).join(", "))] : []) {
          for (const name of names) {
            const key = node.getAttribute(name);
            if (key === null || !Object.hasOwn(receipt.chartKeys, key)) continue;
            const next = receipt.chartKeys[key];
            if (typeof next === "string") node.setAttribute(name, next);
            else if (next === null && name === CHART_SOURCE) node.removeAttribute(name);
            else continue;
            rekeyed.push([node, name, key, next]);
          }
        }
      }
    }

    for (const entry of receipt.texts ?? []) {
      const sent = pending.texts.get(entry.key);
      if (!sent) continue;
      if (entry.status === "conflict") {
        // What the reader wrote there: the block's text and the blocks split off it (they go with it).
        const conflict = { ...entry, kind: "text", block: sent.id, mine: sent.parts.map((part) => part.html).filter(Boolean).join("\n") || null };
        issues.set(entry.key, conflict);
        conflicts.push(conflict);
        continue;
      }
      keptOver.delete(sent.id); // gone in: the file's words from now on
      const kept = sent.parts.find((part) => part.keep);
      if (!kept) {
        sources.delete(sent.id);
        baselines.delete(sent.id);
        // Emptied (the file dropped it, whatever blocks split off it went in): what stands for it
        // on the page is a new block from now on, the block itself or what it became meanwhile (an
        // empty last item turned into a paragraph after its list, say).
        const block = map.blocks[sent.id];
        if (block?.self) drop(block.unit);
        else dropBlock(sent.id);
        continue;
      }
      const host = hostOf(sent.id);
      // What the file has now (its own text, below, for a block of a unit; the answer's `outside`
      // for one outside any unit), until then what went in.
      sources.set(sent.id, outsideText(sent.id, receipt.outside) ?? (entry.status === "merged" ? entry.html : kept.html));
      if (entry.status === "merged" && !(host && serializeInner(host) === kept.html && !host.querySelector("[data-ge-atom]"))) {
        // Someone else's words went in too, and the block is not as it was sent (or holds a formula): the
        // next commit merges again, from what the page sent, which stays its `before` (a commit of the
        // block from the file's text, theirs in it, would write theirs out). So it is none the commit wrote.
        sources.set(sent.id, kept.html);
        baselines.set(sent.id, kept.html);
        stale = true;
      } else if (entry.status === "merged") {
        // Shown, the block as it was sent.
        const caret = caretKept(host);
        setOwnHTML(host, entry.html);
        caret();
        baselines.set(sent.id, serializeInner(host));
        merged.push(host);
        written.add(sent.id);
      } else {
        baselines.set(sent.id, kept.html);
        written.add(sent.id);
      }
      committedText(entry.key, sent);
    }

    const skip = new Set(); // page units whose operation the file refused: they keep what the page knew
    const again = new Set(); // of those, the ones it goes again for (its place gone, tried once more)
    const converted = new Map(); // page units the commit turned into another type -> that change
    const landed = new Set(); // page units the change the reader said to make anyway went in for, all of it
    const movedFrom = new Map(); // page units the commit moved -> the file's id of the unit they were in
    const deletions = new Map(); // page units the commit deleted -> what the file gave of each
    const wrote = new Map(); // page units whose component's parts the commit wrote -> those parts, as sent
    const went = new Map(); // page units -> what of the layout the changes of them that went in are about (layoutOf)
    const fileParent = (id) => {
      const parent = map.units[id]?.parent;
      return parent === null || parent === undefined ? null : map.units[parent]?.blockId ?? "";
    };
    for (const entry of receipt.units ?? []) {
      const sent = pending.units.get(entry.key);
      if (!sent) continue;
      if (entry.status === "conflict") {
        // A block made on the page that is not on it any more (turned into another meanwhile, as an
        // empty paragraph "- " made a list of, sent while offline): nothing to hold; what stands for
        // it now goes with the next commit, and is held itself if it has no place either. Nor is the place
        // of a unit that waits, sent with the blocks around it (`along`): it waits as it did.
        if ((sent.insert && sent.element && !sent.element.isConnected) || sent.along) continue;
        // The page runs an old manifest of its package: nothing for the reader to decide. It is given
        // up and that alone: what else of the unit went in is taken in as any unit's, what waits goes its
        // way, and the page shown again runs the manifest there is.
        if (entry.reason === "definition") {
          unwritten.add(sent.id);
          shownAgain = true;
          continue;
        }
        // Its place is gone: the end of its box, once, before it is the reader's to decide.
        if (entry.reason === "position" && sent.insert && !elsewhere.has(identity(sent.element)) && endOf(sent.element)) {
          elsewhere.add(identityOf(sent.element));
          continue;
        }
        if (entry.reason === "position" && sent.change?.move && !movedElsewhere.has(sent.id) && endOf(unitElement(sent.id))) {
          movedElsewhere.add(sent.id);
          again.add(sent.id);
          skip.add(sent.id);
          continue;
        }
        // Deleted, with blocks in it that go elsewhere and had no place (their neighbour gone): with
        // them, once they go to the end of their box.
        if (entry.reason === "position" && sent.change?.remove && !removedElsewhere.has(sent.id)) {
          removedElsewhere.add(sent.id);
          again.add(sent.id);
          skip.add(sent.id);
          continue;
        }
        // Of what its component wrote, the parts someone else left alone went in all the same (`wrote`):
        // those are the file's, and the rest is the change held.
        let change = sent.change;
        if (change?.source && Array.isArray(entry.wrote)) {
          const [went, waits] = [true, false].map((goes) => Object.fromEntries(Object.entries(change.source).filter(([name]) => entry.wrote.includes(name) === goes)));
          wrote.set(sent.id, went);
          change = { ...change, source: waits };
        }
        // Held by the key it keeps until the reader decides: a block made on the page by the id it
        // proposes, with what it holds (the reader's words, to copy and for the crash buffer).
        const key = sent.insert ? issueKey("insert", (sent.element && proposals.get(identity(sent.element))) || sent.node?.blockId || sent.element?.id || serial++) : issueKey("unit", sent.id);
        // A write of other parts refused where one is held already: one conflict of the instance, holding both.
        const before = issues.get(key);
        if (change?.source && before?.change?.source) change = { ...change, source: { ...before.change.source, ...change.source } };
        const kept = change?.source && before?.change?.source ? { theirs: { ...before.theirs, ...entry.theirs }, parts: { ...before.parts, ...entry.parts } } : {};
        // Sent as the reader said to make it anyway, it was written again since they were shown it (`again`).
        const conflict = sent.insert ? { ...entry, key, kind: "insert", element: sent.element, mine: nodeHTML(sent.node) || null } : { ...entry, ...kept, key, kind: "unit", unit: sent.id, change, mine: writtenHTML(change), ...(sent.forced ? { again: true } : {}) };
        issues.set(key, conflict);
        if (sent.insert && sent.element) refused.set(identityOf(sent.element), key);
        else skip.add(sent.id);
        conflicts.push(conflict);
        continue;
      }
      // Moved: from the unit it was in (the file's id of it), for the revert check.
      if (sent.change?.move) movedFrom.set(sent.id, fileParent(sent.id));
      if (sent.change?.replace || sent.change?.retag || sent.change?.table) converted.set(sent.id, sent.change);
      if (sent.change?.source) wrote.set(sent.id, sent.change.source);
      if (!sent.insert) went.set(sent.id, new Set([...(went.get(sent.id) ?? []), ...layoutOf(sent.change)]));
      // The reader's word is for the change it was given for, gone in once all it held has: what they do to
      // the unit next is held to what the page saw, as any change is.
      const word = sent.forced ? forced.get(sent.id) : null;
      if (word?.parts) word.parts = word.parts.filter((name) => !Object.hasOwn(sent.change.source, name));
      if (word && !word.parts?.length) {
        forced.delete(sent.id);
        landed.add(sent.id);
      }
      // A table's rows made on the page are the file's now (its cells are adopted as text blocks).
      if (sent.change?.table) elementOf(sent.id)?.querySelectorAll("tr[data-ge-new]").forEach((row) => row.removeAttribute("data-ge-new"));
      else if (sent.change?.remove) deletions.set(sent.id, receipt.removed?.[entry.key]);
    }
    registerDeletions(deletions, pending);
    for (const unit of heldUnits(issues.keys())) skip.add(unit);
    // Units the file no longer has though this commit did not delete them (a list goes with its last
    // item): taken as deleted (no source to put back), so what stands for them on the page, if
    // anything, is made anew.
    const deleted = new Set([...pending.units.values()].filter((sent) => sent.change?.remove).map((sent) => sent.id));
    for (const id of receipt.gone ?? []) {
      const unit = map.units.find((entry) => entry.blockId === id);
      if (!unit || deleted.has(unit.id) || skip.has(unit.id)) continue;
      registerRemoved(unit.id, null, pending);
    }

    // Units know the unit they are in (the chain a later commit touches), as committed: those the
    // file refused to move, or held unmoved, are in the one the file has them in still (adopt gives
    // the others the file's own).
    for (const [box, children] of pending.snapshot.boxes) {
      const owner = unitAround(box);
      for (const child of children) {
        const id = idOf(child);
        if (id !== null && map.units[id] && (!skip.has(id) || went.get(id)?.has("place"))) map.units[id].parent = owner;
      }
    }
    // What the file says of the units the commit named or made: those elements by the id they carry
    // (the commit's own, then any other the page has).
    const elements = new Map();
    const note = (node, id = fileIdOf(node)) => {
      if (node && id && !elements.has(id)) elements.set(id, node);
    };
    pending.snapshot.units.forEach((node) => note(node));
    pending.made.forEach((node) => note(node));
    for (const unit of map.units) if (unit.blockId) note(elementOf(unit.id), unit.blockId);
    // Units put back show as what was put back: the source they had, of the type they had then
    // (an element standing for one turned into another type since converts it next).
    const restoredTypes = new Map([...pending.restores.values()].filter((id) => removed.has(id)).flatMap((id) => [...(removed.get(id).types ?? new Map([[id, removed.get(id).type]]))]));
    // Their looks and tables' rows and cells too, as the layout had them when they went: what changed on
    // the page since (put back, then resized or a column taken out) goes with the next commit.
    const restoredLooks = [...pending.restores.values()].filter((id) => removed.has(id)).flatMap((id) => [...(removed.get(id).looks ?? [])]);
    // What the file holds of what components write: what the last commit left, with the parts this one
    // wrote, and of the units it wrote whole what the file says (adopt). A write it did not carry still
    // differs from that, and goes with the next.
    const previous = getLayout();
    const data = new Map([...(previous?.data ?? [])].map(([id, held]) => [id, wrote.has(id) ? { ...held, ...wrote.get(id) } : held]));
    const { orders, madeIn, made, parents, arounds } = adopt(receipt.file ?? {}, elements, skip, converted, pending, written, alone, data, wrote, receipt.hashes ?? {});
    for (const [unit, parent] of parents) {
      if (made.has(unit)) placed.set(unit, { parent, ...(arounds.has(unit) ? { around: arounds.get(unit) } : {}) });
      else if (movedFrom.has(unit)) placed.set(unit, { parent, from: placed.get(unit)?.from ?? movedFrom.get(unit) });
      else if (placed.has(unit)) placed.set(unit, { ...placed.get(unit), parent }); // taken along by a block made or put back
    }
    // What its component wrote that went in, for the revert check: each part by the hash the commit said the
    // file held of it, and the one the file gives it now.
    for (const sent of pending.units.values()) {
      if (sent.change?.source) for (const name of Object.keys(wrote.get(sent.id) ?? {})) noteWrite(sent.id, name, sent.parts?.[name], map.units[sent.id]?.parts?.[name]);
    }
    adoptKeyed(receipt.keyed, pending, orders);
    // What is held back or goes again stays to be done: those units keep, in the next layout, all they had
    // in the last, so that what waits still shows against it, and so does whatever else of them the reader
    // did since, which no commit sends while they are held (a move, a look, a column taken out): a move the
    // file did not make is no move made. What of them went in with this commit is the file's, taken from
    // what it left (`went`: a table's operation that went in beside a move refused for its place, kept as it
    // was, would be sent again, against a table it no longer names).
    // A unit deleted and not put back (its putting back refused, say) is none the file has.
    const present = (node) => {
      const id = idOf(node);
      return id === null || removed.has(id) ? null : id;
    };
    const next = captureLayout(root, map, pending.snapshot, { unitOf: present, boxOf, typeOf: ownTypeOf, data });
    for (const [id, type] of restoredTypes) if (type !== undefined && next.elements.has(id) && !removed.has(id)) next.types.set(id, type);
    for (const [id, look] of restoredLooks) {
      if (!next.elements.has(id) || removed.has(id)) continue;
      for (const part of LOOKS) if (look[part] !== undefined) next[part].set(id, look[part]);
    }
    // A unit is in the one box the file has it in.
    for (const [box, order] of orders) {
      next.orders.set(box, order);
      for (const [other, list] of next.orders) if (other !== box && list.some((id) => order.includes(id))) next.orders.set(other, list.filter((id) => !order.includes(id)));
    }
    // A block this commit made is in the unit the file has it in: where the page shows it in another
    // (the commit wrote it next to a block that had not moved where the page moved it), the next
    // commit moves it there.
    for (const [unit, owner] of madeIn) {
      for (const [box, list] of next.orders) if (list.includes(unit) && (map.boxes[box]?.unit ?? null) !== owner) next.orders.set(box, list.filter((id) => id !== unit));
    }
    // A unit put back that the page no longer shows (the blocks it held taken out of it): known to
    // the next commit, which takes it away again.
    for (const [key, element] of pending.made) {
      const id = pending.restores.has(key) ? idOf(element) : null;
      if (id !== null && !element.isConnected) {
        next.elements.set(id, element);
        next.types.set(id, ownTypeOf(element));
      }
    }
    // One the file deleted, and the page has not put back, waits for nothing (`present`): what was given up of
    // it stays given up should it come back.
    const waiting = new Set([...heldUnits(discarded.keys()), ...[...issues.values()].filter((entry) => entry.kind === "unit").map((entry) => entry.unit), ...again].filter((id) => !removed.has(id)));
    for (const id of previous ? waiting : []) {
      const done = went.get(id) ?? new Set();
      for (const part of ["elements", "types", ...LOOKS]) if (!done.has(part) && previous[part]?.has(id)) next[part].set(id, previous[part].get(id));
      // What its component writes is none of them: it is what the commits say the file holds (`data`), which
      // holds what went in and not what waits, kept for it off the page too.
      if (!next.data.has(id) && data.has(id)) next.data.set(id, data.get(id));
      // Where the page shows it in its place among the units around it (no move of it: `moves`), the file has it
      // there too, whatever this commit moved around it.
      if (done.has("place") || (pending.moves && !pending.moves.has(id) && [...next.orders.values()].some((order) => order.includes(id)))) continue;
      // Its own place only, where the page shows it moved and no commit sends that, or not at all: out of the
      // boxes it was not in, and back after the unit that stood before it that this commit left where it was
      // (one it moved stands elsewhere in the file). The others' places are as this commit left them (taking
      // back a whole box undid their moves too, and sent them again, without end).
      for (const [box, order] of next.orders) if (order.includes(id) && !previous.orders.get(box)?.includes(id)) next.orders.set(box, order.filter((other) => other !== id));
      for (const [box, before] of previous.orders) {
        if (!before.includes(id)) continue;
        const order = (next.orders.get(box) ?? []).filter((other) => other !== id);
        const after = before.slice(0, before.indexOf(id)).reverse().find((other) => order.includes(other) && !went.get(other)?.has("place"));
        order.splice(after === undefined ? 0 : order.indexOf(after) + 1, 0, id);
        next.orders.set(box, order);
      }
    }
    setLayout(next);
    marks();
    return { conflicts, merged, stale, outdated: shownAgain, forced: [...landed], rekeyed };
  }

  // A text committed: what it replaced (the first time this page committed it), what it is now, and what
  // the commits of it between left it as (`earlier`, the newest TEXTS_KEPT): someone writing back what
  // they read then puts back what the page committed after. Back as it was first, it is asked of what it
  // was between, as a part of what a component writes is (noteWrite): an undo is a commit like any other.
  // `at`: when it was last committed, which puts the journals of two tabs' pages in order (autosave.mjs).
  function committedText(key, sent) {
    const mine = sources.get(sent.id);
    const was = journal.get(key);
    const original = was?.original ?? sent.before;
    if (mine === undefined) return void journal.delete(key);
    const earlier = [...new Set([...(was?.earlier ?? []), ...(was ? [was.mine] : [])])].filter((text) => text !== mine && text !== original).slice(-TEXTS_KEPT);
    if (mine === original && earlier.length === 0) return void journal.delete(key);
    journal.set(key, { key, block: blockRef(sent.id), original, mine, ...(earlier.length > 0 ? { earlier } : {}), at: Date.now() });
  }

  // A part of what a unit's component writes, written by a commit (`before`, `after`: the hashes the file
  // had of it then and has now), for the revert check: every hash it had in the file as the page wrote it
  // (before each of its writes, and as each left it), the newest WRITES_KEPT, but the one it has now
  // (undone, or written so), and that one. A commit that leaves it as the file held it (`before` is
  // `after`: written over what someone else wrote, as the reader said to) settles it there all the same.
  function noteWrite(unit, name, before, after) {
    if (typeof before !== "string" || typeof after !== "string") return;
    const entry = writes.get(unit) ?? { parts: {} };
    const was = entry.parts[name];
    const passed = [...(was?.before ?? []), ...(was ? [was.after] : []), before].filter((hash) => hash !== after);
    const counting = passed.filter((hash, index) => passed.lastIndexOf(hash) === index).slice(-WRITES_KEPT);
    if (counting.length > 0) entry.parts[name] = { before: counting, after };
    else delete entry.parts[name];
    entry.time = Date.now();
    if (Object.keys(entry.parts).length > 0) writes.set(unit, entry);
    else writes.delete(unit);
  }

  // Parts of what a unit's component wrote that are the file's now (the reader kept the file's, or took
  // it in place of theirs): no longer asked of.
  function unwrite(unit, names) {
    const entry = writes.get(unit);
    for (const name of names) delete entry?.parts[name];
    if (entry && Object.keys(entry.parts).length === 0) writes.delete(unit);
  }

  /**
   * The reader decided on a held conflict (key: an issueKey): "mine" commits
   * the reader's text over the file's (the file's becomes its `before`, what the reader's was written from going
   * along as its `from`: keptOver), "force" deletes, converts or
   * adjusts the unit anyway, by the next commit that carries a change of that kind, over the unit as the
   * card showed it, "discard" gives the change
   * up, that alone (never sent again: the page shows the file's once it reloads; a block made on the page is
   * taken off it; what a component wrote, that write; of a unit the file has no one of, all of it), "forget" drops what the page knew of
   * a block the file no longer has (the reader deleted it too, or made it a new block), "retry" sends
   * a block made on the page again where it stands now (the reader put it elsewhere), and whatever
   * else was held goes with the next commit, should the page ask for it again (undone, then redone).
   */
  function resolve(key, action) {
    touched(); // what is held back, the baselines: collect() and the next commit anew
    const entry = issues.get(key);
    issues.delete(key);
    if (action === "retry" && entry?.element) {
      refused.delete(identity(entry.element));
      elsewhere.delete(identity(entry.element));
      return;
    }
    const { kind, ref: id } = parseIssueKey(key);
    if (kind === "unit" && action !== "force") forced.delete(id); // an earlier word of the reader's, refused again since, is not this one
    // The end of its box was tried before its place's card: a move the reader makes from now on goes where the page
    // has it.
    if (kind === "unit" && entry?.reason === "position") movedElsewhere.delete(id);
    if (action === "mine" && kind === "text" && typeof entry?.theirs === "string") {
      // The words the reader's were written from (keptOver): kept again after the words kept were refused (the
      // file written again meanwhile), the same as the first time.
      keptOver.set(id, { from: keptFrom(id) ?? sources.get(id) ?? "", over: entry.theirs });
      sources.set(id, entry.theirs);
    } else if (action === "force" && kind === "unit") {
      // For the change the card was about, over the unit as it showed it: what someone wrote since asks
      // again. What its component writes goes over each part as the reader was shown it (the refusal's
      // hashes of them), the word lasting until every part it held has gone in.
      const source = entry?.change?.source;
      forced.set(id, { kind: kindOf(entry?.change), ...(typeof entry?.hash === "string" ? { hash: entry.hash } : {}), ...(source ? { parts: Object.keys(source) } : {}) });
      if (entry?.parts && map.units[id]) map.units[id].parts = { ...map.units[id].parts, ...entry.parts };
    } else if (action === "discard") {
      if (kind === "text") keptOver.delete(id);
      discarded.set(key, kind === "unit" ? { kind: kindOf(entry?.change), ...(entry?.change ? { change: entry.change } : {}), reason: entry?.reason, words: holdsWords(entry) } : {});
      // The parts its component wrote are the file's, as the reader chose: what the page wrote of them before
      // is asked of no more.
      if (kind === "unit" && entry?.change?.source) unwrite(id, Object.keys(entry.change.source));
    } else if (action === "forget" && kind === "text") {
      sources.delete(id);
      keptOver.delete(id);
      baselines.delete(id);
      journal.delete(key);
    }
    marks(); // what was given up read-only from now on
  }

  /**
   * The units this load made or moved that the page still shows, as the revert check names them
   * (revertedUnits): [{ key, id, parent, from?, between? }], key the page's unit.
   */
  const placedUnits = () => [...placed].filter(([unit]) => map.units[unit]?.blockId && !removed.has(unit) && !issues.has(issueKey("unit", unit)) && unitElement(unit))
    .map(([unit, { parent, from }]) => ({ key: unit, id: map.units[unit].blockId, parent, ...(from !== undefined ? { from } : {}), ...besideOf(unit) }));

  /**
   * Where unit `unit` stands in its box as the layout has it (the file, as far as the page knows): { between:
   * [before, after], holds? }, on each side the units nearest it first, BESIDE of them at most, each { id, hash }
   * as the page knows it (sideRef), then null where the box's start or end comes within them, and the units
   * the page shows inside it, by id, or by hash where the file gives one none ({ hash }: fileRef; `holds`, none
   * for a block that holds none); {} where the layout places it nowhere. By it the revert check tells a block
   * the writer replaced from one it put back (revertedUnits, replacedHere): a container the reader made around
   * blocks, which a write from an earlier read leaves standing where it stood, is no block replaced; the units
   * beyond the nearest are where the write took that one out with it (a picture in place of two paragraphs).
   */
  function besideOf(unit) {
    const order = getLayout()?.orders.get(layoutBox(unit));
    const at = order ? order.indexOf(unit) : -1;
    if (at < 0) return {};
    const side = (units) => [...units.slice(0, BESIDE).map(sideRef), ...(units.length <= BESIDE ? [null] : [])];
    const holds = unitsWithin(unit).map(fileRef).filter(Boolean);
    return { between: [side(order.slice(0, at).reverse()), side(order.slice(at + 1))], ...(holds.length > 0 ? { holds } : {}) };
  }
  // A unit beside one placed, as the revert check finds it: its id and the hash the page knows of it, as far as
  // it knows them (an id without words is found by the id alone), false where it knows neither.
  const sideRef = (unit) => {
    const known = map.units[unit];
    const ref = { ...(typeof known?.blockId === "string" && known.blockId ? { id: known.blockId } : {}), ...(typeof known?.hash === "string" ? { hash: known.hash } : {}) };
    return Object.keys(ref).length > 0 ? ref : false;
  };
  // A unit as the file knows it: its id, else the hash the page knows of it ({ hash }), else false.
  const fileRef = (unit) => {
    const known = map.units[unit];
    return typeof known?.blockId === "string" && known.blockId ? known.blockId : typeof known?.hash === "string" ? { hash: known.hash } : false;
  };
  /**
   * The units this load deleted whole that the page has not put back, named so (fileRef): a write from an
   * earlier read puts one back where a block the reader made stands now, which is no block replaced
   * (revertedUnits' `taken`).
   */
  const takenOut = () => [...new Set([...removed.keys(), ...removedWith.keys()])].map(fileRef).filter(Boolean);

  /**
   * Someone else's write put back a unit this load made (`gone`) or moved (`moved`), and the reader
   * keeps theirs (`mine`): one it made is a block made on the page again, written anew (around its
   * blocks from the source it was put back with, if it was); one it moved goes where the page has it
   * again. Otherwise it is no longer checked. `within`: the units inside one made that the write took out
   * with it (the revert check's, heldWithin), decided with it.
   */
  function putBack(unit, { gone, mine, within = [] }) {
    const { around } = placed.get(unit) ?? {};
    // What the write took out with it: kept or given up with it, made on the page again inside it (the
    // blocks of an instance's slots, of a disclosure made this load). What it holds that the file still
    // has (a block moved in, kept where the Agent unwrapped it) stays the file's, a unit the commit
    // making it again takes along, as one it was put back around, and is decided by its own card if any.
    const inner = gone ? within : [];
    for (const id of [unit, ...inner]) placed.delete(id);
    if (!mine) return;
    touched(); // the layout changes in place
    if (gone) {
      const key = map.units[unit].cid;
      drop(unit);
      inner.forEach(drop);
      if (around && dropped.has(key)) dropped.get(key).around = around;
    } else for (const [box, order] of getLayout()?.orders ?? []) getLayout().orders.set(box, order.filter((id) => id !== unit));
    marks();
  }

  // The units the page shows inside unit `unit`'s element, at any depth.
  const unitsWithin = (unit) => [...(unitElement(unit)?.querySelectorAll("[data-ge-unit]") ?? [])].map(idOf).filter((id) => id !== null);

  /** Whether unit `unit` stands inside one of `units` on the page: what someone else's write took out with it is decided with it. */
  const heldWithin = (unit, units) => units.some((other) => other !== unit && unitsWithin(other).includes(unit));

  /** The unit the page shows with file id `id` (not deleted on the page), or null: a block an earlier load made, still there. */
  const unitOf = (id) => {
    const unit = typeof id === "string" ? map.units.findIndex((each, index) => each?.blockId === id && !removed.has(index) && unitElement(index)) : -1;
    return unit < 0 ? null : unit;
  };

  /** The text of the blocks in a unit the page shows (the reader's words), or "". */
  const unitText = (unit) => {
    const element = unitElement(unit);
    return element ? blocksText(element) : "";
  };

  /**
   * What the components of the units the page shows wrote that went in, as the revert check names them
   * (revertedParts): [{ key, id, parts, time }], key the page's unit, id the file's it has now; none of a
   * unit deleted, held for the reader or off the page, while it is.
   */
  const written = () => [...writes].filter(([unit]) => map.units[unit]?.blockId && !removed.has(unit) && !issues.has(issueKey("unit", unit)) && unitElement(unit))
    .map(([unit, { parts, time }]) => ({ key: unit, id: map.units[unit].blockId, parts, time }));

  /**
   * What components wrote in an earlier load of the page (written() as it kept it: [{ id, parts, time }]),
   * asked of as this load's own: each by the unit of the page that has its id. Entries of no such shape
   * are none.
   */
  function carry(entries) {
    for (const entry of Array.isArray(entries) ? entries : []) {
      if (typeof entry?.id !== "string" || !entry.parts || typeof entry.parts !== "object") continue;
      const unit = map.units.findIndex((other) => other.blockId === entry.id);
      if (unit < 0 || writes.has(unit) || !unitElement(unit)) continue;
      const parts = Object.fromEntries(Object.entries(entry.parts).filter(([, part]) => Array.isArray(part?.before) && part.before.every((hash) => typeof hash === "string") && typeof part.after === "string"));
      if (Object.keys(parts).length > 0) writes.set(unit, { parts, time: typeof entry.time === "number" ? entry.time : Date.now() });
    }
  }

  /** What a unit's component holds on the page of the parts named, by name, or null. */
  const dataOfUnit = (unit, names) => {
    const element = unitElement(unit);
    const held = element ? pageOfUnit(element)?.dataOf?.(element) : null;
    return held ? Object.fromEntries(names.filter((name) => typeof held[name] === "string").map((name) => [name, held[name]])) : null;
  };

  /**
   * Of `parts` (by name, a hash of each), those a unit's component holds on the page otherwise than the
   * file's markup of the unit (`markup`) holds them, read as the component reads one (`dataIn`): a part the
   * file spells otherwise than the page writes it, holding what the page shows, put back nothing the reader
   * would lose. All of them where that cannot be told.
   */
  const heldOtherwise = (unit, parts, markup) => {
    const names = Object.keys(parts);
    const held = dataOfUnit(unit, names);
    const file = held && typeof markup === "string" ? pageOfUnit(unitElement(unit))?.dataIn?.(markup) : null;
    return Object.fromEntries(names.filter((name) => typeof held?.[name] !== "string" || typeof file?.[name] !== "string" || held[name] !== file[name]).map((name) => [name, parts[name]]));
  };

  /**
   * Someone else's write put back parts of what a unit's component wrote (`parts`: by name, the hashes the
   * file holds of them), and the reader keeps theirs (`mine`): the next commit writes those parts as the
   * page holds them over what the file holds, asking should it be written again since. Otherwise they are
   * the file's, and no longer asked of.
   */
  function rewrite(unit, parts, mine) {
    if (!mine) return void unwrite(unit, Object.keys(parts));
    if (!map.units[unit]) return;
    touched(); // the layout changes in place
    map.units[unit].parts = { ...map.units[unit].parts, ...parts };
    const data = getLayout()?.data;
    if (data?.has(unit)) data.set(unit, { ...data.get(unit), ...Object.fromEntries(Object.keys(parts).map((name) => [name, null])) });
  }

  /** The texts committed, as the revert check names them (revertedTexts): [{ key, block, original, mine, earlier? }]. */
  // Each named as the page knows it now (a later commit may have given its unit an id, or moved it).
  const committed = () => [...journal.values()].filter((entry) => !issues.has(entry.key) && sources.get(parseIssueKey(entry.key).ref) === entry.mine && map.blocks[parseIssueKey(entry.key).ref])
    .map((entry) => ({ ...entry, block: { ...blockRef(parseIssueKey(entry.key).ref), before: entry.mine } }));

  /** A committed text the reader let someone else put back: no longer checked. */
  const unjournal = (key) => journal.delete(key);

  /**
   * What the page knows, as values and the elements they name: all a page opening once this one is
   * gone needs to take up exactly where it was (createCommits' `restore`), `pending` being the commit
   * whose answer is not known. As JSON: keep().
   */
  const save = (pending) => ({
    map: { version: map.version, frame: map.frame, units: map.units, blocks: map.blocks, boxes: map.boxes },
    openUnits, openHashes, openBlocks,
    baselines, sources, keptOver, issues, refused, removed, removedWith, discarded, unwritten, forced, elsewhere, movedElsewhere, removedElsewhere, journal, writes, placed, keyedBlocks, stood, serial,
    table, dropped, keyedIds, proposals,
    layout: getLayout(),
    pending,
  });

  // The page as it opened: every element the map knows, with its identity; the layout with the
  // type each unit shows as.
  marks();
  const start = getLayout();
  if (start?.types && start.types.size === 0) for (const [id, node] of start.elements) start.types.set(id, ownTypeOf(node));
  if (!restore) {
    for (const [box, order] of start?.orders ?? []) {
      for (const id of order) if (!accepts(map.boxes[box].kind, map.units[id].kind)) stood.set(id, map.boxes[box].kind);
    }
  }
  observer?.observe(root, { subtree: true, childList: true, characterData: true, attributes: true });

  /**
   * The id `element` (a unit of the page, or a block made on it) has in the file, or is to have: the
   * file's, else the one the page proposes for it, which the next commit gives it (a unit of the file
   * without one is named by it, alone when nothing else waits); null for what is no unit.
   */
  function idFor(element) {
    const unit = idOf(element);
    if (unit !== null) {
      if (map.units[unit].blockId) return map.units[unit].blockId;
      if (!naming.has(unit)) touched(); // the next commit names it: there is something to commit
      naming.add(unit);
      return (map.units[unit].proposed ??= randomBlockId());
    }
    return element?.hasAttribute?.("data-ge-new") ? proposedId(element) ?? null : null;
  }

  // ---------- someone else's write, taken in place (pull/) ----------

  /**
   * Blocks an undo or redo took off the page that someone else's words were merged into after it was recorded
   * (history.mjs mergedOff: a paragraph the reader made, the Agent's words pulled into it, the split undone):
   * the units they stood in, which went with them, are ones the page claims to have seen none of the file's of
   * (hash null), so the file refuses their deletion or conversion for someone else's change and the reader is
   * asked (仍然删除, 保留 Agent 的), as on a page that never showed those words. Undo goes on all the same.
   */
  function unseen(hosts) {
    touched();
    for (const host of hosts) {
      for (let at = host; at?.nodeType === 1; at = at.parentElement) {
        const id = idOf(at);
        if (id !== null && map.units[id]) map.units[id].hash = null;
      }
    }
  }

  /**
   * What `collected` (collect()'s) leaves the page holding that the file does not, as the pull asks it
   * (pull/apply.mjs): the text blocks the page shows otherwise than as last committed (`dirty`, by block),
   * whether one of those is in a unit with no id yet (`idless`: its commit names it by its place in the
   * version the page names units by, which a pull changes), how many changes of anything else the next commit
   * carries (`units`: a block made, moved, converted, a look) and how many blocks hold structure their words
   * cannot (`strays`).
   */
  function pendingOf(collected) {
    const blanks = new Set(collected.blank);
    const dirty = new Set(collected.edits.map((edit) => edit.id));
    const idless = [...dirty].some((id) => {
      const unit = map.blocks[id]?.unit;
      return unit !== null && unit !== undefined && !map.units[unit]?.blockId;
    });
    return { dirty, idless, units: collected.units.filter((change) => !skipUnit(change, blanks, false)).length, strays: collected.strays?.length ?? 0 };
  }

  /**
   * What the page knows the file has, as the pull plans against it (pull/plan.mjs planPull's `page`): the
   * version it names its units by, what the document is besides its units (`frame`), the file's units it shows
   * ({ id, kind, blockId, hash, shell }), the boxes it shows and the units in each as it shows them (`orders`, by
   * box: an element's children that are units, as captureLayout reads them), and the text blocks of those units
   * and those outside any with what it knows the file has of each (`source`; `open`, of one outside any unit,
   * its number in that version). Read from the page as it is now, its marks written first.
   */
  function pullView() {
    marks();
    const index = new Map([...root.querySelectorAll(`[${ELEMENT_ID}]`)].map((node) => [node.getAttribute(ELEMENT_ID), node]));
    const elementOf = (field, id) => {
      const key = LISTS[field][id]?.cid;
      return key !== undefined && table.get(key)?.[field] === id ? index.get(key) ?? null : null;
    };
    const present = (id) => Boolean(map.units[id]) && !removed.has(id) && elementOf("unit", id) !== null;
    const units = map.units.filter((unit) => present(unit.id)).map(({ id, kind, blockId, hash, shell }) => ({ id, kind, blockId, hash, shell }));
    const boxes = [];
    const orders = new Map();
    for (const box of map.boxes) {
      const element = elementOf("box", box.id);
      if (!element || (box.unit !== null && box.unit !== undefined && !present(box.unit))) continue;
      boxes.push({ id: box.id, unit: box.unit ?? null, kind: box.kind, key: box.key });
      orders.set(box.id, [...element.children].map(idOf).filter((id) => id !== null && present(id)));
    }
    const outside = (block) => block.unit === null || block.unit === undefined;
    const blocks = map.blocks.filter((block) => !block.gone && (outside(block) ? hostOf(block.id) !== null : present(block.unit)))
      .map((block) => ({ id: block.id, unit: outside(block) ? null : block.unit, ...(block.self ? { self: true } : { path: block.path }), kind: block.kind, source: sources.get(block.id), ...(outside(block) && openBlocks.has(block.id) ? { open: openBlocks.get(block.id) } : {}) }));
    return { version: map.version, frame: map.frame, units, boxes, orders, blocks };
  }

  /** What the page knows the document is besides its units (pullView's `frame`), read at no cost: the pull's first look. */
  const knownFrame = () => map.frame;

  /**
   * Someone else's write taken in where the page stands (pull/apply.mjs), as `plan` (planPull's) has it:
   * `version` the file's now, `frame` what the document is besides its units, `fileUnits` the file's units (its
   * map's), `shown` the text blocks to show with the file's words (planPull's changes: [{ id, theirs }]), `held` those the page
   * does not show them in yet (the reader changed them, a selection runs across them). Each block shown as a
   * load of the page shows it (prepareBlock), the selection in it where it stood among the words (caretKept);
   * what the file has of it its source and its baseline from now on. The page names its units by that version
   * from now on, each by its number there (and its hash there); each takes the file's hash and shell but those
   * holding a block held (the page did not see all of the file's of them: one changed meanwhile asks first, as
   * any change of someone else's), the file's id where the page knew none, its keep, grid and parts; each block its capabilities. Returns { hosts: the blocks
   * shown anew, journal: what the journal held of them (committed: the page's own words, which the file has
   * otherwise now), named as the page names them now }.
   */
  function pulled({ version, frame, plan, fileUnits, fileBoxes = [], fileBlocks = [], fileOrders = new Map(), doc = null, shown, held }) {
    touched(); // the baselines, the sources and the marks change: collect() anew
    // What the page committed in the blocks the write takes out (the file has them no more, or as another kind: a
    // paragraph made a heading), named as the page named them: asked of for the hour as an earlier page's are, as a
    // page shown anew takes them (keepJournal), so that a later write putting one back as it was is a card.
    const journaled = [];
    for (const block of map.blocks) {
      if (block.gone || !plan.removed.has(block.unit)) continue;
      const key = issueKey("text", block.id);
      if (journal.has(key) && sources.get(block.id) === journal.get(key).mine) journaled.push({ ...journal.get(key), block: { ...blockRef(block.id), before: journal.get(key).mine } });
    }
    openUnits.clear();
    openHashes.clear();
    openBlocks.clear();
    // The units first (what may throw: the page is then shown anew from the crash buffer), then the words.
    const { framing, ...moved } = plan.structural ? arrangeAs({ plan, fileUnits, fileBoxes, fileBlocks, fileOrders, doc }) : { removed: [], placed: [] };
    const hosts = [];
    for (const { id: block, theirs: file } of shown) {
      const key = issueKey("text", block);
      if (journal.has(key) && sources.get(block) === journal.get(key).mine) journaled.push({ ...journal.get(key), block: { ...blockRef(block), before: journal.get(key).mine } });
      const host = hostOf(block);
      const caret = caretKept(host);
      // Words the reader gave up for the file's (用文件里的): the file's now, the block theirs to write in again.
      if (discarded.delete(issueKey("text", block)) && host.getAttribute("data-ge-lock") === "given-up") {
        host.removeAttribute("data-ge-lock");
        host.setAttribute("contenteditable", "true");
      }
      let baseline;
      if (HOSTS[file.kind]?.wrapped) { // a Sheet tab's name: its span (prepareBlock made it, as a load does) holds the words
        const template = root.createElement("template");
        template.innerHTML = file.inner;
        host.replaceChildren(template.content);
        baseline = serializeInner(host);
      } else {
        // Formulas and links shown with their icon (atoms): the block's own content as the page is served, its formulas
        // drawn as the kit draws a page's as it loads (DocMath), then rebuilt as a load rebuilds it (the drawings its chips).
        const served = doc?.querySelector(`[data-ge-block="${file.id}"]`);
        if (served && ((file.atoms?.length ?? 0) > 0 || host.querySelector("[data-ge-atom]"))) {
          const own = [...served.childNodes].slice(0, textEnd(served)).map((node) => root.importNode(node, true));
          const lists = nestedBlocks(host);
          [...host.childNodes].slice(0, textEnd(host)).forEach((node) => node.remove());
          if (lists.length > 0) lists[0].before(...own);
          else host.append(...own);
          drawFormulas(host);
        }
        baseline = prepareBlock(host, { inner: file.inner, atoms: file.atoms ?? [], kind: file.kind, caps: file.caps ?? [] });
      }
      caret();
      sources.set(block, file.inner);
      baselines.set(block, baseline);
      Object.assign(map.blocks[block], { inner: file.inner, atoms: file.atoms ?? [] });
      hosts.push(host);
    }
    // What the file says of every block and unit the plan paired, besides words: a block's capabilities (one an
    // element elsewhere refers to now keeps itself), a unit's keep, grid and parts (refers to, the table tools
    // for it, what its component wrote).
    for (const [block, file] of plan.blocks) {
      const caps = file.caps ?? [];
      if (!map.blocks[block] || JSON.stringify(map.blocks[block].caps) === JSON.stringify(caps)) continue;
      map.blocks[block].caps = caps;
      hostOf(block)?.setAttribute("data-ge-caps", caps.join(" "));
    }
    map.version = version;
    map.frame = frame;
    const kept = new Set(held.flatMap((block) => [...chain(map.blocks[block]?.unit)]));
    for (const [unit, fileId] of plan.units) {
      const file = fileUnits[fileId];
      openUnits.set(unit, fileId);
      openHashes.set(unit, file.hash);
      if (plan.ids.has(unit)) map.units[unit].blockId = plan.ids.get(unit);
      Object.assign(map.units[unit], { keep: file.keep ?? undefined, grid: file.grid || undefined, ...(file.parts ? { parts: file.parts } : {}) });
      if (!kept.has(unit)) Object.assign(map.units[unit], { hash: file.hash, shell: file.shell });
    }
    // One put in (in place of the page's, replaced) holding a block the reader changed and has not saved: the page did not
    // see all the file has of it either (the words of that block the file has are not shown), and has the hash of no
    // version for it: its deletion or conversion asks first (the file refuses it for someone else's change, a card), as of
    // a paired one holding such a block (kept above).
    for (const unit of kept) if (framing?.layout.elements.has(unit) && map.units[unit]) map.units[unit].hash = null;
    for (const [block, file] of plan.blocks) if (map.blocks[block] && (map.blocks[block].unit === null || map.blocks[block].unit === undefined)) openBlocks.set(block, file.id);
    marks();
    if (framing) {
      // Read again now that the marks say what each unit is (a table's grid names its rows by identity then, as at a
      // load before the commits first look), and the identities it gave learned.
      relayout(framing.layout.elements);
      marks();
      // What a component does of a unit of its kind a load shows, before the editor reads it (a code block the kit
      // decorates and draws: components' `arrived`), and a text block a component keeps itself (a code block's:
      // `prepare`, as enter() has it prepare one), now that the marks name each by the page's numbers.
      for (const element of framing.layout.elements.values()) if (element.isConnected) pageOfUnit(element)?.arrived?.(element);
      for (const block of framing.closed) pageOfHost(block.kind)?.prepare?.(block);
      // The frames of what was put in, as a load marks them: read once the marks say what is a box and a text block.
      markFrames(root, framing.layout, framing.hosts);
    }
    return { hosts, journal: journaled, ...moved };
  }

  /**
   * The units of the page arranged as the file has them (pulled's, for a plan that puts units in, takes them out or
   * moves them: pull/plan.mjs): box after box from the top, each box of the file holding, in the file's order, the
   * element of the page's unit paired with each of its units (moved there where it stands elsewhere: the same
   * element, the reader's words and caret in it) or one made of the file's (put in: its element taken from the page
   * served, `doc`, with its boxes emptied of units, which go in them as any box's do; the unit, its boxes and its text
   * blocks the map's as the file has them, each block made editable as a load makes it: editableAhead, prepareBlock).
   * A unit of the page that no box of the file holds is taken out (and the file's no longer: drop). Nothing that is
   * where it should be moves; the selection in one text block stays where it stood among its words. The layout is
   * read again from the page as it is now (nothing else waits to be committed: the pull's rule), the frames of what
   * was put in marked. Returns { removed: the elements taken off the page, placed: those put in or moved }.
   */
  // The layout read again from the page as it is now (a pull's arrangement: nothing else waits to be committed); what
  // the components of units put in (`made`, by page unit) write as they came, as a load reads it (an instance's data
  // parts: what its writes are told from).
  function relayout(made = new Map()) {
    const data = new Map(getLayout()?.data ?? []);
    for (const [unit, element] of made) {
      const held = element.isConnected ? pageOfUnit(element)?.dataOf?.(element) : null;
      if (held) data.set(unit, held);
    }
    setLayout(captureLayout(root, map, null, {
      unitOf: (node) => {
        const id = idOf(node);
        return id === null || removed.has(id) ? null : id;
      },
      boxOf,
      typeOf: ownTypeOf,
      data,
    }));
  }

  function arrangeAs({ plan, fileUnits, fileBoxes, fileBlocks, fileOrders, doc }) {
    const servedUnits = new Map([...doc.querySelectorAll("[data-ge-unit]")].map((node) => [Number(node.getAttribute("data-ge-unit")), node]));
    const ownBoxes = new Map();
    for (const box of fileBoxes) if (box.unit !== null && box.unit !== undefined) ownBoxes.set(box.unit, [...(ownBoxes.get(box.unit) ?? []), box]);
    const ownBlocks = new Map();
    for (const block of fileBlocks) if (block.unit !== null && block.unit !== undefined) ownBlocks.set(block.unit, [...(ownBlocks.get(block.unit) ?? []), block]);
    const pageUnitOf = new Map(plan.back); // file unit -> page unit
    const pageBoxOf = new Map(plan.boxes); // file box -> page box
    const boxElements = new Map(); // file box -> its element, of a unit made here
    const made = new Map(); // page unit -> element, of those made here
    const hosts = [];
    const texts = []; // the text blocks of what is made: prepared once all is where the file has it
    const items = new Set(); // list items of the page's whose nested blocks the arrangement changed
    const taken = [];
    const placed = [];
    const boxElement = (id) => {
      const key = map.boxes[id]?.cid;
      return key !== undefined && table.get(key)?.box === id ? onPage(key) : null;
    };
    // The elements of the page's units and boxes the plan keeps, read before anything moves: one in a unit taken out
    // (a section the file has another of, unpaired) goes off the page with it until it is put where the file has it.
    const keptUnits = new Map([...plan.units.keys()].map((id) => [id, unitElement(id)]));
    const keptBoxes = new Map([...plan.boxes.values()].map((id) => [id, boxElement(id)]));
    const MARKS = ["data-ge-unit", "data-ge-block", "data-ge-box", "data-ge-grid", "data-ge-keep", "data-ge-keep-own", "data-ge-lead"];
    // The elements that lead each unit (a table's scope line): those of the page's, read before anything moves; those
    // of what is made, the page served's. A unit goes with them wherever it goes.
    const leadsOf = new Map([...keptUnits.values()].filter(Boolean).map((element) => [element, withLeads(element).slice(0, -1)]));
    // The element of file unit `id` (a unit of the page from now on, in page unit `parent`).
    const make = (id, parent) => {
      const file = fileUnits[id];
      const served = servedUnits.get(id);
      if (!file || !served) throw new Error(`no unit ${id} in the page served`);
      const element = root.importNode(served, true);
      const marked = (name) => new Map([element, ...element.querySelectorAll(`[${name}]`)].filter((node) => node.hasAttribute(name)).map((node) => [Number(node.getAttribute(name)), node]));
      const [boxesIn, blocksIn] = [marked("data-ge-box"), marked("data-ge-block")];
      for (const box of ownBoxes.get(id) ?? []) for (const child of [...(boxesIn.get(box.id)?.children ?? [])]) if (child.hasAttribute("data-ge-unit") || child.hasAttribute("data-ge-lead")) child.remove();
      for (const node of [element, ...element.querySelectorAll("*")]) for (const name of MARKS) node.removeAttribute(name);
      const unit = map.units.length;
      const leads = [...doc.querySelectorAll(`[data-ge-lead="${id}"]`)].map((node) => root.importNode(node, true));
      for (const lead of leads) {
        for (const node of [lead, ...lead.querySelectorAll("*")]) for (const name of MARKS) node.removeAttribute(name);
        lead.setAttribute("data-ge-lead", String(unit));
      }
      leadsOf.set(element, leads);
      const entry = { id: unit, kind: file.kind, parent, hash: file.hash, shell: file.shell, ...(file.blockId ? { blockId: file.blockId } : {}), ...(file.keep ? { keep: file.keep } : {}), ...(file.grid ? { grid: true } : {}), ...(file.parts ? { parts: file.parts } : {}) };
      map.units.push(entry);
      units?.set(unit, entry);
      bind(element, "unit", unit);
      openUnits.set(unit, id);
      openHashes.set(unit, file.hash);
      for (const box of ownBoxes.get(id) ?? []) {
        const node = boxesIn.get(box.id);
        if (!node) throw new Error(`no box ${box.id} of unit ${id}`);
        const boxId = map.boxes.length;
        const boxEntry = { id: boxId, kind: box.kind, unit, ...(box.key !== null && box.key !== undefined ? { key: box.key } : {}) };
        map.boxes.push(boxEntry);
        boxes?.set(boxId, boxEntry);
        bind(node, "box", boxId);
        pageBoxOf.set(box.id, boxId);
        boxElements.set(box.id, node);
      }
      for (const block of ownBlocks.get(id) ?? []) {
        const host = blocksIn.get(block.id);
        if (!host) throw new Error(`no text block ${block.id} of unit ${id}`);
        texts.push({ host, block, unit, element });
      }
      pageUnitOf.set(id, unit);
      made.set(unit, element);
      return element;
    };
    const isUnit = (node) => idOf(node) !== null;
    const nextUnit = (node) => {
      for (let at = node.nextElementSibling; at; at = at.nextElementSibling) if (isUnit(at)) return at;
      return null;
    };
    const firstUnit = (box) => [...box.children].find(isUnit) ?? null;
    // File box `id` as the page's element `box` (of page unit `owner`, null: none) holds it.
    const arrange = (id, box, owner) => {
      const order = (fileOrders.get(id) ?? []).map((unit) => {
        const mine = pageUnitOf.get(unit);
        if (mine !== undefined && !made.has(mine)) {
          map.units[mine].parent = owner;
          return [unit, mine, keptUnits.get(mine) ?? null];
        }
        const element = make(unit, owner);
        return [unit, pageUnitOf.get(unit), element];
      });
      const wanted = new Set(order.map(([, , element]) => element));
      const nest = box.hasAttribute("data-ge-block"); // a box that is a text block too: a list item's, holding the blocks under it
      for (const child of [...box.children]) {
        if (!isUnit(child) || wanted.has(child)) continue;
        const group = withLeads(child);
        group.forEach((node) => node.remove());
        taken.push(...group);
        if (nest) items.add(box);
      }
      // A unit goes with the elements that lead it (a table's scope line), and before those of the one it goes before.
      let cursor = null;
      for (const [, , element] of order) {
        if (!element) throw new Error("a unit with no element");
        if ((cursor ? nextUnit(cursor) : firstUnit(box)) !== element) {
          const group = [...(leadsOf.get(element) ?? []), element];
          if (cursor) cursor.after(...group);
          else if (firstUnit(box)) withLeads(firstUnit(box))[0].before(...group);
          else box.append(...group);
          placed.push(...group);
          if (nest) items.add(box);
        }
        cursor = element;
      }
      const kind = map.boxes[boxOf(box)]?.kind;
      for (const [, mine] of order) {
        if (kind && !accepts(kind, map.units[mine].kind)) stood.set(mine, kind);
        else stood.delete(mine);
      }
      for (const [unit, mine] of order) {
        for (const inner of ownBoxes.get(unit) ?? []) {
          const node = boxElements.get(inner.id) ?? keptBoxes.get(pageBoxOf.get(inner.id));
          if (!node) throw new Error(`no element for box ${inner.id}`);
          arrange(inner.id, node, mine);
        }
      }
    };
    // The selection in one text block, by where it stands among its words, to put back once its element is where
    // the file has it (taken off the page and put back, a selection in it collapses).
    const selection = root.getSelection?.();
    const anchor = selection?.rangeCount ? selection.anchorNode : null;
    const caretHost = (anchor?.nodeType === 1 ? anchor : anchor?.parentElement)?.closest?.("[contenteditable='true']") ?? null;
    const caret = caretHost && caretHost.contains(selection.focusNode) ? { host: caretHost, offsets: rangeOffsets(caretHost, selection.getRangeAt(0)), focused: Boolean(root.activeElement) && (root.activeElement === caretHost || caretHost.contains(root.activeElement)) } : null;
    for (const box of fileBoxes) {
      if (box.unit !== null && box.unit !== undefined) continue;
      const node = boxElement(pageBoxOf.get(box.id));
      if (node) arrange(box.id, node, null);
    }
    for (const unit of plan.removed) drop(unit);
    // What was made, prepared as a load prepares it, now that each holds what it holds (a list item its nested list:
    // that list read-only in it, the item keeping its line over it); a text block of the map as a commit's answer
    // makes one (its baseline what the page shows), its source the file's.
    // Its formulas drawn first as the kit draws a page's as it loads (DocMath: the kit draws none put in later), as
    // enter() finds them; then each text block as enter() prepares it: a display formula's by its component, one a
    // component keeps itself (a code block's) a block of the map that component prepares once the marks name it.
    for (const element of new Set(texts.map(({ element }) => element))) if (element.isConnected) drawFormulas(element);
    const closed = [];
    for (const { host, block, unit } of texts) {
      const kind = HOSTS[block.kind];
      const at = { ...(block.self ? { self: true } : { path: block.path }) };
      if (kind?.closed) {
        const blockId = map.blocks.length;
        map.blocks.push({ id: blockId, tag: host.localName, kind: block.kind, caps: block.caps ?? [], inner: block.inner, atoms: block.atoms ?? [], unit, ...at });
        sources.set(blockId, block.inner);
        closed.push(map.blocks[blockId]);
        continue;
      }
      let baseline;
      if (kind?.tex) {
        host.setAttribute("contenteditable", "true");
        baseline = pageOfHost(block.kind)?.prepare?.(block, host);
      }
      if (baseline === undefined) {
        editableAhead(host, block);
        prepareBlock(host, { inner: block.inner, atoms: block.atoms ?? [], kind: block.kind, caps: block.caps ?? [] });
      }
      const name = kind?.wrapped ? host.firstElementChild ?? host : host; // a Sheet tab's name span
      const blockId = registerBlock(name, { html: new Map() }, { ...at, inner: block.inner }, unit);
      sources.set(blockId, block.inner);
      Object.assign(map.blocks[blockId], { inner: block.inner, atoms: block.atoms ?? [] });
      if (baseline !== undefined) baselines.set(blockId, baseline);
      hosts.push(name);
    }
    // An item of the page's that holds blocks now, or none any more (sub-items put in under it, or its last taken
    // out): as a load leaves it, its words where they stand.
    for (const item of items) {
      if (!item.isConnected || texts.some(({ host }) => host === item)) continue;
      const lists = nestedBlocks(item);
      if (lists.length > 0) {
        for (const list of lists) list.setAttribute("contenteditable", "false");
        keepLine(item);
        item.setAttribute("data-ge-nested", "");
      } else if (item.hasAttribute("data-ge-nested")) {
        item.removeAttribute("data-ge-nested");
        for (const line of item.querySelectorAll(`:scope > br.${ITEM_LINE}`)) line.remove();
      }
    }
    if (caret?.host.isConnected && !(selection.rangeCount && caret.host.contains(selection.anchorNode))) {
      if (caret.focused) caret.host.focus({ preventScroll: true });
      select(rangeAt(caret.host, caret.offsets));
    }
    relayout();
    const framing = { layout: { elements: made, kinds: new Map([...made.keys()].map((id) => [id, map.units[id].kind])) }, hosts, closed }; // every text block prepared, as enter() hands markFrames hers
    return { removed: taken.filter((node) => !node.isConnected), placed: placed.filter((node) => node.isConnected), framing };
  }

  return {
    build, apply, collect, current, marks, counts, buffer, texts, resolve, committed, unjournal, placedUnits, besideOf, takenOut, putBack, heldWithin, unitOf, unitText, written, carry, dataOfUnit, heldOtherwise, rewrite, issues, removed, pageIds, idFor,
    pendingOf, pullView, knownFrame, pulled, unseen,
    /** The text blocks the page shows words of that the reader gave up for the file's (用文件里的), by their ids. */
    givenUpTexts: () => [...discarded.keys()].map(parseIssueKey).filter(({ kind, ref }) => kind === "text" && map.blocks[ref] && !map.blocks[ref].gone && hostOf(ref)?.isConnected).map(({ ref }) => ref),
    /** How many changes of blocks' (not of words) the reader gave up for the file's (保留 Agent 的, 用文件里的). */
    givenUpUnits: () => [...discarded.keys()].filter((key) => parseIssueKey(key).kind === "unit").length,
    /**
     * What the page holds of text block `id` that the file does not have, as a card says the reader's version (`mine`:
     * its words and those of the blocks split off it, one a line), and whether blocks split off it go with it (`split`);
     * null when it holds nothing more. What 用文件里的 gives up is all of it: the editor lists what the card did not show.
     */
    textNow: (id) => {
      const edit = collect().edits.find((one) => one.id === id);
      return edit ? { mine: edit.parts.map((part) => part.html).filter(Boolean).join("\n") || null, split: edit.parts.some((part) => !part.keep) } : null;
    },
    /** How many of those there are. */
    givenUpWords: () => [...discarded.keys()].map(parseIssueKey).filter(({ kind, ref }) => kind === "text" && map.blocks[ref] && !map.blocks[ref].gone && hostOf(ref)?.isConnected).length,
    /** The element of text block `id` of the map on the page, or null. */
    hostOfBlock: (id) => hostOf(id),
    /** The element of unit `id` of the map on the page, or null. */
    unitElementOf: (id) => unitElement(id),
    /** The id a unit of the page has in the file, or the one it proposes for it; null for none. */
    fileId: (unit) => map.units[unit]?.blockId ?? map.units[unit]?.proposed ?? null,
    /** The hash a unit of the page has in the file now (its map's, kept by every answer); null for none (changes/ finds the Agent's blocks by it). */
    fileHash: (unit) => map.units[unit]?.hash ?? null,
    /** save(pending) as JSON, with the page's body (sync-state.mjs pack). */
    keep: (pending) => pack(root, save(pending)),
    /** Identities more than one element on the page carries (none, ever). */
    doubled: () => [...doubled],
  };
}

// What the file did not take is held under a key (the commits' `issues`): of a text block ("b"), of a
// unit's operation ("u") or of a block made or put back on the page, by the id it proposes ("i");
// the conflict's `kind` is "text", "unit" or "insert". The key is built and read only here (and
// kept as it is by the crash buffer and the conflict cards).
const ISSUE_PREFIX = { text: "b", unit: "u", insert: "i" };
export const issueKey = (kind, ref) => `${ISSUE_PREFIX[kind]}${ref}`;
/** { kind, ref } of a key: ref the block's or the unit's number, or the id (a string) of an insert. */
export function parseIssueKey(key) {
  const kind = Object.keys(ISSUE_PREFIX).find((name) => ISSUE_PREFIX[name] === key[0]);
  return { kind, ref: kind === "insert" ? key.slice(1) : Number(key.slice(1)) };
}
// The units whose operation is held, of these keys.
const heldUnits = (keys) => [...keys].map(parseIssueKey).filter(({ kind }) => kind === "unit").map(({ ref }) => ref);

// The kind of a unit's change (collectEdits'): the name of what it does, its one field besides the unit and
// what that field takes (`on`, `value`, `definition`): "remove", "replace", "source" and the like; null for none.
export const kindOf = (change) => Object.keys(change ?? {}).find((key) => !["id", "on", "value", "definition"].includes(key)) ?? null;

// Whether a unit's conflict (or what was given up of one) is of a unit the file has no one of: gone, or
// there twice.
const lacks = (entry) => entry?.reason === "missing" || entry?.reason === "ambiguous";

// Whether the texts in a unit wait with a change of it held back (`entry`, its conflict): where the change
// carries them (a conversion the words of its block, a table's operation those of its cells, a deletion
// those of the blocks it took off the page, `off`, which go or are given up with it), or where the file has
// no one unit to write them to (they would be refused the same). A move, a look, a deletion of blocks on the
// page again (undone since) or what a component writes holds none of them.
const holdsWords = (entry, off = false) => !entry?.change || Boolean(entry.change.replace || entry.change.table || (entry.change.remove && off)) || lacks(entry);

// What a layout holds of a unit's look and of its table's rows and cells (core.mjs captureLayout): what a
// unit held back keeps, and what one deleted whole takes along and is put back with.
const LOOKS = ["toggles", "sizes", "attributes", "tables"];

// What of a layout a unit's change is about: a conversion its element and type, and all its looks, which
// the element it writes carries (a list given the other tag those two alone: its switches go as changes of
// their own), a move its place ("place"), a look or a table's operation that part (LOOKS, each named for the
// field of the change it holds: "sizes" a `size`'s); a deletion or what its component writes none of them.
const layoutOf = (change) => (change?.replace ? ["elements", "types", ...LOOKS] : change?.retag ? ["elements", "types"] : change?.move ? ["place"] : LOOKS.filter((part) => change?.[part.slice(0, -1)] !== undefined));

// What an operation of a commit carries in the reader's words, where the file did not take it: the
// text of a unit turned into another type, what a component wrote; null for any other.
export const writtenHTML = (op) => op?.replace?.html ?? (op?.source ? Object.values(op.source).join("\n") : null);

// What a block made on the page holds, as a commit carries it: its text, its title and those of the
// blocks in it, one a line (the reader's words, when the file did not take it).
export const nodeHTML = (node) => [node?.title, node?.html, node?.restore?.source, ...(node?.children ?? []).map(nodeHTML)].filter(Boolean).join("\n");

// Where a text block of the page sits in its unit, as the server's scan writes it (pathIn): the
// element steps from the unit down, each [tag, index among the parent's children of that tag, how
// many there are]. Only to find the element a path of the file names (blockElement), never to say where a block is.
// `steps`: each element's step, kept for the next path asked of the same unit (hostsByPath): its parent's
// children are counted once, for all of them.
function pathFrom(unit, host, steps = new Map()) {
  const path = [];
  for (let node = host; node && node !== unit; node = node.parentElement) {
    if (!steps.has(node)) {
      const children = node.parentElement?.children ?? [node];
      const counts = new Map();
      for (const child of children) {
        const at = counts.get(child.localName) ?? 0;
        counts.set(child.localName, at + 1);
        steps.set(child, [child.localName, node.parentElement ? at : -1]);
      }
      for (const child of children) steps.get(child).push(node.parentElement ? counts.get(child.localName) : 0);
    }
    path.unshift(steps.get(node));
  }
  return ["unit", ...path];
}

// The text blocks of `unit` (a unit of the page) that are its own, no unit's inside it, by their path (pathFrom,
// as JSON): the first of each, in the page's order.
function hostsByPath(unit) {
  const steps = new Map();
  const found = new Map();
  for (const host of unit.querySelectorAll("[contenteditable='true']")) {
    if (host.parentElement?.closest("[data-ge-unit], [data-ge-unit-kind]") !== unit) continue;
    const path = JSON.stringify(pathFrom(unit, host, steps));
    if (!found.has(path)) found.set(path, host);
  }
  return found;
}
