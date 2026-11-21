import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import { createMediaStore } from "../../src/editor/media-store.mjs";
import { failure } from "../../src/editor/page/post.mjs";
import { inLanguage } from "../../src/shared/i18n/index.mjs";
import { newBookmark } from "../../src/editor/components/bookmark/index.mjs";
import { newEmbed } from "../../src/editor/components/embed/index.mjs";
import { newFile } from "../../src/editor/components/file/index.mjs";
import { newImage } from "../../src/editor/components/image/index.mjs";
import { captionNode, captionWords, fileOf, showFile } from "../../src/editor/components/media/parts.mjs";
import { emptyFigure } from "../../src/editor/components/media/write.mjs";
import { barClass } from "../../src/editor/components/placeholder-bar.mjs";
import { embedIcon, iconImage } from "../../src/render/emoji.mjs";
import { embedFrames } from "../../src/render/embeds.mjs";
import { embedFiles } from "../../src/render/files.mjs";
import { embedImages, imageFailures } from "../../src/render/images.mjs";
import { fileStamp } from "../../src/render/media-ref.mjs";
import { serveMedia } from "../../src/server/media-route.mjs";
import { BLOCK_TYPES, READ_ONLY_HINTS } from "../../src/editor/components/registry.mjs";
import { MEDIA_BARS, showEmpty } from "../../src/editor/components/placeholder.mjs";
import { MEDIA_BLOCKS, MEDIA_CLASS, mediaBlockOf } from "../../src/shared/components/index.mjs";
import { iconKind } from "../../src/shared/emoji/icon-value.mjs";
import { assetFile, assetName, assetProblem, embedFile, iconImageFile, imageExtension, imageFile, MEDIA_ROUTES, MEDIA_TYPES, mediaTypeOf, mediaUrl, UPLOAD_LIMITS, UPLOAD_REQUEST_LIMIT } from "../../src/shared/media.mjs";

// The preview names a file of the folder by its stamp (render/media-ref.mjs servedUrl: tests/unit/written-files.mjs);
// left out where what is checked is the address.
const unstamped = (html) => html.replace(new RegExp("[?]v=[0-9a-f]{12}", "g"), "");

// The media tables (src/shared/media.mjs): one rule that names a file of a report's folder, one table
// of media types, the routes the preview serves them at (src/server/media-route.mjs) and the limits
// of what is uploaded; every system asks them, so a file is judged alike as a page's icon, an image
// block's picture, a file block's file and an embed's frame, in the preview and in an export.

// One rule for the name, one table for the types: capital letters in an extension count everywhere,
// and an .ico is a picture for an image block (a bookmark's icon) but no page icon.
for (const [value, image, icon, asset, embed] of [
  ["assets/logo.png", true, true, true, false],
  ["assets/Logo.PNG", true, true, true, false],
  ["assets/site.ico", true, false, true, false],
  ["assets/Site.ICO", true, false, true, false],
  ["assets/data.csv", false, false, true, false],
  ["assets/Page.HTM", false, false, true, true],
  ["assets/doc.PDF", false, false, true, true],
  ["assets/a..b.png", false, false, false, false],
  ["assets/.hidden.png", false, false, false, false],
  ["assets/sub/x.png", false, false, false, false],
  ["https://example.com/x.png", false, false, false, false],
  ["logo.png", false, false, false, false],
]) assert.deepEqual([imageFile(value), iconImageFile(value), assetFile(value), embedFile(value)], [image, icon, asset, embed], value);
assert.deepEqual([iconKind("assets/Logo.PNG"), iconKind("assets/site.ico"), iconKind("assets/logo.png")], ["image", null, "image"], "a page's icon: the same rule, no .ico");
// What breaks the rule is said, each reason apart (assetProblem), never only the markup to write: none
// for a name the rule takes, one for every name it does not (a picture's format too, with `picture`).
const NAME_RULE = "a name is 1 to 81 characters, each a letter a-z or A-Z, a digit, a dot, a dash or an underscore, the first a letter or a digit";
for (const [value, said, picture = false] of [
  ["assets/logo.png", null],
  ["assets/Logo.PNG", null, true],
  ["assets/data.csv", null],
  ["https://example.com/x.png", "it is no file of the document's folder (an export holds the document's own files alone): save it into the document's assets/ folder and write assets/<file>"],
  ["images/x.png", "it is not in the document's assets/ folder: copy the file into it and write assets/<file>"],
  ["./assets/x.png", 'write it without "./" (assets/x.png)'],
  ["ASSETS/x.png", "the folder is assets/, in lowercase: write it so (assets/x.png)"],
  ["assets/../report.json", 'it leaves assets/ by "..": the files are right in assets/'],
  ["assets/images/scan.png", "the preview serves the files right in assets/, none in a folder of it (assets/images/): move the file into assets/, as assets/scan.png"],
  ["assets/图/扫描 1.tiff", "the preview serves the files right in assets/, none in a folder of it (assets/图/): move the file into assets/, as assets/1.tiff; and .tiff is no picture format a page shows (png, jpg, gif, webp, avif, svg or ico): convert it to one", true],
  ["assets/B263_古文孝経__NDL1288405.png", `its name holds 古, 文, 孝, 経, which the preview serves no file by (${NAME_RULE}): copy the file in under such a name, as assets/b263-ndl1288405.png`],
  ["assets/古文孝経.png", `its name holds 古, 文, 孝, 経, which the preview serves no file by (${NAME_RULE}): copy the file in under such a name, as assets/picture.png`, true],
  ["assets/my scan.png", `its name holds a space, which the preview serves no file by (${NAME_RULE}): copy the file in under such a name, as assets/my-scan.png`],
  ["assets/_x.png", `its name starts with "_", which the preview serves no file by (${NAME_RULE}): copy the file in under such a name, as assets/x.png`],
  ["assets/a..b.png", `its name holds "..", which the preview serves no file by (${NAME_RULE}): copy the file in under such a name, as assets/a-b.png`],
  [`assets/${"n".repeat(82)}.png`, `its name is 86 characters, which the preview serves no file by (${NAME_RULE}): copy the file in under such a name, as assets/${"n".repeat(77)}.png`],
  ["assets/photo.tiff", ".tiff is no picture format a page shows (png, jpg, gif, webp, avif, svg or ico): convert it to one", true],
  ["assets/scan", "a file with no extension is no picture format a page shows (png, jpg, gif, webp, avif, svg or ico): convert it to one", true],
  ["assets/", "it names no file: write assets/<file>, a file of the document's assets/ folder"],
  [undefined, "it names no file: write assets/<file>, a file of the document's assets/ folder"],
]) {
  assert.equal(assetProblem(value, { picture }), said, String(value));
  // The rule and its reasons agree: a name the rule takes has none, one it does not has one.
  if (typeof value === "string" && !value.startsWith("ASSETS/")) assert.equal(said === null, picture ? imageFile(value) : assetFile(value), `${value}: the rule and the reasons agree`);
}
assert.ok(assetFile(`assets/${assetName("B263_古文孝経__NDL1288405.png")}`) && assetFile(`assets/${assetName("古文.png")}`) && assetFile(`assets/${assetName("x".repeat(200))}`), "the names it offers are names the rule takes");
assert.deepEqual(Object.keys(MEDIA_ROUTES), ["asset", "file", "embed"]);
assert.equal(mediaUrl("embed", "alpha", "assets/a.html"), "/__gallery/edit/embed/alpha/assets/a.html");
assert.deepEqual([mediaTypeOf("assets/a.JPG"), mediaTypeOf("assets/s.ico"), mediaTypeOf("assets/x.unknown"), mediaTypeOf("assets/noextension")], ["image/jpeg", "image/x-icon", "application/octet-stream", "application/octet-stream"]);
assert.deepEqual([imageExtension("image/jpeg"), imageExtension("image/svg+xml"), imageExtension("application/pdf"), imageExtension("image/x-icon")], ["jpg", "svg", null, "ico"]);
assert.ok(Object.values(MEDIA_TYPES).every((type) => /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/.test(type)));
assert.equal(UPLOAD_REQUEST_LIMIT, 28 * 1024 * 1024, "the biggest upload as base64, with room for the rest of the request");
assert.deepEqual(Object.keys(UPLOAD_LIMITS), ["icon", "image", "file", "embed"]);

// Which blocks are media blocks is the descriptions' `media`: the editor's lists (the empty bars the server
// serves, the caption's kind, the hint, what a pasted file or a new block opens) all go through it.
assert.deepEqual(MEDIA_BLOCKS, ["image", "file", "bookmark", "embed"]);
assert.deepEqual(Object.values(MEDIA_CLASS), ["doc-image", "doc-file", "doc-bookmark", "doc-embed"]);
assert.deepEqual(READ_ONLY_HINTS.filter(({ at }) => typeof at === "string" && at.startsWith("figure.")).map(({ at, says }) => [at, says]), [["figure.doc-image", null], ["figure.doc-file", null], ["figure.doc-bookmark", null], ["figure.doc-embed", null]], "a media block's figure says nothing read-only: it has its own tools");
assert.deepEqual(Object.keys(MEDIA_BARS), Object.values(MEDIA_CLASS), "each media block has its bar");
assert.deepEqual(Object.keys(BLOCK_TYPES).filter((type) => BLOCK_TYPES[type].bar), MEDIA_BLOCKS, "the bar is declared by the media types and by no other (the lists of bars and handle icons derive from MEDIA_BLOCKS)");
for (const id of MEDIA_BLOCKS) {
  assert.ok(showEmpty(`<figure class="doc-${id}" data-block-id="a1"></figure>`).includes(`class="ge-${id}-empty"`), `an empty ${id} block is served with its bar`);
  assert.equal(showEmpty(`<figure class="doc-${id}"><figcaption></figcaption></figure>`), `<figure class="doc-${id}"><figcaption></figcaption></figure>`, `${id}: one with something in it stays as written`);
}
assert.equal(mediaBlockOf({ classList: { contains: (name) => name === "doc-embed" } }), "embed");
assert.equal(mediaBlockOf({ classList: { contains: () => false } }), null);

const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-media-"));
await fs.mkdir(path.join(root, "alpha", "assets"), { recursive: true });
await fs.writeFile(path.join(root, "alpha", "report.html"), "<main></main>");
const kept = async (name, bytes) => fs.writeFile(path.join(root, "alpha", "assets", name), bytes);
await kept("a.PNG", "png-bytes");
await kept("b.ico", "ico-bytes");
await kept("c.csv", "a,b");
await kept("d.html", "<p>x</p>");
await kept("e.pdf", "%PDF-1");
await kept("g.svg", "<svg xmlns=\"http://www.w3.org/2000/svg\"><script>alert(1)</script></svg>");

// The preview and an export of the one capital-letter picture, in every place a picture shows.
const options = (mode) => ({ slug: "alpha", mode, reportsDirectory: root });
const figure = (src) => `<figure class="doc-image"><img src="${src}" alt=""><figcaption></figcaption></figure>`;
assert.ok(unstamped(embedImages(figure("assets/a.PNG"), options("preview"))).includes('src="/__gallery/edit/asset/alpha/assets/a.PNG" data-ge-src="assets/a.PNG"'));
assert.ok(embedImages(figure("assets/a.PNG"), options("export")).includes(`src="data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}"`));
assert.ok(embedImages(figure("assets/b.ico"), options("export")).includes("data:image/x-icon;base64,"), "an .ico in an image block");
assert.deepEqual(imageFailures({ html: figure("assets/a.PNG"), directory: path.join(root, "alpha") }), []);
const iconHtml = (src) => `<html><head></head><body><header class="doc-header"><div class="doc-icon"><img src="${src}" alt=""></div></header></body></html>`;
assert.ok(unstamped(embedIcon(iconHtml("assets/a.PNG"), options("preview"))).includes('data-ge-icon="assets/a.PNG"><img src="/__gallery/edit/asset/alpha/assets/a.PNG" alt="">'), "a page icon with a capital letter in its extension");
assert.ok(embedIcon(iconHtml("assets/a.PNG"), options("export")).includes(`<img src="data:image/png;base64,${Buffer.from("png-bytes").toString("base64")}" alt="">`));
assert.equal(iconImage({ value: "assets/a.PNG", slug: "alpha", reportsDirectory: root }).type, "image/png");
assert.equal(iconImage({ value: "assets/b.ico", slug: "alpha", reportsDirectory: root }), null, "an .ico is no page icon");
const link = '<figure class="doc-file"><a class="doc-file-link" href="assets/b.ico" download="b.ico">b</a><figcaption></figcaption></figure>';
assert.ok(embedFiles(link, options("export")).includes("data:image/x-icon;base64,"), "an .ico in a file block is embedded as what it is");
assert.ok(unstamped(embedFrames('<figure class="doc-embed"><iframe class="doc-embed-frame" src="assets/d.html" sandbox=""></iframe></figure>', options("preview"))).includes('src="/__gallery/edit/embed/alpha/assets/d.html" data-ge-src="assets/d.html"'));

// What each route sends: a picture as its type, a file only for saving, an embed's HTML in a sandbox.
const answer = async (pathname) => {
  const sent = { headers: {}, statusCode: 0, body: null };
  const handled = await serveMedia(pathname, { setHeader: (name, value) => { sent.headers[name] = value; }, set statusCode(code) { sent.statusCode = code; }, end: (body) => { sent.body = body ?? null; } }, { reportsDirectory: root });
  return { handled, ...sent };
};
// Each with its stamp as its tag (render/media-ref.mjs fileStamp: a request holding it is answered 304, tests/unit/written-files.mjs).
const tag = (name) => `"${fileStamp(path.join(root, "alpha", "assets", name))}"`;
assert.deepEqual(await answer("/__gallery/edit/asset/alpha/assets/a.PNG"), { handled: true, statusCode: 200, headers: { "Content-Type": "image/png", "Cache-Control": "no-cache", ETag: tag("a.PNG") }, body: Buffer.from("png-bytes") });
// An SVG picture sandboxed with no permission: opened on its own (a frame, a link), it runs nothing in the page's origin.
assert.deepEqual((await answer("/__gallery/edit/asset/alpha/assets/g.svg")).headers, { "Content-Type": "image/svg+xml", "Content-Security-Policy": "sandbox", "Cache-Control": "no-cache", ETag: tag("g.svg") });
assert.deepEqual((await answer("/__gallery/edit/file/alpha/assets/c.csv")).headers, { "Content-Type": "application/octet-stream", "Content-Disposition": "attachment", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache", ETag: tag("c.csv") });
assert.deepEqual((await answer("/__gallery/edit/embed/alpha/assets/d.html")).headers, { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "sandbox allow-scripts allow-popups allow-forms allow-modals", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache", ETag: tag("d.html") });
assert.deepEqual((await answer("/__gallery/edit/embed/alpha/assets/e.pdf")).headers, { "Content-Type": "application/pdf", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache", ETag: tag("e.pdf") });
for (const refused of ["/__gallery/edit/asset/alpha/assets/c.csv", "/__gallery/edit/embed/alpha/assets/c.csv", "/__gallery/edit/asset/alpha/assets/missing.png", "/__gallery/edit/file/nobody/assets/c.csv", "/__gallery/edit/asset/alpha/assets/report.json"]) {
  const result = await answer(refused);
  assert.deepEqual([result.handled, result.statusCode, result.body], [true, 404, null], refused);
}
assert.equal((await answer("/__gallery/edit/asset/alpha/assets/a/b.png")).handled, false, "not a route of these");
assert.equal((await answer("/generated/alpha.html")).handled, false);
for (const slug of ["-alpha", "al--pha", "Alpha"]) assert.deepEqual([(await answer(`/__gallery/edit/asset/${slug}/assets/a.PNG`)).statusCode, (await answer(`/__gallery/edit/asset/${slug}/assets/a.PNG`)).body], [404, null], `a name that is no slug (slugPattern, the one rule) is turned down: ${slug}`);

// One table says what an upload may be: its limit by its kind, its extension by its bytes or its
// name, its message by what it is; a link is read no further than its limit.
const store = createMediaStore({ reportsDirectory: root });
const base64 = (bytes) => bytes.toString("base64");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const asText = async (kind, data, name) => (await store.upload({ slug: "alpha", kind, name, data: base64(data) }))[1];
assert.match((await asText("image", PNG)).path, /^assets\/image-[a-f0-9]{12}\.png$/);
assert.match((await asText("file", Buffer.from("x"), "笔记.CSV")).path, /^assets\/file-[a-f0-9]{12}\.csv$/);
assert.match((await asText("file", Buffer.from("x"), "README")).path, /^assets\/file-[a-f0-9]{12}$/, "a file with no extension has none");
assert.deepEqual([(await asText("file", Buffer.from("x"), "笔记.CSV")).name, (await asText("file", Buffer.from("xy"), "a.bin")).size], ["笔记.CSV", 2]);
assert.equal((await asText("embed", Buffer.from("x"), "x.png")).reason, "type");
assert.equal((await asText("nothing", PNG)).path.startsWith("assets/icon-"), true, "any other kind is an icon's");
const tooBig = (kind, name) => asText(kind, Buffer.concat([name === "x.pdf" ? Buffer.from("%PDF-") : PNG, Buffer.alloc(UPLOAD_LIMITS[kind] + 1)]), name);
assert.deepEqual([(await tooBig("icon")).reason, (await tooBig("icon")).message], ["size", "图片太大（最多 2 MB）"]);
assert.equal((await tooBig("image")).message, "图片太大（最多 10 MB）");
assert.equal((await tooBig("file", "x.zip")).message, "文件太大（最多 20 MB）", "a file is no picture");
assert.equal((await tooBig("embed", "x.pdf")).message, "文件太大（最多 20 MB）");
// The refusal carries its template and its limit (shared/i18n said()): the page's funnel (post.mjs
// failure, told()) says it in an English UI in English, the limit filled in.
assert.deepEqual([(await tooBig("image")).text, (await tooBig("image")).values], ["图片太大（最多 {0} MB）", [10]]);
{
  const [image, file] = [await tooBig("image"), await tooBig("file", "x.zip")];
  assert.deepEqual(inLanguage("en", () => [failure(image, "?"), failure(file, "?")]), ["Image too large (at most 10 MB)", "File too large (at most 20 MB)"], "an English UI says a size refusal in English");
  assert.equal(inLanguage("zh", () => failure(image, "?")), "图片太大（最多 10 MB）");
}

{
  let sent = 0;
  const sources = new Set();
  const server = http.createServer((request, response) => {
    if (request.url === "/small.png") return response.end(PNG);
    if (request.url === "/missing") {
      response.statusCode = 404;
      return response.end("no");
    }
    // A picture with no end: the server reads no more of it than the limit asks.
    response.writeHead(200, { "Content-Type": "image/png" });
    sources.add(response);
    const chunk = Buffer.alloc(256 * 1024);
    const push = () => {
      while (!response.destroyed && response.write(chunk)) sent += chunk.length;
      if (!response.destroyed) response.once("drain", push);
    };
    push();
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = (route) => `http://127.0.0.1:${server.address().port}${route}`;
  assert.match((await store.upload({ slug: "alpha", kind: "image", url: address("/small.png") }))[1].path, /^assets\/image-[a-f0-9]{12}\.png$/);
  assert.equal((await store.upload({ slug: "alpha", kind: "image", url: address("/missing") }))[1].reason, "download");
  assert.equal((await store.upload({ slug: "alpha", url: "ftp://example.com/x.png" }))[1].reason, "url");
  assert.equal((await store.upload({ slug: "alpha", url: "not an address" }))[1].reason, "url");
  const refused = (await store.upload({ slug: "alpha", kind: "icon", url: address("/endless") }))[1];
  assert.deepEqual([refused.reason, refused.message], ["size", "图片太大（最多 2 MB）"]);
  assert.ok(sent < UPLOAD_LIMITS.icon * 8, `a link's picture is read only as far as its limit asks (${sent} bytes were sent)`);
  for (const response of sources) response.destroy();
  server.close();
}

// What the four blocks make alike (components/media/parts.mjs, write.mjs): a new one is a figure of the
// block's class holding its placeholder and nothing else, marked as new, its own type and unit kind and
// not editable; a caption is a text block of its own kind; a file shown keeps what the file says apart from
// where it shows; a block written empty is an empty figure, text escaped as one rule.
{
  const doc = new JSDOM("").window.document;
  const makers = { image: newImage, file: newFile, bookmark: newBookmark, embed: newEmbed };
  assert.deepEqual(Object.keys(makers), MEDIA_BLOCKS);
  for (const id of MEDIA_BLOCKS) {
    const figure = makers[id](doc);
    assert.equal(figure.className, MEDIA_CLASS[id]);
    assert.deepEqual(["data-ge-new", "data-ge-type", "data-ge-unit-kind", "contenteditable"].map((name) => figure.getAttribute(name)), ["", id, id, "false"], id);
    assert.deepEqual([...figure.children].map((child) => child.className), [barClass(MEDIA_CLASS[id])], `${id}: its placeholder bar alone`);
    const served = doc.createElement("template");
    served.innerHTML = MEDIA_BARS[MEDIA_CLASS[id]];
    assert.equal(figure.firstElementChild.outerHTML, served.content.firstElementChild.outerHTML, `${id}: the bar the server serves for an empty one`);
    assert.equal(captionWords(figure), "", `${id}: no caption, no words`);
    assert.equal(emptyFigure(id, { id: ' data-block-id="abc"' }), `<figure class="${MEDIA_CLASS[id]}" data-block-id="abc"></figure>`);
  }
  const caption = captionNode(doc, "说明 <b>粗</b>");
  assert.deepEqual(["contenteditable", "data-ge-new", "data-ge-kind", "data-ge-caps"].map((name) => caption.getAttribute(name)), ["true", "", "mediaCaption", "empty links"]);
  const figure = newImage(doc);
  figure.append(caption);
  assert.equal(captionWords(figure), "说明 <b>粗</b>");
  caption.textContent = "  ";
  assert.equal(captionWords(figure), "", "a caption of blanks has no words");
  const link = doc.createElement("a");
  showFile(link, "href", "assets/file-0123456789ab.csv", "/__gallery/edit/file/alpha/assets/file-0123456789ab.csv");
  assert.deepEqual([link.getAttribute("href"), link.getAttribute("data-ge-href"), fileOf(link, "href"), fileOf(link, "src"), fileOf(null, "src")], ["/__gallery/edit/file/alpha/assets/file-0123456789ab.csv", "assets/file-0123456789ab.csv", "assets/file-0123456789ab.csv", null, null]);
}

await fs.rm(root, { recursive: true, force: true });
console.log("Checked the media tables: one rule that names a file of a document's folder (capital letters and .ico alike for pictures, files, embeds and a page's icon, which takes no .ico) and what breaks it, each reason apart with a name the rule takes, one table of media types, the routes the preview serves them at and what each sends (a picture as its type, a file only for saving, an embed's HTML in a sandbox), what an upload may be (its limit and message by kind, said in an English UI in English, a link read no further than the limit), and the media blocks as the descriptions declare them (their classes, selector and empty bars), and what the four blocks make alike (a new one's figure, placeholder and marks, a caption, a file shown and the file's word for it, one empty figure).");
