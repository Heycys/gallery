import fs from "node:fs";
import path from "node:path";
import { reportsDirectory as defaultReportsDirectory } from "../shared/paths.mjs";
import { assetProblem, imageFile } from "../shared/media.mjs";
import { attr, hasClass, walk } from "../shared/html-tree.mjs";
import { firstElement, showReferences } from "./media-ref.mjs";
import { parseReport } from "./report-tree.mjs";

// The pictures of a report's media blocks: an image block's (figure.doc-image,
// src/shared/components/image.mjs) and a bookmark's icon and cover (figure.doc-bookmark,
// bookmark.mjs); and the icons of links shown with one in the text (img.doc-link-mention-icon,
// mention.mjs). Each <img src="assets/<file>"> is a file of the report's folder, shown as media-ref.mjs
// has it. A bookmark's link is the web page's. They are the elements of the report's parse tree, read
// as a browser reads them (media-ref.mjs): a figure's classes as its tokens.

const KINDS = { "doc-image": "image", "doc-bookmark": "bookmark" };
const WHAT = { image: "an image's picture", bookmark: "a bookmark's icon or cover" };
// A page none of whose text names these classes holds none of them: its preview needs no tree for them.
const NAMED = /doc-(?:image|bookmark|link-mention-icon)/;

// The media figures holding pictures: { node, kind }.
function figuresOf(tree) {
  const figures = [];
  walk(tree, (node) => {
    const kind = node.tagName === "figure" && (attr(node, "class") ?? "").split(/\s+/).map((name) => KINDS[name]).find(Boolean);
    if (kind) figures.push({ node, kind });
  });
  return figures;
}

/**
 * The pictures an export embeds (and the preview serves), in the file's order: { at (where the <img>
 * starts), line, node, what, kind ("image", "bookmark" or "mention"), mention }: every picture in an
 * image or bookmark figure, and every link's icon in the text (one in a caption is the figure's already).
 */
export function pictureTags(html, tree = parseReport(html)) {
  const tags = new Map();
  const add = (node, what, kind) => {
    const location = node.sourceCodeLocation;
    if (location && !tags.has(location.startOffset)) tags.set(location.startOffset, { at: location.startOffset, line: location.startLine, node, what, kind, mention: kind === "mention" });
  };
  for (const { node, kind } of figuresOf(tree)) walk(node, (img) => img.tagName === "img" && add(img, WHAT[kind], kind));
  walk(tree, (node) => node.tagName === "img" && hasClass(node, "doc-link-mention-icon") && add(node, "a link's icon", "mention"));
  return [...tags.values()].sort((a, b) => a.at - b.at);
}

/**
 * The report's HTML with its media blocks' pictures where they show: mode "preview", served from
 * the report's folder (/__gallery/edit/asset/<slug>/assets/<file>) with data-ge-src; "export", each
 * a data: URL. A picture whose file is not there stays as it is.
 */
export function embedImages(html, { slug, mode = "export", reportsDirectory = defaultReportsDirectory }) {
  if (!NAMED.test(html)) return html;
  return showReferences(html, pictureTags(html).map(({ node }) => node), { attribute: "src", route: "asset", slug, mode, reportsDirectory });
}

/**
 * What is wrong with the report's media blocks' pictures (one with no src, not of its folder, or not
 * there) and bookmarks' links (one that is no web address), each with its line; a picture's file
 * the preview serves none by says why (shared/media.mjs assetProblem: not in assets/, in a folder of
 * it, a name of characters it does not take, no picture format), never only what the markup is.
 */
export function imageFailures({ html, directory, tree = parseReport(html) }) {
  const failures = [];
  for (const { line, node, what, mention } of pictureTags(html, tree)) {
    const value = attr(node, "src");
    if (mention && !imageFile(value)) failures.push(`line ${line}: a link's icon (${(value ?? "").slice(0, 80)}): ${assetProblem(value, { picture: true })}; or write an empty <span class="doc-link-mention-icon"></span>`);
    else if (value === undefined) failures.push(`line ${line}: ${what} has no src: <img src="assets/<file>" alt="…">`);
    else if (!imageFile(value)) failures.push(`line ${line}: ${what} (${value.slice(0, 80)}): ${assetProblem(value, { picture: true })}`);
    else if (!fs.existsSync(path.join(directory, value))) failures.push(`line ${line}: ${what} ${value} is not in the document's folder`);
  }
  for (const { node, kind } of figuresOf(tree)) {
    const card = kind === "bookmark" ? firstElement(node, "a", "doc-bookmark-card") : null;
    const href = card && attr(card, "href");
    if (card && !/^https?:\/\/[^\s"]+$/.test(href ?? "")) failures.push(`line ${card.sourceCodeLocation?.startLine}: a bookmark's link (${(href ?? "").slice(0, 80)}) is a web address: <a class="doc-bookmark-card" href="https://…">`);
  }
  return [...new Set(failures)];
}
