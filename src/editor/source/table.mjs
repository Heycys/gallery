import { CELL_LOOKS, COLUMN_WIDTH, validLook, validWidth } from "../components/table/index.mjs";
import { tileSpans } from "../../shared/table-slots.mjs";
import { blank } from "./html.mjs";
import { attr } from "../../shared/html-tree.mjs";
import { startTagWith } from "./tag.mjs";
import { declarationsWith, lineIndent } from "./text.mjs";

// A table's rows and columns as the page changed them (docs/editor.md, "Tables"): the table is one
// unit, its cells text blocks; a change of its structure (rows or columns put in, taken out or
// moved, a header row or column switched, a cell's tag) is one operation of the table unit,
// { table: { rows } }, written as the table's new inside. What the page did not change is written as
// the file has it: a row whose cells all stay as they were is copied whole, a cell that stays keeps
// its start tag (its attributes) and, unless the page sends its text, its text; new rows and cells
// are written as the kit writes them. Only a table written as the kit writes one is changed so
// (plainTable, the one judgement of it: the instrumented page marks the table unit data-ge-grid, and
// the page's table tools exist for those units alone): an explicit thead (at most one) and one tbody
// of explicit rows of explicit cells after it (merged ones by rowspan and colspan, tiling a rectangle
// with the others), at least one row; a colgroup or caption stays where it is. The rows the operation gives
// must tile a rectangle too (shared/table-slots.mjs: no hole, no overlap, no span past its section).
//
//   rows: [{ head, from, cells: [{ from, tag, scope, html, look, width, rowspan, colspan }] }], in order, the head rows first:
//     head   the row is in the thead
//     from   the row's index among the table's rows as the page last knew them (thead's first), or null (new)
//     cells  from: [row, cell] of a cell as the page last knew it, or null (new); tag "td" or "th";
//            scope "row" | "col" | null (a header cell's, written as its scope attribute); html: its
//            text, when the page changed it (a new cell's always); look: its look classes
//            (components/table/index.mjs CELL_LOOKS: a text color, a fill, an alignment), when the
//            page changed them, written in place of those it had (its other classes stay); width:
//            its column's width ("160px", null: none), when the page changed it, written as
//            --doc-column-width in its style (its other properties stay); rowspan, colspan:
//            its spans, when the page changed them (a new cell's when it is merged), written as
//            its attributes past 1 (a cell that keeps its spans keeps the file's)

/**
 * A table unit's table as the kit writes one: { table, head, body, rows: [{ node, head, cells }] }, or
 * null. The one judgement of whether a table has the page's table tools and may be written as a
 * whole (components/table/file.mjs `plain`, which instrument() marks the unit by).
 */
export function plainTable(node) {
  const table = node?.tagName === "table" ? node : node?.childNodes?.find((child) => child.tagName === "table");
  const explicit = (element) => Boolean(element?.sourceCodeLocation?.startTag && element.sourceCodeLocation.endTag);
  const elementsOf = (element) => element.childNodes.filter((child) => child.tagName);
  const onlyElements = (element) => element.childNodes.every((child) => child.tagName || blank(child));
  if (!explicit(table) || !onlyElements(table)) return null;
  const parts = elementsOf(table);
  if (parts.some((part) => !["thead", "tbody", "colgroup", "caption"].includes(part.tagName))) return null;
  const heads = parts.filter((part) => part.tagName === "thead");
  const bodies = parts.filter((part) => part.tagName === "tbody");
  if (heads.length > 1 || bodies.length !== 1 || (heads.length === 1 && parts.indexOf(heads[0]) > parts.indexOf(bodies[0]))) return null;
  const plainRow = (row) => row.tagName === "tr" && explicit(row) && onlyElements(row)
    && elementsOf(row).every((cell) => (cell.tagName === "td" || cell.tagName === "th") && explicit(cell) && spanOf(cell, "rowspan") !== null && spanOf(cell, "colspan") !== null);
  const sections = [...heads, ...bodies];
  if (!sections.every((section) => explicit(section) && onlyElements(section) && elementsOf(section).every(plainRow))) return null;
  const rows = sections.flatMap((section) => elementsOf(section).map((row) => ({ node: row, head: section.tagName === "thead", cells: elementsOf(row) })));
  if (!tileSpans(rows.map((row) => ({ head: row.head, cells: row.cells.map((cell) => [spanOf(cell, "rowspan"), spanOf(cell, "colspan")]) })))) return null;
  return { table, head: heads[0] ?? null, body: bodies[0], rows };
}

// A cell's span as the file has it (1 without the attribute), or null when it is not a whole number 1 … MAX_SPAN.
const MAX_SPAN = 1000;
function spanOf(cell, name) {
  const value = attr(cell, name);
  if (value === undefined) return 1;
  return /^\s*\d{1,4}\s*$/.test(value) && Number(value) >= 1 && Number(value) <= MAX_SPAN ? Number(value) : null;
}
const validSpan = (span) => span === undefined || (Number.isInteger(span) && span >= 1 && span <= MAX_SPAN);

const startTag = (source, node) => source.slice(node.sourceCodeLocation.startTag.startOffset, node.sourceCodeLocation.startTag.endOffset);
const innerOf = (source, node) => source.slice(node.sourceCodeLocation.startTag.endOffset, node.sourceCodeLocation.endTag.startOffset);

// A cell's look as a class attribute's value: the file's classes (as written) that are not a look, then `look`.
const classesWith = (classes, look) => [...(classes ?? "").split(/\s+/).filter((name) => name && !CELL_LOOKS.includes(name)), ...look.split(" ").filter(Boolean)].join(" ");

// A merged cell's spans as attributes (past 1).
const spansText = (rowspan, colspan) => `${colspan > 1 ? ` colspan="${colspan}"` : ""}${rowspan > 1 ? ` rowspan="${rowspan}"` : ""}`;

// A cell's start tag as `tag`, its scope `scope` (null: none), its look `look`, its column's
// width `width` and its spans `spans` ([rowspan, colspan]) (undefined: as the file has them), its
// other attributes as the file has them (tag.mjs: each changed where it stands).
const cellTag = (source, node, tag, scope, look, width, spans) => startTagWith(source, node, [
  ...(look !== undefined ? [["class", (old) => classesWith(old?.value, look) || null]] : []),
  ...(width !== undefined ? [["style", (old) => declarationsWith(old?.value ?? "", [[COLUMN_WIDTH, width]]) || null]] : []),
  ["scope", scope],
  ...(spans !== undefined ? [["colspan", spans[1] > 1 ? String(spans[1]) : null], ["rowspan", spans[0] > 1 ? String(spans[0]) : null]] : []),
], tag);

/**
 * The table's new inside for `op` (see above), or null when the operation does not fit the table
 * (indexes the table has not, a cell used twice, rows of different lengths, text that is not a
 * cell's: `validCell(tag, html)`). Returns { start, end, text }: what replaces the table's inside.
 */
export function rewriteTable(source, node, op, { validCell }) {
  const plain = plainTable(node);
  if (!plain || !Array.isArray(op?.rows) || op.rows.length === 0 || op.rows.length > 2000) return null;
  const { table, rows } = plain;
  const used = new Set();
  const valid = op.rows.every((row, index) => row && typeof row.head === "boolean" && (index === 0 || !row.head || op.rows[index - 1].head)
    && (row.from === null || (Number.isInteger(row.from) && rows[row.from]))
    && Array.isArray(row.cells) && row.cells.length <= 5000 && row.cells.every((cell) => {
      if (!cell || !["td", "th"].includes(cell.tag) || ![undefined, null, "row", "col"].includes(cell.scope) || (cell.look !== undefined && !validLook(cell.look)) || (cell.width !== undefined && !validWidth(cell.width))) return false;
      if (!validSpan(cell.rowspan) || !validSpan(cell.colspan) || (cell.rowspan === undefined) !== (cell.colspan === undefined)) return false;
      if (cell.scope && cell.tag !== "th") return false;
      if (cell.from !== null) {
        const [r, c] = Array.isArray(cell.from) ? cell.from : [];
        if (!rows[r]?.cells[c] || used.has(`${r}:${c}`)) return false;
        used.add(`${r}:${c}`);
      } else if (typeof cell.html !== "string") return false;
      return cell.html === undefined || (typeof cell.html === "string" && cell.html.length <= 100000 && (cell.html === "" || validCell(cell.tag, cell.html)));
    }));
  if (!valid || !op.rows.some((row) => !row.head)) return null;
  // Each cell's spans: the operation's, else the file's (a new cell's 1).
  const spansOf = (cell) => (cell.rowspan !== undefined ? [cell.rowspan, cell.colspan] : cell.from === null ? [1, 1] : [spanOf(rows[cell.from[0]].cells[cell.from[1]], "rowspan"), spanOf(rows[cell.from[0]].cells[cell.from[1]], "colspan")]);
  const tiled = tileSpans(op.rows.map((row) => ({ head: row.head, cells: row.cells.map(spansOf) })));
  if (!tiled || op.rows.length * tiled.columns > 5000) return null;
  // Rows on lines of their own where the table has them so, section by section (a head written on one
  // line, <thead><tr>…</tr></thead>, beside a body a row a line: a row moved in the body, as a view of
  // the table moves one, keeps the body a row a line); a section the file has not, a head switched on,
  // as the table's first section; its sections at their indentation.
  const firstRow = (section) => rows.find((row) => row.node.parentNode === section)?.node ?? rows[0]?.node ?? null;
  const rowIndentOf = (section) => {
    const row = firstRow(section);
    return row ? lineIndent(source, row.sourceCodeLocation.startOffset) : null;
  };
  const sectionIndent = lineIndent(source, plain.body.sourceCodeLocation.startOffset);
  const tableIndent = lineIndent(source, table.sourceCodeLocation.startOffset);
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  const cellText = (cell) => {
    if (cell.from === null) {
      const classes = cell.look ? ` class="${classesWith("", cell.look)}"` : "";
      const style = cell.width ? ` style="${declarationsWith("", [[COLUMN_WIDTH, cell.width]])}"` : "";
      return `<${cell.tag}${classes}${style}${cell.scope ? ` scope="${cell.scope}"` : ""}${spansText(cell.rowspan ?? 1, cell.colspan ?? 1)}>${cell.html}</${cell.tag}>`;
    }
    const [r, c] = cell.from;
    const original = rows[r].cells[c];
    const scope = cell.tag === "th" ? cell.scope ?? null : null;
    const same = original.tagName === cell.tag && (attr(original, "scope") ?? null) === scope && cell.look === undefined && cell.width === undefined && cell.rowspan === undefined;
    const open = same ? startTag(source, original) : cellTag(source, original, cell.tag, scope, cell.look, cell.width, cell.rowspan === undefined ? undefined : [cell.rowspan, cell.colspan]);
    return `${open}${cell.html ?? innerOf(source, original)}</${cell.tag}>`;
  };
  const rowText = (row) => {
    const original = row.from === null ? null : rows[row.from];
    const unchanged = original && original.cells.length === row.cells.length && row.cells.every((cell, index) => cell.from?.[0] === row.from && cell.from[1] === index
      && cell.html === undefined && cell.look === undefined && cell.width === undefined && cell.rowspan === undefined && cell.tag === original.cells[index].tagName && (cell.tag !== "th" || (cell.scope ?? null) === (attr(original.cells[index], "scope") ?? null)));
    if (unchanged) return source.slice(original.node.sourceCodeLocation.startOffset, original.node.sourceCodeLocation.endOffset);
    return `${original ? startTag(source, original.node) : "<tr>"}${row.cells.map(cellText).join("")}</tr>`;
  };
  const section = (tag, list, existing) => {
    const open = existing ? startTag(source, existing) : `<${tag}>`;
    const rowIndent = rowIndentOf(existing ?? (rows.some((row) => row.head) ? plain.head : plain.body));
    if (rowIndent === null || sectionIndent === null) return `${open}${list.map(rowText).join("")}</${tag}>`;
    return `${open}${list.map((row) => `${eol}${rowIndent}${rowText(row)}`).join("")}${eol}${sectionIndent}</${tag}>`;
  };
  const heads = op.rows.filter((row) => row.head);
  const bodies = op.rows.filter((row) => !row.head);
  // The table's inside: its colgroup and caption where they are, then its sections.
  const keep = table.childNodes.filter((child) => child.tagName === "caption" || child.tagName === "colgroup");
  const pieces = [...keep.map((child) => source.slice(child.sourceCodeLocation.startOffset, child.sourceCodeLocation.endOffset)),
    ...(heads.length ? [section("thead", heads, plain.head)] : []), section("tbody", bodies, plain.body)];
  const inner = sectionIndent === null || tableIndent === null
    ? pieces.join("")
    : `${pieces.map((piece) => `${eol}${sectionIndent}${piece}`).join("")}${eol}${tableIndent}`;
  return { start: table.sourceCodeLocation.startTag.endOffset, end: table.sourceCodeLocation.endTag.startOffset, text: inner };
}
