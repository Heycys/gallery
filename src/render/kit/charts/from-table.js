import { CHART_DATA, CHART_SOURCE, tableRows } from "../../../shared/table-chart.mjs";
import { clear, mounts, writeLayoutNotes } from "./core.js";
import { sayCharts as say } from "../words.js";

// A chart drawn from a table (src/shared/table-chart.mjs; docs/render.md, "Charts from a table"): its
// host names the table by a key (data-doc-chart-data="t1"), and the table's frame anywhere in the
// page carries it (data-doc-chart-source="t1"; the first one when two do). Its type is one the
// report's script defines (DocCharts.define), drawn with `data` the table's rows (tableRows: an
// object a row by the header's words, data.columns the header's words), and drawn again when they
// change: the preview's edits of the table, a row added or taken away, the table deleted or put back
// by an undo, a key changed. The kit's one watcher of the tables a key names (DocKit.tables: the
// runtime's table-reading.js, which the views of a table, context.table(), follow too) tells each such
// chart of what touches its table or its host's key, and reads each table once a change for all of
// them. Its rows are read in the file's order: a reader's sort (the kit's sort buttons, sort.js) leaves
// the chart as it was, while in the preview, where a sort is an edit of the table's order
// (page/table/), the chart follows it.
// With nothing to draw (no such table, merged cells) the card says so in a line, and its host
// carries the layout note "data-missing: …". A chart drawn until then keeps standing while its table
// reads as nothing for a moment (a cell being merged and split again in one edit): the line replaces
// it once the table has stayed so for SETTLE.

const SETTLE = 800; // ms a drawn chart waits before it says its table gives nothing to draw

// What a chart's host reads of its table: tableRows', or why there is nothing to draw. Its table's
// reading is the runtime's (table-reading.js readTable), its header's types counted only where it has a
// header row (with none its first row is the header, as d3.csvParse takes one).
function readSource(host) {
  const key = host.getAttribute(CHART_DATA);
  const read = globalThis.DocKit.tables.reading(key);
  if (!read) return { error: `no table carries ${CHART_SOURCE}="${key}": put the table back, or delete the card`, message: ["table-gone"] };
  const found = tableRows({ names: read.names, types: read.header ? read.types : null, rows: read.cells, merged: read.merged });
  return found.error ? { error: `its table ${found.error}`, message: found.message } : found;
}

/**
 * A chart of a report's own type drawn from its table: `make(data)` draws it the first time (the
 * runtime's handle of a drawn chart or a part: declared.js createDrawn, createPart), its handle's
 * setData(data) draws it again with new rows. The runtime's handle.
 */
export function createBound(host, make, context) {
  host.classList.add("doc-chart");
  let inner = null; // the chart, while the table gives it rows
  let shown = null; // what was last drawn (or said), so that a change elsewhere draws nothing again
  let waiting = 0; // the timer of a line that replaces a drawn chart once its table has stayed so
  let destroyed = false;
  // Nothing to draw: the chart gone, a line in the card saying why (the kit's words: [key, ...values]), the layout note.
  const explain = ({ error, message }) => {
    inner?.destroy();
    inner = null;
    context.frame(() => {
      if (destroyed) return;
      clear(host);
      const line = document.createElement("div");
      line.className = "doc-chart-message";
      line.textContent = say(...message);
      host.append(line);
      writeLayoutNotes(host, [`data-missing: ${error}`]);
    });
  };
  const check = () => {
    clearTimeout(waiting);
    waiting = 0;
    const found = readSource(host);
    const signature = JSON.stringify(found.error ? found : [found.data.columns, found.data]);
    if (signature === shown) return;
    if (found.error && inner) {
      waiting = setTimeout(() => {
        waiting = 0;
        shown = signature;
        explain(found);
      }, SETTLE);
      return;
    }
    shown = signature;
    if (found.error) return explain(found);
    if (inner) inner.setData(found.data);
    else {
      inner = make(found.data);
      mounts.set(host, api); // over the one the chart it made set
    }
  };
  // The report's handle (DocCharts.get): it draws its table, never data given it.
  const api = {
    redraw(nextData) {
      if (nextData !== undefined) throw new Error(`DocCharts: a chart drawn from a table (${CHART_DATA}) draws its table's rows; change the table`);
      shown = null;
      check();
    },
    destroy: () => globalThis.DocKit.destroy(host),
  };
  mounts.set(host, api);
  const unfollow = globalThis.DocKit.tables.follow(() => host.getAttribute(CHART_DATA), check);
  check();
  return {
    api,
    update: () => inner?.update(),
    destroy() {
      destroyed = true;
      clearTimeout(waiting);
      unfollow();
      inner?.destroy();
      inner = null;
      if (mounts.get(host) === api) mounts.delete(host);
      clear(host);
    },
  };
}
