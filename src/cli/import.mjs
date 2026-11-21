import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readOnlyTexts, shownSource } from "../editor/source.mjs";
import { withNeededKitTags } from "../render/assets.mjs";
import { createReportFromStarter } from "../render/reports.mjs";
import { IMPORT_EXT, kindOf } from "../shared/import-types.mjs";
import { reportsDirectory } from "../shared/paths.mjs";
import { kebab } from "../shared/web-links.mjs";
import { documentDirectory, documentFiles, newDocSlug } from "../shared/workspace.mjs";
import { fillReport } from "../transfer/import.mjs";
import { runJob } from "../transfer/jobs.mjs";
import { writeImportedPages } from "../transfer/pages.mjs";
import { createWorkspaceService } from "../workbench/service.mjs";
import { checkSlug, commandArguments, openAsked, UsageError } from "./arguments.mjs";
import { slugRefused } from "./new.mjs";
import { moveInTree } from "./tree.mjs";
import { browserLine, nextLine, previewOfNew, previewSkipped } from "./server-process.mjs";
import { shown, startLines } from "./report-start.mjs";

// gallery import <file> [<slug> ["<title>"]] (./usage.mjs): new documents made of a file, by the code
// the workbench's 导入 makes them with (src/transfer/import.mjs; written by transfer/pages.mjs, as
// the workbench writes them), in this process. Markdown (.md, .markdown, .mdx, .txt, .text) is read
// with the pictures it links to by relative addresses found beside it (importMarkdown: copied into
// <slug>/assets/); every other kind the import takes (.html, .csv, .docx, .pdf, .epub, .zip) as the
// workbench reads an upload (importFiles). The first document's title is the argument's, else the
// file's (a Markdown file's front matter's title:, else its first # heading's; a page's <title>…),
// else the file's name; its slug the argument's, else made of the title's Latin words or the file
// name's (lowercase kebab-case, a number added when it is taken or held for a document, as a slug of
// the workbench's is; doc-<a new page id>, as the workbench names a new document, when neither has a word of
// three letters; a slug given of that shape is refused when another name of the workspace has its id: gallery
// new's slugRefused). A file of several pages (a zip, a Notion export) makes one document a page, nested
// in the sidebar's outline as they were. Then says what it made, what it could not bring as the file
// has it (a picture not found, a formula KaTeX cannot draw…), each by its line in the file, the text
// the preview will leave read-only until it is edited (an HTML block kept as written), the workspace,
// 写作偏好 (as gallery new), the next steps, the first of them to send the user the address, and
// last, as gallery new says it, the server's address to give the user (--no-preview, or
// GALLERY_NO_PREVIEW=1, leaves the server alone; no browser opened unless --open asks). A title that starts with "-" and a letter would be read as an option: put "--"
// before the arguments (gallery import -- notes.md notes "-Q3 回顾").

const TAKEN = Object.values(IMPORT_EXT).flat().join(" ");

const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;

// What a document made of a page holds, counted in the file written (`filled`) and in the page's
// blocks without the HTML written as it was (`blocks`: the flows, the notes' list and the HTML
// blocks kept, counted of their own), its formulas in all.
function madeOf(page, blocks, filled) {
  const count = (pattern, text = blocks) => (text.match(pattern) ?? []).length;
  const flows = count(/<ol class="doc-flow"/g, filled);
  const footnotes = count(/<li id="fn-\d+"/g, filled);
  const made = [
    [count(/<section class="doc-section"/g), "section"],
    [count(/<h[2-4][\s>]/g), "heading"],
    [count(/<p[\s>]/g), "paragraph"],
    [count(/<(?:ul|ol)[\s>]/g), "list"],
    [count(/<table\b/g), "table"],
    [count(/class="doc-math-(?:inline|block)"/g, filled), "formula"],
    [count(/<div class="doc-code"/g), "code block"],
    [count(/<figure class="doc-image"/g), "picture"],
    [flows, "flow"],
    [footnotes, "footnote"],
  ].filter(([number]) => number > 0).map(([number, what]) => plural(number, what));
  const raws = (page.raws?.length ?? 0) - flows - (footnotes ? 1 : 0);
  if (raws > 0) made.push(`${plural(raws, "HTML block")} kept as written`);
  return made;
}

// How one of Gallery's own documents came back (src/transfer/import.mjs): as its author wrote it, its export
// carrying its doc.html; or worked back from the page, the file changed after it was exported or one made
// before exports carried their source (Gallery 0.3.1); and, but for an export this computer made, what would
// run in it taken out (own-report.mjs inertPage).
const asWritten = (page) => [
  page.exact ? "As written: the export carried its doc.html, its files' names and its doc.json, the file unchanged since it was exported"
    : page.carried ? "Worked back from the page: the file was changed after it was exported, so its doc.html is the page as it is now (its files' names and its doc.json as the export carried them)"
      : "Worked back from the page: the file carries no doc.html this Gallery can read (an export made before Gallery 0.3.1, a report.html, or what it carries is damaged or larger than such a file's can be), its files named as uploads are",
  ...(page.trusted ? [] : [page.inert ? `Made inert: not an export this computer made, so what would run in it (scripts, event handlers, javascript: addresses, a frame's own document) was taken out, ${plural(page.inert, "place")}; a chart its own script drew is not drawn` : "Not an export this computer made: nothing in it would run"]),
].join("\n");

export async function run(argv) {
  const { positional, options } = commandArguments({ options: ["--no-preview", "--no-browser", "--open"], argv });
  const [file, given, named] = positional;
  if (positional.length < 1 || positional.length > 3 || !file) throw new UsageError("Name the file; then the slug and the title, if you choose them.");
  const open = openAsked(options);
  const kind = kindOf(file);
  if (!kind) throw new UsageError(`Not a kind of file gallery import takes: ${file} (${TAKEN}).`);
  if (given !== undefined) checkSlug(given);

  const source = path.resolve(file);
  if (!(await fs.stat(source).then((stat) => stat.isFile(), () => false))) {
    console.error(`No such file: ${file}`);
    process.exit(1);
  }
  const refused = given !== undefined ? await slugRefused(given) : null;
  if (refused) {
    console.error(refused);
    process.exit(1);
  }

  const name = path.basename(source);
  const scratch = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-import-"));
  let first; // the first document made: { slug }
  let made;
  let next; // what to do next, said once the server's address is known
  try {
    let pages;
    let skipped = [];
    // Converted in the conversion worker (src/transfer/jobs.mjs), as the workbench converts them: its heap held, so that a
    // file made to fill the memory fails its import and no more.
    if (kind === "markdown") pages = [{ ...(await runJob("markdownFile", { file: source, scratch })), from: name, children: [] }];
    else {
      try {
        ({ pages, skipped } = await runJob("import", { uploads: [{ file: source, name }], scratch }));
      } catch (error) {
        console.error(`${name} could not be read: ${error.message}`);
        process.exit(1);
      }
    }
    if (pages.length === 0) {
      console.error(`Nothing in ${name} could be read as a page${skipped.length ? ` (not taken: ${skipped.join(", ")})` : ""}.`);
      process.exit(1);
    }
    if (named?.trim()) pages[0] = { ...pages[0], title: named.replace(/\s+/g, " ").trim() };

    // Each page a new document (transfer/pages.mjs, as the workbench's 导入 writes them), filled here,
    // the starter it was filled into kept to count what it made; placed in the outline as the workbench places them,
    // through the workspace's running server when there is one (an open workbench shows them nested at once).
    const starters = new Map();
    const workspace = createWorkspaceService({ edits: {}, reports: {}, reportsDirectory });
    const written = await writeImportedPages(pages, {
      create: async (slug, title, description, { lang }) => {
        await import("./hand-in.mjs").then(({ forgetKept }) => forgetKept(slug)); // a new document: none of what was kept under its name before
        const { directory } = await createReportFromStarter(slug, title, description, { blank: true, lang });
        starters.set(slug, await fs.readFile(documentFiles(directory).html, "utf8"));
      },
      slugOf: (page, index) => {
        if (index === 0 && given !== undefined) return given;
        const stem = kebab(page.title) || kebab(page.from?.replace(/\.[^.]+$/, "") ?? "") || kebab(name.replace(/\.[^.]+$/, ""));
        return stem ? workspace.freeSlug(stem) : newDocSlug(reportsDirectory); // no word to make one of: the workbench's name for a new document
      },
      folderOf: (slug) => documentDirectory(slug, reportsDirectory),
      fill: (payload) => fillReport(payload),
      place: (slug, parent) => moveInTree(slug, { parent }), // through the running server, as gallery new places one (./tree.mjs)
    });
    made = written.made;

    // What each document holds, and what it could not bring.
    const flat = [];
    const walk = (page, depth) => {
      flat.push({ page, depth });
      for (const child of page.children ?? []) walk(child, depth + 1);
    };
    for (const page of pages) walk(page, 0);
    const documents = await Promise.all(flat.map(async ({ page, depth }, index) => {
      const slug = made[index];
      const directory = documentDirectory(slug, reportsDirectory);
      const htmlFile = documentFiles(directory).html;
      const filled = await fs.readFile(htmlFile, "utf8");
      const blocks = (await fillReport({ source: starters.get(slug), nodes: page.nodes, icon: page.icon, own: page.own })).replace(/<p>\u{E000}\d+\u{E001}<\/p>/gu, "");
      // The text the preview leaves read-only (an HTML block kept as written that is no block of the kit's), as gallery check says it.
      const readOnly = readOnlyTexts(shownSource(filled, { finish: withNeededKitTags }).text);
      return { slug, depth, page, directory, htmlFile, made: madeOf(page, blocks, filled), readOnly };
    }));
    first = { slug: made[0] };

    if (documents.length === 1) {
      const [{ page, directory, htmlFile, made: what, readOnly }] = documents;
      console.log(`Created ${shown(htmlFile)} and ${path.basename(documentFiles(directory).json)} from ${name}`);
      console.log(`Title: ${page.title}`);
      if (page.own) console.log(asWritten(page));
      else if (page.inert) console.log(`Made inert: the HTML it keeps as written held what would run (scripts, event handlers, javascript: addresses, a frame's own document), taken out, ${plural(page.inert, "place")}`);
      console.log(`Made: ${what.length ? what.join(", ") : "nothing but the title"}${page.files.length ? ` (${plural(page.files.length, "file")} in ${shown(path.join(directory, "assets"))})` : ""}`);
      if (page.notes?.length) {
        console.log(`Not brought as the file has it (${page.notes.length}):`);
        for (const note of page.notes) console.log(`  ${note.line ? `line ${note.line}: ` : ""}${note.text}`);
      }
      if (readOnly.length) {
        console.log(`Text the preview leaves read-only (${readOnly.length}), by doc.html's lines as gallery check gives them:`);
        for (const note of readOnly) console.log(`  ${note}`);
      }
    } else {
      console.log(`Created ${plural(documents.length, "document")} from ${name} (each nested as in the file):`);
      for (const { slug, depth, page, htmlFile, made: what } of documents) {
        console.log(`${"  ".repeat(depth + 1)}${slug}  ${page.title}  ${shown(htmlFile)}`);
        console.log(`${"  ".repeat(depth + 2)}Made: ${what.length ? what.join(", ") : "nothing but the title"}${page.files.length ? ` (${plural(page.files.length, "file")} in its assets/)` : ""}`);
      }
      const notes = documents.flatMap(({ slug, page }) => (page.notes ?? []).map((note) => `  ${slug}: ${note.line ? `line ${note.line}: ` : ""}${note.text}`));
      if (notes.length) console.log(`Not brought as the file has it (${notes.length}):\n${notes.join("\n")}`);
      const readOnly = documents.flatMap(({ slug, readOnly: texts }) => texts.map((note) => `  ${slug}: ${note}`));
      if (readOnly.length) console.log(`Text the preview leaves read-only (${readOnly.length}), by doc.html's lines as gallery check gives them:\n${readOnly.join("\n")}`);
    }
    const inert = documents.filter(({ page }) => (page.own ? !page.trusted : page.inert > 0) && documents.length > 1);
    if (inert.length) console.log(`Made inert (not exports this computer made, or HTML a file keeps as written: their scripts, event handlers and javascript: addresses taken out): ${inert.map(({ slug, page }) => `${slug} ${plural(page.inert ?? 0, "place")}`).join(", ")}`);
    if (skipped.length) console.log(`Not taken from ${name} (${skipped.length}): ${skipped.join(", ")}`);
    for (const line of await startLines()) console.log(line);
    next = `edit ${shown(documents[0].htmlFile)}${documents.length > 1 ? " (and the others)" : ""} into the document as 写作偏好 asks.`;
  } finally {
    await fs.rm(scratch, { recursive: true, force: true });
  }
  // The server's address, found or started, said last, as gallery new says it; the next steps before
  // it, the first of them to send the user that address (server-process.mjs nextLine).
  const preview = await previewOfNew(first.slug, { skipped: previewSkipped(options), command: `gallery import ${name}` });
  console.log(nextLine(preview, next));
  console.log(`提示：when they are written, run gallery qa ${made.join(" ")} (it exports first)`);
  // The browser opened at the first document with --open, as gallery new opens it (browserLine), the address last.
  const browser = open ? await browserLine(preview, options) : null;
  if (browser) console.log(browser);
  for (const line of preview) console.log(line);
}
