import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { naturalInMemory } from "../../src/cli/natural.mjs";
import { BLOCK_TYPES } from "../../src/editor/components/registry.mjs";
import { fromMarkdown, readMarkdownDocument } from "../../src/editor/page/clipboard/import/markdown.mjs";
import { checkReports } from "../../src/render/pipeline.mjs";
import { createReportFromStarter, loadReports } from "../../src/render/reports.mjs";
import { fillReport, importFiles, importMarkdown } from "../../src/transfer/import.mjs";
import { createZip } from "../../src/transfer/zip.mjs";

// A Markdown document made a report (gallery import, the workbench's 导入: src/transfer/
// import.mjs, its reader clipboard/import/markdown.mjs readMarkdownDocument), each construct as the
// report has it: formulas ($…$, $$…$$, \(…\), \[…\]; prices stay words; a display one closed before
// an empty line, one that is not said; one KaTeX cannot draw said), GFM tables (the alignment row,
// code and formulas in cells, escaped pipes), task lists, footnotes (a superscript link, a section
// of notes at the end), strike-through, autolinks (e-mail addresses too), fenced code with its
// language and title (```js title=…, the one convention), headings (the first # the title, the ##
// the sections wherever the first stands, else the shallowest left, deeper h3 and h4; a front
// matter's title and its # heading),
// quotes (holding paragraphs alone) and GitHub's alerts, pictures (copied, alt and title, one not
// found noted at its line), links to files and places said, HTML blocks kept as written (natural
// HTML) or read (a disclosure, pictures alone), a mermaid chain of steps a flow (ol.doc-flow),
// lines joined into paragraphs as a viewer joins them, and lists that hold their blocks and keep
// their numbers; a paste keeps each line a block. Then real documents (read-only copies of those
// GALLERY_MARKDOWN_SAMPLES names, in a folder of the test's own; skipped where it names none):
// no formula left as a raw $, every table a table, every heading a heading, the sections made of
// the ## headings (else the shallowest), nothing of the conversion's own noted, and each report
// passes gallery check.

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-from-md-"));
const scratch = path.join(root, "scratch");
await fs.mkdir(scratch);
const starter = (title) => `<!doctype html>
<html lang="zh-CN">
<head><title>${title}</title></head>
<body>
  <main class="doc-page" data-doc-id="imported">
    <header class="doc-header">
      <h1 class="doc-title">${title}</h1>
    </header>
    <p></p>
  </main>
</body>
</html>
`;
let folders = 0;
// A document (and the files beside it) imported as gallery import imports it: { page, main } (main:
// what the report holds after its header, its lines' indent of the main's blocks taken off).
async function convert(markdown, { name = "doc.md", files = {} } = {}) {
  const folder = path.join(root, `doc-${++folders}`);
  await fs.mkdir(folder);
  await fs.writeFile(path.join(folder, name), markdown);
  for (const [file, data] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(folder, file)), { recursive: true });
    await fs.writeFile(path.join(folder, file), data);
  }
  const page = await importMarkdown(path.join(folder, name), scratch);
  const text = await fillReport({ source: starter(page.title), nodes: page.nodes, icon: page.icon, raws: page.raws, lang: page.lang });
  const main = text.slice(text.indexOf("</header>") + "</header>".length, text.indexOf("</main>")).replace(/^\n+|\s+$/g, "").replace(/^ {4}/gm, "");
  return { page, main, text };
}
const MATH = (tex) => `<span class="doc-math-inline">\\(${tex}\\)</span>`;

// ---------- formulas ----------
{
  const { main, page } = await convert(String.raw`Price $5 and $6, $5-$10 and US$3 or US$4, US$6 or $$ alone; $x^2$, \(a+b\), \$7 and $10.

\[
\int_0^1 f
\]

$$
x = 1
$$

$$\sum_i s_i$$

Equation: $$E=mc^2$$ and on.
`);
  assert.equal(main, [
    `<p>Price $5 and $6, $5-$10 and US$3 or US$4, US$6 or $$ alone; ${MATH("x^2")}, ${MATH("a+b")}, $7 and $10.</p>`,
    String.raw`<div class="doc-math-block">\[\int_0^1 f\]</div>`,
    String.raw`<div class="doc-math-block">\[x = 1\]</div>`,
    String.raw`<div class="doc-math-block">\[\sum_i s_i\]</div>`,
    "<p>Equation:</p>",
    String.raw`<div class="doc-math-block">\[E=mc^2\]</div>`,
    "<p>and on.</p>",
  ].join("\n"), "formulas by Pandoc's rule: no space inside the $, no digit after the closing one, no $ closing on a $; prices stay words; $$…$$ amid words a formula block, as a viewer shows it");
  assert.deepEqual(page.notes, []);
  // A display formula closes before an empty line (Pandoc's rule): "$$ (1)" closes one, its number
  // a \tag, other words after its close a paragraph; one not closed ends at the empty line and says
  // so, and the rest of the document is read as it stands; one with nothing in it stays its words.
  const closing = await convert("$$\nx=1\n$$ (1)\n\n$$\ny=2\n$$ said once\n\nIntro.\n\n$$\nz = 3\n\n## Next\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n```python\nprint(1)\n```\n\n\\[\n\nAfter.\n\n\\begin{align}\na &= b\n\n## Last\n");
  assert.equal(closing.main, [
    String.raw`<div class="doc-math-block">\[x=1 \tag{1}\]</div>`,
    String.raw`<div class="doc-math-block">\[y=2\]</div>`,
    "<p>said once</p>",
    "<p>Intro.</p>",
    String.raw`<div class="doc-math-block">\[z = 3\]</div>`,
    '<section class="doc-section">',
    "  <h2>Next</h2>",
    '  <div class="doc-table-wrap">',
    '    <table class="doc-table">',
    "      <thead>",
    '        <tr><th class="doc-bold doc-highlight-gray">a</th><th class="doc-bold doc-highlight-gray">b</th></tr>',
    "      </thead>",
    "      <tbody>",
    "        <tr><td>1</td><td>2</td></tr>",
    "      </tbody>",
    "    </table>",
    "  </div>",
    '  <div class="doc-code" data-language="python"><div class="doc-code-title"></div><pre><code>print(1)</code></pre></div>',
    String.raw`  <p>\[</p>`,
    "  <p>After.</p>",
    String.raw`  <div class="doc-math-block">\[\begin{align}`,
    "a &amp;= b",
    String.raw`\end{align}\]</div>`,
    "</section>",
    '<section class="doc-section">',
    "  <h2>Last</h2>",
    "</section>",
  ].join("\n"), "a display formula not closed takes nothing after its empty line");
  assert.deepEqual(closing.page.notes.map(({ line, text }) => [line, text]), [
    [11, "the display formula opened by $$ is not closed before an empty line: it ends at line 12"],
    [24, String.raw`\[ opens no formula (an empty line follows it): kept as text`],
    [28, String.raw`\begin{align} is not ended before an empty line: \end{align} added at line 29`],
  ]);
  // Formulas KaTeX draws as the page does (the kit's macros, mhchem) are formulas; one it cannot
  // draw is said at its line (an inline one stays its TeX, which the preview tries again).
  const drawn = await convert(String.raw`The indicator $\mathbbm{1}[y=\hat y]$, water $\ce{H2O}$ and $\nosuch{x}$.

$$
L = \sum_i \ell_i \label{eq:loss}
$$
`);
  assert.equal(drawn.main, [
    String.raw`<p>The indicator ${MATH(String.raw`\mathbbm{1}[y=\hat y]`)}, water ${MATH(String.raw`\ce{H2O}`)} and \(\nosuch{x}\).</p>`,
    String.raw`<div class="doc-math-block">\[L = \sum_i \ell_i \label{eq:loss}\]</div>`,
  ].join("\n"));
  assert.deepEqual(drawn.page.notes.map(({ line, text }) => [line, text]), [[1, String.raw`KaTeX cannot draw the formula \nosuch{x}: Undefined control sequence: \nosuch`]]);
  const environment = await convert(String.raw`\begin{align}
a &= b \\
c &= d
\end{align}
`);
  assert.equal(environment.main, String.raw`<div class="doc-math-block">\[\begin{align}
a &amp;= b \\
c &amp;= d
\end{align}\]</div>`, "a LaTeX environment on lines of its own: a formula block");
  const unknown = await convert(String.raw`\begin{eqnarray*}
a &=& b
\end{eqnarray*}
`);
  assert.equal(unknown.main, String.raw`<div class="doc-math-block">\[\begin{align*}
a &amp;=&amp; b
\end{align*}\]</div>`, "one KaTeX does not draw: the nearest it does");
  assert.deepEqual(unknown.page.notes, [{ line: 1, kind: "math", text: "KaTeX draws no eqnarray* environment: written as align*" }]);
}

// ---------- tables, task lists, strike-through, autolinks ----------
{
  const { main } = await convert(String.raw`Before the table:
| Name | Code | Formula | Note |
|:-----|:----:|--------:|------|
| a | ${"`a\\|b`"} | $x\|y$ | esc \| pipe |
| **b** | [link](https://e.com) | ~~old~~ | <https://x.org> |

Plain | Value
--- | ---
c | 1

- [ ] to do
- [x] done

Mail <me@example.com>, www.example.org and https://example.com/a.
`);
  assert.ok(main.startsWith("<p>Before the table:</p>\n<div class=\"doc-table-wrap\">"), `a table right after a paragraph's line: ${main}`);
  assert.equal((main.match(/<table class="doc-table">/g) ?? []).length, 2, "both tables, with their pipes at the ends or not");
  assert.ok(main.includes('<tr><th class="doc-bold doc-highlight-gray">Name</th><th class="doc-bold doc-highlight-gray">Code</th>'), "the header row; the alignment row is no row");
  assert.ok(main.includes(`<td><code>a|b</code></td><td>${MATH("x|y")}</td><td>esc | pipe</td>`) || main.includes(`<th scope="row">a</th><td><code>a|b</code></td><td>${MATH("x|y")}</td><td>esc | pipe</td>`),
    `an escaped pipe in code, in a formula and in words: ${main}`);
  assert.ok(main.includes('<td><a href="https://e.com">link</a></td><td><s>old</s></td><td><a href="https://x.org">https://x.org</a></td>'), main);
  assert.ok(main.includes('<ul class="doc-todo">\n  <li>to do</li>\n  <li data-checked>done</li>\n</ul>'), "a task list: the to-do list");
  assert.ok(main.endsWith('<p>Mail <a href="mailto:me@example.com">me@example.com</a>, <a href="http://www.example.org">www.example.org</a> and <a href="https://example.com/a">https://example.com/a</a>.</p>'), main);
  // GFM's bare e-mail addresses; a bare address's backslash escapes read (in a link's text too); a
  // picture in a cell (单元格里的图片, kept there) not found said at its row's line, its alt words left.
  const more = await convert(String.raw`Write to a.b+c@sub.example.org. Not foo@bar. See [https://deb.example.com/setup\_20.x](https://deb.example.com/setup_20.x) or https://x.com/a\_b.

| a | b |
|---|---|
| 1 | 2 |
| ![x](none.png) | 3 |
`);
  assert.ok(more.main.startsWith('<p>Write to <a href="mailto:a.b+c@sub.example.org">a.b+c@sub.example.org</a>. Not foo@bar. See <a href="https://deb.example.com/setup_20.x">https://deb.example.com/setup_20.x</a> or <a href="https://x.com/a_b">https://x.com/a_b</a>.</p>'), more.main);
  assert.deepEqual(more.page.notes.map(({ line, kind }) => [line, kind]), [[6, "picture-missing"]]);
  assert.ok(/<t[hd][^>]*>x<\/t[hd]><td>3<\/td>/.test(more.main), more.main);
}

// ---------- link definitions ----------
{
  const { main } = await convert("See [docs] and [the guide][g].\n\n[注]: 这是一段说明\n\n[docs]: https://x.org/d \"Docs\"\n[g]: <https://x.org/guide>\n");
  assert.equal(main, '<p>See <a href="https://x.org/d">docs</a> and <a href="https://x.org/guide">the guide</a>.</p>\n<p>[注]: 这是一段说明</p>', "references to the links a document defines; a line that names no address stays words");
}

// ---------- footnotes ----------
{
  const { main, page } = await convert("# 注释的文档\n\n正文[^1]，再一处[^note]，未定义的[^nope]。\n\n[^1]: 第一条。\n[^note]: 第二条，含 $y$。\n    它的第二行。\n");
  assert.equal(page.title, "注释的文档");
  assert.equal(main, [
    '<p>正文<a href="#fn-1"><sup>1</sup></a>，再一处<a href="#fn-2"><sup>2</sup></a>，未定义的[^nope]。</p>',
    '<section class="doc-section">',
    "  <h2>注释</h2>",
    "  <ol>",
    '    <li id="fn-1">第一条。</li>',
    `    <li id="fn-2">第二条，含 ${MATH("y")}。它的第二行。</li>`,
    "  </ol>",
    "</section>",
  ].join("\n"), "a reference a superscript link; the notes a section at the end, each item the link's target");
  assert.deepEqual(page.notes, [{ line: 3, kind: "footnote", text: "the footnote [^nope] has no definition, kept as text" }]);
  const english = await convert("Words[^a].\n\n[^a]: A note.\n");
  assert.match(english.main, /<h2>Notes<\/h2>/, "Notes in a document with no Chinese");
  assert.ok(english.text.includes('<html lang="en">') && (await convert("中文。\n")).text.includes('<html lang="zh-CN">'), "a document with no Chinese an English page");
}

// ---------- code ----------
{
  const { main, page } = await convert('```js title="src/x.js"\nconst a = 1;\n```\n\n```{.python title=\'tools/a.py\'}\nprint(1)\n```\n\n**src/y.py**\n\n```python\nprint(2)\n```\n\n```toml\nname = "x"\n```\n');
  assert.equal(main, [
    '<div class="doc-code" data-language="javascript"><div class="doc-code-title">src/x.js</div><pre><code>const a = 1;</code></pre></div>',
    '<div class="doc-code" data-language="python"><div class="doc-code-title">tools/a.py</div><pre><code>print(1)</code></pre></div>',
    "<p><strong>src/y.py</strong></p>",
    '<div class="doc-code" data-language="python"><div class="doc-code-title"></div><pre><code>print(2)</code></pre></div>',
    '<div class="doc-code" data-language="toml"><div class="doc-code-title"></div><pre><code>name = "x"</code></pre></div>',
  ].join("\n"), "the fence's language, its title from its info string (the one convention: a bold line above it stays a paragraph)");
  assert.deepEqual(page.notes, []);
}

// ---------- headings and sections ----------
{
  const { main, page } = await convert("---\ntitle: \"前言: 文档\"\nauthor: me\n---\n\n# 前言: 文档\n\n开头的一段。\n\n---\n\n## 第一章 {#one}\n\n### 小节\n\n#### 更小\n\n##### 最小\n\n第二章\n------\n\n文字。\n");
  assert.equal(page.title, "前言: 文档", "the front matter's title; the # heading repeating it leaves the body");
  assert.equal(main, [
    "<p>开头的一段。</p>",
    '<section class="doc-section">',
    "  <hr>",
    "  <h2>第一章</h2>",
    "  <h3>小节</h3>",
    "  <h4>更小</h4>",
    "  <h4>最小</h4>",
    "</section>",
    '<section class="doc-section">',
    "  <h2>第二章</h2>",
    "  <p>文字。</p>",
    "</section>",
  ].join("\n"), "## a section (a divider before it at its top), ### an h3, deeper an h4; setext; {#id} left off; what comes first in the page");
  // No # heading: the title is the file's name. A document whose headings start at #: its # the sections.
  const plain = await convert("## A\n\n文字\n\n## B\n", { name: "笔记 (1).md" });
  assert.equal(plain.page.title, "笔记 (1)");
  assert.equal((plain.main.match(/<section class="doc-section">\n {2}<h2>/g) ?? []).length, 2);
  // The sections are the ## headings (the title's # gone) wherever the first stands, a later #
  // heading too (two documents in one); with no ## the shallowest headings left. The title is the
  // first # heading, wherever it stands.
  const outline = (main) => main.match(/<section class="doc-section">|<h[2-4]>[^<]*<\/h[2-4]>/g).join(" ").replaceAll('<section class="doc-section">', "§");
  const flat = await convert("# 标题\n\n## 甲\n\n# 第二份\n\n## 乙\n");
  assert.equal(outline(flat.main), "§ <h2>甲</h2> § <h2>第二份</h2> § <h2>乙</h2>", "a later # heading a section of its own, as its ## are");
  const deep = await convert("# T\n\n# A\n\n### a\n\n# B\n");
  assert.equal(outline(deep.main), "§ <h2>A</h2> <h4>a</h4> § <h2>B</h2>", "no ##: the shallowest headings the sections");
  const deeper = await convert("# T\n\n### early\n\ntext\n\n## main a\n\n### sub\n\n## main b\n");
  assert.equal(outline(deeper.main), "<h3>early</h3> § <h2>main a</h2> <h3>sub</h3> § <h2>main b</h2>", "a deeper heading first: the ## still the sections");
  const late = await convert("### 1. 早的\n\n文字\n\n## 前\n\n# 真的标题\n\n## 甲\n\n### 甲一\n\n## 乙\n");
  assert.equal(late.page.title, "真的标题", "the first # heading the title, wherever it stands");
  assert.equal(outline(late.main), "<h3>1. 早的</h3> § <h2>前</h2> § <h2>甲</h2> <h3>甲一</h3> § <h2>乙</h2>");
  // A front matter's title and a # heading of other words, the body's only one and its first (a docs
  // site's page): the heading leaves the body, said, and the ## are the sections.
  const site = await convert("---\ntitle: >-\n  Getting\n  started\n---\n\n# Installing the CLI\n\n## Download\n\ntext\n\n## Run\n\ntext\n");
  assert.equal(site.page.title, "Getting started", "a folded title");
  assert.equal(outline(site.main), "§ <h2>Download</h2> § <h2>Run</h2>");
  assert.deepEqual(site.page.notes.map(({ line, text }) => [line, text]), [[7, 'the # heading "Installing the CLI" is left out: the front matter\'s title, "Getting started", is the document\'s']]);
}

// ---------- quotes, alerts, disclosures, paragraphs ----------
{
  const { main } = await convert("> 引用的第一行\n继续的一行\n>\n> 第二段\n\n> [!WARNING]\n> 小心这个。\n\n<details>\n<summary>展开 **更多**</summary>\n\n隐藏的段落，含 $a+b$。\n\n</details>\n\n第一行中文\n接着第二行，English\nwords here.  \n硬换行之后\\\n再一行。\n");
  assert.equal(main, [
    "<blockquote>",
    "  <p>引用的第一行继续的一行</p>",
    "  <p>第二段</p>",
    "</blockquote>",
    '<div class="doc-panel">',
    '  <div class="doc-icon">⚠️</div>',
    "  <p>小心这个。</p>",
    "</div>",
    '<details class="doc-details">',
    '  <summary><span class="doc-details-summary-label">展开 <strong>更多</strong></span></summary>',
    '  <div class="doc-details-content">',
    `    <p>隐藏的段落，含 ${MATH("a+b")}。</p>`,
    "  </div>",
    "</details>",
    "<p>第一行中文接着第二行，English words here.<br>硬换行之后<br>再一行。</p>",
  ].join("\n"), "a quote's lazy line; GitHub's alert a highlight; <details> a disclosure; lines joined (no space between Chinese), hard breaks");
  // A quote holds paragraphs alone: a list, code or a heading in one stands in place out of it (no
  // empty quote before it), the paragraphs after it a quote again, said; its heading starts no section.
  const held = await convert("> - 第一点\n> - 第二点\n>\n> 引用的结语\n\n> 开头\n>\n> ```sh\n> ls\n> ```\n>\n> ## 引用里的标题\n\n## 正文\n\n文字\n");
  assert.equal(held.main, [
    "<ul>",
    "  <li>第一点</li>",
    "  <li>第二点</li>",
    "</ul>",
    "<blockquote>",
    "  <p>引用的结语</p>",
    "</blockquote>",
    "<blockquote>",
    "  <p>开头</p>",
    "</blockquote>",
    '<div class="doc-code" data-language="bash"><div class="doc-code-title"></div><pre><code>ls</code></pre></div>',
    "<h2>引用里的标题</h2>",
    '<section class="doc-section">',
    "  <h2>正文</h2>",
    "  <p>文字</p>",
    "</section>",
  ].join("\n"));
  assert.deepEqual(held.page.notes.map(({ line, text }) => [line, text]), [
    [1, "a quote holds paragraphs alone: its list kept in place, out of it"],
    [6, "a quote holds paragraphs alone: its code, heading kept in place, out of it"],
  ]);
}

// ---------- a block the page cannot make ----------
{
  // Left out, and said: what the import answers never hides content it lost.
  const { clipboard } = BLOCK_TYPES.quote;
  BLOCK_TYPES.quote.clipboard = { ...clipboard, build() { throw new Error("no such block"); } };
  try {
    const { main, page } = await convert("开头\n\n> 引用\n\n段尾\n");
    assert.equal(main, "<p>开头</p>\n<p>段尾</p>", "the blocks around it stay");
    assert.deepEqual(page.notes, [{ line: null, kind: "left-out", text: "a block the page cannot make is left out (quote): no such block" }]);
  } finally {
    BLOCK_TYPES.quote.clipboard = clipboard;
  }
}

// ---------- links to what is no web address ----------
{
  // A link to a file beside the document, or to a place in it, is said (its words kept); a file
  // chosen with it in the workbench, linked alone in its paragraph, comes in as a file.
  const { main, page } = await convert("See [the data](data/results.csv) and [notes](other.md).\n\n- [结果](#结果)\n- [设置](#设置)\n\n## 结果\n\n文字\n", { files: { "data/results.csv": "a,b\n1,2\n" } });
  assert.ok(main.startsWith("<p>See the data and notes.</p>\n<ul>\n  <li><a href=\"#结果\">结果</a></li>"), main);
  assert.deepEqual(page.notes.map(({ line, text }) => [line, text]), [
    [1, "the link to data/results.csv is kept as its words: a document links to web addresses"],
    [1, "the link to other.md is kept as its words: a document links to web addresses"],
    [3, "2 links to places in the document (#结果, #设置) lead nowhere: a document's headings have no anchors"],
  ]);
  const write = async (name, data) => {
    const file = path.join(root, `linked-${++folders}-${name}`);
    await fs.writeFile(file, data);
    return { file, name };
  };
  const chosen = await importFiles([await write("说明.md", "# 说明\n\n[数据](data/results.json)\n\n正文提到 [数据](data/results.json)。\n"), await write("results.json", "a,b\n1,2\n")], scratch);
  assert.deepEqual([chosen.skipped, chosen.pages[0].files.length, chosen.pages[0].notes.map(({ line, text }) => [line, text])], [[], 1, [[5, "the link to data/results.json is kept as its words: a document links to web addresses"]]], "chosen together: the link alone in its paragraph a file; the one in words said");
}

// Words a page's Markdown wrote as words: a tag at a line's start, escaped, opens nothing.
{
  const { main } = await convert("- 字面\n\n    \\<details>\n\n    后面的话\n\n- 下一张\n\n    下一张的话\n\n\\<aside>\n\n末段\n");
  assert.ok(!/<details|doc-panel/.test(main) && /<p>&lt;details><\/p>\s*<p>后面的话<\/p>/.test(main) && /<p>下一张的话<\/p>/.test(main) && /<p>&lt;aside><\/p>\s*<p>末段<\/p>/.test(main), main);
}

// An item of no words on its line holds what stands right under it.
{
  const { main } = await convert("- \n    入口\n\n    - 项\n- 下一项\n");
  assert.ok(/<ul>\s*<li>[\s\S]*入口[\s\S]*<ul>\s*<li>项<\/li>\s*<\/ul>\s*<\/li>\s*<li>下一项<\/li>\s*<\/ul>/.test(main), main);
}
// An item a page export wrote with no words over what it holds, a non-breaking space on its line (so
// that a viewer gives it a line of its own), reads back with none, holding what stands under it.
{
  const { main } = await convert("- &nbsp;\n\n    段落\n- &nbsp;\n    - 子项\n- 下一项\n");
  assert.equal(main, "<ul>\n  <li>\n    <p>段落</p>\n  </li>\n  <li>\n    <ul>\n      <li>子项</li>\n    </ul>\n  </li>\n  <li>下一项</li>\n</ul>", main);
}
// Pasted (复制页面内容 puts that Markdown on the clipboard), such an item reads the same: a bulleted,
// a numbered and a to-do item of no words over what it holds.
{
  const read = (text) => fromMarkdown(text).map(({ type, title, children }) => [type, title, children.map((child) => [child.type, child.title])]);
  assert.deepEqual(read("- &nbsp;\n\n    段落\n- 下一项\n"), [["bulleted_list", [], [["text", [["段落"]]]]], ["bulleted_list", [["下一项"]], []]], "an item of no words over the paragraph, then the next");
  assert.deepEqual(read("1. &nbsp;\n    - 子项\n"), [["numbered_list", [], [["bulleted_list", [["子项"]]]]]], "a numbered one over its list");
  assert.deepEqual(read("- [ ]  &nbsp;\n\n    待办下的段落\n"), [["to_do", [], [["text", [["待办下的段落"]]]]]], "a to-do over its paragraph");
  assert.deepEqual(read("- a&nbsp;b\n"), [["bulleted_list", [["a&nbsp;b"]], []]], "the entity amid words stays as written, as a paste reads any");
}

// ---------- lists ----------
{
  const { main } = await convert("3. 第三\n\n   段落在项里。\n\n   ```sh\n   ls\n   ```\n4. 第四\n   - 子项\n\n```sh\npwd\n```\n\n5. 第五\n");
  assert.equal(main, [
    '<ol start="3">',
    "  <li>第三",
    "    <p>段落在项里。</p>",
    '    <div class="doc-code" data-language="bash"><div class="doc-code-title"></div><pre><code>ls</code></pre></div>',
    "  </li>",
    "  <li>第四",
    "    <ul>",
    "      <li>子项</li>",
    "    </ul>",
    "  </li>",
    "</ol>",
    '<div class="doc-code" data-language="bash"><div class="doc-code-title"></div><pre><code>pwd</code></pre></div>',
    '<ol start="5">',
    "  <li>第五</li>",
    "</ol>",
  ].join("\n"), "an item holds its blocks; a list keeps its numbers, one that goes on after a block too");
  // A paste keeps each line a block (no joining into paragraphs).
  assert.deepEqual(fromMarkdown("一行\n二行").map((spec) => spec.type), ["text", "text"]);
}

// ---------- pictures ----------
{
  const files = { "img/dot.png": PNG, "other/b.png": PNG };
  const { main, page } = await convert('![点](img/dot.png "点的标题")\n\n![](other/b.png "只有标题")\n\n前面 ![没了](img/missing.png) 后面。\n\n- 项 ![项里的](img/dot.png)\n\n## 有图 ![标题里](img/dot.png)\n\n<p align="center">\n  <img src="img/dot.png" alt="居中的图" width="200">\n</p>\n\n<table><tr><td>表里 <img src="img/dot.png"> 的图 <img src="img/none.png"></td></tr></table>\n', { files });
  const kept = /assets\/image-[0-9a-f]{12}\.png/.exec(main)?.[0];
  assert.ok(kept, main);
  assert.equal(main.replaceAll(kept, "KEPT"), [
    "<figure class=\"doc-image\">",
    "  <img src=\"KEPT\" alt=\"\">",
    "  <figcaption>点</figcaption>",
    "</figure>",
    "<figure class=\"doc-image\">",
    "  <img src=\"KEPT\" alt=\"\">",
    "  <figcaption>只有标题</figcaption>",
    "</figure>",
    "<p>前面后面。</p>",
    "<ul>",
    "  <li>项",
    "    <figure class=\"doc-image\">",
    "      <img src=\"KEPT\" alt=\"\">",
    "      <figcaption>项里的</figcaption>",
    "    </figure>",
    "  </li>",
    "</ul>",
    "<section class=\"doc-section\">",
    "  <h2>有图 标题里</h2>",
    "  <figure class=\"doc-image\">",
    "    <img src=\"KEPT\" alt=\"\">",
    "    <figcaption>居中的图</figcaption>",
    "  </figure>",
    "  <table><tr><td>表里 <img src=\"KEPT\"> 的图 <img src=\"img/none.png\"></td></tr></table>",
    "</section>",
  ].join("\n"), "pictures copied (one file a picture), their alt text the caption (else their title); one in an item held by it, one in a heading its words; an HTML block of pictures alone pictures; one in an HTML block kept as written its address the copy's; the words around one not found one paragraph again");
  assert.deepEqual(page.files.map((file) => file.name), [kept.slice("assets/".length)], "the same picture kept once");
  assert.deepEqual(page.notes.map(({ line, kind, name }) => [line, kind, name ?? null]), [[5, "picture-missing", "img/missing.png"], [9, "picture-in-text", null], [15, "picture-missing", "img/none.png"]], "what it could not bring, at its line");
}

// ---------- HTML blocks, mermaid ----------
{
  const { main, page } = await convert("<div class=\"note\">\n  <b>保留</b>的 HTML\n</div>\n\n<script>alert(1)</script>\n\n<!-- 注释 -->\n\n<br>\n\n```mermaid\nflowchart LR\n  A[收集] --> B(清洗) --> C[\"训练 &amp; 评测\"]\n  %% a comment\n  style A fill:#f9f\n```\n\n```mermaid\ngraph TD\n  a --> b\n  b --> c\n```\n\n```mermaid\ngraph TD\n  A --> B\n  A --> C\n```\n\n```mermaid\nflowchart LR\n  A -->|是| B\n```\n");
  assert.equal(main, [
    '<div class="note">',
    "  <b>保留</b>的 HTML",
    "</div>",
    '<ol class="doc-flow">',
    "  <li>收集</li>",
    "  <li>清洗</li>",
    "  <li>训练 &amp; 评测</li>",
    "</ol>",
    '<ol class="doc-flow">',
    "  <li>a</li>",
    "  <li>b</li>",
    "  <li>c</li>",
    "</ol>",
    '<div class="doc-code" data-language="mermaid"><div class="doc-code-title"></div><pre><code>graph TD',
    "  A --&gt; B",
    "  A --&gt; C</code></pre></div>",
    '<div class="doc-code" data-language="mermaid"><div class="doc-code-title"></div><pre><code>flowchart LR',
    "  A --&gt;|是| B</code></pre></div>",
  ].join("\n"), "an HTML block kept as written; <script>, a comment and a lone <br> left out; a mermaid chain of steps a flow, any other mermaid its code");
  assert.deepEqual(page.notes.map(({ line, kind }) => [line, kind]), [[5, "html"], [24, "mermaid"], [30, "mermaid"]]);
}

// ---------- the reader's lines, and the workbench's import of a Markdown file ----------
{
  const { notes } = readMarkdownDocument("![a](x.png) 在一行文字里的图。\n\n# 标题 ![b](https://e.com/b.png)\n", { firstLine: 5 });
  assert.deepEqual(notes.map((note) => note.line), [7], "lines counted from firstLine (after a front matter)");
  // Chosen with its picture (a folder's files come without their folders), alone (the picture not
  // found is said by its address), and its folder zipped.
  const write = async (name, data) => {
    const file = path.join(root, `chosen-${++folders}-${name}`);
    await fs.writeFile(file, data);
    return { file, name };
  };
  const markdown = "# 图\n\n![点](img/dot.png)\n";
  const together = await importFiles([await write("图.md", markdown), await write("dot.png", PNG)], scratch);
  assert.deepEqual([together.skipped, together.pages[0].notes, together.pages[0].files.length], [[], [], 1], "chosen together: its picture comes with it");
  const alone = await importFiles([await write("图.md", markdown)], scratch);
  assert.deepEqual(alone.pages[0].notes.map(({ kind, name }) => [kind, name]), [["picture-missing", "img/dot.png"]], "alone: the picture it could not find, named");
  const folder = await importFiles([await write("笔记.zip", createZip([{ name: "笔记/图.md", data: markdown }, { name: "笔记/img/dot.png", data: PNG }]))], scratch);
  assert.deepEqual([folder.skipped, folder.pages.map((page) => [page.title, page.notes.length, page.files.length])], [[], [["图", 0, 1]]], "its folder zipped: the picture found where the address says");
}

// ---------- real documents ----------
// Real documents are named by GALLERY_MARKDOWN_SAMPLES (paths separated by ";"): none are
// named here, as the tests go with the skill's package and a machine's documents are its own.
const REAL = (process.env.GALLERY_MARKDOWN_SAMPLES ?? "").split(";").map((each) => each.trim()).filter(Boolean);
const found = (await Promise.all(REAL.map((file) => fs.stat(file).then((stat) => stat.isFile(), () => false)))).filter(Boolean).length;
let real = 0;
if (found > 0) {
  // Read-only copies in a folder of the test's own, made reports in a studio of its own.
  const copies = path.join(root, "real");
  const reports = path.join(root, "studio", "reports");
  await fs.mkdir(copies);
  await fs.mkdir(reports, { recursive: true });
  const slugs = [];
  for (const original of REAL) {
    if (!(await fs.stat(original).then((stat) => stat.isFile(), () => false))) continue;
    const file = path.join(copies, path.basename(original));
    await fs.copyFile(original, file);
    const markdown = await fs.readFile(file, "utf8");
    const page = await importMarkdown(file, scratch);
    const slug = `real-${++real}`;
    await createReportFromStarter(slug, page.title, `导入自 ${path.basename(file)}`, { directory: reports, blank: true });
    const htmlFile = path.join(reports, slug, "report.html");
    const html = await fillReport({ source: await fs.readFile(htmlFile, "utf8"), nodes: page.nodes, icon: page.icon, raws: page.raws, lang: page.lang });
    await fs.writeFile(htmlFile, html);
    slugs.push(slug);
    const name = path.basename(original);
    // Nothing of the conversion's own noted (what a document links to, a file beside it or a place
    // in it, is the document's).
    assert.deepEqual(page.notes.filter((note) => note.kind !== "link"), [], `${name}: nothing it could not bring`);
    // Its text outside code, its tables' delimiter rows and its headings' levels (the title's aside:
    // its first # heading, when it is the title).
    const prose = markdown.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, "");
    const delimiters = (prose.match(/^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)+\|?\s*$/gm) ?? []).length;
    const levels = (prose.match(/^#{1,6}(?= )/gm) ?? []).map((marks) => marks.length);
    if (levels.includes(1) && page.title === prose.match(/^# (.*)$/m)[1].trim()) levels.splice(levels.indexOf(1), 1);
    const outside = html.replace(/<span class="doc-math-inline">[\s\S]*?<\/span>|<div class="doc-math-block">[\s\S]*?<\/div>|<pre>[\s\S]*?<\/pre>|<code>[\s\S]*?<\/code>/g, "");
    assert.equal((outside.match(/\$\$|\$[^\s$\d][^$<\n]*?[^\s$]\$(?!\d)/g) ?? []).join(" "), "", `${name}: no formula left as a raw $ (a price's $ is words)`);
    assert.ok(!/\\\(|\\\[|\*\*\S[^<\n]*?\S\*\*|\[\^/.test(outside), `${name}: no Markdown left in the text (a lone ** is the document's own)`);
    assert.equal((html.match(/<table class="doc-table">/g) ?? []).length, delimiters, `${name}: every table a table`);
    assert.equal((html.match(/<h[2-4]>/g) ?? []).length, levels.length, `${name}: every heading a heading`);
    const top = levels.includes(2) ? 2 : Math.min(...levels);
    assert.equal((html.match(/<section class="doc-section">/g) ?? []).length, levels.filter((level) => level <= top).length, `${name}: a section for each of its ## headings (else its shallowest)`);
  }
  const { reports: loaded, failures } = await loadReports(slugs, { directory: reports, prepare: naturalInMemory({ say: false }) });
  assert.deepEqual([...failures], [], "every report reads");
  assert.deepEqual([...checkReports(loaded)], [], "every report passes gallery check");
}

await fs.rm(root, { recursive: true, force: true });
console.log(`Checked Markdown made a report (gallery import, 导入): formulas and prices (a display one not closed ending at its empty line, one KaTeX cannot draw said), tables, task lists, footnotes, autolinks, code and its titles, the title and the sections (## wherever the first stands, a front matter's title), quotes holding paragraphs alone and alerts, disclosures, lists that hold their blocks and keep their numbers, pictures and what was not found, links to files and places said, HTML blocks, mermaid flows; ${real ? `${real} real documents, each passing gallery check` : "no real documents named (GALLERY_MARKDOWN_SAMPLES): skipped"}.`);
