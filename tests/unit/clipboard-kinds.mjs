import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { APART, BASIC_UNITS, BLOCK_TYPES, COMPONENTS, COPIED_AS_ITSELF, HOSTS, TEXT_TYPES, UNIT_CATEGORY, accepts, askClipboard, clipboardOf, unitClipboard } from "../../src/editor/components/registry.mjs";
import { WRITERS } from "../../src/editor/page/clipboard/own/writers.mjs";

// The kinds of `clipboard` (docs/editor.md, "Copying blocks"): every block type and unit kind that can
// be copied or written out goes by a kind or, on purpose, by the paragraph default, and every kind has
// the writers it needs, in the one table the copy and the page export share. A component added with
// no `clipboard` fails here until it says what it is, or is listed as a paragraph below.

// What says no kind on purpose: the text blocks that are paragraphs, and an item and a node, which a
// list writes around them (their text/html is their `html`).
const PARAGRAPH_TYPES = ["paragraph", "note", "item", "step"];
// Types no copy ever describes and no paste makes: a part of its block (a tab of a Sheet area, written
// with it), and what is no block of the flow (a detail card).
const NOT_COPIED_TYPES = ["tab", "dialog"];
// The one unit kind that is written as a paragraph.
const PARAGRAPH_UNITS = ["paragraph"];

const { document } = new JSDOM("<!doctype html><html></html>").window;
const UNITS = Object.assign({}, ...COMPONENTS.map((component) => component.units ?? {}));
// What a copy can describe: not those, nor what is no block of its own (a column, which goes with its row).
const described = (type) => !NOT_COPIED_TYPES.includes(type) && UNITS[BLOCK_TYPES[type].kind]?.block !== false;

// An element of a unit kind, as the file writes one.
function elementOf(kind) {
  const rule = UNITS[kind].match?.[0];
  const tag = [rule?.tag].flat()[0] ?? "div";
  const element = document.createElement(tag);
  if (rule?.class) element.className = rule.class;
  element.setAttribute("data-ge-unit-kind", kind);
  return element;
}

/** What is wrong with the definitions as written by `writers`: a kind with no writer among them. */
function problemsWith(writers) {
  const out = [];
  for (const [type, spec] of Object.entries(BLOCK_TYPES)) {
    const clip = clipboardOf(type);
    const asParagraph = PARAGRAPH_TYPES.includes(type) || NOT_COPIED_TYPES.includes(type);
    if (asParagraph === Boolean(spec.clipboard?.kind)) out.push(`type ${type}: ${asParagraph ? "says a kind and is listed as saying none" : "says no kind and is not listed as a paragraph on purpose"}`);
    if (!described(type) || COPIED_AS_ITSELF.has(spec.kind)) continue;
    if (!writers[clip.kind]?.copied) out.push(`type ${type}: no writer of a description for the kind ${clip.kind}`);
    if (!writers[clip.html ?? clip.kind]?.html) out.push(`type ${type}: no writer of text/html for ${clip.html ?? clip.kind}`);
  }
  for (const kind of Object.keys(UNITS)) {
    const clip = unitClipboard(elementOf(kind));
    if (PARAGRAPH_UNITS.includes(kind) !== (clip.kind === "paragraph")) out.push(`unit ${kind}: goes by the kind ${clip.kind}, ${PARAGRAPH_UNITS.includes(kind) ? "listed as a paragraph" : "not listed as a paragraph"}`);
    if (!writers[clip.kind]?.exported) out.push(`unit ${kind}: no writer of an element for the kind ${clip.kind}`);
  }
  return out;
}

assert.deepEqual(problemsWith(WRITERS), []);
const [type, { kind: unitKind, clipboard: { kind: written } }] = Object.entries(BLOCK_TYPES).find(([name, spec]) => spec.clipboard?.kind && described(name) && !COPIED_AS_ITSELF.has(spec.kind));
const { [written]: writer, ...withoutOne } = WRITERS;
assert.ok(writer, `the table has a writer for ${type}'s kind`);
assert.ok(problemsWith(withoutOne).some((problem) => problem.startsWith(`type ${type}:`)), "a kind with no writer fails");
assert.ok(problemsWith(withoutOne).some((problem) => problem.startsWith(`unit ${unitKind}:`)), "and on the element of the unit that goes by it");

// Each of a unit's elements goes by its own (`of`): a list's kinds, a heading's levels, a diff.
const element = (html) => {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template.content.firstElementChild;
};
assert.equal(unitClipboard(element('<ul data-ge-unit-kind="list"></ul>')).kind, "bullet");
assert.equal(unitClipboard(element('<ol data-ge-unit-kind="list"></ol>')).kind, "number");
assert.equal(unitClipboard(element('<ul class="doc-todo" data-ge-unit-kind="list"></ul>')).kind, "todo");
assert.deepEqual(unitClipboard(element('<h3 data-ge-unit-kind="heading"></h3>')).level, 3);
assert.deepEqual(unitClipboard(element('<h6 data-ge-unit-kind="heading"></h6>')).level, 4, "no level past #### (no type stands for h5 and h6)");
assert.equal(unitClipboard(element('<div class="doc-diff" data-ge-unit-kind="block"></div>')).kind, "code");
assert.equal(unitClipboard(element('<div class="doc-filter" data-ge-unit-kind="block"></div>')).kind, "words");

// The writers both ways go by the same word: a kind with no entry at all is a slip of the name.
const kinds = new Set([...Object.keys(BLOCK_TYPES).flatMap((name) => [clipboardOf(name).kind, clipboardOf(name).html].filter(Boolean)),
  ...Object.keys(UNITS).map((kind) => unitClipboard(elementOf(kind)).kind)]);
assert.deepEqual([...kinds].filter((kind) => !WRITERS[kind]), [], "a kind no writer has");

// Who speaks for an element is the unit it is: a hook of the first type of a kind is its unit's. A
// hook on a later type of a kind (or on a kind that says `of`) would be asked of no element, so each
// kind's types say alike.
for (const hook of ["describe", "across", "piece", "endsIn"]) {
  for (const [name, spec] of Object.entries(BLOCK_TYPES)) {
    if (spec.clipboard?.[hook]) assert.equal(unitClipboard(elementOf(spec.kind))[hook], spec.clipboard[hook], `type ${name}: its ${hook} is asked of no element of its unit`);
  }
}
// Each element by what it is, whatever the class of another component it has besides: the kind first,
// then the kind its tag gives it, then the mark it carries.
const asked = (html, hook) => {
  const node = element(html);
  return askClipboard(hook, node, { isHost: () => false, walk: () => ["walked"], holdsAll: () => false, holding: () => [], colorOf: () => null, blocksIn: () => [], boxesOf: () => [], holdsAny: () => false, groupItems: (blocks) => blocks, startsIn: () => false, serializeInner: () => "", describe: () => null, sizeValue: () => null, plain: () => "" });
};
assert.deepEqual(asked('<ul class="doc-summary" data-ge-unit-kind="highlight"><li>甲</li></ul>', "across"), ["walked"], "a list by its tag, whatever kind a class gave it");
assert.equal(asked('<div class="doc-panel" data-ge-unit-kind="block"></div>', "describe")?.type, "highlight", "a block with a highlight block's class is copied as one");
assert.deepEqual(asked('<div data-doc-sheets="a" data-ge-unit-kind="block"><div class="doc-sheet-tabs"><button class="doc-sheet-tab" data-sheet-tab="x"></button></div></div>', "endsIn"), [], "and one with a Sheet area's attribute and tabs is one to a selection that ends in it");
assert.equal(asked('<div data-doc-sheets="a" data-ge-unit-kind="block"><p></p></div>', "endsIn"), undefined, "with no tabs, none");
assert.deepEqual(asked('<section class="doc-sheet-shell doc-panel" data-doc-sheets="a" data-ge-unit-kind="sheets"><div class="doc-sheet-tabs"><button class="doc-sheet-tab" data-sheet-tab="x"></button></div></section>', "endsIn"), [], "a Sheet area with a highlight block's class is a Sheet area to a selection too");
assert.equal(asked('<div data-doc-sheets="a" data-ge-unit-kind="block"></div>', "describe"), undefined, "but no Sheet area to a copy of the block");
assert.deepEqual(asked('<hr class="doc-panel" data-ge-unit-kind="highlight">', "describe")?.type, "divider", "an hr is a divider whatever its class");
assert.equal(asked('<p data-ge-unit-kind="paragraph"></p>', "describe"), undefined, "a text block's description is no hook's");

// What a page may make again from the clipboard says what it must be; what no copy carries is refused.
for (const [type, spec] of Object.entries(BLOCK_TYPES)) {
  if (TEXT_TYPES.has(type) || !described(type) || COPIED_AS_ITSELF.has(spec.kind)) continue;
  assert.ok(spec.clipboard?.check, `type ${type}: no \`check\`, so that it can never be pasted`);
}

// The text after a caret goes on in the last text block of what is pasted there, else in a paragraph
// after it (page/clipboard/index.mjs lastLine), in the first box out that takes one: a box that takes no
// paragraph takes only basic blocks with a text block of their own, so that none stands in it.
const BOXES = Object.assign({}, ...COMPONENTS.map((component) => component.boxes ?? {}));
const takesAnyText = (kind) => !HOSTS[kind].caps({ bound: false, blockLevel: true }).includes("plain");
const noParagraph = Object.keys(BOXES).filter((box) => !accepts(box, "paragraph"));
assert.deepEqual(noParagraph.sort(), ["columns", "flowchart", "list", "tabs"], "the boxes that take no paragraph");
for (const box of noParagraph) {
  for (const [type, spec] of Object.entries(BLOCK_TYPES)) {
    if (!described(type) || !accepts(box, spec.kind)) continue;
    assert.ok(BASIC_UNITS.has(spec.kind) && (spec.box ? BOXES[spec.box].firstBlock === "paragraph" : takesAnyText(spec.host ?? "flow")), `${type} in ${box}: no text block of its own for the text after a caret`);
  }
}

// A detail card, no block of the flow, is written after it by the same writers.
assert.equal(unitClipboard(elementOf("dialog")).kind, "toggle", "a detail card goes by the kind of a disclosure");
assert.deepEqual(Object.values(UNITS).filter((unit) => unit.clipboard?.apart).map((unit) => unit.clipboard.kind), ["toggle"], "and it is the one thing written apart");
assert.equal(APART, "dialog.doc-dialog", "found by its element");

// Copied as itself, whatever it is called: every card, and a unit that says so.
for (const [kind, unit] of Object.entries(UNITS)) assert.equal(COPIED_AS_ITSELF.has(kind), UNIT_CATEGORY[kind] === "card" || unit.copy === "itself", `unit ${kind}`);

console.log(`Checked the clipboard's kinds: ${Object.keys(BLOCK_TYPES).length} block types and ${Object.keys(UNITS).length} unit kinds each by a kind or a paragraph on purpose, ${Object.keys(WRITERS).length} writers, a kind with no writer failing, and each hook asked of the unit that owns it.`);
