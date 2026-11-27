import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { pageLink } from "../../src/shared/page-links.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { portIsFree, processRuns } from "../../src/shared/preview-server.mjs";

// The workspace's server as the gallery commands run it, for real (src/cli/server-process.mjs): gallery
// new starts one (detached, its log in .gallery/logs/server.log, announced in .gallery/server.json as
// kind "cli" with Gallery's version) and prints its address; gallery open uses the one running; gallery new
// --under and gallery move write the outline through it, and its workbench's event stream hears them and gallery set;
// gallery stop stops it (POST /__gallery/workspace/stop: the saves done, the pages' event streams ended, the
// process gone, the announcement taken away, the port kept in .gallery/last-port for the next start)
// within seconds, an open event stream notwithstanding; an older Gallery's server is stopped and
// replaced by the next command that needs one; gallery serve runs one in the foreground, which
// gallery stop stops too. Ports from GALLERY_TEST_PORTS (else 4200-4260), never npm run dev's 4173;
// every server started here is stopped by its process in the end.

const run = promisify(execFile);
const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-cli-server-"));
const workspace = path.join(root, "ws");
const data = path.join(root, "data");
const layout = { server: path.join(data, "server.json"), lastPort: path.join(data, "last-port"), log: path.join(data, "logs", "server.log") };
const [low, high] = (/^(\d+)-(\d+)$/.exec(process.env.GALLERY_TEST_PORTS ?? "") ?? [0, 4200, 4260]).slice(1).map(Number);
// A free port of the range, from its top (the browser harness takes them from the bottom).
async function freePort(after = high + 1) {
  for (let port = after - 1; port >= low; port--) if (await portIsFree(port)) return port;
  throw new Error(`No free port in ${low}-${high}`);
}
const started = new Set(); // the processes of servers started here, stopped in the end
const gallery = async (args, env = {}, owner = workspace) => {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, "--workspace", owner, ...args], { cwd: root, env: { ...process.env, GALLERY_DEFAULT_WORKSPACE: workspace, GALLERY_DATA_DIR: data, GALLERY_NO_BROWSER: "1", GALLERY_NO_PREVIEW: "", ...env }, timeout: 120_000 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
const linesOf = (text) => text.trimEnd().split(/\r?\n/);
const announced = async () => JSON.parse(await fs.readFile(layout.server, "utf8").catch(() => "null"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function goneWithin(pid, ms) {
  for (const until = Date.now() + ms; Date.now() < until; await sleep(100)) if (!processRuns(pid)) return true;
  return false;
}

try {
  const port = await freePort();
  const env = { GALLERY_PORT: String(port) };
  // gallery new: a server started, on the first port (GALLERY_PORT), its address said last.
  const made = await gallery(["new", "live", "实时文档"], env);
  assert.equal(made.code, 0, made.stdout + made.stderr);
  const server = await announced();
  started.add(server.pid);
  assert.deepEqual([server.port, server.kind, server.version, path.resolve(server.home)], [port, "cli", JSON.parse(await fs.readFile(path.join(projectRoot, "package.json"), "utf8")).version, workspace]);
  assert.deepEqual(linesOf(made.stdout).slice(-3), [
    `提示：Gallery's shared server is on port ${port} (pid ${server.pid}, started now; its log: ${layout.log}). This command is done; the server runs on in the background (nothing to wait for or keep running).`,
    `Agent 自用（只有文档页，不交给用户）：http://127.0.0.1:${port}/generated/live.html?agent`,
    `交给用户（现在就把这个地址给用户；用 Chrome、Edge 或桌面版 Safari 打开）：http://127.0.0.1:${port}/#${pageLink({ slug: "live", title: "实时文档" })}`,
  ]);
  assert.equal((await fs.readFile(layout.lastPort, "utf8")).trim(), String(port), "its port kept for the next start");
  const info = await (await fetch(`http://127.0.0.1:${port}/__gallery/workspace/info`)).json();
  assert.deepEqual([info.gallery, info.server.kind, info.server.pid], [server.version, "cli", server.pid]);
  // gallery open: the one running, used, and no line of the server's (said only when one starts).
  const opened = await gallery(["open", "--no-browser"]);
  // The server is not mentioned again: it ran already, on the port the last command found it on.
  assert.deepEqual(linesOf(opened.stdout).slice(1), [
    `交给用户（现在就把这个地址给用户；用 Chrome、Edge 或桌面版 Safari 打开）：http://127.0.0.1:${port}/`,
    "Not opened in a browser (--no-browser).",
  ]);
  // gallery list of one document: the address to give the user ends it, the whole one while the server runs, labelled
  // to give with the handoff (a revision starts with the list; the address goes with the handoff, not now).
  const listedOne = await gallery(["list", "live"]);
  assert.equal(linesOf(listedOne.stdout).at(-1), `交给用户（交稿时给；用 Chrome、Edge 或桌面版 Safari 打开）：http://127.0.0.1:${port}/#${pageLink({ slug: "live", title: "实时文档" })}`, listedOne.stdout);
  // The server on another port than the last command found it on: said, with what that does to the addresses given before; then not again.
  await fs.writeFile(layout.lastPort, `${port + 1}
`);
  const moved = await gallery(["open", "--no-browser"]);
  assert.equal(linesOf(moved.stdout)[1], `提示：Gallery's shared server is on port ${port} (pid ${server.pid}). It was on port ${port + 1} before: an address with that port no longer works; use the ones below. This command is done; the server runs on in the background (nothing to wait for or keep running).`, moved.stdout);
  assert.equal((await fs.readFile(layout.lastPort, "utf8")).trim(), String(port), "the port it is on now kept");
  assert.ok(!(await gallery(["open", "--no-browser"])).stdout.includes("提示："), "said once");
  // A custom page with the server running: gallery page new ends with the 交给用户 line gallery open has (the page's
  // whole address, to send the user at once: SKILL.md's custom pages), and gallery page list gives each page's whole
  // address, the one to hand over, where it gave the path after the port; without a server it says how to get the address.
  {
    const made = await gallery(["page", "new", "reading", "读书"], env);
    assert.equal(made.code, 0, made.stderr);
    const address = `http://127.0.0.1:${port}/#@reading`;
    assert.equal(linesOf(made.stdout).at(-1), `交给用户（现在就把这个地址给用户；用 Chrome、Edge 或桌面版 Safari 打开）：${address}`);
    assert.match(linesOf(made.stdout).at(-2), /^下一步：send the user the address on the last line now, in a message of its own \(the page is theirs to watch as its cards arrive\); write page\.html: a board of cards .*; at the end tell them where it is in the sidebar \(under 新建 and 搜索, its title\)\.$/);
    const listed = await gallery(["page", "list"], env);
    assert.ok(linesOf(listed.stdout).some((line) => line.startsWith(`  地址：${address}   `)), listed.stdout);
    assert.ok(!listed.stdout.includes("地址：/#@"), "the whole address in each line of the list");
    await fs.rm(path.join(workspace, "pages"), { recursive: true });
  }
  // A 批注 whose words an Agent's write takes away: the export run right after the write says it was
  // deleted, and so does a check run right after one (found testing the skill with Agents, 2026-10-29: the server
  // checks the 批注 some 1.9 s after a write, the file quiet for 1.5 s, and the export read what it
  // deleted before its hand-in, so an Agent writing and exporting in one command was told nothing).
  {
    const file = path.join(workspace, "live", "doc.html");
    const notes = path.join(workspace, "live", "annotations.json");
    const starter = await fs.readFile(file, "utf8");
    const words = (said) => starter.replace(/\n[ \t]*<!-- Starter content:[^\n]*-->\n[ \t]*<section\b[^>]*\sdata-doc-placeholder\b[\s\S]*?<\/section>/, `\n    <p data-block-id="b2para01">开头概括：${said}在第一节之前。</p>`);
    assert.notEqual(words("紧跟页头，"), starter, "the starter section replaced");
    const note = (id) => ({ v: 1, items: [{ id, created: "2026-10-29T00:00:00.000Z", updated: "2026-10-29T00:00:00.000Z", text: "这里写清楚", anchor: { kind: "text", blocks: ["b2para01"], quote: "紧跟页头", prefix: "开头概括：", suffix: "，在第一节之前" } }] });
    const deletion = (stdout, id) => new RegExp(`^annotations ${path.resolve(notes).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&")}: at \\d\\d:\\d\\d, Gallery deleted 1 批注 \\(annotation\\) whose words are gone from the document \\(rewritten or deleted\\):\\n {2}${id} "这里写清楚" on "紧跟页头"$`, "m").test(stdout.replace(/\r\n/g, "\n"));
    for (const [command, id] of [["export", "b2note01"], ["check", "b2note02"]]) {
      await fs.writeFile(file, words("紧跟页头，"));
      await sleep(2500); // the server took it and checked the 批注 there (none yet)
      await fs.writeFile(notes, `${JSON.stringify(note(id), null, 2)}\n`);
      await fs.writeFile(file, words("")); // the Agent's write: the words quoted gone
      const ran = await gallery([command, "live"]);
      assert.equal(ran.code, 0, ran.stdout + ran.stderr);
      assert.ok(deletion(ran.stdout, id), `gallery ${command} right after the write says the 批注 deleted:\n${ran.stdout}`);
      assert.equal(await fs.access(notes).then(() => true, () => false), false, "annotations.json without it (gone: none left)");
      assert.ok(!deletion((await gallery(["check", "live"])).stdout, id), "said once");
    }
  }
  // The sidebar's tree while the server runs: gallery new --under and gallery move write the outline
  // through it (POST /__gallery/workspace/move, in its queue: the outline is in .gallery/, which its
  // watcher passes over, so only the server's own write tells), and its workbench's stream (?workspace)
  // hears each, as it hears gallery set's write of doc.json; a page's stream hears none of it.
  {
    const listen = async (query) => {
      const controller = new AbortController();
      const reader = (await fetch(`http://127.0.0.1:${port}/__gallery/events?${query}`, { signal: controller.signal })).body.getReader();
      const state = { heard: "" };
      (async () => {
        for (;;) {
          const { value, done } = await reader.read().catch(() => ({ done: true }));
          if (done) return;
          state.heard += new TextDecoder().decode(value);
        }
      })();
      return { state, stop: () => controller.abort() };
    };
    const until = async (test, what) => {
      for (const end = Date.now() + 8000; Date.now() < end; await sleep(50)) if (test()) return;
      assert.fail(what);
    };
    const workbench = await listen("workspace");
    const page = await listen("slug=live");
    const told = () => (workbench.state.heard.match(/^data: workspace \d+$/gm) ?? []).length;
    await until(() => workbench.state.heard.includes("retry:") && page.state.heard.includes("retry:"), "the streams opened");
    const placed = await gallery(["new", "child", "子文档", "--under", "live", "--no-browser"]);
    assert.equal(linesOf(placed.stdout)[1], "Placed it under live (实时文档), the only document there.", placed.stdout + placed.stderr);
    await until(() => told() >= 1, "gallery new --under told the workbench");
    await sleep(400); // the burst of it told once
    const before = told();
    const moved = await gallery(["move", "child", "--top", "--first"]);
    assert.equal(linesOf(moved.stdout)[0], "Moved child (子文档): now at the top level, first; it was under live (实时文档), the only document there.", moved.stdout + moved.stderr);
    await until(() => told() > before, "gallery move went through the server, which told the workbench");
    assert.deepEqual(JSON.parse(await fs.readFile(path.join(workspace, ".gallery", "outline.json"), "utf8")).children, { "": ["child", "live"] });
    await sleep(400);
    const beforeSet = told();
    assert.equal((await gallery(["set", "child", "--title", "改过的子文档", "--icon", "📊"])).code, 0);
    await until(() => told() > beforeSet, "gallery set's doc.json told the workbench");
    const listed = await (await fetch(`http://127.0.0.1:${port}/__gallery/workspace/outline`)).json();
    assert.deepEqual([listed.reports.child.title, listed.reports.child.icon], ["改过的子文档", "📊"]);
    assert.ok(!page.state.heard.includes("workspace"), "a page hears no workspace message");
    // A command whose name holds a hyphen (link-set: a link's 重命名 and 修改网址…) reaches the workspace's service, which answers it.
    const linkSet = await fetch(`http://127.0.0.1:${port}/__gallery/workspace/link-set`, { method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}`, "X-Gallery-Token": info.token }, body: JSON.stringify({ slug: "nope" }) });
    assert.deepEqual([linkSet.status, (await linkSet.json().catch(() => null))?.reason], [404, "missing"], "link-set answered by the service, not the server's plain 404");
    workbench.stop();
    page.stop();
  }
  // A token-less stop is refused (a page of another site cannot stop it).
  const refused = await fetch(`http://127.0.0.1:${port}/__gallery/workspace/stop`, { method: "POST", headers: { "Content-Type": "application/json", Origin: `http://127.0.0.1:${port}` }, body: "{}" });
  assert.equal(refused.status, 403);
  // gallery stop, while a page's event stream is open: done in seconds, the process gone, the announcement too.
  const events = new AbortController();
  const stream = await fetch(`http://127.0.0.1:${port}/__gallery/events?slug=live`, { signal: events.signal });
  assert.equal(stream.status, 200);
  const before = performance.now();
  const stopped = await gallery(["stop"]);
  const took = performance.now() - before;
  events.abort();
  assert.deepEqual([stopped.code, stopped.stdout.trim()], [0, `Stopped the server on port ${port} (pid ${server.pid}).`], stopped.stderr);
  assert.ok(took < 8000, `stopped in ${Math.round(took)} ms`);
  assert.ok(await goneWithin(server.pid, 2000), "its process gone");
  started.delete(server.pid);
  assert.equal(await announced(), null, "its announcement taken away");
  assert.equal((await gallery(["stop"])).stdout.trim(), "No Gallery server runs.");

  // Simultaneous commands from different folders still create one service, even with different preferred ports.
  const project = path.join(root, 'second-project');
  assert.equal((await gallery(['init'], {}, project)).code, 0);
  const anotherPort = await freePort(port);
  const simultaneous = await Promise.all([
    gallery(['open','--no-browser'], {GALLERY_PORT:String(port)}),
    gallery(['new','parallel','Concurrent project','--no-browser'], {GALLERY_PORT:String(anotherPort)}, project),
  ]);
  for(const answer of simultaneous) assert.equal(answer.code,0,answer.stdout+answer.stderr);
  const only = await announced();started.add(only.pid);
  for(const answer of simultaneous) assert.ok(answer.stdout.includes('http://127.0.0.1:'+only.port+'/'),answer.stdout);
  assert.match(simultaneous[1].stdout, /#~ws-[a-f0-9]{6}\//);
  assert.equal(await fs.access(path.join(project,'parallel','doc.html')).then(()=>true,()=>false),true);
  assert.equal(await fs.access(path.join(project,'.gallery','server.json')).then(()=>true,()=>false),false);
  assert.ok(await portIsFree(only.port===port?anotherPort:port),'the losing starter leaves no second listener');
  assert.equal((await gallery(['stop'],{},project)).code,0);
  assert.ok(await goneWithin(only.pid,3000));started.delete(only.pid);

  // An older Gallery's server (a command's): stopped and replaced by the next command that needs one.
  // Here a small server of the test's own in a process of its own, announced as Gallery 0.0.1's.
  const oldPort = await freePort(port);
  const token = "a".repeat(32);
  const old = spawn(process.execPath, ["-e", `
    const http = require("node:http");
    http.createServer((request, response) => {
      if (request.url === "/__gallery/workspace/info") return response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ ok: true, token: ${JSON.stringify(token)}, server: { pid: process.pid, home: ${JSON.stringify(workspace)}, data: ${JSON.stringify(data)}, kind: "cli" } }));
      if (request.method === "POST" && request.url === "/__gallery/workspace/stop" && request.headers["x-gallery-token"] === ${JSON.stringify(token)}) {
        response.on("finish", () => process.exit(0));
        return response.writeHead(200, { "Content-Type": "application/json" }).end('{"ok":true}');
      }
      response.writeHead(404).end();
    }).listen(${oldPort}, "127.0.0.1", () => console.log("listening"));
  `], { stdio: ["ignore", "pipe", "inherit"], windowsHide: true });
  started.add(old.pid);
  await new Promise((resolve) => old.stdout.once("data", resolve));
  await fs.writeFile(layout.server, `${JSON.stringify({ port: oldPort, pid: old.pid, home: workspace, token, nonce: "old", kind: "cli", version: "0.0.1", started: new Date().toISOString() })}\n`);
  const replaced = await gallery(["open", "--no-browser"], env);
  assert.equal(replaced.code, 0, replaced.stdout + replaced.stderr);
  const replacement = await announced();
  started.add(replacement.pid);
  assert.ok(await goneWithin(old.pid, 2000), "the older one stopped");
  started.delete(old.pid);
  assert.equal(linesOf(replaced.stdout)[1], `提示：Gallery's shared server is on port ${port} (pid ${replacement.pid}, started now, it replaced Gallery 0.0.1's server, pid ${old.pid}; its log: ${layout.log}). This command is done; the server runs on in the background (nothing to wait for or keep running).`, replaced.stdout);
  assert.equal((await gallery(["stop"])).code, 0);
  assert.ok(await goneWithin(replacement.pid, 3000));
  started.delete(replacement.pid);

  // gallery serve: in the foreground, its address said once it answers; gallery stop stops it too.
  const servePort = await freePort(port);
  const serving = spawn(process.execPath, [bin, "--workspace", workspace, "serve", "--port", String(servePort)], { cwd: root, env: { ...process.env, GALLERY_DEFAULT_WORKSPACE: workspace, GALLERY_DATA_DIR: data }, stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
  started.add(serving.pid);
  let said = "";
  serving.stdout.on("data", (chunk) => (said += chunk));
  serving.stderr.on("data", (chunk) => (said += chunk));
  const exited = new Promise((resolve) => serving.once("exit", (code) => resolve(code)));
  for (const until = Date.now() + 60_000; !said.includes("Ctrl+C stops it.") && Date.now() < until;) await sleep(200);
  assert.ok(said.includes(`Gallery serves ${workspace} at http://127.0.0.1:${servePort}/. Ctrl+C stops it.`), said);
  const twice = await gallery(["serve"]);
  assert.equal(twice.code, 1);
  assert.match(twice.stderr, new RegExp(`^The shared Gallery server runs already: http://127\\.0\\.0\\.1:${servePort}/ \\(pid \\d+\\)\\. gallery stop stops it; one server serves a Gallery data directory\\.`), "one server per data directory");
  const viteServer = (await announced()).pid;
  started.add(viteServer);
  assert.equal((await gallery(["stop"])).code, 0);
  assert.equal(await Promise.race([exited, sleep(10_000).then(() => "still running")]), 0, "serve ends with its server");
  started.delete(serving.pid);
  started.delete(viteServer);
} finally {
  for (const pid of started) {
    try {
      process.kill(pid);
    } catch {}
  }
  await sleep(300);
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
}

console.log("Checked the workspace's server as the commands run it: gallery new starting one (announced as a command's, of this Gallery's version, its port kept), gallery open using it, gallery new --under and gallery move writing the outline through it and gallery set's doc.json, each told on the workbench's stream and on no page's, a stop without the token refused, gallery stop ending it in seconds with an event stream open (process and announcement gone), an older Gallery's server stopped and replaced, and gallery serve in the foreground (one server a workspace; stopped by gallery stop).");
