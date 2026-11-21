/**
 * A cell of a table a chart is drawn from: null for an empty or missing cell, a dash or n/a; a number
 * when it writes one number (12.5%, 3.6亿, 约 20; its data-sort-value first); else its words (a range,
 * 3 / 4, a column whose header has data-sort-type "text" or "date"). references/writing-html.md says it in full.
 */
export type DocTableValue = number | string | null;

/** A row of that table: each value by its column's header words. */
export type DocTableRow = Record<string, DocTableValue>;

/**
 * The rows a chart drawn from a table (`data-doc-chart-data`) gets as `data`: its body rows in the
 * file's order (<tfoot> left out), and its header's words in order (`columns`, as d3.csvParse gives).
 */
export interface DocTableRows extends Array<DocTableRow> {
  columns: string[];
}

/** What a document's own chart type draws with (see `DocChartsApi.define`). */
export interface DocChartDrawContext<Data = any> {
  /** The declared chart's host, emptied before each call (its data script stays). */
  host: HTMLElement;
  /** The declared JSON of this chart; for a chart drawn from a table (data-doc-chart-data), its rows (DocTableRows). */
  data: Data;
  /** Colors of the current theme. */
  tokens: import("./doc-tokens.js").DocTokenSnapshot;
  /** The host's width in px. */
  width: number;
  /** The card's plot height in px when it sets one (`--doc-chart-height`, e.g. from the preview); otherwise null. */
  height: number | null;
}

/** A chart of a document's own type. */
export interface DocDrawnChartHandle<Data = any> {
  /** Draw again, with new data if given (a chart drawn from a table takes none: it draws its table). */
  redraw(nextData?: Data): void;
  destroy(): void;
}

/** What a part of a document's own type is started with: the drawing context and its lifetime. */
export interface DocChartPartContext<Data = any> extends DocChartDrawContext<Data> {
  /** Aborted when the part is destroyed (its host left the page): give it to addEventListener. */
  signal: AbortSignal;
}

/**
 * A part of a document's own type: something that keeps what it needs (listeners, timers, an
 * animation) between drawings. `mount` starts it in the emptied host; `update` is called when its
 * width, the theme or its card's height change (or a script redraws it, or the rows of its table
 * change), `destroy` when its host leaves the page.
 */
export interface DocChartPart<Data = any> {
  mount(context: DocChartPartContext<Data>): { update?(context: DocChartPartContext<Data>): void; destroy?(): void } | void;
}

/**
 * Charts are declared in their cards, each of a type the document's script defines:
 * `<div data-doc-chart="slope"><script type="application/json">…its data…</script></div>`, or
 * `<div data-doc-chart="slope" data-doc-chart-data="t1"></div>`, drawn from the rows of the table
 * whose frame carries `data-doc-chart-source="t1"`.
 */
export interface DocChartsApi {
  /**
   * Define a chart type of the document's own, drawn from the data of each chart declared with it
   * (its JSON, or its table's rows: DocTableRows). `type` is lowercase letters, digits and hyphens,
   * a letter first (`interval`, `ci-plot`). `draw` is called again when a chart's width, the theme
   * or its card's height change, and when its table's rows do; a part (`{ mount }`) keeps what it
   * starts until its host leaves the page.
   */
  define<Data = any>(type: string, draw: ((context: DocChartDrawContext<Data>) => void) | DocChartPart<Data>): void;
  /** The chart drawn in a host; null if none. */
  get(target: string | Element): DocDrawnChartHandle | null;
}

declare global {
  /** The rows a chart drawn from a table gets as `data`, for a document's script to type it with (JSDoc's `@type {DocTableRows}`). */
  type DocTableRows = import("./doc-charts.js").DocTableRows;
  /** A row of a table a chart is drawn from. */
  type DocTableRow = import("./doc-charts.js").DocTableRow;
  /** A cell's value of a table a chart is drawn from. */
  type DocTableValue = import("./doc-charts.js").DocTableValue;
}
