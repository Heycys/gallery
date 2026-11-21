import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { release, releaseFile } from "../shared/paths.mjs";

// What files are now, as a short stamp (docs/render.md, "Live preview"): the preview names the
// editor's modules and the kit's files a page loads by it (a browser keeps them for good under that
// name, never asking again), and keeps a page it served under it (./page-cache.mjs). A stamp is read
// when it is asked for, from the files themselves (each one's modification time and size, every
// stat at once), never from the watcher: a watcher tells a moment after the write, and a page served
// in that moment under the name it had would be given the modules a browser kept under it, which
// are no longer what the files say. Read so, a file saved is in the next page's stamp whatever the
// watcher has said; it costs a stat a file (a millisecond or two for the editor's 244 modules).

/** The stamp of `files` (paths), as they are now: 16 hex digits; a file that is not there counts as such. */
export async function stampOf(files) {
  const stats = await Promise.all(files.map((file) => fs.stat(file).then(({ mtimeMs, size }) => `${mtimeMs} ${size}`, () => "none")));
  const hash = createHash("sha256");
  files.forEach((file, index) => hash.update(`${file}\u0000${stats[index]}\n`));
  return hash.digest("hex").slice(0, 16);
}

/**
 * The files under `directories` (in their folders too) that `keep(path)` takes, listed when first
 * asked and listed again after changed(): a file added or removed is told by the watcher, whose
 * moment late matters not here (a file that imports a new one is itself changed, and a stamp reads
 * every file listed).
 */
export function createFileList(directories, keep) {
  let listed = null;
  const list = async () => (await Promise.all(directories.map(async (directory) => {
    const entries = await fs.readdir(directory, { recursive: true, withFileTypes: true }).catch(() => []);
    return entries.filter((entry) => entry.isFile()).map((entry) => path.join(entry.parentPath, entry.name));
  }))).flat().filter(keep).sort();
  return {
    files: () => (listed ??= list()),
    changed: () => {
      listed = null;
    },
  };
}

/**
 * The release's stamps of the package's files (release.json, written by src/cli/release-build.mjs):
 * { editor: the browser modules' stamp, kit: { <asset id>: its file's } }, each a hash of the files'
 * contents; null in the source checkout. npm writes every file of a package with one fixed time, so
 * after an upgrade a module of the same size would keep the stamp read from its time and size, and
 * the browser its copy of the version before: these files never change while the release runs.
 */
export const packageStamps = release ? JSON.parse(readFileSync(releaseFile, "utf8")).stamps : null;
