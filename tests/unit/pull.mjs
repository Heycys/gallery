import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { pendingKey, recover } from "../../src/editor/page/autosave.mjs";
import { createCommits } from "../../src/editor/page/commit.mjs";
import { createHistory } from "../../src/editor/page/history.mjs";
import { captureLayout, editableAhead, markFrames, matchesSource, prepareBlock } from "../../src/editor/page/core.mjs";
import { HOSTS } from "../../src/editor/components/registry.mjs";
import { CODE } from "../../src/editor/components/kit.mjs";
import { connectPages } from "../../src/editor/page/page-objects.mjs";
import { createPull, kitMissing } from "../../src/editor/page/pull/apply.mjs";
import { COMMON_CELLS, ordersIn, planPull } from "../../src/editor/page/pull/plan.mjs";
import { commitEdits, hashOf, instrument, shownSource } from "../../src/editor/source.mjs";
import { withKitTags } from "../../src/render/assets.mjs";
import { scan } from "../../src/editor/source/blocks.mjs";
import { frameShell, unitShell } from "../../src/editor/source/units.mjs";
import { advance, browser, clock, open, page, play, removeUnit, seal, server, stop, storage } from "./page-harness.mjs";

// The page's pull (docs/editor.md "Someone else's writes"; decided 2026-11-12):
// someone else's write that changed only the words of text blocks the page has is shown where the page
// stands. What the server tells apart (a unit's shell, the document's frame: source/units.mjs), the plan
// (page/pull/plan.mjs, a pure function), and the page taking it in (commit.mjs pullView and pulled, pull/
// apply.mjs, autosave.mjs) against the server's side (commitEdits), in jsdom (page-harness.mjs).

const SOURCE = page(`  <section class="doc-section" aria-labelledby="a">
    <h2 id="a">第一章</h2>
    <p>甲段落，写的是开头。</p>
    <ul>
      <li>条目一<ul><li>子条目</li></ul></li>
      <li>条目二</li>
    </ul>
  </section>

  <p>乙段落，写的是中间。</p>
  <p>丙段落，在后面。</p>
`);

// ---------- what the server tells apart ----------
{
  const shells = (source) => {
    const scanned = scan(source);
    return { frame: frameShell(source, scanned), units: scanned.units.map((unit) => unitShell(source, unit, scanned)) };
  };
  const before = shells(SOURCE);
  const same = (source, label) => assert.deepEqual(shells(source), before, label);
  same(SOURCE.replace("甲段落，写的是开头。", "甲<strong>段落</strong>，写的是开头（改）。").replace("条目一<ul>", "条目一（改）<ul>"), "words changed: no shell, no frame");
  same(SOURCE.replace("<h1 class=\"doc-title\">报告</h1>", "<h1 class=\"doc-title\">新报告</h1>").replace("<title>报告</title>", "<title>新报告</title>"), "the title and <title> changed: no frame");
  same(SOURCE.replace("<p>乙段落", '<p data-block-id="abcd1234">乙段落'), "ids given: none");
  same(SOURCE.replace("\n    <p>甲段落", "\n        <p>甲段落"), "indented otherwise: none");
  const classed = shells(SOURCE.replace("<p>乙段落", '<p class="doc-lead">乙段落'));
  assert.equal(classed.frame, before.frame);
  assert.deepEqual(classed.units.map((shell, index) => shell === before.units[index]), before.units.map((_, index) => index !== scan(SOURCE).units.findIndex((unit) => SOURCE.slice(unit.start, unit.end).startsWith("<p>乙段落"))), "a class: that unit's shell alone");
  assert.notEqual(shells(SOURCE.replace("</head>", "<style>p { color: red; }</style></head>")).frame, before.frame, "the head: the frame");
  // A unit added into a list leaves the list's shell (the units in it are apart).
  const added = SOURCE.replace("<li>条目二</li>", "<li>条目二</li>\n      <li>条目三</li>");
  const listOf = (source) => {
    const scanned = scan(source);
    const list = scanned.units.find((unit) => unit.kind === "list" && unit.parent !== null && source.slice(unit.start, unit.end).includes("条目二"));
    return unitShell(source, list, scanned);
  };
  assert.equal(listOf(added), listOf(SOURCE), "an item added: the list's shell as it was");
  const { map } = instrument(SOURCE);
  assert.ok(typeof map.frame === "string" && map.units.every((unit) => typeof unit.shell === "string"), "the page's map carries them");
  const answer = commitEdits({ current: SOURCE, touch: [{ key: 0, open: 0, hash: map.units[0].hash, blockId: "sect0001" }], opening: SOURCE });
  assert.ok(typeof answer.frame === "string" && answer.shells[0] === answer.file.sect0001.shell, "and a commit's answer, as its hashes");
}

// ---------- the plan ----------
// The page's description of a file it opened on, as its commits give it, and the file's as its page is served.
const served = (source) => {
  const { html, map } = instrument(source);
  const doc = new JSDOM(html).window.document;
  return { html, map, doc, file: { version: map.version, frame: map.frame, units: map.units, boxes: map.boxes, blocks: map.blocks, orders: ordersIn(doc) } };
};
const studio = (source) => {
  const { map, html } = served(source);
  const { document } = new JSDOM(html).window;
  const baselines = new Map();
  for (const block of map.blocks) baselines.set(block.id, prepareBlock(document.querySelector(`[data-ge-block="${block.id}"]`), block));
  let layout = captureLayout(document, map);
  const commits = createCommits({ root: document, map, baselines, units: new Map(), boxes: new Map(), getLayout: () => layout, setLayout: (next) => (layout = next) });
  return { document, map, commits, baselines };
};
const plan = (source, next, patchable = () => true) => planPull(studio(source).commits.pullView(), served(next).file, { patchable });
{
  const same = plan(SOURCE, SOURCE);
  assert.ok(same.ok && same.same && same.changes.length === 0, "the file as the page opened on it: nothing to show");
  const words = plan(SOURCE, SOURCE.replace("甲段落，写的是开头。", "甲段落，写的是开头（AI）。").replace("子条目", "子条目（AI）").replace("<h1 class=\"doc-title\">报告</h1>", "<h1 class=\"doc-title\">报告（AI）</h1>"));
  assert.ok(words.ok && !words.same, words.reason);
  assert.deepEqual(words.changes.map(({ theirs }) => theirs.inner).sort(), ["报告（AI）", "子条目（AI）", "甲段落，写的是开头（AI）。"].sort(), "the words of a paragraph, a nested item and the title");
  const why = (next, patchable) => plan(SOURCE, next, patchable).reason;
  // Units put in, taken out or moved: how many of each (by the page's, and the file's put in).
  const moves = (before, next) => {
    const result = plan(before, next);
    return result.ok ? `-${result.removed.size} +${result.inserted.size} ~${result.moved.size} ${result.changes.length}w` : result.reason;
  };
  assert.equal(moves(SOURCE, SOURCE.replace("<p>丙段落，在后面。</p>", "<p>丙段落，在后面。</p>\n  <p>AI 加的段落。</p>")), "-0 +1 ~0 0w", "a paragraph added");
  assert.equal(moves(SOURCE, SOURCE.replace("\n  <p>乙段落，写的是中间。</p>", "")), "-1 +0 ~0 0w", "a paragraph taken out");
  assert.equal(moves(SOURCE, SOURCE.replace("<li>条目二</li>", "<li>条目二</li><li>条目三</li>")), "-0 +1 ~0 0w", "an item added in a list");
  assert.equal(moves(SOURCE, SOURCE.replace("<p>乙段落，写的是中间。</p>", "<h2>乙段落，写的是中间。</h2>")), "-1 +1 ~0 0w", "a paragraph made a heading: taken out, a heading put in");
  assert.equal(why(SOURCE.replace("<p>乙段落", '<p class="doc-lead">乙段落')), "shell", "a paragraph's class");
  assert.equal(why(SOURCE.replace("</head>", "<style>p { color: red; }</style></head>")), "frame", "the head");
  assert.equal(why(SOURCE.replace("乙段落，写的是中间。", "乙段落，写的是中间。"), () => false), undefined, "nothing changed: nothing to show, whatever can be shown");
  assert.equal(why(SOURCE.replace("乙段落，写的是中间。", "乙段落，写的是中间（AI）。"), () => false), "text", "words of a block the page cannot show in place");
  // Ids an export gave: the page's from now on.
  const ided = plan(SOURCE, SOURCE.replace("<p>乙段落", '<p data-block-id="abcd1234">乙段落'));
  assert.ok(ided.ok && [...ided.ids.values()].includes("abcd1234") && ided.changes.length === 0, "an id the file gives a unit the page knew none for");
  // Two units swapped, by their ids or, with none, by what they say (each the same unit, moved: the caret in one stays
  // in its words); the first taken out and one added at the end; an item of a list taken out and another added; a
  // section moved; a section's blocks taken out of it (it taken out); a paragraph put in a new section.
  const withIds = SOURCE.replace("<p>乙段落", '<p data-block-id="bbbb1111">乙段落').replace("<p>丙段落", '<p data-block-id="cccc2222">丙段落');
  assert.equal(moves(withIds, withIds.replace('<p data-block-id="bbbb1111">乙段落，写的是中间。</p>\n  <p data-block-id="cccc2222">丙段落，在后面。</p>', '<p data-block-id="cccc2222">丙段落，在后面。</p>\n  <p data-block-id="bbbb1111">乙段落，写的是中间。</p>')), "-0 +0 ~1 0w", "units with ids swapped");
  assert.equal(moves(SOURCE, SOURCE.replace("<p>乙段落，写的是中间。</p>\n  <p>丙段落，在后面。</p>", "<p>丙段落，在后面。</p>\n  <p>乙段落，写的是中间。</p>")), "-0 +0 ~1 0w", "id-less units swapped");
  const three = page("  <p>甲：第一段。</p>\n  <p>乙：第二段。</p>\n  <p>丙：第三段。</p>\n");
  assert.equal(moves(three, page("  <p>乙：第二段。</p>\n  <p>丙：第三段。</p>\n  <p>丁：新加的。</p>\n")), "-1 +1 ~0 0w", "the first taken out, one added at the end");
  assert.equal(moves(page("  <ul>\n    <li>一</li>\n    <li>二</li>\n  </ul>\n"), page("  <ul>\n    <li>二</li>\n    <li>三</li>\n  </ul>\n")), "-1 +1 ~0 0w", "an item taken out, another added");
  const sections = page("  <section class=\"doc-section\">\n    <h2>一章</h2>\n    <p>甲段。</p>\n  </section>\n  <section class=\"doc-section\">\n    <h2>二章</h2>\n    <p>乙段。</p>\n  </section>\n");
  const second = sections.slice(sections.indexOf("  <section class=\"doc-section\">\n    <h2>二章"), sections.lastIndexOf("</section>") + 10);
  assert.equal(moves(sections, sections.replace("\n" + second, "").replace("  <section class=\"doc-section\">\n    <h2>一章", second + "\n  <section class=\"doc-section\">\n    <h2>一章")), "-0 +0 ~1 0w", "a section moved");
  assert.equal(moves(sections, sections.replace("  <section class=\"doc-section\">\n    <h2>二章</h2>\n    <p>乙段。</p>\n  </section>", "  <h2>二章</h2>\n  <p>乙段。</p>")), "-1 +0 ~2 0w", "a section's blocks taken out of it, the section taken out");
  assert.equal(moves(three, three.replace("  <p>丙：第三段。</p>", "  <section class=\"doc-section\">\n    <p>丙：第三段。</p>\n  </section>")), "-0 +1 ~1 0w", "a paragraph put in a new section");
  assert.equal(moves(three, three.replace("<p>乙：第二段。</p>", "<p>乙：第二段（改）。</p>")), "-0 +0 ~0 1w", "words changed in place");
  // In a Sheet's panel (what a tab takes along: its hash has the panel's, its shell the panel's frame alone), words
  // changed, a paragraph put in, a section moved out of it to the top of the page: each explained (the tab too).
  const sheet = page(`  <p>开头一段。</p>
  <section class="doc-sheet-shell" data-doc-sheets="s">
    <div class="doc-sheet-tabs" role="tablist">
      <button class="doc-sheet-tab" type="button" data-sheet-tab="a">甲页</button>
      <button class="doc-sheet-tab" type="button" data-sheet-tab="b">乙页</button>
    </div>
    <div data-doc-sheet="a" role="tabpanel">
      <section class="doc-section">
        <h2>甲章</h2>
        <p>甲页的段落。</p>
      </section>
      <p>甲页的第二段。</p>
    </div>
    <div data-doc-sheet="b" role="tabpanel">
      <p>乙页的段落。</p>
    </div>
  </section>
`);
  assert.equal(moves(sheet, sheet.replace("甲页的段落。", "甲页的段落（改）。")), "-0 +0 ~0 1w", "words in a panel");
  assert.equal(moves(sheet, sheet.replace("<p>乙页的段落。</p>", "<p>乙页的段落。</p>\n      <p>乙页加的一段。</p>")), "-0 +1 ~0 0w", "a paragraph put in a panel");
  assert.equal(moves(sheet, sheet.replace("\n      <p>甲页的第二段。</p>", "")), "-1 +0 ~0 0w", "a paragraph taken out of a panel");
  const chapter = sheet.slice(sheet.indexOf("      <section class=\"doc-section\">"), sheet.indexOf("</section>") + 10);
  assert.equal(moves(sheet, sheet.replace(chapter + "\n", "").replace("  <p>开头一段。</p>", "  <p>开头一段。</p>\n" + chapter)), "-0 +0 ~1 0w", "a section moved out of a panel to the top");
  assert.ok(["shell", "unseen"].includes(plan(sheet, sheet.replace('data-doc-sheet="b" role="tabpanel"', 'data-doc-sheet="b" role="tabpanel" class="x"')).reason), "the panel's own markup (the tab's, in the Sheet): no pull");
  const empties = page("  <p></p>\n  <p></p>\n");
  assert.ok(plan(empties, page("  <p>AI 写的。</p>\n  <p></p>\n")).ok, "words written in one of two empty paragraphs: in place");
  // A unit whose hash changed with no words changed: what the shell does not tell, or now keeps (whitespace in a
  // <pre> no text block is, in an attribute's value): no plan.
  const pre = page('  <pre><code><span class="k">if</span> (x) {\n    run();\n}</code></pre>\n  <p>段落。</p>\n');
  assert.ok(!plan(pre, pre.replace("\n    run();", "\n run();")).ok, "a <pre> no text block is, indented otherwise");
  const note = page('  <div class="doc-callout" data-note="a b">\n    <p>提示。</p>\n  </div>\n');
  assert.ok(!plan(note, note.replace('data-note="a b"', 'data-note="a\n   b"')).ok, "whitespace in an attribute's value");
  assert.ok(!plan(note, note.replace('data-note="a b"', 'data-note="a\n   b"').replace("提示。", "提示（AI）。")).ok, "and so with words changed in it too");
}

// After a review (2026-11-13). What is replaced is the unit whose shell changed, never one around it that this change
// alone explains (a callout recoloured in a section: the callout, not the section; a class on an item of a sub-list:
// that item, not the lists around it); and many replaced at once cost a few passes of the plan, not one a unit (600
// paragraphs given a class each took 0.8 s, one unit unpaired a pass).
{
  const replacing = (source, next) => {
    const s = studio(source);
    const result = planPull(s.commits.pullView(), served(next).file, { patchable: () => true, replace: () => true });
    const named = (unit) => s.map.blocks.filter((block) => block.unit === unit).map((block) => block.inner).join("|") || s.map.units[unit].kind;
    return { result, replaced: [...(result.replaced ?? [])].map(named) };
  };
  const section = page(`  <section class="doc-section">\n    <h2>一章</h2>\n    <p>甲段。</p>\n    <div class="doc-callout">\n      <p>提示里的段落。</p>\n    </div>\n    <p>乙段。</p>\n  </section>\n  <p>后文。</p>\n`);
  const recoloured = replacing(section, section.replace('<div class="doc-callout">', '<div class="doc-callout" data-tone="warn">'));
  assert.ok(recoloured.result.ok, recoloured.result.reason);
  assert.deepEqual(recoloured.replaced, ["callout"], "the callout alone, not the section around it");
  const nested = page(`  <ul>\n    <li>一<ul><li>子一</li><li>子二</li></ul></li>\n    <li>二</li>\n  </ul>\n`);
  const classed = replacing(nested, nested.replace("<li>子二</li>", '<li class="doc-red">子二</li>'));
  assert.ok(classed.result.ok, classed.result.reason);
  assert.deepEqual(classed.replaced, ["子二"], "the item alone, not the lists around it");
  const many = page(Array.from({ length: 600 }, (_, i) => `  <p>第 ${i} 段，写的是一些话。</p>\n`).join(""));
  const view = studio(many).commits.pullView();
  const time = (next) => {
    const file = served(next).file;
    let best = Infinity;
    let result = null;
    for (let round = 0; round < 3; round++) {
      const start = performance.now();
      result = planPull(view, file, { patchable: () => true, replace: () => true });
      best = Math.min(best, performance.now() - start);
    }
    return { best, result };
  };
  const one = time(many.replace("第 4 段，", "第 4 段（AI），"));
  const all = time(many.replace(/<p>第 (\d+) 段/g, (_, i) => `<p class="doc-lead">第 ${i} 段`));
  assert.ok(one.result.ok && all.result.ok && all.result.replaced.size === 600, all.result.reason);
  assert.ok(all.best < 60 * one.best + 150, `600 replaced in ${Math.round(all.best)} ms, one pass ${Math.round(one.best)} ms: a pass a unit`);
}

// ---------- taken in, in jsdom: the pull, its commits after it ----------
// The page's served text, as the preview serves it (its map in #doc-edit-map), each served version kept as the
// server keeps it, the merge base of the commits named by it.
const page2 = (net) => {
  const { html, map } = instrument(net.file);
  net.served.set(hashOf(net.file), net.file);
  return html.replace("</body>", `<script type="application/json" id="doc-edit-map">${JSON.stringify({ slug: "demo", token: "token", ...map })}</script></body>`);
};
const pulls = (t) => createPull({ commits: () => t.commits, merged: (host) => (t.merged ??= []).push(host), after: () => {}, win: t.document.defaultView, read: async () => page2(t.net) });
const pullNow = (t, accept = () => true) => (t.pull ??= pulls(t))({ accept, ready: () => true, store: () => {} });
const type = (host, text) => {
  host.innerHTML = text;
};
// A page opened, those opened before it done with (their timers would run under the next one's).
const pages = [];
const opened = (...args) => {
  for (const done of pages.splice(0)) done.autosave.close();
  pages.push(open(...args));
  return pages[0];
};

play();
try {
  // Words changed in two paragraphs: shown in place, nothing left to commit; the page names its units by that
  // version from then on, and what it commits after goes in where it should.
  {
    const net = server(SOURCE);
    const t = opened(net);
    net.file = net.file.replace("甲段落，写的是开头。", "甲段落，写的是开头（AI）。").replace("丙段落，在后面。", "丙段落，在后面（AI）。");
    const result = await pullNow(t);
    assert.equal(result.outcome, "applied", result.reason);
    assert.equal(t.text("甲段落").textContent, "甲段落，写的是开头（AI）。");
    assert.equal(t.text("丙段落").textContent, "丙段落，在后面（AI）。");
    assert.equal(t.map.version, hashOf(net.file), "the version the page names its units by");
    assert.equal(t.commits.build(), null, "nothing to commit");
    assert.deepEqual(t.merged.map((host) => host.textContent).sort(), ["丙段落，在后面（AI）。", "甲段落，写的是开头（AI）。"].sort(), "their undo steps told");
    type(t.text("乙段落"), "乙段落（人），写的是中间。");
    t.change();
    await t.autosave.flush();
    assert.ok(net.file.includes("乙段落（人），写的是中间。") && net.file.includes("丙段落，在后面（AI）。") && net.file.includes("甲段落，写的是开头（AI）。"), "the reader's word next to the Agent's");
    type(t.text("丙段落"), "丙段落（人），在后面（AI）。");
    t.change();
    await t.autosave.flush();
    assert.ok(net.file.includes("丙段落（人），在后面（AI）。") && net.posts.at(-1).body.texts[0].block.before === "丙段落，在后面（AI）。", "a block pulled is edited from the file's words");
  }

  // The reader's unsaved words: that block keeps them (its commit merges), the others show the file's; the page
  // shows the file only once that commit went in and the page pulled again.
  {
    const net = server(SOURCE.replace("<p>乙段落", '<p data-block-id="bbbb1111">乙段落'));
    const t = opened(net);
    type(t.text("乙段落"), "乙段落（人），写的是中间。");
    net.file = net.file.replace("写的是中间。", "写的是中间部分。").replace("丙段落，在后面。", "丙段落，在后面（AI）。");
    const result = await pullNow(t);
    assert.equal(result.outcome, "partial", result.reason);
    assert.equal(t.text("乙段落").textContent, "乙段落（人），写的是中间。", "the reader's words stay");
    assert.equal(t.text("丙段落").textContent, "丙段落，在后面（AI）。");
    t.change();
    await t.autosave.flush();
    assert.ok(net.file.includes("乙段落（人），写的是中间部分。"), "its commit merges with the file's");
  }

  // A block the reader changed in a unit with no id: committed first (its commit names it by where it stood).
  {
    const net = server(SOURCE);
    const t = opened(net);
    type(t.text("乙段落"), "乙段落（人），写的是中间。");
    net.file = net.file.replace("丙段落，在后面。", "丙段落，在后面（AI）。");
    assert.equal((await pullNow(t)).outcome, "idless");
    assert.equal(t.text("丙段落").textContent, "丙段落，在后面。", "nothing shown");
  }

  // Units put in, taken out and moved where the page stands: a paragraph added after the one the reader is
  // typing in (their unsaved words and caret stay), one taken out, the section moved; nothing to commit after it but
  // the reader's words, which go in where they were typed; the undo of the reader's split before it takes out
  // nothing the Agent put in. A table put in, a formula: no pull (the kit draws them).
  {
    const source = page(`  <section class="doc-section">
    <h2>一章</h2>
    <p data-block-id="pppp0001">甲段落，写的是开头。</p>
    <p>乙段落，写的是中间。</p>
  </section>
  <section class="doc-section">
    <h2>二章</h2>
    <p>丙段落，在第二章。</p>
  </section>
`);
    const net = server(source);
    const t = opened(net);
    const history = createHistory({ changed: () => {}, beforeUndo: () => {}, blocks: () => ({ select() {}, clear() {} }), afterText: () => {}, mergedOff: (hosts) => t.commits.unseen(hosts) });
    t.pull = createPull({ commits: () => t.commits, merged: (host) => history.merged(host), rebased: (moved) => history.pulled(moved), after: () => {}, win: t.document.defaultView, read: async () => page2(t.net) });
    // The reader splits the first chapter's paragraph (a step of undo), saves it, then types in it without saving.
    const first = t.text("甲段落");
    let tail;
    history.struct([first.parentElement], [first], () => {
      tail = t.document.createElement("p");
      Object.assign(tail, { textContent: "读者拆出的段。" });
      tail.setAttribute("contenteditable", "true");
      tail.setAttribute("data-ge-new", "");
      first.after(tail);
      return { touched: [first, tail], focus: tail };
    });
    t.change(true);
    await t.autosave.flush();
    assert.ok(net.file.includes("读者拆出的段。"), "the reader's split is in the file");
    type(first, "甲段落（读者没存），写的是开头。");
    const second = net.file.slice(net.file.indexOf("  <section class=\"doc-section\">\n    <h2>二章"), net.file.lastIndexOf("</section>") + 10);
    net.file = net.file
      .replace(/(<p[^>]*>乙段落，写的是中间。<\/p>)/, "$1\n    <p>AI 加的段落。</p>") // (the reader's split named it, beside the paragraph it made)
      .replace("\n" + second, "")
      .replace(/ {2}<section class="doc-section"[^>]*>\n {4}<h2>一章/, (start) => `${second}\n${start}`); // (the reader's commit gave the first an id)
    const result = await t.pull({ accept: () => true, ready: () => true, store: () => {} });
    assert.equal(result.outcome, "applied", result.reason);
    const order = () => [...t.document.querySelectorAll("main [data-ge-block]")].map((node) => node.textContent);
    assert.deepEqual(order(), ["报告", "二章", "丙段落，在第二章。", "一章", "甲段落（读者没存），写的是开头。", "读者拆出的段。", "乙段落，写的是中间。", "AI 加的段落。"], "the section moved, the paragraph added, the reader's words where they are");
    assert.equal(t.text("甲段落"), first, "the reader's paragraph the same element");
    assert.equal(t.map.version, hashOf(net.file));
    const pending = t.commits.pendingOf(t.commits.collect());
    assert.ok(pending.units === 0 && [...pending.dirty].length === 1, "nothing to commit but the reader's unsaved words");
    t.change();
    await t.autosave.flush();
    assert.ok(net.file.includes("甲段落（读者没存），写的是开头。") && net.file.includes("AI 加的段落。") && net.file.indexOf("二章") < net.file.indexOf("一章"), "they go in where they were typed, the Agent's write kept");
    // Undo of the reader's split: the split-off paragraph goes, the Agent's stays.
    try { history.undo(); } catch {} // (the harness's selection has no ranges to put back)
    assert.ok(!t.text("读者拆出的段") && t.text("AI 加的段落"), "undo of the reader's split takes out none of the Agent's");
    t.change(true);
    await t.autosave.flush();
    assert.ok(!net.file.includes("读者拆出的段。") && net.file.includes("AI 加的段落。"), "and is saved so");
    // A paragraph taken out by the Agent.
    net.file = net.file.replace(/\n\s*<p[^>]*>乙段落，写的是中间。<\/p>/, "");
    assert.equal((await t.pull({ accept: () => true, ready: () => true, store: () => {} })).outcome, "applied");
    assert.ok(!t.text("乙段落"), "taken out");
    assert.equal(t.commits.build(), null, "nothing to commit");
    // A table put in, a formula in a paragraph's words: in place too, nothing to commit after either; the
    // head changed: no pull (the page shown anew).
    net.file = net.file.replace("<p>丙段落，在第二章。</p>", "<p>丙段落，在第二章。</p>\n    <div class=\"doc-table-wrap\"><table class=\"doc-table\"><thead><tr><th>名</th></tr></thead><tbody><tr><td>一</td></tr></tbody></table></div>");
    assert.equal((await t.pull({ accept: () => true, ready: () => true, store: () => {} })).outcome, "applied", "a table put in");
    assert.ok(t.document.querySelector("main .doc-table") && t.commits.build() === null, "shown, nothing to commit");
    net.file = net.file.replace("丙段落，在第二章。", "丙段落，在第二章 <span class=\"doc-math-inline\">\\(x^2\\)</span>。");
    assert.equal((await t.pull({ accept: () => true, ready: () => true, store: () => {} })).outcome, "applied", "a formula in its words");
    assert.ok(t.text("丙段落").querySelector("[data-ge-atom]") && t.commits.build() === null, "a chip, nothing to commit");
    net.file = net.file.replace("</head>", "<style>p { color: red; }</style></head>");
    assert.deepEqual(await t.pull({ accept: () => true, ready: () => true, store: () => {} }).then(({ outcome, reason }) => [outcome, reason]), ["structure", "frame"], "the head: no pull");
  }

  // The reader's split, the paragraph split off moved by the Agent within its section (to its top, after the next
  // one): its undo still takes it out (the step's own, the history's lists only repositioning it; once, every
  // element the pull placed in the step's container went into both lists, and the undo left it there).
  {
    const net = server(page("  <section class=\"doc-section\">\n    <p>甲段落。</p>\n    <p>乙段落。</p>\n  </section>\n"));
    const t = opened(net);
    const history = createHistory({ changed: () => {}, beforeUndo: () => {}, blocks: () => ({ select() {}, clear() {} }), afterText: () => {}, mergedOff: (hosts) => t.commits.unseen(hosts) });
    t.pull = createPull({ commits: () => t.commits, merged: (host) => history.merged(host), rebased: (moved) => history.pulled(moved), after: () => {}, win: t.document.defaultView, read: async () => page2(t.net) });
    const first = t.text("甲段落");
    let tail;
    history.struct([first.parentElement], [first], () => {
      tail = t.document.createElement("p");
      Object.assign(tail, { textContent: "拆出的段。" });
      tail.setAttribute("contenteditable", "true");
      tail.setAttribute("data-ge-new", "");
      first.after(tail);
      return { touched: [first, tail], focus: tail };
    });
    t.change(true);
    await t.autosave.flush();
    for (const [where, label] of [[/(<section[^>]*>)/, "to the top"], [/(<p[^>]*>乙段落。<\/p>)/, "after the next one"]]) {
      const now = net.file.match(/\n\s*<p[^>]*>拆出的段。<\/p>/)[0];
      net.file = net.file.replace(now, "").replace(where, `$1${now}`);
      assert.equal((await t.pull({ accept: () => true, ready: () => true, store: () => {} })).outcome, "applied", label);
    }
    const order = () => [...t.document.querySelectorAll("main section p")].map((node) => node.textContent);
    assert.deepEqual(order(), ["甲段落。", "乙段落。", "拆出的段。"], "moved where the file has it");
    try { history.undo(); } catch {} // (the harness's selection has no ranges to put back)
    assert.deepEqual(order(), ["甲段落。", "乙段落。"], "the undo of the split takes it out, wherever the Agent put it");
  }

  // A unit the file has another of in its place (a section the Agent made a callout of: not paired, taken out, a
  // callout put in) with a unit of the page's in it, moved into the one put in: the same element, put where the file
  // has it, though the section it stood in went off the page first (fuzz --structure seed 9205 found the element
  // looked up after that: "a unit with no element", the page shown anew). And the reader's paragraph put before a
  // section the file has after it, the section's words changed: the section paired all the same (the only one of
  // its kind left there), moved.
  {
    const net = server(page("  <section class=\"doc-section\">\n    <p>甲段落，在章里。</p>\n  </section>\n  <p>乙段落。</p>\n"));
    const t = opened(net);
    const kept = t.text("甲段落");
    net.file = net.file.replace("<section class=\"doc-section\">\n    <p>甲段落，在章里。</p>\n  </section>", "<div class=\"doc-callout\">\n    <p>甲段落，在章里。</p>\n  </div>");
    const result = await pullNow(t);
    assert.equal(result.outcome, "applied", result.reason);
    assert.equal(t.text("甲段落"), kept, "the same element");
    assert.ok(kept.closest(".doc-callout") && !t.document.querySelector("main section.doc-section"), "in the callout put in, the section gone");
    assert.equal(t.commits.build(), null, "nothing to commit");
  }
  {
    const sections = page("  <p data-block-id=\"rrrr0001\">读者的段落。</p>\n  <section class=\"doc-section\">\n    <p data-block-id=\"ssss0001\">章里的段落。</p>\n  </section>\n");
    const moved = sections.replace("  <p data-block-id=\"rrrr0001\">读者的段落。</p>\n", "").replace("<p data-block-id=\"ssss0001\">", "<p>AI 加的段落。</p>\n    <p data-block-id=\"ssss0001\">").replace("  </section>\n", "  </section>\n  <p data-block-id=\"rrrr0001\">读者的段落。</p>\n");
    const result = plan(sections, moved);
    assert.ok(result.ok && result.removed.size === 0 && result.inserted.size === 1, `the section paired: ${result.reason ?? `-${result.removed.size} +${result.inserted.size}`}`);
  }

  // The Agent takes out the paragraph the reader is typing in: committed first (the file says it has it no more: a
  // card), nothing pulled meanwhile; the one the caret is in, unchanged: later (the page behind meanwhile).
  {
    const net = server(SOURCE.replace("<p>乙段落", '<p data-block-id="bbbb1111">乙段落'));
    const t = opened(net);
    type(t.text("乙段落"), "乙段落（读者），写的是中间。");
    net.file = net.file.replace(/\n\s*<p[^>]*>乙段落，写的是中间。<\/p>/, "");
    assert.equal((await pullNow(t)).outcome, "busy", "its commit first");
    t.change();
    await t.autosave.flush();
    assert.ok(t.conflicts.some((entry) => entry.reason === "missing"), "a card: the file has the block no more");
  }
  {
    const net = server(SOURCE);
    const t = opened(net);
    const host = t.text("丙段落");
    const range = t.document.createRange();
    range.setStart(host.firstChild, 2);
    const selection = t.document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const real = globalThis.getSelection;
    globalThis.getSelection = () => t.document.getSelection();
    try {
      net.file = net.file.replace(/\n\s*<p>丙段落，在后面。<\/p>/, "");
      const held = await pullNow(t);
      assert.deepEqual([held.outcome, held.reason], ["held", "caret"], "the caret's block taken out: later");
      assert.ok(host.isConnected);
    } finally {
      globalThis.getSelection = real;
    }
  }

  // Twins (the same paragraph twice, no ids): after a pull the page names them by their places in the version
  // it pulled, not the one it opened on, where a paragraph the reader added since stands before them.
  {
    const net = server(SOURCE.replace("<p>丙段落，在后面。</p>", "<p>丙段落，在后面。</p>\n  <p>同样的一段。</p>\n  <p>同样的一段。</p>"));
    const t = opened(net);
    const host = t.text("甲段落");
    const made = host.ownerDocument.createElement("p");
    made.setAttribute("contenteditable", "true");
    made.setAttribute("data-ge-new", "");
    made.textContent = "读者加的段落。";
    host.closest("[data-ge-unit]").after(made);
    t.change(true);
    await t.autosave.flush();
    assert.ok(net.file.includes("读者加的段落。"), "the reader's paragraph is in");
    net.file = net.file.replace("丙段落，在后面。", "丙段落，在后面（AI）。");
    assert.equal((await pullNow(t)).outcome, "applied");
    const twins = [...t.document.querySelectorAll("[data-ge-block]")].filter((node) => node.textContent === "同样的一段。");
    type(twins[1], "同样的一段（第二个）。");
    t.change();
    await t.autosave.flush();
    assert.ok(/同样的一段。<\/p>\s*<p[^>]*>同样的一段（第二个）。/.test(net.file), "the second twin edited, not the first", net.file.match(/同样[^\n]*\n[^\n]*/)?.[0]);
  }

  // Through autosave: someone else's write heard, the revert check asked, the page takes it in place (no
  // reload), knows the file as that version (its announcement is its own), and shows anew a write that did more.
  {
    const net = server(SOURCE);
    const t = opened(net, undefined, { pull: (page) => pulls(page) });
    const reloads = browser.reloads;
    net.file = net.file.replace("乙段落，写的是中间。", "乙段落，写的是中间（AI）。");
    t.autosave.heard(hashOf(net.file));
    await advance(100);
    assert.equal(t.text("乙段落").textContent, "乙段落，写的是中间（AI）。", "shown in place");
    assert.ok(!t.autosave.state.foreign && browser.reloads === reloads, "the page shows the file, no reload");
    t.autosave.heard(hashOf(net.file)); // its announcement, late
    await advance(5000);
    assert.ok(!t.autosave.state.foreign && browser.reloads === reloads, `its announcement is no write of anyone else's: ${JSON.stringify({ state: t.autosave.state, reloads: browser.reloads - reloads })}`);
    net.file = net.file.replace("<p>丙段落，在后面。</p>", "<p>丙段落，在后面。</p>\n  <p>AI 加的段落。</p>");
    t.autosave.heard(hashOf(net.file));
    await advance(100);
    assert.ok(t.text("AI 加的段落") && !t.autosave.state.foreign && browser.reloads === reloads, "a paragraph added: in place too");
    net.file = net.file.replace("<p>丙段落，在后面。</p>", '<p>丙段落，在后面。</p>\n  <div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>名</th></tr></thead><tbody><tr><td>一</td></tr></tbody></table></div>');
    t.autosave.heard(hashOf(net.file));
    await advance(100);
    assert.ok(t.document.querySelector("main .doc-table") && browser.reloads === reloads, "a table added: in place too");
    net.file = net.file.replace("</head>", "<style>p { color: red; }</style></head>");
    t.autosave.heard(hashOf(net.file));
    // The writes before it, heard a moment earlier, were taken in: no burst (the user's 2026-11-14, a script added
    // after the paragraphs waiting for the Agent to stop writing), shown anew once the reader has paused.
    await advance(300);
    assert.equal(browser.reloads, reloads + 1, "the head changed: shown anew, by a reload, as before, and at once: writes the pull took in make no burst");
  }

  // A frame changed is no pull whichever version the page read (the Agent writing on, the file moved since the revert
  // check answered): shown anew at once, never asked again and again for a version that stays still between the two.
  {
    const net = server(SOURCE);
    const t = opened(net);
    net.file = net.file.replace("</head>", "<style>p { color: red; }</style></head>").replace("乙段落，写的是中间。", "乙段落，写的是中间（AI）。");
    const result = await pullNow(t, () => false);
    assert.deepEqual([result.outcome, result.reason], ["structure", "frame"], `a version the check did not answer about, its head changed: ${JSON.stringify(result)}`);
  }

  // A burst is of the writes the page shows anew: a second one heard within 15 s of the first (in this tab: the page
  // shown anew goes on with it) waits until the file is still, as before the pull; one heard while the page waits to
  // show a lone one anew (the reader typing) is shown by that load and makes no burst of it.
  {
    const kept = new Map();
    const real = Object.getOwnPropertyDescriptor(globalThis, "sessionStorage");
    Object.defineProperty(globalThis, "sessionStorage", { configurable: true, writable: true, value: { setItem: (key, value) => kept.set(key, String(value)), getItem: (key) => kept.get(key) ?? null, removeItem: (key) => kept.delete(key) } });
    try {
      const net = server(SOURCE);
      let t = opened(net, undefined, { pull: (page) => pulls(page) });
      let reloads = browser.reloads;
      net.file = net.file.replace("乙段落，写的是中间。", "乙段落，写的是中间（AI）。");
      t.autosave.heard(hashOf(net.file));
      await advance(100);
      assert.ok(t.text("乙段落").textContent.includes("（AI）") && browser.reloads === reloads, "words: taken in");
      t.changedAt = clock.now; // the reader types meanwhile
      net.file = net.file.replace("</head>", "<style>p { color: red; }</style></head>");
      t.autosave.heard(hashOf(net.file));
      await advance(500);
      net.file = net.file.replace("丙段落，在后面。", "丙段落，在后面（AI）。"); // heard while the page waits for the reader's pause
      t.autosave.heard(hashOf(net.file));
      await advance(1400);
      assert.equal(browser.reloads, reloads + 1, "a head changed after words taken in: shown anew once the reader paused (1.5 s), the write heard meanwhile with it");
      // The page shown anew (the tab's sessionStorage kept): another head heard 5 s after the first is one of a burst.
      await advance(3000);
      t = opened(net, undefined, { pull: (page) => pulls(page) });
      reloads = browser.reloads;
      net.file = net.file.replace("</head>", "<style>p { color: blue; }</style></head>");
      t.autosave.heard(hashOf(net.file));
      await advance(3000);
      assert.equal(browser.reloads, reloads, "another head 5 s after the first: one of a burst, the page waiting for the file to be still");
      await advance(6000);
      assert.equal(browser.reloads, reloads + 1, "then shown anew");
    } finally {
      if (real) Object.defineProperty(globalThis, "sessionStorage", real);
    }
  }

  // Undo of a structural step after a pull put someone else's words in a block it takes off the page (a paragraph
  // the reader made, the Agent's words pulled into it, the split undone; a deletion redone): the page goes on,
  // and the file asks (a card) instead of taking the Agent's words out with the reader's block, as on a page that
  // never showed them.
  for (const redo of [false, true]) {
    const net = server(SOURCE.replace("<p>乙段落", '<p data-block-id="bbbb1111">乙段落'));
    const t = opened(net, undefined, { pull: (page) => pulls(page) });
    const history = createHistory({ changed: () => {}, beforeUndo: () => {}, blocks: () => ({ select() {}, clear() {} }), afterText: () => {}, mergedOff: (hosts) => t.commits.unseen(hosts) });
    t.pull = createPull({ commits: () => t.commits, merged: (host) => history.merged(host), after: () => {}, win: t.document.defaultView, read: async () => page2(t.net) });
    const unit = t.text("乙段落").closest("[data-ge-unit]");
    let made;
    const step = () => history.struct([unit.parentElement], [t.text("乙段落")], () => {
      if (redo) {
        made = t.text("读者加的段落");
        made.remove();
        return { touched: [], focus: null };
      }
      made = t.document.createElement("p");
      Object.assign(made, { textContent: "读者加的段落。" });
      made.setAttribute("contenteditable", "true");
      made.setAttribute("data-ge-new", "");
      unit.after(made);
      return { touched: [made], focus: made };
    });
    const quietly = (run) => { try { run(); } catch {} }; // (the harness's selection has no ranges to put back)
    if (redo) {
      made = t.document.createElement("p");
      Object.assign(made, { textContent: "读者加的段落。" });
      made.setAttribute("contenteditable", "true");
      made.setAttribute("data-ge-new", "");
      unit.after(made);
      t.change(true);
      await t.autosave.flush();
      step(); // the reader deletes it
      t.change(true);
      await t.autosave.flush();
      quietly(() => history.undo()); // and puts it back
    } else step();
    t.change(true);
    await t.autosave.flush();
    assert.ok(net.file.includes("读者加的段落。"), "the reader's paragraph is in the file");
    net.file = net.file.replace("读者加的段落。", "读者加的段落。AI 补充的话。");
    t.autosave.heard(hashOf(net.file));
    await advance(100);
    const shown = t.text("读者加的段落");
    assert.equal(shown.textContent, "读者加的段落。AI 补充的话。", "the Agent's words pulled into it");
    quietly(() => (redo ? history.redo() : history.undo()));
    assert.ok(!shown.isConnected, `${redo ? "redo" : "undo"} goes on: the paragraph off the page`);
    t.change(true);
    await t.autosave.flush();
    assert.ok(t.conflicts.some((entry) => entry.reason === "changed") && net.file.includes("AI 补充的话"), `${redo ? "redo of the deletion" : "undo of the split"}: a card, the file keeps the Agent's words`);
  }

  // An Agent writing back a version the page took in once it knows another: a write of theirs at once, not the
  // page's own for a while (its edit undone after the page pulled it; what it read before the reader's commit).
  {
    const net = server(SOURCE);
    const t = opened(net, undefined, { pull: (page) => pulls(page) });
    const V2 = SOURCE.replace("乙段落，写的是中间。", "乙段落，写的是中间（AI 第一次）。");
    const V3 = V2.replace("丙段落，在后面。", "丙段落，在后面（AI 第二次）。");
    for (const version of [V2, V3, V2]) {
      net.file = version;
      t.autosave.heard(hashOf(net.file));
      await advance(1500);
    }
    assert.ok(t.text("丙段落").textContent === "丙段落，在后面。" && !t.autosave.state.foreign, "V2 written back after V3: the page shows it");
  }
  {
    const net = server(SOURCE.replace("<p>乙段落", '<p data-block-id="bbbb1111">乙段落'));
    const t = opened(net, undefined, { pull: (page) => pulls(page) });
    const V2 = net.file.replace("丙段落，在后面。", "丙段落，在后面（AI）。");
    net.file = V2;
    t.autosave.heard(hashOf(net.file));
    await advance(100);
    type(t.text("乙段落"), "乙段落（读者），写的是中间。");
    t.change();
    await t.autosave.flush();
    await advance(500);
    net.file = V2;
    t.autosave.heard(hashOf(net.file));
    await advance(5000);
    assert.equal(t.reverts.length, 1, "V2 written back over the reader's commit: a card, though the page once pulled V2");
  }

  // A pull that leaves the page holding something to commit (the safety net: here a block changed behind its back):
  // the page is shown anew from the crash buffer written right before it, and the next page sends the reader's
  // unsaved words into the file.
  {
    const net = server(SOURCE.replace("<p>乙段落", '<p data-block-id="bbbb1111">乙段落').replace("<p>丙段落", '<p data-block-id="cccc2222">丙段落'));
    const local = storage();
    const t = opened(net, local, { pull: (page) => createPull({
      commits: () => ({ ...page.commits, pulled: (options) => {
        const result = page.commits.pulled(options);
        page.text("甲段落").textContent = "甲段落，改坏了。"; // what the pull should never do
        return result;
      } }),
      merged: () => {}, after: () => {}, win: page.document.defaultView, read: async () => page2(page.net),
    }) });
    const reloads = browser.reloads;
    const said = console.error;
    console.error = () => {}; // what the page says on its console as it bails, expected here
    type(t.text("乙段落"), "乙段落（读者没存的字），写的是中间。");
    t.change();
    net.file = net.file.replace("丙段落，在后面。", "丙段落，在后面（AI）。");
    t.autosave.heard(hashOf(net.file));
    await advance(100);
    console.error = said;
    assert.equal(browser.reloads, reloads + 1, "shown anew");
    assert.ok((local.get(pendingKey("demo", "tab")) ?? "").includes("读者没存的字"), "the crash buffer holds the reader's words");
    const next = await recover({ map: { slug: "demo", token: "token", version: hashOf(net.file) }, storage: local, keys: [pendingKey("demo", "tab")] });
    assert.ok(next.sent && net.file.includes("乙段落（读者没存的字），写的是中间。") && net.file.includes("丙段落，在后面（AI）。") && !net.file.includes("改坏了"), "the next page sends them, next to the Agent's words");
  }

  // A text the page committed, which a write puts back as it was (an Agent writing what it read before): no
  // pull shows it; the reader decides (the revert check, asked first).
  {
    const net = server(SOURCE.replace("<p>乙段落", '<p data-block-id="bbbb1111">乙段落'));
    const t = opened(net, undefined, { pull: (page) => pulls(page) });
    const stale = net.file;
    type(t.text("乙段落"), "乙段落（人），写的是中间。");
    t.change();
    await t.autosave.flush();
    net.file = stale.replace("丙段落，在后面。", "丙段落，在后面（AI）。");
    t.autosave.heard(hashOf(net.file));
    await advance(100);
    assert.equal(t.reverts.length, 1, "a card for the words put back");
    assert.equal(t.text("乙段落").textContent, "乙段落（人），写的是中间。", "the reader's words stay on the page");
    assert.equal(t.text("丙段落").textContent, "丙段落，在后面。", "and nothing is pulled while the reader decides");
  }

  // After a review (2026-11-13), each case a probe that reproduced. Wherever the pull cannot be sure, what a page
  // shown anew does: a card, or the page loaded anew.

  // 1. A unit the page knows by an id the file no longer has never pairs by where it stands alone (one to one in a gap,
  // the only container of its kind left): the Agent took the reader's section out and put an unrelated one at the end,
  // or wrote the steps back swapped and edited without their ids. The reader's unsaved words: committed first, and the
  // file, having their paragraph no more, says so (a card), as without the pull; never merged into the Agent's words.
  {
    const sectioned = page(`  <section class="doc-section" data-block-id="ssss0001">
      <h2 data-block-id="hhhh0001">草稿笔记</h2>
      <p data-block-id="pppp0001">这一节记的是会议上提到的几件事情，还要再整理。</p>
    </section>
    <p data-block-id="aaaa0001">正文第一段。</p>
    <p data-block-id="bbbb0001">正文第二段。</p>
  `);
    const replaced = page(`  <p data-block-id="aaaa0001">正文第一段。</p>
    <p data-block-id="bbbb0001">正文第二段。</p>
    <section class="doc-section">
      <h2>总结</h2>
      <p>这一节总结的是整篇文档提到的几件事情，供大家参考。</p>
    </section>
  `);
    const steps = page("  <p data-block-id=\"pppp0001\">第一步：打开设置页面，然后点击保存。</p>\n  <p data-block-id=\"pppp0002\">第二步：打开设置页面，然后点击导出。</p>\n");
    const swapped = page("  <p>第二步：打开设置页面，然后点击导出按钮。</p>\n  <p>第一步：打开设置页面，然后点击保存按钮。</p>\n");
    const counts = (result) => (result.ok ? `-${result.removed.size} +${result.inserted.size} ~${result.moved.size} ${result.units.size}=` : result.reason);
    assert.equal(counts(plan(sectioned, replaced)), "-3 +3 ~0 2=", "the section and what it held taken out, the Agent's put in: none paired by place");
    assert.equal(counts(plan(steps, swapped)), "-2 +2 ~0 0=", "steps known by their ids, the ids lost and both edited: taken out and put in");
    for (const [before, after, words, typed] of [[sectioned, replaced, "这一节记的是会议", "这一节记的是会议上提到的几件事情（读者补充：周五前），还要再整理。"], [steps, swapped, "第一步", "第一步：打开系统设置页面，然后点击保存。"]]) {
      for (const pulling of [true, false]) {
        const net = server(before);
        const t = opened(net);
        t.text(words).innerHTML = typed; // typed, not saved
        net.file = after;
        if (pulling) assert.equal((await pullNow(t)).outcome, "busy", "committed first");
        t.change();
        await t.autosave.flush();
        assert.deepEqual(t.conflicts.map((entry) => entry.reason), ["missing"], `a card, ${pulling ? "with" : "without"} the pull`);
        assert.equal(t.conflicts[0].mine, typed, "the card holds the reader's words");
        assert.equal(net.file, after, "nothing of theirs written into the Agent's");
      }
    }
    // Through the autosave, the reader having saved words there before: a card, no page loaded anew.
    {
      const net = server(sectioned);
      const t = opened(net, undefined, { pull: (one) => pulls(one) });
      const host = t.text("这一节记的是会议");
      host.innerHTML = "这一节记的是会议上提到的几件事情，还要再整理（已保存的补充）。";
      t.change();
      await t.autosave.flush();
      host.innerHTML = "这一节记的是会议上提到的几件事情（读者补充：周五前），还要再整理（已保存的补充）。";
      t.change();
      net.file = net.file.replace(/ {2}<section[\s\S]*?<\/section>\n/, "").replace("</main>", "  <section class=\"doc-section\">\n    <h2>总结</h2>\n    <p>这一节总结的是整篇文档提到的几件事情，供大家参考。</p>\n  </section>\n</main>");
      const after = net.file;
      const reloads = browser.reloads;
      t.autosave.heard(hashOf(net.file));
      await advance(10000);
      assert.deepEqual([browser.reloads - reloads, t.conflicts.map((entry) => entry.reason)], [0, ["missing"]], "a card, no reload");
      assert.equal(net.file, after, "the Agent's paragraph untouched");
      assert.ok(t.text("读者补充"), "the reader's words still on the page");
    }
  }

  // 2. What the page committed in a block the write takes out is asked of as a page shown anew asks of it: the reader
  // saved a paragraph, the Agent took it out, then wrote it back as it was before the reader's edit: a card.
  {
    const net = server(page("  <p data-block-id=\"pppp0001\">甲段落，写的是开头。</p>\n  <p data-block-id=\"qqqq0001\">乙段落，在后面。</p>\n"));
    const before = net.file;
    const t = opened(net, undefined, { pull: (one) => pulls(one) });
    t.text("甲段落").innerHTML = "甲段落（读者改过），写的是开头。";
    t.change();
    await t.autosave.flush();
    net.file = net.file.replace(/\n\s*<p data-block-id="pppp0001">[^<]*<\/p>/, "");
    const reloads = browser.reloads;
    t.autosave.heard(hashOf(net.file));
    await advance(20000);
    assert.ok(!t.text("甲段落") && browser.reloads === reloads, "taken out in place");
    net.file = before;
    t.autosave.heard(hashOf(net.file));
    await advance(20000);
    assert.equal(t.reverts.length, 1, "the write putting it back as it was: a card");
  }

  // 3 and 4. What the pull puts in is what a load makes of the same file, element for element (its marks, what is
  // editable, the frames: none on a section, a list or a callout and their words; a nested list read-only in its item,
  // the item keeping its line), for each kind it puts in: a paragraph, a heading, a list with nested items, sub-items put
  // under an item the page has (and taken out from under one), a section, a callout, a quote, a flowchart, columns; and
  // a table with its scope line and one with a row added, a code block and one whose code changed, a display
  // formula and one in a paragraph's words, a picture and one whose source changed, a card, a callout recoloured, a
  // detail block, a Sheet and a Sheet's tab renamed (what is replaced: taken out and the file's put in, whole).
  {
    // A code block's text kept by its component (as components/code/page.mjs prepare does, which needs a page; its
    // lines drawn anew by the kit as a page loads, code.js, the served mark gone with them): the same stand-in for a
    // load and for what the pull asks of it, by the page's numbers.
    const codeIn = (document) => ({ code: { prepare(block) {
      const pre = document.querySelector(`[data-ge-unit="${block.unit}"]`)?.querySelector(CODE.pre);
      if (!pre) return;
      pre.setAttribute("data-ge-code", String(block.id));
      for (const node of [pre, ...pre.querySelectorAll("[data-ge-block]")]) node.removeAttribute("data-ge-block");
    } } });
    const loaded = (source) => {
      const { html, map } = instrument(source);
      const { document } = new JSDOM(html).window;
      const nodes = new Map();
      for (const block of map.blocks) {
        if (HOSTS[block.kind]?.closed) {
          codeIn(document).code.prepare(block);
          continue;
        }
        const node = document.querySelector(`[data-ge-block="${block.id}"]`);
        if (!node) continue;
        if (HOSTS[block.kind]?.tex) node.setAttribute("contenteditable", "true"); // (as enter() has it; with no component's page here, rebuilt as any)
        else if (!matchesSource(node, block.inner)) continue;
        else editableAhead(node, block);
        nodes.set(block, node);
      }
      const baselines = new Map();
      const hosts = [];
      for (const [block, node] of nodes) {
        baselines.set(block.id, prepareBlock(node, block));
        hosts.push(node.hasAttribute("data-ge-block") ? node : node.firstElementChild); // a Sheet tab's name span
      }
      let layout = captureLayout(document, map);
      markFrames(document, layout, hosts);
      createCommits({ root: document, map, baselines, units: new Map(), boxes: new Map(), getLayout: () => layout, setLayout: (next) => (layout = next) }).marks();
      return document;
    };
    const NUMBERED = new Set(["data-ge-unit", "data-ge-block", "data-ge-box", "data-ge-id", "data-ge-atom", "data-ge-code", "data-ge-lead"]);
    const lines = (node, depth = 0) => [
      `${"  ".repeat(depth)}<${node.localName} ${[...node.attributes].map((a) => (NUMBERED.has(a.name) ? a.name : `${a.name}=${JSON.stringify(a.value)}`)).sort().join(" ")}>`,
      ...[...node.childNodes].flatMap((child) => (child.nodeType === 1 ? lines(child, depth + 1) : child.nodeType === 3 && child.textContent.trim() ? [`${"  ".repeat(depth + 1)}"${child.textContent.trim()}"`] : [])),
    ];
    const body = (document) => [...document.querySelector("main").children].filter((node) => !node.matches("header")).flatMap((node) => lines(node));
    const list = (sub) => `  <ul>\n    <li>条目一${sub}</li>\n    <li>条目二</li>\n  </ul>\n`;
    const kinds = {
      paragraph: ["", "  <p>AI 加的段落。</p>\n"],
      heading: ["", "  <h2>AI 的标题</h2>\n"],
      "nested list": ["", list("<ul><li>子条目甲</li><li>子条目乙</li></ul>")],
      "sub-items under an item": [list(""), list("<ul><li>子条目甲</li></ul>")],
      "sub-items taken out": [list("<ul><li>子条目甲</li></ul>"), list("")],
      section: ["", "  <section class=\"doc-section\">\n    <h2>AI 的章</h2>\n    <p>章里的段落。</p>\n  </section>\n"],
      callout: ["", "  <div class=\"doc-callout\">\n    <p>提示里的段落。</p>\n  </div>\n"],
      quote: ["", "  <blockquote><p>引用。</p></blockquote>\n"],
      flowchart: ["", "  <ol class=\"doc-flow\" data-direction=\"row\">\n    <li><p><strong>甲</strong></p><p>说明</p></li>\n    <li><p><strong>乙</strong></p></li>\n  </ol>\n"],
      columns: ["", "  <div class=\"doc-columns\"><div class=\"doc-column\"><p>左栏。</p></div><div class=\"doc-column\"><p>右栏。</p></div></div>\n"],
      // What the kit or a component draws, put in or put in place of the page's whole.
      "table with its scope line": ["", "  <div class=\"doc-table-meta\">表一：销售额</div>\n  <div class=\"doc-table-wrap\"><table class=\"doc-table\"><thead><tr><th>月</th><th>额</th></tr></thead><tbody><tr><td>一月</td><td>3</td></tr></tbody></table></div>\n"],
      "a row added to a table": ["  <div class=\"doc-table-wrap\"><table class=\"doc-table\"><thead><tr><th>月</th></tr></thead><tbody><tr><td>一月</td></tr></tbody></table></div>\n", "  <div class=\"doc-table-wrap\"><table class=\"doc-table\"><thead><tr><th>月</th></tr></thead><tbody><tr><td>一月</td></tr><tr><td>二月</td></tr></tbody></table></div>\n"],
      "code block": ["", "  <div class=\"doc-code\"><div class=\"doc-code-title\">a.js</div><pre><code>const a = 1;</code></pre></div>\n"],
      "a code block's code changed": ["  <div class=\"doc-code\"><div class=\"doc-code-title\">a.js</div><pre><code>const a = 1;</code></pre></div>\n", "  <div class=\"doc-code\"><div class=\"doc-code-title\">a.js</div><pre><code>const a = 2;</code></pre></div>\n"],
      "display formula": ["", "  <div class=\"doc-math-block\">\\[x^2 + y^2\\]</div>\n"],
      "formula in words": ["", "  <p>有公式 <span class=\"doc-math-inline\">\\(x\\)</span> 的段落。</p>\n"],
      picture: ["", "  <figure class=\"doc-image\"><img src=\"assets/a.png\" alt=\"图\"><figcaption>图注</figcaption></figure>\n"],
      "a picture's source changed": ["  <figure class=\"doc-image\"><img src=\"assets/a.png\" alt=\"图\"><figcaption>图注</figcaption></figure>\n", "  <figure class=\"doc-image\"><img src=\"assets/b.png\" alt=\"图\"><figcaption>图注</figcaption></figure>\n"],
      card: ["", "  <figure class=\"doc-figure\"><h3>卡</h3><div data-doc-chart=\"strip\"><script type=\"application/json\">[1]</script></div></figure>\n"],
      "callout recoloured": ["  <div class=\"doc-callout\">\n    <p>提示里的段落。</p>\n  </div>\n", "  <div class=\"doc-callout\" data-tone=\"warn\">\n    <p>提示里的段落。</p>\n  </div>\n"],
      "detail block": ["", "  <details class=\"doc-details\"><summary><span class=\"doc-details-summary-label\">展开看</span></summary><div class=\"doc-details-content\"><p>折叠里的话。</p></div></details>\n"],
      Sheet: ["", "  <section class=\"doc-sheet-shell\" data-doc-sheets=\"s\">\n    <div class=\"doc-sheet-tabs\" role=\"tablist\"><button class=\"doc-sheet-tab\" type=\"button\" data-sheet-tab=\"a\">甲页</button></div>\n    <div data-doc-sheet=\"a\" role=\"tabpanel\"><p>甲页的段落。</p></div>\n  </section>\n"],
      "a Sheet tab renamed": ["  <section class=\"doc-sheet-shell\" data-doc-sheets=\"s\">\n    <div class=\"doc-sheet-tabs\" role=\"tablist\"><button class=\"doc-sheet-tab\" type=\"button\" data-sheet-tab=\"a\">甲页</button></div>\n    <div data-doc-sheet=\"a\" role=\"tabpanel\"><p>甲页的段落。</p></div>\n  </section>\n", "  <section class=\"doc-sheet-shell\" data-doc-sheets=\"s\">\n    <div class=\"doc-sheet-tabs\" role=\"tablist\"><button class=\"doc-sheet-tab\" type=\"button\" data-sheet-tab=\"a\">甲页（改）</button></div>\n    <div data-doc-sheet=\"a\" role=\"tabpanel\"><p>甲页的段落。</p></div>\n  </section>\n"],
    };
    for (const [kind, [was, now]] of Object.entries(kinds)) {
      const after = page(`  <p>开头一段。</p>\n${now}`);
      const net = server(page(`  <p>开头一段。</p>\n${was}`));
      const t = opened(net);
      net.file = after;
      markFrames(t.document, captureLayout(t.document, t.map), [...t.document.querySelectorAll("[data-ge-block]")]); // the page opened as a load leaves it (the harness opens without its frames)
      connectPages(codeIn(t.document));
      const result = await pullNow(t).finally(() => connectPages({}));
      assert.equal(result.outcome, "applied", `${kind}: ${result.reason}`);
      assert.deepEqual(body(t.document), body(loaded(after)), `${kind}: as a load makes it`);
    }

    // A tab area as an Agent writes it (plain sections under data-doc-sheets, the page served it as the kit's: shownSource),
    // put in on a page served with the kit's tags as the server serves them (withKitTags: those its blocks need). On a
    // page that has a Sheet already, and so sheets.js, in place as a load makes it; on one with none, served without
    // sheets.js, what the pull would put in the kit would never draw (every panel shown, no tab chosen: the user's
    // 2026-11-14), and a load would load it: no pull (`kit`), the page shown anew. The kit's files as each page has them.
    const AREA = "  <section class=\"doc-section\">\n    <h2>拆分</h2>\n    <section data-doc-sheets=\"breakdown\">\n      <section><h3>By issue type</h3><p>按类型。</p></section>\n      <section><h3>By channel</h3><p>按渠道。</p></section>\n    </section>\n  </section>\n";
    const OTHER_AREA = "  <section class=\"doc-sheet-shell\" data-doc-sheets=\"s\">\n    <div class=\"doc-sheet-tabs\" role=\"tablist\"><button class=\"doc-sheet-tab\" type=\"button\" data-sheet-tab=\"a\">甲页</button></div>\n    <div data-doc-sheet=\"a\" role=\"tabpanel\"><p>甲页的段落。</p></div>\n  </section>\n";
    const kitted = (net) => {
      const { html, map } = instrument(net.file);
      net.served.set(hashOf(net.file), net.file);
      return withKitTags(html).replace("</body>", `<script type="application/json" id="doc-edit-map">${JSON.stringify({ slug: "demo", token: "token", ...map })}</script></body>`);
    };
    for (const [label, start, outcome] of [["a page with a Sheet already", OTHER_AREA, "applied"], ["a page with none", "", "structure"]]) {
      const was = shownSource(page(`  <p>开头一段。</p>\n${start}`)).text;
      const after = shownSource(page(`  <p>开头一段。</p>\n${start}${AREA}`)).text;
      assert.ok(after.includes("doc-sheet-shell") && after.includes("data-sheet-tab"), "the Agent's tab area as the page is served it");
      const net = server(was);
      const t = opened(net);
      const own = new JSDOM(kitted(net)).window.document;
      for (const node of own.querySelectorAll("[data-doc-kit], [data-doc-vendor]")) t.document.head.append(t.document.importNode(node, true));
      assert.equal(Boolean(t.document.querySelector('[data-doc-kit="sheets"]')), Boolean(start), `${label}: served ${start ? "with" : "without"} sheets.js`);
      net.file = after;
      markFrames(t.document, captureLayout(t.document, t.map), [...t.document.querySelectorAll("[data-ge-block]")]);
      t.pull = createPull({ commits: () => t.commits, merged: () => {}, after: () => {}, win: t.document.defaultView, read: async () => kitted(t.net) });
      const result = await pullNow(t);
      assert.deepEqual([result.outcome, result.reason ?? null], [outcome, outcome === "structure" ? "kit" : null], `${label}: ${JSON.stringify(result)}`);
      if (outcome === "applied") assert.deepEqual(body(t.document), body(loaded(after)), `${label}: as a load makes it`);
      else assert.ok(!t.document.querySelector('[data-doc-sheets="breakdown"]'), `${label}: nothing put in`);
    }
    assert.deepEqual(kitMissing(new JSDOM('<script src="/kit/code.js?v=1" data-doc-kit="code"></script><script src="/kit/sheets.js?v=1" data-doc-kit="sheets"></script><link rel="stylesheet" href="/vendor/katex/katex.min.css?v=2" data-doc-vendor="katex-styles">').window.document,
      new JSDOM('<script src="/kit/code.js" data-doc-dev></script><link rel="stylesheet" href="/vendor/katex/katex.min.css">').window.document), ["sheets"], "a kit file the editor loaded since, by its address, is the page's");
  }

  // 5 and 8c. The reader's split, the paragraph split off moved by the Agent into another section: the split's undo
  // refused (stale, said), nothing put back twice. A step of words in a paragraph the Agent then takes out: refused too,
  // not spent on a block off the page.
  {
    const net = server(page(`  <section class="doc-section">
      <h2>一章</h2>
      <p>甲段落前半。甲段落后半。</p>
    </section>
    <section class="doc-section">
      <h2>二章</h2>
      <p>乙段落。</p>
    </section>
  `));
    const t = opened(net);
    const refusals = [];
    const history = createHistory({ changed: () => {}, beforeUndo: () => {}, blocks: () => ({ select() {}, clear() {} }), afterText: () => {}, mergedOff: (hosts) => t.commits.unseen(hosts), refuse: (why) => refusals.push(why) });
    t.pull = createPull({ commits: () => t.commits, merged: (host) => history.merged(host), rebased: (moved) => history.pulled(moved), after: () => {}, win: t.document.defaultView, read: async () => page2(t.net) });
    const first = t.text("甲段落");
    history.struct([first.parentElement], [first], () => {
      first.textContent = "甲段落前半。";
      const tail = t.document.createElement("p");
      tail.textContent = "甲段落后半。";
      tail.setAttribute("contenteditable", "true");
      tail.setAttribute("data-ge-new", "");
      first.after(tail);
      return { touched: [first, tail], focus: tail };
    });
    t.change(true);
    await t.autosave.flush();
    const line = net.file.match(/\n\s*<p[^>]*>甲段落后半。<\/p>/)[0];
    net.file = net.file.replace(line, "").replace(/(<p[^>]*>乙段落。<\/p>)/, `$1${line}`);
    assert.equal((await t.pull({ accept: () => true, ready: () => true, store: () => {} })).outcome, "applied");
    const words = () => [...t.document.querySelectorAll("main p")].map((node) => node.textContent);
    try { history.undo(); } catch {} // (the harness's selection has no ranges to put back)
    assert.deepEqual([refusals, words()], [["pulled"], ["甲段落前半。", "乙段落。", "甲段落后半。"]], "refused, said, nothing twice");
    const second = t.text("乙段落");
    const was = second.innerHTML;
    second.innerHTML = "乙段落（读者）。";
    history.recordStep(second, was);
    t.change(true);
    await t.autosave.flush();
    net.file = net.file.replace(/\n\s*<p[^>]*>乙段落（读者）。<\/p>/, "");
    assert.equal((await t.pull({ accept: () => true, ready: () => true, store: () => {} })).outcome, "applied");
    try { history.undo(); } catch {}
    assert.deepEqual(refusals, ["pulled", "pulled"], "the step of words in the paragraph taken out: refused, said");
  }

  // 6. A unit put in at a box's top goes before the scope line that leads its first unit (a table's), not between them.
  {
    const table = "<div class=\"doc-table-meta\">表一：销售额</div>\n    <div class=\"doc-table-wrap\"><table class=\"doc-table\"><thead><tr><th>月</th></tr></thead><tbody><tr><td>一月</td></tr></tbody></table></div>";
    const before = page(`  <div class="doc-callout">\n    ${table}\n    <p>提示里的段落。</p>\n  </div>\n  <p>正文。</p>\n`);
    const net = server(before);
    const t = opened(net);
    net.file = before.replace("<div class=\"doc-callout\">\n    ", "<div class=\"doc-callout\">\n    <p>AI 加在最前面的段落。</p>\n    ");
    assert.equal((await pullNow(t)).outcome, "applied");
    assert.deepEqual([...t.document.querySelector(".doc-callout").children].map((node) => node.className || node.localName), ["p", "doc-table-meta", "doc-table-wrap", "p"], "before the scope line");
  }

  // 7. A box of thousands of units, one moved from its top to its middle: more to pair than a load costs, no plan (the
  // page shown anew); what both have alike at their start and end paired as it stands, at once.
  {
    const paragraphs = (count) => Array.from({ length: count }, (_, index) => `  <p>第 ${index} 段，写了一些字。</p>`);
    const big = paragraphs(1500);
    const started = Date.now();
    assert.equal(plan(page(big.join("\n") + "\n"), page([...big.slice(1, 750), big[0], ...big.slice(750)].join("\n") + "\n")).reason, "large", `past ${COMMON_CELLS} cells: no plan`);
    const small = paragraphs(300);
    const appended = plan(page(small.join("\n") + "\n"), page([...small, "  <p>AI 加的段落。</p>"].join("\n") + "\n"));
    assert.ok(appended.ok && appended.inserted.size === 1 && appended.units.size === 300, "one appended to three hundred: paired as they stand");
    assert.ok(Date.now() - started < 3000, "and soon");
  }

  // 8b. The caret in a paragraph the Agent took out, the reader just at it: held (the page behind), then, once the
  // reader and the file have been still as long as a burst of writes waits for, the page shown anew as before: no
  // write held back for as long as the caret stays there.
  {
    const net = server(SOURCE);
    const t = opened(net, undefined, { pull: (one) => pulls(one) });
    const host = t.text("丙段落");
    const range = t.document.createRange();
    range.setStart(host.firstChild, 2);
    t.document.getSelection().removeAllRanges();
    t.document.getSelection().addRange(range);
    t.changedAt = clock.now; // the reader was at it a moment ago
    net.file = net.file.replace(/\n\s*<p>丙段落，在后面。<\/p>/, "");
    const reloads = browser.reloads;
    t.autosave.heard(hashOf(net.file));
    await advance(600);
    assert.ok(browser.reloads === reloads && t.text("丙段落"), "held while the reader is at it");
    await advance(20000);
    assert.equal(browser.reloads - reloads, 1, "then shown anew, as before the pull");
  }

  // 8a. A paragraph put in between the ends of a selection that runs across blocks: later (held), as a move is.
  {
    const net = server(page("  <p>甲段落，写的是开头。</p>\n  <p>乙段落，写的是中间。</p>\n"));
    const t = opened(net);
    const [a, b] = [t.text("甲段落"), t.text("乙段落")];
    const range = t.document.createRange();
    range.setStart(a.firstChild, 2);
    range.setEnd(b.firstChild, 2);
    const selection = t.document.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    const real = globalThis.getSelection;
    globalThis.getSelection = () => t.document.getSelection();
    try {
      net.file = net.file.replace("<p>乙段落", "<p>AI 加的段落。</p>\n  <p>乙段落");
      assert.deepEqual(await pullNow(t).then(({ outcome, reason }) => [outcome, reason]), ["held", "selection"], "between its ends: later");
      net.file = net.file.replace("<p>AI 加的段落。</p>\n  ", "").replace("</main>", "  <p>AI 加在最后。</p>\n</main>");
      assert.equal((await pullNow(t)).outcome, "applied", "past them: in place");
    } finally {
      globalThis.getSelection = real;
    }
  }
  // 用文件里的 on a card about words: the file's words shown where the page stands (the block the
  // reader's again to write in), no reload. A write the reader asked for (撤回 of the Agent's changes, showOwn):
  // taken in where the page stands as a write of the page's own, no reload.
  {
    const net = server(SOURCE.replace("<p>乙段落", '<p data-block-id="bbbb1111">乙段落'));
    const t = opened(net, undefined, { pull: (one) => pulls(one) });
    const host = t.text("乙段落");
    host.innerHTML = "乙段落，写的是中间（读者）。";
    net.file = net.file.replace("乙段落，写的是中间。", "乙段落，写的是中间（AI）。");
    t.change();
    await t.autosave.flush();
    const card = t.conflicts.find((entry) => entry.reason === "changed");
    assert.ok(card, "a card: both changed the same words");
    const reloads = browser.reloads;
    t.commits.resolve(card.key, "discard");
    t.autosave.showFile();
    await advance(3000);
    assert.equal(t.text("乙段落").textContent, "乙段落，写的是中间（AI）。", "the file's words shown in place");
    assert.ok(browser.reloads === reloads && t.text("乙段落").getAttribute("contenteditable") === "true" && !t.text("乙段落").hasAttribute("data-ge-lock"), "no reload, the block the reader's to write in again");
    assert.equal(t.commits.build(), null, "nothing to commit");
    const shown = await t.autosave.showOwn(async () => {
      net.file = net.file.replace(/\n\s*<p>丙段落，在后面。<\/p>/, "");
      return hashOf(net.file);
    });
    assert.equal(shown, "pulled", "its own write taken in where the page stands");
    assert.ok(!t.text("丙段落") && browser.reloads === reloads, "shown, no reload");
    await advance(5000);
    assert.ok(browser.reloads === reloads && !t.autosave.state.foreign, "and no write of anyone else's after it");
  }

  // The Agent takes a tab of three out of a Sheet with its panel: the Sheet's boxes otherwise, the Sheet
  // replaced (taken out and the file's put in), the tabs and panels left moved into it, never paired again by where
  // it stands (once it was, its boxes gone with the replacement: "no element for box", the page shown anew).
  {
    const before = page(`  <p>前文</p>
  <section class="doc-sheet-shell" data-doc-sheets="three" aria-label="三页"><div class="doc-sheet-tabs" aria-label="三页"><button class="doc-sheet-tab" type="button" data-sheet-tab="a">第一页</button><button class="doc-sheet-tab" type="button" data-sheet-tab="b">第二页</button><button class="doc-sheet-tab" type="button" data-sheet-tab="c">第三页</button></div><div data-doc-sheet="a"><p>第一页的字</p></div><div data-doc-sheet="b"><p>第二页的字</p></div><div data-doc-sheet="c"><p>第三页的字</p></div></section>
  <p>后文</p>
`);
    const net = server(before);
    const t = opened(net);
    const third = t.text("第三页的字");
    net.file = before.replace('<button class="doc-sheet-tab" type="button" data-sheet-tab="b">第二页</button>', "").replace('<div data-doc-sheet="b"><p>第二页的字</p></div>', "");
    assert.equal((await pullNow(t)).outcome, "applied");
    assert.deepEqual([...t.document.querySelectorAll("main .doc-sheet-tab")].map((node) => node.textContent), ["第一页", "第三页"], "the tab taken out");
    assert.ok(t.text("第三页的字") === third && !t.text("第二页的字") && t.commits.build() === null, "the panels left the same elements, the other gone, nothing to commit");
  }

  // The file written back, a moment after a pull, as the reader's own commit left it (an Agent putting back
  // what it read then): a write of someone else's, shown (once taken for the page's own late announcement, ignored:
  // the page showing the Agent's write still, the file not; packageScorecard).
  {
    const net = server(SOURCE);
    const t = opened(net, undefined, { pull: (one) => pulls(one) });
    t.text("甲段落").innerHTML = "甲段落（读者），写的是开头。";
    t.change();
    await t.autosave.flush();
    const mine = net.file;
    t.autosave.heard(hashOf(mine)); // its own announcement
    await advance(100);
    net.file = mine.replace("乙段落，写的是中间。", "乙段落，写的是中间（AI）。");
    t.autosave.heard(hashOf(net.file));
    await advance(1000);
    assert.equal(t.text("乙段落").textContent, "乙段落，写的是中间（AI）。", "the Agent's write taken in");
    net.file = mine;
    t.autosave.heard(hashOf(net.file));
    await advance(1000);
    assert.equal(t.text("乙段落").textContent, "乙段落，写的是中间。", "the file written back as the reader's commit left it: shown too");
  }

  // After a review (2026-11-13). The reader splits a paragraph (Enter) and the Agent rewords it: a card on its words, the
  // block split off it with them. 用文件里的 (autosave.giveUp) gives all of it up, pull on as off: the page shown anew
  // (a pull showing the file's words in place left the block split off live, written again later: the words twice),
  // nothing written of it. Words the reader typed in the block split off while that commit was on its way are on no
  // card (it shows what was sent): listed (lostKey), never dropped without a word (fuzz --words 9304).
  {
    const split = page(`  <p data-block-id="xxxx0001">甲段落，写的是开头。</p>\n  <p data-block-id="yyyy0002">乙段落。</p>\n`);
    for (const inFlight of [false, true]) {
      for (const on of [true, false]) {
        const net = server(split);
        const t = opened(net, undefined, on ? { pull: (one) => pulls(one) } : {});
        const x = t.text("甲段落");
        net.file = net.file.replace("甲段落，写的是开头。", "甲段落，写的是开头（AI）。");
        x.innerHTML = "甲段落，";
        const off = t.document.createElement("p");
        off.textContent = inFlight ? "写的是开头。" : "写的是开头。q8x";
        off.setAttribute("contenteditable", "true");
        off.setAttribute("data-ge-new", "");
        x.after(off);
        let open = null;
        if (inFlight) net.gate = new Promise((resolve) => { open = resolve; });
        t.change(true);
        const flushed = t.autosave.flush();
        await advance(10);
        if (inFlight) {
          off.textContent = "写的是开头。q8x"; // typed while the commit is on its way
          t.change();
          net.gate = null;
          open();
        }
        await flushed;
        await advance(10);
        const label = `pull ${on ? "on" : "off"}, ${inFlight ? "typed while the commit went" : "split in the commit"}`;
        const card = t.conflicts.find((entry) => entry.kind === "text");
        assert.ok(card && card.mine.includes("写的是开头。") && card.mine.includes("q8x") === !inFlight, `${label}: a card on the words and the block split off`);
        const [reloads, posts] = [browser.reloads, net.posts.length];
        t.autosave.giveUp(card);
        await advance(8000);
        assert.equal(browser.reloads - reloads, 1, `${label}: shown anew`);
        assert.ok(!net.file.includes("q8x") && net.posts.slice(posts).every((post) => !JSON.stringify(post.body).includes("q8x")), `${label}: nothing written of what was given up`);
        const lost = JSON.parse(t.local.get("gallery-edit:demo:lost") ?? "[]");
        if (inFlight) assert.ok(lost.length === 1 && lost[0].why === "changed" && lost[0].html.includes("q8x"), `${label}: what the card did not show listed`);
        else assert.equal(lost.length, 0, `${label}: what the card showed is not listed`);
      }
    }
    // A pull asked for while a block given up has one split off it (showFile, or another write heard): the page shown
    // anew, never the file's words shown in place with the block split off left on the page.
    const net = server(split);
    const t = opened(net, undefined, { pull: (one) => pulls(one) });
    const x = t.text("甲段落");
    x.innerHTML = "甲段落，";
    const off = t.document.createElement("p");
    off.textContent = "写的是开头。q8x";
    off.setAttribute("contenteditable", "true");
    off.setAttribute("data-ge-new", "");
    x.after(off);
    t.change(true);
    net.file = net.file.replace("甲段落，写的是开头。", "甲段落，写的是开头（AI）。");
    await t.autosave.flush();
    t.commits.resolve(t.conflicts.find((entry) => entry.kind === "text").key, "discard");
    assert.deepEqual(await pullNow(t).then(({ outcome, reason }) => [outcome, reason]), ["structure", "given-up"], "a block split off one given up: shown anew");
    assert.equal(t.text("甲段落").textContent, "甲段落，", "nothing shown in place");
  }

  // After a review (2026-11-13). A unit put in place of the page's (replaced) holding a block the reader changed and has not
  // saved: the page did not see all the file has of it, and has the hash of no version of it; deleting it then asks
  // first (a card), as deleting a unit paired and kept so does. It took the file's hash: the Agent's words in the
  // paragraph never shown, deleted without a word.
  {
    const callout = page(`  <p>前文。</p>\n  <div class="doc-callout" data-block-id="call0001">\n    <p data-block-id="para0001">提示里的段落。</p>\n  </div>\n  <p>后文。</p>\n`);
    for (const recolour of [false, true]) {
      const net = server(callout);
      const t = opened(net);
      t.text("提示里的段落").innerHTML = "提示里的段落（读者没存）。";
      let next = net.file.replace("提示里的段落。", "提示里的段落。AI 加的话。");
      if (recolour) next = next.replace('<div class="doc-callout" data-block-id="call0001">', '<div class="doc-callout" data-block-id="call0001" data-tone="warn">');
      net.file = next;
      const result = await pullNow(t);
      assert.deepEqual([result.outcome, result.held], ["partial", 1], result.reason);
      removeUnit(t.document.querySelector("main .doc-callout"));
      t.change(true);
      await t.autosave.flush();
      await advance(100);
      const label = recolour ? "the callout replaced" : "the callout paired";
      assert.ok(t.conflicts.some((entry) => entry.kind === "unit" && entry.reason === "changed"), `${label}: its deletion a card`);
      assert.ok(net.file.includes("AI 加的话") && net.file.includes("doc-callout"), `${label}: the Agent's words kept`);
    }
  }

  // After a review (2026-11-13). A unit a script of the document's draws into or wires (the map's keep "script"), or one holding
  // such a unit, is never replaced nor put in by a pull (no script draws or hears it there; a load runs the scripts):
  // the page shown anew.
  {
    const scripted = page(`  <p>前文。</p>\n  <div class="sales-chart" data-values="1,2"></div>\n  <p>中间。</p>\n  <div class="doc-callout"><p><button id="go" type="button">按我</button> 提示。</p></div>\n  <p>后文。</p>\n`).replace("</body>", `<script>
  document.querySelectorAll(".sales-chart").forEach((node) => { node.innerHTML = "<svg data-drawn></svg>"; });
  document.getElementById("go").addEventListener("click", () => alert(1));
</script>
</body>`);
    const cases = {
      "the chart's data changed": [(source) => source.replace('data-values="1,2"', 'data-values="1,2,3"'), "shell"],
      "a second chart put in": [(source) => source.replace("<p>中间。</p>", '<p>中间。</p>\n  <div class="sales-chart" data-values="9"></div>'), "insert"],
      "the callout holding the wired button recoloured": [(source) => source.replace('<div class="doc-callout">', '<div class="doc-callout" data-tone="warn">'), "shell"],
    };
    for (const [label, [change, reason]] of Object.entries(cases)) {
      const net = server(scripted);
      const t = opened(net);
      for (const node of t.document.querySelectorAll(".sales-chart")) node.innerHTML = "<svg data-drawn></svg>"; // as the script left it
      net.file = change(net.file);
      assert.deepEqual(await pullNow(t).then(({ outcome, reason: why }) => [outcome, why]), ["structure", reason], label);
      assert.ok([...t.document.querySelectorAll(".sales-chart")].every((node) => node.querySelector("svg[data-drawn]")), `${label}: nothing put in undrawn`);
    }
  }

  // After a review (2026-11-13). The reader types while a write they asked for (撤回: showOwn) is on its way: committed once it
  // is taken in, not only at their next change (changed() counts while the page is being written, arming nothing).
  {
    const three = page(`  <p data-block-id="aaaa0001">甲段落。</p>\n  <p data-block-id="bbbb0002">乙段落。</p>\n  <p data-block-id="cccc0003">丙段落。</p>\n`);
    for (const same of [false, true]) {
      const net = server(three);
      const t = opened(net, undefined, { pull: (one) => pulls(one) });
      const shown = await t.autosave.showOwn(async () => {
        t.text("甲段落").innerHTML = "甲段落（读者）。";
        t.change();
        net.file = same ? net.file.replace("甲段落。", "甲段落（撤回写的）。") : net.file.replace("丙段落。", "丙段落（撤回写的）。");
        return hashOf(net.file);
      });
      assert.equal(shown, "pulled");
      await advance(20000);
      if (same) assert.ok(t.conflicts.some((entry) => entry.kind === "text") && !net.file.includes("（读者）"), "the block the write changed too: a card");
      else assert.ok(net.file.includes("甲段落（读者）。") && t.autosave.state.waiting === 0, "the reader's words committed");
    }
  }

} finally {
  stop();
}

// A page of an earlier Gallery kept, with a commit whose answer it never learned, how many units and blocks
// it opened on and their hashes: read as each unit's place in that version.
{
  const { map, html } = served(SOURCE);
  const { document } = new JSDOM(html).window;
  const baselines = new Map();
  for (const block of map.blocks) baselines.set(block.id, prepareBlock(document.querySelector(`[data-ge-block="${block.id}"]`), block));
  let layout = captureLayout(document, map);
  const commits = createCommits({ root: document, map, baselines, units: new Map(), boxes: new Map(), getLayout: () => layout, setLayout: (next) => (layout = next), restore: { openingUnits: 3, openingBlocks: 1, openingHashes: map.units.slice(0, 3).map((unit) => unit.hash) } });
  for (const words of ["甲段落", "丙段落"]) [...document.querySelectorAll("[data-ge-block]")].find((node) => node.textContent.includes(words)).textContent += "（改）";
  const { request } = commits.build();
  const named = Object.fromEntries(request.texts.map((text) => [map.blocks[Number(text.key.slice(1))].inner, text.block.unit.open]));
  assert.equal(named["甲段落，写的是开头。"], map.blocks.find((block) => block.inner === "甲段落，写的是开头。").unit, "a unit it opened on: its number then");
  assert.equal(named["丙段落，在后面。"], -1, "one past the count it kept: none");
  void seal;
}

console.log("pull: ok");
