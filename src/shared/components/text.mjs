// Inline marks of the format bar in body text: colors, highlights, underlines (the kit's
// styles/base.css). Inline, no block.
const COLORS = ["gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];

export default {
  id: "text",
  classes: [
    ...COLORS.map((color) => `doc-text-${color}`),
    ...COLORS.map((color) => `doc-highlight-${color}`),
    ...["orange", "blue", "purple", "plain", "thin", "thick"].map((kind) => `doc-underline-${kind}`),
  ],
  // A number range in the text (3–13, 1–3B), held on one line, and a long run (a path, a URL: src/shared/long-runs.mjs) held in a span that breaks anywhere (runtime/spacing.js).
  runtime: { classes: { ".doc-range": ["doc-range"], ".doc-long-run": ["doc-long-run"] } },
};
