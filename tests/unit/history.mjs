import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { KEEP_ALL, KEEP_HOURS, keepVersionIn, listVersionsIn, readVersionIn, thinned, versionNamed } from "../../src/editor/history.mjs";
import { createEditService } from "../../src/editor/service.mjs";
import { hashOf, markedVersion } from "../../src/editor/source.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { portIsFree } from "../../src/shared/preview-server.mjs";

// A document's recent versions and the Agent's changes taken back (decided 2026-11-11;
// docs/editor.md "Recent versions", "Agent's changes"). The store
// (src/editor/history.mjs): each version with who made it beside it (by: the reader's, the Agent's, or not
// known: the first one kept and one kept before Gallery said who), none twice in a row, the later
// write's word on who wins, later than the last whatever the clock, the last 30 and the last of each hour
// before them kept; a version named by its id, its version or the start of either. The edit service: a
// page served takes the file (its first version, by no one known), a reader's commit keeps the file before
// and after it (the reader's), a write of the Agent's the announcement tells is a version of the Agent's,
// listed newest first with what each changed of the one before it, block by block; gallery revert's
// revert (`agent`) says the blocks it took back and the version that holds what it wrote over, which a
// restore brings back; the Agent's restore is under review as the Agent's write, the reader's ends the
// review, and its 撤销 puts the file and the review back; a version shown as its words, and opened as its
// page by the key its address in the list carries (历史版本's view), the preview serving that page frozen
// (no editor, no live script) and refusing another key, a name that is no version's and another site's
// request. The commands, with
// a real server and with none: gallery revert with nothing to take back (exit 1; a new document's starter
// filled is no change to take back), of a review (through the server, the open page told);
// gallery history's list (its --json: who, what blocks, 未知 for the old ones) and --restore (the version
// before it kept, restored back); a write while no server ran, under review from the next server's start. What
// a version changed of the one before it: marked for its page, and listed a while at a time.

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const page = (body, title = "周报") => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title></head><body>
<main class="doc-page" data-doc-id="demo">
  <header class="doc-header"><h1 class="doc-title">${title}</h1></header>
${body}</main>
</body></html>
`;
const BODY = `  <p data-block-id="pa000001">第一段文字在这里，说的是开头。</p>
  <p data-block-id="pa000002">我们先理解材料，然后再动手写正文。</p>
  <p data-block-id="pa000003">最后一段收尾的话。</p>
`;

// ---------- the store ----------
{
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-history-store-"));
  try {
    const T = Date.UTC(2026, 10, 11, 9, 0, 0);
    const sidecar = async (id) => JSON.parse(await fs.readFile(path.join(directory, `${id}.json`), "utf8"));
    const first = await keepVersionIn(directory, "一", { kind: "write" }, { now: T });
    assert.match(first, /^20261111T090000000Z-[a-f0-9]{16}$/, "named by its time to the millisecond and its version");
    assert.deepEqual(await sidecar(first), { by: null, kind: "write" }, "the first one kept: who made it is not known");
    assert.equal(await keepVersionIn(directory, "一", { kind: "write" }, { now: T + 5 }), first, "the same text twice in a row is kept once");
    assert.deepEqual(await sidecar(first), { by: null, kind: "write" }, "and a take says nothing over it");
    assert.equal(await keepVersionIn(directory, "一", { by: "reader", kind: "commit" }, { now: T + 6 }), first);
    assert.deepEqual(await sidecar(first), { by: "reader", kind: "commit" }, "the service's own word on who wrote it wins");
    const second = await keepVersionIn(directory, "二", { kind: "write" }, { now: T - 60000 });
    assert.deepEqual(await sidecar(second), { by: "agent", kind: "write" }, "a write outside the service after the first: the Agent's");
    assert.ok(second > first, "later than the last one kept, whatever the clock says");
    const third = await keepVersionIn(directory, "三", { by: "agent", kind: "restore", from: first }, { now: T + 10 });
    const listed = await listVersionsIn(directory, { text: true });
    assert.deepEqual(listed.map(({ id, by, kind, text }) => [id, by, kind, text]), [[first, "reader", "commit", "一"], [second, "agent", "write", "二"], [third, "agent", "restore", "三"]], "oldest first, with their texts");
    assert.equal(listed[2].from, first);
    // One of an older Gallery's: named to the second, no .json beside it.
    const old = `20261110T080000Z-${hashOf("零")}`;
    await fs.writeFile(path.join(directory, `${old}.html`), "零");
    await fs.writeFile(path.join(directory, `20261110T070000Z-${"0".repeat(16)}.html`), "not of its version");
    const all = await listVersionsIn(directory, { text: true });
    assert.deepEqual([all[0].id, all[0].by, all[0].kind], [old, null, null], "one kept before Gallery said who: not known");
    assert.equal(all.length, 4, "a file whose text is not of its version is left out");
    // Named by its id, its version, or the start of either (6 characters at least).
    assert.equal(versionNamed(all, first).version.id, first);
    assert.equal(versionNamed(all, hashOf("二")).version.id, second);
    assert.equal(versionNamed(all, hashOf("三").slice(0, 8)).version.id, third);
    assert.equal(versionNamed(all, hashOf("三").slice(0, 4)).refused, "none", "4 characters name none");
    assert.equal(versionNamed(all, "zzzzzzzz").refused, "none");
    assert.equal(versionNamed(all, "20261111T09").refused, "ambiguous", "the start of several ids");
    // One read by its id alone: none for a name that is no version's (a path), nor for a text not of its version.
    assert.equal(await readVersionIn(directory, second), "二");
    assert.equal(await readVersionIn(directory, `20261110T070000Z-${"0".repeat(16)}`), null, "a text not of its version");
    assert.equal(await readVersionIn(directory, `../${path.basename(directory)}/${second}`), null, "a path is no version's name");
    assert.equal(await readVersionIn(directory, `20261111T090000000Z-${"1".repeat(16)}`), null, "none kept");
    // Thinned: the last 30 all, before them the last of each hour, KEEP_HOURS of those at most.
    const hour = 3600000;
    const many = Array.from({ length: 200 }, (_, at) => ({ name: `v${String(at).padStart(3, "0")}`, time: T + Math.floor(at / 2) * hour + (at % 2) * 60000 }));
    const stay = thinned(many);
    assert.equal(stay.size, KEEP_ALL + KEEP_HOURS);
    assert.ok(many.slice(-KEEP_ALL).every(({ name }) => stay.has(name)), "the last 30 all stay");
    assert.ok(!stay.has("v168") && stay.has("v169"), "before them, the last of each hour");
    assert.ok(!stay.has("v069") && stay.has("v071"), "KEEP_HOURS hours of them, the latest");
    // Kept on disk thinned, the .json of each version gone gone with it.
    const busy = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-history-thin-"));
    for (let at = 0; at < 120; at++) await keepVersionIn(busy, `第 ${at} 版`, { kind: "write" }, { now: T + at * hour / 2 });
    const names = await fs.readdir(busy);
    const kept = names.filter((name) => name.endsWith(".html"));
    assert.ok(kept.length <= KEEP_ALL + KEEP_HOURS && kept.length > KEEP_ALL, `thinned on disk (${kept.length})`);
    assert.equal(names.filter((name) => name.endsWith(".json")).length, kept.length, "a .json for each version, none left behind");
    await fs.rm(busy, { recursive: true, force: true });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

// ---------- the edit service ----------
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-history-service-"));
  const state = path.join(root, ".gallery", "state");
  const folder = path.join(root, "demo");
  const file = path.join(folder, "doc.html");
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(file, page(BODY));
  await fs.writeFile(path.join(folder, "doc.json"), `${JSON.stringify({ title: "周报", description: "d" }, null, 2)}\n`);
  const service = createEditService({ reportsDirectory: root, stateDirectory: state });
  const list = async () => {
    const [status, answer] = await service.historyAction({ slug: "demo", action: "versions" });
    assert.equal(status, 200, JSON.stringify(answer));
    return answer;
  };
  const review = async () => (await service.changesAction({ slug: "demo", action: "read" }))[1];
  const agentWrites = async (change) => {
    const after = change(await fs.readFile(file, "utf8"));
    await fs.writeFile(file, after);
    return service.noteTaken("demo", after); // as the announcement takes it
  };
  // A commit of the page's: a paragraph's words, named by the page's map of the file as served.
  const commit = async (inner, html) => {
    const source = await fs.readFile(file, "utf8");
    const map = JSON.parse(service.preview("demo", source).snippet.match(/<script type="application\/json"[^>]*>([^<]*)<\/script>/)[1]);
    await service.noteTaken("demo", source); // the page served
    const block = map.blocks.find((entry) => entry.inner === inner);
    assert.ok(block, `the page has ${inner}`);
    const unit = { key: block.unit, open: block.unit, hash: map.units[block.unit].hash };
    const [status, answer] = await service.handleCommit({ slug: "demo", opening: map.version, texts: [{ key: "t", block: { unit, self: true, before: inner }, parts: [{ keep: true, html }] }] }, Date.now() + 10000);
    assert.equal(status, 200, JSON.stringify(answer));
    assert.equal(answer.wrote, true);
    await service.stored();
  };
  try {
    await service.noteTaken("demo", await fs.readFile(file, "utf8"));
    let history = await list();
    assert.deepEqual(history.versions.map(({ by, kind, current, counts }) => [by, kind, current, counts]), [[null, "write", true, null]], "a page served: the first version, who made it not known");

    await commit("我们先理解材料，然后再动手写正文。", "我们先读懂材料（读者改的）。");
    history = await list();
    assert.equal(history.versions.length, 2, "the file before the commit is the first version already");
    const [made] = history.versions;
    assert.deepEqual([made.by, made.kind, made.current, made.counts], ["reader", "commit", true, { added: 0, changed: 1, removed: 0 }], "the commit's: the reader's, one block changed");
    assert.deepEqual(made.blocks.map(({ change, id, text, name }) => [change, id, text, name]), [["changed", "pa000002", "我们先读懂材料（读者改的）。", "文本"]], "the block by its id, its words and its kind");

    assert.equal(await agentWrites((text) => text.replace("  <p data-block-id=\"pa000003\">", "  <p>Agent 加的一段。</p>\n  <p data-block-id=\"pa000003\">")), true, "a write of the Agent's starts a review");
    history = await list();
    const [write] = history.versions;
    assert.deepEqual([write.by, write.kind, write.counts], ["agent", "write", { added: 1, changed: 0, removed: 0 }], "the Agent's write is a version of its own");
    assert.equal(write.blocks[0].text, "Agent 加的一段。");
    assert.equal((await review()).pending, true);

    // gallery revert's revert: the blocks it took back, the version that holds what it wrote over.
    const read = await review();
    const [, reverted] = await service.changesAction({ slug: "demo", action: "revert", stamp: read.stamp, agent: true });
    assert.equal(reverted.ok, true, JSON.stringify(reverted));
    assert.deepEqual(reverted.blocks.map(({ change, text }) => [change, text]), [["added", "Agent 加的一段。"]], "what it took back, block by block");
    assert.equal(reverted.kept, write.id, "what it wrote over is the Agent's version");
    let text = await fs.readFile(file, "utf8");
    assert.ok(!text.includes("Agent 加的一段") && text.includes("我们先读懂材料（读者改的）。"), "the Agent's paragraph gone, the reader's edit kept");
    history = await list();
    assert.deepEqual([history.versions[0].by, history.versions[0].kind], ["agent", "revert"], "the revert is the Agent's, as gallery revert's");
    assert.equal((await review()).pending, false);

    // The Agent's restore of what the revert wrote over: under review as the Agent's write; restored back.
    const [, restored] = await service.historyAction({ slug: "demo", action: "restore", version: reverted.kept.slice(-16).slice(0, 8), agent: true });
    assert.equal(restored.ok, true, JSON.stringify(restored));
    assert.equal(restored.restored, write.id);
    assert.deepEqual(restored.blocks.map(({ change, text: words }) => [change, words]), [["removed", "Agent 加的一段。"]], "the block the version has that the file had not: put back");
    assert.ok((await fs.readFile(file, "utf8")).includes("Agent 加的一段。"));
    assert.equal((await review()).pending, true, "the Agent's restore is under review as its write");
    history = await list();
    assert.deepEqual([history.versions[0].kind, history.versions[0].by, history.versions[0].from], ["restore", "agent", write.id]);
    const [, back] = await service.historyAction({ slug: "demo", action: "restore", version: restored.kept, agent: true });
    assert.equal(back.ok, true);
    assert.ok(!(await fs.readFile(file, "utf8")).includes("Agent 加的一段。"), "the restore taken back by restoring the version before it");
    assert.equal((await review()).pending, false, "and with the file as the baseline, nothing is under review");
    const [, same] = await service.historyAction({ slug: "demo", action: "restore", version: back.restored, agent: true });
    assert.equal(same.same, true, "the file says it already: nothing written");

    // The reader's restore (the workbench's): the review ends; its 撤销 puts the file and the review back.
    await agentWrites((text) => text.replace("最后一段收尾的话。", "最后一段被 Agent 改了。"));
    assert.equal((await review()).pending, true);
    const before = await fs.readFile(file, "utf8");
    const [, mine] = await service.historyAction({ slug: "demo", action: "restore", version: made.id });
    assert.equal(mine.ok, true, JSON.stringify(mine));
    assert.equal(mine.blocks, undefined, "the reader's restore says no blocks");
    assert.equal((await review()).pending, false, "the reader said what the document is");
    history = await list();
    assert.deepEqual([history.versions[0].by, history.versions[0].kind], ["reader", "restore"]);
    const [, undone] = await service.historyAction({ slug: "demo", action: "undo", undo: mine.undo });
    assert.equal(undone.ok, true, JSON.stringify(undone));
    assert.equal(await fs.readFile(file, "utf8"), before, "撤销: the file as it was before the restore");
    assert.equal((await review()).pending, true, "and the review with it");
    assert.equal((await service.historyAction({ slug: "demo", action: "undo", undo: mine.undo }))[1].reason, "gone", "once");
    assert.equal((await service.historyAction({ slug: "demo", action: "restore", version: "nothing" }))[1].reason, "version");

    // A version shown as its words; an old one with no .json is not known.
    const [, shown] = await service.historyAction({ slug: "demo", action: "show", version: write.id });
    assert.deepEqual(shown.rows.map(({ text: words }) => words), ["周报", "第一段文字在这里，说的是开头。", "我们先读懂材料（读者改的）。", "Agent 加的一段。", "最后一段收尾的话。"]);
    // Its page (历史版本's view): the list gives each version its address, the key in it the token's;
    // that key opens that version alone, as its pages see it.
    history = await list();
    const address = new URL(history.versions.find(({ id }) => id === write.id).view, "http://127.0.0.1");
    assert.deepEqual([address.pathname, address.searchParams.has("present"), address.searchParams.get("version")], ["/generated/demo.html", true, write.id]);
    const key = address.searchParams.get("key");
    assert.match(key, /^[a-f0-9]{32}$/);
    const opened = await service.versionShown("demo", write.id, key);
    assert.ok(opened.text.includes("Agent 加的一段。") && opened.text.includes("我们先读懂材料（读者改的）。"), "the version's text, as its pages see it");
    assert.equal(await service.versionShown("demo", write.id, "0".repeat(32)), null, "another key opens nothing");
    assert.equal(await service.versionShown("demo", history.versions[0].id, key), null, "nor another version");
    assert.equal(await service.versionShown("demo", "../demo/doc", key), null, "a name that is no version's");
    const history0 = path.join(state, "history", "demo");
    const old = `20261101T080000Z-${hashOf(page(BODY, "旧的"))}`;
    await fs.writeFile(path.join(history0, `${old}.html`), page(BODY, "旧的"));
    history = await list();
    const listedOld = history.versions.at(-1);
    assert.deepEqual([listedOld.id, listedOld.by, listedOld.kind, listedOld.counts], [old, null, null, null], "kept before Gallery said who: 未知, and the first");
    assert.ok(!fsSync.readdirSync(folder).some((name) => name.endsWith(".json") && name !== "doc.json"), "nothing of it in the document's folder");
  } finally {
    await service.drain();
    await fs.rm(root, { recursive: true, force: true });
  }
}

// ---------- what a version changed of the one before it ----------
// 历史版本's view marks it on the version's page (source/changes.mjs markedVersion: diffRows' blocks, by their ids
// and kinds, marked in their start tags for editor/page/changes/version.mjs to draw): three versions, a block added,
// one changed, one deleted; the first has none, the middle one its own. The list works out what each changed a
// while at a time (listBudget), keeps it beside the versions (summaries.json) and works out none again, after a
// restart too; gallery history's (`all`) works out every one.
{
  const three = [
    page(`  <p data-block-id="pa000001">第一段文字在这里，说的是开头。</p>\n  <p data-block-id="pa000002">第二段之后会改。</p>\n  <p data-block-id="pa000003">第三段之后会删掉。</p>\n`),
    page(`  <p data-block-id="pa000001">第一段文字在这里，说的是开头。</p>\n  <p data-block-id="pa000004">新加的一段 & "引号"。</p>\n  <p data-block-id="pa000002">第二段之后会改。</p>\n  <p data-block-id="pa000003">第三段之后会删掉。</p>\n`),
    page(`  <p data-block-id="pa000001">第一段文字在这里，说的是开头。</p>\n  <p data-block-id="pa000004">新加的一段 & "引号"。</p>\n  <p data-block-id="pa000002">第二段已经<b>改过</b>了。</p>\n`),
  ];
  assert.equal(markedVersion(three[0], three[0]), null, "the same text: nothing marked");
  const added = markedVersion(three[0], three[1]);
  assert.deepEqual(added.counts, { added: 1, changed: 0, removed: 0 });
  assert.match(added.text, /<p data-ge-hist="add" data-block-id="pa000004">新加的一段 & "引号"。<\/p>/, "a block added: marked in its start tag");
  assert.ok(!added.text.includes("data-ge-hist-ghosts") && !/data-ge-hist[^=]*="[^"]*"[^>]*>第一段/.test(added.text), "nothing else marked");
  const both = markedVersion(three[1], three[2]);
  assert.deepEqual(both.counts, { added: 0, changed: 1, removed: 1 });
  const changedTag = both.text.match(/<p [^>]*data-block-id="pa000002">第二段已经<b>改过<\/b>了。<\/p>/)?.[0] ?? "";
  assert.ok(changedTag.includes('data-ge-hist="words"') && changedTag.includes('data-ge-hist-was="第二段之后会改。"'), `a block whose words changed: its words before beside them (${changedTag})`);
  assert.ok(changedTag.includes('data-ge-hist-after="0"'), "the blocks deleted after the last block left");
  const ghosts = JSON.parse(both.text.match(/<script type="application\/json" data-ge-hist-ghosts data-doc-dev>([^<]*)<\/script>\n<\/body>/)[1]);
  assert.deepEqual(ghosts, [{ count: 1, rows: [{ kind: "paragraph", tag: "p", depth: 0, text: "第三段之后会删掉。" }] }], "their ghost's lines before </body>");
  const tricky = markedVersion(page(`  <p data-block-id="pa000001">原来的 "话"。</p>\n`), page(`  <p data-block-id="pa000001">现在的 "话" & <a href="x">链接</a>。</p>\n`));
  assert.match(tricky.text, /data-ge-hist-was="原来的 &quot;话&quot;。"/, "the words before, escaped for the attribute");
  const gone = markedVersion(page(`  <p data-block-id="pa000001">只剩它。</p>\n`), page(""));
  assert.match(gone.text, /<h1 data-ge-hist-after="0" class="doc-title">/, "every block deleted: the ghost after the title");
  const bare = (body) => `<!doctype html>\n<html><head><meta charset="utf-8"><title>t</title></head><body>\n<main class="doc-page">\n${body}</main>\n</body></html>\n`;
  assert.match(markedVersion(bare(`  <p>只剩它。</p>\n`), bare("")).text, /<main data-ge-hist-into="0" class="doc-page">/, "and with no title either: in the main");

  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-history-marked-"));
  const state = path.join(root, ".gallery", "state");
  const folder = path.join(root, "demo");
  const file = path.join(folder, "doc.html");
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, "doc.json"), `${JSON.stringify({ title: "周报" }, null, 2)}\n`);
  const services = [];
  const serviceWith = (listBudget) => {
    const made = createEditService({ reportsDirectory: root, stateDirectory: state, listBudget });
    services.push(made);
    return made;
  };
  let service = serviceWith(0);
  const list = async (body = {}) => (await service.historyAction({ slug: "demo", action: "versions", ...body }))[1];
  try {
    for (const text of three) {
      await fs.writeFile(file, text);
      await service.noteTaken("demo", text);
      await service.stored();
    }
    let listed = await list();
    assert.equal(listed.versions.length, 3);
    const [last, middle, first] = listed.versions;
    // The view of each: the middle one marked with what it changed of the first, the first with none.
    const keyOf = (version) => new URL(version.view, "http://127.0.0.1").searchParams.get("key");
    const shownMiddle = await service.versionShown("demo", middle.id, keyOf(middle));
    assert.deepEqual(shownMiddle.marked.counts, { added: 1, changed: 0, removed: 0 }, "the middle one: what it changed of the first");
    assert.ok(shownMiddle.marked.text.includes('data-ge-hist="add" data-block-id="pa000004"') && !shownMiddle.text.includes("data-ge-hist"), "marked in the text its page is rendered from, the version's own text unmarked");
    assert.equal((await service.versionShown("demo", first.id, keyOf(first))).marked, null, "the first: nothing before it, nothing marked");
    const shownLast = await service.versionShown("demo", last.id, keyOf(last));
    assert.deepEqual(shownLast.marked.counts, { added: 0, changed: 1, removed: 1 }, "the last: of the middle one");
    // The list a while at a time (a budget of none: one each time), the newest first; asked again, the rest.
    assert.equal(listed.later, 1, "one worked out, one left for later");
    assert.deepEqual([last.counts, middle.counts, first.counts], [{ added: 0, changed: 1, removed: 1 }, undefined, null], "the newest first; the first has none");
    await service.drain();
    listed = await list();
    assert.deepEqual([listed.later, listed.versions[1].counts], [0, { added: 1, changed: 0, removed: 0 }], "asked again: the rest");
    await service.drain();
    const summaries = JSON.parse(await fs.readFile(path.join(state, "history", "demo", "summaries.json"), "utf8"));
    assert.deepEqual([summaries.v, Object.keys(summaries.pairs).length], [1, 2], "kept beside the versions, a pair each");
    assert.deepEqual(await listVersionsIn(path.join(state, "history", "demo")).then((all) => all.length), 3, "and no version of its own");
    // Another service (a restart), with none of its own in memory: what was worked out is read, nothing worked out again.
    service = serviceWith(0);
    const pairs = Object.keys(summaries.pairs);
    listed = await list();
    assert.deepEqual([listed.later, listed.versions.map(({ counts }) => counts)], [0, [{ added: 0, changed: 1, removed: 1 }, { added: 1, changed: 0, removed: 0 }, null]], "after a restart: all of it at once, from what was kept");
    // gallery history's: every one at once, whatever the budget; a pair gone with a version thinned away is let go.
    await fs.rm(path.join(state, "history", "demo", "summaries.json"));
    service = serviceWith(0);
    listed = await list({ all: true });
    assert.deepEqual([listed.later, listed.versions.map(({ counts }) => counts)], [0, [{ added: 0, changed: 1, removed: 1 }, { added: 1, changed: 0, removed: 0 }, null]], "all: every one worked out");
    await service.drain();
    await fs.writeFile(path.join(state, "history", "demo", "summaries.json"), JSON.stringify({ v: 1, pairs: { ...JSON.parse(await fs.readFile(path.join(state, "history", "demo", "summaries.json"), "utf8")).pairs, "0000000000000000 1111111111111111": { counts: { added: 9, changed: 0, removed: 0 }, blocks: [] } } }));
    service = serviceWith(0);
    await list();
    await service.drain();
    assert.deepEqual(Object.keys(JSON.parse(await fs.readFile(path.join(state, "history", "demo", "summaries.json"), "utf8")).pairs).sort(), pairs.sort(), "a pair of versions no longer kept is let go");
  } finally {
    for (const each of services) await each.drain();
    await fs.rm(root, { recursive: true, force: true });
  }
}

// ---------- a document made under the name of one deleted before ----------
// Its recent versions are its own: the workspace's create, duplicate, copy and destroy forget what was kept under the
// name (forgetChanges), so neither 历史版本 nor gallery history lists the old one's, and the new one's first version is
// its own starter, never what the one deleted had.
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-history-reuse-"));
  const state = path.join(root, ".gallery", "state");
  const folder = path.join(root, "weekly");
  const file = path.join(folder, "doc.html");
  const service = createEditService({ reportsDirectory: root, stateDirectory: state });
  const starter = (title) => page(`  <section data-doc-placeholder><p>在这里写。</p></section>\n`, title);
  const make = async (title) => {
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(file, starter(title));
    await fs.writeFile(path.join(folder, "doc.json"), `${JSON.stringify({ title, description: "d" }, null, 2)}\n`);
    await service.noteTaken("weekly", starter(title));
  };
  const write = async (change) => {
    const after = change(await fs.readFile(file, "utf8"));
    await fs.writeFile(file, after);
    await service.noteTaken("weekly", after);
  };
  try {
    await make("旧周报");
    await write((text) => text.replace("</main>", "<p>旧文档里写下的内容。</p></main>"));
    await service.stored();
    assert.ok(fsSync.readdirSync(path.join(state, "history", "weekly")).length > 0);
    // Deleted for good (the workspace's destroy forgets it), then a new one made under the name.
    await fs.rm(folder, { recursive: true, force: true });
    await service.forgetChanges("weekly");
    assert.equal(fsSync.existsSync(path.join(state, "history", "weekly")), false, "its versions forgotten with its review");
    await make("新周报");
    await write((text) => text.replace("</main>", "<p>新文档的首次撰写。</p></main>"));
    const [, read] = await service.changesAction({ slug: "weekly", action: "read" });
    assert.deepEqual([read.pending, "draft" in read], [false, false], "the new one's starter filled: nothing under review, no first writing");
    const [, listed] = await service.historyAction({ slug: "weekly", action: "versions" });
    assert.deepEqual(listed.versions.map(({ by }) => by), ["agent", null], "the new one's versions alone: its starter (by no one known) and the Agent's write");
    assert.ok(listed.versions.every(({ blocks }) => blocks.every(({ text }) => !text.includes("旧文档"))), "none of the old one's");
  } finally {
    await service.drain();
    await fs.rm(root, { recursive: true, force: true });
  }
}

// ---------- the commands, with a server and with none ----------
const run = promisify(execFile);
const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-history-cli-"));
const workspace = path.join(root, "ws");
const data = path.join(root, "data");
const [low, high] = (/^(\d+)-(\d+)$/.exec(process.env.GALLERY_TEST_PORTS ?? "") ?? [0, 4200, 4260]).slice(1).map(Number);
async function freePort() {
  for (let port = high; port >= low; port--) if (await portIsFree(port)) return port;
  throw new Error(`No free port in ${low}-${high}`);
}
const port = await freePort();
const env = { GALLERY_DEFAULT_WORKSPACE: workspace, GALLERY_DATA_DIR: data, GALLERY_NO_BROWSER: "1", GALLERY_NO_UPDATE_CHECK: "1", GALLERY_NO_AUTOSTART: "1", GALLERY_PORT: String(port), GALLERY_NO_PREVIEW: "" };
const gallery = async (args, extra = {}) => {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, "--workspace", workspace, ...args], { cwd: root, env: { ...process.env, ...env, ...extra }, timeout: 120_000 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
const docFile = path.join(workspace, "weekly", "doc.html");
const edit = async (from, to) => {
  const text = await fs.readFile(docFile, "utf8");
  const next = text.replace(from, to);
  assert.notEqual(next, text, `the Agent's edit finds ${from}`);
  await fs.writeFile(docFile, next);
};
const versions = async () => {
  const listed = await gallery(["history", "weekly", "--json"]);
  assert.equal(listed.code, 0, listed.stderr);
  return JSON.parse(listed.stdout);
};
// Until `test` of the review the server has says yes (its announcement takes a write once quiet for 1.5 s).
const until = async (test, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(200)) if (await test()) return true;
  return false;
};
let pid = null;
try {
  assert.equal((await gallery(["init", workspace])).code, 0);
  const made = await gallery(["new", "weekly", "周报"], { GALLERY_NO_PREVIEW: "1" });
  assert.equal(made.code, 0, made.stderr);

  // No server: nothing to take back (exit 1, said why and what next).
  let said = await gallery(["revert", "weekly"], { GALLERY_NO_PREVIEW: "1" });
  assert.equal(said.code, 1, said.stdout);
  assert.match(said.stderr, /^问题：weekly（周报）没有待审阅的 Agent 修改/);
  assert.match(said.stderr, /\n下一步：要回到更早的样子，运行 gallery history weekly/);

  // A server: gallery open of the document, the open page's event stream.
  const opened = await gallery(["open", "weekly", "--no-browser"]);
  assert.equal(opened.code, 0, opened.stderr);
  pid = JSON.parse(await fs.readFile(path.join(data, "server.json"), "utf8")).pid;
  const told = [];
  const stream = new AbortController();
  fetch(`http://127.0.0.1:${port}/__gallery/events?slug=weekly`, { signal: stream.signal }).then(async (response) => {
    const decoder = new TextDecoder();
    for await (const chunk of response.body) told.push(...decoder.decode(chunk).split("\n").filter((line) => line.startsWith("data: report ")));
  }).catch(() => {});
  await sleep(500);
  const token = JSON.parse(await fs.readFile(path.join(data, "server.json"), "utf8")).token;
  const ask = async (route, body) => (await fetch(`http://127.0.0.1:${port}/__gallery/edit/${route}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}`, "X-Gallery-Token": token }, body: JSON.stringify(body) })).json();
  // The Agent fills the new document's starter: no change to review, so gallery revert has nothing to take
  // back (exit 1, nothing written). Its next write, with no command between, the server reviews as it
  // takes it; gallery revert takes that back through the server (the agent-parity acceptance's way,
  // tests/release/parity-acceptance.mjs: a paragraph written and taken back).
  await edit(/ *<!-- Starter[^]*?<\/section>\n/, "    <h2>本周</h2>\n    <p>首次撰写的一段。</p>\n");
  await sleep(2000);
  said = await gallery(["revert", "weekly"]);
  assert.equal(said.code, 1, said.stdout);
  assert.match(said.stderr, /^问题：weekly（周报）没有待审阅的 Agent 修改/);
  assert.ok((await fs.readFile(docFile, "utf8")).includes("首次撰写的一段"), "the starter filled stays");
  await edit("</main>", "<p>PARITY-MARK</p></main>");
  assert.ok(await until(async () => (await ask("changes", { slug: "weekly", action: "read" })).pending === true), "the server reviews the Agent's next write as it takes it");
  const heard = told.length;
  said = await gallery(["revert", "weekly"]);
  assert.equal(said.code, 0, said.stderr);
  assert.match(said.stdout, /^撤回了 weekly（周报）里 Agent 的修改（自 .* 起 1 次写入：加了 1 块）：\n {2}去掉了加的 文本「PARITY-MARK」\n/);
  assert.ok((await fs.readFile(docFile, "utf8")).includes("首次撰写的一段"), "the starter filled stays");
  assert.ok(!/重读/.test(said.stdout), said.stdout);
  assert.match(said.stdout, /\n提示：撤回前的样子存成了版本 ([a-f0-9]{8})；要恢复它：gallery history weekly --restore \1/);
  const kept = /--restore ([a-f0-9]{8})/.exec(said.stdout)[1];
  assert.ok(!(await fs.readFile(docFile, "utf8")).includes("PARITY-MARK"), "taken back through the server");
  assert.ok(await until(async () => told.length > heard, 3000), "the open page is told at once");

  // A reader's edit on the page (a commit through the server, as the page sends it), then the list.
  const served = await (await fetch(`http://127.0.0.1:${port}/generated/weekly.html`)).text();
  const map = JSON.parse(served.match(/<script type="application\/json" id="doc-edit-map"[^>]*>([^<]*)<\/script>/)[1].replace(/\\u003c/g, "<"));
  const title = map.blocks.find((entry) => entry.kind === "title");
  const committed = await ask("commit", { slug: "weekly", opening: map.version, texts: [{ key: "t", block: { title: true, before: title.inner }, parts: [{ keep: true, html: "周报（读者改的标题）" }] }] });
  assert.equal(committed.ok, true, JSON.stringify(committed));
  let listed = await versions();
  assert.deepEqual(Object.keys(listed), ["document", "current", "versions"]);
  assert.deepEqual([listed.document.slug, listed.document.title], ["weekly", "周报（读者改的标题）"]);
  const [mine, revert, write] = listed.versions;
  assert.deepEqual([mine.by, mine.kind, mine.current, mine.counts], ["user", "commit", true, { added: 0, changed: 1, removed: 0 }], "the user's edit");
  assert.deepEqual(mine.blocks, [{ change: "changed", kind: "title", name: "标题", tag: "h1", id: null, text: "周报（读者改的标题）", title: true }]);
  assert.deepEqual([revert.by, revert.kind, write.by, write.kind], ["agent", "revert", "agent", "write"]);
  assert.equal(write.short, kept);
  assert.deepEqual(write.blocks.map(({ change, text }) => [change, text]), [["added", "PARITY-MARK"]]);
  assert.equal(listed.versions.at(-1).by, null, "the first version kept: 未知");
  // 历史版本's view of an older version: its page, frozen, at the address the list gave; refused with another
  // key, by a name that is no version's, to a request another site started.
  const older = (await ask("history", { slug: "weekly", action: "versions" })).versions.find(({ current }) => !current);
  assert.match(older.view, /^\/generated\/weekly\.html\?present&version=\d{8}T\d{9}Z-[a-f0-9]{16}&key=[a-f0-9]{32}$/);
  const viewed = await fetch(`http://127.0.0.1:${port}${older.view}`);
  const html = await viewed.text();
  assert.equal(viewed.status, 200);
  assert.match(viewed.headers.get("content-security-policy") ?? "", /frame-ancestors/, "framed by Gallery's own pages alone");
  assert.equal(viewed.headers.get("cache-control"), "no-store");
  assert.ok(html.includes("首次撰写的一段。") && !html.includes("读者改的标题"), "the version's page, not the file's");
  assert.ok(!html.includes("doc-edit-map") && !html.includes("/__gallery/events") && !html.includes("present-links"), "no editor, no live script, no links of a presentation");
  assert.ok(html.includes("data-doc-present") && html.includes('Object.defineProperty(window, "localStorage"'), "presented, frozen");
  assert.ok(html.indexOf('Object.defineProperty(window, "localStorage"') < html.indexOf("data-doc-kit"), "its script first, before the kit's");
  const refused = async (address, headers = {}) => (await fetch(`http://127.0.0.1:${port}${address}`, { headers })).status;
  assert.equal(await refused(older.view.replace(/key=[a-f0-9]{32}/, `key=${"0".repeat(32)}`)), 404, "another key");
  assert.equal(await refused(older.view.replace(/version=[^&]+/, `version=${encodeURIComponent(`../weekly/doc`)}`)), 404, "a name that is no version's");
  assert.equal(await refused(older.view, { "Sec-Fetch-Site": "cross-site" }), 403, "a request another site started");
  assert.equal(await refused(older.view, { "Sec-Fetch-Site": "same-origin" }), 200);
  said = await gallery(["history", "weekly"]);
  assert.match(said.stdout, /^weekly（周报（读者改的标题））的历史版本，最新的在前，共 \d+ 个：\n {2}[a-f0-9]{8} {2}\d{4}-\d\d-\d\d \d\d:\d\d:\d\d {2}用户 +页面上的修改：改了 1 块（现在的样子）\n {12}改了 标题「周报（读者改的标题）」\n/);
  assert.match(said.stdout, /\n提示：gallery history weekly --restore <版本>/);
  // --changes: what a version changed of the one before it, every block with its words (历史版本 marks it on the page).
  said = await gallery(["history", "weekly", "--changes", mine.short]);
  assert.equal(said.code, 0, said.stderr);
  assert.match(said.stdout, /^weekly（周报（读者改的标题））的版本 [a-f0-9]{8}（\d{4}-\d\d-\d\d \d\d:\d\d:\d\d，用户，页面上的修改）和上一版 [a-f0-9]{8} 比：改了 1 块（它就是现在的样子）\n {2}改了 标题：\n {4}原来：周报\n {4}现在：周报（读者改的标题）\n$/, said.stdout);
  said = await gallery(["history", "weekly", "--changes", mine.short, "--json"]);
  const compared = JSON.parse(said.stdout);
  assert.deepEqual([compared.version.id, compared.previous, compared.counts, compared.blocks], [mine.id, revert.id, { added: 0, changed: 1, removed: 0 }, [{ change: "changed", kind: "title", name: "标题", tag: "h1", id: null, text: "周报（读者改的标题）", title: true, texts: [{ before: "周报", now: "周报（读者改的标题）" }] }]], said.stdout);
  said = await gallery(["history", "weekly", "--changes", listed.versions.at(-1).short]);
  assert.ok(said.code === 0 && said.stdout.includes("是最早存下的，没有上一版可比"), said.stdout);
  assert.equal((await gallery(["history", "weekly", "--changes", "ffffffff"])).code, 1);

  // --restore: the version before it kept, the open page told, the restore taken back the same way.
  const heardBefore = told.length;
  said = await gallery(["history", "weekly", "--restore", kept]);
  assert.equal(said.code, 0, said.stderr);
  assert.match(said.stdout, new RegExp(`^恢复了 weekly（周报（读者改的标题））到版本 ${kept}（`));
  assert.ok(said.stdout.includes("放回了删的 文本「PARITY-MARK」") && said.stdout.includes("改回了 标题「周报（读者改的标题）」"), said.stdout);
  const before = /--restore ([a-f0-9]{8})$/m.exec(said.stdout)[1];
  assert.equal(before, mine.short, "what it wrote over: the user's edit");
  assert.match(await fs.readFile(docFile, "utf8"), /PARITY-MARK[^]*<\/main>/);
  assert.ok(await until(async () => told.length > heardBefore, 3000), "the open page is told");
  assert.equal((await ask("changes", { slug: "weekly", action: "read" })).pending, true, "the Agent's restore is under review");
  listed = await versions();
  assert.deepEqual([listed.versions[0].by, listed.versions[0].kind, listed.versions[0].from.slice(-16, -8)], ["agent", "restore", kept]);
  said = await gallery(["history", "weekly", "--restore", before, "--json"]);
  assert.equal(said.code, 0, said.stderr);
  const answer = JSON.parse(said.stdout);
  assert.deepEqual([answer.same, answer.restored, answer.document.slug], [false, mine.id, "weekly"]);
  assert.ok((await fs.readFile(docFile, "utf8")).includes("周报（读者改的标题）") && !(await fs.readFile(docFile, "utf8")).includes("PARITY-MARK"), "restored back");
  assert.equal((await gallery(["history", "weekly", "--restore", "ffffffff"])).code, 1);
  assert.equal((await gallery(["history", "weekly", "--nope"])).code, 2);
  stream.abort();

  // A write while no server ran: the next server reviews it from its start, a version of the Agent's.
  assert.equal((await gallery(["stop"])).code, 0);
  pid = null;
  await edit("</main>", "<p>服务停着时写的。</p></main>");
  assert.equal((await gallery(["open", "--no-browser"])).code, 0);
  pid = JSON.parse(await fs.readFile(path.join(data, "server.json"), "utf8")).pid;
  const fresh = JSON.parse(await fs.readFile(path.join(data, "server.json"), "utf8")).token;
  const askFresh = async (body) => (await fetch(`http://127.0.0.1:${port}/__gallery/edit/changes`, { method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}`, "X-Gallery-Token": fresh }, body: JSON.stringify(body) })).json();
  assert.ok(await until(async () => (await askFresh({ slug: "weekly", action: "read" })).pending === true), "under review from the server's start, no page opened");
  listed = await versions();
  assert.deepEqual([listed.versions[0].by, listed.versions[0].kind, listed.versions[0].blocks[0]?.text], ["agent", "write", "服务停着时写的。"]);
  said = await gallery(["revert", "weekly"]);
  assert.equal(said.code, 0, said.stderr);
  assert.ok(!(await fs.readFile(docFile, "utf8")).includes("服务停着时写的"));

  // The folder deleted by hand, gallery new under its slug: the new document's versions are its own (noteNew forgets
  // the old one's), its first one its own starter, which gallery history --restore brings back, not the old document.
  await fs.rm(path.dirname(docFile), { recursive: true, force: true });
  await sleep(500);
  const again = await gallery(["new", "weekly", "新周报"], { GALLERY_NO_PREVIEW: "1" });
  assert.equal(again.code, 0, again.stderr);
  await edit("</main>", "<p>新文档的首次撰写。</p></main>");
  await sleep(2000);
  listed = await versions();
  assert.ok(listed.versions.every(({ blocks }) => blocks.every(({ text }) => !text.includes("读者改的标题"))), JSON.stringify(listed.versions.map(({ blocks }) => blocks)));
  assert.equal((await gallery(["revert", "weekly"])).code, 1, "its starter filled: nothing to take back");
  said = await gallery(["history", "weekly", "--restore", listed.versions.at(-1).short]);
  assert.equal(said.code, 0, said.stderr);
  const back = await fs.readFile(docFile, "utf8");
  assert.ok(!back.includes("新文档的首次撰写") && back.includes("新周报") && !back.includes("读者改的标题"), "back to the new document's own starter");
} finally {
  if (pid) await gallery(["stop"]).catch(() => {});
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
}

console.log("Checked the recent versions and the Agent's changes taken back: the store (who made each version, none twice in a row, the service's word winning, later than the last, thinned by the hour, named by id, version or its start, an older Gallery's not known), the edit service's (the first version of a page served, a commit's the reader's, an Agent's write its own version, what each changed by blocks, gallery revert's blocks and kept version, the Agent's restore under review and restored back, the reader's ending the review and undone with it, a version's words, a version's page opened by its key alone and served frozen), what a version changed of the one before it (marked for its page: added, words changed, deleted; none for the first; the list a while at a time, kept, read after a restart, every one for gallery history, pairs gone let go), and the commands with a server and with none (revert of nothing, of a new document's starter filled none, of the write after it through the server with the open page told; history's list and --json, --changes (every block with its words, none before the first), --restore and back; a write while no server ran reviewed from the next start).");
