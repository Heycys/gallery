import { parentPort } from "node:worker_threads";
import { openReport } from "./dom.mjs";
import { fillReport, importFiles, importMarkdown } from "./import.mjs";
import { reportMarkdown } from "./markdown.mjs";
import { forgetCatalog } from "../shared/component-catalog.mjs";
import { saying } from "../shared/i18n/index.mjs";
import { referencedFile } from "../shared/media.mjs";

// The worker the import and the export convert in (jobs.mjs runs it): the page editor's modules want
// a document (jsdom, dom.mjs) and globals of their own, kept out of the server's process. A job is
// { id, type, payload }, answered { id, result } or { id, error } (its message, said()'s text and values
// when it carried them, its stack). A job reads the workspace's component packages as a command does,
// once and as they are then: the worker outlives a job and no watcher tells it of a change.

const FILE = (index) => `\u0000F${index}\u0000`;
const CHART = (index) => `\u0000C${index}\u0000`;

const JOBS = {
  /**
   * A report's Markdown ({ source, title, pictures }): its text with a mark where each file of the
   * report's folder is linked (FILE(i), `files[i]` { src, kind, name }) and, with `pictures`, where
   * each chart card's picture is (CHART(i), the i-th main figure.doc-figure). export.mjs puts in
   * the links.
   */
  async markdown({ source, title, pictures }) {
    const { document } = await openReport(source);
    const files = [];
    const cards = [...document.querySelectorAll("main figure.doc-figure")];
    const text = await reportMarkdown(document, {
      title,
      // A file of the report's folder by the file it is (./assets/x.png?v=2 is assets/x.png); any other address as it is.
      media: (src, kind, name) => {
        const file = referencedFile(src);
        return file ? FILE(files.push({ src: file, kind, name }) - 1) : src;
      },
      chart: (card) => (pictures && cards.includes(card) ? CHART(cards.indexOf(card)) : null),
    });
    // Which cards hold a chart (a picture named 图表), the others a drawing (图).
    return { text, files, charts: cards.length, charted: cards.map((card) => Boolean(card.querySelector("[data-doc-chart]"))) };
  },
  /** Files uploaded made pages ({ uploads: [{ file, name }], scratch }): import.mjs importFiles. */
  import: ({ uploads, scratch }) => importFiles(uploads, scratch),
  /** A Markdown file of the disk made a page ({ file, scratch }, gallery import: import.mjs importMarkdown, the pictures it links to beside it). */
  markdownFile: ({ file, scratch }) => importMarkdown(file, scratch),
  /** A whole document's words as gallery read writes them ({ source, slug, root, title }: read-view.mjs wholeReadings), for what an export carries (carry.mjs). */
  readings: async ({ source, slug, root, title }) => (await import("./read-view.mjs")).wholeReadings(source, { slug, root, title }),
  /** A new report with a page in it ({ source, nodes, icon, own }: an own report's page, { text }): import.mjs fillReport. */
  fill: (payload) => fillReport(payload),
};

parentPort.on("message", async ({ id, type, payload }) => {
  try {
    forgetCatalog();
    parentPort.postMessage({ id, result: await JOBS[type](payload) });
  } catch (error) {
    parentPort.postMessage({ id, error: { ...saying(error), stack: error.stack } });
  }
});
