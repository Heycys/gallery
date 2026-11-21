// A code block (代码块): div.doc-code, its title (.doc-code-title: plain text on one line;
// empty, the kit shows 代码块) above its code (a pre holding one code element), highlighted by
// code.js: a basic block, its title and its code edited as plain text. The kit draws its header's
// fold arrow before the title and its language, copy and wrap buttons after it (generated); folded
// (doc-code--folded) it shows its header alone. Its long lines wrap; doc-code--nowrap scrolls
// them instead. Its language is its own (data-language) or the one it looks like (自动识别: its title's
// file extension, else its code). Its lines are numbered from 1, or from data-line-start (an excerpt
// numbered as in its file: src/shared/code-lines.mjs), whose range of lines the kit shows beside its
// title (第 120–139 行, generated). A line that starts a structure has an arrow
// left of its number that folds it, the lines inside hidden (data-folded-lines).
export default {
  id: "code",
  category: "block",
  match: ".doc-code",
  assets: ["code"],
  uses: [/doc-code\b/],
  parts: {
    title: { at: ":scope > .doc-code-title", edit: "text", max: 1 },
    code: { at: ":scope > pre", edit: "text", max: 1 },
  },
  only: ["title", "code"],
  attrs: {
    "data-language": "its language (else the one it looks like: its title's file extension, else its code)",
    "data-line-numbers": "false: no line numbers; on a pre written without its block, the intake moves it onto the block",
    "data-line-start": "the number its first line shows (a whole number from 1; 1 without it): an excerpt numbered as in its file, kept by a copy; on a pre written without its block, the intake moves it onto the block (on a block's pre it does nothing: the checks say so)",
    "data-start": "on a pre written without its block (Prism's): the number its first line shows, which the intake writes as the block's data-line-start",
    "data-title": "on a pre written without its block: its title (a file's name), which the intake writes as the block's .doc-code-title",
    "data-wrap": "on a pre written without its block: false keeps its long lines each on one line, scrolled (a directory tree, a log), which the intake writes as the block's doc-code--nowrap; true wraps them, as the block does anyway",
    "data-folded-lines": "the lines whose structure it shows folded (their places in the block, from 1 whatever data-line-start numbers them, spaces between): a brace's content, a Python body, an element…; on a pre written without its block, the intake moves it onto the block",
  },
  classes: ["doc-code", "doc-code-title", "doc-code--folded", "doc-code--nowrap"],
  runtime: {
    generated: [".doc-code-fold", ".doc-code-range", ".doc-code-tools"],
    internal: ["doc-code-lines", "doc-code-line*", "doc-code-content", "doc-code-toolbar", "doc-code-language", "doc-code-separator", "doc-code-copy*", "doc-code-wrap*", "data-line-number"],
  },
};
