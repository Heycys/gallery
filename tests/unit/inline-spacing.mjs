import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { prepareBlock, shownAs } from "../../src/editor/page/core.mjs";
import { instrument } from "../../src/editor/source.mjs";
import { startSpacing } from "../../src/render/kit/runtime/spacing.js";
import { ZWSP, isInlineItem, sideOf, spaceAround } from "../../src/shared/inline-spacing.mjs";
import { page } from "./page-harness.mjs";

// The space beside inline code and formulas has one rule (src/shared/inline-spacing.mjs), read by the
// kit's runtime/spacing.js for the reading view and by the editor's prepareBlock for the text it
// rebuilds: the same markup must show the same text in both, wrappers (strong, a link) crossed
// alike, whatever the writer's markup. [markup, what both show]
const CASES = [
  ["甲<code>a</code>乙", "甲 a 乙"],
  ["甲 <code>b</code> 乙", "甲 b 乙"],
  ["甲，<code>b</code>。乙", "甲，b。乙"],
  ["前<code>A</code>中间<code>B</code>后", "前 A 中间 B 后"],
  ["前<code>A</code><code>B</code>后", "前 A B 后"],
  ["甲<code>C</code> <code>D</code>乙", "甲 C D 乙"],
  ["结尾是<code>e</code>", "结尾是 e"],
  ["<code>s</code>开头", "s 开头"],
  // a wrapper between the code and the word beside it
  ["甲<strong><code>x</code>乙</strong>", "甲 x 乙"],
  ["甲<strong>乙<code>y</code></strong>丙", "甲乙 y 丙"],
  ['<a href="https://example.com/">用 <code>npm</code></a>安装', "用 npm 安装"],
  ["甲<em><strong><code>z</code></strong></em>乙", "甲 z 乙"],
  ["（<strong><code>p</code></strong>）", "（p）"],
  // formulas: the same rule, none for one left empty
  ['设<span class="doc-math-inline">\\(x\\)</span>为整数', "设 \\(x\\) 为整数"],
  ['设<strong><span class="doc-math-inline">\\(n\\)</span>个</strong>数', "设 \\(n\\) 个数"],
  ['前<span class="doc-math-inline">\\(\\)</span>后', "前后"],
  ['前<span class="doc-math-inline">\\(\\)</span><code>z</code>后', "前 z 后"],
  // a link shown with its icon: its title is text as any other; one left empty is not there
  ['甲<a class="doc-link-mention" href="https://example.com/"><span class="doc-link-mention-icon"></span>标题</a><code>m</code>文', "甲标题 m 文"],
  ['甲<a class="doc-link-mention"></a><code>q</code>乙', "甲 q 乙"],
];

const source = page(CASES.map(([markup], index) => `    <p>${markup}</p>`).join("\n"));
const hostsOf = (document) => [...document.querySelectorAll("main p")];

// The reading view: the kit's runtime spaces the page as it renders.
const reading = new JSDOM(source);
globalThis.MutationObserver = reading.window.MutationObserver;
startSpacing(reading.window.document);
await new Promise((resolve) => reading.window.addEventListener("load", resolve));
// An empty formula or link shows nothing: its gray chip in the editor and the \(\) written in the file are not text.
const readText = hostsOf(reading.window.document).map((host) => host.textContent.replaceAll("\\(\\)", ""));

// The editor: prepareBlock rebuilds each block for editing and spaces what it rebuilds.
const { html, map } = instrument(source);
const editing = new JSDOM(html).window.document;
for (const block of map.blocks) prepareBlock(editing.querySelector(`[data-ge-block="${block.id}"]`), block);
const editText = hostsOf(editing).map((host) => {
  host.querySelectorAll("[data-ge-empty]").forEach((chip) => chip.remove());
  return host.textContent.replaceAll(ZWSP, "");
});

CASES.forEach(([markup, shown], index) => {
  assert.equal(readText[index], shown, `the reading view's text for ${markup}`);
  assert.equal(editText[index], shown, `the editor's text for ${markup}`);
});

// A formula that does not read has TeX in it and stands apart from the words as any formula, its
// chip in the editor (data-ge-empty="invalid") too; only one left empty is not there.
{
  const { document } = new JSDOM('<p><span class="doc-math-inline" data-ge-empty="invalid"><i>无效的公式</i></span><span class="doc-math-inline" data-ge-empty="formula"><i>新公式</i></span></p>').window;
  const [invalid, empty] = document.querySelectorAll(".doc-math-inline");
  assert.equal(isInlineItem(invalid), true, "one that does not read is a formula to the rule");
  assert.equal(isInlineItem(empty), false, "one left empty is none");
}

// Looked at from a text node (typing beside inline code): out of a wrapper, as for the element.
{
  const { document } = new JSDOM('<p>甲<code>c</code><strong>乙</strong></p><p><a href="#">甲</a><code>d</code>乙</p>').window;
  const [first, second] = document.querySelectorAll("p");
  assert.equal(sideOf(first.querySelector("strong").firstChild, false), true, "code before a text in a wrapper");
  assert.equal(sideOf(second.querySelector("a").firstChild, true), true, "code after a text at the end of a link");
  assert.equal(sideOf(first.firstChild, false), null, "nothing before the line's first text");
  assert.equal(sideOf(first.querySelector("code"), true), "乙", "a character through a wrapper");
  // One made after the block was prepared (the paste, the format bar): the same spaces.
  const made = document.createElement("code");
  made.textContent = "n";
  first.querySelector("strong").append(made);
  const { before, after } = spaceAround(made);
  assert.ok(before && !after && first.textContent === "甲c乙 n", "spaced from the word before it inside the wrapper, none at the line's end");
}

// A text block on an inline tag (a span, a label): the edge of its line is the block itself, so the
// words of its neighbours outside it take no part, and shownAs (on a detached element) agrees.
{
  const { document } = new JSDOM('<div><span>来源</span><span class="b">用<code>x</code></span><span>甲</span></div>').window;
  const host = document.querySelector(".b");
  const inner = host.innerHTML;
  const shown = shownAs(host, inner);
  const prepared = prepareBlock(host, { inner, atoms: [], kind: "flow" });
  assert.equal(shown, "用 <code>x</code>", "shownAs spaces the code from the word inside the block only");
  assert.equal(prepared, shown, "prepareBlock agrees with shownAs for a block on an inline tag");
  assert.equal(host.textContent, "用 x", "no space put in for a neighbour outside the block");
}

console.log("Checked inline spacing: the reading view's runtime and the editor's prepareBlock show the same text for the same markup (code and formulas beside words, across strong and links, beside one another, beside empty formulas and links, link views), and the shared rule read from an element or a text node.");
