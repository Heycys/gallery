import fs from "node:fs/promises";
import { currentCatalog, packagePath, packageStampNow } from "../shared/component-catalog.mjs";
import { packageScript } from "../shared/export-wrap.mjs";
import { serveFound } from "../shared/http.mjs";
import { extensionOf, mediaTypeOf } from "../shared/media.mjs";

// The preview server's route for the files of a component package,
// /__gallery/components/<scope>/<name>/<file>: what a package's catalog entry says a page may have of
// it (`files`: kit.js, style.css, the menus' two pictures and the files its `assets` name), and nothing else of
// its folder or of any other. A name is found in that list as it is written, so that no spelling of a
// path reaches anything: dots, a slash or a backslash encoded, another case (the system's, on Windows),
// a name with a colon or a dot at its end; a link out of the folder is no file of it (packagePath).
// kit.js comes as a page runs it (packageScript), the rest as its bytes.
// All of /__gallery/components/ is this route's: what it does not find goes no further.
// A file named by the package's stamp (?v=<stamp>: packageAddress) is kept by the browser for good, as
// the kit's are, when that is the stamp of the catalog in use, the only one a page holds, and of what
// the disk holds now (the catalog in use comes a moment after a write, and holds a package half
// written: bytes a browser kept under a stamp they are not of would come back with it). By its path
// alone, or under another stamp, it is never kept, and the disk is not looked at for it.

const PREFIX = "/__gallery/components/";
const ROUTE = /^\/__gallery\/components\/([a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*)\/(.+)$/;
// What a browser refuses by any other type: a script, a style, a module and WebAssembly compiled as it comes.
const TYPES = { js: "text/javascript; charset=utf-8", mjs: "text/javascript; charset=utf-8", css: "text/css; charset=utf-8", wasm: "application/wasm" };

/** Answer `response` with the file `pathname` names, or 404; false when `pathname` is none of this route's. `stamp`: the ?v= it came with. */
export async function serveComponentFile(pathname, stamp, response, { root }) {
  if (!pathname.startsWith(PREFIX)) return false;
  const [, id, file] = ROUTE.exec(pathname) ?? [];
  const found = id ? currentCatalog(root).packages.get(id) : null;
  const real = found?.files.includes(file) ? packagePath(found, file) : null;
  const bytes = real ? await fs.readFile(real).catch(() => null) : null;
  const body = bytes && file === "kit.js" ? Buffer.from(packageScript(bytes.toString("utf8").replace(/^\uFEFF/, ""))) : bytes;
  const kept = body && stamp === found.stamp && stamp === packageStampNow(found); // after the bytes: a write between the two keeps nothing
  serveFound(response, body, {
    type: body ? TYPES[extensionOf(file)] ?? mediaTypeOf(file) : undefined,
    headers: { "X-Content-Type-Options": "nosniff", "Cache-Control": kept ? "max-age=31536000, immutable" : "no-store" },
  });
  return true;
}
