import fs from "node:fs/promises";
import path from "node:path";
import { newNames } from "../shared/new-names.mjs";
import { escapeMarkup } from "../shared/escape.mjs";
import { fileLanguage, htmlLang, languageOf } from "../shared/file-language.mjs";
import { sha256 } from "../shared/files.mjs";
import { reportsDirectory, starterDirectory } from "../shared/paths.mjs";
import { listReportSlugs, slugPattern } from "../shared/reports.mjs";
import { documentDirectory, documentFiles, layoutOf, slugTaken } from "../shared/workspace.mjs";

// Documents as the pipeline reads them (doc.html with its doc.json, or report.html with its
// report.json in a document made before Gallery 0.1: shared/workspace.mjs documentFiles; checked;
// fileSha256: the sha256 of the source's bytes as read, which an export says it was made from), and new
// ones made from the starter.

async function loadReport(slug, directoryOfReports) {
  if (!slugPattern.test(slug)) {
    throw new Error(`A document's folder name must be lowercase kebab-case: ${slug}`);
  }

  const directory = documentDirectory(slug, directoryOfReports);
  const { html: htmlPath, json: metadataPath } = documentFiles(directory);
  const [htmlName, jsonName] = [path.basename(htmlPath), path.basename(metadataPath)];
  let bytes;
  let metadataSource;
  try {
    [bytes, metadataSource] = await Promise.all([
      fs.readFile(htmlPath),
      fs.readFile(metadataPath, "utf8"),
    ]);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const exists = await fs.stat(directory).then(() => true, () => false);
    throw new Error(exists ? `${directory} needs both ${htmlName} and ${jsonName}.` : `${directory} does not exist.`);
  }
  let metadata;
  try {
    metadata = JSON.parse(metadataSource);
  } catch (error) {
    throw new Error(`${jsonName} is not valid JSON: ${error.message}`);
  }

  // An untitled document (the workbench's 新建, its title not written yet) has an empty title, its page
  // saying 未命名文档 (docs/editor.md "Title"); the description and the type are never empty.
  if (typeof metadata.title !== "string") throw new Error(`${jsonName} is missing a title.`);
  for (const field of ["description", "type"]) {
    if (typeof metadata[field] !== "string" || metadata[field].trim() === "") {
      throw new Error(`${jsonName} is missing a non-empty ${field}.`);
    }
  }
  // Optional: where the material came from, when the author names it.
  if (metadata.source !== undefined && typeof metadata.source !== "string") throw new Error(`${jsonName} source must be a string when given.`);

  return { slug, directory, htmlPath, metadataPath, html: bytes.toString("utf8"), fileSha256: sha256(bytes), metadata };
}

/**
 * Load the named reports, or every report when no slug is given, from the workspace (or `directory`).
 * Each report loads on its own: a broken report is returned in `failures` (slug -> messages) and never blocks the rest.
 * `prepare`: the text read as each report's `html` instead of its file's (a function of the report:
 * the npm commands' natural HTML made the kit's in memory, src/cli/natural.mjs), the file's then its
 * `written` (what the notes advise is written there: notesOf); the file is not written.
 */
export async function loadReports(slugs = [], { directory = reportsDirectory, prepare = null } = {}) {
  const selected = slugs.length > 0 ? [...new Set(slugs)] : await listReportSlugs(directory);
  if (selected.length === 0) {
    throw new Error(`No documents in ${path.resolve(directory)} yet: gallery new <slug> "<title>" makes one.`);
  }

  const reports = [];
  const failures = new Map();
  for (const slug of selected) {
    try {
      const report = await loadReport(slug, directory);
      if (prepare) [report.written, report.html] = [newNames(report.html), prepare(report)]; // the file's text, its old names new (shared/old-names.mjs)
      reports.push(report);
    } catch (error) {
      failures.set(slug, [error.message]);
    }
  }
  return { reports, failures };
}

// A language tag a page's lang may be set to (en, zh-CN…), as an import's is (src/transfer/import.mjs).
const LANG = /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;

// The words of the starter's section for an Agent to replace, in the language the page is written in
// (shared/file-language.mjs: the system's, else the page's own lang). They are what a reader who opens the
// document before the Agent writes it sees; nothing reads them: the section is found, and the checks fail
// while it remains, by its data-doc-placeholder, in either language.
const STARTER_WORDS = {
  zh: ["文档正文", "用文档内容替换这一节。"], // its heading, its line
  en: ["Document body", "Replace this section with the document's content."],
};

// The section the starter holds for an Agent to replace (data-doc-placeholder, with its comment).
const STARTER_SECTION = /\n[ \t]*<!-- Starter content:[^\n]*-->\n[ \t]*<section\b[^>]*\sdata-doc-placeholder\b[\s\S]*?<\/section>/;

/**
 * A new document from the starter (src/render/starter/) in <workspace>/<slug>/ (`directory`: the
 * workspace), as `gallery new` makes it, its files doc.html and doc.json; with `page`, the 写作偏好
 * page's, in <workspace>/.gallery/pages/<slug>/ (shared/workspace.mjs): the title in the page's
 * <title> and h1, the title, the description and (a document's) `created`, the ISO time it is made, in
 * doc.json, whose `type` is the starter's ("report": free text naming the kind of report, the Agent's to change).
 * With `blank` (the workbench's "new report", written by a person) it starts clean: instead of the
 * starter's section for an Agent to replace, one empty paragraph to write in, straight in the page
 * (a flat report: sections are made when wanted). `lang`: the page's language, when the caller knows it
 * (the workbench's new report made in English is lang="en", so that the kit's own words in a file of its
 * own are English: src/render/kit/words.js); else the file language's (shared/file-language.mjs: the
 * system's, GALLERY_LANGUAGE over it), which also says the words of the starter's section. Throws when the slug is not
 * kebab-case, or (code EEXIST) is taken (a folder at the root, the 写作偏好 page, a custom page, a reserved name).
 */
export async function createReportFromStarter(slug, title, description, { directory = reportsDirectory, blank = false, lang = null, page = false } = {}) {
  if (!slugPattern.test(slug)) throw new Error("Slug must be lowercase kebab-case.");
  if (slugTaken(slug, directory)) throw Object.assign(new Error(`"${slug}" is taken in ${path.resolve(directory)}`), { code: "EEXIST" });
  const parent = page ? layoutOf(directory).preferencesPage : path.resolve(directory);
  const targetDirectory = path.join(parent, slug);
  const { html, metadata: starter } = await starterPage(slug, title, description, { blank, lang });
  // When it was made, which a block reads (workspace.query("document"), src/workbench/index.mjs createdOf).
  const metadata = page ? starter : { ...starter, created: new Date().toISOString() };
  await fs.mkdir(parent, { recursive: true }); // the workspace itself (or .gallery/pages/), when it has none yet
  await fs.mkdir(targetDirectory, { recursive: false }); // fails when the document exists
  const files = documentFiles(targetDirectory); // the new names: the folder is empty
  await Promise.all([
    fs.writeFile(files.html, html),
    fs.writeFile(files.json, `${JSON.stringify(metadata, null, 2)}\n`),
  ]);
  return { slug, directory: targetDirectory, metadata };
}

/**
 * The starter's page and doc.json for document `slug`, as createReportFromStarter writes them, kept
 * in memory: { html, metadata }. With `blank`, one empty paragraph instead of the starter's section
 * (a page filled afterwards: the workbench's new report, an import, the page of the writing
 * preferences made again of their Markdown). With `lang` (a language tag), the page's lang instead
 * of the file language's, and the starter's words in its language (Chinese for zh*, else English).
 */
export async function starterPage(slug, title, description, { blank = false, lang = null } = {}) {
  const escapeHtml = (value) => escapeMarkup(value).replaceAll("'", "&#39;");
  const [htmlTemplate, metadataTemplate] = await Promise.all([
    fs.readFile(path.join(starterDirectory, "doc.html"), "utf8"),
    fs.readFile(path.join(starterDirectory, "doc.json"), "utf8"),
  ]);
  const metadata = { ...JSON.parse(metadataTemplate), title, description };
  const emptied = blank ? htmlTemplate.replace(STARTER_SECTION, "\n    <p></p>") : htmlTemplate;
  if (blank && emptied === htmlTemplate) throw new Error("The starter's placeholder section was not found.");
  const given = typeof lang === "string" && LANG.test(lang) ? lang : null;
  const language = given ? languageOf(given) : fileLanguage();
  const template = emptied.replace(/(<html\b[^>]*\slang=")[^"]*"/, (_, start) => `${start}${given ?? htmlLang(language)}"`);
  // Both in one pass, each written by a function: a replacement string would read "$&", "$$", "$`"
  // and "$'" in a title ("ARPU $$ 与 $& 对比") as patterns, and a later pass would replace a
  // placeholder's name written in an earlier one's value.
  const [heading, note] = STARTER_WORDS[language];
  const values = { SLUG: slug, TITLE: escapeHtml(title), HEADING: heading, NOTE: note };
  const html = template.replace(/__REPORT_(SLUG|TITLE|HEADING|NOTE)__/g, (_, name) => values[name]);
  return { html, metadata };
}
