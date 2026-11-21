import { referencesWhere, withEdits } from "../render/asset-references.mjs";
import { emojiDataUrl } from "../render/emoji.mjs";
import { parseReport } from "../render/report-tree.mjs";
import { componentOf } from "../shared/components/index.mjs";
import { PACKAGE_MARK, runsInPage, servedMarks } from "../shared/components/installed.mjs";
import { MENTION, MENTION_ICON } from "../shared/components/mention.mjs";
import { TAB_ICON, iconKind } from "../shared/emoji/icon-value.mjs";
import { escapeAttribute, escapeText } from "../shared/escape.mjs";
import { CARRIED, COPY_DATA, GENERATORS, PACKAGES_META, SOURCE_META } from "../shared/export-wrap.mjs";
import { attr, elementsOf, hasClass, walk } from "../shared/html-tree.mjs";
import { MEDIA_TYPES, referencedFile } from "../shared/media.mjs";
import { isFileLink } from "../shared/page-address.mjs";

// One of this Gallery's own reports brought in by 导入 (import.mjs): its report.html, an export of it
// (the workbench's 导出 as HTML, gallery export) or a view copy of it (ui.js's 导出当前视图副本), as
// its author wrote it: the whole page, its text read (never the DOM's serialization of it), so its
// head (its language, its metadata, its scripts where they stand), its header, its blocks, their
// attributes, entities, blank lines, line breaks and block ids are kept as written. Only what an
// export or a view copy made of it is undone, at its place, each step mirroring one of theirs
// (pipeline.mjs withExportPolicy and inlineReport, render/report-html.mjs, emoji.mjs; ui.js
// serializableHtml):
//   the export's generator, policy and the sha256 of the report.html it was made from right after
//   <head> (each with the line break before it, as the export puts them; any Content-Security-Policy,
//   as a report's page needs none of its own and the preview's editor would not run under one; the
//   source's meta, shared/export-wrap.mjs SOURCE_META), and the browser tab's icon before </head>
//   (link[data-doc-tab-icon], with its indent and the line break after it)
//   the kit's tags and an export's inline copies of them (data-doc-kit, data-doc-vendor), and all it
//   holds of a component package (data-doc-package), in its head or its body (an older file may
//   write them in its main): none of the report's own, the new report's page gets them from the
//   render, of the packages the workspace it comes into holds; and what a view copy adds, its id (meta
//   doc-export-id), its reading state (script[data-doc-state], the html element's state
//   attributes: the page component's runtime.state) and its policy. Each goes with its line when it
//   has one to itself.
//   an icon's picture (.doc-icon: the page's, a highlight block's; render/emoji.mjs embedIcon): an
//   emoji's Twemoji image is its emoji again, an icon of the 图标 tab's SVG goes (its data-icon says it)
//   a Sheet tab's emoji picture (--doc-tab-icon in its style, embedTabIcons) goes: the Twemoji
//   picture of the tab's own data-tab-icon, never a picture the author gave the tab
//   what an export carries besides the page (src/transfer/carry.mjs: the copies' words, what an import gives
//   back), each with its line
//   a page block whose address is another file of the export (render/page-link-rewrite.mjs
//   exportLinks), a document no workspace has: its words, the link and its icon gone
//   each file an export embedded (a data: URL at a place an export holds a file of the report's
//   folder: render/asset-references.mjs referencesWhere, the media blocks' places among them) is a
//   file of the new report's folder again, and so is a file of the set beside a report.html that it
//   names (assets/<file>): import.mjs ownReportFiles keeps each as an upload is kept and writes its
//   address where the data: URL stood (addressEdits)
// The new report is that page, its main's data-doc-id the new report's slug (import.mjs
// fillReport). What an export does not carry stays lost: a file's own name (an export holds its
// bytes; the import names it as an upload is, <kind>-<hash>.<extension>, its extension its media
// type's or its link's download name's, so a file the editor uploaded comes back under the name it
// had), a srcset's other candidates (an export keeps the largest alone), a cropped picture's
// original (data-original, which an export does not embed: the import leaves it out, data-crop with
// it, unless the set beside a report.html holds that file), and what it writes one way for two (a
// Sheet tab's style that ends in ";" or not, blanks around an icon's emoji).

/** The page's main when it is one of this Gallery's reports: its first main.doc-page (none a template holds), else null. */
export function ownReportMain(tree) {
  let main = null;
  walk(tree, (node) => {
    if (!main && node.tagName === "main" && hasClass(node, "doc-page")) main = node;
  }, { inTemplates: false });
  return main;
}

const textOf = (node) => (node.childNodes ?? []).map((child) => (child.nodeName === "#text" ? child.value : textOf(child))).join("");
const isKit = (node) => ["data-doc-kit", "data-doc-vendor", PACKAGE_MARK].some((name) => attr(node, name) !== undefined);
const inside = (node, root) => {
  for (let at = node; at; at = at.parentNode) if (at === root) return true;
  return false;
};
const DATA = /^\s*data:/i;
const EMOJI_PICTURE = /^data:image\/svg\+xml[;,]/i;
const TAB_PICTURE = new RegExp(`(?:;\\s*)?${TAB_ICON}:\\s*url\\((['"]?)(data:[^'")]*)\\1\\)\\s*;?\\s*$`);
const LINE_END = /[ \t]*(?:\r?\n|$)/y;
const LINE_BREAK = /\r?\n/y;
const VIEW_STATE = componentOf("page").runtime.state.html; // what a view copy keeps of the reading state on <html>
const SCHEME = /^\s*[a-z][a-z0-9+.-]*:/i;

/** A data: URL's bytes, or null (none, or one that does not decode). */
export function dataBytes(url) {
  const comma = url.indexOf(",");
  if (!DATA.test(url) || comma < 0) return null;
  const meta = url.slice(url.indexOf(":") + 1, comma);
  const body = url.slice(comma + 1);
  try {
    return /;base64$/i.test(meta) ? Buffer.from(body, "base64") : Buffer.from(decodeURIComponent(body), "utf8");
  } catch {
    return null;
  }
}

/** The title of an own report (its tree): its header's title's text, else its <title>'s, else null. */
export function ownReportTitle(tree) {
  const header = elementsOf(ownReportMain(tree) ?? {}).find((node) => node.tagName === "header" && hasClass(node, "doc-header"));
  let title = null;
  if (header) walk(header, (node) => (title ??= hasClass(node, "doc-title") ? node : null));
  let documentTitle = null;
  walk(tree, (node) => (documentTitle ??= node.tagName === "title" ? node : null), { inTemplates: false });
  const clean = (text) => text.replace(/\s+/g, " ").trim();
  return clean(textOf(title ?? {})) || clean(textOf(documentTitle ?? {})) || null;
}

// The edit that takes an element out of `html`: with `how` "blank", the blank before it too (the
// whitespace text before it: what puts it on a line of its own after the element before it); "tab",
// the indent before it and the line break after it; else its line, when it has one to itself (from
// that line's start through the line break after it), or the element alone.
function removal(html, node, how) {
  const { startOffset: start, endOffset: end } = node.sourceCodeLocation;
  if (how === "blank") {
    const siblings = node.parentNode?.childNodes ?? [];
    const blank = siblings[siblings.indexOf(node) - 1];
    return { start: blank?.nodeName === "#text" && !blank.value.trim() && blank.sourceCodeLocation ? blank.sourceCodeLocation.startOffset : start, end, text: "" };
  }
  const lineStart = html.lastIndexOf("\n", start - 1) + 1;
  const lead = html.slice(lineStart, start);
  if (how === "tab") {
    LINE_BREAK.lastIndex = end;
    return { start: start - /[ \t]*$/.exec(lead)[0].length, end: end + (LINE_BREAK.exec(html)?.[0].length ?? 0), text: "" };
  }
  LINE_END.lastIndex = end;
  const after = LINE_END.exec(html);
  return /^[ \t]*$/.test(lead) && after ? { start: lineStart, end: end + after[0].length, text: "" } : { start, end, text: "" };
}

/** The edit that takes attribute `name` out of an element's start tag in `html` (with the blanks before it), or null (none written). */
export function attributeRemoval(html, node, name) {
  const place = node.sourceCodeLocation?.attrs?.[name];
  if (!place) return null;
  let start = place.startOffset;
  while (/\s/.test(html[start - 1])) start--;
  return { start, end: place.endOffset, text: "" };
}

// Whether a page block's `href` is the address of a file beside the one it stands in: no web page's, no document's.
const otherFile = (href) => Boolean(href) && !SCHEME.test(href) && !isFileLink(href);

// Whether a Sheet tab's picture (a data: URL) is the Twemoji picture of its emoji, as embedTabIcons gives it.
function tabEmojiPicture(url, emoji) {
  const own = iconKind(emoji) === "emoji" ? emojiDataUrl(emoji) : null;
  const bytes = own && dataBytes(url);
  return Boolean(bytes && bytes.equals(dataBytes(own)));
}

/**
 * The text of an own report with what an export (or a view copy) made of it undone, but its files
 * (fileReferences): the export's policy and the browser tab's icon, the kit's tags and inline copies,
 * a view copy's id, reading state and policy, the icons' pictures, the Sheet tabs' emoji pictures and
 * the links of page blocks to the export's other files.
 * A report.html comes out as it went in, but for the kit's tags an older one writes.
 */
export function undoExport(html, tree = parseReport(html)) {
  const edits = [];
  walk(tree, (node) => {
    const at = node.sourceCodeLocation;
    if (!at) return;
    const name = attr(node, "name");
    if (node.tagName === "meta" && (/^content-security-policy$/i.test(attr(node, "http-equiv") ?? "") || (name === "generator" && GENERATORS.includes(attr(node, "content"))) || (name === SOURCE_META && /^sha256:[0-9a-f]{64}$/i.test(attr(node, "content") ?? "")) || name === PACKAGES_META)) {
      edits.push(removal(html, node, "blank"));
    } else if (node.tagName === "link" && attr(node, "data-doc-tab-icon") !== undefined) {
      edits.push(removal(html, node, "tab"));
    } else if (isKit(node) || (node.tagName === "meta" && name === "doc-export-id") || (node.tagName === "script" && ["data-doc-state", COPY_DATA, CARRIED].some((mark) => attr(node, mark) !== undefined))) {
      edits.push(removal(html, node, "line"));
    } else if (node.tagName === "html") {
      edits.push(...VIEW_STATE.map((state) => attributeRemoval(html, node, state)).filter(Boolean));
    } else if (node.tagName === "div" && attr(node, "class") === "doc-icon" && at.endTag) {
      // What embedIcon shows in the icon's stead: an emoji's picture (its alt the emoji), a glyph's SVG.
      const [only, more] = elementsOf(node);
      const inner = { start: at.startTag.endOffset, end: at.endTag.startOffset };
      if (only && !more && only.tagName === "svg" && iconKind(attr(node, "data-icon")) === "glyph") edits.push({ ...inner, text: "" });
      else if (only && !more && only.tagName === "img" && iconKind(attr(only, "alt")) === "emoji" && EMOJI_PICTURE.test(attr(only, "src") ?? "")) edits.push({ ...inner, text: escapeText(attr(only, "alt")) });
    } else if (node.tagName === "a" && hasClass(node, MENTION) && at.endTag && otherFile(attr(node, "href"))) {
      for (const { startOffset: start, endOffset: end } of [at.startTag, at.endTag, ...elementsOf(node).filter((child) => hasClass(child, MENTION_ICON)).map((icon) => icon.sourceCodeLocation)]) edits.push({ start, end, text: "" });
    } else if (node.tagName === "button" && at.attrs?.style) {
      const picture = TAB_PICTURE.exec(attr(node, "style") ?? "");
      if (!picture || !tabEmojiPicture(picture[2], attr(node, "data-tab-icon"))) return;
      const style = attr(node, "style").replace(TAB_PICTURE, "");
      let start = at.attrs.style.startOffset;
      if (!style) while (/\s/.test(html[start - 1])) start--; // a style it gave the tab: gone with the space before it
      edits.push({ start, end: at.attrs.style.endOffset, text: style ? `style="${escapeAttribute(style)}"` : "" });
    }
  }, { inTemplates: false });
  return withEdits(html, edits);
}

/**
 * The references of an own report's text (undoExport's) to files the import keeps: in its main, and
 * in its own <style> elements (wherever they are), each a data: URL (a link's: one with a download
 * name, as an export writes a link) or an address of the set's (a link's: assets/<file>, or one with
 * a download name or of a file block); referencesWhere's entries.
 */
export function fileReferences(html, tree = parseReport(html)) {
  const main = ownReportMain(tree);
  return referencesWhere(html, (value, node) => {
    if (!inside(node, main) && node.tagName !== "style") return false;
    const link = node.tagName === "a" || node.tagName === "area";
    if (DATA.test(value)) return !link || attr(node, "download") !== undefined;
    if (!value.trim() || /^\s*([a-z][a-z0-9+.-]*:|\/|#)/i.test(value)) return false;
    return !link || referencedFile(value) !== null || attr(node, "download") !== undefined || hasClass(node, "doc-file-link");
  }, tree);
}

// The sandbox an embed's frame of an HTML file is given (render/embeds.mjs holds a document to it), and what a
// frame may load without one: a PDF of the folder (a sandboxed frame shows no PDF) or a page of the web.
const FRAME_SANDBOX = "allow-scripts allow-popups allow-forms allow-modals";
const OWN_ORIGIN = /(?:^|\s)allow-same-origin(?:\s|$)/i;
// What a frame may load without a sandbox: a PDF right in the folder's assets/ (a sandboxed frame shows no PDF;
// its name one of a file there: no folder, no "..": what the embed route serves as a PDF, nosniff) or a page of
// the web (another origin, which reaches nothing of the preview's: a sandbox would break the embeds of sites
// that need their own).
const UNSANDBOXED = (src) => {
  const pdf = /^\s*(?:\.\/)?assets\/([^?#\s]+\.pdf)(?:[?#]\S*)?\s*$/i.exec(src);
  return pdf ? !/[\\/]|\.\./.test(pdf[1]) && !/%2e|%2f|%5c/i.test(pdf[1]) : /^\s*https:\/\//i.test(src);
};
// How many times inertPage looks again at what it made, at most: each look takes out what the one before
// uncovered (an attribute written twice, whose second the first hid; a tag its removal spells anew), a page
// needing two or three; one that still changes after these is refused (an error), never let through.
const INERT_ROUNDS = 32;

// The attributes a start tag writes again (\`text\`, the tag's own text from its "<"), each after its first of the
// same name, as edits that take each out with the blanks before it: a browser reads the first alone, and the tree
// knows no other, so that what took the first out would leave the second to run.
function repeatedAttributes(text, offset) {
  const edits = [];
  const seen = new Set();
  const name = /^<[^\s/>]+/.exec(text);
  let at = name ? name[0].length : text.length;
  while (at < text.length) {
    const blank = /^[\s/]*/.exec(text.slice(at))[0];
    const start = at;
    at += blank.length;
    if (text[at] === ">" || at >= text.length) break;
    const key = /^[^\s/>"'=][^\s/>=]*/.exec(text.slice(at))?.[0] ?? text[at];
    at += key.length;
    const value = /^\s*=\s*(?:"[^"]*"?|'[^']*'?|[^\s>]*)/.exec(text.slice(at));
    if (value) at += value[0].length;
    const lower = key.toLowerCase();
    if (seen.has(lower)) edits.push({ start: offset + start, end: offset + at, text: "" });
    seen.add(lower);
  }
  return edits;
}

// Where an element's text ends: its end tag's end, else (one never closed, a script whose text runs to the end of
// the file) the furthest of what it holds, whose place the tree knows when its own is only its start.
function extentOf(node) {
  let end = Math.max(node.sourceCodeLocation?.endOffset ?? 0, node.sourceCodeLocation?.startTag?.endOffset ?? 0);
  for (const child of node.childNodes ?? []) end = Math.max(end, child.sourceCodeLocation ? extentOf(child) : 0);
  if (node.content) end = Math.max(end, extentOf(node.content));
  return end;
}

// One look of inertPage's over `html`: { text, removed }.
function inertOnce(html, tree = parseReport(html)) {
  const edits = [];
  const gone = new Set();
  walk(tree, (node) => {
    const at = node.sourceCodeLocation;
    if (!node.tagName || !at?.startTag) return;
    const running = runsInPage(node.tagName, node.attrs ?? []);
    if (running.element) {
      gone.add(node);
      const end = extentOf(node);
      edits.push(at.endTag || end <= at.endOffset ? removal(html, node, "line") : { start: at.startOffset, end, text: "" });
      return;
    }
    const repeated = repeatedAttributes(html.slice(at.startTag.startOffset, at.startTag.endOffset), at.startTag.startOffset);
    if (repeated.length) {
      edits.push(...repeated); // the rest of this element on the next look, its attributes as it then has them
      return;
    }
    const out = new Set([...running.attributes, ...servedMarks(node.attrs ?? [])].map(({ name, prefix }) => (prefix ? `${prefix}:${name}` : name)));
    for (const key of out) edits.push(attributeRemoval(html, node, key));
    if (node.tagName !== "iframe") return;
    const sandbox = attr(node, "sandbox");
    const close = at.startTag.endOffset - (html[at.startTag.endOffset - 2] === "/" ? 2 : 1);
    if (sandbox === undefined) {
      if (attr(node, "srcdoc") !== undefined || !UNSANDBOXED(attr(node, "src") ?? "")) edits.push({ start: close, end: close, text: ` sandbox="${FRAME_SANDBOX}"` });
    } else if (OWN_ORIGIN.test(sandbox)) {
      const kept = sandbox.split(/\s+/).filter((token) => token && !/^allow-same-origin$/i.test(token)).join(" ");
      edits.push({ start: at.attrs.sandbox.startOffset, end: at.attrs.sandbox.endOffset, text: `sandbox="${escapeAttribute(kept)}"` });
    }
  }, { stop: (node) => gone.has(node) });
  const made = edits.filter(Boolean);
  return { text: made.length ? withEdits(html, made) : html, removed: made.length };
}

/**
 * An own report's text made inert, for a page no one this computer trusts wrote (import.mjs: anything but an
 * export this computer made and signed, carry.mjs), or an HTML block a Markdown file holds as written: what
 * would run on the page in the preview's origin, where the workspace's token is, taken out at its place, by the
 * rules of a copy (shared/components/installed.mjs runsInPage): a script but one of data, a plugin, a frame set, a
 * base, a link, what parsers read two ways, an animation of an address or a handler and a meta that acts, each
 * with what it holds and its line when it has one to itself; an attribute written twice in a tag (but its first);
 * a handler, a frame's own document (srcdoc) and an address of code (javascript:); what only the preview's server, its
 * editor and the kit write (servedMarks: their ids, the editor's map's among them, data-ge-…, data-doc-dev); a frame given the sandbox of an
 * embed's frame where it has none (but a PDF right in the folder and a web page) and never its own origin
 * (allow-same-origin). Looked at again until a look finds nothing (INERT_ROUNDS at most: one that still changes is refused): what one look takes
 * out may uncover another (the second of an attribute written twice). Everything else stays as written. Returns
 * { text, removed: how many it took out or changed }.
 */
export function inertPage(html, tree = parseReport(html)) {
  let text = html;
  let removed = 0;
  for (let round = 0; ; round++) {
    const once = inertOnce(text, round === 0 ? tree : parseReport(text));
    if (!once.removed) return { text, removed };
    if (round === INERT_ROUNDS) throw new Error("a page that does not settle as what runs in it is taken out");
    ({ text } = once);
    removed += once.removed;
  }
}

/** The cropped pictures of an own report's main (img[data-original]: components/image), each the element. */
export function croppedPictures(tree) {
  const found = [];
  walk(ownReportMain(tree) ?? {}, (node) => {
    if (node.tagName === "img" && node.sourceCodeLocation?.attrs?.["data-original"]) found.push(node);
  });
  return found;
}

/**
 * What a reference's file is kept as (media-store.mjs keptName's kinds, a bookmark's pictures under
 * their own stems as the editor keeps them): an icon's picture, a bookmark's icon or cover, a frame's
 * file, a file to save or play, else a picture.
 */
export function fileKindOf({ node, how }) {
  const parent = node.parentNode?.tagName ? node.parentNode : null;
  if (node.tagName === "img" && parent && hasClass(parent, "doc-icon")) return "icon";
  if (node.tagName === "img" && hasClass(node, "doc-bookmark-icon")) return "bookmark-icon";
  if (node.tagName === "img" && parent && hasClass(parent, "doc-bookmark-cover")) return "bookmark-cover";
  if (node.tagName === "iframe" && how === "src") return "embed";
  if ((how === "href" && (node.tagName === "a" || node.tagName === "area")) || (how === "src" && ["video", "audio", "source", "track"].includes(node.tagName))) return "file";
  return "image";
}

/** The name a data: URL's file came with, for its extension: file.<the extension its media type is kept under>, or file. */
export function dataFileName(url) {
  const type = url.slice(5, url.indexOf(",")).split(";")[0].trim().toLowerCase();
  const extension = Object.keys(MEDIA_TYPES).find((each) => MEDIA_TYPES[each] === type);
  return extension ? `file.${extension}` : "file";
}
