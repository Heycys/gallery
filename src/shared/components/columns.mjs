// 分栏: blocks side by side in columns. A .doc-columns holds 2 to 5
// .doc-column, each a flow of blocks (any but chapters and other columns); on a narrow screen
// they stack. A column's width is its share of the row, less the gaps (--doc-column-ratio):
// written on every column of a row (adding up to 1; laid out in
// proportion), or on none (equal).
export default {
  id: "columns",
  category: "container",
  match: ".doc-columns",
  parts: {
    columns: { at: ":scope > .doc-column", edit: "flow", min: 2, max: 5 },
  },
  only: ["columns"],
  shares: { part: "columns", property: "--doc-column-ratio", min: 1 / 24 },
  classes: ["doc-columns", "doc-column"],
};
