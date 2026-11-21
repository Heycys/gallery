import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { JSDOM } from "jsdom";
import { createStartup } from "../../src/shared/startup.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-startup-"));
let registered = null, calls = [], denied = false;
const run = async (program, args) => {
  assert.equal(program, "reg.exe"); calls.push(args);
  if (args[0] === "query") {
    if (registered === null) throw Object.assign(new Error("not found"), { code: 1 });
    return { stdout: `    HeycysGallery    REG_SZ    ${registered}\r\n` };
  }
  if (denied) throw new Error("access denied");
  if (args[0] === "add") registered = args[args.indexOf("/d") + 1];
  else if (args[0] === "delete") registered = null;
  else throw Error("unexpected registry operation");
  return { stdout: "" };
};
try {
  const home = path.join(root, "用户 & home"), data = path.join(home, "startup data");
  const cli = path.join(root, "fake gallery.mjs"), result = path.join(root, "launched.json");
  await fs.writeFile(cli, `import fs from 'node:fs'; fs.writeFileSync(${JSON.stringify(result)}, JSON.stringify({args:process.argv.slice(2),data:process.env.GALLERY_DATA_DIR,noBrowser:process.env.GALLERY_NO_BROWSER}));`);
  const options = { home, data, workspace: path.join(home, "文档"), cli, platform: "win32", available: true, run };
  let manager = createStartup(options);
  assert.deepEqual(await manager.status(), { supported: true, available: true, enabled: false, requested: true });
  assert.equal((await manager.sync()).enabled, true, "first installed start enables login startup");
  assert.match(registered, /wscript\.exe/);
  assert.match(registered, /\/\/B/);
  calls = []; await manager.sync();
  assert.ok(calls.every(args => args[0] === "query"), "same registration is not rewritten on each start");
  const script = await fs.readFile(path.join(data, "startup.js"), "utf8");
  assert.doesNotMatch(script, /[^\x00-\x7f]/, "WSH source is code-page independent");
  if (process.platform === "win32") {
    await promisify(execFile)(path.join(process.env.SystemRoot, "System32", "wscript.exe"), ["//B", "//Nologo", path.join(data, "startup.js")], { windowsHide: true, timeout: 5000 });
    for (let end = Date.now() + 5000; !await fs.stat(result).catch(() => null) && Date.now() < end;) await new Promise(resolve => setTimeout(resolve, 25));
    assert.deepEqual(JSON.parse(await fs.readFile(result, "utf8")), { args: ["startup", "run"], data, noBrowser: "1" }, "real WSH launcher preserves Chinese/spaced paths and opens no browser");
  }
  await manager.set(false);
  manager = createStartup(options);
  assert.equal((await manager.sync()).enabled, false, "disabled choice survives a new process/update");
  assert.equal(registered, null);
  denied = true;
  await assert.rejects(manager.set(true), /access denied/);
  assert.equal((await manager.status()).enabled, false, "failed installation is never reported enabled");
  denied = false;
  assert.equal((await manager.sync()).enabled, true, "failed operation can be retried");
  await manager.set(false);

  const mac = createStartup({ ...options, platform: "darwin", data: path.join(home, "mac-data"), workspace: "/Users/a & b/<docs>", run: () => { throw Error("no shell needed"); } });
  await mac.sync();
  const plist = path.join(home, "Library", "LaunchAgents", "com.heycys.gallery.plist");
  const dom = new JSDOM(await fs.readFile(plist, "utf8"), { contentType: "text/xml" });
  const doc = dom.window.document;
  assert.equal(doc.querySelector("parsererror"), null);
  const values = [...doc.querySelectorAll("key")];
  assert.equal(values.find(node => node.textContent === "RunAtLoad").nextElementSibling.tagName, "true");
  assert.equal(values.find(node => node.textContent === "AbandonProcessGroup").nextElementSibling.tagName, "true");
  assert.equal(values.find(node => node.textContent === "GALLERY_DEFAULT_WORKSPACE").nextElementSibling.textContent, "/Users/a & b/<docs>");
  assert.deepEqual([...values.find(node => node.textContent === "ProgramArguments").nextElementSibling.children].map(node => node.textContent), [process.execPath, cli, "startup", "run"]);
  dom.window.close();
  await mac.set(false);
  assert.equal(await fs.stat(plist).catch(() => null), null);
  await mac.sync();
  assert.equal(await fs.stat(plist).catch(() => null), null);
  const source = createStartup({ ...options, data: path.join(root, "source"), available: false });
  await source.sync();
  assert.equal(await fs.stat(path.join(root, "source")).catch(() => null), null, "source/test startup writes nothing");
  await assert.rejects(source.set(true), /installed Gallery/);
  console.log("Checked login startup: Windows registration lifecycle and real hidden WSH launch, macOS plist semantics, persisted disable, errors and source isolation. macOS login itself requires a Mac.");
} finally { await fs.rm(root, { recursive: true, force: true }); }
