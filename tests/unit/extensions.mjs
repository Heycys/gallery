import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createEditService } from "../../src/editor/service.mjs";
import { SIDEBAR_FILE, SIDEBAR_LIMITS, entryIn, entryOfKey, extensionKey, parseExtensionKey, readSidebarText } from "../../src/shared/extension-sidebar.mjs";
import { extensionColumnIds, extensionFolders, listExtensions, readExtension } from "../../src/shared/extensions.mjs";
import { DOCS, extensionGroupId, groupOf, isExtensionId, topOf, validGroups } from "../../src/shared/outline-shape.mjs";
import { readOutline, validOutline, writeOutline } from "../../src/shared/outline.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { PAGES_FOLDER, keptName, layoutOf, slugTaken } from "../../src/shared/workspace.mjs";
import { changeOf, ignoredIn } from "../../src/server/index.mjs";
import { createWorkspaceService } from "../../src/workbench/service.mjs";
import { sha256 } from "../../src/shared/files.mjs";

// The sidebar columns extensions provide (docs/workbench.md "Extension columns"; decided
// 2026-11-08): the id of an extension and of its column
// (shared/outline-shape.mjs), the file's rules (shared/extension-sidebar.mjs: what makes it unusable, what
// is only a note, the limits), reading the folders (shared/extensions.mjs), the outline keeping a column's
// place and never an entry (shared/outline.mjs), the workspace service listing them with the outline, the
// watcher's reading of a path (server/routes.mjs changeOf, ignoredIn), and gallery extension list and check.

const said = (read) => read.error?.message;

// ---------- the id and the column ----------
{
  for (const id of ["yuque", "a", "my-ext-2", "x".repeat(48)]) assert.ok(isExtensionId(id), `${id} is an id`);
  for (const id of ["", "Yuque", "my_ext", "-a", "a--b", "a-", "x".repeat(49), "ws-3f2a9c", ".hidden", "a b", 5, null]) assert.ok(!isExtensionId(id), `${String(id)} is no id`);
  assert.ok(isExtensionId("ws-3f2a9"), "only the notation of a workspace's id (ws- and six hex digits) is kept back");
  assert.equal(extensionGroupId("yuque"), "ext-yuque");
  assert.equal(extensionGroupId("x".repeat(48)).length, 52, "a column's id stays under 64");
  assert.deepEqual(groupOf({ id: "ext-yuque", extension: "yuque", title: "改名", role: "links", workspace: "ws-3f2a9c" }), { id: "ext-yuque", extension: "yuque" }, "an extension's column: its id and nothing the outline or the user says of it");
  assert.deepEqual(groupOf({ id: "ext-other", extension: "yuque", title: "x" }), { id: "ext-other", title: "x" }, "a column whose id is not its extension's is an ordinary one");
  assert.deepEqual(groupOf({ id: "g-1", extension: "yuque" }), { id: "g-1" });
  assert.ok(validGroups([{ id: "docs" }, { id: "ext-yuque", extension: "yuque" }]));
  assert.ok(!validGroups([{ id: "docs" }, { id: "ext-yuque", extension: "other" }]), "a column's extension is its id's");
  assert.ok(validOutline({ groups: [{ id: "docs" }, { id: "ext-yuque", extension: "yuque" }], children: { "": ["a"], ":ext-yuque": [] } }));
  assert.ok(!validOutline({ groups: [{ id: "docs" }, { id: "ext-yuque", extension: "yuque" }], children: { "": [], ":ext-yuque": ["a"] } }), "an extension's column holds no entry of the outline's");
  assert.equal(extensionKey("yuque", "team:1"), "~yuque/team:1");
  assert.deepEqual(parseExtensionKey("~yuque/team:1.a_b-c"), { extension: "yuque", entry: "team:1.a_b-c" });
  for (const key of ["yuque/a", "~yuque", "~Yuque/a", "~ws-3f2a9c/doc", "~yuque/", "~yuque/a b", "~yuque/a/b", null]) assert.equal(parseExtensionKey(key), null, `${String(key)} is no key`);
}

// ---------- the file ----------
{
  const read = (value) => readSidebarText(typeof value === "string" ? value : JSON.stringify(value));
  const good = read({ title: "  语雀  ", icon: "📗", entries: [
    { id: "team", title: " 团队  知识库 ", url: "https://www.yuque.com/team", children: [{ id: "weekly", title: "周报", url: "www.yuque.com/w", icon: "/icons/books_blue.svg" }] },
    { id: "group", title: "分组", children: [] },
    { id: "panel", title: "发布面板", url: "http://127.0.0.1:4318/", icon: "🛠️", extra: 1 },
  ] });
  assert.deepEqual(good.sidebar, {
    title: "语雀", icon: "📗", count: 4,
    entries: [
      { id: "team", title: "团队 知识库", url: "https://www.yuque.com/team", children: [{ id: "weekly", title: "周报", url: "https://www.yuque.com/w", icon: "/icons/books_blue.svg" }] },
      { id: "group", title: "分组" },
      { id: "panel", title: "发布面板", url: "http://127.0.0.1:4318/", icon: "🛠️" },
    ],
  }, "titles tidied, an address as the URL spells it (https for one with no scheme), an empty children left out, what is not the format's dropped");
  assert.deepEqual(good.notes, []);
  assert.equal(entryIn(good.sidebar.entries, "weekly").title, "周报");
  assert.equal(entryIn(good.sidebar.entries, "nope"), null);
  // What a link to an entry's address (#~<id>/<entry id>) opens, of the columns GET outline lists.
  const columns = [{ id: "yuque", entries: good.sidebar.entries }, { id: "broken", entries: [] }];
  assert.equal(entryOfKey(columns, "~yuque/weekly")?.url, "https://www.yuque.com/w", "an entry under another, by its key");
  assert.deepEqual(entryOfKey(columns, "~yuque/group"), { id: "group", title: "分组" }, "one with no address is found, for the caller to refuse");
  for (const key of ["~yuque/nope", "~other/team", "~broken/a", "yuque/team", "~yuque", ""]) assert.equal(entryOfKey(columns, key), null, `${key} names no entry`);
  assert.equal(entryOfKey(undefined, "~yuque/team"), null, "no list read");
  assert.deepEqual(readSidebarText(`﻿${JSON.stringify({ title: "a", entries: [] })}`).sidebar, { title: "a", count: 0, entries: [] }, "a byte-order mark passed over; no entries is a column with none");

  // What makes the file no sidebar: the first reason, said() so that the UI says it in its language.
  const bad = (value, reason) => {
    const result = read(value);
    assert.equal(result.sidebar, undefined, `${JSON.stringify(value).slice(0, 60)} is no sidebar`);
    assert.ok(said(result)?.includes(reason), `${JSON.stringify(value).slice(0, 80)}: ${said(result)} says ${reason}`);
    assert.ok(typeof result.error.text === "string" && Array.isArray(result.error.values), "a template and its values");
    return result.error;
  };
  assert.deepEqual(bad("{ nope", "不是 JSON：").values.length, 1);
  bad("[]", "最外层要是一个对象");
  bad("5", "最外层要是一个对象");
  bad({ entries: [] }, "title 要有");
  bad({ title: " ", entries: [] }, "title 要有");
  bad({ title: "x".repeat(101), entries: [] }, "title 要有");
  bad({ title: "a" }, "entries 要是一个列表");
  bad({ title: "a", entries: {} }, "entries 要是一个列表");
  bad({ title: "a", entries: ["x"] }, "entries[0] 要是一个对象");
  assert.deepEqual(bad({ title: "a", entries: [{ id: "a", title: "A" }, { id: "b c", title: "B" }] }, "entries[1] 的 id 不对").values, ["entries[1]"]);
  bad({ title: "a", entries: [{ title: "A" }] }, "id 不对");
  bad({ title: "a", entries: [{ id: "x".repeat(129), title: "A" }] }, "id 不对");
  bad({ title: "a", entries: [{ id: "é", title: "A" }] }, "id 不对");
  bad({ title: "a", entries: [{ id: "a", title: "A" }, { id: "b", title: "B", children: [{ id: "a", title: "again" }] }] }, "entries[1].children[0] 的 id「a」重复了");
  bad({ title: "a", entries: [{ id: "a" }] }, "entries[0] 要有 title");
  bad({ title: "a", entries: [{ id: "a", title: "x".repeat(201) }] }, "要有 title");
  bad({ title: "a", entries: [{ id: "a", title: "A", url: "javascript:alert(1)" }] }, "entries[0] 的 url 只能是 http 或 https");
  bad({ title: "a", entries: [{ id: "a", title: "A", url: "file:///etc/passwd" }] }, "url 只能是 http 或 https");
  bad({ title: "a", entries: [{ id: "a", title: "A", url: "data:text/html,x" }] }, "url 只能是 http 或 https");
  bad({ title: "a", entries: [{ id: "a", title: "A", url: `https://x.org/${"a".repeat(2048)}` }] }, "url 太长了");
  bad({ title: "a", entries: [{ id: "a", title: "A", url: "http://" }] }, "url 不是一个网址");
  bad({ title: "a", entries: [{ id: "a", title: "A", children: {} }] }, "entries[0] 的 children 要是一个列表");

  // An empty address is none; an icon that is none is only a note.
  const noted = read({ title: "a", icon: "https://x.org/i.png", entries: [{ id: "a", title: "A", url: "", icon: "nope", children: [{ id: "b", title: "B", icon: "" }] }] });
  assert.deepEqual(noted.sidebar.entries, [{ id: "a", title: "A", children: [{ id: "b", title: "B" }] }]);
  assert.deepEqual(noted.notes.map(({ message }) => message), ["icon 不是表情，也不是图标页签里的图标，没有显示", "entries[0] 的 icon 不是表情，也不是图标页签里的图标，没有显示"]);
  assert.equal(noted.sidebar.icon, undefined);

  // The limits: 8 levels, 2000 entries, 1 MB.
  const deep = (levels) => { let node = { id: `e${levels}`, title: "e" }; for (let level = levels - 1; level >= 1; level--) node = { id: `e${level}`, title: "e", children: [node] }; return node; };
  assert.ok(read({ title: "a", entries: [deep(SIDEBAR_LIMITS.levels)] }).sidebar, "8 levels");
  assert.ok(said(read({ title: "a", entries: [deep(SIDEBAR_LIMITS.levels + 1)] })).includes("条目超过 8 层"), "a ninth level");
  const many = (count) => Array.from({ length: count }, (_, index) => ({ id: `e${index}`, title: "e" }));
  assert.equal(read({ title: "a", entries: many(SIDEBAR_LIMITS.entries) }).sidebar.count, 2000, "2000 entries");
  assert.ok(said(read({ title: "a", entries: many(SIDEBAR_LIMITS.entries + 1) })).includes("条目超过 2000 个"), "2001");
  assert.ok(said(readSidebarText(" ".repeat(SIDEBAR_LIMITS.bytes + 1))).includes("文件超过 1MB"), "over 1 MB, said before it is parsed");
}

// ---------- the folders ----------
const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-extensions-"));
const savedHome = process.env.GALLERY_DEFAULT_WORKSPACE;
process.env.GALLERY_DEFAULT_WORKSPACE = root;
const folder = (...names) => path.join(root, "extensions", ...names);
const write = async (id, value, name = SIDEBAR_FILE) => {
  await fs.mkdir(folder(id), { recursive: true });
  await fs.writeFile(folder(id, name), typeof value === "string" ? value : JSON.stringify(value));
};
try {
  await fs.mkdir(path.join(root, "alpha"), { recursive: true });
  await fs.writeFile(path.join(root, "alpha", "doc.html"), "<!doctype html><title>a</title>");
  await fs.writeFile(path.join(root, "alpha", "doc.json"), JSON.stringify({ title: "甲" }));
  assert.deepEqual(await extensionFolders(root), [], "no extensions/ at all");
  assert.deepEqual(await listExtensions(root), []);
  assert.deepEqual((await readOutline(root)).groups, [{ id: DOCS }], "no extension, no column");

  await write("yuque", { title: "语雀", icon: "📗", entries: [{ id: "team", title: "团队", url: "https://www.yuque.com/team", children: [{ id: "weekly", title: "周报", url: "https://www.yuque.com/w" }] }] });
  await write("broken", { title: "坏的", entries: [{ id: "a", title: "A", url: "javascript:1" }] });
  await write("garbled", "{ nope");
  await fs.mkdir(folder("empty"), { recursive: true }); // an extension with nothing to show: no sidebar.json
  await fs.mkdir(folder("assets"), { recursive: true });
  await fs.writeFile(folder("assets", SIDEBAR_FILE), JSON.stringify({ title: "no", entries: [] })); // a document called extensions keeps these
  await fs.mkdir(folder("Bad_Name"), { recursive: true });
  await fs.writeFile(folder("Bad_Name", SIDEBAR_FILE), JSON.stringify({ title: "no", entries: [] }));
  await fs.mkdir(folder(".hidden"), { recursive: true });
  await fs.writeFile(folder(".hidden", SIDEBAR_FILE), JSON.stringify({ title: "no", entries: [] }));
  await fs.mkdir(folder("ws-3f2a9c"), { recursive: true });
  await fs.writeFile(folder("ws-3f2a9c", SIDEBAR_FILE), JSON.stringify({ title: "no", entries: [] }));
  await fs.writeFile(folder("loose.json"), "{}"); // a file there is no extension
  await write("big", { title: "大", entries: [] });
  await fs.writeFile(folder("big", SIDEBAR_FILE), " ".repeat(SIDEBAR_LIMITS.bytes + 10));
  await fs.mkdir(folder("dir-file", SIDEBAR_FILE), { recursive: true }); // a folder where the file should be

  assert.deepEqual((await extensionFolders(root)).map(({ id }) => id), ["big", "broken", "dir-file", "empty", "garbled", "yuque"], "folders whose names are ids, sorted: no dot name, no assets, no uppercase, no workspace's notation, no loose file");
  assert.deepEqual(await extensionColumnIds(root), ["big", "broken", "dir-file", "garbled", "yuque"], "a column for each with a sidebar.json, whatever it holds");
  const found = new Map((await listExtensions(root, { all: true })).map((extension) => [extension.id, extension]));
  assert.deepEqual([...(await listExtensions(root)).map(({ id }) => id)], ["big", "broken", "dir-file", "garbled", "yuque"], "the sidebar lists those with a file; `all` the folder with none too");
  assert.ok(found.get("empty").missing && found.get("empty").error.message === "没有 sidebar.json");
  const yuque = found.get("yuque");
  assert.deepEqual([yuque.title, yuque.icon, yuque.count, yuque.entries.length, yuque.error, yuque.file], ["语雀", "📗", 2, 1, undefined, folder("yuque", SIDEBAR_FILE)]);
  assert.ok(found.get("broken").error.message.includes("entries[0] 的 url 只能是 http 或 https") && found.get("broken").entries.length === 0 && found.get("broken").title === "坏的", "a file that does not read: its reason, no entries, the name it says when it has one");
  assert.ok(found.get("garbled").error.message.startsWith("不是 JSON：") && found.get("garbled").title === "garbled", "the id for a name when the file has none");
  assert.equal(found.get("big").error.message, "文件超过 1MB");
  assert.equal(found.get("dir-file").error.message, "sidebar.json 不是一个文件");
  assert.equal((await readExtension(root, "nope")).missing, true);

  // ---------- the outline keeps a column's place, never its entries ----------
  let outline = await readOutline(root);
  assert.deepEqual(outline.groups, [{ id: DOCS }, ...["big", "broken", "dir-file", "garbled", "yuque"].map((id) => ({ id: extensionGroupId(id), extension: id }))], "the columns an outline does not hold yet come last, by id");
  assert.deepEqual(outline.children, { "": ["alpha"], ...Object.fromEntries(["big", "broken", "dir-file", "garbled", "yuque"].map((id) => [topOf(extensionGroupId(id)), []])) });
  // The user drags 语雀's column above the others: written, and read back in that place.
  const moved = { groups: [outline.groups[0], outline.groups[5], ...outline.groups.slice(1, 5)], children: outline.children };
  assert.ok(validOutline(moved));
  await writeOutline(root, moved);
  const stored = JSON.parse(await fs.readFile(layoutOf(root).outline, "utf8"));
  assert.deepEqual(stored.groups[1], { id: "ext-yuque", extension: "yuque" }, "kept bare: no title, no entries");
  assert.deepEqual((await readOutline(root)).groups.map(({ id }) => id), ["docs", "ext-yuque", "ext-big", "ext-broken", "ext-dir-file", "ext-garbled"], "its place as the user left it");
  // An extension that comes later is last; one that goes drops out, its place forgotten once the outline is written.
  await write("zeta", { title: "末", entries: [] });
  assert.equal((await readOutline(root)).groups.at(-1).id, "ext-zeta");
  await fs.rm(folder("yuque"), { recursive: true });
  assert.ok(!(await readOutline(root)).groups.some(({ extension }) => extension === "yuque"), "gone with its sidebar.json");
  await write("yuque", { title: "语雀", entries: [] });
  assert.deepEqual((await readOutline(root)).groups.map(({ id }) => id).slice(0, 3), ["docs", "ext-yuque", "ext-big"], "back where it was while the file still held its place");
  // What the file says of an extension's entries is passed over: they fall to where documents do.
  const kept = JSON.parse(await fs.readFile(layoutOf(root).outline, "utf8"));
  kept.groups[1].children = { "": ["alpha"] };
  await fs.writeFile(layoutOf(root).outline, JSON.stringify(kept));
  outline = await readOutline(root);
  assert.deepEqual([outline.children[""], outline.children[":ext-yuque"]], [["alpha"], []], "an outline that puts a document under an extension's column is read with it in 文档");

  // ---------- the names the workspace keeps ----------
  assert.ok(keptName("extensions") && keptName("components") && keptName(PAGES_FOLDER) && slugTaken("extensions", root), "extensions is a name no new document takes");
  assert.equal(layoutOf(root).extensions, path.join(root, "extensions"));

  // ---------- the watcher's reading of a path ----------
  const at = (...names) => path.join(root, ...names);
  assert.deepEqual(changeOf(root, at("extensions", "yuque", SIDEBAR_FILE)), { extension: "yuque", name: SIDEBAR_FILE });
  assert.deepEqual(changeOf(root, at("extensions", "yuque", "server", "index.js")), { extension: "yuque", name: null }, "deeper: the folder's");
  assert.deepEqual(changeOf(root, at("extensions", "yuque")), { extension: "yuque", name: null }, "the folder itself");
  assert.equal(changeOf(root, at("extensions", "yuque", ".sidebar.json.tmp")), null, "a write's temp file");
  assert.deepEqual(changeOf(root, at("extensions", "assets", "a.png")), { slug: "extensions", name: null }, "a document called extensions keeps its assets");
  assert.deepEqual(changeOf(root, at("extensions", "doc.html")), { slug: "extensions", name: "doc.html" }, "and its files");
  const ignored = ignoredIn(root);
  assert.ok(ignored(at("extensions", "yuque", "node_modules", "x", "index.js")) && ignored(at("extensions", "yuque", "node_modules")) && ignored(at("extensions", "yuque", ".git", "HEAD")), "an extension's node_modules and .git are no news");
  assert.ok(!ignored(at("extensions", "yuque", SIDEBAR_FILE)) && !ignored(at("extensions", "yuque", "server", "index.js")) && !ignored(at("extensions")), "its other files are looked at");

  // ---------- the workspace service lists them with the outline ----------
  await fs.rm(folder("zeta"), { recursive: true });
  await fs.rm(folder("dir-file"), { recursive: true });
  const edits = createEditService({ stateDirectory: path.join(root, ".gallery", "state") });
  const service = createWorkspaceService({ edits, reports: {}, reportsDirectory: root });
  const server = http.createServer((request, response) => {
    const name = request.url.match(/^\/__gallery\/workspace\/([a-z-]+)(?:\?|$)/)?.[1];
    return name ? service.handle(request, response, name) : (response.statusCode = 404, response.end());
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const host = `127.0.0.1:${server.address().port}`;
  const get = async (name) => (await fetch(`http://${host}/__gallery/workspace/${name}`)).json();
  const post = async (name, body = {}) => {
    const response = await fetch(`http://${host}/__gallery/workspace/${name}`, { method: "POST", headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": edits.token }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  try {
    const answer = await get("outline");
    assert.deepEqual(answer.extensions.map(({ id }) => id), ["big", "broken", "garbled", "yuque"], "each extension with a sidebar.json, by id");
    const sent = new Map(answer.extensions.map((extension) => [extension.id, extension]));
    assert.deepEqual(sent.get("yuque"), { id: "yuque", file: path.join(root, "extensions", "yuque", "sidebar.json"), revision: sha256(await fs.readFile(folder("yuque", SIDEBAR_FILE), "utf8")), title: "语雀", entries: [], count: 0 }, "its column, revision and source path as the sidebar shows them");
    const sourceFile = path.join(root, "extensions", "yuque", "sidebar.json");
    const source = {
      title: "语雀", custom: { kept: true },
      entries: [
        { id: "a", title: "甲", url: "https://example.com/a", extra: 7, children: [{ id: "child", title: "子页", custom: [1, 2] }] },
        { id: "b", title: "乙" }, { id: "c", title: "丙" },
      ],
    };
    await fs.writeFile(sourceFile, "\uFEFF" + JSON.stringify(source, null, "\t").replaceAll("\n", "\r\n") + "\r\n");
    const saved = async () => JSON.parse((await fs.readFile(sourceFile, "utf8")).replace(/^\uFEFF/, ""));
    const edit = change => post("extension-edit", { id: "yuque", ...change });
    assert.equal((await edit({ title: "  我的  资料  ", baseTitle: "语雀" })).status, 200);
    assert.deepEqual(await saved(), { ...source, title: "我的 资料" }, "rename changes only the title, retaining raw fields and subtrees");
    assert.match(await fs.readFile(sourceFile, "utf8"), /^\uFEFF\{\r\n\t"title"/, "BOM, CRLF and indentation retained");
    assert.equal((await edit({ title: "过时", baseTitle: "语雀" })).status, 409, "stale rename refused");
    // An external writer edits content without changing the root order: keep its latest fields.
    const latest = await saved();
    latest.entries[0].children[0].title = "外部更新";
    await write("yuque", latest);
    assert.equal((await edit({ move: { entry: "a", ref: "c", side: "after" }, baseOrder: ["a", "b", "c"] })).status, 200);
    assert.deepEqual(await saved(), { ...latest, entries: [latest.entries[1], latest.entries[2], latest.entries[0]] }, "move keeps the latest raw subtree and unknown fields");
    assert.equal((await edit({ move: { entry: "a", ref: "b", side: "before" }, baseOrder: ["a", "b", "c"] })).status, 409, "stale order refused");
    assert.equal((await edit({ move: { entry: "child", ref: "b", side: "before" }, baseOrder: ["b", "c", "a"] })).status, 400, "nested entries cannot be moved");
    assert.equal((await edit({ move: { entry: "a", ref: "b", side: "before" }, baseOrder: ["b", "c", "a"] })).status, 200);
    assert.deepEqual(await saved(), latest, "moving before restores root order without changing content");
    const unchanged = await fs.readFile(sourceFile, "utf8");
    assert.equal((await edit({ title: "我的 资料", baseTitle: "我的 资料" })).status, 200);
    assert.equal((await edit({ title: " ", baseTitle: "我的 资料" })).status, 400);
    assert.equal((await post("extension-edit", { id: "../yuque", title: "错", baseTitle: "我的 资料" })).status, 400);
    assert.equal(await fs.readFile(sourceFile, "utf8"), unchanged, "no-op and invalid edits do not rewrite the file");
    assert.equal((await post("extension-edit", { id: "garbled", title: "错", baseTitle: "garbled" })).status, 409, "malformed source is never overwritten");
    assert.equal((await post("extension-edit", { id: "missing", title: "错", baseTitle: "missing" })).status, 404);
    const removal = async () => {
      const shown = (await get("outline")).extensions.find(({ id }) => id === "yuque");
      return { baseFile: shown.file, baseRevision: shown.revision };
    };
    const baseRemoval = await removal();
    assert.equal((await edit({ remove: { entry: "child" }, ...baseRemoval })).status, 400, "a nested entry cannot be deleted through the root operation");
    assert.equal((await edit({ remove: "column", ...baseRemoval, baseFile: sourceFile + ".other" })).status, 409, "a changed source cannot redirect a confirmed deletion");
    assert.equal((await edit({ remove: "column", ...baseRemoval, title: "ambiguous" })).status, 400, "mixed mutation requests refused");
    const beforeRemoval = await saved();
    beforeRemoval.entries[0].children[0].title = "确认期间更新";
    await write("yuque", beforeRemoval);
    assert.equal((await edit({ remove: { entry: "a" }, ...baseRemoval })).status, 409, "deleting with a stale snapshot keeps edits made while confirming");
    assert.equal((await edit({ remove: { entry: "a" }, ...await removal() })).status, 200);
    assert.deepEqual(await saved(), { ...beforeRemoval, entries: beforeRemoval.entries.slice(1) }, "deleting a root removes its subtree and preserves other raw fields");
    await fs.writeFile(folder("yuque", "server.mjs"), "// extension-owned companion\n");
    assert.equal((await edit({ remove: "column", ...baseRemoval })).status, 409, "stale whole-column deletion is refused too");
    assert.equal((await edit({ remove: "column", ...await removal() })).status, 200);
    assert.equal(await fs.stat(sourceFile).catch(() => null), null, "column deletion removes sidebar.json");
    assert.equal(await fs.readFile(folder("yuque", "server.mjs"), "utf8"), "// extension-owned companion\n", "other extension files are untouched");
    assert.ok(!(await get("outline")).extensions.some(({ id }) => id === "yuque"), "the deleted column disappears without an outline patch");
    await write("yuque", { title: "语雀", icon: "📗", entries: [{ id: "team", title: "团队", url: "https://www.yuque.com/team" }] });
    assert.deepEqual((await get("outline")).extensions.find(({ id }) => id === "yuque").entries, [{ id: "team", title: "团队", url: "https://www.yuque.com/team" }], "read again each time it is asked");
    const garbled = sent.get("garbled");
    assert.deepEqual([garbled.entries, garbled.count, garbled.error.text, garbled.error.values.length], [[], 0, "不是 JSON：{0}", 1], "a file that does not read: no entries, the reason as a template with its values");
    assert.ok(answer.outline.groups.some(({ extension }) => extension === "garbled"), "its column is in the outline all the same");
    assert.ok(answer.reports.alpha && !Object.hasOwn(answer.reports, "yuque"), "no entry of an extension is a document");

    // The columns of the extensions are the outline's to place, never to hold or to make.
    const groups = answer.outline.groups;
    const moveFirst = [groups[0], groups.at(-1), ...groups.slice(1, -1)];
    assert.equal((await post("outline", { outline: { groups: moveFirst, children: answer.outline.children } })).status, 200, "dragged: the column's place written");
    assert.equal((await get("outline")).outline.groups[1].extension, "garbled", "the last column first, as dragged");
    const refused = await post("outline", { outline: { groups, children: { ...answer.outline.children, [topOf("ext-yuque")]: ["alpha"] } } });
    assert.equal(refused.status, 400, "an entry put in an extension's column: refused");
    const link = await post("link", { url: "https://example.com/a", title: "网页", parent: topOf("ext-yuque") });
    assert.deepEqual([link.status, link.body.reason], [409, "extension"], "a web link placed in an extension's column: refused");
    await fs.rm(path.join(root, "alpha", "link.json"), { force: true });

    // ---------- the columns a program extension writes: columns/<column>.json, shown while it is enabled ----------
    const program = folder("prog");
    await fs.mkdir(path.join(program, "columns"), { recursive: true });
    await fs.writeFile(path.join(program, "extension.json"), JSON.stringify({ id: "prog", name: "程序" }));
    const docsFile = path.join(program, "columns", "docs.json");
    await fs.writeFile(docsFile, JSON.stringify({ title: "语雀文档", entries: [{ id: "team", title: "团队", url: "https://example.com/t" }, { id: "b", title: "乙" }] }));
    await fs.writeFile(path.join(program, "columns", "Not_An_Id.json"), "{}"); // no column's name: passed over
    await fs.writeFile(path.join(program, "columns", "notes.txt"), "not a column");
    await write("plain", { title: "无程序", entries: [] });
    await fs.mkdir(folder("plain", "columns")); await fs.writeFile(folder("plain", "columns", "x.json"), JSON.stringify({ title: "不读", entries: [] })); // no extension.json: no columns/
    const config = path.join(root, "gallery.json");
    const configWas = await fs.readFile(config, "utf8").catch(() => null);
    const switchTo = async (enabled) => {
      const value = JSON.parse(await fs.readFile(config, "utf8").catch(() => "{}"));
      value.extensions = { ...value.extensions, prog: { enabled } };
      await fs.writeFile(config, JSON.stringify(value));
    };
    await switchTo(false);
    assert.ok(!(await extensionColumnIds(root)).some((id) => id.startsWith("prog") || id.startsWith("plain:")), "switched off: no column of its columns/; a folder with no extension.json has none");
    assert.ok(!(await get("outline")).extensions.some(({ id }) => id.startsWith("prog")), "nor in the outline");
    const hidden = (await listExtensions(root, { all: true })).filter(({ owner }) => owner === "prog");
    assert.deepEqual(hidden.map(({ id, hidden, title, count, column }) => ({ id, hidden, title, count, column })), [{ id: "prog:docs", hidden: true, title: "语雀文档", count: 2, column: "docs" }], "all: listed under its extension (gallery extension list), hidden");
    await switchTo(true);
    assert.ok((await extensionColumnIds(root)).includes("prog:docs"), "switched on: its column");
    const withColumns = await get("outline");
    const docsColumn = withColumns.extensions.find(({ id }) => id === "prog:docs");
    assert.deepEqual([docsColumn.owner, docsColumn.column, docsColumn.title, docsColumn.count, docsColumn.file], ["prog", "docs", "语雀文档", 2, docsFile], "listed with its owner and file");
    assert.ok(withColumns.outline.groups.some((group) => group.id === "ext-prog:docs" && group.extension === "prog:docs"), "its place in the outline: ext-<id>:<column>");
    assert.ok(!withColumns.extensions.some(({ id }) => id === "prog"), "the program gives no column of its own without a sidebar.json");
    assert.deepEqual(parseExtensionKey("~prog:docs/team"), { extension: "prog:docs", entry: "team" });
    assert.equal(extensionKey("prog:docs", "team"), "~prog:docs/team");
    assert.equal(entryOfKey(withColumns.extensions, "~prog:docs/team")?.url, "https://example.com/t", "an entry's address #~<id>:<column>/<entry>");
    assert.ok([parseExtensionKey("~prog:docs:x/team"), parseExtensionKey("~ws-abcdef:docs/team"), parseExtensionKey("~prog:/team")].every((value) => value === null), "no other key");
    assert.deepEqual([groupOf({ id: "ext-prog:docs", extension: "prog:docs" }), groupOf({ id: "ext-prog:docs", extension: "prog" })], [{ id: "ext-prog:docs", extension: "prog:docs" }, null]);
    const docsEdit = (change) => post("extension-edit", { id: "prog:docs", ...change });
    assert.equal((await docsEdit({ title: "我的文档", baseTitle: "语雀文档" })).status, 200);
    assert.equal(JSON.parse(await fs.readFile(docsFile, "utf8")).title, "我的文档", "renamed in its own file");
    assert.equal((await docsEdit({ move: { entry: "team", ref: "b", side: "after" }, baseOrder: ["team", "b"] })).status, 200);
    assert.deepEqual(JSON.parse(await fs.readFile(docsFile, "utf8")).entries.map(({ id }) => id), ["b", "team"], "reordered in its own file");
    assert.deepEqual(changeOf(root, docsFile), { extension: "prog", name: null, columns: true }, "the watcher: a column's news, not the extension's");
    assert.deepEqual(changeOf(root, path.join(program, "columns")), { extension: "prog", name: "columns", columns: true });
    const docsNow = (await get("outline")).extensions.find(({ id }) => id === "prog:docs");
    assert.equal((await docsEdit({ remove: "column", baseFile: docsNow.file, baseRevision: docsNow.revision })).status, 200);
    assert.equal(await fs.stat(docsFile).catch(() => null), null, "deleting the column deletes its file");
    assert.ok(await fs.stat(path.join(program, "extension.json")), "and nothing else of the extension");
    await fs.rm(program, { recursive: true }); await fs.rm(folder("plain"), { recursive: true });
    if (configWas === null) await fs.rm(config); else await fs.writeFile(config, configWas);
  } finally {
    server.close();
  }

  // ---------- gallery extension list and check ----------
  const run = promisify(execFile);
  const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
  const quiet = { GALLERY_NO_PREVIEW: "1", GALLERY_NO_BROWSER: "1", GALLERY_NO_UPDATE_CHECK: "1", GALLERY_CACHE_DIR: path.join(root, "..", "cache-extensions"), CLAUDE_CONFIG_DIR: path.join(root, "..", "agents-extensions", "claude"), CODEX_HOME: path.join(root, "..", "agents-extensions", "codex") };
  const gallery = async (args) => {
    try {
      const { stdout, stderr } = await run(process.execPath, [bin, "--workspace", root, ...args], { env: { ...process.env, ...quiet } });
      return { code: 0, stdout, stderr };
    } catch (error) {
      if (typeof error.code !== "number") throw error;
      return { code: error.code, stdout: error.stdout, stderr: error.stderr };
    }
  };
  const before = async () => JSON.stringify((await fs.readdir(root, { recursive: true })).sort());
  const listed = await gallery(["extension", "list"]);
  assert.equal(listed.code, 0, listed.stderr);
  const listedJSON = JSON.parse((await gallery(["extension", "list", "--json"])).stdout);
  assert.equal(listedJSON.folder, path.join(root, "extensions"), "list --json: an object naming the extensions' folder");
  assert.deepEqual(listedJSON.extensions.map(({ id }) => id).sort(), ["big", "broken", "empty", "garbled", "yuque"]);
  const files = await before(); // the first command made the workspace's own files; nothing after it writes any
  assert.ok(/5 extensions visible from /.test(listed.stdout) && /^ {2}big {2}条目读不出来：文件超过 1MB$/m.test(listed.stdout) && /^ {2}empty {2}no sidebar\.json/m.test(listed.stdout) && /^ {2}yuque {2}语雀, 1 entry$/m.test(listed.stdout), listed.stdout);
  const ok = await gallery(["extension", "check", "yuque"]);
  assert.equal(ok.code, 0, ok.stderr);
  assert.ok(ok.stdout.includes("The sidebar shows the column 语雀 (📗), 1 entry") && /^ {2}team {2}团队 {2}https:\/\/www\.yuque\.com\/team$/m.test(ok.stdout) && /^OK yuque: 1 entry /m.test(ok.stdout), ok.stdout);
  await write("noted", { title: "有话", entries: [{ id: "a", title: "A", url: "https://example.com/", icon: "nope" }, { id: "b", title: "B", children: [{ id: "c", title: "C" }] }] });
  const noted = await gallery(["extension", "check", "noted"]);
  assert.equal(noted.code, 0, noted.stderr);
  assert.ok(/^note: entries\[0\] 的 icon 不是表情/m.test(noted.stdout) && /^ {2}b {2}B {2}\(no address: a click opens and closes what is under it\)$/m.test(noted.stdout) && /^ {4}c {2}C /m.test(noted.stdout), noted.stdout);
  const failed = await gallery(["extension", "check", "broken"]);
  assert.equal(failed.code, 1);
  assert.ok(/^FAIL .*sidebar\.json: entries\[0\] 的 url 只能是 http 或 https/m.test(failed.stderr) && failed.stderr.includes('The sidebar shows the column "坏的" with one row: 条目读不出来：entries[0]'), failed.stderr);
  const none = await gallery(["extension", "check", "empty"]);
  assert.ok(none.code === 1 && /there is no sidebar\.json/.test(none.stderr), none.stderr);
  const missing = await gallery(["extension", "check", "nope"]);
  assert.ok(missing.code === 1 && /No extension "nope"/.test(missing.stderr), missing.stderr);
  const wrong = await gallery(["extension", "check", "Not_An_Id"]);
  assert.equal(wrong.code, 2);
  assert.equal((await gallery(["extension", "check"])).code, 2);
  assert.equal((await gallery(["extension", "list", "x"])).code, 2);
  assert.equal((await gallery(["extension", "frobnicate"])).code, 2);
  assert.equal((await gallery(["extension"])).code, 2);
  assert.equal(await before(), JSON.stringify([...JSON.parse(files), ...["noted", path.join("noted", SIDEBAR_FILE)].map((name) => path.join("extensions", name))].sort()), "list and check wrote nothing");
  const tree = await gallery(["list", "--tree"]);
  assert.ok(/^语雀栏（扩展 yuque：1 个条目；gallery extension check yuque 打出它们）$/m.test(tree.stdout) && /^坏的栏（扩展 broken：条目读不出来：/m.test(tree.stdout), tree.stdout);
  assert.ok(/^ {2}alpha {2}甲/m.test(tree.stdout), "the documents listed as before, in the own column");
  // The columns in the sidebar's order: the own one called by the workspace's name (its folder's: it is not the
  // default workspace), an extension's where the outline keeps it (garbled dragged first above, noted come last).
  // A web link added (gallery link add) goes first in the own column and makes no column (no 链接 since 2026-11-09).
  const own = "默认文档";
  const order = (stdout) => stdout.split(/\r?\n/).filter((line) => /栏/.test(line) && !line.startsWith(" ")).map((line) => line.replace(/栏.*$/, ""));
  assert.deepEqual(order(tree.stdout), [own, "garbled", "语雀", "big", "坏的", "有话"], tree.stdout);
  const linked = await gallery(["link", "add", "https://example.com/x", "例子"]);
  assert.equal(linked.code, 0, linked.stdout + linked.stderr);
  const after = await gallery(["list", "--tree"]);
  assert.deepEqual(order(after.stdout), [own, "garbled", "语雀", "big", "坏的", "有话"], after.stdout);
  const ownColumn = after.stdout.split(/\r?\n/);
  assert.match(ownColumn[ownColumn.indexOf(`${own}栏`) + 1] ?? "", /^ {2}example {2}例子/, after.stdout);

  // What the server tells the workbench of an extension's folder (in a process of its own: a workspace of its own).
  const studio = await fs.mkdtemp(path.join(os.tmpdir(), "extension-watch-"));
  const watched = spawnSync(process.execPath, [path.join(import.meta.dirname, "fixtures", "extension-watch.mjs")], { encoding: "utf8", env: { ...process.env, GALLERY_WORKSPACE: path.join(studio, "reports"), GALLERY_DEFAULT_WORKSPACE: path.join(studio, "reports") } });
  assert.equal(watched.status, 0, `${watched.stdout}${watched.stderr}`);
  await fs.rm(studio, { recursive: true, force: true });
  const refusedNew = await gallery(["new", "extensions", "x"]);
  assert.ok(refusedNew.code !== 0 && refusedNew.stderr.includes("a name the workspace keeps for itself"), refusedNew.stderr);

  // Only home supplies extension files, even to a command running elsewhere.
  const foreign = path.join(root, "foreign-storage");
  await fs.mkdir(path.join(foreign, "extensions", "yuque"), { recursive: true });
  await fs.writeFile(path.join(foreign, "extensions", "yuque", SIDEBAR_FILE), JSON.stringify({ title: "Ignored local override", entries: [] }));
  assert.equal((await listExtensions(foreign)).find(entry => entry.id === "yuque").title, "语雀");
  const publicFile = folder("public-links", SIDEBAR_FILE);
  const made = await gallery(["extension", "new", "public-links", "公共资料"]);
  assert.equal(made.code, 0, made.stderr);
  assert.deepEqual(JSON.parse(await fs.readFile(publicFile, "utf8")), { title: "公共资料", entries: [] });
  assert.equal((await gallery(["extension", "new", "public-links", "不能覆盖"])).code, 2);
  assert.equal((await gallery(["extension", "new", "local-only", "项目资料", "--local"])).code, 2, "local extension overrides are gone");
  assert.equal((await listExtensions(foreign)).find(entry => entry.id === "public-links").file, publicFile);

} finally {
  process.env.GALLERY_DEFAULT_WORKSPACE = savedHome;
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(path.join(os.tmpdir(), "cache-extensions"), { recursive: true, force: true }).catch(() => {});
}

console.log("Checked the extensions' columns: an extension's id and its column's, the file's rules (what makes it unusable, the notes, the limits of 8 levels, 2000 entries and 1 MB), the folders read, the outline keeping a column's place and no entry, the workspace service listing them, the watcher's paths and what the server tells of an extension's folder, and gallery extension list and check, with list --tree in the sidebar's order.");
