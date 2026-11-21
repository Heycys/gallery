// Reading a table (docs/render.md, "Table layout internals"): its rows, a cell's text and its value
// (a sort value, a number with its unit, a date, a missing value), and which columns are numeric
// (shown as such, .number, and sorted by number). What counts as a number or as a missing value is
// src/shared/number-reading.mjs, which the page editor reads cells by too.

import { isMissingValue, numericParts, parsedValue, rawCellValue } from "../../../shared/number-reading.mjs";

export function elementFor(target) {
  const element = typeof target === "string" ? document.querySelector(target) : target;
  if (!(element instanceof HTMLTableElement)) {
    throw new Error("DocTables target must be a table element.");
  }
  return element;
}

/** A table's frame (.doc-table-wrap), or null when it has none. */
export const wrapperOf = (table) => (table.parentElement?.classList.contains("doc-table-wrap") ? table.parentElement : null);

/**
 * Whether a table reads none of its columns as numbers (data-number-columns="off" on it or on its
 * frame: the page editor's 识别数字列 off): none centered, none sorted by number.
 */
export const numbersOff = (table) => table.getAttribute("data-number-columns") === "off"
  || wrapperOf(table)?.getAttribute("data-number-columns") === "off";

/**
 * Whether a table has merged cells in its header or body, the rows its columns are read from (a
 * footer's do not matter): then a header cell is not one column's, so its rows cannot be sorted,
 * nor its columns read as numbers (and layout.js leaves it to the browser).
 */
export const mergedCells = (table) => [...(table.tHead?.rows || []), ...Array.from(table.tBodies).flatMap((body) => [...body.rows])]
  .some((row) => Array.from(row.cells).some((cell) => cell.rowSpan !== 1 || cell.colSpan !== 1));

export function tableRows(table) {
  return Array.from(table.tBodies).flatMap((body) => Array.from(body.rows));
}

/**
 * A table's footer rows (its <tfoot>: a total), which no column is read by (nor sorted: sort.js
 * moves the body's rows), laid out with the body's (layout.js).
 */
export const footRows = (table) => Array.from(table.tFoot?.rows || []);

// A footer's cells by the column each stands in (a cell spanning columns in none: it is no one
// column's); none when a cell of it spans rows.
function footColumns(table) {
  const columns = new Map();
  const rows = footRows(table);
  if (rows.some((row) => Array.from(row.cells).some((cell) => cell.rowSpan !== 1))) return columns;
  for (const row of rows) {
    let column = 0;
    for (const cell of row.cells) {
      if (cell.colSpan === 1) columns.set(column, [...(columns.get(column) || []), cell]);
      column += cell.colSpan;
    }
  }
  return columns;
}

export function cellText(cell) {
  return cell.textContent.trim(); // a sort control holds no text (sort.js)
}

// Inline code in a cell breaks only after a slash or at a space (styles/table.css), and a run wider
// than its column between its names too (NAME_BREAK below): its text in runs, each a span kept on
// one line (.doc-code-run), a <wbr> after each slash, its spaces left between them as written. A run ends after its slashes, and slashes before a name are its start
// (/__local/ is one run: no line ends with a slash alone). As the page renders: never in a cell the
// page editor edits, and code holding elements of its own (a link) stays as written. An export of
// the current view joins the runs again (joinCodeRuns, index.js's dehydrate).
const RUN = /\/*[^\s/]+\/*|\/+|\s+/g;
export const CODE_RUN = "doc-code-run";
// Inside a run, where it may break when it is wider than its column (data-run-wrap, styles/table.css,
// where the run itself is no longer kept on one line): after a dot, before underscores, where a
// lowercase letter or a digit meets a capital (window.|__demo, request|Animation|Frame,
// NODE|_ENV), each a <wbr>, so such a run breaks between its names rather than inside one. A run
// kept on one line (white-space: nowrap) breaks at none of them.
const NAME_BREAK = /(?<=[^.\s]\.)(?=[^.])|(?<=[^_./\s])(?=_+[A-Za-z0-9])|(?<=[a-z0-9])(?=[A-Z])/;

/** The runs of code `text` is drawn in (its spaces between them): what the layout measures (layout.js). */
export const codeRuns = (text) => text.match(RUN) ?? [];
/** The parts of a run of code between the places it may break when wider than its column. */
export const runParts = (run) => run.split(NAME_BREAK);

/** The inline code of `table`'s cells in runs (none twice). */
export function splitCodeRuns(table) {
  for (const code of table.querySelectorAll("td code, th code")) {
    if (code.closest("[contenteditable]") || code.querySelector(`.${CODE_RUN}`) || !code.textContent.trim()
      || [...code.childNodes].some((node) => node.nodeType !== Node.TEXT_NODE)) continue;
    const doc = code.ownerDocument;
    const pieces = codeRuns(code.textContent);
    code.replaceChildren(...pieces.flatMap((piece, index) => {
      if (!piece.trim()) return [doc.createTextNode(piece)];
      const run = doc.createElement("span");
      run.className = CODE_RUN;
      run.replaceChildren(...runParts(piece).flatMap((part, at) => (at ? [doc.createElement("wbr"), doc.createTextNode(part)] : [doc.createTextNode(part)])));
      return piece.endsWith("/") && index < pieces.length - 1 ? [run, doc.createElement("wbr")] : [run];
    }));
  }
}

/** The runs splitCodeRuns made in `root` joined again: each code element's text as written. */
export function joinCodeRuns(root) {
  for (const code of new Set([...root.querySelectorAll(`.${CODE_RUN}`)].map((run) => run.parentElement))) code.textContent = code.textContent;
}

const TEXT_SORTS = new Set(["text", "date"]);

export function inferColumnSemantics(table) {
  const headers = Array.from(table.tHead?.rows[0]?.cells || []);
  const rows = tableRows(table);
  // Merged cells, or its numeric columns not to be read: no column is read as numbers (what an
  // earlier reading marked goes, its header row taken away since too).
  if (mergedCells(table) || numbersOff(table)) {
    table.querySelectorAll(".number").forEach((cell) => cell.classList.remove("number"));
    headers.forEach((header) => { if (header.dataset.sortType === "number") delete header.dataset.sortType; });
    return [];
  }
  if (headers.length === 0 || rows.length === 0) return [];

  const numericColumns = [];
  const foot = footColumns(table);
  headers.forEach((header, index) => {
    const cells = rows.map((row) => row.cells[index]).filter(Boolean);
    if (cells.length === 0) return;

    const observedCells = cells.filter((cell) => !isMissingValue(rawCellValue(cell)));
    // A header that says its column is text or dates (data-sort-type) keeps it from being read as
    // numbers: dates written 10.16, versions written 1.10 stay as written, left-aligned.
    const inferredNumericDisplay =
      !TEXT_SORTS.has(header.dataset.sortType) &&
      observedCells.length > 0 &&
      observedCells.every((cell) => numericParts(cell) !== null);
    const inferredSortableNumber =
      inferredNumericDisplay &&
      observedCells.every((cell) => parsedValue(cell, "number") !== null);

    header.classList.toggle("number", inferredNumericDisplay);
    cells.forEach((cell) => cell.classList.toggle("number", inferredNumericDisplay));
    // Its footer's cells (a total) as its own where they hold a number or nothing; words as written.
    (foot.get(index) || []).forEach((cell) => cell.classList.toggle("number",
      inferredNumericDisplay && (isMissingValue(rawCellValue(cell)) || numericParts(cell) !== null)));

    if (!inferredSortableNumber) {
      if (header.dataset.sortType === "number") delete header.dataset.sortType;
      if (inferredNumericDisplay) numericColumns.push(index);
      return;
    }

    numericColumns.push(index);

    if (!header.dataset.sortType && !header.hasAttribute("data-sort-ignore")) {
      header.dataset.sortType = "number";
    }
  });

  return numericColumns;
}
