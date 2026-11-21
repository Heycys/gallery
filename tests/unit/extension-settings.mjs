import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ensureWorkspace, layoutOf } from "../../src/shared/workspace.mjs";
import { SETTING_TYPES, changesProblem, isSettingKey, settingsOf, settingsProblem, settingsValues, storedAfter } from "../../src/shared/extension-settings.mjs";
import { listCapabilities, readManifest, setExtensionEnabled, setExtensionSettings, settingsFile } from "../../src/shared/extension-manifest.mjs";
import { dropGoneExtensions, readOutline } from "../../src/shared/outline.mjs";
import { installExtension, removeExtension } from "../../src/server/extension-install.mjs";
import { startProductionServer } from "../../src/server/production.mjs";

// An extension's own settings (skills/gallery/references/extensions.md "Settings"; shared/extension-settings.mjs): the
// manifest's `settings` checked (a type Gallery does not know said, keys safe and once each, the default of
// its type), the values (gallery.json keeps the user's that differ from the default; the backend's file in
// .gallery/extensions/<id>/settings.json every key's, written before the backend starts and at each change,
// GALLERY_EXTENSION_SETTINGS), POST /__gallery/extensions/settings (refused while the extension is off; the
// running backend reads the new value with no restart), gallery extension settings, a remove taking them
// along; and the columns of extensions that are gone taken out of the outline file (shared/outline.mjs
// dropGoneExtensions) as the server starts and as an extension is removed, a disabled one's and the user's
// columns kept.

const message = (problem) => problem?.message ?? null;

// ---------- the declaration ----------
{
  const item = { key: "uniformLook", type: "boolean", label: "统一排版", default: true, help: "发布时统一标题、正文和表格的样式" };
  assert.equal(settingsProblem([item]), null);
  assert.equal(settingsProblem([]), null, "none is a list too");
  assert.equal(settingsProblem([{ key: "plain", type: "boolean", label: "无默认" }]), null, "a default may be left out");
  assert.match(message(settingsProblem({})), /settings 必须是数组/);
  assert.match(message(settingsProblem([item, { ...item, label: "又一个" }])), /settings\[1\]\.key 重复：uniformLook/, "a key once");
  assert.match(message(settingsProblem([{ ...item, type: "select" }])), /settings\[0\]\.type 不认识："select"（现在只支持 boolean）/, "a type Gallery does not know yet is said, so select can come later");
  assert.match(message(settingsProblem([{ ...item, type: undefined }])), /type 不认识/);
  for (const key of ["__proto__", "constructor", "toString", "1st", "has space", "a-b", "", "x".repeat(65), 7]) assert.match(message(settingsProblem([{ ...item, key }])), /key 必须是/, `${String(key)} is no key`);
  for (const key of ["a", "_x", "uniform_look2", "X".repeat(64)]) assert.ok(isSettingKey(key), `${key} is a key`);
  assert.match(message(settingsProblem([{ ...item, label: "  " }])), /label 必须是 1 到 100/);
  assert.match(message(settingsProblem([{ ...item, label: undefined }])), /label/, "a label is needed");
  assert.match(message(settingsProblem([{ ...item, help: 5 }])), /help/);
  assert.match(message(settingsProblem([{ ...item, default: "yes" }])), /settings\[0\]\.default 必须是 boolean 类型的值/, "the default is of its type");
  assert.match(message(settingsProblem(["x"])), /settings\[0\] 必须是对象/);
  assert.match(message(settingsProblem(Array.from({ length: 51 }, (_, index) => ({ ...item, key: `k${index}` })))), /最多 50 项/);

  const declared = settingsOf({ settings: [item, { key: "compact", type: "boolean", label: "  紧凑  显示 " }] });
  assert.deepEqual(declared, [
    { key: "uniformLook", type: "boolean", label: "统一排版", help: item.help, default: true },
    { key: "compact", type: "boolean", label: "紧凑 显示", default: false },
  ], "the default filled in (false for a boolean), the label tidied");
  assert.deepEqual(settingsOf({}), []);
  assert.deepEqual(settingsValues(declared, undefined), { uniformLook: true, compact: false }, "nothing chosen: the defaults");
  assert.deepEqual(settingsValues(declared, { uniformLook: false, compact: "yes", gone: 1 }), { uniformLook: false, compact: false }, "a value of another type and a key no longer declared passed over");
  assert.deepEqual(storedAfter(declared, {}, { uniformLook: false }), { uniformLook: false }, "kept: a value other than the default");
  assert.deepEqual(storedAfter(declared, { uniformLook: false, gone: 1 }, { uniformLook: true }), {}, "back to its default: it follows the default again");
  assert.deepEqual(storedAfter(declared, { uniformLook: false }, { compact: true }), { uniformLook: false, compact: true });
  assert.equal(changesProblem(declared, { compact: true }), null);
  assert.match(message(changesProblem(declared, { nope: true })), /没有这个设置：nope/);
  assert.match(message(changesProblem(declared, { compact: "true" })), /compact 的值必须是 boolean 类型/);
  assert.match(message(changesProblem(declared, {})), /要改的设置不正确/);
  assert.match(message(changesProblem(declared, null)), /要改的设置不正确/);
  assert.deepEqual(["true", "ON", "false", "off", "yes"].map(SETTING_TYPES.boolean.parse), [true, true, false, false, undefined]);
}

const root = await fs.mkdtemp(path.join(process.env.GALLERY_DATA_DIR + "-settings-"));
const previous = { home: process.env.GALLERY_DEFAULT_WORKSPACE, data: process.env.GALLERY_DATA_DIR };
process.env.GALLERY_DEFAULT_WORKSPACE = path.join(root, "home");
process.env.GALLERY_DATA_DIR = path.join(root, "data");
const home = process.env.GALLERY_DEFAULT_WORKSPACE;
let service, pid;
const running = (value) => { try { process.kill(value, 0); return true; } catch { return false; } };
const cli = (...args) => promisify(execFile)(process.execPath, [path.resolve("src/cli/bin.mjs"), "extension", ...args], { env: { ...process.env, GALLERY_NO_UPDATE_CHECK: "1", GALLERY_NO_BROWSER: "1" }, timeout: 30000 });
const config = async () => JSON.parse(await fs.readFile(path.join(home, "gallery.json"), "utf8"));
try {
  await ensureWorkspace(home);

  // ---------- the manifest ----------
  const source = path.join(root, "yuque-publish"); await fs.mkdir(source);
  const manifest = {
    id: "yuque-publish", name: "语雀发布", version: "1.0.0",
    server: { command: ["node", "server.mjs"] },
    settings: [{ key: "uniformLook", type: "boolean", label: "统一排版", default: true, help: "发布时统一标题、正文和表格的样式" }, { key: "compact", type: "boolean", label: "紧凑" }],
  };
  await fs.writeFile(path.join(source, "extension.json"), JSON.stringify(manifest));
  // Its backend reads the file each time it is asked, as an extension's should: its pid says whether it restarted.
  await fs.writeFile(path.join(source, "server.mjs"), "import http from 'node:http'; import fs from 'node:fs'; http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({pid:process.pid,file:process.env.GALLERY_EXTENSION_SETTINGS,settings:JSON.parse(fs.readFileSync(process.env.GALLERY_EXTENSION_SETTINGS,'utf8'))}))}).listen(Number(process.env.GALLERY_EXTENSION_PORT),'127.0.0.1');");
  assert.deepEqual((await readManifest(source)).settings, manifest.settings, "a manifest with settings reads");
  const broken = path.join(root, "broken"); await fs.mkdir(broken);
  await fs.writeFile(path.join(broken, "extension.json"), JSON.stringify({ settings: [{ key: "mode", type: "select", label: "模式", default: "a" }] }));
  await assert.rejects(readManifest(broken), /settings\[0\]\.type 不认识："select"/, "an unknown type fails the manifest");
  await assert.rejects(installExtension(broken), /type 不认识/, "and its install");
  const placed = path.join(layoutOf(home).extensions, "broken");
  await fs.mkdir(placed, { recursive: true }); await fs.copyFile(path.join(broken, "extension.json"), path.join(placed, "extension.json"));
  const check = await cli("check", "broken").catch((error) => error);
  assert.ok(check.code === 1 && /FAIL .*extension\.json: settings\[0\]\.type 不认识："select"/.test(check.stderr), `gallery extension check fails on it, saying why: ${check.stderr}`);
  assert.match((await listCapabilities({ ids: ["broken"] }))[0].error, /type 不认识/, "the extension's error in 设置 says it too");
  await fs.rm(placed, { recursive: true });

  const installed = await installExtension(source);
  const id = installed.id;
  assert.equal(id, "yuque-publish");
  let item = (await listCapabilities({ ids: [id] }))[0];
  assert.deepEqual(item.settings, { uniformLook: true, compact: false }, "listed with the defaults");
  await assert.rejects(setExtensionSettings({ id, values: { uniformLook: false } }), (error) => error.reason === "disabled" && /扩展已停用/.test(error.message), "refused while it is switched off");
  await setExtensionEnabled({ id, enabled: true });

  // ---------- the outline as the server starts: the columns of extensions that are gone taken out ----------
  await fs.mkdir(path.join(layoutOf(home).extensions, "sleeper", "columns"), { recursive: true }); // there, switched off
  await fs.writeFile(path.join(layoutOf(home).extensions, "sleeper", "extension.json"), "{}");
  await fs.writeFile(path.join(layoutOf(home).extensions, "sleeper", "columns", "wiki.json"), JSON.stringify({ title: "睡", entries: [] }));
  const stale = {
    version: 2, children: { "": [] }, head: ["search", "new"], favorites: ["kept"],
    groups: [
      { id: "docs" },
      { id: "ext-yuque", extension: "yuque" }, // 0.2.4's: extensions/yuque/ deleted by hand
      { id: `ext-${id}:docs`, extension: `${id}:docs` }, // there
      { id: "ext-sleeper:wiki", extension: "sleeper:wiki" }, // disabled: its place stays
      { id: "ext-gone:wiki", extension: "gone:wiki" }, // a columns/ column of one that is gone
      { id: "ext-mine", title: "我的栏", children: { "": [] } }, // the user's, whatever its id says
      { id: "ext-other", extension: "yuque", title: "x" }, // not an extension's (its id is not its source's): the user's
    ],
  };
  await fs.mkdir(path.dirname(layoutOf(home).outline), { recursive: true });
  await fs.writeFile(layoutOf(home).outline, JSON.stringify(stale, null, 2));
  assert.ok(!(await readOutline(home)).groups.some((group) => ["ext-yuque", "ext-gone:wiki"].includes(group.id)), "the read never shows a gone extension's column (no empty column in the sidebar)");

  service = await startProductionServer({ port: 0, web: null, signals: false, watch: false, log: { log() {}, warn: console.warn, error: console.error } });
  const ids = async () => JSON.parse(await fs.readFile(layoutOf(home).outline, "utf8")).groups.map((group) => group.id);
  for (const until = Date.now() + 5000; (await ids()).includes("ext-yuque") && Date.now() < until;) await new Promise((resolve) => setTimeout(resolve, 50));
  const pruned = JSON.parse(await fs.readFile(layoutOf(home).outline, "utf8"));
  assert.deepEqual(pruned.groups.map((group) => group.id), ["docs", `ext-${id}:docs`, "ext-sleeper:wiki", "ext-mine", "ext-other"], "as Gallery starts, the columns of gone extensions leave the file: a disabled one's and the user's stay");
  assert.deepEqual([pruned.head, pruned.favorites, pruned.groups.at(-2)], [stale.head, stale.favorites, stale.groups[5]], "and nothing else of the file changes");
  assert.deepEqual(await dropGoneExtensions(home), [], "nothing more to take out: nothing written");

  // ---------- the backend reads its file; a change needs no restart ----------
  const origin = `http://127.0.0.1:${service.port}`;
  const info = await (await fetch(origin + "/__gallery/workspace/info")).json();
  const headers = { Origin: origin, "Content-Type": "application/json", "X-Gallery-Token": info.token };
  const ask = async () => { const response = await fetch(origin + `/__gallery/extensions/${id}/api/settings`, { headers }); assert.equal(response.status, 200, await response.clone().text()); return response.json(); };
  const set = (values) => fetch(origin + "/__gallery/extensions/settings", { method: "POST", headers, body: JSON.stringify({ id, values }) });
  let answer = await ask(); pid = answer.pid;
  assert.equal(answer.file, settingsFile(id));
  assert.equal(answer.file, path.join(home, ".gallery", "extensions", id, "settings.json"), "GALLERY_EXTENSION_SETTINGS: the default workspace's .gallery/extensions/<id>/settings.json");
  assert.deepEqual(answer.settings, { uniformLook: true, compact: false }, "written before it started, the defaults filled in");
  assert.deepEqual(await config().then((value) => value.extensions[id]), { enabled: true }, "nothing chosen yet: nothing kept");
  const switched = await set({ uniformLook: false });
  assert.equal(switched.status, 200);
  assert.deepEqual((await switched.json()).settings, { uniformLook: false, compact: false });
  answer = await ask();
  assert.deepEqual(answer.settings, { uniformLook: false, compact: false }, "the next read of the file says false");
  assert.equal(answer.pid, pid, "with no restart of the backend");
  assert.deepEqual(await config().then((value) => value.extensions[id]), { enabled: true, settings: { uniformLook: false } }, "kept beside its switch in gallery.json");
  const listed = (await (await fetch(origin + "/__gallery/extensions")).json()).extensions.find((value) => value.id === id);
  assert.deepEqual([listed.settings, listed.manifest.settings.length], [{ uniformLook: false, compact: false }, 2], "the list carries the values (the workbench's api.settings) and the declarations");
  assert.deepEqual([(await set({ nope: true })).status, (await (await set({ compact: "yes" })).json()).reason], [400, "settings"], "a key not declared, a value of another type: refused");
  assert.equal((await set({ uniformLook: true })).status, 200);
  assert.deepEqual(await config().then((value) => value.extensions[id]), { enabled: true }, "set back to its default: gallery.json keeps nothing of it");
  assert.deepEqual((await ask()).settings, { uniformLook: true, compact: false });

  // ---------- gallery extension settings, through the service ----------
  const shown = JSON.parse((await cli("settings", id, "uniformLook=off", "compact=on", "--json")).stdout);
  assert.deepEqual(shown.settings.map(({ key, value, default: given }) => [key, value, given]), [["uniformLook", false, true], ["compact", true, false]]);
  assert.equal(shown.file, settingsFile(id));
  assert.deepEqual((await ask()).settings, { uniformLook: false, compact: true }, "set by the command, read by the backend");
  const text = (await cli("settings", id)).stdout;
  assert.match(text, /uniformLook=false {2}统一排版 \(boolean, default true\): 发布时统一标题/);
  assert.match(text, /GALLERY_EXTENSION_SETTINGS/);
  const wrong = await cli("settings", id, "nope=true").catch((error) => error);
  assert.equal(wrong.code, 2, "a key it does not declare is a mistake of the command line");
  assert.match(wrong.stderr, /No setting "nope".*uniformLook, compact/);
  assert.equal((await cli("settings", id, "compact=maybe").catch((error) => error)).code, 2);
  assert.deepEqual(JSON.parse((await cli("list", "--json")).stdout).extensions.find((value) => value.id === id).settings, { uniformLook: false, compact: true }, "list --json says them");

  // ---------- disabled: refused, kept; enabled again: as they were ----------
  assert.equal((await fetch(origin + "/__gallery/extensions", { method: "POST", headers, body: JSON.stringify({ id, enabled: false }) })).status, 200);
  const refused = await set({ compact: false });
  assert.deepEqual([refused.status, (await refused.json()).reason], [409, "disabled"], "a disabled extension's settings are not changed");
  assert.notEqual((await cli("settings", id, "compact=off").catch((error) => error)).code, 0, "nor by the command");
  assert.deepEqual(await config().then((value) => value.extensions[id]), { enabled: false, settings: { uniformLook: false, compact: true } }, "its switch alone written: the settings stay");
  assert.equal((await fetch(origin + "/__gallery/extensions", { method: "POST", headers, body: JSON.stringify({ id, enabled: true }) })).status, 200);
  answer = await ask(); pid = answer.pid;
  assert.deepEqual(answer.settings, { uniformLook: false, compact: true }, "enabled again, as they were");

  // ---------- removed: its settings and its columns' places go with it ----------
  await cli("remove", id);
  assert.equal((await config()).extensions?.[id], undefined, "gallery.json keeps nothing of it");
  await assert.rejects(fs.stat(path.dirname(settingsFile(id))), { code: "ENOENT" }, "its settings file is gone");
  assert.ok(!(await ids()).includes(`ext-${id}:docs`), "its column's place left the outline file with it");
  assert.ok((await ids()).includes("ext-sleeper:wiki"), "another's stays");
  assert.equal(running(pid), false, "its backend stopped");
  await service.close(); service = null;

  // ---------- no service: the command does the same itself ----------
  await installExtension(source, { enable: true });
  await cli("settings", id, "compact=true");
  assert.deepEqual((await config()).extensions[id], { enabled: true, settings: { compact: true } });
  assert.deepEqual(JSON.parse(await fs.readFile(settingsFile(id), "utf8")), { uniformLook: true, compact: true }, "and writes the backend's file");
  await removeExtension(id);
  assert.equal((await config()).extensions?.[id], undefined);
  console.log("Checked extension settings: the manifest's settings (types, keys, labels, defaults), the values kept in gallery.json and the backend's file (read anew with no restart), the settings route, gallery extension settings, a disabled extension's refusal, removal; and the columns of gone extensions taken out of the outline as Gallery starts and as one is removed.");
} finally {
  await service?.close();
  if (pid && running(pid)) process.kill(pid);
  process.env.GALLERY_DEFAULT_WORKSPACE = previous.home; process.env.GALLERY_DATA_DIR = previous.data;
  await fs.rm(root, { recursive: true, force: true });
}
