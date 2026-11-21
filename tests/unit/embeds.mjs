import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createMediaStore } from "../../src/editor/media-store.mjs";
import { frameAddress } from "../../src/editor/components/embed/index.mjs";
import { applyEdits, findBlocks, findUnits } from "../../src/editor/source.mjs";
import { componentFailures } from "../../src/render/component-checks.mjs";
import { embedFailures, embedFrames } from "../../src/render/embeds.mjs";

// The preview names a file of the folder by its stamp (render/media-ref.mjs servedUrl: tests/unit/written-files.mjs);
// left out where what is checked is the address.
const unstamped = (html) => html.replace(new RegExp("[?]v=[0-9a-f]{12}", "g"), "");

// Embeds (嵌入, components/embed/, docs/components/embed.md): their markup and its checks,
// their file where the preview shows it and inside an export (render/embeds.mjs), whether a page
// lets frames show it (editor/unfurl.mjs), the files kept in the report's folder (kind "embed"), and
// the block as the editor finds it and writes a new one.

const HTML = Buffer.from("<!doctype html><p>hi</p>");
const PDF = Buffer.from("%PDF-1.4\n%%EOF\n");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-embeds-"));
await fs.mkdir(path.join(root, "alpha", "assets"), { recursive: true });
await fs.writeFile(path.join(root, "alpha", "report.html"), "<main></main>");
await fs.writeFile(path.join(root, "alpha", "report.json"), "{}");
await fs.writeFile(path.join(root, "alpha", "assets", "embed-0123456789ab.html"), HTML);
await fs.writeFile(path.join(root, "alpha", "assets", "embed-0123456789ab.pdf"), PDF);
const directory = path.join(root, "alpha");

const figure = (frame) => `<main class="doc-page">\n  <figure class="doc-embed">\n    ${frame}\n    <figcaption></figcaption>\n  </figure>\n</main>`;
const web = figure('<iframe class="doc-embed-frame" src="https://example.com/app" sandbox="allow-scripts allow-same-origin"></iframe>');
const html = figure('<iframe class="doc-embed-frame" src="assets/embed-0123456789ab.html" sandbox="allow-scripts"></iframe>');
const pdf = figure('<iframe class="doc-embed-frame" src="assets/embed-0123456789ab.pdf"></iframe>');

// Its markup and checks: a web page (https, sandboxed), or an HTML file (sandboxed, no origin of its
// own) or PDF (no sandbox) of the report's folder that is there.
for (const good of [web, html, pdf]) {
  assert.deepEqual(componentFailures(good), []);
  assert.deepEqual(embedFailures({ html: good, directory }), [], good);
}
assert.equal(componentFailures(web.replace("\n    <figcaption></figcaption>", "")).length, 1, "no caption");
const failure = (frame) => embedFailures({ html: figure(frame), directory })[0];
assert.match(failure('<iframe class="doc-embed-frame" src="http://example.com/" sandbox=""></iframe>'), /never http/);
assert.match(failure('<iframe class="doc-embed-frame" src="https://example.com/"></iframe>'), /is sandboxed/);
assert.match(failure('<iframe class="doc-embed-frame" src="assets/embed-0123456789ab.html" sandbox="allow-scripts allow-same-origin"></iframe>'), /keeps its own origin/);
// A PDF's frame with a sandbox: the browser shows no PDF in one (its viewer is blocked there), though
// the file is there and an export embeds it.
assert.match(failure('<iframe class="doc-embed-frame" src="assets/embed-0123456789ab.pdf" sandbox="allow-scripts"></iframe>'), /an embedded PDF \(assets\/embed-0123456789ab\.pdf\) is sandboxed, and a sandboxed frame shows no PDF: take its sandbox attribute off/);
assert.match(failure('<iframe class="doc-embed-frame" src="assets/embed-0123456789ab.pdf" sandbox></iframe>'), /an embedded PDF/, "an empty sandbox too");
assert.match(failure('<iframe class="doc-embed-frame" src="assets/embed-missing.pdf"></iframe>'), /not in the document's folder/);
assert.match(failure('<iframe class="doc-embed-frame" src="assets/notes.txt"></iframe>'), /an HTML or PDF file/);
assert.match(failure('<iframe class="doc-embed-frame" src="assets/pages/演示.html" sandbox="allow-scripts"></iframe>'), /^line \d+: an embed's frame \(assets\/pages\/演示\.html\): the preview serves the files right in assets\/, none in a folder of it \(assets\/pages\/\): move the file into assets\/, as assets\/file\.html \(an HTML or PDF file; or a web page, https:\/\/…\)$/, "a name the preview serves none by: why");

// The preview shows its file from the report's folder and says the file; an export holds it; a web page stays.
assert.ok(unstamped(embedFrames(html, { slug: "alpha", mode: "preview", reportsDirectory: root })).includes('src="/__gallery/edit/embed/alpha/assets/embed-0123456789ab.html" data-ge-src="assets/embed-0123456789ab.html"'));
assert.ok(embedFrames(pdf, { slug: "alpha", reportsDirectory: root }).includes(`src="data:application/pdf;base64,${PDF.toString("base64")}"`));
assert.ok(embedFrames(html, { slug: "alpha", reportsDirectory: root }).includes(`src="data:text/html;base64,${HTML.toString("base64")}"`));
assert.equal(embedFrames(web, { slug: "alpha", reportsDirectory: root }), web);

// Where a page shows in a frame: a YouTube video's player, a Google document's preview.
assert.equal(frameAddress("https://www.youtube.com/watch?v=abc123"), "https://www.youtube.com/embed/abc123");
assert.equal(frameAddress("https://youtu.be/abc123"), "https://www.youtube.com/embed/abc123");
assert.equal(frameAddress("https://docs.google.com/document/d/x/edit"), "https://docs.google.com/document/d/x/preview");
assert.equal(frameAddress("https://example.com/a?b=1"), "https://example.com/a?b=1");

// Whether a page lets frames show it: X-Frame-Options or frame-ancestors say no.
const server = http.createServer((request, response) => {
  if (request.url === "/deny") response.setHeader("X-Frame-Options", "SAMEORIGIN");
  if (request.url === "/csp") response.setHeader("Content-Security-Policy", "frame-ancestors 'self'");
  if (request.url === "/any") response.setHeader("Content-Security-Policy", "frame-ancestors *");
  response.end("<p>page</p>");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const files = createMediaStore({ reportsDirectory: root });
const asked = async (route) => (await files.frameable({ url: `http://127.0.0.1:${server.address().port}${route}` }))[1];
assert.deepEqual([(await asked("/ok")).frameable, (await asked("/deny")).frameable, (await asked("/csp")).frameable, (await asked("/any")).frameable], [true, false, false, true]);
server.close();

// Its files go into the report's folder: an HTML or PDF file (a PDF's bytes saying so), embed-<hash>.<extension>.
const [status, kept] = await files.upload({ slug: "alpha", kind: "embed", name: "演示.html", data: HTML.toString("base64") });
assert.equal(status, 200);
assert.match(kept.path, /^assets\/embed-[a-f0-9]{12}\.html$/);
assert.equal((await files.upload({ slug: "alpha", kind: "embed", name: "x.pdf", data: HTML.toString("base64") }))[1].reason, "type", "no PDF inside");
assert.equal((await files.upload({ slug: "alpha", kind: "embed", name: "x.txt", data: HTML.toString("base64") }))[1].reason, "type");

// The editor: one block (a card), its caption a media block's; a new one written as the kit writes
// one (a web page's frame sandboxed as a web link's is, shared/web-links.mjs WEB_SANDBOX; an HTML file's with no origin of its own; a PDF's
// as the browser shows one), never anything else.
const page = `<main>\n  <p>前文</p>\n${web.replace(/^<main[^>]*>\n|\n<\/main>$/g, "")}\n</main>\n`;
assert.deepEqual(findUnits(page).units.map((unit) => unit.kind), ["paragraph", "embed"]);
assert.ok(findBlocks(page).some((block) => block.kind === "mediaCaption"));
const add = (node) => applyEdits({ current: page, edits: [], units: [{ id: "n0", insert: { type: "embed", key: "n0", caption: "", ...node }, place: { after: 0 } }] });
assert.ok(add({ src: "https://example.com/a?b=1&c=2", height: "480px" }).text.includes('<figure class="doc-embed" style="--doc-embed-height: 480px">\n    <iframe class="doc-embed-frame" src="https://example.com/a?b=1&amp;c=2" sandbox="allow-scripts allow-popups allow-top-navigation-by-user-activation allow-forms allow-same-origin allow-storage-access-by-user-activation allow-popups-to-escape-sandbox" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen loading="lazy"></iframe>'));
assert.ok(add({ src: "assets/embed-0123456789ab.html" }).text.includes('<figure class="doc-embed doc-embed--file">\n    <iframe class="doc-embed-frame" src="assets/embed-0123456789ab.html" sandbox="allow-scripts allow-popups allow-forms allow-modals" loading="lazy"></iframe>'));
assert.ok(add({ src: "assets/embed-0123456789ab.pdf" }).text.includes('<iframe class="doc-embed-frame" src="assets/embed-0123456789ab.pdf" loading="lazy"></iframe>'));
for (const bad of [{ src: "http://example.com/" }, { src: "javascript:alert(1)" }, { src: "assets/x.txt" }, { src: "https://example.com/", height: "tall" }]) {
  assert.deepEqual(add(bad).conflicts.map((entry) => entry.reason), ["invalid"], JSON.stringify(bad));
}

await fs.rm(root, { recursive: true, force: true });
console.log("Checked embeds: their markup and checks (https pages sandboxed, HTML files with no origin of their own, PDFs with no sandbox), their file where the preview shows it and inside an export, frame addresses, whether a page lets frames show it, their files kept in the document's folder, and the block as the editor finds it and writes a new one.");
