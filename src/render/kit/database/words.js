import { kitLanguage } from "../words.js";
import { EN } from "./words-en.js";

// A database's words (its menus, its buttons, its hints), in Chinese and English: the drawing says each
// in Chinese, w("…"), and reads it in the language the kit speaks on the page (../words.js kitLanguage:
// the UI's while Gallery shows it, else the page's lang). {0}, {1}… are filled in from what follows; an
// English word a count changes is a function of the values (1 record, 2 records). tests/unit/database.mjs
// holds every word said to have its English, and every English to be said.

/** The language the drawing speaks: "zh" or "en". */
export const language = () => kitLanguage();

/** A word in the page's language, its {0}, {1}… filled with `values`. */
export function w(text, ...values) {
  const english = language() === "en" ? EN[text] : undefined;
  const said = typeof english === "function" ? english(...values) : english ?? text;
  return values.length === 0 ? said : said.replace(/\{(\d+)\}/g, (whole, index) => (index < values.length ? String(values[index]) : whole));
}
