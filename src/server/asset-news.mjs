import fs from "node:fs/promises";
import { stampOfStat } from "../render/media-ref.mjs";

// Telling a document's open pages of a file of its folder written again (docs/render.md, "Live preview"):
// a picture, a file block's file, an embed's page, copied over assets/<file> under the name the page
// already shows it by. A page names each such file by its stamp (render/media-ref.mjs servedUrl), and a
// browser never fetches an address its page has used again, so a page open was told nothing and showed the
// old picture until it was loaded anew (an Agent's write of doc.html along with it is taken in where the
// page stands: page/pull/, which loads nothing). Each file is told once it is whole and has stopped
// changing: an Agent's tool may write it in pieces, and a page shown half a picture would draw it broken.
// So a file waits QUIET after its last change, then is looked at: a picture whose own format says it ends
// later (wholePicture: a PNG's IEND, a JPEG's end of image, a GIF's trailer, a WebP's RIFF size, an SVG's
// </svg>) waits for its next change, or, if none comes, for PATIENCE, and is then told as it is: a file its
// format check misjudges (a phone's motion photo, a JPEG with a video after its end of image) shows as a
// reload would show it, and the page swaps in no picture its browser cannot load and decode (assets-live.mjs),
// so one really left cut short keeps the picture it shows until it is written whole. One is told by its
// stamp, unless that stamp was told last. A file taken away is told nothing (what the page shows stays, as
// what its next load shows is the checks'), and what was told of it is forgotten. The page swaps the address
// in place once the new bytes are there (editor/page/assets-live.mjs), so it never shows a picture broken
// while it loads. What was told of each document's files is kept while the server runs (`told(key)`): a page
// that connects is told it (routes.mjs "asset now"), as it may have been served, or hidden, before the news.

export const QUIET = 250;
export const PATIENCE = 10000;

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const PNG_END = Buffer.from([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]); // IEND and its CRC
const JPEG = Buffer.from([0xff, 0xd8, 0xff]);
const JPEG_END = Buffer.from([0xff, 0xd9]);
const TAIL = 1024;

/**
 * Whether the picture of `head` (its first bytes) and `tail` (its last TAIL, or all of a smaller one) of
 * `size` bytes, named `name`, is whole by its own format: a PNG, a JPEG, a GIF, a WebP by its bytes,
 * whatever its name says, an SVG by its name; any other file is (no format of its says). An empty file
 * never is.
 */
export function wholePicture(head, tail, size, name = "") {
  if (size === 0) return false;
  if (head.subarray(0, 4).equals(PNG)) return tail.includes(PNG_END);
  // FF D9 stands nowhere in a JPEG's coded data (an FF there is followed by 00 or a restart marker).
  if (head.subarray(0, 3).equals(JPEG)) return tail.includes(JPEG_END);
  if (head.subarray(0, 4).toString("latin1") === "GIF8") return tail[tail.length - 1] === 0x3b;
  if (head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP") return head.length >= 8 && head.readUInt32LE(4) + 8 <= size;
  if (/\.svgz?$/i.test(name)) return /<\/svg\s*>/i.test(tail.toString("utf8"));
  return true;
}

/** The file at `at` as it is now: { stamp, whole }, or null when there is none (wholePicture). */
export async function lookAt(at) {
  let handle;
  try {
    handle = await fs.open(at, "r");
    const stat = await handle.stat();
    if (!stat.isFile()) return null;
    const head = Buffer.alloc(Math.min(16, stat.size));
    const tail = Buffer.alloc(Math.min(TAIL, stat.size));
    await handle.read(head, 0, head.length, 0);
    await handle.read(tail, 0, tail.length, stat.size - tail.length);
    return { stamp: stampOfStat(stat), whole: wholePicture(head, tail, stat.size, at) };
  } catch {
    return null;
  } finally {
    await handle?.close().catch(() => {});
  }
}

/**
 * news(key, at, file): the file `file` (assets/<name>) at `at` of what `key` names (a document's slug, or
 * "@<slug>" a custom page's) changed, was made or was taken away; `tell(key, file, stamp)` tells its pages,
 * once it is whole and quiet (or quiet for `patience`). `quiet`, `patience` as QUIET and PATIENCE; `look(at)`
 * as lookAt (a test's own). news.told(key): { file: stamp } of what was told of `key`'s files that are still
 * there. close() drops what waits.
 */
export function createAssetNews({ tell, quiet = QUIET, patience = PATIENCE, look = lookAt }) {
  const waiting = new Map(); // `${key} ${file}` -> { timer, since }
  const told = new Map(); // key -> Map(file -> the stamp told last)
  const news = (key, at, file) => {
    const name = `${key} ${file}`;
    const known = waiting.get(name);
    clearTimeout(known?.timer);
    const entry = { since: Date.now(), timer: null };
    const wait = () => {
      entry.timer = setTimeout(async () => {
        const now = await look(at);
        if (waiting.get(name) !== entry) return; // a newer change came meanwhile: its look says
        if (now && !now.whole && Date.now() - entry.since < patience) return wait();
        waiting.delete(name);
        const of = told.get(key);
        if (!now) {
          of?.delete(file);
          if (of?.size === 0) told.delete(key);
          return;
        }
        if (of?.get(file) === now.stamp) return;
        told.set(key, (of ?? new Map()).set(file, now.stamp));
        tell(key, file, now.stamp);
      }, quiet);
    };
    waiting.set(name, entry);
    wait();
  };
  news.told = (key) => Object.fromEntries(told.get(key) ?? []);
  news.close = () => {
    for (const { timer } of waiting.values()) clearTimeout(timer);
    waiting.clear();
  };
  return news;
}
