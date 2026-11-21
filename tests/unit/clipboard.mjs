import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

// Copying blocks and selected text (src/editor/page/clipboard/own/index.mjs) and making a section of selected blocks
// (components/section wrapCheck / wrapSection), in jsdom: what can be copied, the clipboard's formats,
// that pasted data is checked and its inline HTML sanitized again, and that only neighbours in the
// page or a Sheet panel become a section.

const dom = new JSDOM(`<main class="doc-page" data-doc-id="r" data-ge-box="0" data-ge-box-kind="main">
  <p id="a" contenteditable="true" data-ge-block="1" data-ge-unit="1" data-ge-unit-kind="paragraph">正文<strong>加粗</strong></p>
  <h2 id="b" contenteditable="true" data-ge-block="2" data-ge-unit="2" data-ge-unit-kind="heading">标题</h2>
  <ul id="list" data-ge-unit="3" data-ge-unit-kind="list" data-ge-box="1" data-ge-box-kind="list">
    <li id="i1" contenteditable="true" data-ge-block="3" data-ge-unit="4" data-ge-unit-kind="item">一</li>
    <li id="i2" contenteditable="true" data-ge-block="4" data-ge-unit="5" data-ge-unit-kind="item" data-ge-box="2" data-ge-box-kind="nest">二<ul data-ge-unit="6" data-ge-unit-kind="list" data-ge-box="3" data-ge-box-kind="list" contenteditable="false"><li contenteditable="true" data-ge-block="5" data-ge-unit="7" data-ge-unit-kind="item">二.一</li></ul></li>
  </ul>
  <div id="panel" class="doc-panel" data-ge-unit="8" data-ge-unit-kind="highlight" data-ge-box="4" data-ge-box-kind="highlight">
    <div class="doc-icon" data-ge-unit="16" data-ge-unit-kind="icon" data-ge-icon="💡"><img alt="💡" src="data:image/svg+xml;base64,AA=="></div>
    <p contenteditable="true" data-ge-block="6" data-ge-unit="9" data-ge-unit-kind="paragraph">面板里的一段</p>
  </div>
  <hr id="rule" data-ge-unit="10" data-ge-unit-kind="rule">
  <div id="code" class="doc-code" data-ge-unit="11" data-ge-unit-kind="code"><div class="doc-code-title">a.js</div><pre data-ge-code="7"></pre></div>
  <figure id="card" class="doc-figure" data-ge-unit="12" data-ge-unit-kind="figure" data-block-id="fa000001"><h3 contenteditable="true" data-ge-block="8">卡片</h3><div data-doc-chart="dots" class="doc-chart"><script type="application/json">{"a":1}</script><svg></svg></div></figure>
  <div id="widget" class="own-widget" data-ge-unit="15" data-ge-unit-kind="block">自己的</div>
  <section id="sec" class="doc-section" data-ge-unit="13" data-ge-unit-kind="section" data-ge-box="5" data-ge-box-kind="section">
    <p contenteditable="true" data-ge-block="9" data-ge-unit="14" data-ge-unit-kind="paragraph">分区里</p>
  </section>
  <div id="cols" class="doc-columns" data-ge-unit="17" data-ge-unit-kind="columns" data-ge-box="6" data-ge-box-kind="columns">
    <div class="doc-column" data-ge-unit="18" data-ge-unit-kind="column" data-ge-box="7" data-ge-box-kind="column"><p contenteditable="true" data-ge-block="10" data-ge-unit="19" data-ge-unit-kind="paragraph">左栏</p></div>
    <div class="doc-column" data-ge-unit="20" data-ge-unit-kind="column" data-ge-box="8" data-ge-box-kind="column"><p contenteditable="true" data-ge-block="11" data-ge-unit="21" data-ge-unit-kind="paragraph">右栏</p></div>
  </div>
</main>`);
// clipboard/own/ reads the page's document and Node; put back as they were at the end.
const saved = { document: globalThis.document, Node: globalThis.Node, DocKit: globalThis.DocKit };
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
// The kit's runtime takes what it drew off a copy (render/kit/runtime): as it does a chart's here.
globalThis.DocKit = { dehydrate(root) {
  root.querySelectorAll("[data-doc-chart] > :not(script)").forEach((node) => node.remove());
  root.querySelectorAll(".doc-chart").forEach((node) => { node.classList.remove("doc-chart"); if (!node.classList.length) node.removeAttribute("class"); });
} };
const { MIME, build, checkBlocks, copied, copyOf, describe, formats, joinedHtml, kindOfBlock, parse, prefixCopies, unmadeCopy } = await import("../../src/editor/page/clipboard/own/index.mjs");
const { wrapCheck, wrapSection } = await import("../../src/editor/components/section/page.mjs");
const { nodeOf, serializeInner } = await import("../../src/editor/page/core.mjs");
const { newMath } = await import("../../src/editor/components/math/page.mjs");
const { connectPages } = await import("../../src/editor/page/page-objects.mjs");
const $ = (id) => document.getElementById(id);
connectPages({ code: { textOf: (pre) => (pre.id === "code" ? "const x = 1;\nreturn x;" : null) } }); // the code block's page object
// What can be copied, as what.
assert.deepEqual(describe($("a")), { type: "paragraph", html: "正文<strong>加粗</strong>" }, "a paragraph with its marks");
assert.deepEqual(describe($("b")), { type: "heading2", html: "标题" }, "a heading");
const list = describe($("list"));
assert.deepEqual(list, { type: "bullets", blocks: [
  { type: "item", html: "一", lists: [] },
  { type: "item", html: "二", lists: [{ type: "bullets", blocks: [{ type: "item", html: "二.一", lists: [] }] }] },
] }, "a list, an item's own list with it");
assert.deepEqual(describe($("panel")), { type: "highlight", blocks: [{ type: "icon", icon: "💡" }, { type: "paragraph", html: "面板里的一段" }] }, "a panel and what it holds, its icon first");
assert.equal(formats([describe($("panel"))]).html, '<div><div class="doc-icon">💡</div><p>面板里的一段</p></div>', "its icon as the file writes one");
assert.equal(build(document, describe($("panel"))).querySelector(":scope > .doc-icon")?.getAttribute("data-ge-icon"), "💡", "pasted: a highlight block with its icon");
const fromSet = build(document, { type: "highlight", blocks: [{ type: "icon", icon: "/icons/airplane_blue.svg" }, { type: "paragraph", html: "火箭" }] }).querySelector(":scope > .doc-icon");
assert.equal(fromSet?.getAttribute("data-icon"), "/icons/airplane_blue.svg", "pasted: a set's icon carries data-icon as the file's does (the kit colors it by that)");
assert.equal(build(document, describe($("panel"))).querySelector(":scope > .doc-icon")?.hasAttribute("data-icon"), false, "an emoji none");
assert.deepEqual(describe($("rule")), { type: "divider" });
assert.deepEqual(describe($("code")), { type: "code", text: "const x = 1;\nreturn x;", title: "a.js" }, "code with its title, even when not opened for editing");
// An excerpt numbered as in its file (its block's data-line-start) is copied with that number, and
// pasted, the new block numbers from it, which its node carries to the file (lineStart).
$("code").setAttribute("data-line-start", "038");
const excerpt = describe($("code"));
assert.deepEqual(excerpt, { type: "code", text: "const x = 1;\nreturn x;", title: "a.js", lineStart: 38 }, "an excerpt with its first line's number");
const pastedExcerpt = build(document, excerpt);
assert.equal(pastedExcerpt.getAttribute("data-line-start"), "38", "pasted, it numbers from there");
assert.equal(nodeOf(pastedExcerpt, new WeakSet()).lineStart, "38", "and the file writes it");
$("code").setAttribute("data-line-start", "0");
assert.equal(describe($("code")).lineStart, undefined, "a number that is none: none");
$("code").removeAttribute("data-line-start");
// A card is copied as itself: its markup as the kit would start it (the drawing, the kit's and the
// editor's marks, its block id and ids taken out), named by the report and its unit.
const card = describe($("card"));
const cardHtml = '<figure class="doc-figure"><h3>卡片</h3><div data-doc-chart="dots"><script type="application/json">{"a":1}</script></div></figure>';
assert.deepEqual(card, { type: "copy", kind: "figure", unit: 12, report: "r", text: '卡片{"a":1}', html: cardHtml }, "a card is copied as itself");
assert.equal(describe($("widget")), null, "a document's own widget is not");
assert.equal(kindOfBlock(card), "figure");
assert.equal(copied(document, card), $("card"));
assert.equal(copied(document, { ...card, report: "other" }), null, "only into the report it came from");
const made = build(document, card);
assert.equal(made.outerHTML, cardHtml.replace('<figure class="doc-figure">', '<figure class="doc-figure" data-ge-new="" data-ge-type="copy" data-ge-copy="12" data-ge-unit-kind="figure">').replace("<h3>", '<h3 contenteditable="true">'), "pasted, a copy the commit writes as one, its title still to edit");
assert.equal(formats([card]).html, cardHtml);
assert.equal(describe($("sec")).type, "section", "a section of text blocks");
// A row of columns is copied as itself, like a card: one description, no per-column one (a row's cards
// and tables can only be copied with it), carrying its columns (their shares and blocks), of which it is
// made anew where its unit is not (cut, another document); with a card in a column that carries nothing
// (a chart card), it cannot be, and the page is told which kind it is.
const row = describe($("cols"));
assert.deepEqual([row.type, row.kind, row.unit, row.text.replace(/\s+/g, "")], ["copy", "columns", 17, "左栏右栏"], "a row of columns is a copy of its unit");
assert.deepEqual(row.data, { type: "columns", columns: [{ blocks: [{ type: "paragraph", html: "左栏" }] }, { blocks: [{ type: "paragraph", html: "右栏" }] }] }, "carrying its columns' blocks");
assert.equal(formats([row]).text, "左栏\n\n右栏", "and says its blocks' text to other programs, one after another");
assert.equal(formats([row]).html, "<p>左栏</p><p>右栏</p>", "its HTML too");
assert.equal(unmadeCopy(document, [{ ...row, report: "other" }]), null, "elsewhere it is made of its columns");
assert.equal(unmadeCopy(null, [row]), null, "and once cut");
assert.equal(unmadeCopy(document, [{ ...row, report: "other", data: { type: "columns", columns: [{ blocks: [{ ...describe($("card")), report: "other" }] }, { blocks: [] }] } }])?.kind, "figure", "a chart card in a column of another report's row: the one that cannot be made, named by its kind");
const rowElsewhere = build(document, parse(JSON.stringify({ v: 1, blocks: [{ ...row, report: "other" }] }))[0]);
assert.deepEqual([rowElsewhere.className, rowElsewhere.querySelectorAll(":scope > .doc-column").length, rowElsewhere.textContent], ["doc-columns", 2, "左栏右栏"], "made anew of its columns in another report");
assert.equal(kindOfBlock(list), "list");

// A formula block is copied as its TeX (a block the page makes: not "as itself"); an empty one as an
// empty one; one inside a section goes with it.
const formula = newMath(document, "x^2 < 1");
$("sec").append(formula);
assert.deepEqual(describe(formula), { type: "math", tex: "x^2 < 1" }, "a formula block as its TeX, as the block keeps it");
assert.equal(describe($("sec"))?.blocks.at(-1).tex, "x^2 < 1", "and in a section");
assert.equal(kindOfBlock({ type: "math", tex: "x" }), "math");
const emptyFormula = newMath(document);
assert.deepEqual(describe(emptyFormula), { type: "math", tex: "" }, "an empty one as an empty one");
assert.equal(build(document, { type: "math", tex: "" }).querySelector(".ge-math-chip").childNodes.length, 0, "an empty formula block built from it");
assert.equal(serializeInner(build(document, describe(formula))), "\\[x^2 &lt; 1\\]", "pasted, a formula block with the same TeX");
assert.equal(serializeInner(build(document, describe(emptyFormula))), "\\[\\]", "and an empty one stays \\[\\]");
assert.equal(formats([describe(formula)]).text, "$$\nx^2 < 1\n$$", "Markdown: a $$ block");
assert.equal(formats([describe(formula)]).html, "<p>$$x^2 &lt; 1$$</p>", "HTML: its TeX between $$ in a paragraph");
// An empty formula block says nothing to other programs: no "$$ $$" that reads back as nothing (the
// formula is dropped, as the paste's `equation` of no TeX is), the blocks around it as they were.
assert.deepEqual(formats([describe(emptyFormula)]), { html: "", text: "" }, "an empty formula block exports nothing");
// Words that read as what opens a block (a tag, a fence) say so to a reader by a backslash, which any
// Markdown takes for the character; they read back as those words, the next block a block of its own.
assert.equal(formats([{ type: "paragraph", html: "&lt;aside&gt;" }, { type: "paragraph", html: "后" }]).text, "\\<aside>\n\n后", "a tag on a line of a paragraph");
assert.equal(formats([{ type: "paragraph", html: "一行<br>&lt;/details&gt;" }]).text, "一行\n\\</details>", "on any of its lines");
assert.equal(formats([{ type: "paragraph", html: "```js" }]).text, "\\```js", "a fence");
assert.equal(formats([{ type: "paragraph", html: "a &lt;b&gt; 3 &lt; 4" }]).text, "a <b> 3 < 4", "amid words nothing opens");
assert.equal(formats([{ type: "paragraph", html: "&lt; 4 &lt;5" }]).text, "< 4 <5", "nor a < that is no tag");
assert.equal(formats([{ type: "callout", blocks: [{ type: "paragraph", html: "&lt;/aside&gt;" }] }]).text, "<aside>\n\\</aside>\n\n</aside>", "a callout's words that read as its end");
{
  const { fromMarkdown } = await import("../../src/editor/page/clipboard/import/markdown.mjs");
  const read = (blocks) => fromMarkdown(formats(blocks).text).map(({ type, title }) => [type, title]);
  assert.deepEqual(read([{ type: "paragraph", html: "&lt;aside&gt;" }, { type: "paragraph", html: "后" }]), [["text", [["<aside>"]]], ["text", [["后"]]]], "read back: the paragraph and the next");
  const ending = [{ type: "callout", blocks: [{ type: "paragraph", html: "&lt;/aside&gt;" }] }, { type: "paragraph", html: "后" }];
  assert.deepEqual(read(ending).at(-1), ["text", [["后"]]], "the callout ends at its own end");
  assert.equal(read(ending).length, 2, "and is one block");
}

// Code holding a fence takes a longer one, which closes at no line of it; other code three, as ever.
const { fromMarkdown } = await import("../../src/editor/page/clipboard/import/markdown.mjs");
const fenced = (code) => formats([{ type: "code", language: "md", text: code }]).text;
assert.equal(fenced("a\n``b"), "```md\na\n``b\n```", "a shorter run of backticks: the usual fence");
assert.equal(fenced("```\ninner\n```"), "````md\n```\ninner\n```\n````", "one longer than its own");
assert.equal(fenced("  `````\nx"), "``````md\n  `````\nx\n``````", "than the longest, indented too");
assert.equal(fenced("x `````` y"), "```md\nx `````` y\n```", "a run within a line closes nothing");
assert.deepEqual(fromMarkdown(fenced("```\ninner\n```")).map(({ type, title }) => [type, title]), [["code", [["```\ninner\n```"]]]], "read back as the one code block");
assert.deepEqual(formats([{ type: "paragraph", html: "前" }, { type: "math", tex: "" }, { type: "paragraph", html: "后" }]), { html: "<p>前</p><p>后</p>", text: "前\n\n后" }, "and leaves no blank line of its own");
formula.remove();

// The clipboard's formats for other programs: plain markup, and Markdown as a page export writes it.
// A callout's Markdown is a page export's, as a highlight block's (writers.mjs `aside`): <aside>, the words
// of its first block, its other blocks after an empty line; its HTML a group of its blocks. Copied, it
// carries its blocks and its color, and is pasted back a callout of them (set-apart.mjs, the highlight
// block's rule).
{
  const callout = { type: "callout", blocks: [{ type: "paragraph", html: "提示<strong>加粗</strong>的话" }, { type: "bullets", blocks: [{ type: "item", html: "一", lists: [] }] }], color: "doc-highlight-green" };
  assert.deepEqual(formats([callout]).text, "<aside>\n提示**加粗**的话\n\n- 一\n\n</aside>", "a callout");
  assert.ok(/^<div[^>]*>$/.test(formats([callout]).html.split("<p>")[0]) && formats([callout]).html.endsWith("<p>提示<strong>加粗</strong>的话</p><ul><li>一</li></ul></div>"), `its HTML a group of its blocks: ${formats([callout]).html}`);
  assert.deepEqual(formats([{ type: "callout", blocks: [{ type: "paragraph", html: "一行<br>二行" }] }]).text, "<aside>\n一行\n二行\n\n</aside>", "its lines");
  assert.equal(formats([{ type: "paragraph", html: "前" }, { type: "callout", blocks: [{ type: "paragraph", html: "中" }] }, { type: "paragraph", html: "后" }]).text, "前\n\n<aside>\n中\n\n</aside>\n\n后", "an empty line around it, as any block");
  $("a").insertAdjacentHTML("afterend", '<div id="callout" class="doc-callout doc-highlight-green" data-ge-unit="50" data-ge-unit-kind="callout" data-ge-box="50" data-ge-box-kind="callout"><p contenteditable="true" data-ge-block="50" data-ge-unit="51" data-ge-unit-kind="paragraph">提示<strong>加粗</strong>的话</p><ul data-ge-unit="52" data-ge-unit-kind="list" data-ge-box="51" data-ge-box-kind="list"><li contenteditable="true" data-ge-block="51" data-ge-unit="53" data-ge-unit-kind="item">一</li></ul></div>');
  assert.deepEqual(describe($("callout")), callout, "copied: its blocks and its color");
  $("callout").remove();
  const made = build(document, callout);
  assert.ok(made.matches("div.doc-callout.doc-highlight-green") && made.getAttribute("data-ge-box-kind") === "callout" && [...made.children].map((node) => node.localName).join() === "p,ul", `pasted: a callout of them, a box of its own: ${made.outerHTML}`);
  assert.ok(parse(JSON.stringify({ v: 1, blocks: [callout] })), "which the clipboard takes back");
  // One written the old way (its words straight in it, as the editor wrote one before it held blocks): a paragraph of them.
  $("a").insertAdjacentHTML("afterend", '<div id="callout" class="doc-callout" data-ge-unit="50" data-ge-unit-kind="callout">旧的提示</div>');
  assert.deepEqual(describe($("callout")), { type: "callout", blocks: [{ type: "paragraph", html: "旧的提示" }] }, "one of words alone: a paragraph of them");
  $("callout").remove();
  // One the file has empty (the editor before 2026-11-07 wrote a callout left empty so), and a
  // highlight block of its icon alone: copied with no blocks, pasted with an empty paragraph to write
  // in (after the icon), as a box that always holds a block (holdsOne), which the commit writes.
  $("a").insertAdjacentHTML("afterend", '<div id="callout" class="doc-callout" data-ge-unit="50" data-ge-unit-kind="callout" data-ge-box="50" data-ge-box-kind="callout"></div>');
  assert.deepEqual(describe($("callout")), { type: "callout", blocks: [] }, "an empty one: copied with no blocks");
  $("callout").remove();
  const shape = (node) => [...node.children].map((child) => `${child.localName}${child.className ? `.${child.className}` : ""}`).join();
  assert.equal(shape(build(document, { type: "callout", blocks: [] })), "p", "pasted: an empty paragraph in it");
  assert.equal(shape(build(document, { type: "highlight", blocks: [{ type: "icon", icon: "💡" }] })), "div.doc-icon,p", "a highlight block of its icon alone: an empty paragraph after it");
  assert.equal(shape(build(document, { type: "highlight", blocks: [] })), "p", "and of nothing");
}

const { html, text } = formats([describe($("a")), list]);
assert.equal(html, "<p>正文<strong>加粗</strong></p><ul><li>一</li><li>二<ul><li>二.一</li></ul></li></ul>");
assert.equal(text, "正文**加粗**\n\n- 一\n- 二\n    - 二.一", "Markdown as a page export writes it (an item's list 4 spaces in)");
assert.deepEqual(Object.keys(formats([describe($("a"))])), ["html", "text"], "the two formats other programs read, no more");
assert.equal(formats([{ type: "paragraph", html: '见<a href="https://example.com/x">这里</a>' }]).text, "见这里", "a link as its text in the plain text, not as [text](address)");
assert.equal(MIME, "application/x-gallery-blocks"); // and the old application/x-report-studio-blocks beside it: tests/unit/renamed.mjs

// Pasted data is checked: a known type, blocks where their container takes them, strings.
const data = (blocks) => JSON.stringify({ v: 1, blocks });
assert.deepEqual(parse(data([{ type: "math", tex: "" }])), [{ type: "math", tex: "" }], "which reads back");
assert.deepEqual(parse(data([{ type: "math", tex: "a\\]b" }])), [{ type: "math", tex: "a\\]b" }], "and so does a TeX holding its closing delimiter, which the page keeps (components/math texText)");
assert.equal(parse(data([{ type: "math", tex: 3 }])), null, "TeX is a string");
assert.deepEqual(parse(data([list])), [list], "copied blocks read back as they were");
assert.deepEqual(parse(data([excerpt])), [excerpt], "an excerpt with its first line's number reads back");
for (const lineStart of [0, 1.5, "38", 1234567]) assert.equal(parse(data([{ ...excerpt, lineStart }])), null, `a first line's number is a whole number from 1: ${JSON.stringify(lineStart)}`);
assert.equal(parse(data([{ type: "bullets", blocks: [{ type: "paragraph", html: "x" }] }])), null, "a list holds items only");
assert.deepEqual(parse(data([{ type: "item", html: "甲", list: "todo" }])), [{ type: "item", html: "甲", list: "todo" }], "an item copied alone carries its list's kind");
assert.equal(parse(data([{ type: "item", html: "甲", list: "table" }])), null, "a kind of list only");

// A flowchart (流程图) is copied with its direction and first number (not what the kit set on it), each
// node with its blocks (its icon first, its title, its content), its color, its own direction and its
// weight in its row; read back and pasted as one, each node a step again (a node copied before its
// steps were nodes, an item, made one, its words its bold title); a node copied on its own pasted
// where no flowchart takes it is a flowchart of its own; other programs get an ordered list. A
// direction is a flowchart's or a node's alone.
{
  const holder = document.createElement("div");
  holder.innerHTML = '<ol id="flow" class="doc-flow" data-direction="row" start="2" data-doc-flow-key="4" aria-label="流程图" data-ge-unit="30" data-ge-unit-kind="flowchart" data-ge-box="30" data-ge-box-kind="flowchart">'
    + '<li id="node" class="doc-highlight-blue" data-direction="column" style="--doc-flow-ratio: 0.4" data-ge-unit="31" data-ge-unit-kind="step" data-ge-box="31" data-ge-box-kind="node"><div class="doc-icon" data-ge-unit="32" data-ge-unit-kind="icon" data-ge-icon="📮">📮</div><p contenteditable="true" data-ge-block="30" data-ge-unit="33" data-ge-unit-kind="paragraph"><strong>需求</strong></p><p contenteditable="true" data-ge-block="31" data-ge-unit="34" data-ge-unit-kind="paragraph">说明</p></li>'
    + '<li data-ge-unit="35" data-ge-unit-kind="step" data-ge-box="32" data-ge-box-kind="node"><p contenteditable="true" data-ge-block="32" data-ge-unit="36" data-ge-unit-kind="paragraph"><strong>上线</strong></p></li></ol>';
  $("a").before(holder.firstChild);
  const flow = describe($("flow"));
  const node = { type: "step", blocks: [{ type: "icon", icon: "📮" }, { type: "paragraph", html: "<strong>需求</strong>" }, { type: "paragraph", html: "说明" }], color: "doc-highlight-blue", direction: "column", ratio: "0.4" };
  assert.deepEqual(flow, { type: "flowchart", blocks: [node, { type: "step", blocks: [{ type: "paragraph", html: "<strong>上线</strong>" }] }], direction: "row", start: "2" }, "a flowchart: its nodes, its direction and its first number");
  assert.deepEqual(describe($("node")), node, "a node: its blocks, its color, direction and weight");
  assert.deepEqual(parse(data([flow])), [flow], "read back as it was");
  assert.deepEqual(parse(data([node])), [node], "a node alone too");
  assert.equal(parse(data([{ ...list, direction: "row" }])), null, "a direction on another list is refused");
  assert.equal(parse(data([{ ...flow, direction: "diagonal" }])), null, "and one that is no direction");
  assert.equal(parse(data([{ ...node, ratio: "2" }])), null, "a weight is a share");
  assert.equal(parse(data([{ type: "flowchart", blocks: [{ type: "paragraph", html: "x" }] }])), null, "a flowchart holds nodes");
  assert.equal(parse(data([{ type: "step", blocks: [{ type: "step", blocks: [] }] }])), null, "no node in a node");
  const { html, text } = formats([flow]);
  assert.equal(html, "<ol><li><p><strong>需求</strong></p><p>说明</p></li><li><p><strong>上线</strong></p></li></ol>", "other programs: an ordered list");
  assert.ok(text.startsWith("1. 📮 **需求**") && text.includes("\n    说明\n2. **上线**"), text);
  const pasted = build(document, flow);
  assert.deepEqual([pasted.localName, pasted.className, pasted.getAttribute("data-direction"), pasted.getAttribute("start"), pasted.getAttribute("data-ge-type"), pasted.hasAttribute("data-doc-flow-key"), pasted.hasAttribute("aria-label"), pasted.querySelectorAll(":scope > li").length],
    ["ol", "doc-flow", "row", "2", "flowchart", false, false, 2], "pasted: a new flowchart with its direction and start, the kit to lay it out and name it");
  const step = pasted.querySelector(":scope > li");
  assert.deepEqual([step.getAttribute("data-ge-type"), step.getAttribute("data-ge-box-kind"), step.className, step.getAttribute("data-direction"), step.style.getPropertyValue("--doc-flow-ratio"), [...step.children].map((child) => child.localName)],
    ["step", "node", "doc-highlight-blue", "column", "0.4", ["div", "p", "p"]], "each node a step with its color, direction, weight, icon and blocks");
  const legacy = parse(data([{ type: "flowchart", blocks: [{ type: "item", html: "旧步骤", lists: [] }] }]));
  assert.ok(legacy, "a flowchart of items (copied before its steps were nodes) read");
  assert.equal(build(document, legacy[0]).querySelector("li > p").innerHTML, "<strong>旧步骤</strong>", "its items made nodes, their words bold titles");
  const bare = build(document, { type: "step", blocks: [{ type: "heading3", html: "小标题" }] });
  assert.deepEqual([...bare.children].map((child) => child.localName), ["p", "h3"], "a node whose first block is no paragraph: an empty title before it");
  $("flow").remove();
}
assert.equal(parse(data([{ type: "section", blocks: [{ type: "section", blocks: [] }] }])), null, "no section in a section");
assert.equal(parse(data([{ type: "figure", html: "x" }])), null, "no type the page cannot make");
assert.equal(parse(data([{ type: "icon", icon: "💡" }])), null, "an icon only in a highlight block");
assert.equal(parse(data([{ type: "highlight", blocks: [{ type: "icon", icon: "<b>" }] }])), null, "an icon is one");
assert.deepEqual(parse(data([card])), [card], "a copy reads back");
assert.equal(parse(data([{ ...card, kind: "block" }])), null, "of a card, a table or a formula block only");
// A card (or a table) copied inside a container goes with it: the copy is checked where the box
// takes its kind, and made as the copy of its unit (the commit writes the new container with a copy
// of the unit in it).
assert.deepEqual(parse(data([{ type: "section", blocks: [card] }])), [{ type: "section", blocks: [card] }], "a copy in a section stays a copy");
assert.equal(parse(data([{ type: "quote", blocks: [card] }])), null, "where the box takes its kind only");
assert.equal(unmadeCopy(document, [{ type: "section", blocks: [card] }]), null, "its unit is on the page: nothing unmade");
assert.equal(unmadeCopy(document, [{ type: "section", blocks: [{ ...card, report: "other" }] }]).kind, "figure", "another report's card in a section: the one that cannot be made, named by its kind");
assert.equal(unmadeCopy(document, [{ type: "bullets", blocks: [{ type: "item", html: "x", lists: [{ type: "bullets", blocks: [{ type: "item", html: "y", lists: [] }] }] }] }]), null, "text alone: none");
// A cut takes the blocks off the page (no document to find their units in): a card, alone or in a box, is made of its unit only; a copy with data (a table) and text are not.
assert.equal(unmadeCopy(null, [card])?.kind, "figure", "cut: a card cannot be made once off the page");
assert.equal(unmadeCopy(null, [{ type: "section", blocks: [card] }])?.kind, "figure", "cut: a card in a section too");
assert.equal(unmadeCopy(null, [{ ...card, kind: "table", data: { type: "table", rows: [["a"]] } }]), null, "cut: a copy that carries data is made of it");
assert.equal(unmadeCopy(null, [{ type: "paragraph", html: "x" }]), null, "cut: text alone: none");
assert.equal(parse(data([{ type: "paragraph", html: 3 }])), null, "inline HTML is a string");
assert.equal(parse("{not json"), null);
assert.equal(parse(JSON.stringify({ v: 2, blocks: [] })), null);

// Built as new blocks of the page, the inline HTML sanitized again.
const built = build(document, parse(data([{ type: "paragraph", html: '好<img src=x onerror="alert(1)"><strong>强</strong><script>x()</script>' }]))[0]);
assert.equal(built.localName, "p");
assert.ok(built.hasAttribute("data-ge-new") && built.getAttribute("contenteditable") === "true", "a new text block");
assert.equal(serializeInner(built), "好<strong>强</strong>", "only the format bar's marks survive");
const rebuilt = build(document, list);
assert.equal(rebuilt.localName, "ul");
assert.equal(rebuilt.querySelectorAll("li").length, 3, "a list with its items and an item's list");
assert.ok(rebuilt.querySelector("li > ul > li")?.textContent === "二.一");
const details = build(document, { type: "details", html: "标题", blocks: [{ type: "paragraph", html: "内容" }] });
assert.equal(details.querySelector(".doc-details-summary-label").textContent, "标题");
assert.equal(details.querySelector(".doc-details-content").textContent, "内容", "the disclosure's content, and no empty paragraph besides");

// A section from neighbours in the page only.
assert.equal(wrapCheck([$("a"), $("b")]), "", "neighbours in the page");
assert.match(wrapCheck([$("a"), $("list")]), /相邻/, "with a block left out between them: no");
assert.match(wrapCheck([$("b"), $("sec")]), /不能再放分区/, "a section does not go into a section");
assert.equal(wrapCheck([$("i1")]), null, "not for list items");
const { focus: section } = wrapSection([$("a"), $("b")]);
assert.equal(section.localName, "section");
assert.equal(section.getAttribute("data-ge-box-kind"), "section");
assert.deepEqual([...section.children].map((node) => node.id), ["a", "b"], "they go in, in their order");
assert.equal(section.nextElementSibling.id, "list", "where they stood");

// A table copied to another report keeps what the reader gave it: its cells' looks (colors,
// alignment), the columns' widths, merged cells and a cell's list; one description, the table's
// (components/table/index.mjs tableData), described, checked and made again, the made table described
// as the copied one was.
{
  const { newTable } = await import("../../src/editor/components/table/page.mjs");
  const { tableData } = await import("../../src/editor/components/table/index.mjs");
  const elsewhere = new JSDOM("").window.document; // not this page's: its kit is not asked to load
  const source = newTable(elsewhere, {
    rows: [["名称", "备注"], ["甲", "乙", "丙<ul><li>一</li><li>二</li></ul>"], ["丁", "戊", "己"], ["辛", "庚"]],
    header: true, numbers: false,
    spans: [[[1, 2], [1, 1]], [[1, 1], [1, 1], [1, 1]], [[2, 1], [1, 1], [1, 1]], [[1, 1], [1, 1]]],
    looks: [["doc-bold doc-highlight-gray", "doc-bold doc-highlight-gray"], ["doc-align-right doc-text-red", "", ""], ["", "doc-highlight-blue", ""], ["", ""]],
    widths: ["120px", null, "90px"],
  });
  const table = document.importNode(source, true);
  table.removeAttribute("data-ge-new");
  table.setAttribute("data-ge-unit", "30");
  $("sec").after(table);
  const described = describe(table);
  assert.equal(described.type, "copy", "a table is still a copy of its unit within its report");
  const { data } = described;
  assert.deepEqual([data.header, data.numbers, data.spans.length, data.widths, data.looks[1][0], data.looks[2][1]], [true, false, 4, ["120px", null, "90px"], "doc-align-right doc-text-red", "doc-highlight-blue"], "its data carries looks, widths and spans");
  assert.equal(data.rows[1][2], "丙<ul><li>一</li><li>二</li></ul>", "a cell's list is part of its text");
  assert.ok(parse(JSON.stringify({ v: 1, blocks: [described] })), "which the clipboard checks as it checks any");
  const made = build(document, { ...described, report: "another" });
  assert.deepEqual(tableData(made, serializeInner), tableData(table, serializeInner), "made in another report, a table described as the first was");
  assert.deepEqual([made.querySelector("thead th").colSpan, made.querySelectorAll("tbody tr")[1].cells[0].rowSpan, made.querySelectorAll("tbody tr")[0].cells[2].querySelectorAll("li").length, made.querySelector("thead th").style.getPropertyValue("--doc-column-width"), made.querySelectorAll("tbody tr")[0].cells[0].className.includes("doc-text-red")], [2, 2, 2, "", true], "its spans, list and looks on the cells (the width on the topmost cell of its column alone)");
  assert.equal(made.querySelectorAll("tbody tr")[0].cells[0].style.getPropertyValue("--doc-column-width"), "120px", "the first column's width");
  // A plain header row an Agent wrote stays plain (its looks are given: none), a new header cell is gray and bold only when no looks are given.
  const plainTable = document.importNode(newTable(elsewhere, { rows: [["a"], ["b"]], header: true, looks: [[""], [""]] }), true);
  plainTable.removeAttribute("data-ge-new");
  plainTable.setAttribute("data-ge-unit", "31");
  assert.equal(build(document, describe(plainTable).data).querySelector("th").className, "", "a plain header cell pasted stays plain");
  // The data is checked: the same shape the server accepts.
  const tableBlock = (extra) => ({ type: "table", rows: [["a", "b"], ["c", "d"]], ...extra });
  for (const [what, good] of [["looks", { looks: [["doc-bold", ""], ["", "doc-align-left"]] }], ["widths", { widths: ["100px", null] }], ["spans", { spans: [[[1, 2]], [[1, 1], [1, 1]]], rows: [["a"], ["c", "d"]] }]]) {
    assert.ok(parse(JSON.stringify({ v: 1, blocks: [tableBlock(good)] })), `a table's ${what} read back`);
  }
  for (const [what, bad] of [["a look that is not one", { looks: [["doc-nope", ""], ["", ""]] }], ["looks not one to a cell", { looks: [[""], [""]] }], ["two colors in a cell", { looks: [["doc-text-red doc-text-blue", ""], ["", ""]] }],
    ["a width too narrow", { widths: ["10px", null] }], ["a width not a length", { widths: ["wide", null] }], ["widths not one to a column", { widths: ["100px"] }],
    ["spans that tile nothing", { spans: [[[1, 1], [1, 3]], [[1, 1], [1, 1]]] }], ["a span of 0", { spans: [[[0, 1], [1, 1]], [[1, 1], [1, 1]]] }], ["rows of different lengths with no spans to say so", { rows: [["a"], ["b", "c"]] }]]) {
    assert.equal(parse(JSON.stringify({ v: 1, blocks: [tableBlock(bad)] })), null, `${what} is refused`);
  }
  // Other programs read a merged table as a grid (Markdown) or with its spans (HTML).
  const merged = tableBlock({ rows: [["a"], ["c", "d"]], spans: [[[1, 2]], [[1, 1], [1, 1]]], header: true });
  assert.equal(formats([merged]).text, "| a |  |\n| --- | --- |\n| c | d |", "Markdown: the merged cell's other slot empty");
  assert.equal(formats([merged]).html, '<table><thead><tr><th colspan="2">a</th></tr></thead><tbody><tr><td>c</td><td>d</td></tr></tbody></table>', "HTML: the spans kept");
  assert.equal(formats([tableBlock({ rows: [["x<ul><li>一</li><li>二</li></ul>", "y"]] })]).text, "| x - 一 - 二 | y |\n| --- | --- |", "a cell's list in Markdown: its items on one line");
  // A row a merged cell covers whole holds no cell: the copy of such a table is as good as any.
  const covered = document.importNode(newTable(elsewhere, { rows: [["a"], []], spans: [[[2, 1]], []] }), true);
  covered.removeAttribute("data-ge-new");
  covered.setAttribute("data-ge-unit", "32");
  $("sec").after(covered);
  const coveredCopy = describe(covered);
  assert.deepEqual(coveredCopy.data.rows, [["a"], []], "its empty row kept");
  assert.ok(parse(JSON.stringify({ v: 1, blocks: [coveredCopy] })), "which the clipboard accepts");
  assert.deepEqual(tableData(build(document, { ...coveredCopy, report: "another" }), serializeInner), tableData(covered, serializeInner), "and makes again");
  assert.equal(formats([coveredCopy.data && { type: "table", ...coveredCopy.data }]).html, "<table><tbody><tr><td rowspan=\"2\">a</td></tr><tr></tr></tbody></table>", "and exports");
  covered.remove();
  table.remove();
  plainTable.remove();
}

// A table an Agent wrote by hand can say what the page's own tables never do: a cell with a text color
// and a fill, a header of several rows with a cell merged across them, a column width that is not in px
// or is too narrow (components/table/index.mjs validTable). Its copy is checked as a whole, so any of
// these used to fail the copy of the table even on the same page. The copy carries what it can: as it was
// within the report (copy: itself), and in another report the table with what validTable accepts of it
// (one color to a cell, a width where it is one, the merged cells unmerged where the header would be
// crossed) - never nothing.
{
  const { tableData } = await import("../../src/editor/components/table/index.mjs");
  const wrap = (id, unit, html) => {
    const node = document.createElement("div");
    node.id = id;
    node.className = "doc-table-wrap";
    node.setAttribute("data-ge-unit", String(unit));
    node.setAttribute("data-ge-unit-kind", "table");
    node.innerHTML = `<table class="doc-table">${html}</table>`;
    $("sec").after(node);
    return node;
  };
  const kinds = {
    "two colors on a cell": wrap("hand1", 40, '<thead><tr><th>名称</th><th>分数</th></tr></thead><tbody><tr><td class="doc-text-red doc-highlight-blue">甲</td><td>1</td></tr></tbody>'),
    "a header of two rows with a cell merged across them": wrap("hand2", 41, '<thead><tr><th rowspan="2">名称</th><th colspan="2">分数</th></tr><tr><th>一</th><th>二</th></tr></thead><tbody><tr><td>甲</td><td>1</td><td>2</td></tr></tbody>'),
    "a column width that is not px": wrap("hand3", 42, '<thead><tr><th style="--doc-column-width: 50%">名称</th><th style="--doc-column-width: 20px">分数</th></tr></thead><tbody><tr><td>甲</td><td>1</td></tr></tbody>'),
  };
  for (const [what, table] of Object.entries(kinds)) {
    const described = describe(table);
    assert.equal(described.type, "copy", `${what}: still a copy of its unit`);
    assert.ok(parse(JSON.stringify({ v: 1, blocks: [described] })), `${what}: the copy is accepted, within the report and elsewhere`);
    assert.ok(described.data, `${what}: carries data for another report`);
    assert.ok(copied(document, described), `${what}: within the report it is the unit itself`);
    const made = build(document, { ...described, report: "another" });
    assert.ok(made.matches("[data-ge-new]") && made.querySelector("table"), `${what}: made again in another report`);
  }
  const first = build(document, { ...describe(kinds["two colors on a cell"]), report: "another" }).querySelector("td");
  assert.equal([...first.classList].filter((name) => /^doc-(text|highlight)-/.test(name)).length, 1, "one color of the two is kept");
  const second = build(document, { ...describe(kinds["a header of two rows with a cell merged across them"]), report: "another" });
  assert.deepEqual([...second.querySelector("table").rows].map((row) => [...row.cells].map((cell) => cell.textContent)), [["名称", "分数", ""], ["", "一", "二"], ["甲", "1", "2"]], "the merged cells are taken apart, their words where they began");
  const third = tableData(build(document, { ...describe(kinds["a column width that is not px"]), report: "another" }), serializeInner);
  assert.equal(third.widths, undefined, "a width that is not one is not carried (nor a narrower one than a column is made)");
  for (const table of Object.values(kinds)) table.remove();
}

// The nine colors' values are written once (src/shared/colors.mjs), and the kit's hand-written CSS
// holds the same: base.css's .doc-text-* and .doc-highlight-* (a background on words is base.css's
// --doc-mark) and tokens.css's text, muted and surface colors, light and dark. What the editor's
// pickers, pasted colors and a copy's styles read cannot drift from what the kit draws.
{
  const { BODY, COLORS } = await import("../../src/shared/colors.mjs");
  const kit = (name) => fs.readFileSync(new URL(`../../src/render/kit/styles/${name}`, import.meta.url), "utf8");
  const base = kit("base.css");
  const tokens = kit("tokens.css");
  const pair = (css, selector) => {
    const match = new RegExp(`${selector}[^;]*?light-dark\\((#[0-9a-f]{6}), (#[0-9a-f]{6})\\)`).exec(css);
    assert.ok(match, `${selector} has a light-dark() value`);
    return [match[1], match[2]];
  };
  assert.equal(COLORS.length, 9);
  for (const { name, text, fill, mark } of COLORS) {
    assert.deepEqual(name === "gray" ? pair(tokens, "--doc-muted:") : pair(base, `\\.doc-text-${name} \\{`), text, `${name}'s text color is the kit's`);
    assert.deepEqual(pair(base, `\\.doc-highlight-${name} \\{`), fill, `${name}'s background is the kit's`);
    const marked = new RegExp(`\\.doc-highlight-${name} \\{[^}]*--doc-mark: light-dark\\((#[0-9a-f]{6}), (#[0-9a-f]{6})\\)`).exec(base);
    assert.deepEqual(marked && [marked[1], marked[2]], mark, `${name}'s fill of words is the kit's`);
    // A background's deep shade (a callout's line) is its color's text color.
    const deep = new RegExp(`\\.doc-highlight-${name} \\{[^}]*--doc-fill-deep: ([^;]+);`).exec(base)?.[1];
    assert.equal(deep, name === "gray" ? "var(--doc-muted)" : `light-dark(${text[0]}, ${text[1]})`, `${name}'s deep shade is its text color`);
  }
  // A callout with no color is the palette's blue: its fill and its line (callout.css's defaults).
  const blue = COLORS.find((color) => color.name === "blue");
  const callout = kit("callout.css");
  assert.ok(callout.includes(`var(--doc-fill-deep, light-dark(${blue.text[0]}, ${blue.text[1]}))`) && callout.includes(`var(--doc-fill, light-dark(${blue.fill[0]}, ${blue.fill[1]}))`), "a callout with no color is the palette's blue");
  // A list's markers (numbers and bullets: flow.css) are a blue of their own (the user's of 2026-11-07), and links the palette's blue, light and dark.
  assert.deepEqual(pair(tokens, "--doc-list-marker:"), ["#2e7cd1", "#5492d4"], "a list's markers are their own blue");
  assert.deepEqual(pair(tokens, "--doc-link:"), blue.text, "a link is the palette's blue");
  assert.deepEqual(pair(tokens, "--doc-text:"), BODY.text, "the body's text color");
  assert.deepEqual(pair(tokens, "--doc-surface:"), BODY.background, "the body's background");
  // A copy writes them as styles for programs without the kit's.
  const { formats: shown } = await import("../../src/editor/page/clipboard/own/index.mjs");
  assert.ok(shown([{ type: "paragraph", html: '<span class="doc-text-red">甲</span><span class="doc-highlight-blue">乙</span>' }]).html.includes('style="color:' + COLORS.find((c) => c.name === "red").text[0] + '">甲</span><span class="doc-highlight-blue" style="background-color:' + COLORS.find((c) => c.name === "blue").mark[0] + '">乙'), "a copy's colors carry the shared values (a background on words its words' fill)");
}

// Copying text (own/selection.mjs): in one block its inline HTML
// alone, no block with it (no list's marker); across blocks, blocks each of its type, the first and the
// last partly, a list's items each an item of its kind with what it holds, a highlight block the
// selection starts in left out and one it ends in kept with what of it comes before the end.
{
  const { describeAcross, ownRange, parseCells, parseText, plainText, selectedHtml, textFormats } = await import("../../src/editor/page/clipboard/own/index.mjs");
  const { newFormula } = await import("../../src/editor/page/core.mjs");
  const at = (node, offset, to, end) => {
    const range = document.createRange();
    range.setStart(node, offset);
    range.setEnd(to ?? node, end ?? offset);
    return range;
  };
  const whole = (host) => at(host, 0, host, host.childNodes.length);
  const nested = $("i2").querySelector("li");
  // In one block.
  assert.equal(selectedHtml($("a"), at($("a").firstChild, 1, $("a").querySelector("strong").firstChild, 1)), "文<strong>加</strong>", "a part of a paragraph with the part of its bold");
  assert.equal(selectedHtml($("i2"), whole($("i2"))), "二", "an item's text alone, not the list it holds (nor a marker)");
  const strong = $("a").querySelector("strong");
  assert.equal(selectedHtml($("a"), at(strong.firstChild, 0, strong.firstChild, 1)), "<strong>加</strong>", "a word inside bold: with its bold (a slice keeps its marks)");
  // Its spaces as the page shows them: a space selected beside the words goes with them; the source's
  // line breaks and indentation at the block's ends do not, and a run of them is one space.
  {
    const spaced = document.createElement("p");
    spaced.append(document.createTextNode("\n    前面 词语  后面\n  "));
    $("a").after(spaced);
    const text = spaced.firstChild;
    const index = text.data.indexOf(" 词语");
    assert.equal(selectedHtml(spaced, at(text, index, text, index + 4)), " 词语 ", "a space each side selected: copied");
    assert.equal(selectedHtml(spaced, whole(spaced)), "前面 词语 后面", "the whole block: no indentation, one space for a run");
    assert.equal(selectedHtml(spaced, at(text, 2, text, index + 3)), "前面 词语", "from within the indentation: none of it");
    assert.equal(plainText(selectedHtml(spaced, at(text, index, text, index + 3))), " 词语", "and as plain text");
    spaced.remove();
  }
  const chip = newFormula(document, "x^2", "<span class=\"katex\">x²</span>");
  $("a").append(chip, document.createTextNode("后"));
  assert.equal(selectedHtml($("a"), at(chip.firstChild.firstChild, 1, $("a").lastChild, 1)), '<span class="doc-math-inline">\\(x^2\\)</span>后', "an end inside a formula takes the formula whole, as its source");
  assert.equal(ownRange($("a"), at(chip.firstChild.firstChild, 0, chip.firstChild.firstChild, 1)).toString(), "x²", "widened over it");
  // An end at a chip's very start (Chrome's triple click stops there) leaves it out, as a start at its very end does.
  assert.equal(ownRange($("a"), at($("a").firstChild, 0, chip, 0)).toString(), "正文加粗", "an end at a formula's start: not the formula");
  assert.equal(ownRange($("a"), at($("a").firstChild, 0, chip.firstChild.firstChild, 0)).toString(), "正文加粗", "nor at the start of its first text");
  assert.equal(ownRange($("a"), at(chip.firstChild.firstChild, 2, $("a").lastChild, 1)).toString(), "后", "a start at its very end: not the formula");
  assert.equal(ownRange($("a"), at($("a").firstChild, 0, chip.firstChild.firstChild, 2)).toString(), "正文加粗x²", "an end at its very end: the formula");
  chip.remove();
  $("a").lastChild.remove();
  assert.deepEqual(textFormats('文<strong>加</strong><br>行 <span class="doc-math-inline">\\(x\\)</span> <a href="https://example.com">链</a>'), { html: '文<strong>加</strong><br>行 $x$ <a href="https://example.com">链</a>', text: "文加\n行 x 链" }, "for other programs: its HTML, and its words as plain text (a formula its TeX)");
  assert.equal(plainText("单元格<ul><li>一</li><li>二</li></ul>"), "单元格\n一\n二", "a cell's list items a line each");
  assert.equal(parseText(JSON.stringify({ v: 1, report: "r", html: "文<strong>加</strong>" })), "文<strong>加</strong>", "read back");
  assert.equal(parseText(JSON.stringify({ v: 1, blocks: [] })), null, "blocks are no text");
  assert.equal(parseText(JSON.stringify({ v: 1, html: 3 })), null, "its HTML a string");
  // Cells copied with a table's tools read back as the page's own (a paste elsewhere: one cell its text, more a table).
  assert.deepEqual(parseCells(JSON.stringify({ v: 1, cells: [["甲<strong>粗</strong>", "12"]] })), [["甲<strong>粗</strong>", "12"]], "cells read back");
  assert.equal(parseCells(JSON.stringify({ v: 1, cells: [[]] })), null, "a row holds cells");
  assert.equal(parseCells(JSON.stringify({ v: 1, cells: [[3]] })), null, "a cell's HTML a string");
  assert.equal(parseCells("{not json"), null);
  // Items copied on their own are a list of their kind for other programs.
  assert.deepEqual(formats([{ type: "item", html: "甲", list: "todo", checked: true }, { type: "item", html: "乙", list: "todo" }, { type: "item", html: "丙", list: "numbers" }]),
    { html: "<ul><li>[x] 甲</li><li>[ ] 乙</li></ul><ol><li>丙</li></ol>", text: "- [x] 甲\n- [ ] 乙\n1. 丙" }, "items on their own: a list of their kind each run");
  // Across blocks.
  const across = (range, texts, wholes = []) => describeAcross(range, { texts: texts.map(([host, part]) => ({ host, range: part ?? whole(host) })), wholes });
  assert.deepEqual(across(at($("a").firstChild, 1, $("i2").firstChild, 1), [[$("a"), at($("a").firstChild, 1, $("a"), $("a").childNodes.length)], [$("b")], [$("i1")], [$("i2"), at($("i2"), 0, $("i2").firstChild, 1)]]), [
    { type: "paragraph", html: "文<strong>加粗</strong>" }, { type: "heading2", html: "标题" },
    { type: "item", html: "一", lists: [], list: "bullets" }, { type: "item", html: "二", lists: [], list: "bullets" },
  ], "the first from its start, those between whole, the last to its end, each of its type; the items of their list's kind");
  assert.deepEqual(across(at($("i1").firstChild, 0, nested.firstChild, 1), [[$("i1")], [$("i2"), at($("i2"), 0, $("i2"), 1)], [nested, at(nested, 0, nested.firstChild, 1)]]), [
    { type: "item", html: "一", lists: [], list: "bullets" },
    { type: "item", html: "二", lists: [{ type: "bullets", blocks: [{ type: "item", html: "二", lists: [] }] }], list: "bullets" },
  ], "ending in an item's list: the item with what of its list comes before the end");
  const lead = $("panel").querySelector(".doc-icon");
  const inPanel = $("panel").querySelector("p");
  assert.deepEqual(across(at(nested.firstChild, 2, inPanel.firstChild, 2), [[nested, at(nested.firstChild, 2, nested, 1)], [inPanel, at(inPanel, 0, inPanel.firstChild, 2)]], [lead]), [
    { type: "item", html: "一", lists: [], list: "bullets" },
    { type: "highlight", blocks: [{ type: "icon", icon: "💡" }, { type: "paragraph", html: "面板" }] },
  ], "starting in an item's list: its items alone (the item holding it not copied); ending in a highlight block: the block, its icon and what comes before the end");
  const inSection = $("sec").querySelector("p");
  assert.deepEqual(across(at(inPanel.firstChild, 2, inSection.firstChild, 1), [[inPanel, at(inPanel.firstChild, 2, inPanel, 1)], [inSection, at(inSection, 0, inSection.firstChild, 1)]], [$("rule"), $("code"), $("card"), $("widget")]), [
    { type: "paragraph", html: "里的一段" }, { type: "divider" }, { type: "code", text: "const x = 1;\nreturn x;", title: "a.js" }, card, { type: "paragraph", html: "自己的" },
    { type: "section", blocks: [{ type: "paragraph", html: "分" }] },
  ], "starting in a highlight block: what of it the selection holds (its icon not); the blocks it takes whole as a copy of blocks describes them (a document's own widget as its words); ending in a section: the section");
  const leftColumn = $("cols").querySelector("p");
  assert.deepEqual(across(at(inSection.firstChild, 1, leftColumn.firstChild, 1), [[inSection, at(inSection.firstChild, 1, inSection, 1)], [leftColumn, at(leftColumn, 0, leftColumn.firstChild, 1)]]), [
    { type: "paragraph", html: "区里" }, { type: "paragraph", html: "左" },
  ], "ending in a row of columns: what of its column it holds (columns are no block of a copy)");
  assert.ok(parse(JSON.stringify({ v: 1, blocks: across(at(nested.firstChild, 2, inPanel.firstChild, 2), [[nested, at(nested.firstChild, 2, nested, 1)], [inPanel, at(inPanel, 0, inPanel.firstChild, 2)]], [lead]) })), "what it describes the clipboard reads back");
  // A tabs area it ends in: the area with the tab shown and what of its panel comes before the end
  // (a tabs block keeps its type, holding what of the content shown it reaches), not its
  // tab row's tabs as paragraphs; the panel not shown is no part of it.
  $("b").insertAdjacentHTML("beforebegin", `<section id="tabs" class="doc-sheet-shell" data-doc-sheets="t" data-ge-unit="30" data-ge-unit-kind="sheets">
    <div class="doc-sheet-tabs" data-ge-box="30" data-ge-box-kind="tabs"><button class="doc-sheet-tab" data-sheet-tab="a" data-tab-icon="🚀" data-ge-unit="31" data-ge-unit-kind="tab"><span data-ge-block="30" data-ge-kind="tab">结果</span></button><button class="doc-sheet-tab" data-sheet-tab="b" data-ge-unit="32" data-ge-unit-kind="tab"><span data-ge-block="31" data-ge-kind="tab">案例</span></button></div>
    <div data-doc-sheet="a" data-ge-box="31" data-ge-box-kind="panel"><p contenteditable="true" data-ge-block="32" data-ge-unit="33" data-ge-unit-kind="paragraph">结果页第一段</p><p contenteditable="true" data-ge-block="33" data-ge-unit="34" data-ge-unit-kind="paragraph">结果页第二段</p></div>
    <div data-doc-sheet="b" hidden data-ge-box="32" data-ge-box-kind="panel"><p contenteditable="true" data-ge-block="34" data-ge-unit="35" data-ge-unit-kind="paragraph">案例页</p></div>
  </section>`);
  const [pageOne, pageTwo] = $("tabs").querySelectorAll("[data-doc-sheet='a'] p");
  const tabRow = [...$("tabs").querySelectorAll(".doc-sheet-tab")];
  assert.deepEqual(across(at($("a").firstChild, 1, pageTwo.firstChild, 2), [[$("a"), at($("a").firstChild, 1, $("a"), $("a").childNodes.length)], [pageOne], [pageTwo, at(pageTwo, 0, pageTwo.firstChild, 2)]], tabRow), [
    { type: "paragraph", html: "文<strong>加粗</strong>" },
    { type: "sheets", tabs: [{ title: "结果", icon: "🚀", blocks: [{ type: "paragraph", html: "结果页第一段" }, { type: "paragraph", html: "结果" }] }] },
  ], "ending in a tabs area: the area with the tab shown, what of its panel comes before the end");
  assert.deepEqual(across(at($("a").firstChild, 1, tabRow[1], 0), [[$("a"), at($("a").firstChild, 1, $("a"), $("a").childNodes.length)]], tabRow.slice(0, 1)), [
    { type: "paragraph", html: "文<strong>加粗</strong>" },
  ], "ending in its tab row: none of its panel, so no tab of it");
  $("tabs").classList.add("doc-panel");
  assert.deepEqual(across(at($("a").firstChild, 1, pageTwo.firstChild, 2), [[$("a"), at($("a").firstChild, 1, $("a"), $("a").childNodes.length)], [pageOne], [pageTwo, at(pageTwo, 0, pageTwo.firstChild, 2)]], tabRow), [
    { type: "paragraph", html: "文<strong>加粗</strong>" },
    { type: "sheets", tabs: [{ title: "结果", icon: "🚀", blocks: [{ type: "paragraph", html: "结果页第一段" }, { type: "paragraph", html: "结果" }] }] },
  ], "a highlight block's class besides makes it no highlight block: the area with its tab, as a copy of the block has it");
  $("tabs").remove();
  // With a Sheet area's attribute and no tabs a block is no Sheet area: a selection ending in it holds
  // what of it comes before the end, as any block's.
  const firstPiece = [$("a"), at($("a").firstChild, 1, $("a"), $("a").childNodes.length)];
  const firstWords = { type: "paragraph", html: "文<strong>加粗</strong>" };
  for (const [name, html, words] of [
    ["a section", '<section id="bare" data-doc-sheets="u" data-ge-unit="36" data-ge-unit-kind="sheets"><p contenteditable="true" data-ge-block="36" data-ge-kind="flow">节里的字</p></section>', "节里"],
    ["a plain div", '<div id="bare" data-doc-sheets="u" data-ge-unit="36" data-ge-unit-kind="block"><p contenteditable="true" data-ge-block="36" data-ge-kind="text">块里的字</p></div>', "块里"],
    ["a code block", '<div id="bare" class="doc-code" data-doc-sheets="u" data-ge-unit="36" data-ge-unit-kind="code"><div contenteditable="true" data-ge-block="36" data-ge-kind="codeTitle">代码标题</div><pre><code>x</code></pre></div>', "代码"],
    ["a table", '<div id="bare" class="doc-table-wrap" data-doc-sheets="u" data-ge-unit="36" data-ge-unit-kind="table"><table class="doc-table"><tbody><tr><td contenteditable="true" data-ge-block="36" data-ge-kind="cell">格子的字</td></tr></tbody></table></div>', "格子"],
  ]) {
    $("b").insertAdjacentHTML("beforebegin", html);
    const host = $("bare").querySelector("[data-ge-block]");
    assert.deepEqual(across(at($("a").firstChild, 1, host.firstChild, 2), [firstPiece, [host, at(host, 0, host.firstChild, 2)]]), [firstWords, { type: "paragraph", html: words }], `ending in ${name} with the attribute`);
    $("bare").remove();
  }
  // In a detail card (its dialog and panel neither blocks nor boxes): what it holds of the card's content, a heading first in it as any block.
  $("cols").insertAdjacentHTML("afterend", `<dialog id="dialog" class="doc-dialog" open><div class="doc-dialog-panel"><div class="doc-dialog-content" data-ge-box="40" data-ge-box-kind="dialog"><h3 contenteditable="true" data-ge-block="40" data-ge-unit="43" data-ge-unit-kind="heading">卡片标题</h3><ol data-ge-unit="40" data-ge-unit-kind="list" data-ge-box="41" data-ge-box-kind="list"><li contenteditable="true" data-ge-block="41" data-ge-unit="41" data-ge-unit-kind="item">卡片列表一</li><li contenteditable="true" data-ge-block="42" data-ge-unit="42" data-ge-unit-kind="item">卡片列表二</li></ol></div></div></dialog>`);
  const [cardOne, cardTwo] = $("dialog").querySelectorAll("li");
  const cardTitle = $("dialog").querySelector("h3");
  assert.deepEqual(across(at(cardOne.firstChild, 2, cardTwo.firstChild, 2), [[cardOne, at(cardOne.firstChild, 2, cardOne, 1)], [cardTwo, at(cardTwo, 0, cardTwo.firstChild, 2)]]), [
    { list: "numbers", type: "item", html: "列表一", lists: [] }, { list: "numbers", type: "item", html: "卡片", lists: [] },
  ], "in a detail card: its items, each of its kind");
  assert.deepEqual(across(at(cardTitle.firstChild, 2, cardOne.firstChild, 2), [[cardTitle, at(cardTitle.firstChild, 2, cardTitle, 1)], [cardOne, at(cardOne, 0, cardOne.firstChild, 2)]]), [
    { type: "heading3", html: "标题" }, { list: "numbers", type: "item", html: "卡片", lists: [] },
  ], "from its heading: the heading, then its items");
  $("dialog").remove();
  // A block written so that the page made no units in it (a list of a class of its own, a highlight
  // block with words straight in it) is copied with what it holds, read as it stands, and the class
  // of another component makes it no other block.
  {
    const text = (tag, html, attrs = "") => `<${tag} contenteditable="true" data-ge-block="70"${attrs}>${html}</${tag}>`;
    const copy = (html) => {
      $("a").insertAdjacentHTML("afterend", html);
      const block = describe($("own"));
      $("own").remove();
      return block;
    };
    const items = [{ type: "item", html: "一", lists: [] }, { type: "item", html: "二", lists: [{ type: "bullets", blocks: [{ type: "item", html: "深", lists: [] }] }] }];
    const list = (name, kind = "list") => `<${name} id="own" data-ge-unit="70" data-ge-unit-kind="${kind}">${text("li", "一")}${text("li", `二<ul>${text("li", "深")}</ul>`)}</${name.split(" ")[0]}>`;
    assert.deepEqual(copy(list('ul class="doc-panel"')), { type: "bullets", blocks: items }, "a list with a highlight block's class: its items");
    assert.deepEqual(copy(list('ol class="doc-panel"')), { type: "numbers", blocks: items }, "numbered");
    assert.deepEqual(copy(list('ul class="mine"')), { type: "bullets", blocks: items }, "with a class of its own");
    assert.deepEqual(copy(list('ul class="doc-summary"', "highlight")), { type: "bullets", blocks: items }, "and one a class made a highlight block is a list by its tag");
    assert.deepEqual(copy(`<ol id="own" class="doc-flow doc-panel" data-ge-unit="70" data-ge-unit-kind="flowchart"><li><p contenteditable="true" data-ge-block="70" data-ge-kind="flow">节点</p></li>${text("li", "短写")}</ol>`),
      { type: "flowchart", blocks: [{ type: "step", blocks: [{ type: "paragraph", html: "节点" }] }, { type: "item", html: "短写", lists: [] }] }, "a flowchart so: its nodes");
    assert.deepEqual(copy(`<blockquote id="own" class="mine" data-ge-unit="70" data-ge-unit-kind="quote"><p contenteditable="true" data-ge-block="70" data-ge-kind="flow">引</p></blockquote>`), { type: "quote", blocks: [{ type: "paragraph", html: "引" }] }, "a quote");
    assert.deepEqual(copy(`<details id="own" class="doc-details doc-panel" data-ge-unit="70" data-ge-unit-kind="details"><summary><span class="doc-details-summary-label">题</span></summary><div class="doc-details-content" data-ge-box="70" data-ge-box-kind="details"><p contenteditable="true" data-ge-block="70" data-ge-unit="71" data-ge-unit-kind="paragraph">内</p></div></details>`),
      { type: "details", html: "题", blocks: [{ type: "paragraph", html: "内" }] }, "a disclosure with a highlight block's class: a disclosure");
    const panel = (html) => `<div id="own" class="doc-panel doc-highlight-blue" contenteditable="true" data-ge-block="70" data-ge-unit="70" data-ge-unit-kind="highlight">${html}</div>`;
    const words = { type: "highlight", blocks: [{ type: "paragraph", html: "plain <strong>text</strong>" }], color: "doc-highlight-blue" };
    assert.deepEqual(copy(panel("plain <strong>text</strong>")), words, "a highlight block of words alone: a paragraph of them, with their marks");
    assert.ok(parse(JSON.stringify({ v: 1, blocks: [words] })), "which the clipboard takes back");
    assert.deepEqual(copy('<div id="own" class="doc-summary" contenteditable="true" data-ge-block="70" data-ge-unit="70" data-ge-unit-kind="highlight">摘要</div>'), { type: "highlight", blocks: [{ type: "paragraph", html: "摘要" }] }, "the opening summary");
    assert.deepEqual(copy('<section id="own" class="doc-panel" contenteditable="true" data-ge-block="70" data-ge-unit="70" data-ge-unit-kind="section">节字</section>'), { type: "highlight", blocks: [{ type: "paragraph", html: "节字" }] }, "a section of the class, a text block of no type");
    assert.deepEqual(copy('<pre id="own" class="doc-panel" data-ge-unit="70" data-ge-unit-kind="highlight">码</pre>'), { type: "highlight", blocks: [{ type: "paragraph", html: "码" }] }, "words the page made no text block of");
    assert.deepEqual(copy('<div id="own" class="doc-panel" data-ge-unit="70" data-ge-unit-kind="highlight">字 &lt;<p contenteditable="true" data-ge-block="70" data-ge-kind="flow">甲</p></div>'), { type: "highlight", blocks: [{ type: "paragraph", html: "字 &lt;甲" }] }, "words beside a block: all it says");
    assert.deepEqual(copy('<p id="own" class="doc-panel" contenteditable="true" data-ge-block="70" data-ge-unit="70" data-ge-unit-kind="paragraph">段</p>'), { type: "paragraph", html: "段" }, "a text block of a type of its own stays that type");
    assert.deepEqual(copy('<div id="own" class="doc-panel" data-ge-box="70" data-ge-box-kind="highlight" data-ge-unit="70" data-ge-unit-kind="highlight"></div>'), { type: "highlight", blocks: [] }, "an empty one holds nothing");
  }
  // Ending in a callout: the callout with what of it comes before the end, its color kept (as a highlight block).
  $("a").insertAdjacentHTML("afterend", '<div id="callout" class="doc-callout doc-highlight-green" data-ge-unit="50" data-ge-unit-kind="callout" data-ge-box="50" data-ge-box-kind="callout"><p id="calloutText" contenteditable="true" data-ge-block="50" data-ge-unit="51" data-ge-unit-kind="paragraph">提示的话</p></div>');
  assert.deepEqual(across(at($("a").firstChild, 1, $("calloutText").firstChild, 2), [[$("a"), at($("a").firstChild, 1, $("a"), $("a").childNodes.length)], [$("calloutText"), at($("calloutText"), 0, $("calloutText").firstChild, 2)]]), [
    { type: "paragraph", html: "文<strong>加粗</strong>" }, { type: "callout", blocks: [{ type: "paragraph", html: "提示" }], color: "doc-highlight-green" },
  ], "ending in a callout: the callout and what of it comes before the end");
  $("callout").remove();
  // A flowchart a selection crosses is a flowchart still (its steps are nodes, no items: never their
  // blocks as loose paragraphs): held whole, as a copy of the block describes it; ending in one of its
  // nodes, the nodes before it whole and that node with what of it comes before the end, its
  // direction kept; starting in one, what of that node it holds, then the nodes after it.
  $("a").insertAdjacentHTML("afterend", `<ol id="flow" class="doc-flow" data-direction="row" data-ge-unit="60" data-ge-unit-kind="flowchart" data-ge-box="60" data-ge-box-kind="flowchart">
    <li class="doc-highlight-blue" data-ge-unit="61" data-ge-unit-kind="step" data-ge-box="61" data-ge-box-kind="node"><p contenteditable="true" data-ge-block="61" data-ge-unit="62" data-ge-unit-kind="paragraph"><strong>甲步</strong></p><p contenteditable="true" data-ge-block="62" data-ge-unit="63" data-ge-unit-kind="paragraph">甲的说明</p></li>
    <li data-direction="column" data-ge-unit="64" data-ge-unit-kind="step" data-ge-box="62" data-ge-box-kind="node"><p contenteditable="true" data-ge-block="63" data-ge-unit="65" data-ge-unit-kind="paragraph"><strong>乙步</strong></p><p contenteditable="true" data-ge-block="64" data-ge-unit="66" data-ge-unit-kind="paragraph">乙的说明</p></li>
  </ol>`);
  const [titleOne, textOne, titleTwo, textTwo] = $("flow").querySelectorAll("p");
  const nodeOne = { type: "step", blocks: [{ type: "paragraph", html: "<strong>甲步</strong>" }, { type: "paragraph", html: "甲的说明" }], color: "doc-highlight-blue" };
  const nodeTwo = { type: "step", blocks: [{ type: "paragraph", html: "<strong>乙步</strong>" }, { type: "paragraph", html: "乙的说明" }], direction: "column" };
  const fromA = [$("a"), at($("a").firstChild, 1, $("a"), $("a").childNodes.length)];
  assert.deepEqual(across(at($("a").firstChild, 1, $("b").firstChild, 1), [fromA, [titleOne], [textOne], [titleTwo], [textTwo], [$("b"), at($("b"), 0, $("b").firstChild, 1)]]), [
    { type: "paragraph", html: "文<strong>加粗</strong>" }, { type: "flowchart", blocks: [nodeOne, nodeTwo], direction: "row" }, { type: "heading2", html: "标" },
  ], "a flowchart held whole: the flowchart, its direction and its nodes with their blocks, color and direction");
  const strongTwo = titleTwo.querySelector("strong").firstChild;
  assert.deepEqual(across(at($("a").firstChild, 1, strongTwo, 1), [fromA, [titleOne], [textOne], [titleTwo, at(titleTwo, 0, strongTwo, 1)]]), [
    { type: "paragraph", html: "文<strong>加粗</strong>" }, { type: "flowchart", blocks: [nodeOne, { type: "step", blocks: [{ type: "paragraph", html: "<strong>乙</strong>" }], direction: "column" }], direction: "row" },
  ], "ending in a node's title: the nodes before it, and that node with what of it comes before the end");
  assert.deepEqual(across(at(textOne.firstChild, 2, $("b").firstChild, 1), [[textOne, at(textOne.firstChild, 2, textOne, 1)], [titleTwo], [textTwo], [$("b"), at($("b"), 0, $("b").firstChild, 1)]]), [
    { type: "paragraph", html: "说明" }, { type: "flowchart", blocks: [nodeTwo], direction: "row" }, { type: "heading2", html: "标" },
  ], "starting in a node: what of it the selection holds, then a flowchart of the nodes after it");
  assert.ok(parse(JSON.stringify({ v: 1, blocks: across(at($("a").firstChild, 1, strongTwo, 1), [fromA, [titleOne], [textOne], [titleTwo, at(titleTwo, 0, strongTwo, 1)]]) })), "what it describes the clipboard reads back");
  $("flow").remove();
}

// A copy of a card whose drawing names ids of its own (an SVG's marker by url(#id), a symbol by
// href="#id", xlink:href too): pasted (editable), it keeps those ids, every other id taken out; then
// prefixCopies gives each copy its own prefix (c1-, the first no id of the page starts with; a second
// copy of the same paste c2-), every reference written to match, so its arrows draw from its own
// markers and no id is the page's twice. The clipboard's HTML keeps no id.
{
  const figure = document.createElement("figure");
  figure.className = "doc-figure";
  figure.id = "drawn";
  figure.setAttribute("data-ge-unit", "30");
  figure.innerHTML = '<h3 id="drawn-title">图</h3><svg viewBox="0 0 10 10"><defs><marker id="sa"><path d="M0 0"></path></marker><circle id="sd" r="1"></circle></defs><path id="lone" d="M0 5H9" marker-end="url(#sa)" style="stroke: url(&quot;#sa&quot;)"></path><use href="#sd"></use><use></use></svg>';
  figure.querySelectorAll("use")[1].setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", "#sd");
  document.querySelector("main").append(figure);
  const plain = copyOf(figure);
  assert.equal(plain.querySelectorAll("[id]").length, 0, "the clipboard's HTML: no id");
  const made = [copyOf(figure, { editable: true }), copyOf(figure, { editable: true })];
  made.forEach((copy) => copy.setAttribute("data-ge-type", "copy"));
  assert.deepEqual([...made[0].querySelectorAll("[id]")].map((node) => node.id), ["sa", "sd"], "pasted: the ids it names itself kept, the others gone");
  document.body.append(Object.assign(document.createElement("i"), { id: "c1-x" })); // a c1- the page holds
  prefixCopies(document, made);
  const [one, two] = made;
  assert.deepEqual([...one.querySelectorAll("[id]")].map((node) => node.id), ["c2-sa", "c2-sd"]);
  assert.deepEqual([...two.querySelectorAll("[id]")].map((node) => node.id), ["c3-sa", "c3-sd"], "a second copy: its own");
  const path = one.querySelector("path[d^='M0 5']");
  assert.deepEqual([path.getAttribute("marker-end"), path.getAttribute("style"), one.querySelector("use").getAttribute("href"), one.querySelectorAll("use")[1].getAttributeNS("http://www.w3.org/1999/xlink", "href")],
    ["url(#c2-sa)", 'stroke: url("#c2-sa")', "#c2-sd", "#c2-sd"], "every reference written to match, xlink:href in its namespace");
  assert.equal(figure.querySelector("marker").id, "sa", "the original as it was");
  figure.remove();
  document.getElementById("c1-x").remove();
}

// What blocks say where they cannot be made (a table's cell, a title): a block copied as itself says
// what its data does, else the words of its markup, a chart's data none of them.
{
  const whole = (html, data) => ({ type: "copy", kind: "figure", unit: 1, report: "r", text: "", html, ...(data ? { data } : {}) });
  assert.equal(joinedHtml([whole("<div></div>", { type: "table", rows: [["甲", "<strong>乙</strong>"]] })]), "<p>甲</p><p><strong>乙</strong></p>", "a table's cells");
  assert.equal(joinedHtml([whole('<figure>\n<h3>a &lt; b</h3>\n<div data-doc-chart="bars">[1, 2]</div><style>p {}</style>\n<figcaption>说明</figcaption>\n</figure>')]), "<p>a &lt; b 说明</p>", "a card's words");
  assert.equal(joinedHtml([whole('<figure><img src="a.png"></figure>')]), "", "a picture with no caption says nothing");
  assert.equal(joinedHtml([{ type: "paragraph", html: "段" }, { type: "details", html: "折", blocks: [whole("<p>里</p>")] }]), "<p>段</p><p>折</p><p>里</p>", "in what a box holds");
}

Object.assign(globalThis, saved);
// What a clipboard brings of an instance from another document is checked as all its data is, and what
// would run on the page is no block (src/shared/components/installed.mjs refusedInCopy).
{
  globalThis.document = dom.window.document; // what a page reads its markup with
  const blocks = (html, more = {}) => checkBlocks([{ type: "copy", kind: "installed", unit: 1, report: "elsewhere", text: "词", html: "<p></p>", data: { type: "installed", package: "local/strip", html, blocks: [{ type: "paragraph", html: "词" }], ...more } }]);
  assert.ok(blocks('<div data-doc-component="local/strip"><h3>词</h3></div>'), "an instance");
  assert.ok(blocks('<section data-doc-component="local/strip"><script type="application/json">{}</script></section>'), "its data no code");
  assert.ok(blocks('<div data-doc-component="local/strip" style="position: relative; width: 40%"><p style="color: red">词</p></div>'), "a style that keeps it in its place");
  for (const html of ['<p data-doc-component="local/strip"></p>', '<div data-doc-component="local/other"></div>', '<div data-doc-component="local/strip"></div><div data-doc-component="local/strip"></div>', "词", '<div data-doc-component="local/strip" onmouseover="x()"></div>', '<div data-doc-component="local/strip"><script>x()</script></div>', '<div data-doc-component="local/strip"><template><img src=x onerror=x()></template></div>', '<div data-doc-component="local/strip"><object data="x"></object></div>', '<div data-doc-component="local/strip"><a href="  JavaScript:x()">词</a></div>', '<div data-doc-component="local/strip"><base href="//x"></div>',
    // What the parser would put right here and the file reads otherwise: nothing a copy's outerHTML is.
    '<div data-doc-component="local/strip"><h3>词', '<div data-doc-component="local/strip"><h3>词</h3><!-- ', '<div data-doc-component="local/strip"><h3>词</h3><textarea>', '<div data-doc-component="local/strip"><svg><title>', '<div data-doc-component="local/strip"><h3>词</h3></main><p>段</p></div>', '<div data-doc-component="local/strip"></div>后面的词',
    // What takes the page over from where it stands.
    '<div data-doc-component="local/strip"><style>main { display: none; }</style></div>', '<div data-doc-component="local/strip" style="position:fixed;inset:0"></div>', '<div data-doc-component="local/strip"><p style="POSITION : absolute">词</p></div>', '<div data-doc-component="local/strip"><p style="pos\\69tion: fixed">词</p></div>']) {
    assert.equal(blocks(html), null, `no block: ${html}`);
  }
  assert.equal(blocks('<div data-doc-component="local/strip"></div>', { package: '"]' }), null, "a package's id is one");
  assert.equal(blocks('<div data-doc-component="local/strip"></div>', { blocks: [{ type: "paragraph", html: 3 }] }), null, "and what it says to other programs is checked too");
  delete globalThis.document;
}

console.log("Checked copying blocks: what can be copied (text of every type, lists with their items' lists, panels, dividers, code, formula blocks, sections; a card as itself, not a document's own widget; a copy's drawing its own ids, prefixed), the clipboard's kit markup and text, pasted data checked (types, what goes where, strings) and its inline HTML sanitized again, and sections made only of neighbours in the page; text copied in one block as its inline HTML alone, and across blocks as blocks each of its type, its ends partly (a flowchart a flowchart of nodes); the nine colors' shared values equal the kit's CSS (a background's deep shade its text color, a callout with none the blue).");
