import fs from "node:fs/promises";
import path from "node:path";
import { MEDIA_ROUTES, assetFile, extensionOf, imageFile, mediaTypeOf } from "../shared/media.mjs";
import { serve, serveFound } from "../shared/http.mjs";
import { stampOfStat } from "../render/media-ref.mjs";
import { slugPattern } from "../shared/reports.mjs";
import { pageFiles } from "../shared/pages.mjs";
import { documentDirectory } from "../shared/workspace.mjs";

// The preview server's routes for the files of a report's folder, /__gallery/edit/<route>/<slug>/assets/<file>
// (one for all of them: the routes and what each takes are MEDIA_ROUTES in shared/media.mjs, the
// addresses mediaUrl's). What each route sends beyond the file's bytes is the one table below.
//   asset   a picture, as its type says (the editor works with it as it is); an SVG with a sandbox of no permission,
//           which an <img> never reads, so that one opened on its own (a frame, a link) runs nothing in the page's origin
//   file    a file block's file, handed out for saving only (never shown in the page's origin: an
//           HTML or SVG file would run there), by the name its link gives (download)
//   embed   an embed block's file, shown in its frame: an HTML file sandboxed (an opaque origin,
//           never the editor's), a PDF as the browser shows one
const SERVING = {
  asset: (value) => ({ "Content-Type": mediaTypeOf(value), ...(/\.svg$/i.test(value) ? { "Content-Security-Policy": "sandbox" } : {}), "Cache-Control": "no-cache" }),
  file: () => ({ "Content-Type": "application/octet-stream", "Content-Disposition": "attachment", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache" }),
  embed: (value) => (/\.pdf$/i.test(value)
    ? { "Content-Type": "application/pdf", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache" }
    : { "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "sandbox allow-scripts allow-popups allow-forms allow-modals", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache" }),
};

// The tags a request says it holds the bytes of (If-None-Match), or none.
const heldTags = (request) => request?.headers?.["if-none-match"]?.split(/\s*,\s*/) ?? [];

// A file of the folder with its stamp (render/media-ref.mjs stampOfStat: what the page's address names it by,
// ?v=<stamp>) its ETag: { body, tag }, or null when there is none. A request that says it holds the bytes of the
// file's tag as it is now (`held`, If-None-Match) is answered 304, from the file's metadata alone, its bytes
// never read: a page loaded anew (a reload, the workbench's page swapped in) asks for each of its pictures
// again, and the ones that did not change are not sent again. Otherwise the file is read and looked at again
// after, and a tag is given only when it did not change meanwhile (an Agent writing it as it is read: its bytes
// then are no stamp's, and the next request reads it again).
async function readStamped(file, held = []) {
  const before = await fs.stat(file).catch(() => null);
  if (!before?.isFile()) return null;
  const tag = `"${stampOfStat(before)}"`;
  if (held.includes(tag)) return { body: null, tag };
  const body = await fs.readFile(file).catch(() => null);
  if (!body) return null;
  const after = await fs.stat(file).catch(() => null);
  const same = after && after.size === before.size && after.mtimeMs === before.mtimeMs && after.ctimeMs === before.ctimeMs;
  return { body, tag: same ? tag : null };
}

/**
 * Answer `response` with the file at `file` (readStamped: its stamp its ETag) and `headers`: 304 when `request`
 * holds its tag, 404 when there is none (no `file` either). The media routes', a custom page's files', and a page
 * icon's picture of the document's folder (routes.mjs /__gallery/edit/icon).
 */
export async function serveStamped(request, response, file, headers) {
  const found = file ? await readStamped(file, heldTags(request)) : null;
  if (!found) return serveFound(response, null);
  const tagged = found.tag ? { ...headers, ETag: found.tag } : headers;
  if (found.body === null) return serve(response, { status: 304, headers: tagged });
  return serve(response, { headers: tagged, body: found.body });
}

const ROUTE = new RegExp(`^/__gallery/edit/(${Object.keys(MEDIA_ROUTES).join("|")})/([^/]+)/(assets/[^/]+)$`);

/**
 * Answer `response` with the file of a report's folder `pathname` names (its query, the stamp a page names
 * it by, is no part of it: the file as it is now is sent), or with 404 when the route takes no such name or
 * the file is not there; false when `pathname` is none of these routes. `request`: its If-None-Match (readStamped).
 */
export async function serveMedia(pathname, response, { reportsDirectory, request = null }) {
  const [, route, slug, value] = ROUTE.exec(pathname) ?? [];
  if (!route) return false;
  const file = slugPattern.test(slug) && MEDIA_ROUTES[route](value) ? path.join(documentDirectory(slug, reportsDirectory), value) : null;
  await serveStamped(request, response, file, SERVING[route](value));
  return true;
}

// A custom page's own files, /pages/<slug>/assets/<file> (shared/pages.mjs pageFiles' assets/: a
// picture an Agent puts there for the page or a card, which the page writes assets/<file> and
// render/page-html.mjs withPageAssets addresses here): a file right in that folder by a name of the
// document's rule (shared/media.mjs assetFile: no folder in it, no ".."), a picture as its type says, the
// page's own stylesheet and script (.css, .js, .mjs: a page is free HTML, its look and code may stand in
// files of its own, PAGE_CODE) as such, any other file handed out for saving only, as the media routes'
// asset and file do; nothing else of the page's folder (its page.html, its page.json) is served by its path.
const PAGE_CODE = { css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8" };
const PAGE_ASSET = /^\/pages\/([^/]+)\/(assets\/[^/]+)$/;

/** Answer `response` with the file of a custom page's assets/ `pathname` names (404 when there is none); false when it is no such route. */
export async function servePageAsset(pathname, response, { reportsDirectory, request = null }) {
  const [, slug, value] = PAGE_ASSET.exec(pathname) ?? [];
  if (!slug) return false;
  const file = slugPattern.test(slug) && assetFile(value) ? path.join(pageFiles(slug, reportsDirectory).folder, value) : null;
  const code = PAGE_CODE[extensionOf(value ?? "")];
  await serveStamped(request, response, file, code ? { "Content-Type": code, "X-Content-Type-Options": "nosniff", "Cache-Control": "no-cache" } : (imageFile(value) ? SERVING.asset : SERVING.file)(value));
  return true;
}
