import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { assetReferenceFailures, embedReferences } from "../../src/render/asset-references.mjs";
import { pruneUnusedKitTags, withKitTags } from "../../src/render/assets.mjs";
import { embedIcon } from "../../src/render/emoji.mjs";
import { embedFrames } from "../../src/render/embeds.mjs";
import { embedFiles } from "../../src/render/files.mjs";
import { embedImages } from "../../src/render/images.mjs";
import { exportFailures } from "../../src/render/pipeline.mjs";
import { renderReportHtml } from "../../src/render/report-html.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { exportPage } from "../../src/transfer/export.mjs";
import { readZip } from "../../src/transfer/zip.mjs";
import { newNames } from "../../src/shared/new-names.mjs";

// The preview names a file of the folder by its stamp (render/media-ref.mjs servedUrl: tests/unit/written-files.mjs);
// left out where what is checked is the address.
const unstamped = (html) => html.replace(new RegExp("[?]v=[0-9a-f]{12}", "g"), "");

// References to files of the report's folder outside the media blocks (render/asset-references.mjs,
// docs/render.md "References to the report's folder"): a report with every kind of them (a picture
// in a table cell, a figure of two pictures, a picture in a link, a whole block's picture and
// background, a link to a file, CSS url() and image-set() in a <style> and a style attribute (a CSS
// escape read), a font, a srcset, a poster, an SVG's image, a frame's page, a table cell's background
// attribute, the tab's icon) exported holds each as a data: URL of its file's bytes (a srcset its
// largest candidate, a link a name to save it by), no assets/ left, and passes what an export needs;
// the preview serves each from its route, saying what the file has (once); a CSS string or comment
// holds none; what an export cannot hold (a frame of a PDF or a picture among it), a file not there
// or not served (each why), a link that would open a page and repeats outside the media blocks over
// the budget fail, each with its line; the Markdown export carries the pictures (a cell's in its
// table, a list item's, no link's icon, an alt's brackets escaped) and files (each once in the zip);
// and the Component Catalog and the browser tests' sample come out as the media blocks alone made them, byte
// for byte.

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const FILES = {
  "a.png": PNG,
  "b.png": Buffer.concat([PNG, Buffer.from("two")]),
  "c.png": Buffer.concat([PNG, Buffer.from("three")]),
  "d.csv": Buffer.from("年份,数量\n2024,3\n"),
  "f.woff2": Buffer.from("wOF2-font"),
  "p.html": Buffer.from("<p>附录</p>"),
  "q.html": Buffer.from("<p>另一页</p>"),
  "e.pdf": Buffer.from("%PDF-1.4\n%%EOF\n"),
  "图 1.png": PNG,
};
const TYPES = { png: "image/png", csv: "text/csv", woff2: "font/woff2", html: "text/html", pdf: "application/pdf" };
const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-references-"));
const directory = path.join(root, "alpha");
await fs.mkdir(path.join(directory, "assets"), { recursive: true });
for (const [name, bytes] of Object.entries(FILES)) await fs.writeFile(path.join(directory, "assets", name), bytes);
// Files there that the preview serves by no name: one in a folder of assets/, one named too long.
await fs.mkdir(path.join(directory, "assets", "sub"));
await fs.writeFile(path.join(directory, "assets", "sub", "a.png"), PNG);
await fs.writeFile(path.join(directory, "assets", `${"n".repeat(82)}.png`), PNG);
const url = (name) => `data:${TYPES[name.split(".").pop()]};base64,${FILES[name].toString("base64")}`;

// A page whose body starts on line 11 (`body` line n is line 10 + n of the file).
const page = (body) => `<!doctype html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width">\n<title>T</title>\n<link rel="icon" href="assets/a.png">\n</head>\n<body>\n<main class="doc-page" data-doc-id="alpha">\n${body}\n</main>\n</body>\n</html>\n`;
const failuresOf = (body) => assetReferenceFailures({ html: page(body), directory });
const shown = (html, mode) => embedReferences(html, { slug: "alpha", mode, reportsDirectory: root });

// ---------- every kind, exported: each a data: URL of its file ----------
const every = [
  '<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>图</th><th>说明</th></tr></thead><tbody><tr><td><img src="assets/a.png" alt="甲"></td><td>格子</td></tr></tbody></table></div>',
  '<figure><img src="assets/a.png" alt="一"><img src=\'./assets/b.png\' alt="二"><figcaption>两张</figcaption></figure>',
  '<p><a href="assets/c.png"><img src="assets/a.png" alt="链"></a></p>',
  '<div class="hero" style="background: url(assets/c.png) no-repeat"><img src="assets/b.png?v=2" alt="块"></div>',
  '<p>附件 <a href="assets/d.csv" download>数据</a>，<a href="assets/d.csv" download="年表.csv">年表</a>，<a href="assets/p.html" download="附录.html">附录</a></p>',
  "<style>\n.x { background: url('assets/b.png'); }\n.y { background-image: image-set(\"assets/a.png\" 1x, url(assets/b.png) 2x); }\n@font-face { font-family: F; src: url(assets/f.woff2) format(\"woff2\"); }\n.e { background: url(assets\\/a.png); }\n</style>",
  '<div class="media"><img src="assets/a.png" srcset="assets/a.png 1x, assets/c.png 3x, assets/b.png 2x" alt="密"><picture><source srcset="assets/b.png 800w, assets/c.png 400w" sizes="50vw"><img src="assets/a.png" alt="宽"></picture><video poster="assets/c.png"></video><svg><image href="assets/a.png#v" width="1" height="1"/></svg><iframe src="assets/p.html" sandbox="allow-scripts"></iframe></div>',
  '<table><tbody><tr><td background="assets/c.png">底</td></tr></tbody></table>',
].join("\n");
{
  const html = page(every);
  assert.deepEqual(exportFailures({ slug: "alpha", html, directory }), [], "every kind passes what an export needs");
  const exported = renderReportHtml(html, { slug: "alpha", reportsDirectory: root }).html;
  assert.ok(!/assets\//.test(exported), `no assets/ left in the export: ${exported.match(/.{40}assets\/.{40}/)?.[0]}`);
  // Each data: URL holds the bytes of a file of the folder.
  const urls = [...exported.matchAll(/data:([a-z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)/g)];
  assert.ok(urls.length >= 20, `${urls.length} data: URLs`);
  for (const [, type, data] of urls) {
    const bytes = Buffer.from(data, "base64");
    assert.ok(Object.entries(FILES).some(([name, file]) => file.equals(bytes) && TYPES[name.split(".").pop()] === type), `a data: URL of ${type} is a file's bytes`);
  }
  for (const [what, written] of [
    ["a picture in a table cell", `<td><img src="${url("a.png")}" alt="甲"></td>`],
    ["a figure of two pictures (one in single quotes, ./assets/)", `<figure><img src="${url("a.png")}" alt="一"><img src="${url("b.png")}" alt="二">`],
    ["a picture in a link, the link a file to save", `<a href="${url("c.png")}" download="c.png"><img src="${url("a.png")}" alt="链"></a>`],
    ["a whole block's background and picture (its query left out)", `<div class="hero" style="background: url(${url("c.png")}) no-repeat"><img src="${url("b.png")}" alt="块">`],
    ["a link to a file: an empty download given the file's name", `<a href="${url("d.csv")}" download="d.csv">数据</a>`],
    ["a link's own download name kept", `<a href="${url("d.csv")}" download="年表.csv">`],
    ["an HTML file linked with download", `<a href="${url("p.html")}" download="附录.html">`],
    ["a <style>'s url()", `.x { background: url('${url("b.png")}'); }`],
    ["image-set()'s strings and url()s", `image-set("${url("a.png")}" 1x, url(${url("b.png")}) 2x)`],
    ["a font", `src: url(${url("f.woff2")}) format("woff2")`],
    ["a CSS escape, read as CSS reads it (assets\\/a.png)", `.e { background: url(${url("a.png")}); }`],
    ["a table cell's background, which browsers still draw", `<td background="${url("c.png")}">底</td>`],
    ["a srcset: its largest candidate alone, with its descriptor", `<img src="${url("a.png")}" srcset="${url("c.png")} 3x" alt="密">`],
    ["a source's srcset: the widest", `<source srcset="${url("b.png")} 800w" sizes="50vw">`],
    ["a poster", `<video poster="${url("c.png")}">`],
    ["an SVG's image, its fragment kept", `<image href="${url("a.png")}#v"`],
    ["a frame", `<iframe src="${url("p.html")}" sandbox="allow-scripts">`],
    ["the tab's icon", `<link rel="icon" href="${url("a.png")}">`],
  ]) assert.ok(exported.includes(written), `${what}: ${written.slice(0, 120)}`);
  // `files` false (the workbench's 导出 without its files): every reference stays a link to the folder.
  assert.equal(renderReportHtml(html, { slug: "alpha", files: false, reportsDirectory: root }).html.match(/assets\//g).length, html.match(/assets\//g).length);
}

// ---------- the preview: each where the server serves the folder ----------
{
  const served = unstamped(shown(page(every), "preview"));
  for (const [what, written] of [
    ["a picture: the asset route, what the file has said", '<td><img src="/__gallery/edit/asset/alpha/assets/a.png" data-ge-src="assets/a.png" alt="甲"></td>'],
    ["./assets/ and single quotes", '<img src="/__gallery/edit/asset/alpha/assets/b.png" data-ge-src="./assets/b.png" alt="二">'],
    ["a link: the file route, which hands the file out", '<a href="/__gallery/edit/file/alpha/assets/c.png" data-ge-href="assets/c.png">'],
    ["a link's download left as written", '<a href="/__gallery/edit/file/alpha/assets/d.csv" data-ge-href="assets/d.csv" download>数据</a>'],
    ["a style attribute's url()", 'style="background: url(/__gallery/edit/asset/alpha/assets/c.png) no-repeat"'],
    ["a <style>'s url() and image-set()", `.y { background-image: image-set("/__gallery/edit/asset/alpha/assets/a.png" 1x, url(/__gallery/edit/asset/alpha/assets/b.png) 2x); }`],
    ["a font: its bytes from the file route", "src: url(/__gallery/edit/file/alpha/assets/f.woff2)"],
    ["a srcset: every candidate served", 'srcset="/__gallery/edit/asset/alpha/assets/a.png 1x, /__gallery/edit/asset/alpha/assets/c.png 3x, /__gallery/edit/asset/alpha/assets/b.png 2x" data-ge-srcset="assets/a.png 1x, assets/c.png 3x, assets/b.png 2x"'],
    ["a poster", '<video poster="/__gallery/edit/asset/alpha/assets/c.png" data-ge-poster="assets/c.png">'],
    ["a frame: the embed route", '<iframe src="/__gallery/edit/embed/alpha/assets/p.html" data-ge-src="assets/p.html" sandbox="allow-scripts">'],
    ["a background: the asset route", '<td background="/__gallery/edit/asset/alpha/assets/c.png" data-ge-background="assets/c.png">底</td>'],
  ]) assert.ok(served.includes(written), `${what}: ${written}`);
  assert.ok(!/\s(?:src|href|poster|srcset|background)="(?:\.\/)?assets\//.test(served) && !/url\('?assets\//.test(served), "nothing left loading assets/ from the page's own address");
  // A mark the file writes itself gives way to the preview's (a browser keeps the first of two).
  const marked = shown(page('<p><img data-ge-src="old" src="assets/a.png" alt=""></p>'), "preview");
  assert.deepEqual(marked.match(/data-ge-src="[^"]*"/g), ['data-ge-src="assets/a.png"'], marked);
  // So does one under the name it had before 2026-10-28 (data-rs-), which a file may keep.
  const old = shown(page('<p><img data-rs-src="old" src="assets/a.png" alt=""></p>'), "preview");
  assert.ok(!old.includes("data-rs-src") && old.includes('data-ge-src="assets/a.png"'), old);
}

// ---------- CSS as CSS reads it: none in a string or a comment, an @import however far its url() ----------
{
  const css = page("<style>\n.s::after { content: \"url(assets/b.png)\"; } /* url(assets/gone.png) */\n@import /* a comment longer than forty characters, as some write */ url(assets/d.csv);\n</style>");
  assert.ok(shown(css, "export").includes('.s::after { content: "url(assets/b.png)"; }'), "a CSS string loads nothing: it stays as it is");
  assert.deepEqual(assetReferenceFailures({ html: css, directory }), [
    "line 13: @import url(assets/d.csv) in <style>: an export holds no stylesheet of the folder (the addresses in one are read from its own place): put its rules in the page's <style>",
  ]);
}

// ---------- what fails, each with its line ----------
{
  assert.deepEqual(failuresOf(every), [], "every kind above: nothing");
  const found = failuresOf([
    '<object data="assets/d.csv"></object>',
    '<embed src="assets/p.html">',
    '<script src="assets/x.js"></script>',
    '<link rel="stylesheet" href="assets/d.csv">',
    "<style>@import \"assets/x.css\";\n@import url(assets/d.csv);</style>",
    '<p><img src="assets/gone.png" alt=""> <a href="assets/../report.json">上一级</a></p>',
    '<p><img src="assets/%E5%9B%BE%201.png" alt=""></p>',
    '<p><a href="assets/q.html">另一页</a></p>',
    "<div class=\"doc-panel\"><div class=\"doc-icon\"><img src='assets/a.png' alt=\"\"></div><p>x</p></div>",
    '<p><a href="ASSETS/a.png">大写</a></p>',
    '<iframe src="assets/a.png"></iframe>',
    '<iframe src="assets/e.pdf"></iframe>',
    '<p><img src="assets/sub/a.png" alt=""></p>',
    `<p><img src="assets/${"n".repeat(82)}.png" alt=""></p>`,
    '<object data="assets/e.pdf"></object>',
  ].join("\n"));
  // Why the preview serves no file by a name, each reason apart (shared/media.mjs assetProblem, the
  // media blocks' too), with a name it takes.
  const rename = (why, as) => `${why}, which the preview serves no file by (a name is 1 to 81 characters, each a letter a-z or A-Z, a digit, a dot, a dash or an underscore, the first a letter or a digit): copy the file in under such a name, as assets/${as}`;
  const htmlBlock = "<figure class=\"doc-embed doc-embed--file\"><iframe class=\"doc-embed-frame\" src=\"assets/<file>.html\" sandbox=\"allow-scripts\"></iframe><figcaption></figcaption></figure>";
  const pdfBlock = "its frame with no sandbox (a sandboxed one shows no PDF): <figure class=\"doc-embed doc-embed--file\"><iframe class=\"doc-embed-frame\" src=\"assets/<file>.pdf\"></iframe><figcaption></figcaption></figure>";
  assert.deepEqual(found, [
    "line 11: <object data=\"assets/d.csv\">: an export's policy loads no plugin content (<object>, <embed>): show a picture with <img src=\"assets/<file>\">, a file to save with a link, <a href=\"assets/<file>\" download=\"<name>\">",
    `line 12: <embed src="assets/p.html">: an export's policy loads no plugin content (<object>, <embed>): show a page in an embed block, ${htmlBlock}`,
    "line 13: <script src=\"assets/x.js\"> names a file that is not in the document's folder",
    "line 13: <script src=\"assets/x.js\">: an export runs the page's own scripts alone: put the code in the page's <script>",
    "line 14: <link href=\"assets/d.csv\">: an export holds no stylesheet of the folder (the addresses in one are read from its own place): put its rules in the page's <style>",
    "line 15: @import \"assets/x.css\" in <style> names a file that is not in the document's folder",
    "line 15: @import \"assets/x.css\" in <style>: an export holds no stylesheet of the folder (the addresses in one are read from its own place): put its rules in the page's <style>",
    "line 16: @import url(assets/d.csv) in <style>: an export holds no stylesheet of the folder (the addresses in one are read from its own place): put its rules in the page's <style>",
    "line 17: <img src=\"assets/gone.png\"> names a file that is not in the document's folder",
    "line 17: <a href=\"assets/../report.json\"> names a file that is not in the document's folder",
    `line 18: <img src="assets/%E5%9B%BE%201.png">: ${rename("its name holds 图, a space", "1.png")}`,
    `line 19: <a href="assets/q.html"> opens an HTML file, which an export cannot (a browser opens no page from a data: address): show it in an embed block, ${htmlBlock}, or give the link download="<name>" to hand it out as a file`,
    "line 20: <img src=\"assets/a.png\"> is in an icon (.doc-icon) written as an icon is not read (its picker, the browser tab's icon): write it <div class=\"doc-icon\"><img src=\"assets/<file>\" alt=\"\"></div>, in double quotes and with no other class",
    "line 21: <a href=\"ASSETS/a.png\">: the folder is assets/, in lowercase: write it so (assets/a.png)",
    "line 22: <iframe src=\"assets/a.png\">: a frame shows a page of the folder (an HTML file), not this file, which the preview would hand out for saving: show a picture with <img src=\"assets/<file>\">, a file to save with a link, <a href=\"assets/<file>\" download=\"<name>\">",
    `line 23: <iframe src="assets/e.pdf">: a PDF shows in an embed block alone (the kit hands its file to the browser's PDF viewer, in the preview and in an export): make it one, ${pdfBlock}`,
    "line 24: <img src=\"assets/sub/a.png\">: the preview serves the files right in assets/, none in a folder of it (assets/sub/): move the file into assets/, as assets/a.png",
    `line 25: <img src="assets/${"n".repeat(82)}.png">: ${rename("its name is 86 characters", `${"n".repeat(77)}.png`)}`,
    `line 26: <object data="assets/e.pdf">: an export's policy loads no plugin content (<object>, <embed>): show a PDF in an embed block, ${pdfBlock}`,
  ], found.join("\n"));
  // The embed block a failure names passes every check of an export as it is, its file put in: an
  // HTML file's frame sandboxed, a PDF's with none (a sandboxed frame shows no PDF: embeds.mjs).
  for (const [line, file] of [[12, "p.html"], [19, "q.html"], [23, "e.pdf"], [26, "e.pdf"]]) {
    const block = found.find((failure) => failure.startsWith(`line ${line}: `)).match(/<figure class="doc-embed[^]*?<\/figure>/)[0].replace(/assets\/<file>\.\w+/, `assets/${file}`);
    assert.deepEqual(exportFailures({ slug: "alpha", html: page(block), directory }), [], block);
  }
  // What fails stays as written: the export holds nothing it cannot show.
  const kept = shown(page('<object data="assets/d.csv"></object>\n<p><a href="assets/q.html">另一页</a> <img src="assets/gone.png" alt=""></p>\n<iframe src="assets/e.pdf"></iframe><iframe src="assets/a.png"></iframe>'), "export");
  assert.ok(kept.includes('<object data="assets/d.csv">') && kept.includes('<a href="assets/q.html">') && kept.includes('<img src="assets/gone.png" alt="">'));
  assert.ok(kept.includes('<iframe src="assets/e.pdf"></iframe><iframe src="assets/a.png"></iframe>'), "a frame of a PDF or a picture stays as written");
  assert.ok(shown(page('<iframe src="assets/a.png"></iframe>'), "preview").includes('<iframe src="assets/a.png">'), "nor does the preview serve it at the file route, which would hand it out");
  // A media block's file not there: the block's own check says it (images.mjs), not this one.
  assert.deepEqual(failuresOf('<figure class="doc-image"><img src="assets/gone.png" alt=""><figcaption></figcaption></figure>'), []);
}

// ---------- the same file again and again: repeats up to a budget ----------
{
  await fs.writeFile(path.join(directory, "assets", "big.png"), Buffer.alloc(400_000, 1));
  const twice = failuresOf('<p><img src="assets/big.png" alt=""></p>\n<figure class="doc-image"><img src="assets/big.png" alt=""><figcaption></figcaption></figure>');
  assert.deepEqual(twice, [], "once more: 533,336 bytes, under the budget");
  const often = failuresOf('<p><img src="assets/big.png" alt=""></p>\n<figure class="doc-image"><img src="assets/big.png" alt=""><figcaption></figcaption></figure>\n<style>.z { background: url(assets/big.png); }</style>\n<img src="assets/a.png" alt=""><img src="assets/a.png" alt="">');
  assert.deepEqual(often, ["files embedded more than once make an export 1,066,864 bytes bigger, over the 1,000,000 bytes the copies outside the media blocks may add: assets/big.png twice besides a media block's or the icon's (lines 11 and 13), assets/a.png 3 times (lines 7 and 14); show each fewer times (a picture, a link or a frame holds a copy of its own each time it is written), or, for a CSS background (url() in a <style> or a style attribute), name it once in the page's <style> (--picture: url(assets/<file>)) and write var(--picture) where it shows"], often.join("\n"));
  // The media blocks' own repeats are theirs, as they were before any other reference was embedded:
  // four image blocks of one picture (a block copied in the editor keeps its src) pass.
  const block = '<figure class="doc-image"><img src="assets/big.png" alt=""><figcaption></figcaption></figure>';
  assert.deepEqual(failuresOf([block, block, block, block].join("\n")), [], "four image blocks of one picture");
  assert.deepEqual(failuresOf([block, block, block, '<p><img src="assets/big.png" alt=""></p>'].join("\n")), [], "and a picture beside them: one copy more");
  // A srcset's smaller candidates are no copies (an export keeps the largest alone).
  assert.deepEqual(failuresOf('<img src="assets/a.png" srcset="assets/big.png 1x, assets/c.png 2x" alt=""><img src="assets/big.png" alt="">\n<img src="assets/big.png" alt="">'), []);
  await fs.rm(path.join(directory, "assets", "big.png"));
}

// ---------- the Markdown export: a cell's picture in its table, files beside the page ----------
{
  const more = [
    '<ul><li>项 <img src="assets/b.png" alt="列表图"></li></ul>',
    '<figure><img src="assets/c.png" alt="三"><figcaption>见 <a class="doc-link-mention" href="https://example.com/"><img class="doc-link-mention-icon" src="assets/a.png" alt="">示例站</a></figcaption></figure>',
    '<p><img src="assets/a.png" alt="a](evil) ![b"> 文字</p>',
  ];
  await fs.writeFile(path.join(directory, "report.html"), page([every, ...more].join("\n")));
  const site = { reportsDirectory: root, titleOf: async () => "甲报告", childrenOf: async () => [], links: async () => ({ links: new Map() }), offline: async () => assert.fail("no offline file for Markdown"), check: async () => {} };
  const { name, data } = await exportPage("alpha", { format: "markdown" }, site);
  const entries = readZip(data);
  assert.deepEqual(entries.map((file) => file.name).filter((file, index, all) => all.indexOf(file) !== index), [], "each file once in the zip, however often the page shows it");
  const files = new Map(entries.map((file) => [file.name, file.data]));
  const markdown = files.get("甲报告.md").toString("utf8");
  assert.equal(name, "甲报告.zip");
  for (const written of [
    "| ![甲](assets/a.png) | 格子 |", "![一](assets/a.png)\n\n![二](assets/b.png)\n\n两张", "[![链](assets/a.png)](assets/c.png)", "附件 [数据](assets/d.csv)，[年表](assets/d.csv)，[附录](assets/%E9%99%84%E5%BD%95.html)", "![块](assets/b.png)",
    "- 项 ![列表图](assets/b.png)", // a list item's picture, as a paragraph's
    "![三](assets/c.png)\n\n见 [示例站](https://example.com/)", // a link's icon is the link's: no picture line of its own
    "![a\\](evil) !\\[b](assets/a.png) 文字", // an alt's brackets escaped
  ]) {
    assert.ok(markdown.includes(written), `${written}\n---\n${markdown}`);
  }
  assert.ok(!/^!\[\]\(assets\/a\.png\)$/m.test(markdown), `no stray picture of a link's icon\n---\n${markdown}`);
  for (const file of ["a.png", "b.png", "c.png", "d.csv"]) assert.ok(files.get(`assets/${file}`)?.equals(FILES[file]), `assets/${file} beside the page, as its bytes`);
  assert.ok(files.get("assets/附录.html")?.equals(FILES["p.html"]), "a file linked with a download name goes by that name");
}

// ---------- the Component Catalog and the sample: the media blocks' output alone ----------
{
  const reports = [
    { slug: "component-catalog", html: newNames(await fs.readFile(path.join(projectRoot, "tests", "fixtures", "component-catalog", "doc.html"), "utf8")) }, // as the tools read it (its old names new)
    { slug: "sample", html: await fs.readFile(path.join(projectRoot, "tests", "browser", "fixtures", "sample", "doc.html"), "utf8"), reportsDirectory: path.join(projectRoot, "tests", "browser", "fixtures") },
  ];
  for (const { slug, html, reportsDirectory } of reports) {
    for (const mode of ["preview", "export"]) {
      const options = { slug, mode, ...(reportsDirectory ? { reportsDirectory } : {}) };
      const { html: kept, used } = pruneUnusedKitTags(html);
      const media = embedFrames(embedFiles(embedImages(embedIcon(withKitTags(kept, { used }), options), options), options), options);
      assert.equal(renderReportHtml(html, options).html, media, `${slug} (${mode}): as its media blocks make it, byte for byte`);
    }
  }
}

await fs.rm(root, { recursive: true, force: true });
console.log("Checked references to the document's folder outside the media blocks: every kind exported as a data: URL of its file's bytes (a srcset's largest, a link with a name to save it by, a cell's background, a CSS escape read, no assets/ left) and passing the export's check, served from its route in the preview (its mark once), none in a CSS string or comment, what an export cannot hold (a frame of a PDF or a picture) or the preview cannot serve (each why) failing with its line, repeats outside the media blocks up to a budget, the Markdown export's pictures (a list item's, no link's icon, an alt escaped) and files (each once), and the Component Catalog and the sample as their media blocks make them.");
