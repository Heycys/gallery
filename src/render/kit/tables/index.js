import { allocateColumnWidths } from "./auto-column-widths.ts";
import { elementFor, inferColumnSemantics, joinCodeRuns, splitCodeRuns, wrapperOf } from "./cells.js";
import { clearAcross } from "./across.js";
import { markEdges } from "./edges.js";
import { applyLayoutDefaults, fontsChange, forgetMeasures, idleLayout, layoutObservers, layouts, pendingLayouts, queueLayout, refreshLayout } from "./layout.js";
import { controllers, heldOrder, makeSortable } from "./sort.js";

// The kit's tables (/kit/tables.js, an esbuild bundle of this folder; docs/render.md, "Table layout
// internals"): every table.doc-table is laid out (layout.js: column widths from its content, the
// frame's scrollbars, scrollbars.js), its numeric columns found (cells.js), the cells on its frame's
// edges marked where a cell spanning rows puts them out of the stylesheet's reach (edges.js) and,
// unless static, made sortable (sort.js). DocTables is the API reports use; the kit's runtime
// keeps each table (below), so a table is laid out again when its content, its container or the
// fonts change.

const global = globalThis;

// The table read and its layout queued; `layout: false` for one whose layout its caller queues
// itself (a change of its content heard: in the next frame, or once the page is idle).
function enhance(target, {layout = true} = {}) {
  const table = elementFor(target);
  splitCodeRuns(table); // before its columns are measured
  applyLayoutDefaults(table, {layout});
  inferColumnSemantics(table);
  if (table.hasAttribute("data-doc-table-static")) return table;
  return makeSortable(table);
}

function controllerFor(target) {
  const table = enhance(target);
  const controller = controllers.get(table);
  if (!controller) throw new Error("Table state requires a sortable table.");
  return controller;
}

global.DocTables = Object.freeze({
  getState: (target) => controllerFor(target).getState(),
  setState: (target, state) => controllerFor(target).setState(state),
  subscribe: (target, listener) => controllerFor(target).subscribe(listener),
  allocateColumnWidths,
  /** Force measurement after custom content/layout changes; returns a detached snapshot. */
  layout(target) {
    const table = elementFor(target);
    enhance(table);
    forgetMeasures(table); // every cell measured again, whatever changed
    refreshLayout(table);
    return (layouts.get(table) || []).map(column => ({...column}));
  },
});
global.ReportTables = global.DocTables; // its old name (before 2026-10-26), for a script no tool rewrote (shared/old-names.mjs)

// The kit's runtime (DocKit) keeps every table once the page has loaded, and those added later:
// it is laid out again when its content changes (not the columns it sizes itself), an element
// around it is shown, its card's size, the window or the fonts change; and its observer goes when it
// leaves the page.
if (!global.DocKit) throw new Error("DocTables requires /kit/runtime.js to be loaded first.");
// A change the layout made itself: inside the columns it sizes, or its colgroup put in or taken out;
// or a header's sort control put in or taken out (sort.js): the room its arrow hangs in is the cell's padding, which a control
// brings (styles/table.css), but a control is put in or taken out only where the layout is queued anyway (enhance), so a table lays out the
// same with and without them.
function ownChange(record) {
  const element = record.target.nodeType === 1 ? record.target : record.target.parentElement;
  if (element?.closest("colgroup[data-doc-columns]")) return true;
  const nodes = [...record.addedNodes, ...record.removedNodes];
  return nodes.length > 0 && nodes.every((node) => node.nodeType === 1 && (node.tagName === "COLGROUP" || node.classList.contains("doc-table-sort-button")));
}
// A table bound to a key (data-doc-bind, runtime/bindings.js): its sort is the key's.
function bindSort(table, signal) {
  const key = table.getAttribute("data-doc-bind")?.trim();
  const controller = controllers.get(table);
  if (!key || !controller) return;
  const store = global.DocKit.bindings;
  const show = () => {
    const value = store.get(key);
    controller.setState(value && typeof value === "object" ? value : { sort: null });
  };
  const stopTable = controller.subscribe((state) => store.set(key, state));
  const stopKey = store.subscribe((changed) => changed === key && show());
  signal.addEventListener("abort", () => {
    stopTable();
    stopKey();
  });
  if (!heldOrder()) show(); // a page that holds the file's order opens in it
}

global.DocKit.component({
  id: "table",
  selector: "table.doc-table, table[data-sortable-table]",
  on: ["content", "reveal", "layout", "viewport", "fonts"],
  mount(table, { signal }) {
    enhance(table);
    markEdges(table);
    bindSort(table, signal);
    // 识别数字列 switched on its frame or on it (the page editor's, undone too): read again, the
    // sort controls with it.
    const switched = new MutationObserver(() => {
      enhance(table);
      queueLayout(table);
    });
    for (const node of [table, wrapperOf(table)]) if (node) switched.observe(node, { attributes: true, attributeFilter: ["data-number-columns"] });
    signal.addEventListener("abort", () => switched.disconnect());
    return {
      update(reason, detail, { quiet = false } = {}) {
        if (reason === "layout") {
          if (layoutObservers.has(table)) queueLayout(table);
        } else if (reason === "fonts") {
          // Fonts in (detail: the faces a later load brought): laid out again, every cell measured
          // again, when it measured its words in one of them; KaTeX's faces for one holding a
          // formula lay it out again too (its formulas' cells are measured every time).
          const change = fontsChange(table, detail);
          if (change === "words") forgetMeasures(table);
          if (change) queueLayout(table);
        } else if (reason !== "content" || detail.some((record) => !ownChange(record))) {
          // Its content changed (the page editor's rows, header row, words): its numeric columns
          // and sort controls read again (nothing changes when nothing has to), and it is laid out
          // again, which places its scrollbars (where the part that scrolls begins: a header row
          // switched). Content rebuilt to look as it did (the page editor starting: quiet) is laid
          // out once the page is idle.
          if (reason === "content" && controllers.has(table)) enhance(table, { layout: false });
          if (reason === "content") markEdges(table); // its rows or merged cells
          if (quiet) idleLayout(table);
          else queueLayout(table);
        }
      },
      destroy() {
        layoutObservers.get(table)?.disconnect();
        layoutObservers.delete(table);
        pendingLayouts.delete(table);
      },
    };
  },
  // An export of the view: the sort controls taken out (their headers' words are untouched), the widths the layout
  // set taken off (tables.js lays the copy out again), its cells' code joined from its runs.
  dehydrate(table) {
    if (table.classList.contains("doc-table--auto")) {
      table.style.removeProperty("width");
      wrapperOf(table)?.style.removeProperty("width");
      if (table.getAttribute("style") === "") table.removeAttribute("style");
    }
    // A frame placed past the text (across.js): the copy's kit places it again by the copy's look.
    clearAcross(wrapperOf(table));
    table.querySelectorAll(".doc-table-sort-button").forEach((button) => button.remove());
    joinCodeRuns(table);
  },
});
