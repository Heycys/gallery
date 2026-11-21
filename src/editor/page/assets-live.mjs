// A file of the document's folder written again while its page is open (docs/editor.md "A file of the folder
// written again"): an Agent copying a new picture over assets/shot.png under the name the page shows it by. The
// page names each file it shows by its stamp, /__gallery/edit/<route>/<slug>/assets/<file>?v=<stamp>
// (render/media-ref.mjs servedUrl), and a browser never fetches an address its page has used again, so the
// page has to be given the new address: the server tells it the stamps it has now (src/server/asset-news.mjs:
// "asset new <file>=<stamp>" once the file is whole and quiet, "asset now …" as the page connects for every
// file told so while the server ran), its live script (src/server/routes.mjs liveReloadScript) keeps them in
// window.__galleryAssets ({ stamps, moved }: what each file's stamp is as the page last heard, and the files
// heard of as written since the page was served) and says the ones that moved (doc-files-written, { files:
// { <file>: stamp } }), and this swaps every address of the page that names such a file by another stamp, or
// by none, for the one heard last: an element's src, srcset, href, poster, data, background and style, and a
// <style>'s text, wherever it stands (a block, a cell, the page icon, a bookmark's cover, the picture open
// large). A picture's new address is loaded and decoded first, out of sight, and swapped in only then, so the
// page never shows it blank or broken while it loads, and keeps the one it shows when the new bytes do not load
// (a file still being written: told again once it is whole). An address that already names the stamp is left
// as it is, so a picture that did not change is neither fetched again nor drawn again. A file's frame, its
// link, a media element's source take the new address at once. The addresses are the page's to show, never the
// file's: the editor writes what data-ge-<attribute> says (core.mjs), so no swap is a change of the page's to
// commit. One pass runs at a time, each by the stamps heard last as it starts: a file told again while a pass
// still loads its picture is swapped by the next one, never left at the stamp the first pass took.
// What the page puts back of what it held before a write it heard of (an undo or redo restoring a block's or a
// cell's HTML, a block taken off the page and brought back, a pull's units served a moment before, a block
// pasted from the page's own copy) names the file by the stamp it had then: once the page has heard of a file
// written again, every address of it that comes into the page, or that an attribute takes, is looked at
// (a MutationObserver), and one naming another stamp is swapped as the news would. The editor's own
// addresses of the folder's files (a picture it shows anew, a bookmark's cover, a cell's picture) name the
// stamp the page heard last (stampedUrl). In an editing page (editor.mjs) and in 演示视图 (present-links.mjs); a
// page loaded anew is served the new stamps.

const ROUTES = "asset|file|embed";
// A name of a file in assets/ the preview serves (shared/media.mjs ASSET).
const NAME = "assets/[A-Za-z0-9][A-Za-z0-9._-]{0,80}";
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const MARK = "/__gallery/edit/";

/** `url` (where the page shows `file`, assets/<name>, of its folder) with the stamp the page heard last of it, if any. */
export function stampedUrl(url, file, win = globalThis.window) {
  const stamp = win?.__galleryAssets?.stamps?.[file];
  return typeof stamp === "string" && stamp ? `${url}?v=${stamp}` : url;
}

// What may hold an address of the folder's files: an element's attributes (xlink:href an SVG <image>'s) and a <style>'s text.
const ATTRIBUTES = ["src", "srcset", "href", "xlink:href", "poster", "data", "background", "style"];
const SELECTOR = "[src], [srcset], [href], [*|href], [poster], [data], [background], [style], style";
const XLINK = "http://www.w3.org/1999/xlink";
const read = (node, name) => (name === "#text" ? node.textContent : name === "xlink:href" ? node.getAttributeNS(XLINK, "href") : node.getAttribute(name));
const write = (node, name, value) => {
  if (name === "#text") node.textContent = value;
  else if (name === "xlink:href") node.setAttributeNS(XLINK, "xlink:href", value);
  else node.setAttribute(name, value);
};
const holds = (node, name) => (name === "xlink:href" ? node.hasAttributeNS(XLINK, "href") : node.hasAttribute(name));

// Every place in `scope` (a document, or an element and what it holds) that may hold an address: visit(node, name).
function eachPlace(scope, visit) {
  const nodes = scope.nodeType === 1 ? [scope, ...scope.querySelectorAll(SELECTOR)] : scope.querySelectorAll(SELECTOR);
  for (const node of nodes) {
    if (node.localName === "style") visit(node, "#text");
    for (const name of ATTRIBUTES) if (holds(node, name)) visit(node, name);
  }
}

// The addresses of document `slug`'s files as the page holds them, whatever the file: its origin and the
// workspace's base, if any, kept (a document of another workspace is served under /~ws-<id>), its stamp
// (?v=), if any, read, and a fragment after it kept; one with a query of its own, or a longer name, is none.
// Groups: the address without its stamp, the route, the file (assets/<name>), the stamp.
const addressesOf = (slug) => new RegExp(`((?:[a-z][a-z0-9+.-]*://[^/\\s"'(),]+)?(?:/~ws-[0-9a-f]{6})?${MARK}(${ROUTES})/${escape(slug)}/(${NAME}))(?:\\?v=([0-9a-f]*))?(?![\\w.\\-/?=&])`, "g");

// A picture's address loaded and decoded where the page will show it: true once it is, false when it does not load.
const loadPicture = (win) => (url) => new Promise((resolve) => {
  const image = new win.Image();
  image.onload = () => Promise.resolve(typeof image.decode === "function" ? image.decode() : null).then(() => resolve(true), () => resolve(image.naturalWidth > 0));
  image.onerror = () => resolve(false);
  image.src = url;
});

/**
 * Swap, in document `doc`, every address of the files `files` names ({ "assets/<name>": stamp }) of the document
 * `slug`'s folder that names another stamp, or none, for the one given. A picture's (the asset route's) once
 * `load(url)` resolves true for it, every other at once. Resolves with how many addresses it swapped.
 */
export async function swapFiles(doc, files, { slug, load = loadPicture(doc.defaultView) } = {}) {
  const named = (file) => Object.hasOwn(files, file) && typeof files[file] === "string" && files[file] !== "";
  if (!slug || !Object.keys(files).some(named)) return 0;
  const pattern = addressesOf(slug);
  const base = doc.baseURI;
  const swaps = [];
  eachPlace(doc, (node, name) => {
    const value = read(node, name);
    if (!value || !value.includes(MARK)) return;
    let picture = false;
    const urls = [];
    const next = value.replace(pattern, (whole, address, route, file, stamp) => {
      if (!named(file) || stamp === files[file]) return whole; // another file, or the bytes it names are the file's now
      const shown = `${address}?v=${files[file]}`;
      if (route === "asset") {
        picture = true;
        urls.push(new URL(shown, base).href);
      }
      return shown;
    });
    if (next !== value) swaps.push({ node, name, value, next, picture, urls });
  });
  if (swaps.length === 0) return 0;
  const loads = new Map();
  for (const swap of swaps) for (const url of swap.urls) if (!loads.has(url)) loads.set(url, Promise.resolve(load(url)).catch(() => false));
  let swapped = 0;
  await Promise.all(swaps.map(async (swap) => {
    if (swap.picture && !(await Promise.all(swap.urls.map((url) => loads.get(url)))).every(Boolean)) return;
    if (!swap.node.isConnected || read(swap.node, swap.name) !== swap.value) return; // changed meanwhile: what changed it says (the watcher looks at it)
    write(swap.node, swap.name, swap.next);
    // A media element's <source> is taken by its element's next load.
    if (swap.node.localName === "source" && swap.name === "src" && typeof swap.node.parentElement?.load === "function") swap.node.parentElement.load();
    swapped += 1;
  }));
  return swapped;
}

/**
 * Follow the files of document `slug`'s folder written again in `win`'s page: the ones its live script heard of
 * before this ran swapped now, each one heard of from now on as it is (one pass at a time, by the stamps heard
 * last), and, once any was heard of, every address of such a file that comes into the page naming another stamp
 * (watched). How many addresses were swapped so far is on the page's root, data-ge-files-swapped (the scenarios
 * wait on it; no change of the page's: commit.mjs).
 */
export function followFiles({ slug, win = globalThis.window } = {}) {
  if (!win?.document || !slug) return;
  const doc = win.document;
  const heard = () => win.__galleryAssets ?? {};
  const root = doc.documentElement;
  const count = (swapped) => { if (swapped > 0) root.setAttribute("data-ge-files-swapped", String(Number(root.getAttribute("data-ge-files-swapped") ?? 0) + swapped)); };

  // One pass at a time: the files asked for while one runs wait for the next, which takes the stamps heard last.
  const waiting = new Set();
  let running = false;
  async function run() {
    running = true;
    try {
      while (waiting.size > 0) {
        const stamps = heard().stamps ?? {};
        const files = Object.fromEntries([...waiting].filter((file) => typeof stamps[file] === "string" && stamps[file]).map((file) => [file, stamps[file]]));
        waiting.clear();
        count(await swapFiles(doc, files, { slug }).catch(() => 0));
      }
    } finally {
      running = false;
    }
  }
  const swap = (names) => {
    for (const name of names) waiting.add(name);
    if (!running && waiting.size > 0) run();
  };

  // What comes into the page, or what an attribute takes, naming a file heard of as written by another stamp.
  const pattern = addressesOf(slug);
  let watcher = null;
  const watch = () => {
    if (watcher || typeof win.MutationObserver !== "function") return;
    watcher = new win.MutationObserver((records) => {
      const { stamps = {}, moved = {} } = heard();
      const stale = new Set();
      const look = (node, name) => {
        const value = read(node, name);
        if (!value || !value.includes(MARK)) return;
        for (const [, , , file, stamp] of value.matchAll(pattern)) if (Object.hasOwn(moved, file) && stamps[file] && stamp !== stamps[file]) stale.add(file);
      };
      for (const record of records) {
        const { target } = record;
        if (record.type === "attributes") {
          if (target.isConnected) look(target, record.attributeNamespace === XLINK ? "xlink:href" : record.attributeName);
          continue;
        }
        if (target.localName === "style" && target.isConnected) look(target, "#text");
        for (const node of record.addedNodes) if (node.nodeType === 1 && node.isConnected) eachPlace(node, look);
      }
      if (stale.size > 0) swap(stale);
    });
    watcher.observe(doc, { subtree: true, childList: true, attributes: true, attributeFilter: ["src", "srcset", "href", "poster", "data", "background", "style"] });
  };

  const moved = Object.keys(heard().moved ?? {});
  if (moved.length > 0) {
    watch();
    swap(moved);
  }
  win.addEventListener("doc-files-written", (event) => {
    watch();
    swap(Object.keys(event.detail?.files ?? {}));
  });
}
