import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ASSETS, publicFileOf } from "../../../src/render/assets.mjs";
import { writeSharedAssets } from "../../../src/render/pipeline.mjs";
import { startProductionServer } from "../../../src/server/production.mjs";
import { fileIn } from "../../../src/server/static.mjs";
import { watchWorkspace } from "../../../src/server/watch.mjs";
import { reportsDirectory } from "../../../src/shared/paths.mjs";
import { HOME_CARDS } from "../../../src/shared/pages.mjs";

// Run by tests/unit/production-server.mjs in a workspace of its own (GALLERY_WORKSPACE), on the port it
// names (PORT): the release's server (src/server/production.mjs: node:http, the preview's routes, then
// the static files) started from the source checkout, with a workbench of two files standing in for
// the built one. The default home page it makes as it starts. What it serves and how it keeps it, what it refuses (another host, a path out of its
// folder), a page told of its document's change through the watcher (src/server/watch.mjs), the
// announcement it keeps while it runs, and POST stop ending it with a page's event stream open (its
// uploads' folder removed, an upload never imported in it). Then
// the watcher one folder at a time (Linux's way), on any system.

const port = Number(process.env.PORT);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (test, what, ms = 8000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(50)) if (await test()) return;
  assert.fail(`not in ${ms} ms: ${what}`);
};

// The kit's public files, as npm run dev:local has them (its predev builds them).
if (!ASSETS.every((asset) => fs.existsSync(publicFileOf(asset)))) await writeSharedAssets();

const slug = "demo";
const folder = path.join(reportsDirectory, slug);
fs.mkdirSync(path.join(folder, "assets"), { recursive: true });
fs.writeFileSync(path.join(folder, "assets", "a.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
const page = (words) => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Demo</title>
</head>
<body>
  <main class="doc-page" data-doc-id="${slug}" aria-label="Demo">
    <p>${words}</p>
  </main>
</body>
</html>
`;
fs.writeFileSync(path.join(folder, "doc.html"), page("一段话。"));
fs.writeFileSync(path.join(folder, "doc.json"), JSON.stringify({ title: "Demo" }));
const web = mkdtempSync(path.join(tmpdir(), "production-web-"));
fs.mkdirSync(path.join(web, "assets"));
fs.writeFileSync(path.join(web, "index.html"), "<!doctype html><title>Gallery</title><script type=module src=/assets/app-1.js></script>");
fs.writeFileSync(path.join(web, "assets", "app-1.js"), "console.log('workbench');");

let exited = 0;
const started = await startProductionServer({ port, web, kind: "cli", exit: () => (exited += 1), signals: false, log: { log() {}, warn() {}, error() {} } });
assert.equal(started.port, port);

// Its start made the workspace's default home page (src/editor/home-page.mjs; GALLERY_NO_DEFAULT_HOME unset
// for it by tests/unit/production-server.mjs): pages/home with today and note, gallery.json saying so.
const homeFile = path.join(reportsDirectory, "pages", "home", "page.html");
assert.ok(fs.existsSync(homeFile), "the default home page made as the server started");
const homeText = fs.readFileSync(homeFile, "utf8");
assert.ok(homeText.includes('data-doc-component="gallery/today"') && homeText.includes('data-doc-component="gallery/note"'), "its cards: today and note");
assert.equal(JSON.parse(fs.readFileSync(path.join(reportsDirectory, "gallery.json"), "utf8")).pages?.homeMade, true, "gallery.json says it was made");

// A request as a browser sends it (fetch would make the path canonical first: a raw path is sent as it is).
const ask = (pathname, { method = "GET", host = `127.0.0.1:${port}`, headers = {}, body = null } = {}) => new Promise((resolve, reject) => {
  const request = http.request({ host: "127.0.0.1", port, path: pathname, method, headers: { host, ...headers } }, (response) => {
    const chunks = [];
    response.on("data", (chunk) => chunks.push(chunk));
    response.on("end", () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks).toString("utf8") }));
  });
  request.on("error", reject);
  request.end(body);
});

// The workbench: its page never kept, its assets for good.
const workbench = await ask("/");
assert.deepEqual([workbench.status, workbench.headers["content-type"], workbench.headers["cache-control"]], [200, "text/html; charset=utf-8", "no-store"]);
assert.ok(workbench.body.includes("/assets/app-1.js"));
const asset = await ask("/assets/app-1.js");
assert.deepEqual([asset.status, asset.headers["content-type"], asset.headers["cache-control"]], [200, "text/javascript; charset=utf-8", "max-age=31536000, immutable"]);
// The kit's files: by their path asked again each time, by their stamp kept for good; KaTeX's fonts by the path its stylesheet names.
const kitByPath = await ask("/kit/runtime.js");
assert.deepEqual([kitByPath.status, kitByPath.headers["content-type"], kitByPath.headers["cache-control"]], [200, "text/javascript; charset=utf-8", "no-cache"]);
// The home page served, its page map saying its first-open note is shown (none closed yet).
const home = await ask("/pages/home");
const homeMap = JSON.parse(/<script type="application\/json" data-ge-page data-doc-dev>([^<]*)<\/script>/.exec(home.body)?.[1] ?? "null");
assert.ok(home.status === 200 && homeMap?.slug === "home" && homeMap.hint === true, `the home page served with its note: ${JSON.stringify(homeMap)}`);
const document = await ask(`/generated/${slug}.html`);
assert.equal(document.status, 200);
assert.ok(document.body.includes("一段话。") && document.body.includes("/__gallery/events?slug=demo"), "the document's page, with its event stream");
const stamped = document.body.match(/\/kit\/report\.css\?v=[a-f0-9]{16}/)?.[0];
assert.ok(stamped, "the kit's tags name their files by their stamps");
const kitByStamp = await ask(stamped);
assert.deepEqual([kitByStamp.status, kitByStamp.headers["content-type"], kitByStamp.headers["cache-control"]], [200, "text/css; charset=utf-8", "max-age=31536000, immutable"]);
// Its pages framed by Gallery's own alone (shared/http.mjs FRAMED_BY: no site elsewhere lays one under a decoy); its files say nothing of it.
for (const [name, answer] of [["the workbench", workbench], ["a custom page", home], ["a document", document]]) {
  assert.equal(answer.headers["content-security-policy"], "frame-ancestors 'self'", `${name}: framed by Gallery's pages alone`);
}
assert.equal(kitByStamp.headers["content-security-policy"], undefined, "a kit file: no frame rule");
const font = await ask("/vendor/katex/fonts/KaTeX_Main-Regular.woff2");
assert.deepEqual([font.status, font.headers["content-type"]], [200, "font/woff2"]);
const picture = await ask(`/__gallery/edit/asset/${slug}/assets/a.png`);
assert.deepEqual([picture.status, picture.headers["content-type"]], [200, "image/png"]);
// Nothing else: 404; a path out of its folder refused, never resolved (encoded, dotted, a backslash, a drive).
for (const pathname of ["/nope", "/generated/none.html", "/kit/none.js", "/assets/", "/kit/..%2fpackage.json", "/kit/%2e%2e/%2e%2e/package.json", "/vendor/..%5c..%5cpackage.json","/kit/C:%2fWindows%2fwin.ini", "/kit/runtime.js%00.css"]) {
  assert.equal((await ask(pathname)).status, 404, pathname);
}
// A backslash is a "/" to the URL (it is made canonical before the route reads it): never out of the folders.
assert.equal((await ask("/assets/..\\..\\..\\package.json")).status, 404);
assert.equal(fileIn(web, "..%2findex.html"), null);
assert.equal(fileIn(web, "%2e%2e/index.html"), null);
assert.equal(fileIn(web, "a/../../index.html"), null);
assert.equal(fileIn(web, "a\\b"), null);
assert.equal(fileIn(web, "c:"), null);
assert.equal(fileIn(web, "assets/app-1.js"), path.join(web, "assets", "app-1.js"));
// Another host (a page elsewhere whose name resolves to this machine): 403, before anything.
for (const pathname of ["/", `/generated/${slug}.html`, `/__gallery/edit/asset/${slug}/assets/a.png`, "/kit/runtime.js", "/__gallery/workspace/info"]) {
  assert.equal((await ask(pathname, { host: `evil.example:${port}` })).status, 403, pathname);
}
assert.equal((await ask(`/generated/${slug}.html`, { host: `localhost:${port}` })).status, 200, "localhost:<port> is this server too");
// The workbench by that name is sent to 127.0.0.1, the origin Gallery's servers vouch for to show their drafts (routes.mjs toLoopback).
const byName = await ask("/?a=1", { host: `localhost:${port}` });
assert.deepEqual([byName.status, byName.headers.location, byName.headers["cache-control"]], [302, `http://127.0.0.1:${port}/?a=1`, "no-store"], "the workbench at localhost: sent to 127.0.0.1");

// Its announcement while it runs: this process, kind cli.
const announcement = JSON.parse(fs.readFileSync(path.join(process.env.GALLERY_DATA_DIR, "server.json"), "utf8"));
assert.deepEqual([announcement.port, announcement.pid, announcement.kind], [port, process.pid, "cli"]);

// A page's event stream: told of its document's change through the watcher, once the file has settled.
const heard = [];
const events = http.get({ host: "127.0.0.1", port, path: `/__gallery/events?slug=${slug}`, headers: { host: `127.0.0.1:${port}` } }, (response) => {
  assert.equal(response.headers["content-type"], "text/event-stream");
  response.setEncoding("utf8");
  response.on("data", (text) => heard.push(text));
});
events.on("error", () => {});
await until(() => heard.join("").includes("retry: 3000"), "the stream opened");
fs.writeFileSync(path.join(folder, "doc.html"), page("另一段话。"));
await until(() => /data: report [a-f0-9]+/.test(heard.join("")), "the page told of its change");
assert.ok((await ask(`/generated/${slug}.html`)).body.includes("另一段话。"));

// The stream says the catalog's stamp as it opens, and a package written is heard through the watcher
// once it stands still: told to every page, its page made again. The same bytes again tell nothing.
{
  const stamps = () => [...heard.join("").matchAll(/data: components ([a-f0-9]{16})/g)].map((found) => found[1]);
  assert.equal(stamps().length, 1, "said as the stream opened");
  const pack = path.join(reportsDirectory, "components", "local", "watched");
  const text = JSON.stringify({ id: "local/watched", apiVersion: 1, version: "1.0.0", name: { zh: "件", en: "Piece" }, description: { zh: "件", en: "Piece" }, parts: {} });
  fs.mkdirSync(pack, { recursive: true });
  fs.writeFileSync(path.join(pack, "component.json"), text);
  await until(() => stamps().length === 2, "the page told of the package");
  assert.notEqual(stamps()[1], stamps()[0]);
  assert.ok((await ask(`/generated/${slug}.html`)).body.includes('DocKit.describe({"id":"local/watched"'), "its page made again");
  fs.writeFileSync(path.join(pack, "component.json"), text);
  fs.rmSync(path.join(reportsDirectory, "components", "local"), { recursive: true }); // the home page's blocks of Gallery's own stay
  await until(() => stamps().length === 3, "and of it gone");
  assert.equal(stamps()[2], stamps()[0], "the catalog as it was");
}

// POST stop: checked as any change (the token), then answered; the server closes with the page's stream open, its announcement gone.
const info = JSON.parse((await ask("/__gallery/workspace/info")).body);
// A file uploaded and never imported: kept in the server's own folder of the system's temporary one
// (the test gives this process a temporary folder of its own), which goes when the server stops.
const uploadFolders = () => fs.readdirSync(tmpdir()).filter((name) => name.startsWith("gallery-uploads-"));
const uploaded = await ask("/__gallery/transfer/upload?name=notes.md", { method: "POST", headers: { origin: `http://127.0.0.1:${port}`, "x-gallery-token": info.token, "content-type": "application/octet-stream" }, body: "# 笔记\n" });
assert.equal(uploaded.status, 200, uploaded.body);
assert.equal(uploadFolders().length, 1, "the upload kept in the server's own folder");
const stop = (token) => ask("/__gallery/workspace/stop", { method: "POST", headers: { origin: `http://127.0.0.1:${port}`, "x-gallery-token": token, "content-type": "application/json" }, body: "{}" });
assert.equal((await stop("wrong")).status, 403);
const stopping = Date.now();
assert.equal((await stop(info.token)).status, 200);
await until(() => exited === 1, "the process ended", 4000);
assert.ok(Date.now() - stopping < 2000, `stopped in ${Date.now() - stopping} ms with an event stream open`);
assert.equal(fs.existsSync(path.join(process.env.GALLERY_DATA_DIR, "server.json")), false, "its announcement taken away");
assert.deepEqual(uploadFolders(), [], "its uploads' folder removed, with the upload never imported");
assert.equal(fs.readFileSync(path.join(process.env.GALLERY_DATA_DIR, "last-port"), "utf8").trim(), String(port), "its port kept as the workspace's last");
events.destroy();

// The watcher one folder at a time (Linux's way): the root, each document and its assets/, the
// 写作偏好 page's; a new document's folder watched once it is there; .gallery/'s own never told.
{
  const told = [];
  const watcher = watchWorkspace(reportsDirectory, (event, file) => told.push([event, path.relative(reportsDirectory, file)]), { folders: true });
  const folders = () => watcher.folders.map((name) => path.relative(reportsDirectory, name)).sort();
  // The default home page's folder and its blocks' (made as the server started) among them.
  const blocks = HOME_CARDS.map((id) => path.join("components", ...id.split("/")));
  assert.deepEqual(folders(), ["", ".gallery", "components", path.join("components", "gallery"), ...blocks, "demo", path.join("demo", "assets"), "pages", path.join("pages", "home")].sort());
  fs.writeFileSync(path.join(folder, "doc.html"), page("第三段话。"));
  await until(() => told.some(([event, file]) => event !== "unlink" && file === path.join("demo", "doc.html")), "a document's file written");
  fs.mkdirSync(path.join(reportsDirectory, "other", "assets"), { recursive: true });
  await until(() => folders().includes(path.join("other", "assets")), "a new document's folders watched");
  fs.writeFileSync(path.join(reportsDirectory, "other", "doc.html"), page("新的。"));
  await until(() => told.some(([, file]) => file === path.join("other", "doc.html")), "the new document's file written");
  fs.mkdirSync(path.join(reportsDirectory, ".gallery", "pages", "writing-preferences"), { recursive: true });
  fs.writeFileSync(path.join(reportsDirectory, ".gallery", "state", "x.json"), "{}");
  await until(() => folders().includes(path.join(".gallery", "pages", "writing-preferences")), "the 写作偏好 page's folder watched");
  fs.writeFileSync(path.join(reportsDirectory, ".gallery", "pages", "writing-preferences", "doc.html"), page("偏好。"));
  await until(() => told.some(([, file]) => file === path.join(".gallery", "pages", "writing-preferences", "doc.html")), "the page's file written");
  assert.ok(!told.some(([, file]) => file.startsWith(path.join(".gallery", "state"))), "Gallery's own state never told");
  fs.rmSync(path.join(reportsDirectory, "other"), { recursive: true, force: true });
  await until(() => !folders().includes("other"), "a document's folder removed: no longer watched");
  // components/ all the way down, a folder at a time, whatever each is yet.
  const packed = path.join("components", "local", "new-one");
  fs.mkdirSync(path.join(reportsDirectory, packed, "images"), { recursive: true });
  await until(() => folders().includes(path.join(packed, "images")), "a package's folders watched as they come");
  fs.writeFileSync(path.join(reportsDirectory, packed, "component.json"), "{}");
  await until(() => told.some(([, file]) => file === path.join(packed, "component.json")), "a package's file written");
  fs.rmSync(path.join(reportsDirectory, "components"), { recursive: true, force: true });
  await until(() => !folders().includes("components"), "gone: no longer watched");
  watcher.close();
}

fs.rmSync(web, { recursive: true, force: true });
console.log("production server checked");
