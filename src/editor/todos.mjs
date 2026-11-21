import { fileVersion, todosOf } from "../shared/todos.mjs";
import { todoRef } from "../shared/workspace-query.mjs";
import { scan } from "./source/blocks.mjs";
import { unitHash } from "./source/units.mjs";

// A to-do of a document checked from another page (workspace.setTodo: docs/editor.md
// "To-dos checked from another page"): where each item a write names stands in the document's text as its
// pages see it, and the commit that checks it, one attribute op each (data-checked, as the page's own
// check commits it: components/list), which the edit service applies through handleCommit as the reader's
// edit (./service.mjs setTodos). An item is found by its block id; one without an id, while the file is
// still the version the facts read it from (its ref's `version`), by its place among the items of the
// same words under the same headings (`nth`); in a file changed since, as the one item of its words
// under its headings, several of them refused (ambiguous). One whose words are not the ref's any more, or
// that is gone, is refused (changed: the conflict, which the block reads again after); one that is there
// as read but that no block of the editor holds (a list in a table cell, in a block of the document's own)
// is refused as locked: the document's own page cannot check it either. The commit names
// an item by its id, or, without one, by what it says in this text (the snapshot it is applied to as its
// opening version), and gets the id the commit gives every unit it touches (its touch).

const samePath = (a, b) => a.length === b.length && a.every((step, index) => step === b[index]);

/**
 * Where each of `items` ([{ ref, done }]) of document `slug` stands in `text` (its page's HTML, as its
 * pages see it) of a file of `source`: [{ unit (source/blocks.mjs scan's), done (now), want } | { reason }],
 * in their order; a ref of another document, or none, is "ref".
 */
export function locateTodos(slug, source, text, items) {
  const version = fileVersion(source);
  const todos = todosOf(text, { at: true });
  let units = null;
  const unitAt = (at) => (units ??= scan(text).units).find((unit) => unit.elStart === at) ?? null; // the unit its <li> is
  return items.map((item) => {
    const ref = todoRef(item?.ref);
    if (!ref || ref.slug !== slug || typeof item.done !== "boolean") return { reason: "ref" };
    let todo = ref.block ? todos.find((one) => one.block === ref.block) ?? null : null;
    if (todo && todo.text !== ref.text) return { reason: "changed" };
    if (!todo) {
      const same = todos.filter((one) => one.text === ref.text && samePath(one.path, ref.path));
      if (ref.version === version) todo = same.find((one) => one.nth === ref.nth) ?? null;
      else if (same.length > 1) return { reason: "ambiguous" };
      else todo = same[0] ?? null;
    }
    if (!todo) return { reason: "changed" };
    // The item is there as read, but no block of the editor is its <li> (a list in a table cell, in a block of
    // the document's own, in a package's region): the document's pages cannot check it either.
    const unit = unitAt(todo.at);
    return unit ? { unit, done: todo.done, want: item.done } : { reason: "locked" };
  });
}

/**
 * The commit of the items found (`spots`, locateTodos', those with a unit) that change what the file says,
 * the last asked of an item winning: { units, touch, keys } for commitEdits (`opening`: this `text`, so
 * that an item without an id is named by what it was in it), `keys` each unit's op key, or null where none
 * changes anything; and, for each spot, whether it changed what stood before it (the file's state, or the
 * item asked before it in this write).
 */
export function todoCommit(text, spots) {
  const now = new Map(); // a unit's id -> whether it is checked, as the items so far leave it
  const changed = spots.map((spot) => {
    if (!spot.unit) return false;
    const before = now.has(spot.unit.id) ? now.get(spot.unit.id) : spot.done;
    now.set(spot.unit.id, spot.want);
    return before !== spot.want;
  });
  const writes = new Map();
  for (const spot of spots) if (spot.unit && now.get(spot.unit.id) !== spot.done) writes.set(spot.unit.id, spot);
  if (writes.size === 0) return { commit: null, changed };
  const units = [];
  const touch = [];
  const keys = new Map();
  for (const [id, spot] of writes) {
    const key = `todo${units.length}`;
    const ref = spot.unit.blockId ? { key, id: spot.unit.blockId } : { key, open: id, hash: unitHash(text, spot.unit) };
    units.push({ key, unit: ref, attribute: "data-checked", value: now.get(id) ? "" : null });
    touch.push(ref);
    keys.set(id, key);
  }
  return { commit: { units, touch, keys }, changed };
}
