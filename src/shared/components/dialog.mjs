// A detail card (详情卡片): a dialog opened by a link to it or by data-doc-dialog-open; its content a
// flow of blocks like the page's, which any block may start (dialogs.js).

/**
 * What a card held besides, in the kit's older form: a header in its panel, of its title and a close
 * button. A file that still has them is read as the new form (source/natural.mjs headedCard).
 */
export const HEADED = { header: "doc-dialog-header", title: "doc-dialog-title", close: "doc-dialog-close", closeAttribute: "data-doc-dialog-close" };

export default {
  id: "dialog",
  category: "container",
  match: "dialog.doc-dialog",
  assets: ["dialogs"],
  uses: [/doc-dialog/],
  parts: {
    content: { at: ":scope > .doc-dialog-panel > .doc-dialog-content", edit: "flow", max: 1 },
  },
  attrs: {
    "data-doc-dialog-open": "opens the detail card this selector finds",
  },
  classes: ["doc-dialog", "doc-dialog-panel", "doc-dialog-content", "doc-dialog-trigger"],
  runtime: {
    // a.doc-dialog-trigger: aria-haspopup="dialog" while the page is read (dialogs.js), never while it is edited.
    attrs: { "dialog.doc-dialog": ["data-doc-dialog-ready", "open", "aria-label"], ".doc-dialog-content": ["tabindex"], "a.doc-dialog-trigger": ["aria-haspopup"] },
    root: { classes: ["doc-dialog-open", "doc-dialog-gutter"] },
    internal: ["doc-dialog-in", "doc-dialog-fade"], // its styles' keyframes (coming up, the backdrop fading in)
  },
};
