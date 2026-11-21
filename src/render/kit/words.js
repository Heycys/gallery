import { FLOW_LABEL } from "../../shared/components/list.mjs";

// The kit's own words (docs/render.md, "The kit's words"): what its chrome says to a reader (a
// button's or a control's label, an empty code block's title, a chart's line of why it drew
// nothing), in Chinese and in English. A report's own words are never translated; these are the
// kit's alone. Which language a page reads them in (kitLanguage):
//
//   - shown by Gallery (the page edited, previewed, presented, the workbench's), the UI's: Gallery
//     puts it on the root as data-ge-language ("zh" or "en") before the kit draws anything
//     (src/shared/i18n/index.mjs languageScript, which the preview server writes in the page's head);
//     an export of the view takes every data-ge-* attribute off (ui.js), so none travels;
//   - in a file of its own (an export), the page's own lang: English for lang="en" (or "en-…"),
//     Chinese for any other or none.
//
// The table is in parts, one for each bundle that speaks (runtime, code, ui, tables, charts), so each
// carries its own words alone; a script says one with its part's say (sayCode("copy-code"), its {0},
// {1}… filled in from what follows). A stylesheet shows one as var(--doc-word-<key>), a property of the
// root that kit-build.mjs writes from the table for the words STYLE_WORDS lists (wordsCss): Chinese
// by default, English under the same rule as kitLanguage's.

// runtime/: an instance of no component package (kernel.js) and what a script of data in one holds (shown-data.js), a picture opened large (zoom.js: the viewer's name, and what a picture that opens says it does), a flowchart the author named nothing (flowchart.js; the
// page editor knows either name as the kit's: isFlowLabel), a block online waiting for the reader's consent (net.js).
const RUNTIME = {
  "component-missing": { zh: "自定义块 {0} 不在这个工作区里，这里只显示它的内容。", en: "The custom block {0} is not in this workspace: only what it holds is shown." },
  "component-broken": { zh: "自定义块 {0} 没有加载，这里只显示它的内容。原因：{1}", en: "The custom block {0} did not load: only what it holds is shown. Why: {1}" },
  "component-silent": { zh: "自定义块 {0} 的脚本没有启动它，这里只显示它的内容：看控制台里的错误。", en: "The script of the custom block {0} did not start it: only what it holds is shown. See the console for the error." },
  "value-true": { zh: "是", en: "Yes" },
  "value-false": { zh: "否", en: "No" },
  "value-empty": { zh: "（空）", en: "(empty)" },
  "value-deeper": { zh: "（{0} 项，没有展开）", en: "(not shown: {0} in it)" },
  "value-more": { zh: "还有 {0} 项没有显示", en: "{0} more not shown" },
  "rows-more": { zh: "还有 {0} 行没有显示", en: "{0} more rows not shown" },
  "columns-more": { zh: "还有 {0} 列没有显示", en: "{0} more columns not shown" },
  "not-json": { zh: "这段数据不是 JSON：{0}", en: "This data is not JSON: {0}" },
  "view-image": { zh: "查看图片", en: "Image viewer" },
  "open-image": { zh: "放大查看图片", en: "View the image larger" },
  "open-image-named": { zh: "放大查看：{0}", en: "View larger: {0}" },
  "close": { zh: "关闭", en: "Close" },
  "flowchart": FLOW_LABEL,
  // net.js: a block whose fetch waits for the reader's consent, its bar's line and its button.
  "net-why": { zh: "这个块要联网才能显示内容", en: "This block needs the internet to show its content" },
  // On a card a reader reads: what letting it online brings, never the maintainers' 块 (a block's manifest may say its own: card.consent).
  "net-card-why": { zh: "允许联网之后显示内容", en: "Allow internet access to show this" },
  "net-allow": { zh: "允许访问 {0}", en: "Allow {0}" },
  "net-allow-many": { zh: "允许访问 {0} 等 {1} 个网站", en: "Allow {0} and others ({1} sites)" },
  // On a card of a custom page: the button's words alone, and a line under the why saying whose the data is.
  "net-allow-short": { zh: "允许访问", en: "Allow" },
  "net-from": { zh: "数据来自 {0}", en: "From {0}" },
  "net-from-many": { zh: "数据来自 {0} 等 {1} 个网站", en: "From {0} and others ({1} sites)" },
};

// code.js: an empty code block's title (styles/code.css), its header's controls, its language when
// it has none, an excerpt's range of lines, a diff's counts.
const CODE = {
  "code-title": { zh: "代码块", en: "Code" },
  "plain-text": { zh: "纯文本", en: "Plain text" },
  "fold-code": { zh: "折叠或展开代码块", en: "Collapse or expand the code block" },
  "copy-code": { zh: "复制代码", en: "Copy code" },
  "copied": { zh: "已复制", en: "Copied" },
  "copy-failed": { zh: "复制失败", en: "Couldn't copy" },
  "wrap": { zh: "自动换行", en: "Wrap lines" },
  "no-wrap": { zh: "取消自动换行", en: "Stop wrapping lines" },
  "fold": { zh: "折叠", en: "Collapse" },
  "unfold": { zh: "展开", en: "Expand" },
  "line": { zh: "第 {0} 行", en: "Line {0}" },
  "lines": { zh: "第 {0}–{1} 行", en: "Lines {0}–{1}" },
  "diff-counts": { zh: "新增 {0} 行，删除 {1} 行", en: "Lines added: {0}, removed: {1}" },
};

// ui.js: the reader's display settings.
const DISPLAY = {
  "display": { zh: "显示设置", en: "Display settings" },
  "display-menu": { zh: "文档显示设置", en: "Document display settings" },
  "copy-text": { zh: "复制为完整文本", en: "Copy as plain text" },
  "copy-markdown": { zh: "复制为 Markdown", en: "Copy as Markdown" },
  "copy-done": { zh: "已复制", en: "Copied" },
  "copy-retry": { zh: "复制失败，点击重试", en: "Copy failed: click to retry" },
  "copy-by-hand": { zh: "浏览器不让页面写剪贴板：文字已选中，按 {0} 复制", en: "The browser keeps this page from the clipboard: the text is selected, press {0} to copy it" },
  "copy-card-close": { zh: "关闭", en: "Close" },
  "appearance": { zh: "外观", en: "Appearance" },
  "theme-system": { zh: "跟随系统", en: "Use system setting" },
  "theme-light": { zh: "浅色", en: "Light" },
  "theme-dark": { zh: "深色", en: "Dark" },
  "full-width": { zh: "全宽显示", en: "Full width" },
  "wide-tables": { zh: "宽表格", en: "Wide tables" },
  "export-view": { zh: "导出当前视图副本", en: "Export a copy of this view" },
  "export-failed": { zh: "导出失败，点击重试", en: "Export failed: click to retry" },
  "html-file": { zh: "HTML 文件", en: "HTML file" },
};

// tables/sort.js: a sortable table's headers and its status line.
const TABLES = {
  "sort-ascending": { zh: "{0}：点击按升序排序", en: "{0}: click to sort ascending" },
  "sorted-ascending": { zh: "{0}：当前升序，点击改为降序", en: "{0}: sorted ascending, click to sort descending" },
  "sorted-descending": { zh: "{0}：当前降序，点击取消排序", en: "{0}: sorted descending, click to clear the sort" },
  "status-ascending": { zh: "当前排序：{0} · 升序", en: "Sorted by {0} · ascending" },
  "status-descending": { zh: "当前排序：{0} · 降序", en: "Sorted by {0} · descending" },
  "original-order": { zh: "原始顺序", en: "Original order" },
};

// charts/: why a chart drawn from a table drew nothing, the line in its card (from-table.js; the
// reason a table gives none is src/shared/table-chart.mjs's, by its key).
const CHARTS = {
  "table-gone": { zh: "这张图的数据表格不在页面上了。", en: "This chart's data table is no longer on the page." },
  "merged-cells": { zh: "数据表格有合并的单元格，画不出这张图。", en: "The data table has merged cells, so this chart can't be drawn." },
};

// styles/todo.css: what a to-do item's box says to a screen reader (its alt text): no script says these, the stylesheet does.
const LISTS = {
  "todo-open": { zh: "未完成", en: "Not done" },
  "todo-done": { zh: "已完成", en: "Done" },
};

// styles/math.css: a formula KaTeX could not read, as the reader sees it (math.js marks it; the page editor
// shows the same bar and chip, in the UI's words: src/editor/components/placeholder.mjs). The stylesheet says it.
const MATH = {
  "math-invalid": { zh: "无效的公式", en: "Invalid equation" },
};

/** Every word of the kit's, by part and key (the tests, the stylesheet's words). */
export const kitWords = () => ({ runtime: RUNTIME, code: CODE, display: DISPLAY, tables: TABLES, charts: CHARTS, lists: LISTS, math: MATH });
/** The languages the kit speaks; the first is the one a page reads unless it is told English. */
export const KIT_LANGUAGES = ["zh", "en"];
/** The root's attribute through which Gallery tells the kit the UI's language (never in a file). */
export const UI_LANGUAGE = "data-ge-language";
/** The words a stylesheet shows, of the code, lists and math parts: each by its key, the root's property it reads (var(--doc-word-…)). */
export const STYLE_WORDS = { "code-title": "--doc-word-code-title", "todo-open": "--doc-word-todo-open", "todo-done": "--doc-word-todo-done", "math-invalid": "--doc-word-math-invalid" };

/**
 * The language the kit speaks on a page whose root is `root`: the UI's when Gallery said it
 * (data-ge-language), else English for a page whose lang is en or en-…, else Chinese.
 */
export function kitLanguage(root = globalThis.document?.documentElement) {
  const ui = root?.getAttribute(UI_LANGUAGE) ?? null;
  const english = ui !== null ? ui === "en" : /^en(?:-|$)/i.test(root?.getAttribute("lang") ?? "");
  return english ? "en" : "zh";
}

/** A word of a part (`table`) in `language`, its {0}, {1}… filled with `values`. */
export function wordIn(table, language, key, ...values) {
  const entry = table[key];
  if (!entry) throw new Error(`The kit has no word "${key}" here (src/render/kit/words.js).`);
  const text = entry[language] ?? entry.zh;
  return values.length === 0 ? text : text.replace(/\{(\d+)\}/g, (whole, index) => (index < values.length ? String(values[index]) : whole));
}

// A part's say: its word in the language of the page it is on. Pure, so a bundle keeps only the
// parts it says words of.
const sayer = (table) => (key, ...values) => wordIn(table, kitLanguage(), key, ...values);
export const sayRuntime = /* @__PURE__ */ sayer(RUNTIME);
export const sayCode = /* @__PURE__ */ sayer(CODE);
export const sayDisplay = /* @__PURE__ */ sayer(DISPLAY);
export const sayTables = /* @__PURE__ */ sayer(TABLES);
export const sayCharts = /* @__PURE__ */ sayer(CHARTS);

// The same rule as kitLanguage's, as selectors of the root.
const ENGLISH_ROOT = `:root[${UI_LANGUAGE}="en"], :root:not([${UI_LANGUAGE}])[lang|="en" i]`;

/** The stylesheet's words (STYLE_WORDS) as properties of the root: Chinese, then English where kitLanguage says so. */
export function wordsCss() {
  const properties = (language) => Object.entries(STYLE_WORDS).map(([key, property]) => `${property}: ${JSON.stringify(wordIn({ ...CODE, ...LISTS, ...MATH }, language, key))};`).join(" ");
  return `:root { ${properties("zh")} }\n${ENGLISH_ROOT} { ${properties("en")} }`;
}
