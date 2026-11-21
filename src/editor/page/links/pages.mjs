import { workspaceAddress } from "../../../shared/workspace-address.mjs";
import { iconUrl } from "../../../shared/emoji/icon-value.mjs";
import { escapeAttribute } from "../../../shared/escape.mjs";
import { addressOn, decoded, hashAddress } from "../../../shared/page-address.mjs";
import { DOCS, isTop, topOf } from "../../../shared/outline-shape.mjs";
import { entryOfKey } from "../../../shared/extension-sidebar.mjs";
import { inTrash, namedLinks, pageLink, pageLinks } from "../../../shared/page-links.mjs";
import { PAGE_ICON } from "../../components/icons.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// The documents of the workspace, as a link's card, a page block's box and "@" look for them
// (docs/editor.md, "Links"): one search for the three. The list is read once for each opening from
// what the workbench reads itself (GET /__gallery/workspace/outline: no route of its own, nothing
// pushed), in the sidebar's order, column after column (栏: shared/outline-shape.mjs), each document with
// the title of the one above it in the sidebar; 写作偏好 is no page to link to, nor is a web link of the
// sidebar (kind "link": no file of its own to link to; the documents under one are pages all the same) or a
// draft of another workspace (kind "draft": its file is that workspace's, which no relative link reaches),
// and this page has the title it shows now, not the one last saved. A list that cannot be read is no
// results, and the field goes on taking addresses.
//
// What a copy writes is an address by a page's link, and a copy cannot wait for an answer: the
// clipboard takes a write only in the click itself. So the page holds the list ready, the last one
// read by any of these (holdPages reads one as the page starts, as it gets the focus and as a block's
// menu opens), and goes by it with the title it shows now (heldList), saved or not. This page has its
// link whatever the list says. Another page, until the first answer comes, a moment as the page opens,
// or for as long as the server cannot be reached, goes by its page id, which opens it all the same.
//
// A title is matched as it is written, without pinyin: it starts with what is typed, or one of its
// words does, or it holds it, or it holds its characters in their order (what makes it fuzzy), and
// within each of those the sidebar's order stands. No words typed is the sidebar's order.

const OUTLINE = "/__gallery/workspace/outline";
const TRASH = "/__gallery/workspace/trash";
const MOST = 6; // rows of a search

let held = null; // the list as last read
let shown = () => null; // this page, as readPages takes it

/**
 * The workspace's documents: { pages: [{ slug, title, icon, parent }] (`parent`: the title of the one
 * it is under, or null), links: their links (shared/page-links.mjs), trash: what the trash holds but web links }, or
 * null when the list cannot be read (`webs`: the links of the sidebar's web links, which are no pages). `own`: this page, { slug, title } as it shows it.
 */
export async function readPages(own = null) {
  const listed = await fetch(workspaceAddress(OUTLINE)).then((answer) => answer.json()).catch(() => null);
  if (!listed?.reports) return null;
  const titleOf = (slug) => (slug === own?.slug && own.title ? own.title : listed.reports[slug]?.title);
  const pages = [];
  const walk = (parent) => {
    for (const slug of listed.outline?.children?.[parent] ?? []) {
      const report = listed.reports[slug];
      if (!report || report.instructions) continue;
      // An untitled document is named 未命名文档, as the workbench names it (its link's words: its page id alone).
      if (report.kind !== "link" && report.kind !== "draft") pages.push({ slug, title: titleOf(slug) || t("未命名文档"), icon: report.icon ?? null, parent: isTop(parent) ? null : titleOf(parent) || t("未命名文档") });
      walk(slug);
    }
  };
  for (const { id } of listed.outline?.groups ?? [{ id: DOCS }]) walk(topOf(id));
  // The sidebar's web links, by their links as a workbench's hash holds them: no page to link to, but an address the workbench opens.
  const web = Object.values(listed.reports).filter((report) => report.kind === "link").map(({ slug, title }) => ({ slug, title }));
  // And the extensions' columns (their entries: an address #~<id>/<entry id> the workbench opens too).
  held = { pages, links: pageLinks(pages.map(({ slug }) => ({ slug, title: titleOf(slug) }))), webs: pageLinks(web), extensions: listed.extensions ?? [], trash: (listed.trash ?? []).filter(({ kind }) => kind !== "link") };
  return held;
}

/** Read the list for what cannot wait for it. `own`: what readPages takes of this page, asked for each time, as its title may be changing. */
export function holdPages(own) {
  shown = own;
  readPages(own());
}

/** The list held, as a list readPages gives it with `named` (shared/page-links.mjs namedLinks) and this page by the title it shows now: with no list read yet, its link and no pages. */
export function heldList() {
  const { slug, title } = shown() ?? {};
  const pages = (held?.pages ?? []).map((page) => (page.slug === slug && title ? { ...page, title } : page));
  const links = new Map(held?.links);
  if (title) links.set(slug, pageLink({ slug, title }));
  const trash = held?.trash ?? [];
  return { pages, links, trash, named: namedLinks(links, trash) };
}

/** Whether document `slug` is in the workspace's trash (not when the trash cannot be read). */
export async function trashed(slug) {
  const listed = await fetch(workspaceAddress(TRASH)).then((answer) => answer.json()).catch(() => null);
  return inTrash(listed?.entries ?? [], slug);
}

const LETTER = /[\p{L}\p{M}\p{N}]/u;

// Whether a word of `title` starts with `query`: somewhere it stands with no letter or number before it.
function startsWord(title, query) {
  for (let at = title.indexOf(query); at >= 0; at = title.indexOf(query, at + 1)) if (at === 0 || !LETTER.test(title[at - 1])) return true;
  return false;
}

// Whether the characters of `query` stand in `title`, in their order.
function inOrder(title, query) {
  let at = 0;
  for (const character of query.replace(/\s/g, "")) {
    at = title.indexOf(character, at);
    if (at < 0) return false;
    at += character.length;
  }
  return true;
}

// How well `title` matches `query` (both in lower case), the lower the better; null for not at all.
function rank(title, query) {
  if (title.startsWith(query)) return 0;
  if (startsWord(title, query)) return 1;
  if (title.includes(query)) return 2;
  return inOrder(title, query) ? 3 : null;
}

/** The first of `pages` (readPages) whose titles match `query`, best first; with no words, the first of them. */
export function findPages(pages, query) {
  const wanted = query.trim().toLowerCase();
  if (!wanted) return pages.slice(0, MOST);
  return pages.map((page) => [page, rank(page.title.toLowerCase(), wanted)]).filter(([, score]) => score !== null).sort((a, b) => a[1] - b[1]).slice(0, MOST).map(([page]) => page);
}

/**
 * The page of `list` (readPages) that `text` is the address of, with the block it names: a page's
 * fields and `block`, or null. On top of every form of shared/page-address.mjs, #<link or
 * slug>[/<block id>], what a workbench's hash holds.
 */
export function placeIn(list, text) {
  const place = text.startsWith("#") ? hashAddress(decoded(text.slice(1)), list.links) : addressOn(text, list.links, globalThis.location?.origin);
  const page = place && list.pages.find(({ slug }) => slug === place.slug);
  return page ? { ...page, block: place.block } : null;
}

/**
 * Whether workbench hash `hash` (no #) names a web link of the sidebar, or an entry of an extension's
 * column that has an address (#~<id>/<entry id>): the workbench opens it in its content area, though it
 * is no page to link to.
 */
export const webLinkIn = (list, hash) => Boolean(hashAddress(decoded(hash), list.webs) || entryOfKey(list.extensions, decoded(hash))?.url);

/** The title of the page `text` is an address of, of `list` or of its trash, or null: what stands for a link to it where its address would be a folder's. */
export function titleIn(list, text) {
  const binned = addressOn(text, pageLinks(list.trash), globalThis.location?.origin)?.slug;
  return placeIn(list, text)?.title ?? list.trash.find(({ slug }) => slug === binned)?.title ?? null;
}

/** A page's icon, as markup: by the icon route (each icon its own color), the page's line drawing for one with none. */
export const pageIcon = ({ icon, slug }) => (icon ? `<img src="${escapeAttribute(iconUrl(icon, slug, { tab: true }))}" alt="" draggable="false">` : PAGE_ICON);

/** The pages `found`, as rows of a menu (menu.mjs): each its icon, its title and in gray the page it is under; choose(page) runs for the row chosen. */
export const pageRows = (found, choose) => found.map((page) => ({ label: page.title, hint: page.parent, long: true, icon: pageIcon(page), run: () => choose(page) }));
