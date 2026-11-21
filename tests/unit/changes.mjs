import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";
import { readText } from "../../src/editor/page/annotate/anchors.mjs";
import { barPlace } from "../../src/editor/page/changes/bar.mjs";
import { goneMark, placeOf, putMark, takeMark } from "../../src/editor/page/changes/gone-words.mjs";
import { wordMarks } from "../../src/editor/page/changes/words.mjs";
import { createCommits } from "../../src/editor/page/commit.mjs";
import { GONE_WORDS, captureLayout, newHost, ownHTML, prepareBlock, serializeInner } from "../../src/editor/page/core.mjs";
import { createEditService } from "../../src/editor/service.mjs";
import { addBlockIds, commitEdits, diffRows, instrument, isNewDocument, rebaseOnto, shownSource } from "../../src/editor/source.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";

// The Agent's changes (docs/editor.md "Agent's changes"): what diffRows says an Agent changed of a
// report against the baseline, by blocks (source/changes.mjs); the reader's commits applied to the
// baseline too, so that they never count (rebaseOnto); the words the page marks (page/changes/words.mjs);
// the words taken out shown in a block and never its content (page/changes/gone-words.mjs, core.mjs
// serializeInner and ownHTML); and the edit service's review (editor/changes.mjs): started by a write
// that was not its own, grown, kept (accept), reverted and the revert undone, through POST
// /__gallery/edit/changes, the reader's commits replayed on its baseline, kept on disk over a restart,
// never written into the report.

const page = (body, title = "报告") => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title></head><body>
<main class="doc-page" data-doc-id="demo">
  <header class="doc-header"><h1 class="doc-title">${title}</h1></header>
${body}</main>
</body></html>
`;
const BODY = `  <p>第一段文字在这里，说的是开头。</p>
  <p>我们先理解材料，然后再动手写正文。</p>
  <p>第三段要被删掉的内容，原样留着。</p>
  <p>最后一段收尾的话。</p>
`;
const BASE = page(BODY);

// ---------- diffRows ----------
{
  const diff = (after, before = BASE) => diffRows(before, after);
  const added = diff(BASE.replace("  <p>最后一段", "  <p>新加的一段。</p>\n  <p>最后一段"));
  assert.deepEqual(added.counts, { added: 1, changed: 0, removed: 0 });
  assert.equal(added.added.length, 1);
  assert.ok(added.added[0].ref.hash && added.added[0].ref.nth === 0, "a block with no id is named by its hash");

  const removed = diff(BASE.replace("  <p>第三段要被删掉的内容，原样留着。</p>\n", ""));
  assert.deepEqual(removed.counts, { added: 0, changed: 0, removed: 1 });
  assert.equal(removed.removed.length, 1);
  assert.equal(removed.removed[0].count, 1);
  assert.equal(removed.removed[0].rows[0].text, "第三段要被删掉的内容，原样留着。");
  assert.ok(removed.removed[0].before?.hash, "the line stands above the block after it");

  const changed = diff(BASE.replace("先理解材料", "先读懂材料").replace("动手写", "开始写"));
  assert.deepEqual(changed.counts, { added: 0, changed: 1, removed: 0 });
  assert.deepEqual(changed.changed[0].texts, [{ nth: 0, base: "我们先理解材料，然后再动手写正文。" }]);

  const retitled = diff(page(BODY, "新标题"));
  assert.deepEqual(retitled.title, { base: "报告" });
  assert.deepEqual(retitled.changed[0].ref, { title: true });

  const list = diff(BASE.replace("  <p>最后一段", "  <ul><li>一</li><li>二</li><li>三</li></ul>\n  <p>最后一段"));
  assert.equal(list.counts.added, 3, "a list counts as its items");
  assert.equal(list.added.length, 1, "the list alone is listed (the outermost)");

  const section = diff(BASE.replace("  <p>最后一段", `  <section class="doc-section"><h2>新的一节</h2><p>甲</p><p>乙</p></section>\n  <p>最后一段`));
  assert.equal(section.counts.added, 3, "a section counts as its blocks");
  assert.equal(section.added.length, 1);

  const wrapped = diff(BASE.replace("  <p>第一段文字在这里，说的是开头。</p>\n  <p>我们先理解材料，然后再动手写正文。</p>", `  <div class="doc-panel"><p>第一段文字在这里，说的是开头。</p>\n  <p>我们先理解材料，然后再动手写正文。</p></div>`));
  assert.deepEqual(wrapped.counts, { added: 1, changed: 0, removed: 0 }, "two paragraphs put in a panel: the panel is new, they are not");

  const moved = diff(BASE.replace("  <p>第一段文字在这里，说的是开头。</p>\n", "").replace("  <p>最后一段收尾的话。</p>\n", "  <p>最后一段收尾的话。</p>\n  <p>第一段文字在这里，说的是开头。</p>\n"));
  assert.deepEqual(moved.counts, { added: 1, changed: 0, removed: 1 }, "a block moved is deleted and added");

  assert.equal(diff(BASE.replace("<p>最后一段", '<p data-block-id="abcd1234">最后一段')), null, "an id is no change");
  assert.equal(diff(BASE.replace(/\n {2}<p>/g, "\n      <p>")), null, "nor indentation");
  const natural = page(`  <p>甲</p>\n  <table><tr><th>名称</th></tr><tr><td>一</td></tr></table>\n`);
  assert.equal(diffRows(shownSource(natural).text, shownSource(natural.replace("<table>", "<table >")).text), null, "nor natural HTML's writing, as pages see it");

  const twins = diff(BASE.replace("  <p>最后一段", "  <p></p>\n  <p></p>\n  <p>最后一段"));
  assert.deepEqual(twins.added.map(({ ref }) => ref.nth), [0, 1], "twins are told apart by their order");

  const picture = (src) => BASE.replace("  <p>最后一段收尾的话。</p>\n", `  <figure class="doc-figure"><img src="${src}" alt=""></figure>\n`);
  assert.equal(diffRows(picture("a.png"), picture("b.png")).changed[0].whole, true, "a change with no words to tell is the whole block");

  const nested = (words) => BASE.replace("  <p>最后一段收尾的话。</p>\n", `  <ul><li>${words}<ul><li>子项的文字</li></ul></li></ul>\n`);
  const item = diffRows(nested("这是列表项自己的一段文字"), nested("这是列表项自己改过的一段文字"));
  assert.deepEqual(item.changed.map((entry) => entry.texts), [[{ nth: 0, base: "这是列表项自己的一段文字" }]], "an item's own words, not those of the list it holds");

  assert.equal(diffRows(BASE, BASE), null);

  // What the page's ghost of deleted blocks shows of them: each with words a row, its tag, its own
  // words, how deep among them, an item's marker and number; a table a line each row; a container with
  // no words of its own none (its blocks stand for it).
  const ghosted = diffRows(BASE.replace("  <p>最后一段", `  <h2>小节</h2>\n  <ol start="3"><li>甲<ul><li>甲甲</li></ul></li><li>乙</li></ol>\n  <table><tr><th>名</th><th>值</th></tr><tr><td>一</td><td>2</td></tr></table>\n  <p>最后一段`), BASE);
  assert.equal(ghosted.removed.length, 1);
  assert.deepEqual(ghosted.removed[0].rows, [
    { kind: "heading", tag: "h2", depth: 0, text: "小节" },
    { kind: "item", tag: "li", depth: 0, text: "甲", marker: "ol", number: 3 },
    { kind: "item", tag: "li", depth: 1, text: "甲甲", marker: "ul" },
    { kind: "item", tag: "li", depth: 0, text: "乙", marker: "ol", number: 4 },
    { kind: "table", tag: "table", depth: 0, text: "名 · 值\n一 · 2" },
  ]);
  assert.equal(ghosted.removed[0].more, undefined);
  const many = diffRows(BASE.replace("  <p>最后一段", `${Array.from({ length: 53 }, (_, n) => `  <p>删掉的第 ${n} 段</p>\n`).join("")}  <p>最后一段`), BASE);
  assert.equal(many.removed[0].rows.length, 50);
  assert.equal(many.removed[0].more, 3, "past 50, how many more");
}

// ---------- the words taken out, shown in a block ----------
// Never its content: written as if they were not there (the text either side of the mark one text,
// a space split from the non-breaking one after it one space, as before), never in what undo records,
// and taken out the block is as it was, one text node again, the caret where it was.
{
  const { window } = new JSDOM(`<p data-ge-block="1" contenteditable="true">甲乙 &nbsp;丙丁<strong>戊</strong></p>`);
  const { document } = window;
  const block = document.querySelector("p");
  const before = { html: serializeInner(block), own: ownHTML(block), inner: block.innerHTML };
  const read = readText([block]);
  const marks = wordMarks("甲乙 被删的词丙丁戊 结尾", read.text).cuts;
  assert.deepEqual(marks.map(({ at, text }) => [at, text]), [[3, "被删的词"], [6, " 结尾"]]);
  const caret = document.createRange();
  caret.setStart(block.firstChild, 5); // after 丙
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(caret);
  const shown = [];
  for (const { at, text } of [...marks].reverse()) {
    const mark = goneMark(text, document);
    putMark(mark, placeOf(read, at));
    shown.push(mark);
  }
  assert.equal(block.querySelectorAll(GONE_WORDS).length, 2);
  assert.equal(block.textContent, "甲乙  丙丁戊", "no words of theirs in its text");
  assert.equal(serializeInner(block), before.html, "written as before");
  assert.equal(ownHTML(block), before.own, "undo records it as before");
  for (const mark of shown) takeMark(mark);
  assert.equal(block.innerHTML, before.inner, "taken out: as it was");
  assert.equal(block.childNodes.length, 2, "one text node again");
  assert.equal(window.getSelection().anchorNode, block.firstChild);
  assert.equal(window.getSelection().anchorOffset, 5, "the caret where it was");
  // Put between a space and the non-breaking space after it (after the space: the words taken out at a line's end).
  const split = goneMark("词", document);
  putMark(split, { place: { node: block.firstChild, offset: 2 }, side: "after" });
  assert.equal(split.previousSibling.data, "甲乙 ");
  assert.equal(serializeInner(block), before.html, "the two halves of the space written as the one space it was");
  takeMark(split);
  assert.equal(block.innerHTML, before.inner);
  // A live range given (a selection across blocks' piece, text-select/) kept on its words: its start in
  // the half that goes, its end past the block's text.
  const kept = goneMark("词", document);
  putMark(kept, { place: { node: block.firstChild, offset: 1 }, side: "after" }); // 甲乙 | 词 | "  丙丁"
  const piece = document.createRange();
  piece.setStart(kept.nextSibling, 2); // after "  "
  piece.setEnd(block, block.childNodes.length);
  assert.equal(piece.toString(), "丙丁戊");
  takeMark(kept, [piece]);
  assert.equal(block.innerHTML, before.inner);
  assert.equal(piece.startContainer, block.firstChild);
  assert.equal(piece.startOffset, 4);
  assert.equal(piece.toString(), "丙丁戊", "the range on the same words");
  // A space at either end of the words drawn apart from them, where the text beside has none.
  const tailed = goneMark("that were removed ", document, { before: " ", after: "s" });
  assert.equal(tailed.getAttribute("data-ge-gone-words"), "that were removed");
  assert.ok(tailed.hasAttribute("data-ge-gone-tail") && !tailed.hasAttribute("data-ge-gone-lead"));
  const led = goneMark(" 结尾", document, { before: "戊" });
  assert.ok(led.hasAttribute("data-ge-gone-lead") && !led.hasAttribute("data-ge-gone-tail"));
  assert.ok(!goneMark(" 词 ", document, { before: " ", after: " " }).hasAttribute("data-ge-gone-lead"), "none where the text beside has its own");
}

// ---------- isNewDocument ----------
{
  const starter = fsSync.readFileSync(path.join(projectRoot, "src", "render", "starter", "doc.html"), "utf8").replace(/__REPORT_TITLE__/g, "新文档").replace(/__REPORT_SLUG__/g, "demo");
  assert.equal(isNewDocument(starter), true, "the starter is a new document");
  assert.equal(isNewDocument(starter.replace("</main>", "<p>正文</p></main>")), false);
  assert.equal(isNewDocument(BASE), false);
}

// ---------- wordMarks ----------
{
  const marks = wordMarks("我们先理解材料", "我们先读懂材料");
  assert.deepEqual(marks.ins, [[3, 5]]);
  assert.deepEqual(marks.cuts, [{ at: 5, text: "理解" }]);
  assert.deepEqual(wordMarks("abc def", "abc"), { ins: [], cuts: [{ at: 3, text: " def" }] });
  assert.deepEqual(wordMarks("abc", "abc new"), { ins: [[3, 7]], cuts: [] });
  assert.deepEqual(wordMarks("the old words", "the new words").ins, [[4, 7]], "English goes by words");
}

// A page opened on `source` (as the service serves it), editing, building commits as the browser's does.
function studio(source) {
  const { html, map } = instrument(source);
  const { document } = new JSDOM(html).window;
  const baselines = new Map();
  for (const block of map.blocks) baselines.set(block.id, prepareBlock(document.querySelector(`[data-ge-block="${block.id}"]`), block));
  let layout = captureLayout(document, map);
  const commits = createCommits({ root: document, map, baselines, units: new Map(), boxes: new Map(), getLayout: () => layout, setLayout: (next) => (layout = next) });
  const text = (words) => [...document.querySelectorAll("[data-ge-block]")].find((node) => node.textContent.includes(words));
  return { document, map, commits, text };
}

// ---------- rebaseOnto ----------
{
  const agent = BASE.replace("  <p>最后一段", "  <p>Agent 加的一段。</p>\n  <p>最后一段").replace("先理解材料", "先读懂材料");
  const s = studio(agent);
  s.text("第一段文字").innerHTML = "第一段文字在这里，说的是开头（读者改）。";
  s.text("动手写正文").innerHTML = "我们先读懂材料，然后再认真动手写正文。";
  s.text("Agent 加的").innerHTML = "Agent 加的一段，读者也写了。";
  const { request } = s.commits.build();
  const file = commitEdits({ current: agent, ...request, opening: agent }).text;
  const base = rebaseOnto(BASE, { ...request, opening: agent });
  assert.ok(base.includes("第一段文字在这里，说的是开头（读者改）。"), "a block the Agent did not touch takes the reader's edit");
  assert.ok(base.includes("我们先理解材料，然后再认真动手写正文。"), "words the Agent did not change take the reader's, the Agent's stay out");
  assert.ok(!base.includes("Agent 加的"), "a block the Agent added stays out");
  const diff = diffRows(base, file);
  assert.deepEqual(diff.counts, { added: 1, changed: 1, removed: 0 }, "the reader's own edits are none of the Agent's");
}

// A list deleted whole while the Agent added an item to it and linked to its first: the file takes it out item by
// item and refuses the one something refers to, a conflict that names the items that went (`went`); the baseline
// takes those out alone (without `went` the whole operation stayed out, the other item counted as deleted by the
// Agent and 撤回 putting it back; before 2026-11-17 the whole list went, the item kept counted as added).
{
  const START = addBlockIds(page(`  <p>开头一段。</p>
  <ul>
    <li id="a-item">甲项要 11 分钟。</li>
    <li>乙项要 20 分钟。</li>
  </ul>
  <p>最后一段收尾的话。</p>
`)).text;
  const shown = shownSource(START).text;
  const s = studio(shown);
  s.text("甲项").closest("ul").remove();
  s.text("开头").innerHTML = "开头一段（读者）。";
  const agent = START.replace(/(<li[^>]*>乙项要 20 分钟。<\/li>)/, "$1\n    <li>丙项是 Agent 加的。</li>").replace(/\n( {2}<p[^>]*>最后一段)/, '\n  <p>见<a href="#a-item">甲项</a>。</p>\n$1');
  const { request } = s.commits.build();
  const answer = commitEdits({ current: agent, ...request, opening: shown });
  const held = answer.units.find((entry) => entry.status === "conflict");
  assert.ok(held?.reason === "referenced" && held.went?.length === 1 && !answer.text.includes("乙项") && answer.text.includes("甲项要"), JSON.stringify(answer.units));
  const base = rebaseOnto(START, { ...request, opening: shown }, answer);
  assert.ok(!base.includes("乙项") && base.includes("甲项要 11 分钟。") && base.includes("开头一段（读者）。"), `the item that went is out of the baseline, the one kept stays: ${base}`);
  assert.deepEqual(diffRows(base, answer.text).counts, { added: 2, changed: 0, removed: 0 }, "the Agent's item and paragraph alone");
}

// ---------- the service ----------
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-changes-"));
  const state = path.join(root, ".gallery", "state");
  const folder = path.join(root, "demo");
  const file = path.join(folder, "doc.html");
  const json = path.join(folder, "doc.json");
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(file, BASE);
  await fs.writeFile(json, `${JSON.stringify({ title: "报告", description: "d" }, null, 2)}\n`);
  let service = null;
  const told = [];
  const make = () => createEditService({ reportsDirectory: root, stateDirectory: state, onChanges: (slug) => told.push(slug) });
  service = make();
  const server = http.createServer((request, response) => (request.url === "/__gallery/edit/changes" ? service.changes : service.commit)(request, response));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const host = `127.0.0.1:${server.address().port}`;
  const post = async (route, body) => {
    const response = await fetch(`http://${host}/__gallery/edit/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": service.token },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const read = async () => (await post("changes", { slug: "demo", action: "read" })).body;
  const disk = (name) => fs.readFile(path.join(state, "changes", "demo", name), "utf8").catch(() => null);
  // A page served the file as it is now, and the preview taking it (routes.mjs).
  const open = async () => {
    const source = await fs.readFile(file, "utf8");
    const shown = shownSource(source).text;
    service.preview("demo", shown);
    await service.noteTaken("demo", source);
    return studio(shown);
  };
  // A paragraph of `words` put before the last one, whatever id that has.
  const beforeLast = (text, words) => text.replace(/\n( {2}<p[^>]*>最后一段)/, `\n  <p>${words}</p>\n$1`);
  // The Agent writes the file; the preview's announcement takes it.
  const agentWrites = async (change) => {
    const before = await fs.readFile(file, "utf8");
    const after = change(before);
    assert.notEqual(after, before, "the Agent's write changes the file");
    await fs.writeFile(file, after);
    return service.noteTaken("demo", after);
  };
  // A commit of the page's, built from what it holds now.
  const commit = async (s) => {
    const built = s.commits.build();
    const answer = await post("commit", { slug: "demo", opening: s.map.version, ...built.request });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    s.commits.apply(built.pending, answer.body);
    return answer.body;
  };
  try {
    let s = await open();
    assert.equal((await read()).pending, false, "nothing to review at first");
    assert.equal(await agentWrites((text) => text.replace("  <p>最后一段", "  <p>Agent 加的一段。</p>\n  <p>最后一段")), true, "a write not the service's own starts a review");
    let review = await read();
    assert.equal(review.pending, true);
    assert.deepEqual(review.counts, { added: 1, changed: 0, removed: 0 });
    assert.ok(await disk("state.json") && await disk("base.html"), "kept on disk");

    // The reader's edits: of a block the Agent did not touch, in the block it added, a new block.
    s = await open();
    s.text("第一段文字").innerHTML = "第一段文字在这里，说的是开头（读者）。";
    await commit(s);
    await service.noteTaken("demo", await fs.readFile(file, "utf8"));
    assert.deepEqual((await read()).counts, { added: 1, changed: 0, removed: 0 }, "the reader's edit of another block does not count");
    s.text("Agent 加的").innerHTML = "Agent 加的一段，读者补了一句。";
    const made = newHost(s.document, "paragraph");
    made.textContent = "读者新建的一段。";
    s.text("第三段要被删掉").closest("p").after(made);
    await commit(s);
    review = await read();
    assert.deepEqual(review.counts, { added: 1, changed: 0, removed: 0 }, "typed into the Agent's block it is the Agent's still; a block of the reader's is none of it");

    // A write the announcement has not told yet is the Agent's all the same, when a commit reads it first.
    await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("第三段要被删掉的内容，原样留着。", "第三段被 Agent 改了。"));
    s.text("第一段文字").innerHTML = "第一段文字在这里，说的是开头（读者再改）。";
    await commit(s);
    review = await read();
    assert.equal(review.counts.changed, 1, "the Agent's change the commit read first is the Agent's");
    assert.equal(review.writes, 2);

    // 确认 with a stamp the review has grown past: refused; with its own: done.
    const stale = await post("changes", { slug: "demo", action: "accept", stamp: "old|1" });
    assert.equal(stale.status, 409);
    assert.equal(stale.body.reason, "changed");
    assert.equal((await post("changes", { slug: "demo", action: "accept", stamp: review.stamp })).body.ok, true);
    assert.equal((await read()).pending, false);
    assert.equal(await disk("base.html"), null, "the baseline goes with it");
    assert.ok(told.includes("demo"), "the pages are told");

    // The Agent writes again (its title too); the reader saved an edit meanwhile; 撤回 keeps the reader's.
    s = await open();
    const kept = await fs.readFile(file, "utf8");
    await agentWrites((text) => beforeLast(text, "Agent 第二次加的。").replace("先理解材料", "先读懂材料").replace(/报告<\/h1>/, "Agent 的标题</h1>"));
    await fs.writeFile(json, `${JSON.stringify({ title: "Agent 的标题", description: "d" }, null, 2)}\n`);
    s = await open();
    s.text("最后一段").innerHTML = "最后一段收尾的话（读者）。";
    await commit(s);
    review = await read();
    assert.deepEqual(review.counts, { added: 1, changed: 2, removed: 0 });
    const reverted = await post("changes", { slug: "demo", action: "revert", stamp: review.stamp });
    assert.equal(reverted.body.ok, true, JSON.stringify(reverted.body));
    let now = await fs.readFile(file, "utf8");
    assert.ok(!now.includes("Agent 第二次加的") && now.includes("先理解材料") && now.includes(">报告</h1>"), "the Agent's changes are gone");
    assert.ok(now.includes("最后一段收尾的话（读者）。"), "the reader's own saved edit stays");
    assert.ok(now.includes("第一段文字在这里，说的是开头（读者再改）。"), "and those kept before");
    assert.equal(JSON.parse(await fs.readFile(json, "utf8")).title, "报告", "doc.json's title follows the page's");
    assert.equal((await read()).pending, false);
    assert.ok(!now.includes("ge-diff") && !now.includes("data-ge-"), "nothing of the page's marks in the file");

    // 撤销 of the revert: the Agent's version and its review back.
    assert.equal((await post("changes", { slug: "demo", action: "undo", undo: reverted.body.undo })).body.ok, true);
    now = await fs.readFile(file, "utf8");
    assert.ok(now.includes("Agent 第二次加的") && now.includes("最后一段收尾的话（读者）。"));
    assert.deepEqual((await read()).counts, { added: 1, changed: 2, removed: 0 }, "the review is back");
    assert.equal((await post("changes", { slug: "demo", action: "undo", undo: reverted.body.undo })).status, 404, "an undo is used once");

    // Reverted, then edited: no undo.
    review = await read();
    const again = await post("changes", { slug: "demo", action: "revert", stamp: review.stamp });
    s = await open();
    s.text("第一段文字").innerHTML = "第一段文字，撤回之后又改。";
    await commit(s);
    const late = await post("changes", { slug: "demo", action: "undo", undo: again.body.undo });
    assert.equal(late.status, 409);
    assert.equal(late.body.reason, "moved-on");

    // Kept over a restart, and a write made while the server was not there is the Agent's.
    await agentWrites((text) => beforeLast(text, "重启前写的。"));
    service = make();
    assert.equal((await read()).pending, true, "the review is kept on disk");
    assert.equal((await post("changes", { slug: "demo", action: "accept", stamp: (await read()).stamp })).body.ok, true);
    await fs.writeFile(file, beforeLast(await fs.readFile(file, "utf8"), "服务器不在时写的。"));
    service = make();
    assert.equal((await read()).pending, true, "a write the server was not there for");

    // Forgotten: by forgetChanges, and with its folder deleted.
    await service.forgetChanges("demo");
    assert.equal((await read()).pending, false);
    await agentWrites((text) => beforeLast(text, "又一段。"));
    assert.equal((await read()).pending, true);
    await fs.rm(path.join(state, "changes"), { recursive: true, force: true });
    assert.equal((await read()).pending, false, "the state's folder deleted, the review is forgotten");

    // A new document's first write is no change to review.
    const starter = fsSync.readFileSync(path.join(projectRoot, "src", "render", "starter", "doc.html"), "utf8").replace(/__REPORT_TITLE__/g, "报告").replace(/__REPORT_SLUG__/g, "demo");
    await fs.writeFile(file, starter);
    await service.forgetChanges("demo"); // as the workspace's create does
    await service.noteTaken("demo", starter);
    await agentWrites(() => BASE);
    assert.equal((await read()).pending, false, "the starter filled is no change");

    // The 写作偏好 page is never reviewed.
    const pageFolder = path.join(root, ".gallery", "pages", "instructions");
    await fs.mkdir(pageFolder, { recursive: true });
    await fs.writeFile(path.join(pageFolder, "doc.html"), BASE);
    await service.noteTaken("instructions", BASE);
    await fs.writeFile(path.join(pageFolder, "doc.html"), BASE.replace("最后一段", "改过的最后一段"));
    assert.equal(await service.noteTaken("instructions", BASE.replace("最后一段", "改过的最后一段")), false);
    assert.equal(fsSync.existsSync(path.join(state, "changes", "instructions")), false);
  } finally {
    server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

// ---------- 保留我的 and 用文件里的 ----------
// Who a change belongs to when the reader and the Agent changed the same words (docs/editor.md "Agent's
// changes"): 保留我的 makes the card's `theirs` the edit's `before`, so that the reader's words go over the
// Agent's in the file; the baseline takes them as the reader wrote them, from the words they were written
// from (`from`), so the block is the reader's and none of it marked: the review ends with nothing else of
// the Agent's left, and counts only the other block the same write changed when there is one; kept again
// after the Agent wrote the block once more meanwhile, the same. 用文件里的 gives the edit up: the Agent's
// words stay the Agent's.
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-keep-mine-"));
  const state = path.join(root, ".gallery", "state");
  const folder = path.join(root, "demo");
  const file = path.join(folder, "doc.html");
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, "doc.json"), `${JSON.stringify({ title: "报告", description: "d" }, null, 2)}\n`);
  const service = createEditService({ reportsDirectory: root, stateDirectory: state });
  const server = http.createServer((request, response) => (request.url === "/__gallery/edit/changes" ? service.changes : service.commit)(request, response));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const host = `127.0.0.1:${server.address().port}`;
  const post = async (route, body) => {
    const response = await fetch(`http://${host}/__gallery/edit/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": service.token },
      body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const read = async () => (await post("changes", { slug: "demo", action: "read" })).body;
  // Exported once: every block has its id.
  const START = addBlockIds(page(`  <ul>
    <li>一个人要 11 分钟。</li>
    <li>另一个人要 20 分钟。</li>
  </ul>
  <p>最后一段收尾的话。</p>
`)).text;
  const begin = async (source = START) => {
    await fs.writeFile(file, source);
    await service.forgetChanges("demo");
    const shown = shownSource(source).text;
    service.preview("demo", shown);
    await service.noteTaken("demo", source);
    return studio(shown);
  };
  const agentWrites = async (change) => {
    const after = change(await fs.readFile(file, "utf8"));
    await fs.writeFile(file, after);
    await service.noteTaken("demo", after);
  };
  const commit = async (s) => {
    const built = s.commits.build();
    const answer = await post("commit", { slug: "demo", opening: s.map.version, ...built.request });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    s.commits.apply(built.pending, answer.body);
    return answer.body;
  };
  // The reader turns 11 into 12 while the Agent turns it into 11.4: a conflict of that item, its key.
  // `more`: what else the reader changed on the page before that commit went.
  const conflicted = async (also = (text) => text, more = () => {}) => {
    const s = await begin();
    s.text("11 分钟").innerHTML = "一个人要 12 分钟。";
    more(s);
    await agentWrites((text) => also(text.replace("要 11 分钟", "要 11.4 分钟")));
    const answer = await commit(s);
    const held = answer.texts.find((entry) => entry.status === "conflict");
    assert.ok(held && held.theirs.includes("11.4"), `the same words changed on both sides are a conflict: ${JSON.stringify(answer.texts)}`);
    assert.equal((await read()).pending, true, "the Agent's write is under review");
    return { s, key: held.key };
  };
  try {
    // 保留我的, nothing else of the Agent's: the file says 12, and nothing is left to review.
    let { s, key } = await conflicted();
    s.commits.resolve(key, "mine");
    await commit(s);
    let now = await fs.readFile(file, "utf8");
    assert.ok(now.includes("一个人要 12 分钟。") && !now.includes("11.4"), "保留我的 writes the reader's words");
    let review = await read();
    assert.equal(review.pending, false, `what the reader kept is the reader's: nothing to review (${JSON.stringify(review.counts)})`);

    // The same write changed another block too: that one alone is the Agent's.
    ({ s, key } = await conflicted((text) => text.replace("最后一段收尾的话。", "最后一段，Agent 改的收尾。")));
    s.commits.resolve(key, "mine");
    await commit(s);
    review = await read();
    assert.deepEqual(review.counts, { added: 0, changed: 1, removed: 0 }, "the other block alone is counted");
    assert.equal(review.changed[0].texts?.[0]?.base, "最后一段收尾的话。", "and it is the one marked");

    // Kept, refused again (the Agent wrote the words once more before the commit went in), kept again: the reader's still.
    ({ s, key } = await conflicted());
    s.commits.resolve(key, "mine");
    await agentWrites((text) => text.replace("要 11.4 分钟", "要 11.5 分钟"));
    const again = await commit(s);
    const held = again.texts.find((entry) => entry.status === "conflict");
    assert.ok(held?.theirs.includes("11.5"), "written again meanwhile: a conflict again");
    s.commits.resolve(held.key, "mine");
    await commit(s);
    now = await fs.readFile(file, "utf8");
    assert.ok(now.includes("一个人要 12 分钟。"), "the reader's words over the Agent's newer ones");
    assert.equal((await read()).pending, false, "the reader's, kept twice");

    // 用文件里的: the edit given up, the Agent's words stay the Agent's.
    ({ s, key } = await conflicted());
    s.commits.resolve(key, "discard");
    review = await read();
    assert.deepEqual(review.counts, { added: 0, changed: 1, removed: 0 }, "the Agent's change is the Agent's");
    assert.equal(review.changed[0].texts?.[0]?.base, "一个人要 11 分钟。");

    // What the file refused stays out of the baseline too, when the same commit wrote something else (it
    // wrote, so it is replayed on the baseline): the card standing, the item's base is the words before the
    // Agent's; given up (用文件里的), the same; 撤回 then writes those, never the words the reader gave up,
    // which the file never held (until 2026-11-17 the replay took every text the commit carried).
    const otherBlock = (s) => { s.text("收尾").innerHTML = "最后一段收尾的话（读者）。"; };
    ({ s, key } = await conflicted(undefined, otherBlock));
    review = await read();
    assert.deepEqual(review.counts, { added: 0, changed: 1, removed: 0 }, "the Agent's change alone: the reader's other block is none of it");
    assert.equal(review.changed[0].texts?.[0]?.base, "一个人要 11 分钟。", `the card standing, the words the file refused are not the baseline's: ${JSON.stringify(review.changed)}`);
    s.commits.resolve(key, "discard");
    review = await read();
    assert.equal(review.changed[0].texts?.[0]?.base, "一个人要 11 分钟。", "given up, the same");
    let reverted = await post("changes", { slug: "demo", action: "revert", stamp: review.stamp });
    assert.equal(reverted.body.ok, true, JSON.stringify(reverted.body));
    now = await fs.readFile(file, "utf8");
    assert.ok(now.includes("一个人要 11 分钟。") && !now.includes("12 分钟"), "撤回 brings back the words before the Agent's, never those the reader gave up");
    assert.ok(now.includes("最后一段收尾的话（读者）。"), "and the reader's saved edit stays");

    // Kept (保留我的), refused again (the Agent wrote the words once more) in a commit that wrote another block,
    // then given up: the words kept never went in, so the baseline never took them from their `from`.
    ({ s, key } = await conflicted());
    s.commits.resolve(key, "mine");
    await agentWrites((text) => text.replace("要 11.4 分钟", "要 11.5 分钟"));
    otherBlock(s);
    const twice = await commit(s);
    const second = twice.texts.find((entry) => entry.status === "conflict");
    assert.ok(twice.wrote === true && second?.theirs.includes("11.5"), JSON.stringify(twice.texts));
    s.commits.resolve(second.key, "discard");
    review = await read();
    assert.deepEqual(review.counts, { added: 0, changed: 1, removed: 0 });
    assert.equal(review.changed[0].texts?.[0]?.base, "一个人要 11 分钟。", "the words kept and refused again are not the baseline's");

    // A deletion the file refused (the Agent changed the item meanwhile) in a commit that wrote another block:
    // the item stays the baseline's, the Agent's change of it a change; 保留 Agent 的 sends nothing, and 撤回
    // puts the item back as it was before the Agent's write, never takes it away.
    s = await begin();
    s.text("20 分钟").closest("li").remove();
    otherBlock(s);
    await agentWrites((text) => text.replace("要 20 分钟", "要 25 分钟"));
    const refusedDeletion = await commit(s);
    assert.ok(refusedDeletion.wrote === true && refusedDeletion.units.some((entry) => entry.status === "conflict" && entry.reason === "changed"), JSON.stringify(refusedDeletion.units));
    review = await read();
    assert.deepEqual(review.counts, { added: 0, changed: 1, removed: 0 }, `the item the deletion was refused for is changed, not added: ${JSON.stringify(review)}`);
    assert.equal(review.changed[0].texts?.[0]?.base, "另一个人要 20 分钟。");
    reverted = await post("changes", { slug: "demo", action: "revert", stamp: review.stamp });
    assert.equal(reverted.body.ok, true, JSON.stringify(reverted.body));
    now = await fs.readFile(file, "utf8");
    assert.ok(now.includes("另一个人要 20 分钟。") && now.includes("最后一段收尾的话（读者）。"), "撤回 puts the item back as it was");

    // The same, then 仍然删除: the reader's word goes over the item as the baseline holds it too (the forced deletion
    // names the hash the card showed, the Agent's, which the baseline never held: replayed as it went to the file it
    // was refused there, the item counted as deleted by the Agent and 撤回 putting it back). Only the Agent's
    // paragraph is left to review, and 撤回 leaves the item deleted.
    const agentParagraph = (text) => text.replace(/\n( {2}<p[^>]*>最后一段)/, "\n  <p>Agent 加的一段。</p>\n$1");
    for (const alone of [false, true]) {
      s = await begin();
      s.text("20 分钟").closest("li").remove();
      if (!alone) otherBlock(s);
      await agentWrites((text) => agentParagraph(text.replace("要 20 分钟", "要 25 分钟")));
      const first = await commit(s);
      assert.equal(first.wrote, !alone, JSON.stringify(first));
      s.commits.resolve([...s.commits.issues.keys()].find((issue) => issue.startsWith("u")), "force");
      const forced = await commit(s);
      assert.ok(forced.wrote === true && forced.units.every((entry) => entry.status === "applied"), JSON.stringify(forced.units));
      review = await read();
      assert.deepEqual(review.counts, { added: 1, changed: 0, removed: 0 }, `${alone ? "alone" : "beside another block"}: 仍然删除 is the reader's, the Agent's paragraph alone counted: ${JSON.stringify(review)}`);
      reverted = await post("changes", { slug: "demo", action: "revert", stamp: review.stamp });
      assert.equal(reverted.body.ok, true, JSON.stringify(reverted.body));
      now = await fs.readFile(file, "utf8");
      assert.ok(!now.includes("另一个人要") && !now.includes("Agent 加的一段"), "撤回 takes the Agent's paragraph out and leaves the item deleted");
    }

    // 保留我的 after the review was kept (确认) while the card stood, the Agent writing again: the new baseline holds the
    // Agent's words, the ones the card showed (`before`), so the kept words go in from those and not from `from` (which
    // met them there as the Agent's change: the kept words marked as the Agent's, and 撤回 writing the Agent's over them).
    ({ s, key } = await conflicted());
    assert.equal((await post("changes", { slug: "demo", action: "accept", stamp: (await read()).stamp })).body.ok, true);
    await agentWrites(agentParagraph);
    s.commits.resolve(key, "mine");
    await commit(s);
    review = await read();
    assert.deepEqual(review.counts, { added: 1, changed: 0, removed: 0 }, `kept after 确认: the Agent's paragraph alone counted: ${JSON.stringify(review)}`);
    reverted = await post("changes", { slug: "demo", action: "revert", stamp: review.stamp });
    assert.equal(reverted.body.ok, true, JSON.stringify(reverted.body));
    now = await fs.readFile(file, "utf8");
    assert.ok(now.includes("一个人要 12 分钟。") && !now.includes("11.4") && !now.includes("Agent 加的一段"), "撤回 keeps the reader's words");

    // A text the file refused because the Agent deleted its block (`missing`), the same commit writing another
    // block: the ghost is the block as the Agent deleted it, and 撤回 (after 接受删除) puts that back, never the
    // reader's words the file refused.
    s = await begin();
    s.text("收尾").innerHTML = "最后一段收尾的话（读者）。";
    s.text("20 分钟").innerHTML = "另一个人要 21 分钟。";
    await agentWrites((text) => text.replace(/\n\s*<p[^>]*>最后一段收尾的话。<\/p>/, ""));
    const missing = await commit(s);
    assert.ok(missing.wrote === true && missing.texts.some((entry) => entry.status === "conflict" && entry.reason === "missing"), JSON.stringify(missing.texts));
    review = await read();
    assert.deepEqual(review.removed?.[0]?.rows?.map((row) => row.text), ["最后一段收尾的话。"], `the ghost holds the words the Agent deleted: ${JSON.stringify(review.removed)}`);
    reverted = await post("changes", { slug: "demo", action: "revert", stamp: review.stamp });
    assert.equal(reverted.body.ok, true, JSON.stringify(reverted.body));
    now = await fs.readFile(file, "utf8");
    assert.ok(now.includes("最后一段收尾的话。") && !now.includes("（读者）") && now.includes("另一个人要 21 分钟。"), "撤回 puts the paragraph back as the Agent deleted it, the reader's saved item kept");

    // A commit whose only edit the file refused still writes when it gives the units around it their ids (a
    // file of an Agent's, none yet): replayed, it too leaves the refused words out.
    s = await begin(page(`  <ul>
    <li>一个人要 11 分钟。</li>
    <li>另一个人要 20 分钟。</li>
  </ul>
  <p>最后一段收尾的话。</p>
`));
    s.text("11 分钟").innerHTML = "一个人要 12 分钟。";
    await agentWrites((text) => text.replace("要 11 分钟", "要 11.4 分钟"));
    const idsOnly = await commit(s);
    assert.ok(idsOnly.texts.every((entry) => entry.status === "conflict"), JSON.stringify(idsOnly.texts));
    review = await read();
    assert.equal(review.changed?.[0]?.texts?.[0]?.base, "一个人要 11 分钟。", `the ids given wrote the file (${idsOnly.wrote}); the refused words stay out: ${JSON.stringify(review.changed)}`);

    // The reader's ordinary edits saved after the Agent's write, on a page that shows it: in a block the
    // Agent did not touch, the reader's; in the item it changed, apart from its words (an unchanged word
    // between), the reader's too, the Agent's words alone marked; over the Agent's words, no telling them
    // apart: the Agent's change, as the baseline cannot take them.
    await begin();
    await agentWrites((text) => text.replace("要 11 分钟", "要 11.4 分钟"));
    const shown = shownSource(await fs.readFile(file, "utf8")).text;
    service.preview("demo", shown);
    s = studio(shown);
    s.text("20 分钟").innerHTML = "另一个人要 25 分钟。";
    s.text("11.4 分钟").innerHTML = "一个人大约要 11.4 分钟。";
    await commit(s);
    review = await read();
    assert.deepEqual(review.counts, { added: 0, changed: 1, removed: 0 }, "the untouched item's edit is the reader's");
    assert.equal(review.changed[0].texts?.[0]?.base, "一个人大约要 11 分钟。", "the reader's words apart from the Agent's are the baseline's");
    s.text("11.4 分钟").innerHTML = "一个人大约要 11.5 分钟。";
    await commit(s);
    review = await read();
    assert.equal(review.changed[0].texts?.[0]?.base, "一个人大约要 11 分钟。", "typed over the Agent's words: the Agent's change still, against the same baseline");
  } finally {
    server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

// ---------- a new document's starter filled ----------
// Nothing lasts between writes (the first writing, `draft`, gone 2026-11-13): an Agent's write taken
// while `seen` is a new document's (isNewDocument: the starter) moves `seen` alone, nothing marked; the
// next write starts a review as any, against the document as that first write left it, with no step
// between (no gallery open, no wait). read says no `draft`, and state.json holds none; one an older
// Gallery wrote with `draft` is read without it (the next write reviewed, the field gone). gallery new's
// noteNew takes the starter on disk, so a server whose first look is the Agent's first write knows it
// was new; a document not new is reviewed from its first write; in memory the same.
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-starter-"));
  const state = path.join(root, ".gallery", "state");
  const folder = path.join(root, "demo");
  const file = path.join(folder, "doc.html");
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, "doc.json"), `${JSON.stringify({ title: "报告", description: "d" }, null, 2)}\n`);
  const starter = fsSync.readFileSync(path.join(projectRoot, "src", "render", "starter", "doc.html"), "utf8").replace(/__REPORT_TITLE__/g, "报告").replace(/__REPORT_SLUG__/g, "demo");
  const FIRST = starter.replace(/ *<!-- Starter[^]*?<\/section>\n/, "    <p>摘要一段。</p>\n    <h2>背景</h2>\n    <h2>结论</h2>\n");
  // A paragraph of `words` right after heading `heading`.
  const section = (text, heading, words) => text.replace(new RegExp(`(<h2[^>]*>${heading}</h2>\n)`), `$1    <p>${words}</p>\n`);
  let memory = false;
  const make = () => createEditService({ reportsDirectory: root, stateDirectory: memory ? null : state });
  let service = make();
  const read = async () => (await service.changesAction({ slug: "demo", action: "read" }))[1];
  const stateFile = path.join(state, "changes", "demo", "state.json");
  // The review's state on disk, once what was asked of it is done.
  const kept = async () => (await service.stored(), JSON.parse(await fs.readFile(stateFile, "utf8")));
  const agentWrites = async (change) => {
    const before = await fs.readFile(file, "utf8");
    const after = change(before);
    assert.notEqual(after, before, "the Agent's write changes the file");
    await fs.writeFile(file, after);
    return service.noteTaken("demo", after);
  };
  // A new document as gallery new or 新建 makes it, which a page served (the preview took it).
  const fresh = async () => {
    await fs.writeFile(file, starter);
    await service.forgetChanges("demo");
    await service.noteTaken("demo", starter);
  };
  // A function of src/cli/hand-in.mjs run in a process of its own, as a command runs it with the workspace named: what it printed.
  const command = (name) => {
    const ran = spawnSync(process.execPath, ["--input-type=module", "-e", `import { ${name} } from ${JSON.stringify(pathToFileURL(path.join(projectRoot, "src", "cli", "hand-in.mjs")).href)}; console.log(await ${name}("demo"));`], { env: { ...process.env, GALLERY_WORKSPACE: root }, encoding: "utf8" });
    return `${ran.stdout.trim()}${ran.stderr.trim()}`;
  };
  try {
    // The starter filled: no review; the next write right after it: reviewed, its one paragraph.
    await fresh();
    assert.equal(await agentWrites(() => FIRST), false, "the starter filled starts no review");
    let review = await read();
    assert.deepEqual(Object.keys(review).sort(), ["ok", "pending", "version"], `nothing to review, no first writing said: ${JSON.stringify(review)}`);
    assert.deepEqual(Object.keys(await kept()).sort(), ["born", "seen", "v"], "nothing kept but what was seen");
    assert.equal(await agentWrites((text) => section(text, "背景", "背景一段。")), true, "the next write starts a review, nothing between");
    review = await read();
    assert.deepEqual(review.counts, { added: 1, changed: 0, removed: 0 }, "against the document as the first write left it: its one paragraph");
    assert.equal(await agentWrites((text) => section(text, "结论", "结论一段。")), true, "the one after it grows the review");
    assert.deepEqual((await read()).counts, { added: 2, changed: 0, removed: 0 });
    assert.equal("draft" in (await kept()), false);

    // A state.json an older Gallery wrote while its first writing lasted (`draft`): read without it.
    await fresh();
    assert.equal(await agentWrites(() => FIRST), false);
    await fs.writeFile(stateFile, `${JSON.stringify({ ...(await kept()), draft: Date.now() })}\n`);
    assert.equal("draft" in (await read()), false, "an older state's first writing is not said");
    assert.equal(await agentWrites((text) => section(text, "背景", "旧状态之后写的。")), true, "the next write is reviewed all the same");
    assert.deepEqual((await read()).counts, { added: 1, changed: 0, removed: 0 });
    assert.equal("draft" in (await kept()), false, "and the field is gone from the state");

    // gallery new takes the starter on disk (noteNew): a server whose first look at the document is the
    // Agent's first write (none served it a page before) knows it was new; the write after it is reviewed.
    await fs.rm(path.join(state, "changes"), { recursive: true, force: true });
    await fs.writeFile(file, starter);
    assert.equal(command("noteNew"), "undefined");
    service = make();
    assert.equal(await agentWrites(() => FIRST), false, "gallery new's starter filled: no review");
    assert.equal(await agentWrites((text) => section(text, "背景", "第一节。")), true, "the write after it is reviewed");
    assert.deepEqual((await read()).counts, { added: 1, changed: 0, removed: 0 });

    // A document not new when the Agent first wrote it is reviewed from that write on.
    await fs.writeFile(file, FIRST);
    await service.forgetChanges("demo");
    await service.noteTaken("demo", FIRST);
    assert.equal(await agentWrites((text) => section(text, "背景", "第一笔。")), true, "a document not new: its first write is reviewed");

    // In memory (no state directory), the same within the server's life.
    await fs.rm(path.join(state, "changes"), { recursive: true, force: true });
    memory = true;
    service = make();
    await fresh();
    assert.equal(await agentWrites(() => FIRST), false, "in memory: the starter filled starts no review");
    assert.equal(await agentWrites((text) => section(text, "结论", "内存里写的。")), true, "and the next write does");
    assert.equal(fsSync.existsSync(path.join(state, "changes")), false, "nothing of it on disk");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

// Where the bar of the Agent's changes stands among the bottom panels (changes/bar.mjs barPlace): in the middle of
// the page while no panel is closer than 8px to it across, else the nearest place to the middle that clears each panel
// by 8px and the page's sides by 16px, else in the middle again with the panels it must stand over named. The card
// at the left is 16..416 and the lost texts' panel at the right 400 wide, 16px (and the page's room) from that side.
{
  const left = { left: 16, right: 416 };
  const right = (view, room = 0) => ({ left: view - room - 16 - 400, right: view - room - 16 });
  const BAR = 285;
  const at = (panels, view, room = 0, width = BAR) => barPlace(panels, view, room, width);
  assert.deepEqual(at([], 1000), { x: null }, "no panel: in the middle");
  assert.deepEqual(at([left], 1400), { x: null }, "the card well clear of the middle: in the middle");
  assert.equal(at([left], 1000).x, 566.5, "the card in the way: its right edge, 8px, half the bar (416 + 8 + 142.5)");
  assert.equal(at([left], 1100).x, 566.5, "and as the window narrows it stays there");
  assert.equal(at([left], 1132).x, 566.5, "the middle (566) not yet 8px from the card: at the card still");
  assert.deepEqual(at([left], 1133), { x: null }, "the middle 566.5 is where the bar would stand against the card: from there on it follows the middle, no jump");
  assert.deepEqual(at([left], 1193), { x: null }, "and beyond");
  assert.equal(at([left], 725).x, 566.5, "just room beside the card (424 + 285 + 16 = 725)");
  assert.deepEqual(at([left], 724), { x: null, blocked: [left] }, "a pixel short: no place, in the middle over the card");
  assert.deepEqual(at([left], 360, 0, 328), { x: null, blocked: [left] }, "a phone: over the card");
  assert.equal(at([right(1000)], 1000).x, 433.5, "a panel at the right: the bar at its left, 8px from it (584 - 8 - 142.5)");
  assert.deepEqual(at([left, right(1000)], 1000), { x: null, blocked: [left, right(1000)] }, "both: nothing between them wide enough, in the middle over both");
  assert.deepEqual(at([left, right(1133)], 1133), { x: null }, "both, room between them for the bar and the middle clear: in the middle");
  assert.deepEqual(at([left, right(1093)], 1093), { x: null, blocked: [left, right(1093)] }, "both, less than the bar takes between them: over them");
  // A panel the middle is under: the place beside it nearest the middle, whichever side it is on.
  assert.equal(at([{ left: 300, right: 650 }], 1000).x, 800.5, "a panel across the middle, room at the right only: against it (658 + 142.5)");
  assert.equal(at([{ left: 16, right: 150 }, { left: 600, right: 984 }], 1000).x, 449.5, "two panels, the middle 8px from the second only: between them, against the second (592 - 142.5)");
  assert.deepEqual(at([{ left: 20, right: 500 }, { left: 560, right: 980 }], 1000), { x: null, blocked: [{ left: 20, right: 500 }, { left: 560, right: 980 }] }, "no room between them (52px) nor beside: over both");
  // The page's room on the right (a detail card holding the page still): its middle and its right side move in by it.
  assert.equal(at([left], 735, 0).x, 566.5, "no room taken: beside the card");
  assert.deepEqual(at([left], 735, 15), { x: null, blocked: [left] }, "15px taken: no longer wide enough, over the card");
  assert.deepEqual(at([left], 1200, 15), { x: null }, "the middle moves in by it: still clear, in the middle");
}

console.log("Checked the Agent's changes: blocks added, changed and deleted by diffRows (lists and sections by what they hold, ids, indentation and natural HTML no change, twins by their order, a picture whole, an item's own words, the deleted blocks as the ghost shows them), a new document's starter filled none and the write right after it reviewed (nothing lasting between writes: no draft said or kept, an older state's draft read without it, gallery new's starter taken on disk, a document not new reviewed from its first write, in memory alike), the marks of words, the words taken out shown in a block and never its content, the reader's commits applied to the baseline (保留我的 the reader's, from the words it was written from, kept again too; 用文件里的 the Agent's; ordinary edits apart from the Agent's words the reader's, over them the Agent's; what the file refused left out, a text, a deletion, words kept and refused again, words in a block the Agent deleted, in a commit that wrote something else or ids alone, of a list deleted item by item the items that went; 仍然删除 over the baseline's own item, alone and beside another block; 保留我的 after 确认 from the words the card showed), and the service's review started, grown, kept, reverted with the reader's edits kept, undone, kept over a restart, forgotten, never written into the report, and where the bar stands among the bottom panels (the middle, beside the nearest panel as it must, over them where there is no room).");
