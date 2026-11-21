import { SPAN, SPAN_SIZE, imageFile } from "../../../shared/media.mjs";
import { PHOTO_ICON } from "../icons.mjs";
import { captionHolding, captionNode, captionOf, captionWords, fileOf, mediaReadOnly, newMediaFigure, showFile, shownFile, writtenCaption } from "../media/parts.mjs";
import { barMarkup } from "../placeholder-bar.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { boxed, plainRow } from "../read-rows.mjs";

// 图片 (an image block): the kit's figure.doc-image, a picture of the report's folder
// (assets/<file>) and its caption, a <figcaption> always written (empty while there is none). A
// card: one block, its caption a text block of its own kind (mediaCaption: plain inline text, may be
// empty), its width a size (--doc-span), its side a class (left or right; centered without).
// Made from an empty block (the "/" menu: 图片): a placeholder until a picture is chosen (上传, or a
// link the server downloads into the report's folder: editor/media-store.mjs), written once it has
// one. page.mjs: the picker, the toolbar, resizing, the viewer (what the four media blocks share:
// ../media/); file.mjs: a new one in report.html.
//
// Where the engines reach it (src/editor/page/ unless named): convert.mjs (made from an empty
// block: `create`), editor.mjs (the picker opens on a new one: page.mjs `onCreated`), clipboard/ (an
// image pasted: `clipboard`), src/transfer/markdown.mjs (`read`), page.mjs (its block menu rows: 对齐, 标题, 替换, 原始大小), ../source/ (its caption:
// blocks.mjs).
// Its look: the kit's styles/image.css (src/render/kit/); its picture where the preview serves it
// and embedded in an export: src/render/images.mjs.
export const ALIGN = ["doc-image--left", "doc-image--right"]; // centered with neither

/**
 * A picture's placeholder bar, as markup: in a new one, and in one the file keeps empty from the first paint (the server
 * puts it there: components/placeholder.mjs showEmpty).
 */
const placeholder = () => barMarkup("doc-image", PHOTO_ICON, t("添加图片")); // its words in the language t() says them in now (placeholder.mjs showEmpty)

export default {
  name: "image",
  listed: () => t("图片"),
  readOnly: [mediaReadOnly("image")],
  units: {
    image: {
      name: t("图片"),
      match: [{ rank: 45, tag: "figure", class: "doc-image" }],
      boxed: true,
      // Selected alone with its picture, its corner grips and toolbar show it: no selection fill (selection/index.mjs).
      unfilled: ":scope > img",
      toggles: ALIGN,
      sizes: { [SPAN]: SPAN_SIZE },
      // gallery read (../read-rows.mjs): boxed, the picture as Markdown's with its other attributes, its file (size, pixels), its caption.
      read: {
        name: "图片",
        rows(node, { tools }) {
          const img = node.el.querySelector(":scope > img");
          const caption = node.el.querySelector(":scope > figcaption");
          const rows = img ? [plainRow(tools.picture(img)), plainRow(`文件：${tools.fileFacts(img.getAttribute("src"), true)}`)] : [plainRow("（还没有选图片）")];
          if (caption && tools.own(caption)) rows.push(plainRow(`图注：${tools.own(caption)}`));
          return boxed(node, `图片${tools.looks(node.el)}`, rows);
        },
        words: (node, { tools }) => [tools.plain(node.el.querySelector(":scope > figcaption")) || node.el.querySelector(":scope > img")?.getAttribute("alt") || ""],
        data(node, { tools }) {
          const img = node.el.querySelector(":scope > img");
          return { src: img?.getAttribute("src") ?? null, alt: img?.getAttribute("alt") ?? null, width: img?.getAttribute("width") ?? null, caption: tools.plain(node.el.querySelector(":scope > figcaption")) || null };
        },
        lost: (node) => ((node.el.getAttribute("style") ?? "").includes(SPAN) ? "图片的宽度 {n} 处" : null),
      },
    },
  },
  types: {
    image: {
      menu: ["advanced", 16], fresh: 2,
      tag: "figure", className: "doc-image", kind: "image", bare: true,
      create: ({ doc, put }) => put(newImage(doc)), // its placeholder stands for the empty block; what it holds is chosen next
      // Copied as itself, a card, carrying what a new one is written with (`data`: imageNode), so that
      // where its unit is not (cut, another document) it is made anew as it was, its files of the
      // folder (`files`) copied into another document's first (clipboard/). It comes as this from
      // another program too: its address (`src` a web or data: one), filled once on the page.
      clipboard: {
        kind: "image",
        read(unit, { plain }) {
          const image = unit.querySelector(":scope > img");
          const src = image?.getAttribute("src");
          if (!src) return null;
          const name = src.split("/").pop();
          return { label: plain(unit.querySelector(":scope > figcaption")) || image.getAttribute("alt") || name, src, name, caption: writtenCaption(unit) };
        },
        // None for one whose picture is no file of the folder (an Agent's of a web or data: address, which
        // the page never writes): its data would say an empty image. It is copied within its document as it
        // always was, the file copying its source, and is not cut (clipboard/index.mjs).
        data: (node, { serializeInner }) => (node.querySelector(":scope > img") && !imageOf(node) ? null : { type: "image", ...imageNode(node, serializeInner) }),
        files: (block) => (carried(block) ? [block.src, block.original].filter(imageFile).map((path) => ({ path, kind: "image" })) : []),
        check: (block, { imageSource, string }) => (carried(block) ? validCarried(block, string) : imageSource(block.src) && (block.caption === undefined || string(block.caption, 2000))),
        build: (what) => (carried(what.block) ? madeAgain(what) : what.pending(newImage(what.doc), what.block.src)),
        text: (block) => (carried(block) && block.caption ? [block.caption] : []),
        // Copied alone it is a picture (clipboard/picture.mjs: a PNG of it on the system clipboard too): the
        // picture it shows, and its words.
        picture(unit) {
          const img = imageOf(unit);
          return img ? { img, label: img.getAttribute("alt") || captionOf(unit)?.textContent.replace(/\s+/g, " ").trim() || "" } : null;
        },
        // What a copy of it says to other programs (writers.mjs): its picture where this page serves it, and its words.
        said: (block, how) => (block.src ? { src: imageFile(block.src) ? how.served("asset", block.src) : block.src, label: block.alt || how.plain(block.caption ?? "") || block.src.split("/").pop() } : null),
      },
      // What a new one is written with (core.mjs nodeOf): its picture, caption, side and width; an
      // empty figure while it has no picture (its placeholder, kept: file.mjs).
      extras: (element, { serializeInner } = {}) => imageNode(element, serializeInner),
      part: ".doc-image",
      bar: placeholder,
      label: t("图片"), icon: PHOTO_ICON,
      words: "图片 图像 照片 截图 tupian tp image picture photo img screenshot",
      glance: { row: 10, name: "图片", write: "`<figure><img src=\"assets/…\"><figcaption>`, or a lone `<img>`", after: "`figure.doc-image`", rule: "Pictures" },
    },
  },
};

/** An image block's picture element, once it has one. */
export const imageOf = (figure) => figure.querySelector(":scope > img[data-ge-src]");

/** A crop as written (data-crop: "x y width height", in % of the original), or null. */
export function cropOf(value) {
  const numbers = String(value ?? "").trim().split(/\s+/).map(Number);
  if (numbers.length !== 4 || numbers.some((number) => !Number.isFinite(number))) return null;
  const [x, y, width, height] = numbers;
  return x >= 0 && y >= 0 && width > 0 && height > 0 && x + width <= 100.01 && y + height <= 100.01 ? { x, y, width, height } : null;
}

// What a new image is written with: its picture (the file, not where the preview serves it), its
// caption's text, its side and its width; cropped, the picture it was cropped from and what of it
// is kept (裁剪图片 starts from them again); the words its picture stands for (alt), where it has any
// (an Agent's: one made on the page has none).
function imageNode(figure, serializeInner = null) {
  const span = figure.style.getPropertyValue(SPAN).trim();
  const side = ALIGN.filter((name) => figure.classList.contains(name));
  const img = imageOf(figure);
  const original = img?.getAttribute("data-original");
  const crop = img?.getAttribute("data-crop");
  const alt = img?.getAttribute("alt")?.trim();
  return {
    ...(original && cropOf(crop) ? { original, crop } : {}),
    src: fileOf(imageOf(figure), "src") ?? "",
    caption: captionWords(figure, serializeInner),
    ...(side.length > 0 ? { classes: side } : {}),
    ...(span ? { span: Number(span) } : {}),
    ...(alt ? { alt } : {}),
  };
}

/**
 * A picture of the report's folder (`path`, assets/<file>) where the server serves it (`url`), and a
 * caption holding `caption` (the page's own markup); cropped (`cropped`: { original, crop }), the
 * picture it was cropped from and what of it is kept.
 */
export function pictureParts(doc, path, url, caption = "", cropped = null) {
  const img = doc.createElement("img");
  showFile(img, "src", path, url);
  img.alt = "";
  img.draggable = false;
  if (cropped) {
    img.setAttribute("data-original", cropped.original);
    img.setAttribute("data-crop", cropped.crop);
  }
  return [img, captionNode(doc, caption)];
}

// Whether a description is an image's own (`data`, what a new one is written with: a file of the folder, or
// none for one left empty) and not another program's, whose `src` is a web or data: address.
const carried = (block) => block.src === "" || imageFile(block.src);
const plainWords = (value, max) => typeof value === "string" && value.length <= max && !/[\u0000-\u001f]/.test(value);

// An image's own description checked as the file's writer would take it (file.mjs: the clipboard is not
// trusted): its picture, side, width, crop and words; its caption inline HTML, which the paste makes again.
const validCarried = (block, string) => string(block.caption ?? "", 20000)
  && (block.classes === undefined || (Array.isArray(block.classes) && block.classes.every((name) => ALIGN.includes(name))))
  && (block.span === undefined || (typeof block.span === "number" && block.span >= SPAN_SIZE.min && block.span <= SPAN_SIZE.max))
  && (block.original === undefined || (imageFile(block.original) && cropOf(block.crop) !== null))
  && (block.alt === undefined || plainWords(block.alt, 1000));

// An image made again of its own description (clipboard/own/blocks.mjs build): as `place` (page.mjs) puts
// a picture in, its file the one of this document's folder it is now (`fileHere`: another document's copied
// in), its side, width, crop and words, its caption made of its inline HTML again; one left empty its
// placeholder.
function madeAgain({ doc, block, inline, fileHere, served }) {
  const figure = newImage(doc);
  const picture = block.src ? shownFile({ fileHere, served }, "asset", block.src) : null;
  if (!picture) return figure;
  for (const name of block.classes ?? []) figure.classList.add(name);
  if (block.span !== undefined) figure.style.setProperty(SPAN, String(block.span));
  const original = block.original ? fileHere(block.original) : null;
  const [img] = pictureParts(doc, picture.file, picture.url, "", original ? { original, crop: block.crop } : null);
  if (block.alt) img.alt = block.alt;
  figure.replaceChildren(img, captionHolding(doc, inline(block.caption ?? "")));
  return figure;
}

/** A new image (the "/" menu's 图片): its placeholder (添加图片), until a picture is chosen (page.mjs). */
export const newImage = (doc) => newMediaFigure(doc, "image", placeholder());
