import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { writeAtomic } from "./files.mjs";
import { userDirectory } from "./user-directory.mjs";
import { defaultWorkspace, layoutOf, markerOf } from "./workspace.mjs";

// The registry of the workspaces used on this machine (since 2026-11-08): one file in the user's data
// folder (../shared/user-directory.mjs "data": %LOCALAPPDATA%\gallery
// on Windows, ~/Library/Application Support/gallery on macOS, $XDG_STATE_HOME/gallery or
// ~/.local/state/gallery elsewhere; GALLERY_DATA_DIR in its place, which the tests set), so that a
// workspace an Agent made in a project's folder is found from any other (gallery workspaces, gallery
// list --all, and the sidebar's columns of other workspaces):
//   { "version": 1, "workspaces": [{ "root": "<absolute path>", "seen": "<ISO time>" }] }
// A workspace is registered once a gallery command has found it (src/cli/gallery.mjs: every command
// but stop and skill; init and workspaces --name once they made it) and when its server starts
// (src/server/routes.mjs listening), `seen` written again an hour later at the soonest. Only folders
// with Gallery’s own gallery.json are registered; tests isolate their data and default home. A path is one entry however it is spelt (upper and lower case alike on Windows). A
// change is made under the registry's lock (workspaces.json.lock), on the file as it is then, and
// written whole to a file beside it renamed over it, so that two commands registering at once each
// keep the other's (updateRegistry). A workspace whose folder
// is gone stays registered (an external drive comes back) until gallery workspaces --forget forgets it.
// Each workspace has a short id that never changes while its path does not: ws- and six hex digits of
// the hash of its path (workspaceId), for the sidebar's places and addresses.

export const REGISTRY_FILE = "workspaces.json";
/** How long a registration's `seen` is believed before a command writes it again. */
export const SEEN_EVERY = 60 * 60 * 1000;

/** The registry's file: <data folder>/workspaces.json. Only a path. */
export const registryFile = (options = {}) => path.join(userDirectory("data", options), REGISTRY_FILE);

/** A workspace's path as one key, however it is spelt: absolute, and lower case on Windows. */
export const workspaceKey = (root, platform = process.platform) => (platform === "win32" ? path.resolve(root).toLowerCase() : path.resolve(root));
const allowed = root => !process.env.GALLERY_SANDBOX || workspaceKey(root) === workspaceKey(defaultWorkspace());

/** The workspace's short id: ws- and the first six hex digits of the SHA-256 of its key. */
export const workspaceId = (root, platform = process.platform) => `ws-${createHash("sha256").update(workspaceKey(root, platform)).digest("hex").slice(0, 6)}`;

/** Whether `value` names a workspace's id (ws- and six hex digits). */
export const isWorkspaceId = (value) => /^ws-[0-9a-f]{6}$/.test(String(value ?? ""));

/**
 * The registry as `text` (the file's) holds it: { version: 1, workspaces: [{ root, seen }] }, each
 * path absolute and once (the latest `seen` of two spellings kept), in the file's order; an entry that
 * is not one left out, a file that does not read an empty registry.
 */
export function registryOf(text, platform = process.platform) {
  let stored = null;
  try {
    stored = JSON.parse(String(text ?? "").replace(/^﻿/, ""));
  } catch {}
  const workspaces = [];
  const at = new Map();
  for (const entry of Array.isArray(stored?.workspaces) ? stored.workspaces : []) {
    if (typeof entry?.root !== "string" || !path.isAbsolute(entry.root)) continue;
    const seen = typeof entry.seen === "string" && Number.isFinite(Date.parse(entry.seen)) ? entry.seen : new Date(0).toISOString();
    const key = workspaceKey(entry.root, platform);
    if (!at.has(key)) {
      at.set(key, workspaces.length);
      workspaces.push({ root: path.resolve(entry.root), seen });
    } else if (Date.parse(seen) > Date.parse(workspaces[at.get(key)].seen)) workspaces[at.get(key)].seen = seen;
  }
  return { version: 1, workspaces };
}

/** The registry as read now (registryOf of its file; none there: an empty one). */
export function readRegistry({ file = registryFile() } = {}) {
  try {
    const registry = registryOf(readFileSync(file, "utf8"));
    if (process.env.GALLERY_SANDBOX) registry.workspaces = registry.workspaces.filter(({ root }) => allowed(root));
    return registry;
  } catch {
    return { version: 1, workspaces: [] };
  }
}

// The registry's lock (workspaces.json.lock beside it): a file one process alone can make ("wx"),
// removed after; one older than LOCK_STALE was left by a process that ended and is taken over, and so is
// one held past LOCK_WAIT (a writer holds it for a read and a rename: a command never waits long).
// EPERM is a lock being removed (Windows: a file whose removal is pending) and a folder that cannot be
// written as well (Windows' rights, the sandbox of macOS an Agent may run in, which allows writes in its
// project alone): where no lock is there, LOCK_REFUSED of them in a row are the folder's, thrown at once,
// so that a command in such a sandbox is not held LOCK_WAIT twice over by every registration.
const LOCK_STALE = 10_000;
const LOCK_WAIT = 3_000;
const LOCK_REFUSED = 3;
async function withLock(file, task) {
  const lock = `${file}.lock`;
  const mine = `${process.pid} ${Math.random().toString(16).slice(2)}`;
  await fs.mkdir(path.dirname(file), { recursive: true });
  for (let refused = 0, until = Date.now() + LOCK_WAIT; ;) {
    try {
      await fs.writeFile(lock, mine, { flag: "wx" });
      break;
    } catch (error) {
      if (error.code !== "EEXIST" && error.code !== "EPERM") throw error;
      // The lock's age; null where there is none (removed meanwhile, or never made: a folder refusing it).
      const age = await fs.stat(lock).then(({ mtimeMs }) => Date.now() - mtimeMs, (statError) => (statError.code === "ENOENT" ? null : 0));
      refused = error.code === "EPERM" && age === null ? refused + 1 : 0;
      if (refused >= LOCK_REFUSED) throw error; // a folder that cannot be written
      if (Date.now() > until + LOCK_WAIT) throw error; // neither made nor taken over
      if (age !== null && (age > LOCK_STALE || Date.now() > until)) await fs.rm(lock, { force: true }).catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 10 + Math.random() * 20));
    }
  }
  try {
    return await task();
  } finally {
    if ((await fs.readFile(lock, "utf8").catch(() => null)) === mine) await fs.rm(lock, { force: true }).catch(() => {});
  }
}

/**
 * Change the registry: `change(registry)` gives the registry to write, or null for nothing to write.
 * Under the registry's lock, so that two commands writing at once each make their change on what the
 * other wrote: read, changed and written whole (a file beside it, renamed over it), made again on what
 * the file holds when it changed between the read and the rename all the same (a lock taken over).
 * Resolves to the registry as it stands after.
 */
export async function updateRegistry(change, { file = registryFile() } = {}) {
  return withLock(file, async () => {
    for (let tries = 0; tries < 8; tries++) {
      const text = await fs.readFile(file, "utf8").catch((error) => (error.code === "ENOENT" ? null : Promise.reject(error)));
      const current = registryOf(text);
      const next = change(current);
      if (!next) return current;
      if (await writeAtomic(file, `${JSON.stringify({ version: 1, workspaces: next.workspaces }, null, 2)}\n`, { expect: text })) return next;
    }
    throw new Error(`${file} kept changing while it was written: try again.`);
  });
}

/** Whether the folder `root` is a workspace now: its gallery.json there, and Gallery's. */
export function isWorkspace(root) {
  try {
    return markerOf(readFileSync(layoutOf(root).marker, "utf8")).ours;
  } catch {
    return false;
  }
}

/**
 * Register the workspace at `root`: added with `seen` now, or its `seen` written again when it is
 * SEEN_EVERY old (`force`: whatever its age). Nothing is written for a folder that is no workspace
 * of Gallery’s. Resolves to "added", "seen", "fresh" (`seen` recent: nothing written), or "none".
 */
export async function registerWorkspace(root, { file = registryFile(), now = Date.now(), force = false } = {}) {
  const resolved = path.resolve(root);
  if (!allowed(resolved) || !isWorkspace(resolved)) return "none";
  const key = workspaceKey(resolved);
  const recent = (entry) => {
    const age = now - Date.parse(entry.seen);
    return !force && age >= 0 && age < SEEN_EVERY;
  };
  // Seen within the hour, as most commands find it: read alone, no lock taken.
  const known = readRegistry({ file }).workspaces.find((each) => workspaceKey(each.root) === key);
  if (known && recent(known)) return "fresh";
  let did = "fresh";
  await updateRegistry((registry) => {
    const seen = new Date(now).toISOString();
    const entry = registry.workspaces.find((each) => workspaceKey(each.root) === key);
    if (!entry) {
      did = "added";
      return { version: 1, workspaces: [...registry.workspaces, { root: resolved, seen }] };
    }
    if (recent(entry)) {
      did = "fresh";
      return null;
    }
    did = "seen";
    return { version: 1, workspaces: registry.workspaces.map((each) => (each === entry ? { root: each.root, seen } : each)) };
  }, { file });
  return did;
}

/** registerWorkspace for a command or a server, which never fails for it: a registry that cannot be read or written is passed over ("failed"). */
export const registerQuietly = (root, options) => registerWorkspace(root, options).catch(() => "failed");

/**
 * Forget the registered workspaces `target` names (a path, as the registry holds it in any spelling, or
 * a ws- id): nothing on disk but the registry changes. Resolves to the roots forgotten ([] for none).
 */
export async function forgetWorkspace(target, { file = registryFile(), cwd = process.cwd() } = {}) {
  const byId = isWorkspaceId(target);
  const key = byId ? null : workspaceKey(path.resolve(cwd, target));
  const named = (entry) => (byId ? workspaceId(entry.root) === target : workspaceKey(entry.root) === key);
  let forgotten = [];
  await updateRegistry((registry) => {
    forgotten = registry.workspaces.filter(named).map((entry) => entry.root);
    return forgotten.length ? { version: 1, workspaces: registry.workspaces.filter((entry) => !named(entry)) } : null;
  }, { file });
  return forgotten;
}

/**
 * The folders a scan passes over by name (upper and lower case alike), besides every dot folder: a
 * package's and a repository's own, and Windows' own on a drive, its recycle bin among them (a workspace
 * thrown away there is no workspace to find).
 */
export const SCAN_SKIPS = new Set(["node_modules", ".git", "$recycle.bin", "recycler", "system volume information"]);
/** How deep a scan looks below its folder, and how many folders it reads at most. */
export const SCAN_DEPTH = 6;
export const SCAN_LIMIT = 50_000;

/**
 * The workspaces in `folder` and below it, `depth` levels down at most (gallery workspaces --scan):
 * each folder whose gallery.json is Gallery's, sorted, none looked in further (a workspace holds
 * documents, not workspaces). Passed over: dot folders, those SCAN_SKIPS names (node_modules, the
 * recycle bin), links (they lead out of it) and folders that cannot be read. Resolves to { found:
 * [root], read: folders read, cut: whether it stopped at `limit` folders }.
 */
export async function scanForWorkspaces(folder, { depth = SCAN_DEPTH, limit = SCAN_LIMIT } = {}) {
  const found = [];
  let read = 0;
  let cut = false;
  let level = [path.resolve(folder)];
  for (let at = 0; at <= depth && level.length && !cut; at++) {
    const next = [];
    for (const directory of level) {
      if (read >= limit) {
        cut = true;
        break;
      }
      read++;
      if (isWorkspace(directory)) {
        found.push(directory);
        continue;
      }
      if (at === depth) continue;
      const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => []);
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith(".") || SCAN_SKIPS.has(entry.name.toLowerCase())) continue;
        next.push(path.join(directory, entry.name));
      }
    }
    level = next;
  }
  return { found: found.sort(), read, cut };
}
