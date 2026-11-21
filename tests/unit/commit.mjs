import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import { convertBlock, convertContainer } from "../../src/editor/page/convert.mjs";
import { outdentItem } from "../../src/editor/components/list/page.mjs";
import { sectionAfter, unwrapCheck, unwrapSection } from "../../src/editor/components/section/page.mjs";
import { dialogContent } from "../../src/editor/components/dialog/index.mjs";
import { freshDialogId, newDialog } from "../../src/editor/components/dialog/page.mjs";
import { captureLayout, mergeWithPrevious, newContainer, newHost, placeBefore, prepareBlock, splitBlock } from "../../src/editor/page/core.mjs";
import { removeUnit } from "./page-harness.mjs";
import { copyKeys } from "../../src/editor/components/figure/index.mjs";
import { accepts } from "../../src/editor/components/registry.mjs";
import { BLOCK_COLORS } from "../../src/editor/components/colors.mjs";
import { createCommits, issueKey, parseIssueKey } from "../../src/editor/page/commit.mjs";
import { addBlockIds, commitEdits, findUnits, hashOf, instrument } from "../../src/editor/source.mjs";
import { relinkMade } from "../../src/editor/source/chart-keys.mjs";
import { chartDeclarationFailures } from "../../src/render/chart-declarations.mjs";
import { forgetCatalog } from "../../src/shared/component-catalog.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";

// Autosave commits (docs/editor.md, "Commits"): the page's changes since its last commit, named by
// identity, applied to the file as it is now, and taken in without reloading. Each test runs the
// page's side (src/editor/page/commit.mjs, in jsdom) against the server's (commitEdits), with the
// file held here as the server would read and write it.

const page = (body) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>报告</title></head><body>
<main class="doc-page" data-doc-id="demo">
  <header class="doc-header"><h1 class="doc-title">报告</h1></header>
${body}</main>
</body></html>
`;

// Every answer applied, and there is at least one: `[].every()` is true, so an answer that came back empty
// (nothing sent, nothing judged) would pass a test that asks whether nothing was refused.
const allApplied = (entries) => entries.length > 0 && entries.every((entry) => entry.status === "applied");

// What the endpoint seals a deleted unit with (a keyed hash there).
const seal = (source) => hashOf(`test:${source}`);

// A page opened on `source`, editing, with its commits; `file` is the file the server has.
function studio(source) {
  const { html, map } = instrument(source);
  const { document } = new JSDOM(html).window;
  const baselines = new Map();
  for (const block of map.blocks) baselines.set(block.id, prepareBlock(document.querySelector(`[data-ge-block="${block.id}"]`), block));
  let layout = captureLayout(document, map);
  const state = {
    document,
    map,
    file: source,
    get layout() { return layout; },
  };
  state.commits = createCommits({
    root: document, map, baselines, units: new Map(), boxes: new Map(), getLayout: () => layout, setLayout: (next) => (layout = next),
  });
  const opening = source;
  // Build a commit, have the server apply it to the file, take in the answer. `sent`: what the
  // server is given instead of the request (a test playing a server that did otherwise).
  state.commit = ({ between = null, sent = (request) => request } = {}) => {
    const built = state.commits.build();
    if (!built) return null;
    between?.(); // what happens on the page while the commit is on its way
    const receipt = commitEdits({ current: state.file, ...sent(built.request), opening, seal }); // the endpoint finds the opening source by its version
    state.file = receipt.text;
    state.last = { request: built.request, receipt };
    return { receipt, ...state.commits.apply(built.pending, receipt) };
  };
  state.text = (words) => [...document.querySelectorAll("[data-ge-block]")].find((node) => node.textContent.includes(words));
  state.unit = (words) => state.text(words).closest("[data-ge-unit]");
  state.section = (title) => [...document.querySelectorAll("main section")].find((node) => node.querySelector("h2")?.textContent === title);
  return state;
}

const type = (host, text) => {
  host.innerHTML = text;
};

const SOURCE = page(`  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">第一章</h2>
    <p>甲段落，写的是开头。</p>
    <p>乙段落，写的是中间。</p>
    <figure class="doc-figure" data-surface="bounded">
      <h3>卡片标题</h3>
      <p class="doc-figure-caption">卡片说明</p>
    </figure>
    <div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>名称</th><th>数值</th></tr></thead><tbody><tr><td>一</td><td>1</td></tr><tr><td>二</td><td>2</td></tr></tbody></table></div>
  </section>

  <section class="doc-section" aria-labelledby="b">
    <h2 id="b">第二章</h2>
    <p>丙段落，在第二章。</p>
  </section>
`);

// One edit, then another of the same block: the first finds the paragraph by what it was, gives it
// (and the section around it) an id; the second names it by that id. Nothing to commit afterwards.
{
  const s = studio(SOURCE);
  type(s.text("甲段落"), "甲段落，写的是开头（改）。");
  const first = s.commit();
  assert.deepEqual(first.receipt.texts.map((entry) => entry.status), ["applied"]);
  assert.match(s.file, /<p data-block-id="([a-z][a-z0-9]{7})">甲段落，写的是开头（改）。<\/p>/);
  const id = s.file.match(/<p data-block-id="([a-z][a-z0-9]{7})">甲段落/)[1];
  assert.equal(s.unit("甲段落").getAttribute("data-block-id"), id, "the page knows the id the paragraph got");
  assert.match(s.file, /<section class="doc-section" aria-labelledby="a" data-block-id="[a-z][a-z0-9]{7}">/, "the section around the change got one too");
  assert.equal(s.commits.build(), null, "nothing left to commit");
  type(s.text("甲段落"), "甲段落，写的是开头（再改）。");
  s.commit();
  assert.equal(s.last.request.texts[0].block.unit.id, id, "named by its id now");
  assert.ok(s.file.includes(`<p data-block-id="${id}">甲段落，写的是开头（再改）。</p>`));
  assert.equal(s.file.split("甲段落").length, 2);
}

// What the file did not take is held under a key built and read in one place: a text's, a unit's, an insert's.
{
  assert.deepEqual([issueKey("text", 12), issueKey("unit", 3), issueKey("insert", "ab12cd34")], ["b12", "u3", "iab12cd34"], "the keys as the crash buffer and the cards keep them");
  assert.deepEqual(parseIssueKey("b12"), { kind: "text", ref: 12 });
  assert.deepEqual(parseIssueKey("u3"), { kind: "unit", ref: 3 });
  assert.deepEqual(parseIssueKey("iab12cd34"), { kind: "insert", ref: "ab12cd34" }, "an insert's ref is the id it proposes, never a number");
  for (const [kind, ref] of [["text", 0], ["unit", 7], ["insert", "x1y2z3w4"]]) assert.deepEqual(parseIssueKey(issueKey(kind, ref)), { kind, ref });
}

// Someone else's change elsewhere stays; to the same block in another place, both merge (and the
// page shows the merge); to the same words, that block alone is a conflict, held back, and the
// other blocks keep committing.
{
  const s = studio(SOURCE);
  s.file = s.file.replace("丙段落，在第二章。", "丙段落，在第二章（AI）。");
  type(s.text("甲段落"), "甲段落（人）写的是开头。");
  s.commit();
  assert.ok(s.file.includes("甲段落（人）写的是开头。") && s.file.includes("丙段落，在第二章（AI）。"), "a change elsewhere stays");

  s.file = s.file.replace("乙段落，写的是中间。", "乙段落，写的是中间部分。");
  type(s.text("乙段落"), "乙段落（人），写的是中间。");
  const merged = s.commit();
  assert.equal(merged.receipt.texts[0].status, "merged");
  assert.ok(s.file.includes("乙段落（人），写的是中间部分。"), "both changes of one block, word by word");
  assert.equal(s.text("乙段落").textContent, "乙段落（人），写的是中间部分。", "the page shows the merge");
  assert.equal(s.commits.build(), null);

  s.file = s.file.replace("甲段落（人）写的是开头。", "甲段落（人）写的是结尾。");
  type(s.text("甲段落"), "甲段落（人）写的是起点。");
  const one = [...s.document.querySelectorAll("td")].find((node) => node.textContent === "一");
  type(one, "一（人）");
  const clash = s.commit();
  const status = Object.fromEntries(clash.receipt.texts.map((entry) => [entry.key, entry.status]));
  assert.deepEqual(Object.values(status).sort(), ["applied", "conflict"]);
  assert.ok(s.file.includes("甲段落（人）写的是结尾。") && s.file.includes("<td>一（人）</td>"), "the conflict waits, the other block went in");
  assert.equal(clash.conflicts[0].theirs, "甲段落（人）写的是结尾。");
  type(one, "一（又改）");
  s.commit();
  assert.deepEqual(s.last.request.texts.map((entry) => entry.key), [`b${one.getAttribute("data-ge-block")}`], "a held conflict is not sent again");
}

// Split with Enter: the new paragraph joins the map as an ordinary block with its id; edited later,
// it is named by that id. Deleted, it goes; the page keeps its source for undo.
{
  const s = studio(SOURCE);
  const host = s.text("甲段落");
  const range = s.document.createRange();
  range.setStart(host.firstChild, 5);
  splitBlock(host, range);
  s.commit();
  assert.match(s.file, /<p data-block-id="[a-z][a-z0-9]{7}">甲段落，写<\/p>\n    <p data-block-id="([a-z][a-z0-9]{7})">的是开头。<\/p>/);
  const made = s.text("的是开头");
  const madeId = s.file.match(/<p data-block-id="([a-z][a-z0-9]{7})">的是开头。<\/p>/)[1];
  assert.ok(!made.hasAttribute("data-ge-new") && made.getAttribute("data-block-id") === madeId && made.hasAttribute("data-ge-unit"), "an ordinary block now");
  type(made, "的是开头（新段）。");
  s.commit();
  assert.equal(s.last.request.texts[0].block.unit.id, madeId);
  assert.ok(s.file.includes(`<p data-block-id="${madeId}">的是开头（新段）。</p>`));
  removeUnit(s.unit("的是开头"));
  s.commit();
  assert.ok(!s.file.includes("的是开头"), "deleted");
  assert.equal(s.commits.removed.size, 1, "its source kept for undo");
}

// A new section (holding a paragraph), dissolved again, and a conversion: made on the page,
// committed, then edited like any block.
{
  const s = studio(SOURCE);
  sectionAfter(s.section("第一章")).focus.textContent = "新分区的正文";
  s.commit();
  assert.match(s.file, /<section class="doc-section" data-block-id="[a-z][a-z0-9]{7}">\n    <p data-block-id="[a-z][a-z0-9]{7}">新分区的正文<\/p>\n  <\/section>/);
  const added = s.text("新分区的正文").closest("section");
  assert.ok(added.hasAttribute("data-block-id") && added.hasAttribute("data-ge-box"), "a new section is a unit and a box of its own");
  type(s.text("新分区的正文"), "新分区的正文（改）");
  s.commit();
  assert.ok(s.file.includes("新分区的正文（改）</p>"), "its paragraph, a block like any other");
  unwrapSection(added);
  s.commit();
  assert.ok(/<\/section>\n\n  <p data-block-id="[a-z][a-z0-9]{7}">新分区的正文（改）<\/p>\n\n  <section class="doc-section" aria-labelledby="b"/.test(s.file), "dissolved: its paragraph stays where it was");
  const heading = convertBlock(s.text("丙段落"), "heading3").focus;
  heading.textContent = "丙段落，变成标题";
  s.commit();
  assert.match(s.file, /<h3 data-block-id="[a-z][a-z0-9]{7}">丙段落，变成标题<\/h3>/);
  s.text("丙段落").textContent = "丙段落，标题再改";
  s.commit();
  assert.match(s.file, /<h3 data-block-id="[a-z][a-z0-9]{7}">丙段落，标题再改<\/h3>/, "the converted block edits as itself");
}

// Fields of a component by their path: found while the structure stays; the Agent adding a row
// moves the field, found again by its text; when its text changed too, a conflict, not a guess.
{
  const s = studio(SOURCE);
  type(s.text("卡片说明"), "卡片说明（改）");
  const cell = [...s.document.querySelectorAll("td")].find((node) => node.textContent === "二");
  type(cell, "二（改）");
  s.commit();
  assert.ok(s.file.includes('<p class="doc-figure-caption">卡片说明（改）</p>') && s.file.includes("<td>二（改）</td>"));
  assert.deepEqual(s.last.request.texts.map((entry) => entry.block.path?.[0]), ["unit", "unit"], "fields named by their path in their unit");

  s.file = s.file.replace("<tbody><tr><td>一</td>", "<tbody><tr><td>零</td><td>0</td></tr><tr><td>一</td>");
  type(cell, "二（再改）");
  s.commit();
  assert.ok(s.file.includes("<td>二（再改）</td>") && s.file.includes("<td>零</td>"), "a row the Agent added before it: found again by its text");

  s.file = s.file.replace("<tbody><tr><td>零</td><td>0</td></tr>", "<tbody><tr><td>负一</td><td>-1</td></tr><tr><td>零</td><td>0</td></tr>").replace("<td>二（再改）</td>", "<td>二（AI）</td>");
  type(cell, "二（人）");
  const answer = s.commit();
  assert.deepEqual(answer.receipt.texts.map((entry) => [entry.status, entry.reason]), [["conflict", "structure"]], "moved and changed: a conflict");
}

// The title, text outside any unit, and a line of the header (a block of its own), first touched:
// found by what they said when the page opened.
{
  const source = page(`  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">第一章</h2>
    <p>只有一段。</p>
  </section>
`).replace('<h1 class="doc-title">报告</h1></header>', '<h1 class="doc-title">报告</h1><p>来源说明</p></header>');
  const s = studio(source);
  s.text("报告").textContent = "新标题";
  s.text("来源说明").textContent = "来源说明（改）";
  const { receipt } = s.commit();
  assert.equal(receipt.title.to, "新标题");
  assert.match(s.file, /<h1 class="doc-title">新标题<\/h1><p data-block-id="[a-z0-9]{8}">来源说明（改）<\/p>/,"the header's line got its id with its first edit");
  s.text("来源说明").textContent = "来源说明（再改）";
  s.commit();
  assert.ok(s.file.includes("来源说明（再改）"), "and is found by it since");
}

// While a commit is on its way the reader goes on: typing in another block and moving one. The
// answer takes in only what was sent; the next commit has the rest.
{
  const s = studio(SOURCE);
  type(s.text("甲段落"), "甲段落（一）。");
  s.commit({
    between: () => {
      type(s.text("丙段落"), "丙段落（途中）。");
      const moving = s.unit("乙段落");
      s.section("第二章").append(moving);
    },
  });
  assert.ok(s.file.includes("甲段落（一）。") && !s.file.includes("丙段落（途中）") && s.file.indexOf("乙段落") < s.file.indexOf("第二章"), "only what was sent");
  s.commit();
  assert.ok(s.file.includes("丙段落（途中）。") && s.file.indexOf("乙段落") > s.file.indexOf("丙段落"), "the rest with the next commit");
  assert.equal(s.commits.build(), null);
}

// A section the page changed inside can still be deleted: its hash is the one after that change.
{
  const s = studio(SOURCE);
  type(s.text("丙段落"), "丙段落（改）。");
  s.commit();
  removeUnit(s.section("第二章"));
  s.commit();
  assert.deepEqual(s.last.receipt.units.map((entry) => entry.status), ["applied"]);
  assert.ok(!s.file.includes("第二章"));
  // One the Agent changed meanwhile is not deleted without the reader.
  const t = studio(SOURCE);
  t.file = t.file.replace("丙段落，在第二章。", "丙段落，在第二章（AI）。");
  removeUnit(t.section("第二章"));
  const answer = t.commit();
  assert.deepEqual(answer.receipt.units.map((entry) => [entry.status, entry.reason]), [["conflict", "changed"]]);
  assert.ok(t.file.includes("第二章"));
}

// Ids given while the page is open on a version without them (an export hands the report in with an id
// for every block; add-block-ids.mjs): no unit's hash counts its block ids, nor does finding a unit where the
// opening version had it, so a commit built before lands on the same blocks with the same result, each
// keeping the id the file gave it. Twins are told apart by their order, or by what comes before them
// when the Agent added another since.
{
  const edit = (file) => {
    const s = studio(SOURCE);
    s.file = file;
    type(s.text("甲段落"), "甲段落，写的是开头（改）。");
    removeUnit(s.unit("卡片标题"));
    removeUnit(s.section("第二章"));
    return s.commit().receipt;
  };
  const ided = addBlockIds(SOURCE).text;
  const [plain, given] = [edit(SOURCE), edit(ided)];
  assert.ok(allApplied(given.texts) && allApplied(given.units), JSON.stringify([given.texts, given.units]));
  const strip = (html) => html.replace(/ data-block-id="[a-z][a-z0-9]{7}"/g, "");
  assert.equal(strip(given.text), strip(plain.text), "the same blocks, the same result");
  const own = ided.match(/<p (data-block-id="[a-z0-9]{8}")>甲段落/)[1];
  assert.ok(given.text.includes(`<p ${own}>甲段落，写的是开头（改）。</p>`), "the paragraph keeps the id the file gave it");

  const twins = page(`  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">第一章</h2>
    <p>重复的一段。</p>
    <p>唯一的一段。</p>
    <p>重复的一段。</p>
  </section>
`);
  for (const [file, label] of [[addBlockIds(twins).text, "ids given"], [addBlockIds(twins).text.replace("  </section>", "    <p>重复的一段。</p>\n  </section>"), "ids given and a third twin added"]]) {
    const s = studio(twins);
    s.file = file;
    type([...s.document.querySelectorAll("p")].filter((node) => node.textContent === "重复的一段。")[1], "重复的一段（第二个）。");
    const answer = s.commit().receipt;
    assert.ok(allApplied(answer.texts), `${label}: ${JSON.stringify(answer.texts)}`);
    assert.match(strip(answer.text), /<p>重复的一段。<\/p>\n {4}<p>唯一的一段。<\/p>\n {4}<p>重复的一段（第二个）。<\/p>/, `${label}: the second twin`);
  }

  // Start tags that end in whitespace (a divider written <hr />, a space before ">", a formatter's
  // ">" on a line of its own): the id goes in after that whitespace, and the id-blind reading takes
  // out exactly what went in, so deleting and editing them after an export is as before it.
  const spaced = page(`  <p>前一段。</p>
  <hr />
  <p class="lead" >尾随空格的一段。</p>
  <p
    class="lead"
  >多行起始标签的一段。</p>
  <section class="doc-section"
    aria-labelledby="c"
  >
    <h2 id="c">第三章</h2>
    <p>第三章的一段。</p>
  </section>
`);
  const work = (file) => {
    const s = studio(spaced);
    s.file = file;
    removeUnit(s.document.querySelector("main hr"));
    type(s.text("尾随空格"), "尾随空格的一段（改）。");
    removeUnit(s.unit("多行起始标签"));
    removeUnit(s.section("第三章"));
    return s.commit().receipt;
  };
  const [before, after] = [work(spaced), work(addBlockIds(spaced).text)];
  assert.ok(allApplied(after.texts) && allApplied(after.units), JSON.stringify([after.texts, after.units]));
  assert.equal(strip(after.text), strip(before.text), "after the export as before it");
}

// A block the page made says what a block of the file without an id says (an empty paragraph beside
// an empty one, the same words typed): the page's ids go with every commit (pageIds), so the unit it
// names by what it said when it opened is never the page's own, though their hashes are the same.
{
  const source = page(`  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">第一章</h2>
    <p>前一段。</p>
    <p>中间一段。</p>
    <p>同样的一段。</p>
  </section>
`);
  const s = studio(source);
  const host = s.text("前一段");
  const range = s.document.createRange();
  range.setStart(host.firstChild, host.firstChild.length);
  splitBlock(host, range);
  type(s.text("前一段").nextElementSibling, "同样的一段。");
  s.commit();
  // (A block made names the units right beside it, 中间一段 here: the one of the file one further on has no id.)
  const made = s.file.match(/<p data-block-id="([a-z][a-z0-9]{7})">同样的一段。<\/p>\n {4}<p data-block-id="[a-z][a-z0-9]{7}">中间一段。<\/p>\n {4}<p>同样的一段。<\/p>/)?.[1];
  assert.ok(made, `the page's own paragraph before the one of the file: ${s.file}`);
  removeUnit([...s.document.querySelectorAll("main p")].find((node) => node.textContent === "同样的一段。" && !node.hasAttribute("data-block-id")));
  s.commit();
  assert.ok(s.last.request.pageIds.includes(made), "the commit carries the page's ids");
  assert.ok(allApplied(s.last.receipt.units), JSON.stringify(s.last.receipt.units));
  assert.match(s.file, new RegExp(`<p data-block-id="${made}">同样的一段。</p>\\n {4}<p data-block-id="[a-z][a-z0-9]{7}">中间一段。</p>\\n {2}</section>`), "the paragraph of the file deleted, the page's own kept");
  // The same with the title changed meanwhile (what came before both is not what the page opened
  // on): still the one of the file, never "ambiguous".
  const t = studio(source);
  const file = source.replace("<h2 id=\"a\">第一章</h2>", "<h2 id=\"a\">第一章（AI 改）</h2>").replace("    <p>同样的一段。</p>", `    <p data-block-id="pagemade">同样的一段。</p>\n    <p>同样的一段。</p>`);
  t.file = file;
  removeUnit([...t.document.querySelectorAll("main p")].find((node) => node.textContent === "同样的一段。"));
  const answer = t.commit({ sent: (request) => ({ ...request, pageIds: [...request.pageIds, "pagemade"] }) }).receipt;
  assert.ok(allApplied(answer.units), JSON.stringify(answer.units));
  assert.ok(answer.text.includes('<p data-block-id="pagemade">同样的一段。</p>\n  </section>'), answer.text);
}

// Without the opening version (a server that lost its state), a unit untouched since the page
// opened is still found by its hash; two identical ones need the opening version to tell apart.
{
  const twins = page(`  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">第一章</h2>
    <p>重复的一段。</p>
    <p>唯一的一段。</p>
    <p>重复的一段。</p>
  </section>
`);
  const s = studio(twins);
  type(s.text("唯一的一段"), "唯一的一段（改）。");
  const built = s.commits.build();
  const lost = commitEdits({ current: s.file, ...built.request, opening: null });
  assert.deepEqual(lost.texts.map((entry) => entry.status), ["applied"], "found by its hash alone");
  s.commits.apply(built.pending, lost);
  s.file = lost.text;
  const second = [...s.document.querySelectorAll("p")].filter((node) => node.textContent === "重复的一段。")[1];
  type(second, "重复的一段（第二个）。");
  const twin = s.commits.build();
  assert.deepEqual(commitEdits({ current: s.file, ...twin.request, opening: null }).texts.map((entry) => entry.reason), ["ambiguous"], "a twin needs where it was");
  const told = commitEdits({ current: s.file, ...twin.request, opening: twins });
  assert.ok(/<p>重复的一段。<\/p>\n    <p data-block-id="[a-z0-9]{8}">唯一的一段（改）。<\/p>\n    <p data-block-id="[a-z0-9]{8}">重复的一段（第二个）。<\/p>/.test(told.text), "the second twin, by its order among its twins");
}

// Undo across commits, as editor.mjs undoes: the very same nodes put back where they were.
const recordLists = (...parents) => {
  const lists = parents.map((parent) => [parent, [...parent.childNodes]]);
  return () => lists.forEach(([parent, children]) => parent.replaceChildren(...children));
};

// A deleted paragraph put back comes back from the source the file gave (its id with it); what was
// typed in it just before it went is committed once it is back. A forged source is refused.
{
  const s = studio(SOURCE);
  type(s.text("甲段落"), "甲段落，先改一下。");
  s.commit();
  const id = s.unit("甲段落").getAttribute("data-block-id");
  const section = s.section("第一章");
  const undo = recordLists(section);
  type(s.text("甲段落"), "甲段落，删前又改。");
  const paragraph = s.unit("甲段落");
  paragraph.remove();
  s.commit();
  assert.ok(!s.file.includes("甲段落") && s.commits.removed.size === 1);
  assert.equal(s.commits.build(), null, "its text went with it: nothing more to commit");
  undo();
  const back = s.commit();
  assert.deepEqual(back.receipt.units.map((entry) => entry.status), ["applied"]);
  assert.ok(s.file.includes(`<p data-block-id="${id}">甲段落，先改一下。</p>\n    <p>乙段落`), "put back as it was, with its id, in its place");
  assert.equal(s.commits.removed.size, 0);
  s.commit();
  assert.ok(s.file.includes(`<p data-block-id="${id}">甲段落，删前又改。</p>`), "then what was typed before it went");
  assert.equal(s.commits.build(), null);

  const forged = studio(SOURCE);
  const redo = recordLists(forged.section("第二章"));
  forged.unit("丙段落").remove();
  forged.commit();
  forged.commits.removed.get([...forged.commits.removed.keys()][0]).source = '<p onclick="alert(1)">丙段落</p>';
  redo();
  const refused = forged.commit();
  assert.deepEqual(refused.receipt.units.map((entry) => entry.status), ["conflict"], "only what the file gave comes back");
  assert.ok(!forged.file.includes("alert"));
}

// A section deleted with what it holds comes back whole; its blocks edit as before, by their ids.
{
  const s = studio(SOURCE);
  type(s.text("丙段落"), "丙段落（改）。");
  s.commit();
  const undo = recordLists(s.document.querySelector("main"));
  const chapter = s.section("第二章");
  chapter.remove();
  s.commit();
  assert.ok(!s.file.includes("第二章"));
  undo();
  s.commit();
  assert.match(s.file, /<\/section>\n\n  <section class="doc-section" aria-labelledby="b" data-block-id="[a-z0-9]{8}">\n    <h2 id="b"( data-block-id="[a-z0-9]{8}")?>第二章<\/h2>\n    <p data-block-id="[a-z0-9]{8}">丙段落（改）。<\/p>\n  <\/section>\n<\/main>/, "back in its place, set apart as sections are");
  type(s.text("丙段落"), "丙段落（回来后再改）。");
  s.section("第二章").querySelector("h2").textContent = "第二章（回来后）";
  s.commit();
  assert.ok(s.file.includes("丙段落（回来后再改）。") && /<h2 id="b"( data-block-id="[a-z0-9]{8}")?>第二章（回来后）<\/h2>/.test(s.file));
}

// A dissolve undone: the section comes back around its blocks (its title among them), which leave
// the page again, with the start tag it had.
{
  const s = studio(SOURCE);
  const second = s.section("第二章");
  const main = s.document.querySelector("main");
  const undo = recordLists(main, second);
  unwrapSection(second);
  s.commit();
  assert.ok(!s.file.includes('aria-labelledby="b"') && /\n  <h2 id="b"( data-block-id="[a-z0-9]{8}")?>第二章<\/h2>/.test(s.file), "dissolved: its title stands in the page");
  undo();
  const back = s.commit();
  assert.ok(allApplied(back.receipt.units), JSON.stringify(back.receipt.units));
  assert.match(s.file, /<section class="doc-section" aria-labelledby="b" data-block-id="[a-z0-9]{8}">\n    <h2 id="b"( data-block-id="[a-z0-9]{8}")?>第二章<\/h2>\n    <p( data-block-id="[a-z0-9]{8}")?>丙段落，在第二章。<\/p>\n  <\/section>/);
  s.section("第二章").querySelector("h2").textContent = "第二章（又改）";
  s.commit();
  assert.ok(/<h2 id="b"( data-block-id="[a-z0-9]{8}")?>第二章（又改）<\/h2>/.test(s.file), "a section like any other");
}

// A dissolve undone, redone and undone again, with ids: the section's start tag and the comment above
// it come back, the same id each time, and the page knows it as the unit it was (it names it by
// that id). What the blocks became meanwhile stays: only its tags come from its source.
{
  const s = studio(addBlockIds(page(`  <p>页首。</p>

  <!-- 这一章的说明 -->
  <section class="doc-section" id="chapter" aria-labelledby="b">
    <h2 id="b">第二章</h2>
    <p>丙段落，在第二章。</p>
  </section>
`)).text);
  const opened = s.file;
  const main = s.document.querySelector("main");
  const section = s.section("第二章");
  const id = section.getAttribute("data-block-id");
  const unit = section.getAttribute("data-ge-unit");
  const inSection = recordLists(main, section);
  unwrapSection(section);
  const flat = recordLists(main, section);
  s.commit();
  assert.ok(!s.file.includes(id) && !s.file.includes("这一章的说明"), "deleted, the comment above it with it");
  assert.ok(s.last.receipt.removed[Object.keys(s.last.receipt.removed)[0]].around, "its blocks went elsewhere: its source comes back, marked");
  assert.equal(s.commits.removed.size, 0, "not a unit deleted whole: nothing to write back from its source alone");
  type(s.text("丙段落"), "丙段落（解散后改）。");
  s.commit();
  for (const round of [1, 2]) {
    inSection();
    const back = s.commit();
    assert.ok(allApplied(back.receipt.units), JSON.stringify(back.receipt.units));
    assert.ok(s.file.includes(`<!-- 这一章的说明 -->
  <section class="doc-section" id="chapter" aria-labelledby="b" data-block-id="${id}">`) && /<\/h2>\n    <p data-block-id="[a-z0-9]{8}">丙段落（解散后改）。<\/p>\n  <\/section>/.test(s.file), `undone (${round}): the section as it was, around what its blocks say now`);
    assert.equal(section.getAttribute("data-block-id"), id, "the page says the same");
    assert.equal(section.getAttribute("data-ge-unit"), unit, "the unit it was");
    assert.ok(!section.hasAttribute("data-ge-new"));
    assert.equal(s.map.units.filter((each) => each.blockId === id).length, 1, "one unit of that id");
    assert.equal(s.commits.build(), null);
    flat();
    assert.ok(allApplied(s.commit().receipt.units), "redone");
    assert.ok(!s.file.includes(id));
  }
  inSection();
  s.commit();
  assert.equal(s.file.replace(/（解散后改）/, "，在第二章"), opened, "byte for byte the file it was, but for what was typed");
}

// A dissolve undone with a section in it: the file had it so, and may have it again, though a section
// takes none from the page. Nothing is held, and no other kind gets in that way.
{
  const s = studio(addBlockIds(page(`  <section class="doc-section" id="outer">
    <p>外层一段</p>
    <section class="doc-section" id="inner">
      <p>内层一段</p>
    </section>
  </section>
`)).text);
  const main = s.document.querySelector("main");
  const outer = main.querySelector("#outer");
  const inner = main.querySelector("#inner");
  const [outerId, innerId] = [outer, inner].map((node) => node.getAttribute("data-block-id"));
  const undo = recordLists(main, outer);
  unwrapSection(outer);
  s.commit();
  assert.ok(!s.file.includes('id="outer"') && /<\/p>\n\n?  <section class="doc-section" id="inner"/.test(s.file), "the section in it comes out whole");
  undo();
  const back = s.commit();
  assert.ok(allApplied(back.receipt.units), JSON.stringify(back.receipt.units));
  assert.deepEqual(back.conflicts, []);
  assert.equal(s.commits.issues.size, 0, "nothing held");
  assert.match(s.file, new RegExp(`<section class="doc-section" id="outer" data-block-id="${outerId}">\\n    <p data-block-id="[a-z0-9]{8}">外层一段</p>\\n    <section class="doc-section" id="inner" data-block-id="${innerId}">\\n      <p data-block-id="[a-z0-9]{8}">内层一段</p>\\n    </section>\\n  </section>`));
  assert.equal(s.commits.build(), null);

  const made = studio(addBlockIds(page(`  <section class="doc-section" id="first">
    <p>一段</p>
  </section>

  <section class="doc-section" id="second">
    <p>二段</p>
  </section>
`)).text);
  const first = made.document.querySelector("#first");
  const second = made.document.querySelector("#second");
  const redo = recordLists(made.document.querySelector("main"), first);
  unwrapSection(first);
  made.commit();
  redo();
  first.append(second); // a section the first did not hold
  const refused = made.commit();
  assert.ok(refused.receipt.units.some((entry) => entry.status === "conflict"), "what it did not hold it takes no more than it did");
  assert.ok(!/<section[^>]*id="first"[\s\S]*<section[^>]*id="second"[\s\S]*<\/section>\s*<\/section>/.test(made.file));

  const forged = studio(addBlockIds(page(`  <section class="doc-section" id="chapter">
    <p>一段</p>
  </section>
`)).text);
  const chapter = forged.document.querySelector("#chapter");
  const putBack = recordLists(forged.document.querySelector("main"), chapter);
  unwrapSection(chapter);
  forged.commit();
  putBack();
  const sent = forged.commit({ sent: (request) => ({ ...request, units: request.units.map((op) => op.insert?.restore ? { ...op, insert: { ...op.insert, restore: { ...op.insert.restore, source: '<section class="doc-section" onclick="alert(1)"></section>' } } } : op) }) });
  assert.deepEqual(sent.receipt.units.map((entry) => entry.status), ["conflict"], "only what the file gave comes back");
  assert.ok(!forged.file.includes("alert"));
}

// A section dissolved over someone else's change to a block in it: that block left with the others,
// so the section goes all the same, its source given back for undo, and none stands empty in the
// file. What they added to it stays, and so does the section around that.
{
  const written = addBlockIds(page(`  <!-- 这一章的说明 -->
  <section class="doc-section" id="chapter">
    <p>第一段</p>
    <p>第二段</p>
  </section>

  <p>页末</p>
`)).text;
  const s = studio(written);
  const section = s.document.querySelector("#chapter");
  const inSection = recordLists(s.document.querySelector("main"), section);
  unwrapSection(section);
  s.file = s.file.replace("第一段", "第一段（AI 改）");
  const gone = s.commit();
  assert.ok(allApplied(gone.receipt.units), JSON.stringify(gone.receipt.units));
  assert.ok(!s.file.includes('id="chapter"') && s.file.includes("第一段（AI 改）"), "the section out of the file, the change kept");
  inSection();
  assert.ok(allApplied(s.commit().receipt.units));
  assert.ok(s.file.includes('<!-- 这一章的说明 -->\n  <section class="doc-section" id="chapter"') && /第一段（AI 改）<\/p>\n    <p[^>]*>第二段<\/p>\n  <\/section>/.test(s.file), "back around them", );

  const added = studio(written);
  const held = added.document.querySelector("#chapter");
  unwrapSection(held);
  added.file = added.file.replace("    <p", "    <p>AI 加的段落。</p>\n    <p");
  assert.ok(allApplied(added.commit().receipt.units));
  assert.match(added.file, /id="chapter"[^>]*>\s*<p>AI 加的段落。<\/p>\s*<\/section>/, "what they added stays where it was");
}

// The comments after a section's last block come back with it, which no block took along.
{
  const written = addBlockIds(page(`
  <section class="doc-section" id="chapter">
    <p>第一段</p>
    <!-- 结尾的说明，
         分两行 -->
  </section>

  <p>页末</p>
`)).text;
  const s = studio(written);
  const section = s.document.querySelector("#chapter");
  const inSection = recordLists(s.document.querySelector("main"), section);
  unwrapSection(section);
  s.commit();
  assert.ok(!s.file.includes("结尾的说明"));
  inSection();
  s.commit();
  assert.equal(s.file, written, "byte for byte");
}

// The only block of its box comes back as it stood, in a page after its header (a blank line between
// them) and in a Sheet panel (none), with nothing left on a line of its own, any number of them.
{
  const THEM = `  <section class="doc-section" id="first">
    <p>一段</p>
  </section>
`;
  const alone = addBlockIds(page(THEM.replace(/^/, "\n"))).text;
  const s = studio(alone);
  const section = s.document.querySelector("#first");
  const inSection = recordLists(s.document.querySelector("main"), section);
  unwrapSection(section);
  s.commit();
  inSection();
  assert.ok(allApplied(s.commit().receipt.units));
  assert.equal(s.file, alone, "the only section of a page");

  const paneled = addBlockIds(page(`  <section class="doc-sheet-shell" data-doc-sheets="area" aria-label="选项卡">
    <div class="doc-sheet-tabs" aria-label="选项卡"><button class="doc-sheet-tab" type="button" data-sheet-tab="a">甲页</button></div>
    <div data-doc-sheet="a">
      <section class="doc-section" id="first">
        <p>一段</p>
      </section>
    </div>
  </section>
`)).text;
  const panel = studio(paneled);
  const held = panel.document.querySelector("#first");
  const back = recordLists(held.parentElement, held);
  unwrapSection(held);
  panel.commit();
  back();
  assert.ok(allApplied(panel.commit().receipt.units));
  assert.equal(panel.file, paneled, "the only section of a panel");

  // Two chapters made where nothing stays: a blank line between them, none left with spaces in it.
  const written = addBlockIds(page(`\n  <p>一段</p>\n`)).text;
  const two = studio(written);
  const paragraph = two.document.querySelector("main > p");
  for (const words of ["甲章", "乙章"]) {
    const chapter = newContainer(two.document, "section");
    const inner = newHost(two.document, "paragraph");
    inner.textContent = words;
    chapter.append(inner);
    paragraph.before(chapter);
  }
  const box = two.document.querySelector("main");
  const moved = paragraph;
  two.document.querySelectorAll("main > section")[1].append(moved);
  assert.ok(allApplied(two.commit().receipt.units));
  assert.ok(!/\n[ \t]+\n/.test(two.file), JSON.stringify(two.file.slice(two.file.indexOf("</header>"))));
  assert.match(two.file, /<\/section>\n\n  <section/, "set apart");
  assert.ok(box);
}

// A unit deleted in a section, then the section dissolved, in two commits or one: its undo puts it
// back from its own source. So does one put back by the commit that dissolves what it stands in.
{
  const written = addBlockIds(page(`
  <section class="doc-section" id="outer">
    <p>外层一段</p>
    <!-- 内层的说明 -->
    <section class="doc-section" id="inner">
      <p>内层一段</p>
    </section>
    <p>外层末段</p>
  </section>
`)).text;
  const opening = (s) => {
    const outer = s.document.querySelector("#outer");
    const inner = s.document.querySelector("#inner");
    return { outer, inner, main: s.document.querySelector("main"), id: inner.getAttribute("data-block-id"), unit: inner.getAttribute("data-ge-unit") };
  };
  for (const together of [false, true]) {
    const s = studio(written);
    const { outer, inner, main, unit } = opening(s);
    const whole = recordLists(outer);
    inner.remove();
    if (!together) s.commit();
    const holding = recordLists(main, outer);
    unwrapSection(outer);
    assert.ok(allApplied(s.commit().receipt.units));
    holding();
    assert.ok(allApplied(s.commit().receipt.units));
    whole();
    assert.ok(allApplied(s.commit().receipt.units));
    assert.equal(s.file, written, "byte for byte");
    assert.equal(inner.getAttribute("data-ge-unit"), unit, "the unit it was, and what it holds");
    assert.ok(!s.document.querySelector("[data-ge-new]"));
    // Deleted and put back after that: it still says where it stood.
    inner.remove();
    s.commit();
    whole();
    assert.ok(allApplied(s.commit().receipt.units), "what stood against its box's rule goes back again");
    assert.equal(s.file, written);
  }

  const s = studio(written);
  const { outer, inner, main, unit } = opening(s);
  const whole = recordLists(outer);
  inner.remove();
  s.commit();
  whole();
  const holding = recordLists(main, outer);
  unwrapSection(outer); // put back and taken out in one commit
  assert.ok(allApplied(s.commit().receipt.units));
  assert.equal(inner.getAttribute("data-ge-unit"), unit, "one put back is the unit it was");
  holding();
  assert.ok(allApplied(s.commit().receipt.units));
  assert.equal(s.file, written, "byte for byte");
}

// A list deleted with its items by one commit, each taken out by itself (as a selection across blocks
// does): its source holds them, so they went with it. Undone, each is the block it was: a change to one
// goes to it, and none comes back a second time, whatever the next commit names.
{
  const written = page(`  <p>第一段</p>
  <ul>
    <li>甲项</li>
    <li>乙项</li>
  </ul>
  <p>第三段</p>
`);
  for (const edited of [false, true]) {
    const s = studio(written);
    const main = s.document.querySelector("main");
    const list = main.querySelector("ul");
    const [first, second] = list.children;
    const whole = recordLists(main, list);
    first.remove();
    second.remove();
    list.remove();
    assert.ok(allApplied(s.commit().receipt.units));
    assert.ok(!s.file.includes("<ul") && s.commits.removed.size === 1, "one source: the list's");
    whole();
    assert.ok(allApplied(s.commit().receipt.units));
    assert.equal(s.file.replace(/ data-block-id="[^"]*"/g, ""), written);
    assert.equal(s.commits.removed.size, 0, "they are back with it");
    assert.ok(!s.document.querySelector("[data-ge-new]"));
    assert.equal(s.commits.build(), null, "nothing left to commit");
    main.querySelector(":scope > p:last-of-type").remove();
    if (edited) type(second, "乙项（改）");
    s.commit();
    assert.equal(s.commits.build(), null, "the items stand where they stood");
    assert.equal(s.last.request.units.filter((op) => op.insert).length, 0, "no block made");
    assert.deepEqual([...s.document.querySelectorAll("li")].map((item) => item.textContent), ["甲项", edited ? "乙项（改）" : "乙项"]);
    assert.deepEqual(s.file.match(/<li[^>]*>[^<]*<\/li>/g).map((item) => item.replace(/<[^>]*>/g, "")), ["甲项", edited ? "乙项（改）" : "乙项"], "the item changed, and no other written");
  }
}

// Undone one step (the first item taken out before, in the same commit): the list comes back from its
// source, and the item the page does not show goes again.
{
  const s = studio(page(`  <ul>
    <li>甲项</li>
    <li>乙项</li>
  </ul>
`));
  const main = s.document.querySelector("main");
  const list = main.querySelector("ul");
  const [first, second] = list.children;
  first.remove();
  const step = recordLists(main, list);
  second.remove();
  list.remove();
  s.commit();
  step();
  s.commit();
  s.commit();
  assert.equal(s.commits.build(), null);
  assert.deepEqual(s.file.match(/<li[^>]*>[^<]*<\/li>/g).map((item) => item.replace(/<[^>]*>/g, "")), ["乙项"]);
}

// What a unit holds goes with it whichever the page counts first: a quote made on the page after the
// paragraph in it has the higher number.
{
  const s = studio(page(`  <p>甲段</p>
  <p>末段</p>
`));
  const main = s.document.querySelector("main");
  const paragraph = main.querySelector("p");
  const unit = paragraph.getAttribute("data-ge-unit");
  const quote = newContainer(s.document, "quote");
  paragraph.replaceWith(quote);
  quote.append(paragraph);
  s.commit();
  const whole = recordLists(main, quote);
  paragraph.remove();
  quote.remove();
  assert.ok(allApplied(s.commit().receipt.units));
  assert.equal(s.commits.removed.size, 1);
  whole();
  assert.ok(allApplied(s.commit().receipt.units));
  assert.equal(paragraph.getAttribute("data-ge-unit"), unit);
  type(paragraph, "甲段（改）");
  s.commit();
  assert.equal(s.commits.build(), null);
  assert.ok(/<blockquote[^>]*>\s*<p[^>]*>甲段（改）<\/p>\s*<\/blockquote>/.test(s.file) && s.file.split("甲段").length === 2, "one paragraph, changed");
}

// In a section dissolved by the same commit the list still goes whole, with its items, and the section
// around what left it: each undo puts back its own.
{
  const written = addBlockIds(page(`
  <section class="doc-section" id="chapter">
    <p>第一段</p>
    <ul>
      <li>甲项</li>
      <li>乙项</li>
    </ul>
    <p>末段</p>
  </section>
`)).text;
  const s = studio(written);
  const main = s.document.querySelector("main");
  const section = s.document.querySelector("#chapter");
  const list = section.querySelector("ul");
  const items = [...list.children];
  const lists = recordLists(section, list);
  const page2 = recordLists(main);
  items.forEach((item) => item.remove());
  list.remove();
  unwrapSection(section);
  assert.ok(allApplied(s.commit().receipt.units));
  assert.ok(!s.file.includes("<section") && !s.file.includes("<ul"));
  assert.equal(s.commits.removed.size, 1, "the list's: the section's is the one it came back around");
  page2();
  lists();
  for (let tries = 0; tries < 3 && s.commits.build(); tries++) assert.ok(allApplied(s.commit().receipt.units));
  assert.equal(s.commits.build(), null);
  assert.equal(s.file, written, "byte for byte");
  assert.ok(!s.document.querySelector("[data-ge-new]"));
}

// A block of the file standing in a block made on the page when one commit deleted both, and the unit
// it stood in: the file has it only in that unit's source. Undone one step, that unit comes back first,
// and the block made takes it out of it with the next commit, written once and in its place.
{
  const written = page(`  <section class="doc-section" id="chapter">
    <p>甲段</p>
    <p>乙段</p>
  </section>
  <p>末段</p>
`);
  const s = studio(written);
  const main = s.document.querySelector("main");
  const section = s.document.querySelector("#chapter");
  const [first] = section.querySelectorAll("p");
  const quote = newContainer(s.document, "quote");
  quote.append(first);
  main.insertBefore(quote, main.querySelector(":scope > p"));
  const step = recordLists(main, quote, section);
  first.remove();
  quote.remove();
  section.remove();
  s.commit();
  step();
  assert.ok(allApplied(s.commit().receipt.units));
  assert.ok(allApplied(s.commit().receipt.units));
  assert.equal(s.commits.build(), null);
  assert.equal(s.file.split("甲段").length, 2, "written once");
  assert.match(s.file, /<\/section>\s*<blockquote[^>]*>\s*<p[^>]*>甲段<\/p>\s*<\/blockquote>\s*<p[^>]*>末段/, "where the page has it");

  // With the unit it stood in gone from the page, that unit comes back for one commit and goes.
  const alone = studio(page(`  <section class="doc-section" id="chapter">
    <p>甲段</p>
  </section>
  <p>末段</p>
`));
  const box = alone.document.querySelector("#chapter");
  const paragraph = box.querySelector("p");
  const wrapper = newContainer(alone.document, "quote");
  wrapper.append(paragraph);
  box.replaceWith(wrapper);
  const back = recordLists(alone.document.querySelector("main"), wrapper);
  wrapper.remove();
  assert.ok(allApplied(alone.commit().receipt.units));
  back();
  assert.ok(allApplied(alone.commit().receipt.units));
  assert.ok(allApplied(alone.commit().receipt.units));
  assert.equal(alone.commits.build(), null);
  assert.ok(!alone.file.includes("<section"));
  assert.match(alone.file, /<blockquote[^>]*>\s*<p[^>]*>甲段<\/p>\s*<\/blockquote>\s*<p[^>]*>末段/);
}

// Blocks a dissolve moved and its undo took back are where they were: nothing the commits left
// asks whether someone else put them back, and a write elsewhere is no conflict.
{
  const s = studio(addBlockIds(page(`  <section class="doc-section" id="chapter">
    <p>第一段</p>
  </section>

  <p>页末</p>
`)).text);
  const section = s.document.querySelector("#chapter");
  const inSection = recordLists(s.document.querySelector("main"), section);
  unwrapSection(section);
  s.commit();
  assert.ok(s.commits.placedUnits().some(({ parent, from }) => parent === null && from === section.getAttribute("data-block-id")), "moved out of it");
  inSection();
  s.commit();
  assert.ok(s.commits.placedUnits().every(({ parent, from }) => from === undefined || parent === from), JSON.stringify(s.commits.placedUnits()));
}

// A row of columns that gave its blocks back comes back with its columns' ids: a unit the file
// dropped proposes the id it had, when it is written anew.
{
  const written = addBlockIds(page(`  <div class="doc-columns" id="row">
    <div class="doc-column">
      <p>左栏</p>
    </div>
    <div class="doc-column">
      <p>右栏</p>
    </div>
  </div>

  <p>页末</p>
`)).text;
  const s = studio(written);
  const main = s.document.querySelector("main");
  const row = main.querySelector("#row");
  const [left, right] = row.querySelectorAll(":scope > .doc-column");
  const ids = [left, right].map((column) => column.getAttribute("data-block-id"));
  const inRow = recordLists(main, left, right);
  const [gone, stays] = [left.querySelector("p"), right.querySelector("p")];
  placeBefore(main, [stays], row);
  placeBefore(main, [gone], null);
  row.remove();
  assert.ok(allApplied(s.commit().receipt.units));
  assert.ok(!s.file.includes(ids[0]));
  for (const round of [1, 2]) {
    inRow();
    assert.ok(allApplied(s.commit().receipt.units));
    assert.deepEqual([...s.file.matchAll(/class="doc-column"[^>]* data-block-id="([a-z0-9]{8})"/g)].map((match) => match[1]), ids, `its columns' ids (${round})`);
    assert.equal(s.map.units.filter((unit) => ids.includes(unit.blockId)).length, 2, "one unit of the map has each");
    placeBefore(main, [stays], row);
    placeBefore(main, [gone], null);
    row.remove();
    assert.ok(allApplied(s.commit().receipt.units));
  }
}

// What a file holds where its box takes none from the reader goes back by any undo, a deletion's and
// a move's as a dissolve's: each says the kind of box it stood in (`stood`), and what stood nowhere
// such says nothing.
{
  const nested = addBlockIds(page(`  <section class="doc-section" id="outer">
    <p>外层一段</p>
    <section class="doc-section" id="inner">
      <p>内层一段</p>
    </section>
    <section class="doc-sheet-shell" id="shell" data-doc-sheets="area" aria-label="选项卡">
      <div class="doc-sheet-tabs" aria-label="选项卡"><button class="doc-sheet-tab" type="button" data-sheet-tab="a">第一页</button></div>
      <div data-doc-sheet="a"><p>第一页的字</p></div>
    </section>
  </section>

  <section class="doc-section" id="other">
    <p>别的分区</p>
  </section>

  <div class="doc-columns" id="row">
    <div class="doc-column"><div class="doc-columns" id="deep"><div class="doc-column"><p>深一</p></div><div class="doc-column"><p>深二</p></div></div></div>
    <div class="doc-column"><p>右栏</p></div>
  </div>
`)).text;
  for (const [selector, kind] of [["#inner", "section"], ["#shell", "section"], ["#deep", "column"]]) {
    for (const way of ["deleted", "moved out"]) {
      const s = studio(nested);
      const main = s.document.querySelector("main");
      const element = s.document.querySelector(selector);
      const undo = recordLists(element.parentElement, main);
      if (way === "deleted") element.remove();
      else main.append(element);
      s.commit();
      undo();
      const back = s.commit();
      assert.ok(allApplied(back.receipt.units), `${selector} ${way}: ${JSON.stringify(back.receipt.units)}`);
      assert.equal(s.last.request.units[0].stood ?? s.last.request.units[0].insert?.stood, kind, `${selector} ${way}: says where it stood`);
      assert.equal(s.commits.issues.size, 0);
      assert.equal(s.commits.build(), null);
      assert.equal(s.file, nested, `${selector} ${way}, undone: the file as it was`);
    }
  }

  const plain = studio(nested);
  plain.document.querySelector("#outer").append(plain.document.querySelector("#other"));
  assert.deepEqual(plain.commit().receipt.units.map((entry) => entry.reason), ["position"], "one that stood in no such box goes in none");
  const told = studio(nested);
  told.document.querySelector("#row").before(told.document.querySelector("#inner"));
  told.commit();
  told.document.querySelector("#deep .doc-column").append(told.document.querySelector("#inner"));
  assert.deepEqual(told.commit().receipt.units.map((entry) => entry.reason), ["position"], "nor one in a box of another kind");
}

// Every container whose blocks stand straight in it comes back the same way, the first time and
// with what its source said of it: a numbered list's start, a highlight block's color, a quote's id.
{
  for (const [name, source] of [
    ["a quote", '<blockquote id="said">\n    <p>引用一段</p>\n  </blockquote>'],
    ["a highlight block", '<div class="doc-panel doc-panel-blue" id="box">\n    <p>高亮一段</p>\n  </div>'],
  ]) {
    const s = studio(addBlockIds(page(`  <p>页首。</p>

  ${source}

  <p>页末。</p>
`)).text);
    const main = s.document.querySelector("main");
    const element = main.querySelector("#said, #box");
    const id = element.getAttribute("data-block-id");
    const undo = recordLists(main, element);
    element.before(...element.children);
    element.remove();
    s.commit();
    assert.ok(!s.file.includes(id), `${name}: gone`);
    undo();
    const back = s.commit();
    assert.ok(allApplied(back.receipt.units), `${name}: ${JSON.stringify(back.receipt.units)}`);
    assert.ok(s.file.includes(source.split("\n")[0].replace(/>$/, ` data-block-id="${id}">`)), `${name}: its start tag as it was: ${s.file}`);
    assert.equal(s.commits.build(), null, name);
  }

  const s = studio(addBlockIds(page(`  <p>页首。</p>

  <ol start="3" id="counted">
    <li>一项</li>
    <li>二项</li>
  </ol>
`)).text);
  const main = s.document.querySelector("main");
  const list = main.querySelector("#counted");
  const items = [...list.children];
  const id = list.getAttribute("data-block-id");
  const undo = recordLists(main, list);
  items.forEach((item) => convertBlock(item, "paragraph"));
  s.commit();
  assert.ok(!s.file.includes("<ol") && s.file.includes(">一项</p>"), "a list turned into paragraphs");
  undo();
  const back = s.commit();
  assert.ok(allApplied(back.receipt.units), JSON.stringify(back.receipt.units));
  assert.ok(s.file.includes(`<ol start="3" id="counted" data-block-id="${id}">`) && s.file.includes(">一项</li>"), s.file);
}

// Both undone while the commit deleting the section is on its way: the page shows the section
// again when the answer comes, and the next commit does what the undo does after the answer (the
// section was once taken for a new paragraph then: the file got a paragraph, the page went on with
// a section, and what was written in it was refused).
{
  const s = studio(SOURCE);
  type(s.text("丙段落"), "丙段落（改）。");
  s.commit();
  const putBack = recordLists(s.document.querySelector("main"));
  s.section("第二章").remove();
  s.commit({ between: putBack });
  assert.ok(!s.file.includes("第二章"));
  const back = s.commit();
  assert.ok(allApplied(back.receipt.units) && s.last.request.units.some((op) => op.insert?.restore), JSON.stringify(s.last.request.units));
  assert.match(s.file, /<\/section>\n\n  <section class="doc-section" aria-labelledby="b" data-block-id="[a-z0-9]{8}">\n    <h2 id="b"( data-block-id="[a-z0-9]{8}")?>第二章<\/h2>\n    <p data-block-id="[a-z0-9]{8}">丙段落（改）。<\/p>\n  <\/section>\n<\/main>/, "deleted, then put back from its source");
  type(s.text("丙段落"), "丙段落（回来后再改）。");
  s.commit();
  assert.ok(s.file.includes("丙段落（回来后再改）。</p>\n  </section>"));
  assert.equal(s.commits.build(), null);

  const t = studio(SOURCE);
  const second = t.section("第二章");
  const undo = recordLists(t.document.querySelector("main"), second);
  unwrapSection(second);
  t.commit({ between: undo });
  assert.ok(!t.file.includes('aria-labelledby="b"'));
  const again = t.commit();
  assert.ok(allApplied(again.receipt.units), JSON.stringify(again.receipt.units));
  assert.match(t.file, /<section class="doc-section" aria-labelledby="b" data-block-id="[a-z0-9]{8}">\n    <h2 id="b"( data-block-id="[a-z0-9]{8}")?>第二章<\/h2>\n    <p( data-block-id="[a-z0-9]{8}")?>丙段落，在第二章。<\/p>\n  <\/section>/, "dissolved, then put back around its blocks");
  assert.equal(t.commits.build(), null);
}

// A conversion undone converts back: the paragraph again, its id kept, its text editable.
{
  const s = studio(SOURCE);
  const section = s.section("第一章");
  const undo = recordLists(section);
  const heading = convertBlock(s.text("乙段落"), "heading3").focus;
  s.commit();
  const id = s.file.match(/<h3 data-block-id="([a-z0-9]{8})">乙段落/)[1];
  assert.ok(heading.isConnected);
  undo();
  s.commit();
  assert.ok(s.file.includes(`<p data-block-id="${id}">乙段落，写的是中间。</p>`), "a paragraph again, the same block");
  type(s.text("乙段落"), "乙段落，变回来了。");
  s.commit();
  assert.ok(s.file.includes(`<p data-block-id="${id}">乙段落，变回来了。</p>`));
}

// A split undone and redone: the new paragraph goes, then comes back with its id.
{
  const s = studio(SOURCE);
  const host = s.text("甲段落");
  const section = s.section("第一章");
  const before = recordLists(section);
  const text = host.innerHTML;
  const range = s.document.createRange();
  range.setStart(host.firstChild, 5);
  splitBlock(host, range);
  const after = recordLists(section);
  const split = host.innerHTML;
  s.commit();
  const id = s.file.match(/<p data-block-id="([a-z0-9]{8})">的是开头。<\/p>/)[1];
  before();
  host.innerHTML = text;
  s.commit();
  assert.ok(s.file.includes("甲段落，写的是开头。</p>") && !s.file.includes(`data-block-id="${id}"`), "undone");
  after();
  host.innerHTML = split;
  s.commit();
  assert.ok(s.file.includes(`<p data-block-id="${id}">的是开头。</p>`), "redone, the same block");
  assert.equal(s.commits.build(), null);
}

// A commit sent twice (its answer lost, or sent again from the crash buffer) writes once: the
// split-off paragraph, a new section, a conversion and a deletion are in the file after the first
// send, and the second finds them there by the ids the page proposed.
{
  const s = studio(SOURCE);
  type(s.text("丙段落"), "丙段落，有了 id。");
  s.commit();
  const host = s.text("甲段落");
  const range = s.document.createRange();
  range.setStart(host.firstChild, 5);
  splitBlock(host, range);
  sectionAfter(s.section("第二章")).focus.textContent = "第三章";
  convertBlock(s.text("乙段落"), "heading3");
  removeUnit(s.unit("丙段落"));
  const built = s.commits.build();
  const first = commitEdits({ current: s.file, ...built.request, opening: SOURCE, seal });
  assert.ok(first.text.includes("的是开头。</p>") && first.text.includes("第三章") && first.text.includes("<h3") && !first.text.includes("丙段落"));
  const again = commitEdits({ current: first.text, ...built.request, opening: SOURCE, seal });
  assert.equal(again.text, first.text, "the second send changes nothing");
  assert.ok(allApplied([...again.texts, ...again.units]), `nothing said to be merged or refused: ${JSON.stringify([...again.texts, ...again.units])}`);
  for (const [key, id] of Object.entries(first.made)) assert.equal(again.made[key], id, "the blocks it made, known by their ids");
  s.file = again.text;
  s.commits.apply(built.pending, again);
  assert.equal(s.commits.build(), null, "and the page is where the file is");
}

// A conversion that carries a color, sent again: the unit shows it already (the colored heading as
// the file has it), so the second send changes nothing and says nothing is refused.
{
  const s = studio(SOURCE);
  const color = BLOCK_COLORS[0];
  s.text("乙段落").classList.add(color);
  convertBlock(s.text("乙段落"), "heading3");
  const built = s.commits.build();
  assert.ok(JSON.stringify(built.request.units).includes(color), "the conversion carries the color");
  const first = commitEdits({ current: s.file, ...built.request, opening: SOURCE, seal });
  assert.ok(first.text.includes(color) && first.text.includes("<h3"), "written with its color");
  const again = commitEdits({ current: first.text, ...built.request, opening: SOURCE, seal });
  assert.equal(again.text, first.text, "the second send changes nothing");
  assert.ok(allApplied(again.units), JSON.stringify(again.units));
}

// The reader's decisions on a conflict: "mine" commits over the file's words; "force" deletes a
// block the Agent changed anyway; "discard" never sends the change again.
{
  const s = studio(SOURCE);
  s.file = s.file.replace("甲段落，写的是开头。", "甲段落，AI 写的开头。");
  type(s.text("甲段落"), "甲段落，人写的开头。");
  const held = s.commit();
  assert.equal(held.conflicts[0].kind, "text");
  s.commits.resolve(held.conflicts[0].key, "mine");
  s.commit();
  assert.ok(s.file.includes("甲段落，人写的开头。") && !s.file.includes("AI 写的"), "the reader's words over the Agent's");

  s.file = s.file.replace("丙段落，在第二章。", "丙段落，在第二章（AI）。");
  removeUnit(s.unit("丙段落"));
  const refused = s.commit();
  assert.deepEqual(refused.conflicts.map((entry) => [entry.kind, entry.reason, entry.change?.remove]), [["unit", "changed", true]]);
  assert.equal(s.commits.build(), null, "held back");
  s.commits.resolve(`u${refused.conflicts[0].unit}`, "force");
  s.commit();
  assert.ok(!s.file.includes("丙段落"), "deleted anyway");

  s.file = s.file.replace("乙段落，写的是中间。", "乙段落，AI 的中间。");
  type(s.text("乙段落"), "乙段落，人的中间。");
  const given = s.commit();
  s.commits.resolve(given.conflicts[0].key, "discard");
  type(s.text("乙段落"), "乙段落，人又改了。");
  assert.equal(s.commits.build(), null, "a change given up is not sent again");
}

// A block made on the page whose neighbour the Agent deleted meanwhile goes to the end of its box.
{
  const s = studio(SOURCE);
  sectionAfter(s.section("第二章")).focus.textContent = "第三章";
  const built = s.commits.build();
  s.file = s.file.replace(/\n\n  <section class="doc-section" aria-labelledby="b">[\s\S]*?<\/section>/, "");
  const first = commitEdits({ current: s.file, ...built.request, opening: SOURCE, seal });
  assert.deepEqual(first.units.map((entry) => entry.reason), ["position"], "its place is gone");
  s.file = first.text;
  assert.deepEqual(s.commits.apply(built.pending, first).conflicts, [], "not a conflict yet");
  s.commit();
  assert.match(s.file, /<\/section>\n\n  <section class="doc-section" data-block-id="[a-z0-9]{8}">\n    <p data-block-id="[a-z0-9]{8}">第三章<\/p>\n  <\/section>\n<\/main>/, "at the end of the page");
}

// A Sheet area made on the page: its tabs' names are text blocks the file has as the tab's own text
// (self, in a span of its own on the page, found through the tab's description), taken in as such;
// renaming a tab afterwards is an edit of that text, not a new tab.
{
  const { newSheets } = await import("../../src/editor/components/sheets/page.mjs");
  const s = studio(SOURCE);
  const shell = newSheets(s.document);
  s.section("第二章").after(shell);
  const made = s.commit();
  assert.ok(allApplied(made.receipt.units), JSON.stringify(made.receipt.units));
  const names = [...shell.querySelectorAll('.doc-sheet-tab > [data-ge-kind="tab"]')];
  assert.equal(names.length, 3);
  for (const name of names) {
    assert.ok(name.hasAttribute("data-ge-block"), "a tab's name a text block of the file");
    const block = s.map.blocks[Number(name.getAttribute("data-ge-block"))];
    assert.ok(block.self && block.unit !== null, "its own text, in its tab's unit");
  }
  assert.equal(s.commits.build(), null, "nothing left to commit");
  type(names[1], "进展");
  const renamed = s.commit();
  assert.deepEqual(renamed.receipt.texts.map((entry) => entry.status), ["applied"]);
  assert.match(s.file, />进展<\/button>/, "the tab's text is the new name");
  assert.equal(s.file.match(/doc-sheet-tab"/g).length, 3, "still three tabs");
}

// A block made on the page next to a block without an id yet (found by what it was when the page
// opened). The Agent deletes that block with its section: the block made is not put next to a block
// that only stands where it stood (the last paragraph of the other section), it is a conflict of
// position. The Agent rewords that block instead: the block made goes right after it.
{
  const list = (document, after, text) => {
    const box = newContainer(document, "bullets");
    const item = newHost(document, "item");
    item.textContent = text;
    box.append(item);
    after.after(box);
  };
  const two = page(`  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">第一章</h2>
    <p>甲段落，写的是开头。</p>
  </section>

  <section class="doc-section" aria-labelledby="b">
    <h2 id="b">第二章</h2>
    <p>丙段落，在第二章。</p>
  </section>
`);
  const s = studio(two);
  list(s.document, s.unit("丙段落"), "新列表");
  const built = s.commits.build();
  const gone = two.replace(/\n\n  <section class="doc-section" aria-labelledby="b">[\s\S]*?<\/section>/, "");
  const refused = commitEdits({ current: gone, ...built.request, opening: two, seal });
  assert.deepEqual(refused.units.map((entry) => entry.reason), ["position"], JSON.stringify(refused.units));
  assert.equal(refused.text, gone, "nothing put elsewhere");
  const reworded = commitEdits({ current: two.replace("丙段落，在第二章。", "丙段落，在第二章里（AI 改写）。"), ...built.request, opening: two, seal });
  assert.deepEqual(reworded.units.map((entry) => entry.status), ["applied"]);
  assert.match(reworded.text, /丙段落，在第二章里（AI 改写）。<\/p>\n    <ul data-block-id="[a-z0-9]{8}">\n      <li data-block-id="[a-z0-9]{8}">新列表<\/li>/, "right after the paragraph it was put after");
}

// A section dissolved (deleted, its blocks moved out after the block before it) while the Agent
// deleted that block: the moves have no place, and the section is not deleted either, or its
// blocks would go with it. The page tries again at the end of the box (once), and then both go.
{
  const s = studio(SOURCE);
  type(s.text("丙段落"), "丙段落（改）。"); // its blocks get their ids
  s.commit();
  const second = s.section("第二章");
  const main = s.document.querySelector("main");
  unwrapSection(second);
  s.file = s.file.replace(/\n    <p>乙段落，写的是中间。<\/p>|\n    <figure[\s\S]*?<\/figure>|\n    <div class="doc-table-wrap">[\s\S]*?<\/div>/g, "");
  const first = s.commit();
  assert.ok(first.receipt.units.every((entry) => entry.status === "conflict" && entry.reason === "position"), JSON.stringify(first.receipt.units));
  assert.ok(s.file.includes("丙段落（改）。"), "nothing deleted: the blocks had no place to go");
  assert.deepEqual(first.conflicts, [], "tried again, not a conflict yet");
  const again = s.commit();
  assert.ok(allApplied(again.receipt.units), JSON.stringify(again.receipt.units));
  assert.ok(!s.file.includes('aria-labelledby="b"') && s.file.includes("丙段落（改）。"), "then dissolved, its blocks in the page");
  assert.ok([...main.children].some((node) => node.textContent.includes("丙段落（改）")));
}

// Two of the page's units never act on one of the file. A section dissolved (its blocks moved out)
// while the Agent deleted one of them that has no id yet: found only as the one most like it, that
// one is another block this commit moves (the same words but two), which would have been written
// twice (the file came out with it three times). It is gone instead; the rest goes in once.
{
  const two = page(`  <p>开头一段。</p>

  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">第一章</h2>
    <p>甲段落，写的是开头。</p>
    <p>乙段落，写的是中间。</p>
  </section>
`);
  const s = studio(two);
  const section = s.document.querySelector("main section");
  section.insertBefore(s.unit("乙段落"), s.unit("甲段落"));
  s.commit();
  type(s.text("甲段落"), "甲段落，写的是开头（改）。");
  unwrapSection(section);
  const built = s.commits.build();
  const current = s.file.replace(/\n\s*<p>乙段落，写的是中间。<\/p>/, "");
  assert.notEqual(current, s.file);
  const result = commitEdits({ current, ...built.request, opening: two, seal });
  assert.equal(result.text.split("甲段落").length, 2, result.text.match(/<main[\s\S]*<\/main>/)[0]);
  assert.ok(result.text.includes("甲段落，写的是开头（改）。</p>") && !result.text.includes("乙段落"));
}

// A list whose last item is deleted while the page still shows it (around a new item, empty, not
// written yet) goes from the file too, and the answer says so (`gone`): the page makes it anew, so
// the item written in it later goes in with it. A list left with no items still takes them.
{
  const s = studio(SOURCE.replace("<p>丙段落，在第二章。</p>", "<p>丙段落，在第二章。</p>\n    <ul>\n      <li>唯一一项</li>\n    </ul>"));
  type(s.text("唯一一项"), "唯一一项（改）。");
  s.commit();
  const item = s.text("唯一一项");
  const range = s.document.createRange();
  range.setStart(item.firstChild, 0);
  splitBlock(item, range);
  removeUnit(item);
  const gone = s.commit();
  assert.ok(gone.receipt.gone.length >= 1 && !/<ul[^>]*>\s*<\/ul>/.test(s.file) && !s.file.includes("唯一一项"), JSON.stringify(gone.receipt.gone));
  s.document.querySelector("main ul:last-of-type li").textContent = "后写的一项";
  const written = s.commit();
  assert.ok(written.conflicts.length === 0 && /<ul data-block-id="[a-z0-9]{8}">\s*<li data-block-id="[a-z0-9]{8}">后写的一项<\/li>\s*<\/ul>/.test(s.file), s.file.match(/<section[^>]*aria-labelledby="b"[\s\S]*?<\/section>/)?.[0]);
  const { scan } = await import("../../src/editor/source/blocks.mjs");
  const empty = scan(page("  <ul data-block-id=\"emptylst\">\n  </ul>\n"));
  assert.ok(empty.boxes.some((box) => box.kind === "list" && empty.units[box.unit]?.blockId === "emptylst"), "an empty list still a box");
}

// Before the page shows someone else's write: the texts it committed that the write put back.
{
  const s = studio(SOURCE);
  type(s.text("甲段落"), "甲段落，人改的。");
  type(s.text("乙段落"), "乙段落，人改的。");
  s.commit();
  const committed = s.commits.committed();
  assert.equal(committed.length, 2);
  const rewritten = SOURCE.replace("乙段落，写的是中间。", "乙段落，AI 另写的。"); // the Agent writes the file it read before
  const { revertedTexts } = await import("../../src/editor/source.mjs");
  const back = revertedTexts({ current: rewritten, opening: SOURCE, texts: committed });
  assert.deepEqual(back, [{ key: committed.find((entry) => entry.mine.startsWith("甲")).key, theirs: "甲段落，写的是开头。" }], "the one put back as it was; the one the Agent changed otherwise is its own choice");
  // Two that name one block, by its unit's id and by where the page opened on it, as two loads of the page
  // named it: asked of at once, the second overlaps the first; one by one, each is answered, and so is
  // every other text the write put back.
  const named = committed.find((entry) => entry.mine.startsWith("乙"));
  const twice = [...committed, { ...named, key: "again", block: { ...named.block, unit: { key: 99, open: named.block.unit.open, hash: named.block.unit.openHash, blockId: "zzzzzzzz" } } }];
  const atOnce = commitEdits({ current: SOURCE, opening: SOURCE, ids: false, texts: twice.map(({ key, block }) => ({ key, block, parts: [{ keep: true, html: block.before }] })) }).texts;
  assert.deepEqual(atOnce.filter((entry) => entry.reason === "overlap").map((entry) => entry.key), ["again"], JSON.stringify(atOnce));
  assert.deepEqual(revertedTexts({ current: SOURCE, opening: SOURCE, texts: twice }).map(({ key, theirs }) => [key, theirs]).sort(), [...committed.map((entry) => [entry.key, entry.original]), ["again", "乙段落，写的是中间。"]].sort(), "two naming one block blind it to no other");
  // Committed again: what it was between counts too, written back by an Agent that read it then; back as
  // it was first, it is asked of what it was between.
  const between = s.file;
  type(s.text("甲段落"), "甲段落，人又改了。");
  s.commit();
  const again = s.commits.committed().find((entry) => entry.mine.startsWith("甲"));
  assert.deepEqual([again.original, again.earlier], ["甲段落，写的是开头。", ["甲段落，人改的。"]], JSON.stringify(again));
  assert.deepEqual(revertedTexts({ current: between, opening: SOURCE, texts: s.commits.committed() }), [{ key: again.key, theirs: "甲段落，人改的。" }], "the file as read between the two commits");
  assert.deepEqual(revertedTexts({ current: SOURCE, opening: SOURCE, texts: s.commits.committed() }).map((entry) => entry.theirs).sort(), ["乙段落，写的是中间。", "甲段落，写的是开头。"], "and as read before both");
  assert.deepEqual(revertedTexts({ current: between, opening: SOURCE, texts: [{ ...again, earlier: undefined }] }), [], "a page of an earlier Gallery asks of the first alone");
  type(s.text("甲段落"), "甲段落，写的是开头。");
  s.commit();
  const first = s.commits.committed().find((entry) => entry.mine.startsWith("甲"));
  assert.deepEqual([first?.original, first?.mine, first?.earlier], ["甲段落，写的是开头。", "甲段落，写的是开头。", ["甲段落，人改的。", "甲段落，人又改了。"]], JSON.stringify(first));
  assert.deepEqual(revertedTexts({ current: between, opening: SOURCE, texts: [first] }), [{ key: first.key, theirs: "甲段落，人改的。" }], "put back as it was first: a file read before is asked of, the reader's taking back undone");
  assert.deepEqual(revertedTexts({ current: SOURCE, opening: SOURCE, texts: [first] }), [], "and the file as it was first holds the reader's words");
}

// A block the page made, taken out by someone else's write: put back (the reader asked) where the file
// holds what stood there before it was made (an Agent writing the file it read before); the writer's own
// change where blocks the page does not know stand in its place (an Agent asked to put a picture in place
// of the reader's paragraph: feedback of 2026-11-17, the card came each time), unless that
// write put back something else of the page's too, which says it was written from an earlier read.
{
  const { revertCheck } = await import("../../src/editor/source.mjs");
  const s = studio(addBlockIds(SOURCE).text);
  const read = s.file; // what the Agent read before the reader's edits
  const added = newHost(s.document, "paragraph");
  added.textContent = "读者新写的一段：这里放截图。";
  s.unit("甲段落").after(added);
  const made = s.commit();
  assert.ok(allApplied([...made.receipt.texts, ...made.receipt.units]), JSON.stringify(made.receipt));
  const idOf = (words) => s.unit(words).getAttribute("data-block-id");
  const placed = s.commits.placedUnits();
  assert.deepEqual(placed.map(({ id, between }) => [id, between.map((side) => side.map((ref) => ref && ref.id))]), [[added.getAttribute("data-block-id"), [[idOf("甲段落"), s.document.querySelector("h2").closest("[data-block-id]").getAttribute("data-block-id"), null], [idOf("乙段落"), s.document.querySelector("main figure").getAttribute("data-block-id"), s.document.querySelector("main .doc-table-wrap").getAttribute("data-block-id"), null]]]], "named with the units it stands between, nearest first, the box's start or end where it comes");
  assert.ok(placed[0].between.flat().every((ref) => ref === null || typeof ref.hash === "string"), "each with its words' hash too");
  const key = placed[0].key;
  const line = s.file.split("\n").find((each) => each.includes("读者新写的一段"));
  const check = (current, units = placed) => revertCheck({ current, opening: read, texts: s.commits.committed(), units, pageIds: s.commits.pageIds(), taken: s.commits.takenOut() }).units;
  for (const picture of ['<p><img src="assets/shot.png" alt="训练曲线"></p>', '<img src="assets/shot.png" alt="训练曲线">', '<figure><img src="assets/shot.png"><figcaption>训练曲线</figcaption></figure>', '<figure class="doc-image" data-block-id="newpic01"><img src="assets/shot.png"></figure>']) {
    assert.deepEqual(check(s.file.replace(line, `    ${picture}`)), [], `replaced in place (${picture}): the writer's change, no card`);
  }
  assert.deepEqual(check(s.file.replace(line, '    <p data-block-id="pnew0001">别的一段。</p>\n    <p>又一段。</p>')), [], "by two blocks new to the page");
  const gone = [{ key, gone: true }];
  const elsewhere = s.file.match(/\n\s*<figure class="doc-figure"[\s\S]*?<\/figure>/)[0];
  assert.deepEqual(check(s.file.replace(elsewhere, "").replace(line, elsewhere.trim())), gone, "a block the page shows elsewhere moved into its place: no telling it from a write from an earlier read, put back");
  assert.deepEqual(check(s.file.replace(`${line}\n`, "")), gone, "taken out with nothing in its place: put back");
  assert.deepEqual(check(read), gone, "the file as it was before it was made");
  assert.deepEqual(check(s.file.replace(`${line}\n`, "").replace(/(<p[^>]*>乙段落[^<]*<\/p>)/, '$1\n    <p><img src="assets/shot.png"></p>')), gone, "the picture elsewhere (after 乙, not where it stood): put back");
  assert.deepEqual(check(s.file.replace(line, "    <p><img src=\"assets/shot.png\"></p>"), placed.map(({ between, ...entry }) => entry)), gone, "an older page names no place: put back, as before");
  // Replaced together with the file's paragraph after it ("把这两段换成截图"; a review of 2026-11-17: a card,
  // that paragraph not found): the one the write took out with it stepped over, to the card after it.
  const next = s.file.split("\n").find((each) => each.includes("乙段落"));
  assert.deepEqual(check(s.file.replace(`${next}\n`, "").replace(line, '    <p><img src="assets/shot.png"></p>')), [], "replaced together with the paragraph after it: no card");
  assert.deepEqual(check(s.file.replace(`${next}\n`, "").replace(`${line}\n`, "")), gone, "both taken out, nothing in their place: put back");
  assert.deepEqual(check(s.file.replace(next, next.replace(/ data-block-id="[a-z0-9]{8}"/, "")).replace(line, '    <p><img src="assets/shot.png"></p>')), gone, "the paragraph after it there without its id, its words the same (written from before it was named): put back");  // Two blocks the reader made one after the other, replaced together by one picture: one place.
  const second = newHost(s.document, "paragraph");
  second.textContent = "读者又写的一段。";
  added.after(second);
  const madeToo = s.commit();
  assert.ok(allApplied([...madeToo.receipt.texts, ...madeToo.receipt.units]), JSON.stringify(madeToo.receipt));
  const both = s.file.match(/\n\s*<p[^>]*>读者新写的一段[^\n]*\n\s*<p[^>]*>读者又写的一段。<\/p>/)[0];
  assert.deepEqual(check(s.file.replace(both, '\n    <p><img src="assets/shot.png"></p>'), s.commits.placedUnits()), [], "two the reader made, replaced together: no card");
  assert.deepEqual(check(s.file.replace(both, ""), s.commits.placedUnits()).length, 2, "taken out together, nothing in their place: both put back");
  // The reader also changed a text since; the Agent's write from what it read before both, a picture where
  // the block stood: the text put back, and so the block too.
  type(s.text("乙段落"), "乙段落，人改的。");
  assert.ok(allApplied(s.commit().receipt.texts));
  const stale = read.replace(/(\n\s*<p[^>]*>乙段落)/, '\n    <p><img src="assets/shot.png"></p>$1');
  const answer = revertCheck({ current: stale, opening: read, texts: s.commits.committed(), units: s.commits.placedUnits(), pageIds: s.commits.pageIds() });
  assert.deepEqual([answer.reverted.map((entry) => entry.theirs), answer.units.map((entry) => entry.gone)], [["乙段落，写的是中间。"], [true, true]], "a write from an earlier read: the text and the blocks all put back");
}

// The reader deletes a paragraph of the file and writes a new one in its place; the Agent's write from what
// it read before puts the deleted one back where the new one stood: that is no block replaced, but the reader's
// put back, a card: by its id among the page's (`pageIds` keeps those of the units it took out), or, where it
// had no id (an Agent's block never exported), by its hash among those the page took out (`taken`).
for (const [label, source] of [["ids", addBlockIds(SOURCE).text], ["乙 without an id", addBlockIds(SOURCE).text.replace(/(<p) data-block-id="[a-z0-9]{8}"(>乙段落)/, "$1$2")]]) {
  const { revertCheck } = await import("../../src/editor/source.mjs");
  const s = studio(source);
  const read = s.file;
  removeUnit(s.unit("乙段落"));
  const added = newHost(s.document, "paragraph");
  added.textContent = "读者重写的一段。";
  s.unit("甲段落").after(added);
  const made = s.commit();
  assert.ok(allApplied([...made.receipt.texts, ...made.receipt.units]) && !s.file.includes("乙段落"), JSON.stringify(made.receipt));
  const placed = s.commits.placedUnits();
  const ask = (current) => revertCheck({ current, opening: read, units: placed, pageIds: s.commits.pageIds(), taken: s.commits.takenOut() }).units;
  assert.deepEqual(ask(read), [{ key: placed[0].key, gone: true }], `${label}: the paragraph it deleted back in its place: put back ${JSON.stringify({ taken: s.commits.takenOut(), placed })}`);
  if (label !== "ids") assert.deepEqual(revertCheck({ current: read, opening: read, units: placed, pageIds: s.commits.pageIds() }).units, [], `${label}: not told what the page took out, it would be taken for a replacement`);
  const line = s.file.split("\n").find((each) => each.includes("读者重写的一段"));
  assert.deepEqual(ask(s.file.replace(line, '    <p><img src="assets/shot.png"></p>')), [], `${label}: a picture in its place: replaced`);
}

// A container the reader made around blocks of the file (a section an undo put back, the blocks it holds
// taken along, no move of theirs asked of): a write that leaves those blocks standing where it stood puts it
// back, whatever stands there; one that put a picture there replaced it, and what stood inside it too.
{
  const { revertedUnits } = await import("../../src/editor/source.mjs");
  const file = addBlockIds(SOURCE).text;
  const idOf = (words) => new RegExp(`<p data-block-id="([a-z0-9]{8})">${words}`).exec(file)[1];
  const [a, b] = [idOf("甲段落"), idOf("乙段落")];
  const card = /<figure class="doc-figure"[^>]*data-block-id="([a-z0-9]{8})"/.exec(file)[1];
  const chapter = /<section class="doc-section" aria-labelledby="a"[^>]*data-block-id="([a-z0-9]{8})"/.exec(file)[1];
  const section = { key: 1, id: "wrapsec1", parent: chapter, between: [a, card], holds: [b, "newpara1"] };
  const inner = { key: 2, id: "newpara1", parent: "wrapsec1", between: [b, null] };
  assert.deepEqual(revertedUnits({ current: file, units: [section, inner] }).map((entry) => entry.key), [1, 2], "the blocks it held standing where it stood: put back");
  const replaced = file.replace(/(<p data-block-id="[a-z0-9]{8}">乙段落[^<]*<\/p>)/, '<p><img src="assets/shot.png"></p>');
  assert.deepEqual(revertedUnits({ current: replaced, units: [section, inner] }), [], "a picture in its place: replaced, with what stood inside it");
}

// The same where the units around it have no ids (a document the Agent wrote, never exported, the usual
// case): the commit that makes the block names the units right beside it (touchBeside), which the revert
// check finds it by. A review of 2026-11-17: named by their hash alone, the paragraph after it reworded
// by the same write ("下图所示" to "如上图所示") was not found, and the card came back; and a write from what
// the Agent read before the block was made, its own paragraph where the reader's stood, is told by those
// units having no ids, a card as before the replacement was told.
{
  const { revertCheck } = await import("../../src/editor/source.mjs");
  for (const [label, at] of [["between two", (s, added) => s.unit("甲段落").after(added)], ["last of its section", (s, added) => s.document.querySelector("main .doc-table-wrap").after(added)]]) {
    const s = studio(SOURCE);
    const read = s.file;
    const added = newHost(s.document, "paragraph");
    added.textContent = "读者新写的一段。";
    at(s, added);
    const made = s.commit();
    assert.ok(allApplied([...made.receipt.texts, ...made.receipt.units]), JSON.stringify(made.receipt));
    const placed = s.commits.placedUnits();
    const beside = [added.previousElementSibling, added.nextElementSibling].filter(Boolean);
    assert.ok(beside.length > 0 && beside.every((node) => /^[a-z][a-z0-9]{7}$/.test(node.getAttribute("data-block-id") ?? "") && s.file.includes(`data-block-id="${node.getAttribute("data-block-id")}"`)), `${label}: the units beside it named in the file`);
    assert.ok(placed.length === 1 && placed[0].between.every((side) => side[0] === null || typeof side[0].id === "string"), `${label}: and by their ids ${JSON.stringify(placed)}`);
    const line = s.file.split("\n").find((each) => each.includes("读者新写的一段"));
    const check = (current, units = placed) => revertCheck({ current, opening: read, texts: s.commits.committed(), units, pageIds: s.commits.pageIds(), taken: s.commits.takenOut() }).units;
    const gone = [{ key: placed[0].key, gone: true }];
    const picture = '    <p><img src="assets/shot.png"></p>';
    assert.deepEqual(check(s.file.replace(line, picture)), [], `${label}: a picture in its place: no card`);
    assert.deepEqual(check(s.file.replace(`${line}\n`, "")), gone, `${label}: nothing in its place: put back`);
    // The paragraph beside it reworded by the same write: found by its id.
    const reworded = s.file.replace(line, picture).replace("乙段落，写的是中间。", "乙段落，如上图所示。");
    assert.deepEqual(check(label === "between two" ? reworded : s.file.replace(line, picture).replace("<td>一</td>", "<td>一（改）</td>")), [], `${label}: the one beside it changed by the same write: no card`);
    assert.deepEqual(check(label === "between two" ? s.file.replace(`${line}\n`, "").replace("乙段落，写的是中间。", "乙段落，如上图所示。") : s.file.replace(`${line}\n`, "").replace("<td>一</td>", "<td>一（改）</td>")), gone, `${label}: taken out, the one beside it changed, nothing in its place: put back`);
    // A write from what the Agent read before the block was made, its own paragraph where the reader's stood.
    const anchor = label === "between two" ? read.split("\n").find((each) => each.includes("甲段落")) : read.split("\n").find((each) => each.includes("doc-table-wrap"));
    assert.deepEqual(check(read.replace(anchor, `${anchor}\n    <p>Agent 写的一段。</p>`)), gone, `${label}: a write from before it was made, a paragraph of its own where it stood: put back`);
    // A page that named the units beside it by their hash alone (one before the commit named them): changed,
    // its place cannot be told, put back.
    const byHash = placed.map((entry) => ({ ...entry, between: entry.between.map((side) => side.map((ref) => ref && { hash: ref.hash })) }));
    if (label === "between two") assert.deepEqual(check(reworded, byHash), gone, `${label}: named by hash alone, the one beside it changed: put back`);
  }
  // Straight in the page (no section around it, which the commit names too and that write would have without):
  // the units beside it are all that tell a write from what the Agent read before (the old copy a review of
  // 2026-11-17 found, in a document without ids: before, no card, the reader's paragraph gone silently).
  const straight = page("  <p>第一段。</p>\n  <p>第二段。</p>\n  <p>第三段。</p>\n");
  for (const [label, after, end] of [["inserted after the second", "第二段", false], ["appended at the end", "第三段", true]]) {
    const s = studio(straight);
    const read = s.file;
    // Enter at the end of a paragraph, saved while the new one is empty (a block of its own, partOwner), then typed in.
    const added = newHost(s.document, "paragraph");
    s.unit(after).after(added);
    const made = s.commit();
    assert.ok(allApplied(made.receipt.units) && made.receipt.texts.length === 0, JSON.stringify(made.receipt));
    type(added, "读者新写的一段。");
    assert.ok(allApplied(s.commit().receipt.texts));
    const placed = s.commits.placedUnits();
    const check = (current) => revertCheck({ current, opening: read, texts: s.commits.committed(), units: placed, pageIds: s.commits.pageIds(), taken: s.commits.takenOut() }).units;
    const anchor = read.split("\n").find((each) => each.includes(after));
    assert.deepEqual(check(read.replace(anchor, `${anchor}\n  <p>Agent 写的一段。</p>`)), [{ key: placed[0].key, gone: true }], `${label}: a write from before it was made, a paragraph of its own where it stood: put back`);
    const line = s.file.split("\n").find((each) => each.includes("读者新写的一段"));
    assert.deepEqual(check(s.file.replace(line, '  <p><img src="assets/shot.png"></p>')), [], `${label}: a picture in its place: no card`);
    if (!end) assert.deepEqual(check(s.file.replace(line, '  <p><img src="assets/shot.png"></p>').replace("第三段。", "第三段，见上图。")), [], `${label}: and the paragraph after it reworded: no card`);
  }
}

// Body text may stand straight in the page (and in a Sheet panel), before, between or instead of
// sections: the page is a flow as well as the sections' box. A heading makes no section by itself;
// a new section goes after a block of the page, and "解散分区" puts a section's blocks back where it was.
{
  assert.ok(accepts("main", "paragraph") && accepts("main", "section") && accepts("panel", "table") && !accepts("main", "item") && !accepts("section", "section"));
  const flat = page(`  <p>开头的一段。</p>
  <h2>第一部分</h2>
  <p>第一部分的正文。</p>
  <ul>
    <li>要点</li>
  </ul>
  <h2>第二部分</h2>
  <p>第二部分的正文。</p>
`);
  const s = studio(flat);
  type(s.text("第一部分的正文"), "第一部分的正文（改）。");
  s.commit();
  assert.match(s.file, /<p data-block-id="[a-z0-9]{8}">第一部分的正文（改）。<\/p>/, "edited where it stands");
  const main = s.document.querySelector("main");
  main.append(s.unit("开头的一段"));
  s.commit();
  assert.ok(s.file.indexOf("开头的一段") > s.file.indexOf("第二部分的正文"), "moved to the end of the page");

  const heading = s.unit("第一部分");
  assert.equal(unwrapCheck(heading), null, "only a section dissolves");
  sectionAfter(heading).focus.textContent = "新分区里的一段";
  s.commit();
  assert.match(s.file, /第一部分<\/h2>\s*<section class="doc-section" data-block-id="[a-z0-9]{8}">\s*<p data-block-id="[a-z0-9]{8}">新分区里的一段<\/p>\s*<\/section>\s*<p data-block-id="[a-z0-9]{8}">第一部分的正文/, "a new section right after the heading");
  const section = s.text("新分区里的一段").closest("section");
  assert.equal(unwrapCheck(section), "");
  unwrapSection(section);
  s.commit();
  assert.ok(!s.file.includes("<section") && s.file.includes("新分区里的一段</p>"), "dissolved: its blocks where it was");
  assert.equal(s.commits.build(), null);
}

// After a commit the page knows of the file what the file says (the answer's `file`), not what it
// sent. An item whose only item joined it: the file closes it right after its text, and its next
// edit is no conflict (its `before` is the file's text, whatever a structural change left there).
{
  const source = page(`  <section class="doc-section">
    <ul>
      <li>甲</li>
      <li>乙
        <ul>
          <li>乙一</li>
        </ul>
      </li>
    </ul>
  </section>
`);
  const s = studio(source);
  const own = (node) => [...node.childNodes].filter((child) => !/^(UL|OL)$/.test(child.tagName ?? "")).map((child) => child.textContent).join("").trim();
  const item = (words) => [...s.document.querySelectorAll("li")].find((node) => own(node) === words);
  const parent = item("乙");
  assert.equal(mergeWithPrevious(item("乙一")), parent);
  s.commit();
  assert.match(s.file, /<li data-block-id="[a-z0-9]{8}">乙乙一<\/li>/, "its text and end tag on one line, as an item without lists is written");
  type(item("乙乙一"), "乙乙一，再写。");
  assert.deepEqual(s.commit().receipt.texts.map((entry) => entry.status), ["applied"], "the next edit goes in as it is");
}

// A paragraph written over two lines, moved to a deeper place: the file indents its second line
// anew. The page takes that text from the file, so the next edit is applied, not merged.
{
  const flat = page(`  <p>两行的一段，
  第二行。</p>
  <section class="doc-section">
    <p>分区里的一段。</p>
  </section>
`);
  const s = studio(flat);
  s.document.querySelector("main section").append(s.unit("两行的一段"));
  s.commit();
  assert.ok(s.file.includes("两行的一段，\n    第二行。</p>"), "moved, its second line indented anew");
  type(s.text("两行的一段"), "两行的一段（改）。");
  assert.deepEqual(s.commit().receipt.texts.map((entry) => entry.status), ["applied"]);
  assert.ok(s.file.includes("两行的一段（改）。</p>"));
}

// A block deleted while the commit writing it is on its way: it is in the file all the same, and
// the page knows it, so the next commit takes it out. Nothing of it stays in the file.
{
  const s = studio(SOURCE);
  const host = s.text("甲段落");
  const range = s.document.createRange();
  range.setStart(host.firstChild, 5);
  splitBlock(host, range);
  s.commit({ between: () => mergeWithPrevious(host.nextElementSibling) });
  assert.ok(s.file.includes("的是开头。</p>"), "the split-off paragraph went into the file");
  s.commit();
  assert.ok(s.file.includes("甲段落，写的是开头。</p>") && !s.file.includes(">的是开头。</p>"), "and out again with the next commit");
  assert.equal(s.commits.build(), null);
}

// A paragraph emptied while a paragraph split off it is written: the file drops the empty one and
// keeps the new one. The emptied one, still on the page, is a new block from then on: moved and
// written in, it goes in as such, and nothing names the one the file dropped.
{
  const s = studio(SOURCE);
  const host = s.text("甲段落");
  const range = s.document.createRange();
  range.setStart(host.firstChild, host.firstChild.length);
  splitBlock(host, range);
  host.nextElementSibling.textContent = "拆出来的一段。";
  host.textContent = "";
  const first = s.commit();
  assert.deepEqual(first.receipt.texts.map((entry) => entry.status), ["applied"]);
  assert.ok(!s.file.includes("甲段落") && s.file.includes("拆出来的一段。</p>"), "the empty one went, the new one is in");
  s.section("第二章").append(host);
  host.textContent = "空了又写的一段。";
  const second = s.commit();
  assert.deepEqual([...second.receipt.texts, ...second.receipt.units].filter((entry) => entry.status === "conflict"), [], "no conflict");
  assert.ok(s.file.indexOf("空了又写的一段。") > s.file.indexOf("丙段落"), "written where it stands now");
  assert.equal(s.commits.build(), null);
}

// The last item emptied and turned into a paragraph after its list (Enter there): the paragraph
// stands for the item and, empty, is written empty after the list (an empty paragraph is kept).
{
  const s = studio(page(`  <ul>
    <li>甲</li>
    <li>乙</li>
  </ul>
`));
  const last = [...s.document.querySelectorAll("li")].at(-1);
  last.textContent = "";
  convertBlock(last, "paragraph");
  const { receipt } = s.commit();
  assert.ok(allApplied(receipt.units), JSON.stringify(receipt.units));
  assert.match(s.file, /<li>甲<\/li>\n\s*<\/ul>\n\s*<p data-block-id="[a-z0-9]{8}"><\/p>/, "the item now an empty paragraph after its list");
  assert.ok(!s.file.includes("乙"));
  assert.equal(s.commits.build(), null);
}

// A text block outside any unit whose element has the id "title" (a heading beside a detail card's
// content): the report's title and this one are two keys of the answer's `outside` ("title",
// "id:title"), never one.
{
  const s = studio(SOURCE.replace("</main>", `<dialog class="doc-dialog" id="note"><h2 id="title">卡片</h2><div class="doc-dialog-content"><p>内容</p></div></dialog></main>`));
  type(s.document.querySelector("#title"), "卡片（改）");
  const { receipt } = s.commit();
  assert.deepEqual([receipt.outside?.title, receipt.outside?.["id:title"]], ["报告", "卡片（改）"], "an element with the id title is not the document's title");
}

// Someone else wrote the file meanwhile (they moved a paragraph): the page takes in only what its
// own commit wrote, not the order they left, or its next commit would move the paragraph back.
{
  const s = studio(SOURCE);
  type(s.text("甲段落"), "甲段落（人改）。");
  const built = s.commits.build();
  const line = s.file.match(/\n[ \t]*<p>乙段落[^\n]*/)[0];
  s.file = s.file.replace(line, "").replace('<h2 id="b">第二章</h2>', `<h2 id="b">第二章</h2>${line}`);
  const receipt = commitEdits({ current: s.file, ...built.request, opening: SOURCE, seal });
  s.file = receipt.text;
  s.commits.apply(built.pending, receipt, { alone: false });
  type(s.text("丙段落"), "丙段落（人又改）。");
  const next = s.commits.build();
  assert.deepEqual(next.request.units, [], "no move back");
  assert.ok(s.file.indexOf("乙段落") > s.file.indexOf("第二章"), "their move stays");
}

// Someone else changed a cell meanwhile and the page's words went into another: the hash the file has
// of the table after that commit holds their change, which the page never saw, so a deletion of the
// table asks first, as it would have before those words.
{
  const source = page(`  <div class="doc-table-wrap" data-block-id="tb"><table class="doc-table"><tbody><tr><td>甲格</td><td>乙格</td></tr></tbody></table></div>\n  <p>后面</p>\n`);
  const s = studio(source);
  type(s.text("甲格"), "甲格（人改）");
  const built = s.commits.build();
  s.file = s.file.replace("乙格", "乙格（AI 改）");
  const receipt = commitEdits({ current: s.file, ...built.request, opening: source, seal });
  s.file = receipt.text;
  s.commits.apply(built.pending, receipt, { alone: false });
  assert.ok(allApplied(receipt.texts) && s.file.includes("甲格（人改）"), "the words go in");
  removeUnit(s.document.querySelector(".doc-table-wrap"));
  const deleted = s.commit();
  assert.deepEqual(deleted.conflicts.map((entry) => entry.reason), ["changed"], JSON.stringify(deleted.receipt.units));
  assert.ok(s.file.includes("乙格（AI 改）"), "their change stays");
}

// A table's operation the file refused (someone else changed a cell meanwhile) is held with the grid the
// page last committed, as a held unit keeps all else it had, so that 仍然调整 sends it. Its cells, which
// the page had shown since it opened (components/table/grid.mjs names them before the first marks), are
// those blocks still: the cell someone else changed keeps their words, and one typed into after goes
// from what the page knew of it, merged with theirs or held.
{
  const source = page(`  <div class="doc-table-wrap" data-block-id="tb"><table class="doc-table"><tbody><tr><td>甲格</td><td>乙格</td></tr></tbody></table></div>\n  <p>后面</p>\n`);
  const s = studio(source);
  const foreign = () => {
    const built = s.commits.build();
    if (!built) return null;
    const receipt = commitEdits({ current: s.file, ...built.request, opening: source, seal });
    s.file = receipt.text;
    return { receipt, ...s.commits.apply(built.pending, receipt, { alone: false }) };
  };
  s.file = s.file.replace("甲格", "甲格（AI 改）");
  for (const row of s.document.querySelectorAll("tr")) row.lastElementChild.remove();
  const refused = foreign();
  assert.deepEqual(refused.conflicts.map((entry) => entry.reason), ["changed"], JSON.stringify(refused.receipt.units));
  assert.equal(s.commits.build(), null, "held, nothing goes");
  s.commits.resolve(refused.conflicts[0].key, "force");
  const forced = foreign();
  assert.ok(forced && allApplied(forced.receipt.units), JSON.stringify(forced?.receipt.units));
  assert.ok(!s.file.includes("乙格") && s.file.includes("<td>甲格（AI 改）</td>"), `the column goes, their cell stays: ${s.file}`);
  assert.equal(s.commits.build(), null, "and nothing waits: the page's words of it are no change of the reader's");
  type(s.text("甲格"), "甲格，人");
  const typed = foreign();
  assert.ok(s.file.includes("（AI 改）"), `typed into after, their words stay: ${s.file}`);
  assert.ok(allApplied(typed.receipt.texts) ? s.file.includes("人") : typed.conflicts.length === 1, JSON.stringify(typed.receipt.texts));
}

// A table deleted, put back, and changed before the commit that puts it back (a column taken out, its
// span set): that commit writes the source it went with, so what the next commit compares it with is
// what the layout had when it went, and the change goes with the next.
{
  const s = studio(page(`  <p>前面</p>\n  <div class="doc-table-wrap" data-block-id="tb"><table class="doc-table"><thead><tr><th>甲</th><th>乙</th></tr></thead><tbody><tr><td>一</td><td>二</td></tr></tbody></table></div>\n  <p>后面</p>\n`));
  const wrap = s.document.querySelector(".doc-table-wrap");
  const [box, next] = [wrap.parentNode, wrap.nextSibling];
  removeUnit(wrap);
  assert.ok(allApplied(s.commit().receipt.units), "deleted");
  box.insertBefore(wrap, next);
  for (const row of wrap.querySelectorAll("tr")) row.lastElementChild.remove();
  wrap.style.setProperty("--doc-span", "1.5");
  for (let times = 0; times < 4 && s.commit(); times += 1);
  assert.equal(s.commits.counts().waiting, 0, "nothing waits");
  const table = /<table[\s\S]*?<\/table>/.exec(s.file)[0];
  assert.ok(!table.includes("乙") && !table.includes("二") && table.includes("一"), `the column goes: ${table}`);
  assert.match(s.file, /--doc-span: 1\.5/, "and so does its span");
}

// A table's columns changed and the table moved in one commit, its place gone meanwhile (someone else
// deleted the paragraph it went after): the columns go in, the move goes again at the end of its box, and
// the columns are not sent again, which would name cells of a table the file no longer has.
for (const columns of [["丁", "四"], null]) {
  const source = addBlockIds(page(`  <div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>甲</th><th>乙</th><th>丙</th></tr></thead><tbody><tr><td>一</td><td>二</td><td>三</td></tr></tbody></table></div>\n  <p>中间段</p>\n  <p>目标段</p>\n  <p>页尾</p>\n`)).text;
  const s = studio(source);
  const wrap = s.document.querySelector(".doc-table-wrap");
  for (const row of wrap.querySelectorAll("tr")) {
    row.firstElementChild.remove();
    if (!columns) continue;
    const cell = s.document.createElement(row.parentElement.localName === "thead" ? "th" : "td");
    cell.textContent = row.parentElement.localName === "thead" ? columns[0] : columns[1];
    row.append(cell);
  }
  s.unit("目标段").after(wrap);
  const first = s.commit({ between: () => { s.file = s.file.replace(/\n {2}<p data-block-id="[a-z0-9]{8}">目标段<\/p>/, ""); } });
  assert.deepEqual(first.receipt.units.map((entry) => entry.reason ?? entry.status), ["applied", "position"], JSON.stringify(first.receipt.units));
  const table = (text) => [.../<table[\s\S]*?<\/table>/.exec(text)[0].matchAll(/<t[hd](?:\s[^>]*)?>([^<]*)</g)].map((found) => found[1]).join(" ");
  const want = columns ? "乙 丙 丁 二 三 四" : "乙 丙 二 三";
  assert.equal(table(s.file), want, "the columns go in");
  const again = s.commit();
  assert.ok(again && s.last.request.units.every((op) => op.move) && allApplied(again.receipt.units), `the move alone goes again: ${JSON.stringify(s.last.request.units)}`);
  assert.equal(table(s.file), want, "and the columns stay as they went");
  assert.ok(s.file.indexOf("<table") > s.file.indexOf("页尾"), "the table at the end of its box");
  assert.equal(s.commits.build(), null, "and nothing waits");
}

// What a commit writes of a unit only in part keeps the rest as the file has it, someone else's change
// among it: a list retagged, a table's operation the reader said to do anyway, a section put back around
// its blocks, a quote made around a paragraph. The page then has no hash of the file's for it (the answer
// gives none), so that deleting it later asks first, their change staying.
{
  const foreign = (s, between = null) => {
    const built = s.commits.build();
    between?.();
    const receipt = commitEdits({ current: s.file, ...built.request, opening: s.opening, seal });
    s.file = receipt.text;
    return { receipt, ...s.commits.apply(built.pending, receipt, { alone: false }) };
  };
  const deleteAsks = (s, element, words, label) => {
    removeUnit(element);
    const deleted = foreign(s);
    assert.deepEqual(deleted.conflicts.map((entry) => entry.reason), ["changed"], `${label}: ${JSON.stringify(deleted.receipt.units)}`);
    assert.ok(s.file.includes(words), `${label}: their change stays`);
  };
  const open = (body) => Object.assign(studio(body), { opening: body });

  // Retagged while someone else changed an item.
  let s = open(page(`  <ul data-block-id="ls"><li data-block-id="i1">一项</li><li data-block-id="i2">二项</li></ul>\n  <p data-block-id="pp">后面</p>\n`));
  convertContainer(s.document.querySelector("ul"), "numbers");
  assert.ok(allApplied(foreign(s, () => { s.file = s.file.replace("二项", "二项（AI 改）"); }).receipt.units) && s.file.includes("<ol"), "retagged");
  deleteAsks(s, s.document.querySelector("ol"), "二项（AI 改）", "a list retagged");

  // A table's operation done anyway.
  s = open(page(`  <div class="doc-table-wrap" data-block-id="tb"><table class="doc-table"><tbody><tr><td>甲格</td><td>乙格</td></tr></tbody></table></div>\n  <p>后面</p>\n`));
  s.file = s.file.replace("甲格", "甲格（AI 改）");
  for (const row of s.document.querySelectorAll("tr")) row.lastElementChild.remove();
  const refused = foreign(s);
  s.commits.resolve(refused.conflicts[0].key, "force");
  assert.ok(allApplied(foreign(s).receipt.units) && s.file.includes("甲格（AI 改）"), "done anyway, their cell kept");
  deleteAsks(s, s.document.querySelector(".doc-table-wrap"), "甲格（AI 改）", "a table's operation done anyway");

  // A section put back around its blocks.
  s = open(addBlockIds(page(`  <p>页首。</p>\n  <section class="doc-section" aria-labelledby="b">\n    <h2 id="b">第二章</h2>\n    <p>丙段落，在第二章。</p>\n  </section>\n  <p>页尾。</p>\n`)).text);
  const main = s.document.querySelector("main");
  const section = main.querySelector("section");
  const lists = [[main, [...main.childNodes]], [section, [...section.childNodes]]];
  unwrapSection(section);
  assert.ok(allApplied(s.commit().receipt.units), "dissolved");
  s.file = s.file.replace("丙段落，在第二章。", "丙段落，在第二章（AI 改）。");
  lists.forEach(([parent, children]) => parent.replaceChildren(...children));
  assert.ok(allApplied(foreign(s).receipt.units) && /<section[\s\S]*（AI 改）[\s\S]*<\/section>/.test(s.file), "put back around it");
  deleteAsks(s, main.querySelector("section"), "（AI 改）", "a section put back around its blocks");

  // A quote made around a paragraph someone else changed.
  s = open(page(`  <p data-block-id="pa">甲段</p>\n  <p data-block-id="pz">末段</p>\n`));
  const paragraph = s.document.querySelector("main p");
  const quote = newContainer(s.document, "quote");
  paragraph.replaceWith(quote);
  quote.append(paragraph);
  assert.ok(allApplied(foreign(s, () => { s.file = s.file.replace("甲段", "甲段（AI 改）"); }).receipt.units) && /<blockquote[\s\S]*（AI 改）/.test(s.file), "the quote made around it");
  deleteAsks(s, quote, "甲段（AI 改）", "a quote made around it");

  // Made of nothing of theirs, a block's hash is the file's: deleting it asks nothing.
  s = open(page(`  <p data-block-id="pa">甲段</p>\n  <p data-block-id="pz">末段</p>\n`));
  const made = newHost(s.document, "paragraph");
  made.textContent = "新段";
  s.document.querySelector("main p").after(made);
  assert.ok(allApplied(foreign(s, () => { s.file = s.file.replace("末段", "末段（AI 改）"); }).receipt.texts) && s.file.includes("新段"), "made");
  removeUnit(made);
  assert.ok(allApplied(foreign(s).receipt.units) && !s.file.includes("新段"), "and deleted with no question");
}

// Someone else's change of a unit, then the reader's: what the page shows, what it sends and what the file
// keeps through the card and the reader's word.
{
  const foreign = (s, between = null) => {
    const built = s.commits.build();
    if (!built) return null;
    between?.();
    const receipt = commitEdits({ current: s.file, ...built.request, opening: s.opening, seal });
    s.file = receipt.text;
    s.last = { request: built.request, receipt };
    return { receipt, ...s.commits.apply(built.pending, receipt, { alone: false }) };
  };
  const open = (body) => Object.assign(studio(body), { opening: body });
  const status = (sent) => sent.receipt.units.map((entry) => entry.reason ?? entry.status);
  const sentOps = (s) => s.last.request.units.map((op) => ["remove", "replace", "table", "move"].filter((kind) => op[kind] !== undefined).concat(op.force ? ["force"] : []).join("+"));
  const cells = (text) => [.../<table[\s\S]*?<\/table>/.exec(text)[0].matchAll(/<td(?:\s[^>]*)?>([^<]*)</g)].map((found) => found[1]).join(" ");
  const inOrder = (text, ...words) => words.every((word, index) => text.indexOf(word) >= 0 && (index === 0 || text.indexOf(word) > text.indexOf(words[index - 1])));
  const TABLE = `  <div class="doc-table-wrap"><table class="doc-table"><tbody><tr><td>甲格</td><td>乙格</td><td>丙格</td></tr></tbody></table></div>\n  <p>中间段</p>\n  <p>目标段</p>\n  <p>页尾</p>\n`;
  const dropColumn = (s) => s.document.querySelectorAll("tr").forEach((row) => row.lastElementChild.remove());

  // A table held for its column taken out, then moved and words written elsewhere while the card stands:
  // the words go, the move waits with the rest of the unit, and 仍然调整 sends both.
  let s = open(addBlockIds(page(TABLE)).text);
  dropColumn(s);
  let sent = foreign(s, () => { s.file = s.file.replace("甲格", "甲格（AI）"); });
  assert.deepEqual(status(sent), ["changed"]);
  const card = sent.conflicts[0].key;
  s.unit("目标段").after(s.document.querySelector(".doc-table-wrap"));
  type(s.text("页尾"), "页尾（改）");
  sent = foreign(s);
  assert.ok(allApplied(sent.receipt.texts) && sent.receipt.units.length === 0, "the words go, the table's changes wait");
  s.commits.resolve(card, "force");
  sent = foreign(s);
  assert.deepEqual(sentOps(s).sort(), ["move", "table+force"], "仍然调整 sends the move made while it was held too");
  assert.ok(allApplied(sent.receipt.units) && cells(s.file) === "甲格（AI） 乙格" && s.file.indexOf("<table") > s.file.indexOf("目标段"), s.file);
  assert.equal(s.commits.build(), null, "and nothing waits");

  // Its column taken out and the table moved in one commit, the column refused (a cell changed) and the move
  // refused for its place (the paragraph it went after deleted): both wait, and 仍然调整 sends both.
  s = open(addBlockIds(page(TABLE)).text);
  dropColumn(s);
  s.unit("目标段").after(s.document.querySelector(".doc-table-wrap"));
  sent = foreign(s, () => { s.file = s.file.replace("甲格", "甲格（AI）").replace(/\n {2}<p data-block-id="[a-z0-9]{8}">目标段<\/p>/, ""); });
  assert.deepEqual(status(sent), ["changed", "position"]);
  s.commits.resolve(sent.conflicts[0].key, "force");
  sent = foreign(s);
  assert.deepEqual(sentOps(s).sort(), ["move", "table+force"], JSON.stringify(s.last.request.units));
  assert.ok(allApplied(sent.receipt.units) && cells(s.file) === "甲格（AI） 乙格" && s.file.indexOf("<table") > s.file.indexOf("页尾"), "the columns the page shows, the table at the end of its box");
  assert.equal(s.commits.build(), null, "and nothing waits");

  // 仍然删除, 仍然转换类型 and 仍然调整 are for the unit as the card showed it: written again since, they ask
  // again, saying so (`again`), the second write staying; then they go.
  const PARAGRAPH = page(`  <p data-block-id="pa">甲段落</p>\n  <p data-block-id="pz">末段</p>\n`);
  for (const [label, body, change, first, again, done] of [
    ["deleted", PARAGRAPH, (s) => removeUnit(s.unit("甲段落")), ["甲段落", "甲段落（AI）"], ["甲段落（AI）", "甲段落（AI 二）"], (text) => !text.includes("甲段落")],
    ["converted", PARAGRAPH, (s) => convertBlock(s.text("甲段落"), "heading3"), ["甲段落", "甲段落（AI）"], ["甲段落（AI）", "甲段落（AI 二）"], (text) => /<h3[^>]*>甲段落<\/h3>/.test(text) && !text.includes("AI")],
    ["a column taken out", addBlockIds(page(TABLE)).text, dropColumn, ["甲格", "甲格（AI）"], ["乙格", "乙格（AI 二）"], (text) => cells(text) === "甲格（AI） 乙格（AI 二）"],
  ]) {
    s = open(body);
    change(s);
    sent = foreign(s, () => { s.file = s.file.replace(...first); });
    assert.deepEqual(sent.conflicts.map((entry) => [entry.reason, Boolean(entry.again)]), [["changed", false]], label);
    s.file = s.file.replace(...again); // the Agent writes it again while the card stands
    s.commits.resolve(sent.conflicts[0].key, "force");
    sent = foreign(s);
    assert.deepEqual(sent.conflicts.map((entry) => [entry.reason, entry.again]), [["changed", true]], `${label}: written again since the card, it asks again: ${JSON.stringify(sent.receipt.units)}`);
    assert.ok(s.file.includes(again[1]), `${label}: their second write stays`);
    s.commits.resolve(sent.conflicts[0].key, "force");
    sent = foreign(s);
    assert.ok(allApplied(sent.receipt.units) && done(s.file), `${label}: then it goes: ${s.file}`);
  }

  // 仍然转换类型 is for the conversion: the block deleted while its card stood, the deletion asks as any does,
  // and the Agent's words stay.
  s = open(page(`  <p data-block-id="pa">甲段落</p>\n  <p data-block-id="pz">末段</p>\n`));
  convertBlock(s.text("甲段落"), "heading3");
  sent = foreign(s, () => { s.file = s.file.replace("甲段落", "甲段落（AI）"); });
  removeUnit(s.document.querySelector("main h3"));
  s.commits.resolve(sent.conflicts[0].key, "force");
  sent = foreign(s);
  assert.deepEqual(sent.conflicts.map((entry) => [entry.reason, Boolean(entry.change?.remove), Boolean(entry.again)]), [["changed", true, false]], JSON.stringify(s.last.request.units));
  assert.ok(s.file.includes("甲段落（AI）"), "their words stay");

  // A paragraph whose deletion (or a conversion, the block deleted since) waits on its card, and the section
  // after it dissolved: its blocks go after that paragraph, where they stood, not before it.
  for (const first of [(s) => removeUnit(s.unit("要删的一段")), (s) => convertBlock(s.text("要删的一段"), "heading3")]) {
    s = open(addBlockIds(page(`  <p>前面一段。</p>\n  <p>要删的一段。</p>\n  <section class="doc-section" aria-labelledby="c">\n    <h2 id="c">分区标题</h2>\n    <p>分区第一段。</p>\n    <p>分区第二段。</p>\n  </section>\n  <p>后面一段。</p>\n`)).text);
    first(s);
    sent = foreign(s, () => { s.file = s.file.replace("要删的一段。", "要删的一段（AI）。"); });
    assert.deepEqual(status(sent), ["changed"]);
    if (s.document.querySelector("main h3")) removeUnit(s.document.querySelector("main h3"));
    unwrapSection(s.section("分区标题"));
    sent = foreign(s);
    const at = ["前面一段", "要删的一段（AI）", "分区标题", "分区第一段", "分区第二段", "后面一段"].map((words) => s.file.indexOf(words));
    assert.ok(at.every((place, index) => place >= 0 && (index === 0 || place > at[index - 1])), `the dissolved section's blocks after the paragraph that waits: ${s.file}`);
  }

  // A move held for the reader (its place gone twice: the section it went into deleted) holds none of the
  // block's words: written while the card stands they go, and 用文件里的 gives up the move alone.
  s = open(addBlockIds(page(`  <p>甲段。</p>\n  <section class="doc-section" aria-labelledby="d">\n    <h2 id="d">一章</h2>\n    <p>章内段。</p>\n  </section>\n  <p>末段。</p>\n`)).text);
  s.section("一章").append(s.unit("甲段"));
  sent = foreign(s, () => { s.file = s.file.replace(/\n {2}<section[\s\S]*?<\/section>/, ""); });
  sent = foreign(s);
  assert.deepEqual(sent.conflicts.map((entry) => entry.reason), ["position"], JSON.stringify(sent.receipt.units));
  const moveCard = sent.conflicts[0].key;
  type(s.text("甲段"), "甲段，改了。");
  sent = foreign(s);
  assert.ok(sent && allApplied(sent.receipt.texts) && s.file.includes("甲段，改了。"), "the words go while the move waits");
  s.commits.resolve(moveCard, "discard");
  type(s.text("甲段"), "甲段，又改了。");
  sent = foreign(s);
  assert.ok(sent && allApplied(sent.receipt.texts) && sent.receipt.units.length === 0 && s.file.includes("甲段，又改了。"), "given up, the move alone");

  // Someone else's words merged into the block the caret is in: the caret stays among the reader's words,
  // after theirs where they went in before it, where it was where they went in after it, and right after the
  // reader's words before it where they went in on both sides.
  const selection = Object.getOwnPropertyDescriptor(globalThis, "getSelection");
  for (const [typed, caret, theirs, merged, before] of [
    ["要合并的一段文字在这里。甲", 13, (text) => text.replace("要合并的", "AI：要合并的"), "AI：要合并的一段文字在这里。甲", "AI：要合并的一段文字在这里。甲"],
    ["要合并甲的一段文字在这里。", 4, (text) => text.replace("在这里。", "在这里（AI）。"), "要合并甲的一段文字在这里（AI）。", "要合并甲"],
    ["要合并的甲一段文字在这里。", 5, (text) => text.replace("要合并的一段文字在这里。", "AI：要合并的一段文字在那里。"), "AI：要合并的甲一段文字在那里。", "AI：要合并的甲"],
  ]) {
    s = open(page(`  <p data-block-id="pa">要合并的一段文字在这里。</p>\n  <p data-block-id="pz">末段</p>\n`));
    globalThis.getSelection = () => s.document.getSelection();
    const host = s.text("要合并");
    host.textContent = typed;
    s.document.getSelection().collapse(host.firstChild, caret);
    sent = foreign(s, () => { s.file = theirs(s.file); });
    const range = s.document.createRange();
    range.setStart(host, 0);
    range.setEnd(s.document.getSelection().anchorNode, s.document.getSelection().anchorOffset);
    assert.ok(sent.receipt.texts[0].status === "merged" && host.textContent === merged, host.textContent);
    assert.equal(range.toString(), before, "the caret where the reader left it among their words");
  }
  if (selection) Object.defineProperty(globalThis, "getSelection", selection);
  else delete globalThis.getSelection;

  // Someone else's words merged into a block the reader wrote in again while the commit was on its way: the
  // page cannot show the merge, and the next commit merges again from what the page sent, their words staying.
  s = open(page(`  <p data-block-id="pa">要合并的一段文字在这里。</p>\n  <p data-block-id="pz">末段</p>\n`));
  type(s.text("要合并"), "要合并的x一段文字在这里。");
  sent = foreign(s, () => {
    s.file = s.file.replace("要合并的一段", "AI：要合并的一段");
    type(s.text("要合并"), "要合并的xy一段文字在这里。");
  });
  assert.ok(sent.receipt.texts[0].status === "merged" && sent.stale, JSON.stringify(sent.receipt.texts));
  sent = foreign(s);
  assert.ok(s.file.includes(">AI：要合并的xy一段文字在这里。</p>"), `the next commit keeps their words: ${s.file}`);

  // Placed after a block whose card says the Agent deleted it (`missing`), given up (接受删除) or still standing
  // with the block deleted on the page: the file has no such block, so what is placed goes after the one
  // before it, where the page shows it, not after that block and then to the end of its box.
  for (const accept of [true, false]) {
    s = open(page(`  <p data-block-id="pa">前段</p>\n  <p data-block-id="pw">要转的段</p>\n  <p data-block-id="p1">中一</p>\n  <p data-block-id="p2">中二</p>\n  <p data-block-id="pz">末段</p>\n`));
    convertBlock(s.text("要转的段"), "heading3");
    sent = foreign(s, () => { s.file = s.file.replace(/\n {2}<p data-block-id="pw">要转的段<\/p>/, ""); });
    assert.deepEqual(status(sent), ["missing"]);
    s.document.querySelector("main h3").remove();
    if (accept) s.commits.resolve(sent.conflicts[0].key, "discard");
    s.unit("前段").after(s.unit("末段"));
    sent = foreign(s);
    assert.ok(allApplied(sent.receipt.units) && /前段<\/p>\s*<p data-block-id="pz">末段<\/p>\s*<p data-block-id="p1">中一/.test(s.file), `${accept ? "given up" : "held"}: ${JSON.stringify(s.last.request.units)} ${s.file}`);
  }

  // A conversion that went in wrote the block's look with it (its color): its move, refused for its place and
  // going again, sends no color of its own over the one someone else gave the block since.
  s = open(page(`  <p data-block-id="pa">前段</p>\n  <p data-block-id="pb">要转的段</p>\n  <p data-block-id="pc">锚段</p>\n  <p data-block-id="pz">末段</p>\n`));
  convertBlock(s.text("要转的段"), "heading3");
  s.document.querySelector("main h3").classList.add("doc-highlight-yellow");
  s.unit("锚段").after(s.document.querySelector("main h3"));
  sent = foreign(s, () => { s.file = s.file.replace(/\n {2}<p data-block-id="pc">锚段<\/p>/, ""); });
  assert.deepEqual(status(sent), ["applied", "position"]);
  s.file = s.file.replace("doc-highlight-yellow", "doc-highlight-green");
  sent = foreign(s);
  assert.deepEqual(sentOps(s), ["move"], JSON.stringify(s.last.request.units));
  assert.ok(/<h3 class="doc-highlight-green" data-block-id="pb">/.test(s.file), s.file);

  // The refusal gives the unit as the file holds it once the commit is written: a column refused and the
  // table moved into a section in the same commit (its lines indented anew), 仍然调整 goes in.
  s = open(addBlockIds(page(`  <div class="doc-table-wrap">\n    <table class="doc-table">\n      <tbody>\n        <tr><td>甲格</td><td>乙格</td><td>丙格</td></tr>\n      </tbody>\n    </table>\n  </div>\n  <section class="doc-section" aria-labelledby="s">\n    <h2 id="s">一章</h2>\n    <p>章内段</p>\n  </section>\n  <p>页尾</p>\n`)).text);
  dropColumn(s);
  s.unit("章内段").after(s.document.querySelector(".doc-table-wrap"));
  sent = foreign(s, () => { s.file = s.file.replace("甲格", "甲格（AI）"); });
  assert.deepEqual(status(sent), ["changed", "applied"]);
  assert.equal(sent.conflicts[0].theirs.replace(/\s+/g, " "), "甲格（AI） 乙格 丙格", "with the words the file holds of it");
  s.commits.resolve(sent.conflicts[0].key, "force");
  sent = foreign(s);
  assert.ok(allApplied(sent.receipt.units) && cells(s.file) === "甲格（AI） 乙格", `${JSON.stringify(sent.receipt.units)} ${s.file}`);

  // 保留 Agent 的 on a conversion gives up the conversion, and that alone: the block moved while the card stood
  // goes where the page has it. The block stands as the reader converted it until the page shows the file's,
  // read-only, whatever element stands for it: words typed there would go with the conversion.
  s = open(page(`  <p data-block-id="pa">前面一段。</p>\n  <p data-block-id="pp">要处理的一段。</p>\n  <p data-block-id="pz">后面一段。</p>\n`));
  convertBlock(s.text("要处理的一段"), "heading2");
  sent = foreign(s, () => { s.file = s.file.replace("要处理的一段。", "要处理的一段（AI）。"); });
  assert.deepEqual(status(sent), ["changed"]);
  s.unit("后面一段").after(s.document.querySelector("main h2"));
  assert.equal(s.commits.build(), null, "held: the move waits with it");
  s.commits.resolve(sent.conflicts[0].key, "discard");
  sent = foreign(s);
  assert.ok(allApplied(sent.receipt.units) && /前面一段。<\/p>\s*<p data-block-id="pz">后面一段。<\/p>\s*<p data-block-id="pp">要处理的一段（AI）。<\/p>/.test(s.file), `${JSON.stringify(s.last.request.units)} ${s.file}`);
  const converted = s.document.querySelector("main h2");
  assert.ok(converted.getAttribute("contenteditable") === "false" && converted.getAttribute("data-ge-lock") === "given-up", converted.outerHTML);
  const original = s.layout.elements.get(Number(converted.getAttribute("data-ge-unit")));
  original.setAttribute("contenteditable", "true");
  converted.replaceWith(original); // the conversion undone
  s.commits.marks();
  assert.ok(original.getAttribute("contenteditable") === "false" && original.getAttribute("data-ge-lock") === "given-up", original.outerHTML);
  assert.equal(s.commits.build(), null, "and nothing of it goes");

  // 仍然删除 of a paragraph with no id, the section after it dissolved since its card: found by the hash its
  // card gave (where it stood is no help now), and deleted.
  s = open(page(`  <p>前面一段。</p>\n  <p>第一个要删的。</p>\n  <p>第二个要删的。</p>\n  <section class="doc-section" id="sec">\n    <h2>分区标题</h2>\n    <p>分区第一段。</p>\n    <p>分区第二段。</p>\n  </section>\n  <p>后面一段。</p>\n`));
  removeUnit(s.unit("第一个要删的"));
  removeUnit(s.unit("第二个要删的"));
  sent = foreign(s, () => { s.file = s.file.replace("第一个要删的。", "第一个要删的（AI）。").replace("第二个要删的。", "第二个要删的（AI）。"); });
  assert.deepEqual(status(sent), ["changed", "changed"]);
  const [keepTheirs, deleteAnyway] = sent.conflicts.map((entry) => entry.key);
  unwrapSection(s.section("分区标题"));
  sent = foreign(s);
  s.commits.resolve(keepTheirs, "discard");
  s.commits.resolve(deleteAnyway, "force");
  sent = foreign(s);
  assert.ok(allApplied(sent.receipt.units) && !s.file.includes("第二个要删的") && s.file.includes("第一个要删的（AI）。"), `${JSON.stringify(sent.receipt.units)} ${s.file}`);

  // The card's block gone since (the Agent deleted it), another the page opened on saying what the card
  // showed: 仍然删除 and 仍然转换类型 take no other block for it, and ask.
  const TWIN = (verb) => page(`  <p>前面一段。</p>\n  <p>第二个要${verb}的。</p>\n  <section class="doc-section" id="sec">\n    <h2>分区标题</h2>\n    <p>分区第一段。</p>\n  </section>\n  <p>后面一段。</p>\n  <p>第二个要${verb}的（AI）。</p>\n`);
  for (const verb of ["删", "转"]) {
    s = open(TWIN(verb));
    if (verb === "删") removeUnit(s.unit(`第二个要${verb}的。`));
    else {
      convertBlock(s.text(`第二个要${verb}的。`), "heading3");
      s.document.querySelector("main h3").textContent = "读者改了。";
    }
    sent = foreign(s, () => { s.file = s.file.replace(`<p>第二个要${verb}的。</p>`, `<p>第二个要${verb}的（AI）。</p>`); });
    assert.deepEqual(status(sent), ["changed"]);
    const twinCard = sent.conflicts[0].key;
    unwrapSection(s.section("分区标题"));
    foreign(s);
    s.file = s.file.replace(new RegExp(`<p(?: data-block-id="[a-z0-9]{8}")?>第二个要${verb}的（AI）。</p>\\s*`), "");
    s.commits.resolve(twinCard, "force");
    sent = foreign(s);
    assert.deepEqual(status(sent), [verb === "删" ? "ambiguous" : "missing"], `${verb}: ${JSON.stringify(sent.receipt.units)}`);
    assert.ok(s.file.includes(`<p>第二个要${verb}的（AI）。</p>`) && !s.file.includes("读者改了"), `${verb}: the other block stays as it is: ${s.file}`);
  }

  // A block whose conversion is held or given up, the block beside it moved down and back (by hand or by undo):
  // each move goes once, where the page has it, and nothing goes again.
  const FOUR = page(`  <p data-block-id="pa">前面一段。</p>\n  <p data-block-id="pb">要处理的一段。</p>\n  <p data-block-id="pc">另一段要转的。</p>\n  <p data-block-id="pd">后面一段。</p>\n`);
  const BOTH = (text) => text.replace("要处理的一段。", "要处理的一段（AI）。").replace("另一段要转的。", "另一段要转的（AI）。");
  for (const given of [false, true]) {
    s = open(FOUR);
    convertBlock(s.text("另一段要转的"), "heading2");
    if (given) convertBlock(s.text("要处理的一段"), "heading2");
    sent = foreign(s, () => { s.file = BOTH(s.file); });
    if (given) s.commits.resolve(sent.conflicts.find((entry) => entry.theirs.includes("要处理的一段")).key, "discard");
    const block = s.document.querySelector(given ? "main h2" : "main p:nth-of-type(2)");
    s.unit("后面一段").after(block);
    assert.ok(allApplied(foreign(s).receipt.units) && inOrder(s.file, "前面一段", "另一段要转的", "后面一段", "要处理的一段"), s.file);
    s.unit("前面一段").after(block);
    sent = foreign(s);
    assert.deepEqual(s.last.request.units.map((op) => [op.unit.id, op.move?.after?.id]), [["pb", "pa"]], `${given ? "given up" : "held"}: the block moved back, nothing else`);
    assert.ok(allApplied(sent.receipt.units) && inOrder(s.file, "前面一段", "要处理的一段", "另一段要转的", "后面一段"), s.file);
    assert.equal(s.commits.build(), null, "and nothing goes again");
  }

  // 用文件里的 on a move (its section deleted) gives up that move: moved elsewhere since, the block goes there; and
  // another block moved meanwhile, answering the other card moves nothing the reader did not move.
  s = open(addBlockIds(page(`  <p>前面一段。</p>\n  <p>要处理的一段。</p>\n  <section class="doc-section" aria-labelledby="d">\n    <h2 id="d">分区标题</h2>\n    <p>分区第一段。</p>\n  </section>\n  <p>后面一段。</p>\n  <p>最后一段。</p>\n`)).text);
  s.section("分区标题").append(s.unit("要处理的一段"));
  convertBlock(s.text("最后一段"), "heading2");
  foreign(s, () => { s.file = s.file.replace(/\n {2}<section[\s\S]*?<\/section>/, "").replace("最后一段。", "最后一段（AI）。"); });
  foreign(s);
  const latest = Object.fromEntries([...s.commits.issues.values()].map((entry) => [entry.reason, entry.key]));
  assert.deepEqual(Object.keys(latest).sort(), ["changed", "position"]);
  s.commits.resolve(latest.position, "discard");
  s.unit("后面一段").after(s.unit("前面一段"));
  assert.ok(allApplied(foreign(s).receipt.units) && inOrder(s.file, "要处理的一段", "后面一段", "前面一段", "最后一段（AI）"), s.file);
  s.commits.resolve(latest.changed, "discard");
  assert.equal(s.commits.build(), null, "the Agent's paragraph is not moved");
  s = open(addBlockIds(page(`  <p>甲段。</p>\n  <section class="doc-section" aria-labelledby="d">\n    <h2 id="d">一章</h2>\n    <p>章内段。</p>\n  </section>\n  <p>乙段。</p>\n  <p>末段。</p>\n`)).text);
  s.section("一章").append(s.unit("甲段"));
  foreign(s, () => { s.file = s.file.replace(/\n {2}<section[\s\S]*?<\/section>/, ""); });
  sent = foreign(s);
  assert.deepEqual(status(sent), ["position"]);
  s.commits.resolve(sent.conflicts[0].key, "discard");
  s.unit("乙段").after(s.unit("甲段"));
  sent = foreign(s);
  assert.ok(sent && allApplied(sent.receipt.units) && inOrder(s.file, "乙段", "甲段", "末段"), `moved elsewhere, it goes where the page has it, not to the end its card tried: ${s.file}`);

  // A table's column taken out given up (保留 Agent 的), then a row taken out: that is another change, and it asks.
  s = open(addBlockIds(page(`  <div class="doc-table-wrap"><table class="doc-table"><tbody><tr><td>甲格</td><td>乙格</td><td>丙格</td></tr><tr><td>丁格</td><td>戊格</td><td>己格</td></tr></tbody></table></div>\n  <p>页尾</p>\n`)).text);
  dropColumn(s);
  sent = foreign(s, () => { s.file = s.file.replace("甲格", "甲格（AI）"); });
  s.commits.resolve(sent.conflicts[0].key, "discard");
  assert.equal(s.commits.build(), null, "the column given up");
  s.document.querySelectorAll("tr")[1].remove();
  assert.equal(s.commits.counts().waiting, 1, "the row taken out waits to be saved");
  sent = foreign(s);
  assert.deepEqual(status(sent), ["changed"], "and asks");

  // A section dissolved around a paragraph whose deletion or conversion waits: the paragraph goes with the blocks
  // around it, in its place among them, and no section is left around it; its card stands, and 仍然… does it.
  for (const deleted of [true, false]) {
    s = open(page(`  <p>前面一段。</p>\n  <section class="doc-section" id="sec">\n    <h2>分区标题</h2>\n    <p>分区第一段。</p>\n    <p>分区第二段。</p>\n    <p>分区第三段。</p>\n  </section>\n  <p>后面一段。</p>\n`));
    if (deleted) removeUnit(s.unit("分区第二段"));
    else convertBlock(s.text("分区第二段"), "heading3");
    sent = foreign(s, () => { s.file = s.file.replace("分区第二段。", "分区第二段（AI）。"); });
    const dissolvedCard = sent.conflicts[0].key;
    unwrapSection(s.section("分区标题"));
    sent = foreign(s);
    assert.ok(allApplied(sent.receipt.units) && !s.file.includes("<section") && inOrder(s.file, "分区标题", "分区第一段", "分区第二段（AI）", "分区第三段", "后面一段"), `${JSON.stringify(sent.receipt.units)} ${s.file}`);
    assert.deepEqual([...s.commits.issues.keys()], [dissolvedCard]);
    s.commits.resolve(dissolvedCard, "force");
    assert.ok(allApplied(foreign(s).receipt.units) && (deleted ? !s.file.includes("分区第二段") : /<h3[^>]*>分区第二段。<\/h3>/.test(s.file)), s.file);
  }

  // A section deleted whole while the Agent wrote in it: its card says what the file holds in it.
  s = open(page(`  <p>前面一段。</p>\n  <section class="doc-section" id="sec">\n    <h2>分区标题</h2>\n    <p>分区第一段。</p>\n  </section>\n  <p>后面一段。</p>\n`));
  removeUnit(s.section("分区标题"));
  sent = foreign(s, () => { s.file = s.file.replace("分区第一段。", "分区第一段（AI）。"); });
  assert.deepEqual(status(sent), ["changed"]);
  assert.equal(sent.conflicts[0].theirs, "分区标题\n分区第一段（AI）。");
  // While its card stands nothing of it goes, the blocks it took off the page waiting with its deletion: their
  // texts sent emptied would take out of the file what the Agent left of it, and change the section under the
  // card, so that 仍然删除 asked again (one holding an instance whose card was answered first). Given up, the
  // file keeps it whole; made anyway, it goes at once.
  for (const answer of ["discard", "force"]) {
    s = open(page(`  <p>前面一段。</p>\n  <section class="doc-section" id="sec">\n    <h2>分区标题</h2>\n    <p>分区第一段。</p>\n    <p>分区第二段。</p>\n  </section>\n  <p>后面一段。</p>\n`));
    removeUnit(s.section("分区标题"));
    const card = foreign(s, () => { s.file = s.file.replace("分区第一段。", "分区第一段（AI）。"); }).conflicts[0].key;
    const held = s.file;
    assert.equal(foreign(s), null, "nothing of it goes while its card stands");
    assert.equal(s.file, held);
    s.commits.resolve(card, answer);
    sent = foreign(s);
    if (answer === "discard") assert.ok(sent === null && ["分区标题", "分区第一段（AI）。", "分区第二段。"].every((words) => s.file.includes(words)), `given up, the section stays whole: ${s.file}`);
    else assert.ok(allApplied(sent.receipt.units) && !s.file.includes("<section") && !s.file.includes("分区"), `made anyway, it goes with one word: ${JSON.stringify(sent.receipt.units)} ${s.file}`);
    assert.equal(foreign(s), null, "and nothing waits");
  }
}

// A detail card made from selected text (as the format bar's card button makes one): the commit
// writes the card and its entry. A card is no unit (the file knows it by its id), so the answer
// says what the file holds of it apart (`keyed`: its content), and from then on it is a card of the
// file: what is typed into its blocks goes with later commits, it is not made again, and nothing is
// left waiting. Sent again, the commit writes nothing twice.
{
  const s = studio(SOURCE);
  const main = s.document.querySelector("main");
  const id = freshDialogId(s.document);
  const card = newDialog(s.document, id, "丙段落");
  type(s.text("丙段落"), `<a class="doc-dialog-trigger" href="#${id}">丙段落</a>，在第二章。`);
  main.append(card);
  const first = s.commit();
  assert.deepEqual(first.conflicts, []);
  assert.ok(s.file.includes(`<a class="doc-dialog-trigger" href="#${id}">丙段落</a>，在第二章。`), "the entry is written");
  assert.ok(s.file.includes(`<dialog class="doc-dialog" id="${id}">`), "and the card");
  assert.ok(first.receipt.keyed?.[id], "the answer says what the file holds of the card");
  assert.ok(/<div class="doc-dialog-content">\s*<h3 data-block-id="[a-z0-9]{8}">丙段落<\/h3>\s*<p data-block-id="[a-z0-9]{8}"><\/p>\s*<\/div>/.test(s.file), `a heading and an empty paragraph, blocks as any: ${s.file}`);
  const sent = s.last;
  assert.equal(s.commits.build(), null, "a written card is not made again: nothing waits");

  const [heading, paragraph] = dialogContent(card).querySelectorAll("[contenteditable]");
  type(paragraph, "卡片里的内容");
  s.commit();
  assert.ok(/<p data-block-id="[a-z0-9]{8}">卡片里的内容<\/p>\s*<\/div>/.test(s.file), "what is typed into it goes into its content");
  assert.equal(s.commits.build(), null, "and nothing waits");

  type(heading, "丙段落的详情");
  s.commit();
  assert.ok(/<h3 data-block-id="[a-z0-9]{8}">丙段落的详情<\/h3>/.test(s.file), "its heading is edited as any block");
  type(paragraph, "卡片里的内容，改过");
  s.commit();
  assert.ok(s.file.includes("卡片里的内容，改过"), "so is its content");
  assert.equal(s.commits.build(), null, "nothing waits");
  assert.equal((s.file.match(/<dialog class="doc-dialog"/g) ?? []).length, 1, "one card");

  // The first commit sent again (its answer lost): the card is there already, nothing is made twice.
  const again = commitEdits({ current: s.file, ...sent.request, opening: SOURCE, seal });
  assert.equal((again.text.match(/<dialog class="doc-dialog"/g) ?? []).length, 1, "sent again, it writes no second card");
  assert.ok(again.keyed?.[id], "and says what the file holds of it");

  // Undone after it was saved: the entry goes; the card is no unit, so it stays in the file with
  // nothing opening it, as one whose entry the reader took out, and nothing of it is sent. Redone,
  // the page shows what the file has again.
  const entry = s.text("在第二章").innerHTML;
  card.remove();
  type(s.text("在第二章"), "丙段落，在第二章。");
  const undone = s.commit();
  assert.deepEqual(undone.conflicts, [], "undoing a saved card is no conflict");
  assert.ok(!s.file.includes(`href="#${id}"`) && s.file.includes(`id="${id}"`), "its entry goes, the card stays in the file");
  assert.equal(s.commits.build(), null, "nothing waits");
  main.append(card);
  type(s.text("在第二章"), entry);
  const redone = s.commit();
  assert.deepEqual(redone.conflicts, [], "nor is redoing it");
  assert.ok(s.file.includes(`<a class="doc-dialog-trigger" href="#${id}">丙段落</a>`) && s.file.includes("卡片里的内容，改过"), "the entry is back, the card as it was");
  assert.equal(s.commits.build(), null, "nothing waits");
}

// Against a file the Agent changed since the page opened: each thing the commit names is found in
// the file as it is now (by its id, or by what it was when the page opened), the changes elsewhere
// stay, and what cannot be found or was changed by the Agent is a conflict of its own, never a
// guess. (These are the cases applyEdits once re-located blocks for, before a commit found them.)
const AGENT = page(`  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">第一章</h2>
    <p>甲段落，我们先理解材料，再选择组件。</p>
    <p>含有 <span class="unknown">未知元素</span> 的段落。</p>
    <ul>
      <li>项目一</li>
    </ul>
    <figure class="doc-figure" data-surface="bounded"><h3>卡片标题</h3><p class="doc-figure-caption">卡片说明</p></figure>
    <p>乙段落。</p>
  </section>

  <section class="doc-section" aria-labelledby="b">
    <h2 id="b">第二章</h2>
    <p>丙段落。</p>
    <p>丁段落。</p>
  </section>
`);
// The innermost unit whose text has these words (a paragraph with an inline element is no text block of its own).
const unitWith = (s, words) => [...s.document.querySelectorAll("[data-ge-unit]")].filter((node) => node.textContent.includes(words)).sort((a, b) => a.textContent.length - b.textContent.length)[0];
const bare = (text) => text.replace(/ data-block-id="[a-z0-9]{8}"/g, "");
const statuses = (receipt) => receipt.units.map((entry) => [entry.status, entry.reason]);

// Deleting while the Agent edits: changes elsewhere stay; a block both changed is a conflict, and
// deleting it anyway removes the file's version; a block the Agent dropped too is done already.
{
  const s = studio(AGENT);
  s.file = s.file.replace("甲段落，我们先理解", "AI 改过：甲段落，我们先理解");
  removeUnit(unitWith(s, "含有"));
  s.commit();
  assert.ok(s.file.includes("AI 改过") && !s.file.includes("未知元素"));

  const t = studio(AGENT);
  t.file = t.file.replace("含有 <span", "AI 改的，含有 <span");
  removeUnit(unitWith(t, "含有"));
  const refused = t.commit();
  assert.deepEqual(statuses(refused.receipt), [["conflict", "changed"]]);
  assert.ok(t.file.includes("未知元素"), "nothing is deleted without the reader");
  t.commits.resolve(`u${refused.conflicts[0].unit}`, "force");
  t.commit();
  assert.ok(!t.file.includes("未知元素") && t.file.includes("甲段落"), "deleted anyway");

  const u = studio(AGENT);
  const gone = u.file.replace(/ {4}<p>含有.*\n/, "");
  u.file = gone;
  removeUnit(unitWith(u, "含有"));
  assert.deepEqual(statuses(u.commit().receipt), [["applied", undefined]], "the Agent dropped it too: done");
  assert.equal(u.file.replace(/ data-block-id="[a-z0-9]{8}"/g, ""), gone, "nothing else changed");
}

// A list the reader emptied while the Agent added an item to it (or changed its item): what the
// Agent wrote is never lost.
{
  const s = studio(AGENT);
  s.file = s.file.replace("      <li>项目一</li>\n    </ul>", "      <li>项目一</li>\n      <li>AI 加的</li>\n    </ul>");
  removeUnit(s.unit("项目一"));
  s.commit();
  assert.ok(s.file.includes("<li>AI 加的</li>"), "the Agent's item stays");

  const t = studio(AGENT);
  t.file = t.file.replace("<li>项目一</li>", "<li>AI 改的项目</li>");
  removeUnit(t.unit("项目一"));
  t.commit();
  assert.ok(t.file.includes("<li>AI 改的项目</li>"), "an item the Agent changed stays");

  // The reader's own item goes, though the list stays for the Agent's: the page and the file agree.
  const u = studio(AGENT);
  u.file = u.file.replace("      <li>项目一</li>\n    </ul>", "      <li>项目一</li>\n      <li>AI 加的</li>\n    </ul>");
  removeUnit(u.unit("项目一"));
  const answer = u.commit();
  assert.ok(u.file.includes("<li>AI 加的</li>") && !u.file.includes("项目一"), `the reader's item is deleted, the Agent's stays: ${u.file.match(/<ul[\s\S]*?<\/ul>/)?.[0]} ${JSON.stringify(answer.receipt.units)}`);
  assert.equal(answer.conflicts.length, 0, "nothing for the reader to decide");
  assert.equal(u.commits.build(), null, "nothing is left to commit: the page and the file say the same");
}

// A Sheet tab goes with its panel, so its hash is the panel's too: a panel the Agent changed (a
// paragraph reworded, a block added) makes deleting the tab a conflict, never a silent deletion of
// what the Agent wrote. What the reader changed in a panel is in the hash the page keeps (its
// commit names the tab: `touch`), so deleting the tab after that is no conflict.
{
  const SHEETS = page(`  <section class="doc-sheet-shell" data-doc-sheets="demo" aria-label="选项卡">
    <div class="doc-sheet-tabs" aria-label="选项卡"><button class="doc-sheet-tab" type="button" data-sheet-tab="a">甲页</button><button class="doc-sheet-tab" type="button" data-sheet-tab="b">乙页</button></div>
    <div data-doc-sheet="a">
      <p>甲页的第一段。</p>
      <p>甲页的第二段。</p>
    </div>
    <div data-doc-sheet="b">
      <p>乙页的段落。</p>
    </div>
  </section>
`);
  const tab = (s, name) => [...s.document.querySelectorAll("button.doc-sheet-tab")].find((node) => node.textContent.includes(name));

  const reworded = studio(SHEETS);
  reworded.file = reworded.file.replace("甲页的第二段。", "甲页的第二段（AI 改）。");
  removeUnit(tab(reworded, "甲页"));
  const refused = reworded.commit();
  assert.deepEqual(statuses(refused.receipt), [["conflict", "changed"]], "the panel the Agent changed: the reader decides");
  assert.ok(reworded.file.includes("甲页的第二段（AI 改）。") && reworded.file.includes('data-sheet-tab="a"'), "nothing was deleted");
  reworded.commits.resolve(`u${refused.conflicts[0].unit}`, "force");
  reworded.commit();
  assert.ok(!reworded.file.includes("甲页") && reworded.file.includes("乙页的段落。"), "deleted anyway, on the reader's say");

  const added = studio(SHEETS);
  added.file = added.file.replace("      <p>乙页的段落。</p>", "      <p>乙页的段落。</p>\n      <p>AI 加的段落。</p>");
  removeUnit(tab(added, "乙页"));
  assert.deepEqual(statuses(added.commit().receipt), [["conflict", "changed"]], "a block the Agent added to the panel counts too");
  assert.ok(added.file.includes("AI 加的段落。"));

  // The reader's own edits in the panel, committed before the tab goes: no conflict.
  const mine = studio(SHEETS);
  type(mine.text("甲页的第一段"), "甲页的第一段（改）。");
  mine.commit();
  const { scan } = await import("../../src/editor/source/blocks.mjs");
  const { unitHash } = await import("../../src/editor/source/units.mjs");
  const fileTab = scan(mine.file).units.find((unit) => unit.kind === "tab");
  assert.equal(mine.map.units[1].hash, unitHash(mine.file, fileTab), "the page has the tab as the file has it, its panel changed");
  assert.equal(mine.commits.build(), null, "and nothing is left to commit (the tab is still in its row)");
  removeUnit(mine.unit("甲页的第二段"));
  mine.commit();
  removeUnit(tab(mine, "甲页"));
  const gone = mine.commit();
  assert.deepEqual(statuses(gone.receipt), [["applied", undefined]], "what the reader changed in the panel is in the page's hash of the tab");
  assert.ok(!mine.file.includes("甲页") && mine.file.includes("乙页的段落。"));

  // What is in the panel goes with the tab: no commit after it says those blocks were emptied, and
  // the tab comes back from its source, once, with them, a section in the panel and its blocks too.
  // A tab of another area under the same key is another tab.
  const WITH = addBlockIds(page(`  <section class="doc-sheet-shell" data-doc-sheets="one" aria-label="选项卡">
    <div class="doc-sheet-tabs" aria-label="选项卡"><button class="doc-sheet-tab" type="button" data-sheet-tab="a">甲页</button><button class="doc-sheet-tab" type="button" data-sheet-tab="b">乙页</button></div>
    <div data-doc-sheet="a">
      <p>甲页的第一段。</p>
      <section class="doc-section" id="in-panel">
        <p>甲页分区的段落。</p>
      </section>
    </div>
    <div data-doc-sheet="b">
      <p>乙页的段落。</p>
    </div>
  </section>

  <section class="doc-sheet-shell" data-doc-sheets="two" aria-label="选项卡">
    <div class="doc-sheet-tabs" aria-label="选项卡"><button class="doc-sheet-tab" type="button" data-sheet-tab="a">丙页</button><button class="doc-sheet-tab" type="button" data-sheet-tab="b">丁页</button></div>
    <div data-doc-sheet="a">
      <p>丙页的段落。</p>
    </div>
    <div data-doc-sheet="b">
      <p>丁页的段落。</p>
    </div>
  </section>
`)).text;
  const taken = studio(WITH);
  const area = taken.document.querySelector("[data-doc-sheets='one']");
  const putBack = recordLists(area.querySelector(".doc-sheet-tabs"), area);
  removeUnit(tab(taken, "甲页"));
  assert.ok(allApplied(taken.commit().receipt.units));
  assert.equal(taken.commits.build(), null, "nothing of the panel is left to commit");
  assert.ok(taken.file.includes("丙页的段落。"));
  putBack();
  assert.ok(allApplied(taken.commit().receipt.units));
  assert.equal(taken.commits.build(), null, "nor made again");
  assert.equal(taken.file, WITH, "byte for byte, once");
  type(taken.text("甲页分区的段落"), "甲页分区的段落（回来后改）。");
  type(taken.text("丙页的段落"), "丙页的段落（改）。");
  taken.commit();
  assert.ok(taken.file.includes("甲页分区的段落（回来后改）。") && taken.file.includes("丙页的段落（改）。"));

  // A block moved into a unit, the unit deleted, both undone in one commit: the unit comes back with
  // the block, the file having it nowhere else, and the block leaves it with the next commit.
  const holders = [
    ["a tab", `\n${WITH.slice(WITH.indexOf("  <section"), WITH.indexOf("</main>"))}\n  <p>页末</p>\n`, (s) => s.document.querySelector('[data-doc-sheets="one"] [data-doc-sheet="a"]'), (s) => tab(s, "甲页"), (s) => {
      const area = s.document.querySelector('[data-doc-sheets="one"]');
      return recordLists(area.querySelector(".doc-sheet-tabs"), area);
    }],
    ["a section", `\n  <section class="doc-section" id="holder">
    <p>分区一段</p>
  </section>

  <p>页末</p>
`, (s) => s.document.querySelector("#holder"), (s) => s.document.querySelector("#holder"), (s) => recordLists(s.document.querySelector("main"))],
  ];
  for (const [label, written, boxOf, unitOf, lists] of holders) {
    const opened = addBlockIds(page(written)).text;
    const s = studio(opened);
    const box = boxOf(s);
    const out = recordLists(s.document.querySelector("main"), box);
    box.append(s.unit("页末"));
    s.commit();
    const back = lists(s);
    removeUnit(unitOf(s));
    s.commit();
    back();
    out();
    assert.ok(allApplied(s.commit().receipt.units), `${label}: what stood in it waits for it`);
    assert.ok(allApplied(s.commit().receipt.units), `${label}: and goes then`);
    assert.equal(s.commits.issues.size, 0, label);
    assert.equal(s.commits.build(), null, label);
    assert.equal(s.file, opened, `${label}: byte for byte`);
  }

  // A block of the panel dragged out in the commit that deletes the tab stays out of what undo puts back.
  const out = studio(WITH);
  const areaOut = out.document.querySelector("[data-doc-sheets='one']");
  const back = recordLists(areaOut.querySelector(".doc-sheet-tabs"), areaOut);
  placeBefore(out.document.querySelector("main"), [out.unit("甲页的第一段")], areaOut);
  removeUnit(tab(out, "甲页"));
  assert.ok(allApplied(out.commit().receipt.units));
  back();
  out.commit();
  out.commit();
  assert.equal(out.file.split("甲页的第一段。").length, 2, out.file);
}

// The same words on both sides are no conflict; twin text is told apart by its order (the reader
// editing identical blocks one after the other).
{
  const s = studio(AGENT);
  s.file = s.file.replace("我们先理解材料", "我们先读懂材料");
  type(s.text("甲段落"), "甲段落，我们先读懂材料，再选择组件。");
  assert.deepEqual(s.commit().receipt.texts.map((entry) => entry.status), ["applied"], "both sides wrote the same text");
  assert.equal(s.file.split("我们先读懂材料").length, 2);

  const twins = page(`  <section class="doc-section">\n    <ul>\n      <li>是</li>\n    </ul>\n    <ul>\n      <li>是</li>\n    </ul>\n  </section>\n`);
  const first = studio(twins);
  first.file = first.file.replace("<li>是</li>\n    </ul>\n  </section>", "<li>AI 改的</li>\n    </ul>\n  </section>");
  type([...first.document.querySelectorAll("li")][0], "我改的");
  first.commit();
  assert.ok(bare(first.file).includes("<li>我改的</li>\n    </ul>\n    <ul>\n      <li>AI 改的</li>"), "the first twin is the reader's");

  // The reader editing both of two identical blocks, one commit each, in either order.
  const paragraphs = (...lines) => page(`  <section class="doc-section">\n${lines.map((line) => `    <p>${line}</p>\n`).join("")}  </section>\n`);
  const same = [
    ["items", twins, "li"],
    ["paragraphs", paragraphs("是", "是"), "p"],
    ["paragraphs after another", paragraphs("前面", "是", "是"), "p"],
  ];
  for (const [what, source, tag] of same) {
    for (const order of [[1, 0], [0, 1]]) {
      const t = studio(source);
      const twin = (index) => [...t.document.querySelectorAll(tag)].filter((node) => /^(是|改[01])$/.test(node.textContent))[index];
      for (const index of order) {
        type(twin(index), `改${index}`);
        assert.deepEqual(t.commit().receipt.texts.map((entry) => entry.status), ["applied"], `${what}, edited ${order.join(" then ")}: the second commit is no conflict`);
      }
      assert.ok(t.file.includes("改0") && t.file.includes("改1") && !t.file.includes(`<${tag}>是</${tag}>`), `${what}, ${order.join(" then ")}: both edits written`);
    }
  }
}

// Moving blocks while the Agent edits: its changes elsewhere stay, a moved block goes with the
// Agent's version of it, and one the Agent deleted is a conflict (it cannot move).
{
  const s = studio(AGENT);
  s.file = s.file.replace("丙段落。", "AI 改的丙段落。").replace("乙段落。", "AI 改的乙段落。");
  const main = s.document.querySelector("main");
  placeBefore(main, [s.section("第二章")], s.section("第一章"));
  s.commit();
  assert.ok(s.file.indexOf("第二章") < s.file.indexOf("第一章") && s.file.includes("AI 改的丙段落。") && s.file.includes("AI 改的乙段落。"), "moved, with the Agent's words");
  assert.equal(s.file.split("AI 改的丙段落。").length, 2);

  const t = studio(AGENT);
  t.file = t.file.replace("甲段落，我们先理解", "AI 改的甲段落，我们先理解");
  placeBefore(t.unit("丁段落").parentElement, [t.unit("甲段落")], t.unit("丁段落"));
  t.commit();
  assert.ok(t.file.indexOf("AI 改的甲段落") > t.file.indexOf("丙段落") && t.file.split("AI 改的甲段落").length === 2, "the paragraph the Agent changed moves with its change");

  const u = studio(AGENT);
  u.file = u.file.replace(/\n\n  <section class="doc-section" aria-labelledby="b">[\s\S]*?<\/section>/, "");
  placeBefore(u.section("第二章").parentElement, [u.section("第二章")], u.section("第一章"));
  const refused = u.commit();
  assert.deepEqual(statuses(refused.receipt), [["conflict", "position"]], "the place the page moved it to is gone with it");
  assert.ok(!u.file.includes("第二章"));
}

// Sizes and class switches do not depend on what is inside the block: the Agent's change in it stays.
{
  const s = studio(AGENT);
  s.file = s.file.replace("<h3>卡片标题</h3>", "<h3>AI 改的标题</h3>");
  s.unit("卡片标题").style.setProperty("--doc-span", "0.4");
  s.commit();
  assert.ok(s.file.includes('data-surface="bounded"') && /style="--doc-span: 0\.4"/.test(s.file) && s.file.includes("<h3>AI 改的标题</h3>"), s.file);
}

// Turning a paragraph into another type while the Agent changed it: a conflict with the file's
// words, kept anyway on the reader's say; the Agent's changes elsewhere merge.
{
  const s = studio(AGENT);
  s.file = s.file.replace("我们先理解材料", "我们先读懂材料");
  const host = s.text("甲段落");
  convertBlock(host, "heading2").focus.textContent = "甲段落，我们先理解材料，再选择组件。";
  const refused = s.commit();
  assert.deepEqual(statuses(refused.receipt), [["conflict", "changed"]]);
  assert.ok(bare(s.file).includes("<p>甲段落，我们先读懂材料，再选择组件。</p>"), "the Agent's paragraph stays");
  s.commits.resolve(`u${refused.conflicts[0].unit}`, "force");
  s.commit();
  assert.ok(s.file.includes("<h2") && s.file.includes("我们先理解材料，再选择组件。</h2>") && !s.file.includes("读懂"), "turned anyway");

  const t = studio(AGENT);
  t.file = t.file.replace("<p>丙段落。</p>", "<p>丙段落（AI）。</p>");
  convertBlock(t.text("乙段落"), "heading3");
  t.commit();
  assert.ok(t.file.includes("<h3") && t.file.includes("乙段落。</h3>") && t.file.includes("丙段落（AI）。"));
}

// The endpoints. A request needs the exact Host and Origin, the token, a JSON body and a report
// slug; rejected, it writes nothing. A commit is applied to the file, no temp file stays behind,
// the title goes into <title> and report.json (or the page is told why not), and an Agent writing
// the file right before it is replaced gets the commit applied again to its version (a few times
// at most). The file as it was before each commit is kept (the recent versions). The revert check
// names the texts someone else's write put back.
{
  const { createEditService } = await import("../../src/editor/service.mjs");
  const { writeAtomic } = await import("../../src/shared/files.mjs");
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const http = await import("node:http");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-commit-"));
  const state = path.join(root, ".state");
  const file = path.join(root, "demo", "report.html");
  const json = path.join(root, "demo", "report.json");
  await fs.mkdir(path.join(root, "demo"));
  await fs.writeFile(file, SOURCE);
  await fs.writeFile(json, `${JSON.stringify({ title: "报告", description: "d", type: "t" })}\n`);
  // The Agent's write lands `agentWrites` times, each right before the service replaces the file;
  // report.json may refuse to be written.
  let agentWrites = 0;
  let agentText = null;
  let jsonDenied = false;
  const write = async (target, text, options) => {
    if (target === file && agentWrites > 0) {
      agentWrites--;
      await fs.writeFile(file, agentText(await fs.readFile(file, "utf8")));
    }
    if (target === json && jsonDenied) throw Object.assign(new Error("denied"), { code: "EACCES" });
    return writeAtomic(target, text, options);
  };
  let service = createEditService({ reportsDirectory: root, stateDirectory: state, write });
  const mapOf = (source) => JSON.parse(service.preview("demo", source).snippet.match(/<script type="application\/json"[^>]*>([^<]*)<\/script>/)[1]);
  const map = mapOf(SOURCE);
  const server = http.createServer((request, response) => (request.url === "/__gallery/edit/reverted" ? service.reverted : service.commit)(request, response));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const host = `127.0.0.1:${server.address().port}`;
  const post = async (body, headers = {}, route = "commit") => {
    const response = await fetch(`http://${host}/__gallery/edit/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": service.token, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  };
  const block = (inner) => map.blocks.find((entry) => entry.inner === inner);
  const unitOf = (inner) => ({ key: block(inner).unit, open: block(inner).unit, hash: map.units[block(inner).unit].hash });
  const textEdit = (inner, html, key = "t") => ({ key, block: { unit: unitOf(inner), self: true, before: inner }, parts: [{ keep: true, html }] });
  try {
    const title = map.blocks.find((entry) => entry.kind === "title");
    const retitle = { slug: "demo", opening: map.version, texts: [{ key: "t", block: { title: true, before: title.inner }, parts: [{ keep: true, html: "改过的标题" }] }] };
    assert.equal((await post(retitle, { Origin: "http://evil.example" })).status, 403);
    assert.equal((await post(retitle, { "X-Gallery-Token": "wrong" })).status, 403);
    assert.equal((await post(JSON.stringify(retitle), { "Content-Type": "text/plain" })).status, 415);
    assert.equal((await post({ ...retitle, slug: "../x" })).status, 400);
    assert.equal((await post({ ...retitle, units: "x" })).status, 400);
    // A body past what a commit carries is read to its end and answered, so that the page hears why and
    // does not take the server for gone.
    const large = await post({ ...retitle, padding: "长".repeat(1024 * 1024) });
    assert.deepEqual([large.status, large.body.reason, large.body.message], [413, "body", "这次的修改太大，一次存不下"]);
    assert.equal(await fs.readFile(file, "utf8"), SOURCE, "rejected requests write nothing");

    const done = await post(retitle);
    assert.equal(done.status, 200);
    assert.deepEqual(done.body.texts, [{ key: "t", status: "applied" }]);
    assert.equal(done.body.outside.title, "改过的标题", "the title as the file has it now");
    assert.deepEqual(done.body.notes, ["标题已更新"], "the reader is told in their words: the title updated");
    let text = await fs.readFile(file, "utf8");
    assert.ok(text.includes('<h1 class="doc-title">改过的标题</h1>') && text.includes("<title>改过的标题</title>"));
    assert.equal(done.body.version, hashOf(text), "the version the page now shows");
    assert.equal(JSON.parse(await fs.readFile(json, "utf8")).title, "改过的标题");
    assert.deepEqual((await fs.readdir(path.dirname(file))).sort(), ["report.html", "report.json"], "no temp file is left behind");
    assert.deepEqual((await post({ ...retitle, texts: [] })).body.texts, [], "nothing to commit changes nothing");

    // report.html written, report.json not: the page is told.
    jsonDenied = true;
    const again = await post({ ...retitle, texts: [{ key: "t", block: { title: true, before: "改过的标题" }, parts: [{ keep: true, html: "再改的标题" }] }] });
    assert.deepEqual(again.body.notes, ["标题已更新", "搜索和侧栏里（没打开这份文档时）的文档名没能跟着改"], "and what did not follow it, in their words");
    jsonDenied = false;

    // The Agent writing right before the file is replaced: the commit goes onto its version.
    agentWrites = 1;
    agentText = (source) => source.replace("丙段落，在第二章。", "丙段落，在第二章（AI）。");
    const merged = await post({ slug: "demo", opening: map.version, texts: [textEdit("甲段落，写的是开头。", "甲段落（人）。")] });
    text = await fs.readFile(file, "utf8");
    assert.ok(merged.body.ok && text.includes("甲段落（人）。") && text.includes("丙段落，在第二章（AI）。"), "the Agent's write is kept");
    // ...one that keeps writing: after three tries nothing is written.
    agentWrites = 5;
    let count = 0;
    agentText = (source) => source.replace("</main>", `<!-- AI ${++count} -->\n</main>`);
    const busy = await post({ slug: "demo", opening: map.version, texts: [textEdit("乙段落，写的是中间。", "乙段落（人）。")] });
    text = await fs.readFile(file, "utf8");
    assert.ok(busy.status === 409 && busy.body.reason === "busy" && !text.includes("乙段落（人）") && text.includes("<!-- AI 3 -->"), "nothing of the commit, every Agent write");
    agentWrites = 0;

    // A commit with the id the page gave it, sent again (its answer lost): the answer it had, even
    // though someone wrote the file since, and nothing written again; after a restart too. With
    // other contents under the same id, it is refused.
    const once = { slug: "demo", opening: map.version, request: "requestone01", texts: [textEdit("乙段落，写的是中间。", "乙段落（一次）。")] };
    const first = await post(once);
    const committed = await fs.readFile(file, "utf8");
    await fs.writeFile(file, committed.replace("<!-- AI 3 -->", "<!-- AI 4 -->"));
    const second = await post(once);
    assert.ok(first.body.ok && second.body.again && second.body.version === first.body.version && JSON.stringify(second.body.texts) === JSON.stringify(first.body.texts), JSON.stringify(second.body));
    assert.equal(await fs.readFile(file, "utf8"), committed.replace("<!-- AI 3 -->", "<!-- AI 4 -->"), "nothing written again");
    const other = await post({ ...once, texts: [textEdit("乙段落，写的是中间。", "乙段落（另一次）。")] });
    assert.ok(other.status === 409 && other.body.reason === "request", JSON.stringify(other.body));
    await service.stored();
    const before = service;
    service = createEditService({ reportsDirectory: root, stateDirectory: state, write });
    assert.ok((await post(once)).body.again, "the answer outlives a restart");
    service = before;

    // The recent versions: the file as it was before each commit, and as each commit left it.
    await service.stored();
    // Each <time>-<version>.html, the time to the millisecond, with who made it beside it (.json: src/editor/history.mjs).
    const listed = await fs.readdir(path.join(state, "history", "demo"));
    const versions = listed.filter((name) => name.endsWith(".html"));
    assert.ok(versions.length >= 3 && versions.every((name) => /^\d{8}T\d{9}Z-[a-f0-9]{16}\.html$/.test(name) && listed.includes(name.replace(/\.html$/, ".json"))), JSON.stringify(listed));
    assert.ok(versions.some((name) => name.endsWith(`-${hashOf(SOURCE)}.html`)), "the report as it opened among them");
    assert.ok(versions.some((name) => name.endsWith(`-${hashOf(committed)}.html`)), "and as the last commit left it");

    // What is kept is the newest: the recent versions 30 and before them the last of each hour (the
    // oldest by the time their names begin with: those of an older Gallery here, named to the second
    // and all in one hour), the answers to commits 200 and the versions served to pages 50 (the oldest
    // by when each was last used), whatever is older deleted after a write.
    const history = path.join(state, "history", "demo");
    const receipts = path.join(state, "receipts", "demo");
    const snapshots = path.join(state, "snapshots");
    await fs.mkdir(receipts, { recursive: true });
    await fs.mkdir(snapshots, { recursive: true });
    const aged = async (directory, name, index) => {
      const old = path.join(directory, name);
      await fs.writeFile(old, "{}");
      await fs.utimes(old, new Date(2020, 0, 1, 0, 0, index), new Date(2020, 0, 1, 0, 0, index));
    };
    for (let index = 0; index < 40; index++) await aged(history, `20200101T0000${String(index).padStart(2, "0")}Z-${String(index).padStart(16, "0")}.html`, index);
    for (let index = 0; index < 205; index++) await aged(receipts, `old${String(index).padStart(6, "0")}.json`, index);
    for (let index = 0; index < 55; index++) await aged(snapshots, `${String(index).padStart(16, "0")}.html`, index);
    const nowTitle = (await fs.readFile(file, "utf8")).match(/<h1 class="doc-title">([^<]*)<\/h1>/)[1];
    const trimmed = await post({ slug: "demo", opening: map.version, request: "trimcommit01", texts: [{ key: "t", block: { title: true, before: nowTitle }, parts: [{ keep: true, html: "裁剪后的标题" }] }] });
    assert.ok(trimmed.body.ok, JSON.stringify(trimmed.body));
    service.preview("demo", "<main><p>只读一次的版本</p></main>");
    await service.stored();
    const kept = (await fs.readdir(history)).filter((name) => name.endsWith(".html"));
    assert.equal(kept.length, 31, "30 versions, and the last of the hour before them");
    const latest = hashOf(await fs.readFile(file, "utf8"));
    assert.ok(kept.some((name) => name.endsWith(`-${latest}.html`)) && !kept.includes("20200101T000000Z-0000000000000000.html") && kept.some((name) => name.startsWith("20200101T000039Z")), "the oldest went");
    const answers = await fs.readdir(receipts);
    assert.equal(answers.length, 200, "200 answers");
    assert.ok(answers.includes("trimcommit01.json") && !answers.includes("old000000.json") && answers.includes("old000204.json"), "the oldest went");
    const served = await fs.readdir(snapshots);
    assert.equal(served.length, 50, "50 versions served");
    assert.ok(served.includes(`${hashOf("<main><p>只读一次的版本</p></main>")}.html`) && !served.includes("0000000000000000.html"), "the oldest went");

    // The revert check: the Agent writes the whole file from what it read before the reader's commit.
    const reverted = await post({ slug: "demo", opening: map.version, texts: [{ key: "b1", block: { unit: unitOf("甲段落，写的是开头。"), self: true, before: "甲段落（人）。" }, original: "甲段落，写的是开头。" }] }, {}, "reverted");
    assert.deepEqual(reverted.body.reverted, [], "still the reader's text");
    await fs.writeFile(file, SOURCE);
    const back = await post({ slug: "demo", opening: map.version, texts: [{ key: "b1", block: { unit: unitOf("甲段落，写的是开头。"), self: true, before: "甲段落（人）。" }, original: "甲段落，写的是开头。" }] }, {}, "reverted");
    assert.deepEqual(back.body.reverted, [{ key: "b1", theirs: "甲段落，写的是开头。" }], "put back as it was");
    assert.deepEqual([back.body.units, back.body.parts], [[], []], "and of the blocks and the parts of instances asked of none (tests/unit/write-back.mjs)");
    assert.equal((await post({ slug: "demo", opening: map.version, instances: "rows-a" }, {}, "reverted")).status, 400, "instances that are no list");

    // A restart: the token and the version the page opened on outlive it (with a state directory).
    // The paragraph the Agent changed since is found by where it was then, and both edits merge.
    await fs.writeFile(file, SOURCE.replace("乙段落，写的是中间。", "乙段落，写的是中间部分。"));
    const memoryOnly = createEditService({ reportsDirectory: root, write });
    const restarted = createEditService({ reportsDirectory: root, stateDirectory: state, write });
    assert.equal(restarted.token, service.token, "the token outlives a restart");
    assert.equal(memoryOnly.token, service.token, "all editing runtimes share the data-directory token");
    const later = { slug: "demo", opening: map.version, texts: [textEdit("乙段落，写的是中间。", "乙段落（人），写的是中间。")] };
    service = memoryOnly;
    assert.deepEqual((await post(later)).body.texts.map((entry) => entry.reason), ["missing"], "without the version it opened on, the changed paragraph is not found");
    service = restarted;
    assert.deepEqual((await post(later)).body.texts.map((entry) => entry.status), ["merged"]);
    assert.ok((await fs.readFile(file, "utf8")).includes("乙段落（人），写的是中间部分。"));
  } finally {
    server.close();
    await service.stored();
    await fs.rm(root, { recursive: true, force: true });
  }
}

// A report written as natural HTML (docs/editor.md, "Natural HTML"): its page sees it as the kit's
// (read: the text served, the version opened on and told), and the file stays as the Agent wrote it
// until a commit changes something in it: then it is the kit's markup with the change in it. A
// commit that changes nothing (nothing sent, or all of it refused) writes nothing, and neither it nor
// the revert check takes the natural file for someone else's write.
{
  const { createEditService } = await import("../../src/editor/service.mjs");
  const fs = await import("node:fs/promises");
  const os = await import("node:os");
  const path = await import("node:path");
  const http = await import("node:http");
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-natural-"));
  const file = path.join(root, "demo", "report.html");
  await fs.mkdir(path.dirname(file));
  const natural = page(`  <p>带 <mark>标记</mark> 的段落，\\(x^2\\) 也在。</p>
  <p>另一段。</p>
`);
  await fs.writeFile(file, natural);
  const logged = []; // what the dev server's log is told
  const service = createEditService({ reportsDirectory: root, log: (text) => logged.push(text) });
  const server = http.createServer((request, response) => (request.url === "/__gallery/edit/reverted" ? service.reverted : service.commit)(request, response));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const host = `127.0.0.1:${server.address().port}`;
  const post = async (body, route = "commit") => {
    const response = await fetch(`http://${host}/__gallery/edit/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": service.token },
      body: JSON.stringify({ slug: "demo", ...body }),
    });
    return response.json();
  };
  try {
    const report = await service.read("demo");
    assert.ok(report.source === natural && report.text !== natural && report.version === hashOf(report.text), "the file as written, the page's text the kit's");
    assert.ok(report.text.includes('<span class="doc-highlight-yellow">标记</span>') && report.text.includes('<span class="doc-math-inline">\\(x^2\\)</span>'));
    const map = JSON.parse(service.preview("demo", report.text).snippet.match(/<script type="application\/json"[^>]*>([^<]*)<\/script>/)[1]);
    assert.equal(map.version, report.version, "the page opens on that text");
    const paragraph = (words) => map.blocks.find((entry) => entry.inner.includes(words));
    const unitOf = (words) => ({ key: paragraph(words).unit, open: paragraph(words).unit, hash: map.units[paragraph(words).unit].hash });
    const nothing = await post({ opening: map.version, known: map.version, texts: [] });
    assert.ok(nothing.ok && nothing.wrote === false && nothing.foreign === false && nothing.version === map.version, JSON.stringify(nothing));
    const refused = await post({ opening: map.version, known: map.version, units: [{ key: "x", unit: { ...unitOf("另一段"), hash: "0000000000000000" }, remove: true }] });
    assert.ok(refused.ok && refused.wrote === false && refused.units[0].status === "conflict", JSON.stringify(refused.units));
    assert.equal(await fs.readFile(file, "utf8"), natural, "a commit that changes nothing leaves the natural file as written");
    const reverted = await post({ opening: map.version, texts: [] }, "reverted");
    assert.equal(reverted.version, map.version, "the revert check tells the page's version");
    const typed = await post({ opening: map.version, known: map.version, texts: [{ key: "t", block: { unit: unitOf("另一段"), self: true, before: "另一段。" }, parts: [{ keep: true, html: "另一段（人）。" }] }] });
    const text = await fs.readFile(file, "utf8");
    assert.ok(typed.ok && typed.wrote === true && typed.foreign === false && typed.version === hashOf(text), JSON.stringify(typed));
    assert.ok(text.includes('<span class="doc-highlight-yellow">标记</span>') && text.includes('<span class="doc-math-inline">\\(x^2\\)</span>') && /<p data-block-id="[a-z0-9]{8}">另一段（人）。<\/p>/.test(text), "the kit's markup with the typing in it");
    assert.equal((await service.read("demo")).text, text, "which pages see as it is");
    assert.equal(logged.length, 1, "said once, when it was written");
    assert.match(logged[0], /^natural \S*demo[\\/]report\.html: mark \(line \d+\), formula \(line \d+\) rewritten in this file as the kit's markup \(nothing to fix\); the words and numbers are unchanged$/, logged[0]);
  } finally {
    server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

// A card and a table copied on the page (clipboard/own/): the file gets a copy of each from its
// own source (their ids taken out, a block id each of their own), the page takes the copies in as
// units of the file (the card's title a text block of its own), an edit of a copy reaches only the
// copy, and a copy taken away again goes from the file. A copy of a unit the file no longer has is
// refused.
{
  const { build, describe } = await import("../../src/editor/page/clipboard/own/index.mjs");
  const s = studio(SOURCE.replace('<figure class="doc-figure" data-surface="bounded">', '<figure class="doc-figure" data-surface="bounded" id="card-one">'));
  const card = s.document.querySelector("figure");
  const wrap = s.document.querySelector(".doc-table-wrap");
  const cardCopy = build(s.document, describe(card));
  const tableCopy = build(s.document, describe(wrap));
  s.unit("丙段落").after(cardCopy, tableCopy);
  const made = s.commit();
  assert.deepEqual(made.receipt.units.map((entry) => entry.status), ["applied", "applied"]);
  const figures = [...s.file.matchAll(/<figure class="doc-figure" data-surface="bounded"( id="card-one")?( data-block-id="([a-z0-9]{8})")?>/g)];
  assert.equal(figures.length, 2, "two cards in the file");
  assert.ok(figures[1][3] && !figures[1][1], "the copy with a block id of its own and no id");
  assert.equal(s.file.split("<h3>卡片标题</h3>").length, 3);
  assert.equal(s.file.match(/<table class="doc-table">/g).length, 2, "and two tables");
  assert.ok(/<p data-block-id="[a-z0-9]{8}">丙段落，在第二章。<\/p>\s*<figure class="doc-figure" data-surface="bounded" data-block-id="[a-z0-9]{8}">\s*<h3>卡片标题<\/h3>/.test(s.file), "where they were pasted (the paragraph beside them named: touchBeside)");
  assert.equal(cardCopy.getAttribute("data-block-id"), figures[1][3], "the page knows the copy by its id");
  assert.ok(cardCopy.hasAttribute("data-ge-unit") && !cardCopy.hasAttribute("data-ge-new") && !cardCopy.hasAttribute("data-ge-copy"), "a unit of the file now");
  const title = cardCopy.querySelector("h3");
  assert.ok(title.hasAttribute("data-ge-block"), "its title a text block of its own");
  // Where it is in its unit is what the file says (the server's scan), not what the page counts.
  const registered = s.map.blocks[Number(title.getAttribute("data-ge-block"))];
  const inFile = instrument(s.file).map.blocks.filter((block) => block.inner === "卡片标题")[1];
  assert.ok(inFile?.path && registered.path, "both name it by a path");
  assert.deepEqual(registered.path, inFile.path, "the page takes the path the file gives its title");
  assert.equal(registered.unit, Number(cardCopy.getAttribute("data-ge-unit")), "in the unit the file has it in");
  assert.equal(s.commits.build(), null, "nothing left to commit");
  type(title, "副本标题");
  s.commit();
  assert.ok(s.file.includes("<h3>副本标题</h3>") && s.file.includes("<h3>卡片标题</h3>"), "an edit of the copy reaches the copy alone");
  cardCopy.remove();
  s.commit();
  assert.equal(s.file.split("<figure").length, 2, "the copy taken away goes from the file");

  // A chart card and the table it draws (src/shared/table-chart.mjs) copied together are a pair of
  // their own (clipboard/own/chart-keys.mjs): the page gives both copies the first key not taken
  // and sends it with each, which the file writes (copiedSource), so two pairs never cross. A table
  // copied alone while its original is there is a plain table (its key taken off); a card copied
  // alone keeps its key (both cards draw the same table).
  {
    const { relinkCopies } = await import("../../src/editor/page/clipboard/own/index.mjs");
    // The page's script, which defines the cards' type (the checks need it defined).
    const defining = (file) => file.replace("</body>", '<script>DocCharts.define("dots", () => {});</script>\n</body>');
    const charted = studio(page(`  <p>前面的段落。</p>
  <figure class="doc-figure"><h3>人数</h3><div data-doc-chart="dots" data-doc-chart-data="t1"></div></figure>
  <div class="doc-table-wrap" data-doc-chart-source="t1"><table class="doc-table"><thead><tr><th>组</th><th>人数</th></tr></thead><tbody><tr><td>甲</td><td>12</td></tr></tbody></table></div>
  <p>后面的段落。</p>
`));
    const copy = (selector) => build(charted.document, describe(charted.document.querySelector(selector)));
    const keys = (text, name) => [...text.matchAll(new RegExp(`${name}="([^"]*)"`, "g"))].map((match) => match[1]);
    const pair = [copy("figure"), copy(".doc-table-wrap")];
    relinkCopies(charted.document, pair);
    assert.deepEqual([pair[0].querySelector("[data-doc-chart]").getAttribute("data-doc-chart-data"), pair[1].getAttribute("data-doc-chart-source")], ["t2", "t2"], "the pair's copies take a key of their own");
    charted.unit("后面的段落").after(...pair);
    assert.ok(allApplied(charted.commit().receipt.units));
    assert.deepEqual([keys(charted.file, "data-doc-chart-data"), keys(charted.file, "data-doc-chart-source")], [["t1", "t2"], ["t1", "t2"]], "the file has the copies' key: two pairs");
    assert.ok(pair.every((node) => !node.hasAttribute("data-ge-chart-keys")), "the copies are units of the file, their keys written");
    const table = [copy(".doc-table-wrap")];
    const card = [copy("figure")];
    relinkCopies(charted.document, table);
    relinkCopies(charted.document, card);
    assert.equal(table[0].hasAttribute("data-doc-chart-source"), false, "a table copied alone is a plain table");
    assert.equal(card[0].querySelector("[data-doc-chart]").getAttribute("data-doc-chart-data"), "t1", "a card copied alone draws its original's table");
    charted.unit("前面的段落").after(...table, ...card);
    assert.ok(allApplied(charted.commit().receipt.units));
    assert.deepEqual([keys(charted.file, "data-doc-chart-data"), keys(charted.file, "data-doc-chart-source")], [["t1", "t1", "t2"], ["t1", "t2"]], "written so");
    assert.equal(charted.file.match(/<table class="doc-table">/g).length, 3);
    // Keys the page sends that are none are refused.
    assert.equal(copyKeys({ t1: "<x>" }), null);
    assert.equal(copyKeys([]), null);
    assert.deepEqual(copyKeys({ "销售": "t2", t1: null }), { "销售": "t2", t1: null });

    // A table made anew of a copy's data (its original gone, or changed since the copy: no copy of
    // it can be made) carries its original's key in the data: kept while no table on the page has it
    // (a cut table put back, its card drawing it again), taken off while one has, a pair's new key
    // with the card pasted with it; in another report, none.
    const fresh = () => studio(page(`  <p>前面的段落。</p>
  <figure class="doc-figure"><h3>人数</h3><div data-doc-chart="dots" data-doc-chart-data="t1"></div></figure>
  <div class="doc-table-wrap" data-doc-chart-source="t1"><table class="doc-table"><thead><tr><th>组</th><th>人数</th></tr></thead><tbody><tr><td>甲</td><td>12</td></tr></tbody></table></div>
  <p>后面的段落。</p>
`));
    {
      const s = fresh();
      const described = describe(s.document.querySelector(".doc-table-wrap"));
      assert.equal(described.data.chart, "t1", "the copy's data carries the key");
      removeUnit(s.document.querySelector(".doc-table-wrap"));
      const made = [build(s.document, described)];
      assert.equal(made[0].getAttribute("data-ge-type"), "table", "made anew");
      relinkCopies(s.document, made);
      assert.equal(made[0].getAttribute("data-doc-chart-source"), "t1", "its key kept: no table on the page has it");
      const elsewhere = [build(s.document, { ...described, report: "another" })];
      relinkCopies(s.document, elsewhere, { same: false });
      assert.equal(elsewhere[0].hasAttribute("data-doc-chart-source"), false, "another report's: none, though no table on the page has it");
      s.unit("后面的段落").after(...made);
      assert.ok(allApplied(s.commit().receipt.units));
      assert.deepEqual([keys(s.file, "data-doc-chart-data"), keys(s.file, "data-doc-chart-source")], [["t1"], ["t1"]], "the card draws it again");
      assert.deepEqual(chartDeclarationFailures(defining(s.file)), []);
      const again = [build(s.document, described)];
      relinkCopies(s.document, again);
      assert.equal(again[0].hasAttribute("data-doc-chart-source"), false, "pasted again: a table alone, the one put back carrying the key");
    }
    {
      const s = fresh();
      const blocks = [describe(s.document.querySelector("figure")), describe(s.document.querySelector(".doc-table-wrap"))];
      type(s.text("12"), "45"); // the original changed since the copy
      const made = blocks.map((block) => build(s.document, block));
      assert.deepEqual(made.map((node) => node.getAttribute("data-ge-type")), ["copy", "table"], "the card a copy, the table made anew");
      relinkCopies(s.document, made);
      s.unit("后面的段落").after(...made);
      assert.ok(allApplied(s.commit().receipt.units));
      assert.deepEqual([keys(s.file, "data-doc-chart-data"), keys(s.file, "data-doc-chart-source")], [["t1", "t2"], ["t1", "t2"]], "a pair of its own, as copied");
      assert.ok(/data-doc-chart-source="t2"[^>]*>\s*<table class="doc-table">[\s\S]*?<td>12<\/td>/.test(s.file) && s.file.includes("<td>45</td>"), "its numbers as copied, the original's its own");
    }
    // The page chose the pair's key from what it shows; an Agent added a chart table meanwhile, which
    // the intake gave that very key. The commit gives the copies another and says so; the page takes it.
    {
      const s = fresh();
      const pair = [s.document.querySelector("figure"), s.document.querySelector(".doc-table-wrap")].map((node) => build(s.document, describe(node)));
      relinkCopies(s.document, pair);
      s.unit("后面的段落").after(...pair);
      s.file = s.file.replace("  <p>前面的段落。</p>\n", `  <p>前面的段落。</p>
  <figure class="doc-figure"><div data-doc-chart="dots" data-doc-chart-data="t2"></div></figure>
  <div class="doc-table-wrap" data-doc-chart-source="t2"><table class="doc-table"><tbody><tr><td>x</td><td>3</td></tr></tbody></table></div>
`);
      const { receipt } = s.commit();
      assert.ok(allApplied(receipt.units));
      assert.deepEqual(receipt.chartKeys, { t2: "t3" }, "the copies' key, as the file has it");
      assert.deepEqual([keys(s.file, "data-doc-chart-data"), keys(s.file, "data-doc-chart-source")], [["t2", "t1", "t3"], ["t2", "t1", "t3"]], "the Agent's pair and the copied one apart");
      assert.deepEqual(chartDeclarationFailures(defining(s.file)), []);
      assert.deepEqual([pair[0].querySelector("[data-doc-chart]").getAttribute("data-doc-chart-data"), pair[1].getAttribute("data-doc-chart-source")], ["t3", "t3"], "the page's copies too");
    }
    // The same against the file directly (relinkMade): a table made keeping its key while another
    // table has it, a table alone; a table put back for the card that draws it, and a pair of its own, as they are.
    {
      const file = (made) => page(`  <figure class="doc-figure"><div data-doc-chart="dots" data-doc-chart-data="t1"></div></figure>
  <div class="doc-table-wrap" data-block-id="aaaaaaaa"${made === "two" ? ' data-doc-chart-source="t1"' : ""}><table class="doc-table"><tbody><tr><td>a</td><td>1</td></tr></tbody></table></div>
  <div class="doc-table-wrap" data-block-id="bbbbbbbb" data-doc-chart-source="t1"><table class="doc-table"><tbody><tr><td>b</td><td>2</td></tr></tbody></table></div>
  <figure class="doc-figure" data-block-id="cccccccc"><div data-doc-chart="dots" data-doc-chart-data="t5"></div></figure>
  <div class="doc-table-wrap" data-block-id="dddddddd" data-doc-chart-source="t5"><table class="doc-table"><tbody><tr><td>d</td><td>4</td></tr></tbody></table></div>
`);
      const alone = relinkMade(file("two"), new Set(["bbbbbbbb", "cccccccc", "dddddddd"]));
      assert.deepEqual(alone.keys, { t1: null });
      assert.ok(alone.text.includes('<div class="doc-table-wrap" data-block-id="bbbbbbbb"><table') && alone.text.includes('data-block-id="aaaaaaaa" data-doc-chart-source="t1"'), "the one made a table alone");
      assert.deepEqual(relinkMade(file("one"), new Set(["bbbbbbbb", "cccccccc", "dddddddd"])), { text: file("one"), keys: {} }, "put back for its card; a pair of its own");
    }
  }

  // A card drawing an arrow with a marker of its own (src/shared/copy-ids.mjs), pasted twice in one
  // paste: the page gives each copy its own prefix (clipboard/own/ids.mjs), the file each its own too
  // (copiedSource, the ids given to the first kept from the second's), every reference to match; the
  // copies' other ids gone. No id twice in the file, and the original stays deletable.
  {
    const { prefixCopies } = await import("../../src/editor/page/clipboard/own/index.mjs");
    const s = studio(page(`  <p>前面的段落。</p>
  <figure class="doc-figure"><h3>流程</h3><svg viewBox="0 0 100 20"><defs><marker id="flow-arrow"><path d="M0 0L4 2L0 4"/></marker></defs><path id="flow-line" d="M0 10H90" marker-end="url(#flow-arrow)"/></svg></figure>
  <p>后面的段落。</p>
`));
    const made = [0, 1].map(() => build(s.document, describe(s.document.querySelector("figure"))));
    prefixCopies(s.document, made);
    assert.deepEqual(made.map((copy) => copy.querySelector("marker").id), ["c1-flow-arrow", "c2-flow-arrow"], "the page's copies");
    s.unit("后面的段落").after(...made);
    assert.ok(allApplied(s.commit().receipt.units));
    assert.deepEqual([...s.file.matchAll(/ id="([^"]+)"/g)].map((match) => match[1]), ["flow-arrow", "flow-line", "c1-flow-arrow", "c2-flow-arrow"], `the file's:\n${s.file}`);
    assert.deepEqual([...s.file.matchAll(/marker-end="([^"]+)"/g)].map((match) => match[1]), ["url(#flow-arrow)", "url(#c1-flow-arrow)", "url(#c2-flow-arrow)"]);
    assert.ok(findUnits(s.file).units.filter((unit) => unit.kind === "figure").every((unit) => unit.keep === null), "each names its own: none kept");
  }

  // So with an instance of a component package and all an attribute holding ids can name: a label's
  // `for`, ARIA's lists, a word #id. A copy names its own field, so nothing of it holds the original
  // from being deleted, and an id it names and does not hold stays as it is.
  {
    const { prefixCopies } = await import("../../src/editor/page/clipboard/own/index.mjs");
    const s = studio(page(`  <p>前面的段落。</p>
  <div data-doc-component="local/form"><label for="rich-f">来源 <input id="rich-f" aria-describedby="rich-h outer"></label><span id="rich-h">说明</span><button data-target="#rich-f">选</button><i id="alone">没人叫它</i></div>
  <p id="outer">后面的段落。</p>
`));
    const made = [0, 1].map(() => build(s.document, describe(s.document.querySelector("[data-doc-component]"))));
    prefixCopies(s.document, made);
    assert.deepEqual(made.map((copy) => [copy.querySelector("label").getAttribute("for"), copy.querySelector("input").id, copy.querySelector("input").getAttribute("aria-describedby"), copy.querySelector("button").getAttribute("data-target"), copy.querySelector("i").id]),
      [["c1-rich-f", "c1-rich-f", "c1-rich-h outer", "#c1-rich-f", ""], ["c2-rich-f", "c2-rich-f", "c2-rich-h outer", "#c2-rich-f", ""]], "the page's copies");
    s.unit("后面的段落").after(...made);
    assert.ok(allApplied(s.commit().receipt.units));
    assert.deepEqual([...s.file.matchAll(/<label for="([^"]+)">来源 <input id="([^"]+)" aria-describedby="([^"]+)"/g)].map((match) => match.slice(1)),
      [["rich-f", "rich-f", "rich-h outer"], ["c1-rich-f", "c1-rich-f", "c1-rich-h outer"], ["c2-rich-f", "c2-rich-f", "c2-rich-h outer"]], `the file's:\n${s.file}`);
    assert.deepEqual([...s.file.matchAll(/data-target="([^"]+)"/g)].map((match) => match[1]), ["#rich-f", "#c1-rich-f", "#c2-rich-f"]);
    assert.equal((s.file.match(/id="alone"/g) ?? []).length, 1, "an id nothing names stays with the original alone");
    const instances = findUnits(s.file).units.filter((unit) => unit.kind === "installed");
    assert.equal(instances.length, 3);
    assert.ok(instances.every((unit) => unit.keep === null), "each names its own: none kept");
  }

  const t = studio(SOURCE);
  const lost = build(t.document, describe(t.document.querySelector("figure")));
  t.unit("丙段落").after(lost);
  t.file = t.file.replace(/\n\s*<figure[\s\S]*?<\/figure>/, "");
  const refused = t.commit();
  assert.deepEqual(refused.receipt.units.map((entry) => entry.status), ["conflict"], "a copy of a card the file no longer has is refused");
}

// An emptied block stays, empty (a free text block may be): the page sends its text emptied and its
// move, and what the reader types into it while that commit is on its way goes with the next one.
// Fuzz seed 5139 (when an emptied block went with its commit): an item emptied and lifted out of
// its list (Enter in an empty nested item) went with its move, which the file made with the item's
// old text, the emptying left out.
{
  const s = studio(page(`  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">第一章</h2>
    <ul>
      <li>地方 x
        <ul>
          <li>是</li>
        </ul>
      </li>
    </ul>
  </section>
`));
  const item = s.document.querySelectorAll("main li")[1];
  type(item, "");
  assert.ok(outdentItem(item));
  const lifted = s.commit({ between: () => type(item, "ab") });
  assert.deepEqual(lifted.conflicts, []);
  assert.ok(s.last.request.units.some((op) => op.move), "the emptied item moves where the reader put it");
  assert.match(s.file, /<li data-block-id="[a-z0-9]{8}">地方 x<\/li>\n\s*<li data-block-id="[a-z0-9]{8}"><\/li>\n\s*<\/ul>/, "emptied, in its new place");
  s.commit();
  assert.match(s.file, /<li data-block-id="[a-z0-9]{8}">地方 x<\/li>\n\s*<li data-block-id="[a-z0-9]{8}">ab<\/li>\n\s*<\/ul>/, "what was typed meanwhile, where it stands");
  assert.equal(s.commits.build(), null);

  // A paragraph emptied, with the one before it moved right after it: both where the page has them.
  const t = studio(SOURCE);
  const [first, second] = [t.unit("甲段落"), t.unit("乙段落")];
  type(second, "");
  second.after(first);
  const emptied = t.commit();
  assert.deepEqual(emptied.conflicts, []);
  assert.match(t.file, /<p data-block-id="[a-z0-9]{8}"><\/p>\n\s*<p data-block-id="[a-z0-9]{8}">甲段落，写的是开头。<\/p>/, "the emptied one kept, the moved one after it");
  assert.equal(t.commits.build(), null);
}

// An item emptied over the blocks it holds is written so, as an item keeps its title line
// however empty, and the words taken out of it are in the file once: a paste at its start takes them
// into a paragraph after what it pasted, which the file wrote while it kept them in the item until it
// had words again, so that opened again the page showed them twice (fuzz seed 11108 of --instances
// --more). Its blocks taken out, it stays empty; typed in again, its words go before what it holds.
{
  const s = studio(page(`  <ul>
    <li>甲
      <ul>
        <li>乙</li>
      </ul>
    </li>
    <li>丙
      <p>丙下的段落</p>
    </li>
  </ul>
`));
  const [first, , third] = s.document.querySelectorAll("main li");
  first.firstChild.data = "";
  third.firstChild.data = "";
  const words = newHost(s.document, "paragraph");
  words.textContent = "丙";
  third.querySelector("p").before(words);
  const emptied = s.commit();
  assert.ok(allApplied([...emptied.receipt.texts, ...emptied.receipt.units]), JSON.stringify(emptied.receipt));
  assert.match(s.file, /<li data-block-id="[a-z0-9]{8}">\n\s*<ul>\n\s*<li>乙<\/li>/, "the first item written with no text, its list under it");
  assert.match(s.file, /<li data-block-id="[a-z0-9]{8}">\n\s*<p data-block-id="[a-z0-9]{8}">丙<\/p>\n\s*<p data-block-id="[a-z0-9]{8}">丙下的段落<\/p>/, "the other's words in the paragraph alone");
  assert.equal(s.file.split("丙").length, 3, "once (and once in the paragraph it held)");
  assert.equal(s.commits.build(), null, "nothing waits");
  assert.ok(outdentItem(s.document.querySelectorAll("main li")[1]));
  const outdented = s.commit();
  assert.ok(allApplied([...outdented.receipt.texts, ...outdented.receipt.units]), JSON.stringify(outdented.receipt));
  assert.match(s.file, /<li data-block-id="[a-z0-9]{8}"><\/li>\n\s*<li data-block-id="[a-z0-9]{8}">乙<\/li>/, "its only item outdented, the item empty");
  first.prepend("甲改");
  const typed = s.commit();
  assert.ok(allApplied(typed.receipt.texts), JSON.stringify(typed.receipt));
  assert.match(s.file, /<li data-block-id="[a-z0-9]{8}">甲改<\/li>/);
  assert.equal(s.commits.build(), null);
}

// Asked by a page that still names an emptied block (an older page's buffer), the file does what
// it can and says what it did: moving the block is done (it goes); a block placed next to it is
// refused (`position`: the page puts it at the end of its box), never left out while the answer
// says it was written.
{
  const file = page(`  <section class="doc-section" data-block-id="sectaaaa">
    <p data-block-id="paraaaaa">甲</p>
    <p data-block-id="parabbbb">乙</p>
    <p data-block-id="paracccc">丙</p>
  </section>
`);
  const emptied = { key: "b1", block: { unit: { key: 2, id: "parabbbb" }, self: true, before: "乙" }, parts: [] };
  const moved = commitEdits({ current: file, texts: [emptied], units: [{ key: "u1", unit: { key: 2, id: "parabbbb" }, move: { after: { key: 3, id: "paracccc" } } }] });
  assert.deepEqual([...moved.texts, ...moved.units].map((entry) => entry.status), ["applied", "applied"]);
  assert.ok(!moved.text.includes("乙") && moved.gone.includes("parabbbb"), "moved and emptied, it goes");
  const placed = commitEdits({ current: file, texts: [emptied], units: [{ key: "u1", unit: { key: 1, id: "paraaaaa" }, move: { after: { key: 2, id: "parabbbb" } } }] });
  assert.deepEqual(placed.units.map((entry) => [entry.status, entry.reason]), [["conflict", "position"]]);
  assert.ok(placed.text.includes("甲") && !placed.text.includes("乙"), "the block placed by it stays where it was");
}

// A move the file refused (its place gone: the neighbour it was put after is not in the file) is no
// move made: the unit is still in the unit the file has it in, so that is what the page keeps as its
// parent (the units its next commit touches, the revert check's `from`), not the one it stands in on
// the page. Tried again at the end of its box, the move goes in and the file's parent is the new one.
{
  const s = studio(SOURCE);
  const unitOf = (node) => Number(node.getAttribute("data-ge-unit"));
  const moving = s.unit("乙段落");
  const [from, to] = [unitOf(s.section("第一章")), unitOf(s.section("第二章"))];
  const id = unitOf(moving);
  assert.equal(s.map.units[id].parent, from, "in the first section as the file has it");
  s.unit("丙段落").after(moving);
  // A server whose file has no such neighbour: the anchor of the move names a block it does not know.
  const gone = (request) => ({ ...request, units: request.units.map((op) => op.move?.after ? { ...op, move: { after: { key: 99, id: "zzzzzzzz" } } } : op) });
  const refused = s.commit({ sent: gone });
  assert.deepEqual(refused.receipt.units.map((entry) => [entry.status, entry.reason]), [["conflict", "position"]]);
  assert.equal(s.map.units[id].parent, from, "refused: the file still has it in the first section");
  assert.deepEqual(refused.conflicts, [], "the end of its box is tried first, nothing held");
  const again = s.commit();
  assert.deepEqual(again.receipt.units.map((entry) => [entry.status, entry.reason]), [["applied", undefined]]);
  assert.equal(s.map.units[id].parent, to, "taken in at the end of the second section: the file's parent is the new one");
  assert.ok(s.file.indexOf("乙段落") > s.file.indexOf("第二章"), "the file has it in the second section");
  assert.equal(s.commits.build(), null);
}

// Items split off a list item that moves go with it (model seed 19: they were written at its old
// place, which the move then cut away, and the answer said they were written).
{
  const s = studio(page(`  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">第一章</h2>
    <ul>
      <li>甲项</li>
      <li>乙项</li>
    </ul>
  </section>
`));
  const [a, b] = s.document.querySelectorAll("main li");
  b.after(a);
  const range = s.document.createRange();
  range.setStart(a.firstChild, 1);
  splitBlock(a, range);
  const split = s.commit();
  assert.deepEqual([...split.receipt.texts, ...split.receipt.units].map((entry) => entry.status), ["applied", "applied"]);
  assert.deepEqual(split.receipt.gone, []);
  assert.match(s.file, /<li[^>]*>乙项<\/li>\n\s*<li data-block-id="[a-z0-9]{8}">甲<\/li>\n\s*<li data-block-id="[a-z0-9]{8}">项<\/li>/, "the item split off where it stands");
  assert.equal(s.commits.build(), null);
}

// Whatever an answer says of a text, the page goes on from what the file has: a block the file
// still has after a commit that emptied it (as the file kept an item whose emptying went with its
// move: fuzz seed 5139) is taken in again from the file's text, so that what the page shows there
// instead, typed while that commit was on its way, goes with the next commit. A copy the page shows
// as it was pasted (a formula, a non-breaking space) is the file's text: nothing is written again.
{
  const s = studio(SOURCE.replace("<p>丙段落，在第二章。</p>", "<p>丙段落，在第二章。</p>\n    <ul>\n      <li>第一项</li>\n      <li>第二项</li>\n    </ul>"));
  const item = s.text("第二项");
  type(item, "");
  const emptying = (entry) => entry.parts.length === 0 || (entry.parts.length === 1 && entry.parts[0].keep && entry.parts[0].html === "");
  const kept = (request) => ({ ...request, texts: request.texts.map((entry) => emptying(entry) ? { ...entry, parts: [{ keep: true, html: entry.block.before }] } : entry) });
  const emptied = s.commit({ between: () => type(item, "后写的"), sent: kept });
  assert.deepEqual(emptied.conflicts, []);
  assert.ok(s.file.includes(">第二项</li>"), "the file kept it");
  s.commit();
  assert.ok(s.file.includes(">后写的</li>") && !s.file.includes("第二项"), "what the page shows goes in");
  assert.equal(s.commits.build(), null);

  const { build, describe } = await import("../../src/editor/page/clipboard/own/index.mjs");
  const caption = String.raw`说明 <span class="doc-math-inline">\(x^2 &lt; y\)</span> 结束&nbsp;了`;
  const t = studio(SOURCE.replace('<p class="doc-figure-caption">卡片说明</p>', () => `<p class="doc-figure-caption">${caption}</p>`));
  t.unit("丙段落").after(build(t.document, describe(t.document.querySelector("figure"))));
  t.commit();
  assert.equal(t.file.split(caption).length, 3, "the copy written from the file's source");
  assert.equal(t.commits.build(), null, "and not again from the page's");
}

// A list whose items all go with a block placed right after it (the page still shows the list,
// empty) stays in the file, empty, as the page shows it: going, it took that block along (model
// seed 367: a section moved after it went from the file, and the answer said it was moved).
{
  const s = studio(page(`  <p>开头一段。</p>

  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">第一章</h2>
    <p>甲段落，写的是开头。</p>
  </section>

  <ul>
    <li>唯一一项</li>
  </ul>

  <section class="doc-section" aria-labelledby="b">
    <h2 id="b">第二章</h2>
    <p>丙段落，在第二章。</p>
  </section>
`));
  const list = s.document.querySelector("main > ul");
  s.text("唯一一项").remove();
  list.after(s.section("第一章"));
  const moved = s.commit();
  assert.deepEqual(moved.conflicts, []);
  assert.ok(allApplied(moved.receipt.units), JSON.stringify(moved.receipt.units));
  assert.ok(s.file.indexOf("<ul") < s.file.indexOf("第一章") && s.file.indexOf("第一章") < s.file.indexOf("第二章") && !s.file.includes("唯一一项"), "the section after the list, the item gone");
  assert.equal(s.file.split("甲段落，写的是开头。").length, 2);
  assert.ok(!moved.receipt.gone.includes(s.section("第一章").getAttribute("data-block-id")), "the section is no block made anew");
  assert.equal(s.commits.build(), null);
}

// A paragraph converted in a section an undo put back, before the commit putting it back is
// answered: its text goes with the conversion alone, not also emptied (model seed 5087: the file
// took the block out, and the answer said the conversion was written).
{
  const s = studio(SOURCE);
  const undo = recordLists(s.document.querySelector("main"));
  s.section("第一章").remove();
  s.commit();
  undo();
  convertBlock(s.text("乙段落"), "heading3");
  s.commit();
  const converted = s.commit();
  assert.deepEqual(converted.conflicts, []);
  assert.deepEqual(s.last.request.texts, [], "the conversion carries the text");
  assert.deepEqual(converted.receipt.gone, []);
  assert.match(s.file, /<h3 data-block-id="[a-z0-9]{8}">乙段落，写的是中间。<\/h3>/);
  assert.equal(s.commits.build(), null);
}

// A list deleted while its items stand elsewhere on the page in a container not written yet (a new
// row of columns whose other column is still empty; fuzz --more seed 3042): the file deletes them
// with it, so the page makes them blocks of its own from then on; an item typed into them meanwhile
// is no conflict, and once the row can be written, they are written with it.
{
  const s = studio(page(`  <p>前文。</p>
  <ul>
    <li>甲项
      <ul>
        <li>乙项</li>
      </ul>
    </li>
  </ul>
  <p>后文。</p>
`));
  const doc = s.document;
  const item = s.unit("甲项");
  const nested = item.querySelector("ul");
  const inner = nested.querySelector("li");
  const list = item.parentElement;
  const row = newContainer(doc, "columns");
  const left = newContainer(doc, "column");
  const right = newContainer(doc, "column");
  const box = newContainer(doc, "bullets");
  const empty = newHost(doc, "paragraph");
  box.append(item);
  left.append(box);
  row.append(left, right); // the right column holds nothing yet: the row is not written
  list.replaceWith(row);
  const deleted = s.commit();
  assert.ok(allApplied(deleted.receipt.units), JSON.stringify(deleted.receipt.units));
  assert.ok(!s.file.includes("甲项") && !s.file.includes("乙项"), "the list goes from the file with its items");
  assert.ok([item, nested, inner].every((node) => node.hasAttribute("data-ge-new") && !node.hasAttribute("data-ge-unit")), "the items the page still shows are made on the page");
  // An item typed into the nested list meanwhile: nothing to write yet, and no conflict.
  const typed = newHost(doc, "item");
  type(typed, "丙项");
  nested.append(typed);
  const meanwhile = s.commit();
  assert.ok(!meanwhile || meanwhile.receipt.units.every((entry) => entry.status === "applied"), JSON.stringify(meanwhile?.receipt.units));
  // The other column written: the row is written, the items in it.
  type(empty, "右栏。");
  right.append(empty);
  const written = s.commit();
  assert.ok(allApplied(written.receipt.units), JSON.stringify(written.receipt.units));
  const shape = s.file.replace(/ data-block-id="[a-z0-9]{8}"/g, "").replace(/\s+/g, " ");
  assert.ok(shape.includes('<div class="doc-columns"> <div class="doc-column"> <ul> <li>甲项 <ul> <li>乙项</li> <li>丙项</li> </ul> </li> </ul> </div> <div class="doc-column"> <p>右栏。</p> </div> </div>'), shape);
  assert.equal(s.commits.build(), null, "nothing left");
}

// An instance made on the page: the file writes what its manifest says, the page takes in what the
// file says of it. Words nobody touched show the file's, a list the page holds being old; words
// typed before the commit went are the next commit's; what the page drew around a part moves no path.
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-commit-"));
  fs.cpSync(path.join(projectRoot, "tests", "fixtures", "components"), path.join(root, "components"), { recursive: true });
  const workspace = process.env.GALLERY_DEFAULT_WORKSPACE;
  process.env.GALLERY_DEFAULT_WORKSPACE = root;
  forgetCatalog(root);
  try {
    const made = (s, inner) => {
      const instance = s.document.createElement("div");
      instance.setAttribute("data-doc-component", "local/strip");
      instance.innerHTML = inner;
      for (const [name, value] of [["data-ge-new", ""], ["data-ge-type", "installed"], ["data-ge-unit-kind", "installed"]]) instance.setAttribute(name, value);
      const parts = [...instance.querySelectorAll("h3, .strip-caption")];
      for (const part of parts) for (const [name, value] of [["contenteditable", "true"], ["data-ge-part", part.innerHTML], ["data-ge-kind", "installed"], ["data-ge-caps", "empty links"]]) part.setAttribute(name, value);
      s.unit("乙段落").after(instance);
      return { instance, title: parts[0] };
    };
    const s = studio(SOURCE);
    const old = made(s, '<h3>旧模板的题</h3><p class="strip-caption">旧模板的说明</p>');
    s.commits.marks();
    const id = old.instance.getAttribute("data-block-id");
    assert.match(id, /^[a-z0-9]{8}$/, "named from the moment it is on the page, as the kit keeps its state under it");
    assert.ok(allApplied(s.commit().receipt.units));
    assert.ok(s.file.includes(`data-doc-component="local/strip" data-block-id="${id}"`) && s.file.includes("<h3>新的指标</h3>") && !s.file.includes("旧模板"), `the manifest's, under that id:\n${s.file}`);
    assert.equal(old.title.textContent, "新的指标", "an untouched part shows what the file says");
    assert.ok(old.title.hasAttribute("data-ge-block") && !old.title.hasAttribute("data-ge-part") && !old.instance.hasAttribute("data-ge-new"), "and is a text block of the file's");
    assert.equal(s.commits.build(), null, "nothing left");

    const t = studio(SOURCE);
    const typed = made(t, '<h3>新的指标</h3><p class="strip-caption">写上这些数字的说明</p>');
    typed.title.textContent = "打的字";
    assert.ok(allApplied(t.commit().receipt.units));
    assert.ok(t.file.includes("<h3>新的指标</h3>"), "words typed go by no template");
    assert.equal(typed.title.textContent, "打的字", "they stay on the page");
    t.commit();
    assert.ok(t.file.includes("<h3>打的字</h3>"), `and go with the next commit:\n${t.file}`);
    assert.equal(t.commits.build(), null, "nothing left");

    const u = studio(SOURCE);
    const drawn = made(u, '<h3>新的指标</h3><p class="strip-caption">写上这些数字的说明</p>');
    drawn.instance.prepend(u.document.createElement("h3")); // the component's drawing
    u.commit();
    assert.equal(u.commits.build(), null, "a part found whatever was drawn around it");
    assert.ok(drawn.title.hasAttribute("data-ge-block"), "by its place among them");
  } finally {
    process.env.GALLERY_DEFAULT_WORKSPACE = workspace;
    forgetCatalog(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

console.log("Checked commits: named by identity (ids given to what changes and the units around it), merged with changes elsewhere and word by word in one block, conflicts held back alone, blocks made on the page taken in as ordinary ones (splits, sections, new and dissolved sections, conversions), fields by path and by text when the structure moved, text outside any unit, a reader going on while a commit is on its way, deletes guarded by what the page saw, identical blocks told apart by their order, undo across commits (a deleted block or section put back from its sealed source, also when undone while that commit was on its way, a merge, a conversion, a split undone and redone), a commit sent twice writing once (ids the page proposes), the reader's decisions on conflicts (mine, anyway, given up: that change alone, the block read-only after, another of its kind going or asking; a refusal saying the unit as the file holds it after that commit and what is in it, and a forced change finding it by that where no other block opened with it), placed after the units that wait off the page only where the file has them, a held unit kept where the file has it beside a block moved down and back, one whose deletion waits going with the section dissolved around it, a merge the page could not show merged again from what it sent, body text straight in the page with sections made after it and dissolved on request, a block whose place went put at the end of its box, texts put back by someone else's write, a detail card made on the page taken in as a card of the file (its content and title saved after it, not made again, undone and redone with no conflict), cards and tables copied on the page written from their own source and taken in as units (a copy's edits its own, a copy of a unit gone refused, a chart card and its table copied together a pair with a key of their own, a table copied alone a plain table, one made anew of a copy's data keeping its key for the card that draws it, a pair's key made sure of against the file an Agent changed meanwhile and the page told), an emptied block kept, empty, and moved where the page has it (what is typed into it meanwhile written with the next commit), units a deleted list took along that the page shows in a row of columns not written yet made on the page, items split off a moving item going with it, a list whose items all go kept, empty, when a block is placed next to it, a paragraph converted in a section put back carrying its text alone, a block taken in again from the file's text when the page shows other words (a pasted copy not written again), a file the Agent changed meanwhile (a delete of a block it changed or dropped, a list it added to, the same words on both sides, twin text told apart, moves and sizes with its changes in the moved block, a conversion of a paragraph it changed), ids an export gave meanwhile changing nothing (start tags ending in whitespace too), a block the page made never taken for the one of the file it names as it opened, and the endpoints (request checks, the title in report.json, an Agent writing meanwhile, recent versions, the revert check, a restart, a natural file left as written until a commit changes it, then the kit's markup, said in the log).");
