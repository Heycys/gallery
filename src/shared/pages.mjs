import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { escapeMarkup, escapeText } from "./escape.mjs";
import { fileLanguage, fileWords, htmlLang } from "./file-language.mjs";
import { writeAtomic } from "./files.mjs";
import { laidOut } from "./json-layout.mjs";
import { readStoredHead, withOutlineLock, writeHead } from "./outline.mjs";
import { newPageId } from "./page-links.mjs";
import { headOrder, headPage, headWithPage } from "./sidebar-head.mjs";
import { DOCUMENT_FOLDERS, isSlugName, keptName, layoutOf, listTrash, markerOf, slugPattern, slugTaken } from "./workspace.mjs";

// A workspace's custom pages (自定义页, since 2026-11-07): a page is a folder pages/<slug>/ at the workspace's root, as
// components/ is, holding page.html (the page an Agent writes, free HTML: its head, its look, its own
// scripts and frames, and where it wants them one or more boards, <div class="gallery-board">, of
// cards, each <section class="gallery-card" data-card-id data-x data-y data-w data-h> around one
// instance of a custom block) and page.json ({ title, icon, defaultCards?, hint? }: pageMetaOf). An Agent
// makes one (gallery page new), and the workbench's 新建页面 a blank one (blankPageHtml) for an Agent to
// write; the workbench lists them in the sidebar's head with 新建 and 搜索, in the order the reader drags
// them to (./sidebar-head.mjs, kept in the outline file), shows one at #@<slug> and renames or trashes
// it (src/workbench/service.mjs). A page's slug and a document's are one pool (./workspace.mjs
// slugTaken): no new document takes a page's, nor a new page a document's, and `pages` is a name no new
// document takes. The blocks' scripts and styles are put in by the server as it shows a page
// (src/render/page-html.mjs).
// No page is special by its slug. The default home page (首页, homeTitle(), at pages/home, holding a card of
// each of HOME_CARDS) is a page like any other, made once per workspace by src/editor/home-page.mjs, as
// the server starts and by gallery init (gallery.json's pages.homeMade says it was: markHomeMade; nothing
// makes it again), whose page.json says what any page's may: it has the default cards (defaultCards:
// 恢复默认卡片 in its menu, the note of the default cards it has not got), and its first-open note
// (hint, until the reader closes it: pageHintClosed).
// Node's built-ins only, but ./escape.mjs, ./file-language.mjs, ./files.mjs, ./json-layout.mjs, ./outline.mjs, ./sidebar-head.mjs
// and ./workspace.mjs.

/** A custom page's two files. */
export const PAGE_FILES = { html: "page.html", json: "page.json" };
/** The slug of the default home page (首页), which src/editor/home-page.mjs makes: a page as any other. */
export const HOME = "home";
/** The default home page's title in each language Gallery writes files in (file-language.mjs): 首页 for a Chinese system, Home for any other. */
export const HOME_TITLES = { zh: "首页", en: "Home" };
/** The title a default home page made now gets: HOME_TITLES in the file language (file-language.mjs). A home page already made keeps its title. */
export const homeTitle = (language = fileLanguage()) => fileWords(HOME_TITLES, language);
/**
 * The blocks of the default home page's cards (laid out as the pack Gallery 风格's home page, since
 * 2026-11-09: 问候与日期, 天气, 倒计时, 习惯打卡, 工作区统计, 我的待办, 编辑热力图,
 * 最近编辑, 便签, 静态卡片), in the order they are placed, each at the first free spot by its size (HOME_SIZES',
 * else its block's default: shared/board-places.mjs freeSpot), a home of 12 x 12 cells, none left empty;
 * 恢复默认卡片 (the page service's restore-defaults) puts back those of them no card of the home page holds.
 */
export const HOME_CARDS = Object.freeze(["gallery/today", "gallery/weather", "gallery/countdown", "gallery/habit", "gallery/stats", "gallery/todos", "gallery/heatmap", "gallery/recent", "gallery/note", "gallery/static"]);
/** The default home page's cards that are not their block's default size, [w, h] each. */
export const HOME_SIZES = Object.freeze({ "gallery/habit": [2, 2], "gallery/todos": [4, 6], "gallery/note": [4, 4] });
/**
 * The default cards a home page made before the workspace's data came had (问候与日期
 * and 便签): what a home whose hints say nothing of its cards was told of, so that it is told once of the
 * others (homeCardsTold, the home page's note of new cards).
 */
export const FIRST_HOME_CARDS = Object.freeze(["gallery/today", "gallery/note"]);
/** The board a new page has, and the board gallery page add puts a card on when none is named. */
export const FIRST_BOARD = "main";
/** Whether `name` is one of a custom page's own files. */
export const isPageFile = (name) => name === PAGE_FILES.html || name === PAGE_FILES.json;

/**
 * Where custom page `slug` is: <root>/pages/<slug>/, and its two files and its own files' folder
 * (assets/, which the server serves at /pages/<slug>/assets/<file>). Where pages/ has no folder of
 * that name, a scratch copy's of .gallery/try/ that holds a page.html (gallery page try's and gallery
 * page check's, try-<8 hex>: src/cli/page-try.mjs, served and written as any page's, listed nowhere,
 * gone once its command ends), as a document's slug finds one (workspace.mjs documentDirectory).
 */
export function pageFiles(slug, root) {
  const { customPages, scratch } = layoutOf(root);
  const own = path.join(customPages, slug);
  const copy = path.join(scratch, slug);
  const folder = !existsSync(own) && existsSync(path.join(copy, PAGE_FILES.html)) ? copy : own;
  return { folder, html: path.join(folder, PAGE_FILES.html), json: path.join(folder, PAGE_FILES.json), assets: path.join(folder, PAGE_ASSETS) };
}

/** The folder of a custom page's own files (pictures a card shows), in its folder: served at /pages/<slug>/assets/<file>. */
export const PAGE_ASSETS = "assets";

/** Where the server serves file `value` of custom page `slug`'s assets/ (`value`: assets/<file>, as a page writes it). */
export const pageAssetAddress = (slug, value) => `/pages/${slug}/${value}`;

/** Whether custom page `slug` is there: its folder holds page.html. */
export const pageExists = (slug, root) => isSlugName(slug) && existsSync(pageFiles(slug, root).html);

/**
 * Why `slug` names no new custom page in workspace `root`, or null: not lowercase kebab-case; a name
 * the workspace keeps (exports, components, pages…); assets or materials, which a document called
 * pages keeps in that folder; taken by a document, the 写作偏好 page or another custom page (one pool,
 * ./workspace.mjs slugTaken); a slug the trash holds, whose address would open the new page.
 */
export async function pageSlugRefused(slug, root) {
  if (typeof slug !== "string" || !slugPattern.test(slug)) return `"${slug}" is no slug: lowercase letters, digits and single hyphens (reading-list).`;
  if (keptName(slug) || DOCUMENT_FOLDERS.includes(slug)) return `"${slug}" is a name the workspace keeps for itself: choose another slug.`;
  if (existsSync(pageFiles(slug, root).folder)) return `A custom page "${slug}" exists already: ${pageFiles(slug, root).folder}`;
  if (slugTaken(slug, root)) return `"${slug}" is a document's slug (documents and custom pages share one set of names): choose another slug.`;
  if ((await listTrash(root)).some((entry) => entry.slug === slug)) return `"${slug}" is the slug of something in the trash: choose another slug.`;
  return null;
}

/**
 * A slug for a new custom page no name of workspace `root` holds (pageSlugRefused): page- and a random id,
 * as a new document's is doc- and one (the workbench's 新建页面, whose title is typed after it is made).
 */
export async function newPageSlug(root, random = undefined) {
  for (;;) {
    const slug = `page-${newPageId(new Set(), random)}`;
    if (!(await pageSlugRefused(slug, root))) return slug;
  }
}

const readJson = (file) => fs.readFile(file, "utf8").then((text) => JSON.parse(text.replace(/^﻿/, ""))).catch(() => null);

/**
 * A page.json's fields as a list shows them: { title (the slug when it names none), icon (or null),
 * defaultCards (it says `"defaultCards": true`: the page has Gallery's default cards, HOME_CARDS, which
 * 恢复默认卡片 in its menu puts back where it misses them, and its note tells of those that came after
 * it), hint (`"hint": true`: its first-open note on its cards shows until the reader closes it) }.
 * Any page may say either; the default home page says both.
 */
export function pageMetaOf(slug, value) {
  const title = typeof value?.title === "string" && value.title.trim() ? value.title.trim() : slug;
  const icon = typeof value?.icon === "string" && value.icon.trim() ? value.icon.trim() : null;
  return { title, icon, defaultCards: value?.defaultCards === true, hint: value?.hint === true };
}

/** Custom page `slug` as a list shows it: { slug, title, icon, defaultCards, hint }, or null when it is not there. */
export async function readPageMeta(slug, root) {
  if (!pageExists(slug, root)) return null;
  return { slug, ...pageMetaOf(slug, await readJson(pageFiles(slug, root).json)) };
}

/** Custom page `slug`'s meta as its page.json says it now (pageMetaOf), read at once; null when it is not there. */
export function pageMetaNow(slug, root) {
  if (!pageExists(slug, root)) return null;
  let value = null;
  try {
    value = JSON.parse(readFileSync(pageFiles(slug, root).json, "utf8").replace(/^﻿/, ""));
  } catch {}
  return { slug, ...pageMetaOf(slug, value) };
}

/** Whether custom page `slug` has the default cards (its page.json's defaultCards): 恢复默认卡片 runs on it. */
export const pageDefaults = (slug, root) => pageMetaNow(slug, root)?.defaultCards === true;

/**
 * What gallery.json says of the custom pages: { order: the sidebar's order of their
 * slugs, homeMade: whether the default home page was made }; nothing said, or a gallery.json that does
 * not read: { order: [], homeMade: false }.
 */
export function pagesSettings(root) {
  let value = null;
  try {
    value = markerOf(readFileSync(layoutOf(root).marker, "utf8")).value;
  } catch {}
  const pages = value?.pages && typeof value.pages === "object" && !Array.isArray(value.pages) ? value.pages : {};
  const order = Array.isArray(pages.order) ? pages.order.filter((slug, at, all) => typeof slug === "string" && all.indexOf(slug) === at) : [];
  return { order, homeMade: pages.homeMade === true };
}

/**
 * Write into workspace `root`'s gallery.json that the default home page was made (its
 * pages.homeMade), every other key and value of it kept as it was (its pages.order too), and the file's
 * own layout with them (homeMadeIn: a write no reader asked for, on a workspace's first start of a
 * Gallery that makes the home page, changes no line but those it adds). Resolves to true once it says
 * so; false where gallery.json does not read as Gallery's, which nothing then writes over (the home
 * waits for a gallery.json that reads: made once, and said so). Throws where it cannot be written
 * (writeAtomic's EPERM, EBUSY…: makeDefaultHome says so).
 */
export async function markHomeMade(root) {
  const file = layoutOf(root).marker;
  for (let tries = 0; tries < 3; tries++) {
    const text = await fs.readFile(file, "utf8").catch(() => null);
    if (text === null) return false;
    const { value, ours } = markerOf(text);
    if (!ours || !value || typeof value !== "object" || Array.isArray(value)) return false;
    const pages = value.pages && typeof value.pages === "object" && !Array.isArray(value.pages) ? value.pages : {};
    if (pages.homeMade === true) return true;
    const wanted = { ...value, pages: { ...pages, homeMade: true } };
    let next = null;
    try {
      next = homeMadeIn(text);
    } catch {}
    // What the text says once written is checked: any doubt (a key twice, say), the whole file written as JSON.stringify lays it out.
    if (next === null || !isDeepStrictEqual(markerOf(next).value, wanted)) next = `${JSON.stringify(wanted, null, 2)}\n`;
    if (await writeAtomic(file, next, { expect: text })) return true;
  }
  return false;
}

// gallery.json's text (`text`, a JSON object that reads: markerOf) with pages.homeMade true, written into
// it as it stands: its line ends, indentation, BOM, what stands on one line kept, the new member laid out
// as the one before it is (on a line of its own at its indentation, the file's own indentation inside
// it, or on its line after it, as tightly as it is), a value that is not true or a pages that is no
// object (or an empty one) replaced in its place. Never more than that member's text changes.
function homeMadeIn(text) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const top = objectAt(text, text.indexOf("{"));
  const unit = top.members.map((member) => ownLine(text, top.open, member)).find(Boolean) ?? "  ";
  const blanksBefore = (member) => /[ \t]*$/.exec(text.slice(0, member.from))[0];
  // `value`'s text where `member` stands: lines of its own from `indent`, or on one line (spaced as `spaced` says).
  const laid = (value, indent, spaced) => (indent !== null ? JSON.stringify(value, null, unit).split("\n").join(eol + indent) : spaced ? laidOut(value, "") : JSON.stringify(value));
  const added = (object, key, value) => {
    const last = object.members.at(-1);
    const indent = ownLine(text, object.open, last);
    const gap = indent !== null ? eol + indent : blanksBefore(last);
    return `${text.slice(0, last.end)},${gap}${JSON.stringify(key)}:${last.colon}${laid(value, indent, gap !== "")}${text.slice(last.end)}`;
  };
  const replaced = (object, member, value) => `${text.slice(0, member.value)}${laid(value, ownLine(text, object.open, member), blanksBefore(member) !== "")}${text.slice(member.end)}`;
  const pages = top.members.findLast(({ key }) => key === "pages");
  if (!pages) return added(top, "pages", { homeMade: true });
  const inner = text[pages.value] === "{" ? objectAt(text, pages.value) : null;
  if (!inner?.members.length) return replaced(top, pages, { homeMade: true });
  const made = inner.members.findLast(({ key }) => key === "homeMade");
  return made ? replaced(inner, made, true) : added(inner, "homeMade", true);
}

const blank = (char) => char === " " || char === "\t" || char === "\n" || char === "\r";

// Where the JSON value starting at `at` in `text` ends (the index past it), in JSON that reads; past the
// text's end, a throw (homeMadeIn's caller then lays the whole file out), never a loop that does not end.
function pastValue(text, at) {
  if (text[at] === '"') {
    let next = at + 1;
    while (text[next] !== '"') {
      if (next >= text.length) throw new Error("unended string");
      next += text[next] === "\\" ? 2 : 1;
    }
    return next + 1;
  }
  if (text[at] === "{" || text[at] === "[") {
    for (let next = at, depth = 0; ; next++) {
      if (next >= text.length) throw new Error("unended " + text[at]);
      const char = text[next];
      if (char === '"') next = pastValue(text, next) - 1;
      else if (char === "{" || char === "[") depth++;
      else if ((char === "}" || char === "]") && --depth === 0) return next + 1;
    }
  }
  let next = at;
  while (next < text.length && !blank(text[next]) && !",}]".includes(text[next])) next++;
  return next;
}

/**
 * The object whose "{" is at `open` in `text`: { open, members: [{ key, from (its key's quote), value
 * (where its value starts), end (past it), colon (the blanks after its colon) }] }. Also what
 * ./workspace-name.mjs writes gallery.json's name by.
 */
export function objectAt(text, open) {
  const members = [];
  let at = open + 1;
  const skip = () => {
    while (blank(text[at])) at++;
  };
  skip();
  while (text[at] !== "}") {
    const from = at;
    at = pastValue(text, at);
    const key = JSON.parse(text.slice(from, at));
    skip();
    const colon = ++at;
    skip();
    const value = at;
    at = pastValue(text, at);
    members.push({ key, from, value, end: at, colon: text.slice(colon, value) });
    skip();
    if (text[at] === ",") at++;
    skip();
  }
  return { open, members };
}

/** The indentation `member` of the object opening at `open` stands at on a line of its own, or null where it shares its line. */
export function ownLine(text, open, member) {
  const start = text.lastIndexOf("\n", member.from - 1) + 1;
  const before = text.slice(start, member.from);
  return start > open && /^[ \t]*$/.test(before) ? before : null;
}

// .gallery/hints.json: { pages: { <slug>: <when its first-open note was closed> }, homeCards: [the default
// cards the reader knows of] }, or {} where there is none or it does not read. Its `home` (<when>) is what
// a Gallery said before every page was alike: the note of pages/home closed, the one page that had one.
function hintsOf(root) {
  try {
    const value = JSON.parse(readFileSync(layoutOf(root).hints, "utf8"));
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}
const closedOf = (hints) => (hints.pages && typeof hints.pages === "object" && !Array.isArray(hints.pages) ? hints.pages : {});

/** What .gallery/hints.json says under `key` (undefined where it says nothing, or does not read). */
export const hintOf = (root, key) => hintsOf(root)[key];

/** .gallery/hints.json with `patch`'s keys written, its others kept. */
export async function writeHints(root, patch) {
  const { hints, gallery } = layoutOf(root);
  await fs.mkdir(gallery, { recursive: true });
  await writeAtomic(hints, `${JSON.stringify({ ...hintsOf(root), ...patch }, null, 2)}\n`);
}

/**
 * Whether the reader closed custom page `slug`'s first-open note: once for the workspace,
 * whichever browser or port shows it, kept in .gallery/hints.json (what Gallery keeps of its own, never
 * gallery.json, which is the workspace's settings and wakes every page's watcher as it is written).
 */
export function pageHintClosed(root, slug) {
  const hints = hintsOf(root);
  return typeof closedOf(hints)[slug] === "string" || (slug === HOME && typeof hints.home === "string");
}

/** Whether custom page `slug`'s first-open note shows: its page.json says `hint`, and the reader has not closed it. */
export const pageHintShown = (slug, root) => pageMetaNow(slug, root)?.hint === true && !pageHintClosed(root, slug);

/** Custom page `slug`'s first-open note closed for good (`at`: when, an ISO time), the file's other notes kept. */
export async function closePageHint(root, slug, at = new Date().toISOString()) {
  const { hints, gallery } = layoutOf(root);
  await fs.mkdir(gallery, { recursive: true });
  const value = hintsOf(root);
  await writeAtomic(hints, `${JSON.stringify({ ...value, pages: { ...closedOf(value), [slug]: at } }, null, 2)}\n`);
}

/** The first-open note of pages/home closed (closePageHint's), and whether it is (pageHintClosed's): the older words for them. */
export const closeHomeHint = (root, at) => closePageHint(root, HOME, at);
export const homeHintClosed = (root) => pageHintClosed(root, HOME);

/**
 * The default cards (of HOME_CARDS) the reader knows of in workspace `root`: those its pages with the
 * default cards were made with, or the reader was told of since (a page's note of new cards, closed or
 * taken up, and 恢复默认卡片 run), kept in .gallery/hints.json as `homeCards`; FIRST_HOME_CARDS where it
 * says none, the cards of a home page made before the others came.
 */
export function homeCardsTold(root) {
  const told = hintsOf(root).homeCards;
  return Array.isArray(told) && told.every((id) => typeof id === "string") ? told : [...FIRST_HOME_CARDS];
}

/**
 * The default cards a page's note tells of, on a page with the default cards (pageMetaOf's defaultCards;
 * a page made before them is not changed, and is told once that 恢复默认卡片 brings them):
 * those of HOME_CARDS the reader was not told of (homeCardsTold) and no card of the page holds (`held`: the
 * blocks its cards are). Empty where there is none to tell.
 */
export const homeCardsNew = (root, held) => HOME_CARDS.filter((id) => !homeCardsTold(root).includes(id) && !held.includes(id));

/** Every default card told of (HOME_CARDS, kept as hints.json's `homeCards`): a page's note of new cards says nothing again. */
export async function tellHomeCards(root) {
  const { hints, gallery } = layoutOf(root);
  await fs.mkdir(gallery, { recursive: true });
  await writeAtomic(hints, `${JSON.stringify({ ...hintsOf(root), homeCards: [...HOME_CARDS] }, null, 2)}\n`);
}

/**
 * Pages in the order a page goes by where the reader gave it no place in the sidebar's head:
 * those gallery.json's pages.order names, in its order, then the rest by title (then slug). Pure:
 * `pages` [{ slug, title }].
 */
export function inPageOrder(pages, order = []) {
  const rank = (slug) => (order.includes(slug) ? order.indexOf(slug) : Infinity);
  const collator = new Intl.Collator("zh-CN", { numeric: true });
  return [...pages].sort((a, b) => rank(a.slug) - rank(b.slug) || collator.compare(a.title, b.title) || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
}

/**
 * Pages in the sidebar's order: as the head's rows go (`head`, the stored head: ./sidebar-head.mjs
 * headOrder), those it names not after them in inPageOrder's (`order`: gallery.json's pages.order). Pure.
 */
export function inHeadOrder(pages, order = [], head = null) {
  const listed = inPageOrder(pages, order);
  const bySlug = new Map(listed.map((page) => [page.slug, page]));
  return headOrder(head, listed.map(({ slug }) => slug)).map(headPage).filter(Boolean).map((slug) => bySlug.get(slug));
}

/** The custom pages of workspace `root`, in the sidebar's order (inHeadOrder): [{ slug, title, icon, defaultCards, hint }]. Folders of pages/ that hold no page.html are passed over. */
export async function listPages(root) {
  const { customPages: pages } = layoutOf(root);
  const names = await fs.readdir(pages, { withFileTypes: true }).catch(() => []);
  const found = await Promise.all(names.filter((entry) => entry.isDirectory() && isSlugName(entry.name)).map((entry) => readPageMeta(entry.name, root)));
  return inHeadOrder(found.filter(Boolean), pagesSettings(root).order, await readStoredHead(root));
}

/** The sidebar's head rows of workspace `root` in their order (./sidebar-head.mjs headOrder): new, search and @<slug> of each of `pages` (listPages'). */
export async function headOf(root, pages = null) {
  return headOrder(await readStoredHead(root), (pages ?? await listPages(root)).map(({ slug }) => slug));
}

/**
 * Custom page `slug` given its row in the sidebar's head, in the outline file under its lock: right after
 * page `after`'s row, else last (a page made: createPage's). A head that was never stored is stored as
 * the sidebar showed it, so that the page made last stands last.
 */
export async function placePageInHead(root, slug, after = null) {
  await withOutlineLock(root, async () => {
    const stored = await readStoredHead(root);
    const shown = stored ? null : await headOf(root, (await listPages(root)).filter((page) => page.slug !== slug));
    await writeHead(root, headWithPage(stored, shown, slug, after));
  });
}

/**
 * A page's version as the event stream says it (`page <version>`): its page.html and
 * page.json as they are, 16 hex digits. The page compares it with the one it was served with.
 */
export function pageVersion(html, json = "") {
  return createHash("sha256").update(html ?? "").update("\u0000").update(json ?? "").digest("hex").slice(0, 16);
}

/** A page's version as its files are now (pageVersion). */
export async function pageVersionNow(slug, root) {
  const { html, json } = pageFiles(slug, root);
  const [page, meta] = await Promise.all([fs.readFile(html, "utf8").catch(() => ""), fs.readFile(json, "utf8").catch(() => "")]);
  return pageVersion(page, meta);
}

/**
 * The page.html of a new custom page: its title (in `<title>` only: the page draws no big title, its
 * name is the sidebar's, the tab's and the top bar's) and its <main class="gallery-page">, holding one
 * empty board (`main`, the structure gallery page new writes), or nothing (`blank`: the workbench's
 * 新建页面, a page an Agent is to write, isBlankPage). `lang`: its page's lang (zh-CN or en by default, as the
 * file language says: file-language.mjs).
 */
export function newPageHtml(slug, title, { lang = htmlLang(fileLanguage()), blank = false } = {}) {
  const inside = blank ? "" : `
    <div class="gallery-board" data-board-id="${FIRST_BOARD}">
    </div>`;
  return `<!doctype html>
<html lang="${escapeMarkup(lang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeText(title)}</title>
  <style>
    /* This page's own look. Colors of its own are written for both themes:
       :root[data-doc-effective-theme="dark"] { … } holds the dark ones. */
  </style>
</head>
<body>
  <main class="gallery-page" data-page-id="${slug}">${inside}
  </main>
</body>
</html>
`;
}

/**
 * Whether page.html `html` is a blank page, one no one has written yet: its <body> holds an empty
 * <main class="gallery-page"> and nothing else (comments and blanks aside), as the workbench's 新建页面
 * writes it (newPageHtml's `blank`). The workbench then shows, in its middle, that an Agent writes it.
 */
export function isBlankPage(html) {
  const body = /<body\b[^>]*>([\s\S]*?)<\/body>/i.exec(String(html ?? "").replace(/<!--[\s\S]*?-->/g, ""))?.[1];
  return body !== undefined && /^\s*<main\b[^>]*\bclass\s*=\s*["']?gallery-page["']?[^>]*>\s*<\/main>\s*$/i.test(body);
}

/**
 * Make custom page `slug` in workspace `root`: pages/<slug>/ with page.html (newPageHtml: one empty
 * board, or none where `blank`) and page.json ({ title, icon?, defaultCards?, hint? }: pageMetaOf), and its
 * row in the sidebar's head right after page `after`'s, else last (placePageInHead; a head that cannot be
 * written leaves it where a page the head names not goes). Throws (code EEXIST) when pageSlugRefused
 * refuses the slug; resolves to its files.
 */
export async function createPage(slug, title, { root, icon = null, lang, blank = false, defaultCards = false, hint = false, after = null } = {}) {
  const refused = await pageSlugRefused(slug, root);
  if (refused) throw Object.assign(new Error(refused), { code: "EEXIST" });
  const files = pageFiles(slug, root);
  await fs.mkdir(layoutOf(root).customPages, { recursive: true });
  await fs.mkdir(files.folder, { recursive: false }); // fails when it was made meanwhile
  const name = title.replace(/\s+/g, " ").trim();
  await fs.writeFile(files.html, newPageHtml(slug, name, { lang, blank }));
  const meta = { title: name, ...(icon ? { icon } : {}), ...(defaultCards ? { defaultCards: true } : {}), ...(hint ? { hint: true } : {}) };
  await fs.writeFile(files.json, `${JSON.stringify(meta, null, 2)}\n`);
  await placePageInHead(root, slug, after).catch(() => {});
  return files;
}

/**
 * Custom page `slug`'s title and/or icon written into its page.json (the workbench's 重命名 writes the title,
 * gallery page set both), every other field as it was; page.html is not touched (its <title> and header are
 * the Agent's). `icon` a value (the caller holds it to what an icon may be), or null to take it away; left
 * out, it stays. Resolves to its meta, or null when the page is not there; throws (code "title") for a title
 * that is empty or longer than 200 characters.
 */
export async function setPageMeta(slug, { title, icon } = {}, root) {
  const name = title === undefined ? undefined : typeof title === "string" ? title.replace(/\s+/g, " ").trim() : "";
  if (name !== undefined && (!name || name.length > 200)) throw Object.assign(new Error("A page's title is 1 to 200 characters."), { code: "title" });
  if (!pageExists(slug, root)) return null;
  const { json } = pageFiles(slug, root);
  for (let tries = 0; tries < 3; tries++) {
    const text = await fs.readFile(json, "utf8").catch(() => null);
    let value = {};
    try {
      value = text === null ? {} : JSON.parse(text.replace(/^﻿/, ""));
    } catch {}
    if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
    const next = { ...value, ...(name !== undefined ? { title: name } : {}) };
    if (icon === null) delete next.icon;
    else if (icon !== undefined) next.icon = icon;
    const body = `${JSON.stringify(next, null, 2)}\n`;
    const written = text === null ? (await fs.writeFile(json, body, { flag: "wx" }).then(() => true, () => false)) : await writeAtomic(json, body, { expect: text });
    if (written) break;
  }
  return readPageMeta(slug, root);
}

/**
 * Custom page `slug`'s title written into its page.json (the workbench's 重命名), every other field as
 * it was; page.html is not touched (its <title> and header are the Agent's). Resolves to its meta, or
 * null when the page is not there; throws for a title that is empty or longer than 200 characters.
 */
export const renamePage = (slug, title, root) => setPageMeta(slug, { title: typeof title === "string" ? title : "" }, root);
