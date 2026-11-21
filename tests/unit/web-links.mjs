import { workspaceId } from "../../src/shared/workspace-registry.mjs";
import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createEditService } from "../../src/editor/service.mjs";
import { DOCS, groupOf, isTop, newGroupId, topIn, topOf, validGroups } from "../../src/shared/outline-shape.mjs";
import { ancestorsIn, fileOf, moveIn, placeIn, readOutline, storedOf, validOutline, writeOutline, writtenAs } from "../../src/shared/outline.mjs";
import { siteIcon } from "../../src/editor/unfurl.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { SITE_ICON_BYTES, isSiteIcon, kebab, linkAddress, linkStem, linkValue, ownAddress, readLinkText } from "../../src/shared/web-links.mjs";
import { listLinkSlugs, listTrash } from "../../src/shared/workspace.mjs";
import { createWorkspaceService } from "../../src/workbench/service.mjs";

// The sidebar's columns and web links (docs/workbench.md "Columns", "Web links"; decided
// 2026-11-08): the outline of version 2
// (shared/outline.mjs: the 文档 column's tree where version 1 had the whole tree, every other column in
// `groups`; version 1 read as 文档 alone), its shape (shared/outline-shape.mjs), a web link's file
// (shared/web-links.mjs: http or https, a title, an emoji or a glyph, never this Gallery's own address),
// the workspace service's columns and links (POST outline with groups, a version 1 tree merged; POST
// link, link-set, trash and restore of kind link; the frame check kept an hour; search passing links
// over), and gallery link add/set/remove with gallery list and list --tree (no server: the service's
// own code under the outline's lock).

// ---------- the shape ----------
{
  assert.equal(topOf(DOCS), "", "文档's top is the tree's top of version 1");
  assert.equal(topOf("g-7k2m"), ":g-7k2m");
  assert.ok(isTop("") && isTop(":g-7k2m") && !isTop("plan"));
  assert.deepEqual(groupOf({ id: "g-1", title: "  链接  栏 ", role: "links", extra: 1 }), { id: "g-1", title: "链接 栏", role: "links" }, "a title tidied, what is not a column's dropped");
  assert.deepEqual(groupOf({ id: "docs", role: "links", workspace: "ws-3f2a9c" }), { id: "docs" }, "文档 has no role and no workspace");
  assert.deepEqual(groupOf({ id: "ws-3f2a9c", workspace: "ws-3f2a9c" }), { id: "ws-3f2a9c", workspace: "ws-3f2a9c" }, "a workspace's column (a later line of work) kept");
  assert.equal(groupOf({ id: "../x" }), null);
  assert.ok(validGroups([{ id: "docs" }, { id: "g-1", title: "a" }]));
  assert.ok(!validGroups([{ id: "g-1" }]), "文档 is always there");
  assert.ok(!validGroups([{ id: "docs" }, { id: "docs" }]), "an id once");
  assert.ok(!validGroups([{ id: "docs" }, { id: "g-1", role: "files" }]), "no role but links");
  assert.ok(!validGroups([{ id: "docs" }, { id: "g-1", title: "x".repeat(101) }]), "a title of 100 at most");
  let draws = [0, 0.5];
  assert.equal(newGroupId([{ id: "g-0000" }], () => draws.shift()), "g-i000", "a new id is none of theirs");
  draws = [];
  assert.equal(topIn({ "": ["a"], a: ["b"], ":g-1": ["c"] }, "b"), "");
  assert.equal(topIn({ "": ["a"], a: ["b"], ":g-1": ["c"] }, "c"), ":g-1");
  assert.equal(topIn({ "": ["a"] }, "z"), null);
}

// ---------- the file of version 2 ----------
{
  const groups = [{ id: "docs" }, { id: "g-7k2m", role: "links" }, { id: "g-team", title: "团队" }];
  const children = { "": ["plan", "weekly"], plan: ["notes"], ":g-7k2m": ["weather"], weather: ["sub"], ":g-team": [] };
  const file = fileOf({ groups, children });
  assert.deepEqual(file, {
    version: 2,
    children: { "": ["plan", "weekly"], plan: ["notes"] },
    groups: [{ id: "docs" }, { id: "g-7k2m", role: "links", children: { "": ["weather"], weather: ["sub"] } }, { id: "g-team", title: "团队", children: { "": [] } }],
  }, "文档's tree at the top, as version 1 had it; every other column's in its own children");
  assert.deepEqual(storedOf(file), { groups, children: { "": ["plan", "weekly"], plan: ["notes"], ":g-7k2m": ["weather"], weather: ["sub"], ":g-team": [] } }, "read back as it was written");
  // An older Gallery reads stored.children: the 文档 column's tree, its documents' order as before.
  assert.deepEqual(file.children, { "": ["plan", "weekly"], plan: ["notes"] });
  // Version 1 is 文档 alone; groups without 文档 get it first.
  assert.deepEqual(storedOf({ version: 1, children: { "": ["a"], a: ["b"] } }), { groups: [{ id: "docs" }], children: { "": ["a"], a: ["b"] } });
  assert.deepEqual(storedOf({ version: 2, children: { "": ["a"] }, groups: [{ id: "g-1", children: { "": ["b"] } }] }).groups, [{ id: "docs" }, { id: "g-1" }]);
  // The own column titled with its old name (文档, Documents: a rename confirmed unchanged wrote it) reads
  // as no title, so that 默认文档 or the workspace's name shows; any other title, or another column's 文档, stays.
  for (const old of ["文档", "Documents"]) assert.deepEqual(storedOf({ version: 2, children: { "": ["a"] }, groups: [{ id: "docs", title: old }] }).groups, [{ id: "docs" }], `the own column's ${old}: no title`);
  assert.deepEqual(storedOf({ version: 2, children: { "": ["a"] }, groups: [{ id: "docs", title: "我的文档" }, { id: "g-1", title: "文档", children: { "": [] } }] }).groups, [{ id: "docs", title: "我的文档" }, { id: "g-1", title: "文档" }], "a name the user gave, and another column's 文档, kept");
  assert.ok(writtenAs({ groups: [{ id: "docs" }], children: { "": ["a"] } }, storedOf({ version: 2, children: { "": ["a"] }, groups: [{ id: "docs", title: "文档" }] })), "what the workbench read of it is what is stored: its next change writes no title");
  assert.equal(storedOf(null), null);
  assert.equal(storedOf([]), null);

  // validOutline: tops of its columns, entries once each across columns, a draft of another workspace's spelling allowed.
  assert.ok(validOutline({ groups, children }));
  assert.ok(validOutline({ children: { "": ["a"], a: ["b"] } }), "version 1");
  assert.ok(!validOutline({ children: { ":g-7k2m": ["a"] } }), "version 1 has 文档's top alone");
  assert.ok(!validOutline({ groups, children: { "": ["a"], ":g-team": ["a"] } }), "an entry once across columns");
  assert.ok(!validOutline({ groups, children: { ":g-gone": ["a"] } }), "a column it does not list");
  assert.ok(validOutline({ groups, children: { "": ["~ws-3f2a9c/notes"] } }), "the format is ready for drafts of other workspaces");
  assert.ok(!validOutline({ groups: [{ id: "g-1" }], children: {} }), "文档 missing");

  // writtenAs: lists and columns; one without groups held to 文档 alone.
  const read = { groups, children: { ...children, ":g-team": [] } };
  assert.ok(writtenAs({ groups, children: { ...children } }, read));
  assert.ok(!writtenAs({ groups: [...groups].reverse(), children }, read), "the columns' order counts");
  assert.ok(!writtenAs({ groups: groups.map((group) => (group.id === "g-team" ? { ...group, title: "别的" } : group)), children }, read), "a rename counts");
  assert.ok(writtenAs({ children: { "": ["plan", "weekly"], plan: ["notes"] } }, read), "a version 1 base: 文档's part alone");
  assert.ok(!writtenAs({ children: { "": ["plan"] } }, read));

  // moveIn across columns: a move to another parent; "" is the top of the column it is in.
  const tree = { "": ["plan", "weekly"], plan: ["notes"], ":g-7k2m": ["weather"] };
  assert.deepEqual(moveIn(tree, "plan", { parent: ":g-7k2m", first: true }), { ok: true, moved: true, parent: ":g-7k2m", index: 0, from: { parent: "", index: 0 } });
  assert.deepEqual(tree, { "": ["weekly"], plan: ["notes"], ":g-7k2m": ["plan", "weather"] }, "with what is under it");
  assert.deepEqual(moveIn(tree, "notes", { parent: "" }).parent, ":g-7k2m", "--top: the top of its own column");
  assert.deepEqual(moveIn(tree, "weekly", { parent: "weather" }).parent, "weather", "under a link: one rule for every entry");
  assert.deepEqual(ancestorsIn(tree, "weekly"), ["weather"], "its column is no ancestor");
  assert.deepEqual(moveIn(tree, "weekly", { parent: ":g-gone" }), { ok: false, reason: "parent" });
  assert.ok(Object.hasOwn(tree, ":g-7k2m") && Object.hasOwn(tree, ""), "a column's top stays though it empties");

  // placeIn: under a column's top, an entry, or the own column's top when the parent is not there.
  const top = ":g-l";
  const outline = { groups: [{ id: "docs" }, { id: "g-l", role: "links" }], children: { "": ["a"], [top]: [] } };
  placeIn(outline, "w", top);
  placeIn(outline, "x", "a", 0);
  placeIn(outline, "y", ":g-gone");
  assert.deepEqual(outline.children, { "": ["a", "y"], a: ["x"], [top]: ["w"] }, "a column not there: 文档's top");
}

// ---------- a link's file ----------
{
  assert.deepEqual(linkAddress("example.com/a b"), { url: "https://example.com/a%20b" }, "no scheme: https");
  assert.equal(linkAddress("javascript:alert(1)").refused, "scheme");
  assert.equal(linkAddress("file:///C:/x.html").refused, "scheme");
  assert.equal(linkAddress("data:text/html,<p>").refused, "scheme");
  assert.equal(linkAddress("  ").refused, "url");
  assert.equal(linkAddress(`https://a.com/${"x".repeat(2048)}`).refused, "long");
  assert.deepEqual(linkValue({ url: "https://open-meteo.com/en/docs", title: " 天气接口文档 ", icon: "🌤️" }), { value: { url: "https://open-meteo.com/en/docs", title: "天气接口文档", icon: "🌤️" } });
  assert.equal(linkValue({ url: "https://a.com", title: "" }).refused, "title");
  assert.equal(linkValue({ url: "https://a.com", title: "x".repeat(201) }).refused, "title");
  assert.equal(linkValue({ url: "https://a.com", title: "a", icon: "assets/x.png" }).refused, "icon", "a link keeps no picture");
  assert.deepEqual(linkValue({ url: "https://a.com", title: "a", icon: "/icons/airplane_blue.svg" }).value.icon, "/icons/airplane_blue.svg");
  assert.equal(readLinkText('{"url":"javascript:x","title":"a"}'), null, "a file written by hand wrong is no link");
  // The site's icon: a base64 data: address of an icon's type, 16 KB at most; one that is none left out, never refused.
  const png = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]).toString("base64")}`;
  assert.ok(isSiteIcon(png) && isSiteIcon("data:image/svg+xml;base64,PHN2Zy8+") && isSiteIcon("data:image/x-icon;base64,AAABAA=="));
  assert.ok(!isSiteIcon("data:text/html;base64,PHA+") && !isSiteIcon("https://a.com/favicon.ico") && !isSiteIcon("data:image/png,raw"), "no other type, no address, no unencoded data");
  assert.ok(!isSiteIcon(`data:image/png;base64,${Buffer.alloc(SITE_ICON_BYTES + 1).toString("base64")}`) && isSiteIcon(`data:image/png;base64,${Buffer.alloc(SITE_ICON_BYTES).toString("base64")}`), "16 KB at most");
  assert.deepEqual(linkValue({ url: "https://a.com", title: "a", siteIcon: png }).value, { url: "https://a.com/", title: "a", siteIcon: png });
  assert.deepEqual(linkValue({ url: "https://a.com", title: "a", siteIcon: "data:text/html;base64,PHA+" }).value, { url: "https://a.com/", title: "a" }, "a site icon that is none: left out");
  assert.deepEqual(readLinkText(JSON.stringify({ url: "https://a.com", title: "a", siteIcon: png })), { url: "https://a.com/", title: "a", siteIcon: png });
  assert.deepEqual(readLinkText('\uFEFF{"url":"https://a.com","title":"a","icon":"nope"}'), { url: "https://a.com/", title: "a" }, "an icon it does not take passed over");
  assert.ok(ownAddress("http://127.0.0.1:4317/#x", 4317) && ownAddress("http://localhost:4317/", "4317") && ownAddress("http://[::1]:4317/", 4317));
  assert.ok(!ownAddress("http://127.0.0.1:4318/", 4317), "another port is another origin");
  assert.ok(!ownAddress("https://example.com/", 443) && !ownAddress("not a url", 1));
  assert.equal(kebab("Open-Meteo API Docs"), "open-meteo-api-docs");
  assert.equal(linkStem("天气接口文档", "https://www.open-meteo.com/en"), "open-meteo", "no Latin words: the site's name");
  assert.equal(linkStem("天气", "http://127.0.0.1:9/"), "link");
  assert.equal(linkStem("Example Docs", "https://x.com"), "example-docs");
}

// ---------- the site's icon, fetched (src/editor/unfurl.mjs siteIcon) ----------
{
  const pngBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const site = http.createServer((request, response) => {
    if (request.url === "/page") return response.writeHead(200, { "Content-Type": "text/html" }), response.end('<!doctype html><html><head><title>t</title><link rel="icon" href="/own.png"></head><body></body></html>');
    if (request.url === "/own.png") return response.writeHead(200, { "Content-Type": "application/octet-stream" }), response.end(pngBytes);
    if (request.url === "/plain") return response.writeHead(200, { "Content-Type": "text/html" }), response.end("<!doctype html><title>p</title>");
    if (request.url === "/favicon.ico") return response.writeHead(200, { "Content-Type": "image/x-icon" }), response.end(Buffer.from([0, 0, 1, 0, 1, 0]));
    if (request.url === "/big") return response.writeHead(200, { "Content-Type": "text/html" }), response.end('<link rel="icon" href="/huge.png">');
    if (request.url === "/huge.png") return response.writeHead(200, { "Content-Type": "image/png" }), response.end(Buffer.alloc(SITE_ICON_BYTES + 10));
    response.writeHead(404);
    response.end();
  });
  await new Promise((resolve) => site.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${site.address().port}`;
  try {
    assert.equal(await siteIcon(`${base}/page`), `data:image/png;base64,${pngBytes.toString("base64")}`, "the page's <link rel=icon>, its type read from its bytes");
    assert.equal(await siteIcon(`${base}/plain`), "data:image/x-icon;base64,AAABAAEA", "none in the page: /favicon.ico");
    assert.equal(await siteIcon(`${base}/big`), "data:image/x-icon;base64,AAABAAEA", "one over 16 KB: /favicon.ico in its place");
    assert.equal(await siteIcon("https://example.com/", { env: { GALLERY_SITE_ICON: "local" } }), null, "the tests' switch: no real site asked");
    assert.equal(await siteIcon(`${base}/page`, { env: { GALLERY_SITE_ICON: "off" } }), null);
    assert.equal(await siteIcon("http://127.0.0.1:9/nothing", { timeout: 1500 }), null, "nothing there: none, never a failure");
  } finally {
    site.close();
  }
}

// ---------- the service ----------
const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-links-"));
const savedHome = process.env.GALLERY_DEFAULT_WORKSPACE;
process.env.GALLERY_DEFAULT_WORKSPACE = root;
const doc = async (slug, title) => {
  await fs.mkdir(path.join(root, slug));
  await fs.writeFile(path.join(root, slug, "doc.html"), `<!doctype html><html><head><title>${title}</title></head><body><main class="doc-page" data-doc-id="${slug}"><header><h1 class="doc-title">${title}</h1></header><p>正文里有天气两个字。</p></main></body></html>`);
  await fs.writeFile(path.join(root, slug, "doc.json"), `${JSON.stringify({ title, description: "说明" })}\n`);
};
await doc("alpha", "甲");
await doc("beta", "乙");
const asked = [];
let told = 0;
const ICON = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";
const until = async (test, timeout = 3000) => {
  for (const end = Date.now() + timeout; Date.now() < end; await new Promise((resolve) => setTimeout(resolve, 30))) if (await test()) return true;
  return false;
};
const edits = createEditService({ reportsDirectory: root });
const service = createWorkspaceService({
  edits,
  reportsDirectory: root,
  changed: () => { told += 1; },
  reports: { create: async () => {}, words: (html) => html, export: async () => ({ problems: [] }) },
  web: {
    frameable: async (url) => { asked.push(url); return url.includes("auth") ? { frameable: true, reason: "auth" } : url.includes("refuse") ? { frameable: false, reason: "x-frame-options" } : { frameable: true }; },
    title: async (url) => (url.includes("private") ? { title: "", reason: "auth" } : url.includes("titled") ? "读到的标题" : ""),
    icon: async (url) => (url.includes("noicon") ? null : ICON),
  },
});
const server = http.createServer((request, response) => {
  const name = request.url.match(/^\/__gallery\/workspace\/([a-z-]+)(?:\?|$)/)?.[1];
  return name ? service.handle(request, response, name) : (response.statusCode = 404, response.end());
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const port = server.address().port;
const host = `127.0.0.1:${port}`;
const get = async (name) => {
  const response = await fetch(`http://${host}/__gallery/workspace/${name}`);
  return { status: response.status, body: await response.json() };
};
const post = async (name, body = {}) => {
  const response = await fetch(`http://${host}/__gallery/workspace/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": edits.token },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
const outlineNow = async () => (await get("outline")).body.outline;
const file = async () => JSON.parse(await fs.readFile(path.join(root, ".gallery", "outline.json"), "utf8"));
const run = promisify(execFile);
const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
const quiet = { GALLERY_NO_PREVIEW: "1", GALLERY_NO_BROWSER: "1", GALLERY_NO_UPDATE_CHECK: "1", GALLERY_CACHE_DIR: path.join(root, "..", "cache-links"), CLAUDE_CONFIG_DIR: path.join(root, "..", "agents-links", "claude"), CODEX_HOME: path.join(root, "..", "agents-links", "codex") };
const gallery = async (workspace, args) => {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, "--workspace", workspace, ...args], { env: { ...process.env, ...quiet, GALLERY_DEFAULT_WORKSPACE: workspace } });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
const lines = (text) => text.trimEnd().split(/\r?\n/);

try {
  // A first link with no place: first in the own column, no column of links made (2026-11-09); the site's icon fetched after
  // the answer (the add never waits for it) and kept in link.json, the outline listing it.
  const first = await post("link", { url: "https://open-meteo.com/en/docs", title: "天气接口文档", icon: "🌤️" });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(first.body.link, { slug: "open-meteo", title: "天气接口文档", description: "", kind: "link", url: "https://open-meteo.com/en/docs", icon: "🌤️" });
  assert.deepEqual([first.body.parent, first.body.index], ["", 0]);
  const kept = async (slug) => JSON.parse(await fs.readFile(path.join(root, slug, "link.json"), "utf8"));
  assert.ok(await until(async () => (await kept("open-meteo")).siteIcon === ICON), "the site's icon kept once fetched");
  assert.deepEqual(await kept("open-meteo"), { url: "https://open-meteo.com/en/docs", title: "天气接口文档", icon: "🌤️", siteIcon: ICON });
  let now = await outlineNow();
  assert.deepEqual(now.groups, [{ id: "docs" }]);
  assert.deepEqual(now.children, { "": ["open-meteo", "alpha", "beta"] });
  assert.deepEqual(now.links, ["open-meteo"]);
  const listed = (await get("outline")).body.reports;
  assert.equal(listed["open-meteo"].kind, "link");
  assert.equal(listed["open-meteo"].siteIcon, ICON, "listed with the site's icon");
  assert.equal(listed.alpha.kind, undefined, "a document has no kind");
  assert.deepEqual(await file(), { version: 2, children: { "": ["open-meteo", "alpha", "beta"] }, groups: [{ id: "docs" }] });
  assert.ok(told >= 1, "told");

  // One under a document, after one, first; places that are not there refused, nothing made.
  assert.equal((await post("link", { url: "https://example.com/titled", title: "Example Docs", parent: "alpha" })).body.link.slug, "example-docs");
  assert.deepEqual((await post("link", { url: "https://example.com/b", title: "Second", after: "example-docs" })).body.parent, "alpha");
  assert.deepEqual((await post("link", { url: "https://example.com/c", title: "Top", parent: "", first: true })).body.index, 0);
  for (const [body, status, reason] of [
    [{ url: "https://x.com", title: "a", parent: "nope" }, 404, "parent"],
    [{ url: "https://x.com", title: "a", parent: ":g-none" }, 404, "parent"],
    [{ url: "https://x.com", title: "a", after: "nope" }, 404, "after"],
    [{ url: "https://x.com", title: "a", parent: "", after: "example-docs" }, 409, "level"],
    [{ url: "javascript:alert(1)", title: "a" }, 400, "scheme"],
    [{ url: "https://x.com", title: "" }, 400, "title"],
    [{ url: `http://127.0.0.1:${port}/#alpha`, title: "自己" }, 409, "own"],
    [{ url: `http://localhost:${port}/`, title: "自己" }, 409, "own"],
  ]) {
    const answer = await post("link", body);
    assert.deepEqual([answer.status, answer.body.reason], [status, reason], JSON.stringify(body));
  }
  assert.deepEqual(await listLinkSlugs(root), ["example-docs", "open-meteo", "second", "top"], "nothing made by a refusal");
  now = await outlineNow();
  assert.deepEqual(now.children, { "": ["top", "open-meteo", "alpha", "beta"], alpha: ["example-docs", "second"] });

  // link-set: the address (its site's icon dropped, the new site's fetched), the name, the icon (null: none); this Gallery's own address refused.
  assert.deepEqual((await post("link-set", { slug: "open-meteo", title: "天气", icon: null })).body.link, { slug: "open-meteo", title: "天气", description: "", kind: "link", url: "https://open-meteo.com/en/docs", siteIcon: ICON });
  assert.equal((await post("link-set", { slug: "open-meteo", url: "https://noicon.example/" })).body.link.siteIcon, undefined, "another address: the old site's icon dropped");
  await new Promise((resolve) => setTimeout(resolve, 200));
  assert.equal((await kept("open-meteo")).siteIcon, undefined, "and none had for a site that gives none");
  assert.equal((await post("link-set", { slug: "open-meteo", url: "open-meteo.com/en/forecast" })).body.link.url, "https://open-meteo.com/en/forecast");
  assert.ok(await until(async () => (await kept("open-meteo")).siteIcon === ICON), "the new site's icon fetched");
  assert.equal((await post("link-set", { slug: "open-meteo", url: `http://127.0.0.1:${port}/` })).body.reason, "own");
  assert.equal((await post("link-set", { slug: "alpha", title: "x" })).status, 404, "a document is no link");

  // Columns from the workbench: made, renamed, ordered (an older Gallery's column of the links, role links, read as it was);
  // a version 1 tree (a test's, an older workbench's) keeps the other columns.
  const team = { id: "g-team", title: "团队" };
  const linksColumn = { id: "g-l", role: "links" };
  const columns = [linksColumn, { id: "docs" }, team];
  const moved = { "": ["alpha", "beta"], alpha: ["example-docs", "second"], ":g-l": ["open-meteo"], ":g-team": ["top"] };
  const base = { groups: now.groups, children: now.children };
  assert.equal((await post("outline", { outline: { groups: columns, children: moved }, base })).status, 200);
  assert.deepEqual((await outlineNow()).groups, columns.map(group => group.id === "docs" ? group : { ...group, owner: workspaceId(root) }));
  assert.equal((await post("outline", { outline: { groups: columns, children: moved }, base })).body.reason, "stale", "the base is the outline as it was");
  assert.equal((await post("outline", { outline: { groups: [{ id: "g-1" }], children: {} } })).status, 400, "the own column is never removed");
  assert.equal((await post("outline", { outline: { children: { "": ["beta", "alpha", "top"], alpha: ["example-docs", "second"] } } })).status, 200);
  now = await outlineNow();
  assert.deepEqual(now.children, { "": ["beta", "alpha", "top"], alpha: ["example-docs", "second"], ":g-l": ["open-meteo"], ":g-team": [] }, "version 1: the own column's tree replaced, the others keep theirs but what it took");
  // A column removed (the workbench sends the tree without it): its entries come back last in the own column as it is read; no file touched.
  await post("outline", { outline: { groups: [{ id: "docs" }, team], children: { "": ["beta", "alpha", "top"], alpha: ["example-docs", "second"] } } });
  now = await outlineNow();
  assert.deepEqual([now.groups.map(({ id }) => id), now.children[""]], [["docs", "g-team"], ["beta", "alpha", "top", "open-meteo"]], "the link with no column of links: last in the own column");
  assert.ok((await listLinkSlugs(root)).includes("open-meteo"));
  // A link with no place goes first in the own column, whatever was before: no column of the links made.
  const later = await post("link", { url: "https://example.com/noicon-later", title: "Later" });
  assert.deepEqual([later.body.parent, later.body.index, later.body.outline.groups.map(({ id }) => id), later.body.outline.children[""][0]], ["", 0, ["docs", "g-team"], "later"], "first in the own column, no column made");
  assert.equal((await post("trash", { slug: "later", kind: "link" })).body.entry.parent, "", "(out of the way again)");
  await post("destroy", { id: (await listTrash(root)).find(({ slug }) => slug === "later").id });

  // Search: documents' text alone, links passed over.
  const search = await get(`search?q=${encodeURIComponent("天气")}`);
  assert.deepEqual(search.body.results.map(({ slug }) => slug).sort(), ["alpha", "beta"], "a link's name is the workbench's to match, its text none");

  // Trash and restore of kind link: its place kept, back where it was; under a free slug when taken meanwhile.
  const trashed = await post("trash", { slug: "second", kind: "link" });
  assert.deepEqual([trashed.status, trashed.body.entry.kind, trashed.body.entry.parent, trashed.body.entry.index, trashed.body.entry.title], [200, "link", "alpha", 1, "Second"]);
  assert.equal(await fs.access(path.join(root, "second")).then(() => true, () => false), false);
  assert.ok(await fs.access(path.join(root, ".gallery", "trash", trashed.body.entry.id, "link", "link.json")).then(() => true, () => false));
  assert.equal((await listTrash(root))[0].kind, "link");
  assert.equal((await post("trash", { slug: "alpha", kind: "link" })).status, 404, "a document is no link to trash");
  const back = await post("restore", { id: trashed.body.entry.id });
  assert.deepEqual([back.status, back.body.report.kind, back.body.entry.kind], [200, "link", "link"]);
  assert.deepEqual((await outlineNow()).children.alpha, ["example-docs", "second"], "back where it was");
  const again = await post("trash", { slug: "second", kind: "link" });
  await doc("second", "占了名字的文档");
  const freed = await post("restore", { id: again.body.entry.id });
  assert.equal(freed.body.report.slug, "second-2", "a slug taken meanwhile: the next free one");
  const gone = await post("trash", { slug: "second-2", kind: "link" });
  assert.equal((await post("destroy", { id: gone.body.entry.id })).status, 200);
  assert.equal((await listTrash(root)).length, 0);
  // Deleted for good: a document's entry, one from before kinds (0.1's, no kind) too, forgets the Agent-change review kept under its slug; a link's has none to forget.
  const forgot = [];
  const plain = createWorkspaceService({ edits: { forgetChanges: (slug) => { forgot.push(slug); } }, reports: {}, reportsDirectory: root });
  for (const [id, entry] of [["old-1", { slug: "old-notes", title: "旧笔记" }], ["old-2", { kind: "link", slug: "old-site", title: "旧网页" }], ["old-3", { kind: "document", slug: "new-notes", title: "新笔记" }]]) {
    await fs.mkdir(path.join(root, ".gallery", "trash", id, "report"), { recursive: true });
    await fs.writeFile(path.join(root, ".gallery", "trash", id, "entry.json"), JSON.stringify({ id, ...entry, at: 1, parent: "", index: 0 }));
    assert.equal((await plain.run("destroy", { id }))[0], 200);
  }
  assert.deepEqual(forgot, ["old-notes", "new-notes"], "an entry with no kind is a document's");
  assert.equal((await listTrash(root)).length, 0);

  // What the add and the view ask of the web: outside the queue, an hour kept, this Gallery's own address said refused.
  assert.deepEqual((await post("frameable", { url: "https://refuse.example/" })).body, { ok: true, frameable: false, reason: "x-frame-options" });
  await post("frameable", { url: "https://refuse.example/" });
  assert.equal(asked.filter((url) => url === "https://refuse.example/").length, 1, "asked once: kept");
  await post("frameable", { url: "https://www.yuque.com/person/book/doc?key=abc#part" });
  assert.ok(asked.includes("https://www.yuque.com/person/book/doc?key=abc#part"), "check the original URL without switching the page to an embed view");
  await post("frameable", { url: "https://auth.example/" });
  await post("frameable", { url: "https://auth.example/" });
  assert.equal(asked.filter(url => url === "https://auth.example/").length, 2, "anonymous login responses are not cached for an hour");
  assert.deepEqual((await post("frameable", { url: `http://127.0.0.1:${port}/` })).body, { ok: true, frameable: false, reason: "own" });
  assert.equal((await post("frameable", { url: "file:///x" })).status, 400);
  assert.deepEqual((await post("title", { url: "https://example.com/titled" })).body, { ok: true, title: "读到的标题" });
  assert.deepEqual((await post("title", { url: "https://example.com/plain" })).body, { ok: true, title: "" });
  assert.deepEqual((await post("title", { url: "https://example.com/private" })).body, { ok: true, title: "", reason: "auth" });

  // The outline as written read again from disk, as a command reads it.
  assert.deepEqual((await readOutline(root)).groups.map(({ id }) => id), ["docs", "g-team"]);

  // ---------- gallery link and gallery list, no server ----------
  const ws = path.join(root, "..", `links-cli-${path.basename(root)}`);
  for (const [slug, title] of [["project", "项目"], ["notes", "笔记"]]) assert.equal((await gallery(ws, ["new", slug, title])).code, 0);
  const added = await gallery(ws, ["link", "add", "https://open-meteo.com/en/docs", "天气接口文档", "--icon", "🌤️"]);
  assert.equal(added.code, 0, added.stderr);
  assert.deepEqual(lines(added.stdout).slice(0, 3), ["Added the web link open-meteo (天气接口文档): https://open-meteo.com/en/docs", "Placed it at the top level, first.", "位置：顶层"]);
  const under = await gallery(ws, ["link", "add", "example.com/guide", "Example Guide", "--under", "project"]);
  assert.deepEqual(lines(under.stdout).slice(0, 3), ["Added the web link example-guide (Example Guide): https://example.com/guide", "Placed it under project (项目), the only entry there.", "位置：project (项目)"]);
  const own = "默认文档"; // the own column's name: the workspace's folder (it is not the default workspace)
  assert.equal(lines((await gallery(ws, ["link", "add", "https://a.example/", "第三个", "--column", own])).stdout)[1], "Placed it at the top level, first.", "--column names a column as the sidebar calls it: first in it");
  for (const [args, code, said] of [
    [["add", "javascript:alert(1)", "x"], 2, "Not an address a web link takes: javascript:alert(1) (http or https only)."],
    [["add", "https://a.com", "x", "--column", "没有的栏"], 1, `No column "没有的栏" in the sidebar (${own}): nothing added.`],
    [["add", "https://a.com", "x", "--column", "docs", "--under", "project"], 2, "--column and --under are two places: give one."],
    [["set", "project", "--title", "x"], 1, "project (项目) is a document, not a web link: gallery set changes a document."],
    [["set", "open-meteo"], 2, 'Say what to set: --url <address>, --title "<name>", --icon <emoji|none>.'],
    [["remove", "nothing"], 1, 'No web link "nothing": gallery list --tree shows the sidebar\'s entries.'],
    [["move", "x"], 2, "No such action: link move (add, set, remove)."],
  ]) {
    const refused = await gallery(ws, ["link", ...args]);
    assert.deepEqual([refused.code, lines(refused.stderr)[0]], [code, said], args.join(" "));
  }
  const tree = lines((await gallery(ws, ["list", "--tree"])).stdout).slice(3).map((line) => line.replace(/（说明：.*）$/, ""));
  assert.deepEqual(tree, [
    "2 documents and 3 web links, as the sidebar shows them (one under another indented):",
    "link  第三个  （网页链接：https://a.example/）",
    "open-meteo  🌤️ 天气接口文档  （网页链接：https://open-meteo.com/en/docs）",
    "notes  笔记  ",
    "project  项目  ",
    "  example-guide  Example Guide  （网页链接：https://example.com/guide）",
  ]);
  const set = await gallery(ws, ["link", "set", "open-meteo", "--title", "天气", "--url", "https://open-meteo.com/en/forecast", "--icon", "none"]);
  assert.deepEqual(lines(set.stdout), ["Set the web link open-meteo:", '  title: "天气接口文档" → "天气"', "  url: https://open-meteo.com/en/docs → https://open-meteo.com/en/forecast", '  icon: "🌤️" → none']);
  const found = lines((await gallery(ws, ["list", "天气"])).stdout).slice(3);
  assert.deepEqual(found, ["1 of 3 web links in the sidebar:", "open-meteo  天气", "  网页链接：https://open-meteo.com/en/forecast"]);
  const removed = await gallery(ws, ["link", "remove", "example-guide"]);
  assert.equal(lines(removed.stdout)[0], "Moved the web link example-guide (Example Guide) to the trash: the workbench's 设置 › 回收区 restores it where it was.");
  assert.equal((await listTrash(ws))[0].kind, "link");
  const written = JSON.parse(await fs.readFile(path.join(ws, ".gallery", "outline.json"), "utf8"));
  assert.deepEqual(written.children, { "": ["link", "open-meteo", "notes", "project"] }, "the own column's tree where version 1 had the whole tree");
  assert.equal(written.version, 2);
} finally {
  server.close();
  await fs.rm(root, { recursive: true, force: true });
  await fs.rm(path.join(root, "..", `links-cli-${path.basename(root)}`), { recursive: true, force: true });
}

// A version 1 file written by an older Gallery after this one wrote version 2: read as 文档 alone, the links last in 文档.
{
  const ws = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-links-old-"));
  process.env.GALLERY_DEFAULT_WORKSPACE = ws;
  try {
    for (const slug of ["a", "b"]) {
      await fs.mkdir(path.join(ws, slug));
      await fs.writeFile(path.join(ws, slug, "doc.html"), "<!doctype html><main></main>");
    }
    await fs.mkdir(path.join(ws, "w"));
    await fs.writeFile(path.join(ws, "w", "link.json"), JSON.stringify({ url: "https://w.example/", title: "W" }));
    await writeOutline(ws, { groups: [{ id: "docs" }, { id: "g-l", role: "links" }], children: { "": ["b", "a"], ":g-l": ["w"] } });
    assert.deepEqual((await readOutline(ws)).children, { "": ["b", "a"], ":g-l": ["w"] });
    await fs.writeFile(path.join(ws, ".gallery", "outline.json"), JSON.stringify({ version: 1, children: { "": ["a", "b"] } }));
    const read = await readOutline(ws);
    assert.deepEqual([read.groups, read.children], [[{ id: "docs" }], { "": ["a", "b", "w"] }]);
  } finally {
  process.env.GALLERY_DEFAULT_WORKSPACE = savedHome;
    await fs.rm(ws, { recursive: true, force: true });
  }
}

console.log("Checked the sidebar's columns and web links: the outline of version 2 (the own column's tree where version 1 had it, an older Gallery's file read as that alone), columns made, renamed, ordered and removed, entries moved across them, links made where they are asked for (first in the own column with none given; no column of the links made), their file checked (http or https, never this Gallery's address, the site's icon a data: address of 16 KB at most), the site's icon fetched (the page's, else /favicon.ico) and kept, dropped with another address, changed, trashed and restored where they were, passed over by the text search, the frame check kept, and gallery link add/set/remove with gallery list and list --tree.");
