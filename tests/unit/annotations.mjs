import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { standsBeside } from "../../src/editor/components/registry.mjs";
import { alignQuote, annotationsMarkdown, CARD, cardTops, checkAnnotations, cleanAnchor, cleanItem, excerptOf, findQuote, locateAnchor, markerLeft, markerTop, RAIL, readItems, sameWords, squash, stackItems, tidyLines } from "../../src/shared/annotations.mjs";
import { MARGIN, marginLayout, rightRoom } from "../../src/editor/page/margin.mjs";
import { BAR } from "../../src/editor/page/handle-sizes.mjs";
import { createAnnotations, reportUnits } from "../../src/editor/annotations.mjs";
import { droppedLines, droppedOf, droppedReportLines, keepDropped, takeDropped } from "../../src/editor/dropped-annotations.mjs";

// 批注 (src/shared/annotations.mjs, src/editor/annotations.mjs): finding an anchor's words again after
// edits, the check that deletes an annotation with its text and follows a quote edited in part, page
// order, the Markdown 复制批注 hands an Agent, the markers' stacking and that they ask nothing of the page's layout, and the file
// the server keeps (put, remove, clear, restore, the check after the report was written).

// ---------- finding a quote ----------
{
  const text = "共用同一个 712px 的阅读宽度，读者可以在右上角切换成全宽。";
  const found = findQuote(text, { quote: "读者可以在右上角切换成全宽" });
  assert.deepEqual(found, { start: text.indexOf("读者"), end: text.indexOf("。"), exact: true });
  // White space does not count: the page and the file space words differently around tags.
  assert.equal(findQuote("Agent 先理解材料", { quote: "Agent先理解" })?.exact, true);
  // Of two, the one whose words before and after agree.
  const twice = "第一处：同样的话在这里。第二处：同样的话在这里。";
  const second = findQuote(twice, { quote: "同样的话在这里", prefix: "第二处：", suffix: "。" });
  assert.equal(second.start, twice.lastIndexOf("同样的话"), "the second time, by its prefix");
  assert.equal(findQuote(twice, { quote: "同样的话在这里" }).start, twice.indexOf("同样的话"), "without context, the first");
  // Edited in part: kept while at least half of its characters are there in order, where it stood.
  const quote = "标题和分割线也只是普通的块";
  const context = { prefix: "正文可以分成分区：里面都是普通的块。", suffix: "，按需要加。" };
  const typed = "正文可以分成分区：里面都是普通的块。标题、引言和分割线其实也只是很普通的块，按需要加。";
  const moved = findQuote(typed, { quote, ...context });
  assert.ok(moved && !moved.exact, "found though words were typed into it");
  assert.equal(typed.slice(moved.start, moved.end), "标题、引言和分割线其实也只是很普通的块", "the stretch the words are in now");
  assert.equal(findQuote("标题和其他", { quote }), null, "fewer than half of its characters: gone");
  assert.equal(findQuote("完全不一样的一句话，没有那些字。", { quote }), null);
  assert.equal(findQuote("读者可以在右上角", { quote: "读者可以在右上角切" }), null, "a quote under ten characters is found only as it is");
  // A quote deleted never moves onto words that were there all along: a stretch not found as it is
  // must stand where the quote stood, its context (or its block's edge) on both sides of it.
  assert.equal(findQuote("另一个指标的变化很大，主要是因为口径变了。", { quote: "这个指标的变化不大，主要是因为样本量太小。", prefix: "", suffix: "另一个指标的变化很大，主要是因为口径变了。" }), null, "deleted: not the parallel sentence after it");
  assert.equal(findQuote("数据集，时间范围是去年。数据的口径以官方为准，来自官网的公告。", { quote: "来自公开的数据", prefix: "数据", suffix: "集，时间范围是去年。" }), null, "a short quote deleted: not three of its characters elsewhere");
  assert.equal(findQuote("The model reduces latency by half on long documents.", { quote: "improves recall on long documents", prefix: "The model ", suffix: " and reduces latency by half." }), null, "deleted: not the end of another phrase");
  const plan = { quote: "我们认为这个方案可以在下个季度上线", prefix: "前文前文。", suffix: "。后文后文。" };
  assert.equal(findQuote("前文前文。我们认为这个方案可以在明年上线。后文后文。", plan) !== null, true, "edited in part, what is around it kept: followed");
  assert.equal(findQuote("前文前文。我们认为这个方案可以在明年上线。新的后文。", plan), null, "edited in part and what follows it rewritten: gone (nothing says it stands there)");
  const sentence = { quote: "再选择能够准确表达关系的组件", prefix: "Agent 先理解材料和组织结论，", suffix: "；" };
  const kept = (text) => { const found = findQuote(text, sentence); return found && text.slice(found.start, found.end); };
  assert.equal(kept("Agent 先理解材料和组织结论，再选择能够准确表达关系的图表；最终产物。"), "再选择能够准确表达关系的", "one word changed at its end: kept");
  assert.equal(kept("Agent 先理解材料和组织结论，然后选择能够准确表达关系的组件；"), "选择能够准确表达关系的组件", "one word changed at its start: kept");
  assert.equal(kept("Agent 先理解材料和组织结论，再选择能够更准确地表达关系的组件；"), "再选择能够更准确地表达关系的组件", "words typed inside: kept");
  assert.equal(findQuote("anything", { quote: "  " }), null, "an empty quote finds nothing");
  // Only as it is (the page's first look, before it follows the reader's edit).
  assert.equal(findQuote("Agent 先理解材料和组织结论，再选择能够更准确地表达关系的组件；", sentence, { exact: true }), null, "edited: not found as it is");
  assert.equal(findQuote("Agent 先理解材料和组织结论，再选择能够准确表达关系的组件；", sentence, { exact: true })?.exact, true);
  // No longer than one and a half times the quote.
  assert.equal(findQuote("标xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx题和分割线也只是普通的", { quote: "标题和分割线也只是普通的", prefix: "xxx", suffix: "" })?.start, "标xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx".length, "the far-off character left out");
  // The alignment itself: the most kept, then the shortest.
  assert.deepEqual(alignQuote("abcdef", "xxabcyydefzz"), { start: 2, end: 10, kept: 6 });
  assert.equal(alignQuote("", "abc"), null);
  // A text too long to look through is no proof the words are gone.
  assert.deepEqual(findQuote("字".repeat(30000), { quote: "这是一段并不存在于这里的很长的话".repeat(10) }), { unknown: true });
}

// ---------- excerpts ----------
{
  const text = `前面的话${"很长".repeat(20)}。被批注的话\n下一块的开头`;
  const start = text.indexOf("被批注");
  const excerpt = excerptOf(text, start, start + 5);
  assert.equal(excerpt.quote, "被批注的话");
  assert.equal(excerpt.prefix.length, 32, "32 characters before it");
  assert.ok(text.slice(0, start).endsWith(excerpt.prefix));
  assert.equal(excerpt.suffix, "下一块的开头", "a line break read as a space, the ends trimmed");
  assert.equal(tidyLines("  a  b \n\n c "), "a b\nc");
  assert.equal(squash(" a\u200b b\n c "), "abc");
}

// ---------- the check ----------
const unit = (id, text, parent = null) => ({ id, text, parent, where: [] });
const textNote = (id, blocks, quote, extra = {}) => ({ id, created: "2026-10-23T00:00:00.000Z", updated: "2026-10-23T00:00:00.000Z", text: `建议 ${id}`, anchor: { kind: "text", blocks, quote, prefix: "", suffix: "", ...extra } });
{
  const units = [unit("aaaaaaaa", "第一段：读者可以在右上角切换成全宽。"), unit("bbbbbbbb", "第二段：标题和分割线也只是普通的块。"), unit("cccccccc", "第三段。")];
  // Found as it was: unchanged, in page order.
  const later = textNote("n1aaaaaa", ["bbbbbbbb"], "标题和分割线也只是普通的块", { prefix: "第二段：", suffix: "。" });
  const earlier = textNote("n2aaaaaa", ["aaaaaaaa"], "读者可以在右上角切换成全宽", { prefix: "第一段：", suffix: "。" });
  const same = checkAnnotations([later, earlier], units);
  assert.deepEqual(same.items.map((item) => item.id), ["n2aaaaaa", "n1aaaaaa"], "page order");
  assert.equal(same.changed, true, "reordered: the file is written");
  assert.equal(same.items[0], earlier, "an anchor found as it was stays the same object");
  assert.equal(checkAnnotations([earlier, later], units).changed, false, "nothing to write");
  // Its words deleted: so is the annotation. Its block deleted: too.
  const edited = [unit("aaaaaaaa", "第一段。"), unit("bbbbbbbb", "第二段：标题、引言和分割线其实也只是很普通的块。")];
  const after = checkAnnotations([earlier, later], edited);
  assert.deepEqual(after.dropped.map((item) => item.id), ["n2aaaaaa"]);
  assert.equal(after.items.length, 1);
  assert.equal(after.items[0].anchor.quote, "标题、引言和分割线其实也只是很普通的块", "a quote edited in part follows the edit");
  assert.equal(after.items[0].anchor.prefix, "第二段：");
  assert.deepEqual(checkAnnotations([earlier], [unit("cccccccc", "别的。")]).dropped.map((item) => item.id), ["n2aaaaaa"], "its block gone, the words nowhere else");
  // One kept stays as it was sent, whatever the file says yet, until it holds what it is about.
  const waiting = checkAnnotations([earlier], [unit("cccccccc", "别的。")], { keep: new Set(["n2aaaaaa"]) });
  assert.deepEqual(waiting.items, [earlier]);
  assert.deepEqual([...waiting.waiting], ["n2aaaaaa"]);
  const named = { ...earlier, id: "n6aaaaaa", anchor: { kind: "blocks", blocks: ["aaaaaaaa", "pppppppp"], quote: "两块" } };
  const partly = checkAnnotations([named], units, { keep: new Set(["n6aaaaaa"]) });
  assert.deepEqual(partly.items[0].anchor.blocks, ["aaaaaaaa", "pppppppp"], "one of its blocks not in the file yet: none taken from it");
  assert.deepEqual(partly.places.get("n6aaaaaa"), { at: 0, offset: 0 }, "and placed by those there are");
  assert.equal(checkAnnotations([earlier], units, { keep: new Set(["n2aaaaaa"]) }).waiting.size, 0, "found whole: it waits no more");
  // An Agent rewrote the block without its id: the words found once elsewhere, in the innermost block holding them.
  const rewritten = [unit("dddddddd", "列表"), unit("eeeeeeee", "一项：读者可以在右上角切换成全宽。", 0), unit("ffffffff", "另一项", 0)];
  rewritten[0].text = "列表\n一项：读者可以在右上角切换成全宽。\n另一项";
  const found = locateAnchor(earlier.anchor, rewritten);
  assert.deepEqual(found.anchor.blocks, ["eeeeeeee"], "the item, not the list holding it");
  assert.equal(found.at, 1);
  assert.equal(locateAnchor(earlier.anchor, [unit("x0000000", "读者可以在右上角切换成全宽"), unit("y0000000", "读者可以在右上角切换成全宽")]), null, "found twice: not taken for it");
  // A block not named yet (the page's commit naming it is on its way): its blocks stay as the page proposed.
  assert.deepEqual(locateAnchor(textNote("n3aaaaaa", ["pppppppp"], "切换成全宽").anchor, [unit(null, "读者可以在右上角切换成全宽")]).anchor.blocks, ["pppppppp"]);
  // A blocks anchor: kept while one of its blocks is there, its quote their text now.
  const blocks = { id: "n4aaaaaa", text: "整块", anchor: { kind: "blocks", blocks: ["aaaaaaaa", "zzzzzzzz"], quote: "旧的" } };
  assert.deepEqual(locateAnchor(blocks.anchor, units).anchor, { kind: "blocks", blocks: ["aaaaaaaa"], quote: "第一段：读者可以在右上角切换成全宽。" });
  assert.equal(locateAnchor(blocks.anchor, [unit("cccccccc", "x")]), null);
  // Across blocks: the words of two blocks joined by a line break.
  const across = locateAnchor(textNote("n5aaaaaa", ["aaaaaaaa", "bbbbbbbb"], "切换成全宽。\n第二段：标题").anchor, units);
  assert.deepEqual(across.anchor.blocks, ["aaaaaaaa", "bbbbbbbb"]);
  // Split by Enter in its middle (a new block right after its own): found as it is across the two, its blocks both.
  const split = [unit("aaaaaaaa", "第一段：读者可以在右上角"), unit("dddddddd", "切换成全宽。"), unit("cccccccc", "第三段。")];
  const halves = locateAnchor(earlier.anchor, split);
  assert.deepEqual(halves.anchor.blocks, ["aaaaaaaa", "dddddddd"], "split: both halves' blocks");
  assert.equal(halves.anchor.quote, "读者可以在右上角\n切换成全宽");
  assert.equal(locateAnchor(earlier.anchor, [unit("aaaaaaaa", "第一段：读者可以在右上角"), unit("cccccccc", "第三段。"), unit("dddddddd", "切换成全宽。")]), null, "not with a block further on");
  assert.equal(locateAnchor(earlier.anchor, [unit("aaaaaaaa", "第一段：别的话。"), unit("ssssssss", "选项卡\n读者可以在右上角切换成全宽。")]), null, "nor the same words of their own in the next one (a container holding them further on)");
  const nested = [unit("aaaaaaaa", "第一段：读\n嵌套"), unit("eeeeeeee", "嵌套", 0), unit("dddddddd", "者可以在右上角切换成全宽。")];
  assert.deepEqual(locateAnchor(textNote("n6aaaaaa", ["aaaaaaaa"], "读\n嵌套\n者可以在右上角切换成全宽").anchor, nested)?.anchor.blocks, ["aaaaaaaa", "dddddddd"], "the block after it and what it holds");
}

// ---------- anchors the page tells ----------
{
  const anchor = { kind: "text", blocks: ["aaaaaaaa"], quote: "自动列宽、数值对齐", prefix: "表格支持排序、", suffix: "和合计行。" };
  assert.equal(sameWords(anchor, { ...anchor, quote: "自动列宽、 数值对齐" }), true, "white space aside");
  assert.equal(sameWords(anchor, { ...anchor, prefix: "别的话、表格支持排序、" }), true, "only the ends of its context the check looks at");
  assert.equal(sameWords(anchor, { ...anchor, quote: "自动列宽和、数值对齐" }), false, "a word typed into it");
  assert.equal(sameWords(anchor, { ...anchor, suffix: "合计行。" }), false, "what follows it changed");
  assert.equal(sameWords(anchor, { ...anchor, blocks: ["aaaaaaaa", "bbbbbbbb"] }), false, "split");
  assert.deepEqual(cleanAnchor({ ...anchor, blocks: ["aaaaaaaa", "BAD"], prefix: "p".repeat(40) }), { ...anchor, prefix: "p".repeat(32) });
  assert.equal(cleanAnchor({ kind: "text", blocks: [], quote: " " }), null);
}

// ---------- what the file holds ----------
{
  assert.equal(cleanItem({ id: "short", text: "x", anchor: { kind: "text", blocks: [], quote: "q" } }), null, "an id of eight letters and digits");
  // An annotation has words (the user's, 2026-11-06): one with none is none, a file's too.
  assert.equal(cleanItem({ id: "abcdefgh", text: "", anchor: { kind: "text", blocks: [], quote: "q" } }), null, "no words: none");
  assert.equal(cleanItem({ id: "abcdefgh", text: " \n ", anchor: { kind: "text", blocks: [], quote: "q" } }), null, "white space is none");
  assert.deepEqual(readItems(JSON.stringify({ v: 1, items: [{ id: "abcdefgh", text: "", anchor: { kind: "blocks", blocks: ["k3j9x2ab"], quote: "q" } }, { id: "abcdefgj", text: "x", anchor: { kind: "blocks", blocks: ["k3j9x2ab"], quote: "q" } }] })).map((item) => item.id), ["abcdefgj"], "a file's item with no words read as none");
  const clean = cleanItem({ id: "abcdefgh", text: "a\r\nb", anchor: { kind: "text", blocks: ["k3j9x2ab", "NOT-AN-ID"], quote: " q  r ", prefix: "p".repeat(40), suffix: "s" } }, "2026-10-23T10:00:00.000Z");
  assert.deepEqual(clean, { id: "abcdefgh", created: "2026-10-23T10:00:00.000Z", updated: "2026-10-23T10:00:00.000Z", text: "a\nb", anchor: { kind: "text", blocks: ["k3j9x2ab"], quote: "q r", prefix: "p".repeat(32), suffix: "s" } });
  assert.deepEqual(readItems("not json"), []);
  assert.deepEqual(readItems(JSON.stringify({ v: 1, items: [clean, clean, { id: 1 }] })).map((item) => item.id), ["abcdefgh"], "each once, what is none left out");
}

// ---------- the Markdown of 复制批注 ----------
{
  const text = annotationsMarkdown({
    title: "组件与报告模板示例",
    path: "D:\\reports\\chart-kit-gallery\\report.html",
    items: [
      { where: ["正文", "页面结构"], blocks: ["k3j9x2ab"], whole: false, quote: "读者可以在右上角切换成全宽", text: "补一句：在工作台里编辑时这个按钮是隐藏的。" },
      { where: [], blocks: ["m2p8q1zc", "n5k2a9bb"], whole: true, quote: "读取原始材料。\n确认口径与分母。", text: "第一行\n第二行" },
      { where: ["状态"], blocks: [], whole: false, quote: "还没有 id 的块", text: "按原文找" },
    ],
  });
  assert.equal(text, [
    "以下是我对这份文档的批注，共 3 条。请逐条按“建议”修改底稿；每条给出它在文档里的位置、块的 data-block-id 和批注的原文。",
    "",
    "- 文档：组件与报告模板示例",
    "- 底稿：D:\\reports\\chart-kit-gallery\\report.html",
    "",
    "## 1. 正文 › 页面结构",
    "",
    "块：`data-block-id=\"k3j9x2ab\"`",
    "",
    "> 读者可以在右上角切换成全宽",
    "",
    "建议：补一句：在工作台里编辑时这个按钮是隐藏的。",
    "",
    "## 2. 正文",
    "",
    "块：`data-block-id=\"m2p8q1zc\"`，`data-block-id=\"n5k2a9bb\"`（整块）",
    "",
    "> 读取原始材料。",
    "> 确认口径与分母。",
    "",
    "建议：第一行",
    "",
    "第二行",
    "",
    "## 3. 状态",
    "",
    "块：（还没有 id，按原文找）",
    "",
    "> 还没有 id 的块",
    "",
    "建议：按原文找",
    "",
  ].join("\n"));
  const english = annotationsMarkdown({ title: "T", path: "/r/report.html", items: [] }, { head: "My {0} annotations.", report: "Report", source: "Source", colon: ": " });
  assert.ok(english.startsWith("My 0 annotations.\n\n- Report: T\n- Source: /r/report.html"), "its words given in the UI's language");
  // One: said as one. Before the first heading: 页首 (not 正文, which a tab or a heading may be named).
  // A suggestion's blank lines make no more paragraphs.
  const one = annotationsMarkdown({ title: "T", path: "/r", items: [{ where: [], top: true, blocks: ["k3j9x2ab"], quote: "开头的话", text: "第一段\n\n\n第二段\n  \n第三段  " }] });
  assert.ok(one.startsWith("以下是我对这份文档的一条批注。"), "one annotation");
  assert.ok(one.includes("## 1. 页首\n"), "before the first heading");
  assert.ok(one.endsWith("建议：第一段\n\n第二段\n\n第三段\n"), "one blank line between its lines, however many it had");
  assert.ok(annotationsMarkdown({ title: "T", path: "/r", items: [{ where: [], blocks: [], quote: "q", text: "x" }] }).includes("\n建议：x\n"), "each with its 建议 line");
  assert.ok(annotationsMarkdown({ title: "T", path: "/r", items: [{ where: [], blocks: [], quote: "q", text: "x" }] }, { headOne: "My annotation." }).startsWith("My annotation.\n"), "its words for one");
}

// ---------- the margin ----------
{
  // Three markers on one line: the first at its line, the others below it, 4px apart.
  assert.deepEqual(stackItems([{ ideal: 200, height: 24, marker: true }, { ideal: 200, height: 24, marker: true }, { ideal: 200, height: 24, marker: true }]), [200, 228, 256]);
  // The card shown keeps its line; the marker before it goes up, the one after it down, 8px from a card.
  assert.deepEqual(stackItems([{ ideal: 300, height: 24, marker: true }, { ideal: 300, height: 80, active: true }, { ideal: 310, height: 24, marker: true }]), [268, 300, 388]);
  // Nothing above the page's top room: pushed down instead.
  assert.deepEqual(stackItems([{ ideal: 40, height: 24, marker: true }, { ideal: 60, height: 24, marker: true, active: true }], { top: 52 }), [52, 80]);
  // The format bar where it reaches into the margin is stepped over, on the side nearer the item's line.
  assert.deepEqual(stackItems([{ ideal: 100, height: 40 }], { obstacles: [{ top: 90, bottom: 130 }] }), [138], "below it, nearer");
  assert.deepEqual(stackItems([{ ideal: 100, height: 40 }], { obstacles: [{ top: 120, bottom: 160 }] }), [72], "above it, nearer");
  assert.deepEqual(stackItems([{ ideal: 60, height: 40 }], { top: 52, obstacles: [{ top: 70, bottom: 110 }] }), [118], "above it would pass the top room: below");
  // Nothing past the page's end: pushed up instead (a card near the end never makes the page longer).
  assert.deepEqual(stackItems([{ ideal: 900, height: 24, marker: true }, { ideal: 950, height: 80, active: true }], { bottom: 1000 }), [888, 920]);
  assert.deepEqual(stackItems([{ ideal: 40, height: 24, marker: true }, { ideal: 50, height: 200, active: true }], { top: 52, bottom: 200 }), [52, 84], "the top room wins over the end");
  assert.deepEqual(stackItems([]), []);
  // They ask nothing of the right side's layout (editor/page/margin.mjs): the markers stand in the
  // column's right room (the edge room, 64px; 52 at the least beside the outline in full), the card in
  // the column, so neither the column nor the outline moves for them.
  assert.ok(RAIL.markerAt + RAIL.marker <= 64, "the markers in the column's gutter");
  assert.equal(RAIL.markerAt, RAIL.bar + 2 + 1, "1px right of a block anchor's bar");
  assert.ok(RAIL.bar + 2 < 12, "a block anchor's bar left of a section bar's line");
  // The one place of a marker and of the button beside a block: right of the column, the middle of the
  // line, kept in the window, and at the column's edge, in it, where the gutter is too narrow.
  assert.equal(markerLeft(1000, 1440), 1010);
  assert.equal(markerLeft(1000, 1030), 1004, "the window's edge first");
  assert.equal(markerLeft(1000, 1000), 976, "at the column's edge at most");
  assert.equal(markerLeft(1000, 1440, 1028), 1028, "past a section's strip");
  assert.equal(markerLeft(1000, 1440, 1011), 1011, "the strip stays clear of the closer marker");
  assert.equal(markerLeft(1000, 1040, 1028), 1014, "the window's edge first");
  assert.equal(markerTop({ top: 100, height: 26 }), 101, "the middle of the line");
  assert.equal(markerTop({ top: 100, height: 400 }), 288, "several blocks: their middle");
  // Cards in the margin (cardTops): by place, each 18 above its anchor, pushed down by
  // the one above, 10 between them; the one in front back beside its anchor, those touching before it
  // going up with it, all those after it following.
  const places = (list, front) => cardTops(list, front).map(({ id, top }) => `${id}:${top}`).join(" ");
  const stack = [{ id: "c", top: 100, height: 50, created: "3" }, { id: "a", top: 100, height: 50, created: "1" }, { id: "b", top: 100, height: 50, created: "2" }, { id: "d", top: 400, height: 50, created: "4" }];
  assert.equal(places(stack), "a:82 b:142 c:202 d:382", "level with each other, the one made first first");
  assert.equal(places(stack, "a"), "a:82 b:142 c:202 d:382", "the first in front is where it was");
  assert.equal(places(stack, "c"), "a:-38 b:22 c:82 d:262", "the last in front: back at its anchor, those before it up, those after it too");
  assert.equal(places([{ id: "a", top: 10, height: 20, created: "1" }, { id: "b", top: 60, height: 20, created: "2" }]), "a:10 b:42", "one nearer the top than 18 stays there");
  assert.equal(places([{ id: "a", top: 100, height: 20, created: "1" }, { id: "b", top: 120, height: 20, created: "2" }, { id: "c", top: 400, height: 20, created: "3" }, { id: "d", top: 400, height: 20, created: "4" }], "d"), "a:82 b:112 c:352 d:382", "only those touching go up: a gap stops them");
  assert.equal(places([{ id: "x", top: 100, height: 20, created: "1" }, { id: "y", top: 100, height: 20, created: "1" }]), "x:82 y:112", "made together: by id");
  assert.deepEqual([CARD.above, CARD.gap, CARD.draft, CARD.end], [18, 10, 14, 50]);
  // A card and what stands right of the column: the cards stand where a marker does (the user's
  // 2026-11-12), the button beside a block showing only where no card stands (annotate/ markerSpot);
  // past a section's strip the button ends 52 out; the button stands clear of the bar, the strip and all.
  assert.equal(BAR.reach + RAIL.marker, 52);
  assert.equal(MARGIN.lane, RAIL.markerAt, "a card as near the column as a marker");
  assert.ok(MARGIN.lane > RAIL.bar + 2, "clear of a block anchor's bar (2px wide)");
  assert.ok(BAR.reach >= BAR.gap + BAR.width, "the pointer finds a section's strip at least across it");
  assert.ok(BAR.reach + RAIL.marker <= 64, "a marker past a section's strip in the column's gutter");
  for (const width of [1635, 1155, 1032, 1009, 1008, 995]) {
    const room = rightRoom(marginLayout({ width, outline: true }));
    assert.ok(RAIL.markerAt + RAIL.marker <= room, `${width}: the markers clear of the outline's guide and its grip (4px left of it), or of its strip`);
    assert.ok(BAR.gap + BAR.width + RAIL.marker <= room, `${width}: and past a section's strip`);
  }
}

// What stands beside another keeps the handle across its width (no 批注 button): the definitions say so,
// a row of columns always, a flowchart's node when a node shares its line.
{
  const column = { getBoundingClientRect: () => ({ top: 0, left: 0, right: 100, width: 100 }) };
  const list = { localName: "ol", classList: { contains: (name) => name === "doc-flow" } };
  const node = (left, top, before = null) => {
    const element = { localName: "li", parentElement: list, previousElementSibling: before, nextElementSibling: null, getBoundingClientRect: () => ({ top, left, right: left + 100, width: 100 }) };
    if (before) before.nextElementSibling = element;
    return element;
  };
  assert.equal(standsBeside("columns", column), true, "a row of columns");
  assert.equal(standsBeside("paragraph", column), false, "a paragraph");
  assert.equal(standsBeside("nothing such", column), false, "what the definitions do not know");
  const first = node(0, 0);
  const second = node(130, 0, first);
  assert.ok(standsBeside("step", first) && standsBeside("step", second), "two nodes on a line, both");
  const third = node(0, 200, second);
  assert.equal(standsBeside("step", third), false, "a node on a line of its own");
}

// ---------- a report's units, as the server reads them ----------
const REPORT = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>示例</title></head><body>
<main class="doc-page" data-doc-id="demo">
  <header class="doc-header"><h1 class="doc-title">示例报告</h1></header>
  <p data-block-id="leadaaaa">开头的概括。</p>
  <section class="doc-sheet-shell" data-doc-sheets="s">
    <div class="doc-sheet-tabs" role="tablist">
      <button class="doc-sheet-tab" type="button" data-sheet-tab="a" aria-controls="sheet-a" data-block-id="tabaaaaa">正文</button>
      <button class="doc-sheet-tab" type="button" data-sheet-tab="b" aria-controls="sheet-b" data-block-id="tabbbbbb">状态</button>
    </div>
    <div id="sheet-a" data-doc-sheet="a" role="tabpanel">
      <h2 data-block-id="headaaaa">页面结构</h2>
      <p data-block-id="paraaaaa">公式 <span class="doc-math-inline">\\(x^2\\)</span> 在 <strong>这里</strong>，读者可以在右上角切换成全宽。</p>
      <h3 data-block-id="headbbbb">小节</h3>
      <ul data-block-id="listaaaa">
        <li data-block-id="itemaaaa">读取原始材料。</li>
        <li data-block-id="itembbbb">确认口径与分母。</li>
      </ul>
      <details class="doc-details" data-block-id="detaaaaa"><summary><span class="doc-details-summary-label">展开看</span></summary><div class="doc-details-content"><p data-block-id="parbbbbb">折叠里的话。</p></div></details>
    </div>
    <div id="sheet-b" data-doc-sheet="b" role="tabpanel" hidden>
      <p data-block-id="parccccc">另一张表里的话。</p>
    </div>
  </section>
</main>
</body></html>
`;
{
  const units = reportUnits(REPORT);
  const byId = Object.fromEntries(units.filter((each) => each.id).map((each) => [each.id, each]));
  assert.equal(byId.paraaaaa.text, String.raw`公式 \(x^2\) 在 这里，读者可以在右上角切换成全宽。`, "a formula as the file writes it (its TeX in its delimiters, so an Agent finds the quote), the tags out");
  assert.deepEqual(byId.paraaaaa.where, ["正文", "页面结构"], "the tab's name, then the headings above it");
  assert.deepEqual(byId.itembbbb.where, ["正文", "页面结构", "小节"]);
  assert.deepEqual(byId.headbbbb.where, ["正文", "页面结构"], "a heading is under the ones before it, not itself");
  assert.deepEqual(byId.parbbbbb.where, ["正文", "页面结构", "小节", "展开看"], "a disclosure's title last");
  assert.equal(byId.parccccc.where[0], "状态", "another tab's panel names its tab");
  assert.equal(units[units.indexOf(byId.itemaaaa)].parent, units.indexOf(byId.listaaaa), "an item's parent is its list");
  assert.ok(units.indexOf(byId.headaaaa) < units.indexOf(byId.itemaaaa) && units.indexOf(byId.itemaaaa) < units.indexOf(byId.itembbbb), "page order (the items too)");
}

// ---------- the file on the server ----------
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "annotations-"));
  const directory = path.join(root, "demo");
  await fs.mkdir(directory, { recursive: true });
  let source = REPORT;
  await fs.writeFile(path.join(directory, "report.html"), source);
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify({ title: "示例报告" }));
  const told = []; // what the check deleted, as the edit service is told it (for the Agent's next check or export)
  const store = createAnnotations({ reportsDirectory: root, read: async (slug) => (slug === "demo" ? { text: source } : null), dropped: (slug, items) => told.push([slug, items.map((item) => item.id)]) });
  const file = () => fs.readFile(path.join(directory, "annotations.json"), "utf8").catch(() => null);
  const note = { id: "note0001", text: "补一句", anchor: { kind: "text", blocks: ["paraaaaa"], quote: "读者可以在右上角切换成全宽", prefix: "，", suffix: "。" } };

  let [status, body] = await store.list("demo");
  assert.equal(status, 200);
  assert.deepEqual(body.items, [], "none yet");
  assert.equal(await file(), null, "and no file");
  [status, body] = await store.change({ slug: "demo", put: note });
  assert.equal(status, 200);
  assert.equal(body.items.length, 1);
  assert.equal(JSON.parse(await file()).v, 1, "written");
  const created = body.items[0].created;
  [, body] = await store.change({ slug: "demo", put: { ...note, text: "补一句：按钮是隐藏的。" } });
  assert.equal(body.items[0].text, "补一句：按钮是隐藏的。", "changed by its id");
  assert.equal(body.items[0].created, created, "made when it was first saved");
  assert.deepEqual(await store.change({ slug: "demo", put: { ...note, text: "" } }), [400, { ok: false, reason: "item" }], "no words: refused");
  assert.equal(JSON.parse(await file()).items[0].text, "补一句：按钮是隐藏的。", "the file as it was");

  // Where the reader's edit took its words (typed into: a quote under ten characters the check would not
  // follow), told by the page before its commit: written as told, only for annotations the file has;
  // the check after the commit finds them as they are.
  const short = { id: "note0003", text: "短的", anchor: { kind: "text", blocks: ["paraaaaa"], quote: "右上角", prefix: "读者可以在", suffix: "切换成全宽" } };
  await store.change({ slug: "demo", put: short });
  [, body] = await store.change({ slug: "demo", anchors: { note0003: { ...short.anchor, quote: "右上方角" }, nothere1: short.anchor } });
  assert.equal(body.items.find((item) => item.id === "note0003").anchor.quote, "右上方角", "the anchor as the page has it");
  assert.ok(!body.items.some((item) => item.id === "nothere1"), "none made of an anchor");
  source = source.replace("右上角", "右上方角"); // the commit
  await store.afterWrite("demo");
  [, body] = await store.list("demo");
  assert.equal(body.items.find((item) => item.id === "note0003")?.anchor.quote, "右上方角", "found after the commit");
  [, body] = await store.change({ slug: "demo", remove: "note0003" });
  source = REPORT;

  // The block's words deleted (an Agent's write): the check after it deletes the annotation.
  [, body] = await store.change({ slug: "demo", put: { id: "note0002", text: "整块的建议", anchor: { kind: "blocks", blocks: ["listaaaa"], quote: "读取原始材料。" } } });
  const [, copied] = await store.copy("demo");
  assert.equal(copied.title, "示例报告");
  assert.equal(copied.path, path.resolve(root, "demo", "report.html"));
  assert.deepEqual(copied.items.map((item) => [item.where.join(" › "), item.blocks.join(","), item.whole]), [["正文 › 页面结构", "paraaaaa", false], ["正文 › 页面结构 › 小节", "listaaaa", true]]);
  assert.ok(copied.items.every((item) => !item.top));
  await store.change({ slug: "demo", put: { id: "note0004", text: "开头", anchor: { kind: "text", blocks: ["leadaaaa"], quote: "开头的概括" } } });
  const [, lead] = await store.copy("demo");
  assert.deepEqual([lead.items[0].where, lead.items[0].top], [[], true], "before the first heading: 页首 (not 正文, a tab's name here)");
  await store.change({ slug: "demo", remove: "note0004" });
  source = source.replace("读者可以在右上角切换成全宽。", "别的话。");
  await store.afterWrite("demo");
  [, body] = await store.list("demo");
  assert.deepEqual(body.items.map((item) => item.id), ["note0002"], "the annotation went with its words");
  assert.deepEqual(body.dropped, ["note0001"], "the check says what it deleted (an undo may bring it back)");
  assert.deepEqual(told, [["demo", ["note0001"]]], "and tells it once, as it deletes it");
  [, body] = await store.change({ slug: "demo", put: { ...note, text: "回来了" } });
  assert.deepEqual(body.dropped, [], "put back: no longer among those deleted");
  source = REPORT; // the words back (the undo's commit)

  // 删除批注, then 撤销.
  [, body] = await store.change({ slug: "demo", clear: true });
  assert.equal(body.items.length, 0);
  assert.equal(body.removed.length, 2, "what was removed, for 撤销");
  assert.equal(await file(), null, "nothing left: no file");
  const removed = body.removed;
  [, body] = await store.change({ slug: "demo", restore: removed });
  assert.deepEqual(body.items.map((item) => item.id).sort(), ["note0001", "note0002"].sort(), "put back as they were");
  // A restore never takes one back to a text older than the file's (typed offline, sent late).
  [, body] = await store.change({ slug: "demo", put: { ...note, text: "新的" } });
  [, body] = await store.change({ slug: "demo", restore: [{ ...note, text: "旧的", updated: "2000-01-01T00:00:00.000Z" }] });
  assert.equal(body.items.find((item) => item.id === "note0001").text, "新的", "the newer text kept");
  [, body] = await store.change({ slug: "demo", restore: [{ ...note, text: "更新的", updated: "2999-01-01T00:00:00.000Z" }] });
  assert.equal(body.items.find((item) => item.id === "note0001").text, "更新的", "a newer one taken");
  [, body] = await store.change({ slug: "demo", remove: "note0002" });
  assert.deepEqual(body.items.map((item) => item.id), ["note0001"]);
  [, body] = await store.change({ slug: "demo", restore: [{ ...note, id: "note0008", text: "有字的" }, { ...note, id: "note0009", text: "" }] });
  assert.deepEqual(body.items.map((item) => item.id), ["note0001", "note0008"], "a restore leaves out one with no words");
  assert.equal((await store.list("missing"))[0], 404);
  assert.equal((await store.change({ slug: "../x", clear: true }))[0], 400);
  assert.equal(told.length, 1, "a removal, a clear and a restore are the reader's: none told");
  await fs.rm(root, { recursive: true, force: true });
}

// ---------- what the file does not hold yet ----------
// Blocks an Agent wrote have no id until a commit names them, words just typed are not in the file
// until a commit writes them, and a commit can be slower than the reader. A new annotation stands as
// it was sent until the file holds what it is about, whatever else is saved or written meanwhile; from
// then on it is judged as any other. One whose commit never comes goes after a while.
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "annotations-waiting-"));
  await fs.mkdir(path.join(root, "demo"), { recursive: true });
  const page = (body) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>示例</title></head><body><main class="doc-page" data-doc-id="demo"><header class="doc-header"><h1 class="doc-title">示例</h1></header>${body}</main></body></html>`;
  let source = page('<p data-block-id="namedaaa">有名字的第一段。</p><p>还没有名字的第二段。</p><p>还没有名字的第三段。</p><hr>');
  let time = 1_000_000;
  const told = [];
  const store = createAnnotations({ reportsDirectory: root, read: async () => ({ text: source }), dropped: (slug, items) => told.push(...items.map((item) => item.id)), now: () => time });
  const alone = { id: "wait0001", text: "一块", anchor: { kind: "blocks", blocks: ["newaaaaa"], quote: "还没有名字的第二段。" } };
  const both = { id: "wait0002", text: "两块", anchor: { kind: "blocks", blocks: ["namedaaa", "newbbbbb"], quote: "有名字的第一段。\n还没有名字的第三段。" } };
  const across = { id: "wait0003", text: "跨块的字", anchor: { kind: "text", blocks: ["namedaaa", "newaaaaa"], quote: "第一段。\n还没有名字", prefix: "有名字的", suffix: "的第二段" } };
  const rule = { id: "wait0004", text: "分隔线", anchor: { kind: "blocks", blocks: ["newccccc"], quote: "" } };
  const typed = { id: "wait0005", text: "刚打的字", anchor: { kind: "text", blocks: ["namedaaa"], quote: "刚打的字", prefix: "", suffix: "" } };
  const ids = (body) => body.items.map((item) => item.id).sort();
  let body;
  for (const item of [alone, both, across, rule, typed]) [, body] = await store.change({ slug: "demo", put: item });
  assert.deepEqual(ids(body), ["wait0001", "wait0002", "wait0003", "wait0004", "wait0005"], "each saved leaves those before it, what they are about not in the file yet");
  assert.deepEqual(body.items.find((item) => item.id === "wait0002").anchor.blocks, ["namedaaa", "newbbbbb"], "its blocks as sent, one named and one not");
  await store.afterWrite("demo"); // a commit that was under way, naming none of them
  [, body] = await store.list("demo");
  assert.equal(body.items.length, 5, "nor does a write that does not hold them take them");
  assert.deepEqual(body.dropped, []);

  // The commit lands: the file names them, the words are in it, and they stand in page order.
  source = page('<p data-block-id="namedaaa">刚打的字有名字的第一段。</p><p data-block-id="newaaaaa">还没有名字的第二段。</p><p data-block-id="newbbbbb">还没有名字的第三段。</p><hr data-block-id="newccccc">');
  await store.afterWrite("demo");
  [, body] = await store.list("demo");
  assert.deepEqual(body.items.find((item) => item.id === "wait0002").anchor.blocks, ["namedaaa", "newbbbbb"], "both blocks, the file naming them");
  assert.equal(body.items.find((item) => item.id === "wait0002").anchor.quote, "刚打的字有名字的第一段。\n还没有名字的第三段。", "its text as the file has it now");
  assert.deepEqual(body.items.at(-1).id, "wait0004", "in page order");

  // From then on it goes with what it is about, at once, as any other.
  source = page('<p data-block-id="namedaaa">别的话。</p><p data-block-id="newbbbbb">还没有名字的第三段。</p>');
  await store.afterWrite("demo");
  [, body] = await store.list("demo");
  assert.deepEqual(ids(body), ["wait0002"], "those whose block and words are gone, gone");
  assert.deepEqual(told.sort(), ["wait0001", "wait0003", "wait0004", "wait0005"]);

  // A commit that never comes (the page closed first): what never was in the file goes after a while.
  told.length = 0;
  await store.change({ slug: "demo", put: alone });
  time += 5 * 60 * 1000;
  await store.afterWrite("demo");
  assert.ok(ids((await store.list("demo"))[1]).includes("wait0001"), "five minutes on, still waited for");
  time += 6 * 60 * 1000;
  await store.afterWrite("demo");
  assert.ok(!ids((await store.list("demo"))[1]).includes("wait0001"), "and gone past that");
  assert.deepEqual(told, ["wait0001"], "said, as any annotation a check deletes");

  // What waited in the browser comes the same way, its commit possibly still behind it.
  await store.change({ slug: "demo", restore: [alone] });
  await store.afterWrite("demo");
  assert.ok(ids((await store.list("demo"))[1]).includes("wait0001"), "a restored one is waited for too");
  await store.change({ slug: "demo", remove: "wait0001" });

  // An annotation the file has and the reader goes on writing is kept for that save alone.
  source = page('<p data-block-id="namedaaa">有名字的第一段。</p>');
  const words = { id: "wait0006", text: "一", anchor: { kind: "text", blocks: ["namedaaa"], quote: "有名字的第一段", prefix: "", suffix: "" } };
  await store.change({ slug: "demo", put: words });
  source = page('<p data-block-id="namedaaa">别的话。</p>');
  await store.change({ slug: "demo", put: { ...words, text: "一二" } });
  await store.afterWrite("demo");
  assert.ok(!ids((await store.list("demo"))[1]).includes("wait0006"), "its words gone, the next check takes it");
  await fs.rm(root, { recursive: true, force: true });
}

// ---------- what the check deleted, said to the Agent ----------
// The edit service keeps each deletion in its state directory (dropped-annotations.mjs);
// gallery check and gallery export take them and say them once: each annotation its id, its text and
// the words it was on, but one back in annotations.json since (an undo brought its words back); the
// dev server's log says them as they happen (droppedLines without a time).
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "annotations-dropped-"));
  const reportsDirectory = path.join(root, "reports");
  const stateDirectory = path.join(root, ".edit-state");
  await fs.mkdir(path.join(reportsDirectory, "demo"), { recursive: true });
  const file = path.join(reportsDirectory, "demo", "annotations.json");
  const item = (id, text, quote, kind = "text") => ({ id, text, anchor: { kind, blocks: ["paraaaaa"], quote, prefix: "", suffix: "" } });
  const gone = [item("lob25hue", "这里补一句：编辑时这个按钮是隐藏的", "按钮在右上角"), item("sfahd3m1", "整段改短一点", "第一段\n第二段", "blocks")].map(droppedOf);
  const time = "2026-10-25T09:05:00.000Z";
  await keepDropped({ stateDirectory, reportsDirectory, slug: "demo", time, items: gone });
  await keepDropped({ stateDirectory, reportsDirectory, slug: "demo", time, items: [droppedOf(item("backback", "回来的", "撤销带回来的字"))] });
  // One put back since (an undo): in the file again, so not said.
  await fs.writeFile(file, JSON.stringify({ v: 1, items: [{ ...item("backback", "回来的", "撤销带回来的字"), created: time, updated: time }] }));
  const entries = await takeDropped({ stateDirectory, reportsDirectory, slug: "demo" });
  assert.deepEqual(entries, [{ time, items: gone }], "the deletion kept, the one back left out");
  const at = new Date(time);
  const clock = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
  const lines = droppedReportLines(file, entries, { today: at });
  assert.deepEqual(lines.slice(1), [
    '  lob25hue "这里补一句：编辑时这个按钮是隐藏的" on "按钮在右上角"',
    '  sfahd3m1 "整段改短一点" on the blocks "第一段 第二段"',
    "  they were the reader's: say in your hand-off which your edit carried out and which you left, and never write them back",
  ]);
  assert.equal(lines[0].split(" ")[1], `${file}:`, "the file as the system writes its path");
  assert.match(lines[0], new RegExp(`^annotations \\S*demo[\\\\/]annotations\\.json: at ${clock}, Gallery deleted 2 批注 \\(annotations\\) whose words are gone from the document \\(rewritten or deleted\\):$`));
  assert.deepEqual(await takeDropped({ stateDirectory, reportsDirectory, slug: "demo" }), [], "said once: taken away");
  assert.deepEqual(droppedReportLines(file, []), [], "none: nothing");
  assert.match(droppedLines(file, { items: gone.slice(0, 1) })[0], /: Gallery deleted 1 批注 \(annotation\) whose words are gone/, "the log's: no time");
  await fs.rm(root, { recursive: true, force: true });
}

console.log("Checked 批注: quotes found again (as they are, only as they are, by context, half kept in order, split across a block and the next), the check deleting what lost its words or blocks and following a partial edit, page order, ids not given yet, a new annotation the file does not hold yet standing as it was sent, the anchors the page tells (sameWords, cleanAnchor), the Markdown of 复制批注 (one, 页首, blank lines), the markers' stacking and their room beside the outline (they ask nothing of the layout), a document's units and places, and the file (put, remove, clear, restore, the page's anchors before a commit, checked after a write), and what a check deleted told, kept and said once to the Agent (those back since left out).");
