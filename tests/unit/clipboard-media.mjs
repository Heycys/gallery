import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

// The four media blocks copied, cut and pasted (the user's of 2026-11-20: "图片竟然是不能剪切的"; docs/editor.md,
// "Copying blocks"): an image, a file, an embed and a bookmark copied as themselves carry what a new one is
// written with (`data`), checked as the file's writers take it and made anew of it where their unit is not
// (cut, another document), their files of the folder (`files`) named for a paste into another document to
// copy first and shown as the copies; for other programs a picture and links by their whole address
// (own/export.mjs); the clipboard's own data read from the HTML of a picture's write too.

const dom = new JSDOM(`<main class="doc-page" data-doc-id="r" data-ge-box="0" data-ge-box-kind="main">
  <figure id="img" class="doc-image doc-image--right" style="--doc-span: 0.5" data-ge-unit="1" data-ge-unit-kind="image" contenteditable="false"><img src="/__gallery/edit/asset/r/assets/photo.png?v=1" data-ge-src="assets/photo.png" alt="一张图"><figcaption contenteditable="true" data-ge-block="1" data-ge-kind="mediaCaption">图的<strong>说明</strong> <a href="https://example.com/">链接</a></figcaption></figure>
  <figure id="file" class="doc-file" data-ge-unit="2" data-ge-unit-kind="file" contenteditable="false"><a class="doc-file-link" href="/__gallery/edit/file/r/assets/notes.pdf" data-ge-href="assets/notes.pdf" download="笔记.pdf"><span class="doc-file-name">笔记.pdf</span><span class="doc-file-size">1.0 KiB</span></a><figcaption contenteditable="true" data-ge-block="2" data-ge-kind="mediaCaption">文件说明</figcaption></figure>
  <figure id="embed" class="doc-embed doc-embed--file" style="--doc-embed-height: 300px" data-ge-unit="3" data-ge-unit-kind="embed" contenteditable="false"><iframe class="doc-embed-frame" src="/__gallery/edit/embed/r/assets/page.html" data-ge-src="assets/page.html"></iframe><figcaption contenteditable="true" data-ge-block="3" data-ge-kind="mediaCaption">嵌入说明</figcaption></figure>
  <figure id="mark" class="doc-bookmark" data-ge-unit="4" data-ge-unit-kind="bookmark" contenteditable="false"><a class="doc-bookmark-card" href="https://example.com/" target="_blank" rel="noopener noreferrer"><span class="doc-bookmark-text"><span class="doc-bookmark-title">示例网页</span><span class="doc-bookmark-description">一句描述</span><span class="doc-bookmark-url"><img class="doc-bookmark-icon" src="/__gallery/edit/asset/r/assets/icon.png" data-ge-src="assets/icon.png" alt=""><span class="doc-bookmark-href">https://example.com/</span></span></span></a><figcaption contenteditable="true" data-ge-block="4" data-ge-kind="mediaCaption"></figcaption></figure>
  <figure id="web" class="doc-embed" data-ge-unit="11" data-ge-unit-kind="embed" contenteditable="false"><iframe class="doc-embed-frame" src="https://example.com/page" sandbox="allow-scripts"></iframe><figcaption contenteditable="true" data-ge-block="7" data-ge-kind="mediaCaption"></figcaption></figure>
  <figure id="empty" class="doc-image" data-ge-unit="5" data-ge-unit-kind="image" contenteditable="false"></figure>
  <div id="cols" class="doc-columns" data-ge-unit="6" data-ge-unit-kind="columns" data-ge-box="1" data-ge-box-kind="columns">
    <div class="doc-column" style="--doc-column-ratio: 0.6" data-ge-unit="7" data-ge-unit-kind="column" data-ge-box="2" data-ge-box-kind="column"><p contenteditable="true" data-ge-block="5" data-ge-unit="8" data-ge-unit-kind="paragraph">左栏</p></div>
    <div class="doc-column" data-ge-unit="9" data-ge-unit-kind="column" data-ge-box="3" data-ge-box-kind="column"><figure class="doc-image" data-ge-unit="10" data-ge-unit-kind="image" contenteditable="false"><img src="/__gallery/edit/asset/r/assets/photo.png" data-ge-src="assets/photo.png" alt=""><figcaption contenteditable="true" data-ge-block="6" data-ge-kind="mediaCaption"></figcaption></figure></div>
  </div>
</main>`, { url: "http://127.0.0.1:8080/generated/r.html" });
const saved = { document: globalThis.document, Node: globalThis.Node, location: globalThis.location, DocKit: globalThis.DocKit };
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;
globalThis.location = dom.window.location;
globalThis.DocKit = { dehydrate() {} };
const { HTML_MARK, PASTED_SOURCE, build, copied, describe, filesOf, formats, joinedHtml, ownData, parse, unmadeCopy } = await import("../../src/editor/page/clipboard/own/index.mjs");
const { nodeOf } = await import("../../src/editor/page/core.mjs");
const { default: imageWriter } = await import("../../src/editor/components/image/file.mjs");
const { default: embedWriter } = await import("../../src/editor/components/embed/file.mjs");
const $ = (id) => document.getElementById(id);
const data = (blocks) => JSON.stringify({ v: 1, blocks });
const elsewhere = (copy) => ({ ...copy, report: "other" });
const copies = new Map([["assets/photo.png", "assets/image-0123456789ab.png"], ["assets/notes.pdf", "assets/file-0123456789ab.pdf"], ["assets/page.html", "assets/embed-0123456789ab.html"], ["assets/icon.png", "assets/image-ba9876543210.png"]]);
const served = (route, path) => `/served/${route}/${path}`;
const made = (copy, options = { files: copies, served }) => build(document, parse(data([elsewhere(copy)]))[0], options);
const written = (element) => nodeOf(element, new WeakSet());

// An image: what a new one is written with, its alt words too.
const image = describe($("img"));
assert.deepEqual(image.data, { type: "image", src: "assets/photo.png", caption: '图的<strong>说明</strong> <a href="https://example.com/">链接</a>', classes: ["doc-image--right"], span: 0.5, alt: "一张图" }, "an image carries its picture, caption, side, width and alt words");
assert.deepEqual(parse(data([image])), [image], "and reads back");
assert.equal(unmadeCopy(null, [image]), null, "cut: made of its data, no longer refused");
assert.equal(unmadeCopy(document, [elsewhere(image)]), null, "in another report too");
assert.deepEqual(filesOf(document, [image]), [], "in its own document while its unit is there: no file to copy (the file copies its source)");
assert.deepEqual(filesOf(document, [elsewhere(image), { type: "highlight", blocks: [elsewhere(image)] }]), [{ path: "assets/photo.png", kind: "image" }], "elsewhere its picture's file, once");
for (const [what, wrong] of [["a file out of the folder", { src: "assets/../x.png" }], ["no picture", { src: "assets/notes.pdf" }], ["a class of no side", { classes: ["evil"] }], ["a width past the reading width", { span: 5 }], ["words of more than a line", { alt: "a\nb" }], ["a crop of nothing", { original: "assets/a.png", crop: "no" }]]) {
  assert.equal(parse(data([{ ...image, data: { ...image.data, ...wrong } }])), null, `the clipboard is not trusted: ${what}`);
}
// Made anew in another document: its picture the copy the paste made, shown where the page serves it, as the file writes one.
const anew = made(image);
assert.deepEqual([anew.getAttribute("data-ge-type"), anew.className, anew.getAttribute("style"), anew.querySelector("img").getAttribute("data-ge-src"), anew.querySelector("img").getAttribute("src"), anew.querySelector("img").alt],
  ["image", "doc-image doc-image--right", "--doc-span: 0.5;", "assets/image-0123456789ab.png", "/served/asset/assets/image-0123456789ab.png", "一张图"], "made anew: its looks, the copy's file shown where the page serves it");
assert.deepEqual(written(anew), { type: "image", src: "assets/image-0123456789ab.png", caption: '图的<strong>说明</strong> <a href="https://example.com/">链接</a>', classes: ["doc-image--right"], span: 0.5, alt: "一张图" }, "and written as it was");
const own = build(document, parse(data([image]))[0].data, { served });
assert.equal(own.querySelector("img").getAttribute("data-ge-src"), "assets/photo.png", "in its own document (cut): its own file");
const caption = build(document, { ...image.data, caption: '好<img src=x onerror="alert(1)"><script>x()</script>' }).querySelector("figcaption");
assert.equal(caption.innerHTML, "好", "its caption made again of the format bar's marks alone");
assert.equal(made(image, { files: new Map(), served }).querySelector("img"), null, "a file not copied: no picture of another document's");
// For other programs: a picture by its whole address, its caption a paragraph below it.
const shown = formats([image]);
assert.equal(shown.html, '<p><img src="http://127.0.0.1:8080/__gallery/edit/asset/r/assets/photo.png" alt="一张图"></p><p>图的<strong>说明</strong> <a href="https://example.com/">链接</a></p>', "its HTML: the picture by its whole address");
assert.equal(shown.text, "![一张图](http://127.0.0.1:8080/__gallery/edit/asset/r/assets/photo.png)\n\n图的**说明** 链接", "its Markdown");
assert.equal(joinedHtml([image]), '<p>图的<strong>说明</strong> <a href="https://example.com/">链接</a></p>', "in a cell or a title: its caption");
// One left empty: its placeholder; another program's (an address): filled on the page.
const empty = describe($("empty"));
assert.deepEqual(empty.data, { type: "image", src: "", caption: "" }, "an empty one carries nothing but that");
assert.equal(made(empty).querySelector(":scope > img"), null, "made anew: its placeholder");
assert.equal(build(document, parse(data([{ type: "image", src: "https://example.com/a.png" }]))[0]).getAttribute(PASTED_SOURCE), "https://example.com/a.png", "another program's picture: filled once on the page, as before");

// A file block: its file, name, size and caption.
const file = describe($("file"));
assert.deepEqual(file.data, { type: "file", href: "assets/notes.pdf", name: "笔记.pdf", size: "1.0 KiB", caption: "文件说明" }, "a file block carries its file, name, size and caption");
assert.deepEqual(filesOf(document, [elsewhere(file)]), [{ path: "assets/notes.pdf", kind: "file" }], "its file, kept as a file");
assert.deepEqual(written(made(file)), { type: "file", href: "assets/file-0123456789ab.pdf", name: "笔记.pdf", size: "1.0 KiB", caption: "文件说明" }, "made anew and written as it was, the copy's file");
assert.equal(made(file).querySelector("a").getAttribute("href"), "/served/file/assets/file-0123456789ab.pdf", "handed out where the page hands out files");
assert.equal(parse(data([{ ...file, data: { ...file.data, name: "a/b" } }])), null, "a name of no file: not trusted");
assert.equal(formats([file]).html, '<p><a href="http://127.0.0.1:8080/__gallery/edit/file/r/assets/notes.pdf">文件说明</a></p><p>文件说明</p>', "for other programs a link to it (its caption, else its name)");

// An embed of a file: its file, height and caption; one of a web page carries its address.
const embed = describe($("embed"));
assert.deepEqual(embed.data, { type: "embed", src: "assets/page.html", height: "300px", caption: "嵌入说明" }, "an embed carries its file, height and caption");
assert.deepEqual(filesOf(document, [elsewhere(embed)]), [{ path: "assets/page.html", kind: "embed" }], "its file, kept as an embed's");
const frame = made(embed);
assert.deepEqual([frame.className, frame.getAttribute("style"), frame.querySelector("iframe").getAttribute("data-ge-src"), frame.querySelector("iframe").getAttribute("sandbox")],
  ["doc-embed doc-embed--file", "--doc-embed-height: 300px;", "assets/embed-0123456789ab.html", "allow-scripts allow-popups allow-forms allow-modals"], "made anew: a file's frame, sandboxed, its height");
assert.deepEqual(written(frame), { type: "embed", src: "assets/embed-0123456789ab.html", height: "300px", caption: "嵌入说明" }, "and written as it was");
const page = made({ ...embed, data: { type: "embed", src: "https://example.com/page", span: "0.5", caption: "" } });
assert.deepEqual([page.className, page.querySelector("iframe").getAttribute("src"), page.hasAttribute(PASTED_SOURCE), written(page).span], ["doc-embed", "https://example.com/page", false, "0.5"], "one of a web page: its frame at once, its width");
assert.deepEqual(describe($("web")).data, { type: "embed", src: "https://example.com/page", caption: "" }, "one of a web page as the page is served (no mark of a file of the folder on it): its address");
assert.equal(build(document, parse(data([{ type: "embed", src: "https://example.com/page" }]))[0]).getAttribute(PASTED_SOURCE), "https://example.com/page", "another program's address: filled on the page, as before");
assert.equal(parse(data([{ ...embed, data: { ...embed.data, height: "2px" } }])), null, "a height of no frame: not trusted");

// A bookmark: its page and what it said, its icon a picture of the folder.
const mark = describe($("mark"));
assert.deepEqual(mark.data, { type: "bookmark", href: "https://example.com/", title: "示例网页", description: "一句描述", icon: "assets/icon.png", cover: null, caption: "" }, "a bookmark carries its page, title, description, icon and cover");
assert.deepEqual(filesOf(document, [elsewhere(mark)]), [{ path: "assets/icon.png", kind: "image" }], "its icon's file");
const card = made(mark);
assert.equal(card.querySelector(".doc-bookmark-icon").getAttribute("data-ge-src"), "assets/image-ba9876543210.png", "made anew: its icon the copy's");
assert.deepEqual(written(card), { type: "bookmark", href: "https://example.com/", title: "示例网页", description: "一句描述", icon: "assets/image-ba9876543210.png", cover: null, caption: "" }, "and written as it was");
assert.equal(formats([mark]).text, "[示例网页](https://example.com/)", "for other programs a link of its title");
assert.equal(parse(data([{ ...mark, data: { ...mark.data, href: "javascript:alert(1)" } }])), null, "a page of no web: not trusted");

// A row of columns holding an image: its columns carried, the image in one with its data.
const row = describe($("cols"));
assert.deepEqual(row.data.columns.map((column) => [column.ratio, column.blocks.map((block) => block.data?.type ?? block.type)]), [[0.6, ["paragraph"]], [undefined, ["image"]]], "a row carries its columns, an image in one with its data");
assert.deepEqual(filesOf(document, [elsewhere(row)]), [], "a row whose blocks are copies of units of this page: none");
assert.deepEqual(filesOf(document, [{ ...elsewhere(row), data: { ...row.data, columns: row.data.columns.map((column) => ({ ...column, blocks: column.blocks.map((block) => (block.type === "copy" ? elsewhere(block) : block)) })) } }]), [{ path: "assets/photo.png", kind: "image" }], "of another document: its image's file");

// The clipboard's own data in the HTML of a picture's write (picture.mjs), where no type of its own goes.
const payload = data([image]);
const html = `<html><body><img src="http://127.0.0.1:8080/x.png" alt="" ${HTML_MARK}="${payload.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}"></body></html>`;
assert.equal(ownData({ getData: (type) => (type === "text/html" ? html : "") }), payload, "read from its HTML");
assert.equal(ownData({ getData: (type) => (type === "text/html" ? "<img src=x>" : "") }), "", "none in HTML of another program's");

// The file's writers: an image's alt words, an embed's width.
const w = { block: (open, lines, close) => [open, ...lines, close].join(""), id: "" };
assert.equal(imageWriter.image.write({ src: "assets/a.png", caption: "", alt: '一 "张" 图' }, w), '<figure class="doc-image"><img src="assets/a.png" alt="一 &quot;张&quot; 图"><figcaption></figcaption></figure>', "the file writes an image's alt words");
assert.equal(imageWriter.image.check({ src: "assets/a.png", caption: "", alt: "a\nb" }, { validLeaf: () => true }), false, "words of one line");
assert.equal(embedWriter.embed.write({ src: "https://example.com/", height: "300px", span: "0.5", caption: "" }, w).startsWith('<figure class="doc-embed" style="--doc-embed-height: 300px; --doc-span: 0.5">'), true, "an embed's width with its height");
assert.equal(embedWriter.embed.check({ src: "https://example.com/", span: "7", caption: "" }, { validLeaf: () => true }), false, "a width of the reading width at most");

// The files of another document copied into this one's folder (carry.mjs): read where the server hands out
// that document's files (in its workspace), sent as an upload of their kind; one missing, refused or of no
// document stops it all.
{
  const { carryFiles } = await import("../../src/editor/page/clipboard/carry.mjs");
  const fetched = globalThis.fetch;
  globalThis.FileReader = dom.window.FileReader;
  const asked = [];
  globalThis.fetch = async (address) => {
    asked.push(address);
    return address.includes("missing") ? { ok: false } : { ok: true, blob: async () => new dom.window.Blob([new Uint8Array([1, 2, 3])], { type: "application/octet-stream" }) };
  };
  const sent = [];
  const upload = async (kind, body) => {
    sent.push([kind, body.name, body.data]);
    return { path: `assets/${kind}-0123456789ab.${body.name.split(".").pop()}` };
  };
  const said = [];
  const say = (words, kind) => said.push([words, kind ?? ""]);
  const found = await carryFiles([{ path: "assets/a.png", kind: "image" }, { path: "assets/b.pdf", kind: "file" }], { from: "other", project: "", upload, say });
  assert.deepEqual([...found], [["assets/a.png", "assets/image-0123456789ab.png"], ["assets/b.pdf", "assets/file-0123456789ab.pdf"]], "each file of the other document copied, by the path it had there");
  assert.deepEqual([...asked].sort(), ["/__gallery/edit/file/other/assets/a.png", "/__gallery/edit/file/other/assets/b.pdf"], "read where the server hands out that document's files");
  assert.deepEqual(sent.sort(), [["file", "b.pdf", "AQID"], ["image", "a.png", "AQID"]], "sent as uploads of their kind, their bytes as they were");
  asked.length = 0;
  await carryFiles([{ path: "assets/a.png", kind: "image" }], { from: "other", project: "/~ws-abc123", upload, say });
  assert.deepEqual(asked, ["/~ws-abc123/__gallery/edit/file/other/assets/a.png"], "another workspace's document: read in that workspace");
  assert.equal(await carryFiles([{ path: "assets/a.png", kind: "image" }], { from: "../x", project: "", upload, say }), null, "no document's name: nothing");
  assert.equal(await carryFiles([{ path: "assets/../a.png", kind: "image" }], { from: "other", project: "", upload, say }), null, "no file of a folder: nothing");
  assert.equal(await carryFiles([{ path: "assets/a.png", kind: "image" }, { path: "assets/missing.png", kind: "image" }], { from: "other", project: "", upload, say }), null, "one missing: nothing");
  assert.equal(await carryFiles([{ path: "assets/a.png", kind: "image" }], { from: "other", project: "", upload: async () => { throw new Error("图片太大（最多 10 MB）"); }, say }), null, "one refused: nothing");
  assert.ok(said.at(-1)[0].includes("图片太大") && said.at(-1)[1] === "error", "and the reason said");
  globalThis.fetch = fetched;
  delete globalThis.FileReader;
}

// After a review (2026-11-20). A copy carrying data is its unit only while the unit carries the same: once the
// page numbers its units anew (opened again after a cut), the number names another block, and two images with
// no caption (two files of one name, two embeds with no caption) say the same words.
{
  const main = document.querySelector("main");
  const twins = [
    ["an image", "image", (name) => `<figure class="doc-image" data-ge-unit-kind="image" contenteditable="false"><img src="/__gallery/edit/asset/r/assets/${name}.png" data-ge-src="assets/${name}.png" alt=""><figcaption contenteditable="true" data-ge-kind="mediaCaption"></figcaption></figure>`, (node) => node.querySelector("img").getAttribute("data-ge-src")],
    ["a file", "file", (name) => `<figure class="doc-file" data-ge-unit-kind="file" contenteditable="false"><a class="doc-file-link" href="/__gallery/edit/file/r/assets/${name}.pdf" data-ge-href="assets/${name}.pdf" download="报告.pdf"><span class="doc-file-name">报告.pdf</span></a><figcaption contenteditable="true" data-ge-kind="mediaCaption"></figcaption></figure>`, (node) => node.querySelector("a").getAttribute("data-ge-href")],
    ["an embed", "embed", (name) => `<figure class="doc-embed doc-embed--file" data-ge-unit-kind="embed" contenteditable="false"><iframe class="doc-embed-frame" src="/__gallery/edit/embed/r/assets/${name}.html" data-ge-src="assets/${name}.html"></iframe><figcaption contenteditable="true" data-ge-kind="mediaCaption"></figcaption></figure>`, (node) => node.querySelector("iframe").getAttribute("data-ge-src")],
  ];
  for (const [what, kind, markup, fileIn] of twins) {
    main.insertAdjacentHTML("beforeend", markup("a").replace("<figure", '<figure data-ge-unit="31"') + markup("b").replace("<figure", '<figure data-ge-unit="32"'));
    const [a, b] = [...main.querySelectorAll(`[data-ge-unit-kind="${kind}"]`)].slice(-2);
    const cut = describe(a);
    const own = fileIn(a);
    assert.equal(copied(document, cut), a, `${what}: its unit while it is there`);
    a.remove();
    b.setAttribute("data-ge-unit", "31"); // the page drawn anew: the other one is that unit now
    assert.equal(copied(document, cut), null, `${what} cut, the page numbered anew: the other one with no words either is not it`);
    assert.equal(unmadeCopy(document, [cut]), null, `${what}: made of its data`);
    assert.equal(fileIn(build(document, parse(data([cut]))[0])), own, `${what}: its own file, not the other one's`);
    b.setAttribute("data-ge-unit", "32");
    const copy = describe(b);
    assert.equal(copied(document, copy), b, `${what} copied: its unit (the file copying its source)`);
    b.querySelector("figcaption").textContent = "改过";
    assert.equal(copied(document, copy), null, `${what} changed since: made of what was copied`);
    b.remove();
  }
}

// What shows what its data cannot say (a picture, a file, a page or an icon of a web address, which the page
// never writes): no data, so that it is no empty block once cut or in another document. Copied in its document
// as it always was (the file copying its source); its cut refused, and in another document it is not pasted.
{
  const main = document.querySelector("main");
  const odd = [
    ["an image of a web address", `<figure class="doc-image" data-ge-unit="41" data-ge-unit-kind="image" contenteditable="false"><img src="https://example.com/web.png" alt="网图"><figcaption contenteditable="true" data-ge-kind="mediaCaption">网图说明</figcaption></figure>`],
    ["an image of a data: address", `<figure class="doc-image" data-ge-unit="42" data-ge-unit-kind="image" contenteditable="false"><img src="data:image/png;base64,AA==" alt=""><figcaption contenteditable="true" data-ge-kind="mediaCaption"></figcaption></figure>`],
    ["a file block of a web address", `<figure class="doc-file" data-ge-unit="43" data-ge-unit-kind="file" contenteditable="false"><a class="doc-file-link" href="https://example.com/a.pdf" download="a.pdf"><span class="doc-file-name">a.pdf</span></a><figcaption contenteditable="true" data-ge-kind="mediaCaption"></figcaption></figure>`],
    ["an embed of an http: page", `<figure class="doc-embed" data-ge-unit="44" data-ge-unit-kind="embed" contenteditable="false"><iframe class="doc-embed-frame" src="http://example.com/page"></iframe><figcaption contenteditable="true" data-ge-kind="mediaCaption"></figcaption></figure>`],
    ["an embed whose frame has no class of the kit's", `<figure class="doc-embed" data-ge-unit="45" data-ge-unit-kind="embed" contenteditable="false"><iframe src="https://example.com/page"></iframe><figcaption contenteditable="true" data-ge-kind="mediaCaption"></figcaption></figure>`],
    ["a bookmark whose icon is a web address", `<figure class="doc-bookmark" data-ge-unit="46" data-ge-unit-kind="bookmark" contenteditable="false"><a class="doc-bookmark-card" href="https://example.com/"><span class="doc-bookmark-text"><span class="doc-bookmark-title">示例</span><span class="doc-bookmark-url"><img class="doc-bookmark-icon" src="https://example.com/favicon.ico" alt=""><span class="doc-bookmark-href">https://example.com/</span></span></span></a><figcaption contenteditable="true" data-ge-kind="mediaCaption"></figcaption></figure>`],
  ];
  for (const [what, markup] of odd) {
    main.insertAdjacentHTML("beforeend", markup);
    const node = main.lastElementChild;
    const copy = describe(node);
    assert.equal(copy.data, undefined, `${what}: no data`);
    assert.deepEqual(parse(data([copy])), [copy], `${what}: the clipboard's data reads`);
    assert.equal(copied(document, copy), node, `${what}: copied in its document, of its unit`);
    assert.equal(unmadeCopy(null, [copy]), copy, `${what}: its cut refused`);
    assert.notEqual(unmadeCopy(document, [elsewhere(copy)]), null, `${what}: not pasted in another document`);
    node.remove();
  }
  assert.deepEqual(describe($("web")).data, { type: "embed", src: "https://example.com/page", caption: "" }, "an embed of an https: page still carries it");
  // One carrying no data is its unit while its markup is the same: two pictures of a web address with no
  // caption, the first deleted and the page numbered anew, are not the same one (the paste refused, not the
  // other one pasted).
  const web = (name) => `<figure class="doc-image" data-ge-unit-kind="image" contenteditable="false"><img src="https://example.com/${name}.png" alt=""><figcaption contenteditable="true" data-ge-kind="mediaCaption"></figcaption></figure>`;
  main.insertAdjacentHTML("beforeend", web("a").replace("<figure", '<figure data-ge-unit="47"') + web("b").replace("<figure", '<figure data-ge-unit="48"'));
  const [first, second] = [...main.children].slice(-2);
  const copy = describe(first);
  assert.equal(copied(document, copy), first, "a picture of a web address copied: its unit");
  first.remove();
  second.setAttribute("data-ge-unit", "47");
  assert.equal(copied(document, copy), null, "the page numbered anew: the other picture with no words either is not it");
  assert.notEqual(unmadeCopy(document, [copy]), null, "so its paste is refused");
  assert.equal(copied(document, describe(second)), second, "the other copied: its unit");
  second.remove();
}

// A cut of more blocks than a paste takes at once (500): the paste takes their HTML, so text comes back as text
// and the cut goes as it always did; with a block copied as itself among them (a picture: its paste would be a
// picture of an address), it is refused, nothing taken off.
{
  const { createClipboard } = await import("../../src/editor/page/clipboard/index.mjs");
  const main = document.querySelector("main");
  const box = document.createElement("div");
  main.append(box);
  box.innerHTML = Array.from({ length: 520 }, (_, index) => `<p contenteditable="true" data-ge-block="${1000 + index}" data-ge-unit="${1000 + index}" data-ge-unit-kind="paragraph">第 ${index} 段</p>`).join("");
  const paragraphs = [...box.children];
  globalThis.getSelection = () => dom.window.getSelection();
  const cut = (picked) => {
    const removed = [];
    const said = [];
    const written = {};
    const clipboard = createClipboard({ editing: () => true, blocks: () => ({ picked, folds: { takenWith: (nodes) => nodes }, remove: (nodes) => removed.push(...nodes), select() {} }), struct: () => null, recordText() {}, say: (words) => said.push(words) });
    clipboard.copy({ type: "cut", clipboardData: { setData: (type, value) => { written[type] = value; } }, preventDefault() {} });
    return { removed: removed.length, said: said.join(" "), written: Boolean(written["application/x-gallery-blocks"]) };
  };
  assert.deepEqual(cut(paragraphs), { removed: 520, said: "", written: true }, "520 paragraphs cut: on the clipboard and off the page");
  assert.deepEqual(cut(paragraphs.slice(0, 3)), { removed: 3, said: "", written: true }, "a few, the same");
  const withPicture = cut([...paragraphs, $("img")]);
  assert.deepEqual([withPicture.removed, withPicture.written, /超过 500 块/.test(withPicture.said)], [0, false, true], "with a picture among them: refused, the reason said, nothing taken off");
  assert.deepEqual(cut([paragraphs[0], $("img")]).removed, 2, "a picture with a few: cut");
  delete globalThis.getSelection;
  box.remove();
}

// Data that is none a paste takes (an Agent's: a size the page never writes, a name of no file, words of two
// lines or past 1000, a width written 0.50): none carried, so that the copy within its document is of its unit
// (the file copying its source: no link of the page's address written in its place), and a cut is refused.
{
  const main = document.querySelector("main");
  const file = (name, size) => `<figure class="doc-file" data-ge-unit-kind="file" contenteditable="false"><a class="doc-file-link" href="/__gallery/edit/file/r/assets/n.pdf" data-ge-href="assets/n.pdf" download="${name}"><span class="doc-file-name">${name}</span><span class="doc-file-size">${size}</span></a><figcaption contenteditable="true" data-ge-kind="mediaCaption">文件说明</figcaption></figure>`;
  const image = (alt) => `<figure class="doc-image" data-ge-unit-kind="image" contenteditable="false"><img src="/__gallery/edit/asset/r/assets/a.png" data-ge-src="assets/a.png" alt="${alt}"><figcaption contenteditable="true" data-ge-kind="mediaCaption"></figcaption></figure>`;
  const odd = [
    ["a file's size of 2.3 MB", file("n.pdf", "2.3 MB")],
    ["a file's name with a colon", file("a:b.pdf", "1.0 KiB")],
    ["a file's name with a question mark", file("a?.pdf", "1.0 KiB")],
    ["a picture's words of two lines", image("一行&#10;两行")],
    ["a picture's words past 1000", image("字".repeat(1001))],
    ["an embed's width written 0.50", `<figure class="doc-embed doc-embed--file" style="--doc-span: 0.50" data-ge-unit-kind="embed" contenteditable="false"><iframe class="doc-embed-frame" src="/__gallery/edit/embed/r/assets/page.html" data-ge-src="assets/page.html"></iframe><figcaption contenteditable="true" data-ge-kind="mediaCaption"></figcaption></figure>`],
  ];
  for (const [what, markup] of odd) {
    main.insertAdjacentHTML("beforeend", markup.replace("<figure", '<figure data-ge-unit="51"'));
    const node = main.lastElementChild;
    const copy = describe(node);
    assert.equal(copy.data, undefined, `${what}: no data`);
    assert.deepEqual(parse(data([copy])), [copy], `${what}: the clipboard's data reads (it was refused whole)`);
    assert.equal(build(document, parse(data([copy]))[0]).getAttribute("data-ge-copy"), "51", `${what}: copied in its document as a copy of its unit`);
    assert.equal(unmadeCopy(null, [copy]), copy, `${what}: its cut refused`);
    node.remove();
  }
  // In a row of columns: the row carries its columns, the block in one no data; the row's cut refused.
  main.insertAdjacentHTML("beforeend", `<div class="doc-columns" data-ge-unit="61" data-ge-unit-kind="columns" data-ge-box="11" data-ge-box-kind="columns"><div class="doc-column" data-ge-unit="62" data-ge-unit-kind="column" data-ge-box="12" data-ge-box-kind="column"><p contenteditable="true" data-ge-block="63" data-ge-unit="63" data-ge-unit-kind="paragraph">左</p></div><div class="doc-column" data-ge-unit="64" data-ge-unit-kind="column" data-ge-box="13" data-ge-box-kind="column">${file("n.pdf", "2.3 MB").replace("<figure", '<figure data-ge-unit="65"')}</div></div>`);
  const row = describe(main.lastElementChild);
  assert.ok(row.data && parse(data([row])), "a row holding one: its data reads");
  assert.notEqual(unmadeCopy(null, [row]), null, "and its cut is refused");
  main.lastElementChild.remove();
}

// A picture's PNG made after the copy gives way to a copy made anywhere else meanwhile (picture.mjs): this page's
// copy events say one made on it, the focus leaving it one made in the workbench, another document or program.
{
  const { createPictures } = await import("../../src/editor/page/clipboard/picture.mjs");
  const keep = { navigator: Object.getOwnPropertyDescriptor(globalThis, "navigator"), ClipboardItem: globalThis.ClipboardItem, hasFocus: document.hasFocus };
  let focus = true;
  document.hasFocus = () => focus;
  const written = [];
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: { write: async ([item]) => written.push(await item.items["image/png"]) } }, configurable: true, writable: true });
  globalThis.ClipboardItem = class {
    constructor(items) {
      this.items = items;
    }
  };
  let release = () => {};
  const shots = createPictures({ png: () => new Promise((resolve) => { release = () => resolve(new dom.window.Blob(["png"], { type: "image/png" })); }) });
  const img = document.createElement("img");
  img.src = "http://127.0.0.1:8080/x.png";
  const went = shots.write(img, "{}", "图");
  release();
  assert.equal(await went, true, "the page still has the focus: the PNG goes");
  const away = shots.write(img, "{}", "图");
  focus = false; // the reader went on to copy in the workbench, another document's frame or another program
  release();
  assert.equal(await away, false, "the focus gone from the page while it was made: it does not go");
  focus = true;
  const again = shots.write(img, "{}", "图");
  document.dispatchEvent(new dom.window.Event("copy"));
  release();
  assert.equal(await again, false, "a copy of the page meanwhile: it does not go");
  assert.equal(written.length, 1, "one PNG written");
  if (keep.navigator) Object.defineProperty(globalThis, "navigator", keep.navigator);
  globalThis.ClipboardItem = keep.ClipboardItem;
  document.hasFocus = keep.hasFocus;
}

// A table's cells copied by its tools name the workspace of their document too (cellsPayload), as blocks do:
// pasted in another workspace's document of the same name, their pictures are not taken for this one's files.
{
  const { cellsPayload, CELLS_MIME } = await import("../../src/editor/components/table/index.mjs");
  const { createClipboard } = await import("../../src/editor/page/clipboard/index.mjs");
  const page = globalThis.location;
  globalThis.location = { pathname: "/~ws-abc123/generated/r.html", href: "http://127.0.0.1:8080/~ws-abc123/generated/r.html" };
  const there = cellsPayload([['<img src="assets/a.png" alt="">']], document);
  globalThis.location = page;
  assert.deepEqual(JSON.parse(there), { v: 1, cells: [['<img src="assets/a.png" alt="">']], report: "r", project: "/~ws-abc123" }, "copied in another workspace: it says which");
  assert.deepEqual(JSON.parse(cellsPayload([["甲"]], document)), { v: 1, cells: [["甲"]], report: "r" }, "in the first: none, as blocks say it");
  const clipboard = createClipboard({ editing: () => true, blocks: () => ({ picked: [], select() {} }), struct: () => null, recordText() {}, say() {} });
  const of = (payload) => clipboard.cellsOf({ getData: (type) => (type === CELLS_MIME ? payload : "") });
  const read = of(there);
  assert.deepEqual([read.from, read.project, read.same], ["r", "/~ws-abc123", false], "pasted in this workspace's document of that name: of another document");
  assert.deepEqual([of(cellsPayload([["甲"]], document)).same, of(JSON.stringify({ v: 1, cells: [["甲"]] })).from], [true, null], "in its own document: its own; of no document: none");
}

Object.assign(globalThis, saved);
console.log("Checked copying media blocks: an image, a file, an embed and a bookmark carry what a new one is written with (an image's alt words too), checked as the file's writers take it; made anew of it once cut and in another document, their files of the folder named for the paste to copy and shown as the copies; a row of columns carrying its columns; for other programs a picture and links by their whole address; the clipboard's own data read from a picture's HTML; the files of another document copied in as uploads of their kind (in its workspace), one missing or refused stopping it all; the writers' alt words and an embed's width.");
