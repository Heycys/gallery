import { CHART_SOURCE, TABLE_READERS, cellText, cellValue, cellWords } from "../../../shared/table-chart.mjs";
import { decoded, pageAddress } from "../../../shared/page-address.mjs";

// How the kit reads a table of the page (docs/render.md, "Charts from a table" and "A custom block on a
// page"), the one reading of a chart drawn from a table (charts/from-table.js), a view's context.table()
// and a package's context.rows (rows.js): its header's words and data-sort-type, its rows of data in
// order, each cell's words and sort value as src/shared/table-chart.mjs reads them, and whether a cell
// spans others; and, as rows, `{ el, values, links }`. The tables a key names (CHART_SOURCE on a frame,
// TABLE_READERS on a chart's host or a view) are watched by one observer for every chart and view
// (createKeyedTables), each key read once a change and its reading shared until the next change touches
// it, each cell and each row read again only once a change touches it, so that three views and a chart of
// one table of 500 rows read one cell a keystroke.
//
// Pure but for the elements it is given and the document it watches, so that the tests run it in a DOM
// of their own.

/** A cell's words and sort value, as a chart and a view read them (cellWords of cellText, data-sort-value). */
export const cellReading = (cell) => ({ words: cellWords(cellText(cell)), sort: cell.getAttribute("data-sort-value")?.trim() ?? null });

const spans = (row) => Boolean(row) && [...row.cells].some((cell) => cell.rowSpan !== 1 || cell.colSpan !== 1);

/**
 * What a table says: { table, header, first, rows, names, types, cells, merged }. `header` its header row
 * (its head's first row, else a first row of its body all header cells; null for neither), `first` the row
 * its names come from (the header, else its body's first row, as d3.csvParse takes one), `rows` its rows
 * of data after that, never a <tfoot>'s, `names` and `types` the words and data-sort-type of `first`'s
 * cells, `cells` each row's cells read (`cell`: cellReading, or what a watcher kept of it), and `merged`
 * whether a cell of `first` or the rows spans rows or columns. `order(rows)` gives the rows of its bodies
 * (but a header) in the order they are read in: as the page holds them by default, the file's for a keyed
 * table (createKeyedTables).
 * @param {HTMLTableElement} table
 */
export function readTable(table, { order = (rows) => rows, cell = cellReading } = {}) {
  const head = table.tHead?.rows[0] ?? null;
  const body = [...table.tBodies].flatMap((section) => [...section.rows]);
  const header = head ?? (body[0] && body[0].cells.length > 0 && [...body[0].cells].every((each) => each.localName === "th") ? body[0] : null);
  const ordered = order(body.filter((row) => row !== header));
  const first = header ?? ordered[0] ?? null;
  const rows = header ? ordered : ordered.slice(1);
  const read = (row) => [...row.cells].map(cell);
  const named = first ? read(first) : [];
  return {
    table,
    header,
    first,
    rows,
    names: named.map(({ words }) => words),
    types: first ? [...first.cells].map((each) => each.getAttribute("data-sort-type")) : [],
    cells: rows.map(read),
    merged: [first, ...rows].some(spans),
  };
}

// The links a row's cells hold to documents of the workspace, as a file writes them (shared/page-address.mjs):
// another's ../<slug>/doc.html, with #<block id> for a block, and #<block id> for one of this document (`own`).
function linksOf(row, own) {
  return [...row.querySelectorAll("a[href]")].flatMap((link) => {
    const href = link.getAttribute("href").trim();
    const place = href.startsWith("#") && href.length > 1 ? (own ? { slug: own, block: decoded(href.slice(1)) } : null) : pageAddress(href);
    return place ? [{ slug: place.slug, title: cellWords(cellText(link)), block: place.block ?? null }] : [];
  });
}

// The row `at` of a reading as a package reads it.
function rowOf(reading, at, own) {
  const values = {};
  reading.names.forEach((name, index) => {
    values[name] = cellValue(reading.cells[at][index], reading.types[index] ?? null);
  });
  return Object.freeze({ el: reading.rows[at], values: Object.freeze(values), links: Object.freeze(linksOf(reading.rows[at], own)) });
}

/**
 * A reading's rows as a package reads them (context.rows, context.table()): each { el, values, links },
 * frozen, its values by the header's words as a chart reads them (cellValue: a number, its words or null;
 * a row shorter than the header null where it has no cell; of two names alike the later column's), the
 * links its cells hold to documents (`own`: the document's slug, which a link within it names).
 */
export const rowsOf = (reading, own = null) => reading.rows.map((_, at) => rowOf(reading, at, own));

const SOURCES = `.doc-table-wrap[${CHART_SOURCE}]`;
const READERS = TABLE_READERS.map((name) => `[${name}]`).join(", ");
const WATCHED = [CHART_SOURCE, ...TABLE_READERS, "data-sort-value", "data-sort-type", "rowspan", "colspan", "aria-sort", "href"];

/**
 * The tables of the page a key names, for every chart and view of them (DocKit.tables): `frameOf(key)`,
 * the first frame carrying it (none in what the preview adds, data-doc-dev); `reading(key)`, what its table
 * says (readTable, in the file's order), or null for no such table, the same object until a change
 * touches it while anything follows the key; `rows(key, own)`, its rows (rowsOf), a row the same object
 * until a change touches it or its header, and `signature(key)` (what they hold, the elements among it,
 * as a string), both kept with the reading; `follow(keyOf, heard)`, a reader of the key `keyOf()` gives
 * now: `heard()` is called once a batch of the page's changes may have changed what that key reads (a
 * change in its table, its frame added, taken away or given another key, or the reader's own key
 * changed), and the returned function ends it. One MutationObserver watches the page while anything
 * follows, and what it keeps (each key's reading, each cell's and each row's) is kept only then.
 */
export function createKeyedTables(doc = globalThis.document) {
  const followers = new Set(); // { keyOf, heard, key }
  const kept = new Map(); // key -> { frame, reading, rows: Map(own -> rows), signature } while followed
  let cells = new WeakMap(); // a cell -> its reading, while followed
  let rowsKept = new WeakMap(); // a row element -> { header, own, row, sign }, while followed
  let observer = null;

  const frameOf = (key) => (key === null || key === undefined ? null : [...doc.querySelectorAll(SOURCES)].find((wrap) => wrap.getAttribute(CHART_SOURCE) === key && !wrap.closest("[data-doc-dev]")) ?? null);

  // A table's rows in the file's order: as the page holds them, unless a reader sorted the table (a
  // header of its first row says how: aria-sort, tables/sort.js), then in the order they were last read in. Not on the page
  // editor's page (html[data-ge-order="file"]): its rows are the file's, a header's aria-sort there only says the order an
  // edit gave them (sort.js).
  const fileOrder = new WeakMap(); // a row -> its place, when last read unsorted
  const inFileOrder = (table) => (rows) => {
    const sorted = doc.documentElement?.getAttribute("data-ge-order") !== "file"
      && [...(table.tHead?.rows[0]?.cells ?? [])].some((cell) => /^(?:ascending|descending)$/.test(cell.getAttribute("aria-sort") ?? ""));
    if (!sorted) {
      rows.forEach((row, index) => fileOrder.set(row, index));
      return rows;
    }
    const place = (row) => fileOrder.get(row) ?? rows.length + rows.indexOf(row);
    return [...rows].sort((a, b) => place(a) - place(b));
  };
  const cellOf = (cell) => {
    if (!observer) return cellReading(cell);
    if (!cells.has(cell)) cells.set(cell, cellReading(cell));
    return cells.get(cell);
  };

  // The keys a batch of the page's changes touches, and whether a reader's key changed; the cells and
  // rows it changed are read again.
  function touched(records) {
    const keys = new Set();
    let readers = false;
    const keysIn = (node) => {
      if (node.nodeType !== 1) return;
      for (const frame of [...(node.matches(SOURCES) ? [node] : []), ...node.querySelectorAll(SOURCES)]) keys.add(frame.getAttribute(CHART_SOURCE));
      if (node.matches(READERS) || node.querySelector(READERS)) readers = true;
    };
    for (const record of records) {
      if (record.type === "attributes" && record.attributeName === CHART_SOURCE) {
        keys.add(record.oldValue);
        keys.add(record.target.getAttribute(CHART_SOURCE));
        continue;
      }
      if (record.type === "attributes" && TABLE_READERS.includes(record.attributeName)) {
        readers = true;
        continue;
      }
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      const frame = target?.closest(SOURCES);
      if (frame) keys.add(frame.getAttribute(CHART_SOURCE));
      // What was kept of a cell or a row the change is in goes, in a table with a key or not: one that
      // has none now may have one again (an undo of the step that put a view in, then its redo).
      const cell = target?.closest("td, th");
      if (cell) cells.delete(cell);
      const row = target?.closest("tr");
      if (row) rowsKept.delete(row);
      for (const node of [...record.addedNodes, ...record.removedNodes]) keysIn(node);
    }
    keys.delete(null);
    return { keys, readers };
  }

  function heard(records) {
    if (!doc.defaultView || records.length === 0) return; // the page is gone
    const { keys, readers } = touched(records);
    if (keys.size === 0 && !readers) return;
    for (const key of keys) kept.delete(key);
    for (const follower of [...followers]) {
      if (!followers.has(follower)) continue; // ended by one heard before it
      const key = follower.keyOf() ?? null;
      if (key === follower.key && !keys.has(key)) continue;
      follower.key = key;
      follower.heard();
    }
  }
  // What the page changed and the observer has not told yet, told now: a reading asked for at once after
  // a change (an intent's answer, a view drawing as its listener runs) reads what the page holds.
  const flush = () => observer && heard(observer.takeRecords());

  function keptOf(key) {
    flush();
    if (kept.has(key)) return kept.get(key);
    const frame = frameOf(key);
    const table = frame?.querySelector("table") ?? null;
    const entry = { frame, reading: table ? readTable(table, { order: inFileOrder(table), cell: cellOf }) : null, rows: new Map(), signature: null };
    if (observer) kept.set(key, entry);
    return entry;
  }

  // A row element's number, the same for the same element, so that a signature tells a row put in
  // another's place from it.
  const serials = new WeakMap();
  let serial = 0;
  const serialOf = (el) => serials.get(el) ?? (serials.set(el, ++serial), serial);

  // A row of a reading, the one read before while neither it nor its table's header changed.
  function rowKept(reading, at, own, header) {
    const el = reading.rows[at];
    const was = observer ? rowsKept.get(el) : null;
    if (was && was.header === header && was.own === own) return was;
    const row = rowOf(reading, at, own);
    const entry = { header, own, row, sign: null };
    if (observer) rowsKept.set(el, entry);
    return entry;
  }
  function rowsKeptOf(key, own) {
    const entry = keptOf(key);
    if (!entry.reading) return null;
    if (!entry.rows.has(own)) {
      const header = JSON.stringify([entry.reading.names, entry.reading.types]);
      entry.rows.set(own, entry.reading.rows.map((_, at) => rowKept(entry.reading, at, own, header)));
    }
    return entry.rows.get(own);
  }

  return Object.freeze({
    frameOf,
    reading: (key) => keptOf(key).reading,
    rows: (key, own = null) => rowsKeptOf(key, own)?.map(({ row }) => row) ?? null,
    signature(key, own = null) {
      const entry = keptOf(key);
      if (!entry.reading) return "null";
      if (entry.signature === null) {
        const rows = rowsKeptOf(key, own).map((kept) => {
          kept.sign ??= JSON.stringify([serialOf(kept.row.el), kept.row.values, kept.row.links]);
          return kept.sign;
        });
        entry.signature = `${JSON.stringify([entry.reading.names, entry.reading.merged])}${rows.join(",")}`;
      }
      return entry.signature;
    },
    follow(keyOf, heardIt) {
      const follower = { keyOf, heard: heardIt, key: keyOf() ?? null };
      followers.add(follower);
      if (!observer) {
        observer = new MutationObserver(heard);
        observer.observe(doc.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeOldValue: true, attributeFilter: WATCHED });
      }
      return () => {
        followers.delete(follower);
        if (followers.size > 0 || !observer) return;
        observer.disconnect();
        observer = null;
        kept.clear();
        cells = new WeakMap();
        rowsKept = new WeakMap();
      };
    },
  });
}
