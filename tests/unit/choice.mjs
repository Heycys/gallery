import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { loadKitFile } from "../../src/render/kit-build.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";

// A choice (src/render/kit/runtime/choice.js, docs/render.md "Choices"): a <select> of the page opens the
// kit's menu card, never the browser's popup, and stays the value's home; DocKit.choose opens the same
// menu from any element. Here in JSDOM: the press and the keys that would open the popup are taken (their
// default prevented) and open the card, a choice by the pointer or the keys sets the option and sends
// input then change once, nothing is added to the page that stays, a list box or a disabled select is
// left to the browser, and the card goes with an Escape, a press outside, the trigger leaving the page or
// a signal. What it looks like is the scenario docSelectMenu's.

const sources = { runtime: await loadKitFile("runtime.js"), state: await loadKitFile("state.js"), tokens: await loadKitFile("tokens.js") };
const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");

function environment(body) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>${body}</body></html>`, { url: "https://report.test/doc.html", runScripts: "outside-only" });
  const w = dom.window;
  w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.requestAnimationFrame = (run) => w.setTimeout(run, 0);
  w.HTMLElement.prototype.getBoundingClientRect = () => ({ width: 120, height: 28, x: 10, y: 10, left: 10, top: 10, right: 130, bottom: 38 });
  for (const name of ["runtime", "state", "tokens"]) w.eval(sources[name]);
  return { dom, w, document: w.document };
}

const SELECT = `<select id="kind" data-doc-bind="kind"><option value="a">Alpha</option><option value="b">Beta</option><option value="c" disabled>Gamma</option><option value="d">Delta</option></select>`;
const env = environment(`<main>${SELECT}<select id="list" multiple><option>x</option><option>y</option></select><select id="off" disabled><option>x</option></select><button id="open" type="button">open</button><p id="after">after</p></main>`);
const { w, document } = env;
await new Promise((resolve) => (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", resolve, { once: true }) : resolve()));
await new Promise((resolve) => w.setTimeout(resolve, 20));
// Past a closed menu's 90ms fade (choice.js: it leaves by its opacity, then goes).
const settle = () => new Promise((resolve) => w.setTimeout(resolve, 100));

const select = document.querySelector("#kind");
const menu = () => document.querySelector(".doc-choice");
const rows = () => [...document.querySelectorAll(".doc-choice-row")];
const words = () => rows().map((row) => row.textContent.trim());
const mouse = (type, target, init = {}) => {
  const event = new w.MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init });
  target.dispatchEvent(event);
  return event;
};
const key = (target, name, init = {}) => {
  const event = new w.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(event);
  return event;
};
const heard = [];
select.addEventListener("input", () => heard.push("input"));
select.addEventListener("change", () => heard.push("change"));
const before = document.body.innerHTML;

// ---------- the kit offers it ----------
assert.equal(typeof w.DocKit.choose, "function", "DocKit.choose");
assert.ok(sources.runtime.includes("doc-choice"), "the runtime carries the menu");
const css = await loadKitFile("report.css");
assert.ok(css.includes(".doc-choice-row") && css.includes(":where(select:not([multiple], [size]))"), "the stylesheet has the card and a select's quiet look");
// The product's menu card since 2026-11-17: the card's corners and surface by their tokens (tokens.css), its rows lit by the row fill (7%).
assert.ok(/\.doc-choice-row\.is-active\s*\{[^}]*var\(--doc-hover-row\)/.test(css) && /\.doc-choice,\s*\.doc-choice-leaving(?:,\s*\.doc-popover)?\s*\{[^}]*border-radius:\s*var\(--doc-radius-card\)/.test(css) && /--doc-radius-card:\s*14px/.test(css) && /--doc-float-fill:\s*light-dark\(#ffffff, #252525\)/.test(css), "the card is the display menu's: radius 14, light and dark, rows lit by a menu card's row fill");
assert.ok(!/\.doc-choice[^{]*\{[^}]*\bborder:\s*1px/.test(css), "no outlined card or row (the flat look)");

// ---------- a press opens the card, not the browser's popup ----------
{
  const down = mouse("mousedown", select);
  assert.ok(down.defaultPrevented, "the press that would open the browser's popup is taken");
  await settle();
  assert.ok(menu(), "the menu opens");
  assert.equal(menu().parentElement, document.body, "at the end of the body");
  assert.equal(document.activeElement, select, "the focus is on the select");
  assert.deepEqual(words(), ["Alpha", "Beta", "Gamma", "Delta"], "a row to each option, in order");
  assert.deepEqual(rows().map((row) => row.getAttribute("aria-selected")), ["true", "false", "false", "false"], "the chosen option is the checked row");
  assert.equal(rows().filter((row) => row.querySelector(".doc-choice-check")).length, 1, "one check, on the chosen row, none on the others");
  assert.ok(rows()[0].querySelector(".doc-choice-check") && rows()[0].classList.contains("is-active"), "the chosen row is lit as well");
  assert.equal(rows()[2].getAttribute("aria-disabled"), "true", "a disabled option is a row that is not to be chosen");
  assert.equal(menu().getAttribute("role"), "listbox");
  assert.equal(menu().style.minWidth, "120px", "as wide as the trigger at least");
  // A press on the trigger again closes it (a toggle), the focus staying.
  mouse("pointerdown", select);
  mouse("mousedown", select);
  await settle();
  assert.ok(!menu(), "a press on the select again closes the menu");
  assert.deepEqual(heard, [], "nothing chosen, nothing sent");
}

// ---------- the pointer chooses ----------
{
  mouse("mousedown", select);
  await settle();
  mouse("pointermove", rows()[3]);
  assert.ok(rows()[3].classList.contains("is-active") && !rows()[0].classList.contains("is-active"), "the row under the pointer is lit");
  mouse("pointermove", rows()[2]);
  assert.ok(!rows()[2].classList.contains("is-active"), "a disabled row is not lit");
  mouse("click", rows()[2]);
  assert.ok(menu(), "a click on a disabled row chooses nothing and leaves the menu");
  mouse("pointerdown", rows()[1]);
  mouse("click", rows()[1]);
  await settle();
  assert.ok(!menu(), "a click on a row closes the menu");
  assert.equal(select.value, "b", "the option is selected");
  assert.deepEqual(heard, ["input", "change"], "input, then change, once each, as the browser's popup sends them");
  assert.equal(w.DocKit.bindings.get("kind"), "b", "the bound key follows");
  assert.equal(document.activeElement, select, "the focus is back on the select");
  assert.equal(document.body.innerHTML, before, "the page is as it was: nothing added, no attribute changed (the chosen option is a state, not the file's)");
  // The same option again: no event.
  mouse("mousedown", select);
  await settle();
  mouse("click", rows()[1]);
  await settle();
  assert.deepEqual(heard, ["input", "change"], "the option already chosen: nothing sent");
}

// ---------- the keys ----------
{
  heard.length = 0;
  select.value = "a";
  select.focus();
  const down = key(select, "ArrowDown");
  assert.ok(down.defaultPrevented, "ArrowDown, which would change the value or open the popup, opens the menu");
  await settle();
  assert.ok(menu(), "open");
  assert.ok(rows()[0].classList.contains("is-active"), "the chosen option is lit first");
  key(select, "ArrowDown");
  assert.ok(rows()[1].classList.contains("is-active"), "↓ lights the next row");
  key(select, "ArrowDown");
  assert.ok(rows()[3].classList.contains("is-active"), "↓ steps over a disabled row");
  key(select, "ArrowDown");
  assert.ok(rows()[3].classList.contains("is-active"), "↓ at the last row stays");
  key(select, "ArrowUp");
  assert.ok(rows()[1].classList.contains("is-active"), "↑ goes back over it");
  key(select, "Home");
  assert.ok(rows()[0].classList.contains("is-active"), "Home");
  key(select, "End");
  assert.ok(rows()[3].classList.contains("is-active"), "End");
  const enter = key(select, "Enter");
  assert.ok(enter.defaultPrevented);
  await settle();
  assert.ok(!menu() && select.value === "d", "Enter chooses the lit row and closes");
  assert.deepEqual(heard, ["input", "change"]);
  assert.equal(document.activeElement, select, "the focus stays on the trigger");

  // Space opens; a letter jumps to the row that starts with it; Space then chooses.
  heard.length = 0;
  key(select, " ");
  await settle();
  assert.ok(menu(), "Space opens it");
  key(select, "b");
  assert.ok(rows()[1].classList.contains("is-active"), "a letter lights the first row that starts with it");
  key(select, "g");
  assert.ok(rows()[1].classList.contains("is-active"), "letters typed together are looked for together (bg is no row), a disabled row never lit");
  key(select, "a", { key: "a" });
  key(select, "Escape");
  await settle();
  assert.ok(!menu() && select.value === "d" && heard.length === 0, "Escape closes with no choice");
  assert.equal(document.activeElement, select);

  // Esc is the menu's alone: no listener of the page's sees it.
  let page = 0;
  document.addEventListener("keydown", () => page++);
  key(select, "F4");
  await settle();
  assert.ok(menu(), "F4 opens");
  key(select, "ArrowDown");
  key(select, "Escape");
  await settle();
  assert.equal(page, 0, "the keys the open menu takes reach nobody else (the editor's Esc would select the block)");
  key(select, "x");
  assert.equal(page, 1, "and a closed select's other keys go on as they did");

  // A key held down opens it once and its repeats choose nothing.
  select.value = "a";
  key(select, "Enter");
  await settle();
  assert.ok(menu(), "Enter opens it");
  key(select, "Enter", { repeat: true });
  assert.ok(menu() && select.value === "a", "the repeats of the key that opened it choose nothing");
  key(select, "Escape");
  await settle();
  assert.ok(key(select, "Enter", { repeat: true }).defaultPrevented && !menu(), "a repeat on a closed select opens nothing and is not the browser's (its popup)");

  // Alt+↓ opens, Alt+↑ chooses.
  select.value = "a";
  key(select, "ArrowDown", { altKey: true });
  await settle();
  key(select, "ArrowDown");
  key(select, "ArrowUp", { altKey: true });
  await settle();
  assert.ok(!menu() && select.value === "b", "Alt+↑ chooses the lit row");
  select.value = "a";
  heard.length = 0;
  // A composing key (an input method's) is no key of the menu's.
  const composing = key(select, "ArrowDown", { isComposing: true });
  assert.ok(!composing.defaultPrevented && !menu(), "an input method's keys are its own");
}

// ---------- closing without choosing ----------
{
  select.value = "a";
  heard.length = 0;
  mouse("mousedown", select);
  await settle();
  mouse("pointerdown", document.querySelector("#after"));
  assert.ok(!menu(), "a press outside closes it");
  assert.equal(select.value, "a");
  mouse("mousedown", select);
  await settle();
  select.remove();
  await settle();
  await settle();
  assert.ok(!menu(), "the trigger leaving the page closes it");
  document.querySelector("main").prepend(select);
  mouse("mousedown", select);
  await settle();
  select.append(new w.Option("Epsilon", "e"));
  await settle();
  assert.ok(!menu(), "its options changing under it closes it (they are stale)");
  assert.deepEqual(heard, []);
}

// ---------- left to the browser ----------
{
  for (const id of ["list", "off"]) {
    const down = mouse("mousedown", document.querySelector(`#${id}`));
    assert.ok(!down.defaultPrevented && !menu(), `a ${id === "list" ? "list box" : "disabled select"} is no popup: the browser's own`);
  }
  assert.ok(!mouse("mousedown", document.querySelector("#after")).defaultPrevented, "a press elsewhere is untouched");
  assert.ok(!mouse("mousedown", select, { button: 2 }).defaultPrevented && !menu(), "the right button's press is the context menu's");
  assert.ok(!key(select, "a").defaultPrevented, "a letter on a closed select is the browser's (it picks the option in place)");
}

// ---------- groups ----------
{
  const grouped = document.createElement("select");
  grouped.innerHTML = '<option value="">None</option><optgroup label="Fruit"><option value="apple">Apple</option><option value="pear" selected>Pear</option></optgroup><optgroup label="Off" disabled><option value="x">X</option></optgroup><option value="h" hidden>Hidden</option>';
  document.querySelector("main").append(grouped);
  mouse("mousedown", grouped);
  await settle();
  assert.deepEqual([...menu().children].map((node) => `${node.classList[0]}:${node.textContent.trim()}`), ["doc-choice-row:None", "doc-choice-group:Fruit", "doc-choice-row:Apple", "doc-choice-row:Pear", "doc-choice-group:Off", "doc-choice-row:X"], "a group is a heading, a hidden option no row");
  assert.ok(rows().find((row) => row.textContent.includes("Pear")).querySelector(".doc-choice-check"), "the selected option inside a group is checked");
  assert.equal(rows().find((row) => row.textContent.includes("X")).getAttribute("aria-disabled"), "true", "a disabled group's options are disabled");
  key(grouped, "Escape");
  await settle();
  grouped.remove();
}

// ---------- DocKit.choose ----------
{
  const button = document.querySelector("#open");
  const asked = w.DocKit.choose(button, { options: [["x", "Ex"], { value: "y", label: "Why" }, "z", { group: "More" }, { value: "q", label: "Cue", disabled: true }], value: "y" });
  await settle();
  assert.deepEqual(words(), ["Ex", "Why", "z", "Cue"], "rows from pairs, objects and bare words; a group heading is no row");
  assert.ok(rows()[1].querySelector(".doc-choice-check"), "the value given is checked");
  key(button, "ArrowDown");
  key(button, "Enter");
  assert.equal(await asked, "z", "it resolves with the value chosen");
  assert.equal(document.activeElement, button, "the focus is back on what opened it");
  assert.ok(!menu());

  const second = w.DocKit.choose(button, { options: ["a", "b"] });
  await settle();
  const toggled = w.DocKit.choose(button, { options: ["a", "b"] });
  assert.equal(await toggled, null, "called again on the anchor of an open menu it closes it");
  assert.equal(await second, null, "and the first asked is answered null");
  assert.ok(!menu());

  const controller = new w.AbortController();
  const aborted = w.DocKit.choose(button, { options: ["a"], signal: controller.signal });
  await settle();
  assert.ok(menu());
  controller.abort();
  assert.equal(await aborted, null, "a signal aborted closes it");
  assert.ok(!menu());

  const dismissed = w.DocKit.choose(button, { options: ["a"] });
  await settle();
  key(button, "Escape");
  assert.equal(await dismissed, null, "Esc answers null");

  const other = w.DocKit.choose(button, { options: ["a"] });
  await settle();
  const superseding = w.DocKit.choose(select, { options: ["b"] });
  await settle();
  assert.equal(await other, null, "one menu at a time: opening another closes the first");
  assert.equal(document.querySelectorAll(".doc-choice").length, 1);
  key(select, "Escape");
  await superseding;
  await assert.rejects(() => w.DocKit.choose({}, { options: [] }), /DocKit\.choose/, "an anchor that is no element is a mistake in the script");
}

// ---------- in a modal card the menu stands in the card ----------
{
  const dialog = document.createElement("dialog");
  dialog.setAttribute("open", "");
  dialog.innerHTML = '<select id="inside"><option>one</option><option>two</option></select>';
  document.body.append(dialog);
  mouse("mousedown", dialog.querySelector("#inside"));
  await settle();
  assert.equal(menu()?.parentElement, dialog, "a select in an open card opens its menu in the card (the page behind it is inert)");
  key(dialog.querySelector("#inside"), "Escape");
  await settle();
  dialog.remove();
}

// ---------- an export of the view leaves it out ----------
{
  mouse("mousedown", select);
  await settle();
  const copy = w.DocKit.dehydrate(document.documentElement.cloneNode(true));
  assert.ok(!copy.querySelector(".doc-choice"), "a copy of the page made while the menu is open has no menu");
  assert.ok(copy.querySelector("#kind"), "and has the select");
  key(select, "Escape");
  await settle();
}

// ---------- a select in the kit's own and the shipped blocks' sources: none draws its own popup ----------
{
  for (const file of ["src/packs/gallery/metric/kit.js"]) {
    const text = read(file);
    assert.ok(text.includes('createElement("select")'), `${file} draws a <select> (the kit opens its menu)`);
    assert.ok(!/showPicker|appearance:\s*auto/.test(text), `${file} asks for no native popup`);
  }
}

console.log("Checked the kit's choices: a <select> opens the flat menu, not the browser's popup (press, keys, groups, disabled rows, toggling, outside press, the trigger leaving, a card), DocKit.choose, nothing left on the page.");
