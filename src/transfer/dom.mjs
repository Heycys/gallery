import { JSDOM } from "jsdom";
import katex from "katex";
import "katex/contrib/mhchem";
import { instrument } from "../editor/source.mjs";

// The page editor's own modules, in a worker (worker.mjs): a jsdom window whose globals they use
// (document, DOMParser, Node…), the document of the job at hand, and KaTeX (formulas drawn as the
// page draws them: with mhchem, and the kit's macros, page/tex.mjs renderTex). A report opens as the page editor opens it (instrument, then each text block
// prepared and every unit and box marked with its kind: core.mjs prepareBlock, captureLayout), so
// the clipboard's description of blocks (clipboard/own/describe.mjs), the paste's building of them
// (own/blocks.mjs) and the commit's nodes (core.mjs nodeOf) work here as there.

const GLOBALS = ["window", "document", "DOMParser", "XMLSerializer", "Node", "Element", "HTMLElement", "HTMLImageElement", "HTMLAnchorElement", "HTMLTemplateElement",
  "DocumentFragment", "Text", "NodeFilter", "Range", "getComputedStyle", "CSS", "CustomEvent", "Event", "MutationObserver"];

let core = null;

/** A new document of `html` (a page, or a blank one), its window's globals the global ones. Returns the document. */
export function openDocument(html = "<!doctype html><html><head></head><body><main></main></body></html>") {
  return openWindow(html).document;
}

// A jsdom of `html`, its window's globals the global ones (`places`: it keeps where the parser found each node).
function openWindow(html, places = false) {
  const dom = new JSDOM(html, { url: "https://studio.invalid/", includeNodeLocations: places });
  const { window } = dom;
  for (const name of GLOBALS) if (window[name] !== undefined) globalThis[name] = window[name];
  globalThis.katex = katex;
  return { document: window.document, dom };
}

/** The page editor's core (src/editor/page/core.mjs), imported once a window is there. */
export async function editorCore() {
  core ??= await import("../editor/page/core.mjs");
  return core;
}

/** Report `source` opened as the page editor opens it: { document, map }. */
export async function openReport(source) {
  const { html, map } = instrument(source);
  const { document } = openWindow(html);
  await prepared(document, map);
  return { document, map };
}

// Each text block prepared and every unit and box marked with its kind, as the page editor opens a report.
async function prepared(document, map) {
  const { prepareBlock, captureLayout } = await editorCore();
  for (const block of map.blocks) {
    if (block.kind === "code" || block.kind === "tex") continue; // their text as the file has it
    const node = document.querySelector(`[data-ge-block="${block.id}"]`);
    if (node) prepareBlock(node, block);
  }
  captureLayout(document, map);
}

/**
 * Report `source` opened as openReport opens it, and where in `source` the parser found each node:
 * { document, map, placeOf(node) }, placeOf giving { start, end, tagEnd } (offsets in `source`: where
 * the node starts, ends, and where its start tag ends; null for a node the page editor made, or for
 * the inside of a text block it prepared). The page's marks (instrument) are the only text the opened
 * page has that `source` has not, attributes inserted before a start tag's end, which are taken off.
 */
export async function openReportPlaced(source) {
  const { html, map } = instrument(source);
  const { document, dom } = openWindow(html, true);
  // Each insertion's place in `html` and all the marks' length up to its end, for a search.
  let total = 0;
  const shifts = insertionsOf(source, html).map(([at, length]) => [at, (total += length)]);
  const back = (offset) => {
    let low = 0;
    let high = shifts.length; // the first insertion at or after `offset`
    while (low < high) {
      const middle = (low + high) >> 1;
      if (shifts[middle][0] < offset) low = middle + 1;
      else high = middle;
    }
    return offset - (low > 0 ? shifts[low - 1][1] : 0);
  };
  const places = new Map();
  const walk = (node) => {
    const location = dom.nodeLocation(node);
    if (location) places.set(node, { start: back(location.startOffset), end: back(location.endOffset), tagEnd: location.startTag ? back(location.startTag.endOffset) : null });
    for (const child of node.childNodes) walk(child);
    if (node.localName === "template") walk(node.content);
  };
  walk(document);
  await prepared(document, map);
  return { document, map, placeOf: (node) => places.get(node) ?? null };
}

// Where `html` (`source` with the page's marks put in: " data-ge-…" attributes, instrument.mjs) holds
// text `source` has not: [[offset in html, length]], in order.
function insertionsOf(source, html) {
  const out = [];
  const mark = / data-ge-[a-z-]+(?:="[^"]*")?/y;
  for (let at = 0, from = 0; from < html.length;) {
    if (at < source.length && source.charCodeAt(at) === html.charCodeAt(from)) {
      at++;
      from++;
      continue;
    }
    let end = from;
    for (mark.lastIndex = end; mark.test(html); mark.lastIndex = end) end = mark.lastIndex;
    if (end === from) throw new Error(`The page's marks do not account for offset ${from}.`);
    out.push([from, end - from]);
    from = end;
  }
  return out;
}
