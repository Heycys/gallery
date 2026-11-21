import { BOOKMARK_ICON } from "./icons.mjs";
import { escapeText } from "../../../shared/escape.mjs";
import { imageFile } from "../../../shared/media.mjs";
import { captionHolding, captionNode, captionWords, fileOf, mediaReadOnly, newMediaFigure, showFile, writtenCaption } from "../media/parts.mjs";
import { barMarkup } from "../placeholder-bar.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { boxed, plainRow } from "../read-rows.mjs";

// 网页书签 (a bookmark block): the kit's figure.doc-bookmark, a web page as a card the
// reader clicks to open it in a new tab (its title, description, address with the page's icon, and
// cover), and its caption, a <figcaption> always written (a media block's, components/media/). A
// card: one block, moved, deleted, captioned as a whole; what the card says is the page's. Made from
// an empty block (the "/" menu: 网页书签): a placeholder until a link is given; the server reads the
// page and keeps its icon and cover in the report's folder (editor/unfurl.mjs), and it is written
// then. page.mjs: the link menu, the block menu's rows; file.mjs: a new one in
// report.html.
//
// Where the engines reach it (src/editor/page/ unless named): convert.mjs (made from an empty block:
// `create`), editor.mjs (the link menu opens on a new one: page.mjs `onCreated`), src/transfer/markdown.mjs
// (`clipboard`), ../source/ (its caption: blocks.mjs).
// Its look: the kit's styles/bookmark.css (src/render/kit/); its icon and cover where the preview
// serves them and embedded in an export: src/render/images.mjs.
export { BOOKMARK_ICON };

/**
 * A bookmark's placeholder bar, as markup: in a new one, and in one the file keeps empty from the first paint (the server
 * puts it there: components/placeholder.mjs showEmpty).
 */
const placeholder = () => barMarkup("doc-bookmark", BOOKMARK_ICON, t("添加 Web 书签")); // its words in the language t() says them in now (placeholder.mjs showEmpty)

export default {
  name: "bookmark",
  listed: () => t("网页书签"),
  readOnly: [mediaReadOnly("bookmark")],
  units: {
    bookmark: {
      name: t("网页书签"), match: [{ rank: 43, tag: "figure", class: "doc-bookmark" }], boxed: true,
      // gallery read (../read-rows.mjs): boxed, its page's title and address, the page's description, its icon, its caption.
      read: {
        name: "网页书签",
        rows(node, { tools }) {
          const card = node.el.querySelector(":scope > a.doc-bookmark-card");
          const caption = node.el.querySelector(":scope > figcaption");
          const rows = [];
          if (card) {
            rows.push(plainRow(`[${tools.plain(card.querySelector(".doc-bookmark-title")) || card.getAttribute("href")}](${card.getAttribute("href") ?? ""})`));
            const description = tools.plain(card.querySelector(".doc-bookmark-description"));
            if (description) rows.push(plainRow(`网页的说明：${description}`));
            const icon = card.querySelector("img");
            if (icon) rows.push(plainRow(`图标：${icon.getAttribute("src")}`));
          } else rows.push(plainRow("（还没有网址）"));
          if (caption && tools.own(caption)) rows.push(plainRow(`说明：${tools.own(caption)}`));
          return boxed(node, `网页书签${tools.looks(node.el)}`, rows);
        },
        words: (node, { tools }) => [".doc-bookmark-title", ".doc-bookmark-description", ":scope > figcaption"].map((at) => tools.plain(node.el.querySelector(at))),
        data(node, { tools }) {
          const card = node.el.querySelector(":scope > a.doc-bookmark-card");
          return { url: card?.getAttribute("href") ?? null, title: tools.plain(card?.querySelector(".doc-bookmark-title")) || null, description: tools.plain(card?.querySelector(".doc-bookmark-description")) || null, caption: tools.plain(node.el.querySelector(":scope > figcaption")) || null };
        },
        lost: () => "网页书签 {n} 个（没有网页的说明）",
      },
    },
  },
  types: {
    bookmark: {
      menu: ["advanced", 19], fresh: 4,
      tag: "figure", className: "doc-bookmark", kind: "bookmark", bare: true,
      create: ({ doc, put }) => put(newBookmark(doc)), // its placeholder stands for the empty block; what it holds is chosen next
      // Copied as itself, a card, carrying what a new one is written with (`data`: bookmarkNode), so that
      // where its unit is not (cut, another document) it is made anew as it was, its icon and cover
      // (`files`, pictures of the folder) copied into another document's first (clipboard/).
      clipboard: {
        kind: "bookmark",
        read(unit, { plain }) {
          const card = unit.querySelector(":scope > a.doc-bookmark-card");
          const href = card?.getAttribute("href");
          return href ? { label: plain(card.querySelector(".doc-bookmark-title")) || href, src: href, caption: writtenCaption(unit) } : null;
        },
        // None for one that shows what its data cannot say (as an image's: image/index.mjs): a link of a
        // class of its own, which it would say is no page, or an icon or cover of no file of the folder (an
        // Agent's of a web address), which it would leave out.
        data(node, { serializeInner }) {
          const carried = bookmarkNode(node, serializeInner);
          const lost = (selector, path) => Boolean(node.querySelector(selector)) && !path;
          return lost(":scope > a", carried.href) || lost(".doc-bookmark-icon", carried.icon) || lost(".doc-bookmark-cover > img", carried.cover) ? null : { type: "bookmark", ...carried };
        },
        files: (block) => [block.icon, block.cover].filter(imageFile).map((path) => ({ path, kind: "image" })),
        check: (block, { string }) => string(block.caption, 20000) && (block.href === "" ? !block.title && !block.description && !block.icon && !block.cover
          : WEB.test(block.href) && string(block.href, 2000) && plain(block.title, 300) && plain(block.description ?? "", 600) && picture(block.icon) && picture(block.cover)),
        build({ doc, block, inline, fileHere, served }) {
          const figure = newBookmark(doc);
          if (!block.href) return figure;
          const shown = (path) => (path ? fileHere(path) : null);
          const page = { url: block.href, title: block.title, description: block.description, icon: shown(block.icon), cover: shown(block.cover) };
          figure.replaceChildren(cardParts(doc, page, (path) => served("asset", path))[0], captionHolding(doc, inline(block.caption)));
          return figure;
        },
        text: (block) => [escapeText(block.title || block.href), ...(block.caption ? [block.caption] : [])].filter(Boolean),
        // What a copy of it says to other programs (writers.mjs): its page and its title.
        said: (block) => (block.href ? { src: block.href, label: block.title || block.href } : null),
      },
      // What a new one is written with (core.mjs nodeOf): its page and what the page said, its
      // caption; an empty figure while it has no link (its placeholder, kept: file.mjs).
      extras: (element, { serializeInner } = {}) => bookmarkNode(element, serializeInner),
      part: ".doc-bookmark",
      bar: placeholder,
      label: t("网页书签"), icon: BOOKMARK_ICON,
      words: "网页书签 书签 链接 网页 网址 shuqian sq wangye bookmark link web url",
      glance: { row: 18, name: "网页书签", write: "`<p><a class=\"doc-bookmark\" href=\"https://…\" title=\"…\">…</a></p>`", after: "`figure.doc-bookmark`", rule: "Kit blocks" },
    },
  },
};

/** A bookmark's card, once it has a link. */
export const cardOf = (figure) => figure.querySelector(":scope > a.doc-bookmark-card[data-ge-href]");

// What a new bookmark is written with: its page, title, description, icon and cover (the files, not
// where the preview serves them) and its caption.
// (Its page is what the card links to: data-ge-href on one made on the page, its href as the file has it on one
// served, whose web address the preview leaves as it is: render/media-ref.mjs marks files of the folder alone.)
function bookmarkNode(figure, serializeInner = null) {
  const card = figure.querySelector(":scope > a.doc-bookmark-card");
  const text = (selector) => card?.querySelector(selector)?.textContent ?? "";
  const file = (selector) => fileOf(card?.querySelector(selector), "src");
  return {
    href: fileOf(card, "href") ?? card?.getAttribute("href") ?? "",
    title: text(".doc-bookmark-title"),
    description: text(".doc-bookmark-description"),
    icon: file(".doc-bookmark-icon"),
    cover: file(".doc-bookmark-cover > img"),
    caption: captionWords(figure, serializeInner),
  };
}

// What a bookmark's description must be (file.mjs, the server's, takes it so): a web page, words of one line, pictures of the folder.
const WEB = /^https?:\/\/[^\s"<>]+$/;
const plain = (value, max) => typeof value === "string" && value.length <= max && !/[\u0000-\u001f]/.test(value);
const picture = (value) => value === null || value === undefined || imageFile(value);

// The address a page's card shows when the page gave no title: its host.
const hostOf = (url) => {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
};

/**
 * The card of a page (`page`: { url, title, description, icon, cover }, the images files of the
 * report's folder served at `assetUrl`), and a caption holding `caption` (the page's own markup).
 */
export function cardParts(doc, page, assetUrl, caption = "") {
  const node = (tag, className, text = null) => {
    const element = doc.createElement(tag);
    if (className) element.className = className;
    if (text !== null) element.textContent = text;
    return element;
  };
  const picture = (path, className = "") => {
    const img = node("img", className);
    showFile(img, "src", path, assetUrl(path));
    img.alt = "";
    img.draggable = false;
    return img;
  };
  const card = node("a", "doc-bookmark-card");
  showFile(card, "href", page.url, page.url); // the page the card stands for
  card.target = "_blank";
  card.rel = "noopener noreferrer";
  card.setAttribute("contenteditable", "false");
  card.draggable = false;
  const text = node("span", "doc-bookmark-text");
  text.append(node("span", "doc-bookmark-title", page.title?.trim() || hostOf(page.url)));
  if (page.description) text.append(node("span", "doc-bookmark-description", page.description));
  const address = node("span", "doc-bookmark-url");
  if (page.icon) address.append(picture(page.icon, "doc-bookmark-icon"));
  address.append(node("span", "doc-bookmark-href", page.url));
  text.append(address);
  card.append(text);
  if (page.cover) {
    const cover = node("span", "doc-bookmark-cover");
    cover.append(picture(page.cover));
    card.append(cover);
  }
  return [card, captionNode(doc, caption)];
}

/** A new bookmark (the "/" menu's 网页书签): its placeholder (添加 Web 书签), until a link is given (page.mjs). */
export const newBookmark = (doc) => newMediaFigure(doc, "bookmark", placeholder());
