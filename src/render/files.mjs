import fs from "node:fs";
import path from "node:path";
import { reportsDirectory as defaultReportsDirectory } from "../shared/paths.mjs";
import { assetFile, assetProblem } from "../shared/media.mjs";
import { attr, hasClass, walk } from "../shared/html-tree.mjs";
import { firstElement, showReferences } from "./media-ref.mjs";
import { parseReport } from "./report-tree.mjs";

// The files of a report's file blocks (figure.doc-file, src/shared/components/file.mjs): each
// <a class="doc-file-link" href="assets/<file>" download="<its name>"> is a file of the report's
// folder, shown as media-ref.mjs has it (the preview has the server hand it out for saving). They
// are the elements of the report's parse tree, read as a browser reads them (media-ref.mjs).

/**
 * The file blocks, in the file's order: { node (the figure), link } with the block's link (the first
 * a.doc-file-link in it), or null when it holds none.
 */
export function fileBlocks(html, tree = parseReport(html)) {
  const blocks = [];
  walk(tree, (node) => {
    if (node.tagName === "figure" && hasClass(node, "doc-file")) blocks.push({ node, link: firstElement(node, "a", "doc-file-link") });
  });
  return blocks;
}

/**
 * The report's HTML with its file blocks' files where they are: mode "preview", handed out by the
 * server (/__gallery/edit/file/<slug>/assets/<file>) with data-ge-href; "export", each a data: URL.
 * A file that is not there stays as it is.
 */
export function embedFiles(html, { slug, mode = "export", reportsDirectory = defaultReportsDirectory }) {
  if (!html.includes("doc-file")) return html; // a page with no file block needs no tree for them
  const links = fileBlocks(html).flatMap(({ link }) => (link ? [link] : []));
  return showReferences(html, links, { attribute: "href", route: "file", slug, mode, reportsDirectory });
}

/**
 * What is wrong with the report's file blocks' files, each with its line: one not of its folder, or
 * not there, or with no name to save it as.
 */
export function fileFailures({ html, directory, tree = parseReport(html) }) {
  const failures = [];
  for (const { link } of fileBlocks(html, tree)) {
    if (!link) continue; // an empty block (a placeholder the editor keeps), or the component's own check says it has no link
    const line = `line ${link.sourceCodeLocation?.startLine}`;
    const value = attr(link, "href") ?? "";
    if (!assetFile(value)) failures.push(`${line}: a file block's file (${value.slice(0, 80)}): ${assetProblem(value)} (<a class="doc-file-link" href="assets/<file>" download="<name>">)`);
    else if (!fs.existsSync(path.join(directory, value))) failures.push(`${line}: the file block's file ${value} is not in the document's folder`);
    if (!attr(link, "download")) failures.push(`${line}: a file block's link (${value.slice(0, 80)}) says the name to save it as: download="<name>"`);
  }
  return [...new Set(failures)];
}
