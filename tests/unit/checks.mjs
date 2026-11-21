import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { naturalize, repeatedBlockIds } from "../../src/editor/source.mjs";
import { embedFrames } from "../../src/render/embeds.mjs";
import { embedFiles } from "../../src/render/files.mjs";
import { embedImages } from "../../src/render/images.mjs";
import { localPathNotes } from "../../src/render/local-paths.mjs";
import { largePictureNotes, pictureSize } from "../../src/render/picture-sizes.mjs";
import { exportFailures, notesByKind, notesOf, offlineReports, quickFailures, reportNotes, withExportPolicy } from "../../src/render/pipeline.mjs";
import { codeUses } from "../../src/render/typecheck.mjs";
import { identityFailures, markedAsInstructions } from "../../src/render/identity-checks.mjs";
import { inLanguage, told } from "../../src/shared/i18n/index.mjs";
import { pageId } from "../../src/shared/page-links.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { exportPage } from "../../src/transfer/export.mjs";
import { createTransferService } from "../../src/transfer/service.mjs";

// The checks that read a report's real markup (docs/render.md, "Build pipeline"): the network and
// storage checks over its code alone (scripts of any JavaScript type, on* attributes, javascript:
// addresses; never a code sample, prose, a comment or a chart's JSON; the global however it is
// reached), repeated block ids counted on its elements with their places (and the refusal of
// add-block-ids.mjs), main[data-doc-id], the size limit's message, the export's policy after the page's
// real <head> (a byte order mark before it too), its tags and references to files of its folder read
// from its elements (there, and none an export cannot hold; nothing a comment, a <textarea> or a
// script's string spells), and what every export runs (exportFailures; the workbench's 导出 in every
// format: offlineReports and its check, each page made the kit's first, a 422). And the notes that
// teach where a report goes beyond the checks: the paths of this machine in the text a reader reads,
// and the pictures that make an export heavy.

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-checks-"));
const directory = path.join(root, "alpha");
await fs.mkdir(path.join(directory, "assets"), { recursive: true });
await fs.writeFile(path.join(directory, "assets", "image-0123456789ab.png"), PNG);
await fs.writeFile(path.join(directory, "assets", "file-0123456789ab.csv"), "a,b\n1,2\n");
await fs.writeFile(path.join(directory, "assets", "embed-0123456789ab.pdf"), "%PDF-1.4\n");

// A page whose body starts on line 10 (`body` line n is line 9 + n of the file).
const page = (body, { head = "<head>", main = '<main class="doc-page" data-doc-id="alpha">' } = {}) =>
  `<!doctype html>\n<html lang="zh-CN">\n${head}\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width">\n<title>T</title>\n</head>\n<body>\n${main}\n${body}\n</main>\n</body>\n</html>\n`;
const exportOf = (body, options) => exportFailures({ slug: "alpha", html: page(body, options), directory });
const quickOf = (body, { metadata = {}, ...options } = {}) => quickFailures({ slug: "alpha", html: page(body, options), metadata, directory });

// ---------- the network: code alone ----------
{
  const spelled = [
    "<p>调用 fetch(url) 取数据，或者 new WebSocket(…)</p>",
    "<pre><code>fetch(\"/data.json\").then((r) =&gt; r.json()); localStorage.x = 1;</code></pre>",
    "<p>行内 <code>fetch()</code></p>",
    "<!-- fetch(url) -->",
    '<div class="doc-diff"><script type="application/json">{"path":"a.js","lines":[{"type":"add","line":1,"content":"fetch(url)"}]}</script></div>',
    "<script>\n// fetch(url) and localStorage in a comment\n/** @type {typeof fetch} */\nconst said = \"fetch(url)\";\ndata.fetch(); const o = { fetch: 1, localStorage: 2 };\n</script>",
  ].join("\n");
  assert.deepEqual(exportOf(spelled), [], "a code sample, prose, inline code, comments, strings, a diff's JSON and other objects' fetch are no network");
  assert.deepEqual(quickOf(spelled).filter((failure) => /storage/.test(failure)), [], "nor storage");

  const calls = exportOf('<button onclick="fetch(\'/x\')">x</button>\n<a href="javascript:new XMLHttpRequest()">y</a>\n<script>\nconst a = 1;\nwindow.fetch("x");\nnew WebSocket("wss://x");\n</script>');
  assert.deepEqual(calls, [
    "line 10: the onclick attribute of <button> calls fetch(…): embed its data (inline JSON, DocState); the export blocks the network",
    "line 11: the javascript: address of <a href> creates new XMLHttpRequest(…): embed its data (inline JSON, DocState); the export blocks the network",
    "line 14: the document's script calls fetch(…): embed its data (inline JSON, DocState); the export blocks the network",
    "line 15: the document's script creates new WebSocket(…): embed its data (inline JSON, DocState); the export blocks the network",
  ], calls.join("\n"));
  // Storage: the same code, an onclick too.
  assert.deepEqual(quickOf('<button onclick="localStorage.setItem(\'a\', 1)">x</button>\n<script>\nsessionStorage.clear();\n</script>').filter((failure) => /storage/.test(failure)), [
    "line 10: the onclick attribute of <button> uses localStorage: use DocState instead of direct browser storage",
    "line 12: the document's script uses sessionStorage: use DocState instead of direct browser storage",
  ]);
  assert.deepEqual(codeUses('<script type="module">\nimport x from "./x.js";\nexport const f = () => self.fetch(x);\n</script>', new Set(["fetch"])).map(({ how, line }) => [how, line]), [["call", 3]], "a module's code, window/self/globalThis.fetch the global");
  // However the global is reached: by a global object's element, passed on, called through .call, in
  // a script of any JavaScript type, in an address with a tab a browser takes out; asking whether
  // there is one (typeof) is no use.
  const reached = (code) => codeUses(code, new Set(["fetch", "localStorage"])).map(({ name, how }) => `${name} ${how}`);
  assert.deepEqual(reached("<script>window['localStorage'].x = 1; globalThis[\"fetch\"]('/x');</script>"), ["localStorage use", "fetch call"]);
  assert.deepEqual(reached("<script>fetch.call(window, '/x'); const f = fetch;</script>"), ["fetch use", "fetch use"]);
  assert.deepEqual(reached('<script type="text/ecmascript">fetch("/x")</script><script type="text/plain">fetch("/x")</script>'), ["fetch call"]);
  assert.deepEqual(reached('<a href="java&#x09;script:fetch(\'/x\')">x</a>'), ["fetch call"]);
  assert.deepEqual(reached("<script>if (typeof fetch === 'function' && typeof window.localStorage !== 'undefined') {}</script>"), []);
  assert.deepEqual(exportOf("<script>\nconst load = fetch;\n</script>"), ["line 11: the document's script uses fetch: embed its data (inline JSON, DocState); the export blocks the network"]);
  // A name the code binds itself is its own, wherever it stands; out of its scope it is the global again.
  assert.deepEqual(reached('<script>function load(fetch) { return fetch("/x"); } const { fetch: other, localStorage = 1 } = options; localStorage.x = 1;</script>'), []);
  assert.deepEqual(reached('<script>function a(fetch) { fetch("/x"); } fetch("/y");</script>'), ["fetch call"]);
  assert.deepEqual(reached('<script>{ const fetch = () => 1; fetch(); } fetch();</script>'), ["fetch call"]);
  assert.deepEqual(reached('<script>const send = function fetch() { fetch(); }; try { 1; } catch (fetch) { fetch(); } class A { m(localStorage) { localStorage.x = 1; } }</script>'), []);
  assert.deepEqual(reached('<script>function f() { var fetch = g; { fetch(); } } const l = (fetch) => fetch(); for (const fetch of list) fetch();</script>'), []);
  assert.deepEqual(reached('<script>const { fetch } = window; fetch("/x");</script>'), ["fetch use", "fetch call"], "taken from a global object it is the global");
  // All that reaches the network, by whatever it is reached.
  assert.deepEqual(exportOf('<script>\nnavigator.sendBeacon("/x");\nwindow.navigator.sendBeacon("/y");\nnew EventSource("/z");\nimport("https://example.com/a.js");\nmailer.sendBeacon("/n");\n</script>').map((failure) => failure.split(":")[1]), [
    " the document's script calls sendBeacon(…)",
    " the document's script calls sendBeacon(…)",
    " the document's script creates new EventSource(…)",
    " the document's script calls import(…)",
  ]);
}

// ---------- repeated block ids: the elements' attributes ----------
{
  const body = '<p data-block-id=abc>一</p>\n<pre><code>&lt;p data-block-id="abc"&gt;</code></pre>\n<p data-block-id="&#97;bc">二</p>\n<p data-block-id=\'xyz\'>三</p>';
  const repeats = quickOf(body).filter((failure) => failure.startsWith("data-block-id repeats"));
  assert.deepEqual(repeats, ['data-block-id repeats: "abc" on lines 10 and 12; each id names one block: remove it from the copy, which needs none (the later one, line 12, unless the copy went before its original)'], repeats.join("\n"));
  assert.deepEqual(quickOf(body, { metadata: { template: true } }).filter((failure) => /data-block-id/.test(failure)), repeats, "an old template flag changes nothing");
  assert.deepEqual(repeatedBlockIds(page(body)), [{ id: "abc", lines: [10, 12], columns: [4, 4] }]);
  assert.deepEqual(repeatedBlockIds(page('<p data-block-id="a1">x</p><template><p data-block-id="a2">y</p></template>')), []);
  // Two on one line: each by its line and column.
  const oneLine = '<p data-block-id="x">一</p><p data-block-id="x">二</p>';
  assert.deepEqual(quickOf(oneLine).filter((failure) => failure.startsWith("data-block-id repeats")), ['data-block-id repeats: "x" on lines 10:4 and 10:30 (line:column); each id names one block: remove it from the copy, which needs none (the later one, line 10:30, unless the copy went before its original)']);
  assert.deepEqual(repeatedBlockIds(page(oneLine)), [{ id: "x", lines: [10, 10], columns: [4, 30] }]);

  // add-block-ids.mjs changes nothing in a report repeating an id, and lists it (which one is the copy is the author's to say).
  const data = await fs.mkdtemp(path.join(os.tmpdir(), "report-ids-cli-"));
  try {
    const source = page('<p data-block-id="abc">原件</p>\n<p>没有 id</p>\n<p data-block-id="abc">副本</p>');
    await fs.mkdir(path.join(data, "reports", "alpha"), { recursive: true });
    await fs.writeFile(path.join(data, "reports", "alpha", "report.html"), source);
    await fs.writeFile(path.join(data, "reports", "alpha", "report.json"), JSON.stringify({ title: "T", description: "D", type: "note" }));
    const run = spawnSync(process.execPath, [path.join(projectRoot, "src", "cli", "add-block-ids.mjs"), "alpha"], { encoding: "utf8", env: { ...process.env, GALLERY_WORKSPACE: path.join(data, "reports") } });
    assert.equal(run.status, 1, run.stdout + run.stderr);
    assert.match(run.stderr, /nothing changed, as block ids repeat: "abc" on lines 10 and 12\./);
    assert.equal(await fs.readFile(path.join(data, "reports", "alpha", "report.html"), "utf8"), source, "the file as it was");
    assert.equal(await fs.access(path.join(data, "reports", ".gallery", "backups")).then(() => true, () => false), false, "no backup: nothing was written");
    await fs.writeFile(path.join(data, "reports", "alpha", "report.html"), page(oneLine));
    const sameLine = spawnSync(process.execPath, [path.join(projectRoot, "src", "cli", "add-block-ids.mjs"), "alpha"], { encoding: "utf8", env: { ...process.env, GALLERY_WORKSPACE: path.join(data, "reports") } });
    assert.match(sameLine.stderr, /"x" on lines 10:4 and 10:30 \(line:column\)\./, sameLine.stderr);
  } finally {
    await fs.rm(data, { recursive: true, force: true });
  }
}

// ---------- a formula between single dollars: TeX the kit never draws ----------
// $…$ with \, ^ or _ inside fails (the reader would see its TeX: single dollars are money), at its
// line; money ("$5 and $6", "$20,000"), $$…$$, an escaped dollar, code, a formula of the kit's and
// an element that asks for single dollars do not.
{
  const dollars = (body) => quickOf(body).filter((failure) => failure.includes("single dollars"));
  assert.deepEqual(dollars(String.raw`<p>能量 $E = mc^2$，下标 $a_i$，$\alpha$</p>
<p>价格 $5 and $6，$20,000 和 $30,000；$、$$ 和 $$$；$x$ 只是字母</p>
<p>$$x^2$$ \$y_1\$ <code>$z^2$</code> <span class="doc-math-inline">\(a $b_c$\)</span></p>
<pre>$p_1$</pre>
<div data-doc-math-dollar><p>$q^2$</p></div>`), [
    String.raw`line 10: $E = mc^2$ is not drawn as a formula (single dollars are off: they are money): write \(E = mc^2\)`,
    String.raw`line 10: $a_i$ is not drawn as a formula (single dollars are off: they are money): write \(a_i\)`,
    String.raw`line 10: $\alpha$ is not drawn as a formula (single dollars are off: they are money): write \(\alpha\)`,
  ]);
  assert.deepEqual(dollars("<p>从 $5 涨到 $x^2$</p>").length, 1, "money before a formula: the formula alone");
  // A variable's name is no formula: an underscore inside a name, or after a dollar or a brace.
  assert.deepEqual(dollars("<p>set $JAVA_HOME/$PATH first; PHP's $_GET/$_POST; ${user_name}/${id}; $HOME_dir$, $my_var$, $500K_adj$</p>"), []);
  assert.deepEqual(dollars("<p>$a_1$ and $b_{ij}$, $(x+y)_2$, $x &lt; y_1$</p>").length, 4, "a subscript after a letter of its own, a bracket or a brace: TeX");
}

// ---------- main[data-doc-id], the size limit ----------
{
  const idFailures = (main, metadata) => quickOf("<p>x</p>", { main, metadata }).filter((failure) => /data-doc-id/.test(failure));
  assert.deepEqual(idFailures('<main class="doc-page" data-doc-id="alpha">'), []);
  assert.deepEqual(idFailures('<main class="doc-page">'), ['main.doc-page needs data-doc-id="alpha"']);
  assert.deepEqual(idFailures('<main class="doc-page" data-doc-id="beta">'), ['main[data-doc-id] is "beta": it must be the document\'s slug "alpha"']);
  assert.deepEqual(idFailures('<main class="doc-page">', { template: true }), ['main.doc-page needs data-doc-id="alpha"'], "an old template flag changes nothing");
  assert.deepEqual(quickOf("<p>x</p>", { main: '<template><main></main></template>\n<main class="doc-page" data-doc-id="alpha">' }).filter((failure) => /data-doc-id/.test(failure)), [], "the page's main, not one a <template> holds");
  const sample = await fs.readFile(path.join(projectRoot, "tests", "browser", "fixtures", "sample", "doc.html"), "utf8");
  assert.deepEqual(quickFailures({ slug: "sample", html: sample, metadata: {}, directory: path.join(projectRoot, "tests", "browser", "fixtures", "sample") }), [], "the browser tests' sample passes");
  const big = quickOf(`<p>${"x".repeat(1_000_001)}</p>`).find((failure) => failure.startsWith("the document's editable source"));
  assert.match(big, /^the document's editable source is 1,000,\d{3} bytes, over the 1,000,000-byte limit: aggregate or sample the embedded data, or split the document$/);
}

// ---------- the export's policy: after the page's real <head> ----------
{
  const exported = withExportPolicy("alpha", page("<p>x</p>", { head: "<!-- <head> -->\n<HEAD data-x=\"1\" >" }));
  assert.match(exported, /<!-- <head> -->\n<HEAD data-x="1" >\n {2}<meta name="generator" content="Gallery">\n {2}<meta http-equiv="Content-Security-Policy" content="default-src 'none';[^"]*connect-src 'none'/);
  assert.throws(() => withExportPolicy("alpha", "<!-- <head> --><p>x</p>"), /alpha: the page writes no <head> start tag/);
  assert.deepEqual(exportOf("<p>x</p>", { head: "" }), ["the page writes no <head> start tag, which an export puts its Content-Security-Policy right after: write <head> … </head> before <body>"]);
  // A file saved with a byte order mark (UTF-8 "with BOM") is read as a browser reads it: its own
  // <head>, its lines as they are.
  const marked = `\uFEFF${page("<script>\nfetch('/x');\n</script>")}`;
  assert.deepEqual(exportFailures({ slug: "alpha", html: marked, directory }), ["line 11: the document's script calls fetch(…): embed its data (inline JSON, DocState); the export blocks the network"]);
  assert.match(withExportPolicy("alpha", `\uFEFF<!DOCTYPE html><HTML><HEAD ><title>T</title></HEAD><body></body></HTML>`), /^\uFEFF<!DOCTYPE html><HTML><HEAD >\n {2}<meta name="generator"/);
}

// ---------- references to files of the report's folder ----------
{
  // In the blocks an export embeds, however their tags are written: nothing.
  const blocks = [
    '<figure class="doc-image">\n<img src="assets/image-0123456789ab.png" alt="">\n<figcaption></figcaption>\n</figure>',
    "<figure class='doc-image'><img src='assets/image-0123456789ab.png' alt=\"\"><figcaption></figcaption></figure>",
    '<FIGURE CLASS=doc-image><IMG SRC = assets/image-0123456789ab.png ALT=""><figcaption></figcaption></FIGURE>',
    '<figure class="doc-file"><a class="doc-file-link" href=\'assets/file-0123456789ab.csv\' download=\'数据.csv\'><span class="doc-file-name">数据.csv</span></a><figcaption></figcaption></figure>',
    '<p>见 <a class="doc-link-mention" href="https://example.com/"><img class="doc-link-mention-icon" src="assets/image-0123456789ab.png" alt="">Example</a></p>',
    '<figure class="doc-embed"><iframe class="doc-embed-frame" src="assets/embed-0123456789ab.pdf"></iframe><figcaption></figcaption></figure>',
    "<figure class='doc-embed'><iframe class='doc-embed-frame' src='assets/embed-0123456789ab.pdf'></iframe><figcaption></figcaption></figure>",
    // A ">" inside a quoted value, and a character reference, as a browser reads them.
    '<figure class="doc-image"><img alt="a > b" src="assets/image-0123456789ab.png"><figcaption></figcaption></figure>',
    '<figure title="x>y" class="doc-image"><img src="assets/image&#45;0123456789ab.png" alt=""><figcaption></figcaption></figure>',
    '<figure class="doc-file"><a title="a>b" class="doc-file-link" href="assets/file-0123456789ab.csv" download="x.csv">x</a><figcaption></figcaption></figure>',
  ];
  assert.deepEqual(exportOf(blocks.join("\n")), [], exportOf(blocks.join("\n")).join("\n"));
  for (const block of [...blocks.slice(1, 3), ...blocks.slice(7, 9)]) assert.ok(embedImages(page(block), { slug: "alpha", reportsDirectory: root }).includes(`data:image/png;base64,${PNG.toString("base64")}`), `embedded as written: ${block}`);
  assert.ok(embedFiles(page(blocks[9]), { slug: "alpha", reportsDirectory: root }).includes(`<a title="a>b" class="doc-file-link" href="data:text/csv;base64,${Buffer.from("a,b\n1,2\n").toString("base64")}" download="x.csv">`));
  assert.ok(embedFrames(page(blocks[6]), { slug: "alpha", reportsDirectory: root }).includes("src=\"data:application/pdf;base64,"), "an embed's frame in single quotes is embedded too");
  // Markup that is no element (a comment, a <textarea>'s text, a script's string, a diff's JSON) loads
  // nothing and is checked for nothing.
  const spelled = [
    '<!-- <figure class="doc-image"><img src="assets/gone.png"></figure> <img src="https://example.com/x.png"> <script src="/kit/old.js"></script> -->',
    '<textarea><figure class="doc-file"><a class="doc-file-link" href="assets/gone.csv"></a></figure></textarea>',
    '<script>\nconst card = (url) => `<figure class="doc-image"><img src="${url}" alt=""></figure><link rel="stylesheet" href="/x.css">`;\n</script>',
    '<div class="doc-diff"><script type="application/json">{"path":"a.html","lines":[{"type":"add","line":1,"content":"<img src=\'https://cdn.example.com/x.png\'>"}]}</script></div>',
    "<style>/* .old { background: url(assets/old.png); } */</style>",
  ];
  assert.deepEqual(exportOf(spelled.join("\n")), [], exportOf(spelled.join("\n")).join("\n"));
  assert.deepEqual(exportOf('<script src="/kit/old.js"></script>\n<LINK REL=stylesheet HREF=/old.css>\n<img src=https://example.com/x.png alt="">'), [
    "external resources are not portable: https://example.com/x.png",
    "unsupported script dependency /kit/old.js",
    "unsupported stylesheet dependency /old.css",
  ], "the page's own tags, however written");
  // Anywhere else an export embeds it too (render/asset-references.mjs; tests/unit/references.mjs
  // holds the export): a picture in a table cell, a figure of two, a link to a file, a CSS background,
  // a srcset. What fails is a file that is not there, and what an export cannot hold (a PDF in a frame
  // of its own: an embed block shows one), each with its line.
  const found = exportOf([
    '<table><tr><td><img src="assets/image-0123456789ab.png" alt=""></td></tr></table>',
    '<figure>\n<img src="assets/image-0123456789ab.png" alt=""><img src=assets/image-0123456789ab.png alt="">\n</figure>',
    '<p><a href="assets/file-0123456789ab.csv" download>数据</a></p>',
    "<style>\n.hero { background: url('assets/image-0123456789ab.png'); }\n</style>",
    '<div style="background: url(assets/gone.png)"></div>',
    '<figure class="doc-image"><img src="assets/image-0123456789ab.png" srcset="assets/image-0123456789ab.png 2x" alt=""><figcaption></figcaption></figure>',
    '<div class="doc-icon"><img src="assets/icon-gone.png" alt=""></div>',
    "<pre><code>&lt;img src=\"assets/gone.png\"&gt;</code></pre><p>assets/gone.png</p>",
    '<iframe src="assets/embed-0123456789ab.pdf"></iframe>',
  ].join("\n"));
  assert.deepEqual(found, [
    "line 18: url(assets/gone.png) in the style of <div> names a file that is not in the document's folder",
    "line 20: the icon's image assets/icon-gone.png is not in the document's folder",
    "line 22: <iframe src=\"assets/embed-0123456789ab.pdf\">: a PDF shows in an embed block alone (the kit hands its file to the browser's PDF viewer, in the preview and in an export): make it one, its frame with no sandbox (a sandboxed one shows no PDF): <figure class=\"doc-embed doc-embed--file\"><iframe class=\"doc-embed-frame\" src=\"assets/<file>.pdf\"></iframe><figcaption></figcaption></figure>",
  ], found.join("\n"));
  // What an export cannot hold: an <object>'s data, CSS's @import (image-set("…") it holds); an icon
  // written as an icon is not read is said to be one.
  const loaded = exportOf([
    '<object data="assets/file-0123456789ab.csv"></object>',
    '<style>@import "assets/x.css";</style>',
    "<div style=\"background-image: image-set('assets/image-0123456789ab.png' 1x)\"></div>",
    "<div class=\"doc-icon\"><img src='assets/image-0123456789ab.png' alt=\"\"></div>",
  ].join("\n"));
  assert.deepEqual(loaded, [
    "line 10: <object data=\"assets/file-0123456789ab.csv\">: an export's policy loads no plugin content (<object>, <embed>): show a picture with <img src=\"assets/<file>\">, a file to save with a link, <a href=\"assets/<file>\" download=\"<name>\">",
    "line 11: @import \"assets/x.css\" in <style> names a file that is not in the document's folder",
    "line 11: @import \"assets/x.css\" in <style>: an export holds no stylesheet of the folder (the addresses in one are read from its own place): put its rules in the page's <style>",
    "line 13: <img src=\"assets/image-0123456789ab.png\"> is in an icon (.doc-icon) written as an icon is not read (its picker, the browser tab's icon): write it <div class=\"doc-icon\"><img src=\"assets/<file>\" alt=\"\"></div>, in double quotes and with no other class",
  ], loaded.join("\n"));
  // A media block's picture or file not there: the block's own check says it, with its line.
  assert.deepEqual(exportOf('<figure class="doc-image"><img src="assets/image-gone.png" alt=""><figcaption></figcaption></figure>'), ["line 10: an image's picture assets/image-gone.png is not in the document's folder"]);
}

// ---------- every export: the workbench's 导出 checks too, and says why it made nothing ----------
{
  const render = await offlineReports({ directory: path.join(projectRoot, "tests", "fixtures") }); // the Component Catalog, tests/fixtures/component-catalog/
  const gallery = await render("component-catalog");
  assert.match(gallery, /<head>\n {2}<meta name="generator" content="Gallery">\n {2}<meta http-equiv="Content-Security-Policy"/, "the Component Catalog exports, its policy first in the head");
  assert.equal(await render.check("component-catalog"), undefined, "and passes the check alone (a Markdown export's)");
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify({ title: "甲报告" }));
  const failures = ["line 10: the document's script calls fetch(…): embed its data (inline JSON, DocState); the export blocks the network", "line 12: …"];
  const failing = (slug) => Object.assign(new Error(`${slug}: ${failures[0]}`), { reason: "check", slug, failures });
  // A Markdown export, made of the source, is held to the same check first: it fails, nothing written.
  await fs.writeFile(path.join(directory, "report.html"), page("<p>x</p>"));
  // A link to a document or a block that is not there: a note, never a failure.
  {
    const folder = (slug) => path.join(root, slug);
    await fs.mkdir(folder("linked"), { recursive: true });
    await fs.writeFile(path.join(folder("linked"), "doc.html"), '<!doctype html><title>t</title><main data-doc-id="linked"><p data-block-id="ab12cd34">目标</p></main>');
    await fs.mkdir(folder("older"), { recursive: true });
    await fs.writeFile(path.join(folder("older"), "report.html"), '<!doctype html><title>t</title><main data-doc-id="older"></main>');
    const said = (body) => notesByKind({ slug: "alpha", html: `<!doctype html><html><body><main class="doc-page" data-doc-id="alpha">${body}<h2 id="here">这里</h2><p data-block-id="own12345">段</p></main></body></html>`, directory: folder("alpha") }).notes.filter((note) => note.includes("the link to"));
    assert.deepEqual(said('<a href="../linked/doc.html">甲</a><a href="../linked/doc.html#ab12cd34">乙</a><a href="../older/doc.html">丙</a><a href="#here">丁</a><a href="#own12345">戊</a><a href="https://example.com/#x">己</a><a href="#">庚</a><a href="#top">辛</a>'), [], "links to what is there say nothing");
    assert.deepEqual(said('<a href="../gone/doc.html">甲</a>').length, 1);
    assert.match(said('<a href="../gone/doc.html">甲</a>')[0], /\.\.\/gone\/doc\.html \(line 1\) names a document that is not there/);
    assert.match(said('<a href="../linked/doc.html#zz12cd34">甲</a>')[0], /names a block document linked does not hold/);
    assert.match(said('<a href="#nowhere">甲</a>')[0], /#nowhere \(line 1\) names no block or element of this document/);
    // What a click reads as a document's, the check reads as one; what reads like a link to one and leads to none is said.
    assert.deepEqual(said('<a href="./../linked/doc.html">甲</a><a href="../linked/doc.html?x=1#ab12cd34">乙</a><a href="../../linked/doc.html">丙</a><a href="doc.html#own12345">丁</a><a href="assets/a.pdf">戊</a><a href="assets/a.html">己</a><a href="mailto:a@b.c">庚</a><a href="/generated/linked.html">辛</a>'), [], "every form a click takes, and a file of the folder");
    assert.match(said('<a href="./../gone/doc.html">甲</a>')[0], /names a document that is not there/);
    assert.match(said('<a href="doc.html#zz12cd34">甲</a>')[0], /names a block document alpha does not hold/);
    for (const href of ["../目标页/doc.html", "../TARGET/doc.html", "../linked/", "../linked", "linked/doc.html", "other.html"]) assert.match(said(`<a href="${href}">甲</a>`)[0] ?? "", /leads to no document: a link to one is \.\.\/<slug>\/doc\.html/, href);
    assert.deepEqual(said('<a href="http://localhost:3000/#/dashboard">甲</a><a href="http://localhost:5173/generated/x.html">乙</a><a href="http://localhost:5173/x/doc.html">丙</a>'), [], "an address with a host may be another program's");
    // A workbench's address as a path alone reads by the folders beside the page: an id says which, whatever the words.
    const linked = pageId("linked");
    assert.deepEqual(said(`<a href="/#旧的词-${linked}">甲</a><a href="/#${linked}/ab12cd34">乙</a><a href="/#linked/ab12cd34">丙</a><a href="http://localhost:5173/#linked/ab12cd34">丁</a><a href="http://localhost:5173/#项目周报">戊</a>`), [], "what names a document and a block of it says nothing");
    for (const href of ["/#随便的词-zzzzzzzz", "/#随便的词-zzzzzzzz/ab12cd34", "/#项目周报", "/#report-2/ab12cd34"]) assert.match(said(`<a href="${href}">甲</a>`)[0] ?? "", /names a document that is not there/, href);
    for (const href of [`/#旧的词-${linked}/zz12cd34`, "/#linked/zz12cd34", `http://localhost:5173/#${linked}/zz12cd34`]) assert.match(said(`<a href="${href}">甲</a>`)[0] ?? "", /names a block document linked does not hold/, href);
  }
  const markdownSite = { reportsDirectory: root, titleOf: async () => "甲报告", childrenOf: async () => [], links: async () => ({ links: new Map() }), offline: async () => assert.fail("no offline file for Markdown"), check: async (slug) => { throw failing(slug); } };
  await assert.rejects(exportPage("alpha", { format: "markdown" }, markdownSite), (error) => error.reason === "check" && error.slug === "alpha");
  const naturalized = [];
  const edits = {
    check: async () => ({ body: { slug: "alpha", options: { format: "html" } } }),
    // The edit service's hand-in: the page's natural HTML made the kit's in its file (and its ids).
    handIn: async (slug) => {
      naturalized.push(slug);
      const file = path.join(root, slug, "report.html");
      const { text, changes } = naturalize(await fs.readFile(file, "utf8"));
      if (changes.length) await fs.writeFile(file, text);
      return { ok: true, changes, added: 0, repeated: [], written: changes.length > 0 };
    },
  };
  const answer = () => ({ headers: {}, setHeader(name, value) { this.headers[name] = value; }, writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers); }, end(body) { this.body = body; } });
  const service = createTransferService({
    edits,
    workspace: { outline: async () => ({ children: {} }) },
    reports: {},
    reportsDirectory: root,
    offline: async () => async (slug) => {
      throw failing(slug);
    },
  });
  const refused = answer();
  await service.handle({}, refused, "export");
  assert.equal(refused.statusCode, 422);
  // The message, and its template and parts (shared/i18n said()) for the workbench to say it in the UI's
  // language (told(): workbench/app/workspace/transfer.ts), the title and the check's line as they are.
  const body = JSON.parse(refused.body);
  assert.deepEqual(body, { ok: false, reason: "check", message: `「甲报告」没有通过导出前的检查，没有生成文件：${failures[0]}（共 2 处：可以让 Agent 检查这份文档，列出全部并修好）`, text: "「{0}」没有通过导出前的检查，没有生成文件：{1}（共 {2} 处：可以让 Agent 检查这份文档，列出全部并修好）", values: ["甲报告", failures[0], 2] });
  assert.equal(inLanguage("en", () => told(body)), `“甲报告” didn't pass the checks before export, so no file was made: ${failures[0]} (2 in all: ask the Agent to check this document, list them all and fix them)`, "an English UI says an export check failure in English");
  assert.deepEqual(naturalized, ["alpha"], "the page made the kit's before it is checked");
  // A component package's failure, whose line is for who writes it: which one, in a reader's words.
  const componentFailing = Object.assign(new Error("check"), { reason: "check", slug: "alpha", failures: ["local/board: its kit.js does not run: Unexpected token '=' (line 1)"], component: "local/board" });
  const refusedOne = answer();
  await createTransferService({ edits, workspace: { outline: async () => ({ children: {} }) }, reports: {}, reportsDirectory: root, offline: async () => async () => { throw componentFailing; } }).handle({}, refusedOne, "export");
  const saidOne = JSON.parse(refusedOne.body);
  assert.deepEqual([refusedOne.statusCode, saidOne.message], [422, "「甲报告」里的组件 local/board 有错误，没有生成文件：可以让 Agent 检查这份文档并修好"]);
  assert.equal(inLanguage("en", () => told(saidOne)), "Component local/board in “甲报告” has an error, so no file was made: an Agent can check this document and fix it", "in the UI's language");

  // A picture an Agent wrote as any page would, in a page nobody opened: the export makes it the
  // kit's first (as the preview and the CLI do), an image block (as written it passes too: an export
  // embeds a picture wherever it stands).
  const natural = page('<p><img src="assets/image-0123456789ab.png" alt=""></p>');
  assert.deepEqual(exportOf('<p><img src="assets/image-0123456789ab.png" alt=""></p>'), [], "as written, it passes too");
  await fs.writeFile(path.join(directory, "report.html"), natural);
  const checked = async (slug) => {
    const html = await fs.readFile(path.join(root, slug, "report.html"), "utf8");
    const found = exportFailures({ slug, html, directory: path.join(root, slug) });
    if (found.length > 0) throw Object.assign(new Error(found[0]), { reason: "check", slug, failures: found });
    return html;
  };
  const passing = createTransferService({ edits, workspace: { outline: async () => ({ children: {} }) }, reports: {}, reportsDirectory: root, offline: async () => checked });
  const made = answer();
  await passing.handle({}, made, "export");
  assert.equal(made.statusCode, 200, made.body);
  assert.match(String(made.body), /<figure class="doc-image"><img src="assets\/image-0123456789ab\.png" alt=""><figcaption><\/figcaption><\/figure>/);
  // A report.json that still says "template": true is any report's: the page is made the kit's too.
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify({ title: "甲报告", template: true }));
  await fs.writeFile(path.join(directory, "report.html"), natural);
  naturalized.length = 0;
  await passing.handle({}, answer(), "export");
  assert.notDeepEqual(naturalized, [], "an old template flag changes nothing");
  // A page the hand-in leaves as it is fails the export, nothing made: ids that repeat (as the check
  // says them, at the file's lines), a file that kept changing while it was written.
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify({ title: "甲报告" }));
  const left = (result) => createTransferService({ edits: { ...edits, handIn: async () => result }, workspace: { outline: async () => ({ children: {} }) }, reports: {}, reportsDirectory: root, offline: async () => async () => assert.fail("nothing made") });
  const repeated = answer();
  await left({ ok: true, changes: [], added: 0, repeated: [{ id: "twice", lines: [12, 14], columns: [5, 5] }], written: false }).handle({}, repeated, "export");
  assert.equal(repeated.statusCode, 422, repeated.body);
  assert.match(JSON.parse(repeated.body).message, /^「甲报告」没有通过导出前的检查，没有生成文件：data-block-id repeats: "twice" on lines 12 and 14;/);
  const busy = answer();
  await left({ ok: false, reason: "busy", message: "文件一再被修改（例如 Agent 正在写入），没有写入" }).handle({}, busy, "export");
  assert.deepEqual([busy.statusCode, JSON.parse(busy.body).reason], [409, "busy"]);
}

// ---------- notes: paths of this machine in the text a reader reads ----------
{
  const notes = localPathNotes(page([
    '<p class="doc-source">来源：D:\\data\\销售\\2025.xlsx</p>',
    "<p>数据在C:\\Users\\me\\data.csv里，另见 /home/alice/runs/a.json；网页 https://example.com/home/page 与 http://a.b/Users/x 不是。</p>",
    "<p>草稿在 AppData\\Local\\Temp\\claude\\notes.md 和 见scratchpad/sim/p5/result.json，日志 %TEMP%\\x.log；项目里的 temp/out.csv 与 the scratchpad 不是。</p>",
    "<p>公式 \\(f:\\mathbb{R}\\to\\mathbb{R}\\)，比例 3:2，选项 A:/B。</p>",
    '<pre><code>C:\\Users\\me\\x.py</code></pre><p>行内 <code>/home/a/b</code>，<span title="C:\\x\\yy">提示</span>，<a href="file:///C:/x/yy">链接</a></p>',
    '<p hidden>C:\\hidden\\x</p><!-- C:\\comment\\x --><script>const where = "C:\\\\x\\\\yy";</script><template><p>C:\\inert\\x</p></template>',
    "<p>第一行\n第二行 file:///D:/data/x.html 与 /tmp/out、/Users/bob/Desktop/a.png。</p>",
  ].join("\n"), { head: "<head><title>T D:\\work\\draft</title>" }));
  const said = (line, where) => `line ${line}: "${where}" is a path of this machine in the text a reader reads: a reader on another machine cannot open it. Write instead where it came from, in words, or a path relative to materials/ (materials/data.csv)`;
  assert.deepEqual(notes, [
    said(3, "D:\\work\\draft"),
    said(10, "D:\\data\\销售\\2025.xlsx"),
    said(11, "C:\\Users\\me\\data.csv"),
    said(11, "/home/alice/runs/a.json"),
    said(12, "AppData\\Local\\Temp\\claude\\notes.md"),
    said(12, "scratchpad/sim/p5/result.json"),
    said(12, "%TEMP%\\x.log"),
    said(17, "D:/data/x.html"),
    said(17, "/tmp/out"),
    said(17, "/Users/bob/Desktop/a.png"),
  ], notes.join("\n"));
  // Twelve one by one, the rest in a note with their lines.
  const many = localPathNotes(page(`<p>${Array.from({ length: 14 }, (_, index) => `/tmp/f${index}`).join(" ")}</p>\n<p>/tmp/last</p>`));
  assert.equal(many.length, 13);
  assert.equal(many.at(-1), "3 more paths of this machine in the text a reader reads, on lines 10, 11. Write instead where it came from, in words, or a path relative to materials/ (materials/data.csv)");
  // A note, never a failure: gallery check and gallery export print it with the others (notesOf),
  // among those to act on first ("fix <slug>: …", before the "note" lines: notesByKind, reportNotes).
  assert.deepEqual(quickOf('<p>见 C:\\Users\\me\\data.csv</p>'), []);
  assert.ok(notesOf({ slug: "alpha", html: page('<p>见 C:\\Users\\me\\data.csv</p>'), directory }).includes(said(10, "C:\\Users\\me\\data.csv")));
  // A chart drawn from a table (as the intake makes it in memory) has a reading, information printed
  // last ("chart <slug>: …"), and a card of no title a note.
  const charted = naturalize(page('<p>见 C:\\Users\\me\\data.csv</p>\n<table data-doc-chart="dots"><tr><th>项</th><th>值</th></tr><tr><td>甲</td><td>1</td></tr></table>\n<script>DocCharts.define("dots", () => {});</script>')).text;
  const kinds = notesByKind({ slug: "alpha", html: charted, directory });
  assert.deepEqual(kinds.fix, [said(10, "C:\\Users\\me\\data.csv")], "the path to act on");
  assert.ok(kinds.notes.length > 0 && kinds.notes.every((note) => !note.includes("path of this machine")), `the rest: ${kinds.notes.join("\n")}`);
  assert.deepEqual(notesOf({ slug: "alpha", html: charted, directory }), [...kinds.fix, ...kinds.notes]);
  const printed = [];
  const log = console.log;
  console.log = (line) => printed.push(line);
  try {
    reportNotes([{ slug: "alpha", html: charted.replace(/<p>见[^\n]*<\/p>\n/, ""), directory }, { slug: "beta", html: page('<p>见 C:\\Users\\me\\data.csv</p>'), directory }]);
  } finally {
    console.log = log;
  }
  assert.ok(printed[0] === `fix beta: ${said(10, "C:\\Users\\me\\data.csv")}` && printed.slice(1, -1).every((line) => line.startsWith("note alpha: ")) && printed.length > 2, `the notes to act on first, of every report, then the rest:\n${printed.join("\n")}`);
  assert.equal(printed.at(-1), 'chart alpha: dots (line 10) reads its table (line 10): 1 row; "项": words; "值": numbers', "then the readings");
  assert.deepEqual(kinds.readings, ['dots (line 11) reads its table (line 11): 1 row; "项": words; "值": numbers'], "its readings apart from its notes");
  // No path of this machine: a web address's folders, whatever their names (the site's own), a
  // project's relative temp folders, a formula between single dollars where the page asks for them,
  // and a formula of the kit's.
  const pathsOf = (body) => localPathNotes(page(body)).map((note) => note.match(/^line \d+: "(.*)" is a path/)?.[1] ?? note);
  assert.deepEqual(pathsOf([
    "<p>见 https://example.com/tmp/file.png 与 https://cdn.example.com/temp/a.zip，<a href=\"https://e.com/tmp/x\">https://e.com/tmp/x</a></p>",
    "<p>代码在 https://github.com/foo/scratchpad/blob/main/x.py，参考 https://example.com/docs/AppData/guide.html</p>",
    "<p>s3://bucket/tmp/x.parquet，产物写在 build/tmp/out.csv 里，数据在 data/temp/2025.csv。</p>",
    "<div data-doc-math-dollar><p>映射 $f:\\mathbb{R}\\to\\mathbb{R}$ 是连续的，$5 和 6 美元</p></div>",
    '<p><span class="doc-math-inline">\\(g:\\mathbb{N}\\)</span>，<span class="doc-math-inline">h:\\mathbb{Z}</span></p>',
  ].join("\n")), []);
  // A path from a home (~/, $HOME), a share (\\server\share) or /opt, a temp folder in a path from a
  // drive or the root, and two paths a ";" parts; a dollar alone is no formula's.
  assert.deepEqual(pathsOf([
    "<p>日志 ~/logs/run.log，见 $HOME/data/a.csv</p>",
    "<p>共享盘 \\\\fileserver\\share\\data.xlsx，/opt/data/a.csv</p>",
    "<p>C:\\a.csv;D:\\b.csv，/srv/app/tmp/y.log</p>",
    "<div data-doc-math-dollar><p>花了 $5，文件在 C:\\Users\\me\\x.csv</p></div>",
  ].join("\n")), ["~/logs/run.log", "$HOME/data/a.csv", "\\\\fileserver\\share\\data.xlsx", "/opt/data/a.csv", "C:\\a.csv", "D:\\b.csv", "/srv/app/tmp/y.log", "C:\\Users\\me\\x.csv"]);
}

// ---------- notes: pictures that make an export heavy ----------
{
  // A picture's pixels from its first bytes, whatever follows them.
  const png = (width, height, size = 33) => {
    const bytes = Buffer.alloc(size);
    Buffer.from("89504e470d0a1a0a0000000d49484452", "hex").copy(bytes);
    bytes.writeUInt32BE(width, 16);
    bytes.writeUInt32BE(height, 20);
    return bytes;
  };
  const jpeg = (width, height, size = 64) => {
    const bytes = Buffer.alloc(size);
    Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0, 0, 0, 0, 0, 0, 0xff, 0xc4, 0x00, 0x04, 0, 0, 0xff, 0xc2, 0x00, 0x11, 0x08]).copy(bytes);
    bytes.writeUInt16BE(height, 23);
    bytes.writeUInt16BE(width, 25);
    return bytes;
  };
  const riff = (chunk, fill) => {
    const bytes = Buffer.alloc(40);
    bytes.write("RIFF", 0, "latin1");
    bytes.write("WEBP", 8, "latin1");
    bytes.write(chunk, 12, "latin1");
    fill(bytes);
    return bytes;
  };
  const avif = Buffer.concat([Buffer.from("0000001c667479706d696631000000006d6966316176696600000000", "hex"), Buffer.from("00000014697370650000000000000040000000300000001469737065000000000000079e00000438", "hex")]);
  assert.deepEqual([
    png(7458, 4972), jpeg(4000, 3000), Buffer.from("474946383961e8031400", "hex"),
    riff("VP8 ", (bytes) => { bytes.writeUInt16LE(1600, 26); bytes.writeUInt16LE(900, 28); }),
    riff("VP8L", (bytes) => bytes.writeUInt32LE((2999 & 0x3fff) | ((1999 & 0x3fff) << 14), 21)),
    riff("VP8X", (bytes) => { bytes.writeUIntLE(4999, 24, 3); bytes.writeUIntLE(2999, 27, 3); }),
    avif, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="9000" height="10"></svg>'),
  ].map((bytes) => pictureSize(bytes)), [
    { width: 7458, height: 4972 }, { width: 4000, height: 3000 }, { width: 1000, height: 20 }, { width: 1600, height: 900 },
    { width: 3000, height: 2000 }, { width: 5000, height: 3000 }, { width: 1950, height: 1080 }, null,
  ]);
  // The pictures an export embeds as they are, each as often as it does: over 1 MB or longer than 2400px, a
  // note with its lines, size, pixels, what the export holds of it and about what a copy would weigh; none for
  // the picture of an <img> the export makes a copy of (a PNG, a WebP, a JPEG wider than twice the reading
  // column: src/shared/export-pictures.mjs), but that it is shown twice.
  const folder = path.join(root, "heavy");
  await fs.mkdir(path.join(folder, "assets"), { recursive: true });
  const MB = 1024 * 1024;
  await fs.writeFile(path.join(folder, "assets", "photo.jpg"), jpeg(7458, 4972, Math.round(3.4 * MB)));
  await fs.writeFile(path.join(folder, "assets", "shot.png"), png(1800, 1200, Math.round(1.5 * MB)));
  await fs.writeFile(path.join(folder, "assets", "chart.png"), png(1800, 1200, Math.round(1.2 * MB)).fill(1, 33));
  await fs.writeFile(path.join(folder, "assets", "wide.png"), png(3000, 800, 400_000));
  await fs.writeFile(path.join(folder, "assets", "small.png"), png(800, 600, 2_000));
  await fs.writeFile(path.join(folder, "assets", "big.svg"), `<svg xmlns="http://www.w3.org/2000/svg">${" ".repeat(Math.round(1.2 * MB))}</svg>`);
  await fs.writeFile(path.join(folder, "assets", "unused.jpg"), jpeg(9000, 6000, Math.round(5 * MB)));
  const html = page([
    '<figure class="doc-image"><img src="assets/photo.jpg" alt=""><figcaption></figcaption></figure>',
    '<div style="background: url(assets/wide.png)"></div>',
    '<img src="assets/shot.png" alt="">',
    '<img src="assets/wide.png" alt=""><img src="assets/small.png" alt="">',
    '<img src="assets/big.svg" alt="">',
    '<p>代码里的 <code>&lt;img src="assets/unused.jpg"&gt;</code> 不算。</p>',
    '<img srcset="assets/small.png 1x, assets/chart.png 2x" src="assets/small.png" alt="">',
  ].join("\n"));
  assert.deepEqual(largePictureNotes({ html, directory: folder }), [
    "assets/wide.png (lines 11 and 13): shown twice: the export embeds it twice; show it once and refer back to it in words",
    "assets/small.png (lines 13 and 16): shown twice: the export embeds it twice; show it once and refer back to it in words (0.1 MB as data: URLs)",
    "assets/big.svg (line 14): 1.2 MB; the export embeds it as it is, 1.6 MB as a data: URL",
    "assets/chart.png (line 16): 1.2 MB, 1800×1200px; the export embeds it as it is, 1.6 MB as a data: URL — as a JPEG (for a photograph) it would be about 0.5 MB",
  ]);
  // A document shown 全宽 has no column: a JPEG keeps its width there (a ceiling of Infinity) and is heavy; a PNG is copied all the same.
  assert.deepEqual(largePictureNotes({ html, directory: folder, ceiling: Infinity }).slice(0, 2), [
    "assets/photo.jpg (line 10): 3.4 MB, 7458×4972px; the export embeds it as it is, 4.5 MB as a data: URL — a 2000px copy would be about 0.6 MB",
    "assets/wide.png (lines 11 and 13): shown twice: the export embeds it twice; show it once and refer back to it in words",
  ]);
  // Where the export makes no copy (no Chrome or Edge on the machine, --original-images: `copies` says why), the
  // pictures it would copy are weighed as it embeds them, as they are, each note saying why; the rest as above.
  const why = "no Chrome or Edge on this machine makes the export's copy lighter: copy it in at the size the page needs";
  assert.deepEqual(largePictureNotes({ html, directory: folder, copies: why }), [
    `assets/photo.jpg (line 10): 3.4 MB, 7458×4972px; the export embeds it as it is, 4.5 MB as a data: URL — a 2000px copy would be about 0.6 MB; ${why}`,
    `assets/wide.png (lines 11 and 13): 0.4 MB, 3000×800px; the export embeds it as it is, twice, 1.0 MB as data: URLs — a 2000px copy would be about 0.2 MB; ${why}; shown twice: the export embeds it twice; show it once and refer back to it in words`,
    `assets/shot.png (line 12): 1.5 MB, 1800×1200px; the export embeds it as it is, 2.0 MB as a data: URL — as a JPEG (for a photograph) it would be about 0.5 MB; ${why}`,
    "assets/small.png (lines 13 and 16): shown twice: the export embeds it twice; show it once and refer back to it in words (0.1 MB as data: URLs)",
    "assets/big.svg (line 14): 1.2 MB; the export embeds it as it is, 1.6 MB as a data: URL",
    "assets/chart.png (line 16): 1.2 MB, 1800×1200px; the export embeds it as it is, 1.6 MB as a data: URL — as a JPEG (for a photograph) it would be about 0.5 MB",
  ]);
  assert.deepEqual(notesByKind({ slug: "heavy", html, directory: folder }, { copies: why }).fix.length, 6, "notesByKind passes copies on");
  // A note, never a failure: the check passes such a report, and notesOf has it among the notes.
  assert.deepEqual(exportFailures({ slug: "heavy", html, directory: folder }), []);
  assert.ok(notesOf({ slug: "heavy", html, directory: folder }).some((note) => note.startsWith("assets/big.svg (line 14): 1.2 MB")));
  // A copy is promised only when it is a quarter lighter at least (a JPEG already as dense as the
  // copy's estimate says none), and a lossless WebP (VP8L, alone or after VP8X) is weighed as a PNG is.
  await fs.writeFile(path.join(folder, "assets", "dense.jpg"), jpeg(4001, 2999, Math.round(0.7 * MB)));
  const vp8l = riff("VP8L", (bytes) => bytes.writeUInt32LE((2999 & 0x3fff) | ((1999 & 0x3fff) << 14), 21));
  const vp8x = riff("VP8X", (bytes) => { bytes.writeUInt32LE(10, 16); bytes.writeUIntLE(2999, 24, 3); bytes.writeUIntLE(1999, 27, 3); bytes.write("VP8L", 30, "latin1"); bytes.writeUInt32LE(6, 34); });
  await fs.writeFile(path.join(folder, "assets", "flat.webp"), Buffer.concat([vp8l, Buffer.alloc(400_000 - vp8l.length)]));
  await fs.writeFile(path.join(folder, "assets", "flat-x.webp"), Buffer.concat([vp8x, Buffer.alloc(400_000 - vp8x.length)]));
  // (As pictures of <img> elements the export copies each: no note; as CSS backgrounds, embedded as they are.)
  assert.deepEqual(largePictureNotes({ html: page('<img src="assets/dense.jpg" alt="">\n<img src="assets/flat.webp" alt="">\n<img src="assets/flat-x.webp" alt="">'), directory: folder }), []);
  assert.deepEqual(largePictureNotes({ html: page('<div style="background: url(assets/dense.jpg)"></div>\n<div style="background: url(assets/flat.webp)"></div>\n<div style="background: url(assets/flat-x.webp)"></div>'), directory: folder }), [
    "assets/dense.jpg (line 10): 0.7 MB, 4001×2999px; the export embeds it as it is, 0.9 MB as a data: URL",
    "assets/flat.webp (line 11): 0.4 MB, 3000×2000px; the export embeds it as it is, 0.5 MB as a data: URL — a 2000px copy would be about 0.2 MB",
    "assets/flat-x.webp (line 12): 0.4 MB, 3000×2000px; the export embeds it as it is, 0.5 MB as a data: URL — a 2000px copy would be about 0.2 MB",
  ]);
  // A picture named so that the preview serves none by it (a name of characters it does not take, in a
  // folder of assets/) fails, and is weighed all the same, as the export will embed it once it is copied
  // in under a name it takes: the copy is made the size the page needs at once. Its failure says why.
  await fs.mkdir(path.join(folder, "assets", "images"), { recursive: true });
  await fs.writeFile(path.join(folder, "assets", "B263_古文 孝経.png"), png(7458, 4972, Math.round(1.5 * MB)));
  await fs.writeFile(path.join(folder, "assets", "images", "scan.jpg"), jpeg(7458, 4972, Math.round(3.4 * MB)));
  const misnamed = page([
    '<figure class="doc-image"><img src="assets/B263_古文 孝経.png" alt="孝経"><figcaption></figcaption></figure>',
    '<figure class="doc-image"><img src="assets/images/scan.jpg" alt="扫描"><figcaption></figcaption></figure>',
  ].join("\n"));
  // (The export copies each once it is served, as the picture of an <img>: no note but its failure; one a CSS
  // background names is weighed.)
  assert.deepEqual(largePictureNotes({ html: misnamed, directory: folder }), []);
  assert.deepEqual(largePictureNotes({ html: misnamed.replace(/<img src="([^"]+)"[^>]*>/g, '<span style="background: url(&quot;$1&quot;)"></span>'), directory: folder }), [
    "assets/B263_古文 孝経.png (line 10): 1.5 MB, 7458×4972px; its name keeps it out of the preview and the export (the failure at its line says why); copied into assets/ under a name they take, the export embeds it as it is, 2.0 MB as a data: URL — a 2000px copy would be about 0.1 MB: copy it in at the size the page needs",
    "assets/images/scan.jpg (line 11): 3.4 MB, 7458×4972px; its name keeps it out of the preview and the export (the failure at its line says why); copied into assets/ under a name they take, the export embeds it as it is, 4.5 MB as a data: URL — a 2000px copy would be about 0.6 MB: copy it in at the size the page needs",
  ]);
  assert.deepEqual(exportFailures({ slug: "heavy", html: misnamed, directory: folder }), [
    "line 10: an image's picture (assets/B263_古文 孝経.png): its name holds 古, 文, a space, 孝, 経, which the preview serves no file by (a name is 1 to 81 characters, each a letter a-z or A-Z, a digit, a dot, a dash or an underscore, the first a letter or a digit): copy the file in under such a name, as assets/b263.png",
    "line 11: an image's picture (assets/images/scan.jpg): the preview serves the files right in assets/, none in a folder of it (assets/images/): move the file into assets/, as assets/scan.jpg",
  ]);
  // A picture shown more than once, whatever its size: a note, as each place holds a copy; a link's icon
  // beside each link to its site is what it is for, and counts for none.
  const mention = (site) => `<a class="doc-link-mention" href="https://example.com/${site}"><img class="doc-link-mention-icon" src="assets/small.png" alt="">例</a>`;
  assert.deepEqual(largePictureNotes({ html: page(`<p>${mention("a")} 和 ${mention("b")}</p>\n<p>${mention("c")}</p>`), directory: folder }), []);
  assert.deepEqual(largePictureNotes({ html: page('<figure class="doc-image"><img src="assets/small.png" alt=""><figcaption></figcaption></figure>\n<p>正文</p>\n<figure class="doc-image"><img src="assets/small.png" alt=""><figcaption></figcaption></figure>\n<p><img src="assets/small.png" alt=""></p>'), directory: folder }), [
    "assets/small.png (lines 10, 12 and 13): shown 3 times: the export embeds it 3 times; show it once and refer back to it in words (0.1 MB as data: URLs)",
  ]);
}

// What an Agent used to be told never to do to a document's identity, said by gallery check
// (src/render/identity-checks.mjs, each with how to mend it): a data-block-id that is not an id Gallery
// made (eight lowercase letters and digits, a letter first: one made up, an empty one), an id moved off
// a list item onto the paragraph in it, and a document folder whose doc.json says "instructions": true.
// Only what the file shows for certain: ids Gallery made, in the markup it writes (a held paragraph
// with an id of its own under an item with one, a container's new wrapper), a code sample that spells
// the attribute, a template's content, raise nothing.
{
  const page = (body) => `<!doctype html>\n<html><head><title>t</title></head>\n<body>\n<main class="doc-page" data-doc-id="x">\n${body}\n</main>\n</body></html>`;
  assert.deepEqual(identityFailures(page('<p data-block-id="k3xv9q2a">一</p>\n<ul><li data-block-id="aaaaaaaa">项<p data-block-id="bbbbbbbb">项下</p></li></ul>\n<div class="doc-columns"><div class="doc-column"><p data-block-id="cccccccc">包进新容器</p></div></div>')), []);
  assert.deepEqual(identityFailures(page('<pre>data-block-id="intro"</pre>\n<p>写 data-block-id="x" 的文字</p>\n<template><p data-block-id="in-template">x</p></template>\n<!-- <p data-block-id="comment"> -->')), [], "text, a comment and a template are no element of the page");
  const made = identityFailures(page('<h2 data-block-id="intro">一</h2>\n<p data-block-id="">二</p>\n<p data-block-id="K3XV9Q2A">三</p>\n<p data-block-id="k3xv9q2a">好</p>'));
  assert.equal(made.length, 1);
  assert.match(made[0], /^data-block-id is not an id Gallery made: "intro" \(line 5\), an empty one \(line 6\) and "K3XV9Q2A" \(line 7\); an id is eight lowercase letters and digits, a letter first, and only Gallery makes one: take the attribute off the element \(gallery export gives every block an id\), and write none for a new block$/);
  assert.match(identityFailures(page(Array.from({ length: 8 }, (_, at) => `<p data-block-id="n${at}">x</p>`).join("\n")))[0], /\(line 10\) and 2 more; an id is/, "six named, the rest counted");
  const held = identityFailures(page('<ul>\n<li><p data-block-id="k3xv9q2a">项</p></li>\n<li data-block-id="aaaaaaaa"><p data-block-id="bbbbbbbb">好</p></li>\n<li><p>新项，没有身份</p></li>\n</ul>'));
  assert.deepEqual(held, ['line 6: the list item has no data-block-id but the paragraph in it has one ("k3xv9q2a", line 6): an id stays on the item the words belong to, not on a paragraph in it; put "k3xv9q2a" on the <li> and take it off the <p> (a paragraph held by an item has an id of its own, or none, besides the item\'s)']);
  assert.equal(identityFailures(page('<ul><li><p data-block-id="intro">x</p></li></ul>')).length, 1, "a made-up id on the paragraph: said as a made-up id alone");
  // The folders marked "instructions": true at the root: only those holding a page, not the dot folders, exports/, or a folder with no page.
  const space = path.join(root, "marking");
  for (const [name, json, html] of [["notes", { title: "n", instructions: true }, true], ["fine", { title: "f" }, true], ["bare", { instructions: true }, false], ["exports", { instructions: true }, true], [".gallery", { instructions: true }, true], ["old", { title: "o", instructions: true }, "report"]]) {
    const folder = path.join(space, name);
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(path.join(folder, html === "report" ? "report.json" : "doc.json"), JSON.stringify(json));
    if (html) await fs.writeFile(path.join(folder, html === "report" ? "report.html" : "doc.html"), page("<p>x</p>"));
  }
  const marked = await markedAsInstructions(space);
  assert.deepEqual([...marked.keys()], ["notes"], "an older layout's report.json marked so is a page a migration left at the root, not a document's mistake");
  assert.match(marked.get("notes"), /^doc\.json says "instructions": true, which marks the 写作偏好 page .*Gallery lists, checks and exports no folder that carries it and moves it into \.gallery\/pages\/ when it next migrates the workspace\. A document never has it: take "instructions" out of doc\.json$/);
  assert.equal((await markedAsInstructions(path.join(root, "nowhere"))).size, 0);
}

await fs.rm(root, { recursive: true, force: true });
console.log("Checked the checks that read real markup: the network and storage in code alone (scripts, on* attributes, javascript: addresses), repeated block ids by element (and add-block-ids.mjs refusing them), a TeX formula between single dollars (never money, code or what asks for single dollars), main[data-doc-id], the size limit, the export's policy after the real <head> (a BOM before it too), tags and references to the document's folder read from elements (there, and none an export cannot hold), and every export checked (the workbench's, Markdown too, each page made the kit's first, a 422 saying why; no file for a page whose ids repeat or whose file kept changing); and its notes: the paths of this machine in the text a reader reads (not code, attributes, comments, scripts, hidden text, TeX, a web address or a project's relative folder), and the pictures an export embeds as they are over 1 MB or 2400px (none an <img> shows that the export makes a copy of, but where it makes none: no Chrome or Edge, --original-images, which the note says; their pixels read from PNG, JPEG, GIF, WebP and AVIF headers, what the export holds of them and what a 2000px copy would weigh when a quarter lighter, a lossless WebP as a PNG; one named so that it fails weighed too), and a picture shown more than once whatever its size (no link's icon); and the document identity checks (a data-block-id that is not an id Gallery made, an id moved from a list item onto its paragraph, a folder marked \"instructions\": true), each saying how to mend it and none raised by ids Gallery made.");
