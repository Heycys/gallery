import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { offlineReports, withExportPolicy } from "../../src/render/pipeline.mjs";
import { embedsAsLinks } from "../../src/render/embeds.mjs";
import { componentFailures } from "../../src/render/component-checks.mjs";
import { parseReport } from "../../src/render/report-tree.mjs";
import { EXPORT_CSP, IMAGE_SOURCES_MAX, exportPolicy, exportSourceOf, imageSources } from "../../src/shared/export-wrap.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { findBrowser, startBrowser, sandboxArguments } from "../../src/transfer/browser.mjs";
import { exportPage, exportSite, titleReader } from "../../src/transfer/export.mjs";
import { createTransferService } from "../../src/transfer/service.mjs";
import { USAGE } from "../../src/cli/usage.mjs";

// An export for another platform (feedback of 2026-11-17): gallery export
// --allow-images <https sources>, which lets the file's pictures load from those sources as well (for a
// program that puts them on the platform and writes their web addresses in the file), and
// --embeds-as-links, each embed block a link to the page it shows (for a platform that strips frames).
//   imageSources / exportPolicy   what the option takes, strictly: https: or an https origin ("*." first at
//       most, a port, no path), everything else refused, so that nothing given adds a directive or a kind
//       of source; the policy otherwise the offline file's, directive by directive
//   embedsAsLinks   a web page's card (its title or host and its address), a file's (its name, linking
//       nowhere), the figure's classes, id and caption kept, an empty block as it is
//   offlineReports   the file made with them; never by the workbench's 导出 route, whatever its options say
//   gallery export   the options on the command line: their names in exports/, the deliverable's label, the
//       network line, the offline file left as it was, every mistake refused with 2 and nothing written; a
//       document the checks fail (or a page under it, with --subpages) refused as the offline file's export refuses
//       it (1, no file, --allow-failures exit 0 and no file either), while the 导出 dialog's writes it; nothing said
//       written that was not; with --subpages, <slug>-web.zip beside <slug>.zip
//   a browser   the file opened from disk: a picture from an allowed source loads, from any other the
//       policy blocks it (a securitypolicyviolation, img-src), and without the option it is blocked
// (where Chrome or Edge is installed; said and skipped where not).

const run = promisify(execFile);
const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-export-platform-"));
// The policy as directive -> its sources.
const directives = (policy) => new Map(policy.split(";").map((part) => part.trim().split(/\s+/)).map(([name, ...sources]) => [name, sources.join(" ")]));
const policyOfFile = (html) => /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/.exec(html)?.[1];

// ---------- what --allow-images takes ----------
{
  assert.deepEqual(imageSources([]), []);
  assert.deepEqual(imageSources(["https:"]), ["https:"]);
  assert.deepEqual(imageSources(["HTTPS://CDN.NLARK.COM/"]), ["https://cdn.nlark.com"], "lowercase, its trailing slash dropped");
  assert.deepEqual(imageSources(["https://*.nlark.com,https://cdn.example.com:8443", "https://cdn.nlark.com", "https://*.nlark.com"]), ["https://*.nlark.com", "https://cdn.example.com:8443", "https://cdn.nlark.com"], "commas and the option again, each once");
  assert.deepEqual(imageSources(["https://127.0.0.1:4801", "https://xn--fsqu00a.xn--0zwm56d"]), ["https://127.0.0.1:4801", "https://xn--fsqu00a.xn--0zwm56d"]);
  assert.equal(imageSources(Array.from({ length: IMAGE_SOURCES_MAX }, (_, at) => `https://a${at}.example.com`)).length, IMAGE_SOURCES_MAX);
  assert.throws(() => imageSources(Array.from({ length: IMAGE_SOURCES_MAX + 1 }, (_, at) => `https://a${at}.example.com`)), /21 sources: 20 at most/);
  // Each refused, with why: nothing given there reaches the policy as anything but an https source.
  const refused = {
    "": /an empty source/,
    "https://a.com,": /an empty source/,
    "https://a.com https://b.com": /holds a space or a line break/,
    "https://a.com\nimg-src *": /holds a space or a line break/,
    "https://a.com\tb": /holds a space or a line break/,
    "https://a.com;script-src": /holds ; or a quote/,
    "https://a.com;": /holds ; or a quote/,
    "'unsafe-inline'": /holds ; or a quote/,
    "'self'": /holds ; or a quote/,
    "'unsafe-eval'": /holds ; or a quote/,
    "\"https://a.com\"": /holds ; or a quote/,
    "https://a.com'": /holds ; or a quote/,
    "https://例子.com": /outside ASCII: write the host's xn-- form/,
    "https://ａ.com": /outside ASCII/,
    "https://a.com ": /space or a line break|outside ASCII/,
    "data:": /data: and blob: pictures already/,
    "blob:": /data: and blob: pictures already/,
    "http:": /only https sources/,
    "http://a.com": /only https sources/,
    "wss://a.com": /only https sources/,
    "javascript:alert(1)": /only https sources/,
    "*": /is any address of any kind/,
    "https://*": /is any address of any kind/,
    "https://a.com/x.png": /has a path/,
    "https://a.com?x=1": /has a path/,
    "https://user@a.com": /is no https source/,
    "https://*.*.com": /is no https source/,
    "https://a.*.com": /is no https source/,
    "https://a.com:*": /is no https source/,
    "https://a.com:0": /is no https source/,
    "https://a.com:65536": /is no https source/,
    "https://a_b.com": /is no https source/,
    "https://-a.com": /is no https source/,
    "a.com": /is no https source/,
    "nonce-abc": /is no https source/,
    "https://[::1]": /is no https source/,
  };
  for (const [value, why] of Object.entries(refused)) {
    assert.throws(() => imageSources([value]), why, JSON.stringify(value));
    assert.throws(() => exportPolicy({ images: [value] }), why, `the policy itself refuses ${JSON.stringify(value)}`);
    assert.throws(() => imageSources(["https:", value]), why, `${JSON.stringify(value)} after a good one`);
  }
  assert.throws(() => imageSources([42]), /an empty source/);
}

// ---------- the policy ----------
{
  assert.equal(exportPolicy(), EXPORT_CSP, "with no sources, the offline file's");
  assert.equal(exportPolicy({ images: [] }), EXPORT_CSP);
  const plain = directives(EXPORT_CSP);
  assert.equal(plain.get("img-src"), "data: blob:");
  assert.equal(plain.get("connect-src"), "'none'");
  const widened = directives(exportPolicy({ images: ["https://cdn.nlark.com", "https://*.example.com:8443"] }));
  assert.equal(widened.get("img-src"), "data: blob: https://cdn.nlark.com https://*.example.com:8443", "its pictures may load from the sources given, and from nowhere else");
  assert.deepEqual([...widened.keys()], [...plain.keys()], "the same directives, in the same order: none added");
  for (const [name, sources] of plain) if (name !== "img-src") assert.equal(widened.get(name), sources, `${name} as the offline file's`);
  assert.equal(directives(exportPolicy({ images: ["https:"] })).get("img-src"), "data: blob: https:");
  // In the file: right after its <head>, read back as the export's own metas are (its source's sha256).
  const hash = "a".repeat(64);
  const page = "<!doctype html><html><head><title>T</title></head><body><main class=\"doc-page\" data-doc-id=\"t\"></main></body></html>";
  const widenedPage = withExportPolicy("t", page, hash, [], exportPolicy({ images: ["https://cdn.nlark.com"] }));
  assert.equal(policyOfFile(widenedPage), exportPolicy({ images: ["https://cdn.nlark.com"] }));
  assert.equal(exportSourceOf(widenedPage), hash, "gallery qa and an import read its source as any export's");
  assert.equal(policyOfFile(withExportPolicy("t", page, hash)), EXPORT_CSP, "the offline file's by default");
}

// ---------- embeds written as links ----------
const pageOf = (body, lang = "zh-CN") => `<!doctype html>
<html lang="${lang}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>嵌入</title></head>
<body>
  <main class="doc-page" data-doc-id="embeds">
    <header class="doc-header"><h1 class="doc-title">嵌入</h1></header>
    <section class="doc-section"><h2>看这些</h2>
${body}
    </section>
  </main>
</body>
</html>
`;
const WEB = `<figure class="doc-embed doc-highlight-blue" style="--doc-embed-height: 400px" data-block-id="web12345">
<iframe class="doc-embed-frame" src="https://www.example.com/board?a=1&amp;b=2" sandbox="allow-scripts allow-popups" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe>
<figcaption>团队看板</figcaption>
</figure>`;
const TITLED = `<figure class="doc-embed" data-block-id="tit12345">
<iframe class="doc-embed-frame" src="https://maps.example.com/x" title="路线 <A&B>" sandbox="allow-scripts" loading="lazy"></iframe>
<figcaption></figcaption>
</figure>`;
const FILE = `<figure class='doc-embed doc-embed--file' data-block-id="fil12345">
<iframe class="doc-embed-frame" src="assets/plan.pdf" loading="lazy"></iframe>
<figcaption>计划书</figcaption>
</figure>`;
const EMPTY = '<figure class="doc-embed" data-block-id="emp12345"></figure>';
{
  const shown = embedsAsLinks(pageOf([WEB, TITLED, FILE, EMPTY].join("\n")));
  assert.ok(!/<iframe/.test(shown), "no frame is left");
  assert.ok(shown.includes(`<figure class="doc-bookmark doc-highlight-blue" style="--doc-embed-height: 400px" data-block-id="web12345">
<a class="doc-bookmark-card" href="https://www.example.com/board?a=1&amp;b=2" target="_blank" rel="noopener noreferrer"><span class="doc-bookmark-text"><span class="doc-bookmark-title">www.example.com</span><span class="doc-bookmark-url"><span class="doc-bookmark-href">https://www.example.com/board?a=1&amp;b=2</span></span></span></a>
<figcaption>团队看板</figcaption>`), "a web page's card: its host and its address, the block's color, id and caption kept");
  assert.ok(shown.includes('<span class="doc-bookmark-title">路线 &lt;A&amp;B&gt;</span>'), "the frame's title when it has one, escaped");
  assert.ok(shown.includes(`<figure class="doc-bookmark" data-block-id="fil12345">
<a class="doc-bookmark-card"><span class="doc-bookmark-text"><span class="doc-bookmark-title">plan.pdf</span><span class="doc-bookmark-description">嵌入的文件，没有随导出带出</span></span></a>
<figcaption>计划书</figcaption>`), "a file's card: its name and why, linking nowhere");
  assert.ok(embedsAsLinks(pageOf(FILE, "en")).includes("An embedded file, not carried in this export"), "in the page's language");
  assert.ok(shown.includes(EMPTY), "a block left empty stays as it is");
  // The web page's card is a bookmark as the kit's check reads one.
  const webOnly = embedsAsLinks(pageOf(WEB));
  assert.deepEqual(componentFailures(webOnly, parseReport(webOnly)), []);
  const plain = pageOf("<p>没有嵌入。</p>");
  assert.equal(embedsAsLinks(plain), plain, "a page with none as it is");
}

// ---------- the file made ----------
// A document of a picture, two embeds (a web page, a PDF of its folder) in a workspace of its own.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const PDF = Buffer.from("%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n");
const BODY = `<figure class="doc-image"><img src="assets/dot.png" alt="点"><figcaption></figcaption></figure>
<p id="remote">远处的图会写在这里。</p>
${WEB}
${FILE}`;
const direct = path.join(root, "direct");
await fs.mkdir(path.join(direct, "embeds", "assets"), { recursive: true });
await fs.writeFile(path.join(direct, "embeds", "doc.html"), pageOf(BODY));
await fs.writeFile(path.join(direct, "embeds", "doc.json"), JSON.stringify({ title: "嵌入" }));
await fs.writeFile(path.join(direct, "embeds", "assets", "dot.png"), PNG);
await fs.writeFile(path.join(direct, "embeds", "assets", "plan.pdf"), PDF);
{
  const offline = await (await offlineReports({ directory: direct }))("embeds");
  assert.equal(policyOfFile(offline), EXPORT_CSP, "the offline file as always");
  assert.match(offline, /<iframe class="doc-embed-frame" src="https:\/\/www\.example\.com/);
  assert.match(offline, /src="data:application\/pdf;base64,/, "its PDF inside it");
  const web = await (await offlineReports({ directory: direct, images: ["https://cdn.example.com"], embedsAsLinks: true }))("embeds");
  assert.equal(policyOfFile(web), exportPolicy({ images: ["https://cdn.example.com"] }));
  assert.ok(!/<iframe\b/.test(web), "no frame");
  assert.ok(!web.includes("data:application/pdf"), "nor the file a frame showed: the export carries none it does not show");
  assert.match(web, /<a class="doc-bookmark-card" href="https:\/\/www\.example\.com\/board\?a=1&amp;b=2"/);
  assert.match(web, /<img src="data:image\/png;base64,/, "its own pictures inside it, as always");
  await assert.rejects(offlineReports({ directory: direct, images: ["https://a.com;script-src *"] }), /holds a space/, "nothing unread reaches the policy");
  // The workbench's 导出 route never widens it, whatever options it is sent: its offline() gives neither.
  const edits = { check: async () => ({ body: { slug: "embeds", options: { format: "html", images: ["https:"], embedsAsLinks: true, allowImages: ["https:"] } } }), handIn: async () => ({ ok: true, repeated: [] }) };
  const answer = { headers: {}, setHeader(name, value) { this.headers[name] = value; }, writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers); }, end(body) { this.body = body; } };
  const service = createTransferService({ edits, workspace: { outline: async () => ({ children: {} }) }, reports: {}, reportsDirectory: direct, offline: () => offlineReports({ directory: direct }) });
  await service.handle({}, answer, "export");
  assert.equal(answer.statusCode, 200, String(answer.body).slice(0, 300));
  const routed = answer.body.toString("utf8");
  assert.equal(policyOfFile(routed), EXPORT_CSP, "the route's file has the offline file's policy");
  assert.match(routed, /<iframe class="doc-embed-frame" src="https:/, "and its embeds");
  // exportPage reads no such option either: the site's offline file decides.
  const site = exportSite({ reportsDirectory: direct, titleOf: titleReader(direct), outline: async () => ({ children: {} }), render: await offlineReports({ directory: direct }), format: "html" });
  assert.equal(policyOfFile((await exportPage("embeds", { format: "html", images: ["https:"], embedsAsLinks: true }, site)).data.toString("utf8")), EXPORT_CSP);
}

// ---------- gallery export ----------
const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
const workspace = path.join(root, "ws");
const data = path.join(root, "data");
const gallery = async (args) => {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, "--workspace", workspace, ...args], {
      cwd: root,
      timeout: 120000,
      env: { ...process.env, GALLERY_DEFAULT_WORKSPACE: workspace, GALLERY_DATA_DIR: data, GALLERY_NO_PREVIEW: "1", GALLERY_NO_BROWSER: "1", GALLERY_NO_AUTOSTART: "1", GALLERY_NO_UPDATE_CHECK: "1", GALLERY_NO_DEFAULT_TREE: "1", GALLERY_NO_PACKS: "1", GALLERY_NO_DEFAULT_HOME: "1" },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
const linesOf = (text) => text.trimEnd().split(/\r?\n/);
const exports = path.join(workspace, "exports");
const exists = (file) => fs.access(file).then(() => true, () => false);
let browserFile = null; // the file the browser opens, below
{
  assert.equal((await gallery(["init", workspace])).code, 0);
  assert.equal((await gallery(["new", "embeds", "嵌入"])).code, 0);
  await fs.mkdir(path.join(workspace, "embeds", "assets"), { recursive: true });
  await fs.writeFile(path.join(workspace, "embeds", "doc.html"), pageOf(BODY));
  await fs.writeFile(path.join(workspace, "embeds", "assets", "dot.png"), PNG);
  await fs.writeFile(path.join(workspace, "embeds", "assets", "plan.pdf"), PDF);
  const offline = await gallery(["export", "embeds"]);
  assert.equal(offline.code, 0, offline.stdout + offline.stderr);
  const offlinePath = path.join(exports, "embeds.html");
  const offlineBytes = await fs.readFile(offlinePath);
  assert.equal(policyOfFile(offlineBytes.toString("utf8")), EXPORT_CSP);
  assert.ok(!/network:/.test(offline.stdout), "the offline file says nothing of the network");

  // --allow-images: exports/<slug>-web.html, said, its policy widened by the sources alone.
  const images = await gallery(["export", "embeds", "--allow-images", "https://cdn.example.com,https://*.nlark.com", "--allow-images", "HTTPS://CDN.EXAMPLE.COM/"]);
  assert.equal(images.code, 0, images.stdout + images.stderr);
  const webPath = path.join(exports, "embeds-web.html");
  assert.ok(linesOf(images.stdout).includes(`交给用户（离线文件，可显示网络图片）：${webPath}`), images.stdout);
  const exportedAt = linesOf(images.stdout).findIndex((line) => line.startsWith(`Exported ${webPath} (`));
  assert.ok(exportedAt >= 0, images.stdout);
  assert.equal(linesOf(images.stdout)[exportedAt + 1], "  network: its pictures may load from https://cdn.example.com https://*.nlark.com (its policy's img-src); nothing else in it reaches the network but an embed's page, as in any export");
  assert.equal(policyOfFile(await fs.readFile(webPath, "utf8")), exportPolicy({ images: ["https://cdn.example.com", "https://*.nlark.com"] }));
  assert.deepEqual(await fs.readFile(offlinePath), offlineBytes, "exports/<slug>.html is the offline file as it was");
  // --embeds-as-links alone: no network said, the frames cards.
  const links = await gallery(["export", "embeds", "--embeds-as-links"]);
  assert.equal(links.code, 0, links.stdout + links.stderr);
  assert.ok(linesOf(links.stdout).includes(`交给用户（离线文件，嵌入块换成链接）：${webPath}`), links.stdout);
  assert.ok(!/network:/.test(links.stdout));
  const linked = await fs.readFile(webPath, "utf8");
  assert.equal(policyOfFile(linked), EXPORT_CSP);
  assert.ok(!/<iframe\b/.test(linked) && linked.includes("doc-bookmark-card"), "its embeds are cards");
  // Both, with --no-files, and with --out, where the file is <slug>.html.
  const both = await gallery(["export", "embeds", "--allow-images", "https:", "--embeds-as-links", "--no-files"]);
  assert.equal(both.code, 0, both.stdout + both.stderr);
  assert.ok(linesOf(both.stdout).includes(`交给用户（离线文件，不含文件和图片，可显示网络图片，嵌入块换成链接）：${path.join(exports, "embeds-no-files-web.html")}`), both.stdout);
  const out = path.join(root, "for-yuque");
  const placed = await gallery(["export", "embeds", "--allow-images", "https://cdn.nlark.com", "--embeds-as-links", "--out", out]);
  assert.equal(placed.code, 0, placed.stdout + placed.stderr);
  browserFile = path.join(out, "embeds.html");
  assert.ok(linesOf(placed.stdout).includes(`交给用户（离线文件，可显示网络图片，嵌入块换成链接）：${browserFile}`), placed.stdout);
  assert.match(placed.stdout, /network: its pictures may load from https:\/\/cdn\.nlark\.com /);
  assert.deepEqual(await fs.readFile(offlinePath), offlineBytes);
  // Mistakes (2), nothing written: another format, a source that is none.
  const before = (await fs.readdir(exports)).sort();
  const mistakes = [
    [["--format", "pdf", "--allow-images", "https:"], /--allow-images is for the offline HTML file \(--format html\), not --format pdf\./],
    [["--format", "markdown", "--embeds-as-links"], /--embeds-as-links is for the offline HTML file \(--format html\), not --format markdown\./],
    [["--format", "markdown", "--allow-images", "https:", "--embeds-as-links"], /--allow-images and --embeds-as-links are for the offline HTML file/],
    [["--allow-images"], /--allow-images takes a value/],
    [["--allow-images="], /--allow-images takes a value/],
    [["--allow-images", "https://a.com; script-src *"], /--allow-images: "https:\/\/a\.com; script-src \*" holds a space or a line break/],
    [["--allow-images", "https://a.com;script-src"], /--allow-images: .* holds ; or a quote/],
    [["--allow-images", "'unsafe-inline'"], /holds ; or a quote/],
    [["--allow-images", "data:"], /data: and blob: pictures already/],
    [["--allow-images", "http://cdn.example.com"], /only https sources/],
    [["--allow-images", "https://cdn.example.com/a.png"], /has a path/],
    [["--allow-images", "https://例子.com"], /outside ASCII/],
    [["--allow-images", "https://a.com,,https://b.com"], /an empty source/],
    [["--allow-images", "*"], /any address of any kind/],
  ];
  for (const [args, why] of mistakes) {
    const refused = await gallery(["export", "embeds", ...args]);
    assert.equal(refused.code, 2, `${args.join(" ")}: ${refused.stdout}${refused.stderr}`);
    assert.match(refused.stderr, why, args.join(" "));
  }
  assert.deepEqual((await fs.readdir(exports)).sort(), before, "a refused command writes nothing");
  for (const said of ["--allow-images <sources>", "--embeds-as-links", "<slug>-web.html", "network: its pictures may load from"]) assert.ok(USAGE.export.includes(said), `gallery export's usage says ${said}`);
}

// ---------- a file for another platform keeps the checks; what is said of a file not written; a zip's name ----------
{
  // A document the checks fail (its starter text still there): the offline file's export refuses it (1, no file);
  // so does a file for another platform, which a program publishes unread, whatever else is given; --allow-failures
  // exits 0, and writes none either. The 导出 dialog's export (--no-files alone) writes it, its failure a 问题： line.
  assert.equal((await gallery(["new", "starter", "起始"])).code, 0);
  const plain = await gallery(["export", "starter"]);
  assert.equal(plain.code, 1, plain.stdout + plain.stderr);
  for (const args of [["--allow-images", "https://cdn.nlark.com"], ["--embeds-as-links"], ["--allow-images", "https:", "--no-files"], ["--format", "html", "--embeds-as-links", "--out", path.join(root, "for-yuque")]]) {
    const refused = await gallery(["export", "starter", ...args]);
    assert.equal(refused.code, 1, `${args.join(" ")}: ${refused.stdout}${refused.stderr}`);
    assert.match(refused.stderr, /FAIL starter: 1 problem\n {2}- starter placeholder content/, args.join(" "));
    assert.ok(!refused.stdout.includes("问题：") && !refused.stdout.includes("交给用户"), args.join(" "));
  }
  const allowed = await gallery(["export", "starter", "--allow-images", "https:", "--allow-failures"]);
  assert.equal(allowed.code, 0, allowed.stdout + allowed.stderr);
  assert.match(allowed.stderr, /FAIL starter/);
  for (const name of ["starter-web.html", "starter-no-files-web.html"]) assert.ok(!(await exists(path.join(exports, name))), `no ${name}`);
  assert.ok(!(await exists(path.join(root, "for-yuque", "starter.html"))));
  const dialog = await gallery(["export", "starter", "--no-files"]);
  assert.equal(dialog.code, 0, dialog.stdout + dialog.stderr);
  assert.ok(linesOf(dialog.stdout).some((line) => line.startsWith("问题：starter 没通过检查（1 处），文件照写了，和界面的「导出」一样")), dialog.stdout);
  assert.ok(await exists(path.join(exports, "starter-no-files.html")));

  // The dialog's export of a document whose export cannot be made (an embed's address holding a quote, which any
  // export refuses): exit 1, no file, and nothing says it was written.
  assert.equal((await gallery(["new", "quoted", "引号"])).code, 0);
  await fs.writeFile(path.join(workspace, "quoted", "doc.html"), pageOf(WEB.replace("b=2", "b=&quot;2&quot;")).replace('data-doc-id="embeds"', 'data-doc-id="quoted"'));
  const quoted = await gallery(["export", "quoted", "--no-files"]);
  assert.equal(quoted.code, 1, quoted.stdout + quoted.stderr);
  assert.match(quoted.stderr, /FAIL quoted/);
  assert.ok(!quoted.stdout.includes("文件照写了") && !quoted.stdout.includes("交给用户"), quoted.stdout);
  assert.ok(!(await exists(path.join(exports, "quoted-no-files.html"))));

  // With --subpages: a page under it that fails the checks fails the file for another platform too (its own FAIL,
  // and the page's saying why); mended, the zip is <slug>-web.zip, its label saying what it is, and the zip whose
  // pages reach nothing, <slug>.zip, stays as it was.
  assert.equal((await gallery(["new", "child", "子页", "--under", "embeds"])).code, 0);
  const failing = await gallery(["export", "embeds", "--subpages", "--allow-images", "https:"]);
  assert.equal(failing.code, 1, failing.stdout + failing.stderr);
  assert.match(failing.stderr, /FAIL child: 1 problem[\s\S]*FAIL embeds: 1 problem\n {2}- its subpage child failed the checks \(above\)/);
  assert.ok(!(await exists(path.join(exports, "embeds-web.zip"))));
  await fs.writeFile(path.join(workspace, "child", "doc.html"), pageOf("<p>子页的正文。</p>").replace('data-doc-id="embeds"', 'data-doc-id="child"'));
  const zipped = await gallery(["export", "embeds", "--subpages"]);
  assert.equal(zipped.code, 0, zipped.stdout + zipped.stderr);
  const zipPath = path.join(exports, "embeds.zip");
  assert.ok(linesOf(zipped.stdout).includes(`交给用户（离线文件 压缩包）：${zipPath}`), zipped.stdout);
  const zipBytes = await fs.readFile(zipPath);
  const web = await gallery(["export", "embeds", "--subpages", "--allow-images", "https:"]);
  assert.equal(web.code, 0, web.stdout + web.stderr);
  assert.ok(linesOf(web.stdout).includes(`交给用户（离线文件 压缩包，可显示网络图片）：${path.join(exports, "embeds-web.zip")}`), web.stdout);
  assert.deepEqual(await fs.readFile(zipPath), zipBytes, "exports/<slug>.zip as it was");
}

// ---------- in a browser: a picture from the network, allowed and not ----------
// The file opened from disk as a reader opens it; a picture put in its text as the platform's program
// puts one (an <img> whose address is the platform's), its response given by the test (request
// interception: a request the policy blocks is never made, so one that is made was allowed). Read: whether
// the picture loaded (its naturalWidth) and the policy's violations (securitypolicyviolation events).
const executablePath = findBrowser();
if (!executablePath) console.log("No Chrome or Edge here: the exported files were not opened in a browser.");
else {
  const running = await startBrowser({ executablePath, args: ["--no-first-run", "--no-default-browser-check", "--disable-extensions", ...sandboxArguments()] });
  try {
    const look = async (file, sources) => {
      const text = await fs.readFile(file, "utf8");
      const html = text.replace(/(<p id="remote"[^>]*>)远处的图会写在这里。<\/p>/, (_, open) => `${open}${sources.map((src, at) => `<img id="r${at}" src="${src}" alt="">`).join("")}</p>`);
      assert.notEqual(html, text, "the picture put in its text");
      const opened = path.join(path.dirname(file), `opened-${path.basename(file)}`);
      await fs.writeFile(opened, html);
      const page = await running.browser.newPage();
      try {
        await page.evaluateOnNewDocument(() => {
          window.__violations = [];
          document.addEventListener("securitypolicyviolation", (event) => window.__violations.push(`${event.effectiveDirective} ${event.blockedURI}`));
        });
        await page.setRequestInterception(true);
        const asked = [];
        page.on("request", (request) => {
          if (!/^https:/.test(request.url())) return request.continue();
          if (request.resourceType() !== "image") return request.abort(); // an embed's page: not the test's, never fetched
          asked.push(request.url());
          return request.respond({ status: 200, contentType: "image/png", body: PNG });
        });
        await page.goto(pathToFileURL(opened).href, { waitUntil: "load" });
        await page.waitForFunction((count) => [...document.querySelectorAll("#remote img")].every((img) => img.complete) && document.querySelectorAll("#remote img").length === count, { timeout: 15000 }, sources.length);
        await new Promise((resolve) => setTimeout(resolve, 300)); // the violation events come after the load
        const loaded = await page.evaluate(() => [...document.querySelectorAll("#remote img")].map((img) => img.naturalWidth > 0));
        return { loaded, asked, violations: await page.evaluate(() => window.__violations) };
      } finally {
        await page.close().catch(() => {});
      }
    };
    const allowed = await look(browserFile, ["https://cdn.nlark.com/yuque/0/dot.png", "https://other.example.com/dot.png"]);
    assert.deepEqual(allowed.loaded, [true, false], `with --allow-images https://cdn.nlark.com: the platform's picture loads, another site's does not (${JSON.stringify(allowed)})`);
    assert.deepEqual(allowed.asked, ["https://cdn.nlark.com/yuque/0/dot.png"], "only the allowed one was asked for");
    assert.deepEqual(allowed.violations, ["img-src https://other.example.com/dot.png"]);
    const blocked = await look(path.join(exports, "embeds.html"), ["https://cdn.nlark.com/yuque/0/dot.png"]);
    assert.deepEqual([blocked.loaded, blocked.asked, blocked.violations], [[false], [], ["img-src https://cdn.nlark.com/yuque/0/dot.png"]], "the offline file blocks it, as before");
    // Its embeds: cards, the web page's a link to it.
    const page = await running.browser.newPage();
    try {
      await page.goto(pathToFileURL(browserFile).href, { waitUntil: "load" });
      const cards = await page.evaluate(() => [...document.querySelectorAll("figure.doc-bookmark")].map((figure) => ({ href: figure.querySelector("a.doc-bookmark-card")?.getAttribute("href") ?? null, title: figure.querySelector(".doc-bookmark-title")?.textContent, height: Math.round(figure.querySelector(".doc-bookmark-card").getBoundingClientRect().height), frames: document.querySelectorAll("iframe").length })));
      assert.deepEqual(cards.map(({ href, title, frames }) => ({ href, title, frames })), [{ href: "https://www.example.com/board?a=1&b=2", title: "www.example.com", frames: 0 }, { href: null, title: "plan.pdf", frames: 0 }]);
      assert.ok(cards.every(({ height }) => height > 40 && height < 140), `cards as tall as a bookmark's: ${JSON.stringify(cards)}`);
    } finally {
      await page.close().catch(() => {});
    }
    console.log("Opened the exports in a browser: an allowed source's picture loads, any other is blocked; the embeds are cards.");
  } finally {
    await running.close();
  }
}
await fs.rm(root, { recursive: true, force: true });
console.log("Checked gallery export --allow-images and --embeds-as-links: what they take, the policy, the cards, the command and a browser.");
