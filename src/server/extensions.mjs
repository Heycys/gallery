import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import os from "node:os";
import { extensionDirectory, extensionFile, listCapabilities, setExtensionEnabled, setExtensionSettings, settingsFile, syncSettingsFile } from "../shared/extension-manifest.mjs";
import { serviceLocation } from "../shared/service-location.mjs";
import { sendJson, serve } from "../shared/http.mjs";
import { said, saying } from "../shared/i18n/index.mjs";
import { COLUMNS_FOLDER } from "../shared/extension-sidebar.mjs";
import { installExtension, removeExtension } from "./extension-install.mjs";
import { reveal } from "../workbench/reveal.mjs";

export const extensionEvents = new EventEmitter();
const tell = id => extensionEvents.emit("change", id);
export function decodeExtensionZip(value, maxBytes = 100 * 1024 * 1024) {
  if (typeof value !== "string" || value.length % 4 !== 0 || value.length > Math.ceil(maxBytes / 3) * 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("ZIP 数据无效或超过 100MB");
  const bytes = Buffer.from(value, "base64");
  if (bytes.length > maxBytes) throw new Error("扩展 ZIP 超过 100MB");
  return bytes;
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const freePort = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => { const { port } = server.address(); server.close(() => resolve(port)); });
});
const listening = port => new Promise(resolve => {
  const socket = net.connect(port, "127.0.0.1");
  socket.setTimeout(250);
  socket.once("connect", () => { socket.destroy(); resolve(true); });
  socket.once("error", () => resolve(false));
  socket.once("timeout", () => { socket.destroy(); resolve(false); });
});
// Scripts are served from files/@revision/<revision>/ (0.2.4), so an address a script works out from its own
// (new URL('../api/', import.meta.url), which reached the backend when scripts were at files/<file>) now
// lands under files/, at files/@revision/api/…. There is no alias: what the files route cannot serve with an
// api segment in its path is told where the backend is, rather than a missing file's 400 or a 405.
const backendOf = id => `/__gallery/extensions/${id}/api/`;
const toBackend = relative => /(?:^|\/)api(?:\/|$)/.test(relative);
const movedBackend = id => said("扩展后台不在 files/ 下：脚本从 files/@revision/<版本>/ 加载，照脚本地址推算的后台地址（如 new URL('../api/', import.meta.url)）不再对。后台在 {0}：在 activate(api) 里用 api.fetch(path) 或 api.backend。", backendOf(id));
// What a request to a disabled (or removed) extension is told, before its backend is asked or while it is.
const DISABLED = { ok: false, reason: "disabled", message: "扩展已停用" };
const TYPES = { ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".woff2": "font/woff2" };

// One extension host belongs to the service, never to a document runtime. Backends are lazy;
// enabled children restart with bounded backoff, and all are stopped before the service closes.
export function createExtensions({ edits }) {
  const children = new Map();
  const workbenchErrors = new Map();
  // A request of the revision's script to a backend address under files/ (movedBackend): kept apart from the
  // script's own reports, which an activation that went on after it would clear.
  const addressErrors = new Map();
  let mutations = Promise.resolve(), monitorWork = Promise.resolve(), changing = 0;
  const mutate = task => {
    changing++;
    const result = mutations.then(async () => { await monitorWork; return task(); });
    mutations = result.catch(() => {});
    return result.finally(() => { changing--; });
  };
  let closed = false, monitoring = false;
  const stopId = async id => { const entry = children.get(id); if (entry) { await stop(entry); if (children.get(id) === entry) children.delete(id); tell(id); } };
  const monitor = setInterval(() => {
    if (closed || changing || monitoring || !children.size) return;
    monitoring = true;
    const watched = [...children.values()];
    monitorWork = listCapabilities({ ids: watched.map(entry => entry.id) }).then(async items => {
      if (closed) return;
      for (const entry of watched) {
        if (children.get(entry.id) !== entry) continue;
        const item = items.find(item => item.id === entry.id);
        if (!item?.enabled || item.manifest.revision !== entry.revision) {
          await stopId(entry.id);
          if (item?.enabled && item.manifest.server && !closed && !changing) await backend(item).catch(() => {});
        }
        else if (entry.state === "starting" && entry.child?.exitCode === null && !entry.child.signalCode && await listening(entry.port)) { entry.state = "running"; tell(entry.id); }
      }
    }).catch(() => {}).finally(() => { monitoring = false; });
  }, 1000);
  monitor.unref();

  function stop(entry) {
    return entry.stopping ??= stopChild(entry);
  }
  async function stopChild(entry) {
    entry.stopped = true;
    clearTimeout(entry.timer);
    await entry.starting?.catch(() => {});
    const child = entry.child;
    if (child && child.exitCode === null && child.signalCode === null) {
      if (process.platform === "win32") await new Promise(resolve => {
        const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
        killer.once("error", resolve); killer.once("exit", resolve);
      });
      else { child.kill("SIGTERM"); await Promise.race([new Promise(resolve => child.once("exit", resolve)), delay(1500)]); if (child.exitCode === null) child.kill("SIGKILL"); }
    }
    entry.log?.end();
  }

  async function launch(entry) {
    if (closed || entry.stopped) return;
    const enabled = (await listCapabilities({ ids: [entry.id] }))[0];
    if (!enabled?.enabled || enabled.manifest.revision !== entry.revision) { entry.stopped = true; entry.log.end(); if (children.get(entry.id) === entry) children.delete(entry.id); return; }
    entry.port = await freePort();
    // Its settings' file written before it starts, from gallery.json as it is now: its first read finds every key
    // there. A failure to write it (the disk's) goes to its log; the backend starts all the same, given the path.
    const settings = await syncSettingsFile(entry.id, enabled.manifest).catch(error => { entry.log.write(`[${new Date().toISOString()}] settings file: ${error.message}\n`); return settingsFile(entry.id); });
    if (closed || entry.stopped) return;
    const [program, ...args] = enabled.manifest.server.command;
    const child = spawn(program === "node" ? process.execPath : program, args, { cwd: enabled.folder, windowsHide: true, shell: false,
      env: { ...process.env, PORT: String(entry.port), GALLERY_EXTENSION_PORT: String(entry.port), GALLERY_EXTENSION_HOST: "127.0.0.1", GALLERY_EXTENSION_ID: entry.id, GALLERY_EXTENSION_COLUMNS: path.join(enabled.folder, COLUMNS_FOLDER), GALLERY_EXTENSION_SETTINGS: settings }, stdio: ["ignore", "pipe", "pipe"] });
    entry.child = child;
    entry.state = "starting"; entry.retryAt = null; tell(entry.id);
    const started = Date.now();
    child.stdout?.pipe(entry.log, { end: false }); child.stderr?.pipe(entry.log, { end: false });
    let ended = false;
    const restart = (error, exitCode = null) => {
      if (ended) return; ended = true;
      entry.log.write(`[${new Date().toISOString()}] ${error?.message ?? "Backend exited"}\n`);
      if (closed || entry.stopped) return;
      entry.exitCode = exitCode; entry.state = "retrying";
      entry.failures = Date.now() - started > 30000 ? 0 : entry.failures + 1;
      const wait = Math.min(30000, 500 * 2 ** Math.min(entry.failures, 6));
      entry.retryAt = Date.now() + wait; tell(entry.id);
      entry.timer = setTimeout(() => { entry.starting = launch(entry).finally(() => { entry.starting = null; }); void entry.starting.catch(error => entry.log.write(error.message + "\n")); }, wait);
      entry.timer.unref();
    };
    child.once("error", restart); child.once("exit", code => restart(null, code));
  }

  async function backend(item, until = Date.now() + 10000) {
    if (changing || closed) throw new Error("扩展正在更新，请稍后再试");
    let entry = children.get(item.id);
    if (entry && entry.revision !== item.manifest.revision) { await stop(entry); children.delete(item.id); entry = null; }
    if (changing || closed) throw new Error("扩展正在更新，请稍后再试");
    if (!entry) {
      const file = path.join(serviceLocation().data, "logs", "extensions", `${item.id}.log`);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      entry = { id: item.id, revision: item.manifest.revision, failures: 0, stopped: false, state: "starting", exitCode: null, retryAt: null, log: fs.createWriteStream(file, { flags: "a" }) };
      entry.log.on("error", () => {});
      children.set(item.id, entry);
      entry.starting = launch(entry).finally(() => { entry.starting = null; });
    }
    await entry.starting;
    while (!closed && !entry.stopped && Date.now() < until) {
      if (entry.child?.exitCode === null && !entry.child.signalCode && await listening(entry.port)) { if (entry.state !== "running") { entry.state = "running"; tell(entry.id); } return entry.port; }
      await delay(100);
    }
    // A file watcher may replace the child while this request is waiting for it.
    // Join the new generation instead of turning a normal hot reload into a 400.
    if (entry.stopped && !closed && !changing && Date.now() < until) {
      const current = (await listCapabilities({ ids: [item.id] }))[0];
      if (current?.enabled && current.manifest.server) return backend(current, until);
    }
    throw new Error("扩展后台暂未就绪，请查看扩展日志");
  }

  async function handle(request, response) {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/__gallery/reveal") {
      const checked = await edits.check(request, 1024);
      if (checked.error) { sendJson(response, ...checked.error); return true; }
      try {
        const { id, kind } = checked.body;
        const folder = extensionDirectory(id);
        const folderStat = await fsp.lstat(folder);
        if (!folderStat.isDirectory() || folderStat.isSymbolicLink()) throw new Error("扩展文件夹不正确");
        const item = kind === "extension-agent" ? (await listCapabilities({ ids: [id] }))[0] : null;
        const target = kind === "extension" ? folder : kind === "sidebar" ? await extensionFile(folder, "sidebar.json") : kind === "extension-agent" && item?.manifest?.agent ? await extensionFile(folder, item.manifest.agent) : kind === "extension-log" ? path.join(serviceLocation().data, "logs", "extensions", `${id}.log`) : null;
        if (!target || !(await fsp.stat(target).catch(() => null))) throw new Error("找不到这个文件或文件夹");
        sendJson(response, 200, { ok: true, path: target, ...await reveal(target) });
      } catch (error) { sendJson(response, 400, { ok: false, message: error.message }); }
      return true;
    }
    if (!url.pathname.startsWith("/__gallery/extensions")) return false;
    const host = `127.0.0.1:${request.socket.localPort}`;
    if (request.headers.host !== host) { sendJson(response, 403, { ok: false, reason: "host" }); return true; }
    try {
      if (url.pathname === "/__gallery/extensions" && request.method === "GET") {
        // A watcher can announce replacement files before install has enabled them or
        // released its mutation. Publish only a stable snapshot, so clients can load it.
        let pending, items;
        do { pending = mutations; await pending; items = await listCapabilities(); } while (pending !== mutations);
        sendJson(response, 200, { ok: true, extensions: items.map(item => { const entry = children.get(item.id), error = workbenchErrors.get(item.id); const address = addressErrors.get(item.id), now = item.manifest?.revision; return { ...item, workbenchError: error && error.revision === now ? error.message : address && address.revision === now ? address.message : null, backend: { state: entry?.state ?? "idle", exitCode: entry?.exitCode ?? null, retryAt: entry?.retryAt ?? null, log: path.join(serviceLocation().data, "logs", "extensions", `${item.id}.log`) } }; }) }); return true;
      }
      if (url.pathname === "/__gallery/extensions/workbench-error" && request.method === "POST") {
        const checked = await edits.check(request, 16384);
        if (checked.error) { sendJson(response, ...checked.error); return true; }
        const { id, revision, message } = checked.body;
        if (typeof id !== "string" || typeof revision !== "string" || typeof message !== "string") throw new Error("扩展错误记录无效");
        const item = (await listCapabilities({ ids: [id] }))[0];
        // An activation can finish after its files changed or the extension was disabled.
        // Its report is obsolete, not a failed user operation.
        if (!item?.enabled || revision !== item.manifest?.revision) { sendJson(response, 200, { ok: true }); return true; }
        const old = workbenchErrors.get(id);
        if (message) workbenchErrors.set(id, { revision, message: message.slice(0, 12000) });
        else workbenchErrors.delete(id);
        if (old?.message !== (message || undefined)) tell(id);
        sendJson(response, 200, { ok: true }); return true;
      }
      // An extension's own settings changed (设置 › 拓展列表's controls, gallery extension settings): gallery.json and
      // its backend's file written (shared/extension-manifest.mjs setExtensionSettings), the workbench told (the list
      // holds the values: api.settings). No mutation of the extension: no backend stops, no request waits for it.
      if (url.pathname === "/__gallery/extensions/settings" && request.method === "POST") {
        const checked = await edits.check(request, 65536);
        if (checked.error) { sendJson(response, ...checked.error); return true; }
        try {
          const result = await setExtensionSettings(checked.body);
          if (result.changed) tell(checked.body.id);
          sendJson(response, 200, { ok: true, settings: result.values, file: result.file });
        } catch (error) { sendJson(response, error.reason === "disabled" ? 409 : 400, { ok: false, ...(error.reason ? { reason: error.reason } : {}), ...saying(error) }); }
        return true;
      }
      const action = /^\/__gallery\/extensions\/(install|remove)$/.exec(url.pathname)?.[1];
      if (action) {
        const checked = await edits.check(request, action === "install" ? 140 * 1024 * 1024 : 65536);
        if (checked.error) sendJson(response, ...checked.error);
        else if (action === "install") {
          const installed = await mutate(async () => {
            const body = checked.body;
            if ((typeof body.path === "string") === (typeof body.zip === "string")) throw new Error("请选择扩展路径或 ZIP");
            if (body.path) return installExtension(body.path, { inService: true, beforeReplace: stopId, enable: body.enable ?? false });
            const bytes = decodeExtensionZip(body.zip);
            const temporary = await fsp.mkdtemp(path.join(os.tmpdir(), "gallery-extension-"));
            const filename = typeof body.filename === "string" && /^[a-z0-9-]+\.zip$/i.test(body.filename) ? body.filename : "extension.zip";
            try { const file = path.join(temporary, filename); await fsp.writeFile(file, bytes); return await installExtension(file, { inService: true, beforeReplace: stopId, enable: body.enable ?? false }); }
            finally { await fsp.rm(temporary, { recursive: true, force: true }); }
          });
          tell(installed.id);
          sendJson(response, 200, { ok: true, installed });
        } else {
          await mutate(() => removeExtension(checked.body.id, { inService: true, beforeReplace: stopId }));
          tell(checked.body.id);
          sendJson(response, 200, { ok: true });
        }
        return true;
      }
      if (url.pathname === "/__gallery/extensions" && request.method === "POST") {
        const checked = await edits.check(request, 65536);
        if (checked.error) sendJson(response, ...checked.error);
        else {
          await mutate(async () => {
            await setExtensionEnabled(checked.body);
            if (!checked.body.enabled) await stopId(checked.body.id);
          });
          tell(checked.body.id);
          sendJson(response, 200, { ok: true });
        }
        return true;
      }
      const icon = /^\/__gallery\/extensions\/([^/]+)\/icon$/.exec(url.pathname);
      if (icon) {
        const item = (await listCapabilities({ ids: [icon[1]] }))[0];
        const name = item?.manifest?.icon;
        if (!name || !/\.(?:png|jpe?g|webp|gif|svg)$/i.test(name)) { sendJson(response, 404, { ok: false }); return true; }
        const file = await extensionFile(extensionDirectory(item.id), name);
        serve(response, { type: TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream", headers: { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache" }, body: await fsp.readFile(file) }); return true;
      }
      const match = /^\/__gallery\/extensions\/([^/]+)\/(files|api)\/(.*)$/.exec(url.pathname);
      if (!match) { sendJson(response, 404, { ok: false }); return true; }
      if (changing || closed) { sendJson(response, 503, { ok: false, message: "扩展正在更新，请稍后再试" }); return true; }
      const [, id, area, name] = match;
      const item = (await listCapabilities({ ids: [id] }))[0];
      if (!item?.enabled) { sendJson(response, 403, DISABLED); return true; }
      if (area === "files") {
        const relative = decodeURIComponent(name).replace(/^@revision\/[a-f0-9]+\//, "");
        const moved = () => {
          const answer = movedBackend(id), revision = item.manifest.revision;
          if (addressErrors.get(id)?.revision !== revision) { addressErrors.set(id, { revision, message: answer.message }); tell(id); }
          sendJson(response, 404, { ok: false, reason: "backend-address", backend: backendOf(id), ...answer });
          return true;
        };
        if (request.method !== "GET" && request.method !== "HEAD") { if (toBackend(relative)) return moved(); sendJson(response, 405, { ok: false }); return true; }
        let file;
        try { file = await extensionFile(extensionDirectory(id), relative); }
        catch (error) { if (toBackend(relative)) return moved(); throw error; }
        serve(response, { type: TYPES[path.extname(file)] ?? "application/octet-stream", headers: { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache" }, body: request.method === "HEAD" ? undefined : await fsp.readFile(file) });
        return true;
      }
      const authHeaders = { ...request.headers };
      // Browsers omit Origin on same-origin GET/HEAD. Require their same-origin Referer
      // as well as the token, while retaining the normal Origin check for writes.
      if (!authHeaders.origin && ["GET", "HEAD"].includes(request.method)) {
        try { authHeaders.origin = new URL(authHeaders.referer).origin; } catch { /* rejected below */ }
      }
      const refused = edits.checkHeaders({ method: "POST", headers: authHeaders, socket: request.socket });
      if (refused) { sendJson(response, ...refused); return true; }
      if (!item.manifest.server) { sendJson(response, 404, { ok: false, reason: "backend" }); return true; }
      // Disabling or removing the extension stops its backend under a request: the switch is written before the
      // child is stopped (the POST below), so a request it broke off, or one still waiting for the backend to
      // start, is told what a request after it is (403 disabled) rather than the bare 502 of a reset socket.
      const disabled = async () => !(await listCapabilities({ ids: [id] }).catch(() => []))[0]?.enabled;
      let port;
      try { port = await backend(item); }
      catch (error) { if (await disabled()) { sendJson(response, 403, DISABLED); return true; } throw error; }
      const headers = { ...request.headers, host: `127.0.0.1:${port}` };
      delete headers["x-gallery-token"]; delete headers.cookie;
      const upstream = http.request({ host: "127.0.0.1", port, method: request.method, path: "/" + name + url.search, headers }, reply => {
        const headers = { ...reply.headers }; delete headers["access-control-allow-origin"]; delete headers["set-cookie"];
        response.writeHead(reply.statusCode, headers); reply.pipe(response);
      });
      upstream.setTimeout(item.manifest.server.timeout ?? 30000, () => upstream.destroy(new Error("扩展后台请求超时")));
      upstream.once("error", async error => {
        if (response.headersSent || response.destroyed) { response.destroy(); return; }
        const off = await disabled();
        if (!response.destroyed) sendJson(response, off ? 403 : 502, off ? DISABLED : { ok: false, message: error.message });
      });
      response.once("close", () => upstream.destroy()); request.pipe(upstream);
      return true;
    } catch (error) { sendJson(response, 400, { ok: false, message: error.message }); return true; }
  }
  return { handle, async close() { closed = true; clearInterval(monitor); await mutations; await monitorWork; await Promise.all([...children.values()].map(stop)); children.clear(); } };
}
