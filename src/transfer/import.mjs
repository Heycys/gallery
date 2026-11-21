import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { keptName } from "../editor/media-store.mjs";
import { fetchWeb, readWhole } from "../editor/net-fetch.mjs";
import { addressEdits, referencesWhere, withEdits } from "../render/asset-references.mjs";
import { pageIconValue } from "../render/emoji.mjs";
import { parseReport } from "../render/report-tree.mjs";
import { newNames } from "../shared/new-names.mjs";
import { escapeAttribute, escapeMarkup, escapeText } from "../shared/escape.mjs";
import { iconKind } from "../shared/emoji/icon-value.mjs";
import { LOOK_ATTRIBUTES, lookOf } from "../shared/document-look.mjs";
import { attr, elementsOf, hasClass, walk } from "../shared/html-tree.mjs";
import { extOf, kindOf } from "../shared/import-types.mjs";
import { UPLOAD_LIMITS, assetFile, formatSize, referencedFile } from "../shared/media.mjs";
import { pdfjsDirectory } from "../shared/paths.mjs";
import { DEVICE_NAMES } from "../shared/workspace.mjs";
import { carriedOf } from "./carry.mjs";
import { editorCore, openDocument } from "./dom.mjs";
import { attributeRemoval, croppedPictures, dataBytes, dataFileName, fileKindOf, fileReferences, inertPage, ownReportMain, ownReportTitle, undoExport } from "./own-report.mjs";
import { openZip, readZip } from "./zip.mjs";

// Importing files as pages (导入, the dialog's 基于文件导入), in the worker (worker.mjs): the
// files uploaded (src/transfer/service.mjs keeps them in a folder of its own) made pages, each a
// new report (the service writes them: fillReport, then its files into the report's folder).
//   .md .markdown .mdx .txt .text  Markdown, read as a whole document is (clipboard/import/markdown.mjs
//                                  readMarkdownDocument: the paste's reader, as a Markdown viewer shows a
//                                  file) and organised as a report is (markdownPage, below)
//   .html .htm .xhtml              Notion's export (article.page: its title, icon and .page-body) or any
//                                  page (its <title> or first <h1>); its body as a paste of HTML is
//                                  (clipboard/import/html.mjs, which knows Notion's data-notion-* marks);
//                                  one of this Gallery's reports (main.doc-page: a report.html, an
//                                  export or a view copy of it) as its author wrote it, the whole page,
//                                  what an export made of it undone (ownReportPage, own-report.mjs); an
//                                  export that carries its source and was not changed since, that source
//                                  (carriedPage, carry.mjs)
//   .csv .tsv                      a table, its first row the header
//   .docx                          word/document.xml read: headings, quotes, lists, bold, italic,
//                                  underline, strike-through, links, tables and pictures
//   .pdf                           its text (pdf.js), lines joined into paragraphs, clearly bigger
//                                  lines headings
//   .epub                          its chapters in the order of its spine, one page titled as the book
//   .zip                           each page in it a page (a zip in it opened too, one level): in one
//                                  Notion exported (names ending in a 32-digit id) only those .md /
//                                  .html (and its tables, .csv) are pages, the rest their files
// Where a page's file sits says where it goes: a page in the folder named as another (Notion's
// "Page <id>.md" and "Page/") is that one's subpage, as is one only another links to (a paragraph
// that is a link to it alone, Notion's subpage block, which goes: the sidebar shows subpages), in the
// order the links have them. A link to a picture or a file of the import in a paragraph of its own is
// that picture, or a file block (an embed for a PDF or HTML file), a file of a kind that makes a page
// too when it stands in the assets folder beside a Markdown page, as an export has it; pictures from
// the web are downloaded as the page's own, data: pictures kept. Each page's pictures and files are kept in its
// report's folder as an upload is (media-store.mjs keptName). Parentheses in a Markdown link's
// address are read (Notion's export leaves them unencoded), and files chosen together read as one
// folder, so a Markdown file and its pictures come in together.
// What a page could not bring is noted, with its line in the file where it has one: page.notes
// [{ line, kind, text, name? }] (a picture not found: kind "picture-missing", its address the name;
// the reader's own notes, markdown.mjs). gallery import (src/cli/import.mjs) imports
// one Markdown file of the disk so (importMarkdown), the pictures it links to found beside it.

const TEXT_KINDS = ["markdown", "html", "csv", "docx", "pdf", "epub"];
const NOTION_ID = / [0-9a-f]{32}(_all)?$/i;
const NOTION_PAGE = / [0-9a-f]{32}\.(md|html)$/i;
const NOTION_TABLE = / [0-9a-f]{32}(_all)?\.csv$/i;
const SKIPPED = /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)(\/|$)/;
// Addresses of the import's own while the paste's converters read a page: a file of it (MARK + its
// number among the page's marks) and where an HTML page's relative links resolve (BASE + its folder).
const MARK = "https://asset.invalid/";
const BASE = "https://import.invalid/";
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp", ".ico"]);
const EMBED_EXT = new Set([".pdf", ".html", ".htm"]);
const MAX_TITLE = 300;

const baseName = (name) => name.split("/").pop();
const dirOf = (name) => (name.includes("/") ? name.slice(0, name.lastIndexOf("/")) : "");
const stemOf = (name) => baseName(name).replace(/\.[^.]+$/, "");
const decoded = (text) => {
  try {
    return decodeURIComponent(text);
  } catch {
    return text;
  }
};
/** A file's name as a page's title: its extension and Notion's " <32-digit id>" left off. */
export const titleFromName = (name) => stemOf(name).replace(NOTION_ID, "").trim() || "Untitled";
const cleanTitle = (title) => String(title ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_TITLE);
const plainOf = (title) => (title ?? []).map((part) => part[0]).join("");

/** Text of a file: UTF-8 (a BOM left off), else GBK (a file of Windows in Chinese). */
export function decodeText(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("gbk").decode(bytes);
  }
}

// ---------- files: where each comes from ----------
// A source: { name, size, read() (its bytes), head() (the first 512), file(scratch) (a file on disk
// holding it: its own, or one written into `scratch`) }.

function diskSource(file, name) {
  return {
    name,
    size: fs.statSync(file).size,
    read: () => fs.readFileSync(file),
    head: () => headOf(file),
    file: async () => file,
  };
}
function memorySource(data, name) {
  let written = null;
  return {
    name,
    size: data.length,
    read: () => data,
    head: () => data.subarray(0, 512),
    file(scratch) {
      written ??= (async () => {
        const to = path.join(scratch, `m-${createHash("sha256").update(data).digest("hex").slice(0, 16)}`);
        await fs.promises.writeFile(to, data);
        return to;
      })();
      return written;
    },
  };
}
function zipSource(zip, entry, name) {
  let extracted = null;
  return {
    name,
    size: entry.size,
    read: () => zip.read(entry),
    head: () => (entry.size <= 512 ? zip.read(entry) : null),
    async file(scratch) {
      extracted ??= (async () => {
        const to = path.join(scratch, `z-${createHash("sha256").update(`${scratch}\n${name}`).digest("hex").slice(0, 16)}`);
        await zip.extract(entry, to);
        return to;
      })();
      return extracted;
    },
  };
}
function headOf(file) {
  const fd = fs.openSync(file, "r");
  try {
    const buffer = Buffer.alloc(512);
    return buffer.subarray(0, fs.readSync(fd, buffer, 0, 512, 0));
  } finally {
    fs.closeSync(fd);
  }
}
async function hashOf(file) {
  const hash = createHash("sha256");
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}

// ---------- a set of files: a zip's, or those uploaded together ----------

function context(files /* Map: path -> source */) {
  const notion = [...files.keys()].some((name) => NOTION_PAGE.test(name));
  const loose = [...files.keys()].every((name) => !name.includes("/")); // files chosen together: their names alone
  // The assets folder beside a Markdown page is where an export keeps that page's files: linked alone
  // in a paragraph, a PDF or a table there is that page's file; a Markdown file there is a page still
  // (a page called assets, its subpages), as is any other file no page takes.
  const beside = new Set([...files.keys()].filter((name) => kindOf(name) === "markdown").map(dirOf));
  const pageFile = (name) => kindOf(name) !== "markdown" && baseName(dirOf(name)) === "assets" && beside.has(dirOf(dirOf(name)));
  const isPage = (name) => {
    if (!notion) return TEXT_KINDS.includes(kindOf(name));
    if (NOTION_PAGE.test(name)) return true;
    // A Notion table: "X <id>_all.csv" (all its rows) where there is one, else "X <id>.csv".
    return NOTION_TABLE.test(name) && (name.endsWith("_all.csv") || !files.has(name.replace(/\.csv$/i, "_all.csv")));
  };
  return {
    files,
    isPage,
    pageFile,
    source: (name) => files.get(name),
    /** A link from a page in folder `dir` to a file of the set: its path, or null (another site's, none such).
     * Files chosen together come without their folders: a link into a folder (assets/dot.png) finds one by its name. */
    resolve(dir, href) {
      if (!href) return null;
      let target;
      if (href.startsWith(BASE)) target = decoded(href.slice(BASE.length).split(/[?#]/)[0]);
      else if (/^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) return null;
      else target = [dir, decoded(href.split("#")[0].split("?")[0])].filter(Boolean).join("/");
      const parts = [];
      for (const part of target.replace(/\\/g, "/").split("/")) {
        if (part === "..") parts.pop();
        else if (part && part !== ".") parts.push(part);
      }
      const joined = parts.join("/");
      if (files.has(joined)) return joined;
      return loose && files.has(parts.at(-1)) ? parts.at(-1) : null;
    },
  };
}

// ---------- converters: a file as a page { title, icon, specs, marks } ----------
// marks: the files and web pages the page shows that the paste's converters cannot know, each
// { kind: "image" | "file" | "embed" | "bookmark", source | url | data, name, caption, bookmark },
// shown to them as MARK + its number; fixSpecs makes them, the page's nodes take them (realize).

async function modules() {
  const [markdown, html, math, toBlocks, own, formula, core] = await Promise.all([
    import("../editor/page/clipboard/import/markdown.mjs"),
    import("../editor/page/clipboard/import/html.mjs"),
    import("../editor/page/clipboard/import/math.mjs"),
    import("../editor/page/clipboard/import/to-blocks.mjs"),
    import("../editor/page/clipboard/own/blocks.mjs"),
    import("../editor/page/formula/index.mjs"),
    editorCore(),
  ]);
  const { renderTex } = await import("../editor/page/tex.mjs"); // loaded with the formulas' module
  return { ...markdown, ...html, ...math, ...toBlocks, ...own, ...formula, ...core, renderTex };
}

// Markdown's links and pictures whose address holds parentheses (Notion's export writes "(1)" as it
// is), encoded so the address ends at its own ")"; code left as it is.
function encodeParentheses(text) {
  let fenced = false;
  return text.split("\n").map((line) => {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced || !line.includes("](")) return line;
    return line.replace(/\]\(((?:[^()\s]|\([^()\s]*\))+\([^()\s]*\)(?:[^()\s]|\([^()\s]*\))*)\)/g, (_, address) => `](${address.replace(/\(/g, "%28").replace(/\)/g, "%29")})`);
  }).join("\n");
}

// A Markdown file's YAML front matter (--- at its very top, up to --- or ..., its lines of YAML):
// its title (title: …, quoted or not, or a block of the lines indented under it, title: >- or |),
// the text after it and the number of lines it took.
function frontMatter(text) {
  const found = /^---[ \t]*\r?\n((?:.*\r?\n)*?)(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text);
  if (!found || !/^[\w-]+[ \t]*:/m.test(found[1])) return { title: "", body: text, lines: 0 };
  const field = /^title[ \t]*:[ \t]*(.*?)[ \t]*\r?$((?:\r?\n[ \t]+.*)*)/m.exec(found[1]);
  const value = field?.[1] ?? "";
  const title = /^[>|][+-]?\d*$/.test(value) ? field[2].replace(/\s+/g, " ").trim()
    : /^".*"$/.test(value) ? value.slice(1, -1).replace(/\\(.)/g, "$1") : /^'.*'$/.test(value) ? value.slice(1, -1).replace(/''/g, "'")
      : `${value}${field?.[2] ?? ""}`.replace(/\s+/g, " ").trim(); // a plain one goes on on the lines indented under it
  return { title, body: text.slice(found[0].length), lines: found[0].split("\n").length - 1 };
}

const HEADING_SPECS = ["header", "sub_header", "sub_sub_header", "header_4"];
const isHeading = (s) => HEADING_SPECS.includes(s.type);
// A heading's words as a title is plain text: a formula its TeX, a picture its alt text.
const plainTitle = (title) => (title ?? []).map(([text, annotations = []]) => {
  const formula = annotations.find((annotation) => annotation[0] === "e");
  const picture = annotations.find((annotation) => annotation[0] === "img");
  return formula ? formula[1] : picture ? picture[2] : text;
}).join("");

/**
 * A document's headings as the report's (the skill writes a report so: SKILL.md, writing-html.md):
 * its ## headings are its sections' level when it has any (its title's # gone), else the shallowest
 * of its headings in the page, wherever the first of them stands; each heading of that level or
 * above (a later # heading: two documents in one) starts a section (section.doc-section, the
 * heading its h2) holding what follows it up to the next, and a divider right before it at its top;
 * a heading one level deeper is an h3, deeper still an h4. What comes before the first stands in
 * the page itself. A heading in a box (a quote, an item), or one a quote kept out of it
 * (props.boxed), takes its level so too, and starts no section. Returns the page's specs (its
 * headings changed in place).
 */
function sectioned(specs) {
  const starts = (s) => isHeading(s) && !s.props?.boxed;
  const levels = specs.filter(starts).map((s) => s.props?.level ?? 2);
  const top = levels.includes(2) || !levels.length ? 2 : Math.min(...levels);
  const levelOf = (s) => s.props?.level ?? top;
  const relevel = (list) => {
    for (const s of list) {
      if (isHeading(s)) s.type = HEADING_SPECS[1 + Math.min(2, Math.max(0, levelOf(s) - top))];
      if (s.children?.length) relevel(s.children);
    }
  };
  relevel(specs);
  const out = [];
  let section = null;
  for (const s of specs) {
    if (starts(s) && levelOf(s) <= top) {
      // A divider right before the heading (--- between chapters) goes with it, at the section's top:
      // a line above it, as a section draws one.
      const before = section?.children ?? out;
      const lead = before.at(-1)?.type === "divider" ? [before.pop()] : [];
      out.push(section = { type: "section", title: [], props: {}, children: lead });
    }
    (section?.children ?? out).push(s);
  }
  return out;
}

// The document's footnotes, as a section of their own at the end: a heading (注释, Notes in a
// document with no Chinese) and a numbered list, each note an item whose id the references link to
// (#fn-<number>), written as HTML (the commit writes no item's id).
function notesSection(footnotes, chinese, M) {
  const items = footnotes.map(({ number, title }) => `  <li id="fn-${number}">${M.richHtml(title)}</li>`);
  return {
    type: "section", title: [], props: {}, children: [
      { type: "sub_header", title: [[chinese ? "注释" : "Notes"]], props: { level: 2 }, children: [] },
      { type: "html", title: [], props: { html: `<ol>\n${items.join("\n")}\n</ol>` }, children: [] },
    ],
  };
}

/** The text of the paragraph that stands for an HTML block kept as written, until fillReport writes the block in its place. */
const RAW = (index) => `\u{E000}${index}\u{E001}`;

// A flow of steps (a mermaid chain of steps, markdown.mjs) as the flow component's natural HTML.
const flowHtml = (steps) => `<ol class="doc-flow">\n${steps.map((step) => `  <li>${escapeText(step)}</li>`).join("\n")}\n</ol>`;

// Each HTML block of `specs` (in boxes too; a flow one of the flow's HTML) given its marker, the
// block kept in `raws` at its number: { html, line, pictures (those of the set it shows: rawPictures) }.
function markRaws(specs, raws) {
  for (const s of specs) {
    if (s.type === "flow") Object.assign(s, { type: "html", props: { html: flowHtml(s.props.steps), line: s.props.line } });
    if (s.type === "html") s.props.marker = RAW(raws.push({ html: s.props.html, line: s.props.line ?? null, pictures: [] }) - 1);
    if (s.children?.length) markRaws(s.children, raws);
  }
}

/**
 * Markdown as a page (src/editor/page/clipboard/import/markdown.mjs readMarkdownDocument, the
 * paste's reader as a Markdown viewer shows a whole file): its title the front matter's (title:),
 * else its first # heading's wherever it stands (which then leaves the body), else the file's name;
 * a # heading the front matter's title repeats leaves the body too, and so does the body's only #
 * heading when it is its first heading (a docs site's page: its words noted), so that its ##
 * headings are the sections; its headings the report's sections (sectioned); its footnotes a
 * section at its end (notesSection); its HTML blocks kept as written (raws, which fillReport writes
 * in); its list items holding their blocks (held: to-blocks.mjs); its language English (lang) when
 * it has no Chinese; what the reader noted its notes, by the file's lines, and the formulas KaTeX
 * cannot draw (as the page draws them: the kit's macros and mhchem) noted too. Its links to
 * addresses that are no web ones (links) and those of them brought as files or subpages (brought,
 * fixSpecs) are noted after (linkNotes).
 */
function markdownPage(text, name, M) {
  const front = frontMatter(text);
  const { specs, footnotes, notes, formulas, links } = M.readMarkdownDocument(encodeParentheses(front.body), { firstLine: front.lines + 1 });
  let title = cleanTitle(front.title);
  const headings = specs.filter((s) => isHeading(s) && !s.props?.boxed);
  const ones = headings.filter((s) => s.props?.level === 1);
  if (ones.length) {
    const heading = cleanTitle(plainTitle(ones[0].title));
    const leaves = !title || heading === title || (ones.length === 1 && headings[0] === ones[0]);
    if (title && heading !== title && leaves) notes.push({ line: ones[0].props.line ?? null, kind: "title", text: `the # heading "${heading}" is left out: the front matter's title, "${title}", is the document's` });
    if (leaves) {
      title ||= heading;
      specs.splice(specs.indexOf(ones[0]), 1);
    }
  }
  for (const { tex, line, display } of formulas) {
    const { error } = M.renderTex(tex, display);
    if (error) notes.push({ line, kind: "math", text: `KaTeX cannot draw the formula ${tex.length > 60 ? `${tex.slice(0, 57)}…` : tex}: ${error.replace(/ at position \d+[\s\S]*$/, "")}` });
  }
  const chinese = /[\u3400-\u9fff]/.test(front.body);
  const body = sectioned(specs);
  if (footnotes.length) body.push(notesSection(footnotes, chinese, M));
  const raws = [];
  markRaws(body, raws);
  return { title: title || titleFromName(name), specs: body, marks: [], notes: notes.sort((a, b) => a.line - b.line), links, brought: new Set(), raws, held: true, ...(chinese ? {} : { lang: "en" }) };
}

// A Markdown page's links to addresses that are no web ones, which a report does not follow: each
// not brought as a file or a subpage (fixSpecs: its annotation in `brought`) noted at its line, its
// words kept; those to places in the document (#…: a viewer's heading anchors, which a report's
// headings have none of) one note, at the first.
function linkNotes(page) {
  const places = page.links.filter(({ href }) => href.startsWith("#"));
  for (const { href, line, entry } of page.links) {
    if (!href.startsWith("#") && !page.brought.has(entry)) page.notes.push({ line, kind: "link", name: href, text: `the link to ${href} is kept as its words: a document links to web addresses` });
  }
  if (places.length) {
    const named = [...new Set(places.map(({ href }) => href))];
    page.notes.push({ line: places[0].line, kind: "link", text: `${places.length === 1 ? "a link" : `${places.length} links`} to places in the document (${named.slice(0, 3).join(", ")}${named.length > 3 ? ", …" : ""}) lead${places.length === 1 ? "s" : ""} nowhere: a document's headings have no anchors` });
  }
}

// The address of each <img> in HTML, given to `change` (its src, as written) and replaced by what
// it returns (the same: left as it is).
function withPictureAddresses(html, change) {
  return html.replace(/(<img\b[^>]*?\ssrc\s*=\s*)(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/gi, (all, before, double, single, bare) => {
    const value = double ?? single ?? bare;
    const next = change(value);
    return next === value ? all : `${before}"${escapeMarkup(next)}"`;
  });
}

// The pictures of the set the HTML blocks a page keeps as written show (<img src>): each kept as
// the page's own when its nodes are made (pageNodes), one the set does not have noted. `use(name)`
// hears of each.
function rawPictures(page, name, ctx, use) {
  const dir = dirOf(name);
  for (const raw of page.raws) {
    withPictureAddresses(raw.html, (src) => {
      if (/^(data:|https?:)/i.test(src) || raw.pictures.some((picture) => picture.src === src)) return src;
      const target = ctx?.resolve(dir, src);
      if (target) {
        raw.pictures.push({ src, source: ctx.source(target), name: baseName(target) });
        use(ctx.source(target).name);
      } else page.notes.push({ line: raw.line, kind: "picture-missing", name: src, text: `the picture ${src} was not found: kept as written` });
      return src;
    });
  }
}

// A page's structure the paste (whose rules are for a part of a page) does not read as a page's,
// made what it reads, before it does:
//   main, aside, header, footer, nav (a page's landmarks: blocks, not text; else a page wrapped in
//   <main> came in as one paragraph of lines) and dl → div; dt → a paragraph of bold text, dd → a
//   paragraph
//   figure holding one picture (Notion's figure.image, the picture in a link to itself, and any
//   page's): the picture alone, its caption data-caption (else the caption came in twice)
//   mark → a yellow highlight, as the kit's
function pageStructure(dom, M) {
  const retag = (element, tag) => {
    const made = dom.createElement(tag);
    while (element.firstChild) made.append(element.firstChild);
    element.replaceWith(made);
    return made;
  };
  for (const element of [...dom.body.querySelectorAll("main, aside, header, footer, nav, dl")]) retag(element, "div");
  for (const term of [...dom.body.querySelectorAll("dt")]) {
    const strong = dom.createElement("strong");
    while (term.firstChild) strong.append(term.firstChild);
    retag(term, "p").append(strong);
  }
  for (const description of [...dom.body.querySelectorAll("dd")]) retag(description, "p");
  for (const figure of [...dom.body.querySelectorAll("figure")]) {
    const pictures = figure.querySelectorAll("img");
    if (pictures.length !== 1 || figure.querySelector("p, ul, ol, table, pre, blockquote, details, h1, h2, h3, h4, h5, h6, video, iframe")) continue;
    const caption = figure.querySelector("figcaption")?.textContent?.replace(/\s+/g, " ").trim();
    if (caption && !pictures[0].hasAttribute("data-caption")) pictures[0].setAttribute("data-caption", caption);
    figure.replaceWith(pictures[0]);
  }
  for (const mark of [...dom.body.querySelectorAll("mark")]) retag(mark, "span").setAttribute(M.ATTR.backgroundHighlight, "yellow_background");
}

// One of this Gallery's own reports (its report.html, an export or a view copy of it: main.doc-page,
// own-report.mjs). Its blocks are the kit's already, so it comes in as it is, not through the paste's
// rules (which know no kit block), and as written: the whole page, its text with what an export made
// of it undone (undoExport), never the DOM's serialization of it. Its title is its header's (else its
// <title>'s); its pictures and files (ownReportFiles) are those an export embedded (data: addresses)
// and those of the set beside it (assets/<file>).
function ownReportPage(html, tree, name) {
  return { title: ownReportTitle(tree) || titleFromName(name), text: undoExport(html, tree) };
}

// A data: address's bytes, as a file of its own named as it came (dataFileName: its extension its media type's).
function dataSource(url) {
  const bytes = dataBytes(url);
  if (!bytes) throw new Error("not a data: URL");
  return memorySource(bytes, dataFileName(url));
}

/**
 * An own report's pictures and files kept as the new report's (assets/<name>, as an import keeps
 * them: keptName, a link's download name giving a file its extension; one that is not what its place
 * says, a "picture" that is none, kept as a file), their addresses changed to them where they stand
 * (addressEdits), the others (the web's, one the set lacks) left as they are. A file a link saves
 * that is also a picture or a frame of the report (the same bytes) is that one file, under its name,
 * unless the set names it as an upload is named. A cropped picture's original (data-original) is a
 * file of the set beside it, kept so too, or none: then data-original and data-crop go (an export
 * does not carry it). Returns { icon (its header's icon's value, or null), text (the page with the
 * new addresses), files: [{ name, from }], used (the files of the set it took) }. `names`: the names an export says
 * its files had, by the sha256 of their bytes (carry.mjs, of an export changed since it was made): a file of
 * those bytes comes back under its name, unless a file of other bytes took it.
 */
async function ownReportFiles(page, name, ctx, scratch, names = new Map()) {
  const dir = dirOf(name);
  const { text } = page;
  const tree = parseReport(text);
  const original = (node) => ({ node, how: "original", value: attr(node, "data-original"), key: "data-original", place: node.sourceCodeLocation.attrs["data-original"] });
  const cropped = croppedPictures(tree).map(original).filter(({ value }) => !/^\s*data:/i.test(value));
  const edits = [];
  // Each file found: its reference, where it is on disk, its bytes' hash, its kind and the name it came with.
  const found = [];
  for (const reference of [...fileReferences(text, tree), ...cropped]) {
    const { value } = reference;
    const download = attr(reference.node, "download");
    const named = download && extOf(download) ? download : null; // the name a link saves its file as, for its extension
    const fragment = /#.*$/.exec(value)?.[0] ?? ""; // an SVG's view (#…) kept, as an export keeps it
    try {
      let source;
      let target = null;
      if (/^data:/i.test(value)) source = dataSource(value.slice(0, value.length - fragment.length));
      else {
        target = ctx?.resolve(dir, value);
        if (!target) {
          if (reference.how === "original") edits.push(attributeRemoval(text, reference.node, "data-original"), attributeRemoval(text, reference.node, "data-crop"));
          continue;
        }
        source = ctx.source(target);
      }
      const from = await source.file(scratch);
      found.push({ reference, target, from, fragment, head: source.head() ?? headOf(from), hash: await hashOf(from), kind: fileKindOf(reference), given: named ?? (target ? baseName(target) : source.name) });
    } catch {} // not what it says it is: left as it was
  }
  // Each one's name, as an upload is named; a link's file of the same bytes as a picture or a frame of the report, that one's.
  const shown = new Map(); // a hash -> the name of a picture or a frame of those bytes
  const given = new Map(); // a name the export carried -> the hash of the bytes it went to
  for (const item of found) {
    const own = names.get(item.hash);
    if (own && (given.get(own) ?? item.hash) === item.hash) {
      item.name = own;
      given.set(own, item.hash);
    } else item.name = uploadNamed(item.kind, item);
    if (item.name && item.kind !== "file" && !shown.has(item.hash)) shown.set(item.hash, item.name);
  }
  const files = new Map();
  const used = [];
  const addresses = new Map();
  for (const item of found) {
    if (!item.name) continue;
    if (item.kind === "file" && shown.has(item.hash) && !(item.target && baseName(item.target) === item.name)) item.name = shown.get(item.hash);
    files.set(item.name, item.from);
    addresses.set(item.reference, `assets/${item.name}${item.fragment}`);
    if (item.target) used.push(item.target);
  }
  edits.push(...addressEdits(found.map((item) => item.reference), (reference) => addresses.get(reference) ?? null));
  const addressed = withEdits(text, edits.filter(Boolean));
  const icon = pageIconValue(addressed);
  return { icon: iconKind(icon) ? icon : null, text: addressed, files: [...files].map(([kept, from]) => ({ name: kept, from })), used };
}

// The data: URLs of an export's text whose bytes' sha256 is `wanted`'s, by it: { bytes, type } each (base64 alone, as an export writes them).
const DATA_URLS = /data:([\w.+-]+\/[\w.+-]+)(?:;[\w.+=-]+)*;base64,([A-Za-z0-9+/]*={0,2})/g;
function dataByHash(html, wanted) {
  const found = new Map();
  for (const match of html.matchAll(DATA_URLS)) {
    if (found.size === wanted.size) break;
    const bytes = Buffer.from(match[2], "base64");
    const hash = createHash("sha256").update(bytes).digest("hex");
    if (wanted.has(hash) && !found.has(hash)) found.set(hash, { bytes, type: match[1] });
  }
  return found;
}
const COPY_EXTENSION = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };
// Whether a name an export carried may be a file's of the new document's assets/ as it is: the rule of a page's
// address of one (media.mjs assetFile: no folder, letters, digits, dots, dashes and underscores), and none that
// Windows keeps for a device or that ends in a dot (con.png, x.png.); another is named as an upload is.
const keptAssetName = (name) => typeof name === "string" && assetFile(`assets/${name}`) && !DEVICE_NAMES.has(name.split(".")[0].toLowerCase()) && !/[. ]$/.test(name);
// A kind of keptName's for each of fileKindOf's: a bookmark's icon and cover are pictures, kept under their own stems.
const KEPT_KIND = { "bookmark-icon": "image", "bookmark-cover": "image" };
const FILE_KIND = "file";
// The name an upload of a file of `kind` (fileKindOf's) is given (media-store.mjs keptName: <kind>-<hash>.<extension>,
// `given` the name its extension may come from; a bookmark's pictures under their own stems); one that is not what its
// kind says (a "picture" that is none) a file's; null where neither takes it.
function uploadNamed(kind, { hash, head, given }) {
  const named = (as) => {
    const kept = KEPT_KIND[as] ?? as;
    return keptName(kept, hash, head, given).replace(kept, as);
  };
  try {
    return named(kind);
  } catch {}
  try {
    return kind === FILE_KIND ? null : named(FILE_KIND);
  } catch {
    return null;
  }
}
// An address of the folder's file with its file's name `now` (its ./, query and fragment kept).
const renamed = (value, now) => value.replace(/^(\s*(?:\.\/)?assets\/)[^?#]*/, (_, start) => `${start}${now}`);

/**
 * One of this Gallery's own documents of an export that carries its source and was not changed since
 * (carry.mjs carriedOf: `carried`; `html` the export's text): the document as its author wrote it, its doc.html's
 * text as the export read it and its files under their own names, each of the bytes the export holds (its
 * data: URLs, found by the sha256 it says), else of the set chosen with it (assets/<file>: a folder, a zip). A
 * picture the export made lighter is its copy, a WebP under the same stem (another name where that is taken),
 * its addresses changed to it. A file neither holds is none: a srcset's candidate of it goes (the attribute with
 * its last), a cropped picture's original goes (data-original and data-crop), any other address stays as
 * written, a picture's said (`notes`, picture-missing). Returns ownReportFiles' { icon (the doc.json's, else the
 * page's), text, files, used } and `notes`.
 */
async function carriedPage(carried, html, name, ctx, scratch) {
  const dir = dirOf(name);
  const entries = (Array.isArray(carried.files) ? carried.files : []).filter((entry) => typeof entry?.name === "string" && typeof entry.sha256 === "string");
  const wanted = new Set(entries.flatMap((entry) => [entry.sha256, ...(typeof entry.copy?.sha256 === "string" ? [entry.copy.sha256] : [])]));
  const held = dataByHash(html, wanted);
  const taken = new Set(entries.map((entry) => entry.name.toLowerCase()));
  const state = new Map(); // a file's name -> its name now, or null where there is none
  const files = [];
  const used = [];
  const text = carried.source;
  const tree = parseReport(text);
  // The file of the folder's assets/ an address names, by its name there.
  const nameOf = (value) => referencedFile(value ?? "")?.replace(/^assets\//, "") ?? null;
  const references = referencesWhere(text, (value) => referencedFile(value) !== null, tree);
  const kinds = new Map(); // a name -> the kind of file its first place is (fileKindOf's)
  for (const reference of references) {
    const named = nameOf(reference.value);
    if (named !== null && !kinds.has(named)) kinds.set(named, fileKindOf(reference));
  }
  // A name no file of a document may have, as an upload of the kind of its place is named (none: no place names it).
  const uploadOf = (entry, bytes, given = baseName(entry.name).replace(/[. ]+$/, "")) => {
    const kind = kinds.get(entry.name);
    return kind ? uploadNamed(kind, { hash: createHash("sha256").update(bytes).digest("hex"), head: bytes.subarray(0, 512), given }) : null;
  };
  for (const entry of entries) {
    let source = null;
    let as = entry.name;
    const own = held.get(entry.sha256) ?? (typeof entry.data === "string" ? { bytes: Buffer.from(entry.data, "base64") } : null);
    const copy = !own && entry.copy && held.get(entry.copy.sha256);
    const fit = keptAssetName(entry.name);
    if (!fit) {
      as = own ? uploadOf(entry, own.bytes) : copy ? uploadOf(entry, copy.bytes, "copy.webp") : null;
      if (!as) {
        state.set(entry.name, null);
        continue;
      }
      if (own) taken.add(as.toLowerCase());
    }
    if (own) source = memorySource(own.bytes, as);
    else if (copy) {
      const stem = as.replace(/\.[^./]+$/, "");
      const extension = COPY_EXTENSION[copy.type] ?? "webp";
      as = `${stem}.${extension}`;
      for (let n = 1; taken.has(as.toLowerCase()); n++) as = `${stem}-${n}.${extension}`;
      taken.add(as.toLowerCase());
      source = memorySource(copy.bytes, as);
    } else if (fit) {
      const target = ctx?.resolve(dir, `assets/${entry.name}`);
      if (target) {
        source = ctx.source(target);
        used.push(target);
      }
    }
    state.set(entry.name, source ? as : null);
    if (source) files.push({ name: as, from: await source.file(scratch) });
  }
  const notes = [];
  const fileOf = (value) => {
    const file = nameOf(value);
    if (file === null) return undefined;
    return state.has(file) ? state.get(file) : state.has(decoded(file)) ? state.get(decoded(file)) : undefined;
  };
  const edits = addressEdits(references.filter((reference) => reference.how !== "srcset"), (reference) => {
    const now = fileOf(reference.value);
    if (now === null && reference.how === "src" && IMAGE_EXT.has(extOf(nameOf(reference.value) ?? ""))) notes.push({ line: reference.line, kind: "picture-missing", text: reference.value, name: reference.value });
    return typeof now === "string" && now !== nameOf(reference.value) ? renamed(reference.value, now) : null;
  });
  const srcsets = new Map(); // a srcset's place -> its node, key and candidates
  for (const reference of references) if (reference.how === "srcset") srcsets.set(reference.place, reference);
  for (const [place, { node, key, candidates }] of srcsets) {
    const kept = candidates.flatMap((candidate) => {
      const now = fileOf(candidate.url);
      if (now === null) return [];
      return [[typeof now === "string" && now !== nameOf(candidate.url) ? renamed(candidate.url, now) : candidate.url, candidate.descriptor].filter(Boolean).join(" ")];
    });
    if (kept.length === candidates.length && kept.every((written, index) => written === [candidates[index].url, candidates[index].descriptor].filter(Boolean).join(" "))) continue;
    edits.push(kept.length ? { start: place.startOffset, end: place.endOffset, text: `${key}="${escapeAttribute(kept.join(", "))}"` } : attributeRemoval(text, node, key));
  }
  for (const node of croppedPictures(tree)) {
    if (fileOf(attr(node, "data-original")) !== null) continue;
    edits.push(attributeRemoval(text, node, "data-original"), attributeRemoval(text, node, "data-crop"));
  }
  const written = withEdits(text, edits.filter(Boolean));
  const said = carried.doc && typeof carried.doc === "object" ? carried.doc.icon : null;
  const shown = pageIconValue(written);
  const icon = typeof said === "string" && iconKind(said) ? said : iconKind(shown) ? shown : null;
  return { icon, text: written, files, used, notes };
}

// What an own report's doc.json takes of its export besides its title and icon: the description and type
// the export carries (carry.mjs `doc`), and the look it shows (the carried one, else what the export wrote on
// its <html>: render/report-html.mjs withLook), { description?, type?, look }.
function docFields(carried, tree) {
  const fields = {};
  for (const key of ["description", "type"]) if (typeof carried?.[key] === "string" && carried[key].trim()) fields[key] = carried[key];
  if (carried?.look && typeof carried.look === "object") fields.look = lookOf(carried.look);
  else {
    let root = null;
    walk(tree, (node) => (root ??= node.tagName === "html" && node.sourceCodeLocation?.startTag ? node : null), { inTemplates: false });
    fields.look = root ? lookOf(Object.fromEntries(Object.entries(LOOK_ATTRIBUTES).map(([key, attribute]) => [key, attr(root, attribute)]))) : {};
  }
  return fields;
}

async function htmlPage(html, name, ctx, M, { chapter = false } = {}) {
  const dom = new DOMParser().parseFromString(html, "text/html");
  pageStructure(dom, M);
  const article = dom.querySelector("article.page");
  let title;
  let icon;
  let body;
  if (article) {
    title = article.querySelector(".page-title")?.textContent;
    const header = article.querySelector(".page-header-icon");
    const picture = header?.querySelector("img")?.getAttribute("src");
    icon = header?.querySelector(".icon")?.textContent?.trim() || article.getAttribute("data-notion-page-icon") || undefined;
    if (picture) icon = { picture };
    body = article.querySelector(".page-body") ?? article;
    // KaTeX's drawing goes where the TeX is in a data-notion-* mark around it (html.mjs reads the mark); Notion's own export has no such mark and keeps its TeX in the drawing (math.mjs reads it there).
    for (const drawn of body.querySelectorAll(`[${M.ATTR.equation}] .equation-container, [${M.ATTR.inlineEquation}] > *`)) drawn.remove();
  } else {
    title = dom.title;
    const first = dom.body.querySelector("h1");
    if (!title?.trim() && first && !chapter) {
      title = first.textContent;
      if (dom.body.firstElementChild === first) first.remove(); // the title, not the page's first heading too
    }
    body = dom.body;
  }
  // What the paste does not read of Notion's export: a paragraph
  // holding one link with a mark in its stead, made blocks again by fixSpecs.
  //   figure.link-to-page → a subpage; a.bookmark (a bookmark card) → a bookmark; figure > div.source > a
  //   (no data-notion-file) → an embed (or a file)
  const extra = { bookmarks: [], embeds: [] };
  const placeholder = (figure, href, text) => {
    const paragraph = dom.createElement("p");
    const link = dom.createElement("a");
    link.setAttribute("href", href);
    link.textContent = text?.trim() || " ";
    paragraph.append(link);
    figure.replaceWith(paragraph);
  };
  for (const figure of body.querySelectorAll("figure.link-to-page")) {
    const link = figure.querySelector("a");
    if (link) placeholder(figure, link.getAttribute("href") ?? "", link.textContent);
  }
  for (const card of body.querySelectorAll("figure a.bookmark")) {
    const part = (name) => card.querySelector(`.bookmark-${name}`)?.textContent ?? "";
    extra.bookmarks.push({ href: card.getAttribute("href") ?? "", title: part("title"), description: part("description") });
    placeholder(card.closest("figure"), `#import-bookmark=${extra.bookmarks.length - 1}`, part("title"));
  }
  for (const link of body.querySelectorAll("figure > div.source > a:not([data-notion-file])")) {
    extra.embeds.push(link.getAttribute("href") ?? "");
    placeholder(link.closest("figure"), `#import-embed=${extra.embeds.length - 1}`, link.textContent);
  }
  // Pictures and files of the set: their marks (links resolve against BASE, fixSpecs reads them).
  const dir = dirOf(name);
  const marks = [];
  for (const element of body.querySelectorAll("img[src], [data-notion-image], [data-notion-file], video source[src], audio source[src]")) {
    for (const attribute of ["src", "data-notion-image", "data-notion-file"]) {
      const value = element.getAttribute(attribute);
      const target = value && ctx?.resolve(dir, value);
      if (!target) continue;
      const kind = attribute === "data-notion-file" || element.localName === "source" ? "file" : "image";
      element.setAttribute(attribute, MARK + (marks.push({ kind, source: ctx.source(target), name: baseName(target) }) - 1));
    }
  }
  const specs = M.mathifySpecs(M.htmlToBlocks(M.parseClipboardHTML(body.innerHTML, { base: BASE + (dir ? `${encodeURI(dir)}/` : "") })));
  if (icon?.picture) {
    const target = ctx?.resolve(dir, icon.picture);
    icon = target ? { source: ctx.source(target), name: baseName(target) } : undefined;
  }
  return { title: title || titleFromName(name), icon, specs, marks, extra };
}

/** CSV (RFC 4180: quoted cells may hold commas and line breaks, "" is a quote) as rows of cells. */
export function parseCSV(text, delimiter = ",") {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"' && cell === "") quoted = true;
    else if (c === delimiter) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((each) => each.some((value) => value !== ""));
}

function csvPage(text, name, M) {
  const rows = parseCSV(text, extOf(name) === ".tsv" ? "\t" : ",");
  return { title: titleFromName(name), specs: rows.length ? [M.tableSpec(rows.map((row) => row.map((value) => (value ? [[value]] : []))), true)] : [], marks: [] };
}

// ---------- Word (.docx) as HTML ----------

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

async function docxPage(bytes, name, M) {
  const entries = readZip(bytes);
  const entry = (file) => entries.find((each) => each.name === file);
  const xml = (file) => (entry(file) ? new DOMParser().parseFromString(decodeText(entry(file).data), "application/xml") : null);
  const document = xml("word/document.xml");
  if (!document) throw new Error("不是 Word 文档");
  const relations = new Map([...(xml("word/_rels/document.xml.rels")?.getElementsByTagName("Relationship") ?? [])].map((each) => [each.getAttribute("Id"), each.getAttribute("Target")]));
  const styleNames = new Map([...(xml("word/styles.xml")?.getElementsByTagNameNS(W, "style") ?? [])].map((style) => [style.getAttributeNS(W, "styleId"), (style.getElementsByTagNameNS(W, "name")[0]?.getAttributeNS(W, "val") ?? "").toLowerCase()]));
  // Lists: each numId's levels, whether each is numbered.
  const numbering = xml("word/numbering.xml");
  const abstract = new Map();
  const lists = new Map();
  for (const each of numbering?.getElementsByTagNameNS(W, "abstractNum") ?? []) {
    abstract.set(each.getAttributeNS(W, "abstractNumId"), [...each.getElementsByTagNameNS(W, "lvl")].map((level) => level.getElementsByTagNameNS(W, "numFmt")[0]?.getAttributeNS(W, "val") ?? "bullet"));
  }
  for (const each of numbering?.getElementsByTagNameNS(W, "num") ?? []) lists.set(each.getAttributeNS(W, "numId"), abstract.get(each.getElementsByTagNameNS(W, "abstractNumId")[0]?.getAttributeNS(W, "val")) ?? []);
  const marks = [];
  const pictures = new Map();
  const pictureOf = (id) => {
    const target = relations.get(id);
    if (!target) return null;
    const file = `word/${target.replace(/^\.?\//, "").replace(/^word\//, "")}`;
    if (!pictures.has(file)) pictures.set(file, entry(file) ? MARK + (marks.push({ kind: "image", source: memorySource(entry(file).data, baseName(file)), name: baseName(file) }) - 1) : null);
    return pictures.get(file);
  };
  const child = (element, tag) => [...element.childNodes].find((node) => node.namespaceURI === W && node.localName === tag);
  const on = (properties, tag) => {
    const element = properties && child(properties, tag);
    return Boolean(element) && !["0", "false", "none"].includes(element.getAttributeNS(W, "val"));
  };
  const runs = (paragraph) => {
    let out = "";
    for (const node of paragraph.childNodes) {
      if (node.namespaceURI !== W) continue;
      if (node.localName === "hyperlink") {
        const href = relations.get(node.getAttributeNS(R, "id"));
        const inner = runs(node);
        out += href ? `<a href="${escapeMarkup(href)}">${inner}</a>` : inner;
      } else if (node.localName === "r") {
        const properties = child(node, "rPr");
        let text = "";
        for (const part of node.childNodes) {
          if (part.localName === "t") text += escapeText(part.textContent);
          else if (part.localName === "tab") text += "\t";
          else if (part.localName === "br" || part.localName === "cr") text += "<br>";
          else if (part.localName === "drawing" || part.localName === "pict") {
            const blip = part.getElementsByTagNameNS("*", "blip")[0];
            const id = blip?.getAttributeNS(R, "embed") || part.getElementsByTagNameNS("*", "imagedata")[0]?.getAttributeNS(R, "id");
            const src = id && pictureOf(id);
            if (src) text += `<img src="${src}">`;
          }
        }
        if (!text) continue;
        if (on(properties, "b")) text = `<strong>${text}</strong>`;
        if (on(properties, "i")) text = `<em>${text}</em>`;
        if (on(properties, "u")) text = `<u>${text}</u>`;
        if (on(properties, "strike") || on(properties, "dstrike")) text = `<s>${text}</s>`;
        out += text;
      } else if (["ins", "smartTag", "sdt", "sdtContent", "fldSimple"].includes(node.localName)) out += runs(node);
    }
    return out;
  };

  let html = "";
  const open = []; // the lists open: [{ tag, level }]
  const closeLists = (level = -1) => {
    while (open.length && open.at(-1).level > level) html += `</li></${open.pop().tag}>`;
  };
  for (const element of document.getElementsByTagNameNS(W, "body")[0]?.childNodes ?? []) {
    if (element.namespaceURI !== W) continue;
    if (element.localName === "tbl") {
      closeLists();
      let table = "<table>";
      for (const row of element.getElementsByTagNameNS(W, "tr")) {
        table += "<tr>";
        for (const cell of [...row.childNodes].filter((node) => node.localName === "tc")) table += `<td>${[...cell.getElementsByTagNameNS(W, "p")].map(runs).join("<br>")}</td>`;
        table += "</tr>";
      }
      html += `${table}</table>`;
      continue;
    }
    if (element.localName !== "p") continue;
    const properties = child(element, "pPr");
    const styleId = child(properties ?? element, "pStyle")?.getAttributeNS(W, "val");
    const style = styleNames.get(styleId) || styleId?.toLowerCase() || "";
    const numbered = properties && child(properties, "numPr");
    const content = runs(element);
    if (numbered) {
      const level = Number(child(numbered, "ilvl")?.getAttributeNS(W, "val") ?? 0);
      const tag = (lists.get(child(numbered, "numId")?.getAttributeNS(W, "val"))?.[level] ?? "bullet") === "bullet" ? "ul" : "ol";
      closeLists(level); // deeper lists close
      const top = open.at(-1);
      if (top && top.level === level && top.tag === tag) html += "</li><li>";
      else {
        if (top && top.level === level) html += `</li></${open.pop().tag}>`; // the same level, another kind of list
        html += `<${tag}><li>`; // a deeper one: in the item open
        open.push({ tag, level });
      }
      html += content;
      continue;
    }
    closeLists();
    const heading = /^(heading|标题) ?([1-6])$/.exec(style)?.[2] || (style === "title" ? "1" : style === "subtitle" ? "2" : "");
    if (heading) html += `<h${heading}>${content}</h${heading}>`;
    else if (/quote|引用/.test(style)) html += `<blockquote>${content}</blockquote>`;
    else html += `<p>${content || "<br>"}</p>`;
  }
  closeLists();
  const title = xml("docProps/core.xml")?.getElementsByTagNameNS("*", "title")[0]?.textContent?.trim();
  return { title: title || titleFromName(name), specs: M.mathifySpecs(M.htmlToBlocks(M.parseClipboardHTML(html, { base: BASE }))), marks };
}

// ---------- PDF: its text as paragraphs ----------

// pdf.js, loaded by its file (never by a name a bundle would take in): the pdfjs-dist package's legacy
// build, or the release's minified pair in vendor/pdfjs/ (src/cli/release-build.mjs), its worker named, as
// pdf.js runs it in this thread (Node gives it no web worker). Only text is read: no canvas, so the two
// globals pdf.js would otherwise polyfill from @napi-rs/canvas (which the release has not: it says "Cannot
// polyfill") are stood in for by empty classes when the process has none.
async function loadPdfjs() {
  const build = pdfjsDirectory ? path.join(pdfjsDirectory, "legacy", "build") : path.dirname(fileURLToPath(import.meta.resolve("pdfjs-dist/legacy/build/pdf.mjs")));
  const [main, worker] = pdfjsDirectory ? ["pdf.min.mjs", "pdf.worker.min.mjs"] : ["pdf.mjs", "pdf.worker.mjs"];
  globalThis.DOMMatrix ??= class DOMMatrix {};
  globalThis.Path2D ??= class Path2D {};
  const pdfjs = await import(pathToFileURL(path.join(build, main)).href);
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(path.join(build, worker)).href;
  // Its CMaps (Chinese, Japanese, Korean text) and standard fonts, read from disk (pdf.js wants a "/" at the end).
  return { pdfjs, root: path.dirname(path.dirname(build)).replace(/\\/g, "/") };
}

async function pdfPage(bytes, name) {
  const { pdfjs, root } = await loadPdfjs();
  const loading = pdfjs.getDocument({
    data: new Uint8Array(bytes), cMapUrl: `${root}/cmaps/`, cMapPacked: true,
    standardFontDataUrl: `${root}/standard_fonts/`, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0,
  });
  const pdf = await loading.promise;
  const lines = [];
  for (let number = 1; number <= pdf.numPages; number++) {
    const page = await pdf.getPage(number);
    const content = await page.getTextContent();
    // Its text in reading order (pdf.js gives it in drawing order: a code span drawn after its line
    // would come after it): top to bottom, a line's pieces left to right.
    const pieces = content.items.filter((item) => "str" in item && item.str !== "").map((item) => ({
      x: item.transform[4], y: Math.round(item.transform[5]), size: Math.round(Math.hypot(item.transform[2], item.transform[3])), text: item.str,
    })).sort((a, b) => b.y - a.y || a.x - b.x);
    const pageLines = [];
    for (const piece of pieces) {
      const line = pageLines.at(-1);
      if (line && Math.abs(line.y - piece.y) <= Math.max(2, piece.size * 0.3)) {
        line.pieces.push(piece);
        line.size = Math.max(line.size, piece.size);
      } else pageLines.push({ y: piece.y, size: piece.size, pieces: [piece] });
    }
    for (const line of pageLines) lines.push({ y: line.y, size: line.size, text: line.pieces.sort((a, b) => a.x - b.x).map((piece) => piece.text).join("") });
    lines.push({ pageBreak: true });
    page.cleanup();
  }
  await loading.destroy();
  const sizes = lines.filter((line) => !line.pageBreak && line.text.trim()).map((line) => line.size).sort((a, b) => a - b);
  const body = sizes[Math.floor(sizes.length / 2)] || 12;
  const specs = [];
  let paragraph = null;
  let previous = null;
  const flush = () => {
    if (paragraph?.trim()) specs.push({ type: "text", title: [[paragraph.trim()]], props: {}, children: [] });
    paragraph = null;
  };
  for (const line of lines) {
    if (line.pageBreak) {
      flush();
      previous = null;
      continue;
    }
    const text = line.text.replace(/\s+/g, " ").trim();
    if (!text) {
      flush();
      continue;
    }
    if (line.size >= body * 1.3 && text.length < 120) {
      flush();
      specs.push({ type: line.size >= body * 1.8 ? "header" : line.size >= body * 1.5 ? "sub_header" : "sub_sub_header", title: [[text]], props: {}, children: [] });
      previous = line;
      continue;
    }
    // A line further below the last than its size: a new paragraph.
    if (!paragraph || !previous || previous.y - line.y > line.size * 1.8 || previous.size !== line.size) {
      flush();
      paragraph = text;
    } else paragraph += (/[㐀-鿿]$/.test(paragraph) || /^[㐀-鿿]/.test(text) ? "" : " ") + text;
    previous = line;
  }
  flush();
  return { title: titleFromName(name), specs, marks: [] };
}

// ---------- EPUB: one page ----------

async function epubPage(bytes, name, M) {
  const entries = readZip(bytes);
  const ctx = context(new Map(entries.map((each) => [each.name, memorySource(each.data, each.name)])));
  const container = ctx.source("META-INF/container.xml");
  const opfPath = container && /full-path="([^"]+)"/.exec(decodeText(container.read()))?.[1];
  const opf = opfPath && ctx.source(opfPath) && new DOMParser().parseFromString(decodeText(ctx.source(opfPath).read()), "application/xml");
  if (!opf) throw new Error("不是 EPUB 文件");
  const manifest = new Map([...opf.getElementsByTagNameNS("*", "item")].map((item) => [item.getAttribute("id"), item.getAttribute("href")]));
  const specs = [];
  const marks = [];
  for (const reference of opf.getElementsByTagNameNS("*", "itemref")) {
    const chapter = ctx.resolve(dirOf(opfPath), manifest.get(reference.getAttribute("idref")));
    if (!chapter) continue;
    const page = await htmlPage(decodeText(ctx.source(chapter).read()), chapter, ctx, M, { chapter: true });
    fixSpecs(page.specs, chapter, ctx, page, marks);
    specs.push(...page.specs);
  }
  const title = opf.getElementsByTagNameNS("*", "title")[0]?.textContent?.trim();
  return { title: title || titleFromName(name), specs, marks, fixed: true };
}

// ---------- what the converters made: pictures, files, subpages ----------

// A paragraph that is one link (spaces around it aside): its address and text.
function onlyLink(title) {
  const parts = (title ?? []).filter((part) => part[0].trim());
  if (parts.length !== 1) return null;
  const link = parts[0][1]?.find((annotation) => annotation[0] === "a");
  return link ? { href: link[1], text: parts[0][0], entry: link } : null;
}
const markOf = (source) => (typeof source === "string" && source.startsWith(MARK) ? Number(source.slice(MARK.length)) : -1);
// A table cell's picture while its page is built: the place of its mark (pageNodes), a name no file of the import takes.
const CELL_MARK = "import-cell-mark-";
const CELL_PICTURE = new RegExp(`<img src="assets/${CELL_MARK}(\\d+)"([^>]*)>`, "g");
// A file of the set as the block that shows it: a picture, an embed (a PDF or HTML file), else a file block.
const fileKind = (name) => (IMAGE_EXT.has(extOf(name)) ? "image" : EMBED_EXT.has(extOf(name)) ? "embed" : "file");
const markSpec = (index, kind) => (kind === "image" ? { type: "image", title: [], props: { source: MARK + index }, children: [] } : { type: "embed", title: [], props: { source: MARK + index }, children: [] });

/**
 * Specs made fit for the page: pictures, files and Notion's bookmarks and
 * embeds as marks (`marks`, which `page`'s converter began: the HTML's own), a link alone in its
 * paragraph to a page of the set a subpage (a spec { type: "subpage", target } taken out after),
 * links to the set's files or pages in a text left as their text. In place.
 */
function fixSpecs(specs, name, ctx, page, marks = page.marks) {
  const dir = dirOf(name);
  const mark = (value) => marks.push(value) - 1;
  const own = (source) => markOf(source) >= 0 && page.marks !== marks ? mark(page.marks[markOf(source)]) : markOf(source); // a chapter's marks into the book's
  for (let i = 0; i < specs.length; i++) {
    const s = specs[i];
    s.props ??= {};
    if (s.type === "image" && s.props.source) {
      const source = s.props.source;
      const target = markOf(source) < 0 ? ctx?.resolve(dir, source) : null;
      let caption = plainOf(s.props.caption);
      // Notion's Markdown: the alt text is the file's name (no caption); a caption is the next paragraph too.
      if (caption && decoded(baseName(target ?? page.marks[markOf(source)]?.name ?? source)) === caption) caption = "";
      else if (caption && specs[i + 1]?.type === "text" && plainOf(specs[i + 1].title) === caption && !specs[i + 1].children?.length) specs.splice(i + 1, 1);
      const index = markOf(source) >= 0 ? own(source)
        : target ? mark({ kind: "image", source: ctx.source(target), name: baseName(target) })
          : /^data:image\//i.test(source) || /^https?:/i.test(source) ? mark({ kind: "image", url: source, name: "", line: s.props.line ?? null })
            : -1;
      if (index < 0) {
        page.notes?.push({ line: s.props.line ?? null, kind: "picture-missing", name: source, text: `the picture ${source} was not found: left out` });
        specs.splice(i, 1);
        // One in a paragraph's words (they came apart around it: markdown.mjs paragraphBlocks): the
        // words one paragraph again.
        const [before, after] = [specs[i - 1], specs[i]];
        if (s.props.line != null && before?.type === "text" && after?.type === "text" && before.props?.line === s.props.line && after.props?.line === s.props.line) {
          const wide = /[\u3000-\u9fff\uff00-\uffef]/;
          const apart = !(wide.test(plainOf(before.title).at(-1) ?? "") && wide.test(plainOf(after.title)[0] ?? ""));
          after.title = [...before.title, ...(apart ? [[" "]] : []), ...after.title];
          specs.splice(i - 1, 1);
          i--;
        }
        i--;
        continue;
      }
      marks[index] = { ...marks[index], caption };
      specs[i] = markSpec(index, "image");
      continue;
    }
    if ((s.type === "file" || s.type === "embed") && s.props.source) {
      const source = s.props.source;
      const target = markOf(source) < 0 ? ctx?.resolve(dir, source) : null;
      if (markOf(source) >= 0) specs[i] = markSpec(own(source), "file");
      else if (target) specs[i] = markSpec(mark({ kind: fileKind(target) === "image" ? "image" : s.type === "embed" ? fileKind(target) : "file", source: ctx.source(target), name: baseName(target) }), fileKind(target));
      continue; // a web address: the paste's own (an embed, or a link)
    }
    if (s.type === "table") tablePictures(s, dir, ctx, page, mark, own);
    const link = s.type === "text" && !s.children?.length ? onlyLink(s.title) : null;
    const extra = link && page.extra && /#import-(bookmark|embed)=(\d+)$/.exec(link.href);
    if (extra?.[1] === "bookmark") {
      const bookmark = page.extra.bookmarks[Number(extra[2])];
      specs[i] = /^https?:\/\//i.test(bookmark.href) ? markSpec(mark({ kind: "bookmark", bookmark }), "bookmark") : { type: "text", title: [[bookmark.title || bookmark.href]], props: {}, children: [] };
      continue;
    }
    if (extra?.[1] === "embed") {
      const source = page.extra.embeds[Number(extra[2])];
      const target = ctx?.resolve(dir, source);
      if (target) specs[i] = markSpec(mark({ kind: fileKind(target), source: ctx.source(target), name: baseName(target) }), fileKind(target));
      else if (/^https:\/\//i.test(source)) specs[i] = { type: "embed", title: [], props: { source }, children: [] };
      else specs[i] = { type: "text", title: source ? [[source, [["a", source]]]] : [], props: {}, children: [] }; // a relative one not in the set (one HTML file alone): its address
      continue;
    }
    if (link) {
      const target = ctx?.resolve(dir, link.href);
      if (target && ctx.isPage(target) && !ctx.pageFile(target)) {
        specs[i] = { type: "subpage", target, title: [[link.text]], props: {}, children: [] };
        page.brought?.add(link.entry);
        continue;
      }
      if (target) {
        const kind = fileKind(target);
        specs[i] = markSpec(mark({ kind, source: ctx.source(target), name: baseName(target), caption: "" }), kind);
        page.brought?.add(link.entry);
        continue;
      }
    }
    // Links in a text to a file or page of the set: their text (an address of the set means nothing in a report).
    for (const part of s.title ?? []) {
      const annotations = part[1];
      const at = annotations?.findIndex((annotation) => annotation[0] === "a") ?? -1;
      if (at >= 0 && (annotations[at][1].startsWith(BASE) || annotations[at][1].startsWith(MARK) || ctx?.resolve(dir, annotations[at][1]))) annotations.splice(at, 1);
    }
    if (s.children?.length) fixSpecs(s.children, name, ctx, page, marks);
  }
}

// A table's cells' pictures (单元格里的图片: markdown.mjs and html.mjs keep them amid a cell's words):
// each a mark of the page's, found as an image's is (a file of the set, the HTML page's own, a data:
// or web address), its address that mark's (pageNodes makes it the file kept); one not found its alt
// words (else its file's name), noted. In place.
function tablePictures(table, dir, ctx, page, mark, own) {
  for (const row of table.children ?? []) {
    const cells = row.props?.cells ?? {};
    for (const [column, title] of Object.entries(cells)) {
      cells[column] = title.flatMap((piece) => {
        const picture = piece[1]?.find((annotation) => annotation[0] === "img");
        if (!picture) return [piece];
        const source = picture[1];
        const target = markOf(source) < 0 ? ctx?.resolve(dir, source) : null;
        const index = markOf(source) >= 0 ? own(source)
          : target ? mark({ kind: "image", source: ctx.source(target), name: baseName(target) })
            : /^data:image\//i.test(source) || /^https?:/i.test(source) ? mark({ kind: "image", url: source, name: "", line: row.props?.line ?? null })
              : -1;
        if (index >= 0) return [[piece[0], piece[1].map((annotation) => (annotation === picture ? ["img", MARK + index, ...picture.slice(2)] : annotation))]];
        page.notes?.push({ line: row.props?.line ?? null, kind: "picture-missing", name: source, text: `the picture ${source} in a table's cell was not found: its words kept` });
        const words = picture[2] || decoded(baseName(source.split(/[?#]/)[0]));
        const others = piece[1].filter((annotation) => annotation !== picture);
        return words ? [others.length ? [words, others] : [words]] : [];
      });
    }
  }
}

// The subpage specs of `specs`, taken out: their targets, in order.
function takeSubpages(specs, found = []) {
  for (let i = 0; i < specs.length; i++) {
    if (specs[i].type === "subpage") {
      found.push(specs[i].target);
      specs.splice(i--, 1);
    } else if (specs[i].children?.length) takeSubpages(specs[i].children, found);
  }
  return found;
}

async function convert(name, source, ctx, M) {
  switch (kindOf(name)) {
    case "markdown": return markdownPage(decodeText(source.read()), name, M);
    case "html": return htmlPage(decodeText(source.read()), name, ctx, M);
    case "csv": return csvPage(decodeText(source.read()), name, M);
    case "docx": return docxPage(source.read(), name, M);
    case "pdf": return pdfPage(source.read(), name);
    case "epub": return epubPage(source.read(), name, M);
    default: return null;
  }
}

// ---------- a page's blocks as the commit writes them ----------

const PLAIN_NAME = /[\u0000-\u001f<>:"/\\|?*]/g;
const fileName = (name) => decoded(name).replace(PLAIN_NAME, "").trim().slice(0, 120) || "file";
const linkParagraph = (url, text = url) => ({ type: "paragraph", html: `<a href="${escapeMarkup(url)}">${escapeText(text)}</a>` });

/**
 * The page's nodes (core.mjs nodeOf: what a commit writes) and its files ([{ from, name }]: a file
 * on disk, its name in the report's folder): its specs made blocks (to-blocks.mjs), built as a paste
 * builds them (own/blocks.mjs build, formulas drawn), each mark's empty figure then the block it
 * shows (realize). Its HTML blocks kept as written (`raws`, fillReport writes them), each picture of
 * the set they show kept as the page's own, their addresses then those. What it could not bring is
 * added to the page's notes (`notes`).
 */
async function pageNodes(page, scratch, M) {
  const { document } = globalThis; // the page's window (convertSet)
  const main = document.querySelector("main");
  const formula = M.formulaMaker();
  const nodes = [];
  const notes = [...(page.notes ?? [])];
  // A table cell's picture (tablePictures: its address its mark's) in the place of its mark, the file
  // kept once the page is built (cellPictures); any other none.
  const picture = (node) => {
    if (node.localName !== "img") return undefined;
    const index = markOf(node.getAttribute("src") ?? "");
    if (index < 0) return null;
    const img = document.createElement("img");
    const place = `assets/${CELL_MARK}${index}`;
    img.setAttribute("src", place);
    img.setAttribute("alt", node.getAttribute("alt") ?? "");
    if (/^[1-9]\d{0,3}$/.test(node.getAttribute("width") ?? "")) img.setAttribute("width", node.getAttribute("width"));
    img.setAttribute("data-ge-src", place);
    return img;
  };
  for (const block of M.toBlocks(page.specs, null, { held: page.held === true })) {
    try {
      const element = M.build(document, block, { formula, picture });
      main.append(element);
      const node = M.nodeOf(element);
      if (node) nodes.push(node);
    } catch (error) {
      notes.push({ line: null, kind: "left-out", text: `a block the page cannot make is left out (${block.type}): ${error.message}` });
    }
  }
  const files = new Map(); // name -> from
  const keep = async (source, kind, given) => {
    const from = await source.file(scratch);
    const name = keptName(kind, await hashOf(from), source.head() ?? headOf(from), given);
    files.set(name, from);
    return { src: `assets/${name}`, size: source.size };
  };
  // Mark `index` as the block it shows: a node, or null (none: left out).
  const realize = async (index) => {
    const mark = page.marks[index];
    if (!mark) return null;
    const caption = escapeText(mark.caption ?? "");
    try {
      if (mark.kind === "bookmark") {
        const { href, title, description } = mark.bookmark;
        return { type: "bookmark", href, title: title.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 300), description: description.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 600), icon: null, cover: null, caption: "" };
      }
      if (mark.kind === "image") {
        let source = mark.source;
        if (!source && /^data:/i.test(mark.url)) source = memorySource(Buffer.from(mark.url.slice(mark.url.indexOf(",") + 1), "base64"), "image");
        if (!source) { // a picture of the web: downloaded, as a paste's
          try {
            const response = await fetchWeb(mark.url, { timeout: 10000, accept: "image/*" });
            const bytes = response.ok ? await readWhole(response, UPLOAD_LIMITS.image) : null;
            if (!bytes) throw new Error("download");
            source = memorySource(bytes, baseName(new URL(mark.url).pathname) || "image");
          } catch {
            notes.push({ line: mark.line ?? null, kind: "picture-web", name: mark.url, text: `the picture ${mark.url} could not be downloaded: kept as a link to it` });
            return linkParagraph(mark.url);
          }
        }
        const { src } = await keep(source, "image", source.name);
        return { type: "image", src, caption };
      }
      if (mark.kind === "embed") {
        const { src } = await keep(mark.source, "embed", mark.name);
        return { type: "embed", src, caption };
      }
      const { src, size } = await keep(mark.source, "file", mark.name);
      return { type: "file", href: src, name: fileName(mark.name), size: formatSize(size), caption };
    } catch {
      // Not what it says it is (a "picture" that is none): a file block, else left out.
      if (mark.kind !== "file" && mark.source) {
        try {
          const { src, size } = await keep(mark.source, "file", mark.name);
          return { type: "file", href: src, name: fileName(mark.name), size: formatSize(size), caption };
        } catch {}
      }
      return null;
    }
  };
  // A table's cells' pictures in the places of their marks (picture, above): each the file kept, a
  // web one that could not be downloaded a link to it (realize says so), one not had its alt words.
  const cellPictures = async (html) => {
    const found = [...html.matchAll(CELL_PICTURE)];
    if (found.length === 0) return html;
    const made = new Map();
    for (const [, index] of found) if (!made.has(index)) made.set(index, await realize(Number(index)));
    return html.replace(CELL_PICTURE, (all, index, rest) => {
      const shown = made.get(index);
      const alt = /\salt="([^"]*)"/.exec(rest)?.[1] ?? "";
      if (shown?.type === "image") return `<img src="${shown.src}"${rest}>`;
      if (shown?.type === "paragraph") return shown.html.replace(/>[^<]*<\/a>$/, `>${alt || escapeText(page.marks[Number(index)]?.url ?? "")}</a>`);
      return alt;
    });
  };
  const walk = async (list) => {
    for (let i = 0; i < list.length; i++) {
      const node = list[i];
      if (!node || typeof node !== "object") continue;
      if (node.type === "table" && Array.isArray(node.rows)) {
        node.rows = await Promise.all(node.rows.map((row) => Promise.all(row.map((html) => (typeof html === "string" ? cellPictures(html) : html)))));
        continue;
      }
      if (node.type === "image" || node.type === "embed") {
        const src = M.madeFrom.get(node)?.getAttribute(M.PASTED_SOURCE) ?? "";
        const made = markOf(src) >= 0 ? await realize(markOf(src)) : node.type === "embed" && /^https:\/\//i.test(src) ? { type: "embed", src, caption: "" } : /^https?:/i.test(src) ? linkParagraph(src) : null;
        if (made) list[i] = made;
        else list.splice(i--, 1);
        continue;
      }
      for (const value of Object.values(node)) if (Array.isArray(value)) await walk(value);
    }
  };
  await walk(nodes);
  const raws = [];
  for (const raw of page.raws ?? []) {
    const kept = new Map();
    for (const picture of raw.pictures) {
      try {
        kept.set(picture.src, (await keep(picture.source, "image", picture.name)).src);
      } catch {
        notes.push({ line: raw.line, kind: "picture-missing", name: picture.src, text: `the picture ${picture.src} is no picture: kept as written` });
      }
    }
    raws.push(withPictureAddresses(raw.html, (src) => kept.get(src) ?? src));
  }
  let icon = null;
  if (typeof page.icon === "string" && iconKind(page.icon) === "emoji") icon = page.icon;
  else if (page.icon?.source) {
    try {
      icon = (await keep(page.icon.source, "icon", page.icon.name)).src;
    } catch {}
  }
  return { nodes, icon, files: [...files].map(([name, from]) => ({ name, from })), raws, notes: notes.sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity)) };
}

// ---------- the uploads ----------

/**
 * The pages of files uploaded (`uploads`: [{ file, name }], the file on disk and the name it came
 * with), for the service to write: { pages: [{ title, icon, nodes, raws, notes, files, children,
 * from }] (a tree: the top ones go under the page imported into), skipped: [names] (not taken, or
 * not read) }. `scratch`: a folder for what is read out of a zip.
 */
export async function importFiles(uploads, scratch) {
  const M = await modules();
  const pages = [];
  const skipped = [];
  const loose = uploads.filter((upload) => kindOf(upload.name) !== "zip");
  // Files chosen together: one set, so a page finds its pictures among them.
  if (loose.length) {
    const ctx = context(new Map(loose.map((upload) => [baseName(upload.name), diskSource(upload.file, baseName(upload.name))])));
    const used = new Set();
    const made = await convertSet(ctx, M, scratch, (name) => used.add(name), skipped);
    pages.push(...made);
    for (const upload of loose) {
      const name = baseName(upload.name);
      if (!ctx.isPage(name) && !used.has(name)) skipped.push(upload.name);
    }
  }
  for (const upload of uploads.filter((each) => kindOf(each.name) === "zip")) {
    const opened = [];
    try {
      const files = new Map();
      const open = (file, prefix, nested) => {
        const zip = openZip(file);
        opened.push(zip);
        return zip.entries.filter((entry) => !SKIPPED.test(entry.name)).map((entry) => ({ zip, entry, name: prefix + entry.name.replace(/\\/g, "/"), nested }));
      };
      for (const item of open(upload.file, "", false)) {
        if (kindOf(item.name) === "zip") { // a zip in it (Notion's parts of a large export): opened too, its files in its folder
          const inner = await zipSource(item.zip, item.entry, item.name).file(scratch);
          for (const each of open(inner, dirOf(item.name) ? `${dirOf(item.name)}/` : "", true)) files.set(each.name, zipSource(each.zip, each.entry, each.name));
        } else files.set(item.name, zipSource(item.zip, item.entry, item.name));
      }
      const made = await convertSet(context(files), M, scratch, () => {}, skipped);
      if (made.length) pages.push(...made);
      else skipped.push(upload.name);
    } catch {
      skipped.push(upload.name);
    } finally {
      for (const zip of opened) zip.close();
    }
  }
  return { pages, skipped };
}

// A Markdown file of the disk as a set of its own: its one page (named as the file, as Markdown
// whatever its extension), and the pictures it links to by relative addresses found on disk as they
// say (from the file's folder; one starting "/" from it too), each a file of the set once linked.
// Other files it links to are none of the set: a link to one stays its words, as an import's.
function diskContext(file) {
  const folder = path.dirname(file);
  const own = path.basename(file);
  const name = kindOf(own) === "markdown" ? own : `${own}.md`;
  const files = new Map([[name, diskSource(file, own)]]);
  return {
    files,
    isPage: (each) => each === name,
    pageFile: () => false,
    source: (each) => files.get(each),
    resolve(_dir, href) {
      if (!href || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(href)) return null;
      const target = path.resolve(folder, `./${decoded(href.split("#")[0].split("?")[0])}`);
      if (!IMAGE_EXT.has(extOf(target))) return null;
      try {
        if (!fs.statSync(target).isFile()) return null;
      } catch {
        return null;
      }
      const key = path.relative(folder, target).split(path.sep).join("/");
      if (!files.has(key)) files.set(key, diskSource(target, path.basename(target)));
      return key;
    },
  };
}

/**
 * One Markdown file of the disk as a page (gallery import): read as the import reads one
 * (markdownPage), the pictures it links to found beside it (diskContext) and kept as the page's own.
 * Returns the page: { title, icon, nodes, raws, notes, files, from } (fillReport writes it).
 * `scratch`: a folder of the import's own.
 */
export async function importMarkdown(file, scratch) {
  const M = await modules();
  const skipped = [];
  const [page] = await convertSet(diskContext(file), M, scratch, () => {}, skipped);
  if (!page) throw new Error(`${path.basename(file)} could not be read as Markdown`);
  return page;
}

// Each page of set `ctx`, as a tree (folders and links say which is under which). `use(name)` hears of each file a page shows.
async function convertSet(ctx, M, scratch, use, skipped) {
  // Gallery's own reports first (main.doc-page: ownReportPage): the files of the set one shows
  // (its folder's, assets/<file>) are its own, never pages of their own, whether the set has them
  // before it or after it.
  const own = new Map(); // name -> its record (null: not read)
  const taken = new Set();
  for (const [name, source] of ctx.files) {
    if (!ctx.isPage(name) || kindOf(name) !== "html") continue;
    try {
      const read = decodeText(source.read());
      if (!/(?<![\w-])(?:doc|report)-page(?![\w-])/.test(read)) continue;
      // An export made before the kit's names were doc-* (2026-10-26) is read with them new.
      const html = newNames(read);
      const tree = parseReport(html);
      if (!ownReportMain(tree)) continue;
      // What the export carries (carry.mjs): of a file not changed since it was made, the document as written
      // (carriedPage: a source that is one of this Gallery's pages); of one changed, the names of its files and its
      // doc.json's fields. Its scripts are kept only for an export this computer made, its signature this
      // computer's export key's and the file as it was made (`trusted`); any other page (another's export, an older
      // one, a file changed after it was made, a report.html of another's folder) is made inert (inertPage): what
      // would run in the preview's origin, where the workspace's token is, goes, and how much is said (`inert`).
      let { carried, intact, own: signed } = carriedOf(read);
      if (carried && intact && !ownReportMain(parseReport(carried.source))) [carried, intact, signed] = [null, false, false];
      const whole = Boolean(carried && intact);
      const trusted = whole && signed;
      const page = whole ? { title: (typeof carried.doc?.title === "string" && carried.doc.title) || ownReportTitle(parseReport(carried.source)) || titleFromName(name) } : ownReportPage(html, tree, name);
      const names = new Map(carried && !whole && Array.isArray(carried.files) ? carried.files.filter((entry) => keptAssetName(entry?.name) && typeof entry.sha256 === "string").map((entry) => [entry.sha256, entry.name]) : []);
      const made = whole ? await carriedPage(carried, html, name, ctx, scratch) : await ownReportFiles(page, name, ctx, scratch, names);
      for (const file of made.used) {
        use(file);
        taken.add(file);
      }
      const { text, removed } = trusted ? { text: made.text, removed: 0 } : inertPage(made.text);
      const doc = carried?.doc && typeof carried.doc === "object" ? carried.doc : null;
      own.set(name, {
        name, title: cleanTitle(page.title) || titleFromName(name), icon: made.icon, nodes: [], own: { text }, files: made.files, links: [], children: [], notes: made.notes ?? [],
        doc: docFields(doc, tree), exact: whole, carried: Boolean(carried), trusted, inert: removed,
      });
    } catch {
      own.set(name, null);
      skipped.push(name);
    }
  }
  const records = [];
  // Those a page may take as its files last, once the pages have said so.
  const names = [...ctx.files.keys()];
  for (const name of [...names.filter((each) => !ctx.pageFile(each)), ...names.filter(ctx.pageFile)]) {
    if (!ctx.isPage(name) || taken.has(name)) continue;
    if (own.has(name)) {
      if (own.get(name)) records.push(own.get(name));
      continue;
    }
    openDocument(); // a new window for each page: its own document, its DOMParser
    let page;
    try {
      page = await convert(name, ctx.files.get(name), ctx, M);
    } catch {
      skipped.push(name);
      continue;
    }
    if (!page) continue;
    if (!page.fixed) fixSpecs(page.specs, name, ctx, page);
    if (page.links) linkNotes(page);
    if (page.raws?.length) rawPictures(page, name, ctx, use);
    for (const mark of page.marks) {
      if (!mark.source) continue;
      use(mark.source.name);
      if (ctx.pageFile(mark.source.name)) taken.add(mark.source.name);
    }
    const links = takeSubpages(page.specs);
    const { nodes, icon, files, raws: written, notes } = await pageNodes(page, scratch, M);
    // The HTML blocks a page keeps as written (a Markdown file's) made inert as another's page is (inertPage):
    // they come into the preview's origin as the document's own, and nobody here wrote them.
    let inert = 0;
    const raws = (written ?? []).map((raw) => {
      const made = inertPage(raw);
      inert += made.removed;
      return made.text;
    });
    records.push({ name, title: cleanTitle(page.title) || titleFromName(name), icon, nodes, files, raws, notes, lang: page.lang ?? null, links, children: [], inert });
  }
  // Under which page each goes: the one whose folder it is in (Notion's "Page <id>.md" with "Page/",
  // or "Page <id>/" of older exports), else the first that links to it alone (no page its own ancestor).
  const byName = new Map(records.map((record) => [record.name, record]));
  const folders = new Map();
  for (const record of records) {
    const stem = record.name.replace(/\.[^./]+$/, "");
    for (const folder of [stem, stem.replace(NOTION_ID, "")]) if (!folders.has(folder)) folders.set(folder, record);
  }
  const parent = new Map();
  for (const record of records) {
    const above = folders.get(dirOf(record.name));
    if (above && above !== record) parent.set(record, above);
  }
  const ancestors = (record) => {
    const list = [];
    for (let at = parent.get(record); at && !list.includes(at); at = parent.get(at)) list.push(at);
    return list;
  };
  for (const record of records) {
    for (const target of record.links) {
      const child = byName.get(target);
      if (child && child !== record && !parent.has(child) && !ancestors(record).includes(child)) parent.set(child, record);
    }
  }
  // Each page's subpages: those it links to first, in that order, then the others in the set's order.
  for (const record of records) {
    const mine = records.filter((each) => parent.get(each) === record);
    const linked = record.links.map((target) => byName.get(target)).filter((each) => mine.includes(each));
    record.children = [...new Set([...linked, ...mine])];
  }
  const tree = (record) => ({
    title: record.title, icon: record.icon, nodes: record.nodes, ...(record.own ? { own: record.own, doc: record.doc, exact: record.exact, carried: record.carried, trusted: record.trusted } : {}), inert: record.inert ?? 0, raws: record.raws ?? [], notes: record.notes ?? [], lang: record.lang ?? null,
    files: record.files, from: record.name, children: record.children.map(tree),
  });
  return records.filter((record) => !parent.has(record)).map(tree);
}

// ---------- a page into its new report ----------

// An own report's page (ownReportFiles' text) as the new report's: its main's data-doc-id the new
// report's `slug`, and a main with no element after its header given the starter's paragraph (on a
// line of its own, at the header's indent, with the page's line break).
function ownFilled(text, slug) {
  const main = ownReportMain(parseReport(text));
  if (!main?.sourceCodeLocation?.startTag) return text;
  const edits = [];
  const at = main.sourceCodeLocation;
  if (slug !== undefined) {
    const id = at.attrs?.["data-doc-id"];
    const written = `data-doc-id="${escapeAttribute(slug)}"`;
    edits.push(id ? { start: id.startOffset, end: id.endOffset, text: written } : { start: at.startTag.endOffset - 1, end: at.startTag.endOffset - 1, text: ` ${written}` });
  }
  const header = elementsOf(main).find((node) => node.tagName === "header" && hasClass(node, "doc-header"));
  if (elementsOf(main).every((node) => node === header)) {
    const after = header?.sourceCodeLocation?.endOffset ?? at.startTag.endOffset;
    const from = header?.sourceCodeLocation?.startOffset ?? at.startOffset;
    const indent = /[ \t]*$/.exec(text.slice(text.lastIndexOf("\n", from - 1) + 1, from))[0] + (header ? "" : "  ");
    edits.push({ start: after, end: after, text: `${text.includes("\r\n") ? "\r\n" : "\n"}${indent}<p></p>` });
  }
  return withEdits(text, edits);
}

// The HTML blocks a page keeps as written, each in place of its marker's paragraph (RAW), on its
// line and at its indent, the lines after its first indented as much but for a block holding
// preformatted text (its lines are its text). A marker that is not a paragraph's alone (none such is
// made) leaves the block's text, to be seen.
function withRaws(text, raws) {
  return text.replace(/^([ \t]*)<p>\u{E000}(\d+)\u{E001}<\/p>$/gmu, (all, indent, index) => {
    const html = raws[Number(index)];
    if (html === undefined) return all;
    const preformatted = /<(pre|textarea|script|style)\b/i.test(html);
    return indent + html.split("\n").map((line, at) => (at === 0 || preformatted || !line ? line : indent + line)).join("\n");
  }).replace(/\u{E000}(\d+)\u{E001}/gu, (_, index) => escapeText(raws[Number(index)] ?? ""));
}

/**
 * Report `source` (a new one, from the starter: its main holding one empty paragraph) with a page's
 * `nodes` written in its main (commitEdits, as the editor's commits write blocks; no block ids), its
 * HTML blocks kept as written (`raws`, each where its marker stands: withRaws; natural HTML, which
 * the preview and the export take in as the kit's: source/natural.mjs) and its `icon` (an emoji, an
 * icon of a set, or a picture assets/<file>) above its title, and the page's `lang` (a Markdown
 * document's with no Chinese: en) its <html lang> in place of the starter's (the UI's language when the
 * workbench imports it, else the file language's: shared/file-language.mjs). An own
 * report's page (`own`: { text }, ownReportFiles) is its own page instead, as written (its head, its
 * header and its block ids with it), but for its main's data-doc-id, the new report's slug (the
 * starter's); a main with nothing after its header gets the starter's paragraph, to write in.
 */
export async function fillReport({ source, nodes, icon, own, raws = [], lang = null }) {
  const { commitEdits } = await import("../editor/source/commit.mjs");
  const { iconMarkup } = await import("../shared/emoji/icon-value.mjs");
  if (own) {
    const { naturalize } = await import("../editor/source/natural.mjs");
    return naturalize(ownFilled(own.text, /<main\b[^>]*\sdata-doc-id="([^"]*)"/.exec(source)?.[1])).text; // what it wrote as any page would, the kit's (source/natural.mjs)
  }
  let current = source;
  if (lang && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(lang)) current = current.replace(/(<html\b[^>]*\slang=")[^"]*"/, (_, start) => `${start}${lang}"`);
  if (icon && iconKind(icon)) current = current.replace(/^([ \t]*)(<h1 class="doc-title")/m, (_, indent, title) => `${indent}${iconMarkup(icon)}\n${indent}${title}`);
  if (!nodes.length) return current;
  current = current.replace(/\n[ \t]*<p><\/p>(?=\n[ \t]*<\/main>)/, "");
  const result = commitEdits({ current, units: nodes.map((node, index) => ({ key: `i${index}`, insert: node, place: { into: { main: true } } })), ids: false });
  return raws.length ? withRaws(result.text, raws) : result.text;
}

