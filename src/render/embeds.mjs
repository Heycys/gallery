import fs from "node:fs";
import path from "node:path";
import { pageLanguage } from "../shared/components/page.mjs";
import { escapeMarkup } from "../shared/escape.mjs";
import { reportsDirectory as defaultReportsDirectory } from "../shared/paths.mjs";
import { assetFile, assetProblem, embedFile } from "../shared/media.mjs";
import { attr, hasClass, walk } from "../shared/html-tree.mjs";
import { firstElement, showReferences } from "./media-ref.mjs";
import { parseReport } from "./report-tree.mjs";

// The frames of a report's embed blocks (figure.doc-embed, src/shared/components/embed.mjs): a
// web page's (https://…, sandboxed), or an HTML or PDF file of the report's folder. The preview has
// the server show such a file (an HTML file sandboxed by the server too, never in the editor's origin),
// shown as media-ref.mjs has it; an export's data: URL of a PDF is shown through a blob: one by the
// runtime (runtime/embeds.js). They are the elements of the report's parse tree, read as a browser
// reads them (media-ref.mjs).

// Each embed block with its frame (the first iframe.doc-embed-frame in it), { figure, frame }, in the
// file's order; a block with none is the component's own check's to say.
function embedsOf(tree) {
  const found = [];
  walk(tree, (node) => {
    const frame = node.tagName === "figure" && hasClass(node, "doc-embed") ? firstElement(node, "iframe", "doc-embed-frame") : null;
    if (frame) found.push({ figure: node, frame });
  });
  return found;
}
const framesOf = (tree) => embedsOf(tree).map(({ frame }) => frame);

/**
 * The report's HTML with its embed blocks' files where they show: mode "preview", shown by the
 * server (/__gallery/edit/embed/<slug>/assets/<file>) with data-ge-src; "export", each a data: URL.
 * A file that is not there, and a web page, stay as they are.
 */
export function embedFrames(html, { slug, mode = "export", reportsDirectory = defaultReportsDirectory }) {
  if (!html.includes("doc-embed")) return html; // a page with no embed block needs no tree for them
  return showReferences(html, framesOf(parseReport(html)), { attribute: "src", route: "embed", slug, mode, reportsDirectory });
}

// The words of an embed's file in an export that writes embeds as links, in the page's language.
const NOT_CARRIED = { zh: "嵌入的文件，没有随导出带出", en: "An embedded file, not carried in this export" };

/**
 * The report's HTML with each embed block written as a link to the page it shows (gallery export
 * --embeds-as-links, for a platform that strips frames, as 语雀 strips every <iframe>): the block becomes
 * a bookmark's card in the bookmark's own markup (src/shared/components/bookmark.mjs, the look the
 * document has for a link to a page: the kit's report.css holds it, whichever blocks a page has), its
 * figure keeping its other classes, its id and its caption. A web page's card is its frame's title (else
 * the page's host) and its address, opening it in a new tab. A file of the document's folder has no
 * address a reader elsewhere can open, nor does the export carry it: its card is its name (the frame's
 * title, else the file's) and a line saying so in the page's language, linking nowhere (a card with no
 * href is none to click: bookmark.css). A block left empty, and a frame that is neither (which no export
 * passes), stay as they are. Run on the source before it is rendered, so that no file is embedded for a
 * frame that is gone. Imported again, such an export's embeds are bookmarks: it is made for a platform,
 * not to come back.
 */
export function embedsAsLinks(html) {
  if (!html.includes("doc-embed")) return html;
  const tree = parseReport(html);
  const words = NOT_CARRIED[pageLanguage(html)];
  const edits = []; // { start, end, text }
  for (const { figure, frame } of embedsOf(tree)) {
    const classPlace = figure.sourceCodeLocation?.attrs?.class;
    const framePlace = frame.sourceCodeLocation;
    const value = (attr(frame, "src") ?? "").trim();
    const web = /^https:\/\/[^\s"]+$/i.test(value);
    if (!classPlace || !framePlace || (!web && !embedFile(value))) continue;
    const given = (attr(frame, "title") ?? "").trim();
    let card;
    if (web) {
      let host = value;
      try { host = new URL(value).hostname || value; } catch {}
      const text = `<span class="doc-bookmark-title">${escapeMarkup(given || host)}</span><span class="doc-bookmark-url"><span class="doc-bookmark-href">${escapeMarkup(value)}</span></span>`;
      card = `<a class="doc-bookmark-card" href="${escapeMarkup(value)}" target="_blank" rel="noopener noreferrer"><span class="doc-bookmark-text">${text}</span></a>`;
    } else {
      const name = given || value.split("/").at(-1);
      card = `<a class="doc-bookmark-card"><span class="doc-bookmark-text"><span class="doc-bookmark-title">${escapeMarkup(name)}</span><span class="doc-bookmark-description">${escapeMarkup(words)}</span></span></a>`;
    }
    const classes = (attr(figure, "class") ?? "").split(/\s+/).filter((name) => name && name !== "doc-embed" && name !== "doc-embed--file");
    edits.push({ start: classPlace.startOffset, end: classPlace.endOffset, text: `class="${escapeMarkup(["doc-bookmark", ...classes].join(" "))}"` });
    edits.push({ start: framePlace.startOffset, end: framePlace.endOffset, text: card });
  }
  edits.sort((a, b) => a.start - b.start);
  const pieces = [];
  let cursor = 0;
  for (const { start, end, text } of edits) {
    if (start < cursor) continue;
    pieces.push(html.slice(cursor, start), text);
    cursor = end;
  }
  pieces.push(html.slice(cursor));
  return pieces.join("");
}

/** Where each frame embedFrames shows starts in the HTML (render/asset-references.mjs asks which references an export embeds). */
export const frameStarts = (html, tree = parseReport(html)) => framesOf(tree).map((frame) => frame.sourceCodeLocation.startOffset);

/**
 * What is wrong with the report's embed blocks' frames, each with its line: one that is neither a
 * web page nor an HTML or PDF file of its folder that is there; a web page's or an HTML file's frame
 * with no sandbox, an HTML file's sandbox giving it the page's origin; a PDF's frame with a sandbox,
 * where the browser shows no PDF (its viewer does not run in a sandboxed frame).
 */
export function embedFailures({ html, directory, tree = parseReport(html) }) {
  const failures = [];
  for (const frame of framesOf(tree)) {
    const line = `line ${frame.sourceCodeLocation.startLine}`;
    const value = attr(frame, "src") ?? "";
    const sandbox = attr(frame, "sandbox");
    const web = /^https:\/\/[^\s"]+$/.test(value);
    // A file of the folder the preview serves none by: why (assetProblem), the web page beside it.
    const unserved = !web && !/^[a-z][a-z0-9+.-]*:/i.test(value) && !assetFile(value) ? assetProblem(value) : null;
    if (unserved) failures.push(`${line}: an embed's frame (${value.slice(0, 80)}): ${unserved} (an HTML or PDF file; or a web page, https://…)`);
    else if (!web && !embedFile(value)) failures.push(`${line}: an embed's frame (${value.slice(0, 80)}) shows a web page (https://…, never http) or an HTML or PDF file of the document's folder (assets/<file>)`);
    else if (!web && !fs.existsSync(path.join(directory, value))) failures.push(`${line}: the embed's file ${value} is not in the document's folder`);
    else if ((web || /\.html?$/i.test(value)) && sandbox === undefined) failures.push(`${line}: an embed's frame (${value.slice(0, 80)}) is sandboxed: sandbox="allow-scripts allow-popups …"`);
    else if (!web && /\.html?$/i.test(value) && /\ballow-same-origin\b/.test(sandbox)) failures.push(`${line}: an embedded HTML file (${value}) keeps its own origin: its sandbox has no allow-same-origin`);
    else if (!web && /\.pdf$/i.test(value) && sandbox !== undefined) failures.push(`${line}: an embedded PDF (${value}) is sandboxed, and a sandboxed frame shows no PDF: take its sandbox attribute off`);
  }
  return [...new Set(failures)];
}
