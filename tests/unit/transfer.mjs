import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fillReport, importFiles, parseCSV, titleFromName } from "../../src/transfer/import.mjs";
import { relativeLink, safeName, uniqueName } from "../../src/transfer/names.mjs";
import { oldNames } from "./fixtures/old-names.mjs";
import { openReport } from "../../src/transfer/dom.mjs";
import { reportMarkdown } from "../../src/transfer/markdown.mjs";
import { exportPage, validOptions } from "../../src/transfer/export.mjs";
import { createEditService } from "../../src/editor/service.mjs";
import { readOnlyTexts, shownSource } from "../../src/editor/source.mjs";
import { createTransferService } from "../../src/transfer/service.mjs";
import { createZip, openZip, readZip } from "../../src/transfer/zip.mjs";
import { extOf, kindOf } from "../../src/shared/import-types.mjs";
import { defaultPreferencesFile, unshownLines } from "../../src/shared/writing-preferences.mjs";

// 导入 and 导出 (src/transfer/, docs/workbench.md "Import and export"): the zips both make and read,
// how an export names its files, a report as Markdown, the export's options, and files of
// other programs made pages (each converter, a Notion export's subpages, pictures kept as uploads).

const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-transfer-"));
const savedHome = process.env.GALLERY_DEFAULT_WORKSPACE;
process.env.GALLERY_DEFAULT_WORKSPACE = path.join(root, "workspace");
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");

// ---------- zip ----------
{
  const zip = createZip([{ name: "中文/页面.md", data: "# 标题\n\n正文" }, { name: "big.bin", data: Buffer.alloc(50000, 7) }, { name: "empty.txt", data: "" }]);
  assert.deepEqual(readZip(zip).map((file) => [file.name, file.data.length]), [["中文/页面.md", 16], ["big.bin", 50000], ["empty.txt", 0]], "a zip reads back as written, UTF-8 names");
  assert.ok(zip.length < 1000, "what deflates smaller is deflated");
  // zip64: the end record pointing at its own (as a zip over 4 GB has it)
  const end = zip.length - 22;
  const count = zip.readUInt16LE(end + 10);
  const record = Buffer.alloc(56);
  record.writeUInt32LE(0x06064b50, 0);
  record.writeBigUInt64LE(BigInt(count), 24);
  record.writeBigUInt64LE(BigInt(count), 32);
  record.writeBigUInt64LE(BigInt(zip.readUInt32LE(end + 12)), 40);
  record.writeBigUInt64LE(BigInt(zip.readUInt32LE(end + 16)), 48);
  const locator = Buffer.alloc(20);
  locator.writeUInt32LE(0x07064b50, 0);
  locator.writeBigUInt64LE(BigInt(end), 8);
  const tail = Buffer.from(zip.subarray(end));
  tail.writeUInt16LE(0xffff, 10);
  tail.writeUInt32LE(0xffffffff, 16);
  assert.deepEqual(readZip(Buffer.concat([zip.subarray(0, end), record, locator, tail])).map((file) => file.name), ["中文/页面.md", "big.bin", "empty.txt"], "a zip64 end record is read");
  // From a file, a file at a time.
  const file = path.join(root, "t.zip");
  await fs.writeFile(file, zip);
  const opened = openZip(file);
  const to = path.join(root, "big.bin");
  await opened.extract(opened.entries[1], to);
  assert.equal((await fs.stat(to)).size, 50000, "an entry streams out to a file");
  assert.equal(opened.read(opened.entries[0]).toString("utf8"), "# 标题\n\n正文");
  opened.close();
  // A name without the UTF-8 flag: UTF-8 when it reads so, else GBK (Windows' Explorer in Chinese).
  const gbk = Buffer.from(createZip([{ name: "ab", data: "x" }]));
  const at = gbk.lastIndexOf(Buffer.from("ab")); // the central record's name
  gbk.writeUInt16LE(0, 8 + at - 46); // the central record's flags
  Buffer.from([0xd6, 0xd0]).copy(gbk, at); // 中 in GBK
  assert.equal(readZip(gbk)[0].name, "中", "a name without the UTF-8 flag that is no UTF-8 reads as GBK");
  assert.throws(() => readZip(Buffer.from("not a zip at all, not at all")), /不是有效的 ZIP 文件/);
  // A zip bomb: an entry declared 1 KB whose deflate stream inflates to 64 MB is refused as soon as it
  // passes its declared size, in memory and streamed to a file alike (zlib's maxOutputLength; extract's count).
  const bomb = Buffer.from(createZip([{ name: "bomb.bin", data: Buffer.alloc(64 * 1024 * 1024) }]));
  bomb.writeUInt32LE(1024, 22); // the local header's size
  bomb.writeUInt32LE(1024, bomb.lastIndexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])) + 24); // the central record's
  assert.ok(bomb.length < 512 * 1024, "the bomb is small");
  const tooBig = (error) => error.code === "size" && /bomb\.bin/.test(error.message);
  assert.throws(() => readZip(bomb), tooBig, "a bomb in memory: refused");
  const bombFile = path.join(root, "bomb.zip");
  await fs.writeFile(bombFile, bomb);
  const bombed = openZip(bombFile);
  assert.equal(bombed.entries[0].size, 1024);
  assert.throws(() => bombed.read(bombed.entries[0]), tooBig, "a bomb read from a file: refused");
  const bombOut = path.join(root, "bomb.bin");
  await assert.rejects(bombed.extract(bombed.entries[0], bombOut), tooBig, "a bomb streamed to a file: refused");
  assert.ok((await fs.stat(bombOut)).size < 1024 * 1024, "and stopped soon after its declared size, the disk not filled");
  bombed.close();
}

// ---------- detail cards ----------
// No block of the page's flow, a card is written after it as a disclosure, its entry its text alone,
// every card something opens in file order, wherever it stands, what it holds as anywhere in the
// export. A selection cannot take one, so no copy writes it.
{
  const card = (id, title, content) => `<dialog class="doc-dialog" id="${id}"><div class="doc-dialog-panel"><div class="doc-dialog-content"><h3>${title}</h3>${content}</div></div></dialog>`;
  const opener = (id) => `<a href="#${id}"></a>`; // what opens a card, of no words of its own
  const source = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>T</title></head><body><main class="doc-page" data-doc-id="x">
  <header class="doc-header"><h1 class="doc-title">T</h1></header>
  <p>看<a class="doc-dialog-trigger" href="#one">甲卡</a>和<a class="doc-dialog-trigger" href="#two">乙卡</a>，<a class="doc-dialog-trigger" href="#inner">节里的</a>也是。</p>
  <section class="doc-section"><h2>一节</h2><p>节内</p>${card("inner", "节里的卡片", "<p>节卡的话</p>")}</section>
  <ul><li>页里的项</li></ul>
  ${card("one", "甲<strong>卡</strong>标题", `<p>第一段 $x$ <a class="doc-dialog-trigger" href="#two">再开一张</a></p>
    <ul><li>卡里的项</li></ul>
    <div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>名</th></tr></thead><tbody><tr><td>值</td></tr></tbody></table></div>
    <div class="doc-math-block">\\[a+b\\]</div>
    <figure class="doc-image"><img src="assets/image-0123456789ab.png" alt=""><figcaption>卡里的图</figcaption></figure>
    <figure class="doc-file"><a class="doc-file-link" href="assets/data.csv" download="数据.csv">数据.csv</a></figure>`)}
  ${card("two", "乙卡标题", "<p>只有一段</p>")}
</main></body></html>`;
  const media = [];
  const text = await reportMarkdown((await openReport(source)).document, { title: "T", media: (src, kind, name) => (media.push([src, kind]), `FILE/${name}`), chart: () => null });
  assert.ok(text.includes("看甲卡和乙卡，节里的也是。"), `its entries their text: ${text}`);
  const end = text.slice(text.indexOf("- 页里的项"));
  assert.equal(end.split("\n").slice(0, 3).join("\n"), "- 页里的项\n\n- 节里的卡片", "after the blocks, in file order, an empty line before each, though a list stands before it");
  assert.equal(text.indexOf("- 节里的卡片") < text.indexOf("- 甲**卡**标题") && text.indexOf("- 甲**卡**标题") < text.indexOf("- 乙卡标题"), true, "every card in the file's order");
  for (const line of ["- 节里的卡片\n\n    节卡的话", "- 甲**卡**标题\n\n    第一段 $x$ 再开一张\n\n    - 卡里的项\n\n    | 名 |\n    | --- |\n    | 值 |\n\n    $$\n    a+b\n    $$\n\n    ![卡里的图](FILE/image-0123456789ab.png)\n\n    卡里的图\n\n    [数据.csv](FILE/数据.csv)", "- 乙卡标题\n\n    只有一段"]) {
    assert.ok(text.includes(line), `a card as a disclosure holding ${JSON.stringify(line)}:\n${text}`);
  }
  assert.deepEqual(media, [["assets/image-0123456789ab.png", "image"], ["assets/data.csv", "file"]], "the files it names go through media()");
  assert.ok(text.endsWith("只有一段"), "nothing after the last");
  const alone = await reportMarkdown((await openReport(`<!doctype html><html><head><meta charset="utf-8"><title>T</title></head><body><main class="doc-page" data-doc-id="y">${opener("c")}${card("c", "只有卡片", "<p>话</p>")}</main></body></html>`)).document, { title: "T" });
  assert.equal(alone, "# T\n\n- 只有卡片\n\n    话", "a page with nothing but a card");
  assert.equal(await reportMarkdown((await openReport('<!doctype html><html><head><meta charset="utf-8"><title>T</title></head><body><main class="doc-page" data-doc-id="z"><p>字</p></main></body></html>')).document, { title: "T" }), "# T\n\n字", "none: nothing added");
  // After </main>, of the kit or written the short way, as any other: a preview and an export read the page made the kit's.
  const outside = (after) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>T</title></head><body><main class="doc-page" data-doc-id="o"><p>看<a href="#x">链接</a></p></main>${after}</body></html>`;
  for (const after of ['<dialog id="x"><h2>页外卡</h2><p>页外话</p></dialog>', card("x", "页外卡", "<p>页外话</p>")]) {
    assert.equal(await reportMarkdown((await openReport(shownSource(outside(after)).text)).document, { title: "T" }), "# T\n\n看链接\n\n- 页外卡\n\n    页外话", "a card after </main>");
  }
  const fence = await reportMarkdown((await openReport(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>T</title></head><body><main class="doc-page" data-doc-id="f">${opener("c")}${card("c", "含围栏", '<div class="doc-code" data-language="markdown"><div class="doc-code-title"></div><pre><code>```\ninner\n```</code></pre></div><p>围栏后</p>')}</main></body></html>`)).document, { title: "T" });
  assert.equal(fence, "# T\n\n- 含围栏\n\n    ````markdown\n    ```\n    inner\n    ```\n    ````\n\n    围栏后", "code holding a fence, in a card");
  // A paragraph that reads as a tag is written so that it reads back as those words, in its card.
  const tagged = await reportMarkdown((await openReport(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>T</title></head><body><main class="doc-page" data-doc-id="l">${opener("a")}${opener("b")}${card("a", "字面", "<p>&lt;details&gt;</p><p>后面的话</p>")}${card("b", "下一张", "<p>下一张的话</p>")}</main></body></html>`)).document, { title: "T" });
  assert.equal(tagged, "# T\n\n- 字面\n\n    \\<details>\n\n    后面的话\n\n- 下一张\n\n    下一张的话", "a paragraph that reads <details>");
  // A card, a disclosure, an item or a node of no words on its line over what it holds: a non-breaking
  // space there, so that a viewer gives it its line above what it holds, as the page shows it, and
  // what it holds after it as after words (with nothing there, an item's first block would stand on
  // its line). One holding nothing has none. Read back, it is no words.
  const wordless = await reportMarkdown((await openReport(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>T</title></head><body><main class="doc-page" data-doc-id="w">
  <details class="doc-details"><summary><span class="doc-details-summary-label"></span></summary><div class="doc-details-content"><p>入口</p></div></details>
  <ul><li><p>只有段</p></li><li>下一项</li><li></li></ul>
  <ol class="doc-flow"><li><p></p><p>节点的话</p></li></ol>
  ${opener("u")}${card("u", "", "<p>没有标题的话</p><ul><li>项</li></ul>")}
  ${opener("v")}${card("v", "", "<ul><li>只有项</li></ul>")}
</main></body></html>`)).document, { title: "T" });
  assert.equal(wordless, [
    "# T", "", "- &nbsp;", "", "    入口", "", "- &nbsp;", "", "    只有段", "- 下一项", "- ", "1. &nbsp;", "", "    节点的话", "",
    "- &nbsp;", "", "    没有标题的话", "", "    - 项", "", "- &nbsp;", "    - 只有项",
  ].join("\n"), "a non-breaking space on a line of no words over what it holds");
  // Held by a list item or a report's own widget, it is none of their words, and written once: what it
  // holds, no blocks of the page where they are not looked for, as such a widget's words, its pictures after them.
  const holding = await reportMarkdown((await openReport(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>T</title></head><body><main class="doc-page" data-doc-id="h">
  <ul><li>项 <a class="doc-dialog-trigger" href="#c">链接</a>${card("c", "项卡", "<p>项话</p><ul><li>卡里项</li></ul>")}</li><li>下一项</li></ul>
  ${opener("w")}${opener("s")}${opener("t")}<div class="kpi"><p>小组件的话</p>${card("w", "件卡", '<p>件话</p><img src="assets/image-0123456789ab.png" alt="">')}<img src="assets/image-ba9876543210.png" alt=""></div>
  <div class="kpi">散字${card("s", "散卡", "<p>散话</p>")}</div>
  <table class="doc-table"><tbody><tr><td>格 ${card("t", "格卡", "<p>格话</p>")}</td></tr></tbody></table>
</main></body></html>`)).document, { title: "T" });
  assert.equal(holding, [
    "# T", "", "- 项 链接", "- 下一项", "", "小组件的话", "", "![](assets/image-ba9876543210.png)", "", "散字", "", "| 格 |", "| --- |", "",
    "- 项卡", "", "    项话 · 卡里项", "", "- 件卡", "", "    件话", "", "    ![](assets/image-0123456789ab.png)", "", "- 散卡", "", "    散话", "", "- 格卡", "", "    格话",
  ].join("\n"), "a card an item or a widget holds, once");
  // Its first heading is its title and is not written again, wherever among its blocks it stands; a
  // card with no heading goes by the words that open it, marks and all, a link's or a button's, and
  // with nothing that opens it its line has no words. A heading a block of it holds stays there.
  const plain = (id, content) => `<dialog class="doc-dialog" id="${id}"><div class="doc-dialog-panel"><div class="doc-dialog-content">${content}</div></div></dialog>`;
  const titled = async (main) => reportMarkdown((await openReport(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>T</title></head><body><main class="doc-page" data-doc-id="t">${main}</main></body></html>`)).document, { title: "T" });
  for (const [name, main, written] of [
    ["a heading after a paragraph", `${opener("a")}${plain("a", "<p>前</p><h3>中题</h3><p>后</p>")}`, "- 中题\n\n    前\n\n    后"],
    ["of any level", `${opener("a")}${plain("a", "<h2>二级</h2><p>话</p>")}`, "- 二级\n\n    话"],
    ["two headings: the first", `${opener("a")}${plain("a", "<h3>一题</h3><p>话</p><h3>二题</h3>")}`, "- 一题\n\n    话\n\n    ### 二题"],
    ["a heading alone", `${opener("a")}${plain("a", "<h3>只有题</h3>")}`, "- 只有题"],
    ["its marks", `${opener("a")}${plain("a", "<h3>粗<strong>体</strong></h3><p>话</p>")}`, "- 粗**体**\n\n    话"],
    ["an empty heading goes by the next", `${opener("a")}${plain("a", "<h3></h3><h4>下一题</h4><p>话</p>")}`, "- 下一题\n\n    话"],
    ["none: the words of its link", `<p><a class="doc-dialog-trigger" href="#a">入<strong>口</strong></a></p>${plain("a", "<p>话</p>")}`, "入**口**\n\n- 入**口**\n\n    话"],
    ["none: the first link, not one inside it", `${plain("a", '<p>话<a href="#a">自己</a></p>')}<p><a href="#a">外面的</a></p>`, "外面的\n\n- 外面的\n\n    话自己"],
    ["none: the words of a button", `<p><button class="doc-button" type="button" data-doc-dialog-open="#a">按钮字</button></p>${plain("a", "<p>话</p>")}`, "按钮字\n\n- 按钮字\n\n    话"],
    ["held by a block of it: no heading of the card's", `<p><a href="#a">入口</a></p>${plain("a", '<div class="doc-panel"><h3>面板里的题</h3><p>话</p></div>')}`, "入口\n\n- 入口\n\n    <aside>\n    面板里的题\n\n    话\n\n    </aside>"],
  ]) assert.equal(await titled(main), `# T\n\n${written}`, name);
  assert.equal(await titled(plain("a", "<h3>题</h3><p>话</p>")), "# T", "nothing opens it: it shows nowhere, and is left out");
  assert.equal(await titled(`<p>段</p>${plain("a", "<p>话</p>")}`), "# T\n\n段", "with no heading too");
  assert.equal(await titled(`${plain("a", '<p><a href="#a">自己</a></p>')}`), "# T", "a link inside it opens it for no one");
  // The element is left out, the content never cloned: a chart of it is asked for its picture by the element the page drew.
  {
    const { document } = await openReport(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>T</title></head><body><main class="doc-page" data-doc-id="c">${opener("c")}${plain("c", '<h3>题</h3><figure class="doc-figure"><h3>图题</h3><div data-doc-chart="bar"></div></figure>')}</main></body></html>`);
    const asked = [];
    await reportMarkdown(document, { title: "T", chart: (figure) => (asked.push(figure), null) });
    assert.deepEqual(asked, [document.querySelector("figure")], "a chart in a card");
  }
}

// ---------- names ----------
{
  assert.equal(safeName(' 报告: "一" / 二 '), "报告 一 二", "what a file name cannot hold becomes a space, spaces fold");
  assert.equal(safeName(""), "Untitled");
  const taken = new Set();
  assert.deepEqual(["图.png", "图.png", "图.PNG", "说明"].map((name) => uniqueName(name, taken)), ["图.png", "图 1.png", "图 2.PNG", "说明"], "a name taken gets a number, case aside");
  assert.equal(relativeLink("页 (1)/a.md", "页 (1)/b c/图.png"), "b%20c/%E5%9B%BE.png", "links are relative, each part encoded");
  assert.equal(relativeLink("a.md", "x (1)/y.md"), "x%20%281%29/y.md", "parentheses are encoded too (a Markdown link breaks on them)");
  assert.equal(relativeLink("a/b/c.md", "a/d.md"), "../d.md");
}

// ---------- export options ----------
{
  assert.ok(validOptions({ format: "markdown" }), "the format is all an export needs");
  assert.ok(validOptions({ format: "pdf", paper: "Letter", scale: 1.5, subpages: true, folders: false, content: "no_files" }));
  for (const bad of [{ format: "docx" }, { format: "pdf", scale: 2 }, { format: "pdf", scale: 0.1 }, { format: "pdf", paper: "B5" }, { format: "html", content: "some" }, { format: "html", subpages: "yes" }]) {
    assert.ok(!validOptions(bad), `refused: ${JSON.stringify(bad)}`);
  }
}

// ---------- what an export is called ----------
{
  const reportsDirectory = path.join(root, "reports");
  const report = async (slug, title, body) => {
    await fs.mkdir(path.join(reportsDirectory, slug), { recursive: true });
    await fs.writeFile(path.join(reportsDirectory, slug, "report.html"), `<!doctype html><html><head><title>${title}</title></head><body><main class="doc-page" data-doc-id="${slug}"><header class="doc-header"><h1 class="doc-title">${title}</h1></header>${body}</main></body></html>`);
  };
  await report("t", "页 (1)", "<p>正文</p>");
  await report("c", "子页", "<p>子页的正文</p>");
  const site = {
    reportsDirectory,
    titleOf: async (slug) => ({ t: "页 (1)", c: "子页" })[slug],
    childrenOf: async (slug) => (slug === "t" ? ["c"] : []),
    links: async () => ({ links: new Map() }),
    offline: async (slug) => `<!doctype html><title>${slug}</title>`,
    check: async () => {},
  };
  const html = await exportPage("t", { format: "html" }, site);
  assert.deepEqual([html.name, html.type, html.data.toString("utf8")], ["页 (1).html", "text/html; charset=utf-8", "<!doctype html><title>t</title>"], "one file is downloaded as it is, named as the page");
  const markdown = await exportPage("t", { format: "markdown" }, site);
  assert.equal(markdown.name, "页 (1).md");
  assert.match(markdown.data.toString("utf8"), /^# 页 \(1\)\n\n正文/);
  const both = await exportPage("t", { format: "markdown", subpages: true, folders: true }, site);
  assert.deepEqual([both.name, readZip(both.data).map((file) => file.name)], ["页 (1).zip", ["页 (1).md", "页 (1)/子页.md"]], "more files: a zip named as the page, the subpage in its folder, no ids in any name");
  const flat = await exportPage("t", { format: "html", subpages: true, folders: false }, site);
  assert.deepEqual(readZip(flat.data).map((file) => file.name), ["页 (1).html", "子页.html"], "flat: all at the top");

  // Links between pages: to the file of a page the export holds, relative; to any other, the words alone.
  await report("l", "父页", '<p><a href="../o/doc.html#ab12cd34">子页的块</a>和<a href="../x/doc.html">别的页</a></p><p><a href="http://localhost:3000/#/login">别的程序</a></p>');
  await report("o", "子页 (2)", '<p><a href="../l/doc.html">回去</a></p>');
  const pages = { l: await fs.readFile(path.join(reportsDirectory, "l", "report.html"), "utf8"), o: await fs.readFile(path.join(reportsDirectory, "o", "report.html"), "utf8") };
  const kept = new Map();
  const linking = {
    ...site,
    titleOf: async (slug) => ({ l: "父页", o: "子页 (2)" })[slug],
    childrenOf: async (slug) => (slug === "l" ? ["o"] : []),
    offline: async (slug, settings) => { kept.set(slug, pages[slug]); return settings?.rewrite ? settings.rewrite(pages[slug]) : pages[slug]; }, // as offlineReports' render: its rewrite (the links) before what it carries
  };
  const files = async (options) => Object.fromEntries(readZip((await exportPage("l", options, linking)).data).map((file) => [file.name, file.data.toString("utf8")]));
  const htmlFiles = await files({ format: "html", subpages: true, folders: true });
  assert.ok(htmlFiles["父页.html"].includes('<a href="%E7%88%B6%E9%A1%B5/%E5%AD%90%E9%A1%B5%20%282%29.html#ab12cd34">子页的块</a>和别的页'), htmlFiles["父页.html"]);
  assert.ok(htmlFiles["父页/子页 (2).html"].includes('<a href="../%E7%88%B6%E9%A1%B5.html">回去</a>'), htmlFiles["父页/子页 (2).html"]);
  assert.ok(kept.get("l").includes("../o/doc.html"), "what offline made is left as it is");
  const markdownFiles = await files({ format: "markdown", subpages: true, folders: false });
  assert.ok(markdownFiles["父页.md"].includes("[子页的块](%E5%AD%90%E9%A1%B5%20%282%29.md)和别的页"), markdownFiles["父页.md"]);
  assert.ok(markdownFiles["子页 (2).md"].includes("[回去](%E7%88%B6%E9%A1%B5.md)"), markdownFiles["子页 (2).md"]);
  const alone = await exportPage("l", { format: "html" }, linking);
  assert.ok(alone.data.toString("utf8").includes("<p>子页的块和别的页</p>"), "exported alone, its links to other pages keep their words");
  assert.ok(alone.data.toString("utf8").includes('<a href="http://localhost:3000/#/login">别的程序</a>'), "and the link to another program of this computer stays a link");
}

// ---------- a report as Markdown ----------
{
  const source = `<!doctype html><html><head><title>T</title></head><body><main class="doc-page" data-doc-id="t">
  <header class="doc-header"><h1 class="doc-title">T</h1></header>
  <p>一段 <strong>粗</strong> <em>斜</em> <code>c</code> 和 <a href="https://example.com">链接</a>，公式 <span class="doc-math-inline">\\(x^2\\)</span>。</p>
  <h2>二级</h2>
  <ul><li>一<ul><li>二</li></ul></li></ul>
  <ol start="3"><li>三</li></ol>
  <ul class="doc-todo"><li data-checked>完成</li><li>未完成</li></ul>
  <ol class="doc-flow" start="2" data-direction="row"><li>需求<p>收集需求</p><ul><li>产品</li><li>设计</li></ul></li><li>开发</li></ol>
  <blockquote><p>引用</p></blockquote>
  <div class="doc-code" data-language="javascript"><div class="doc-code-title"></div><pre><code>const a = 1;</code></pre></div>
  <div class="doc-math-block">\\[a+b\\]</div>
  <hr>
  <figure class="doc-image"><img src="assets/image-0123456789ab.png" alt=""><figcaption>图注</figcaption></figure>
</main></body></html>`;
  const { document } = await openReport(source);
  const media = [];
  const text = await reportMarkdown(document, { title: "T", media: (src, kind, name) => (media.push([src, kind]), `FILE/${name}`), chart: () => null });
  for (const line of ["# T", "一段 **粗** *斜* `c` 和 [链接](https://example.com)，公式 $x^2$。", "## 二级", "- 一\n    - 二", "3. 三", "- [x]  完成", "- [ ]  未完成", "2. 需求\n\n    收集需求\n\n    - 产品\n    - 设计\n3. 开发", "> 引用", "```javascript\nconst a = 1;\n```", "$$\na+b\n$$", "---", "图注"]) {
    assert.ok(text.includes(line), `the Markdown has ${JSON.stringify(line)}:\n${text}`);
  }
  assert.deepEqual(media, [["assets/image-0123456789ab.png", "image"]], "a picture of the document's folder goes through media()");
  assert.ok(!/流程图|doc-flow/.test(text), "a flowchart an ordered list from its start, each step's content under it, nothing of the kit's");
  // A formula that does not read, as the page keeps it, is its TeX all the same.
  const unread = await openReport(source.replace("\\(x^2\\)", "\\(\\frac{\\)").replace("\\[a+b\\]", "\\[a\\&#93;b\\]").replace("<h2>二级</h2>", '<p><span class="doc-math-inline">\\(a\\)b\\)</span></p>'));
  const kept = await reportMarkdown(unread.document, { title: "T", media: (src, kind, name) => `FILE/${name}`, chart: () => null });
  for (const line of ["公式 $\\frac{$。", "$a\\)b$", "$$\na\\]b\n$$"]) assert.ok(kept.includes(line), `the Markdown keeps ${JSON.stringify(line)}:\n${kept}`);
  // A flowchart written as nodes: each node's emoji and title (bold as written) its item's line, its
  // content under it; an icon of the 图标 tab no emoji, a title un-bolded plain, a flowchart in a node
  // its item's nested list (no empty line before it, as a list's).
  const nodes = source.replace('<ol class="doc-flow" start="2" data-direction="row"><li>需求<p>收集需求</p><ul><li>产品</li><li>设计</li></ul></li><li>开发</li></ol>',
    '<ol class="doc-flow"><li><div class="doc-icon">📮</div><p><strong>分派</strong></p><p>说明</p></li><li><p><strong>回访</strong></p><ol class="doc-flow"><li><p><strong>电话</strong></p></li><li><p>邮件</p></li></ol></li><li data-direction="column"><div class="doc-icon" data-icon="/icons/tabler/circle-number-5_green.svg"></div><p><strong>归档</strong></p></li></ol>');
  const nodesText = await reportMarkdown((await openReport(nodes)).document, { title: "T", media: (src, kind, name) => `FILE/${name}`, chart: () => null });
  assert.ok(nodesText.includes("1. 📮 **分派**\n\n    说明\n2. **回访**\n    1. **电话**\n    2. 邮件\n3. **归档**\n"), nodesText);
  // A card holding a drawing of the report's own (every figure a card, 2026-10-27): with no picture
  // of it (复制页面内容) its words, as a whole block's, its SVG's labels too; pictured, its picture
  // named by its title, or 图 / Figure (a chart's 图表 / Chart).
  const drawn = source.replace("<hr>", `<figure class="doc-figure"><h3>时间线</h3><p class="doc-figure-caption">按周</p><div class="timeline"><div><p>第 1 周</p><p>开始</p></div><div><p>第 3 周</p><p>上线</p></div></div><svg viewBox="0 0 100 20"><text x="0" y="10">箭头</text></svg></figure>
  <figure class="doc-figure"><div class="steps"><p>甲</p></div></figure>
  <figure class="doc-figure"><div data-doc-chart="bars"><script type="application/json">[]</script></div></figure>`);
  const drawnText = await reportMarkdown((await openReport(drawn)).document, { title: "T", chart: () => null });
  assert.ok(drawnText.includes("**时间线**\n\n第 1 周 · 开始 · 第 3 周 · 上线 · 箭头\n\n按周"), drawnText);
  assert.ok(drawnText.includes("\n甲\n"), drawnText);
  const pictured = await reportMarkdown((await openReport(drawn)).document, { title: "T", chart: () => "FILE/x.png" });
  assert.ok(pictured.includes("**时间线**\n\n![时间线](FILE/x.png)\n\n按周") && pictured.includes("\n![图](FILE/x.png)\n") && pictured.includes("\n![图表](FILE/x.png)"), pictured);
  // A block of no kind stands apart from the next as any other.
  const marked = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>T</title></head><body><main class="doc-page" data-doc-id="k"><div data-ge-unit="9"><p>一</p></div>\n<p>二</p></main></body></html>';
  assert.equal(await reportMarkdown((await openReport(marked)).document, { title: "T" }), "# T\n\n一\n\n二", "an empty line after a block no kind marks");
  // What a box shows and no unit stands for stays in the Markdown: an element the file leaves open or
  // the editor makes no block of by the kind its tag gives it, words straight in a box a paragraph.
  const written = async (main, header = '<header class="doc-header"><h1 class="doc-title">T</h1></header>') => reportMarkdown((await openReport(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>T</title></head><body><main class="doc-page" data-doc-id="k">${header}${main}</main></body></html>`)).document, { title: "T" });
  const dialog = '<dialog class="doc-dialog" id="d"><div class="doc-dialog-panel"><div class="doc-dialog-content"><h3>题</h3><p>框里</p></div></div></dialog>';
  for (const [name, main, text] of [
    ["paragraphs whose end tag is left out", "<p>甲<p>乙", "甲\n\n乙"],
    ["with their marks, beside blocks", "<p>甲<strong>粗</strong><p>乙</p><p>丙</p>", "甲**粗**\n\n乙\n\n丙"],
    ["a span in one", "<p>甲<span>乙</span><p>丙", "甲乙\n\n丙"],
    ["a dialog of the file's own in a paragraph", "<p>前<dialog open><p>框里</p></dialog>后</p><p>末</p>", "前\n\n框里\n\n后\n\n末"],
    ["a detail card in a paragraph: after the blocks, once", `<a href="#d"></a><p>前${dialog}后</p><p>末</p>`, "前\n\n后\n\n末\n\n- 题\n\n    框里"],
    ["words straight in the page", "裸字<strong>粗</strong>又字<p>段</p>尾字", "裸字**粗**又字\n\n段\n\n尾字"],
    ["an inline element", '<a href="#x">落单的链接</a><p>段</p>', "落单的链接\n\n段"],
    ["a form", "<form><label>名字</label><input></form><p>段</p>", "名字\n\n段"],
    ["what a table's lead line says", '<div class="doc-table-meta">范围</div><div class="doc-table-wrap"><table class="doc-table"><tbody><tr><td>1</td></tr></tbody></table></div>', "范围\n\n| 1 |\n| --- |"],
    ["in a section", "<section>节字<p>甲<p>乙</section>", "节字\n\n甲\n\n乙"],
    ["in a column", '<div class="doc-columns"><div class="doc-column"><p>甲<p>乙</div><div class="doc-column"><p>丙</p></div></div>', "甲\n\n乙\n\n丙"],
    ["in a tab", '<section class="doc-sheet-shell" data-doc-sheets="t"><div class="doc-sheet-tabs"><button class="doc-sheet-tab" type="button" data-sheet-tab="a">页</button></div><div data-doc-sheet="a"><p>甲<p>乙</div></section>', "页\n\n甲\n\n乙"],
    ["in a quote", "<blockquote><p>甲<p>乙</blockquote>", "> 甲\n>\n> 乙"],
    ["a quote of words", "<blockquote>直接的字</blockquote>", "> 直接的字"],
    ["in a list, an entry of it", "<ul><p>字</p><li>项</li></ul>", "- 字\n- 项"],
    ["words in a list", "<ol>字<li>项</li></ol>", "1. 字\n2. 项"],
    ["nothing of a list's script", "<ul><script>var a = 1;</script><li>项</li></ul>", "- 项"],
    ["a highlight block of words", '<div class="doc-panel">plain <strong>text</strong></div>', "<aside>\nplain **text**\n\n</aside>"],
    ["a callout of words (written the old way)", '<div class="doc-callout">plain <strong>text</strong></div>', "<aside>\nplain **text**\n\n</aside>"],
    ["a callout of blocks, as a highlight block", '<div class="doc-callout"><p>提示</p><ul><li>一</li></ul></div>', "<aside>\n提示\n\n- 一\n\n</aside>"],
    ["a section of words", '<section class="doc-panel">节字</section>', "节字"],
    ["nothing of what no reader sees", "<script>var a = 1;</script><style>p { color: red }</style><template><p>模板</p></template><noscript>无脚本</noscript><p>段</p>", "段"],
  ]) assert.equal(await written(main), `# T\n\n${text}`, name);
  assert.equal(await written("<p>段</p>", '<header class="doc-header"><h1>T</h1><p>副题<p>再一行</header>'), "# T\n\n副题\n\n再一行\n\n段", "under the title, the title itself once");
  const shown = shownSource('<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>T</title></head><body><main class="doc-page" data-doc-id="k"><p>甲<p>乙</main></body></html>').text;
  assert.equal(await reportMarkdown((await openReport(shown)).document, { title: "T" }), "# T\n\n甲\n\n乙", "and as the page is shown");
}

// ---------- 写作偏好 as <workspace>/preferences/通用写作.md ----------
{
  // What Agents read (src/shared/writing-preferences.mjs): the page as Markdown under "# 通用写作" (its file's name)
  // whatever the page's title (an old page's is 说明), the heading alone while the page has nothing
  // under its title (the file stays: the studio's default never comes back over it). The file is what
  // counts and only the dialog's 保存 writes it (the request without `opening`): the page written as
  // the file. As the dialog opens (`opening`), the page is made again of the file (the default, made
  // since there was none; one written by someone else; after what was typed or colored and not saved),
  // under its own title, the page as it was kept first, the file left as written and the lines of it
  // the page cannot show named; unless neither changed since the two were last made the same (the
  // page's report.json "madeSame"), or the page did not and the two say the same.
  const reportsDirectory = path.join(root, "workspace");
  const directory = path.join(reportsDirectory, ".gallery", "pages", "instructions"); // the page's place (shared/workspace.mjs), in the old names (report.*) here
  await fs.mkdir(directory, { recursive: true });
  // As the studio before 保存 left it: its "synced" (the Markdown's digests, for the save on close).
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify({ title: "说明", description: "", type: "说明", instructions: true, synced: { file: "0123456789abcdef", page: "0123456789abcdef" } }));
  const metadata = async () => JSON.parse(await fs.readFile(path.join(directory, "report.json"), "utf8"));
  const page = (body) => fs.writeFile(path.join(directory, "report.html"), `<!doctype html><html><head><title>说明</title></head><body><main class="doc-page" data-doc-id="instructions"><header class="doc-header"><h1 class="doc-title">通用写作</h1></header>${body}</main></body></html>`);
  const pageText = () => fs.readFile(path.join(directory, "report.html"), "utf8");
  // The page as its preview shows it (the edit service's readTaken), written in its queue (respond).
  const service = createEditService({ reportsDirectory });
  let body = {};
  const versions = []; // the page as it was before each time it was made again (edits.keepVersion)
  const { handle } = createTransferService({ edits: { check: async () => ({ body }), readTaken: service.readTaken, respond: service.respond, keepVersion: (slug, source) => versions.push([slug, source]) }, reportsDirectory });
  const post = async (given = {}) => {
    body = given;
    const response = { setHeader() {}, end(text) { this.body = JSON.parse(text); } };
    await handle({}, response, "preferences");
    return [response.statusCode, response.body];
  };
  const kept = { ok: true, path: path.join(reportsDirectory, "preferences/通用写作.md"), remade: false, unshown: [] }; // nothing made again, no line the page does not show
  const remadeOf = { ...kept, remade: true };
  const file = path.join(reportsDirectory, "preferences/通用写作.md");
  const written = () => fs.readFile(file, "utf8").catch(() => null);
  await page("<p>用简短的句子。</p>");
  assert.deepEqual(await post(), [200, kept], "saved");
  assert.equal(await written(), "# 通用写作\n\n用简短的句子。\n", "written under its own heading, not the page's title");
  const first = await metadata();
  assert.ok(first.synced === undefined && /^[a-f0-9]{16}$/.test(first.madeSame?.file) && /^[a-f0-9]{16}$/.test(first.madeSame?.page) && first.instructions === true && first.title === "通用写作", `made the same: the file's digest and the page's version kept, the old "synced" gone ${JSON.stringify(first)}`);
  await page("<p></p>");
  assert.deepEqual(await post(), [200, kept], "a page with nothing under its title");
  assert.equal(await written(), "# 通用写作\n", "the heading alone: the file stays");
  assert.deepEqual(await post({ opening: true }), [200, kept], "opened again: nothing to make the page of");
  assert.equal(await written(), "# 通用写作\n");
  // Blocks left empty still write their marks ("- ", "1. ", "- [x]  ", "---", a highlight's <aside>
  // and emoji, a code block's fences and language, a table's lines): the heading alone all the same.
  const empties = [
    "<ul><li></li></ul>", "<ol><li></li></ol>", '<ul class="doc-todo"><li data-checked></li></ul>', "<hr>",
    '<div class="doc-panel"><div class="doc-icon">💡</div><p></p></div>',
    '<div class="doc-code" data-language="python"><div class="doc-code-title"></div><pre><code></code></pre></div>',
    '<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th></th></tr></thead><tbody><tr><td></td></tr></tbody></table></div>',
    "<details><summary></summary></details>",
  ];
  for (const empty of empties) {
    await page(empty);
    assert.deepEqual(await post(), [200, kept], empty);
    assert.equal(await written(), "# 通用写作\n", empty);
  }
  await page(empties.join(""));
  assert.deepEqual(await post(), [200, kept], "all of them");
  assert.equal(await written(), "# 通用写作\n", "all of them");
  await page('<div class="doc-panel"><div class="doc-icon">💡</div><p>不要用表格</p></div><ol><li>3</li></ol>');
  assert.deepEqual(await post(), [200, kept]);
  assert.equal(await written(), "# 通用写作\n\n<aside>\n💡 不要用表格\n\n</aside>\n\n1. 3\n", "a word or a number written is");
  const saved = await pageText();
  assert.deepEqual(await post({ opening: true }), [200, kept], "opened: the file is the page, nothing made again");
  assert.equal(await pageText(), saved, "the page as it was saved");
  // Two still as they were last made the same: answered from what was kept then (madeSame's
  // unshown), the page not read as Markdown (the conversion worker, seconds to start, not asked);
  // a madeSame of before `unshown` works them out once and keeps them.
  const agreed = await metadata();
  assert.deepEqual(agreed.madeSame.unshown, [], "the lines the page does not show kept with the two");
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify({ ...agreed, madeSame: { ...agreed.madeSame, unshown: ["（记下的一行）"] } }));
  assert.deepEqual(await post({ opening: true }), [200, { ...kept, unshown: ["（记下的一行）"] }], "neither changed: answered from what was kept, nothing read again");
  const { unshown: _, ...older } = agreed.madeSame;
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify({ ...agreed, madeSame: older }));
  assert.deepEqual(await post({ opening: true }), [200, kept], "a madeSame of before unshown: worked out");
  assert.deepEqual((await metadata()).madeSame, agreed.madeSame, "and kept");
  assert.equal(await pageText(), saved, "the page as it was saved");

  // Written by someone else (an Agent the user asked): opened, the page is made of the file, under
  // its own title, the file as it was written.
  await fs.writeFile(file, "# 通用写作\n\n- 先写结论。\n- 数字带单位。\n");
  assert.deepEqual(await post({ opening: true }), [200, remadeOf]);
  const remade = await pageText();
  assert.ok(/<h1 class="doc-title">通用写作<\/h1>/.test(remade) && /<li>先写结论。<\/li>\s*<li>数字带单位。<\/li>/.test(remade) && !remade.includes("不要用表格"), remade);
  assert.deepEqual(versions.at(-1), ["instructions", saved], "the page as it was kept first");
  assert.equal(await written(), "# 通用写作\n\n- 先写结论。\n- 数字带单位。\n", "the file as it was written");
  assert.deepEqual(await post({ opening: true }), [200, kept], "the same: nothing made again");

  // Colored and not saved (what the Markdown does not carry: the two still say the same): opened
  // again, the page made again of the file all the same, the color gone; colored and saved, the file
  // as it was, and opened again the page as saved, its color kept.
  const pageFile = path.join(directory, "report.html");
  const red = (text) => text.replace("<li>先写结论。</li>", '<li class="doc-text-red">先写结论。</li>');
  await fs.writeFile(pageFile, red(await pageText()));
  assert.deepEqual(await post({ opening: true }), [200, remadeOf], "colored and not saved: made again of the file");
  assert.ok(!(await pageText()).includes("doc-text-red") && /<li>先写结论。<\/li>/.test(await pageText()), await pageText());
  await fs.writeFile(pageFile, red(await pageText()));
  assert.deepEqual(await post(), [200, kept], "colored and saved");
  assert.equal(await written(), "# 通用写作\n\n- 先写结论。\n- 数字带单位。\n", "the file as it was: its Markdown carries no color");
  const colored = await pageText();
  assert.deepEqual(await post({ opening: true }), [200, kept], "opened again: nothing made again");
  assert.equal(await pageText(), colored, "the page as saved, its color kept");
  // None kept yet (a page from before): the two saying the same is enough, and it is kept from then on.
  const { madeSame, ...before } = await metadata();
  await fs.writeFile(path.join(directory, "report.json"), JSON.stringify(before));
  await fs.writeFile(pageFile, colored.replace("<li>数字带单位。</li>", '<li class="doc-highlight-blue">数字带单位。</li>'));
  assert.deepEqual(await post({ opening: true }), [200, kept], "none kept: the same, nothing made again");
  assert.ok((await pageText()).includes("doc-highlight-blue") && (await metadata()).madeSame?.file === madeSame.file && (await metadata()).madeSame?.page !== madeSame.page, JSON.stringify(await metadata()));

  // Typed into and not saved (the dialog closed by ×, Esc or a click outside, the workbench
  // reloaded, its tab closed: none of it asks to write): the file as it was; opened again, the page
  // is made again of the file, what was typed gone (kept among the page's versions).
  await fs.writeFile(pageFile, (await pageText()).replace("</main>", "<p>没保存的一句。</p></main>"));
  const typed = await pageText();
  assert.deepEqual(await post({ opening: true }), [200, remadeOf], "opened again: made again of the file");
  assert.ok(!(await pageText()).includes("没保存的一句。") && /<li>先写结论。<\/li>/.test(await pageText()), await pageText());
  assert.deepEqual(versions.at(-1), ["instructions", typed], "the page typed into kept first");
  assert.equal(await written(), "# 通用写作\n\n- 先写结论。\n- 数字带单位。\n", "the file as it was");

  // None yet: the studio's default, made the first time it is read and then the page's.
  await fs.rm(file);
  const configFile = path.join(reportsDirectory, "gallery.json");
  const config = JSON.parse(await fs.readFile(configFile, "utf8"));
  delete config.preferences.initialized;
  await fs.writeFile(configFile, JSON.stringify(config));
  await page("<p></p>");
  assert.deepEqual(await post({ opening: true }), [200, remadeOf], "the page shows every line of the default");
  const made = await written();
  assert.ok(made.startsWith("# 通用写作\n\n## 读者和目的\n\n- 动笔前先想清楚") && made.includes("\n## 数字和事实\n"), made.slice(0, 300));
  assert.equal(made, await fs.readFile(defaultPreferencesFile, "utf8"), "the default byte for byte: the page made of it is not written back");
  assert.ok((await pageText()).includes("读者和目的"), "the page shows the default");
  const shownDefault = await pageText();
  assert.deepEqual(await post({ opening: true }), [200, kept], "opened again: the page made of the default left as it is, every line shown (the two never say the same)");
  assert.equal(await pageText(), shownDefault, "not made again at each opening");
  assert.equal(await written(), made, "made once");

  // Typed into and saved: the page is the file; opened again, the page as it was saved, not made again.
  await fs.writeFile(pageFile, (await pageText()).replace("</main>", "<p>新加的一句。</p></main>"));
  const edited = await pageText();
  assert.deepEqual(await post(), [200, kept], "saved");
  assert.ok((await written()).endsWith("\n\n新加的一句。\n") && (await written()).includes("## 读者和目的"), "the page written as the file");
  assert.deepEqual(await post({ opening: true }), [200, kept], "opened again: nothing made again");
  assert.equal(await pageText(), edited, "the page as saved");

  // Written by hand with what a page cannot hold (a comment, a link to a file on this computer): the
  // page made of it once (the two never say the same), the file left as written, and the lines the
  // page does not show named at each opening; saved, the file is the page, those lines gone.
  const hand = "# 通用写作\n\n<!-- 只给自己看的备注 -->\n\n* 用短句。\n* 术语第一次出现时\n给出全称。\n\n参考 [模板文档](report-3/report.html) 的结构。\n\n<details><summary>折叠</summary>里面的字</details>\n\n再写依据[^1]。\n\n[^1]: 脚注内容。\n";
  await fs.writeFile(file, hand);
  const unshown = ["<!-- 只给自己看的备注 -->", "参考 [模板文档](report-3/report.html) 的结构。"];
  assert.deepEqual(await post({ opening: true }), [200, { ...remadeOf, unshown }]);
  assert.ok((await pageText()).includes("里面的字") && (await pageText()).includes("用短句。"), await pageText());
  assert.equal(await written(), hand, "the file as it was written");
  assert.deepEqual(await post({ opening: true }), [200, { ...kept, unshown }], "opened again: not made again, the same lines named");
  assert.equal(await written(), hand, "still as written");
  await fs.writeFile(pageFile, (await pageText()).replace("</main>", "<p>再加一句。</p></main>"));
  assert.deepEqual(await post(), [200, kept], "saved: no line left the page does not show");
  const rewritten = await written();
  assert.ok(rewritten.includes("再加一句。") && rewritten.includes("用短句。") && !rewritten.includes("备注"), rewritten);

  // Written with what the user's own rules hold and Gallery's short default does not (numbered steps,
  // one continued on an indented line, bold, inline code, an HTML example in a code block, a table):
  // opened, the page made of it shows every line, the file left as written. (Until 2026-11-13 the
  // default itself, the user's project-report rules, was this test's rich file.)
  const rich = "# 通用写作\n\n## 步骤\n\n1. 先读材料，再定版式。\n   需要交代背景时，写一段有实际内容的正文。\n2. **结论先行。** 开头一两句话说清最重要的事。\n\n## 写法\n\n- 交稿前运行 `gallery check`，列表项写成 `<strong>标题：</strong>内容`。\n\n```html\n<ul>\n  <li><strong>范围：</strong>说明版本和口径。</li>\n</ul>\n```\n\n| 文档 | 正文顺序 |\n| --- | --- |\n| 会议纪要 | 决定 → 待办 |\n";
  await fs.writeFile(file, rich);
  assert.deepEqual(await post({ opening: true }), [200, remadeOf], "every line of a rich file shown");
  const richPage = await pageText();
  assert.ok(/<ol[\s>]/.test(richPage) && richPage.includes("需要交代背景时") && /<strong>结论先行。<\/strong>/.test(richPage) && /<code>gallery check<\/code>/.test(richPage) && richPage.includes("说明版本和口径。") && /<table[\s>]/.test(richPage) && richPage.includes("会议纪要"), richPage);
  assert.equal(await written(), rich, "the file as it was written");
  assert.deepEqual(await post({ opening: true }), [200, kept], "opened again: not made again");
}

// The lines of a file whose letters a page's Markdown does not hold (what writing the page back
// would take out): its heading aside; HTML tags and a picture's address are no words, a comment's
// words are; words joined or split again, spaced, numbered or marked otherwise are the same.
assert.deepEqual(unshownLines("# 写作偏好\n\n用短句。\n", "# 写作偏好\n\n用短句。\n"), []);
assert.deepEqual(unshownLines("# 偏好\n\n* 先写**结论**，\n再写依据\n1. GPT评测\n1. 第二\n", "# 写作偏好\n\n- 先写**结论**，再写依据\n\n1. GPT 评测\n2. 第二\n"), [], "joined, spaced, numbered");
assert.deepEqual(unshownLines("# 写作偏好\n\n![图一](dot.png)\n\n<details><summary>折叠</summary>里面</details>\n", "# 写作偏好\n\n![图一](instructions/assets/image-0123456789ab.png)\n\n- 折叠\n    里面\n"), [], "a picture's address, tags");
assert.deepEqual(unshownLines("# 写作偏好\n\n<!--\n备注\n-->\n\n[链接](a/b.html)\n", "# 写作偏好\n\n链接\n"), ["备注", "[链接](a/b.html)"], "a comment's words, a link's address");

// ---------- import ----------
const write = async (name, data) => {
  const file = path.join(root, name.replace(/[\\/]/g, "_"));
  await fs.writeFile(file, data);
  return { file, name };
};
const scratch = path.join(root, "scratch");
await fs.mkdir(scratch);
const starter = (title) => `<!doctype html>
<html lang="zh-CN">
<head><title>${title}</title></head>
<body>
  <main class="doc-page" data-doc-id="imported">
    <header class="doc-header">
      <h1 class="doc-title">${title}</h1>
    </header>
    <p></p>
  </main>
</body>
</html>
`;
const mainOf = async (page) => {
  const text = await fillReport({ source: starter(page.title), nodes: page.nodes, icon: page.icon });
  return text.slice(text.indexOf("<main"), text.indexOf("</main>"));
};

assert.equal(kindOf("a.MD"), "markdown");
assert.equal(kindOf("a.png"), null);
assert.equal(extOf("x.tar.gz"), ".gz");
assert.equal(titleFromName(`页面 ${"a".repeat(32)}.md`), "页面", "Notion's id leaves a page's title");
assert.equal(titleFromName(`表 ${"b".repeat(32)}_all.csv`), "表");
assert.deepEqual(parseCSV('a,"b,c"\n"d ""e""",f\r\n\n'), [["a", "b,c"], ['d "e"', "f"]], "CSV: quoted commas and quotes, empty rows dropped");

{
  // Markdown with its picture, chosen together; a CSV; a file it cannot take.
  const md = await write("笔记.md", "# 我的笔记\n\n**粗** 和 $x^2$。\n\n![dot.png](dot.png)\n\n![说明](dot.png)\n\n说明\n\n[外链](https://example.com)\n");
  const { pages, skipped } = await importFiles([md, await write("dot.png", PNG), await write("表.csv", "名,数\n甲,1\n"), await write("x.bin", "?")], scratch);
  assert.deepEqual(skipped, ["x.bin"], "a file no page shows and the import does not take is named");
  assert.deepEqual(pages.map((page) => page.title), ["我的笔记", "表"]);
  const note = await mainOf(pages[0]);
  assert.match(note, /<p><strong>粗<\/strong> 和 <span class="doc-math-inline">\\\(x\^2\\\)<\/span>。<\/p>/, "text and formulas as the paste makes them");
  assert.equal(note.match(/<img src="assets\/image-[0-9a-f]{12}\.png" alt="">/g)?.length, 2, "its pictures, kept as uploads are");
  assert.match(note, /<figcaption><\/figcaption>[\s\S]*<figcaption>说明<\/figcaption>/, "Notion's alt text (the file's name) is no caption; a caption's repeat in the next paragraph goes");
  assert.ok(!/<p>说明<\/p>/.test(note));
  assert.equal(pages[0].files.length, 1, "the same picture is kept once");
  assert.match(await mainOf(pages[1]), /<th[^>]*>名<\/th><th[^>]*>数<\/th>/, "a CSV is a table, its first row the header");
}

{
  // A Markdown table with pictures in its cells (单元格里的图片: Yuque's, any .md): each kept amid the
  // cell's words as a picture of the page's folder (as an image's file), its alt with it; one the set
  // does not hold its alt words, noted.
  const md = await write("清单.md", "# 清单\n\n| 名 | 图 |\n| --- | --- |\n| 猫 | ![小猫](imgs/dot.png) 很乖 |\n| 狗 | ![没有的图](imgs/none.png) |\n");
  const { pages } = await importFiles([md, await write("imgs/dot.png", PNG)], scratch);
  const list = await mainOf(pages[0]);
  assert.match(list, /<th scope="row">猫<\/th><td><img src="assets\/image-[0-9a-f]{12}\.png" alt="小猫"> 很乖<\/td>/, "a cell's picture a file of the page's folder, its words beside it");
  assert.match(list, /<th scope="row">狗<\/th><td>没有的图<\/td>/, "one not found: its alt words");
  assert.equal(pages[0].files.length, 1, "its file kept");
  assert.ok(pages[0].notes.some((note) => note.kind === "picture-missing" && note.name === "imgs/none.png"), JSON.stringify(pages[0].notes));
}

{
  // A Notion export: HTML pages, a subpage in the page's folder, a picture, a bookmark, a PDF, an icon.
  const id = "0123456789abcdef0123456789abcdef";
  const sub = "fedcba9876543210fedcba9876543210";
  const page = (title, body, icon = "") => `<html><head><title>${title}</title></head><body><article class="page sans"><header>${icon ? `<div class="page-header-icon undefined"><span class="icon">${icon}</span></div>` : ""}<h1 class="page-title">${title}</h1></header><div class="page-body">${body}</div></article></body></html>`;
  const zip = await write("Export-1.zip", createZip([
    { name: `父 (1) ${id}.html`, data: page("父 (1)", `<p>正文</p><figure class="image"><a href="${encodeURI("父 (1)/dot.png")}"><img src="${encodeURI("父 (1)/dot.png")}"></a><figcaption>图注</figcaption></figure><figure class="link-to-page"><a href="${encodeURI(`父 (1)/子 ${sub}.html`)}">子</a></figure><figure><a href="https://example.com/a" class="bookmark source"><div class="bookmark-info"><div class="bookmark-text"><div class="bookmark-title">书签</div><div class="bookmark-description">描述</div></div></div></a></figure><figure><div class="source"><a href="${encodeURI("父 (1)/文.pdf")}">文.pdf</a></div></figure><p><a href="${encodeURI(`父 (1)/子 ${sub}.html`)}">子</a> 在行内</p>`, "🎯") },
    { name: "父 (1)/dot.png", data: PNG },
    { name: "父 (1)/文.pdf", data: "%PDF-1.4\n%%EOF\n" },
    { name: `父 (1)/子 ${sub}.html`, data: page("子", "<p>子页面</p>") },
    { name: "__MACOSX/._x", data: "x" },
  ]));
  const { pages, skipped } = await importFiles([zip], scratch);
  assert.deepEqual(skipped, []);
  assert.deepEqual(pages.map((each) => [each.title, each.icon, each.children.map((child) => child.title)]), [["父 (1)", "🎯", ["子"]]], "the subpage under its page; the page's icon");
  const body = await mainOf(pages[0]);
  assert.match(body, /<div class="doc-icon">🎯<\/div>\n\s*<h1 class="doc-title">/, "the icon above the title");
  assert.match(body, /<img src="assets\/image-[0-9a-f]{12}\.png" alt="">\n\s*<figcaption>图注<\/figcaption>/, "a Notion picture with its caption, once");
  assert.ok(!/<p>图注<\/p>/.test(body));
  assert.match(body, /<a class="doc-bookmark-card" href="https:\/\/example.com\/a"[^>]*><span class="doc-bookmark-text"><span class="doc-bookmark-title">书签<\/span><span class="doc-bookmark-description">描述<\/span>/, "a bookmark card");
  assert.match(body, /<iframe class="doc-embed-frame" src="assets\/embed-[0-9a-f]{12}\.pdf"/, "a PDF of the export embedded");
  assert.ok(!/link-to-page|>子<\/a>/.test(body) && /<p>子 在行内<\/p>/.test(body), "the subpage's block goes (the sidebar has it); a link to it in a text is its text");
  assert.deepEqual(pages[0].files.map((file) => file.name.replace(/-[0-9a-f]{12}/, "")).sort(), ["embed.pdf", "image.png"]);
}

{
  // An export of Markdown through 导入: a link alone in its paragraph to a file of the assets folder beside
  // the page is that file, of a kind that makes a page elsewhere too.
  const exported = await importFiles([await write("导出.zip", createZip([
    { name: "导出.md", data: "# 导出\n\n[页.pdf](assets/%E9%A1%B5.pdf)\n\n[数据.csv](assets/%E6%95%B0%E6%8D%AE.csv)\n\n- 卡\n\n    [卡.pdf](assets/%E5%8D%A1.pdf)\n\n    后\n\n[说明](assets/%E8%AF%B4%E6%98%8E.md)" },
    { name: "assets/页.pdf", data: "%PDF-1.4\n%%EOF\n" },
    { name: "assets/卡.pdf", data: "%PDF-1.4\n%%EOF\n卡" },
    { name: "assets/数据.csv", data: "名,数\n甲,1\n" },
    { name: "assets/说明.md", data: "# 说明\n\n正文" },
    { name: "assets/没人链接.csv", data: "名,数\n丙,3\n" },
    { name: "另一页.csv", data: "名,数\n乙,2\n" },
  ]))], scratch);
  assert.deepEqual(exported.skipped, [], "nothing skipped");
  assert.deepEqual(exported.pages.map((each) => [each.title, each.children.map((child) => child.title)]), [["导出", ["说明"]], ["另一页", []], ["没人链接", []]], "the files a page takes from its assets folder are no pages; what Markdown is, what no page takes and the set's other files still are");
  const body = await mainOf(exported.pages[0]);
  assert.equal(body.match(/<iframe class="doc-embed-frame" src="assets\/embed-[0-9a-f]{12}\.pdf"/g)?.length, 2, `a PDF embedded, on the page and in the card's item: ${body}`);
  assert.match(body, /class="doc-file[^"]*"[\s\S]*数据\.csv/, "a CSV a file");
  assert.deepEqual(exported.pages[0].files.map((file) => file.name.replace(/-[0-9a-f]{12}/, "")).sort(), ["embed.pdf", "embed.pdf", "file.csv"], "their files kept");
}

{
  // Any page's landmarks hold blocks, not text: <main>, <aside>, <header>, <nav>, <footer> (a page
  // once came in as one paragraph of lines); a term list, a picture's figure, marked words.
  const page = await write("页.html", "<!doctype html><title>页</title><body><header><nav><a href=\"#\">导航</a></nav></header><main><h2>小节</h2><p>第一段。</p><aside><p>侧注。</p></aside><ul><li>甲</li></ul><dl><dt>术语</dt><dd>解释</dd></dl><figure><img src=\"dot.png\"><figcaption>图注</figcaption></figure><p><mark>重点</mark>在这</p></main><footer><p>页脚</p></footer></body>");
  const body = await mainOf((await importFiles([page, await write("dot.png", PNG)], scratch)).pages[0]);
  for (const part of [/<h2>小节<\/h2>\n\s*<p>第一段。<\/p>\n\s*<p>侧注。<\/p>/, /<ul>\s*<li>甲<\/li>\s*<\/ul>/, /<p><strong>术语<\/strong><\/p>\n\s*<p>解释<\/p>/, /<figcaption>图注<\/figcaption>/, /<p><span class="doc-highlight-yellow">重点<\/span>在这<\/p>/, /<p>页脚<\/p>/]) assert.match(body, part, `a page's structure: ${part}`);
  assert.ok(!/<br>/.test(body) && !/<p>图注<\/p>/.test(body), "never one paragraph of lines; a caption once");
}

{
  // One of the studio's own reports comes in as its author wrote it, the whole page: its report.html
  // with its picture beside it, and an export of it (its policy after <head>, the kit inlined, its
  // picture and icon embedded, the browser tab's icon before </head>). Each comes back as the page
  // it was, but for its main's id (the new report's slug) and its picture's address (the new
  // folder's): the kit's tags and the export's additions gone, with their lines where they had one; and, as none
  // of them is an export this computer made and signed (src/transfer/carry.mjs), its script made inert (gone).
  const own = (head, icon, picture, tail) => `<!doctype html><html lang="en"><head>${head}<meta charset="utf-8"><title>Q3's 自己的</title><style>.mine { color: var(--doc-accent); }</style></head><body>
  <main class="doc-page" data-doc-id="mine">
    <!-- 页眉 -->
    <header class="doc-header">
      <p class="doc-kicker">第三季度</p>
      <div class="doc-icon">${icon}</div>
      <h1 class="doc-title">Q3's <em>自己的</em></h1>
      <p class="doc-note">来源：测试</p>
    </header>

    <section class="doc-section">
      <h2 id="a">章</h2>
      <div class="doc-panel"><p>高亮。</p></div>
      <div class="doc-table-wrap"><table class="doc-table" data-doc-table-static><thead><tr><th>名</th></tr></thead><tbody><tr><td>甲</td></tr></tbody></table></div>
      <figure class="doc-image"><img src="${picture}" alt=""><figcaption>点</figcaption></figure>
      <div class="mine">自己的组件</div>
    </section>
  </main>
${tail}  <script>
    DocCharts.define("mine", () => {});
  </script>
</body></html>`;
  const fresh = (title) => starter(title).replace("</body>", "  <script>\n    // a document's own script goes here\n  </script>\n</body>");
  const expected = own("", "🎯", "assets/image-HASH.png", "").replace('data-doc-id="mine"', 'data-doc-id="imported"').replace('  <script>\n    DocCharts.define("mine", () => {});\n  </script>\n', "");
  const check = async (page, what) => {
    assert.equal(page.title, "Q3's 自己的", what);
    assert.equal(page.icon, "🎯", `${what}: its icon`);
    assert.deepEqual([page.trusted, page.inert], [false, 1], `${what}: made inert, its one script taken out`);
    assert.deepEqual(page.files.map((file) => file.name.replace(/-[0-9a-f]{12}/, "")), ["image.png"], `${what}: its picture kept`);
    const text = await fillReport({ source: fresh(page.title), nodes: page.nodes, icon: page.icon, own: page.own });
    assert.equal(text.replace(/image-[0-9a-f]{12}\.png/, "image-HASH.png"), expected, `${what}: the page as written`);
    return text;
  };
  const chosen = await importFiles([await write("自己的.html", own('<link rel="stylesheet" href="/kit/report.css" data-doc-kit="styles">', "🎯", "assets/dot.png", '  <script src="/kit/runtime.js" data-doc-kit="runtime"></script>\n')), await write("dot.png", PNG)], scratch);
  const [source] = chosen.pages;
  assert.deepEqual(chosen.skipped, [], "the picture chosen with it is taken, not said to be skipped");
  await check(source, "its report.html");
  const data = `data:image/png;base64,${PNG.toString("base64")}`;
  const policy = `\n  <meta name="generator" content="Gallery">\n  <meta http-equiv="Content-Security-Policy" content="default-src 'none'">`;
  const exported = own(`${policy}<style data-doc-kit="styles-inline">.x { }</style>`, `<img alt="🎯" src="data:image/svg+xml,%3Csvg%3E%3C/svg%3E">`, data, '  <script data-doc-kit="runtime-inline">/* inlined kit */</script>\n')
    .replace("</head>", `  <link rel="icon" href="${data}" data-doc-tab-icon>\n</head>`);
  await check((await importFiles([await write("自己的 (导出).html", exported)], scratch)).pages[0], "its export");
  // An export made before the product's rename (2026-10-26): its generator HTML Report Studio goes as Gallery's does.
  await check((await importFiles([await write("自己的 (改名前导出).html", exported.replace('content="Gallery"', 'content="HTML Report Studio"'))], scratch)).pages[0], "its export made before the rename");
  // The kit in its main (an older file may write its tags there, and its export then holds their inline
  // copies there) is no part of the new report: gone with its lines.
  const kitInMain = exported.replace('<div class="mine">自己的组件</div>', '<div class="mine">自己的组件</div>\n      <script data-doc-kit="runtime-inline">/* inlined kit */</script>\n      <script src="/kit/charts.js" data-doc-kit="charts"></script>');
  await check((await importFiles([await write("自己的 (旧导出).html", kitInMain)], scratch)).pages[0], "its kit in its main");
  // A view copy (ui.js's 导出当前视图副本): its policy, its id and its reading state go too.
  const copy = exported.replace('<html lang="en">', '<html lang="en" data-doc-theme="dark">').replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="default-src 'none'">`)
    .replace("</head>", '<meta name="doc-export-id" content="mine.v1-x"><script type="application/json" data-doc-state="">{}</script></head>');
  await check((await importFiles([await write("自己的.v1.html", copy)], scratch)).pages[0], "a view copy");
  // Each made before 2026-10-26, in the kit's old names (report-*, data-report-*, --report-*, Report*:
  // its report.html, its export and a view copy of it): the same page, in the new names.
  const oldSource = await importFiles([await write("旧的.html", oldNames(own('<link rel="stylesheet" href="/kit/report.css" data-doc-kit="styles">', "🎯", "assets/dot.png", '  <script src="/kit/runtime.js" data-doc-kit="runtime"></script>\n'))), await write("dot.png", PNG)], scratch);
  await check(oldSource.pages[0], "its report.html in the old names");
  await check((await importFiles([await write("旧的 (导出).html", oldNames(exported))], scratch)).pages[0], "its export in the old names");
  await check((await importFiles([await write("旧的.v1.html", oldNames(copy))], scratch)).pages[0], "a view copy in the old names");
  // A main with nothing after its header keeps the starter's empty paragraph, to write in.
  const empty = own("", "🎯", "", "").replace(/(<\/header>)[\s\S]*?(\n  <\/main>)/, "$1$2");
  const [blank] = (await importFiles([await write("空的.html", empty)], scratch)).pages;
  assert.match(await fillReport({ source: fresh(blank.title), nodes: blank.nodes, icon: blank.icon, own: blank.own }), /<\/header>\n    <p><\/p>\n  <\/main>/, "an empty main: the starter's paragraph");

  // A page block of an export of two: the address of a file beside it, which no document of the new
  // workspace has. It comes in as its words, the rest of its paragraph as it was, and nothing locks;
  // one of a web page, a block of the page and one left empty are chips still.
  const linked = own("", "🎯", "assets/dot.png", "").replace('<div class="mine">自己的组件</div>', `<p>去 <a class="doc-link-mention" href="%E7%9B%AE%E6%A0%87.html#ab12cd34"><img class="doc-link-mention-icon" src="${data}" alt="">目标页</a> 再回来</p>
      <p>子页 <a class="doc-link-mention" href="sub/two.html"><span class="doc-link-mention-icon"></span>第二页</a></p>
      <p>网页 <a class="doc-link-mention" href="https://example.com/"><span class="doc-link-mention-icon"></span>网页标题</a></p>
      <p>本页 <a class="doc-link-mention" href="#ab12cd34"><span class="doc-link-mention-icon"></span>本页的词</a></p>
      <p>空的 <a class="doc-link-mention" data-doc-page></a></p>`);
  const [brought] = (await importFiles([await write("有页面块.html", linked)], scratch)).pages;
  const filled = await fillReport({ source: fresh(brought.title), nodes: brought.nodes, icon: brought.icon, own: brought.own });
  assert.ok(filled.includes("<p>去 目标页 再回来</p>") && filled.includes("<p>子页 第二页</p>"), `a page block of an export comes in as its words: ${filled.match(/<p>去[\s\S]*?<\/p>/)?.[0]}`);
  assert.ok(filled.includes('href="https://example.com/"') && filled.includes('href="#ab12cd34"') && filled.includes("data-doc-page"), "the others stay chips");
  assert.deepEqual(brought.files, [], "its icon is no file of the new report");
  assert.deepEqual(readOnlyTexts(filled), [], "and nothing in it is read-only");
}

{
  // A report's folder (its report.html, report.json and assets/), zipped or chosen together: one
  // page, the report; the files it shows are its own, even of a kind that is a page of its own
  // elsewhere (a CSV, a PDF, an HTML page), and whether the set has them before it or after it.
  const report = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>夹</title></head><body>
  <main class="doc-page" data-doc-id="folder">
    <header class="doc-header">
      <h1 class="doc-title">夹</h1>
    </header>
    <p><a href="assets/data.csv" download>数据</a></p>
    <figure class="doc-embed doc-embed--file"><iframe class="doc-embed-frame" src="assets/page.html" loading="lazy"></iframe><figcaption></figcaption></figure>
    <figure class="doc-embed doc-embed--file"><iframe class="doc-embed-frame" src="assets/doc.pdf" loading="lazy"></iframe><figcaption></figcaption></figure>
  </main>
</body></html>`;
  const files = [
    { name: "folder/assets/data.csv", data: "名,数\n甲,1\n" },
    { name: "folder/assets/doc.pdf", data: "%PDF-1.4\n%%EOF\n" },
    { name: "folder/assets/page.html", data: "<!doctype html><title>嵌入页</title><p>嵌入的页面</p>" },
    { name: "folder/report.html", data: report },
    { name: "folder/report.json", data: '{ "title": "夹" }' },
  ];
  const zipped = await importFiles([await write("folder.zip", createZip(files))], scratch);
  const chosen = await importFiles(await Promise.all([...files].reverse().map(({ name, data }) => write(name.split("/").pop(), data))), scratch);
  for (const [{ pages }, what] of [[zipped, "zipped"], [chosen, "chosen together"]]) {
    assert.deepEqual(pages.map((page) => page.title), ["夹"], `${what}: one page, the report`);
    assert.deepEqual(pages[0].files.map((file) => file.name.replace(/-[0-9a-f]{12}/, "")).sort(), ["embed.html", "embed.pdf", "file.csv"], `${what}: its files`);
  }
  assert.deepEqual(chosen.skipped, ["report.json"], "only the file it does not show is skipped");
}

{
  // Markdown in a zip: folders say what is under what; a link alone in its paragraph to a page without a folder makes it a subpage too.
  const zip = await write("notes.zip", createZip([
    { name: "A.md", data: "# A\n\n[B](B.md)\n\n文字" },
    { name: "B.md", data: "B 的正文" },
    { name: "A/C.md", data: "C 的正文" },
    { name: "D.md", data: "独立" },
  ]));
  const { pages } = await importFiles([zip], scratch);
  const tree = (list) => list.map((page) => (page.children.length ? { [page.title]: tree(page.children) } : page.title));
  assert.deepEqual(tree(pages), [{ A: ["B", "C"] }, "D"], "linked first in link order, then by folder");
}

{
  // Word: headings, lists, a table, a picture, a link.
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
  const docx = await write("文.docx", createZip([
    { name: "word/document.xml", data: `<w:document ${W}><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>章</w:t></w:r></w:p><w:p><w:r><w:rPr><w:b/></w:rPr><w:t>粗</w:t></w:r><w:hyperlink r:id="rId2"><w:r><w:t>链</w:t></w:r></w:hyperlink></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>项</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>A</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>B</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>2</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:drawing><a:blip xmlns:a="x" r:embed="rId3"/></w:drawing></w:r></w:p></w:body></w:document>` },
    { name: "word/_rels/document.xml.rels", data: '<Relationships><Relationship Id="rId2" Target="https://example.com/" TargetMode="External"/><Relationship Id="rId3" Target="media/i.png"/></Relationships>' },
    { name: "word/styles.xml", data: `<w:styles ${W}><w:style w:styleId="Heading1"><w:name w:val="heading 1"/></w:style></w:styles>` },
    { name: "word/numbering.xml", data: `<w:numbering ${W}><w:abstractNum w:abstractNumId="0"><w:lvl><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>` },
    { name: "word/media/i.png", data: PNG },
  ]));
  const [page] = (await importFiles([docx], scratch)).pages;
  const body = await mainOf(page);
  for (const part of [/<h1>章<\/h1>/, /<p><strong>粗<\/strong><a href="https:\/\/example.com\/">链<\/a><\/p>/, /<ol>\s*<li>项<\/li>\s*<\/ol>/, /<table class="doc-table">/, /<img src="assets\/image-[0-9a-f]{12}\.png" alt="">/]) assert.match(body, part, `the Word document: ${part}`);
  assert.equal(page.title, "文");
}

{
  // EPUB: its chapters in spine order, one page titled as the book.
  const epub = await write("书.epub", createZip([
    { name: "META-INF/container.xml", data: '<container><rootfiles><rootfile full-path="O/c.opf"/></rootfiles></container>' },
    { name: "O/c.opf", data: '<package><metadata><title>一本书</title></metadata><manifest><item id="b" href="t/2.xhtml"/><item id="a" href="t/1.xhtml"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>' },
    { name: "O/t/1.xhtml", data: "<html><body><h1>第一章</h1><p>甲</p></body></html>" },
    { name: "O/t/2.xhtml", data: "<html><body><h1>第二章</h1><p>乙</p></body></html>" },
  ]));
  const [page] = (await importFiles([epub], scratch)).pages;
  assert.equal(page.title, "一本书");
  assert.match(await mainOf(page), /<h1>第一章<\/h1>\s*<p>甲<\/p>\s*<h1>第二章<\/h1>\s*<p>乙<\/p>/, "chapters in the spine's order, their headings kept");
}

{
  // An empty page keeps the starter's empty paragraph; an emoji icon comes along.
  const text = await fillReport({ source: starter("空"), nodes: [], icon: "📄" });
  assert.match(text, /<div class="doc-icon">📄<\/div>\n\s*<h1 class="doc-title">空<\/h1>[\s\S]*<p><\/p>/);
}

process.env.GALLERY_DEFAULT_WORKSPACE = savedHome;
await fs.rm(root, { recursive: true, force: true });
console.log("transfer: ok");
