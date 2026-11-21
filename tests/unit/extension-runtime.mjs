import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import http from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ensureWorkspace } from "../../src/shared/workspace.mjs";
import { installExtension, removeExtension } from "../../src/server/extension-install.mjs";
import { extensionFile, listCapabilities } from "../../src/shared/extension-manifest.mjs";
import { createZip } from "../../src/transfer/zip.mjs";
import { startProductionServer } from "../../src/server/production.mjs";
import { createExtensions, decodeExtensionZip } from "../../src/server/extensions.mjs";
import { withOutlineLock } from "../../src/shared/outline.mjs";

const root = await fs.mkdtemp(path.join(process.env.GALLERY_DATA_DIR + "-extensions-"));
const previous = { home: process.env.GALLERY_DEFAULT_WORKSPACE, data: process.env.GALLERY_DATA_DIR };
process.env.GALLERY_DEFAULT_WORKSPACE = path.join(root, "home");
process.env.GALLERY_DATA_DIR = path.join(root, "data");
let service, pid, blocked;
const running = value => { try { process.kill(value, 0); return true; } catch { return false; } };
try {
  assert.equal(decodeExtensionZip("AQI=", 2).length, 2);
  assert.throws(() => decodeExtensionZip("AQID", 2), /超过/);
  assert.throws(() => decodeExtensionZip("AQIDBA==", 2), /超过/);
  await ensureWorkspace(process.env.GALLERY_DEFAULT_WORKSPACE);
  const source = path.join(root, "sample"); await fs.mkdir(source);
  const manifest = { id: "sample", name: "Sample", version: "1.0.0", icon: "icon.png", workbench: { script: "workbench.js", style: "workbench.css" }, server: { command: ["node", "server.mjs"], timeout: 90000 }, agent: "AGENT.md" };
  const files = {
    "extension.json": JSON.stringify(manifest), "icon.png": "test icon", "workbench.js": "export function activate(api) { api.slot('topbar-end').textContent = 'Test extension'; }", "workbench.css": ".sample { color: red }", "AGENT.md": "Use the sample API.",
    "value.mjs": "export const value = 1;",
    "server.mjs": "import http from 'node:http'; import {value} from './value.mjs'; http.createServer((req,res)=>{if(req.url.startsWith('/slow'))return;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({pid:process.pid,path:req.url,cwd:process.cwd(),value,columns:process.env.GALLERY_EXTENSION_COLUMNS}))}).listen(Number(process.env.GALLERY_EXTENSION_PORT),'127.0.0.1');",
  };
  for (const [name, body] of Object.entries(files)) await fs.writeFile(path.join(source, name), body);
  const installed = await installExtension(source);
  assert.equal(installed.id, "sample"); assert.ok(installed.agent.endsWith("AGENT.md"));
  const first = (await listCapabilities())[0]; assert.equal(first.enabled, false);
  // Resolving one asset keeps all validation, without inspecting unrelated manifests.
  const unrelated = path.join(path.dirname(installed.folder), "unrelated");
  await fs.mkdir(unrelated);
  await fs.writeFile(path.join(unrelated, "extension.json"), "{}");
  const originalRead = fs.readFile;
  const reads = [];
  fs.readFile = (file, ...args) => {
    // Other unit files may still be finishing document reads; observe this host's files only.
    if (String(file).startsWith(root + path.sep)) reads.push(String(file));
    return originalRead(file, ...args);
  };
  let idleHost;
  try {
    assert.deepEqual(await listCapabilities({ ids: ["sample"] }), [first]);
    assert.ok(!reads.some(file => file.startsWith(unrelated)), "unrelated manifests are not read");
    assert.deepEqual(await listCapabilities({ ids: ["missing"] }), []);
    reads.length = 0;
    idleHost = createExtensions({ edits: null });
    await new Promise(resolve => setTimeout(resolve, 1100));
    assert.deepEqual(reads, [], "an idle extension host does not poll manifests or configuration");
  } finally {
    await idleHost?.close();
    fs.readFile = originalRead;
    await fs.rm(unrelated, { recursive: true });
  }
  service = await startProductionServer({ port: 0, web: null, signals: false, watch: false, log: { log() {}, warn() {}, error: console.error } });
  const origin = `http://127.0.0.1:${service.port}`;
  const info = await (await fetch(origin + "/__gallery/workspace/info")).json();
  assert.equal(await (await fetch(origin + "/__gallery/extensions/sample/icon")).text(), "test icon", "an icon is available while disabled");
  const headers = { Origin: origin, "Content-Type": "application/json", "X-Gallery-Token": info.token };
  const cli = (...args) => promisify(execFile)(process.execPath, [path.resolve("src/cli/bin.mjs"), "extension", ...args], { env: { ...process.env, GALLERY_NO_UPDATE_CHECK: "1", GALLERY_NO_BROWSER: "1" }, timeout: 30000 });
  const streamAbort = new AbortController();
  const events = await fetch(origin + "/__gallery/events?workspace", { signal: streamAbort.signal });
  const reader = events.body.getReader();
  const event = (async () => { let text = ""; for (;;) { const part = await reader.read(); if (part.done) return text; text += Buffer.from(part.value).toString(); if (text.includes("extensions sample")) return text; } })();
  const enable = confirmed => fetch(origin + "/__gallery/extensions", { method: "POST", headers, body: JSON.stringify({ id: "sample", enabled: true, revision: first.manifest.revision, confirmed }) });
  assert.equal((await fetch(origin + "/__gallery/extensions/sample/files/workbench.js")).status, 403);
  assert.equal((await enable(false)).status, 200, "the token is sufficient to enable an extension");
  assert.match(await Promise.race([event, new Promise((_, reject) => setTimeout(() => reject(new Error("extension event missing")), 3000))]), /extensions sample/);
  streamAbort.abort();
  assert.equal((await enable(true)).status, 200);
  assert.match(await (await fetch(origin + "/__gallery/extensions/sample/files/workbench.js")).text(), /export function activate/);
  assert.equal((await fetch(origin + "/__gallery/extensions/sample/api/status", { headers: { ...headers, Origin: "https://example.com" } })).status, 403);
  const api = async () => {
    const response = await fetch(origin + "/__gallery/extensions/sample/api/status?test=1", { headers });
    assert.equal(response.status, 200, await response.clone().text()); return response.json();
  };
  const answer = await api(); pid = answer.pid;
  assert.equal((await (await fetch(origin + "/__gallery/extensions")).json()).extensions[0].backend.state, "running");
  const browserHeaders = { Referer: origin + "/", "X-Gallery-Token": info.token };
  assert.equal((await fetch(origin + "/__gallery/extensions/sample/api/status", { headers: browserHeaders })).status, 200, "same-origin browser GET has Referer, not Origin");
  assert.equal((await fetch(origin + "/__gallery/extensions/sample/api/status", { headers: { ...browserHeaders, Referer: "https://example.com/" } })).status, 403);
  assert.equal((await fetch(origin + "/__gallery/extensions/sample/api/status", { method: "POST", headers: browserHeaders })).status, 403, "writes still require Origin");
  assert.equal(answer.path, "/status?test=1"); assert.equal(answer.cwd, installed.folder);
  assert.equal(answer.columns, path.join(installed.folder, "columns"), "the backend is told where its columns go");
  // An address worked out from the script's own (files/@revision/<revision>/workbench.js, new URL('../api/',
  // import.meta.url)): told where the backend is, by any method, and said on the extension's card.
  const revision = (await listCapabilities())[0].manifest.revision;
  for (const [method, route] of [["GET", "@revision/api/status"], ["POST", "@revision/api/publish"], ["GET", `@revision/${revision}/api/status`]]) {
    const moved = await fetch(`${origin}/__gallery/extensions/sample/files/${route}`, { method, headers });
    const body = await moved.json();
    assert.equal(moved.status, 404, `${method} ${route}`);
    assert.equal(body.reason, "backend-address"); assert.equal(body.backend, "/__gallery/extensions/sample/api/");
    assert.match(body.message, /后台在 \/__gallery\/extensions\/sample\/api\/.*api\.fetch\(path\)/);
  }
  assert.match((await (await fetch(origin + "/__gallery/extensions")).json()).extensions.find(item => item.id === "sample").workbenchError, /api\.fetch\(path\)/, "the card says it too");
  assert.equal((await fetch(origin + "/__gallery/extensions/sample/files/missing.js")).status, 400, "a missing file elsewhere is still a missing file");
  assert.equal((await fetch(origin + "/__gallery/extensions/sample/files/workbench.js", { method: "POST", headers })).status, 405, "and a write to a file is still refused");
  process.kill(pid);
  await new Promise(resolve => setTimeout(resolve, 1300));
  const restarted = await api(); assert.notEqual(restarted.pid, pid); pid = restarted.pid;
  await fs.writeFile(path.join(installed.folder, 'value.mjs'), 'export const value = 2;');
  const deadline = Date.now() + 10000;
  let changed = restarted;
  while (changed.value !== 2 && Date.now() < deadline) { await new Promise(resolve => setTimeout(resolve, 150)); changed = await api(); }
  assert.equal(changed.value, 2, 'editing a backend dependency restarts the running child');
  assert.notEqual(changed.pid, pid); assert.equal(running(pid), false); pid = changed.pid;
  files['value.mjs'] = 'export const value = 2;';
  const outside = path.join(root, "secret"); await fs.writeFile(outside, "secret");
  await assert.rejects(extensionFile(installed.folder, "../secret"));
  const linked = path.join(installed.folder, "outside");
  await fs.symlink(root, linked, process.platform === "win32" ? "junction" : "dir");
  await assert.rejects(extensionFile(installed.folder, "outside/secret"), /符号链接/);
  await fs.unlink(linked);
  // The path-safety fixture itself changed the extension directory. Let its watcher settle
  // before checking that an unchanged install (which writes no extension files) keeps the child.
  for (const until = Date.now() + 5000; ;) {
    const revision = (await listCapabilities())[0].manifest.revision;
    await new Promise(resolve => setTimeout(resolve, 200));
    if (revision === (await listCapabilities())[0].manifest.revision) break;
    assert.ok(Date.now() < until, 'extension directory changes settle');
  }
  pid = (await api()).pid;
  const zip = path.join(root, "sample.zip"); await fs.writeFile(zip, createZip(Object.entries(files).map(([name, data]) => ({ name: "sample/" + name, data }))));
  // The columns its program wrote are the installed extension's: no part of the package, kept by an update.
  const columnsFile = path.join(installed.folder, "columns", "docs.json"), columnsText = JSON.stringify({ title: "语雀文档", entries: [{ id: "a", title: "甲" }] });
  await fs.mkdir(path.dirname(columnsFile)); await fs.writeFile(columnsFile, columnsText);
  const unchanged = await installExtension(zip);
  assert.equal(unchanged.did, "unchanged");
  assert.equal(running(pid), true, "unchanged install retains its backend");
  const beforeUpdate = (await listCapabilities())[0].manifest.revision;
  files["workbench.js"] += "\n// updated";
  await fs.writeFile(zip, createZip(Object.entries(files).map(([name, data]) => ({ name: "sample/" + name, data }))));
  const updated = await installExtension(zip);
  assert.equal(updated.did, "updated");
  assert.equal(await fs.readFile(columnsFile, "utf8"), columnsText, "an update keeps columns/ as it was");
  assert.notEqual((await listCapabilities())[0].manifest.revision, beforeUpdate, "updating code without changing extension.json changes revision");
  assert.equal((await listCapabilities())[0].enabled, true, "replacement preserves the switch");
  assert.equal(running(pid), false, "replacement stops the old backend before swapping its files");
  assert.equal((await enable(true)).status, 200);
  pid = (await api()).pid;
  // A request the backend is still answering when the extension is disabled: told it is disabled, not a 502.
  const inflight = fetch(origin + "/__gallery/extensions/sample/api/slow", { headers });
  await new Promise(resolve => setTimeout(resolve, 300));
  const disabled = await fetch(origin + "/__gallery/extensions", { method: "POST", headers, body: JSON.stringify({ id: "sample", enabled: false, revision: first.manifest.revision }) });
  assert.equal(disabled.status, 200);
  const broken = await inflight;
  assert.deepEqual([broken.status, (await broken.json()).reason], [403, "disabled"], "an in-flight request is told the extension was disabled");
  assert.equal(running(pid), false, "disable waits for the backend to exit");
  assert.equal((await fetch(origin + "/__gallery/extensions/sample/api/status", { headers })).status, 403);
  assert.equal((await enable(false)).status, 200, "an unchanged extension retains the user's confirmation");
  pid = (await api()).pid;
  assert.equal(running(pid), true, "shutdown below has an active backend to stop");
  const bad = path.join(root, "bad.zip"); await fs.writeFile(bad, createZip([{ name: "extension.json", data: JSON.stringify(manifest) }, { name: "../secret", data: "bad" }]));
  await assert.rejects(installExtension(bad)); assert.equal(await fs.readFile(outside, "utf8"), "secret");
  const postInstall = body => fetch(origin + "/__gallery/extensions/install", { method: "POST", headers, body: JSON.stringify(body) });
  assert.equal((await postInstall({ zip: "not base64!" })).status, 400);
  assert.equal((await postInstall({ zip: (await fs.readFile(bad)).toString("base64") })).status, 400, "base64 ZIP cannot escape its stage");
  const fromZip = await (await postInstall({ zip: (await fs.readFile(zip)).toString("base64"), enable: true })).json();
  assert.equal(fromZip.installed.did, "unchanged"); assert.equal(fromZip.installed.enabled, true);
  // Hold the existing write lock so a real install remains in flight while a watcher
  // client asks for the list. No intermediate entry may escape before its files are usable.
  let unlock, entered;
  const gate = new Promise(resolve => { unlock = resolve; });
  const ready = new Promise(resolve => { entered = resolve; });
  const held = withOutlineLock(process.env.GALLERY_DEFAULT_WORKSPACE, async () => { entered(); await gate; });
  await ready;
  let installing, listing, listDone = false;
  try {
    const bytes = createZip([{ name: "extension.json", data: JSON.stringify({ id: "queued", workbench: { script: "workbench.js" } }) }, { name: "workbench.js", data: "export function activate() {}" }]);
    installing = postInstall({ zip: bytes.toString("base64"), enable: true });
    const folder = path.join(process.env.GALLERY_DEFAULT_WORKSPACE, "extensions");
    let staged = false;
    for (let attempt = 0; attempt < 200 && !staged; attempt++) {
      staged = (await fs.readdir(folder)).some(name => name.startsWith(".install-"));
      if (!staged) await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.ok(staged, "the install entered its mutation before the list request");
    listing = fetch(origin + "/__gallery/extensions").then(response => response.json()).then(value => { listDone = true; return value; });
    await new Promise(resolve => setTimeout(resolve, 100));
    assert.equal(listDone, false, "list waits for an in-flight installation");
  } finally { unlock(); await held; }
  assert.equal((await installing).status, 200);
  assert.equal((await listing).extensions.find(item => item.id === "queued").enabled, true);
  assert.equal((await fetch(origin + "/__gallery/extensions/queued/files/workbench.js")).status, 200, "the published script is available immediately");
  await removeExtension("queued");
  await cli("disable", "sample");
  assert.equal((await listCapabilities())[0].enabled, false);
  await cli("enable", "sample");
  const listedJSON = JSON.parse((await cli("list", "--json")).stdout);
  assert.deepEqual(listedJSON.extensions.map(({ id }) => id), ["sample"], "its column no extension of its own");
  assert.deepEqual(listedJSON.extensions[0].columns, [{ id: "docs", title: "语雀文档", count: 1, file: columnsFile }], "listed under it: id, title, entries, file");
  assert.equal(listedJSON.folder, path.dirname(installed.folder), "list --json names the extensions folder");
  assert.equal(listedJSON.extensions.find(item => item.id === "sample").enabled, true);
  pid = (await api()).pid;
  await fs.rm(path.join(installed.folder, "icon.png"));
  let missing = (await listCapabilities())[0];
  assert.equal(missing.error, "扩展引用的文件不存在"); assert.equal(missing.wanted, true);
  await fs.writeFile(path.join(installed.folder, "icon.png"), files["icon.png"]);
  await fs.rm(path.join(installed.folder, "extension.json"));
  await fs.writeFile(path.join(installed.folder, "sidebar.json"), '{"title":"sample","entries":[]}');
  missing = (await listCapabilities())[0];
  assert.equal(missing.error, "找不到 extension.json"); assert.equal(missing.wanted, true);
  assert.equal((await fetch(origin + "/__gallery/extensions", { method: "POST", headers, body: JSON.stringify({ id: "sample", enabled: false }) })).status, 200);
  assert.equal((await listCapabilities())[0].error, "找不到 extension.json", "a configured executable remains visible after disabling, even if it has a sidebar");
  assert.equal((await enable(true)).status, 400);
  await fs.writeFile(path.join(installed.folder, "extension.json"), files["extension.json"]);
  await fs.rm(path.join(installed.folder, "sidebar.json"));
  assert.equal((await enable(true)).status, 200);
  const sidebarOnly = path.join(process.env.GALLERY_DEFAULT_WORKSPACE, "extensions", "sidebar-only");
  await fs.mkdir(sidebarOnly); await fs.writeFile(path.join(sidebarOnly, "sidebar.json"), '{"title":"test","entries":[]}');
  assert.equal((await listCapabilities()).find(item => item.id === "sidebar-only").error, null);
  await fs.rm(sidebarOnly, { recursive: true });
  await fs.writeFile(path.join(installed.folder, "extension.json"), '{"server":{"command":"invalid"}}');
  assert.equal((await listCapabilities())[0].wanted, true);
  const disableBroken = await fetch(origin + "/__gallery/extensions", { method: "POST", headers, body: JSON.stringify({ id: "sample", enabled: false }) });
  assert.equal(disableBroken.status, 200, "a broken manifest can be disabled");
  assert.equal((await enable(true)).status, 400, "a broken manifest cannot be enabled");
  await service.close(); service = null;
  assert.equal(running(pid), false, "backend exits with Gallery");
  // A live announcement which accepts a connection but never answers must not allow direct writes.
  blocked = http.createServer(() => {});
  await new Promise(resolve => blocked.listen(0, "127.0.0.1", resolve));
  await fs.writeFile(path.join(process.env.GALLERY_DATA_DIR, "server.json"), JSON.stringify({ port: blocked.address().port, pid: process.pid, token: "test", home: process.env.GALLERY_DEFAULT_WORKSPACE }));
  await assert.rejects(installExtension(source), /暂时无法响应/, "a busy service must not be bypassed");
  await fs.rm(path.join(process.env.GALLERY_DATA_DIR, "server.json"));
  blocked.closeAllConnections(); await new Promise(resolve => blocked.close(resolve)); blocked = null;
  await removeExtension("sample"); assert.equal((await listCapabilities()).length, 0);
  assert.deepEqual(JSON.parse((await cli("list", "--json")).stdout), { folder: path.dirname(installed.folder), extensions: [] }, "with none, the folder an installer writes to");
  console.log("Checked extension install/ZIP replacement, switches, CLI, busy service, events, authenticated proxy, restart, removal and child shutdown.");
} finally {
  blocked?.closeAllConnections(); blocked?.close();
  await service?.close();
  if (pid && running(pid)) process.kill(pid);
  process.env.GALLERY_DEFAULT_WORKSPACE = previous.home; process.env.GALLERY_DATA_DIR = previous.data;
  await fs.rm(root, { recursive: true, force: true });
}
