import { FILE_ICONS } from "./icons.mjs";
import { escapeText } from "../../../shared/escape.mjs";
import { assetFile, formatSize } from "../../../shared/media.mjs";
import { captionHolding, captionNode, captionWords, fileOf, mediaReadOnly, newMediaFigure, showFile, shownFile, writtenCaption } from "../media/parts.mjs";
import { barMarkup } from "../placeholder-bar.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { boxed, plainRow } from "../read-rows.mjs";

// 文件 (a file block): the kit's figure.doc-file, one file of the report's folder
// (assets/<file>) as a row the reader clicks to save it, its name and size, and its caption, a
// <figcaption> always written (empty while there is none; a media block's caption, components/media/).
// A card: one block, moved, deleted, captioned, replaced as a whole; the name and size are the
// file's. Made from an empty block (the "/" menu: 文件) or a file pasted: a placeholder until a file
// is chosen (上传, or a link whose file the server downloads into the report's folder:
// editor/media-store.mjs), written once it has one. page.mjs: the picker, the block
// menu's rows; file.mjs: a new one in report.html.
//
// Where the engines reach it (src/editor/page/ unless named): convert.mjs (made from an empty block:
// `create`), editor.mjs (the picker opens on a new one: page.mjs `onCreated`), clipboard/ (a file
// pasted), src/transfer/markdown.mjs (`clipboard`), ../source/ (its caption: blocks.mjs). Its look: the kit's styles/file.css (src/render/kit/); its
// file handed out by the preview and embedded in an export: src/render/files.mjs.
export const PAPERCLIP = FILE_ICONS.paperclip;

/**
 * A file block's placeholder bar, as markup: in a new one, and in one the file keeps empty from the first paint (the server
 * puts it there: components/placeholder.mjs showEmpty).
 */
const placeholder = () => barMarkup("doc-file", FILE_ICONS.upload, t("上传文件")); // its words in the language t() says them in now (placeholder.mjs showEmpty)

export default {
  name: "file",
  listed: () => t("文件"),
  readOnly: [mediaReadOnly("file")],
  units: {
    file: {
      name: t("文件"), match: [{ rank: 44, tag: "figure", class: "doc-file" }], boxed: true,
      // gallery read (../read-rows.mjs): boxed, its link, the name it is saved as and the size its card says, its file, its caption.
      read: {
        name: "文件",
        rows(node, { tools }) {
          const link = node.el.querySelector(":scope > a.doc-file-link");
          const caption = node.el.querySelector(":scope > figcaption");
          const rows = [];
          if (link) {
            const href = link.getAttribute("href") ?? "";
            const size = tools.plain(link.querySelector(".doc-file-size"));
            rows.push(plainRow(`[${tools.plain(link.querySelector(".doc-file-name")) || href}](${href})`));
            if (link.hasAttribute("download")) rows.push(plainRow(`保存为：${link.getAttribute("download")}${size ? `（卡片上写 ${size}）` : ""}`));
            rows.push(plainRow(`文件：${tools.fileFacts(href, false)}`));
          } else rows.push(plainRow("（还没有选文件）"));
          if (caption && tools.own(caption)) rows.push(plainRow(`说明：${tools.own(caption)}`));
          return boxed(node, `文件${tools.looks(node.el)}`, rows);
        },
        words: (node, { tools }) => [tools.plain(node.el.querySelector(".doc-file-name")), tools.plain(node.el.querySelector(":scope > figcaption"))],
        data(node, { tools }) {
          const link = node.el.querySelector(":scope > a.doc-file-link");
          return { src: link?.getAttribute("href") ?? null, name: link?.getAttribute("download") ?? null, size: tools.plain(link?.querySelector(".doc-file-size")) || null, caption: tools.plain(node.el.querySelector(":scope > figcaption")) || null };
        },
      },
    },
  },
  types: {
    file: {
      menu: ["advanced", 18], fresh: 3,
      tag: "figure", className: "doc-file", kind: "file", bare: true,
      create: ({ doc, put }) => put(newFile(doc)), // its placeholder stands for the empty block; what it holds is chosen next
      // Copied as itself, a card, carrying what a new one is written with (`data`: fileNode), so that
      // where its unit is not (cut, another document) it is made anew as it was, its file of the folder
      // (`files`) copied into another document's first (clipboard/).
      clipboard: {
        kind: "media",
        read(unit, { plain }) {
          const link = unit.querySelector(":scope > a.doc-file-link");
          const href = link?.getAttribute("href");
          if (!href) return null;
          const name = link.getAttribute("download") || plain(link.querySelector(".doc-file-name")) || href.split("/").pop();
          return { label: name, src: href, name, file: true, caption: writtenCaption(unit) };
        },
        // None for one whose link is to no file of the folder (an Agent's of a web address): its data would
        // say an empty file block (as an image's: image/index.mjs).
        data: (node, { serializeInner }) => (node.querySelector(":scope > a") && !linkOf(node) ? null : { type: "file", ...fileNode(node, serializeInner) }),
        files: (block) => (assetFile(block.href) ? [{ path: block.href, kind: "file" }] : []),
        check: (block, { string }) => string(block.caption, 20000) && ((block.href === "" && block.name === "") || (assetFile(block.href) && plainName(block.name)))
          && (block.size === undefined || (typeof block.size === "string" && SIZE.test(block.size))),
        build({ doc, block, inline, fileHere, served }) {
          const figure = newFile(doc);
          const shown = block.href ? shownFile({ fileHere, served }, "file", block.href) : null;
          if (shown) figure.replaceChildren(fileParts(doc, { path: shown.file, name: block.name, size: block.size }, shown.url)[0], captionHolding(doc, inline(block.caption)));
          return figure;
        },
        text: (block) => [escapeText(block.name), ...(block.caption ? [block.caption] : [])].filter(Boolean),
        // What a copy of it says to other programs (writers.mjs): its file where this page hands it out, and its words (its caption, else its name).
        said: (block, how) => (block.href ? { src: how.served("file", block.href), label: how.plain(block.caption) || block.name } : null),
      },
      // What a new one is written with (core.mjs nodeOf): its file, name, size and caption; an empty
      // figure while it has no file (its placeholder, kept: file.mjs).
      extras: (element, { serializeInner } = {}) => fileNode(element, serializeInner),
      part: ".doc-file",
      bar: placeholder,
      label: t("文件"), icon: PAPERCLIP,
      words: "文件 附件 上传 wenjian wj fujian fj file attachment upload",
      glance: { row: 17, name: "文件", write: "`figure.doc-file`", rule: "Kit blocks" },
    },
  },
};

/** A file block's link, once it has a file. */
export const linkOf = (figure) => figure.querySelector(":scope > a.doc-file-link[data-ge-href]");

// What a new file is written with: its file (not where the preview hands it out), its name, size and caption.
function fileNode(figure, serializeInner = null) {
  const link = linkOf(figure);
  const size = link?.querySelector(".doc-file-size")?.textContent ?? "";
  return {
    href: fileOf(link, "href") ?? "",
    name: link?.querySelector(".doc-file-name")?.textContent ?? "",
    ...(size ? { size } : {}),
    caption: captionWords(figure, serializeInner),
  };
}

// A name a file is kept by, and its size as its row says it (file.mjs, the server's, takes them so).
const plainName = (value) => typeof value === "string" && value.trim() !== "" && value.length <= 120 && !/[\u0000-\u001f<>:"/\\|?*]/.test(value);
const SIZE = /^\d+(\.\d)? (B|KiB|MiB|GiB)$/;

/**
 * A file of the report's folder (`path`) where the server hands it out (`url`), named and sized (`size`:
 * its bytes, or its row's words as a copy carries them), and a caption holding `caption` (the page's own markup).
 */
export function fileParts(doc, { path, name, size }, url, caption = "") {
  const link = doc.createElement("a");
  link.className = "doc-file-link";
  showFile(link, "href", path, url);
  link.setAttribute("download", name);
  link.setAttribute("contenteditable", "false");
  const title = doc.createElement("span");
  title.className = "doc-file-name";
  title.textContent = name;
  link.append(title);
  const words = Number.isFinite(size) ? formatSize(size) : typeof size === "string" ? size : "";
  if (words) {
    const weight = doc.createElement("span");
    weight.className = "doc-file-size";
    weight.textContent = words;
    link.append(weight);
  }
  return [link, captionNode(doc, caption)];
}

/** A new file block (the "/" menu's 文件): its placeholder (上传文件), until a file is chosen (page.mjs). */
export const newFile = (doc) => newMediaFigure(doc, "file", placeholder());
