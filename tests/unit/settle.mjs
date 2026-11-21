import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { rewriteLines, takeRewrites } from "../../src/editor/rewrites.mjs";
import { createEditService } from "../../src/editor/service.mjs";
import { createSettle } from "../../src/editor/settle.mjs";
import { halfWritten, hashOf, naturalize } from "../../src/editor/source.mjs";
import { createAnnouncer } from "../../src/server/announce.mjs";

// The preview never takes a half-written file (docs/editor.md, "Writing"): an Agent changes a
// structure in several edits, and between two of them the file is a page its author does not mean.
// halfWritten (source/whole.mjs) tells such a file by a few signs only (a block element not closed,
// an end tag closing nothing, a Sheet area's tabs and panels not paired), never by what a browser
// takes as its author meant (an unclosed <p>) nor by what is no markup (a comment, a script, code);
// createSettle (settle.mjs) holds such a file until it is whole or has been so a while, and the
// announcer (src/server/announce.mjs) tells pages of a write once the file is taken and has not
// changed for a moment; the edit service applies no commit, clean or reader's hand-in to a held file
// (it waits, then answers busy), serves a page's load what it last took, and keeps what a reader's
// commit or hand-in wrote of the Agent's natural HTML as the kit's markup for gallery check and
// gallery export to say once.

const page = (body) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>报告</title></head><body>
<main class="doc-page" data-doc-id="demo">
  <header class="doc-header"><h1 class="doc-title">报告</h1></header>
${body}</main>
</body></html>
`;
const keys = (source) => halfWritten(source).map((sign) => sign.key);

const SECTION = `<section class="doc-section">
  <h2>结果</h2>
  <p>第一段。</p>
  <ul><li>一项</li><li>二项</li></ul>
</section>
`;
const SHEET = (panels) => `<section class="doc-sheet-shell" data-doc-sheets="answers">
  <div class="doc-sheet-tabs">
    <button class="doc-sheet-tab" type="button" data-sheet-tab="opus">Opus</button>
    <button class="doc-sheet-tab" type="button" data-sheet-tab="fable">Fable</button>
    <button class="doc-sheet-tab" type="button" data-sheet-tab="gpt">GPT</button>
  </div>
${panels.map((key) => `  <div data-doc-sheet="${key}"><p>${key} 的回答</p></div>\n`).join("")}</section>
`;

// ---------- the signs ----------
{
  assert.deepEqual(halfWritten(page(SECTION)), [], "a whole report");
  assert.deepEqual(halfWritten(page(SHEET(["opus", "fable", "gpt"]))), [], "a whole Sheet area");

  // Wrapping the section's blocks in a disclosure, in two edits: either one first.
  const opened = page(SECTION.replace("  <p>第一段。</p>", "  <details><summary>收起</summary>\n  <p>第一段。</p>"));
  assert.deepEqual(keys(opened), ["<details> not closed"], "the disclosure opened, its end not written yet");
  assert.equal(halfWritten(opened)[0].line, 7, "at the line of its start tag");
  assert.match(halfWritten(opened)[0].text, /^<details> not closed \(line 7\)$/);
  const closed = page(SECTION.replace("</ul>", "</ul>\n  </details>"));
  assert.deepEqual(keys(closed), ["</details> closes nothing"], "its end written first");
  assert.deepEqual(halfWritten(page(SECTION.replace("  <p>第一段。</p>", "  <details><summary>收起</summary>\n  <p>第一段。</p>").replace("</ul>", "</ul>\n  </details>"))), [], "both edits made: whole");
  // A whole section wrapped, and one moved: its start and end in two places.
  assert.deepEqual(keys(page(`<details><summary>附录</summary>\n${SECTION}`)), ["<details> not closed"], "a section wrapped, half way");
  assert.deepEqual(keys(page(SECTION.replace("</section>\n", ""))), ["<section> not closed"], "a section's end cut away first");
  assert.deepEqual(keys(page(`${SECTION}</section>\n`)), ["</section> closes nothing"], "an end pasted before its start");
  assert.deepEqual(halfWritten(page(`<p>前言。</p>\n`)), [], "a section cut out whole is a whole file (only the quiet before telling pages covers it)");
  assert.deepEqual(keys(page(SECTION).replace("</main>", "")), ["<main> not closed"], "the main element not closed");
  assert.deepEqual(keys(page(SECTION.replace("<ul>", "<div><ul>"))), ["<div> not closed"], "a div opened, not closed");
  // A table not closed holds what follows it (the parser drops the ends of what holds it, as a browser does).
  assert.deepEqual(keys(page(`<div class="doc-table-wrap"><table class="doc-table"><tr><td>1</td></tr>\n</div>\n`)), ["<main> not closed", "<div> not closed", "<table> not closed", "</div> closes nothing", "</main> closes nothing"], "a table's end not written");

  // A Sheet area written tabs first.
  assert.deepEqual(keys(page(SHEET([]))), ["sheets: tabs and panels do not pair"], "tabs, no panels yet");
  assert.deepEqual(keys(page(SHEET(["opus"]))), ["sheets: tabs and panels do not pair"], "three tabs, one panel");
  assert.deepEqual(keys(page(SHEET(["opus", "fable", "gpt", "extra"]))), ["sheets: tabs and panels do not pair"], "a panel without its tab");
  assert.deepEqual(keys(page(SHEET(["opus", "opus", "gpt"]))), ["sheets: tabs and panels do not pair"], "a panel twice, one missing");
  assert.equal(halfWritten(page(SHEET(["opus"])))[0].line, 5, "at the area's line");

  // What a browser takes as its author meant, and what is no markup: no sign.
  assert.deepEqual(halfWritten(page(`<section class="doc-section">
  <h2>结果</h2>
  <p>没有闭合的段落
  <p>又一段
  <ul><li>一项<li>二项</ul>
  <div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>A<th>B<tbody><tr><td>1<td>2<tr><td>3<td>4</table></div>
  <dl><dt>词<dd>解释</dl>
</section>
`)), [], "an unclosed <p>, <li>, <td>, <tr>, <th>, <thead>, <tbody>, <dt>, <dd>: a browser closes each where its author meant");
  assert.deepEqual(halfWritten(page(`<!-- <div class="draft"> 这里以后放一节 -->
<!-- </section> 旧的结尾 -->
<section class="doc-section">
  <!-- <details><summary>草稿</summary> -->
  <h2>结果</h2><!-- </div> -->
  <p>一段。<!-- <section> --></p>
  <!--[if IE]><div><![endif]-->
</section>
<!-- </details> -->
`)), [], "comments that spell block tags (a comment-heavy file of the Agent's own)");
  assert.deepEqual(halfWritten(page(`<section class="doc-section"><h2>结果</h2><p>一段。</p></section>
<script>
  const shell = "<div class='x'>"; // an element as text
  document.body.insertAdjacentHTML("beforeend", "<details><summary>" + shell);
  if (1 < 2 && "</section>") console.log("</div>");
</script>
<script type="application/json">{"html": "<div><section>"}</script>
<style>/* </div> */ .x::after { content: "<details>"; }</style>
`)), [], "a script containing \"<div>\" and end tags, a JSON script, a style");
  assert.deepEqual(halfWritten(page(`<div class="doc-code"><div class="doc-code-title"></div><pre><code><div class="card">
  <section>未闭合的示例
</details></code></pre></div>
<p>行内 <code>&lt;div&gt;</code> 和 <code></section></code>。</p>
`)), [], "code samples written with their tags as they are (pre, code)");
  // A block's start tag in a paragraph's inline code is no sample: a browser ends the paragraph there and opens the block.
  assert.deepEqual(keys(page(`<p>行内 <code><div></code>。</p>\n`)), ["<div> not closed"], "a <div> written raw in a paragraph's inline code is one");
  assert.deepEqual(halfWritten(page(`<p title="</div></section>">属性里的结束标签</p>
<p><textarea></div><details></textarea></p>
<svg viewBox="0 0 10 10"><g><rect width="1" height="1"/></svg>
<template><div><section></template>
`)), [], "an attribute's value, a textarea, a drawing, a template");
  assert.deepEqual(halfWritten(page(`<p>\u6309 <kbd></div></kbd>\uFF0C\u8F93\u51FA <samp></section></samp>\uFF0C\u53D8\u91CF <var></details></var>\u3002</p>\n`)), [], "end tags written raw in a key, a program's output, a variable (samples, as in code)");
  assert.deepEqual(halfWritten(`\uFEFF${page(SECTION)}`), [], "a byte order mark first");
  assert.deepEqual(halfWritten(page(`<section class="doc-section"><h2>  </h2></section>\n`).replace("<main", "<main\n")), [], "start tags across lines");
  // Each sign with its tag as written (its blanks one): what tells it from another of its kind.
  assert.deepEqual(halfWritten(page(SECTION.replace("<ul>", '<div class="own"\n   data-x="1"><ul>'))).map((sign) => sign.tag), ['<div class="own" data-x="1">'], "a start tag");
  assert.deepEqual(halfWritten(page(`${SECTION}</section >\n`)).map((sign) => sign.tag), ["</section >"], "an end tag");
  assert.deepEqual(halfWritten(page(SHEET(["opus"]))).map((sign) => sign.tag), ['<section class="doc-sheet-shell" data-doc-sheets="answers">'], "a component's area");
}

// ---------- a file caught empty ----------
// A write empties the file and then fills it: caught between, it is the one half-written file with
// no end tag missing. Taken, what a reader is served and what 批注 are checked against would be
// nothing, the file there again, whole or half written, a moment later.
{
  assert.deepEqual(keys(""), ["no <main> in the file"], "nothing");
  assert.deepEqual(keys(" \n\t\n"), ["no <main> in the file"], "white space");
  assert.deepEqual(keys("\uFEFF"), ["no <main> in the file"], "a byte order mark");
  // Cut anywhere a report's file is a sign, however early: its head alone is as much a page of nothing.
  const entire = page(SECTION);
  for (let at = 1; at < entire.indexOf("</main>"); at += 7) assert.ok(keys(entire.slice(0, at)).length > 0, `cut at ${at}: ${JSON.stringify(entire.slice(0, at))}`);
  assert.deepEqual(keys('<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<title>话'), ["no <main> in the file"], "cut in the head");
  assert.deepEqual(keys("<template><main></main></template><p>字</p>"), ["no <main> in the file"], "a template's is none of the page's");
  assert.deepEqual(keys(page("")), [], "a page of no blocks is a page");
  let clock = 100000;
  const settle = createSettle({ now: () => clock, hold: 30000, quiet: 1500 });
  const whole = page(SECTION);
  const half = page(SECTION.replace("  <p>第一段。</p>", "  <details><summary>收起</summary>\n  <p>第一段。</p>"));
  settle.judge("demo", { source: whole, mtime: clock - 5000 });
  let state = settle.judge("demo", { source: "", mtime: clock });
  assert.ok(state.held && state.taken === whole && state.wait === 30000, `held, what was last taken still what its pages show (${JSON.stringify(state)})`);
  clock += 50;
  state = settle.judge("demo", { source: half, mtime: clock });
  assert.ok(state.held && state.taken === whole, `then half written: what its pages show is the file before it, no empty text (${JSON.stringify(state)})`);
  clock += 50;
  state = settle.judge("demo", { source: whole, mtime: clock });
  assert.ok(!state.held, `then whole: taken (${JSON.stringify(state)})`);
  state = settle.judge("demo", { source: "", mtime: clock });
  assert.ok(state.held, "and empty again: held again");
  clock += 30000;
  state = settle.judge("demo", { source: "", mtime: clock - 30000 });
  assert.ok(!state.held, `left so past HOLD: its author's, taken (${JSON.stringify(state)})`);
  assert.ok(!settle.judge("demo", { source: "", mtime: clock - 30000 }).held, "and no longer held");

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-empty-"));
  const file = path.join(root, "demo", "report.html");
  await fs.mkdir(path.dirname(file));
  const note = { id: "note0001", text: "补一句", created: "2026-10-31T00:00:00.000Z", anchor: { kind: "text", blocks: ["paraaaaa"], quote: "第一段", prefix: "", suffix: "。" } };
  const report = page('<p data-block-id="paraaaaa">第一段。</p>\n');
  await fs.writeFile(file, report);
  const notes = path.join(root, "demo", "annotations.json");
  await fs.writeFile(notes, `${JSON.stringify({ v: 1, items: [note] }, null, 2)}\n`);
  const service = createEditService({ reportsDirectory: root, settling: { wait: 0 } });
  const count = async () => JSON.parse(await fs.readFile(notes, "utf8").catch(() => '{"items":[]}')).items.length;
  try {
    assert.equal((await service.readTaken("demo")).text, report, "taken");
    await service.checkAnnotations("demo");
    assert.equal(await count(), 1, "its 批注 found");
    await fs.writeFile(file, "");
    assert.equal((await service.readTaken("demo")).text, report, "caught empty: a reader is served what was last taken");
    await service.checkAnnotations("demo");
    assert.equal(await count(), 1, "its 批注 stay");
    await fs.writeFile(file, report.replace("</main>", "  <details><summary>收起</summary>\n</main>"));
    assert.equal((await service.readTaken("demo")).text, report, "then half written: the same");
    await service.checkAnnotations("demo");
    assert.equal(await count(), 1, "and they stay");
    await fs.writeFile(file, report);
    await service.checkAnnotations("demo");
    assert.equal(await count(), 1, "and are there once it is whole");
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

// ---------- when a file is taken ----------
{
  let clock = 100000;
  const settle = createSettle({ now: () => clock, hold: 30000, quiet: 1500 });
  const whole = page(SECTION);
  const half = page(SECTION.replace("  <p>第一段。</p>", "  <details><summary>收起</summary>\n  <p>第一段。</p>"));
  const judge = (source, mtime) => settle.judge("demo", { source, mtime });

  let state = judge(whole, clock);
  assert.ok(!state.held && state.wait === 1500 && !state.own, `a write just made: told its pages after the quiet (${JSON.stringify(state)})`);
  clock += 600;
  assert.equal(judge(whole, clock - 600).wait, 900, "the rest of the quiet");
  clock += 900;
  assert.equal(judge(whole, clock - 1500).wait, 0, "quiet: told now");
  // The first edit of a change, then the second.
  const firstEdit = clock;
  state = judge(half, firstEdit);
  assert.ok(state.held && state.wait === 30000 && state.signs.length === 1 && state.signs[0].key === "<details> not closed", `half written: held (${JSON.stringify(state)})`);
  clock += 1000;
  state = judge(half.replace("第一段", "第一段（改）"), clock);
  assert.ok(state.held && state.wait === 30000, `an edit in the half-written file: held from its last write (${JSON.stringify(state)})`);
  clock += 1000;
  const done = half.replace("</ul>", "</ul>\n  </details>");
  state = judge(done, clock);
  assert.ok(!state.held && state.wait === 1500, "the second edit: whole, told its pages after the quiet");
  // A file that stays so: held a while, then taken as it is, and what made it odd holds it no more.
  const odd = page(SECTION.replace("<ul>", "<div class=\"own\"><ul>")); // the Agent's own markup, never closed
  const oddSince = clock;
  assert.ok(judge(odd, oddSince).held, "odd: held at first");
  clock += 29999;
  assert.ok(judge(odd, oddSince).held, "held until HOLD");
  clock += 1;
  state = judge(odd, oddSince);
  assert.ok(!state.held && state.wait === 0, "then taken as it is (the checks speak of it)");
  clock += 5000;
  const oddEdited = odd.replace("第一段", "第一段（改）");
  state = judge(oddEdited, clock);
  assert.ok(!state.held && state.wait === 1500, "a later edit of it: its old sign holds it no more");
  const oddHalf = oddEdited.replace("  <p>第一段（改）。</p>", "  <details><summary>收起</summary>\n  <p>第一段（改）。</p>");
  assert.ok(judge(oddHalf, clock).held, "a new sign of a half-written change still does");
  assert.ok(!judge(oddEdited, clock).held, "and once that change is whole, it is taken");
  // The old div closed and, in the same edit, a new one opened elsewhere (its end in the next edit):
  // as many divs not closed as were taken, yet a new one.
  const wrapping = oddEdited.replace('<div class="own"><ul>', "<ul>").replace("<h2>结果</h2>", '<div class="wrap"><h2>结果</h2>');
  state = judge(wrapping, clock);
  assert.ok(state.held && state.signs.map((sign) => sign.tag).join() === '<div class="wrap">', `a div opened where the taken one is gone: held (${JSON.stringify(state.signs)})`);
  assert.ok(!judge(oddEdited, clock).held, "the taken file again: taken");
  // A file seen half written for the first time long after it was written (the server started since): taken.
  const fresh = createSettle({ now: () => clock, hold: 30000, quiet: 1500 });
  assert.ok(!fresh.judge("old", { source: half, mtime: clock - 60000 }).held, "half written for longer than HOLD: taken at once");
  assert.ok(fresh.judge("new", { source: half, mtime: clock - 1000 }).held, "half written a moment ago: held");
  // A slow change (a Sheet area written in four edits over 29s, 14s apart at most): held
  // from its last write, so never given up between two edits less than HOLD apart; at most LIMIT from
  // the write that made it half written (a file its Agent keeps writing so is taken then).
  {
    let at = 0;
    const slow = createSettle({ now: () => at, hold: 30000, limit: 120000, quiet: 1500 });
    const look = (source, mtime) => slow.judge("slow", { source, mtime });
    assert.ok(!look(whole, -60000).held, "whole");
    assert.ok(look(half, 0).held, "the change's first edit");
    at = 20000;
    const second = half.replace("第一段", "第一段（二）");
    assert.ok(look(second, 20000).held, "its second edit, 20s later: still half written");
    at = 30500;
    state = look(second, 20000);
    assert.ok(state.held && state.wait === 19500, `30.5s after the first edit, 10.5s after the last: held (${JSON.stringify(state)})`);
    for (let written = 40000; written <= 100000; written += 20000) {
      at = written;
      assert.ok(look(half.replace("第一段", `第一段（${written}）`), written).held, `written half again at ${written / 1000}s: held`);
    }
    at = 119999;
    state = look(half.replace("第一段", "第一段（100000）"), 100000);
    assert.ok(state.held && state.wait === 1, `held until LIMIT from the first edit (${JSON.stringify(state)})`);
    at = 120000;
    assert.ok(!look(half.replace("第一段", "第一段（100000）"), 100000).held, "then taken as it is");
  }
  // The service's own write: whole, told at once.
  settle.wrote("demo", whole);
  state = judge(whole, clock);
  assert.ok(!state.held && state.wait === 0 && state.own, "the service's own write: told at once");
  assert.ok(!judge(null, clock).held, "no file: nothing held");
  assert.equal(judge(half, clock - 1).held, true, "another's write after it is judged as any");
}

// ---------- telling pages ----------
// The announcer (src/server/announce.mjs) looks where a report's file stands after each change and
// tells its pages once the file is taken and quiet. A change that comes while it looks at an earlier
// one (the Agent's second edit, its event handled while the half-written first is judged) is looked
// at in its own time: the earlier look, finding the file it read held, puts nothing off for the
// hold. A file held is looked at again within `recheck` (a change no event said is found then).
{
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const held = { held: true, wait: 30000, signs: [] };
  let file = "half";
  let looks = 0;
  const told = [];
  const announce = createAnnouncer({
    delay: 50,
    recheck: 1000,
    settled: async () => {
      looks++;
      const read = file;
      if (looks === 1) {
        file = "whole";
        announce("demo"); // the second edit's event, while the first is judged (done before the second is looked at)
        await sleep(5);
      }
      return read === "half" ? { source: read, ...held } : { source: read, held: false, wait: 0 };
    },
    tell: (_slug, state) => told.push(state.source),
  });
  announce("demo");
  await sleep(300);
  assert.deepEqual(told, ["whole"], `told of the second edit at once, not after the first's hold (${looks} looks)`);

  // The change that makes the file whole again said by no event: found within `recheck`.
  file = "half";
  told.length = 0;
  const quiet = createAnnouncer({ delay: 20, recheck: 200, settled: async () => (file === "half" ? { source: file, ...held } : { source: file, held: false, wait: 0 }), tell: (_slug, state) => told.push(state.source) });
  quiet("demo");
  await sleep(100);
  file = "whole";
  await sleep(400);
  assert.deepEqual(told, ["whole"], "a held file looked at again within recheck");
  // A file taken but not quiet yet: told once its quiet is over, no sooner.
  told.length = 0;
  let quietLeft = 150;
  const later = createAnnouncer({
    delay: 20,
    settled: async () => {
      const wait = quietLeft;
      quietLeft = 0;
      return { source: "whole", held: false, wait };
    },
    tell: (_slug, state) => told.push(state.source),
  });
  later("demo");
  await sleep(100);
  assert.deepEqual(told, [], "not told within the quiet");
  await sleep(200);
  assert.deepEqual(told, ["whole"], "told after it");
}

// ---------- the edit service ----------
// A commit waits while the file is half written and is applied once it is whole; one that waited
// WAIT in all is answered busy, nothing written; the revert check waits as well; a page is served
// the file once it is whole (whenTaken); a file that stays so is taken after HOLD.
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-settle-"));
  const state = path.join(root, ".state");
  const file = path.join(root, "demo", "report.html");
  await fs.mkdir(path.dirname(file));
  const whole = page(`${SECTION}<p>另一段。</p>\n`);
  await fs.writeFile(file, whole);
  const service = createEditService({ reportsDirectory: root, stateDirectory: state, settling: { wait: 1200, hold: 5000 } });
  const server = http.createServer((request, response) => (request.url === "/__gallery/edit/reverted" ? service.reverted : service.commit)(request, response));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const host = `127.0.0.1:${server.address().port}`;
  const post = async (body, route = "commit") => {
    const response = await fetch(`http://${host}/__gallery/edit/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": service.token },
      body: JSON.stringify({ slug: "demo", ...body }),
    });
    return { status: response.status, body: await response.json() };
  };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    const report = await service.read("demo");
    const map = JSON.parse(service.preview("demo", report.text).snippet.match(/<script type="application\/json"[^>]*>([^<]*)<\/script>/)[1]);
    const paragraph = (words) => map.blocks.find((entry) => entry.inner.includes(words));
    const unitOf = (words) => ({ key: paragraph(words).unit, open: paragraph(words).unit, hash: map.units[paragraph(words).unit].hash });
    const typing = (html) => ({ opening: map.version, known: map.version, texts: [{ key: "t", block: { unit: unitOf("另一段"), self: true, before: "另一段。" }, parts: [{ keep: true, html }] }] });
    const half = whole.replace("  <p>第一段。</p>", "  <details><summary>收起</summary>\n  <p>第一段。</p>");
    const both = half.replace("</ul>", "</ul>\n  </details>");

    // The Agent's first edit, a commit, the second edit 400ms later: the commit goes to the whole file.
    await fs.writeFile(file, half);
    const started = Date.now();
    const answered = post(typing("另一段（一）。"));
    await sleep(400);
    assert.equal(await fs.readFile(file, "utf8"), half, "nothing written while the file is half written");
    await fs.writeFile(file, both);
    const first = await answered;
    const text = await fs.readFile(file, "utf8");
    assert.ok(first.status === 200 && first.body.ok && first.body.wrote && first.body.foreign, JSON.stringify(first.body));
    assert.ok(Date.now() - started >= 400 && text.includes("另一段（一）。") && /<details class="doc-details">[\s\S]*<\/ul>\n {2}<\/div><\/details>/.test(text), "applied once whole: both edits and the typing in the file, the disclosure the kit's");
    assert.deepEqual(halfWritten(text), [], "whole");
    // The versions kept, not a write in flight (its temporary file, renamed away between the listing
    // and its reading: the gate once failed on one at random).
    const history = (await fs.readdir(path.join(state, "history", "demo")).catch(() => [])).filter((name) => name.endsWith(".html")); // not who made each (.json), nor a write in flight (.tmp)
    for (const name of history) {
      const kept = await fs.readFile(path.join(state, "history", "demo", name), "utf8").catch((error) => (error.code === "ENOENT" ? null : Promise.reject(error)));
      if (kept !== null) assert.deepEqual(halfWritten(kept), [], `no version kept of the half-written file (${name})`);
    }
    const own = await service.settled("demo");
    assert.ok(own.own && !own.held && own.wait === 0, "the commit's write: the service's own, told its pages at once");

    // Half written for longer than the commit waits: busy, nothing written; the revert check too.
    const now = text.replace('<section class="doc-section">', '<div class="own">\n<section class="doc-section">');
    await fs.writeFile(file, now);
    const busy = await post({ opening: map.version, known: hashOf(text), texts: [] });
    assert.ok(busy.status === 409 && busy.body.reason === "busy", JSON.stringify(busy));
    assert.equal(await fs.readFile(file, "utf8"), now, "nothing written");
    const asked = await post({ opening: map.version, texts: [] }, "reverted");
    assert.ok(asked.status === 409 && asked.body.reason === "busy", `the revert check: busy (${JSON.stringify(asked)})`);
    // The page's load waits for it too, and gets it as it is once its time is up.
    let served = await service.whenTaken("demo", Date.now() + 300);
    assert.ok(served.held && served.source === now && served.signs[0]?.key === "<div> not closed", "still held when the wait ends: as it is");
    // Held for HOLD from the write that made it so: taken as it is (the Agent's own odd markup).
    await sleep(Math.max(0, 5000 - (Date.now() - (await fs.stat(file)).mtimeMs)) + 50);
    served = await service.whenTaken("demo");
    assert.ok(!served.held, "taken after HOLD");
    const later = await post({ opening: map.version, known: hashOf(now), texts: [] });
    assert.ok(later.status === 200 && later.body.ok && later.body.foreign === false, `then committed to (${JSON.stringify(later.body)})`);
    const revert = await post({ opening: map.version, texts: [] }, "reverted");
    assert.ok(revert.status === 200 && revert.body.ok, "and the revert check answered");
  } finally {
    server.close();
    await service.stored();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
}

// ---------- what else waits for a held file ----------
// A page's load while the file stays held is served what the preview last took (readTaken; the file
// as it is when it has taken none); a commit sent again whose answer is kept gets it at once, held
// file or not; the reader's hand-in (the workbench's 导出, the export dialog) is never of a held file
// (busy, nothing written) and keeps what it wrote of the Agent's natural HTML for the Agent as a
// commit does, while the Agent's own (gallery export) says that itself.
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-held-"));
  const state = path.join(root, ".state");
  const directory = path.join(root, "demo");
  const file = path.join(directory, "report.html");
  await fs.mkdir(directory);
  const natural = page(`${SECTION}<p>另一段。</p>\n<p>带 <mark>标记</mark> 的段。</p>\n`);
  // A disclosure opened under the section's heading, its end not written yet.
  const halfOf = (text) => {
    const half = text.replace("</h2>", "</h2>\n  <details><summary>收起</summary>");
    assert.ok(halfWritten(half).length, "half written");
    return half;
  };
  await fs.writeFile(file, natural);
  const service = createEditService({ reportsDirectory: root, stateDirectory: state, settling: { wait: 600 } });
  const server = http.createServer((request, response) => service.commit(request, response));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const host = `127.0.0.1:${server.address().port}`;
  const post = async (body, route = "commit") => {
    const response = await fetch(`http://${host}/__gallery/edit/${route}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": service.token },
      body: JSON.stringify({ slug: "demo", ...body }),
    });
    return { status: response.status, body: await response.json() };
  };
  try {
    // A page's load.
    assert.equal((await service.readTaken("demo")).source, natural, "the file, taken");
    await fs.writeFile(file, halfOf(natural));
    let started = Date.now();
    let served = await service.readTaken("demo");
    assert.ok(served.source === natural && Date.now() - started >= 550, `held: after the wait, what the preview last took (${Date.now() - started}ms)`);
    started = Date.now();
    served = await service.readTaken("demo", { wait: 0 });
    assert.ok(served.source === natural && Date.now() - started < 300, "asked not to wait (复制页面内容): at once");
    const fresh = createEditService({ reportsDirectory: root, settling: { wait: 0 } });
    assert.equal((await fresh.readTaken("demo")).source, halfOf(natural), "a server that has taken none of it: the file as it is");

    // A commit sent again.
    await fs.writeFile(file, natural);
    const report = await service.read("demo");
    const map = JSON.parse(service.preview("demo", report.text).snippet.match(/<script type="application\/json"[^>]*>([^<]*)<\/script>/)[1]);
    const block = map.blocks.find((entry) => entry.inner.includes("另一段"));
    const commit = { request: "again12345", opening: map.version, known: map.version, texts: [{ key: "t", block: { unit: { key: block.unit, open: block.unit, hash: map.units[block.unit].hash }, self: true, before: "另一段。" }, parts: [{ keep: true, html: "另一段（人）。" }] }] };
    const first = await post(commit);
    assert.ok(first.status === 200 && first.body.wrote, JSON.stringify(first.body));
    const committed = await fs.readFile(file, "utf8");
    await fs.writeFile(file, halfOf(committed));
    started = Date.now();
    const again = await post(commit);
    assert.ok(again.status === 200 && again.body.again && Date.now() - started < 400, `answered at once from what it kept (${Date.now() - started}ms, ${JSON.stringify(again.body)})`);
    assert.equal(await fs.readFile(file, "utf8"), halfOf(committed), "nothing written");
    await service.takeRewrites("demo"); // the commit's: said elsewhere

    // The reader's hand-in.
    const handed = await service.handIn("demo", { reader: true });
    assert.ok(!handed.ok && handed.reason === "busy", `the reader's hand-in of a held file: busy (${JSON.stringify(handed)})`);
    assert.equal(await fs.readFile(file, "utf8"), halfOf(committed), "nothing written");
    await fs.writeFile(file, natural);
    const written = await service.handIn("demo", { reader: true });
    assert.ok(written.ok && written.written, JSON.stringify(written));
    const kept = await service.takeRewrites("demo");
    assert.deepEqual(kept.map(({ changes }) => changes.map(({ rule }) => rule).join()), ["mark"], `what the reader's hand-in wrote of natural HTML, kept for the Agent (${JSON.stringify(kept)})`);
    await fs.writeFile(file, natural);
    assert.ok((await service.handIn("demo")).written, "the Agent's own hand-in");
    assert.deepEqual(await service.takeRewrites("demo"), [], "says what it wrote itself: nothing kept");

  } finally {
    server.close();
    await service.stored();
    await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
  }
}

// ---------- what the preview wrote, said once ----------
// A reader's commit in a report of natural HTML writes it as the kit's markup: the service keeps
// when and what (each rule at its line, a chart with its key), in its state directory where
// gallery check and gallery export take it (rewrites.mjs), or in memory without one; taken once.
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-rewrites-"));
  const state = path.join(root, ".state");
  const file = path.join(root, "demo", "report.html");
  await fs.mkdir(path.dirname(file));
  const natural = page(`  <p>带 <mark>标记</mark> 的段落。</p>
  <table data-doc-chart="dots"><tr><th>模型</th><th>得分</th></tr><tr><td>A</td><td>1</td></tr></table>
  <p>另一段。</p>
`);
  const chart = naturalize(natural).changes.find((change) => change.rule === "chart");
  assert.ok(chart && chart.key === "t1" && chart.line === 6, `a chart's change carries its key (${JSON.stringify(chart)})`);
  for (const stateDirectory of [state, null]) {
    await fs.writeFile(file, natural);
    const service = createEditService({ reportsDirectory: root, stateDirectory });
    const server = http.createServer((request, response) => service.commit(request, response));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const host = `127.0.0.1:${server.address().port}`;
    try {
      const report = await service.read("demo");
      const map = JSON.parse(service.preview("demo", report.text).snippet.match(/<script type="application\/json"[^>]*>([^<]*)<\/script>/)[1]);
      const block = map.blocks.find((entry) => entry.inner.includes("另一段"));
      const response = await fetch(`http://${host}/__gallery/edit/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": service.token },
        body: JSON.stringify({ slug: "demo", opening: map.version, known: map.version, texts: [{ key: "t", block: { unit: { key: block.unit, open: block.unit, hash: map.units[block.unit].hash }, self: true, before: "另一段。" }, parts: [{ keep: true, html: "另一段（人）。" }] }] }),
      });
      assert.ok((await response.json()).wrote);
      await service.stored();
      const entries = stateDirectory ? await takeRewrites({ stateDirectory, reportsDirectory: root, slug: "demo" }) : await service.takeRewrites("demo");
      assert.equal(entries.length, 1, "one write kept");
      assert.ok(Math.abs(Date.parse(entries[0].time) - Date.now()) < 60000, "with its time");
      const said = entries[0].changes.map(({ line, rule, key }) => `${line} ${rule}${key ? ` ${key}` : ""}`).sort();
      assert.deepEqual(said, ["5 mark", "6 chart t1", "6 header row", "6 table"], `each rule it wrote, at its line (${said})`);
      const again = stateDirectory ? await takeRewrites({ stateDirectory, reportsDirectory: root, slug: "demo" }) : await service.takeRewrites("demo");
      assert.deepEqual(again, [], "said once: taken away");
      if (stateDirectory) {
        const lines = rewriteLines(file, entries, { today: new Date(entries[0].time) });
        assert.match(lines[0], /^preview \S*demo[\\/]report\.html: at \d\d:\d\d, when the reader edited the page, the preview wrote your natural HTML as the kit's markup: line 5 mark, line 6 chart t1, line 6 header row, line 6 table$/, lines[0]);
        assert.equal(lines.at(-1), "  those lines are the file's as you had left it");
        assert.match(rewriteLines(file, entries, { today: new Date(Date.parse(entries[0].time) + 3 * 86400000) })[0], / at \d{4}-\d\d-\d\d \d\d:\d\d, /, "another day: with its date");
        assert.deepEqual(rewriteLines(file, []), [], "nothing kept: nothing said");
        // A kept write that cannot be taken away (locked: here a folder by an entry's name) stops nothing.
        const locked = path.join(state, "rewrites", "demo", "20261022T000000Z-abcdef12.json"); // the workspace's own state: no key of a directory
        await fs.mkdir(locked, { recursive: true });
        assert.deepEqual(await takeRewrites({ stateDirectory, reportsDirectory: root, slug: "demo" }), [], "one not taken away: the rest said, no error");
        await fs.rm(locked, { recursive: true });
      }
    } finally {
      server.close();
      await service.stored();
    }
  }
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
}

console.log("Checked half-written files: the signs (a block element not closed, an end tag closing nothing, a Sheet area's tabs and panels not paired, each with its tag; not an unclosed <p>, comments, scripts, styles, code, attributes, drawings, templates), when a file is taken (held until whole, HOLD from its last write or LIMIT from the first, its odd signs then holding no more but a new one of its kind, told after the quiet, the service's own writes at once), pages told by the announcer (a change during a look not put off, a held file looked at again), a commit and the revert check waiting for it (applied once whole, busy after WAIT; a commit sent again answered at once), a page's load served what was last taken, the reader's hand-in busy on it, and what a reader's commit or hand-in wrote of natural HTML kept and said once.");
