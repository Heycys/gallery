import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { refusal, said, saying } from "../shared/i18n/index.mjs";
import { extensionOf as extensionOfName, imageExtension, imageFile, mediaTypeOf, UPLOAD_LIMITS } from "../shared/media.mjs";
import { slugPattern } from "../shared/reports.mjs";
import { documentDirectory, documentFiles, layoutOf } from "../shared/workspace.mjs";
import { fetchWeb, readWhole } from "./net-fetch.mjs";
import { frameable as framed, unfurl as readPage } from "./unfurl.mjs";

// The media store: what a report keeps in its own folder, <workspace>/<slug>/assets/, which its doc.html
// refers to as assets/<file> (the preview serves them, an export embeds them: src/render/media-ref.mjs),
// and the workspace's library of custom emojis. A file's name is its content's hash, so the same file is
// kept once. What may be uploaded is the one table KINDS (its limits are shared/media.mjs UPLOAD_LIMITS):
//   icon    a page's icon (components/icon/): an image, 2 MB at most, icon-<hash>.<extension>
//   image   an image block's picture (components/image/): an image, 10 MB at most, image-<hash>.<extension>
//   file    a file block's file (components/file/): any file, 20 MB at most, file-<hash>.<its extension>
//   embed   an embed block's file (components/embed/): an HTML or PDF file, 20 MB at most, embed-<hash>.<extension>
// An image is any of PNG, JPEG, GIF, WebP, AVIF, SVG (shown as an image, whose scripts never run) or ICO,
// by its bytes. A file comes from the page's 上传 (a file, a pasted or dropped one, or a link the server
// downloads: an export may not reach the web), or, for an icon, from the library, <workspace>/.gallery/emoji-library/
// (library.json and the images), which any report may take one from: copied into its folder then.
// A bookmark's icon and cover are kept the same way (bookmark-icon-…, bookmark-cover-…).

// The extension of the name a file came with (a link's query left off), or "".
const extensionOf = (name) => extensionOfName(String(name ?? "").replace(/[?#].*$/, ""));
// The name it came with, for saving it again: its last path part, decoded, with nothing a name cannot hold.
const nameOf = (name) => {
  let text = String(name ?? "").replace(/[?#].*$/, "");
  text = text.slice(text.lastIndexOf("/") + 1);
  try {
    text = decodeURIComponent(text);
  } catch {}
  return text.replace(/[\u0000-\u001f<>:"/\\|?*]/g, "").trim().slice(0, 120) || "file";
};

// What an image is by its bytes (a declared type is not trusted).
function sniff(bytes) {
  const head = bytes.subarray(0, 16);
  if (head[0] === 0x89 && head.toString("latin1", 1, 4) === "PNG") return "image/png";
  if (head[0] === 0 && head[1] === 0 && head[2] === 1 && head[3] === 0) return "image/x-icon"; // a site's favicon.ico (a bookmark's icon)
  if (head[0] === 0xff && head[1] === 0xd8) return "image/jpeg";
  if (head.toString("latin1", 0, 4) === "GIF8") return "image/gif";
  if (head.toString("latin1", 0, 4) === "RIFF" && head.toString("latin1", 8, 12) === "WEBP") return "image/webp";
  if (head.toString("latin1", 4, 12) === "ftypavif") return "image/avif";
  if (/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*<svg\b/i.test(bytes.subarray(0, 512).toString("utf8"))) return "image/svg+xml";
  return null;
}

// A refusal: its reason and what it says (a message, or said()'s with its parts: the UI says it in its language).
const refused = (reason, message) => refusal(message, { reason });
// How each kind tells (or refuses) its file's extension: (bytes, given), the bytes and the name the
// file came with (a file's name, a link's address), each kind reading the one it goes by.
// An image's by its bytes (a declared type is not trusted), or a refusal.
const pictureExtension = (bytes, _given) => {
  const type = sniff(bytes);
  if (!type) throw refused("type", "这个文件不是图片");
  return imageExtension(type);
};
// A file's by the name it came with.
const fileExtension = (_bytes, given) => extensionOf(given);
// An embed's: an HTML or PDF file, by the name it came with (a PDF's bytes saying so).
const embedExtension = (bytes, given) => {
  const extension = extensionOf(given);
  if (!["html", "htm", "pdf"].includes(extension) || (extension === "pdf" && bytes.subarray(0, 5).toString("latin1") !== "%PDF-")) throw refused("type", "只能嵌入 HTML 或 PDF 文件");
  return extension;
};

// What a picture and a file are called when refused: too big (its limit in MB filled in) and a link
// not downloaded; each one whole, for the UI to say in its language (said()).
const PICTURE = { big: (mb) => said("图片太大（最多 {0} MB）", mb), unreachable: "下载不了这张图片" };
const FILE = { big: (mb) => said("文件太大（最多 {0} MB）", mb), unreachable: "下载不了这个文件" };

// What each kind of upload is: its limit, what it is called when refused, how its extension is told
// (above), and whether the answer names it (a file is shown by its name).
const KINDS = {
  icon: { limit: UPLOAD_LIMITS.icon, words: PICTURE, extension: pictureExtension },
  image: { limit: UPLOAD_LIMITS.image, words: PICTURE, extension: pictureExtension },
  file: { limit: UPLOAD_LIMITS.file, words: FILE, extension: fileExtension, named: true },
  embed: { limit: UPLOAD_LIMITS.embed, words: FILE, extension: embedExtension, named: true },
};

/**
 * The name a file of `kind` (icon, image, file, embed) is kept under in a report's folder, as an upload
 * is: <kind>-<12 hex of its sha256 `hash`>.<extension>, its extension told (or the file refused, as
 * an upload is) by its kind's rule from its first bytes (`head`) or the name it came with (`given`).
 * The import (src/transfer/) keeps its files so, with no size limit: they come with their pages.
 */
export function keptName(kind, hash, head, given) {
  const extension = KINDS[kind].extension(head, given);
  return `${kind}-${hash.slice(0, 12)}${extension ? `.${extension}` : ""}`;
}

export function createMediaStore({ reportsDirectory }) {
  const libraryDirectory = layoutOf(reportsDirectory).emojiLibrary;
  // A document's folder, when it holds a document (its doc.html, or an old one's report.html), else null.
  const documentOf = async (slug) => {
    const directory = documentDirectory(slug, reportsDirectory);
    return (await fs.stat(documentFiles(directory).html).catch(() => null)) ? directory : null;
  };
  const libraryFile = path.join(libraryDirectory, "library.json");
  const failure = (status, reason, message) => [status, { ok: false, reason, ...saying(message) }];

  // A file kept in a folder under its hash: its file name. `extension(bytes, given)` tells (or refuses)
  // its extension, before the size is looked at.
  async function keep(directory, bytes, { stem, limit, words = PICTURE, extension = pictureExtension, given }) {
    const kind = extension(bytes, given);
    if (bytes.length > limit) throw refused("size", words.big(limit / 1024 / 1024));
    const name = `${stem}-${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}${kind ? `.${kind}` : ""}`; // keptName's, for any stem
    await fs.mkdir(directory, { recursive: true });
    const file = path.join(directory, name);
    if (!(await fs.stat(file).catch(() => null))) await fs.writeFile(file, bytes);
    return name;
  }
  // An image kept under `stem`: a bookmark's icon and cover, a custom emoji.
  const keepPicture = (directory, bytes, stem, limit = UPLOAD_LIMITS.icon) => keep(directory, bytes, { stem, limit });

  // A link's file, downloaded (10 s, `limit` bytes at most, none of the rest read).
  async function download(url, limit, words = PICTURE) {
    const response = await fetchWeb(url, { unreachable: words.unreachable });
    if (!response.ok) throw refused("download", words.unreachable);
    const bytes = await readWhole(response, limit);
    if (!bytes) throw refused("size", words.big(limit / 1024 / 1024));
    return bytes;
  }

  async function readLibrary() {
    try {
      const list = JSON.parse(await fs.readFile(libraryFile, "utf8"));
      return Array.isArray(list) ? list : [];
    } catch {
      return [];
    }
  }
  const entryOut = (entry) => ({ id: entry.id, name: entry.name, url: `/__gallery/edit/emoji-library/${entry.file}`, created_time: entry.created, alive: true });

  /**
   * POST /__gallery/edit/upload { slug, kind?, name?, data } (a file, base64) | { slug, kind?, url } (a
   * link) | { slug, library } (a custom emoji's id): the file kept in the report's folder (KINDS says
   * what each kind takes); answers { ok, path: "assets/<file>" }, and for a file or an embed's also
   * { name: the name it came with, size: its bytes }.
   */
  async function upload(body) {
    const { slug, data, url, library } = body ?? {};
    const kind = Object.hasOwn(KINDS, body?.kind) ? body.kind : "icon";
    if (typeof slug !== "string" || !slugPattern.test(slug)) return failure(400, "body");
    const directory = await documentOf(slug);
    if (!directory) return failure(404, "missing");
    const { limit, words, extension, named } = KINDS[kind];
    try {
      let bytes;
      let given; // the name it came with
      if (typeof data === "string") {
        bytes = Buffer.from(data, "base64");
        given = body.name;
      } else if (typeof url === "string") {
        bytes = await download(url, limit, words);
        given = url;
      } else if (typeof library === "string") {
        const entry = (await readLibrary()).find((each) => each.id === library);
        if (!entry) return failure(404, "library", "这个自定义表情已不在表情库里");
        bytes = await fs.readFile(path.join(libraryDirectory, entry.file));
      } else return failure(400, "body");
      const file = await keep(path.join(directory, "assets"), bytes, { stem: kind, limit, words, extension, given });
      return [200, { ok: true, path: `assets/${file}`, ...(named ? { name: nameOf(given), size: bytes.length } : {}) }];
    } catch (error) {
      return failure(422, error.reason ?? "write", error);
    }
  }

  /**
   * POST /__gallery/edit/unfurl { slug, url, parts }: a web page's bookmark (unfurl.mjs), its icon and
   * cover kept in the report's folder; answers { ok, url, title, description, icon, cover } (each
   * image "assets/<file>" or null). parts: "all" (a bookmark), "icon" (a link shown with its icon:
   * no cover) or "title" (a link shown as its page's title: no images).
   */
  async function unfurl(body) {
    const { slug, url, parts = "all" } = body ?? {};
    if (typeof slug !== "string" || !slugPattern.test(slug) || typeof url !== "string" || !["all", "icon", "title"].includes(parts)) return failure(400, "body");
    const directory = await documentOf(slug);
    if (!directory) return failure(404, "missing");
    try {
      const page = await readPage(url, async (bytes, stem) => `assets/${await keepPicture(path.join(directory, "assets"), bytes, stem, UPLOAD_LIMITS.image)}`, { icon: parts !== "title", cover: parts === "all" });
      return [200, { ok: true, ...page }];
    } catch (error) {
      return failure(422, error.reason ?? "download", error);
    }
  }

  /** POST /__gallery/edit/frameable { url }: whether a web page lets an embed show it (unfurl.mjs frameable). */
  async function frameable(body) {
    if (typeof body?.url !== "string") return failure(400, "body");
    return [200, { ok: true, ...(await framed(body.url)) }];
  }

  /**
   * POST /__gallery/edit/emoji-library { slug, name, url } | { name, data }: a custom emoji added to the
   * library, its image copied from the report's folder (url assets/<file>), downloaded, or given (data:
   * the file, base64: gallery emoji add's local file); answers { ok, entry }.
   */
  async function addEmoji(body) {
    const { slug, name, url, data } = body ?? {};
    if (typeof name !== "string" || !/^[\p{Ll}\p{Lo}\d_-]{1,49}$/u.test(name) || (typeof url !== "string" && typeof data !== "string")) return failure(400, "body");
    const list = await readLibrary();
    if (list.some((entry) => entry.name === name)) return failure(409, "name", "已经有表情叫这个名字了");
    try {
      let bytes;
      if (typeof data === "string") bytes = Buffer.from(data, "base64");
      else if (imageFile(url) && typeof slug === "string" && slugPattern.test(slug)) bytes = await fs.readFile(path.join(documentDirectory(slug, reportsDirectory), url));
      else bytes = await download(url, UPLOAD_LIMITS.icon);
      const file = await keepPicture(libraryDirectory, bytes, "emoji");
      const entry = { id: randomUUID(), name, file, created: Date.now() };
      await fs.writeFile(libraryFile, `${JSON.stringify([...list, entry], null, 2)}\n`);
      return [200, { ok: true, entry: entryOut(entry) }];
    } catch (error) {
      return failure(422, error.reason ?? "write", error);
    }
  }

  /** GET /__gallery/edit/emoji-library: { ok, list } (the library's emojis, as custom.mjs takes them). */
  const listEmojis = async () => [200, { ok: true, list: (await readLibrary()).map(entryOut) }];

  /** A custom emoji's image of the library (<file>) to serve; null when there is none. */
  async function readEmoji(file) {
    if (!imageFile(`assets/${file}`)) return null;
    const body = await fs.readFile(path.join(libraryDirectory, file)).catch(() => null);
    return body && { type: mediaTypeOf(file), body };
  }

  return { upload, unfurl, frameable, addEmoji, listEmojis, readEmoji };
}
