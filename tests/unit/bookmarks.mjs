import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createMediaStore } from "../../src/editor/media-store.mjs";
import { parseMeta } from "../../src/editor/unfurl.mjs";
import { applyEdits, findBlocks, findUnits } from "../../src/editor/source.mjs";
import { componentFailures } from "../../src/render/component-checks.mjs";
import { embedImages, imageFailures } from "../../src/render/images.mjs";

// The preview names a file of the folder by its stamp (render/media-ref.mjs servedUrl: tests/unit/written-files.mjs);
// left out where what is checked is the address.
const unstamped = (html) => html.replace(new RegExp("[?]v=[0-9a-f]{12}", "g"), "");

// Bookmarks (网页书签, components/bookmark/, docs/components/bookmark.md): their markup and
// its checks, their icon and cover where the preview serves them and inside an export
// (render/images.mjs), what a web page says of itself (editor/unfurl.mjs) and the images kept in the
// report's folder, and the block as the editor finds it and writes a new one.

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-bookmarks-"));
await fs.mkdir(path.join(root, "alpha", "assets"), { recursive: true });
await fs.writeFile(path.join(root, "alpha", "report.html"), "<main></main>");
await fs.writeFile(path.join(root, "alpha", "report.json"), "{}");
await fs.writeFile(path.join(root, "alpha", "assets", "bookmark-cover-0123456789ab.png"), PNG);
const directory = path.join(root, "alpha");

const card = (href, cover = '<span class="doc-bookmark-cover"><img src="assets/bookmark-cover-0123456789ab.png" alt=""></span>') =>
  `<a class="doc-bookmark-card" href="${href}" target="_blank" rel="noopener noreferrer"><span class="doc-bookmark-text"><span class="doc-bookmark-title">标题</span><span class="doc-bookmark-url"><span class="doc-bookmark-href">${href}</span></span></span>${cover}</a>`;
const figure = (inner) => `<main class="doc-page">\n  <figure class="doc-bookmark">\n    ${inner}\n  </figure>\n</main>`;
const good = figure(`${card("https://example.com/page")}\n    <figcaption></figcaption>`);

// Its markup: a card holding its text (a title and an address) and maybe a cover, and a caption;
// the link a web address, the images files of the report's folder that are there.
assert.deepEqual(componentFailures(good), []);
assert.equal(componentFailures(figure(card("https://example.com/page"))).length, 1, "no caption");
assert.deepEqual(imageFailures({ html: good, directory }), []);
assert.match(imageFailures({ html: figure(`${card("javascript:alert(1)")}\n    <figcaption></figcaption>`), directory })[0], /is a web address/);
assert.match(imageFailures({ html: figure(`${card("https://example.com/", '<span class="doc-bookmark-cover"><img src="https://example.com/x.png" alt=""></span>')}\n    <figcaption></figcaption>`), directory })[0], /a bookmark's icon or cover/);

// The preview serves its cover from the report's folder; an export holds it; the link stays the page's.
assert.ok(unstamped(embedImages(good, { slug: "alpha", mode: "preview", reportsDirectory: root })).includes('src="/__gallery/edit/asset/alpha/assets/bookmark-cover-0123456789ab.png" data-ge-src="assets/bookmark-cover-0123456789ab.png"'));
const exported = embedImages(good, { slug: "alpha", reportsDirectory: root });
assert.ok(exported.includes(`src="data:image/png;base64,${PNG.toString("base64")}"`) && exported.includes('href="https://example.com/page"'));

// What a page says of itself: og: first, then twitter:, then <title> and description; addresses absolute.
assert.deepEqual(parseMeta(`<html><head><title>T &amp; t</title><meta name="description" content="  d  ">
  <link rel="shortcut icon" href="/i.png"><meta property="og:image" content="cover.jpg"></head><body></body></html>`, "https://example.com/a/b"), {
  title: "T & t", description: "d", icon: "https://example.com/i.png", cover: "https://example.com/a/cover.jpg",
});
assert.equal(parseMeta('<head><meta property="og:title" content="OG"><title>T</title></head>', "https://example.com/").title, "OG");
assert.equal(parseMeta("<head></head>", "https://example.com/x").icon, "https://example.com/favicon.ico");

// A page read: its title and description, its icon and cover kept in the report's folder (an image
// that is none, left out); a page that is no web address refused.
const server = http.createServer((request, response) => {
  if (request.url === "/page") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return response.end('<html><head><meta property="og:title" content="一个网页"><meta property="og:description" content="它的描述"><link rel="icon" href="/icon.png"><meta property="og:image" content="/cover.txt"></head></html>');
  }
  if (request.url === "/icon.png") {
    response.writeHead(200, { "Content-Type": "image/png" });
    return response.end(PNG);
  }
  if (request.url === "/inline") {
    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return response.end(`<html><head><link rel="icon" href="data:image/png;base64,${PNG.toString("base64")}"></head></html>`);
  }
  response.writeHead(200, { "Content-Type": "text/plain" });
  response.end("not an image");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const files = createMediaStore({ reportsDirectory: root });
const [status, page] = await files.unfurl({ slug: "alpha", url: `http://127.0.0.1:${server.address().port}/page` });
const [, inline] = await files.unfurl({ slug: "alpha", url: `http://127.0.0.1:${server.address().port}/inline` });
server.close();
assert.match(inline.icon, /^assets\/bookmark-icon-[a-f0-9]{12}\.png$/, "an icon the page wrote as a data: address is kept");
assert.equal(status, 200);
assert.deepEqual([page.title, page.description, page.cover], ["一个网页", "它的描述", null]);
assert.match(page.icon, /^assets\/bookmark-icon-[a-f0-9]{12}\.png$/);
assert.ok(await fs.stat(path.join(directory, page.icon)), "the icon is in the document's folder");
assert.equal((await files.unfurl({ slug: "alpha", url: "file:///etc/passwd" }))[1].reason, "url");

// The editor: one block (a card), its caption a media block's; a new one written (its text escaped,
// a page with no title showing its host), never a link or an image from elsewhere.
const pageHtml = `<main>\n  <p>前文</p>\n${good.replace(/^<main[^>]*>\n|\n<\/main>$/g, "")}\n</main>\n`;
assert.deepEqual(findUnits(pageHtml).units.map((unit) => unit.kind), ["paragraph", "bookmark"]);
assert.ok(findBlocks(pageHtml).some((block) => block.kind === "mediaCaption"));
const add = (node) => applyEdits({ current: pageHtml, edits: [], units: [{ id: "n0", insert: { type: "bookmark", key: "n0", description: "", icon: null, cover: null, caption: "", ...node }, place: { after: 0 } }] });
const written = add({ href: "https://example.com/a?b=1&c=2", title: "", description: "<描述>", icon: "assets/bookmark-icon-0123456789ab.png" }).text;
assert.ok(written.includes('<a class="doc-bookmark-card" href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer"><span class="doc-bookmark-text"><span class="doc-bookmark-title">example.com</span><span class="doc-bookmark-description">&lt;描述&gt;</span><span class="doc-bookmark-url"><img class="doc-bookmark-icon" src="assets/bookmark-icon-0123456789ab.png" alt=""><span class="doc-bookmark-href">https://example.com/a?b=1&amp;c=2</span></span></span></a>'), written);
for (const bad of [{ href: "javascript:alert(1)", title: "x" }, { href: "https://example.com/", title: "x", cover: "https://example.com/c.png" }, { href: "https://example.com/\" onclick=\"x", title: "x" }]) {
  assert.deepEqual(add(bad).conflicts.map((entry) => entry.reason), ["invalid"], JSON.stringify(bad));
}

// Links shown with their icon (图标视图, shared/components/mention.mjs): a whole in a paragraph's text
// (an atom, as a formula is, written back as it was), its icon where the preview serves it and
// inside an export, a missing one or one from elsewhere said; one written any other way leaves its
// block as it is. The page may write one into a text; never one that is not as the kit writes it.
// The page's views read the page's title alone (no images), or its icon too.
{
  await fs.writeFile(path.join(directory, "assets", "bookmark-icon-0123456789ab.png"), PNG);
  const chip = '<a class="doc-link-mention" href="https://example.com/a?b=1&amp;c=2"><img class="doc-link-mention-icon" src="assets/bookmark-icon-0123456789ab.png" alt="">一个网页</a>';
  const globe = '<a class="doc-link-mention" href="https://example.com/"><span class="doc-link-mention-icon"></span>example.com</a>';
  const text = `<main>\n  <p>见 ${chip} 和 ${globe}。</p>\n</main>\n`;
  const [block] = findBlocks(text);
  const inner = text.slice(block.innerStart, block.innerEnd);
  assert.deepEqual(block.atoms.map(([start, end]) => inner.slice(start, end)), [chip, globe], "both are atoms of the paragraph");
  for (const bad of [
    chip.replace(' alt=""', ""), chip.replace("assets/bookmark-icon-0123456789ab.png", "https://example.com/i.png"),
    chip.replace('href="https', 'onclick="x()" href="https'), chip.replace("https://example.com/a?b=1&amp;c=2", "javascript:alert(1)"),
    globe.replace("example.com</a>", "<strong>example.com</strong></a>"), globe.replace("example.com</a>", "</a>"),
  ]) assert.equal(findBlocks(`<main>\n  <p>见 ${bad}。</p>\n</main>\n`).length, 0, bad);
  const served = unstamped(embedImages(text, { slug: "alpha", mode: "preview", reportsDirectory: root }));
  assert.ok(served.includes('<img class="doc-link-mention-icon" src="/__gallery/edit/asset/alpha/assets/bookmark-icon-0123456789ab.png" data-ge-src="assets/bookmark-icon-0123456789ab.png" alt="">'), served);
  assert.ok(embedImages(text, { slug: "alpha", reportsDirectory: root }).includes(`<img class="doc-link-mention-icon" src="data:image/png;base64,${PNG.toString("base64")}" alt="">`));
  assert.deepEqual(imageFailures({ html: text, directory }), []);
  assert.match(imageFailures({ html: text.replace("0123456789ab", "ffffffffffff"), directory })[0], /a link's icon assets\/bookmark-icon-ffffffffffff\.png is not in the document's folder/);
  assert.deepEqual(componentFailures(text), []);
  const plain = "<main>\n  <p>前文</p>\n</main>\n";
  const write = (html) => applyEdits({ current: plain, edits: [{ id: findBlocks(plain)[0].id, parts: [{ keep: true, html }] }] });
  const done = write(`前文 ${chip}`);
  assert.ok(done.ok && done.text.includes(`<p>前文 ${chip}</p>`), done.text);
  assert.equal(write(`前文 ${chip.replace(' alt=""', ' alt="" onerror="x()"')}`).ok, false, "never one the kit does not write");
  // One left empty (the "/" menu's 链接 given no address): an atom too, written as the page writes it.
  const empty = '<a class="doc-link-mention"></a>';
  assert.equal(findBlocks(`<main>\n  <p>前文${empty}后文</p>\n</main>\n`)[0]?.atoms.length, 1, "an empty link is an atom of its text");
  assert.equal(findBlocks(`<main>\n  <p>前文<a class="doc-link-mention" title="x"></a>后文</p>\n</main>\n`).length, 0, "only as the page writes it");
  const kept = write(`前文${empty}`);
  assert.ok(kept.ok && kept.text.includes(`<p>前文${empty}</p>`), kept.text);
  // A page block: the same element, a document's address as a file writes it, a block's too, and one
  // left empty with data-doc-page. Any other address, or any other form of a document's, locks its block.
  for (const href of ["../target/doc.html", "../target/report.html", "../target/doc.html#ab12cd34", "#ab12cd34"]) {
    const page = `<a class="doc-link-mention" href="${href}"><span class="doc-link-mention-icon"></span>目标页</a>`;
    assert.equal(findBlocks(`<main>\n  <p>见 ${page}。</p>\n</main>\n`)[0]?.atoms.length, 1, href);
    const done = write(`前文 ${page}`);
    assert.ok(done.ok && done.text.includes(`<p>前文 ${page}</p>`), done.text);
  }
  for (const href of ["target.html", "/generated/target.html", "/#target", "../Target/doc.html", "../target/other.html", "../../target/doc.html", "assets/a.png", "#", "javascript:alert(1)"]) {
    const page = `<a class="doc-link-mention" href="${href}"><span class="doc-link-mention-icon"></span>目标页</a>`;
    assert.equal(findBlocks(`<main>\n  <p>见 ${page}。</p>\n</main>\n`).length, 0, href);
  }
  const emptyPage = '<a class="doc-link-mention" data-doc-page></a>';
  assert.equal(findBlocks(`<main>\n  <p>前文${emptyPage}后文</p>\n</main>\n`)[0]?.atoms.length, 1, "a page block left empty is an atom of its text");
  assert.equal(findBlocks('<main>\n  <p>前文<a class="doc-link-mention" data-doc-page="x"></a>后文</p>\n</main>\n').length, 0, "with nothing for a value");
  assert.equal(findBlocks('<main>\n  <p>前文<a class="doc-link-mention" data-doc-page href="../a/doc.html"></a>后文</p>\n</main>\n').length, 0, "and no address");
  assert.equal(findBlocks('<main>\n  <p>前文<a class="doc-link-mention" data-doc-page>词</a>后文</p>\n</main>\n').length, 0, "and nothing in it");
  const keptPage = write(`前文${emptyPage}`);
  assert.ok(keptPage.ok && keptPage.text.includes(`<p>前文${emptyPage}</p>`), keptPage.text);
  assert.deepEqual(componentFailures(`<main>\n  <p>${emptyPage}<a class="doc-link-mention" href="../target/doc.html"><span class="doc-link-mention-icon"></span>目标页</a></p>\n</main>\n`), [], "nothing a check says of them");

  const server = http.createServer((request, response) => {
    if (request.url === "/page") {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return response.end('<html><head><title>只有标题</title><link rel="icon" href="/icon.png"><meta property="og:image" content="/icon.png"></head></html>');
    }
    response.writeHead(200, { "Content-Type": "image/png" });
    response.end(PNG);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/page`;
  const [, titled] = await files.unfurl({ slug: "alpha", url, parts: "title" });
  const [, iconed] = await files.unfurl({ slug: "alpha", url, parts: "icon" });
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify({ template: true }));
  const [old] = await files.unfurl({ slug: "alpha", url, parts: "icon" });
  await fs.writeFile(path.join(directory, "report.json"), "{}");
  server.close();
  assert.deepEqual([titled.title, titled.icon, titled.cover], ["只有标题", null, null], "the title alone");
  assert.ok(/^assets\/bookmark-icon-[a-f0-9]{12}\.png$/.test(iconed.icon) && iconed.cover === null, "its icon, no cover");
  assert.equal(old, 200, "an old template flag keeps no report from images");
  assert.equal((await files.unfurl({ slug: "alpha", url, parts: "cover" }))[0], 400);
}

await fs.rm(root, { recursive: true, force: true });

// The web through this computer's proxy (net-fetch.mjs): HTTPS_PROXY and its kin
// first; NO_PROXY's hosts (and their subdomains), this computer and the local network direct; an
// http address sent whole to the proxy, its answer taken as fetch's.
{
  const { netFetch, proxyFor } = await import("../../src/editor/net-fetch.mjs");
  const saved = Object.fromEntries(["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy", "ALL_PROXY", "all_proxy", "NO_PROXY", "no_proxy"].map((name) => [name, process.env[name]]));
  for (const name of Object.keys(saved)) delete process.env[name];
  const proxy = http.createServer((request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end(`via proxy: ${request.url}`);
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  process.env.HTTPS_PROXY = `127.0.0.1:${proxy.address().port}`;
  process.env.NO_PROXY = "direct.example";
  try {
    assert.equal(await proxyFor("https://www.example.com/"), `http://127.0.0.1:${proxy.address().port}`, "through the proxy (its scheme put in)");
    assert.equal(await proxyFor("http://direct.example/a"), null, "NO_PROXY goes direct");
    assert.equal(await proxyFor("http://sub.direct.example/a"), null, "and its subdomains");
    assert.equal(await proxyFor("http://127.0.0.1:9/"), null, "this computer goes direct");
    assert.equal(await proxyFor("http://192.168.1.2/"), null, "and the local network");
    const response = await netFetch("http://far.example/page?x=1");
    assert.equal(await response.text(), "via proxy: http://far.example/page?x=1", "an http address sent whole to the proxy");
  } finally {
    proxy.close();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}
console.log("Checked bookmarks: their markup and checks, their icon and cover where the preview serves them and inside an export (the link the page's), what a web page says of itself and the images kept in the document's folder, and the block as the editor finds it and writes a new one (escaped, refused from elsewhere); links shown with their icon (atoms of the text, their icon served and embedded, written only as the kit writes them) and the page read for a link's views (its title alone, its icon).");
