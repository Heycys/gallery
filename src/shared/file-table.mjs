import { parse } from "parse5";
import { BODY } from "./components/index.mjs";
import { attr, elementsOf, walk } from "./html-tree.mjs";
import { decoded, pageAddress } from "./page-address.mjs";
import { CHART_SOURCE, cellWords, tableRows } from "./table-chart.mjs";

// A table of a document's file read as the kit reads it on a page (render/kit/runtime/table-reading.js:
// a chart drawn from a table, a view's context.table(), a package's context.rows): its header's words and
// data-sort-type, its rows of data in the file's order, each cell's words and sort value
// (shared/table-chart.mjs), whether a cell spans others; and, by a key (data-doc-chart-source on its
// frame), its rows as a block reads them, { values, links }. The checks read a chart's table so
// (render/chart-declarations.mjs), and the workspace's facts a table another document names
// (workspace.query("table"): src/workbench/index.mjs). Of parse5's tree; no DOM.

const textOf = (node) => (node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(textOf).join(""));
const cellsOf = (row) => elementsOf(row).filter((cell) => cell.tagName === "td" || cell.tagName === "th");
const spans = (cell) => ["rowspan", "colspan"].some((name) => {
  const value = Number.parseInt(attr(cell, name) ?? "1", 10);
  return Number.isFinite(value) && value !== 1;
});

// Its groups, its header row (its head's first row, else a first row of its body all header cells; null
// for neither) and its body's rows after that, never a <tfoot>'s.
function tableParts(table) {
  const groups = elementsOf(table);
  const rowsOf = (group) => elementsOf(group).filter((row) => row.tagName === "tr");
  const head = groups.find((group) => group.tagName === "thead");
  let header = head ? rowsOf(head)[0] ?? null : null;
  let rows = groups.filter((group) => group.tagName === "tbody").flatMap(rowsOf);
  if (!header && rows.length > 0 && cellsOf(rows[0]).length > 0 && cellsOf(rows[0]).every((cell) => cell.tagName === "th")) [header, ...rows] = rows;
  return { groups, rowsOf, header, rows };
}

/**
 * What a table of the file holds for a chart (tableRows' `table`), as the kit reads it in the page
 * (charts/from-table.js tableCells): its header row's words (its head's first row, else a first row
 * of header cells alone; null for neither) and its header cells' data-sort-type, its rows of data,
 * each cell's words and sort value (data-sort-value, or null), the first words of its <tfoot>'s rows
 * (`foot`, which no chart reads: the readings say they were left out), and whether a cell of them
 * spans rows or columns (a cell's words cellWords', a formula's its TeX).
 */
export function tableCells(table) {
  const { groups, rowsOf, header, rows } = tableParts(table);
  const words = (cell) => cellWords(textOf(cell));
  return {
    names: header ? cellsOf(header).map(words) : null,
    types: header ? cellsOf(header).map((cell) => attr(cell, "data-sort-type") ?? null) : null,
    rows: rows.map((row) => cellsOf(row).map((cell) => ({ words: words(cell), sort: attr(cell, "data-sort-value")?.trim() ?? null }))),
    foot: groups.filter((group) => group.tagName === "tfoot").flatMap(rowsOf).map((row) => (cellsOf(row)[0] ? words(cellsOf(row)[0]) : "")),
    merged: [header, ...rows].some((row) => row && cellsOf(row).some(spans)),
  };
}

// The links a row's cells hold to documents of the workspace, as a file writes them (shared/page-address.mjs):
// another's ../<slug>/doc.html, with #<block id> for a block, and #<block id> for one of this document (`own`).
function linksOf(row, own) {
  const links = [];
  walk(row, (node) => {
    if (node.tagName !== "a") return;
    const href = (attr(node, "href") ?? "").trim();
    if (!href) return;
    const place = href.startsWith("#") && href.length > 1 ? (own ? { slug: own, block: decoded(href.slice(1)) } : null) : pageAddress(href);
    if (place) links.push({ slug: place.slug, title: cellWords(textOf(node)), block: place.block ?? null });
  });
  return links;
}

/**
 * The table of a document's `text` (its page's HTML, as its pages see it) that `key` names, the first
 * frame carrying it as data-doc-chart-source (the one the kit and gallery check read; none a <template>
 * holds, nor the own region of an instance), its rows as a block reads them: { columns, rows: [{ values,
 * links, words }] }, `values` by the header's words (cellValue: a number, its words or null; of two names
 * alike the later column's), `links` those its cells hold to documents (`own`: the document's slug, which
 * a link within it names), `words` each column's words as written (what a filter matches); or { error }:
 * "missing" (no table carries it) or "merged" (a cell spans others: a value has one cell).
 */
export function keyedTable(text, key, own = null) {
  let table = null;
  walk(parse(String(text)), (node) => {
    if (table !== null || attr(node, CHART_SOURCE) !== key) return;
    table = node.tagName === "table" ? node : elementsOf(node).find((child) => child.tagName === "table") ?? false;
  }, { ...BODY, inTemplates: false });
  if (!table) return { error: "missing" };
  const cells = tableCells(table);
  const read = tableRows(cells);
  if (read.error) return { error: "merged" };
  const { header, rows } = tableParts(table);
  const dataRows = header ? rows : rows.slice(1);
  const dataCells = cells.names ? cells.rows : cells.rows.slice(1);
  const names = read.data.columns;
  return {
    columns: [...names],
    rows: read.data.map((values, at) => {
      const words = {};
      names.forEach((name, column) => {
        words[name] = dataCells[at][column]?.words ?? "";
      });
      return { values: { ...values }, links: linksOf(dataRows[at], own), words };
    }),
  };
}
