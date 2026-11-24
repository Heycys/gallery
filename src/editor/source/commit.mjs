import { FILES } from "../components/files.mjs";
import { BLOCK_TYPES, COPIED_AS_ITSELF, IDENTITY } from "../components/registry.mjs";
import { copyKeys } from "../components/figure/index.mjs";
import { applyEdits } from "./apply.mjs";
import { scan } from "./blocks.mjs";
import { checkParts, leafHtml } from "./checks.mjs";
import { hashOf } from "./html.mjs";
import { currentCatalog } from "../../shared/component-catalog.mjs";
import { attr } from "../../shared/html-tree.mjs";
import { outsideKey } from "../../shared/ids.mjs";
import { CHART_SOURCE } from "../../shared/table-chart.mjs";
import { counterpart, locate, resembles } from "./locate.mjs";
import { mergeText } from "./merge.mjs";
import { relinkMade } from "./chart-keys.mjs";
import { copiedSource, idsOf, lineIndent, reindent, restoredUnit, tabSource } from "./text.mjs";
import { frameShell, unitHash, unitShell } from "./units.mjs";

/**
 * A commit of the page's autosave (docs/editor.md, "Commits"): what changed on the page since its
 * last commit, applied to the file as it is now. Nothing refers to where it was in some version:
 * a unit is named by its identity (`{ key, id }`), or, untouched since the page opened and without
 * one yet, by what it said then (`{ key, open, hash, blockId }`: the one unit of the file with that
 * hash, else where the opening version had it, when `opening` is given; it gets the id the page
 * proposes, `blockId`, so that the same commit sent again finds it by that id). A text block is its unit's own
 * text (`{ unit, self }`), a field of a unit found by its structural path (`{ unit, path }`, with
 * the sibling counts along it: a path whose structure changed is not trusted), the report's title
 * (`{ title }`), or one outside any unit (`{ open }` since the page opened, `{ outside }` made on it);
 * every text block names the text it had at the
 * page's last commit (`before`). Where the file still has that text, the edit goes in; where it
 * changed, both changes merge word by word (mergeText) or it is a conflict of that block alone.
 * A field whose structure changed is found again only by its text, once in its unit, or it is a
 * conflict: nothing is guessed. A unit deleted, converted or written anew must still say what the page
 * saw (`hash`; null: none the file had, the page showing it without someone else's change in it), unless
 * the reader said to do it anyway (`force`), when the operation's `hash` is the one the refusal they were
 * shown gave, which the file must still have: written again since, it is refused again; moves, sizes, switched classes and
 * set attributes do not depend on its content. What a component wrote says besides by which manifest
 * (`definition`): another than its package's now is refused (`definition`), whatever `force` says, and
 * the page is shown again; what each part it writes held as the page last had it from the file
 * (`parts`, a part's name -> its hash), so that it goes in where only the rest of the unit changed, and
 * with `force` over that alone; and which of its parts one edit wrote together (`together`: lists of names).
 * What the file held where its box takes none from the page (a section in a section) goes back there: a move or a node says `stood`, the kind of box the
 * page saw it in (applyEdits). A container that goes when emptied (a list, a quote)
 * names the units it held too (`items`): found changed (an item added by someone else), it goes
 * item by item, and what was added stays. A unit's hash covers what goes with it elsewhere in the
 * file (a Sheet tab's panel).
 *
 * texts: [{ key, block, parts }] (parts as in applyEdits). units: [{ key, unit, remove: true, hash, items? }
 * | { key, unit, toggle, on } | { key, unit, size, value } | { key, unit, attribute, value } | { key, unit, replace, hash }
 * | { key, unit, table, hash } | { key, unit, source, hash, parts, together?, definition } (source: a data part's name ->
 * what it is to hold) | { key, unit, retag } | { key, unit, move: place } | { key, insert: node, place }], where a place
 * is { after | before: unit } or { into: box } (box: { main: true }, { kind, key } or
 * { unit, kind, key }), and the children of a new node are new nodes, { unit } (an existing unit
 * taken along) or { restore } (a deleted unit put back, below). New nodes and split-off parts carry
 * the page's `key` and the id the page proposes for them (`blockId`, which makes sending a commit
 * again harmless: what the file has already is not made twice). touch: [unit], every unit whose text the commit changes (a change and the units
 * around it), so that each has an id after it. pageIds: the ids of the blocks the page has (its
 * units, and those it made), none of which is a unit it names by what it said when it opened.
 *
 * A unit deleted with everything in it can be put back (undo): its source comes back in
 * `removed` as { source, seal }, and a node { restore: { source, seal } } writes it again as it
 * was, with its id. One deleted while blocks in it go elsewhere (a section dissolved) comes back
 * there too, with `around`: a node { restore, type, children } writes it again around the blocks it
 * holds now, of its source only its tags, what stands above it and the comments after its last block (applyEdits).
 * `seal` (a function of the source: the endpoint's keyed hash) makes sure the
 * page puts back only what was taken out; without one, nothing is put back. A node { copy: unit }
 * writes a copy of a card or a table of the file: its source as the file has it
 * now, its ids taken out (the copy gets a block id of its own); with `keys` ({ old: new | null }),
 * the keys of the charts drawn from tables in it as the page gave them (text.mjs copiedSource). The
 * keys in what the commit made (copies, tables made anew, blocks put back) are made sure of against
 * the file as the commit leaves it (chart-keys.mjs relinkMade: an Agent's chart table added meanwhile
 * may carry the key the page chose), and `chartKeys` ({ old: new | null }, given when it changed one)
 * says what the page does to the blocks it made.
 *
 * Returns { text, version, texts: [{ key, status, html?, reason?, theirs? }], units: [{ key,
 * status, reason?, theirs?, parts?, wrote?, went?, hash? }], ids: { unit key: id }, made: { block key: id }, hashes: { unit key | block key: hash }, shells, frame, removed: { key: { source, seal, around? } },
 * gone, file, outside, keyed, chartKeys?, title? }: status "applied", "merged" (the html now in the file) or
 * "conflict" (`theirs`: what the file holds of a text block, or of the parts a component's write refused
 * as `changed` holds back, by name, with their hashes, `parts`, and the names of those that went in all the
 * same, `wrote`; of a deletion, a conversion or a table's operation refused as `changed`, the unit's hash in
 * the file, `hash`, and its own words, `theirs`: a unit refused so as the file holds it once the commit is
 * written; of a list deleted item by item some of whose items went, their keys, `went`); ids given to units the page named (`ids`) and to the blocks it made or put back
 * (`made`), the hashes the units and the blocks it made have now where the file holds them as the page
 * saw them (and, by the same keys, what each is besides its words, `shells`: unitShell; with what the document is
 * besides its units, `frame`: frameShell, both for the page's pull), the source of each unit deleted (`around` on one whose blocks this commit takes
 * elsewhere: a merged section), the ids of those the file no longer has after it (`gone`: those it
 * deleted, and a list taken out with its last item), what the file says of the others (fileFacts),
 * of the text blocks outside any unit (outsideFacts) and of the keyed blocks the commit made
 * (keyedFacts).
 */

// The kinds of box a unit's component makes in the file as a block first goes into one (`slotKinds`, `makeSlot`:
// a database's record bodies, which the page gives a record as the reader first writes in it).
const ON_DEMAND = new Set(Object.values(FILES).flatMap((own) => own.slotKinds ?? []));

/**
 * `current` with the boxes this commit's blocks go into that the file does not hold yet and their unit's
 * component makes on demand (ON_DEMAND: a record's body, a slot of its database's): each made empty where its
 * component says (`makeSlot`) before anything else, so that what goes into it finds it as any box. A unit is
 * found by its id, or with none yet by its hash (the one unit of that kind the file holds so): one found by
 * neither is left as it is, the block's place then none, as for any box that is not there. Returns { text,
 * before }: `before` the hash each unit given a slot had, by where it starts in `text`, which is what the page
 * names it by (an empty slot of its own making is no one else's change of it).
 */
function slotsMade(current, units) {
  const before = new Map();
  const wanted = units.flatMap((op) => [op?.place?.into, op?.move?.into]).filter((box) => box?.unit && ON_DEMAND.has(box.kind) && typeof box.key === "string");
  if (wanted.length === 0) return { text: current, before };
  let text = current;
  for (const box of wanted) {
    const scanned = scan(text);
    const id = typeof box.unit.id === "string" ? box.unit.id : typeof box.unit.blockId === "string" ? box.unit.blockId : null;
    let hits = id ? scanned.units.filter((unit) => unit.blockId === id) : [];
    if (hits.length === 0 && typeof box.unit.hash === "string") hits = scanned.units.filter((unit) => FILES[unit.kind]?.makeSlot && unitHash(text, unit) === box.unit.hash);
    if (hits.length !== 1) continue;
    const [unit] = hits;
    if (scanned.boxes.some((each) => each.unit === unit.id && each.kind === box.kind && each.key === box.key)) continue;
    const splice = FILES[unit.kind]?.makeSlot?.(text, unit.node, box.key);
    if (!splice) continue;
    if (!before.has(unit.elStart)) before.set(unit.elStart, unitHash(text, unit));
    // What starts past the splice moves with it.
    const moved = splice.text.length - (splice.end - splice.start);
    for (const [at, hash] of [...before]) {
      if (at <= splice.start) continue;
      before.delete(at);
      before.set(at + moved, hash);
    }
    text = text.slice(0, splice.start) + splice.text + text.slice(splice.end);
  }
  return { text, before };
}

/**
 * `text` (what a commit made of `current`, scanned `now`) with the boxes made on demand (ON_DEMAND) that the commit
 * emptied taken out, as their component says (`dropSlot`: a record's body whose last block went, the undo of its
 * first word), so that a body made and undone leaves the file as it was. A box is known across the two by its
 * unit's id and its key; one the file had empty before stays.
 */
function slotsEmptied(now, text) {
  const held = new Set(now.boxes.filter((box) => ON_DEMAND.has(box.kind) && now.units.some((unit) => unit.box === box.id) && now.units[box.unit]?.blockId).map((box) => `${now.units[box.unit].blockId}\n${box.key}`));
  if (held.size === 0) return text;
  for (let pass = 0; pass < 50; pass++) {
    const scanned = scan(text);
    const empty = scanned.boxes.find((box) => ON_DEMAND.has(box.kind) && held.has(`${scanned.units[box.unit]?.blockId}\n${box.key}`) && !scanned.units.some((unit) => unit.box === box.id));
    if (!empty) return text;
    held.delete(`${scanned.units[empty.unit].blockId}\n${empty.key}`);
    const unit = scanned.units[empty.unit];
    const splice = FILES[unit.kind]?.dropSlot?.(text, unit.node, empty.key);
    if (splice) text = text.slice(0, splice.start) + splice.text + text.slice(splice.end);
  }
  return text;
}

export function commitEdits({ current: given, opening = null, texts = [], units = [], touch = [], ids = true, seal = null, pageIds = null }) {
  const { text: current, before: madeFrom } = slotsMade(given, units);
  const now = scan(current);
  const open = typeof opening === "string" ? scan(opening) : null;
  const inner = (block) => current.slice(block.innerStart, block.innerEnd);
  let hashes = null;
  // A unit given an empty slot by this commit (slotsMade) is named by the hash it had before it.
  const hashOfUnit = (unit) => (hashes ??= new Map(now.units.map((other) => [other.id, madeFrom.get(other.elStart) ?? unitHash(current, other)]))).get(unit.id);

  // ---------- where each thing named is in the file now ----------
  const resolvedUnits = new Map(); // page key -> { unit } | { gone } | { reason }
  const otherwise = new Set(); // page keys of units the file had otherwise than the page last saw them
  const proposals = new Map(); // unit of the file now -> the id the page proposes for it
  // The ids the page knows its blocks by (`pageIds`): a unit of the file carrying one of them is that
  // block of the page, so never one the page names by what it said when it opened (one with no id
  // then, or one whose id the file lost): an empty paragraph the page made beside an empty one it
  // opened on says the same, and unitHash leaves ids out.
  const known = new Set(Array.isArray(pageIds) ? pageIds.filter((id) => typeof id === "string") : []);
  // A unit by what it was when the page opened: the one unit of the file with that hash (its block
  // ids aside, as unitHash and locate read both versions: ids given since change nothing), else where
  // the opening version had it; with `fuzzy`, else the one most like it (changed since): where it
  // stood, and still saying much the same. Its surroundings alone also fit a unit deleted with what
  // was around it where something like it stands elsewhere (the last paragraph of another section),
  // and what the page put next to it, into it or did to it would land there. `own`: the ids the
  // named unit itself may carry (its own, the one the page proposes), which the page knows too.
  const byOpening = (index, hash, fuzzy = true, own = []) => {
    const another = (unit) => Boolean(unit.blockId) && known.has(unit.blockId) && !own.includes(unit.blockId);
    const candidates = known.size > 0 ? now.units.filter((unit) => !another(unit)) : now.units;
    const hits = typeof hash === "string" ? candidates.filter((unit) => hashOfUnit(unit) === hash) : [];
    const record = index >= 0 ? open?.units[index] : undefined;
    // Identical units (the same paragraph twice): as many as the opening version had, in the same
    // order, so the k-th then is the k-th now; what came before them may have changed since.
    const twins = record && hits.length > 1 ? open.units.filter((unit) => !another(unit) && unitHash(opening, unit) === hash) : [];
    if (hits.length === 1) return { unit: hits[0] };
    if (twins.length === hits.length && twins.includes(record)) return { unit: hits[twins.indexOf(record)] };
    if (!record) return hits.length > 1 ? { reason: "ambiguous" } : { gone: true };
    const at = locate(opening, current, record, record.elStart);
    const shifted = at >= 0 ? candidates.find((unit) => unit.elStart === at) : null;
    if (shifted) return { unit: shifted };
    if (at === -2 || hits.length > 1) return { reason: "ambiguous" };
    if (!fuzzy) return { gone: true };
    const other = counterpart(opening, current, record, candidates);
    return other && resembles(opening.slice(record.start, record.end), current.slice(other.start, other.end)) ? { unit: other, changed: true } : { gone: true };
  };
  const resolveUnit = (ref) => {
    if (!ref || (typeof ref.key !== "number" && typeof ref.key !== "string")) return { reason: "invalid" };
    if (resolvedUnits.has(ref.key)) return resolvedUnits.get(ref.key);
    let result;
    // Named before it had an id, with the one the page proposes: a commit sent before gave it that one.
    const given = typeof ref.blockId === "string" ? now.units.filter((unit) => unit.blockId === ref.blockId) : [];
    if (given.length === 1 && typeof ref.id !== "string") result = { unit: given[0] };
    else if (typeof ref.id === "string") {
      const hits = now.units.filter((unit) => unit.blockId === ref.id);
      // Its id gone (a file written from what was read before it had one): as it was when the page opened.
      result = hits.length === 1 ? { unit: hits[0] } : hits.length > 1 ? { reason: "ambiguous" }
        : Number.isInteger(ref.open) && typeof ref.openHash === "string" ? byOpening(ref.open, ref.openHash, false, [ref.id]) : { gone: true };
    } else if (Number.isInteger(ref.open)) result = byOpening(ref.open, ref.hash, true, [ref.blockId]);
    else result = { reason: "invalid" };
    if (result.unit && !result.unit.blockId && typeof ref.blockId === "string") proposals.set(result.unit.id, ref.blockId);
    resolvedUnits.set(ref.key, result);
    if (result.unit && changedUnit(ref, result)) otherwise.add(ref.key);
    return result;
  };
  // Whether the file has a unit otherwise than the page saw it: found only by what stands around it, a
  // hash of another version, or none the file ever had (null: the page shows it holding someone else's
  // change it does not show, as made around a unit of theirs).
  const changedUnit = (ref, found) => found.changed || ref.hash === null || (typeof ref.hash === "string" && hashOfUnit(found.unit) !== ref.hash);

  // What the same commit, sent before, already wrote (its answer lost, or the page closed before it
  // came): a block made on the page brings the id the page proposed for it (`blockId`; a unit put
  // back, its own), so one the file has is not made again, and a conversion the unit already shows
  // is done. Deleting what is gone is done too (below). So a commit can be sent again, as it is.
  const present = new Set(now.units.map((unit) => unit.blockId).filter(Boolean));
  const already = []; // [{ key, id }]: blocks of the commit the file has
  const proposedId = (node) => node?.restore !== undefined ? attr(restoredUnit(node.restore?.source)?.element ?? {}, IDENTITY) ?? node.blockId : node?.blockId;
  const madeBefore = (node) => {
    const id = proposedId(node);
    if (typeof id === "string" && present.has(id)) return true;
    const keyed = BLOCK_TYPES[node?.type];
    return Boolean(keyed?.keyed) && typeof node.id === "string" && now.boxes.some((box) => box.kind === keyed.box && box.key === node.id);
  };
  const noteMade = (node) => {
    const id = proposedId(node);
    if (node?.key !== undefined && typeof id === "string" && present.has(id)) already.push({ key: node.key, id });
    if (Array.isArray(node?.children)) node.children.forEach(noteMade);
  };
  const converted = (unit, replace) => {
    const spec = BLOCK_TYPES[replace?.type];
    return Boolean(spec) && current.slice(unit.elStart, unit.end) === leafHtml(spec, replace, (unit.carried ?? "") + (unit.blockId ? ` ${IDENTITY}="${unit.blockId}"` : ""));
  };

  const samePath = (a, b, shape) => Array.isArray(a) && Array.isArray(b) && a.length === b.length && a[0] === b[0]
    && a.slice(1).every((step, index) => step[0] === b[index + 1]?.[0] && step[1] === b[index + 1][1] && (!shape || step[2] === b[index + 1][2]));
  // A text block: { block } found (maybe `changed`: its text is not the page's `before`), or { reason }.
  const resolveBlock = (ref) => {
    if (!ref || typeof ref.before !== "string") return { reason: "invalid" };
    const found = (block) => ({ block, changed: inner(block) !== ref.before });
    if (ref.title) {
      const hits = now.blocks.filter((block) => block.kind === "title");
      return hits.length === 1 ? found(hits[0]) : { reason: hits.length ? "ambiguous" : "missing" };
    }
    if (ref.unit) {
      const owner = resolveUnit(ref.unit);
      if (!owner.unit) return { reason: owner.gone ? "missing" : owner.reason };
      const inside = now.blocks.filter((block) => block.unit === owner.unit.id);
      if (ref.self) {
        const own = inside.find((block) => block.self === owner.unit.id);
        return own ? found(own) : { reason: "missing" };
      }
      const placed = inside.find((block) => samePath(block.path, ref.path, false));
      if (placed && samePath(placed.path, ref.path, true)) return found(placed); // the same field, whatever it says now
      // The structure around it changed: only its text can say which one it is. A unit whose text
      // parts its package says, as the page has it and holding no such block, changed in what the
      // package edits, not in the file.
      const hits = inside.filter((block) => inner(block) === ref.before);
      if (hits.length === 1) return found(hits[0]);
      return { reason: FILES[owner.unit.kind]?.textParts && !changedUnit(ref.unit, owner) ? "package" : "structure" };
    }
    if (Number.isInteger(ref.open) || ref.outside) {
      // Outside any unit (written beside a detail card's content): the one such block with that text.
      const hits = now.blocks.filter((block) => block.unit === null && block.kind !== "title" && inner(block) === ref.before);
      if (hits.length === 1) return found(hits[0]);
      const record = Number.isInteger(ref.open) ? open?.blocks[ref.open] : null;
      if (!record || hits.length > 1) return { reason: hits.length > 1 ? "ambiguous" : "missing" };
      const at = locate(opening, current, record);
      const same = at >= 0 ? now.blocks.find((block) => block.start === at) : null;
      if (same) return found(same);
      const other = at === -2 ? null : counterpart(opening, current, record, now.blocks.filter((block) => block.unit === null));
      return other ? found(other) : { reason: at === -2 ? "ambiguous" : "missing" };
    }
    return { reason: "invalid" };
  };
  const resolveBox = (ref) => {
    if (ref?.main) return now.boxes.find((box) => box.kind === "main") ?? null;
    // A box in no unit (the report's header, a detail card's content): by its kind and key.
    if (ref && !ref.unit && typeof ref.kind === "string") return now.boxes.find((box) => box.unit === null && box.kind === ref.kind && (box.key ?? null) === (ref.key ?? null)) ?? null;
    const owner = ref?.unit ? resolveUnit(ref.unit) : null;
    if (!owner?.unit) return null;
    return now.boxes.find((box) => box.unit === owner.unit.id && box.kind === ref.kind && (box.key ?? null) === (ref.key ?? null)) ?? null;
  };

  // Every unit the page names is one unit of the file, and no two are the same one: one found only
  // as the one most like it (`changed`) that another of the commit's names is found as too is not
  // (it is gone): two of the page's units acting on one of the file would write it twice.
  const named = [];
  const name = (ref) => {
    if (ref && typeof ref === "object" && (typeof ref.key === "number" || typeof ref.key === "string")) named.push(ref);
  };
  const nameIn = (node) => {
    if (node?.unit !== undefined) name(node.unit);
    if (node?.copy !== undefined) name(node.copy);
    if (Array.isArray(node?.children)) node.children.forEach(nameIn);
  };
  const namePlace = (place) => {
    name(place?.after);
    name(place?.before);
    name(place?.into?.unit);
  };
  for (const entry of texts) name(entry?.block?.unit);
  for (const op of units) {
    name(op?.unit);
    namePlace(op?.place);
    namePlace(op?.move);
    nameIn(op?.insert);
  }
  touch.forEach(name);
  const claims = new Map(); // unit of the file -> [{ key, changed }]
  for (const ref of named) {
    const found = resolveUnit(ref);
    if (found.unit) (claims.get(found.unit) ?? claims.set(found.unit, []).get(found.unit)).push({ key: ref.key, changed: Boolean(found.changed) });
  }
  for (const list of claims.values()) {
    if (new Set(list.map((claim) => claim.key)).size < 2) continue;
    for (const claim of list) if (claim.changed) resolvedUnits.set(claim.key, { gone: true });
  }

  // ---------- the commit as edits of the file now ----------
  const textStatus = new Map(); // key -> status entry
  const unitStatus = new Map();
  const refuse = (map, key, reason, extra = {}) => map.set(key, { key, status: "conflict", reason, ...extra });
  // Units whose change the commit refuses for someone else's change of them (`changed`), by the key of the
  // change: { unit, held } (`held`: of what a component wrote, the parts held back). The refusal says each as
  // the file holds it once this commit is written, which may move it or what holds it, and so indent it
  // otherwise (stateOf), where it has an id to be found by then: what the reader is shown, and what their
  // 仍然… sends back.
  const stated = new Map();
  // A unit as `text` holds it (`scanned`, its scan): its hash and its words, those of the units in it too
  // (`theirs`: a section deleted whole says what the Agent wrote in it), or of the parts `held`, their insides
  // (`theirs`) and their hashes (`parts`).
  const stateOf = (text, scanned, unit, held) => {
    const inside = (block) => {
      for (let at = block.unit; at !== null && at !== undefined; at = scanned.units[at]?.parent) if (at === unit.id) return true;
      return false;
    };
    if (!held) return { hash: unitHash(text, unit), theirs: scanned.blocks.filter(inside).map((block) => text.slice(block.innerStart, block.innerEnd)).join("\n") };
    const of = (values) => Object.fromEntries(held.filter((name) => typeof values?.[name] === "string").map((name) => [name, values[name]]));
    return { theirs: of(FILES[unit.kind]?.dataOf?.(text, unit.node, currentCatalog().packages) ?? {}), parts: of(unit.parts) };
  };
  const refuseChanged = (key, unit, held = null, extra = {}) => {
    stated.set(key, { unit, held });
    refuse(unitStatus, key, "changed", { ...stateOf(current, now, unit, held), ...extra });
  };
  const edits = [];
  const editKeys = new Map(); // block index -> page key
  for (const entry of texts) {
    const { key, block: ref } = entry ?? {};
    let parts = entry?.parts;
    const fresh = Array.isArray(parts) ? parts.filter((part) => !part?.keep) : [];
    if (fresh.some(madeBefore)) {
      fresh.forEach(noteMade);
      parts = parts.filter((part) => part?.keep || !madeBefore(part));
    }
    const found = resolveBlock(ref);
    if (!found.block) {
      // Gone, and the commit took it away (emptied, or replaced by the blocks it split into): done.
      if (found.reason === "missing" && Array.isArray(parts) && !parts.some((part) => part?.keep) && parts.every(madeBefore)) textStatus.set(key, { key, status: "applied" });
      else refuse(textStatus, key, found.reason);
      continue;
    }
    const mine = Array.isArray(parts) && parts.length === 1 && parts[0]?.keep && typeof parts[0].html === "string" ? parts[0].html : null;
    // The file has these very words already: the same commit, sent again (its answer was lost).
    if (found.changed && mine !== null && mine === inner(found.block)) textStatus.set(key, { key, status: "applied" });
    else if (found.changed) {
      // Someone else changed this text since the page's last commit: both changes, or a conflict.
      const both = mine === null ? null : mergeText(ref.before, mine, inner(found.block));
      if (both === null || checkParts(found.block, [{ keep: true, html: both }], current)) {
        refuse(textStatus, key, "changed", { theirs: inner(found.block) });
        continue;
      }
      parts = [{ keep: true, html: both }];
      textStatus.set(key, { key, status: "merged", html: both });
    } else textStatus.set(key, { key, status: "applied" });
    editKeys.set(found.block.id, key);
    edits.push({ id: found.block.id, parts });
  }

  const ops = [];
  const opKeys = new Map(); // unit index or insert key -> page keys
  const note = (index, key) => opKeys.set(index, [...(opKeys.get(index) ?? []), key]);
  const removed = {};
  const placeOf = (place) => {
    if (place?.into) {
      const box = resolveBox(place.into);
      return box ? { into: box.id } : null;
    }
    const after = Boolean(place?.after);
    const anchor = resolveUnit(after ? place.after : place?.before);
    return anchor?.unit ? { [after ? "after" : "before"]: anchor.unit.id } : null;
  };
  // The ids of the file and those the copies of this commit were given (copiedSource): two copies
  // of one card get prefixes of their own.
  let copyIds = null;
  const nodeOf = (node) => {
    if (node?.unit !== undefined) {
      const found = resolveUnit(node.unit);
      return found.unit ? { unit: found.unit.id, stood: node.stood } : null;
    }
    if (node?.restore !== undefined) {
      const { source, seal: given } = node.restore ?? {};
      if (!seal || typeof source !== "string" || given !== seal(source)) return null;
      const children = Array.isArray(node.children) ? node.children.map(nodeOf) : undefined;
      if (children?.includes(null)) return null;
      return { restore: source, key: node.key, blockId: node.blockId, stood: node.stood, ...(children ? { type: node.type, children } : {}) };
    }
    // A copy of a card or a table made on the page: written from the file's own
    // source of that unit, as it is now (its ids taken out but those it names itself, which take a
    // prefix of the copy's own; the keys of its charts drawn from tables the page gave it: `keys`),
    // as a unit put back is.
    if (node?.copy !== undefined) {
      const found = resolveUnit(node.copy);
      const keys = node.keys === undefined ? null : copyKeys(node.keys);
      if (node.keys !== undefined && !keys) return null;
      return found.unit && COPIED_AS_ITSELF.has(found.unit.kind) ? { restore: copiedSource(current, found.unit, { keys, taken: copyIds ??= new Set(idsOf(current)) }), key: node.key, blockId: node.blockId } : null;
    }
    if (!node || typeof node !== "object") return null;
    // A block the file writes whole from what its component holds to be so (`source`: an instance
    // from its manifest, whatever the page drew), its ids as a copy's, written as a unit put back is.
    // What it holds in boxes of its own goes apart (`children`, each in the box of the key `boxKeys`
    // gives at its index: an instance's slots), blocks made on the page as any, written in it once it is.
    const whole = FILES[node.type]?.source;
    if (whole) {
      const written = (text) => copiedSource(text, { start: 0, end: text.length }, { taken: copyIds ??= new Set(idsOf(current)) });
      const children = Array.isArray(node.children) ? node.children.map(nodeOf) : undefined;
      if (children?.includes(null)) return null;
      const restore = whole(node, { packages: currentCatalog().packages, written });
      return restore ? { restore, key: node.key, blockId: node.blockId, ...(children ? { type: node.type, children, boxKeys: node.boxKeys } : {}) } : null;
    }
    const children = Array.isArray(node.children) ? node.children.map(nodeOf) : undefined;
    if (children?.includes(null)) return null;
    return { ...node, ...(children ? { children } : {}) };
  };
  // Units this commit takes out of where they are (moved, or into a new block): a unit deleted
  // around one of them (or around it with what it takes along: a tab, its panel) is not deleted whole,
  // and its source comes back marked `around`.
  const leaving = new Set();
  const leavingFrom = (unit) => [...leaving].filter((other) => other !== unit && [unit, unit.companion].some((part) => part && part.start <= other.start && other.end <= part.end));
  const takes = (node) => {
    if (node?.unit !== undefined) {
      const found = resolveUnit(node.unit);
      if (found.unit) leaving.add(found.unit);
    } else if (Array.isArray(node?.children)) node.children.forEach(takes);
  };
  for (const op of units) {
    if (op?.move) takes({ unit: op.unit });
    else if (op?.insert) takes(op.insert);
  }
  // A container deleted that this commit leaves with nothing in it: what it holds all goes elsewhere or
  // is what the page says goes (`items`, as the page saw it), so whatever changed in it left with its
  // blocks (a section dissolved over the Agent's change to one), and it goes too, or it would stand empty.
  const hollow = (unit, items) => {
    const boxes = now.boxes.filter((box) => box.unit === unit.id);
    const named = new Map(items.map((ref) => [resolveUnit(ref).unit, ref]));
    const held = now.units.filter((child) => boxes.some((box) => box.id === child.box));
    return boxes.every((box) => box.pure) && held.length > 0 && held.every((child) => leaving.has(child) || (named.has(child) && !changedUnit(named.get(child), { unit: child })));
  };
  const placed = new Set(); // of those, the ones this commit puts somewhere (its move or insert taken)
  const placedIn = (node) => {
    if (node?.unit !== undefined) {
      const found = resolveUnit(node.unit);
      if (found.unit) placed.add(found.unit);
    } else if (Array.isArray(node?.children)) node.children.forEach(placedIn);
  };
  const removals = []; // [{ key, unit }]
  const keyedUnits = []; // the tables this commit gives the key a chart or a view reads them by (a view made from a menu: chart-keys.mjs)
  const actors = new Map(); // unit of the file -> the key of the page's unit acting on it
  const itemsOf = new Map(); // key of a list deleted item by item -> [{ unit, key }]: its items, the file's and the page's keys
  for (const op of units) {
    const key = op?.key;
    if (op?.insert && madeBefore(op.insert)) {
      noteMade({ ...op.insert, key: op.insert.key ?? key });
      unitStatus.set(key, { key, status: "applied" });
      continue;
    }
    if (op?.insert) {
      const node = nodeOf({ ...op.insert, key: op.insert.key ?? key });
      const place = placeOf(op.place);
      if (!node || !place) {
        refuse(unitStatus, key, !node && FILES[op.insert.type]?.source ? FILES[op.insert.type].unwritten(op.insert, { packages: currentCatalog().packages }) : "position");
        continue;
      }
      unitStatus.set(key, { key, status: "applied" });
      note(key, key);
      ops.push({ id: key, insert: node, place });
      placedIn(op.insert);
      continue;
    }
    let found = resolveUnit(op?.unit);
    // Done anyway (`force`), it is the unit as the card showed it: one the page's naming finds no more (no id,
    // and what stood around it changed) is the one unit of the file with the hash the refusal gave, before it
    // is taken for gone, where that can be no other block the page has: none it opened on said so (that one
    // stands there still, the card's own gone). One named by an id the file has no more is gone.
    if (op?.force === true && found.gone && typeof op.hash === "string" && typeof op.unit.id !== "string") {
      const record = Number.isInteger(op.unit.open) && op.unit.open >= 0 ? open?.units[op.unit.open] : undefined;
      const twin = !open || open.units.some((unit) => unit !== record && unitHash(opening, unit) === op.hash);
      found = twin ? { reason: "ambiguous" } : byOpening(-1, op.hash, false, [op.unit.blockId]);
      if (found.unit && !found.unit.blockId && typeof op.unit.blockId === "string") proposals.set(found.unit.id, op.unit.blockId);
      resolvedUnits.set(op.unit.key, found);
    }
    // What a component writes, of an instance named by an id the file has no more (a file written back from
    // what was read before the page gave it one): the one instance carrying no id the page knows whose parts
    // are all as the page says they are (`parts`), as the revert check finds it (revertedParts), which gets
    // its id again.
    if (op?.source && found.gone && typeof op.unit.id === "string" && op.parts && typeof op.parts === "object") {
      const named = Object.entries(op.parts).filter(([, hash]) => typeof hash === "string");
      const hits = named.length > 0 ? now.units.filter((unit) => unit.parts && !known.has(unit.blockId) && named.every(([name, hash]) => unit.parts[name] === hash)) : [];
      if (hits.length === 1) {
        found = { unit: hits[0] };
        if (!hits[0].blockId) proposals.set(hits[0].id, op.unit.id);
        resolvedUnits.set(op.unit.key, found);
        if (changedUnit(op.unit, found)) otherwise.add(op.unit.key);
      }
    }
    const sized = typeof op?.size === "string" || typeof op?.toggle === "string" || typeof op?.attribute === "string";
    const emptied = op?.remove === true && Array.isArray(op.items) && op.force !== true && Boolean(found.unit) && changedUnit(op.unit, found) && hollow(found.unit, op.items);
    // A container (a list, a quote) deleted that the file no longer has as the page saw it, the Agent
    // having added to it or changed what it holds: only what the page says it held goes (`items`), so
    // what the Agent wrote stays; an item the Agent changed is a conflict, as deleting it alone is.
    if (op?.remove === true && Array.isArray(op.items) && op.force !== true && !emptied && (found.gone || (found.unit && changedUnit(op.unit, found)))) {
      const held = op.items.map((ref) => ({ ref, found: resolveUnit(ref) }));
      const unclear = held.find((item) => !item.found.unit && !item.found.gone);
      const here = held.filter((item) => item.found.unit && !leaving.has(item.found.unit));
      if (unclear) refuse(unitStatus, key, unclear.found.reason);
      else if (here.some((item) => changedUnit(item.ref, item.found))) {
        if (found.unit) refuseChanged(key, found.unit);
        else refuse(unitStatus, key, "changed");
      }
      else if (here.some((item) => actors.has(item.found.unit))) refuse(unitStatus, key, "ambiguous");
      else {
        unitStatus.set(key, { key, status: "applied" });
        itemsOf.set(key, here.map(({ ref, found: item }) => ({ unit: item.unit.id, key: ref.key })));
        for (const { ref, found: item } of here) {
          actors.set(item.unit, ref.key);
          note(item.unit.id, key);
          ops.push({ id: item.unit.id, remove: true });
        }
      }
      continue;
    }
    if (!found.unit) {
      // A unit the file no longer has: deleting it (or resizing it) is done already; anything else
      // of it is for the reader to decide.
      if (found.gone && (op?.remove === true || sized)) unitStatus.set(key, { key, status: "applied" });
      else refuse(unitStatus, key, found.gone ? "missing" : found.reason);
      continue;
    }
    if (op.replace && converted(found.unit, op.replace)) {
      unitStatus.set(key, { key, status: "applied" });
      continue;
    }
    // What a component wrote, by a manifest that is not the package's now, or of none now: refused
    // before all else, as nothing of the page's reading of it holds, and the page is shown again.
    if (op.source) {
      const definition = FILES[found.unit.kind]?.definition?.(found.unit.node, currentCatalog().packages);
      if (typeof definition !== "string" || definition !== op.definition) {
        refuse(unitStatus, key, "definition");
        continue;
      }
    }
    // A table's operation is no way round that: what is written by a manifest goes as `source` alone.
    if (op.table && FILES[found.unit.kind]?.definition) {
      refuse(unitStatus, key, "invalid");
      continue;
    }
    // What a component wrote goes in where each part it writes is as the page last had it from the file
    // (`parts`: the hashes the scan gives of them), whatever else of the unit someone else changed (the
    // words of a text part, another part, what stands around them): writes that do not overlap both land,
    // as words in two cells of a table do. The parts one edit wrote together (`together`) go or wait
    // together, each other part by itself: what goes is written, and the rest is the conflict `changed`,
    // which says what the file holds of the parts it holds back (`theirs`, by name, and their hashes,
    // `parts`) and which went in (`wrote`). A unit found only by what stands around it and what it says
    // (one with no id yet, most like the one the page named) may be another block where that one stood:
    // its parts are no one's the page saw, so nothing of the write goes there by them. The reader's
    // 仍然调整 (`force`) writes over each part as it was shown to them, those hashes being what the page
    // says it held, and over nothing written since.
    let source = op.source;
    if (op.source && typeof op.source === "object" && (op.force === true || changedUnit(op.unit, found))) {
      const seen = op.force === true || !found.changed;
      const fits = (group) => seen && group.every((name) => typeof op.parts?.[name] === "string" && op.parts[name] === found.unit.parts?.[name]);
      const groups = writeGroups(op.source, op.together);
      const going = groups.filter(fits).flat();
      const waiting = groups.filter((group) => !fits(group)).flat();
      if (waiting.length > 0) {
        refuseChanged(key, found.unit, waiting, going.length > 0 ? { wrote: going } : {});
        if (going.length === 0) continue;
        source = Object.fromEntries(going.map((name) => [name, op.source[name]]));
      }
    } else if ((op.remove === true || op.replace || op.table) && !emptied && (op.force === true ? hashOfUnit(found.unit) !== op.hash : changedUnit(op.unit, found))) {
      // Refused, it says the unit's hash as the file has it, which is what the reader is shown: told to do
      // it anyway (`force`), the page sends it back as the operation's `hash`, and it goes in where the
      // file still has that, over nothing written since.
      refuseChanged(key, found.unit);
      continue;
    }
    const partly = source !== op.source; // some of what its component wrote waits: the conflict stands
    // One of the page's units acts on a unit of the file, never two (it would be written twice).
    if (actors.has(found.unit) && actors.get(found.unit) !== op.unit.key) {
      refuse(unitStatus, key, "ambiguous");
      continue;
    }
    actors.set(found.unit, op.unit.key);
    let change = null;
    if (op.remove === true) {
      change = { remove: true };
      const { unit } = found;
      const source = unit.companion ? tabSource(current, unit) : reindent(current.slice(unit.start, unit.end), lineIndent(current, unit.start), ""); // a tab with its panel
      removed[key] = { source, seal: seal ? seal(source) : null, ...(leavingFrom(unit).length > 0 ? { around: true } : {}) };
    } else if (op.move) {
      const place = placeOf(op.move);
      if (!place) {
        refuse(unitStatus, key, "position");
        continue;
      }
      change = { move: place, stood: op.stood };
    } else if (op.replace) change = { replace: op.replace };
    else if (typeof op.retag === "string") change = { retag: op.retag };
    else if (op.table && typeof op.table === "object") change = { table: op.table };
    else if (source && typeof source === "object") change = { source };
    else if (typeof op.toggle === "string") change = { toggle: op.toggle, on: op.on };
    else if (typeof op.size === "string") change = { size: op.size, value: op.value };
    else if (typeof op.attribute === "string") change = { attribute: op.attribute, value: op.value };
    if (!change) {
      refuse(unitStatus, key, "unknown");
      continue;
    }
    if (!partly) unitStatus.set(key, { key, status: "applied" });
    note(found.unit.id, key);
    ops.push({ id: found.unit.id, ...change });
    if (change.attribute === CHART_SOURCE && typeof change.value === "string") keyedUnits.push(found.unit);
    if (change.move) placed.add(found.unit);
    if (change.remove) removals.push({ key, unit: found.unit });
  }
  // A unit deleted while blocks in it go elsewhere (a section dissolved) is deleted only when every
  // one of them does: one this commit could not place (its neighbour gone) would go with it.
  for (const { key, unit } of removals) {
    if (leavingFrom(unit).every((other) => placed.has(other))) continue;
    refuse(unitStatus, key, "position");
    delete removed[key];
    ops.splice(ops.findIndex((op) => op.id === unit.id && op.remove), 1);
  }

  const touched = [...new Set(touch.map(resolveUnit).filter((found) => found.unit).map((found) => found.unit.id))];
  const result = applyEdits({ current, edits, units: ops, partial: true, ids, touch: touched, proposals });
  // The keys of tables in the blocks it made and on the tables it keyed (a view made from a menu), as the rest of the file has them.
  const assignedAt = new Map((result.ids?.assigned ?? []).map(({ at, id }) => [at, id]));
  const keyedTables = new Set(keyedUnits.map((unit) => unit.blockId ?? assignedAt.get(unit.at)).filter(Boolean));
  const relinked = relinkMade(result.text, new Set((result.ids?.created ?? []).map(({ id }) => id)), keyedTables);
  result.text = relinked.text;
  const refusedUnits = new Set();
  for (const conflict of result.conflicts ?? []) {
    if (conflict.id !== undefined && editKeys.has(conflict.id)) refuse(textStatus, editKeys.get(conflict.id), conflict.reason);
    if (conflict.unit !== undefined) refusedUnits.add(conflict.unit);
    for (const key of opKeys.get(conflict.unit) ?? []) {
      refuse(unitStatus, key, conflict.reason);
      delete removed[key];
    }
  }
  // A list deleted item by item of which the file refused some (an item something else refers to) and took the
  // others out: the conflict names those that went (`went`, the page's keys of them), the review's baseline
  // taking them out too (changes.mjs rebaseOnto).
  for (const [key, items] of itemsOf) {
    const went = items.filter((item) => !refusedUnits.has(item.unit)).map((item) => item.key);
    if (unitStatus.get(key)?.status === "conflict" && went.length > 0) unitStatus.get(key).went = went;
  }

  // ---------- what the page learns ----------
  result.text = slotsEmptied(now, result.text);
  const after = scan(result.text);
  // The ids the file has for the units the page named (by the key it named each by), and for the
  // blocks it made or put back (by the key it made each under).
  const unitIds = new Map();
  const byAt = new Map(result.ids.assigned.map(({ at, id }) => [at, id]));
  for (const [key, found] of resolvedUnits) {
    const id = found.unit ? found.unit.blockId ?? byAt.get(found.unit.at) : null;
    if (id) unitIds.set(key, id);
  }
  // What a refusal `changed` says of its unit, as the file holds it now (stated).
  for (const [key, { unit, held }] of stated) {
    const id = unit.blockId ?? byAt.get(unit.at);
    const found = id ? after.units.filter((other) => other.blockId === id) : [];
    if (found.length === 1 && unitStatus.get(key)?.reason === "changed") Object.assign(unitStatus.get(key), stateOf(result.text, after, found[0], held));
  }
  const madeIds = new Map([...already, ...result.ids.created].map(({ key, id }) => [key, id]));
  const allIds = new Set([...unitIds.values(), ...madeIds.values()]);
  const standing = new Set(after.units.map((unit) => unit.blockId).filter(Boolean));
  const gone = [...allIds].filter((id) => !standing.has(id));
  // A unit's hash is what the page compares with when it deletes or converts it: given for those the
  // file had as the page last saw them, not for one someone else changed meanwhile (the page goes
  // on with the hash it saw, so deleting or converting it asks the reader first). So it is of each block
  // the commit made or put back, by the key it was made under, but of one that holds or copies a unit the
  // file had otherwise: someone else's change is in it, which the page does not show.
  const hashOut = new Map();
  const shellOut = new Map(); // and what each is besides its words (unitShell), by the same keys: what the page's pull compares
  const theirsIn = new Map(); // made key -> whether it holds or copies such a unit
  const visit = (node) => {
    const inner = Array.isArray(node?.children) ? node.children.map(visit).some(Boolean) : false;
    const holds = inner || [node?.unit, node?.copy].some((ref) => ref !== undefined && otherwise.has(ref?.key));
    if (node?.key !== undefined) theirsIn.set(node.key, holds);
    return holds;
  };
  for (const op of units) if (op?.insert) visit({ ...op.insert, key: op.insert.key ?? op.key });
  for (const [key, id] of [...unitIds, ...[...madeIds].filter(([made]) => theirsIn.get(made) !== true)]) {
    if (otherwise.has(key)) continue;
    const unit = after.units.filter((other) => other.blockId === id);
    if (unit.length !== 1) continue;
    hashOut.set(key, unitHash(result.text, unit[0]));
    shellOut.set(key, unitShell(result.text, unit[0], after));
  }
  // The keyed blocks the commit made (known by their id, not by a block id: a detail card), written
  // now or already there (sent again).
  const keyed = units.filter((op) => BLOCK_TYPES[op?.insert?.type]?.keyed && typeof op.insert.id === "string" && unitStatus.get(op.key)?.status === "applied")
    .map((op) => ({ key: op.insert.id, box: BLOCK_TYPES[op.insert.type].box }));
  return {
    text: result.text,
    version: hashOf(result.text),
    texts: [...textStatus.values()],
    units: [...unitStatus.values()],
    ids: Object.fromEntries(unitIds),
    made: Object.fromEntries(madeIds),
    hashes: Object.fromEntries(hashOut),
    shells: Object.fromEntries(shellOut),
    frame: frameShell(result.text, after),
    removed,
    gone,
    file: fileFacts(result.text, after, allIds, new Set(madeIds.values())),
    outside: outsideFacts(result.text, after),
    keyed: keyedFacts(result.text, after, keyed),
    ...(Object.keys(relinked.keys).length > 0 ? { chartKeys: relinked.keys } : {}),
    ...(result.title ? { title: result.title } : {}),
    ...(result.icon !== undefined ? { icon: result.icon } : {}), // the page's icon made or taken away
  };
}

/**
 * The parts a component's write names (`source`, by name) in the groups it goes or waits by: those one
 * edit wrote together as the page says (`together`, lists of names; two that share a part are one), and
 * each other part by itself.
 */
function writeGroups(source, together) {
  const groups = [];
  for (const listed of [...(Array.isArray(together) ? together : []), ...Object.keys(source).map((name) => [name])]) {
    const names = Array.isArray(listed) ? listed.filter((name) => typeof name === "string" && Object.hasOwn(source, name)) : [];
    const joined = groups.filter((group) => names.some((name) => group.includes(name)));
    if (names.length === 0) continue;
    for (const group of joined) groups.splice(groups.indexOf(group), 1);
    groups.push([...new Set([...joined.flat(), ...names])]);
  }
  return groups;
}

/**
 * What the file says, after a commit, of the keyed blocks it made (`keyed`: their ids and the kind
 * of box each holds its blocks in), by id. A keyed block (a detail card) is no unit (the file knows
 * it by its id, and it carries no block id), so `fileFacts` says nothing of it: the units of its
 * content, by id (or { hash } for one without), which the page takes in as a block of the file.
 */
function keyedFacts(source, scanned, keyed) {
  const facts = {};
  for (const { key, box: kind } of keyed) {
    const box = scanned.boxes.find((other) => other.kind === kind && other.key === key);
    if (!box) continue;
    facts[key] = { units: scanned.units.filter((child) => child.box === box.id).map((child) => child.blockId ?? { hash: unitHash(source, child) }) };
  }
  return facts;
}

/**
 * What the file says, after a commit, of the text blocks outside any unit (the report's title, one
 * written beside a detail card's content): their texts, by key (shared/ids.mjs outsideKey: "title"
 * for the report's, else "id:" and the element's own id). As `fileFacts` is for the blocks of units,
 * so this is for these: what the page takes as the text each starts from, never what it sent.
 */
function outsideFacts(source, scanned) {
  const facts = {};
  for (const block of scanned.blocks) {
    const key = block.unit === null ? outsideKey(block.kind === "title", attr(block.node, "id")) : null;
    if (key) facts[key] = source.slice(block.innerStart, block.innerEnd);
  }
  return facts;
}

/**
 * What the file says, after a commit, of the units the page named or made (`ids`: the ids they
 * carry; `made`: those it wrote whole, a block made or put back, whose units inside count too), by
 * id: each one's kind, hash, shell (unitShell), what refers to it (keep) and whether it has a grid (a table the page's
 * tools are for: `grid`), the unit around it (by its id; "" when
 * that one has none), its boxes (kind, key, and the units in each: by id, or { hash } for one
 * without) and its text blocks' texts ({ self } or { path }, kind, caps, inner, and atoms: where its
 * formulas are in it), and of one it wrote whole whose component writes parts of it, `markup`: all of it
 * as the file holds it, what the page compares those with. The page takes this in as it is (commit.mjs):
 * what it knows of the file comes from the file, never from what it sent.
 */
function fileFacts(source, scanned, ids, made) {
  const counts = new Map();
  for (const unit of scanned.units) if (unit.blockId) counts.set(unit.blockId, (counts.get(unit.blockId) ?? 0) + 1);
  const within = (unit) => {
    for (let at = unit.parent; at !== null && at !== undefined; at = scanned.units[at].parent) if (made.has(scanned.units[at].blockId)) return true;
    return false;
  };
  const facts = {};
  for (const unit of scanned.units) {
    if (!unit.blockId || counts.get(unit.blockId) !== 1 || !(ids.has(unit.blockId) || within(unit))) continue;
    const parent = unit.parent === null ? null : scanned.units[unit.parent];
    facts[unit.blockId] = {
      kind: unit.kind,
      hash: unitHash(source, unit),
      shell: unitShell(source, unit, scanned),
      keep: unit.keep ?? null,
      ...(unit.grid ? { grid: true } : {}),
      ...(unit.parts ? { parts: unit.parts } : {}),
      parent: parent ? parent.blockId ?? "" : null,
      boxes: scanned.boxes.filter((box) => box.unit === unit.id).map((box) => ({
        kind: box.kind,
        key: box.key,
        units: scanned.units.filter((child) => child.box === box.id).map((child) => child.blockId ?? { hash: unitHash(source, child) }),
      })),
      blocks: scanned.blocks.filter((block) => block.unit === unit.id).map((block) => ({
        ...(block.self !== null ? { self: true } : { path: block.path }),
        kind: block.kind,
        caps: Object.keys(block.caps),
        inner: source.slice(block.innerStart, block.innerEnd),
        ...(block.atoms.length > 0 ? { atoms: block.atoms } : {}),
      })),
      ...(FILES[unit.kind]?.definition && (made.has(unit.blockId) || within(unit)) ? { markup: source.slice(unit.elStart, unit.end) } : {}),
    };
  }
  return facts;
}

/**
 * Blocks the page made or moved and committed that the file now has as before (an Agent writing the
 * file from a version it read earlier): units [{ key, id, parent, from, between }], each by the file's id
 * it has, with the id of the unit it is in as the commit left it (`parent`: null for none), for one the
 * page moved, as it was before (`from`, undefined for one it made), the units before and after it in its box
 * as the page has them (`between`: [before, after], each side the nearest first, a few, each { id, hash } as
 * the page knows it, false for one it knows neither of, then null where the box's start or end comes:
 * replacedHere) and the units the page shows inside it, by id, or { hash } for one the file gives none
 * (`holds`, none for one holding none). Returns
 * [{ key, gone: true }] for those the file no longer has and [{ key, moved: true }] for those back in the
 * unit they were in before; one the file moved anywhere else is someone else's choice and not listed. One
 * the file no longer has where the write put blocks new to the page in its place (`replacedHere`) is the
 * writer's replacement of it (an Agent asked to put a picture in place of a paragraph the reader wrote), not
 * listed either, nor one that stood inside it, unless the same write put back anything else of the page's
 * (`alone` false: a text or a component's part put back, which revertCheck says; or a block moved back): a
 * write from an earlier read. New to the page: none of the page's units (`pageIds`, the ids of those it
 * shows) or of those it took out (`taken`, named as `holds` names them).
 */
export function revertedUnits({ current, units = [], alone = true, pageIds = null, taken = [] }) {
  const scanned = scan(current);
  const out = [];
  const gone = new Map(); // the file's id of each the file no longer has -> where the page had it (`between`)
  for (const entry of units) {
    if (typeof entry?.id !== "string" || (typeof entry.key !== "string" && typeof entry.key !== "number")) continue;
    const hits = scanned.units.filter((unit) => unit.blockId === entry.id);
    if (hits.length === 0) {
      out.push({ key: entry.key, gone: true, entry });
      gone.set(entry.id, entry.between);
      continue;
    }
    if (hits.length > 1 || entry.from === undefined || entry.from === entry.parent || entry.from === "" || entry.parent === "") continue;
    const parent = hits[0].parent === null ? null : scanned.units[hits[0].parent].blockId ?? "";
    if (parent === entry.from) out.push({ key: entry.key, moved: true });
  }
  // Replaced, and so is what stood inside one replaced (its `parent` one of them): it went with it.
  const replaced = new Set();
  if (alone && !out.some((entry) => entry.moved)) {
    const here = replacedHere(current, scanned, gone, { ids: new Set(Array.isArray(pageIds) ? pageIds.filter((id) => typeof id === "string") : []), taken: Array.isArray(taken) ? taken : [] });
    const went = out.filter((answer) => answer.gone).map((answer) => answer.entry);
    for (const entry of went) if (here(entry)) replaced.add(entry.id);
    for (let grown = replaced.size > 0; grown;) {
      grown = false;
      for (const entry of went) {
        if (replaced.has(entry.id) || typeof entry.parent !== "string" || !replaced.has(entry.parent)) continue;
        replaced.add(entry.id);
        grown = true;
      }
    }
  }
  return out.filter((answer) => !answer.gone || !replaced.has(answer.entry.id)).map(({ entry, ...answer }) => answer);
}

/**
 * Whether the file holds blocks where a unit stood that it no longer has, by where the page had it
 * (`between`, revertedUnits: on each side the units nearest it first, a few, then null where the box's start
 * or end comes; each { id, hash } as the page knows it, or one ref alone as an earlier page named it): the
 * nearest unit on each side the file still has found in it once (by its id; by the hash the page knows of
 * one the file gives no id, so one the write changed is not found), in one box of the unit it stood in
 * (`parent`) and in that order (from the box's start, or to its end, where it stood first or last), and at
 * least one unit standing between them, each new to the page (`known`: not of the ids of the page's units,
 * `ids`, nor one it took out, `taken`, nor one it held, `holds`): what a write from an earlier read leaves
 * where the reader's block stands is what stood there before, a paragraph the reader deleted and wrote anew,
 * the blocks of a container the reader made around them (a section an undo put back), and no telling a block
 * the page shows elsewhere moved there from that. One beside it the file has by neither its id nor the words
 * the page knows of it is one the write took out with it, stepped over (a picture in place of the reader's
 * paragraph and the one after it), and so is one of the page's own the write took out too (`gone`: id ->
 * between), from where that one stood: a run of blocks the write took out together is one place. But one the
 * file has without the id the page knows it by, its words the same, says the write is from before the commit
 * that named it (a block made on the page names those beside it: commit.mjs touchBeside), an earlier read's:
 * nothing tells its place. Not where it stood alone in its box, or a unit beside it is not found once:
 * nothing tells its place, and it is put back as before.
 */
function replacedHere(current, scanned, gone, known) {
  let hashes = null;
  const hashOfUnit = (index) => (hashes ??= scanned.units.map((each) => unitHash(current, each)))[index];
  const isOneOf = (unit, refs) => refs.some((ref) => typeof ref === "string" ? unit.blockId === ref : typeof ref?.hash === "string" && hashOfUnit(unit.id) === ref.hash);
  // The unit beside it on one side (0 before, 1 after): the nearest the file still has, null for the box's
  // start or end, undefined where that cannot be told.
  const anchor = (refs, side, steps = 0) => {
    for (const ref of Array.isArray(refs) ? refs : [refs]) {
      if (ref === null) return null;
      const { id, hash } = typeof ref === "string" ? { id: ref } : ref && typeof ref === "object" ? ref : {};
      if (typeof id === "string") {
        const hits = scanned.units.filter((unit) => unit.blockId === id);
        if (hits.length > 0) return hits.length === 1 ? hits[0] : undefined;
        if (gone.has(id)) return steps < gone.size ? anchor(gone.get(id)?.[side], side, steps + 1) : undefined;
        if (typeof hash !== "string" || scanned.units.some((unit) => hashOfUnit(unit.id) === hash)) return undefined;
        continue;
      }
      if (typeof hash !== "string") return undefined;
      const hits = scanned.units.filter((unit) => hashOfUnit(unit.id) === hash);
      return hits.length === 1 ? hits[0] : undefined;
    }
    return undefined;
  };
  return ({ between, holds, parent }) => {
    if (!Array.isArray(between) || between.length !== 2) return false;
    const [first, last] = [anchor(between[0], 0), anchor(between[1], 1)];
    if (first === undefined || last === undefined || (first === null && last === null) || (first && last && first.box !== last.box)) return false;
    // In the unit it stood in (its `parent`), as the page had it.
    const owner = (first ?? last).parent === null ? null : scanned.units[(first ?? last).parent].blockId ?? "";
    if (owner !== (parent ?? null)) return false;
    const inBox = scanned.units.filter((unit) => unit.box === (first ?? last).box);
    const standing = inBox.slice(first ? inBox.indexOf(first) + 1 : 0, last ? inBox.indexOf(last) : inBox.length);
    const old = [...known.taken, ...(Array.isArray(holds) ? holds : [])];
    return standing.length > 0 && !standing.some((unit) => (unit.blockId !== null && known.ids.has(unit.blockId)) || isOneOf(unit, old));
  };
}

/**
 * The revert check (POST /__gallery/edit/reverted): of what the page committed, made, moved and its
 * components wrote, what someone else's write put back (revertedTexts, revertedUnits, revertedParts),
 * answered together, since a block taken out and replaced is the writer's own change only where that write
 * put back nothing else of the page's. `taken`: the units the page took out (revertedUnits). Returns
 * { reverted, units, parts }.
 */
export function revertCheck({ current, opening = null, texts = [], units = [], instances = [], pageIds = null, taken = [] }) {
  const reverted = revertedTexts({ current, opening, texts, pageIds });
  const parts = revertedParts({ current, instances, pageIds });
  return { reverted, units: revertedUnits({ current, units, alone: reverted.length === 0 && parts.length === 0, pageIds, taken }), parts };
}

/**
 * Parts of instances that the page's components wrote and the file now holds as before (an Agent
 * writing the whole file from a version it read earlier): instances [{ key, id, parts }], each by the
 * file's id it has, `parts` by name { before, after }: every hash the part had in the file as the page
 * wrote it but the one it has now, and that one (the last of its writes left it so). One whose id the
 * write dropped (a file read before the page gave the instance one, as it gives every block an Agent
 * writes with none) is the one instance of the file carrying no id the page knows its blocks by
 * (`pageIds`) that holds a part as one of those befores, or none. Returns [{ key, parts, markup }] for
 * those with a part the file holds as one of `before` and not as `after`, `parts` the hashes it holds
 * of each, by name, and `markup` all of the instance as the file holds it, which the page reads as its
 * component does. A part it holds in some other way (theirs merged with the page's, or written again
 * since) is someone else's choice, and an instance it no longer has is not listed: one the page made or
 * moved is a block put back (revertedUnits), any other the writer's deletion.
 */
export function revertedParts({ current, instances = [], pageIds = null }) {
  const scanned = scan(current);
  const known = new Set(Array.isArray(pageIds) ? pageIds.filter((id) => typeof id === "string") : []);
  const out = [];
  for (const entry of instances) {
    if (typeof entry?.id !== "string" || (typeof entry.key !== "string" && typeof entry.key !== "number") || !entry.parts || typeof entry.parts !== "object") continue;
    const back = (unit) => Object.entries(entry.parts).filter(([name, part]) => typeof unit.parts?.[name] === "string" && unit.parts[name] !== part?.after && Array.isArray(part?.before) && part.before.includes(unit.parts[name]));
    const hits = scanned.units.filter((unit) => unit.blockId === entry.id);
    const unnamed = hits.length === 0 ? scanned.units.filter((unit) => unit.parts && !known.has(unit.blockId) && back(unit).length > 0) : [];
    const found = hits.length === 1 ? hits[0] : unnamed.length === 1 ? unnamed[0] : null;
    const parts = found ? back(found) : [];
    if (parts.length > 0) out.push({ key: entry.key, parts: Object.fromEntries(parts.map(([name]) => [name, found.parts[name]])), markup: current.slice(found.elStart, found.end) });
  }
  return out;
}

/**
 * Texts the page committed that the file now has as they were before (an Agent writing the whole
 * file from a version it read earlier): texts [{ key, block, original, earlier }], each block named
 * as in commitEdits with `before` the text the page committed, `original` the one it replaced and
 * `earlier` those its commits left it as between (none: none; a text the page committed back as it was
 * first is `original` again, and asked of those alone). Returns the keys of those the file has as
 * `original` or one of `earlier` again, and not as `before`, [{ key, theirs }]; a text the file changed
 * in some other way, or no longer has, is someone else's choice and not listed. Two that name one block
 * (a page naming it as two of its loads did) are asked of one by one. `pageIds`: the ids of the page's
 * blocks (commitEdits).
 */
export function revertedTexts({ current, opening = null, texts = [], pageIds = null }) {
  const entries = texts.filter((entry) => typeof entry?.block?.before === "string" && typeof entry.original === "string")
    .map((entry) => ({ entry, was: new Set([entry.original, ...(Array.isArray(entry.earlier) ? entry.earlier.filter((text) => typeof text === "string") : [])].filter((text) => text !== entry.block.before)) }))
    .filter(({ was }) => was.size > 0);
  const ask = (list) => commitEdits({ current, opening, ids: false, pageIds, texts: list.map(({ entry: { key, block } }) => ({ key, block, parts: [{ keep: true, html: block.before }] })) }).texts;
  const first = ask(entries);
  const overlapping = new Set(first.filter((entry) => entry.reason === "overlap").map((entry) => entry.key));
  const answers = [...first.filter((entry) => !overlapping.has(entry.key)), ...entries.filter(({ entry }) => overlapping.has(entry.key)).flatMap((one) => ask([one]))];
  const before = new Map(entries.map(({ entry, was }) => [entry.key, was]));
  return answers.filter((entry) => entry.status === "merged" && before.get(entry.key)?.has(entry.html)).map(({ key, html }) => ({ key, theirs: html }));
}
