import EN from "./en.mjs";
import { KEYS, OLD_KEYS } from "../renamed-storage.mjs";

// The language of Gallery's own UI (the workbench, the page editor's menus, cards and notices),
// chosen in the workbench's 设置 › 语言: Chinese (the source's own words) or English. A report's
// content is never translated. Each string is written in Chinese where it is used and goes through
// t(): its English is looked up in en.mjs by that Chinese text (tests/unit/i18n.mjs holds every
// one to having an entry), so the code reads as before and nothing is named twice. A string with
// parts filled in writes them as {0}, {1}… (t("已导入 {0} 个页面", count)). Chinese has no plural, English
// has: an entry of en.mjs is a string, or, for words a count changes ("1 conflict", "2 conflicts"), a
// function of the values t() was given that returns the English whole (en.mjs many() and one()).
// The choice is kept in localStorage, which the workbench and every preview page share (one
// origin); changing it reloads the workbench, so every string, those made once as a module loads
// too, is made again in the language chosen. Without a choice: the browser's language (Chinese for
// zh-*, else English).

/** The languages, by code, each named in itself. */
export const LANGUAGES = { zh: "中文", en: "English" };
const KEY = KEYS.language;

function stored() {
  try {
    const value = globalThis.localStorage?.getItem(KEY);
    return Object.hasOwn(LANGUAGES, value ?? "") ? value : null;
  } catch {
    return null;
  }
}

// The language in use, of the one kept (a code of LANGUAGES, or null) and the browser's: one rule for
// the UI's modules (language) and a report page's first script (languageScript), which runs it as text.
function inUse(kept, browser) {
  return kept ?? (/^zh\b/i.test(browser ?? "zh") ? "zh" : "en");
}

/** The language in use: "zh" or "en". */
export const language = inUse(stored(), globalThis.navigator?.language);
// The language t() says things in: the one in use, but while inLanguage runs.
let speaking = language;

/**
 * What a report page Gallery shows (the page edited, presented, the 写作偏好 dialog's) runs first, in
 * its head (src/server/routes.mjs): the UI's language on its root as data-ge-language, which the kit's
 * own words follow (src/render/kit/words.js: its chrome, an empty code block's title), read as
 * `language` reads it, before the kit draws anything. An export of the view takes every data-ge-*
 * attribute off (the kit's ui.js), so an exported file speaks its own lang.
 */
export const languageScript = () => {
  const run = (keys, codes, browser) => {
    let kept = null;
    try {
      kept = keys.map((key) => localStorage.getItem(key)).find((value) => codes.includes(value)) ?? null;
    } catch {}
    document.documentElement.setAttribute("data-ge-language", inUse(kept, browser));
  };
  // KEYS' own, else the old name's (src/shared/renamed-storage.mjs carries it over as the UI's modules load).
  return `document.currentScript.remove(); (() => { const inUse = ${inUse}; (${run})(${JSON.stringify([KEY, OLD_KEYS.language])}, ${JSON.stringify(Object.keys(LANGUAGES))}, navigator.language); })();`;
};

/** Keep `code` as the language (the workbench reloads after, so everything is made in it). */
export function chooseLanguage(code) {
  if (!Object.hasOwn(LANGUAGES, code)) return;
  try {
    globalThis.localStorage?.setItem(KEY, code);
  } catch {}
}

/**
 * `text` (Chinese, as written in the source) in the language in use, its {0}, {1}… filled with
 * `values`. One Chinese word with two meanings in English says which it is after an @ ("标题@caption":
 * 标题 in Chinese, its own entry in English).
 */
export function t(text, ...values) {
  const own = /^([\s\S]*)@[a-z]+$/.exec(text)?.[1] ?? text;
  if (speaking !== "en") return fill(own, values);
  const english = EN[text];
  return typeof english === "function" ? english(...values) : fill(english ?? own, values);
}

// `text`'s {0}, {1}… filled with `values` (t's and said's one rule).
const fill = (text, values) => (values.length === 0 ? text : text.replace(/\{(\d+)\}/g, (whole, index) => (index < values.length ? String(values[index]) : whole)));

/**
 * A message the server sends the UI with parts filled in (a size, a name, an exit code, an Agent's
 * check lines), which no whole string of en.mjs could match: `text` the Chinese as t() takes it, a
 * literal with {0}, {1}… (tests/unit/i18n.mjs holds each one to its entry), `values` its parts, never
 * translated (a part that is itself a UI word is a template of its own: 图片太大 and 文件太大).
 * { message: the Chinese filled in, what the log, the CLI and an older page read, text, values }: an
 * answer spreads it ({ ok: false, reason, ...said(…) }), an error carries it (Object.assign(new
 * Error(), said(…))). Filled here, never through t(): the server speaks Chinese whatever its machine's
 * language.
 */
export function said(text, ...values) {
  return { message: fill(text, values), text, values };
}

/**
 * What a failure's answer carries of `message`: a string as { message }; an error or said()'s object as
 * { message } with its text and values when it has them; nothing for none.
 */
export function saying(message) {
  if (message === undefined || message === null) return {};
  if (typeof message === "string") return { message };
  return { message: message.message, ...(typeof message.text === "string" && Array.isArray(message.values) ? { text: message.text, values: message.values } : {}) };
}

/** An error that says `message` (a string, or said()'s), with `fields` (its reason): saying() carries it into an answer. */
export const refusal = (message, fields = {}) => Object.assign(new Error(typeof message === "string" ? message : message.message), saying(message), fields);

/**
 * What a server's answer (or an error made of one: saying()) says, in the UI's language: t(text,
 * ...values) when it carries said()'s template, else t(message) (a whole message: its entry, else as
 * it is); null when it says nothing. The UI's funnels read a failure through it (post.mjs failure,
 * the workbench's api.ts and transfer.ts).
 */
export function told(answer) {
  if (typeof answer?.text === "string" && Array.isArray(answer.values)) return t(answer.text, ...answer.values);
  return typeof answer?.message === "string" && answer.message ? t(answer.message) : null;
}

/**
 * What `run` returns, its t() said in `code` ("zh" or "en") whatever the language in use: for what
 * the server writes into a page it serves, which is not in the server's language but the page's
 * (src/editor/components/placeholder.mjs: what is empty, in Chinese, said again in English as the
 * page starts when its UI is). Synchronous only.
 */
export function inLanguage(code, run) {
  if (!Object.hasOwn(LANGUAGES, code)) throw new Error(`No UI language "${code}".`);
  const before = speaking;
  speaking = code;
  try {
    return run();
  } finally {
    speaking = before;
  }
}
