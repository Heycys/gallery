import assert from "node:assert/strict";

// What the editor keeps in the browser's storage (src/editor/page/storage.mjs): JSON read back only
// when it is fit, lists of what was used lately (the format bar's colors, the "/" menu's blocks, the
// formula editor's symbols), and a page whose storage is not there at all (a private window, a full
// quota) going on without it.

const saved = { localStorage: Object.getOwnPropertyDescriptor(globalThis, "localStorage") };
const area = new Map();
const working = { getItem: (key) => area.get(key) ?? null, setItem: (key, value) => void area.set(key, String(value)), removeItem: (key) => void area.delete(key) };
const refusing = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("quota"); }, removeItem() { throw new Error("blocked"); } };
const use = (storage) => Object.defineProperty(globalThis, "localStorage", { value: storage, configurable: true, writable: true });

use(working);
const { keep, local, recentList, stored, storageOf } = await import("../../src/editor/page/storage.mjs");

// stored / keep: JSON, the fallback for anything missing, unreadable or unfit.
assert.deepEqual(stored("a", { none: true }), { none: true }, "nothing stored: the fallback");
assert.equal(keep("a", { bold: true }), true);
assert.deepEqual(stored("a", {}), { bold: true }, "what was kept comes back");
assert.deepEqual(stored("a", {}, (value) => value.italic), {}, "unfit: the fallback");
area.set("b", "{not json");
assert.deepEqual(stored("b", [1]), [1], "unreadable: the fallback");

// recentList: newest first, an entry used again moves to the front, at most `max`, unfit entries left out.
const types = recentList("types", { max: 3, valid: (key) => typeof key === "string" });
assert.deepEqual(types.read(), [], "none used yet");
for (const key of ["a", "b", "c", "a", "d"]) types.use(key);
assert.deepEqual(types.read(), ["d", "a", "c"], "newest first, one of each, three at most");
assert.deepEqual(JSON.parse(area.get("types")), ["d", "a", "c"], "kept as JSON");
area.set("mixed", JSON.stringify(["x", 1, null, "y"]));
assert.deepEqual(recentList("mixed", { max: 5, valid: (key) => typeof key === "string" }).read(), ["x", "y"], "entries that are not fit are left out");
area.set("objects", JSON.stringify([null, { family: "text", value: "red" }]));
assert.deepEqual(recentList("objects", { max: 5, valid: ({ family }) => family === "text" }).read(), [{ family: "text", value: "red" }], "a validator that throws on an entry drops it");
const same = recentList("pairs", { max: 5, same: (a, b) => a[0] === b[0] });
same.use(["sum", 1]);
same.use(["int", 2]);
same.use(["sum", 3]);
assert.deepEqual(same.read(), [["sum", 3], ["int", 2]], "two entries are one when `same` says so, the newer kept");
assert.deepEqual(recentList("empty", { max: 2, fallback: ["first"] }).read(), ["first"], "none fit: the fallback");

// The format bar's colors and the "/" menu's blocks are such lists.
const { recentColors, useColor } = await import("../../src/editor/page/format-bar/colors.mjs");
assert.deepEqual(recentColors(), [{ family: "highlight", value: "yellow" }], "the recent colors start with a yellow background");
useColor("text", "red");
useColor("highlight", "yellow");
useColor("text", "red");
assert.deepEqual(recentColors(), [{ family: "text", value: "red" }, { family: "highlight", value: "yellow" }], "a color used again goes first, once");
assert.deepEqual(JSON.parse(area.get("gallery-edit:recent-colors")), recentColors(), "and is kept");
const { recentTypes, rememberType } = await import("../../src/editor/page/slash-menu/index.mjs");
rememberType("heading1");
rememberType("callout");
rememberType("not-a-type");
assert.deepEqual(recentTypes(), ["callout", "heading1"], "blocks used last, newest first, a name that is no block left out");

// Without storage nothing throws, and a list used lately lasts the page's life.
use(refusing);
assert.equal(local.get("a"), null);
assert.equal(keep("a", 1), false, "nothing could be kept");
assert.deepEqual(stored("a", "fallback"), "fallback");
const lasting = recentList("lasting", { max: 2 });
lasting.use("one");
lasting.use("two");
lasting.use("three");
assert.deepEqual(lasting.read(), ["three", "two"], "kept in memory when the storage refuses");
useColor("highlight", "blue");
assert.equal(recentColors()[0].value, "blue", "the colors too");

// Identically named documents in different projects must never recover each other's buffers.
const data = {};
const browser = { getItem: key => data[key] ?? null, setItem: (key, value) => { data[key] = value; }, removeItem: key => { delete data[key]; } };
const areaWithKeys = new Proxy(browser, { ownKeys: () => Object.keys(data), getOwnPropertyDescriptor: () => ({ enumerable: true, configurable: true }) });
const homeStorage = storageOf(() => areaWithKeys);
const projectStorage = storageOf(() => areaWithKeys, { prefix: 'gallery-project:~ws-123abc:' });
homeStorage.set('gallery-edit:sample:pending:tab', 'home');
projectStorage.set('gallery-edit:sample:pending:tab', 'project');
assert.equal(homeStorage.get('gallery-edit:sample:pending:tab'), 'home');
assert.equal(projectStorage.get('gallery-edit:sample:pending:tab'), 'project');
assert.deepEqual(projectStorage.keys(), ['gallery-edit:sample:pending:tab']);
projectStorage.remove('gallery-edit:sample:pending:tab');
assert.equal(homeStorage.get('gallery-edit:sample:pending:tab'), 'home');

if (saved.localStorage) Object.defineProperty(globalThis, "localStorage", saved.localStorage);
else delete globalThis.localStorage;

console.log("Checked the editor's storage: JSON kept and read back only when fit, lists of what was used lately (newest first, no repeats, a size limit, unfit entries left out, a fallback), the format bar's colors and the \"/\" menu's blocks as such lists, and a page whose storage refuses going on without it.");
