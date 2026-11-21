import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const cli = fileURLToPath(new URL("../../src/cli/bin.mjs", import.meta.url));
const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-sandbox-unit-"));
const temp = path.join(scratch, "test's temporary ‘directory’");
const sandboxes = path.join(temp, "gallery-sandboxes");
const source = path.join(scratch, "source");
const realData = path.join(scratch, "real-data");
const doc = path.join(source, "sample");
const outside = path.join(scratch, "outside");
const first = path.join(scratch, "first");
const second = path.join(scratch, "second");
// An extension reached through a link on the way (macOS's /tmp is /private/tmp): linked/third is real/third.
const real = path.join(scratch, "real");
const linked = path.join(scratch, "linked");
const third = path.join(linked, "third");
const env = {
  ...process.env, TMPDIR: temp, TEMP: temp, TMP: temp, GALLERY_SANDBOX: "",
  GALLERY_NO_BROWSER: "1", GALLERY_NO_PACKS: "1", GALLERY_NO_UPDATE_CHECK: "1",
  GALLERY_NO_AUTOSTART: "1", GALLERY_DEFAULT_WORKSPACE: source, GALLERY_WORKSPACE: source,
  GALLERY_DATA_DIR: realData, GALLERY_CACHE_DIR: realData,
};
const commands = (args, override = {}) => spawnSync(process.execPath, [cli, ...args], {
  cwd: source, env: { ...env, ...override }, encoding: "utf8", windowsHide: true, timeout: 20_000,
});
const run = (args, override) => {
  const result = commands(args, override);
  assert.equal(result.status, 0, result.error?.message ?? result.stderr ?? result.stdout);
  return result.stdout;
};
const exists = file => fs.stat(file).then(() => true, () => false);
const write = (file, value) => fs.writeFile(file, JSON.stringify(value) + "\n");
const read = file => fs.readFile(file, "utf8").then(JSON.parse);
const junction = process.platform === "win32" ? "junction" : "dir";
const active = new Set();

async function until(get, message) {
  for (let end = Date.now() + 20_000; Date.now() < end; await delay(100)) {
    const result = await get();
    if (result) return result;
  }
  assert.fail(message());
}

async function start(name, args) {
  const child = spawn(process.execPath, [cli, "sandbox", "--name", name, ...args], {
    cwd: source, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"],
  });
  active.add(child);
  const output = { text: "" };
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", chunk => { output.text += chunk; });
  }
  const done = once(child, "close").then(([code]) => { active.delete(child); return code; });
  const url = await until(() => {
    assert.equal(child.exitCode, null, output.text);
    return /地址：(http:\/\/127\.0\.0\.1:\d+)\/\r?\n/.exec(output.text)?.[1];
  }, () => output.text);
  return { url, child, done, output };
}

try {
  await Promise.all([temp, doc, outside, first, second, realData, path.join(source, ".gallery", "state")].map(dir => fs.mkdir(dir, { recursive: true })));
  await fs.writeFile(path.join(outside, "sentinel"), "outside");
  await fs.symlink(outside, path.join(doc, "assets"), junction);
  await fs.writeFile(path.join(doc, "doc.html"), "<main><h1>Copied document</h1></main>\n");
  await write(path.join(doc, "doc.json"), { title: "Copied document" });
  const marker = path.join(source, "gallery.json");
  await write(marker, { gallery: "workspace", version: 1, extensions: { copied: { enabled: true } } });
  await write(path.join(source, ".gallery", "outline.json"), {
    version: 2, groups: [{ id: "docs" }, { id: "ws-abcdef", workspace: "ws-abcdef" }],
    children: { "": ["sample", "~ws-abcdef/other"], ":ws-abcdef": ["~ws-abcdef/other"] },
  });
  await fs.writeFile(path.join(source, ".gallery", "state", "sentinel"), "runtime");
  await fs.writeFile(path.join(source, ".gallery", "keys.json"), "secret");
  await fs.writeFile(path.join(realData, "workspaces.json"), "real registry sentinel");
  const copied = path.join(source, "extensions", "copied");
  await fs.mkdir(copied, { recursive: true });
  await write(path.join(copied, "extension.json"), { id: "copied" });
  await write(path.join(first, "extension.json"), { id: "first", workbench: { script: "index.mjs" } });
  await fs.writeFile(path.join(first, "index.mjs"), "export function activate() {}\n");
  await write(path.join(second, "extension.json"), { id: "second" });
  await fs.mkdir(path.join(real, "third"), { recursive: true });
  await write(path.join(real, "third", "extension.json"), { id: "third" });
  await fs.symlink(real, linked, junction);
  // The extension's folder itself a link: refused, as install refuses it, before any sandbox is made.
  await fs.symlink(path.join(real, "third"), path.join(scratch, "third-link"), junction);
  const refused = commands(["sandbox", "--name", "linked-folder", "--extension", path.join(scratch, "third-link")]);
  assert.equal(refused.status, 1, refused.stdout + refused.stderr);
  assert.match(refused.stderr, /扩展文件夹本身不能是符号链接/);
  assert.equal(await exists(path.join(sandboxes, "linked-folder")), false);

  assert.equal(commands(["sandbox", "stop", "../outside"]).status, 2);
  assert.equal(commands(["sandbox", "--workspace", source]).status, 2);
  assert.equal(commands(["sandbox", "--name", "con"]).status, 2);
  assert.equal(commands(["sandbox", "--name", "invalid-copy", "--from", outside]).status, 1);
  assert.equal(await exists(path.join(sandboxes, "invalid-copy")), false);
  await fs.symlink(outside, path.join(sandboxes, "unsafe"), junction);
  assert.equal(commands(["sandbox", "stop", "unsafe"]).status, 1);
  const redirected = path.join(scratch, "redirected-temp");
  await fs.mkdir(redirected);
  await fs.symlink(outside, path.join(redirected, "gallery-sandboxes"), junction);
  assert.equal(commands(["sandbox", "--name", "unsafe"], { TMPDIR: redirected, TEMP: redirected, TMP: redirected }).status, 1);
  assert.equal(await exists(path.join(outside, "unsafe")), false);
  assert.equal(await fs.readFile(path.join(outside, "sentinel"), "utf8"), "outside");

  const name = "isolated";
  const box = path.join(sandboxes, name), home = path.join(box, "home"), data = path.join(box, "data");
  const { url, done } = await start(name, ["--from", source, "--demo", "--extension", first, "--extension=" + second, "--extension", third]);
  const get = route => fetch(url + route, { signal: AbortSignal.timeout(5000) }).then(response => response.json());
  const info = await get("/__gallery/workspace/info");
  const post = (route, body) => fetch(url + route, {
    method: "POST", headers: { Origin: url, "Content-Type": "application/json", "X-Gallery-Token": info.token },
    body: JSON.stringify(body), signal: AbortSignal.timeout(5000),
  });
  assert.equal(info.server.sandbox, name);
  assert.equal(path.relative(home, info.server.home), "");
  assert.equal(path.relative(data, info.server.data), "");
  assert.equal((await get("/__gallery/startup")).available, false);
  assert.equal((await post("/__gallery/startup", { enabled: true })).status, 400);
  assert.equal((await post("/__gallery/workspace/draft-add", { path: outside, confirm: true })).status, 403);
  assert.equal(await exists(path.join(outside, "gallery.json")), false);
  const outline = await get("/__gallery/workspace/outline");
  assert.equal(outline.sandbox, name);
  assert.ok(outline.reports.sample && outline.reports["sandbox-notes"] && outline.reports["sandbox-checklist"]);
  assert.ok(!JSON.stringify(outline).includes("ws-abcdef"));
  assert.equal(await exists(path.join(home, "sample", "assets")), false);
  assert.equal(await exists(path.join(home, ".gallery", "state", "sentinel")), false);
  assert.equal(await exists(path.join(home, ".gallery", "keys.json")), false);
  assert.equal((await fetch(url)).status, 200);
  assert.equal((await fetch(url + "/kit/code.js")).status, 200);
  const listed = run(["sandbox", "list"]);
  assert.ok(listed.includes(url) && !listed.includes("unsafe"), listed);
  const exports = run(["sandbox", "env", name]);
  assert.match(exports, /GALLERY_NO_AUTOSTART\s*=\s*'1'/);
  assert.ok(exports.includes("CODEX_HOME") && exports.includes("CLAUDE_CONFIG_DIR"), exports);
  assert.ok(exports.includes(process.platform === "win32" ? "Set-Location -LiteralPath" : "cd --"), exports);
  assert.ok(exports.includes(process.platform === "win32" ? "test''s" : "test'\\''s"), exports);
  assert.ok(exports.includes(process.platform === "win32" ? "‘‘directory’’" : "‘directory’"), exports);
  const isolatedEnv = { GALLERY_SANDBOX: name, GALLERY_WORKSPACE: home, GALLERY_DEFAULT_WORKSPACE: home, GALLERY_DATA_DIR: data, GALLERY_CACHE_DIR: path.join(box, "cache") };
  assert.ok(run(["open", "--no-browser"], isolatedEnv).includes(url));
  assert.equal(commands(["new", "unexpected", "Outside", "--workspace", outside, "--no-preview"], isolatedEnv).status, 2);
  assert.equal(await exists(path.join(outside, "unexpected")), false);

  const capabilities = async () => (await get("/__gallery/extensions")).extensions;
  const enabled = (await capabilities()).filter(item => item.enabled).map(item => item.id).sort();
  assert.deepEqual(enabled, ["first", "second", "third"], "a link on the way to an extension is resolved");
  assert.equal((await post("/__gallery/extensions", { id: "first", enabled: false })).status, 200);
  const edited = "export function activate() { return () => {}; }\n";
  await fs.writeFile(path.join(first, "index.mjs"), edited);
  const installed = path.join(home, "extensions", "first", "index.mjs");
  await until(() => fs.readFile(installed, "utf8").then(text => text === edited, () => false), () => "the extension copy did not update");
  assert.equal((await capabilities()).find(item => item.id === "first").enabled, false);
  assert.equal((await read(marker)).extensions.copied.enabled, true);
  assert.equal(await fs.readFile(path.join(realData, "workspaces.json"), "utf8"), "real registry sentinel");
  run(["sandbox", "stop", name]);
  assert.equal(await done, 0);
  assert.equal(await exists(box), false);

  const kept = await start("kept", ["--keep"]);
  if (process.platform === "win32") run(["sandbox", "stop", "kept"]);
  else kept.child.kill("SIGINT");
  assert.equal(await kept.done, 0, kept.output.text);
  assert.equal(await exists(path.join(sandboxes, "kept", "home", "gallery.json")), true);
  assert.equal(await exists(path.join(sandboxes, "kept", "data", "server.json")), false);
  assert.match(run(["sandbox", "list"]), /kept\s+（已停止）/);
  assert.equal(await fs.readFile(path.join(outside, "sentinel"), "utf8"), "outside");
} finally {
  for (const child of active) child.kill();
  await Promise.all([...active].map(child => once(child, "close")));
  await fs.rm(scratch, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

console.log("Checked sandbox copying, workspace isolation, startup protection, extension reload and enable state, an extension reached through a link (and one that is a link refused), and shutdown with or without --keep.");
