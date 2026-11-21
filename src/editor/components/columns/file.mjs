import { sizeValue } from "../registry.mjs";
import { MIN_COLUMNS, RATIO } from "./index.mjs";

// 分栏 in report.html (the server's, source/): a row made on the page is written as
// <div class="doc-columns"> holding its columns, each <div class="doc-column"> with its blocks
// one indentation step deeper and, when it has one, its share of the row in its style attribute
// (--doc-column-ratio, as SIZES allows a column's).

export default {
  columns: {
    // Two columns at least (MIN_COLUMNS): the page never makes a row of one.
    check: (node) => node.children.length >= MIN_COLUMNS && node.children.every((child) => child.type === "column"),
  },
  column: {
    check: (node) => node.ratio === undefined || sizeValue("column", RATIO, node.ratio) === node.ratio,
    write(node, w) {
      const style = node.ratio === undefined ? "" : ` style="${RATIO}: ${node.ratio}"`;
      return w.block(`<div class="doc-column"${style}${w.id}>`, w.children(w.inner), "</div>");
    },
  },
};
