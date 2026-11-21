import { escapeMarkup } from "../../../shared/escape.mjs";
import { HTML_MARK } from "./own/index.mjs";

// A picture copied (the user's of 2026-11-20: "图片的复制希望可以复制了也可以直接在外面粘贴，也是一个图片"):
// an image block copied alone (Ctrl+C or Ctrl+X with it the one block selected, 复制图片 in its block menu)
// puts its picture on the system clipboard as a PNG, as the browser's own 复制图片 does (a bitmap and HTML
// of the picture, which the user found pastes as a picture in other programs), so that WeChat, Word, Paint
// or a chat pastes a picture; a JPEG, a WebP, a GIF or an SVG is drawn into one first, on a canvas.
//
// Two writes, as the browser has them: the copy event's clipboardData takes strings alone (no picture), and
// navigator.clipboard.write, which takes a PNG, writes the whole clipboard anew, its own types left out (a
// type of the page's own, "web application/x-…", is no type a paste event's clipboardData reads). So the copy
// event writes what it always wrote (the page's own type, HTML and Markdown: clipboard/index.mjs write), and
// then a ClipboardItem of the PNG and HTML of the picture (its whole address, its words as alt) replaces it,
// the page's own data in that HTML (own/describe.mjs HTML_MARK), which a paste in Gallery reads as it reads
// its own type (ownData): the image as it was, its own file, never that PNG (the paste takes no picture
// files beside the page's own data). The PNG is made while the write waits on it (a promise in the item,
// written in the gesture); a copy made meanwhile wins: the PNG is refused and the write leaves the clipboard
// as that copy left it. A copy of this page is one of its events; one made anywhere else (the workbench
// around it, another document's frame, another program) takes the focus from this page first, which no
// event of this page's says: a write asked while the page had the focus goes only while it still has it.
// Where the browser refuses the write (no permission, no ClipboardItem, a picture too large to draw), the
// copy event's data stays: the copy as it was before.

/**
 * The image tools' part of the clipboard: write(img, payload, label, cause). `png(img)`: a promise of the PNG
 * of what `img` shows (drawn on a canvas; a test's own).
 */
export function createPictures({ png: pngFor = pngOf } = {}) {
  // The last copy or cut of the page (its event), or the copy a write was asked for by (复制图片): a write
  // goes only while it is still the last.
  let last = null;
  for (const type of ["copy", "cut"]) (globalThis.window ?? globalThis.document)?.addEventListener(type, (event) => { last = event; }, true);
  const focused = () => globalThis.document?.hasFocus?.() ?? true;

  /**
   * The picture `img` shows (an image block's, on the page) on the system clipboard as a PNG, with HTML of it
   * (`label` its alt) that carries `payload` (the clipboard's own data, as the copy event wrote it); `cause`:
   * the copy event it comes with (none: a copy of its own). Returns a promise of whether it went.
   */
  function write(img, payload, label, cause = {}) {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) return Promise.resolve(false);
    last = cause;
    const had = focused();
    const png = pngFor(img).then((blob) => {
      if (last !== cause) throw new Error("copied again");
      if (had && !focused()) throw new Error("copied elsewhere");
      return blob;
    });
    png.catch(() => {}); // refused, the write says so
    const html = `<img src="${escapeMarkup(img.src)}" alt="${escapeMarkup(label)}" ${HTML_MARK}="${escapeMarkup(payload)}">`;
    try {
      return navigator.clipboard.write([new ClipboardItem({ "image/png": png, "text/html": new Blob([html], { type: "text/html" }) })]).then(() => true, () => false);
    } catch {
      return Promise.resolve(false);
    }
  }

  return { write };
}

// The PNG of a picture as the page decoded it: drawn as large as its file is (an SVG with no size of its own
// as large as it shows on this screen, and no smaller), its pixels as they are.
async function pngOf(img) {
  await img.decode?.().catch(() => {});
  const shown = img.getBoundingClientRect();
  const ratio = globalThis.devicePixelRatio || 1;
  let width = img.naturalWidth;
  let height = img.naturalHeight;
  const vector = /\.svg(?:[?#]|$)/i.test(img.src);
  if (!width || !height || (vector && width < shown.width * ratio)) {
    width = Math.round(shown.width * ratio);
    height = Math.round(shown.height * ratio);
  }
  if (!width || !height) throw new Error("no picture");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(img, 0, 0, width, height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("no picture"))), "image/png"));
}
