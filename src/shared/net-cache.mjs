import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { writeAtomic } from "./files.mjs";
import { layoutOf } from "./workspace.mjs";

// What the server's net route kept of the web (src/server/net-route.mjs; docs/render.md, "A block
// online"): each answer by the address a block asked for (its href, `{key}` as the block wrote it, never
// the key: ./net-policy.mjs), in memory and in the workspace's .gallery/cache/net/, a file each
// (<hash>.json: { url, at, type, text }), the last FILES of them. Which document's instances asked for
// which address, and as what, is kept beside them (documents/<slug>.json: { <url>: { at, as } }), the
// last PER_DOCUMENT of each: what an export of that document embeds (netSnapshot), so that
// the file shows what the reader saw last. Anything here may be thrown away: the next ask fetches again.
// Gallery's own, never served by a route, never in a file of the user's.

/** How many answers stay on disk. */
export const FILES = 200;
/** How many addresses a document's index keeps. */
export const PER_DOCUMENT = 20;
/** What an export's snapshot holds of the net at most: addresses, and the bytes of their answers. */
export const SNAPSHOT = { count: 20, bytes: 512 * 1024 };

const folderOf = (root) => layoutOf(root).netCache;
const fileOf = (root, url) => path.join(folderOf(root), `${createHash("sha256").update(url).digest("hex").slice(0, 24)}.json`);
const indexOf = (root, slug) => path.join(folderOf(root), "documents", `${slug}.json`);
const readJson = (file) => {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
};
const isEntry = (entry, url) => entry && entry.url === url && typeof entry.at === "string" && typeof entry.text === "string" && typeof entry.type === "string";

/** An answer as a block asked for it (`as`: "json" or "text"): its JSON read, or its text; undefined for JSON that does not read. */
export function dataOf(entry, as) {
  if (as === "text") return entry.text;
  try {
    return JSON.parse(entry.text);
  } catch {
    return undefined;
  }
}

/**
 * The cache of workspace `root`: get(url) (the entry kept, from memory or disk, or null), put(url,
 * { type, text, at }) (kept in both; the oldest files beyond FILES go), used(url, slug, as) (a document's
 * instance asked for it: its index says so). Writes go on after the call returns; `settled()` waits for them.
 */
export function createNetCache(root, { memory = 100 } = {}) {
  const held = new Map(); // url -> entry, the most recent last
  let writes = Promise.resolve();
  const later = (task) => {
    writes = writes.then(task).catch(() => {});
    return writes;
  };
  const hold = (url, entry) => {
    held.delete(url);
    held.set(url, entry);
    while (held.size > memory) held.delete(held.keys().next().value);
  };
  const prune = () => {
    const folder = folderOf(root);
    let names = [];
    try {
      names = fs.readdirSync(folder).filter((name) => name.endsWith(".json"));
    } catch {
      return;
    }
    if (names.length <= FILES) return;
    const dated = names.map((name) => ({ name, at: fs.statSync(path.join(folder, name), { throwIfNoEntry: false })?.mtimeMs ?? 0 })).sort((a, b) => a.at - b.at);
    for (const { name } of dated.slice(0, dated.length - FILES)) fs.rmSync(path.join(folder, name), { force: true });
  };
  return {
    get(url) {
      if (held.has(url)) return held.get(url);
      const entry = readJson(fileOf(root, url));
      if (!isEntry(entry, url)) return null;
      hold(url, entry);
      return entry;
    },
    put(url, { type, text, at }) {
      const entry = { url, at, type, text };
      hold(url, entry);
      later(async () => {
        await fs.promises.mkdir(folderOf(root), { recursive: true });
        await writeAtomic(fileOf(root, url), `${JSON.stringify(entry)}\n`);
        prune();
      });
      return entry;
    },
    used(url, slug, as) {
      if (typeof slug !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return;
      later(async () => {
        const file = indexOf(root, slug);
        const index = readJson(file) ?? {};
        delete index[url];
        index[url] = { at: new Date().toISOString(), as };
        const kept = Object.entries(index).slice(-PER_DOCUMENT);
        await fs.promises.mkdir(path.dirname(file), { recursive: true });
        await writeAtomic(file, `${JSON.stringify(Object.fromEntries(kept))}\n`);
      });
    },
    settled: () => writes,
  };
}

/**
 * What an export of document `slug` of workspace `root` embeds of the net (its snapshot's `net`): { <url>:
 * { data, at } } of the answers its instances asked for last, the most recent first, at most
 * SNAPSHOT.count of them and SNAPSHOT.bytes of their text, `data` as each was asked for; only those on a
 * host `allowed(url)` says (an address of a block the document holds, on a host of its needs); null
 * where it has none.
 */
export function netSnapshot(root, slug, allowed = () => true) {
  const index = readJson(indexOf(root, slug));
  if (!index || typeof index !== "object") return null;
  const snapshot = {};
  let bytes = 0;
  let count = 0;
  for (const [url, use] of Object.entries(index).reverse()) {
    if (count >= SNAPSHOT.count) break;
    const entry = readJson(fileOf(root, url));
    if (!isEntry(entry, url) || !allowed(url)) continue;
    const data = dataOf(entry, use?.as === "text" ? "text" : "json");
    if (data === undefined) continue;
    bytes += Buffer.byteLength(entry.text);
    if (bytes > SNAPSHOT.bytes) break;
    snapshot[url] = { data, at: entry.at };
    count += 1;
  }
  return count > 0 ? snapshot : null;
}
