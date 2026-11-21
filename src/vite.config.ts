import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// npm run dev:local: the report previews, the editor's and the workspace's endpoints (reportPreview,
// src/server/) and the workbench at /, whose React modules are the only ones Vite builds.
// The workspace is the default one, as an installed Gallery's is (defaultWorkspace,
// src/shared/workspace.mjs): the folder GALLERY_DEFAULT_WORKSPACE names, else Gallery in the user's
// Documents folder. GALLERY_WORKSPACE is set to it (one set before is not read) before src/server/
// is loaded, whose paths are read at import (src/shared/paths.mjs). adoptWorkspace then makes what a
// workspace's first start makes (gallery.json and .gallery/ where they are missing, Gallery's own
// block packs unless GALLERY_NO_PACKS, the default home page), and once the server listens it writes
// server.json and server.lock in Gallery's data folder and adds the workspace to the registry there
// (src/shared/user-directory.mjs: %LOCALAPPDATA%\gallery on Windows). So by default this server edits
// the documents an installed Gallery shows, and it will not start while that Gallery's server runs
// ("Gallery already runs on port …": one server a data folder). To keep it off your own documents and
// your installed Gallery, give it folders of its own, outside the checkout (in a POSIX shell):
//   GALLERY_DEFAULT_WORKSPACE=../gallery-dev/workspace GALLERY_DATA_DIR=../gallery-dev/data npm run dev:local
// The port is 8080 all the same (package.json: --strictPort), the first one an installed Gallery's
// server tries too: while that server holds it, Vite stops at the port in use (gallery stop frees it).
// This file is in src/ and every Vite of a checkout is given it (--config src/vite.config.ts: package.json's
// dev:local, src/cli/serve.mjs, src/cli/server-process.mjs, the browser tests' harness); Vite's root is the
// checkout all the same (root below), where the workbench's modules and public/ are found.
const repository = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export default defineConfig(async () => {
  const { defaultWorkspace } = await import("./shared/workspace.mjs");
  const workspace = defaultWorkspace();
  process.env.GALLERY_WORKSPACE = workspace;
  const { adoptWorkspace, ignoredIn, reportPreview } = await import("./server/index.mjs");
  await adoptWorkspace(workspace);
  // What this server watches of the checkout: src/, public/ and skills/gallery/sdk/ (what it serves and builds,
  // and the SDK's types, which the checks read; the folders it lies in are gone through for it, nothing else
  // of them watched) and the files directly in the checkout (package.json…). Every other folder a checkout holds
  // is left alone, whatever it is: the build's output, the tests, the documents, other checkouts of the
  // repository (git worktrees), a maintainer's own folders of drafts and tools. Watched, such a folder
  // costs a handle and memory for every file in it (a checkout holding Python environments and picture
  // frames made each server keep 640,000 handles and 6 GB, and a few servers at once ran the machine
  // out of memory, 2026-11-22), and one removed or written under the watcher stopped the server (EBUSY
  // on a file, 2026-11-08 and 2026-11-13). The workspace is watched wherever it lies, in the checkout too.
  const fold = (file: string) => (process.platform === "win32" ? path.resolve(file).toLowerCase() : path.resolve(file));
  const within = (file: string, folder: string) => file === folder || file.startsWith(folder + path.sep);
  const checkout = fold(repository);
  const watched = ["src", "public", "skills/gallery/sdk"].map((folder) => fold(path.join(repository, folder)));
  const workspaceFolder = fold(workspace);
  const folders = new Map<string, boolean>(); // an entry directly in the checkout: whether it is a folder
  const isFolder = (entry: string) => {
    if (!folders.has(entry)) folders.set(entry, fs.statSync(entry, { throwIfNoEntry: false })?.isDirectory() ?? false);
    return folders.get(entry) === true;
  };
  const notServedHere = (file: string) => {
    const at = fold(file);
    if (at === checkout || !within(at, checkout)) return false; // the checkout itself, and what lies outside it
    if (within(at, workspaceFolder) || within(workspaceFolder, at)) return false; // the workspace and the folders it lies in
    if (watched.some((folder) => within(at, folder) || within(folder, at))) return false; // a watched folder, and those it lies in
    const entry = path.join(checkout, at.slice(checkout.length + 1).split(path.sep)[0]);
    return at !== entry || isFolder(entry);
  };
  // Vite's cache of optimized dependencies: node_modules/.vite unless GALLERY_VITE_CACHE_DIR names another, which the browser tests'
  // harness sets for each studio's server (tests/browser/harness.mjs): servers of runs at once sharing one answered "504 Outdated
  // Optimize Dep" to each other (2026-11-08).
  const cacheDir = process.env.GALLERY_VITE_CACHE_DIR ? path.resolve(process.env.GALLERY_VITE_CACHE_DIR) : null;
  return {
    root: repository,
    ...(cacheDir ? { cacheDir } : {}),
    plugins: [react(), reportPreview()],
    server: {
      host: "127.0.0.1",
      // What Gallery keeps of its own (.gallery/ but the 写作偏好 page) and the exports: never a reload.
      watch: { ignored: [ignoredIn(workspace), notServedHere] },
    },
    optimizeDeps: {
      entries: ["src/workbench/app/main.tsx"],
    },
  };
});
