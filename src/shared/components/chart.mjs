// A chart: a host of a type the report's script defines (DocCharts.define), its data in a JSON
// script, or, with data-doc-chart-data, the rows of the table whose frame carries that key
// (src/shared/table-chart.mjs). charts/ draws it into the host.
export default {
  id: "chart",
  within: "card",
  match: "[data-doc-chart]",
  assets: ["charts"],
  uses: [/data-doc-chart=/],
  attrs: {
    "data-doc-chart": "the chart's type, one the document's script defines with DocCharts.define",
    "data-doc-chart-data": "the key of the table it draws: the table's frame carries it as data-doc-chart-source",
  },
  runtime: {
    attrs: { "[data-doc-chart]": ["data-doc-layout"] }, // data-doc-layout: why a chart drawn from a table drew nothing (charts/from-table.js)
    classes: { "[data-doc-chart]": ["doc-chart"] },
    // data-missing: no attribute, the name of a table chart's layout note (charts/from-table.js).
    internal: ["doc-chart-message", "data-missing"],
  },
};
