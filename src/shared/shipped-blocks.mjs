import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { beforeCatalogRead, isPicture } from "./component-catalog.mjs";
import { GALLERY_SCOPE } from "./components/installed.mjs";
import { packsDirectory } from "./paths.mjs";
import { PACKAGE_MANIFEST, layoutOf } from "./workspace.mjs";

// Gallery's own custom blocks (自带块): the blocks of Gallery's own block packs (./block-packs.mjs), a
// folder each in the package (src/packs/<pack>/<name>/ in the source checkout, packs/<pack>/<name>/ in
// the release), each a block of the scope <pack> as any workspace's is, its manifest's id <pack>/<name>:
// the pack gallery's (Gallery 风格) and gallery-soft's (柔光风格). A workspace's first start installs each
// pack as any shared pack is installed (./block-packs.mjs installOfficialPacks); gallery block add <name>
// (gallery's, or <pack>/<name>) copies one unchanged into a workspace, components/<pack>/<name>/, and records its
// version and a fingerprint of what it copied in .gallery/blocks.json; adding it again updates a copy
// that is as it was put there, and never one whose fingerprint has changed since, which is someone's
// work (gallery block new <id> --recipe <name> starts a block of one's own from a shipped one instead).
// The scopes of Gallery's packs are kept for these: gallery block new refuses them. A custom page's
// service (phase 2) adds one the same way when a card asks for it.
//
// A workspace's copies follow Gallery (the user, 2026-11-09: a home page made with 1.0.0's cards kept
// their plain look after 1.1.0 brought the cards' design): a copy that is as it was added and behind
// Gallery's is updated in place, as gallery block add would update it, without the command
// (followShipped): as a server starts (src/server/index.mjs, production.mjs), whenever its catalog
// reads the workspace's blocks (readCatalog, by followOnRead's hook) and when the page service reads
// them (its library, an add), once a process for each block and version, told once in the server's
// log. A copy changed since it was added is someone's work and stays as it is: the log says so once,
// and 设置 › 组件列表 and gallery block list say that Gallery has a newer one and how to take it.

/** The scope of Gallery's own blocks that a bare name names (gallery block add card): the pack gallery's folder, its page cards Gallery 风格's and its blocks for documents the default pack's (packOf). */
export const SHIPPED_SCOPE = GALLERY_SCOPE;

// What a system writes into a folder it shows, which nobody wrote: macOS's Finder (.DS_Store, and ._
// files beside each on a disk of another format), Windows' Explorer (Thumbs.db, desktop.ini). No
// fingerprint counts them, no add takes them out, and a recipe copies none.
const SYSTEM_FILE = /^(?:\.DS_Store|\._.*|Thumbs\.db|ehthumbs\.db|desktop\.ini)$/i;

/** Whether a file called `name` (its last part) is one a system wrote into a folder it showed. */
export const isSystemFile = (name) => SYSTEM_FILE.test(name);

/** The files of a folder, by their paths in it with "/", sorted, what a system wrote there left out. */
export function filesIn(folder) {
  return fs.readdirSync(folder, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile() && !SYSTEM_FILE.test(entry.name))
    .map((entry) => path.relative(folder, path.join(entry.parentPath, entry.name)).split(path.sep).join("/")).sort();
}

/**
 * The names of a block's files in the order they are written: its manifest last, what makes a folder a
 * block to whoever watches (a running server's watcher, the catalog), so that a block that appears is
 * whole, and one a write stopped partway through is a folder with no manifest, which loads as nothing.
 */
export const writingOrder = (names) => [...names.filter((name) => name !== PACKAGE_MANIFEST), ...(names.includes(PACKAGE_MANIFEST) ? [PACKAGE_MANIFEST] : [])];

/** What a folder holds, as a hash of each file's path and bytes (what a system wrote there aside), or null when there is no such folder. */
export function fingerprintOf(folder) {
  if (!fs.existsSync(folder)) return null;
  return fingerprintOfFiles(filesIn(folder).map((name) => ({ name, data: fs.readFileSync(path.join(folder, name)) })));
}

/** What fingerprintOf says of a folder that holds `files` alone ([{ name, data }], each by its path in it with "/"). */
export function fingerprintOfFiles(files) {
  const hash = createHash("sha256");
  const named = files.filter(({ name }) => !SYSTEM_FILE.test(name.split("/").at(-1))).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const { name, data } of named) hash.update(`${name}\u0000`).update(data).update("\n");
  return hash.digest("hex").slice(0, 16);
}

// The folders right in `directory`, by name, or none where it is not there.
const foldersOf = (directory) => {
  try {
    return fs.readdirSync(directory, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
};

/** The ids of Gallery's own packs in `directory` (the package's): each folder of it, by name. */
export const shippedPackIds = (directory = packsDirectory) => foldersOf(directory);

/**
 * Gallery's own blocks in `directory` (the package's packs): [{ name, id, pack, folder, version, title:
 * { zh, en }, description: { zh, en }, places, listed (its manifest's: false, off in the menus until the user turns it on) }], by pack and name; a folder whose manifest does not read
 * as its pack's block of its name is none.
 */
export function shippedBlocks(directory = packsDirectory) {
  return foldersOf(directory).flatMap((pack) => foldersOf(path.join(directory, pack)).flatMap((name) => {
    const folder = path.join(directory, pack, name);
    try {
      const manifest = JSON.parse(fs.readFileSync(path.join(folder, PACKAGE_MANIFEST), "utf8"));
      if (manifest.id !== `${pack}/${name}`) return [];
      return [{ name, id: manifest.id, pack, folder, version: manifest.version, title: manifest.name, description: manifest.description, places: manifest.places ?? ["document"], listed: manifest.listed !== false }];
    } catch {
      return [];
    }
  }));
}

/** The shipped block `written` names (card, gallery/card, gallery-soft/todos: a bare name is the pack gallery's), or null. */
export function shippedBlock(written, directory = packsDirectory) {
  const id = written.includes("/") ? written : `${SHIPPED_SCOPE}/${written}`;
  return shippedBlocks(directory).find((block) => block.id === id) ?? null;
}

/** Whether `id` is of a scope of Gallery's own packs (gallery/…, gallery-soft/…). */
export const isShippedId = (id, directory = packsDirectory) => shippedPackIds(directory).includes(String(id).split("/")[0]);

/**
 * .gallery/blocks.json: { "<id>": { version, fingerprint } } of each block added or installed (one of
 * Gallery's own, or of a pack), and `packs`, { "<pack id>": { version, fingerprint, blocks, official? } } of
 * each pack installed (./block-packs.mjs); {} for none or a file that does not read.
 */
export function recordOf(root) {
  try {
    const record = JSON.parse(fs.readFileSync(layoutOf(root).blocks, "utf8"));
    return record && typeof record === "object" && !Array.isArray(record) ? record : {};
  } catch {
    return {};
  }
}

/** .gallery/blocks.json as `record` says. */
export function writeRecord(root, record) {
  const file = layoutOf(root).blocks;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(record, null, 2)}\n`);
}

/** Where a block of the workspace at `root` is. */
const folderIn = (root, id) => path.join(layoutOf(root).components, ...id.split("/"));

function versionIn(folder) {
  try {
    return JSON.parse(fs.readFileSync(path.join(folder, PACKAGE_MANIFEST), "utf8")).version ?? null;
  } catch {
    return null;
  }
}

/**
 * What the workspace at `root` holds of the shipped `block`: { added (a folder of its id is there),
 * version (what its manifest says, or null), changed (its files are not what was added: changed since,
 * or put there by some other hand), behind (it is as added, and Gallery's is another now) }.
 */
export function shippedState(root, block) {
  const folder = folderIn(root, block.id);
  const now = fingerprintOf(folder);
  if (now === null) return { added: false, version: null, changed: false, behind: false };
  const version = versionIn(folder);
  const kept = recordOf(root)[block.id];
  const shipped = fingerprintOf(block.folder);
  const changed = now !== shipped && now !== kept?.fingerprint;
  return { added: true, version, changed, behind: !changed && now !== shipped };
}

/**
 * Copies the shipped `block` into the workspace at `root`, unchanged: { did: "added", "updated" (from a
 * copy as it was added, `from` its version) or "same" (nothing to do), folder }. A copy whose files
 * changed since it was added (or that no add put there) is left as it is: an error with code "changed".
 * The manifest is written last, what makes a folder a block to a running server's watcher, so that a
 * block that appears is whole; files of the old copy that the new one has not go first.
 */
export function addShipped(root, block) {
  const folder = folderIn(root, block.id);
  const state = shippedState(root, block);
  if (state.changed) throw Object.assign(new Error(`${block.id} was changed after it was added`), { code: "changed", folder });
  const shipped = fingerprintOf(block.folder);
  const record = recordOf(root);
  if (state.added && !state.behind) {
    if (record[block.id]?.fingerprint !== shipped) writeRecord(root, { ...record, [block.id]: { version: block.version, fingerprint: shipped } });
    return { did: "same", folder };
  }
  const files = filesIn(block.folder);
  if (state.added) for (const old of filesIn(folder)) if (!files.includes(old)) fs.rmSync(path.join(folder, old));
  for (const file of writingOrder(files)) {
    fs.mkdirSync(path.dirname(path.join(folder, file)), { recursive: true });
    fs.copyFileSync(path.join(block.folder, file), path.join(folder, file));
  }
  writeRecord(root, { ...record, [block.id]: { version: block.version, fingerprint: shipped } });
  return { did: state.added ? "updated" : "added", from: state.version, folder };
}

// A version's numbers (1.10.0: [1, 10, 0]), or null for one that is not three of them.
const numbersOf = (version) => (/^\d+\.\d+\.\d+$/.test(String(version ?? "")) ? version.split(".").map(Number) : null);

/** Whether version `a` comes after `b` (both x.y.z); `b` none or not of that form: whether they differ. */
export function versionAfter(a, b) {
  const [x, y] = [numbersOf(a), numbersOf(b)];
  if (!x || !y) return a !== b;
  const at = x.findIndex((number, index) => number !== y[index]);
  return at !== -1 && x[at] > y[at];
}

/**
 * The version of the shipped `block` that the workspace at `root` does not take because its copy was
 * changed since it was added (or no add put it there), when Gallery's comes after the copy's; else null.
 */
export function shippedNewer(root, block) {
  // A content comparison matters only when Gallery actually ships a newer version.
  if (!versionAfter(block.version, versionIn(folderIn(root, block.id)))) return null;
  const state = shippedState(root, block);
  return state.changed && versionAfter(block.version, state.version) ? block.version : null;
}

const looked = new Map(); // a workspace's root and a shipped block's folder -> the version of it looked at
let told = () => {}; // where followShipped tells what it did when it is not given a log: the server's (followOnRead)

// What followShipped did, as lines of the log.
function followedLines(root, { updated, kept, failed }) {
  const lines = [];
  if (updated.length) lines.push(`Gallery's own blocks in ${root}, as they were added, updated to this Gallery's: ${updated.map(({ id, from, to }) => `${id} ${from ?? "?"} -> ${to}`).join(", ")}`);
  for (const { id, version, shipped } of kept) lines.push(`${id} in ${root} was changed after it was added, so it stays at ${version ?? "its version"}: Gallery's is ${shipped} (设置 › 组件列表 says how to take it)`);
  for (const { id, to, why } of failed) lines.push(`${id} in ${root} could not be updated to Gallery's ${to}: ${why}`);
  return lines;
}

/**
 * Bring the workspace at `root`'s copies of Gallery's own blocks (of `ids`, by default each one) up to
 * Gallery's (in `directory`): one that is as it was added and behind is updated as addShipped updates
 * it (the manifest written last); one changed since it was added is kept as it is. Each block and
 * version is looked at once a process, a later call for it doing nothing, so that what reads the blocks
 * again and again (a server's catalog, its page service) pays once. `log`: told once of what was done,
 * a line each (by default the one followOnRead set: none in a command). Never throws: { updated: [{ id,
 * from, to }], kept: [{ id, version, shipped }] (changed, Gallery's newer), failed: [{ id, to, why }] }.
 */
export function followShipped(root, { ids = null, directory = packsDirectory, log = null } = {}) {
  const done = { updated: [], kept: [], failed: [] };
  const key = path.resolve(root);
  for (const block of shippedBlocks(directory)) {
    if (ids && !ids.includes(block.id)) continue;
    const at = `${key}\u0000${path.resolve(block.folder)}`;
    if (looked.get(at) === block.version) continue;
    looked.set(at, block.version);
    try {
      const state = shippedState(root, block);
      if (state.changed && versionAfter(block.version, state.version)) done.kept.push({ id: block.id, version: state.version, shipped: block.version });
      if (!state.behind) continue;
      if (addShipped(root, block).did === "updated") done.updated.push({ id: block.id, from: state.version, to: block.version });
    } catch (error) {
      done.failed.push({ id: block.id, to: block.version, why: error?.message ?? String(error) });
    }
  }
  for (const line of followedLines(key, done)) (log ?? told)(line);
  return done;
}

/**
 * The blocks of `blocks` (shippedBlocks') that the workspace at `root` holds as Gallery ships them now,
 * an install of their pack having just found or made them so (installOfficialPacks): looked at, so that
 * followShipped, which would find nothing to do for them, does not read each one's files again (a
 * server's start read every block twice over for it, some 150 ms).
 */
export function followedAlready(root, blocks) {
  const key = path.resolve(root);
  for (const block of blocks) looked.set(`${key} ${path.resolve(block.folder)}`, block.version);
}

const following = new Set(); // the workspaces whose server runs in this process (followOnRead), by their resolved root
const keyOf = (root) => (process.platform === "win32" ? path.resolve(root).toLowerCase() : path.resolve(root));

/**
 * From now on in this process, the catalog brings the copies of Gallery's own blocks of the workspace at
 * `root` up to Gallery's before it reads them (followShipped, its ids those of the scopes of Gallery's
 * packs it finds), and what is done of it is told to `log` (a line): a server's, set as it starts for
 * its own workspace (another's blocks are its own server's to follow, and a process that is no
 * server, a test's, reads a workspace without writing any of it).
 */
export function followOnRead(root, log) {
  following.add(keyOf(root));
  told = log;
  beforeCatalogRead((read, ids) => {
    if (following.has(keyOf(read))) followShipped(read, { ids });
  }, shippedPackIds());
}

// The words of a shipped block's files that name it, and what a recipe's copy names instead: its id,
// and the id with "-" for "/" (a class, a chart type).
const namesOf = (id) => [id, id.replace("/", "-")];
const escaped = (words) => words.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The files of a new block `id` made from the shipped `block` (gallery block new <id> --recipe <name>),
 * by name, the manifest last: each as Gallery ships it, every word that names the shipped block naming
 * the new one, all in one pass, so that a new name holding an old one (local/gallery-card, made of
 * gallery/card) is not renamed again; its version 0.1.0, its manifest's `listed` left out. Not its pictures (the menus' preview-light.webp and
 * preview-dark.webp, their English pair, and a preview.svg of before: isPicture): they are of the shipped block, and the new one's are made
 * by its first gallery block check that passes.
 */
export function recipeFiles(block, id) {
  const [from, to] = [namesOf(block.id), namesOf(id)];
  const names = new RegExp(from.map(escaped).join("|"), "g");
  const files = {};
  for (const file of filesIn(block.folder)) {
    if (isPicture(file)) continue;
    const bytes = fs.readFileSync(path.join(block.folder, file));
    if (/\.(?:json|html|md|css|js|svg)$/.test(file)) {
      let text = bytes.toString("utf8").replace(names, (name) => to[from.indexOf(name)]);
      // Its version 0.1.0, and no `listed`: a block of one's own is offered as any, whatever Gallery keeps out of its menus.
      if (file === PACKAGE_MANIFEST) text = text.replace(/"version":\s*"[^"]*"/, '"version": "0.1.0"').replace(/\n[ \t]*"listed":\s*(?:true|false),(?=[ \t]*\r?\n)/, "");
      files[file] = text;
    } else files[file] = bytes;
  }
  return Object.fromEntries(writingOrder(Object.keys(files)).map((name) => [name, files[name]]));
}
