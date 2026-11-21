// What is folded in the outline, kept for each report (localStorage, so the page the workbench shows
// again after an Agent's write, which is a new page, folds what the reader folded): a node's key (a
// heading's block id, a tab's area and tab), the reports folded last kept and the oldest let go. The
// headings folded on the page (fold/) are kept the same way under a key of their own (`key`).

import { documentKey } from "../../../shared/workspace-address.mjs";
import { KEYS } from "../../../shared/renamed-storage.mjs";

export const FOLDS_KEY = KEYS.outlineFolds;
const KEEP = 100; // reports

function read(storage, key) {
  try {
    const value = JSON.parse(storage.get(key) ?? "null");
    if (value && typeof value === "object" && value.folds && typeof value.folds === "object") return value;
  } catch {}
  return { folds: {} };
}

/** The keys folded in report `slug` (`storage`: { get, set }, page/storage.mjs), kept under `key`. */
export function foldsOf(storage, slug, key = FOLDS_KEY) {
  slug = documentKey(slug);
  const keys = read(storage, key).folds[slug];
  return new Set(Array.isArray(keys) ? keys.filter((key) => typeof key === "string") : []);
}

/**
 * Keep `folded` for report `slug`: only the keys the page still has (`present`), the report the one
 * folded last; none folded forgets the report. At most KEEP reports, the oldest going first.
 */
export function keepFolds(storage, slug, folded, present = null, key = FOLDS_KEY) {
  slug = documentKey(slug);
  const value = read(storage, key);
  const keys = [...folded].filter((each) => !present || present.has(each));
  delete value.folds[slug]; // put back last: the report folded last
  if (keys.length) value.folds[slug] = keys;
  const slugs = Object.keys(value.folds);
  for (const old of slugs.slice(0, Math.max(0, slugs.length - KEEP))) delete value.folds[old];
  storage.set(key, JSON.stringify(value));
}

/**
 * A fold carried to the key its node has now (`moves`: [[before, after]], a node's key last read and
 * now): a heading with no block id is keyed by its text (read.mjs), which changes as it is typed in
 * and when a save gives it its id. Returns whether any fold moved (to be kept again).
 */
export function carryFolds(folded, moves) {
  let moved = false;
  for (const [before, after] of moves) {
    if (before === after || !folded.has(before) || folded.has(after)) continue;
    folded.delete(before);
    folded.add(after);
    moved = true;
  }
  return moved;
}
