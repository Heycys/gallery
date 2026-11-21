import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import bookmark from "../../src/editor/components/bookmark/file.mjs";
import embed from "../../src/editor/components/embed/file.mjs";
import file from "../../src/editor/components/file/file.mjs";
import { createReportFromStarter } from "../../src/render/reports.mjs";
import { escapeAttribute, escapeMarkup, escapeText, escapeTyped, unescapeText } from "../../src/shared/escape.mjs";
import { attributesText } from "../../src/editor/source/text.mjs";

// What a report's markup does with the five characters that can break it. Every writer of markup
// asks the one module (src/shared/escape.mjs), and each keeps the set of characters it has always
// written: a file the page or the server writes must not change by a byte when the escaping moved.

const ALL = `a&b<c>d"e'f`;
const block = (open, lines, close) => `${open}${lines.join("")}${close}`;
const writer = { id: "", block };

// A text and an address are each written the way they were (the attribute set: & and "; the
// markup set, for what stands in text and in an attribute: & < > and ").
assert.equal(bookmark.bookmark.write({ href: "https://example.com/?a=1&b=\"2\"", title: ALL, description: ALL, icon: null, cover: null, caption: "" }, writer),
  '<figure class="doc-bookmark"><a class="doc-bookmark-card" href="https://example.com/?a=1&amp;b=&quot;2&quot;" target="_blank" rel="noopener noreferrer"><span class="doc-bookmark-text"><span class="doc-bookmark-title">a&amp;b&lt;c&gt;d&quot;e\'f</span><span class="doc-bookmark-description">a&amp;b&lt;c&gt;d&quot;e\'f</span><span class="doc-bookmark-url"><span class="doc-bookmark-href">https://example.com/?a=1&amp;b=&quot;2&quot;</span></span></span></a><figcaption></figcaption></figure>');
assert.equal(file.file.write({ href: "assets/a.txt", name: ALL, caption: "" }, writer),
  '<figure class="doc-file"><a class="doc-file-link" href="assets/a.txt" download="a&amp;b&lt;c&gt;d&quot;e\'f"><span class="doc-file-name">a&amp;b&lt;c&gt;d&quot;e\'f</span></a><figcaption></figcaption></figure>');
assert.equal(embed.embed.write({ src: "https://example.com/?a=1&b=<2>\"", caption: "" }, writer).includes('src="https://example.com/?a=1&amp;b=<2>&quot;"'), true, "an address: & and the quote only");
assert.equal(attributesText({ title: ALL, hidden: "" }), ` title="a&amp;b<c>d&quot;e'f" hidden`, "attributes written into a start tag: & and the quote only");

// The starter's title is written into markup in text, the apostrophe as well; its description goes
// to report.json alone (the page's placeholder section does not hold it).
{
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "report-escape-"));
  await createReportFromStarter("draft", ALL, "说明", { directory });
  const written = await fs.readFile(path.join(directory, "draft", "doc.html"), "utf8");
  assert.ok(written.includes("a&amp;b&lt;c&gt;d&quot;e&#39;f"), "the starter escapes all five");
  assert.ok(!written.includes("说明"), "the description is not in the page");
  assert.equal(JSON.parse(await fs.readFile(path.join(directory, "draft", "doc.json"), "utf8")).title, ALL, "report.json holds the characters themselves");
  await fs.rm(directory, { recursive: true, force: true });
}

// "$$", "$&", "$`" and "$'" in a title are words, not the patterns of a replacement string: they
// come out escaped as above and otherwise as they were typed; and so is a placeholder's name
// ("__REPORT_SLUG__" in a title).
{
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "report-escape-"));
  const title = "ARPU $$ 与 $& 对比，$` 之前、$' 之后 <b>";
  const description = `说明：${title}`;
  await createReportFromStarter("dollars", title, description, { directory });
  const written = await fs.readFile(path.join(directory, "dollars", "doc.html"), "utf8");
  const escaped = "ARPU $$ 与 $&amp; 对比，$` 之前、$&#39; 之后 &lt;b&gt;";
  assert.ok(written.includes(`<title>${escaped}</title>`), "the title in <title>");
  assert.ok(written.includes(`<h1 class="doc-title">${escaped}</h1>`), "the title in the h1");
  assert.ok(written.includes('data-doc-id="dollars"'), "the slug");
  const metadata = JSON.parse(await fs.readFile(path.join(directory, "dollars", "doc.json"), "utf8"));
  assert.deepEqual([metadata.title, metadata.description], [title, description], "report.json holds them as they were typed");
  // A placeholder's name in a title is a word too: the two are written in one pass.
  await createReportFromStarter("names", "A __REPORT_SLUG__ __REPORT_TITLE__ B", "C __REPORT_TITLE__ D", { directory });
  const named = await fs.readFile(path.join(directory, "names", "doc.html"), "utf8");
  assert.ok(named.includes("<title>A __REPORT_SLUG__ __REPORT_TITLE__ B</title>"), "the slug's and the title's names in the title");
  assert.ok(named.includes('data-doc-id="names"') && !named.includes("C __REPORT_TITLE__ D"), "the slug, and no description");
  await fs.rm(directory, { recursive: true, force: true });
}

// The four sets, character by character.
for (const [name, written, expected] of [
  ["escapeText", escapeText, "a&amp;b&lt;c&gt;d\"e'f"],
  ["escapeAttribute", escapeAttribute, "a&amp;b<c>d&quot;e'f"],
  ["escapeMarkup", escapeMarkup, "a&amp;b&lt;c&gt;d&quot;e'f"],
  ["escapeTyped", escapeTyped, "a&amp;b&lt;c>d\"e'f"],
]) {
  assert.equal(written(ALL), expected, name);
  assert.equal(written("&amp;"), "&amp;amp;", `${name} escapes an ampersand that starts an entity`);
  assert.equal(written(""), "", name);
}
assert.equal(unescapeText(escapeMarkup(ALL).replace("'", "&#39;")), ALL, "what is escaped reads back");
assert.equal(unescapeText("&amp;lt;"), "&lt;", "one level at a time");
assert.equal(unescapeText("\\&#93;, $&#36;"), "\\], $$", "the entities a formula block's closing delimiter is written with (components/math texText)");
console.log("Checked escaping: the four sets of characters (text, attribute, markup, typed text) and what each writer of a block, a start tag or the starter writes for them, byte for byte, and the starter's title with replacement patterns ($$, $&) and the placeholders' names written as typed, its description in report.json alone.");
