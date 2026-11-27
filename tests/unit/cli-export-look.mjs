import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { startProductionServer } from "../../src/server/production.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { findBrowser } from "../../src/transfer/browser.mjs";
import { readZip } from "../../src/transfer/zip.mjs";
import { USAGE } from "../../src/cli/usage.mjs";

// The commands that give an Agent what the workbench's dialogs give the user (decided 2026-11-11:
// 字体与布局 and 导出, then the custom emoji and 演示视图), each run as a user runs it:
//   gallery set --font/--size/--spacing/--width/--full/--all   the 字体与布局 menu: only the choices named written in
//       doc.json's look (a choice that is the default is a choice all the same), --all the user-level default
//   gallery export --format markdown|pdf|html (--paper, --scale, --no-files, --subpages, --folders, --out)   the
//       导出 dialog by the same function: <slug>.md/.pdf/.html in exports/ (a zip for subpages and files), the
//       offline file without --format as before
//   gallery emoji add|list and gallery set --icon <custom emoji>   the picker's library and its copy into a document
//   gallery open <document> --present   the address with ?present
// Run in a workspace and a data directory of their own; the server-side checks start a real production server
// in this process (as tests/unit/cli-settings.mjs does).

const run = promisify(execFile);
const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-export-look-"));
const workspace = path.join(root, "ws");
const data = path.join(root, "data");
const linesOf = (text) => text.trimEnd().split(/\r?\n/);
const gallery = async (args, env = {}) => {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, "--workspace", workspace, ...args], {
      cwd: root,
      timeout: 120000,
      env: { ...process.env, GALLERY_DEFAULT_WORKSPACE: workspace, GALLERY_DATA_DIR: data, GALLERY_NO_PREVIEW: "1", GALLERY_NO_BROWSER: "1", GALLERY_NO_AUTOSTART: "1", GALLERY_NO_UPDATE_CHECK: "1", GALLERY_NO_DEFAULT_TREE: "1", GALLERY_NO_PACKS: "1", GALLERY_NO_DEFAULT_HOME: "1", ...env },
    });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
const json = async (slug) => JSON.parse(await fs.readFile(path.join(workspace, slug, "doc.json"), "utf8"));
const exists = (file) => fs.access(file).then(() => true, () => false);
// A 1x1 PNG.
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const documentHtml = (slug, title, body) => `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body>
  <main class="doc-page" data-doc-id="${slug}">
    <header class="doc-header"><h1 class="doc-title">${title}</h1></header>
    <section class="doc-section"><h2>本周进展</h2>${body}</section>
  </main>
</body>
</html>
`;
const writeDocument = (slug, title, body) => fs.writeFile(path.join(workspace, slug, "doc.html"), documentHtml(slug, title, body));

let service = null;
const environment = { data: process.env.GALLERY_DATA_DIR, home: process.env.GALLERY_DEFAULT_WORKSPACE };
try {
  assert.equal((await gallery(["init", workspace])).code, 0);
  assert.equal((await gallery(["new", "weekly", "周报"])).code, 0);
  await writeDocument("weekly", "周报", "<p>完成了导出命令。</p><ul><li>Markdown</li><li>PDF</li></ul>");
  assert.equal((await gallery(["new", "other", "别的"])).code, 0);
  await writeDocument("other", "别的", "<p>另一篇。</p>");

  // ---------- gallery set: 字体与布局 ----------
  // Only the choices named are written; the document's other choices stay; a default named is a choice.
  const font = await gallery(["set", "weekly", "--font", "serif"]);
  assert.equal(font.code, 0, font.stderr);
  assert.deepEqual((await json("weekly")).look, { font: "serif" });
  assert.deepEqual(linesOf(font.stdout).slice(0, 2), ["Set weekly:", "  font: sans → serif (doc.json's look.font)"]);
  assert.ok(!/重读/.test(font.stdout), font.stdout);
  const more = await gallery(["set", "weekly", "--size", "large", "--spacing", "compact", "--width", "wide", "--full", "on"]);
  assert.equal(more.code, 0, more.stderr);
  assert.deepEqual((await json("weekly")).look, { font: "serif", size: "large", spacing: "compact", width: "wide", full: "full" }, "the font stays");
  assert.match(more.stdout, /  full width: off → on \(doc\.json's look\.full\)/);
  // 宽表格: --wide-tables on|off, look.tables "wide" or an explicit default.
  const wide = await gallery(["set", "weekly", "--wide-tables", "on"]);
  assert.equal(wide.code, 0, wide.stderr);
  assert.equal((await json("weekly")).look.tables, "wide");
  assert.match(wide.stdout, /  wide tables: off → on \(doc\.json's look\.tables\)/);
  const narrow = await gallery(["set", "weekly", "--wide-tables", "off"]);
  assert.equal(narrow.code, 0, narrow.stderr);
  assert.equal((await json("weekly")).look.tables, "default", "off is kept as the document's own choice");
  assert.match(narrow.stdout, /  wide tables: on → off/);
  const unwide = JSON.parse(await fs.readFile(path.join(workspace, "weekly", "doc.json"), "utf8"));
  delete unwide.look.tables;
  await fs.writeFile(path.join(workspace, "weekly", "doc.json"), `${JSON.stringify(unwide, null, 2)}\n`);
  const defaulted = await gallery(["set", "weekly", "--font", "sans", "--full", "off"]);
  assert.equal(defaulted.code, 0, defaulted.stderr);
  assert.deepEqual((await json("weekly")).look, { font: "sans", size: "large", spacing: "compact", width: "wide", full: "default" }, "a default is kept as a choice of the document's own");
  const same = await gallery(["set", "weekly", "--font", "sans"]);
  assert.deepEqual(linesOf(same.stdout), ["Nothing to change: weekly has that already."]);
  const fine = await gallery(["set", "weekly", "--title", "第二周周报", "--width", "narrow"]);
  assert.equal(fine.code, 0, fine.stderr);
  assert.equal((await json("weekly")).title, "第二周周报");
  assert.equal((await json("weekly")).look.width, "narrow", "with --title in one command");
  assert.deepEqual(Object.keys(await json("weekly")).slice(0, 3), ["title", "description", "type"], "the rest of doc.json as it was");
  // Mistakes: a value that is not a choice, no value, nothing to set, an unknown option: 2, nothing written.
  const before = await fs.readFile(path.join(workspace, "weekly", "doc.json"), "utf8");
  for (const args of [["--font", "bold"], ["--size", "huge"], ["--spacing", "tight"], ["--width", "full"], ["--full", "maybe"], ["--wide-tables", "wide"], ["--font"], [], ["--colour", "red"]]) {
    const refused = await gallery(["set", "weekly", ...args]);
    assert.equal(refused.code, 2, `${args.join(" ")}: ${refused.stderr}`);
  }
  assert.match((await gallery(["set", "weekly", "--font", "bold"])).stderr, /--font takes sans, serif, mixed, not bold\./);
  assert.equal(await fs.readFile(path.join(workspace, "weekly", "doc.json"), "utf8"), before, "a refused command writes nothing");
  assert.match((await gallery(["set", "nosuch", "--font", "serif"])).stderr, /No document "nosuch"/);
  // --all: the look the document shows is the user-level default of the documents with none of their own; theirs stay.
  assert.deepEqual((await json("other")).look, undefined);
  const everywhere = await gallery(["set", "other", "--size", "small", "--all"]);
  assert.equal(everywhere.code, 0, everywhere.stderr);
  assert.match(everywhere.stdout, /  all documents: size small \(the look every document shows that has no choice of its own for it; kept with the user's settings, no document's file; documents with their own choices keep them\)/);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(data, "appearance.json"), "utf8")), { look: { size: "small" } });
  assert.equal((await json("weekly")).look.size, "large", "a document with a choice of its own keeps it");
  assert.deepEqual((await json("other")).look, { size: "small" });
  const apply = await gallery(["set", "weekly", "--all"]);
  assert.equal(apply.code, 0, apply.stderr);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(data, "appearance.json"), "utf8")), { look: { size: "large", spacing: "compact", width: "narrow" } }, "--all alone applies the look the document shows");
  assert.equal((await gallery(["set", "weekly", "--all", "--font", "serif"])).code, 0);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(data, "appearance.json"), "utf8")).look.font, "serif", "--all after the choices named in the same command");
  assert.equal(USAGE.set.includes("--full on|off") && USAGE.set.includes("--wide-tables on|off") && USAGE.set.includes("--all") && USAGE.set.includes("custom emoji"), true);

  // ---------- gallery emoji, gallery set --icon <custom emoji> ----------
  assert.deepEqual(JSON.parse((await gallery(["emoji", "list", "--json"])).stdout), { workspace, emojis: [] });
  assert.match((await gallery(["emoji", "list"])).stdout, /No custom emoji yet/);
  const picture = path.join(root, "party.png");
  await fs.writeFile(picture, PNG);
  const added = await gallery(["emoji", "add", "Party Parrot", picture]);
  assert.equal(added.code, 0, added.stderr);
  assert.match(added.stdout, /Added the custom emoji party-parrot \(party\.png\)/);
  assert.match(added.stdout, /下一步：gallery set <document> --icon party-parrot /);
  const listed = JSON.parse((await gallery(["emoji", "list", "--json"])).stdout);
  assert.equal(listed.workspace, workspace);
  assert.equal(listed.emojis.length, 1);
  const [emoji] = listed.emojis;
  assert.deepEqual(Object.keys(emoji).sort(), ["created", "file", "id", "name", "path"]);
  assert.equal(emoji.name, "party-parrot");
  assert.equal(emoji.path, path.join(workspace, ".gallery", "emoji-library", emoji.file));
  assert.deepEqual(await fs.readFile(emoji.path), PNG, "the library holds the image");
  assert.equal(new Date(emoji.created).toISOString(), emoji.created);
  assert.match((await gallery(["emoji", "list"])).stdout, /1 custom emoji in .*\n {2}party-parrot {2}emoji-/);
  // Refused: a name taken, a standard emoji's name, a name with characters it does not take (2), a file that is no image, one that is not there.
  assert.match((await gallery(["emoji", "add", "party-parrot", picture])).stderr, /library has an emoji of that name already/);
  const standard = await gallery(["emoji", "add", "smile", picture]);
  assert.deepEqual([standard.code, standard.stderr.trim()], [1, "smile is the name of a standard emoji: a custom emoji takes another name."]);
  assert.equal((await gallery(["emoji", "add", "Bad!", picture])).code, 2);
  assert.equal((await gallery(["emoji", "add", "one"])).code, 2);
  assert.equal((await gallery(["emoji", "add", "x".repeat(50), picture])).code, 2);
  const text = path.join(root, "not-an-image.png");
  await fs.writeFile(text, "hello");
  const refusedImage = await gallery(["emoji", "add", "not-image", text]);
  assert.deepEqual([refusedImage.code, /not an image/.test(refusedImage.stderr)], [1, true]);
  const absent = await gallery(["emoji", "add", "nothing", path.join(root, "absent.png")]);
  assert.deepEqual([absent.code, /No image .*absent\.png/.test(absent.stderr)], [1, true]);
  assert.equal(JSON.parse((await gallery(["emoji", "list", "--json"])).stdout).emojis.length, 1, "nothing was added");
  assert.equal((await gallery(["emoji", "bogus"])).code, 2);
  // set --icon takes the emoji's name (:name: too): its image is copied into the document's assets/ as the picker copies it.
  const iconed = await gallery(["set", "weekly", "--icon", ":party-parrot:"]);
  assert.equal(iconed.code, 0, iconed.stderr);
  const icon = (await json("weekly")).icon;
  assert.match(icon, /^assets\/icon-[a-f0-9]{12}\.png$/);
  assert.deepEqual(await fs.readFile(path.join(workspace, "weekly", ...icon.split("/"))), PNG);
  assert.match(await fs.readFile(path.join(workspace, "weekly", "doc.html"), "utf8"), new RegExp(`<div class="doc-icon"><img src="${icon.replace(".", "\\.")}" alt=""></div>`));
  assert.equal((await gallery(["set", "other", "--icon", "party-parrot"])).code, 0, "by the name alone too");
  const unknown = await gallery(["set", "weekly", "--icon", "no-such-emoji"]);
  assert.deepEqual([unknown.code, /or the name of a custom emoji: gallery emoji list lists them/.test(unknown.stderr)], [2, true]);
  assert.equal((await json("weekly")).icon, icon, "a name that is none changes nothing");
  assert.equal((await gallery(["set", "weekly", "--icon", "🎯"])).code, 0, "an emoji as before");

  // ---------- gallery export --format ----------
  // The offline file as before: no --format, or --format html alone.
  const offline = await gallery(["export", "weekly"]);
  assert.equal(offline.code, 0, offline.stdout + offline.stderr);
  const offlinePath = path.join(workspace, "exports", "weekly.html");
  assert.ok(linesOf(offline.stdout).includes(`离线文件（用户要文件时再给）：${offlinePath}`));
  assert.match(offline.stdout, /Exported .*weekly\.html \([\d,]+ bytes, sha256 [a-f0-9]{64}\)/);
  const offlineBytes = await fs.readFile(offlinePath);
  const html = await gallery(["export", "weekly", "--format", "html"]);
  assert.equal(html.code, 0, html.stdout + html.stderr);
  assert.ok(linesOf(html.stdout).includes(`离线文件（用户要文件时再给）：${offlinePath}`), "--format html alone is the offline file");
  assert.deepEqual(await fs.readFile(offlinePath), offlineBytes);
  // Markdown: exports/<slug>.md, the hand-in said as the offline file's is.
  const markdown = await gallery(["export", "weekly", "--format", "markdown"]);
  assert.equal(markdown.code, 0, markdown.stdout + markdown.stderr);
  const mdPath = path.join(workspace, "exports", "weekly.md");
  assert.equal(await fs.readFile(mdPath, "utf8"), "# 第二周周报\n\n## 本周进展\n\n完成了导出命令。\n\n- Markdown\n- PDF");
  assert.ok(linesOf(markdown.stdout).includes(`交给用户（Markdown）：${mdPath}`));
  assert.match(markdown.stdout, /Exported .*weekly\.md \(\d+ bytes\)/);
  assert.equal(linesOf(markdown.stdout).at(-1), `交给用户（Markdown）：${mdPath}`, "the deliverable last");
  // --out: another folder, made.
  const out = path.join(root, "out", "deep");
  const placed = await gallery(["export", "weekly", "--format", "markdown", "--out", out]);
  assert.equal(placed.code, 0, placed.stdout + placed.stderr);
  assert.ok(await exists(path.join(out, "weekly.md")));
  // A picture the page links: a zip, as the dialog downloads it (pages by their titles, files in assets/), or one file with --no-files.
  await fs.mkdir(path.join(workspace, "weekly", "assets"), { recursive: true });
  await fs.writeFile(path.join(workspace, "weekly", "assets", "chart.png"), PNG);
  await writeDocument("weekly", "第二周周报", '<p>看图。</p><figure><img src="assets/chart.png" alt="图"></figure>');
  const pictured = await gallery(["export", "weekly", "--format", "markdown"]);
  assert.equal(pictured.code, 0, pictured.stdout + pictured.stderr);
  const zipPath = path.join(workspace, "exports", "weekly.zip");
  assert.ok(linesOf(pictured.stdout).includes(`交给用户（Markdown 压缩包）：${zipPath}`), pictured.stdout);
  assert.deepEqual(readZip(await fs.readFile(zipPath)).map((file) => file.name).sort(), ["assets/chart.png", "第二周周报.md"]);
  assert.match(pictured.stdout, /holds 2 files: /);
  const bare = await gallery(["export", "weekly", "--format", "markdown", "--no-files", "--out", out]);
  assert.equal(bare.code, 0, bare.stdout + bare.stderr);
  assert.match(await fs.readFile(path.join(out, "weekly.md"), "utf8"), /^# 第二周周报/);
  // html without its files is never the offline file's name.
  const light = await gallery(["export", "weekly", "--format", "html", "--no-files"]);
  assert.equal(light.code, 0, light.stdout + light.stderr);
  const lightPath = path.join(workspace, "exports", "weekly-no-files.html");
  assert.ok(linesOf(light.stdout).includes(`交给用户（离线文件，不含文件和图片）：${lightPath}`), light.stdout);
  assert.deepEqual(await fs.readFile(offlinePath), offlineBytes, "the offline file is as it was");
  assert.ok((await fs.stat(lightPath)).size > 1000);
  // The options alone imply html: --out puts the offline file in the folder.
  const outHtml = await gallery(["export", "weekly", "--out", path.join(root, "out-html")]);
  assert.equal(outHtml.code, 0, outHtml.stdout + outHtml.stderr);
  assert.ok(await exists(path.join(root, "out-html", "weekly.html")));
  // Subpages: handed in and checked with it, flat or in folders; one the checks fail is exported all the same, as the
  // dialog's export does, what they found said as 问题： lines for the Agent to mend.
  assert.equal((await gallery(["new", "child", "子页", "--under", "weekly"])).code, 0);
  const starter = await gallery(["export", "weekly", "--format", "markdown", "--subpages"]);
  assert.equal(starter.code, 0, starter.stdout + starter.stderr);
  assert.match(starter.stdout, /问题：child 没通过检查（1 处），文件照写了，和界面的「导出」一样；改好后再导出一次：\n {2}- starter placeholder content/);
  assert.ok(!/问题：weekly/.test(starter.stdout), "the page above it passes, and is said as passing");
  assert.ok(await exists(zipPath), "the zip written with the subpage as it is");
  await writeDocument("child", "子页", "<p>子页的内容。</p>");
  await fs.rm(path.join(workspace, "exports", "weekly.zip"), { force: true });
  const flat = await gallery(["export", "weekly", "--format", "markdown", "--subpages", "--no-files"]);
  assert.equal(flat.code, 0, flat.stdout + flat.stderr);
  assert.deepEqual(readZip(await fs.readFile(zipPath)).map((file) => file.name).sort(), ["子页.md", "第二周周报.md"], "flat: all at the top");
  const folders = await gallery(["export", "weekly", "--format", "markdown", "--subpages", "--folders", "--no-files"]);
  assert.equal(folders.code, 0, folders.stdout + folders.stderr);
  assert.deepEqual(readZip(await fs.readFile(zipPath)).map((file) => file.name).sort(), ["第二周周报.md", "第二周周报/子页.md"], "folders: the subpages in a folder named as the page");
  assert.match(await fs.readFile(path.join(workspace, "child", "doc.html"), "utf8"), /data-block-id=/, "the subpage was handed in with it: every block has an id");
  // A document the checks fail: the offline file is not written (as before); --format writes its file as the dialog
  // does, the checks' findings said as 问题： lines, exit 0.
  assert.equal((await gallery(["new", "draft", "草稿"])).code, 0);
  const offlineFailed = await gallery(["export", "draft"]);
  assert.equal(offlineFailed.code, 1);
  assert.match(offlineFailed.stderr, /FAIL draft: 1 problem/);
  assert.equal(await exists(path.join(workspace, "exports", "draft.html")), false);
  const failed = await gallery(["export", "draft", "--format", "markdown"]);
  assert.equal(failed.code, 0, failed.stdout + failed.stderr);
  assert.match(failed.stdout, /问题：draft 没通过检查（1 处）/);
  assert.ok(linesOf(failed.stdout).includes(`交给用户（Markdown）：${path.join(workspace, "exports", "draft.md")}`), failed.stdout);
  assert.equal(await exists(path.join(workspace, "exports", "draft.md")), true);
  assert.equal((await gallery(["export", "draft", "--format", "markdown", "--allow-failures"])).code, 0, "--allow-failures as before");
  // Mistakes (2): a format that is none, options that do not go with it, a value out of range.
  for (const args of [["--format", "docx"], ["--format", "markdown", "--paper", "A4"], ["--format", "html", "--scale", "100"], ["--paper", "A4"], ["--format", "pdf", "--paper", "A9"], ["--format", "pdf", "--scale", "10"], ["--format", "pdf", "--scale", "200"], ["--format", "pdf", "--scale", "abc"], ["--folders"], ["--format", "markdown", "--folders"], ["--format"]]) {
    const refused = await gallery(["export", "weekly", ...args]);
    assert.equal(refused.code, 2, `${args.join(" ")}: ${refused.stdout}${refused.stderr}`);
  }
  assert.match((await gallery(["export", "weekly", "--format", "pdf", "--scale", "200"])).stderr, /--scale takes a percentage above 10 and below 200/);
  assert.match((await gallery(["export", "weekly", "--format", "pdf", "--paper", "A9"])).stderr, /--paper takes A4, A3, Letter, Legal, Tabloid, not A9\./);
  // PDF: Chrome or Edge prints it (this test says so, and skips, where there is none).
  if (findBrowser()) {
    const pdf = await gallery(["export", "weekly", "--format", "pdf", "--paper", "letter", "--scale", "90"]);
    assert.equal(pdf.code, 0, pdf.stdout + pdf.stderr);
    const pdfPath = path.join(workspace, "exports", "weekly.pdf");
    assert.equal((await fs.readFile(pdfPath)).subarray(0, 5).toString("latin1"), "%PDF-");
    assert.equal(linesOf(pdf.stdout).at(-1), `交给用户（PDF）：${pdfPath}`);
    const a3 = await gallery(["export", "weekly", "--format", "pdf", "--paper", "A3", "--out", out]);
    assert.equal(a3.code, 0, a3.stdout + a3.stderr);
    assert.ok(await exists(path.join(out, "weekly.pdf")));
    // the page size of the paper asked for: Letter is 612 x 792 points, A3 842 x 1191
    const mediaBox = async (file) => /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec((await fs.readFile(file)).toString("latin1")) ?? [];
    const [, letterWidth, letterHeight] = await mediaBox(pdfPath);
    const [, a3Width, a3Height] = await mediaBox(path.join(out, "weekly.pdf"));
    if (letterWidth) {
      assert.deepEqual([Math.round(letterWidth), Math.round(letterHeight)], [612, 792]);
      assert.deepEqual([Math.round(a3Width), Math.round(a3Height)], [842, 1191]);
    }
    const startedAt = Date.now();
    await gallery(["export", "weekly", "--format", "pdf"]);
    assert.ok(Date.now() - startedAt < 40000, "the command ends when the PDF is made: the browser is not left to its idle minute");
  } else console.log("No Chrome or Edge here: gallery export --format pdf not run.");

  // ---------- with the shared server running ----------
  // set goes through its queue (the page open in the browser hears "look" at once); open --present gives the address.
  // (it announces itself in the data directory this process uses: the commands' own, so that they find it)
  process.env.GALLERY_DATA_DIR = data;
  process.env.GALLERY_DEFAULT_WORKSPACE = workspace;
  const logging = { log() {}, warn() {}, error: console.error };
  service = await startProductionServer({ reportsDirectory: workspace, port: 0, web: null, signals: false, log: logging });
  const heard = [];
  const events = http.get({ host: "127.0.0.1", port: service.port, path: "/__gallery/events?slug=weekly", headers: { Host: `127.0.0.1:${service.port}` } }, (response) => {
    response.setEncoding("utf8");
    response.on("data", (chunk) => heard.push(chunk));
  });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const viaServer = await gallery(["set", "weekly", "--font", "mixed", "--spacing", "loose"]);
  assert.equal(viaServer.code, 0, viaServer.stdout + viaServer.stderr);
  assert.equal((await json("weekly")).look.font, "mixed");
  assert.equal((await json("weekly")).look.spacing, "loose");
  for (let waited = 0; !heard.join("").includes("look") && waited < 5000; waited += 100) await new Promise((resolve) => setTimeout(resolve, 100));
  assert.match(heard.join(""), /data: look/, "the server told the open page, which changes its look at once");
  events.destroy();
  const viaMarkdown = await gallery(["export", "weekly", "--format", "markdown", "--no-files"]);
  assert.equal(viaMarkdown.code, 0, viaMarkdown.stdout + viaMarkdown.stderr);
  const present = await gallery(["open", "weekly", "--present", "--no-browser"]);
  assert.equal(present.code, 0, present.stdout + present.stderr);
  const address = linesOf(present.stdout).find((line) => line.startsWith("交给用户"));
  assert.match(address, new RegExp(`^交给用户（现在就把这个地址给用户；用 Chrome、Edge 或桌面版 Safari 打开）：http://127\\.0\\.0\\.1:${service.port}/\\?present#`), address);
  const plain = await gallery(["open", "weekly", "--no-browser"]);
  assert.equal(linesOf(plain.stdout).find((line) => line.startsWith("交给用户")), address.replace("/?present#", "/#"), "the same address without ?present");
  for (const args of [["--present"], ["weekly", "--present", "--settings", "extensions"]]) {
    const refused = await gallery(["open", ...args, "--no-browser"]);
    assert.equal(refused.code, 2, `${args.join(" ")}: ${refused.stderr}`);
  }
  assert.equal(USAGE.open.includes("--present"), true);
  console.log("Checked gallery set's look, gallery emoji, gallery export --format and gallery open --present.");
} finally {
  await service?.close();
  for (const [key, value] of [["GALLERY_DATA_DIR", environment.data], ["GALLERY_DEFAULT_WORKSPACE", environment.home]]) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  await fs.rm(root, { recursive: true, force: true });
}
