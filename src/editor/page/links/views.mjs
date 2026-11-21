import { Z } from "../../../shared/layers.mjs";
import { can, isMention, mentionOf, newMention, ownHTML } from "../core.mjs";
import { caretAt, editable, select } from "../caret.mjs";
import { build } from "../clipboard/own/index.mjs";
import { createMenu } from "../menu.mjs";
import { besideText, textAnchor } from "../placement.mjs";
import { LINK_ICON, PAGE_ICON, svg } from "../../components/icons.mjs";
import { TYPE_INFO } from "../../components/registry.mjs";
import { pageOfType } from "../page-objects.mjs";
import { addStyle, element, mount } from "../ui.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { iconUrl } from "../../../shared/emoji/icon-value.mjs";
import { elsewhere, fileLink, isPageAddress } from "../../../shared/page-address.mjs";

// The views of a link to a web page (docs/editor.md, "Links"), four:
//   链接视图  the address as the link's text
//   标题视图  the page's title as the link's text (a link as any other)
//   图标视图  the site's icon and the page's title, a whole in the text (a chip, as a formula is:
//             core.mjs newMention; shared/components/mention.mjs)
//   书签视图  a 网页书签 block in the link's place: the text before it stays in its block, the text
//             after it goes on in a paragraph after the bookmark, a block left empty goes
//             (clipboard/ blocksAt)
// The link card's view button (index.mjs) and a bookmark's block menu (显示为 ›) switch between them;
// an address pasted alone, or given to the "/" menu's 链接, is a link of 链接视图 first, with its
// views offered (offerViews), 链接视图 highlighted: after a paste
// 选择视图, where the format bar stands for selected text, after the "/" menu 显示为 at the link's
// end; Esc, a press elsewhere or typing on closes it, the link staying. Our own address pasted is
// a link to a document (标题视图, by the document's title from the list of pages, no web page being
// read) and its 选择视图 offers that or 页面块, a whole in the text as 图标视图 is, of the same element
// (pageChip): no 链接视图 or 书签视图, which are a web page's. The server reads the page
// (POST /__gallery/edit/unfurl: only its title for 标题视图; its icon too, kept in the report's
// folder, for 图标视图; everything for a bookmark), a spinner after the link meanwhile; a page that
// cannot be read gives its host as the title (said: 暂不支持获取该网站的预览信息), a globe for the
// icon. Titles are cut at 100 characters. Each switch is one undo step. connectViews() gives the
// views what they need from the editor.

const STYLE = `
  /* Placed by left and top, so that it turns about its own middle (a translate with it would swing it round the corner of the window). */
  .ge-link-spin { position: fixed; z-index: ${Z.spin}; width: 12px; height: 12px; box-sizing: border-box; pointer-events: none;
    border: 1.5px solid light-dark(rgb(55 53 47 / 45%), rgb(255 255 255 / 45%)); border-right-color: transparent; border-radius: 50%; animation: ge-link-spin .7s linear infinite; }
  @keyframes ge-link-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
`;

/** The views, in their menu's order (图标视图 after 标题视图), with their names and icons. */
export const VIEWS = {
  link: { label: t("链接视图"), icon: LINK_ICON },
  title: { label: t("标题视图"), icon: svg('<path d="M3 10h2.25M8 10h9"/>') },
  icon: { label: t("图标视图"), icon: svg('<circle cx="5.5" cy="10" r="2.5"/><path d="M10.5 10h6.5"/>') },
  bookmark: { label: t("书签视图"), icon: TYPE_INFO.bookmark?.icon },
};

/** The rows of a link to a document, offered after a paste. */
const PAGE_VIEWS = {
  title: VIEWS.title,
  chip: { label: t("页面块"), icon: PAGE_ICON },
};

const WEB = /^https?:\/\/[^\s"<>]+$/i;
const TITLE_MAX = 100;

let use = null; // { say, recordStep, struct, slug, unfurl(url, parts), assetUrl(path), blocksAt(host, range, made, kinds) }

export function connectViews(editor) {
  use = editor;
  addStyle(STYLE);
}

export const hrefOf = (link) => link.getAttribute("href") ?? "";

/** Whether a link has views: one to a web page (not a detail card's entry, not an anchor, not a document of the workspace: an address on another server may be another program's, a web page like any). */
export const hasViews = (link) => WEB.test(hrefOf(link)) && (!isPageAddress(hrefOf(link)) || elsewhere(hrefOf(link), location.origin)) && !link.classList.contains("doc-dialog-trigger");

/** Whether a link is a page block: a chip whose address is a document's, not a web page's. */
export const isPageChip = (link) => isMention(link) && !WEB.test(hrefOf(link));

/**
 * The page block of `page` (pages.mjs placeIn): written with the title it has now and an empty icon, as
 * its file holds it, and showing its icon by the icon route as the server draws it.
 */
export const pageChip = (page) => newMention(document, { href: fileLink(page, use.slug), title: page.title, drawn: page.icon ? iconUrl(page.icon, page.slug, { tab: true }) : null }, use.assetUrl);

/** The view a link is in: a chip is 图标视图; a link whose text is its address 链接视图; else 标题视图. */
export function viewOf(link) {
  if (isMention(link)) return "icon";
  const href = hrefOf(link);
  const text = link.textContent.trim();
  const plain = (value) => {
    try {
      return decodeURI(value);
    } catch {
      return value;
    }
  };
  return text === href || plain(text) === plain(href) || text === href.replace(/^https?:\/\//i, "") ? "link" : "title";
}

/** The views a link can be switched to where it stands (a bookmark only from a block that splits). */
export function viewsOf(link) {
  const host = editable(link);
  return Object.keys(VIEWS).filter((view) => view !== "bookmark" || (pageOfType(view)?.fromPage && host && can(host, "split")));
}

/** The host of an address (the address itself when it is none). */
export const hostOf = (url) => {
  try {
    return new URL(url).hostname || url;
  } catch {
    return url;
  }
};

/** A page's title for a link: its spaces as one, at most 100 characters (else its host). */
export function linkTitle(title, href) {
  const characters = [...String(title ?? "").replace(/\s+/g, " ").trim()];
  if (characters.length === 0) return hostOf(href);
  return characters.length > TITLE_MAX ? `${characters.slice(0, TITLE_MAX).join("")}…` : characters.join("");
}

// ---------- reading the page ----------

// A spinner after the link while its page is read (drawn over the page, so no snapshot of the text
// holds it), only once the reading takes a moment (no flash for a quick answer).
function spinner(link) {
  const node = mount(element("div", { class: "ge-link-spin", "data-doc-dev": "" }));
  node.style.visibility = "hidden";
  const shown = setTimeout(() => { node.style.visibility = ""; }, 200);
  const place = () => {
    const rect = [...link.getClientRects()].at(-1);
    if (!rect || !link.isConnected) return void (node.style.display = "none");
    node.style.display = "";
    node.style.left = `${Math.round(rect.right + 4)}px`;
    node.style.top = `${Math.round(rect.top + (rect.height - 12) / 2)}px`;
  };
  place();
  addEventListener("scroll", place, { passive: true, capture: true });
  return () => {
    clearTimeout(shown);
    removeEventListener("scroll", place, { capture: true });
    node.remove();
  };
}

// What the server read of the page (`parts`: "title", "icon" or "all"); `unread` when it gave
// nothing (UNREAD), said with the switch.
async function read(link, href, parts) {
  const stop = spinner(link);
  try {
    const page = await use.unfurl(href, parts);
    return { ...page, unread: !page.title && !page.icon };
  } catch {
    return { title: "", description: "", icon: null, cover: null, unread: true };
  } finally {
    stop();
  }
}
const UNREAD = t("暂不支持获取该网站的预览信息");

// ---------- switching ----------

// `next` (made by `make`, or the link itself changed) in the link's place: one undo step. The
// caret, when it was in the link, goes after it. No space goes beside it (a link shown with its
// icon stands as the text put it).
function replace(host, link, make, message) {
  const before = ownHTML(host);
  const next = make();
  if (next !== link) link.replaceWith(next);
  const selection = getSelection();
  if (selection.rangeCount && !selection.getRangeAt(0).startContainer.isConnected) {
    const after = document.createRange();
    after.setStartAfter(next);
    after.collapse(true);
    select(after);
  }
  use.recordStep(host, before);
  use.say(t("{0} · Ctrl+Z 撤销", message));
  return next;
}

// A plain link to `href` showing `text`.
function textLink(href, text) {
  const link = document.createElement("a");
  link.setAttribute("href", href);
  link.textContent = text;
  return link;
}

// A plain link of `text`: the link itself when it is one (its text changed), else a new one.
const plainLink = (link, href, text) => () => {
  if (isMention(link)) return textLink(href, text);
  link.replaceChildren(text);
  return link;
};

/**
 * Show `link` (a link of the text, or a chip) as `view`. Reads the page where the view wants what
 * is not known yet; nothing happens when the link has changed meanwhile.
 */
export async function switchView(link, view) {
  const host = editable(link);
  if (!host || !link.isConnected || !hasViews(link)) return;
  const from = viewOf(link);
  if (view === from) return;
  const href = hrefOf(link);
  if (view === "link") return replace(host, link, plainLink(link, href, href), t("已转为链接视图"));
  // A chip's own title, when only that is wanted.
  let page = view === "title" && from === "icon" ? { title: mentionOf(link).title, unread: false } : null;
  if (!page) {
    page = await read(link, href, view === "bookmark" ? "all" : view === "icon" ? "icon" : "title");
    if (!link.isConnected || hrefOf(link) !== href || editable(link) !== host) return;
  }
  const title = linkTitle(page.title, href);
  const said = (done) => (page.unread ? t("{0}，{1}", UNREAD, done) : done);
  if (view === "title") return replace(host, link, plainLink(link, href, title), said(page.unread ? t("标题用了网址的域名") : t("已转为标题视图")));
  if (view === "icon") return replace(host, link, () => newMention(document, { href, title, icon: page.icon ?? null }, use.assetUrl), said(page.unread ? t("用了网址的域名") : t("已转为图标视图")));
  const figure = pageOfType(view).fromPage({ url: href, title: page.title ?? "", description: page.description ?? "", icon: page.icon ?? null, cover: page.cover ?? null });
  const range = document.createRange();
  range.selectNode(link);
  if (use.blocksAt(host, range, [figure], ["bookmark"])) use.say(t("{0} · Ctrl+Z 撤销", said(t("已转为网页书签"))), page.unread ? "note" : undefined);
}

/**
 * A link shown with its icon given another address (its card's field): the web page read again, shown
 * so. A document's (`listed`: the page) is a page block; any other address that is no web page's has
 * no icon to read and stays a link of the chip's title.
 */
export async function refetch(chip, href, listed = null) {
  const host = editable(chip);
  if (!host) return;
  if (listed) return replace(host, chip, () => pageChip(listed), t("链接：{0}", listed.title));
  if (!WEB.test(href)) return replace(host, chip, () => textLink(href, mentionOf(chip).title), t("链接：{0}", href));
  const page = await read(chip, href, "icon");
  if (!chip.isConnected || editable(chip) !== host) return;
  replace(host, chip, () => newMention(document, { href, title: linkTitle(page.title, href), icon: page.icon ?? null }, use.assetUrl), page.unread ? t("{0}，用了网址的域名", UNREAD) : t("链接：{0}", href));
}

/**
 * A bookmark's 显示为 › (its block menu): its link in the text again, in a paragraph in its place,
 * the caret at its end; one undo step.
 */
export function bookmarkItems(figure, { href, title, icon }) {
  return Object.entries(VIEWS).map(([view, { label, icon: drawn }]) => ({
    label, icon: drawn, current: view === "bookmark",
    run: () => {
      if (view === "bookmark" || !figure.isConnected || !WEB.test(href)) return;
      const text = linkTitle(title, href);
      const link = view === "icon" ? newMention(document, { href, title: text, icon }, use.assetUrl) : textLink(href, view === "link" ? href : text);
      const paragraph = build(document, { type: "paragraph", html: "" });
      paragraph.append(link);
      const done = use.struct([figure.parentElement], [], () => {
        figure.replaceWith(paragraph);
        return { touched: [paragraph], focus: paragraph, created: [] };
      });
      if (!done) return;
      caretAt(paragraph, "end");
      use.say(t("已转为{0} · Ctrl+Z 撤销", label));
    },
  }));
}

// ---------- the menus ----------

// One menu for both, made when first needed (the module loads where there is no page too).
let card = null;
const menu = () => (card ??= createMenu());
let offer = null; // { link, keys, press, typed, moved }: a link's views, offered

/** The views of `link` as menu items (the card's view button), the current one checked; `done()` runs first. */
export function viewItems(link, done = () => {}) {
  const current = viewOf(link);
  return viewsOf(link).map((view) => ({
    label: VIEWS[view].label, icon: VIEWS[view].icon, current: view === current,
    run: () => {
      done();
      switchView(link, view);
    },
  }));
}

// The keys of a views menu: ↑/↓ and Enter in it (Enter with no row highlighted goes on), Esc closes
// it (`close`); any other key closes it and goes on. On the window, so that they come before the
// editor's own (on the document).
const menuKeys = (close) => (event) => {
  if (event.isComposing) return;
  if (!menu().arrow(event)) {
    if (event.key === "Escape") close();
    else if (event.key !== "Enter" || !menu().choose()) {
      if (!["Shift", "Control", "Alt", "Meta"].includes(event.key)) close();
      return;
    }
  }
  event.preventDefault();
  event.stopPropagation();
};

/** The views menu below `rect` (the card's view button); `done()` before a pick, `onClose()` when it goes. */
export function openViews(link, rect, done, onClose = () => {}) {
  closeOffer();
  const keys = menuKeys(() => card?.close());
  menu().open(viewItems(link, done), rect, {
    label: t("显示为"), width: 168, highlight: false,
    onClose: () => {
      removeEventListener("keydown", keys, true);
      onClose();
    },
  });
  addEventListener("keydown", keys, true);
}

export const closeViews = () => card?.close();

/**
 * The views of a link just made of an address alone: `pasted`, 选择视图 where the format bar would
 * stand if its words were selected; else (the "/" menu's 链接) 显示为 at its end. `page`: a link to
 * that document (pages.mjs placeIn), whose views are PAGE_VIEWS.
 */
export function offerViews(link, { pasted = false, page = null } = {}) {
  if (!link.isConnected || !(page || hasViews(link))) return;
  closeOffer();
  const end = () => {
    const rect = [...link.getClientRects()].at(-1);
    return rect && { left: rect.right, right: rect.right, top: rect.top, bottom: rect.bottom };
  };
  const rect = end();
  if (!rect) return;
  const label = pasted ? t("选择视图") : t("显示为");
  const words = document.createRange();
  words.selectNodeContents(link);
  const items = [{ title: label }, ...(page ? Object.keys(PAGE_VIEWS) : viewsOf(link)).map((view) => ({
    label: (page ? PAGE_VIEWS : VIEWS)[view].label, icon: (page ? PAGE_VIEWS : VIEWS)[view].icon,
    run: () => {
      closeOffer();
      if (view === "chip") replace(editable(link), link, () => pageChip(page), t("已转为页面块"));
      else if (!page && view !== "link") switchView(link, view);
    },
  }))];
  menu().open(items, rect, { label, width: 200, stand: pasted ? (size) => besideText(textAnchor(words), size) : null, onClose: () => closeOffer() });
  const keys = menuKeys(closeOffer);
  const press = (event) => {
    if (!menu().contains(event.target)) closeOffer();
  };
  // Text typed (an input method's too, which may send no key first) closes it.
  const typed = () => closeOffer();
  // It goes with its link as the page moves, as the format bar goes with its text.
  const moved = () => menu().follow(end());
  addEventListener("keydown", keys, true);
  addEventListener("pointerdown", press, true);
  addEventListener("beforeinput", typed, true);
  addEventListener("scroll", moved, { passive: true, capture: true });
  addEventListener("resize", moved);
  offer = { link, keys, press, typed, moved };
}

export function closeOffer() {
  if (!offer) return;
  const { keys, press, typed, moved } = offer;
  offer = null;
  removeEventListener("keydown", keys, true);
  removeEventListener("pointerdown", press, true);
  removeEventListener("beforeinput", typed, true);
  removeEventListener("scroll", moved, { capture: true });
  removeEventListener("resize", moved);
  card?.close();
}

/** Whether a node is in a views menu; the nodes to keep in the top layer when a dialog opens. */
export const viewsHold = (target) => Boolean(card?.contains(target));
export const viewNodes = () => card?.nodes ?? [];
