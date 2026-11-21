// The language of the words Gallery itself writes into a workspace's files: the default home page's
// title, a new document's starter section and description, a page's lang, the suffix of a copy's title,
// the description of an import. One rule, here: they follow the system's language at the moment they
// are written, Chinese when it is Chinese and English for any other, and GALLERY_LANGUAGE ("zh" or
// "en") says the other (the tests set it, so that nothing depends on the machine; a user may).
//
// It is not the UI's language (src/shared/i18n/), which is the reader's: chosen in the workbench or
// the browser's own, kept in the browser, which the server and the gallery command never see. A file's
// words are written once, by whichever of them does it, for whoever opens the file later, in a
// browser that may say another thing: the only language they can know is the system's. What is written
// stays as written (nothing rewrites a workspace when the system's language changes; a workspace moved
// to another system keeps its words); and where the workbench does know the reader's language it says
// it with the request (the new document's lang, the copy's suffix), which wins over this.
//
// The fixed words the commands print for an Agent (交给用户：, 下一步：, 问题：) are not files' and stay
// Chinese; so does the default 写作偏好, the user's own content.

/** The environment variable that says which language the words written into files are in. */
export const LANGUAGE_VARIABLE = "GALLERY_LANGUAGE";

/** "zh" for a locale or language tag that names Chinese (zh, zh-CN, zh_TW.UTF-8, zh_CN:en), else "en". */
export const languageOf = (tag) => (/^zh(?![a-z])/i.test(String(tag ?? "").trim().split(":")[0]) ? "zh" : "en");

/**
 * The system's language, "zh" or "en": the locale the system gives Node (the same Intl reads for dates),
 * else, when there is none, the first of the usual variables (LC_ALL, LC_MESSAGES, LANGUAGE, LANG) that
 * says one. Intl comes first because the variables lie more often than it does: a Chinese Windows with
 * Git Bash says LANG=en_US.UTF-8, and on a Unix system Node's locale already is what they say.
 */
export function systemLanguage(env = process.env) {
  let locale = "";
  try {
    locale = Intl.DateTimeFormat().resolvedOptions().locale ?? "";
  } catch {}
  if (!locale) locale = [env.LC_ALL, env.LC_MESSAGES, env.LANGUAGE, env.LANG].find((value) => value && !/^(C|POSIX)(\.|$)/i.test(value)) ?? "";
  return languageOf(locale);
}

/** The language the words written into files are in now: GALLERY_LANGUAGE if it says zh or en (anything else is ignored), else the system's. */
export function fileLanguage(env = process.env) {
  const chosen = String(env[LANGUAGE_VARIABLE] ?? "").trim().toLowerCase();
  return chosen === "zh" || chosen === "en" ? chosen : systemLanguage(env);
}

/** The lang attribute a page written in `language` carries: zh-CN or en. */
export const htmlLang = (language) => (language === "zh" ? "zh-CN" : "en");

/** `words` ({ zh, en }) in `language`, the file language now by default. */
export const fileWords = (words, language = fileLanguage()) => words[language === "zh" ? "zh" : "en"];

// The words Gallery writes into files by itself that more than one place writes, each in both languages
// (the home page's title is in shared/pages.mjs, the starter's section in render/reports.mjs). The English
// is the UI's own English for the same Chinese (src/shared/i18n/en.mjs), so that a document made by the
// workbench and one made by a command read alike.
/** A new document's description when none is given (doc.json). */
export const NEW_DESCRIPTION = { zh: "新文档", en: "New document" };
/** What follows the title of a copy of a document (gallery duplicate, when the workbench gave no suffix of the reader's language). */
export const COPY_SUFFIX = { zh: "（副本）", en: " (copy)" };
/** The name a copy of an untitled document takes its title from. */
export const UNTITLED = { zh: "未命名文档", en: "Untitled" };
/** The description of an imported document, the name of the file it came from in {0}. */
export const IMPORTED_FROM = { zh: "导入自 {0}", en: "Imported from {0}" };

/**
 * The lang of a page made for a reader whose UI is in `language` ("zh" or "en": the workbench says it with
 * its request, the one thing it knows that the server does not), else null: the file language decides.
 */
export const pageLangOf = (language) => (language === "zh" || language === "en" ? htmlLang(language) : null);
