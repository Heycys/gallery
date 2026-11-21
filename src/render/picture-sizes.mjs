import fs from "node:fs";
import path from "node:path";
import { referencedFiles } from "./asset-references.mjs";
import { pictureTask } from "../shared/export-pictures.mjs";
import { attr, walk } from "../shared/html-tree.mjs";
import { extensionOf, imageFile, mediaTypeOf } from "../shared/media.mjs";
import { parseReport } from "./report-tree.mjs";

// Pictures of a report's folder that make its export heavy: an export embeds a picture as a data: URL
// (a third bigger than the file). The picture of an <img> it makes a copy of as light as the page needs
// (src/shared/export-pictures.mjs: a PNG, a WebP, or a JPEG wider than twice the reading column) weighs
// what the page needs; one it embeds as it is (an SVG, a GIF, an animation, a JPEG no wider than that, a
// picture a CSS background or a srcset names) as much as its file, so a 3 MB JPEG 1400px wide makes the one
// file a reader opens 4 MB heavier. gallery check and gallery export say each such picture as a note
// (largePictureNotes), never a failure: its size, its pixels, what the export holds of it, and about what
// a copy of it would weigh when that is a quarter lighter at least.

const MB = 1024 * 1024;
/** A picture over this many bytes, or longer than LONG_SIDE px on its long side, gets a note. */
export const PICTURE_BYTES = MB;
export const LONG_SIDE = 2400;
// The long side of the copy a note weighs, and the bytes a pixel of a JPEG of quality about 82 takes
// (about two bits: a photograph's, which is what a picture this large mostly is).
const COPY_SIDE = 2000;
const JPEG_BYTES_PER_PIXEL = 0.25;
// The formats that keep every pixel (a copy of one is as many bytes a pixel as it is); the others lose
// some, but a WebP may be either (losslessWebp).
const LOSSLESS = new Set(["png", "gif"]);
// The most a copy may weigh, of the picture's bytes, for a note to say it: a quarter lighter at least.
const LIGHTER = 0.75;

// Whether a WebP keeps every pixel: its image is VP8L, the chunk alone or after VP8X and the chunks
// that follow it (a color profile, metadata, an alpha channel's), each its four letters, its length
// and its bytes, padded to an even length. An animation's frames (ANMF) are taken to lose some.
function losslessWebp(bytes) {
  if (bytes.length < 16 || bytes.toString("latin1", 0, 4) !== "RIFF" || bytes.toString("latin1", 8, 12) !== "WEBP") return false;
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const chunk = bytes.toString("latin1", offset, offset + 4);
    if (chunk === "VP8L") return true;
    if (chunk === "VP8 " || chunk === "ANMF") return false;
    const length = bytes.readUInt32LE(offset + 4);
    offset += 8 + length + (length % 2);
  }
  return false;
}

/**
 * A picture's size in pixels, { width, height }, read from its first bytes: a PNG's, a GIF's, a
 * JPEG's (its frame's header), a WebP's (lossy, lossless or extended) or an AVIF's (its largest
 * image's); null for any other (an SVG, an icon file) or one it cannot read.
 */
export function pictureSize(bytes) {
  const at = (offset, length) => offset + length <= bytes.length;
  if (at(0, 24) && bytes.readUInt32BE(0) === 0x89504e47 && bytes.toString("latin1", 12, 16) === "IHDR") return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (at(0, 10) && /^GIF8[79]a$/.test(bytes.toString("latin1", 0, 6))) return { width: bytes.readUInt16LE(6), height: bytes.readUInt16LE(8) };
  if (at(0, 4) && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // A JPEG's segments, each FF, its marker and its length, up to its frame's header (SOF0–SOF15 but DHT, JPG, DAC).
    for (let offset = 2; at(offset, 4);) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      if (marker === 0xff) { offset += 1; continue; }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return at(offset, 9) ? { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) } : null;
      if (marker === 0xd9 || marker === 0xda) return null;
      offset += 2 + bytes.readUInt16BE(offset + 2);
    }
    return null;
  }
  if (at(0, 30) && bytes.toString("latin1", 0, 4) === "RIFF" && bytes.toString("latin1", 8, 12) === "WEBP") {
    const chunk = bytes.toString("latin1", 12, 16);
    if (chunk === "VP8 ") return { width: bytes.readUInt16LE(26) & 0x3fff, height: bytes.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = bytes.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { width: bytes.readUIntLE(24, 3) + 1, height: bytes.readUIntLE(27, 3) + 1 };
    return null;
  }
  // An AVIF's brands, in its "ftyp" box (its major brand may be mif1, avif among the others).
  if (at(0, 12) && bytes.toString("latin1", 4, 8) === "ftyp" && /avi[fs]/.test(bytes.toString("latin1", 8, Math.min(bytes.length, bytes.readUInt32BE(0))))) {
    // Each image's extent ("ispe": its box's version and flags, then its width and height); the largest is the picture.
    let best = null;
    for (let offset = bytes.indexOf("ispe", 0, "latin1"); offset >= 0 && at(offset, 16); offset = bytes.indexOf("ispe", offset + 4, "latin1")) {
      const size = { width: bytes.readUInt32BE(offset + 8), height: bytes.readUInt32BE(offset + 12) };
      if (!best || size.width * size.height > best.width * best.height) best = size;
    }
    return best;
  }
  return null;
}

// The most of a picture read for its size in pixels: a JPEG's frame header follows its metadata
// (EXIF, a color profile), which this holds whole but for a rare picture, whose pixels go unsaid.
const HEAD_BYTES = MB;

// A file's length and its first HEAD_BYTES bytes, or null when it is not there.
function headOf(file) {
  let handle;
  try {
    handle = fs.openSync(file, "r");
    const { size } = fs.fstatSync(handle);
    const head = Buffer.alloc(Math.min(size, HEAD_BYTES));
    fs.readSync(handle, head, 0, head.length, 0);
    return { length: size, head };
  } catch {
    return null;
  } finally {
    if (handle !== undefined) fs.closeSync(handle);
  }
}

// Bytes as a note says them: "3.4 MB", one decimal, never less than 0.1.
const megabytes = (bytes) => `${Math.max(0.1, bytes / MB).toFixed(1)} MB`;

// What a copy of the picture would weigh, as a note says it, or "" when no copy is a quarter lighter
// at least (LIGHTER): 2000px on its long side when it is longer than LONG_SIDE (a lossy one a JPEG of
// quality about 82, a lossless one as it is, with a JPEG's weight beside it when that is less than
// half, for a photograph), else, for a lossy picture, one written again as such a JPEG, and for a PNG
// a JPEG of it when that is less than half.
function copyWeight({ bytes, width, height, extension, lossless }) {
  const long = Math.max(width, height);
  const scale = Math.min(1, COPY_SIDE / long);
  const jpeg = Math.min(bytes, width * height * scale * scale * JPEG_BYTES_PER_PIXEL);
  if (long > LONG_SIDE) {
    if (!lossless) return jpeg <= bytes * LIGHTER ? ` — a ${COPY_SIDE}px copy would be about ${megabytes(jpeg)}` : "";
    const same = bytes * scale * scale;
    return ` — a ${COPY_SIDE}px copy would be about ${megabytes(same)}${extension === "png" && jpeg < same / 2 ? `, or ${megabytes(jpeg)} as a JPEG (for a photograph)` : ""}`;
  }
  if (!lossless && jpeg <= bytes * LIGHTER) return ` — written again as a JPEG of quality about 82, it would be about ${megabytes(jpeg)}`;
  if (extension === "png" && jpeg < bytes / 2) return ` — as a JPEG (for a photograph) it would be about ${megabytes(jpeg)}`;
  return "";
}

// "twice", "3 times".
const timesOf = (count) => (count === 2 ? "twice" : `${count} times`);

/**
 * The pictures of the report's folder its export embeds (referencedFiles' `embedded`) that are over
 * PICTURE_BYTES or longer than LONG_SIDE px on their long side: a note each, in the order of their
 * first line, "assets/photo.jpg (line 40): 3.4 MB, 7458×4972px; the export embeds it as it is, 4.5 MB
 * as a data: URL — a 2000px copy would be about 0.7 MB" (each time it is embedded counted). So too a
 * picture the report names by a name the preview serves none by (its `unserved`: in a folder of
 * assets/, a name of characters it does not take), which fails until it is copied in under one: it is
 * weighed as the export will embed it then, so that the copy is made the size the page needs at once.
 * And a picture the page shows more than once, whatever its size (an export holds a copy each time:
 * two image blocks of one picture are two data: URLs; an icon's, the page's, a bookmark's or a link's,
 * counts for none, as marking the same site or kind again is what it is for): "shown twice: the
 * export embeds it twice; show it once and refer back to it in words". Never a failure; no export
 * holds a picture once for all its places (each <img> its own data: URL).
 * A picture of an <img> (none a template holds) the export makes a copy of for a page of `ceiling`
 * (pictureCeiling: twice the reading column the document shows, Infinity at 全宽; pictureTask says which)
 * is not heavy, whatever its file weighs: only a picture it shows more than once is said of it. Where the
 * export makes no copy (`copies`: why, not true: no Chrome or Edge on this machine, --original-images), such a
 * picture is weighed as before, its note saying why after what it holds.
 */
export function largePictureNotes({ html, directory, tree = parseReport(html), ceiling = 1424, copies = true }) {
  const { embedded, unserved } = referencedFiles({ html, directory, tree });
  const pictured = new Set(); // the files an <img> of the page shows
  walk(tree, (node) => {
    if (node.tagName === "img" && attr(node, "src")) pictured.add(attr(node, "src"));
  }, { inTemplates: false });
  // file -> { at: the lines of the references to it, shows: how many of them show it (not an icon's:
  // a link's icon is the same picture beside each link to its site, on purpose), served: whether the
  // export embeds it }
  const lines = new Map();
  const add = (file, line, served, icon = false) => {
    const entry = lines.get(file) ?? lines.set(file, { at: [], shows: 0, served }).get(file);
    entry.at.push(line);
    if (!icon) entry.shows += 1;
  };
  for (const { file, line, icon } of embedded) if (imageFile(file)) add(file, line, true, icon);
  for (const { file, line } of unserved) if (mediaTypeOf(file).startsWith("image/")) add(file, line, false);
  const notes = [];
  for (const [file, { at, shows, served }] of [...lines].sort(([, a], [, b]) => Math.min(...a.at) - Math.min(...b.at))) {
    const read = headOf(path.join(directory, file));
    if (!read) continue; // a failure of its own (not there)
    const { length, head } = read;
    const size = pictureSize(head);
    const long = size ? Math.max(size.width, size.height) : 0;
    const copyable = pictured.has(file) && pictureTask(head, ceiling, length) !== null;
    const copied = copyable && copies === true;
    const heavy = !copied && (length > PICTURE_BYTES || long > LONG_SIDE);
    const repeated = served && shows > 1;
    if (!heavy && !repeated) continue;
    const places = [...new Set(at)];
    const where = `line${places.length === 1 ? "" : "s"} ${places.length > 1 ? `${places.slice(0, -1).join(", ")} and ${places.at(-1)}` : places[0]}`;
    const shown = repeated ? `shown ${timesOf(shows)}: the export embeds it ${timesOf(shows)}; show it once and refer back to it in words` : "";
    if (!heavy) {
      notes.push(`${file} (${where}): ${shown}${copied ? "" : ` (${megabytes(Math.ceil(length / 3) * 4 * shows)} as data: URLs)`}`);
      continue;
    }
    const times = at.length === 1 || !served ? "" : `, ${timesOf(at.length)}`;
    const urls = served ? at.length : 1;
    const weight = `${megabytes(Math.ceil(length / 3) * 4 * urls)} as ${urls === 1 ? "a data: URL" : "data: URLs"}`;
    const pixels = size ? `, ${size.width}×${size.height}px` : "";
    const extension = extensionOf(file);
    const copy = size ? copyWeight({ bytes: length, ...size, extension, lossless: LOSSLESS.has(extension) || losslessWebp(head) }) : "";
    const why = copyable && served && typeof copies === "string" ? `; ${copies}` : "";
    const held = served ? `the export embeds it as it is${times}, ${weight}${copy}${why}` :`its name keeps it out of the preview and the export (the failure at its line says why); copied into assets/ under a name they take, the export embeds it as it is, ${weight}${copy}: copy it in at the size the page needs`;
    notes.push(`${file} (${where}): ${megabytes(length)}${pixels}; ${held}${shown ? `; ${shown}` : ""}`);
  }
  return notes;
}
