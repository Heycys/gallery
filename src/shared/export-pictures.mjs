// The pictures an export embeds, made as light as the page needs (feedback of 2026-11-17): the
// copy in the file, never the workspace's own (the user's files stay as they are). The pictures of the page's <img>
// elements (none a template holds; a CSS background, a srcset or a script's data keep their pixels as they are):
//   - its width at most PICTURE_CEILING: twice the reading column the document shows (正文宽度: 648, 712 or 776px,
//     so 1296, 1424 or 1552 pixels): the page never shows a picture wider than its column, and twice that is what a
//     screen of two pixels to a point shows sharp; a document shown 全宽 by its look has no column, its pictures keep
//     their width (only their encoding changes). A reader who turns 全宽 on in the file, or opens a picture large
//     (放大, never past its own size), sees it at most that wide;
//   - a picture whose every pixel its format keeps (PNG, a lossless WebP: a screenshot, a diagram) written as a WebP
//     of quality PICTURE_QUALITY, its transparency kept; one already lossy (JPEG, a lossy WebP) only when it is wider
//     than the ceiling (written again at its own size it would lose more for little);
//   - never enlarged; an animation (an animated PNG or WebP, any GIF), an SVG, an AVIF or an icon file as it is; one of
//     PICTURE_MIN_BYTES or less as it is; and the copy kept only when it is a tenth lighter at least.
// Chosen by looking (2026-11-17, eight 2000px screenshots of the product and photographs side by side at the page's
// size and at their own): WebP 0.9 at 1424px kept the text of a screenshot as sharp as the PNG at the page's size, a
// third to a half of its bytes; 0.8 blurred colored code at its own size; the browser's lossless WebP and PNG were
// heavier than the PNGs they came from. What decides is here; the pixels are a browser's (encodePicture: a canvas),
// the reader's own for 导出当前视图副本 (kit/ui.js), the user's Chrome or Edge for the command's and the workbench's
// export (src/transfer/browser.mjs encodePictures; render/export-pictures.mjs finds them in the file).
import { LOOK_ATTRIBUTES } from "./components/page.mjs";

/** The quality of the WebP a copy is written as. */
export const PICTURE_QUALITY = 0.9;
/** A picture of this many bytes or fewer is left as it is (an icon, a small drawing: a copy would save little). */
export const PICTURE_MIN_BYTES = 16 * 1024;
/** A copy is kept when it weighs this share of the picture or less (else the picture as it is). */
export const PICTURE_LIGHTER = 0.9;
// The reading column's widths (shared/document-look.mjs WIDTH, by its attribute's value).
const COLUMNS = { narrow: 648, wide: 776 };
const COLUMN = 712;

/**
 * The widest a copy may be for a page whose <html> has these attributes (`attribute(name)`: its value or null):
 * twice its reading column (data-doc-measure), or Infinity for one shown 全宽 (data-doc-width="full").
 */
export function pictureCeiling(attribute) {
  if (attribute(LOOK_ATTRIBUTES.full) === "full") return Infinity;
  return 2 * (COLUMNS[attribute(LOOK_ATTRIBUTES.width)] ?? COLUMN);
}

const text = (bytes, at, length) => String.fromCharCode(...bytes.subarray(at, at + length));
const u32be = (bytes, at) => ((bytes[at] << 24) >>> 0) + (bytes[at + 1] << 16) + (bytes[at + 2] << 8) + bytes[at + 3];
const u32le = (bytes, at) => bytes[at] + (bytes[at + 1] << 8) + (bytes[at + 2] << 16) + ((bytes[at + 3] << 24) >>> 0);

const u16be = (bytes, at) => (bytes[at] << 8) + bytes[at + 1];

// A JPEG's long side, from its frame's header (SOF0–SOF15 but DHT, JPG, DAC), its segments before it walked; null unread.
function jpegSide(bytes) {
  for (let at = 2; at + 9 <= bytes.length;) {
    if (bytes[at] !== 0xff) return null;
    const marker = bytes[at + 1];
    if (marker === 0xff) { at += 1; continue; }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue; }
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return Math.max(u16be(bytes, at + 5), u16be(bytes, at + 7));
    if (marker === 0xd9 || marker === 0xda) return null;
    at += 2 + u16be(bytes, at + 2);
  }
  return null;
}

/**
 * What a picture's bytes (a Uint8Array) are, read from its header: { format: "png" | "jpeg" | "webp" | "other",
 * lossless, animated, side }, `side` its long side in pixels (null where none is read): a JPEG turned by its EXIF
 * shows its height as its width, so a lossy one is measured again as the browser draws it (encodePicture).
 */
export function pictureFacts(bytes) {
  if (bytes.length >= 24 && u32be(bytes, 0) === 0x89504e47 && text(bytes, 12, 4) === "IHDR") {
    // An animated PNG says so (acTL) before its first image data (IDAT).
    let animated = false;
    for (let at = 8; at + 8 <= bytes.length;) {
      const chunk = text(bytes, at + 4, 4);
      if (chunk === "acTL") animated = true;
      if (chunk === "IDAT" || chunk === "IEND") break;
      at += 12 + u32be(bytes, at);
    }
    return { format: "png", lossless: true, animated, side: Math.max(u32be(bytes, 16), u32be(bytes, 20)) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) return { format: "jpeg", lossless: false, animated: false, side: jpegSide(bytes) };
  if (bytes.length >= 30 && text(bytes, 0, 4) === "RIFF" && text(bytes, 8, 4) === "WEBP") {
    let lossless = false;
    let animated = false;
    let side = null;
    for (let at = 12; at + 8 <= bytes.length;) {
      const chunk = text(bytes, at, 4);
      if (chunk === "VP8X") {
        if (bytes[at + 8] & 0x02) animated = true;
        side = Math.max(bytes[at + 12] + (bytes[at + 13] << 8) + (bytes[at + 14] << 16), bytes[at + 15] + (bytes[at + 16] << 8) + (bytes[at + 17] << 16)) + 1;
      }
      if (chunk === "ANIM" || chunk === "ANMF") animated = true;
      if (chunk === "VP8L") lossless = true;
      if (chunk === "VP8 " && side === null && at + 20 <= bytes.length) side = Math.max(u32le(bytes, at + 14) & 0x3fff, (bytes[at + 16] + (bytes[at + 17] << 8)) & 0x3fff);
      if (chunk === "VP8 " || chunk === "VP8L" || animated) break;
      const length = u32le(bytes, at + 4);
      at += 8 + length + (length % 2);
    }
    return { format: "webp", lossless, animated, side };
  }
  return { format: "other", lossless: false, animated: false, side: null };
}

/**
 * Whether an export tries a copy of a picture (its bytes) for a page of `ceiling` (pictureCeiling): a PNG or WebP
 * that is no animation, or a JPEG, over PICTURE_MIN_BYTES; a lossy one only where it may be wider than the ceiling,
 * its long side over it (encodePicture measures it as drawn, and leaves one that is not). { lossy } or null.
 * `length`: the picture's bytes when `bytes` are its first ones alone (its header: render/picture-sizes.mjs).
 */
export function pictureTask(bytes, ceiling, length = bytes.length) {
  if (length <= PICTURE_MIN_BYTES) return null;
  const facts = pictureFacts(bytes);
  if (facts.format === "other" || facts.animated) return null;
  if (!facts.lossless && !(facts.side === null || facts.side > ceiling)) return null;
  return { lossy: !facts.lossless };
}

/**
 * A copy of a picture (a Blob) as an export embeds it, in a browser: drawn on a canvas at most `ceiling` pixels wide
 * (its height in step), written as a WebP of `quality`; null where none is made (a lossy one no wider than the
 * ceiling; a browser that writes no WebP, Safari's; a copy that does not hold the whole picture). A WebP holds
 * 16383 pixels a side at most (its header's 14 bits), and Chrome's encoder, given a larger canvas, crops it and
 * says nothing (a full-page screenshot 1000×20000 lost its last 3617 rows): a picture longer than that is drawn
 * smaller still, both its sides within it and its shape kept; and a copy whose size, decoded, is not the size drawn
 * is none. Self-contained, as src/transfer/browser.mjs runs its text in a page: it names nothing but the browser's own.
 */
export async function encodePicture(blob, { ceiling, lossy, quality }) {
  const WEBP_SIDE = 16383;
  const bitmap = await createImageBitmap(blob);
  try {
    if (lossy && bitmap.width <= ceiling) return null;
    const scale = Math.min(1, ceiling / bitmap.width, WEBP_SIDE / bitmap.width, WEBP_SIDE / bitmap.height);
    const width = Math.min(WEBP_SIDE, Math.max(1, Math.round(bitmap.width * scale)));
    const height = Math.min(WEBP_SIDE, Math.max(1, Math.round(bitmap.height * scale)));
    const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(width, height) : Object.assign(document.createElement("canvas"), { width, height });
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, width, height);
    const made = canvas.convertToBlob ? await canvas.convertToBlob({ type: "image/webp", quality }) : await new Promise((done) => canvas.toBlob(done, "image/webp", quality));
    if (made?.type !== "image/webp") return null;
    const drawn = await createImageBitmap(made);
    const whole = drawn.width === width && drawn.height === height;
    drawn.close?.();
    return whole ? made : null;
  } finally {
    bitmap.close?.();
  }
}

/** Whether a copy of `made` bytes takes the place of a picture of `bytes`: a tenth lighter at least. */
export const lighter = (made, bytes) => made <= bytes * PICTURE_LIGHTER;
