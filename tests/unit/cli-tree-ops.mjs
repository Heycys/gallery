import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createEditService } from "../../src/editor/service.mjs";
import { mergeFavorites } from "../../src/shared/favorite-merge.mjs";
import { changeFavorites, favoriteKey, favoriteSlug, favoritesFile, readFavorites } from "../../src/shared/favorites.mjs";
import { addColumn, removeColumn, removeDraft, renameColumn, straysOf } from "../../src/shared/outline-ops.mjs";
import { readOutline, writeOutline } from "../../src/shared/outline.mjs";
import { announcePreviewServer } from "../../src/shared/preview-server.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { serviceLocation } from "../../src/shared/service-location.mjs";
import { ensureWorkspace, listTrash } from "../../src/shared/workspace.mjs";
import { forgetWorkspace, registerWorkspace, workspaceId } from "../../src/shared/workspace-registry.mjs";
import { createWorkspaceService } from "../../src/workbench/service.mjs";

// What the sidebar does that an Agent asks for, as gallery commands (decided 2026-11-11; the commands are
// in src/cli/: trash, duplicate, copy, favorite, column, workspaces --show/--hide/--json, list --json, new and move --column):
// the plain column functions (shared/outline-ops.mjs, the ones the workbench's meta.ts has), the favorites the user's data folder
// keeps (never the workspace's files) and the merge a browser makes with its own (shared/favorites.mjs, favorite-merge.mjs), the service's
// duplicate with a slug and a title, copy-from keeping slugs, move to a column's top, and each command with no server (the
// service's own code under the outline's lock) and with one (the service's queue; an open workbench is told).

const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-tree-ops-"));
const home = path.join(root, "home");
const other = path.join(root, "other");
const previous = process.env.GALLERY_DEFAULT_WORKSPACE;
process.env.GALLERY_DEFAULT_WORKSPACE = home;
const not = path.join(root, "not-temporary");
for (const folder of [home, other]) {
  await ensureWorkspace(folder);
  await registerWorkspace(folder, { force: true, tmp: not });
}

// ---------- the column functions ----------
{
  const outline = { groups: [{ id: "docs" }, { id: "ws-aaaaaa", workspace: "ws-aaaaaa" }], children: { "": ["a"], a: ["b"], ":ws-aaaaaa": ["~ws-aaaaaa/x", "stray"], "~ws-aaaaaa/x": ["~ws-aaaaaa/y"] } };
  const frozen = JSON.stringify(outline);
  const added = addColumn(outline, { id: "g-1", title: "项目" });
  assert.deepEqual(added.groups.map((group) => group.id), ["docs", "ws-aaaaaa", "g-1"], "a new column goes last");
  assert.deepEqual(added.children[":g-1"], [], "with a top of its own");
  assert.equal(addColumn(added, { id: "g-1" }), null, "an id once");
  assert.equal(JSON.stringify(outline), frozen, "the outline given is never changed");
  assert.equal(renameColumn(added, "g-1", "  新  名 ").groups[2].title, "新 名");
  assert.equal(renameColumn(added, "g-1", "项目"), null, "the same name changes nothing");
  assert.equal(renameColumn(added, "g-1", "  "), null, "an empty name is none");
  assert.equal(renameColumn(added, "nope", "x"), null);
  assert.equal(renameColumn(added, "g-1", null).groups[2].title, undefined, "null: back to the name it goes by");
  // A column the user made: deleted, its entries (with those under them) last in the own column.
  const filled = { ...added, children: { ...added.children, ":g-1": ["c"], c: ["d"] } };
  const gone = removeColumn(filled, "g-1");
  assert.deepEqual(gone.groups.map((group) => group.id), ["docs", "ws-aaaaaa"]);
  assert.deepEqual([gone.children[""], gone.children.c, gone.children[":g-1"]], [["a", "c"], ["d"], undefined]);
  assert.equal(removeColumn(filled, "docs"), null, "the own column never goes");
  assert.equal(removeColumn(outline, "nope"), null);
  // A workspace's column: hidden, what was dragged into it last in the own column.
  assert.deepEqual(straysOf(outline, "ws-aaaaaa"), [{ slug: "stray", parent: ":ws-aaaaaa", index: 1 }]);
  const hidden = removeColumn(outline, "ws-aaaaaa");
  assert.equal(hidden.groups[1].hidden, true);
  assert.deepEqual([hidden.children[""], hidden.children[":ws-aaaaaa"]], [["a", "stray"], ["~ws-aaaaaa/x"]]);
  assert.equal(removeColumn(hidden, "ws-aaaaaa"), null, "hidden already");
  // A draft taken out of the tree: those under it go up, its slug is left out of its whole column.
  const taken = removeDraft(outline, "~ws-aaaaaa/x");
  assert.deepEqual(taken.children[":ws-aaaaaa"], ["~ws-aaaaaa/y", "stray"]);
  assert.deepEqual(taken.groups[1].left, ["x"]);
  assert.equal(removeDraft(outline, "~ws-aaaaaa/none"), null);
  assert.equal(removeDraft({ ...outline, groups: [{ id: "docs" }, { id: "ws-aaaaaa", workspace: "ws-aaaaaa", picked: true }] }, "~ws-aaaaaa/x").groups[1].left, undefined, "a picked column has nothing to leave out");
}

// ---------- the favorites ----------
{
  assert.deepEqual(mergeFavorites({ local: ["a", "b"], seen: [], server: [] }), { favorites: ["a", "b"], push: ["a", "b"], drop: [] }, "the browser's own are for the file to take");
  assert.deepEqual(mergeFavorites({ local: ["a"], seen: [], server: ["c", "a"] }), { favorites: ["a", "c"], push: [], drop: [] }, "the file's new ones join, the browser's order stays");
  assert.deepEqual(mergeFavorites({ local: ["a", "b"], seen: ["a", "b"], server: ["a"] }), { favorites: ["a"], push: [], drop: [] }, "one the file dropped since leaves the browser's");
  assert.deepEqual(mergeFavorites({ local: [], seen: ["a"], server: ["a"] }), { favorites: [], push: [], drop: ["a"] }, "one the browser took out since stays out, for the shared list to drop: a read landing before the removal does never brings it back");
  assert.deepEqual(mergeFavorites({ local: ["a"], seen: ["a"], server: ["a", "b"] }), { favorites: ["a", "b"], push: [], drop: [] }, "one the shared list gained since joins");
  // The file: keys are the default workspace's sidebar's, a workspace's own entries plain there and prefixed elsewhere.
  assert.equal(favoriteKey(home, "plan"), "plan");
  assert.equal(favoriteKey(other, "plan"), `~${workspaceId(other)}/plan`);
  assert.equal(favoriteKey(other, "~ws-abcdef/x"), "~ws-abcdef/x");
  assert.equal(favoriteSlug(other, `~${workspaceId(other)}/plan`), "plan");
  assert.equal(favoriteSlug(other, "plan"), `~${workspaceId(home)}/plan`, "the default workspace's own entries are drafts of it from another workspace");
  assert.equal(favoriteKey(other, `~${workspaceId(home)}/plan`), "plan");
  await writeOutline(home, { groups: [{ id: "docs" }], children: { "": ["plan"] } });
  assert.deepEqual(await readFavorites(home), []);
  assert.deepEqual(await changeFavorites(home, { add: ["plan", "plan", "x y"] }), { favorites: ["plan"], changed: true }, "an entry once, one that is none left out");
  assert.deepEqual(await changeFavorites(home, { add: ["plan"] }), { favorites: ["plan"], changed: false });
  assert.deepEqual(await changeFavorites(other, { add: ["note"] }), { favorites: [`~${workspaceId(home)}/plan`, "note"], changed: true }, "another workspace's, kept under its prefix in the default one's file");
  assert.deepEqual(await readFavorites(home), ["plan", `~${workspaceId(other)}/note`]);
  assert.deepEqual(await readFavorites(other), [`~${workspaceId(home)}/plan`, "note"]);
  // Kept in the user's data folder, never in a workspace's files: a star is the reader's, not the project's.
  const written = JSON.parse(await fs.readFile(favoritesFile(), "utf8"));
  assert.equal(path.dirname(favoritesFile()), path.resolve(process.env.GALLERY_DATA_DIR));
  assert.deepEqual(written.workspaces[workspaceId(home)], ["plan", `~${workspaceId(other)}/note`], "kept under the default workspace whose sidebar it is");
  // A write of the tree leaves them as they are, and puts none in the outline file.
  await writeOutline(home, { groups: [{ id: "docs" }], children: { "": ["plan", "more"] } });
  assert.deepEqual((await readFavorites(home)).slice(0, 1), ["plan"], "writeOutline leaves the favorites");
  assert.ok(!("favorites" in JSON.parse(await fs.readFile(path.join(home, ".gallery", "outline.json"), "utf8"))), "no favorite in the workspace's files");
  assert.deepEqual(await changeFavorites(home, { remove: ["plan", `~${workspaceId(other)}/note`] }), { favorites: [], changed: true });
  await fs.rm(path.join(home, ".gallery", "outline.json"));
  await fs.rm(favoritesFile());
}

// ---------- the service: duplicate with a slug and a title, copy-from keeping slugs, move to a column's top ----------
const documentHtml = (slug, title) => `<!doctype html><html><head><title>${title}</title></head><body><main class="doc-page" data-doc-id="${slug}"><header class="doc-header"><h1 class="doc-title">${title}</h1></header><section><p>hello</p></section></main></body></html>`;
const makeDocument = async (folder, slug, title, extra = {}) => {
  await fs.mkdir(path.join(folder, slug), { recursive: true });
  await fs.writeFile(path.join(folder, slug, "doc.html"), documentHtml(slug, title));
  await fs.writeFile(path.join(folder, slug, "doc.json"), JSON.stringify({ title, description: "d", ...extra }));
};
{
  const scratch = path.join(root, "service-home");
  const scratchOther = path.join(root, "service-other");
  process.env.GALLERY_DEFAULT_WORKSPACE = scratch;
  for (const folder of [scratch, scratchOther]) {
    await ensureWorkspace(folder);
    await registerWorkspace(folder, { force: true, tmp: not });
  }
  await makeDocument(scratch, "plan", "计划");
  await makeDocument(scratch, "child", "子页");
  await makeDocument(scratchOther, "plan", "别处的计划");
  await writeOutline(scratch, { groups: [{ id: "docs" }, { id: "g-1", title: "项目" }], children: { "": ["plan"], plan: ["child"], ":g-1": [] } });
  const edits = createEditService({ reportsDirectory: scratch });
  const service = createWorkspaceService({ edits, reportsDirectory: scratch, reports: { words: (html) => html } });
  const run = async (name, body) => (await service.run(name, body)).slice(0, 2);
  // duplicate: as the workbench's, or with the slug and the title given
  const plain = (await run("duplicate", { slug: "plan" }))[1];
  assert.ok(plain.ok && /^doc-[a-z0-9]{8}$/.test(plain.report.slug) && plain.report.title === "计划（副本）", JSON.stringify(plain));
  const named = (await run("duplicate", { slug: "plan", as: "next-week", title: "  Sessions   plan  " }))[1];
  assert.ok(named.ok && named.report.slug === "next-week" && named.report.title === "Sessions plan", JSON.stringify(named));
  assert.ok((await fs.readFile(path.join(scratch, "next-week", "doc.html"), "utf8")).includes('data-doc-id="next-week"'), "the copy's page carries its own slug");
  assert.deepEqual((await readOutline(scratch)).children[""], ["plan", "next-week", plain.report.slug], "each right after the original");
  for (const bad of [{ as: "plan" }, { as: "components" }, { as: "exports" }]) {
    const refused = await run("duplicate", { slug: "plan", ...bad });
    assert.ok(refused[0] === 409 || refused[0] === 400, `${bad.as} is refused: ${JSON.stringify(refused)}`);
  }
  assert.equal((await run("duplicate", { slug: "plan", as: "Bad Slug" }))[0], 400);
  // copy-from keeps the slugs the other workspace has free
  assert.equal((await run("copy-from", { sourceWs: workspaceId(scratch), slug: "plan" }))[0], 400, "the same workspace is no source");
  const otherService = createWorkspaceService({ edits: createEditService({ reportsDirectory: scratchOther }), reportsDirectory: scratchOther, reports: { words: (html) => html } });
  const kept = (await otherService.run("copy-from", { sourceWs: workspaceId(scratch), slug: "plan", keep: true, index: 5 }))[1];
  assert.ok(kept.ok && kept.count === 2, JSON.stringify(kept));
  assert.notEqual(kept.slug, "plan", "plan is taken there: a new doc-<id> name");
  assert.deepEqual((await readOutline(scratchOther)).children[kept.slug], ["child"], "child is free there: it keeps its slug");
  await makeDocument(scratch, "solo", "单独");
  await run("move", { slug: "solo", after: "plan" });
  // A document "solo" deleted there before left its recent versions: the copy kept under that slug takes over none of them.
  const otherState = path.join(scratchOther, ".gallery", "state");
  const stale = path.join(otherState, "history", "solo");
  await fs.mkdir(stale, { recursive: true });
  await fs.writeFile(path.join(stale, `20261101T080000000Z-${"a".repeat(16)}.html`), "a document deleted before");
  const statefulOther = createWorkspaceService({ edits: createEditService({ reportsDirectory: scratchOther, stateDirectory: otherState }), reportsDirectory: scratchOther, reports: { words: (html) => html } });
  const free = (await statefulOther.run("copy-from", { sourceWs: workspaceId(scratch), slug: "solo", keep: true }))[1];
  assert.equal(free.slug, "solo", "a document free there keeps its slug");
  assert.equal(await fs.access(stale).then(() => true, () => false), false, "the versions of the one deleted before under its slug are forgotten");
  const renamed = (await otherService.run("copy-from", { sourceWs: workspaceId(scratch), slug: "next-week" }))[1];
  assert.match(renamed.slug, /^doc-/, "without keep every copy has a new doc-<id> name, as the sidebar's");
  // move to another column's top key (gallery move --column)
  const moved = (await run("move", { slug: "plan", parent: ":g-1", after: null, first: false }))[1];
  assert.ok(moved.ok && moved.parent === ":g-1", JSON.stringify(moved));
  assert.equal((await run("move", { slug: "plan", parent: ":no/bad", after: null, first: false }))[0], 400);
  // favorite
  const star = (await run("favorite", { add: ["plan"] }))[1];
  assert.deepEqual([star.ok, star.favorites, star.changed], [true, ["plan"], true]);
  assert.equal((await run("favorite", { add: ["nothing"] }))[0], 404, "an entry the outline does not hold");
  assert.equal((await run("favorite", { add: "plan" }))[0], 400);
  await run("favorite", { remove: ["plan"] }); // the list is the user's data folder's, which the commands below share
  process.env.GALLERY_DEFAULT_WORKSPACE = home;
  for (const folder of [scratch, scratchOther]) await forgetWorkspace(folder); // (every registered workspace is a column of every sidebar)
}

// ---------- the commands, with no server ----------
const run = promisify(execFile);
const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
const quiet = { GALLERY_NO_PREVIEW: "1", GALLERY_NO_BROWSER: "1", GALLERY_NO_UPDATE_CHECK: "1", GALLERY_NO_DEFAULT_TREE: "1", GALLERY_CACHE_DIR: path.join(root, "cache"), CLAUDE_CONFIG_DIR: path.join(root, "agents", "claude"), CODEX_HOME: path.join(root, "agents", "codex") };
const gallery = async (args, { workspace = home, defaults = home } = {}) => {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, "--workspace", workspace, ...args], { env: { ...process.env, ...quiet, GALLERY_DEFAULT_WORKSPACE: defaults } });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
const ok = async (args, options) => {
  const result = await gallery(args, options);
  assert.equal(result.code, 0, `gallery ${args.join(" ")}\n${result.stdout}${result.stderr}`);
  return result;
};
const failed = async (args, code, pattern, options) => {
  const result = await gallery(args, options);
  assert.equal(result.code, code, `gallery ${args.join(" ")} exits ${code}\n${result.stdout}${result.stderr}`);
  if (pattern) assert.match(result.stderr, pattern, `gallery ${args.join(" ")}`);
  return result;
};
const json = async (args, options) => JSON.parse((await ok(args, options)).stdout);
const outlineFile = async () => JSON.parse(await fs.readFile(path.join(home, ".gallery", "outline.json"), "utf8"));
const docs = async () => (await json(["list", "--json"])).documents;

{
  await ok(["new", "proj", "项目"]);
  await ok(["new", "weekly", "周报", "--under", "proj"]);
  await ok(["new", "notes", "笔记", "--under", "proj"]);
  await ok(["new", "solo", "单独", "--after", "proj"]);
  await fs.writeFile(path.join(home, "weekly", "doc.json"), JSON.stringify({ title: "周报", description: "每周", icon: "📝", look: { font: "serif", size: "bogus" } }));

  // list --json
  const listed = await json(["list", "--json"]);
  assert.equal(listed.workspace, path.resolve(home));
  const weekly = listed.documents.find((entry) => entry.slug === "weekly");
  assert.equal(weekly.title, "周报");
  assert.equal(weekly.icon, "📝");
  assert.equal(weekly.description, "每周");
  assert.match(weekly.link, /^周报-[a-z0-9]{8}$/, "the page link");
  assert.equal(weekly.address, `/#${weekly.link}`);
  assert.equal(weekly.path, path.join(path.resolve(home), "weekly", "doc.html"));
  assert.equal(weekly.parent, "proj");
  assert.deepEqual([weekly.column, weekly.columnId, weekly.favorite], ["默认文档", "docs", false]);
  assert.deepEqual(weekly.look, { font: "serif" }, "the look of its own, what doc.json holds of it that is valid");
  assert.match(weekly.edited, /^\d{4}-\d\d-\d\dT/);
  assert.equal(listed.documents.find((entry) => entry.slug === "proj").parent, null);
  assert.deepEqual(listed.links, []);
  assert.deepEqual((await json(["list", "周报", "--json"])).documents.map((entry) => entry.slug), ["weekly"], "with words, the documents that hold them");
  const tree = await json(["list", "--tree", "--json"]);
  assert.deepEqual(tree.documents.map((entry) => [entry.slug, entry.depth]), [["proj", 0], ["weekly", 1], ["notes", 1], ["solo", 0]], "the sidebar's order, each with its depth");
  assert.deepEqual((await json(["list", "--tree", "proj", "--json"])).documents.map((entry) => entry.slug), ["proj", "weekly", "notes"]);
  assert.deepEqual(tree.drafts.map((entry) => entry.entry), [], "no other workspace's document yet");
  const all = await json(["list", "--all", "--json"]);
  assert.ok(all.documents.every((entry) => entry.workspace) && all.documents.some((entry) => entry.slug === "weekly"), "--all: each with its workspace");
  await failed(["list", "--json", "--tree", "--all"], 2);

  // workspaces --json
  const known = await json(["workspaces", "--json"]);
  assert.equal(known.current, path.resolve(home));
  assert.equal(known.service, null);
  const mine = known.workspaces.find((entry) => entry.current);
  assert.deepEqual([mine.path, mine.id, mine.default, mine.documents], [path.resolve(home), workspaceId(home), true, 4]);
  assert.ok(known.workspaces.some((entry) => entry.path === path.resolve(other) && !entry.current && !entry.default));
  await failed(["workspaces", "--scan", "--json"], 2);

  // trash: a document with documents under it (they move up), listed, restored; a name that is none
  const trashed = await ok(["trash", "proj"]);
  assert.match(trashed.stdout, /Moved the document proj \(项目\) to the trash \(id [a-z0-9]+-[a-z0-9]+\)/);
  assert.match(trashed.stdout, /the 2 documents under it moved up there: weekly, notes/);
  assert.match(trashed.stdout, /提示：/);
  assert.deepEqual((await docs()).map((entry) => entry.slug).sort(), ["notes", "solo", "weekly"], "the trash is not in the list");
  assert.deepEqual((await docs()).find((entry) => entry.slug === "weekly").parent, null, "its children are not trashed with it");
  assert.equal((await fs.stat(path.join(home, "proj")).catch(() => null)), null, "its folder is in the trash");
  const binned = await json(["trash", "list", "--json"]);
  assert.equal(binned.items.length, 1);
  assert.deepEqual([binned.items[0].kind, binned.items[0].slug, binned.items[0].title, binned.items[0].parent, binned.items[0].column], ["document", "proj", "项目", null, "默认文档"]);
  assert.match(binned.items[0].trashed, /^\d{4}-/);
  assert.match((await ok(["trash", "list"])).stdout, /proj {2}项目/);
  await failed(["trash", "proj"], 2, /in the trash/);
  await failed(["trash", "no-such-doc"], 1, /No document "no-such-doc"/);
  await failed(["trash", "weekly", "no-such-doc"], 1, /Nothing moved to the trash/);
  assert.ok((await docs()).some((entry) => entry.slug === "weekly"), "a mistake in the last leaves the others where they are");
  await failed(["trash"], 2);
  const back = await ok(["trash", "restore", "proj"]);
  assert.match(back.stdout, /Restored the document proj \(项目\)/);
  assert.match(back.stdout, /位置：顶层/, "back at the top level where it was");
  assert.ok((await docs()).some((entry) => entry.slug === "proj"));
  await failed(["trash", "restore", "proj"], 1, /No item "proj" in the trash/);
  // by title; and under its parent again
  await ok(["move", "weekly", "--under", "proj"]);
  await ok(["trash", "周报"]);
  assert.deepEqual((await json(["trash", "list", "--json"])).items.map((entry) => [entry.slug, entry.parent, entry.place]), [["weekly", "proj", "under proj (项目)"]]);
  const placed = await ok(["trash", "restore", "周报"]);
  assert.match(placed.stdout, /位置：proj \(项目\)/, "back under the document it was under");
  assert.equal((await docs()).find((entry) => entry.slug === "weekly").parent, "proj");

  // a web link and a custom page go to the same trash; link remove is its alias
  await ok(["link", "add", "https://example.com/", "示例", "--icon", "🔗"]);
  const linkSlug = (await json(["list", "--json"])).links[0].slug;
  const gone = await ok(["trash", linkSlug]);
  assert.match(gone.stdout, /Moved the web link example/);
  assert.equal((await json(["list", "--json"])).links.length, 0);
  assert.deepEqual((await json(["trash", "list", "--json"])).items.map((entry) => entry.kind), ["link"]);
  await ok(["trash", "restore", linkSlug]);
  assert.equal((await json(["list", "--json"])).links.length, 1);
  const removed = await ok(["link", "remove", linkSlug]);
  assert.match(removed.stdout, /^Moved the web link example \(示例\) to the trash: the workbench's 设置 › 回收区 restores it where it was\./);
  await ok(["trash", "restore", "示例"]);
  await ok(["page", "new", "board", "看板"]);
  assert.match((await ok(["trash", "board"])).stdout, /Moved the custom page board \(看板\) to the trash/);
  assert.ok(!(await json(["page", "list", "--json"]).catch(() => ({ pages: [] }))).pages?.some?.((page) => page.slug === "board"));
  assert.deepEqual((await json(["trash", "list", "--json"])).items.map((entry) => [entry.kind, entry.slug]), [["page", "board"]]);
  assert.match((await ok(["trash", "restore", "board"])).stdout, /Restored the custom page board/);
  assert.ok((await fs.stat(path.join(home, "pages", "board", "page.html")).catch(() => null)), "its folder is back");

  // empty: for good, one item or all
  await ok(["trash", "notes", "solo"]);
  assert.equal((await json(["trash", "list", "--json"])).items.length, 2);
  const one = await ok(["trash", "empty", "notes"]);
  assert.match(one.stdout, /Deleted for good from the trash \(1\): notes \(笔记\)/);
  assert.deepEqual((await listTrash(home)).map((entry) => entry.slug), ["solo"]);
  await ok(["trash", "empty"]);
  assert.deepEqual(await listTrash(home), []);
  assert.match((await ok(["trash", "empty"])).stdout, /The trash is empty/);
  assert.match((await ok(["trash", "list"])).stdout, /The trash is empty/);
  await failed(["trash", "empty", "weekly-zz"], 1, /No item "weekly-zz" in the trash/);
  await failed(["trash", "list", "--json", "extra"], 2);

  // duplicate
  const copy = await ok(["duplicate", "weekly"]);
  assert.match(copy.stdout, /Duplicated weekly \(周报\) as doc-[a-z0-9]{8} \(周报（副本）\), right after it in the sidebar\./);
  assert.match(copy.stdout, /位置：proj \(项目\)/);
  assert.match(copy.stdout, /下一步：/);
  assert.match(copy.stdout, /提示：The server was not started/, "with the server left alone it says how to start it");
  const copies = (await docs()).filter((entry) => entry.title === "周报（副本）");
  assert.equal(copies.length, 1);
  assert.equal(copies[0].icon, "📝");
  assert.deepEqual(copies[0].look, { font: "serif" }, "the copy keeps the look of its own");
  assert.ok((await fs.readFile(path.join(home, copies[0].slug, "doc.html"), "utf8")).includes(`data-doc-id="${copies[0].slug}"`), "a new id in its page");
  const order = (await outlineFile()).children.proj;
  assert.equal(order[order.indexOf("weekly") + 1], copies[0].slug, "right after the original");
  const named = await ok(["duplicate", "weekly", "weekly-next", "--title", "下周周报"]);
  assert.match(named.stdout, /as weekly-next \(下周周报\)/);
  assert.ok((await docs()).some((entry) => entry.slug === "weekly-next" && entry.title === "下周周报"));
  await failed(["duplicate", "weekly", "weekly-next"], 1, /already exists/);
  await failed(["duplicate", "weekly", "exports"], 2, /name the workspace keeps for itself/);
  await failed(["duplicate", "no-such"], 1);
  await failed(["duplicate", "weekly", "Not A Slug"], 2);
  await failed(["duplicate", "weekly", "--title", "  "], 2);
  await failed(["duplicate", linkSlug], 1, /web link/);

  // favorite: on, again, listed, off; a page refused; a name that is none
  assert.match((await ok(["favorite", "weekly"])).stdout, /Put weekly \(周报\) in the sidebar's 收藏 \(1 now\)/);
  assert.match((await ok(["favorite", "weekly"])).stdout, /is in 收藏 already: nothing to change/);
  assert.equal((await docs()).find((entry) => entry.slug === "weekly").favorite, true);
  assert.equal((await docs()).find((entry) => entry.slug === "weekly-next").favorite, false);
  await ok(["favorite", linkSlug]);
  assert.equal((await json(["list", "--json"])).links[0].favorite, true, "a web link too");
  assert.deepEqual(Object.values(JSON.parse(await fs.readFile(favoritesFile(), "utf8")).workspaces).flat(), ["weekly", linkSlug], "kept in the user's data folder");
  assert.ok(!("favorites" in (await outlineFile())), "never in the workspace's outline file");
  assert.match((await ok(["favorite", "weekly", "--off"])).stdout, /Took weekly \(周报\) out of the sidebar's 收藏 \(1 now\)/);
  assert.match((await ok(["favorite", "weekly", "--off"])).stdout, /is not in 收藏 already/);
  assert.equal((await docs()).find((entry) => entry.slug === "weekly").favorite, false);
  await failed(["favorite", "board"], 1, /custom page/);
  await failed(["favorite", "no-such"], 1);
  await failed(["favorite"], 2);

  // columns: new, again, new --column, move --column, listed in the tree, rename, remove
  const made = await ok(["column", "new", "项目栏"]);
  assert.match(made.stdout, /Made the column "项目栏" \(g-[a-z0-9]{4}\), last in the sidebar\./);
  assert.match(made.stdout, /Columns now \(the sidebar's order\): 默认文档, other, 项目栏\./);
  assert.match((await ok(["column", "new", "项目栏"])).stdout, /is in the sidebar already/);
  assert.match((await ok(["list", "--tree"])).stdout, /项目栏栏（空）/, "gallery list --tree lists the column");
  const column = (await outlineFile()).groups.find((group) => group.title === "项目栏");
  assert.ok(column && column.owner === workspaceId(home), "the column belongs to the workspace");
  const newer = await ok(["new", "w3", "三", "--column", "项目栏"]);
  assert.match(newer.stdout, /Placed it at the top of the 项目栏 column, the only document there\./);
  await ok(["new", "w4", "四", "--column", "项目栏", "--first"]);
  assert.deepEqual((await json(["list", "--tree", "--json"])).documents.filter((entry) => entry.column === "项目栏").map((entry) => entry.slug), ["w4", "w3"]);
  await failed(["new", "w5", "五", "--column", "没有这一栏"], 1, /No column "没有这一栏"/);
  assert.equal(await fs.stat(path.join(home, "w5")).catch(() => null), null, "nothing made for a column that is none");
  await failed(["new", "w5", "五", "--column", "项目栏", "--under", "weekly"], 2, /two places/);
  await failed(["new", "w5", "五", "--column", "other"], 1, /another workspace's/);
  assert.equal(await fs.stat(path.join(home, "w5")).catch(() => null), null);
  const movedIn = await ok(["move", "proj", "--column", "项目栏"]);
  assert.match(movedIn.stdout, /Moved proj \(项目\) with the \d+ documents? under it: now at the top of the 项目栏 column/);
  assert.equal((await docs()).find((entry) => entry.slug === "weekly").column, "项目栏", "those under it went with it");
  await ok(["move", "weekly", "--column", "项目栏", "--first"]);
  await failed(["move", "proj", "--column", "other"], 1, /another workspace's/);
  await failed(["move", "proj", "--column", "项目栏", "--top"], 2);
  await failed(["move", "proj", "--column", "nope"], 1, /No column "nope"/);
  assert.match((await ok(["column", "rename", "项目栏", "归档"])).stdout, /Renamed the column "项目栏" to "归档"/);
  assert.match((await ok(["column", "rename", "归档", "归档"])).stdout, /called "归档" already/);
  await failed(["column", "rename", "项目栏", "x"], 1, /No column/);
  await failed(["column", "rename", "归档", " "], 2);
  await failed(["column", "remove", "默认文档"], 1, /own: it is never removed/);
  await failed(["column", "remove", "nope"], 1, /No column/);
  await failed(["column", "frobnicate"], 2);
  const removedColumn = await ok(["column", "remove", "归档"]);
  assert.match(removedColumn.stdout, /Removed the column "归档" \(g-[a-z0-9]{4}\); the \d+ entr(y|ies) in it, with those under them, went last to the own column\. No file was deleted\./);
  assert.ok((await docs()).every((entry) => entry.column === "默认文档"), "the entries are in the own column");
  assert.ok(await fs.stat(path.join(home, "proj", "doc.html")), "no file deleted");

  // copy to another workspace: keeping its slug, under a document there, and the mistakes
  const copied = await ok(["copy", "weekly", "--to", other]);
  assert.match(copied.stdout, /Copied weekly \(周报\) to .*other: weekly \(周报\), last at its top level\. The original stays where it was\./);
  assert.ok(await fs.stat(path.join(other, "weekly", "doc.html")), "the copy keeps the slug where the other workspace has it free");
  assert.ok((await fs.readFile(path.join(other, "weekly", "doc.html"), "utf8")).includes('data-doc-id="weekly"'));
  assert.ok(await fs.stat(path.join(home, "weekly", "doc.html")), "the original stays");
  const there = await json(["list", "--json"], { workspace: other });
  assert.deepEqual(there.documents.map((entry) => entry.slug), ["weekly"]);
  const again = await ok(["copy", "weekly", "--to", workspaceId(other), "--under", "weekly"]);
  assert.match(again.stdout, /last under weekly \(周报\)\./);
  const twice = (await json(["list", "--tree", "--json"], { workspace: other })).documents;
  assert.equal(twice.length, 2);
  assert.equal(twice[1].parent, "weekly");
  assert.match(twice[1].slug, /^doc-[a-z0-9]{8}$/, "weekly is taken there: a doc-<id> name");
  await failed(["copy", "weekly", "--to", home], 1, /in .* already/);
  await failed(["copy", "weekly", "--to", path.join(root, "not-a-workspace")], 1, /not a Gallery workspace/);
  await failed(["copy", "weekly", "--to", "ws-000000"], 1, /no registered workspace/);
  await failed(["copy", "weekly", "--to", other, "--under", "none"], 1, /No document "none"/);
  await failed(["copy", "weekly"], 2, /--to/);
  await failed(["copy", linkSlug, "--to", other], 1, /web link/);

  // workspaces --show: the other workspace whole, one of its documents; --hide as the menu hides (written, and said not to show)
  const shown = await ok(["workspaces", "--show", other]);
  assert.match(shown.stdout, /the workspace .*other as the column "other"/);
  const shownDoc = await ok(["workspaces", "--show", workspaceId(other), "--doc", "weekly"]);
  assert.match(shownDoc.stdout, /The sidebar lists the document already: ~ws-[0-9a-f]{6}\/weekly \(周报\)/);
  await failed(["workspaces", "--show", "ws-000000"], 1, /no registered workspace/);
  await failed(["workspaces", "--show", path.join(root, "plain-folder")], 1);
  await failed(["workspaces", "--doc", "x"], 2, /goes with --show or --hide/);
  await failed(["workspaces", "--register"], 2);
  await failed(["workspaces", "--show", other, "--hide", other], 2);
  const hidden = await gallery(["workspaces", "--hide", other]);
  assert.equal(hidden.code, 1, "the sidebar still draws the column: said, exit 1");
  assert.match(hidden.stdout, /Hid the column "other" \(ws-[0-9a-f]{6}\) of the sidebar: the workspace .* the registry are as they were/);
  assert.match(hidden.stdout, /提示：the sidebar still lists the column "other"/);
  assert.equal((await outlineFile()).groups.find((group) => group.workspace === workspaceId(other)).hidden, true, "written as the sidebar's menu writes it");
  assert.ok(await fs.stat(path.join(other, "weekly", "doc.html")), "nothing of the workspace touched");
  assert.ok(JSON.parse(await fs.readFile(path.join(process.env.GALLERY_DATA_DIR, "workspaces.json"), "utf8")).workspaces.some(({ root: each }) => path.resolve(each) === path.resolve(other)), "the registry is as it was");
  await failed(["workspaces", "--hide", home], 1, /current workspace/);
  await failed(["workspaces", "--hide", path.join(root, "never-registered")], 1, /no column/);
  const leaving = await gallery(["workspaces", "--hide", other, "--doc", "weekly"]);
  assert.equal(leaving.code, 1);
  assert.match(leaving.stdout, /Took the document ~ws-[0-9a-f]{6}\/weekly \(周报\) out of the sidebar's tree; its file and its workspace are untouched/);
  assert.deepEqual((await outlineFile()).groups.find((group) => group.workspace === workspaceId(other)).left, ["weekly"], "left out of its whole column");
  assert.ok(await fs.stat(path.join(other, "weekly", "doc.html")), "its document is untouched");
  await failed(["workspaces", "--hide", other, "--doc", "no-such"], 1, /has no document no-such/);

  // help says them all
  for (const text of ["trash list [--json]", "--column", "gallery column new", "gallery favorite <entry> [--off]", "gallery copy <document> --to <workspace>", "--hide <path or id>"]) {
    assert.ok(Object.values((await import("../../src/cli/usage.mjs")).USAGE).some((usage) => usage.includes(text)), `help says ${text}`);
  }
}

// ---------- with a server: the service's queue, an open workbench told ----------
{
  const serverHome = path.join(root, "server-home");
  await ensureWorkspace(serverHome);
  await registerWorkspace(serverHome, { force: true, tmp: not });
  process.env.GALLERY_DEFAULT_WORKSPACE = serverHome;
  await makeDocument(serverHome, "a", "甲");
  await makeDocument(serverHome, "b", "乙");
  await writeOutline(serverHome, { groups: [{ id: "docs" }], children: { "": ["a", "b"] } });
  let told = 0;
  const edits = createEditService({ reportsDirectory: serverHome });
  const workspace = createWorkspaceService({ edits, reportsDirectory: serverHome, reports: { words: (html) => html }, changed: () => { told += 1; } });
  const listening = http.createServer((request, response) => {
    if (request.url === "/__gallery/workspace/info") return response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ token: edits.token, server: { pid: process.pid, home: serverHome, data: serviceLocation().data, kind: "dev" } }));
    const name = request.url.match(/^\/__gallery\/workspace\/([a-z-]+)(?:\?|$)/)?.[1];
    if (name) return workspace.handle(request, response, name);
    response.writeHead(404).end();
  });
  await new Promise((resolve) => listening.listen(0, "127.0.0.1", resolve));
  const forget = await announcePreviewServer({ home: serverHome, port: listening.address().port, token: edits.token, every: 0 });
  const viaServer = (args) => gallery(args, { workspace: serverHome, defaults: serverHome }).then((result) => (assert.equal(result.code, 0, `${args.join(" ")}\n${result.stdout}${result.stderr}`), result));
  const mark = () => told;
  try {
    let before = mark();
    const hand = await viaServer(["trash", "a"]);
    assert.match(hand.stdout, /Moved the document a \(甲\)/);
    assert.ok(mark() > before, "the server's workbench is told of the trash");
    assert.deepEqual((await readOutline(serverHome)).children[""], ["b"]);
    before = mark();
    await viaServer(["trash", "restore", "a"]);
    assert.ok(mark() > before, "and of the restore");
    assert.deepEqual((await readOutline(serverHome)).children[""], ["a", "b"], "back where it was");
    before = mark();
    await viaServer(["column", "new", "栏甲"]);
    assert.ok(mark() > before, "a column made through the server tells the workbench");
    assert.ok((await readOutline(serverHome)).groups.some((group) => group.title === "栏甲"));
    await viaServer(["new", "c", "丙", "--column", "栏甲"]);
    await viaServer(["move", "a", "--column", "栏甲"]);
    const column = (await readOutline(serverHome)).groups.find((group) => group.title === "栏甲");
    assert.deepEqual([...(await readOutline(serverHome)).children[`:${column.id}`]].sort(), ["a", "c"]);
    before = mark();
    await viaServer(["favorite", "b"]);
    assert.ok(mark() > before, "a favorite tells the workbench");
    assert.deepEqual(await readFavorites(serverHome), ["b"]);
    const got = await fetch(`http://127.0.0.1:${listening.address().port}/__gallery/workspace/outline`).then((response) => response.json());
    assert.deepEqual(got.favorites, ["b"], "GET outline gives the stored favorites for the workbench to merge");
    await viaServer(["duplicate", "b", "--no-preview", "--no-browser"]);
    assert.ok((await readOutline(serverHome)).children[""].length >= 2);
    await viaServer(["column", "rename", "栏甲", "栏乙"]);
    await viaServer(["column", "remove", "栏乙"]);
    assert.ok(!(await readOutline(serverHome)).groups.some((group) => group.title === "栏乙"));
  } finally {
    await forget();
    await new Promise((resolve) => listening.close(resolve));
  }
}

process.env.GALLERY_DEFAULT_WORKSPACE = previous ?? "";
if (previous === undefined) delete process.env.GALLERY_DEFAULT_WORKSPACE;
await fs.rm(root, { recursive: true, force: true });
console.log("cli-tree-ops: ok");
