import fs from "node:fs/promises";
import path from "node:path";
import { FRAMED_BY, serve } from "../shared/http.mjs";

// The release server's files by their path (./production.mjs), what Vite serves in the source
// checkout and the preview's routes leave (./routes.mjs, which answer the kit's and vendors' files by
// their stamp): the built workbench (web/: its index.html at /, never kept, a new version's page asked
// for each time; its assets/, named by their hash, kept for good), and the kit's and vendors' files by
// their path (/kit/<file>, /vendor/<path>: KaTeX's fonts as its stylesheet names them, the editor's
// /kit/code.js and /vendor/katex/…, an older source's own tags), asked again each time (no-cache).
// A path is read only inside its folder: one that leaves it (.., an encoded separator, a backslash, a
// NUL) is refused, never resolved.

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".txt": "text/plain; charset=utf-8",
};
export const typeOf = (file) => TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";

/**
 * The file `relative` (a URL's path below a route, as it came: still encoded) names in `folder`, or
 * null when it would leave the folder or is no plain name: "..", ".", an empty part, a backslash, a NUL, a
 * colon (a drive, a Windows stream) or an encoded "/" or "\" (decoded, they would be separators), or anything that does not decode.
 */
export function fileIn(folder, relative) {
  if (/%(?:2f|5c|00)/i.test(relative) || /[\\\0]/.test(relative)) return null;
  let decoded;
  try {
    decoded = decodeURIComponent(relative);
  } catch {
    return null;
  }
  const parts = decoded.split("/");
  if (parts.some((part) => part === "" || part === "." || part === ".." || /[\\\0:]/.test(part))) return null;
  const file = path.resolve(folder, ...parts);
  const inside = path.relative(folder, file);
  return inside && !inside.startsWith("..") && !path.isAbsolute(inside) ? file : null;
}

/**
 * Answer `request` with a static file of `web` (the built workbench), `kit` or `vendor`; false when its
 * path is none of theirs. A GET or HEAD only.
 */
export async function serveStatic(request, response, { web, kit, vendor }) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  const pathname = new URL(request.url || "/", "http://localhost").pathname;
  let file = null;
  let headers = null;
  if (pathname === "/" || pathname === "/index.html") {
    if (!web) return false;
    [file, headers] = [path.join(web, "index.html"), { "Cache-Control": "no-store", ...FRAMED_BY }]; // framed by Gallery's own pages alone
  } else {
    const routes = [["/assets/", web && path.join(web, "assets"), "max-age=31536000, immutable"], ["/kit/", kit, "no-cache"], ["/vendor/", vendor, "no-cache"]];
    const route = routes.find(([prefix, folder]) => folder && pathname.startsWith(prefix));
    if (!route) return false;
    file = fileIn(route[1], pathname.slice(route[0].length));
    headers = { "Cache-Control": route[2] };
  }
  const body = file ? await fs.readFile(file).catch(() => null) : null;
  if (!body) {
    serve(response, { status: 404 });
    return true;
  }
  serve(response, { type: typeOf(file), headers: { ...headers, "X-Content-Type-Options": "nosniff" }, body: request.method === "HEAD" ? undefined : body });
  return true;
}
