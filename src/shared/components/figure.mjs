// A card (卡片块): a figure, a chart or a drawing of the report's own, framed once, moved and resized
// as a whole. Its title and caption are text; what else it holds (a chart, a drawing in HTML or SVG
// of the report's own) is the card's content as it is.
export default {
  id: "figure",
  category: "card",
  match: "figure",
  parts: {
    title: { at: ":scope > h3", edit: "text", optional: true, max: 1 },
    caption: { at: ":scope > .doc-figure-caption", edit: "text", optional: true, max: 1 },
  },
  attrs: { "data-surface": "bounded: framed, as every card is (older files write it)" },
  classes: ["doc-figure", "doc-figure--compact", "doc-figure--plain", "doc-figure-caption"],
};
