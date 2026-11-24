import { escapeText } from "../../../shared/escape.mjs";
import { DATABASE_CLASS, PAGES_CLASS, cleanDatabase, databasePages, problemSaid, readDatabase, readElement, writeDatabase } from "../../../shared/database.mjs";
import { DATA_MOST, SLOT, componentAt, heldBy } from "../../../shared/components/installed.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { svg } from "../icons.mjs";
import { WIDE } from "../../../shared/table-across.mjs";
import { boxed, dataRows, flowRows, plainRow } from "../read-rows.mjs";

// 多维表格 (a database: src/shared/database.mjs): one block, a whole block the kit draws
// (render/kit/database/), its records a table and its columns and views a script of JSON. Nothing in it
// is text of the document's: the scan goes no further in (source/blocks.mjs), natural HTML leaves it as it
// stands (natural.mjs KIT_OWN), and all that happens inside it, its keys, its clipboard, its drags, is its
// drawing's (`keepsKeys`, page.mjs), but Ctrl+Z on what is no field, which is the page's undo. What its
// drawing writes goes as an instance's data parts do: page.mjs takes doc-component-edit (one `source`
// step of undo), the commits find it by `dataOf` (core.mjs dataChanges) and file.mjs writes it. It is
// moved, copied and deleted whole, as any block; copied to another document it carries its markup.
//
// Where the engines reach it (src/editor/page/ unless named): ../source/ (the scan stops at it, as at an
// instance: blocks.mjs; its unit and its parts: file.mjs), hints/ (`readOnly`), caret.mjs (`sealed`),
// editor.mjs's keys (`keepsKeys`, `undoHere`), clipboard/own/ (`clipboard`, written out as its table),
// the "/" menu (`types`, made by page.mjs `create`), gallery read (`read`).

/** Its mark in the menus: a table whose columns are fields. */
export const ICON = svg('<rect x="3.25" y="3.75" width="13.5" height="12.5" rx="2"/><path d="M3.25 7.75h13.5M7.5 3.75v12.5"/><path d="M10 10.25h4M10 13.25h2.5"/>');

/** The words of a database element, read as its parts say: { header, rows, database } (readDatabase's), and its script. */
export function databaseWords(element) {
  const read = readElement(element);
  const database = readDatabase(read);
  const { header, rows } = writeDatabase(database);
  return { header: header.map(({ name }) => name), rows, database, script: read.script, json: read.json, problems: database.problems };
}

/**
 * Its records' bodies in its pages' order (src/shared/database.mjs databasePages: the first slot of a record's
 * name), each { name, slot, title }: the words of its record's title, or null where its table has no such record.
 */
export function bodiesRead(element, database = readDatabase(readElement(element))) {
  const title = database.columns.find((column) => column.type === "title");
  return databasePages(element).slots.filter((slot) => slot.first && slot.record).map(({ name, record, node }) => {
    const row = database.rows.find((each) => each.id === record);
    return { name, slot: node, title: row ? String(row.values[title?.id] ?? "").trim() : null };
  });
}

// ---------- gallery read (../read-rows.mjs) ----------

const HOST = `div.${DATABASE_CLASS}`;

const READ_TYPES = { title: "标题", text: "文本", number: "数字", select: "单选", multi: "多选", date: "日期", checkbox: "复选框", url: "网址", formula: "公式" };
const READ_LAYOUTS = { table: "表格", board: "看板", list: "列表", gallery: "卡片", calendar: "日历", chart: "图表" };
// A number column drawn otherwise than as its number (numberFormat's display).
const READ_DISPLAYS = { bar: "显示成进度条", stars: "显示成星级" };
// What it is, on one line (gallery read --outline and --map): its columns, records and views.
const readSummary = (element) => {
  const { database } = databaseWords(element);
  return `${database.columns.length} 列 · ${database.rows.length} 条记录 · 视图：${database.views.map((each) => each.name || READ_LAYOUTS[each.layout]).join("、")}`;
};
// A cell for a Markdown table's row: its words on one line, a | escaped.
const piped = (text) => String(text).replace(/\r?\n/g, " ").replace(/\|/g, "\\|");

// A formula's columns by their names, as an Agent writes them ({估时}), not by the ids it is worked out by.
const namedFormula = (formula, columns) => formula.replace(/\{([^}]+)\}/g, (whole, id) => {
  const column = columns.find((each) => each.id === id);
  return column ? `{${column.name}}` : whole;
});

// A column as gallery read says it: its name, its id and kind, and what more it is (its options, an option the
// cells name that its JSON does not list, its formula, notes), so that a view's or a header cell's id is found by it.
function readColumn(column, columns) {
  const more = [];
  const listed = (column.options ?? []).filter((option) => !option.added);
  const added = (column.options ?? []).filter((option) => option.added);
  if (listed.length) more.push(listed.map((option) => `${option.name}${option.done ? "✓" : ""}`).join("、"));
  if (added.length) more.push(`格子里另写了（JSON 没列）：${added.map((option) => option.name).join("、")}`);
  if (column.type === "number" && column.numberFormat?.format && column.numberFormat.format !== "number") more.push(column.numberFormat.format);
  if (column.type === "number" && READ_DISPLAYS[column.numberFormat?.display]) more.push(READ_DISPLAYS[column.numberFormat.display]);
  if (column.type === "formula") more.push(`= ${namedFormula(column.formula, columns)}`);
  if (column.notes) more.push("备注");
  return `${column.name}（${column.id} · ${READ_TYPES[column.type] ?? column.type}${more.length ? `：${more.join("；")}` : ""}）`;
}

// The rows of a database's table as the file has them, each with its line in doc.html (view.tools.lineAt): its
// header row, then a row a record (a table with no <thead>: its first row the header).
function tableRows(table, view) {
  if (!table) return { head: null, records: [] };
  const all = [...table.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr")];
  const headed = Boolean(table.querySelector(":scope > thead > tr"));
  const head = headed ? table.querySelector(":scope > thead > tr") : all[0] ?? null;
  const line = (row) => view?.tools?.lineAt?.(row) ?? null;
  return { head: head && line(head), records: all.filter((row) => row !== head && row.parentElement?.localName !== "thead").map(line) };
}

/**
 * Boxed: its columns (each with its id) and its views, said; what makes it read-only; its records as a Markdown
 * table of its file's table, header and cells in the file's order and words, each record at its line in doc.html;
 * what the table leaves out (a formula's values); then its columns and views as its script has them.
 */
function readDatabaseRows(node, view) {
  const { database, script, json, problems } = databaseWords(node.el);
  const read = readElement(node.el);
  const views = database.views.map((each) => `${each.name || READ_LAYOUTS[each.layout]}（${each.id} · ${READ_LAYOUTS[each.layout]}）`);
  const formulas = database.columns.filter((column) => column.type === "formula");
  const out = [
    plainRow(`列：${database.columns.map((column) => readColumn(column, database.columns)).join(" · ")}`),
    plainRow(`视图：${views.join("、")}${json ? "" : "（没有 JSON：按表头读成文字列）"}`),
    ...(problems.length > 0 ? [plainRow(`提示：这个多维表格只能看，改不了：${problems.map((problem) => problemSaid(problem, "zh")).join("；")}`)] : []),
    plainRow(""),
  ];
  const header = read.header.map((cell) => cell.name);
  if (header.length) {
    const lines = tableRows(read.table, view);
    const row = (text, line) => ({ text, line, id: null, node: null });
    out.push(row(`| ${header.map(piped).join(" | ")} |`, lines.head), plainRow(`| ${header.map(() => "---").join(" | ")} |`));
    read.rows.forEach((cells, at) => out.push(row(`| ${cells.map(piped).join(" | ")} |`, lines.records.length === read.rows.length ? lines.records[at] : null)));
  }
  if (formulas.length) out.push(plainRow(`公式列（${formulas.map((column) => column.name).join("、")}）没有格子，不在上表：值按它的公式（见“列”）从同一条记录的别的列算出。`));
  // Its records' bodies, each boxed under its record's title, its blocks as any (the reader's tree puts them
  // under the database, each by its slot's name: `place`).
  for (const { name, title } of bodiesRead(node.el, database)) {
    const held = node.children.filter((child) => child.place === name);
    if (held.length === 0) continue;
    out.push(plainRow(""), ...boxed(null, title === null ? `正文（${name}：表格里没有这条记录）` : `正文「${title || "无标题"}」（${name}）`, flowRows(held, view)));
  }
  if (script) {
    // Its JSON as the file has it, each line at its line in doc.html: the script's own line, past the blank lines its text opens with.
    const start = view?.tools?.lineAt?.(script) ?? null;
    const skipped = (/^(?:[ \t]*\n)*/.exec(script.textContent)?.[0].match(/\n/g) ?? []).length;
    const json = dataRows(script).map((row, at, all) => (start !== null && at > 0 && at < all.length - 1 ? { ...row, line: start + skipped + at - 1 } : row));
    out.push(plainRow(""), plainRow("列和视图的 JSON："), ...json);
  }
  // Its element's own attributes as the file writes them ({data-doc-wide="on"}: its own 宽多维表格), its id aside.
  const looks = view?.tools?.looks?.(node.el) ?? "";
  return boxed(node, `多维表格 · ${database.columns.length} 列${formulas.length ? `（公式 ${formulas.length} 列）` : ""} · ${database.rows.length} 条记录${looks}`, out);
}

// What other programs read of it: its table, the header row its columns' names, each cell its words.
const tableOf = (element) => {
  const { header, rows } = databaseWords(element);
  return { header: true, rows: [header, ...rows].map((cells) => cells.map((cell) => escapeText(cell).replace(/\r?\n/g, "<br>"))) };
};

export default {
  name: "database",
  listed: () => t("多维表格"),
  // Its drawing and its parts say nothing as read-only (its records' bodies are the document's blocks, each saying what it says anywhere).
  readOnly: [{ rank: 3, at: (element) => element.matches(HOST) || (componentAt(element) && Boolean(heldBy(element)?.matches(HOST))), says: null }],
  sealed: `div.${DATABASE_CLASS}`,
  components: [DATABASE_CLASS],
  units: {
    database: {
      name: t("多维表格"),
      icon: ICON,
      match: [{ rank: 86, tag: "div", class: DATABASE_CLASS }],
      boxed: true,
      chapter: true,
      copy: "itself",
      // Its own 宽多维表格, on or off over the page's (the block menu's switch: page.mjs menuItems).
      attributes: { [WIDE]: (value) => value === "on" || value === "off" },
      read: {
        name: "多维表格",
        title: (node) => readSummary(node.el),
        // Listed by gallery read --outline after the headings, each with its id: an Agent reads one alone by --block.
        outline: true,
        rows: readDatabaseRows,
        words: (node, view) => { const { header, rows } = databaseWords(node.el); return [...[header, ...rows].map((cells) => cells.join("\t")), ...(view?.flowWords?.(node.children) ?? [])]; },
        // `rows` its values (an option by its id), `records` the cells' words as its table writes them, both by column id.
        data: (node) => {
          const { database, rows, problems } = databaseWords(node.el);
          const cells = database.columns.filter((column) => column.type !== "formula");
          return { columns: database.columns, views: database.views, rows: database.rows.map((row) => row.values), records: rows.map((words) => Object.fromEntries(cells.map((column, at) => [column.id, words[at]]))), readOnly: problems.length > 0, problems: problems.map((problem) => problemSaid(problem, "zh")) };
        },
        lost: () => "多维表格 {n} 个（写成它的表格，没有视图和列的设置）",
      },
    },
  },
  boxes: {
    // A record's body (a slot of its database's pages, data-doc-slot="record:<id>": src/shared/database.mjs): the
    // document's blocks, as a column's and an instance's slot's are, a disclosure's content's rules for an empty one
    // (holdsOne, a plain div a group), Ctrl+A going no further than it (it shows in the record's details alone), and
    // no database in it (except).
    record: { role: "flow", name: t("记录正文"), groups: true, holdsOne: true, selectAll: { content: true, top: true }, except: ["database"], find: (unit, key) => databasePages(unit).slots.find((slot) => slot.first && slot.name === key)?.node ?? null },
  },
  types: {
    // Made by the "/" menu (page.mjs `create`: three columns, three empty records, a table's view) or a
    // copy from another document; written from the markup the page sends (`extras`: its parts as they are).
    database: {
      menu: ["basic", 14.5], fresh: 9,
      tag: "div", className: DATABASE_CLASS, kind: "database", bare: true,
      // Its markup, its records' bodies that hold blocks empty slots in it, and those blocks apart (`children`, each
      // in the slot `boxKeys` names: blocks made on the page, as an instance's slots' are).
      extras(element, { nodes } = {}) {
        const held = madeBodies(element).flatMap(({ name, node }) => (nodes?.(node) ?? []).map((child) => [name, child]));
        const names = [...new Set(held.map(([name]) => name))];
        return { html: databaseMarkup(element, names), ...(held.length > 0 ? { children: held.map(([, child]) => child), boxKeys: held.map(([name]) => name) } : {}) };
      },
      // Copied as itself in its document where it has no body; any other carries its markup and its bodies' blocks
      // apart (`flows`), made anew where it is pasted (page.mjs build), in its document too; other programs get its table.
      clipboard: {
        kind: "table",
        read: (unit) => tableOf(unit),
        // After its table, each record's body that holds blocks: its record's title a line in bold, then its blocks.
        after: (unit, how) => bodiesRead(unit).map(({ name, slot, title }) => ({ title: title || name, lines: how.lines(how.unitsOf(slot)) }))
          .filter(({ lines }) => lines.length > 0).map(({ title, lines }) => [`**${title.replace(/[\\*_[\]`]/g, "\\$&")}**`, "", ...lines]),
        // Its rows as a Markdown table's: no cell of it spans others.
        grid: (data, columns, write) => data.rows.map((row) => Array.from({ length: columns }, (_, at) => write(row[at] ?? ""))),
        // Its bodies' blocks described as any (`flows`, by slot): none where one holds a block no copy makes, or where
        // all of it is more than one commit writes (bodiesTooLong: page.mjs says so as the copy is refused).
        data(node, { holding } = {}) {
          const bodies = databasePages(node).slots.filter((slot) => slot.first && slot.record && slot.node.children.length > 0);
          const flows = Object.fromEntries(bodies.map((slot) => [slot.name, slot.node.hasAttribute("data-ge-box") ? holding?.(slot.node) ?? null : null]));
          if (Object.values(flows).some((blocks) => !blocks)) return null;
          const html = databaseMarkup(node, Object.keys(flows));
          if (bodiesTooLong(html, flows)) return null;
          return { type: "database", html, ...(bodies.length > 0 ? { flows } : {}), ...tableOf(node) };
        },
        // What its bodies hold, among a paste's blocks (blocks.mjs `holds`).
        holds: (block) => (block.flows && typeof block.flows === "object" ? Object.values(block.flows).filter(Array.isArray).flat() : []),
        // Its markup, parsed apart from the page (an inert template: nothing in it loads or runs), a database of
        // its format and nothing else (cleanDatabase), which is what build makes anew; its bodies' slots empty in it,
        // each named once in `flows`, which holds blocks a body takes.
        check(block, { string, valid, doc }) {
          if (!string(block.html, 1e6) || !Array.isArray(block.rows) || !block.rows.every((row) => Array.isArray(row) && row.every((cell) => string(cell, 1e5)))) return false;
          const root = cleanDatabase(parsedApart(block.html, doc), doc);
          if (!root) return false;
          const names = databasePages(root).slots.map((slot) => slot.name);
          if (names.length === 0) return block.flows === undefined;
          const { flows } = block;
          return Boolean(flows) && typeof flows === "object" && !Array.isArray(flows) && names.length === Object.keys(flows).length
            && names.every((name) => Array.isArray(flows[name]) && flows[name].every((inner) => valid(inner, "record")));
        },
        text: (block) => block.rows.flat(),
      },
      label: t("多维表格"), icon: ICON, words: "多维表格 数据库 duoweibiaoge dwbg database records board kanban 看板 日历 视图 views",
      glance: { row: 9.5, name: "多维表格", write: "`div.doc-database` › `<script type=\"application/json\">` (its columns and views), then `<table>` (a row per record, `th[data-column]`)", rule: "Databases" },
    },
  },
};

// The one element `html` is, parsed in a template of `doc` (inert: nothing of it loads or runs), or null.
function parsedApart(html, doc) {
  const template = doc.createElement("template");
  template.innerHTML = html.trim();
  const [root, ...more] = [...template.content.childNodes].filter((node) => !(node.nodeType === 3 && !node.data.trim()));
  return more.length === 0 && root?.nodeType === 1 ? root : null;
}

/**
 * A database's markup as the file is to hold it, from the element on the page: its class, its script of
 * JSON and its table as they are now, nothing the page or the kit put in it; and where `bodies` names slots
 * (record:<id>, those whose blocks go apart), its pages holding those slots empty.
 */
export function databaseMarkup(element, bodies = []) {
  const { script, table } = readElement(element);
  // A slot a line, so that the blocks the file writes in it stand on lines of their own.
  const pages = bodies.length > 0 ? `<div class="${PAGES_CLASS}">\n${bodies.map((name) => `  <div ${SLOT}="${name}"></div>\n`).join("")}</div>` : "";
  const parts = [script ? `<script type="application/json">${script.textContent}</script>` : "", table ? `<table>${table.innerHTML}</table>` : "", pages].filter(Boolean);
  return `<div class="${DATABASE_CLASS}">\n${parts.join("\n")}\n</div>`;
}

// Its records' bodies on the page that are boxes (made on the page, or the file's), each { name, node }.
const madeBodies = (element) => databasePages(element).slots.filter((slot) => slot.first && slot.record && slot.node.hasAttribute("data-ge-box")).map(({ name, node }) => ({ name, node }));

/** Whether a database's markup and its bodies' blocks (`flows`) together are more than one commit writes (DATA_MOST): what no copy of it carries. */
export const bodiesTooLong = (html, flows = {}) => html.length + JSON.stringify(flows).length > DATA_MOST;
