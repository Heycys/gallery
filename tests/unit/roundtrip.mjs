import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { createEditService } from "../../src/editor/service.mjs";
import { withNeededKitTags } from "../../src/render/assets.mjs";
import { createReportFromStarter } from "../../src/render/reports.mjs";
import { DOC_SLUG } from "../../src/shared/page-links.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { CARRIED_SOURCE_MOST, beforeBodyEnd, carriedCeiling, carriedElement, carriedOf, offlineMarkdown } from "../../src/transfer/carry.mjs";
import { writeImportedPages } from "../../src/transfer/pages.mjs";
import { createTransferService } from "../../src/transfer/service.mjs";
import { createWorkspaceService } from "../../src/workbench/service.mjs";
import { pngOf, writeRoundTripReport } from "./fixtures/roundtrip.mjs";

// The import's round trip (docs/workbench.md "Import and export"): a report exported as one offline
// file (gallery export) and imported into a new studio, through the transfer service as the
// workbench calls it (POST upload, POST import), four times:
//   as exported, on the computer that exported it: the export carries the document as written
//   (src/transfer/carry.mjs), signed by this computer's export key, and is the file it was made as, so the
//   report is the source as the export read it (the hand-in's: the kit's markup and block ids), byte for
//   byte, its scripts with it, but for its main's data-doc-id (the new report's slug) and a cropped picture's
//   original, which no export holds (its data-original and data-crop go); each file back under its own name
//   with its bytes (an Agent's names too), a data: URL the source wrote kept as it is; its doc.json's title,
//   icon, description and type the source's. Exported again: the first export but for its slug, the crop, the
//   sha256 it says and what it carries (which holds the slug).
//   as exported, on another computer (another export key): the same, but made inert (own-report.mjs
//   inertPage): each script but one of data gone
//   changed after it was exported (a word of it): worked back from the page as before (undoExport), the
//   word with it, its files' names those the export carried (by their bytes), made inert
//   as an export made before exports carried their source (the two lines gone): worked back from the page,
//   a file an Agent named itself under an upload's name (<kind>-<hash>.<extension>; a link that gave no
//   download name now gives the file's), the source's data: URL a file of its own, made inert.
// No kit copy, policy, injected tag, preview address or data: URL the export made is left; the report's
// whole block's style is kept. Each export says the sha256 of the report.html it was made from (a meta of
// its own, which the import takes out). The report is the fixture's (tests/unit/fixtures/roundtrip.mjs)
// with what an import once got wrong around it (`extras`), once with LF line breaks and once with CRLF.
// Then files made to do harm (a review of 2026-11-20): custom blocks carried (none put in), what
// would run in what another's export carries and in an old export's page (taken out), a source that
// inflates past twenty times its file (read as the page, at once), names no file may have (named as uploads),
// and a document that cannot be written whole (nothing left). (The browser scenario importRoundTrip edits
// the fixture's in the preview between the two exports.)

const run = promisify(execFile);
const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-roundtrip-"));
const exportIn = async (studio, slug) => {
  await run(process.execPath, [path.join(projectRoot, "src", "cli", "bin.mjs"), "export", slug], { cwd: projectRoot, env: { ...process.env, GALLERY_WORKSPACE: path.join(studio, "reports") } });
  return fs.readFile(path.join(studio, "reports", "exports", `${slug}.html`), "utf8");
};
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex").slice(0, 12);

// The files the extras add: a bookmark's icon and cover (named as the editor names them), a cropped
// picture and the original it was cropped from (which an export does not carry), and a Sheet tab's
// picture of its own (a data: URL in its style, which an export leaves as it is).
const bookmarkIcon = pngOf(10, 10, 9);
const bookmarkCover = pngOf(20, 10, 10);
const cropped = pngOf(24, 24, 11);
const original = pngOf(48, 48, 12);
const tabPicture = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="#c33"/></svg>');
const EXTRA_FILES = {
  [`bookmark-icon-${hash(bookmarkIcon)}.png`]: bookmarkIcon,
  [`bookmark-cover-${hash(bookmarkCover)}.png`]: bookmarkCover,
  [`image-${hash(cropped)}.png`]: cropped,
  [`image-${hash(original)}.png`]: original,
};
const TAB_URL = `data:image/svg+xml;base64,${tabPicture.toString("base64")}`;

// What an import once got wrong: the page's language, a head of its own (a description, a script
// that runs early), a comment and a kicker above the title, a title with an apostrophe, an entity, a
// non-breaking space and markup; a bookmark's pictures, a cropped picture, a picture that is also a
// link to save it, and a Sheet tab whose picture is its own.
const extras = (text, photo) => text
  .replace('<html lang="zh-CN">', '<html lang="en">')
  .replace("</head>", '  <meta name="description" content="往返的描述">\n  <script>document.documentElement.dataset.early = "1";</script>\n</head>')
  .replace(/(\n[ \t]*)<header class="doc-header">(\n[ \t]*)/, '$1<!-- 页眉 -->$1<header class="doc-header">$2<p class="doc-kicker">第三季度</p>$2')
  .replace('<h1 class="doc-title">往返</h1>', "<h1 class=\"doc-title\">Q3's <em>往返</em> &amp;&nbsp;更多</h1>")
  .replace("<p>数据：", `<figure class="doc-bookmark">
        <a class="doc-bookmark-card" href="https://example.com/handbook" target="_blank" rel="noopener noreferrer"><span class="doc-bookmark-text"><span class="doc-bookmark-title">评测手册</span><span class="doc-bookmark-description">说明。</span><span class="doc-bookmark-url"><img class="doc-bookmark-icon" src="assets/bookmark-icon-${hash(bookmarkIcon)}.png" alt=""><span class="doc-bookmark-href">https://example.com/handbook</span></span></span><span class="doc-bookmark-cover"><img src="assets/bookmark-cover-${hash(bookmarkCover)}.png" alt=""></span></a>
        <figcaption></figcaption>
      </figure>
      <figure class="doc-image"><img src="assets/image-${hash(cropped)}.png" alt="裁过的图" data-original="assets/image-${hash(original)}.png" data-crop="10 10 50 50"><figcaption>裁过的图</figcaption></figure>
      <p>另存 <a href="assets/${photo}" download="照片.png">照片</a>。</p>
      <p>数据：`)
  .replace('data-tab-icon="🚀">乙页</button>', `data-tab-icon="🚀">乙页</button>
          <button class="doc-sheet-tab" type="button" data-sheet-tab="c" data-tab-icon="🎯" style="--doc-tab-icon: url('${TAB_URL}')">丙页</button>`)
  .replace('<div data-doc-sheet="b"><p>第二页的话。</p></div>', '<div data-doc-sheet="b"><p>第二页的话。</p></div>\n        <div data-doc-sheet="c"><p>第三页的话。</p></div>');

// A source written (`crlf`: its line breaks CRLF), exported, imported into a new studio, exported again.
async function roundTrip(name, { crlf }) {
  const first = path.join(root, name, "first");
  await fs.mkdir(path.join(first, "reports"), { recursive: true });
  await createReportFromStarter("source", "往返", "导入闭环的源报告", { directory: path.join(first, "reports") });
  const sourceDirectory = path.join(first, "reports", "source");
  const assets = await writeRoundTripReport(sourceDirectory);
  for (const [file, bytes] of Object.entries(EXTRA_FILES)) await fs.writeFile(path.join(sourceDirectory, "assets", file), bytes);
  const photo = Object.values(assets).find(({ kind }) => kind === "image").kept;
  const written = extras(await fs.readFile(path.join(sourceDirectory, "doc.html"), "utf8"), photo);
  assert.ok(written.includes("doc-kicker") && written.includes("data-original") && written.includes("丙页") && written.includes("另存"), `${name}: the extras were written`);
  await fs.writeFile(path.join(sourceDirectory, "doc.html"), crlf ? written.replace(/\r?\n/g, "\r\n") : written);
  const exported = await exportIn(first, "source");
  const source = await fs.readFile(path.join(sourceDirectory, "doc.html"), "utf8"); // as the export read it: handed in
  assert.ok(/<div class="doc-table-wrap" data-block-id="[a-z0-9]{8}">/.test(source) && /<details class="doc-details"/.test(source), `${name}: the hand-in wrote the natural HTML as the kit's, with block ids`);
  assert.ok(!/["'(]assets\//.test(exported.replace(/data-original="assets\//, "").replace(/^[ \t]*<script type="[^"]*" data-doc-(?:copy|source)(?:="[0-9a-f]*")?>.*$/gm, "")) && exported.includes('data-doc-kit="runtime-inline"') && exported.includes("Content-Security-Policy"), `${name}: the export holds its files (but the original), the kit and its policy`);
  assert.equal(/\r\n/.test(source), crlf, `${name}: the source's line breaks`);
  const sourceSha = (html) => /<meta name="doc-export-source" content="sha256:([0-9a-f]{64})">/.exec(html)?.[1];
  const fullHash = async (file) => createHash("sha256").update(await fs.readFile(file)).digest("hex");
  assert.equal(sourceSha(exported), await fullHash(path.join(sourceDirectory, "doc.html")), `${name}: the export says the sha256 of the report.html it was made from`);

  // Imported into a new studio, as the workbench's 导入 does it: { slug, directory, imported (its doc.html), answer }.
  // `trusted`: whether it keeps its scripts (an export this computer made, as it was made), else it is made inert.
  const importInto = async (studio, text, { trusted = false, check = true, name: upload = "往返.html" } = {}) => {
    const reportsDirectory = path.join(root, name, studio, "reports");
    await fs.mkdir(reportsDirectory, { recursive: true });
    const edits = createEditService({ reportsDirectory, stateDirectory: path.join(reportsDirectory, ".gallery", "state"), finish: withNeededKitTags });
    const create = (slug, title, description) => createReportFromStarter(slug, title, description, { directory: reportsDirectory, blank: true });
    const workspace = createWorkspaceService({ edits, reports: { create }, reportsDirectory });
    const transfer = createTransferService({ edits, workspace, reports: { create }, reportsDirectory, offline: async () => { throw new Error("not exported here"); } });
    const server = http.createServer((request, response) => transfer.handle(request, response, new URL(request.url, "http://localhost").pathname.split("/").pop()));
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const host = `127.0.0.1:${server.address().port}`;
    const post = async (route, body, type = "application/json") => (await fetch(`http://${host}/__gallery/transfer/${route}`, {
      method: "POST", headers: { "Content-Type": type, Origin: `http://${host}`, "X-Gallery-Token": edits.token }, body,
    })).json();
    let answer;
    try {
      const { id } = await post(`upload?name=${encodeURIComponent(upload)}`, text, "application/octet-stream");
      answer = await post("import", JSON.stringify({ uploads: [id], parent: "" }));
    } finally {
      server.close();
    }
    if (!check) return { answer, reportsDirectory };
    assert.deepEqual({ ...answer, reports: answer.reports.length, inert: answer.inert > 0 }, { ok: true, pages: 1, reports: 1, skipped: [], missing: [], inert: !trusted }, `${name} ${studio}: one page, a new report, no picture missing, ${trusted ? "nothing" : "what would run"} taken out`);
    const slug = answer.reports[0];
    assert.match(slug, DOC_SLUG, `${name} ${studio}: its folder is doc- and its page id (what the workbench names a new document)`);
    const directory = path.join(reportsDirectory, slug);
    const imported = await fs.readFile(path.join(directory, "doc.html"), "utf8");
    for (const left of ["data-doc-kit", "data-doc-vendor", "Content-Security-Policy", "generator", "doc-export-source", "data-doc-copy", "data-doc-source", "/__gallery/edit/", "<script src=", 'rel="stylesheet"', "<svg", "rel=\"icon\""]) {
      assert.ok(!imported.includes(left), `${name} ${studio}: nothing an export or the preview adds is left: ${left}`);
    }
    assert.ok(/\.tally \{ display: flex;/.test(imported) && imported.includes('<script type="application/json">[1, 2, 3]</script>'), `${name} ${studio}: its whole block's style and its data`);
    assert.equal(/DocCharts\.define\("dots"/.test(imported), trusted, `${name} ${studio}: its own chart type's script ${trusted ? "kept" : "taken out"}`);
    assert.equal(imported.match(/data-block-id="/g).length, source.match(/data-block-id="/g).length, `${name} ${studio}: every block id kept, the page icon's too`);
    return { slug, directory, imported, reportsDirectory, answer };
  };
  const same = (imported, expected, what) => {
    if (imported === expected) return;
    let at = 0;
    while (imported[at] === expected[at]) at++;
    assert.fail(`${name}: ${what}; from ${at}: ${JSON.stringify(imported.slice(Math.max(0, at - 120), at + 120))} vs ${JSON.stringify(expected.slice(Math.max(0, at - 120), at + 120))}`);
  };
  // Its files: each back with its bytes, under the name it is referenced by; nothing else.
  const filesAre = async ({ directory, imported }, kept, what) => {
    assert.deepEqual((await fs.readdir(path.join(directory, "assets"))).sort(), Object.keys(kept).sort(), `${name} ${what}: each file once`);
    for (const [file, bytes] of Object.entries(kept)) {
      assert.ok((await fs.readFile(path.join(directory, "assets", file))).equals(bytes), `${name} ${what}: ${file}, the same bytes`);
      assert.ok(imported.includes(`assets/${file}`), `${name} ${what}: ${file}, referenced by its name`);
    }
  };
  const own = { ...Object.fromEntries(Object.entries(assets).map(([file, { bytes }]) => [file, bytes])), ...EXTRA_FILES };
  delete own[`image-${hash(original)}.png`];
  const sourceMetadata = JSON.parse(await fs.readFile(path.join(sourceDirectory, "doc.json"), "utf8"));
  const lines = (text) => text.split(/\r?\n/);
  const CARRIED_LINE = /^[ \t]*<script type="[^"]*" data-doc-(?:copy|source)(?:="[0-9a-f]*")?>[^\n]*\r?\n/gm;
  const carriedLines = (text) => lines(text).filter((line) => /^[ \t]*<script type="[^"]*" data-doc-(?:copy|source)(?:="[0-9a-f]*")?>/.test(line));
  assert.equal(carriedLines(exported).length, 2, `${name}: the export carries the copies' words and the document, a line each`);
  assert.match(carriedLines(exported)[1], /data-doc-source="[0-9a-f]{64}">/, `${name}: what it carries signed by this computer's export key`);
  const withoutCarried = (text) => text.replace(CARRIED_LINE, "");
  const uncropped = (text) => text.replace(/ data-original="[^"]*"/, "").replace(/ data-crop="[^"]*"/, "");
  // A page made inert, by the test's own reading: each script but one of data gone with its lines.
  const inert = (text) => text.replace(/^[ \t]*<script(?![^>]*type="application\/json")[^>]*>[\s\S]*?<\/script>[ \t]*\r?\n/gm, "");
  const decoded = carriedOf(exported).carried;
  assert.ok(decoded && !("packages" in decoded) && JSON.stringify(decoded.files).length < 4000, `${name}: it carries no custom block's code`);

  // 1. As exported, on this computer: the source as written, its scripts with it.
  const exact = await importInto("exact", exported, { trusted: true });
  same(exact.imported, uncropped(source.replace('data-doc-id="source"', `data-doc-id="${exact.slug}"`)), "the imported doc.html is the source as written");
  await filesAre(exact, own, "as exported");
  const metadata = JSON.parse(await fs.readFile(path.join(exact.directory, "doc.json"), "utf8"));
  assert.deepEqual([metadata.title, metadata.icon, metadata.description, metadata.type], [sourceMetadata.title, sourceMetadata.icon, sourceMetadata.description, sourceMetadata.type], `${name}: its doc.json's title, icon, description and type`);
  // Exported again (nothing edited): the first export, but for its slug, the crop, the sha256 of the
  // report.html it was made from and what it carries.
  const again = await exportIn(path.join(root, name, "exact"), exact.slug);
  assert.equal(sourceSha(again), await fullHash(path.join(exact.directory, "doc.html")), `${name}: the second export says its own report.html's sha256`);
  same(withoutCarried(again), withoutCarried(uncropped(exported.replace('data-doc-id="source"', `data-doc-id="${exact.slug}"`)).replace(sourceSha(exported), sourceSha(again))), "the second export is the first");
  assert.equal(await fs.readFile(path.join(exact.directory, "doc.html"), "utf8"), exact.imported, `${name}: and its hand-in wrote nothing: the import wrote what an export reads`);

  // 2. The same file on another computer (another export key): the source as written, made inert.
  const elsewhere = await importInto("elsewhere", crafted(exported, () => null, randomBytes(32)));
  same(elsewhere.imported, inert(uncropped(source.replace('data-doc-id="source"', `data-doc-id="${elsewhere.slug}"`))), "another's export: its source, but what would run");
  await filesAre(elsewhere, own, "another's");

  // What the source wrote that a page worked back from cannot tell from what the export made: a data: URL
  // of its own (a file now), a link's bare download (its file's name now), the crop.
  const workedBack = (slug, renamed) => {
    let expected = uncropped(source.replace('data-doc-id="source"', `data-doc-id="${slug}"`))
      .replace('href="assets/data.csv" download>', 'href="assets/data.csv" download="data.csv">')
      .replace(TAB_URL, `assets/image-${hash(tabPicture)}.svg`);
    if (renamed) for (const [file, { kept: upload }] of Object.entries(assets)) if (file !== upload) expected = expected.replaceAll(`assets/${file}`, `assets/${upload}`);
    return inert(expected);
  };

  // 3. Changed after it was exported (here, by its own computer): the page as it is now, made inert, its files
  // under the names the export carried.
  const changed = await importInto("changed", exported.replace("第二页的话。", "第二页改过的话。"));
  same(changed.imported, workedBack(changed.slug, false).replace("第二页的话。", "第二页改过的话。"), "a file changed after it was exported comes in as its page is now");
  await filesAre(changed, { ...own, [`image-${hash(tabPicture)}.svg`]: tabPicture }, "changed");

  // 4. An export made before exports carried their source: worked back from the page, made inert, its files named as uploads.
  const old = await importInto("old", withoutCarried(exported));
  same(old.imported, workedBack(old.slug, true), "an older export comes in as its page is");
  await filesAre(old, Object.fromEntries(Object.entries({ ...Object.fromEntries(Object.values(assets).map(({ bytes, kept: file }) => [file, bytes])), ...EXTRA_FILES, [`image-${hash(tabPicture)}.svg`]: tabPicture }).filter(([file]) => file !== `image-${hash(original)}.png`)), "old");

  // 5. Files of another's, made to do harm (a review of 2026-11-20): each import ends in a whole document or none.
  if (crlf) return;
  await hostile(exported, importInto);
}

// An export with what it carries changed by `change(carried, shown)` (`shown`: the file without that line), its
// sha256 written again, as anyone can, signed by none (as the files a review of 2026-11-20 made were) or by `key`, another
// computer's export key.
function crafted(exported, change, key = null) {
  const { carried } = carriedOf(exported);
  const shown = exported.replace(/^[ \t]*<script type="application\/x-gallery-source"[^\n]*\r?\n/m, "");
  const next = change(structuredClone(carried), shown) ?? carried;
  next.file = createHash("sha256").update(shown).digest("hex");
  return beforeBodyEnd(shown, carriedElement(next, key));
}

async function hostile(exported, importInto) {
  // 1. Custom blocks carried, as an older export of this branch wrote them: none put in anywhere.
  const blocks = crafted(exported, (carried) => {
    const b64 = (text) => Buffer.from(text).toString("base64");
    carried.packages = [{ id: "local/evil", stamp: "x", files: { "component.json": b64(JSON.stringify({ id: "local/evil", apiVersion: 1 })), "kit.js": b64("fetch('/__gallery/workspace/info')") } }];
    return carried;
  });
  const home = process.env.GALLERY_DEFAULT_WORKSPACE ?? root;
  const before = await fs.readdir(path.join(home, "components")).catch(() => []);
  await importInto("blocks", blocks);
  assert.deepEqual(await fs.readdir(path.join(home, "components")).catch(() => []), before, "a custom block an export carries is never put in");

  // 2. What would run, in what an export carries (no signature: another's) and in an old export's page: taken out.
  const harm = (text) => text.replace(/<p\b([^>]*)>第一段/, `<p$1 onclick="steal()" data-keep="1">第一段`).replace("</main>", `  <p><a href=" javascript:steal()">链接</a></p>
      <iframe srcdoc="<script>steal()</script>" sandbox="allow-scripts allow-same-origin"></iframe>
      <iframe src="assets/page.html"></iframe>
      <object data="assets/x.svg"><p>插件</p></object>
      <svg viewBox="0 0 10 10"><script>steal()</script><a xlink:href="javascript:steal()"><animate attributeName="href" to="javascript:steal()"/>点</a></svg>
      <img src="assets/none.png" alt="" onerror="steal()">
      <script type="module">steal()</script>
      <details open ontoggle="0" ontoggle="steal()"><summary>开</summary></details>
      <svg onload="0" onload="steal()" onload="steal()"></svg>
      <iframe src="assets/../../generated/other.html;.pdf"></iframe>
      <iframe sandbox="allow-scripts" sandbox="allow-scripts allow-same-origin" src="/generated/x.html"></iframe>
      <noscript><p title="</noscript><img src=x onerror=steal()>"></p></noscript>
      <script type="application/json" id="doc-edit-map">{"blocks":[]}</script>
      <p data-ge-block="x" data-doc-dev id="ge-appear" data-mine="1">编辑器的标记</p>
    </main>`).replace("</head>", `  <meta http-equiv="refresh" content="0; url=/__gallery/workspace/info">\n  <base href="http://attacker.example/">\n  <link rel="modulepreload" href="http://attacker.example/x.js">\n</head>`);
  const shown = crafted(exported, (carried) => {
    carried.source = harm(carried.source);
    return carried;
  });
  const old = harm(exported.replace(/^[ \t]*<script type="application\/x-gallery-source"[^\n]*\r?\n/m, ""));
  for (const [what, file] of [["another's export", shown], ["an old export", old]]) {
    const { answer, reportsDirectory } = await importInto(`harm-${what.length}`, file, { check: false });
    assert.ok(answer.ok && answer.pages === 1 && answer.inert >= 10, `${what}: imported, ${answer.inert} places taken out`);
    const text = await fs.readFile(path.join(reportsDirectory, answer.reports[0], "doc.html"), "utf8");
    for (const left of ["steal()", "srcdoc", "allow-same-origin", "<object", "http-equiv=\"refresh\"", "javascript:", "onclick", "onerror", "<animate", "<base", "attacker.example", "ontoggle", "onload", "<noscript", "doc-edit-map", "data-ge-", "data-doc-dev", "ge-appear"]) assert.ok(!text.includes(left), `${what}: no ${left} left`);
    assert.ok(text.includes('<script type="application/json">{"blocks":[]}</script>') && text.includes('<p data-mine="1">编辑器的标记</p>'), `${what}: the ids and marks only the server and the editor write taken off, the rest kept`);
    assert.ok(/<iframe src="assets\/\.\.\/\.\.\/generated\/other\.html;\.pdf" sandbox="allow-scripts allow-popups allow-forms allow-modals"><\/iframe>/.test(text) && /<details[^>]* open>/.test(text) && /<svg><\/svg>/.test(text), `${what}: a PDF's name out of the folder sandboxed, an attribute written twice gone with its first`);
    assert.ok(/<p[^>]* data-keep="1">第一段/.test(text) && /<iframe src="assets\/page\.html" sandbox="allow-scripts allow-popups allow-forms allow-modals"><\/iframe>/.test(text) && /<iframe sandbox="allow-scripts"><\/iframe>/.test(text), `${what}: all else as written, a frame sandboxed`);
  }

  // 3. A small file whose source inflates past twenty times the file: read as its page, at once, nothing held.
  const bomb = crafted(exported, (carried) => {
    carried.source = carried.source.replace("第一段", `第一段${"x".repeat(100 * 1024 * 1024)}`);
    return carried;
  });
  const started = Date.now();
  assert.equal(carriedOf(bomb).carried, null, "a source over twenty times the file is none");
  assert.ok(Date.now() - started < 5000, `and it is given up at once (${Date.now() - started} ms)`);
  assert.equal(carriedCeiling(bomb.length), Math.min(bomb.length * 20, 64 * 1024 * 1024));
  // A source past 16 MB, though within twenty times its file (a file padded with what does not inflate): none either.
  const padding = `<!-- ${randomBytes(1024 * 1024).toString("base64")} -->`;
  const padded = (megabytes) => crafted(exported, (carried, shown) => {
    carried.source = carried.source.replace("第一段", `第一段${"x".repeat(megabytes * 1024 * 1024)}`);
    return carried;
  }).replace("</main>", `${padding}</main>`);
  const large = padded(17);
  assert.ok(carriedCeiling(large.length) >= 17 * 1024 * 1024 + 1000, "the source within twenty times the file");
  assert.equal(carriedOf(large).carried, null, "a source past 16 MB is none");
  assert.ok(carriedOf(padded(15)).carried, "one of 15 MB is read");
  assert.equal(CARRIED_SOURCE_MOST, 16 * 1024 * 1024);
  const blown = await importInto("bomb", bomb, { check: false });
  assert.ok(blown.answer.ok && blown.answer.pages === 1, "imported as its page");

  // 3b. A Markdown file's HTML blocks, kept as written: made inert as another's page is, and said.
  const markdown = `# 周报二\n\n正文一段。\n\n<iframe srcdoc="&lt;script&gt;parent.steal()&lt;/script&gt;"></iframe>\n\n<iframe src="javascript:parent.steal()"></iframe>\n\n<details><summary>x</summary><p onclick="steal()">y</p></details>\n\n<svg><a href="javascript:steal()"><text>z</text></a></svg>\n\n<div ontoggle="0" ontoggle="steal()">块</div>\n`;
  const md = await importInto("markdown", markdown, { check: false, name: "周报.md" });
  assert.ok(md.answer.ok && md.answer.pages === 1 && md.answer.inert >= 5, `a Markdown file: imported, ${md.answer.inert} places taken out`);
  const mdText = await fs.readFile(path.join(md.reportsDirectory, md.answer.reports[0], "doc.html"), "utf8");
  for (const left of ["steal()", "srcdoc", "javascript:", "onclick", "ontoggle"]) assert.ok(!mdText.includes(left), `a Markdown file: no ${left} left`);
  assert.ok(mdText.includes("<p>y</p>") && mdText.includes("块") && /<iframe sandbox="allow-scripts allow-popups allow-forms allow-modals"><\/iframe>/.test(mdText), "a Markdown file: its blocks as written but what would run");

  // 4. Names no file of a document may have: named as uploads are, the document whole.
  const png = pngOf(3, 3, 7);
  const sha = createHash("sha256").update(png).digest("hex");
  const names = ["sub/x.png", "CON.png", "x.png.", "../up.png", ".hidden.png"];
  const strange = crafted(exported, (carried) => {
    carried.files = names.map((file) => ({ name: file, sha256: sha, data: png.toString("base64") }));
    carried.source = carried.source.replace(/<p\b[^>]*>第一段/, (paragraph) => `${names.map((file) => `<figure class="doc-image"><img src="assets/${file}" alt=""></figure>`).join(" ")} ${paragraph}`);
    return carried;
  });
  const { answer, reportsDirectory } = await importInto("names", strange, { check: false });
  assert.ok(answer.ok && answer.pages === 1, `names: imported whole: ${JSON.stringify(answer)}`);
  const folder = path.join(reportsDirectory, answer.reports[0]);
  const files = await fs.readdir(path.join(folder, "assets"));
  assert.ok(files.length > 0 && files.every((file) => /^image-[0-9a-f]{12}\.png$/.test(file)), `names: each named as an upload is: ${files.join(", ")}`);
  const text = await fs.readFile(path.join(folder, "doc.html"), "utf8");
  for (const file of names.filter((each) => !each.startsWith(".."))) assert.ok(!text.includes(`assets/${file}"`), `names: ${file} not written`);
  // An address out of the folder names no file of it: it stays as written, and nothing is written there.
  for (const out of [path.join(folder, "up.png"), path.join(reportsDirectory, "up.png")]) await assert.rejects(fs.access(out), `names: nothing written at ${out}`);

  // 5. A document that cannot be written whole (a file gone before it is copied) leaves nothing.
  const studio = path.join(root, "rollback");
  await fs.mkdir(studio, { recursive: true });
  await assert.rejects(writeImportedPages([{ title: "半成品", icon: null, nodes: [], own: null, raws: [], lang: null, files: [{ name: "gone.png", from: path.join(studio, "no-such-file") }], from: "x.html", children: [] }], {
    create: (slug, title, description) => createReportFromStarter(slug, title, description, { directory: studio, blank: true }),
    slugOf: () => "half",
    folderOf: (slug) => path.join(studio, slug),
    fill: async ({ source }) => source,
    place: async () => assert.fail("a document not written whole is never placed"),
  }), /ENOENT/);
  await assert.rejects(fs.access(path.join(studio, "half")), "nothing of it left");
  await assert.rejects(writeImportedPages([{ title: "x", nodes: [], files: [{ name: "a/b.png", from: path.join(studio, "x") }], children: [] }], { create: () => assert.fail("never made"), slugOf: () => "y", folderOf: () => "", fill: async () => "", place: async () => {} }), /no file of a document/);
}

try {
  await roundTrip("lf", { crlf: false });
  await roundTrip("crlf", { crlf: true });
  // An offline file's 复制为 Markdown: a picture or a file of the document's folder by its words alone, links elsewhere kept.
  assert.equal(offlineMarkdown("图：\n\n![甲 [x]](assets/ref-a.png){width=50%}\n\n看 [外链](https://example.com/a) 和 [数据表](assets/ref-data.csv)，![](./assets/b.png)。"), "图：\n\n甲 [x]\n\n看 [外链](https://example.com/a) 和 数据表，。");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
console.log("roundtrip: ok");
