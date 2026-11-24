import { ALIGN_PLACES } from "../align.mjs";
import { BLOCK_COLORS } from "../colors.mjs";
import { svg } from "../icons.mjs";
import { SPAN } from "../../../shared/media.mjs";
import { numberValue, rawCellValue } from "../../../shared/number-reading.mjs";
import { columnWidths, slotsOf, tileSlots, tileSpans } from "../../../shared/table-slots.mjs";
import { CELL_ALIGN_CLASSES, CELL_BOLD_CLASS, CELL_VALIGN_CLASSES } from "../../../shared/components/table.mjs";
import { CHART_KEY, CHART_SOURCE } from "../../../shared/table-chart.mjs";
import { WIDE } from "../../../shared/table-across.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { labeled, plainRow } from "../read-rows.mjs";
import { escapeAttribute, escapeText } from "../../../shared/escape.mjs";
import { servedFile } from "../../page/served.mjs";
import { currentProjectBase } from "../../../shared/workspace-address.mjs";

const ICON = svg('<rect x="3.25" y="3.75" width="13.5" height="12.5" rx="2"/><path d="M3.25 8h13.5M3.25 12.1h13.5M8.25 3.75v12.5"/>');

// 表格: a table in its frame (.doc-table-wrap), with the scope line above it
// (.doc-table-meta) going along as its lead. One block: its cells are text blocks that may be
// emptied; rows and columns go in and out only through the table's own operation (page/table/). Its frame's width and scroll height are sizes.
// The kit lays it out (render/kit/tables.js: column widths, sorting, the frame's scrollbars).
//
// Where the engines reach it (src/editor/page/ unless named): convert.mjs (a new one from the "/"
// menu: page.mjs `create`), resize/ (dragging its right and
// bottom edges: tableWidthAt, heightAt), page/table/ (its block menu rows: 铺满正文宽度, 恢复默认大小),
// core.mjs (its scope line goes with it: unitElement, withLeads, markFrames), ../source/ (finding its cells
// and its lead: table(), leadOf; a cell's data-sort-value following its text: apply.mjs sortKey).
// clipboard/own/ (copied as itself with its data: `clipboard`, and `build` in page.mjs), src/transfer/markdown.mjs (`read`, `grid`).
// page.mjs: a new one (a paste: clipboard/); file.mjs: a new one in report.html.
// Its look: the kit's styles/table.css, laid out and sorted by tables/ (src/render/kit/).

/**
 * 识别数字列 off: the kit reads none of the table's columns as numbers (none centered, none sorted by
 * its header: tables/cells.js). On its frame (the unit); a table without it has its numeric
 * columns read (the Agent's). A table made from "/" starts with it; 一键优化 and a table pasted from
 * elsewhere go without.
 */
export const NUMBERS = "data-number-columns";
export const TABLE_HEIGHT = "--doc-table-height";

/**
 * The mark of a table unit the table's tools are for (grid.mjs, page/table/): the server marks the
 * units of the file it judges plain (source/table.mjs plainTable; the page only reads it), and a
 * table made on the page has it by construction (page.mjs newTable) until the file says.
 */
export const GRID = "data-ge-grid";

export default {
  name: "table",
  listed: () => t("表格"),
  units: {
    table: {
      name: t("表格"),
      icon: ICON,
      match: [
        { rank: 80, tag: "table" },
        { rank: 90, class: "doc-table-wrap" },
      ],
      boxed: true,
      toggles: ALIGN_PLACES, // the table placed on the page, at the left (the kit's own), centred or at the right: 对齐 ›, a text block's classes (align.mjs)
      resizable: ".doc-table-wrap[data-ge-unit]", // its right and bottom edges, once it is in the file
      copy: "itself", // within the report a copy keeps all of its markup (its scope line, its frame's size); another report's gets the table's data (tableData) made anew
      // 识别数字列 off, and the key a chart or a view reads it by (src/shared/table-chart.mjs), which a view
      // made from a menu puts on a table that has none (page/table/binding.mjs) in the step that makes the view;
      // its own 宽表格, on or off over the page's (the block menu's switch: page/table/ wideRow).
      attributes: { [NUMBERS]: (value) => value === "off", [CHART_SOURCE]: (value) => CHART_KEY.test(value), [WIDE]: (value) => value === "on" || value === "off" },
      sizes: {
        [SPAN]: { min: 0.15, max: 3 }, // past 1 the table is wider than the text and scrolls in its frame
        [TABLE_HEIGHT]: { min: 80, max: 4000, px: true, none: true, height: true },
      },
      read: { name: "表格", rows: readRows, words: readWords, data: readData, lost: (node) => (tableOfUnit(node.el)?.querySelector("[rowspan]:not([rowspan='1']), [colspan]:not([colspan='1'])") ? "合并单元格的表格 {n} 个（被占的格写成空的）" : null) },
    },
  },
  components: ["doc-table-wrap", "doc-table-meta"],
  hosts: {
    cell: { name: t("表格单元格"), caps: () => ["empty", "links"], pictures: { show: showPictures, write: writtenPicture }, lines: { nodes: cellNodes, blocks: cellBlocks } },
  },
  types: {
    // Made by a paste or the "/" menu (三列三行, a header row: page.mjs newTable): no class here, so
    // that the Agent's tables keep no type. What it is written with: its rows of cells' inline HTML,
    // whether its first row is a header row and its first column a header column, its cells' looks,
    // whether its numeric columns are read (file.mjs).
    table: {
      menu: ["basic", 14], fresh: 8,
      tag: "div", kind: "table", bare: true, extras: (element, { serializeInner }) => tableData(element, serializeInner),
      // Copied as itself, its tools with it (GRID) in the report it comes from, with its data to be
      // made anew elsewhere; another program's comes as this, as does a grid of cells. Its page.mjs
      // makes it from that.
      clipboard: {
        kind: "table", keeps: [GRID], grid: tableGrid,
        read: (unit, { withPictures }) => tableData(unit, withPictures),
        // Its data, its cells' looks always there, so that a header cell the Agent left plain stays
        // plain, and as much of it as a description can carry (carriableTable: a table an Agent wrote
        // may say what the page's own never do), so that the copy, which is checked as a whole, is
        // never refused for its data.
        data(node, { serializeInner }) {
          const data = tableData(node, serializeInner);
          if (data.rows.length === 0 || data.rows.every((row) => row.length === 0)) return null;
          const carried = carriableTable({ ...data, looks: data.looks ?? data.rows.map((row) => row.map(() => "")) }, (cell) => typeof cell === "string" && cell.length <= MAX_CELL_HTML);
          return carried && { type: "table", ...carried };
        },
        check: (block, { string }) => validTable(block, (cell) => string(cell, MAX_CELL_HTML)) && (block.outside === undefined || block.outside === true),
        text: (block) => block.rows.flat(),
      },
      label: t("表格"), icon: ICON, words: "表格 表 biaoge bg table grid",
      glance: { row: 9, name: "表格", write: "`<table>`, its title a `<caption>`", after: "`div.doc-table-wrap` › `table.doc-table`, the caption a `p.doc-note` above it", rule: "Tables" },
    },
  },
};

// The classes of a cell's look are the table description's (shared/components/table.mjs), the kit's
// styles/table.css draws them; here they are named for the menus.
/** A cell's alignments with their names: its words to the left, the middle, the right. */
export const CELL_ALIGNS = CELL_ALIGN_CLASSES.map((name, index) => [name, [t("左对齐"), t("居中"), t("右对齐")][index]]);
/** A cell's vertical alignments with their names: its words at its top (the kit's own), middle, bottom. */
export const CELL_VALIGNS = CELL_VALIGN_CLASSES.map((name, index) => [name, [t("顶端对齐"), t("垂直居中"), t("底端对齐")][index]]);

/** A cell's words bold, all of them (the kit's class): the words typed in it later too. */
export const CELL_BOLD = CELL_BOLD_CLASS;

/**
 * The classes that are a cell's look (the table's tools set them, its operation writes them): its
 * color (one per cell, a text color or a fill, as a block's: components/colors.mjs),
 * its alignment, its vertical alignment and its bold. A cell's other classes are the file's.
 */
export const CELL_LOOKS = [...BLOCK_COLORS, ...CELL_ALIGNS.map(([name]) => name), ...CELL_VALIGNS.map(([name]) => name), CELL_BOLD];

/**
 * The look a cell takes when it becomes a header row's cell (a th that is no row's header: 标题行's
 * toggle, a row moved there, a cell made there: page.mjs) and loses when it stops being one: bold,
 * and the gray fill unless it has a color of its own. A header column's cell (th scope="row") has
 * none: 标题列 only makes the first column stay when the frame scrolls sideways (the user's,
 * 2026-11-06). Nothing else of the kit's sets a header apart.
 */
export const HEADER_LOOK = [CELL_BOLD, "doc-highlight-gray"];

/** A look as a cell may have it: classes of CELL_LOOKS, a color, an alignment, a vertical one and bold at most once each. */
export function validLook(look) {
  if (typeof look !== "string" || look.length > 200) return false;
  const names = look.split(" ").filter(Boolean);
  const one = (group) => names.filter((name) => group.includes(name)).length <= 1;
  return names.every((name) => CELL_LOOKS.includes(name)) && new Set(names).size === names.length
    && one(BLOCK_COLORS) && one(CELL_ALIGNS.map(([name]) => name)) && one(CELL_VALIGNS.map(([name]) => name));
}

/**
 * Whether the cells of a table's first column (its body rows', top down) hold its rows' names, so
 * that 一键优化 makes it the header column: two at least, each written, none a number (by the kit's
 * reading of the cell, src/shared/number-reading.mjs), no two alike.
 */
export function rowNames(cells) {
  const texts = cells.map((cell) => cell.textContent.trim());
  return cells.length >= 2 && cells.every((cell, index) => texts[index] && numberValue(rawCellValue(cell)) === null) && new Set(texts).size === texts.length;
}

/**
 * The width the reader gave a cell's column (the table's tools write it on the first row's cells;
 * the kit lays the columns out at it: tables/layout.js manualLayout): "160px", or null.
 */
export const COLUMN_WIDTH = "--doc-column-width";
export const widthOf = (cell) => cell.style.getPropertyValue(COLUMN_WIDTH).trim() || null;
/** The narrowest a column is made (px): by dragging it, and as a cell may have it written. */
export const MIN_COLUMN_WIDTH = 35;
/** A width as a cell may have it: whole or fractional pixels, from MIN_COLUMN_WIDTH to 4000. */
export const validWidth = (width) => width === null || (typeof width === "string" && /^\d{1,4}(\.\d{1,2})?px$/.test(width) && parseFloat(width) >= MIN_COLUMN_WIDTH && parseFloat(width) <= 4000);

/** A cell's look: its classes that are one (CELL_LOOKS), in order, as one string. */
export const lookOf = (cell) => [...cell.classList].filter((name) => CELL_LOOKS.includes(name)).sort().join(" ");

/**
 * The height a frame scrolls at without a height of its own: the kit's (styles/table.css, the one
 * place that number is written), asked of the frame with its own height taken off for a moment
 * (Infinity where no kit styles it, and for a frame the kit shows whole: a short table or one
 * mostly of words, data-doc-whole). 一键优化 and the bottom edge's drag (resize/) both ask it.
 */
export function scrollHeight(unit) {
  const own = unit.style.getPropertyValue(TABLE_HEIGHT);
  unit.style.removeProperty(TABLE_HEIGHT);
  const height = parseFloat(getComputedStyle(unit).maxHeight);
  unit.style.setProperty(TABLE_HEIGHT, own);
  return Number.isFinite(height) ? height : Infinity;
}

/** The most cells a table has (the server writes no more). */
export const MAX_TABLE_CELLS = 5000;
const MAX_SPAN = 1000;

/**
 * Where a table's cells stand (shared/table-slots.mjs tileSpans), as its slots (matrix, places by "row:index", columns),
 * or null when they tile no rectangle: `node` is a table as tableData describes it.
 */
export const tableTiling = (node) => tileSpans(node.rows.map((row, r) => ({ head: Boolean(node.header) && r === 0, cells: node.spans?.[r] ?? row.map(() => [1, 1]) })));

/**
 * A table's rows as a grid, each cell as `write` writes it, for a Markdown table, which has no merged
 * cells: a merged cell's other slots empty. `columns`: the columns of one whose cells tile no rectangle.
 */
export function tableGrid(node, columns, write) {
  const tiling = tableTiling(node);
  return node.rows.map((row, r) => {
    const cells = Array(tiling?.columns ?? columns).fill("");
    row.forEach((cell, index) => {
      cells[tiling?.places.get(`${r}:${index}`)?.c ?? index] = write(cell);
    });
    return cells;
  });
}

/**
 * Whether `node` is a table as tableData describes it: its rows of cells (`validCell(html)`: what a cell
 * may hold is the one who asks's to say, the server's allowlist of inline HTML and lists, the
 * clipboard's string that is made again), its flags, its cells' looks, spans and the columns' widths
 * (a row has as many cells as it has, the cells tile a rectangle), and the key a chart reads it by.
 */
export function validTable(node, validCell) {
  if (node.chart !== undefined && !(typeof node.chart === "string" && CHART_KEY.test(node.chart))) return false;
  if (!Array.isArray(node.rows) || node.rows.length < 1 || node.rows.length > MAX_TABLE_CELLS) return false;
  if (!node.rows.every((row) => Array.isArray(row) && row.length <= MAX_TABLE_CELLS && row.every(validCell))) return false;
  if ((node.header !== undefined && node.header !== true) || (node.column !== undefined && node.column !== true) || (node.numbers !== undefined && node.numbers !== false)) return false;
  if (node.spans !== undefined && !(Array.isArray(node.spans) && node.spans.length === node.rows.length && node.spans.every((row, r) => Array.isArray(row) && row.length === node.rows[r].length
    && row.every((span) => Array.isArray(span) && span.length === 2 && span.every((value) => Number.isInteger(value) && value >= 1 && value <= MAX_SPAN))))) return false;
  const places = tableTiling(node);
  // A row may hold no cell: a merged cell above covers all of it.
  if (!places || places.columns < 1 || node.rows.length * places.columns > MAX_TABLE_CELLS) return false;
  return (node.looks === undefined || (Array.isArray(node.looks) && node.looks.length === node.rows.length
    && node.looks.every((row, r) => Array.isArray(row) && row.length === node.rows[r].length && row.every(validLook))))
    && (node.widths === undefined || (Array.isArray(node.widths) && node.widths.length === places.columns && node.widths.every(validWidth)));
}

// ---------- a cell's text as lines and lists ----------

/**
 * A cell's text (its inline HTML, as copied, or what is pasted into one) in pieces: { html } its lines
 * between lists, { tag, items } a list ("ul" or "ol") and its items' inline HTML. A list wherever it
 * stood (in a paragraph, a mark) stands apart, and one in an item gives its items after that item (a
 * cell's list holds no list). Null when it holds no list.
 */
export function cellPieces(doc, html) {
  const template = doc.createElement("template");
  template.innerHTML = html;
  const root = template.content;
  if (!root.querySelector("ul, ol")) return null;
  // Each list not in a list out of the elements around it, split there up to the top.
  for (const list of [...root.querySelectorAll("ul, ol")]) {
    if (list.parentElement?.closest("ul, ol")) continue;
    for (let parent = list.parentNode; parent !== root; parent = list.parentNode) {
      const after = parent.cloneNode(false);
      while (list.nextSibling) after.append(list.nextSibling);
      parent.after(list, after);
    }
  }
  // A list's items: an item's own, then the items of a list it holds.
  const itemsOf = (list) => [...list.children].filter((item) => item.localName === "li").flatMap((item) => {
    const held = [...item.querySelectorAll("ul, ol")].filter((inner) => inner.parentElement.closest("ul, ol") === list);
    held.forEach((inner) => inner.remove());
    return [item.innerHTML, ...held.flatMap(itemsOf)];
  });
  const source = (node) => (node.nodeType === 1 ? node.outerHTML : node.nodeType === 3 ? escapeText(node.data) : "");
  const pieces = [];
  for (const child of [...root.childNodes]) {
    if (child.nodeType === 1 && (child.localName === "ul" || child.localName === "ol")) pieces.push({ tag: child.localName, items: itemsOf(child) });
    else if (pieces.at(-1)?.html !== undefined) pieces.at(-1).html += source(child);
    else pieces.push({ html: source(child) });
  }
  return pieces;
}

/**
 * A cell's nodes made of inline HTML (cellPieces): its lines with a line break between two, an empty
 * line among them kept, and its lists (part of the cell's text: tableData) lists of the
 * cell, each item its lines. `lines(html, ends)`: the lines of a piece of it as pastedLines makes them
 * with `lineBreaks` (`ends`: { start, end }, whether the piece begins or ends what is made, for the
 * spaces kept at its ends). An empty item keeps a line break for its caret, and the empty lines at the
 * ends of what is made go.
 */
export function cellNodes(doc, html, lines) {
  const pieces = cellPieces(doc, html) ?? [{ html }];
  const joined = (made) => made.flatMap((line, index) => (index > 0 ? [doc.createElement("br"), ...line] : line));
  const nodes = [];
  pieces.forEach((piece, index) => {
    const ends = { start: index === 0, end: index === pieces.length - 1 };
    if (piece.html !== undefined) {
      const made = lines(piece.html, ends);
      while (ends.start && made[0]?.length === 0) made.shift();
      while (ends.end && made.at(-1)?.length === 0) made.pop();
      nodes.push(...joined(made));
      // An empty line right above a list: a line break of its own, the one ending the line above it
      // showing none before a block.
      if (!ends.end && made.at(-1)?.length === 0) nodes.push(doc.createElement("br"));
      return;
    }
    const list = doc.createElement(piece.tag);
    for (const item of piece.items) {
      const made = lines(item, { start: false, end: false });
      while (made[0]?.length === 0) made.shift();
      while (made.at(-1)?.length === 0) made.pop();
      const entry = doc.createElement("li");
      entry.append(...(made.length > 0 ? joined(made) : [doc.createElement("br")]));
      list.append(entry);
    }
    if (list.children.length > 0) nodes.push(list);
  });
  return nodes;
}

/**
 * A cell's text with lists in it (its inline HTML: cellPieces) as the clipboard's described blocks, for
 * where blocks go (a paragraph: page/clipboard/): each run of its lines between them a paragraph of
 * those lines (one with no words none), each list a bulleted or numbered list of its items; null for
 * text holding no list.
 */
export function cellBlocks(doc, html) {
  const said = (part) => {
    const template = doc.createElement("template");
    template.innerHTML = part;
    return Boolean(template.content.textContent.trim() || template.content.querySelector("[data-ge-atom], .doc-math-inline, img"));
  };
  return cellPieces(doc, html)?.filter((piece) => piece.html === undefined || said(piece.html)).map((piece) => (piece.html !== undefined ? { type: "paragraph", html: piece.html }
    : { type: piece.tag === "ol" ? "numbers" : "bullets", blocks: piece.items.map((item) => ({ type: "item", html: item, lists: [] })) })) ?? null;
}

/** The most a cell's inline HTML is as a description of a table has it (the clipboard's and the server's). */
export const MAX_CELL_HTML = 20000;

/**
 * The clipboard type of cells copied from a table of the page (page/table/cells.mjs: cellsPayload), which a
 * paste into cells reads first, and one elsewhere as the page's own (page/clipboard/: one cell its text,
 * more a table of them).
 */
export const CELLS_MIME = "application/x-gallery-cells";
/**
 * What cells copied (`cells`: their inline HTML row by row) are on the clipboard as (CELLS_MIME): { v: 1,
 * cells, report, project }, naming the document of `doc` they were copied in and its workspace where it is
 * not the first (its address's /~ws-… base), as the page's own copy of blocks does (page/clipboard/
 * payloadOf): two workspaces may each have a document of that name, and their pictures are that one's files.
 */
export function cellsPayload(cells, doc = globalThis.document) {
  const project = currentProjectBase();
  return JSON.stringify({ v: 1, cells, report: doc.querySelector(".doc-page")?.dataset.docId ?? null, ...(project ? { project } : {}) });
}
// ---------- gallery read (../read-rows.mjs) ----------

const tableOfUnit = (unit) => (unit.localName === "table" ? unit : unit.querySelector("table"));

// Its cells by their slots: grid[r][c] = { cell, origin (the cell's own slot), above (taken by a cell above) }.
function readGrid(table) {
  const grid = [];
  [...table.rows].forEach((row, r) => {
    grid[r] ??= [];
    let c = 0;
    for (const cell of row.cells) {
      while (grid[r][c]) c++;
      const down = Math.max(1, cell.rowSpan || 1);
      const across = Math.max(1, cell.colSpan || 1);
      for (let dr = 0; dr < down; dr++) for (let dc = 0; dc < across; dc++) (grid[r + dr] ??= [])[c + dc] = { cell, origin: dr === 0 && dc === 0, above: dr > 0 };
      c += across;
    }
  });
  return grid;
}

// A ── row of its size, header, merged cells, the chart drawn from it and its frame's and table's {…}; then its rows as
// a Markdown table, a cell's look and attributes in its {…} (a header cell's own look, HEADER_LOOK, left out), the slots
// a merged cell takes ⟵ (of the cell on their left) or ↑ (above).
function readRows(node, view) {
  const { tools } = view;
  const table = tableOfUnit(node.el);
  if (!table) return labeled(node, `表格${tools.looks(node.el)}`, [plainRow("（没有表格）")]);
  const grid = readGrid(table);
  const columns = Math.max(0, ...grid.map((row) => row.length));
  const heads = table.tHead?.rows.length ?? 0;
  const cellText = (cell) => {
    const said = tools.own(cell).replace(/\n/g, "<br>").replace(/\|/g, "\\|");
    const parts = [];
    for (const { name, value } of tools.fileAttributes(cell)) {
      if (name === "class") {
        for (const one of (value ?? "").split(/\s+/).filter(Boolean)) if (!(cell.localName === "th" && HEADER_LOOK.includes(one))) parts.push(`.${one}`);
      } else parts.push(value === null ? name : `${name}="${value}"`);
    }
    return `${said}${parts.length ? ` ${tools.braces(parts)}` : ""}`.trim();
  };
  const lines = [];
  grid.forEach((row, r) => {
    const cells = [];
    for (let c = 0; c < columns; c++) cells.push(!row[c] ? "" : row[c].origin ? cellText(row[c].cell) : row[c].above ? "↑" : "⟵");
    lines.push(`| ${cells.join(" | ")} |`);
    if (r === 0) lines.push(`| ${Array(columns).fill("---").join(" | ")} |`);
  });
  const merged = [...table.rows].some((row) => [...row.cells].some((cell) => cell.rowSpan > 1 || cell.colSpan > 1));
  const chart = node.el.getAttribute(CHART_SOURCE);
  const facts = [`${grid.length} 行 × ${columns} 列`, heads ? `表头 ${heads} 行` : "没有表头行（第一行也是数据）", ...(merged ? ["有合并的单元格（⟵ ↑ 是被它占的格）"] : []), ...(chart ? [`图表从它画（数据键 ${chart}）`] : [])];
  const own = table === node.el ? "" : tools.looks(table).trim();
  const caption = table.caption ? tools.own(table.caption) : "";
  return labeled(node, `表格 · ${facts.join(" · ")}${tools.looks(node.el, { skip: [CHART_SOURCE] })}${own ? ` table ${own}` : ""}`, [...(caption ? [plainRow(`表题：${caption}`)] : []), ...lines.map(plainRow)]);
}

// Its words: a row a line, its cells apart by a tab.
function readWords(node, { tools }) {
  return [...(tableOfUnit(node.el)?.rows ?? [])].map((row) => [...row.cells].map((cell) => tools.words(cell).replace(/\s+/g, " ")).join("\t"));
}

// Its cells as data: each one's words and Markdown, its spans, whether it is a header's, its class.
function readData(node, { tools }) {
  const table = tableOfUnit(node.el);
  if (!table) return null;
  return {
    header: table.tHead?.rows.length ?? 0,
    chart: node.el.getAttribute(CHART_SOURCE),
    rows: [...table.rows].map((row) => [...row.cells].map((cell) => ({
      text: tools.words(cell), markdown: tools.own(cell),
      ...(cell.rowSpan > 1 ? { rowspan: cell.rowSpan } : {}), ...(cell.colSpan > 1 ? { colspan: cell.colSpan } : {}),
      ...(cell.localName === "th" ? { th: true } : {}), ...(cell.getAttribute("class") ? { class: cell.getAttribute("class") } : {}),
    }))),
  };
}

/** Its name before 2026-10-26: written beside it and read when it is not there (a page of the old version in another tab). */
export const OLD_CELLS_MIME = "application/x-report-studio-cells";
/** The cells copied in `data` (a DataTransfer): under CELLS_MIME, else OLD_CELLS_MIME; "" when neither. */
export const cellsData = (data) => data.getData(CELLS_MIME) || data.getData(OLD_CELLS_MIME);

/**
 * A look with what a cell may have of it: the first of the classes of each kind (a color, an
 * alignment, a vertical one) and bold. A table an Agent wrote by hand may give a cell a text color and
 * a fill, which the page's tables never have (one color a cell).
 */
function carriedLook(look) {
  const taken = new Set();
  const kinds = [BLOCK_COLORS, CELL_ALIGNS.map(([name]) => name), CELL_VALIGNS.map(([name]) => name)];
  return look.split(" ").filter((name) => {
    const group = kinds.findIndex((names) => names.includes(name));
    if (group >= 0 && taken.has(group)) return false;
    taken.add(group);
    return true;
  }).join(" ");
}

/**
 * What of a table as tableData describes it a description can carry: the table itself when validTable
 * accepts it; else one cell with a color, an alignment, a vertical one and bold at most, a column's
 * width that is one of validWidth's or none; else (a merged cell crossing the header, which the
 * description's single header row cannot say) the table taken apart into its slots, each merged cell's
 * words in the slot it begins at, its look in all of them. Null when nothing of it can be carried.
 */
export function carriableTable(node, validCell) {
  if (validTable(node, validCell)) return node;
  const { spans, looks, widths, ...rest } = node;
  const own = {
    ...rest,
    ...(looks ? { looks: looks.map((row) => row.map((look) => (validLook(look) ? look : carriedLook(look)))) } : {}),
    ...(widths?.some((width) => validWidth(width) && width) ? { widths: widths.map((width) => (validWidth(width) ? width : null)) } : {}),
  };
  if (validTable({ ...own, ...(spans ? { spans } : {}) }, validCell)) return { ...own, ...(spans ? { spans } : {}) };
  const slots = tileSlots(node.rows.map((row, r) => ({ section: 0, cells: row.map((_, index) => ({ ref: [r, index], rowspan: spans?.[r][index][0] ?? 1, colspan: spans?.[r][index][1] ?? 1 })) })));
  if (!slots) return null;
  const home = (ref) => slots.places.get(ref);
  const from = (grid, r, c, empty) => grid ? grid[slots.matrix[r][c][0]][slots.matrix[r][c][1]] : empty;
  const flat = {
    ...own,
    rows: slots.matrix.map((cells, r) => cells.map((ref, c) => (home(ref).r === r && home(ref).c === c ? from(node.rows, r, c) : ""))),
    ...(own.looks ? { looks: slots.matrix.map((cells, r) => cells.map((_, c) => from(own.looks, r, c))) } : {}),
  };
  return validTable(flat, validCell) ? flat : null;
}

/**
 * A table as it is now, as the page describes it to the server (a new one is written from it:
 * file.mjs) and to the clipboard (another report's copy is made from it: clipboard/own/): its rows of
 * its cells' inline HTML (a cell's lists with it), its header row (a thead) and header column (each
 * body row's cell in the first column a th), its cells' looks when one has one, its columns' widths
 * when one has one, its cells' spans when one is merged (the table's tools may have changed any of
 * them before it is first written), whether its numeric columns are read and the key a chart drawn
 * from it reads it by (`chart`: its frame's data-doc-chart-source, src/shared/table-chart.mjs; a
 * table pasted anew in the report it was copied from keeps it, clipboard/own/chart-keys.mjs). `element`:
 * the table's frame, or the table.
 */
export function tableData(element, serializeInner) {
  const table = element.localName === "table" ? element : element.querySelector("table");
  const rows = [...(table?.rows ?? [])];
  const slots = rows.length ? slotsOf(rows) : null;
  const heads = table?.tHead?.rows.length ?? 0;
  const header = heads > 0;
  const column = rows.length > heads && Boolean(slots) && rows.slice(heads).every((row, index) => slots.matrix[heads + index][0].localName === "th");
  const looks = rows.map((row) => [...row.cells].map(lookOf));
  const widths = slots ? columnWidths(slots, widthOf) : [];
  const spans = rows.map((row) => [...row.cells].map((cell) => [cell.rowSpan, cell.colSpan]));
  const chart = (element.localName === "table" ? element.closest(".doc-table-wrap") : element)?.getAttribute(CHART_SOURCE);
  return {
    rows: rows.map((row) => [...row.cells].map((cell) => serializeInner(cell))),
    ...(header ? { header: true } : {}), ...(column ? { column: true } : {}),
    ...(looks.some((row) => row.some(Boolean)) ? { looks } : {}),
    ...(widths.some(Boolean) ? { widths } : {}),
    ...(spans.some((row) => row.some(([down, across]) => down > 1 || across > 1)) ? { spans } : {}),
    ...(element.getAttribute(NUMBERS) === "off" ? { numbers: false } : {}),
    ...(chart && CHART_KEY.test(chart) ? { chart } : {}),
  };
}

// ---------- a cell's pictures ----------
// 单元格里的图片 (page/table/pictures.mjs; source/blocks.mjs cellPictureProblem says what the file
// takes): an <img> amid a cell's words, a picture of the report's folder. On the page it shows where
// the server serves the folder (`src`, page/served.mjs), the file it is in data-ge-src, as an
// image block's; the cell's text writes it back from its element (the host's `pictures`, which
// core.mjs reads): <img src="assets/<file>" alt="…" width="N">, its attributes in the order the
// element has them, the file's own; one the browser put in from elsewhere, its file no picture of
// the folder, is no part of the text.

const PICTURE_FILE = /^assets\/[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/;
const PICTURE_WIDTH = /^[1-9]\d{0,3}$/;
const isPicture = (node) => node?.nodeType === 1 && node.localName === "img";

/** The file of a picture in a cell (assets/<file>), or null: none the page writes. */
export const pictureFile = (img) => {
  const file = img.getAttribute("data-ge-src") || img.getAttribute("src") || "";
  return PICTURE_FILE.test(file) ? file : null;
};

/**
 * A picture for a cell: the file `path` (assets/<file>) shown where the server serves it, its `alt`
 * words, its `width` in pixels (none: the kit's own size).
 */
export function cellPicture(doc, path, { alt = "", width = null } = {}) {
  const img = doc.createElement("img");
  img.setAttribute("src", servedFile(path));
  img.setAttribute("alt", alt);
  if (width) img.setAttribute("width", String(Math.round(width)));
  img.setAttribute("data-ge-src", path);
  img.draggable = false;
  return img;
}

// A cell's pictures as the file has them made the page's (core.mjs prepareBlock): shown where the server serves them.
function showPictures(root) {
  for (const img of root.querySelectorAll("img")) {
    const file = img.getAttribute("src") ?? "";
    if (!PICTURE_FILE.test(file)) continue;
    img.setAttribute("data-ge-src", file);
    img.setAttribute("src", servedFile(file));
    img.draggable = false;
  }
}

// A picture as the cell's text writes it: its markup, "" (no file of the folder), null (no picture).
function writtenPicture(node) {
  if (!isPicture(node)) return null;
  const file = pictureFile(node);
  if (!file) return "";
  const said = [...node.attributes].filter(({ name, value }) => name === "src" || name === "alt" || (name === "width" && PICTURE_WIDTH.test(value)));
  return `<img${said.map(({ name, value }) => ` ${name}="${escapeAttribute(name === "src" ? file : value)}"`).join("")}>`;
}
