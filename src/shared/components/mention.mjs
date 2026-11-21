// A whole in a block's text, a link shown with its icon and title: inline, one element whose address
// says what it is. <a class="doc-link-mention" href="…"> holds its icon first, then its title, text only.
//
//   to a web page (图标视图, a link mention)  href="https://…", its icon an
//     <img class="doc-link-mention-icon" src="assets/<file>" alt=""> (the page's icon, kept in the
//     report's folder: render/images.mjs shows it in the preview and embeds it in an export) or an
//     empty <span class="doc-link-mention-icon"></span> (the kit draws a globe)
//   to a document of the workspace (页面块)  href="../<slug>/doc.html", with #<block id> for a block,
//     or #<block id> within a page (the one form a file writes: shared/page-address.mjs), its icon an
//     empty span, the title as it was when the block was made: what is shown is the document's title
//     and icon now (render/page-chips.mjs), and the kit draws a page for one with no icon
//
// The page editor makes one from a link and keeps it whole, as a formula (page/links/). One left empty
// is <a class="doc-link-mention"></a> (the editor's "/" menu's 链接 given no address) or, of a page
// block, <a class="doc-link-mention" data-doc-page></a>: no reader sees it (mention.css), the editor
// shows it as a gray 链接 or 页面 to be filled.

export const MENTION = "doc-link-mention";
export const MENTION_ICON = "doc-link-mention-icon";
/** What marks a page block left empty, which has no address to say so. */
export const MENTION_PAGE = "data-doc-page";

// Inline, as the format bar's marks (text.mjs): no block, no match of its own.
export default {
  id: "mention",
  attrs: {
    [MENTION_PAGE]: "a page block left empty, which has no address to say it is one",
  },
  classes: [MENTION, MENTION_ICON],
  runtime: {
    attrs: { "a.doc-link-mention": ["data-doc-gone"] }, // a page block whose document is not there (render/page-chips.mjs)
  },
};
