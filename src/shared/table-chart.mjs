import { ZWSP } from "./inline-spacing.mjs";
import { isMissingValue, numberReading } from "./number-reading.mjs";

// A chart drawn from a table (docs/render.md, "Charts from a table"). An Agent writes an ordinary
// table with data-doc-chart="<type>", a type its report's script defines (DocCharts.define); the
// intake (src/editor/source/natural.mjs) makes it two blocks, the table's frame, which carries a key
// (CHART_SOURCE), and right after it a chart card whose host names the table by that key
// (CHART_DATA). The kit (src/render/kit/charts/from-table.js) reads the table as the page shows it and
// draws the chart again when the table changes; the checks (src/render/chart-declarations.mjs) read it
// from the file. Both take the rows a table gives a chart from here (tableRows): plain, predictable,
// d3.csvParse's shape, each value read as the table's own sort reads it (number-reading.mjs). The
// link is that pair of attributes alone, never an id or the blocks' order, so the reader may move,
// copy or delete either block (a copied pair takes a key of its own:
// src/editor/page/clipboard/own/chart-keys.mjs, and the commit makes sure of it against the file:
// src/editor/source/chart-keys.mjs).
//
// A view of a table (a task board, a count, a chart card of a custom block's) is the same
// link: an instance of a custom block whose manifest's needs hold "tables" names the table by that key
// (VIEW_FROM), reads its rows as a chart does (the kit's runtime/table-reading.js, context.table()) and
// changes them only by asking the page editor (an intent: docs/editor.md, "Table views"). A key is one
// table's, which any number of charts and views read: TABLE_READERS are the attributes that read one.

/** On a chart's host: the key of the table it draws. */
export const CHART_DATA = "data-doc-chart-data";
/** On a table's frame (.doc-table-wrap): the key a chart reads it by. */
export const CHART_SOURCE = "data-doc-chart-source";
/** On an instance of a custom block whose needs hold "tables": the key of the table it is a view of (context.table()). */
export const VIEW_FROM = "data-doc-from";
/** The attributes that name a table by its key, a chart's host's and a view's. */
export const TABLE_READERS = [CHART_DATA, VIEW_FROM];
/** A key: a letter, then letters, digits, "_" or "-", 32 at most. */
export const CHART_KEY = /^[A-Za-z][\w-]{0,31}$/;

/** The first key of t1, t2 … that `taken` (a Set) does not hold. */
export function nextChartKey(taken) {
  for (let index = 1; ; index++) if (!taken.has(`t${index}`)) return `t${index}`;
}

// A formula in a cell's text as the file writes it (and the page, before KaTeX draws it): its TeX
// between \( \), \[ \] or $$ $$.
const FORMULA = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$/g;

/**
 * A cell's words as a chart reads them, from the file (the checks) and from the page (the kit) alike:
 * `text` its text, where a formula is its TeX (written between its delimiters in the file; the kit
 * reads one KaTeX drew by its TeX: charts/from-table.js), the editor's zero-width pads none, blanks
 * one space, none at either end.
 */
export const cellWords = (text) => text.replace(FORMULA, (_, inline, display, dollars) => inline ?? display ?? dollars).replaceAll(ZWSP, "").replace(/\s+/g, " ").trim();

// A formula KaTeX drew on a page: its TeX is its annotation (its drawing's text is its glyphs, twice over).
const TEX = 'annotation[encoding="application/x-tex"]';

/**
 * A cell's text on a page as the file writes it, as near as the page tells: a formula KaTeX drew as its
 * TeX, the editor's chip of an empty one as nothing (the file's \(\)). Its words are then cellWords'.
 * For the kit, which reads a table on a page (runtime/table-reading.js: a chart's, a view's and a package's rows).
 * @param {Node} node
 * @returns {string}
 */
export function cellText(node) {
  if (node.nodeType === 3) return /** @type {Text} */ (node).data;
  if (node.nodeType !== 1) return "";
  const element = /** @type {Element} */ (node);
  if (element.hasAttribute("data-ge-empty")) return "";
  const tex = element.classList.contains("katex") ? element.querySelector(TEX) : null;
  if (tex) return tex.textContent ?? "";
  let text = "";
  for (const child of element.childNodes) text += cellText(child);
  return text;
}

// A header's data-sort-type that says its column holds no numbers: its values are its words.
const WORD_TYPES = new Set(["text", "date"]);

/**
 * A cell's value for a chart (`cell`: { words, sort }, undefined where its row has none; `type`: its
 * header's data-sort-type), as the table's sort reads it (number-reading.mjs, rawCellValue): its sort
 * value when it has one, else its words; null for none (no cell, an empty one, a dash, n/a); its words
 * in a column its header says holds words or dates; the number they write when they write one (12.5%
 * 12.5, 3.6亿 360000000, 1,234 1234, (12) -12, 约 20 20, 120 ms 120); else its words (a range, 3–5 天,
 * which a sort reads by its first number, is no one number: its words; so is 3 / 4).
 */
export function cellValue(cell, type = null) {
  if (!cell) return null;
  const raw = cell.sort ?? cell.words;
  if (isMissingValue(raw)) return null;
  if (WORD_TYPES.has(type)) return cell.words;
  const reading = numberReading(raw);
  return reading && !reading.range ? reading.value : cell.words;
}

/**
 * The rows a table gives a chart drawn from it: { data } or, when it gives none, { error, message }
 * (`error` for a check and the host's layout note, `message` the card's line for its reader, as the
 * kit's words name it: [key, ...values], said in the page's language by src/render/kit/words.js).
 * `table`: { names, types, rows, merged }: its header row's words (its head's first row, else a first
 * row of header cells alone; null when it has neither), its header cells' data-sort-type (null where
 * none), its rows of data in the file's order (never a <tfoot>'s), each cell { words, sort } (its
 * words, cellWords', and its data-sort-value, or null), and whether a cell of the header or the rows
 * spans rows or columns (runtime/table-reading.js readTable reads it from the page,
 * chart-declarations.mjs tableCells from the file).
 *
 * `data` is what d3.csvParse gives: an object for each row of data, in their order, its values by
 * the header's words (cellValue: a number, its words, or null; a row shorter than the header null
 * where it has no cell, the cells past the header not read), and `data.columns` the header's words in
 * order. With no header row the first row is the header, as csvParse takes it; a header cell with no
 * words is the key "", and of two alike the later column's value is the one kept (the checks note
 * both: rowsReading). Merged cells give nothing: a value has one cell.
 */
export function tableRows(table) {
  const fail = (error, ...message) => ({ error, message });
  if (table.merged) return fail("has merged cells: write each value in its own cell, the category on every row", "merged-cells");
  let { names, types, rows } = table;
  if (!names) [names, types, rows] = rows.length > 0 ? [rows[0].map((cell) => cell?.words ?? ""), null, rows.slice(1)] : [[], null, []];
  const data = rows.map((row) => {
    const values = {};
    names.forEach((name, column) => {
      values[name] = cellValue(row[column], types?.[column] ?? null);
    });
    return values;
  });
  data.columns = [...names];
  return { data };
}

/**
 * What a table gave a chart (`table` as tableRows takes it, plus `foot`, its <tfoot>'s rows, which no
 * chart reads; `data`: tableRows' rows), for the checks to say (chart-declarations.mjs
 * tableChartReadings, chartDeclarationNotes): { rows: how many, columns: [{ name, numbers, words,
 * empty }] how many of its values are numbers, words and null, column by column in the header's
 * order (a name the header gives twice once: its later column's), blank: whether a header cell has no
 * words, twice: the names the header gives twice, foot: how many <tfoot> rows were left out, extra:
 * how many rows have cells past the header (not read) }.
 */
export function rowsReading(table, data) {
  const names = data.columns;
  const twice = [...new Set(names.filter((name, at) => names.indexOf(name) !== at))];
  const columns = [...new Set(names)].map((name) => {
    const values = data.map((row) => row[name]);
    return { name, numbers: values.filter((value) => typeof value === "number").length, words: values.filter((value) => typeof value === "string").length, empty: values.filter((value) => value === null).length };
  });
  const rows = table.names ? table.rows : table.rows.slice(1);
  return { rows: data.length, columns, blank: names.includes(""), twice, foot: table.foot?.length ?? 0, extra: rows.filter((row) => row.length > names.length).length };
}
