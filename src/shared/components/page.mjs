// The page: the report's main, its header (the page's icon above the title is a component of its
// own: icon.mjs), the asset tags, and the display settings the kit puts at the top right (ui.js: theme,
// width, an export of the current view).

/**
 * The language a report's file is written in, by its <html lang>: "en" for en or en-…, else "zh", the
 * rule the kit's own words follow in a file of its own (src/render/kit/words.js kitLanguage). The
 * kit's markup the editor writes into a file (a detail card's close button, a Sheet area's name: their
 * aria-label) is said in it.
 */
export function pageLanguage(html) {
  const tag = /<html\b[^>]*>/i.exec(String(html ?? ""))?.[0] ?? "";
  return /\slang\s*=\s*["']?en(?:-[^"'\s>]*)?(?=["'\s>]|$)/i.test(tag) ? "en" : "zh";
}

/**
 * A document's look on its <html> (字体与布局: its doc.json's look, which the render puts on and the kit's
 * tokens read; src/shared/document-look.mjs), the attribute of each choice. The 正文宽度's is
 * data-doc-measure (a column's measure, its line length); 全宽 (the top bar's 更多, under 目录) is
 * data-doc-width="full", the one attribute the kit's page, the editor's room and the display menu's
 * 全宽显示 (the reader's own switch in an export) all read: one way to be wide, not two. 宽表格 (under
 * 全宽) is data-doc-tables="wide", which the kit's tables (tables/across.js) and the display menu's switch of the
 * same name read; 宽多维表格 (under it) is data-doc-databases="wide", which the kit's databases (database/across.js) and
 * the display menu's switch of that name read.
 */
export const LOOK_ATTRIBUTES = Object.freeze({ font: "data-doc-font", size: "data-doc-size", spacing: "data-doc-spacing", width: "data-doc-measure", full: "data-doc-width", tables: "data-doc-tables", databases: "data-doc-databases" });

/**
 * The reader's own 宽表格 and 宽多维表格 chosen in an export's display menu (the kit's ui.js), on its <html> beside the
 * look's attribute: as the page's switch does, their choice sets every table (database), a block's own word in the
 * file (data-doc-wide: src/shared/table-across.mjs) aside.
 */
export const READER_WIDE = Object.freeze({ tables: "data-doc-reader-tables", databases: "data-doc-reader-databases" });

export default {
  id: "page",
  match: "main.doc-page",
  flow: ".doc-page",
  groups: false,
  header: "header.doc-header", // the title and the lines under it
  title: ".doc-title", // the document's title, the h1 of the header: its text, mirrored in <title> and report.json
  attrs: {
    "data-doc-id": "the document's slug: its reading state is kept under it",
    "data-doc-kit": "a kit asset's tag (the render puts in those a report needs; an older source writes them)",
    "data-doc-vendor": "a vendor library's tag",
    "data-doc-placeholder": "the starter's content, which the checks want replaced",
    "data-doc-transient-view": "its hidden or open shows transient reading state, reset in an export of the view",
    // The kit's tooltip (runtime/tip.js), on any element of a document or a card: never the browser's title.
    "data-doc-tip": "words the kit's tooltip shows while the pointer rests on the element",
    "data-doc-tip-sub": "a second, dimmer line under data-doc-tip's words",
    "data-doc-tip-cut": "the element's own text in the tooltip, only while it is cut short",
    // A block's own 宽表格 or 宽多维表格 (src/shared/table-across.mjs WIDE), one choice of the page's look (LOOK_ATTRIBUTES) made for one block.
    "data-doc-wide": "on or off, on a table's frame (.doc-table-wrap) or a database (div.doc-database) standing in the body: that block's own 宽表格 or 宽多维表格 over the page's (wider than the text, it goes past the text's edges, or stays in it)",
  },
  classes: ["doc-page", "doc-header", "doc-kicker", "doc-title", "doc-button"],
  runtime: {
    generated: [".doc-display", "script[data-doc-state]", ".doc-tip"],
    // data-doc-effective-theme: the theme the page shows now (ui.js), "light" or "dark", which a custom page's own colors go by.
    // data-doc-platform: "mac" on an Apple platform (runtime/index.js sets it as the page opens), the text's color and smoothing go by it; a copy of the view lets it go, its reader's machine judges anew.
    root: { attrs: ["data-doc-ready", "data-doc-drawn", "data-doc-controls", "data-doc-effective-theme", "data-doc-platform"] },
    // The reader's theme (ui.js) and the document's look (字体与布局 and 全宽: its doc.json's, put on by
    // the render, src/shared/document-look.mjs; the reader's own 全宽显示 is the same data-doc-width), which
    // a copy of the view keeps, and the reader's own 宽表格 and 宽多维表格 (READER_WIDE); never written in doc.html.
    state: { html: ["data-doc-theme", ...Object.values(LOOK_ATTRIBUTES), ...Object.values(READER_WIDE)] },
    internal: ["doc-display*", "data-doc-export-copy", "doc-copy-card*", "data-doc-copy", "data-doc-source", "data-theme", "doc-export-id", "doc-reveal", "doc-kit-error", "doc-net-consent*", "data-doc-snapshot", "doc-tip-*",
      // A consent bar on a card under 240px of content (runtime/net.js), its line over its button.
      "data-doc-net-narrow",
      // The time an export's snapshot was made (its data-doc-snapshot tag's: render/net-snapshot.mjs), which context.workspace.query answers as `at`.
      "data-at",
      // A custom page's (no document's: src/render/page-html.mjs, the kit's board/): its cards' cells, the Agent's
      // (data-x, data-y, data-w, data-h), their places in the board's narrow view (data-narrow-*, written as the
      // narrow view is arranged), and its boards' columns now (data-columns, board.js's).
      "data-x", "data-y", "data-w", "data-h", "data-narrow-x", "data-narrow-y", "data-narrow-w", "data-narrow-h", "data-columns"],
  },
};
