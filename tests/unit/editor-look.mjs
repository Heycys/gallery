import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { projectRoot } from "../../src/shared/paths.mjs";
import { IN_LAYER, LEVEL_NAMES, Z } from "../../src/shared/layers.mjs";
import { BUTTONS, TOKENS } from "../../src/editor/page/look.mjs";

// The editor's visual layer (page/ui.mjs and what it hands the popups): one style sheet per text
// however often a menu, submenu or crop window asks for it.
const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>");
globalThis.document = dom.window.document;
const { addStyle, addStyleTo, textButton } = await import("../../src/editor/page/ui.mjs");
const all = (doc = document) => [...doc.head.querySelectorAll("style[data-doc-dev]")].map((node) => node.textContent);
const sheets = (doc = document) => all(doc).filter((css) => css !== TOKENS); // the palette is every document's first sheet

addStyle(".a { color: red; }");
assert.equal(all()[0], TOKENS, "the palette (look.mjs) is the first sheet the editor puts in a document");
addStyle(".a { color: red; }");
addStyle(".b { color: blue; }");
assert.deepEqual(sheets(), [".a { color: red; }", ".b { color: blue; }"], "a sheet asked for twice is in the head once");
for (let index = 0; index < 5; index++) addStyle(".a { color: red; }"); // a menu opened five more times
assert.equal(sheets().length, 2, "opening a menu again adds nothing");

const other = new JSDOM("<!doctype html><html><head></head><body></body></html>").window.document;
addStyleTo(other, ".a { color: red; }");
addStyleTo(other, ".a { color: red; }");
addStyleTo(document, ".a { color: red; }");
assert.deepEqual(sheets(other), [".a { color: red; }"], "another document (the workbench's) gets its own copy, once");
assert.equal(sheets().length, 2, "and the page's own is not added again for it");
assert.equal(all(other)[0], TOKENS, "the workbench's document has the palette too");
assert.equal(all().filter((css) => css === TOKENS).length, 1, "once");
assert.ok([...document.head.querySelectorAll("style")].every((node) => node.hasAttribute("data-doc-dev")), "every sheet is the editor's own: an export drops it");

// One z-order (src/shared/layers.mjs): every level above one before it, all near the largest a page can
// have, the levels inside an overlay layer in their own small order, and no other file writing a number
// that big (a new layer goes into the list, not into a style as a guess).
const levels = LEVEL_NAMES.map((name) => Z[name]);
assert.ok(levels.every((value, index) => index === 0 || value === levels[index - 1] + 1), "each level is one above the one before it");
assert.ok(levels.every((value) => value > 2147480000 && value <= 2147483647), "all of them above anything a report holds");
assert.deepEqual(LEVEL_NAMES.slice(-4), ["menu", "card", "viewer", "tooltip"], "menus under cards, cards under windows, the tooltip over all");
assert.ok(Z.layer < Z.panel && Z.panel < Z.menu && Z.toast < Z.menu, "the layers under the panels, the panels under the menus");
const inside = Object.values(IN_LAYER);
assert.ok(inside.every((value, index) => value >= 1 && (index === 0 || value > inside[index - 1])), "inside a layer: tint, halo, frame, handle, button, drop line, upward from 1");
const literals = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(mjs|js|css)$/.test(entry.name) && !full.endsWith(path.join("shared", "layers.mjs")) && /\b21474[0-9]{5}\b/.test(fs.readFileSync(full, "utf8"))) literals.push(path.relative(projectRoot, full));
  }
};
walk(path.join(projectRoot, "src"));
assert.deepEqual(literals, [], "no style writes a z-index near the limit itself");

// The palette is written once (page/look.mjs): the editor's styles read its tokens and declare none
// of their own (a --ge-tx, --ge-hover ... in another file would be a second palette), and the blues
// are its --ge-accent, --ge-focus, --ge-fill, --ge-select and --ge-halo, never a literal again. The icon
// picker's styles are in the check too (Gallery's own look since 2026-11, emoji-picker/styles.mjs): only
// emoji-picker/support.mjs keeps a set of variables of its own (--c-*), for the media menu and the image's bar.
const editor = path.join(projectRoot, "src", "editor");
const sources = [];
const collect = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) collect(full);
    else if (entry.name.endsWith(".mjs")) sources.push([path.relative(editor, full).split(path.sep).join("/"), fs.readFileSync(full, "utf8")]);
  }
};
collect(editor);
const own = sources.filter(([name]) => name !== "page/look.mjs" && name !== "page/emoji-picker/support.mjs");
const redeclared = own.filter(([, text]) => /--ge-(tx|tx2|tx3|ico|ico2|ico3|bg|field|hover|press|line|edge|outline|accent|focus|fill|select|halo|shadow|shadow-pop|tip-bg|toast-bg|red|quote)\s*:/.test(text)).map(([name]) => name);
assert.deepEqual(redeclared, [], "no style declares a token of the palette again");
const blues = own.filter(([name, text]) => /#2383e2|#2783de|rgb\(3[59] 131 22[26]/i.test(text)).map(([name]) => name);
assert.deepEqual(blues, [], "no style writes the blue itself: the palette's tokens");
assert.match(TOKENS, /--ge-accent: #2783de/, "the primary-button blue is #2783de");
assert.match(TOKENS, /--ge-focus: #2383e2/, "the focus ring's is its --c-butBluFocRin");

// The one button look (page/look.mjs BUTTONS; the user's rule, restated 2026-11-09): a button carries no line
// and no ring, only a primary has a fill shown always and it is a pale blue (a translucent tint, a pale
// red for a delete), never the solid --ge-accent with white words. The palette's sheet carries it, so
// every document the editor draws in has it, and the editor's styles draw no button look of their own.
assert.ok(TOKENS.includes(BUTTONS), "the palette's sheet carries the button look");
const rules = BUTTONS.split("\n").filter((line) => line.includes("{"));
assert.ok(rules.length >= 10, "the button look has its rules");
assert.deepEqual(rules.filter((line) => /(?:border|outline): ?(?!0|none)\S|inset 0 0 0 \d/.test(line)), [], "no rule of the button look draws a line or a ring round a button");
assert.match(BUTTONS, /\.ge-btn \{[^}]*border: 0;[^}]*background: transparent/, "a button: no line, no fill");
assert.match(BUTTONS, /\.ge-btn:is\(:hover, :focus-visible\):not\([^{]*\{[^}]*var\(--ge-hover\)/, "gray under the pointer");
assert.match(BUTTONS, /\.ge-btn\[data-primary\] \{ background: var\(--ge-btn-primary\)/, "a primary is the pale blue token");
assert.match(BUTTONS, /\[data-primary\]\[data-danger\] \{ background: var\(--ge-btn-danger\)/, "a dangerous primary is the pale red");
assert.doesNotMatch(BUTTONS, /--ge-accent/, "no button is the solid blue");
assert.match(TOKENS, /--ge-btn-primary: light-dark\(rgb\(35 131 226 \/ 14%\), rgb\(67 155 255 \/ 24%\)\)/, "the pale blue is the workbench's (--btnPriBg), light and dark");
assert.match(TOKENS, /--ge-btn-danger: light-dark\(rgb\(235 87 87 \/ 14%\), rgb\(255 104 92 \/ 24%\)\)/, "the pale red is the workbench's (--btnDanBg), light and dark");
assert.match(BUTTONS, /\.ge-icon-btn:hover:not\(:disabled\) \{ color: var\(--ge-ico\); \}/, "an icon button: its icon darker under the pointer, no fill");
assert.match(BUTTONS, /\.ge-icon-btn:active:not\(:disabled\) \{ background: var\(--ge-press\)/, "and gray only while it is pressed");
const ownButtons = [];
const BUTTON_SELECTOR = /button|btn|\.nmedia-menu-(?:upload|embed)|ge-crop-(?:save|cancel)|ge-note-delete|ge-flow-add|ge-gap-add|ge-tgrow|ge-picker-add-cell/;
for (const [name, text] of own) {
  if (name.startsWith("page/board/")) continue; // the board's own forms (fb18-board): already without a line
  // Every rule of a style written in the file ("${…}" given a plain word first, as it holds braces of its own).
  for (const [, selector, body] of text.replace(/\$\{[^}]*\}/g, "X").matchAll(/([^{};]+)\{([^{}]*)\}/g)) {
    if (!BUTTON_SELECTOR.test(selector) || /^\s*(\/\/|\/\*|\*)/.test(selector.trim())) continue;
    if (/(?:^|[;\s])border: ?[1-9]|box-shadow: (?:inset )?0 0 0 1px/.test(body)) ownButtons.push(`${name}: ${selector.trim().slice(0, 70)} draws a line or a ring`);
    if (/\b(?:background|background-color): var\(--(?:ge-accent|c-bluBacAccPri)\)/.test(body) && /\bcolor: #fff/.test(body)) ownButtons.push(`${name}: ${selector.trim().slice(0, 70)} is the solid blue`);
  }
}
assert.deepEqual(ownButtons, [], "no style of a button draws a line, a ring or the solid blue of its own: the one button look");
const sample = textButton("确认", () => {}, { primary: true, danger: true, title: "t" });
assert.ok(sample.classList.contains("ge-btn") && sample.hasAttribute("data-primary") && sample.hasAttribute("data-danger") && !sample.hasAttribute("data-quiet") && sample.getAttribute("type") === "button", "textButton: the button look's class and its states as attributes");
const quiet = textButton("收起", () => {}, { quiet: true, class: "own" });
assert.ok(quiet.classList.contains("ge-btn") && quiet.classList.contains("own") && quiet.hasAttribute("data-quiet") && !quiet.hasAttribute("data-primary"), "a quiet one, with a class of its own besides");

// Every kit token the styles read without a fallback is defined somewhere: a stylesheet or style
// text declaring it, or a script setting it at run time (a quoted name). Removing a token while one
// reader is left (the code block's language button once read --doc-code-hover) would otherwise draw
// nothing, and no gate would see it.
const everything = [];
const gather = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) gather(full);
    else if (/\.(mjs|js|css)$/.test(entry.name)) everything.push(fs.readFileSync(full, "utf8"));
  }
};
gather(path.join(projectRoot, "src"));
const source = everything.join("\n");
const defined = new Set([...source.matchAll(/(--doc-[\w-]+)\s*:|["'`](--doc-[\w-]+)["'`]/g)].map((match) => match[1] || match[2]));
const readBare = [...new Set([...source.matchAll(/var\((--doc-[\w-]+)\)/g)].map((match) => match[1]))];
assert.deepEqual(readBare.filter((name) => !defined.has(name)), [], "every --doc-* token read without a fallback is declared or set somewhere");

// What is !important in the editor's styles has a reason, and is where it is declared: the gesture
// locks (page/gesture.mjs gestureLock, the one writer), a picture's inline cursor in its viewer, the
// media icons' inline size, the layer's own position, what a folded heading hides (page/fold/: none of
// it shows, whatever display its blocks have), and the room made for the ghost of blocks an Agent deleted
// (page/changes/ghost.mjs: added to whatever margin the kit's more specific rules give the block). (A formula's open box no longer needs one
// over an empty one's bar: it is a shadow over the bar, not a background against it.)
const important = sources.map(([name, text]) => [name, text.split("\n").filter((line) => /!important/.test(line) && !/^\s*(\/\/|\/\*)/.test(line)).length]).filter(([, count]) => count > 0);
assert.deepEqual(important.map(([name]) => name).sort(), ["components/image/viewer.mjs", "page/changes/ghost.mjs", "page/fold/index.mjs", "page/gesture.mjs", "page/overlay-layer.mjs"], "!important only where it has its reason");
const unexplained = important.map(([name]) => name).filter((name) => !sources.find(([source]) => source === name)[1].split("\n").some((line) => /^\s*(\/\/|\/\*|\*)/.test(line) && /!important/.test(line)));
assert.deepEqual(unexplained, [], "and each of those files says why in a comment");

console.log("Checked the editor's visual layer: one style sheet per text and document, one z-order.");
