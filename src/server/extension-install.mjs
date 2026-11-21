import fs from "node:fs/promises";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { defaultWorkspace, layoutOf } from "../shared/workspace.mjs";
import { dropGoneExtensions, withOutlineLock } from "../shared/outline.mjs";
import { openZip } from "../transfer/zip.mjs";
import { extensionDirectory, extensionPath, forgetExtensionGrant, readManifest, setExtensionEnabled, listCapabilities } from "../shared/extension-manifest.mjs";
import { answerOf, readAnnouncement } from "../shared/preview-server.mjs";
import { createHash } from "node:crypto";
import { COLUMNS_FOLDER } from "../shared/extension-sidebar.mjs";

const MAX_BYTES = 100 * 1024 * 1024, MAX_FILES = 10000;

export async function throughService(action, body) {
  const server = await readAnnouncement();
  if (!server) return null;
  if (await answerOf(server) !== "yes") throw new Error("Gallery 服务暂时无法响应，请稍后重试扩展操作");
  const origin = `http://127.0.0.1:${server.port}`;
  const response = await fetch(`${origin}/__gallery/extensions${action ? `/${action}` : ""}`, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "X-Gallery-Token": server.token }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
  const answer = await response.json();
  if (!response.ok) throw new Error(answer.message ?? "扩展操作失败");
  return answer;
}

// Compare all files, not just the manifest: unchanged packages keep their live backend. The columns/ its
// program writes are the installed extension's, not the package's: left out, and kept on an update below.
async function digestFolder(folder) {
  const hash = createHash("sha256");
  async function visit(directory, prefix = "") {
    for (const entry of (await fs.readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!prefix && entry.name === COLUMNS_FOLDER) continue;
      const name = prefix + entry.name, file = path.join(directory, entry.name);
      hash.update(JSON.stringify([name, entry.isDirectory() ? "d" : "f"]));
      if (entry.isDirectory()) await visit(file, name + "/");
      else if (entry.isFile()) hash.update(await fs.readFile(file));
      else throw new Error("扩展只能包含普通文件和文件夹");
    }
  }
  await visit(folder);
  return hash.digest("hex");
}

export async function installExtension(source, { inService = false, beforeReplace = async () => {}, enable = false } = {}) {
  source = path.resolve(source);
  if (typeof enable !== "boolean") throw new Error("enable 必须是布尔值");
  if (!inService) { const answer = await throughService("install", { path: source, enable }); if (answer) return answer.installed; }
  const parent = layoutOf(defaultWorkspace()).extensions;
  await fs.mkdir(parent, { recursive: true });
  if ((await fs.lstat(parent)).isSymbolicLink()) throw new Error("扩展目录不能是符号链接");
  const stage = await fs.mkdtemp(path.join(parent, ".install-"));
  let bytes = 0, count = 0;
  const budget = size => { bytes += size; if (++count > MAX_FILES || bytes > MAX_BYTES) throw new Error("扩展超过 100MB 或 10000 个文件"); };
  try {
    const stat = await fs.lstat(source);
    if (stat.isSymbolicLink()) throw new Error("安装源不能是符号链接");
    if (stat.isDirectory()) {
      const copy = async (from, to) => {
        for (const entry of await fs.readdir(from, { withFileTypes: true })) {
          extensionPath(entry.name);
          const input = path.join(from, entry.name), output = path.join(to, entry.name);
          if (entry.isDirectory()) { budget(0); await fs.mkdir(output); await copy(input, output); }
          else if (entry.isFile()) { budget((await fs.stat(input)).size); await fs.copyFile(input, output); }
          else throw new Error("扩展只能包含普通文件和文件夹");
        }
      };
      await copy(source, stage);
    } else if (stat.isFile() && source.toLowerCase().endsWith(".zip")) {
      if (stat.size > MAX_BYTES) throw new Error("扩展 ZIP 超过 100MB");
      const zip = openZip(source);
      try {
        const names = new Set();
        const manifest = zip.entries.find(entry => entry.name === "extension.json") ?? zip.entries.find(entry => /^[^/]+\/extension.json$/.test(entry.name));
        if (!manifest) throw new Error("ZIP 中没有 extension.json");
        const prefix = manifest.name.slice(0, -"extension.json".length);
        for (const entry of zip.entries) {
          extensionPath(entry.name);
          if (!entry.name.startsWith(prefix)) throw new Error("ZIP 的文件必须在同一个扩展文件夹内");
          const name = entry.name.slice(prefix.length), parts = extensionPath(name);
          const key = name.toLowerCase();
          if (names.has(key)) throw new Error("ZIP 中存在重名文件");
          names.add(key); budget(entry.size);
          const output = path.join(stage, ...parts);
          await fs.mkdir(path.dirname(output), { recursive: true });
          await zip.extract(entry, output);
        }
      } finally { zip.close(); }
    } else throw new Error("请选择扩展文件夹或 ZIP");
    const manifest = await readManifest(stage);
    const id = manifest.id ?? path.basename(source).replace(/\.zip$/i, "");
    const target = extensionDirectory(id), backup = path.join(parent, `.old-${randomBytes(8).toString("hex")}`);
    let did;
    await withOutlineLock(defaultWorkspace(), async () => {
      const exists = await fs.lstat(target).catch(() => null);
      if (exists?.isSymbolicLink()) throw new Error("已安装的扩展不能是符号链接");
      if (exists && await digestFolder(stage) === await digestFolder(target)) { did = "unchanged"; return; }
      did = exists ? "updated" : "installed";
      // An update keeps the installed columns/ as it is (the package's own, if any, comes only with a first install).
      const columns = path.join(target, COLUMNS_FOLDER), staged = path.join(stage, COLUMNS_FOLDER);
      const keep = exists && await fs.lstat(columns).then((stat) => stat.isDirectory() && !stat.isSymbolicLink(), () => false);
      if (keep) await fs.rm(staged, { recursive: true, force: true });
      await beforeReplace(id);
      if (keep) await fs.rename(columns, staged);
      if (exists) await fs.rename(target, backup);
      try { await fs.rename(stage, target); }
      catch (error) {
        if (exists) await fs.rename(backup, target);
        if (keep) await fs.rename(staged, columns).catch(() => {});
        throw error;
      }
      if (exists) await fs.rm(backup, { recursive: true, force: true });
    });
    if (enable) await setExtensionEnabled({ id, enabled: true });
    const item = (await listCapabilities()).find(item => item.id === id);
    return { id, name: manifest.name ?? id, version: manifest.version ?? null, folder: target, agent: manifest.agent ? path.join(target, manifest.agent) : null, enabled: Boolean(item?.enabled), did };
  } finally { await fs.rm(stage, { recursive: true, force: true }); }
}

export async function removeExtension(id, { inService = false, beforeReplace = async () => {} } = {}) {
  if (!inService) { const answer = await throughService("remove", { id }); if (answer) return; }
  const folder = extensionDirectory(id);
  if ((await fs.lstat(path.dirname(folder))).isSymbolicLink()) throw new Error("扩展目录不能是符号链接");
  await beforeReplace(id);
  await withOutlineLock(defaultWorkspace(), async () => {
    if ((await fs.lstat(folder)).isSymbolicLink()) throw new Error("扩展不能是符号链接");
    // Its switch, its settings and their file go with it, and its columns' places with its folder.
    await forgetExtensionGrant(id);
    await fs.rm(folder, { recursive: true });
    await dropGoneExtensions(defaultWorkspace(), { locked: true });
  });
}
