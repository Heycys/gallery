import { MENTION, MENTION_ICON } from "../shared/components/mention.mjs";
import { escapeAttribute } from "../shared/escape.mjs";
import { attr, elementsOf, hasClass, walk } from "../shared/html-tree.mjs";
import { addressOn, decoded, fromFile, hosted, pageAddress, workbenchHash } from "../shared/page-address.mjs";
import { parseReport } from "./report-tree.mjs";

// The links between documents as they leave the workspace (docs/render.md, "Links between
// documents"). A file says ../<slug>/doc.html (shared/page-address.mjs), which means nothing beside a
// file an export writes under another name, and on the clipboard: each of these is the link written
// anew, on the tree of the page, by the places of its elements, so that what only reads like a link
// (a code block showing one) stays as it is, and nothing else of the text changes by a byte. Nothing
// here is kept: a page's own file and whatever serves it never hold what is written for one export.

// The document and block `href`, a link of document `own` that is no anchor, leads to, read as a click
// reads it, or null. With a host it may be another program's on this computer, and is a document's
// only if `links` holds it (addressOn); with none it is this workspace's, whether the document is there
// or not: a workbench's address that names no document of `links` comes with a null slug.
function placeIn(href, own, links) {
  const address = fromFile(href, own);
  const listed = addressOn(address, links);
  if (listed || hosted(href)) return listed;
  return pageAddress(address) ?? (workbenchHash(address) === null ? null : { slug: null, block: null });
}

/**
 * `html`, the page of document `own`, with each of its links to a document written as `write({ slug,
 * block }, href)` says: the new href, or null for its words alone (a chip's icon goes with its link). A
 * link to a block of the page (#<block id>, a block it holds) is one too, with `own` for its slug.
 * `links`: the workspace's (shared/reports.mjs documentLinks). A link the parser reads twice, as it
 * carries one left open into the next block, is one tag of the file: the edits are by where they start.
 */
export function rewritePageLinks(html, own, write, links) {
  const tree = parseReport(html);
  const blocks = new Set();
  const anchors = [];
  walk(tree, (node) => {
    const id = attr(node, "data-block-id");
    if (id !== undefined) blocks.add(id);
    if (node.tagName === "a" && attr(node, "href") !== undefined && node.sourceCodeLocation?.startTag) anchors.push(node);
  });
  const edits = new Map(); // where an edit starts -> [where it ends, what it puts]
  const remove = ({ startOffset, endOffset }) => edits.set(startOffset, [endOffset, ""]);
  for (const link of anchors) {
    const { prefix, value: href } = link.attrs.find(({ name }) => name === "href");
    const anchor = href.startsWith("#") ? decoded(href.slice(1)) : null;
    const place = anchor === null ? href && placeIn(href, own, links) : blocks.has(anchor) ? { slug: own, block: anchor } : null;
    if (!place) continue;
    const written = write(place, href);
    if (written === href) continue;
    const { attrs, startTag, endTag } = link.sourceCodeLocation;
    if (written === null) {
      remove(startTag);
      if (endTag) remove(endTag);
      if (hasClass(link, MENTION)) elementsOf(link).filter((child) => hasClass(child, MENTION_ICON)).forEach((icon) => remove(icon.sourceCodeLocation));
    } else {
      const name = prefix ? `${prefix}:href` : "href"; // a figure's may be xlink:href, and keeps its name
      edits.set(attrs[name].startOffset, [attrs[name].endOffset, `${name}="${escapeAttribute(written)}"`]);
    }
  }
  return [...edits].sort(([a], [b]) => b - a).reduce((text, [from, [to, put]]) => `${text.slice(0, from)}${put}${text.slice(to)}`, html);
}

/**
 * `html`, the page of document `own`, as a file of an export: each link to a document as `linkTo(slug)`
 * says, its link from this file to that document's in the export, or null for one the export does
 * not hold (and for every link of a PDF, which has no place to be relative to), whose words stay. A
 * block's id goes with the link, within the page #<block id>, as the kit finds blocks by it in an
 * export (kit/runtime/reveal.js); with `blocks` false (Markdown, whose files have no such place) it does
 * not, and a link within the page keeps its words. `links`: as rewritePageLinks takes them.
 */
export function exportLinks(html, own, linkTo, { blocks = true, links }) {
  return rewritePageLinks(html, own, ({ slug, block }) => {
    const link = linkTo(slug);
    if (link === null) return null;
    if (!block || !blocks) return slug === own && block ? null : link;
    const fragment = `#${encodeURIComponent(block)}`;
    return slug === own ? fragment : `${link}${fragment}`;
  }, links);
}
