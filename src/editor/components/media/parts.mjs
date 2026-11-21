import { MEDIA_BLOCKS, MEDIA_CLASS } from "../../../shared/components/index.mjs";
import { barElement } from "../placeholder-bar.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// What the four media blocks (图片, 文件, 网页书签, 嵌入) are made of, once: the figure of a new one,
// its caption, the file it shows. Pure DOM, so a block's index.mjs (which the server loads too) uses
// it; what each block adds (its picture, row, card or frame) is its own.

/**
 * The text block a media block's caption is (data-ge-kind): plain inline text that may be empty, never
 * removed. The part of every media block there is, so it is no one block's: registry.mjs PAGE says it.
 */
export const MEDIA_HOSTS = { mediaCaption: { name: t("说明@caption"), caps: () => ["empty", "links"], parts: MEDIA_BLOCKS.map((id) => [id, "caption"]) } };

/** A media block's caption (a <figcaption>, written whether it has words or not). */
/** What a media block's figure says of itself, read-only (a definition's `readOnly`): nothing, it has its own tools. */
export const mediaReadOnly = (id) => ({ rank: 90, at: `figure.${MEDIA_CLASS[id]}`, says: null });

export const captionOf = (figure) => figure.querySelector(":scope > figcaption");

/** What a page export writes as a figure's caption: a kit figure's own element too (a card's). */
export const writtenCaption = (figure) => figure.querySelector(":scope > figcaption, :scope > .doc-figure-caption");

/**
 * What a new block is written with of its caption: its words, or nothing when it has none; as the file
 * holds inline HTML (`serializeInner`, where the writer has it: a formula or a link shown with its icon as
 * its source, not as the page draws it: a caption pasted with them).
 */
export const captionWords = (figure, serializeInner = null) => {
  const caption = captionOf(figure);
  return caption && (caption.textContent.trim() || caption.querySelector("[data-ge-atom]")) ? (serializeInner ? serializeInner(caption) : caption.innerHTML) : "";
};

/** A caption made in `doc` holding `nodes` (a pasted block's: the clipboard's inline HTML made again, never markup as it came). */
export function captionHolding(doc, nodes) {
  const text = captionNode(doc);
  text.append(...nodes);
  return text;
}

/**
 * The served address a media block made again of the clipboard's data shows a file of the folder at
 * (`what.served(route, path)`), and the file of this document's folder that a file of the folder it was
 * copied from is now (`what.fileHere(path)`: the same in its own document, else the one the paste copied in).
 */
export const shownFile = (what, route, path) => {
  const file = what.fileHere(path);
  return file ? { file, url: what.served(route, file) } : null;
};

/** A caption made in `doc`: a text block of its own kind (mediaCaption), holding `html`. */
export function captionNode(doc, html = "") {
  const text = doc.createElement("figcaption");
  for (const [name, value] of [["contenteditable", "true"], ["data-ge-new", ""], ["data-ge-kind", "mediaCaption"], ["data-ge-caps", MEDIA_HOSTS.mediaCaption.caps({ bound: false, blockLevel: true }).join(" ")]]) text.setAttribute(name, value);
  text.innerHTML = html;
  return text;
}

/** A new media block `id` (image, file, bookmark, embed) in `doc`, holding `bar` (its placeholder, as markup). */
export function newMediaFigure(doc, id, bar) {
  const figure = doc.createElement("figure");
  figure.className = MEDIA_CLASS[id];
  for (const [name, value] of [["data-ge-new", ""], ["data-ge-type", id], ["data-ge-unit-kind", id], ["contenteditable", "false"]]) figure.setAttribute(name, value);
  figure.append(barElement(doc, bar));
  return figure;
}

/**
 * `element` showing what the file names (`path`: a file of the report's folder, assets/<file>; a
 * bookmark's card, the page's address): `attribute` (src or href) is where it shows now (`url`: where
 * the preview serves a file), data-ge-<attribute> what the file says, which is what is written
 * (render/media-ref.mjs makes the same pair when it serves a page).
 */
export function showFile(element, attribute, path, url) {
  element.setAttribute(attribute, url);
  element.setAttribute(`data-ge-${attribute}`, path);
}

/** What the file says `element` shows (see showFile), or null. */
export const fileOf = (element, attribute) => element?.getAttribute(`data-ge-${attribute}`) ?? null;
