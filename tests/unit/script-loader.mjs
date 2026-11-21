import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// The editor's one loader of a script the page was served without (page/ui.mjs loadScript: the
// kit's tables and code scripts, KaTeX, mhchem): one load per address however often it is asked
// for, the promise saying whether the script is there once it has loaded, a failure forgotten so
// that the next call tries again, a script already there not loaded at all.
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
const saved = globalThis.document;
globalThis.document = dom.window.document;
const { loadScript } = await import("../../src/editor/page/ui.mjs");
const scripts = () => [...document.head.querySelectorAll("script")];
const finish = (script, type) => script.dispatchEvent(new dom.window.Event(type));

let there = false;
assert.equal(await loadScript("/a.js", () => true), true, "already there: nothing loaded");
assert.equal(scripts().length, 0);

const first = loadScript("/a.js", () => there);
const second = loadScript("/a.js", () => there);
assert.equal(scripts().length, 1, "two asks, one script");
assert.equal(scripts()[0].getAttribute("src"), "/a.js");
assert.equal(scripts()[0].hasAttribute("data-doc-dev"), true, "the editor's own: an export drops it");
there = true;
finish(scripts()[0], "load");
assert.deepEqual(await Promise.all([first, second]), [true, true], "loaded and there");
assert.equal(await loadScript("/a.js", () => there), true);
assert.equal(scripts().length, 1);

// Loaded but not what was wanted: false, and not tried again by itself.
const hollow = loadScript("/b.js", () => false);
finish(scripts().at(-1), "load");
assert.equal(await hollow, false);

// A failure leaves no script behind and the next call loads again; `before` runs once per load.
let before = 0;
const failing = loadScript("/c.js", () => false, { before: () => before++ });
loadScript("/c.js", () => false, { before: () => before++ });
assert.equal(before, 1, "before runs as the load starts, once");
const count = scripts().length;
finish(scripts().at(-1), "error");
assert.equal(await failing, false);
assert.equal(scripts().length, count - 1, "the failed script is taken out");
loadScript("/c.js", () => false, { before: () => before++ });
assert.equal(before, 2, "after a failure, a new load");
assert.equal(scripts().at(-1).getAttribute("src"), "/c.js");

if (saved === undefined) delete globalThis.document;
else globalThis.document = saved;
dom.window.close();
console.log("Checked the editor's script loader: one load per address, the promise saying whether the script is there, a failure forgotten, a script already there left alone.");
