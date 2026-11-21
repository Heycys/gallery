import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseFragment } from "parse5";
import { inStepLines } from "../../src/cli/hand-in.mjs";
import { createEditService } from "../../src/editor/service.mjs";
import { changeLines, findBlocks, findUnits, handedInSource, inStep, instrument, naturalize, readOnlyTexts, shownSource, writingNotes } from "../../src/editor/source.mjs";
import { scan } from "../../src/editor/source/blocks.mjs";
import { componentFailures } from "../../src/render/component-checks.mjs";
import { imageFailures } from "../../src/render/images.mjs";
import { COLUMN_GAP, READING_WIDTH } from "../../src/shared/media.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { newNames } from "../../src/shared/new-names.mjs";

// Natural HTML made the kit's (src/editor/source/natural.mjs, docs/editor.md "Natural HTML"): what an
// Agent writes as any page would comes out as the kit's markup, so the preview edits it; only the
// tags the rules name change, never inside code or a whole block of the report's own; what a rule
// would lose stays as written (named by readOnlyTexts), what it drops, writes near or keeps where the
// kit's markup has no place for it is noted.

const page = (body) => `<!doctype html>
<html lang="zh-CN">
<head><title>t</title><style>.kpi span { font-weight: 700; }</style></head>
<body>
  <main class="doc-page" data-doc-id="t">
    <header class="doc-header">
      <h1 class="doc-title">t</h1>
    </header>
${body}
  </main>
  <script>const s = "<mark>x</mark> \\\\(y\\\\)";</script>
</body>
</html>
`;
const mainOf = (text) => text.slice(text.indexOf("<main"), text.indexOf("</main>"));
// Every input here: each change at a line, and once is enough (the result has nothing natural left).
const natural = (body) => {
  const result = naturalize(page(body));
  for (const change of result.changes) assert.ok(Number.isInteger(change.line) && change.line > 0 && change.rule, `a change at a line: ${JSON.stringify(change)}`);
  assert.deepEqual(naturalize(result.text), { text: result.text, changes: [] }, `once is enough:
${mainOf(result.text)}`);
  return result;
};

// Formulas: inline ones in the kit's span, a paragraph of one display formula a formula block.
{
  const { text, changes } = natural(String.raw`    <p data-block-id="aaaaaaaa">能量 \(E = mc^2\)，面积 \(\pi r^2\)。</p>
    <p data-block-id="bbbbbbbb" class="doc-text-blue">\[ a^2 + b^2 = c^2 \]</p>
    <p>$$x$$</p>
    <p>文字里的 \[y\] 不动</p>`);
  const main = mainOf(text);
  assert.match(main, /<p data-block-id="aaaaaaaa">能量 <span class="doc-math-inline">\\\(E = mc\^2\\\)<\/span>，面积 <span class="doc-math-inline">\\\(\\pi r\^2\\\)<\/span>。<\/p>/);
  assert.match(main, /<div class="doc-math-block doc-text-blue" data-block-id="bbbbbbbb">\\\[ a\^2 \+ b\^2 = c\^2 \\\]<\/div>/, "a display formula's paragraph a formula block, its id and color kept");
  assert.match(main, /<div class="doc-math-block">\$\$x\$\$<\/div>/);
  assert.match(main, /<p>文字里的 \\\[y\\\] 不动<\/p>/, "a display formula amid words stays");
  assert.deepEqual(changes.map((change) => change.rule), ["formula", "formula", "display formula", "display formula"]);
  assert.deepEqual(naturalize(text).changes, [], "once is enough: the result has nothing natural left");
}

// Blocks: a disclosure, a code block, a table, pictures.
{
  const { text } = natural(`    <details><summary>完整 <code>Case</code></summary><p>内容</p></details>
    <details open><summary>只有字</summary>一句话</details>
    <pre><code class="language-python">print("&lt;mark&gt;")  # \\(x\\)</code></pre>
    <pre data-block-id="cccccccc">plain text</pre>
    <table><tr><th>名</th></tr><tr><td><mark>甲</mark></td></tr></table>
    <table data-block-id="tttttttt"><tr><td>乙</td></tr></table>
    <figure><img src="assets/a.png" alt="a"></figure>
    <figure><img src="assets/b.png" alt="b"><figcaption>图注</figcaption></figure>
    <p><img src="assets/c.png" alt="c"></p>
    <img src="assets/d.png" alt="d">`);
  const main = mainOf(text);
  for (const part of [
    '<details class="doc-details"><summary><span class="doc-details-summary-label">完整 <code>Case</code></span></summary><div class="doc-details-content"><p>内容</p></div></details>',
    '<details class="doc-details" open><summary><span class="doc-details-summary-label">只有字</span></summary><div class="doc-details-content"><p>一句话</p></div></details>',
    '<div class="doc-code" data-language="python"><div class="doc-code-title"></div><pre><code>print("&lt;mark&gt;")  # \\(x\\)</code></pre></div>',
    '<div class="doc-code" data-block-id="cccccccc"><div class="doc-code-title"></div><pre><code>plain text</code></pre></div>',
    // A table taken in: its th the header's look, a first row of th with rows after it a thead, the
    // rows straight in it a tbody (the parser's, written), as the kit writes a table.
    '<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th class="doc-bold doc-highlight-gray">名</th></tr></thead><tbody><tr><td><span class="doc-highlight-yellow">甲</span></td></tr></tbody></table></div>',
    // A table's block id on the wrapper, which is the block (an export would give it another one).
    '<div class="doc-table-wrap" data-block-id="tttttttt"><table class="doc-table"><tbody><tr><td>乙</td></tr></tbody></table></div>',
    '<figure class="doc-image"><img src="assets/a.png" alt="a"><figcaption></figcaption></figure>',
    '<figure class="doc-image"><img src="assets/b.png" alt="b"><figcaption>图注</figcaption></figure>',
    '<figure class="doc-image"><img src="assets/c.png" alt="c"><figcaption></figcaption></figure>',
    '<figure class="doc-image"><img src="assets/d.png" alt="d"><figcaption></figcaption></figure>',
  ]) assert.ok(main.includes(part), `the kit's markup: ${part}`);
}

// The frame's sizes written in a plain table's style (--doc-table-height: none, every row; --doc-span)
// go onto the wrapper made for it, where the kit reads them (found testing the skill with Agents, 2026-10-28); the rest of
// the style stays on the table, and a style of no size stays where it is. A <pre>'s --doc-code-height
// stays on it, where the kit reads it too, said by no note (it is where writing-html.md says to
// write it: "style kept on its <pre>" read as a problem in a review of 2026-10-29).
{
  const sizes = natural(`    <table style="--doc-table-height: none"><tr><td>甲</td></tr></table>
    <table style="color: red; --doc-span: .5;--doc-table-height:480px"><tr><td>乙</td></tr></table>
    <table style="color: red"><tr><td>丙</td></tr></table>
    <pre style="--doc-code-height: none">code</pre>`);
  const main = mainOf(sizes.text);
  assert.deepEqual(sizes.changes.filter((change) => change.rule === "code").map((change) => change.note ?? null), [null], "the height on its <pre>: no note");
  for (const part of [
    '<div class="doc-table-wrap" style="--doc-table-height: none"><table class="doc-table"><tbody>',
    '<div class="doc-table-wrap" style="--doc-span: .5; --doc-table-height:480px"><table class="doc-table" style="color: red"><tbody>',
    '<div class="doc-table-wrap"><table class="doc-table" style="color: red"><tbody>',
    '<div class="doc-code"><div class="doc-code-title"></div><pre style="--doc-code-height: none"><code>code</code></pre></div>',
  ]) assert.ok(main.includes(part), `${part}\n${main}`);
}

// A picture's width (<img width="N">, px or a percent) is its figure's share of the reading width
// (--doc-span: N / 712, or N / 100 of the width it stands in; .1 to 1, three places; at most the
// width it stands in), the
// attribute off the picture and the change noted; a figure's own style kept before it. A width of
// another unit, or a figure with a span of its own, leaves the picture as written.
{
  const { text, changes } = natural(`    <figure style="margin: 0;"><img src="assets/a.png" width="300" alt="a"><figcaption>甲</figcaption></figure>
    <p><img width="50%" src="assets/b.png" alt="b"></p>
    <img src="assets/c.png" alt="c" width="2000" height="900">
    <img src="assets/d.png" alt="d" width="auto">
    <figure style="--doc-span: .3"><img src="assets/e.png" width="300" alt="e"></figure>`);
  const main = mainOf(text);
  for (const part of [
    '<figure class="doc-image" style="margin: 0; --doc-span: 0.421"><img src="assets/a.png" alt="a"><figcaption>甲</figcaption></figure>',
    '<figure class="doc-image" style="--doc-span: 0.5"><img src="assets/b.png" alt="b"><figcaption></figcaption></figure>',
    '<figure class="doc-image" style="--doc-span: 1"><img src="assets/c.png" alt="c" height="900"><figcaption></figcaption></figure>',
    '<figure class="doc-image"><img src="assets/d.png" alt="d" width="auto"><figcaption></figcaption></figure>',
    '<figure class="doc-image" style="--doc-span: .3"><img src="assets/e.png" width="300" alt="e"><figcaption></figcaption></figure>',
  ]) assert.ok(main.includes(part), `a picture's width: ${part}\n${main}`);
  assert.deepEqual(changes.map((change) => change.note ?? null), [
    'width="300" written as --doc-span: 0.421 on its figure (300px of the 712px reading width; at most the width it stands in)',
    'width="50%" written as --doc-span: 0.5 on its figure (a share of the width it stands in; at most the width it stands in)',
    'width="2000" written as --doc-span: 1 on its figure (2000px of the 712px reading width, within 0.1 to 1; at most the width it stands in)',
    null, null,
  ]);
  const tokens = fs.readFileSync(path.join(projectRoot, "src/render/kit/styles/tokens.css"), "utf8");
  assert.ok(tokens.includes(`--doc-content-max-width: ${READING_WIDTH}px;`), "READING_WIDTH is the kit's reading width");
  assert.ok(tokens.includes(`--doc-column-gap: ${COLUMN_GAP}px;`), "COLUMN_GAP is the kit's gap between columns");
}
// Pixels are a share of the reading width wherever the picture stands (the page, a section, a
// column, a list, a disclosure, a panel): moved into a column, a picture keeps its size, never wider
// than the column (styles/sizes.css): a picture's width is kept in pixels. A percent is
// of the width it stands in, as HTML means it: in a column, of the column's share of the reading
// width (its ratio of the row, less the gaps).
{
  const { text, changes } = natural(`    <section><h2>节</h2><div><img src="assets/f.png" alt="f" width="356"></div></section>
    <div class="doc-columns"><div class="doc-column"><figure><img src="assets/g.png" width="300" alt="g"></figure></div><div class="doc-column"><p><img src="assets/h.png" width="50%" alt="h"></p></div></div>
    <div class="doc-columns"><div class="doc-column" style="--doc-column-ratio: .6"><img src="assets/i.png" width="100%" alt="i"></div><div class="doc-column" style="--doc-column-ratio: .4"><p>旁</p></div></div>`);
  const main = mainOf(text);
  for (const part of [
    '<figure class="doc-image" style="--doc-span: 0.5"><img src="assets/f.png" alt="f"><figcaption></figcaption></figure>',
    '<figure class="doc-image" style="--doc-span: 0.421"><img src="assets/g.png" alt="g"><figcaption></figcaption></figure>',
    '<figure class="doc-image" style="--doc-span: 0.243"><img src="assets/h.png" alt="h"><figcaption></figcaption></figure>',
    '<figure class="doc-image" style="--doc-span: 0.583"><img src="assets/i.png" alt="i"><figcaption></figcaption></figure>',
  ]) assert.ok(main.includes(part), `a picture's width where it stands: ${part}\n${main}`);
  const notes = changes.map((change) => change.note).filter(Boolean);
  assert.deepEqual(notes, [
    'width="356" written as --doc-span: 0.5 on its figure (356px of the 712px reading width; at most the width it stands in)',
    'width="300" written as --doc-span: 0.421 on its figure (300px of the 712px reading width; at most the width it stands in)',
    'width="50%" written as --doc-span: 0.243 on its figure (a share of the width it stands in, its column 0.486 of the reading width; at most the width it stands in)',
    'width="100%" written as --doc-span: 0.583 on its figure (a share of the width it stands in, its column 0.583 of the reading width; at most the width it stands in)',
  ], JSON.stringify(changes));
  assert.equal(naturalize(text).text, text, "once is enough");
}

// Inline tags: the kit's colors and formats, or their words; what the page needs stays.
{
  const { text } = natural(`    <p><mark>记</mark> <del>删</del> <ins>增</ins> <kbd>Ctrl</kbd> <small>小</small> <q>引</q> <abbr title="x">缩</abbr> <span>空</span> <span style="color:#d00">红</span> <span style="background-color:#fff3a0;font-weight:bold">黄粗</span> <span style="font-size:12px">只是字号</span> <font color="blue">蓝</font></p>
    <p><span class="doc-text-red">已是</span> <span data-x="1">带属性</span> <span class="mine">自己的类</span></p>`);
  const main = mainOf(text);
  assert.ok(main.includes('<p><span class="doc-highlight-yellow">记</span> <s>删</s> <u>增</u> <code>Ctrl</code> <span class="doc-text-gray">小</span> “引” 缩 空 <span class="doc-text-red">红</span> <span class="doc-highlight-yellow"><strong>黄粗</strong></span> <span style="font-size:12px">只是字号</span> <span class="doc-text-blue">蓝</span></p>'), main);
  assert.ok(main.includes('<p><span class="doc-text-red">已是</span> <span data-x="1">带属性</span> <span class="mine">自己的类</span></p>'), "the kit's own, an attribute the page may need, a class of the document's own: as they are");
}

// Left alone: code, scripts, a chart's host, the kit's parts (a table's scope line's spans), an inline
// element that is no word's format, and a whole block of the report's own.
{
  const body = `    <div class="kpi"><span style="color:red">92%</span> <mark>记</mark> \\(x\\)<details><summary>内</summary>里</details><table><tr><td>格</td></tr></table></div>
    <figure class="doc-figure" data-surface="bounded"><h3>图 \\(y\\)</h3><div data-doc-chart="dots"><script type="application/json">{"x": "<mark>"}</script></div></figure>
    <div class="doc-code"><div class="doc-code-title"></div><pre><code>\\(z\\) <mark></code></pre></div>
    <p><span class="doc-math-inline">\\(w\\)</span></p>
    <p><code>\\(v\\)</code></p>
    <div class="doc-table-meta"><span>范围</span><span>单位</span></div>
    <div><span>一个部件</span></div>`;
  const { text, changes } = natural(body);
  assert.equal(text, page(body), "nothing changed");
  assert.deepEqual(changes, []);
  assert.ok(text.includes('<script>const s = "<mark>x</mark>'), "nor anything outside main");
}

// What it makes is what the editor edits: no text left read-only.
{
  const { text } = natural(String.raw`    <section class="doc-section">
      <h2>章</h2>
      <p>带 <mark>标记</mark>、<small>小字</small>、<del>删除</del> 和 \(x^2\)。</p>
      <p>\[ y = x \]</p>
      <details><summary>展开</summary><p>内容</p></details>
      <pre>code</pre>
    </section>`);
  const { html } = instrument(text);
  assert.ok(!/data-ge-lock=/.test(html), html.match(/<[^>]*data-ge-lock[^>]*>/g)?.join("\n"));
  assert.ok(findBlocks(text).some((block) => block.kind === "tex"), "the display formula a formula block");
}

// What stays read-only after it: each with its line and why; not a whole block's inside, nor code.
{
  const { text } = natural(String.raw`    <p>图 <img src="assets/a.png" alt=""> 在字中间</p>
    <p>带 <span class="mine">自己的类</span></p>
    <p>公式 \[ x \] 在句中</p>
    <div class="kpi"><span class="v">92%</span></div>
    <p>没问题的 <mark>标记</mark></p>`);
  const notes = readOnlyTexts(text);
  // A span of the report's own is an atom of its paragraph, kept as written (page/own.mjs): no note.
  assert.equal(notes.length, 2, notes.join("\n"));
  assert.match(notes[0], /^line 9: <p>: a picture amid the words/);
  assert.match(notes[1], /^line 11: <p>: a display formula/);
}

// A picture in a table's cell (单元格里的图片): an Agent's <img> in a td or th stays one, amid the
// cell's words, the cell a text block (its file checked as any picture's: assets/); one written another
// way leaves the cell read-only, the note saying the form.
{
  const { text, changes } = natural(`    <table>
      <tr><th>名</th><th>图</th></tr>
      <tr><td>猫</td><td><img src="assets/cat.png" alt="小猫" width="80"> 很乖</td></tr>
      <tr><td>狗</td><td><img src="https://e.com/dog.png" alt=""></td></tr>
      <tr><td>鸟</td><td><img src="assets/bird.png" class="round"></td></tr>
    </table>`);
  assert.ok(text.includes('<td><img src="assets/cat.png" alt="小猫" width="80"> 很乖</td>') && !changes.some((change) => change.rule === "picture"), "a cell's picture stays as written, no image block of it");
  const cells = findBlocks(text).filter((block) => block.kind === "cell").map((block) => text.slice(block.innerStart, block.innerEnd));
  assert.ok(cells.includes('<img src="assets/cat.png" alt="小猫" width="80"> 很乖'), "its cell a text block");
  assert.deepEqual(readOnlyTexts(text).map((note) => note.replace(/^line \d+: /, "")), [
    '<td>: a picture in a cell written another way (its src (https://e.com/dog.png): no picture of the document\'s assets/ folder): the preview edits <img src="assets/<file>" alt="…" width="N"> (N pixels, or no width), no other attribute',
    '<td>: a picture in a cell written another way (the attribute class): the preview edits <img src="assets/<file>" alt="…" width="N"> (N pixels, or no width), no other attribute',
  ]);
}

// A page block or a link shown with its icon written any other way than its one form: its block is
// read-only, and the note says the form, not that an element was left open.
{
  const form = 'a page block written another way: the preview edits only <a class="doc-link-mention" href="../<slug>/doc.html"><span class="doc-link-mention-icon"></span>title</a>, its title plain words, no other attribute';
  const { text } = natural(`    <p>只写标题 <a class="doc-link-mention" href="../target/doc.html">目标页</a></p>
    <p>多了属性 <a class="doc-link-mention" href="../target/doc.html" title="说明"><span class="doc-link-mention-icon"></span>目标页</a></p>
    <p>新窗口 <a class="doc-link-mention" href="../target/doc.html" target="_blank"><span class="doc-link-mention-icon"></span>目标页</a></p>
    <p>别的写法 <a class="doc-link-mention" href="/generated/target.html"><span class="doc-link-mention-icon"></span>目标页</a></p>
    <p>标题加粗 <a class="doc-link-mention" href="../target/doc.html"><span class="doc-link-mention-icon"></span><b>目标页</b></a></p>
    <p>写对了 <a class="doc-link-mention" href="../target/doc.html"><span class="doc-link-mention-icon"></span>目标页</a></p>`);
  assert.deepEqual(readOnlyTexts(text), [9, 10, 11, 12, 13].map((line) => `line ${line}: <p>: ${form}`));
}

// A display formula alone in its paragraph but for a bare < or > in its TeX (which may open a tag, so
// it is no formula: texSource) is said so, apart from one among words; \lt or &lt; is a formula.
{
  const { text } = natural(String.raw`    <p>\[ p < 0.05 \]</p>
    <p>$$ a > b $$</p>
    <p>\[ x<y \]</p>
    <p>\[ p \lt 0.05 \]</p>
    <p>\[ p &lt; 0.05 \]</p>
    <p>小于 \[ p < 0.05 \] 时</p>`);
  const angled = "the formula holds a bare < or >: write \\lt / \\gt (or &lt; / &gt;)";
  assert.deepEqual(readOnlyTexts(text), [
    `line 9: <p>: ${angled}`, `line 10: <p>: ${angled}`, `line 11: <p>: ${angled}`,
    "line 11: <p>: an element not closed in the file (the parser closed it)", // <y \]</p> opened an element
    "line 14: <p>: a display formula (\\[…\\] or $$…$$) amid the words: give it a paragraph of its own",
  ]);
  assert.equal(findBlocks(text).filter((block) => block.kind === "tex").length, 2, "\\lt and &lt; make formula blocks");
}

// Nothing the author wrote goes silently. A span's style is the kit's only when every declaration is
// one of its formats (a color the nearest of its nine, noted when it is not one of them exactly);
// else the span stays as written, an atom of its paragraph (page/own.mjs): the paragraph's other
// words are edited, the span written back as it was.
{
  const body = `    <p>藏起 <span style="display:none">hidden</span> 的字</p>
    <p>蓝块 <span style="color:#387dc9; display:inline-block">块</span></p>
    <p><span style="color:#387dc9;font-weight:700">蓝粗</span> <span style="color: #3a7bd5">近蓝</span></p>`;
  const { text, changes } = natural(body);
  const main = mainOf(text);
  assert.ok(main.includes('<p>藏起 <span style="display:none">hidden</span> 的字</p>'), "display:none: the span as written, its words still hidden");
  assert.ok(main.includes('<p>蓝块 <span style="color:#387dc9; display:inline-block">块</span></p>'), "a color with a declaration the kit has no format for: as written");
  assert.ok(main.includes('<p><span class="doc-text-blue"><strong>蓝粗</strong></span> <span class="doc-text-blue">近蓝</span></p>'), main);
  assert.deepEqual(changes, [
    { line: 11, rule: "span" },
    { line: 11, rule: "span", note: "color #3a7bd5 written as the kit's blue" },
  ], "the kit's own blue says nothing; a blue near it says it was written as the kit's");
  assert.deepEqual(readOnlyTexts(text), [], "each paragraph editable, the span kept whole");
}

// A text color that hides the words or puts back the browser's own is none of the kit's: the span
// stays (a background that is none, or a text color that is the block's, goes without a word), an
// atom of its paragraph.
{
  const body = `    <p>透明 <span style="color:transparent">a</span> <span style="color:rgba(0,0,0,0)">b</span> <span style="color:#ff000000">c</span></p>
    <p class="doc-text-red">还原 <span style="color:initial">d</span> <span style="color: revert">e</span></p>
    <p>同色 <span style="color:inherit; background:transparent">f</span> <span style="color:currentColor;background-color:none">g</span> <font>h</font> <font color="">i</font></p>
    <p>遮住 <span style="background:currentcolor">j</span></p>
    <p><span data-x="1">k</span> <span style="/* 注 */display:none">l</span></p>
    <p><span class="doc-text-red" style="white-space:pre">m</span></p>
    <p><span style="background:url('data:image/png;base64,AAA=')">n</span></p>`;
  const { text, changes } = natural(body);
  const main = mainOf(text);
  for (const line of body.split("\n").filter((line) => !line.includes("同色"))) assert.ok(main.includes(line.trim()), `as written: ${line.trim()}`);
  assert.ok(main.includes("<p>同色 f g h i</p>"), main);
  assert.deepEqual(changes, [{ line: 11, rule: "span" }, { line: 11, rule: "span" }, { line: 11, rule: "font" }, { line: 11, rule: "font" }]);
  assert.deepEqual(readOnlyTexts(text), [], "each paragraph editable, the spans kept whole");
}

// A code block keeps its id (an anchor's target, on the kit's block: the pre's, else its code's);
// what else its pre and code carry (a style, a tabindex, a highlighter's class, a second id) stays on
// them as written, noted; its own class or not, a pre is a code block, which the checks pass.
{
  const { text, changes } = natural(`    <p><a href="#sample">看示例</a></p>
    <pre id="sample"><code class="language-js">let a = 1;</code></pre>
    <pre style="max-height:200px"><code>x</code></pre>
    <pre tabindex="0"><code class="hljs language-js" aria-label="示例">y</code></pre>
    <pre class="language-ts"><code>z</code></pre>
    <pre class="shiki github-dark" style="background-color:#24292e"><code><span class="line">w</span></code></pre>
    <pre id="a" data-block-id="pppppppp"><code id="b" data-block-id="qqqqqqqq">u</code></pre>`);
  const main = mainOf(text);
  for (const part of [
    '<div class="doc-code" id="sample" data-language="js"><div class="doc-code-title"></div><pre><code>let a = 1;</code></pre></div>',
    '<div class="doc-code"><div class="doc-code-title"></div><pre style="max-height:200px"><code>x</code></pre></div>',
    '<div class="doc-code" data-language="js"><div class="doc-code-title"></div><pre tabindex="0"><code class="hljs" aria-label="示例">y</code></pre></div>',
    '<div class="doc-code" data-language="ts"><div class="doc-code-title"></div><pre><code>z</code></pre></div>',
    '<div class="doc-code"><div class="doc-code-title"></div><pre class="shiki github-dark" style="background-color:#24292e"><code><span class="line">w</span></code></pre></div>',
    '<div class="doc-code" id="a" data-block-id="pppppppp"><div class="doc-code-title"></div><pre><code id="b">u</code></pre></div>',
  ]) assert.ok(main.includes(part), `the kit's code block: ${part}\n${main}`);
  assert.deepEqual(changes, [
    { line: 10, rule: "code" },
    { line: 11, rule: "code", note: "style kept on its <pre>" },
    { line: 12, rule: "code", note: "tabindex kept on its <pre>" },
    { line: 12, rule: "code", note: 'class "hljs", aria-label kept on its <code>' },
    { line: 13, rule: "code" },
    { line: 14, rule: "code", note: 'class "shiki github-dark", style kept on its <pre>' },
    { line: 15, rule: "code", note: "id kept on its <code>" },
  ]);
  assert.match(instrument(text).html, /<div class="doc-code" id="sample"[^>]*><div class="doc-code-title" data-ge-block="\d+"><\/div><pre><code data-ge-block="\d+">/, "the code block with its id edits as one");
  assert.match(instrument(text).html, /<pre style="max-height:200px"><code data-ge-block="\d+">x<\/code>/, "so does one whose pre keeps a style");
  assert.deepEqual(componentFailures(text).filter((failure) => /pre|doc-code/.test(failure)), [], "every one a code block the checks pass");
  assert.deepEqual(readOnlyTexts(text), []);
  // A code not closed in the file is closed by the block, its id on the block and not twice. (Last
  // in its input: the parser takes what follows an unclosed code into a code again, which only the
  // next run, the code closed, reaches.)
  const open = natural(`    <pre><code id="s" class="language-py">v</pre>`);
  assert.ok(mainOf(open.text).includes('<div class="doc-code" id="s" data-language="py"><div class="doc-code-title"></div><pre><code>v</code></pre></div>'), mainOf(open.text));
}

// A code block's title and its first line's number, written as any page would: a <figure> of the
// pre and its <figcaption> (before or after it) is the code block, the caption's words its title
// (plain text: the inline tags in them left out, noted, but a code's, a key's, a sample's or a
// variable's of no attribute, which a code block's title is anyway; a caption after the pre moved
// before it, the file keeping its lines), else the pre's data-title; data-line-start, or Prism's
// data-start, goes on the block when it writes a whole number from 1, and is left out, noted, when
// it does not. The figure's id is the block's, what else it carries kept on the block, noted. A
// figure the rule does not take stays, its pre a code block as ever.
{
  const body = `    <figure>
      <figcaption>src/score.ts</figcaption>
      <pre data-line-start="38"><code class="language-typescript">const delta = score - baseline;
return delta / baseline;</code></pre>
    </figure>
    <figure id="listing" style="margin:0">
      <pre data-start="7"><code>run()</code></pre>
      <figcaption><code>src/run.py</code> · <a href="https://example.com/run">run()</a><br>入口</figcaption>
    </figure>
    <figure><pre><code>z</code></pre><figcaption>a.sh</figcaption></figure>
    <pre data-title="  src/x &amp; y.js " data-line-start="0"><code>x</code></pre>
    <figure><pre>bare</pre></figure>
    <figure><pre><code>one</code></pre><pre><code>two</code></pre></figure>
    <div class="doc-code" data-line-start="5"><div class="doc-code-title">kit.js</div><pre><code>k</code></pre></div>`;
  const { text, changes } = natural(body);
  const main = mainOf(text);
  assert.equal(text.split("\n").length, page(body).split("\n").length, "the file keeps its lines");
  assert.ok(main.includes(`    <div class="doc-code" data-language="typescript" data-line-start="38">
      <div class="doc-code-title">src/score.ts</div>
      <pre><code>const delta = score - baseline;
return delta / baseline;</code></pre>
    </div>`), main);
  assert.ok(main.includes(`    <div class="doc-code" id="listing" data-line-start="7" style="margin:0">
      <div class="doc-code-title">src/run.py · run() 入口</div>
      <pre><code>run()</code></pre>
    </div>`), `a caption after the pre: its words moved before it, the pre on a line of its own\n${main}`);
  for (const part of [
    '<div class="doc-code"><div class="doc-code-title">a.sh</div><pre><code>z</code></pre></div>',
    '<div class="doc-code"><div class="doc-code-title">src/x &amp; y.js</div><pre><code>x</code></pre></div>',
    '<div class="doc-code"><div class="doc-code-title"></div><pre><code>bare</code></pre></div>',
    '<figure class="doc-figure"><div class="doc-code"><div class="doc-code-title"></div><pre><code>one</code></pre></div><div class="doc-code"><div class="doc-code-title"></div><pre><code>two</code></pre></div></figure>',
    '<div class="doc-code" data-line-start="5"><div class="doc-code-title">kit.js</div><pre><code>k</code></pre></div>',
  ]) assert.ok(main.includes(part), `${part}\n${main}`);
  assert.deepEqual(changes, [
    { line: 9, rule: "code" },
    { line: 14, rule: "code", note: "style kept on the block (its <figure>'s)" },
    { line: 14, rule: "code", note: '<a href="https://example.com/run"> in its caption left out: a code block\'s title is plain text' },
    { line: 14, rule: "code", note: "<br> in its caption left out: a code block's title is plain text" },
    { line: 18, rule: "code" },
    { line: 19, rule: "code", note: 'data-line-start "0" left out (its <pre>\'s): the number of its first line is a whole number from 1' },
    { line: 20, rule: "code" },
    { line: 21, rule: "figure" },
    { line: 21, rule: "code" },
    { line: 21, rule: "code" },
  ]);
  // Each a code block the checks pass and the preview edits, its title a text block of its own.
  assert.deepEqual(componentFailures(text).filter((failure) => /pre|doc-code/.test(failure)), [], "every one a code block the checks pass");
  assert.match(instrument(text).html, /<div class="doc-code" data-language="typescript" data-line-start="38"[^>]*>\s*<div class="doc-code-title" data-ge-block="\d+">src\/score\.ts<\/div>/, "its title edits as one");
  assert.deepEqual(readOnlyTexts(text), []);
}

// What a code block takes of its pre, its code and its figure, once each: its first line's number,
// whether it shows line numbers, its folded lines and its title, the first of each that says one
// (a number written 038 too); every other one, one that says none or one another said first, is
// left out, noted, so none stands where the kit does not read it (on the figure: never twice on the
// block). Its caption's words its title on one line, their blanks one space (the lines they took
// left blank after it, so the file keeps its lines); a caption of no words no title. A figure the
// rule leaves says why its caption stays beside the code block.
{
  const body = `    <figure data-line-start="x"><figcaption>a.js</figcaption><pre data-line-start="38"><code>a</code></pre></figure>
    <figure data-line-start="0"><pre data-start="38"><code>b</code></pre></figure>
    <pre data-line-start="038" data-start="7" data-line-numbers="false" data-folded-lines=" 2  " data-title="t.js"><code data-title="c.js">c</code></pre>
    <pre data-line-numbers="no" data-folded-lines="a"><code>d</code></pre>
    <figure data-title="fig.js" data-line-numbers="FALSE"><figcaption>cap.js</figcaption><pre data-title="pre.js"><code>e</code></pre></figure>
    <figure>
      <figcaption>
        src/long/path/score.ts
        · run()
      </figcaption>
      <pre><code>f</code></pre>
    </figure>
    <figure>
      <pre><code>g</code></pre>
      <figcaption>
        <code>src/after.ts</code>
      </figcaption>
    </figure>
    <figure><figcaption> </figcaption><pre><code>h</code></pre></figure>
    <figure><pre><code>i</code></pre><figcaption>
    </figcaption></figure>
    <figure><figcaption><kbd>Ctrl</kbd> <code class="path">j.js</code> <var>n</var></figcaption><pre><code>j</code></pre></figure>
    <figure><!-- listing --><figcaption>k.js</figcaption><pre><code>k</code></pre></figure>
    <figure><figcaption class="x">l.js</figcaption><pre><code>l</code></pre></figure>
    <figure><figcaption>m.js</figcaption><figcaption>n.js</figcaption><pre><code>m</code></pre></figure>
    <figure>words <figcaption>o.js</figcaption><pre><code>o</code></pre></figure>
    <figure><figcaption><img src="p.png" alt=""> p.js</figcaption><pre><code>p</code></pre></figure>
    <figure><figcaption>q.js</figcaption><pre><code>q</code></pre><p>after</p></figure>`;
  const { text, changes } = natural(body);
  const main = mainOf(text);
  assert.equal(text.split("\n").length, page(body).split("\n").length, "the file keeps its lines");
  assert.ok(!/data-line-start="[^"]*"[^>]* data-line-start=/.test(main), `never twice on a block\n${main}`);
  const block = (inside, attributes = "", title = "") => `<div class="doc-code"${attributes}><div class="doc-code-title">${title}</div><pre><code>${inside}</code></pre></div>`;
  for (const part of [
    `    ${block("a", ' data-line-start="38"', "a.js")}\n`,
    `    ${block("b", ' data-line-start="38"')}\n`,
    `    ${block("c", ' data-line-start="38" data-line-numbers="false" data-folded-lines="2"', "t.js")}\n`,
    `    ${block("d")}\n`,
    `    ${block("e", ' data-line-numbers="false"', "cap.js")}\n`,
    `    <div class="doc-code">
      <div class="doc-code-title">src/long/path/score.ts · run()</div>



      <pre><code>f</code></pre>
    </div>\n`,
    `    <div class="doc-code">
      <div class="doc-code-title">src/after.ts</div>


      <pre><code>g</code></pre>
    </div>\n`,
    `    ${block("h")}\n`,
    `    <div class="doc-code"><div class="doc-code-title"></div>\n    <pre><code>i</code></pre></div>\n`,
    `    ${block("j", "", "Ctrl j.js n")}\n`,
    `    <figure class="doc-figure"><!-- listing --><figcaption>k.js</figcaption>${block("k")}</figure>\n`,
    `    <figure class="doc-figure"><figcaption class="x">l.js</figcaption>${block("l")}</figure>\n`,
    `    <figure class="doc-figure"><figcaption>m.js</figcaption><figcaption>n.js</figcaption>${block("m")}</figure>\n`,
    `    <figure class="doc-figure">words <figcaption>o.js</figcaption>${block("o")}</figure>\n`,
    `    <figure class="doc-figure"><figcaption><img src="p.png" alt=""> p.js</figcaption>${block("p")}</figure>\n`,
    `    <figure class="doc-figure"><figcaption>q.js</figcaption>${block("q")}<p>after</p></figure>\n`,
  ]) assert.ok(main.includes(part), `${part}\n${main}`);
  const number = "the number of its first line is a whole number from 1";
  const stays = (why) => `its <figure>'s caption stays a caption beside it: ${why}; a <figure> holding the pre and one <figcaption> of words alone makes them its title`;
  assert.deepEqual(changes, [
    { line: 9, rule: "code", note: `data-line-start "x" left out (its <figure>'s): ${number}` },
    { line: 10, rule: "code", note: `data-line-start "0" left out (its <figure>'s): ${number}` },
    { line: 11, rule: "code", note: `data-start "7" left out (its <pre>'s): the block takes its <pre>'s data-line-start` },
    { line: 11, rule: "code", note: `data-title "c.js" left out (its <code>'s): the block takes its <pre>'s data-title` },
    { line: 12, rule: "code", note: `data-line-numbers "no" left out (its <pre>'s): false hides its line numbers, true shows them` },
    { line: 12, rule: "code", note: `data-folded-lines "a" left out (its <pre>'s): its folded lines are their numbers from 1, spaces between` },
    { line: 13, rule: "code", note: `data-title "fig.js" left out (its <figure>'s): its caption is its title` },
    { line: 13, rule: "code", note: `data-title "pre.js" left out (its <pre>'s): its caption is its title` },
    { line: 14, rule: "code" },
    { line: 21, rule: "code" },
    { line: 27, rule: "code" },
    { line: 28, rule: "code" },
    { line: 30, rule: "code", note: `<code class="path"> in its caption left out: a code block's title is plain text` },
    { line: 31, rule: "figure" },
    { line: 31, rule: "code", note: stays("a comment in its <figure>") },
    { line: 32, rule: "figure" },
    { line: 32, rule: "code", note: stays("its <figcaption> has an attribute of its own (class)") },
    { line: 33, rule: "figure" },
    { line: 33, rule: "code", note: stays("more than the pre and one <figcaption> in its <figure>") },
    { line: 34, rule: "figure" },
    { line: 34, rule: "code", note: stays("words in its <figure> outside its caption") },
    { line: 35, rule: "figure" },
    { line: 35, rule: "code", note: stays("a picture in its <figcaption>") },
    { line: 36, rule: "figure" },
    { line: 36, rule: "code", note: stays("more than the pre and one <figcaption> in its <figure>") },
  ]);
  assert.deepEqual(componentFailures(text).filter((failure) => /pre|doc-code|data-/.test(failure)), [], "nothing left where the kit does not read it");
  // Shown by the preview: each title a text block of its own, on one line.
  assert.match(instrument(text).html, /<div class="doc-code-title" data-ge-block="\d+">src\/long\/path\/score\.ts · run\(\)<\/div>/);
}

// Long lines that scroll (a directory tree, a log): data-wrap="false" beside data-line-numbers, or the
// kit's class written on the pre, is the block's doc-code--nowrap; "true" wraps, as the block does
// anyway; one that says neither is left out, noted.
{
  const { text, changes } = natural(`    <pre data-wrap="false" data-line-numbers="false"><code>src/
└── a.js</code></pre>
    <pre class="doc-code--nowrap language-txt"><code>b</code></pre>
    <pre data-wrap="TRUE"><code>c</code></pre>
    <figure><figcaption>tree.txt</figcaption><pre><code data-wrap="false">d</code></pre></figure>
    <pre data-wrap="never"><code>e</code></pre>`);
  const main = mainOf(text);
  for (const part of [
    '<div class="doc-code doc-code--nowrap" data-line-numbers="false"><div class="doc-code-title"></div><pre><code>src/',
    '<div class="doc-code doc-code--nowrap" data-language="txt"><div class="doc-code-title"></div><pre><code>b</code></pre></div>',
    '<div class="doc-code"><div class="doc-code-title"></div><pre><code>c</code></pre></div>',
    '<div class="doc-code doc-code--nowrap"><div class="doc-code-title">tree.txt</div><pre><code>d</code></pre></div>',
    '<div class="doc-code"><div class="doc-code-title"></div><pre><code>e</code></pre></div>',
  ]) assert.ok(main.includes(part), `${part}\n${main}`);
  assert.deepEqual(changes.filter((change) => change.note), [{ line: 14, rule: "code", note: 'data-wrap "never" left out (its <pre>\'s): false keeps its long lines on one line (they scroll), true wraps them' }]);
  assert.deepEqual(componentFailures(text), []);
  assert.ok(componentFailures('<main><div class="doc-code"><div class="doc-code-title"></div><pre data-wrap="false"><code>x</code></pre></div></main>').some((failure) => failure.startsWith('data-wrap (line 1) on the <pre> of a code block does nothing: for long lines that scroll, write class="doc-code doc-code--nowrap"')), "on the pre of a block of the kit's: it says where it goes");
}

// An inline tag taken off keeps nothing of its attributes: what they said is in its change's notes,
// one a thing (a value on one line, quoted as JSON), as are two colors written near.
{
  const { text, changes } = natural(`    <p><abbr title="Retrieval-Augmented Generation">RAG</abbr> 于 <time datetime="2024-05-01">五月</time> <abbr>NLP</abbr> <del datetime="2024-06-01">旧</del></p>
    <p><ins cite="https://example.com" datetime="2024-07-01">新</ins> <abbr title='说 "你好"
  的缩写'>SH</abbr> <span style="color:#3a7bd5; background:#fff3a1">近</span></p>`);
  assert.ok(mainOf(text).includes("<p>RAG 于 五月 NLP <s>旧</s></p>"), mainOf(text));
  assert.deepEqual(changes, [
    { line: 9, rule: "abbr", note: 'title "Retrieval-Augmented Generation" dropped: write the full name in the text' },
    { line: 9, rule: "time", note: 'datetime "2024-05-01" dropped: write it in the text if the reader needs it' },
    { line: 9, rule: "abbr" },
    { line: 9, rule: "del", note: 'datetime "2024-06-01" dropped: write it in the text if the reader needs it' },
    { line: 10, rule: "ins", note: 'cite "https://example.com" dropped: write it in the text if the reader needs it' },
    { line: 10, rule: "ins", note: 'datetime "2024-07-01" dropped: write it in the text if the reader needs it' },
    { line: 10, rule: "abbr", note: 'title "说 \\"你好\\" 的缩写" dropped: write the full name in the text' },
    { line: 11, rule: "span", note: "color #3a7bd5 written as the kit's blue" },
    { line: 11, rule: "span", note: "background #fff3a1 written as the kit's yellow highlight" },
  ]);
  // As printed: the file (from the project's folder), each rule at its lines, one line a note; no line asking to read it again.
  const file = path.join(projectRoot, "reports", "demo", "report.html");
  assert.deepEqual(changeLines(file, [...changes.slice(0, 4), { line: 12, rule: "code" }, { line: 30, rule: "code" }]), [
    `natural ${file}: abbr (line 9), time (line 9), del (line 9), code (lines 12, 30) rewritten in this file as the kit's markup (nothing to fix); the words and numbers are unchanged`,
    '  line 9, abbr: title "Retrieval-Augmented Generation" dropped: write the full name in the text',
    '  line 9, time: datetime "2024-05-01" dropped: write it in the text if the reader needs it',
    '  line 9, del: datetime "2024-06-01" dropped: write it in the text if the reader needs it',
  ]);
  assert.equal(changeLines(file, [{ line: 3, rule: "table" }], { dryRun: true }).join("\n"), `natural ${file}: table (line 3) would be rewritten in this file as the kit's markup (nothing to fix); a table is the kit's framed table; the words and numbers are unchanged`);
  // gallery check, which writes nothing: what the export will write.
  assert.equal(changeLines(file, [{ line: 3, rule: "table" }], { pending: true }).join("\n"), `natural ${file}: table (line 3) not rewritten yet: the export rewrites them in this file as the kit's markup (nothing to fix); a table is the kit's framed table; the words and numbers are unchanged`);
  assert.deepEqual(changeLines(file, [{ line: 3, rule: "table" }]), [`natural ${file}: table (line 3) rewritten in this file as the kit's markup (nothing to fix); a table is the kit's framed table; the words and numbers are unchanged`]);
}

// When the file is written (docs/editor.md, "Natural HTML"): never by reading it. shownSource is a
// report's source as its pages see it and the checks read it (the kit tags its blocks need added,
// `finish`, only when something was natural); handedInSource is what an export writes, that text
// with an id for every block, and a second hand-in changes nothing; a report whose ids repeat is left
// as it is (never renamed).
{
  const finish = (text) => text.replace("</head>", "<script data-kit-tag></script></head>");
  const source = page("    <p>带 <mark>标记</mark> 的一段。</p>\n    <p>另一段。</p>");
  const shown = shownSource(source, { finish });
  assert.ok(shown.text === finish(naturalize(source).text) && shown.changes.length === 1, "the kit's markup and its tags, in memory");
  assert.deepEqual(shownSource(shown.text, { finish }), { text: shown.text, changes: [] }, "nothing natural: the source as it is, no tag added");
  const handed = handedInSource(source, { finish });
  assert.ok(handed.changes.length === 1 && handed.added === findUnits(shown.text).units.length && handed.repeated.length === 0, JSON.stringify(handed));
  assert.equal(handed.text.replace(/ data-block-id="[a-z][a-z0-9]{7}"/g, ""), shown.text, "the page's text with ids");
  assert.deepEqual(findUnits(handed.text).units.filter((unit) => !unit.blockId), [], "every block an id");
  assert.deepEqual(handed.given.map(({ line, tag }) => [line, tag]), [[9, "<p>"], [10, "<p>"]], "each block given an id said with its line and its start tag");
  assert.ok(handed.given.every(({ id, line }) => handed.text.split("\n")[line - 1].includes(`data-block-id="${id}"`)), "its id on that line");
  assert.deepEqual(handedInSource(handed.text, { finish }), { text: handed.text, changes: [], added: 0, given: [], repeated: [], title: null, icon: null }, "a second hand-in changes nothing");
  const copied = source.replace("<p>另一段", '<p data-block-id="twice">一</p><p data-block-id="twice">另一段');
  const refused = handedInSource(copied, { finish });
  assert.ok(refused.text === copied && refused.added === 0 && refused.repeated.map((each) => each.id).join() === "twice", "repeated ids: the file as it is");
}


// ---------- intake: what the kit takes in ----------

// The kinds of a report's units in their boxes, as the editor finds them, and its text blocks (scan).
const shape = (text) => {
  const { units, boxes } = findUnits(text);
  return units.map((unit) => `${unit.kind}@${boxes[unit.box].kind}`);
};
const locked = (text) => instrument(text).html.match(/<[^>]*data-ge-lock[^>]*>/g) ?? [];
const grids = (text) => scan(text).units.filter((unit) => unit.kind === "table").map((unit) => unit.grid);
// The classes of a th's start tag as the browser reads them (`tag`: `<th class="…"`).
const parse5Classes = (tag) => parseFragment(`${tag.replace(/^<th/, "<div")}>`).childNodes[0].attrs.find((entry) => entry.name === "class").value.split(" ");

// A table taken in (only then: one of the kit's already keeps the looks it has, a header the reader
// made plain stays plain): each th but a row's header (scope="row": the header column's, which only
// sticks, the case and white space of its value aside) the header's look (components/table HEADER_LOOK, as the editor's
// 标题行 and a paste give it: bold, and the gray fill unless it has a color of its own; an alignment
// is no color), a nested table's th its own table's once; a first row all th (no rowspan) with rows
// after it a thead, the rows straight in it a tbody, an explicit tbody closed and opened again after
// the header; rows not closed in the file stay as written. What it makes is a table the page's
// table tools are for (plain: source/table.mjs).
{
  const { text, changes } = natural(`    <table>
      <tr><th>名</th><th class="doc-text-red">色</th><th class="doc-align-right">右</th><th class="doc-bold">粗</th></tr>
      <tr><th scope="row">甲</th><td>1</td><td>2</td><td>3<table><tr><th>内</th></tr><tr><td>x</td></tr></table></td></tr><tr><th SCOPE="Row ">乙</th><td>4</td><td>5</td><td>6</td></tr>
    </table>
    <table><tbody class="b" id="body">
      <tr><th>a</th><th>b</th></tr>
      <tr><td>1</td><td>2</td></tr>
    </tbody></table>
    <table><tr><th rowspan="2">跨</th><th>b</th></tr><tr><td>1</td></tr></table>
    <table><tr><th>只有</th><th>一行</th></tr></table>
    <table><tr><td>a</td><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>
    <table><thead><tr><th>已有</th></tr></thead><tr><td>1</td></tr></table>
    <table><tr><td>a<tr><td>b</table>
    <div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>读者去掉的</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></div>
    <table><tr><th rowspan="01">零一</th></tr><tr><td>1</td></tr></table>
    <table><tr><th class="a&quot;b">引号</th><th class='x&amp;lt;y'>实体</th></tr><tr><td>1</td><td>2</td></tr></table>`);
  const main = mainOf(text);
  const look = 'class="doc-bold doc-highlight-gray"';
  for (const part of [
    `<div class="doc-table-wrap"><table class="doc-table">
      <thead><tr><th ${look}>名</th><th class="doc-text-red doc-bold">色</th><th class="doc-align-right doc-bold doc-highlight-gray">右</th><th ${look}>粗</th></tr></thead>
      <tbody><tr><th scope="row">甲</th><td>1</td><td>2</td><td>3<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th ${look}>内</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table></div></td></tr><tr><th SCOPE="Row ">乙</th><td>4</td><td>5</td><td>6</td></tr></tbody>
    </table></div>`,
    `<div class="doc-table-wrap"><table class="doc-table"><thead>
      <tr><th ${look}>a</th><th ${look}>b</th></tr></thead><tbody class="b" id="body">
      <tr><td>1</td><td>2</td></tr>
    </tbody></table></div>`,
    `<div class="doc-table-wrap"><table class="doc-table"><tbody><tr><th ${look} rowspan="2">跨</th><th ${look}>b</th></tr><tr><td>1</td></tr></tbody></table></div>`,
    `<div class="doc-table-wrap"><table class="doc-table"><tbody><tr><th ${look}>只有</th><th ${look}>一行</th></tr></tbody></table></div>`,
    `<div class="doc-table-wrap"><table class="doc-table"><tbody><tr><td>a</td><th ${look}>b</th></tr><tr><td>1</td><td>2</td></tr></tbody></table></div>`,
    `<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th ${look}>已有</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></div>`,
    '<div class="doc-table-wrap"><table class="doc-table"><tr><td>a<tr><td>b</table></div>',
    '<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>读者去掉的</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></div>',
    `<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th ${look} rowspan="01">零一</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></div>`,
    '<thead><tr><th class="a&quot;b doc-bold doc-highlight-gray">引号</th><th class="x&amp;lt;y doc-bold doc-highlight-gray">实体</th></tr></thead>',
  ]) assert.ok(main.includes(part), `the kit's table: ${part}\n${main}`);
  assert.deepEqual(changes.filter((change) => change.rule === "header row").map((change) => change.line), [10, 11, 14, 23, 24], "a header row where a thead is made");
  assert.deepEqual(grids(text), [true, true, true, true, true, true, false, true, true, true], "each made table one the page's table tools are for (rows after a written thead given a tbody), but the one whose rows are not closed");
  assert.deepEqual(locked(text).filter((tag) => !tag.startsWith("<td")), [], "no cell read-only but the one holding a table");
  const classes = [...text.matchAll(/<th class="(a&quot;b|x&amp;lt;y)[^"]*"/g)].map(([tag]) => parse5Classes(tag));
  assert.deepEqual(classes, [["a\"b", "doc-bold", "doc-highlight-gray"], ["x&lt;y", "doc-bold", "doc-highlight-gray"]], "a class as written read back the same, the look's beside it");
}

// A report whose own <style> styles th or thead: its tables' th as written (the kit's header fill
// would cover the report's: no look, no thead), the table's change says so; its rows a tbody still.
// One that styles captions keeps a caption as written. A class or id of those names, or nth-child,
// is no type.
{
  const table = "    <table><caption>单位：人</caption><tr><th>组</th><th>人数</th></tr><tr><td>甲</td><td>12</td></tr></table>";
  const styledBy = (css) => naturalize(page(table).replace("</style>", `${css}</style>`));
  for (const css of [" th { background: #1e3a5f; color: #fff; }", " table thead { color: red }", " @media print { :is(TH, td) { padding: 0 } }"]) {
    const { text, changes } = styledBy(css);
    assert.ok(mainOf(text).includes('<p class="doc-note">单位：人</p><div class="doc-table-wrap"><table class="doc-table"><tbody><tr><th>组</th><th>人数</th></tr><tr><td>甲</td><td>12</td></tr></tbody></table></div>'), `${css}\n${mainOf(text)}`);
    assert.deepEqual(changes.filter((change) => change.note).map((change) => `${change.rule}: ${change.note}`), ["table: its th as written (no header look, no thead): the document's own <style> styles th"]);
    assert.deepEqual(naturalize(text).changes, [], "once is enough");
  }
  assert.ok(styledBy(" .th, #thead, td:nth-child(2), [data-th] { color: red }").text.includes("<thead><tr><th class=\"doc-bold doc-highlight-gray\">组</th>"), "no type of those names: the header's look");
  const captioned = styledBy(" caption { caption-side: bottom; }").text;
  assert.ok(mainOf(captioned).includes('<table class="doc-table"><caption>单位：人</caption><thead>'), mainOf(captioned));
  assert.deepEqual(readOnlyTexts(captioned), ['line 9: <caption>: the preview cannot edit a table caption; write the line above the table as <p class="doc-note">']);
}

// A bare table's caption of words (inline elements and formulas among them): a line of small text right
// above its frame (p.doc-note, the table's id on the frame), the file's lines kept; one with an
// attribute or a block, or a caption of a table of the kit's, stays, and is named read-only.
{
  const body = String.raw`    <p>前</p>
    <table data-block-id="tttttttt">
      <caption>来源：<a href="https://example.com/x">统计局</a> \(n=3\)</caption>
      <tr><th>a</th></tr><tr><td>1</td></tr>
    </table>
    <table><caption class="c">带属性</caption><tr><td>1</td></tr></table>
    <table><caption>有块<div>块</div></caption><tr><td>1</td></tr></table>
    <div class="doc-table-wrap"><table class="doc-table"><caption>已有外框</caption><tbody><tr><td>1</td></tr></tbody></table></div>`;
  const { text, changes } = natural(body);
  const main = mainOf(text);
  assert.ok(main.includes(String.raw`    <p class="doc-note">来源：<a href="https://example.com/x">统计局</a> <span class="doc-math-inline">\(n=3\)</span></p>
      <div class="doc-table-wrap" data-block-id="tttttttt"><table class="doc-table">
      <thead><tr><th class="doc-bold doc-highlight-gray">a</th></tr></thead><tbody><tr><td>1</td></tr></tbody>
    </table></div>`), main);
  assert.equal(text.split("\n").length, page(body).split("\n").length, "no line more or less");
  assert.deepEqual(changes.filter((change) => change.rule === "caption"), [{ line: 11, rule: "caption" }]);
  assert.ok(main.includes('<table class="doc-table"><caption class="c">带属性</caption>') && main.includes("<caption>有块<div>块</div></caption>"), main);
  const note = '<caption>: the preview cannot edit a table caption; write the line above the table as <p class="doc-note">';
  assert.deepEqual(readOnlyTexts(text).filter((line) => line.includes("<caption>")), [`line 14: ${note}`, `line 15: ${note}`, `line 16: ${note}`]);
  assert.deepEqual(shape(text).slice(0, 3), ["paragraph@main", "paragraph@main", "table@main"], "the caption's line a paragraph of its own, the table after it");
}

// An aside of no class: a highlight panel (its tag and attributes kept), its words in paragraphs,
// blocks or not; unless the report's own <style> styles aside (a class or id of that name is not
// the type). One with a class of its own is a whole block.
{
  const { text } = natural(`    <aside>旁注 <mark>重点</mark></aside>
    <aside id="n"><h3>标题</h3>散字<p>段</p></aside>
    <aside class="mine"><p>自己的</p></aside>`);
  const main = mainOf(text);
  assert.ok(main.includes('<aside class="doc-panel"><p>旁注 <span class="doc-highlight-yellow">重点</span></p></aside>'), main);
  assert.ok(main.includes('<aside class="doc-panel" id="n"><h3>标题</h3><p>散字</p><p>段</p></aside>'), main);
  assert.ok(main.includes('<aside class="mine"><p>自己的</p></aside>'));
  assert.deepEqual(shape(text), ["highlight@main", "paragraph@highlight", "highlight@main", "heading@highlight", "paragraph@highlight", "paragraph@highlight", "block@main"]);
  assert.deepEqual(locked(text), []);
  const styledBy = (css) => naturalize(page("    <aside><p>旁</p></aside>").replace("</style>", `${css}</style>`)).text.includes('<aside class="doc-panel">');
  assert.ok(!styledBy(" aside { float: right; }") && !styledBy(" @media print { main > aside, .x { display: none } }") && !styledBy("/* x */ ASIDE{}"), "the report styles its asides: as written");
  assert.ok(styledBy(" .aside { color: red; } #aside, .aside-note, [data-aside] { } /* aside { } */"), "a class, an id or an attribute of that name, a comment: not the type");
}

// A block's fill (doc-highlight-<color>) written on a disclosure, an aside or a pre: the kit's
// block takes it (a code block's on its div); a class of the report's own beside it, as written.
{
  const { text, changes } = natural(`    <details class="doc-highlight-blue"><summary>s</summary><p>p</p></details>
    <aside class="doc-highlight-green"><p>a</p></aside>
    <pre class="doc-highlight-gray"><code class="language-js">x</code></pre>
    <details class="doc-highlight-blue mine"><summary>s</summary><p>p</p></details>`);
  const main = mainOf(text);
  for (const part of [
    '<details class="doc-details doc-highlight-blue"><summary><span class="doc-details-summary-label">s</span></summary><div class="doc-details-content"><p>p</p></div></details>',
    '<aside class="doc-highlight-green doc-panel"><p>a</p></aside>',
    '<div class="doc-code doc-highlight-gray" data-language="js"><div class="doc-code-title"></div><pre><code>x</code></pre></div>',
    '<details class="doc-highlight-blue mine"><summary>s</summary>',
  ]) assert.ok(main.includes(part), `${part}\n${main}`);
  assert.deepEqual(changes.filter((change) => change.note), [], "nothing noted");
}

// A detail card written the short way, <dialog id="x"> of nothing else, of words or starting with a
// block: the kit's (dialog/file.mjs's markup), all it holds its content, a plain <h2> or <h3> first
// in it an h3, loose words paragraphs; a plain link to it (href="#x", nothing else on it) its
// trigger. Not a dialog of a class, of another attribute, of an id taken, empty, starting with no
// block or holding a form; nor a link to what is no card.
{
  const { text, changes } = natural(`    <p>见<a href="#renewal">续借</a>和<a href="#n">别处</a>。</p>
    <dialog id="renewal">
      <h2>续借</h2>
      <p>到期前延长 14 天。</p>
      散字
    </dialog>
    <p id="n">段</p>
    <dialog id="m" class="mine"><h2>t</h2></dialog>
    <dialog id="o" open><h2>t</h2></dialog>
    <dialog id="q"><h4>t</h4></dialog>
    <dialog id="n"><h2>t</h2></dialog>
    <dialog id="r"><h3>三 <mark>级</mark></h3><p>话</p></dialog><span id="r-title"></span>
    <dialog id="s"><p>只有正文。</p></dialog>
    <dialog id="u">只有字</dialog>
    <dialog id="v"><ul><li>项</li></ul></dialog>
    <dialog id="w"></dialog>
    <dialog id="x"><span>行内</span></dialog>
    <dialog id="y"><p>确定？</p><form method="dialog"><button>好</button></form></dialog>`);
  const main = mainOf(text);
  assert.ok(main.includes('<p>见<a class="doc-dialog-trigger" href="#renewal">续借</a>和<a href="#n">别处</a>。</p>'), main);
  assert.ok(main.includes(`<dialog class="doc-dialog" id="renewal"><div class="doc-dialog-panel"><div class="doc-dialog-content">
      <h3>续借</h3>
      <p>到期前延长 14 天。</p>
      <p>散字</p>
    </div></div></dialog>`), main);
  assert.ok(main.includes('<dialog class="doc-dialog" id="r"><div class="doc-dialog-panel"><div class="doc-dialog-content"><h3>三 <span class="doc-highlight-yellow">级</span></h3><p>话</p></div></div></dialog>'), `an h3 first stays an h3, its words the kit's: ${main}`);
  const opened = (id) => `<dialog class="doc-dialog" id="${id}"><div class="doc-dialog-panel"><div class="doc-dialog-content">`;
  assert.ok(main.includes(`${opened("q")}<h4>t</h4></div></div></dialog>`), `a heading of another level stays one: ${main}`);
  assert.ok(main.includes(`${opened("s")}<p>只有正文。</p></div></div></dialog>`), `no heading: ${main}`);
  assert.ok(main.includes(`${opened("u")}<p>只有字</p></div></div></dialog>`), `nothing but words: ${main}`);
  assert.ok(main.includes(`${opened("v")}<ul><li>项</li></ul></div></div></dialog>`), `a list first: ${main}`);
  for (const kept of ['<dialog id="m" class="mine">', '<dialog id="o" open>', '<dialog id="n">', '<dialog id="w">', '<dialog id="x">', '<dialog id="y">']) assert.ok(main.includes(kept), `as written: ${kept}`);
  assert.deepEqual(changes.map(({ rule }) => rule), ["dialog link", "dialog", "loose words", "dialog", "dialog", "mark", "dialog", "loose words", "dialog", "dialog"]);
  assert.deepEqual(componentFailures(main.slice(0, main.indexOf("</dialog>") + 9)), []);
}

// A detail card of the kit's older form (a header in its panel, of its title and a close button)
// reads as the new one, in place and silently, as the old names do: the title an h3 first in the
// content, nothing left of the header, no line moved, no change said. The tools read it through
// naturalize, so that the checks pass it and it takes the new form at its first edit or export.
{
  const card = (id, labelled, title, more = '<button class="doc-dialog-close" type="button" data-doc-dialog-close aria-label="关闭详情弹窗">×</button>', header = "header") =>
    `<dialog class="doc-dialog" id="${id}"${labelled ? ` aria-labelledby="${labelled}"` : ""}><div class="doc-dialog-panel"><${header} class="doc-dialog-header">${title}${more}</${header}><div class="doc-dialog-content"><p>话</p></div></div></dialog>`;
  const shown = (body) => mainOf(naturalize(page(body)).text);
  const opened = (id) => `<dialog class="doc-dialog" id="${id}"><div class="doc-dialog-panel"><div class="doc-dialog-content">`;

  // On lines of their own, as the editor wrote it: where the button and the header's end stood, blanks.
  const source = page(`    <p><a class="doc-dialog-trigger" href="#x">开</a></p>
    <dialog class="doc-dialog" id="x" aria-labelledby="x-title">
      <div class="doc-dialog-panel">
        <header class="doc-dialog-header">
          <h2 class="doc-dialog-title" id="x-title">材料 <strong>粗</strong> \\(x\\)</h2>
          <button class="doc-dialog-close" type="button" data-doc-dialog-close aria-label="关闭详情弹窗">×</button>
        </header>
        <div class="doc-dialog-content">
          <p>话</p>
        </div>
      </div>
    </dialog>`);
  const { text, changes } = naturalize(source);
  assert.deepEqual(changes.filter(({ rule }) => rule !== "formula"), [], "nothing said of it");
  assert.equal(text.split("\n").length, source.split("\n").length, "no line moved");
  assert.ok(/<dialog class="doc-dialog" id="x">\n\s*<div class="doc-dialog-panel">\n\s*<div class="doc-dialog-content">\n\s*<h3>材料 <strong>粗<\/strong> [^\n]*<\/h3>\s*<p>话<\/p>\n\s*<\/div>\n\s*<\/div>\n\s*<\/dialog>/.test(text), text);
  assert.deepEqual(componentFailures(text), [], "the checks pass it");
  assert.equal(naturalize(text).text, text, "once is enough");
  assert.ok(findUnits(text).units.some((unit) => unit.tag === "h3" || unit.element?.tagName === "h3"), "the title is a block of the card's content");

  assert.ok(shown(card("d", "d-title", '<h2 class="doc-dialog-title" id="d-title">题</h2>', "", "div")).includes(`${opened("d")}<h3>题</h3><p>话</p>`), "a div for its header, no button");
  assert.ok(shown(card("e", "another-form", '<h2 class="doc-dialog-title" id="another-form">题</h2>')).includes(`${opened("e")}<h3>题</h3><p>话</p>`), "a title's id of another form");
  assert.ok(shown(card("f", null, '<h2 class="doc-dialog-title">题</h2>')).includes(`${opened("f")}<h3>题</h3><p>话</p>`), "no id, no label");
  assert.ok(shown(card("g", "g-title", '<h2 class="doc-dialog-title mine" id="g-title" data-block-id="abcd1234">题</h2>')).includes(`${opened("g")}<h3 class="mine" data-block-id="abcd1234">题</h3><p>话</p>`), "its own class and block id stay");
  const older = shown(card("h", "report-t", '<h2 class="doc-dialog-title" id="report-t">题</h2>').replace(/doc-dialog/g, "report-dialog"));
  assert.ok(older.includes(`${opened("h")}<h3>题</h3><p>话</p>`), `report-dialog-* names: ${older}`);
  assert.ok(shown(`<p>写着 ttl 这个词的段落</p>${card("old-form", "ttl", '<h2 class="doc-dialog-title" id="ttl">题</h2>')}`).includes("<h3>题</h3>"), "a word of the text names no id");

  // An id something else names stays on the heading; the card's own pointer to it goes all the same.
  const named = shown(`<p><a href="#ttl">到标题</a></p>${card("i", "ttl", '<h2 class="doc-dialog-title" id="ttl">题</h2>')}`);
  assert.ok(named.includes(`${opened("i")}<h3 id="ttl">题</h3>`), named);
  const scripted = naturalize(page(card("j", "ttl", '<h2 class="doc-dialog-title" id="ttl">题</h2>')).replace("</body>", '<script>document.querySelector("#ttl");</script></body>')).text;
  assert.ok(mainOf(scripted).includes('<h3 id="ttl">题</h3>'), "a script's too");
  // A label of the card's that names something else is the file's.
  assert.ok(shown(`<span id="own">名</span>${card("k", "own", '<h2 class="doc-dialog-title" id="k-title">题</h2>')}`).includes('<dialog class="doc-dialog" id="k" aria-labelledby="own">'), "another label stays");

  // Outside main, or inside a block of the document's own, the same.
  const stray = naturalize(page("    <p>字</p>").replace("  </main>\n", `  </main>\n  ${card("l", "l-title", '<h2 class="doc-dialog-title" id="l-title">题</h2>')}\n`)).text;
  assert.ok(mainOf(stray).includes(`${opened("l")}<h3>题</h3><p>话</p>`), stray);
  assert.ok(shown(`<div class="mine">${card("m", "m-title", '<h2 class="doc-dialog-title" id="m-title">题</h2>')}</div>`).includes(`${opened("m")}<h3>题</h3>`), "in a block of its own");

  // A block with no id is named as any Agent's is, one with its id keeps it.
  const handed = handedInSource(page(card("n", "n-title", '<h2 class="doc-dialog-title" id="n-title">题</h2>')), { next: (() => { let at = 0; return () => `id${String(++at).padStart(6, "0")}`; })() });
  assert.ok(/<h3 data-block-id="id\d{6}">题<\/h3>/.test(handed.text), handed.text);

  // Anything else in its header, or a title that stands alone: as written, for the checks to say.
  for (const [body, gone] of [
    [card("p", "p-title", '<h2 class="doc-dialog-title" id="p-title">题</h2>', "<span>别的</span>"), "doc-dialog-header"],
    [card("q", null, '<h2 class="doc-dialog-title">题</h2><h2 class="doc-dialog-title">再</h2>', ""), "doc-dialog-header"],
    ['<dialog class="doc-dialog" id="r"><div class="doc-dialog-panel"><h2 class="doc-dialog-title">题</h2><div class="doc-dialog-content"><p>话</p></div></div></dialog>', "doc-dialog-title"],
    ['<dialog class="doc-dialog" id="s"><div class="doc-dialog-panel"><header class="doc-dialog-header"><h2 class="doc-dialog-title">题</h2></header>字<div class="doc-dialog-content"><p>话</p></div></div></dialog>', "doc-dialog-header"],
    ['<dialog class="doc-dialog" id="t"><div class="doc-dialog-panel"><header class="doc-dialog-header"><h2 class="doc-dialog-title">题</h2></header></div></dialog>', "doc-dialog-header"],
  ]) {
    assert.equal(mainOf(naturalize(page(body)).text).trim().endsWith(`${body}`), true, `as written: ${body}`);
    assert.ok(componentFailures(naturalize(page(body)).text).some((failure) => failure.includes(`class ${gone}`) && failure.includes("is gone")), `the checks say so: ${body}`);
  }
}

// A detail card outside main (an Agent's </main><dialog …>), the kit's or written the short way: at
// main's end, where the editor and a page's Markdown find a card, in the file's order, its link its
// trigger, what it holds made the kit's as anywhere, its lines gone from where it stood. A dialog of
// the report's own stays where it is.
{
  const kit = '<dialog class="doc-dialog" id="kit"><div class="doc-dialog-panel"><div class="doc-dialog-content"><h3>卡</h3><p>甲</p></div></div></dialog>';
  const chart = "<table data-doc-chart=\"bars\"><caption>图题</caption><tr><th>名</th></tr><tr><td>值</td></tr></table>";
  const source = page('    <p>见<a href="#after">页外</a>和<a href="#kit">卡</a></p>').replace("  </main>\n", `  </main>
  <dialog id="after">
    <h2>页外卡</h2>
    <p>页外话 <mark>标</mark></p>
    ${chart}
    散字
  </dialog>
  <dialog class="mine" id="own"><h2>自己的</h2></dialog>
  <footer>页脚</footer>
  ${kit}
`);
  const { text, changes } = naturalize(source);
  const main = mainOf(text);
  assert.ok(main.includes('<a class="doc-dialog-trigger" href="#after">') && main.includes('<a class="doc-dialog-trigger" href="#kit">'), `its link its trigger: ${main}`);
  assert.ok(main.includes('<dialog class="doc-dialog" id="after">') && main.includes('<span class="doc-highlight-yellow">标</span>') && main.includes("<p>散字</p>"), `made the kit's: ${main}`);
  assert.ok(main.includes('<figure class="doc-figure"><h3>图题</h3>') && !/<caption>/.test(text), `a chart in it too: ${main}`);
  assert.ok(main.includes(kit), `the kit's as written: ${main}`);
  assert.ok(main.indexOf('id="after"') < main.indexOf('id="kit"'), "in the file's order");
  const after = text.slice(text.indexOf("</main>"));
  assert.ok(!after.includes("doc-dialog") && after.includes('<dialog class="mine" id="own">') && after.includes("<footer>页脚</footer>"), `what is no card stays: ${after}`);
  assert.equal(text.split("\n").length, source.split("\n").length, "the file keeps its lines");
  assert.ok(/\n {2}<\/main>\n/.test(text), `main's end on its own line: ${text}`);
  assert.equal(naturalize(text).changes.length, 0, "once is enough");
  assert.ok(changes.some(({ rule }) => rule === "card outside main"), JSON.stringify(changes));
  const line = '<!doctype html><html><head><title>t</title></head><body><main class="doc-page"><p>字</p></main><dialog id="one"><h2>题</h2><p>话</p></dialog></body></html>';
  assert.ok(/<p>字<\/p><dialog class="doc-dialog" id="one"[\s\S]*<\/dialog><\/main><\/body>/.test(naturalize(line).text), `all on one line: ${naturalize(line).text}`);
  const tail = '<!doctype html><html><head><title>t</title></head><body><main class="doc-page">\n<p>字</p>\n</main><dialog id="one"><h2>题</h2><p>话</p></dialog>\n</body></html>';
  assert.equal(naturalize(tail).text.split("\n").length, tail.split("\n").length, "on the line of main's end tag, the file keeps its lines too");
  const open = '<!doctype html><html><head><title>t</title></head><body><dialog id="one"><h2>题</h2></dialog><main class="doc-page"><p>字</p></body></html>';
  assert.ok(naturalize(open).text.indexOf("<dialog") < naturalize(open).text.indexOf("<main"), "a main of no end tag has no end to go to");
}

// Sheet tabs written the short way, <section data-doc-sheets="name"> of <section>s alone, each of
// no attribute and starting with its heading (h2–h4), its tab's name: the kit's (sheets/file.mjs's markup), its row of tabs on the
// shell's line, a key of ASCII made of each name (else tab-<n>, no other tab's of the area), each
// section a panel of the rest, the heading's lines left blank (the file keeps its lines), what the
// heading carried besides its words noted; a name made for an area of none, no other area's. An area
// of the kit's is never touched, nor one in neither form, which the checks fail, saying what to write.
{
  const body = `    <section data-doc-sheets="views">
      <section>
        <h2>Overview</h2>
        <p>总体。</p>
      </section>
      <!-- 第二页 -->
      <section><h3 class="doc-text-red">分组 <code>A</code></h3>散字<p>分组。</p></section>
      <section>
        <h4>Overview</h4>
      </section>
    </section>
    <section data-doc-sheets="tabs-1" class="doc-sheet-shell"><div class="doc-sheet-tabs"><button class="doc-sheet-tab" type="button" data-sheet-tab="a">A</button></div><div data-doc-sheet="a"><p>a</p></div></section>
    <section data-doc-sheets><section><h2>甲</h2><p>一</p></section><section><h2>乙</h2></section></section>
    <section data-doc-sheets="none"><section><p>没有标题</p></section></section>
    <section data-doc-sheets="mixed"><section><h2>甲</h2></section><div><p>别的</p></div></section>
    <section data-doc-sheets="empty"></section>
    <section data-doc-sheets="intro"><section><p>引言</p><h2>甲</h2><p>一</p></section></section>
    <section data-doc-sheets="named"><section id="results"><h2>甲</h2></section></section>`;
  const { text, changes } = natural(body);
  const main = mainOf(text);
  const label = 'aria-label="选项卡"';
  assert.ok(main.includes(`<section class="doc-sheet-shell" data-doc-sheets="views" ${label}><div class="doc-sheet-tabs" ${label}><button class="doc-sheet-tab" type="button" data-sheet-tab="overview">Overview</button><button class="doc-sheet-tab" type="button" data-sheet-tab="a">分组 A</button><button class="doc-sheet-tab" type="button" data-sheet-tab="overview-2">Overview</button></div>
      <div data-doc-sheet="overview">

        <p>总体。</p>
      </div>
      <!-- 第二页 -->
      <div data-doc-sheet="a"><p>散字</p><p>分组。</p></div>
      <div data-doc-sheet="overview-2">

      </div>
    </section>`), main);
  assert.ok(main.includes(`<section class="doc-sheet-shell" data-doc-sheets="tabs-2" ${label}><div class="doc-sheet-tabs" ${label}><button class="doc-sheet-tab" type="button" data-sheet-tab="tab-1">甲</button><button class="doc-sheet-tab" type="button" data-sheet-tab="tab-2">乙</button></div><div data-doc-sheet="tab-1"><p>一</p></div><div data-doc-sheet="tab-2"></div></section>`), `a name made, no other area's:\n${main}`);
  for (const kept of ['<section data-doc-sheets="tabs-1" class="doc-sheet-shell"><div class="doc-sheet-tabs">', '<section data-doc-sheets="none"><section><p>没有标题</p></section></section>',
    '<section data-doc-sheets="mixed"><section><h2>甲</h2></section><div><p>别的</p></div></section>', '<section data-doc-sheets="empty"></section>',
    '<section data-doc-sheets="intro"><section><p>引言</p><h2>甲</h2><p>一</p></section></section>', '<section data-doc-sheets="named"><section id="results"><h2>甲</h2></section></section>']) assert.ok(main.includes(kept), `as written: ${kept}`);
  assert.equal(text.split("\n").length, page(body).split("\n").length, "the file keeps its lines");
  assert.deepEqual(changes, [
    { line: 9, rule: "sheets", note: 'class of the heading "分组 A" left out: a tab is its name alone' },
    { line: 9, rule: "sheets", note: `<code> in the heading "分组 A" left out: a tab's name is plain text` },
    { line: 15, rule: "loose words" },
    { line: 21, rule: "sheets" },
  ]);
  // The editor takes them as it takes the tabs it writes: a tab a unit of the row, its panel a box.
  const areas = main.split("\n").filter((line) => line.includes("data-doc-sheets"));
  assert.deepEqual(shape(page(areas.at(2))), shape(page('    <section class="doc-sheet-shell" data-doc-sheets="s"><div class="doc-sheet-tabs"><button class="doc-sheet-tab" type="button" data-sheet-tab="tab-1">甲</button><button class="doc-sheet-tab" type="button" data-sheet-tab="tab-2">乙</button></div><div data-doc-sheet="tab-1"><p>一</p></div><div data-doc-sheet="tab-2"></div></section>')));
  // The checks: what it made passes, an area in neither form says why and what to write, once.
  const failures = componentFailures(text);
  const advice = "write a <section> of no attribute straight in it for each tab, starting with its heading (<h2>–<h4>), the tab's name, the rest its blocks, and nothing else: the export makes the kit's tabs";
  assert.deepEqual(failures, [
    `sheets (line 22) has no tabs and is no short form: its <section> (line 22) has no heading (<h2>–<h4>); ${advice}`,
    `sheets (line 23) has no tabs and is no short form: a <div> (line 23) beside its sections; ${advice}`,
    `sheets (line 24) has no tabs and is no short form: no <section> in it; ${advice}`,
    `sheets (line 25) has no tabs and is no short form: its <section> (line 25) does not start with its heading; ${advice}`,
    `sheets (line 26) has no tabs and is no short form: its <section> (line 26) has an attribute of its own (id); ${advice}`,
  ]);
  // One written so where no block stands (in a whole block) is left, and the checks say where it stands.
  const inWhole = natural('    <div class="strip"><section data-doc-sheets="w"><section><h2>甲</h2></section></section></div>');
  assert.deepEqual(componentFailures(inWhole.text), [`sheets (line 9) has no tabs and is no short form: it stands where no block does (in a whole block or a figure); ${advice}`]);
  // In a page whose lang is en, its labels say so in English (the file's language).
  const english = naturalize(page('    <section data-doc-sheets="s"><section><h2>A</h2></section></section>').replace('<html lang="zh-CN">', '<html lang="en">')).text;
  assert.ok(mainOf(english).includes('<section class="doc-sheet-shell" data-doc-sheets="s" aria-label="Tabs"><div class="doc-sheet-tabs" aria-label="Tabs">'), mainOf(english));
}

// A bookmark written the short way, a paragraph holding only <a class="doc-bookmark" href="…">
// words</a>: the kit's card (bookmark/file.mjs's markup), the words its title, the link's title its
// description, the address its URL, an empty caption, the paragraph's attributes kept; nothing
// fetched. A link of no words takes the page's host; a target or rel other than the card's is noted.
// Not a paragraph holding more, a link of another attribute or class, or one holding an element:
// the checks fail what is left, saying what to write; a link that is no web address fails as the
// kit's card does (render/images.mjs).
{
  const body = `    <p data-block-id="bk000001"><a class="doc-bookmark" href="https://example.com/a?b=1&amp;c=2" title="评测 &quot;手册&quot;">评测手册</a></p>
    <p>
      <a class="doc-bookmark" href="https://example.org/x" target="_self" rel="noopener"></a>
    </p>
    <p><a class="doc-bookmark" href="https://example.com/">书签</a> 和别的字</p>
    <p><a class="doc-bookmark" href="https://example.com/" id="x">书签</a></p>
    <p><a class="doc-bookmark" href="https://example.com/"><strong>书签</strong></a></p>
    <p><a class="doc-bookmark" href="javascript:void(0)">坏的</a></p>`;
  const { text, changes } = natural(body);
  const main = mainOf(text);
  const card = (href, title, description = "") => `<a class="doc-bookmark-card" href="${href}" target="_blank" rel="noopener noreferrer"><span class="doc-bookmark-text"><span class="doc-bookmark-title">${title}</span>${description}<span class="doc-bookmark-url"><span class="doc-bookmark-href">${href}</span></span></span></a>`;
  assert.ok(main.includes(`<figure class="doc-bookmark" data-block-id="bk000001">${card("https://example.com/a?b=1&amp;c=2", "评测手册", '<span class="doc-bookmark-description">评测 "手册"</span>')}<figcaption></figcaption></figure>`), main);
  assert.ok(main.includes(`<figure class="doc-bookmark">
      ${card("https://example.org/x", "example.org")}
    <figcaption></figcaption></figure>`), `no words: the page's host its title, the lines kept:\n${main}`);
  assert.ok(main.includes(`<figure class="doc-bookmark">${card("javascript:void(0)", "坏的")}<figcaption></figcaption></figure>`), main);
  for (const kept of ['<p><a class="doc-bookmark" href="https://example.com/">书签</a> 和别的字</p>', '<p><a class="doc-bookmark" href="https://example.com/" id="x">书签</a></p>', '<p><a class="doc-bookmark" href="https://example.com/"><strong>书签</strong></a></p>']) assert.ok(main.includes(kept), `as written: ${kept}`);
  assert.deepEqual(changes, [
    { line: 9, rule: "bookmark" },
    { line: 10, rule: "bookmark", note: 'target "_self" left out: a bookmark opens its page in a new tab' },
    { line: 16, rule: "bookmark" },
  ]);
  assert.deepEqual(shape(text).filter((kind) => !kind.startsWith("paragraph")), ["bookmark@main", "bookmark@main", "bookmark@main"]);
  const advice = 'a bookmark written the short way is a paragraph in a flow holding only <a class="doc-bookmark" href="https://…">its title</a> (a title attribute its description, nothing else on it, words alone in it): the export makes the card';
  assert.deepEqual(componentFailures(text), [13, 14, 15].map((line) => `<a class="doc-bookmark"> (line ${line}) is no bookmark: ${advice}`));
  assert.deepEqual(componentFailures(text.replace(/^.*javascript.*$/m, "").replace(/^.*(?:和别的字|id="x"|<strong>书签).*$/gm, "")), [], "what it made passes the components' checks");
  assert.deepEqual(imageFailures({ html: text, directory: os.tmpdir() }), ['line 16: a bookmark\'s link (javascript:void(0)) is a web address: <a class="doc-bookmark-card" href="https://…">'], "a link that is no web address fails as the kit's card does");
}

// Loose words in a container of no class of its own (a section, main, a quote, an article, a div; a
// kit's flow): each run of words and inline elements between its blocks a paragraph (comments and
// blanks at its ends stay outside, its inline tags the kit's), a run that is one display
// formula a formula block, as a class-less div of one is (its attributes kept). A picture standing
// between blocks is a figure, one amid the words stays in their paragraph (named read-only). A
// container with a class of its own (the kit's panel too) and a run holding an element not closed
// are left, and named. The section's blocks are blocks of their own then (found testing the skill with Agents).
{
  const { text } = natural(String.raw`    <section>
      <h2>章</h2>
      散字一句 <mark>强调</mark> 和 \(x^2\)。
      <!-- 注释 -->
      <p>注释后的段</p>
      <p>段落</p>
      \[ E = mc^2 \]
      <ul><li>项</li></ul>
      <img src="assets/a.png" alt="">
      <p>段</p>
      图在 <img src="assets/b.png" alt=""> 字中
    </section>
    直接在 main 里的字
    <div data-x="1">$$ a + b $$</div>
    <blockquote><p>引</p>引后的字</blockquote>
    <article><p>a</p>文章里的字 <b>粗</b></article>
    <div class="doc-panel mine"><p>p</p>自己的类里的字</div>
    <section><p>a</p>没闭合 <b>粗</section>`);
  const main = mainOf(text);
  assert.ok(main.includes(String.raw`    <section>
      <h2>章</h2>
      <p>散字一句 <span class="doc-highlight-yellow">强调</span> 和 <span class="doc-math-inline">\(x^2\)</span>。</p>
      <!-- 注释 -->
      <p>注释后的段</p>
      <p>段落</p>
      <div class="doc-math-block">\[ E = mc^2 \]</div>
      <ul><li>项</li></ul>
      <figure class="doc-image"><img src="assets/a.png" alt=""><figcaption></figcaption></figure>
      <p>段</p>
      <p>图在 <img src="assets/b.png" alt=""> 字中</p>
    </section>
    <p>直接在 main 里的字</p>
    <div class="doc-math-block" data-x="1">$$ a + b $$</div>
    <blockquote><p>引</p><p>引后的字</p></blockquote>
    <article><p>a</p><p>文章里的字 <b>粗</b></p></article>
    <div class="doc-panel mine"><p>p</p>自己的类里的字</div>
    <section><p>a</p>没闭合 <b>粗</section>`), main);
  assert.deepEqual(shape(text).slice(0, 10), ["section@main", "heading@section", "paragraph@section", "paragraph@section", "paragraph@section", "math@section", "list@section", "item@list", "image@section", "paragraph@section"], "the section's blocks are units");
  assert.deepEqual(readOnlyTexts(text), [
    "line 19: <p>: a picture amid the words: give it a paragraph of its own",
    "line 25: <div>: words straight in it, outside any paragraph: give them a <p> (the preview cannot reach them, nor move its blocks one by one)",
    "line 26: <section>: words straight in it, outside any paragraph: give them a <p> (the preview cannot reach them, nor move its blocks one by one)",
    "line 26: <b>: an element not closed in the file (the parser closed it)",
  ]);
  assert.ok(findBlocks(text).some((block) => block.kind === "tex" && block.tag === "div"), "a formula block");
  // A disclosure's loose words: paragraphs in its content, blocks or not (the details' own rule).
  const details = mainOf(natural(`    <details><summary>展开</summary>
      前言 <mark>记</mark>
      <p>段</p>
      后记
    </details>`).text);
  assert.ok(details.includes(`<details class="doc-details"><summary><span class="doc-details-summary-label">展开</span></summary><div class="doc-details-content">
      <p>前言 <span class="doc-highlight-yellow">记</span></p>
      <p>段</p>
      <p>后记</p>
    </div></details>`), details);
}

// Loose words the page shows on one line stay on one line: a comment or a control amid them stays in
// their paragraph (read-only then, and named: the preview edits neither), a control alone (no words
// beside it) is no paragraph. A run with an inline element holding a block (a link around a card, a
// span or bold around a paragraph) stays as written, as the browser would close a paragraph at that
// block and draw the rest otherwise (the container named); a text of zero-width characters is no
// words. Once is enough for each.
{
  const { text } = natural(`    <section>
      <h2>章</h2>
      一句<!-- 句中 --> 两半 <em>强调</em>
      <p>段</p>
      名字 <input type="text" name="n"> 后面
      <p>段</p>
      <button type="button">只有按钮</button>
      <p>段</p>
      &#8203;
      <p>段</p>
    </section>
    <section>更多见：<a href="#x" class="card"><div class="card-title">标题</div><p>描述</p></a><p>后</p></section>
    <section>前 <b><p>粗段</p></b><p>后</p></section>
    <article>前 <span><div>块</div></span><p>后</p></article>`);
  const main = mainOf(text);
  assert.ok(main.includes(`<h2>章</h2>
      <p>一句<!-- 句中 --> 两半 <em>强调</em></p>
      <p>段</p>
      <p>名字 <input type="text" name="n"> 后面</p>
      <p>段</p>
      <button type="button">只有按钮</button>
      <p>段</p>
      &#8203;
      <p>段</p>`), main);
  for (const part of ['<section>更多见：<a href="#x" class="card"><div class="card-title">标题</div><p>描述</p></a><p>后</p></section>', "<section>前 <b><p>粗段</p></b><p>后</p></section>", "<article>前 <span><div>块</div></span><p>后</p></article>"]) assert.ok(main.includes(part), part);
  const loose = (line, tag) => `line ${line}: <${tag}>: words straight in it, outside any paragraph: give them a <p> (the preview cannot reach them, nor move its blocks one by one)`;
  assert.deepEqual(readOnlyTexts(text), [
    "line 11: <p>: an HTML comment amid the words",
    "line 13: <p>: <input> amid the words (the preview edits strong, em, b, i, u, s, code, a, sub, sup and br, the kit's colors (doc-text-*, doc-highlight-*) and formulas)",
    loose(20, "section"), loose(21, "section"), loose(22, "article"),
  ]);
}

// A caption the kit leaves (one display formula alone, which as a line of small text would be a
// formula block next time; one with a block inside an inline element; one with a control) stays, and
// is named; an empty one is not named (nothing in it to edit).
{
  const { text } = natural(String.raw`    <table><caption>\[x^2\]</caption><tr><td>1</td></tr></table>
    <table><caption>见 <a href="#x"><div>块</div></a></caption><tr><td>1</td></tr></table>
    <table><caption>选 <select><option>a</option></select></caption><tr><td>1</td></tr></table>
    <table><caption></caption><tr><td>1</td></tr></table>`);
  const main = mainOf(text);
  for (const caption of [String.raw`<caption>\[x^2\]</caption>`, "<caption>见 <a href=\"#x\"><div>块</div></a></caption>", "<caption>选 <select><option>a</option></select></caption>", "<caption></caption>"]) assert.ok(main.includes(`<table class="doc-table">${caption}<tbody>`), caption);
  assert.deepEqual(readOnlyTexts(text).map((line) => line.match(/^line \d+: <\w+>/)[0]), ["line 9: <caption>", "line 10: <caption>", "line 11: <caption>"]);
}

// A GFM task list (markdown-it's, GitHub's, marked's: every item starting with its box, an
// <input type="checkbox"> of a type, checked, disabled and GFM's class at most): the kit's to-do list,
// a checked item li[data-checked], the boxes and the one space after each gone, GFM's classes gone,
// nested ones too. One where an item has none, a box with an attribute of its own or a numbered
// list stays as written and is named read-only, with what to write.
{
  const { text, changes } = natural(`    <ul class="contains-task-list">
      <li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" disabled> 未完成</li>
      <li class="task-list-item"><input class="task-list-item-checkbox" checked="" disabled="" type="checkbox"> 已完成 <mark>重点</mark>
        <ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" disabled> 子项</li></ul>
      </li>
    </ul>
    <ul id="plan">
      <li><input type="checkbox" checked>甲</li>
      <li>
        <input type="checkbox"> 乙</li>
    </ul>
    <ul>
      <li><input type="checkbox" checked> 部分</li>
      <li>没有框</li>
    </ul>
    <ul><li><input type="checkbox" id="x"> 带 id</li></ul>
    <ol><li><input type="checkbox"> 有序</li></ol>
    <ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" disabled> 有框</li><li>没有</li></ul>
    <ul><li data-checked="false"><input type="checkbox" checked> 已有状态</li><li><input type="checkbox"> 乙</li></ul>
    <ul class="doc-todo"><li>原有</li><li class="task-list-item"><input type="checkbox" checked> 追加</li><li><input type="checkbox"> 又一</li><li data-checked><input type="checkbox"> 两个状态</li></ul>`);
  const main = mainOf(text);
  assert.ok(main.includes(`    <ul class="doc-todo">
      <li>未完成</li>
      <li data-checked>已完成 <span class="doc-highlight-yellow">重点</span>
        <ul class="doc-todo"><li>子项</li></ul>
      </li>
    </ul>
    <ul class="doc-todo" id="plan">
      <li data-checked>甲</li>
      <li>
        乙</li>
    </ul>`), main);
  assert.deepEqual(changes.filter((change) => change.rule === "task list").map((change) => change.line), [9, 12, 15, 28]);
  for (const part of ["<li><input type=\"checkbox\" checked> 部分</li>", '<li><input type="checkbox" id="x"> 带 id</li>', '<ol><li><input type="checkbox"> 有序</li></ol>', '<li data-checked="false"><input type="checkbox" checked> 已有状态</li>']) assert.ok(main.includes(part), part);
  assert.ok(main.includes('<ul class="doc-todo"><li>原有</li><li data-checked>追加</li><li>又一</li><li data-checked><input type="checkbox"> 两个状态</li></ul>'), "items written as GFM's in a to-do list of the kit's taken in (not one with a state of its own)");
  const advice = "write a to-do list as ul.doc-todo › li, li[data-checked] for a checked item (a GFM task list, every item starting with its box, is made one unless the document's own style or script uses GFM's classes or the boxes)";
  assert.deepEqual(readOnlyTexts(text), [20, 24, 25, 27, 28].map((line) => `line ${line}: <${line === 25 ? "ol" : "ul"}>: checkboxes in its items: ${advice}`), "a list of checkboxes named once");
  assert.ok(shape(text).slice(0, 6).join() === "list@main,item@list,item@list,list@main,item@list,item@list" && shape(text).includes("list@nest"), `lists of items the editor takes, the nested one held by its item: ${shape(text)}`);
  assert.equal(locked(text).length, 7, "only those left as written");
  assert.deepEqual(writingNotes(text), [`line 26: <ul class="contains-task-list"> is a whole block (整体块): the reader moves it whole and edits its words in place; right for a layout of yours that is no figure (a figure, a diagram or a timeline, goes in <figure class="doc-figure">); drop its class only if its contents were meant as ordinary blocks; for its checkboxes, ${advice}`], "a partial one with GFM's classes: a whole block, with what to write");
  assert.deepEqual(findUnits(text).units.filter((unit) => unit.kind === "item" && unit.attrs.some((entry) => entry.name === "data-checked")).length, 5, "the checked items");
}

// A flowchart (流程图) written as a list marked to be drawn as one (<ol data-doc-chart="flow">, or
// <ol data-flow> where no chart is asked of it): the kit's ol.doc-flow, its tag as written but the
// mark; one of a class of the report's own, a ul, or one a chart is asked of stays as written. Each
// step is a node: one written the short way, its own words first, has them made its first block, a
// paragraph, its title, bold (<p><strong>…</strong></p>, its inline tags taken in inside it as in any
// paragraph; a <p> alone around words all bold already), after its icon when one comes first, the
// blocks after them its content, words after a block a paragraph; the node's form noted once a
// flowchart. The editor takes a node's blocks as units of a box of its own (node), its title among
// them, no text block of the step's own; a flowchart holding something besides its steps is noted,
// and so is a step whose first block is no paragraph.
{
  const { text, changes } = natural(`    <ol data-doc-chart="flow" start="3" id="steps">
      <li>需求 <mark>评审</mark><p>收集需求</p><ul><li>产品</li><li>设计</li></ul></li>
      <li>开发</li>
    </ol>
    <ol data-flow data-direction="row"><li>甲</li><li>乙</li></ol>
    <ol data-flow class="steps"><li>丙</li></ol>
    <ul data-flow><li>丁</li></ul>
    <ol data-doc-chart="dots" data-flow><li>戊</li></ol>`);
  const main = mainOf(text);
  assert.ok(main.includes(`    <ol class="doc-flow" start="3" id="steps">
      <li><p><strong>需求 <span class="doc-highlight-yellow">评审</span></strong></p><p>收集需求</p><ul><li>产品</li><li>设计</li></ul></li>
      <li><p><strong>开发</strong></p></li>`), main);
  assert.ok(main.includes('<ol class="doc-flow" data-direction="row"><li><p><strong>甲</strong></p></li><li><p><strong>乙</strong></p></li></ol>'), main);
  for (const kept of ['<ol data-flow class="steps"><li>丙</li>', '<ul data-flow><li>丁</li>', '<ol data-doc-chart="dots" data-flow><li>戊</li>']) assert.ok(main.includes(kept), `as written: ${kept}`);
  assert.deepEqual(changes.filter((change) => change.rule === "flowchart").map((change) => change.line), [9, 13]);
  assert.deepEqual(changes.filter((change) => change.rule === "step title").map(({ line, note }) => [line, Boolean(note)]), [[10, true], [11, false], [13, true], [13, false]], "each step's title at its line, the node's form noted once a flowchart");
  const found = shape(text);
  assert.equal(found.slice(0, 7).join(), "flowchart@main,step@flowchart,paragraph@node,paragraph@node,list@node,item@list,item@list", `a step's blocks the units of its node, its title the first: ${found}`);
  assert.ok(!found.includes("paragraph@nest"), found);
  assert.deepEqual(findBlocks(text).filter((block) => block.tag === "li" && /^\s*<p>/.test(text.slice(block.innerStart, block.innerEnd))), [], "no text block of a step's own: its title is its paragraph's");
  assert.deepEqual(writingNotes(natural('    <ol data-flow><li>甲</li><p>说明</p><li>乙</li></ol>').text), ['line 9: <ol class="doc-flow"> holds a <p> outside its items: a flowchart\'s steps are its <li>s (what one holds after its words, a paragraph or a list, is that step\'s content)'], "what a flowchart holds besides its steps: noted");
  assert.deepEqual(writingNotes(text).filter((note) => note.includes("doc-flow")), [], "none for steps that hold their content");
}

// A flowchart's step in every form an Agent may write it: the node (its icon first, its title a
// paragraph, a direction and a weight of its own), as written; words already bold, a <p> alone
// around them; words after its icon, its title after the icon; words of one display formula a
// formula block (no title); words after a block a paragraph of its content (loose words); a step of
// words only; an empty step given an empty title (<li><p></p></li>: the editor writes in it); one
// holding a list alone left as it is, noted (its first block is no paragraph), as is one whose first
// block after its icon is a picture. Once is
// enough for all of them, and nothing of them is read-only.
{
  const { text, changes } = natural(String.raw`    <ol class="doc-flow" data-direction="row">
      <li data-direction="column" style="--doc-flow-ratio: .4"><div class="doc-icon">📮</div><p><strong>分派</strong></p><ul><li>一线客服</li></ul></li>
      <li><strong>已加粗</strong> <b>也加粗</b><p>说明</p></li>
      <li><div class="doc-icon" data-icon="/icons/tabler/circle-number-5_green.svg"></div>回访 \(x\)<p>说明</p></li>
      <li>\[ a^2 \]</li>
      <li><p>先有段落</p>后面的字</li>
      <li>只有字</li>
      <li></li>
      <li><ul><li>只有列表</li></ul></li>
      <li><div class="doc-icon">🎯</div><img src="a.png" alt=""></li>
    </ol>`);
  const steps = mainOf(text).split("\n").filter((line) => line.trim().startsWith("<li"));
  assert.deepEqual(steps.map((line) => line.trim()), [
    '<li data-direction="column" style="--doc-flow-ratio: .4"><div class="doc-icon">📮</div><p><strong>分派</strong></p><ul><li>一线客服</li></ul></li>',
    '<li><p><strong>已加粗</strong> <b>也加粗</b></p><p>说明</p></li>',
    '<li><div class="doc-icon" data-icon="/icons/tabler/circle-number-5_green.svg"></div><p><strong>回访 <span class="doc-math-inline">\\(x\\)</span></strong></p><p>说明</p></li>',
    '<li><div class="doc-math-block">\\[ a^2 \\]</div></li>',
    '<li><p>先有段落</p><p>后面的字</p></li>',
    '<li><p><strong>只有字</strong></p></li>',
    '<li><p></p></li>',
    '<li><ul><li>只有列表</li></ul></li>',
    '<li><div class="doc-icon">🎯</div><figure class="doc-image"><img src="a.png" alt=""><figcaption></figcaption></figure></li>',
  ]);
  assert.deepEqual([...new Set(changes.map((change) => change.rule))].sort(), ["display formula", "formula", "loose words", "picture", "step title"]);
  assert.deepEqual(writingNotes(text), [
    "line 13: a step of <ol class=\"doc-flow\"> begins with a <div>: a step's first block is its title, a paragraph (<p><strong>…</strong></p>), the blocks after it its content",
    "line 17: a step of <ol class=\"doc-flow\"> begins with a <ul>: a step's first block is its title, a paragraph (<p><strong>…</strong></p>), the blocks after it its content",
    "line 18: a step of <ol class=\"doc-flow\"> begins with a <figure>: a step's first block is its title, a paragraph (<p><strong>…</strong></p>), the blocks after it its content",
  ]);
  assert.deepEqual(locked(text), [], "nothing read-only");
  const found = shape(text);
  assert.ok(found.includes("icon@node") && found.filter((kind) => kind.endsWith("@node")).length >= 10, `icons and blocks units of the nodes: ${found}`);
  // A step of its icon alone, or of blanks: an empty title after the icon, a node.
  const bare = natural('    <ol class="doc-flow"><li><div class="doc-icon">📮</div></li><li> </li></ol>');
  assert.ok(mainOf(bare.text).includes('<li><div class="doc-icon">📮</div><p></p></li><li><p></p> </li>'), mainOf(bare.text));
  assert.deepEqual(shape(bare.text), ["flowchart@main", "step@flowchart", "icon@node", "paragraph@node", "step@flowchart", "paragraph@node"], shape(bare.text).join());
}

// A report whose own <style> styles GFM's classes, or whose own script reads checkboxes or GFM's
// classes, keeps its task lists as written (the boxes and classes are its own then): named.
{
  const list = '    <ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox" checked> 甲</li></ul>\n    <ul><li><input type="checkbox"> 乙</li></ul>';
  const kept = (text) => !text.includes("doc-todo") && text.includes('<input type="checkbox"> 乙');
  assert.ok(kept(naturalize(page(list).replace("</style>", " .task-list-item { list-style: none }</style>")).text), "styled");
  assert.ok(kept(naturalize(page(list).replace("</body>", '<script>document.querySelectorAll("input[type=checkbox]").forEach((box) => box.onchange = save);</script>\n</body>')).text), "scripted");
  assert.ok(!kept(naturalize(page(list).replace("</style>", " .task-list { margin: 0 } input { accent-color: red }</style>").replace("</body>", '<script src="app.js"></script>\n</body>')).text), "another class, an input's look, a script from a file: taken in");
}

// A callout is a box of blocks, as a highlight block is (2026-11-07): one written with its blocks stays
// as written, nothing to say. One written the old way, its words straight in it (every callout the
// editor wrote before, an Agent's), holds them as one paragraph, as does any box that always holds a
// block (`holdsOne`: a highlight block, a disclosure's content), whether it holds blocks too or not:
// its attributes on it, the paragraph its words' (the rules for words run on them), on its lines.
{
  const old = '<div class="doc-callout" data-block-id="c1">提示<strong>加粗</strong>的话</div>';
  const made = natural(`    ${old}`);
  assert.ok(made.text.includes('<div class="doc-callout" data-block-id="c1"><p>提示<strong>加粗</strong>的话</p></div>'), mainOf(made.text));
  assert.deepEqual(made.changes, [{ line: 9, rule: "loose words" }]);
  assert.deepEqual(findUnits(made.text).boxes.filter((box) => box.kind === "callout").length, 1, "a box of blocks");
  assert.deepEqual(findBlocks(made.text).filter((block) => block.kind === "flow").map((block) => block.tag), ["p"], "its paragraph a text block of the flow");
  assert.deepEqual(findBlocks(page(`    ${old}`)).filter((block) => block.kind === "callout"), [], "and no callout a text block of its own, as written either");
  assert.ok(natural('    <div class="doc-callout doc-highlight-green">有颜色</div>').text.includes('<div class="doc-callout doc-highlight-green"><p>有颜色</p></div>'), "a color stays on it");
  const own = natural('    <div class="doc-callout keep">自己的类</div>');
  assert.ok(own.text.includes('<div class="doc-callout keep">自己的类</div>') && own.changes.length === 0, "one of a class of its own left as written, as any container's of a class of its own");
  assert.deepEqual(findBlocks(own.text).map((block) => block.kind).filter((kind) => kind !== "title"), ["text"], "its words edited in place, as an element's of the report's own");

  // On lines of its own: the paragraph where the words were, the file's lines kept.
  const written = page('    <div class="doc-callout">\n      提示的话\n    </div>\n    <p>后文</p>');
  const lines = natural('    <div class="doc-callout">\n      提示的话\n    </div>\n    <p>后文</p>');
  assert.ok(lines.text.includes('    <div class="doc-callout">\n      <p>提示的话</p>\n    </div>\n    <p>后文</p>'), mainOf(lines.text));
  assert.equal(lines.text.split("\n").length, written.split("\n").length, "the file keeps its lines");

  // What the rules for words make of them is what its paragraph holds; a line break stays in it.
  const words = natural('    <div class="doc-callout">标 <mark>重点</mark> <small>小</small> <abbr title="全称">缩写</abbr> \\(x^2\\) <a href="https://example.com/">链接</a><br>次行</div>');
  assert.ok(words.text.includes('<div class="doc-callout"><p>标 <span class="doc-highlight-yellow">重点</span> <span class="doc-text-gray">小</span> 缩写 <span class="doc-math-inline">\\(x^2\\)</span> <a href="https://example.com/">链接</a><br>次行</p></div>'), mainOf(words.text));
  assert.deepEqual(readOnlyTexts(words.text), [], "and nothing read-only");
  assert.deepEqual(writingNotes(words.text), [], "nor anything to say");

  // Words beside its blocks: each run a paragraph of its own.
  assert.ok(natural('    <div class="doc-callout">先说<ul><li>项</li></ul>再说</div>').text.includes('<div class="doc-callout"><p>先说</p><ul><li>项</li></ul><p>再说</p></div>'));

  // Written with blocks, or empty: as written, nothing to say (an empty one is a line high, and a click in it makes a paragraph).
  for (const body of ['<div class="doc-callout"><p>一段</p><p>二段</p></div>', '<div class="doc-callout"><p class="lead">有类</p></div>', '<div class="doc-callout"><p>段</p><ul><li>项</li></ul><div class="doc-code"><pre><code>x</code></pre></div></div>', '<div class="doc-callout"></div>', '<div class="doc-callout"><p></p></div>']) {
    const result = natural(`    ${body}`);
    assert.ok(result.text.includes(body), `as written\n${mainOf(result.text)}`);
    assert.deepEqual(result.changes, [], body);
    assert.deepEqual(writingNotes(result.text), [], body);
  }

  // In the flows too, and in a report of the old names.
  assert.ok(natural('    <details open><summary>开</summary><div class="doc-callout">折叠里</div></details>').text.includes('<div class="doc-callout"><p>折叠里</p></div>'));
  assert.ok(natural('    <ol class="doc-flow"><li><p><strong>步</strong></p><div class="doc-callout">节点里</div></li></ol>').text.includes('<div class="doc-callout"><p>节点里</p></div>'));
  assert.ok(natural('    <div class="report-callout">旧名</div>').text.includes('<div class="doc-callout"><p>旧名</p></div>'));

  // The same rule for the other boxes that always hold a block.
  assert.ok(natural('    <div class="doc-panel">高亮的话</div>').text.includes('<div class="doc-panel"><p>高亮的话</p></div>'), "a highlight block's words");
  assert.ok(natural('    <details class="doc-details" open><summary><span class="doc-details-summary-label">题</span></summary><div class="doc-details-content">内容</div></details>').text.includes('<div class="doc-details-content"><p>内容</p></div>'), "a disclosure's content's words");

  // A paragraph left open in the file: as written, named read-only.
  const unclosed = natural('    <div class="doc-callout">没有闭合 <span>开着</div>');
  assert.ok(unclosed.text.includes('<div class="doc-callout">没有闭合 <span>开着</div>'), mainOf(unclosed.text));

  // gallery check says it as any other rule, the export having it to do.
  const line = changeLines("report.html", made.changes, { pending: true })[0];
  assert.ok(line.endsWith("loose words (line 9) not rewritten yet: the export rewrites them in this file as the kit's markup (nothing to fix); the words and numbers are unchanged"), line);
}

// Notes for the Agent (writingNotes, never failures): each whole block of the report's own once (the
// outermost: what is in one is its own; never a text block of a class of its own, an inline element,
// a table's row, or one of the kit's elements with a class of the report's own beside the kit's, nor
// one with no words and no picture: a host the report's own script draws in, a drawing), and a
// table's column widths, which the kit sets itself (a colgroup's or its cols', not one without).
{
  const { text } = natural(`    <div class="kpi"><div class="kpi-item"><p>92%</p></div></div>
    <section class="appendix"><h2>附</h2></section>
    <p class="lead">导语 <span class="mine">自己的</span></p>
    <section class="doc-section appendix"><h2>附录</h2><div class="cards"><p>卡</p></div></section>
    <figure class="doc-figure wide"><h3>图</h3><div class="legend"><span>a</span></div></figure>
    <table><colgroup><col style="width: 30%"><col></colgroup><tr><td>1</td><td>2</td></tr></table>
    <table><col width="80"><tr><td>1</td></tr></table>
    <table><colgroup span="2"></colgroup><tr><td>1</td><td>2</td></tr></table>
    <div class="doc-table-wrap"><table class="doc-table"><tbody><tr class="hi"><td><mark>行</mark></td></tr></tbody></table></div>
    <div class="chart" id="c1"></div>
    <div class="hero"><svg viewBox="0 0 1 1"></svg></div>
    <div class="banner"><img src="assets/b.png" alt=""></div>
    <div class="arch"><svg viewBox="0 0 10 10"><text>应用层</text></svg><p>三层</p></div>
    <div class="layer-stack"><p>应用层</p></div><style>.layer-stack { display: grid; }</style>`);
  const whole = (line, tag) => `line ${line}: ${tag} is a whole block (整体块): the reader moves it whole and edits its words in place; right for a layout of yours that is no figure (a figure, a diagram or a timeline, goes in <figure class="doc-figure">); drop its class only if its contents were meant as ordinary blocks`;
  const widths = (line, tag) => `line ${line}: <${tag}> widths: the kit sizes columns itself; a merged table uses yours`;
  // div.kpi is of a class the report's own <style> styles (.kpi span), div.layer-stack of one its
  // page's <style> does, div.arch holds an <svg>: a layout or a drawing of the Agent's own, which a
  // whole block is for, no note.
  assert.deepEqual(writingNotes(text), [whole(10, '<section class="appendix">'), whole(12, '<div class="cards">'), widths(14, "colgroup"), widths(15, "col"), whole(20, '<div class="banner">')]);
  assert.ok(mainOf(text).includes('<tr class="hi"><td><span class="doc-highlight-yellow">行</span></td></tr>'), "a row of a class of its own is the table's row: its words are the kit's");
  // A class the file opens with a curly quote (class=”doc-panel”: an editor keeping the file's “…”
  // style) is the cause the checks fail first (componentFailures): no note calls it a whole block.
  assert.deepEqual(writingNotes(natural('    <div class=”doc-panel”><p>要点</p></div>\n    <div class="tile" title="“引”"><p>92%</p></div>').text), [whole(10, '<div class="tile">')]);
}

// A kit's element with a class of the report's own beside the kit's (section.doc-section.appendix,
// figure.doc-figure.wide…) stays the kit's element, on both sides: naturalize walks it as it walks
// the kit's (its inside made the kit's, or left as the kit's own), the editor finds the same units in
// the same boxes, and no note calls it a whole block. A list's to-do class is a switch of the list (as
// its color is), no kit element: a list with a class of the report's own is a whole block, for both.
{
  const M = String.raw`<p><mark>记</mark> \(x\)</p>`;
  const samples = {
    section: `<section class="doc-section{X}"><h2>章</h2>${M}</section>`,
    panel: `<div class="doc-panel{X}">${M}</div>`,
    summary: `<div class="doc-summary{X}">${M}</div>`,
    columns: `<div class="doc-columns{X}"><div class="doc-column">${M}</div><div class="doc-column"><p>b</p></div></div>`,
    column: `<div class="doc-columns"><div class="doc-column{X}">${M}</div><div class="doc-column"><p>b</p></div></div>`,
    details: `<details class="doc-details{X}"><summary><span class="doc-details-summary-label">t</span></summary><div class="doc-details-content">${M}</div></details>`,
    detailsContent: `<details class="doc-details"><summary><span class="doc-details-summary-label">t</span></summary><div class="doc-details-content{X}">${M}</div></details>`,
    sheets: `<section class="doc-sheet-shell{X}" data-doc-sheets="s"><div class="doc-sheet-tabs"><button class="doc-sheet-tab" type="button" data-sheet-tab="a">A</button></div><div data-doc-sheet="a">${M}</div></section>`,
    dialog: `<dialog class="doc-dialog{X}" id="d1"><div class="doc-dialog-panel"><div class="doc-dialog-content"><h3>D</h3>${M}</div></div></dialog>`,
    callout: `<div class="doc-callout{X}">${M}</div>`,
    code: `<div class="doc-code{X}"><div class="doc-code-title"></div><pre><code>x</code></pre></div>`,
    math: String.raw`<div class="doc-math-block{X}">\[x\]</div>`,
    figure: `<figure class="doc-figure{X}"><h3>图</h3><div data-doc-chart="dots"></div></figure>`,
    image: `<figure class="doc-image{X}"><img src="assets/a.png" alt=""><figcaption>c</figcaption></figure>`,
    tableWrap: `<div class="doc-table-wrap{X}"><table class="doc-table"><tbody><tr><td><mark>记</mark></td></tr></tbody></table></div>`,
    table: `<div class="doc-table-wrap"><table class="doc-table{X}"><tbody><tr><td><mark>记</mark></td></tr></tbody></table></div>`,
    bareTable: `<table class="doc-table{X}"><tr><th>h</th></tr><tr><td><mark>记</mark></td></tr></table>`,
  };
  const units = (text) => {
    const found = findUnits(text);
    return JSON.stringify({ units: shape(text), boxes: found.boxes.map((box) => box.kind), blocks: findBlocks(text).map((block) => block.kind) });
  };
  for (const [name, markup] of Object.entries(samples)) {
    const kit = natural(`    ${markup.replace("{X}", "")}`);
    const own = natural(`    ${markup.replace("{X}", " appendix")}`);
    assert.deepEqual(own.changes, kit.changes, `${name}: naturalize walks it as the kit's`);
    assert.equal(own.text.replace(/ appendix/g, ""), kit.text, `${name}: the same markup`);
    assert.equal(units(own.text.replace(/ appendix/g, "")), units(kit.text), `${name}: the editor finds the same units`);
    assert.equal(units(page(`    ${markup.replace("{X}", " appendix")}`)).replace(/ appendix/g, ""), units(page(`    ${markup.replace("{X}", "")}`)), `${name}: as written, too`);
    assert.deepEqual([...writingNotes(own.text), ...readOnlyTexts(own.text)], [...writingNotes(kit.text), ...readOnlyTexts(kit.text)], `${name}: no note more`);
  }
  const todo = natural('    <ul class="doc-todo appendix"><li><mark>记</mark></li></ul>');
  assert.ok(todo.changes.length === 0 && shape(todo.text).join() === "list@main" && writingNotes(todo.text)[0]?.includes('<ul class="doc-todo appendix"> is a whole block'), "a list with a class of its own: a whole block for both");
}

// An Agent's report written as any page would (a bare table with its caption, an aside, a task list,
// loose words, a formula alone in a div): what it makes leaves no text read-only, and each block is
// the block it should be.
{
  const { text } = natural(String.raw`    <section>
      <h2>结果</h2>
      先看总体。
      <table><caption>单位：人</caption><tr><th>组</th><th>人数</th></tr><tr><td>甲</td><td>12</td></tr></table>
      <aside>注意 <mark>样本</mark>偏小。</aside>
      <ul><li><input type="checkbox" checked> 收集</li><li><input type="checkbox"> 分析</li></ul>
      <div>\[ n = 12 \]</div>
      结论在下一节。
    </section>`);
  assert.deepEqual(locked(text), [], locked(text).join("\n"));
  assert.deepEqual(readOnlyTexts(text), []);
  assert.deepEqual(shape(text), ["section@main", "heading@section", "paragraph@section", "paragraph@section", "table@section", "highlight@section", "paragraph@highlight", "list@section", "item@list", "item@list", "math@section", "paragraph@section"]);
}

// A table written with data-doc-chart (src/shared/table-chart.mjs): two blocks, the table as the
// table rule makes it (its id and other attributes kept, data-doc-chart taken off), then right after
// it the chart's card (its caption the card's title), its host holding no JSON (its data are the
// table's rows), linked by a key no other table or chart of the report has (the first of t1, t2 …
// not taken: t2 is). A table of the kit's written so gets the same card, its wrapper the key.
// data-doc-chart-options is read nowhere: on a table it stays as written (the checks fail it as an
// attribute of no component). No line added; once is enough; the editor takes a card and a table
// each, nothing read-only.
{
  const { text, changes } = natural(`    <table data-doc-chart="dots"><caption>各组人数</caption><tr><th>组</th><th>人数</th></tr><tr><td>甲</td><td>12</td></tr></table>
    <table data-doc-chart="trend" data-doc-chart-options='{"valueSuffix":" 人"}' data-block-id="aaaaaaaa" id="growth"><thead><tr><th>月</th><th>人数</th></tr></thead><tbody><tr><td>1月</td><td>3</td></tr></tbody></table>
    <div class="doc-table-wrap" data-doc-chart-source="t2"><table class="doc-table"><tbody><tr><td>a</td><td>1</td></tr></tbody></table></div>
    <div class="doc-table-wrap"><table class="doc-table" data-doc-chart="strip"><tbody><tr><td>a</td><td>1</td></tr></tbody></table></div>`);
  const main = mainOf(text);
  const head = (cells) => `<thead><tr>${cells.map((cell) => `<th class="doc-bold doc-highlight-gray">${cell}</th>`).join("")}</tr></thead>`;
  assert.ok(main.includes(`<div class="doc-table-wrap" data-doc-chart-source="t1"><table class="doc-table">${head(["组", "人数"])}<tbody><tr><td>甲</td><td>12</td></tr></tbody></table></div><figure class="doc-figure"><h3>各组人数</h3><div data-doc-chart="dots" data-doc-chart-data="t1"></div></figure>`), `the table, then the card, its caption its title, its host empty:\n${main}`);
  assert.ok(main.includes(`<div class="doc-table-wrap" data-block-id="aaaaaaaa" data-doc-chart-source="t3"><table class="doc-table" data-doc-chart-options='{"valueSuffix":" 人"}' id="growth">${head(["月", "人数"])}`), `the next key not taken, its id kept, data-doc-chart-options left as written:\n${main}`);
  assert.ok(main.includes('</tbody></table></div><figure class="doc-figure"><div data-doc-chart="trend" data-doc-chart-data="t3"></div></figure>'), main);
  assert.ok(main.includes('<div class="doc-table-wrap" data-doc-chart-source="t4"><table class="doc-table"><tbody><tr><td>a</td><td>1</td></tr></tbody></table></div><figure class="doc-figure"><div data-doc-chart="strip" data-doc-chart-data="t4"></div></figure>'), `a table of the kit's: its wrapper takes the key, the card after it:\n${main}`);
  assert.ok(!main.includes("application/json"), "no JSON in a host drawn from a table");
  assert.equal(text.split("\n").length, page("").split("\n").length + 3, "no line added");
  assert.deepEqual(changes.filter((change) => change.rule === "chart").map((change) => change.line), [9, 10, 12]);
  assert.ok(!changes.some((change) => change.rule === "chart options"), "no rule of options");
  assert.deepEqual(shape(text).filter((kind) => !kind.startsWith("paragraph")), ["table@main", "figure@main", "table@main", "figure@main", "table@main", "table@main", "figure@main"]);
  assert.deepEqual([locked(text), readOnlyTexts(text)], [[], []]);
  assert.equal(naturalize(text).changes.length, 0, "once is enough");
  // Without a caption: a card with no title.
  assert.ok(mainOf(natural('    <table data-doc-chart="dots"><tr><th>a</th><th>b</th></tr><tr><td>x</td><td>1</td></tr></table>').text).includes('</table></div><figure class="doc-figure"><div data-doc-chart="dots" data-doc-chart-data="t1"></div></figure>'));
  // A disclosure's block, with a caption or none: the card in its content, after the table's frame.
  for (const caption of ["", "<caption>题</caption>"]) {
    const inside = mainOf(natural(`    <details><summary>s</summary><table data-doc-chart="dots">${caption}<tr><th>组</th><th>值</th></tr><tr><td>甲</td><td>1</td></tr></table>\n    </details>`).text);
    assert.ok(inside.includes(`<tbody><tr><td>甲</td><td>1</td></tr></tbody></table></div><figure class="doc-figure">${caption ? "<h3>题</h3>" : ""}<div data-doc-chart="dots" data-doc-chart-data="t1"></div></figure>`), inside);
    assert.ok(inside.includes('<div class="doc-details-content"><div class="doc-table-wrap" data-doc-chart-source="t1">'), inside);
  }
  // In a <figure>, where no card stands: the table left as written, the figure a card (the checks say
  // how to write it: tests/unit/table-charts.mjs).
  const figured = '<table data-doc-chart="dots"><tr><th>组</th><th>值</th></tr><tr><td>甲</td><td>1</td></tr></table><figcaption>图注</figcaption></figure>';
  assert.ok(mainOf(natural(`    <figure>${figured}`).text).includes(`<figure class="doc-figure">${figured}`));
  // A key written on a plain table (a card declared before it draws it, folded in a disclosure): its
  // frame's, as the kit reads it there.
  const folded = mainOf(natural('    <figure class="doc-figure"><h3>人数</h3><div data-doc-chart="dots" data-doc-chart-data="scores"></div></figure>\n    <details><summary>数据</summary><table data-doc-chart-source="scores"><tr><th>组</th><th>值</th></tr><tr><td>甲</td><td>1</td></tr></table></details>').text);
  assert.ok(folded.includes('<div class="doc-details-content"><div class="doc-table-wrap" data-doc-chart-source="scores"><table class="doc-table"><thead>'), folded);
  // data-doc-chart-options on a card's host: left as written, as on a table.
  const host = '    <figure class="doc-figure"><h3>得分</h3><div data-doc-chart="dots" data-doc-chart-options=\'{"horizontal": true}\'><script type="application/json">[]</script></div></figure>';
  assert.deepEqual(natural(host).changes, [], "nothing moved");
}

// Every figure is a card (decided 2026-10-27): a <figure> that is no picture's, no media card and
// no code figure gets the kit's class, its own kept. A bare one has its inside taken in as anywhere
// (its table the kit's); one with classes of its own is the report's drawing, its inside as written
// (no paragraph made of its words, no table wrapped), as a whole block's was. No whole-block note
// for it: a figure is no whole block.
{
  const body = `    <figure><h3>图</h3><table><tr><th>a</th></tr><tr><td>1</td></tr></table></figure>
    <figure class="timeline"><div class="step">第 1 周 <b>开始</b></div><table><tr><td>x</td></tr></table></figure>
    <figure class="doc-figure layers"><div class="layer"><p>层</p></div></figure>
    <figure class="doc-text-blue"><div class="box"><p>框</p></div></figure>`;
  const { text, changes } = natural(body);
  const main = mainOf(text);
  assert.ok(main.includes('<figure class="doc-figure"><h3>图</h3><div class="doc-table-wrap"><table class="doc-table"><thead>'), `a bare figure a card, its table the kit's:\n${main}`);
  assert.ok(main.includes('<figure class="timeline doc-figure"><div class="step">第 1 周 <b>开始</b></div><table><tr><td>x</td></tr></table></figure>'), `a figure of a class of its own a card, its inside as written:\n${main}`);
  assert.ok(main.includes('<figure class="doc-figure layers"><div class="layer"><p>层</p></div></figure>'), "a card already: untouched");
  assert.ok(main.includes('<figure class="doc-text-blue doc-figure"><div class="box"><p>框</p></div></figure>'), `a block color is no class of the document's own:\n${main}`);
  assert.deepEqual(changes.filter((change) => change.rule === "figure").map((change) => change.line), [9, 10, 12]);
  assert.deepEqual(shape(text).filter((kind) => !kind.startsWith("paragraph")), ["figure@main", "figure@main", "figure@main", "figure@main"]);
  assert.deepEqual(writingNotes(text), [], "no figure is a whole block");
  // A bare figure of a drawing and its <figcaption>: a card, the caption where it was (the kit
  // reads a card's figcaption as its caption, figure.css), its words a field of the card.
  const captioned = natural('    <figure><svg viewBox="0 0 10 10"><rect width="4" height="4"/></svg><figcaption>图 1：一个框</figcaption></figure>');
  assert.ok(mainOf(captioned.text).includes('<figure class="doc-figure"><svg viewBox="0 0 10 10"><rect width="4" height="4"/></svg><figcaption>图 1：一个框</figcaption></figure>'), mainOf(captioned.text));
  assert.deepEqual(shape(captioned.text).filter((kind) => !kind.startsWith("paragraph")), ["figure@main"]);
  assert.deepEqual(writingNotes(captioned.text), []);
  // Only a figure standing where a block does (a flow, no figure around it) is a card: a bare one in a
  // bare card's drawing (straight in it or deeper), in a card of the kit's, in a whole block or in a
  // cell is part of what it stands in, as written, its inside too (its table no kit table); one in a
  // list item, a column or a disclosure is a card.
  const nested = natural(`    <figure><h3>图</h3><div class="parts"><figure><svg viewBox="0 0 4 4"></svg><figcaption>部分</figcaption></figure></div><div><figure><table><tr><td>1</td></tr></table></figure></div><figure>直接</figure></figure>
    <figure class="doc-figure"><h3>卡</h3><figure>里面</figure></figure>
    <div class="strip"><figure><svg viewBox="0 0 4 4"></svg></figure></div>
    <table><tr><td><figure><svg viewBox="0 0 4 4"></svg></figure></td></tr></table>
    <ul><li>项<figure><svg viewBox="0 0 4 4"></svg></figure></li></ul>
    <div class="doc-columns"><div class="doc-column"><figure><svg viewBox="0 0 4 4"></svg></figure></div><div class="doc-column"><p>b</p></div></div>
    <details><summary>开</summary><figure><svg viewBox="0 0 4 4"></svg></figure></details>`);
  const inside = mainOf(nested.text);
  assert.ok(inside.includes('<figure class="doc-figure"><h3>图</h3><div class="parts"><figure><svg viewBox="0 0 4 4"></svg><figcaption>部分</figcaption></figure></div><div><figure><table><tr><td>1</td></tr></table></figure></div><figure>直接</figure></figure>'), `a figure in a card's drawing as written:\n${inside}`);
  for (const kept of ['<figure class="doc-figure"><h3>卡</h3><figure>里面</figure></figure>', '<div class="strip"><figure><svg viewBox="0 0 4 4"></svg></figure></div>', '<td><figure><svg viewBox="0 0 4 4"></svg></figure></td>']) assert.ok(inside.includes(kept), `as written: ${kept}`);
  assert.ok(inside.includes('<li>项<figure class="doc-figure"><svg') && inside.includes('<div class="doc-column"><figure class="doc-figure"><svg') && inside.includes('<div class="doc-details-content"><figure class="doc-figure"><svg'), `a figure in an item, a column, a disclosure a card:\n${inside}`);
  assert.deepEqual(nested.changes.filter((change) => change.rule === "figure").map((change) => change.line), [9, 13, 14, 15]);
  // A card's frame switch, doc-figure--plain (显示边框 off in its block menu), is the kit's class: an Agent's
  // card written with it stays as written, and one with no other class of the kit's is a card, the switch kept.
  const framed = natural(`    <figure class="doc-figure doc-figure--compact doc-figure--plain"><h3>图</h3><div class="x">画</div></figure>
    <figure class="timeline doc-figure--plain"><div class="step">一</div></figure>`);
  assert.ok(mainOf(framed.text).includes('<figure class="doc-figure doc-figure--compact doc-figure--plain"><h3>图</h3><div class="x">画</div></figure>'), `a card with the switch: untouched:\n${mainOf(framed.text)}`);
  assert.ok(mainOf(framed.text).includes('<figure class="timeline doc-figure--plain doc-figure"><div class="step">一</div></figure>'), `a figure with the switch a card, the switch kept:\n${mainOf(framed.text)}`);
  assert.deepEqual(writingNotes(framed.text), [], "the switch is no class of the document's own");
  // A whole block's note says where a figure goes.
  assert.deepEqual(writingNotes(page('    <div class="group"><p>a</p></div>')), ['line 9: <div class="group"> is a whole block (整体块): the reader moves it whole and edits its words in place; right for a layout of yours that is no figure (a figure, a diagram or a timeline, goes in <figure class="doc-figure">); drop its class only if its contents were meant as ordinary blocks']);
}

// A line or paragraph separator in the page's text (found testing the skill with Agents, 2026-10-26: a Write tool decoded
// an escape into one, and a code block showed empty): a note at its line, in code and a whole block
// too, not in a script.
{
  const [line, paragraph] = [String.fromCharCode(0x2028), String.fromCharCode(0x2029)];
  const text = page(`    <p>甲</p>\n    <pre><code>a${line}b</code></pre>\n    <div class="tiles"><p>乙${paragraph}丙</p></div>\n    <p>丁&#x2028;</p>\n    <script>const s = "${line}";</script>`);
  const said = (at, name) => `line ${at}: a ${name} in the text: the page shows it as a break or an empty line, not as a character (a tool that decodes ${"\\"}u2028 or ${"\\"}u2029 escapes writes one); write the break the text means (<br>, a new paragraph, a new line in code) or take it out`;
  const notes = writingNotes(text).filter((note) => note.includes("separator"));
  assert.deepEqual(notes, [said(10, "line separator (U+2028)"), said(11, "paragraph separator (U+2029)"), said(12, "line separator (U+2028)")]);
  assert.deepEqual(writingNotes(page("    <p>甲</p>")), []);
}

// A chart added to a table when revising (data-doc-chart on a table of the kit's, its caption
// written in it, its line of small text right above it): the caption's words the card's title, made
// the kit's as a paragraph's are, the caption gone from the table (its line with it, the card taking
// a line of its own: no line added or lost), the card right after the table; the line of small text
// above the table stays where it is and titles nothing (a bare table's card has no title then). The
// chart's change is at the card's line. Each is a card and a table to the editor, nothing read-only.
{
  const { text, changes } = natural(String.raw`    <p data-block-id="aaaaaaaa">正文。</p>
    <p class="doc-note" data-block-id="bbbbbbbb">351 条记录 · 单位：条</p>
    <div class="doc-table-wrap" data-block-id="cccccccc"><table class="doc-table" data-doc-chart="dots">
      <caption>各年号<mark>记录数</mark> \(n\)</caption>
      <thead><tr><th>年号</th><th data-sort-type="text">公历</th><th>记录数</th></tr></thead>
      <tbody><tr><td>文禄</td><td>1592—1596</td><td>6</td></tr></tbody>
    </table></div>
    <p class="doc-note">各组<mark>人数</mark> <span class="doc-tab">单位：人</span></p>
    <table data-doc-chart="dots"><tr><th>组</th><th>人数</th></tr><tr><td>甲</td><td>12</td></tr></table>`);
  const main = mainOf(text);
  assert.ok(main.includes(String.raw`    <p class="doc-note" data-block-id="bbbbbbbb">351 条记录 · 单位：条</p>
    <div class="doc-table-wrap" data-block-id="cccccccc" data-doc-chart-source="t1"><table class="doc-table">
      <thead>`), `the note kept above its table, the caption gone with its line:\n${main}`);
  assert.ok(main.includes(String.raw`    </table></div>
    <figure class="doc-figure"><h3>各年号<span class="doc-highlight-yellow">记录数</span> <span class="doc-math-inline">\(n\)</span></h3><div data-doc-chart="dots" data-doc-chart-data="t1"></div></figure>`), `the card after the table, on the caption's line, its title the caption's words:\n${main}`);
  assert.ok(main.includes(`<p class="doc-note">各组<span class="doc-highlight-yellow">人数</span> <span class="doc-tab">单位：人</span></p>
    <div class="doc-table-wrap" data-doc-chart-source="t2"><table class="doc-table">`), `a bare table's note stays above it:\n${main}`);
  assert.ok(main.includes('</tbody></table></div><figure class="doc-figure"><div data-doc-chart="dots" data-doc-chart-data="t2"></div></figure>'), `and titles nothing:\n${main}`);
  assert.equal(naturalize(text).changes.length, 0, "once is enough");
  assert.equal(text.split("\n").length, page("").split("\n").length + 8, "no line added or lost");
  assert.deepEqual(changes.filter((change) => change.rule === "chart").map((change) => change.line), [15, 17], "at the cards' lines");
  assert.deepEqual(shape(text).filter((kind) => !kind.startsWith("paragraph")), ["table@main", "figure@main", "table@main", "figure@main"]);
  assert.deepEqual([locked(text), readOnlyTexts(text)], [[], []]);
  // Inside a disclosure's content that ends with the table: the card inside it, after the table.
  const inside = mainOf(natural(`    <details><summary>s</summary><table data-doc-chart="dots"><caption>题</caption><tr><th>组</th><th>值</th></tr><tr><td>甲</td><td>1</td></tr></table></details>`).text);
  assert.ok(inside.includes(`<tbody><tr><td>甲</td><td>1</td></tr></tbody></table></div><figure class="doc-figure"><h3>题</h3><div data-doc-chart="dots" data-doc-chart-data="t1"></div></figure></div></details>`), inside);
}

// A caption on a line of its own at the line's start (no blanks before it): its line goes with it
// all the same and the card takes a line of its own after the table (a bare one or one of the
// kit's): no line added or lost, the chart's change at the card's line.
{
  const cardLine = (text) => text.split("\n").findIndex((line) => line.includes('<figure class="doc-figure">')) + 1;
  for (const [what, body, shape] of [
    ["bare", `<table data-doc-chart="dots">
<caption>题</caption>
<tr><th>组</th><th>值</th></tr>
<tr><td>a</td><td>1</td></tr>
</table>
<p>后文</p>`, /<div class="doc-table-wrap" data-doc-chart-source="t1"><table class="doc-table">\n<thead>[\s\S]*<\/table><\/div>\n<figure class="doc-figure"><h3>题<\/h3><div [^\n]*<\/figure>\n<p>后文<\/p>/],
    ["the kit's", `<div class="doc-table-wrap"><table class="doc-table" data-doc-chart="dots">
<caption>题</caption>
<thead><tr><th>组</th><th>值</th></tr></thead>
<tbody><tr><td>a</td><td>1</td></tr></tbody>
</table></div>
<p>后文</p>`, /<\/table><\/div>\n<figure class="doc-figure"><h3>题<\/h3><div [^\n]*<\/figure>\n<p>后文<\/p>/],
  ]) {
    const { text, changes } = natural(body);
    assert.match(text, shape, `${what}: the card on a line of its own\n${mainOf(text)}`);
    assert.equal(text.split("\n").length, page(body).split("\n").length, `${what}: no line added or lost`);
    assert.deepEqual(changes.filter((change) => change.rule === "chart").map((change) => change.line), [cardLine(text)], `${what}: at the card's line`);
  }
}

// A bare table's last row that is a total (合计, Total) stays in its body, as written: the kit's table
// script and the page's table tools read a table's head and body (one with a <tfoot> is not a table
// the page's table tools are for: source/table.mjs plainTable), and a chart drawn from the table
// reads it as a row like the others (src/shared/table-chart.mjs tableRows).
{
  const { text, changes } = natural(`    <table><tr><th>组</th><th>值</th></tr><tr><td>甲</td><td>1</td></tr><tr><td>乙</td><td>2</td></tr><tr><td>合计</td><td>3</td></tr></table>
    <table data-doc-chart="dots"><tbody><tr><th>组</th><th>值</th></tr><tr><td>a</td><td>1</td></tr><tr><td>Total</td><td>1</td></tr></tbody></table>`);
  const main = mainOf(text);
  assert.ok(main.includes("<tbody><tr><td>甲</td><td>1</td></tr><tr><td>乙</td><td>2</td></tr><tr><td>合计</td><td>3</td></tr></tbody></table></div>"), main);
  assert.ok(main.includes("<tbody><tr><td>a</td><td>1</td></tr><tr><td>Total</td><td>1</td></tr></tbody></table></div>"), main);
  assert.ok(!main.includes("<tfoot>") && !changes.some((change) => change.rule === "total row"), main);
  assert.deepEqual(grids(text), [true, true], "both have the page's table tools");
  assert.deepEqual([locked(text), readOnlyTexts(text)], [[], []]);
}

// The fixtures stay as they are: the sample report (the browser tests') and the Component Catalog, an ordinary
// document the preview naturalizes as any other, have nothing natural: shown, each is its file.
{
  const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");
  for (const file of ["tests/browser/fixtures/sample/doc.html", "tests/fixtures/component-catalog/doc.html"]) assert.deepEqual(naturalize(read(file)).changes, [], `${file}: nothing natural`);
  const sample = read("tests/browser/fixtures/sample/doc.html");
  assert.equal(shownSource(sample).text, sample);
  // The Component Catalog is the user's, written in the kit's old names: shown, it is its file with them new, nothing else.
  const gallery = read("tests/fixtures/component-catalog/doc.html");
  assert.equal(JSON.parse(read("tests/fixtures/component-catalog/doc.json")).template, undefined, "the Component Catalog is no template");
  assert.equal(shownSource(gallery).text, newNames(gallery));
}

// A report's name and icon kept in step at its hand-in (inStep, in handedInSource): its <title> takes
// the h1's words when it does not hold them (report.json's title replaced where it holds it once, as
// the editor's renaming does, else the whole of it; the old title holding the new one's words is not
// holding them), report.json's title and icon are to be the page's (its header's own: not a panel's;
// a header with none leaves report.json's, and says so; an icon element of no valid value left to
// the check).
{
  const titled = (title, h1, icon = "") => `<!doctype html>\n<html lang="zh-CN">\n<head><title>${title}</title></head>\n<body>\n  <main class="doc-page" data-doc-id="t">\n    <header class="doc-header">${icon}<h1 class="doc-title">${h1}</h1></header>\n    <p>x</p>\n  </main>\n</body>\n</html>\n`;
  const titleOf = (text) => text.match(/<title>([^<]*)<\/title>/)[1];
  let step = inStep(titled("旧标题 — 周报", "新标题"), { title: "旧标题" });
  assert.ok(titleOf(step.text) === "新标题 — 周报" && JSON.stringify(step.title) === JSON.stringify({ from: "旧标题", to: "新标题", page: true }), JSON.stringify(step));
  step = inStep(titled("周报", "新标题"), { title: "旧标题" });
  assert.equal(titleOf(step.text), "新标题", "none of it held: the whole of it");
  step = inStep(titled("新标题 — 周报", "新标题"), { title: "旧标题" });
  assert.ok(titleOf(step.text) === "新标题 — 周报" && step.title.page === false && step.title.to === "新标题", "<title> holds it: report.json alone");
  assert.deepEqual(inStep(titled("新标题", "新标题"), { title: "新标题" }), { text: titled("新标题", "新标题"), title: null, icon: null }, "in step: nothing");
  step = inStep(titled("t", "A &amp; <em>B</em>"), { title: "t" });
  assert.ok(titleOf(step.text) === "A &amp; B" && step.title.to === "A & B", "the h1's words, escaped");
  for (const [title, h1, was, after] of [
    ["销售报告（草稿）", "销售报告", "销售报告（草稿）", "销售报告"],
    ["销售报告（草稿） — Studio", "销售报告", "销售报告（草稿）", "销售报告 — Studio"],
    ["Report v2", "Report", "Report v2", "Report"],
    ["Report v2", "Report v2", "Report", "Report v2"],
    ["销售报告 (2026)", "销售报告", "销售报告（草稿）", "销售报告 (2026)"],
  ]) {
    step = inStep(titled(title, h1), { title: was });
    assert.ok(titleOf(step.text) === after && step.title.to === h1 && step.title.page === (after !== title), `${title} (${was} → ${h1}): ${titleOf(step.text)}`);
  }
  const icon = '<div class="doc-icon">🎯</div>';
  assert.deepEqual(inStep(titled("t", "t", icon), { title: "t" }).icon, { from: null, to: "🎯" });
  assert.equal(inStep(titled("t", "t", icon), { title: "t", icon: "🎯" }).icon, null);
  assert.deepEqual(inStep(titled("t", "t"), { title: "t", icon: "🎯" }).icon, { from: "🎯", to: "🎯", missing: true }, "no icon on the page: report.json's left, and said");
  assert.equal(inStep(titled("t", "t"), { title: "t" }).icon, null, "none on either: nothing");
  assert.deepEqual(inStep(titled("t", "t", '<div class="doc-panel"><div class="doc-icon">💡</div><p>a</p></div>'), { title: "t", icon: "🎯" }).icon, { from: "🎯", to: "🎯", missing: true }, "a panel's icon is not the page's");
  assert.equal(inStep(titled("t", "t", '<div class="doc-icon"></div>'), { title: "t", icon: "🎯" }).icon, null, "one of no valid value: the check's");
  assert.equal(inStep(titled("t", "t", icon), null).icon, null, "no report.json: nothing to keep in step");
  const handed = handedInSource(titled("旧", "新"), { metadata: { title: "旧" } });
  assert.ok(titleOf(handed.text) === "新" && handed.title.page && handed.added > 0, "the hand-in writes it with the ids");
  assert.deepEqual(handedInSource(handed.text, { metadata: { title: "新" } }), { text: handed.text, changes: [], added: 0, given: [], repeated: [], title: null, icon: null }, "a second hand-in changes nothing");
}

// The hand-in (the edit service's) writes report.json's title and icon as the page has them, and the
// export says what it wrote of them (inStepLines); a second hand-in writes nothing.
{
  const root = await fsp.mkdtemp(path.join(os.tmpdir(), "report-in-step-"));
  const directory = path.join(root, "demo");
  await fsp.mkdir(directory);
  const html = `<!doctype html>\n<html lang="zh-CN">\n<head><title>旧标题</title></head>\n<body>\n  <main class="doc-page" data-doc-id="demo">\n    <header class="doc-header"><div class="doc-icon">🎯</div><h1 class="doc-title">新标题</h1></header>\n    <p>x</p>\n  </main>\n</body>\n</html>\n`;
  await fsp.writeFile(path.join(directory, "report.html"), html);
  await fsp.writeFile(path.join(directory, "report.json"), `{\n  "title": "旧标题",\n  "description": "d"\n}\n`);
  try {
    const service = createEditService({ reportsDirectory: root });
    const result = await service.handIn("demo");
    assert.ok(result.ok && result.written && result.title?.page && result.icon?.to === "🎯", JSON.stringify(result));
    assert.ok((await fsp.readFile(path.join(directory, "report.html"), "utf8")).includes("<title>新标题</title>"));
    assert.deepEqual(JSON.parse(await fsp.readFile(path.join(directory, "report.json"), "utf8")), { title: "新标题", description: "d", icon: "🎯" });
    const again = await service.handIn("demo");
    assert.ok(again.ok && !again.written && again.title === null && again.icon === null, JSON.stringify(again));
    const where = path.resolve(directory); // as the system writes it
    assert.deepEqual(inStepLines(path.join(directory, "report.html"), result), [
      `title ${where}: <title> and report.json's title written as its h1 says it: "新标题"`,
      `icon ${where}: report.json's icon written as its header has it: "🎯"`,
    ]);
    // gallery check, which writes nothing: what the export will write.
    assert.deepEqual(inStepLines(path.join(directory, "report.html"), { title: { from: "新标题", to: "新标题", page: true }, icon: { from: "🎯", to: null } }, { pending: true }), [
      `title ${where}: <title> not as its h1 says it yet ("新标题"): the export writes it`,
      `icon ${where}: report.json's icon not as its header has it yet (none): the export writes it`,
    ]);
    // The Agent's page with no icon in its header: report.json's stays, and the export says so.
    await fsp.writeFile(path.join(directory, "report.html"), html.replace('<div class="doc-icon">🎯</div>', "").replace("<title>旧标题", "<title>新标题"));
    const missing = await service.handIn("demo");
    assert.ok(missing.ok && missing.icon?.missing, JSON.stringify(missing));
    assert.equal(JSON.parse(await fsp.readFile(path.join(directory, "report.json"), "utf8")).icon, "🎯", "report.json's icon left as it is");
    const said = [`icon ${where}: report.json has the icon "🎯" and the page's header none: write it there (<div class="doc-icon">…</div> before the h1) or take "icon" out of report.json (the export leaves report.json's as it is)`];
    assert.deepEqual(inStepLines(path.join(directory, "report.html"), missing), said);
    assert.deepEqual(inStepLines(path.join(directory, "report.html"), missing, { pending: true }), said);
  } finally {
    await fsp.rm(root, { recursive: true, force: true });
  }
}

// A list item of no text over the blocks it holds, as an Agent writes one (a paragraph under it, an
// instance of a package, a list): left as written and noted nowhere, each such item a text block of
// the page holding its blocks, none read-only.
{
  const body = `    <ul>
      <li>
        <p>项下的段落</p>
      </li>
      <li><div class="board" data-doc-component="local/board"><h3>任务看板</h3><table><tr><td>甲</td></tr></table></div></li>
      <li><ul><li>子项</li></ul></li>
    </ul>`;
  const { text, changes } = natural(body);
  assert.deepEqual(changes, [], "left as written");
  assert.ok(mainOf(text).includes(body.trim()), mainOf(text));
  assert.deepEqual(writingNotes(page(body)), [], "and noted nowhere");
  const { blocks, locks } = scan(text);
  assert.deepEqual(blocks.filter((block) => block.tag === "li").map((block) => Boolean(block.nested)), [true, true, true, false], "each a text block holding its blocks");
  assert.deepEqual(locks, [], "none read-only");
}

// A paragraph's or a heading's text-align in its style (center, right) the kit's class (the page editor's
// 对齐与缩进), that declaration off the style, the rest as written; left, justify, h5 and a cell stay.
{
  const body = String.raw`    <p style="text-align:center">居中</p>
    <h2 style="text-align: right;">靠右</h2>
    <p class="lead" style="color: #333; text-align: CENTER !important; margin: 0">带别的</p>
    <p class="doc-align-right" style="text-align:center">冲突</p>
    <p class="doc-text-blue doc-indent-1" style="text-align:right">已有类</p>
    <p style="text-align:left">居左不动</p>
    <p style="text-align: justify">两端不动</p>
    <h5 style="text-align:center">五级不动</h5>
    <p style="text-align:center; text-align:left">后者生效</p>`;
  const { text, changes } = natural(body);
  const main = mainOf(text);
  assert.match(main, /<p class="doc-align-center">居中<\/p>/, "style=text-align:center alone: its attribute becomes the class");
  assert.match(main, /<h2 class="doc-align-right">靠右<\/h2>/, "a heading: right");
  assert.match(main, /<p class="lead doc-align-center" style="color: #333; margin: 0">带别的<\/p>/, "its class kept first, the other declarations as written, !important and case read");
  assert.match(main, /<p class="doc-align-center">冲突<\/p>/, "the style wins over an alignment class, as in CSS");
  assert.match(main, /<p class="doc-text-blue doc-indent-1 doc-align-right">已有类<\/p>/, "the kit's classes kept");
  assert.match(main, /<p style="text-align:left">居左不动<\/p>/, "left stays as written");
  assert.match(main, /<p style="text-align: justify">两端不动<\/p>/, "justify stays");
  assert.match(main, /<h5 style="text-align:center">五级不动<\/h5>/, "an h5 stays (the kit aligns h1 to h4)");
  assert.match(main, /<p style="text-align:center; text-align:left">后者生效<\/p>/, "the last declaration wins: left, stays");
  assert.deepEqual(changes.map((change) => change.rule), ["alignment", "alignment", "alignment", "alignment", "alignment"], "five rewritten");
  assert.ok(changeLines("doc.html", changes).join("\n").includes("alignment (lines"), "said as a rule");
  assert.deepEqual(readOnlyTexts(text), [], "none of them read-only");
}

console.log("Checked natural HTML: bare formulas (inline in the kit's span, a paragraph of one display formula a formula block), disclosures, code blocks, tables and pictures made the kit's (a picture's width its figure's span), inline tags made the kit's colors and formats or their words, and nothing changed inside code, scripts, a chart's host, the kit's parts or a whole block of the document's own; what it makes leaves no text read-only; what stays read-only after it, each with its line and why (not a whole block's inside); nothing lost silently: a span with a style the kit has no format for (a hidden or transparent text among them) stays as written and is named, a pre is a code block keeping its id on the block and what else it carries on its pre and code, noted (a figure of a pre and its caption one titled by the caption's words on one line, a pre's data-title too, and its first line's number, its line numbers and its folds on the block, every other one left out and noted, a figure left saying why), a table its id on its wrapper, a color written as the nearest kit color and a dropped title or date are noted, a note a thing, as printed; every change at a line, and once is enough for every input; a report as its pages see it (in memory) and as an export hands it in (every block an id, once; repeated ids left as they are); what the kit takes in: a bare table its header look, thead and tbody (not a table of the kit's), its caption of words a line of small text above it, an aside a highlight panel (not when the report styles asides), a fill written on a disclosure, an aside or a pre the block's it becomes, a dialog of an id and nothing else with a plain h2 first a detail card and a plain link to it its trigger, loose words paragraphs (a formula alone a formula block, a class-less div of one too), a GFM task list a to-do list, a list marked as a flowchart the kit's flowchart (what it holds besides its steps noted), a step written the short way a node (its own words its title, a bold first paragraph, after its icon; noted once a flowchart; a step beginning with no paragraph noted), a table written with data-doc-chart a chart card right after it (its caption the card's title, taken out of a table of the kit's too, its host holding no JSON, data-doc-chart-options left as written) linked by a key of their own (a caption at a line's start), a bare table's total row left in its body, each the block the editor takes it for, with nothing read-only; a line or paragraph separator in the text noted; what it leaves named (a caption, a partial task list, loose words it cannot wrap); every other figure standing where a block does a card (the kit's class added, a bare one's inside taken in, one of classes of its own as written, never a whole block; one in a card's drawing or a cell as written); Sheet tabs written the short way the kit's (each section a tab, the heading it starts with its name, its key ASCII, a name made for an area of none, the file's lines kept) and a bookmark written the short way the kit's card (its words its title, its title attribute its description), what is in neither form failed by the checks saying what to write; a whole block noted once, column widths noted; a kit element with a class of its own the kit's on both sides; the fixtures untouched; the title and icon kept in step at the hand-in (<title>, report.json); a paragraph's or a heading's text-align (center, right) in its style the kit's class, the other declarations as written (left, justify and an h5 left alone); a list item of no text over the blocks it holds left as written, an editable block holding them.");
