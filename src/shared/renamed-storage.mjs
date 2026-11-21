// What a browser keeps of the UI (the workbench and the report pages, one origin) under the product's
// name, Gallery, and under its old one, HTML Report Studio (before 2026-10-26): the keys of
// localStorage and sessionStorage and the workbench's IndexedDB. Every module that reads or writes
// one of these keys takes its name from here (KEYS, DATABASES), so this module has
// run, and carried what the old keys hold, before any of them reads: one table, whichever page of
// the origin loads first (docs/workbench.md, "Kept in the browser").
//
// Carrying never removes an old key or the old database: a page or workbench of the old version
// still open (a tab left from before the update) goes on reading and writing them. An old key is
// carried to its new one
//   - the first time it is looked at, when the new key is empty (a new key already written wins);
//   - again whenever it changed since it was last looked at: only a page of the old version writes
//     it, and what it wrote is the reader's latest (a favorite set, a theme picked in the old tab);
//     removed there (the theme, the icon set or color back to their default), the new key goes too.
// What each old key held when it was last looked at is kept (as a short digest) under RECORD, so a
// carry is done once: run again, nothing changes, and a new key the new version removed (its
// default) stays removed. Each runs as this module loads, and again when another tab changes an old
// key (the storage event). A failure (full or blocked storage) leaves that key to the next time.
// The kit's reading state (DocState, src/render/kit/state.js, a classic script) carries its own
// keys, html-report-studio:<report>:<id> to gallery:<report>:<id>, the same way, as it reads them.
//
// The editor's keys, made per document and per tab (the crash buffer, what a page keeps over a
// reload, the lost list, the recent choices of its menus: gallery-edit:<slug>:<kind>[:<tab>],
// gallery-edit:<name>), were report-edit:… before 2026-10-28. They are carried by their
// prefix (PREFIXES) under the same rules, every old key under it that is there or was looked at
// before; what they hold is carried as it is (a crash buffer then sent by the page as any, the
// server reading it as the page of this version sends it).

/** localStorage, new names. */
export const KEYS = {
  language: "gallery:language", // shared/i18n
  preferences: "gallery:preferences", // shared/preferences.mjs
  outlineOpen: "gallery:outline-open", // shared/preferences.mjs
  outlineFolds: "gallery:outline", // editor/page/outline/folds.mjs
  emojiSkinTone: "gallery:emoji-skin-tone", // shared/emoji/data.mjs
  emojiFrecency: "gallery:emoji-frecency",
  iconColor: "gallery:icon-picker-color", // shared/emoji/glyphs.mjs
  recentGlyphs: "gallery:recent-glyphs",
  glyphSet: "gallery:glyph-set",
  sidebar: "gallery/workbench:sidebar", // the workbench's state/
  theme: "gallery/workbench:theme",
  tree: "gallery/workbench:tree",
  favorites: "gallery/workbench:favorites", // workbench/app/workspace/store.ts
  presentZoom: "gallery/workbench:present-zoom", // features/present/
};
/** localStorage, the names before 2026-10-26, each of the key of KEYS by the same name. */
export const OLD_KEYS = {
  language: "html-report-studio:language",
  preferences: "html-report-studio:preferences",
  outlineOpen: "html-report-studio:outline-open",
  outlineFolds: "html-report-studio:outline",
  emojiSkinTone: "report-studio:emoji-skin-tone",
  emojiFrecency: "report-studio:emoji-frecency",
  iconColor: "report-studio:icon-picker-color",
  recentGlyphs: "report-studio:recent-glyphs",
  glyphSet: "report-studio:glyph-set",
  sidebar: "html-report-studio/workbench:sidebar",
  theme: "html-report-studio/workbench:theme",
  tree: "html-report-studio/workbench:tree",
  favorites: "html-report-studio/workbench:favorites",
  presentZoom: "html-report-studio/workbench:present-zoom",
};
/** Keys made after the rename (localStorage, unless a comment says sessionStorage): no old name, nothing to carry. */
export const NEW_KEYS = {
  updated: "gallery/workbench:updated", // workbench/app/state/updates.ts: pages someone else wrote, not seen yet
  shown: "gallery-workbench:shown", // sessionStorage, shared/kept-view.mjs: the page the workbench's report area showed as it went, for its next load to tell the same page loaded anew (short-lived, one tab's)
};
/** IndexedDB, new and old names (the workbench's chosen export folder: workspace/exportFolder.ts). */
export const DATABASES = { workbench: "gallery-workbench" };
export const OLD_DATABASES = { workbench: "html-report-studio-workbench" };

/** Where what each old key held when last looked at is kept (in each storage, for its own keys). */
export const RECORD = "gallery:renamed";

/** Prefixes of keys named per document or tab, the old with its new one (the editor's, before 2026-10-28). */
export const PREFIXES = [["report-edit:", "gallery-edit:"]];

const pairsOf = (old, now) => Object.keys(now).map((name) => [old[name], now[name]]);
export const LOCAL_PAIRS = pairsOf(OLD_KEYS, KEYS);

/**
 * The [old, new] pairs of the keys under `prefixes` in `area` (a Storage): each old key there now,
 * and each looked at before (in `record`), so that one removed since takes its new key with it.
 */
export function prefixPairs(area, prefixes = PREFIXES, record = RECORD) {
  if (!area) return [];
  const names = new Set();
  try {
    for (let index = 0; index < area.length; index++) names.add(area.key(index));
  } catch {} // blocked: none
  try {
    const kept = JSON.parse(area.getItem(record) ?? "{}");
    if (kept && typeof kept === "object" && !Array.isArray(kept)) for (const name of Object.keys(kept)) names.add(name);
  } catch {}
  return [...names].map((name) => prefixPair(name, prefixes)).filter(Boolean);
}

/** [name, its new name] when `name` is a key under one of the old prefixes of `prefixes`, else null. */
export function prefixPair(name, prefixes = PREFIXES) {
  const pair = typeof name === "string" ? prefixes.find(([old]) => name.startsWith(old)) : null;
  return pair ? [name, pair[1] + name.slice(pair[0].length)] : null;
}

/** A short digest of a stored value (null: none), enough to tell that it changed. */
export function digest(value) {
  if (value === null || value === undefined) return null;
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  return `${value.length}:${(hash >>> 0).toString(36)}`;
}

/**
 * Carry the old keys of `pairs` ([old, new]) to the new ones in `area` (a Storage), as said above,
 * keeping what was looked at under `record`. Returns the new keys written or removed.
 */
export function carryKeys(area, pairs, record = RECORD) {
  const carried = [];
  if (!area) return carried;
  let seen = {};
  try {
    const kept = JSON.parse(area.getItem(record) ?? "{}");
    if (kept && typeof kept === "object" && !Array.isArray(kept)) seen = kept;
  } catch {} // unreadable: as if nothing was looked at (a new key written still wins)
  let changed = false;
  for (const [old, now] of pairs) {
    try {
      const value = area.getItem(old);
      const mark = digest(value);
      const first = !Object.hasOwn(seen, old);
      if (!first && seen[old] === mark) continue;
      if (first ? value !== null && area.getItem(now) === null : true) {
        if (value === null) area.removeItem(now);
        else area.setItem(now, value);
        carried.push(now);
      }
      seen[old] = mark;
      changed = true;
    } catch {} // full or blocked: this key is looked at again next time
  }
  if (changed) {
    try {
      area.setItem(record, JSON.stringify(seen));
    } catch {}
  }
  return carried;
}

/**
 * Copy what IndexedDB database `from` holds in object store `store` into the one `open()` opens (a
 * connection of its own to the new database, made with that store as its owner makes it; closed
 * here once done): each key the new one does not hold
 * yet, so it runs any number of times with the same result and never takes a choice made since.
 * The old database is never made (looked for, not opened, when it is not there), changed or
 * deleted. Resolves to the number of entries copied; a failure rejects and leaves both as they were
 * but for what was copied whole, to be tried again next time.
 */
export async function carryDatabase(factory, { from, store, open }) {
  const done = (request) => new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  if (typeof factory.databases === "function" && !(await factory.databases()).some((database) => database.name === from)) return 0;
  const old = await new Promise((resolve, reject) => {
    const request = factory.open(from);
    let absent = false;
    request.onupgradeneeded = () => { // it was not there: make nothing
      absent = true;
      request.transaction.abort();
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => {
      if (!absent) return reject(request.error);
      event.preventDefault();
      resolve(null);
    };
  });
  if (!old) return 0;
  let entries;
  try {
    if (!old.objectStoreNames.contains(store)) return 0;
    const reading = old.transaction(store, "readonly").objectStore(store);
    const [keys, values] = await Promise.all([done(reading.getAllKeys()), done(reading.getAll())]);
    entries = keys.map((key, index) => [key, values[index]]);
  } finally {
    old.close();
  }
  if (entries.length === 0) return 0;
  const database = await open();
  try {
    const writing = database.transaction(store, "readwrite");
    const target = writing.objectStore(store);
    let copied = 0;
    for (const [key, value] of entries) {
      const held = target.get(key);
      held.onsuccess = () => {
        if (held.result !== undefined) return;
        target.put(value, key);
        copied++;
      };
    }
    await new Promise((resolve, reject) => {
      writing.oncomplete = resolve;
      writing.onerror = () => reject(writing.error);
      writing.onabort = () => reject(writing.error ?? new Error("aborted"));
    });
    return copied;
  } finally {
    database.close();
  }
}

// As this module loads, in a page (never in Node, which imports it with the modules that name a key).
if (typeof document !== "undefined") {
  const local = (() => { try { return globalThis.localStorage ?? null; } catch { return null; } })();
  const session = (() => { try { return globalThis.sessionStorage ?? null; } catch { return null; } })();
  carryKeys(local, [...LOCAL_PAIRS, ...prefixPairs(local)]);
  carryKeys(session, prefixPairs(session));
  // A tab of the old version, still open, changed an old key: carried now, so that what this page
  // writes after it (which it can only do later) stays the latest.
  globalThis.addEventListener?.("storage", (event) => {
    if (!local || event.storageArea !== local) return;
    const pair = LOCAL_PAIRS.find(([old]) => old === event.key) ?? prefixPair(event.key);
    if (pair) carryKeys(local, [pair]);
  });
}
