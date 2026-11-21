// The page's pull, planned (docs/editor.md "The pull"): what of someone else's write the page can show where it
// stands, without loading itself anew. A pure function of two descriptions of a document, the page's (what it
// knows the file has: commit.mjs pullView) and the file's (the map of the page as it is served now, and the order
// of the units in each box of it), so that it is planned before anything on the page changes and can be tested on
// its own (tests/unit/pull.mjs).
//
// The units of the two are paired (since 2026-11-13): by their block ids first
// (one the page knows by an id is the file's of that id, wherever the file has it now); then, box by box from the
// top (the boxes outside any unit by kind and key, each paired unit's boxes by kind and key), those of one hash and
// kind in the order both have them (a unit nobody changed, which may have moved); between the units so paired in
// the same order on both sides, one the page has and one the file has at the same place, of one kind, when the gap
// holds as many on each side (words changed in place: a unit of the file the page knew no id for takes the file's
// id), unless the file's holds what another unit of that box held before (`shift`: units moved around it, never
// paired so: the reader's caret would land in other words); a unit holding boxes and no words of its own (a section,
// a list), the only one of its kind left in the box on each side; and across boxes, one hash that one unit alone has
// on each side (a unit moved elsewhere unchanged), every box then gone through again. A Sheet's tab is explained by
// what changed in its panel (`companion`: its hash holds the panel's). What the page has and the file no longer has
// is taken out (`removed`), what the file has new is put in (`inserted`), a paired unit standing elsewhere is moved
// (`moved`).
// The text blocks outside any unit (the title) go in order.
//
// A paired unit the file has otherwise than the page last knew it must be the same besides its words and the units
// in it (its shell: source/units.mjs unitShell), and something of it explain it: words of it or of a unit in it
// changed, units put in, taken out of or moved in it or in a unit in it, or it moved (indented otherwise), else it
// changed in what the shell does not tell (`unseen`); the document must be the same besides its units and title (its
// frame); each text block of a paired unit where it was and of its kind; every block whose words changed one the
// caller can show anew (`patchable`). What may be put in, taken out or moved the caller says (pull/apply.mjs: the
// file's markup of it, the page's elements). Anything else is no plan: the page is shown anew instead (`reason`
// says why, for the tests and a look).

const boxKey = (box) => `${box.kind}\u0000${box.key ?? ""}`;
const blockKey = (block) => (block.self ? "self" : JSON.stringify(block.path ?? null));

// The most cells of a table `common` fills between what two boxes share at their start and at their end: past it,
// planning would take longer than loading the page anew (a box of thousands of paragraphs, one moved from its top to
// its middle), and there is no plan (`large`).
export const COMMON_CELLS = 400000;
class TooLarge extends Error {}

// The longest run of pairs of `a` and `b` in order for which `same(x, y)` holds: [[x, y]]. What both have alike at
// their start and their end is paired as it stands, the table filled only between (as source/changes.mjs commonRun).
function common(a, b, same) {
  let start = 0;
  while (start < a.length && start < b.length && same(a[start], b[start])) start++;
  let end = 0;
  while (end < a.length - start && end < b.length - start && same(a[a.length - 1 - end], b[b.length - 1 - end])) end++;
  const head = a.slice(0, start).map((x, index) => [x, b[index]]);
  const tail = a.slice(a.length - end).map((x, index) => [x, b[b.length - end + index]]);
  const [middleA, middleB] = [a.slice(start, a.length - end), b.slice(start, b.length - end)];
  const rows = middleA.length;
  const columns = middleB.length;
  if (rows * columns > COMMON_CELLS) throw new TooLarge();
  const table = Array.from({ length: rows + 1 }, () => new Array(columns + 1).fill(0));
  for (let i = rows - 1; i >= 0; i--) {
    for (let j = columns - 1; j >= 0; j--) table[i][j] = same(middleA[i], middleB[j]) ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
  }
  const pairs = [];
  for (let i = 0, j = 0; i < rows && j < columns;) {
    if (same(middleA[i], middleB[j])) {
      pairs.push([middleA[i], middleB[j]]);
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) i++;
    else j++;
  }
  return [...head, ...pairs, ...tail];
}

/**
 * page: { frame, units: [{ id, kind, blockId?, hash, shell }] (the file's units the page shows), boxes:
 * [{ id, unit (null: none), kind, key? }], orders: Map(box id -> [unit id]), blocks: [{ id, unit, self?, path?,
 * kind, source, open? }] (the text blocks it knows, `source` what it knows the file has of each; `open`, of one
 * outside any unit, its place among those of the version the page names its blocks by) }.
 * file: { version, frame, units: [{ id, kind, parent, hash, shell, blockId? }], boxes: [{ id, unit, kind, key? }],
 * orders: Map(box id -> [unit id]), blocks: [{ id, unit, self?, path?, kind, caps, inner, atoms }] } (the map of the
 * page served now: source/instrument.mjs, with the orders read off that page).
 * patchable(pageBlock, fileBlock): whether the page can show that block with the file's words in place.
 * Returns { ok: false, reason } or { ok: true, units: Map(page unit -> file unit), back: Map(file unit -> page unit),
 * boxes: Map(file box -> page box) (those paired), removed: Set(page unit), inserted: Set(file unit), moved: Set(page
 * unit), blocks: Map(page block -> file block), changes: [{ id (a page block), theirs (the file's block) }] (the words to
 * show), ids: Map(page unit -> the id the file gives it, which the page knew none for), structural (units put in,
 * taken out or moved), guessed: Set(page unit) (those paired by where they stand alone, never one the page knows by
 * an id), same (nothing differs at all) }; or { ok: false, reason: "large" } where pairing would cost more than a load.
 */
export function planPull(page, file, options = {}) {
  try {
    return planned(page, file, options);
  } catch (error) {
    if (error instanceof TooLarge) return { ok: false, reason: "large" }; // shown anew sooner than planned
    throw error;
  }
}

function planned(page, file, { patchable = () => false, replace = false } = {}) {
  const no = (reason) => ({ ok: false, reason });
  if (typeof page.frame !== "string" || page.frame !== file.frame) return no("frame");
  const canReplace = typeof replace === "function" ? replace : () => Boolean(replace); // (by the page's unit)
  const pageUnits = new Map(page.units.map((unit) => [unit.id, unit]));
  const fileUnits = new Map(file.units.map((unit) => [unit.id, unit]));
  // The boxes of a unit (null: those outside any), by kind and key; two of one kind and key tell nothing apart.
  const boxesBy = (boxes) => {
    const by = new Map();
    for (const box of boxes) {
      const owner = box.unit ?? null;
      if (!by.has(owner)) by.set(owner, new Map());
      const own = by.get(owner);
      own.set(boxKey(box), own.has(boxKey(box)) ? null : box);
    }
    return by;
  };
  const pageBoxes = boxesBy(page.boxes);
  const fileBoxes = boxesBy(file.boxes);
  // The unit and box each unit stands in (null: none), on each side.
  const placesOf = (orders, boxes) => {
    const owners = new Map(boxes.map((box) => [box.id, box.unit ?? null]));
    const places = new Map();
    for (const [box, order] of orders) for (const unit of order) places.set(unit, { box, unit: owners.get(box) ?? null });
    return places;
  };
  const pagePlaces = placesOf(page.orders, page.boxes);
  const filePlaces = placesOf(file.orders, file.boxes);

  const units = new Map(); // page unit -> file unit
  const back = new Map(); // file unit -> page unit
  const ids = new Map();
  // With `replace`: a paired unit the page cannot show the file's of in place (its shell otherwise, a block
  // it cannot show the words of, its text blocks or boxes otherwise, a hash nothing explains, another kind by its id)
  // is taken out and the file's put in, whole, as a page shown anew shows it (what is in it, paired by itself, moved
  // into the one put in), and the plan made again without that pair; what holds the reader's words or caret the
  // caller keeps from being taken out (pull/apply.mjs: committed first, or later).
  const replaced = new Set(); // page units
  const unpair = (mine) => {
    const theirs = units.get(mine);
    units.delete(mine);
    back.delete(theirs);
    ids.delete(mine);
    replaced.add(mine);
    for (const box of file.boxes) if (box.unit === theirs) boxes.delete(box.id); // what is in it goes into the one put in
  };
  const pair = (mine, theirs) => {
    units.set(mine, theirs);
    back.set(theirs, mine);
    const [unit, fileUnit] = [pageUnits.get(mine), fileUnits.get(theirs)];
    if (!unit.blockId && fileUnit.blockId) ids.set(mine, fileUnit.blockId);
  };
  // 1. By id: the file's unit of the id the page knows a unit by (one of each); of another kind, no plan.
  const counted = (list) => {
    const count = new Map();
    for (const unit of list) if (unit.blockId) count.set(unit.blockId, (count.get(unit.blockId) ?? 0) + 1);
    return count;
  };
  const [pageIds, fileIds] = [counted(page.units), counted(file.units)];
  const fileById = new Map(file.units.filter((unit) => unit.blockId && fileIds.get(unit.blockId) === 1).map((unit) => [unit.blockId, unit]));
  for (const unit of page.units) {
    if (!unit.blockId) continue;
    if (pageIds.get(unit.blockId) !== 1 || (fileIds.get(unit.blockId) ?? 0) > 1) return no("id");
    const theirs = fileById.get(unit.blockId);
    if (!theirs) continue; // taken out (or its id lost: then nothing pairs it, and it is taken out and put in)
    if (theirs.kind !== unit.kind) {
      if (!canReplace(unit.id)) return no("kind");
      replaced.add(unit.id); // the page's taken out, the file's of its id put in (a paragraph the Agent made a heading)
      continue;
    }
    pair(unit.id, theirs.id);
  }
  const free = (unit) => !units.has(unit);
  const freeFile = (unit) => !back.has(unit);
  const pairable = (mine, theirs) => {
    const [unit, fileUnit] = [pageUnits.get(mine), fileUnits.get(theirs)];
    // Of one kind; not two ids (the file's of the page's id is paired already, 1.), nor one the file gives that the
    // page knows another unit by. One the page knows by an id the file lost (a file written from an earlier read)
    // pairs as one with none, and keeps its id (the server finds it by where it stood: source/commit.mjs).
    return Boolean(unit && fileUnit) && !replaced.has(mine) && unit.kind === fileUnit.kind && !(unit.blockId && fileUnit.blockId) && !(fileUnit.blockId && pageIds.has(fileUnit.blockId));
  };
  // Paired by where it stands alone (one to one in a gap, the only container of its kind left): never one the page
  // knows by an id the file no longer has (its id lost, or the unit gone and another put where it stood: the
  // reader's words would land in the other, its words theirs and its undo steps on them; taken out instead, and the
  // file's put in, as a page shown anew does, its unsaved words a card). What is so paired is `guessed`.
  const guessed = new Set();
  const guess = (mine, theirs) => {
    if (!pairable(mine, theirs) || pageUnits.get(mine).blockId) return false;
    pair(mine, theirs);
    guessed.add(mine);
    return true;
  };

  // 2. Box by box, from the top: of one hash in order, then one to one between those.
  const boxes = new Map(); // file box -> page box
  const queue = [];
  const boxesOfPair = (mine, theirs) => {
    const [ours, yours] = [pageBoxes.get(mine) ?? new Map(), fileBoxes.get(theirs) ?? new Map()];
    for (const key of new Set([...ours.keys(), ...yours.keys()])) {
      const [one, other] = [ours.get(key), yours.get(key)];
      if (one === null || other === null) return "boxes";
      // A box on one side alone: of a unit outside any (a detail card's content, its frame the document's), its
      // units are taken out or put in; of a unit both have, the unit is another (its shell says so).
      if (!one || !other) {
        if (mine !== null) return "boxes";
        continue;
      }
      if (boxes.has(other.id)) continue;
      boxes.set(other.id, one.id);
      queue.push([one.id, other.id]);
    }
    return null;
  };
  const [pageWorded, fileWorded] = [page.blocks, file.blocks].map((list) => new Set(list.map((block) => block.unit).filter((unit) => unit !== null && unit !== undefined)));
  const shift = (ours, yours, at, theirs) => ours.some((other, index) => index !== at && pageUnits.get(other)?.hash === fileUnits.get(theirs).hash);
  const visit = (mine, theirs) => {
    const ours = page.orders.get(mine) ?? [];
    const yours = file.orders.get(theirs) ?? [];
    const [ourIndex, yourIndex] = [ours, yours].map((list) => new Map(list.map((unit, index) => [unit, index])));
    for (const [one, other] of common(ours.filter(free), yours.filter(freeFile), (a, b) => pairable(a, b) && pageUnits.get(a).hash === fileUnits.get(b).hash)) pair(one, other);
    // Between the units paired in the same order on both sides, as many on each side: one to one, of one kind.
    const anchors = common(ours, yours, (a, b) => units.get(a) === b);
    const gaps = [];
    let [from, to] = [0, 0];
    for (const [a, b] of [...anchors, [null, null]]) {
      const [at, bt] = [a === null ? ours.length : ourIndex.get(a), b === null ? yours.length : yourIndex.get(b)];
      gaps.push([ours.slice(from, at), yours.slice(to, bt)]);
      [from, to] = [at + 1, bt + 1];
    }
    for (const [mineGap, theirGap] of gaps) {
      const [left, right] = [mineGap.filter(free), theirGap.filter(freeFile)];
      if (left.length === 0 || left.length !== right.length) continue;
      left.forEach((one, index) => {
        const other = right[index];
        if (!shift(ours, yours, ourIndex.get(one), other)) guess(one, other);
      });
    }
    // A unit that holds boxes and no words of its own (a section, a list; not an item), the only one of its kind left
    // in the box on each side: the same, moved around others (the reader's paragraph put before a section, the file
    // having it after). What it holds is paired by itself; no words of a text block land in other words so.
    const holders = (list, owns, open, unitsOf, worded) => {
      const by = new Map();
      for (const unit of list) {
        if (!open(unit) || !owns.has(unit) || worded.has(unit)) continue;
        const kind = unitsOf.get(unit)?.kind;
        by.set(kind, by.has(kind) ? null : unit);
      }
      return by;
    };
    const theirHolders = holders(yours, fileBoxes, freeFile, fileUnits, fileWorded);
    for (const [kind, one] of holders(ours, pageBoxes, free, pageUnits, pageWorded)) {
      const other = theirHolders.get(kind);
      if (one !== null && other !== null && other !== undefined) guess(one, other);
    }
  };
  // Box after box, each paired unit's boxes once it is paired; then across boxes, and every box again (a unit paired
  // across boxes leaves a gap of one to one where it stood or now stands: a section moved out of a Sheet's panel, the
  // Sheet's units then paired one to one); again while that pairs more.
  const visited = new Set();
  const visits = [];
  const descend = () => {
    for (const [one, other] of units) {
      if (visited.has(one)) continue;
      visited.add(one);
      const failed = boxesOfPair(one, other);
      if (failed && canReplace(one)) unpair(one);
      else if (failed) return failed;
    }
    return null;
  };
  // 3. Across boxes: a hash one unit alone has on each side (a unit moved elsewhere unchanged).
  const lone = (list, open) => {
    const by = new Map();
    for (const unit of list) if (open(unit.id) && typeof unit.hash === "string") by.set(unit.hash, by.has(unit.hash) ? null : unit);
    return by;
  };
  let failure = boxesOfPair(null, null);
  while (!failure) {
    while (queue.length > 0 && !failure) {
      const next = queue.shift();
      visits.push(next);
      visit(...next);
      failure = descend();
    }
    if (failure) break;
    const before = units.size;
    const theirLone = lone(file.units, freeFile);
    for (const [hash, unit] of lone(page.units, free)) {
      const other = theirLone.get(hash);
      if (unit && other && pairable(unit.id, other.id)) pair(unit.id, other.id);
    }
    if (units.size > before) for (const each of visits) visit(...each);
    failure = descend();
    if (units.size === before && queue.length === 0) break;
  }
  if (failure) return no(failure);
  // What the units paired make of the file; a refusal of units' (`at`, every one of that kind at once) with `replace`:
  // those units replaced, and again (as many passes as units replaced inside others, not one a unit).
  const settle = () => {
    const no = (reason, at = null) => ({ ok: false, reason, at });
    const removed = new Set(page.units.map((unit) => unit.id).filter(free));
    const inserted = new Set(file.units.map((unit) => unit.id).filter(freeFile));
    // Moved: standing in another unit's box (or another box of it) than the paired one of where it stood, or out of
    // the order the units around it keep.
    const moved = new Set();
    const inOrder = new Set();
    for (const [fileBox, pageBox] of boxes) {
      for (const [one] of common(page.orders.get(pageBox) ?? [], file.orders.get(fileBox) ?? [], (a, b) => units.get(a) === b)) inOrder.add(one);
    }
    for (const [mine, theirs] of units) {
      const [here, there] = [pagePlaces.get(mine), filePlaces.get(theirs)];
      if (!here || !there || boxes.get(there.box) !== here.box || !inOrder.has(mine)) moved.add(mine);
    }

    // Each text block of a paired unit by its place in the unit, those outside any in order.
    const blocks = new Map();
    const changes = [];
    const fileBlocksOf = new Map();
    const outside = [];
    for (const block of file.blocks) {
      if (block.unit === null || block.unit === undefined) {
        outside.push(block);
        continue;
      }
      if (!fileBlocksOf.has(block.unit)) fileBlocksOf.set(block.unit, new Map());
      const own = fileBlocksOf.get(block.unit);
      own.set(blockKey(block), own.has(blockKey(block)) ? null : block);
    }
    const pageBlocksOf = new Map();
    const pageOutside = [];
    for (const block of page.blocks) {
      if (block.unit === null || block.unit === undefined) {
        if (!Number.isInteger(block.open)) return no("outside"); // written on the page: no place in the file's order
        pageOutside.push(block);
        continue;
      }
      if (!pageUnits.has(block.unit)) return no("blocks");
      if (removed.has(block.unit)) continue; // taken out with it
      if (pageBlocksOf.get(block.unit)?.has(blockKey(block))) return no("blocks", block.unit);
      if (!pageBlocksOf.has(block.unit)) pageBlocksOf.set(block.unit, new Map());
      pageBlocksOf.get(block.unit).set(blockKey(block), block);
    }
    pageOutside.sort((a, b) => a.open - b.open);
    if (pageOutside.length !== outside.length) return no("blocks");
    const pairBlocks = (block, fileBlock) => {
      if (!fileBlock || block.kind !== fileBlock.kind) return "blocks";
      blocks.set(block.id, fileBlock);
      if (block.source === fileBlock.inner) return null;
      if (typeof block.source !== "string" || !patchable(block, fileBlock)) return "text";
      changes.push({ id: block.id, theirs: fileBlock });
      return null;
    };
    for (const [index, block] of pageOutside.entries()) {
      const failed = pairBlocks(block, outside[index]);
      if (failed) return no(failed);
    }
    // Every paired unit whose blocks the page cannot show the file's of in place, at once (each replaced, with
    // `replace`: one pass for them all, not one each).
    const bad = new Map(); // page unit -> why
    for (const [id, fileId] of units) {
      const mine = pageBlocksOf.get(id) ?? new Map();
      const theirs = fileBlocksOf.get(fileId) ?? new Map();
      if (mine.size !== theirs.size) {
        bad.set(id, "blocks");
        continue;
      }
      for (const [key, block] of mine) {
        const failed = pairBlocks(block, theirs.get(key));
        if (failed) {
          bad.set(id, failed);
          break;
        }
      }
    }
    if (bad.size > 0) return no([...bad.values()][0], [...bad.keys()]);

    // What explains a paired unit the file has otherwise than the page knew it (by the file's units): words of it or
    // in it changed, units put in, taken out or moved in it or in one in it (the units up from where), or it moved,
    // and so what is in it (indented otherwise).
    // A unit that a box elsewhere goes with (a Sheet tab, its panel: `companion`) is explained by what explains a unit
    // in that box, as its parent is.
    const explained = new Set();
    const companions = new Map(file.units.filter((unit) => unit.companion !== null && unit.companion !== undefined).map((unit) => [unit.companion, unit.id]));
    const fileBoxOf = new Map([...boxes].map(([fileBox, pageBox]) => [pageBox, fileBox]));
    const up = (unit) => {
      for (let at = unit; at !== null && at !== undefined && !explained.has(at); at = fileUnits.get(at)?.parent) {
        explained.add(at);
        const tab = companions.get(filePlaces.get(at)?.box);
        if (tab !== undefined) explained.add(tab);
      }
    };
    // Where a unit of the page stood, by the file's box (one paired): what was there is explained.
    const upFrom = (pageUnit) => {
      const place = pagePlaces.get(pageUnit);
      const box = fileBoxOf.get(place?.box);
      if (box !== undefined && companions.has(box)) explained.add(companions.get(box));
      up(units.get(place?.unit));
    };
    const children = new Map();
    for (const unit of file.units) if (unit.parent !== null && unit.parent !== undefined) children.set(unit.parent, [...(children.get(unit.parent) ?? []), unit.id]);
    const down = (unit) => {
      explained.add(unit);
      for (const child of children.get(unit) ?? []) down(child);
    };
    for (const { theirs } of changes) up(theirs.unit);
    for (const unit of inserted) up(unit);
    for (const unit of removed) upFrom(unit);
    for (const unit of moved) {
      upFrom(unit);
      down(units.get(unit));
      explained.delete(units.get(unit)); // (so that up goes on from it)
      up(units.get(unit));
    }
    // Shells first, all of them: a unit in a container replaced explains the container (a callout recoloured in a
    // section: the section's hash changed by it alone), which is replaced only where nothing explains it then.
    let differs = false;
    const unseen = [];
    for (const [id, fileId] of units) {
      const [unit, fileUnit] = [pageUnits.get(id), fileUnits.get(fileId)];
      if (unit.hash === fileUnit.hash) continue;
      differs = true;
      if (typeof unit.shell !== "string" || unit.shell !== fileUnit.shell) bad.set(id, "shell");
      else if (!explained.has(fileId)) unseen.push(id);
    }
    if (bad.size > 0) return no("shell", [...bad.keys()]);
    if (unseen.length > 0) return no("unseen", unseen);
    const structural = removed.size + inserted.size + moved.size > 0;
    return { ok: true, units, back, boxes, removed, inserted, moved, blocks, changes, ids, guessed, replaced, structural, same: !differs && !structural && changes.length === 0 && ids.size === 0 };
  };
  for (;;) {
    const result = settle();
    if (result.ok) return result;
    const at = Array.isArray(result.at) ? result.at : [];
    if (at.length === 0 || at.some((id) => !units.has(id) || !canReplace(id))) return no(result.reason);
    for (const id of at) unpair(id);
  }
}

/**
 * The order of the units in each box of a page as it is served (a document the file's map marks: `data-ge-box`
 * on each box, `data-ge-unit` on each unit, source/instrument.mjs): by box id, the unit ids of its children
 * that are units, in order, as captureLayout (core.mjs) reads them on the page.
 */
export function ordersIn(root) {
  const orders = new Map();
  for (const box of root.querySelectorAll("[data-ge-box]")) {
    const id = box.getAttribute("data-ge-box");
    if (!/^\d+$/.test(id)) continue;
    orders.set(Number(id), [...box.children].filter((child) => /^\d+$/.test(child.getAttribute("data-ge-unit") ?? "")).map((child) => Number(child.getAttribute("data-ge-unit"))));
  }
  return orders;
}
