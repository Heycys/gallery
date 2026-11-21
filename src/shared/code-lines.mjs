// The number a code block's first line shows, written once: the kit's code.js numbers its lines from
// it in the reading view, the page editor in its line numbers' column, and the export takes it in
// from what an Agent writes (src/editor/source/natural.mjs: data-line-start, or Prism's data-start).
// An excerpt of a file shows the file's own numbers so: data-line-start="38" numbers its lines 38,
// 39 … Its folded lines (data-folded-lines) are counted in the block, from 1, whatever it shows.

/** The class of a code block (div.doc-code) whose long lines scroll, each on one line. */
export const NOWRAP = "doc-code--nowrap";

/** The attribute on a code block that says the lines whose structure is folded: their numbers (1-based), ascending, spaces between. */
export const FOLDED_LINES = "data-folded-lines";
const FOLDED_NUMBERS = /^[1-9]\d{0,5}( [1-9]\d{0,5}){0,499}$/;

/** Whether a value is folded lines as data-folded-lines takes them. */
export const validFolded = (value) => typeof value === "string" && FOLDED_NUMBERS.test(value);

/** The attribute on a code block (div.doc-code) that numbers its first line. */
export const LINE_START = "data-line-start";

/**
 * A first line's number as an attribute writes it: a whole number from 1 (six digits at most, zeros
 * before them as a file's listing may pad it: 038), blanks around it.
 */
const NUMBER = /^\s*0*([1-9]\d{0,5})\s*$/;

/** The number a value of data-line-start gives the first line, or null when it gives none (1 then). */
export function lineStart(value) {
  const found = NUMBER.exec(value ?? "");
  return found ? Number(found[1]) : null;
}
