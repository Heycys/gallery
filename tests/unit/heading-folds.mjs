import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { FOLDS_KEY, foldsOf, keepFolds } from "../../src/editor/page/outline/folds.mjs";
import { ends, foldable, headingOf, hiddenAfter, keyOf, sectionAfter, stepOver, takenWith } from "../../src/editor/page/fold/rule.mjs";
import { captureLayout, markKinds } from "../../src/editor/page/core.mjs";
import { instrument } from "../../src/editor/source.mjs";

// Folding a heading's section (editor/page/fold/), its pure part (fold/rule.mjs): which headings fold,
// what a fold takes in (the outline's rule of what nests under a heading, in the heading's box), what
// goes with a folded heading (a section it covers whole taken instead), where Ctrl+Shift+↑/↓ takes one,
// and the keys it is kept by in the browser (beside the outline's, never in them).

// A page as the editor has it once it edits: units and boxes marked, their kinds known.
function page(body) {
  const { html, map } = instrument(`<main class="doc-page"><header class="doc-header"><h1 class="doc-title">报告</h1></header>${body}</main>`);
  const { document } = new JSDOM(html).window;
  markKinds(document, map);
  captureLayout(document, map);
  const main = document.querySelector("main");
  const at = (text) => [...main.querySelectorAll("[data-ge-unit][data-ge-block]")].find((node) => node.textContent.trim() === text);
  const words = (nodes) => nodes.map((node) => node.localName === "section" ? `section(${node.querySelector("h2, h3")?.textContent})` : node.textContent.trim().split(/\s+/)[0]);
  return { document, main, at, words };
}

// ---------- which headings fold ----------
{
  const { document, at } = page(`
    <h2>主</h2><p>正文</p>
    <section class="doc-section"><h3>分区里</h3><p>甲</p></section>
    <div class="doc-panel"><h2>高亮里</h2><p>乙</p></div>
    <div class="doc-columns"><div class="doc-column"><h3>栏里</h3></div><div class="doc-column"><p>右</p></div></div>
    <details class="doc-details"><summary>折叠</summary><div class="doc-details-content"><h4>折叠里</h4><p>丙</p></div></details>
    <ul><li>项<h3>项里</h3></li></ul>
    <h2></h2>
    <dialog class="doc-dialog"><h3>卡片里</h3></dialog>`);
  for (const text of ["主", "分区里", "高亮里", "栏里", "折叠里"]) assert.equal(foldable(at(text)), true, `${text}: a heading the outline lists, straight in a box`);
  assert.equal(foldable(document.querySelector(".doc-title")), false, "the report's title");
  assert.equal(foldable(document.querySelector("li h3") ?? document.createElement("h3")), false, "a heading in a list item");
  assert.equal(foldable(document.querySelector("dialog h3")), false, "a detail card's");
  assert.equal(foldable([...document.querySelectorAll("main > h2")].at(-1)), false, "a heading with no words");
  assert.equal(foldable(at("正文")), false, "a paragraph");
}

// ---------- what a fold takes in ----------
{
  const { document, at, words } = page(`
    <h2>一</h2><p>一甲</p><h3>小节</h3><p>小节正文</p><h4>细</h4><p>细文</p>
    <section class="doc-section"><h3>只有三级</h3><p>s</p></section>
    <div class="doc-columns"><div class="doc-column"><h3>栏</h3></div><div class="doc-column"><p>右</p></div></div>
    <script>void 0</script>
    <div class="doc-table-meta">范围</div><div class="doc-table-wrap"><table class="doc-table"><tr><td>1</td></tr></table></div>
    <p>表后</p>
    <section class="doc-section"><h2>含二级</h2><p>t</p></section>
    <h2>二</h2><p>二甲</p>
    <section data-doc-sheets="s"><div class="doc-sheet-tabs"><button class="doc-sheet-tab" data-sheet-tab="a">甲</button></div><div data-doc-sheet="a"><h2>表里二级</h2></div></section>
    <p>选项卡后</p>`);
  assert.deepEqual(words(sectionAfter(at("一"))), ["一甲", "小节", "小节正文", "细", "细文", "section(只有三级)", "栏右", "1", "表后"], "an h2: up to the next block holding an h2 (an h3's section and a row of h3s go in; a script is no block of it)");
  const meta = document.querySelector(".doc-table-meta");
  assert.ok(meta.hasAttribute("data-ge-lead") && !meta.hasAttribute("data-ge-unit"), "the table's scope line is its lead, no unit of its own (it goes with its table)");
  assert.deepEqual(words(sectionAfter(at("小节"))), ["小节正文", "细", "细文"], "an h3 ends at a section holding an h3, not at an h4");
  assert.deepEqual(words(sectionAfter(at("细"))), ["细文"], "an h4 ends at the section holding an h3");
  assert.deepEqual(words(sectionAfter(at("二"))), ["二甲"], "a tabs area holding an h2 ends an h2");
  assert.deepEqual(words(sectionAfter(at("含二级"))), ["t"], "never past its box");
  assert.equal(ends(at("小节"), 2), false);
  assert.equal(ends(at("一"), 2), true);
}
{
  const { at, words } = page(`<h2>一</h2><p>甲</p><div class="doc-columns"><div class="doc-column"><h2>栏里二级</h2></div><div class="doc-column"><p>右</p></div></div><p>后</p>`);
  assert.deepEqual(words(sectionAfter(at("一"))), ["甲"], "a row of columns holding an h2 ends it");
}
// What a fold hides: all that shows of its section, a block or not (the user's 2026-11-17: of an h3's
// two h4s one stayed in sight, folded). An h4 the parser closed with an </h3> has no end tag of its own
// in the file, an unclosed paragraph none either: no units, shown all the same, as are a <header> and an
// element of the report's own name among the blocks; what shows nothing (a script, a detail card's
// dialog) is left as it is, and only a block ends the section.
{
  const { main, at } = page(`
    <h3>节</h3><p>甲</p><h4>细一</h4><p>细一文</p><h4>细二</h3><p>细二文</p>
    <p>未闭合<h4>细三</h4>
    <header><p>页眉里</p></header><probe-box><p>自定义里</p></probe-box>
    <script>void 0</script><dialog class="doc-dialog"><h3>卡片里</h3></dialog>
    <h3>下一节</h3><p>乙</p>`);
  const tags = (nodes) => nodes.map((node) => `${node.localName}:${node.textContent.trim()}`);
  const strays = [...main.children].filter((node) => /^(h4|p|header|probe-box)$/.test(node.localName) && !node.matches("[data-ge-unit], .doc-header")).map((node) => node.localName);
  assert.deepEqual(strays, ["h4", "p", "header", "probe-box"], "the h4 closed by </h3>, the unclosed paragraph, the header and the report's own element are no units");
  assert.deepEqual(tags(sectionAfter(at("节"))), ["p:甲", "h4:细一", "p:细一文", "p:细二文", "h4:细三"], "its units");
  assert.deepEqual(tags(hiddenAfter(at("节"))), ["p:甲", "h4:细一", "p:细一文", "h4:细二", "p:细二文", "p:未闭合", "h4:细三", "header:页眉里", "probe-box:自定义里"],
    "what it hides: every element shown up to the next h3, a unit or not; the script and the dialog left");
}

// ---------- what goes with a folded heading ----------
{
  const { main, at, words } = page(`
    <h2>一</h2><p>一甲</p><h3>小节</h3><p>小节正文</p>
    <h2>二</h2><p>二甲</p>
    <section class="doc-section"><hr><h2>三</h2><p>三甲</p><p>三乙</p></section>
    <section class="doc-section"><h2>四</h2><p>四甲</p></section>
    <section class="doc-section"><p>引言</p><h2>五</h2><p>五甲</p></section>`);
  const folds = new Set();
  const opts = { isFolded: (node) => folds.has(node), hiddenBy: (node) => (folds.has(node) ? sectionAfter(node) : []) };
  assert.deepEqual(words(takenWith([at("一")], opts)), ["一"], "a heading not folded goes alone");
  folds.add(at("一"));
  folds.add(at("小节"));
  assert.deepEqual(words(takenWith([at("一")], opts)), ["一", "一甲", "小节", "小节正文"], "folded, with what it hides, a fold inside it too");
  assert.deepEqual(words(takenWith([at("二"), at("一"), at("一甲")], opts)), ["一", "一甲", "小节", "小节正文", "二"], "in document order, each once");
  folds.add(at("三"));
  folds.add(at("四"));
  folds.add(at("五"));
  assert.deepEqual(words(takenWith([at("三")], opts)), ["section(三)"], "a section it covers whole, but for a divider before it: the section");
  assert.deepEqual(words(takenWith([at("四")], opts)), ["section(四)"], "the heading and what it hides are the section");
  assert.deepEqual(words(takenWith([at("五")], opts)), ["五", "五甲"], "a paragraph before it: not the section");
  assert.equal(main.querySelectorAll("section").length, 3);
}

// ---------- Ctrl+Shift+↑/↓: a section at a time ----------
{
  const { at, words } = page(`<h2>一</h2><p>一甲</p><h2>二</h2><p>二甲</p><p>二乙</p><h1>大</h1><p>大甲</p><h2>三</h2><p>三甲</p>`);
  const span = (step) => step && words([step.first, step.last]);
  assert.deepEqual(span(stepOver(at("一"), 1)), ["二", "二乙"], "down: past the next section of its level");
  assert.deepEqual(span(stepOver(at("二"), 1)), ["大", "大甲"], "down onto an h1: past its own words, before its first h2");
  assert.deepEqual(span(stepOver(at("三"), -1)), ["大", "大甲"], "up: back to the block that ends a section of its level");
  assert.deepEqual(span(stepOver(at("二"), -1)), ["一", "一甲"], "up past the section before");
  assert.equal(stepOver(at("一"), -1), null, "nothing before");
  assert.equal(stepOver(at("三"), 1), null, "nothing after");
}
{
  const { at, words } = page(`<p>开头</p><p>开头二</p><h2>一</h2><p>一甲</p>`);
  const step = stepOver(at("一"), -1);
  assert.deepEqual(words([step.first, step.last]), ["开头", "开头二"], "no heading before it: past the blocks the box starts with");
}

// ---------- the keys it is kept by ----------
{
  const { document, at } = page(`<h2 data-block-id="aaaaaaaa">有号</h2><h2>同名</h2><p>x</p><h2>同名</h2><h3>同名</h3>`);
  const all = () => [...document.querySelectorAll("main h2, main h3")].filter(foldable);
  const [first, second] = all().filter((node) => node.localName === "h2" && node.textContent === "同名");
  assert.equal(keyOf(at("有号"), all()), "b:aaaaaaaa", "by its block id");
  assert.equal(keyOf(first, all()), "t:h2:同名#0", "with none: its tag, its words and its place among them");
  assert.equal(keyOf(second, all()), "t:h2:同名#1", "two of a name told apart");
  assert.equal(keyOf(document.querySelector("main h3"), all()), "t:h3:同名#0", "another tag counts on its own");
  assert.equal(headingOf("t:h2:同名#1", all()), second);
  assert.equal(headingOf("b:aaaaaaaa", all()), at("有号"));
  first.setAttribute("data-block-id", "bbbbbbbb"); // a save gave it its id since
  assert.equal(headingOf("t:h2:同名#0", all()), first, "a words key finds it once it has an id too");
  assert.equal(headingOf("t:h2:同名#2", all()), null);
  assert.equal(headingOf("b:gone", all()), null);

  const values = new Map([[FOLDS_KEY, JSON.stringify({ folds: { a: ["b:x"] } })]]);
  const storage = { get: (key) => values.get(key) ?? null, set: (key, value) => values.set(key, value) };
  keepFolds(storage, "a", new Set(["t:h2:同名#0", "b:gone"]), new Set(["t:h2:同名#0"]), "gallery-edit:heading-folds");
  assert.deepEqual(JSON.parse(values.get("gallery-edit:heading-folds")), { folds: { a: ["t:h2:同名#0"] } }, "kept under its own key, only what the page has");
  assert.deepEqual([...foldsOf(storage, "a", "gallery-edit:heading-folds")], ["t:h2:同名#0"]);
  assert.deepEqual([...foldsOf(storage, "a")], ["b:x"], "the outline's folds untouched");
}

console.log("Checked heading folds: which headings fold (those the outline lists, straight in a box, with words), what a fold takes in (the outline's nesting in the heading's box, a table's scope line with it, never past the box) and hides (all that shows of it, a block or not), what goes with a folded heading (what it hides, folds inside it, a section it covers whole), Ctrl+Shift+↑/↓ a section at a time, and the keys it is kept by beside the outline's.");
