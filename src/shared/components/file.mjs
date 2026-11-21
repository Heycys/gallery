// A file (文件): one file of the report's folder, <a class="doc-file-link"
// href="assets/<file>" download="<its name>"> holding its name and size, and its caption under it,
// a <figcaption> always written (empty while there is none). A card: the page editor makes one
// (上传, or a link whose file the server downloads into the report's folder), captions, replaces and
// moves it. The preview serves the file from the report's folder for saving; a build and an export
// embed it (render/files.mjs), so the one file holds it.
export default {
  id: "file",
  category: "card",
  media: true,
  match: "figure.doc-file",
  parts: {
    link: { at: ":scope > a.doc-file-link", edit: "none", min: 1, max: 1 },
    name: { at: ":scope > a.doc-file-link > .doc-file-name", edit: "none", min: 1, max: 1 },
    size: { at: ":scope > a.doc-file-link > .doc-file-size", edit: "none", optional: true, max: 1 },
    caption: { at: ":scope > figcaption", edit: "text", min: 1, max: 1 },
  },
  only: ["link", "caption"],
  // Left empty (nothing in it at all): the page editor's placeholder, kept; shown to no reader.
  empty: true,
  attrs: {},
  classes: ["doc-file", "doc-file-link", "doc-file-name", "doc-file-size"],
};
