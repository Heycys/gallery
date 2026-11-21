import fs from "node:fs";
import { writeAtomic } from "./files.mjs";
import { HOST } from "./net-policy.mjs";
import { layoutOf } from "./workspace.mjs";

// The workspace's keys for the sites its blocks reach (docs/render.md, "A block online"): .gallery/keys.json,
// { "<host>": "<key>" }, written by gallery block key, read by the server's net route as a block's
// address names one ({key}: ./net-policy.mjs), which it writes in there itself. A file of Gallery's own,
// apart from gallery.json: that one's settings are told to every page and read by Agents, and a
// workspace is handed on with it; a key is neither's. No route serves this file, no page holds a key,
// and the cache, a snapshot and an export know an address by what the block wrote ({key}), never by
// the key.

/** The keys of workspace `root`, by host ({} where there are none, or the file does not read). */
export function readKeys(root) {
  try {
    const keys = JSON.parse(fs.readFileSync(layoutOf(root).keys, "utf8"));
    if (!keys || typeof keys !== "object" || Array.isArray(keys)) return {};
    return Object.fromEntries(Object.entries(keys).filter(([host, key]) => HOST.test(host) && typeof key === "string" && key !== ""));
  } catch {
    return {};
  }
}

/** Workspace `root` with `host`'s key `key` (null takes it away); the other keys as they were. */
export async function writeKey(root, host, key) {
  const keys = readKeys(root);
  if (key === null) delete keys[host];
  else keys[host] = key;
  await fs.promises.mkdir(layoutOf(root).gallery, { recursive: true });
  await writeAtomic(layoutOf(root).keys, `${JSON.stringify(keys, null, 2)}\n`);
}
