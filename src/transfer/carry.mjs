import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { referencesWhere } from "../render/asset-references.mjs";
import { parseReport } from "../render/report-tree.mjs";
import { COPY_DATA, CARRIED, CARRIED_TYPE, CARRIED_VERSION } from "../shared/export-wrap.mjs";
import { walk } from "../shared/html-tree.mjs";
import { filesIn } from "../shared/shipped-blocks.mjs";
import { referencedFile } from "../shared/media.mjs";
import { userDirectory } from "../shared/user-directory.mjs";
import { documentLook } from "../shared/workspace-look.mjs";
import { documentDirectory, documentFiles } from "../shared/workspace.mjs";
import { fileKindOf } from "./own-report.mjs";

// What an offline file carries besides the page (src/shared/export-wrap.mjs COPY_DATA and CARRIED), written
// by every export a reader keeps (gallery export, the workbench's 导出 as HTML, 导出文档: render/pipeline.mjs
// offlineReports' and exportReports' `carry`), each a <script> of data on a line of its own before </body>,
// after everything else the export wrote (its pictures made lighter, the links between its pages), so that
// what it says is the file as written:
//   the document's words, as gallery read --format text and --format markdown write them (read-view.mjs
//   wholeReadings), for the display menu's 复制为完整文本 and 复制为 Markdown (kit/ui.js): worked out here,
//   where the reading of every kind of block (its definition's `read`, a custom block's too) and the whole
//   file (a Sheet's other tabs, a closed disclosure) are at hand, never again on the page, which holds
//   neither the editor's reading nor jsdom; plain JSON, a few per cent of a file (the Component Catalog's
//   45 KB of 1.97 MB), so that the page reads it with no decompression
//   the document as its author wrote it, for an import of the file (carriedOf below, import.mjs carriedPage) to
//   give back that document, not one worked back from the page: its doc.html's text as the export read it,
//   its doc.json's title, icon, description and type and the look it shows, and each file of its assets/ the
//   page names by its name and its bytes' sha256 (the bytes are the page's own data: URLs, never twice; a
//   picture the export made lighter by its copy's), all JSON deflated and in base64; the sha256 of the file
//   without this line, so that a file changed after it was made (an edit by hand, a program that put its
//   pictures on a platform) is imported as the page it now is (undoExport), never as a source that is no
//   longer it; and, as the value of its CARRIED attribute, the HMAC-SHA256 of that base64 text by this
//   computer's export key (exportKey), which tells an import on this computer that the file is one of its own
//   exports, the one kind of file whose scripts an import keeps (import.mjs; anything else is made inert:
//   own-report.mjs inertPage). A key nobody else has: a file anyone can write can say any sha256 of itself.
// What the export leaves out stays out: the 批注 (annotations.json is the author's and never in an export), the
// document's `source` and `created` (where its material came from, when it was made: its author's own), and
// the code of its custom blocks (an import never puts a block in: one the workspace lacks shows what it holds,
// read-only, as a block whose package is gone does).

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const escapeJson = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
const readJson = (file) => {
  try {
    return JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    return null;
  }
};
// The most what an export carries for its import may hold once inflated: twenty times the file, and 64 MB at
// most (a source is a part of the page its file shows, a few hundred kilobytes), the inflating stopped there,
// at once: what would grow past it is no export's (a small file made to fill the memory), and is read as the page.
const CARRIED_TIMES = 20;
const CARRIED_MOST = 64 * 1024 * 1024;
export const carriedCeiling = (length) => Math.min(length * CARRIED_TIMES, CARRIED_MOST);
// The most of a source it carries, in bytes: a document's doc.html is its words and markup (the Component Catalog's
// 0.2 MB), its pictures the page's own data: URLs, so that a source past 16 MB is none an export made (a file made
// to fill the memory as its source is converted), and the file is read as its page.
export const CARRIED_SOURCE_MOST = 16 * 1024 * 1024;

// This computer's export key: 32 random bytes in hex, in the user's data folder (userDirectory("data"): the
// machine's registry's, GALLERY_DATA_DIR first, which the tests point at folders of their own), made the first
// time an export or an import asks for it, written once (a second process that made one at the same moment
// keeps the first's), never sent anywhere. Null where the folder cannot be written or read (an Agent's
// sandbox): an export is then signed by none, and its import, here too, is another's.
const KEY_FILE = "export-key";
export function exportKey({ make = true } = {}) {
  const file = path.join(userDirectory("data"), KEY_FILE);
  const read = () => {
    try {
      const text = readFileSync(file, "utf8").trim();
      return /^[0-9a-f]{64}$/.test(text) ? Buffer.from(text, "hex") : null;
    } catch {
      return null;
    }
  };
  const kept = read();
  if (kept || !make) return kept;
  try {
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, `${randomBytes(32).toString("hex")}\n`, { flag: "wx", mode: 0o600 });
  } catch {} // made by another just now, or a folder that cannot be written
  return read();
}
const signatureOf = (text, key) => createHmac("sha256", key).update(text).digest("hex");

/** `html` with `line` (an element's text) on a line of its own right before </body> (its line's indent two spaces), else at its end. */
export function beforeBodyEnd(html, line) {
  let body = null;
  walk(parseReport(html), (node) => {
    if (!body && node.tagName === "body") body = node;
  }, { inTemplates: false });
  const at = body?.sourceCodeLocation?.endTag?.startOffset;
  if (at === undefined) return `${html}${html.endsWith("\n") ? "" : "\n"}${line}\n`;
  const lineStart = html.lastIndexOf("\n", at - 1) + 1;
  const breaking = html.includes("\r\n") ? "\r\n" : "\n";
  if (/^[ \t]*$/.test(html.slice(lineStart, at))) return `${html.slice(0, lineStart)}  ${line}${breaking}${html.slice(lineStart)}`;
  return `${html.slice(0, at)}${line}${html.slice(at)}`;
}

/** The element of the copies' words: { text, markdown } as JSON a script holds. */
export const copyElement = (words) => `<script type="application/json" ${COPY_DATA}>${escapeJson(words)}</script>`;

// A link's or a picture's words in Markdown, up to the "](" that ends them, on one line.
const LINK_WORDS = String.raw`((?:(?!\]\()[^\n])*?)`;
const FOLDER_FILE = String.raw`\((?:\.\/)?assets\/[^)\s]*\)`;
/**
 * The Markdown an offline file's 复制为 Markdown puts on the clipboard: gallery read's, but a picture or a
 * link to a file of the document's folder (assets/…), which the file's reader has not (its bytes are in
 * the page, as data: URLs), keeps its words alone (a picture its alt, and the size after it gone), so that
 * nothing copied names a file the reader cannot reach. Links elsewhere stay as they are.
 */
export const offlineMarkdown = (markdown) => markdown
  .replace(new RegExp(String.raw`!\[${LINK_WORDS}\]${FOLDER_FILE}(?:\{[^}\n]*\})?`, "g"), "$1")
  .replace(new RegExp(String.raw`\[${LINK_WORDS}\]${FOLDER_FILE}`, "g"), "$1");

/**
 * The element of what an import gives back: `carried` deflated, in base64, its CARRIED attribute the HMAC of that
 * text by `key` (this computer's export key, exportKey), empty for none.
 */
export function carriedElement(carried, key = null) {
  const text = deflateRawSync(Buffer.from(JSON.stringify(carried), "utf8"), { level: 9 }).toString("base64");
  return `<script type="${CARRIED_TYPE}" ${CARRIED}="${key ? signatureOf(text, key) : ""}">${text}</script>`;
}

// The sha256 of the bytes of each data: URL of an export's text (base64, as an export writes them).
const DATA_URLS = /data:[\w.+-]+\/[\w.+-]+(?:;[\w.+=-]+)*;base64,([A-Za-z0-9+/]*={0,2})/g;
const heldIn = (html) => new Set([...html.matchAll(DATA_URLS)].map((match) => sha256(Buffer.from(match[1], "base64"))));

// The files of the page's embed blocks (an iframe's assets/<file>): what an export of embeds written as links
// (render/embeds.mjs embedsAsLinks) holds no copy of, as the offline file does.
function framedFiles(source) {
  const framed = referencesWhere(source, (value) => referencedFile(value) !== null).filter((reference) => fileKindOf(reference) === "embed");
  return new Set(framed.map((reference) => referencedFile(reference.value).replace(/^assets\//, "")).flatMap((name) => {
    try {
      return [name, decodeURIComponent(name)];
    } catch {
      return [name];
    }
  }));
}

// The files of the document's assets/ its page names (assets/<file>, the names a page may give: letters,
// digits, dots, dashes and underscores, percent-encoded too), each { name, sha256 }, with `copy` where the
// export holds a lighter copy of it (smallerPictures' `copies`), and with `data` (its bytes in base64) where it
// is a file the offline file holds that this export does not (`left`: an embed's, embeds written as links).
// None carries what no export holds (a cropped picture's original, a srcset's smaller candidates) nor what an
// export was asked to leave out (文件和图片除外, --no-files: `files` false).
function filesNamed(source, folder, copies, { output, left = new Set() }) {
  const directory = path.join(folder, "assets");
  if (!existsSync(directory)) return [];
  const made = new Map(copies.map(({ from, to }) => [from, to]));
  const held = left.size ? heldIn(output) : null;
  const files = [];
  for (const name of filesIn(directory)) {
    const encoded = name.split("/").map(encodeURIComponent).join("/");
    if (!source.includes(`assets/${name}`) && !source.includes(`assets/${encoded}`)) continue;
    let bytes;
    try {
      bytes = readFileSync(path.join(directory, name));
    } catch {
      continue;
    }
    const hash = sha256(bytes);
    const data = left.has(name) && !held.has(hash) && !made.has(hash) ? { data: bytes.toString("base64") } : {};
    files.push({ name, sha256: hash, ...(made.has(hash) ? { copy: { sha256: made.get(hash), type: "image/webp" } } : {}), ...data });
  }
  return files;
}

/**
 * The offline file `output` of document `slug` (of workspace `directory`, made of the doc.html text
 * `source`) with what it carries written in: the copies' words, then what an import gives back (above),
 * signed by this computer's export key. `copies`: the pictures smallerPictures made lighter. `readings`:
 * what works out the words (read-view.mjs wholeReadings; the server's workbench runs it in its conversion
 * worker). `files` false: an export without its files (文件和图片除外); `embedsAsLinks`: one whose embeds are links.
 */
export async function carriedExport({ slug, source, output, copies = [], directory, readings = null, files: withFiles = true, embedsAsLinks = false }) {
  const folder = documentDirectory(slug, directory);
  const metadata = readJson(documentFiles(folder).json) ?? {};
  const read = readings ?? (await import("./read-view.mjs")).wholeReadings;
  const words = await read(source, { slug, root: directory, title: typeof metadata.title === "string" ? metadata.title : null });
  const shown = beforeBodyEnd(output, copyElement({ text: words.text, markdown: offlineMarkdown(words.markdown) }));
  const doc = {};
  const { title, icon, description, type } = metadata;
  for (const [key, value] of Object.entries({ title, icon, description, type })) if (typeof value === "string") doc[key] = value;
  doc.look = documentLook(slug, directory);
  const carried = { v: CARRIED_VERSION, file: sha256(shown), source, doc, files: filesNamed(source, folder, copies, { output, left: withFiles && embedsAsLinks ? framedFiles(source) : new Set() }) };
  return beforeBodyEnd(shown, carriedElement(carried, exportKey()));
}

/**
 * What an export (`html`, its text as written: the import reads it before any old name is made new) carries for
 * an import: { carried, intact, own } — `carried` the object (null: none, one that does not decode, one that would
 * inflate past carriedCeiling of the file, one whose source is past CARRIED_SOURCE_MOST, or one of a version this
 * Gallery does not read), `intact` whether the
 * file is the one it was made with (the sha256 of its text without that line is the one it says), `own` whether
 * its signature is this computer's export key's (one of its own exports: exportKey). Found by its start tag as
 * carriedElement writes it, the last in the file (its text base64, which holds no "<"), and taken out as the
 * export put it in (from its line's start through its line break, where it has the line to itself: beforeBodyEnd).
 */
export function carriedOf(html) {
  const none = { carried: null, intact: false, own: false };
  const opening = `<script type="${CARRIED_TYPE}" ${CARRIED}`;
  const start = html.lastIndexOf(opening);
  if (start < 0) return none;
  const tag = /^(?:="([0-9a-f]*)")?>/.exec(html.slice(start + opening.length, start + opening.length + 80));
  if (!tag) return none;
  const body = start + opening.length + tag[0].length;
  const close = html.indexOf("</script>", body);
  if (close < 0) return none;
  const end = close + "</script>".length;
  const text = html.slice(body, close).trim();
  let carried = null;
  try {
    carried = JSON.parse(inflateRawSync(Buffer.from(text, "base64"), { maxOutputLength: carriedCeiling(html.length) }).toString("utf8"));
  } catch {
    return none;
  }
  if (!carried || typeof carried !== "object" || carried.v !== CARRIED_VERSION || typeof carried.source !== "string" || Buffer.byteLength(carried.source) > CARRIED_SOURCE_MOST) return none;
  const lineStart = html.lastIndexOf("\n", start - 1) + 1;
  const breaking = /^\r?\n/.exec(html.slice(end))?.[0] ?? "";
  const alone = /^[ \t]*$/.test(html.slice(lineStart, start)) && breaking;
  const without = alone ? html.slice(0, lineStart) + html.slice(end + breaking.length) : html.slice(0, start) + html.slice(end);
  const key = tag[1] ? exportKey({ make: false }) : null;
  const signed = Buffer.from(tag[1] ?? "", "hex");
  const own = Boolean(key) && signed.length === 32 && timingSafeEqual(signed, Buffer.from(signatureOf(text, key), "hex"));
  return { carried, intact: sha256(without) === carried.file, own };
}
