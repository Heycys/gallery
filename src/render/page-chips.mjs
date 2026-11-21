import fs from "node:fs";
import { MENTION, MENTION_ICON } from "../shared/components/mention.mjs";
import { escapeAttribute, escapeText } from "../shared/escape.mjs";
import { iconUrl, validIcon } from "../shared/emoji/icon-value.mjs";
import { attr, hasClass, walk } from "../shared/html-tree.mjs";
import { fromFile, isFileLink, pageAddress } from "../shared/page-address.mjs";
import { reportsDirectory as defaultReportsDirectory } from "../shared/paths.mjs";
import { documentDirectory, documentFiles } from "../shared/workspace.mjs";
import { iconImage } from "./emoji.mjs";
import { parseReport } from "./report-tree.mjs";

// Page blocks as a page shows them (docs/render.md, "Page blocks"). A file holds a page block's title
// as it was when the block was made, an empty icon and an ordinary link: what an Agent reads there is
// plain words, and no rename ever writes a document that only links to the one renamed. What a reader
// sees is drawn here from the target's doc.json, its title now and its icon, an image by the icon route in
// the preview and a data: URL in an export, where what is drawn is read as words (Markdown, a search)
// its title alone; a target that is not there keeps its words, marked
// (data-doc-gone, the kit draws it gray). Nothing here goes back to the file: the editor keeps what
// the file says beside what is shown (core.mjs ATOM_SOURCE), and the served page's cache goes when a
// document.json or a document's folder changes (src/server/routes.mjs changed).

// What a document's doc.json says of it: { title, icon }, or null for no document of that folder.
function documentOf(slug, directory) {
  const { html, json } = documentFiles(documentDirectory(slug, directory));
  if (!fs.existsSync(html)) return null;
  try {
    const { title, icon } = JSON.parse(fs.readFileSync(json, "utf8"));
    return { title, icon };
  } catch {
    return {};
  }
}

// An icon's image: where the preview's icon route gives it, in an export a data: URL, or null (for
// words there is none). In its own color, whatever the page's theme, as a glyph on its own has none.
function iconSource(value, slug, mode, reportsDirectory) {
  if (mode === "words" || typeof value !== "string" || !validIcon(value)) return null;
  if (mode === "preview") return iconUrl(value, slug, { tab: true });
  const image = iconImage({ value, slug, tab: true, reportsDirectory });
  return image && `data:${image.type};base64,${image.body.toString("base64")}`;
}

/**
 * `html`, the page of document `slug`, with each page block as `mode` shows it ("preview": icons by
 * the icon route; "export": data: URLs; "words": the title alone, its icon left empty as a file has
 * it, for what reads the page as text). `reportsDirectory`: where the documents are.
 */
export function drawPageChips(html, { slug, mode = "export", reportsDirectory = defaultReportsDirectory }) {
  if (!html.includes(MENTION)) return html;
  const documents = new Map();
  const read = (target) => {
    if (!documents.has(target)) documents.set(target, documentOf(target, reportsDirectory));
    return documents.get(target);
  };
  const edits = new Map(); // where an edit starts -> [where it ends, what it puts]: a link the parser reads twice is one tag of the file
  walk(parseReport(html), (node) => {
    const href = node.tagName === "a" && hasClass(node, MENTION) ? attr(node, "href") : undefined;
    const { startTag, endTag } = node.sourceCodeLocation ?? {};
    if (!href || !isFileLink(href) || !startTag || !endTag) return;
    const target = pageAddress(fromFile(href, slug))?.slug;
    if (!target) return;
    const shown = read(target);
    if (!shown) edits.set(startTag.endOffset - 1, [startTag.endOffset - 1, " data-doc-gone"]);
    else if (shown.title) {
      const icon = iconSource(shown.icon, target, mode, reportsDirectory);
      edits.set(startTag.endOffset, [endTag.startOffset, `${icon ? `<img class="${MENTION_ICON}" src="${escapeAttribute(icon)}" alt="">` : `<span class="${MENTION_ICON}"></span>`}${escapeText(shown.title)}`]);
    }
  });
  return [...edits].sort(([a], [b]) => b - a).reduce((text, [from, [to, put]]) => `${text.slice(0, from)}${put}${text.slice(to)}`, html);
}
