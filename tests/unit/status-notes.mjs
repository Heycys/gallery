import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createAnnotations } from "../../src/editor/annotations.mjs";
import { cleanItem, markItems, readItems, unknownIds, withoutItems } from "../../src/shared/annotations.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { portIsFree, processRuns } from "../../src/shared/preview-server.mjs";
import { ALIVE_FOR, BLOCKS_MOST, WORDS_MOST, cleanReport, cutWords, saveOf } from "../../src/shared/presence.mjs";
import { createPresence, describeTab } from "../../src/workbench/presence.mjs";
import { noteLines } from "../../src/cli/notes.mjs";
import { problemOf, statusLines } from "../../src/cli/status.mjs";

// gallery status and gallery notes (decided 2026-11-11).
//
// Status: what a workbench tab reports (shared/presence.mjs cleanReport: the shape, the cuts), the server's memory of the tabs
// (src/workbench/presence.mjs: the one used last first, a heartbeat that is not use, a tab that closed or stopped reporting
// gone), the words the command prints (a 问题： line for a document that is not saved), and, against a real server, the routes'
// checks (Host, Origin, the token) and the command's answer, with the server and without.
//
// Notes: the shared functions (done, removal), the edit service's annotations (done and undone, removal by ids / done / all, an id
// it does not have refusing the whole request, a removal by a command offered back to a page, a rewritten suggestion no longer
// done, 复制批注 leaving done ones out, a store that never checks), and the command, through a server and by itself.

const run = promisify(execFile);

// ---------- a report ----------
{
  const base = { tab: "tab12345", entry: "weekly", kind: "document", title: "周报", visible: true, focused: true, touched: true, flags: { editing: true, pending: false, saving: false, offline: false, conflicts: 0, unfit: 0, changed: false }, notes: 2, caret: null, selection: null };
  assert.deepEqual(cleanReport(base), base, "a report as it is");
  assert.deepEqual(cleanReport({ tab: "tab12345", gone: true, entry: "x" }), { tab: "tab12345", gone: true }, "a tab that closed says nothing else");
  for (const bad of [null, [], "x", { entry: "weekly", kind: "document" }, { ...base, tab: "no spaces!" }, { ...base, tab: "x" }, { ...base, entry: "../etc" }, { ...base, entry: "Weekly" }, { ...base, entry: "~weekly/x" },
    { ...base, kind: "link" }, { ...base, kind: "page" }, { ...base, entry: "@home", kind: "document" }, { ...base, entry: "x".repeat(200) }]) assert.equal(cleanReport(bad), null, JSON.stringify(bad).slice(0, 80));
  assert.equal(cleanReport({ ...base, entry: "@home", kind: "page" })?.entry, "@home", "a custom page");
  assert.equal(cleanReport({ ...base, entry: "~ws-0a1b2c/weekly" })?.entry, "~ws-0a1b2c/weekly", "a document of another workspace");
  assert.equal(cleanReport({ ...base, entry: "@~ws-0a1b2c/home", kind: "page" })?.entry, "@~ws-0a1b2c/home");
  // Cut to what it may be: the words 200 characters, 20 blocks at most, an id an id, counts numbers.
  const long = "字".repeat(500);
  const cut = cleanReport({ ...base, caret: { block: "abcd1234", text: long }, selection: { kind: "text", blocks: Array.from({ length: 30 }, (_, at) => `blk${String(at).padStart(5, "0")}`).concat(["NOT AN ID"]), text: `  ${long}  `, length: 500 }, flags: { conflicts: 3.5, pending: "yes" }, notes: -4 });
  assert.equal([...cut.caret.text].length, WORDS_MOST);
  assert.equal([...cut.selection.text].length, WORDS_MOST);
  assert.equal(cut.selection.truncated, true);
  assert.equal(cut.selection.blocks.length, BLOCKS_MOST);
  assert.equal(cut.selection.length, 500);
  assert.deepEqual([cut.flags.conflicts, cut.flags.pending, cut.notes], [0, false, 0], "only what is a number or true counts");
  assert.deepEqual(cleanReport({ ...base, caret: { block: "not an id", text: "a\n\n b" } }).caret, { block: null, text: "a b" }, "a block the file has no id for: null; white space as one");
  assert.deepEqual(cutWords("a​  b\n c", 5), { text: "a b c", more: false });
  assert.deepEqual(cutWords("a​  b\n c", 3), { text: "a b", more: true });
  assert.deepEqual(cutWords("abcdef", 3), { text: "abc", more: true });
  // Where saving stands, as one word: a conflict first, then offline, then waiting.
  assert.equal(saveOf({}), "saved");
  assert.equal(saveOf({ editing: true, changed: true }), "saved", "the file changed elsewhere is not the reader's to settle");
  assert.equal(saveOf({ pending: true }), "pending");
  assert.equal(saveOf({ saving: true }), "pending");
  assert.equal(saveOf({ pending: true, offline: true }), "offline");
  assert.equal(saveOf({ pending: true, offline: true, conflicts: 1 }), "conflict");
}

// ---------- the server's memory of the tabs ----------
{
  let time = 1_000_000;
  const presence = createPresence({ now: () => time });
  const report = (tab, fields = {}) => presence.report({ tab, entry: "weekly", kind: "document", title: "周报", visible: true, focused: false, touched: false, flags: {}, notes: 0, ...fields });
  assert.deepEqual(presence.list(), [], "none yet");
  assert.deepEqual(presence.report({ tab: "bad tab" }), { ok: false }, "no report");
  assert.deepEqual(report("tabaaaa1", { touched: true }), { ok: true });
  time += 5000;
  report("tabbbbb2", { entry: "notes-2", touched: true });
  assert.deepEqual(presence.list().map((record) => record.tab), ["tabbbbb2", "tabaaaa1"], "the one used last first");
  // A heartbeat is not use: the first stays the older one, whatever it reports.
  time += 5000;
  report("tabaaaa1", { touched: false, notes: 3 });
  assert.deepEqual(presence.list().map((record) => record.tab), ["tabbbbb2", "tabaaaa1"]);
  assert.equal(presence.list()[1].notes, 3, "but what it says is taken");
  // Doing something there, or showing another document, is use.
  time += 1000;
  report("tabaaaa1", { touched: true });
  assert.deepEqual(presence.list().map((record) => record.tab), ["tabaaaa1", "tabbbbb2"]);
  time += 1000;
  report("tabbbbb2", { entry: "other-doc" });
  assert.deepEqual(presence.list().map((record) => record.tab), ["tabbbbb2", "tabaaaa1"], "another document in the tab: used");
  // How it is described (describeTab): the facts the server found, the idle seconds, the save word.
  const [first] = presence.list();
  const said = describeTab(first, { file: "/x/other-doc/doc.html", workspace: "/x" }, time + 7400);
  assert.deepEqual([said.slug, said.kind, said.file, said.workspace, said.idle, said.save, said.caret, said.selection], ["other-doc", "document", "/x/other-doc/doc.html", "/x", 7, "saved", null, null]);
  assert.equal(describeTab({ ...first, entry: "@home", kind: "page" }, {}, time).slug, "home", "a custom page: its slug, kind page");
  // A tab that closed is gone; one that stopped reporting goes after ALIVE_FOR.
  presence.report({ tab: "tabbbbb2", gone: true });
  assert.deepEqual(presence.list().map((record) => record.tab), ["tabaaaa1"]);
  report("tabaaaa1");
  time += ALIVE_FOR - 1;
  assert.equal(presence.list().length, 1, "still there just before");
  time += 2;
  assert.deepEqual(presence.list(), [], "gone when it has not reported for ALIVE_FOR");
}

// ---------- what the command prints ----------
{
  const entry = (fields) => ({ tab: "t1", kind: "document", slug: "weekly", title: "周报", file: "/ws/weekly/doc.html", workspace: "/ws", visible: true, focused: true, idle: 3, save: "saved", conflicts: 0, notes: 0, caret: null, selection: null, ...fields });
  assert.deepEqual(statusLines({ open: [] }, 8080), ["Gallery 在运行（端口 8080），浏览器里没有打开的文档。"]);
  const lines = statusLines({ open: [entry({ selection: { kind: "text", blocks: ["b3k2m9xa"], text: "选中的字", truncated: false }, notes: 2 }), entry({ tab: "t2", slug: "notes", title: "", visible: false, focused: false, idle: 700, caret: { block: null, text: "" } })] }, 8080);
  assert.ok(lines[0].includes("2 个"), lines[0]);
  assert.ok(lines.some((line) => /^1\. weekly（周报）\s+最近用的$/.test(line)), lines.join("\n"));
  assert.ok(lines.includes("   选中：「选中的字」（块 b3k2m9xa）"));
  assert.ok(lines.includes("   批注：2 条"));
  assert.ok(lines.includes("   标签页在后台，12 分钟前有操作"), "an idle tab in the background");
  assert.ok(lines.some((line) => line.startsWith("   光标在一个文件里还没有 id 的块")), "a caret in a block with no id");
  assert.ok(lines.some((line) => line.startsWith("提示：") && line.includes("/ws/weekly/doc.html") && line.includes("data-block-id")), "how to find the reader's place");
  assert.ok(!lines.some((line) => line.startsWith("问题：")), "saved: no problem");
  // A document that is not saved: a 问题： line at the start of a line, naming what to do first.
  for (const [save, extra] of [["pending", {}], ["conflict", { conflicts: 2 }], ["offline", {}]]) {
    const problem = problemOf(entry({ save, ...extra }));
    assert.ok(problem.startsWith("weekly ") && problem.includes("先让用户"), `${save}: ${problem}`);
    assert.ok(statusLines({ open: [entry({ save, ...extra })] }, 1).includes(`问题：${problem}`));
  }
  assert.ok(problemOf(entry({ save: "conflict", conflicts: 2 })).includes("2 处冲突"));
  assert.equal(problemOf(entry()), null);
  assert.ok(problemOf(entry({ kind: "page", slug: "home", save: "pending" })).startsWith("自定义页 home"));
}

// ---------- the shared functions of 批注 ----------
const note = (id, extra = {}) => ({ id, text: `建议 ${id}`, anchor: { kind: "text", blocks: ["paraaaaa"], quote: "读者可以在右上角切换成全宽", prefix: "，", suffix: "。" }, ...extra });
{
  assert.equal(cleanItem(note("note0001", { done: true })).done, true, "done is kept");
  assert.equal("done" in cleanItem(note("note0001", { done: false })), false, "and left out when it is not");
  assert.equal("done" in cleanItem(note("note0001", { done: "yes" })), false, "only true counts");
  const items = ["note0001", "note0002", "note0003"].map((id) => cleanItem(note(id)));
  const marked = markItems(items, ["note0002", "nobody01"], true, "2026-11-11T00:00:00.000Z");
  assert.deepEqual(marked.map((item) => item.done === true), [false, true, false]);
  assert.equal(marked[1].updated, "2026-11-11T00:00:00.000Z", "marked: updated");
  assert.equal(marked[0], items[0], "the others as they were");
  assert.equal(markItems(marked, ["note0002"], true)[1], marked[1], "marking a done one again changes nothing");
  assert.equal("done" in markItems(marked, ["note0002"], false)[1], false, "undone");
  assert.deepEqual(unknownIds(items, ["note0001", "nobody01", "nobody02"]), ["nobody01", "nobody02"]);
  const taken = withoutItems(marked, { ids: ["note0001"] });
  assert.deepEqual([taken.items.map((item) => item.id), taken.removed.map((item) => item.id)], [["note0002", "note0003"], ["note0001"]]);
  assert.deepEqual(withoutItems(marked, { done: true }).removed.map((item) => item.id), ["note0002"], "the done ones");
  assert.deepEqual(withoutItems(marked, { all: true }).items, [], "all");
  assert.deepEqual(withoutItems(marked, { ids: [] }).removed, [], "no ids, nothing");
  // The file keeps the mark, and a file without one reads as before.
  assert.equal(readItems(JSON.stringify({ v: 1, items: marked })).find((item) => item.id === "note0002").done, true);
  assert.equal(readItems(JSON.stringify({ v: 1, items })).some((item) => "done" in item), false);
}

// ---------- the edit service's annotations ----------
const page = (body) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>示例</title></head><body><main class="doc-page" data-doc-id="demo"><header class="doc-header"><h1 class="doc-title">示例</h1></header>${body}</main></body></html>`;
const BODY = '<h2 data-block-id="headaaaa">页面结构</h2><p data-block-id="paraaaaa">读者可以在右上角切换成全宽。</p><p data-block-id="parbbbbb">第二段在这里写一些别的话。</p><p data-block-id="parccccc">第三段还有一些话要说。</p>';
const QUOTES = { note0001: "读者可以在右上角切换成全宽", note0002: "第二段在这里写一些别的话", note0003: "第三段还有一些话要说" };
const anchorOf = (id) => ({ kind: "text", blocks: [{ note0001: "paraaaaa", note0002: "parbbbbb", note0003: "parccccc" }[id]], quote: QUOTES[id], prefix: "", suffix: "。" });
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "status-notes-"));
  const directory = path.join(root, "demo");
  await fs.mkdir(directory, { recursive: true });
  const source = page(BODY);
  await fs.writeFile(path.join(directory, "doc.html"), source);
  await fs.writeFile(path.join(directory, "doc.json"), JSON.stringify({ title: "示例报告" }));
  let time = 5_000_000;
  const store = createAnnotations({ reportsDirectory: root, read: async (slug) => (slug === "demo" ? { text: source } : null), now: () => time });
  const file = () => fs.readFile(path.join(directory, "annotations.json"), "utf8").then(JSON.parse, () => null);
  for (const id of ["note0001", "note0002", "note0003"]) await store.change({ slug: "demo", put: { id, text: `建议 ${id}`, anchor: anchorOf(id) } });
  const ids = (body) => body.items.map((item) => item.id);

  // The list: every one, with what an Agent acts by; the copy leaves done ones out.
  let [status, body] = await store.notes("demo");
  assert.equal(status, 200);
  assert.deepEqual(body.items.map((item) => [item.id, item.blocks.join(), item.done, item.where.join(" › "), item.quote]), [
    ["note0001", "paraaaaa", false, "页面结构", QUOTES.note0001], ["note0002", "parbbbbb", false, "页面结构", QUOTES.note0002], ["note0003", "parccccc", false, "页面结构", QUOTES.note0003]]);
  assert.ok(body.items.every((item) => typeof item.created === "string" && typeof item.updated === "string"));
  assert.equal(body.title, "示例报告");
  assert.equal(body.path, path.resolve(root, "demo", "doc.html"));

  // Done: the file says so, the list says so, the copy leaves it out, undone puts it back.
  [status, body] = await store.change({ slug: "demo", done: ["note0002"] });
  assert.equal(status, 200);
  assert.deepEqual(body.items.map((item) => [item.id, item.done === true]), [["note0001", false], ["note0002", true], ["note0003", false]]);
  assert.equal((await file()).items[1].done, true, "written");
  assert.equal("done" in (await file()).items[0], false);
  assert.deepEqual((await store.copy("demo"))[1].items.map((item) => item.blocks.join()), ["paraaaaa", "parccccc"], "复制批注 leaves the done one out");
  assert.deepEqual((await store.notes("demo"))[1].items.map((item) => item.done), [false, true, false], "the list has it, marked");
  [, body] = await store.change({ slug: "demo", undone: ["note0002"] });
  assert.equal(body.items.some((item) => item.done), false);
  await store.change({ slug: "demo", done: ["note0002", "note0003"] });

  // Rewritten, a done suggestion is a new one; the same words saved again stay done.
  [, body] = await store.change({ slug: "demo", put: { id: "note0002", text: "建议 note0002", anchor: anchorOf("note0002") } });
  assert.equal(body.items.find((item) => item.id === "note0002").done, true, "the page saving the same words: still done");
  [, body] = await store.change({ slug: "demo", put: { id: "note0002", text: "改了主意", anchor: anchorOf("note0002") } });
  assert.equal(body.items.find((item) => item.id === "note0002").done, undefined, "new words: not done");

  // An id that is not there refuses the whole request, nothing written.
  const before = await fs.readFile(path.join(directory, "annotations.json"), "utf8");
  for (const request of [{ done: ["note0001", "nobody01"] }, { undone: ["nobody01"] }, { removeIds: ["note0001", "nobody01", "nobody02"] }]) {
    [status, body] = await store.change({ slug: "demo", ...request });
    assert.deepEqual([status, body.reason, body.ids?.[0]], [404, "ids", body.ids?.[0]], JSON.stringify(request));
  }
  assert.deepEqual((await store.change({ slug: "demo", removeIds: ["nobody01", "nobody02"] }))[1].ids, ["nobody01", "nobody02"]);
  assert.equal(await fs.readFile(path.join(directory, "annotations.json"), "utf8"), before, "the file as it was");
  assert.equal((await store.change({ slug: "demo", done: [3] }))[0], 400, "ids are strings");
  assert.equal((await store.change({ slug: "missing", done: ["note0001"] }))[0], 404);

  // Removal: by ids, the done ones, all. `removed` is what 撤销 puts back. A command's removal is offered to the page.
  [, body] = await store.change({ slug: "demo", removeIds: ["note0001"] });
  assert.deepEqual([ids(body), body.removed.map((item) => item.id), body.commandRemoved], [["note0002", "note0003"], ["note0001"], undefined], "a removal of the page's own: not offered back by the server");
  [, body] = await store.change({ slug: "demo", restore: body.removed });
  assert.deepEqual(ids(body).sort(), ["note0001", "note0002", "note0003"]);
  [, body] = await store.change({ slug: "demo", removeDone: true, by: "command" });
  assert.deepEqual([ids(body), body.removed.map((item) => item.id)], [["note0001", "note0002"], ["note0003"]], "the done ones taken out");
  assert.deepEqual(body.commandRemoved, { at: time, items: body.removed }, "a command's: kept, in this answer");
  assert.deepEqual((await store.list("demo"))[1].commandRemoved.items.map((item) => item.id), ["note0003"], "and in the answers after it");
  time += 2 * 60 * 1000 + 1;
  assert.equal((await store.list("demo"))[1].commandRemoved, undefined, "offered for two minutes");
  [, body] = await store.change({ slug: "demo", removeDone: true, by: "command" });
  assert.deepEqual([body.removed, body.commandRemoved], [[], undefined], "none done: nothing removed, nothing offered");
  await store.change({ slug: "demo", done: ["note0001"] });
  [, body] = await store.change({ slug: "demo", removeIds: ["note0001"], by: "command" });
  assert.equal(body.commandRemoved.items[0].id, "note0001");
  [, body] = await store.change({ slug: "demo", restore: body.removed });
  assert.equal(body.commandRemoved, undefined, "put back: no longer offered");
  [, body] = await store.change({ slug: "demo", put: { id: "note0002", text: "新写的", anchor: anchorOf("note0002") } });
  [, body] = await store.change({ slug: "demo", clear: true, by: "command" });
  assert.deepEqual([ids(body), body.removed.length, body.commandRemoved.items.length], [[], 2, 2], "all, as 全部删除 does");
  assert.equal(await file(), null, "nothing left: no file");
  [, body] = await store.change({ slug: "demo", put: { id: "note0001", text: "又一条", anchor: anchorOf("note0001") } });
  assert.equal(body.commandRemoved, undefined, "the page writing again: nothing offered any more");

  // A store that never checks (gallery notes with no server running) deletes and rewrites nothing: an annotation whose words are
  // gone from the document is listed as it is.
  const stale = { id: "gone0001", text: "字已经没有了", anchor: { kind: "text", blocks: ["paraaaaa"], quote: "这句话在文档里根本找不到的内容", prefix: "", suffix: "" } };
  await fs.writeFile(path.join(directory, "annotations.json"), `${JSON.stringify({ v: 1, items: [cleanItem(note("note0001")), cleanItem(stale)] }, null, 2)}\n`);
  const unchecked = createAnnotations({ reportsDirectory: root, read: async () => ({ text: source }), verify: false });
  const textBefore = await fs.readFile(path.join(directory, "annotations.json"), "utf8");
  [status, body] = await unchecked.notes("demo");
  assert.deepEqual([status, ids(body)], [200, ["note0001", "gone0001"]]);
  assert.equal(await fs.readFile(path.join(directory, "annotations.json"), "utf8"), textBefore, "looking changes nothing");
  [, body] = await unchecked.change({ slug: "demo", done: ["gone0001"] });
  assert.deepEqual(ids(body), ["note0001", "gone0001"], "marking keeps the one whose words are gone");
  assert.equal((await file()).items[1].done, true);
  const checked = createAnnotations({ reportsDirectory: root, read: async () => ({ text: source }) });
  assert.deepEqual(ids((await checked.list("demo"))[1]), ["note0001"], "(the checking service deletes it, as ever)");

  // The lines the command prints.
  const lines = noteLines("demo", { title: "示例报告", items: [{ id: "note0001", where: ["页面结构"], blocks: ["paraaaaa"], whole: false, quote: "读者可以", text: "补一句\n再补一句", done: false }, { id: "note0002", where: [], blocks: [], whole: true, quote: "", text: "整块", done: true }] });
  assert.equal(lines[0], "demo（示例报告）有 2 条批注，其中 1 条已处理：");
  assert.ok(lines.includes("1. note0001"), lines.join("\n"));
  assert.ok(lines.includes("2. note0002  已处理"));
  assert.ok(lines.includes("   块 paraaaaa；位置：页面结构"));
  assert.ok(lines.includes("   原文：（整块，没有文字）"));
  assert.ok(lines.includes("   建议：补一句\n   再补一句"), "a suggestion of two lines stays under its number");
  assert.ok(lines.at(-1).startsWith("提示：") && lines.at(-1).includes("gallery notes done demo"));
  assert.deepEqual(noteLines("demo", { title: "demo", items: [] }), ["demo没有批注。"]);
  await fs.rm(root, { recursive: true, force: true });
}

// ---------- against a real server, and without ----------
const root = await fs.mkdtemp(path.join(os.tmpdir(), "status-notes-cli-"));
const workspace = path.join(root, "ws");
const data = path.join(root, "data");
const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
const [low, high] = (/^(\d+)-(\d+)$/.exec(process.env.GALLERY_TEST_PORTS ?? "") ?? [0, 4200, 4260]).slice(1).map(Number);
async function freePort() {
  for (let port = high; port >= low; port--) if (await portIsFree(port)) return port;
  throw new Error(`No free port in ${low}-${high}`);
}
const started = new Set();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const gallery = async (args, env = {}) => {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, "--workspace", workspace, ...args], { cwd: root, env: { ...process.env, GALLERY_DEFAULT_WORKSPACE: workspace, GALLERY_DATA_DIR: data, GALLERY_NO_BROWSER: "1", GALLERY_NO_UPDATE_CHECK: "1", GALLERY_NO_DEFAULT_TREE: "1", ...env } });
  return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
const announced = async () => JSON.parse(await fs.readFile(path.join(data, "server.json"), "utf8").catch(() => "null"));
const json = (result) => JSON.parse(result.stdout);

try {
  // No server: one sentence, exit 0; nothing started, no workspace made by asking.
  let result = await gallery(["status"]);
  assert.deepEqual([result.code, result.stdout.trim()], [0, "Gallery 没在运行，浏览器里没有打开的文档。"], result.stderr);
  result = await gallery(["status", "--json"]);
  assert.deepEqual([result.code, json(result)], [0, { running: false, open: [] }]);
  assert.equal(await announced(), null, "asking started no server");
  result = await gallery(["status", "weekly"]);
  assert.equal(result.code, 2, "status takes no document");
  result = await gallery(["status", "--bogus"]);
  assert.equal(result.code, 2);

  // The document, with annotations, before any server: gallery notes by itself.
  const made = await gallery(["new", "weekly", "周报", "--no-browser"], { GALLERY_PORT: String(await freePort()) });
  assert.equal(made.code, 0, made.stdout + made.stderr);
  const server = await announced();
  started.add(server.pid);
  assert.equal((await gallery(["stop"])).code, 0, "stopped: the commands below run by themselves");
  started.delete(server.pid);
  for (const until = Date.now() + 15_000; processRuns(server.pid) && Date.now() < until;) await sleep(100);
  const folder = path.join(workspace, "weekly");
  const htmlFile = path.join(folder, "doc.html");
  await fs.writeFile(htmlFile, page(BODY));
  const notesFile = path.join(folder, "annotations.json");
  const items = ["note0001", "note0002", "note0003"].map((id) => cleanItem({ id, text: `建议 ${id}`, anchor: anchorOf(id) }));
  await fs.writeFile(notesFile, `${JSON.stringify({ v: 1, items }, null, 2)}\n`);
  const written = () => fs.readFile(notesFile, "utf8").then((text) => JSON.parse(text).items, () => null);

  result = await gallery(["notes", "weekly", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  let listed = json(result);
  assert.deepEqual([listed.document, listed.title, listed.file, listed.notes.map((entry) => [entry.id, entry.blocks.join(), entry.done, entry.text])], [
    "weekly", "周报", path.resolve(htmlFile), [["note0001", "paraaaaa", false, "建议 note0001"], ["note0002", "parbbbbb", false, "建议 note0002"], ["note0003", "parccccc", false, "建议 note0003"]]]);
  assert.deepEqual(Object.keys(listed.notes[0]).sort(), ["blocks", "created", "done", "id", "quote", "text", "updated", "where", "whole"]);
  assert.deepEqual(listed.notes[0].where, ["页面结构"], "where it is, from the document");
  result = await gallery(["notes", "weekly"]);
  assert.match(result.stdout, /^weekly（周报）有 3 条批注：\n1\. note0001\n/);
  assert.match(result.stdout, /建议：建议 note0002/);
  assert.ok(result.stdout.trimEnd().split("\n").at(-1).startsWith("提示：改完一条就运行 gallery notes done weekly"));

  // By itself: done, undone, removal, each refused whole for an id that is not there.
  result = await gallery(["notes", "done", "weekly", "note0002", "note0002"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^已把 1 条批注标为已处理：note0002\n/);
  assert.match(result.stdout, /提示：Gallery 没在运行，这次直接写了 annotations\.json/);
  assert.deepEqual((await written()).map((item) => item.done === true), [false, true, false]);
  assert.deepEqual(json(await gallery(["notes", "weekly", "--json"])).notes.map((entry) => entry.done), [false, true, false]);
  result = await gallery(["notes", "done", "weekly", "note0001", "nobody01"]);
  assert.deepEqual([result.code, result.stderr.trim()], [1, "没有这些批注：nobody01（gallery notes weekly 列出它们的 id）。什么也没改。"]);
  assert.equal((await written()).filter((item) => item.done).length, 1, "nothing changed");
  result = await gallery(["notes", "done", "weekly", "note0002", "--undo"]);
  assert.match(result.stdout, /^已取消 1 条批注的已处理标记：note0002/);
  assert.equal((await written()).some((item) => item.done), false);
  await gallery(["notes", "done", "weekly", "note0002", "note0003"]);
  result = await gallery(["notes", "remove", "weekly", "--done"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^已删除 weekly 的 2 条批注：\n  note0002  建议 note0002\n  note0003  建议 note0003\n/);
  assert.match(result.stdout, /没有页面开着，也就没有地方撤销/);
  assert.deepEqual((await written()).map((item) => item.id), ["note0001"]);
  result = await gallery(["notes", "remove", "weekly", "--done"]);
  assert.deepEqual([result.code, result.stdout.trim()], [0, "weekly 没有已处理的批注，什么也没删。"]);
  result = await gallery(["notes", "remove", "weekly", "nobody01"]);
  assert.equal(result.code, 1);
  result = await gallery(["notes", "remove", "weekly", "--all", "--json"]);
  assert.deepEqual(json(result), { document: "weekly", removed: [{ id: "note0001", text: "建议 note0001", quote: QUOTES.note0001, done: false }] });
  assert.equal(await written(), null, "all gone: no file");
  result = await gallery(["notes", "weekly"]);
  assert.deepEqual([result.code, result.stdout.trim()], [0, "weekly（周报）没有批注。"]);
  // The mistakes of a command line: exit 2.
  for (const args of [["notes"], ["notes", "weekly", "note0001"], ["notes", "done", "weekly"], ["notes", "remove", "weekly"], ["notes", "remove", "weekly", "note0001", "--all"], ["notes", "remove", "weekly", "--done", "--all"], ["notes", "weekly", "--all"], ["notes", "done", "weekly", "note0001", "--all"], ["notes", "remove", "weekly", "--undo"], ["notes", "weekly", "--bogus"]]) {
    result = await gallery(args);
    assert.equal(result.code, 2, `${args.join(" ")}: ${result.stdout}${result.stderr}`);
  }
  result = await gallery(["notes", "nothere"]);
  assert.equal(result.code, 1, "a document that is not there");
  assert.match(result.stderr, /没有文档 nothere/);

  // A server: the same, through it. The routes check Host, Origin and the token; the tab's report is kept and told.
  await fs.writeFile(notesFile, `${JSON.stringify({ v: 1, items }, null, 2)}\n`);
  const port = await freePort();
  result = await gallery(["open", "--no-browser"], { GALLERY_PORT: String(port) });
  assert.equal(result.code, 0, result.stdout + result.stderr);
  const live = await announced();
  started.add(live.pid);
  const base = `http://127.0.0.1:${live.port}`;
  const post = (route, body, headers = {}) => fetch(`${base}${route}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: base, "X-Gallery-Token": live.token, ...headers }, body: JSON.stringify(body) });
  const tab = { tab: "tabone01", entry: "weekly", kind: "document", title: "周报", visible: true, focused: true, touched: true, flags: { editing: true }, notes: 3, caret: { block: "paraaaaa", text: "读者可以在右上角切换成全宽。" }, selection: null };
  assert.equal((await fetch(`${base}/__gallery/workspace/status`)).status, 403, "a read without the token");
  assert.equal((await fetch(`${base}/__gallery/workspace/status`, { headers: { "X-Gallery-Token": "wrong" } })).status, 403);
  assert.equal((await post("/__gallery/workspace/presence", tab, { "X-Gallery-Token": "wrong" })).status, 403, "a report without the token");
  assert.equal((await post("/__gallery/workspace/presence", tab, { Origin: "http://evil.example" })).status, 403, "a report from another origin");
  assert.equal((await post("/__gallery/workspace/presence", { ...tab, tab: "no way" })).status, 400, "a report that is none");
  assert.deepEqual(json(await gallery(["status", "--json"])).open, [], "refused reports kept nothing");
  assert.equal((await post("/__gallery/workspace/presence", tab)).status, 200);
  const long = "选".repeat(300);
  assert.equal((await post("/__gallery/workspace/presence", { ...tab, tab: "tabtwo02", entry: "weekly", touched: true, flags: { editing: true, pending: true }, caret: null, selection: { kind: "text", blocks: ["paraaaaa", "parbbbbb"], text: long, length: 300 } })).status, 200);
  result = await gallery(["status", "--json"]);
  assert.equal(result.code, 0, result.stderr);
  const status = json(result);
  assert.deepEqual([status.running, status.port, status.open.map((entry) => entry.tab)], [true, live.port, ["tabtwo02", "tabone01"]], "the tab used last first");
  assert.deepEqual(status.last, status.open[0]);
  const [last, first] = status.open;
  assert.deepEqual([last.slug, last.kind, last.title, last.file, last.workspace, last.save, last.visible, last.focused, last.notes, last.conflicts], ["weekly", "document", "周报", path.resolve(htmlFile), path.resolve(workspace), "pending", true, true, 3, 0]);
  assert.deepEqual([last.selection.kind, last.selection.blocks, last.selection.text.length, last.selection.truncated, last.selection.length, last.caret], ["text", ["paraaaaa", "parbbbbb"], WORDS_MOST, true, 300, null], "the selection, cut");
  assert.deepEqual([first.save, first.caret], ["saved", { block: "paraaaaa", text: "读者可以在右上角切换成全宽。" }]);
  assert.equal(typeof last.idle, "number");
  result = await gallery(["status"]);
  assert.match(result.stdout, new RegExp(`^Gallery 在运行（端口 ${live.port}），浏览器里开着 2 个文档或页面`));
  assert.match(result.stdout, /\n问题：weekly 有修改还没保存：先让用户处理/);
  assert.match(result.stdout, /\n   选中：「选{200}」…（块 paraaaaa、parbbbbb）\n/);
  assert.match(result.stdout, /\n提示：.*data-block-id/);
  // A tab that closes says so; a custom page is a page.
  assert.equal((await post("/__gallery/workspace/presence", { tab: "tabtwo02", gone: true })).status, 200);
  assert.equal((await post("/__gallery/workspace/presence", { ...tab, tab: "tabpage1", entry: "@home", kind: "page", title: "首页", flags: {}, notes: 0, caret: null })).status, 200);
  const pages = json(await gallery(["status", "--json"]));
  assert.deepEqual(pages.open.map((entry) => [entry.tab, entry.kind, entry.slug]), [["tabpage1", "page", "home"], ["tabone01", "document", "weekly"]]);
  assert.equal(pages.open[0].file, path.resolve(workspace, "pages", "home", "page.html"), "a page's file");
  for (const tabName of ["tabone01", "tabpage1"]) await post("/__gallery/workspace/presence", { tab: tabName, gone: true });
  assert.deepEqual(json(await gallery(["status", "--json"])).open, []);

  // gallery notes through the server: written by the edit service, so the page hears it; a removal by a command is offered back.
  const edit = async (query) => (await fetch(`${base}/__gallery/edit/annotations?slug=weekly${query}`, { headers: { "X-Gallery-Token": live.token } })).json();
  result = await gallery(["notes", "done", "weekly", "note0001", "note0003"]);
  assert.equal(result.code, 0, result.stderr);
  assert.ok(!result.stdout.includes("没在运行"), "through the server");
  let answer = await edit("");
  assert.deepEqual(answer.items.map((item) => [item.id, item.done === true]), [["note0001", true], ["note0002", false], ["note0003", true]]);
  assert.deepEqual(json(await gallery(["notes", "weekly", "--json"])).notes.map((entry) => entry.done), [true, false, true]);
  assert.equal((await edit("&as=copy")).items.length, 1, "复制批注 leaves the done ones out");
  assert.equal((await edit("&as=notes")).items.length, 3);
  result = await gallery(["notes", "remove", "weekly", "--done"]);
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /^已删除 weekly 的 2 条批注：/);
  assert.match(result.stdout, /页面开着时，用户会看到「已删除 N 条批注」和「撤销」/);
  answer = await edit("");
  assert.deepEqual(answer.items.map((item) => item.id), ["note0002"]);
  assert.deepEqual(answer.commandRemoved.items.map((item) => item.id), ["note0001", "note0003"], "offered to a page that reads it");
  assert.equal((await post("/__gallery/edit/annotations", { slug: "weekly", restore: answer.commandRemoved.items })).status, 200, "撤销");
  assert.deepEqual((await edit("")).items.map((item) => item.id), ["note0001", "note0002", "note0003"]);
  result = await gallery(["notes", "remove", "weekly", "note0002"]);
  assert.deepEqual((await written()).map((item) => item.id), ["note0001", "note0003"]);
  result = await gallery(["notes", "remove", "weekly", "--all"]);
  assert.match(result.stdout, /^已删除 weekly 的 2 条批注：/);
  assert.equal(await written(), null);
  assert.equal((await gallery(["stop"])).code, 0);
  started.delete(live.pid);
} finally {
  for (const pid of started) {
    try {
      process.kill(pid);
    } catch {}
  }
  await sleep(300);
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
}

console.log("Checked gallery status and gallery notes: a tab's report (its shape, 200 characters of selected words, 20 blocks, ids and counts cleaned, the save state as one word), the server's memory of the tabs (the one used last first, a heartbeat not use, a closed tab and one that stopped reporting gone), the lines the command prints (a 问题： line for a document not saved, the caret's and the selection's blocks), the routes' checks (Host, Origin, the token) and the answer with a server and without; 批注 marked done and undone, removed by ids, by done and all, an unknown id refusing the whole request, a removal by a command offered back and put back, a rewritten suggestion no longer done, 复制批注 leaving done ones out, a store that never checks leaving the file as it is, and the command through the server and by itself.");
