// JSON written back as it was laid out (references/block-script.md, "Writing back"): what a
// package's script of data holds, rewritten by a reader's gesture, changes on the lines that gesture
// means and no others. One copy for every side: the kit's context.editJSON (runtime/kernel.js) writes
// by it, and gallery block check (cli/component-look.mjs) says by it how a part not laid out so
// would be. Pure, no DOM and no Node.

// A value that stands alone on a line's end: no object, no list.
const isValue = (value) => value === null || typeof value !== "object";

/** Whether an object or a list holds values alone, or lists of values: what stands on one line (`{ "name": "价格", "weight": 3 }`, `[[1, 2], [3, 4]]`). */
export const isFlat = (value) => Object.values(value).every((each) => isValue(each) || (Array.isArray(each) && each.every(isValue)));

/**
 * `value` as JSON laid out as a person writes it: what isFlat says on one line, with a space inside an
 * object's braces (`{ "name": "价格", "weight": 3 }`, `[4, 3, 5]`), anything else a line for each
 * entry, two spaces a level from `indent`, so that a change of one value changes its line alone.
 * @param {unknown} value
 * @param {string} indent
 * @returns {string}
 */
export function laidOut(value, indent) {
  if (typeof value?.toJSON === "function") return laidOut(value.toJSON(), indent); // a Date, as JSON.stringify writes it
  if (isValue(value)) return JSON.stringify(value) ?? "null";
  const list = Array.isArray(value);
  // An object's entry of no JSON (undefined, a function) is left out, as JSON.stringify leaves it; a
  // value with toJSON (a Date) is what that gives.
  const entries = Object.entries(value).map(([key, each]) => [key, typeof each?.toJSON === "function" ? each.toJSON() : each]).filter(([, each]) => list || (each !== undefined && typeof each !== "function"));
  const items = entries.map(([key, each]) => `${list ? "" : `${JSON.stringify(key)}: `}${laidOut(each, `${indent}  `)}`);
  if (items.length === 0) return list ? "[]" : "{}";
  if (isFlat(Object.fromEntries(entries))) return list ? `[${items.join(", ")}]` : `{ ${items.join(", ")} }`;
  return `${list ? "[" : "{"}\n${items.map((item) => `${indent}  ${item}`).join(",\n")}\n${indent}${list ? "]" : "}"}`;
}

/**
 * The JSON of `value` in place of what `text` holds (a script of data's text): on one line where it
 * was on one, else laid out (laidOut) from the indentation its first character stands at; the blanks
 * around it kept, and `</` and `<!--`, which could end the script it stands in, escaped.
 * @param {string} text
 * @param {unknown} value
 */
export function jsonIn(text, value) {
  const start = text.length - text.trimStart().length;
  const end = text.trimEnd().length;
  const indent = text.slice(text.lastIndexOf("\n", start) + 1, start);
  const json = text.slice(start, end).includes("\n") ? laidOut(value, indent) : JSON.stringify(value) ?? "null";
  return text.slice(0, start) + json.replaceAll("</", "<\\/").replaceAll("<!--", "\\u003c!--") + text.slice(end);
}
