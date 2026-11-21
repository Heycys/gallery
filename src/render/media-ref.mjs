import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { attr, hasClass, walk } from "../shared/html-tree.mjs";
import { MEDIA_ROUTES, assetFile, mediaTypeOf, mediaUrl } from "../shared/media.mjs";
import { documentDirectory } from "../shared/workspace.mjs";

// ---------- what a file of the folder is now ----------
//
// The preview names each file of a document's folder it shows by what the file is now: its address with
// ?v=<stamp> (servedUrl), the stamp read from the file's size and its times of writing and of change
// (fileStamp), so that a file written again under the same name (an Agent copying a new picture over
// assets/shot.png) is a new address. A browser never fetches an address a page has already used again
// while that page stays open (Chrome keeps what one document loaded for the document's whole life, whatever
// the answer's no-cache said), so a page that is not loaded anew showed the old picture until it was; with
// the stamp in the address, a page served or a block put in after the write names the new bytes, and the
// server tells the pages open of the new stamp (src/server/asset-news.mjs; the page swaps the address,
// src/editor/page/assets-live.mjs). The change time is in it as a copy may keep the time of writing of the
// file it copies (cp -p, Windows' CopyFile): any write changes it. What the stamp is of is the file's
// metadata, never its bytes (a 200 MB video is not read for it): a file written again with the same bytes
// is a new stamp, fetched once more.

/** A file's stamp from its stat (`size`, `mtimeMs`, `ctimeMs`): 12 hex digits. */
export const stampOfStat = ({ size, mtimeMs, ctimeMs }) => createHash("sha256").update(`${size} ${mtimeMs} ${ctimeMs}`).digest("hex").slice(0, 12);

/** The stamp of the file at `at` as it is now (stampOfStat), or null when no file is there. */
export function fileStamp(at) {
  const stat = fs.statSync(at, { throwIfNoEntry: false });
  return stat?.isFile() ? stampOfStat(stat) : null;
}

/**
 * The address the preview shows a file of the report's folder at (`file`, assets/<name>, of the folder
 * `directory`) by `route` (shared/media.mjs mediaUrl), with the file's stamp, ?v=<stamp> (none when the
 * file is not there, what the checks say, or no folder is given).
 */
export function servedUrl(route, slug, file, directory) {
  const stamp = directory ? fileStamp(path.join(directory, file)) : null;
  return stamp ? `${mediaUrl(route, slug, file)}?v=${stamp}` : mediaUrl(route, slug, file);
}

/**
 * The stamps a page of document `slug` as rendered (`html`, the preview's) names the files of its folder by
 * (servedUrl's ?v=<stamp>, whatever the route), { "assets/<name>": stamp }: what its live script is told it
 * shows (src/server/routes.mjs), read off the page, no file looked at again; a file the page names nowhere,
 * or by no stamp (one not there), is none of it.
 */
export function servedStamps(html, slug) {
  const stamps = {};
  const routes = Object.keys(MEDIA_ROUTES).join("|");
  const named = new RegExp(`/__gallery/edit/(?:${routes})/${slug.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/(assets/[A-Za-z0-9][A-Za-z0-9._-]{0,80})\\?v=([0-9a-f]{12})(?![0-9a-f])`, "g");
  for (const [, file, stamp] of String(html).matchAll(named)) if (assetFile(file)) stamps[file] = stamp;
  return stamps;
}

// What the render modules of the media blocks (images.mjs, files.mjs, embeds.mjs) do to their
// references to files of the report's folder: <tag src="assets/<file>"> (or href). Each module finds
// its elements; this says where each shows. The preview serves the file where the server does (the
// page is at /generated/<slug>.html, where assets/ means nothing) and says the file it is in
// data-ge-<attribute> (the page editor works with that); a build and an export embed it as a data:
// URL, so the one file holds it. A reference that is no file of the folder the route serves, or whose
// file is not there, stays as it is. The page's icon (emoji.mjs) builds its own <img>, at the same
// route address (mediaUrl). Every other reference of the page (a picture in a table cell, a link to
// a file, a CSS background…) is asset-references.mjs's, shown after these by the same means.
//
// The elements are those of the report's parse tree (render/report-tree.mjs), so a tag is read as a
// browser reads it: any case, its attributes in double, single or no quotes, with spaces around "="
// or none, a ">" inside a quoted value, character references; the first of a name repeated the one
// that counts. Markup a comment, a script's text or a <textarea> merely spells is no element. What the
// checks find and what the embeds change is the same attribute: its value as the tree has it, its
// place in the file the tree's (`sourceCodeLocation`), rewritten in the file's own text.

/** The first element under `root` (itself left out) of the tag `tagName` with the class `name`, or null. */
export function firstElement(root, tagName, name) {
  let found = null;
  walk(root, (node) => {
    if (!found && node.tagName === tagName && hasClass(node, name)) found = node;
  });
  return found;
}

/**
 * A file of the report's folder (`file`, assets/<name>, of the folder `directory`) as an export holds
 * it, a data: URL of its media type; or null when no such file is there.
 */
export function dataUrlOf(directory, file) {
  const at = path.join(directory, file);
  return fs.statSync(at, { throwIfNoEntry: false })?.isFile() ? `data:${mediaTypeOf(file)};base64,${fs.readFileSync(at).toString("base64")}` : null;
}

// The attribute shown: the preview's address and the file, or an export's data: URL; or null, when it
// stays as it is.
function shownAttribute(value, { attribute, route, slug, mode, reportsDirectory }) {
  if (!MEDIA_ROUTES[route](value)) return null;
  if (mode === "preview") return `${attribute}="${servedUrl(route, slug, value, documentDirectory(slug, reportsDirectory))}" data-ge-${attribute}="${value}"`;
  const url = dataUrlOf(documentDirectory(slug, reportsDirectory), value);
  return url && `${attribute}="${url}"`;
}

/**
 * `html` with the `attribute` ("src" or "href") of each of `elements` (elements of its parse tree)
 * shown, the rest of its text as it is. `route`: which of the preview's routes serves it (MEDIA_ROUTES
 * in shared/media.mjs, which also says what it takes). The text is put together once, in its order.
 */
export function showReferences(html, elements, { attribute, route, slug, mode, reportsDirectory }) {
  const places = elements
    .map((element) => ({ place: element.sourceCodeLocation?.attrs?.[attribute], value: attr(element, attribute) }))
    .filter(({ place }) => place)
    .sort((a, b) => a.place.startOffset - b.place.startOffset);
  const pieces = [];
  let cursor = 0;
  for (const { place, value } of places) {
    const shown = shownAttribute(value, { attribute, route, slug, mode, reportsDirectory });
    if (shown === null || place.startOffset < cursor) continue;
    pieces.push(html.slice(cursor, place.startOffset), shown);
    cursor = place.endOffset;
  }
  pieces.push(html.slice(cursor));
  return pieces.join("");
}
