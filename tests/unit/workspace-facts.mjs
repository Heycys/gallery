import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import { createRoutes } from "../../src/server/routes.mjs";
import { ACTIVITY_VERSION, KEEP_DAYS, createActivity, dayAfter, dayOf } from "../../src/workbench/activity.mjs";
import { createEditService } from "../../src/editor/service.mjs";
import { createIndex, readOf, todosOf } from "../../src/workbench/index.mjs";
import { fileVersion } from "../../src/shared/todos.mjs";
import { FACT_KINDS, QUERY_KINDS, QUERY_LIMITS, SNAPSHOT_LIMITS, queryOptions } from "../../src/shared/workspace-query.mjs";
import { ensureWorkspace, layoutOf } from "../../src/shared/workspace.mjs";

// The workspace's facts (src/workbench/index.mjs), its record of edits (src/workbench/activity.mjs) and
// what workspace.query answers (decided 2026-11-07):
// a document's to-dos as its pages show them (the headings above each, which of the same words under the
// same path it is, its block id, done), its words and title; read again when its file's time changes and
// kept otherwise, never of a file held half written (what its pages are served, the preview's last take,
// read again until it is taken); each query's shape and order (a document's own facts, when it was made its doc.json's created, else the
// earliest its files tell), its options held to their bounds, a kind it
// does not know refused; a keyed table of a document read as the kit reads it (its rows' values and links,
// filtered by its cells' words, a column it has not refused, the reading kept until the file changes), the
// tables a document's instances asked for kept and what an export embeds of the workspace;
// a to-do's ref carrying the version of the file it was read from; which kinds a change changes, since the pages were
// last told (a query between a write and its announcement hiding none of them); the record counting a write that
// changed a file, the reader's and the Agent's apart, the words a day added, a write of the same text none,
// what was written while no server ran counted on its file's day as a start catches up, a record that
// does not read starting again that day, 53 weeks kept (every day a query asks); and the page's live script, which ignores a message
// it does not know (it once reloaded the page for any) and tells the kit "data <kind>".

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-facts-"));
const workspace = path.join(root, "workspace");
await ensureWorkspace(workspace);
const page = (title, body, { icon = null } = {}) => `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>${title}</title></head>
<body>
<main class="doc-page" data-doc-id="x">
  <header class="doc-header"><h1 class="doc-title">${title}</h1></header>
${body}
</main>
</body>
</html>
`;
const writeDocument = (slug, title, body, { icon = null, at = null } = {}) => {
  const folder = path.join(workspace, slug);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, "doc.html"), page(title, body).replace('data-doc-id="x"', `data-doc-id="${slug}"`));
  fs.writeFileSync(path.join(folder, "doc.json"), `${JSON.stringify({ title, description: "", ...(icon ? { icon } : {}) }, null, 2)}\n`);
  if (at) for (const file of ["doc.html", "doc.json"]) fs.utimesSync(path.join(folder, file), at, at);
};

try {
  // ---------- a document's to-dos ----------
  const todos = todosOf(page("计划", `
  <h2>本周</h2>
  <ul class="doc-todo">
    <li data-checked data-block-id="aaaaaaaa">写周报<ul class="doc-todo"><li>附上图表</li></ul></li>
    <li data-block-id="bbbbbbbb">买 <b>牛奶</b></li>
  </ul>
  <ul><li>不是待办</li></ul>
  <h3>周五</h3>
  <ul class="doc-todo"><li><p>开会</p><p>带电脑</p></li><li>买 牛奶</li></ul>
  <h2>以后</h2>
  <ul class="doc-todo"><li>读书</li><li>读书</li></ul>
  <template><ul class="doc-todo"><li>模板里的</li></ul></template>
  <script type="application/json">{ "html": "<ul class=\\"doc-todo\\"><li>脚本里的</li></ul>" }</script>`));
  assert.deepEqual(todos, [
    { text: "写周报", done: true, block: "aaaaaaaa", path: ["本周"], nth: 0 },
    { text: "附上图表", done: false, block: null, path: ["本周"], nth: 0 },
    { text: "买 牛奶", done: false, block: "bbbbbbbb", path: ["本周"], nth: 0 },
    { text: "开会", done: false, block: null, path: ["本周", "周五"], nth: 0 },
    { text: "买 牛奶", done: false, block: null, path: ["本周", "周五"], nth: 0 },
    { text: "读书", done: false, block: null, path: ["以后"], nth: 0 },
    { text: "读书", done: false, block: null, path: ["以后"], nth: 1 },
  ], "each item of a to-do list, in order: its own words (a nested list's and a held block's apart), checked, its block id, the headings above it (the title none), and which of the same words under the same path it is; none in a template or a script, none of a plain list");

  // ---------- the facts, and the queries ----------
  const now = new Date(2026, 10, 11, 10, 0); // a Wednesday
  const day = (offset, hour = 9) => new Date(2026, 10, 11 + offset, hour, 0);
  writeDocument("plan", "计划", '<ul class="doc-todo"><li>写周报</li><li data-checked>开会</li></ul>', { at: day(0) });
  writeDocument("notes", "笔记", "<p>今天写了五个字</p>", { icon: "📝", at: day(-1) });
  writeDocument("old", "旧文档", '<h2>归档</h2><ul class="doc-todo"><li>整理</li></ul>', { at: day(-10) });
  fs.mkdirSync(path.join(workspace, "components"), { recursive: true }); // no document's folder
  let reads = 0;
  const read = async (slug) => {
    reads += 1;
    const source = await fs.promises.readFile(path.join(workspace, slug, "doc.html"), "utf8").catch(() => null);
    return source === null ? null : { source, text: source };
  };
  const activity = createActivity({ file: layoutOf(workspace).activity, now: () => now, wait: 5 });
  const index = createIndex({ root: workspace, read, activity, now: () => now });
  const ask = async (kind, options) => {
    const [status, answer] = await index.query(kind, options);
    assert.equal(status, 200, JSON.stringify(answer));
    assert.ok(answer.ok && answer.kind === kind && answer.at === now.toISOString(), "{ ok, kind, data, at }, at the time it was read");
    return answer.data;
  };
  const versionOf = (slug) => fileVersion(fs.readFileSync(path.join(workspace, slug, "doc.html"), "utf8"));
  const kinds = ["recent", "todos", "stats"];
  const together = await Promise.all(kinds.map(kind => ask(kind)));
  assert.equal(reads, 3, "concurrent home cards read each document once, not once per card");
  for (let i = 0; i < kinds.length; i++) assert.deepEqual(await ask(kinds[i]), together[i], "coalesced and separate queries have the same answer");
  const [oneList, anotherList] = await Promise.all([index.all(), index.all()]);
  assert.notEqual(oneList, anotherList, "sorting one caller's list must not reorder another's");
  assert.deepEqual(await ask("todos"), [
    { ref: { slug: "plan", block: null, text: "写周报", path: [], nth: 0, version: versionOf("plan") }, text: "写周报", done: false, slug: "plan", title: "计划", icon: null, path: [] },
    { ref: { slug: "plan", block: null, text: "开会", path: [], nth: 0, version: versionOf("plan") }, text: "开会", done: true, slug: "plan", title: "计划", icon: null, path: [] },
    { ref: { slug: "old", block: null, text: "整理", path: ["归档"], nth: 0, version: versionOf("old") }, text: "整理", done: false, slug: "old", title: "旧文档", icon: null, path: ["归档"] },
  ], "todos: [{ ref, text, done, slug, title, icon, path }], of the document edited last first, each in its order; each ref with the version of the file it was read from");
  assert.deepEqual((await ask("todos", { done: false })).map(({ text }) => text), ["写周报", "整理"], "done: false, the open ones");
  assert.deepEqual((await ask("todos", { done: true })).map(({ text }) => text), ["开会"], "done: true, the done ones");
  assert.deepEqual((await ask("todos", { slugs: ["old"] })).map(({ text }) => text), ["整理"], "slugs: those documents' alone");
  assert.deepEqual((await ask("todos", { limit: 1 })).map(({ text }) => text), ["写周报"], "limit: at most that many");
  assert.deepEqual(await ask("recent", { limit: 2 }), [
    { slug: "plan", title: "计划", icon: null, edited: day(0).toISOString() },
    { slug: "notes", title: "笔记", icon: "📝", edited: day(-1).toISOString() },
  ], "recent: [{ slug, title, icon, edited }], the one edited last first, edited an ISO time");
  assert.equal((await ask("recent")).length, 3, "every document but what is no document's (components/)");
  assert.deepEqual(await ask("stats"), { documents: 3, todos: { done: 1, total: 3 }, words: 7 + 6 + 3, editedThisWeek: 2 }, "stats: the documents, the to-dos done of all, the words (the title none: the menu's count), those written since Monday 0:00");
  assert.deepEqual(QUERY_KINDS, ["todos", "recent", "stats", "activity", "table", "document"]);
  assert.deepEqual(FACT_KINDS, ["todos", "recent", "stats", "activity", "table", "document"]);
  // document: one document's own facts, when it was made its doc.json's created, else the earliest its folder and files tell.
  assert.deepEqual(await ask("document", { slug: "notes" }), { slug: "notes", title: "笔记", icon: "📝", created: day(-1).toISOString(), edited: day(-1).toISOString(), editedBy: null, words: 7 },
    "document: { slug, title, icon, created, edited, editedBy, words }; no created written: its files' time, older than the folder made now; no change of it recorded: no writer");
  writeDocument("made", "新建的", "<p>一</p>", { at: day(0, 8) });
  fs.writeFileSync(path.join(workspace, "made", "doc.json"), `${JSON.stringify({ title: "新建的", description: "", created: day(-5, 7).toISOString() }, null, 2)}
`);
  assert.equal((await ask("document", { slug: "made" })).created, day(-5, 7).toISOString(), "its doc.json's created, which Gallery writes as it makes a document");
  assert.deepEqual((await index.query("document", { slug: "nobody" })).slice(0, 1).concat((await index.query("document", { slug: "nobody" }))[1].reason), [404, "missing"], "no such document");
  fs.rmSync(path.join(workspace, "made"), { recursive: true });
  const refused = async (kind, options) => (await index.query(kind, options));
  assert.deepEqual((await refused("nope"))[0], 400, "a kind it does not know: 400");
  assert.equal((await refused("nope"))[1].reason, "kind");
  for (const [kind, options] of [["todos", { done: "yes" }], ["todos", { slugs: "plan" }], ["todos", { limit: 0 }], ["recent", { limit: 1.5 }], ["activity", { days: -1 }], ["stats", []], ["table", {}], ["table", { slug: "plan" }], ["table", { slug: "plan", key: "1x" }], ["table", { slug: "plan", key: "k", where: { a: 1 } }], ["table", { slug: "plan", key: "k", limit: 0 }], ["document", {}], ["document", { slug: "Plan!" }]]) {
    assert.equal((await refused(kind, options))[1].reason, "options", `${kind} ${JSON.stringify(options)}: refused`);
  }
  assert.deepEqual([queryOptions("todos", { limit: 5000 }).options.limit, queryOptions("recent", {}).options.limit, queryOptions("recent", { limit: 99 }).options.limit, queryOptions("activity", {}).options.days, queryOptions("activity", { days: 999 }).options.days],
    [QUERY_LIMITS.todos.most, 10, 50, 365, 371], "each count held to its most, its default where none is given");
  assert.deepEqual([queryOptions("table", { slug: "plan", key: "k" }).options, queryOptions("table", { slug: "plan", key: "k", limit: 5000 }).options.limit], [{ slug: "plan", key: "k", where: {}, limit: 200 }, 1000], "table: its slug and key, where {} and 200 rows where none is given, 1000 at most");

  // ---------- a table of a document ----------
  writeDocument("tasks", "任务", `<div class="doc-table-wrap" data-doc-chart-source="q4"><table>
  <thead><tr><th>任务</th><th>负责人</th><th>状态</th><th data-sort-type="number">工时</th></tr></thead>
  <tbody>
    <tr><td><a href="../plan/doc.html">写周报</a></td><td>我</td><td>未完成</td><td>3</td></tr>
    <tr><td>开会</td><td>小王</td><td>未完成</td><td>1,200</td></tr>
    <tr><td><a href="#b1">整理</a></td><td> 我 </td><td>已完成</td><td>2</td></tr>
    <tr><td>复盘</td><td>我</td><td>未完成</td><td>—</td></tr>
  </tbody></table></div>
  <div class="doc-table-wrap" data-doc-chart-source="merged"><table><thead><tr><th>a</th><th>b</th></tr></thead><tbody><tr><td colspan="2">x</td></tr></tbody></table></div>
  <template><div class="doc-table-wrap" data-doc-chart-source="hidden"><table><tr><th>a</th></tr><tr><td>1</td></tr></table></div></template>`, { at: day(-20) });
  const table = await ask("table", { slug: "tasks", key: "q4" });
  assert.deepEqual(table.columns, ["任务", "负责人", "状态", "工时"], "its header's words");
  assert.deepEqual(table.rows[0], { values: { 任务: "写周报", 负责人: "我", 状态: "未完成", 工时: 3 }, links: [{ slug: "plan", title: "写周报", block: null }] }, "a row: its values by the header's words (a number a number), the links its cells hold to documents");
  assert.deepEqual(table.rows[2].links, [{ slug: "tasks", title: "整理", block: "b1" }], "a link within the document names it");
  assert.equal(table.rows[1].values.工时, 1200, "1,200 a number, as a chart reads it");
  assert.equal(table.rows[3].values.工时, null, "a dash none");
  assert.equal(table.total, 4);
  const mine = await ask("table", { slug: "tasks", key: "q4", where: { 负责人: "我", 状态: "未完成" } });
  assert.deepEqual([mine.rows.map((row) => row.values.任务), mine.total], [["写周报", "复盘"], 2], "where: the rows whose cells hold those words");
  assert.deepEqual((await ask("table", { slug: "tasks", key: "q4", where: { 负责人: "我" }, limit: 1 })).rows.map((row) => row.values.任务), ["写周报"], "limit: the first so many");
  assert.equal((await ask("table", { slug: "tasks", key: "q4", where: { 工时: "1,200" } })).total, 1, "a number's cell by its words as written");
  const tableRefused = async (options) => { const [status, answer] = await index.query("table", options); return [status, answer.reason]; };
  assert.deepEqual(await tableRefused({ slug: "nobody", key: "q4" }), [404, "missing"], "no such document");
  assert.deepEqual(await tableRefused({ slug: "tasks", key: "q5" }), [404, "missing"], "no table of that key");
  assert.deepEqual(await tableRefused({ slug: "tasks", key: "hidden" }), [404, "missing"], "none a template holds");
  assert.deepEqual(await tableRefused({ slug: "tasks", key: "merged" }), [422, "missing"], "one with merged cells: none a view reads");
  assert.deepEqual(await tableRefused({ slug: "tasks", key: "q4", where: { 优先级: "高" } }), [400, "options"], "a column it does not have");
  const tableReads = reads;
  await ask("table", { slug: "tasks", key: "q4" });
  assert.equal(reads, tableReads, "read once until the file changes");
  // Which tables a document's instances asked for (&doc=), kept on disk, and what an export of it embeds.
  assert.equal((await index.query("table", { slug: "tasks", key: "q4" }, { doc: "plan" }))[0], 200);
  await index.stored();
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(workspace, ".gallery", "cache", "workspace", "plan.json"), "utf8")), { tables: ["tasks#q4"] }, "the table plan's instance asked for, kept");
  const shot = await index.snapshot("plan");
  assert.deepEqual(Object.keys(shot), ["todos", "recent", "stats", "activity", "document", "tables"], "every kind, its own document's facts, and the tables its instances asked for");
  assert.equal(shot.document.slug, "plan", "document: the exported document's own");
  assert.deepEqual([shot.todos.length, shot.recent.length, shot.tables["tasks#q4"].rows.length, shot.tables["tasks#q4"].rows[0].words], [3, 4, 4, { 任务: "写周报", 负责人: "我", 状态: "未完成", 工时: "3" }], "each kind's whole answer, a table's rows with their cells' words too (what an export's filter reads)");
  assert.ok(SNAPSHOT_LIMITS.todos === 200 && SNAPSHOT_LIMITS.recent === 50, "the snapshot's bounds");
  assert.equal((await createIndex({ root: workspace, read, now: () => now }).snapshot("plan")).tables["tasks#q4"].total, 4, "another index (an export of the CLI) reads what was asked from disk");
  assert.equal((await index.snapshot("notes")).tables, undefined, "none asked: no tables");
  fs.rmSync(path.join(workspace, "tasks"), { recursive: true });
  fs.rmSync(path.join(workspace, ".gallery", "cache", "workspace"), { recursive: true });
  assert.equal(QUERY_LIMITS.activity.most, KEEP_DAYS, "the record keeps every day a query may ask for (53 weeks, the 编辑热力图's widest)");

  // Read again when its file's time changes, kept otherwise; a doc.json's own change too.
  const before = reads;
  await ask("stats");
  assert.equal(reads, before, "nothing written: nothing read again");
  writeDocument("notes", "笔记", "<p>今天写了五个字，又写了几个</p>", { icon: "📝", at: day(0, 11) });
  assert.equal((await ask("stats")).words, 7 + 11 + 3, "a file written: its facts read again");
  assert.equal(reads, before + 1, "that one alone");
  fs.writeFileSync(path.join(workspace, "notes", "doc.json"), `${JSON.stringify({ title: "随记", icon: "📝" }, null, 2)}\n`);
  assert.equal((await ask("recent", { limit: 1 }))[0].title, "随记", "its doc.json written: its title read again");

  // ---------- what a change changes, and the record ----------
  await index.start();
  const counted = () => activity.days(1)[0];
  const tell = async (slug, by) => index.changed(slug, { ...(await read(slug)), by });
  writeDocument("plan", "计划", '<ul class="doc-todo"><li>写周报</li><li data-checked>开会</li><li>新的一项</li></ul>', { at: day(0, 12) });
  assert.deepEqual(await tell("plan", "reader"), ["todos", "recent", "stats", "activity", "table", "document"], "a to-do added: every kind");
  assert.deepEqual(counted(), { date: dayOf(now), edits: 1, words: 4, reader: { edits: 1, words: 4 }, agent: { edits: 0, words: 0 } }, "the reader's edit counted today, the words it added");
  fs.utimesSync(path.join(workspace, "plan", "doc.html"), day(0, 13), day(0, 13));
  assert.deepEqual(await tell("plan", "agent"), ["recent", "stats", "document"], "the same text written again: its time alone, no edit counted, no to-do changed");
  assert.equal(counted().edits, 1);
  assert.equal((await ask("document", { slug: "plan" })).editedBy, "reader", "editedBy: who made its last change of text, the same text written again by another none");
  writeDocument("notes", "随记", "<p>短</p>", { icon: "📝", at: day(0, 14) });
  assert.deepEqual(await tell("notes", "agent"), ["todos", "recent", "stats", "activity", "table", "document"], "its words, and its title since the pages were last told of it (笔记: its doc.json's write above was read by a query, never announced here), which the to-dos carry");
  assert.deepEqual(counted(), { date: dayOf(now), edits: 2, words: 4 - 11, reader: { edits: 1, words: 4 }, agent: { edits: 1, words: -11 } }, "the Agent's apart, a write that took words away a net change below 0");
  assert.equal((await ask("document", { slug: "notes" })).editedBy, "agent", "editedBy: the Agent's write");
  fs.rmSync(path.join(workspace, "old"), { recursive: true });
  assert.deepEqual(await index.changed("old", { source: null }), ["todos", "recent", "stats", "table", "document"], "a document gone: its lists, no edit counted");
  await activity.flush();
  const kept = JSON.parse(fs.readFileSync(layoutOf(workspace).activity, "utf8"));
  assert.equal(kept.version, ACTIVITY_VERSION);
  assert.deepEqual(kept.days[dayOf(now)], { plan: { reader: [1, 4] }, notes: { agent: [1, -11] } }, ".gallery/state/activity.json: by day and document, [edits, words] the reader's and the Agent's apart");
  assert.ok(kept.seen.old && kept.seen.plan.hash && Number.isInteger(kept.seen.plan.words), "what was seen of each document (a document gone kept, for the trash may give it back)");
  assert.deepEqual([kept.seen.plan.by, kept.seen.notes.by], ["reader", "agent"], "and who made its last change of text");

  // A start: what was written while no server ran counted on its file's day, the Agent's (the record kept
  // since a week ago: a day before it started is counted on the day it did).
  fs.writeFileSync(layoutOf(workspace).activity, JSON.stringify({ ...kept, since: dayAfter(dayOf(now), -7) }));
  writeDocument("notes", "随记", "<p>短短的一段话</p>", { icon: "📝", at: day(-2, 20) });
  writeDocument("fresh", "新文档", "<p>一二三</p>", { at: day(-1, 8) });
  const later = createActivity({ file: layoutOf(workspace).activity, now: () => now, wait: 5 });
  const restarted = createIndex({ root: workspace, read, activity: later, now: () => now });
  assert.equal(await restarted.start(), 2, "two documents written while none ran: counted");
  const byDay = new Map(later.days(7).map((entry) => [entry.date, entry]));
  assert.deepEqual(byDay.get(dayOf(day(-2))).agent, { edits: 1, words: 5 }, "on its file's day, the Agent's, the words it added since it was seen");
  assert.deepEqual(byDay.get(dayOf(day(-1))).agent, { edits: 1, words: 3 }, "one never seen: all its words");
  assert.deepEqual([later.writer("notes"), later.writer("fresh"), later.writer("plan")], ["agent", "agent", "reader"], "written while none ran: the Agent's; one unchanged keeps its writer, read back from the file");
  await later.flush();
  assert.equal(await createIndex({ root: workspace, read, activity: createActivity({ file: layoutOf(workspace).activity, now: () => now }), now: () => now }).start(), 0, "nothing written since: nothing counted");

  // days(): from the day the record started, a day of none 0; a year kept; one that does not read starts again.
  assert.equal(later.since, dayAfter(dayOf(now), -7), "the day the record started, as its file says");
  assert.deepEqual(later.days(365).map(({ date }) => date), Array.from({ length: 8 }, (_, back) => dayAfter(dayOf(now), back - 7)), "nothing before the day it started, a day of none 0");
  assert.deepEqual(later.days(365)[0], { date: dayAfter(dayOf(now), -7), edits: 0, words: 0, reader: { edits: 0, words: 0 }, agent: { edits: 0, words: 0 } });
  fs.writeFileSync(layoutOf(workspace).activity, "{ half");
  const lost = createActivity({ file: layoutOf(workspace).activity, now: () => now, wait: 5 });
  assert.equal(await createIndex({ root: workspace, read, activity: lost, now: () => now }).start(), 0, "a record that does not read: starts again, nothing counted for what came before");
  await lost.flush();
  assert.equal(JSON.parse(fs.readFileSync(layoutOf(workspace).activity, "utf8")).since, dayOf(now), "written again, from today");
  const yearAgo = dayAfter(dayOf(now), -400);
  fs.writeFileSync(layoutOf(workspace).activity, JSON.stringify({ version: 1, since: yearAgo, days: { [yearAgo]: { plan: { reader: [3, 30] } }, [dayAfter(dayOf(now), -3)]: { plan: { agent: [2, 20] } } }, seen: {} }));
  const long = createActivity({ file: layoutOf(workspace).activity, now: () => now, wait: 5 });
  await long.load();
  const year = long.days(400);
  assert.ok(KEEP_DAYS === 53 * 7 && year.length === KEEP_DAYS && year[0].date === dayAfter(dayOf(now), -(KEEP_DAYS - 1)) && year.at(-1).date === dayOf(now), "53 weeks at most, to today");
  assert.deepEqual(year.find(({ date }) => date === dayAfter(dayOf(now), -3)), { date: dayAfter(dayOf(now), -3), edits: 2, words: 20, reader: { edits: 0, words: 0 }, agent: { edits: 2, words: 20 } });
  long.record("plan", { hash: "another", words: 1, mtime: 1, by: "reader" });
  await long.flush();
  const pruned = JSON.parse(fs.readFileSync(layoutOf(workspace).activity, "utf8"));
  assert.ok(!pruned.days[yearAgo] && pruned.since === dayAfter(dayOf(now), -(KEEP_DAYS - 1)), "the days before the year go as it is written");

  // A read between a write and its announcement (a page's query, the menu's count, the search's lines) reads
  // the new facts already: the announcement still tells each kind changed since the pages were last told of
  // the document (here its first read), and then nothing for the same text again. (Weighed against the
  // facts a query read, it told none: the pages that read before the write kept the old to-dos.)
  {
    const between = createIndex({ root: workspace, read, now: () => now });
    writeDocument("between", "之间", '<ul class="doc-todo"><li>一</li></ul>', { at: day(0, 9) });
    assert.equal((await between.query("todos", { slugs: ["between"] }))[1].data.length, 1);
    writeDocument("between", "之间", '<ul class="doc-todo"><li>一</li><li>二</li></ul>', { at: day(0, 10) });
    assert.equal((await between.facts("between")).todos.length, 2, "the menu's count, between the write and its announcement: the new file read");
    assert.ok(await between.lines("between", null), "the search's lines too");
    assert.deepEqual(await between.changed("between", await read("between")), ["todos", "recent", "stats", "table", "document"], "the announcement tells what changed since the pages were told, whatever was read meanwhile");
    assert.deepEqual(await between.changed("between", await read("between")), [], "once: the same text told again changes nothing");
    writeDocument("between", "之间", '<ul class="doc-todo"><li>一</li><li>二</li></ul><p>又写了几个字</p>', { at: day(0, 11) });
    assert.deepEqual(await between.changed("between", await read("between")), ["recent", "stats", "table", "document"], "words alone: no to-do changed (its text did: any table of it may have)");
    // An item without an id that has a twin is found by its place, which its ref's version vouches for only
    // while the file is that one: the document tells its to-dos changed whenever its text does (the pages hold
    // refs that say the version it has now); one whose twins all have ids, or that has none, does not.
    writeDocument("twins", "双胞胎", '<h2>本周</h2><ul class="doc-todo"><li>读书</li><li>读书</li></ul>', { at: day(0, 12) });
    writeDocument("ided", "有编号", '<h2>本周</h2><ul class="doc-todo"><li data-block-id="aaaa0001">读书</li><li data-block-id="aaaa0002">读书</li></ul>', { at: day(0, 12) });
    await between.changed("twins", await read("twins"));
    await between.changed("ided", await read("ided"));
    writeDocument("twins", "双胞胎", '<h2>本周</h2><ul class="doc-todo"><li>读书</li><li>读书</li></ul><p>又写了一句</p>', { at: day(0, 13) });
    writeDocument("ided", "有编号", '<h2>本周</h2><ul class="doc-todo"><li data-block-id="aaaa0001">读书</li><li data-block-id="aaaa0002">读书</li></ul><p>又写了一句</p>', { at: day(0, 13) });
    assert.deepEqual(await between.changed("twins", await read("twins")), ["todos", "recent", "stats", "table", "document"], "a twin without an id: the text changed elsewhere, its refs' version is told again");
    assert.deepEqual(await between.changed("ided", await read("ided")), ["recent", "stats", "table", "document"], "twins that have ids are found by them: no to-do told");
  }

  // Never a file held half written: the facts read a document as its pages are served it (readOf, the edit
  // service's readTaken, as the server's facts do), so that while the Agent is between two edits of one
  // change its to-dos and words are those of what the preview last took, which the document's page shows;
  // read again each time until it is taken, its file's time the same then.
  {
    const edits = createEditService({ reportsDirectory: workspace, settling: { hold: 600, wait: 0 } });
    const served = createIndex({ root: workspace, read: readOf(edits), now: () => now });
    const file = path.join(workspace, "moved", "doc.html");
    const list = '<ul class="doc-todo"><li>一</li></ul>';
    writeDocument("moved", "搬家", `<p>清单</p>\n${list}`);
    const texts = async () => (await served.facts("moved")).todos.map(({ text }) => text);
    assert.deepEqual(await texts(), ["一"], "taken");
    // The Agent moves the list into a disclosure in two edits: first the disclosure and a copy (its end comes with the next).
    fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("<p>清单</p>", `<details><summary>清单</summary>${list}`));
    const caught = Date.now();
    assert.deepEqual(await texts(), ["一"], "held half written: what its page is served, the list once");
    assert.equal((await served.query("todos", { slugs: ["moved"] }))[1].data.length, 1, "a query too");
    assert.deepEqual(todosOf((await edits.readTaken("moved", { wait: 0 })).text).map(({ text }) => text), ["一"], "as the page is served it");
    assert.ok(Date.now() - caught < 600, "read while it was held");
    await new Promise((resolve) => setTimeout(resolve, 700 - (Date.now() - caught)));
    assert.deepEqual(await texts(), ["一", "一"], "held no longer (its author's, odd as it is): read again though its time is the same, as its page is served it now");
  }

  // ---------- the page's live script ----------
  // A document's page (one of the test's workspace) as the server serves it: its live script run with
  // an EventSource of the test's, every message it does not know ignored, "data <kind>" told to the kit.
  writeDocument("live", "实时", "<p>一段正文</p>");
  const routes = createRoutes({ reportsDirectory: workspace, logger: { info() {}, warn() {}, error() {} } });
  const served = await new Promise((resolve, reject) => {
    const response = { statusCode: 200, setHeader() {}, end: (body) => resolve(String(body)) };
    routes.handle({ url: "/generated/live.html", method: "GET", headers: { host: "127.0.0.1:4999" }, socket: { localPort: 4999 } }, response, (error) => reject(error ?? new Error("passed on")));
  });
  const script = [...served.matchAll(/<script(?: data-doc-dev)?>([\s\S]*?)<\/script>/g)].map((found) => found[1]).find((text) => text.includes("new EventSource"));
  assert.ok(script, "the page's live script");
  const dom = new JSDOM("<!doctype html><html><head></head><body></body></html>", { runScripts: "outside-only", url: "http://127.0.0.1:4999/generated/live.html" });
  const { window } = dom;
  const told = { reloads: 0, data: [] };
  // A source as a test stubs one (catalogLeftAlone's): no addEventListener, its handlers properties alone.
  class FakeSource {
    constructor() {
      window.__source = this;
    }
  }
  window.EventSource = FakeSource;
  window.__galleryEditReload = () => { told.reloads += 1; };
  window.addEventListener("doc-workspace-change", (event) => told.data.push(event.detail));
  window.eval(`(() => { const current = document.createElement("script"); document.head.append(current); Object.defineProperty(document, "currentScript", { value: current, configurable: true }); })();\n${script}`);
  const say = (data) => window.__source.onmessage({ data });
  for (const message of ["workspace 123", "nonsense", "page abc", "data todos", "data activity"]) say(message);
  assert.deepEqual(told, { reloads: 0, data: ["todos", "activity"] }, "a message it does not know changes nothing (no reload); data <kind> told to the kit");
  say("report 0000000000000000");
  assert.equal(told.reloads, 1, "a report's change of another version shows it again, as before");
  window.__source.onerror();
  window.__source.onopen();
  assert.deepEqual(told.data.slice(2), FACT_KINDS, "the stream back after it was lost: each kind told as changed, the blocks read again");
  await routes.close();
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
console.log("Checked the workspace's facts: a document's to-dos (their words, headings, nth, block ids, done), the queries' shapes and order and their options' bounds, a document's own facts (when it was made: its doc.json's created, else its files' time; who last changed its text), a kind unknown refused, a keyed table of a document read, filtered and refused as it should be, the tables a document asked for kept and its export's snapshot, each ref carrying its file's version, facts read again by a file's time alone; the kinds a change changes since the pages were last told, a read between a write and its announcement hiding none; never a file held half written, read again once taken; the record of edits (the reader's and the Agent's apart, a net change of words, the same text no edit, what was written while no server ran counted on its file's day, a record that does not read starting again, 53 weeks kept); the page's live script ignoring a message it does not know.");
