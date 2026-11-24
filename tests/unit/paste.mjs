import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

// Pasting from other programs (src/editor/page/clipboard/import/), in jsdom: the HTML conversion of
// 21 samples (web pages, Google Docs / Sheets, Excel, Word, WPS, GitHub, WeChat…), each held to the
// hash of its expected blocks (tests/unit/fixtures/paste/html-corpus.mjs), formulas AI answers copy
// (GPT and Gemini samples), colors onto the page's nine (the nearest for sources whose styles are
// meant, else only the page's own), and 32 more samples of many programs converting without error.

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://studio.test/page" });
const saved = { DOMParser: globalThis.DOMParser, Node: globalThis.Node };
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;
const BASE = "https://studio.test/page";

const H = await import("../../src/editor/page/clipboard/import/html.mjs");
const W = await import("../../src/editor/page/clipboard/import/office.mjs");
const { bareAddress, readExternal } = await import("../../src/editor/page/clipboard/import/read.mjs");
const { textColor, backgroundColor } = await import("../../src/editor/page/clipboard/import/colors.mjs");
const { HTML_PASTE_CORPUS } = await import("./fixtures/paste/html-corpus.mjs");
const F = await import("./fixtures/paste/block-format.mjs");

const fixture = (name) => fs.readFileSync(new URL(`./fixtures/paste/${name}`, import.meta.url), "utf8");
const clipboard = (types) => ({ types: Object.keys(types), getData: (type) => types[type] ?? "" });

// Each sample converted as a paste converts it (Office's through the Word filter first), written a block
// a line (block-format.mjs formatSpec, the page's address as PAGE) and hashed.
const office = /schemas-microsoft-com:office|xmlns:m="http:\/\/schemas\.microsoft\.com\/office\/2004\/12\/omml"/;
// The expected result where it is not the sample's `reference` hash. WPS's sample is a numbered list: each item's
// marker is a list's number, "1." and "2.", which WPS writes with nothing after it, so it is pasted as a
// numbered list, "第一项" and "第二项" its items (the segment `numbered_list "第一项"`, `numbered_list "第二项"`,
// then the paragraph).
const EXPECTED = { wps: "1bf91f30" };
const differ = [];
for (const sample of HTML_PASTE_CORPUS) {
  const isOffice = office.test(sample.html);
  const html = isOffice && W.isWordContent(sample.html) ? W.filterWordContent(sample.html) : sample.html;
  const parse = () => H.parseClipboardHTML(html, { base: BASE });
  const probe = parse();
  const isTable = probe.firstElementChild?.tagName === "TABLE";
  const segment = F.formatCase({ name: sample.name, isTable, rich: H.containsRichFormatting(probe), office: isOffice,
    inline: H.htmlToRichText(parse()), blocks: H.htmlToBlocks(parse()) }, F.formatSpec).slice(3);
  if (F.fnv(segment.split(BASE).join("PAGE")) !== (EXPECTED[sample.name] ?? sample.reference)) differ.push(segment);
}
assert.deepEqual(differ, [], "the HTML conversion gives the expected result for every sample");

// What a paste is (read.mjs readExternal): plain text, rich text at the caret, or blocks.
const kindOf = (types) => readExternal(clipboard(types), { base: BASE });
assert.equal(kindOf({ "text/plain": "Just a plain sentence.", "text/html": '<span style="color:#000">Just a plain sentence.</span>' }).kind, "plain", "spans alone paste as text");
assert.equal(kindOf({ "text/plain": "Bold word", "text/html": "<b>Bold</b> word" }).kind, "rich", "one line of HTML goes in at the caret");
assert.equal(kindOf({ "text/plain": "a\nb", "text/html": "<p>a</p><p><b>b</b></p>" }).kind, "blocks", "several lines of HTML are blocks");
assert.equal(kindOf({ "text/plain": "**bold** and https://x.com/a." }).kind, "rich", "inline Markdown");
assert.equal(kindOf({ "text/plain": "https://x.com/a" }).kind, "plain", "an address alone stays text");
assert.equal(kindOf({ "text/plain": "$$\nx^2\n$$" }).specs[0].type, "equation", "a whole $$ formula $$");
const vscode = kindOf({ "text/plain": "const a = 1;\nconst b = 2;", "vscode-editor-data": JSON.stringify({ mode: "typescriptreact" }) });
assert.deepEqual([vscode.specs[0].type, vscode.specs[0].props.language], ["code", "TypeScript"], "VS Code's lines are code in its language");
// IDEs also color Markdown as source code. Its document structure takes precedence over that
// HTML, with no requirement that every line be valid Markdown or separated by a blank line.
const fromEditor = (text, mode) => kindOf({
  "text/plain": text,
  "text/html": `<pre><span style="color:#569cd6">${text.replaceAll("&", "&amp;").replaceAll("<", "&lt;")}</span></pre>`,
  "vscode-editor-data": JSON.stringify({ mode }),
});
const md = "# 计划\n正文 **重点**\n- 第一项\n   - 子项\n不规范的 **未结束\n```js\nconst answer = 42;\n```";
for (const mode of ["markdown", "md", "plaintext", "unknown-language"]) {
  assert.deepEqual(fromEditor(md, mode), kindOf({ "text/plain": md }), `${mode}: existing Markdown parsing, despite source-colored HTML and imperfect lines`);
}
assert.deepEqual(fromEditor("# 单行标题", "markdown").specs.map((s) => s.type), ["header"], "one Markdown heading is a heading, not its highlighted source");
assert.deepEqual(fromEditor("**强调** 和 `代码`", "markdown"), kindOf({ "text/plain": "**强调** 和 `代码`" }), "inline Markdown stays inline");
assert.deepEqual(fromEditor("只有正文\n没有标记", "markdown"), kindOf({ "text/plain": "只有正文\n没有标记" }), "a Markdown language hint needs no syntax to pass a heuristic");
const loose = "## 标题\n• 第一项\n1) 第二项\n>引用\n| 名称 | 值 |\n| --- | --- |\n| A | 1 |";
assert.deepEqual(fromEditor(loose, "plaintext").specs.map((s) => s.type), ["sub_header", "bulleted_list", "numbered_list", "quote", "table"], "unspecified IDE text accepts existing tolerant list, quote and table syntax");
for (const [mode, text, language] of [
  ["python", "# Heading\n# **comment**\nvalue = 2 ** 3", "Python"],
  ["typescript", "// # Heading\nconst text = `**bold**`;", "TypeScript"],
  ["shellscript", "# Heading\n# next\necho hello", "Shell"],
  ["plaintext", "const a = 1;\nconst b = 2;", "Plain Text"],
]) {
  const result = fromEditor(text, mode);
  assert.deepEqual(result.specs.map((s) => [s.type, s.title, s.props.language]), [["code", [[text]], language]], `${mode}: real source code retains its exact text and language`);
}
const unsafe = kindOf({ "text/plain": "x y", "text/html": '<p><a href="javascript:alert(1)">x</a> <b>y</b></p>' });
assert.ok(unsafe.title.every(([, a]) => !a?.some((x) => x[0] === "a")), "a javascript: link goes");

// A callout as a page copies it (own/writers.mjs): its Markdown read as any <aside>, a block with its
// text; its HTML its text, the import having no block for an <aside>; no tag left in either.
const aside = kindOf({ "text/plain": "<aside>\n提示**加粗**的话\n</aside>" });
assert.deepEqual([aside.kind, aside.specs.length, aside.specs[0].type, aside.specs[0].children[0].title], ["blocks", 1, "callout", [["提示"], ["加粗", [["b"]]], ["的话"]]], "its Markdown alone");
assert.ok(!JSON.stringify(aside).includes("aside"), "no tag in the text of its Markdown");
const asideHtml = kindOf({ "text/html": "<p>提示<strong>加粗</strong>的话</p>" });
assert.deepEqual([asideHtml.kind, asideHtml.title], ["rich", [["提示"], ["加粗", [["b"]]], ["的话"]]], "its HTML alone: its text with its marks");
const asideBoth = kindOf({ "text/html": "<p>提示的话</p>", "text/plain": "<aside>\n提示的话\n</aside>" });
assert.deepEqual([asideBoth.kind, asideBoth.specs.map((one) => one.type)], ["blocks", ["callout"]], "both: its Markdown, as any HTML of no rich formatting");
const asideLines = kindOf({ "text/html": "<p>一行<br>二行</p>", "text/plain": "<aside>\n一行\n二行\n</aside>" });
assert.deepEqual(JSON.stringify(asideLines.specs).match(/一行|二行/g), ["一行", "二行"], "its lines stay two lines");
const aroundAside = kindOf({ "text/html": '<div><div class="doc-icon">💡</div><p>头</p><p>内提示</p><p>尾</p></div>', "text/plain": "<aside>\n💡 头\n\n内提示\n\n尾\n\n</aside>" });
assert.deepEqual(aroundAside.specs.map((one) => one.type), ["callout"], "a highlight block around a callout stays one");
assert.deepEqual(kindOf({ "text/html": "", "text/plain": "<aside>\n\n</aside>" }).specs.map((one) => one.type), ["callout"], "an empty one, its Markdown alone");

// AI answers' Markdown (fixtures/paste/ai-gpt.md, ai-gemini.md): GPT's escaped \\( \\) / \\[ \\], Gemini's $ / $$.
const all = (specs) => specs.flatMap((s) => [s, ...all(s.children ?? [])]);
const inlineFormulas = (specs) => specs.flatMap((s) => [...(s.title ?? []), ...Object.values(s.props.cells ?? {}).flat()]).filter((t) => t[1]?.some((a) => a[0] === "e")).map((t) => t[1].find((a) => a[0] === "e")[1]);
const gpt = all(kindOf({ "text/plain": fixture("ai-gpt.md").replace(/\r?\n/g, "\r\n") }).specs);
const gptDisplay = gpt.filter((s) => s.type === "equation").map((s) => s.title[0][0]);
assert.deepEqual([gptDisplay.length, inlineFormulas(gpt).length], [9, 18], "GPT: 9 display and 18 inline formulas");
assert.ok(gptDisplay.includes("a^2+b^2=c^2") && gptDisplay.some((t) => t.includes("\\\\[6pt]") && t.includes("y_{i,<t}")), "GPT's display formulas unescaped");
assert.ok(inlineFormulas(gpt).includes("O(n\\log n)"), "GPT's inline formulas unescaped");
const gemini = all(kindOf({ "text/plain": fixture("ai-gemini.md") }).specs);
const geminiDisplay = gemini.filter((s) => s.type === "equation");
assert.deepEqual([geminiDisplay.length, inlineFormulas(gemini).length], [3, 17], "Gemini: 3 display and 17 inline formulas");
assert.ok(geminiDisplay[1].title[0][0].includes("\\\\ \\rho_{21}") && geminiDisplay[1].title[0][0].includes("\\begin{cases}"), "Gemini's formulas as they are (\\\\ kept)");
const quote = gemini.find((s) => s.type === "quote");
assert.ok(quote && quote.children[0]?.type === "quote", "a quote nested in a quote");
const table = gemini.find((s) => s.type === "table");
assert.equal(inlineFormulas(table.children).length, 6, "formulas in table cells");
assert.ok(gemini.some((s) => s.type === "to_do" && s.props.checked) && gemini.some((s) => s.type === "code" && s.props.language === "Python" && !s.title[0][0].endsWith("\n")), "to-dos and code");

// Formulas a page drew (KaTeX, Gemini's data-math, Wikipedia's MathML, MathJax 2), and TeX left in HTML text.
const katex = (tex) => `<span class="katex"><span class="katex-mathml"><math><semantics><mrow><mi>x</mi></mrow><annotation encoding="application/x-tex">${tex}</annotation></semantics></math></span><span class="katex-html" aria-hidden="true"><span class="mord">x</span></span></span>`;
const shown = (types) => kindOf(types).specs.map((s) => `${s.type}:${s.type === "equation" ? s.title[0][0] : s.title.map(([t, a]) => (a?.some((x) => x[0] === "e") ? `[${a.find((x) => x[0] === "e")[1]}]` : t)).join("")}`).join(" / ");
assert.equal(shown({ "text/html": `<p>质能方程 ${katex("E=mc^2")} 很有名。</p><span class="katex-display">${katex("\\int_0^1 x\\,dx")}</span><p>结束</p>`, "text/plain": "a\nb" }),
  "text:质能方程 [E=mc^2] 很有名。 / equation:\\int_0^1 x\\,dx / text:结束", "KaTeX");
assert.equal(shown({ "text/html": `<p>设 <span class="math-inline" data-math="x \\in \\mathbb{R}^d">x</span>，则</p><div class="math-block" data-math="a^2+b^2=c^2">a</div>`, "text/plain": "a\nb" }),
  "text:设 [x \\in \\mathbb{R}^d]，则 / equation:a^2+b^2=c^2", "Gemini's data-math");
assert.equal(shown({ "text/html": '<p>令 <span class="MathJax">x</span><script type="math/tex">x^2</script> 成立</p><div><script type="math/tex; mode=display">y=\\sqrt{x}</script></div>', "text/plain": "a\nb" }),
  "text:令 [x^2] 成立 / equation:y=\\sqrt{x}", "MathJax 2");
assert.equal(shown({ "text/html": "<p>公式 <b>$a^2$</b> 和 \\(b_1\\)，价格 $5 和 $6</p><p>$$\\sum_i x_i$$</p><p><code>$keep$</code></p>", "text/plain": "a\nb" }),
  "text:公式 [a^2] 和 [b_1]，价格 $5 和 $6 / equation:\\sum_i x_i / text:$keep$", "TeX in HTML text");

// Colors onto the page's nine (import/colors.mjs): the nearest for sources whose styles are meant
// (Word, Google Docs), black text and a white or transparent fill none; from a web page only the page's own.
assert.equal(textColor("rgb(255, 0, 0)", { nearest: true }), "red", "pure red");
assert.equal(textColor("#C00000", { nearest: true }), "red", "Word's dark red");
assert.equal(textColor("#0070C0", { nearest: true }), "blue", "Word's blue");
assert.equal(textColor("#000000", { nearest: true }), undefined, "black is no color");
assert.equal(textColor("#999999", { nearest: true }), "gray", "gray");
assert.equal(textColor("rgb(255, 0, 0)"), undefined, "a web page keeps only the page's own colors");
assert.equal(textColor("#cf5148"), "red", "the page's own red");
assert.equal(backgroundColor("#FFFF00", { nearest: true }), "yellow_background", "a yellow highlight");
assert.equal(backgroundColor("transparent", { nearest: true }), undefined, "transparent is none");
assert.equal(backgroundColor("#ffffff", { nearest: true }), undefined, "white is none");
{
  const { COLORS } = await import("../../src/shared/colors.mjs");
  const yellow = COLORS.find((color) => color.name === "yellow");
  assert.equal(backgroundColor(yellow.mark[0]), "yellow_background", "the page's own fill of words, exactly");
  assert.equal(backgroundColor(yellow.fill[0]), "yellow_background", "the page's own block fill, exactly");
}
const word = HTML_PASTE_CORPUS.find((s) => s.name === "wps");
const wps = kindOf({ "text/html": word.html, "text/plain": word.text });
const red = all(wps.specs).flatMap((s) => s.title).find(([t]) => t.includes("普通段落"));
assert.ok(red?.[1]?.some((a) => a[0] === "h" && a[1] === "red"), "Word's red text stays red");
const docs = kindOf({ "text/html": '<p><span style="color:#ff0000">红</span><span style="background-color:#ffff00">黄</span></p><p>b</p>', "text/plain": "a\nb", "application/x-vnd.google-docs-document-slice-clip+wrapped": "{}" });
assert.deepEqual(docs.specs[0].title, [["红", [["h", "red"]]], ["黄", [["h", "yellow_background"]]]], "Google Docs' colors");
const web = kindOf({ "text/html": '<p><span style="color:#ff0000">红</span> <span class="doc-text-blue">蓝</span></p><p>b</p>', "text/plain": "a\nb" });
assert.deepEqual(web.specs[0].title, [["红 "], ["蓝", [["h", "blue"]]]], "a web page's red goes, the kit's own blue stays");

// The samples of fixtures/paste/foreign-html-1.mjs and -2.mjs (Word, Google Docs, Notion, Excel, Sheets,
// VS Code, ChatGPT, GitHub, Wikipedia, mail, Yuque, Confluence, CSDN, MDN, KaTeX, Quill…): each
// converts to blocks without error.
for (const file of ["foreign-html-1.mjs", "foreign-html-2.mjs"]) {
  const { FOREIGN_HTML } = await import(`./fixtures/paste/${file}`);
  for (const sample of FOREIGN_HTML) {
    const types = { "text/html": sample.html, "text/plain": "a\nb", ...Object.fromEntries((sample.types ?? []).map((type) => [type, "{}"])) };
    const read = kindOf(types);
    assert.ok(["blocks", "rich", "plain"].includes(read.kind), `pasted sample ${sample.name}`);
  }
}

// What the page makes of them (import/to-blocks.mjs): blocks made to fit the page, which the clipboard's
// own check takes as it takes any (so what it makes is valid by construction, not by being checked).
const { toBlocks } = await import("../../src/editor/page/clipboard/import/to-blocks.mjs");
const { checkBlocks } = await import("../../src/editor/page/clipboard/own/blocks.mjs");
const blocksOf = (types) => {
  const read = kindOf(types);
  const blocks = toBlocks(read.specs);
  assert.deepEqual(checkBlocks(blocks), blocks, "the blocks made are ones the clipboard's own check takes too");
  return blocks;
};
const sample = (name) => HTML_PASTE_CORPUS.find((s) => s.name === name);
const brief = (blocks) => blocks.map((b) => b.type + (b.blocks ? `[${brief(b.blocks)}]` : b.lists?.length ? `[${brief(b.lists)}]` : "")).join(" ");
assert.equal(brief(blocksOf({ "text/html": sample("web-article").html, "text/plain": sample("web-article").text })), "heading1 paragraph bullets[item item[bullets[item]]] numbers[item item]", "a web page");
const docsBlocks = blocksOf({ "text/html": sample("google-docs").html, "text/plain": sample("google-docs").text });
assert.equal(brief(docsBlocks), "heading1 paragraph bullets[item item]", "Google Docs");
assert.equal(docsBlocks[1].html, "<strong>Bold</strong> <em>italic</em> under <s>strike</s>", "its marks (Google Docs' underline lost)");
const sheet = blocksOf({ "text/html": sample("excel").html, "text/plain": sample("excel").text });
assert.deepEqual(sheet, [{ type: "table", rows: [["Name", "Score"], ["Bob", "88"]], outside: true }], "Excel's cells a table, from elsewhere (一键优化 as it comes in)");
const wiki = blocksOf({ "text/html": sample("wiki-table").html, "text/plain": sample("wiki-table").text })[0];
assert.ok(wiki.header && wiki.rows.length === 4 && wiki.rows[2][1] === "" && wiki.rows[1][0].includes('href="https://en.wikipedia.org/wiki/Tokyo"'), "spans spread, a header row, links kept");
const wordBlocks = blocksOf({ "text/html": sample("word-basic").html, "text/plain": sample("word-basic").text });
assert.equal(brief(wordBlocks), "heading1 paragraph bullets[item[bullets[item]]] numbers[item item] table", "Word: its fake lists made lists, nested");

// The Word filter (import/office.mjs) on small bodies of Word's HTML, what it writes for the importer,
// for what the samples above do not pin: Word's source wrapped at about 80 characters, tabs, hidden text,
// conditional comments, breaks, paragraph styles, styles made tags, colors handed over, review comments,
// footnotes, Office's self-closing tags, lists (from level 2, in a cell, three levels deep, numbered from
// 5), merged cells, a paragraph of nothing but Word's spacer runs; then divs holding text, white text,
// file: links to a place, unclosed conditional comments, PowerPoint's text, numbered or bulleted lists by
// their markers and definitions, and input built to stall it.
const wordDocument = (body) => `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta name=ProgId content=Word.Document></head><body>${body}</body></html>`;
// A list paragraph as Word writes it: its list and level in its style, its marker in a conditional comment.
const wordItem = (level, glyph, words, font = "") => `<p class=MsoListParagraph style='margin-left:${18 * level}.0pt;text-indent:-18.0pt;mso-list:l0 level${level} lfo1'><![if !supportLists]><span${font && ` style='font-family:${font}'`}><span style='mso-list:Ignore'>${glyph}<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span></span><![endif]>${words}<o:p></o:p></p>`;
const nestedThree = [wordItem(1, "·", "一级", "Symbol"), wordItem(2, "o", "二级", '"Courier New"'), wordItem(3, "§", "三级", "Wingdings"), wordItem(3, "§", "又一个三级", "Wingdings"), wordItem(1, "·", "回到一级", "Symbol")].join("\r\n");
const fromFive = [wordItem(1, "5.", "<span lang=EN-US>Step five</span>"), wordItem(1, "6.", "<span lang=EN-US>Step six</span>")].join("");
const mergedCells = "<table class=MsoTableGrid border=1 cellspacing=0 cellpadding=0 style='border-collapse:collapse;border:none'><tr style='mso-yfti-irow:0;mso-yfti-firstrow:yes'><td width=200 colspan=2 valign=top style='width:150pt;border:solid windowtext 1.0pt'><p class=MsoNormal align=center style='text-align:center'>合并<o:p></o:p></p></td><td width=100 rowspan=2 style='width:75pt'><p class=MsoNormal>竖<o:p></o:p></p></td></tr><tr><td width=100><p class=MsoNormal>a<o:p></o:p></p></td><td width=100><p class=MsoNormal><o:p>&nbsp;</o:p></p></td></tr></table>";
const spacerOnly = "<p class=MsoNormal><span style='mso-spacerun:yes'>&nbsp;&nbsp;&nbsp; </span><o:p></o:p></p><p class=MsoNormal>后</p>";
const linked = `<p class=MsoNormal><span style='color:#C00000'>红</span><span style='background:yellow;mso-highlight:yellow'>黄</span><a href="https://x.test/"><span style='color:#0563C1;text-decoration:underline'>链</span></a></p>`;
for (const [body, expected, what, options] of [
  ["<p class=MsoNormal>one\r\ntwo</p>", "<p>one two</p>", "a line break of the source a space"],
  ["<p class=MsoNormal>第一\r\n第二</p>", "<p>第一第二</p>", "none between Chinese characters"],
  ["<p class=MsoNormal>한국어\r\n문장</p>", "<p>한국어 문장</p>", "a space between Korean words"],
  ["<p class=MsoNormal>\r\n<span>one \r\n</span>\r\n<b> two</b> </p>\r\n<p class=MsoNormal>three</p>", "<p>one <b>two</b></p><p>three</p>", "a run of spaces over several nodes one, none at a block's edges or between blocks"],
  ["<p class=MsoNormal>名称<span style='mso-tab-count:1'>&nbsp;&nbsp;&nbsp; </span>值</p>", "<p>名称 值</p>", "a tab one space"],
  ["<p class=MsoNormal>看得见<span style='display:none;mso-hide:all'>看不见</span></p>", "<p>看得见</p>", "hidden text goes"],
  ["<table><tr><td><p class=MsoNormal>a</p></td></tr><![if !supportMisalignedColumns]><tr height=0><td width=100 style='border:none'></td></tr><![endif]></table>", "<table><tbody><tr><td><p>a</p></td></tr></tbody></table>", "the row for misaligned columns goes"],
  ["<p class=MsoNormal>行一<br style='mso-special-character:line-break'><![if !supportLineBreakNewLine]><br style='mso-special-character:line-break'><![endif]></p>", "<p>行一<br></p>", "a line break at a paragraph's end once"],
  ["<p class=MsoNormal>前</p><span><br clear=all style='page-break-before:always'></span><p class=MsoNormal>后</p>", "<p>前</p><p>后</p>", "a page break goes"],
  [`<h1 style='mso-list:l0 level1 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>1.<span style='font:7.0pt "Times New Roman"'>&nbsp;&nbsp; </span></span><![endif]>引言</h1>`, "<h1>1. 引言</h1>", "a numbered heading keeps its number"],
  [`<h1 style='mso-list:l0 level1 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>一、</span><![endif]>总则</h1><h2 style='mso-list:l0 level2 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>（一）<span style='font:7.0pt "Times New Roman"'>&nbsp; </span></span><![endif]>范围</h2><h2 style='mso-list:l0 level2 lfo1'><![if !supportLists]><span style='mso-list:Ignore'>1.1</span><![endif]>背景</h2>`, "<h1>一、总则</h1><h2>（一）范围</h2><h2>1.1 背景</h2>", "a heading's number: one space after it, none after a full-width mark"],
  ["<p class=MsoTitle>标题<o:p></o:p></p><p class=a style='mso-outline-level:2'>二级</p>", "<h1>标题</h1><h2>二级</h2>", "Title a heading 1, an outline level its heading"],
  ["<p class=MsoQuote>甲</p><p class=MsoQuote>乙</p>", "<blockquote><p>甲</p><p>乙</p></blockquote>", "Quote paragraphs one quote"],
  [`<p class=MsoNormal><!--[if gte vml 1]><v:shape><v:imagedata src="file:///C:/x/image001.png" o:title=""/></v:shape><![endif]--><![if !vml]><img width=133 height=40 src="file:///C:/x/image002.png" v:shapes="_x0000_i1025"><![endif]></p>`, `<p><img width="133" height="40" src="file:///C:/x/image002.png"></p>`, "a picture's fallback kept, its VML gone"],
  ["<p class=MsoNormal><span style='font-weight:bold'>粗</span><span style='font-style:italic'>斜</span><span style='text-decoration:underline'>下</span><span style='text-decoration:line-through'>删</span>x<span style='vertical-align:super'>2</span></p>", "<p><b>粗</b><i>斜</i><u>下</u><s>删</s>x<sup>2</sup></p>", "styles made tags"],
  ["<p class=MsoNormal><span style='font-size:26.0pt'>大字</span>正文</p>", "<p>大字正文</p>", "a font size goes (no heading in mid-paragraph)"],
  [linked, `<p><span data-paste-color="#C00000">红</span><span data-paste-background="yellow">黄</span><a href="https://x.test/">链</a></p>`, "colors handed over, not a link's", { colors: true }],
  [linked, `<p>红黄<a href="https://x.test/">链</a></p>`, "without colors none"],
  [`<p class=MsoNormal>正文<span class=MsoCommentReference><![if !supportAnnotations]><a class=msocomanchor id="_anchor_1" href="#_msocom_1" name="_msoanchor_1">[A1]</a><![endif]><span style='mso-special-character:comment'>&nbsp;</span></span></p><div style='mso-element:comment-list'><div style='mso-element:comment'><p class=MsoCommentText>批注</p></div></div>`, "<p>正文</p>", "review comments go"],
  [`<p class=MsoNormal>正文<a style='mso-footnote-id:ftn1' href="#_ftn1" name="_ftnref1" title=""><span style='mso-special-character:footnote'><![if !supportFootnotes]>[1]<![endif]></span></a></p><div style='mso-element:footnote-list'><![if !supportFootnotes]><br clear=all><hr align=left size=1 width="33%"><![endif]><div style='mso-element:footnote' id=ftn1><p class=MsoFootnoteText><a href="#_ftnref1" name="_ftn1">[1]</a> 脚注的话</p></div></div>`, `<p>正文<a href="#_ftn1">[1]</a></p><hr><p><a href="#_ftnref1">[1]</a> 脚注的话</p>`, "footnotes kept after a divider"],
  [`<p class=MsoNormal>前<o:lock v:ext="edit"/>后</p>`, "<p>前后</p>", "a self-closing Office tag takes nothing with it"],
  ["<p style='mso-list:l0 level2 lfo1'><span style='mso-list:Ignore'>a)<span>&nbsp; </span></span>乙</p><p style='mso-list:l0 level3 lfo1'><span style='mso-list:Ignore'>i.<span>&nbsp; </span></span>丙</p><p style='mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>1.<span>&nbsp; </span></span>甲</p>", "<ol><li><p> 乙</p><ol><li><p> 丙</p></li></ol></li><li><p> 甲</p></li></ol>", "a list copied from level 2 starts at the top"],
  ["<table><tr><td><p class=MsoListParagraph style='mso-list:l3 level1 lfo4'><span style='font-family:Symbol;mso-list:Ignore'>·<span>&nbsp; </span></span>格里</p></td></tr></table>", "<table><tbody><tr><td><ul><li><p> 格里</p></li></ul></td></tr></tbody></table>", "a list in a cell"],
  [nestedThree, "<ul><li><p> 一级</p><ul><li><p> 二级</p><ul><li><p> 三级</p></li><li><p> 又一个三级</p></li></ul></li></ul></li><li><p> 回到一级</p></li></ul>", "three levels deep and back"],
  [fromFive, `<ol start="5"><li><p> Step five</p></li><li><p> Step six</p></li></ol>`, "a list numbered from 5 numbered from 5, its markers gone"],
  [mergedCells, `<table><tbody><tr><td colspan="2"><p>合并</p></td><td rowspan="2"><p>竖</p></td></tr><tr><td><p>a</p></td><td><p>&nbsp;</p></td></tr></tbody></table>`, "merged cells keep their spans"],
  [`<h1><a name="_Toc1">第一章</a></h1><p class=MsoNormal><st1:chsdate Year="2026">2026年11月21日</st1:chsdate></p>`, "<h1>第一章</h1><p>2026年11月21日</p>", "bookmarks and smart tags unwrapped"],
  ["<p class=MsoNormal><o:p>&nbsp;</o:p></p><p class=MsoNormal></p>", "<p>&nbsp;</p><p>&nbsp;</p>", "empty paragraphs one &nbsp; each"],
  [spacerOnly, "<p>&nbsp;</p><p>后</p>", "a paragraph of spacer runs is an empty one"],
  ["<p class=MsoNormal>甲<span style='mso-spacerun:yes'>&nbsp;&nbsp; </span>乙</p>", "<p>甲&nbsp;&nbsp; 乙</p>", "spacer runs in text kept as written"],
  ["<pre>a\n  b</pre>", "<pre>a\n  b</pre>", "preformatted text as it is"],
]) assert.equal(W.filterWordContent(wordDocument(body), options), expected, `Word filter: ${what}`);
for (const input of ["", "<p", '<html xmlns:w="urn:schemas-microsoft-com:office:word">', null]) assert.equal(typeof W.filterWordContent(input), "string", `Word filter: never throws (${input})`);
assert.ok(W.isWordContent('<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta name=Generator content="Microsoft Word 15 (filtered medium)"></head><body><p>x</p></body></html>'), "Outlook's HTML is Word's");
assert.ok(!W.isWordContent(sample("excel").html), "Excel's is not");
assert.ok(!W.isWordContent('<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta name=Generator content="Microsoft Excel 15"></head><body><table><tr><td class=xl65 style="mso-number-format:0%">5%</td></tr></table></body></html>'), "nor any spreadsheet's");
// What the page makes of them.
const fromWord = (body) => blocksOf({ "text/html": wordDocument(body), "text/plain": "a\nb" });
assert.equal(brief(fromWord(nestedThree)), "bullets[item[bullets[item[bullets[item item]]]] item]", "Word: three levels of a list");
assert.deepEqual(fromWord(fromFive).map((list) => [list.type, list.start, list.blocks.map((item) => item.html)]), [["numbers", "5", ["Step five", "Step six"]]], "Word: a list numbered from 5 starts at 5");
assert.deepEqual(fromWord(mergedCells).map((table) => table.rows), [[["合并", "", "竖"], ["a", "", ""]]], "Word: merged cells spread, an empty cell's &nbsp; no word");
assert.deepEqual(fromWord(spacerOnly + "<p class=MsoNormal><b>粗</b></p>").map((block) => block.html), ["后", "<strong>粗</strong>"], "Word: a paragraph of spacer runs makes no block");
// Divs, colors, links and conditional comments, after the filter's review (2026-11-21).
for (const [body, expected, what, options] of [
  ["<div>一行字</div><div><span>又一行</span></div>", "<p>一行字</p><p>又一行</p>", "a div holding a line of text a paragraph"],
  ["<div class=WordSection1>前面的字<table><tr><td><p class=MsoNormal>格</p></td></tr></table><span>后</span>面<br>的字</div>", "<p>前面的字</p><table><tbody><tr><td><p>格</p></td></tr></tbody></table><p>后面<br>的字</p>", "words beside a div's blocks paragraphs of their own"],
  ["<div style='mso-element:footnote-list'><![if !supportFootnotes]><br clear=all><hr align=left size=1 width='33%'><![endif]><div style='mso-element:footnote' id=ftn1><p class=MsoFootnoteText>脚注</p></div></div>", "<hr><p>脚注</p>", "a div's line break alone no paragraph"],
  ["<p class=MsoNormal><span style='color:white'>白</span><span style='color:#FFFFFF'>白</span><font color='#f5f5f5'>白</font><span style='color:rgb(255, 255, 255)'>白</span><span style='color:#BFBFBF'>灰</span></p>", `<p>白白白白<span data-paste-color="#BFBFBF">灰</span></p>`, "white text no color (its shading is not carried), gray kept", { colors: true }],
  [`<p class=MsoNormal><a href="file:///C:/Users/x/Documents/report.docx#_ftn1">[1]</a><a href="file:///C:/Users/x/a.docx">别的文件</a></p>`, `<p><a href="#_ftn1">[1]</a><a href="file:///C:/Users/x/a.docx">别的文件</a></p>`, "a file: address with a place the place"],
  ["<p class=MsoNormal>甲<![if !supportLists]>乙<![if !supportLineBreakNewLine]><br><![endif]>丙</p>", "<p>甲乙丙</p>", "an [if] with no [endif] before the next goes alone"],
]) assert.equal(W.filterWordContent(wordDocument(body), options), expected, `Word filter: ${what}`);
// PowerPoint copies its text as Office's HTML too: a div for each paragraph, its bullet a span styled
// mso-special-format:bullet, its level in its indent, sizes of 28pt (written by hand from that format).
const slide = (body) => `<html xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:p="urn:schemas-microsoft-com:office:powerpoint" xmlns="http://www.w3.org/TR/REC-html40"><head><meta name=ProgId content=PowerPoint.Slide><meta name=Generator content="Microsoft PowerPoint 15"><style><!--tr {mso-height-source:auto;} --></style></head><body lang=ZH-CN style='tab-interval:36.0pt'><!--StartFragment-->${body}<!--EndFragment--></body></html>`;
const slideLine = (words, left, bullet = true) => `<div style='mso-line-spacing:"90 20 0";mso-margin-left-alt:${left};mso-text-indent-alt:-216;\r\nmso-char-wrap:1;mso-kinsoku-overflow:1'>${bullet ? "<span style='font-family:Arial;\r\nmso-special-format:bullet;color:black;mso-color-index:1'>•</span>" : ""}<span\r\nstyle='font-size:28.0pt;font-family:等线;color:black;mso-color-index:1;language:zh-CN'>${words}</span></div>\r\n\r\n`;
const slideText = (body, plain) => ({ "text/html": slide(body), "text/plain": plain });
assert.ok(W.isWordContent(slide(slideLine("甲", 216))), "PowerPoint's HTML goes through the filter");
assert.equal(W.filterWordContent(slide(slideLine("保存更快", 216) + slideLine("冲突更少", 216))), "<ul><li><p>保存更快</p></li><li><p>冲突更少</p></li></ul>", "PowerPoint: its bullets a list");
assert.equal(W.filterWordContent(slide(slideLine("一级", 216) + slideLine("二级", 576) + slideLine("又一个二级", 576) + slideLine("回到一级", 216))),
  "<ul><li><p>一级</p><ul><li><p>二级</p></li><li><p>又一个二级</p></li></ul></li><li><p>回到一级</p></li></ul>", "PowerPoint: levels by indent");
const slideBlocks = blocksOf(slideText(slideLine("标题", 0, false) + slideLine("保存更快", 216) + slideLine("冲突更少", 216), "标题\n• 保存更快\n• 冲突更少"));
assert.deepEqual(slideBlocks.map((block) => [block.type, block.html ?? block.blocks.map((item) => item.html)]), [["paragraph", "标题"], ["bullets", ["保存更快", "冲突更少"]]], "PowerPoint pasted: a paragraph and a list (no heading from 28pt, no empty item from a bullet)");
assert.deepEqual(blocksOf(slideText(["第一段文字", "第二段文字", "第三段"].map((words) => slideLine(words, 0, false)).join(""), "第一段文字\n第二段文字\n第三段")).map((block) => block.html), ["第一段文字", "第二段文字", "第三段"], "PowerPoint pasted: its paragraphs apart");
// A PowerPoint paragraph's marker says itself whether it is a bullet or a number (mso-special-format bullet
// or numbullet), whatever its glyph.
const slideMarked = (words, glyph, format, font = "Arial") => `<div style='mso-margin-left-alt:216;mso-text-indent-alt:-216'><span style='font-family:${font};mso-special-format:${format}'>${glyph}</span><span style='font-size:28.0pt'>${words}</span></div>`;
assert.equal(W.filterWordContent(slide(slideMarked("甲", "–", "bullet") + slideMarked("乙", "§", "bullet", "Wingdings") + slideMarked("丙", "■", "bullet"))), "<ul><li><p>甲</p></li><li><p>乙</p></li><li><p>丙</p></li></ul>", "PowerPoint: a bullet list stays bulleted, whatever its glyphs");
assert.equal(W.filterWordContent(slide(slideMarked("甲", "1.", "numbullet") + slideMarked("乙", "2.", "numbullet"))), "<ol><li><p>甲</p></li><li><p>乙</p></li></ol>", "PowerPoint: a numbered list numbered");
assert.deepEqual(blocksOf(slideText(slideMarked("保存更快", "–", "bullet") + slideMarked("冲突更少", "–", "bullet"), "保存更快\n冲突更少")).map((block) => block.type), ["bullets"], "PowerPoint pasted: its bullets a bulleted list");

// Numbered or bulleted (office.mjs numberingOf), whether or not white space follows the marker. Lists as
// WPS writes them, the marker alone in its span: a number of each kind is numbered, from its first number;
// anything else is a bullet. Word's own "follow number with: nothing" the same. A list's definition in
// Word's style sheet (@list l0:level1) says first. Only list paragraphs are lists.
const wpsItem = (level, marker, words) => `<p class=MsoNormal style="mso-list:l0 level${level} lfo1;"><span style="font-family:宋体;mso-list:Ignore;">${marker}</span><span style="font-family:宋体;">${words}</span></p>`;
const bareItem = (list, marker, words, font = "") => `<p class=MsoListParagraph style='margin-left:21.0pt;text-indent:-21.0pt;mso-list:l${list} level1 lfo${list + 1}'><![if !supportLists]><span${font && ` style='font-family:${font}'`}><span style='mso-list:Ignore'>${marker}</span></span><![endif]>${words}<o:p></o:p></p>`;
const two = (first, second) => wpsItem(1, first, "甲") + wpsItem(1, second, "乙");
const numbered = (start = "") => `<ol${start && ` start="${start}"`}><li><p>甲</p></li><li><p>乙</p></li></ol>`;
const bulleted = "<ul><li><p>甲</p></li><li><p>乙</p></li></ul>";
for (const [body, expected, what] of [
  [two("1.", "2."), numbered(), "1. numbered"],
  [two("1)", "2)"), numbered(), "1) numbered"],
  [two("(1)", "(2)"), numbered(), "(1) numbered"],
  [two("（1）", "（2）"), numbered(), "（1） numbered"],
  [two("1、", "2、"), numbered(), "1、 numbered"],
  [two("a.", "b."), numbered(), "a. numbered"],
  [two("A)", "B)"), numbered(), "A) numbered"],
  [two("i.", "ii."), numbered(), "i. numbered (roman 1)"],
  [two("IV.", "V."), numbered("4"), "IV. numbered from 4"],
  [two("c)", "d)"), numbered("3"), "c) numbered from 3"],
  [two("一、", "二、"), numbered(), "一、 numbered"],
  [two("（一）", "（二）"), numbered(), "（一） numbered"],
  [two("十二、", "十三、"), numbered("12"), "十二、 numbered from 12"],
  [two("三、", "四、"), numbered("3"), "三、 numbered from 3"],
  [two("①", "②"), numbered(), "① numbered"],
  [two("⑤", "⑥"), numbered("5"), "⑤ numbered from 5"],
  [two("第一章", "第二章"), numbered(), "第一章 numbered"],
  [two("5.", "6."), numbered("5"), "5. numbered from 5"],
  ...["•", "o", "-", "*", "■"].map((glyph) => [two(glyph, glyph), bulleted, `${glyph} bulleted`]),
  ...[["§", "Wingdings"], ["Ø", "Wingdings"], ["l", "Wingdings"], ["·", "Symbol"], ["o", '"Courier New"']].map(([glyph, font]) => [bareItem(0, glyph, "甲", font) + bareItem(0, glyph, "乙", font), bulleted, `${glyph} in ${font} bulleted`]),
  [bareItem(0, "一、", "甲") + bareItem(0, "二、", "乙"), numbered(), "Word's number followed by nothing numbered"],
  [wordItem(1, "1.", "一") + wordItem(2, "·", "甲", "Symbol") + wordItem(2, "·", "乙", "Symbol") + wordItem(1, "2.", "二"), "<ol><li><p> 一</p><ul><li><p> 甲</p></li><li><p> 乙</p></li></ul></li><li><p> 二</p></li></ol>", "a numbered item's bullets nested in it"],
  [wpsItem(1, "1.", "一") + wpsItem(2, "a.", "甲") + wpsItem(2, "b.", "乙") + wpsItem(1, "2.", "二"), "<ol><li><p>一</p><ol><li><p>甲</p></li><li><p>乙</p></li></ol></li><li><p>二</p></li></ol>", "WPS's levels nested, numbered"],
  ["<p class=MsoNormal>2026. 这一年很忙</p><p class=MsoNormal>1. 不是列表</p><p>3、也不是</p>", "<p>2026. 这一年很忙</p><p>1. 不是列表</p><p>3、也不是</p>", "a paragraph that begins with a number, no mso-list, a paragraph"],
]) assert.equal(W.filterWordContent(wordDocument(body)), expected, `Word filter: ${what}`);
// Word's list definitions: the format (alpha-lower, roman-lower, none written for decimal, bullet,
// ordinal-text) and the start.
const listRules = "<style><!--\r\n/* List Definitions */\r\n@list l0\r\n\t{mso-list-id:1;\r\n\tmso-list-type:hybrid;}\r\n"
  + "@list l0:level1\r\n\t{mso-level-number-format:alpha-lower;\r\n\tmso-level-tab-stop:none;}\r\n@list l1:level1\r\n\t{mso-level-number-format:roman-lower;}\r\n"
  + "@list l2:level1\r\n\t{mso-level-text:\"Step %1\\:\";\r\n\tmso-level-tab-stop:none;}\r\n@list l3:level1\r\n\t{mso-level-number-format:bullet;\r\n\tmso-level-text:\\F0A7;\r\n\tfont-family:Wingdings;}\r\n"
  + "@list l4:level1\r\n\t{mso-level-number-format:ordinal-text;\r\n\tmso-level-start-at:3;}\r\n--></style>";
const defined = (body) => wordDocument(body).replace("</head>", `${listRules}</head>`);
for (const [body, expected, what] of [
  [bareItem(0, "i.", "甲") + bareItem(0, "j.", "乙"), numbered("9"), "alpha-lower: i. is the ninth letter"],
  [bareItem(1, "i.", "甲") + bareItem(1, "ii.", "乙"), numbered(), "roman-lower: i. is 1"],
  [bareItem(2, "Step 1:", "甲") + bareItem(2, "Step 2:", "乙"), numbered(), "no format written: Word's decimal, words around the number"],
  [bareItem(3, "1.", "甲") + bareItem(3, "2.", "乙"), bulleted, "bullet: the definition decides before the marker's text"],
  [bareItem(4, "Third", "甲") + bareItem(4, "Fourth", "乙"), numbered("3"), "ordinal-text: numbered from the definition's start"],
]) assert.equal(W.filterWordContent(defined(body)), expected, `Word filter, list definitions: ${what}`);
assert.equal(W.filterWordContent(wordDocument(bareItem(2, "Step 1:", "甲") + bareItem(2, "Step 2:", "乙"))), bulleted, "Word filter: words around a number, with no definition, bulleted");
assert.deepEqual(fromWord(two("三、", "四、")).map((list) => [list.type, list.start, list.blocks.map((item) => item.html)]), [["numbers", "3", ["甲", "乙"]]], "WPS: a list from 三、 numbered from 3");
assert.equal(brief(fromWord(wordItem(1, "1.", "一") + wordItem(2, "·", "甲", "Symbol") + wordItem(2, "·", "乙", "Symbol") + wordItem(1, "2.", "二"))), "numbers[item[bullets[item item]] item]", "Word: a numbered item holding bullets");
assert.deepEqual(fromWord("<p class=MsoNormal>2026. 这一年<b>很忙</b></p><p class=MsoNormal>下一段</p>").map((block) => [block.type, block.html]), [["paragraph", "2026. 这一年<strong>很忙</strong>"], ["paragraph", "下一段"]], "Word: a paragraph that begins with a number a paragraph");
// Clipboard HTML a page wrote to stall the editor: each string test reads its input once.
for (const hostile of ["<a class=".repeat(30000), "<meta ".repeat(50000), "<a style='".repeat(30000), `<meta content=${" ".repeat(300000)}x>`,
  wordDocument("<o:x ".repeat(60000)), wordDocument('<o:x "'.repeat(50000)), wordDocument(`<p><span style='background:${"a( ".repeat(100000)}'>x</span></p>`),
  slide(`<div style='margin-left:${"1".repeat(300000)}x'><span style='mso-special-format:bullet'>•</span>a</div>`),
  // the style sheet's list definitions and a marker's number
  ...[`${"@list l0:level1 {".repeat(40000)}`, "@list ".repeat(60000), `@list l${"0".repeat(300000)}:`, `@list l0:level1 {${"mso-level-text:'".repeat(50000)}}`, `@list l0 :${" ".repeat(300000)}level1`]
    .map((rules) => wordDocument(`<p style='mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>1.</span>x</p>`).replace("</head>", `<style>${rules}</style></head>`)),
  wordDocument(`<p style='mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>${"1.".repeat(150000)}</span>x</p>`),
  wordDocument(`<p style='mso-list:l0 level1 lfo1'><span style='mso-list:Ignore'>${"一".repeat(300000)}、</span>x</p>`)]) {
  const started = performance.now();
  W.isWordContent(hostile);
  W.filterWordContent(hostile, { colors: true });
  const took = performance.now() - started;
  assert.ok(took < 1500, `Word filter: ${hostile.slice(0, 40)}… (${hostile.length} characters) took ${Math.round(took)} ms`);
}
const code = blocksOf({ "text/html": sample("code").html, "text/plain": sample("code").text });
assert.deepEqual(code, [{ type: "code", text: "const a = 1;\nconsole.log(a);", language: "javascript" }], "code in the kit's language");
const tasks = blocksOf({ "text/html": sample("github-tasks").html, "text/plain": sample("github-tasks").text });
assert.equal(brief(tasks), "todo[item item] bullets[item]");
assert.ok(tasks[0].blocks[0].checked && !tasks[0].blocks[1].checked, "GitHub's checkboxes");
const media = blocksOf({ "text/html": sample("quote-details-figure").html, "text/plain": sample("quote-details-figure").text });
assert.equal(brief(media), "quote[paragraph paragraph] details[paragraph] paragraph image divider", "quote, disclosure, a figure's caption and picture, divider (an iframe goes)");
assert.deepEqual(media[3], { type: "image", src: "https://example.com/a.png", caption: "caption here" });
const gptBlocks = blocksOf({ "text/plain": fixture("ai-gpt.md") });
const all2 = (blocks) => blocks.flatMap((b) => [b, ...all2(b.blocks ?? []), ...all2(b.lists ?? [])]);
assert.equal(all2(gptBlocks).filter((b) => b.type === "math").length, 9, "GPT's display formulas formula blocks");
assert.equal((JSON.stringify(gptBlocks).match(/doc-math-inline/g) ?? []).length, 18, "its inline formulas the kit's formulas");
const colored = blocksOf({ "text/html": '<p><span style="color:#ff0000">红</span><b>粗</b></p><p>二</p>', "text/plain": "a\nb", "application/x-vnd.google-docs-document-slice-clip+wrapped": "{}" });
assert.equal(colored[0].html, '<span class="doc-text-red">红</span><strong>粗</strong>', "colors as the kit's");

// An AI answer's cards (import/cards.mjs): ChatGPT's copy writes them as bare nested divs. The sample
// is written after the user's two copies of 2026-11-20 (their structures, other words): a diagram of
// layers (a card of lines, an arrow's line, cards holding a row of small cells and a 2 × 2 of cells),
// a card above a 2 × 2 of cards, a flow of cards between empty divs, scenes beside their pictures'
// links (long: one under another), a mock page holding a heading (no card), a caption above a table.
const shape = (blocks) => blocks.map((b) => b.type === "columns" ? `columns(${b.columns.map((c) => shape(c.blocks)).join(" | ")})`
  : b.type + (b.blocks ? `[${shape(b.blocks)}]` : b.lists?.length ? `[${shape(b.lists)}]` : "")).join(" ");
const answer = fixture("ai-cards.html");
// Its text/plain as ChatGPT's: a block's words a paragraph of their own.
const answerText = [...new JSDOM(answer).window.document.querySelectorAll("p, h1, h2, h3, li > div")].map((block) => block.textContent).join("\n\n");
const cards = blocksOf({ "text/html": answer, "text/plain": answerText });
const p = (n) => Array(n).fill("paragraph").join(" ");
assert.equal(shape(cards), [
  "paragraph quote[paragraph] bullets[item item] heading2",
  `highlight[${p(3)}] paragraph`,
  `highlight[${p(2)} columns(paragraph | paragraph | paragraph) columns(paragraph | paragraph | paragraph) paragraph]`,
  `highlight[${p(2)} columns(${p(2)} | ${p(2)}) columns(${p(2)} | ${p(2)}) paragraph]`,
  "highlight[paragraph columns(paragraph | paragraph | paragraph)]",
  "paragraph table heading2",
  `highlight[${p(2)}] columns(highlight[${p(2)}] | highlight[${p(2)}]) columns(highlight[${p(2)}] | highlight[${p(2)}])`,
  "numbers[item item] paragraph",
  `paragraph highlight[${p(2)}] highlight[${p(2)}] highlight[${p(2)}]`,
  `heading2 highlight[${p(5)}] highlight[${p(4)}] paragraph`,
  `heading2 heading1 paragraph highlight[${p(2)}] highlight[${p(3)}] columns(highlight[${p(2)}] | highlight[${p(2)}])`,
  "heading3 paragraph table paragraph",
].join(" "), "an AI answer's cards highlight blocks, its rows of cells columns, the rest as before");
const panels = all2(cards).filter((b) => b.type === "highlight");
assert.ok(panels.every((b) => b.blocks[0].type !== "icon"), "a card's highlight block has no icon");
assert.equal(panels[1].blocks[1].html, "<strong>书架与借阅规则</strong>", "a card's lines keep their marks");
assert.equal(panels.find((b) => b.blocks[1]?.html === "<strong>1. 周末故事会</strong>").blocks[0].html, '<a href="https://example.com/pictures/reading-corner.png?purpose=inline">A cozy reading corner with shelves</a>', "a scene's picture link a line of its card");
assert.equal(cards.find((b) => b.type === "numbers").blocks[0].html, "<strong>读者登记</strong><br>留下姓名和电话，领一张借书卡。", "an item's divs unwrapped as before (its paragraphs lines of its text)");
assert.ok(!JSON.stringify(cards).includes("data-"), "nothing of the copy's left in the blocks");
// Only bare HTML: every sample of the two corpora (web pages, Word, Google Docs, Notion, Feishu, Yuque,
// GitHub, ChatGPT's code, editors' line divs…) reads as without the rule.
const corpora = [...HTML_PASTE_CORPUS];
for (const file of ["foreign-html-1.mjs", "foreign-html-2.mjs"]) corpora.push(...(await import(`./fixtures/paste/${file}`)).FOREIGN_HTML);
for (const each of corpora) {
  // Word's and WPS's through the Word filter first, as a paste reads them (read.mjs).
  const html = office.test(each.html) && W.isWordContent(each.html) ? W.filterWordContent(each.html, { colors: true }) : each.html;
  const parse = () => H.parseClipboardHTML(html, { base: BASE });
  assert.deepEqual(H.htmlToBlocks(parse(), { cards: true }), H.htmlToBlocks(parse()), `${each.name}: no cards`);
  assert.equal(H.containsRichFormatting(parse(), { cards: true }), H.containsRichFormatting(parse()), `${each.name}: as rich as before`);
}
const shapeOf = (html) => shape(blocksOf({ "text/html": html, "text/plain": "a\nb" }));
const twoCards = "<div><div><p>甲</p><p>一</p></div><div><p>乙</p><p>二</p></div></div>";
for (const [html, expected, what] of [
  [`<p>前</p>${twoCards}<p>后</p>`, "paragraph columns(highlight[paragraph paragraph] | highlight[paragraph paragraph]) paragraph", "two cards side by side"],
  ["<p>前</p><div><p><strong>优点</strong></p><ul><li>快</li><li>省</li></ul></div><p>后</p>", "paragraph highlight[paragraph bullets[item item]] paragraph", "a card holding a list"],
  ["<div><div><div><p>V01</p><p>登记</p></div></div><div><div><p>V02</p><p>上架</p></div></div></div>", "columns(highlight[paragraph paragraph] | highlight[paragraph paragraph])", "a grid copied alone"],
  ["<p>前</p><div><div><p>一</p></div><div><p>二</p></div><div><p>三</p></div><div><p>四</p></div><div><p>五</p></div></div>", "paragraph columns(paragraph | paragraph | paragraph) columns(paragraph | paragraph)", "five small cells: 3 + 2"],
  ["<div><p>V01</p><p>登记</p></div><div><p>V02</p><p>上架</p></div>", "columns(highlight[paragraph paragraph] | highlight[paragraph paragraph])", "a row of cards at the clipboard's top"],
]) assert.equal(shapeOf(html), expected, what);
const officeCards = kindOf({ "text/html": `<html xmlns:o="urn:schemas-microsoft-com:office:office"><body><p>前</p>${twoCards}<p>后</p></body></html>`, "text/plain": "a\nb" });
assert.ok(!JSON.stringify(officeCards).includes('"box"'), "Office's HTML is never read for cards");
// Not cards: the same blocks as without the rule.
for (const [html, what] of [
  [`<p style="margin:0">前</p>${twoCards.replace(/<div>/g, '<div style="display: block;">')}<p>后</p>`, "a web page's divs (Chrome writes their styles)"],
  [`<p>前</p>${twoCards.replace("<div>", '<div class="notion-column_list-block">')}<p>后</p>`, "a class anywhere (Notion's, Feishu's wrappers)"],
  [`<p>前</p>${twoCards.replace("<p>甲", '<p data-block-type="text">甲')}<p>后</p>`, "a data- attribute anywhere"],
  ["<div><div>第一行</div><div>第二行</div></div><div><div>第三行</div><div>第四行</div></div><p>完</p>", "a text editor's lines, each a div"],
  ["<div><div></div><div><div><p>只有</p><p>段落</p><p><strong>的回答</strong></p></div></div></div>", "an answer of paragraphs in its wrappers"],
  ["<ul><li><div><div><p><strong>甲</strong></p><p>一</p></div></div></li><li><div><div><p>乙</p></div></div></li></ul>", "items holding divs"],
  ["<p>前</p><div><h3>小节</h3><p>一</p><p>二</p></div><div><p>说明</p><div><div><table><tbody><tr><td>a</td><td>b</td></tr></tbody></table></div></div></div>", "a section, a caption above a table"],
  ["<div>前言<div><span>甲</span> 的说明</div><div>乙</div></div><p>后</p>", "words straight in divs"],
  [`<div>${["第一段写得很长，长到不像一张小卡片里的标签，而是一页里被包在 div 里的正文段落。", "第二段也一样长，读者复制的是一页文章，每一段都包在自己的 div 里，没有任何样式。"].map((text) => `<div><p>${text}</p></div>`).join("")}</div><p>后</p>`, "paragraphs a page wraps in divs, each long"],
]) {
  const parse = () => H.parseClipboardHTML(html, { base: BASE });
  assert.deepEqual(H.htmlToBlocks(parse(), { cards: true }), H.htmlToBlocks(parse()), `${what}: no cards`);
}
// Into a place that cannot split (a cell, a title) several lines go in as the lines of the blocks
// read() made (clipboard/index.mjs pasteJoined), so colors, formulas and the rest are the single
// line's: one `<p>` for each line.
const { joinedHtml } = await import("../../src/editor/page/clipboard/own/blocks.mjs");
assert.equal(joinedHtml(colored), '<p><span class="doc-text-red">红</span><strong>粗</strong></p><p>二</p>', "a block's text, colors as the kit's");
assert.equal(joinedHtml([{ type: "bullets", blocks: [{ type: "item", html: "一", lists: [{ type: "numbers", blocks: [{ type: "item", html: "一.一", lists: [] }] }] }] }, { type: "code", text: "a<b\nc" }, { type: "math", tex: "x^2" }, { type: "table", rows: [["甲", "乙"]] }, { type: "divider" }]),
  '<p>一</p><p>一.一</p><p>a&lt;b</p><p>c</p><p><span class="doc-math-inline">\\(x^2\\)</span></p><p>甲</p><p>乙</p>', "items with their lists, code's lines, a formula, a table's cells; a divider none");
// Into a table's cell (`lists`): a list a list of the cell's, a list it holds its items after its item, what
// else an item holds its lines; items copied on their own their list's; a numbered list from 3 its lines with their numbers.
assert.equal(joinedHtml([{ type: "heading2", html: "题" }, { type: "bullets", blocks: [{ type: "item", html: "一", lists: [{ type: "numbers", blocks: [{ type: "item", html: "一.一", lists: [] }] }, { type: "paragraph", html: "项里" }] }] }, { type: "item", html: "单独", list: "numbers" }, { type: "numbers", start: "3", blocks: [{ type: "item", html: "三", lists: [] }] }, { type: "todo", blocks: [{ type: "item", html: "待办", checked: true, lists: [] }] }], { lists: true }),
  "<p>题</p><ul><li>一<br>项里</li><li>一.一</li></ul><ol><li>单独</li></ol><p>3. 三</p><ul><li>待办</li></ul>", "a cell's lists");
// Another program's plain text in a cell: its lines as they are, "- " lines a list's, 1. 2. in order a numbered one's, inline Markdown read.
{
  const { cellText } = await import("../../src/editor/page/clipboard/import/to-blocks.mjs");
  assert.equal(cellText("第一\n第二\n\n第三\n"), "第一<br>第二<br><br>第三", "its lines, an empty one kept, the last line break none");
  assert.equal(cellText("- 子一\n* **子二**\n尾"), "<ul><li>子一</li><li><strong>子二</strong></li></ul>尾", "bulleted lines a list, its marks read");
  assert.equal(cellText("1. 甲\n2. 乙\n4. 丁\n2026. 年"), "<ol><li>甲</li><li>乙</li></ol>4. 丁<br>2026. 年", "numbered from 1 in order a list; a number out of order or another start stays as written");
  assert.equal(cellText("a\n\n- x"), "a<br><br><ul><li>x</li></ul>", "an empty line above a list a line break of its own");
}
// Plain text read as Markdown: a numbered list starts at its first line's number, so nothing a line began with is lost
// ("2026. 这一年…" a list numbered from 2026, as typing it makes one); 1 is no start, and later numbers only count on.
{
  const { fromMarkdown } = await import("../../src/editor/page/clipboard/import/markdown.mjs");
  const lists = (text) => toBlocks(fromMarkdown(text)).map((block) => [block.type, block.start ?? null, block.blocks?.map((item) => item.html) ?? block.html]);
  assert.deepEqual(lists("7. 七\n8. 八"), [["numbers", "7", ["七", "八"]]], "pasted text: a list from 7");
  assert.deepEqual(lists("2026. 这一年我们做了很多事。\n下一段"), [["numbers", "2026", ["这一年我们做了很多事。"]], ["paragraph", null, "下一段"]], "pasted text: a line that begins with a number keeps it as its list's start");
  assert.deepEqual(lists("1. 甲\n1. 乙\n5. 丙"), [["numbers", null, ["甲", "乙", "丙"]]], "pasted text: from 1 no start, later numbers not read");
}
const callout = toBlocks([{ type: "callout", title: [], props: { icon: "🚀" }, children: [{ type: "text", title: [["x"]], props: {}, children: [] }] }]);
assert.deepEqual(callout, [{ type: "highlight", blocks: [{ type: "icon", icon: "🚀" }, { type: "paragraph", html: "x" }] }], "a callout a highlight block with its emoji");
// The kit's own flowchart copied from a reader's page (kit-flowchart.html: Chrome's HTML of a
// selection across one in an exported report, each element with its computed style, a step's own
// weight 600 among them): a flowchart of nodes again, each its title (bold as written), its
// description apart and plain, its list, its color; not one bold item of its words run together.
const copiedFlow = blocksOf({ "text/html": fixture("kit-flowchart.html"), "text/plain": "头一句\n甲步\n甲的说明\n乙步\n乙的说明\n项一\n之间" });
assert.deepEqual(copiedFlow.map((block) => block.type), ["paragraph", "flowchart", "paragraph"], "a flowchart between the paragraphs");
assert.deepEqual(copiedFlow[1], { type: "flowchart", blocks: [
  { type: "step", blocks: [{ type: "paragraph", html: "<strong>甲步</strong>" }, { type: "paragraph", html: "甲的说明" }], color: "doc-highlight-blue" },
  { type: "step", blocks: [{ type: "paragraph", html: "<strong>乙步</strong>" }, { type: "paragraph", html: "乙的说明" }, { type: "bullets", blocks: [{ type: "item", html: "项一", lists: [] }] }] },
] }, "its nodes, each its title, its content and its color");
// Written the short way (a step's own words its title, drawn at 600), with its emoji, direction and the flowchart's.
const shortFlow = blocksOf({ "text/plain": "a\nb", "text/html": '<p>前</p><ol class="doc-flow" data-direction="row" start="3"><li style="font-weight: 600" data-direction="column" class="doc-text-red"><div class="doc-icon">📮</div>收集数据<p style="font-weight: 400">从三个平台导出原始日志。</p></li><li style="font-weight: 600"><div class="doc-icon" data-icon="/icons/tabler/circle-number-5_green.svg"></div>回访</li></ol>' });
assert.deepEqual(shortFlow[1], { type: "flowchart", direction: "row", start: "3", blocks: [
  { type: "step", blocks: [{ type: "icon", icon: "📮" }, { type: "paragraph", html: "<strong>收集数据</strong>" }, { type: "paragraph", html: "从三个平台导出原始日志。" }], color: "doc-text-red", direction: "column" },
  { type: "step", blocks: [{ type: "paragraph", html: "<strong>回访</strong>" }] },
] }, "the short form: its own words its bold title, an emoji its icon (a set's icon the document's own: left out), directions and first number kept");
// The converter's own output is not put through the gate made for JSON from the clipboard:
// one block it dislikes no longer turns the whole paste into plain text, nor does how many there are.
const text = (value, extra = {}) => ({ type: "text", title: [[value]], props: {}, children: [], ...extra });
const spec = (type, props = {}, children = [], title = []) => ({ type, title, props, children });
// A callout in a highlight block, as a page copies and exports it: its </aside> closes it alone, and
// a highlight block holds no other (its `nests`), so that one panel holds all of it.
const nestedAside = toBlocks(kindOf({ "text/plain": "<aside>\n💡 头\n\n<aside>\n内提示\n</aside>\n\n尾\n\n</aside>\n\n后段\n\n二段" }).specs);
assert.deepEqual(nestedAside.map((block) => block.type), ["highlight", "paragraph", "paragraph"], "what follows stays outside it");
assert.deepEqual(nestedAside[0].blocks.map((block) => block.html ?? block.icon), ["💡", "头", "内提示", "尾"], "one panel of its words");

const many = toBlocks(Array.from({ length: 600 }, (_, index) => text(`段${index}`)));
assert.equal(many.length, 600, "600 paragraphs of a long page are 600 blocks (no limit of 500)");
assert.equal(checkBlocks(many), null, "while JSON read from the clipboard keeps its limit of 500 blocks");
const spaced = toBlocks([spec("header", {}, [], [["标题"]]), spec("image", { source: "https://example.com/a b.png", caption: [["说明".repeat(2000)]] }), text("后")]);
assert.deepEqual(spaced.map((block) => block.type), ["heading1", "image", "paragraph"], "a picture whose address has a space stays among the blocks around it");
assert.equal(spaced[1].src, "https://example.com/a%20b.png", "its address written as an address is");
assert.equal(spaced[1].caption.length, 2000, "its caption cut to what is kept");
assert.deepEqual(checkBlocks(spaced), spaced, "and they all pass");
assert.deepEqual(toBlocks([spec("image", { source: "file:///c:/a.png" }), spec("embed", { source: "http://example.com/x" }), spec("embed", { source: "https://example.com/a b" }), text("文")]).map((block) => block.type + (block.src ? ":" + block.src : "")),
  ["embed:https://example.com/a%20b", "paragraph"], "an address that is not one (a file, an http page to frame) leaves the block out, an https one with a space is written as one: none of them stops the rest");
// A block a box does not take is made its content: a tabs area in a disclosure, a row of columns in a column.
const tab = (title, ...children) => spec("page", {}, children, [[title]]);
const nested = toBlocks([spec("toggle", {}, [spec("tab", {}, [tab("第一页", text("页里的字")), tab("第二页")])], [["折叠"]])]);
assert.deepEqual(nested, [{ type: "details", html: "折叠", blocks: [{ type: "paragraph", html: "第一页" }, { type: "paragraph", html: "页里的字" }, { type: "paragraph", html: "第二页" }] }], "a tabs area in a disclosure: each tab's name and blocks");
assert.deepEqual(checkBlocks(nested), nested, "which the page takes");
const column = (...blocks) => spec("column", {}, blocks);
const inner = toBlocks([spec("column_list", {}, [column(spec("column_list", {}, [column(text("左左")), column(text("左右"))])), column(text("右"))])]);
assert.deepEqual(inner, [{ type: "columns", columns: [{ blocks: [{ type: "paragraph", html: "左左" }, { type: "paragraph", html: "左右" }] }, { blocks: [{ type: "paragraph", html: "右" }] }] }], "a row of columns in a column: its columns' blocks");
assert.ok(checkBlocks(inner), "which the page takes");
// A flowchart where a box takes none (a quote's paragraphs): its nodes' blocks.
const quoted = toBlocks([spec("report_flow", {}, [spec("report_step", {}, [text("说明")], [["甲"]])])], "quote");
assert.deepEqual(quoted, [{ type: "paragraph", html: "<strong>甲</strong>" }, { type: "paragraph", html: "说明" }], "a flowchart in a quote: its nodes' blocks");
// What the page has none of: an icon, a tab's emoji that is none, more tabs or columns than it writes, a table past its cells, a TeX that closes itself.
const callouts = toBlocks([spec("callout", { icon: "not an icon" }, [text("x")])]);
assert.equal(callouts[0].blocks[0].icon, "💡", "a callout's icon the page has none of: 💡");
const tabs = toBlocks([spec("tab", {}, Array.from({ length: 25 }, (_, index) => spec("page", { icon: index === 0 ? "/icons/x.svg" : "🚀" }, [text("x")], [[`页${index}`]])))])[0];
assert.deepEqual([tabs.tabs.length, "icon" in tabs.tabs[0], tabs.tabs[1].icon], [20, false, "🚀"], "20 tabs at most, an icon that is not an emoji left off");
const wide = spec("table", { table_block_column_order: ["a", "b"] }, Array.from({ length: 4000 }, () => spec("table_row", { cells: { a: [["x"]], b: [["y"]] } })));
assert.equal(toBlocks([wide])[0].rows.length, 2500, "a table cut to the cells the page writes (5000)");
assert.deepEqual(toBlocks([spec("equation", {}, [], [["a\\]b"]])]), [{ type: "paragraph", html: "a\\]b" }], "a TeX that closes its own delimiter stays as text");

// A Notion language name is the kit's id read from the kit's own table (src/shared/code-languages.mjs), none for a language it does not know.
const codeIn = (language) => toBlocks([{ type: "code", title: [["x = 1"]], props: language ? { language } : {}, children: [] }])[0].language;
assert.deepEqual(["Bash", "Shell", "JavaScript", "TypeScript", "YAML", "Markdown", "SQL"].map(codeIn), ["bash", "bash", "javascript", "typescript", "yaml", "markdown", "sql"], "the kit's languages by Notion's names");
assert.deepEqual(["Rust", "Plain Text", "ASCII Art", undefined].map(codeIn), [undefined, undefined, undefined, undefined], "any other: 自动识别");
const split = toBlocks([{ type: "bulleted_list", title: [["a"]], props: {}, children: [{ type: "text", title: [["more"]], props: {}, children: [] }, { type: "code", title: [["x"]], props: {}, children: [] }] }, { type: "bulleted_list", title: [["b"]], props: {}, children: [] }]);
assert.equal(brief(split), "bullets[item] code bullets[item]", "an item's code after its list, the next items a list of their own");
assert.equal(split[0].blocks[0].html, "a<br>more", "an item's paragraph a line of its text");
assert.equal(checkBlocks([{ type: "quote", blocks: [{ type: "heading1", html: "x" }] }]), null, "a quote holds paragraphs only");

// Of what an outside format says of a block the page has no definition of, what it holds stays, at any
// depth, and the rest of the paste stands: the divider is taken out as a component taken out of the
// registry would be, and this still holds with the divider gone.
{
  const { BLOCK_TYPES } = await import("../../src/editor/components/registry.mjs");
  const { divider } = BLOCK_TYPES;
  delete BLOCK_TYPES.divider;
  try {
    const none = (blocks) => JSON.stringify(blocks).includes('"divider"');
    assert.equal(brief(blocksOf({ "text/html": "<p>上面</p><hr><p>下面</p>", "text/plain": "a\nb" })), "paragraph paragraph", "an <hr> of a page leaves itself out");
    assert.equal(brief(blocksOf({ "text/plain": "第一块\n\n---\n\n第二块" })), "paragraph paragraph", "a --- of Markdown too");
    const rule = spec("divider");
    const held = toBlocks([
      spec("toggle", {}, [text("里"), rule], [["折叠"]]),
      spec("callout", { icon: "🚀" }, [rule, text("字")]),
      spec("bulleted_list", {}, [rule, text("下")], [["项"]]),
      spec("column_list", {}, [column(rule, text("左")), column(text("右"))]),
      spec("tab", {}, [tab("页", rule, text("页里的字"))]),
    ], null, { held: true });
    assert.equal(none(held), false, "in a disclosure, a highlight block, a list's item, a column and a tab");
    assert.deepEqual(held.map((block) => block.type), ["details", "highlight", "bullets", "columns", "sheets"], "whose blocks stay");
    assert.ok(checkBlocks(held), "which the page takes");
    assert.deepEqual(held[0].blocks, [{ type: "paragraph", html: "里" }], "the words around it stay");
  } finally {
    if (divider) BLOCK_TYPES.divider = divider;
  }

  // A container taken out of the registry: nothing stops, and what it holds comes as blocks of their own.
  const gone = (types, run) => {
    const kept = Object.fromEntries(types.filter((type) => BLOCK_TYPES[type]).map((type) => [type, BLOCK_TYPES[type]]));
    types.forEach((type) => delete BLOCK_TYPES[type]);
    try {
      return run();
    } finally {
      Object.assign(BLOCK_TYPES, kept);
    }
  };
  assert.equal(gone(["highlight"], () => brief(toBlocks([spec("callout", { icon: "🚀" }, [text("提示"), spec("sub_header", {}, [], [["小题"]])])]))), "paragraph heading2", "a callout's blocks, its icon not among them");
  assert.equal(gone(["highlight"], () => brief(blocksOf({ "text/plain": "<aside>\n💡 粘贴来的提示\n\n</aside>\n\n后段" }))), "paragraph paragraph", "a callout of Markdown");
  assert.equal(gone(["details"], () => JSON.stringify(toBlocks([spec("toggle", {}, [text("里")], [["折叠"]])]).map((block) => block.html))), '["折叠","里"]', "a disclosure's title and blocks");
  assert.equal(gone(["section"], () => brief(toBlocks([spec("section", {}, [spec("sub_header", {}, [], [["第一章"]]), text("章里")])]))), "heading2 paragraph", "a section's blocks");
  assert.equal(gone(["flowchart", "step"], () => brief(toBlocks([spec("report_flow", {}, [spec("report_step", { icon: "🚀" }, [text("步里")], [["一步"]])])]))), "paragraph paragraph", "a flowchart's titles and blocks, its icons not among them");
}

// One reading of a web address (links/address.mjs): an address is http(s):// or www.; a www. address
// pasted alone or bare in a line of Markdown is a link to http://www…;
// typed into the link card it gets the same scheme, and so does a host written alone, which a paste
// leaves as text.
const { addressOf } = await import("../../src/editor/page/links/address.mjs");
const { parseInlineMarkdown } = await import("../../src/editor/page/clipboard/import/inline.mjs");
assert.deepEqual(["www.x.com/a", " http://x.com/a ", "https://x.com", "x.com", "www.", "www.x.com y", "ftp://x.com", "javascript:1"].map(addressOf),
  ["http://www.x.com/a", "http://x.com/a", "https://x.com", null, null, null, null, null], "an address is http(s):// or www. alone; www. gets http://");
assert.deepEqual(parseInlineMarkdown("看 www.x.com/a 吧")[1], ["www.x.com/a", [["a", "http://www.x.com/a"]]], "a bare www. address in a line of Markdown (http://)");
assert.equal(readExternal(clipboard({ "text/plain": "www.x.com/a" }), { base: BASE }).kind, "plain", "a www. address alone stays text (the page links it)");

// An address alone on the clipboard (the page makes a link of it and offers its views): the plain text
// says so, and HTML beside it holds nothing but that link, as Chrome writes a web page's link copied.
const bare = (types) => bareAddress(clipboard(types), { base: BASE });
const url = "https://example.com/a?b=1";
assert.equal(bare({ "text/plain": `  ${url}\n` }), url, "the plain text alone, a line break after it");
assert.equal(bare({ "text/plain": "www.x.com" }), "http://www.x.com", "www. gets its scheme");
assert.equal(bare({ "text/plain": "https://example.com", "text/html": `<meta charset='utf-8'><!--StartFragment--><a href="https://example.com/" style="color: rgb(0, 0, 238); text-decoration: underline;">https://example.com</a><!--EndFragment-->` }), "https://example.com", "a web page's link copied: the same address however its href is written");
assert.equal(bare({ "text/plain": url, "text/html": `<b><a href="${url}">网页的标题</a></b>` }), url, "HTML holding nothing but that link counts, whatever its words");
assert.equal(bare({ "text/plain": url, "text/html": `<div><span style="color: red">${url}</span></div>` }), url, "HTML of the same words, no link in it (a code editor's)");
for (const [html, why] of [
  [`前文 <a href="${url}">${url}</a> 后文`, "words beside the link"],
  [`<a href="https://other.com/">${url}</a>`, "a link to another address"],
  [`<a href="${url}">${url}</a><a href="${url}">${url}</a>`, "two links"],
  [`<a href="${url}"><img src="https://x.test/a.png">${url}</a>`, "a picture in it"],
  [`<p>别的话</p>`, "other words, no link"],
]) assert.equal(bare({ "text/plain": url, "text/html": html }), null, `no address alone: ${why}`);
assert.equal(bare({ "text/plain": "网页的标题", "text/html": `<a href="${url}">网页的标题</a>` }), null, "a link with words of its own is a formatted line, not an address");
assert.equal(bare({ "text/plain": `${url} ${url}` }), null, "two addresses are text");
assert.equal(bare({ "text/plain": "www.example.com/x", "text/html": `<a href="https://www.example.com/x">www.example.com/x</a>` }), "https://www.example.com/x", "www. says no scheme: the link beside it is that same link, and gives its own");
assert.equal(bare({ "text/plain": "www.example.com/x", "text/html": `<a href="http://www.example.com/x">www.example.com/x</a>` }), "http://www.example.com/x", "the same with http://");
assert.equal(bare({ "text/plain": "www.example.com/x", "text/html": `<a href="https://www.example.com/y">www.example.com/x</a>` }), null, "another path is another link");
assert.equal(bare({ "text/plain": "http://example.com/x", "text/html": `<a href="https://example.com/x">http://example.com/x</a>` }), null, "a scheme written is the address's: another scheme is another link");
{
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  const { normalizeHref } = await import("../../src/editor/page/links/index.mjs");
  assert.deepEqual(["www.x.com/a", "http://x.com", "mailto:a@b.c", " javascript:alert(1)"].map(normalizeHref), ["http://www.x.com/a", "http://x.com", "mailto:a@b.c", null], "the link card: http:// for www. (as a pasted address gets), unsafe schemes refused");
  assert.deepEqual(["example.com", "x.com/a?b=1", "sub.x.cn:8080/a", "localhost:3000/a", "127.0.0.1:4173", "  x.com  "].map(normalizeHref), ["http://example.com", "http://x.com/a?b=1", "http://sub.x.cn:8080/a", "http://localhost:3000/a", "http://127.0.0.1:4173", "http://x.com"], "a host written alone gets the scheme www. gets");
  assert.deepEqual(["#card", "tel:+8610", "tel:10086", "ftp://x.com/a", "obsidian://open", "assets/a.pdf", "../b/doc.html", "./a.html", "/a"].map(normalizeHref), ["#card", "tel:+8610", "tel:10086", "ftp://x.com/a", "obsidian://open", "assets/a.pdf", "../b/doc.html", "./a.html", "/a"], "what names a place of its own stays as typed");
  assert.deepEqual(["example.top/a", "example.vip", "example.shop", "example.museum", "a.b.wang:8080"].map(normalizeHref), ["http://example.top/a", "http://example.vip", "http://example.shop", "http://example.museum", "http://a.b.wang:8080"], "names common on Chinese sites and beyond a short list of top-level domains");
  assert.deepEqual(["myserver:8080", "myserver:8080/a", "[::1]:3000", "[::1]"].map(normalizeHref), ["http://myserver:8080", "http://myserver:8080/a", "http://[::1]:3000", "http://[::1]"], "a name with a port, an IPv6 address");
  assert.deepEqual(["标题", "README.md", "Q3:增长", "两个 词", "www.x.com 说明", "x.com 说明", "main.py", "archive.zip", "http://", "ftp://", "mailto:", "a@b.com"].map(normalizeHref), Array(12).fill(null), "words are no address, nor a scheme with nothing after it");
  assert.deepEqual(["http://localhost:9/generated/a.html#ab12cd34", "/a/doc.html", "../a/report.html"].map(normalizeHref), ["../a/doc.html#ab12cd34", "../a/doc.html", "../a/doc.html"], "a document's address as a file writes it");
  assert.equal(normalizeHref("http://127.0.0.1:4173/#a/ab12cd34"), "http://127.0.0.1:4173/#a/ab12cd34", "a workbench's address, with no list to read it by, stays: it opens all the same");
  assert.equal(normalizeHref("  "), "", "an empty field takes the link away");
  delete globalThis.document;
  delete globalThis.window;
}

// Made on the page: a formula block and a table of their data, an image and an embed waiting for their address.
const { build, PASTED_SOURCE } = await import("../../src/editor/page/clipboard/own/blocks.mjs");
globalThis.document = dom.window.document;
globalThis.katex = { renderToString: (tex) => `<span class="katex">${tex.replace(/</g, "&lt;")}</span>` };
const { serializeInner } = await import("../../src/editor/page/core.mjs");
const math = build(dom.window.document, { type: "math", tex: "a<b" });
assert.ok(math.matches('div.doc-math-block[data-ge-new][data-ge-type="math"][data-ge-kind="tex"][contenteditable="true"]'), "a display formula: a text block of kind tex");
assert.equal(math.querySelector(".ge-math-chip[data-ge-atom] .katex")?.textContent, "a<b", "drawn by KaTeX in its chip");
assert.equal(serializeInner(math), "\\[a&lt;b\\]", "written as its TeX between \\[ \\]");
delete globalThis.katex;
const tableBuilt = build(dom.window.document, { type: "table", rows: [["A", "<b>B</b><script>x</script>"], ["1", "2"]], header: true });
assert.equal(tableBuilt.querySelector("table").outerHTML.replace(/ (contenteditable|data-ge-[a-z]+)="[^"]*"/g, ""), '<table class="doc-table"><thead><tr><th class="doc-bold doc-highlight-gray">A</th><th class="doc-bold doc-highlight-gray"><strong>B</strong></th></tr></thead><tbody><tr><td>1</td><td>2</td></tr></tbody></table>', "a table, its cells sanitized, its header cells with the header's look");
assert.ok([...tableBuilt.querySelectorAll("th, td")].every((cell) => cell.matches('[contenteditable="true"][data-ge-new][data-ge-kind="cell"]')), "its cells text blocks made on the page");
assert.ok(tableBuilt.matches("[data-ge-new][data-ge-type=\"table\"]") && tableBuilt.querySelector("thead > tr"), "its header row a thead (written as the table has it then: table/index.mjs tableData)");
const { newFormula } = await import("../../src/editor/page/core.mjs");
const formulaTable = build(dom.window.document, { type: "table", rows: [['<span class="doc-math-inline">\\(x^2\\)</span> 与文字']] }, { formula: (tex) => newFormula(dom.window.document, tex, '<span class="katex">' + tex + '</span>') });
assert.ok(formulaTable.querySelector("td [data-ge-atom] .katex") && serializeInner(formulaTable.querySelector("td")).includes("\\(x^2\\)"), "a table's formulas chips at once (not their TeX as text until the page opens again), written as their TeX");
const picture = build(dom.window.document, { type: "image", src: "https://example.com/a.png" });
assert.ok(picture.matches(".doc-image[data-ge-new]") && picture.getAttribute(PASTED_SOURCE) === "https://example.com/a.png", "an image filled from its address");
delete globalThis.document;

// Cells pasted into a table's cells (page/clipboard/ cellsOf, table/cells.mjs; the user's 2026-11-09):
// another program's table read as rows of cells (tableRows: one table and no words outside it, a
// table of one column kept one, spans spread, each cell's marks, line breaks and pictures), a pasted
// Markdown table's cells holding their pictures (parseCellMarkdown), tab-separated lines as Excel
// writes them (tabbed: a quoted cell holding tabs, line breaks and "" a quote; cells only when there
// are two lines or more, each of as many cells, two or more).
{
  const { richHtml } = await import("../../src/editor/page/clipboard/import/to-blocks.mjs");
  const { fromMarkdown } = await import("../../src/editor/page/clipboard/import/markdown.mjs");
  const { tabbed } = await import("../../src/editor/page/clipboard/index.mjs");
  const cellsOf = (html) => H.tableRows(H.parseClipboardHTML(html, { base: BASE }))?.map((row) => row.map((cell) => richHtml(cell, { pictures: true }))) ?? null;
  assert.deepEqual(cellsOf(HTML_PASTE_CORPUS.find((sample) => sample.name === "excel").html), [["Name", "Score"], ["Bob", "88"]], "Excel's cells (its Office HTML)");
  assert.deepEqual(cellsOf(HTML_PASTE_CORPUS.find((sample) => sample.name === "google-sheets").html), [["<strong>Name</strong>", "<strong>Age</strong>"], ["Alice", "30"]], "Google Sheets' cells, their bold a style");
  assert.deepEqual(cellsOf(HTML_PASTE_CORPUS.find((sample) => sample.name === "wiki-table").html), [["City", "Country", "Pop"], ['<a href="https://en.wikipedia.org/wiki/Tokyo">Tokyo</a>', "Japan", "14M"], ["Osaka", "", "2.7M"], ["<strong>Total</strong>", "", "16.7M"]], "a web page's table: its links, spans spread into empty cells");
  assert.deepEqual(cellsOf("<table><tr><td>甲</td></tr><tr><td>乙<br>二行</td></tr></table>"), [["甲"], ["乙<br>二行"]], "a table of one column stays one, not paragraphs, a cell's line break kept");
  assert.deepEqual(cellsOf('<table><tr><td>猫 <img src="https://e.com/c.png" alt="小猫" width="60"></td><td><a href="https://k.com/"><img src="data:image/png;base64,AA==" alt=""></a></td></tr></table>'),
    [['猫 <img src="https://e.com/c.png" alt="小猫" width="60">', '<a href="https://k.com/"><img src="data:image/png;base64,AA==" alt=""></a>']], "a cell's pictures, a linked one's too");
  assert.equal(cellsOf("<p>前言</p><table><tr><td>a</td><td>b</td></tr></table>"), null, "words outside the table: no cells");
  assert.equal(cellsOf("<table><tr><td>a</td></tr></table><table><tr><td>b</td></tr></table>"), null, "two tables: no cells");
  const [markdown] = fromMarkdown("| 名 | 图 |\n| --- | --- |\n| 猫 | ![小猫](https://e.com/c.png) 很乖 |\n| 狗 | [![小狗](a/b.png)](https://k.com) |");
  assert.deepEqual(markdown.children.map((row) => markdown.props.table_block_column_order.map((column) => richHtml(row.props.cells[column] ?? [], { pictures: true }))),
    [["名", "图"], ["猫", '<img src="https://e.com/c.png" alt="小猫"> 很乖'], ["狗", '<img src="a/b.png" alt="小狗">']], "a pasted Markdown table's cells hold their pictures (a linked one's link left)");
  assert.equal(richHtml([["￼", [["img", "https://e.com/c.png", "猫", ""]]]]), "猫", "elsewhere a picture a reader left in text is its alt");
  assert.deepEqual(tabbed("a\tb\nc\td"), [["a", "b"], ["c", "d"]], "tab-separated lines");
  assert.deepEqual(tabbed('"第一行\n第二行"\t"说""好"""\n七\t八'), [["第一行\n第二行", '说"好"'], ["七", "八"]], "a cell in quotes holds a line break and a quote");
  assert.deepEqual(tabbed('5" 屏\t1\n2\t3'), [['5" 屏', "1"], ["2", "3"]], "a quote inside a cell is a quote");
  for (const text of ["a\tb", "a\tb\nc", "a\nb", ""]) assert.equal(tabbed(text), null, JSON.stringify(text));
}

// Written into the file (a formula block as a text block of its type, a table by table/file.mjs).
const { applyEdits } = await import("../../src/editor/source.mjs");
const page = "<main>\n  <p>前文</p>\n  <p>后文</p>\n</main>\n";
const add = (node) => applyEdits({ current: page, edits: [], units: [{ id: "n0", insert: { key: "n0", ...node }, place: { after: 0 } }] });
assert.equal(add({ type: "math", html: "\\[a&lt;b \\&amp; c\\]" }).text, page.replace("<p>前文</p>\n", '<p>前文</p>\n  <div class="doc-math-block">\\[a&lt;b \\&amp; c\\]</div>\n'));
assert.equal(add({ type: "table", rows: [["名称", "数值"], ["甲", "<strong>1</strong>"]], header: true }).text, page.replace("<p>前文</p>\n", [
  "<p>前文</p>", '  <div class="doc-table-wrap">', '    <table class="doc-table">', "      <thead>", "        <tr><th>名称</th><th>数值</th></tr>", "      </thead>",
  "      <tbody>", "        <tr><td>甲</td><td><strong>1</strong></td></tr>", "      </tbody>", "    </table>", "  </div>", ""].join("\n")));
assert.ok(add({ type: "table", rows: [["a", "b"]], column: true }).text.includes('<tr><th scope="row">a</th><td>b</td></tr>'), "a header column");
for (const bad of [{ type: "math", html: "" }, { type: "math", html: "x" }, { type: "math", html: "\\[x\\]y\\]" }, { type: "math", html: "\\[<b>x</b>\\]" }, { type: "table", rows: [["a"], ["b", "c"]] }, { type: "table", rows: [["<div>x</div>"]] }, { type: "table", rows: [] }]) {
  assert.deepEqual(add(bad).conflicts.map((entry) => entry.reason), ["invalid"], JSON.stringify(bad));
}

globalThis.DOMParser = saved.DOMParser;
globalThis.Node = saved.Node;
console.log("Checked pasting from other programs: the HTML conversion of 21 samples to their expected blocks (WPS's numbered list numbered), the branches of a paste, AI answers' formulas (GPT, Gemini, KaTeX, data-math, MathJax, TeX in text) and ChatGPT's cards (highlight blocks and columns, never from HTML of a look of its own), colors onto the page's nine, 32 more samples, the Word filter rule by rule (wrapped source, lists, styles, colors, breaks, footnotes, tables, divs of text, PowerPoint's bullets, lists numbered or bulleted by their markers or definitions and from their first number, input built to stall it), the blocks the page makes of them (the kit's flowchart copied from a reader's page a flowchart again), new tables and formula blocks made and written, and cells pasted into a table's cells (another program's table, a Markdown table's pictures, tab-separated lines).");
