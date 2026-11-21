import { EMBED_ICONS } from "./icons.mjs";
import { SPAN, SPAN_SIZE, embedFile } from "../../../shared/media.mjs";
import { WEB_SANDBOX } from "../../../shared/web-links.mjs";
import { captionHolding, captionNode, captionWords, fileOf, mediaReadOnly, newMediaFigure, showFile, shownFile } from "../media/parts.mjs";
import { barMarkup } from "../placeholder-bar.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { boxed, plainRow } from "../read-rows.mjs";

// 嵌入 (an embed block): the kit's figure.doc-embed, a web page in a sandboxed frame (it stays
// on the web), or an HTML or PDF file of the report's folder (assets/<file>: an HTML file sandboxed
// with no origin of its own, a PDF in the browser's viewer), and its caption, a <figcaption> always
// written (a media block's, components/media/). A card: one block, moved, deleted, captioned as a
// whole; its height a size (--doc-embed-height). Made from an empty block (the "/" menu: 嵌入): a
// placeholder until a page is given (one that refuses frames becomes a bookmark) or a
// file chosen (editor/media-store.mjs, kind "embed"), written once it has one. page.mjs: the
// menu, the corner handles, the toolbar, the block menu's rows; file.mjs: a new one
// in report.html.
//
// Where the engines reach it (src/editor/page/ unless named): convert.mjs (made from an empty block:
// `create`), editor.mjs (the menu opens on a new one: page.mjs `onCreated`), clipboard/ (an embed
// pasted: `clipboard`), src/transfer/markdown.mjs (`read`), ../source/ (its caption: blocks.mjs).
// Its look: the kit's styles/embed.css (src/render/kit/); its file where the preview shows it and
// embedded in an export: src/render/embeds.mjs (a PDF shown through a blob: address by the runtime).
export const EMBED_ICON = EMBED_ICONS.linkCaptureEye;
export const HEIGHT = "--doc-embed-height";
/** The frame's height as a size: the least and the most (px) it may be given. */
export const HEIGHT_SIZE = { min: 96, max: 2000, px: true };

/** The sandbox of a web page's frame (the sidebar's web links have it too, shared/web-links.mjs), and of an HTML file's (no origin of its own). */
export { WEB_SANDBOX };
export const FILE_SANDBOX = "allow-scripts allow-popups allow-forms allow-modals";

/**
 * An embed's placeholder bar, as markup: in a new one, and in one the file keeps empty from the first paint (the server
 * puts it there: components/placeholder.mjs showEmpty).
 */
const placeholder = () => barMarkup("doc-embed", EMBED_ICON, t("嵌入网页，或上传 HTML、PDF 文件")); // its words in the language t() says them in now (placeholder.mjs showEmpty)

export default {
  name: "embed",
  listed: () => t("嵌入"),
  readOnly: [mediaReadOnly("embed")],
  units: {
    embed: {
      name: t("嵌入"),
      match: [{ rank: 42, tag: "figure", class: "doc-embed" }],
      boxed: true,
      sizes: { [HEIGHT]: HEIGHT_SIZE, [SPAN]: SPAN_SIZE },
      // gallery read (../read-rows.mjs): boxed, the file of the folder (its size) or the web page it shows, its frame's attributes, its caption.
      read: {
        name: "嵌入",
        rows(node, { tools }) {
          const frame = node.el.querySelector(":scope > iframe");
          const caption = node.el.querySelector(":scope > figcaption");
          const rows = [];
          if (frame) {
            const src = frame.getAttribute("src") ?? "";
            const local = !/^https?:/i.test(src);
            rows.push(plainRow(`${local ? "文件" : "网页"}：${local ? tools.fileFacts(src, false) : src}`));
            const rest = tools.attributesOf(frame).filter(({ name }) => !["src", "class", "loading"].includes(name)).map(({ name, value }) => (value ? `${name}="${value}"` : name));
            if (rest.length) rows.push(plainRow(`iframe：${rest.join(" ")}`));
          } else rows.push(plainRow("（还没有嵌入的网页或文件）"));
          if (caption && tools.own(caption)) rows.push(plainRow(`说明：${tools.own(caption)}`));
          return boxed(node, `嵌入${tools.looks(node.el)}`, rows);
        },
        words: (node, { tools }) => [tools.plain(node.el.querySelector(":scope > figcaption"))],
        data(node, { tools }) {
          const frame = node.el.querySelector(":scope > iframe");
          return { src: frame?.getAttribute("src") ?? null, sandbox: frame?.getAttribute("sandbox") ?? null, caption: tools.plain(node.el.querySelector(":scope > figcaption")) || null };
        },
        lost: () => "嵌入 {n} 个（只有地址）",
      },
    },
  },
  types: {
    embed: {
      menu: ["advanced", 20], fresh: 5,
      tag: "figure", className: "doc-embed", kind: "embed", bare: true,
      create: ({ doc, put }) => put(newEmbed(doc)), // its placeholder stands for the empty block; what it holds is chosen next
      // Copied as itself, a card, carrying what a new one is written with (`data`: embedNode), so that
      // where its unit is not (cut, another document) it is made anew as it was, its file of the folder
      // (`files`) copied into another document's first (clipboard/). It comes as this from another
      // program too: its address alone, filled once on the page. Written out its caption is its link's
      // words, and no paragraph of its own.
      clipboard: {
        kind: "media",
        read(unit, { plain }) {
          const src = unit.querySelector(":scope > iframe")?.getAttribute("src");
          if (!src) return null;
          const local = !/^https?:/i.test(src);
          const name = src.split("/").pop();
          return { label: plain(unit.querySelector(":scope > figcaption")) || (local ? name : src), src, name, file: local };
        },
        // None for one whose frame shows what its data cannot say (a page of no https: address, a frame of a
        // class of its own): it would say an empty embed (as an image's: image/index.mjs).
        data(node, { serializeInner }) {
          const carried = embedNode(node, serializeInner);
          return node.querySelector(":scope > iframe") && !carried.src ? null : { type: "embed", ...carried };
        },
        files: (block) => (carried(block) && embedFile(block.src) ? [{ path: block.src, kind: "embed" }] : []),
        check: (block, { webPage, string, sizeValue }) => (carried(block)
          ? string(block.caption, 20000) && (block.src === "" || embedFile(block.src) || (HTTPS.test(block.src) && webPage(block.src)))
            && (block.height === undefined || sizeValue("embed", HEIGHT, block.height) === block.height) && (block.span === undefined || sizeValue("embed", SPAN, block.span) === block.span)
          : webPage(block.src)),
        build: (what) => (carried(what.block) ? madeAgain(what) : what.pending(newEmbed(what.doc), what.block.src)),
        text: (block) => (carried(block) && block.caption ? [block.caption] : []),
        // What a copy of it says to other programs (writers.mjs): its page, or its file where this page shows it, and its words (its caption, else its address).
        said: (block, how) => (block.src ? { src: embedFile(block.src) ? how.served("embed", block.src) : block.src, label: how.plain(block.caption ?? "") || block.src.split("/").pop() } : null),
      },
      // What a new one is written with (core.mjs nodeOf): its page or file, height, width and caption; an
      // empty figure while it has neither (its placeholder, kept: file.mjs).
      extras: (element, { serializeInner } = {}) => embedNode(element, serializeInner),
      part: ".doc-embed",
      bar: placeholder,
      label: t("嵌入"), icon: EMBED_ICON,
      words: "嵌入 网页 网站 iframe html pdf qianru qr embed website page",
      glance: { row: 17, name: "嵌入", write: "`figure.doc-embed`", rule: "Kit blocks" },
    },
  },
};

/** An embed block's frame, once it shows something. */
export const frameOf = (figure) => figure.querySelector(":scope > iframe.doc-embed-frame");

// What a new embed is written with: its page (or its file, not where the preview shows it), its
// height, its width (a share of the reading width, its corner handles' as an image's) and its caption.
// (Its page is data-ge-src on one made on the page, its src as the file has it on one served, whose web address
// the preview leaves as it is: render/media-ref.mjs marks files of the folder alone.)
function embedNode(figure, serializeInner = null) {
  const frame = frameOf(figure);
  const height = figure.style.getPropertyValue(HEIGHT).trim();
  const span = figure.style.getPropertyValue(SPAN).trim();
  const shown = frame?.getAttribute("src") ?? "";
  return {
    src: fileOf(frame, "src") ?? (HTTPS.test(shown) ? shown : ""),
    ...(height ? { height } : {}),
    ...(span ? { span } : {}),
    caption: captionWords(figure, serializeInner),
  };
}

const HTTPS = /^https:\/\//i;
// Whether a description is an embed's own (`data`: its caption always said) and not another program's (its address alone).
const carried = (block) => typeof block.caption === "string";

/** A frame of `src` (a web page, or a file of the report's folder) where the page shows it (`url`), and a caption holding `caption` (the page's own markup). */
export function frameParts(doc, src, url, caption = "") {
  const local = !HTTPS.test(src);
  const frame = doc.createElement("iframe");
  frame.className = "doc-embed-frame";
  showFile(frame, "src", src, url);
  if (!local) {
    frame.setAttribute("sandbox", WEB_SANDBOX);
    frame.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
    frame.setAttribute("allowfullscreen", "");
  } else if (!/\.pdf$/i.test(src)) frame.setAttribute("sandbox", FILE_SANDBOX);
  frame.setAttribute("loading", "lazy");
  return [frame, captionNode(doc, caption)];
}

// An embed made again of its own description (clipboard/own/blocks.mjs build), as `place` (page.mjs) puts a
// frame in: its page, or its file of this document's folder (`fileHere`: another document's copied in), its
// height and width, its caption made of its inline HTML again; one left empty its placeholder.
function madeAgain({ doc, block, inline, fileHere, served }) {
  const figure = newEmbed(doc);
  const local = block.src !== "" && !HTTPS.test(block.src);
  const shown = !block.src ? null : local ? shownFile({ fileHere, served }, "embed", block.src) : { file: block.src, url: block.src };
  if (!shown) return figure;
  figure.classList.toggle("doc-embed--file", local);
  if (block.height) figure.style.setProperty(HEIGHT, block.height);
  if (block.span) figure.style.setProperty(SPAN, block.span);
  figure.replaceChildren(frameParts(doc, shown.file, shown.url)[0], captionHolding(doc, inline(block.caption)));
  return figure;
}

/** A new embed (the "/" menu's 嵌入): its placeholder, until a page is given or a file chosen (page.mjs). */
export const newEmbed = (doc) => newMediaFigure(doc, "embed", placeholder());

/**
 * Where a web page shows in a frame: a YouTube video's player, a Google document's
 * preview; any other page as it is.
 */
export function frameAddress(src) {
  let url;
  try {
    url = new URL(src);
  } catch {
    return src;
  }
  const host = url.hostname.replace(/^www\.|^m\./, "");
  if (host === "youtu.be") return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
  if (host === "youtube.com") {
    const video = url.searchParams.get("v");
    const path = /^\/(shorts|live)\/([\w-]+)/.exec(url.pathname);
    if (video) return `https://www.youtube.com/embed/${video}`;
    if (path) return `https://www.youtube.com/embed/${path[2]}`;
  }
  if (host === "docs.google.com" && /\/edit$/.test(url.pathname)) {
    url.pathname = url.pathname.replace(/\/edit$/, "/preview");
    return url.href;
  }
  return url.href;
}
