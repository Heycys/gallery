import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createEditService } from "../../src/editor/service.mjs";
import { DOC_SLUG, pageId, pageLink } from "../../src/shared/page-links.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { documentLinks } from "../../src/shared/reports.mjs";
import { documentFiles } from "../../src/shared/workspace.mjs";
import { createPage, isBlankPage } from "../../src/shared/pages.mjs";
import { createReportFromStarter } from "../../src/render/reports.mjs";
import { createWorkspaceService } from "../../src/workbench/service.mjs";
import { inLanguage, told } from "../../src/shared/i18n/index.mjs";
import { countWords } from "../../src/shared/words.mjs";
import { findIn, reportLines } from "../../src/shared/search.mjs";
import { drawPageChips } from "../../src/render/page-chips.mjs";
import { oldNames } from "./fixtures/old-names.mjs";

// The workbench's report commands (/__gallery/workspace/*, docs/workbench.md): the same request checks as a
// save, the outline kept apart from report content, and reports moved to the trash and back.

const reportHtml = (slug, title) => `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${title}</title></head><body>
<main class="doc-page" data-doc-id="${slug}">
  <header class="doc-hero"><h1 class="doc-title">${title}</h1></header>
  <p>正文。</p>
</main>
</body></html>
`;
const reportJson = (title) => `${JSON.stringify({ title, description: "说明", type: "note", source: "test" }, null, 2)}\n`;

const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-workspace-"));
const savedHome = process.env.GALLERY_DEFAULT_WORKSPACE;
process.env.GALLERY_DEFAULT_WORKSPACE = root;
const write = async (slug, title) => {
  await fs.mkdir(path.join(root, slug));
  await fs.writeFile(path.join(root, slug, "report.html"), reportHtml(slug, title));
  await fs.writeFile(path.join(root, slug, "report.json"), reportJson(title));
};
await write("alpha", "甲报告");
await write("beta", "乙报告");
const read = (...parts) => fs.readFile(path.join(root, ...parts), "utf8");
const exists = (...parts) => fs.access(path.join(root, ...parts)).then(() => true, () => false);

const exported = [];
let docA = null; // the first and the second document the workbench makes (doc-<id>: named when made)
let docB = null;
let outlineTold = 0; // the outline written, as the server tells its workbench
const edits = createEditService({ reportsDirectory: root });
const workspace = createWorkspaceService({
  edits,
  reportsDirectory: root,
  changed: () => { outlineTold += 1; },
  reports: {
    create: (slug, title, description, { lang = null, page = false } = {}) => createReportFromStarter(slug, title, description, { directory: root, blank: true, lang, page }),
    words: (html, slug) => drawPageChips(html, { slug, mode: "words", reportsDirectory: root }),
    export: async (slug) => {
      exported.push(slug);
      // The hand-in refused (an Agent writing the file): its own message, no check failed.
      if (slug === docB) return { problems: [], refused: { reason: "busy", message: "文件一再被修改（例如 Agent 正在写入），没有写入" }, file: path.join(projectRoot, "exports", `${slug}.html`) };
      return { problems: { beta: ["one", "two", "three", "four"], [docA]: ["one"] }[slug] ?? [], file: path.join(projectRoot, "exports", `${slug}.html`) };
    },
  },
});
const server = http.createServer((request, response) => {
  const name = request.url.match(/^\/__gallery\/workspace\/([a-z-]+)(?:\?|$)/)?.[1];
  return name ? workspace.handle(request, response, name) : (response.statusCode = 404, response.end());
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const host = `127.0.0.1:${server.address().port}`;
const get = async (name, headers = {}) => {
  const response = await fetch(`http://${host}/__gallery/workspace/${name}`, { headers });
  return { status: response.status, body: await response.json() };
};
const post = async (name, body = {}, headers = {}) => {
  const response = await fetch(`http://${host}/__gallery/workspace/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": edits.token, ...headers },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
const outline = async () => (await get("outline")).body.outline.children;

try {
  // What a workbench starts from; nothing without this server's Host, token and Origin.
  const info = await get("info");
  assert.equal(info.status, 200);
  assert.equal(info.body.version, 1);
  assert.equal(info.body.token, edits.token);
  assert.deepEqual(info.body.commands, ["preference-edit", "extension-edit", "outline", "move", "create", "instructions", "components", "duplicate", "copy-from", "look", "looks", "head", "new-page", "rename", "icon", "favorite", "trash", "restore", "destroy", "link", "link-set", "draft-add", "export"]);
  // Which server this is, as its announcement says it (gallery open holds the two together), and its
  // kind: npm run dev's unless it is told it is a command's (whose POST stop then stops it).
  assert.deepEqual(info.body.server, { pid: process.pid, home: path.resolve(root), data: process.env.GALLERY_DATA_DIR, version: null, kind: "dev" });
  assert.equal(info.body.gallery, null, "no version told: a service made without one");
  assert.equal(info.body.studio, undefined);
  const rebound = await new Promise((resolve, reject) => http.get({ host: "127.0.0.1", port: server.address().port, path: "/__gallery/workspace/info", headers: { Host: "evil.example" } }, (response) => {
    response.resume();
    resolve(response.statusCode);
  }).on("error", reject));
  assert.equal(rebound, 403, "GETs need this server's Host (DNS rebinding)");
  assert.equal((await post("create", { title: "x" }, { "X-Gallery-Token": "wrong" })).status, 403);
  assert.equal((await post("create", { title: "x" }, { Origin: "http://evil.example" })).status, 403);
  assert.equal((await get("create")).status, 404, "a command is a POST");
  assert.equal((await post("nothing")).status, 404);
  // POST stop: npm run dev's server is stopped where it runs (a command's stops: tests/unit/cli-server.mjs); checked as any change first.
  assert.equal((await post("stop", {}, { "X-Gallery-Token": "wrong" })).status, 403);
  assert.deepEqual([(await post("stop")).status, (await post("stop")).body.reason], [409, "dev"]);
  assert.deepEqual((await fs.readdir(root)).sort(), ["alpha", "beta"], "refused requests change nothing");

  // The outline lists every report once, with no file of its own yet, and what a sidebar shows of each.
  assert.deepEqual(await outline(), { "": ["alpha", "beta"] });
  assert.deepEqual((await get("outline")).body.reports.beta, { slug: "beta", title: "乙报告", description: "说明", type: "note" });
  assert.deepEqual((await get("outline")).body.trash, [], "the trash, nothing yet");

  // A report's menu says when it was last written and how many words it holds (shared/words.mjs).
  const stats = await get("stats?slug=alpha");
  assert.equal(stats.status, 200);
  assert.equal(stats.body.words, 2, "正文 is two words; the header (the title) is not the body");
  assert.ok(Math.abs(stats.body.edited - (await fs.stat(path.join(root, "alpha", "report.html"))).mtimeMs) < 2, "edited: report.html's time");
  assert.equal((await get("stats?slug=nothing")).status, 404);
  assert.equal((await get("stats?slug=../x")).status, 404);
  // 复制底稿路径: the report's report.html as this computer writes a path (backslashes on Windows).
  assert.deepEqual((await get("source?slug=alpha")).body, { ok: true, path: path.resolve(root, "alpha", "report.html") });
  assert.ok(path.sep !== "\\" || (await get("source?slug=alpha")).body.path.includes("\\"), "a Windows path");
  for (const slug of ["nothing", "../x", ""]) assert.equal((await get(`source?slug=${encodeURIComponent(slug)}`)).status, 404, slug);
  assert.equal(countWords(String.raw`<main><p>一段 <strong>粗</strong> text here, it&#39;s 3.5% <span class="doc-math-inline">\(x^2\)</span></p><div><script type="application/json">{"a": "不算"}</script></div></main>`), 8,
    "each Chinese character a word, each run of other letters or digits one, a formula one, no script");

  // 搜索文档: the reports whose title or text holds the words, each with its snippets (shared/search.mjs).
  const searched = (await get(`search?q=${encodeURIComponent(" 正文 ")}`)).body.results;
  assert.deepEqual(searched.map((result) => [result.slug, result.title, result.count]), [["alpha", false, 1], ["beta", false, 1]]);
  assert.deepEqual(searched[0].hits, [{ text: "正文。", start: 0, end: 2, before: "", index: 0 }]);
  assert.deepEqual((await get(`search?q=${encodeURIComponent("乙")}`)).body.results.map((result) => [result.slug, result.title, result.count]), [["beta", true, 0]], "the title alone");
  assert.deepEqual((await get("search?q=%20")).body.results, []);
  assert.deepEqual(reportLines(String.raw`<main><header><h1>标题</h1></header><p>一段 <strong>粗</strong>&nbsp;text</p><ul><li>甲\(x^2\)</li><li>乙</li></ul><script>var a = "不算";</script><svg><text>图</text></svg></main>`), ["一段 粗 text", "甲 x^2", "乙"],
    "a line a block, the header, scripts and drawings left out, a formula its TeX");
  assert.deepEqual(findIn(["Alpha beta ALPHA", "gamma", "alpha"], "ALPHA", { most: 2 }), { count: 3, hits: [
    { text: "Alpha beta ALPHA", start: 0, end: 5, before: "", index: 0 },
    { text: "alpha", start: 0, end: 5, before: "", index: 2 },
  ] }, "case alike, every time counted, a hit a line");
  const long = `${"一".repeat(30)}目标${"二".repeat(100)}`;
  assert.deepEqual(findIn([long], "目标").hits[0], { text: `…${long.slice(14, 104)}…`, start: 17, end: 19, before: "一".repeat(16), index: 0 }, "a long line cut around the words");

  // New reports come from the starter, in a folder named doc-<its page id>, last at the top.
  const created = await post("create", { title: "新的 <报告>" });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  docA = created.body.report.slug;
  assert.match(docA, DOC_SLUG, "the folder is doc- and the eight of the page id");
  assert.equal(pageId(docA), docA.slice(4), "its page id is those eight");
  assert.equal(pageLink({ slug: docA, title: "新的 <报告>" }), `新的-报告-${docA.slice(4)}`, "and its address ends with them");
  assert.deepEqual(created.body.report, { slug: docA, title: "新的 <报告>", description: "新文档", type: created.body.report.type });
  assert.ok((await read(docA, "doc.html")).includes(`data-doc-id="${docA}"`));
  assert.ok(!(await read(docA, "doc.html")).includes("data-doc-placeholder") && /<\/header>\n\n {4}<p><\/p>\n {2}<\/main>/.test(await read(docA, "doc.html")) && !(await read(docA, "doc.html")).includes("<section"),
    "a report made in the workbench starts clean and flat: an empty paragraph in the page, not the starter's section for an Agent");
  assert.equal(JSON.parse(await read(docA, "doc.json")).source, undefined, "doc.json names no source until someone does");
  const madeAt = Date.parse(JSON.parse(await read(docA, "doc.json")).created);
  assert.ok(Math.abs(Date.now() - madeAt) < 60_000, "doc.json's created: when Gallery made it (what a block reads of when a document was made)");
  {
    // gallery new (an Agent's) still gets the starter's section to replace.
    const agent = await fs.mkdtemp(path.join(os.tmpdir(), "report-starter-"));
    await createReportFromStarter("draft", "草稿", "说明", { directory: agent });
    assert.ok((await fs.readFile(path.join(agent, "draft", "doc.html"), "utf8")).includes("data-doc-placeholder"));
    await fs.rm(agent, { recursive: true, force: true });
  }
  assert.ok((await read(docA, "doc.html")).includes("新的 &lt;报告&gt;"), "the title is escaped into the starter");
  assert.equal(JSON.parse(await read(docA, "doc.json")).title, "新的 <报告>");
  docB = (await post("create", { title: "  " })).body.report.slug;
  assert.ok(DOC_SLUG.test(docB) && docB !== docA, "each new document has an id of its own");
  // No title (the workbench's 新建): an untitled document, its title empty everywhere, the page saying 未命名文档.
  assert.equal(JSON.parse(await read(docB, "doc.json")).title, "");
  assert.ok(/<title><\/title>/.test(await read(docB, "doc.html")) && /<h1 class="doc-title"><\/h1>/.test(await read(docB, "doc.html")), "its h1 and <title> empty");
  assert.deepEqual(await outline(), { "": ["alpha", "beta", docA, docB] });

  // The outline: hierarchy and order only, validated, kept in the workspace's .gallery/outline.json.
  const arranged = { "": ["beta", "alpha"], alpha: [docA, docB] };
  assert.equal((await post("outline", { outline: { children: arranged } })).status, 200);
  assert.deepEqual(await outline(), arranged);
  assert.deepEqual(JSON.parse(await read(".gallery", "outline.json")), { version: 2, children: arranged, groups: [{ id: "docs" }] }, "version 2: the 文档 column's tree where version 1 had the whole tree");
  for (const children of [{ "": ["beta", "beta"] }, { "": ["alpha"], alpha: ["alpha"] }, { "": "alpha" }, { "": ["../x"] }, null]) {
    assert.equal((await post("outline", { outline: { children } })).status, 400, `refused: ${JSON.stringify(children)}`);
  }
  assert.deepEqual(await outline(), arranged, "a refused outline is not stored");
  await write("gamma", "丙报告");
  assert.deepEqual((await outline())[""], ["beta", "alpha", "gamma"], "a report it does not know yet comes last at the top");

  // With `base`, the outline the workbench changed (workspace/store.ts): written while the outline
  // still reads as it (an empty list as none), else 409 stale and nothing written: here the workbench
  // read it before gamma was made, and its whole tree would have left gamma at the top, where a
  // command may have put it elsewhere meanwhile.
  {
    const now = await outline();
    const told = outlineTold;
    const swapped = { "": ["alpha", "beta", "gamma"], alpha: [docA, docB] };
    const stale = await post("outline", { outline: { children: swapped }, base: { children: arranged } });
    assert.deepEqual([stale.status, stale.body.reason], [409, "stale"]);
    assert.deepEqual([await outline(), outlineTold], [now, told], "a stale tree is not written, nothing told");
    assert.equal((await post("outline", { outline: { children: swapped }, base: { children: { ...now, beta: [] } } })).status, 200, "the base as read now: written");
    assert.deepEqual(await outline(), swapped);
    assert.equal((await post("outline", { outline: { children: swapped }, base: { children: { "": ["beta", "beta"] } } })).status, 400, "a base that is no outline");
    assert.equal((await post("outline", { outline: { children: now }, base: { children: swapped } })).status, 200);
  }

  // POST move (gallery move, and gallery new --under or --after, while a server runs: src/cli/tree.mjs):
  // a document with those under it, under a parent ("" the top; none: where it is, or `after`'s), right
  // after one of that level, first or last; refused for a place under itself or one under it, after
  // itself, an `after` at another level, what the outline holds not, another workspace's command. Every
  // outline written is told (`changed`: the workbench's event stream), a move to where it is writes nothing.
  {
    const before = outlineTold;
    const moved = await post("move", { slug: docA, parent: "beta" });
    assert.deepEqual([moved.status, moved.body.moved, moved.body.parent, moved.body.index, moved.body.from], [200, true, "beta", 0, { parent: "alpha", index: 0 }]);
    assert.deepEqual(await outline(), { "": ["beta", "alpha", "gamma"], alpha: [docB], beta: [docA] });
    assert.deepEqual(moved.body.outline.children, await outline(), "the outline as it is now");
    assert.equal(outlineTold, before + 1, "the outline written is told");
    const there = await post("move", { slug: "alpha", after: "beta" });
    assert.deepEqual([there.status, there.body.moved], [200, false], "there already");
    assert.equal(outlineTold, before + 1, "nothing written, nothing told");
    assert.deepEqual((await post("move", { slug: "gamma", first: true })).body.index, 0);
    assert.deepEqual((await post("move", { slug: "alpha", parent: docA })).body.parent, docA, "with the second under it");
    assert.deepEqual(await outline(), { "": ["gamma", "beta"], beta: [docA], [docA]: ["alpha"], alpha: [docB] });
    assert.deepEqual((await post("move", { slug: docB, parent: "", after: "gamma" })).body.index, 1);
    for (const [body, status, reason] of [
      [{ slug: "beta", parent: "alpha" }, 409, "inside"],
      [{ slug: "beta", parent: "beta" }, 409, "inside"],
      [{ slug: "beta", after: "beta" }, 409, "itself"],
      [{ slug: "beta", parent: docA, after: "gamma" }, 409, "level"],
      [{ slug: "nope", parent: "" }, 404, "missing"],
      [{ slug: "beta", parent: "nope" }, 404, "parent"],
      [{ slug: "beta", after: "nope" }, 404, "after"],
      [{ slug: "../x" }, 400, "body"],
      [{ slug: "beta", first: "yes" }, 400, "body"],
      [{ slug: "beta", parent: "", workspace: os.tmpdir() }, 409, "elsewhere"],
    ]) {
      const answer = await post("move", body);
      assert.deepEqual([answer.status, answer.body.reason], [status, reason], JSON.stringify(body));
    }
    assert.deepEqual(await outline(), { "": ["gamma", docB, "beta"], beta: [docA], [docA]: ["alpha"] }, "a refused move changes nothing");
    assert.equal((await post("outline", { outline: { children: { "": ["beta", "alpha", "gamma"], alpha: [docA, docB] } } })).status, 200);
    assert.equal(outlineTold, before + 5, "and POST outline is told too");
    assert.equal(await exists(".gallery", "outline.lock"), false, "the outline's lock let go");
  }

  // Duplicate: a new document (a new doc-<id>, whatever the original's name), its own data-doc-id, "（副本）" in every title, next to the original.
  const copy = await post("duplicate", { slug: "alpha" });
  assert.equal(copy.status, 200);
  const alphaCopy = copy.body.report.slug;
  assert.match(alphaCopy, DOC_SLUG);
  assert.equal(copy.body.report.title, "甲报告（副本）");
  const copied = await read(alphaCopy, "report.html");
  assert.ok(copied.includes(`data-doc-id="${alphaCopy}"`) && !copied.includes('data-doc-id="alpha"'));
  assert.ok(copied.includes("<title>甲报告（副本）</title>"));
  assert.match(copied, /<h1 class="doc-title"[^>]*>甲报告（副本）<\/h1>/);
  const copyMade = JSON.parse(await read(alphaCopy, "report.json"));
  assert.ok(copyMade.title === "甲报告（副本）" && Math.abs(Date.now() - Date.parse(copyMade.created)) < 60_000, "a copy is a document made now: its own created");
  assert.equal(await read("alpha", "report.html"), reportHtml("alpha", "甲报告"), "the original is untouched");
  assert.deepEqual((await outline())[""], ["beta", "alpha", alphaCopy, "gamma"]);
  const alphaCopy2 = (await post("duplicate", { slug: "alpha" })).body.report.slug;
  assert.ok(DOC_SLUG.test(alphaCopy2) && alphaCopy2 !== alphaCopy, "a second copy is a document of its own too");
  assert.match((await post("duplicate", { slug: alphaCopy })).body.report.slug, DOC_SLUG, "a copy of a doc-<id> one is a new doc-<id>, not that name and -copy");
  assert.equal((await post("duplicate", { slug: "nope" })).status, 404);

  // 字体与布局: the look written into the document's doc.json (report.json in an old one) as `look`, each
  // default left out, unknown values the default, every other field kept in its place; the field gone
  // when all are the default; nothing written when it says the same; the outline lists it.
  const metadataOf = async () => JSON.parse(await read("beta", "report.json"));
  const looked = await post("look", { slug: "beta", look: { font: "serif", size: "large", spacing: "default", width: "huge", other: "x" } });
  assert.equal(looked.status, 200);
  assert.deepEqual(looked.body.report.look, { font: "serif", size: "large" });
  assert.deepEqual(await metadataOf(), { title: "乙报告", description: "说明", type: "note", source: "test", look: { font: "serif", size: "large" } });
  assert.deepEqual((await get("outline")).body.reports.beta.look, { font: "serif", size: "large" });
  const lookedAt = (await fs.stat(path.join(root, "beta", "report.json"))).mtimeMs;
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal((await post("look", { slug: "beta", look: { size: "large", font: "serif" } })).status, 200);
  assert.equal((await fs.stat(path.join(root, "beta", "report.json"))).mtimeMs, lookedAt, "the same look writes nothing");
  assert.equal((await post("look", { slug: "beta", look: "serif" })).status, 400);
  assert.equal((await post("look", { slug: "nope", look: {} })).status, 404);
  // A doc.json that does not read: refused, the file as it was, the message without the workbench's own
  // 字体与布局没有保存： (its toast puts that before whatever the server says).
  const gammaJson = await read("gamma", "report.json");
  await fs.writeFile(path.join(root, "gamma", "report.json"), "{ not json");
  const unread = await post("look", { slug: "gamma", look: { font: "serif" } });
  assert.equal(unread.status, 409);
  assert.equal(unread.body.message, "这份文档的标题和说明读不出来");
  assert.equal(await read("gamma", "report.json"), "{ not json");
  await fs.writeFile(path.join(root, "gamma", "report.json"), gammaJson);

  // Rename goes through the title edit a page makes: h1, <title> and report.json (its look kept).
  const renamed = await post("rename", { slug: "beta", title: "  乙   新名 " });
  assert.equal(renamed.status, 200);
  assert.equal(renamed.body.report.title, "乙 新名");
  assert.ok((await read("beta", "report.html")).includes("<title>乙 新名</title>"));
  assert.equal(JSON.parse(await read("beta", "report.json")).title, "乙 新名");
  assert.deepEqual((await metadataOf()).look, { font: "serif", size: "large" }, "a rename keeps the look");
  assert.deepEqual((await post("look", { slug: "beta", look: { font: "sans", size: "default" } })).body.report.look, undefined);
  assert.deepEqual(await metadataOf(), { title: "乙 新名", description: "说明", type: "note", source: "test" }, "all the default: the field is gone");
  assert.equal((await post("rename", { slug: "beta", title: " " })).status, 400);
  assert.equal((await post("rename", { slug: "nope", title: "x" })).status, 404);

  // The sidebar's icon of a document not open (POST icon): the header's div.doc-icon, right before the title,
  // and report.json's icon, as gallery set --icon writes them; the rest of the file as it was; kept among its
  // versions as the reader's. An icon of the 图标 tab, a picture of its own folder, none. Its header the
  // page's (header.doc-header, where the page shows its icon), put back as it was after.
  const betaHtml = await read("beta", "report.html");
  await fs.writeFile(path.join(root, "beta", "report.html"), betaHtml.replace('<header class="doc-hero"><h1 class="doc-title">乙 新名</h1></header>', '<header class="doc-header">\n    <h1 class="doc-title">乙 新名</h1>\n  </header>'));
  const iconBefore = await read("beta", "report.html");
  const iconed = await post("icon", { slug: "beta", icon: "🎯" });
  assert.equal(iconed.status, 200, JSON.stringify(iconed.body));
  assert.equal(iconed.body.report.icon, "🎯");
  const iconHtml = await read("beta", "report.html");
  const iconMarkup = /<div class="doc-icon"[^>]*>🎯<\/div>\s*/;
  assert.match(iconHtml, new RegExp(iconMarkup.source + '<h1 class="doc-title">乙 新名<\\/h1>'), iconHtml);
  assert.equal(iconHtml.replace(iconMarkup, ""), iconBefore, "nothing else of the file changed");
  assert.equal(JSON.parse(await read("beta", "report.json")).icon, "🎯");
  assert.equal((await post("icon", { slug: "beta", icon: "/icons/airplane_blue.svg" })).status, 200);
  assert.match(await read("beta", "report.html"), /<div class="doc-icon"[^>]*data-icon="\/icons\/airplane_blue\.svg"[^>]*><\/div>/);
  assert.equal(JSON.parse(await read("beta", "report.json")).icon, "/icons/airplane_blue.svg");
  assert.equal((await post("icon", { slug: "beta", icon: "assets/none.png" })).body.reason, "picture", "a picture not in its folder");
  await fs.mkdir(path.join(root, "beta", "assets"), { recursive: true });
  await fs.writeFile(path.join(root, "beta", "assets", "icon.png"), Buffer.from("89504e470d0a1a0a", "hex"));
  assert.equal((await post("icon", { slug: "beta", icon: "assets/icon.png" })).status, 200);
  assert.match(await read("beta", "report.html"), /<div class="doc-icon"[^>]*><img src="assets\/icon\.png"/);
  const unset = await post("icon", { slug: "beta", icon: null });
  assert.equal(unset.status, 200);
  assert.equal(await read("beta", "report.html"), iconBefore, "none: the header as it was before");
  assert.equal(JSON.parse(await read("beta", "report.json")).icon, undefined);
  assert.equal((await post("icon", { slug: "beta", icon: "abc" })).status, 400, "no icon");
  assert.equal((await post("icon", { slug: "beta", icon: "<b>" })).status, 400);
  assert.equal((await post("icon", { slug: "nope", icon: "🎯" })).status, 404);
  await fs.writeFile(path.join(root, "beta", "report.html"), betaHtml);

  // To the trash: out of reports/ (and so out of every list), its reports move up to where it was.
  const trashed = await post("trash", { slug: "alpha" });
  assert.equal(trashed.status, 200);
  const { entry } = trashed.body;
  assert.deepEqual({ kind: entry.kind, slug: entry.slug, title: entry.title, parent: entry.parent, index: entry.index }, { kind: "document", slug: "alpha", title: "甲报告", parent: "", index: 1 });
  assert.equal(JSON.parse(await read(".gallery", "trash", entry.id, "entry.json")).kind, "document", "the entry written says its kind, as a custom page's does");
  assert.equal(await exists("alpha"), false);
  assert.equal(await read(".gallery", "trash", entry.id, "report", "report.html"), reportHtml("alpha", "甲报告"), "the trash keeps the report as it was");
  assert.deepEqual((await outline())[""].slice(0, 5), ["beta", docA, docB, alphaCopy2, alphaCopy], "(and the copy of the copy after the one it was made of)");
  assert.deepEqual((await get("trash")).body.entries.map(({ id, slug }) => ({ id, slug })), [{ id: entry.id, slug: "alpha" }]);

  // Restore: back where it was; under the next free slug when its own was taken meanwhile.
  await write("alpha", "另一份甲");
  // An entry written before the custom pages came has no kind: restored as a document's, answered with its kind.
  const before = path.join(root, ".gallery", "trash", entry.id, "entry.json");
  const { kind: _kind, ...old } = JSON.parse(await fs.readFile(before, "utf8"));
  await fs.writeFile(before, JSON.stringify(old));
  const restored = await post("restore", { id: entry.id });
  assert.equal(restored.status, 200);
  assert.deepEqual([restored.body.entry.kind, restored.body.entry.slug], ["document", "alpha-2"], "an old entry restored is answered as a document's");
  assert.equal(restored.body.report.slug, "alpha-2");
  assert.equal(restored.body.report.title, "甲报告");
  assert.ok((await read("alpha-2", "report.html")).includes('data-doc-id="alpha-2"'));
  assert.equal(await exists(".gallery", "trash", entry.id), false);
  assert.deepEqual((await get("trash")).body.entries, []);
  assert.deepEqual((await outline())[""].slice(0, 5), ["beta", "alpha-2", docA, docB, alphaCopy2], "back where it was (after beta)");
  assert.equal((await post("restore", { id: entry.id })).status, 404);
  assert.equal((await post("restore", { id: "../x" })).status, 404);

  // The outline's answer holds what a link is worked out from and no link: the workspace keeps none.
  // A report in the trash keeps its slug, which no new report takes, and comes back under it.
  {
    const later = (await post("create", { title: "同名" })).body.report.slug;
    const binned = (await post("trash", { slug: later })).body.entry;
    const answered = (await get("outline")).body;
    assert.deepEqual(answered.trash.map(({ id, slug, title }) => ({ id, slug, title })), [{ id: binned.id, slug: later, title: "同名" }], "the trash, each with its title");
    assert.ok(!("former" in answered) && !("link" in answered.reports.beta) && !("link" in answered.trash[0]), "no link kept in the answer");
    const next = (await post("create", { title: "下一份" })).body.report.slug;
    assert.ok(DOC_SLUG.test(next) && next !== later && pageId(next) !== pageId(later), "a new report leaves a slug (and an id) the trash holds alone");
    assert.equal((await post("restore", { id: binned.id })).body.report.slug, later, "and it comes back under it");
    // A doc-<id> name whose folder was made meanwhile (an Agent's, by hand): back under a new doc-<id>, not <name>-2.
    const again = (await post("trash", { slug: later })).body.entry;
    await write(later, "占了名字的");
    const elsewhere = (await post("restore", { id: again.id })).body;
    assert.ok(DOC_SLUG.test(elsewhere.report.slug) && elsewhere.report.slug !== later && elsewhere.entry.slug === elsewhere.report.slug, JSON.stringify(elsewhere));
    assert.ok((await read(elsewhere.report.slug, "doc.html")).includes(`data-doc-id="${elsewhere.report.slug}"`), "its data-doc-id follows the folder");
    assert.equal(await read(later, "report.html"), reportHtml(later, "占了名字的"), "and the folder that was there is as it was");
    await post("trash", { slug: elsewhere.report.slug });
    await post("trash", { slug: later });
    assert.equal(await exists(".gallery", "links.json"), false, "nothing written of links");

    // A doc.json half written (an Agent's) fails no list, and a link read from the list gives it none.
    const whole = await read("beta", "report.json");
    await fs.writeFile(path.join(root, "beta", "report.json"), '{ "title": "另');
    assert.equal((await get("outline")).body.reports.beta.title, "beta");
    assert.equal((await documentLinks(root)).links.get("beta"), pageId("beta"), "the id alone: a title not read leaves no words");
    await fs.writeFile(path.join(root, "beta", "report.json"), '{ "title": "" }');
    assert.equal((await documentLinks(root)).links.get("beta"), pageId("beta"), "as an empty title does");
    await fs.writeFile(path.join(root, "beta", "report.json"), "{}");
    assert.equal((await documentLinks(root)).links.get("beta"), pageId("beta"), "and one left out: its folder name is no label");
    await fs.writeFile(path.join(root, "beta", "report.json"), whole);

    // A links.json left by an earlier Gallery is read by nothing.
    await fs.writeFile(path.join(root, ".gallery", "links.json"), '{ "version": 1, "links": { "beta": "别的" }, "former": { "旧的": "beta" } }');
    assert.equal((await documentLinks(root)).links.get("beta"), pageLink({ slug: "beta", title: (await get("outline")).body.reports.beta.title }));
    await fs.rm(path.join(root, ".gallery", "links.json"));
  }

  // Delete for good: only what is in the trash.
  const gone = (await post("trash", { slug: "gamma" })).body.entry;
  assert.equal((await post("destroy", { id: gone.id })).status, 200);
  assert.equal(await exists(".gallery", "trash", gone.id), false);
  assert.equal((await post("destroy", { id: gone.id })).status, 404);

  // Export: built from the saved source; a report that fails its checks says why.
  assert.deepEqual((await post("export", { slug: "alpha-2" })).body, { ok: true, path: path.resolve(projectRoot, "exports", "alpha-2.html") });
  const failed = await post("export", { slug: "beta" });
  assert.equal(failed.status, 422);
  assert.equal(failed.body.message, "检查没有通过：one；two；three 等 4 条");
  // Said in the UI's language (told(), as the workbench's api.ts and the page's post.mjs read it): the
  // check's lines (the Agent's) as they are, the rest English in an English UI.
  assert.equal(inLanguage("en", () => told(failed.body)), "The checks didn't pass: one; two; three and more, 4 in all");
  const one = (await post("export", { slug: docA })).body;
  assert.deepEqual([one.message, inLanguage("en", () => told(one))], ["检查没有通过：one", "The checks didn't pass: one"]);
  const busy = await post("export", { slug: docB });
  assert.deepEqual([busy.status, busy.body.reason, inLanguage("en", () => told(busy.body))], [409, "busy", "The file keeps changing (an Agent may be writing it); nothing was written"], "a hand-in refused is no check failed");
  assert.equal((await post("export", { slug: "nope" })).status, 404);
  assert.deepEqual(exported, ["alpha-2", "beta", docA, docB]);

  // A report.json that still says "template": true (templates are gone) is an ordinary report's: in
  // the outline (last at the top), trashed and restored as any; `template` on create is nothing.
  await write("kit", "组件模板");
  await fs.writeFile(path.join(root, "kit", "report.json"), `${JSON.stringify({ ...JSON.parse(reportJson("组件模板")), template: true }, null, 2)}\n`);
  const listed = (await get("outline")).body;
  assert.ok(listed.templates === undefined && listed.reports.kit.template === undefined, JSON.stringify(listed.reports.kit));
  assert.equal(listed.outline.children[""].at(-1), "kit", "in the outline");
  const trashedKit = await post("trash", { slug: "kit" });
  assert.ok(trashedKit.status === 200 && !(await exists("kit", "report.html")), JSON.stringify(trashedKit.body));
  assert.equal((await post("restore", { id: trashedKit.body.entry.id })).body.report.slug, "kit");
  const made = (await post("create", { template: true })).body.report;
  assert.ok(DOC_SLUG.test(made.slug) && made.title === "" && made.template === undefined, JSON.stringify(made));
  assert.equal((await outline())[""].at(-1), made.slug, "a report like any new one");

  // The writing preferences to Agents (写作偏好): made the first time, the same one after, in the
  // workspace's .gallery/pages/ (never at its root); apart, never trashed.
  assert.equal((await get("outline")).body.instructions, null);
  const instructions = (await post("instructions")).body.report;
  assert.deepEqual(instructions, { slug: "writing-preferences", title: "通用写作", description: "Agent 每次写报告前都会先读的写作偏好", type: instructions.type, instructions: true });
  assert.deepEqual((await post("instructions")).body.report.slug, "writing-preferences", "one at most");
  const preferenceFile = path.join(root, 'preferences/通用写作.md');
  const previousNoBrowser = process.env.GALLERY_NO_BROWSER;
  process.env.GALLERY_NO_BROWSER = '1';
  const revealedPreference = await post('reveal', { preference: 'preferences/通用写作.md' });
  if (previousNoBrowser === undefined) delete process.env.GALLERY_NO_BROWSER; else process.env.GALLERY_NO_BROWSER = previousNoBrowser;
  assert.equal(revealedPreference.status, 200);
  assert.equal(revealedPreference.body.path, preferenceFile);
  assert.equal(revealedPreference.body.opened, false, 'test env does not launch a file manager');
  assert.equal((await post('reveal', { preference: 'preferences/../gallery.json' })).status, 404);
  const preferenceText = await fs.readFile(preferenceFile, 'utf8');
  await fs.writeFile(preferenceFile, '# 我的写作规则\n\n先写结论。\n');
  assert.equal((await post('instructions')).body.report.title, '通用写作', 'opening uses the document filename as its title');
  await fs.writeFile(preferenceFile, preferenceText);
  await post('instructions');
  const extraPreference = await post('preference-edit', { action: 'create', name: '会议纪要' });
  assert.equal(extraPreference.status, 200);
  const extraPage = (await post('instructions', { preference: extraPreference.body.selected })).body.report;
  assert.equal(extraPage.title, '会议纪要');
  for (const [action, status] of [['trash', 409], ['look', 404], ['looks', 404], ['move', 409]]) assert.equal((await post(action, { slug: extraPage.slug, parent: '', look: {} })).status, status, 'extra preferences are also excluded from ' + action);
  assert.ok(!Object.values((await get('outline')).body.outline.children).flat().includes(extraPage.slug));
  assert.ok((await exists(".gallery", "pages", "writing-preferences", "doc.html")) && !(await exists("writing-preferences")), "in .gallery/pages/");
  const apart = (await get("outline")).body;
  assert.ok(apart.instructions === "writing-preferences" && apart.reports["writing-preferences"].instructions === true && !Object.values(apart.outline.children).flat().includes("writing-preferences"));
  const kept = await post("trash", { slug: "writing-preferences" });
  assert.ok(kept.status === 409 && kept.body.reason === "instructions" && (await exists(".gallery", "pages", "writing-preferences", "doc.html")));
  assert.equal((await post("create", { title: "同名" })).body.report.slug.startsWith("doc"), true);
  assert.match((await get("source?slug=writing-preferences")).body.path, /[\\/]\.gallery[\\/]pages[\\/]writing-preferences[\\/]doc\.html$/, "its file where it is");

  // A global default never rewrites document or trash overrides; new documents inherit it.
  {
    const jsonOf = (slug) => documentFiles(path.join(root, slug)).json;
    const lookIn = async (slug) => JSON.parse(await fs.readFile(jsonOf(slug), "utf8")).look;
    const globalFile = path.join(process.env.GALLERY_DATA_DIR, "appearance.json");
    const oldGlobal = await fs.readFile(globalFile, "utf8").catch(() => null);
    try {
      await post("look", { slug: "beta", look: { font: "serif", size: "large" } });
      await post("look", { slug: docB, look: { width: "narrow" } });
      const binnedSlug = (await post("create", { title: "回收的" })).body.report.slug;
      await post("look", { slug: binnedSlug, look: { width: "narrow", spacing: "loose" } });
      const binnedEntry = (await post("trash", { slug: binnedSlug })).body.entry;
      const binnedJson = path.join(root, ".gallery", "trash", binnedEntry.id, "report", "doc.json");
      const beforeTrash = await fs.readFile(binnedJson, "utf8");
      const applied = await post("looks", { slug: "beta" });
      assert.equal(applied.status, 200);
      assert.deepEqual(applied.body.look, { font: "serif", size: "large" });
      assert.deepEqual(JSON.parse(await fs.readFile(globalFile, "utf8")), { look: { font: "serif", size: "large" } });
      assert.deepEqual(await lookIn(docB), { width: "narrow" }, "individual choice survives");
      assert.equal(await fs.readFile(binnedJson, "utf8"), beforeTrash, "trash metadata is unchanged");
      const fresh = (await post("create", { title: "新的" })).body.report;
      assert.deepEqual(fresh.look, { font: "serif", size: "large" });
      assert.equal(await lookIn(fresh.slug), undefined, "new document inherits the global default");
      assert.equal((await post("looks", { slug: "writing-preferences" })).status, 404);
      assert.equal((await post("looks", { slug: "nope" })).status, 404);
      const restored = await post("restore", { id: binnedEntry.id });
      assert.deepEqual(restored.body.report.look, { font: "serif", size: "large", width: "narrow", spacing: "loose" });
      await post("trash", { slug: binnedSlug });
    } finally {
      if (oldGlobal === null) await fs.rm(globalFile, { force: true });
      else await fs.writeFile(globalFile, oldGlobal);
    }
  }

  // One in the kit's old names (before 2026-10-26) duplicated: the copy in the new ones, its own id and title.
  await fs.mkdir(path.join(root, "delta"));
  await fs.writeFile(path.join(root, "delta", "report.html"), oldNames(reportHtml("delta", "丁报告")));
  await fs.writeFile(path.join(root, "delta", "report.json"), reportJson("丁报告"));
  const oldCopy = (await post("duplicate", { slug: "delta" })).body.report;
  const copiedOld = await read(oldCopy.slug, "report.html");
  assert.ok(copiedOld.includes(`data-doc-id="${oldCopy.slug}"`) && !/data-report-|class="report-/.test(copiedOld), copiedOld);
  assert.match(copiedOld, /<h1 class="doc-title"[^>]*>丁报告（副本）<\/h1>/);
  // Renamed, it is written in the new names too.
  assert.equal((await post("rename", { slug: "delta", title: "戊报告" })).status, 200);
  const renamedOld = await read("delta", "report.html");
  assert.ok(/<h1 class="doc-title"[^>]*>戊报告<\/h1>/.test(renamedOld) && renamedOld.includes('data-doc-id="delta"') && !/data-report-|class="report-/.test(renamedOld), renamedOld);

  // A document called components, made before the packages came: listed, its copy and what the trash
  // takes of it leaving the packages beside it where they are, one being written among them. Back
  // from the trash it stands where it stood, its address with it, or, when something took a place of
  // its there, under the next free name, which a new page takes too, whatever makes it.
  {
    await fs.mkdir(path.join(root, "components", "local", "strip"), { recursive: true });
    await fs.mkdir(path.join(root, "components", "assets"));
    await fs.writeFile(path.join(root, "components", "local", "strip", "component.json"), "{}");
    await fs.writeFile(path.join(root, "components", "assets", "a.png"), "png");
    await fs.writeFile(path.join(root, "components", "local", "strip", "example.html"), reportHtml("strip", "只在组件包里的词"));
    assert.ok(!(await get("outline")).body.reports.components, "packages alone are no document");
    assert.deepEqual((await get(`search?q=${encodeURIComponent("只在组件包里的词")}`)).body.results, [], "and no search finds them");
    assert.deepEqual([(await post("trash", { slug: "components" })).status, (await post("duplicate", { slug: "components" })).status], [404, 404], "and no command takes them for one");
    assert.ok(await exists("components", "local", "strip", "component.json") && !(await exists("components-copy")), "nothing moved, nothing made");
    await fs.mkdir(path.join(root, "components", "other", "half"), { recursive: true });
    await fs.writeFile(path.join(root, "components", "other", "half", "kit.js"), "// no manifest yet");
    await fs.writeFile(path.join(root, "components", "report.html"), reportHtml("components", "组件设计"));
    await fs.writeFile(path.join(root, "components", "report.json"), reportJson("组件设计"));
    assert.ok((await get("outline")).body.reports.components, "listed");
    const copy = (await post("duplicate", { slug: "components" })).body.report;
    assert.ok(await exists(copy.slug, "assets", "a.png") && !(await exists(copy.slug, "local")) && !(await exists(copy.slug, "other")), "a copy has what is the document's alone");
    const binned = (await post("trash", { slug: "components" })).body.entry;
    assert.ok(await exists("components", "local", "strip", "component.json") && await exists("components", "other", "half", "kit.js") && !(await exists("components", "report.html")) && !(await exists("components", "assets")), "the packages stay, the document goes");
    assert.ok(await exists(".gallery", "trash", binned.id, "report", "assets", "a.png") && !(await exists(".gallery", "trash", binned.id, "report", "local")));
    assert.ok(!(await get("outline")).body.reports.components, "no document any more");
    const back = (await post("restore", { id: binned.id })).body.report;
    assert.equal(back.slug, "components", "back in its own folder: its address goes by that name");
    assert.ok(await exists("components", "report.html") && await exists("components", "assets", "a.png") && await exists("components", "local", "strip", "component.json"), "beside the packages");
    assert.match(await read("components", "report.html"), /data-doc-id="components"/);
    const binnedAgain = (await post("trash", { slug: "components" })).body.entry;
    await fs.mkdir(path.join(root, "components", "assets", "chart"), { recursive: true });
    await fs.writeFile(path.join(root, "components", "assets", "chart", "component.json"), "{}");
    const beside = (await post("restore", { id: binnedAgain.id })).body.report;
    assert.equal(beside.slug, "components-2", "a place of its taken: back under the next free name");
    assert.match(await read("components-2", "report.html"), /data-doc-id="components-2"/);
    assert.ok(await exists("components-2", "assets", "a.png") && await exists("components", "assets", "chart", "component.json"));
    assert.equal(await workspace.freeSlug("components"), "components-3", "a new page takes the next free name");
    await fs.rm(path.join(root, "components"), { recursive: true });
    assert.equal(await workspace.freeSlug("components"), "components-3", "with no such folder too");
  }

  // Custom pages (shared/pages.mjs): listed apart in the outline's answer, in the sidebar's head order (the
  // answer's head: new, search and @<slug>, which POST head writes into the outline file, a bad one refused);
  // renamed (page.json's title alone) and trashed (the folder whole, an entry of kind "page", the home page as
  // any) by the same commands with kind "page"; back from the trash under their slug, or the next free one
  // (their main's data-page-id with it) when a document or a page took it meanwhile; their slug taken by no
  // new document while they are there or in the trash; POST new-page making a blank page, page-<id>, after a page.
  {
    await createPage("home", "首页", { root });
    await createPage("reading", "读书", { root, icon: "📚" });
    const pages = (await get("outline")).body.pages;
    assert.deepEqual(pages, [{ slug: "home", title: "首页", icon: null, defaultCards: false, hint: false }, { slug: "reading", title: "读书", icon: "📚", defaultCards: false, hint: false }], "the pages, in the order they were made, apart from the documents");
    assert.deepEqual((await get("outline")).body.head, ["new", "search", "@home", "@reading"], "the head's rows");
    const ordered = await post("head", { order: ["@reading", "new", "search", "@home"] });
    assert.deepEqual([ordered.status, ordered.body.head], [200, ["@reading", "new", "search", "@home"]], JSON.stringify(ordered.body));
    assert.deepEqual(JSON.parse(await read(".gallery", "outline.json")).head, ["@reading", "new", "search", "@home"], "into the outline file");
    assert.deepEqual([(await get("outline")).body.head, (await get("outline")).body.pages.map(({ slug }) => slug)], [["@reading", "new", "search", "@home"], ["reading", "home"]], "read back, the pages in that order");
    for (const bad of [["new", "new"], ["@Home"], "new", ["home"]]) assert.equal((await post("head", { order: bad })).status, 400, JSON.stringify(bad));
    const blank = await post("new-page", { title: " 未命名页面 ", after: "reading" });
    assert.equal(blank.status, 200, JSON.stringify(blank.body));
    const blankSlug = blank.body.page.slug;
    assert.ok(/^page-[a-z][a-z0-9]{7}$/.test(blankSlug) && blank.body.page.title === "未命名页面", JSON.stringify(blank.body));
    assert.deepEqual((await get("outline")).body.head, ["@reading", "@" + blankSlug, "new", "search", "@home"], "新建页面: right after the page it was asked from");
    assert.ok(isBlankPage(await read("pages", blankSlug, "page.html")), "a blank page: an empty main, no board, for an Agent to write");
    assert.equal((await post("new-page", { title: "  " })).status, 400, "a title it must have");
    assert.equal((await post("trash", { slug: blankSlug, kind: "page" })).status, 200);
    assert.ok(!Object.keys((await get("outline")).body.reports).includes("home"), "no page among the documents");
    // 复制本地路径 of a page (the top bar's ···): its page.html, as the system writes a path; none for a page that is not there.
    assert.deepEqual((await get("source?slug=reading&kind=page")).body, { ok: true, path: path.resolve(root, "pages", "reading", "page.html") }, "a page's page.html");
    assert.equal((await get("source?slug=none&kind=page")).status, 404);
    assert.equal((await get("source?slug=reading")).status, 404, "a page's slug is no document's without kind=page");
    const html = await read("pages", "reading", "page.html");
    const renamed = await post("rename", { slug: "reading", title: "书单", kind: "page" });
    assert.deepEqual([renamed.status, renamed.body.page], [200, { slug: "reading", title: "书单", icon: "📚", defaultCards: false, hint: false }]);
    assert.deepEqual(JSON.parse(await read("pages", "reading", "page.json")), { title: "书单", icon: "📚" });
    assert.equal(await read("pages", "reading", "page.html"), html, "page.html as it was");
    assert.equal((await post("rename", { slug: "reading", title: " ", kind: "page" })).status, 400);
    assert.equal((await post("rename", { slug: "none", title: "x", kind: "page" })).status, 404);
    // A page's icon (its row in the sidebar's head): page.json's icon alone, an emoji or an icon, never a picture.
    const pageIcon = await post("icon", { slug: "reading", icon: "📖", kind: "page" });
    assert.deepEqual([pageIcon.status, pageIcon.body.page?.icon], [200, "📖"]);
    assert.deepEqual(JSON.parse(await read("pages", "reading", "page.json")), { title: "书单", icon: "📖" });
    assert.equal(await read("pages", "reading", "page.html"), html, "page.html as it was");
    assert.equal((await post("icon", { slug: "reading", icon: "assets/x.png", kind: "page" })).status, 400, "no picture for a page");
    assert.equal((await post("icon", { slug: "none", icon: "📖", kind: "page" })).status, 404);
    assert.equal((await post("icon", { slug: "reading", icon: "/icons/book_green.svg", kind: "page" })).status, 200);
    assert.equal((await post("icon", { slug: "reading", icon: "📚", kind: "page" })).status, 200);
    const home = await post("trash", { slug: "home", kind: "page" });
    assert.equal(home.status, 200, "the home page trashed as any page");
    assert.ok(!(await exists("pages", "home")) && !(await get("outline")).body.pages.some(({ slug }) => slug === "home"), "its folder gone, its row too");
    const homeBack = await post("restore", { id: home.body.entry.id });
    assert.deepEqual([homeBack.status, homeBack.body.page.slug], [200, "home"], "and restored");
    assert.deepEqual((await get("outline")).body.head.filter((key) => key.startsWith("@")).at(-1), "@home", "back in its place in the head");
    assert.equal((await post("trash", { slug: "none", kind: "page" })).status, 404);
    const binned = await post("trash", { slug: "reading", kind: "page" });
    assert.equal(binned.status, 200);
    const { entry: pageEntry } = binned.body;
    assert.deepEqual({ kind: pageEntry.kind, slug: pageEntry.slug, title: pageEntry.title, parent: pageEntry.parent, index: pageEntry.index }, { kind: "page", slug: "reading", title: "书单", parent: "", index: -1 });
    assert.ok(!(await exists("pages", "reading")) && (await read(".gallery", "trash", pageEntry.id, "page", "page.html")) === html, "its folder moved whole into the trash");
    assert.deepEqual((await get("outline")).body.pages.map(({ slug }) => slug), ["home"]);
    assert.equal((await get("outline")).body.trash.find(({ id }) => id === pageEntry.id)?.kind, "page", "listed in the trash as a page");
    assert.notEqual((await post("create", { title: "x" })).body.report.slug, "reading", "its slug taken by no new document while in the trash");
    await write("reading", "同名文档");
    const back = await post("restore", { id: pageEntry.id });
    assert.equal(back.status, 200);
    assert.deepEqual([back.body.page.slug, back.body.page.title, back.body.entry.kind], ["reading-2", "书单", "page"], "back under the next free slug: a document took its own");
    assert.match(await read("pages", "reading-2", "page.html"), /data-page-id="reading-2"/);
    assert.ok(await exists("reading", "report.html"), "the document left as it is");
    assert.equal((await post("trash", { slug: "reading" })).status, 200, "a document of a page's former slug trashed as a document");
    const kinds = (await get("trash")).body.entries.map(({ kind, slug }) => kind + ":" + slug);
    assert.ok(kinds.includes("document:reading") && kinds.every((kind) => /^(document|page):/.test(kind)), "every entry with its kind, an old one's a document's");
  }

  // Made while the UI is English: its title and description as the workbench gives them, its page's lang
  // en (the kit's own words in its export English); in Chinese (or any other), the starter's zh-CN.
  const english = (await post("create", { title: "Untitled", description: "New document", language: "en" })).body.report;
  assert.deepEqual([english.title, english.description], ["Untitled", "New document"]);
  assert.match(await read(english.slug, "doc.html"), /<html lang="en">/);
  const chinese = (await post("create", { title: "中文的", language: "zh" })).body.report;
  assert.match(await read(chinese.slug, "doc.html"), /<html lang="zh-CN">/);
  assert.match(await read((await post("create", { title: "别的", language: "fr\" onload=\"x" })).body.report.slug, "doc.html"), /<html lang="zh-CN">/, "no other language written");
} finally {
  process.env.GALLERY_DEFAULT_WORKSPACE = savedHome;
  server.close();
  await fs.rm(root, { recursive: true, force: true });
}

console.log("Checked workspace commands: the save checks (Host, Origin, token), the outline (validated, every report once, new ones last; moves with what is under them, refused under themselves, at another level or for what it holds not, each write told), new reports from the starter (each in a folder doc-<its page id>, the address ending with the eight; lang en when the UI is English), duplicates (a new doc-<id> of their own and data-doc-id, \"（副本）\" in every title, made now by their doc.json's created, one in the kit's old names copied in the new ones), 字体与布局 written into doc.json (the field gone at the default, kept by a rename), 设置为全局默认 (the user-level default, individual and trash overrides retained, a new document following it), rename as a title edit, the sidebar's icon (the header and report.json, a picture of its folder alone, none), the trash and restoring under a free slug (a doc-<id> name taken meanwhile: a new doc-<id>), each report's link kept and the links left behind, deleting for good, export failures (said in the UI's language, a hand-in refused apart), search (titles and text, with snippets), 复制底稿路径 (the system's path of a document's report.html), an old template flag nothing, the writing preferences to Agents (made once, apart, never trashed), and the custom pages (listed apart, home first; renamed and their icon set in page.json alone; trashed whole as kind page, never the home page, and back under a free slug).");
