/**
 * The elements whose text is never a formula: code samples, scripts, styles and the text of form
 * fields. The kit's math.js has KaTeX leave them as they are, and delimiters in them (or in a comment)
 * keep no KaTeX in a report (render/assets.mjs usedAssets; those in a script of JavaScript still do,
 * as it may write formulas into the page).
 */
export const MATH_IGNORED_TAGS = Object.freeze(["script", "noscript", "style", "textarea", "pre", "code", "option"]);

// A macro that drops its arguments (KaTeX's macro context).
const gobble = (count) => (context) => {
  context.consumeArgs(count);
  return "";
};
/**
 * Commands of LaTeX packages KaTeX lacks that AI answers use, as KaTeX macros: the indicator 1 (\mathbbm, \mathds), \mbox, \textsc, \label, \require and
 * \vspace (ignored), physics' \abs \norm \dv \pdv \dd, operators \tr \Tr \diag \sgn \rank, \C \Q,
 * \celsius, siunitx's \SI \si \num \unit (simple forms), \DeclareMathOperator. The kit's math.js
 * draws a report's formulas with them, the editor and the import theirs (page/tex.mjs
 * renderTex). Give KaTeX a copy: \gdef and \DeclareMathOperator write into it.
 */
export const MATH_MACROS = Object.freeze({
  "\\mathbbm": "\\mathbb{#1}", "\\mathds": "\\mathbb{#1}", "\\mbox": "\\text{#1}", "\\textsc": "\\text{#1}",
  "\\label": gobble(1), "\\require": gobble(1), "\\vspace": gobble(1),
  "\\abs": "\\left\\lvert #1\\right\\rvert", "\\norm": "\\left\\lVert #1\\right\\rVert",
  "\\dv": "\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}", "\\pdv": "\\frac{\\partial #1}{\\partial #2}", "\\dd": "\\mathop{}\\!\\mathrm{d}",
  "\\tr": "\\operatorname{tr}", "\\Tr": "\\operatorname{Tr}", "\\diag": "\\operatorname{diag}", "\\sgn": "\\operatorname{sgn}", "\\rank": "\\operatorname{rank}",
  "\\C": "\\mathbb{C}", "\\Q": "\\mathbb{Q}", "\\celsius": "{}^{\\circ}\\mathrm{C}",
  "\\SI": "#1\\,\\mathrm{#2}", "\\si": "\\mathrm{#1}", "\\num": "#1", "\\unit": "\\mathrm{#1}",
  "\\DeclareMathOperator": "\\gdef#1{\\operatorname{#2}}",
});

// Formulas: TeX between \( \) or \[ \] (and $$), rendered by KaTeX through math.js; a formula
// block of its own is .doc-math-block: a basic block.
export default {
  id: "math",
  category: "block",
  match: ".doc-math-inline, .doc-math-block",
  assets: ["katex-styles", "katex", "katex-auto-render", "math"],
  uses: [/\\\(|\\\[|\$\$|data-doc-math/],
  attrs: {
    "data-doc-math": "formulas in this element are rendered too",
    "data-doc-math-dollar": "a single $ delimits formulas in this element",
  },
  classes: ["doc-math-inline", "doc-math-block"],
  // A formula and the closing punctuation right after it, held on one line, the places its drawing
  // may wrap at in between and the word joiner before the marks (runtime/spacing.js). Inside a formula's
  // drawing, which an export of the view keeps: one KaTeX could not read, its TeX kept unseen (math.js).
  runtime: { generated: [".doc-math-break", ".doc-math-joiner"], classes: { ".doc-math-tie": ["doc-math-tie"], ".doc-math-skip": ["doc-math-skip"] }, internal: ["doc-math-invalid", "doc-math-tex"] },
};
