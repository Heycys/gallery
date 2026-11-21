import fs from "node:fs/promises";
import path from "node:path";
import { COLUMNS_FOLDER, SIDEBAR_FILE, SIDEBAR_LIMITS, readSidebarText } from "./extension-sidebar.mjs";
import { said } from "./i18n/index.mjs";
import { isColumnSource, isExtensionId, sourceParts } from "./outline-shape.mjs";
import { defaultWorkspace, DOCUMENT_FOLDERS, layoutOf } from "./workspace.mjs";
import { sameDirectory } from "./preview-server.mjs";
import { sha256, writeAtomic } from "./files.mjs";

// The extensions visible in a workspace (docs/workbench.md "Extension columns"): public columns from
// the default workspace plus this project's own, a project sidebar.json taking precedence by id. Each a folder
// <workspace>/extensions/<id>/ whose sidebar.json (./extension-sidebar.mjs) gives a column of the sidebar
// its entries; what else the folder holds (the extension's own server, its code) is none of Gallery's.
// Read from disk each time it is asked (the workbench's list, the outline's columns, gallery extension):
// the extension writes the file, the watcher tells the workbench (src/server/routes.mjs changeOf), no
// state is kept here. Node's built-ins only.
// A program extension (an extension.json beside it) may also have a folder columns/ whose <column>.json files
// (the same format as sidebar.json, <column> a name of an id's letters) are columns of their own, named by
// the source "<id>:<column>" (outline-shape.mjs isColumnSource): what its backend writes (GALLERY_EXTENSION_COLUMNS),
// shown only while the extension is enabled, and never a change of the extension itself (no reload, no restart).

/**
 * The folders of extensions/ that may be an extension, sorted: no dot name, a name that is an id
 * (isExtensionId), not assets or materials (a document called extensions, made before they came, keeps those
 * in its folder), and no link, which leads out of the workspace. [{ id, folder }].
 */
export async function extensionFolders(root) {
  const { extensions } = layoutOf(root);
  const entries = await fs.readdir(extensions, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && isExtensionId(entry.name) && !DOCUMENT_FOLDERS.includes(entry.name))
    .map((entry) => ({ id: entry.name, folder: path.join(extensions, entry.name) }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

// The extensions whose switch is on (the default workspace's gallery.json, as extension-manifest.mjs keeps it).
async function switchedOn(root) {
  try {
    const kept = JSON.parse(await fs.readFile(path.join(root, "gallery.json"), "utf8"))?.extensions ?? {};
    return new Set(Object.keys(kept).filter((id) => kept[id]?.enabled === true));
  } catch {
    return new Set();
  }
}

/**
 * The column sources of the default workspace, by extension, its sidebar.json first: { id (the source), extension,
 * column (null for sidebar.json), folder, root, file, present } for each extension's folder, then one for each
 * columns/<column>.json of a program extension whose switch is on (with `all`, of one switched off too, `hidden`).
 * A columns/ that is a link, or a file of it that is one, is passed over. Keep one source for listing, outline and writes.
 */
export async function columnSources({ all = false } = {}) {
  const root = defaultWorkspace();
  const on = await switchedOn(root);
  const sources = [];
  for (const entry of await extensionFolders(root)) {
    const file = path.join(entry.folder, SIDEBAR_FILE);
    sources.push({ ...entry, extension: entry.id, column: null, root, file, present: await fs.lstat(file).then(() => true, () => false) });
    const shown = on.has(entry.id);
    if (!shown && !all) continue;
    if (!(await fs.lstat(path.join(entry.folder, "extension.json")).then((stat) => stat.isFile(), () => false))) continue;
    const columns = path.join(entry.folder, COLUMNS_FOLDER);
    const folder = await fs.lstat(columns).catch(() => null);
    if (!folder?.isDirectory() || folder.isSymbolicLink()) continue;
    const names = (await fs.readdir(columns, { withFileTypes: true }).catch(() => []))
      .filter((file) => file.isFile() && file.name.endsWith(".json")).map((file) => file.name.slice(0, -".json".length)).filter(isExtensionId).sort();
    for (const column of names) sources.push({ id: `${entry.id}:${column}`, extension: entry.id, column, folder: entry.folder, root, file: path.join(columns, `${column}.json`), present: true, ...(shown ? {} : { hidden: true }) });
  }
  return sources;
}

/** The file column source `id` reads in workspace `root`: extensions/<id>/sidebar.json, or extensions/<id>/columns/<column>.json. */
export function columnFile(root, id) {
  const { extension, column } = sourceParts(id);
  const folder = path.join(layoutOf(root).extensions, extension);
  return column ? path.join(folder, COLUMNS_FOLDER, `${column}.json`) : path.join(folder, SIDEBAR_FILE);
}

/** Resolve a column source, never a client-supplied directory, to the file this workspace actually shows. */
export async function extensionSource(root, id) {
  if (!isColumnSource(id)) return null;
  return (await columnSources()).find(entry => entry.id === id) ?? null;
}

/** The sources of the columns the sidebar has: each extension with a sidebar.json, each columns/ file shown. */
export async function extensionColumnIds(root) {
  return (await columnSources()).filter(entry => entry.present).map(entry => entry.id);
}

/**
 * Extension `id` as the sidebar shows it: { id, file (the sidebar.json's path), title (the column's name; the
 * id when the file does not say one), icon?, entries (a tree of { id, title, icon?, url?, children? }), count
 * (the entries in all), notes (said(): what was left out) } or, when the file is not usable, `error`
 * (said(): why) with no entries; `missing` for a folder with no sidebar.json: an extension with nothing to show.
 */
export async function readExtension(root, id) {
  const file = columnFile(root, id);
  const { extension, column } = sourceParts(id);
  // A columns/ column says whose it is (owner) and which (column), its name the column's when the file says none.
  const empty = { id, file, title: column ?? id, entries: [], count: 0, notes: [], ...(column ? { owner: extension, column } : {}) };
  let stat;
  try {
    stat = await fs.stat(file);
  } catch (error) {
    return error.code === "ENOENT" ? { ...empty, missing: true, error: column ? said("没有这个栏目文件") : said("没有 sidebar.json") } : { ...empty, error: said("读不出这个文件：{0}", error.code ?? "error") };
  }
  if (!stat.isFile()) return { ...empty, error: column ? said("栏目文件不是一个文件") : said("sidebar.json 不是一个文件") };
  if (stat.size > SIDEBAR_LIMITS.bytes) return { ...empty, error: said("文件超过 1MB") };
  let text;
  try {
    text = await fs.readFile(file, "utf8");
  } catch (error) {
    return { ...empty, error: said("读不出这个文件：{0}", error.code ?? "error") };
  }
  const read = readSidebarText(text);
  empty.revision = sha256(text);
  if (read.error) {
    // What can still be said of a file that does not read: its name, when it has one.
    let title = empty.title;
    try {
      const named = JSON.parse(text.replace(/^﻿/, ""))?.title;
      if (typeof named === "string" && named.trim() && named.trim().length <= SIDEBAR_LIMITS.column) title = named.replace(/\s+/g, " ").trim();
    } catch {}
    return { ...empty, title, error: read.error };
  }
  return { ...empty, ...read.sidebar, notes: read.notes };
}

/**
 * The extensions visible in workspace `root`, by id, each followed by its columns/ columns: those with a sidebar.json
 * and the columns/ of those switched on (the sidebar's columns), or with `all` every folder that may be one and
 * every columns/ column, one of an extension switched off `hidden` (gallery extension list). Each as readExtension says it.
 */
export async function listExtensions(root, { all = false } = {}) {
  const sources = await columnSources({ all });
  const read = await Promise.all(sources.map(async ({ id, root: owner, hidden }) => ({ ...(await readExtension(owner, id)), ...(hidden ? { hidden } : {}) })));
  return all ? read : read.filter((extension) => !extension.missing);
}

/** Edit a column's title/root order, remove a root subtree or delete its sidebar.json. Called under the workspace lock.
 * Read the latest source, keep unknown fields and whole subtrees, and refuse stale UI changes.
 * Atomic replacement checks the original text again so an external writer is not silently overwritten.
 */
export async function editExtension(root, id, change) {
  const refused = (status, reason, error) => ({ ok: false, status, reason, error });
  const bad = () => refused(400, "body", said("请求格式不对"));
  const stale = () => refused(409, "stale", said("扩展目录刚在别处改过，请重试"));
  if (!isColumnSource(id) || !change || typeof change !== "object") return bad();
  const rename = Object.hasOwn(change, "title");
  const remove = Object.hasOwn(change, "remove");
  if ([rename, remove, Object.hasOwn(change, "move")].filter(Boolean).length !== 1) return bad();
  if (remove ? (change.remove !== "column" && (typeof change.remove?.entry !== "string" || !change.remove.entry)
      || typeof change.baseFile !== "string" || typeof change.baseRevision !== "string")
    : rename ? (typeof change.title !== "string" || typeof change.baseTitle !== "string")
      : (!change.move || !["before", "after"].includes(change.move.side) || typeof change.move.entry !== "string" || typeof change.move.ref !== "string" || !Array.isArray(change.baseOrder))) return bad();
  const name = rename ? change.title.replace(/\s+/g, " ").trim() : null;
  if (rename && (!name || name.length > SIDEBAR_LIMITS.column)) return bad();
  const { extension, column } = sourceParts(id);
  const folder = path.join(layoutOf(root).extensions, extension);
  const file = columnFile(root, id);
  if (remove && change.baseFile !== file) return stale(); // An override must not redirect a confirmed deletion.
  // Never turn an extension path supplied by the client or a symlink into an arbitrary-file write.
  for (const [target, directory] of [[layoutOf(root).extensions, true], [folder, true], ...(column ? [[path.dirname(file), true]] : []), [file, false]]) {
    const stat = await fs.lstat(target).catch(() => null);
    if (!stat) return refused(404, "missing", said("找不到这个扩展"));
    if (stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())) return refused(409, "path", said("扩展路径不是普通文件或文件夹"));
    if (!directory && stat.size > SIDEBAR_LIMITS.bytes) return refused(409, "extension", said("文件超过 1MB"));
  }
  const source = await fs.readFile(file, "utf8");
  if (remove && sha256(source) !== change.baseRevision) return stale();
  if (remove && change.remove === "column") {
    if ((await fs.readFile(file, "utf8")) !== source) return stale();
    await fs.unlink(file); // Only the validated column file; the extension's other files stay.
    return { ok: true, written: true };
  }
  const read = readSidebarText(source);
  if (read.error) return refused(409, "extension", read.error);
  const value = JSON.parse(source.replace(/^\uFEFF/, ""));
  if (rename) {
    if (read.sidebar.title !== change.baseTitle) return stale();
    if (read.sidebar.title === name) return { ok: true, written: false };
    value.title = name;
  } else if (remove) {
    const index = value.entries.findIndex(entry => entry.id === change.remove.entry);
    if (index < 0) return bad(); // Roots only; a root's entire subtree goes with it.
    value.entries.splice(index, 1);
  } else {
    const order = value.entries.map(entry => entry.id);
    if (JSON.stringify(order) !== JSON.stringify(change.baseOrder)) return stale();
    const from = order.indexOf(change.move.entry), to = order.indexOf(change.move.ref);
    if (from < 0 || to < 0) return bad(); // Root entries only, in this file; no nesting or cross-column move.
    if (from === to) return { ok: true, written: false };
    const [entry] = value.entries.splice(from, 1);
    const at = value.entries.findIndex(entry => entry.id === change.move.ref);
    value.entries.splice(at + (change.move.side === "after" ? 1 : 0), 0, entry);
    if (JSON.stringify(order) === JSON.stringify(value.entries.map(entry => entry.id))) return { ok: true, written: false };
  }
  const indent = source.match(/\n([ \t]+)"/)?.[1] ?? 2;
  let next = JSON.stringify(value, null, indent) + "\n";
  if (source.includes("\r\n")) next = next.replaceAll("\n", "\r\n");
  if (source.startsWith("\uFEFF")) next = "\uFEFF" + next;
  if (Buffer.byteLength(next) > SIDEBAR_LIMITS.bytes) return refused(409, "extension", said("文件超过 1MB"));
  if (!(await writeAtomic(file, next, { expect: source }))) return stale();
  return { ok: true, written: true };
}
