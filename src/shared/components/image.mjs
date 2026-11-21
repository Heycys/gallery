// An image (图片): one picture of the report's folder, <img src="assets/<file>"
// alt="…">, and its caption under it, a <figcaption> always written (empty while there is none).
// Its width is the picture's own, at most the width it stands in, or a share of that width
// (--doc-span in its style attribute, sizes.css); centered, or at the left or right. A card: the
// page editor makes one (上传, or a link it downloads), resizes, aligns, captions and moves it. The
// preview serves its picture from the report's folder; a build and an export embed it
// (render/images.mjs). A reader's click opens its picture large (runtime below).
export default {
  id: "image",
  category: "card",
  media: true,
  match: "figure.doc-image",
  parts: {
    picture: { at: ":scope > img", edit: "none", min: 1, max: 1 },
    caption: { at: ":scope > figcaption", edit: "text", min: 1, max: 1 },
  },
  only: ["picture", "caption"],
  // Left empty (nothing in it at all): the page editor's placeholder, kept; shown to no reader.
  empty: true,
  // A cropped picture (the page editor's 裁剪图片): the picture it was cropped from, in the report's
  // folder, and what of it is kept; the export shows the cropped one.
  attrs: {
    "data-original": "the picture a cropped one was cropped from (assets/<file>)",
    "data-crop": "what of the original a cropped picture keeps: x y width height, in % of it",
  },
  classes: ["doc-image", "doc-image--left", "doc-image--right"],
  // 图片放大 (runtime/zoom.js, which pictures by src/shared/zoom.mjs: an image block's and any other
  // picture of the page): a picture clicked opens large in a viewer of the kit's, a <dialog> at the
  // end of <body> while it is open, <html> kept from scrolling meanwhile (and, while the pointer is on
  // a picture that opens, showing the zoom-in cursor). Nothing an author writes. While the page is
  // read, a picture that opens is offered to the keyboard (data-doc-zoom, src/shared/zoom.mjs
  // ZOOM_MARK: a tab stop, a button's role, a popup, its name), which an export of the view takes off.
  runtime: {
    generated: ["dialog.doc-zoom"],
    attrs: { "img[data-doc-zoom]": ["data-doc-zoom", "tabindex", "role", "aria-haspopup", "aria-label"] },
    root: { classes: ["doc-zoom-open", "doc-zoom-gutter", "doc-zoom-hover"] },
    internal: ["doc-zoom-*"], // the viewer's parts (picture, caption, close button) and its styles' keyframes
  },
};
