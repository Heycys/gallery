import fs from "node:fs";
import path from "node:path";
import { escapeAttribute } from "../shared/escape.mjs";
import { attr, hasClass, walk } from "../shared/html-tree.mjs";
import { cssReferences } from "../shared/css-references.mjs";
import { assetFile, assetProblem, imageFile, referencedFile } from "../shared/media.mjs";
import { reportsDirectory as defaultReportsDirectory } from "../shared/paths.mjs";
import { documentDirectory } from "../shared/workspace.mjs";
import { iconImageStarts } from "./emoji.mjs";
import { frameStarts } from "./embeds.mjs";
import { fileBlocks } from "./files.mjs";
import { pictureTags } from "./images.mjs";
import { dataUrlOf, servedUrl } from "./media-ref.mjs";
import { lineAt, parseReport } from "./report-tree.mjs";

// The references a report's markup makes to files of its folder (assets/…), wherever they stand: an
// element's src, href and poster, an <object>'s data, the background of a body, a table or its parts
// (which browsers still draw), each candidate of a srcset, and in a <style> or a style attribute each
// url(…), @import and string of image-set(…), read from the parse tree (text that merely spells one,
// in a code sample, prose, a comment or a script, is none; nor is CSS in a /* */ comment or a CSS
// string, and a CSS escape is read as CSS reads it). An export embeds every one as a data: URL at its
// place in the file, so that the one file holds them, and the preview shows each where the server
// serves the folder (the page is /generated/<slug>.html, where assets/ means nothing). The media
// blocks' pictures, files and frames are their modules' to show (images.mjs, files.mjs, embeds.mjs,
// through media-ref.mjs) and the page's icon emoji.mjs's; every other reference is shown here, after
// them (embedReferences), as the page uses it:
//   shown   a picture (an img's or an input's src, a srcset, a video's poster, a background, an
//           icon's link, an SVG's image, CSS url() and image-set()), a font, a video or audio and its
//           captions: a data: URL in its place (a srcset keeps its largest candidate alone, with its
//           descriptor, so the picture keeps its size and is as sharp as a high-density screen would
//           have it; the img's src stays beside it, as HTML wants one and an import of the export
//           takes the picture from it); in the preview the asset route for a picture, the file route
//           for the rest (its bytes, never shown as a page in the editor's origin)
//   link    an <a> or <area> to the file: a data: URL with a download name, the file's when the link
//           gives none (a browser opens no page from a data: address: it saves the file); in the
//           preview the file route, which hands it out for saving. An HTML file linked without
//           download="…" is no file an export can open: it fails (an embed block shows one)
//   frame   an iframe's page (an HTML file): a data: URL; in the preview the embed route, which
//           sandboxes it. A PDF in a frame is an embed block's (the kit hands its data: URL to the
//           browser's PDF viewer), and a frame of any other file would be handed out for saving in
//           the preview: both fail
// What an export cannot hold fails with its line and what to write instead (assetReferenceFailures):
// an <object> or <embed> (the export's policy loads no plugin content), a script's src, a stylesheet
// linked or imported (@import: the addresses in it are read from its own place), anything else that
// loads a file. So do a reference whose file is not there and one the preview cannot serve (a name of
// letters, digits, dots, dashes and underscores right in assets/, as shared/media.mjs assetFile
// says). The same file referenced again is embedded again (an attribute names no copy held elsewhere
// in the file; CSS can, by a custom property), and the copies the references outside the media blocks
// and the page's icon add may make an export REPEAT_BUDGET bytes bigger at most (the media blocks'
// own repeats are theirs, as they were before any other reference was embedded).

const ASSET_REFERENCE = /^\s*(?:\.\/)?assets\//i;
// The most bytes the copies of files embedded more than once may add to an export (each copy beyond
// a media block's, or beyond the first where no media block holds the file, as the data: URL it is):
// about what a report's own source may hold (pipeline.mjs SIZE_LIMIT).
const REPEAT_BUDGET = 1_000_000;

// The candidates of a srcset as a browser reads them (the HTML standard's parse: an address may hold
// commas, a data: URL's among them): { url, descriptor, size (its width by a "w" descriptor, else its
// density, 1 when it gives none), wide (a width) }.
function srcsetCandidates(value) {
  const candidates = [];
  let at = 0;
  while (at < value.length) {
    while (at < value.length && /[\s,]/.test(value[at])) at++;
    if (at >= value.length) break;
    let end = at;
    while (end < value.length && !/\s/.test(value[end])) end++;
    let url = value.slice(at, end);
    let descriptor = "";
    if (url.endsWith(",")) {
      url = url.replace(/,+$/, "");
      at = end;
    } else {
      let close = end;
      for (let depth = 0; close < value.length && (value[close] !== "," || depth > 0); close++) {
        if (value[close] === "(") depth++;
        else if (value[close] === ")") depth--;
      }
      descriptor = value.slice(end, close).trim();
      at = close + 1;
    }
    const size = descriptor.split(/\s+/).find((part) => /^\d*\.?\d+[wx]$/i.test(part));
    candidates.push({ url, descriptor, size: size ? parseFloat(size) : 1, wide: /w$/i.test(size ?? "") });
  }
  return candidates;
}

// The candidate a browser on the densest screen would take: the widest of those given a width, else the densest.
function largestOf(candidates) {
  const wide = candidates.filter((candidate) => candidate.wide);
  return (wide.length > 0 ? wide : candidates).reduce((best, candidate) => (!best || candidate.size > best.size ? candidate : best), null);
}

// The elements whose background attribute browsers still draw (the HTML standard's rendering section).
const BACKGROUNDS = new Set(["body", "table", "thead", "tbody", "tfoot", "tr", "td", "th"]);

// Every assets/ reference of the tree (or every one whose address `wanted(value, element)` takes):
// { node, how ("src", "href", "poster", "data", "background", "srcset", "style" for a style
// attribute, "css" for a <style>), value, line, written (how a message shows a CSS one), key and
// place (an attribute's name as the file writes it, xlink:href, and its place in the file); a CSS
// one's `css` (cssReferences', and `offset`, where a <style>'s text starts in the file); a srcset
// candidate's `candidates` (all of its attribute's), `index` (its own among them) and `largest`
// (whether it is the one an export keeps: the largest of those naming a file of the folder) }.
function referencesOf(html, tree, wanted = (value) => ASSET_REFERENCE.test(value)) {
  const found = [];
  const add = (reference) => {
    if (wanted(reference.value, reference.node)) found.push({ ...reference, value: reference.value.trim(), written: reference.css?.written });
  };
  walk(tree, (node) => {
    const location = node.sourceCodeLocation;
    if (!location) return; // an element the parser put in, with no tag in the file
    for (const { name, value, prefix } of node.attrs) {
      const key = prefix ? `${prefix}:${name}` : name;
      const place = location.attrs?.[key];
      const at = { node, how: name, key, place, line: place?.startLine ?? location.startLine };
      if (name === "src" || name === "href" || name === "poster" || (name === "data" && node.tagName === "object") || (name === "background" && BACKGROUNDS.has(node.tagName))) add({ ...at, value });
      else if (name === "srcset") {
        const candidates = srcsetCandidates(value);
        const largest = largestOf(candidates.filter((candidate) => ASSET_REFERENCE.test(candidate.url)));
        candidates.forEach((candidate, index) => add({ ...at, value: candidate.url, candidates, index, largest: candidate === largest }));
      } else if (name === "style") for (const css of cssReferences(value)) add({ ...at, value: css.value, css });
    }
    if (node.tagName !== "style") return;
    for (const text of node.childNodes) {
      if (text.nodeName !== "#text" || !text.sourceCodeLocation) continue;
      // The text as the file has it (the tree's has its line ends made \n), so that places are the file's.
      const { startOffset, endOffset } = text.sourceCodeLocation;
      for (const css of cssReferences(html.slice(startOffset, endOffset))) {
        add({ node, how: "css", value: css.value, line: lineAt(html, startOffset + css.index), css: { ...css, offset: startOffset } });
      }
    }
  });
  return found;
}

// Where the media blocks and the page's icon embed a reference: the start of each tag they show a
// file of, the attribute they show, and whose check holds it ("block": the media block's own; "icon":
// the page's icon, whose file is checked here); icon: a picture that marks rather than shows (a
// bookmark's icon or cover, a link's icon), as the page's icon does.
function embeddedPlaces(html, tree) {
  const places = new Map();
  for (const { at, kind } of pictureTags(html, tree)) places.set(at, { attribute: "src", owner: "block", icon: kind !== "image" });
  for (const { link } of fileBlocks(html, tree)) if (link) places.set(link.sourceCodeLocation.startOffset, { attribute: "href", owner: "block" });
  for (const at of frameStarts(html, tree)) places.set(at, { attribute: "src", owner: "block" });
  for (const at of iconImageStarts(html)) places.set(at, { attribute: "src", owner: "icon" });
  return places;
}
const placeOf = (places, reference) => {
  const place = places.get(reference.node.sourceCodeLocation.startOffset);
  return place?.attribute === reference.how ? place : null;
};

const SHOWN_SOURCES = new Set(["img", "input", "video", "audio", "source", "track"]);
const STYLESHEET = "an export holds no stylesheet of the folder (the addresses in one are read from its own place): put its rules in the page's <style>";
const rels = (node) => (attr(node, "rel") ?? "").toLowerCase().split(/\s+/);
const HTML = /\.html?$/i;

// An embed block as the file holds it (src/shared/components/embed.mjs), which the failures below
// name as what to write instead, each kind of file its own: an HTML file's frame sandboxed without
// allow-same-origin, a PDF's with no sandbox, as a sandboxed frame shows no PDF (embeds.mjs fails
// one). What else a frame or a plugin would show is a picture or a file to save.
const EMBED_FRAMES = { html: 'src="assets/<file>.html" sandbox="allow-scripts"', pdf: 'src="assets/<file>.pdf"' };
const embedBlock = (kind) => `<figure class="doc-embed doc-embed--file"><iframe class="doc-embed-frame" ${EMBED_FRAMES[kind]}></iframe><figcaption></figcaption></figure>`;
const PDF_BLOCK = `its frame with no sandbox (a sandboxed one shows no PDF): ${embedBlock("pdf")}`;
const PICTURE_OR_FILE = 'show a picture with <img src="assets/<file>">, a file to save with a link, <a href="assets/<file>" download="<name>">';

// What the page does with a reference: { use } ("shown", "link" or "frame", as the comment at the top
// says), or { not }: why an export cannot hold the file there, and what to write instead.
function useOf({ node, how, css, value }) {
  const tag = node.tagName;
  if (how === "style" || how === "css") return css.kind === "import" ? { not: STYLESHEET } : { use: "shown" };
  if ((how === "srcset" && (tag === "img" || tag === "source")) || (how === "poster" && tag === "video") || (how === "src" && SHOWN_SOURCES.has(tag)) || how === "background") return { use: "shown" };
  if (how === "src" && tag === "iframe") {
    const file = referencedFile(value) ?? "";
    if (HTML.test(file)) return { use: "frame" };
    if (/\.pdf$/i.test(file)) return { not: `a PDF shows in an embed block alone (the kit hands its file to the browser's PDF viewer, in the preview and in an export): make it one, ${PDF_BLOCK}` };
    return { not: `a frame shows a page of the folder (an HTML file), not this file, which the preview would hand out for saving: ${PICTURE_OR_FILE}` };
  }
  if (how === "href" && (tag === "a" || tag === "area")) return { use: "link" };
  if (how === "href" && (tag === "image" || (tag === "link" && rels(node).some((rel) => rel.endsWith("icon"))))) return { use: "shown" }; // an SVG's picture, the page's icon in a tab
  if (tag === "object" || tag === "embed") {
    const file = referencedFile(value) ?? "";
    const instead = /\.pdf$/i.test(file) ? `show a PDF in an embed block, ${PDF_BLOCK}` : HTML.test(file) ? `show a page in an embed block, ${embedBlock("html")}` : PICTURE_OR_FILE;
    return { not: `an export's policy loads no plugin content (<object>, <embed>): ${instead}` };
  }
  if (tag === "script") return { not: "an export runs the page's own scripts alone: put the code in the page's <script>" };
  if (tag === "link" && rels(node).includes("stylesheet")) return { not: STYLESHEET };
  return { not: "an export holds a file of the folder as a picture, a font, a video or audio, a link or a frame, not there" };
}

// Whether the preview serves a file of the folder: one named as shared/media.mjs assetFile says, in assets/ itself.
const served = (file) => file.startsWith("assets/") && assetFile(file);
// Why the preview serves no file by the name a reference gives (served's rule), and what to do: the
// media blocks' reasons (shared/media.mjs assetProblem), the file as referencedFile read it.
const unservedWhy = (file) => assetProblem(file) ?? `the folder is assets/, in lowercase: write it so (assets/${file.slice("assets/".length)})`;
// A link to an HTML file is one an export can hold only as a file to save (download="…").
const openedPage = (reference, use, file) => use === "link" && HTML.test(file) && attr(reference.node, "download") === undefined;
// The route the preview serves a reference at (shared/media.mjs MEDIA_ROUTES): a picture where its
// type is sent, a frame's page where it is shown (sandboxed), any other file as bytes for saving.
const routeOf = (use, file) => (use === "frame" ? "embed" : use === "shown" && imageFile(file) ? "asset" : "file");

// Whether a file of the folder is there (a file, not a folder).
const isThere = (directory, file) => Boolean(fs.statSync(path.join(directory, file), { throwIfNoEntry: false })?.isFile());

const described = ({ node, how, value, written }) => ({
  srcset: `<${node.tagName} srcset="… ${value} …">`,
  style: `${written} in the style of <${node.tagName}>`,
  css: `${written} in <style>`,
}[how] ?? `<${node.tagName} ${how}="${value}">`);

// Whether an element stands in an icon (.doc-icon): the page's, a highlight block's or a flowchart step's.
const inIcon = (node) => {
  for (let parent = node.parentNode; parent; parent = parent.parentNode) if (parent.tagName && hasClass(parent, "doc-icon")) return true;
  return false;
};

// "12 and 40", "12, 40 and 55".
const joined = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : `${items[0]}`);

// The files an export embeds more than once ({ file, line, owned } of each reference it embeds;
// `owned`: a media block's or the page icon's), when the copies the references outside them add (each
// beyond the first, or beyond the owned ones where a media block or the icon holds the file too)
// come to more than REPEAT_BUDGET bytes: one failure naming them, or none. The owned references'
// repeats are theirs (two image blocks of one picture are two copies, as they always were).
function repeatFailures(embedded, directory) {
  const counted = new Map(); // file -> { lines (of the references outside the owned ones), owned }
  for (const { file, line, owned } of embedded) {
    const entry = counted.get(file) ?? counted.set(file, { lines: [], owned: false }).get(file);
    if (owned) entry.owned = true;
    else entry.lines.push(line);
  }
  let added = 0;
  const repeated = [];
  for (const [file, { lines, owned }] of counted) {
    const copies = owned ? lines.length : lines.length - 1;
    if (copies < 1) continue;
    const bytes = copies * Math.ceil(fs.statSync(path.join(directory, file)).size / 3) * 4;
    added += bytes;
    const times = lines.length === 1 ? "once" : lines.length === 2 ? "twice" : `${lines.length} times`;
    repeated.push({ bytes, said: `${file} ${times}${owned ? " besides a media block's or the icon's" : ""} (line${new Set(lines).size > 1 ? "s" : ""} ${joined([...new Set(lines)])})` });
  }
  if (added <= REPEAT_BUDGET) return [];
  const named = repeated.sort((a, b) => b.bytes - a.bytes).map(({ said }) => said).join(", ");
  return [`files embedded more than once make an export ${added.toLocaleString("en-US")} bytes bigger, over the ${REPEAT_BUDGET.toLocaleString("en-US")} bytes the copies outside the media blocks may add: ${named}; show each fewer times (a picture, a link or a frame holds a copy of its own each time it is written), or, for a CSS background (url() in a <style> or a style attribute), name it once in the page's <style> (--picture: url(assets/<file>)) and write var(--picture) where it shows`];
}

// The report's references to files of its folder read once: { failures (each with its line: what
// assetReferenceFailures says but the repeats), embedded (each reference an export embeds, the media
// blocks' and the icons' among them: { file, line, owned }), unserved (each reference to a file that
// is there but by a name the preview serves none by, which fails: { file, line }) }.
function readReferences({ html, directory, tree }) {
  const places = embeddedPlaces(html, tree);
  const failures = [];
  const embedded = []; // { file, line, owned } of each reference an export embeds
  const unserved = []; // { file, line } of each one to a file there that the name keeps out
  for (const reference of referencesOf(html, tree)) {
    const { line } = reference;
    const place = placeOf(places, reference);
    const file = referencedFile(reference.value);
    const there = file !== null && isThere(directory, file);
    if (there && !served(file)) unserved.push({ file, line });
    if (place?.owner === "block") {
      if (there && served(file)) embedded.push({ file, line, owned: true, icon: Boolean(place.icon) });
      continue;
    }
    if (!there) failures.push(place ? `line ${line}: the icon's image ${reference.value} is not in the document's folder` : `line ${line}: ${described(reference)} names a file that is not in the document's folder`);
    if (place) {
      if (there) embedded.push({ file, line, owned: true, icon: true });
      continue;
    }
    const { use, not } = useOf(reference);
    if (not) failures.push(`line ${line}: ${described(reference)}: ${not}`);
    if (!use || !there) continue;
    if (!served(file)) failures.push(`line ${line}: ${described(reference)}: ${unservedWhy(file)}`);
    else if (openedPage(reference, use, file)) failures.push(`line ${line}: ${described(reference)} opens an HTML file, which an export cannot (a browser opens no page from a data: address): show it in an embed block, ${embedBlock("html")}, or give the link download="<name>" to hand it out as a file`);
    else if (reference.node.tagName === "img" && reference.how === "src" && inIcon(reference.node)) failures.push(`line ${line}: ${described(reference)} is in an icon (.doc-icon) written as an icon is not read (its picker, the browser tab's icon): write it <div class="doc-icon"><img src="assets/<file>" alt=""></div>, in double quotes and with no other class`);
    else if (reference.how !== "srcset" || reference.largest) embedded.push({ file, line });
  }
  return { failures, embedded, unserved };
}

/**
 * What is wrong with the report's references to files of its folder, each with its line: a file that
 * is not there, a reference an export cannot hold (useOf) or the preview cannot serve (its file's
 * name), a link that would open an HTML file, an icon's picture written as the icon is not read; and
 * files embedded so often outside the media blocks and the icon that the export grows by more than
 * REPEAT_BUDGET bytes. The media blocks' own references are their checks' (images.mjs, files.mjs,
 * embeds.mjs).
 */
export function assetReferenceFailures({ html, directory, tree = parseReport(html) }) {
  const { failures, embedded } = readReferences({ html, directory, tree });
  return [...new Set([...failures, ...repeatFailures(embedded, directory)])];
}

/**
 * The files of the report's folder an export embeds, each as often as it does, at the line of each
 * reference that embeds it, in the file's order: [{ file, line }] (a media block's, the icon's and
 * every other reference an export holds; none that fails).
 */
export function embeddedFiles({ html, directory, tree = parseReport(html) }) {
  return readReferences({ html, directory, tree }).embedded.map(({ file, line }) => ({ file, line }));
}

/**
 * Both at once ({ embedded, unserved }): the files an export embeds, as embeddedFiles says them, with
 * whether each reference is an icon's (the page's, a bookmark's, a link's: icon), and the files of
 * the folder the report references by a name the preview serves none by (in a folder of assets/, of
 * characters it does not take: they fail, and stay as written), each at the line of each reference,
 * [{ file, line }]: what a picture's note weighs either way (picture-sizes.mjs).
 */
export function referencedFiles({ html, directory, tree = parseReport(html) }) {
  const { embedded, unserved } = readReferences({ html, directory, tree });
  return { embedded: embedded.map(({ file, line, icon = false }) => ({ file, line, icon })), unserved };
}

// What a reference shows in `mode`: the preview's address of its file, or an export's data: URL (a
// fragment kept: an SVG's view); or null, when it stays as written (what the check fails).
function addressOf(reference, { slug, mode, directory }) {
  const { use } = useOf(reference);
  const file = referencedFile(reference.value);
  if (!use || !file || !served(file) || openedPage(reference, use, file)) return null;
  const fragment = /#.*$/.exec(reference.value)?.[0] ?? "";
  if (mode === "preview") return `${servedUrl(routeOf(use, file), slug, file, directory)}${fragment}`;
  const url = dataUrlOf(directory, file);
  return url && `${url}${fragment}`;
}

// What an attribute holding references becomes ({ start, end, text } in the file), shown by `shown`:
// a srcset its largest candidate alone in an export (each candidate shown in the preview), a style
// its addresses, any other the one; a link in an export also says the name to save it as (its file's,
// where it gives none or an empty one). The preview says what the file had (data-ge-<attribute>, in
// place of one the file writes itself, by that name or by the one it had before 2026-10-28,
// data-rs-<attribute>: a browser would keep the first of two), but for a style.
function attributeEdits(place, references, { mode, shown }) {
  const [first] = references;
  const { node, how, key } = first;
  const put = (value, mark = "") => ({ start: place.startOffset, end: place.endOffset, text: `${key}="${escapeAttribute(value)}"${mark}` });
  const said = mode === "preview" ? ` data-ge-${how}="${escapeAttribute(attr(node, how) ?? "")}"` : "";
  const written = mode === "preview" ? [`data-ge-${how}`, `data-rs-${how}`].map((name) => node.sourceCodeLocation.attrs?.[name]).filter(Boolean) : [];
  const unwritten = written.map((place) => ({ start: place.startOffset, end: place.endOffset, text: "" }));
  if (how === "srcset") {
    if (mode === "export") {
      const largest = references.find((reference) => reference.largest);
      const address = largest && shown(largest);
      return address ? [put(`${address} ${largest.candidates[largest.index].descriptor}`.trim())] : [];
    }
    const addresses = new Map(references.map((reference) => [reference.index, shown(reference)]));
    if (![...addresses.values()].some(Boolean)) return [];
    return [put(first.candidates.map((candidate, index) => [addresses.get(index) ?? candidate.url, candidate.descriptor].filter(Boolean).join(" ")).join(", "), said), ...unwritten];
  }
  if (how === "style") {
    let value = attr(node, "style");
    const spans = references.map((reference) => ({ ...reference.css, address: shown(reference) })).filter((span) => span.address).sort((a, b) => b.start - a.start);
    for (const span of spans) value = `${value.slice(0, span.start)}${span.address}${value.slice(span.end)}`;
    return spans.length > 0 ? [put(value)] : [];
  }
  const address = shown(first);
  if (!address) return [];
  if (mode === "preview" || useOf(first).use !== "link") return [put(address, said), ...unwritten];
  // A data: address has no name of its own to save the file by.
  const name = referencedFile(first.value).slice("assets/".length);
  const download = attr(node, "download");
  if (download === undefined) return [put(address, ` download="${escapeAttribute(name)}"`)];
  const named = node.sourceCodeLocation.attrs?.download;
  return [put(address), ...(download === "" && named ? [{ start: named.startOffset, end: named.endOffset, text: `download="${escapeAttribute(name)}"` }] : [])];
}

/**
 * The text with each edit ({ start, end, text }, places in it) made, put together once, in its order
 * (one that overlaps an earlier one left out).
 */
export function withEdits(html, edits) {
  const pieces = [];
  let cursor = 0;
  for (const { start, end, text } of [...edits].sort((a, b) => a.start - b.start)) {
    if (start < cursor) continue;
    pieces.push(html.slice(cursor, start), text);
    cursor = end;
  }
  pieces.push(html.slice(cursor));
  return pieces.join("");
}

/**
 * The references of a page's markup at every place an export may hold a file of the report's folder
 * (those embedReferences shows, and the media blocks' and the icons' pictures, files and frames,
 * which their modules show at the same places), whose address `wanted(value, element)` takes:
 * referencesOf's { node, how, value, key, place, css, candidates, index… }. The import
 * (src/transfer/own-report.mjs) finds an exported report's data: URLs by it, to make each a file of
 * the new report's folder again (addressEdits).
 */
export const referencesWhere = (html, wanted, tree = parseReport(html)) => referencesOf(html, tree, wanted);

/**
 * The edits (withEdits') that give each of `references` (referencesWhere's, of one text) the address
 * `addressOf(reference)` says (null: as written): an attribute's whole value, a srcset's candidate (the
 * others and their descriptors kept), each address in a style attribute or in a <style>.
 */
export function addressEdits(references, addressOf) {
  const edits = [];
  const attributes = new Map(); // an attribute's place -> its references, each with its address
  for (const reference of references) {
    const address = addressOf(reference);
    if (typeof address !== "string") continue;
    if (reference.how === "css") edits.push({ start: reference.css.offset + reference.css.start, end: reference.css.offset + reference.css.end, text: address });
    else if (reference.place) attributes.set(reference.place, [...(attributes.get(reference.place) ?? []), { ...reference, address }]);
  }
  for (const [place, list] of attributes) {
    const [{ node, how, key, candidates }] = list;
    let value = list[0].address;
    if (how === "srcset") {
      const addresses = new Map(list.map((reference) => [reference.index, reference.address]));
      value = candidates.map((candidate, index) => [addresses.get(index) ?? candidate.url, candidate.descriptor].filter(Boolean).join(" ")).join(", ");
    } else if (how === "style") {
      value = attr(node, "style");
      for (const { css, address } of [...list].sort((a, b) => b.css.start - a.css.start)) value = `${value.slice(0, css.start)}${address}${value.slice(css.end)}`;
    }
    edits.push({ start: place.startOffset, end: place.endOffset, text: `${key}="${escapeAttribute(value)}"` });
  }
  return edits;
}

/**
 * The report's HTML with every reference to a file of its folder that is no media block's nor the
 * page icon's (theirs are shown first: render/report-html.mjs) where it shows: mode "preview", served
 * from the folder (/__gallery/edit/<route>/<slug>/assets/<file>, an attribute's value as the file has
 * it in data-ge-<attribute>); "export", a data: URL, a link with the name to save its file by. What an
 * export cannot hold, and a file that is not there or that the preview cannot serve, stays as
 * written (the check fails it). The rest of the text stays as it is: it is put together once, in its order.
 */
export function embedReferences(html, { slug, mode = "export", reportsDirectory = defaultReportsDirectory }) {
  // A page whose text names the folder nowhere but in the preview's marks of the media blocks and of
  // the page's icon (data-ge-src, data-ge-href, data-ge-icon) needs no tree.
  if (!/assets\//i.test(html.replace(/\sdata-ge-(?:src|href|icon)="[^"]*"/g, ""))) return html;
  const tree = parseReport(html);
  const places = embeddedPlaces(html, tree);
  const directory = documentDirectory(slug, reportsDirectory);
  const shown = (reference) => addressOf(reference, { slug, mode, directory });
  const edits = [];
  const attributes = new Map(); // an attribute's place -> its references
  for (const reference of referencesOf(html, tree)) {
    if (placeOf(places, reference)) continue;
    if (reference.how === "css") {
      const address = shown(reference);
      const at = reference.css.offset;
      if (address) edits.push({ start: at + reference.css.start, end: at + reference.css.end, text: address });
    } else if (reference.place) attributes.set(reference.place, [...(attributes.get(reference.place) ?? []), reference]);
  }
  for (const [place, references] of attributes) edits.push(...attributeEdits(place, references, { mode, shown }));
  return withEdits(html, edits);
}
