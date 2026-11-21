// Usage: npm run test:release
// The npm package as a user gets it (docs/testing.md, "Release smoke test"): built (npm run
// release:build), packed (npm pack), installed globally into a prefix of its own under the OS temp
// folder (npm install -g with that prefix and an npm cache of its own: nothing goes into the user's
// global folder or npm cache, nothing is fetched when every dependency is bundled), then run there from
// a folder of its own, on a workspace of its own (GALLERY_WORKSPACE) and a port of 4241-4260, or of
// GALLERY_TEST_PORTS when set (GALLERY_PORT), the agents' homes, the update cache and the workspaces' registry of its own with npm's registry's check
// off (GALLERY_NO_UPDATE_CHECK) but once: --version (and its check of a registry of its own, dist/update-fetch.mjs), init (Gallery's two block packs installed, 柔光风格 off), new (its server started), a document written as an Agent writes one
// (skills/gallery/references/example-report.html), check, export (--allow-images, --embeds-as-links, --original-images too), read (its default view, Markdown and outline, the file left as it is), list (and list --all), workspaces, skill install --dir (the skill the package
// carries), open --no-browser, the server's routes, a
// page told of its document's change, new --under, move and set told on the workbench's stream and list --tree, the workbench and the document in Chrome or Edge (puppeteer, the
// repository's), a word typed in the page saved to doc.html, import of Markdown, Word and a PDF, a
// custom block started, checked, listed and shown (gallery block, and gallery component, its other
// name), one of Gallery's own added from the package's packs/, their instances in a document, served
// and exported, a gesture on an instance tried (block try), a custom page with a card of Gallery's note
// (page new, add right after block add, a picture of its own served, page try, page check), the 21
// acceptance checks of an Agent doing what the user can (parity-acceptance.mjs: trash, duplicate, copy, favorite, columns, pages, packs,
// export formats, look, notes, status, revert, history and the --json of the lists), qa, stop. The installed package's files are listed with their hashes before and compared after: nothing
// is written there (on macOS and Linux it is also made read-only for the run). It prints what npm
// packed and installed, what the package depends on (npm ls --all) and how long the commands took.
// Exit 0 when everything held; else the first failure, the temporary folder kept to look at.
import assert from "node:assert/strict";
import { extensionsAcceptance } from './extensions-acceptance.mjs';
import { parityAcceptance } from './parity-acceptance.mjs';
import { sandboxSmoke } from './sandbox-smoke.mjs';
import { restartSmoke } from './restart-smoke.mjs';
import { execSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { createZip } from "../../src/transfer/zip.mjs";
import { findBrowser } from "../../src/transfer/browser.mjs";
import { sweepStaleTemp } from "../sweep-temp.mjs";

const repository = path.resolve(import.meta.dirname, "..", "..");
sweepStaleTemp(); // what earlier runs left in the temporary folder (browser profiles and installs of killed runs)
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-smoke-"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(2)} MB`;
// A PNG `width` × `height` of stripes, as a screenshot of text is (well over the 16 KB an export leaves as it is).
const widePng = (width, height) => {
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const at = y * (width * 3 + 1) + 1 + x * 3;
      const ink = ((x >> 2) * 7 + (y >> 3) * 13) % 11 < 4;
      raw[at] = ink ? 40 : 250 - (x % 200);
      raw[at + 1] = ink ? 40 : 240 - (y % 180);
      raw[at + 2] = ink ? 47 : 230;
    }
  }
  const chunk = (type, data) => {
    const head = Buffer.alloc(4);
    head.writeUInt32BE(data.length);
    const tail = Buffer.alloc(4);
    tail.writeUInt32BE(zlib.crc32(Buffer.concat([Buffer.from(type), data])));
    return Buffer.concat([head, Buffer.from(type), data, tail]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
};
const times = [];
const timed = (what, ms) => times.push([what, ms]);
let server = null; // { pid } of the server started, stopped in the end whatever happened
let browser = null;

const until = async (test, what, ms = 15000) => {
  for (const end = Date.now() + ms; Date.now() < end; await sleep(100)) if (await test()) return;
  throw new Error(`not in ${ms} ms: ${what}`);
};
const free = (port) => new Promise((resolve) => {
  const probe = net.createServer();
  probe.once("error", () => resolve(false));
  probe.listen(port, "127.0.0.1", () => probe.close(() => resolve(true)));
});

try {
  // ---------- build, pack, install ----------
  const build = spawnSync(process.execPath, [path.join(repository, "src", "cli", "release-build.mjs")], { cwd: repository, encoding: "utf8" });
  assert.equal(build.status, 0, `release:build failed:\n${build.stdout}\n${build.stderr}`);
  process.stdout.write(build.stdout.split("\n").filter((line) => /^(release\/npm|npm pack)/.test(line)).map((line) => `${line}\n`).join(""));
  const packed = JSON.parse(execSync(`npm pack --json --ignore-scripts --pack-destination "${temp}"`, { cwd: path.join(repository, "release", "npm"), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }))[0];
  const tarball = path.join(temp, packed.filename);
  const prefix = path.join(temp, "prefix");
  const installStarted = Date.now();
  execSync(`npm install -g --prefix "${prefix}" --cache "${path.join(temp, "npm-cache")}" --no-audit --no-fund --loglevel=error "${tarball}"`, { cwd: temp, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  timed("npm install -g (the tarball)", Date.now() - installStarted);
  const windows = process.platform === "win32";
  const installed = windows ? path.join(prefix, "node_modules", "@heycys", "gallery") : path.join(prefix, "lib", "node_modules", "@heycys", "gallery");
  const shim = windows ? path.join(prefix, "gallery.cmd") : path.join(prefix, "bin", "gallery");
  const bin = path.join(installed, "bin", "gallery.mjs");
  assert.ok(fs.existsSync(bin) && fs.existsSync(shim), `installed at ${installed}, its command at ${shim}`);
  const dependencies = execSync(`npm ls -g --all --prefix "${prefix}"`, { cwd: temp, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

  // The package's files and their hashes, to see that nothing writes there; read-only where it can be.
  const filesOf = (directory) => fs.readdirSync(directory, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name)).sort()
    .map((file) => `${path.relative(directory, file)} ${createHash("sha256").update(fs.readFileSync(file)).digest("hex")}`);
  const before = filesOf(installed);
  const footprint = fs.readdirSync(prefix, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).reduce((sum, entry) => sum + fs.statSync(path.join(entry.parentPath, entry.name)).size, 0);
  if (!windows) execSync(`chmod -R a-w "${installed}"`);

  // ---------- the commands ----------
  const workspace = path.join(temp, "workspace");
  const cwd = path.join(temp, "elsewhere"); // a folder of no package: nothing resolves the repository's node_modules
  fs.mkdirSync(cwd);
  // The ports of GALLERY_TEST_PORTS ("4270-4316") when set, as the unit and browser tests take theirs
  // (another run of the tests may hold 4241-4260).
  const [low, high] = (/^(\d+)-(\d+)$/.exec(process.env.GALLERY_TEST_PORTS ?? "") ?? [0, 4241, 4260]).slice(1).map(Number);
  let port = null;
  for (let candidate = low; candidate <= high && port === null; candidate++) if (await free(candidate)) port = candidate;
  assert.ok(port, `a free port in ${low}-${high}`);
  // No command reads this user's skills or update cache, or asks npm (what gallery --version says after
  // the version): the agents' homes and the cache are the test's, the registry's check off but once, below.
  const env = {
    ...process.env, GALLERY_LANGUAGE: "zh", GALLERY_NO_AUTOSTART: "1", GALLERY_WORKSPACE: workspace, GALLERY_DEFAULT_WORKSPACE: workspace, GALLERY_PORT: String(port), GALLERY_NO_BROWSER: "1",
    CLAUDE_CONFIG_DIR: path.join(temp, "agents", "claude"), CODEX_HOME: path.join(temp, "agents", "codex"), GALLERY_CACHE_DIR: path.join(temp, "cache"), GALLERY_NO_UPDATE_CHECK: "1",
    GALLERY_DATA_DIR: path.join(temp, "data"), // the registry of workspaces: the test's, never the user's
  };
  delete env.GALLERY_NO_PREVIEW;
  // A command as the user runs it (node and the package's bin: the shim is checked once below), timed.
  const gallery = (args, { expect = [0], name = `gallery ${args.join(" ")}` } = {}) => {
    const started = Date.now();
    const result = spawnSync(process.execPath, [bin, ...args], { cwd, env, encoding: "utf8", timeout: 240_000 });
    const ms = Date.now() - started;
    timed(name, ms);
    assert.ok(expect.includes(result.status), `${name}: exit ${result.status}\n${result.stdout}\n${result.stderr}`);
    return { ...result, ms, ended: Date.now() };
  };

  // --version three times (the first may wait for the system to scan new files): each is said.
  for (let run = 1; run <= 3; run++) assert.equal(gallery(["--version"], { name: `gallery --version (run ${run})` }).stdout.trim(), packed.version);
  const quick = spawnSync(process.execPath, ["-e", "0"], { cwd });
  const nodeStarted = Date.now();
  spawnSync(process.execPath, ["-e", "0"], { cwd });
  timed("node -e 0 (Node's own start, for comparison)", Date.now() - nodeStarted);
  assert.equal(quick.status, 0);
  const viaShim = Date.now();
  const shimmed = spawnSync(windows ? `"${shim}" --version` : shim, windows ? [] : ["--version"], { cwd, env, encoding: "utf8", shell: windows });
  timed("gallery --version (npm's command shim)", Date.now() - viaShim);
  assert.equal(shimmed.stdout.trim(), packed.version, shimmed.stderr);
  // gallery --version's check of the registry as the package runs it (dist/update-fetch.mjs, started
  // detached, found beside the chunk that starts it): with the check on and a registry of the test's own
  // that says a newer version, the first run prints the version alone and returns, the check writes the
  // cache, and the next run says the newer version with what to run.
  {
    const registry = http.createServer((request, response) => response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ name: packed.name, version: "99.0.0" })));
    await new Promise((resolve) => registry.listen(0, "127.0.0.1", resolve));
    // npm's settings and the machine's proxies left out (the check honours both), its .npmrc files the test's: none.
    const checkOn = {
      ...Object.fromEntries(Object.entries(env).filter(([key]) => !/^npm_config_|proxy/i.test(key))),
      GALLERY_NO_UPDATE_CHECK: "", CI: "", NO_UPDATE_NOTIFIER: "", GALLERY_REGISTRY: `http://127.0.0.1:${registry.address().port}/`,
      npm_config_userconfig: path.join(temp, "no-npmrc"), npm_config_globalconfig: path.join(temp, "no-npmrc"),
    };
    try {
      const first = spawnSync(process.execPath, [bin, "--version"], { cwd, env: checkOn, encoding: "utf8" });
      assert.deepEqual([first.status, first.stdout.trim(), first.stderr], [0, packed.version, ""]);
      const cacheFile = path.join(env.GALLERY_CACHE_DIR, "update-check.json");
      // --version claims the check in the cache as it starts it (checking); the check's answer replaces that.
      const answer = () => {
        try {
          return JSON.parse(fs.readFileSync(cacheFile, "utf8"));
        } catch {
          return null;
        }
      };
      await until(() => answer()?.latest === "99.0.0", "gallery --version's check of the registry wrote its answer to the cache");
      const second = spawnSync(process.execPath, [bin, "--version"], { cwd, env: checkOn, encoding: "utf8" });
      const lines = second.stdout.trim().split(/\r?\n/);
      assert.ok(lines.length === 2 && lines[0] === packed.version && lines[1].startsWith("新版本：npm 上有 Gallery 99.0.0，") && lines[1].includes("npm i -g @heycys/gallery@^99.0.0"), second.stdout + second.stderr);
    } finally {
      registry.close();
    }
  }
  const initialized = gallery(["init"]).stdout;
  assert.ok(initialized.includes(workspace));
  assert.ok(fs.existsSync(path.join(workspace, "gallery.json")));
  // Gallery's two block packs, installed from the package's packs/ as the workspace is made (柔光风格 off).
  assert.ok(initialized.includes("块包：Gallery 风格 (gallery ") && initialized.includes("块包：柔光风格 (gallery-soft ") && fs.existsSync(path.join(workspace, "components", "gallery", "pack.json")), initialized);
  assert.equal(JSON.parse(fs.readFileSync(path.join(workspace, "gallery.json"), "utf8")).components?.packs?.["gallery-soft"]?.enabled, false, "柔光风格 switched off");

  const made = gallery(["new", "smoke", "冒烟测试", "说明"]);
  assert.match(made.stdout, new RegExp(`http://127\\.0\\.0\\.1:${port}/#冒烟测试`), made.stdout);
  assert.ok(!/Opened it in|Not opened in a browser/.test(made.stdout), `gallery new opens no browser, and says nothing of one, without --open\n${made.stdout}`);
  const announcement = JSON.parse(fs.readFileSync(path.join(temp, "data", "server.json"), "utf8"));
  server = { pid: announcement.pid };
  assert.deepEqual([announcement.port, announcement.kind, announcement.version], [port, "cli", packed.version]);
  const log = fs.readFileSync(path.join(temp, "data", "logs", "server.log"), "utf8");
  const spawned = Date.parse(/\[([0-9T:.\-]+Z)\] gallery new smoke/.exec(log)?.[1] ?? "");
  const listening = Date.parse(/\[gallery\] ([0-9T:.\-]+Z) listening/.exec(log)?.[1] ?? "");
  timed("server: started → listening (its log)", listening - spawned);
  timed("server: started → the document's page answered (gallery new waits for it)", made.ended - spawned);

  // The document as an Agent writes it: the Agent's reference, every kind of block, a chart drawn with d3 (its types checked).
  const folder = path.join(workspace, "smoke");
  const example = fs.readFileSync(path.join(repository, "skills", "gallery", "references", "example-report.html"), "utf8");
  fs.writeFileSync(path.join(folder, "doc.html"), example.replace(/data-doc-id="[^"]*"/, 'data-doc-id="smoke"'));
  fs.mkdirSync(path.join(folder, "assets"), { recursive: true });
  fs.writeFileSync(path.join(folder, "assets", "picture.png"), Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64"));
  fs.writeFileSync(path.join(folder, "assets", "data.csv"), "a,b\n1,2\n");
  fs.writeFileSync(path.join(folder, "assets", "embed.html"), "<p>embed</p>");
  const checked = gallery(["check", "smoke"]);
  assert.match(checked.stdout, /Checked 1 document: 1 passed/, checked.stdout);
  const exported = gallery(["export", "smoke"]);
  const deliverable = path.join(workspace, "exports", "smoke.html");
  assert.ok(exported.stdout.includes(deliverable) && fs.statSync(deliverable).size > 100_000, exported.stdout);
  // The export's options (src/cli/export.mjs) by the installed command: for another platform, pictures from an https
  // source its policy lets in and the embeds written as links, in a file of its own, the plain one still reaching
  // nothing; a source that is no https origin refused (exit 2); its pictures drawn lighter by the user's browser (the
  // bundle's encodePicture, run in a page), --original-images as they are. The 1px picture made a 2000px one for it, then put back.
  const web = gallery(["export", "smoke", "--allow-images", "https://cdn.example.com", "--embeds-as-links"]);
  const webFile = path.join(workspace, "exports", "smoke-web.html");
  const webText = fs.existsSync(webFile) ? fs.readFileSync(webFile, "utf8") : "";
  const plainText = fs.readFileSync(deliverable, "utf8");
  const cards = (html) => (html.match(/<a\b[^>]*class="doc-bookmark-card"/g) ?? []).length;
  const frames = (html) => (html.match(/<iframe\b[^>]*class="doc-embed-frame"/g) ?? []).length;
  assert.ok(web.stdout.includes(webFile) && webText.includes("img-src data: blob: https://cdn.example.com") && frames(plainText) > 0 && frames(webText) === 0 && cards(webText) === cards(plainText) + frames(plainText), web.stdout);
  assert.ok(!plainText.includes("cdn.example.com"), "the plain export lets no picture in from the net");
  assert.equal(gallery(["export", "smoke", "--allow-images", "https://cdn.example.com;script-src *"], { expect: [2] }).status, 2);
  const picture = path.join(folder, "assets", "picture.png");
  const small = fs.readFileSync(picture);
  const wide = widePng(2000, 600);
  fs.writeFileSync(picture, wide);
  const embedded = () => /<img src="data:(image\/\w+);base64,([^"]+)" alt="一张示意图"/.exec(fs.readFileSync(deliverable, "utf8"));
  const lighter = gallery(["export", "smoke"]);
  if (findBrowser()) assert.ok(embedded()?.[1] === "image/webp" && Buffer.from(embedded()[2], "base64").length < wide.length && /pictures: \d+ of \d+ made lighter/.test(lighter.stdout), lighter.stdout);
  else assert.ok(embedded()?.[1] === "image/png" && /no Chrome or Edge/.test(lighter.stdout), lighter.stdout);
  gallery(["export", "smoke", "--original-images"]);
  assert.ok(embedded()?.[1] === "image/png" && Buffer.from(embedded()[2], "base64").equals(wide), "--original-images: the PNG as it is");
  fs.writeFileSync(picture, small);
  gallery(["export", "smoke"]);
  assert.ok(gallery(["list"]).stdout.includes("smoke"));
  // The document as one reads it (gallery read: the view in the command's own process, jsdom and the editor's modules
  // bundled): every block, a chart with its data and the tabs among them; the Markdown and the outline; the file left as it is.
  const handedIn = fs.readFileSync(path.join(folder, "doc.html"));
  const readView = gallery(["read", "smoke"]).stdout;
  assert.ok(readView.includes("┌─ 图形 · 图表 slope") && readView.includes("┌─ 选项卡区块「pages」") && /全部 \d+ 块都在上面，没有省略。\s*$/.test(readView), readView);
  assert.ok(gallery(["read", "smoke", "--format", "markdown"]).stdout.startsWith("# "));
  assert.ok(gallery(["read", "smoke", "--outline"]).stdout.includes("标题 10 个"));
  assert.ok(fs.readFileSync(path.join(folder, "doc.html")).equals(handedIn), "gallery read writes nothing");
  // This machine's workspaces (the test's registry: its workspace, in the OS temp folder, listed as the
  // current one and never registered) and a search of the documents of them all.
  assert.ok(gallery(["workspaces"]).stdout.includes(workspace));
  assert.ok(gallery(["list", "smoke", "--all"]).stdout.includes(`工作区：${workspace}`));
  // The skill the package carries, written into a folder of the test's own (--dir: never an agent's
  // home), as the repository's skill:package makes it; a second run changes nothing.
  const skillTarget = path.join(temp, "skills", "gallery");
  const installedSkill = gallery(["skill", "install", "--dir", skillTarget]);
  assert.ok(installedSkill.stdout.includes(`Installed the Gallery skill ${packed.version}: ${skillTarget}`), installedSkill.stdout);
  const skillFiles = (directory) => fs.readdirSync(directory, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => path.relative(directory, path.join(entry.parentPath, entry.name)).split(path.sep).join("/")).sort();
  assert.deepEqual(skillFiles(skillTarget), skillFiles(path.join(installed, "skill")), "the package's skill/, file for file");
  assert.ok(fs.readFileSync(path.join(skillTarget, "SKILL.md"), "utf8").includes(`npm i -g @heycys/gallery@^${packed.version}`), "its SKILL.md asks for this version's range");
  assert.ok(!fs.existsSync(path.join(skillTarget, "src")) && !fs.existsSync(path.join(skillTarget, "package.json")), "a thin skill");
  assert.ok(gallery(["skill", "install", "--dir", skillTarget]).stdout.includes("is installed already, unchanged"));
  const opened = gallery(["open", "--no-browser"]);
  assert.ok(opened.stdout.includes(`http://127.0.0.1:${port}/`) && !/started now/.test(opened.stdout), `open reuses the server:\n${opened.stdout}`);

  // A second storage folder, reached through the same installed service.
  const project = path.join(temp, 'project');
  gallery(['init', project]);
  assert.deepEqual(fs.readdirSync(project), ['gallery.json']);
  const projectNew = gallery(['--workspace', project, 'new', 'smoke', '项目同名文档']);
  const projectId = /#~(ws-[a-f0-9]{6})\//.exec(projectNew.stdout)?.[1];
  assert.ok(projectId, projectNew.stdout);
  const projectBase = '/~' + projectId;
  const projectFile = path.join(project, 'smoke', 'doc.html');
  fs.writeFileSync(projectFile, '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>项目同名文档</title></head><body><main class="doc-page" data-doc-id="smoke"><header class="doc-header"><h1 class="doc-title">项目同名文档</h1></header><p>Project original words</p></main></body></html>');
  const sharedService = JSON.parse(fs.readFileSync(path.join(temp, 'data', 'server.json'), 'utf8'));
  assert.deepEqual([sharedService.pid, sharedService.port, sharedService.home], [server.pid, port, workspace]);
  assert.equal(fs.existsSync(path.join(project, '.gallery', 'server.json')), false);

  // ---------- the server ----------
  const origin = `http://127.0.0.1:${port}`;
  const get = async (pathname) => {
    const response = await fetch(origin + pathname);
    return { status: response.status, type: response.headers.get("content-type"), cache: response.headers.get("cache-control"), body: await response.text() };
  };
  const workbench = await get("/");
  assert.equal(workbench.status, 200);
  const script = /src="(\/assets\/[^"]+\.js)"/.exec(workbench.body)?.[1];
  assert.ok(script, workbench.body);
  assert.deepEqual([(await get(script)).status, (await get(script)).cache], [200, "max-age=31536000, immutable"]);
  const page = await get("/generated/smoke.html");
  assert.equal(page.status, 200);
  const editor = /\/__gallery\/edit\/v\/[a-f0-9]{16}\/src\/editor\/page\/editor\.mjs/.exec(page.body)?.[0];
  const kit = /\/kit\/runtime\.js\?v=[a-f0-9]{16}/.exec(page.body)?.[0];
  assert.ok(editor && kit, "the page names the editor and the kit by their stamps");
  for (const [pathname, type, cache] of [[editor, "text/javascript", "immutable"], [kit, "text/javascript", "immutable"], ["/kit/runtime.js", "text/javascript", "no-cache"], ["/vendor/katex/fonts/KaTeX_Main-Regular.woff2", "font/woff2", "no-cache"], ["/vendor/d3.v7.9.0.min.js", "text/javascript", "no-cache"], ["/__gallery/workspace/info", "application/json", "no-store"]]) {
    const answer = await get(pathname);
    assert.ok(answer.status === 200 && answer.type.startsWith(type) && answer.cache.includes(cache), `${pathname}: ${answer.status} ${answer.type} ${answer.cache}`);
  }
  // A page told of its document's change (the server's watcher, then the events channel).
  const events = await fetch(`${origin}/__gallery/events?slug=smoke`);
  const reader = events.body.getReader();
  let heard = "";
  const listen = (async () => {
    for (;;) {
      const { value, done } = await reader.read().catch(() => ({ done: true }));
      if (done) return;
      heard += new TextDecoder().decode(value);
    }
  })();
  await until(() => heard.includes("retry:"), "the events channel opened");
  const text = fs.readFileSync(path.join(folder, "doc.html"), "utf8");
  fs.writeFileSync(path.join(folder, "doc.html"), text.replace("</main>", "  <p>一段 Agent 加的话。</p>\n  </main>"));
  await until(() => /data: report [a-f0-9]+/.test(heard), "the page told of its document's change");
  await reader.cancel().catch(() => {});
  await listen;
  // The sidebar's tree on the release's server: gallery new --under and gallery move written through it
  // and told on its workbench's stream (?workspace), as gallery set's doc.json is; list --tree shows them.
  {
    const treeReader = (await fetch(`${origin}/__gallery/events?workspace`)).body.getReader();
    let told = "";
    const listening = (async () => {
      for (;;) {
        const { value, done } = await treeReader.read().catch(() => ({ done: true }));
        if (done) return;
        told += new TextDecoder().decode(value);
      }
    })();
    await until(() => told.includes("retry:"), "the workbench's stream opened");
    const count = () => (told.match(/^data: workspace \d+$/gm) ?? []).length;
    const under = gallery(["new", "smoke-child", "子文档", "--under", "smoke", "--no-browser"]);
    assert.match(under.stdout, /^Placed it under smoke \(.+\), the only document there\.$/m, under.stdout);
    await until(() => count() >= 1, "gallery new --under told the workbench");
    await sleep(400);
    const placed = count();
    const moved = gallery(["move", "smoke-child", "--top", "--first"]);
    assert.ok(moved.stdout.startsWith("Moved smoke-child (子文档): now at the top level, first;"), moved.stdout);
    await until(() => count() > placed, "gallery move written through the server, which told the workbench");
    await sleep(400);
    const before = count();
    assert.ok(gallery(["set", "smoke-child", "--title", "改名的子文档", "--icon", "📊"]).stdout.startsWith("Set smoke-child:"));
    await until(() => count() > before, "gallery set's doc.json told the workbench");
    const tree = gallery(["list", "--tree"]).stdout;
    assert.ok(/^ {2}smoke-child {2}📊 改名的子文档 {2}（/m.test(tree) && /^ {2}smoke {2}/m.test(tree), tree);
    await treeReader.cancel().catch(() => {});
    await listening;
  }

  // ---------- in the browser ----------
  const executablePath = findBrowser();
  // Install and enable a workbench/backend extension using the installed CLI and service.
  const extensionSource = path.join(temp, 'smoke-extension');
  fs.mkdirSync(extensionSource);
  fs.writeFileSync(path.join(extensionSource, 'extension.json'), JSON.stringify({ id:'smoke-extension', workbench:{script:'workbench.js'}, server:{command:['node','server.mjs']}, agent:'AGENT.md' }));
  fs.writeFileSync(path.join(extensionSource, 'AGENT.md'), 'Use /status to read this extension status.');
  fs.writeFileSync(path.join(extensionSource, 'workbench.js'), "export function activate(api){const b=document.createElement('button');b.id='smoke-extension-button';b.textContent='Extension smoke';api.slot('topbar-end').append(b);return ()=>b.remove();}");
  fs.writeFileSync(path.join(extensionSource, 'server.mjs'), "import http from 'node:http';http.createServer((req,res)=>res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify({pid:process.pid,path:req.url}))).listen(Number(process.env.GALLERY_EXTENSION_PORT),process.env.GALLERY_EXTENSION_HOST);");
  gallery(['extension', 'install', extensionSource]);
  assert.ok(gallery(['extension','list']).stdout.includes(path.join(workspace, 'extensions','smoke-extension','AGENT.md')));
  const info = JSON.parse((await get('/__gallery/workspace/info')).body);
  const capability = JSON.parse((await get('/__gallery/extensions')).body).extensions.find(item=>item.id==='smoke-extension');
  assert.equal(capability.enabled, false);
  const enabled = await fetch(origin+'/__gallery/extensions', {method:'POST',headers:{Origin:origin,'Content-Type':'application/json','X-Gallery-Token':info.token},body:JSON.stringify({id:capability.id,revision:capability.manifest.revision,enabled:true,confirmed:true})});
  assert.equal(enabled.status,200);
  const backend = await fetch(origin+'/__gallery/extensions/smoke-extension/api/status', {headers:{Origin:origin,'X-Gallery-Token':info.token}});
  assert.equal(backend.status,200);const extensionPid=(await backend.json()).pid;
  await extensionsAcceptance({ gallery, origin, token: info.token, workspace, temp });
  await sandboxSmoke({ bin, temp, env, origin, executablePath });
  let typed = false;
  if (executablePath) {
    const { default: puppeteer } = await import("puppeteer-core");
    browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-first-run", "--no-default-browser-check", ...(process.getuid?.() === 0 ? ["--no-sandbox"] : [])] });
    const errors = [];
    const tab = await browser.newPage();
    tab.on("pageerror", (error) => errors.push(error.message));
    const workbenchStarted = Date.now();
    await tab.goto(`${origin}/#smoke`, { waitUntil: "load" });
    await tab.waitForFunction(() => document.querySelector("iframe")?.contentDocument?.querySelector("[data-doc-ready]"), { timeout: 30000 });
    timed("the workbench with the document open (Chrome/Edge)", Date.now() - workbenchStarted);
    await tab.waitForSelector("#smoke-extension-button", {timeout:15000});
    await tab.goto(`${origin}/generated/smoke.html`, { waitUntil: "load" });
    await tab.waitForSelector("[data-doc-ready]", { timeout: 15000 });
    await tab.waitForSelector("html[data-ge-editing][data-ge-save]", { timeout: 15000 });
    await sleep(200);
    const placed = await tab.evaluate(() => {
      const host = [...document.querySelectorAll("[data-ge-block]")].find((node) => node.tagName === "P" && node.textContent.includes("一段 Agent 加的话") && node.getClientRects().length > 0);
      if (!host) return false;
      host.scrollIntoView({ block: "center" });
      host.focus();
      const range = document.createRange();
      range.selectNodeContents(host);
      range.collapse(false);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
      return true;
    });
    assert.ok(placed, "the caret in the paragraph the Agent added");
    await tab.keyboard.type(" smokeword");
    await until(() => fs.readFileSync(path.join(folder, "doc.html"), "utf8").includes("smokeword"), "the word typed saved to doc.html");
    await tab.waitForFunction(() => document.documentElement.getAttribute("data-ge-save") === "saved", { timeout: 15000 });
    typed = true;
    const homeSaved = fs.readFileSync(path.join(folder,'doc.html'),'utf8');
    await tab.goto(origin+projectBase+'/generated/smoke.html', {waitUntil:'load'});
    await tab.waitForSelector('html[data-ge-save]');
    await tab.evaluate(()=>{const p=document.querySelector('main p[data-ge-block]');p.focus();const r=document.createRange();r.selectNodeContents(p);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r)});
    await tab.keyboard.type(' owner-specific save');
    await until(()=>fs.readFileSync(projectFile,'utf8').includes('owner-specific save'),'project edit reaches its original file');
    await tab.waitForFunction(()=>document.documentElement.getAttribute('data-ge-save')==='saved');
    assert.equal(fs.readFileSync(path.join(folder,'doc.html'),'utf8'),homeSaved);
    gallery(['--workspace',project,'export','smoke']);
    assert.ok(fs.existsSync(path.join(project,'exports','smoke.html')));

    assert.deepEqual(errors, [], "no page errors");
    // A one-page PDF to import, made by the browser.
    const pdfPage = await browser.newPage();
    await pdfPage.setContent("<p style='font: 24px sans-serif'>Hello Gallery</p>");
    fs.writeFileSync(path.join(temp, "hello.pdf"), await pdfPage.pdf({ format: "A4" }));
    await browser.close();
    browser = null;
  } else {
    console.log("No Chrome or Edge here: the browser's part was not run (GALLERY_BROWSER names one).");
  }

  // ---------- import ----------
  const materials = path.join(temp, "materials");
  fs.mkdirSync(materials);
  fs.writeFileSync(path.join(materials, "notes.md"), "# 笔记\n\n第一段，带 **粗体** 和公式 $E = mc^2$。\n\n- 一\n- 二\n");
  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  fs.writeFileSync(path.join(materials, "plan.docx"), createZip([
    { name: "word/document.xml", data: `<w:document ${W}><w:body><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>章</w:t></w:r></w:p><w:p><w:r><w:t>正文</w:t></w:r></w:p></w:body></w:document>` },
    { name: "word/styles.xml", data: `<w:styles ${W}><w:style w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>` },
  ]));
  for (const [file, slug, words] of [["notes.md", "notes", "第一段"], ["plan.docx", "plan", "正文"], ...(fs.existsSync(path.join(temp, "hello.pdf")) ? [["../hello.pdf", "hello", "Hello Gallery"]] : [])]) {
    gallery(["import", path.join(materials, file), slug], { name: `gallery import ${path.extname(file)}` });
    assert.ok(fs.readFileSync(path.join(workspace, slug, "doc.html"), "utf8").includes(words), `${file}: its words in ${slug}/doc.html`);
  }

  // ---------- custom blocks ----------
  // Started, checked, listed and shown by the installed command (gallery block, and gallery component,
  // its other name, which says the same), a static block and one with a script; one of Gallery's own
  // added from the package (packs/gallery/); each in a document, its page served with the block's files and
  // its export holding them. No browser: the check says so and stands by the rest (3).
  const looked = executablePath ? [0] : [3];
  const packages = path.join(workspace, "components", "local");
  const started = gallery(["block", "new", "smoke-strip"]);
  assert.ok(started.stdout.includes(path.join(packages, "smoke-strip")) && started.stdout.includes("gallery block check local/smoke-strip"), started.stdout);
  gallery(["component", "new", "--script", "local/smoke-ticker"]);
  const own = gallery(["block", "add", "chart-card"]);
  assert.ok(own.stdout.includes("gallery/chart-card") && own.stdout.includes("is in already, as Gallery ships it") && fs.existsSync(path.join(workspace, "components", "gallery", "chart-card", "kit.js")), own.stdout);
  const listed = gallery(["block", "list"]).stdout;
  assert.ok(listed.includes("gallery/metric  指标 / Metric") && /Off by default \([^\n]*\): [^\n]*gallery\/card \(卡片 \/ Card\)/.test(listed), `Gallery 风格's blocks there, the pack installed, card among those off by default: ${listed}`);
  // A pack shared as a folder, installed, listed and removed by the installed command.
  const shared = gallery(["block", "pack", "install", path.join(repository, "tests", "fixtures", "packs", "my-cards")]);
  assert.ok(shared.stdout.startsWith("Installed the pack my-cards 1.0.0") && fs.existsSync(path.join(workspace, "components", "my-cards", "greet", "component.json")), shared.stdout);
  const packs = gallery(["block", "pack", "list"]).stdout;
  assert.ok(packs.includes("Gallery 风格 / Gallery style  (gallery ") && packs.includes("柔光风格 / Soft style  (gallery-soft ") && packs.includes(", off,") && packs.includes("我的卡片 / My cards  (my-cards 1.0.0, a pack installed, on, 2 blocks, by 小林)"), packs);
  assert.ok(gallery(["block", "pack", "remove", "my-cards"]).stdout.startsWith("Removed the pack my-cards 1.0.0") && !fs.existsSync(path.join(workspace, "components", "my-cards")));
  assert.equal(gallery(["block", "pack", "remove", "gallery"], { expect: [1] }).status, 1, "never one of Gallery's own");
  assert.ok(fs.existsSync(path.join(packages, "smoke-ticker", "kit.js")) && !fs.existsSync(path.join(packages, "smoke-strip", "kit.js")), "a script by the flag alone");
  for (const id of ["local/smoke-strip", "local/smoke-ticker"]) {
    const answer = gallery(["block", "check", id], { expect: looked });
    assert.match(answer.stdout, /1\. manifest: ok\n2\. kit\.js: .*\n3\. style\.css: ok\n4\. template\.html and example\.html: ok\n5\. /, answer.stdout);
    if (executablePath) assert.equal(fs.readdirSync(path.join(workspace, ".gallery", "qa", "components", ...id.split("/"))).length, 10, `${id}: its pictures, the six, the two overviews and the two as the editing page draws it`);
    // And, the check passing, the menus' two pictures of it in its folder (src/cli/block-picture.mjs), made by the release's own code.
    if (executablePath) for (const file of ["preview-light.webp", "preview-dark.webp"]) assert.ok(fs.readFileSync(path.join(packages, id.split("/")[1], file)).toString("latin1", 8, 12) === "WEBP", `${id}: its ${file}`);
  }
  // Gallery's own carry theirs from the package's packs/ (src/cli/pack-pictures.mjs).
  for (const file of ["preview-light.webp", "preview-dark.webp"]) assert.ok(fs.existsSync(path.join(workspace, "components", "gallery", "weather", file)) && fs.existsSync(path.join(workspace, "components", "gallery-soft", "todos", file)), `Gallery's own blocks: their ${file}`);
  assert.equal(gallery(["block", "new", "smoke-strip"], { expect: [1] }).status, 1);
  const available = gallery(["block", "list"]);
  assert.ok(available.stdout.includes("local/smoke-strip") && available.stdout.includes("local/smoke-ticker"), available.stdout);
  const howTo = gallery(["block", "show", "smoke-ticker"]);
  assert.ok(howTo.stdout.includes("How to write it (writing.md):") && howTo.stdout.includes('The example (example.html):\n<div data-doc-component="local/smoke-ticker">'), howTo.stdout);
  gallery(["new", "with-blocks", "两个块", "--no-browser"]);
  const instanceOf = (id) => fs.readFileSync(path.join(packages, id, "example.html"), "utf8");
  const blocksFile = path.join(workspace, "with-blocks", "doc.html");
  const chartCard = fs.readFileSync(path.join(workspace, "components", "gallery", "chart-card", "example.html"), "utf8");
  fs.writeFileSync(blocksFile, fs.readFileSync(blocksFile, "utf8").replace(/<section\b[^>]*data-doc-placeholder[\s\S]*?<\/section>/, `${instanceOf("smoke-strip")}${instanceOf("smoke-ticker")}${chartCard}`));
  await until(async () => (await get("/generated/with-blocks.html")).body.includes("/__gallery/components/local/smoke-ticker/kit.js?v="), "the page holds the package's script");
  const served = (await get("/generated/with-blocks.html")).body;
  const ticking = /\/__gallery\/components\/local\/smoke-ticker\/kit\.js\?v=[a-f0-9]+/.exec(served)[0];
  assert.deepEqual([(await get(ticking)).status, (await get(ticking)).type.startsWith("text/javascript"), (await get(ticking)).cache.includes("immutable")], [200, true, true], ticking);
  gallery(["check", "with-blocks"]);
  gallery(["export", "with-blocks"]);
  const holding = fs.readFileSync(path.join(workspace, "exports", "with-blocks.html"), "utf8");
  for (const id of ["local/smoke-strip", "local/smoke-ticker", "gallery/chart-card"]) assert.ok(holding.includes(`<style data-doc-package="${id}">`), `the export holds ${id}'s style`);
  assert.ok(holding.includes('<script data-doc-package="local/smoke-ticker">') && !/<script\b[^>]*\bsrc=/.test(holding), "and its script, inline");
  // A reader's gestures tried by the installed command: the official scorecard's dot pressed in its
  // document's page, and Enter on another, which reaches the keyboard's layout of puppeteer's in the
  // bundle, each one line of its JSON written, said line by line, on a scratch copy, one undo giving
  // the copy back, a fresh page reading it back, and the document as it was to the byte.
  fs.cpSync(path.join(repository, "tests", "fixtures", "components", "local", "scorecard"), path.join(packages, "scorecard"), { recursive: true });
  gallery(["new", "tried", "试一试", "--no-browser"]);
  const triedFile = path.join(workspace, "tried", "doc.html");
  fs.writeFileSync(triedFile, fs.readFileSync(triedFile, "utf8").replace(/<section\b[^>]*data-doc-placeholder[\s\S]*?<\/section>/, instanceOf("scorecard")));
  const untried = fs.readFileSync(triedFile, "utf8");
  for (const gesture of [["--press", '.scorecard-dot[data-option="2"][data-criterion="2"][data-score="3"]'], ["--key", '.scorecard-dot[data-option="0"][data-criterion="1"][data-score="5"]', "Enter"]]) {
    const tried = gallery(["block", "try", "tried", ...gesture], { expect: looked });
    if (!executablePath) continue;
    assert.ok(/\nWrote: scores \(-1 \+1 of its 13 lines\); nothing outside the instance changed \(data-block-id aside\)\n {2}- .*\n {2}\+ .*\nUndone: one Ctrl\+Z, and the copy of doc\.html is as it was \(data-block-id aside\)\nRead back: /.test(tried.stdout), `${gesture[0]}: ${tried.stdout}`);
    assert.equal(fs.readFileSync(triedFile, "utf8"), untried, `${gesture[0]}: the document as it was, to the byte (a scratch copy)`);
  }

  // A custom page: a card of Gallery's note put on it right after the block is added (page add waits
  // for the server to take it), its own picture served at /pages/<slug>/assets/<file>, a gesture on the
  // card tried (page try) and the page checked (page check) by the installed command, page.html as it was.
  gallery(["block", "add", "note"]);
  gallery(["page", "new", "desk", "桌面"]);
  assert.ok(gallery(["page", "add", "desk", "note"]).stdout.includes('data-card-id="c1" on board main'), "a card of the note, through the running server");
  const deskFile = path.join(workspace, "pages", "desk", "page.html");
  fs.mkdirSync(path.join(workspace, "pages", "desk", "assets"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "pages", "desk", "assets", "dot.svg"), '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2 2"><circle cx="1" cy="1" r="1"/></svg>');
  const dot = await get("/pages/desk/assets/dot.svg");
  assert.deepEqual([dot.status, dot.type], [200, "image/svg+xml"], "a page's own picture");
  const desk = fs.readFileSync(deskFile, "utf8");
  const pageTried = gallery(["page", "try", "desk", "c1", "--type", ".gallery-note-field", "你好", "--then", "Control+Enter"], { expect: looked });
  if (executablePath) assert.ok(pageTried.stdout.includes("\nWrote: note (-1 +1 of its 1 line); nothing else in page.html changed (card ids aside)\n") && /\nOK {3}desk: /.test(pageTried.stdout), pageTried.stdout);
  const pageChecked = gallery(["page", "check", "desk"], { expect: looked });
  if (executablePath) assert.ok(/\nOK {3}desk: its structure, and its 1 card at 1280, 1920, 600px in light and dark/.test(pageChecked.stdout), pageChecked.stdout);
  assert.equal(fs.readFileSync(deskFile, "utf8"), desk, "page.html as it was, to the byte (scratch copies)");

  // ---------- an Agent doing what the user can (tests/release/parity-acceptance.mjs) ----------
  await parityAcceptance({ gallery, workspace, temp, executablePath });

  // ---------- qa, stop ----------
  // The page's edit made the export older than the document: qa exports it first, then looks.
  gallery(["qa", "smoke"], { expect: executablePath ? [0] : [3] });
  const stopped = gallery(["--workspace", project, "stop"]);
  assert.match(stopped.stdout, new RegExp(`Stopped the server on port ${port} \\(pid ${server.pid}\\)`), stopped.stdout);
  await until(() => {
    try {
      process.kill(server.pid, 0);
      return false;
    } catch {
      return true;
    }
  }, "the server's process gone", 10000);
  server = null;
  assert.throws(()=>process.kill(extensionPid,0), "the managed backend exits with Gallery");
  assert.equal(fs.existsSync(path.join(temp, "data", "server.json")), false, "its announcement gone");
  assert.equal(fs.readFileSync(path.join(temp, "data", "last-port"), "utf8").trim(), String(port), "its port kept");
  const serverLog = fs.readFileSync(path.join(temp, "data", "logs", "server.log"), "utf8");
  assert.ok(!/is not in the release/.test(serverLog), `the server called what the release has not:\n${serverLog}`);

  // ---------- nothing written into the package ----------
  if (!windows) execSync(`chmod -R u+w "${installed}"`);
  const after = filesOf(installed);
  assert.deepEqual(after, before, "the installed package's files as they were installed");

  // ---------- the server's keeper: a crash and a replaced package bring it back, gallery stop does not (./restart-smoke.mjs) ----------
  await restartSmoke({ bin, installed, temp, env, port, cwd });
  assert.deepEqual(filesOf(installed), before, "the installed package's files as they were installed, release.json put back");

  // ---------- what it measured ----------
  console.log(`\nInstalled ${packed.name}@${packed.version} from ${packed.filename}: tarball ${megabytes(packed.size)}, unpacked ${megabytes(packed.unpackedSize)}, ${packed.entryCount} files; the prefix holds ${megabytes(footprint)} in all.`);
  console.log(`Its dependencies (npm ls -g --all):\n${dependencies.split("\n").map((line) => `  ${line}`).join("\n")}`);
  console.log("Times (this machine):");
  for (const [what, ms] of times) console.log(`  ${String(ms).padStart(6)} ms  ${what}`);
  console.log(`\nThe release smoke test passed: built, packed, installed into ${prefix}, every command run against a workspace of its own, ${typed ? "a word typed in the page saved to doc.html, " : ""}nothing written into the installed package.`);
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5 });
} catch (error) {
  console.error(`\nThe release smoke test failed: ${error.stack ?? error.message}\nIts folder is kept: ${temp}`);
  process.exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  if (server) {
    try {
      process.kill(server.pid);
    } catch {}
  }
}
