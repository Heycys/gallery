// Where a line may break inside a word: one rule for the kit's runtime (runtime/spacing.js: the
// reading page holds each long run in a span that breaks anywhere), its flowcharts' line model
// (runtime/flowchart.js piecesOf) and the page editor (page/long-runs.mjs: a text block holding one
// breaks anywhere as a whole). Ordinary words stay whole at a line's end, in a Chinese page as in an
// English one; a run of more than LONG_RUN characters with no place to break inside it (a path, a
// URL, a long identifier) breaks where its line ends, never carried whole to the next line leaving
// the line before it short (the user's words of 2026-11-07, and of 2026-11-06 before them).
//
// A run is what stands between spaces, Chinese, Japanese or Korean characters, full-width forms and
// the general punctuation (dashes, curly quotes, an ellipsis, a zero-width space: where a line breaks
// already, or what a path or an identifier does not hold): letters, digits and the marks of paths and
// URLs (. : / \ _ = & % # @ …). Inside one Chrome breaks a line after a hyphen and after a question
// mark, and at no other mark of ASCII (Chrome 156: not at a slash, a dot, a colon, a backslash or an
// underscore), so a run is counted by its pieces there: state-of-the-art is three short pieces, never
// long; D:\work\ReportDemo\ReportDemo-Draft.html is long by its first piece (30 characters).
// DOM-free.

/** A run longer than this many characters (by its longest piece) breaks anywhere. */
export const LONG_RUN = 20;

const RUNS = /[^\s\u2000-\u206f\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\ufe30-\ufe4f\uff00-\uffef]+/gu;
const PIECES = /(?<=[-?])/u;

const long = (run) => run.length > LONG_RUN && run.split(PIECES).some((piece) => [...piece].length > LONG_RUN);

/** The long runs of `text`, in order: { index, length } each (code units). */
export function longRuns(text) {
  const found = [];
  if (text.length <= LONG_RUN) return found;
  for (const match of text.matchAll(RUNS)) if (long(match[0])) found.push({ index: match.index, length: match[0].length });
  return found;
}

/** Whether `text` holds a long run. */
export function holdsLongRun(text) {
  if (text.length <= LONG_RUN) return false;
  for (const match of text.matchAll(RUNS)) if (long(match[0])) return true;
  return false;
}
