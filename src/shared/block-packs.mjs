import fs from "node:fs";
import path from "node:path";
import { componentSettings, problemIn, writeComponentSettings } from "./component-catalog.mjs";
import { packOf } from "./components/installed.mjs";
import { refusal, said } from "./i18n/index.mjs";
import { DEFAULT_PACK, OWN_SCOPE, PACK_FILE, PACK_ID, readPackManifest } from "./pack-manifest.mjs";
import { packsDirectory } from "./paths.mjs";
import { filesIn, fingerprintOf, fingerprintOfFiles, followedAlready, isSystemFile, recordOf, shippedBlocks, shippedPackIds, versionAfter, writeRecord, writingOrder } from "./shipped-blocks.mjs";
import { DEVICE_NAMES, PACKAGE_MANIFEST, layoutOf, markerOf, packageFolders } from "./workspace.mjs";

// Block packs (自定义块包, since 2026-11-09; docs/render.md "Block packs"). A pack
// is a scope of the workspace's custom blocks, components/<id>/, with its pack.json (./pack-manifest.mjs)
// and a folder of each of its blocks, <id>/<name>/, the blocks' ids <id>/<name> as ever, so that nothing
// written of a block changes; a scope with no pack.json is a pack of its own, named by its scope, and
// local/ (OWN_SCOPE: gallery block new <name>'s, where an Agent's block goes when it names no pack) is the
// default pack (默认块包, pack-manifest.mjs DEFAULT_PACK), always listed, first. A pack is shared as its folder, or a zip of it (the folder itself, or what it
// holds, at the zip's top), and installed into a workspace by gallery block pack install (src/cli/component.mjs)
// or 设置 › 组件列表's 导入 (src/server/component-settings.mjs), which both read it (src/transfer/pack-source.mjs)
// and hand its files here, checked alike:
//
//   installPack  its files copied in, as gallery block add copies one of Gallery's own: each block's
//                manifest last; .gallery/blocks.json records each block's version and fingerprint, and
//                under `packs` the pack's version, the fingerprint of its own files (pack.json, and what
//                else stands at its top) and its blocks. Installed again (a newer version), a block as it
//                was installed is replaced, one changed since kept as it is (someone's work), a block
//                the new version has not taken out where it is as installed; pack.json the same way.
//                Refused, with why (said()'s, a \`code\`): a file that points out of the pack ("path"),
//                one too large ("size"), a pack.json missing or that does not read ("manifest"), a block
//                folder of no component.json naming it <id>/<name> ("block"), the id of one of Gallery's
//                own packs ("official"), an id a scope of the workspace has that no install put there
//                ("taken": another pack, or blocks someone wrote).
//   removePack   a pack installed taken out, its folder and records; never one of Gallery's own (its
//                switch turns it off), nor a scope no install put there ("own": someone's work).
//   workspacePacks  the workspace's packs as 设置 › 组件列表 and gallery block pack list say them.
//
// Which pack a block counts in is its scope (components/installed.mjs packOf), but for Gallery's own blocks
// for documents alone (gallery/card, chart-card, metric: places ["document"]), which the
// pack gallery's folder holds and installs, and which count in the default pack: Gallery 风格 is a look of
// the custom pages' cards (the user, 2026-11-19), its switch none of theirs, and their ids stay as written.
//
// Gallery's own packs (src/packs/<id>/: gallery, Gallery 风格; gallery-soft, 柔光风格) are installed the
// same way as a workspace's server starts and by gallery init (installOfficialPacks): once each, a pack
// switched off at first where OFF_AT_FIRST says so (gallery.json's components.packs), and again at each
// start with the same rule, so that a block as it was installed follows Gallery, a block Gallery's pack
// has come to hold is added, and one taken away by hand stays away (its record says it was there).
// A pack's switch (components.packs, { "<id>": { "enabled": false } }, none written on) keeps all its
// blocks out of every menu and library, as each one's master switch does (shared/components/installed.mjs
// inDocumentMenus); what is written of them shows as ever.

/** Gallery's own packs that a workspace has switched off when they are first installed. */
export const OFF_AT_FIRST = Object.freeze(["gallery-soft"]);

/**
 * The ids of Gallery's own packs that are off though gallery.json names no switch for them: one off at first
 * (OFF_AT_FIRST) that this workspace has not installed yet, which its first install will switch off. A
 * start that installs none (NO_PACKS, a workspace made by hand) has the library offer Gallery's own blocks
 * from the package, and a pack that is off when it comes in is not one of them. `switches` is the catalog
 * settings' `packs` (true on, false off, by id).
 */
export function offUntilInstalled(root, switches = {}) {
  const installed = recordOf(root).packs;
  return OFF_AT_FIRST.filter((id) => switches?.[id] === undefined && !isTable(installed?.[id]));
}

/** The environment variable that keeps a start (and gallery init) from installing Gallery's own packs: the tests' workspaces. */
export const NO_PACKS = "GALLERY_NO_PACKS";

/** Whether `env` says to install none of Gallery's own packs (NO_PACKS set, not to "", "0" or "false"). */
export const packsSkipped = (env = process.env) => !["", "0", "false", undefined].includes(env[NO_PACKS]);

const MOST_FILES = 2000;
const MOST_BYTES = 64 * 1024 * 1024;
const NAME = /^[a-z0-9][a-z0-9-]*$/;
const isTable = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const fail = (code, message) => {
  throw refusal(message, { code });
};

/** The files of `folder`, [{ name (its path in it, with "/"), data }]: a link is none of them. */
export function folderFiles(folder) {
  const files = [];
  for (const entry of fs.readdirSync(folder, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    if (files.length >= MOST_FILES) fail("size", said("块包太大：最多 {0} 个文件、{1} MB", MOST_FILES, MOST_BYTES / 1024 / 1024));
    const name = path.relative(folder, path.join(entry.parentPath, entry.name)).split(path.sep).join("/");
    files.push({ name, data: fs.readFileSync(path.join(folder, ...name.split("/"))) });
  }
  return files;
}

/**
 * A pack's files ([{ name, data }], as a folder or a zip gives them) read as one: { manifest, blocks: Map
 * of each block's folder name to its files, own: the files at its top, pack.json among them }. A pack
 * zipped with its folder (one folder at the top, pack.json in it) is read from that folder; what a
 * system wrote (.DS_Store, __MACOSX/…) is passed over. Refused as installPack says; `refuse(manifest)`, run
 * once its pack.json reads, before its blocks are looked at, refuses what it will.
 */
export function readPack(given, { refuse = () => {} } = {}) {
  const files = [];
  let bytes = 0;
  for (const { name: written, data } of given) {
    const name = String(written).replace(/\\/g, "/");
    if (name.endsWith("/")) continue; // a folder of a zip
    const parts = name.split("/");
    if (name.startsWith("/") || /^[A-Za-z]:/.test(name) || name.includes("\u0000") || parts.some((part) => part === "" || part === "." || part === "..")) fail("path", said("{0} 指向块包外面，不能装", String(written)));
    if (parts[0] === "__MACOSX" || isSystemFile(parts.at(-1))) continue;
    bytes += data.length;
    files.push({ name, data });
  }
  if (files.length > MOST_FILES || bytes > MOST_BYTES) fail("size", said("块包太大：最多 {0} 个文件、{1} MB", MOST_FILES, MOST_BYTES / 1024 / 1024));
  let inner = files;
  if (!files.some(({ name }) => name === PACK_FILE)) {
    const tops = new Set(files.map(({ name }) => name.split("/")[0]));
    const [top] = tops;
    if (tops.size !== 1 || !files.some(({ name }) => name === `${top}/${PACK_FILE}`)) fail("manifest", said("最上一层没有 pack.json：块包是一个文件夹，最上一层放 pack.json，每个块一个文件夹"));
    inner = files.map(({ name, data }) => ({ name: name.slice(top.length + 1), data }));
  }
  const manifest = readPackManifest(inner.find(({ name }) => name === PACK_FILE).data.toString("utf8"));
  refuse(manifest);
  const blocks = new Map();
  const own = [];
  for (const file of inner) {
    const [first, ...rest] = file.name.split("/");
    if (rest.length === 0) {
      own.push(file);
      continue;
    }
    if (!blocks.has(first)) blocks.set(first, []);
    blocks.get(first).push({ name: rest.join("/"), data: file.data });
  }
  for (const [name, list] of blocks) {
    if (!NAME.test(name) || DEVICE_NAMES.has(name)) fail("block", said("{0} 不是块的文件夹名：只用小写字母、数字和连字符", name));
    const file = list.find((each) => each.name === PACKAGE_MANIFEST);
    if (!file) fail("block", said("{0}/ 里没有 component.json", name));
    let id;
    try {
      id = JSON.parse(file.data.toString("utf8").replace(/^﻿/, "")).id;
    } catch {
      fail("block", said("{0}/component.json 不是 JSON", name));
    }
    if (id !== `${manifest.id}/${name}`) fail("block", said("{0}/component.json 的 id 要写成 {1}", name, `${manifest.id}/${name}`));
  }
  return { manifest, blocks, own };
}

// A block's version, as its manifest says it, or null.
function versionIn(list) {
  try {
    const version = JSON.parse(list.find(({ name }) => name === PACKAGE_MANIFEST).data.toString("utf8").replace(/^﻿/, "")).version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

// The files right at the top of a pack's folder (pack.json and what else stands beside the blocks).
function topFiles(folder) {
  try {
    return fs.readdirSync(folder, { withFileTypes: true }).filter((entry) => entry.isFile() && !isSystemFile(entry.name)).map((entry) => entry.name).sort();
  } catch {
    return [];
  }
}

// The `places` a block's manifest in `folder` says (null where it says none: a document's alone), or
// undefined where it does not read.
function placesIn(folder) {
  try {
    const places = JSON.parse(fs.readFileSync(path.join(folder, PACKAGE_MANIFEST), "utf8").replace(/^﻿/, "")).places;
    return Array.isArray(places) ? places : null;
  } catch {
    return undefined;
  }
}

// What the top of a pack's folder holds, as a fingerprint, or null for nothing there.
function ownFingerprint(folder) {
  const names = topFiles(folder);
  return names.length ? fingerprintOfFiles(names.map((name) => ({ name, data: fs.readFileSync(path.join(folder, name)) }))) : null;
}

// Whether a folder holds anything a system did not write there.
function holds(folder) {
  try {
    return fs.readdirSync(folder).some((name) => !isSystemFile(name));
  } catch {
    return false;
  }
}

// `files` written into `folder`, the files of what was there that they have not taken out first
// (`replacing`), the manifest last: what makes a folder a block to a running server's watcher.
function writeFiles(folder, files, { replacing = false, last = PACKAGE_MANIFEST } = {}) {
  const names = files.map(({ name }) => name);
  if (replacing) for (const old of filesIn(folder)) if (!names.includes(old)) fs.rmSync(path.join(folder, ...old.split("/")), { force: true });
  const byName = new Map(files.map((file) => [file.name, file.data]));
  const order = last === PACKAGE_MANIFEST ? writingOrder(names) : [...names.filter((name) => name !== last), ...(names.includes(last) ? [last] : [])];
  for (const name of order) {
    const target = path.join(folder, ...name.split("/"));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, byName.get(name));
  }
}

/**
 * The pack `given` holds ([{ name, data }]: src/transfer/pack-source.mjs reads a folder or a zip into
 * them) installed into the workspace at `root` (above): { id, name, version, from (the version installed
 * before, or null), did ("installed", "updated" or "same"), folder, added, updated, same, kept (blocks
 * changed since they were installed, left as they are), removed (blocks the new version has not), skipped
 * (blocks of Gallery's own taken away by hand, which stay away), ownKept (its pack.json changed since,
 * left) }, each list of block ids. `official`: one of Gallery's own packs (installOfficialPacks), whose
 * id is its own and whose scope may hold its blocks already, as gallery block add put them there.
 */
export function installPack(root, given, { official = false, shippedIds = shippedPackIds() } = {}) {
  const { manifest, blocks, own } = readPack(given, {
    refuse: ({ id }) => {
      if (!official && shippedIds.includes(id)) fail("official", said("{0} 是 Gallery 自带的块包用的 id：换一个 id 再装", id));
    },
  });
  const { id } = manifest;
  const folder = path.join(layoutOf(root).components, id);
  const record = recordOf(root);
  const packs = isTable(record.packs) ? record.packs : {};
  const was = isTable(packs[id]) ? packs[id] : null;
  if (!official && !was && holds(folder)) fail("taken", said("工作区里已经有 components/{0}：这个名字被别的块包或别人写的块用着，换一个 id，或先把那个文件夹挪走", id));
  const done = { id, name: manifest.name, version: manifest.version, from: was?.version ?? null, folder, added: [], updated: [], same: [], kept: [], removed: [], skipped: [], ownKept: false };
  const names = [...blocks.keys()].sort();
  for (const name of names) {
    const block = `${id}/${name}`;
    const list = blocks.get(name);
    const target = path.join(folder, name);
    const next = fingerprintOfFiles(list);
    const now = fingerprintOf(target);
    const kept = isTable(record[block]) ? record[block] : null;
    if (now === null) {
      if (official && kept) {
        done.skipped.push(block);
        continue;
      }
      writeFiles(target, list);
      done.added.push(block);
    } else if (now === next) done.same.push(block);
    else if (kept && now === kept.fingerprint) {
      writeFiles(target, list, { replacing: true });
      done.updated.push(block);
    } else {
      done.kept.push(block);
      continue;
    }
    record[block] = { version: versionIn(list), fingerprint: next };
  }
  // The blocks of the pack as it was installed that this version has not: out, where they are as installed.
  for (const block of Array.isArray(was?.blocks) ? was.blocks : []) {
    const name = String(block).split("/")[1];
    if (!name || blocks.has(name) || !NAME.test(name)) continue;
    const target = path.join(folder, name);
    const now = fingerprintOf(target);
    if (now !== null && now !== record[block]?.fingerprint) {
      done.kept.push(block);
      continue;
    }
    if (now !== null) {
      fs.rmSync(target, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      done.removed.push(block);
    }
    delete record[block];
  }
  // Its own files, pack.json last, the same way.
  const ownNow = ownFingerprint(folder);
  const ownNext = fingerprintOfFiles(own);
  if (ownNow !== ownNext) {
    if (ownNow === null || ownNow === was?.fingerprint) {
      const names = own.map(({ name }) => name);
      for (const old of topFiles(folder)) if (!names.includes(old)) fs.rmSync(path.join(folder, old), { force: true });
      fs.mkdirSync(folder, { recursive: true });
      writeFiles(folder, own, { last: PACK_FILE });
    } else done.ownKept = true;
  }
  const changed = done.added.length + done.updated.length + done.removed.length > 0 || (ownNow !== ownNext && !done.ownKept);
  done.did = !was ? "installed" : changed ? "updated" : "same";
  record.packs = { ...packs, [id]: { version: manifest.version, fingerprint: done.ownKept ? was.fingerprint : ownNext, blocks: names.map((name) => `${id}/${name}`), ...(official ? { official: true } : {}) } };
  writeRecord(root, record);
  return done;
}

/**
 * The pack `id` taken out of the workspace at `root`: its folder and what .gallery/blocks.json records of
 * it ({ id, version, blocks }). What documents and pages hold of its blocks stays, shown as blocks that
 * are not there. Refused: one of Gallery's own ("official": its switch in 设置 › 组件列表 turns it off), none
 * there ("missing"), a scope no install put there ("own": blocks someone wrote, theirs to delete).
 */
export function removePack(root, id, { shippedIds = shippedPackIds() } = {}) {
  if (shippedIds.includes(id)) fail("official", said("{0} 是 Gallery 自带的块包，不能删除：在 设置 › 组件列表 里把它关掉", id));
  const folder = path.join(layoutOf(root).components, id);
  if (!PACK_ID.test(id) || !fs.existsSync(folder)) fail("missing", said("工作区里没有块包 {0}", id));
  const record = recordOf(root);
  const was = isTable(record.packs) && isTable(record.packs[id]) ? record.packs[id] : null;
  if (!was) fail("own", said("components/{0} 不是装进来的块包，里面的块是有人在这个工作区写的：要删就自己删掉这个文件夹", id));
  fs.rmSync(folder, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  for (const key of Object.keys(record)) if (key.startsWith(`${id}/`)) delete record[key];
  const { [id]: _gone, ...rest } = record.packs;
  writeRecord(root, { ...record, packs: rest });
  return { id, version: was.version ?? null, blocks: Array.isArray(was.blocks) ? was.blocks : [] };
}

// Why, in both languages.
const both = (problem) => ({ zh: problemIn("zh", problem), en: problemIn("en", problem) });

/**
 * The workspace's packs, as 设置 › 组件列表's cards and gallery block pack list say them: each scope of
 * components/ that holds a pack.json or a block counting in it (packOf: its scope's, but Gallery's own
 * blocks for documents the default pack's), [{ id, name: { zh, en } (its scope's for one with no
 * pack.json), description, version, author, homepage, icon (null where it says none), kind ("official":
 * one of Gallery's own; "installed": put there by an install; "own": a scope of blocks someone wrote
 * here), problem ({ zh, en }: why its pack.json does not read, or null), blocks (how many), enabled (its
 * switch, gallery.json's components.packs), changed (of what was installed, the blocks changed since, and
 * pack.json where it was), newer (of one of Gallery's own that was changed since, Gallery's version of it
 * when that comes after the one installed, which is not put over it; else null) }]: Gallery's own first,
 * then those installed, then the workspace's own, each by id; and before them all the default pack (local/,
 * OWN_SCOPE: kind "default", named and described by DEFAULT_PACK, its switch as any pack's), whether or
 * not it holds a block yet: where an Agent's block goes when it names no pack, and where Gallery's own
 * blocks for documents count.
 */
export function workspacePacks(root, { settings = null, shippedIds = shippedPackIds(), directory = packsDirectory } = {}) {
  const { components } = layoutOf(root);
  const record = recordOf(root);
  const installed = isTable(record.packs) ? record.packs : {};
  // Each block with the pack it counts in (packOf, by its manifest's places; Gallery's for one that does not read).
  let shippedPlaces;
  const blocks = packageFolders(root).map((block) => {
    let places = placesIn(block.folder);
    if (places === undefined) {
      shippedPlaces ??= new Map(shippedBlocks(directory).map((one) => [one.id, one.places]));
      places = shippedPlaces.get(block.id);
    }
    return { ...block, pack: packOf(block.id, places) };
  });
  const scopes = new Set([OWN_SCOPE, ...blocks.map(({ pack }) => pack)]);
  try {
    for (const name of fs.readdirSync(components)) if (PACK_ID.test(name) && fs.existsSync(path.join(components, name, PACK_FILE))) scopes.add(name);
  } catch {}
  const switches = (settings ?? componentSettings(root)).packs ?? {};
  let ownBlocks;
  const listed = [...scopes].map((id) => {
    const folder = path.join(components, id);
    let manifest = null;
    let problem = null;
    if (fs.existsSync(path.join(folder, PACK_FILE))) {
      try {
        manifest = readPackManifest(fs.readFileSync(path.join(folder, PACK_FILE), "utf8"));
        if (manifest.id !== id) {
          problem = said("pack.json 的 id 是 {0}，它的文件夹却是 components/{1}", manifest.id, id);
          manifest = null;
        }
      } catch (error) {
        problem = error;
      }
    }
    const was = isTable(installed[id]) ? installed[id] : null;
    const ids = blocks.filter((block) => block.pack === id);
    const changed = was ? ids.filter((block) => isTable(record[block.id]) && fingerprintOf(block.folder) !== record[block.id].fingerprint).map((block) => block.id) : [];
    if (was && ownFingerprint(folder) !== was.fingerprint) changed.push(`${id}/${PACK_FILE}`);
    const official = shippedIds.includes(id);
    // One of Gallery's own: what Gallery's pack.json says of it, where the workspace's has none (its blocks
    // put there one by one, gallery block add's, before a start installed the pack).
    let shipped = null;
    if (official) {
      try {
        shipped = readPackManifest(fs.readFileSync(path.join(directory, id, PACK_FILE), "utf8"));
      } catch {}
    }
    // Gallery's newer version, not put over a change: a changed block of it whose version Gallery's comes after, or a changed pack.json.
    const versionAt = (block) => {
      try {
        return JSON.parse(fs.readFileSync(path.join(components, ...block.split("/"), PACKAGE_MANIFEST), "utf8")).version ?? null;
      } catch {
        return null;
      }
    };
    const behind = official && shipped && changed.some((block) => {
      if (block.endsWith(`/${PACK_FILE}`)) return versionAfter(shipped.version, manifest?.version ?? null);
      ownBlocks ??= new Map(shippedBlocks(directory).map((one) => [one.id, one]));
      const own = ownBlocks.get(block);
      return own && versionAfter(own.version, versionAt(block));
    });
    const newer = behind ? shipped.version : null;
    const told = id === OWN_SCOPE ? DEFAULT_PACK : manifest ?? (problem ? null : shipped);
    return {
      id,
      name: told?.name ?? { zh: id, en: id },
      description: told?.description ?? null,
      version: manifest?.version ?? null,
      author: told?.author ?? null,
      homepage: told?.homepage ?? null,
      icon: told?.icon ?? null,
      kind: id === OWN_SCOPE ? "default" : official ? "official" : was ? "installed" : "own",
      problem: problem ? both(problem) : null,
      blocks: ids.length,
      enabled: switches[id] !== false,
      changed,
      newer,
    };
  });
  const rank = ({ id, kind }) => (kind === "default" ? -1 : kind === "official" ? shippedIds.indexOf(id) : kind === "installed" ? 1000 : 2000);
  return listed.sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1));
}

// What installOfficialPacks tells the log of one pack, a line each.
function installedLines(root, made, first) {
  const lines = [];
  const where = path.resolve(root);
  if (first) lines.push(`Gallery's pack ${made.id} ${made.version} installed in ${where} (${made.added.length + made.same.length + made.updated.length} blocks)${OFF_AT_FIRST.includes(made.id) ? ", switched off: 设置 › 组件列表 turns it on" : ""}`);
  else {
    if (made.added.length) lines.push(`Gallery's pack ${made.id} in ${where} has new blocks: ${made.added.join(", ")}`);
    if (made.updated.length) lines.push(`Gallery's pack ${made.id} in ${where}, its blocks as they were installed, updated to this Gallery's: ${made.updated.join(", ")}`);
    if (made.removed.length) lines.push(`Gallery's pack ${made.id} in ${where}: ${made.removed.join(", ")} no longer in it, taken out`);
  }
  return lines;
}

/**
 * Gallery's own packs (in `directory`, the package's) installed into the workspace at `root`, as
 * installPack installs any, whenever its server starts and by gallery init: one not installed yet is
 * (one of OFF_AT_FIRST switched off first in gallery.json, where it says nothing of it: a gallery.json that
 * cannot be written leaves that pack for the next start), one installed is brought up to Gallery's.
 * `env`: whose NO_PACKS is read; `log`: told what was done, a line each. Never rejects: { did: "off"
 * (NO_PACKS), "unread" (gallery.json does not read as Gallery's) or "done", packs: [installPack's answer
 * with `first`, or { id, failed }] }. The blocks it leaves as Gallery ships them (added, updated or the
 * same) are followShipped's looked at (followedAlready): nothing for it to do of them in this process.
 */
export async function installOfficialPacks(root, { directory = packsDirectory, env = process.env, log = () => {} } = {}) {
  if (packsSkipped(env)) return { did: "off", packs: [] };
  let marker = { ours: false };
  try {
    marker = markerOf(fs.readFileSync(layoutOf(root).marker, "utf8"));
  } catch {}
  if (!marker.ours) return { did: "unread", packs: [] };
  const ids = shippedPackIds(directory);
  const shipped = shippedBlocks(directory);
  const packs = [];
  for (const id of ids) {
    try {
      const first = !isTable(recordOf(root).packs?.[id]);
      if (first && OFF_AT_FIRST.includes(id) && componentSettings(root).packs[id] === undefined) await writeComponentSettings(root, { pack: id, enabled: false });
      const made = installPack(root, folderFiles(path.join(directory, id)), { official: true, shippedIds: ids });
      packs.push({ ...made, first });
      const current = new Set([...made.added, ...made.updated, ...made.same]);
      followedAlready(root, shipped.filter((block) => current.has(block.id)));
      for (const line of installedLines(root, made, first)) log(line);
    } catch (error) {
      log(`Gallery's pack ${id} could not be installed in ${path.resolve(root)}: ${error?.message ?? error}`);
      packs.push({ id, failed: error?.message ?? String(error) });
    }
  }
  return { did: "done", packs };
}
