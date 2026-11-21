import { wordDiff } from "../merge.mjs";

// The words an Agent changed in a text block, as the page marks them (docs/editor.md "Agent's
// changes"): the word diff of the block's text in the baseline against its text on the page
// (merge.mjs wordDiff), as places in the page's text. 历史版本's view of a version marks what it changed
// of the one before it the same way (version.mjs).

/**
 * How they look: the words added a CSS highlight (`ge-diff-add`, the 批注's look in green), the words taken
 * out an empty mark of the page's own drawing them in red struck through (gone-words.mjs goneMark).
 */
export const WORDS_STYLE = `
  ::highlight(ge-diff-add) { background-color: var(--ge-diff-add); text-decoration: underline 2px var(--ge-diff-add-line); }
  .ge-diff-del { user-select: none; pointer-events: none; }
  .ge-diff-del::before { content: attr(data-ge-gone-words); border-radius: 3px; background: var(--ge-diff-del); color: var(--ge-diff-del-text); text-decoration: line-through; text-decoration-color: var(--ge-diff-del-text); -webkit-box-decoration-break: clone; box-decoration-break: clone; }
  .ge-diff-del[data-ge-gone-lead]::before { margin-left: .28em; }
  .ge-diff-del[data-ge-gone-tail]::after { content: " "; }
`;

/**
 * What `now` (the block's text on the page) has that `base` did not and where `base`'s words were
 * taken out of it: { ins: [[from, to]] (ranges of `now`), cuts: [{ at, text }] (a place in `now`,
 * what was taken out there; one where several runs meet) }.
 */
export function wordMarks(base, now) {
  const ins = [];
  const cuts = [];
  let at = 0;
  for (const { tag, text } of wordDiff(base, now)) {
    if (tag === "del") {
      const last = cuts.at(-1);
      if (last?.at === at) last.text += text;
      else cuts.push({ at, text });
      continue;
    }
    if (tag === "ins") ins.push([at, at + text.length]);
    at += text.length;
  }
  return { ins, cuts };
}
