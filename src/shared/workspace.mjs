import { execFile, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DOC_SLUG, earlierId, newPageId, pageId } from "./page-links.mjs";
import { LINK_FILE, readLinkText } from "./web-links.mjs";

// A workspace: the folder of the user's documents (docs/internals.md, "Where things live"). Found in
// this order: --workspace <dir> (the gallery command sets GALLERY_WORKSPACE from it before it loads
// anything else), the GALLERY_WORKSPACE environment variable, the nearest folder up from the current
// one holding a gallery.json that says it is ours ({ "gallery": "workspace", "version": 1 }: another
// program's gallery.json is not), else Gallery in the user's Documents folder (~/Documents/Gallery:
// documentsFolder() says which folder that is on each system). Its root shows the user's documents,
// gallery.json, preferences.md (写作偏好), exports/, components/, pages/ and extensions/ only:
//
//   <workspace>/gallery.json, preferences.md, exports/<slug>.html (the offline deliverables)
//   <workspace>/components/<scope>/<name>/  a component package (./component-catalog.mjs), no document
//   <workspace>/pages/<slug>/page.html, page.json  a custom page (./pages.mjs), no document
//   <workspace>/extensions/<id>/sidebar.json  the sidebar column an extension provides (./extensions.mjs), no document
//   <workspace>/<slug>/doc.html, doc.json (report.html, report.json in a document made before
//     Gallery 0.1: read and written under those names, never renamed), assets/, materials/, annotations.json
//   <workspace>/<slug>/link.json  a web link of the sidebar (./web-links.mjs), no document
//   <workspace>/.gallery/  everything else Gallery keeps: the sidebar's outline, the trash, the emoji
//     library, the 写作偏好 page (pages/<slug>/), the edit state (state/), qa's pictures, backups, built
//     previews, the server's announcement, port and log, what was adopted of an old layout, and the
//     scratch copies gallery block try makes a trial on (try/try-<8 hex>/, each gone once its trial ends).
//
// A document is a folder at the root holding doc.html or report.html, its name a slug that is not
// reserved (exports, generated, which the preview's addresses keep, the names Windows keeps for
// devices: a workspace moves between systems) and not a dot name. components/, pages/ and extensions/
// hold no document, but one of those names made before they came stays one, and no new one takes it
// (COMPONENTS_FOLDER, PAGES_FOLDER, EXTENSIONS_FOLDER). A custom page's slug and a document's are one pool: no new
// document takes a page's slug, nor a new page a document's (slugTaken).
// Nothing here writes outside the workspace, and nothing writes an old folder it copies from.
// Node's built-ins only: every system reads its layout from here.

export const WORKSPACE_FILE = "gallery.json";
/**
 * What tells a workspace's gallery.json from another program's file of that name, which is all a
 * reader of it looks at: what else it holds is whose it is (`components`, ./component-catalog.mjs).
 */
export const WORKSPACE_MARK = { gallery: "workspace", version: 1 };
/** A document's slug: lowercase kebab-case. */
export const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** The names Windows keeps for devices, which no folder of a workspace takes: a workspace moves between systems. */
export const DEVICE_NAMES = new Set(["con", "prn", "aux", "nul", ...[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((n) => [`com${n}`, `lpt${n}`])]);
/**
 * Names at the root that are never a document's: exports/; generated, for ../generated/doc.html would
 * be the page of the document called doc (the preview's /generated/<slug>.html, src/server/routes.mjs);
 * and the names Windows keeps for devices.
 */
export const RESERVED = new Set(["exports", "generated", ...DEVICE_NAMES]);
/**
 * The folder of a workspace's component packages. Unlike RESERVED it hides nothing: a document called
 * so, made before the packages came, keeps its folder and stays a document beside them. It is only a
 * name no new document takes (slugTaken, keptName), the next free one coming instead.
 */
export const COMPONENTS_FOLDER = "components";
/**
 * The folder of a workspace's custom pages (pages/<slug>/: ./pages.mjs). As components/, it hides
 * nothing: a document called so, made before the custom pages came, keeps its folder and stays a
 * document beside them; it is only a name no new document or page takes.
 */
export const PAGES_FOLDER = "pages";
/**
 * The folder of a workspace's extensions (extensions/<id>/: ./extensions.mjs), each of which may provide a
 * column of the sidebar (sidebar.json) and holds whatever else the extension keeps. As components/ and
 * pages/, it hides nothing: a document called so, made before extensions came, keeps its folder and stays
 * a document beside them; it is only a name no new document or page takes.
 */
export const EXTENSIONS_FOLDER = "extensions";
/** A component package's manifest, which is what makes a folder of components/ a package. */
export const PACKAGE_MANIFEST = "component.json";
/** The folders a document keeps beside its files: what is its own of a folder it shares with the packages or the custom pages. */
export const DOCUMENT_FOLDERS = ["assets", "materials"];
/** The folders at the root that hold no document but may share their name with one made before them. */
export const SHARED_FOLDERS = [COMPONENTS_FOLDER, PAGES_FOLDER, EXTENSIONS_FOLDER, 'preferences'];
/** Whether a new document (or custom page) may not be called `name`, whatever the workspace holds. */
export const keptName = (name) => RESERVED.has(name) || SHARED_FOLDERS.includes(name);
/** Whether `name` may be a document's slug. */
export const isSlugName = (name) => typeof name === "string" && slugPattern.test(name) && !RESERVED.has(name);
/** The slug of the 写作偏好 page made new (one copied from an old layout keeps its own). */
export const PAGE_SLUG = "writing-preferences";

/**
 * Where a checkout of Gallery, or an old full skill, kept its edit state before the workspace (before
 * Gallery 0.1, under the editor's old name): <folder>/node_modules/.cache/report-edit. Read only by the
 * migrations (copyOldDocuments, adoptOldLayout, gallery skill install, the dev server).
 */
export const oldStateOf = (folder) => path.join(folder, "node_modules", ".cache", "report-edit");

// The file names of a document: the new ones, and those of a document made before Gallery 0.1.
const NEW = { html: "doc.html", json: "doc.json" };
const OLD = { html: "report.html", json: "report.json" };
/** Whether `name` is the source file of a document (doc.html, or report.html in an old one). */
export const isDocumentSource = (name) => name === NEW.html || name === OLD.html;
/** Whether `name` is a file of a document's own (its source, its metadata or its 批注). */
export const isDocumentFile = (name) => [NEW.html, NEW.json, OLD.html, OLD.json, "annotations.json"].includes(name);

/**
 * What the text of a gallery.json is, a byte-order mark passed over, which an editor on Windows may
 * write: { value, ours, reads }, `reads` whether it is JSON at all, `ours` whether it says it is
 * Gallery's. One that does not read says neither: it may be anyone's, a workspace's with a slip in it.
 */
export function markerOf(text) {
  try {
    const value = JSON.parse(text.replace(/^\uFEFF/, ""));
    return { value, ours: value?.gallery === WORKSPACE_MARK.gallery, reads: true };
  } catch {
    return { value: null, ours: false, reads: false };
  }
}

const markerAt = (file) => {
  try {
    return markerOf(readFileSync(file, "utf8"));
  } catch {
    return { value: null, ours: false, reads: false };
  }
};

/**
 * The default workspace, where a command goes when nothing names one and none is found up from the
 * current folder: Gallery in the user's Documents folder, or the folder GALLERY_DEFAULT_WORKSPACE names
 * (the browser scenarios', whose studio is the default workspace for a draft made elsewhere: src/shared/drafts.mjs).
 */
export const defaultWorkspace = ({ env = process.env, home = os.homedir(), cwd = process.cwd() } = {}) => (env.GALLERY_DEFAULT_WORKSPACE
  ? path.resolve(cwd, env.GALLERY_DEFAULT_WORKSPACE)
  : path.join(documentsFolder({ home, env }), "Gallery"));

/**
 * Where the workspace is: { root, how } (how: "flag", "env", "found" or "default"). Reads gallery.json
 * files on the way up, writes nothing (ensureWorkspace makes it).
 */
export function findWorkspace({ flag = null, env = process.env, cwd = process.cwd(), home = os.homedir() } = {}) {
  if (typeof flag === "string" && flag) return { root: path.resolve(cwd, flag), how: "flag" };
  if (env.GALLERY_WORKSPACE) return { root: path.resolve(cwd, env.GALLERY_WORKSPACE), how: "env" };
  for (let directory = path.resolve(cwd); ; directory = path.dirname(directory)) {
    if (markerAt(path.join(directory, WORKSPACE_FILE)).ours) return { root: directory, how: "found" };
    if (path.dirname(directory) === directory) break;
  }
  return { root: defaultWorkspace({ env, home, cwd }), how: "default" };
}

// Where Windows keeps the Documents folder Explorer shows as 文档: the Personal shell folder, as the
// user's own registry holds it (%USERPROFILE%\Documents as Windows sets it up; OneDrive's Documents
// when OneDrive backs the folder up, another drive's when the user moved it there).
const SHELL_FOLDERS = "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders";

/**
 * The Personal shell folder's value as reg.exe prints it (%USERPROFILE%\Documents, or a path), else
 * null. reg.exe writes in the console's code page (GBK on a Chinese Windows): a value with any other
 * byte than ASCII is read again with the code page set to UTF-8, so that a folder named in Chinese
 * (OneDrive - 公司) comes out whole; an ASCII one costs one reg.exe (about 30 ms).
 */
function registryDocuments() {
  const system = process.env.SystemRoot ?? process.env.windir ?? "C:\\Windows";
  const valueOf = (output) => /^\s*Personal\s+REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m.exec(output)?.[1] ?? null;
  const query = (bytes) => bytes.status === 0 && Buffer.isBuffer(bytes.stdout) ? bytes.stdout : null;
  const ascii = query(spawnSync(path.join(system, "System32", "reg.exe"), ["query", SHELL_FOLDERS, "/v", "Personal"], { windowsHide: true, timeout: 5000 }));
  if (!ascii) return null;
  if (ascii.every((byte) => byte < 0x80)) return valueOf(ascii.toString("utf8"));
  const command = `"chcp 65001 >nul & "${path.join(system, "System32", "reg.exe")}" query "${SHELL_FOLDERS}" /v Personal"`;
  const utf8 = query(spawnSync(process.env.ComSpec ?? path.join(system, "System32", "cmd.exe"), ["/d", "/s", "/c", command], { windowsHide: true, windowsVerbatimArguments: true, timeout: 5000 }));
  return utf8 ? valueOf(utf8.toString("utf8")) : null;
}

// The Personal value as registryDocuments reads it, once a process: every defaultWorkspace() asks for it
// where GALLERY_DEFAULT_WORKSPACE names no folder (a server `gallery open` started: some 300 times as a
// document's page loads, and a command a dozen), and each reg.exe blocked for some 30 ms.
let personal;
const registryOnce = () => (personal === undefined ? (personal = registryDocuments()) : personal);
// The user's own home as the system knows it, once a process too.
let ownHome;
const realHomeOnce = () => {
  if (ownHome === undefined) {
    try {
      ownHome = os.userInfo().homedir;
    } catch {
      ownHome = null;
    }
  }
  return ownHome;
};

const sameFolder = (a, b, platform) => {
  const [one, two] = [path.resolve(a), path.resolve(b)];
  return platform === "win32" ? one.toLowerCase() === two.toLowerCase() : one === two;
};

/**
 * The user's Documents folder, the default workspace's parent: on Windows the one Explorer shows as
 * 文档 (SHELL_FOLDERS' Personal, read once a process, its %VARIABLES% expanded), read for the user's own home alone (a test
 * or a sandbox naming another HOME/USERPROFILE gets <that home>/Documents, never the user's folder);
 * on Linux the XDG documents folder (~/.config/user-dirs.dirs' XDG_DOCUMENTS_DIR: ~/文档 on a Chinese
 * desktop); a folder either names that is not there, or not absolute, is passed over; else, and on
 * macOS, <home>/Documents. `realHome`, `readRegistry`, `readText` and `exists` are the tests'.
 */
export function documentsFolder({
  home = os.homedir(), env = process.env, platform = process.platform,
  realHome = realHomeOnce(),
  readRegistry = registryOnce, readText = (file) => readFileSync(file, "utf8"), exists = existsSync,
} = {}) {
  const fallback = path.join(home, "Documents");
  const usable = (folder) => folder && path.isAbsolute(folder) && exists(folder) ? path.normalize(folder) : null;
  if (platform === "win32") {
    if (!realHome || !sameFolder(home, realHome, platform)) return fallback;
    let value = null;
    try {
      value = readRegistry();
    } catch {}
    if (!value) return fallback;
    // A variable by its name in any case, USERPROFILE the home where none is set (the environment looked
    // through only for a name not written in capitals there: Windows' own is read by any case).
    const variable = (name) => {
      const wanted = name.toUpperCase();
      const setting = env[wanted] ?? Object.entries(env).findLast(([key]) => key.toUpperCase() === wanted)?.[1];
      return setting ?? (wanted === "USERPROFILE" ? home : undefined);
    };
    let unknown = false;
    const expanded = value.replace(/%([^%]+)%/g, (whole, name) => variable(name) ?? ((unknown = true), whole));
    return (!unknown && usable(expanded)) || fallback;
  }
  if (platform === "linux") {
    let text = "";
    try {
      text = readText(path.join(env.XDG_CONFIG_HOME || path.join(home, ".config"), "user-dirs.dirs"));
    } catch {}
    const value = /^\s*XDG_DOCUMENTS_DIR\s*=\s*"([^"]*)"/m.exec(text)?.[1];
    if (!value) return fallback;
    const folder = value.replace(/^\$HOME(?=\/|$)/, home);
    // XDG says $HOME itself when the user turned the folder off: the home is no documents folder.
    return sameFolder(folder, home, platform) ? fallback : usable(folder) ?? fallback;
  }
  return fallback;
}

/** Every place of a workspace, by what it holds. Only paths: nothing is read or made. */
export function layoutOf(root) {
  const resolved = path.resolve(root);
  const gallery = path.join(resolved, ".gallery");
  const state = path.join(gallery, "state");
  return {
    root: resolved,
    marker: path.join(resolved, WORKSPACE_FILE),
    preferences: path.join(resolved, "preferences.md"),
    exports: path.join(resolved, "exports"),
    components: path.join(resolved, COMPONENTS_FOLDER),
    // The custom pages (./pages.mjs), at the root as the packages are: the user's and the Agent's. Not
    // called pages, which named .gallery/pages/ before (preferencesPage now): code written for that
    // meaning finds no such key and fails, never reading this folder for the 写作偏好 page's.
    customPages: path.join(resolved, PAGES_FOLDER),
    // The extensions (./extensions.mjs: extensions/<id>/sidebar.json), the user's and the Agent's.
    extensions: path.join(resolved, EXTENSIONS_FOLDER),
    gallery,
    outline: path.join(gallery, "outline.json"),
    blocks: path.join(gallery, "blocks.json"),
    // What the reader closed of Gallery's own notes, once for the workspace: the home page's first-open
    // note (src/shared/pages.mjs homeHintClosed).
    hints: path.join(gallery, "hints.json"),
    // The keys of the sites the workspace's blocks reach, by host (./net-keys.mjs: gallery block key),
    // never in gallery.json, whose settings every page is told; and what the net route fetched for them
    // (./net-cache.mjs), which may be thrown away.
    keys: path.join(gallery, "keys.json"),
    netCache: path.join(gallery, "cache", "net"),
    // What Gallery keeps of each extension (of the default workspace's extensions/) beside its folder: <id>/settings.json,
    // the values of its settings its backend reads (./extension-manifest.mjs settingsFile), gone with the extension.
    extensionData: path.join(gallery, "extensions"),
    trash: path.join(gallery, "trash"),
    emojiLibrary: path.join(gallery, "emoji-library"),
    // The 写作偏好 page's folder (.gallery/pages/<slug>/: a document of Gallery's own, never a custom page).
    preferencesPage: path.join(gallery, "pages"),
    state,
    // The workspace's record of edits by day (src/workbench/activity.mjs): what the 编辑热力图 shows; losable.
    activity: path.join(state, "activity.json"),
    history: path.join(state, "history"),
    qa: path.join(gallery, "qa"),
    // The scratch copies gallery block try makes a trial on (try-<8 hex>/: ownOrScratch).
    scratch: path.join(gallery, "try"),
    backups: path.join(gallery, "backups"),
    built: path.join(gallery, "built"),
    logs: path.join(gallery, "logs"),
    migrated: path.join(gallery, "migrated.json"),
  };
}

/**
 * Make the workspace when it is not there: the folder, its gallery.json (never over one that is
 * there) and .gallery/ (hidden on Windows; dot folders are already on macOS and Linux), its state
 * folder only its owner's on POSIX (the token there authorizes writes). Resolves to { made: whether
 * gallery.json was written now, ours: whether the gallery.json there is ours, reads: whether it reads
 * at all (markerOf) }.
 */
export async function ensureWorkspace(root, { state = true } = {}) {
  const layout = layoutOf(root);
  await fs.mkdir(layout.root, { recursive: true });
  let made = true;
  try {
    await fs.writeFile(layout.marker, `${JSON.stringify(WORKSPACE_MARK, null, 2)}\n`, { flag: "wx" });
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    made = false;
  }
  const hidden = !existsSync(layout.gallery);
  if (state) await fs.mkdir(layout.state, { recursive: true, mode: 0o700 });
  if (state && hidden && process.platform === "win32") execFile("attrib", ["+h", layout.gallery], { windowsHide: true }, () => {}); // once; a failure leaves it shown
  const { ours, reads } = markerAt(layout.marker);
  return { made, ours, reads };
}

/**
 * A document folder's two files: { html, json, old: whether they are the old names, both: whether
 * the folder holds both doc.html and report.html }. doc.html there: the new names; else report.html
 * there: the old ones (read and written so, never renamed); neither: the new ones (a document to be made).
 */
export function documentFiles(directory) {
  const hasNew = existsSync(path.join(directory, NEW.html));
  const old = !hasNew && existsSync(path.join(directory, OLD.html));
  const names = old ? OLD : NEW;
  return {
    html: path.join(directory, names.html),
    json: path.join(directory, names.json),
    old,
    both: hasNew && existsSync(path.join(directory, OLD.html)),
  };
}

/** Where document `slug` is: the 写作偏好 page's folder under .gallery/pages/ when it is one, else ownOrScratch's. */
export function documentDirectory(slug, root) {
  const page = path.join(layoutOf(root).preferencesPage, slug);
  return existsSync(page) ? page : ownOrScratch(slug, root);
}

/**
 * Where document `slug` that is no 写作偏好 page is: <root>/<slug>; or, where no folder at the root has
 * that name, a scratch copy's in .gallery/try/ (gallery block try's, try-<8 hex>: served and edited
 * as any document, listed nowhere, and gone once its trial ends, src/cli/component-try.mjs).
 */
function ownOrScratch(slug, root) {
  const own = path.join(path.resolve(root), slug);
  const copy = path.join(layoutOf(root).scratch, slug);
  return !existsSync(own) && existsSync(copy) ? copy : own;
}

/**
 * Whether `slug` can name no new document or custom page (one pool): a name kept, or held by a folder
 * at the root, the 写作偏好 page or a custom page (pages/<slug>/).
 */
export function slugTaken(slug, root) {
  const layout = layoutOf(root);
  return keptName(slug) || [layout.root, layout.preferencesPage, layout.customPages].some((folder) => existsSync(path.join(folder, slug)));
}

/**
 * The folder names a page id may come of in a workspace, every one that has an address: a folder at
 * the root (a document, a web link, whatever else), a custom page's, the 写作偏好 page's, and the slug
 * of everything in the trash (a document there goes by its id until it is restored).
 */
export async function pageNames(root) {
  const layout = layoutOf(root);
  const names = new Set();
  await Promise.all([layout.root, layout.preferencesPage, layout.customPages].map(async (folder) => {
    for (const entry of await fs.readdir(folder, { withFileTypes: true }).catch(() => [])) if (entry.isDirectory() && !entry.name.startsWith(".")) names.add(entry.name);
  }));
  for (const { slug } of await listTrash(root)) if (typeof slug === "string") names.add(slug);
  return names;
}

/**
 * The folder name of a new document: doc-<a new page id> (DOC_SLUG), an id that no name of the
 * workspace has (pageNames: the hash id of an old name counts as the id of a doc-<id> one, and the
 * earlier id of a doc-<eight> name, which its old addresses still open), its folder
 * free (slugTaken: the root, the 写作偏好 page and the custom pages; the trash's slugs are among the
 * names). `random` is newPageId's, for the tests.
 * @param {string} root
 * @param {{ random?: () => number }} [options]
 */
export async function newDocSlug(root, { random = undefined } = {}) {
  const taken = new Set();
  for (const name of await pageNames(root)) for (const id of [pageId(name), earlierId(name)]) if (id !== null) taken.add(id);
  for (;;) {
    const slug = `doc-${newPageId(taken, random)}`;
    if (!slugTaken(slug, root)) return slug;
    taken.add(slug.slice(4));
  }
}

/**
 * Another name of the workspace that has the page id of `slug` (pageNames), or null: what makes a
 * doc-<id> name a document may not take, its id being another's.
 * @param {string} slug
 * @param {string} root
 */
export async function idHolder(slug, root) {
  const id = pageId(slug);
  for (const name of await pageNames(root)) if (name !== slug && pageId(name) === id) return name;
  return null;
}

/** Whether `slug` is a name the workbench's new documents have (doc-<eight>: DOC_SLUG), whose id is in it. */
export const isDocSlug = (slug) => DOC_SLUG.test(slug);

// The folders right in `directory`, by name, sorted: no dot name, and no link, which leads out of it.
const foldersIn = (directory) => {
  try {
    return readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
};

/**
 * The component packages of a workspace, sorted: [{ id: "<scope>/<name>", folder }], each a folder
 * two down in components/ holding component.json, whatever it says. Any other folder there is no
 * package and is passed over: one being written, or what a document called components keeps.
 */
export function packageFolders(root) {
  const { components } = layoutOf(root);
  return foldersIn(components).flatMap((scope) => foldersIn(path.join(components, scope))
    .map((name) => ({ id: `${scope}/${name}`, folder: path.join(components, scope, name) }))
    .filter(({ folder }) => existsSync(path.join(folder, PACKAGE_MANIFEST))));
}

/**
 * The manifests one level too shallow: [{ name, file }], each a component.json right in a folder of
 * components/, which no catalog reads: a package is <scope>/<name>, and `name` is what the folder would
 * be called under a scope. What tells a package's writer why theirs is not there.
 */
export function shallowPackages(root) {
  const { components } = layoutOf(root);
  return foldersIn(components).map((name) => ({ name, file: path.join(components, name, PACKAGE_MANIFEST) })).filter(({ file }) => existsSync(file));
}

const readJson = (file) => fs.readFile(file, "utf8").then(JSON.parse).catch(() => null); // not there, or half written: null
const isFolder = (target) => fs.stat(target).then((stat) => stat.isDirectory(), () => false);
const exists = (target) => fs.access(target).then(() => true, () => false);

// The folders of `directory` that are documents: a name that is no dot name and not reserved,
// holding doc.html or report.html; with their metadata's `instructions` mark.
async function documentsIn(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error) => {
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return [];
    throw error;
  });
  const found = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith(".") && !RESERVED.has(entry.name))
    .map(async ({ name }) => {
      const folder = path.join(directory, name);
      const files = documentFiles(folder);
      if (!(await exists(files.html))) return null;
      return { slug: name, folder, instructions: (await readJson(files.json))?.instructions === true };
    }));
  return found.filter(Boolean).sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/**
 * The documents of a workspace, by slug, sorted: the folders at its root holding doc.html or
 * report.html, but exports/, dot names and an old layout's 写作偏好 page (marked "instructions": true:
 * the page lives in .gallery/pages/ now). A folder holding neither (a user's own materials/) is left alone.
 */
export async function listDocumentSlugs(root) {
  return (await documentsIn(path.resolve(root))).filter((entry) => !entry.instructions).map((entry) => entry.slug);
}

/**
 * The web links of a workspace (./web-links.mjs), by slug, sorted: the folders at its root, named as
 * documents are, holding a link.json that reads as a link and no doc.html or report.html (a document,
 * whatever else it holds).
 */
export async function listLinkSlugs(root) {
  const directory = path.resolve(root);
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
  const found = await Promise.all(entries
    .filter((entry) => entry.isDirectory() && isSlugName(entry.name))
    .map(async ({ name }) => {
      const folder = path.join(directory, name);
      if (existsSync(path.join(folder, NEW.html)) || existsSync(path.join(folder, OLD.html))) return null;
      return (await readLink(folder)) ? name : null;
    }));
  return found.filter(Boolean).sort();
}

/** The web link of folder `folder` ({ url, title, icon? }), or null where there is none or it does not read. */
export async function readLink(folder) {
  const text = await fs.readFile(path.join(folder, LINK_FILE), "utf8").catch(() => null);
  return text === null ? null : readLinkText(text);
}

/** The editor page associated with one preference file; legacy unmarked pages belong to the original. */
export async function pageSlug(root, preference = null) {
  for (const item of await documentsIn(layoutOf(root).preferencesPage)) {
    const meta = await readJson(documentFiles(item.folder).json);
    if (meta?.preference !== null && (preference === null || meta?.preference === preference || (preference === 'preferences.md' && meta?.preference === undefined))) return item.slug;
  }
  return null;
}

/** The id of an entry of the trash, a folder of .gallery/trash/. */
export const trashIdPattern = /^[a-z0-9]+-[a-z0-9]+$/;

/**
 * What a trash entry holds: a document, a custom page (./pages.mjs) or a web link (./web-links.mjs).
 * An entry written before the custom pages came holds a document.
 */
export const TRASH_KINDS = ["document", "page", "link"];

/**
 * What the trash holds, the latest first: each folder's entry.json ({ id, kind, slug, title, at,
 * parent, index }), `kind` "document" (its folder report/), "page" (its folder page/, parent "" and
 * index -1: a custom page has no place in the outline) or "link" (its folder link/); one written before
 * kinds came is a document's.
 */
export async function listTrash(root) {
  const { trash } = layoutOf(root);
  const names = await fs.readdir(trash).catch(() => []);
  const entries = await Promise.all(names.filter((name) => trashIdPattern.test(name)).map((id) => readJson(path.join(trash, id, "entry.json"))));
  return entries.filter(Boolean).map((entry) => (TRASH_KINDS.includes(entry.kind) ? entry : { ...entry, kind: "document" })).sort((a, b) => b.at - a.at);
}

// ---------- copying an old layout ----------

const copyTree = (from, to) => fs.cp(from, to, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });

// The files of `from` copied into `to` that `to` does not hold (by name, one level): the names copied.
async function copyMissing(from, to, { filter = () => true } = {}) {
  const names = (await fs.readdir(from).catch(() => [])).filter(filter);
  const copied = [];
  for (const name of names) {
    const target = path.join(to, name);
    if (await exists(target)) continue;
    await fs.mkdir(to, { recursive: true });
    await copyTree(path.join(from, name), target);
    copied.push(name);
  }
  return copied;
}

// The emoji library of `from` (library.json and its images) brought into `to`'s: the images it lacks
// by name, library.json's entries it lacks by id. The number of entries added.
async function mergeEmojiLibrary(from, to) {
  if (!(await isFolder(from))) return 0;
  await copyMissing(from, to, { filter: (name) => name !== "library.json" && !name.startsWith(".") });
  const old = await readJson(path.join(from, "library.json"));
  if (!Array.isArray(old)) return 0;
  const stored = await readJson(path.join(to, "library.json"));
  const current = Array.isArray(stored) ? stored : [];
  const known = new Set(current.map((entry) => entry?.id));
  const added = old.filter((entry) => entry && typeof entry.id === "string" && !known.has(entry.id));
  if (added.length || !Array.isArray(stored)) {
    await fs.mkdir(to, { recursive: true });
    await fs.writeFile(path.join(to, "library.json"), `${JSON.stringify([...current, ...added], null, 2)}\n`);
  }
  return added.length;
}

// An old outline's nesting of `slugs` only: each under its nearest ancestor among them, else at the top.
function outlineOf(stored, slugs) {
  const children = { "": [] };
  const keep = new Set(slugs);
  const seen = new Set();
  const walk = (parent, under) => {
    for (const slug of stored?.children?.[parent] ?? []) {
      if (typeof slug !== "string" || seen.has(slug)) continue;
      seen.add(slug);
      if (keep.has(slug)) (children[under] ??= []).push(slug);
      walk(slug, keep.has(slug) ? slug : under);
    }
  };
  walk("", "");
  for (const slug of slugs) if (!seen.has(slug)) children[""].push(slug);
  return children;
}

/**
 * Copy an old layout's documents into workspace `to` (gallery init --from, gallery skill install over
 * an old skill): `from` a folder of document folders (an old Gallery's reports/), `state` its edit
 * state (oldStateOf the folder beside it, when there). Copied: every document whose name is a slug
 * free in `to` (the others left, listed: `skipped`, a slug taken or a name that is no slug, and `kept`,
 * a name no new document takes, which is free of no workspace); preferences.md when `to` has none; the sidebar's order
 * (.workspace.json), as `to`'s when it has none, else the copied documents added at its top in their
 * old nesting; the 写作偏好 page (a folder marked "instructions": true) into .gallery/pages/ when `to`
 * has none; the custom emoji library (images by name, entries by id); the recent versions of the
 * documents copied; the component packages `from` holds, each one `to` does not. Never the trash,
 * exports, qa pictures or backups. `from` is only read. Resolves to { copied, skipped, kept, preferences:
 * "copied"|"kept"|null, outline: "copied"|"appended"|null, page: "copied"|"kept"|null, emoji: entries
 * added, history: documents whose versions were copied, packages: the ids of those copied }.
 */
export async function copyOldDocuments({ from, to, state = undefined }) {
  const source = path.resolve(from);
  const layout = layoutOf(to);
  await ensureWorkspace(layout.root);
  const oldState = state === undefined ? oldStateOf(path.dirname(source)) : state;
  const found = await documentsIn(source);
  const copied = [];
  const skipped = [];
  const kept = [];
  let page = null;
  for (const { slug, folder, instructions } of found) {
    if (instructions) {
      if (await pageSlug(layout.root)) page = "kept";
      else {
        await fs.mkdir(layout.preferencesPage, { recursive: true });
        await copyTree(folder, path.join(layout.preferencesPage, slug));
        page = "copied";
      }
      continue;
    }
    if (!isSlugName(slug) || slugTaken(slug, layout.root)) {
      (keptName(slug) ? kept : skipped).push(slug);
      continue;
    }
    await copyTree(folder, path.join(layout.root, slug));
    copied.push(slug);
  }

  let preferences = null;
  if (await exists(path.join(source, "preferences.md"))) {
    preferences = (await exists(layout.preferences)) ? "kept" : "copied";
    if (preferences === "copied") await fs.copyFile(path.join(source, "preferences.md"), layout.preferences);
  }

  let outline = null;
  const stored = await readJson(path.join(source, ".workspace.json"));
  if (stored && copied.length) {
    const nested = outlineOf(stored, copied);
    const current = await readJson(layout.outline);
    if (!current?.children) {
      await fs.writeFile(layout.outline, `${JSON.stringify({ version: 1, children: nested }, null, 2)}\n`);
      outline = "copied";
    } else {
      const children = { ...current.children };
      for (const [parent, list] of Object.entries(nested)) children[parent] = [...(children[parent] ?? []), ...list];
      await fs.writeFile(layout.outline, `${JSON.stringify({ version: 1, children }, null, 2)}\n`);
      outline = "appended";
    }
  }

  const emoji = await mergeEmojiLibrary(path.join(source, ".emoji-library"), layout.emojiLibrary);

  let history = 0;
  if (oldState) {
    for (const slug of copied) {
      const versions = path.join(oldState, "history", slug);
      const target = path.join(layout.history, slug);
      if (!(await isFolder(versions)) || (await exists(target))) continue;
      await fs.mkdir(layout.history, { recursive: true });
      await copyTree(versions, target);
      history++;
    }
  }

  const packages = [];
  for (const { id, folder } of packageFolders(source)) {
    const target = path.join(layout.components, ...id.split("/"));
    if (await exists(target)) continue;
    await fs.mkdir(path.dirname(target), { recursive: true });
    await copyTree(folder, target);
    packages.push(id);
  }
  return { copied, skipped, kept, preferences, outline, page, emoji, history, packages };
}

// A directory as a key of the old edit state (the old preview-server's directoryKey: one folder for
// each directory of reports there, for checkouts that shared it).
const canonical = (directory) => (process.platform === "win32" ? path.resolve(directory).toLowerCase() : path.resolve(directory));
const oldKey = (directory) => createHash("sha256").update(canonical(directory)).digest("hex").slice(0, 16);

/**
 * Bring a workspace's own old layout into .gallery/, once (a folder of documents made before
 * Gallery 0.1, an old checkout's reports/ among them): reports' .workspace.json → .gallery/outline.json, .trash/ →
 * .gallery/trash/, .emoji-library/ → .gallery/emoji-library/, a root page marked "instructions": true
 * → .gallery/pages/ (when there is none); and with `devState` (the old edit state, oldStateOf the
 * checkout whose reports/ this is) its token, source snapshots, and the recent
 * versions, commit answers, rewrites and dropped 批注 of this workspace's documents → .gallery/state/.
 * Everything is copied, never over what is there; the old copies are left. .gallery/migrated.json
 * says it was done: a second call does nothing. Resolves to { adopted: whether it ran, copied: what was }.
 */
export async function adoptOldLayout(root, { devState = null } = {}) {
  const layout = layoutOf(root);
  if (await exists(layout.migrated)) return { adopted: false, copied: [] };
  await ensureWorkspace(layout.root);
  const copied = [];
  const once = async (what, from, to) => {
    if (!(await exists(from)) || (await exists(to))) return;
    await fs.mkdir(path.dirname(to), { recursive: true });
    await copyTree(from, to);
    copied.push(what);
  };
  await once("outline", path.join(layout.root, ".workspace.json"), layout.outline);
  if ((await copyMissing(path.join(layout.root, ".trash"), layout.trash)).length) copied.push("trash");
  if ((await mergeEmojiLibrary(path.join(layout.root, ".emoji-library"), layout.emojiLibrary)) > 0) copied.push("emoji-library");
  const oldPage = (await documentsIn(layout.root)).find((entry) => entry.instructions);
  if (oldPage && !(await pageSlug(layout.root))) await once("page", oldPage.folder, path.join(layout.preferencesPage, oldPage.slug));

  if (devState && (await isFolder(devState))) {
    const slugs = [...(await listDocumentSlugs(layout.root)), ...(oldPage ? [oldPage.slug] : [])];
    await once("token", path.join(devState, "token"), path.join(layout.state, "token"));
    if ((await copyMissing(path.join(devState, "snapshots"), path.join(layout.state, "snapshots"))).length) copied.push("snapshots");
    const key = oldKey(layout.root);
    for (const slug of slugs) {
      for (const [kind, from] of [
        ["history", path.join(devState, "history", slug)],
        ["receipts", path.join(devState, "receipts", slug)],
        ["rewrites", path.join(devState, "rewrites", key, slug)],
        ["dropped-annotations", path.join(devState, "dropped-annotations", key, slug)],
      ]) await once(`${kind}/${slug}`, from, path.join(layout.state, kind, slug));
    }
  }
  await fs.writeFile(layout.migrated, `${JSON.stringify({ version: 1, at: new Date().toISOString(), copied }, null, 2)}\n`);
  return { adopted: true, copied };
}
