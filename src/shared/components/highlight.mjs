// A highlight panel (高亮块), a container of blocks; the opening summary is one. Its first child may be
// an icon (.doc-icon: an emoji, an icon of a set or an image, as the page's), standing left of its blocks.
export default {
  id: "highlight",
  category: "container",
  match: ".doc-panel, .doc-summary",
  flow: ".doc-summary, .doc-panel",
  classes: ["doc-panel", "doc-summary"],
};
