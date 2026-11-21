import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { drawPageChips } from "../../src/render/page-chips.mjs";
import { exportLinks, rewritePageLinks } from "../../src/render/page-link-rewrite.mjs";
import { addressOn, decoded, elsewhere, fileLink, fromFile, fullAddress, hashAddress, hosted, isFileLink, isPageAddress, mayBePage, pageAddress, workbenchHash } from "../../src/shared/page-address.mjs";
import { pageId, pageLinks } from "../../src/shared/page-links.mjs";
import { slugPattern } from "../../src/shared/workspace.mjs";

// A document's address in every form it is written (docs/workbench.md, "A document's addresses"):
// one read of them for the link card, a paste, a click, the workbench's address and the checks.

const links = pageLinks([{ slug: "weekly", title: "项目周报" }, { slug: "doc", title: "Q3 复盘" }, { slug: "report", title: "report" }]);
const page = (slug, block = null) => ({ slug, block });
const [weeklyLink, docLink] = [links.get("weekly"), links.get("doc")];
const weeklyId = pageId("weekly");

// The forms that need no list, each with a block and without.
for (const [text, slug] of [
  ["../weekly/doc.html", "weekly"],
  ["../weekly/report.html", "weekly"],
  ["http://127.0.0.1:4173/generated/weekly.html", "weekly"],
  ["http://localhost:9/generated/weekly.html", "weekly"],
  ["http://127.0.0.1:4173/generated/weekly.html?present", "weekly"],
  ["http://127.0.0.1:4173/weekly/doc.html", "weekly"],
  ["http://localhost:4173/weekly/report.html", "weekly"],
  ["/generated/weekly.html", "weekly"],
  ["/weekly/doc.html", "weekly"],
  ["http://127.0.0.1:4173/generated/doc.html", "doc"],
  ["http://127.0.0.1:4173/generated/report.html", "report"],
  ["http://127.0.0.1:4173/doc/doc.html", "doc"],
]) {
  assert.deepEqual(pageAddress(text), page(slug), text);
  assert.deepEqual(pageAddress(`${text}#ab12cd34`), page(slug, "ab12cd34"), `${text}#…`);
  assert.deepEqual(pageAddress(`  ${text}\n`), page(slug), "spaces around it are none of it");
  assert.deepEqual(pageAddress(text, links), page(slug), `${text}, with the list`);
}

// The form that needs the list: a workbench's address, which only the list can read.
for (const text of ["http://127.0.0.1:4173/#weekly", "http://127.0.0.1:4173/#weekly/ab12cd34", "/#weekly/ab12cd34", `http://127.0.0.1:4173/#${encodeURIComponent(weeklyLink)}`, `http://127.0.0.1:4173/#plain-words-${weeklyId}/ab12cd34`]) assert.equal(pageAddress(text), null, `${text} asks for the list`);
assert.deepEqual(pageAddress("http://127.0.0.1:4173/#weekly", links), page("weekly"), "a slug, with the list");
assert.deepEqual(pageAddress("http://localhost:1/#weekly/ab12cd34", links), page("weekly", "ab12cd34"), "with a block, on any port of this computer");
assert.deepEqual(pageAddress(`http://127.0.0.1:4173/#${encodeURIComponent(weeklyLink)}`, links), page("weekly"), "a link, with the list");
assert.deepEqual(pageAddress(`http://127.0.0.1:4173/#${weeklyLink}`, links), page("weekly"), "as a browser's address bar gives it");
assert.deepEqual(pageAddress(`http://127.0.0.1:4173/#${encodeURIComponent(docLink)}/ab12cd34`, links), page("doc", "ab12cd34"), "a link holds no slash, so one with a block reads too");
assert.deepEqual(pageAddress(`/#${weeklyId}`, links), page("weekly"), "the id alone");
assert.deepEqual(pageAddress(`http://127.0.0.1:4173/#${encodeURIComponent("以前的标题")}-${weeklyId}/ab12cd34`, links), page("weekly", "ab12cd34"), "the words are a label: a title it left reads as it");

// What is no document's address.
for (const text of [
  "https://example.com/weekly/doc.html",
  "https://example.com/generated/weekly.html",
  "http://example.com/#weekly/ab12cd34",
  "https://127.0.0.1.example.com/generated/weekly.html",
  "http://192.168.1.2:4173/generated/weekly.html",
  "//example.com/generated/weekly.html",
  "ftp://127.0.0.1/generated/weekly.html",
  "http://127.0.0.1:4173/",
  "http://127.0.0.1:4173/#",
  "http://127.0.0.1:4173/assets/a.png",
  "http://127.0.0.1:4173/weekly/other.html",
  "http://127.0.0.1:4173/a/b/doc.html",
  "http://127.0.0.1:4173/generated/Weekly.html",
  "http://127.0.0.1:4173/generated/a--b.html",
  "../a--b/doc.html",
  "../../weekly/doc.html",
  "weekly/doc.html",
  "../weekly/doc.htm",
  "../weekly/doc.html?x=1",
  "doc.html",
  "#ab12cd34",
  "assets/a.pdf",
  "项目周报",
  "",
  null,
  undefined,
]) assert.equal(pageAddress(text), null, String(text));
for (const text of ["../other/doc.html", "../other/doc.html#ab12cd34", "http://127.0.0.1:4173/generated/other.html", "http://127.0.0.1:4173/other/doc.html", "http://127.0.0.1:4173/#other", "http://127.0.0.1:4173/#other/ab12cd34", "http://127.0.0.1:4173/#项目周报", `http://127.0.0.1:4173/#项目周报-${pageId("other")}`]) {
  assert.equal(pageAddress(text, links), null, `${text}: a slug the list does not hold`);
}

// A workbench's hash alone, as navigation.ts reads it.
assert.equal(hashAddress("weekly/ab12cd34"), null, "with no list it says nothing");
assert.equal(hashAddress("weekly"), null);
assert.deepEqual(hashAddress(weeklyLink, links), page("weekly"));
assert.deepEqual(hashAddress(`${weeklyLink}/ab12cd34`, links), page("weekly", "ab12cd34"));
assert.deepEqual(hashAddress("weekly/ab12cd34", links), page("weekly", "ab12cd34"));
assert.deepEqual(hashAddress("weekly/", links), page("weekly"));
assert.equal(hashAddress("项目周报", links), null);
assert.equal(hashAddress("", links), null);

// What a click hands the workbench, not knowing the list.
assert.equal(workbenchHash(`http://127.0.0.1:4173/#${encodeURIComponent("项目周报")}`), "项目周报");
assert.equal(workbenchHash("http://localhost:4173/#weekly/ab12cd34"), "weekly/ab12cd34");
for (const text of ["http://127.0.0.1:4173/", "http://127.0.0.1:4173/generated/weekly.html#ab12cd34", "https://example.com/#weekly", "#weekly", "../weekly/doc.html#ab12cd34"]) assert.equal(workbenchHash(text), null, text);

assert.equal(isPageAddress("../weekly/doc.html"), true);
assert.equal(isPageAddress("http://127.0.0.1:4173/#项目周报"), true, "a link counts, the workbench reads it");
assert.equal(isPageAddress("https://example.com/#weekly"), false);
assert.equal(mayBePage("http://localhost:3000/anything"), true, "this computer's host: the list says");
assert.equal(mayBePage("https://example.com/generated/weekly.html"), false);

// An address that holds a host of this computer may be another program's: only the same port is sure.
const server = "http://127.0.0.1:4173";
for (const text of ["http://localhost:3000/#/dashboard", "http://127.0.0.1:9/generated/weekly.html", "//localhost:3000/a", "http://localhost/", "HTTP://LOCALHOST:3000/"]) assert.equal(elsewhere(text, server), true, text);
for (const text of ["http://localhost:4173/#weekly", "http://127.0.0.1:4173/generated/weekly.html", "/generated/weekly.html", "/#weekly", "../weekly/doc.html", "https://example.com:3000/", "#ab12cd34", "", null]) assert.equal(elsewhere(text, server), false, String(text));
for (const text of ["http://localhost:3000/", "HTTPS://x.com", "//localhost/a"]) assert.equal(hosted(text), true, text);
for (const text of ["/generated/weekly.html", "../weekly/doc.html", "#a", "doc.html", "", null]) assert.equal(hosted(text), false, String(text));

// Read on a server: on another port a page id may be another workspace's folder of the same name, so
// a link names a document there only in the words it has now. On this server the words are a label.
const on = (text) => addressOn(text, links, server);
assert.deepEqual(on(`http://127.0.0.1:4173/#以前的标题-${weeklyId}/ab12cd34`), page("weekly", "ab12cd34"), "this server: a title it left");
assert.deepEqual(on(`http://localhost:4173/#${weeklyId}`), page("weekly"), "this server: the id alone");
assert.deepEqual(on(`/#以前的标题-${weeklyId}`), page("weekly"), "a path alone is this server's");
assert.equal(on(`http://127.0.0.1:9/#别的工作区的标题-${weeklyId}/ab12cd34`), null, "another port, the words not its own: another program's");
assert.equal(on(`http://127.0.0.1:9/#${weeklyId}`), null, "another port, no words to go by");
assert.equal(on(`http://127.0.0.1:9/#${encodeURIComponent(weeklyLink)}/ab12cd34`), null, "another port, in its words of now: a link outliving its server");
assert.equal(addressOn(`http://127.0.0.1:9/#${pageId("bare")}`, pageLinks([{ slug: "bare", title: "???" }]), server), null, "a title that leaves no words has the id alone for its link");
assert.equal(on("http://127.0.0.1:9/#weekly/ab12cd34"), null, "another port, by its folder name");
assert.equal(on("http://127.0.0.1:9/generated/weekly.html#ab12cd34"), null, "and its page");
assert.equal(on("http://127.0.0.1:9/generated/other.html"), null, "what the list does not hold");
assert.equal(addressOn(`http://127.0.0.1:4173/#${weeklyLink}`, links), null, "no server to read it on: every port is another, its words of now good on all");
assert.equal(addressOn(`http://127.0.0.1:4173/#以前的标题-${weeklyId}`, links), null, "and no others");
assert.deepEqual(addressOn(fromFile(`/#以前的标题-${weeklyId}`, "own"), links), page("weekly"), "a path alone still is this workspace's");
assert.deepEqual(addressOn("../weekly/doc.html", null), page("weekly"), "with no list, what needs none");

// A folder an Agent named doc- and eight characters (doc-overview) had the hash for its id (0.1.x:
// #Overview-f3md3kg4); an address written then opens it as well, here, in a path and on another port.
{
  const held = pageLinks([{ slug: "doc-overview", title: "Overview" }, { slug: "weekly", title: "项目周报" }]);
  const earlier = "Overview-f3md3kg4";
  assert.equal(held.get("doc-overview"), "Overview-overview", "its link of now ends with its eight");
  assert.deepEqual(pageAddress(`http://127.0.0.1:4173/#${earlier}/ab12cd34`, held), page("doc-overview", "ab12cd34"), "the address of before");
  assert.deepEqual(hashAddress(earlier, held), page("doc-overview"));
  assert.deepEqual(addressOn(`http://127.0.0.1:4173/#${earlier}`, held, server), page("doc-overview"), "this server");
  assert.equal(addressOn(`http://127.0.0.1:9/#${earlier}/ab12cd34`, held, server), null, "another port, its words of then: a document a file named by that address");
  assert.equal(addressOn(`http://127.0.0.1:9/#${held.get("doc-overview")}`, held, server), null, "and its words of now");
  assert.equal(addressOn("http://127.0.0.1:9/#别的标题-f3md3kg4", held, server), null, "another port, other words: still another program's");
  assert.equal(addressOn(`http://127.0.0.1:9/#Overview-${pageId("weekly")}`, held, server), null, "and no other document's id under these words");
  assert.equal(addressOn(`http://127.0.0.1:9/#项目周报-f3md3kg4`, held, server), null, "nor an earlier id under another document's words");
}

// A link of a file, read where that file stands, as a click and the disk read it.
const readIn = (href, own = "own") => pageAddress(fromFile(href, own));
for (const href of ["../weekly/doc.html", "./../weekly/doc.html", "../weekly/report.html", "../../weekly/doc.html", "../weekly/doc.html?x=1"]) assert.deepEqual(readIn(href), page("weekly"), href);
assert.deepEqual(readIn("../weekly/doc.html?x=1#ab12cd34"), page("weekly", "ab12cd34"));
assert.deepEqual(readIn("doc.html"), page("own"), "beside its file doc.html is the document itself, not the document called doc");
assert.deepEqual(readIn("doc.html#ab12cd34"), page("own", "ab12cd34"));
assert.deepEqual(readIn("report.html"), page("own"));
assert.deepEqual(readIn("../doc/doc.html"), page("doc"));
assert.deepEqual(readIn("/generated/weekly.html"), page("weekly"));
for (const href of ["../目标页/doc.html", "../TARGET/doc.html", "../target/", "../target", "target/doc.html", "assets/a.pdf", "a.html", "https://example.com/"]) assert.equal(readIn(href), null, href);
assert.equal(fromFile("../weekly/doc.html", "own", "http://127.0.0.1:4173"), "http://127.0.0.1:4173/weekly/doc.html", "on the server it is read on");
assert.equal(fromFile("http://localhost:3000/a", "own", "http://127.0.0.1:4173"), "http://localhost:3000/a");
assert.equal(fromFile("http://", "own"), null, "no address at all");

// What a file and a full address write.
assert.equal(fileLink(page("weekly")), "../weekly/doc.html");
assert.equal(fileLink(page("weekly", "ab12cd34")), "../weekly/doc.html#ab12cd34");
assert.equal(fileLink(page("weekly", "ab12cd34"), "weekly"), "#ab12cd34", "within a document a block is its id");
assert.equal(fileLink(page("weekly"), "weekly"), "../weekly/doc.html");
assert.equal(fileLink(page("weekly", "ab12cd34"), "doc"), "../weekly/doc.html#ab12cd34");
assert.equal(fullAddress("http://127.0.0.1:4173", page("weekly"), links), `http://127.0.0.1:4173/#项目周报-${weeklyId}`, "by the link, in its words");
assert.equal(fullAddress("http://127.0.0.1:4173", page("weekly", "ab12cd34"), links), `http://127.0.0.1:4173/#项目周报-${weeklyId}/ab12cd34`);
assert.equal(fullAddress("http://127.0.0.1:4173", page("doc"), links), `http://127.0.0.1:4173/#${docLink}`);
assert.equal(fullAddress("http://127.0.0.1:4173", page("nothing", "ab12cd34"), links), `http://127.0.0.1:4173/#${pageId("nothing")}/ab12cd34`, "a document the list does not hold: its id");
assert.equal(fullAddress("http://127.0.0.1:4173", page("weekly", "ab12cd34")), `http://127.0.0.1:4173/#${weeklyId}/ab12cd34`, "no list read: its id");
assert.deepEqual(pageAddress(fullAddress("http://127.0.0.1:4173", page("weekly", "ab12cd34"), links), links), page("weekly", "ab12cd34"), "reads back");
assert.deepEqual(pageAddress(fullAddress("http://127.0.0.1:4173", page("weekly", "ab12cd34")), links), page("weekly", "ab12cd34"), "by its id too");
assert.deepEqual(pageAddress(fileLink(page("weekly", "ab12cd34"), "doc")), page("weekly", "ab12cd34"), "a file's reads back with no list");

assert.equal(decoded("%E5%91%A8"), "周");
assert.equal(decoded("100%"), "100%", "no good encoding: as it is written");

// A link written anew: on the tree, by its place, what only reads like a link left as it is.
const listed = pageLinks([{ slug: "a", title: "甲" }, { slug: "b", title: "乙" }, { slug: "c", title: "标题" }]); // the workspace's documents
const [ownLink, titled] = [listed.get("a"), encodeURIComponent(listed.get("c"))];
const body = `<!doctype html><html><head><title>t</title><script>const a = '<a href="../b/doc.html">';</script></head><body><main data-doc-id="a">
<p data-block-id="own12345">到 <a class="x" href="../b/doc.html" title="词">乙</a>、<a href="../b/report.html#ab12cd34"><b>块</b></a>、<a href='../c/doc.html'>丙</a>、<a href="#own12345">这里</a>、<a href="#card">卡片</a>、<a href="#none">无</a>、<a href="https://example.com/b/doc.html">网页</a>、<a href="/#b/ab12cd34">地址</a>、<a href="/#${titled}">标题</a>。</p>
<pre><code>&lt;a href="../b/doc.html"&gt;</code></pre><!-- <a href="../b/doc.html">注释</a> -->
<dialog id="card"></dialog></main></body></html>`;
const seen = [];
assert.equal(rewritePageLinks(body, "a", (place, href) => (seen.push([place.slug, place.block, href]), href), listed), body, "the same hrefs back: not a byte changed");
assert.deepEqual(seen, [["b", null, "../b/doc.html"], ["b", "ab12cd34", "../b/report.html#ab12cd34"], ["c", null, "../c/doc.html"], ["a", "own12345", "#own12345"], ["b", "ab12cd34", "/#b/ab12cd34"], ["c", null, `/#${titled}`]], "the links to documents and to its own blocks, in order, and no other");
const inExport = exportLinks(body, "a", (slug) => ({ a: "a.html", b: "folder/b%20c.html" })[slug] ?? null, { links: listed });
assert.ok(inExport.includes('<a class="x" href="folder/b%20c.html" title="词">乙</a>'), "a page the export holds: its file, the link's other attributes kept");
assert.ok(inExport.includes('<a href="folder/b%20c.html#ab12cd34"><b>块</b></a>') && inExport.includes('<a href="folder/b%20c.html#ab12cd34">地址</a>'), "its block with it, from every form");
assert.ok(inExport.includes("、丙、") && inExport.includes("、标题。"), "a page it does not hold: the words alone, a title's address read by the list");
assert.ok(inExport.includes('<a href="#own12345">这里</a>') && inExport.includes('<a href="#card">卡片</a>') && inExport.includes('<a href="#none">无</a>') && inExport.includes('href="https://example.com/b/doc.html"'), "a link within the page, a card's and a web address stay");
assert.ok(inExport.includes(`const a = '<a href="../b/doc.html">';`) && inExport.includes('&lt;a href="../b/doc.html"&gt;') && inExport.includes('<!-- <a href="../b/doc.html">注释</a> -->'), "a script, a code block and a comment stay");
const inMarkdown = exportLinks(body, "a", (slug) => ({ a: "a.md", b: "b.md" })[slug] ?? null, { blocks: false, links: listed });
assert.ok(inMarkdown.includes('<a href="b.md"><b>块</b></a>') && inMarkdown.includes("、这里、"), "Markdown: no block goes with a link, and a link within the page keeps its words");
const inPdf = exportLinks(body, "a", () => null, { links: listed });
assert.ok(inPdf.includes('到 乙、<b>块</b>、丙、这里、') && inPdf.includes('<a href="#card">卡片</a>'), "a PDF: the words of every link to a document or block, a card's entry staying");
assert.ok(rewritePageLinks(body, "a", (place) => fullAddress("http://127.0.0.1:9", place, listed), listed).includes(`<a href="http://127.0.0.1:9/#${ownLink}/own12345">这里</a>`), "the clipboard's: the whole address by the link, its own blocks' too");
const fileOf = (slug) => `${slug}.html`;
const noFile = () => null;
assert.equal(exportLinks('<!doctype html><a href="../b/doc.html">词', "a", noFile, { links: listed }), "<!doctype html>词", "a link with no end tag");

// A link of a figure writes xlink:href as well as href, and keeps the name it was written with.
const drawn = (name) => `<!doctype html><svg><a ${name}="../b/doc.html#ab12cd34"><text>图</text></a><a ${name}="../x/doc.html"><text>无</text></a></svg>`;
assert.equal(exportLinks(drawn("xlink:href"), "a", (slug) => (slug === "b" ? "b.html" : null), { links: listed }), '<!doctype html><svg><a xlink:href="b.html#ab12cd34"><text>图</text></a><text>无</text></svg>');
assert.equal(exportLinks(drawn("href"), "a", (slug) => (slug === "b" ? "b.html" : null), { links: listed }), '<!doctype html><svg><a href="b.html#ab12cd34"><text>图</text></a><text>无</text></svg>');
assert.equal(exportLinks(drawn("xlink:href"), "a", noFile, { links: listed }), "<!doctype html><svg><text>图</text><text>无</text></svg>");

// A link left open: the parser carries it into the next block, one tag of the file read as two elements.
const leftOpen = '<!doctype html><p class="last">末尾 <a class="open" href="../b/doc.html#ab12cd34">词<p>下一段<b>粗</b></p>';
const carried = [];
assert.equal(rewritePageLinks(leftOpen, "a", (place, href) => (carried.push(href), href), listed), leftOpen, "not a byte changed");
assert.equal(exportLinks(leftOpen, "a", fileOf, { links: listed }), '<!doctype html><p class="last">末尾 <a class="open" href="b.html#ab12cd34">词<p>下一段<b>粗</b></p>', "written once");
assert.equal(exportLinks(leftOpen, "a", noFile, { links: listed }), '<!doctype html><p class="last">末尾 词<p>下一段<b>粗</b></p>', "its words stay, and the next block's");
assert.equal(exportLinks('<!doctype html><p><a href="../b/doc.html">词<p>次</a>尾</p>', "a", noFile, { links: listed }), "<!doctype html><p>词<p>次尾</p>", "the end tag that closes what was carried goes with it");

// Another program of this computer: an address with a host is a document's only if the list holds it.
const others = '<a href="http://localhost:3000/#/dashboard">一</a><a href="http://localhost:3000/#section">二</a><a href="http://localhost:5173/generated/x.html">三</a><a href="http://localhost:5173/x/doc.html#ab12cd34">四</a>';
assert.equal(exportLinks(`<!doctype html>${others}`, "a", noFile, { links: listed }), `<!doctype html>${others}`, "an export keeps them");
assert.equal(rewritePageLinks(`<!doctype html>${others}`, "a", (place) => fullAddress("http://127.0.0.1:9", place, listed), listed), `<!doctype html>${others}`, "the clipboard keeps them");
assert.equal(exportLinks(`<!doctype html><a href="http://localhost:9999/generated/b.html#ab12cd34">词</a><a href="http://localhost:9999/#${titled}">题</a>`, "a", fileOf, { links: listed }), `<!doctype html><a href="http://localhost:9999/generated/b.html#ab12cd34">词</a><a href="http://localhost:9999/#${titled}">题</a>`, "other ports remain external even if a local title matches");
assert.equal(exportLinks('<!doctype html><a href="../gone/doc.html">词</a><a href="/generated/gone.html">句</a><a href="/#gone">段</a><a href="/#gone/ab12cd34">节</a>', "a", noFile, { links: listed }), "<!doctype html>词句段节", "with no host it is this workspace's, whether the list holds it or not");
const stranger = `<a href="http://localhost:9999/#旧的词-${pageId("b")}/ab12cd34">词</a>`;
assert.equal(exportLinks(`<!doctype html>${stranger}`, "a", fileOf, { links: listed }), `<!doctype html>${stranger}`, "another port, words that are not its own: as written");
const written = [];
rewritePageLinks('<!doctype html><a href="/#gone">段</a><a href="../gone/doc.html">词</a>', "a", (place) => (written.push(place), null), listed);
assert.deepEqual(written, [{ slug: null, block: null }, { slug: "gone", block: null }], "a workbench's address that names no document comes with no slug: nothing of it is one");

// What a click reads as a document's, an export reads as one.
for (const href of ["./../b/doc.html", "../b/doc.html?x=1", "../../b/doc.html"]) assert.equal(exportLinks(`<!doctype html><a href="${href}#ab12cd34">词</a>`, "a", fileOf, { links: listed }), '<!doctype html><a href="b.html#ab12cd34">词</a>', href);
assert.equal(exportLinks('<!doctype html><a href="doc.html#own12345">词</a><p data-block-id="own12345"></p>', "a", fileOf, { links: listed }), '<!doctype html><a href="#own12345">词</a><p data-block-id="own12345"></p>', "doc.html beside its file is the document itself");
assert.equal(exportLinks('<!doctype html><a href="assets/a.pdf">词</a><a href="a.html">句</a>', "a", noFile, { links: listed }), '<!doctype html><a href="assets/a.pdf">词</a><a href="a.html">句</a>', "a file of the folder is no document's");

// A chip whose link goes takes its icon with it: its words stay, nothing more.
assert.equal(exportLinks('<!doctype html><a class="doc-link-mention" href="../x/doc.html"><span class="doc-link-mention-icon"></span>标题</a>', "a", noFile, { links: listed }), "<!doctype html>标题");
assert.equal(exportLinks('<!doctype html><a class="doc-link-mention" href="../x/doc.html"><img class="doc-link-mention-icon" src="assets/a.png" alt="">标题</a>', "a", noFile, { links: listed }), "<!doctype html>标题", "a picture for its icon too");

// What a page block's address may be: as a file writes a link to a document or a block, no other form.
for (const href of ["../a/doc.html", "../a/report.html", "../a/doc.html#ab12cd34", "#ab12cd34"]) assert.ok(isFileLink(href), href);
for (const href of ["", "#", "a.html", "/generated/a.html", "/#a", "../A/doc.html", "https://example.com/", "http://127.0.0.1:1/#a/b"]) assert.ok(!isFileLink(href), href);

// A page block as a page shows it: the target's title and icon, the file's words for one with no
// doc.json title, what only reads like one left alone, one whose document is not there marked.
{
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-page-chips-"));
  const documented = async (slug, json) => {
    await fs.mkdir(path.join(directory, slug), { recursive: true });
    await fs.writeFile(path.join(directory, slug, "doc.html"), "<!doctype html>");
    await fs.writeFile(path.join(directory, slug, "doc.json"), JSON.stringify(json));
  };
  await documented("own", { title: "这一页" });
  await documented("plain", { title: "没有图标 <b>" });
  await documented("icon", { title: "有图标", icon: "🎯" });
  await documented("glyph", { title: "图标页签", icon: "/icons/airplane_blue.svg" });
  await documented("bare", {});
  const chip = (href, words = "文件里的词") => `<a class="doc-link-mention" href="${href}"><span class="doc-link-mention-icon"></span>${words}</a>`;
  const draw = (html, mode) => drawPageChips(`<!doctype html><main>${html}</main>`, { slug: "own", mode, reportsDirectory: directory }).replace(/^<!doctype html><main>|<\/main>$/g, "");
  assert.equal(draw(chip("../plain/doc.html"), "preview"), chip("../plain/doc.html", "没有图标 &lt;b&gt;"), "the title now, the icon left for the kit");
  assert.equal(draw(chip("../icon/doc.html#ab12cd34"), "preview"), '<a class="doc-link-mention" href="../icon/doc.html#ab12cd34"><img class="doc-link-mention-icon" src="/__gallery/edit/icon?value=%F0%9F%8E%AF&amp;slug=icon&amp;tab=1" alt="">有图标</a>', "the icon by the icon route");
  assert.match(draw(chip("../icon/doc.html"), "export"), /^<a class="doc-link-mention" href="\.\.\/icon\/doc\.html"><img class="doc-link-mention-icon" src="data:image\/svg\+xml;base64,[^"]+" alt="">有图标<\/a>$/, "in an export, inside the file");
  assert.match(draw(chip("../glyph/doc.html"), "export"), /src="data:image\/svg\+xml;base64,/, "of each kind");
  assert.equal(draw(chip("../icon/doc.html"), "words"), chip("../icon/doc.html", "有图标"), "for words alone (Markdown, search): the title now, no picture");
  assert.equal(draw(chip("#ab12cd34"), "preview"), chip("#ab12cd34", "这一页"), "a block of the page: the page's own title");
  assert.equal(draw(chip("../bare/doc.html"), "preview"), chip("../bare/doc.html"), "a document with no title keeps the file's words");
  assert.equal(draw(chip("../gone/doc.html"), "preview"), chip("../gone/doc.html").replace('.html">', '.html" data-doc-gone>'), "a document that is not there: its words, marked");
  const others = `${chip("https://example.com/")}<a href="../plain/doc.html">词</a><a class="doc-link-mention"></a><a class="doc-link-mention" data-doc-page></a><code>${chip("../plain/doc.html").replaceAll("<", "&lt;")}</code>`;
  assert.equal(draw(others, "preview"), others, "a web page's chip, a plain link, one left empty and a code block showing one stay as they are");
  assert.equal(drawPageChips("<p>无</p>", { slug: "own", reportsDirectory: directory }), "<p>无</p>", "a page with none: nothing read");
  const open = `<p>${chip("../plain/doc.html").replace("</a>", "")}</p><p>下一段</p>`;
  assert.equal(draw(open, "preview"), open, "a link left open has no end to draw to: not a byte changed");
  await fs.rm(directory, { recursive: true, force: true });
}

// The slug it knows is the workspace's, which it cannot import (that module needs Node).
for (const slug of ["a", "a-b", "a1-b2", "2026-q3"]) assert.ok(slugPattern.test(slug) && pageAddress(`../${slug}/doc.html`)?.slug === slug, slug);
for (const slug of ["A", "a--b", "-a", "a-", "a_b"]) assert.ok(!slugPattern.test(slug) && pageAddress(`../${slug}/doc.html`) === null, slug);

console.log("Checked a document's addresses: every form with a block and without, what needs the list, what is no address, what a file and a full address write.");
