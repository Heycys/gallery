// A diff (代码对比): a code block's look (its title, the header's fold arrow and copy button) showing
// the lines a change adds and removes, its options as JSON in it; the header shows the counts. A
// whole block the kit draws (code.js).
export default {
  id: "diff",
  category: "whole",
  match: ".doc-diff",
  assets: ["code"],
  uses: [/doc-diff\b/],
  parts: {
    title: { at: ":scope > .doc-code-title", edit: "none", max: 1 },
  },
  classes: ["doc-diff"],
  runtime: {
    generated: [".doc-diff-body", ".doc-diff-stats"],
    internal: ["doc-diff-added", "doc-diff-removed"],
  },
};
