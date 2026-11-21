import { ICONS } from "../../page/menu.mjs";
import { svg } from "../icons.mjs";
import { TOOL_ICONS } from "../media/icons.mjs";
import { captionOf, fileOf } from "../media/parts.mjs";
import { BOOKMARK_ICON, cardOf, cardParts, newBookmark } from "./index.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// 网页书签 on the page. A new bookmark
// (the "/" menu's 网页书签, made from an empty block: convert.mjs) is a placeholder, a gray bar saying
// 添加 Web 书签, until a link is given in the menu that opens below it at once and on a click
// (../media/page.mjs; 300px, no tabs: 以 https://… 格式粘贴, 创建书签); meanwhile it says 获取预览中…. The server reads the
// page (POST /__gallery/edit/unfurl) and keeps its icon and cover in the report's folder; the card
// then shows its title (the page's host when it has none), description, address and cover. A page
// that cannot be read still makes a card (its host as its title). One undo step. A click on the card
// opens the page in a new tab, as in the report. The block menu has 标题, 显示为 ›, 拷贝原始链接 and 刷新预览.

// 显示为 › (a card, and the text it may be again).
const SHOW_AS_ICON = svg('<rect x="3.25" y="4.25" width="13.5" height="7.5" rx="1.75"/><path d="M3.5 15.25h3M9 15.25h7.5"/>');

/**
 * Bookmarks on the page, with what the editor gives them: the media blocks' shared parts (`pages.media`:
 * ../media/page.mjs block("bookmark"): the undo steps, say, select, the menu, the caption),
 * assetUrl(path), unfurl(url) (POST /__gallery/edit/unfurl: the page's bookmark) and
 * showAs(figure, link) (its link shown in the text again, links/views.mjs: the rows of 显示为 ›).
 */
export function create({ pages, assetUrl, unfurl, showAs }) {
  const media = pages.media.block("bookmark");
  const { say } = media;

  /** The link menu of a bookmark, below it. */
  const pick = (figure) => media.pick(figure, {
    tabs: [{ key: "link", label: t("书签") }],
    width: 300,
    link: { placeholder: t("以 https://… 格式粘贴"), button: t("创建书签"), caption: t("从链接创建可视化书签。"), invalid: t("请输入有效的链接") },
    onEmbed: (url) => read(figure, url),
  });

  // The page read, the card made (with what could be had of it).
  async function read(figure, url, options = {}) {
    media.busy(figure, t("获取预览中…"));
    let page;
    try {
      page = await unfurl(url);
    } catch (error) {
      page = { url, title: "", description: "", icon: null, cover: null };
      say(t("无法获取网页预览：{0}", error.message), "note");
    }
    place(figure, page, options);
  }

  // The card in: a new bookmark in the place of the placeholder (or of the bookmark read again, with
  // its caption), never the same element, so that undo brings back what stood there. One undo step;
  // the bookmark selected.
  function place(figure, page, { pasted = false } = {}) {
    if (!figure.isConnected) return;
    const doc = figure.ownerDocument;
    const again = Boolean(cardOf(figure));
    const next = newBookmark(doc);
    next.replaceChildren(...cardParts(doc, page, assetUrl, captionOf(figure)?.innerHTML ?? ""));
    media.place(figure, next, { replacing: again, pasted });
    if (again) say(t("已刷新网页预览 · Ctrl+Z 撤销"));
  }

  async function copyLink(figure) {
    try {
      await navigator.clipboard.writeText(fileOf(cardOf(figure), "href") ?? "");
      say(t("已将链接拷贝到剪贴板"));
    } catch {
      say(t("无法拷贝链接"), "error");
    }
  }

  /** A bookmark's rows in its block menu. */
  function menuItems(target) {
    const card = target?.matches?.("figure.doc-bookmark") ? cardOf(target) : null;
    if (!card) return [];
    return [
      { label: t("标题@caption"), icon: TOOL_ICONS.caption, run: () => setTimeout(() => media.caption(target)) },
      { label: t("拷贝原始链接"), icon: BOOKMARK_ICON, run: () => copyLink(target) },
      { label: t("刷新预览"), icon: ICONS.reset, run: () => read(target, fileOf(card, "href")) },
      // 显示为 ›: the link in the text again, as one of its views (a card is one of them).
      { label: t("显示为"), icon: SHOW_AS_ICON, width: 168, submenu: () => showAs(target, linkOf(target)) },
    ];
  }

  // What its card says: { href, title, icon } (its icon a file of the report's folder).
  const linkOf = (figure) => {
    const card = cardOf(figure);
    return { href: fileOf(card, "href") ?? "", title: card?.querySelector(".doc-bookmark-title")?.textContent ?? "", icon: fileOf(card?.querySelector(".doc-bookmark-icon"), "src") };
  };

  return {
    pick, menuItems,
    /** A new one: its link given next. */
    onCreated(figure) {
      pick(figure);
      return true;
    },
    /** A bookmark of `page` ({ url, title, description, icon, cover }), whole, not yet on the page (links/views.mjs). */
    fromPage(page) {
      const figure = newBookmark(document);
      figure.replaceChildren(...cardParts(document, page, assetUrl));
      return figure;
    },
    /** A bookmark of the page at `url` in the place of `figure` (an embed of a page that refuses frames). */
    fromLink: (figure, url, options) => read(figure, url, options),
  };
}
