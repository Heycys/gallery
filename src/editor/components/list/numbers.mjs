import { CONTINUE, START, listType } from "./index.mjs";

// A numbered list's numbers as the kit shows them (src/render/kit/styles/flow.css): from its start
// (1 without one), an item's value counting on from it; 1., a., i. by depth. A list that continues
// the numbered list before it in its flow (data-continue, the numbering continued: other blocks
// between are skipped) starts at that list's last number + 1, which the editor writes as its start
// and keeps in step (keepContinuing). Pure functions of the page's lists.

const FORMATS = ["decimal", "lower-alpha", "lower-roman"];
const isItem = (node) => node?.localName === "li";

/** How deep a list is: 1 for a list standing in a flow, 2 for one an item holds, and so on. */
export function depthOf(list) {
  let depth = 1;
  for (let item = list.parentElement?.closest("li"); item; item = item.parentElement?.closest("li")) depth++;
  return depth;
}

/** How a list at its depth writes its numbers: decimal, lower-alpha or lower-roman. */
export const formatOf = (list) => FORMATS[(depthOf(list) - 1) % 3];

/** The number a numbered list starts at. */
export function firstNumber(list) {
  const start = Number.parseInt(list.getAttribute(START) ?? "", 10);
  return Number.isNaN(start) ? 1 : start;
}

/** The numbers a numbered list's items show, in order. */
export function numbersOf(list) {
  let next = firstNumber(list);
  return [...list.children].filter(isItem).map((item) => {
    const value = Number.parseInt(item.getAttribute("value") ?? "", 10);
    if (!Number.isNaN(value)) next = value;
    return next++;
  });
}

/** The number an item of a numbered list shows. */
export const numberOf = (item) => numbersOf(item.parentElement)[[...item.parentElement.children].filter(isItem).indexOf(item)];

/** The numbered list before a list in its flow (other blocks between skipped, a 流程图 among them), or null. */
export function previousList(list) {
  for (let node = list.previousElementSibling; node; node = node.previousElementSibling) if (node.localName === "ol" && listType(node) === "numbers") return node;
  return null;
}

/** The number a list continuing the numbered list before it starts at, or null when there is none. */
export function continuation(list) {
  const previous = previousList(list);
  if (!previous) return null;
  const numbers = numbersOf(previous);
  return numbers.length > 0 ? numbers.at(-1) + 1 : firstNumber(previous);
}

/** A list's start as written for a number: none for 1. */
export const startFor = (number) => (number === 1 ? null : String(number));

/**
 * The numbered lists of `root` that continue the one before them, their starts brought in step (in
 * page order, as each may follow another such list). Returns whether one changed.
 */
export function keepContinuing(root) {
  let changed = false;
  for (const list of root.querySelectorAll(`ol[${CONTINUE}]`)) {
    const start = startFor(continuation(list) ?? 1);
    if (list.getAttribute(START) === start) continue;
    if (start === null) list.removeAttribute(START);
    else list.setAttribute(START, start);
    changed = true;
  }
  return changed;
}

// ---------- numbers written as a depth writes them ----------

const ROMAN = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]];

/** A number as a format writes it: 3, c (bijective: z, aa), iii (decimal past 3999, as the browser does). */
export function formatNumber(number, format) {
  if (format === "lower-alpha" && number > 0) {
    let text = "";
    for (let rest = number; rest > 0; rest = Math.floor((rest - 1) / 26)) text = String.fromCharCode(97 + ((rest - 1) % 26)) + text;
    return text;
  }
  if (format === "lower-roman" && number > 0 && number < 4000) {
    let text = "";
    let rest = number;
    for (const [value, letters] of ROMAN) for (; rest >= value; rest -= value) text += letters;
    return text;
  }
  return String(number);
}

/** A number typed as a format writes it (or in digits), or NaN. */
export function parseNumber(text, format) {
  const typed = String(text ?? "").trim().toLowerCase();
  if (/^\d+$/.test(typed)) return Number(typed);
  if (format === "lower-alpha" && /^[a-z]+$/.test(typed)) return [...typed].reduce((sum, letter) => sum * 26 + letter.charCodeAt(0) - 96, 0);
  if (format === "lower-roman" && /^[ivxlcdm]+$/.test(typed)) {
    const values = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
    return [...typed].reduce((sum, letter, index) => {
      const value = values[letter];
      return values[typed[index + 1]] > value ? sum - value : sum + value;
    }, 0);
  }
  return Number.NaN;
}
