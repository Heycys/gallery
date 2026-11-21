import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync } from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { ASSETS, publicFileOf } from "../../../src/render/assets.mjs";
import { fileStamp } from "../../../src/render/media-ref.mjs";
import { writeSharedAssets } from "../../../src/render/pipeline.mjs";
import { createRoutes } from "../../../src/server/routes.mjs";
import { keepCatalog, readCatalog } from "../../../src/shared/component-catalog.mjs";
import { packageScript } from "../../../src/shared/export-wrap.mjs";
import { reportsDirectory } from "../../../src/shared/paths.mjs";
import { listReportSlugs } from "../../../src/shared/reports.mjs";

// Run by tests/unit/routes.mjs in a workspace of its own (GALLERY_WORKSPACE): a report's page as the
// preview server keeps it (src/server/page-cache.mjs). The same text under the same stamps is the
// same page, served again; a file put in the report's folder or taken out makes it again at once (the
// folder's time is in its key), and one the folder's time does not show (it was set back here, as a
// picture written again in place leaves it) once the watcher tells of it. The page imports the editor
// and loads the kit's files under their stamps (src/server/stamps.mjs), and the server answers those
// for good.

// The kit's public files, as npm run dev:local has them (its predev builds them).
if (!ASSETS.every((asset) => fs.existsSync(publicFileOf(asset)))) await writeSharedAssets();

const slug = "demo";
const folder = path.join(reportsDirectory, slug);
const assets = path.join(folder, "assets");
fs.mkdirSync(assets, { recursive: true });
fs.writeFileSync(path.join(assets, "b.png"), "not a picture");
fs.writeFileSync(path.join(folder, "report.html"), `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Demo</title>
</head>
<body>
  <main class="doc-page" data-doc-id="${slug}" aria-label="Demo">
    <p>一段话。</p>
    <figure class="doc-image"><img src="assets/a.png" alt=""><figcaption>图</figcaption></figure>
  </main>
</body>
</html>
`);
// The folder's times fixed, so that a file written in place below leaves them as they were.
const then = new Date("2020-01-01T00:00:00Z");
const setBack = () => [folder, assets].forEach((directory) => fs.utimesSync(directory, then, then));
setBack();

const routes = createRoutes({ stateDirectory: mkdtempSync(path.join(tmpdir(), "preview-pages-state-")), logger: { warn() {}, error() {}, info() {} } });
const watched = routes.changed; // what the watcher tells (Vite's, or the release server's: src/server/watch.mjs)

function ask(url, sent = {}) {
  return new Promise((resolve, reject) => {
    const headers = new Map();
    const response = {
      statusCode: 200,
      setHeader: (name, value) => headers.set(name.toLowerCase(), value),
      end(body) {
        resolve({ status: this.statusCode, headers, body: body === undefined ? undefined : String(body), passed: false });
      },
    };
    routes.handle({ url, method: "GET", headers: { host: "127.0.0.1:4999", ...sent }, socket: { localPort: 4999 } }, response, (error) => (error ? reject(error) : resolve({ status: null, headers, body: null, passed: true })));
  });
}

const missing = (page) => page.includes("assets/a.png is not in the document's folder");
const first = await ask(`/generated/${slug}.html`);
assert.equal(first.status, 200);
assert.equal(first.headers.get("cache-control"), "no-store", "the page itself is never kept by the browser");
assert.ok(missing(first.body), "the checks say the picture is missing");
const [, stamp] = first.body.match(/import\("\/__gallery\/edit\/v\/([a-f0-9]{16})\/src\/editor\/page\/editor\.mjs"\)/) ?? [];
assert.ok(stamp, "the page imports the editor under its modules' stamp");
assert.match(first.body, /<script src="\/kit\/runtime\.js\?v=[a-f0-9]{16}" data-doc-kit="runtime"><\/script>/, "the kit's tags load their files under their stamps");
assert.match(first.body, /<link rel="stylesheet" href="\/kit\/report\.css\?v=[a-f0-9]{16}" data-doc-kit="styles">/);
assert.equal((await ask(`/generated/${slug}.html`)).body, first.body, "asked again, the same page");
const present = await ask(`/generated/${slug}.html?present`);
assert.ok(!present.body.includes("/__gallery/edit/v/") && present.body.includes("data-doc-present"), "the presented page is kept apart, with no editor");

// A link between two documents as a browser reads it (../doc/doc.html, ../report/report.html): the
// document's page, a redirect that the document route never comes to, so that documents called doc
// and report open as any other, and a folder called generated is none (shared/workspace.mjs RESERVED).
const page = (name) => fs.readFileSync(path.join(folder, "report.html"), "utf8").replaceAll(slug, name).replace("一段话。", `${name} 的一段话。`);
for (const name of ["doc", "report", "generated"]) {
  fs.mkdirSync(path.join(reportsDirectory, name));
  fs.writeFileSync(path.join(reportsDirectory, name, name === "report" ? "report.html" : "doc.html"), page(name));
}
for (const name of ["doc", "report"]) {
  const shown = await ask(`/generated/${name}.html`);
  assert.ok(shown.status === 200 && shown.body.includes(`${name} 的一段话。`), `the document called ${name} opens at its page`);
}
for (const [asked, to] of [["/doc/doc.html", "/generated/doc.html"], ["/report/report.html", "/generated/report.html"], ["/report/doc.html", "/generated/report.html"], ["/demo/doc.html?present", "/generated/demo.html?present"]]) {
  const answer = await ask(asked);
  assert.equal(answer.status, 302, asked);
  assert.equal(answer.headers.get("location"), to, asked);
  assert.equal(answer.headers.get("cache-control"), "no-store", asked);
}
for (const none of ["/no-such/doc.html", "/generated/doc", "/a/b/doc.html", "/a--b/doc.html", "/exports/doc.html"]) assert.equal((await ask(none)).passed, true, `${none}: no document there`);
assert.ok(fs.existsSync(path.join(reportsDirectory, "generated", "doc.html")) && !(await listReportSlugs()).includes("generated"), "a folder called generated stays on disk and is no document: no sidebar, no gallery list");
assert.ok((await ask("/generated/doc.html")).body.includes("doc 的一段话。"), "../generated/doc.html is the document called doc, whatever a folder called generated holds");

// The picture written with the folder's times set back: the page kept is served still, until the
// watcher tells of it.
fs.writeFileSync(path.join(assets, "a.png"), "not a picture either");
setBack();
assert.equal((await ask(`/generated/${slug}.html`)).body, first.body, "a change the key does not show: the page kept");
watched("add", path.join(assets, "a.png"));
const told = await ask(`/generated/${slug}.html`);
assert.ok(!missing(told.body), "once the watcher tells of it, the page is made again: the picture is there");
// Taken out, the folder's time says so at once, before any watcher.
fs.rmSync(path.join(assets, "a.png"));
assert.ok(missing((await ask(`/generated/${slug}.html`)).body), "a file taken out: made again at once");
// The report's own text is in the key: a page of another text.
fs.writeFileSync(path.join(folder, "report.html"), fs.readFileSync(path.join(folder, "report.html"), "utf8").replace("一段话。", "另一段话。"));
assert.ok((await ask(`/generated/${slug}.html`)).body.includes("另一段话。"), "the file changed: its new text");

// The catalog of component packages is in the key: as the server takes a new one the page is made
// again, told of it and under a stamp of its own.
{
  const before = await ask(`/generated/${slug}.html`);
  assert.equal((await ask(`/generated/${slug}.html`)).body, before.body, "the same catalog: the page kept");
  const manifest = path.join(reportsDirectory, "components", "local", "kept");
  fs.mkdirSync(manifest, { recursive: true });
  fs.writeFileSync(path.join(manifest, "component.json"), JSON.stringify({ id: "local/kept", apiVersion: 1, version: "1.0.0", name: { zh: "件", en: "Piece" }, description: { zh: "件", en: "Piece" }, parts: {} }));
  assert.equal((await ask(`/generated/${slug}.html`)).body, before.body, "the page kept until the server takes it");
  const catalog = readCatalog(reportsDirectory);
  keepCatalog(reportsDirectory, catalog);
  const after = await ask(`/generated/${slug}.html`);
  assert.notEqual(after.body, before.body);
  assert.ok(after.body.includes('DocKit.describe({"id":"local/kept"'), "the kit told of it");
  assert.ok(after.body.includes(`let catalog = "${catalog.stamp}"`), "and the page knows the catalog it shows");

  // The route of a package's files: what its manifest allows and nothing else of its folder, under
  // its stamp for good, by its path alone never.
  const served = path.join(reportsDirectory, "components", "local", "served");
  fs.mkdirSync(path.join(served, "images"), { recursive: true });
  fs.mkdirSync(path.join(served, "lib"));
  const write = (name, text) => fs.writeFileSync(path.join(served, name), text);
  write("component.json", JSON.stringify({ id: "local/served", apiVersion: 1, version: "1.0.0", name: { zh: "件", en: "Piece" }, description: { zh: "件", en: "Piece" }, parts: {}, assets: ["charts", "images/a.png", "data.json", "lib/a.mjs", "lib/b.wasm"] }));
  for (const name of ["kit.js", "style.css", "preview-light.webp", "preview.svg", "template.html", "example.html", "writing.md", "images/a.png", "images/secret.png", "data.json", "lib/a.mjs", "lib/b.wasm"]) write(name, `${name} 的内容`);
  fs.writeFileSync(path.join(reportsDirectory, "components", "local", "secret.txt"), "beside it");
  keepCatalog(reportsDirectory, readCatalog(reportsDirectory));
  const { stamp: packageStamp } = readCatalog(reportsDirectory).packages.get("local/served");
  const at = "/__gallery/components/local/served";
  const KEPT = "max-age=31536000, immutable";
  for (const [file, type] of [["kit.js", "text/javascript; charset=utf-8"], ["style.css", "text/css; charset=utf-8"], ["preview-light.webp", "image/webp"], ["images/a.png", "image/png"], ["data.json", "application/json"], ["lib/a.mjs", "text/javascript; charset=utf-8"], ["lib/b.wasm", "application/wasm"]]) {
    const kept = await ask(`${at}/${file}?v=${packageStamp}`);
    assert.deepEqual([kept.status, kept.body, kept.headers.get("content-type"), kept.headers.get("cache-control"), kept.headers.get("x-content-type-options")], [200, file === "kit.js" ? packageScript(`${file} 的内容`) : `${file} 的内容`, type, KEPT, "nosniff"], file);
    assert.equal((await ask(`${at}/${file}`)).headers.get("cache-control"), "no-store", `${file}: by its path alone it is asked again`);
    assert.equal((await ask(`${at}/${file}?v=0123456789abcdef`)).headers.get("cache-control"), "no-store", `${file}: another stamp is no name for it`);
  }
  // The disk is looked at for a stamp a page can hold, and for no other: the package's files, however
  // large, are not gone through for a request by its path.
  const realStat = fs.statSync;
  let looked = 0;
  fs.statSync = (file, ...rest) => {
    if (String(file).includes("served")) looked++;
    return realStat(file, ...rest);
  };
  syncBuiltinESMExports();
  try {
    await ask(`${at}/kit.js`);
    await ask(`${at}/kit.js?v=0123456789abcdef`);
    assert.equal(looked, 0, "by its path alone, or under another stamp");
    await ask(`${at}/kit.js?v=${packageStamp}`);
    assert.ok(looked > 0, "under its own");
  } finally {
    fs.statSync = realStat;
    syncBuiltinESMExports();
  }
  // Nothing else, however it is spelled: what stays in the folder, what stands out of it, another
  // case, an encoded way out of it, a backslash, a colon, a dot or a space at the end of a name.
  // (What a URL itself reads as a path of the route, a backslash as a slash and dots taken out, is that path.)
  for (const [url, same] of [[`${at}/images\\a.png`, `${at}/images/a.png`], [`${at}/images/%2e%2e/kit.js`, `${at}/kit.js`]]) assert.equal(new URL(url, "http://localhost").pathname, same);
  for (const url of [
    `${at}/component.json`, `${at}/template.html`, `${at}/example.html`, `${at}/writing.md`, `${at}/images/secret.png`, `${at}/`, at,
    // The drawing a menu showed until 2026-11-17 (its pictures are the two WebPs now, component-catalog.mjs SERVED).
    `${at}/preview.svg`,
    "/__gallery/components/local/secret.txt", "/__gallery/components/", "/__gallery/components/local/gone/kit.js",
    `${at}/KIT.JS`, `${at}/Kit.js`, "/__gallery/components/LOCAL/served/kit.js", "/__gallery/components/local/Served/kit.js",
    `${at}/kit.js.`, `${at}/kit.js%20`, `${at}/kit.js::$DATA`, `${at}/kit.js%3A%3A$DATA`, `${at}/kit.js:stream`, `${at}/kit.js%00`,
    `${at}/images%2Fa.png`, `${at}/images%5Ca.png`, `${at}/images/..%2Fkit.js`, `${at}/..%5Csecret.txt`,
    `${at}/%2e%2e%2f..%2f..%2fgallery.json`, "/__gallery/components/local%2Fserved/kit.js", "/__gallery/components/local/served%2Fkit.js", "/__gallery/components/..%2F..%2Fgallery.json",
  ]) {
    const answer = await ask(url);
    const normal = new URL(url, "http://localhost").pathname;
    if (normal.startsWith("/__gallery/components/")) assert.deepEqual([answer.status, answer.passed], [404, false], `${url}: no file, and no one else's to answer`);
    else assert.ok(!(answer.body ?? "").includes("的内容"), `${url}: the address leaves the route`);
  }
  // A package with a problem gives nothing; a package changed answers as the disk does, and a file
  // of a package written a moment ago is kept under no stamp the server has not taken.
  write("kit.js", "written since");
  const since = await ask(`${at}/kit.js?v=${packageStamp}`);
  assert.deepEqual([since.body, since.headers.get("cache-control")], [packageScript("written since"), "no-store"], "the disk, under the stamp of no such bytes: not kept");
  // A link out of the folder, made after the package loaded, is no file of it.
  const outside = path.join(reportsDirectory, "outside");
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "a.png"), "out of the folder");
  fs.rmSync(path.join(served, "images"), { recursive: true });
  fs.symlinkSync(outside, path.join(served, "images"), "junction");
  assert.equal((await ask(`${at}/images/a.png`)).status, 404, "a junction or a link out of the folder");
  fs.rmSync(path.join(served, "images"), { recursive: true });
  fs.rmSync(outside, { recursive: true });
  write("component.json", "{ id: ");
  keepCatalog(reportsDirectory, readCatalog(reportsDirectory));
  assert.equal((await ask(`${at}/kit.js`)).status, 404, "a package that does not load gives nothing");

  // It says why in the server's log as the server starts and as it comes, there being no instance
  // of it to say so, and a page connecting hears the catalog, then which package changed.
  const logged = [];
  const second = createRoutes({ stateDirectory: mkdtempSync(path.join(tmpdir(), "preview-pages-state-")), logger: { warn: (text) => logged.push(text), error() {}, info() {} } });
  assert.match(logged.join("\n"), /\[gallery\] custom block local\/served does not load: component\.json is not JSON: /);
  const stream = [];
  second.handle({ url: `/__gallery/events?slug=${slug}`, method: "GET", headers: { host: "127.0.0.1:4999" }, socket: { localPort: 4999 }, on() {} }, { end() {}, writeHead() {}, write: (text) => stream.push(text) }, () => {});
  assert.deepEqual(stream.slice(1), [`data: components ${readCatalog(reportsDirectory).stamp}\n\n`, "data: settings       \n\n"], "connecting: no ids, as what it missed is not known, and what is hidden, disabled, shown, allowed online, unlisted, off as packs and listed now; no file of its folder written again while this server ran, no stamp");
  write("kit.js", "written again");
  write("component.json", "{ id: 1");
  logged.length = 0;
  second.changed("change", path.join(served, "component.json"));
  for (const begun = Date.now(); stream.length < 5; await new Promise((resolve) => setTimeout(resolve, 50))) assert.ok(Date.now() - begun < 8000, "the catalog taken");
  assert.equal(stream[3], `data: components ${readCatalog(reportsDirectory).stamp} local/served\n\n`, "told with the package that changed");
  assert.match(logged.join("\n"), /custom block local\/served does not load: component\.json is not JSON: /, "what changed of it logged anew");
  await second.close();

  // One turned off is as the reader asked, and the log has no word of it, as the server starts or as it comes.
  const marker = path.join(reportsDirectory, "gallery.json");
  write("component.json", JSON.stringify({ id: "local/served", apiVersion: 1, version: "1.0.0", name: { zh: "件", en: "Piece" }, description: { zh: "一件", en: "A piece" }, parts: {} }));
  fs.writeFileSync(marker, JSON.stringify({ gallery: "workspace", version: 1, components: { disabled: ["local/served"] } }));
  keepCatalog(reportsDirectory, readCatalog(reportsDirectory));
  logged.length = 0;
  const third = createRoutes({ stateDirectory: mkdtempSync(path.join(tmpdir(), "preview-pages-state-")), logger: { warn: (text) => logged.push(text), error() {}, info() {} } });
  assert.deepEqual(logged, [], "a package off is no package that does not load, to the log");
  await third.close();
  fs.rmSync(marker);

  fs.rmSync(path.join(reportsDirectory, "components"), { recursive: true });
  keepCatalog(reportsDirectory, readCatalog(reportsDirectory));
}

// A file of the document's folder written again (src/server/asset-news.mjs): a page open is told its stamp once it
// is quiet, a page that connects after is told it too (what was told while this server ran, no file looked at), and
// a file taken away is forgotten there. A page icon's picture of the folder answers 304 while it did not change.
{
  const connect = () => {
    const heard = [];
    routes.handle({ url: `/__gallery/events?slug=${slug}`, method: "GET", headers: { host: "127.0.0.1:4999" }, socket: { localPort: 4999 }, on() {} }, { end() {}, writeHead() {}, write: (text) => heard.push(text) }, () => {});
    return heard;
  };
  const told = (heard) => heard.filter((text) => text.startsWith("data: asset "));
  const until = async (done, what) => {
    for (const begun = Date.now(); !done(); await new Promise((resolve) => setTimeout(resolve, 50))) assert.ok(Date.now() - begun < 8000, what);
  };
  const open = connect();
  assert.deepEqual(told(open), [], "nothing written again yet: no stamp as it connects");
  const shot = path.join(assets, "b.png");
  fs.writeFileSync(shot, "written again");
  watched("change", shot);
  await until(() => told(open).length > 0, "the page open told");
  assert.deepEqual(told(open), [`data: asset new assets/b.png=${fileStamp(shot)}\n\n`]);
  assert.deepEqual(told(connect()), [`data: asset now assets/b.png=${fileStamp(shot)}\n\n`], "a page connecting after: told what was told");
  // Its picture as a page icon: tagged by its stamp, 304 while the browser holds it, sent again once it changed.
  const iconAt = `/__gallery/edit/icon?value=assets/b.png&slug=${slug}`;
  const icon = await ask(iconAt);
  assert.deepEqual([icon.status, icon.headers.get("etag"), icon.headers.get("cache-control"), icon.body], [200, `"${fileStamp(shot)}"`, "no-cache", "written again"]);
  assert.equal((await ask(iconAt, { "if-none-match": icon.headers.get("etag") })).status, 304, "held: not sent again");
  await new Promise((resolve) => setTimeout(resolve, 20));
  fs.writeFileSync(shot, "written once more");
  assert.deepEqual(await ask(iconAt, { "if-none-match": icon.headers.get("etag") }).then(({ status, body }) => [status, body]), [200, "written once more"], "changed: the new bytes");
  assert.equal((await ask(`/__gallery/edit/icon?value=assets/b.png&slug=a--b`)).status, 404, "no document's slug: none");
  // Taken away: no word to the page, forgotten for the next.
  fs.rmSync(shot);
  watched("unlink", shot);
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(told(open).length, 1, "taken away: nothing told");
  assert.deepEqual(told(connect()), [], "and forgotten for a page that connects");
  fs.writeFileSync(shot, "not a picture");
}

// The editor's modules and the kit's files under a stamp: kept by the browser for good.
const module = await ask(`/__gallery/edit/v/${stamp}/src/editor/page/editor.mjs`);
assert.equal(module.status, 200);
assert.equal(module.headers.get("cache-control"), "max-age=31536000, immutable");
assert.equal(module.headers.get("content-type"), "text/javascript; charset=utf-8");
const runtime = await ask(first.body.match(/\/kit\/runtime\.js\?v=[a-f0-9]{16}/)[0]);
assert.equal(runtime.headers.get("cache-control"), "max-age=31536000, immutable");
assert.equal(runtime.headers.get("content-type"), "text/javascript; charset=utf-8");
const styles = await ask(first.body.match(/\/kit\/report\.css\?v=[a-f0-9]{16}/)[0]);
assert.equal(styles.headers.get("content-type"), "text/css; charset=utf-8");
assert.equal((await ask("/kit/runtime.js")).passed, true, "by its path alone, a kit file is the host's (Vite's public/, the release's static files)");
assert.equal((await ask("/kit/none.js?v=0123456789abcdef")).passed, true, "no kit file of that name: not this route's");

await routes.close();
console.log("preview pages checked");
