import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { componentFailures } from "../../src/render/component-checks.mjs";
import { packageExportFailures, packagesOf, withPackageCopies } from "../../src/render/package-files.mjs";
import { exportFailures, offlineReports, quickFailures } from "../../src/render/pipeline.mjs";
import { renderReportHtml } from "../../src/render/report-html.mjs";
import { parseReport } from "../../src/render/report-tree.mjs";
import { tagFailures } from "../../src/render/assets.mjs";
import vm from "node:vm";
import { currentCatalog, forgetCatalog, packageAddress, packageTags } from "../../src/shared/component-catalog.mjs";
import { exportPackagesOf, packageScript, packagesSaid } from "../../src/shared/export-wrap.mjs";
import { attr, walk } from "../../src/shared/html-tree.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { openReport } from "../../src/transfer/dom.mjs";
import { reportMarkdown } from "../../src/transfer/markdown.mjs";
import { undoExport } from "../../src/transfer/own-report.mjs";

// A component package's files in a page and in an export (src/render/package-files.mjs; docs/render.md,
// "A custom block on a page"): only what a document uses, after the kit's tags; in an export inline, all
// a package's text may hold held in, and what its kit asks for with it; the one check of a component
// whatever it goes through, and what an export adds; the page's Markdown as a manifest says. What runs
// in a browser with no server is the scenarios' (packageOffline, packageViewCopy).

const page = (slug, body, { head = "", tail = "" } = {}) => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${slug}</title>${head}
</head>
<body>
  <main class="doc-page" data-doc-id="${slug}" aria-label="页面">
    <header class="doc-header">
      <h1 class="doc-title">${slug}</h1>
    </header>
    ${body}
  </main>${tail}
</body>
</html>
`;

const STRIP = '<div class="strip" data-doc-component="local/strip" data-block-id="s1"><h3>指标</h3><p class="strip-caption">说明</p><dl><dt>收入</dt><dd>12 万</dd></dl></div>';
const TALLY = '<div class="tally" data-doc-component="local/tally" data-block-id="t1"><h3>计数</h3><table><tr><th>项</th><th>数</th></tr><tr><td>甲</td><td>1</td></tr></table><button type="button" class="tally-refresh">刷新</button><output class="tally-drawn"></output></div>';

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-package-files-"));
const workspace = process.env.GALLERY_DEFAULT_WORKSPACE;
process.env.GALLERY_DEFAULT_WORKSPACE = root;
const folderOf = (id) => path.join(root, "components", ...id.split("/"));
const put = (id, file, text) => {
  fs.mkdirSync(folderOf(id), { recursive: true });
  fs.writeFileSync(path.join(folderOf(id), file), text);
  forgetCatalog(root);
};
const manifest = (id, fields = {}) => JSON.stringify({ id, apiVersion: 1, version: "1.0.0", name: { zh: "件", en: "Piece" }, description: { zh: "一件", en: "A piece" }, parts: { title: { at: ":scope > h3", edit: "text" } }, ...fields });
const writeDocument = (slug, text) => {
  fs.mkdirSync(path.join(root, slug), { recursive: true });
  fs.writeFileSync(path.join(root, slug, "doc.html"), text);
  fs.writeFileSync(path.join(root, slug, "doc.json"), JSON.stringify({ title: slug, description: "测试", type: "report" }));
};
// The elements of a page's tree that `test` takes.
const elements = (html, test) => {
  const found = [];
  walk(parseReport(html), (node) => { if (test(node)) found.push(node); }, { inTemplates: false });
  return found;
};
const marked = (html) => elements(html, (node) => attr(node, "data-doc-package") !== undefined);
const preview = (html) => renderReportHtml(html, { slug: "t", mode: "preview", reportsDirectory: root }).html;

try {
  fs.cpSync(path.join(projectRoot, "tests", "fixtures", "components"), path.join(root, "components"), { recursive: true });
  forgetCatalog(root);
  const catalog = currentCatalog(root);
  const strip = catalog.packages.get("local/strip");
  const tally = catalog.packages.get("local/tally");

  // ---------- the tags: what a page uses, after the kit's ----------
  {
    assert.deepEqual(packageTags(strip).scripts.length, 1, "no script: the line that tells the kit of it, and that is all");
    assert.equal(packageTags(strip).styles[0], `<link rel="stylesheet" href="${packageAddress(strip, "style.css")}" data-doc-package="local/strip">`, "by the route, with the stamp");
    assert.match(packageTags(tally).scripts[0], /^<script data-doc-package="local\/tally">DocKit\.describe\(\{"id":"local\/tally","match":.*,"parts":.*,"runtime":.*\}\);<\/script>$/);
    assert.equal(packageTags(tally).scripts[1], `<script src="${packageAddress(tally, "kit.js")}" data-doc-package="local/tally"></script>`);

    const none = preview(page("t", "<p>词</p>"));
    assert.deepEqual(marked(none), [], "a page of no instance loads none");
    assert.ok(none.includes('DocKit.describe({"id":"local/tally"') && /<script data-doc-dev>DocKit\.describe/.test(none), "and is told of them for what a paste brings");

    const own = { head: "\n  <style>.mine { color: red; }</style>", tail: '\n  <script>window.own = typeof DocKit;</script>' };
    const shown = preview(page("t", `${TALLY}\n${STRIP}`, own));
    const order = [...shown.matchAll(/<(?:link|style|script)\b[^>]*>/g)].map(([tag]) => tag);
    const place = (test) => order.findIndex(test);
    assert.ok(place((tag) => tag.includes('data-doc-kit="styles"')) < place((tag) => tag.includes('rel="stylesheet"') && tag.includes("data-doc-package")), "a package's style after the kit's");
    assert.ok(place((tag) => tag.includes('rel="stylesheet"') && tag.includes("local/tally")) < place((tag) => tag === "<style>"), "and before the document's own");
    const lastKit = order.findLastIndex((tag) => tag.startsWith("<script") && /data-doc-(?:kit|vendor)=/.test(tag));
    const describes = place((tag) => tag === '<script data-doc-package="local/tally">');
    const script = place((tag) => tag.includes("/__gallery/components/local/tally/kit.js"));
    assert.ok(lastKit < describes && describes < script, "its line and its script after the kit's scripts, in that order");
    assert.ok(script < place((tag) => tag === "<script>"), "and before the document's own script");
    assert.equal(marked(shown).length, 5, "each file of each, none twice");
    assert.ok(!/<script data-doc-dev>[^<]*"id":"local\/(?:tally|strip)"/.test(shown), "and no line of the preview's for what the page tells for good");
    assert.ok(shown.includes('data-doc-kit="dialogs"'), "a file of the kit's its manifest names is on the page");

    const older = page("t", TALLY, { tail: '\n  <script src="/kit/runtime.js" data-doc-kit="runtime"></script>\n  <script src="/kit/dialogs.js" data-doc-kit="dialogs"></script>' });
    assert.ok(renderReportHtml(older, { slug: "t", reportsDirectory: root }).html.includes('data-doc-kit="dialogs"'), "and one a source writes is not pruned while it asks for it");
    assert.ok(!renderReportHtml(older.replace(TALLY, ""), { slug: "t", reportsDirectory: root }).html.includes('data-doc-kit="dialogs"'), "as it is once nothing does");

    const stamped = renderReportHtml(page("t", STRIP), { slug: "t", mode: "preview", reportsDirectory: root, kit: (asset) => `/kit/${asset.file ?? asset.id}?v=abc` }).html;
    assert.ok(/\?v=abc" data-doc-(?:kit|vendor)="[a-z-]+"><\/script>\n\s*<script data-doc-package="local\/strip">/.test(stamped), "after the last of the kit's tags when those name their stamps too");

    put("local/later", "component.json", manifest("local/later", { apiVersion: 2 }));
    put("local/later", "kit.js", "window.ran = true;");
    put("local/broken", "component.json", "{ id: ");
    put("local/broken", "style.css", "p { color: red; }");
    const instances = '<div data-doc-component="local/later"><h3>题</h3></div><div data-doc-component="local/broken"><h3>题</h3></div><div data-doc-component="local/gone"><h3>题</h3></div>';
    const refused = preview(page("t", instances));
    assert.deepEqual(marked(refused), [], "a package that does not load, or of a version this Gallery does not run, gets nothing");
    assert.ok(!refused.includes("/__gallery/components/"), "no address of any of it");
    assert.ok(/<script data-doc-dev>.*"id":"local\/later","problem"/.test(refused), "but its note's words");
    assert.deepEqual(marked(renderReportHtml(page("t", instances), { slug: "t", reportsDirectory: root }).html), [], "in an export too");
    fs.rmSync(folderOf("local/later"), { recursive: true });
    fs.rmSync(folderOf("local/broken"), { recursive: true });
    forgetCatalog(root);
  }

  // ---------- an export: inline, whatever a package's text holds, and nothing linked ----------
  {
    writeDocument("alpha", page("alpha", `${TALLY}\n${STRIP}\n<p id="after">后面</p>`, { head: "\n  <style>.mine { color: red; }</style>" }));
    const render = await offlineReports({ directory: root });
    const html = await render("alpha");
    assert.deepEqual(elements(html, (node) => (node.tagName === "script" && attr(node, "src") !== undefined) || (node.tagName === "link" && attr(node, "rel") === "stylesheet")).map((node) => attr(node, "src") ?? attr(node, "href")), [], "nothing linked");
    assert.ok(!html.includes("/__gallery/"), "no address of the server's");
    const copies = marked(html);
    assert.deepEqual(copies.map((node) => [node.tagName, attr(node, "data-doc-package")]), [["style", "local/tally"], ["style", "local/strip"], ["script", "local/tally"], ["script", "local/tally"], ["script", "local/strip"]], "what the tags loaded, in their places");
    assert.equal(elements(html, (node) => attr(node, "id") === "after").length, 1, "the page's main as it was");
    assert.ok(elements(html, (node) => node.tagName === "style").some((node) => attr(node, "data-doc-kit") === "styles-inline"), "the kit's copies beside them");
    assert.ok(html.includes('data-doc-kit="dialogs-inline"'), "and the kit's file its manifest asks for goes as the kit's go");

    // The style: its own file a data: address; what would end the element held in, the rest as it is.
    const style = copies[0].childNodes[0].value;
    const picture = Buffer.from(fs.readFileSync(path.join(folderOf("local/tally"), "tick.svg"))).toString("base64");
    assert.ok(style.includes(`url("data:image/svg+xml;base64,${picture}")`), "a file its style names, inside it");
    assert.ok(style.includes("<\\/style>") && style.includes("<!-- <script>"), "a comment saying </style> ends nothing");
    assert.equal(copies[0].childNodes.length, 1, "one piece of text");
    assert.ok(style.endsWith(fs.readFileSync(path.join(folderOf("local/tally"), "style.css"), "utf8").split("tick.svg").at(-1)), "to its end");

    // The script: the file's text, byte for byte, whatever it says, in a string no parser stops in.
    const kit = fs.readFileSync(path.join(folderOf("local/tally"), "kit.js"), "utf8");
    assert.ok(/<\/script>/.test(kit) && /<!--/.test(kit) && /<script>/.test(kit), "the fixture says all three");
    const ownScript = packageScript(kit);
    const carried = copies[3].childNodes[0].value;
    assert.ok(!/<\/script|<!--|<script/i.test(carried), "none of them reaches the parser");
    const string = /script\.textContent = ("(?:[^"\\]|\\.)*");/.exec(carried)[1];
    assert.equal(JSON.parse(string), ownScript, "and the text is the file's, in a function of its own");
    assert.equal(ownScript.split("\n").length, kit.split("\n").length + 1, "on the file's lines");
    let run = null;
    const fake = { createElement: () => ({ set textContent(text) { run = text; }, remove() {} }), currentScript: { after() {} } };
    new Function("document", carried)(fake);
    assert.equal(run, ownScript, "as the script puts it in");
    assert.equal(copies[2].childNodes[0].value.startsWith('DocKit.describe({"id":"local/tally"'), true, "the line that tells the kit stays a line");

    // A second package whose text ends what it can.
    put("local/odd", "component.json", manifest("local/odd", { assets: ["fonts/face.woff2"] }));
    put("local/odd", "kit.js", "﻿window.text = `</SCRIPT ><script>`; // </script>");
    put("local/odd", "style.css", "﻿a::after { content: '</STYLE><script>alert(1)</script>'; } /* url(missing.png) */ @font-face { font-family: f; src: url(./fonts/face.woff2?v=1#x) format('woff2'); } b { background: URL(fonts/face.woff2); } i { background: image-set('fonts/face.woff2' 1x); } u { content: 'url(fonts/face.woff2)'; }");
    put("local/odd/fonts", "face.woff2", "woff");
    forgetCatalog(root);
    const oddly = currentCatalog(root).packages.get("local/odd");
    assert.deepEqual(packageExportFailures([oddly]), [], "what a comment names is no file, and an address may carry a query");
    writeDocument("odd", page("odd", '<div data-doc-component="local/odd"><h3>题</h3></div>\n<p id="after">后面</p>'));
    const odd = await (await offlineReports({ directory: root }))("odd");
    assert.equal(elements(odd, (node) => attr(node, "id") === "after").length, 1, "nothing of it ends its element early");
    const [oddStyle] = marked(odd);
    assert.ok(oddStyle.childNodes[0].value.startsWith("a::after"), "no byte-order mark in the style");
    assert.ok(oddStyle.childNodes[0].value.includes("url(\"data:font/woff2;base64,") && oddStyle.childNodes[0].value.includes("url(missing.png)"), "a file in a folder of it, and a comment left");
    assert.ok(oddStyle.childNodes[0].value.includes('URL("data:font/woff2;base64,') && oddStyle.childNodes[0].value.includes("image-set('data:font/woff2;base64,") && oddStyle.childNodes[0].value.includes("content: 'url(fonts/face.woff2)'"), "as CSS reads it: a function's name in any case, image-set(…), and a string left");
    assert.equal(JSON.parse(/script\.textContent = ("(?:[^"\\]|\\.)*");/.exec(marked(odd).at(-1).childNodes[0].value)[1]), packageScript("window.text = `</SCRIPT ><script>`; // </script>"), "nor in the script");
    fs.rmSync(folderOf("local/odd"), { recursive: true });
    forgetCatalog(root);

    // Two packages on a page never meet, whatever they declare; `this`, a line comment at the end and a
    // directive stay what they were.
    {
      const scope = vm.createContext({});
      const first = 'const WIDTH = 1;\nfunction label() { return "a"; }\nvar kept = 1;\nglobalThis.a = [WIDTH, label(), this === globalThis]; // to the end';
      const second = '"use strict";\nconst WIDTH = 2;\nfunction label() { return "b"; }\nglobalThis.b = [WIDTH, label(), this === globalThis, (function () { return this; })() === undefined];';
      vm.runInContext(packageScript(first), scope);
      vm.runInContext(packageScript(second), scope);
      assert.deepEqual(JSON.parse(vm.runInContext("JSON.stringify([a, b, typeof kept, typeof label])", scope)), [[1, "a", true], [2, "b", true, true], "undefined", "undefined"]);
    }

    // What an export says it holds, for gallery qa; a page of none says nothing, and an import takes it out.
    assert.equal(exportPackagesOf(html), packagesSaid([tally, strip]), "each package it holds, by its stamp");
    assert.equal(exportPackagesOf(await render("alpha")), packagesSaid([strip, tally]), "in one order whatever the page's");
    writeDocument("plain", page("plain", "<p>词</p>"));
    const plain = await render("plain");
    assert.ok(!plain.includes("<meta name=\"doc-export-packages\""), "a page of none says none");
    assert.equal(exportPackagesOf('<head><meta name="doc-export-packages" content="local/a@1"></head>'), "", "and what is not where an export writes it is no word of one");

    // A page of no package is not read for one: its text is left as it came, whatever a kit's text spells of the mark.
    const untouched = { includes: () => false };
    assert.equal(withPackageCopies(untouched, currentCatalog(root)), untouched);

    // A tag whose package is gone stays linked, which no export holds.
    assert.equal(withPackageCopies('<script src="/x.js" data-doc-package="local/gone"></script>', currentCatalog(root)), '<script src="/x.js" data-doc-package="local/gone"></script>');

    // An export read back: nothing of a package stays in the source, whose instances are all it holds of one.
    const back = undoExport(html);
    assert.deepEqual(marked(back), [], "an import takes out all it holds of a package");
    assert.ok(!back.includes("doc-export-packages"), "what it says of them too");
    assert.ok(back.includes(TALLY) && back.includes(STRIP) && back.includes(".mine"), "and leaves the instances and the page's own style");

    // What an exported file copied in as a source says.
    assert.ok(tagFailures(html).some((failure) => /an export's inline copy of the kit/.test(failure)));
    const copied = tagFailures(page("t", '<p>词</p>', { tail: '\n  <script data-doc-package="local/tally">DocKit.describe({});</script>' }));
    assert.equal(copied.length, 1, "what it holds of a package is the same");
    assert.match(copied[0], /line 15: an export's inline copy of the kit \(data-doc-package="local\/tally"\)/);
  }

  // ---------- one check of a component: gallery check and both exports, in the same words ----------
  {
    const run = (code) => {
      const done = spawnSync(process.execPath, ["--input-type=module", "-e", code], { cwd: projectRoot, encoding: "utf8", env: { ...process.env, GALLERY_WORKSPACE: root } });
      assert.equal(done.status, 0, done.stderr);
      return JSON.parse(done.stdout.trim().split("\n").at(-1));
    };
    const failuresOf = (slug) => run(`
      import { checkSelectedReports, exportReports } from "./src/render/pipeline.mjs";
      const checked = await checkSelectedReports(["${slug}"]);
      const exported = await exportReports(["${slug}"]);
      console.log(JSON.stringify({ checked: checked.failures.get("${slug}") ?? [], exported: exported.failures.get("${slug}") ?? [], files: exported.exported.length }));
    `);
    const offline = async (slug) => (await offlineReports({ directory: root }))(slug).then(() => { throw new Error(`${slug} exported`); }, (error) => (error.reason === "check" ? error.failures : Promise.reject(error)));
    const gallery = (...args) => spawnSync(process.execPath, [path.join(projectRoot, "src", "cli", "bin.mjs"), ...args], { encoding: "utf8", env: { ...process.env, GALLERY_WORKSPACE: root, GALLERY_NO_BROWSER: "1" } });
    forgetCatalog(root);

    // An instance that lacks what its manifest says it has.
    writeDocument("short", page("short", '<div class="strip" data-doc-component="local/strip" data-block-id="s1"><dl></dl></div>'));
    const short = await offline("short");
    assert.deepEqual(short, ["local/strip (line 13) has no title (h3)"], "the workbench's export fails on it");
    const said = failuresOf("short");
    assert.deepEqual([said.checked, said.exported, said.files], [short, short, 0], "as gallery check and gallery export do, in the same words");
    const checkShort = gallery("check", "short");
    assert.ok(checkShort.status !== 0 && `${checkShort.stdout}${checkShort.stderr}`.includes(short[0]), "the command says so");
    assert.ok(`${gallery("export", "short").stderr}`.includes(short[0]), "and its export");

    // Which of them a reader is told of, as the workbench's dialog says it.
    const failure = await (await offlineReports({ directory: root }))("short").catch((error) => error);
    assert.equal(failure.component, "local/strip", "the package its first failure says");

    // A package whose script a browser cannot read.
    put("local/wrong", "component.json", manifest("local/wrong"));
    put("local/wrong", "kit.js", "const a = 1;\nconst = 2;\n");
    forgetCatalog(root);
    writeDocument("wrong", page("wrong", '<div data-doc-component="local/wrong" data-block-id="w1"><h3>题</h3></div>'));
    const wrong = await offline("wrong");
    assert.equal(wrong.length, 1);
    assert.match(wrong[0], /^local\/wrong: its kit\.js does not run: .* \(line 2\)$/, "found with no line of it run");
    const scriptSaid = failuresOf("wrong");
    assert.deepEqual([scriptSaid.checked, scriptSaid.exported, scriptSaid.files], [wrong, wrong, 0], "the same words again");
    assert.ok(`${gallery("check", "wrong").stderr}${gallery("check", "wrong").stdout}`.includes("its kit.js does not run"), "gallery check finds it, no export needed");

    // Markdown runs no script of a package and holds no style of one: nothing of theirs keeps a page from it.
    const reading = await offlineReports({ directory: root });
    await reading.check("wrong");
    await reading.check("short");
    assert.equal((await offline("wrong")).length, 1, "as an offline file it fails all the same");
    assert.equal((await reading("wrong").catch((error) => error)).component, "local/wrong", "the package named");
    writeDocument("spoken", page("spoken", '<div data-doc-component="local/wrong" data-block-id="w1"><h3>题</h3></div><script>fetch("/x");</script>'));
    await assert.rejects(reading.check("spoken"), (error) => error.reason === "check" && /calls fetch/.test(error.failures[0]) && !error.component, "what any export needs of the page goes for Markdown too, as ever");

    assert.deepEqual(quickFailures({ slug: "strip-alone", html: page("strip-alone", STRIP), metadata: {}, directory: path.join(root, "strip-alone") }), [], "and no other package's document hears of it");
    put("local/wrong", "kit.js", "window.fine = 1;\n");
    forgetCatalog(root);
    assert.deepEqual(componentFailures(page("wrong", '<div data-doc-component="local/wrong"><h3>题</h3></div>')), [], "mended, it is read again");
    fs.rmSync(folderOf("local/wrong"), { recursive: true });

    // What the checks ask of an instance goes for an export of no block of a package too: a kit's component, the same words.
    writeDocument("kit", page("kit", '<div class="doc-nothing">词</div>'));
    const kitFailure = await offline("kit");
    assert.deepEqual(kitFailure, failuresOf("kit").checked, "a class the kit does not know fails the workbench's export as it fails the check");

    // A package that does not load, or no package: a note, and an export that shows what it holds.
    forgetCatalog(root);
    writeDocument("missing", page("missing", '<div data-doc-component="local/gone" data-block-id="gone0001"><h3>题</h3></div>')); // an id of Gallery's form: gallery check refuses one it did not make
    assert.ok((await offlineReports({ directory: root }).then((render) => render("missing"))).includes("local/gone"), "no failure");
    assert.equal(gallery("check", "missing").status, 0, "of gallery check either");
  }

  // ---------- what an export adds ----------
  {
    const failing = (files) => {
      put("local/out", "component.json", manifest("local/out", { assets: ["ok.png"] }));
      put("local/out", "ok.png", "png");
      for (const [file, text] of Object.entries(files)) put("local/out", file, text);
      forgetCatalog(root);
      const failures = packageExportFailures([currentCatalog(root).packages.get("local/out")]);
      for (const file of Object.keys(files)) fs.rmSync(path.join(folderOf("local/out"), file));
      forgetCatalog(root);
      return failures;
    };
    assert.deepEqual(failing({ "style.css": "a { background: url(data:image/gif;base64,R0) } b { background: url('./ok.png') } c { fill: url(#mark) }" }), [], "data:, its own file, a place in the page");
    assert.deepEqual(failing({ "style.css": "a { background: url(https://example.com/a.png) }" }), ["local/out: its style.css loads https://example.com/a.png: external resources are not portable"]);
    assert.deepEqual(failing({ "style.css": "a { background: url(/kit/a.png) }" }), ["local/out: its style.css loads /kit/a.png: external resources are not portable"]);
    assert.deepEqual(failing({ "style.css": "a { background: url(none.png) }" }), ["local/out: its style.css names none.png, which an export cannot hold: put the file in the package and name it in its assets"]);
    assert.deepEqual(failing({ "style.css": "@import 'other.css';" }), ["local/out: its style.css has an @import, which an export cannot hold: write what it imports into style.css"]);
    assert.deepEqual(failing({ "style.css": "@IMPORT url(other.css);" }), ["local/out: its style.css has an @import, which an export cannot hold: write what it imports into style.css"]);
    // As CSS reads it: a function's name in any case, image-set(…), and nothing a comment or a string spells.
    assert.deepEqual(failing({ "style.css": "a { background: URL(ok.png) } b { background: Url(https://example.com/x.png) } c { background: image-set(\"ok.png\" 1x) } d { background: image-set(\"https://example.com/y.png\" 1x) } e { background: URL(nope.png) }" }), [
      "local/out: its style.css loads https://example.com/x.png: external resources are not portable",
      "local/out: its style.css loads https://example.com/y.png: external resources are not portable",
      "local/out: its style.css names nope.png, which an export cannot hold: put the file in the package and name it in its assets",
    ]);
    assert.deepEqual(failing({ "style.css": "a::after { content: \"url(none.png) @import\"; } /* url(none.png) @import 'x'; */ b { background: url() }" }), [], "no address at all");
    assert.deepEqual(failing({ "kit.js": "// fetch(x)\nconst a = 'fetch';\nwindow.fetch('/x');\n" }), ["local/out: line 3 of its kit.js calls fetch(…): the export blocks the network; put its data in the instance"]);
    assert.deepEqual(failing({ "kit.js": "new WebSocket('ws://x');\nconst sum = new Function('a', 'return a');\neval('1');\n" }), [
      "local/out: line 1 of its kit.js creates new WebSocket(…): the export blocks the network; put its data in the instance",
      "local/out: line 2 of its kit.js creates new Function(…): an export runs no code made from words",
      "local/out: line 3 of its kit.js calls eval(…): an export runs no code made from words",
    ]);
    assert.deepEqual(failing({ "kit.js": "const isFunction = (value) => value instanceof Function;\ntypeof fetch;\n" }), [], "a name that makes no request and no code");
    assert.deepEqual(failing({ "kit.js": "function load(fetch) { return fetch('/x'); }\n" }), [], "a name of its own");
    assert.deepEqual(failing({ "kit.js": "navigator.sendBeacon('/x');\nnew EventSource('/y');\nimport('https://example.com/a.js');\n" }), [
      "local/out: line 1 of its kit.js calls sendBeacon(…): the export blocks the network; put its data in the instance",
      "local/out: line 2 of its kit.js creates new EventSource(…): the export blocks the network; put its data in the instance",
      "local/out: line 3 of its kit.js calls import(…): the export blocks the network; put its data in the instance",
    ]);

    // What only speaks of a package holds none of it, loads none of it and answers for none of it.
    put("local/out", "kit.js", "fetch('/x');\n");
    put("local/ill", "component.json", manifest("local/ill"));
    put("local/ill", "kit.js", "this is no script");
    forgetCatalog(root);
    const sample = '<div class="doc-code"><pre><code>&lt;div data-doc-component="local/out"&gt;…&lt;/div&gt;</code></pre></div><p>属性写作 data-doc-component="local/ill" 的块</p><!-- <div data-doc-component="local/out"></div> -->';
    const speaking = page("speaking", sample, { tail: '\n  <script>const written = \'<div data-doc-component="local/out">\';</script>' });
    assert.deepEqual(packagesOf(speaking), [], "no instance there");
    assert.deepEqual(marked(preview(speaking)), [], "a page about a package loads none");
    assert.deepEqual(exportFailures({ slug: "speaking", html: speaking, directory: path.join(root, "speaking") }).filter((said) => said.startsWith("local/")), [], "and its script is not held against it");
    assert.deepEqual(componentFailures(speaking).filter((said) => said.startsWith("local/")), [], "nor is one that does not read");
    const held = page("t", '<div data-doc-component="local/strip"><h3>外</h3><div data-doc-component="local/ill"><h3>里</h3></div></div><div data-doc-component="local/tally"><h3>题</h3></div><span data-doc-component="local/out">词</span><div data-doc-component="local/gone"></div>');
    assert.deepEqual(packagesOf(held).map(({ id }) => id), ["local/strip", "local/tally"], "an instance's own, in the page's order: what one holds is that one's, and what can be none is none");
    const slotted = page("t", '<div data-doc-component="local/brief"><h3>题</h3><div data-doc-component="local/ill"></div><div data-doc-slot="body"><div data-doc-component="local/tally"><h3>题</h3></div></div></div>');
    assert.deepEqual(packagesOf(slotted).map(({ id }) => id), ["local/brief", "local/tally"], "what its slot holds is the document's: an instance there brings its package");
    fs.rmSync(folderOf("local/ill"), { recursive: true });
    fs.rmSync(path.join(folderOf("local/out"), "kit.js"));
    forgetCatalog(root);

    // Said by gallery check as by what makes the file, of a document that uses it.
    put("local/out", "kit.js", "fetch('/x');\n");
    forgetCatalog(root);
    writeDocument("out", page("out", '<div data-doc-component="local/out" data-block-id="o1"><h3>题</h3></div>'));
    const source = fs.readFileSync(path.join(root, "out", "doc.html"), "utf8");
    assert.ok(exportFailures({ slug: "out", html: source, directory: path.join(root, "out") }).some((failure) => failure.startsWith("local/out: line 1 of its kit.js calls fetch")));
    assert.ok(quickFailures({ slug: "out", html: source, metadata: {}, directory: path.join(root, "out") }).some((failure) => failure.startsWith("local/out: line 1")));
    fs.rmSync(folderOf("local/out"), { recursive: true });
    forgetCatalog(root);

    // An export is as old as the packages it holds: of the same text, gallery qa does not take it for the file's.
    put("local/kept", "component.json", manifest("local/kept"));
    put("local/kept", "kit.js", "// one\n");
    writeDocument("aged", page("aged", '<div data-doc-component="local/kept" data-block-id="k1"><h3>题</h3></div>'));
    const command = (...args) => spawnSync(process.execPath, [path.join(projectRoot, "src", "cli", "bin.mjs"), ...args], { encoding: "utf8", env: { ...process.env, GALLERY_WORKSPACE: root, GALLERY_NO_BROWSER: "1" } });
    const lookedAt = () => JSON.parse(spawnSync(process.execPath, ["--input-type=module", "-e", 'import { exportOf } from "./src/cli/qa.mjs"; console.log(JSON.stringify(await exportOf("aged")));'], { cwd: projectRoot, encoding: "utf8", env: { ...process.env, GALLERY_WORKSPACE: root } }).stdout.trim().split("\n").at(-1));
    assert.equal(command("export", "aged").status, 0);
    assert.equal(lookedAt().problem, undefined, "as it was made it is the file's");
    put("local/kept", "kit.js", "throw new Error('broken since');\n");
    const aged = lookedAt();
    assert.deepEqual([aged.stale, aged.packaged, aged.edited], [true, true, false], "a package it holds changed, not the text");
    const refused = command("qa", "aged", "--no-export");
    assert.equal(refused.status, 2, `${refused.stdout}${refused.stderr}`);
    assert.match(refused.stderr, /is not of .* as it is now \(it holds local\/kept@[0-9a-f]+, the workspace has local\/kept@[0-9a-f]+\): run gallery export aged first/);
    fs.rmSync(folderOf("local/kept"), { recursive: true });
    forgetCatalog(root);
  }

  // ---------- Markdown: as a manifest says ----------
  {
    const markdown = async (body) => {
      forgetCatalog(root);
      const { document } = await openReport(page("m", `<p>前面</p>\n${body}\n<p>后面</p>`));
      return (await reportMarkdown(document, { title: "题" })).split("\n");
    };
    assert.deepEqual(await markdown(TALLY), ["# 题", "", "前面", "", "计数", "", "| 项 | 数 |", "| --- | --- |", "| 甲 | 1 |", "", "后面"], "parts: a text part a paragraph, a table part a table, what no part names left out");
    assert.deepEqual(await markdown(STRIP), ["# 题", "", "前面", "", "指标", "", "说明", "", "收入 · 12 万", "", "后面"], "another part its words");

    // All the words a part shows: what lays out a word stands in the line of its element.
    put("local/said", "component.json", manifest("local/said", { parts: { note: { at: ":scope > .note", edit: "none" }, numbers: { at: ":scope > dl", edit: "none", optional: true }, list: { at: ":scope > ul", edit: "none", optional: true } } }));
    const spoken = (inside) => markdown(`<div data-doc-component="local/said"><p class="note">注</p>${inside}</div>`).then((lines) => lines.slice(4, -2).filter(Boolean).join(" / "));
    assert.equal(await markdown('<div data-doc-component="local/said"><p class="note">同比 <span class="up">+3%</span> 增长，<span>共</span> 五项</p></div>').then((lines) => lines[4]), "同比 +3% 增长，共 五项", "words around what is inline, whole");
    assert.equal(await spoken("<dl><dt>收入</dt><dd>12 <span>万</span></dd></dl>"), "注 / 收入 · 12 万", "a cell's number and its unit");
    assert.equal(await spoken("<ul><li>一</li><li>二<ul><li>深</li></ul></li></ul>"), "注 / 一 · 二 · 深", "an item's words, and the item it holds");
    assert.equal(await spoken('<dl><dd><span>甲</span><span>乙</span></dd><dd><label>名 <input></label><button><span>按</span></button></dd></dl>'), "注 / 甲 · 乙 · 名 · 按", "pieces with no word beside them stand apart");
    put("local/text", "component.json", manifest("local/text", { markdown: "text", parts: {} }));
    const inText = '<div data-doc-component="local/text"><p>文字 <span>中间</span> 结尾</p><p>题<b>二</b></p></div>';
    assert.deepEqual((await markdown(inText)).slice(4, -2), ["文字 中间 结尾 · 题二"], "text: the same");
    assert.deepEqual((await markdown(inText.replaceAll("local/text", "local/gone"))).slice(4, -2), ["文字 中间 结尾 · 题二"], "no package: the same");
    assert.deepEqual((await markdown('<div class="widget"><div class="row"><span>收入</span><span>12 万</span></div><div>说明 <span>+3%</span> 其后</div>直接的字<style>.a { color: red; }</style><script>no = 1;</script><p>段</p></div>')).slice(4, -2), ["收入 · 12 万 · 说明 +3% 其后 · 直接的字 · 段"], "a report's own widget goes by the same rule, what shows no words left out");
    // A manifest may list its parts in any order; the page's holds. One in another is that one's; what shows no words none.
    put("local/order", "component.json", manifest("local/order", { parts: { last: { at: ":scope > .last", edit: "none" }, first: { at: ":scope > .first", edit: "text" }, inner: { at: ":scope > .last > b", edit: "none", optional: true }, data: { at: ":scope > script", edit: "data", optional: true }, kept: { at: ":scope > template", edit: "none", optional: true } } }));
    const ordered = '<div data-doc-component="local/order"><p class="first">先</p><p class="last">后 <b>粗</b></p><script type="application/json">{"no":1}</script><template><p>不</p></template></div>';
    assert.deepEqual((await markdown(ordered)).slice(4, -2), ["先", "", "后 粗"], "in the file's order, each once, no data and no template");
    put("local/words", "component.json", manifest("local/words", { markdown: "text", parts: { title: { at: ":scope > h3", edit: "text" }, rows: { at: ":scope > table", edit: "none" } } }));
    assert.deepEqual(await markdown('<div data-doc-component="local/words"><h3>题目</h3><p>词</p><table><tr><td>格</td></tr></table></div>'), ["# 题", "", "前面", "", "题目 · 词 · 格", "", "后面"], "text: its words alone");
    assert.deepEqual(await markdown('<div data-doc-component="local/gone"><h3>题目</h3><p>词</p></div>'), ["# 题", "", "前面", "", "题目 · 词", "", "后面"], "no package: its words too");
    const nested = await markdown('<div class="strip" data-doc-component="local/strip"><h3>外</h3><div data-doc-component="local/tally"><h3>里</h3></div></div>');
    assert.deepEqual(nested, ["# 题", "", "前面", "", "外", "", "后面"], "what an instance in it holds is that one's");
    // A slot (a part edited as flow): its blocks, each as anywhere, in the file's order among the parts.
    const brief = '<div class="brief" data-doc-component="local/brief"><h3>要点</h3><div data-doc-slot="body"><ul><li>一项</li><li>二项</li></ul><p>一段 <strong>粗</strong></p><table><tr><th>头</th></tr><tr><td>格</td></tr></table></div></div>';
    assert.deepEqual(await markdown(brief), ["# 题", "", "前面", "", "要点", "", "- 一项", "- 二项", "", "一段 **粗**", "", "| 头 |", "| --- |", "| 格 |", "", "后面"], "parts: its title a paragraph, its slot's blocks as they are written anywhere");
    put("local/brief-words", "component.json", manifest("local/brief-words", { markdown: "text", parts: { title: { at: ":scope > h3", edit: "text" }, body: { edit: "flow" } } }));
    assert.deepEqual((await markdown(brief.replaceAll("local/brief", "local/brief-words"))).slice(4, -2), ["要点 · 一项 · 二项 · 一段 粗 · 头 · 格"], "text: its words alone");
    fs.rmSync(folderOf("local/brief-words"), { recursive: true });
    for (const id of ["local/words", "local/said", "local/text", "local/order"]) fs.rmSync(folderOf(id), { recursive: true });
    forgetCatalog(root);
  }
} finally {
  process.env.GALLERY_DEFAULT_WORKSPACE = workspace;
  forgetCatalog(root);
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
}

console.log("Checked a package's files: only what a document uses, after the kit's tags and with the kit's files it names, nothing for one that does not load; inline in an export whatever their text holds, its pictures as data:, nothing linked, all of it taken out by an import; what only speaks of a package holding none; two packages' scripts apart; one check of a component in the same words for gallery check and both exports, a script read and never run, what an export adds, none of it keeping a page from Markdown; an export as old as the packages it holds; its Markdown as its manifest says, all the words a block shows.");
