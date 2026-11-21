import fs from "node:fs/promises";
import path from "node:path";
import { ts } from "./typescript.mjs";
import { COMPONENTS, instancesOf } from "../shared/components/index.mjs";
import { PACKAGE_MARK } from "../shared/components/installed.mjs";
import { MATH_IGNORED_TAGS } from "../shared/components/math.mjs";
import { attr, elementsOf, walk } from "../shared/html-tree.mjs";
import { componentBlockFlows, componentFlows, componentRuntime } from "./component-runtime.mjs";
import { kitPublicDirectory, projectRoot, release, vendorDirectory } from "../shared/paths.mjs";
import { parseReport } from "./report-tree.mjs";

// The shared assets a report page loads, listed once (docs/render.md, "Assets"): the kit's files
// (src/render/kit/, served as /kit/*) and the vendor libraries (D3, KaTeX). The rest follows from
// this list: the tags the render puts in a page for them (in this order; a source writes none, and
// an older one that writes them keeps them), which of them a report uses (its components' `uses`,
// src/shared/components/, and each asset's global), what the checks ask of the tags a source
// writes, how kit-build.mjs makes each kit file, the preview's public files and an export's inline
// copies.
//
//   id      the asset's name, its tag's data-doc-kit or data-doc-vendor
//   file    a kit file, /kit/<file>, made by kit-build.mjs as `build` says: read (as it is), bundle
//           (an esbuild bundle of a source and its imports, with `options`, an object or a function
//           that makes it when the file is built; with `grammars`, Shiki's grammars before it, a line
//           each, of which an export keeps those its code uses: src/shared/code-grammars.mjs) or styles (the
//           stylesheets an index lists, joined)
//   vendor  a vendor file: { path: its public path, source: where it is under node_modules }
//   api     the global it defines: a report whose script names it uses it
//   always  every report loads it
//   added   every report with a main[data-doc-id] loads it (the reader's display settings,
//           ui.js, which keep their choices under that id: the page edited hides their button),
//           and every custom page (where ui.js handles the theme alone)
//   page    every custom page loads it, and no document (the board's grid: board/)
//   after   the assets that must load before it
//   umd     a UMD bundle: in an export it runs with the CommonJS globals shadowed

// A vendor file's source: under node_modules in the source checkout; in the release its copy in the
// package's vendor/, at its public path (src/cli/release-build.mjs copies it there), and KaTeX's fonts and
// mhchem in vendor/katex/.
const modules = path.join(projectRoot, "node_modules");
export const d3SourcePath = path.join(modules, "d3", "dist", "d3.min.js");
const katexDistDirectory = release ? path.join(vendorDirectory, "katex") : path.join(modules, "katex", "dist");
export const katexFontsSourceDirectory = path.join(katexDistDirectory, "fonts");
/** KaTeX's mhchem alone (\ce, \pu), for the page editor on a page served without math.js, which bundles it. */
export const mhchemSourcePath = path.join(katexDistDirectory, "contrib", "mhchem.min.js");

export const ASSETS = [
  { id: "styles", file: "report.css", build: { styles: "styles/index.css" }, always: true },
  { id: "katex-styles", vendor: { path: "/vendor/katex/katex.min.css", source: path.join(katexDistDirectory, "katex.min.css") } },
  { id: "runtime", file: "runtime.js", build: { bundle: "runtime/index.js", options: () => ({ minify: false, define: { __COMPONENT_RUNTIME__: JSON.stringify(componentRuntime()), __COMPONENT_FLOWS__: JSON.stringify(componentFlows()), __COMPONENT_BLOCK_FLOWS__: JSON.stringify(componentBlockFlows()) } }) }, api: "DocKit", always: true },
  { id: "code", file: "code.js", build: { bundle: "code.js", options: { minify: true, legalComments: "inline" }, grammars: true }, api: "DocCode", after: ["runtime"] },
  { id: "state", file: "state.js", build: { read: "state.js" }, api: "DocState", always: true },
  { id: "sheets", file: "sheets.js", build: { read: "sheets.js" }, api: "DocSheets", after: ["runtime", "state"] },
  { id: "tokens", file: "tokens.js", build: { read: "tokens.js" }, api: "DocTokens", always: true },
  { id: "ui", file: "ui.js", build: { bundle: "ui.js", options: { minify: false } }, added: true, after: ["runtime", "state", "tokens"] },
  { id: "dialogs", file: "dialogs.js", build: { read: "dialogs.js" }, api: "DocDialogs", after: ["runtime"] },
  { id: "katex", vendor: { path: "/vendor/katex/katex.min.js", source: path.join(katexDistDirectory, "katex.min.js") }, umd: true },
  { id: "katex-auto-render", vendor: { path: "/vendor/katex/auto-render.min.js", source: path.join(katexDistDirectory, "contrib", "auto-render.min.js") }, umd: true, after: ["katex"] },
  { id: "math", file: "math.js", build: { bundle: "math-bundle.js", options: { minify: false, legalComments: "inline", alias: { katex: path.join(projectRoot, "src", "render", "kit", "page-katex.js") }, nodePaths: [path.join(modules, "katex")] } }, api: "DocMath", after: ["runtime", "katex-styles", "katex", "katex-auto-render"] },
  { id: "d3", vendor: { path: "/vendor/d3.v7.9.0.min.js", source: d3SourcePath }, api: "d3", umd: true },
  { id: "charts", file: "charts.js", build: { bundle: "charts/index.js", options: { minify: false } }, api: "DocCharts", after: ["runtime", "tokens"] },
  { id: "tables", file: "tables.js", build: { bundle: "tables/index.js", options: { minify: false } }, api: "DocTables", after: ["runtime"] },
  { id: "board-styles", file: "board.css", build: { styles: "board/index.css" }, page: true },
  { id: "board", file: "board.js", build: { bundle: "board/index.js", options: { minify: false } }, page: true },
];

export const publicPathOf = (asset) => (asset.file ? `/kit/${asset.file}` : asset.vendor.path);
/** Where the preview's copy of an asset is (public/kit, public/vendor: writeSharedAssets writes it, Vite serves it at its public path). */
export const publicFileOf = (asset) => (asset.file ? path.join(kitPublicDirectory, asset.file) : path.join(vendorDirectory, ...asset.vendor.path.split("/").slice(2)));
if (release) for (const asset of ASSETS) if (asset.vendor) asset.vendor.source = publicFileOf(asset);
const isStyle = (asset) => publicPathOf(asset).endsWith(".css");
const markOf = (asset) => (asset.file ? "data-doc-kit" : "data-doc-vendor");
const assetOf = (id) => ASSETS.find((asset) => asset.id === id);

/**
 * An asset's tag, as the render puts it in a page (and as an older source writes it). `href`: where
 * the page loads it from, its public path by default (the preview server names it by its stamp:
 * src/server/stamps.mjs).
 */
export const tagOf = (asset, href = publicPathOf(asset)) => (isStyle(asset)
  ? `<link rel="stylesheet" href="${href}" ${markOf(asset)}="${asset.id}">`
  : `<script src="${href}" ${markOf(asset)}="${asset.id}"></script>`);

/**
 * Every shared asset tag a page may hold, in its load order, with the element and the attribute
 * (data-doc-kit or data-doc-vendor) an export's inline copy of it has.
 */
export const kitTags = ASSETS.map((asset) => ({ id: asset.id, tag: tagOf(asset), always: Boolean(asset.always), element: isStyle(asset) ? "style" : "script", attribute: markOf(asset) }));

/**
 * The tags of the assets `ids` names and those they load after, in load order, but what every page
 * loads: what a page takes to run what a component package asks for (`assets`) when it was served
 * without them. `href(asset)`: where it loads each from, as withKitTags takes it.
 */
export function assetTags(ids, href = publicPathOf) {
  const wanted = new Set();
  const want = (id) => {
    if (wanted.has(id)) return;
    wanted.add(id);
    assetOf(id)?.after?.forEach(want);
  };
  ids.forEach(want);
  return ASSETS.filter((asset) => wanted.has(asset.id) && !asset.always && !asset.added).map((asset) => tagOf(asset, href(asset)));
}

/** What is wrong with a list of assets used by components (an empty list when nothing). */
export function assetProblems(assets = ASSETS, components = COMPONENTS) {
  const problems = [];
  const ids = assets.map((asset) => asset.id);
  for (const id of new Set(ids.filter((id, index) => ids.indexOf(id) !== index))) problems.push(`the asset "${id}" is listed twice`);
  for (const asset of assets) {
    if (Boolean(asset.file) === Boolean(asset.vendor)) problems.push(`the asset "${asset.id}" is a kit file (file) or a vendor file (vendor), one of them`);
    if (asset.file && !["read", "bundle", "styles"].some((how) => typeof asset.build?.[how] === "string")) problems.push(`the kit file "${asset.file}" does not say how it is made (build: read, bundle or styles)`);
    if (asset.vendor && !(asset.vendor.path && asset.vendor.source)) problems.push(`the vendor asset "${asset.id}" needs its public path and its source`);
    for (const before of asset.after ?? []) {
      if (!ids.includes(before)) problems.push(`the asset "${asset.id}" loads after "${before}", which is no asset`);
      else if (ids.indexOf(before) > ids.indexOf(asset.id)) problems.push(`the asset "${asset.id}" loads after "${before}", which the list puts after it`);
    }
    const users = components.filter((component) => (component.assets ?? []).includes(asset.id));
    if (!asset.always && !asset.api && !asset.added && !asset.page && users.length === 0) problems.push(`no report would keep the asset "${asset.id}": it is not always kept, defines no global and no component needs it`);
  }
  for (const component of components) {
    for (const id of component.assets ?? []) if (!ids.includes(id)) problems.push(`the component "${component.id}" needs "${id}", which is no asset`);
  }
  return problems;
}
{
  const problems = assetProblems();
  if (problems.length > 0) throw new Error(`src/render/assets.mjs: ${problems.join("; ")}`);
}

// A script a browser runs as JavaScript: no type, a JavaScript type (the HTML standard's list) or a
// module. A script of JSON is data.
const SCRIPT_TYPE = /^(?:|module|(?:text|application)\/(?:x-)?(?:javascript|ecmascript)|text\/javascript1\.[0-5]|text\/(?:jscript|livescript))$/;
const JSON_TYPE = /^application\/(?:\S+\+)?json$/;
const typeOf = (node) => (attr(node, "type") ?? "").trim().toLowerCase();

// A script's code without its comments, its tokens apart by spaces. TypeScript's parser reads it, so a
// "//" in a string, a template or a regular expression is code (a URL in a string never hides what
// follows it); what it cannot parse stays in as tokens of their own.
function withoutComments(source) {
  const file = ts.createSourceFile("report.js", source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const tokens = [];
  const stack = [file];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node.kind >= ts.SyntaxKind.FirstJSDocNode && node.kind <= ts.SyntaxKind.LastJSDocNode) continue; // a /** */ comment's
    const children = node.getChildren(file);
    if (children.length === 0) tokens.push(source.slice(node.getStart(file), node.end));
    for (let index = children.length - 1; index >= 0; index -= 1) stack.push(children[index]);
  }
  return tokens.join(" ");
}

// Any of the assets' globals as a word: a script that names none needs no parsing (most scripts).
const namesOf = (assets) => new RegExp(`\\b(?:${assets.filter((asset) => asset.api).map((asset) => asset.api).join("|")})\\b`);

// The code a report runs that may name a global (`names`), comments left out: its inline scripts of
// JavaScript (in templates too, which run once put on the page), its event handler attributes (on…)
// and its javascript: addresses. A browser takes an address's tabs and line breaks out, and what is
// blank or a control character before it, then runs a javascript: one decoded (the URL standard).
function codeOf(tree, names) {
  const code = [];
  const add = (source) => {
    if (names.test(source)) code.push(withoutComments(source));
  };
  walk(tree, (node) => {
    if (node.tagName === "script" && attr(node, "src") === undefined && SCRIPT_TYPE.test(typeOf(node))) {
      add(node.childNodes.map((child) => child.value ?? "").join(""));
    }
    for (const { name, value } of node.attrs ?? []) {
      if (/^on/.test(name)) {
        add(value);
        continue;
      }
      const address = value.replace(/[\t\n\r]/g, "").replace(/^[\x00-\x20]+/, "");
      if (!/^javascript:/i.test(address)) continue;
      let script = address.slice("javascript:".length);
      try {
        script = decodeURIComponent(script);
      } catch {}
      add(script);
    }
  });
  return code.join("\n");
}

// The report's text where its blocks and formulas are: all of it but its comments and the text its
// code samples, styles and form fields (the elements KaTeX leaves as they are, MATH_IGNORED_TAGS; a
// script by its type) and its scripts of JSON hold, at any depth, each cut a space. Tags stay, those
// of the elements in a sample too: a block the parser puts there (its tags written in it, or a sample
// left open) is the page's, as a browser shows it. Its other scripts stay whole, as they may write
// blocks and formulas into the page.
function markupOf(tree, text) {
  const cuts = [];
  const visit = (parent, sample) => {
    for (const node of parent.childNodes ?? []) {
      const at = node.sourceCodeLocation;
      if (node.nodeName === "#comment" || (sample && node.nodeName === "#text")) {
        if (at) cuts.push([at.startOffset, at.endOffset]);
      } else if (node.tagName === "script") {
        visit(node, JSON_TYPE.test(typeOf(node)));
      } else if (node.tagName) {
        // A template's content (one in an <svg> or <math> has none: its children).
        visit(node.content ?? node, sample || MATH_IGNORED_TAGS.includes(node.tagName));
      }
    }
  };
  visit(tree, false);
  let markup = "";
  let cursor = 0;
  // In the source's order: the parser may have moved an element ahead (out of a table, as a browser does).
  for (const [start, end] of cuts.sort((a, b) => a[0] - b[0])) {
    if (start < cursor) continue;
    markup += `${text.slice(cursor, start)} `;
    cursor = end;
  }
  return markup + text.slice(cursor);
}

/**
 * The ids of the optional assets a report uses, its shared tags taken out: a component's when one of
 * its `uses` patterns matches the report's text outside comments and code samples (markupOf) or the
 * page has one (its `match`: a block the parser puts in a code sample, which a browser shows, too),
 * an asset's when the code its scripts run names its global (codeOf), and those an asset kept loads
 * after. Broad on purpose: a false match only keeps an asset, a missed one breaks the page.
 */
export function usedAssets(html, assets = ASSETS, components = COMPONENTS) {
  const text = assets.reduce((source, asset) => source.replaceAll(tagOf(asset), ""), html);
  const tree = parseReport(text);
  const markup = markupOf(tree, text);
  const code = codeOf(tree, namesOf(assets));
  const used = new Set();
  // An asset kept keeps those it loads after (DocCharts keeps the runtime and the tokens).
  const keep = (id) => {
    if (used.has(id)) return;
    used.add(id);
    (assets.find((asset) => asset.id === id)?.after ?? []).forEach(keep);
  };
  for (const component of components) {
    if (!(component.assets ?? []).length) continue;
    const found = (component.uses ?? []).some((pattern) => pattern.test(markup)) || (component.match && instancesOf(tree, component).length > 0);
    if (found) component.assets.forEach(keep);
  }
  for (const asset of assets) if (asset.api && new RegExp(`\\b${asset.api}\\b`).test(code)) keep(asset.id);
  return used;
}

/**
 * Drop the shared tags an (older) source writes that the report never uses, so previews and exports
 * carry only what renders: { html, removed (their ids), used (usedAssets) }. `components`: those it
 * may hold, the component packages it uses among them.
 */
export function pruneUnusedKitTags(html, components = COMPONENTS) {
  const used = usedAssets(html, ASSETS, components);
  const removed = [];
  for (const asset of ASSETS) {
    const tag = tagOf(asset);
    if (asset.always || asset.added || used.has(asset.id) || !html.includes(tag)) continue;
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    html = html.replace(new RegExp(`[ \\t]*${escaped}[ \\t]*\\r?\\n?`), "");
    removed.push(asset.id);
  }
  return { html, removed, used };
}

// The kit's tags a page writes, as the parse tree finds them (none a comment, a code sample or a
// script's text spells, nor one a template holds, which loads nothing), in the file's order: each
// element that loads an asset's file (a script's src, a stylesheet link's href is its public path),
// { asset, start, end, line, exact } (exact: written as tagOf writes it, the text the build prunes
// and an export inlines).
function writtenKitTags(html, tree) {
  const found = [];
  walk(tree, (node) => {
    const loads = addressOf(node);
    const asset = loads === undefined ? undefined : ASSETS.find((each) => publicPathOf(each) === loads.trim());
    const at = node.sourceCodeLocation;
    if (!asset || !at) return;
    found.push({ asset, start: at.startOffset, end: at.endOffset, line: at.startLine, exact: html.slice(at.startOffset, at.endOffset) === tagOf(asset) });
  }, { inTemplates: false });
  return found;
}

const isStylesheet = (node) => node.tagName === "style" || (node.tagName === "link" && (attr(node, "rel") ?? "").toLowerCase().split(/\s+/).includes("stylesheet"));
// What a script or a stylesheet link loads.
const addressOf = (node) => (node.tagName === "script" ? attr(node, "src") : isStylesheet(node) ? attr(node, "href") : undefined);
const located = (node) => Boolean(node.sourceCodeLocation);
const eolOf = (html) => (html.includes("\r\n") ? "\r\n" : "\n");

// Where a tag goes, { at, text(tag) }: before what starts at `at` (an element, or with `closing` an
// end tag), on a line of its own at that line's indent (one level more before an end tag) when only
// blanks stand before it there, else right before it; after what ends at `at`, on a line of its own
// at the indent of the line it ends on.
function placeBefore(html, at, { closing = false } = {}) {
  const lineStart = at === 0 ? 0 : html.lastIndexOf("\n", at - 1) + 1;
  const lead = html.slice(lineStart, at);
  if (!/^[ \t]*$/.test(lead)) return { at, text: (tag) => tag };
  const indent = closing ? `${lead}  ` : lead;
  return { at: lineStart, text: (tag) => `${indent}${tag}${eolOf(html)}` };
}
function placeAfter(html, at) {
  const indent = /^[ \t]*/.exec(html.slice(html.lastIndexOf("\n", at - 1) + 1))[0];
  return { at, text: (tag) => `${eolOf(html)}${indent}${tag}` };
}

// The page's own <main> (the first, none a template holds), or undefined.
function pageMain(tree) {
  let main;
  walk(tree, (node) => {
    if (!main && node.tagName === "main") main = node;
  }, { inTemplates: false });
  return main;
}

const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";

// What a tag put before a script stands before: the outermost <svg> or <math> holding it, or the
// script itself. A <script> in an <svg> is the SVG's, which loads no src: the kit's tags go before the
// <svg> instead, so they are the page's and still load before that script runs.
function outermostForeign(node) {
  let outermost = node;
  for (let parent = node.parentNode; parent?.tagName; parent = parent.parentNode) {
    if (parent.namespaceURI !== HTML_NAMESPACE) outermost = parent;
  }
  return outermost;
}

// Where the kit's tags of a kind go in a page that writes none of them. Its stylesheets: in its head,
// before its own first stylesheet (a <style> or a linked one: the kit's rules come first, so the
// report's own win over those of the same weight), else at the head's end. Its scripts: in its body
// (ui.js puts its button there as it loads), before its first script of JavaScript after its main,
// where a report's own script goes (one that calls DocCharts.define runs once
// charts.js has), or before the outermost <svg> or <math> holding it; else at the body's end. Never in
// the main nor before it: charts.js starts each card as the parser reaches it, so a card below the
// kit's scripts could start before the parser has read it whole (earlyScriptFailures tells a script
// in or before the main that names a global of the kit to move after it). A page that writes no
// <head>, or no </body>, gets them where a browser still reads them as its head's or its body's.
function freePlace(html, tree, style) {
  const page = elementsOf(tree).find((node) => node.tagName === "html");
  const head = elementsOf(page ?? {}).find((node) => node.tagName === "head");
  const body = elementsOf(page ?? {}).find((node) => node.tagName === "body");
  if (style) {
    const children = elementsOf(head ?? {}).filter(located);
    const own = children.find(isStylesheet);
    if (own) return placeBefore(html, own.sourceCodeLocation.startOffset);
    if (head?.sourceCodeLocation?.endTag) return placeBefore(html, head.sourceCodeLocation.endTag.startOffset, { closing: true });
    if (children.length > 0) return placeAfter(html, children.at(-1).sourceCodeLocation.endOffset);
    if (head?.sourceCodeLocation) return placeAfter(html, head.sourceCodeLocation.startTag.endOffset);
    const first = body?.sourceCodeLocation?.startTag?.startOffset ?? elementsOf(body ?? {}).find(located)?.sourceCodeLocation.startOffset;
    if (first !== undefined) return placeBefore(html, first);
  } else {
    // After the main: none in it, as the tree holds it (a main left open too), and past its start.
    const main = pageMain(tree);
    const after = (node) => {
      for (let parent = node.parentNode; parent; parent = parent.parentNode) if (parent === main) return false;
      return !main?.sourceCodeLocation || node.sourceCodeLocation.startOffset > main.sourceCodeLocation.startOffset;
    };
    let script;
    walk(body ?? {}, (node) => {
      if (!script && node.tagName === "script" && located(node) && SCRIPT_TYPE.test(typeOf(node)) && after(node)) script = node;
    }, { inTemplates: false });
    if (script) return placeBefore(html, outermostForeign(script).sourceCodeLocation.startOffset);
    const end = body?.sourceCodeLocation?.endTag ?? page?.sourceCodeLocation?.endTag;
    if (end) return placeBefore(html, end.startOffset, { closing: true });
  }
  return { at: html.length, text: (tag) => `${eolOf(html)}${tag}` };
}

// Where each asset's tag is in the page, or would go, by its id, in the list's order: the first the
// page writes, { at, written } (its start, writtenKitTags's entry), else { at, text(tag) }. A tag goes
// among the kit's tags of its kind (stylesheets, scripts) that the page writes: right after the last
// of them the list puts before it, else right before the first of them; in a page that writes none of
// its kind, where freePlace says (only with `free`: else it has no place).
function placesOf(html, tree, { free }) {
  const written = writtenKitTags(html, tree);
  const places = new Map();
  for (const style of [true, false]) {
    const kind = ASSETS.filter((asset) => isStyle(asset) === style);
    const firstOf = (asset) => written.find((each) => each.asset === asset);
    const first = kind.map(firstOf).find(Boolean);
    let place = first ? placeBefore(html, first.start) : free ? freePlace(html, tree, style) : null;
    for (const asset of kind) {
      const mine = firstOf(asset);
      if (mine) {
        places.set(asset.id, { at: mine.start, written: mine });
        place = placeAfter(html, mine.end);
      } else if (place) places.set(asset.id, place);
    }
  }
  return places;
}

// The page with the tags of the assets `needed` it does not write, where placesOf says. Those that go
// to one place go in the list's order, each loading its file from `href(asset)`, as do those the page
// writes as tagOf writes them (when `href` is not the public path).
function withTags(html, needed, { tree = parseReport(html), free, href = publicPathOf }) {
  const changes = [];
  for (const [id, place] of placesOf(html, tree, { free })) {
    const asset = assetOf(id);
    if (!place.written) {
      if (needed.has(id)) changes.push({ at: place.at, end: place.at, text: place.text(tagOf(asset, href(asset))) });
    } else if (place.written.exact && href(asset) !== publicPathOf(asset)) {
      // One the page writes as the kit writes it loads its file from there too.
      changes.push({ at: place.written.start, end: place.written.end, text: tagOf(asset, href(asset)) });
    }
  }
  if (changes.length === 0) return html;
  changes.sort((a, b) => a.at - b.at); // stable: those at one place stay in the list's order
  let result = "";
  let cursor = 0;
  for (const { at, end, text } of changes) {
    result += html.slice(cursor, at) + text;
    cursor = end;
  }
  return result + html.slice(cursor);
}

/**
 * The page with every shared tag it needs and does not write (docs/render.md, "Kit tags"): the assets
 * every report loads, those it uses (`used`, usedAssets) and, where its main has a data-doc-id,
 * those every report page gets (ui.js), in their order; with `page` (a custom page,
 * src/render/page-html.mjs), those every report page gets and those every custom page does (the board's). A source need write none, and an older one
 * that writes them keeps them: what it lacks goes among them. The render (renderReportHtml) runs it
 * on every page it shows, builds or exports. `href(asset)`: where the kit's tags load their file
 * from, those it puts in and those the page writes as the kit writes them (the preview server
 * names each file by its stamp: src/server/stamps.mjs); its public path by default, as a source
 * writes it, and then the tags the page writes are left as they are.
 */
export function withKitTags(html, { used = usedAssets(html), href = publicPathOf, page = false } = {}) {
  const tree = parseReport(html);
  const reportId = attr(pageMain(tree) ?? {}, "data-doc-id") !== undefined;
  const needed = new Set(ASSETS.filter((asset) => asset.always || used.has(asset.id) || (asset.added && (reportId || page)) || (asset.page && page)).map((asset) => asset.id));
  return withTags(html, needed, { tree, free: true, href });
}

/**
 * The source with the tags of the shared assets its blocks need and it lacks (one the page editor
 * made: a Sheet area needs sheets.js), where it writes the kit's tags of that kind (an older source),
 * among them as withKitTags puts them; nothing for one that writes none of that kind, whose page gets
 * them from the render, or that lacks none.
 */
export function withNeededKitTags(html) {
  const used = usedAssets(html);
  return withTags(html, new Set(ASSETS.filter((asset) => !asset.always && !asset.added && used.has(asset.id)).map((asset) => asset.id)), { free: false });
}

/**
 * The page, its kit's tags all in, with `styles` right after the last of its stylesheets and `scripts`
 * right after the last of its scripts, each on a line of its own, for what uses the kit: its names are
 * there when they run, and a report's own style and script still come after them. A tag names its file
 * by its public path or by its stamp (withKitTags).
 */
export function afterKitTags(html, { styles, scripts }) {
  const tree = parseReport(html);
  const loaded = [];
  walk(tree, (node) => {
    const asset = ASSETS.find((each) => publicPathOf(each) === addressOf(node)?.trim().split("?")[0]);
    if (asset && located(node)) loaded.push({ style: isStyle(asset), end: node.sourceCodeLocation.endOffset });
  }, { inTemplates: false });
  const changes = [[true, styles], [false, scripts]].filter(([, tags]) => tags.length > 0).map(([style, tags]) => {
    const last = loaded.filter((each) => each.style === style).at(-1);
    const place = last ? placeAfter(html, last.end) : freePlace(html, tree, style);
    return { at: place.at, text: tags.map(place.text).join("") };
  });
  let result = "";
  let cursor = 0;
  for (const { at, text } of changes.sort((a, b) => a.at - b.at)) {
    result += html.slice(cursor, at) + text;
    cursor = at;
  }
  return result + html.slice(cursor);
}

/**
 * What is wrong with the kit's tags a source writes. It need write none (the render puts in every
 * tag a report needs: withKitTags), and those an older source writes stay; but each of them is the
 * kit's tag as it is (tagOf: the text the build prunes and an export inlines; one written otherwise
 * would be left linked, and the export refuses that), written once, and they load in the order
 * their `after` lists ask. An export's inline copy of the kit (data-doc-kit="runtime-inline") is
 * none of a source's: an exported file copied in as one would load the kit twice, its copies and the
 * tags the render puts in; so is what it holds of a component package (data-doc-package). Each with its line.
 */
export function tagFailures(html, tree = parseReport(html)) {
  const failures = [];
  const copies = [];
  walk(tree, (node) => {
    const name = ["data-doc-kit", "data-doc-vendor"].find((each) => attr(node, each)?.endsWith("-inline")) ?? (attr(node, PACKAGE_MARK) === undefined ? undefined : PACKAGE_MARK);
    if (name && located(node)) copies.push({ line: node.sourceCodeLocation.startLine, mark: `${name}="${attr(node, name)}"` });
  }, { inTemplates: false });
  if (copies.length > 0) {
    const more = copies.length > 1 ? `, and ${copies.length - 1} more on line${copies.length > 2 ? "s" : ""} ${listed(copies.slice(1).map(({ line }) => line))}` : "";
    failures.push(`line ${copies[0].line}: an export's inline copy of the kit (${copies[0].mark}${more}), which a document's source never holds (the kit's tags are put in as the document is shown, so it would load twice): bring an exported file in with 导入 instead of copying it in`);
  }
  const written = writtenKitTags(html, tree);
  for (const { asset, line, exact } of written) {
    if (!exact) failures.push(`line ${line}: ${publicPathOf(asset)} is not loaded by the kit's own tag, ${tagOf(asset)}: take the tag out (the kit's tags are put in as the document is shown and exported)`);
  }
  for (const asset of ASSETS) {
    const lines = written.filter((each) => each.asset === asset).map((each) => each.line);
    if (lines.length > 1) failures.push(`${publicPathOf(asset)} is loaded ${lines.length} times (lines ${lines.join(", ")}): keep one tag, or none`);
  }
  const firstOf = (asset) => written.find((each) => each.asset === asset);
  for (const asset of ASSETS) {
    const mine = firstOf(asset);
    if (!mine) continue;
    for (const id of asset.after ?? []) {
      const before = firstOf(assetOf(id));
      if (before && before.start > mine.start) failures.push(`line ${mine.line}: ${publicPathOf(before.asset)} (line ${before.line}) must load before ${publicPathOf(asset)}`);
    }
  }
  return [...new Set(failures)];
}

// "a", "a and b", "a, b and c".
const listed = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : items[0]);

/**
 * The page's scripts that run before the kit's script defining a global they name has loaded, each
 * with its line: a classic script of JavaScript (a module runs once the page is read) whose code names
 * the global (comments left out) and stands before where that tag is or goes (placesOf: one the page
 * writes, or one the render puts in after the main, withKitTags). A call it makes as it runs fails
 * there; broad on purpose, as one that names it only in a function called later would be moved too
 * (moving it costs nothing, a call missed breaks the page): a script in the head, before the main or
 * in it moves after </main>, where a report's own script goes, and one before a tag a source writes
 * moves after that tag.
 */
export function earlyScriptFailures(html, tree = parseReport(html)) {
  const names = namesOf(ASSETS);
  const failures = [];
  let places;
  walk(tree, (node) => {
    if (node.tagName !== "script" || attr(node, "src") !== undefined || !located(node) || typeOf(node) === "module" || !SCRIPT_TYPE.test(typeOf(node))) return;
    const source = node.childNodes.map((child) => child.value ?? "").join("");
    if (!names.test(source)) return;
    const code = withoutComments(source);
    places ??= placesOf(html, tree, { free: true });
    const { startOffset: start, startLine: line } = node.sourceCodeLocation;
    const late = ASSETS.filter((asset) => asset.api && new RegExp(`\\b${asset.api}\\b`).test(code) && places.get(asset.id).at > start);
    const put = late.filter((asset) => !places.get(asset.id).written);
    if (put.length > 0) failures.push(`line ${line}: this script names ${listed(put.map((asset) => asset.api))} before the kit's scripts load (they are put in after </main>): move the script after </main>`);
    for (const asset of late.filter((each) => places.get(each.id).written)) {
      failures.push(`line ${line}: this script names ${asset.api} before ${publicPathOf(asset)} loads (line ${places.get(asset.id).written.line}): move the script after that tag`);
    }
  }, { inTemplates: false });
  return failures;
}

/**
 * The page with the first of each kit's tags it writes as tagOf writes it (found on its tree: none a
 * comment, a code sample or a script's text spells) replaced with `copyOf(entry)`, entry its kitTags
 * entry: an export's inline copies. A tag written otherwise, or again, stays as it is.
 */
export function withKitCopies(html, copyOf) {
  const done = new Set();
  let result = "";
  let cursor = 0;
  for (const { asset, start, end, exact } of writtenKitTags(html, parseReport(html))) {
    if (!exact || done.has(asset.id)) continue;
    done.add(asset.id);
    result += html.slice(cursor, start) + copyOf(kitTags.find((entry) => entry.id === asset.id));
    cursor = end;
  }
  return result + html.slice(cursor);
}

/** The scripts and stylesheets a report may link: the assets' public paths. */
export const allowedScripts = new Set(ASSETS.filter((asset) => !isStyle(asset)).map(publicPathOf));
export const allowedStyles = new Set(ASSETS.filter(isStyle).map(publicPathOf));

/** KaTeX's stylesheet; with `inlineFonts`, its fonts as data URLs (woff2 only either way). */
export async function loadKatexCss({ inlineFonts = false } = {}) {
  let source = await fs.readFile(assetOf("katex-styles").vendor.source, "utf8");
  source = source.replace(
    /src:url\((fonts\/[^)]+\.woff2)\) format\("woff2"\),url\(fonts\/[^)]+\.woff\) format\("woff"\),url\(fonts\/[^)]+\.ttf\) format\("truetype"\)/g,
    'src:url($1) format("woff2")',
  );
  if (!inlineFonts) return source;

  const fontFiles = [...new Set(
    [...source.matchAll(/url\(fonts\/([^)]+\.woff2)\)/g)].map((match) => match[1]),
  )];
  for (const fileName of fontFiles) {
    const font = await fs.readFile(path.join(katexFontsSourceDirectory, fileName));
    source = source.replaceAll(
      `url(fonts/${fileName})`,
      `url(data:font/woff2;base64,${font.toString("base64")})`,
    );
  }
  return source;
}

/** A vendor asset's text: what the preview serves, or with `inline` what an export embeds. */
export function loadVendorFile(asset, { inline = false } = {}) {
  if (asset.id === "katex-styles") return loadKatexCss({ inlineFonts: inline });
  return fs.readFile(asset.vendor.source, "utf8");
}
