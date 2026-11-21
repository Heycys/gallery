// An embed (嵌入): a web page shown in a frame on the page, or an HTML or PDF
// file of the report's folder, and its caption under it, a <figcaption> always written (empty while
// there is none). <iframe class="doc-embed-frame" src="https://…" sandbox="…"> for a web page (it
// stays on the web: an export shows it where the reader is online); src="assets/<file>.html" (a
// sandbox without allow-same-origin) or "assets/<file>.pdf" (no sandbox: the browser's own viewer)
// for a file, which an export embeds (render/embeds.mjs; the runtime shows an embedded PDF through a
// blob: address, runtime/embeds.js). Its height is --doc-embed-height (px) in its style
// attribute, else 320px (a file's 500px, .doc-embed--file). A card: the page editor makes one
// (链接, or 上传), resizes its height, captions and moves it.
export default {
  id: "embed",
  category: "card",
  media: true,
  match: "figure.doc-embed",
  parts: {
    frame: { at: ":scope > iframe.doc-embed-frame", edit: "none", min: 1, max: 1 },
    caption: { at: ":scope > figcaption", edit: "text", min: 1, max: 1 },
  },
  only: ["frame", "caption"],
  // Left empty (nothing in it at all): the page editor's placeholder, kept; shown to no reader.
  empty: true,
  attrs: {},
  classes: ["doc-embed", "doc-embed--file", "doc-embed-frame"],
  runtime: { attrs: { "iframe.doc-embed-frame": ["data-doc-blob"] } },
};
