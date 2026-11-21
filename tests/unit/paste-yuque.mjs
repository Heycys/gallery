import assert from "node:assert/strict";
import fs from "node:fs";
import { JSDOM } from "jsdom";

// Pasting from Yuque (语雀; src/editor/page/clipboard/import/yuque.mjs), in jsdom, with the user's
// samples of 2026-11-09 (tests/unit/fixtures/paste/yuque/: one document of every kind of block,
// copied twice in macOS Chrome, each MIME type's string as the paste event gave it; README.md and
// manifest.json say what each is. Their URLs' identifying parts are replaced: the document's host
// and account path by yuque.example.com/example.user/book01/sampledoc0000001, the picture's host and
// account id by example.com and 100000000, the same in every encoding; every other byte is the
// capture's, whose sizes and hashes the manifest gives). ⌘A ⌘C's four formats (text/ne-inode's JSON,
// the <ne-clipboard> in its text/html, text/lake, all of them) read the same, each kind of block made
// what Gallery has; the toolbar's 复制为 Markdown read as its Markdown says (and not as a paste's).

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://studio.test/page" });
const saved = { DOMParser: globalThis.DOMParser, Node: globalThis.Node };
globalThis.DOMParser = dom.window.DOMParser;
globalThis.Node = dom.window.Node;
const BASE = "https://studio.test/page";

const { readExternal } = await import("../../src/editor/page/clipboard/import/read.mjs");
const { readYuque, yuqueMarkdownCopy } = await import("../../src/editor/page/clipboard/import/yuque.mjs");
const { toBlocks } = await import("../../src/editor/page/clipboard/import/to-blocks.mjs");
const { checkBlocks } = await import("../../src/editor/page/clipboard/own/blocks.mjs");
const { BLOCK_TYPES } = await import("../../src/editor/components/registry.mjs");

const sample = (name) => fs.readFileSync(new URL(`./fixtures/paste/yuque/${name}`, import.meta.url), "utf8");
const clipboard = (types) => ({ types: Object.keys(types), getData: (type) => types[type] ?? "" });
const read = (types) => readExternal(clipboard(types), { base: BASE });
// As the page makes them (clipboard/index.mjs read: an item holds its blocks), and as the clipboard's own check takes them.
const blocksOf = (types) => {
  const result = read(types);
  assert.equal(result.kind, "blocks", "blocks");
  const blocks = toBlocks(result.specs, null, { held: true });
  assert.deepEqual(checkBlocks(blocks), blocks, "the blocks made are ones the clipboard's own check takes too");
  return blocks;
};
const brief = (blocks) => blocks.map((b) => b.type + (b.blocks ? `[${brief(b.blocks)}]` : b.lists?.length ? `[${brief(b.lists)}]` : "")).join(" ");
const all = (blocks) => blocks.flatMap((b) => [b, ...all(b.blocks ?? []), ...all(b.lists ?? [])]);
const find = (blocks, words) => all(blocks).find((b) => (b.html ?? b.text ?? "").includes(words));

// ---------- ⌘A ⌘C: four formats, one reading ----------

const plain = sample("02-select-all/text-plain.txt");
const html = sample("02-select-all/text-html.html");
const lake = sample("02-select-all/text-lake.lake");
const inode = sample("02-select-all/text-ne-inode.json");
const formats = {
  "text/ne-inode": { "text/plain": plain, "text/ne-inode": inode },
  "text/html's <ne-clipboard>": { "text/plain": plain, "text/html": html },
  "text/lake": { "text/plain": plain, "text/lake": lake },
  "all four": { "text/plain": plain, "text/html": html, "text/lake": lake, "text/ne-inode": inode },
};
const readings = Object.fromEntries(Object.entries(formats).map(([name, types]) => [name, read(types)]));
for (const [name, reading] of Object.entries(readings)) assert.deepEqual(reading, readings["text/ne-inode"], `${name} reads as text/ne-inode does`);
// text/lake in its HTML's form (an older copy: data-lake-id, no <ne-clipboard>) the same too.
assert.deepEqual(read({ "text/plain": plain, "text/html": lake }), readings["text/ne-inode"], "lake as text/html");
// A <ne-clipboard> that holds no JSON: its HTML, read as any page's.
const broken = read({ "text/plain": plain, "text/html": html.replace(/<ne-clipboard data="[^"]*"/, '<ne-clipboard data="%7Bnot json"') });
assert.equal(broken.kind, "blocks", "a broken <ne-clipboard>: the HTML after it");

const selectAll = blocksOf(formats["all four"]);
assert.equal(brief(selectAll), [
  "paragraph heading1 paragraph heading2 heading3 heading4 heading4 heading4 paragraph paragraph", // 一、标题与正文
  "heading2 paragraph paragraph paragraph divider", // 二、行内格式
  "heading2 bullets[item[bullets[item item[bullets[item]]]] item] numbers[item item[bullets[item item]] item] todo[item item]", // 三、列表和任务
  "heading2 quote[paragraph paragraph] paragraph callout[paragraph]", // 四、引用与提示
  "heading2 paragraph code paragraph code paragraph math", // 五、代码与公式
  "heading2 table paragraph paragraph table", // 六、表格
  "heading2 image paragraph details[paragraph paragraph] paragraph", // 七、图片与折叠内容
  "heading2 paragraph paragraph", // 八、画板
].join(" "), "every block of the document, of its kind");

// Headings: 1–4 their levels, 5 and 6 heading 4 (as any pasted HTML's and Markdown's).
assert.deepEqual(selectAll.filter((b) => /^heading/.test(b.type)).slice(0, 6).map((b) => `${b.type}:${b.html}`),
  ["heading1:一、标题与正文", "heading2:二级标题：采样地点", "heading3:三级标题：窗边", "heading4:四级标题：仪器 A", "heading4:五级标题：刻度", "heading4:六级标题：读数单位"], "h1–h6");
assert.equal(find(selectAll, "第二段的开头").html, "第二段的开头是「乙」。同一段内的第一行到这里。<br>这是手动换行后的第二行。", "a soft line break a line break");
assert.ok(find(selectAll, "emoji").html.endsWith("emoji 🌱。"), "an emoji its character");

// Inline formats: bold, italic, both, strike, code, a link; the literal characters as they are.
assert.equal(find(selectAll, "常规文字").html, '常规文字、<strong>粗体</strong>、<em>斜体</em>、<strong><em>粗斜体</em></strong>、<s>已作废</s>、<code>sensor_id</code>，以及<a href="https://yuque.example.com/example.user/book01">回到原初个人知识库</a>。', "marks and a link");
assert.equal(find(selectAll, "组合样本").html, "组合样本：<strong>起点 </strong><code>A-01</code><strong> 与终点</strong>，链接后面紧接中文标点。字面字符样本：*星号*、[方括号]、<code>a | b</code>。", "bold around code; * [ ] | as written");
// Underline, sub, sup, and Yuque's colors as the page's nearest: its red text red, its yellow highlight yellow.
assert.equal(find(selectAll, "富文本样本").html, '富文本样本：<u>下划线</u>、H<sub>2</sub>O、m<sup>2</sup>、<span class="doc-text-red">红色文字</span>、<span class="doc-highlight-yellow">黄色高亮</span>。', "underline, sub, sup, colors");

// Lists: nested by their levels, a numbered list going on around the list its item holds, to-dos checked.
const bullets = selectAll.find((b) => b.type === "bullets");
assert.deepEqual([bullets.blocks[0].html, bullets.blocks[0].lists[0].blocks.map((b) => b.html), bullets.blocks[0].lists[0].blocks[1].lists[0].blocks[0].html, bullets.blocks[1].html],
  ["温度计", ["玻璃温度计", "电子温度计"], "型号 <code>T-01</code>", "计时器"], "bullets three levels deep");
const numbers = selectAll.find((b) => b.type === "numbers");
assert.deepEqual([numbers.start, numbers.blocks.map((b) => b.html)], [undefined, ["记录初值。", "复测两次。", "写下平均值。"]], "one numbered list from 1");
assert.deepEqual(selectAll.find((b) => b.type === "todo").blocks.map((b) => [b.html, Boolean(b.checked)]), [["上午读数已登记", true], ["下午读数待复核", false]], "to-dos and their checks");

// A quote of two paragraphs; a 提示 the page's callout (info: its blue, the callout's own, no class).
assert.deepEqual(selectAll.find((b) => b.type === "quote").blocks.map((b) => b.html), ["来自记录本：每次采样前，先让仪器静置一分钟。", "引用中的第二段含 <strong>重点</strong> 和 <code>60s</code>。"], "a quote");
assert.deepEqual(selectAll.find((b) => b.type === "callout"), { type: "callout", blocks: [{ type: "paragraph", html: "提示框：蓝色标签代表上午批次，绿色标签代表下午批次。" }] }, "info: a callout of the default blue");

// Code in its language, its text as it was (the literal # 字面标题 and - [ ] are code); formulas.
const codes = selectAll.filter((b) => b.type === "code");
assert.deepEqual(codes.map((b) => [b.language, b.text]), [
  ["python", 'def mean(values):\n    if not values:\n        return None\n\n    return sum(values) / len(values)\n\nprint("A | B", mean([18.5, 21.0]))'],
  ["markdown", "# 字面标题\n- [ ] 字面任务\n**字面星号**"],
], "code blocks in their languages, a literal # title and to-do as code");
assert.equal(find(selectAll, "行内代码").html, "行内代码含反引号：<code>display(`T-01`)</code>。下面的 Python 代码含缩进、空行和竖线。", "inline code holding backticks");
assert.equal(find(selectAll, "行内公式").html, '行内公式：<span class="doc-math-inline">\\(\\Delta T = T_2 - T_1\\)</span>。', "an inline formula");
assert.deepEqual(selectAll.find((b) => b.type === "math"), { type: "math", tex: "\\bar{T} = \\frac{1}{n}\\sum_{i=1}^{n} T_i" }, "a formula alone in its paragraph a formula block");

// Tables: a cell's | as written, an empty cell, each column's alignment its cells' look; merged cells kept.
const [table, merged] = selectAll.filter((b) => b.type === "table");
assert.deepEqual(table.rows, [["批次", "读数", "备注"], ["上午 A", "18.5", "<strong>已复核</strong>"], ["下午 B", "21.0", "<code>T-01</code>"], ["对照 C", "", "包含竖线 A|B"]], "a table, A|B in one cell");
assert.deepEqual(table.looks, Array(4).fill(["doc-align-left", "doc-align-right", "doc-align-center"]), "its alignments");
assert.equal(table.outside, true, "from elsewhere: 一键优化 as it comes in");
assert.deepEqual([merged.rows, merged.spans], [
  [["<strong>两天采样记录</strong>", "备注"], ["窗边", "周一", "晴<br>下午有风"], ["周二", "阴"]],
  [[[1, 2], [1, 1]], [[2, 1], [1, 1], [1, 1]], [[1, 1], [1, 1]]],
], "merged cells: a row's cells and their spans (two columns, two rows); a cell's paragraphs its lines");

// A picture of its address (no caption: Yuque's alt is a file's name, its title is not shown); a 折叠块 a disclosure.
assert.deepEqual(selectAll.find((b) => b.type === "image"), { type: "image", src: "https://example.com/skylark/lark/0/2026/png/100000000/1794212656744-9fad7187-d41a-4f45-afa6-40283e84e256.png" }, "an image of its address");
assert.deepEqual(selectAll.find((b) => b.type === "details"), { type: "details", html: "展开补充记录", blocks: [{ type: "paragraph", html: "盒内第一段：仪器放在窗边。" }, { type: "paragraph", html: "盒内第二段含 <strong>加粗文字</strong>。" }] }, "a disclosure");
// A board: a gray line with its name (its mind map's first node).
assert.deepEqual(selectAll.at(-1), { type: "paragraph", html: '<span class="doc-text-gray">（语雀画板「采样记录」没有粘贴过来：Gallery 没有这种块）</span>' }, "a board said in gray");

// ---------- the toolbar's 复制为 Markdown ----------

const markdown = sample("01-toolbar-markdown/text-plain.md");
const span = sample("01-toolbar-markdown/text-html.html");
const toolbar = blocksOf({ "text/plain": markdown, "text/html": span });
// The same blocks as ⌘A ⌘C's, but the board (its Markdown has its section's words alone).
assert.equal(brief(toolbar), brief(selectAll.slice(0, -1)), "every block, of the kind ⌘A ⌘C's is");
assert.equal(find(toolbar, "第二段的开头").html, find(selectAll, "第二段的开头").html, "a line ending in two spaces a line break, the paragraph's lines one paragraph");
assert.equal(find(toolbar, "富文本样本").html, find(selectAll, "富文本样本").html, "<u>, <sub>, <sup>, <font style> colors (the nearest) as ⌘A ⌘C's");
assert.equal(find(toolbar, "常规文字").html, find(selectAll, "常规文字").html, "Markdown's marks and link");
assert.deepEqual(toolbar.find((b) => b.type === "callout"), selectAll.find((b) => b.type === "callout"), ":::info a callout as ⌘A ⌘C's");
assert.equal(find(toolbar, "行内公式").html, find(selectAll, "行内公式").html, "$ … $ with spaces inside a formula");
assert.deepEqual(toolbar.find((b) => b.type === "math"), selectAll.find((b) => b.type === "math"), "one alone on its line a formula block");
assert.deepEqual(toolbar.filter((b) => b.type === "code"), codes, "fenced code as ⌘A ⌘C's");
const [mdTable, mdMerged] = toolbar.filter((b) => b.type === "table");
assert.deepEqual([mdTable.rows, mdTable.looks], [table.rows, table.looks], "a | written in a cell kept in it (the row's cells past the header's joined), the delimiter row's alignments");
assert.deepEqual(mdMerged.rows, [["<strong>两天采样记录</strong>", "", "备注"], ["窗边", "周一", "晴<br>下午有风"], ["", "周二", "阴"]], "merged cells as its Markdown has them: empty cells, <br/> a line break");
assert.deepEqual([toolbar.find((b) => b.type === "image"), toolbar.find((b) => b.type === "details")], [selectAll.find((b) => b.type === "image"), selectAll.find((b) => b.type === "details")], "its <img> and <details> HTML as ⌘A ⌘C's picture and disclosure");
assert.ok(!/&lt;|<font|lake-collapse|ne-image|:::/.test(JSON.stringify(toolbar)), "no tag or ::: left as text");
// Read so only when it is Yuque's: its marks, or its HTML the toolbar's span; any other Markdown by the paste's rules.
const bare = "# 标题\n\n第一行\n第二行";
assert.equal(yuqueMarkdownCopy(clipboard({}), markdown), true, "its marks alone say it");
assert.equal(yuqueMarkdownCopy(clipboard({ "text/html": span }), bare), true, "the toolbar's span says it");
assert.equal(yuqueMarkdownCopy(clipboard({}), bare), false, "Markdown with neither is not");
assert.deepEqual(brief(toBlocks(read({ "text/plain": bare, "text/html": span }).specs)), "heading1 paragraph", "Yuque's: a paragraph's lines one paragraph");
assert.deepEqual(brief(toBlocks(read({ "text/plain": bare }).specs)), "heading1 paragraph paragraph", "another program's: each line a paragraph");

// ---------- what else a paste of Yuque's may be ----------

const tree = (...children) => JSON.stringify({ type: "fragment", name: "#fragment", attrs: {}, children });
const el = (name, attrs, ...children) => ({ type: "element", name, attrs, children });
const txt = (data, attrs = {}) => ({ type: "text", name: "#text", attrs, data });
// One line copied: its words with their marks at the caret.
assert.deepEqual(read({ "text/plain": "加粗的话", "text/ne-inode": tree(el("p", {}, txt("加粗", { bold: true }), txt("的话"))) }), { kind: "rich", title: [["加粗", [["b"]]], ["的话"]] }, "a line copied: rich text");
// The plain text alone (another browser, a sanitized clipboard): no Yuque's, the paste's own rules.
assert.equal(readYuque(clipboard({ "text/plain": plain })), null, "plain text alone is no Yuque's");
// 提示 of other kinds their colors; one of a kind the page has no color for the callout's own blue.
const alerts = toBlocks(read({ "text/plain": "a\nb", "text/ne-inode": tree(...["danger", "success", "tips", "warning", "color3"].map((type) => el("alertHole", {}, el("alert", { type }, el("p", {}, txt(type)))))) }).specs);
assert.deepEqual(alerts.map((b) => `${b.type}:${b.color ?? ""}`), ["callout:doc-highlight-red", "callout:doc-highlight-green", "callout:doc-highlight-yellow", "callout:doc-highlight-orange", "callout:"], "alerts' colors");
// Spans that tile no table: dropped, each cell in a column of its own, the cells it spanned left empty.
const bad = toBlocks([{ type: "table", title: [], props: { table_block_column_order: ["c0", "c1"] }, children: [
  { type: "table_row", title: [], props: { cells: { c0: [["甲"]] }, spans: { c0: [1, 2] } }, children: [] },
  { type: "table_row", title: [], props: { cells: { c0: [["乙"]], c1: [["丙"]] }, spans: { c0: [1, 1], c1: [1, 2] } }, children: [] },
] }])[0];
assert.deepEqual([bad.rows, bad.spans], [[["甲", ""], ["乙", "丙"]], undefined], "spans that tile no table spread");
// A card the page has no block for: a link where it has an address, else a gray line naming it.
const cards = toBlocks(read({ "text/plain": "a\nb", "text/ne-inode": tree(
  el("hole", {}, { type: "card", name: "file", attrs: { value: { src: "https://example.com/a.pdf", name: "报告.pdf" }, cardType: "block" }, cardType: "block" }),
  el("hole", {}, { type: "card", name: "lockedtext", attrs: { value: {}, cardType: "block" }, cardType: "block" }),
) }).specs);
assert.deepEqual(cards, [{ type: "paragraph", html: '<a href="https://example.com/a.pdf">报告.pdf</a>' }, { type: "paragraph", html: '<span class="doc-text-gray">（语雀的「lockedtext」卡片没有粘贴过来：Gallery 没有这种块）</span>' }], "a file a link, another card said");
// The callout taken out of the registry: its blocks stay, as a highlight block's do.
{
  const { callout } = BLOCK_TYPES;
  delete BLOCK_TYPES.callout;
  try {
    const made = toBlocks(read(formats["text/ne-inode"]).specs, null, { held: true });
    const at = made.findIndex((block) => block.type === "quote");
    assert.deepEqual(made.slice(at + 1, at + 3).map((block) => block.html), ["引用结束，这句话是普通正文。", "提示框：蓝色标签代表上午批次，绿色标签代表下午批次。"], "no callout: its paragraph in place");
  } finally {
    BLOCK_TYPES.callout = callout;
  }
}

globalThis.DOMParser = saved.DOMParser;
globalThis.Node = saved.Node;
console.log("Checked pasting from Yuque: ⌘A ⌘C's text/ne-inode, its <ne-clipboard>, text/lake and all of them read alike, each kind of block what Gallery has (headings 5 and 6 heading 4, marks and colors, nested lists and to-dos, a quote, a 提示 a callout of its color, code in its language, formulas, a table's | and alignments, merged cells, a picture, a disclosure, a board said in gray), the toolbar's Markdown read as its Markdown says (its HTML, ::: 提示, $ … $, colors) and only when it is Yuque's, one line copied as rich text.");
