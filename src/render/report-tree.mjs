import { parse } from "parse5";

// The one way the render reads a report's HTML as a tree (the helpers on it are shared/html-tree.mjs:
// attr, hasClass, walk; the components' selectors, shared/components/index.mjs: matchesNode, partOf,
// instancesOf). Every element has its place in the source (`sourceCodeLocation`: offsets and
// lines), read as a browser with scripts reads it: what a <noscript> holds is text, no element.
//
// What stays text: the embeds (images.mjs, files.mjs, embeds.mjs, emoji.mjs) put a data: URL or a
// served address in the file's own text where they find a block (the media blocks' elements found on
// this tree, at their place in the file: media-ref.mjs), so that nothing else of it changes by a
// byte; the shared asset tags are lines of that text (assets.mjs); the structure checks look at the
// text for what is no element (a placeholder).

/**
 * The report's HTML as parse5's tree, with the source place of every element. A byte order mark
 * the file starts with (an editor that saves UTF-8 "with BOM" writes one) is read as a browser
 * decodes it away: parse5 would take it for text and leave the page's own <html> and <head> unread.
 * A space stands in its place, which the parser passes over, so every offset and line stays the file's.
 */
export const parseReport = (html) => parse(html.replace(/^\uFEFF/, " "), { sourceCodeLocationInfo: true });

/** An element's source text. */
export const sourceOf = (html, node) => html.slice(node.sourceCodeLocation.startOffset, node.sourceCodeLocation.endOffset);

/** The line (counted from 1) an offset of the source is on, as the checks name it. */
export function lineAt(html, offset) {
  let line = 1;
  for (let at = html.indexOf("\n"); at !== -1 && at < offset; at = html.indexOf("\n", at + 1)) line++;
  return line;
}
