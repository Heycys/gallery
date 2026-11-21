import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import katex from "katex";
import {
  captureLayout, collectEdits, firstByAttribute, frameOf, heldIn, markFrames, matchesSource, mergeWithPrevious, nestedBlocks, nestedLists, newContainer, nextLine, newFormula, newHost, nodeOf, ownHTML, parentItem, partsOf, pastedLines, previousLine, placeBefore, plainText, prepareBlock, removalTarget, serializeInner, setOwnHTML, splitBlock, splitsAt, strayHosts, strayIn, textEnd, tidyEmptied, keptAnyway, unitElement, withLeads,
} from "../../src/editor/page/core.mjs";
import { removeUnit } from "./page-harness.mjs";
import { createClipboard } from "../../src/editor/page/clipboard/index.mjs";
import { BLOCK_TYPES, FRESH, HOSTS, MENU_GROUPS, TEXT_TYPES, TURN_INTO, capsFor, ownerOf, placeholderOf, sizeValue } from "../../src/editor/components/registry.mjs";
import { codeBaseline, codeText, openCode, syncGutter } from "../../src/editor/components/code/index.mjs";
import { codeAttribute } from "../../src/editor/components/code/file.mjs";
import {
  belowTargets, containerTargets, convertBlock, convertContainer, convertEmpty, convertGroup, convertStep, emptyTargets, groupTargets, headingShifts, ownTypeOf, shiftHeadings, stepTargets, targetsOf, turnTargets, typeOf, typedTargets,
} from "../../src/editor/page/convert.mjs";
import { convertible } from "../../src/editor/source/checks.mjs";
import { connectPages } from "../../src/editor/page/page-objects.mjs";
import { captionNode } from "../../src/editor/components/media/parts.mjs";
import { make as makeCode } from "../../src/editor/components/code/page.mjs";
import { make as makeMath } from "../../src/editor/components/math/page.mjs";
import { make as makeSheets } from "../../src/editor/components/sheets/page.mjs";
import { make as makeTable } from "../../src/editor/components/table/page.mjs";
import { inlineMark, markdownShortcut } from "../../src/editor/page/markdown/rules.mjs";
import { guessLanguage } from "../../src/shared/code-languages.mjs";
import { foldRegions, hiddenLines } from "../../src/render/kit/code-folds.js";
import { dialogLink, freshDialogId, newDialog } from "../../src/editor/components/dialog/page.mjs";
import { leaveBox } from "../../src/editor/page/typing/leave.mjs";
import { around, coverage, nextStep, openCard, stepsAbove, stepsFromText, topStep } from "../../src/editor/page/select-all/index.mjs";
import { canNest, indentItem, outdentItem } from "../../src/editor/components/list/page.mjs";
import { holdsSays, mergeSays } from "../../src/editor/components/list/index.mjs";
import { continuation, formatNumber, keepContinuing, numbersOf, parseNumber } from "../../src/editor/components/list/numbers.mjs";
import { sectionAfter, unwrapCheck, unwrapSection } from "../../src/editor/components/section/page.mjs";
import { addColumn, columnsCheck, ratiosAfterAdd, ratiosAfterRemove, ratiosAfterResize, rowAround, rowOf, rowsAround, settleRows, splitBeside } from "../../src/editor/components/columns/page.mjs";
import { componentFailures } from "../../src/render/component-checks.mjs";
import { formatRange, markValue, rangeAt } from "../../src/editor/page/marks.mjs";
import { brushed, currentEffects, describeEffects, effectChanges, noteEffects } from "../../src/editor/page/format-bar/brush.mjs";
import { createEditService } from "../../src/editor/service.mjs";
import { writeAtomic } from "../../src/shared/files.mjs";
import { applyEdits, commitEdits, findBlocks, findUnits, hashOf, instrument, mergeText, scriptKept } from "../../src/editor/source.mjs";
import { copiedSource } from "../../src/editor/source/text.mjs";
import { sheetKeyRead, unitHash } from "../../src/editor/source/units.mjs";
import { newNames } from "../../src/shared/new-names.mjs";

// In-place editing: source indexing and patching, the browser core (in jsdom), and the local
// save endpoint. Keyboard, caret movement, block handles and IME behaviour still need a real browser.

const SRC = `<main class="doc-page" data-doc-id="demo">
  <header class="doc-header">
    <h1 class="doc-title">组件与报告模板示例</h1>
  </header>

  <section class="doc-summary" aria-label="模板概括">
    <p><strong>🧭 模板背景</strong></p>
    <p>这份页面集中展示 HTML Report Studio 已提供的阅读排版。</p>
    <ul>
      <li><strong class="doc-accent">内容组件：</strong>基础 Markdown、KaTeX 公式……</li>
      <li>是</li>
    </ul>
  </section>

  <section class="doc-section" aria-labelledby="markdown-title">
    <h2 id="markdown-title">基础 Markdown 排版</h2>
    <div>
      <!-- AI 写的注释：必须原样保留 -->
      <p>行内公式嵌入句子，例如 <span class="doc-math-inline">\\(\\Delta = S_e - S_b\\)</span>，不会打断正文阅读。</p>
      <blockquote><p>引用块用于保留来源原话或定义。</p></blockquote>
      <div class="doc-code" data-language="html"><div class="doc-code-title"></div><pre><code>&lt;p&gt;示例&lt;/p&gt;</code></pre></div>
      <ul>
        <li>是</li>
      </ul>
      <p>含有 <span class="unknown">未知元素</span> 的段落</p>
    </div>
  </section>
</main>
<script src="/kit/charts.js" data-doc-kit="charts"></script>
`;
// Blocks of SRC: 0 h1 · 1-2 summary p · 3-4 summary li · 5 h2 (bound) · 6 formula p · 7 quote p · 8 code title · 9 code · 10 li

// "Open the preview, let the kit enhance it, enter edit mode."
// The types made on their page objects, which the editor hands to the engines.
const PAGES = { code: { create: makeCode, textOf() {} }, math: { create: makeMath }, sheets: { create: makeSheets }, table: { create: makeTable } };
connectPages(PAGES);

function openPage(source) {
  const { html, map } = instrument(source);
  const { document } = new JSDOM(html).window;
  for (const span of document.querySelectorAll(".doc-math-inline")) {
    span.innerHTML = katex.renderToString(span.textContent.slice(2, -2)); // what math.js does
  }
  const baselines = new Map();
  for (const block of map.blocks) {
    baselines.set(block.id, prepareBlock(document.querySelector(`[data-ge-block="${block.id}"]`), block));
  }
  const sources = new Map(map.blocks.map((block) => [block.id, block]));
  return {
    document, baselines, sources, map,
    layout: captureLayout(document, map),
    block: (id) => document.querySelector(`[data-ge-block="${id}"]`),
    unit: (id) => document.querySelector(`[data-ge-unit="${id}"]`),
  };
}
// What the editor sends when saving, deleted blocks included.
const changes = (page) => {
  const { edits, units } = collectEdits(page.document, page.baselines, page.layout);
  return { edits, units };
};
const saveAll = (page, current) => applyEdits({ current, ...changes(page) });
function caretIn(doc, element, text, offsetInText) {
  const walker = doc.createTreeWalker(element, 4);
  for (let node; (node = walker.nextNode());) {
    const index = node.data.indexOf(text);
    if (index >= 0) {
      const range = doc.createRange();
      range.setStart(node, index + offsetInText);
      range.collapse(true);
      return range;
    }
  }
  throw new Error(`text not found: ${text}`);
}
// The page's globals in place while the clipboard works on `page`: what a paste and blocksAt need of a browser.
async function inPage(page, run) {
  const view = page.document.defaultView;
  const saved = { document: globalThis.document, Node: globalThis.Node, DOMParser: globalThis.DOMParser, getSelection: globalThis.getSelection };
  Object.assign(globalThis, { document: page.document, Node: view.Node, DOMParser: view.DOMParser, getSelection: () => view.getSelection() });
  try {
    view.Element.prototype.scrollIntoView ??= () => {}; // jsdom does not scroll
    return await run(view);
  } finally {
    Object.assign(globalThis, saved);
  }
}
// `struct`: the history's way of recording a structural step (history.mjs), `blocks`: the block selection.
const clipboardOf = ({ struct = (parents, touched, mutate) => mutate(), blocks = () => ({ picked: [], select() {} }) } = {}) => createClipboard({
  editing: () => true, blocks, struct, recordText() {}, say() {},
});
// A paste as the page does it (clipboard/ paste): what the clipboard holds (text, HTML, `own`: the
// page's own described blocks) read into blocks and put in at the caret `range` in `host`.
async function pasteAt(page, host, range, { text = "", html = "", own = null, ownType = "application/x-gallery-blocks", ...options }) {
  return inPage(page, async (view) => {
    view.getSelection().removeAllRanges();
    view.getSelection().addRange(range);
    const mine = own ? { [ownType]: JSON.stringify({ v: 1, blocks: own }) } : {};
    const data = { types: ["text/plain", "text/html", ...Object.keys(mine)], files: [], getData: (type) => ({ "text/plain": text, "text/html": html, ...mine })[type] ?? "" };
    await clipboardOf(options).paste({ clipboardData: data, target: host, preventDefault() {} });
    return view.getSelection();
  });
}
// Blocks made elsewhere put in at the caret `range` in `host` (a link turned into a bookmark: links/views.mjs).
async function blocksAt(page, host, range, made, kinds, options = {}) {
  return inPage(page, (view) => {
    view.getSelection().removeAllRanges();
    view.getSelection().addRange(range);
    const went = clipboardOf(options).blocksAt(host, range, made, kinds);
    return { went, selection: view.getSelection() };
  });
}
// A history for the steps of a clipboard: what history.mjs records of a structural change (the child lists
// of the containers named, the text of the blocks named, a container the step made empty before it),
// so that undo puts the very same nodes back. `steps` counts them: one step each.
function stepsOf() {
  const steps = [];
  return {
    steps,
    struct(parents, touched, mutate) {
      const before = parents.map((parent) => [parent, [...parent.childNodes]]);
      const texts = touched.map((node) => [node, ownHTML(node)]);
      const result = mutate();
      if (!result) return null;
      steps.push({ before: [...before, ...(result.created ?? []).filter((node) => !parents.includes(node)).map((node) => [node, []])], texts });
      return result;
    },
    undo() {
      const step = steps.pop();
      for (const [parent, nodes] of step.before) parent.replaceChildren(...nodes);
      for (const [node, html] of step.texts) setOwnHTML(node, html);
    },
  };
}
const edits = (page) => collectEdits(page.document, page.baselines).edits;
const save = (page, current) => applyEdits({ current, edits: edits(page) });
const changedLines = (a, b) => {
  const before = a.split("\n");
  const after = b.split("\n");
  return { removed: before.filter((line) => !after.includes(line)), added: after.filter((line) => !before.includes(line)) };
};
const textNode = (element, text) => [...element.childNodes].find((node) => node.nodeType === 3 && node.data.includes(text));
const unmarked = (html) => html.replace(/ data-ge-(block|lock|unit|lead|keep-own|keep|grid|box|pure)(="[^"]*")?/g, "");

// Selection: plain text blocks, the report title, component text fields and table cells.
{
  const blocks = findBlocks(SRC);
  // The last: a paragraph holding a span of the report's own, kept whole as its atom (page/own.mjs).
  assert.deepEqual(blocks.map((block) => block.tag), ["h1", "p", "p", "li", "li", "h2", "p", "p", "div", "code", "li", "p"]);
  assert.equal(SRC.slice(blocks[11].innerStart + blocks[11].atoms[0][0], blocks[11].innerStart + blocks[11].atoms[0][1]), '<span class="unknown">未知元素</span>');
  const math = blocks[6];
  const [start, end] = math.atoms[0];
  assert.equal(SRC.slice(math.innerStart + start, math.innerStart + end), String.raw`<span class="doc-math-inline">\(\Delta = S_e - S_b\)</span>`);
  assert.equal(blocks[0].kind, "title");
  assert.deepEqual(blocks[0].caps, { plain: true, empty: true }, "the title only changes its text, and may be emptied (an untitled document)");
  assert.equal(blocks[5].bound, false, "the title a section is labelled by is not bound by that label");
  assert.deepEqual(blocks[5].caps, { split: true, merge: true, remove: true, empty: true, links: true }, "a section's title is a heading like any other");
  assert.deepEqual(blocks[1].caps, { split: true, merge: true, remove: true, empty: true, links: true });
  assert.equal(findBlocks("<main><div><ul><li>no end tag</ul></div></main>").length, 0);
  assert.equal(findBlocks("<main><header><h1>标题 <code>x</code></h1></header></main>").length, 0, "a title with markup stays read-only");
  // The report's title is the h1 of the header (or .doc-title); an h1 in the text is a heading
  // like h2 and h3 there, and splits into a paragraph; so does a section's first heading (its title
  // is a heading like any other).
  const headings = findBlocks(`<main><header><h1 class="doc-title">题</h1></header><section class="doc-section"><h2>节</h2><h1>一级 <code>x</code></h1><h2>二级</h2></section><section class="doc-section"><h2>行</h2></section></main>`);
  assert.deepEqual(headings.map((block) => [block.kind, block.tag, Boolean(block.caps.split)]), [["title", "h1", false], ["flow", "h2", true], ["flow", "h1", true], ["flow", "h2", true], ["flow", "h2", true]]);

  const scoped = `<main><section class="doc-section"><h2>标题</h2><p>直接写在分区里的段落</p>
    <figure><h3>卡片标题</h3><p class="doc-figure-caption">图注</p><div id="c"><p>图表内部</p></div></figure>
    <table><tr><th>表头</th><td>单元格</td><td data-sort-value="3">三</td><td><p>块内容</p></td></tr></table>
    <details class="doc-details"><summary><span class="doc-details-summary-label">摘要</span></summary><div class="doc-details-content"><p>折叠正文</p></div></details>
    <dialog><p>弹窗</p></dialog><ul><li>外层<ul><li>内层</li></ul></li></ul>
    <div class="doc-callout"><p><strong>注意：</strong>提示</p></div><div class="doc-table-meta"><span>范围</span><span>单位</span></div>
    <pre><p>代码</p></pre><button><p>按钮</p></button><label><p>标签</p></label></section></main><p>main 之外</p>`;
  const found = findBlocks(scoped);
  const editable = [
    "flow:h2", "flow:p", "field:h3", "field:p", "cell:th", "cell:td", "cell:td", "label:span", "flow:p", "flow:p", "flow:li", "flow:li", "flow:p", "field:span", "field:span",
  ];
  assert.deepEqual(found.map((block) => `${block.kind}:${block.tag}`), editable, "section, card, cell (one with a sort key too), disclosure-title, dialog and callout text is editable (a callout's paragraph a flow's), a list item holding a list too; chart, code, control and outside-main text is not");
  assert.deepEqual(found[7].caps, { empty: true }, "a disclosure title only changes its text, emptied too");
  assert.deepEqual(found[4].caps, { empty: true, links: true }, "a cell may be emptied but not removed");
  const { label } = HOSTS;
  delete HOSTS.label;
  assert.deepEqual(findBlocks(scoped).map((block) => `${block.kind}:${block.tag}`), editable.filter((entry) => entry !== "label:span"), "a kind no component defines is no text block: what a file holds of a component that is gone stays as written");
  HOSTS.label = label;
  const { text: words } = HOSTS;
  delete HOSTS.text;
  assert.equal(findBlocks("<main><div class='my-strip'><p>字</p></div></main>")[0].kind, "flow", "a paragraph in a whole block, with no component to define words only: it stays the text block it is, and nothing stops");
  if (words) HOSTS.text = words;
  const { html } = instrument(scoped);
  assert.ok(instrument("<main><section class='doc-section'><ul><li>外<ul><li>内</li></ul>后</li></ul></section></main>").html.includes('data-ge-lock="tag:ul"'), "a list amid an item's text keeps the item read-only");
  for (const reason of ["tag:p"]) assert.ok(html.includes(`data-ge-lock="${reason}"`), `read-only reason ${reason}`);
  assert.ok(!html.includes('data-ge-lock="sort-value"'), "a cell with a sort key edits as any (its key follows its text)");
}

// The markers exist only in the preview page.
assert.equal(unmarked(instrument(SRC).html), SRC);

// Saving without changes produces no operation and leaves the file byte for byte.
{
  const page = openPage(SRC);
  assert.deepEqual(edits(page), []);
  assert.equal(save(page, SRC).text, SRC);
}

// Editing a few characters touches one line; the formula is written back as its source.
{
  const page = openPage(SRC);
  const text = textNode(page.block(6), "不会打断");
  text.data = text.data.replace("不会打断正文阅读", "不会打断阅读 & 理解");
  const result = save(page, SRC);
  assert.ok(result.ok);
  assert.deepEqual(changedLines(SRC, result.text), {
    removed: [String.raw`      <p>行内公式嵌入句子，例如 <span class="doc-math-inline">\(\Delta = S_e - S_b\)</span>，不会打断正文阅读。</p>`],
    added: [String.raw`      <p>行内公式嵌入句子，例如 <span class="doc-math-inline">\(\Delta = S_e - S_b\)</span>，不会打断阅读 &amp; 理解。</p>`],
  });
}

// Browser-inserted markup is normalized; attributes of source inline elements survive.
{
  const page = openPage(SRC);
  page.block(3).insertAdjacentHTML("beforeend", `<span style="font-size:1.2em">加</span><b>粗</b><br>`);
  assert.ok(save(page, SRC).text.includes(`<li><strong class="doc-accent">内容组件：</strong>基础 Markdown、KaTeX 公式……加<strong>粗</strong></li>`));
}

// Enter splits with the original indentation; in a list it adds a list item.
{
  const page = openPage(SRC);
  splitBlock(page.block(2), caretIn(page.document, page.block(2), "HTML Report", 0));
  const item = splitBlock(page.block(4), caretIn(page.document, page.block(4), "是", 1));
  item.textContent = "新增的一项";
  const result = save(page, SRC);
  assert.ok(result.ok);
  assert.ok(result.text.includes("    <p>这份页面集中展示 </p>\n    <p>HTML Report Studio 已提供的阅读排版。</p>\n"));
  assert.ok(result.text.includes("      <li>是</li>\n      <li>新增的一项</li>\n    </ul>"));
}

// Pasting several lines (the clipboard's paste, as the page does it): the first joins the text before
// the caret, each further line is a new block, and the text after the caret follows the last line,
// the caret between them.
{
  const page = openPage(SRC);
  const selection = await pasteAt(page, page.block(2), caretIn(page.document, page.block(2), "HTML Report", 0), { text: "第一行\n\n第二行\n\n第三行" });
  assert.equal(page.document.querySelectorAll("[data-ge-new]").length, 2, "two new blocks");
  const host = (selection.anchorNode.nodeType === 3 ? selection.anchorNode.parentElement : selection.anchorNode).closest("[contenteditable]");
  const before = page.document.createRange();
  before.setStart(host, 0);
  before.setEnd(selection.anchorNode, selection.anchorOffset);
  assert.equal(before.toString(), "第三行", "the caret stands after the last pasted line, before the text that followed the caret");
  const result = save(page, SRC);
  assert.ok(result.text.includes("    <p>这份页面集中展示 第一行</p>\n    <p>第二行</p>\n    <p>第三行HTML Report Studio 已提供的阅读排版。</p>\n"));
}

// Pasted blocks and blocks put in at a caret (a link turned into a bookmark) are one step that splits the
// block there and places what is made: the text before the caret stays, the text after it goes on in
// the last pasted text or in a paragraph of its own, a block left empty goes, a list that does not take
// the blocks splits; one undo puts the very same nodes back, and the caret stands where it is promised.
// (clipboard/index.mjs: the two ways in share one transaction.)
{
  const html = (page) => page.document.querySelector("main").innerHTML;
  // The blocks of the summary, one a line: their tag and text (a list's items in brackets).
  const shape = (page) => [...page.document.querySelector(".doc-summary").children].map((node) => {
    const text = (element) => element.textContent.replace(/\s+/g, " ").trim();
    return `${node.localName}:${["UL", "OL"].includes(node.tagName) ? `[${[...node.children].map(text).join("|")}]` : text(node)}`;
  });
  // Where the caret stands: the text before it and after it in its block.
  const around = (selection) => {
    const host = (selection.anchorNode.nodeType === 3 ? selection.anchorNode.parentElement : selection.anchorNode).closest("[contenteditable]");
    const before = host.ownerDocument.createRange();
    before.setStart(host, 0);
    before.setEnd(selection.anchorNode, selection.anchorOffset);
    const after = host.ownerDocument.createRange();
    after.setStart(selection.anchorNode, selection.anchorOffset);
    after.setEnd(host, host.childNodes.length);
    return [before.toString(), after.toString()];
  };
  const undo = ({ page, history, original }) => {
    assert.equal(history.steps.length, 1, "one undo step");
    history.undo();
    assert.equal(html(page), original, "undo puts the very same nodes back");
  };
  const PARAGRAPH = "这份页面集中展示 HTML Report Studio 已提供的阅读排版。";
  const SUMMARY = ["p:🧭 模板背景", `p:${PARAGRAPH}`, "ul:[内容组件：基础 Markdown、KaTeX 公式……|是]"];
  const paste = async (at, offset, content, { prepare = (host) => host } = {}) => {
    const page = openPage(SRC);
    const host = prepare(page.block(at.block));
    const history = stepsOf();
    const original = html(page);
    const range = at.text ? caretIn(page.document, host, at.text, offset) : (() => { const empty = page.document.createRange(); empty.selectNodeContents(host); empty.collapse(true); return empty; })();
    const selection = await pasteAt(page, host, range, { ...content, struct: history.struct });
    return { page, host, history, original, selection };
  };
  const clip = { html: "<ul><li>甲</li><li>乙</li></ul>", text: "甲\n乙" };

  // Text lines: the first joins the text before the caret, the others are blocks, the text after the
  // caret goes on in the last one with the caret between.
  {
    const done = await paste({ block: 2, text: "HTML Report" }, 3, { text: "第一行\n\n第二行\n\n第三行" });
    assert.deepEqual(shape(done.page), [SUMMARY[0], "p:这份页面集中展示 HTM第一行", "p:第二行", "p:第三行L Report Studio 已提供的阅读排版。", SUMMARY[2]]);
    assert.deepEqual(around(done.selection), ["第三行", "L Report Studio 已提供的阅读排版。"]);
    undo(done);
  }
  // A list pasted at the end of an item (nothing after the caret): after the list holding the item, the caret at the
  // end of its last item.
  {
    const done = await paste({ block: 4, text: "是" }, 1, { ...clip });
    assert.deepEqual(shape(done.page), [...SUMMARY, "ul:[甲|乙]"]);
    assert.deepEqual(around(done.selection), ["乙", ""]);
    undo(done);
  }
  // In the middle of an item: the list splits, the text after the caret goes on in the last pasted item, and the
  // items after the item are a list of their own after it.
  {
    const done = await paste({ block: 3, text: "内容组件" }, 2, { ...clip });
    assert.deepEqual(shape(done.page), [SUMMARY[0], `p:${PARAGRAPH}`, "ul:[内容]", "ul:[甲|乙组件：基础 Markdown、KaTeX 公式……]", "ul:[是]"]);
    assert.deepEqual(around(done.selection), ["乙", "组件：基础 Markdown、KaTeX 公式……"]);
    undo(done);
  }
  // A block that is no text (a table): the text after the caret is a paragraph of its own after it, the caret at its start.
  {
    const done = await paste({ block: 2, text: "HTML Report" }, 3, { html: "<table><tr><td>格一</td><td>格二</td></tr><tr><td>三</td><td>四</td></tr></table>", text: "格一\t格二\n三\t四" });
    assert.deepEqual(shape(done.page), [SUMMARY[0], "p:这份页面集中展示 HTM", "div:格一格二三四", "p:L Report Studio 已提供的阅读排版。", SUMMARY[2]]);
    assert.deepEqual(around(done.selection), ["", "L Report Studio 已提供的阅读排版。"]);
    undo(done);
  }
  // Into an empty paragraph: it goes, the pasted blocks stand in its place, the caret at the end of the last.
  {
    const done = await paste({ block: 2 }, 0, { text: "第一行\n\n第二行" }, { prepare: (host) => { host.replaceChildren(); return host; } });
    assert.deepEqual(shape(done.page), [SUMMARY[0], "p:第一行", "p:第二行", SUMMARY[2]]);
    assert.equal(done.host.isConnected, false, "the empty paragraph went");
    assert.deepEqual(around(done.selection), ["第二行", ""]);
    undo(done);
  }

  // Blocks made elsewhere put in at a caret (a link turned into a bookmark): the same step. The text before
  // the caret stays (trailing spaces off), the text after it is a paragraph after them (leading spaces off) with
  // the caret at its start, else they are selected; a block left empty goes.
  const place = async (block, text, offset) => {
    const page = openPage(SRC);
    const host = page.block(block);
    const history = stepsOf();
    const original = html(page);
    const figure = page.document.createElement("figure");
    figure.className = "doc-bookmark";
    figure.setAttribute("data-ge-new", "");
    figure.textContent = "书签";
    let selected = null;
    const { went, selection } = await blocksAt(page, host, caretIn(page.document, host, text, offset), [figure], ["bookmark"], { struct: history.struct, blocks: () => ({ select(list) { selected = list; } }) });
    return { page, host, history, original, went, selection, selected, figure };
  };
  {
    const done = await place(2, "HTML Report", 3);
    assert.deepEqual([done.went, done.selected], [true, null]);
    assert.deepEqual(shape(done.page), [SUMMARY[0], "p:这份页面集中展示 HTM", "figure:书签", "p:L Report Studio 已提供的阅读排版。", SUMMARY[2]]);
    assert.deepEqual(around(done.selection), ["", "L Report Studio 已提供的阅读排版。"]);
    undo(done);
  }
  {
    const done = await place(2, "阅读排版。", 5);
    assert.deepEqual(shape(done.page), [SUMMARY[0], `p:${PARAGRAPH}`, "figure:书签", SUMMARY[2]]);
    assert.deepEqual(done.selected, [done.figure], "nothing after the caret: the new block is selected");
    undo(done);
  }
  {
    const done = await place(2, "这份页面", 0);
    assert.deepEqual(shape(done.page), [SUMMARY[0], "figure:书签", `p:${PARAGRAPH}`, SUMMARY[2]]);
    assert.equal(done.host.isConnected, false, "the block left empty went");
    assert.deepEqual(around(done.selection), ["", PARAGRAPH]);
    undo(done);
  }
  {
    const done = await place(3, "内容组件", 2);
    assert.deepEqual(shape(done.page), [SUMMARY[0], `p:${PARAGRAPH}`, "ul:[内容]", "figure:书签", "p:组件：基础 Markdown、KaTeX 公式……", "ul:[是]"]);
    assert.deepEqual(around(done.selection), ["", "组件：基础 Markdown、KaTeX 公式……"]);
    undo(done);
  }

  // A file pasted (clipboard/ fromFiles): the block its page object makes goes
  // right after the block the caret is in, whole, where a block pasted there goes: in the summary list's
  // first item, the list split after it (the figure was put straight in the list, which the file refused).
  {
    const page = openPage(SRC);
    const host = page.block(3);
    const history = stepsOf();
    const original = html(page);
    const figure = page.document.createElement("figure");
    figure.className = "doc-image";
    figure.setAttribute("data-ge-new", "");
    figure.setAttribute("data-ge-unit-kind", "image");
    figure.textContent = "图";
    connectPages({ ...PAGES, image: { acceptsFile: (file) => file.type.startsWith("image/"), fromFiles: (put) => put(figure) } });
    try {
      await inPage(page, async (view) => {
        view.getSelection().removeAllRanges();
        view.getSelection().addRange(caretIn(page.document, host, "内容组件", 2));
        const data = { types: ["Files"], files: [{ name: "shot.png", type: "image/png" }], getData: () => "" };
        await clipboardOf({ struct: history.struct }).paste({ clipboardData: data, target: host, preventDefault() {} });
      });
    } finally {
      connectPages(PAGES);
    }
    assert.deepEqual(shape(page), [SUMMARY[0], `p:${PARAGRAPH}`, "ul:[内容组件：基础 Markdown、KaTeX 公式……]", "figure:图", "ul:[是]"]);
    undo({ page, history, original });
  }
}

// Backspace at a block start merges it; the merged block's whole line goes away.
{
  const page = openPage(SRC);
  assert.ok(mergeWithPrevious(page.block(4)));
  assert.ok(save(page, SRC).text.includes("基础 Markdown、KaTeX 公式……是</li>\n    </ul>"));
}

// Removing emptied blocks: a list or quote goes away with its last block, unless the file
// gained other content in it meanwhile.
{
  const page = openPage(SRC);
  removeUnit(page.block(4));
  assert.equal(page.document.querySelectorAll(".doc-summary li").length, 1);
  removeUnit(page.block(7));
  removeUnit(page.block(10));
  assert.equal(page.document.querySelector("blockquote"), null, "the quote left empty is removed in the page too");
  const result = save(page, SRC);
  assert.ok(result.ok, JSON.stringify(result.conflicts));
  assert.deepEqual(changedLines(SRC, result.text).removed, [
    "      <li>是</li>",
    "      <blockquote><p>引用块用于保留来源原话或定义。</p></blockquote>",
    "      <ul>",
    "        <li>是</li>",
    "      </ul>",
  ]);
  assert.ok(result.text.includes("    <ul>\n      <li><strong"), "the list with an item left stays");
}

// Bound blocks: something refers to their element (a link, ARIA, the report's script). They keep
// it: they split (the element keeps the first part) and take the next block in, but do not go, nor
// merge into the block before, nor lose all their text. An id nothing points at binds nothing, and
// a section's own label binds no heading in it. A conversion carries a block's attributes (not its
// class, which tells its type): an id stays where links find it. Only a block the report's script
// refers to keeps its type.
{
  const bound = `<main class="doc-page" data-doc-id="demo"><section class="doc-section" aria-labelledby="t">
  <h2 id="t">分区标题</h2>
  <p id="target" lang="en">被链接指向的段落</p>
  <p id="free">没人指向的段落</p>
  <p class="metric">脚本用到的段落</p>
  <p><a href="#target">跳转</a></p>
</section></main>
<script>document.querySelector(".metric");</script>
`;
  const [title, target, free, metric] = findBlocks(bound);
  assert.deepEqual([title.bound, target.bound, free.bound, metric.bound], [false, true, false, true], "only a block something refers to is bound");
  assert.deepEqual(target.caps, { split: true, merge: true, links: true });
  assert.deepEqual(free.caps, { split: true, merge: true, remove: true, empty: true, links: true });
  const page = openPage(bound);
  page.block(target.id).textContent = "";
  const collected = collectEdits(page.document, page.baselines);
  assert.deepEqual(collected.blank, [page.block(target.id)], "the page refuses to save an emptied bound block");
  assert.deepEqual(applyEdits({ current: bound, edits: collected.edits }).conflicts, [{ id: target.id, reason: "empty" }]);
  const split = applyEdits({ current: bound, edits: [{ id: target.id, parts: [{ keep: true, html: "被链接" }, { tag: "p", html: "指向的段落" }] }] });
  assert.ok(split.ok && split.text.includes('<p id="target" lang="en">被链接</p>') && split.text.includes("<p>指向的段落</p>"), "a bound block splits, its element keeping the first part");
  assert.equal(applyEdits({ current: bound, edits: [{ id: target.id, parts: [] }] }).conflicts[0].reason, "referenced", "and does not go");
  const merging = openPage(bound);
  assert.equal(mergeWithPrevious(merging.block(target.id)), null, "nor merges into the block before");
  assert.equal(mergeWithPrevious(merging.block(free.id))?.id, "target", "but takes the next block in");

  const typed = openPage(bound);
  assert.ok(targetsOf(typed.block(target.id)).includes("heading3") && targetsOf(typed.block(title.id)).includes("paragraph"), "blocks with ids change type like any other");
  assert.deepEqual(targetsOf(typed.block(metric.id)), [], "one the script refers to keeps its type");
  convertBlock(typed.block(target.id), "heading3");
  convertBlock(typed.block(title.id), "paragraph");
  assert.equal(typed.document.querySelector("h3").id, "target", "the id goes along on the page");
  const kept = saveAll(typed, bound);
  assert.ok(kept.ok, JSON.stringify(kept.conflicts));
  assert.ok(kept.text.includes('<h3 id="target" lang="en">被链接指向的段落</h3>') && kept.text.includes('<p id="t">分区标题</p>'), "and in the file");

  const renamed = openPage(SRC);
  renamed.block(5).textContent = "Markdown 基础";
  assert.ok(save(renamed, SRC).text.includes('<h2 id="markdown-title">Markdown 基础</h2>'));
  const titled = openPage(`<main><section>\n  <h2>标题</h2>\n  <p>正文</p>\n</section></main>`);
  assert.equal(mergeWithPrevious(titled.block(1))?.tagName, "H2", "a paragraph merges into a section's heading as into any heading");
}

// The report title is plain text and is mirrored into <title> when it occurs there once.
{
  const source = `<!doctype html>\n<html><head><title>Studio · 旧标题</title></head><body>\n<main>\n  <h1 class="doc-title">旧标题</h1>\n  <p>正文</p>\n</main>\n</body></html>\n`;
  const page = openPage(source);
  page.block(0).textContent = "新 & 标题";
  const result = save(page, source);
  assert.ok(result.ok);
  assert.ok(result.text.includes("<title>Studio · 新 &amp; 标题</title>") && result.text.includes('<h1 class="doc-title">新 &amp; 标题</h1>'));
  assert.deepEqual(result.title, { from: "旧标题", to: "新 & 标题", synced: true });
  assert.equal(applyEdits({ current: source, edits: [{ id: 0, parts: [{ keep: true, html: "<strong>粗</strong>" }] }] }).ok, false, "no markup in the title");
  assert.equal(applyEdits({ current: source, edits: [{ id: 0, parts: [{ keep: true, html: "a" }, { tag: "p", html: "b" }] }] }).ok, false);
  const other = source.replace("Studio · 旧标题", "另一个标题");
  assert.equal(applyEdits({ current: other, edits: [{ id: 0, parts: [{ keep: true, html: "新" }] }] }).title.synced, false);
  // An untitled document: its title emptied is saved empty, <title> with it; a first title fills an empty <title> whole.
  const emptied = applyEdits({ current: source.replace("Studio · 旧标题", "旧标题"), edits: [{ id: 0, parts: [{ keep: true, html: "" }] }] });
  assert.ok(emptied.ok && emptied.text.includes('<h1 class="doc-title"></h1>') && emptied.text.includes("<title></title>"), emptied.text);
  assert.deepEqual(emptied.title, { from: "旧标题", to: "", synced: true });
  const named = applyEdits({ current: emptied.text, edits: [{ id: 0, parts: [{ keep: true, html: "季度复盘" }] }] });
  assert.ok(named.ok && named.text.includes("<title>季度复盘</title>") && named.text.includes('<h1 class="doc-title">季度复盘</h1>'), named.text);
  assert.deepEqual(named.title, { from: "", to: "季度复盘", synced: true });
}

// Table cells: text only, may be emptied, cannot split or break out of the cell.
{
  const source = `<main>\n  <div class="doc-table-wrap"><table class="doc-table">\n    <thead><tr><th>实验</th><th>得分</th></tr></thead>\n    <tbody><tr><td>候选 A</td><td>49.80</td></tr></tbody>\n  </table></div>\n</main>\n`;
  const page = openPage(source);
  page.block(3).textContent = "50.10";
  page.block(2).textContent = "";
  page.block(1).textContent = "综合得分";
  const result = save(page, source);
  assert.ok(result.ok, JSON.stringify(result.conflicts));
  assert.ok(result.text.includes("<th>综合得分</th>") && result.text.includes("<tr><td></td><td>50.10</td></tr>"));
  for (const html of ["1</td><td>2", "1</td></tr><tr><td>2", "x</table><script>alert(1)</script>"]) {
    assert.equal(applyEdits({ current: source, edits: [{ id: 3, parts: [{ keep: true, html }] }] }).ok, false, html);
  }
}

// Card titles and captions, disclosure titles and a callout's paragraph.
{
  const source = `<main>\n  <figure class="doc-figure">\n    <h3>卡片标题</h3>\n    <p class="doc-figure-caption">图注</p>\n    <div id="chart"></div>\n  </figure>\n  <details class="doc-details">\n    <summary><span class="doc-details-summary-label">查看 <code>x</code></span></summary>\n    <div class="doc-details-content"><p>正文</p></div>\n  </details>\n  <div class="doc-callout"><p><strong>注意：</strong>提示内容</p></div>\n</main>\n`;
  const page = openPage(source);
  assert.deepEqual([...page.document.querySelectorAll("[data-ge-block]")].map((node) => node.getAttribute("data-ge-kind")), ["field", "field", "label", "flow", "flow"]);
  page.block(0).textContent = "新卡片标题";
  removeUnit(page.block(1));
  page.block(2).firstChild.data = "查看完整 ";
  textNode(page.block(4), "提示内容").data = "提示内容已改";
  const result = save(page, source);
  assert.ok(result.ok, JSON.stringify(result.conflicts));
  assert.deepEqual(changedLines(source, result.text), {
    removed: [
      "    <h3>卡片标题</h3>",
      '    <p class="doc-figure-caption">图注</p>',
      '    <summary><span class="doc-details-summary-label">查看 <code>x</code></span></summary>',
      '  <div class="doc-callout"><p><strong>注意：</strong>提示内容</p></div>',
    ],
    added: [
      "    <h3>新卡片标题</h3>",
      '    <summary><span class="doc-details-summary-label">查看完整 <code>x</code></span></summary>',
      '  <div class="doc-callout"><p><strong>注意：</strong>提示内容已改</p></div>',
    ],
  });
  assert.equal(applyEdits({ current: source, edits: [{ id: 2, parts: [] }] }).conflicts[0].reason, "fixed", "a disclosure keeps its title");
}

// Sheet tab labels: plain text, renamed but never split, removed or given markup.
{
  const source = `<main>\n  <section class="doc-sheet-shell" data-doc-sheets>\n    <div class="doc-sheet-tabs" role="tablist"><button class="doc-sheet-tab" type="button" id="t-a" data-sheet-tab="a">结果</button><button class="doc-sheet-tab" type="button" data-sheet-tab="b">附录</button></div>\n    <div data-doc-sheet="a"><p>正文</p></div>\n  </section>\n</main>\n`;
  const blocks = findBlocks(source);
  assert.deepEqual(blocks.map((block) => `${block.kind}:${block.tag}`), ["tab:button", "tab:button", "flow:p"]);
  assert.deepEqual(blocks[0].caps, { plain: true });
  const page = openPage(source);
  const name = page.block(0);
  assert.equal(name.tagName, "SPAN", "the tab's name moves into a span of its own");
  assert.equal(name.parentElement.id, "t-a");
  assert.equal(name.parentElement.hasAttribute("data-ge-block"), false);
  assert.equal(name.hasAttribute("contenteditable"), false, "a tab keeps working as a button until it is renamed");
  assert.equal(name.getAttribute("data-ge-kind"), "tab");
  assert.equal(page.document.querySelector("#t-a").textContent, "结果");
  name.textContent = "主要结果";
  const result = save(page, source);
  assert.ok(result.ok && result.text.includes('data-sheet-tab="a">主要结果</button>'));
  for (const parts of [[{ keep: true, html: "<strong>粗</strong>" }], [{ keep: true, html: "" }], []]) {
    assert.equal(applyEdits({ current: source, edits: [{ id: 1, parts }] }).ok, false, JSON.stringify(parts));
  }
}

// Links: allowed, but not script URLs or event handlers.
{
  assert.ok(applyEdits({ current: SRC, edits: [{ id: 2, parts: [{ keep: true, html: '见 <a href="https://example.com/a?b=1&amp;c=2">链接</a>' }] }] }).ok);
  for (const html of ['<a href=" javascript:alert(1)">x</a>', '<a href="java&#10;script:x">x</a>', '<strong onclick="x()">x</strong>']) {
    assert.equal(applyEdits({ current: SRC, edits: [{ id: 2, parts: [{ keep: true, html }] }] }).ok, false, html);
  }
  assert.ok(instrument('<main><p><a href="javascript:x()">y</a></p></main>').html.includes('data-ge-lock="link"'));
}

// The author's <b>/<i> stay as written; only newly created bold becomes <strong>.
{
  const source = `<main><div>\n  <p>AI 用了 <b title="t">b 标签</b> 和 <i>i</i>。</p>\n</div></main>\n`;
  const page = openPage(source);
  page.block(0).insertAdjacentHTML("beforeend", "<b>新加粗</b>");
  assert.equal(save(page, source).text, `<main><div>\n  <p>AI 用了 <b title="t">b 标签</b> 和 <i>i</i>。<strong>新加粗</strong></p>\n</div></main>\n`);
}

// A file that changed after the page opened is the business of commitEdits (it finds what the page
// names there: tests/unit/commit.mjs, "Against a file the Agent changed", and block-ids.mjs);
// applyEdits only writes into the file as it is.

// Content cannot break out of its block.
assert.equal(applyEdits({ current: SRC, edits: [{ id: 2, parts: [{ keep: true, html: "x</p><script>alert(1)</script><p>y" }] }] }).ok, false);

// CRLF and BOM: offsets stay exact and new blocks use CRLF.
{
  const crlf = `﻿${SRC.replace(/\n/g, "\r\n")}`;
  const page = openPage(crlf);
  splitBlock(page.block(2), caretIn(page.document, page.block(2), "HTML Report", 0));
  const result = save(page, crlf);
  assert.ok(result.ok);
  assert.ok(result.text.startsWith("﻿"));
  assert.ok(result.text.includes("    <p>这份页面集中展示 </p>\r\n    <p>HTML Report Studio 已提供的阅读排版。</p>\r\n"));
  assert.equal(result.text.replace(/\r\n/g, "\n").split("\n").length, SRC.split("\n").length + 1);
}

// Enter at the start of an h3 right below a section title: the new paragraph belongs to the h3.
{
  const source = `<main><section class="doc-section">\n  <h2 id="s">分区</h2>\n  <h3>小节</h3>\n</section></main>`;
  const page = openPage(source);
  const heading = page.block(1);
  const range = page.document.createRange();
  range.setStart(heading, 0);
  range.collapse(true);
  splitBlock(heading, range);
  heading.previousElementSibling.textContent = "插在小节前的段落";
  const result = save(page, source);
  assert.ok(result.ok, JSON.stringify(result.conflicts));
  assert.ok(result.text.includes('  <h2 id="s">分区</h2>\n  <p>插在小节前的段落</p>\n  <h3>小节</h3>'));
}

// A new block with no neighbour able to take it is reported instead of saved (inside a card, whose
// title and caption do not split).
{
  const source = `<main><section>\n  <figure class="doc-figure"><h3>卡片</h3><p class="doc-figure-caption">说明</p></figure>\n</section></main>`;
  const page = openPage(source);
  const orphan = page.document.createElement("p");
  orphan.setAttribute("data-ge-new", "");
  orphan.textContent = "无处可归";
  page.block(0).after(orphan);
  const { unplaced } = collectEdits(page.document, page.baselines);
  assert.deepEqual(unplaced, [orphan]);
}

// Undo restores blocks from innerHTML snapshots; the markers survive, so formulas still save as source.
{
  const page = openPage(SRC);
  const block = page.block(6);
  const snapshot = block.innerHTML;
  block.textContent = "临时改动";
  block.innerHTML = snapshot;
  assert.equal(serializeInner(block), page.baselines.get(6));
  assert.deepEqual(edits(page), []);
}

// Script-filled elements: the page shows other text than the source, so the editor skips them;
// an element left empty in the source is not "emptied" by the reader.
{
  const source = `<main>\n  <p id="status" aria-live="polite"></p>\n  <p>含 <span class="doc-math-inline">\\(x\\)</span> 的段落</p>\n  <p id="memo" contenteditable="true">报告自己的输入区</p>\n  <table><tr><th>分数</th></tr></table>\n</main>\n`;
  assert.deepEqual(findBlocks(source).map((block) => block.tag), ["p", "p", "th"], "the document's own contenteditable is not an editor block");
  const { html, map } = instrument(source);
  const { document } = new JSDOM(html).window;
  const [status, formula, header] = map.blocks.map((block) => document.querySelector(`[data-ge-block="${block.id}"]`));
  status.textContent = "当前排序：分数";
  formula.querySelector(".doc-math-inline").innerHTML = katex.renderToString("x");
  header.insertAdjacentHTML("beforeend", '<button type="button" class="doc-table-sort-button" contenteditable="false" data-doc-sort-arrow="asc" aria-label="分数：点击按升序排序"></button>'); // what tables.js does
  assert.equal(matchesSource(status, map.blocks[0].inner), false, "text written by a script");
  assert.equal(matchesSource(formula, map.blocks[1].inner), true, "rendered formulas do not count");
  assert.equal(matchesSource(header, map.blocks[2].inner), true, "decorative sort arrows do not count");
  const empty = openPage(`<main>\n  <p id="status"></p>\n</main>\n`);
  assert.deepEqual(collectEdits(empty.document, empty.baselines), { edits: [], units: [], unplaced: [], blank: [], strays: [] });
}

// The page looked up once per collect (firstByAttribute), not once per block: each value finds the
// element a search for it would, the first in document order carrying it under any of the names,
// the element searched in left out.
{
  const { document } = new JSDOM(`<main data-ge-box="0"><p data-ge-block="1">甲</p><pre data-ge-code="2"></pre><div data-ge-box="3"><p data-ge-block="2">乙</p><p data-ge-block="1">丙</p></div></main>`).window;
  const main = document.querySelector("main");
  const found = firstByAttribute(document, "data-ge-block", "data-ge-code");
  for (const value of ["1", "2"]) assert.equal(found.get(value), document.querySelector(`[data-ge-block="${value}"], [data-ge-code="${value}"]`), `the first carrying ${value}`);
  assert.equal(found.get("2").localName, "pre", "a code block not opened first: it comes first");
  assert.ok(!found.has("3") && !found.has("0"), "only the names asked for");
  const boxes = firstByAttribute(main, "data-ge-box");
  assert.ok(!boxes.has("0") && boxes.get("3") === main.querySelector('[data-ge-box="3"]'), "the element searched in left out, as querySelector does");
  // A block taken off the page is found missing (an empty edit; with the layout, its unit deleted
  // instead), one still there is not.
  const page = openPage(`<main>\n  <p>甲段落。</p>\n\n  <p>乙段落。</p>\n</main>\n`);
  page.document.querySelector("p").remove();
  assert.deepEqual(collectEdits(page.document, page.baselines).edits, [{ id: 0, parts: [] }]);
  const { edits, units } = collectEdits(page.document, page.baselines, page.layout);
  assert.deepEqual([edits, units], [[], [{ id: 0, remove: true }]]);
}

// Inline formatting: only the selected part is split and wrapped; colors are the kit's classes.
{
  const source = `<main>\n  <p>甲乙丙丁戊</p>\n  <p><strong class="doc-accent">加粗的开头</strong>普通文字</p>\n  <p>公式 <span class="doc-math-inline">\\(x\\)</span> 旁边</p>\n  <p>带 <span class="doc-text-red">红字</span> 与 <span class="doc-text-red doc-highlight-yellow">黄底红字</span></p>\n  <p>带 <span class="unknown">未知</span></p>\n</main>\n`;
  assert.equal(findBlocks(source).length, 5, "color spans are inline markup, a span of the document's own an atom of its paragraph");
  const page = openPage(source);
  const doc = page.document;
  const pick = (host, text, length = text.length) => {
    const range = caretIn(doc, host, text, 0);
    range.setEnd(range.startContainer, range.startOffset + length);
    return range;
  };
  const all = (host) => {
    const range = doc.createRange();
    range.selectNodeContents(host);
    return range;
  };

  const own = page.block(4);
  assert.equal(serializeInner(own), '带 <span class="unknown">未知</span>', "a span of the document's own: written back as it was");
  formatRange(own, all(own), "bold", true);
  assert.equal(serializeInner(own), '<strong>带 <span class="unknown">未知</span></strong>', "a format across it takes it in whole");
  formatRange(own, all(own), "bold", false);

  const first = page.block(0);
  let range = formatRange(first, pick(first, "乙丙"), "bold", true);
  assert.equal(serializeInner(first), "甲<strong>乙丙</strong>丁戊");
  assert.equal(range.toString(), "乙丙", "the selection still covers the formatted text");
  assert.equal(markValue(first, range, "bold"), true);
  formatRange(first, pick(first, "丁"), "bold", true);
  assert.equal(serializeInner(first), "甲<strong>乙丙丁</strong>戊", "neighbouring bold merges");
  formatRange(first, pick(first, "丙丁"), "text", "red");
  formatRange(first, pick(first, "丁"), "text", "blue");
  assert.equal(serializeInner(first), '甲<strong>乙<span class="doc-text-red">丙</span><span class="doc-text-blue">丁</span></strong>戊', "a new color replaces the old one");
  const across = doc.createRange();
  across.setStart(textNode(first.querySelector("strong"), "乙"), 0);
  across.setEnd(first.querySelector(".doc-text-red").firstChild, 1);
  assert.equal(markValue(first, across, "text"), null, "mixed colors have no shared value");
  range = formatRange(first, across, "highlight", "yellow");
  assert.equal(markValue(first, range, "highlight"), "yellow");
  assert.equal(serializeInner(first), '甲<strong><span class="doc-highlight-yellow">乙<span class="doc-text-red">丙</span></span><span class="doc-text-blue">丁</span></strong>戊');
  formatRange(first, all(first), "text", null);
  assert.equal(serializeInner(first), '甲<strong><span class="doc-highlight-yellow">乙丙</span>丁</strong>戊', "removing a color keeps the highlight");
  formatRange(first, all(first), "italic", true);
  assert.equal(serializeInner(first), '<em>甲<strong><span class="doc-highlight-yellow">乙丙</span>丁</strong>戊</em>');

  const second = page.block(1);
  formatRange(second, pick(second, "的开"), "bold", false);
  assert.equal(serializeInner(second), '<strong class="doc-accent">加粗</strong>的开<strong class="doc-accent">头</strong>普通文字', "unbolding splits the author's element and keeps its attributes");
  const straddle = doc.createRange();
  straddle.setStart(textNode(second.querySelectorAll("strong")[1], "头"), 0);
  straddle.setEnd(textNode(second, "普通文字"), 2);
  formatRange(second, straddle, "code", true);
  assert.equal(serializeInner(second), '<strong class="doc-accent">加粗</strong>的开<code><strong class="doc-accent">头</strong>普通</code>文字');

  const third = page.block(2);
  const insideFormula = doc.createRange();
  insideFormula.setStart(third.querySelector(".katex-html").firstChild, 0);
  insideFormula.setEnd(textNode(third, "旁边"), 2); // " 旁" of " 旁边"
  formatRange(third, insideFormula, "bold", true);
  assert.equal(serializeInner(third), String.raw`公式 <strong><span class="doc-math-inline">\(x\)</span> 旁</strong>边`, "a boundary inside a formula takes the whole formula");

  assert.deepEqual(edits(page).find((edit) => edit.id === 3), undefined, "source color spans round-trip unchanged");
  const result = save(page, source);
  assert.ok(result.ok, JSON.stringify(result.conflicts));
  assert.ok(result.text.includes('  <p><em>甲<strong><span class="doc-highlight-yellow">乙丙</span>丁</strong>戊</em></p>'));
  for (const html of ['<span class="doc-text-cyan">x</span>', '<span class="doc-text-red" style="color:red">x</span>', '<span class="note doc-text-red">x</span>', '<span>x</span>']) {
    assert.equal(applyEdits({ current: source, edits: [{ id: 0, parts: [{ keep: true, html }] }] }).ok, false, html);
  }
}

// Underline and strikethrough are marks like bold (<u>, <s>); a formula made on the page from
// selected text (formula/) is a chip written back as the kit's .doc-math-inline.
{
  const source = `<main>\n  <p>一<u>二</u>三<s>四</s>五</p>\n  <p>甲乙丙</p>\n</main>\n`;
  assert.equal(findBlocks(source).length, 2, "<u> and <s> are inline markup a text block may hold");
  const page = openPage(source);
  const doc = page.document;
  const pick = (host, text) => {
    const range = caretIn(doc, host, text, 0);
    range.setEnd(range.startContainer, range.startOffset + text.length);
    return range;
  };
  const marked = page.block(0);
  assert.equal(markValue(marked, pick(marked, "二"), "underline"), true);
  assert.equal(markValue(marked, pick(marked, "四"), "strike"), true);
  formatRange(marked, pick(marked, "三"), "strike", true);
  assert.equal(serializeInner(marked), "一<u>二</u><s>三四</s>五", "strikethrough joins its neighbour");
  formatRange(marked, pick(marked, "二"), "underline", false);
  assert.equal(serializeInner(marked), "一二<s>三四</s>五");
  // An underline's color and weight: classes of the u itself; a pick underlines the text so,
  // "default" the red and 1px, and keeps the other facet the text had.
  formatRange(marked, rangeAt(marked, [0, 2]), "underlineColor", "blue");
  assert.equal(serializeInner(marked), '<u class="doc-underline-blue">一二</u><s>三四</s>五', "a color underlines in that color");
  assert.equal(markValue(marked, pick(marked, "一"), "underlineColor"), "blue");
  assert.equal(markValue(marked, pick(marked, "一"), "underline"), true, "a colored underline is an underline");
  formatRange(marked, rangeAt(marked, [0, 2]), "underlineWeight", "thick");
  assert.equal(serializeInner(marked), '<u class="doc-underline-thick doc-underline-blue">一二</u><s>三四</s>五', "a weight keeps the color");
  formatRange(marked, pick(marked, "二"), "underlineColor", "default");
  assert.equal(serializeInner(marked), '<u class="doc-underline-thick doc-underline-blue">一</u><u class="doc-underline-thick">二</u><s>三四</s>五', "the default red keeps the weight");
  assert.equal(markValue(marked, pick(marked, "二"), "underlineWeight"), "thick");
  formatRange(marked, rangeAt(marked, [0, 2]), "underline", false);
  assert.equal(serializeInner(marked), "一二<s>三四</s>五", "taking the underline off takes the styled ones off too");
  // An emptied block (its placeholder <br> alone) has its caret at its start, before the <br>: a list
  // item emptied and moved out a level was given its caret after it, where atEdge saw no start, and
  // Backspace then did nothing.
  const emptied = marked.ownerDocument.createElement("li");
  emptied.innerHTML = "<br>";
  const atEmpty = rangeAt(emptied, [0, 0]);
  assert.deepEqual([atEmpty.startContainer === emptied, atEmpty.startOffset, atEmpty.endContainer === emptied, atEmpty.endOffset], [true, 0, true, 0], "an emptied block's caret at its start");
  formatRange(marked, pick(marked, "五"), "underlineWeight", "thin");

  const plain = page.block(1);
  const range = pick(plain, "乙");
  range.deleteContents();
  range.insertNode(newFormula(doc, "a<b", katex.renderToString("a<b")));
  assert.equal(serializeInner(plain), String.raw`甲<span class="doc-math-inline">\(a&lt;b\)</span>丙`, "the formula as its TeX, escaped");
  const result = save(page, source);
  assert.ok(result.ok, JSON.stringify(result.conflicts));
  assert.ok(result.text.includes('<p>一二<s>三四</s><u class="doc-underline-thin">五</u></p>') && result.text.includes(String.raw`<p>甲<span class="doc-math-inline">\(a&lt;b\)</span>丙</p>`), result.text);
}

// Readable text of block source (what the page lists for the reader to copy).
{
  const { document } = new JSDOM("").window;
  assert.equal(plainText('a <strong>b</strong>  <span class="doc-math-inline">\\(x\\)</span>', document), "a b \\(x\\)");
}

// A partial write applies what it can and lists the rest (a commit holds the rest back for the reader).
{
  const page = openPage(SRC);
  page.block(2).textContent = "人改的第二段";
  const bad = [{ id: 7, parts: [{ keep: true, html: "x</p><script>alert(1)</script><p>y" }] }];
  const partial = applyEdits({ current: SRC, edits: [...edits(page), ...bad], partial: true });
  assert.equal(partial.ok, false);
  assert.deepEqual(partial.conflicts, [{ id: 7, reason: "invalid" }]);
  assert.ok(partial.text.includes("<p>人改的第二段</p>") && partial.text.includes("引用块用于保留来源原话或定义。"));
  assert.equal(applyEdits({ current: SRC, edits: [...edits(page), ...bad] }).text, undefined, "without partial, nothing is written");
}

// Units: the blocks the reader can select and delete, and the containers that hold them.
const WIRED = `<main>
  <section class="doc-section" aria-labelledby="t"><h2 id="t">标题</h2>
    <p>自由的段落</p>
    <figure class="doc-figure"><h3>卡片</h3><div id="chart"></div></figure>
    <p class="metric">按类名找</p>
    <p id="target">被链接指向</p>
    <p><a href="#target">跳转</a></p>
    <div data-widget="x"><p>组件</p></div>
  </section>
</main>
<script>DocCharts.get("#chart"); document.querySelectorAll(".metric"); document.querySelector("[data-widget]");</script>
`;
{
  const { units, boxes } = findUnits(SRC);
  assert.deepEqual(units.map((unit) => unit.kind), [
    "highlight", "paragraph", "paragraph", "list", "item", "item", "section", "heading", "block", "paragraph", "quote", "paragraph", "code", "list", "item", "paragraph",
  ]);
  assert.ok(SRC.slice(units[9].start).startsWith("<!-- AI 写的注释"), "the comment right above a paragraph goes with it");
  // A list item is a box too, for the lists it holds after its text (none here): after the others.
  assert.deepEqual(boxes.map((box) => box.kind + (box.pure ? "*" : "")), ["main", "header", "highlight*", "list*", "section*", "plain*", "quote*", "list*", "nest", "nest", "nest"]);
  assert.ok(units.every((unit) => unit.keep === null));
  assert.deepEqual(findBlocks(SRC).map((block) => block.unit), [null, 1, 2, 4, 5, 7, 9, 11, 12, 12, 14, 15], "each text block lies in the innermost unit around it (a code block's title and code in it)");

  // The report's script or another element refers to it: it stays.
  const kept = findUnits(WIRED).units.map((unit) => unit.keep && `${unit.keep.reason} ${unit.keep.names.join(" ")}`);
  assert.deepEqual(kept, ["script #chart [data-widget] .metric", null, null, "script #chart", "script .metric", "ref #target", null, "script [data-widget]", null], "the title the section is labelled by is not kept by that label");
  const wired = findUnits(WIRED).units;
  const figure = wired.findIndex((unit) => unit.kind === "figure");
  assert.deepEqual(applyEdits({ current: WIRED, edits: [], units: [{ id: figure, remove: true }] }).conflicts, [{ unit: figure, reason: "referenced" }]);
  const metric = findBlocks(WIRED).find((block) => block.self === 4);
  assert.equal(applyEdits({ current: WIRED, edits: [{ id: metric.id, parts: [] }] }).conflicts[0].reason, "referenced", "nor through removing its text");
  assert.deepEqual(applyEdits({ current: WIRED, edits: [], units: [{ id: 99, remove: true }, { id: 1 }] }).conflicts.map((entry) => entry.reason), ["unknown", "unknown"]);
  const page = openPage(WIRED);
  assert.ok(page.unit(4).hasAttribute("data-ge-keep"));
  assert.equal(mergeWithPrevious(page.unit(4)), null, "a kept paragraph does not merge away either");
}

// A drawing's ids (an SVG's marker named by url(#id), a symbol by href="#id"): a figure naming its
// own keeps nothing (it may be deleted), another block naming them keeps it ("ref"), in any attribute,
// its style too. A copy of a card (copiedSource) keeps the ids it names itself, each with a prefix of
// its own (c1-, the first no id of the file starts with; two copies of one commit two), every reference
// in it written to match; its other ids go, as ever.
{
  const drawing = (id, uses = "") => `<figure class="doc-figure"><h3>图 ${id}</h3><svg viewBox="0 0 100 20"><defs><marker id="${id}-arrow"><path d="M0 0L4 2L0 4"/></marker><circle id="${id}-dot" r="2"/></defs><path id="${id}-line" d="M0 10H90" marker-end="url(#${id}-arrow)"${uses}/><use href="#${id}-dot" x="2"/><use xlink:href="#${id}-dot" x="4"/></svg></figure>`;
  const source = `<main>
  ${drawing("fa")}
  ${drawing("fb", ' style="fill: url(\'#fa-arrow\')"')}
  ${drawing("fc")}
</main>
`;
  const figures = findUnits(source).units.filter((unit) => unit.kind === "figure");
  assert.deepEqual(figures.map((unit) => unit.keep && `${unit.keep.reason} ${unit.keep.names.join(" ")}`), ["ref #fa-arrow", null, null], "its own references keep no figure; another's url(#…) in a style keeps it");
  assert.equal(applyEdits({ current: source, edits: [], units: [{ id: figures[2].id, remove: true }] }).ok, true, "a figure naming only its own markers is deleted");
  const copy = copiedSource(source, figures[2]);
  assert.equal(copy, drawing("c1-fc").replace("<h3>图 c1-fc</h3>", "<h3>图 fc</h3>").replace(' id="c1-fc-line"', ""), "its own ids prefixed, references rewritten (xlink:href as written), an id no one names taken out");
  const taken = new Set(["fa-arrow", "c1-fa"]);
  assert.match(copiedSource(source, figures[2], { taken }), /<marker id="c2-fc-arrow">/, "c1- taken: c2-");
  assert.match(copiedSource(source, figures[2], { taken }), /<marker id="c3-fc-arrow">/, "a second copy of the same commit: its own prefix");
  assert.equal(copiedSource(source, figures[1]).includes("url('#fa-arrow')"), true, "a reference to an id outside it as written");
}

// A class the script can select an element by keeps its block; a property the code reads or a
// quoted word that is no class API's argument does not (found testing the skill with Agents, 2026-10-28: a d3 drawing's
// row.lo kept a figure of class "lo" and its section from the reader), nor anything in a data block
// (a chart's <script type="application/json"> with a "lo" key). gallery check names what stays.
{
  const page = (script, data = "") => `<main>
  <section class="doc-section"><h2>方法</h2>
    <p>一段</p>
    <figure class="doc-figure"><h3>放置</h3><div class="grid"><i class="on lo"></i></div></figure>
  </section>
  <section class="doc-section"><h2>结果</h2><p>另一段</p>${data}</section>
</main>
<script>${script}</script>
`;
  const kept = (source) => findUnits(source).units.filter((unit) => unit.keep).map((unit) => `${unit.kind} ${unit.keep.names.join(" ")}${unit.keep.own ? "" : " (held)"}`);
  const free = [
    "rows.forEach((row) => console.log(row.lo, item.lo));",
    'svg.selectAll("circle").data(rows).join("circle").attr("cx", (d) => x(d.lo)).attr("cy", 2).on("click", show);',
    'const key = "lo"; const label = `${row.lo} – ${row.hi}`;',
    "const pattern = /['\"]/; const half = width / 2; // \".lo\" in a comment",
    'const k = "lo"; rows.map((row) => row[k]);',
  ];
  for (const script of free) assert.deepEqual(kept(page(script)), [], script);
  assert.deepEqual(kept(page("", '<script type="application/json">{"lo": 1, "on": true}</script>')), [], "a data block's keys are no classes");
  assert.deepEqual(kept(page("", '<script type="application/json" id="grid-data">{}</script>')), [], "nor is its text code");
  const locked = {
    'document.querySelector(".grid i.lo").remove();': ["section .grid .lo (held)", "figure .grid .lo"],
    'el.classList.contains("lo");': ["section .lo (held)", "figure .lo"],
    'cells.classed("on lo", true);': ["section .on .lo (held)", "figure .on .lo"],
    "document.getElementsByClassName('on');": ["section .on (held)", "figure .on"],
    "if (cell.className === \"on lo\") mark(cell);": ["section .on .lo (held)", "figure .on .lo"],
    "document.querySelectorAll('[class~=\"lo\"]');": ["section .lo (held)", "figure .lo"],
    "d3.select(`i.${\"lo\"}`); const t = `.grid`;": ["section .grid .lo (held)", "figure .grid .lo"],
    // The class reads a review of 2026-10-29 found unkept: a name given to className's string
    // methods or jQuery's class methods, and one a selector or a class API's argument is built from.
    'if (el.className.includes("lo")) mark(el);': ["section .lo (held)", "figure .lo"],
    'el.className.split(" ").includes("lo");': ["section .lo (held)", "figure .lo"],
    '$(el).hasClass("lo"); $(el).addClass("on");': ["section .on .lo (held)", "figure .on .lo"],
    'const cls = "lo"; document.querySelectorAll("." + cls);': ["section .lo (held)", "figure .lo"],
    "const c = \"lo\"; d3.selectAll(`.${c}`);": ["section .lo (held)", "figure .lo"],
    'const cls = "lo"; el.classList.toggle(cls);': ["section .lo (held)", "figure .lo"],
  };
  for (const [script, expected] of Object.entries(locked)) assert.deepEqual(kept(page(script)), expected, script);
  assert.deepEqual(scriptKept(page('el.classList.contains("lo");')), ["line 4: <figure> in 方法 kept by the script: .lo (the reader cannot delete or convert it; rename any of these the script does not select it by)"], "check's note: the block a held one keeps is left to that one's");
  assert.deepEqual(scriptKept(page("rows.forEach((row) => row.lo);")), []);
}

// Words in a whole block or a card's drawing (decided 2026-10-27): a paragraph, a heading or an item
// there, no unit of its own, is a text block of words only (`text`: emptied, links, never split,
// joined or removed on its own: no '/' menu, no Enter), as a text leaf there is; a card's title and
// caption stay its fields, and the kit's whole blocks' items (a filter's) are words only too.
{
  const source = `<main>
  <p>正文</p>
  <div class="layout"><h3>框</h3><p>一段</p><ul><li>一项</li></ul></div>
  <figure class="doc-figure"><h3>标题</h3><p class="doc-figure-caption">说明</p><div class="drawing"><p>画里的字</p><ol><li>一步</li></ol></div></figure>
  <div class="doc-filter" data-doc-filter="f"><ul><li>筛选项</li></ul></div>
</main>
`;
  const blocks = findBlocks(source);
  const inner = (block) => source.slice(block.innerStart, block.innerEnd);
  assert.deepEqual(blocks.map((block) => `${block.tag} ${block.kind} ${Object.keys(block.caps)} ${inner(block)}`), [
    "p flow split,merge,remove,empty,links 正文",
    "h3 text empty,links 框", "p text empty,links 一段", "li text empty,links 一项",
    "h3 field remove,links 标题", "p field remove,links 说明", "p text empty,links 画里的字", "li text empty,links 一步",
    "li text empty,links 筛选项",
  ]);
  const byText = (text) => blocks.find((block) => inner(block) === text);
  const result = (edit) => applyEdits({ current: source, edits: [edit] });
  assert.equal(result({ id: byText("一段").id, parts: [{ keep: true, html: "一" }, { tag: "p", html: "段" }] }).ok, false, "never split");
  assert.equal(result({ id: byText("画里的字").id, parts: [] }).conflicts[0].reason, "fixed", "never removed on its own");
  assert.equal(result({ id: byText("一步").id, parts: [{ keep: true, html: "" }] }).text, source.replace("<li>一步</li>", "<li></li>"), "emptied, its element kept");
  assert.equal(result({ id: byText("画里的字").id, parts: [{ keep: true, html: '画里的 <strong>字</strong> <a href="https://example.com">链</a>' }] }).ok, true, "formats and links as in any text");
}

// A Sheet tab is kept by a script only where a script reads the Sheet state by its key (the tab it
// starts on or is given, one compared with the tab shown), not wherever its key's word stands: a D3
// drawing's text-anchor "middle" keeps no tab named middle.
{
  const sheets = (script) => `<main>
  <section class="doc-sheet-shell" id="views" data-doc-sheets="views">
    <div class="doc-sheet-tabs"><button class="doc-sheet-tab" type="button" data-sheet-tab="start">开始</button><button class="doc-sheet-tab" type="button" data-sheet-tab="middle">中间</button></div>
    <div data-doc-sheet="start"><p>a</p></div>
    <div data-doc-sheet="middle"><p>b</p></div>
  </section>
</main>
<script>${script}</script>
`;
  const keptTabs = (script) => findUnits(sheets(script)).units.filter((unit) => unit.key && unit.keep).map((unit) => unit.key);
  assert.deepEqual(keptTabs('d3.select("#c").append("text").attr("text-anchor", "middle").text("start");'), [], "a drawing's words are no tab's");
  assert.deepEqual(keptTabs('const area = DocSheets.get("#views"); d3.select("#c").attr("text-anchor", "middle"); if (area) area.set("start");'), ["start"], "one set by the Sheet API, not the drawing's word beside it");
  assert.deepEqual(keptTabs('const area = DocSheets.get("#views"); if (area?.get() === "middle") draw();'), ["middle"], "one compared with the tab shown");
  assert.deepEqual(keptTabs('DocState.create({ id: "sheets-views", version: 1, defaults: { sheet: "middle" } });'), ["middle"], "the state's default tab");
  assert.deepEqual(keptTabs('document.querySelector(\'[data-active-sheet="start"]\');'), ["start"], "the area's mark");
  for (const [key, code, read] of [
    ["middle", 'switch (DocSheets.get("#v").get()) { case "middle": break; }', true],
    ["middle", 'DocState.create({ id: "sheets-v", version: 1, defaults: { sheet: "start" } }).set("sheet", "middle");', true],
    ["middle", 'DocSheets.get("#v"); label.attr("text-anchor", "middle");', false],
    ["mid.dle", 'DocSheets.get("#v").set("midXdle");', false],
  ]) assert.equal(sheetKeyRead(key, code), read, code);
}

// Only the kit's containers, and plain (class-less) divs, lists and quotes in a flow, hold blocks
// of their own: an element with a class of its own is a report widget, one block whose inside
// stays as the report made it (its text stays editable). The same flows the kit styles.
{
  const widgets = `<main>
  <section class="doc-section"><h2>标题</h2>
    <div class="kpi-row">
      <div class="kpi-card"><p>指标甲</p></div>
      <div class="kpi-card"><p>指标乙</p></div>
    </div>
    <div>
      <p>分组里的段落</p>
      <div><p>再套一层</p></div>
    </div>
    <ul class="steps"><li>步骤</li></ul>
    <p>正文</p>
  </section>
</main>
`;
  const { units, boxes } = findUnits(widgets);
  assert.deepEqual(units.map((unit) => `${unit.kind}${unit.tag === "div" ? "" : ":" + unit.tag}`), ["section:section", "heading:h2", "block", "block", "paragraph:p", "block", "list:ul", "paragraph:p"]);
  assert.deepEqual(boxes.map((box) => box.kind), ["main", "section", "plain"], "the widget, the inner div and the classed list are no boxes");
  assert.ok(findBlocks(widgets).some((block) => block.tag === "p" && widgets.slice(block.innerStart, block.innerEnd) === "指标甲"), "the widget's text stays editable");
  const into = applyEdits({ current: widgets, edits: [], units: [{ id: units.findIndex((unit) => widgets.slice(unit.start, unit.end) === "<p>正文</p>"), move: { into: 3 } }] });
  assert.equal(into.ok, false, "nothing goes into a widget (it has no box)");
}

// Text of the report's own elements (a footer, the labels in a widget) is editable too: an element
// with text and nothing but inline markup; inline ones take plain text, and none goes with its
// text, only with its block. Not inside the kit's components, not a link, not an element a script
// may hook into, not the rest of a paragraph that stays read-only. Every block shows one frame:
// text of its own, a component around the whole (its text none). A footer is a block like any
// other: it moves and goes as blocks do, and blocks may follow it.
{
  const own = `<main>
  <section class="doc-section"><h2>标题</h2>
    <div class="swatches">
      <div class="swatch"><span class="chip"></span><span class="label"><strong>系列一</strong><span>浅 #3C9BC9</span></span></div>
      <div class="note">说明 <code>a.ts</code> 与 <a href="#x">链接</a></div>
      <span id="live">0</span><a class="more" href="#x">更多</a>
    </div>
    <div class="doc-code"><div class="doc-code-title">src/a.ts</div><pre><code>x</code></pre></div>
    <p>含 <button type="button">按钮</button> 和 <small>小字</small></p>
    <blockquote>直接写在引用里的话</blockquote>
    <div class="doc-columns"><div class="doc-column"><figure class="doc-card"><h3>卡片</h3></figure></div><div class="doc-column"><p>旁边</p></div></div>
  </section>
  <footer class="page-footer">编辑源位于 <code>reports/</code>。</footer>
</main>
`;
  const blocks = findBlocks(own);
  const inner = (block) => own.slice(block.innerStart, block.innerEnd);
  assert.deepEqual(blocks.filter((block) => block.kind === "text").map((block) => `${block.tag} ${Object.keys(block.caps)} ${inner(block)}`), [
    "strong plain,empty 系列一", "span plain,empty 浅 #3C9BC9", 'div empty,links 说明 <code>a.ts</code> 与 <a href="#x">链接</a>',
    "blockquote empty,links 直接写在引用里的话", "footer empty,links 编辑源位于 <code>reports/</code>。",
  ]);
  const byText = (text) => blocks.find((block) => inner(block) === text || inner(block).startsWith(text));
  const page = openPage(own);
  page.block(byText("编辑源位于").id).innerHTML = "编辑源位于 <code>reports/demo/</code>。";
  page.block(byText("系列一").id).textContent = "系列 1";
  const saved = saveAll(page, own);
  assert.equal(saved.text, own.replace("<code>reports/</code>", "<code>reports/demo/</code>").replace("系列一", "系列 1"), "only the changed text is written");
  const refused = (edit) => applyEdits({ current: own, edits: [edit] }).conflicts?.[0]?.reason;
  assert.equal(refused({ id: byText("编辑源位于").id, parts: [] }), "fixed", "the footer goes with its block, not with its text");
  assert.equal(refused({ id: byText("系列一").id, parts: [{ keep: true, html: "<em>系列</em>" }] }), "invalid", "a label takes plain text");
  assert.equal(applyEdits({ current: own, edits: [{ id: byText("系列一").id, parts: [{ keep: true, html: "" }] }] }).ok, true, "text may be cleared");

  // Frames: the widget, the code card, the read-only paragraph, the quote... one each; the text in
  // the widget and the card leaves it to them.
  const framed = openPage(own);
  const hosts = [...framed.document.querySelectorAll('[contenteditable="true"]')];
  markFrames(framed.document, framed.layout, hosts);
  const { units } = findUnits(own);
  const frames = units.filter((unit) => framed.unit(unit.id).hasAttribute("data-ge-frame")).map((unit) => unit.kind);
  assert.deepEqual(frames, ["block", "code", "paragraph", "figure"], "components (and text that stays read-only) carry a frame; text blocks, sections and rows of columns none");
  assert.deepEqual(hosts.filter((host) => host.hasAttribute("data-ge-framed")).map((host) => host.textContent), ["系列一", "浅 #3C9BC9", "说明 a.ts 与 链接", "src/a.ts", "x", "卡片"], "a code block's title and code too");
  assert.equal(frameOf(framed.block(byText("系列一").id)), framed.unit(units.find((unit) => unit.kind === "block").id));
  assert.ok(framed.unit(units.find((unit) => unit.kind === "block").id).hasAttribute("data-ge-round"), "a widget with square corners gets rounded ones while edited");

  // The footer: a block of the document like any other.
  const footer = units.find((unit) => unit.tag === "footer");
  const section = units.find((unit) => unit.kind === "section");
  assert.equal(footer.box, section.box, "the footer is a block of the document");
  const ops = (op) => applyEdits({ current: own, edits: [], units: [op] });
  assert.ok(ops({ id: footer.id, move: { before: section.id } }).ok, "it moves");
  assert.ok(ops({ id: section.id, move: { after: footer.id } }).ok, "and blocks may follow it");
  assert.equal(ops({ id: footer.id, remove: true }).text, own.replace(/  <footer[^\n]*\n/, ""));
}

// A link to a detail card in the text (the kit opens the dialog it points to) is text like any
// link: the paragraph stays editable, and the link keeps its class and target.
{
  const doc = `<main>
  <section class="doc-section"><h2>标题</h2>
    <p>数据集 <a class="doc-dialog-trigger" href="#detail">Atlas-Bench</a> 的说明</p>
  </section>
  <dialog class="doc-dialog" id="detail"><div class="doc-dialog-content"><p>详情</p></div></dialog>
</main>
`;
  const paragraph = findBlocks(doc).find((block) => doc.slice(block.innerStart, block.innerEnd).startsWith("数据集"));
  assert.equal(paragraph?.kind, "flow", "the paragraph holding the trigger is ordinary text");
  const page = openPage(doc);
  page.block(paragraph.id).querySelector("a").textContent = "Atlas-Bench v2";
  textNode(page.block(paragraph.id), "的说明").data = " 的完整说明";
  assert.equal(saveAll(page, doc).text, doc.replace(">Atlas-Bench</a> 的说明", ">Atlas-Bench v2</a> 的完整说明"));
}

// Deleting blocks: a block takes the comment right above it along, a container left empty goes
// too, and the text blocks inside a deleted block are no edits of their own.
{
  const page = openPage(SRC);
  removeUnit(page.unit(9));
  removeUnit(page.unit(10));
  assert.deepEqual(changes(page), { edits: [], units: [{ id: 9, remove: true }, { id: 10, remove: true }] });
  const result = saveAll(page, SRC);
  assert.ok(result.ok, JSON.stringify(result.conflicts));
  assert.deepEqual(changedLines(SRC, result.text).removed, [
    "      <!-- AI 写的注释：必须原样保留 -->",
    String.raw`      <p>行内公式嵌入句子，例如 <span class="doc-math-inline">\(\Delta = S_e - S_b\)</span>，不会打断正文阅读。</p>`,
    "      <blockquote><p>引用块用于保留来源原话或定义。</p></blockquote>",
  ]);
  assert.equal(result.text.split("\n").length, SRC.split("\n").length - 3);

  const list = openPage(SRC);
  assert.equal(removalTarget(list.unit(14)), list.unit(13), "a list goes with its only item");
  assert.equal(removalTarget(list.unit(5)), list.unit(5), "an item with a sibling goes alone");
  assert.equal(removalTarget(list.unit(11)), list.unit(10), "a quote goes with its only paragraph");
  assert.equal(unitElement(list.block(10)), list.unit(14));

  const section = openPage(SRC);
  textNode(section.block(6), "不会打断").data = "改过的字";
  section.block(5).textContent = ""; // a bound heading emptied, then its whole section deleted
  removeUnit(section.unit(6));
  assert.deepEqual(changes(section), { edits: [], units: [{ id: 6, remove: true }] });
  const start = SRC.indexOf('\n\n  <section class="doc-section"') + 1;
  assert.equal(saveAll(section, SRC).text, SRC.slice(0, start) + SRC.slice(SRC.indexOf("</main>")), "the section, and the blank line above it");

  // The opening summary is a block too.
  const summary = openPage(SRC);
  removeUnit(summary.unit(0));
  assert.deepEqual(changes(summary), { edits: [], units: [{ id: 0, remove: true }] });
  const from = SRC.indexOf('  <section class="doc-summary');
  assert.equal(saveAll(summary, SRC).text, SRC.slice(0, from) + SRC.slice(SRC.indexOf('  <section class="doc-section"')), "with the blank line after it");
}

// Spacing: deleted blocks take one neighbouring blank line along; blocks deleted next to each
// other go as one run. CRLF files stay CRLF.
{
  const three = ["一", "二", "三"].map((name) => `  <section class="doc-section"><h2>${name}</h2>\n    <p>${name}的正文</p>\n  </section>`);
  const source = `<main>\n${three.join("\n\n")}\n</main>\n`;
  const [a, b, c] = findUnits(source).units.filter((unit) => unit.kind === "section").map((unit) => unit.id);
  const drop = (text, ...ids) => applyEdits({ current: text, edits: [], units: ids.map((id) => ({ id, remove: true })) }).text;
  assert.equal(drop(source, b), `<main>\n${three[0]}\n\n${three[2]}\n</main>\n`);
  assert.equal(drop(source, c), `<main>\n${three[0]}\n\n${three[1]}\n</main>\n`);
  assert.equal(drop(source, a), `<main>\n${three[1]}\n\n${three[2]}\n</main>\n`);
  assert.equal(drop(source, b, c), `<main>\n${three[0]}\n</main>\n`);
  assert.equal(drop(source, a, b), `<main>\n${three[2]}\n</main>\n`);
  const crlf = source.replace(/\n/g, "\r\n");
  assert.equal(drop(crlf, b), `<main>\n${three[0]}\n\n${three[2]}\n</main>\n`.replace(/\n/g, "\r\n"));
}

// Sheet tabs are blocks of their own: a tab goes with its panel, never the last one.
{
  const sheets = `<main>
  <section class="doc-sheet-shell" data-doc-sheets aria-label="分区">
    <div class="doc-sheet-tabs" role="tablist">
      <button class="doc-sheet-tab" type="button" data-sheet-tab="a">甲</button>
      <button class="doc-sheet-tab" type="button" data-sheet-tab="b">乙</button>
    </div>
    <div data-doc-sheet="a">
      <section class="doc-section"><h2>甲</h2>
        <p>甲的正文</p>
      </section>
    </div>
    <div data-doc-sheet="b">
      <section class="doc-section"><h2>乙</h2>
        <p>乙的正文</p>
      </section>
    </div>
  </section>
</main>
<script>DocSheets.mount("[data-doc-sheets]", { state, key: "sheet" });</script>
`;
  const { units, boxes } = findUnits(sheets);
  assert.deepEqual(units.map((unit) => unit.kind), ["sheets", "tab", "tab", "section", "heading", "paragraph", "section", "heading", "paragraph"]);
  assert.deepEqual([units[0].keep?.reason, units[1].keep, units[2].keep], ["script", null, null], "the shell is mounted by the script; its tabs are free");
  assert.ok(boxes.some((box) => box.kind === "tabs" && box.pure));
  const drop = (...ids) => applyEdits({ current: sheets, edits: [], units: ids.map((id) => ({ id, remove: true })) });
  const withoutB = sheets
    .replace('      <button class="doc-sheet-tab" type="button" data-sheet-tab="b">乙</button>\n', "")
    .replace(/ {4}<div data-doc-sheet="b">[\s\S]*?\n {4}<\/div>\n/, "");
  assert.equal(drop(2).text, withoutB);
  assert.deepEqual(drop(1, 2).conflicts.map((entry) => [entry.unit, entry.reason]), [[1, "last"], [2, "last"]]);

  const page = openPage(sheets);
  const tab = page.unit(2);
  assert.deepEqual(partsOf(tab), [tab, page.document.querySelector('[data-doc-sheet="b"]')]);
  removeUnit(tab);
  assert.equal(page.document.querySelector('[data-doc-sheet="b"]'), null);
  assert.deepEqual(changes(page), { edits: [], units: [{ id: 2, remove: true }] }, "the tab's name and its panel's text went with it");
  assert.equal(saveAll(page, sheets).text, withoutB);
  const swapped = openPage(sheets);
  placeBefore(swapped.unit(1).parentNode, [swapped.unit(2)], swapped.unit(1));
  const tabA = '      <button class="doc-sheet-tab" type="button" data-sheet-tab="a">甲</button>\n';
  const tabB = '      <button class="doc-sheet-tab" type="button" data-sheet-tab="b">乙</button>\n';
  assert.equal(saveAll(swapped, sheets).text, sheets.replace(tabA + tabB, tabB + tabA), "tabs trade places; their panels stay");

  // A tab made on the page (+): the tab after the one it follows, its panel after that one's,
  // empty or holding blocks; its key new in the area. An empty panel is a box blocks go into.
  const add = (tab, place) => applyEdits({ current: sheets, edits: [], units: [{ id: "n0", insert: { type: "tab", key: "n0", ...tab }, place }] });
  const tabC = '      <button class="doc-sheet-tab" type="button" data-sheet-tab="c">丙</button>\n';
  const withC = sheets.replace(tabB, tabB + tabC).replace(/( {4}<div data-doc-sheet="b">[\s\S]*?\n {4}<\/div>\n)/, '$1    <div data-doc-sheet="c">\n    </div>\n');
  assert.equal(add({ title: "丙", sheet: "c", children: [] }, { after: 2 }).text, withC);
  assert.equal(add({ title: "丙", sheet: "c", children: [] }, { before: 1 }).text,
    sheets.replace(tabA, tabC + tabA).replace('    <div data-doc-sheet="a">', '    <div data-doc-sheet="c">\n    </div>\n    <div data-doc-sheet="a">'), "before the first tab, its panel before the first panel");
  assert.equal(add({ title: "丙", sheet: "c", children: [{ type: "paragraph", html: "丙的正文" }] }, { after: 2 }).text,
    withC.replace('<div data-doc-sheet="c">\n    </div>', '<div data-doc-sheet="c">\n      <p>丙的正文</p>\n    </div>'), "with its blocks, one step in");
  assert.deepEqual([add({ title: "丙", sheet: "a", children: [] }, { after: 2 }), add({ title: "<b>丙</b>", sheet: "c", children: [] }, { after: 2 }), add({ title: "丙", sheet: "c", children: [] }, { after: 3 })]
    .map((result) => result.conflicts.map((entry) => entry.reason)), [["invalid"], ["invalid"], ["position"]], "a key the area has, a name with markup, a place outside the tab row");
  const empty = findUnits(withC);
  const panelC = empty.boxes.find((box) => box.kind === "panel" && box.key === "c");
  assert.ok(panelC?.pure, "the empty panel is a box");
  assert.equal(applyEdits({ current: withC, edits: [], units: [{ id: "n0", insert: { type: "paragraph", html: "后来写的" }, place: { into: panelC.id } }] }).text,
    withC.replace('<div data-doc-sheet="c">\n    </div>', '<div data-doc-sheet="c">\n      <p>后来写的</p>\n    </div>'));
  // Deleted and put back (undo): the tab with its panel, from the source the deletion gave.
  const deleted = commitEdits({ current: withC, opening: withC, units: [{ key: "u0", unit: { key: 3, open: 3, hash: unitHash(withC, findUnits(withC).units[3]) }, remove: true }] });
  assert.equal(deleted.text, sheets);
  assert.equal(deleted.removed.u0.source, '<button class="doc-sheet-tab" type="button" data-sheet-tab="c">丙</button>\n<div data-doc-sheet="c">\n</div>');
  const back = applyEdits({ current: sheets, edits: [], units: [{ id: "n0", insert: { restore: deleted.removed.u0.source }, place: { after: 2 } }] });
  assert.equal(back.text, withC);
}

// Sizes (a card's or table's width share and height) are custom properties in the unit's style
// attribute: only the declarations named change, every other byte of the attribute stays, and the
// attribute comes and goes with them. A centered card is a class switch. Values outside what the
// kind takes are refused; sizes travel with a moved block.
{
  assert.deepEqual([
    sizeValue("figure", "--doc-span", ".5"), sizeValue("figure", "--doc-span", "0.62345"), sizeValue("figure", "--doc-span", "1.2"),
    sizeValue("table", "--doc-span", "1.4"), sizeValue("figure", "--doc-chart-height", "420"), sizeValue("table", "--doc-table-height", "none"),
    sizeValue("figure", "--doc-table-height", "300px"), sizeValue("section", "--doc-span", "1"),
  ], ["0.5", "0.623", null, "1.4", null, "none", null, null]);
  const source = `<main>
  <section class="doc-section"><h2>图表</h2>
    <div class="doc-columns">
      <div class="doc-column"><figure class="doc-figure" data-surface="bounded"><h3>甲</h3><div id="a"></div></figure></div>
      <div class="doc-column"><figure class="doc-figure" style="color: red; --doc-span: .5; background: url(&quot;x;y&quot;)"><h3>乙</h3></figure></div>
    </div>
    <div class="doc-table-wrap"><table class="doc-table"><tr><td>1</td></tr></table></div>
    <p>正文</p>
  </section>
</main>
`;
  const { units } = findUnits(source);
  const [a, b] = units.filter((unit) => unit.kind === "figure").map((unit) => unit.id);
  const table = units.find((unit) => unit.kind === "table").id;
  const save = (ops) => applyEdits({ current: source, edits: [], units: ops });
  assert.equal(save([{ id: a, size: "--doc-span", value: "0.333" }, { id: a, size: "--doc-chart-height", value: "420px" }]).text,
    source.replace('data-surface="bounded"><h3>甲', 'data-surface="bounded" style="--doc-span: 0.333; --doc-chart-height: 420px"><h3>甲'), "a new style attribute");
  assert.equal(save([{ id: b, size: "--doc-span", value: "1" }]).text, source.replace("--doc-span: .5", "--doc-span: 1"), "the other declarations stay, entities and all");
  assert.equal(save([{ id: b, size: "--doc-span", value: null }]).text, source.replace("--doc-span: .5; ", ""));
  const bare = source.replace(' style="color: red; --doc-span: .5; background: url(&quot;x;y&quot;)"', ' style="--doc-span: .5"');
  assert.equal(applyEdits({ current: bare, edits: [], units: [{ id: b, size: "--doc-span", value: null }] }).text, bare.replace(' style="--doc-span: .5"', ""), "an emptied attribute goes");
  assert.equal(save([{ id: table, size: "--doc-span", value: "1.4" }, { id: table, size: "--doc-table-height", value: "none" }]).text,
    source.replace('<div class="doc-table-wrap">', '<div class="doc-table-wrap" style="--doc-span: 1.4; --doc-table-height: none">'), "a table may go past the reading width");
  const refused = (op) => save([op]).conflicts.map((entry) => entry.reason);
  assert.deepEqual(refused({ id: a, size: "--doc-span", value: "2" }), ["invalid"], "a card at most spans the width it stands in");
  assert.deepEqual(refused({ id: a, size: "--doc-table-height", value: "300px" }), ["invalid"], "not a card's size");
  assert.deepEqual(refused({ id: a, size: "color", value: "red" }), ["invalid"]);
  assert.equal(save([{ id: a, toggle: "doc-figure--compact", on: true }]).text, source.replace('<figure class="doc-figure" data-surface', '<figure class="doc-figure doc-figure--compact" data-surface'), "a centered card");
  // 显示边框 off: the class is a switch of a card's (TOGGLES), written and taken away again, and no other block's.
  const plain = save([{ id: a, toggle: "doc-figure--plain", on: true }]).text;
  assert.equal(plain, source.replace('<figure class="doc-figure" data-surface', '<figure class="doc-figure doc-figure--plain" data-surface'), "a card with no frame");
  assert.equal(applyEdits({ current: plain, edits: [], units: [{ id: a, toggle: "doc-figure--plain", on: false }] }).text, source, "the frame back");
  assert.deepEqual(refused({ id: table, toggle: "doc-figure--plain", on: true }), ["unknown"], "not a table's switch");

  // On the page: sizes as the reader left them.
  const page = openPage(source);
  page.unit(a).style.setProperty("--doc-span", "0.4");
  page.unit(b).style.removeProperty("--doc-span");
  page.unit(table).style.setProperty("--doc-table-height", "240px");
  assert.deepEqual(changes(page).units, [
    { id: a, size: "--doc-span", value: "0.4" }, { id: b, size: "--doc-span", value: null }, { id: table, size: "--doc-table-height", value: "240px" },
  ]);
  const saved = saveAll(page, source).text;
  assert.ok(saved.includes('bounded" style="--doc-span: 0.4"><h3>甲') && saved.includes('style="color: red; background: url(&quot;x;y&quot;)"') && saved.includes('doc-table-wrap" style="--doc-table-height: 240px"'));

  // A resized card moved out of its column takes its size along.
  const moved = openPage(source);
  moved.unit(a).style.setProperty("--doc-span", "1");
  moved.unit(a).parentElement.parentElement.after(moved.unit(a));
  const text = saveAll(moved, source).text;
  assert.ok(/<\/div>\n    <figure class="doc-figure" data-surface="bounded" style="--doc-span: 1"><h3>甲/.test(text), text);
}

// Taking an attribute out of a start tag (a class switched off, a size, an attribute set to none, an
// id) takes the whitespace before it, all of it, so that a tag broken over lines keeps no line of
// blanks; the same everywhere an attribute goes.
{
  const tag = (attributes) => `<main>\n  <section class="doc-section">\n    <figure\n      ${attributes.join("\n      ")}><h3>甲</h3></figure>\n    <div class="doc-code"\n         data-language="js"\n         data-block-id="cb000001"><div class="doc-code-title"></div><pre><code>x</code></pre></div>\n  </section>\n</main>\n`;
  const source = tag(['class="doc-figure--compact"', 'data-surface="bounded"', 'style="--doc-span: .5"']);
  const { units } = findUnits(source);
  const figure = units.find((unit) => unit.kind === "figure").id;
  const code = units.find((unit) => unit.kind === "code").id;
  const apply = (...ops) => applyEdits({ current: source, edits: [], units: ops }).text;
  assert.equal(apply({ id: figure, toggle: "doc-figure--compact", on: false }), tag(['data-surface="bounded"', 'style="--doc-span: .5"']), "the last class goes");
  assert.equal(apply({ id: figure, size: "--doc-span", value: null }), tag(['class="doc-figure--compact"', 'data-surface="bounded"']), "the emptied style goes");
  assert.equal(apply({ id: code, attribute: "data-language", value: null }), source.replace('\n         data-language="js"', ""), "an attribute set to none goes");
  assert.equal(copiedSource(source, units.find((unit) => unit.kind === "code")), '<div class="doc-code"\n     data-language="js"><div class="doc-code-title"></div><pre><code>x</code></pre></div>', "an id goes with its blanks");
}

// Moving blocks within their container: the page order becomes moves next to blocks that kept
// their place; a moved block takes its comment, lead and every edit inside it along, and the
// spacing of the container is kept.
{
  const three = ["一", "二", "三"].map((name) => `  <section class="doc-section"><h2>${name}</h2>\n    <p>${name}的正文</p>\n  </section>`);
  const source = `<main>\n${three.join("\n\n")}\n</main>\n`;
  const joined = (order) => `<main>\n${order.map((index) => three[index]).join("\n\n")}\n</main>\n`;
  const reorder = (text, order) => {
    const page = openPage(text);
    const sections = [...page.document.querySelectorAll("main > section")];
    placeBefore(page.document.querySelector("main"), order.map((index) => sections[index]), null);
    return page;
  };
  const [a, , c] = findUnits(source).units.filter((unit) => unit.kind === "section").map((unit) => unit.id);
  const last = reorder(source, [2, 0, 1]);
  assert.deepEqual(changes(last).units, [{ id: c, move: { before: a } }], "one block moved, the rest kept their order");
  assert.equal(saveAll(last, source).text, joined([2, 0, 1]));
  const first = reorder(source, [1, 2, 0]);
  assert.deepEqual(changes(first).units, [{ id: a, move: { after: c } }]);
  assert.equal(saveAll(first, source).text, joined([1, 2, 0]));
  for (const order of [[0, 2, 1], [1, 0, 2], [2, 1, 0]]) assert.equal(saveAll(reorder(source, order), source).text, joined(order), `order ${order}`);
  const crlf = source.replace(/\n/g, "\r\n");
  assert.equal(saveAll(reorder(crlf, [2, 0, 1]), crlf).text, joined([2, 0, 1]).replace(/\n/g, "\r\n"));

  // Edits inside a moved block go along: text, a deleted paragraph, a block moved inside it.
  const nested = source.replace("<p>一的正文</p>", "<p>一的正文</p>\n    <p>一的第二段</p>\n    <p>一的第三段</p>");
  const page = reorder(nested, [1, 0, 2]);
  const inner = page.document.querySelector("main > section:nth-child(2)"); // section 一, now second
  const [, second, third] = inner.querySelectorAll("p");
  textNode(inner.querySelector("p"), "一的正文").data = "一的正文（改）";
  removeUnit(second);
  placeBefore(inner, [third], inner.querySelector("p"));
  const moved = saveAll(page, nested);
  assert.ok(moved.ok, JSON.stringify(moved.conflicts));
  assert.equal(moved.text, `<main>\n${three[1]}\n\n  <section class="doc-section"><h2>一</h2>\n    <p>一的第三段</p>\n    <p>一的正文（改）</p>\n  </section>\n\n${three[2]}\n</main>\n`);

  // A place that is the block itself, or none, is refused.
  assert.deepEqual(applyEdits({ current: source, edits: [], units: [{ id: c, move: { before: c } }, { id: a, move: { after: 99 } }] }).conflicts.map((entry) => entry.reason), ["position", "position"]);
  // A unit whose move is refused stays where it is, and so does the list it is in, which goes only
  // with every unit leaving it: once the list went with its only item, whose move had been refused.
  const lone = "<main>\n  <p>前</p>\n  <ul>\n    <li>乙</li>\n  </ul>\n  <p>后</p>\n</main>\n";
  const [before, , loneItem] = findUnits(lone).units.map((unit) => unit.id);
  const stayed = applyEdits({ current: lone, edits: [], partial: true, units: [{ id: loneItem, move: { after: before } }] }); // no item stands in the page
  assert.deepEqual(stayed.conflicts.map((entry) => entry.reason), ["position"]);
  assert.equal(stayed.text, lone, "the list and its item where they were");

  // Blocks on one line; a paragraph moved above one with a comment (the comment stays with its paragraph).
  const inline = "<main>\n  <ul><li>一</li><li>二</li><li>三</li></ul>\n</main>\n";
  const list = openPage(inline);
  const items = [...list.document.querySelectorAll("li")];
  placeBefore(items[0].parentNode, [items[2]], items[0]);
  assert.equal(saveAll(list, inline).text, "<main>\n  <ul><li>三</li><li>一</li><li>二</li></ul>\n</main>\n");
  const prose = openPage(SRC);
  placeBefore(prose.unit(9).parentNode, [prose.unit(15)], withLeads(prose.unit(9))[0]);
  assert.deepEqual(changes(prose).units, [{ id: 15, move: { before: 9 } }]);
  const text = saveAll(prose, SRC).text;
  assert.ok(text.includes('    <div>\n      <p>含有 <span class="unknown">未知元素</span> 的段落</p>\n      <!-- AI 写的注释：必须原样保留 -->\n      <p>行内公式'));
  assert.ok(text.includes("      </ul>\n    </div>"), "its old line is gone");
}

// Moving blocks anywhere they may go: into another section, into or out of a plain grouping div (taking
// the indentation of the new place, <pre> content untouched), a card out of its column (the column
// it leaves empty goes, and the row left with one column gives its blocks back), into a box where
// no original block stayed; never where the box does not take the block.
{
  const doc = `<main>
  <header class="doc-header"><h1 class="doc-title">T</h1></header>
  <section class="doc-summary"><p>概括</p></section>
  <section class="doc-section"><h2>一</h2>
    <p>一甲</p>
    <div>
      <p>一乙</p>
      <div class="doc-code"><div class="doc-code-title"></div><pre><code>a
  b</code></pre></div>
    </div>
    <div class="doc-columns">
      <div class="doc-column">
        <figure class="doc-figure"><h3>卡一</h3></figure>
      </div>
      <div class="doc-column">
        <p>旁注</p>
      </div>
    </div>
  </section>
  <section class="doc-section"><h2>二</h2>
    <p>二甲</p>
    <ul>
      <li>项</li>
    </ul>
  </section>
</main>
`;
  const { units } = findUnits(doc);
  const id = (text, kind) => units.findIndex((unit) => unit.kind === kind && doc.slice(unit.start, unit.end).includes(text));
  const at = (page, text, kind) => page.unit(id(text, kind));
  // What the page does on a drop: place the block, drop a container it left empty, and keep rows
  // of columns tidy (history.mjs).
  const drop = (page, node, container, reference = null) => {
    const leftover = removalTarget(node);
    const rows = rowsAround([node.parentElement, container]);
    placeBefore(container, withLeads(node), reference);
    if (leftover !== node && !leftover.contains(container)) leftover.remove();
    settleRows(rows);
  };
  const [first, second] = [id("一甲", "section"), id("二甲", "section")];

  const across = openPage(doc);
  drop(across, at(across, "一甲", "paragraph"), across.unit(second), at(across, "二甲", "paragraph").nextSibling);
  assert.equal(saveAll(across, doc).text, doc.replace("    <p>一甲</p>\n", "").replace("    <p>二甲</p>\n", "    <p>二甲</p>\n    <p>一甲</p>\n"));

  const deeper = openPage(doc);
  drop(deeper, at(deeper, "二甲", "paragraph"), at(deeper, "一乙", "block"), at(deeper, "一乙", "paragraph").nextSibling);
  assert.equal(saveAll(deeper, doc).text, doc.replace("    <p>二甲</p>\n", "").replace("      <p>一乙</p>\n", "      <p>一乙</p>\n      <p>二甲</p>\n"));

  const code = openPage(doc);
  drop(code, at(code, "a\n  b", "code"), code.unit(second), at(code, "二甲", "paragraph").nextSibling);
  const withCode = saveAll(code, doc).text;
  assert.ok(withCode.includes('    <p>二甲</p>\n    <div class="doc-code"><div class="doc-code-title"></div><pre><code>a\n  b</code></pre></div>\n    <ul>'), "the code's own lines stay as they were");

  const card = openPage(doc);
  const figure = at(card, "卡一", "figure");
  textNode(figure.querySelector("h3"), "卡一").data = "卡一（改）";
  drop(card, figure, card.unit(second), at(card, "二甲", "paragraph").nextSibling);
  assert.equal(card.document.querySelector(".doc-columns"), null, "the column it left empty goes, and the row of one column");
  const moved = saveAll(card, doc);
  assert.ok(moved.ok, JSON.stringify(moved.conflicts));
  assert.equal(moved.text, doc
    .replace('    <div class="doc-columns">\n      <div class="doc-column">\n        <figure class="doc-figure"><h3>卡一</h3></figure>\n      </div>\n      <div class="doc-column">\n        <p>旁注</p>\n      </div>\n    </div>\n', "    <p>旁注</p>\n")
    .replace("    <p>二甲</p>\n", '    <p>二甲</p>\n    <figure class="doc-figure"><h3>卡一（改）</h3></figure>\n'), "and the card keeps its edit; the other column's blocks stand where the row stood");

  const swap = openPage(doc);
  const list = at(swap, "项", "list");
  drop(swap, at(swap, "一甲", "paragraph"), swap.unit(second), null);
  drop(swap, at(swap, "二甲", "paragraph"), swap.unit(first), null);
  drop(swap, list, swap.unit(first), null);
  const titleTwo = findUnits(doc).units.findIndex((unit) => doc.slice(unit.start, unit.end) === "<h2>二</h2>");
  assert.ok(changes(swap).units.some((entry) => entry.move?.after === titleTwo), "the second section's title stayed (a block like any other): after it");
  assert.equal(saveAll(swap, doc).text, doc
    .replace("    <p>一甲</p>\n", "")
    .replace("    </div>\n  </section>", "    </div>\n    <p>二甲</p>\n    <ul>\n      <li>项</li>\n    </ul>\n  </section>")
    .replace("    <p>二甲</p>\n    <ul>\n      <li>项</li>\n    </ul>\n  </section>\n</main>", "    <p>一甲</p>\n  </section>\n</main>"));

  // The box must take the block, never inside the block itself. The opening summary is a highlight
  // panel like any other: blocks may go ahead of it and into it.
  const refuse = (op) => (applyEdits({ current: doc, edits: [], units: [op] }).conflicts ?? []).map((entry) => entry.reason);
  const box = (text) => findUnits(doc).boxes.findIndex((entry) => doc.slice(entry.at).startsWith(text));
  assert.deepEqual(refuse({ id: id("项", "item"), move: { after: id("二甲", "paragraph") } }), ["position"], "a list item stays in lists");
  assert.deepEqual(refuse({ id: first, move: { after: id("二甲", "paragraph") } }), ["position"], "a section is no block of a flow");
  assert.deepEqual(refuse({ id: second, move: { before: id("概括", "highlight") } }), [], "a section may go ahead of the summary");
  assert.deepEqual(refuse({ id: id("二甲", "paragraph"), move: { into: box('>\n      <div class="doc-column">') } }), ["position"], "a row of columns takes its columns only");
  assert.deepEqual(refuse({ id: id("二甲", "paragraph"), move: { into: box('>\n        <figure') } }), [], "a column takes a paragraph");
  assert.deepEqual(refuse({ id: id("旁注", "column"), move: { after: id("二甲", "paragraph") } }), ["position"], "a column stays in its row");
  assert.deepEqual(refuse({ id: id("卡一", "figure"), move: { after: id("概括", "paragraph") } }), [], "and a card into it");
  assert.deepEqual(refuse({ id: id("一乙", "block"), move: { into: box('>\n      <p>一乙') } }), ["position"], "not into itself");
  assert.deepEqual(refuse({ id: second, move: { before: first } }), [], "sections trade places");

  // The report's header: the lines under its title are blocks (small text, a plain paragraph) that go
  // like any other and take only paragraphs; the title is none (it is the report's name).
  const headed = doc.replace('<h1 class="doc-title">T</h1></header>', '<h1 class="doc-title">T</h1>\n    <p class="doc-note">来源：某数据集</p>\n  </header>');
  const headedUnits = findUnits(headed);
  const line = headedUnits.units.find((unit) => headed.slice(unit.start, unit.end).includes("来源"));
  assert.ok(line.kind === "paragraph" && headedUnits.boxes[line.box].kind === "header", "the header's line is a block of the header");
  assert.ok(!headedUnits.units.some((unit) => unit.tag === "h1"), "the title is no block");
  assert.equal(applyEdits({ current: headed, edits: [], units: [{ id: line.id, remove: true }] }).text, headed.replace('\n    <p class="doc-note">来源：某数据集</p>', ""), "the line can go");
  const intoHeader = (unit) => (applyEdits({ current: headed, edits: [], units: [{ id: unit, move: { after: line.id } }] }).conflicts ?? []).map((entry) => entry.reason);
  const headedId = (text, kind) => headedUnits.units.findIndex((unit) => unit.kind === kind && headed.slice(unit.start, unit.end).includes(text));
  assert.deepEqual(intoHeader(headedId("二甲", "paragraph")), [], "a paragraph may go there");
  assert.deepEqual(intoHeader(headedId("卡一", "figure")), ["position"], "a card may not");
  const headedPage = openPage(headed);
  assert.ok(headedPage.document.querySelector(".doc-header > p[data-ge-unit]") && !headedPage.document.querySelector(".doc-header > h1[data-ge-unit]"), "on the page the line has a handle, the title none");
}

// A table's scope line (.doc-table-meta right above it) belongs to the table.
{
  const source = `<main>\n  <section class="doc-section">\n    <p>前</p>\n    <div class="doc-table-meta"><span>范围</span><span>单位</span></div>\n    <div class="doc-table-wrap"><table class="doc-table"><tr><td>1</td></tr></table></div>\n    <p>后</p>\n  </section>\n</main>\n`;
  const page = openPage(source);
  const table = page.document.querySelector(".doc-table-wrap");
  assert.equal(unitElement(page.document.querySelector(".doc-table-meta span")), table);
  assert.deepEqual(withLeads(table).map((node) => node.className), ["doc-table-meta", "doc-table-wrap"]);
  removeUnit(table);
  assert.deepEqual(changes(page).edits, [], "the scope line's text went with the table");
  assert.equal(saveAll(page, source).text, source.replace(/ {4}<div class="doc-table-meta">.*\n {4}<div class="doc-table-wrap">.*\n/, ""));
}

// A caption made on the page (media/parts.mjs captionNode, data-ge-new) belongs to its figure, saved or
// new, not to the block around the figure (a file pasted there goes right after the figure).
{
  const page = openPage(`<main>\n  <section class="doc-section">\n    <p>前</p>\n  </section>\n</main>\n`);
  const section = page.document.querySelector("section");
  for (const mark of ["data-ge-new", "data-ge-unit"]) {
    const figure = page.document.createElement("figure");
    figure.className = "doc-image";
    figure.setAttribute(mark, mark === "data-ge-unit" ? "99" : "");
    const caption = captionNode(page.document);
    figure.append(caption);
    section.append(figure);
    assert.equal(unitElement(caption), figure, `a new caption in a figure with ${mark}`);
    figure.remove();
  }
}

// New blocks and conversions. A text block turned into another type is written anew in place
// (the comments above it stay, its class goes); a paragraph turned into a list item joins the
// list next to it, an item taken out of a list's middle splits the list; a paragraph becomes a
// disclosure's title, the paragraph of a highlight panel or a code block's code; new blocks of any
// type are written in the kit's plain markup at their neighbour's indentation, next to a block
// that kept its place. The page's DOM changes (convert.mjs) become these operations (collectEdits).
{
  const source = `<main class="doc-page">
  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">一</h2>
    <div>
      <!-- 注释 -->
      <p class="doc-note">第一段</p>
      <p>第二段</p>
      <ul>
        <li>甲</li>
        <li>乙</li>
        <li>丙</li>
      </ul>
      <p>第三段</p>
    </div>
    <figure class="doc-figure" data-surface="bounded"><h3>图</h3></figure>
    <div class="doc-callout"><p>提示</p></div>
    <p id="bound">带 id 的段落</p>
    <div class="doc-code" data-language="js"><div class="doc-code-title">a.js</div><pre><code>if (a &lt; b) {}</code></pre></div>
  </section>

  <section class="doc-section" aria-labelledby="b">
    <h2 id="b">二</h2>
    <p>二的正文</p>
  </section>
  <footer>页脚</footer>
</main>
`;
  const text = (page, words) => [...page.document.querySelectorAll("[contenteditable]")].find((node) => node.textContent.includes(words));
  const saved = (page) => {
    const result = saveAll(page, source);
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    return result.text;
  };

  // In place: the comment stays, the class goes; the reader's text is what is written.
  const heading = openPage(source);
  const first = text(heading, "第一段");
  assert.deepEqual(targetsOf(first), ["paragraph", "note", "heading1", "heading2", "heading3", "heading4", "bullets", "numbers", "todo", "details", "flowchart", "highlight", "callout", "quote", "code", "math"]); // the block menu's grid (the user's order, 2026-10-30)
  const converted = convertBlock(first, "heading1").focus;
  converted.textContent = "第一段（改）";
  assert.deepEqual(changes(heading).units, [{ id: Number(converted.getAttribute("data-ge-unit")), replace: { type: "heading1", html: "第一段（改）" } }]);
  assert.equal(changes(heading).edits.length, 0, "the conversion carries the text");
  assert.equal(saved(heading), source.replace('<p class="doc-note">第一段</p>', "<h1>第一段（改）</h1>"));
  assert.ok(saved(heading).includes("      <!-- 注释 -->\n      <h1>"), "the comment above it stays");

  // A block with attributes of its own changes type too, its attributes going along; a code block keeps its type.
  assert.ok(targetsOf(text(heading, "带 id")).includes("heading2"));
  assert.deepEqual(targetsOf(text(heading, "if (a")), []);
  const { units } = findUnits(source);
  const bound = units.find((unit) => unit.tag === "p" && source.slice(unit.start, unit.end).includes('id="bound"'));
  const refused = (op) => applyEdits({ current: source, edits: [], units: [op] }).conflicts?.map((entry) => entry.reason) ?? [];
  assert.deepEqual(refused({ id: bound.id, replace: { type: "heading2", html: "x" } }), []);
  assert.ok(applyEdits({ current: source, edits: [], units: [{ id: bound.id, replace: { type: "heading2", html: "带 id 的段落" } }] }).text.includes('<h2 id="bound">带 id 的段落</h2>'));
  const second = units.find((unit) => source.slice(unit.start, unit.end) === "<p>第二段</p>");
  assert.deepEqual(refused({ id: second.id, replace: { type: "heading2", html: "<script>x</script>" } }), ["invalid"]);
  assert.deepEqual(refused({ id: second.id, replace: { type: "code", html: "<b>x</b>" } }), ["invalid"], "code is plain text");
  assert.deepEqual(refused({ id: second.id, replace: { type: "item", html: "x" } }), ["position"], "an item needs a list");
  assert.deepEqual(refused({ id: second.id, replace: { type: "section", html: "x" } }), ["invalid"]);

  // A paragraph turned into an item joins the list after it; an item from the middle of a list
  // splits it; lists turn into the other kind of list, or into paragraphs.
  const joined = openPage(source);
  convertBlock(text(joined, "第二段"), "bullets");
  assert.equal(saved(joined), source.replace("      <p>第二段</p>\n      <ul>\n", "      <ul>\n        <li>第二段</li>\n"));
  const split = openPage(source);
  const out = convertBlock(text(split, "乙"), "paragraph");
  assert.equal(out.created.length, 1, "the new list after it");
  assert.equal(saved(split), source.replace("        <li>乙</li>\n        <li>丙</li>\n      </ul>", "      </ul>\n      <p>乙</p>\n      <ul>\n        <li>丙</li>\n      </ul>"));
  const retag = openPage(source);
  convertContainer(retag.document.querySelector("ul"), "numbers");
  assert.equal(saved(retag), source.replace("<ul>", "<ol>").replace("</ul>", "</ol>"));
  // A flowchart (流程图) is no list of items for the editor (components/flowchart/): a list turned into
  // one has each item made a node, its words its title (a paragraph, bold), what it holds its content;
  // turned back, each node is an item again, its title's words its own (the bold that covered them all
  // taken off), its content held. What the kit set on a flowchart (the key of its layout, the name it
  // gave it) is never carried to the list it becomes.
  const nodeLines = (words) => words.map((word) => `        <li>\n          <p><strong>${word}</strong></p>\n        </li>\n`).join("");
  const listLines = "      <ul>\n        <li>甲</li>\n        <li>乙</li>\n        <li>丙</li>\n      </ul>";
  const flowchart = openPage(source);
  const turnedList = flowchart.document.querySelector("ul");
  assert.deepEqual(containerTargets(turnedList), ["bullets", "numbers", "todo", "flowchart", "paragraph"]);
  const madeFlow = convertContainer(turnedList, "flowchart");
  const flowSource = source.replace(listLines, `      <ol class="doc-flow">\n${nodeLines(["甲", "乙", "丙"])}      </ol>`);
  assert.equal(saved(flowchart), flowSource, "a list turned into a flowchart: each item a node, its words its bold title");
  assert.equal(madeFlow.focus.parentElement.parentElement.localName, "ol", "the caret in the first node's title");
  const unflowed = openPage(flowSource);
  const steps = unflowed.document.querySelector("ol.doc-flow");
  assert.deepEqual([steps.querySelector("li").getAttribute("data-ge-unit-kind"), steps.querySelector("li").getAttribute("data-ge-box-kind"), containerTargets(steps)], ["step", "node", ["bullets", "numbers", "todo", "flowchart"]]);
  for (const [name, value] of [["data-doc-flow-key", "3"], ["aria-label", "流程图"]]) steps.setAttribute(name, value);
  convertContainer(steps, "numbers");
  const numbered = unflowed.document.querySelector("main ol");
  assert.deepEqual([numbered.className, numbered.getAttribute("data-doc-flow-key"), numbered.getAttribute("aria-label"), [...numbered.children].map((item) => item.innerHTML)], ["", null, null, ["甲", "乙", "丙"]], "back to a numbered list: the kit's marks stay behind, each title's words an item's, bold taken off");
  const unflowedResult = saveAll(unflowed, flowSource);
  assert.ok(unflowedResult.ok, JSON.stringify(unflowedResult.conflicts));
  assert.equal(unflowedResult.text, source.replace("<ul>", "<ol>").replace("</ul>", "</ol>"), "and in the file");
  // A flowchart split by a step from its middle turned into a list's item: the steps after it a
  // flowchart of their own with the direction the whole had (core.mjs newTail); the node's title turns
  // into nothing, the node into another kind of list or a highlight block.
  const directed = source.replace(listLines, `      <ol class="doc-flow" data-direction="column">\n${nodeLines(["甲", "乙", "丙"])}      </ol>`);
  const halves = openPage(directed);
  const middleNode = halves.document.querySelectorAll("ol.doc-flow > li")[1];
  assert.deepEqual([targetsOf(text(halves, "乙")), turnTargets(text(halves, "乙")), stepTargets(middleNode)], [[], [], ["bullets", "numbers", "todo", "flowchart", "highlight"]]);
  convertStep(middleNode, "bullets");
  const result = saveAll(halves, directed);
  assert.ok(result.ok, JSON.stringify(result.conflicts));
  const flat1 = (html) => html.replace(/\n\s*/g, "");
  assert.equal(flat1(result.text), flat1(directed).replace("<li><p><strong>乙</strong></p></li><li><p><strong>丙</strong></p></li></ol>", '</ol><ul><li>乙</li></ul><ol class="doc-flow" data-direction="column"><li><p><strong>丙</strong></p></li></ol>'), "both halves keep the flowchart's direction");
  const flat = openPage(source);
  assert.deepEqual(containerTargets(flat.document.querySelector("ul")), ["bullets", "numbers", "todo", "flowchart", "paragraph"]);
  convertContainer(flat.document.querySelector("ul"), "paragraph");
  assert.equal(saved(flat), source.replace("      <ul>\n        <li>甲</li>\n        <li>乙</li>\n        <li>丙</li>\n      </ul>", "      <p>甲</p>\n      <p>乙</p>\n      <p>丙</p>"));

  // A disclosure takes the paragraph into its content as it is, its title empty with the caret in it
  // (the reader's rule: what is turned into a disclosure is what it folds); a highlight panel wraps
  // the paragraph (an empty paragraph leaves it); a code block takes the text as its code, in place;
  // a divider replaces an empty block.
  const toggled = openPage(source);
  const title = convertBlock(text(toggled, "第二段"), "details").focus;
  assert.equal(title.closest("details").open, true, "open while edited");
  assert.ok(title.matches(".doc-details-summary-label"), "the caret goes to its empty title");
  title.textContent = "折叠的标题";
  assert.equal(saved(toggled), source.replace("      <p>第二段</p>\n", `      <details class="doc-details">
        <summary><span class="doc-details-summary-label">折叠的标题</span></summary>
        <div class="doc-details-content">
          <p>第二段</p>
        </div>
      </details>
`));
  const titleless = openPage(source);
  convertBlock(text(titleless, "第二段"), "details");
  assert.equal(collectEdits(titleless.document, titleless.baselines, titleless.layout).blank.length, 0, "a disclosure may have no title");
  assert.ok(saved(titleless).includes('<summary><span class="doc-details-summary-label"></span></summary>'), "and is written with an empty one");
  const panel = openPage(source);
  const inPanel = convertBlock(text(panel, "第二段"), "highlight").focus;
  assert.equal(saved(panel), source.replace("      <p>第二段</p>\n", '      <div class="doc-panel">\n        <div class="doc-icon">💡</div>\n        <p>第二段</p>\n      </div>\n'), "a new highlight block comes with 💡");
  // A panel is a container: its blocks keep their own types, a list or a heading among them; the
  // empty last paragraph leaves it.
  const next = splitBlock(inPanel, (() => { const range = panel.document.createRange(); range.selectNodeContents(inPanel); range.collapse(false); return range; })());
  assert.equal(typeOf(next), "paragraph");
  assert.equal(targetsOf(next).includes("highlight"), false, "no panel inside a panel");
  next.textContent = "面板里的列表项";
  convertBlock(next, "bullets");
  const panelHeading = newHost(panel.document, "heading2");
  panelHeading.textContent = "面板里的标题";
  inPanel.after(panelHeading);
  const exit = newHost(panel.document, "paragraph");
  inPanel.parentElement.append(exit);
  assert.equal(leaveBox(inPanel).focus, null, "only the empty last paragraph leaves");
  assert.equal(leaveBox(exit).focus, exit);
  assert.equal(exit.previousElementSibling.matches(".doc-panel"), true, "it goes right after the panel");
  assert.equal(saved(panel), source.replace("      <p>第二段</p>\n", '      <div class="doc-panel">\n        <div class="doc-icon">💡</div>\n        <p>第二段</p>\n        <h2>面板里的标题</h2>\n        <ul>\n          <li>面板里的列表项</li>\n        </ul>\n      </div>\n      <p></p>\n'), "the empty paragraph that left it is kept");
  // The opening summary is a highlight block like any other: its empty last paragraph leaves it too.
  const summaryPage = openPage(`<main>
  <section class="doc-summary">
    <p>概括</p>
  </section>
</main>
`);
  const summaryEnd = newHost(summaryPage.document, "paragraph");
  summaryPage.document.querySelector(".doc-summary").append(summaryEnd);
  const leftSummary = leaveBox(summaryEnd);
  assert.equal(leftSummary.focus, summaryEnd, "the summary's empty last paragraph leaves it");
  assert.equal(summaryEnd.previousElementSibling.matches(".doc-summary"), true, "it goes right after the summary");
  // The component a text block is of: of its kind, of a part, of its type, whatever stands around it (a list item in a document's own block is that block's text).
  {
    const { document } = new JSDOM(`<main>
      <ul class="doc-todo"><li id="item">一<p id="held">二</p></li></ul>
      <ol class="doc-flow"><li id="node"><p id="nodeTitle">题</p></li></ol>
      <p class="doc-note" id="note">小字</p>
      <div class="doc-callout" id="callout"><p id="inCallout">提示</p></div>
      <div class="doc-code"><pre><code data-ge-kind="code" id="code">x</code></pre></div>
      <details class="doc-details"><summary><span class="doc-details-summary-label" data-ge-kind="label" id="label"></span></summary><div class="doc-details-content"><p id="inDetails">文</p></div></details>
      <div class="own"><ul><li data-ge-kind="text" id="ownItem">甲</li></ul></div>
      <dialog class="doc-dialog"><div class="doc-dialog-panel"><div class="doc-dialog-content"><h2 id="inCard">文</h2></div></div></dialog>
      <table><tr><td data-ge-kind="cell" id="cell"></td></tr></table>
      <h5 id="fifth">五</h5>
    </main>`).window;
    const owners = Object.fromEntries([...document.querySelectorAll("[id]")].map((node) => [node.id, ownerOf(node)]));
    assert.deepEqual(owners, { item: "list", held: "paragraph", node: "list", nodeTitle: "paragraph", note: "paragraph", callout: "callout", inCallout: "paragraph", code: "code", label: "details", inDetails: "paragraph", ownItem: "widget", inCard: "heading", cell: "table", fifth: null });
  }
  // What an empty title says under the caret belongs to the part it is (placeholders, registry.mjs),
  // whether the file has it or the page just made it: the same words for both, before and after a save.
  const titles = openPage(`<main>
  <details class="doc-details"><summary><span class="doc-details-summary-label"></span></summary><div class="doc-details-content"><p>折叠正文</p></div></details>
  <div class="doc-code"><div class="doc-code-title"></div><pre><code>x</code></pre></div>
  <p>前文 <a href="#hint-card">详情</a></p>
  <dialog class="doc-dialog" id="hint-card"><div class="doc-dialog-panel"><div class="doc-dialog-content"><h3></h3><p>弹窗正文</p></div></div></dialog>
</main>
`);
  const part = (page, selector) => page.document.querySelector(selector);
  assert.deepEqual(
    [".doc-details-summary-label", ".doc-code-title", ".doc-details-content > p", "main > p"].map((selector) => placeholderOf(part(titles, selector))),
    ["折叠列表标题", "请输入代码块名称", null, null],
    "the file's empty titles say what their parts say, a paragraph nothing of its own");
  const made = openPage(source);
  const madeDetails = convertBlock(text(made, "第二段"), "details").focus.closest("details");
  const madeCode = convertBlock(text(made, "第三段"), "code").focus.closest(".doc-code");
  assert.deepEqual(
    [madeDetails.querySelector(".doc-details-summary-label"), madeCode.querySelector(".doc-code-title")].map((title) => placeholderOf(title)),
    ["折叠列表标题", "请输入代码块名称"], "and the titles made on the page say the same");
  for (const title of made.document.querySelectorAll("[data-ge-new][contenteditable]")) title.removeAttribute("data-ge-new"); // a save takes the new marks away (sync-state.mjs)
  assert.equal(placeholderOf(madeDetails.querySelector(".doc-details-summary-label")), "折叠列表标题", "a title the page saved still says it");
  const wrapped = openPage(source);
  const heading3 = convertBlock(text(wrapped, "第一段"), "heading3").focus;
  assert.equal(convertBlock(heading3, "highlight").focus.localName, "h3", "a panel takes a block as it is");
  const coded = openPage(source);
  const code = convertBlock(text(coded, "第二段"), "code").focus;
  code.textContent = "const a = 1 < 2;\nconst b = 3;\n";
  assert.equal(saved(coded), source.replace("<p>第二段</p>", '<div class="doc-code"><div class="doc-code-title"></div><pre><code>const a = 1 &lt; 2;\nconst b = 3;</code></pre></div>'));
  // Its title, typed on the page, is written with it.
  const titled = openPage(source);
  const titledCode = convertBlock(text(titled, "第二段"), "code").focus;
  titledCode.closest(".doc-code").querySelector(".doc-code-title").textContent = "a < b.ts";
  assert.equal(saved(titled), source.replace("<p>第二段</p>", '<div class="doc-code"><div class="doc-code-title">a &lt; b.ts</div><pre><code>第二段</code></pre></div>'));
  const ruled = openPage(source);
  const range = ruled.document.createRange();
  const third = text(ruled, "第三段");
  range.selectNodeContents(third);
  range.collapse(false);
  const blank = splitBlock(third, range);
  assert.ok(typedTargets(blank, true).includes("divider") && !targetsOf(blank).includes("divider"), "a divider from an empty block's \"/\" menu, never from the block menu's grid");
  const after = convertBlock(blank, "divider").focus;
  assert.equal(after.previousElementSibling.localName, "hr");
  assert.ok(after.previousElementSibling.hasAttribute("data-ge-frame") && after.previousElementSibling.getAttribute("data-ge-round") === "text", "a divider made on the page shows its frame, as the file's do");
  assert.equal(saved(ruled), source.replace("      <p>第三段</p>\n", "      <p>第三段</p>\n      <hr>\n      <p></p>\n"), "the empty paragraph the caret goes to is kept");
  // A disclosure turns back into a paragraph followed by its content.
  const unwrap = openPage(source);
  const back = convertBlock(text(unwrap, "第二段"), "details").focus;
  back.textContent = "标题";
  const details = back.closest("details");
  assert.deepEqual(containerTargets(details), ["details", "quote", "highlight", "callout", "paragraph"]);
  convertContainer(details, "paragraph");
  assert.equal(saved(unwrap), source.replace("      <p>第二段</p>\n", "      <p>标题</p>\n      <p>第二段</p>\n"));

  // A disclosure, a quote and a highlight block turn into one another, what they hold carried along:
  // a disclosure's title the first paragraph; a quote or a highlight block turned into a disclosure
  // all in its content, the title empty (the reader's rule, as a group's blocks); a quote only where
  // all is text.
  const holders = (to, from = "details") => {
    const page = openPage(source);
    const made = convertBlock(text(page, "第二段"), from).focus;
    if (from === "details") made.textContent = "标题"; // its content holds 第二段
    else {
      made.after(Object.assign(newHost(page.document, "paragraph"), { textContent: "里面" }));
    }
    const unit = from === "details" ? made.closest("details") : made.closest({ quote: "blockquote", highlight: ".doc-panel", callout: ".doc-callout" }[from]);
    assert.ok(containerTargets(unit).includes(to), `${from} offers ${to}: ${containerTargets(unit)}`);
    convertContainer(unit, to);
    return saved(page);
  };
  assert.equal(holders("quote"), source.replace("      <p>第二段</p>\n", "      <blockquote>\n        <p>标题</p>\n        <p>第二段</p>\n      </blockquote>\n"), "a disclosure into a quote: its title the first paragraph");
  assert.equal(holders("highlight"), source.replace("      <p>第二段</p>\n", '      <div class="doc-panel">\n        <div class="doc-icon">💡</div>\n        <p>标题</p>\n        <p>第二段</p>\n      </div>\n'), "into a highlight block, with 💡");
  assert.equal(holders("details", "quote"), source.replace("      <p>第二段</p>\n", `      <details class="doc-details">
        <summary><span class="doc-details-summary-label"></span></summary>
        <div class="doc-details-content">
          <p>第二段</p>
          <p>里面</p>
        </div>
      </details>
`), "a quote into a disclosure: its paragraphs in the content, the title empty");
  assert.equal(holders("details", "highlight"), source.replace("      <p>第二段</p>\n", `      <details class="doc-details">
        <summary><span class="doc-details-summary-label"></span></summary>
        <div class="doc-details-content">
          <p>第二段</p>
          <p>里面</p>
        </div>
      </details>
`), "a highlight block into a disclosure, its icon gone");
  // A callout is one of them, as a highlight block is (2026-11-07): no icon comes with it.
  assert.equal(holders("callout"), source.replace("      <p>第二段</p>\n", '      <div class="doc-callout">\n        <p>标题</p>\n        <p>第二段</p>\n      </div>\n'), "a disclosure into a callout");
  assert.equal(holders("highlight", "callout"), source.replace("      <p>第二段</p>\n", '      <div class="doc-panel">\n        <div class="doc-icon">💡</div>\n        <p>第二段</p>\n        <p>里面</p>\n      </div>\n'), "a callout into a highlight block, with 💡");
  assert.equal(holders("callout", "highlight"), source.replace("      <p>第二段</p>\n", '      <div class="doc-callout">\n        <p>第二段</p>\n        <p>里面</p>\n      </div>\n'), "a highlight block into a callout, its icon gone");
  // From the "/" menu or 在下方新建 (`fresh`), an empty block stands for the new disclosure or
  // highlight block, an empty paragraph in it; from the block menu
  // the block goes in as it is.
  const freshly = (html, type, fresh) => {
    const page = openPage(`<main class="doc-page">
  ${html}
  <p>后文</p>
</main>
`);
    const host = page.document.querySelector("main li, main h2, main blockquote > p");
    host.textContent = "";
    convertBlock(host, type, { fresh });
    return page.document.querySelector("main").innerHTML.replace(/ data-ge-[a-z-]+="[^"]*"| contenteditable="(true|false)"| spellcheck="false"| open=""/g, "").replace(/>\s+</g, "><").trim();
  };
  const empty = '<details class="doc-details"><summary><span class="doc-details-summary-label"></span></summary><div class="doc-details-content"><p></p></div></details>';
  assert.equal(freshly("<ul><li>项</li></ul>", "details", true), `${empty}<p>后文</p>`, "an empty item from the / menu: the disclosure stands for it");
  assert.equal(freshly("<h2>题</h2>", "details", true), `${empty}<p>后文</p>`, "an empty heading too");
  assert.equal(freshly("<blockquote><p>引</p></blockquote>", "details", true), `${empty}<p>后文</p>`, "an empty quote paragraph too");
  assert.equal(freshly("<ul><li>项</li></ul>", "highlight", true), '<div class="doc-panel"><div class="doc-icon">💡</div><p></p></div><p>后文</p>', "and a highlight block, a paragraph in it");
  assert.equal(freshly("<ul><li>项</li></ul>", "callout", true), '<div class="doc-callout"><p></p></div><p>后文</p>', "and a callout, a paragraph in it");
  assert.equal(freshly("<ul><li>项</li></ul>", "callout", false), '<div class="doc-callout"><ul><li></li></ul></div><p>后文</p>', "from the block menu the item goes into a callout as it is");
  assert.equal(freshly("<ul><li>项</li></ul>", "details", false), '<details class="doc-details"><summary><span class="doc-details-summary-label"></span></summary><div class="doc-details-content"><ul><li></li></ul></div></details><p>后文</p>', "from the block menu the empty item goes in as it is");
  const listed = openPage(source);
  const inside = convertBlock(text(listed, "第二段"), "details").focus.closest("details");
  const item = inside.querySelector(".doc-details-content > p");
  item.textContent = "一项";
  convertBlock(item, "bullets");
  assert.ok(!containerTargets(inside).includes("quote") && containerTargets(inside).includes("highlight"), "a disclosure holding a list: no quote, a highlight block");

  // A code block's text is plain text with its line breaks; opened on the page it ends with a line
  // break of its own, which is not code.
  const editedCode = openPage(source);
  const codeHost = text(editedCode, "if (a");
  assert.equal(codeHost.getAttribute("data-ge-kind"), "code");
  codeHost.textContent = "if (a > b) {\n  go();\n}\n";
  assert.equal(saved(editedCode), source.replace("<code>if (a &lt; b) {}</code>", "<code>if (a &gt; b) {\n  go();\n}</code>"));
  const codeBlock = findBlocks(source).find((block) => block.kind === "code");
  const lazy = new JSDOM(`<pre><span>if (a &lt; b) {}</span></pre>`).window.document;
  const host = openCode(lazy.querySelector("pre"), codeBlock.id, source.slice(codeBlock.innerStart, codeBlock.innerEnd));
  assert.equal(serializeInner(host), codeBaseline(source.slice(codeBlock.innerStart, codeBlock.innerEnd), lazy), "opened unchanged, it is its baseline");
  assert.deepEqual(applyEdits({ current: source, edits: [{ id: codeBlock.id, parts: [{ keep: true, html: "<b>x</b>" }] }] }).conflicts.map((entry) => entry.reason), ["invalid"]);
  // While edited, a code block shows its line numbers in a column of their own, never part of the code.
  const gutter = lazy.querySelector("pre > .ge-code-gutter");
  assert.equal(gutter?.textContent, "1");
  host.textContent = "a\nb\nc\n";
  syncGutter(host);
  assert.deepEqual([...gutter.querySelectorAll(".ge-code-number")].map((number) => number.textContent), ["1", "2", "3"]);
  assert.equal(codeText(host), "a\nb\nc");
  // An excerpt numbered as in its file (its block's data-line-start): the gutter numbers from there,
  // as the kit does, as wide as its last number, and the attribute stays as written.
  const excerpt = new JSDOM(`<div class="doc-code" data-line-start="98"><div class="doc-code-title"></div><pre><span>x</span></pre></div>`).window.document;
  const excerptHost = openCode(excerpt.querySelector("pre"), codeBlock.id, "a\nb\nc");
  const excerptGutter = excerpt.querySelector("pre > .ge-code-gutter");
  assert.deepEqual([...excerptGutter.querySelectorAll(".ge-code-number")].map((number) => number.textContent), ["98", "99", "100"]);
  assert.equal(excerptGutter.style.getPropertyValue("--ge-code-digits"), "3");
  excerpt.querySelector(".doc-code").setAttribute("data-line-start", "0");
  syncGutter(excerptHost);
  assert.deepEqual([...excerptGutter.querySelectorAll(".ge-code-number")].map((number) => number.textContent), ["1", "2", "3"], "a number that is none: from 1");
  // Turned into text, a code block leaves the number of its first line (its own, as its language).
  assert.ok(codeAttribute("data-line-start", "38") && !codeAttribute("data-block-id", "x"));

  // Pasting formatted text keeps the format bar's marks, and only them; blocks become lines.
  const clip = new JSDOM("").window.document;
  const pasted = pastedLines(clip, '<meta charset="utf-8"><p style="margin:0">有 <b style="font-weight:700">粗</b>、<em>斜</em>、<code>码</code>、<a href="https://example.com" onclick="x()">链</a>、<span class="doc-text-red" style="color:red">红</span> 和 <span style="font-size:30px">大字</span></p><ul><li>第二行<br>第三行</li></ul><p><a href="javascript:alert(1)">坏链接</a></p>');
  const html = (line) => line.map((node) => node.nodeType === 3 ? node.data : node.outerHTML).join("");
  assert.deepEqual(pasted.map(html), [
    '有 <strong>粗</strong>、<em>斜</em>、<code>码</code>、<a href="https://example.com">链</a>、<span class="doc-text-red">红</span> 和 大字', "第二行", "第三行", "坏链接",
  ]);
  assert.deepEqual(pastedLines(clip, "<p><a href='https://x.y'>链</a></p>", { links: false }).map(html), ["链"], "no links where a block takes none");
  assert.deepEqual(pastedLines(clip, '<span class="katex"><span class="katex-mathml"><math><semantics><annotation encoding="application/x-tex">a^2</annotation></semantics></math></span><span class="katex-html" aria-hidden="true">a2</span></span>').map(html), ["\\(a^2\\)"], "a formula from elsewhere as its TeX");
  // The spaces at a line's ends go, but those `edges` keeps (words copied with a space beside them), one space each; not at a line break.
  assert.deepEqual(pastedLines(clip, " 词语 ").map(html), ["词语"], "a line's end spaces trimmed");
  assert.deepEqual(pastedLines(clip, " 词语 ", { edges: { start: true, end: true } }).map(html), [" 词语 "], "kept where edges says");
  assert.deepEqual(pastedLines(clip, "\n  词语\t", { edges: { start: false, end: true } }).map(html), ["词语 "], "the end alone, one space");
  assert.deepEqual(pastedLines(clip, " 甲 <br> 乙 ", { edges: { start: true, end: true } }).map(html), [" 甲", "乙 "], "the first line's start and the last's end, none by the line break");
  // Pasted into a paragraph, the lines become blocks and save in the kit's markup.
  const pastePage = openPage(source);
  const target = text(pastePage, "第三段");
  const at = pastePage.document.createRange();
  at.selectNodeContents(target);
  at.collapse(false);
  await pasteAt(pastePage, target, at, { html: "<p><strong>加粗</strong>的一段</p><p>另一段</p>", text: "加粗的一段\n另一段" });
  assert.ok(saved(pastePage).includes("      <p>第三段<strong>加粗</strong>的一段</p>\n      <p>另一段</p>\n"));
  // Pasted inline code stands a space apart from the words it joins, as typed or made code does
  // (shared/inline-spacing.mjs): at the end of a line, and in the middle of one, across a mark too.
  const pastedInto = text(pastePage, "二的正文");
  const endOfLine = pastePage.document.createRange();
  endOfLine.selectNodeContents(pastedInto);
  endOfLine.collapse(false);
  await pasteAt(pastePage, pastedInto, endOfLine, { html: "<p><code>npm</code></p>", text: "npm" });
  assert.equal(pastedInto.textContent, "二的正文 npm", "pasted code at a line's end: a space before it, none after it");
  await pasteAt(pastePage, pastedInto, caretIn(pastePage.document, pastedInto, "正文", 0), { html: "<p><strong><code>x</code>为</strong></p>", text: "x为" });
  assert.equal(pastedInto.textContent, "二的 x 为正文 npm", "pasted code in the middle of a line: a space on each side, one across the strong it came in");
  assert.ok(saved(pastePage).includes("<p>二的<strong> <code>x</code> </strong><strong>为</strong>正文 <code>npm</code></p>"), saved(pastePage));

  // New blocks: after a card (no text block next to it), in the kit's markup, in page order.
  const added = openPage(source);
  const card = added.document.querySelector("figure");
  const note = newHost(added.document, "paragraph");
  note.textContent = "图后的说明";
  const list = newContainer(added.document, "bullets");
  for (const words of ["一项", "", "二项"]) {
    const item = newHost(added.document, "item");
    item.textContent = words;
    list.append(item);
  }
  card.after(note, list);
  const title3 = newHost(added.document, "heading3");
  title3.innerHTML = "<strong>注意：</strong>新标题";
  text(added, "二的正文").after(title3);
  const figure = units.find((unit) => unit.kind === "figure").id;
  const body = units.find((unit) => source.slice(unit.start, unit.end) === "<p>二的正文</p>").id;
  assert.deepEqual(changes(added).units.map((op) => [op.insert.type, op.place]).sort(), [
    ["bullets", { after: figure }], ["heading3", { after: body }], ["paragraph", { after: figure }],
  ], "box by box, in page order within a box");
  assert.deepEqual(changes(added).units.filter((op) => op.place.after === figure).map((op) => op.insert.type), ["paragraph", "bullets"]);
  assert.equal(saved(added), source
    .replace("<h3>图</h3></figure>\n", "<h3>图</h3></figure>\n    <p>图后的说明</p>\n    <ul>\n      <li>一项</li>\n      <li></li>\n      <li>二项</li>\n    </ul>\n")
    .replace("    <p>二的正文</p>\n", "    <p>二的正文</p>\n    <h3><strong>注意：</strong>新标题</h3>\n"));
  assert.equal(saveAll(added, source.replace(/\n/g, "\r\n")).text, saved(added).replace(/\n/g, "\r\n"), "CRLF files get CRLF");

  // A new paragraph split off a text block is still written with it, in order with new blocks
  // of other types around it.
  const mixed = openPage(source);
  const thirdAgain = text(mixed, "第三段");
  const end = mixed.document.createRange();
  end.selectNodeContents(thirdAgain);
  end.collapse(false);
  const tail = splitBlock(thirdAgain, end);
  tail.textContent = "拆出的段落";
  const sub = newHost(mixed.document, "heading2");
  sub.textContent = "新的二级标题";
  tail.after(sub);
  const last = newHost(mixed.document, "paragraph");
  last.textContent = "标题下的段落";
  sub.after(last);
  assert.ok(saved(mixed).includes("      <p>第三段</p>\n      <p>拆出的段落</p>\n      <h2>新的二级标题</h2>\n      <p>标题下的段落</p>\n    </div>"));

  // A new section after a section, holding a paragraph; one made on the page and deleted takes the
  // blocks moved into it along.
  const fresh = openPage(source);
  const opening = sectionAfter(fresh.document.querySelector("main > section")).focus;
  opening.textContent = "新分区";
  assert.ok(saved(fresh).includes(`  </section>

  <section class="doc-section">
    <p>新分区</p>
  </section>

  <section class="doc-section" aria-labelledby="b">`));
  const moved = openPage(source);
  const holder = sectionAfter(moved.document.querySelector("main > section")).focus.closest("section");
  holder.append(text(moved, "二的正文"));
  holder.remove();
  assert.equal(saved(moved), source.replace("    <p>二的正文</p>\n", ""), "its blocks went with it");

  // The server writes every type in the kit's markup, and refuses a type the box does not take,
  // markup a block may not hold, an original unit used twice.
  const footer = units.find((unit) => unit.tag === "footer");
  const lastSection = units.filter((unit) => unit.kind === "section").at(-1);
  const insert = (node, place) => refused({ id: "n0", insert: node, place });
  const write = (node) => applyEdits({ current: source, edits: [], units: [{ id: "n0", insert: node, place: { after: body } }] }).text
    .split("\n").slice(source.split("\n").indexOf("    <p>二的正文</p>") + 1, -4).join("\n");
  assert.equal(write({ type: "divider" }), "    <hr>");
  assert.equal(write({ type: "code", html: "a &lt; b\n  c" }), '    <div class="doc-code"><div class="doc-code-title"></div><pre><code>a &lt; b\n  c</code></pre></div>');
  assert.equal(write({ type: "code", html: "x", title: "a &amp; b.ts" }), '    <div class="doc-code"><div class="doc-code-title">a &amp; b.ts</div><pre><code>x</code></pre></div>', "with its title");
  assert.equal(write({ type: "code", html: "x", lineStart: "38" }), '    <div class="doc-code" data-line-start="38"><div class="doc-code-title"></div><pre><code>x</code></pre></div>', "a pasted excerpt with its first line's number");
  for (const lineStart of ["0", "038", " 38", 38, "1234567"]) assert.deepEqual(insert({ type: "code", html: "x", lineStart }, { after: body }), ["invalid"], `a first line's number as the page writes one: ${JSON.stringify(lineStart)}`);
  assert.equal(write({ type: "highlight", children: [{ type: "paragraph", html: "要点" }, { type: "bullets", children: [{ type: "item", html: "一" }] }] }),
    '    <div class="doc-panel">\n      <p>要点</p>\n      <ul>\n        <li>一</li>\n      </ul>\n    </div>');
  // A container's color is written as a text block's is (after the kit's class), and checked: a
  // highlight block made of a colored node, a disclosure pasted with its background, an item holding
  // blocks (one made of a colored node holding content); one its kind does not switch is refused.
  assert.equal(write({ type: "highlight", classes: ["doc-highlight-blue"], children: [{ type: "paragraph", html: "要点" }] }),
    '    <div class="doc-panel doc-highlight-blue">\n      <p>要点</p>\n    </div>', "a highlight block with its background");
  assert.equal(write({ type: "details", title: "标题", classes: ["doc-highlight-green"], children: [] }),
    '    <details class="doc-details doc-highlight-green">\n      <summary><span class="doc-details-summary-label">标题</span></summary>\n      <div class="doc-details-content"></div>\n    </details>', "a disclosure with its background");
  assert.equal(write({ type: "numbers", children: [{ type: "item", html: "甲步", classes: ["doc-highlight-blue"], children: [{ type: "paragraph", html: "甲的说明" }] }] }),
    '    <ol>\n      <li class="doc-highlight-blue">甲步\n        <p>甲的说明</p>\n      </li>\n    </ol>', "an item holding blocks with its color");
  assert.equal(write({ type: "bullets", children: [{ type: "item", html: "乙", classes: ["doc-text-red"], children: [{ type: "paragraph", html: "说明" }] }] }),
    '    <ul>\n      <li class="doc-text-red">乙\n        <p>说明</p>\n      </li>\n    </ul>', "its text color too");
  assert.deepEqual(insert({ type: "highlight", classes: ["doc-text-red"], children: [{ type: "paragraph", html: "x" }] }, { after: body }), ["invalid"], "a highlight block takes no text color");
  assert.deepEqual(insert({ type: "highlight", classes: ["own-class"], children: [{ type: "paragraph", html: "x" }] }, { after: body }), ["invalid"], "nor a class of the document's own");
  // A callout holds blocks as a highlight block does (2026-11-07), its background the one family it takes.
  assert.equal(write({ type: "callout", children: [{ type: "paragraph", html: "提示" }, { type: "bullets", children: [{ type: "item", html: "一" }] }] }),
    '    <div class="doc-callout">\n      <p>提示</p>\n      <ul>\n        <li>一</li>\n      </ul>\n    </div>', "a callout of blocks");
  assert.equal(write({ type: "callout", classes: ["doc-highlight-green"], children: [{ type: "paragraph", html: "提示" }] }),
    '    <div class="doc-callout doc-highlight-green">\n      <p>提示</p>\n    </div>', "a callout with its background");
  assert.deepEqual(insert({ type: "callout", html: "提示" }, { after: body }), ["invalid"], "no callout of words alone: its words are its paragraph's");
  assert.deepEqual(insert({ type: "callout", children: [{ type: "callout", children: [{ type: "paragraph", html: "x" }] }] }, { after: body }).length, 0, "one in another a file or a drop may make (convert.mjs offers none)");
  assert.equal(write({ type: "details", title: "看完整内容", children: [] }),
    '    <details class="doc-details">\n      <summary><span class="doc-details-summary-label">看完整内容</span></summary>\n      <div class="doc-details-content"></div>\n    </details>');
  assert.equal(write({ type: "details", title: "", children: [] }),
    '    <details class="doc-details">\n      <summary><span class="doc-details-summary-label"></span></summary>\n      <div class="doc-details-content"></div>\n    </details>', "an empty disclosure too");
  assert.ok(applyEdits({ current: source, edits: [], units: [{ id: "n0", insert: { type: "paragraph", html: "x" }, place: { after: footer.id } }] }).ok, "a block may follow a footer");
  assert.deepEqual(insert({ type: "item", html: "x" }, { after: second.id }), ["position"]);
  const among = applyEdits({ current: source, edits: [], units: [{ id: "n0", insert: { type: "divider" }, place: { after: lastSection.id } }] });
  assert.ok(among.ok && among.text.includes("</section>\n\n  <hr>\n"), "body text may stand among the sections, straight in the page (set apart as they are)");
  assert.deepEqual(insert({ type: "section", children: [{ type: "paragraph", html: "x" }] }, { after: second.id }), ["position"], "a section stands in the page or a Sheet panel");
  assert.deepEqual(insert({ type: "section", children: [] }, { after: lastSection.id }), ["invalid"], "and holds a block");
  assert.deepEqual(insert({ type: "paragraph", html: '<a href="javascript:x">x</a>' }, { after: second.id }), ["invalid"]);
  assert.deepEqual(insert({ type: "bullets", children: [{ type: "paragraph", html: "x" }] }, { after: second.id }), ["invalid"]);
  assert.deepEqual(insert({ type: "section", children: [{ unit: second.id }, { unit: second.id }] }, { after: lastSection.id }), ["invalid"]);
  assert.equal(applyEdits({ current: source, edits: [], units: [{ id: "n0", insert: { type: "section", children: [{ unit: second.id }] }, place: { after: lastSection.id } }] }).text,
    source.replace("      <p>第二段</p>\n", "").replace("  </section>\n  <footer>", `  </section>

  <section class="doc-section">
    <p>第二段</p>
  </section>
  <footer>`));
  // An empty highlight panel or disclosure content in the file still takes blocks.
  const empties = `<main><section class="doc-section"><div class="doc-panel"></div><details class="doc-details"><summary><span class="doc-details-summary-label">t</span></summary><div class="doc-details-content"></div></details></section></main>`;
  assert.deepEqual(findUnits(empties).boxes.map((box) => box.kind), ["main", "section", "highlight", "details"]);

  // Typing shortcuts.
  assert.deepEqual(["# ", "## ", "### ", "#### ", "- ", "* ", "1. ", "3。 ", "> ", "》 ", "＃＃ ", "#x", "- a", "#  "].map((text) => markdownShortcut(text)?.type ?? null),
    ["heading1", "heading2", "heading3", "heading4", "bullets", "bullets", "numbers", "numbers", "quote", "quote", "heading2", null, null, null]);
  assert.deepEqual(["---", "```", "--", "---x"].map((text) => markdownShortcut(text, { alone: true })?.type ?? null), ["divider", "code", null, null]);
  // A type's `markdown`: the menu row's shortcut is its own, what a rule sets comes with it, a rule of
  // `alone` holds in a block holding nothing else, and a type the block cannot become is passed over.
  for (const [type, { hint }] of Object.entries(BLOCK_TYPES).filter(([, spec]) => spec.hint)) {
    assert.equal(markdownShortcut(`${hint} `)?.type ?? markdownShortcut(hint, { alone: true })?.type, type, `${hint} makes ${type}`);
  }
  assert.deepEqual(["[x] ", "[X] ", "[] ", "[ ] ", "【】 ", "3. ", "0. "].map((text) => markdownShortcut(text)).map(({ type, props }) => [type, props]), [["todo", { checked: true }], ["todo", { checked: true }], ["todo", {}], ["todo", {}], ["todo", {}], ["numbers", { number: 3 }], ["numbers", {}]]);
  assert.deepEqual(["---", "```"].map((text) => markdownShortcut(text)), [null, null], "not with text after it");
  assert.equal(markdownShortcut("- ", { takes: (type) => type !== "bullets" }), null);

  assert.deepEqual(inlineMark("用 `x` "), null);
  assert.deepEqual(inlineMark("用 `code`")?.name, "code");
  assert.equal(inlineMark("** 不是 **"), null);
}

// Every heading a level larger or smaller (a heading's level badge: 所有标题增大一级, 所有标题减小一级;
// convert.mjs headingShifts, shiftHeadings): every heading of the document's flows its block menu could
// turn (those the outline lists, one in a section or a highlight block among them; the report's title, an
// author's h5 and a detail card's title left as they are); 标题 1 stays the largest, 标题 4 becomes a
// paragraph bold throughout (its words wrapped in one <strong>, as Ctrl+B on all of them), its id, color
// and marks going with it.
{
  const source = `<main class="doc-page">
  <header class="doc-header"><h1 class="doc-title">报告</h1></header>
  <h1 data-block-id="hzla0001">总览</h1>
  <h2 class="doc-text-blue" data-block-id="hzlb0002">第一章</h2>
  <h3>小节<em>斜体</em></h3>
  <h4 data-block-id="hzld0004">细目<u>线</u></h4>
  <h4><strong>已粗</strong>标题</h4>
  <h4><strong>全粗</strong></h4>
  <h5>五级</h5>
  <section class="doc-section"><h2>分区里</h2><p>正文</p></section>
  <div class="doc-panel"><h3>高亮里</h3></div>
  <dialog class="doc-dialog" id="card"><div class="doc-dialog-panel"><div class="doc-dialog-content"><h3>卡片里</h3><p>卡片正文</p></div></div></dialog>
</main>
`;
  const body = (page) => {
    const result = saveAll(page, source);
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    return result.text.match(/<main[^>]*>([\s\S]*)<\/main>/)[1].replace(/\n\s*/g, "");
  };
  const words = (shifts) => shifts.map(({ host, type }) => `${host.textContent.trim()}>${type}`);

  const down = openPage(source);
  const card = [...down.document.querySelectorAll("dialog h3")].find((node) => node.textContent === "卡片里");
  assert.ok(targetsOf(card).includes("heading4"), "a detail card's title its block menu could turn");
  const lower = headingShifts(down.document.querySelector("main"), "down");
  assert.deepEqual(words(lower), ["总览>heading2", "第一章>heading3", "小节斜体>heading4", "细目线>paragraph", "已粗标题>paragraph", "全粗>paragraph", "分区里>heading3", "高亮里>heading4"], "every heading of the document's flows a level smaller, 标题 4 a paragraph; the title, an h5 and a detail card's are none");
  const lowered = shiftHeadings(lower);
  assert.equal(lowered.changed, true);
  assert.equal(lowered.hosts.size, 8);
  assert.deepEqual([...lowered.hosts.values()].map((host) => host.localName), ["h2", "h3", "h4", "p", "p", "p", "h3", "h4"], "where each one's words are now");
  assert.equal(body(down),
    '<header class="doc-header"><h1 class="doc-title">报告</h1></header><h2 data-block-id="hzla0001">总览</h2><h3 class="doc-text-blue" data-block-id="hzlb0002">第一章</h3><h4>小节<em>斜体</em></h4><p data-block-id="hzld0004"><strong>细目<u>线</u></strong></p><p><strong>已粗标题</strong></p><p><strong>全粗</strong></p><h5>五级</h5><section class="doc-section"><h3>分区里</h3><p>正文</p></section><div class="doc-panel"><h4>高亮里</h4></div><dialog class="doc-dialog" id="card"><div class="doc-dialog-panel"><div class="doc-dialog-content"><h3>卡片里</h3><p>卡片正文</p></div></div></dialog>',
    "written as each heading's conversion in place: ids, colors and marks kept, a paragraph's words bold once");

  const up = openPage(source);
  const raise = headingShifts(up.document.querySelector("main"), "up");
  assert.deepEqual(words(raise), ["第一章>heading1", "小节斜体>heading2", "细目线>heading3", "已粗标题>heading3", "全粗>heading3", "分区里>heading1", "高亮里>heading2"], "a level larger, 标题 1 staying");
  shiftHeadings(raise);
  assert.equal(body(up),
    '<header class="doc-header"><h1 class="doc-title">报告</h1></header><h1 data-block-id="hzla0001">总览</h1><h1 class="doc-text-blue" data-block-id="hzlb0002">第一章</h1><h2>小节<em>斜体</em></h2><h3 data-block-id="hzld0004">细目<u>线</u></h3><h3><strong>已粗</strong>标题</h3><h3><strong>全粗</strong></h3><h5>五级</h5><section class="doc-section"><h1>分区里</h1><p>正文</p></section><div class="doc-panel"><h2>高亮里</h2></div><dialog class="doc-dialog" id="card"><div class="doc-dialog-panel"><div class="doc-dialog-content"><h3>卡片里</h3><p>卡片正文</p></div></div></dialog>');

  const top = openPage(`<main class="doc-page">\n  <h1>甲</h1>\n  <p>乙</p>\n</main>\n`);
  assert.deepEqual(headingShifts(top.document.querySelector("main"), "up"), [], "every heading 标题 1: nothing to raise");
  assert.equal(shiftHeadings([]).changed, false);
}

// Several blocks turned into one type at once (the block menu of a group, the format bar over text
// across blocks; convert.mjs groupTargets, convertGroup). The types
// they can all be turned into, offered only when every one of them can be (all or nothing), the type
// marked only when they all share it; each turned in document order, a block already of the type left
// as it is. Every item of a list in the group, turned into another kind of list, is the list turned
// (its nesting, start and direction kept); an item holding blocks goes to another kind of list only,
// what it holds going with it; lists side by side after it are one; into a highlight block, one new
// highlight block holding them all, each keeping its type.
{
  const source = `<main class="doc-page">
  <p>前言</p>
  <ol class="doc-flow" data-direction="column" start="3">
    <li><p><strong>需求</strong></p></li>
    <li><p><strong>设计</strong></p>
      <ol>
        <li>前端</li>
      </ol>
    </li>
    <li><p><strong>上线</strong></p></li>
  </ol>
  <ul>
    <li>甲</li>
    <li>乙</li>
  </ul>
  <p>中间</p>
  <ul>
    <li>丙</li>
  </ul>
  <h2>标题</h2>
  <blockquote>
    <p>引言</p>
  </blockquote>
  <figure class="doc-image"><img src="a.png" alt=""></figure>
  <hr>
  <p>结尾</p>
</main>
`;
  const text = (page, words) => [...page.document.querySelectorAll("[contenteditable]")].find((node) => node.textContent.trim().startsWith(words));
  const body = (page) => {
    const result = saveAll(page, source);
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    return result.text.match(/<main[^>]*>([\s\S]*)<\/main>/)[1].replace(/\n\s*/g, "");
  };
  const ALL = TURN_INTO.filter((type) => type !== "divider");
  const LISTS = ["bullets", "numbers", "todo", "flowchart"];

  // What a group is offered: the types common to all of them (no divider), its own type only when shared.
  const page = openPage(source);
  const steps = [...page.document.querySelector("main > ol").children];
  assert.deepEqual(groupTargets([text(page, "前言"), text(page, "中间")]), { types: ALL, current: "paragraph", first: "paragraph" });
  assert.deepEqual(groupTargets([text(page, "前言"), text(page, "标题")]), { types: ALL, current: null, first: "paragraph" }, "a mix marks none");
  assert.deepEqual(groupTargets(steps), { types: ["bullets", "numbers", "todo", "details", "flowchart", "highlight", "callout"], current: "flowchart", first: "flowchart" }, "every step of a flowchart: the kinds of list (each an item, its content held), or the flowchart whole into a disclosure, a highlight block or a callout");
  assert.deepEqual(groupTargets(steps.slice(1)), { types: LISTS, current: "flowchart", first: "flowchart" }, "some of its steps: the kinds of list only");
  assert.equal(groupTargets([text(page, "设计"), text(page, "上线")]), null, "nodes' titles turn into nothing");
  assert.deepEqual(groupTargets([page.document.querySelector("main > ul"), text(page, "前言")]).types, ALL, "a whole list: its items' types, and its own");
  assert.deepEqual(groupTargets([text(page, "前言"), text(page, "前端")]).current, null);
  assert.equal(groupTargets([text(page, "前言"), page.document.querySelector("figure")]), null, "an image among them: none");
  assert.equal(groupTargets([text(page, "前言"), page.document.querySelector("main > hr")]), null, "a divider among them: none");
  assert.deepEqual(groupTargets([text(page, "前言"), page.document.querySelector("blockquote")]), { types: ALL, current: null, first: "paragraph" }, "a whole quote: its paragraphs' types (theirs, as text across them gives)");
  assert.deepEqual(groupTargets([text(page, "引言"), text(page, "结尾")]).types, ALL, "a quote's paragraph is a text block of its own");

  // Every item of the flowchart into a numbered list: the list turned, its steps' content, start and direction kept.
  const whole = openPage(source);
  const turned = convertGroup([...whole.document.querySelector("main > ol").children], "numbers");
  assert.deepEqual(turned.units.map((unit) => unit.textContent.trim().slice(0, 2)), ["需求", "设计", "上线"], "its items stay selected");
  assert.ok(body(whole).startsWith('<p>前言</p><ol start="3"><li>需求</li><li>设计<ol><li>前端</li></ol></li><li>上线</li></ol><ul>'), body(whole));

  // Two lists and the paragraph between them into a numbered list: one list.
  const joined = openPage(source);
  const lists = [...joined.document.querySelectorAll("main > ul")];
  convertGroup([lists[0], text(joined, "中间"), lists[1]], "numbers");
  assert.ok(body(joined).includes("</ol><ol><li>甲</li><li>乙</li><li>中间</li><li>丙</li></ol><h2>标题</h2>"), body(joined));

  // Two steps, one holding a list, into bullets: one list after what is left of the flowchart.
  const held = openPage(source);
  const pairTurned = convertGroup([...held.document.querySelector("main > ol").children].slice(1), "bullets");
  assert.deepEqual(pairTurned.units.map((unit) => unit.localName), ["li", "li"], "its items selected");
  assert.ok(body(held).includes('<ol class="doc-flow" data-direction="column" start="3"><li><p><strong>需求</strong></p></li></ol><ul><li>设计<ol><li>前端</li></ol></li><li>上线</li></ul><ul><li>甲</li>'), body(held));

  // Items and paragraphs into headings: each its own, the lists split around them.
  const headings = openPage(source);
  const out = convertGroup([text(headings, "甲"), text(headings, "中间")], "heading3");
  assert.deepEqual(out.units.map((unit) => unit.localName), ["h3", "h3"]);
  assert.ok(body(headings).includes("<h3>甲</h3><ul><li>乙</li></ul><h3>中间</h3><ul><li>丙</li></ul>"), body(headings));

  // A paragraph, a heading and an item into a highlight block: one, at the first's place, each keeping its type.
  const panel = openPage(source);
  const gathered = convertGroup([text(panel, "中间"), text(panel, "丙"), text(panel, "标题")], "highlight");
  assert.equal(gathered.units.length, 1);
  assert.ok(body(panel).includes('<li>乙</li></ul><div class="doc-panel"><div class="doc-icon">💡</div><p>中间</p><ul><li>丙</li></ul><h2>标题</h2></div><blockquote>'), body(panel));
  // The same into a disclosure (the reader's rule): one, its title empty, its content holding them as
  // they are; the disclosure is what stands for them now.
  const folded = openPage(source);
  const folding = convertGroup([text(folded, "中间"), text(folded, "丙"), text(folded, "标题")], "details");
  assert.deepEqual(folding.units.map((unit) => unit.localName), ["details"]);
  assert.ok(body(folded).includes('<li>乙</li></ul><details class="doc-details"><summary><span class="doc-details-summary-label"></span></summary><div class="doc-details-content"><p>中间</p><ul><li>丙</li></ul><h2>标题</h2></div></details><blockquote>'), body(folded));
  // A whole list and the steps of a flowchart, one holding a list: into it whole, the list kept.
  const foldedSteps = openPage(source);
  convertGroup([...foldedSteps.document.querySelector("main > ol").children], "details");
  assert.ok(body(foldedSteps).startsWith('<p>前言</p><details class="doc-details"><summary><span class="doc-details-summary-label"></span></summary><div class="doc-details-content"><ol class="doc-flow" data-direction="column" start="3"><li><p><strong>需求</strong></p></li><li><p><strong>设计</strong></p><ol><li>前端</li></ol></li><li><p><strong>上线</strong></p></li></ol></div></details><ul>'), body(foldedSteps));

  // Nothing of another type among them: nothing changes.
  const same = openPage(source);
  assert.equal(convertGroup([text(same, "前言"), text(same, "中间")], "paragraph").changed, false);

  // A list the group turned that joins the one before it: its items are among what is selected afterwards.
  const runSource = `<main class="doc-page">\n  <p>分隔</p>\n  <ol class="doc-flow">\n    <li><p><strong>起步</strong></p></li>\n    <li><p><strong>收尾</strong></p></li>\n  </ol>\n  <p>段落</p>\n</main>\n`;
  const run = openPage(runSource);
  const ran = convertGroup([text(run, "分隔"), run.document.querySelector("main > ol"), text(run, "段落")], "numbers");
  const runSaved = saveAll(run, runSource);
  assert.ok(runSaved.ok && runSaved.text.replace(/\n\s*/g, "").includes("<ol><li>分隔</li><li>起步</li><li>收尾</li><li>段落</li></ol>"), runSaved.text);
  const runItems = [...run.document.querySelectorAll("main > ol > li")];
  assert.ok(runItems.length === 4 && runItems.every((item) => ran.units.some((unit) => unit === item || unit.contains(item))), JSON.stringify(ran.units.map((unit) => unit.textContent.trim().slice(0, 4))));

  // Two lists the author wrote side by side, already of the type, stay two (join.mjs: pairs side by side before stay).
  const apart = openPage(`<main class="doc-page">\n  <p>前</p>\n  <ul>\n    <li>乙一</li>\n  </ul>\n  <ul>\n    <li>丙一</li>\n  </ul>\n</main>\n`);
  convertGroup([text(apart, "前"), ...apart.document.querySelectorAll("main > ul")], "bullets");
  assert.equal(apart.document.querySelector("main").innerHTML.replace(/\s+|data-ge-[\w-]+(="[^"]*")?|contenteditable="true"|spellcheck="false"/g, "").replace(/<(\w+)\s*>/g, "<$1>"), "<ul><li>前</li><li>乙一</li></ul><ul><li>丙一</li></ul>");

  // Every item of a numbered list, its nested list's among them (text across them all), into a flowchart:
  // the list made one, each top item a node, the nested list staying a numbered list, a node's content
  // (a nested list is the item's, as one list's own menu keeps it).
  const branchSource = `<main class="doc-page">\n  <ol>\n    <li>一号</li>\n    <li>二号\n      <ol>\n        <li>分支甲</li>\n        <li>分支乙</li>\n      </ol>\n    </li>\n    <li>三号</li>\n  </ol>\n</main>\n`;
  const branchBody = (page) => {
    const result = saveAll(page, branchSource);
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    return result.text.match(/<main[^>]*>([\s\S]*)<\/main>/)[1].replace(/\n\s*/g, "");
  };
  const branch = openPage(branchSource);
  convertGroup(["一号", "二号", "分支甲", "分支乙", "三号"].map((words) => text(branch, words)), "flowchart");
  assert.equal(branchBody(branch), '<ol class="doc-flow"><li><p><strong>一号</strong></p></li><li><p><strong>二号</strong></p><ol><li>分支甲</li><li>分支乙</li></ol></li><li><p><strong>三号</strong></p></li></ol>');
  const partBranch = openPage(branchSource);
  convertGroup(["二号", "分支甲", "分支乙"].map((words) => text(partBranch, words)), "flowchart");
  assert.equal(branchBody(partBranch).match(/doc-flow/g)?.length, 1, branchBody(partBranch));
  assert.ok(branchBody(partBranch).includes('</ol><ol class="doc-flow"><li><p><strong>二号</strong></p><ol><li>分支甲</li>'), branchBody(partBranch));

  // A whole quote among them (a box over it): its paragraphs turned one by one, as text across them is.
  const quoteSource = `<main class="doc-page">\n  <p>前</p>\n  <blockquote>\n    <p>引一</p>\n    <p>引二</p>\n  </blockquote>\n  <p>后</p>\n</main>\n`;
  const quoteBody = (page) => {
    const result = saveAll(page, quoteSource);
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    return result.text.match(/<main[^>]*>([\s\S]*)<\/main>/)[1].replace(/\n\s*/g, "");
  };
  const quoted = openPage(quoteSource);
  const quote = quoted.document.querySelector("blockquote");
  assert.deepEqual(groupTargets([quote, text(quoted, "后")]).current, null);
  assert.equal(groupTargets([quote]).current, "quote");
  const listed = convertGroup([text(quoted, "前"), quote, text(quoted, "后")], "bullets");
  assert.equal(quoteBody(quoted), "<ul><li>前</li><li>引一</li><li>引二</li><li>后</li></ul>");
  assert.equal(listed.units.length, 4);
  const unquoted = openPage(quoteSource);
  convertGroup([unquoted.document.querySelector("blockquote"), text(unquoted, "后")], "paragraph");
  assert.equal(quoteBody(unquoted), "<p>前</p><p>引一</p><p>引二</p><p>后</p>");
  const kept = openPage(quoteSource);
  convertGroup([text(kept, "前"), kept.document.querySelector("blockquote")], "quote");
  assert.equal(quoteBody(kept), "<blockquote><p>前</p><p>引一</p><p>引二</p></blockquote><p>后</p>", "a quote already of the type, the paragraph joining it");
  const boxed = openPage(quoteSource);
  convertGroup([boxed.document.querySelector("blockquote"), text(boxed, "后")], "highlight");
  assert.equal(quoteBody(boxed), '<p>前</p><div class="doc-panel"><div class="doc-icon">💡</div><blockquote><p>引一</p><p>引二</p></blockquote><p>后</p></div>');

  // Into a highlight block across sections: the sections its blocks all leave go, as when they are deleted or moved.
  const sectionSource = `<main class="doc-page">\n  <p>页首段</p>\n  <section class="doc-section">\n    <h2>第一节</h2>\n    <p>节一段</p>\n  </section>\n  <section class="doc-section">\n    <h2>第二节</h2>\n    <p>节二段</p>\n  </section>\n</main>\n`;
  const sectionBody = (page) => {
    const result = saveAll(page, sectionSource);
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    return result.text.match(/<main[^>]*>([\s\S]*)<\/main>/)[1].replace(/\n\s*/g, "");
  };
  const across = openPage(sectionSource);
  convertGroup(["第一节", "节一段", "第二节", "节二段"].map((words) => text(across, words)), "highlight");
  assert.equal(sectionBody(across), '<p>页首段</p><section class="doc-section"><div class="doc-panel"><div class="doc-icon">💡</div><h2>第一节</h2><p>节一段</p><h2>第二节</h2><p>节二段</p></div></section>');
  const leading = openPage(sectionSource);
  convertGroup(["页首段", "第一节", "节一段"].map((words) => text(leading, words)), "highlight");
  assert.equal(sectionBody(leading), '<div class="doc-panel"><div class="doc-icon">💡</div><p>页首段</p><h2>第一节</h2><p>节一段</p></div><section class="doc-section"><h2>第二节</h2><p>节二段</p></section>');
  const foldedAcross = openPage(sectionSource);
  convertGroup(["第一节", "节一段", "第二节", "节二段"].map((words) => text(foldedAcross, words)), "details");
  assert.equal(sectionBody(foldedAcross), '<p>页首段</p><section class="doc-section"><details class="doc-details"><summary><span class="doc-details-summary-label"></span></summary><div class="doc-details-content"><h2>第一节</h2><p>节一段</p><h2>第二节</h2><p>节二段</p></div></details></section>', "into a disclosure too");
}

// One item holding blocks (or that held them in the file), from its block menu or the format bar
// (convert.mjs turnTargets): wherever it stands in its list, the first or not, it turns into another
// kind of list, a highlight block or a disclosure, what it holds going with it (a block turned
// keeps its children); from the middle of its list, the list split around it, a numbered
// list's items after it from 1 again, a flowchart's parts keeping its direction.
{
  const source = `<main class="doc-page">
  <ol start="3">
    <li>一</li>
    <li>二
      <ul>
        <li>二甲</li>
      </ul>
    </li>
    <li>三
      <p>三段</p>
    </li>
    <li>四</li>
  </ol>
  <ul class="doc-todo">
    <li>待一</li>
    <li data-checked>待二
      <ul>
        <li>待二甲</li>
      </ul>
    </li>
    <li>待三</li>
  </ul>
  <ol class="doc-flow" data-direction="column">
    <li><p><strong>甲步</strong></p></li>
    <li><p><strong>乙步</strong></p>
      <ol>
        <li>乙支</li>
      </ol>
    </li>
    <li><p><strong>丙步</strong></p></li>
  </ol>
</main>
`;
  const text = (page, words) => [...page.document.querySelectorAll("[contenteditable]")].find((node) => node.textContent.trim().startsWith(words));
  const body = (page) => {
    const result = saveAll(page, source);
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    return result.text.match(/<main[^>]*>([\s\S]*)<\/main>/)[1].replace(/\n\s*/g, "");
  };
  const HELD = TURN_INTO.filter((type) => ["bullets", "numbers", "todo", "flowchart", "details", "highlight", "callout"].includes(type));
  const page = openPage(source);
  for (const words of ["二", "三", "待二"]) {
    assert.deepEqual(targetsOf(text(page, words)), [], `${words}: no type of its own for a text block (it stays an item)`);
    assert.deepEqual(turnTargets(text(page, words)), HELD, `${words}: another kind of list, a disclosure, a highlight block or a callout, in the middle of its list too`);
  }
  assert.deepEqual(turnTargets(text(page, "一")), targetsOf(text(page, "一")), "an item holding nothing: its targets");
  const first = openPage(source.replace("<li>一</li>", "<li>一\n      <p>一段</p>\n    </li>"));
  assert.deepEqual(turnTargets(text(first, "一")), HELD, "the first item holding blocks the same");

  // A middle item of a numbered list into bullets: the list split around it, its list with it.
  const numbered = openPage(source);
  const second = text(numbered, "二");
  assert.equal(convertBlock(second, "bullets").focus, second, "the item itself goes (its element and what it holds)");
  assert.ok(body(numbered).startsWith('<ol start="3"><li>一</li></ol><ul><li>二<ul><li>二甲</li></ul></li></ul><ol><li>三<p>三段</p></li><li>四</li></ol><ul class="doc-todo">'), body(numbered));
  // One holding a paragraph into a flowchart: a flowchart of one step between the parts.
  const flowed = openPage(source);
  convertBlock(text(flowed, "三"), "flowchart");
  assert.ok(body(flowed).startsWith('<ol start="3"><li>一</li><li>二<ul><li>二甲</li></ul></li></ol><ol class="doc-flow"><li><p><strong>三</strong></p><p>三段</p></li></ol><ol><li>四</li></ol>'), body(flowed));
  // A to-do's middle item into a numbered list (its check kept on the item, as the kit reads it only on a to-do).
  const todo = openPage(source);
  convertBlock(text(todo, "待二"), "numbers");
  assert.ok(body(todo).includes('<ul class="doc-todo"><li>待一</li></ul><ol><li data-checked>待二<ul><li>待二甲</li></ul></li></ol><ul class="doc-todo"><li>待三</li></ul>'), body(todo));
  // A flowchart's middle step into a to-do list: both parts keep its direction; its title's words the
  // item's (no type of its own for the title, which is turned into nothing).
  const steps = openPage(source);
  const middleStep = steps.document.querySelectorAll("ol.doc-flow > li")[1];
  assert.deepEqual([targetsOf(text(steps, "乙步")), turnTargets(text(steps, "乙步")), stepTargets(middleStep)], [[], [], ["bullets", "numbers", "todo", "flowchart", "highlight"]]);
  convertStep(middleStep, "todo");
  assert.ok(body(steps).endsWith('<ol class="doc-flow" data-direction="column"><li><p><strong>甲步</strong></p></li></ol><ul class="doc-todo"><li>乙步<ol><li>乙支</li></ol></li></ul><ol class="doc-flow" data-direction="column"><li><p><strong>丙步</strong></p></li></ol>'), body(steps));
  // Into a highlight block: its blocks as they are (its title bold still). A highlight block into a
  // flowchart: one node of its blocks, its icon in the number's place, an empty title made before a
  // heading (a node's first block is always a paragraph), its background the node's.
  const boxed = openPage(source);
  convertStep(boxed.document.querySelectorAll("ol.doc-flow > li")[1], "highlight");
  assert.ok(body(boxed).endsWith('<ol class="doc-flow" data-direction="column"><li><p><strong>甲步</strong></p></li></ol><div class="doc-panel"><p><strong>乙步</strong></p><ol><li>乙支</li></ol></div><ol class="doc-flow" data-direction="column"><li><p><strong>丙步</strong></p></li></ol>'), body(boxed));
  // A colored node holding content keeps its color in the file whatever it becomes: an item holding
  // its content (its background or text color the item's), a highlight block (its background; a
  // highlight block takes no text color).
  const coloredSource = source.replace("<li><p><strong>乙步</strong></p>", '<li class="doc-highlight-blue doc-text-red"><p><strong>乙步</strong></p>');
  const coloredBody = (page) => {
    const result = saveAll(page, coloredSource);
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    return result.text.match(/<main[^>]*>([\s\S]*)<\/main>/)[1].replace(/\n\s*/g, "");
  };
  const toItem = openPage(coloredSource);
  convertStep(toItem.document.querySelectorAll("ol.doc-flow > li")[1], "numbers");
  assert.ok(coloredBody(toItem).includes('</ol><ol><li class="doc-text-red doc-highlight-blue">乙步<ol><li>乙支</li></ol></li></ol><ol class="doc-flow"'), coloredBody(toItem));
  const toPanel = openPage(coloredSource);
  convertStep(toPanel.document.querySelectorAll("ol.doc-flow > li")[1], "highlight");
  assert.ok(coloredBody(toPanel).includes('</ol><div class="doc-panel doc-highlight-blue"><p><strong>乙步</strong></p><ol><li>乙支</li></ol></div><ol class="doc-flow"'), coloredBody(toPanel));
  const panelSource = '<main class="doc-page">\n  <div class="doc-panel doc-highlight-blue"><div class="doc-icon">📮</div><h3>标题</h3><p>正文</p></div>\n</main>\n';
  const fromPanel = openPage(panelSource);
  assert.ok(containerTargets(fromPanel.document.querySelector(".doc-panel")).includes("flowchart"));
  convertContainer(fromPanel.document.querySelector(".doc-panel"), "flowchart");
  const panelResult = saveAll(fromPanel, panelSource);
  assert.ok(panelResult.ok, JSON.stringify(panelResult.conflicts));
  assert.equal(panelResult.text.replace(/\n\s*/g, ""), '<main class="doc-page"><ol class="doc-flow"><li class="doc-highlight-blue"><div class="doc-icon">📮</div><p></p><h3>标题</h3><p>正文</p></li></ol></main>');
  // Into a highlight block: in a list of its kind there, as it is.
  const panel = openPage(source);
  convertBlock(text(panel, "二"), "highlight");
  assert.ok(body(panel).startsWith('<ol start="3"><li>一</li></ol><div class="doc-panel"><div class="doc-icon">💡</div><ol><li>二<ul><li>二甲</li></ul></li></ol></div><ol><li>三'), body(panel));
  // A nested item holding blocks: its own list split the same way, inside the item holding it.
  const nested = openPage(`<main class="doc-page">
  <ul>
    <li>外
      <ol>
        <li>内一</li>
        <li>内二
          <p>内二段</p>
        </li>
        <li>内三</li>
      </ol>
    </li>
  </ul>
</main>
`);
  assert.deepEqual(turnTargets(text(nested, "内二")), HELD);
  convertBlock(text(nested, "内二"), "bullets");
  const nestedSaved = saveAll(nested, `<main class="doc-page">
  <ul>
    <li>外
      <ol>
        <li>内一</li>
        <li>内二
          <p>内二段</p>
        </li>
        <li>内三</li>
      </ol>
    </li>
  </ul>
</main>
`);
  assert.ok(nestedSaved.ok && nestedSaved.text.replace(/\n\s*/g, "").includes("<ul><li>外<ol><li>内一</li></ol><ul><li>内二<p>内二段</p></li></ul><ol><li>内三</li></ol></li></ul>"), nestedSaved.text);
}

// One item (or a quote's paragraph) turned into a highlight block goes in as it is, in a list (quote)
// of its kind: one block is turned by the same rule as several.
{
  const source = `<main class="doc-page">\n  <ul>\n    <li>甲</li>\n    <li>乙</li>\n    <li>丙</li>\n  </ul>\n  <blockquote>\n    <p>引</p>\n  </blockquote>\n</main>\n`;
  const text = (page, words) => [...page.document.querySelectorAll("[contenteditable]")].find((node) => node.textContent.trim().startsWith(words));
  const body = (page) => {
    const result = saveAll(page, source);
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    return result.text.match(/<main[^>]*>([\s\S]*)<\/main>/)[1].replace(/\n\s*/g, "");
  };
  const page = openPage(source);
  const item = text(page, "乙");
  assert.equal(convertBlock(item, "highlight").focus, item, "the item itself");
  assert.equal(body(page), '<ul><li>甲</li></ul><div class="doc-panel"><div class="doc-icon">💡</div><ul><li>乙</li></ul></div><ul><li>丙</li></ul><blockquote><p>引</p></blockquote>');
  const quoted = openPage(source);
  convertBlock(text(quoted, "引"), "highlight");
  assert.ok(body(quoted).endsWith('<div class="doc-panel"><div class="doc-icon">💡</div><blockquote><p>引</p></blockquote></div>'), body(quoted));
  // The same into a disclosure: in its content, its title empty and the caret's.
  const folded = openPage(source);
  const title = convertBlock(text(folded, "乙"), "details").focus;
  assert.ok(title.matches(".doc-details-summary-label") && title.textContent === "", "the caret in its empty title");
  assert.equal(body(folded), '<ul><li>甲</li></ul><details class="doc-details"><summary><span class="doc-details-summary-label"></span></summary><div class="doc-details-content"><ul><li>乙</li></ul></div></details><ul><li>丙</li></ul><blockquote><p>引</p></blockquote>');
  const foldedQuote = openPage(source);
  convertBlock(text(foldedQuote, "引"), "details");
  assert.ok(body(foldedQuote).endsWith('<details class="doc-details"><summary><span class="doc-details-summary-label"></span></summary><div class="doc-details-content"><blockquote><p>引</p></blockquote></div></details>'), body(foldedQuote));
}

// A checked item the file writes with a value (data-checked="true": the kit reads it as present) is
// sent as the bare attribute the file takes when the page writes it again (an item turned back by
// undo, the element the file had); a conversion the file refuses takes its move with it (never a
// paragraph in a list).
{
  const source = `<main class="doc-page">\n  <p>前</p>\n  <ul class="doc-todo">\n    <li data-checked="true">甲</li>\n    <li>丙</li>\n  </ul>\n</main>\n`;
  const page = openPage(source);
  const item = convertBlock([...page.document.querySelectorAll("[contenteditable]")].find((node) => node.textContent === "前"), "todo").focus;
  item.setAttribute("data-checked", "true");
  assert.deepEqual(changes(page).units[0].replace, { type: "item", html: "前", attributes: { "data-checked": "" } });
  const turned = saveAll(page, source);
  assert.ok(turned.ok && turned.text.includes('<ul class="doc-todo">\n    <li data-checked>前</li>\n    <li data-checked="true">甲</li>'), JSON.stringify(turned.conflicts ?? turned.text));
  const fresh = newHost(page.document, "item");
  fresh.setAttribute("data-checked", "true");
  fresh.textContent = "新";
  assert.deepEqual(nodeOf(fresh).attributes, { "data-checked": "" });
  const { units } = findUnits(source);
  const first = units.find((unit) => unit.kind === "paragraph");
  const [, third] = units.filter((unit) => unit.kind === "item");
  const refused = applyEdits({ current: source, edits: [], partial: true, units: [{ id: first.id, replace: { type: "item", html: "前", attributes: { "data-checked": "yes" } } }, { id: first.id, move: { before: third.id } }] });
  assert.deepEqual(refused.conflicts.map((entry) => entry.reason), ["invalid", "position"], JSON.stringify(refused.conflicts));
  assert.equal(refused.text, source, "nothing written: the paragraph stays out of the list");
}

// Nested lists. A list item holding lists after its text (<li>text<ul>…</ul></li>) is a text block
// of its own, its text only, and a box ("nest") for the lists it holds, which are units with items
// of their own. Tab puts an item under the one before it (at the end of that item's last list, or
// in a new list of its own kind), Shift+Tab takes it back out right after the item it hung from,
// the items after it becoming its own; Enter after an item's text opens its first list; the line
// above an item may be deep inside the item before it.
{
  const source = `<main class="doc-page">
  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">一</h2>
    <ul>
      <li>甲</li>
      <li>乙
        <ul>
          <li>乙一</li>
          <li>乙二</li>
        </ul>
      </li>
      <li>丙</li>
    </ul>
    <p>正文</p>
  </section>
  <footer>页脚</footer>
</main>
`;
  const item = (page, words) => [...page.document.querySelectorAll("li[contenteditable]")].find((node) => ownHTML(node).startsWith(words));
  const saved = (page) => {
    const result = saveAll(page, source);
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    return result.text;
  };

  // The source: the item's text ends before its list (without the line break ahead of it).
  const blocks = findBlocks(source);
  const parent = blocks.find((block) => source.slice(block.innerStart, block.innerEnd) === "乙");
  assert.ok(parent?.nested, "the text of an item holding a list is a block");
  const { units, boxes } = findUnits(source);
  const holder = units.find((unit) => unit.id === parent.self);
  assert.equal(holder.nested, true);
  const nest = boxes.find((box) => box.kind === "nest" && box.unit === holder.id);
  assert.deepEqual(units.filter((unit) => unit.box === nest.id).map((unit) => unit.kind), ["list"], "its list is a unit of its own box");
  assert.deepEqual(applyEdits({ current: source, edits: [{ id: parent.id, parts: [] }] }).conflicts.map((entry) => entry.reason), ["fixed"], "its text never goes alone");
  assert.deepEqual(applyEdits({ current: source, edits: [], units: [{ id: holder.id, replace: { type: "paragraph", html: "乙" } }] }).conflicts.map((entry) => entry.reason), ["invalid"], "nor does it turn into another type");

  // On the page: its text, snapshots and caret positions leave the list alone.
  {
    const page = openPage(source);
    const second = item(page, "乙");
    assert.equal(serializeInner(second), "乙");
    assert.equal(nestedLists(second)[0].getAttribute("contenteditable"), "false", "the list is not part of the item's text");
    assert.equal(textEnd(second), 1);
    assert.equal(ownHTML(second), "乙");
    setOwnHTML(second, "乙<strong>（改）</strong>");
    assert.equal(nestedLists(second).length, 1);
    assert.deepEqual(targetsOf(second), [], "an item holding a list stays an item");
    assert.equal(saved(page), source.replace("<li>乙\n", "<li>乙<strong>（改）</strong>\n"));
    assert.equal(parentItem(item(page, "乙一")), second);
    assert.equal(parentItem(second), null);
    assert.ok(["paragraph", "bullets", "numbers", "todo"].every((type) => targetsOf(item(page, "乙一")).includes(type)), "a nested item turns into any kind of list, or a block the item above may hold (a paragraph under it)");
  }

  // Tab: the item goes to the end of the list of the item above; the first item stays.
  {
    const page = openPage(source);
    assert.equal(canNest(item(page, "甲"), 1), false);
    assert.equal(indentItem(item(page, "丙")).focus, item(page, "丙"));
    assert.equal(saved(page), source.replace("      <li>丙</li>\n", "").replace("          <li>乙二</li>\n", "          <li>乙二</li>\n          <li>丙</li>\n"));
  }
  // …or into a new list of its own kind, on lines of its own when the item above sat on one line.
  {
    const page = openPage(source);
    const { created } = indentItem(item(page, "乙"));
    assert.equal(created.length, 1);
    assert.equal(created[0].localName, "ul");
    assert.equal(saved(page), source.replace(`      <li>甲</li>
      <li>乙
        <ul>
          <li>乙一</li>
          <li>乙二</li>
        </ul>
      </li>`, `      <li>甲
        <ul>
          <li>乙
            <ul>
              <li>乙一</li>
              <li>乙二</li>
            </ul>
          </li>
        </ul>
      </li>`));
  }
  // Shift+Tab: back out right after the item it hung from; the items after it become its own, and
  // the list it leaves empty goes.
  {
    const page = openPage(source);
    const first = item(page, "乙一");
    assert.equal(canNest(item(page, "丙"), -1), false, "a top-level item stays");
    outdentItem(first);
    assert.equal(first.previousElementSibling, item(page, "乙"));
    assert.equal(nestedLists(item(page, "乙")).length, 0, "the emptied list went");
    assert.equal(saved(page), source.replace(`      <li>乙
        <ul>
          <li>乙一</li>
          <li>乙二</li>
        </ul>
      </li>`, `      <li>乙</li>
      <li>乙一
        <ul>
          <li>乙二</li>
        </ul>
      </li>`), "the item it left keeps its text alone, its end tag back on its line");
  }
  // Tab and Shift+Tab undo each other on the page.
  {
    const page = openPage(source);
    const last = item(page, "乙二");
    outdentItem(last);
    indentItem(last);
    assert.equal(saved(page), source, "back in its place");
  }

  // Enter after an item's text: the new item opens its first list; before it, it goes before it.
  {
    const page = openPage(source);
    const second = item(page, "乙");
    const at = page.document.createRange();
    at.setStart(second, textEnd(second));
    const next = splitBlock(second, at);
    assert.equal(next.parentElement, nestedLists(second)[0]);
    assert.equal(next.nextElementSibling, item(page, "乙一"));
    next.textContent = "新";
    assert.equal(saved(page), source.replace("          <li>乙一</li>\n", "          <li>新</li>\n          <li>乙一</li>\n"));
  }
  // Enter's own split (`carry`, typing/): the new
  // item goes right after the item and takes all it held; in the middle of the item's text the words
  // after the caret go with it, at its end the new item has no text over the list (keepLine).
  for (const [words, offset, head, tail] of [["乙戊", 1, "乙", "戊"], ["乙", 1, "乙", ""]]) {
    const own = source.replace("<li>乙\n", `<li>${words}\n`);
    const page = openPage(own);
    const second = item(page, words);
    const list = nestedLists(second)[0];
    const at = page.document.createRange();
    at.setStart(second.firstChild, offset);
    const next = splitBlock(second, at, { carry: true });
    assert.equal(next.previousElementSibling, second, "the new item right after the item");
    assert.equal(nestedBlocks(second).length, 0, "the item holds nothing any more");
    assert.equal(nestedLists(next)[0], list, "the new item holds its list");
    assert.equal(ownHTML(second).trim(), head);
    assert.equal(ownHTML(next).replace(/<br[^>]*>/g, "").trim(), tail);
    const result = applyEdits({ current: own, ...changes(page) });
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    const written = result.text.replace(/\s+/g, " ");
    assert.ok(written.includes(`<li>${head}</li> <li>${tail} <ul> <li>乙一</li> <li>乙二</li> </ul> </li> <li>丙</li>`), result.text);
  }
  // Structure no text block's words hold (strayIn): what the user's page had once a split took a
  // paragraph's tail with an item and its list (p > li > ul > li). Enter does not split there
  // (splitsAt), the block is found (strayHosts) and held back, never written emptied, and nothing is
  // committed while it stands; a block of the page's own as it should be is none.
  {
    const page = openPage(source);
    const second = item(page, "乙");
    const nested = item(page, "乙一");
    assert.deepEqual([strayIn(second), strayIn(nested), strayHosts(page.document)], [null, null, []], "an item holding its list, and the page, hold none");
    const inner = page.document.createRange();
    inner.setStart(nested.firstChild, 1);
    assert.equal(splitsAt(nested, inner), true, "in an item's own words: a split");
    assert.equal(splitsAt(second, inner), false, "in a list the item holds: none of its own");
    const paragraph = page.document.querySelector("main p");
    const lost = page.document.createElement("li");
    lost.innerHTML = "失<ul><li>落的字</li></ul>";
    paragraph.append(lost);
    assert.equal(strayIn(paragraph), lost, "an item in a paragraph's words");
    assert.equal(serializeInner(paragraph), "正文失", "which the paragraph's source would not hold: its list's words go");
    const deep = page.document.createRange();
    deep.setStart(lost.querySelector("li").firstChild, 1);
    assert.equal(splitsAt(paragraph, deep), false, "Enter there splits nothing");
    assert.deepEqual(strayHosts(page.document), [paragraph]);
    const collected = collectEdits(page.document, page.baselines, page.layout);
    assert.deepEqual([collected.strays, collected.blank.includes(paragraph), collected.edits.some((edit) => edit.id === Number(paragraph.getAttribute("data-ge-block")))], [[paragraph], true, false], "held back, not written");
    lost.remove();
    // A division the browser's own Enter put in an item (its words after the item's text, no block of the page's).
    const division = page.document.createElement("div");
    division.textContent = "乙一的后半";
    nested.append(division);
    assert.equal(strayIn(nested), division);
    assert.deepEqual(collectEdits(page.document, page.baselines, page.layout).strays, [nested]);
    division.remove();
    assert.deepEqual(collectEdits(page.document, page.baselines, page.layout).strays, [], "gone again: nothing held");
  }
  // The line above an item may be deep inside the item before it.
  {
    const page = openPage(source);
    const third = item(page, "丙");
    assert.equal(previousLine(third), item(page, "乙二"));
    assert.equal(mergeWithPrevious(third), item(page, "乙二"));
    assert.equal(saved(page), source.replace("<li>乙二</li>", "<li>乙二丙</li>").replace("      <li>丙</li>\n", ""));
  }
  // Numbered lists (components/list/numbers.mjs): numbers as a depth writes them, typed back; the
  // numbers of a list (an item's value counting on); a list counting on from the numbered list
  // before it, other blocks between skipped, its start kept in step in page order.
  {
    assert.deepEqual([1, 26, 27, 52, 703].map((n) => formatNumber(n, "lower-alpha")), ["a", "z", "aa", "az", "aaa"]);
    assert.deepEqual([1, 4, 9, 14, 40, 1994, 4000].map((n) => formatNumber(n, "lower-roman")), ["i", "iv", "ix", "xiv", "xl", "mcmxciv", "4000"]);
    assert.deepEqual([["c", "lower-alpha"], ["AA", "lower-alpha"], ["xiv", "lower-roman"], ["12", "lower-roman"], ["x", "decimal"]].map(([text, format]) => parseNumber(text, format)), [3, 27, 14, 12, Number.NaN]);
    assert.deepEqual(["3. ", "12） ", "0. ", "- "].map((text) => markdownShortcut(text)?.props.number ?? null), [3, 12, null, null]);
    const { document } = new JSDOM(`<main><ol start="3"><li>a</li><li value="9">b</li><li>c</li></ol><p>x</p><ul><li>d</li></ul><ol data-continue><li>e</li></ol><ol data-continue start="2"><li>f</li></ol></main>`).window;
    const [first, second, third] = document.querySelectorAll("ol");
    assert.deepEqual(numbersOf(first), [3, 9, 10]);
    assert.equal(continuation(second), 11);
    assert.equal(keepContinuing(document.querySelector("main")), true);
    assert.deepEqual([second.getAttribute("start"), third.getAttribute("start")], ["11", "12"]);
    assert.equal(keepContinuing(document.querySelector("main")), false, "in step, nothing to change");
    // Written: a new numbered list with its start and counting on; an original one's set or removed in its start tag.
    const flat = `<main class="doc-page">\n    <p>段</p>\n    <ol>\n      <li>一</li>\n    </ol>\n  </main>`;
    const units = findUnits(flat).units;
    const paragraph = units.find((unit) => unit.kind === "paragraph");
    const list = units.find((unit) => unit.kind === "list");
    const made = applyEdits({ current: flat, edits: [], units: [{ id: "n0", insert: { type: "numbers", start: "4", continue: true, children: [{ type: "item", html: "新" }] }, place: { after: paragraph.id } }] });
    assert.ok(made.ok && /<ol start="4" data-continue>\s*<li>新<\/li>\s*<\/ol>/.test(made.text), made.text);
    assert.deepEqual(applyEdits({ current: flat, edits: [], units: [{ id: "n0", insert: { type: "numbers", start: "0", children: [{ type: "item", html: "新" }] }, place: { after: paragraph.id } }] }).conflicts.map((entry) => entry.reason), ["invalid"], "a start is from 1");
    const set = applyEdits({ current: flat, edits: [], units: [{ id: list.id, attribute: "data-continue", value: "" }, { id: list.id, attribute: "start", value: "2" }] });
    assert.equal(set.text, flat.replace("<ol>", "<ol data-continue start=\"2\">"));
    assert.equal(applyEdits({ current: set.text, edits: [], units: [{ id: list.id, attribute: "data-continue", value: null }, { id: list.id, attribute: "start", value: null }] }).text, flat);
  }
  // An item holding lists joins the line above with them (Backspace at its start, Delete at that line's end):
  // they go under that line, as deep as they were.
  {
    const page = openPage(source);
    const first = item(page, "甲");
    assert.equal(mergeWithPrevious(item(page, "乙")), first);
    assert.deepEqual(nestedLists(first).map((list) => [...list.children].map((entry) => entry.textContent.trim())), [["乙一", "乙二"]]);
    assert.match(saved(page), /<li>甲乙\s*<ul>\s*<li>乙一<\/li>\s*<li>乙二<\/li>\s*<\/ul>\s*<\/li>\s*<li>丙<\/li>/);
  }
  // Above a first nested item is the item its list hangs from: Delete at the end of an item's text
  // joins its first item to it, and a list left empty goes.
  {
    const single = source.replace("          <li>乙二</li>\n", "");
    const page = openPage(single);
    const child = item(page, "乙一");
    assert.equal(previousLine(child), item(page, "乙"));
    assert.equal(mergeWithPrevious(child), item(page, "乙"));
    assert.equal(nestedLists(item(page, "乙")).length, 0);
    const result = saveAll(page, single);
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    assert.equal(result.text, single.replace("<li>乙\n        <ul>\n          <li>乙一</li>\n        </ul>\n      </li>", "<li>乙乙一</li>"), "the item's end tag back on its line: its text is what it says");
  }
  // A block right after a list: the line above it is the list's last item (at any depth), and
  // Backspace at its start joins its text to that item; Delete at the end of
  // that item does the same.
  {
    const paragraph = (page) => [...page.document.querySelectorAll("p[contenteditable]")].find((node) => node.textContent === "正文");
    const page = openPage(source);
    assert.equal(previousLine(paragraph(page)), item(page, "丙"));
    assert.equal(mergeWithPrevious(paragraph(page)), item(page, "丙"));
    assert.match(saved(page), /<li>丙正文<\/li>\n\s*<\/ul>\n\s*<\/section>/, "its text at the end of the last item");
    const deep = source.replace("      <li>丙</li>\n", "");
    const nested = openPage(deep);
    assert.equal(previousLine(paragraph(nested)), item(nested, "乙二"), "the last item at its depth");
    assert.equal(mergeWithPrevious(paragraph(nested)), item(nested, "乙二"));
    const deepResult = saveAll(nested, deep);
    assert.ok(deepResult.ok, JSON.stringify(deepResult.conflicts));
    assert.match(deepResult.text, /<li>乙二正文<\/li>\n\s*<\/ul>\n\s*<\/li>\n\s*<\/ul>\n\s*<\/section>/);
    const forward = openPage(deep);
    assert.equal(nextLine(item(forward, "乙二")), paragraph(forward), "below the last item: the block after the list");
    assert.equal(nextLine(item(forward, "乙一")), item(forward, "乙二"));
    assert.equal(nextLine(item(forward, "乙")), item(forward, "乙一"));
  }
  // An item holding lists is written emptied, its lists under it, as an item keeps its
  // title line however empty: on the page a line break ahead of them is that line, which its text
  // leaves out, and so it has when the page opens on it; typed in again, its words go before them. A
  // new one with lists is written whole, emptied too.
  {
    const page = openPage(source);
    const held = item(page, "乙");
    setOwnHTML(held, "");
    assert.deepEqual([...held.childNodes].map((node) => node.nodeName), ["BR", "UL"], "its line, the line break the page keeps there");
    assert.equal(collectEdits(page.document, page.baselines, page.layout).blank.length, 0, "nothing to finish");
    const emptied = saved(page);
    assert.equal(emptied, source.replace("<li>乙\n", "<li>\n"), "written with no text, its list under it");
    const again = openPage(emptied);
    const shown = [...again.document.querySelectorAll("li[contenteditable]")].find((node) => node.querySelector("ul"));
    assert.deepEqual([...shown.childNodes].map((node) => node.nodeName), ["BR", "UL"], "opened on it, the page gives it its line");
    assert.equal(serializeInner(shown), "", "which is no text of its");
    shown.insertBefore(again.document.createTextNode("乙改"), shown.firstChild);
    const typed = saveAll(again, emptied);
    assert.ok(typed.ok, JSON.stringify(typed.conflicts));
    assert.equal(typed.text, source.replace("<li>乙\n", "<li>乙改\n"), "typed in again, its words before its list");
  }
  // The page gives an item its line by the kit's rule (keepsLine, src/shared/components/list.mjs), its
  // line break the kit's (doc-item-line), which an export of the view takes off: an item of a list the
  // kit draws the markers of over a paragraph, an empty bold before it no text; never an item of a
  // widget's list (its grid's first cell its first child) or of a list with a class of its own.
  {
    const page = openPage(`<main class="doc-page">
  <header class="doc-header"><h1 class="doc-title">题</h1></header>
  <ul>
    <li><p>段落</p></li>
    <li><strong></strong><p>空粗体后的段落</p></li>
  </ul>
  <div class="my-widget"><ol class="timeline"><li><div class="time">2026-01</div><div class="what">立项</div></li></ol></div>
  <ul class="steps"><li><p>类列表的段落</p></li></ul>
</main>`);
    const shape = (item) => [...item.childNodes].map((node) => node.nodeName === "BR" ? `BR.${node.className}` : node.nodeName).join(",");
    const items = [...page.document.querySelectorAll("li")];
    assert.deepEqual(items.map(shape), ["BR.doc-item-line,P", "STRONG,BR.doc-item-line,P", "DIV,DIV", "P"], "a line where the kit gives one, the kit's line break; none in a widget or a list of its own class");
    assert.deepEqual(items.map(serializeInner), ["", "", "", ""], "none of it text");
    // An item's offsets count its own text alone, never the words of a block it holds: the caret a
    // step puts back (Tab, Shift+Tab) at offset 0 of an item of no text stands on its line, ahead of its
    // line break, and at the end of an item's words before the paragraph it holds, not in it.
    const [empty] = items;
    assert.deepEqual([rangeAt(empty, [0, 0]).startContainer, rangeAt(empty, [0, 0]).startOffset], [empty, 0], "an item of no text: on its line");
    const worded = openPage(`<main class="doc-page">\n  <ul>\n    <li>甲\n      <p>乙</p>\n    </li>\n  </ul>\n</main>`).document.querySelector("li");
    const end = rangeAt(worded, [1, 1]);
    assert.ok(!worded.querySelector("p").contains(end.startContainer), "the end of an item's words: before the paragraph it holds");
  }
  {
    const page = openPage(source);
    const third = item(page, "丙");
    const at = page.document.createRange();
    at.selectNodeContents(third);
    at.collapse(false);
    const fresh = splitBlock(third, at);
    const sub = newHost(page.document, "item");
    sub.textContent = "丁一";
    const list = newContainer(page.document, "numbers");
    list.append(sub);
    fresh.append(list);
    assert.equal(collectEdits(page.document, page.baselines, page.layout).blank.length, 0, "a new item with no text over its list is no block to finish");
    assert.equal(saved(page), source.replace("      <li>丙</li>\n", "      <li>丙</li>\n      <li>\n        <ol>\n          <li>丁一</li>\n        </ol>\n      </li>\n"));
  }
  // What an item holding blocks says when it does not go by itself (Delete in it emptied) or join the
  // line above: its items (子项) where it holds lists of items alone, its content (内容) where any block
  // it holds is another (a paragraph, a divider, a flowchart, whose steps are no items, an instance).
  {
    const page = openPage(source);
    const held = (html) => {
      const item = page.document.createElement("li");
      item.innerHTML = html;
      return nestedBlocks(item);
    };
    assert.equal(holdsSays(held("<ul><li>甲</li></ul><ol><li>乙</li></ol>")), "这一项下面还有子项；要连同子项一起删除，点左侧的手柄后按 Delete。");
    assert.equal(mergeSays(held('<ul class="doc-todo"><li>甲</li></ul>')), "这一项下面还有子项，不能并入上一项。");
    for (const html of ["<p>段</p>", "<ul><li>甲</li></ul><p>段</p>", "<hr>", '<ol class="doc-flow"><li><p>节点</p></li></ol>', '<div class="board" data-doc-component="local/board"><h3>板</h3></div>']) {
      assert.equal(holdsSays(held(html)), "这一项下面还有内容；要连同这些内容一起删除，点左侧的手柄后按 Delete。", html);
      assert.equal(mergeSays(held(html)), "这一项下面还有内容，不能并入上一项。", html);
    }
  }
  {
    const page = openPage(source);
    const third = item(page, "丙");
    const at = page.document.createRange();
    at.selectNodeContents(third);
    at.collapse(false);
    const fresh = splitBlock(third, at);
    fresh.textContent = "丁";
    const sub = newHost(page.document, "item");
    sub.textContent = "丁一";
    const list = newContainer(page.document, "numbers");
    list.append(sub);
    fresh.append(list);
    assert.equal(saved(page), source.replace("      <li>丙</li>\n", "      <li>丙</li>\n      <li>丁\n        <ol>\n          <li>丁一</li>\n        </ol>\n      </li>\n"));
  }
}

// Small text (小字, .doc-note), callouts (提示块), a code block's language (guessed from its code
// for one made on the page, saved as data-language) and detail cards: the selected text becomes a
// link to a new card, which goes at the end of the report with its title and blocks, in the kit's
// markup; a card no link opens is not written.
{
  const source = `<main class="doc-page">
  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">一</h2>
    <p>第一段</p>
    <p>第二段</p>
    <p>const total = 1;</p>
  </section>
  <footer>页脚</footer>
</main>
`;
  const text = (page, words) => [...page.document.querySelectorAll("[contenteditable]")].find((node) => node.textContent.includes(words));
  const saved = (page) => {
    const result = saveAll(page, source);
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    return result.text;
  };
  {
    const page = openPage(source);
    const note = convertBlock(text(page, "第一段"), "note").focus;
    assert.equal(typeOf(note), "note");
    assert.equal(typeOf(convertBlock(note, "paragraph").focus), "paragraph");
    convertBlock(text(page, "第一段"), "note");
    convertBlock(text(page, "第二段"), "callout");
    // Its language is the one it looks like (自动识别, the kit's guess) until the reader picks one: none written.
    const code = convertBlock(text(page, "const total"), "code").focus;
    assert.equal(code.closest(".doc-code").getAttribute("data-language"), null);
    assert.equal(saved(page), source
      .replace("<p>第一段</p>", '<p class="doc-note">第一段</p>')
      .replace("<p>第二段</p>", '<div class="doc-callout">\n      <p>第二段</p>\n    </div>')
      .replace("<p>const total = 1;</p>", '<div class="doc-code"><div class="doc-code-title"></div><pre><code>const total = 1;</code></pre></div>'));
  }
  {
    // The block types' places are their descriptions' own (registry.mjs: turn, fresh, menu): the "/"
    // menu's groups hold exactly the types a block can be turned into or made as an empty one, the
    // block menu's 在下方新建 and the "/" menu in an empty block (belowTargets, typedTargets) list the
    // same types, in a flow every one of them, and convertBlock makes each.
    const everyType = [...new Set([...TURN_INTO, ...FRESH])];
    assert.deepEqual([...MENU_GROUPS.basic, ...MENU_GROUPS.advanced].sort(), [...everyType].sort(), "the menu shows what can be made, and only that");
    const flowTypes = everyType.filter((type) => type !== "sheets"); // a Sheet area stands in the page only
    const probe = openPage(source);
    const host = text(probe, "第一段");
    assert.deepEqual(belowTargets(host).sort(), flowTypes.sort(), "below a paragraph in a section, every type but a Sheet area");
    host.textContent = "";
    assert.deepEqual(typedTargets(host, true).sort(), flowTypes.sort(), "typed into an empty block, the same");
    assert.ok(!typedTargets(host, false).some((type) => !TURN_INTO.includes(type)), "with other text in the block, only the types it is turned into");
    const inPage = openPage('<main class="doc-page"><p>根段</p></main>');
    assert.deepEqual(belowTargets(text(inPage, "根段")).sort(), [...everyType].sort(), "below a paragraph in the page, every type");
    for (const type of everyType.filter((type) => type !== "paragraph")) {
      const page = type === "sheets" ? openPage('<main class="doc-page"><p>第一段</p></main>') : openPage(source);
      const target = text(page, "第一段");
      target.textContent = "";
      const view = page.document.defaultView; // a formula block puts its style in the page it is made on, a table measures it
      const saved = { document: globalThis.document, getComputedStyle: globalThis.getComputedStyle };
      Object.assign(globalThis, { document: page.document, getComputedStyle: (node) => view.getComputedStyle(node) });
      let focus;
      let created;
      try {
        ({ focus, created } = convertBlock(target, type));
      } finally {
        for (const [name, value] of Object.entries(saved)) {
          if (value === undefined) delete globalThis[name];
          else globalThis[name] = value;
        }
      }
      assert.ok(focus !== null || type === "sheets" || created.length > 0, `${type} is made`);
      assert.ok(page.document.querySelector(`[data-ge-type="${type}"]`), `${type} stands where the empty block stood`);
    }
  }
  {
    // The units that go with a collect are handed to whoever asks, not remembered by the module: a unit
    // of the file named in `emptied` is written as nothing and placed nowhere, one not named is written
    // as itself (collectEdits finds the set; model seed 5139's emptied item), whatever was asked before.
    const page = openPage(source);
    const unit = text(page, "第一段");
    assert.deepEqual(nodeOf(unit, new WeakSet()), { unit: Number(unit.getAttribute("data-ge-unit")) });
    assert.equal(nodeOf(unit, new WeakSet([unit])), null, "a unit that goes is written as nothing");
    // Asked again with another set, it answers by that set: nothing is left over from an earlier ask.
    assert.deepEqual(nodeOf(unit, new WeakSet()), { unit: Number(unit.getAttribute("data-ge-unit")) });
  }
  {
    // A header's small-text line is small text like any (paragraph/index.mjs isNote): shown as 小字, turned
    // into 文本 as a block that stops being one (not left as it is), and its Tab's end part is written
    // like small text's.
    const withSource = source.replace('<main class="doc-page">\n', '<main class="doc-page">\n  <header class="doc-header"><h1 class="doc-title">T</h1><p class="doc-note">来源：某数据集</p></header>\n');
    const page = openPage(withSource);
    const line = text(page, "来源");
    assert.equal(typeOf(line), "note");
    assert.ok(targetsOf(line).includes("paragraph"), "a header's small-text line can become text");
    const plain = convertBlock(line, "paragraph").focus;
    assert.equal(plain.localName, "p");
    assert.ok(!plain.classList.contains("doc-note") && typeOf(plain) === "paragraph", "it stops being small text");
    const tabbed = page.document.createElement("p");
    tabbed.className = "doc-note";
    tabbed.innerHTML = '甲<span class="doc-tab">乙</span>';
    assert.equal(serializeInner(tabbed), '甲<span class="doc-tab">乙</span>', "its end part is kept as small text's is");
  }
  {
    // A text block left empty is kept whatever its origin: a block made or converted on the page has the
    // caps and the type its kind's description gives (capsFor, `empty`), so the paragraph of a callout made
    // of a block and emptied before it is saved stays, as one of the file does.
    const page = openPage(source);
    const inCallout = convertBlock(text(page, "第二段"), "callout").focus;
    assert.ok(inCallout.parentElement.matches(".doc-callout") && typeOf(inCallout) === "paragraph", "the block turned into a callout goes into it as it is");
    assert.equal(inCallout.getAttribute("data-ge-caps"), capsFor("flow"));
    inCallout.textContent = "";
    assert.equal(saved(page), source.replace("<p>第二段</p>", '<div class="doc-callout">\n      <p></p>\n    </div>'), "a callout made on the page and emptied is kept, its paragraph empty");
    const lines = openPage(source);
    const converted = convertBlock(text(lines, "第一段"), "heading2").focus;
    converted.textContent = "";
    assert.equal(saved(lines), source.replace("<p>第一段</p>", "<h2></h2>"), "so is a heading converted and emptied");
  }
  assert.deepEqual(["def score(x):\n    return x", "SELECT a FROM t WHERE b > 1", "npm run dev:local", '{"a": [1, 2]}', "<p>段落</p>", ".card { color: red; }", "let x: number = 1;", "name: demo\nversion: 1", "只是一段文字",
    "const App = () => <div>hi</div>;", "const App = (p: Props) => <Card {...p} />;", "# 标题\n\n- 一\n- 二", "# 注释\n- a\n- b: 1"].map(guessLanguage),
    ["python", "sql", "bash", "json", "html", "css", "typescript", "yaml", null, "jsx", "tsx", "markdown", "yaml"]);
  // Folding a line's structure (code-folds.js): the lines that start one, and the lines folding one hides.
  {
    const lines = (text, language) => [...foldRegions(text, language)].map(([line, region]) => `${line + 1}-${region.last + 1}`).sort();
    assert.deepEqual(lines('def fib(n: int) -> int:\n    """Fibonacci."""\n    a, b = 0, 1\n    for _ in range(n):\n        a, b = b, a + b\n    return a', "python"), ["1-6", "4-5"], "a Python body after its colon");
    assert.deepEqual(lines("function f() {\n  const a = [\n    1,\n  ];\n  // { not one\n  return `{`;\n}", "javascript"), ["1-6", "2-3"], "braces and brackets, a closing line staying, none in comments and strings");
    assert.deepEqual(lines('{\n  "a": [1, 2],\n  "b": {\n    "c": 1\n  }\n}', "json"), ["1-5", "3-4"]);
    assert.deepEqual(lines("<ul>\n  <li>a</li>\n  <li>\n    b\n  </li>\n  <br>\n</ul>", "html"), ["1-6", "3-4"], "an element's content, a void element none");
    assert.deepEqual(lines("a:\n  b: 1\n  c:\n    - 1\nd: 2", "yaml"), ["1-4", "3-4"]);
    assert.deepEqual(lines("SELECT a\nFROM t\nWHERE b;", "sql"), ["1-2"], "a statement, its last line (its end) staying");
    assert.deepEqual(lines("if [ -f x ]; then\n  echo y\nfi", "bash"), ["1-2"]);
    assert.deepEqual(lines("# 一\n正文\n## 二\n更多\n\n# 三\nx", "markdown"), ["1-4", "3-4", "6-7"], "a heading's section, blank lines before the next left out");
    assert.deepEqual(lines(".a {\n  color: red;\n}", "css"), ["1-2"]);
    assert.deepEqual(lines("a {\n}", "text"), [], "plain text folds nothing");
    const regions = foldRegions('{\n  "a": {\n    "b": 1\n  },\n  "c": 2\n}', "json");
    assert.deepEqual([...hiddenLines(regions, new Set([1]))], [2], "a folded line hides the lines inside its structure");
    assert.deepEqual([...hiddenLines(regions, new Set([0, 1]))], [1, 2, 3, 4], "folded inside a folded one: hidden with it");
  }
  const refusedLanguage = applyEdits({ current: source, edits: [], units: [{ id: findUnits(source).units.find((unit) => source.slice(unit.start, unit.end) === "<p>第二段</p>").id, replace: { type: "code", html: "x", language: '"><script>' } }] });
  assert.deepEqual(refusedLanguage.conflicts.map((entry) => entry.reason), ["invalid"], "a language is a name");

  // A code block's height (its frame; longer code scrolls in it): on the file's code blocks a size
  // like a card's, on one made or converted on the page part of its markup.
  {
    const withCode = source.replace("<p>第二段</p>", "<div class=\"doc-code\"><div class=\"doc-code-title\"></div><pre><code>a\nb\nc</code></pre></div>");
    const code = findUnits(withCode).units.find((unit) => unit.kind === "code");
    const sized = applyEdits({ current: withCode, edits: [], units: [{ id: code.id, size: "--doc-code-height", value: "120px" }] });
    assert.equal(sized.text, withCode.replace('<div class="doc-code">', '<div class="doc-code" style="--doc-code-height: 120px">'));
    assert.deepEqual(applyEdits({ current: withCode, edits: [], units: [{ id: code.id, size: "--doc-code-height", value: "10px" }] }).conflicts.map((entry) => entry.reason), ["invalid"], "never below a line and a half");
    // Folded, its long lines scrolled: classes it switches.
    const folded = applyEdits({ current: withCode, edits: [], units: [{ id: code.id, toggle: "doc-code--folded", on: true }, { id: code.id, toggle: "doc-code--nowrap", on: true }] });
    assert.equal(folded.text, withCode.replace('<div class="doc-code">', '<div class="doc-code doc-code--folded doc-code--nowrap">'));
    // Its language, picked: an attribute it takes, set and removed in its start tag alone.
    const picked = applyEdits({ current: withCode, edits: [], units: [{ id: code.id, attribute: "data-language", value: "python" }] });
    assert.equal(picked.text, withCode.replace('<div class="doc-code">', '<div class="doc-code" data-language="python">'));
    const repicked = applyEdits({ current: picked.text, edits: [], units: [{ id: code.id, attribute: "data-language", value: "sql" }] });
    assert.equal(repicked.text, withCode.replace('<div class="doc-code">', '<div class="doc-code" data-language="sql">'));
    assert.equal(applyEdits({ current: picked.text, edits: [], units: [{ id: code.id, attribute: "data-language", value: null }] }).text, withCode, "自动识别 removes it");
    assert.deepEqual(applyEdits({ current: withCode, edits: [], units: [{ id: code.id, attribute: "data-language", value: '"><script>' }] }).conflicts.map((entry) => entry.reason), ["invalid"], "a language is a name");
    const paragraph = findUnits(withCode).units.find((unit) => unit.kind === "paragraph");
    assert.deepEqual(applyEdits({ current: withCode, edits: [], units: [{ id: paragraph.id, attribute: "data-language", value: "python" }] }).conflicts.map((entry) => entry.reason), ["invalid"], "only a kind that takes it");
    // A block's color (颜色): a class switch on a paragraph without classes adds the attribute, and
    // its last class going takes the attribute away; a class it does not take is refused.
    const colored = applyEdits({ current: withCode, edits: [], units: [{ id: paragraph.id, toggle: "doc-text-red", on: true }] });
    assert.ok(colored.ok && colored.text === withCode.replace(/<p>/, '<p class="doc-text-red">'), "a color on a paragraph without classes");
    const recolored = applyEdits({ current: colored.text, edits: [], units: [{ id: paragraph.id, toggle: "doc-text-red", on: false }, { id: paragraph.id, toggle: "doc-highlight-blue", on: true }] });
    assert.equal(recolored.text, withCode.replace(/<p>/, '<p class="doc-highlight-blue">'), "another color for it");
    assert.equal(applyEdits({ current: recolored.text, edits: [], units: [{ id: paragraph.id, toggle: "doc-highlight-blue", on: false }] }).text, withCode, "no color: no class attribute left");
    assert.deepEqual(applyEdits({ current: withCode, edits: [], units: [{ id: paragraph.id, toggle: "doc-text-teal", on: true }] }).conflicts.map((entry) => entry.reason), ["unknown"], "a color it does not take");
    // A block with two classes (the names hold the letter s, the separator is whitespace): one goes, the other stays.
    const twoColors = withCode.replace(/<p>/, '<p class="doc-text-red doc-highlight-blue">');
    assert.equal(applyEdits({ current: twoColors, edits: [], units: [{ id: paragraph.id, toggle: "doc-text-red", on: false }] }).text, withCode.replace(/<p>/, '<p class="doc-highlight-blue">'), "one of two classes goes");
    assert.equal(applyEdits({ current: twoColors, edits: [], units: [{ id: paragraph.id, toggle: "doc-highlight-yellow", on: true }] }).text, withCode.replace(/<p>/, '<p class="doc-text-red doc-highlight-blue doc-highlight-yellow">'), "a third is added after both");
    // A block with other attributes and no class gets the class right after the tag name, before them.
    const named = withCode.replace(/<p>/, '<p data-block-id="abcd1234" lang="zh">');
    assert.equal(applyEdits({ current: named, edits: [], units: [{ id: paragraph.id, toggle: "doc-highlight-blue", on: true }] }).text, named.replace(/<p /, '<p class="doc-highlight-blue" '), "its class stands first in the tag");
    // A block made or split off on the page carries its color; a class of another kind is refused.
    const madeColored = applyEdits({ current: withCode, edits: [], units: [{ id: "n0", insert: { type: "paragraph", html: "新的", classes: ["doc-text-green"] }, place: { after: paragraph.id } }] });
    assert.ok(madeColored.ok && madeColored.text.includes('<p class="doc-text-green">新的</p>'), "a new paragraph with its color");
    assert.equal(applyEdits({ current: withCode, edits: [], units: [{ id: "n0", insert: { type: "paragraph", html: "新的", classes: ["doc-code--folded"] }, place: { after: paragraph.id } }] }).ok, false, "not a class of another kind");
    const own = findBlocks(withCode).find((block) => block.unit === paragraph.id);
    const before = withCode.match(/<p>([^<]*)<\/p>/)[1];
    const split = applyEdits({ current: withCode, edits: [{ id: own.id, parts: [{ keep: true, html: before }, { tag: "p", html: "分出的一段", classes: ["doc-highlight-yellow"] }] }] });
    assert.ok(split.ok && split.text.includes('<p class="doc-highlight-yellow">分出的一段</p>'), "a paragraph split off with its color");
    assert.equal(applyEdits({ current: withCode, edits: [{ id: own.id, parts: [{ keep: true, html: before, classes: ["doc-text-red"] }] }] }).ok, false, "the part kept has its own classes already");
    // 待办事项: a to-do list is a list of the kit's class (its items units, as any list's); a bulleted
    // list turns into one by a class switch; an item is checked by its data-checked attribute; one made
    // or split off on the page carries it; nothing else does.
    const todoListSource = "<main><p>前</p><ul><li>甲</li><li>乙</li></ul><ul class=\"doc-todo\"><li data-checked>丙</li></ul></main>";
    const todoListUnits = findUnits(todoListSource).units;
    const [todoListBullets, todoList] = todoListUnits.filter((unit) => unit.kind === "list");
    const todoItems = todoListUnits.filter((unit) => unit.kind === "item");
    assert.equal(todoItems.length, 3, "a to-do list's items are units, as a bulleted list's");
    assert.equal(applyEdits({ current: todoListSource, edits: [], units: [{ id: todoListBullets.id, toggle: "doc-todo", on: true }] }).text, todoListSource.replace("<ul><li>甲", '<ul class="doc-todo"><li>甲'), "a bulleted list turned into a to-do list");
    assert.equal(applyEdits({ current: todoListSource, edits: [], units: [{ id: todoList.id, toggle: "doc-todo", on: false }] }).text, todoListSource.replace('<ul class="doc-todo">', "<ul>"), "and back");
    assert.equal(applyEdits({ current: todoListSource, edits: [], units: [{ id: todoItems[0].id, attribute: "data-checked", value: "" }] }).text, todoListSource.replace("<li>甲", "<li data-checked>甲"), "an item checked");
    assert.equal(applyEdits({ current: todoListSource, edits: [], units: [{ id: todoItems[2].id, attribute: "data-checked", value: null }] }).text, todoListSource.replace("<li data-checked>丙", "<li>丙"), "its check taken away");
    assert.deepEqual(applyEdits({ current: todoListSource, edits: [], units: [{ id: todoItems[0].id, attribute: "data-checked", value: "yes" }] }).conflicts.map((entry) => entry.reason), ["invalid"], "checked is a bare attribute");
    const todoBefore = todoListUnits.find((unit) => unit.kind === "paragraph");
    const madeTodo = applyEdits({ current: todoListSource, edits: [], units: [{ id: "n0", insert: { type: "todo", children: [{ type: "item", html: "丁", attributes: { "data-checked": "" } }, { type: "item", html: "戊" }] }, place: { after: todoBefore.id } }] });
    assert.ok(madeTodo.ok && madeTodo.text.replace(/\s+/g, "").includes('<ulclass="doc-todo"><lidata-checked>丁</li><li>戊</li></ul>'), "a to-do list made on the page, one item checked");
    assert.equal(applyEdits({ current: todoListSource, edits: [], units: [{ id: "n0", insert: { type: "paragraph", html: "x", attributes: { "data-checked": "" } }, place: { after: todoBefore.id } }] }).ok, false, "a paragraph is never checked");
    const todoThird = findBlocks(todoListSource).find((block) => block.unit === todoItems[2].id);
    const todoSplit = applyEdits({ current: todoListSource, edits: [{ id: todoThird.id, parts: [{ keep: true, html: "丙" }, { tag: "li", html: "己", attributes: { "data-checked": "" } }] }] });
    assert.ok(todoSplit.ok && todoSplit.text.includes("<li data-checked>丙</li><li data-checked>己</li>"), "an item split off checked");
    // The lines whose structure it folds: an attribute it takes, their numbers.
    const foldedCode = applyEdits({ current: withCode, edits: [], units: [{ id: code.id, attribute: "data-folded-lines", value: "1 4" }] });
    assert.equal(foldedCode.text, withCode.replace('<div class="doc-code">', '<div class="doc-code" data-folded-lines="1 4">'));
    assert.deepEqual(["0", "1,4", "1  4", "x"].map((value) => applyEdits({ current: withCode, edits: [], units: [{ id: code.id, attribute: "data-folded-lines", value }] }).conflicts.map((entry) => entry.reason)), [["invalid"], ["invalid"], ["invalid"], ["invalid"]], "numbers from 1, a space between");
    const page = openPage(source);
    const made = convertBlock(text(page, "const total"), "code").focus.closest(".doc-code");
    made.style.setProperty("--doc-code-height", "80px");
    made.setAttribute("data-language", "javascript");
    assert.ok(saved(page).includes('<div class="doc-code" data-language="javascript" style="--doc-code-height: 80px"><div class="doc-code-title"></div><pre><code>const total = 1;</code></pre></div>'));
    const second = findUnits(source).units.find((unit) => source.slice(unit.start, unit.end) === "<p>第二段</p>");
    assert.deepEqual(applyEdits({ current: source, edits: [], units: [{ id: second.id, replace: { type: "heading2", html: "x", height: "80px" } }] }).conflicts.map((entry) => entry.reason), ["invalid"], "a height only on code");
    // Undo of a conversion into code turns the code block back into text: its language and height
    // stay with the code, its other attributes go along. Into nothing else, and a code block written
    // otherwise stays.
    const back = source.replace("<p>第二段</p>", '<div class="doc-code" id="kept" data-language="javascript" style="--doc-code-height: 80px"><div class="doc-code-title"></div><pre><code>第二段</code></pre></div>');
    const pre = findUnits(back).units.find((unit) => unit.kind === "code");
    const turned = (current, id, replace) => applyEdits({ current, edits: [], units: [{ id, replace }] });
    assert.equal(turned(back, pre.id, { type: "paragraph", html: "第二段" }).text, source.replace("<p>第二段</p>", '<p id="kept">第二段</p>'));
    assert.deepEqual(turned(back, pre.id, { type: "code", html: "x" }).conflicts.map((entry) => entry.reason), ["invalid"], "a code block becomes text only");
    const other = source.replace("<p>第二段</p>", '<div class="doc-code"><div class="doc-code-title"></div><p>x</p><pre><code>第二段</code></pre></div>');
    assert.deepEqual(turned(other, findUnits(other).units.find((unit) => unit.kind === "code").id, { type: "paragraph", html: "第二段" }).conflicts.map((entry) => entry.reason), ["invalid"], "only a code block as a conversion writes it");
    const bare = source.replace("<p>第二段</p>", "<pre><code>第二段</code></pre>");
    assert.ok(!findBlocks(bare).some((block) => block.kind === "code") && findUnits(bare).units.every((unit) => unit.kind !== "code"), "a pre with no code block around it is none");
  }

  // A detail card opened by the selected text.
  {
    const page = openPage(source);
    const doc = page.document;
    const host = text(page, "第二段");
    const id = freshDialogId(doc);
    assert.equal(id, "dialog-1");
    const range = doc.createRange();
    range.setStart(host.firstChild, 0);
    range.setEnd(host.firstChild, 2);
    const link = dialogLink(doc, id);
    link.append(range.extractContents());
    range.insertNode(link);
    const card = newDialog(doc, id, "第二 <详情>");
    card.querySelector(".doc-dialog-content > p").textContent = "卡片里的内容";
    const main = doc.querySelector("main");
    main.insertBefore(card, main.querySelector("footer"));
    assert.equal(saved(page), source
      .replace("<p>第二段</p>", '<p><a class="doc-dialog-trigger" href="#dialog-1">第二</a>段</p>')
      .replace("  </section>\n", `  </section>
  <dialog class="doc-dialog" id="dialog-1">
    <div class="doc-dialog-panel">
      <div class="doc-dialog-content">
        <h3>第二 &lt;详情></h3>
        <p>卡片里的内容</p>
      </div>
    </div>
  </dialog>
`));
    // Its heading may be emptied as any; without a link to it, it is not written.
    card.querySelector("h3").textContent = "";
    assert.equal(collectEdits(doc, page.baselines, page.layout).blank.length, 0);
    card.querySelector("h3").textContent = "标题";
    link.replaceWith(...link.childNodes);
    assert.equal(saved(page), source);
  }
  // The server keeps a card's id its own: one the file uses already is refused.
  {
    const taken = source.replace("<p>第一段</p>", '<p id="dialog-1">第一段</p>');
    const op = { id: "n0", insert: { type: "dialog", id: "dialog-1", children: [] }, place: { after: findUnits(taken).units.find((unit) => unit.kind === "section").id } };
    assert.deepEqual(applyEdits({ current: taken, edits: [], units: [op] }).conflicts.map((entry) => entry.reason), ["invalid"]);
  }
  // The kit's markup written for a Sheet area made on the page says its aria-label in the file's
  // language (its <html lang>: shared/components/page.mjs pageLanguage), Chinese but for en.
  for (const [lang, tabs] of [["zh-CN", "选项卡"], ["en", "Tabs"], ["en-GB", "Tabs"], ["fr", "选项卡"]]) {
    const file = `<!doctype html>\n<html lang="${lang}">\n<body>\n${source}</body>\n</html>\n`;
    const after = findUnits(file).units.find((unit) => unit.kind === "section").id;
    const made = applyEdits({ current: file, edits: [], units: [
      { id: "n0", insert: { type: "sheets", name: "tabs-1", children: [{ type: "tab", title: "One", sheet: "one", children: [] }] }, place: { after } },
    ] });
    assert.ok(made.ok && made.text.includes(`data-doc-sheets="tabs-1" aria-label="${tabs}"`) && made.text.includes(`<div class="doc-sheet-tabs" aria-label="${tabs}">`), `lang ${lang}: ${made.text ?? JSON.stringify(made.conflicts)}`);
  }
}

// The real Component Catalog: wide coverage, exact round trip, nothing inside code, charts or controls.
{
  const gallery = newNames(await fs.readFile(new URL("../fixtures/component-catalog/doc.html", import.meta.url), "utf8")); // as the tools read it (its old names new)
  const blocks = findBlocks(gallery);
  assert.ok(blocks.filter((block) => block.tag === "p" && block.kind === "flow").length >= 40, "ordinary section paragraphs are editable");
  for (const kind of ["title", "field", "label", "cell"]) assert.ok(blocks.some((block) => block.kind === kind), `the Component Catalog has ${kind} blocks`);
  assert.ok(findUnits(gallery).boxes.some((box) => box.kind === "callout"), "and a callout, a box of blocks");
  const { html } = instrument(gallery);
  assert.equal(unmarked(html), gallery);
  assert.equal(applyEdits({ current: gallery, edits: [] }).text, gallery);
  const { document } = new JSDOM(html).window;
  assert.equal(document.querySelectorAll("svg [data-ge-block], button [data-ge-block], label [data-ge-block], [id$='-chart'] [data-ge-block]").length, 0);
  const codes = blocks.filter((block) => block.kind === "code");
  assert.ok(codes.length >= 2 && codes.every((block) => block.tag === "code"), "a code block's code is plain text to edit");
  assert.equal(document.querySelectorAll("pre [data-ge-block]").length, document.querySelectorAll("pre > code[data-ge-block]").length, "nothing else in a code block");
  assert.ok(document.querySelector("p[data-ge-block] > a.doc-dialog-trigger[href='#dialog-component-example']"), "the paragraph holding the dialog trigger (a link to the dialog) is ordinary text");

  // Blocks: every chart is declared and the script refers to no block, so every card is a block like
  // any other, and so is every Sheet tab; a plain section can go, exactly.
  const { units } = findUnits(gallery);
  assert.ok(units.length >= 100);
  assert.equal(document.querySelectorAll("[data-ge-keep='script']").length, 0, "nothing the script holds");
  assert.equal(document.querySelectorAll("figure[data-ge-unit]:not([data-ge-keep]) [data-doc-chart]").length, 8, "every chart's card (each of a type the report defines, two drawn from a table)");
  assert.equal(document.querySelectorAll("button[data-ge-unit]:not(.doc-sheet-tab), label[data-ge-unit], select[data-ge-unit], dialog[data-ge-unit], header[data-ge-unit]").length, 0, "controls, dialogs and the header are not blocks");
  assert.ok(document.querySelector(".doc-summary[data-ge-unit]:not([data-ge-keep])"), "the opening summary is");
  const tabs = units.filter((unit) => unit.kind === "tab");
  assert.deepEqual(tabs.map((tab) => [tab.key, tab.keep?.reason ?? null]), [["text", null], ["charts", null], ["tables", null], ["interaction", null]], "no Sheet the script uses");
  const noTables = applyEdits({ current: gallery, edits: [], units: [{ id: tabs.find((tab) => tab.key === "tables").id, remove: true }] });
  assert.ok(noTables.ok && !noTables.text.includes('data-sheet-tab="tables"') && !noTables.text.includes('data-doc-sheet="tables"') && !noTables.text.includes('id="tables-basic"'), "a tab goes with its panel");
  assert.ok(noTables.text.includes('data-doc-sheet="charts"') && noTables.text.includes('data-sheet-tab="interaction"'));
  const markdown = units.find((unit) => unit.kind === "section" && gallery.slice(unit.start, unit.end).includes('id="text-prose"'));
  assert.equal(markdown.keep, null);
  const dropped = applyEdits({ current: gallery, edits: [], units: [{ id: markdown.id, remove: true }] });
  assert.ok(dropped.ok && !dropped.text.includes("text-prose") && dropped.text.includes('id="text-structure"') && dropped.text.includes('id="interaction-state"'));
  const lines = gallery.slice(markdown.start, markdown.end).split("\n").length;
  assert.ok([lines, lines + 1].includes(gallery.split("\n").length - dropped.text.split("\n").length), "its lines and at most one blank line");
}

// List items copied on their own (a list's items selected: each carries its list's kind) pasted where
// no list takes them are items of a list of that kind (an item is a block of its list's type):
// in a disclosure's content, a highlight block, a column; in a list they stay items of it. A block
// held by a list item takes what is pasted by it into the item's box, as any child block does.
{
  const source = `<main class="doc-page">
  <p>前文</p>
  <details class="doc-details"><summary><span class="doc-details-summary-label">标题</span></summary><div class="doc-details-content"><p>折内</p></div></details>
  <div class="doc-panel"><div class="doc-icon">💡</div><p>高内</p></div>
  <ul>
    <li>项文<p>项内段</p></li>
    <li>项二</li>
  </ul>
</main>
`;
  const items = [{ type: "item", html: "甲", list: "numbers" }, { type: "item", html: "乙", list: "numbers" }, { type: "item", html: "丙", list: "todo", checked: true }];
  const text = (page, words) => [...page.document.querySelectorAll("[contenteditable]")].find((node) => node.textContent.trim().startsWith(words));
  const body = (page) => {
    const result = saveAll(page, source);
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    return result.text.match(/<main[^>]*>([\s\S]*)<\/main>/)[1].replace(/\n\s*/g, "");
  };
  const at = async (words, own, ownType) => {
    const page = openPage(source);
    const host = text(page, words);
    const range = caretIn(page.document, host, words, words.length);
    await pasteAt(page, host, range, { own, ownType, text: "x" });
    return body(page);
  };
  let got = await at("折内", items);
  assert.ok(got.includes('<div class="doc-details-content"><p>折内</p><ol><li>甲</li><li>乙</li></ol><ul class="doc-todo"><li data-checked>丙</li></ul></div>'), `in a disclosure's content: a list of each kind: ${got}`);
  got = await at("高内", items.slice(0, 2));
  assert.ok(got.includes('<div class="doc-icon">💡</div><p>高内</p><ol><li>甲</li><li>乙</li></ol></div>'), `in a highlight block: ${got}`);
  got = await at("项二", items.slice(0, 2).map((item) => ({ ...item, list: "bullets" })));
  assert.ok(got.includes("<li>项二</li><li>甲</li><li>乙</li></ul>"), `in a list of their kind: items of it: ${got}`);
  got = await at("项二", items.slice(0, 2));
  assert.ok(got.includes("<li>项二</li></ul><ol><li>甲</li><li>乙</li></ol>"), `in a list of another kind: a list of theirs after it (an item keeps its type): ${got}`);
  {
    const split = `<main class="doc-page">\n  <ul>\n    <li>一</li>\n    <li>二</li>\n  </ul>\n</main>\n`;
    const page = openPage(split);
    const host = text(page, "一");
    await pasteAt(page, host, caretIn(page.document, host, "一", 1), { own: items.slice(0, 2), text: "x" });
    const result = saveAll(page, split);
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    const inner = result.text.match(/<main[^>]*>([\s\S]*)<\/main>/)[1].replace(/\n\s*/g, "");
    assert.equal(inner, "<ul><li>一</li></ul><ol><li>甲</li><li>乙</li></ol><ul><li>二</li></ul>", "in the middle of a list of another kind: the list splits around them");
  }
  got = await at("项内段", [{ type: "paragraph", html: "新段" }, { type: "paragraph", html: "再一段" }]);
  assert.ok(got.includes("<li>项文<p>项内段新段</p><p>再一段</p></li><li>项二</li>"), `by a block an item holds: in the item: ${got}`);
  got = await at("前文", [{ type: "item", html: "无类" }]);
  assert.ok(got.includes("<p>前文</p><ul><li>无类</li></ul>"), `an item copied before items carried their kind: a bulleted list: ${got}`);
  // Copied on a page of the version before the product's rename (2026-10-26), open in another tab: its
  // blocks come under the clipboard type of then alone, and paste as blocks all the same.
  got = await at("项二", items.slice(0, 2).map((item) => ({ ...item, list: "bullets" })), "application/x-report-studio-blocks");
  assert.ok(got.includes("<li>项二</li><li>甲</li><li>乙</li></ul>"), `blocks under the old clipboard type paste as blocks: ${got}`);
}

// A disclosure's content and a highlight block always hold a block (`holdsOne`, core.mjs tidyEmptied):
// a step that leaves one empty puts an empty paragraph in it, in the same undo step; one the step
// takes off the page is left alone, and a box that keeps a block is not touched.
{
  const { createHistory } = await import("../../src/editor/page/history.mjs");
  const page = openPage(`<main class="doc-page">
  <details class="doc-details"><summary><span class="doc-details-summary-label">标题</span></summary><div class="doc-details-content"><p>折内</p></div></details>
  <div class="doc-panel"><div class="doc-icon">💡</div><p>高内</p><p>高内二</p></div>
  <details class="doc-details"><summary><span class="doc-details-summary-label">另一个</span></summary><div class="doc-details-content"><p>另内</p></div></details>
</main>
`);
  const { document } = page;
  const history = createHistory({ changed() {}, beforeUndo() {}, blocks: () => ({ select() {}, clear() {} }), afterText() {}, tidy: () => [tidyEmptied] });
  const [content, other] = document.querySelectorAll(".doc-details-content");
  const panel = document.querySelector(".doc-panel");
  const shape = (box) => [...box.children].map((child) => `${child.localName}:${child.textContent}`).join("|");
  history.struct([content], [], () => { content.firstElementChild.remove(); return { touched: [], focus: null }; });
  assert.equal(shape(content), "p:", "the emptied content holds an empty paragraph");
  assert.ok(content.firstElementChild.hasAttribute("data-ge-new"), "a new one, saved as any new empty paragraph");
  assert.ok(keptAnyway(content.firstElementChild), "deleting it would change nothing (selection/delete.mjs leaves it)");
  content.firstElementChild.classList.add("doc-note");
  assert.ok(!keptAnyway(content.firstElementChild), "small text is not what comes back");
  content.firstElementChild.classList.remove("doc-note");
  assert.ok(!keptAnyway(panel.querySelector("p")), "a paragraph with text is not");
  history.undo();
  assert.equal(shape(content), "p:折内", "undo puts the block back, the paragraph gone");
  history.redo();
  assert.equal(shape(content), "p:", "redo the empty paragraph again");
  history.struct([panel], [], () => { panel.querySelectorAll("p").forEach((p) => p.remove()); return { touched: [], focus: null }; });
  assert.equal(shape(panel), "div:💡|p:", "a highlight block keeps an empty paragraph after its icon");
  history.struct([panel], [], () => { panel.lastElementChild.after(Object.assign(newHost(document, "paragraph"), { textContent: "加" })); return { touched: [], focus: null }; });
  assert.equal(shape(panel), "div:💡|p:|p:加", "one that holds blocks is not touched");
  assert.ok(!keptAnyway(panel.querySelector("p")), "an empty paragraph beside another block may go");
  history.struct([other, document.querySelector("main")], [], () => { other.firstElementChild.remove(); other.closest("details").remove(); return { touched: [], focus: null }; });
  assert.equal(other.children.length, 0, "a disclosure taken off the page is left as it went");
}

// What a component wrote over someone else's change of a part (仍然调整) is as low as undo takes the part
// (history fold): the steps below it hold it no more. Undone, and a newer write made before its commit was
// answered, it is on no stack: the newer write still undoes, and the steps made before it hold the part no
// more, so that no undo writes what the page had before over what the file holds.
{
  const { createHistory } = await import("../../src/editor/page/history.mjs");
  const { document } = new JSDOM('<body><div id="part">甲</div></body>').window;
  const part = document.getElementById("part");
  const history = createHistory({ changed() {}, beforeUndo() {}, blocks: () => ({ select() {}, clear() {} }), afterText() {} });
  const write = (html) => {
    const was = part.innerHTML;
    part.innerHTML = html;
    return history.sourceStep([[part, was]]);
  };
  write("乙");
  let over = write("丙");
  history.fold(over);
  history.undo();
  history.undo();
  assert.equal(part.innerHTML, "乙", "folded: undo goes no lower than the step written over theirs");
  history.redo();
  over = write("丁");
  history.undo();
  write("戊");
  history.fold(over);
  history.undo();
  assert.equal(part.innerHTML, "丙", "on no stack: the newer write undoes still");
  history.undo();
  assert.equal(part.innerHTML, "丙", "and nothing made before it undoes the part");
}

// A unit the file dropped while the page still shows it is marked as made on the page, of its own
// type: a highlight block's icon an icon (it was taken for the first type of its tag, a callout,
// and written back by undo as an empty .doc-callout).
{
  const { asMade } = await import("../../src/editor/page/sync-state.mjs");
  const page = openPage(`<main class="doc-page">
  <div class="doc-panel"><div class="doc-icon">💡</div><p>高内</p></div>
</main>
`);
  const icon = page.document.querySelector(".doc-icon");
  asMade(icon, { unit: 1 });
  assert.equal(icon.getAttribute("data-ge-type"), "icon", "a highlight block's icon made again is an icon");
  assert.ok(icon.hasAttribute("data-ge-new") && !icon.hasAttribute("data-ge-unit"));
}

// A structural step records what the components' tidiers name besides the containers it changes (a
// row's columns and their widths, the lists of a flow: history.mjs knows no component, editor.mjs hands it
// tidyRows and tidyLists), runs their settle after the change, and undo and redo put it all back.
{
  const { createHistory } = await import("../../src/editor/page/history.mjs");
  const dom = new JSDOM('<body><div id="a"><p>one</p><p>two</p></div><div id="b" style="width: 1px"></div></body>');
  const { document } = dom.window;
  const [a, b] = [document.getElementById("a"), document.getElementById("b")];
  const seen = [];
  const made = document.createElement("section");
  const history = createHistory({
    changed() {}, beforeUndo() {}, blocks: () => ({ select() {}, clear() {} }), afterText() {},
    tidy: () => [
      (parents) => (seen.push(parents.slice()), { parents: [b], attributes: [[b, ["style"]]], settle: ({ created }) => { b.append(document.createElement("i")); b.setAttribute("style", "width: 2px"); seen.push(created); } }),
      (parents) => (seen.push(parents.slice()), { parents: [] }), // a tidier with nothing to settle
    ],
  });
  history.struct([a], [], () => { a.firstElementChild.remove(); return { touched: [], focus: null, created: [made] }; });
  assert.deepEqual(seen.map((entry) => entry.map((node) => node.id || node.localName)), [["a"], ["a", "b"], ["section"]], "each tidier sees the parents the ones before it added, settle gets the step's result");
  assert.equal(b.querySelectorAll("i").length, 1);
  assert.equal(b.getAttribute("style"), "width: 2px");
  history.undo();
  assert.equal(a.children.length, 2, "the step undone");
  assert.equal(b.children.length, 0, "and what the tidier settled in its container with it");
  assert.equal(b.getAttribute("style"), "width: 1px", "and the attribute it named");
  history.redo();
  assert.equal(a.children.length, 1);
  assert.equal(b.querySelectorAll("i").length, 1, "redone, the settled state again");
  assert.equal(b.getAttribute("style"), "width: 2px");
}

// Lists a step sets side by side join (join.mjs): two of one kind, the second with no start of its
// own; two flowcharts only when they are laid out alike (no direction, or the same one): a direction
// is the author's layout of a whole flowchart, so two laid out differently stay two.
{
  const { joinSideBySide, listsAround } = await import("../../src/editor/components/list/join.mjs");
  const free = 'data-ge-box data-ge-new';
  const dom = new JSDOM(`<body><div id="flow">
    <ol class="doc-flow" ${free}><li>甲一</li></ol><p id="a">中间</p><ol class="doc-flow" ${free} data-direction="column"><li>乙一</li></ol>
    <p id="b">中间</p>
    <ol class="doc-flow" ${free} data-direction="row"><li>丙一</li></ol><p id="c">中间</p><ol class="doc-flow" ${free} data-direction="row"><li>丁一</li></ol>
    <p id="d">中间</p>
    <ol class="doc-flow" ${free}><li>戊一</li></ol><p id="e">中间</p><ol class="doc-flow" ${free}><li>己一</li></ol>
    <p id="f">中间</p>
    <ol ${free}><li>庚一</li></ol><p id="g">中间</p><ol ${free} data-direction="column"><li>辛一</li></ol>
  </div></body>`);
  const { document } = dom.window;
  const flow = document.getElementById("flow");
  const around = listsAround([flow]);
  for (const id of ["a", "c", "e", "g"]) document.getElementById(id).remove();
  joinSideBySide(around);
  assert.deepEqual([...flow.querySelectorAll(":scope > ol")].map((list) => [...list.children].map((item) => item.textContent).join("")),
    ["甲一", "乙一", "丙一丁一", "戊一己一", "庚一辛一"], "flowcharts of one direction join, of two stay apart; numbered lists join as before");
}

// A block two cards are about (a component's write held, and what someone else's write put back of what
// it wrote before) stays flagged until the last of them goes.
{
  const { createConflicts } = await import("../../src/editor/page/conflicts.mjs");
  const view = new JSDOM('<!doctype html><html><head></head><body><main><div data-ge-unit="1">看板</div><p data-ge-unit="2">一段</p></main></body></html>').window;
  const saved = { document: globalThis.document };
  globalThis.document = view.document;
  try {
    const [board, paragraph] = view.document.querySelectorAll("[data-ge-unit]");
    const conflicts = createConflicts({ act: async () => true, nodeOf: (entry) => (entry.unit === 1 ? board : paragraph), restorable: () => false, copyBlock: () => true, say() {} });
    conflicts.add([{ key: "r:s1", kind: "reverted-source", unit: 1, written: { tasks: "a" } }, { key: "u1", kind: "unit", reason: "changed", unit: 1, change: { source: { tasks: "" } } }, { key: "u2", kind: "unit", reason: "changed", unit: 2, change: { remove: true } }]);
    const flags = () => [board, paragraph].map((node) => node.getAttribute("data-ge-flag"));
    assert.deepEqual(flags(), ["conflict", "conflict"]);
    conflicts.remove("r:s1");
    assert.deepEqual(flags(), ["conflict", "conflict"], "the card still standing on the board keeps it flagged");
    conflicts.remove("u2");
    assert.deepEqual(flags(), ["conflict", null], "a block no other card is about is not");
    conflicts.remove("u1");
    assert.deepEqual(flags(), [null, null]);
  } finally {
    globalThis.document = saved.document;
  }
}

// The conflict card's word diff (the reader's version against the file's) is built on the merge's
// one longest common subsequence: runs of the words both have, the reader's alone (del), the file's alone (ins).
{
  const { wordDiff } = await import("../../src/editor/page/conflicts.mjs");
  const { commonRun } = await import("../../src/editor/page/merge.mjs");
  assert.deepEqual(commonRun(["a", "b", "c"], ["a", "x", "c"]), [[0, 0], [2, 2]]);
  assert.deepEqual(wordDiff("same words", "same words"), [{ tag: null, text: "same words" }]);
  assert.deepEqual(wordDiff("我们先理解材料", "我们先读懂材料"), [
    { tag: null, text: "我们先" }, { tag: "ins", text: "读懂" }, { tag: "del", text: "理解" }, { tag: null, text: "材料" },
  ], "Chinese character by character: what differs in the middle, the file's words before the reader's");
  assert.deepEqual(wordDiff("a b c", "a b c d"), [{ tag: null, text: "a b c" }, { tag: "ins", text: " d" }], "an ending the file added");
  assert.deepEqual(wordDiff("a b c d", "b c"), [{ tag: "del", text: "a " }, { tag: null, text: "b c" }, { tag: "del", text: " d" }], "words only the reader has");
  assert.deepEqual(wordDiff("abc", "xyz"), [{ tag: "ins", text: "xyz" }, { tag: "del", text: "abc" }], "nothing shared");
  assert.deepEqual(wordDiff("", ""), []);
  const long = Array.from({ length: 2000 }, (_, index) => `w${index}`).join(" ");
  assert.ok(wordDiff(long, long + " tail").every((run) => run.tag === null), "past 1500 words nothing is compared");

  // The card prints both versions with the words each alone has marked in place (a design review, 2026-11-17):
  // the reader's in <del>, the file's in <ins>; both plain for a rewrite (more than half marked) or a text the diff
  // does not give back whole.
  const { markedVersions } = await import("../../src/editor/page/conflicts.mjs");
  const view = new JSDOM("<body></body>").window;
  const saved = globalThis.document;
  globalThis.document = view.document;
  try {
    const html = (nodes) => nodes.map((node) => (node.nodeType === 1 ? node.outerHTML : node.data)).join("");
    const [mine, theirs] = markedVersions("验证 loss 是 2.30。代码和数学两项评测各涨了 2 分以上。", "验证 loss 是 2.29。代码和数学两项评测各涨了 2 分以上。");
    assert.equal(html(mine), "验证 loss 是 2.<del>30</del>。代码和数学两项评测各涨了 2 分以上。", "the reader's version, its own words marked");
    assert.equal(html(theirs), "验证 loss 是 2.<ins>29</ins>。代码和数学两项评测各涨了 2 分以上。", "the file's, its own");
    assert.equal(markedVersions("我们先理解材料", "完全换了一句话"), null, "a rewrite: both plain");
    assert.equal(markedVersions(long, `${long} tail`), null, "past what the diff reads: both plain, never cut short");
    const [same] = markedVersions("一样的话", "一样的话");
    assert.equal(html(same), "一样的话", "the same text: nothing marked");
  } finally {
    globalThis.document = saved;
  }
}

// A block both sides changed: changes to different places merge word by word (Chinese character
// by character); changes to the same or adjacent places, unless identical, stay a conflict.
{
  assert.equal(mergeText("我们先理解材料，再选择组件。", "我们先读懂材料，再选择组件。", "我们先理解材料，再挑选组件。"), "我们先读懂材料，再挑选组件。");
  assert.equal(mergeText("我们先理解材料，再选择组件。", "我们先理解<strong>材料</strong>，再选择组件。", "我们先理解材料，再挑选组件。"), "我们先理解<strong>材料</strong>，再挑选组件。");
  assert.equal(mergeText("the quick fox", "the slow fox", "the quick red fox"), null, "adjacent changes conflict");
  assert.equal(mergeText("a b c", "a x c", "a y c"), null);
  assert.equal(mergeText("a b c", "a b c d", "a b c e"), null, "two insertions at the same place conflict");
  assert.equal(mergeText("a b c", "a x c", "a x c"), "a x c", "the same change on both sides");
  assert.equal(mergeText("a &gt; b 和 c", "a > b 和 d", "a &gt; e 和 c"), "a > e 和 d", "entities compare by what they mean");
  assert.equal(mergeText("x and y", "x or y", "x and z"), null, "a space alone does not set two changes apart");
  assert.equal(mergeText(`<a href="#s">链接</a> 文字`, `<a href="#s">链接</a> 新文字`, `<a href='#s'>链接</a> 文字！`), `<a href="#s">链接</a> 新文字！`, "so do attribute quotes");

  // Through a commit: the block as the page last saw it, and the file's words changed since.
  const quote = "引用块用于保留来源原话或定义。";
  const current = SRC.replace(quote, "引用块用于保留来源原话或定义（AI 补充）。");
  const quoted = findUnits(SRC).units.find((unit) => SRC.slice(unit.elStart, unit.end) === `<p>${quote}</p>`);
  const unit = { key: "u", open: quoted.id, hash: hashOf(SRC.slice(quoted.start, quoted.end)) };
  const send = (parts) => commitEdits({ current, opening: SRC, ids: false, texts: [{ key: "t", block: { unit, self: true, before: quote }, parts }] });
  const merged = send([{ keep: true, html: "引用块常用于保留<strong>来源原话</strong>或定义。" }]);
  assert.deepEqual(merged.texts.map(({ status, html }) => [status, html]), [["merged", "引用块常用于保留<strong>来源原话</strong>或定义（AI 补充）。"]]);
  assert.equal(merged.text, current.replace("引用块用于保留来源原话或定义（AI 补充）。", "引用块常用于保留<strong>来源原话</strong>或定义（AI 补充）。"), "both changes, nothing else");
  const clash = send([{ keep: true, html: "引用块用于保留原话。" }]);
  assert.deepEqual(clash.texts.map(({ status, reason, theirs }) => [status, reason, theirs]), [["conflict", "changed", "引用块用于保留来源原话或定义（AI 补充）。"]]);
  assert.equal(clash.text, current, "a conflict writes nothing");
  const split = send([{ keep: true, html: "引用块常用于" }, { tag: "p", html: "保留来源原话或定义。" }]);
  assert.equal(split.texts[0].status, "conflict", "a split is never merged");
}

// Sections (分区): containers of ordinary blocks. A section's heading (a plain h2)
// and a divider line at its top are blocks of their own, with their identities; the
// section's own aria-labelledby keeps no heading in it. A new section holds one paragraph; dissolving
// one leaves its blocks where it was, and the section goes with its identity.
{
  const source = `<main class="doc-page" data-doc-id="demo">
  <section class="doc-section" aria-labelledby="a" data-block-id="sa000001">
    <h2 id="a" data-block-id="ha000001">第一章</h2>
    <p data-block-id="pa000001">甲段。</p>
  </section>

  <section class="doc-section" aria-labelledby="b" data-block-id="sb000001">
    <hr data-block-id="rb000001">
    <h2 id="b">第二章</h2>
    <p data-block-id="pb000001">乙段，见<a href="#d">最后一部分</a>。</p>
  </section>

  <section class="doc-section">
    <p>丙段。</p>
    <script>/* 本分区的脚本 */</script>
  </section>

  <section class="doc-section" id="d">
    <p>丁段。</p>
  </section>
</main>
`;
  const { units } = findUnits(source);
  assert.deepEqual(units.map((unit) => unit.kind), ["section", "heading", "paragraph", "section", "rule", "heading", "paragraph", "section", "paragraph", "section", "paragraph"]);
  const remove = (unit) => applyEdits({ current: source, edits: [], units: [{ id: unit.id, remove: true }] });
  const title = units.find((unit) => unit.tag === "h2");
  assert.equal(title.keep, null, "a section's own label keeps no heading in it");
  assert.equal(remove(title).text, source.replace('    <h2 id="a" data-block-id="ha000001">第一章</h2>\n', ""), "the title goes like any heading");
  const second = units.filter((unit) => unit.tag === "h2")[1];
  assert.equal(remove(second).text, source.replace('    <h2 id="b">第二章</h2>\n', ""), "and so does the title of a section with a divider line above it");
  assert.equal(remove(units.find((unit) => unit.kind === "rule")).text, source.replace('    <hr data-block-id="rb000001">\n', ""), "a divider line at a section's top is a block too");
  assert.deepEqual(applyEdits({ current: source, edits: [], units: [{ id: units[0].id, toggle: "doc-section--no-divider", on: true }] }).conflicts.map((entry) => entry.reason), ["unknown"], "a section has no line of its own to switch");

  const text = (page, words) => [...page.document.querySelectorAll("[contenteditable]")].find((node) => node.textContent.includes(words));
  const sectionOf = (page, words) => [...page.document.querySelectorAll("main > section")].find((section) => section.textContent.includes(words));
  const saved = (page) => {
    const result = applyEdits({ current: source, ...changes(page) });
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    return result.text;
  };
  const page = openPage(source);
  assert.ok(sectionOf(page, "第一章").querySelector(':scope > h2[data-ge-unit]') && sectionOf(page, "第二章").querySelector(":scope > h2[data-ge-unit]"), "on the page the titles are blocks with handles of their own");
  assert.equal(unwrapCheck(sectionOf(page, "甲段")), "");
  assert.match(unwrapCheck(sectionOf(page, "丙段")), /不能移动的内容/, "a script in a section would be lost");
  assert.match(unwrapCheck(sectionOf(page, "丁段")), /被脚本或链接用到/, "a section a link points at stays");
  assert.equal(unwrapCheck(text(page, "甲段")), null, "only a section dissolves");

  // Dissolved: the blocks stay where the section was, with their identities.
  const dissolved = openPage(source);
  const first = unwrapSection(sectionOf(dissolved, "甲段")).focus;
  assert.equal(first.textContent, "第一章");
  assert.equal(saved(dissolved), source.replace(`  <section class="doc-section" aria-labelledby="a" data-block-id="sa000001">
    <h2 id="a" data-block-id="ha000001">第一章</h2>
    <p data-block-id="pa000001">甲段。</p>
  </section>`, `  <h2 id="a" data-block-id="ha000001">第一章</h2>

  <p data-block-id="pa000001">甲段。</p>`), "set apart as the blocks of the page are");

  // A new section holds one empty paragraph: a plain section holding it is written at once (an
  // empty paragraph is kept), set apart like the sections around it, then its text.
  const fresh = openPage(source);
  const paragraph = sectionAfter(sectionOf(fresh, "甲段")).focus;
  assert.ok(paragraph.tagName === "P" && paragraph.parentElement.localName === "section" && paragraph.parentElement.children.length === 1);
  assert.equal(saved(fresh), source.replace(`  </section>

  <section class="doc-section" aria-labelledby="b"`, `  </section>

  <section class="doc-section">
    <p></p>
  </section>

  <section class="doc-section" aria-labelledby="b"`), "empty, it is written with its empty paragraph");
  paragraph.textContent = "新分区的正文";
  assert.equal(saved(fresh), source.replace(`  </section>

  <section class="doc-section" aria-labelledby="b"`, `  </section>

  <section class="doc-section">
    <p>新分区的正文</p>
  </section>

  <section class="doc-section" aria-labelledby="b"`));

  // A block with an identity still changes type, and keeps its identity.
  const typed = openPage(source);
  const plainTitle = openPage(`<main class="doc-page"><section class="doc-section"><h2>标题</h2><p>段</p></section></main>`);
  assert.ok(targetsOf(text(plainTitle, "标题")).includes("paragraph"), "a section's heading turns into text like any heading (one with an id, which a link may name, keeps its type)");
  convertBlock(text(typed, "甲段"), "heading3");
  assert.ok(saved(typed).includes('<h3 data-block-id="pa000001">甲段。</h3>'));
}

// A divider line is a block like any other: its menu turns it into another type, an empty block of
// that type in its place (written at once, empty: a free text block may be); the line goes.
{
  const source = `<main class="doc-page">
  <section class="doc-section">
    <hr>
    <h2>标题</h2>
    <p>正文</p>
  </section>
</main>
`;
  const page = openPage(source);
  const rule = page.document.querySelector("hr");
  assert.deepEqual(emptyTargets(rule), ["paragraph", "note", "heading1", "heading2", "heading3", "heading4", "bullets", "numbers", "todo", "details", "flowchart", "highlight", "callout", "quote", "code", "math"], "the grid's types (a divider is none of them)");
  const focus = convertEmpty(rule, "heading2").focus;
  assert.ok(focus.tagName === "H2" && focus.textContent === "" && !page.document.querySelector("hr"));
  assert.equal(saveAll(page, source).text, source.replace("    <hr>\n", "    <h2></h2>\n"), "empty, the heading is written empty where the line was");
  focus.textContent = "新标题";
  assert.equal(saveAll(page, source).text, source.replace("    <hr>\n", "    <h2>新标题</h2>\n"));
  const line = page.document.createElement("hr");
  line.setAttribute("data-ge-unit-kind", "rule");
  assert.equal(convertEmpty(line, "divider").focus, null, "its own type changes nothing");
}

// A text leaf told by a class of its own is read by its definition alone, on the page and by the
// server, so a new one needs no engine: it turns into a paragraph and back, written as it was.
for (const [type, spec] of Object.entries(BLOCK_TYPES).filter(([name, each]) => TEXT_TYPES.has(name) && each.className)) {
  const written = `<${spec.tag} class="${spec.className}">文字</${spec.tag}>`;
  const source = `<main class="doc-page">\n  ${written}\n  <p>后面</p>\n</main>\n`;
  const page = openPage(source);
  const block = page.document.querySelector(`.${spec.className}`);
  assert.deepEqual([typeOf(block), ownTypeOf(block)], [type, type], `${type} is told by its definition`);
  assert.equal(convertible({ kind: spec.kind, tag: spec.tag, text: "文字" }, []), "text", `${type} is a unit the server turns`);
  const { focus } = convertBlock(block, "paragraph");
  assert.equal(saveAll(page, source).text, source.replace(written, "<p>文字</p>"), `${type} turned into a paragraph`);
  convertBlock(focus, type);
  assert.equal(saveAll(page, source).text, source, `${type} made again of a paragraph`);
}

// The "/" menu's search (slash-menu/): what is typed after "/" (a name, pinyin, its initials, an
// English word) puts the rows it is just that first, then those starting with it, then those
// having it inside: "gl" is 高亮块 before 折叠列表 ("toggle"). Every block's own name finds it first.
{
  const { typeItems } = await import("../../src/editor/page/slash-menu/index.mjs");
  const { TYPE_INFO } = await import("../../src/editor/components/registry.mjs");
  const keys = [...Object.keys(TYPE_INFO), "inline:formula", "inline:link"];
  const first = (query) => typeItems(keys, () => {}, query)[0]?.label ?? null;
  for (const [query, label] of [["gl", "高亮块"], ["tp", "图片"], ["bt1", "标题 1"], ["yy", "引用块"], ["dm", "代码块"], ["fhlb", "符号列表"], ["gs", "公式"], ["lj", "链接"], ["toggle", "折叠列表"]]) {
    assert.equal(first(query), label, `"/${query}" finds ${label} first`);
  }
  for (const key of keys) {
    const { label } = TYPE_INFO[key] ?? { label: key === "inline:formula" ? "公式" : "链接" };
    assert.equal(first(label), label, `its own name finds ${label} first`);
  }
  assert.deepEqual(typeItems(keys, () => {}, "gl").map((row) => row.label), ["高亮块", "折叠列表"]);
  // In a block holding nothing but the "/…": the blocks first (/gs: 公式块, then 公式).
  assert.deepEqual(typeItems(keys, () => {}, "gs", { blocks: true }).slice(0, 2).map((row) => row.label), ["公式块", "公式"]);
  assert.deepEqual(typeItems(keys, () => {}, "gs").slice(0, 2).map((row) => row.label), ["公式", "公式块"]);
}

// What the reader hid of the built-in blocks (设置 › 组件列表, page/offered.mjs): the blocks of a component
// go from "/", 在下方新建 and the handle's grid, by one filter, and from nothing else. What says it
// cannot be hidden stays whatever it is told, and no block type is left without a line in the settings.
{
  const { typeItems } = await import("../../src/editor/page/slash-menu/index.mjs");
  const { BLOCK_TYPES, HIDEABLE, KIND_ICONS, LISTED_BLOCKS, MARKDOWN, TURN_INTO, TYPE_COMPONENT, TYPE_INFO } = await import("../../src/editor/components/registry.mjs");
  const { hideBlocks, offered, offeredTurn } = await import("../../src/editor/page/offered.mjs");
  const { followSettings } = await import("../../src/editor/components/installed/served.mjs");
  const { inLanguage } = await import("../../src/shared/i18n/index.mjs");
  const labels = (keys, query) => typeItems(keys, () => {}, query).filter((row) => row.label).map((row) => row.label);
  const keys = [...Object.keys(TYPE_INFO).filter((type) => BLOCK_TYPES[type].menu), "inline:formula", "inline:link"];
  const held = ["paragraph", "heading", "list", "section"];
  assert.deepEqual(LISTED_BLOCKS.filter(({ hideable }) => !hideable).map(({ id }) => id), held, "文本, 标题, 列表 and 分区 cannot be hidden, by their own definitions");
  assert.ok(Object.keys(BLOCK_TYPES).every((type) => !BLOCK_TYPES[type].menu || LISTED_BLOCKS.some(({ id }) => id === TYPE_COMPONENT[type])), "whatever a menu offers, the settings list");
  // Each line's mark (设置 › 组件列表): its component's first row in the "/" menu, or its unit's icon (分区).
  const menuOrder = [...MENU_GROUPS.basic, ...MENU_GROUPS.advanced];
  for (const { id, icon } of LISTED_BLOCKS) {
    const first = menuOrder.find((type) => TYPE_COMPONENT[type] === id);
    assert.equal(icon, first ? TYPE_INFO[first].icon : KIND_ICONS[id], `${id}: its line in the settings shows its first "/" row's icon, or its unit's`);
  }
  assert.deepEqual(["paragraph", "heading", "list"].map((id) => LISTED_BLOCKS.find((block) => block.id === id).icon), [TYPE_INFO.paragraph.icon, TYPE_INFO.heading1.icon, TYPE_INFO.bullets.icon], "文本, 标题 1, 符号列表: the first of each");
  for (const { name } of LISTED_BLOCKS) {
    assert.ok(/[\u4e00-\u9fff]/.test(inLanguage("zh", name)) && /^[A-Z]/.test(inLanguage("en", name)), `${inLanguage("zh", name)} says itself in both languages`);
  }

  hideBlocks(["quote", "code", "highlight"]);
  assert.ok(!labels(keys).includes("引用块") && !labels(keys, "yy").includes("引用块"), "hidden: not in the menu, nor found in it");
  assert.ok(labels(keys).includes("提示块") && labels(keys).includes("文本"), "the others stay");
  assert.ok(labels(keys, "gs").includes("公式"), "what is no block stays");
  assert.deepEqual(offered(["paragraph", "quote"]), ["paragraph"]);
  assert.deepEqual(offered(["paragraph", "quote"], "quote"), ["paragraph", "quote"], "a block of its type keeps its mark among them");
  assert.deepEqual(offered(["quote", "code"]), ["quote", "code"], "all a place takes stays: hiding stops no block from growing");
  assert.deepEqual(offeredTurn({ current: "highlight", types: ["highlight", "quote", "paragraph"], first: "x" }), { current: "highlight", types: ["highlight", "paragraph"], first: "x" }, "a block's grid, what else it says kept");
  assert.equal(offeredTurn(null), null, "a block that turns into nothing");
  assert.ok(TURN_INTO.includes("quote") && MARKDOWN.some(({ type }) => type === "quote"), "the type stands, for what reaches it by another way");

  hideBlocks(["paragraph", "heading", "list", "section", "nothing", "local/strip"]);
  assert.deepEqual(offered(TURN_INTO), TURN_INTO, "what may not be hidden stays, whatever a hand wrote");
  assert.ok(!HIDEABLE.has("paragraph") && HIDEABLE.has("code"));

  // The page's list follows, as all gallery.json's `hidden` reaches its menus: a menu reads the state an entry says.
  const components = [{ id: "local/a", state: "normal" }, { id: "local/b", state: "hidden" }, { id: "local/c", state: "normal" }];
  const settings = { hidden: ["local/a", "quote"], disabled: ["local/c"] };
  followSettings(components, settings);
  assert.deepEqual(components.map(({ state }) => state), ["hidden", "normal", "disabled"], "each package as the settings say");
  hideBlocks(settings.hidden);
  assert.ok(!offered(["paragraph", "quote"]).includes("quote"), "and each block");
  hideBlocks([]);
  assert.ok(labels(keys).includes("引用块"), "shown again, it is in the menu");
  assert.deepEqual(labels(["paragraph", "installed:local/gone"], "wenben"), ["文本"], "a package's row that went while a card stood open is no row of its search");
  assert.deepEqual(labels(["paragraph", "installed:local/gone"]), ["文本"], "nor of its list");
}

// The formula editor's symbol bar: six groups, every entry drawn by KaTeX (mhchem's too) as its
// card shows it and as it goes in (its places filled), twelve or fewer to a line.
{
  const { GROUPS, SLOT } = await import("../../src/editor/page/formula/symbols.mjs");
  const katex = (await import("katex")).default;
  await import("katex/contrib/mhchem");
  assert.equal(GROUPS.length, 6, "six groups");
  for (const group of GROUPS) {
    for (const section of group.sections) {
      assert.ok(section.columns <= 12, `${group.name}: at most twelve to a line`);
      for (const [snippet, shown, name] of section.entries) {
        for (const tex of [shown ?? snippet.replaceAll(SLOT, "{\\square}"), snippet.replaceAll(SLOT, "x")]) {
          assert.doesNotThrow(() => katex.renderToString(tex, { throwOnError: true, strict: "ignore" }), `${group.name}: ${name ?? snippet} (${tex})`);
        }
      }
    }
  }
}

// Writing a report: right before the rename, the file is read again; a changed file is left alone,
// and no temp file stays behind.
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-edit-"));
  const file = path.join(root, "demo", "report.html");
  await fs.mkdir(path.dirname(file));

  await fs.writeFile(file, "A");
  assert.equal(await writeAtomic(file, "B", { expect: "not A" }), false);
  assert.equal(await fs.readFile(file, "utf8"), "A");
  assert.equal(await writeAtomic(file, "B", { expect: "A" }), true);
  assert.equal(await fs.readFile(file, "utf8"), "B");
  assert.deepEqual(await fs.readdir(path.dirname(file)), ["report.html"]);
  await fs.rm(root, { recursive: true, force: true });
}

// A declared chart (data-doc-chart, charts.js) is one block of its card's: no script refers to it,
// so its card can be deleted like any block (a chart a script mounts by id stays), and nothing can
// be put into a declared chart standing on its own.
{
  const source = `<!doctype html><html><head><title>t</title></head><body><main>
  <section class="doc-section" aria-labelledby="s"><h2 id="s">图</h2>
    <figure class="doc-figure" data-surface="bounded"><h3>声明的图</h3><div data-doc-chart="dots"><script type="application/json">{"title":"t"}</script></div></figure>
    <figure class="doc-figure" data-surface="bounded"><h3>脚本画的图</h3><div id="mounted"></div></figure>
    <div data-doc-chart="dots"><script type="application/json">[1]</script></div>
  </section>
</main><script>DocCharts.define("dots", () => {}); DocCharts.get("#mounted");</script></body></html>`;
  const { units, boxes } = findUnits(source);
  const [declared, mounted] = units.filter((unit) => unit.kind === "figure");
  assert.equal(declared.keep, null, "a declared chart's card may be deleted");
  assert.equal(mounted.keep?.reason, "script", "a chart mounted by id stays");
  const bare = units.find((unit) => unit.tag === "div" && unit.kind === "block");
  assert.ok(bare && !boxes.some((box) => box.unit === bare.id), "a declared chart holds no blocks");
  const removed = applyEdits({ current: source, edits: [], units: [{ id: declared.id, remove: true }] });
  assert.ok(removed.ok && !removed.text.includes("声明的图") && removed.text.includes("脚本画的图"));
}

// A kit section with no blocks left (its last paragraph just went) still takes blocks, as the
// kit's other containers do; a class-less <section> with nothing in it is no box.
{
  const page = (inner) => `<!doctype html><html><body><main class="doc-page"><header class="doc-header"><h1 class="doc-title">t</h1></header>${inner}</main></body></html>`;
  const kinds = (inner) => {
    const { units, boxes } = findUnits(page(inner));
    return boxes.filter((box) => box.unit !== null).map((box) => `${box.kind}@${units.find((unit) => unit.id === box.unit).kind}`);
  };
  assert.deepEqual(kinds(`<section class="doc-section" data-block-id="aaaaaaaa">\n  </section>`), ["section@section"], "an emptied kit section is still a box");
  assert.deepEqual(kinds(`<section>\n  </section>`), [], "an empty class-less section is not");
  const empty = page(`<section class="doc-section" data-block-id="aaaaaaaa">\n    </section>`);
  const written = commitEdits({ current: empty, opening: null, texts: [], units: [{ key: "u0", insert: { type: "bullets", key: "n0", children: [{ type: "item", html: "是的", key: "n1" }] }, place: { into: { unit: { key: 0, id: "aaaaaaaa" }, kind: "section" } } }], touch: [] });
  assert.equal(written.units?.[0]?.status, "applied", "a list goes into it");
  assert.match(written.text, /<section class="doc-section" data-block-id="aaaaaaaa">\s*<ul[^>]*>\s*<li[^>]*>是的<\/li>\s*<\/ul>\s*<\/section>/);
}

// Spaces as the page shows them: the non-breaking spaces the browser types while a text is edited
// (at the end of a text, before a mark, next to another space) never reach the file, where they
// would glue words together and break lines early; runs of ordinary spaces are left as they are.
{
  const { document: doc } = new JSDOM("<p></p>").window;
  const p = doc.querySelector("p");
  const nb = " ";
  p.innerHTML = `<strong>before${nb}</strong>next here${nb} HTML two${nb} spaces 3${nb}GB`;
  assert.equal(serializeInner(p), "<strong>before </strong>next here HTML two spaces 3 GB");
  p.innerHTML = `a${nb}${nb}${nb}b and\n      c  d`;
  assert.equal(serializeInner(p), "a b and\n      c  d", "a run with non-breaking spaces is one space; the source's own spacing stays");
}

// Columns (分栏): widths as shares of the row (1/n for a new one, the others making room in proportion,
// a dragged gap snapping to tenths, each at least 1/24); a row made on the page (blocks dropped beside a block, 分栏 in a
// block's menu) written once each of its columns has something; a column added; rows kept tidy.
{
  const near = (ratios) => ratios.map((ratio) => Math.round(ratio * 1000) / 1000);
  assert.deepEqual(near(ratiosAfterAdd([0.5, 0.5], 2)), [0.333, 0.333, 0.333], "a new column takes 1/n");
  assert.deepEqual(near(ratiosAfterAdd([0.7, 0.3], 0)), [0.333, 0.467, 0.2], "the others make room in proportion");
  assert.deepEqual(near(ratiosAfterRemove([0.2, 0.3, 0.5], [0])), [0.375, 0.625], "a column gone leaves its share to the others in proportion");
  assert.deepEqual(near(ratiosAfterResize([0.5, 0.5], 0, 0.105)), [0.6, 0.4], "a gap dragged snaps to a tenth of the row");
  assert.deepEqual(near(ratiosAfterResize([0.3, 0.5], 0, 0.095)), [0.4, 0.4], "and to the two columns' equal split");
  assert.deepEqual(near(ratiosAfterResize([0.5, 0.5], 0, -0.9)), [0.042, 0.958], "each keeps at least 1/24");
  assert.deepEqual(near(ratiosAfterResize([0.4, 0.3, 0.3], 1, 0.25, [0.2, 0.25, 0.2])), [0.4, 0.4, 0.2], "or more where a part needs it (a flowchart's node as narrow as the kit lets it be): the right one stops at its least");
  assert.deepEqual(near(ratiosAfterResize([0.5, 0.5], 0, -0.4, [0.3, 0.3])), [0.3, 0.7], "and the left one");
  assert.deepEqual(ratiosAfterResize([0.3, 0.3], 0, 0.1, [0.35, 0.35]), [0.3, 0.3], "two that cannot both keep theirs: nothing moves");
  assert.deepEqual(near(ratiosAfterResize([0.5, 0.5], 0, 0.105, [], 0.004)), [0.605, 0.395], "within less than the near given (the page's 5px of the row): no snap");
  assert.deepEqual(near(ratiosAfterResize([0.5, 0.5], 0, 0.103, [], 0.004)), [0.6, 0.4], "within it: the tenth");
  assert.deepEqual(near(ratiosAfterResize([0.5, 0.5], 0, 0.001, [], 0)), [0.501, 0.499], "0: no snapping at all");
  // The least share is the shared description's (1/24) for the page and the server alike: what the page writes the file takes, what is below it neither.
  assert.equal(sizeValue("column", "--doc-column-ratio", "0.042"), "0.042", "the least share the page writes is taken");
  assert.equal(sizeValue("column", "--doc-column-ratio", "0.04"), null, "one below 1/24 is not (gallery check refuses it too)");
  assert.equal(sizeValue("column", "--doc-column-ratio", String(1 / 24 - 1e-12)), "0.042", "a share at the floor by arithmetic's last digit is the floor");
  assert.equal(sizeValue("column", "--doc-column-ratio", String(1 + 1e-12)), "1", "and at the ceiling");

  const source = `<main>\n  <section class="doc-section">\n    <h2>节</h2>\n    <p>甲</p>\n    <p>乙</p>\n  </section>\n</main>\n`;
  const ids = (page) => [...page.document.querySelectorAll("p[data-ge-unit]")].map((node) => node);
  const beside = openPage(source);
  const [a, b] = ids(beside);
  rowAround(a, [[b]], "right");
  const besideText = saveAll(beside, source).text;
  assert.equal(besideText, `<main>\n  <section class="doc-section">\n    <h2>节</h2>\n    <div class="doc-columns">\n      <div class="doc-column">\n        <p>甲</p>\n      </div>\n      <div class="doc-column">\n        <p>乙</p>\n      </div>\n    </div>\n  </section>\n</main>\n`, "two blocks side by side: a row written around them");

  // 分栏 on a block: the row is written at once, its new column with an empty paragraph.
  const split = openPage(source);
  const { focus } = splitBeside(ids(split)[0]);
  assert.ok(saveAll(split, source).text.includes(`    <div class="doc-columns">\n      <div class="doc-column">\n        <p>甲</p>\n      </div>\n      <div class="doc-column">\n        <p></p>\n      </div>\n    </div>\n    <p>乙</p>`), "a row whose new column holds an empty paragraph: written with it");
  focus.textContent = "丙";
  assert.ok(saveAll(split, source).text.includes(`    <div class="doc-columns">\n      <div class="doc-column">\n        <p>甲</p>\n      </div>\n      <div class="doc-column">\n        <p>丙</p>\n      </div>\n    </div>\n    <p>乙</p>`), "once it has text, the row with it");
  // 分三栏: the block and two new columns, the caret's in the first of them.
  const threePage = openPage(source);
  const threeMade = splitBeside(ids(threePage)[0], 3);
  threeMade.focus.textContent = "丙";
  assert.ok(saveAll(threePage, source).text.includes(`      <div class="doc-column">\n        <p>甲</p>\n      </div>\n      <div class="doc-column">\n        <p>丙</p>\n      </div>\n      <div class="doc-column">\n        <p></p>\n      </div>\n    </div>\n    <p>乙</p>`), "分三栏: three columns, the block in the first");
  // A folded heading goes into its column with what it hides (fold/ withHidden: blocks next to each
  // other given as one), for 分栏 and the check offering it, which reads them as next to each other.
  const chapter = `<main>\n  <h2>章</h2>\n  <p>甲</p>\n  <p>乙</p>\n  <p>丙</p>\n</main>\n`;
  const foldedPage = openPage(chapter);
  const [foldHead, foldOne, foldTwo, foldThree] = foldedPage.document.querySelectorAll("main > [data-ge-unit]");
  const withHidden = (unit) => (unit === foldHead ? [foldHead, foldOne, foldTwo] : [unit]);
  assert.equal(columnsCheck([foldHead, foldThree], withHidden), "", "a folded heading and the block after what it hides: next to each other");
  assert.notEqual(columnsCheck([foldHead, foldThree]), "", "blocks between, taken alone: not");
  splitBeside(withHidden(foldHead));
  assert.ok(saveAll(foldedPage, chapter).text.includes(`  <div class="doc-columns">\n    <div class="doc-column">\n      <h2>章</h2>\n      <p>甲</p>\n      <p>乙</p>\n    </div>\n    <div class="doc-column">\n      <p></p>\n    </div>\n  </div>\n  <p>丙</p>`), "分两栏 of a folded heading: its column holds what it hides");
  const rowPage = openPage(chapter);
  const [h, a1, a2, a3] = rowPage.document.querySelectorAll("main > [data-ge-unit]");
  rowOf([[h, a1, a2], a3]);
  assert.ok(saveAll(rowPage, chapter).text.includes(`  <div class="doc-columns">\n    <div class="doc-column">\n      <h2>章</h2>\n      <p>甲</p>\n      <p>乙</p>\n    </div>\n    <div class="doc-column">\n      <p>丙</p>\n    </div>\n  </div>`), "分成两栏 with it: the same");

  // A row of the file: a column added (the shares make room), and widths written as sizes.
  const file = `<main>\n  <section class="doc-section">\n    <div class="doc-columns">\n      <div class="doc-column" style="--doc-column-ratio: .6">\n        <p>左</p>\n      </div>\n      <div class="doc-column" style="--doc-column-ratio: .4">\n        <p>右</p>\n      </div>\n    </div>\n    <p>下</p>\n  </section>\n</main>\n`;
  const added = openPage(file);
  const row = added.document.querySelector(".doc-columns");
  const made = addColumn(row, 2, [added.document.querySelector("p[data-ge-unit]:not(.doc-columns p)")]);
  assert.ok(made.created.length === 1, "one column made");
  const addedText = saveAll(added, file).text;
  assert.equal(addedText, `<main>\n  <section class="doc-section">\n    <div class="doc-columns">\n      <div class="doc-column" style="--doc-column-ratio: 0.4">\n        <p>左</p>\n      </div>\n      <div class="doc-column" style="--doc-column-ratio: 0.267">\n        <p>右</p>\n      </div>\n      <div class="doc-column" style="--doc-column-ratio: 0.333">\n        <p>下</p>\n      </div>\n    </div>\n  </section>\n</main>\n`, "the new column with its share, the others' shares made smaller");

  // A column emptied goes, its share to the other; a row of one column gives its blocks back.
  const emptied = openPage(file);
  const [left, right] = [...emptied.document.querySelectorAll(".doc-column p")];
  const section = emptied.document.querySelector("section");
  left.remove();
  settleRows([emptied.document.querySelector(".doc-columns")]);
  assert.equal(emptied.document.querySelector(".doc-columns"), null, "the row left with one column goes");
  assert.equal(right.parentElement, section, "its blocks where the row stood");
  assert.equal(saveAll(emptied, file).text, `<main>\n  <section class="doc-section">\n    <p>右</p>\n    <p>下</p>\n  </section>\n</main>\n`);
  const three = file.replace(`      <div class="doc-column" style="--doc-column-ratio: .4">`, `      <div class="doc-column" style="--doc-column-ratio: .2">\n        <p>中</p>\n      </div>\n      <div class="doc-column" style="--doc-column-ratio: .2">`);
  const middle = openPage(three);
  middle.document.querySelectorAll(".doc-column p")[1].remove();
  settleRows([middle.document.querySelector(".doc-columns")]);
  assert.deepEqual([...middle.document.querySelectorAll(".doc-column")].map((column) => column.style.getPropertyValue("--doc-column-ratio")), ["0.75", "0.25"], "the other columns take its share");
  assert.ok(saveAll(middle, three).ok);

  // The checks: a row of one column, a block between columns, shares on some columns only.
  const checked = (body) => componentFailures(`<main class="doc-page">${body}</main>`).map((failure) => failure.replace(/ \(line \d+\)/g, ""));
  assert.deepEqual(checked('<div class="doc-columns"><div class="doc-column"><p>a</p></div></div>'), ["columns has 1 of columns (.doc-column), at least 2"]);
  assert.deepEqual(checked('<div class="doc-columns"><div class="doc-column"></div><p>x</p><div class="doc-column"></div></div>'), ["columns holds a <p>: only its columns (.doc-column) go in it"]);
  assert.match(checked('<div class="doc-columns"><div class="doc-column" style="--doc-column-ratio: .5"></div><div class="doc-column"></div></div>')[0], /on 1 of its 2 columns: write it on every one of them, or on none/);
  assert.deepEqual(checked('<div class="doc-columns"><div class="doc-column" style="--doc-column-ratio: .7"></div><div class="doc-column" style="--doc-column-ratio: .3"></div></div>'), []);
}

// The format brush remembers the formats set on one selection; another selection's first format
// starts it over; formats taken off other text leave it alone; text it was just put on counts as
// its selection.
{
  const one = {};
  const other = {};
  noteEffects(one, { start: 0, end: 2 }, { bold: true });
  noteEffects(one, { start: 0, end: 2 }, { text: "red" });
  assert.deepEqual(currentEffects(), { bold: true, text: "red" });
  noteEffects(one, { start: 3, end: 5 }, { bold: false });
  assert.deepEqual(currentEffects(), { bold: true, text: "red" }, "taking a format off other text leaves the brush");
  noteEffects(other, { start: 0, end: 2 }, { underline: { color: "blue", weight: "thick" } });
  assert.deepEqual(currentEffects(), { underline: { color: "blue", weight: "thick" } });
  noteEffects(other, { start: 0, end: 2 }, { highlight: "yellow" });
  noteEffects(other, { start: 0, end: 2 }, { underline: false });
  assert.deepEqual(currentEffects(), { highlight: "yellow" }, "a format taken off its own selection leaves the brush");
  brushed(one, { start: 6, end: 8 });
  noteEffects(one, { start: 6, end: 8 }, { italic: true });
  assert.deepEqual(currentEffects(), { highlight: "yellow", italic: true }, "a format set on brushed text adds to the brush");
  const all = { bold: true, strike: true, text: "red", highlight: "yellow", underline: { color: "default", weight: "thin" } };
  assert.deepEqual(effectChanges(all), [["bold", true], ["strike", true], ["text", "red"], ["highlight", "yellow"], ["underlineColor", "default"], ["underlineWeight", "thin"]]);
  assert.equal(describeEffects(all), "加粗、删除线、红色文本、黄色背景、细下划线");
  assert.equal(describeEffects({ underline: { color: "blue", weight: "thick" } }), "蓝色粗下划线");
}

// Blocks left empty stay: a code block, a callout (its paragraph empty), a formula block (\[\]), a disclosure
// with no title and no blocks, and the media blocks (an empty figure: the page editor's
// placeholder, shown to no reader) are written so and read back as blocks, the checks content; one
// written half empty (a picture with nothing else) is refused.
{
  const plain = "<main>\n  <p>前文</p>\n</main>\n";
  const add = (insert) => applyEdits({ current: plain, edits: [], units: [{ id: "n0", insert: { key: "n0", ...insert }, place: { after: 0 } }] });
  const cases = [
    [{ type: "code", html: "" }, /<div class="doc-code"><div class="doc-code-title"><\/div><pre><code><\/code><\/pre><\/div>/],
    [{ type: "math", html: "\\[\\]" }, /<div class="doc-math-block">\\\[\\\]<\/div>/],
    [{ type: "details", title: "", children: [] }, /<details class="doc-details">\s*<summary><span class="doc-details-summary-label"><\/span><\/summary>\s*<div class="doc-details-content"><\/div>\s*<\/details>/],
    [{ type: "image", src: "", caption: "" }, /<figure class="doc-image"><\/figure>/],
    [{ type: "file", href: "", name: "", caption: "" }, /<figure class="doc-file"><\/figure>/],
    [{ type: "bookmark", href: "", title: "", description: "", icon: null, cover: null, caption: "" }, /<figure class="doc-bookmark"><\/figure>/],
    [{ type: "embed", src: "", caption: "" }, /<figure class="doc-embed"><\/figure>/],
  ];
  for (const [insert, written] of cases) {
    const result = add(insert);
    assert.ok(result.ok && written.test(result.text), `an empty ${insert.type} is written: ${result.text}`);
    const units = findUnits(result.text).units.map((unit) => unit.kind);
    assert.equal(units.length, 2, `and read back as a block of its own (${insert.type}: ${units})`);
    assert.deepEqual(componentFailures(result.text), [], `the checks take an empty ${insert.type}`);
  }
  // The text blocks of the empty ones: a code block's code, a formula's TeX, the disclosure's title.
  const kinds = (text) => findBlocks(text).map((block) => block.kind);
  assert.ok(kinds(add(cases[0][0]).text).includes("code") && kinds(add(cases[1][0]).text).includes("tex") && kinds(add(cases[2][0]).text).includes("label"));
  assert.equal(add({ type: "image", src: "", caption: "说明" }).ok, false, "a caption with no picture is no placeholder");
  // A callout made empty holds its empty paragraph (a box that always holds a block), a box of the paragraph's flow.
  const emptyCallout = add({ type: "callout", children: [{ type: "paragraph", html: "" }] });
  assert.ok(emptyCallout.ok && /<div class="doc-callout">\s*<p><\/p>\s*<\/div>/.test(emptyCallout.text), `an empty callout is written: ${emptyCallout.text}`);
  assert.deepEqual(findUnits(emptyCallout.text).units.map((unit) => unit.kind), ["paragraph", "callout", "paragraph"], "read back as a callout holding its paragraph");
  assert.deepEqual(componentFailures(emptyCallout.text), [], "the checks take it");
  // One the file has empty (an empty one the editor wrote before 2026-11-07) is a box of blocks still, holding none.
  assert.deepEqual(findUnits('<main>\n  <div class="doc-callout"></div>\n</main>\n').boxes.map((box) => box.kind), ["main", "callout"]);

  // Served for editing, what is empty is as the page editor shows it from the first paint
  // (components/placeholder.mjs): an empty media figure holds its bar, an empty formula block
  // nothing, an empty inline formula or link its chip (its icon and name), their look in the head.
  const empties = '<main>\n  <p>甲<span class="doc-math-inline">\\(\\)</span>乙<a class="doc-link-mention"></a>丙</p>\n  <div class="doc-math-block">\\[\\]</div>\n  <figure class="doc-image"></figure>\n  <figure class="doc-embed"></figure>\n</main>\n';
  const service = createEditService({ reportsDirectory: os.tmpdir() });
  const served = service.preview("demo", empties);
  assert.match(served.html, /<figure class="doc-image"[^>]*><div class="ge-image-empty" data-doc-dev role="button"><svg[^]*<span>添加图片<\/span><\/div><\/figure>/);
  assert.match(served.html, /<figure class="doc-embed"[^>]*><div class="ge-embed-empty"/);
  assert.match(served.html, /<div class="doc-math-block"[^>]*><\/div>/);
  assert.match(served.html, /甲<span class="doc-math-inline" data-ge-empty="formula"><svg[^]*<span>新公式<\/span><\/span>乙<a class="doc-link-mention" data-ge-empty="link"><svg[^]*<span>链接<\/span><\/a>丙/);
  assert.ok(served.head.includes(".ge-image-empty") && served.head.includes("[data-ge-empty]"), "their look in the head");
  // Its tables open in the file's order (the kit's tables read the declaration: tests/unit/runtime.mjs).
  for (const page of [served]) assert.match(page.head, /<script data-doc-dev>[^<]*setAttribute\("data-ge-order", "file"\)/, "the head declares that the page holds the file's row order");
}

// A highlight panel of an aside's (natural HTML's: natural.mjs makes a class-less aside one) is the
// highlight block a div.doc-panel is: its block menu offers the same types, and it turns into a
// quote or a disclosure with what it holds.
{
  const source = `<main class="doc-page">
  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">一</h2>
    <aside class="doc-panel" id="side"><p>旁注</p></aside>
    <div class="doc-panel"><p>面板</p></div>
  </section>
</main>
`;
  const panels = (page) => [page.document.querySelector("aside.doc-panel"), page.document.querySelector("div.doc-panel")];
  const opened = openPage(source);
  const [aside, div] = panels(opened);
  assert.ok(containerTargets(aside).length > 0, "the aside's panel has types to turn into");
  assert.deepEqual(containerTargets(aside), containerTargets(div), "the same as a div's");
  // Turned into a quote: written as the div's would be.
  const turned = (before) => {
    const page = openPage(before);
    convertContainer(page.document.querySelector(".doc-panel"), "quote");
    const result = saveAll(page, before);
    assert.ok(result.ok, JSON.stringify(result.conflicts));
    return result.text;
  };
  const alone = (tag) => source.replace(/ {4}<aside[^\n]*\n {4}<div[^\n]*\n/, `    <${tag} class="doc-panel" id="side"><p>旁注</p></${tag}>\n`);
  assert.equal(turned(alone("aside")), turned(alone("div")), "into a quote as the div's");
  assert.ok(turned(alone("aside")).includes("<blockquote") && turned(alone("aside")).includes("<p>旁注</p>"), turned(alone("aside")));
}

// Ctrl+A's steps (page/select-all/), as the page takes them press after press: from a text block
// once its text is all selected, the container blocks around it one level each (a highlight block's
// blocks without its icon, the blocks a list item holds, a column, then the row of columns whole, a
// Sheet's panel, then the Sheet area whole; a cell, then its table whole), a step selecting nothing
// more passed over (a highlight block whole is more than its blocks: its box), sections and lists no
// step, the page last (the header's lines and the page's blocks, never the title); in an open detail
// card, its content the top.
{
  const steps = (source, text, { from = null } = {}) => {
    const { document: doc } = openPage(source);
    const own = (node) => [...node.childNodes].filter((child) => child.nodeType === 3 || !/^(UL|OL|P)$/.test(child.tagName)).map((child) => child.textContent).join("").trim();
    const name = (unit) => `${unit.localName}:${unit.textContent.replace(/\s+/g, "")}`;
    const host = from ? null : [...doc.querySelectorAll("[data-ge-block]")].find((node) => own(node) === text);
    assert.ok(from || host, `a text block "${text}"`);
    let list = from ? stepsAbove(around([doc.querySelector(from)])) : stepsFromText(host);
    let reached = from ? coverage([doc.querySelector(from)]) : new Set([host]);
    const taken = [];
    // The first press after the text: the top takes the text's block even alone in it (a page of one paragraph).
    for (let step = nextStep(list, reached, { text: !from }); step; step = nextStep(list, reached)) {
      taken.push(step.units.map(name));
      reached = coverage(step.units);
      list = step.top ? [] : stepsAbove(around(step.units)); // the next press: from the blocks selected
    }
    return taken;
  };
  const source = `<main class="doc-page">
  <header class="doc-header"><h1 class="doc-title">标题</h1><p>页眉一行</p></header>
  <div class="doc-panel"><div class="doc-icon">💡</div><p>面板段</p><ul><li>外项<ul><li>里项</li><li>里二</li></ul></li></ul></div>
  <section class="doc-section"><h2>分区</h2><div class="doc-columns"><div class="doc-column"><blockquote><p>引用</p></blockquote></div><div class="doc-column"><p>右栏</p><p>右二</p></div></div></section>
  <section class="doc-sheet-shell" data-doc-sheets="s"><div class="doc-sheet-tabs" role="tablist"><button class="doc-sheet-tab" type="button" data-sheet-tab="a">甲</button><button class="doc-sheet-tab" type="button" data-sheet-tab="b">乙</button></div><div data-doc-sheet="a" role="tabpanel"><p>甲一</p><p>甲二</p></div><div data-doc-sheet="b" role="tabpanel"><p>乙一</p></div></section>
  <p>页尾</p>
</main>
`;
  const PAGE = ["p:页眉一行", "div:💡面板段外项里项里二", "section:分区引用右栏右二", "section:甲乙甲一甲二乙一", "p:页尾"];
  const PANEL = ["p:面板段", "ul:外项里项里二"];
  assert.deepEqual(steps(source, "里项"), [["ul:里项里二"], PANEL, PAGE], "a nested item: the blocks of the item above, the highlight block's (no icon), the page");
  assert.deepEqual(steps(source, "外项"), [PANEL, PAGE], "an item holding a list: the highlight block's blocks");
  assert.deepEqual(steps(source, "面板段"), [PANEL, PAGE], "a highlight block's paragraph");
  assert.deepEqual(steps(source, "引用"), [["div:引用右栏右二"], PAGE], "a quote's only paragraph in a column holding only the quote: the row whole, the section no step");
  assert.deepEqual(steps(source, "右栏"), [["p:右栏", "p:右二"], ["div:引用右栏右二"], PAGE], "a column's paragraph: the column's blocks, the row whole");
  assert.deepEqual(steps(source, "甲一"), [["p:甲一", "p:甲二"], ["section:甲乙甲一甲二乙一"], PAGE], "a Sheet panel's paragraph: the panel's blocks, the Sheet area whole");
  assert.deepEqual(steps(source, "", { from: '[data-sheet-tab="a"]' }), [["section:甲乙甲一甲二乙一"], PAGE], "a selected tab: the Sheet area whole");
  assert.deepEqual(steps(source, "页眉一行"), [PAGE], "a line of the header: the page");
  assert.deepEqual(steps(source, "标题"), [PAGE], "the title: the page, the title no block of it");
  assert.deepEqual(steps(source, "页尾"), [PAGE], "a paragraph of the page");
  assert.deepEqual(steps(source, "", { from: "main > p" }), [PAGE], "a selected block of the page: the page");
  const table = `<main class="doc-page">
  <header class="doc-header"><h1 class="doc-title">标题</h1></header>
  <div class="doc-panel"><p>表前</p><div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>名</th></tr></thead><tbody><tr><td>格</td></tr></tbody></table></div></div>
</main>
`;
  assert.deepEqual(steps(table, "格"), [["div:名格"], ["p:表前", "div:名格"], ["div:表前名格"]], "a cell: the table whole, the highlight block's blocks, the page");
  const card = `<main class="doc-page">
  <header class="doc-header"><h1 class="doc-title">标题</h1></header>
  <p>入口 <a class="doc-dialog-trigger" href="#c">卡片</a></p>
  <dialog class="doc-dialog" id="c" open><div class="doc-dialog-panel"><div class="doc-dialog-content"><h3>卡片标题</h3><p>卡一</p><div class="doc-panel"><p>卡里面板</p></div></div></div></dialog>
</main>
`;
  const CARD = ["h3:卡片标题", "p:卡一", "div:卡里面板"];
  assert.deepEqual(steps(card, "卡里面板"), [CARD], "in an open detail card: its content the top (the panel's only block passed over)");
  assert.deepEqual(steps(card, "卡片标题"), [CARD], "a heading in a detail card: its content, as any block's");
  // The top holding only the block whose text was selected: that block, as blocks (as a press with
  // its text all selected gives), not nothing.
  const lone = `<main class="doc-page">
  <header class="doc-header"><h1 class="doc-title">标题</h1></header>
  <p>唯一段落 <a class="doc-dialog-trigger" href="#a">甲</a></p>
  <dialog class="doc-dialog" id="a" open><div class="doc-dialog-panel"><div class="doc-dialog-content"><h3>甲卡</h3><p>甲一 <a class="doc-dialog-trigger" href="#b">乙</a></p><p>甲二</p></div></div></dialog>
  <dialog class="doc-dialog" id="b" open><div class="doc-dialog-panel"><div class="doc-dialog-content"><p>乙唯一</p></div></div></dialog>
</main>
`;
  assert.deepEqual(steps(lone, "唯一段落 甲"), [["p:唯一段落甲"]], "a page of one paragraph: after its text, the paragraph");
  assert.deepEqual(steps(lone, "乙唯一"), [["p:乙唯一"]], "a detail card of one paragraph: after its text, the paragraph");
  // Two cards open, B over A (A first in the file): the one the press is in, never the other.
  assert.deepEqual(steps(lone, "甲二"), [["h3:甲卡", "p:甲一乙", "p:甲二"]], "a block of the card under it: that card's own content");
  {
    const { document: doc } = openPage(lone);
    assert.equal(openCard(doc)?.id, "b", "no focus and no layout: the last card open");
    assert.equal(openCard(doc, doc.querySelector("main > p")), null, "from the page: no card");
    assert.deepEqual(topStep(doc, doc.querySelector("#b p")).units.map((unit) => unit.textContent), ["乙唯一"], "from a block of B: B's content");
  }
  // A selection across blocks: the first container holding them, though it selects no more blocks.
  const { document: across } = openPage(source);
  const ends = [...across.querySelectorAll(".doc-column:last-child > p")];
  assert.deepEqual(nextStep(stepsAbove(around(ends)), coverage(ends), { strict: false }).units, ends, "across blocks: the container holding both ends");
}

// A flowchart's step written as a node (natural.mjs makes one of a step written the short way): a unit
// of kind step in the flowchart's box, a box of its own kind (node) whose blocks are its units, its
// icon first among them, its title the first paragraph, and no text block of the step's own; one
// written the short way, or an empty one (natural.mjs makes both nodes before a page shows them), is a
// step still read with its own words, the blocks it holds after them a box of their own. An icon
// given to a node goes first in it, whatever place the page names; one taken out of a node is never
// the page's (report.json's icon stays as it is).
{
  const source = '<main class="doc-page">\n  <ol class="doc-flow">\n    <li><p><strong>收集</strong></p><p>说明</p></li>\n    <li data-direction="row" style="--doc-flow-ratio: .4"><div class="doc-icon">📮</div><p><strong>分派</strong></p></li>\n    <li>旧写法<p>内容</p></li>\n    <li></li>\n  </ol>\n</main>\n';
  const { units, boxes } = findUnits(source);
  assert.deepEqual(units.map((unit) => `${unit.kind}@${boxes[unit.box].kind}`), ["flowchart@main", "step@flowchart", "paragraph@node", "paragraph@node", "step@flowchart", "icon@node", "paragraph@node", "step@flowchart", "step@flowchart", "paragraph@nest"]);
  const blocks = findBlocks(source);
  assert.deepEqual(blocks.map((block) => `${block.tag}:${source.slice(block.innerStart, block.innerEnd)}`), ["p:<strong>收集</strong>", "p:说明", "p:<strong>分派</strong>", "li:旧写法", "p:内容", "li:"], "a node's paragraphs are its text blocks; a step written the short way its words");
  const [second] = units.filter((unit) => unit.kind === "paragraph" && source.slice(unit.start, unit.end) === "<p>说明</p>");
  const given = applyEdits({ current: source, edits: [], units: [{ id: "n0", insert: { type: "icon", icon: "🎯" }, place: { after: second.id } }] });
  assert.ok(given.ok && given.text.includes('<li><div class="doc-icon">🎯</div><p><strong>收集</strong></p><p>说明</p></li>') && given.icon === undefined, `an icon given to a node: first in it, not the page's: ${given.text}`);
  const icon = units.find((unit) => unit.kind === "icon");
  const taken = applyEdits({ current: source, edits: [], units: [{ id: icon.id, remove: true }] });
  assert.ok(taken.ok && !taken.text.includes("doc-icon") && taken.text.includes('<li data-direction="row" style="--doc-flow-ratio: .4"><p><strong>分派</strong></p></li>') && taken.icon === undefined, `an icon taken out of a node: report.json's stays: ${taken.text}`);
}

// A node is no list item (components/flowchart/; core.mjs): the lines above and below a block of a
// node, the item a list in it hangs from and the item holding a block stop at the node, so Backspace,
// Delete, Tab and Shift+Tab keep to it; its first line, its title, splits with what follows the caret a
// plain paragraph below it (bold taken off when the title was bold throughout), never a block before
// it, and is turned into nothing. A node made on the page (the "+", Enter on the empty last block, a
// flowchart made by "/") is written by the server as <li> holding its blocks, with its color, direction
// and weight; refused with a color it does not take or a weight that is no share.
{
  const { firstLineOf, isFirstLine, holderItem } = await import("../../src/editor/page/core.mjs");
  const { newStep, asTitle, titleWords } = await import("../../src/editor/components/flowchart/page.mjs");
  const source = `<main class="doc-page">
  <p>前面</p>
  <ol class="doc-flow">
    <li><div class="doc-icon">📮</div><p><strong>收集数据</strong></p><ul><li>一线<ul><li>二线</li></ul></li><li>技术</li></ul><p>说明</p></li>
    <li><p><strong>回访</strong></p></li>
  </ol>
  <p>结尾</p>
</main>
`;
  const page = openPage(source);
  const text = (words) => [...page.document.querySelectorAll("[contenteditable='true']")].find((node) => node.textContent.trim().startsWith(words));
  const [first, second] = page.document.querySelectorAll("ol.doc-flow > li");
  assert.deepEqual([firstLineOf(first), isFirstLine(text("收集数据")), isFirstLine(text("说明")), isFirstLine(text("回访"))], [text("收集数据"), true, false, true], "a node's first line: its title, after its icon");
  assert.deepEqual([parentItem(text("一线")), parentItem(text("二线")), holderItem(text("说明")), holderItem(page.document.querySelector("ol.doc-flow ul"))], [null, text("一线"), null, null], "a list in a node hangs from no item; the item a nested list hangs from is an item");
  assert.deepEqual([previousLine(text("收集数据"))?.className, previousLine(text("说明")), previousLine(text("一线")), previousLine(text("结尾"))], ["doc-icon", text("技术"), null, page.document.querySelector("ol.doc-flow")], "the line above: within the node; after a flowchart, the flowchart");
  assert.deepEqual([nextLine(text("技术")), nextLine(text("说明")), nextLine(text("回访")), nextLine(text("二线"))], [text("说明"), null, null, text("技术")], "the line below: within the node, none after its last block");
  assert.deepEqual([targetsOf(text("收集数据")), typedTargets(text("收集数据"), true), targetsOf(text("说明")).includes("heading2")], [[], [], true], "a title is turned into nothing (no Markdown shortcut either); the rest of a node's blocks are");
  // Enter in a title: at its start, its end and in its middle.
  const split = (host, at) => {
    const range = page.document.createRange();
    const node = host.querySelector("strong")?.firstChild ?? host.firstChild;
    range.setStart(node, at);
    return splitBlock(host, range);
  };
  const title = text("回访");
  const tail = split(title, 1);
  assert.deepEqual([serializeInner(title), tail.localName, serializeInner(tail), tail.previousElementSibling], ["<strong>回</strong>", "p", "访", title], "in its middle: the rest a plain paragraph below it");
  const atEnd = split(title, 1);
  assert.deepEqual([serializeInner(title), serializeInner(atEnd), atEnd.previousElementSibling], ["<strong>回</strong>", "", title], "at its end: an empty paragraph below it, no empty bold in it");
  const atStart = split(title, 0);
  assert.deepEqual([serializeInner(title), serializeInner(atStart), heldIn(second)[0]], ["", "回", title], "at its start: the title empty (first still), its words a plain paragraph below");
  const partly = page.document.createElement("p");
  partly.innerHTML = "<strong>甲</strong>乙";
  assert.deepEqual([serializeInner(asTitle(partly)), titleWords(partly)], ["<strong>甲乙</strong>", "甲乙"], "words bold in part made a title: bold throughout, as the natural rule makes them");
  const someBold = page.document.createElement("p");
  someBold.innerHTML = "<strong>甲</strong>乙";
  assert.equal(titleWords(someBold), "<strong>甲</strong>乙", "a title the reader un-bolded in part: its words as they are in an item");
  const plain = page.document.createElement("p");
  plain.innerHTML = "收集 <em>数据</em>";
  assert.deepEqual([asTitle(plain).innerHTML, titleWords(plain)], ["<strong>收集 <em>数据</em></strong>", "收集 <em>数据</em>"], "made a title: bold throughout; its words back without it");

  // A structural step that leaves a node with no title first (its title deleted or dragged away) puts
  // an empty one back first, after its icon; one that empties it leaves an empty title in it.
  const tidied = openPage(source);
  const [titled, single] = tidied.document.querySelectorAll("ol.doc-flow > li");
  firstLineOf(titled).remove();
  tidyEmptied([titled]).settle({});
  assert.deepEqual([...titled.children].map((child) => child.localName), ["div", "p", "ul", "p"], "its title deleted: an empty one put back, after its icon");
  assert.equal(firstLineOf(titled).textContent, "", "empty");
  firstLineOf(single).remove();
  const emptied = {};
  tidyEmptied([single]).settle(emptied);
  assert.equal(single.innerHTML.replace(/ [\w-]+="[^"]*"/g, ""), "<p></p>", "emptied: an empty title");
  assert.equal(emptied.caret, firstLineOf(single), "the step's caret goes in it");

  // New nodes, written by the server.
  const made = openPage(source);
  const [one, two] = made.document.querySelectorAll("ol.doc-flow > li");
  const node = newStep(made.document, [], ["doc-highlight-green"]);
  node.setAttribute("data-direction", "column");
  node.style.setProperty("--doc-flow-ratio", "0.3");
  firstLineOf(node).innerHTML = "<strong>分派</strong>";
  one.after(node);
  const empty = newStep(made.document);
  two.after(empty);
  const written = saveAll(made, source);
  assert.ok(written.ok, JSON.stringify(written.conflicts));
  assert.ok(written.text.includes(`    <li class="doc-highlight-green" data-direction="column" style="--doc-flow-ratio: 0.3">\n      <p><strong>分派</strong></p>\n    </li>`), written.text);
  assert.ok(written.text.includes(`    <li><p><strong>回访</strong></p></li>\n    <li>\n      <p></p>\n    </li>\n  </ol>`), written.text);
  assert.deepEqual(findUnits(written.text).units.filter((unit) => unit.kind === "step").length, 4, "each a node the server reads as one");
  const { units } = findUnits(source);
  const after = units.find((unit) => unit.kind === "step").id;
  const insert = (node) => applyEdits({ current: source, edits: [], units: [{ id: "n0", insert: node, place: { after } }] }).conflicts?.map((entry) => entry.reason) ?? [];
  const step = (extra = {}) => ({ type: "step", children: [{ type: "paragraph", html: "" }], ...extra });
  assert.deepEqual([insert(step()), insert(step({ classes: ["doc-note"] })), insert(step({ ratio: "2" })), insert(step({ direction: "left" })), insert(step({ children: [] })), insert({ type: "paragraph", html: "x" })], [[], ["invalid"], ["invalid"], ["invalid"], ["invalid"], ["position"]], "a node checked: its color, weight and direction, a block in it; a flowchart takes nodes alone");
  // A flowchart made by "/" in an empty paragraph: one node, its title that paragraph, empty; right after
  // a flowchart, a node of it (blocks of one kind side by side are one, as a list's items).
  const lone = '<main class="doc-page">\n  <p>前面</p>\n  <p>结尾</p>\n</main>\n';
  const fresh = openPage(lone);
  const paragraph = [...fresh.document.querySelectorAll("[contenteditable='true']")].find((host) => host.textContent === "前面");
  paragraph.textContent = "";
  const freshMade = convertBlock(paragraph, "flowchart", { fresh: true });
  assert.equal(freshMade.focus, paragraph, "the caret in its title");
  const freshText = saveAll(fresh, lone);
  assert.ok(freshText.ok, JSON.stringify(freshText.conflicts));
  assert.equal(freshText.text, '<main class="doc-page">\n  <ol class="doc-flow">\n    <li>\n      <p></p>\n    </li>\n  </ol>\n  <p>结尾</p>\n</main>\n');
  const joined = openPage(source);
  const last = [...joined.document.querySelectorAll("[contenteditable='true']")].find((host) => host.textContent === "结尾");
  last.textContent = "";
  convertBlock(last, "flowchart", { fresh: true });
  assert.equal([...joined.document.querySelectorAll("ol.doc-flow")].length, 1, "right after a flowchart: a node of it");
  assert.equal(joined.document.querySelector("ol.doc-flow").lastElementChild.firstElementChild, last);

  // The layout tools. A node's weight as its style writes it; the shares of its row's width the nodes
  // of a row take (the shared description's flowShares, which the kit lays a row out by: a node with
  // none weighing as the weighted ones do on the whole, one alone all of it); a share written as a
  // weight (three places, never under 1/24).
  const { rowShares, weightOf, weightValue, create: createFlowchart } = await import("../../src/editor/components/flowchart/page.mjs");
  const laid = openPage(source);
  const flowList = laid.document.querySelector("ol.doc-flow");
  const [firstNode, secondNode] = flowList.querySelectorAll(":scope > li");
  const thirdNode = newStep(laid.document);
  flowList.append(thirdNode);
  firstNode.style.setProperty("--doc-flow-ratio", "0.6");
  thirdNode.style.setProperty("--doc-flow-ratio", "0.2");
  const near3 = (shares) => shares.map((share) => Math.round(share * 1000) / 1000);
  assert.deepEqual([weightOf(firstNode), weightOf(secondNode), near3(rowShares([firstNode, secondNode, thirdNode])), rowShares([secondNode]), near3(rowShares([secondNode, newStep(laid.document)]))],
    [0.6, null, [0.5, 0.333, 0.167], [1], [0.5, 0.5]], "a row's shares: weights among the row's, one with none the mean of the given, equal where none has one, one alone all");
  assert.deepEqual([weightValue(1 / 3), weightValue(0.6), weightValue(0.01)], ["0.333", "0.6", null], "a share written to three places; none below the least");
  // 方向 in the block menu: the flowchart's own (自动换行 / 排成一行 / 排成一列 under 流程图的方向), a
  // node's for the joint after it (跟随整体 / 接在右边 / 接在下边 under 这个节点之后), no note under any and below them the whole
  // flowchart's (under 整个流程图: a flowchart's handles are its nodes'), then 在后面添加节点; the
  // current one checked, the node's own named beside the row; a choice one look step of
  // data-direction that selects the block whose menu it was again on undo, the status line saying so.
  const looks = [];
  const said = [];
  const look = (element, change, select) => {
    for (const [name, value] of Object.entries(change.attributes)) value === null ? element.removeAttribute(name) : element.setAttribute(name, value);
    looks.push({ element, attributes: change.attributes, select });
    return true;
  };
  const editing = await inPage(laid, () => createFlowchart({ struct: () => null, look, say: (words) => said.push(words) }));
  const menuOf = (target) => editing.menuItems(target).map((row) => ({ label: row.label, hint: row.hint, choices: row.submenu?.().map((item) => (item.separator ? "—" : item.title ?? `${item.label}${item.current ? " ✓" : ""}${item.note ? `: ${item.note}` : ""}`)) }));
  assert.deepEqual(menuOf(flowList), [{ label: "方向", hint: "自动换行", choices: ["流程图的方向", "自动换行 ✓", "排成一行", "排成一列"] }], "the flowchart's 方向: its three, 自动换行 checked, no note under any");
  assert.deepEqual(menuOf(secondNode), [
    { label: "方向", hint: "跟随整体", choices: [
      "这个节点之后", "跟随整体 ✓", "接在右边", "接在下边", "—",
      "整个流程图", "自动换行 ✓", "排成一行", "排成一列",
    ] },
    { label: "在后面添加节点", hint: undefined, choices: undefined },
  ], "a node's 方向: the joint after it, 跟随整体 checked, then the whole flowchart's; then 在后面添加节点");
  const pickIn = (target, label) => editing.menuItems(target)[0].submenu().find((item) => item.label === label).run();
  pickIn(flowList, "排成一列");
  pickIn(secondNode, "接在下边");
  pickIn(secondNode, "排成一行");
  assert.deepEqual([flowList.getAttribute("data-direction"), secondNode.getAttribute("data-direction"), looks.map((step) => [step.element.localName, step.select.localName, JSON.stringify(step.attributes)]), said],
    ["row", "column", [["ol", "ol", '{"data-direction":"column"}'], ["li", "li", '{"data-direction":"column"}'], ["ol", "li", '{"data-direction":"row"}']], ["方向已改为排成一列 · Ctrl+Z 撤销", "节点方向已改为接在下边 · Ctrl+Z 撤销", "方向已改为排成一行 · Ctrl+Z 撤销"]],
    "each a look step of its data-direction (the flowchart's from a node's menu too), the block whose menu it was selected again on undo");
  assert.deepEqual([menuOf(flowList)[0].hint, menuOf(secondNode)[0].hint, menuOf(secondNode)[0].choices[3], menuOf(secondNode)[0].choices[7]], ["排成一行", "接在下边", "接在下边 ✓", "排成一行 ✓"], "what each has now named and checked");
  pickIn(secondNode, "跟随整体");
  assert.equal(secondNode.hasAttribute("data-direction"), false, "跟随整体: its own direction taken away");
  assert.deepEqual([editing.menuItems(laid.document.querySelector("p")), editing.menuItems(firstNode.querySelector("p"))], [[], []], "none for another block, nor for a block in a node");
}

console.log("Checked in-place editing: block selection (titles, cards, cells, disclosures, callouts, the text of the document's own elements), block frames, the page looked up once per collect (each value's first element, as a search for it finds it), byte-exact patches, formulas, splits/merges/removals, multi-line and formatted paste (list items copied alone pasted as lists of their kind where no list takes them, blocks pasted by a block an item holds kept in the item), inline formatting and colors (underline and strikethrough among the marks, formulas made from selected text, the format brush's memory), bound blocks (bound by what refers to them, never by their attributes; conversions carrying them), divider lines turned into other types, links, merge, conflicts, CRLF/BOM, undo snapshots, card and table sizes and centered cards, block colors (a paragraph's class attribute added and taken away with its color, new and split-off blocks carrying theirs, a class of another kind refused), to-do lists (a list's class switch, an item checked by its attribute, carried by items made or split off on the page, never by a paragraph), deleting whole blocks (the summary, a footer as any block, Sheet tabs with their panels, section divider lines, comments, table scope lines, emptied containers, spacing, script references), moving blocks within and across containers (order to moves, spacing, indentation, edits inside, emptied containers, where each kind may go, tabs), new blocks and conversions (in place with comments kept, headings 1-4, lists joined and split, list kinds, paragraphs from lists, disclosures, highlight panels, code blocks edited as plain text with their line numbers, dividers, new blocks of every type in page order, new sections, refused places and markup, typing shortcuts, blocks with ids changing type), several blocks turned into one type at once (the types they share, whole lists turned as lists, whole quotes paragraph by paragraph, a step's content going with it, an item holding blocks turned on its own from the middle of its list, lists side by side joined and their items selected, two written side by side kept, one highlight block or one disclosure for all, the sections it empties gone), a disclosure's content and a highlight block never left empty by a step, one item into a highlight block as it is, a checked item written bare, a refused conversion taking its move with it, sections (containers of ordinary blocks: titles and divider lines at their top as blocks, a new one holding a paragraph, dissolved with identities kept, what stays in place refused), nested lists (an item's text, Tab and Shift+Tab, Enter and merging across levels), small text, callouts, code languages, detail cards, Component Catalog coverage, blocks both sides changed merged word by word (through a commit), a partial write listing what it refused, spaces written as the page shows them (no non-breaking spaces from typing), an emptied kit section still taking blocks, columns (widths as shares of the row, rows made on the page written once each column has something, a column added, emptied columns and rows of one column tidied away, their checks), Ctrl+A's steps (the container blocks around a block one level a press, a row of columns, a Sheet area and a table whole, sections and lists no step, the page last, an open detail card's content the top, the card the press is in when two are open, a top holding only the block whose text was selected taking that block), flowchart steps written as nodes (a box of their own, their title a paragraph, an icon given to one first in it and never the page's; no list item: the lines above and below and the items around stopping at them; a title split with its rest plain, turned into nothing, put back by a step that leaves a node without one; a list made a flowchart node by item and back, a node turned into an item or a highlight block and a highlight block into a flowchart; nodes made on the page written with their color, direction and weight, checked; a row's shares and weights, 方向 of the flowchart and of a node as look steps), and writes that check the file again before replacing it.");
