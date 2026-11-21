import fs from "node:fs";
import path from "node:path";
import { isExtensionId } from "../shared/outline-shape.mjs";
import { DOCUMENT_FOLDERS, isSlugName, layoutOf } from "../shared/workspace.mjs";
import { ignoredIn } from "./routes.mjs";

// The release server's watcher of a workspace (./production.mjs; the dev server has Vite's, chokidar):
// node's fs.watch, whose events say less than chokidar's, made into the routes' (./routes.mjs changed):
//   - fs.watch says "rename" (a file or folder added or removed) or "change", with the path from the
//     folder watched; each is told as add, change, unlink, addDir or unlinkDir, by a look at the path
//     (gone: unlink). A write's temp file (a dot name: shared/files.mjs writeAtomic writes one, then
//     renames it in) is passed over, the rename then seen as the document's own file changing.
//   - Without a name (some platforms, a folder's watch overflowing) it is told as "reset": the routes
//     forget the pages they kept.
//   - What Gallery keeps of its own (.gallery/ but the 写作偏好 page's folder, exports/) is left before
//     anything is looked at (routes.mjs ignoredIn): a commit writes the edit state each time.
// Where: one recursive watch of the workspace on Windows and macOS (ReadDirectoryChangesW, FSEvents),
// which on Windows holds the workspace folder (it cannot be renamed while a server runs). On Linux,
// and wherever a recursive watch is refused (ERR_FEATURE_UNAVAILABLE_ON_PLATFORM), one watch a folder
// at the depths that hold what a page shows: the root, each <slug>/ and its assets/, the same of the
// 写作偏好 page in .gallery/pages/, each custom page's in pages/, each extension's in extensions/, and every folder of components/ (Node's recursive watch on Linux
// would take an inotify watch for every folder, .gallery/state/history/* and a document's materials/
// too, and run out at the default limit); those are watched again as folders come and go (.gallery/
// itself too, for its pages/).

/**
 * The folders watched one by one in workspace `root`: the root, each document's folder and its assets/,
 * .gallery/pages/ and each page's, .gallery/ itself (for pages/ made: what else changes there is left),
 * pages/ and each custom page's folder (a document called pages, and its assets/, among the documents),
 * extensions/ and each extension's folder (where its sidebar.json is), and components/ all the way down: a package's files may stand in folders of their own.
 */
function foldersOf(root, extensionsOnly = false, outline = false) {
  const { components, gallery, preferencesPage: pages, customPages: custom, extensions } = layoutOf(root);
  const below = (directory, keep) => {
    try {
      return fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory() && !entry.isSymbolicLink() && keep(entry.name)).map((entry) => path.join(directory, entry.name));
    } catch {
      return [];
    }
  };
  const descendants = directory => [directory, ...below(directory, name => !name.startsWith(".") && name !== "node_modules").flatMap(descendants)];
  const extensionFolders = below(extensions, (name) => isExtensionId(name) && !DOCUMENT_FOLDERS.includes(name)).flatMap(descendants);
  if (extensionsOnly) {
    // Watch the nearest existing parent too: the default workspace may not have been made yet,
    // or extensions/ may be replaced as a whole. No workspace is created just to watch it.
    let parent = path.dirname(root);
    while (!fs.existsSync(parent) && path.dirname(parent) !== parent) parent = path.dirname(parent);
    return [parent, root, ...(outline ? [gallery] : []), extensions, ...extensionFolders].filter(folder => fs.existsSync(folder));
  }
  const documents = [...below(root, (name) => isSlugName(name)), ...below(pages, (name) => isSlugName(name))];
  const packages = (directory) => [directory, ...below(directory, (name) => !name.startsWith(".")).flatMap(packages)];
  const customPages = below(custom, (name) => isSlugName(name) && !DOCUMENT_FOLDERS.includes(name));
  return [...new Set([root, ...[gallery, pages, custom, extensions, path.join(root, "preferences")].filter((folder) => fs.existsSync(folder)), ...customPages, ...extensionFolders, ...documents, ...documents.map((folder) => path.join(folder, "assets")).filter((folder) => fs.existsSync(folder)), ...(fs.existsSync(components) ? packages(components) : [])])];
}

/**
 * Watch workspace `root`, telling `changed(event, file)` (./routes.mjs) of what changes in it.
 * `folders`: one watch a folder, wherever (the tests: Linux's way on any system). Returns { close() }.
 * `extensionsOnly`: only extension folders and their parents, even before root exists; used by project
 * servers to follow the default workspace's public columns without watching its document contents.
 */
export function watchWorkspace(root, changed, { folders = process.platform === "linux", extensionsOnly = false, outline = false } = {}) {
  const ignored = ignoredIn(root);
  const tell = (eventType, file) => {
    const tree = outline && file === layoutOf(root).outline;
    if (!tree && (ignored(file) || path.basename(file).startsWith("."))) return;
    fs.stat(file, (error, stat) => {
      if (error) return changed(error.code === "ENOENT" ? "unlink" : "change", file);
      const directory = stat.isDirectory();
      changed(eventType === "rename" ? (directory ? "addDir" : "add") : directory ? "addDir" : "change", file);
    });
  };
  const onError = () => {}; // a folder removed under its watch: the next look watches what is there

  if (!folders && !extensionsOnly) {
    try {
      const watcher = fs.watch(root, { recursive: true }, (eventType, name) => (name ? tell(eventType, path.join(root, name.toString())) : changed("reset", root)));
      watcher.on("error", onError);
      return { close: () => watcher.close() };
    } catch (error) {
      if (error.code !== "ERR_FEATURE_UNAVAILABLE_ON_PLATFORM") throw error;
    }
  }

  const watchers = new Map(); // folder -> its watcher
  let timer = null;
  // The extensions' folder followed alone (a project's server following the default workspace's) is watched
  // whole, recursively, where that is a watch of the one folder (Windows, macOS): a watch of each folder in it
  // holds that folder open, and Windows then refuses to rename what holds it (an install's swap of the
  // extension's folder, its columns/ moved into the new one: server/extension-install.mjs).
  const { extensions } = layoutOf(root);
  const whole = extensionsOnly && !folders;
  const inside = (folder) => folder.startsWith(extensions + path.sep);
  const look = () => {
    const wanted = new Map(foldersOf(root, extensionsOnly, outline).filter(folder => !(whole && inside(folder))).flatMap(folder => {
      try { const stat = fs.statSync(folder); return [[folder, `${stat.dev}:${stat.ino}`]]; } catch { return []; }
    }));
    for (const [folder, entry] of watchers) {
      if (wanted.get(folder) === entry.identity) continue;
      entry.watcher.close();
      watchers.delete(folder);
    }
    for (const [folder, identity] of wanted) {
      if (watchers.has(folder)) continue;
      try {
        const watcher = fs.watch(folder, { recursive: whole && folder === extensions }, (eventType, name) => {
          if (!name) return changed("reset", folder);
          // A folder added or taken away where folders are watched (the root, pages, a document's own, components/): looked at again.
          if (eventType === "rename") again();
          tell(eventType, path.join(folder, name.toString()));
        });
        watcher.on("error", onError);
        watchers.set(folder, { watcher, identity });
      } catch {} // gone meanwhile
    }
  };
  // One look 50ms on, however many events come meanwhile: a watcher of a folder that was removed can
  // fire without end (Node on Windows), and a look put off by each would never come.
  const again = () => {
    timer ??= setTimeout(() => {
      timer = null;
      look();
    }, 50);
  };
  look();
  return {
    close() {
      clearTimeout(timer);
      for (const { watcher } of watchers.values()) watcher.close();
      watchers.clear();
    },
    /** The folders watched now (the tests). */
    get folders() {
      return [...watchers.keys()];
    },
  };
}
