import fs from "node:fs/promises";
import path from "node:path";
import { defaultWorkspace, layoutOf } from "./workspace.mjs";
import { extensionFolders } from "./extensions.mjs";
import { isExtensionId } from "./outline-shape.mjs";
import { sha256, writeAtomic } from "./files.mjs";
import { withOutlineLock } from "./outline.mjs";
import { refusal, said } from "./i18n/index.mjs";
import { changesProblem, settingsOf, settingsProblem, settingsValues, storedAfter } from "./extension-settings.mjs";

// The recursive workspace watcher covers imported modules as well as manifest entries.
// Requests never rescan the whole extension tree just to serve a single asset.
const generations = new Map();
let generation = 0;
export function invalidateExtension(folder) { generations.set(path.resolve(folder), ++generation); }

export const extensionDirectory = id => {
  if (!isExtensionId(id)) throw new Error("扩展 ID 不正确");
  return path.join(layoutOf(defaultWorkspace()).extensions, id);
};

export function extensionPath(value) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.includes(":")) throw new Error("扩展文件必须使用相对路径");
  const parts = value.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || /[\x00-\x1f]/.test(part))) throw new Error("扩展文件路径不正确");
  return parts;
}

// Resolve every segment, including the extension directory, before serving or running a file.
export async function extensionFile(folder, name) {
  const parts = extensionPath(name);
  if ((await fs.lstat(path.dirname(folder))).isSymbolicLink()) throw new Error("扩展文件不能是符号链接");
  let file = folder;
  for (const part of [null, ...parts]) {
    if (part !== null) file = path.join(file, part);
    const stat = await fs.lstat(file);
    if (stat.isSymbolicLink()) throw new Error("扩展文件不能是符号链接");
  }
  const [root, real] = await Promise.all([fs.realpath(folder), fs.realpath(file)]);
  const relative = path.relative(root, real);
  if (relative.startsWith("..") || path.isAbsolute(relative) || !(await fs.stat(real)).isFile()) throw new Error("扩展文件不在扩展目录内");
  return real;
}

export async function readManifest(folder) {
  const file = await extensionFile(folder, "extension.json");
  if ((await fs.stat(file)).size > 65536) throw new Error("extension.json 超过 64KB");
  const text = await fs.readFile(file, "utf8");
  if (Buffer.byteLength(text) > 65536) throw new Error("extension.json 超过 64KB");
  const value = JSON.parse(text);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("extension.json 必须是对象");
  if (value.id !== undefined && !isExtensionId(value.id)) throw new Error("扩展 ID 不正确");
  for (const key of ["name", "version", "description"]) if (value[key] !== undefined && (typeof value[key] !== "string" || value[key].length > 1000)) throw new Error("扩展名称、版本和描述必须是短文本");
  if (value.icon !== undefined) {
    if (typeof value.icon !== "string" || !value.icon || value.icon.length > 256) throw new Error("icon 不正确");
    if (/\.(?:png|jpe?g|webp|gif|svg)$/i.test(value.icon)) await extensionFile(folder, value.icon);
    else if (value.icon.length > 16 || /[/\\]/.test(value.icon)) throw new Error("icon 必须是表情或扩展里的图片");
  }
  if (value.workbench !== undefined && (!value.workbench || typeof value.workbench !== "object" || Array.isArray(value.workbench))) throw new Error("workbench 必须是对象");
  for (const name of [value.workbench?.script, value.workbench?.style, value.agent].filter(value => value !== undefined)) await extensionFile(folder, name);
  if (value.server !== undefined) {
    const command = value.server?.command;
    if (!Array.isArray(command) || !command.length || command.length > 32 || command.some(word => typeof word !== "string" || !word || word.includes("\0"))) throw new Error("server.command 必须是非空的参数数组");
    if (value.server.timeout !== undefined && (!Number.isInteger(value.server.timeout) || value.server.timeout < 1000 || value.server.timeout > 600000)) throw new Error("server.timeout 必须是 1000 到 600000 毫秒");
  }
  // The extension's own settings (./extension-settings.mjs): a type Gallery does not know yet is said, not passed over.
  if (value.settings !== undefined) {
    const problem = settingsProblem(value.settings);
    if (problem) throw refusal(problem);
  }
  // Files named by the manifest can change while extension.json stays byte-for-byte identical.
  // Their metadata gives clients and the backend manager a fresh revision after a replacement.
  const named = [value.workbench?.script, value.workbench?.style, ...(value.server?.command?.slice(1) ?? [])].filter(name => typeof name === "string" && !path.isAbsolute(name));
  const stamps = await Promise.all(named.map(async name => {
    try { const file = await extensionFile(folder, name); const stat = await fs.stat(file); return [name, stat.size, stat.mtimeMs]; } catch { return [name, null]; }
  }));
  return { ...value, revision: sha256(JSON.stringify([text, stamps, generations.get(path.resolve(folder)) ?? 0])) };
}

const configFile = () => path.join(defaultWorkspace(), "gallery.json");
const configuration = async () => JSON.parse(await fs.readFile(configFile(), "utf8"));

/**
 * The file extension `id`'s backend reads its settings from (GALLERY_EXTENSION_SETTINGS): every declared key's
 * value, the defaults filled in, in the default workspace's .gallery/extensions/<id>/settings.json. Not in the
 * extension's own folder: a file written there is, to the recursive watch of Windows and macOS, a change of
 * that folder, a new revision (its script reloaded, its backend restarted), and an update replaces the folder.
 */
export const settingsFile = (id) => {
  if (!isExtensionId(id)) throw new Error("扩展 ID 不正确");
  return path.join(layoutOf(defaultWorkspace()).extensionData, id, "settings.json");
};

// The settings files are written one at a time in this process, each from gallery.json as it is when its
// turn comes: a backend's start (which writes the file before the backend runs) and a change of a setting
// (written after gallery.json) cannot leave the older values last. Only the service runs backends, and a
// command changes a setting through it while it runs (gallery extension settings).
let settingsWrites = Promise.resolve();

/**
 * Write extension `id`'s settings file from gallery.json and `manifest` as they are now (not when unchanged);
 * resolves to its path. A backend's start writes it, so that the file is there, the defaults in it, the
 * first time the backend reads it; so does every change of a setting.
 */
export function syncSettingsFile(id, manifest) {
  const file = settingsFile(id);
  const write = async () => {
    const config = await configuration();
    const text = JSON.stringify(settingsValues(settingsOf(manifest), config.extensions?.[id]?.settings), null, 2) + "\n";
    await fs.mkdir(path.dirname(file), { recursive: true });
    if ((await fs.readFile(file, "utf8").catch(() => null)) !== text) await writeAtomic(file, text);
    return file;
  };
  const result = settingsWrites.then(write, write);
  settingsWrites = result.catch(() => {});
  return result;
}

export async function listCapabilities({ ids = null } = {}) {
  const config = await configuration();
  const wantedIds = ids === null ? null : new Set(ids);
  const folders = await extensionFolders(defaultWorkspace());
  return Promise.all(folders.filter(({ id }) => !wantedIds || wantedIds.has(id)).map(async ({ id, folder }) => {
    const wanted = config.extensions?.[id]?.enabled === true;
    const configured = Object.hasOwn(config.extensions ?? {}, id);
    try {
      const manifest = await readManifest(folder);
      // Its settings' values as its backend's file and its script's api.settings have them (none declared: none).
      const declared = settingsOf(manifest);
      const settings = declared.length ? { settings: settingsValues(declared, config.extensions?.[id]?.settings) } : {};
      return { id, folder, manifest, enabled: wanted, wanted, agent: manifest.agent ? path.join(folder, manifest.agent) : null, ...settings };
    } catch (error) {
      let message = error.message;
      if (error.code === "ENOENT") {
        const hasManifest = await fs.lstat(path.join(folder, "extension.json")).then(() => true, () => false);
        const hasSidebar = await fs.lstat(path.join(folder, "sidebar.json")).then(() => true, () => false);
        message = hasManifest ? "扩展引用的文件不存在" : (!configured && hasSidebar ? null : "找不到 extension.json");
      }
      return { id, folder, enabled: false, wanted, manifest: null, error: message };
    }
  }));
}

export async function setExtensionEnabled({ id, enabled }) {
  const folder = extensionDirectory(id);
  if (typeof enabled !== "boolean") throw new Error("扩展开关的值不正确");
  return withOutlineLock(defaultWorkspace(), async () => {
    if (enabled) await readManifest(folder);
    else if (!(await fs.lstat(folder).catch(() => null))) throw new Error("找不到扩展");
    const config = await configuration();
    if ((config.extensions?.[id]?.enabled === true) === enabled) return { changed: false };
    // The switch alone: its settings (and anything else kept of it) stay through a disable and an enable.
    config.extensions = { ...config.extensions, [id]: { ...config.extensions?.[id], enabled } };
    await writeAtomic(configFile(), JSON.stringify(config, null, 2) + "\n");
    return { changed: true };
  });
}

/**
 * Set some of extension `id`'s settings (`values`: { key: value }, each declared and of its type), under the
 * outline's lock as its switch is: gallery.json's extensions.<id>.settings (those equal to their default left
 * out: storedAfter), then its backend's file (syncSettingsFile), which a running backend reads at its next
 * need, with no restart. Refused (`reason`) for an extension switched off ("disabled": 设置 shows its controls
 * greyed, and a command does what the controls do), one whose extension.json does not read, and a key or a
 * value it does not declare ("settings"). Resolves to { changed, values: every key's value now, file }.
 */
export async function setExtensionSettings({ id, values: changes } = {}) {
  const folder = extensionDirectory(id);
  return withOutlineLock(defaultWorkspace(), async () => {
    const manifest = await readManifest(folder);
    const config = await configuration();
    if (config.extensions?.[id]?.enabled !== true) throw refusal(said("扩展已停用：先启用它，再改它的设置"), { reason: "disabled" });
    const declared = settingsOf(manifest);
    const problem = changesProblem(declared, changes);
    if (problem) throw refusal(problem, { reason: "settings" });
    const before = config.extensions[id];
    const stored = storedAfter(declared, before.settings, changes);
    const after = { ...before, settings: stored };
    if (!Object.keys(stored).length) delete after.settings;
    const changed = JSON.stringify(after) !== JSON.stringify(before);
    if (changed) {
      config.extensions = { ...config.extensions, [id]: after };
      await writeAtomic(configFile(), JSON.stringify(config, null, 2) + "\n");
    }
    const file = await syncSettingsFile(id, manifest);
    return { changed, values: settingsValues(declared, stored), file };
  });
}

/** What Gallery keeps of extension `id` beside its folder, as it is removed: its switch and settings (gallery.json) and its settings file. */
export async function forgetExtensionGrant(id) {
  const config = await configuration();
  if (config.extensions?.[id]) {
    delete config.extensions[id];
    await writeAtomic(configFile(), JSON.stringify(config, null, 2) + "\n");
  }
  await fs.rm(path.dirname(settingsFile(id)), { recursive: true, force: true });
}
