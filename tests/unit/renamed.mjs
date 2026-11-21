import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "../../src/shared/paths.mjs";

// What the product's rename (HTML Report Studio → Gallery, 2026-10-26) keeps working: the browser's
// storage carried to the new names (src/shared/renamed-storage.mjs), the generators an export may
// name (src/shared/export-wrap.mjs), the session protocol's and the clipboard's old ids beside the
// new. In a browser: the scenarios renamedStorage, renamedSession and renamedClipboard
// (tests/browser/scenarios.mjs). Nothing here writes a report: the rename leaves every file as it is.

const { KEYS, OLD_KEYS, NEW_KEYS, DATABASES, OLD_DATABASES, RECORD, LOCAL_PAIRS, PREFIXES, carryKeys, digest, prefixPair, prefixPairs } = await import("../../src/shared/renamed-storage.mjs");

// ---------- the table ----------
assert.deepEqual(Object.keys(OLD_KEYS), Object.keys(KEYS), "every key has its old name, and only those");
assert.deepEqual(Object.keys(OLD_DATABASES), Object.keys(DATABASES));
const named = [...Object.values(KEYS), ...Object.values(OLD_KEYS), ...Object.values(NEW_KEYS), RECORD];
assert.equal(new Set(named).size, named.length, "no name twice");
assert.ok(Object.keys(NEW_KEYS).every((name) => !(name in KEYS)), "a key made after the rename is not one of the renamed");
for (const key of [...Object.values(KEYS), ...Object.values(NEW_KEYS), ...Object.values(DATABASES)]) assert.match(key, /^gallery[:/-]/, key);
for (const key of [...Object.values(OLD_KEYS), ...Object.values(OLD_DATABASES)]) assert.match(key, /^(html-)?report-studio[:/-]/, key);

// ---------- carrying (a storage of this test's: a Map behind the Storage calls) ----------
const storage = (entries = {}, refuse = () => false) => {
  const area = new Map(Object.entries(entries));
  return {
    area,
    getItem: (key) => area.get(key) ?? null,
    setItem: (key, value) => { if (refuse(key)) throw new Error("quota"); area.set(key, String(value)); },
    removeItem: (key) => void area.delete(key),
    get length() { return area.size; },
    key: (index) => [...area.keys()][index] ?? null,
    get entries() { return Object.fromEntries([...area].filter(([key]) => key !== RECORD)); },
  };
};
const pairs = [[OLD_KEYS.theme, KEYS.theme], [OLD_KEYS.favorites, KEYS.favorites], [OLD_KEYS.language, KEYS.language]];

// The first time: each old key into its empty new one, the old left.
let s = storage({ [OLD_KEYS.theme]: '"dark"', [OLD_KEYS.favorites]: '["a","b"]' });
assert.deepEqual(carryKeys(s, pairs), [KEYS.theme, KEYS.favorites], "the old keys there carried");
assert.deepEqual(s.entries, { [OLD_KEYS.theme]: '"dark"', [OLD_KEYS.favorites]: '["a","b"]', [KEYS.theme]: '"dark"', [KEYS.favorites]: '["a","b"]' }, "copied as they are, the old kept");
// Again: nothing changes.
const record = s.getItem(RECORD);
assert.deepEqual(carryKeys(s, pairs), [], "run again: nothing carried");
assert.equal(s.getItem(RECORD), record, "nor the record changed");
// The new version writes and removes its own keys: they stay as it left them.
s.setItem(KEYS.favorites, '["a","b","c"]');
s.removeItem(KEYS.theme); // the theme back to the system's (nothing picked)
assert.deepEqual(carryKeys(s, pairs), [], "what the new version changed is kept");
assert.equal(s.getItem(KEYS.theme), null, "a key it removed stays removed (no old value comes back)");
assert.equal(s.getItem(KEYS.favorites), '["a","b","c"]');
// A page of the old version, still open, writes its key: the reader's latest, carried; removes one: removed.
s.setItem(OLD_KEYS.favorites, '["a","b","d"]');
s.setItem(OLD_KEYS.language, '"en"');
assert.deepEqual(carryKeys(s, pairs), [KEYS.favorites, KEYS.language], "an old key written since is carried again");
assert.equal(s.getItem(KEYS.favorites), '["a","b","d"]');
assert.equal(s.getItem(KEYS.language), '"en"', "one that was not there before too");
s.removeItem(OLD_KEYS.favorites);
assert.deepEqual(carryKeys(s, pairs), [KEYS.favorites]);
assert.equal(s.getItem(KEYS.favorites), null, "an old key removed since: the new one goes too");
assert.deepEqual(carryKeys(s, pairs), [], "and once");
// A new key written before the old one was ever looked at wins.
s = storage({ [OLD_KEYS.theme]: '"dark"', [KEYS.theme]: '"light"' });
assert.deepEqual(carryKeys(s, pairs), []);
assert.equal(s.getItem(KEYS.theme), '"light"', "the new key written first wins");
assert.equal(s.getItem(OLD_KEYS.theme), '"dark"', "the old one stays");
// A failure midway (a full storage): that key is carried the next time, the others once.
let full = true;
s = storage({ [OLD_KEYS.theme]: '"dark"', [OLD_KEYS.favorites]: '["x"]' }, (key) => full && key === KEYS.favorites);
assert.deepEqual(carryKeys(s, pairs), [KEYS.theme], "the key that could not be written is left");
assert.equal(s.getItem(KEYS.favorites), null);
full = false;
assert.deepEqual(carryKeys(s, pairs), [KEYS.favorites], "and carried the next time");
assert.equal(s.getItem(KEYS.favorites), '["x"]');
assert.equal(s.getItem(KEYS.theme), '"dark"', "the other not carried twice");
// A record that cannot be read: as if nothing was looked at (a new key written still wins); blocked storage: nothing, no error.
s = storage({ [OLD_KEYS.theme]: '"dark"', [KEYS.theme]: '"light"', [RECORD]: "{not json" });
carryKeys(s, pairs);
assert.equal(s.getItem(KEYS.theme), '"light"');
const blocked = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
assert.deepEqual(carryKeys(blocked, pairs), [], "blocked storage carries nothing and throws nothing");
assert.deepEqual(carryKeys(null, pairs), []);
assert.notEqual(digest("a"), digest("b"));

// ---------- the editor's keys, carried by their prefix (report-edit:… before 2026-10-28) ----------
assert.deepEqual(PREFIXES, [["report-edit:", "gallery-edit:"]]);
assert.deepEqual(prefixPair("report-edit:alpha:pending:t1"), ["report-edit:alpha:pending:t1", "gallery-edit:alpha:pending:t1"]);
assert.equal(prefixPair("gallery-edit:alpha:view"), null, "a new key is no old one");
assert.equal(prefixPair("report-edit"), null);
assert.equal(prefixPair(null), null);
{
  const buffer = JSON.stringify({ v: 2, time: 1, sent: null, request: { texts: [{ html: '<span data-rs-atom="x">a</span>' }] }, keep: [] });
  const s = storage({ "report-edit:alpha:pending:t1": buffer, "report-edit:recent-colors": '["red"]', "gallery-edit:beta:lost": "[]", "other:key": "1" });
  const carry = () => carryKeys(s, prefixPairs(s));
  assert.deepEqual(carry(), ["gallery-edit:alpha:pending:t1", "gallery-edit:recent-colors"], "the first time: each old key under the prefix into its new one");
  assert.equal(s.getItem("gallery-edit:alpha:pending:t1"), buffer, "what it holds as it is");
  assert.equal(s.getItem("report-edit:alpha:pending:t1"), buffer, "the old key left");
  assert.equal(s.getItem("other:key"), "1");
  assert.deepEqual(carry(), [], "run again: nothing carried");
  // The new page sends the buffer and removes it: the old key, unchanged, is not carried again.
  s.removeItem("gallery-edit:alpha:pending:t1");
  assert.deepEqual(carry(), [], "a buffer the new page took is not brought back");
  assert.equal(s.getItem("gallery-edit:alpha:pending:t1"), null);
  // A page of the old version, still open, writes its buffer again: carried; it saves and removes it: removed.
  s.setItem("report-edit:alpha:pending:t1", "later");
  assert.deepEqual(carry(), ["gallery-edit:alpha:pending:t1"], "an old tab's later write is carried");
  assert.equal(s.getItem("gallery-edit:alpha:pending:t1"), "later");
  s.removeItem("report-edit:alpha:pending:t1");
  assert.deepEqual(prefixPairs(s).map(([old]) => old).sort(), ["report-edit:alpha:pending:t1", "report-edit:recent-colors"], "an old key looked at before is a pair while gone");
  assert.deepEqual(carry(), ["gallery-edit:alpha:pending:t1"]);
  assert.equal(s.getItem("gallery-edit:alpha:pending:t1"), null, "removed there, its new key goes too");
  assert.deepEqual(carry(), [], "and once");
  // A new key written before the old one was looked at wins.
  const first = storage({ "report-edit:tab": "old", "gallery-edit:tab": "new" });
  assert.deepEqual(carryKeys(first, prefixPairs(first)), []);
  assert.equal(first.getItem("gallery-edit:tab"), "new");
  assert.deepEqual(prefixPairs(null), []);
  assert.deepEqual(prefixPairs({ get length() { throw new Error("blocked"); }, getItem() { throw new Error("blocked"); } }), [], "blocked storage: no pairs, no error");
}
assert.equal(digest(null), null);

// As the module loads in a page: localStorage and sessionStorage carried, before anything that names a key reads it.
{
  const local = storage({ [OLD_KEYS.language]: "en", [OLD_KEYS.preferences]: '{"editFrame":true}', [OLD_KEYS.outlineFolds]: '{"folds":{"r":["k"]}}', "report-edit:alpha:pending:t1": "buffer" });
  const session = storage({ "report-edit:tab": "t1" });
  const listeners = [];
  const saved = ["document", "localStorage", "sessionStorage", "addEventListener"].map((name) => [name, Object.getOwnPropertyDescriptor(globalThis, name)]);
  const define = (name, value) => Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  define("document", {});
  define("localStorage", local);
  define("sessionStorage", session);
  define("addEventListener", (type, listener) => listeners.push([type, listener]));
  try {
    const fresh = await import("../../src/shared/renamed-storage.mjs?page");
    const { language } = await import("../../src/shared/i18n/index.mjs?page"); // read after the carry, as in a page
    assert.equal(local.getItem(KEYS.language), "en", "the language carried as the module loads");
    assert.equal(local.getItem(KEYS.preferences), '{"editFrame":true}');
    assert.equal(local.getItem(KEYS.outlineFolds), '{"folds":{"r":["k"]}}');
    assert.equal(language, "en", "and read by the module that names it");
    assert.equal(local.getItem("gallery-edit:alpha:pending:t1"), "buffer", "the editor's keys carried by their prefix");
    assert.equal(session.getItem("gallery-edit:tab"), "t1", "and this tab's id, so its own buffer stays its own");
    // Another tab of the old version changes an old key: carried at once.
    local.setItem(OLD_KEYS.favorites, '["z"]');
    const storageListener = listeners.find(([type]) => type === "storage")?.[1];
    assert.ok(storageListener, "the module listens to the other tabs");
    storageListener({ storageArea: local, key: OLD_KEYS.favorites });
    assert.equal(local.getItem(KEYS.favorites), '["z"]', "an old key another tab changed is carried as it changes");
    storageListener({ storageArea: local, key: KEYS.favorites }); // a new key's change: nothing to carry
    local.setItem("report-edit:beta:pending:t2", "theirs");
    storageListener({ storageArea: local, key: "report-edit:beta:pending:t2" });
    assert.equal(local.getItem("gallery-edit:beta:pending:t2"), "theirs", "an old tab's buffer carried as it is written");
    assert.equal(fresh.LOCAL_PAIRS.length, Object.keys(KEYS).length);
  } finally {
    for (const [name, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
}

// ---------- no other module spells a key: every one takes its name from the table ----------
const source = path.join(projectRoot, "src");
const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) { if (entry.name !== "vendor" && entry.name !== "data") walk(full); }
    else if (/\.(mjs|js|ts|tsx)$/.test(entry.name)) files.push(full);
  }
};
walk(source);
const keyLiteral = /["'`](?:html-report-studio(?::|\/workbench:)|report-studio:|gallery:|gallery\/workbench:|html-report-studio-workbench|gallery-workbench)/;
const OWN = ["src/shared/renamed-storage.mjs", "src/render/kit/state.js"]; // the table, and the kit's own state keys
for (const file of files) {
  const shown = path.relative(projectRoot, file).split(path.sep).join("/");
  if (OWN.includes(shown)) continue;
  fs.readFileSync(file, "utf8").split("\n").forEach((line, index) => {
    if (keyLiteral.test(line) && !/^\s*(\/\/|\*)/.test(line)) assert.fail(`${shown}:${index + 1} spells a storage key of its own; name it in src/shared/renamed-storage.mjs: ${line.trim()}`);
  });
}

// ---------- the other old ids, beside the new ----------
const { GENERATOR, GENERATORS, exportSourceOf, sourceMeta } = await import("../../src/shared/export-wrap.mjs");
assert.deepEqual(GENERATORS, ["Gallery", "HTML Report Studio"], "an export names Gallery; one made before, HTML Report Studio");
assert.equal(GENERATOR, "Gallery");
const kernel = fs.readFileSync(path.join(source, "render", "kit", "runtime", "kernel.js"), "utf8");
for (const generator of GENERATORS) assert.ok(kernel.includes(`meta[name="generator"][content="${generator}"]`), `the kit's runtime takes a page naming ${generator} for an export`);
const hash = "a".repeat(64);
for (const generator of GENERATORS) {
  const exported = `<!doctype html><html><head>\n  <meta name="generator" content="${generator}">\n  <meta http-equiv="Content-Security-Policy" content="default-src 'none'">\n  ${sourceMeta(hash)}<title>T</title></head></html>`;
  assert.equal(exportSourceOf(exported), hash, `an export naming ${generator} says what it was made from`);
}
assert.equal(exportSourceOf(`<head>\n  <meta name="generator" content="Someone">\n  <meta http-equiv="Content-Security-Policy" content="x">\n  ${sourceMeta(hash)}`), null, "another program's page is none of ours");

const { PROTOCOL, OLD_PROTOCOL, PROTOCOLS } = await import("../../src/shared/session.mjs");
assert.deepEqual([PROTOCOL, OLD_PROTOCOL, PROTOCOLS], ["gallery/session", "html-report-studio/session", ["gallery/session", "html-report-studio/session"]]);
const { MIME, OLD_MIME, ownData } = await import("../../src/editor/page/clipboard/own/describe.mjs");
const { CELLS_MIME, OLD_CELLS_MIME, cellsData } = await import("../../src/editor/components/table/index.mjs");
assert.deepEqual([MIME, OLD_MIME, CELLS_MIME, OLD_CELLS_MIME], ["application/x-gallery-blocks", "application/x-report-studio-blocks", "application/x-gallery-cells", "application/x-report-studio-cells"]);
const transfer = (types) => ({ getData: (type) => types[type] ?? "" });
assert.equal(ownData(transfer({ [MIME]: "new", [OLD_MIME]: "old" })), "new", "a paste reads the new type first");
assert.equal(ownData(transfer({ [OLD_MIME]: "old" })), "old", "and the old one when the new is not there (a copy on a page of the old version)");
assert.equal(ownData(transfer({})), "");
assert.equal(cellsData(transfer({ [OLD_CELLS_MIME]: "cells" })), "cells");

console.log("Checked the product's rename: the storage keys' table, the editor's keys carried by their prefix (report-edit: to gallery-edit:), carried once (old kept, a new key first winning, one removed staying removed, an old tab's later write or removal carried, a failure carried next time, blocked storage), as the module loads and on another tab's change; no key spelled outside the table; both generators of an export read (the runtime, exportSourceOf); the session's and the clipboard's old ids beside the new.");
