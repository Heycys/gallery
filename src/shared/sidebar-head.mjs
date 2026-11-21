// The sidebar's head rows (docs/workbench.md "The sidebar", **Head**; the user's word of 2026-11-09):
// 新建, 搜索 and each custom page, one list the reader orders by dragging its rows (no row goes into
// another, none into the tree, no document among them), kept for the workspace in the outline file
// (.gallery/outline.json's `head`, which ./outline.mjs keeps as it writes the tree, so that every browser
// shows the order the reader gave). A row's key: "new" (新建), "search" (搜索), or "@<slug>" for a custom
// page (its address in the workbench, which no slug holds). Pure: the server's (shared/pages.mjs listPages,
// the workbench service's head) and the workbench's (its sidebar) alike.

/** The key of the head's 新建 row. */
export const HEAD_NEW = "new";
/** The key of the head's 搜索 row. */
export const HEAD_SEARCH = "search";
/** The key of custom page `slug`'s row: @<slug>. */
export const pageHeadKey = (slug) => `@${slug}`;
/** The custom page a head key names, or null (new, search). */
export const headPage = (key) => (typeof key === "string" && key.startsWith("@") ? key.slice(1) : null);
/** How many keys a stored head keeps at most (those of pages gone stay, so that one restored goes back to its place). */
export const MOST_HEAD = 200;

const KEY = /^(?:new|search|@[a-z0-9]+(?:-[a-z0-9]+)*)$/;

/**
 * `value` as a head to store: an array of keys (new, search, @<slug>), each once, MOST_HEAD at most; null
 * for anything else (not an array, a key that is none, one twice, too many).
 */
export function storedHead(value) {
  if (!Array.isArray(value) || value.length > MOST_HEAD) return null;
  if (!value.every((key) => typeof key === "string" && KEY.test(key))) return null;
  return new Set(value).size === value.length ? [...value] : null;
}

/**
 * The head's rows in their order: the keys `stored` (a head as the outline file keeps it, or null) gives,
 * those of pages that are not there passed over, then what it does not name: 新建 first and 搜索 after it
 * where it names neither (as before any drag), and each page of `pages` (their slugs, in the order a page
 * goes by when the reader gave it none: shared/pages.mjs inPageOrder) after the last row it names, in that
 * order. Always holds new and search once each, and each page of `pages` once.
 */
export function headOrder(stored, pages = []) {
  const there = new Set(pages);
  const named = (storedHead(stored) ?? []).filter((key) => key === HEAD_NEW || key === HEAD_SEARCH || there.has(headPage(key)));
  if (!named.includes(HEAD_SEARCH)) named.unshift(HEAD_SEARCH);
  if (!named.includes(HEAD_NEW)) named.splice(named.indexOf(HEAD_SEARCH), 0, HEAD_NEW);
  for (const slug of pages) if (!named.includes(pageHeadKey(slug))) named.push(pageHeadKey(slug));
  return named;
}

/**
 * The head with the row `key` moved before the row `before` (null: last), the others as they were: what a
 * drop on the head makes. Unchanged where `key` is not in it or is `before`.
 */
export function movedInHead(head, key, before) {
  if (!head.includes(key) || key === before) return [...head];
  const rest = head.filter((one) => one !== key);
  const at = before === null ? rest.length : rest.indexOf(before);
  rest.splice(at < 0 ? rest.length : at, 0, key);
  return rest;
}

/**
 * The stored head `stored` (or null, when none is kept yet: `shown`, the head as the sidebar shows it now,
 * stands for it) with page `slug`'s row put right after the row of `after` (a page's slug), else last: a
 * new page's place. Keys of pages gone are kept where they stand.
 */
export function headWithPage(stored, shown, slug, after = null) {
  const head = (storedHead(stored) ?? storedHead(shown) ?? [HEAD_NEW, HEAD_SEARCH]).filter((key) => key !== pageHeadKey(slug));
  const at = after ? head.indexOf(pageHeadKey(after)) : -1;
  head.splice(at < 0 ? head.length : at + 1, 0, pageHeadKey(slug));
  return head.slice(-MOST_HEAD);
}
