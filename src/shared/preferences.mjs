import { documentKey } from "./workspace-address.mjs";
// The reader's preferences of Gallery's UI (the workbench's 设置): switches (and a width) kept in localStorage,
// which the workbench and every report page share (one origin), so the page editor follows a change
// at once (the storage event reaches every other page of the origin). Each has its default (off, but for
// showChanges and its two below, and historyChanges) until changed.
//   editFrame     显示编辑框: the dashed frame around the text being edited (editor/page/frame.mjs)
//   quietNotices  减少通知: the notices of everyday operations (what was just done, how to go on) are not
//                 shown, only what the reader must act on or would not know otherwise (editor/page/quiet.mjs)
//   showChanges   显示变更: what an Agent wrote marked on the page, with the bar to keep or revert it
//                 (editor/page/changes/); on until switched off, and off, what comes under review is kept as it comes
//   showChangesAdded    the two switches on the Agent's-changes bar (the green and the red number: editor/page/changes/bar.mjs), on
//   showChangesRemoved  until switched off: the marks of what the Agent added or changed (green fills and words), and what it
//                       took out (the words struck through, the ghosts of the blocks deleted); only while 显示变更 is on
//   historyChanges  历史版本's 显示改动 (workbench features/history/): the version shown marked with what it changed of
//                 the one before it (editor/page/changes/version.mjs); on until switched off
//   outlineWidth  the outline's width in full, as the reader dragged it (px; 0: its default), for every report
//   outlineCollapsed  the outline as its strip where the room would give it the list in full: a click on its
//                 guide (editor/page/outline/), and again on the guide in the strip's card to have the list back;
//                 for every report, as its width
//
// Whether the outline (目录, the top bar's 更多; editor/page/outline/) shows is no preference of the UI
// but the report's, as what is folded in it is: switched on for one report, the others keep
// theirs, and every report has it off until it is switched on there. It is kept apart, under its own
// key (OUTLINE_OPEN_KEY): the slugs of the reports that have it on, the one switched on last at the end,
// at most OPEN_KEEP of them (switched on for one more, the one switched on longest ago lets it go), so
// what is kept stays small with no list of the reports to check it against. Off, a report is taken out
// of it. The page's head reads it before the page shows (editor/page/margin.mjs), and a page follows a
// switch made in another (the workbench's top bar, another tab) by the storage event, as the switches above.
// Both keys are named in renamed-storage.mjs, which carries what the old names hold (before 2026-10-26).

import { KEYS, OLD_KEYS } from "./renamed-storage.mjs";

const KEY = KEYS.preferences;
/** The preferences, each with its default (a switch's false but 显示变更's, a width's 0). */
export const PREFERENCES = { editFrame: false, quietNotices: false, showChanges: true, showChangesAdded: true, showChangesRemoved: true, historyChanges: true, outlineWidth: 0, outlineCollapsed: false };

/** The key they are kept under (the page's head reads the outline's width and whether it is collapsed before it shows: editor/page/margin.mjs). */
export const PREFERENCES_KEY = KEY;

function stored() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

/** The value of preference `name` (one of the other kind than its default's: the default). */
export function preference(name) {
  const value = stored()[name];
  return typeof value === typeof PREFERENCES[name] && (typeof value !== "number" || Number.isFinite(value)) ? value : PREFERENCES[name];
}

/**
 * Keep preference `name` as `value`. What is no preference any more is let go as one is kept (the
 * outline's switch, once one for every report, is now each report's own: outlineOpen).
 */
export function setPreference(name, value) {
  if (!Object.hasOwn(PREFERENCES, name)) return;
  try {
    const kept = typeof PREFERENCES[name] === "number" ? (Number.isFinite(Number(value)) ? Number(value) : PREFERENCES[name]) : Boolean(value);
    const known = Object.fromEntries(Object.entries(stored()).filter(([key]) => Object.hasOwn(PREFERENCES, key)));
    globalThis.localStorage?.setItem(KEY, JSON.stringify({ ...known, [name]: kept }));
  } catch {}
}

/** Call `listener` when another page of the origin changes the preferences (the workbench, for a report page). */
export function onPreferences(listener) {
  globalThis.addEventListener?.("storage", (event) => {
    if (event.key === KEY || event.key === null) listener();
  });
}

// ---------- the outline, each report's ----------

const OPEN_KEY = KEYS.outlineOpen;
const OPEN_KEEP = 100; // reports with the outline on

/** The key the reports with the outline on are kept under (a JSON list of their slugs; the page's head reads it: editor/page/margin.mjs). */
export const OUTLINE_OPEN_KEY = OPEN_KEY;
/** The two keys under their names before 2026-10-26, for the page's head, which runs before renamed-storage.mjs has carried them. */
export const OLD_PREFERENCES_KEY = OLD_KEYS.preferences;
export const OLD_OUTLINE_OPEN_KEY = OLD_KEYS.outlineOpen;

function openSlugs() {
  try {
    const value = JSON.parse(globalThis.localStorage?.getItem(OPEN_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((slug) => typeof slug === "string" && slug !== "") : [];
  } catch {
    return [];
  }
}

/** Whether report `slug` has its outline on (off until it is switched on there). */
export function outlineOpen(slug) {
  return typeof slug === "string" && slug !== "" && openSlugs().includes(documentKey(slug));
}

/**
 * Report `slug`'s outline switched on or off: on, it is the one switched on last (at most OPEN_KEEP
 * reports, the one switched on longest ago let go); off, it is taken out.
 */
export function setOutlineOpen(slug, on) {
  slug = documentKey(slug);
  if (typeof slug !== "string" || slug === "") return;
  try {
    const slugs = openSlugs().filter((one) => one !== slug);
    if (on) slugs.push(slug);
    globalThis.localStorage?.setItem(OPEN_KEY, JSON.stringify(slugs.slice(-OPEN_KEEP)));
  } catch {}
}

/**
 * Call `listener` when another page of the origin switches a report's outline (the workbench's 更多 ›
 * 目录, the same report in another tab): it reads outlineOpen() for its own report, which may not have
 * changed (another report switched).
 */
export function onOutlineOpen(listener) {
  globalThis.addEventListener?.("storage", (event) => {
    if (event.key === OPEN_KEY || event.key === null) listener();
  });
}
