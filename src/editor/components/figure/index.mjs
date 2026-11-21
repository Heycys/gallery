import { SPAN } from "../../../shared/media.mjs";
import { CHART_KEY } from "../../../shared/table-chart.mjs";
import { svg } from "../icons.mjs";
import { writtenCaption } from "../media/parts.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { boxed, dataRows, fenced, plainRow, scriptData } from "../read-rows.mjs";

// 图形 (a card, 卡片块): a card (figure.doc-figure) holding a figure, a chart or a drawing of the report's
// own (its HTML, CSS or SVG), its title and caption; the reader's word for it is 图形 (Figure), since
// 2026-11-20, and 卡片 is the cards of a custom page. One block: its title and caption are text
// blocks (fields), a chart is drawn by the report's own type (DocCharts.define, its data in its
// host's JSON or a table's rows), a drawing's words are words only (text: fixed in place, never
// split, source/blocks.mjs). Its width and chart height are sizes, and it may be centered.
//
// Where the engines reach it (src/editor/page/ unless named): resize/ (dragging its right and
// bottom edges: widthAt, heightAt), page.mjs (its block menu rows: 居中显示, 全宽显示,
// 恢复默认大小, 显示边框), history.mjs (charts are told a size changed: setLook), src/transfer/markdown.mjs
// (`clipboard`), ../source/ (finding its title and caption).
// Its look: the kit's styles/figure.css and chart.css, its chart drawn by charts/ (src/render/kit/).
export const CENTERED = "doc-figure--compact"; // 居中显示
export const PLAIN = "doc-figure--plain"; // no frame (显示边框 off): no line, no ground and no room inside it
export const CHART_HEIGHT = "--doc-chart-height";

// A chart drawn from a table names it by a key (src/shared/table-chart.mjs): a copy of a card or a
// table pasted on the page may get keys of its own (page/clipboard/own/chart-keys.mjs), which it
// holds as JSON ({ old: new | null }) until it is a unit of the file, and which go to the server with
// it (page/core.mjs nodeOf: { copy, keys }; source/text.mjs copiedSource writes them).
export const COPY_KEYS = "data-ge-chart-keys";

/**
 * A copy's keys as the page sends them, checked: { old: new | null }, each old one a key as the file
 * writes it, each new one a key the page made (t1, t2 …), or null when they are not that.
 */
export function copyKeys(keys) {
  if (!keys || typeof keys !== "object" || Array.isArray(keys)) return null;
  const entries = Object.entries(keys);
  return entries.length > 0 && entries.length <= 50 && entries.every(([from, to]) => from.length > 0 && from.length <= 200 && (to === null || (typeof to === "string" && CHART_KEY.test(to)))) ? keys : null;
}

// The parts of a card a page export writes, an empty line between them: its title in bold, the chart
// as an image (`chart`: its picture in the export, else none), its tables and a drawing's words when
// there is no picture of it, the pictures it holds, its caption.
function cardParts(unit, how) {
  const heading = unit.querySelector(":scope > h2, :scope > h3, :scope > h4");
  const parts = heading && how.plain(heading) ? [[`**${how.inline(how.serializeInner(heading))}**`]] : [];
  const link = how.chart(unit);
  const charted = Boolean(unit.querySelector("[data-doc-chart]"));
  if (link) parts.push([`![${how.plain(heading) || how.untitled(unit, charted)}](${link})`]);
  else {
    for (const inner of unit.querySelectorAll("table")) parts.push(how.writtenAs("table", inner));
    // No picture of it (复制页面内容, an export with no browser): a drawing of the report's own
    // says its words, as a whole block does (a chart's are its data, in its table or nowhere).
    const drawing = charted ? [] : [...unit.children].filter((child) => child !== heading && !child.matches("figcaption, .doc-figure-caption, p, table, .doc-table-wrap, .doc-table-meta, script, style, template"));
    const words = drawing.flatMap((part) => how.wordsIn(part, "text"));
    if (words.length) parts.push([words.join(" · ")]);
  }
  for (const picture of how.picturesIn(unit, { tables: false })) parts.push([picture]);
  const caption = writtenCaption(unit);
  const said = (caption ? how.inline(how.serializeInner(caption)) : "") || [...unit.querySelectorAll(":scope > p")].map((p) => how.inline(how.serializeInner(p))).filter(Boolean).join("\n\n");
  if (said) parts.push(said.split("\n"));
  return parts;
}

// ---------- gallery read (../read-rows.mjs) ----------

const CARD = "doc-figure"; // every card's class, the kit's look of it
const CHART = "data-doc-chart";
const CHART_DATA = "data-doc-chart-data";
const CHART_FROM = "data-doc-chart-source";
// The hosts of the charts a card draws (a table's own data-doc-chart is what the export makes into one).
const chartsIn = (card) => [...card.querySelectorAll(`[${CHART}]`)].filter((host) => host.localName !== "table");
// A card's parts: its title, its caption, its charts, its tables, its pictures and what else it holds (a drawing).
function cardPieces(card) {
  const heading = card.querySelector(":scope > h2, :scope > h3, :scope > h4");
  const caption = writtenCaption(card);
  const charts = chartsIn(card);
  const tables = [...card.querySelectorAll(":scope > table, :scope > .doc-table-wrap")];
  const taken = [heading, caption, ...charts, ...tables].filter(Boolean);
  const rest = [...card.children].filter((child) => !taken.includes(child) && !child.matches("script, style, template") && !taken.some((part) => part.contains(child)));
  return { heading, caption, charts, tables, pictures: rest.filter((child) => child.localName === "img"), drawing: rest.filter((child) => child.localName !== "img") };
}

// Boxed: its title as a heading, its caption, each chart (its type, and its data as the file has them or the
// table it is drawn from, by that table's line), its tables, its pictures, a drawing's words and its own HTML or SVG.
function readCard(node, view) {
  const { tools } = view;
  const { heading, caption, charts, tables, pictures, drawing } = cardPieces(node.el);
  const rows = [];
  if (heading) rows.push(plainRow(`${"#".repeat(Number(heading.localName[1]))} ${tools.own(heading) || "（空标题）"}`));
  if (caption && tools.own(caption)) rows.push(plainRow(`说明：${tools.own(caption)}`));
  for (const host of charts) {
    const type = host.getAttribute(CHART);
    const key = host.getAttribute(CHART_DATA);
    const looks = tools.looks(host, { skip: [CHART, CHART_DATA] });
    if (key) {
      const table = node.el.ownerDocument.querySelector(`[${CHART_FROM}="${key}"]`);
      const line = table ? tools.lineAt(table) : null;
      rows.push(plainRow(`图表 ${type}：画的是表格 ${key} 的行${line ? `（第 ${line} 行的表格）` : "（文档里没有这张表格）"}${looks}`));
    } else {
      const data = host.querySelector(':scope > script[type="application/json"]');
      rows.push(plainRow(`图表 ${type}${looks}${data ? "，数据：" : "，没有数据"}`), ...(data ? dataRows(data) : []));
    }
  }
  for (const table of tables) rows.push(...view.readAs("table", { el: table, line: null, id: null, children: [] }).map((row) => ({ ...row, line: null, id: null, node: null })));
  for (const img of pictures) rows.push(plainRow(tools.picture(img)));
  if (drawing.length) {
    const said = drawing.flatMap((part) => tools.wordsIn(part, "text"));
    if (said.length) rows.push(plainRow(`文字：${said.join(" · ")}`));
    const lines = drawing.flatMap((part) => tools.source(part) ?? [part.outerHTML]);
    rows.push(plainRow(`画法（页面自己的 ${drawing.some((part) => part.localName === "svg") ? "SVG" : "HTML"}，${lines.length} 行，文件里的原样）：`), ...fenced("html", lines));
  }
  const kind = charts.length ? `图表 ${charts.map((host) => host.getAttribute(CHART)).join("、")}` : drawing.length ? "图" : tables.length ? "表格" : "空的";
  return boxed(node, `图形 · ${kind}${tools.looks(node.el, { drop: [CARD] })}`, rows);
}

export default {
  name: "figure",
  glance: [
    { row: 20, name: "图表", write: "a card holding `<div data-doc-chart=\"type\">` with its data as JSON, the type defined with `DocCharts.define`; or `<table data-doc-chart=\"type\">`, drawn from its rows", after: "for the table: its frame, then a card after it, its caption the card's `h3`", rule: "Figures and charts" },
    { row: 21, name: "图 (示意图、时间线)", write: "`figure.doc-figure` holding your own HTML or SVG", rule: "Figures and charts" },
  ],
  units: {
    figure: {
      name: t("图形"),
      icon: svg('<path d="M4 4.5V14a1.5 1.5 0 0 0 1.5 1.5H16"/><path d="m7 12 2.7-3.2 2.3 1.8 3.5-4.1"/>'), // the owner's pick of 2026-11-17 (a line chart on its two axes)
      match: [{ rank: 50, tag: "figure" }],
      boxed: true,
      resizable: "figure[data-ge-unit]", // its right and bottom edges, once it is in the file
      toggles: [CENTERED, PLAIN], // 居中显示, 显示边框 (off)
      sizes: {
        [SPAN]: { min: 0.15, max: 1 },
        [CHART_HEIGHT]: { min: 120, max: 2000, px: true, height: true },
      },
      clipboard: { kind: "parts", read: cardParts, unsaid: "[data-doc-chart]" }, // copied as itself; a chart's data are no words of it
      read: {
        name: "图形",
        label: (node) => (chartsIn(node.el).length ? "图形（图表）" : "图形"),
        rows: readCard,
        words(node, { tools }) {
          const { heading, caption, drawing } = cardPieces(node.el);
          return [tools.plain(heading), drawing.flatMap((part) => tools.wordsIn(part, "text")).join(" · "), tools.plain(caption)];
        },
        data(node, { tools }) {
          const { heading, caption } = cardPieces(node.el);
          return {
            title: tools.plain(heading) || null,
            caption: tools.plain(caption) || null,
            charts: chartsIn(node.el).map((host) => {
              const script = host.querySelector(':scope > script[type="application/json"]');
              return { type: host.getAttribute(CHART), from: host.getAttribute(CHART_DATA), ...(script ? { data: scriptData(script) } : {}) };
            }),
          };
        },
        lost: (node) => (chartsIn(node.el).length ? "图表 {n} 个（只有标题和说明，数据和画法没有）" : "图 {n} 个（只有文字）"),
      },
    },
  },
  attributes: ["data-doc-chart"], // a declared chart (charts/): its type, then what it draws
  hosts: {
    // A card's title and caption, and the spans of a table's scope line.
    field: { name: t("图形标题和说明"), caps: ({ bound }) => bound ? ["links"] : ["remove", "links"] },
  },
};
