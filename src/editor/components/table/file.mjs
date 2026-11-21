// 表格 in report.html (the server's, source/): a new table is written as the kit's reference writes
// one, <div class="doc-table-wrap"> holding <table class="doc-table">, its header row in a
// <thead> of <th>, its other rows in a <tbody> (a header column: each row's cell in the first column
// a <th scope="row">), each row on a line of its own. Its cells hold inline text (validLeaf); a
// cell's look (its color, fill, alignment: index.mjs CELL_LOOKS) is its class; a column's width, on
// the topmost cell of that column alone; a merged cell's spans, its colspan and rowspan; 识别数字列
// off, on its frame (index.mjs NUMBERS), as is the key a chart reads it by (data-doc-chart-source:
// src/shared/table-chart.mjs; checked by validTable, and against the file by source/chart-keys.mjs).

import { COLUMN_WIDTH, NUMBERS, tableTiling, validTable } from "./index.mjs";
import { CHART_SOURCE } from "../../../shared/table-chart.mjs";
import { widthHolder } from "../../../shared/table-slots.mjs";
import { plainTable, rewriteTable } from "../../source/table.mjs";

export default {
  table: {
    // Its rows and columns as the page changed them, written as one operation (source/table.mjs).
    rewrite: rewriteTable,
    // Whether the table of the file is one the operation may write (and the page's table tools are
    // for): the one judgement, which the page is told by (a mark on the unit, instrument()).
    plain: (node) => plainTable(node) !== null,
    // Its shape is the description's (index.mjs validTable, which the clipboard checks a copy by too);
    // what a cell may hold is the server's: inline HTML and lists of it.
    check: (node, { validLeaf }) => validTable(node, (cell) => typeof cell === "string" && validLeaf({ tag: "td" }, cell, { empty: true })),
    write(node, w) {
      const slots = tableTiling(node);
      const span = (r, i) => node.spans?.[r]?.[i] ?? [1, 1];
      // Each column's width on the cell that holds it ("r:i").
      const holders = new Map((node.widths ?? []).map((width, c) => [widthHolder(slots, c), width]).filter(([cell, width]) => cell && width));
      const attrsOf = (r, i) => {
        const [down, across] = span(r, i);
        const width = holders.get(`${r}:${i}`);
        return `${node.looks?.[r]?.[i] ? ` class="${node.looks[r][i]}"` : ""}${width ? ` style="${COLUMN_WIDTH}: ${width}"` : ""}${across > 1 ? ` colspan="${across}"` : ""}${down > 1 ? ` rowspan="${down}"` : ""}`;
      };
      const row = (cells, head, r) => `<tr>${cells.map((cell, i) => (head ? `<th${attrsOf(r, i)}>${cell}</th>` : node.column && slots.places.get(`${r}:${i}`).c === 0 ? `<th${attrsOf(r, i)} scope="row">${cell}</th>` : `<td${attrsOf(r, i)}>${cell}</td>`)).join("")}</tr>`;
      const deeper = w.inner === null ? null : w.inner + w.step;
      const deepest = deeper === null ? null : deeper + w.step;
      const [first, ...rest] = node.rows;
      const parts = [];
      if (node.header) parts.push(w.block("<thead>", [row(first, true, 0)], "</thead>", deeper, deepest));
      const body = node.header ? rest : node.rows;
      const offset = node.header ? 1 : 0;
      if (body.length > 0) parts.push(w.block("<tbody>", body.map((cells, index) => row(cells, false, index + offset)), "</tbody>", deeper, deepest));
      return w.block(`<div class="doc-table-wrap"${node.numbers === false ? ` ${NUMBERS}="off"` : ""}${node.chart ? ` ${CHART_SOURCE}="${node.chart}"` : ""}${w.id}>`, [w.block('<table class="doc-table">', parts, "</table>", w.inner, deeper)], "</div>");
    },
  },
};
