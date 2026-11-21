// A disclosure (折叠列表), a container: its summary's label is its title, its content a flow of
// blocks, and nothing else: a summary without its label, or any other element beside the summary and
// the content, is a failure of gallery check (the kit does not wrap or indent one).
export default {
  id: "details",
  category: "container",
  match: "details.doc-details",
  parts: {
    summary: { at: ":scope > summary", edit: "none", max: 1 },
    label: { at: ":scope > summary > .doc-details-summary-label", edit: "text", max: 1 },
    content: { at: ":scope > .doc-details-content", edit: "flow", max: 1 },
  },
  only: ["summary", "content"],
  classes: ["doc-details", "doc-details-summary-label", "doc-details-content"],
};
