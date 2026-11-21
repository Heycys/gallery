import { unescapeText } from "./escape.mjs";

// How many words a report holds (the workbench's menus say it: 129 个字):
// each Chinese, Japanese or Korean character one, each run of other letters and digits one. What is
// counted is the text of its main below the header (the title and the icon are not the body): no
// script, style or template, a formula one word (its TeX is no prose).

const SKIPPED = /<(script|style|template|noscript|svg)\b[\s\S]*?<\/\1>/gi;
const FORMULA = /\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu;
const WORD = /[\p{L}\p{N}]+(?:['’.-][\p{L}\p{N}]+)*/gu;

/** The words of report `html` (a whole report.html, or the inside of its main). */
export function countWords(html) {
  let body = String(html);
  const main = /<main\b[^>]*>([\s\S]*)<\/main>/i.exec(body);
  if (main) body = main[1];
  body = body.replace(/^\s*<header\b[^>]*>[\s\S]*?<\/header>/i, " "); // the page's header: its title and icon
  const text = unescapeText(body.replace(SKIPPED, " ").replace(FORMULA, " 公式 ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))));
  const formulas = (body.match(FORMULA) ?? []).length;
  const cjk = (text.match(CJK) ?? []).length - formulas * 2; // "公式" stands for a formula: one word, not two characters
  return cjk + formulas + (text.replace(CJK, " ").match(WORD) ?? []).length;
}
