// A bookmark (网页书签): a web page as a card the reader clicks to open it
// in a new tab, its title, description and address (with the page's icon) and its cover at the
// right, and its caption under it, a <figcaption> always written (empty while there is none). The
// page editor makes one from a link: the server reads the page (editor/unfurl.mjs) and keeps its
// icon and cover in the report's folder (assets/), which an export embeds (render/images.mjs); the
// link stays the page's. A card: moved, deleted, captioned as a whole.
export default {
  id: "bookmark",
  category: "card",
  media: true,
  match: "figure.doc-bookmark",
  parts: {
    card: { at: ":scope > a.doc-bookmark-card", edit: "none", min: 1, max: 1 },
    text: { at: ":scope > a.doc-bookmark-card > .doc-bookmark-text", edit: "none", min: 1, max: 1 },
    title: { at: ":scope > a.doc-bookmark-card > .doc-bookmark-text > .doc-bookmark-title", edit: "none", min: 1, max: 1 },
    description: { at: ":scope > a.doc-bookmark-card > .doc-bookmark-text > .doc-bookmark-description", edit: "none", optional: true, max: 1 },
    address: { at: ":scope > a.doc-bookmark-card > .doc-bookmark-text > .doc-bookmark-url", edit: "none", min: 1, max: 1 },
    cover: { at: ":scope > a.doc-bookmark-card > .doc-bookmark-cover", edit: "none", optional: true, max: 1 },
    caption: { at: ":scope > figcaption", edit: "text", min: 1, max: 1 },
  },
  only: ["card", "caption"],
  // Left empty (nothing in it at all): the page editor's placeholder, kept; shown to no reader.
  empty: true,
  attrs: {},
  classes: ["doc-bookmark", "doc-bookmark-card", "doc-bookmark-text", "doc-bookmark-title", "doc-bookmark-description", "doc-bookmark-url", "doc-bookmark-icon", "doc-bookmark-href", "doc-bookmark-cover"],
};
