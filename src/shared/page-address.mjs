import { localPath } from "./workspace-address.mjs";
import { pageLink, pageOfLink } from "./page-links.mjs";

// A document's address, as a link, a paste or the address bar may write it (docs/workbench.md, "A
// document's addresses"), read in one place: { slug, block }, block null for the page itself. Pure: the
// link card, a paste, a click, the workbench's address and the checks all come here, and a click
// stays synchronous, for only one form asks for a list.
//
// In a file there is one form, an ordinary link between two ordinary files: ../<slug>/doc.html (an old
// document's ../<slug>/report.html), with #<block id> for a block; #<block id> within a page, which
// names no page and is no business of this module's. It holds no port and no title, and a slug in a
// file is no address a reader sees. On this computer's own host (127.0.0.1 or localhost) or as a path
// alone, a document is also /generated/<slug>.html (its page, with any query) and /<slug>/doc.html,
// each with #<block id>, and in a workbench's address /#<link>/<block id> and /#<link> (shared/page-links.mjs:
// its title's words and its page id), the one form a whole address is written in (fullAddress), the
// words as they are; a page id alone or a slug in its place reads as well. A workbench's address is the
// one form that needs `links` (pageLinks: a Map of slug to link), for only the list can say which
// document an id is or whether a name is a slug at all; given, `links` also turns away every slug it
// does not hold. Without it such an address is none here, and workbenchHash hands it to the workbench,
// which has the list. pageAddress parses a shape; addressOn additionally requires the current
// service’s port. An address of another port is always external, even when its slug matches.

const SLUG = "[a-z0-9]+(?:-[a-z0-9]+)*"; // shared/workspace.mjs slugPattern, which needs Node
const FILE = "(?:doc|report)\\.html";
const IN_FILE = new RegExp(`^\\.\\./(${SLUG})/${FILE}(?:#(.*))?$`);
const PAGE = new RegExp(`^/generated/(${SLUG})\\.html$`);
const OWN_FILE = new RegExp(`^/(${SLUG})/${FILE}$`);
const LOOPBACK = new Set(["127.0.0.1", "localhost"]);
const HOSTED = /^(?:https?:)?\/\//i;

/** A hash or a part of an address as words: as it is written where it is no good encoding. */
export const decoded = (text) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};

// `text` as an address of this computer's own host, read as the page reads a path: a URL, or null.
function ownAddress(text) {
  try {
    const url = new URL(text, "http://127.0.0.1");
    return /^https?:$/.test(url.protocol) && LOOPBACK.has(url.hostname) && /^(?:https?:|\/)/i.test(text) ? url : null;
  } catch {
    return null;
  }
}

/**
 * What a workbench's hash says, decoded, of the documents of `links`: a link or a slug, with a block
 * or without (neither ever holds "/"). Else null, as with no `links` to read it by.
 * @param {string} hash
 * @param {Map<string, string> | null} [links]
 */
export function hashAddress(hash, links = null) {
  const at = hash.indexOf("/");
  const name = at < 0 ? hash : hash.slice(0, at);
  const block = at < 0 ? null : hash.slice(at + 1) || null;
  const slug = links && pageOfLink(links, name);
  return slug ? { slug, block } : null;
}

/** The document and block `text` is the address of ({ slug, block }), or null: a web address, another host, a slug `links` does not hold, a workbench's address with no `links`. */
export function pageAddress(text, links = null) {
  const address = String(text ?? "").trim();
  const known = (slug, block) => (!links || links.has(slug) ? { slug, block: block || null } : null);
  const inFile = IN_FILE.exec(address);
  if (inFile) return known(inFile[1], decoded(inFile[2] ?? ""));
  const url = ownAddress(address);
  if (!url) return null;
  const path = PAGE.exec(localPath(url.pathname)) ?? OWN_FILE.exec(localPath(url.pathname));
  if (path) return known(path[1], decoded(url.hash.slice(1)));
  return url.pathname === "/" && url.hash.length > 1 ? hashAddress(decoded(url.hash.slice(1)), links) : null;
}

/** The document and block `text` names of those in `links`: an address, as pageAddress reads one, or what stands after the # of a workbench's, the # with it or not, or after the Windows path Git Bash puts in place of a word's first / (/#<link>), as a person may hand a command one. Else null. */
export const namedPlace = (text, links) => pageAddress(text, links) ?? hashAddress(decoded(text.replace(/^(?:[a-z]:\/(?:.*\/)?)?#/i, "")), links);

/** The hash of an address of a workbench (/#<anything>, on this computer's own host), decoded, or null: what a click hands the workbench to read. */
export function workbenchHash(text) {
  const url = ownAddress(String(text ?? "").trim());
  return url?.pathname === "/" && url.hash.length > 1 ? decoded(url.hash.slice(1)) : null;
}

/**
 * The document and block `text` names of those in `links` (a Map, or null with no list) as read on the
 * server of `origin`, as pageAddress reads it. Another port is always external; with no origin
 * supplied, no running service’s port is inferred from matching titles or folder names.
 * @param {string} text
 * @param {Map<string, string> | null} links
 * @param {string} [origin]
 */
export function addressOn(text, links, origin = "http://127.0.0.1") {
  return elsewhere(text, origin) ? null : pageAddress(text, links);
}

/** Whether `text` is an address of a document of this workspace, as far as can be told with no list. */
export const isPageAddress = (text) => pageAddress(text) !== null || workbenchHash(text) !== null;

/** Whether `text` may be one, once the list is read (a paste reads it): an address of this computer's own host. */
export const mayBePage = (text) => ownAddress(String(text ?? "").trim()) !== null;

/** Whether `href` is written as a file writes a link to a document or a block: all a page block's address may be. */
export const isFileLink = (href) => IN_FILE.test(href) || /^#[^\s"<>]+$/.test(href);

/** The link a file writes to a document or block, from document `own`: within it a block is #<block id>. */
export const fileLink = ({ slug, block = null }, own = null) => (slug === own && block ? `#${block}` : `../${slug}/doc.html${block ? `#${block}` : ""}`);

/** Whether `text` names a host of its own, where a path or a relative link is read on the server that shows it. */
export const hosted = (text) => HOSTED.test(String(text ?? "").trim());

/** Whether `text` is an address of this computer on another server than `origin`'s, which may be another program's. */
export function elsewhere(text, origin) {
  const url = hosted(text) ? ownAddress(text.trim()) : null;
  return url !== null && url.port !== new URL(origin).port;
}

/** Where `href`, a link in the file of document `own`, leads, read beside that file as the disk reads it: an address on `origin`, or null for none. */
export function fromFile(href, own, origin = "http://127.0.0.1") {
  try {
    return new URL(String(href ?? "").trim(), `${origin}/${own}/doc.html`).href;
  } catch {
    return null;
  }
}

/**
 * The full address of a document or block, which a browser opens in a workbench from anywhere
 * (`origin`: its server's): /#<link>/<block id>, or /#<link> for a page, in the words as they are. A
 * document `links` does not hold goes by its page id, which opens it all the same.
 * @param {string} origin
 * @param {{ slug: string, block?: string | null }} place
 * @param {Map<string, string> | null} [links]
 */
export const fullAddress = (origin, { slug, block = null }, links = null) => `${origin}/#${links?.get(slug) ?? pageLink({ slug })}${block ? `/${block}` : ""}`;
