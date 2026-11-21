import fs from "node:fs/promises";
import path from "node:path";
import { chartPictures, findBrowser, pdfOf } from "./browser.mjs";
import { runJob } from "./jobs.mjs";
import { drawPageChips } from "../render/page-chips.mjs";
import { exportLinks } from "../render/page-link-rewrite.mjs";
import { pageLanguage } from "../shared/components/page.mjs";
import { exportSourceOf } from "../shared/export-wrap.mjs";
import { documentLinks } from "../shared/reports.mjs";
import { relativeLink, safeName, uniqueName } from "./names.mjs";
import { createZip } from "./zip.mjs";
import { documentDirectory, documentFiles } from "../shared/workspace.mjs";

// Exporting a page (导出), as the workbench asks for it (docs/workbench.md, "Import and export"):
//   format    "markdown" (markdown.mjs), "html" (the report's own offline file:
//             one file, its charts live, its pictures and files inside it) or "pdf" (the report as
//             the system's browser prints it: browser.mjs)
//   content   "everything", or "no_files": the files of the report's folder left out (links to where
//             they would be stay)
//   subpages  the pages under it too (the workspace's outline), each its own file
//   folders   each page's subpages in a folder named as it (else all at the top: flat); a page's
//             pictures and files go in the folder "assets" beside its file either way, never loose
//   paper, scale   a PDF's paper (A4, A3, Letter, Legal, Tabloid) and scale (0.1 < scale < 2)
// Names are the titles as they are (names.mjs: only what a file system cannot hold is left out; a
// name taken in its folder gets a number): a page "<title>.<ext>", its pictures and files in "assets"
// beside it, and with folders its subpages in the folder "<title>". One file (a page without subpages, and as Markdown without pictures or files) is
// downloaded as it is; more go in a zip "<title>.zip". Each page is what was saved last (the
// workbench saves the open one first). A link to another page goes to that page's file, relative, when
// the export holds it, and keeps only its words when it does not, and always in a PDF, which has no
// place to be relative to (render/page-link-rewrite.mjs); what site.offline made is left as it is. A
// page block in Markdown says the title it shows, as the other formats do, with no picture.

export const FORMATS = { markdown: "md", html: "html", pdf: "pdf" };
const TYPES = { markdown: "text/markdown; charset=utf-8", html: "text/html; charset=utf-8", pdf: "application/pdf" };
const scaleOK = (value) => typeof value === "number" && value > 0.1 && value < 2; // both bounds left out

/** Whether `options` are an export's: { format, content, subpages, folders, paper, scale }. */
export function validOptions(options) {
  const { format, content = "everything", subpages = false, folders = true, paper = "A4", scale = 1 } = options ?? {};
  return Object.hasOwn(FORMATS, format) && ["everything", "no_files"].includes(content) && typeof subpages === "boolean" && typeof folders === "boolean"
    && ["A4", "A3", "Letter", "Legal", "Tabloid"].includes(paper) && scaleOK(scale);
}

/**
 * The export of page `slug` with `options` ({ format, content, subpages, folders, paper, scale }):
 * { name, type, data }. `site`: { reportsDirectory, titleOf(slug), childrenOf(slug), links() -> the
 * workspace's links (shared/reports.mjs documentLinks), offline(slug, { files }) -> the
 * offline HTML of the saved report (its files inside it, or not), check(slug) }.
 * Every page is held to what any export needs, whatever the format (an HTML or PDF page as offline
 * makes its file, a Markdown page by check): one that fails throws an error with `reason` "check",
 * which this export then fails with, no file made.
 */
export async function exportPage(slug, options, site) {
  const { format, content = "everything", subpages = false, folders = true, paper = "A4", scale = 1 } = options;
  const ext = FORMATS[format];
  const files = content === "everything";
  // The pages, depth first: each with its file's path and the folder its subpages and files go in.
  const pages = [];
  const taken = new Map(); // folder -> lower-cased names in it
  const takenIn = (folder) => (taken.get(folder) ?? taken.set(folder, new Set()).get(folder));
  const plan = async (page, folder) => {
    const title = await site.titleOf(page);
    const name = uniqueName(`${safeName(title)}.${ext}`, takenIn(folder));
    const file = folder ? `${folder}/${name}` : name;
    const own = folders ? file.slice(0, -(ext.length + 1)) : ""; // its folder: its file's name, unique as that is
    pages.push({ slug: page, title, file, folder: own, files: folder ? `${folder}/assets` : "assets" }); // its pictures and files: "assets" beside its file
    if (subpages) for (const child of await site.childrenOf(page)) await plan(child, own);
  };
  await plan(slug, "");
  // Page `page`'s HTML with its links to the others as this export writes them.
  const { links } = await site.links();
  const withLinks = (page, html) => exportLinks(html, page.slug, (target) => {
    const file = format === "pdf" ? null : pages.find((each) => each.slug === target)?.file ?? null;
    return file && relativeLink(page.file, file);
  }, { blocks: format !== "markdown", links });

  const out = []; // the zip's files: pages first, then what they hold
  const assets = [];
  for (const page of pages) {
    if (format === "markdown") {
      await site.check(page.slug);
      const folder = documentDirectory(page.slug, site.reportsDirectory);
      const shown = drawPageChips(await fs.readFile(documentFiles(folder).html, "utf8"), { slug: page.slug, mode: "words", reportsDirectory: site.reportsDirectory });
      const source = withLinks(page, shown);
      const pictures = files && Boolean(findBrowser());
      const { text, files: linked, charts, charted } = await runJob("markdown", { source, title: page.title, pictures });
      let markdown = text;
      // Each file of the report's folder: in the page's folder (with "所有内容"), linked relative.
      const placed = new Map(); // src -> path in the zip
      linked.forEach(({ src, name }, index) => {
        if (!placed.has(src)) {
          placed.set(src, `${page.files}/${uniqueName(safeName(name), takenIn(page.files))}`);
          if (files) assets.push({ from: path.join(folder, src), name: placed.get(src) }); // once, however often the page links it
        }
        const where = placed.get(src);
        markdown = markdown.replace(`\u0000F${index}\u0000`, () => relativeLink(page.file, where));
      });
      // Each card's picture, taken by the browser, named as the card is: a chart's 图表, a drawing's 图.
      if (pictures && charts > 0 && markdown.includes("\u0000C")) {
        const shots = await chartPictures(await site.offline(page.slug, { files: true, pictures: false, carry: false })).catch(() => []); // its pictures as they are: only the charts are taken
        markdown = markdown.replace(/^.*\u0000C(\d+)\u0000.*$/gm, (line, at) => {
          const shot = shots[Number(at)];
          if (!shot) return "\u0000gone\u0000";
          const where = `${page.files}/${uniqueName(pageLanguage(source) === "en" ? (charted[Number(at)] ? "Chart.png" : "Figure.png") : charted[Number(at)] ? "图表.png" : "图.png", takenIn(page.files))}`; // in the page's language
          out.push({ name: where, data: shot, later: true });
          return line.replace(`\u0000C${at}\u0000`, () => relativeLink(page.file, where));
        }).replace(/\n*\u0000gone\u0000\n*/g, "\n\n").replace(/^\n+|\n+$/g, "");
      }
      out.push({ name: page.file, data: markdown });
    } else if (format === "html") {
      // Its links written before what it carries is (render/pipeline.mjs offlineReports' rewrite), which says the file as written.
      out.push({ name: page.file, data: await site.offline(page.slug, { files, rewrite: (html) => withLinks(page, html) }) });
    } else {
      // Its pictures as they are: the PDF writer encodes each again itself (a JPEG kept as it is, any other losslessly),
      // and a WebP copy made for the page made a PDF of eight screenshots 3.5 times heavier than their PNGs did (2026-11-17).
      out.push({ name: page.file, data: await pdfOf(withLinks(page, await site.offline(page.slug, { files, pictures: false, carry: false })), { paper, scale }) });
    }
  }
  for (const asset of assets) {
    const data = await fs.readFile(asset.from).catch(() => null); // a file gone from the folder: its link stays
    if (data) out.push({ name: asset.name, data });
  }
  const ordered = [...out.filter((file) => !file.later && pages.some((page) => page.file === file.name)), ...out.filter((file) => file.later || !pages.some((page) => page.file === file.name))];
  if (ordered.length === 1) return { name: ordered[0].name, type: TYPES[format], data: Buffer.isBuffer(ordered[0].data) ? ordered[0].data : Buffer.from(ordered[0].data, "utf8") };
  return { name: `${safeName(pages[0].title)}.zip`, type: "application/zip", data: createZip(ordered) };
}

/**
 * The `site` exportPage reads (above), as the workbench's export and gallery export both make it: the
 * titles of the pages (`titleOf`), the documents under a page in the sidebar's tree (`outline()`: the
 * workspace's { children, links }; a web link there is no page (no file to export), nor a draft of another
 * workspace (its file is that workspace's), the documents under either counted where it is), the
 * workspace's links, and the offline file and the check of a page (`render`: render/pipeline.mjs
 * offlineReports', its check(slug)), each after `ready(page)` (the hand-in a page is made after; it throws
 * what fails the export). `made` (a Map) gets, for each page made as an HTML or PDF file, the sha256 of the
 * doc.html it was made from, for gallery qa's baseline (src/cli/qa-baseline.mjs exportBaselines).
 */
export function exportSite({ reportsDirectory, titleOf, outline, render, format, ready = async () => {}, made = new Map() }) {
  return {
    reportsDirectory,
    titleOf,
    childrenOf: async (page) => {
      const { children, links = [] } = await outline();
      const under = (key) => (children[key] ?? []).flatMap((slug) => (links.includes(slug) || slug.startsWith("~") ? under(slug) : [slug]));
      return under(page);
    },
    links: () => documentLinks(reportsDirectory),
    offline: async (page, settings) => {
      await ready(page);
      const html = await render(page, settings);
      const from = format === "markdown" ? null : exportSourceOf(html);
      if (from) made.set(page, from);
      return html;
    },
    check: async (page) => {
      await ready(page);
      return render.check(page);
    },
  };
}

/** A document's title as doc.json says it (the slug when it says none or does not read): what an export names its files by. */
export const titleReader = (reportsDirectory) => async (slug) => {
  try {
    return JSON.parse(await fs.readFile(documentFiles(documentDirectory(slug, reportsDirectory)).json, "utf8")).title || slug;
  } catch {
    return slug;
  }
};

/** The documents under `slug` in the tree, at any depth, depth first (what `subpages` exports with it). */
export async function subpagesOf(site, slug) {
  const found = [];
  const walk = async (page) => {
    for (const child of await site.childrenOf(page)) {
      found.push(child);
      await walk(child);
    }
  };
  await walk(slug);
  return found;
}
