import { randomBytes } from "node:crypto";
import { watch } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { commandArguments, UsageError } from "./arguments.mjs";
import { browserSaid, openBrowser } from "./browser-open.mjs";
import { DEVICE_NAMES, ensureWorkspace, slugTaken } from "../shared/workspace.mjs";

const validName = name => typeof name === "string" && /^[a-z0-9][a-z0-9-]{0,39}$/.test(name) && !DEVICE_NAMES.has(name);
const samePath = (a, b) => path.relative(a, b) === "";
const lstat = file => fs.lstat(file).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
const metadata = dir => path.join(dir, "sandbox.json");
const urlOf = port => `http://127.0.0.1:${port}/`;
const removeTree = dir => fs.rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });

async function checkedDirectory(dir) {
  const stat = await lstat(dir);
  if (stat && (!stat.isDirectory() || stat.isSymbolicLink() || !samePath(dir, await fs.realpath(dir)))) {
    throw new Error(`沙盒路径不是普通文件夹：${dir}`);
  }
  return stat;
}

// An --extension folder as its user reaches it, through links on the way there (macOS's /tmp is /private/tmp,
// a Windows junction, an 8.3 name): those are resolved, as installExtension's own lstat lets them be.
// checkedDirectory's rule (no link at all, the path its own real path) is for the sandbox's folders, which it
// removes; a source is only read. The folder itself must not be a link: install refuses such a source
// ("安装源不能是符号链接"), and the watcher would follow it out of the folder that was named.
async function extensionSource(given) {
  const named = path.resolve(given);
  const parent = await fs.realpath(path.dirname(named)).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
  const source = parent ? path.join(parent, path.basename(named)) : named;
  const stat = await lstat(source);
  if (!stat) throw new Error(`找不到扩展文件夹：${named}`);
  if (stat.isSymbolicLink()) throw new Error(`扩展文件夹本身不能是符号链接：${named}（请改用它指向的文件夹）`);
  if (!stat.isDirectory()) throw new Error(`扩展来源不是文件夹：${named}`);
  return source;
}

async function sandboxRoot(create = false) {
  const root = path.join(await fs.realpath(os.tmpdir()), "gallery-sandboxes");
  if (create) await fs.mkdir(root, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
  const stat = await checkedDirectory(root);
  if (stat && process.getuid && (stat.uid !== process.getuid() || (stat.mode & 0o022))) {
    throw new Error(`沙盒目录必须归当前用户所有，且只有当前用户可写：${root}`);
  }
  return root;
}

function paths(root, name) {
  const dir = path.join(root, name);
  return { name, dir, home: path.join(dir, "home"), data: path.join(dir, "data"), cache: path.join(dir, "cache") };
}

async function readSandbox(root, name) {
  const box = paths(root, name);
  if (!await checkedDirectory(box.dir)) return null;
  const file = metadata(box.dir), stat = await lstat(file);
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink > 1 || stat.size > 1024) return null;
  const info = await fs.readFile(file, "utf8").then(JSON.parse).catch(() => null);
  if (info?.version !== 1 || info.name !== name) return null;
  if (!(await checkedDirectory(box.home)) || !(await checkedDirectory(box.data)) || !(await checkedDirectory(box.cache))) return null;
  return box;
}

const environment = box => ({
  GALLERY_SANDBOX: box.name, GALLERY_WORKSPACE: box.home, GALLERY_DEFAULT_WORKSPACE: box.home,
  GALLERY_DATA_DIR: box.data, GALLERY_CACHE_DIR: box.cache, GALLERY_VITE_CACHE_DIR: path.join(box.cache, "vite"),
  GALLERY_NO_AUTOSTART: "1", GALLERY_NO_BROWSER: "1", GALLERY_NO_UPDATE_CHECK: "1",
  CLAUDE_CONFIG_DIR: path.join(box.dir, "claude"), CODEX_HOME: path.join(box.dir, "codex"),
});

async function running(box) {
  const stat = await lstat(path.join(box.data, "server.json"));
  if (!stat?.isFile() || stat.isSymbolicLink() || stat.nlink > 1) return null;
  Object.assign(process.env, environment(box));
  const { readAnnouncement, answerOf } = await import("../shared/preview-server.mjs");
  const server = await readAnnouncement();
  if (!server || server.port < 1 || server.port > 65535 || server.pid <= 0 || !samePath(server.home, box.home)) return null;
  const answer = await answerOf(server, 2500);
  if (answer === "busy") throw new Error(`沙盒 ${box.name} 暂时无法响应，请稍后再试`);
  return answer === "yes" ? server : null;
}

function printEnvironment(box) {
  const windows = process.platform === "win32";
  const quote = value => "'" + (windows ? value.replace(/['\u2018-\u201b]/g, "$&$&") : value.replaceAll("'", "'\\''")) + "'";
  for (const [key, value] of Object.entries(environment(box))) {
    console.log(windows ? `$env:${key} = ${quote(value)}` : `export ${key}=${quote(value)}`);
  }
  console.log(windows ? `Set-Location -LiteralPath ${quote(box.home)}` : `cd -- ${quote(box.home)}`);
}

async function demo(home) {
  const { createReportFromStarter } = await import("../render/reports.mjs");
  for (const [base, title, text] of [
    ["sandbox-notes", "沙盒笔记", "在这里试试编辑、批注和拖动文档。"],
    ["sandbox-checklist", "测试清单", "在设置里打开或关闭扩展，然后返回这篇文档。"],
  ]) {
    let slug = base;
    for (let suffix = 2; slugTaken(slug, home); suffix++) slug = `${base}-${suffix}`;
    const { directory } = await createReportFromStarter(slug, title, text, { directory: home, blank: true });
    const file = path.join(directory, "doc.html");
    await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("<p></p>", `<p>${text}</p>`));
  }
}

function watchExtension(source, reinstall) {
  let timer, closed = false, pending = Promise.resolve();
  const watcher = watch(source, { recursive: true }, () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      pending = pending.then(async () => {
        if (!closed) await reinstall();
      }).catch(error => console.error(`扩展重新安装失败（${source}）：${error.message}`));
    }, 350);
  });
  watcher.on("error", error => console.error(`无法继续监听扩展（${source}）：${error.message}`));
  return async () => { closed = true; clearTimeout(timer); watcher.close(); await pending; };
}

async function start(box, options, values, version) {
  const sources = [];
  for (const given of values.get("--extension") ?? []) sources.push(await extensionSource(given));
  let source = values.get("--from");
  if (source) {
    source = await fs.realpath(source);
    const relative = path.relative(source, box.dir);
    if (!relative || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative))) {
      throw new Error("源工作区不能包含沙盒目录");
    }
  }
  try { await fs.mkdir(box.dir, { mode: 0o700 }); }
  catch (error) { if (error.code === "EEXIST") throw new Error(`沙盒 ${box.name} 已存在：请换一个名称`); throw error; }
  const owned = await checkedDirectory(box.dir);
  const stops = [];
  let service, interrupted = false, ready = false, ended;
  const finished = new Promise(resolve => { ended = resolve; });
  const interrupt = () => { interrupted = true; if (service) void service.routes.stop(); };
  const signals = ["SIGINT", "SIGTERM", "SIGHUP"];
  for (const signal of signals) process.on(signal, interrupt);
  try {
    await Promise.all([box.home, box.data, box.cache].map(dir => fs.mkdir(dir, { mode: 0o700 })));
    const browserEnv = { ...process.env };
    Object.assign(process.env, environment(box));
    if (source) {
      const { copySandboxWorkspace } = await import("./sandbox-copy.mjs");
      const ignored = await copySandboxWorkspace(source, box.home);
      if (ignored) console.log(`副本跳过了 ${ignored} 个符号链接或特殊文件`);
    }
    await ensureWorkspace(box.home);
    if (options.has("--demo")) await demo(box.home);
    const { release, projectRoot, workbenchDirectory } = await import("../shared/paths.mjs");
    let web = workbenchDirectory;
    if (!release && !interrupted) {
      web = path.join(box.cache, "web");
      const { buildWorkbench } = await import("./build-workbench.mjs");
      const { writeSharedAssets } = await import("../render/pipeline.mjs");
      // Wait for both builds to finish before the sandbox directory can be removed.
      const builds = await Promise.allSettled([buildWorkbench(projectRoot, web), writeSharedAssets()]);
      for (const result of builds) if (result.status === "rejected") throw result.reason;
    }
    if (interrupted) return;
    await fs.writeFile(metadata(box.dir), JSON.stringify({ version: 1, name: box.name }) + "\n", { flag: "wx", mode: 0o600 });
    const { startProductionServer } = await import("../server/production.mjs");
    service = await startProductionServer({ reportsDirectory: box.home, port: 0, web, kind: "cli", signals: false, exit: ended });
    if (interrupted) return;
    const { throughService } = await import("../server/extension-install.mjs");
    const installed = new Set();
    for (const source of sources) {
      const { installed: item } = await throughService("install", { path: source, enable: true });
      if (installed.has(item.id)) throw new Error(`重复的扩展 ID：${item.id}`);
      installed.add(item.id);
      stops.push(watchExtension(source, async () => {
        const { installed: update } = await throughService("install", { path: source, enable: false });
        if (update.did !== "unchanged") console.log(`扩展 ${update.id} 已重新安装`);
      }));
      console.log(`扩展：${item.id}（已启用）`);
    }
    ready = true;
    const url = urlOf(service.port);
    console.log(`沙盒：${box.name}\n地址：${url}\n工作区：${box.home}\nGallery ${version}`);
    console.log(options.has("--keep") ? "Ctrl+C 停止服务并保留文件。" : "Ctrl+C 停止服务并清理临时文件。");
    if (options.has("--open")) console.log(browserSaid(await openBrowser(url, { env: browserEnv })));
    await finished;
  } finally {
    try {
      await Promise.all(stops.map(close => close()));
      await service?.routes.stop();
      if (ready && options.has("--keep")) console.log(`沙盒已停止，文件保留在 ${box.dir}`);
      else {
        if (!samePath(path.dirname(box.dir), await sandboxRoot())) throw new Error("沙盒的临时目录已改变，无法自动清理");
        const now = await checkedDirectory(box.dir);
        if (now && now.dev === owned.dev && now.ino === owned.ino) await removeTree(box.dir);
      }
    } finally { for (const signal of signals) process.off(signal, interrupt); }
  }
}

export async function run(argv, { flag, version }) {
  if (flag !== null) throw new UsageError("沙盒使用自己的工作区。请用 --from <workspace> 复制现有工作区。");
  const action = argv[0] && !argv[0].startsWith("-") ? argv[0] : "start";
  const args = argv[0] === action ? argv.slice(1) : argv;
  if (!["start", "list", "env", "stop"].includes(action)) throw new UsageError(`未知的沙盒命令：${action}`);
  const { positional, options, values } = commandArguments(action === "start"
    ? { argv: args, options: ["--demo", "--open", "--keep"], values: ["--name", "--from"], repeated: ["--extension"] }
    : { argv: args });
  const named = action === "env" || action === "stop";
  if (positional.length !== (named ? 1 : 0)) throw new UsageError(named ? "请提供一个沙盒名称。" : "这里不接受位置参数。");
  const name = values.get("--name") ?? positional[0] ?? `sb-${randomBytes(5).toString("hex")}`;
  if (!validName(name)) throw new UsageError("沙盒名称须为 1–40 个小写字母、数字或连字符，以字母或数字开头。");
  try {
    const root = await sandboxRoot(action === "start");
    if (action === "start") return await start(paths(root, name), options, values, version);
    if (action === "list") {
      const names = await fs.readdir(root).catch(error => { if (error.code !== "ENOENT") throw error; return []; });
      let count = 0;
      for (const name of names.filter(validName).sort()) {
        const box = await readSandbox(root, name).catch(() => null);
        if (!box) continue;
        count++;
        const status = await running(box).then(server => server ? urlOf(server.port) : "（已停止）", () => "（暂时无法响应）");
        console.log(`${name}  ${status}  ${box.home}`);
      }
      if (!count) console.log("没有沙盒。");
      return;
    }
    const box = await readSandbox(root, name);
    if (!box) throw new Error(`没有叫 ${name} 的沙盒`);
    if (action === "env") return printEnvironment(box);
    const server = await running(box);
    if (!server) return void console.log(`沙盒 ${name} 没有正在运行的服务。`);
    const { stopServer } = await import("../shared/preview-server.mjs");
    const result = await stopServer(server, { force: false });
    if (!result.ok) throw new Error(result.message);
    console.log(`沙盒已停止：${name}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
