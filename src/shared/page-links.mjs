// A document's link in the workbench's address (#项目周报-Q3-k3xv9q2a): its title in the words a link can
// hold, the rest of it dashes, then the document's page id; a title that leaves no words is the id
// alone. The words are a label and nothing more: a link is read by what stands after its last dash,
// so that an address written down before a rename opens its document for ever, and two documents of
// one title need nothing to tell them apart.
//
// A page id has the look of a block id (shared/ids.mjs) and is worked out from the folder name, the
// document's identity, which a title never changes: a hash of the name, but for a name of the shape
// doc-<eight> (DOC_SLUG), which has those eight as its id. The workbench names a new document so
// (shared/workspace.mjs newDocSlug: doc- and a random id no name of the workspace has), so that the
// folder and the address read alike (doc-tacti90g, #反馈文档-tacti90g); every name made before has the
// id it had, but for one of that very shape (an Agent's slug may be doc-overview), which keeps the
// address it had besides: its hash opens it too (earlierId, pageOfLink). So nothing is kept anywhere:
// no file, no list to keep in step, and a page alone in a tab or with no list read yet can always say
// its own address.
// The folder name opens its document too, for what was written by it. A document in the trash has its
// id, and has its address back when it is restored; one restored under another folder name goes by
// that name's id, as the links of files to it change too.
//
// Pure, and the same on the server, in the workbench and on a page, so that a title typed shows in the
// address at once. Only the documents of the sidebar and of the trash go by a link: 写作偏好 stands
// outside the tree of pages.

// What is no word of a title, a mark going with what it sits on (an emoji's variation selector).
const NOT_WORDS = /(?:[^\p{L}\p{M}\p{N}_]\p{M}*)+/gu;

/**
 * A folder name that is a page id's own: "doc-" and the eight characters of an id, a lowercase letter
 * first and lowercase letters or digits after it. Its group is the id (pageId).
 */
export const DOC_SLUG = /^doc-([a-z][a-z0-9]{7})$/;

/**
 * The id a name has from a 53-bit hash of it (cyrb53): eight letters and digits, a letter first. Every
 * name had it before the folders of the shape DOC_SLUG had their own (pageId, earlierId).
 * @param {string} slug
 */
function hashId(slug) {
  let one = 0xdeadbeef;
  let two = 0x41c6ce57;
  for (let at = 0; at < slug.length; at++) {
    one = Math.imul(one ^ slug.charCodeAt(at), 2654435761);
    two = Math.imul(two ^ slug.charCodeAt(at), 1597334677);
  }
  one = Math.imul(one ^ (one >>> 16), 2246822507) ^ Math.imul(two ^ (two >>> 13), 3266489909);
  two = Math.imul(two ^ (two >>> 16), 2246822507) ^ Math.imul(one ^ (one >>> 13), 3266489909);
  const hash = (two >>> 0) % 2 ** 21 * 2 ** 32 + (one >>> 0);
  return String.fromCharCode(97 + hash % 26) + Math.floor(hash / 26).toString(36).padStart(7, "0").slice(-7);
}

/**
 * A document's page id: eight letters and digits, a letter first. A folder named doc-<eight> (DOC_SLUG)
 * has those eight; any other name, a hash of it. So only a name of that one shape reads otherwise than
 * it did, and it keeps the address it had besides (earlierId).
 * @param {string} slug
 */
export const pageId = (slug) => DOC_SLUG.exec(slug)?.[1] ?? hashId(slug);

/**
 * The id a name of the shape DOC_SLUG went by before its own eight were its id, its hash, or null for
 * any other name, whose id has not changed. An Agent's slug may have that shape (doc-overview was
 * #Overview-f3md3kg4 before), and an address written down then opens it still (pageOfLink, earlierLink).
 * @param {string} slug
 */
export const earlierId = (slug) => (DOC_SLUG.test(slug) ? hashId(slug) : null);

const ID_FIRST = "abcdefghijklmnopqrstuvwxyz";
const ID_REST = `${ID_FIRST}0123456789`;

/**
 * A new page id, one `taken` (a Set of ids) does not hold: eight characters of the shape DOC_SLUG has,
 * each picked by `random` (a function giving a number from 0 up to 1, Math.random's way: the tests give
 * their own), another picked while it is held.
 * @param {Set<string>} taken
 * @param {() => number} [random]
 */
export function newPageId(taken, random = Math.random) {
  for (;;) {
    let id = ID_FIRST[Math.min(25, Math.floor(random() * 26))];
    for (let at = 1; at < 8; at++) id += ID_REST[Math.min(35, Math.floor(random() * 36))];
    if (!taken.has(id)) return id;
  }
}

/**
 * A document's link, what stands after # in its address: its title's words and its page id, the id
 * alone for a title that leaves no words or one not known here.
 * @param {{ slug: string, title?: string }} page
 */
export function pageLink({ slug, title }) {
  const words = String(title ?? "").replace(NOT_WORDS, "-").replace(/^[-\p{M}]+|-+$/gu, "");
  return words ? `${words}-${pageId(slug)}` : pageId(slug);
}

/**
 * The link a document had before its own eight were its id, if it has an earlier id (earlierId): its
 * `link` of now with the id at its end swapped for that one, its words as they are; else null. Only
 * an address on another server is held to be a document's by its words (addressOn), and one written
 * for such a document before reads so.
 * @param {string} slug
 * @param {string | undefined} link the link the document has now (pageLink)
 */
export function earlierLink(slug, link) {
  const was = earlierId(slug);
  const now = pageId(slug);
  return was !== null && link?.endsWith(now) ? link.slice(0, link.length - now.length) + was : null;
}

/**
 * Each document's link: a Map of slug to link, which is also the list of documents an address is read
 * against (pageOfLink).
 * @param {{ slug: string, title?: string }[]} pages
 * @returns {Map<string, string>}
 */
export const pageLinks = (pages) => new Map(pages.map((page) => [page.slug, pageLink(page)]));

/**
 * The document `value` names of those in `links`: by its folder name, else by the page id after the
 * last dash of a link, or that id alone, whatever words stand before it; else, for a folder of the
 * shape DOC_SLUG, by the id it went by before (earlierId), which never takes a document that has the
 * id for its own. Its slug, or null.
 * @param {Map<string, string>} links
 * @param {string} value
 */
export function pageOfLink(links, value) {
  if (links.has(value)) return value;
  const id = value.slice(value.lastIndexOf("-") + 1);
  for (const slug of links.keys()) if (pageId(slug) === id) return slug;
  for (const slug of links.keys()) if (earlierId(slug) === id) return slug;
  return null;
}

/**
 * Whether `name` (a slug or a link, what stands before any "/" of an address) names a document of the trash ({ slug, title } each).
 * @param {{ slug: string, title?: string }[]} trash
 * @param {string} name
 */
export const inTrash = (trash, name) => pageOfLink(pageLinks(trash), name.split("/")[0]) !== null;

/**
 * What an address written for anyone goes by: `links` and the links of the trash (`trash`: { slug,
 * title } each).
 * @param {Map<string, string>} links
 * @param {{ slug: string, title?: string }[]} trash
 */
export const namedLinks = (links, trash) => new Map([...pageLinks(trash), ...links]);

/** The pages of a list of reports (`reports` of the outline's answer) that hold a link: all but 写作偏好. */
export const linkedPages = (reports) => Object.values(reports).filter(({ instructions }) => !instructions);
