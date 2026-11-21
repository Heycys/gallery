import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { ASSETS, publicFileOf } from "../../../src/render/assets.mjs";
import { fileStamp } from "../../../src/render/media-ref.mjs";
import { writeSharedAssets } from "../../../src/render/pipeline.mjs";
import { changeOf, createRoutes } from "../../../src/server/routes.mjs";
import { closeHomeHint, createPage, pageFiles, pageVersion, tellHomeCards } from "../../../src/shared/pages.mjs";
import { reportsDirectory } from "../../../src/shared/paths.mjs";

// Run by tests/unit/routes.mjs in a workspace of its own (GALLERY_WORKSPACE): a custom page as the
// preview server shows it at /pages/<slug> (src/server/routes.mjs, src/render/page-html.mjs), and its
// live channel (?page=<slug>: "page <version>" once page.html or page.json is written).

if (!ASSETS.every((asset) => fs.existsSync(publicFileOf(asset)))) await writeSharedAssets();

// A block whose data part holds HTML (a picture of the page's own, below), there before the server's catalog is read.
const pic = path.join(reportsDirectory, "components", "local", "pic");
fs.mkdirSync(pic, { recursive: true });
fs.writeFileSync(path.join(pic, "component.json"), JSON.stringify({ id: "local/pic", apiVersion: 1, version: "1.0.0", name: { zh: "图", en: "Picture" }, description: { zh: "一张图", en: "A picture" }, words: "pic", parts: { body: { at: ":scope > div.pic-body", edit: "data" } }, places: ["page"], card: { w: 4, h: 2 } }));
fs.writeFileSync(path.join(pic, "template.html"), '<div data-doc-component="local/pic"><div class="pic-body"></div></div>\n');

const routes = createRoutes({ stateDirectory: mkdtempSync(path.join(tmpdir(), "custom-pages-state-")), logger: { warn() {}, error() {}, info() {} } });
const PORT = 4998;

function ask(url) {
  return new Promise((resolve, reject) => {
    const headers = new Map();
    const response = {
      statusCode: 200,
      setHeader: (name, value) => headers.set(name.toLowerCase(), value),
      end(body) {
        resolve({ status: this.statusCode, headers, body: String(body ?? ""), passed: false });
      },
    };
    routes.handle({ url, method: "GET", headers: { host: `127.0.0.1:${PORT}` }, socket: { localPort: PORT } }, response, (error) => (error ? reject(error) : resolve({ status: null, passed: true })));
  });
}
// A POST of the page's own (its token, its origin, JSON), as the board sends its ops: the answer's JSON.
function post(url, body, token) {
  return new Promise((resolve, reject) => {
    const request = Object.assign(Readable.from([Buffer.from(JSON.stringify(body))]), {
      url, method: "POST", socket: { localPort: PORT },
      headers: { host: `127.0.0.1:${PORT}`, origin: `http://127.0.0.1:${PORT}`, "content-type": "application/json", "x-gallery-token": token },
    });
    const response = { statusCode: 200, setHeader() {}, end: (text) => resolve(JSON.parse(String(text))) };
    routes.handle(request, response, (error) => reject(error ?? new Error(`${url}: passed on`)));
  });
}

// A page made as gallery page new makes it, and a card of a package the workspace has not (none: the kit alone).
await createPage("home", "首页", { root: reportsDirectory, defaultCards: true, hint: true });
const { html: file, json } = pageFiles("home", reportsDirectory);
fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace('<div class="gallery-board" data-board-id="main">\n', (board) => `${board}      <section class="gallery-card" data-card-id="c1" data-x="0" data-y="0" data-w="4" data-h="2"><p>静态</p></section>\n`));

const page = await ask("/pages/home");
assert.equal(page.status, 200);
assert.match(page.headers.get("content-type"), /^text\/html/);
assert.equal(page.headers.get("cache-control"), "no-store");
const body = page.body;
for (const id of ["styles", "board-styles", "runtime", "state", "tokens", "ui", "board"]) assert.ok(new RegExp(`data-doc-kit="${id}"`).test(body), `the kit's ${id}, as every custom page loads it`);
assert.ok(!/data-doc-kit="(charts|tables|math|sheets|code)"/.test(body), "no kit file the page does not use");
assert.ok(/\/kit\/board\.js\?v=[a-f0-9]{16}/.test(body), "under its stamp");
assert.ok(body.indexOf('data-doc-kit="board"') > body.indexOf("</main>"), "the kit's scripts after the main: the board's cards are read when board.js runs");
assert.ok(body.includes("/__gallery/events?page=home") && body.includes(`next !== "${pageVersion(fs.readFileSync(file, "utf8"), fs.readFileSync(json, "utf8"))}"`), "the live script listens for its page, told the version it was served at");
assert.match(body, /<script type="module" src="\/__gallery\/edit\/v\/[a-f0-9]{16}\/src\/editor\/page\/custom-page\.mjs" data-doc-dev><\/script>/, "the workbench's session, a module of the editor's under their stamp");
assert.ok(body.includes("data-ge-language"), "the UI's language on its root");
assert.ok(!body.includes("editor/page/editor.mjs") && !body.includes("doc-display"), "no editor, no display button");

// Its cards served each with its id and base (data-ge-base), and the page map its board's editing reads:
// its slug, the token, the version it was served at, and each block of its cards (none here: a card of
// a package the workspace has not is the kit's to say); on the home page, its first-open note not yet
// closed, `hint`, and none once it is; and `news`, the default cards it holds none of that the reader was
// not told of (a home whose hints say nothing of its cards: all but today and the note, in HOME_CARDS order), none once told.
assert.match(body, /<section class="gallery-card" data-ge-base="[a-f0-9]{16}" data-card-id="c1"/, "its card with its base");
const map = JSON.parse(body.match(/<script type="application\/json" data-ge-page data-doc-dev>([^<]*)<\/script>/)[1]);
assert.deepEqual(Object.keys(map), ["slug", "title", "token", "version", "blocks", "hint", "defaults", "news"]);
assert.equal(map.hint, true, "the home page's first-open note shown, none closed yet");
assert.deepEqual(map.news.map(({ block, name }) => [block, name.zh]), [["gallery/weather", "天气"], ["gallery/countdown", "倒计时"], ["gallery/habit", "习惯打卡"], ["gallery/stats", "工作区统计"], ["gallery/todos", "我的待办"], ["gallery/heatmap", "编辑热力图"], ["gallery/recent", "最近编辑"], ["gallery/static", "静态卡片"]], "the default cards it was not told of, named as Gallery's own name them");
assert.ok(map.slug === "home" && /^[a-f0-9]{32}$/.test(map.token) && map.version === pageVersion(fs.readFileSync(file, "utf8"), fs.readFileSync(json, "utf8")) && Object.keys(map.blocks).length === 0, JSON.stringify(map));
assert.ok(body.includes("window.__galleryPageChanged ? window.__galleryPageChanged(next)"), "a page message handed to the board, whose own writes are no one else's");
assert.equal(fs.readFileSync(file, "utf8").includes("data-ge-base"), false, "nothing of it in the file");
await closeHomeHint(reportsDirectory);
const unhinted = JSON.parse((await ask("/pages/home")).body.match(/<script type="application\/json" data-ge-page data-doc-dev>([^<]*)<\/script>/)[1]);
assert.ok(!("hint" in unhinted), "closed for the workspace: no note in the map");
await tellHomeCards(reportsDirectory);
const toldAll = JSON.parse((await ask("/pages/home")).body.match(/<script type="application\/json" data-ge-page data-doc-dev>([^<]*)<\/script>/)[1]);
assert.ok(!("news" in toldAll), "every default card told of: no note of new cards");
assert.match((await ask("/pages/home")).body, /<script data-doc-dev>document\.currentScript\.remove\(\); globalThis\.__galleryWorkspace = "\/__gallery\/workspace\/query";<\/script>/, "where a block reads the workspace, in a script of the server's (no export keeps it)");
// The page service's library, by the page.
const library = await ask("/__gallery/pages/home/library");
assert.equal(library.status, 200);
assert.ok(Array.isArray(JSON.parse(library.body).blocks), library.body);
assert.equal((await ask("/__gallery/pages/none/library")).status, 404, "no such page");
assert.equal((await ask("/__gallery/pages/home/cards")).status, 405, "its writes are POSTs");

// Its own files (assets/ of its folder) at /pages/<slug>/assets/<file>: a picture by its type, any other
// file handed out for saving only, nothing else of the folder, no name the route takes none by; and the
// page's references to them addressed there as it is served, the file as it was.
fs.mkdirSync(path.join(pageFiles("home", reportsDirectory).folder, "assets"), { recursive: true });
fs.writeFileSync(path.join(pageFiles("home", reportsDirectory).folder, "assets", "cover.png"), "png bytes");
fs.writeFileSync(path.join(pageFiles("home", reportsDirectory).folder, "assets", "x.html"), "<script>alert(1)</script>");
const picture = await ask("/pages/home/assets/cover.png");
assert.deepEqual([picture.status, picture.headers.get("content-type"), picture.headers.get("cache-control"), picture.body], [200, "image/png", "no-cache", "png bytes"]);
const handed = await ask("/pages/home/assets/x.html");
assert.deepEqual([handed.status, handed.headers.get("content-type"), handed.headers.get("content-disposition"), handed.headers.get("x-content-type-options")], [200, "application/octet-stream", "attachment", "nosniff"], "an HTML file never shown in the page's origin");
for (const url of ["/pages/home/assets/none.png", "/pages/home/assets/.hidden", "/pages/none/assets/cover.png", "/pages/a--b/assets/cover.png"]) assert.equal((await ask(url)).status, 404, url);
for (const url of ["/pages/home/assets/sub/cover.png", "/pages/home/assets/../page.html", "/pages/home/page.json"]) assert.equal((await ask(url)).passed, true, `${url}: no file of the route`);
fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("<p>静态</p>", '<p>静态</p><img src="assets/cover.png" alt=""><img src="assets/sub/a.png" alt="">'));
const pictured = (await ask("/pages/home")).body;
assert.ok(pictured.includes('<img src="/pages/home/assets/cover.png" alt="">') && pictured.includes('<img src="assets/sub/a.png" alt="">'), "a reference to its assets/ addressed where the server serves it; one the route takes none by as written");
assert.ok(fs.readFileSync(file, "utf8").includes('<img src="assets/cover.png" alt="">'), "the file as it was");
fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace('<img src="assets/cover.png" alt=""><img src="assets/sub/a.png" alt="">', ""));
// A block's write of such a picture through the server's page service: the file holds assets/…, and the
// answer's parts are as the page shows them (where the server serves the file), which the page's undo
// puts back on it, so that the picture still loads.
const added = await post("/__gallery/pages/home/cards", { op: "add", block: "local/pic" }, map.token);
assert.equal(added.ok, true, JSON.stringify(added));
const drawn = await post("/__gallery/pages/home/cards", { op: "edit", card: added.card, part: "body", html: '<img src="/pages/home/assets/cover.png" alt="">', base: added.cards.find((one) => one.id === added.card).base }, map.token);
assert.deepEqual(drawn.parts?.body, { was: "", now: '<img src="/pages/home/assets/cover.png" alt="">' }, JSON.stringify(drawn));
assert.ok(fs.readFileSync(file, "utf8").includes('<div class="pic-body"><img src="assets/cover.png" alt=""></div>'), "the file with its folder's address");
assert.equal((await post("/__gallery/pages/home/cards", { op: "remove", card: added.card, base: drawn.cards.find((one) => one.id === added.card).base }, map.token)).ok, true);

assert.equal((await ask("/pages/none")).passed, true, "a page not there: passed on (404 by the host)");
assert.equal((await ask("/pages/a--b")).passed, true, "a slug that is none");
assert.equal((await ask("/pages/home/page.html")).passed, true, "its files are not served by their path");

// What the watcher's changes are: a page's files, a document called pages, its pictures.
const at = (...parts) => path.join(reportsDirectory, ...parts);
assert.deepEqual(changeOf(reportsDirectory, at("pages", "home", "page.html")), { page: "home", name: "page.html" });
assert.deepEqual(changeOf(reportsDirectory, at("pages", "home")), { page: "home", name: null });
assert.equal(changeOf(reportsDirectory, at("pages", "home", ".page.html.1.tmp")), null, "a write's temp file");
assert.deepEqual(changeOf(reportsDirectory, at("pages", "doc.html")), { slug: "pages", name: "doc.html" }, "a document called pages");
assert.deepEqual(changeOf(reportsDirectory, at("pages", "assets", "a.png")), { slug: "pages", name: null }, "and its pictures: no page is called assets");

// The live channel: a write of page.html is told its pages (once the burst is over), a document's not.
const heard = [];
const stream = {
  writeHead() {},
  write: (text) => heard.push(text),
  end() {},
};
let closed = null;
routes.handle({ url: "/__gallery/events?page=home", method: "GET", headers: { host: `127.0.0.1:${PORT}` }, socket: { localPort: PORT }, on: (event, listener) => { if (event === "close") closed = listener; } }, stream, () => {});
fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("静态", "静态卡片"));
routes.changed("change", file);
routes.changed("change", file);
const deadline = Date.now() + 3000;
while (!heard.some((text) => text.startsWith("data: page ")) && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 50));
const told = heard.filter((text) => text.startsWith("data: page "));
assert.deepEqual(told, [`data: page ${pageVersion(fs.readFileSync(file, "utf8"), fs.readFileSync(json, "utf8"))}\n\n`], "page.html written twice: told once, its version now");
assert.ok(heard.some((text) => text.startsWith("data: components ")) && heard.some((text) => text.startsWith("data: settings ")), "and told the catalog and the settings as it connects, as a document's page is");
// A picture of its own assets/ written again (an Agent's copied over one of the same name): its pages told once it is
// quiet ("asset <file>=<stamp>", src/server/asset-news.mjs), on which the page is shown again (its live script), loading
// its pictures anew; a document's picture is no word of the page's.
const cover = at("pages", "home", "assets", "cover.png");
fs.mkdirSync(path.dirname(cover), { recursive: true });
fs.writeFileSync(cover, "a picture");
routes.changed("change", cover);
fs.mkdirSync(at("pages-doc", "assets"), { recursive: true });
fs.writeFileSync(at("pages-doc", "assets", "x.png"), "a document's");
routes.changed("change", at("pages-doc", "assets", "x.png"));
const coverStamp = fileStamp(cover);
const toldAsset = () => heard.filter((text) => text.startsWith("data: asset "));
for (const begun = Date.now(); toldAsset().length === 0 && Date.now() - begun < 3000;) await new Promise((resolve) => setTimeout(resolve, 50));
await new Promise((resolve) => setTimeout(resolve, 400));
assert.deepEqual(toldAsset(), [`data: asset assets/cover.png=${coverStamp}\n\n`], "its picture written: told, the document's not");
assert.match((await ask("/pages/home")).body, /if \(kind === "assets" \|\| kind === "asset"\) return void again\(\);/, "on which its live script shows the page again");
closed?.();
await routes.close();
console.log("custom pages served");
