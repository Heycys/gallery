import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { JSDOM } from "jsdom";
import { GLANCE, UNIT_COMPONENT } from "../../src/editor/components/registry.mjs";
import { pageId } from "../../src/shared/page-links.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { registryFile, workspaceId } from "../../src/shared/workspace-registry.mjs";
import { readArguments } from "../../src/cli/read.mjs";
import { UsageError } from "../../src/cli/arguments.mjs";
import { FORMATS, VIEWS, allOf, fullRows, nodesOf, openForReading, unwritten, viewOf } from "../../src/transfer/read-view.mjs";

// gallery read (src/cli/read.mjs, src/transfer/read-view.mjs; docs/internals.md "Reading a document";
// added 2026-11-14). Every kind of unit the editor knows has a way the default
// view writes it (VIEWS), and every row of "Blocks at a glance" a mark of it in the view of
// skills/gallery/references/example-report.html, which shows each block once: a kind or a row added later fails here
// until it has one. The default view of that report, as an Agent writes it (natural HTML) and as an
// export leaves it (the kit's markup, an id for every block), holds every unit (none unwritten), every
// id of the file in its left column, and every word of the file's <main>, and ends saying so; then
// each format (markdown with its note of what it left out, text, html as the file's own text, json),
// the outline, the map, one block (by --block and by an address naming it), a section (by id, by a
// heading's words, by a block in it; two headings of those words refused), a custom block instance
// with its data and its slot's blocks, a table's merged cells, another workspace's document by its
// ~ws address and a document by its path, a page whose edits the server has not saved (a 提示 line,
// "unsaved" in the JSON), the mistakes of the command line (2) and what is not there (1); the
// workspace and the machine's registry byte for byte the same after all of it.

const run = promisify(execFile);
const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-read-"));
const quiet = { GALLERY_NO_PREVIEW: "1", GALLERY_NO_BROWSER: "1", GALLERY_NO_UPDATE_CHECK: "1", GALLERY_CACHE_DIR: path.join(root, "cache") };
const gallery = async (args, { workspace, env = {} } = {}) => {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, ...(workspace ? ["--workspace", workspace] : []), ...args], { cwd: root, timeout: 120000, maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...quiet, ...env } });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
async function digestOf(directory) {
  const hash = createHash("sha256");
  const walk = async (folder) => {
    for (const entry of (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) await walk(full);
      else hash.update(`${path.relative(directory, full)}\n`).update(await fs.readFile(full));
    }
  };
  await walk(directory);
  return hash.digest("hex");
}
const fileDigest = (file) => fs.readFile(file).then((bytes) => createHash("sha256").update(bytes).digest("hex"), () => null);
const squeezed = (text) => text.replace(/\s+/g, " ").trim();

try {
  // ---------- every kind has its way, every glance row its mark ----------
  {
    const kinds = Object.keys(UNIT_COMPONENT);
    for (const kind of kinds) assert.ok(VIEWS[kind]?.name && typeof VIEWS[kind].rows === "function", `gallery read writes ${kind}: give its definition (src/editor/components/${UNIT_COMPONENT[kind]}/index.mjs) a \`read\` with its name and rows (registry.mjs says what it holds)`);
    for (const [kind, read] of Object.entries(VIEWS)) for (const field of ["label", "title", "words", "data", "lost", "alone"]) assert.ok(read[field] === undefined || typeof read[field] === "function", `${kind}'s read.${field} is a function`);
    assert.deepEqual(FORMATS, ["full", "markdown", "text", "html", "json"], "the default first");
  }
  // What the default view of the example report shows of each row of "Blocks at a glance".
  const MARKS = {
    "开头概括": "┌─ 开头概括",
    "文本": "段落：正文的一段",
    "标题 2–4": "#### 待办事项",
    "符号列表": "── 符号列表",
    "编号列表": "── 编号列表",
    "引用块": "> 引用块：照录的原话。",
    "待办事项": "- [x] 做完的一项",
    "分割线": "│ ---",
    "折叠列表": "┌─ 折叠列表：折叠块",
    "代码块": "── 代码块 · python ·「代码块：标题写文件名或用途」",
    "公式块": "r = \\frac{a}{b}",
    "a formula in a line": "$r = a / b$",
    "表格": "| 类别 | 数值 |",
    "多维表格": "┌─ 多维表格 · 4 列 · 3 条记录",
    "图片": "![一张示意图](assets/picture.png)",
    "小字": "{.doc-note}",
    "提示块": "┌─ 提示块",
    "高亮块": "┌─ 高亮块",
    "步骤流程图": "┌─ 步骤流程图 · 3 步",
    "选项卡": "┌─ 选项卡「第一页」",
    "分栏": "┌─ 分栏 · 2 栏",
    "详情卡片": "┌─ 详情卡片 #detail-card · 由第 79 行的「详情卡片」打开",
    "文件": "[数据.csv](assets/data.csv)",
    "嵌入": "┌─ 嵌入",
    "网页书签": "[网页书签](https://example.com/)",
    "颜色": "{.doc-highlight-yellow}",
    "图表": "\"from\": 12",
    "图 (示意图、时间线)": "<svg class=\"branch\"",
    "整体块": "┌─ 整体块 <div> {.metric-strip}",
  };
  const glanced = GLANCE.flat().map((part) => part.name);
  assert.deepEqual(glanced.filter((name) => !MARKS[name]), [], "each row of \"Blocks at a glance\" has its mark here (a row added later: say what gallery read shows of it)");

  // ---------- a workspace: the example as an Agent writes it, the same handed in, two of the test's own ----------
  const workspace = path.join(root, "workspace");
  assert.equal((await gallery(["init", workspace])).code, 0);
  const example = await fs.readFile(path.join(projectRoot, "skills", "gallery", "references", "example-report.html"), "utf8");
  const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  for (const slug of ["example", "handed"]) {
    const folder = path.join(workspace, slug);
    await fs.mkdir(path.join(folder, "assets"), { recursive: true });
    await fs.writeFile(path.join(folder, "doc.html"), example.replace(/data-doc-id="[^"]*"/, `data-doc-id="${slug}"`));
    await fs.writeFile(path.join(folder, "doc.json"), `${JSON.stringify({ title: "块的写法", description: "每种块一次", type: "report", icon: "🧱" })}\n`);
    await fs.writeFile(path.join(folder, "assets", "picture.png"), PNG);
    await fs.writeFile(path.join(folder, "assets", "data.csv"), "a,b\n1,2\n");
    await fs.writeFile(path.join(folder, "assets", "embed.html"), "<p>embed</p>");
  }
  const exported = await gallery(["export", "handed"], { workspace });
  assert.equal(exported.code, 0, exported.stdout + exported.stderr);
  const mixed = path.join(workspace, "mixed");
  await fs.mkdir(mixed);
  await fs.writeFile(path.join(mixed, "doc.json"), `${JSON.stringify({ title: "混合" })}\n`);
  await fs.writeFile(path.join(mixed, "doc.html"), `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><title>混合</title></head>
<body>
  <main class="doc-page" data-doc-id="mixed">
    <header class="doc-header"><h1 class="doc-title">混合</h1></header>
    <h2 data-block-id="aaaa0001">背景</h2>
    <p data-block-id="aaaa0002" class="doc-align-center">居中的一段，<u>下划线</u>、H<sub>2</sub>O、<span class="doc-text-red">红字</span>，链到<a href="../example/doc.html">另一篇</a>。</p>
    <div class="doc-table-wrap" data-block-id="aaaa0004">
      <table class="doc-table">
        <thead><tr><th>项</th><th>一季度</th><th>二季度</th></tr></thead>
        <tbody>
          <tr><td rowspan="2">收入</td><td colspan="2" class="doc-highlight-green">合计 30</td></tr>
          <tr><td data-sort-value="12">12</td><td>18</td></tr>
        </tbody>
      </table>
    </div>
    <h2 data-block-id="aaaa0005">背景</h2>
    <div data-doc-component="local/kpi" data-block-id="aaaa0006">
      <script type="application/json">{ "value": 42, "label": "转化率" }</script>
      <p class="kpi-label">转化率</p>
      <div data-doc-slot="body">
        <p data-block-id="aaaa0007">槽里的一段。</p>
      </div>
    </div>
    <p data-block-id="aaaa0008">最后一段。</p>
  </main>
</body>
</html>
`);
  // Another workspace, registered on the machine's registry (gallery list registers the one it lists).
  const other = path.join(root, "other");
  assert.equal((await gallery(["init", other])).code, 0);
  await fs.mkdir(path.join(other, "far"));
  await fs.writeFile(path.join(other, "far", "doc.html"), "<!doctype html><html><body><main class=\"doc-page\" data-doc-id=\"far\"><header class=\"doc-header\"><h1 class=\"doc-title\">远处</h1></header><p data-block-id=\"farr0001\">别处的一段。</p></main></body></html>\n");
  await fs.writeFile(path.join(other, "far", "doc.json"), "{\"title\":\"远处\"}\n");
  assert.equal((await gallery(["list"], { workspace: other })).code, 0);

  const handedFile = path.join(workspace, "handed", "doc.html");
  const handed = await fs.readFile(handedFile, "utf8");
  const ids = [...handed.matchAll(/data-block-id="([^"]+)"/g)].map((match) => match[1]);
  assert.ok(ids.length > 80, "the export gave every block an id");
  const idOf = (pattern) => new RegExp(`<[a-z0-9]+ data-block-id="([a-z0-9]+)"[^>]*>${pattern}`).exec(handed)?.[1];
  const paragraphId = /<p data-block-id="([a-z0-9]+)">段落：/.exec(handed)?.[1];
  const listsId = idOf("列表</h3>");
  assert.ok(paragraphId && listsId, "the handed-in file's ids for a paragraph and a heading");

  const before = await digestOf(workspace);
  const otherBefore = await digestOf(other);
  const registryBefore = await fileDigest(registryFile());

  // ---------- the server's page with edits not saved: a server of the test's own ----------
  const data = path.join(root, "server-data");
  await fs.mkdir(data, { recursive: true });
  const token = "read-test-token";
  const server = http.createServer((request, response) => {
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/__gallery/workspace/info") return response.end(JSON.stringify({ token, server: { pid: process.pid, home: workspace, data: path.resolve(data) } }));
    if (request.url === "/__gallery/workspace/status" && request.headers["x-gallery-token"] === token) return response.end(JSON.stringify({ ok: true, open: [{ kind: "document", slug: "handed", file: handedFile, save: "pending", conflicts: 0 }] }));
    response.statusCode = 404;
    response.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  await fs.writeFile(path.join(data, "server.json"), `${JSON.stringify({ port: server.address().port, pid: process.pid, home: workspace, token, nonce: "n", kind: "dev", version: "0.0.0", started: new Date().toISOString() })}\n`);

  const read = (args, options = {}) => gallery(["read", ...args], { workspace, ...options });
  const address = `http://127.0.0.1:8080/#块的写法-${pageId("handed")}/${paragraphId}`;
  const [natural, full, markdown, text, html, json, outline, map, section, sectionByWords, sectionOfBlock, block, blockHtml, byAddress, instance, ambiguous, missing, noBlock, far, byPath, ...mistakes] = await Promise.all([
    read(["example"]),
    read(["handed"]),
    read(["handed", "--format", "markdown"]),
    read(["handed", "--format", "text"]),
    read(["handed", "--format", "html"]),
    read(["handed", "--json"]),
    read(["handed", "--outline"]),
    read(["handed", "--map"]),
    read(["handed", "--section", listsId]),
    read(["handed", "--section", "列表"]),
    read(["handed", "--section", idOf("待办事项</h4>")]),
    read(["handed", "--block", paragraphId]),
    read(["handed", "--block", paragraphId, "--format", "html"]),
    read([address]),
    read(["mixed"]),
    read(["mixed", "--section", "背景"]),
    read(["nope"]),
    read(["handed", "--block", "zzzzzzzz"]),
    read([`~${workspaceId(other)}/far`]),
    read([path.join(other, "far", "doc.html")]),
    read(["handed", "--outline", "--map"]),
    read(["handed", "--format", "bogus"]),
    read(["@home"]),
    read(["handed", "mixed"]),
    read(["handed", "--outline", "--format", "markdown"]),
    read(["handed", "--json", "--format", "text"]),
  ]);
  // Asked of the test's own server once the commands above are done: two dozen started at once hold this process
  // (the server's) up to about 3 s on Windows, as long as gallery read waits for a server to answer.
  const [unsaved, unsavedJson] = await Promise.all([
    read(["handed"], { env: { GALLERY_DATA_DIR: data } }),
    read(["handed", "--json"], { env: { GALLERY_DATA_DIR: data } }),
  ]);
  server.close();

  // ---------- the default view: everything, by id and by content ----------
  const lastLine = (output) => output.trimEnd().split("\n").at(-1);
  for (const [name, result] of [["as an Agent writes it", natural], ["handed in", full]]) {
    assert.equal(result.code, 0, `${name}: ${result.stderr}`);
    assert.match(lastLine(result.stdout), /^全部 \d+ 块都在上面，没有省略。$/, `${name}: it says it is whole`);
    for (const [row, mark] of Object.entries(MARKS)) assert.ok(result.stdout.includes(mark), `${name}: "${row}" shows as ${mark}`);
    assert.ok(result.stdout.startsWith("🧱 块的写法（") && result.stdout.includes("说明：每种块一次") && /页面自己的：样式 第 7–55 行；脚本 第 \d+–\d+ 行（定义图表 slope、lollipop）/.test(result.stdout), `${name}: its head`);
  }
  assert.ok(natural.stdout.includes("提示：文件里有 Agent 写的普通 HTML") && !full.stdout.includes("提示：文件里有 Agent 写的普通 HTML"), "natural HTML said, the kit's not");
  const gutter = new Set([...full.stdout.matchAll(/^\s*\d+ ([a-z][a-z0-9]{7}) │/gm)].map((match) => match[1]));
  assert.deepEqual(ids.filter((id) => !gutter.has(id)), [], "every data-block-id of the file in the left column");
  assert.ok(full.stdout.includes(` ${paragraphId} │ │ 段落：正文的一段，行内可以有**粗体**、\`行内代码\`、[链接](https://example.com/)、[高亮]{.doc-highlight-yellow}和[详情卡片](#detail-card)的链接。`), "a paragraph: its line, its id, its words with their marks");
  assert.ok(full.stdout.includes("┌─ 图形 · 图表 lollipop") && full.stdout.includes("图表 lollipop：画的是表格 t1 的行（第 122 行的表格）") && full.stdout.includes("── 表格 · 4 行 × 2 列 · 表头 1 行 · 图表从它画（数据键 t1）"), "a chart drawn from a table, and the table");
  assert.ok(full.stdout.includes("┌─ 选项卡区块「pages」 · 2 个选项卡") && full.stdout.includes("┌─ 选项卡「第二页」"), "tabs, tab by tab");
  // Every word of the page's <main> is in the view (a formula's TeX, without its delimiters).
  for (const [name, result, file] of [["as an Agent writes it", natural, path.join(workspace, "example", "doc.html")], ["handed in", full, handedFile]]) {
    const { window } = new JSDOM(await fs.readFile(file, "utf8"));
    // The view's right column, its boxes' bars and quotes' marks taken off, its lines run together.
    const shown = squeezed(result.stdout.split("\n").map((line) => line.replace(/^[^│]*│ ?/, "").replace(/^(?:│ ?|> ?)+/, "")).join("\n")).replace(/\$/g, "");
    const walker = window.document.createTreeWalker(window.document.querySelector("main"), 4);
    const left = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (node.parentElement.closest("style, template") || (node.parentElement.closest("script") && !/json/.test(node.parentElement.getAttribute("type") ?? ""))) continue;
      const words = squeezed(node.data.replace(/\\[()[\]]/g, ""));
      if (words && !shown.includes(words)) left.push(words);
    }
    assert.deepEqual(left, [], `${name}: every word of <main> is in the view`);
  }
  // Read in this process: every unit a row of its own, nothing the view gave up on.
  for (const slug of ["example", "handed"]) {
    const opened = await openForReading(await fs.readFile(path.join(workspace, slug, "doc.html"), "utf8"));
    const model = nodesOf(opened);
    const view = viewOf(opened, model, { folder: path.join(workspace, slug), workspace });
    const rows = fullRows(model.roots, view);
    assert.deepEqual(unwritten(rows, model.roots).map((node) => `${node.kind}@${node.line}`), [], `${slug}: every unit written`);
    assert.deepEqual(view.missing, [], `${slug}: nothing written as HTML for want of a way`);
    assert.ok(allOf(model.roots).filter((node) => node.type === "unit").every((node) => Number.isInteger(node.line)), `${slug}: every unit has its line`);
    assert.deepEqual([...new Set(allOf(model.roots).filter((node) => node.type === "unit").map((node) => node.kind))].sort(), Object.keys(UNIT_COMPONENT).filter((kind) => !["dialog", "installed"].includes(kind)).sort(), `${slug}: the example holds every kind but a dialog unit (its card is the <dialog>) and an instance (the mixed document's)`);
  }

  // ---------- the formats ----------
  assert.equal(markdown.code, 0);
  assert.ok(markdown.stdout.startsWith("# 块的写法\n") && markdown.stdout.includes("\n## 文字\n") && markdown.stdout.includes("| 类别 | 数值 |"), "the export's Markdown");
  const note = lastLine(markdown.stdout);
  assert.ok(/^<!-- gallery read --format markdown：导出用的 Markdown，写不出：.*完整的：gallery read handed -->$/.test(note) && ["图表 2 个", "图 3 个", "整体块 1 个", "选项卡区块 1 个", "分栏 1 个", "详情卡片 1 个", "嵌入 1 个", "小字 3 段"].every((said) => note.includes(said)), `it ends saying what it left out: ${note}`);
  assert.ok(text.code === 0 && text.stdout.includes("段落：正文的一段，行内可以有粗体、行内代码") && !text.stdout.includes("**") && !text.stdout.includes("┌─"), "text: the words alone");
  const main = /^[ \t]*<main[\s\S]*?<\/main>/m.exec(handed)[0];
  assert.equal(html.stdout, `${main}\n`, "html: the file's <main>, byte for byte");
  assert.equal(blockHtml.stdout, `${/^[ \t]*<p data-block-id="[a-z0-9]+">段落：.*$/m.exec(handed)[0]}\n`, "html of one block: its span of the file, its indentation with it");
  const parsed = JSON.parse(json.stdout);
  assert.deepEqual(Object.keys(parsed), ["document", "format", "mode", "part", "natural", "unsaved", "code", "blocks", "missing"]);
  assert.deepEqual([parsed.document.slug, parsed.document.title, parsed.document.file, parsed.natural, parsed.unsaved, parsed.part, parsed.missing], ["handed", "块的写法", handedFile, false, null, null, []]);
  assert.deepEqual(ids.filter((id) => !parsed.blocks.some((each) => each.id === id)), [], "json: every block by its id");
  const chart = parsed.blocks.find((each) => each.kind === "figure" && each.data.charts[0]?.type === "slope");
  assert.deepEqual(chart.data.charts[0].data[0], { label: "类别 A", from: 12, to: 15 }, "json: a chart's data, read");
  const firstParagraph = parsed.blocks.find((each) => each.id === paragraphId);
  assert.deepEqual([firstParagraph.kind, firstParagraph.line, firstParagraph.text.slice(0, 9), firstParagraph.markdown.slice(0, 14)], ["paragraph", 79, "段落：正文的一段，", "段落：正文的一段，行内可以有"]);
  assert.ok(firstParagraph.html.startsWith(`<p data-block-id="${paragraphId}">`) && parsed.blocks.every((each) => typeof each.n === "number" && "line" in each && Array.isArray(each.children)));

  // ---------- parts ----------
  assert.ok(outline.code === 0 && /^ *78 [a-z0-9]{8} │ 文字（h2，下面 27 块）$/m.test(outline.stdout) && /^ *99 [a-z0-9]{8} │     待办事项（h4，下面 3 块）$/m.test(outline.stdout) && outline.stdout.includes("标题 11 个"), outline.stdout);
  // Its databases after the headings, each with its id, the heading it follows and what it holds: read alone by --block.
  assert.ok(outline.stdout.includes("多维表格 1 个（只读一个：gallery read handed --block <id>）：") && /^ *\d+ [a-z0-9]{8} │ 「多维表格」下：4 列 · \d+ 条记录 · 视图：全部、按状态$/m.test(outline.stdout), `the outline lists the databases: ${outline.stdout}`);
  assert.ok(map.code === 0 && map.stdout.includes("98 块（读一块：gallery read handed --block <id>）") && /│   详情卡片  #detail-card$/m.test(map.stdout) && /│ +多维表格  4 列 · \d+ 条记录 · 视图：全部、按状态$/m.test(map.stdout), "the map: every block a line, a database by what it holds");
  assert.equal(section.code, 0);
  assert.ok(section.stdout.includes("### 列表") && section.stdout.includes("- [ ] 没做完的一项") && !section.stdout.includes("引用、提示") && lastLine(section.stdout) === "全部 13 块都在上面（标题「列表」的一节），没有省略。", section.stdout);
  assert.equal(sectionByWords.stdout, section.stdout, "a section by its heading's words");
  assert.ok(sectionOfBlock.stdout.includes("这里只有标题「待办事项」的一节"), "a heading's id, its own section");
  assert.ok(block.code === 0 && lastLine(block.stdout) === `全部 1 块都在上面（块 ${paragraphId}），没有省略。` && block.stdout.includes("这里只有块"), block.stdout);
  assert.equal(byAddress.stdout, block.stdout, "an address naming a block reads that block");
  assert.ok(instance.code === 0 && instance.stdout.includes("┌─ 自定义块 local/kpi") && instance.stdout.includes("{ \"value\": 42, \"label\": \"转化率\" }") && instance.stdout.includes("┌─ 内容区「body」") && instance.stdout.includes("槽里的一段。")
    && instance.stdout.includes("<div data-doc-slot=\"body\">…（内容区，块在下面）</div>"), "an instance: its block, data, own HTML and its slot's blocks");
  assert.ok(instance.stdout.includes("| 收入 {rowspan=\"2\"} | 合计 30 {colspan=\"2\" .doc-highlight-green} | ⟵ |") && instance.stdout.includes("| ↑ | 12 {data-sort-value=\"12\"} | 18 |"), "merged cells and a cell's look and data");
  assert.ok(instance.stdout.includes("居中的一段，<u>下划线</u>、H<sub>2</sub>O、[红字]{.doc-text-red}，链到[另一篇](../example/doc.html)。 {.doc-align-center}"), "what Markdown has no mark for, in the file's terms");
  assert.ok(ambiguous.code === 1 && ambiguous.stderr.includes("有 2 个标题是「背景」：aaaa0001 第 7 行「背景」；aaaa0005 第 18 行「背景」"), ambiguous.stderr);

  // ---------- documents named elsewhere, and what is not there ----------
  assert.ok(far.code === 0 && far.stdout.includes(path.join(other, "far", "doc.html")) && far.stdout.includes("farr0001 │ 别处的一段。"), `another workspace's document by its address: ${far.stderr}`);
  assert.equal(byPath.stdout, far.stdout, "the same by its path");
  assert.deepEqual([missing.code, missing.stderr.trim()], [1, "没有文档 nope：gallery list 列出所有文档。"], "a document that is not there, as gallery notes says it");
  assert.ok(noBlock.code === 1 && noBlock.stderr.includes("问题：这篇文档没有块 zzzzzzzz"), noBlock.stderr);
  assert.deepEqual(mistakes.map((result) => result.code), [2, 2, 2, 2, 2, 2], mistakes.map((result) => result.stderr).join("\n"));
  for (const [argv, said] of [[["x", "--outline", "--map"], "give one"], [["x", "--format", "bogus"], "No format bogus"], [["x", "y"], "Name one document"], [["x", "--block", "a", "--section", "b"], "give one"]]) {
    assert.throws(() => readArguments(argv), (error) => error instanceof UsageError && error.message.includes(said));
  }
  assert.deepEqual(readArguments(["x", "--json", "--map"]), { name: "x", format: "json", mode: "map", blockAsked: null, sectionAsked: null });

  // ---------- the server says the page is not saved ----------
  assert.ok(unsaved.code === 0 && unsaved.stdout.includes("提示：浏览器里这篇有修改还没保存：下面是文件里的样子，没有那些修改。"), unsaved.stdout + unsaved.stderr);
  assert.deepEqual(JSON.parse(unsavedJson.stdout).unsaved, { save: "pending", conflicts: 0 });

  // ---------- nothing written ----------
  assert.equal(await digestOf(workspace), before, "the workspace, byte for byte");
  assert.equal(await digestOf(other), otherBefore, "the other workspace, byte for byte");
  assert.equal(await fileDigest(registryFile()), registryBefore, "the registry: no workspace registered by a read");
  const elapsed = Math.round(performance.now() / 1000);
  console.log(`Checked gallery read: every kind (${Object.keys(VIEWS).length}) and glance row (${glanced.length}) written, the example's ${ids.length} blocks by id and every word of it, five formats, outline, map, a block, a section, an instance, merged cells, another workspace, an unsaved page, mistakes; nothing written (${elapsed}s).`);
} finally {
  await fs.rm(root, { recursive: true, force: true }).catch(() => {});
}
