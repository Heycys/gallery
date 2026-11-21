import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { JSDOM } from "jsdom";
import { followFiles, stampedUrl, swapFiles } from "../../src/editor/page/assets-live.mjs";
import { embedImages } from "../../src/render/images.mjs";
import { fileStamp, servedStamps, servedUrl } from "../../src/render/media-ref.mjs";
import { mentionOf } from "../../src/editor/page/core.mjs";
import { createAssetNews, lookAt, wholePicture } from "../../src/server/asset-news.mjs";
import { serveMedia } from "../../src/server/media-route.mjs";

// A file of a document's folder written again under its name (feedback of 2026-11-17: an Agent's picture
// copied over assets/shot.png went on showing the old one in the open page): the preview names each file by its
// stamp (render/media-ref.mjs), answers a page that holds those bytes 304 (server/media-route.mjs), tells the
// pages open of a file once it is whole and quiet (server/asset-news.mjs), and a page swaps the addresses it
// shows the file by (editor/page/assets-live.mjs). The browser's side is the scenario agentReplacesPicture.

const root = await fs.mkdtemp(path.join(os.tmpdir(), "written-files-"));
const folder = path.join(root, "alpha");
await fs.mkdir(path.join(folder, "assets"), { recursive: true });
await fs.writeFile(path.join(folder, "doc.html"), "<main></main>");
const at = (name) => path.join(folder, "assets", name);
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A PNG of one colour: whole, or cut short as a tool writing it in pieces leaves it.
function png(width, height, [r, g, b], { noise = false } = {}) {
  const chunk = (type, data) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type), data])));
    return Buffer.concat([head, Buffer.from(type), data, tail]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set(noise ? [(x * 7919 + y * 104729) % 251, (x * y * 31) % 241, (x + y * 13) % 239] : [r, g, b], y * (width * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

// ---------- the stamp ----------
await fs.writeFile(at("shot.png"), png(4, 4, [200, 0, 0]));
const first = fileStamp(at("shot.png"));
assert.match(first, /^[0-9a-f]{12}$/);
assert.equal(fileStamp(at("shot.png")), first, "the same file, the same stamp");
assert.equal(fileStamp(at("missing.png")), null);
assert.equal(servedUrl("asset", "alpha", "assets/shot.png", folder), `/__gallery/edit/asset/alpha/assets/shot.png?v=${first}`);
assert.equal(servedUrl("asset", "alpha", "assets/missing.png", folder), "/__gallery/edit/asset/alpha/assets/missing.png", "no file: no stamp");
assert.equal(servedUrl("asset", "alpha", "assets/shot.png", null), "/__gallery/edit/asset/alpha/assets/shot.png", "no folder: no stamp");
// Written again with other bytes of the same size, and by a copy that keeps the time of the file it copies.
await pause(20);
await fs.writeFile(at("shot.png"), png(4, 4, [0, 0, 200]));
const second = fileStamp(at("shot.png"));
assert.notEqual(second, first, "written again in place: a new stamp");
await fs.writeFile(at("other.png"), png(4, 4, [0, 200, 0]));
const old = new Date(2020, 0, 1);
await fs.utimes(at("other.png"), old, old);
await fs.utimes(at("shot.png"), old, old);
const touched = fileStamp(at("shot.png"));
await fs.copyFile(at("other.png"), at("shot.png"));
assert.equal((await fs.stat(at("shot.png"))).size, (await fs.stat(at("other.png"))).size);
assert.notEqual(fileStamp(at("shot.png")), touched, "a copy of the same size and modification time over it: a new stamp all the same");
// The preview names a picture by it; an export holds the bytes.
const figure = '<figure class="doc-image"><img src="assets/shot.png" alt=""><figcaption></figcaption></figure>';
assert.ok(embedImages(figure, { slug: "alpha", mode: "preview", reportsDirectory: root }).includes(`src="/__gallery/edit/asset/alpha/assets/shot.png?v=${fileStamp(at("shot.png"))}" data-ge-src="assets/shot.png"`));
assert.ok(embedImages(figure, { slug: "alpha", mode: "export", reportsDirectory: root }).includes(`data:image/png;base64,${(await fs.readFile(at("other.png"))).toString("base64")}`), "an export embeds the bytes the file has now");
// The stamps a page as rendered names its files by, read off it: every route's, the last of a file's, none of another
// document's, of no stamp, of a longer stamp or of a name the preview serves none by.
const rendered = `${embedImages(figure, { slug: "alpha", mode: "preview", reportsDirectory: root })}
  <a href="/__gallery/edit/file/alpha/assets/report.pdf?v=aaaaaaaaaaaa">pdf</a>
  <iframe src="/__gallery/edit/embed/alpha/assets/page.html?v=bbbbbbbbbbbb#x"></iframe>
  <img src="/__gallery/edit/asset/beta/assets/shot.png?v=cccccccccccc">
  <img src="/__gallery/edit/asset/alpha/assets/bare.png">
  <img src="/__gallery/edit/asset/alpha/assets/long.png?v=dddddddddddddd">
  <img src="/__gallery/edit/asset/alpha/assets/.hidden.png?v=eeeeeeeeeeee">`;
assert.deepEqual(servedStamps(rendered, "alpha"), { "assets/shot.png": fileStamp(at("shot.png")), "assets/report.pdf": "aaaaaaaaaaaa", "assets/page.html": "bbbbbbbbbbbb" });
assert.deepEqual(servedStamps("<main></main>", "alpha"), {});

// ---------- what the route answers ----------
const answer = async (pathname, headers = {}) => {
  const sent = { headers: {}, statusCode: 0, body: null };
  await serveMedia(pathname, { setHeader: (name, value) => { sent.headers[name] = value; }, set statusCode(code) { sent.statusCode = code; }, end: (body) => { sent.body = body ?? null; } }, { reportsDirectory: root, request: { headers } });
  return sent;
};
const sent = await answer("/__gallery/edit/asset/alpha/assets/shot.png");
assert.deepEqual([sent.statusCode, sent.headers.ETag, sent.headers["Cache-Control"]], [200, `"${fileStamp(at("shot.png"))}"`, "no-cache"], "the file, its stamp its tag");
assert.deepEqual((await answer(`/__gallery/edit/asset/alpha/assets/shot.png?v=${fileStamp(at("shot.png"))}`.split("?")[0], { "if-none-match": sent.headers.ETag })).statusCode, 304, "held already: not sent again");
assert.deepEqual((await answer("/__gallery/edit/asset/alpha/assets/shot.png", { "if-none-match": `"aaaaaaaaaaaa", ${sent.headers.ETag}` })).statusCode, 304, "one of several tags");
await pause(20);
await fs.writeFile(at("shot.png"), png(4, 4, [9, 9, 9]));
const again = await answer("/__gallery/edit/asset/alpha/assets/shot.png", { "if-none-match": sent.headers.ETag });
assert.deepEqual([again.statusCode, again.body?.equals(png(4, 4, [9, 9, 9]))], [200, true], "written again: the new bytes, whatever the browser holds");
assert.equal((await answer("/__gallery/edit/file/alpha/assets/shot.png")).headers.ETag, `"${fileStamp(at("shot.png"))}"`, "a file block's file too");

// ---------- whole, by its own format ----------
const whole = (bytes, name = "x.png") => wholePicture(bytes.subarray(0, 16), bytes.subarray(-1024), bytes.length, name);
const picture = png(40, 40, [1, 2, 3]);
assert.equal(whole(picture), true);
assert.equal(whole(picture.subarray(0, picture.length - 10)), false, "a PNG cut short");
assert.equal(whole(Buffer.alloc(0)), false, "an empty file");
const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7), Buffer.from([0xff, 0xd9])]);
assert.deepEqual([whole(jpeg, "x.jpg"), whole(jpeg.subarray(0, 1500), "x.jpg")], [true, false]);
assert.equal(whole(jpeg, "x.png"), true, "a JPEG under a .png name, read by its bytes");
const gif = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(30, 1), Buffer.from([0x3b])]);
assert.deepEqual([whole(gif, "x.gif"), whole(gif.subarray(0, 20), "x.gif")], [true, false]);
const webp = Buffer.concat([Buffer.from("RIFF"), Buffer.from([32, 0, 0, 0]), Buffer.from("WEBP"), Buffer.alloc(28, 5)]);
assert.deepEqual([whole(webp, "x.webp"), whole(webp.subarray(0, 30), "x.webp")], [true, false]);
assert.deepEqual([whole(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>\n'), "x.svg"), whole(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect'), "x.svg")], [true, false]);
assert.equal(whole(Buffer.from("%PDF-1.7 …"), "x.pdf"), true, "a format of no end it says: whole");
assert.deepEqual(await lookAt(at("shot.png")), { stamp: fileStamp(at("shot.png")), whole: true });
assert.equal(await lookAt(at("missing.png")), null);

// ---------- the news ----------
{
  const told = [];
  const news = createAssetNews({ tell: (key, file, stamp) => told.push([key, file, stamp]), quiet: 40, patience: 600 });
  // Written in pieces: told once, whole, after the last.
  const bytes = png(60, 60, [5, 6, 7], { noise: true });
  assert.ok(bytes.length > 2000);
  await fs.writeFile(at("slow.png"), bytes.subarray(0, 100));
  news("alpha", at("slow.png"), "assets/slow.png");
  await pause(20);
  await fs.appendFile(at("slow.png"), bytes.subarray(100, 200));
  news("alpha", at("slow.png"), "assets/slow.png");
  await pause(120); // quiet, and still cut short: waits
  assert.deepEqual(told, [], "half written: nothing told");
  await fs.appendFile(at("slow.png"), bytes.subarray(200));
  news("alpha", at("slow.png"), "assets/slow.png");
  await pause(150);
  assert.deepEqual(told, [["alpha", "assets/slow.png", fileStamp(at("slow.png"))]], "whole and quiet: told once");
  // The same stamp heard of again (a watcher's second event): nothing more.
  news("alpha", at("slow.png"), "assets/slow.png");
  await pause(120);
  assert.equal(told.length, 1);
  // Not whole by its format and left so: told as it is once quiet for its patience (the page swaps in no picture
  // its browser cannot draw). A phone's motion photo is such a file: a JPEG with a video after its end of image.
  await fs.writeFile(at("cut.png"), bytes.subarray(0, 50));
  news("alpha", at("cut.png"), "assets/cut.png");
  await pause(300);
  assert.equal(told.length, 1, "within its patience: nothing told");
  await pause(600);
  assert.deepEqual(told.at(-1), ["alpha", "assets/cut.png", fileStamp(at("cut.png"))], "quiet for its patience: told as it is");
  const motion = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7), Buffer.from([0xff, 0xd9]), Buffer.alloc(4096, 9)]);
  assert.equal(whole(motion, "photo.jpg"), false, "a motion photo's end of image is not where its format check looks");
  await fs.writeFile(at("photo.jpg"), motion);
  news("alpha", at("photo.jpg"), "assets/photo.jpg");
  await pause(900);
  assert.deepEqual(told.at(-1), ["alpha", "assets/photo.jpg", fileStamp(at("photo.jpg"))], "a motion photo told after its patience");
  // What was told of the document's files, for a page that connects; another document's apart.
  assert.deepEqual(news.told("alpha"), { "assets/slow.png": fileStamp(at("slow.png")), "assets/cut.png": fileStamp(at("cut.png")), "assets/photo.jpg": fileStamp(at("photo.jpg")) });
  assert.deepEqual(news.told("beta"), {});
  // Taken away: nothing told, and forgotten.
  const count = told.length;
  await fs.rm(at("cut.png"));
  news("alpha", at("cut.png"), "assets/cut.png");
  await pause(120);
  assert.equal(told.length, count, "taken away: nothing told");
  assert.deepEqual(Object.keys(news.told("alpha")), ["assets/slow.png", "assets/photo.jpg"], "and forgotten");
  news.close();
}

// ---------- the page ----------
const page = (body) => new JSDOM(`<!doctype html><html><head><style>.x { background: url(/__gallery/edit/asset/demo/assets/a.png?v=111111111111) no-repeat; }</style></head><body>${body}</body></html>`, { url: "http://127.0.0.1:4999/generated/demo.html" });
const shown = (doc, id) => {
  const node = doc.getElementById(id);
  return node.getAttribute("src") ?? node.getAttribute("srcset") ?? node.getAttribute("href") ?? node.getAttributeNS("http://www.w3.org/1999/xlink", "href") ?? node.getAttribute("style");
};
{
  const dom = page(`
    <img id="block" src="/__gallery/edit/asset/demo/assets/a.png?v=111111111111" data-ge-src="assets/a.png" alt="">
    <img id="other" src="/__gallery/edit/asset/demo/assets/b.png?v=222222222222" alt="">
    <img id="bare" src="/__gallery/edit/asset/demo/assets/a.png" alt="">
    <img id="set" srcset="/__gallery/edit/asset/demo/assets/a.png?v=111111111111 1x, /__gallery/edit/asset/demo/assets/b.png?v=222222222222 2x" alt="">
    <a id="link" href="/~ws-abcdef/__gallery/edit/file/demo/assets/a.png?v=111111111111" download="a.png">a</a>
    <iframe id="frame" src="http://127.0.0.1:4999/__gallery/edit/embed/demo/assets/a.png?v=111111111111#page=2"></iframe>
    <svg><image id="vector" xlink:href="/__gallery/edit/asset/demo/assets/a.png?v=111111111111"/></svg>
    <div id="styled" style="background-image: url('/__gallery/edit/asset/demo/assets/a.png?v=111111111111')"></div>
    <img id="elsewhere" src="/__gallery/edit/asset/beta/assets/a.png?v=111111111111" alt="">
    <img id="longer" src="/__gallery/edit/asset/demo/assets/a.png.bak" alt="">
    <img id="query" src="/__gallery/edit/asset/demo/assets/a.png?size=2" alt="">`);
  const doc = dom.window.document;
  const loaded = [];
  const swapped = await swapFiles(doc, { "assets/a.png": "333333333333" }, { slug: "demo", load: (url) => { loaded.push(url); return true; } });
  assert.equal(swapped, 8);
  assert.deepEqual(loaded, ["http://127.0.0.1:4999/__gallery/edit/asset/demo/assets/a.png?v=333333333333"], "the new picture loaded once, before any address takes it");
  assert.equal(shown(doc, "block"), "/__gallery/edit/asset/demo/assets/a.png?v=333333333333");
  assert.equal(doc.getElementById("block").getAttribute("data-ge-src"), "assets/a.png", "what the file says stays");
  assert.equal(shown(doc, "bare"), "/__gallery/edit/asset/demo/assets/a.png?v=333333333333", "an address of no stamp (one the editor made) too");
  assert.equal(shown(doc, "set"), "/__gallery/edit/asset/demo/assets/a.png?v=333333333333 1x, /__gallery/edit/asset/demo/assets/b.png?v=222222222222 2x");
  assert.equal(shown(doc, "link"), "/~ws-abcdef/__gallery/edit/file/demo/assets/a.png?v=333333333333", "under another workspace's base");
  assert.equal(shown(doc, "frame"), "http://127.0.0.1:4999/__gallery/edit/embed/demo/assets/a.png?v=333333333333#page=2", "its origin and fragment kept");
  assert.equal(shown(doc, "vector"), "/__gallery/edit/asset/demo/assets/a.png?v=333333333333");
  assert.equal(shown(doc, "styled"), "background-image: url('/__gallery/edit/asset/demo/assets/a.png?v=333333333333')");
  assert.match(doc.querySelector("style").textContent, /url\(\/__gallery\/edit\/asset\/demo\/assets\/a\.png\?v=333333333333\)/);
  assert.deepEqual(["other", "elsewhere", "longer", "query"].map((id) => shown(doc, id)), ["/__gallery/edit/asset/demo/assets/b.png?v=222222222222", "/__gallery/edit/asset/beta/assets/a.png?v=111111111111", "/__gallery/edit/asset/demo/assets/a.png.bak", "/__gallery/edit/asset/demo/assets/a.png?size=2"], "another file, another document's, a longer name, an address with a query of its own: left");
  // Told again of the stamp it shows: nothing loaded, nothing swapped.
  loaded.length = 0;
  assert.equal(await swapFiles(doc, { "assets/a.png": "333333333333" }, { slug: "demo", load: (url) => { loaded.push(url); return true; } }), 0);
  assert.deepEqual(loaded, []);
  // A picture that does not load (still being written): the one shown kept; a link, a frame take the address at once.
  assert.equal(await swapFiles(doc, { "assets/a.png": "444444444444" }, { slug: "demo", load: () => false }), 2);
  assert.equal(shown(doc, "block"), "/__gallery/edit/asset/demo/assets/a.png?v=333333333333", "the picture kept");
  assert.equal(shown(doc, "link"), "/~ws-abcdef/__gallery/edit/file/demo/assets/a.png?v=444444444444");
  // A picture changed meanwhile (the editor showing it anew): what changed it says.
  const racing = swapFiles(doc, { "assets/b.png": "555555555555" }, { slug: "demo", load: async () => { await pause(10); return true; } });
  doc.getElementById("other").setAttribute("src", "/__gallery/edit/asset/demo/assets/c.png");
  await racing;
  assert.equal(shown(doc, "other"), "/__gallery/edit/asset/demo/assets/c.png");
  assert.equal(shown(doc, "set"), "/__gallery/edit/asset/demo/assets/a.png?v=333333333333 1x, /__gallery/edit/asset/demo/assets/b.png?v=555555555555 2x");
}
// The page follows: what its live script heard of before the editor ran, then each event; the count on its root.
// `hear(files)` does what the live script does with "asset new" (src/server/routes.mjs liveReloadScript).
const live = (body, stamps = {}) => {
  const dom = page(body);
  const win = dom.window;
  win.__galleryAssets = { stamps: { ...stamps }, moved: {} };
  const hear = (files) => {
    for (const [file, stamp] of Object.entries(files)) win.__galleryAssets.stamps[file] = win.__galleryAssets.moved[file] = stamp;
    win.dispatchEvent(new win.CustomEvent("doc-files-written", { detail: { files } }));
  };
  return { win, doc: win.document, hear };
};
// jsdom loads no picture: one that "loads" after `ms`, each address it was asked for kept.
const loading = (win, ms = 0, asked = []) => {
  win.Image = class { set src(url) { asked.push(url); setTimeout(() => this.onload?.(), ms); } decode() { return Promise.resolve(); } };
  return asked;
};
{
  const { win, doc, hear } = live('<img id="block" src="/__gallery/edit/asset/demo/assets/a.png?v=111111111111" alt="">');
  loading(win);
  win.__galleryAssets.stamps["assets/a.png"] = win.__galleryAssets.moved["assets/a.png"] = "222222222222";
  assert.equal(stampedUrl("/x/assets/a.png", "assets/a.png", win), "/x/assets/a.png?v=222222222222", "the editor's own addresses name the stamp heard last");
  assert.equal(stampedUrl("/x/assets/z.png", "assets/z.png", win), "/x/assets/z.png");
  followFiles({ slug: "demo", win });
  await pause(30);
  assert.equal(shown(doc, "block"), "/__gallery/edit/asset/demo/assets/a.png?v=222222222222");
  hear({ "assets/a.png": "333333333333" });
  await pause(30);
  assert.equal(shown(doc, "block"), "/__gallery/edit/asset/demo/assets/a.png?v=333333333333");
  assert.equal(doc.documentElement.getAttribute("data-ge-files-swapped"), "4", "the picture and the <style>'s address, twice");
  // What comes back into the page from before a write it heard of: a pull's unit, an undo restoring a cell's HTML,
  // a block taken off the page and put back, an attribute set to an old address. Each swapped by itself.
  doc.body.insertAdjacentHTML("beforeend", '<img id="pulled" src="/__gallery/edit/asset/demo/assets/a.png?v=222222222222" alt="">');
  const cell = doc.createElement("td");
  doc.body.append(cell);
  cell.innerHTML = '格内<img id="cell" src="/__gallery/edit/asset/demo/assets/a.png?v=111111111111" alt="">文字';
  const block = doc.getElementById("block");
  block.remove();
  block.setAttribute("src", "/__gallery/edit/asset/demo/assets/a.png?v=111111111111"); // what undo puts back: the node as it was
  doc.body.append(block);
  const link = doc.createElement("a");
  link.id = "later";
  doc.body.append(link);
  link.setAttribute("href", "/__gallery/edit/file/demo/assets/a.png");
  await pause(30);
  assert.deepEqual(["pulled", "cell", "block", "later"].map((id) => shown(doc, id)), [
    "/__gallery/edit/asset/demo/assets/a.png?v=333333333333", "/__gallery/edit/asset/demo/assets/a.png?v=333333333333",
    "/__gallery/edit/asset/demo/assets/a.png?v=333333333333", "/__gallery/edit/file/demo/assets/a.png?v=333333333333",
  ], "each named by the stamp heard last");
  // One of a file not heard of as written, or of another document, comes in as it is.
  doc.body.insertAdjacentHTML("beforeend", '<img id="else" src="/__gallery/edit/asset/demo/assets/b.png?v=999999999999" alt=""><img id="other" src="/__gallery/edit/asset/beta/assets/a.png?v=111111111111" alt="">');
  await pause(30);
  assert.deepEqual(["else", "other"].map((id) => shown(doc, id)), ["/__gallery/edit/asset/demo/assets/b.png?v=999999999999", "/__gallery/edit/asset/beta/assets/a.png?v=111111111111"]);
}
// Told again while the first new picture still loads: one pass at a time, the next by the stamp heard last, so the
// page ends at the file's last stamp (two passes from the same old value once left it at the first).
{
  const { win, doc, hear } = live('<img id="block" src="/__gallery/edit/asset/demo/assets/a.png?v=111111111111" alt="">', { "assets/a.png": "111111111111" });
  const asked = loading(win, 120);
  followFiles({ slug: "demo", win });
  hear({ "assets/a.png": "222222222222" });
  await pause(50);
  hear({ "assets/a.png": "333333333333" });
  await pause(400);
  assert.equal(shown(doc, "block"), "/__gallery/edit/asset/demo/assets/a.png?v=333333333333", "the last stamp shown");
  assert.deepEqual(asked.map((url) => url.slice(-12)), ["222222222222", "333333333333"]);
}
// The pages of a document: a link shown with its icon pasted back (a copy of a page of no editor, 演示视图's) is known by
// its served address, named by its stamp or by none.
{
  const { doc } = live("");
  for (const src of ["/__gallery/edit/asset/alpha/assets/icon-1.png?v=0123456789ab", "/__gallery/edit/asset/alpha/assets/icon-1.png"]) {
    doc.body.innerHTML = `<a class="doc-link-mention" href="../alpha/doc.html"><img class="doc-link-mention-icon" src="${src}" alt="">甲</a>`;
    const seen = mentionOf(doc.querySelector("a"));
    assert.deepEqual([seen.icon, seen.slug], ["assets/icon-1.png", "alpha"], src);
  }
}

await fs.rm(root, { recursive: true, force: true });
console.log("written files: ok");
