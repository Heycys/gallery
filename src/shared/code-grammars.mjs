// The grammars the kit's code.js colors code with, and which of them a file carries. code.js is one file:
// a line a grammar (grammarLine, which kit-build.mjs writes before the bundle), then the highlighter that
// reads them (globalThis.DocCodeGrammars). The preview loads it whole: its editor picks any language for
// a block, and colors it at once. An export carries the lines of the grammars its code blocks and diffs
// use (keptGrammars), as it carries d3 or KaTeX only for a document that uses them: the command's and the
// workbench's (render/pipeline.mjs inlineReport: pageGrammars reads the blocks of the page's source) and the
// reader's 导出当前视图副本 (kit/ui.js, which asks code.js of the page's blocks: DocCode.grammarsUsed) alike, by
// the rules here. A language with no grammar here is plain text, in an export as on the page; so is one whose
// grammar a file does not carry. Pure data, as the kit imports it too.
import { guessLanguage, knownLanguage, languageId } from "./code-languages.mjs";
import { attr, elementsOf, hasClass, walk } from "./html-tree.mjs";
import { ZWSP } from "./inline-spacing.mjs";

/**
 * Shiki's grammars the kit carries (shiki/langs/<name>.mjs), each with those it embeds (`embeddedLangs`,
 * which it cannot be loaded without: kit-build.mjs checks the list against shiki's own as it writes the lines).
 */
export const GRAMMARS = {
  javascript: [], typescript: [], tsx: [], jsx: [], python: [], json: [], html: ["javascript", "css"], css: [],
  shellscript: [], sql: [], yaml: [], markdown: [],
};

/** The grammar a language (any of its names) is colored with: its id's, Bash's shellscript; null for one the kit does not color. */
export function grammarOf(language) {
  const id = languageId(language);
  const name = id === "bash" ? "shellscript" : id;
  return Object.hasOwn(GRAMMARS, name) ? name : null;
}

/**
 * The language a code block written without one is colored as (自动识别): its title's file extension,
 * when the kit knows it, else what its code looks like; undefined when neither tells. code.js's rule.
 * `text`: its code, or a function that gives it (asked only when the title does not tell).
 */
export function autoLanguage(title, text) {
  const extension = /\.([\w-]+)$/.exec(String(title ?? "").trim())?.[1];
  if (extension && knownLanguage(extension)) return languageId(extension);
  return guessLanguage(typeof text === "function" ? text() : text) ?? undefined;
}

/** The language of a diff's lines (its options: `language`, else its `path`'s extension). */
export const optionsLanguage = (options) => options?.language ?? (typeof options?.path === "string" ? options.path.split(/[\\/]/).pop()?.split(".").slice(1).pop() : undefined) ?? "text";

/** The grammars `languages` are colored with and those they embed, by name: what a file of them carries. */
export function grammarsFor(languages) {
  const names = new Set();
  const add = (name) => {
    if (!name || names.has(name)) return;
    names.add(name);
    GRAMMARS[name].forEach(add);
  };
  for (const language of languages) add(grammarOf(language));
  return names;
}

/**
 * A page's own code (its scripts, as `text`, an event handler's or a javascript: address's) that may draw
 * code of any language through the kit: one that names DocCode (by its name before 2026-10-26 too), or a code
 * block's or a diff's class (doc-code, doc-diff, their report- names), as a script that puts such a block on
 * the page as it runs (a document's, a custom block's) does, which the kit then draws though no source holds it:
 * a page that runs any carries every grammar. Read broadly, comments and all: a false match only keeps grammars.
 */
export const NAMES_CODE = /\b(?:DocCode|ReportCode)\b|\b(?:doc|report)-(?:code|diff)\b/;

// ---------- the grammars a page's source uses (the command's and the workbench's export) ----------
const textOf = (node) => (node.nodeName === "#text" ? node.value : (node.childNodes ?? []).filter((child) => attr(child, "data-doc-dev") === undefined).map(textOf).join(""));
const childOf = (node, test) => elementsOf(node).find(test);
const firstUnder = (node, test) => {
  let found;
  walk(node, (each) => {
    if (!found && test(each)) found = each;
  }, { inTemplates: false });
  return found;
};

// A code block's language, as code.js's languageOf reads it: its own (data-language, else its code's
// language-<id> class), else what its title or its code says (autoLanguage).
function blockLanguage(block) {
  const pre = childOf(block, (node) => node.tagName === "pre");
  const code = pre && firstUnder(pre, (node) => node.tagName === "code");
  const own = attr(block, "data-language") || /(?:^|\s)language-([\w-]+)/.exec(attr(code ?? {}, "class") ?? "")?.[1];
  if (own) return own;
  const title = childOf(block, (node) => hasClass(node, "doc-code-title"));
  return autoLanguage(title ? textOf(title) : "", () => (pre ? textOf(pre).replaceAll(ZWSP, "").replace(/\n$/, "") : ""));
}

/**
 * The names of the grammars a page (its parse tree: the export's, its component packages' scripts in it) is
 * colored with, those they embed among them; null for all of them, where any script of the page but the kit's own
 * (data-doc-kit, data-doc-vendor; one of JSON is data), an event handler or a javascript: address names DocCode
 * or a code block's class (NAMES_CODE).
 * What code.js's grammarsUsed reads off a page in the browser (the reader's 导出当前视图副本), by the same rules.
 */
export function pageGrammars(tree) {
  const languages = [];
  let all = false;
  walk(tree, (node) => {
    if (all) return;
    for (const { name, value } of node.attrs ?? []) if ((/^on/i.test(name) || /^\s*javascript:/i.test(value)) && NAMES_CODE.test(value)) all = true;
    if (node.tagName === "script" && attr(node, "data-doc-kit") === undefined && attr(node, "data-doc-vendor") === undefined && !/json/i.test(attr(node, "type") ?? "") && NAMES_CODE.test(textOf(node))) all = true;
    if (hasClass(node, "doc-code")) languages.push(blockLanguage(node));
    if (hasClass(node, "doc-diff")) {
      const config = childOf(node, (child) => child.tagName === "script" && attr(child, "type") === "application/json");
      try {
        languages.push(optionsLanguage(JSON.parse(config ? textOf(config) : "null")));
      } catch {}
    }
  });
  return all ? null : grammarsFor(languages);
}

// A grammar's line in code.js: one line, its name in it, so that a file can carry a few of them.
const LINE = /^\(globalThis\.DocCodeGrammars \?\?= \{\}\)\["([a-z0-9-]+)"\] = [^\n]*;\n/gm;

/** A grammar's line in code.js (kit-build.mjs writes them, in GRAMMARS's order, before the highlighter). */
export function grammarLine(name, grammar) {
  const line = `(globalThis.DocCodeGrammars ??= {})[${JSON.stringify(name)}] = ${JSON.stringify(grammar)};\n`;
  if ((line.match(LINE) ?? []).length !== 1) throw new Error(`the grammar ${name} does not make one line`);
  return line;
}

/** code.js's text with the lines of the grammars `names` keeps (a Set; null keeps them all), the others taken out. */
export function keptGrammars(source, names) {
  if (names === null) return source;
  return source.replace(LINE, (line, name) => (names.has(name) ? line : ""));
}

/** The names of the grammars code.js's text carries, in its order. */
export const carriedGrammars = (source) => [...source.matchAll(LINE)].map((match) => match[1]);
