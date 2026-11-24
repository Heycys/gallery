// What gallery check says of a database (多维表格) beyond what makes it read-only: what an Agent wrote that
// the format reads otherwise than it meant, each said with how to write it. A view naming a column by its
// name, a filter's value of the wrong shape, an option of no color, a column of no kind, a formula naming
// a column there is not, a header cell of no column, a cell that is no value of its column: the database
// still shows and takes edits, but not as written (a field left out, a filter hiding every record, a cell
// drawn gray), so each is a note, never a failure. What makes it read-only is the format's own problems
// (src/shared/database.mjs problemSaid), which `problemPlaces` finds the line of.
//
// The filter conditions, the totals and the formula language are the kit's own (kit/database/data/), so
// that what is said here is what the page does with them; and so is what `databaseReading` says each view
// shows (its records filtered and sorted, a board's columns, a calendar's days, a chart's numbers), which
// gallery check prints for every database, so that an Agent sees what it wrote without a browser.
import { COLUMN_ATTRIBUTE, COLUMN_TYPES, DATABASE_CLASS, LAYOUTS, OPTION_COLORS, PAGES_CLASS, RECORD_ATTRIBUTE, RECORD_ID, databasePages, databaseParts, isDate, isJsonType, optionNames, readDatabase, slotRecord } from "../shared/database.mjs";
import { DATA_MOST } from "../shared/components/installed.mjs";
import { chartData, valueWords } from "./kit/database/data/chart.js";
import { FUNCS, compile, todayStr } from "./kit/database/data/formula.js";
import { getValue, isEmpty, isError } from "./kit/database/data/values.js";
import { applyView, calc, calcKinds, canGroupBy, groupRows, isActive, opsOf } from "./kit/database/data/query.js";
import { boardColumns, recordsByDay } from "./kit/database/views/model.js";

const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const words = (value) => (typeof value === "string" ? value.trim() : value === undefined || value === null ? "" : String(value).trim());
const quoted = (value) => JSON.stringify(value);
const listed = (names) => names.join(", ");
const lineOf = (node) => node?.sourceCodeLocation?.startLine ?? null;
const attrOf = (node, name) => node?.attrs?.find((each) => each.name === name)?.value ?? null;
const elements = (node) => (node?.childNodes ?? []).filter((child) => child.tagName);
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The fields the JSON is read for, of the whole, a column, an option, a number's format, a view, a filter, a sort, a chart. */
export const FIELDS = {
  top: ["columns", "views"],
  column: ["id", "name", "type", "options", "numberFormat", "formula", "width", "align", "notes"],
  option: ["id", "name", "color", "done"],
  numberFormat: ["format", "decimals", "display"],
  view: ["id", "name", "layout", "hidden", "filters", "sorts", "groupBy", "calc", "showCalc", "boardBy", "boardHidden", "dateBy", "cardSize", "open", "wrap", "clickEdit", "chart"],
  filter: ["id", "prop", "op", "value", "segments"],
  sort: ["prop", "dir"],
  chart: ["kind", "x", "agg", "y", "color"],
};

// What an Agent writes for a field or a value, and what the format reads instead.
const FIELD_INSTEAD = {
  column: { label: "name", title: "name", kind: "type", choices: "options", values: "options", format: "numberFormat", expression: "formula" },
  view: { type: "layout", kind: "layout", filter: "filters", sort: "sorts", group: "groupBy", groupby: "groupBy", group_by: "groupBy", columns: "hidden", properties: "hidden", visible: "hidden", shown: "hidden", fields: "hidden", board: "boardBy", kanbanBy: "boardBy", groupField: "boardBy", date: "dateBy", calendarBy: "dateBy", totals: "calc", aggregations: "calc" },
  filter: { column: "prop", field: "prop", property: "prop", operator: "op", condition: "op", values: "value" },
  sort: { column: "prop", field: "prop", property: "prop", direction: "dir", order: "dir" },
  chart: { type: "kind", groupBy: "x", by: "x", category: "x", value: "y", measure: "y", aggregate: "agg", op: "agg" },
};
const TYPE_INSTEAD = {
  status: "select", single_select: "select", singleselect: "select", option: "select", options: "select", enum: "select", choice: "select",
  multi_select: "multi", multiselect: "multi", multiple: "multi", tags: "multi", tag: "multi", list: "multi",
  string: "text", rich_text: "text", richtext: "text", longtext: "text", person: "text", people: "text", user: "text", email: "text", phone: "text",
  int: "number", integer: "number", float: "number", currency: "number", percent: "number", money: "number",
  datetime: "date", time: "date", day: "date",
  bool: "checkbox", boolean: "checkbox", check: "checkbox", done: "checkbox",
  link: "url", href: "url", website: "url",
};
const LAYOUT_INSTEAD = { kanban: "board", cards: "gallery", card: "gallery", grid: "table", timeline: "calendar", graph: "chart", bar: "chart", pie: "chart" };
const COLORS = OPTION_COLORS.filter((color) => color !== "default");
const RELATIVE = ["today", "tomorrow", "yesterday", "nextweek", "lastweek"];
const CHART_X = ["select", "multi", "checkbox", "date", "text", "title", "number"];

// A field the JSON is not read for, said with the one meant where it is near.
function unknownFields(given, kind, where, say) {
  for (const key of Object.keys(given)) {
    if (FIELDS[kind].includes(key)) continue;
    const meant = FIELD_INSTEAD[kind]?.[key] ?? FIELDS[kind].find((field) => field.toLowerCase() === key.toLowerCase());
    say(`${where}: ${quoted(key)} is no field of a ${kind === "top" ? "database's JSON" : kind} and is not read${meant ? `: write ${quoted(meant)}` : ` (it reads ${listed(FIELDS[kind])})`}`);
  }
}

/**
 * The notes on a database's records' bodies (`pages`, its div.doc-database-pages straight in it), as `say` takes them:
 * a body that is no record's, one twice, what of the pages is no body, words straight in a body, a database in one, and
 * bodies together more than one commit writes (what a copy of the database carries); its rows' ids (data-record)
 * that are none or another row's.
 */
function bodyWarnings(host, pages, say) {
  const rows = [];
  const walkRows = (node) => elements(node).forEach((child) => (child.tagName === "tr" ? rows.push(child) : ["table", "thead", "tbody"].includes(child.tagName) && walkRows(child)));
  for (const table of elements(host).filter((child) => child.tagName === "table").slice(0, 1)) walkRows(table);
  const ids = new Map();
  for (const row of rows) {
    const id = attrOf(row, RECORD_ATTRIBUTE);
    if (id === null) continue;
    if (!RECORD_ID.test(id)) say(`a row's ${RECORD_ATTRIBUTE}=${quoted(id)} is no record id (letters, digits, - and _, 64 at most): the row is read as naming none, and no body is its`, row);
    else if (ids.has(id)) say(`two rows say ${RECORD_ATTRIBUTE}=${quoted(id)}: the second is another record, and the body record:${id} is the first's alone; give each its own id`, row);
    else ids.set(id, row);
  }
  if (pages.length > 1) say(`it holds more than one div.${PAGES_CLASS}: the first alone holds its records' bodies`, pages[1]);
  if (pages.length === 0) return;
  const { slots } = databasePages(host);
  for (const child of elements(pages[0])) if (!(child.tagName === "div" && attrOf(child, "data-doc-slot") !== null)) say(`the <${child.tagName}> in its div.${PAGES_CLASS} is no record's body (a body is a <div data-doc-slot="record:<id>"> straight in it): it is not shown`, child);
  let bytes = 0;
  for (const { name, record, first, node } of slots) {
    const end = node.sourceCodeLocation?.endOffset ?? 0;
    bytes += end - (node.sourceCodeLocation?.startOffset ?? end);
    if (!record) continue; // gallery check fails it (a slot of a database's pages is a record's body)
    if (!first) say(`a second body of record ${record} (data-doc-slot="${name}") is not shown: a record has one body`, node);
    else if (!ids.has(record)) say(`the body ${name} is no record's: no row of its table says ${RECORD_ATTRIBUTE}="${record}", so no record's details show it; give its record's <tr> that attribute`, node);
    if ((node.childNodes ?? []).some((child) => child.nodeName === "#text" && child.value.trim()) || elements(node).some((child) => ["a", "b", "strong", "em", "i", "span", "code", "br"].includes(child.tagName))) say(`the body ${name} holds words straight in it: write them in blocks (<p>, <h2>, <ul>…), as in any flow; until then they show but are not edited`, node);
    const inner = [];
    const look = (each) => elements(each).forEach((child) => ((attrOf(child, "class") ?? "").split(/\s+/).includes(DATABASE_CLASS) ? inner.push(child) : look(child)));
    look(node);
    for (const database of inner) say(`a database in the body ${name}: a record's body holds no database (the page offers and takes none there); put it in the document's flow`, database);
  }
  if (bytes > DATA_MOST) say(`its records' bodies together hold more than the ${DATA_MOST} bytes one commit writes: a copy of the database cannot carry them (a copy of it is refused); each body is edited as ever`, pages[0]);
}

/**
 * The notes on database `host` (a parse5 element of the page, div.doc-database), each { said, node }: what it
 * says, in English as gallery check's notes are, and the element its line is (null: the database's own).
 */
export function databaseWarnings(host) {
  const out = [];
  const say = (said, node = null) => out.push({ said, node });
  const kids = elements(host);
  // What it holds besides its two parts: none of it.
  const scripts = kids.filter((child) => child.tagName === "script");
  const tables = kids.filter((child) => child.tagName === "table");
  const isPages = (child) => child.tagName === "div" && (attrOf(child, "class") ?? "").split(/\s+/).includes(PAGES_CLASS);
  for (const child of kids) if (child.tagName !== "script" && child.tagName !== "table" && !isPages(child)) say(`the <${child.tagName}> inside the database is none of it (a database holds its <script type="application/json">, its <table> and its records' bodies in a div.${PAGES_CLASS} alone): put it before or after the database's div`, child);
  bodyWarnings(host, kids.filter(isPages), say);
  for (const script of scripts.filter((each) => !isJsonType(attrOf(each, "type")))) say(`its <script type=${quoted(attrOf(script, "type") ?? "")}> is not read: the columns and views are a <script type="application/json">`, script);
  if (scripts.filter((each) => isJsonType(attrOf(each, "type"))).length > 1) say("it holds more than one script of JSON: the first alone is read", scripts.filter((each) => isJsonType(attrOf(each, "type")))[1]);
  if (tables.length > 1) say("it holds more than one table: the first alone is its records", tables[1]);
  if (tables.length === 0 && kids.some((child) => holdsTable(child))) say("its <table> is not straight inside its div (it stands in another element): the database has no records; put the <table> itself right inside div.doc-database", kids.find(holdsTable));

  const parts = databaseParts(host);
  let given = null;
  if (parts.json !== null) {
    try {
      given = JSON.parse(parts.json);
    } catch {
      return out; // a failure of gallery check already
    }
    if (!isObject(given)) return out;
  }
  const database = readDatabase({ json: parts.json, header: parts.header, rows: parts.rows, links: parts.links, problems: parts.problems });
  const scriptNode = parts.script?.node ?? null;
  // The line of the column or view of id `id` in its script (the first "id" of it after the list named `from`), or the script's.
  const lineIn = (from, id) => {
    const start = lineOf(scriptNode);
    const text = parts.json ?? "";
    if (!start || typeof id !== "string" || !id) return scriptNode;
    const from_ = Math.max(0, text.indexOf(`"${from}"`));
    const found = new RegExp(`"id"\\s*:\\s*${escapeRegExp(JSON.stringify(id))}`, "g");
    found.lastIndex = from_;
    const match = found.exec(text);
    return match ? { sourceCodeLocation: { startLine: start + (text.slice(0, match.index).match(/\n/g)?.length ?? 0) } } : scriptNode;
  };
  if (!given) return [...out, ...cellWarnings(parts, database, new Set())];

  unknownFields(given, "top", "its JSON", (said) => say(/^its JSON: "(rows|records|data|items|entries)"/.test(said) ? `${said.replace(/ and is not read.*$/, "")}: the records are the rows of its <table>, a <tr> each, never JSON` : said, scriptNode));

  // ---------- columns ----------
  const columns = database.columns;
  const byId = new Map(columns.map((column) => [column.id, column]));
  const declared = new Set();
  const given_columns = given.columns;
  if (given_columns !== undefined && !Array.isArray(given_columns)) say(`its JSON's "columns" is no list: write "columns": [{ "id": …, "name": …, "type": … }, …]`, scriptNode);
  const rawColumns = Array.isArray(given_columns) ? given_columns : [];
  let titles = 0;
  rawColumns.forEach((raw, at) => {
    const here = lineIn("columns", isObject(raw) ? raw.id : null);
    const where = `column ${at + 1}${isObject(raw) && words(raw.name) ? ` ${words(raw.name)}` : ""}`;
    if (!isObject(raw)) return say(`${where}: ${quoted(raw)} is no column: a column is { "id": …, "name": …, "type": … }`, here);
    const id = words(raw.id) || `c${at + 1}`;
    if (declared.has(id)) return say(`${where}: the id ${quoted(id)} is another column's: this one is not read; give each column an id of its own`, here);
    declared.add(id);
    unknownFields(raw, "column", where, (said) => say(said, here));
    if (!words(raw.id)) say(`${where}: it has no "id" and is read as ${quoted(id)}: give it an id, and its header cell data-column="<that id>"`, here);
    if (!words(raw.name)) say(`${where}: it has no "name" (its header shows ${quoted(id)})`, here);
    const type = raw.type;
    // A kind written wrong: its fields are checked as of the kind it was meant to be, which the note names.
    let meant = null;
    if (type === undefined) say(`${where}: it has no "type" and is read as text (the kinds: ${listed(COLUMN_TYPES)})`, here);
    else if (!COLUMN_TYPES.includes(type)) {
      meant = TYPE_INSTEAD[String(type).toLowerCase()] ?? COLUMN_TYPES.find((each) => each === String(type).toLowerCase()) ?? null;
      say(`${where}: "type": ${quoted(type)} is no kind of column and is read as text${meant ? `: write "type": ${quoted(meant)}` : ` (the kinds: ${listed(COLUMN_TYPES)})`}`, here);
    }
    if (type === "title" && ++titles > 1) say(`${where}: a second title column, read as text: a database has one title column`, here);
    const read = byId.get(id);
    const kind = meant ?? read?.type ?? "text";
    if (raw.options !== undefined) {
      if (kind !== "select" && kind !== "multi") say(`${where}: "options" is read for a select or multi column alone`, here);
      else if (!Array.isArray(raw.options)) say(`${where}: "options" is no list: write "options": [{ "name": "…", "color": "blue" }, …]`, here);
      else {
        const names = new Set();
        let loose = 0;
        for (const option of raw.options) {
          if (!isObject(option)) {
            loose++;
            continue;
          }
          unknownFields(option, "option", `${where}, option ${words(option.name) || "?"}`, (said) => say(said, here));
          const name = words(option.name);
          if (!name) {
            say(`${where}: an option with no "name" is not read`, here);
            continue;
          }
          if (names.has(name)) say(`${where}: two options are named ${name}: the second is not read`, here);
          names.add(name);
          if (option.color !== undefined && !OPTION_COLORS.includes(option.color)) say(`${where}, option ${name}: "color": ${quoted(option.color)} is none of ${listed(COLORS)}: it shows with no color`, here);
          if (option.done === true && kind === "multi") say(`${where}, option ${name}: "done" counts on a select column's option alone`, here);
        }
        if (loose > 0) say(`${where}: ${loose === 1 ? "an option is" : `${loose} options are`} no object and not read: write each as { "name": "进行中", "color": "blue" }`, here);
      }
    }
    if (raw.numberFormat !== undefined) {
      if (kind !== "number") say(`${where}: "numberFormat" is read for a number column alone`, here);
      else if (!isObject(raw.numberFormat)) say(`${where}: "numberFormat" is no object: write { "format": "percent", "decimals": 0 }`, here);
      else {
        const format = raw.numberFormat;
        unknownFields(format, "numberFormat", `${where}, numberFormat`, (said) => say(said, here));
        if (format.format !== undefined && !["number", "thousands", "percent", "cny", "usd"].includes(format.format)) say(`${where}: numberFormat "format": ${quoted(format.format)} is none of number, thousands, percent, cny, usd`, here);
        if (format.decimals !== undefined && format.decimals !== null && !(Number.isInteger(format.decimals) && format.decimals >= 0 && format.decimals <= 6)) say(`${where}: numberFormat "decimals" is a whole number from 0 to 6`, here);
        if (format.display !== undefined && !["number", "bar", "stars"].includes(format.display)) say(`${where}: numberFormat "display": ${quoted(format.display)} is none of number, bar, stars`, here);
      }
    }
    if (raw.formula !== undefined && kind !== "formula") say(`${where}: "formula" is read for a formula column alone ("type": "formula")`, here);
    if (kind === "formula") formulaWarnings(raw.formula, where, columns, read, (said) => say(said, here));
    if (raw.width !== undefined && !(Number.isFinite(raw.width) && raw.width >= 40)) say(`${where}: "width" is a number of pixels, 40 or more`, here);
    if (raw.align !== undefined && !["left", "center", "right"].includes(raw.align)) say(`${where}: "align" is left, center or right`, here);
    else if (raw.align !== undefined && !["number", "date", "formula"].includes(kind)) say(`${where}: "align" is read for a number, date or formula column alone`, here);
    if (raw.notes !== undefined && (raw.notes !== true || kind !== "text")) say(`${where}: "notes": true marks a text column as the records' notes (shown in a record's details): it is read on a text column alone`, here);
  });
  cycleWarnings(columns, (said) => say(said, scriptNode));

  // ---------- its header against its columns ----------
  if (rawColumns.length > 0) {
    const held = new Set();
    const ofJson = (id) => declared.has(id) && byId.has(id);
    parts.header.forEach((cell, at) => {
      const id = words(cell.column);
      const name = words(cell.name);
      const node = headerCellAt(parts.table?.node, at);
      if (id) {
        const column = ofJson(id) ? byId.get(id) : null;
        if (!column) {
          const byName = columns.find((each) => declared.has(each.id) && each.name === id);
          say(`header cell ${name || at + 1}: data-column=${quoted(id)} names no column of the JSON${byName ? ` (${id} is the name of column ${quoted(byName.id)}: data-column is its id)` : ""}: it is read as a new column of words`, node);
          return;
        }
        held.add(column.id);
        if (column.type !== "formula" && name && name !== column.name) say(`header cell ${name}: its column ${quoted(column.id)} is named ${column.name} in the JSON, which is the name shown: to rename a column, change its "name" (and the header cell's words with it)`, node);
        return;
      }
      const found = columns.find((each) => declared.has(each.id) && each.type !== "formula" && each.name === name && !held.has(each.id));
      if (found) held.add(found.id);
      else if (!columns.some((each) => each.type === "formula" && each.name === name)) say(`header cell ${name || at + 1} names no column of the JSON (it has no data-column, and no column is named so): it is read as a new column of words; give it data-column="<the column's id>"`, node);
    });
    for (const column of columns) {
      if (!declared.has(column.id) || column.type === "formula" || held.has(column.id)) continue;
      say(`column ${column.name} (${quoted(column.id)}) has no header cell, so every record's value of it is empty: add <th data-column=${quoted(column.id)}>${column.name}</th> to the header row and a cell to each row in the same place`, parts.table?.node ?? scriptNode);
    }
  }
  out.push(...cellWarnings(parts, database, declared));

  // ---------- views ----------
  if (given.views !== undefined && !Array.isArray(given.views)) say(`its JSON's "views" is no list: write "views": [{ "id": "all", "name": "…", "layout": "table" }, …]`, scriptNode);
  const viewIds = new Set();
  (Array.isArray(given.views) ? given.views : []).forEach((raw, at) => {
    if (!isObject(raw)) return say(`view ${at + 1}: ${quoted(raw)} is no view: a view is { "id": …, "name": …, "layout": … }`, scriptNode);
    const id = words(raw.id) || `v${at + 1}`;
    const where = `view ${words(raw.name) || id}`;
    if (viewIds.has(id)) return say(`${where}: the id ${quoted(id)} is another view's: this one is not read`, lineIn("views", raw.id));
    viewIds.add(id);
    const here = lineIn("views", raw.id);
    viewWarnings(raw, where, columns, (said) => say(said, here));
  });
  repeatedNotes(host, parts, database, say);
  return out;
}

// A record whose body opens with its notes word for word: the details show them twice, among its values and in
// the body (the page, making a body of a record's notes, moves them there and empties the cell).
function repeatedNotes(host, parts, database, say) {
  const notes = database.columns.find((column) => column.notes);
  const title = database.columns.find((column) => column.type === "title");
  if (!notes) return;
  const flat = (text) => text.replace(/\s+/g, "");
  for (const { record, first, node } of databasePages(host).slots) {
    if (!record || !first) continue;
    const at = parts.rowAttrs.findIndex((attrs) => attrs.some(({ name, value }) => name === RECORD_ATTRIBUTE && value === record));
    const kept = flat(words(at < 0 ? "" : database.rows[at]?.values[notes.id]));
    const opening = elements(node)[0];
    if (!kept || !opening || flat(textOf(opening)) !== kept) continue;
    const name = title ? words(database.rows[at].values[title.id]) : "";
    say(`the body record:${record}${name ? ` (${name})` : ""} opens with its record's ${notes.name} word for word, which its details also show among its values: empty that cell (the page moves a record's notes into its body), or take the paragraph out`, opening);
  }
}

const holdsTable = (node) => node.tagName === "table" || elements(node).some(holdsTable);

// The header row's `at`th cell of a table's parse5 node: its <thead>'s row, or its first row.
function headerCellAt(table, at) {
  if (!table) return null;
  const head = elements(table).find((child) => child.tagName === "thead");
  const row = head ? elements(head).find((child) => child.tagName === "tr") : elements(elements(table).find((child) => child.tagName === "tbody") ?? table).find((child) => child.tagName === "tr");
  return elements(row).filter((child) => child.tagName === "th" || child.tagName === "td")[at] ?? row ?? table;
}

// A formula's references, and whether it reads: a column it names that there is not, a function it calls that
// there is not, words that are no formula (what the reader's cell would show), none at all.
function formulaWarnings(formula, where, columns, column, say) {
  const text = typeof formula === "string" ? formula : "";
  if (!text.trim()) return; // none written yet: its cells are empty, as the reader leaves a new one
  for (const [, name] of text.matchAll(/\{([^}]*)\}/g)) {
    const said = name.trim();
    if (columns.some((each) => each.id === said || each.name === said)) continue;
    say(`${where}: its formula names {${said}}, no column there is (a formula names a column by its name or its id, in braces): every record shows an error there`);
  }
  for (const [, called] of text.replace(/"[^"]*"|“[^”]*”|\{[^}]*\}/g, "").matchAll(/([A-Za-z_][A-Za-z_0-9]*)\s*\(/g)) {
    if (!FUNCS[called.toUpperCase()]) say(`${where}: its formula calls ${called}(), no function of the formula language (${listed(Object.keys(FUNCS))})`);
  }
  const parsed = compile(column?.formula ?? text);
  if (parsed instanceof Error && !/^(未知函数|找不到属性)/.test(parsed.message)) say(`${where}: its formula does not read; each record shows the error "${parsed.message}"`);
}

// Formulas naming each other round: each record shows 循环引用.
function cycleWarnings(columns, say) {
  const formulas = new Map(columns.filter((column) => column.type === "formula").map((column) => [column.id, [...(column.formula ?? "").matchAll(/\{([^}]+)\}/g)].map(([, id]) => id.trim())]));
  const said = new Set();
  for (const start of formulas.keys()) {
    const path = [];
    const walk = (id) => {
      if (path.includes(id)) return id === start;
      if (!formulas.has(id)) return false;
      path.push(id);
      const round = formulas.get(id).some(walk);
      path.pop();
      return round;
    };
    if (!said.has(start) && walk(start)) {
      said.add(start);
      const column = columns.find((each) => each.id === start);
      say(`column ${column.name}: its formula comes back to itself through other formulas: each record shows an error (循环引用)`);
    }
  }
}

// What the cells say that is no value of their column, a note a column (its first few cells named).
function cellWarnings(parts, database, declared) {
  const out = [];
  const title = database.columns.find((column) => column.type === "title");
  const lineOfRow = (at) => lineOf(parts.cells[at]?.[0]?.node);
  const recordOf = (row, at) => {
    const name = title ? words(row.values[title.id]) : "";
    const line = lineOfRow(at);
    return `${name ? `record ${name}` : `row ${at + 1}`}${line ? `, line ${line}` : ""}`;
  };
  const shown = (found) => `${found.slice(0, 3).map(({ row, at, said }) => `${recordOf(row, at)}: ${quoted(said)}`).join("; ")}${found.length > 3 ? `; and ${found.length - 3} more` : ""}`;
  const first = (found) => parts.cells[found[0].at]?.[0]?.node ?? null;
  // A row of fewer cells than its header: the columns past its last cell empty.
  const merged = parts.problems.some((problem) => problem.code === "span");
  const short = merged ? [] : parts.rows.map((cells, at) => ({ cells, at })).filter(({ cells }) => cells.length > 0 && cells.length < parts.header.length);
  if (short.length > 0) out.push({ said: `${short.length === 1 ? "a row has" : `${short.length} rows have`} fewer cells than the header (${short.slice(0, 3).map(({ at }) => `row ${at + 1}${lineOfRow(at) ? `, line ${lineOfRow(at)}` : ""}`).join("; ")}): the columns past each one's last cell are empty for it; a column's cell stands in its header cell's place`, node: parts.cells[short[0].at]?.[0]?.node ?? null });
  for (const column of database.columns) {
    if (!declared.has(column.id) || column.type === "formula") continue;
    const found = [];
    database.rows.forEach((row, at) => {
      const value = row.values[column.id];
      const said = parts.rows[at]?.[parts.header.findIndex((cell) => words(cell.column) === column.id || (!words(cell.column) && words(cell.name) === column.name))] ?? (typeof value === "string" ? value : "");
      if (column.type === "number" && typeof value === "string" && value) found.push({ row, at, said: value });
      else if (column.type === "date" && typeof value === "string" && value && !isDate(value)) found.push({ row, at, said: value });
      else if (column.type === "checkbox" && typeof value === "string") found.push({ row, at, said: value });
      else if (column.type === "select" && said && optionNames(said).length > 1) found.push({ row, at, said, two: true });
    });
    if (found.length === 0) {
      const added = (column.options ?? []).filter((option) => option.added);
      const listedOptions = (column.options ?? []).filter((option) => !option.added);
      if (added.length > 0 && listedOptions.length > 0) {
        const counts = added.map((option) => [option.name, database.rows.filter((row) => (Array.isArray(row.values[column.id]) ? row.values[column.id] : [row.values[column.id]]).includes(option.id)).length]);
        out.push({ said: `column ${column.name}: ${counts.length === 1 ? "a cell names an option" : "cells name options"} it does not list (${counts.map(([name, count]) => (count > 1 ? `${name} ×${count}` : name)).join(", ")}): each shows as a new option of a color picked in turn; list it in the column's "options", or write one of ${listed(listedOptions.map((option) => option.name))}`, node: null });
      }
      continue;
    }
    const kind = { number: "no number (write the number alone: 0.6, 1234.5, 60%)", date: "no date (write 2026-11-12)", checkbox: "neither checked nor not (write ✓, or leave it empty)", select: "two options in a single select (a select holds one; a multi column holds several, apart by \", \")" }[column.type];
    out.push({ said: `column ${column.name}: ${found.length === 1 ? "a cell is" : `${found.length} cells are`} ${kind}: ${shown(found)}; such a cell shows gray as written, and filters, sorts, totals and charts leave it out`, node: first(found) });
  }
  return out;
}

// A view's fields: the columns they name (by id, a name said so), the conditions of its filters and their values,
// its totals, its layout's own (a board's select, a calendar's date, a chart's categories and numbers).
function viewWarnings(view, where, columns, say) {
  unknownFields(view, "view", where, say);
  const byId = new Map(columns.map((column) => [column.id, column]));
  // The column a field names: by id; by name, said; none, said.
  const column = (value, field) => {
    if (value === undefined || value === null) return null;
    if (typeof value === "string" && byId.has(value)) return byId.get(value);
    const named = columns.find((each) => each.name === value || each.name === words(value));
    if (named) say(`${where}: ${field} ${quoted(value)} is a column's name: a view names a column by its id, ${quoted(named.id)}; as written it is not read`);
    else say(`${where}: ${field} ${quoted(value)} names no column (the ids: ${listed(columns.map((each) => each.id))}); it is not read`);
    return null;
  };
  const layout = view.layout;
  if (layout === undefined && (view.boardBy || view.dateBy || view.chart)) say(`${where}: it has no "layout" and shows as a table: write "layout": ${quoted(view.chart ? "chart" : view.dateBy ? "calendar" : "board")}`);
  else if (layout !== undefined && !LAYOUTS.includes(layout)) say(`${where}: "layout": ${quoted(layout)} is no layout and shows as a table${LAYOUT_INSTEAD[String(layout).toLowerCase()] ? `: write ${quoted(LAYOUT_INSTEAD[String(layout).toLowerCase()])}` : ` (the layouts: ${listed(LAYOUTS)})`}`);
  const shows = LAYOUTS.includes(layout) ? layout : "table";

  if (view.hidden !== undefined) {
    if (!Array.isArray(view.hidden)) say(`${where}: "hidden" is a list of the ids of the columns it hides`);
    else for (const id of view.hidden) column(id, "hidden names");
  }
  if (view.filters !== undefined) {
    if (!Array.isArray(view.filters)) say(`${where}: "filters" is a list: [{ "prop": "<column id>", "op": "is", "value": ["进行中"] }]`);
    else view.filters.forEach((filter) => filterWarnings(filter, where, column, say));
  }
  if (view.sorts !== undefined) {
    if (!Array.isArray(view.sorts)) say(`${where}: "sorts" is a list: [{ "prop": "<column id>", "dir": "asc" }]`);
    else for (const sort of view.sorts) {
      if (!isObject(sort)) {
        say(`${where}: the sort ${quoted(sort)} is no object and not read: write { "prop": ${quoted(typeof sort === "string" ? byId.get(sort)?.id ?? columns.find((each) => each.name === sort)?.id ?? sort : "<column id>")}, "dir": "asc" }`);
        continue;
      }
      unknownFields(sort, "sort", `${where}, a sort`, say);
      column(sort.prop, "a sort's prop");
      if (sort.dir !== undefined && sort.dir !== "asc" && sort.dir !== "desc") say(`${where}: a sort's "dir": ${quoted(sort.dir)} is asc or desc (read as asc)`);
    }
  }
  if (view.groupBy !== undefined && view.groupBy !== null) {
    const found = column(view.groupBy, "groupBy");
    if (found && shows === "table" && !canGroupBy(found)) say(`${where}: "groupBy" ${quoted(found.id)} is a ${found.type} column: a table groups by a select, multi, checkbox, date, text or number column`);
  }
  if (view.calc !== undefined) {
    if (!isObject(view.calc)) say(`${where}: "calc" is { "<column id>": "sum", … }`);
    else {
      for (const [id, kind] of Object.entries(view.calc)) {
        const found = column(id, "calc names");
        if (!found) continue;
        const kinds = calcKinds(found).flat();
        if (!kinds.includes(kind)) say(`${where}: calc ${quoted(kind)} for ${found.name} is none of a ${found.type} column's totals (${listed(kinds)})`);
      }
      if (Object.values(view.calc).some((kind) => kind && kind !== "none")) {
        if (shows === "table" && view.showCalc !== true) say(`${where}: its totals ("calc") are hidden: "showCalc": true shows them under the table`);
      }
    }
  }
  if (view.boardBy !== undefined) {
    const found = column(view.boardBy, "boardBy");
    if (found && found.type !== "select" && found.type !== "checkbox") say(`${where}: "boardBy" ${quoted(found.id)} is a ${found.type} column: a board's columns are the options of a select column`);
    // The board draws a column for every option: boardHidden is kept in the file and hides none of them.
    if (Array.isArray(view.boardHidden) ? view.boardHidden.length > 0 : view.boardHidden !== undefined) say(`${where}: "boardHidden" is kept but the board hides no column: it shows a column for every option of ${found?.name ?? "its column"}; to leave some records out, filter the view ("op": "isnot", "value": [${listed((Array.isArray(view.boardHidden) ? view.boardHidden : []).map((key) => quoted(found?.options?.find((option) => option.id === key)?.name ?? key)))}])`);
  }
  if (shows === "board" && view.boardBy === undefined) say(`${where}: a board needs "boardBy", the id of a select column (its options are the board's columns): until then it asks the reader to choose one`);
  if (view.dateBy !== undefined) {
    const found = column(view.dateBy, "dateBy");
    if (found && found.type !== "date" && found.type !== "formula") say(`${where}: "dateBy" ${quoted(found.id)} is a ${found.type} column: a calendar lays records out by a date column`);
  }
  if (shows === "calendar" && view.dateBy === undefined) say(`${where}: a calendar needs "dateBy", the id of a date column: until then it asks the reader to choose one`);
  if (view.chart !== undefined) {
    if (!isObject(view.chart)) say(`${where}: "chart" is { "kind": "column", "x": "<column id>", "agg": "count" }`);
    else chartWarnings(view.chart, where, column, say);
  }
  if (shows === "chart" && !(isObject(view.chart) && view.chart.x)) say(`${where}: a chart view draws nothing until its "chart" names "x", the column it puts the records in categories by`);
  if (view.cardSize !== undefined && !["s", "m", "l"].includes(view.cardSize)) say(`${where}: "cardSize" is s, m or l`);
  if (view.open !== undefined && !["side", "center"].includes(view.open)) say(`${where}: "open" is side or center`);
  for (const flag of ["wrap", "clickEdit", "showCalc"]) if (view[flag] !== undefined && typeof view[flag] !== "boolean") say(`${where}: ${quoted(flag)} is true or false (${quoted(view[flag])} is read as false)`);
  if (view.name !== undefined && typeof view.name !== "string") say(`${where}: "name" is words`);
}

// A filter: the column it names, its condition among those of the column's kind, its value of the shape that
// condition takes (a select's or a multi's options a list, by name; a date 2026-11-12 or today…; a box true or false).
function filterWarnings(filter, where, column, say) {
  if (!isObject(filter)) return say(`${where}: the filter ${quoted(filter)} is no object and not read: write { "prop": "<column id>", "op": "is", "value": ["…"] }`);
  unknownFields(filter, "filter", `${where}, a filter`, say);
  const found = column(filter.prop ?? filter.column ?? filter.field, "a filter's prop");
  if (!found) return;
  const at = `${where}: the filter on ${found.name}`;
  const ops = opsOf(found.type) ?? [];
  const op = ops.find((each) => each.op === filter.op);
  if (typeof filter.op !== "string" || !op) return say(`${at}: "op": ${quoted(filter.op ?? null)} is no condition of a ${found.type} column (${listed(ops.map((each) => each.op))}); it filters nothing`);
  const value = filter.value;
  if (filter.segments === true && found.type !== "select" && found.type !== "multi") say(`${at}: "segments" shows a select's or a multi's options as buttons, and is read on those alone`);
  if (!op.needs) return;
  const none = value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0);
  if (none) return; // no value chosen yet: it filters nothing, as a filter the reader just added
  if (op.needs === "option") {
    if (!Array.isArray(value)) return say(`${at}: the value of ${quoted(filter.op)} is a list of option names, ${quoted([String(value)])}: as written it ${filter.op === "is" || filter.op === "has" ? "hides every record" : "filters nothing"}`);
    const missing = value.filter((each) => each !== "__none" && !(found.options ?? []).some((option) => option.id === each || option.name === each));
    if (missing.length > 0) say(`${at}: ${listed(missing.map(quoted))} ${missing.length === 1 ? "is" : "are"} no option of ${found.name} (${listed((found.options ?? []).filter((option) => !option.added).map((option) => option.name))}), left out of the filter`);
  } else if (op.needs === "number") {
    if (!(typeof value === "number" || (typeof value === "string" && value.trim() !== "" && !Number.isNaN(Number(value))))) say(`${at}: the value of ${quoted(filter.op)} is a number, not ${quoted(value)}`);
    else if (found.numberFormat?.format === "percent" && Math.abs(Number(value)) > 0 && Math.abs(Number(value)) <= 1) say(`${at}: a percent column's filter takes the percent as it shows (60 for 60%): ${value} is ${value}%`);
  } else if (op.needs === "date") {
    if (!(typeof value === "string" && (isDate(value) || RELATIVE.includes(value)))) say(`${at}: the value of ${quoted(filter.op)} is a date, 2026-11-12, or one of ${listed(RELATIVE)}: not ${quoted(value)}`);
  } else if (op.needs === "bool") {
    if (typeof value !== "boolean") say(`${at}: the value of "is" for a checkbox column is true or false, not ${quoted(value)}`);
  } else if (typeof value !== "string" && typeof value !== "number") say(`${at}: the value of ${quoted(filter.op)} is words, not ${quoted(value)}`);
}

// A chart's kind, its categories (x), what it measures (agg, y) and its color.
function chartWarnings(chart, where, column, say) {
  unknownFields(chart, "chart", `${where}, chart`, say);
  if (chart.kind !== undefined && !["column", "bar", "line", "donut"].includes(chart.kind)) say(`${where}: chart "kind": ${quoted(chart.kind)} is column, bar, line or donut (read as column)`);
  const x = chart.x !== undefined && chart.x !== null ? column(chart.x, "chart x") : null;
  if (x && !CHART_X.includes(x.type)) say(`${where}: chart "x" ${quoted(x.id)} is a ${x.type} column: a chart's categories are a ${listed(CHART_X)} column's values`);
  if (chart.agg !== undefined && !["count", "sum", "avg"].includes(chart.agg)) say(`${where}: chart "agg": ${quoted(chart.agg)} is count, sum or avg (read as count)`);
  const y = chart.y !== undefined && chart.y !== null ? column(chart.y, "chart y") : null;
  if (y && y.type !== "number" && y.type !== "formula") say(`${where}: chart "y" ${quoted(y.id)} is a ${y.type} column: a sum or an average is of a number or formula column`);
  if ((chart.agg === "sum" || chart.agg === "avg") && (chart.y === undefined || chart.y === null)) say(`${where}: chart "agg": ${quoted(chart.agg)} needs "y", the id of the number column it adds up: until then it measures nothing`);
  if (chart.color !== undefined && chart.color !== "auto" && !COLORS.includes(chart.color)) say(`${where}: chart "color": ${quoted(chart.color)} is auto or one of ${listed(COLORS)}`);
}

/**
 * Where each problem that makes database `host` read-only stands (problemSaid's, of its parse5 element): a Map of
 * the problem (by its code and detail) to the line of its first instance, and the column of a cell, where found.
 */
export function problemPlaces(host, problems) {
  const places = new Map();
  const table = elements(host).find((child) => child.tagName === "table");
  const script = elements(host).find((child) => child.tagName === "script" && isJsonType(attrOf(child, "type")));
  const header = table ? headerRowOf(table) : null;
  const headerNames = header ? elements(header).filter((cell) => cell.tagName === "th" || cell.tagName === "td").map((cell) => textOf(cell).trim()) : [];
  // Every node of its table in document order, with the cell it stands in.
  const nodes = [];
  const walk = (node, cell) => {
    for (const child of node.childNodes ?? []) {
      const inCell = child.tagName === "td" || child.tagName === "th" ? child : cell;
      nodes.push({ node: child, cell });
      if (child.tagName) walk(child, inCell);
    }
  };
  if (table) walk(table, null);
  const columnOf = (cell) => {
    if (!cell) return "";
    const index = elements(cell.parentNode).filter((each) => each.tagName === "td" || each.tagName === "th").indexOf(cell);
    return headerNames[index] ? `, column ${headerNames[index]}` : "";
  };
  const placed = (found, cell = null) => (found ? `line ${lineOf(found)}${columnOf(cell)}` : null);
  for (const problem of problems) {
    const key = `${problem.code}:${problem.detail ?? ""}`;
    let where = null;
    if (problem.code === "json") where = script ? placed(script) : null;
    else if (["tfoot", "caption", "colgroup"].includes(problem.code)) where = placed(nodes.find(({ node }) => node.tagName === problem.code)?.node);
    else if (problem.code === "markup") {
      const found = nodes.find(({ node, cell }) => node.tagName === problem.detail && (cell || !["thead", "tbody", "tr", "td", "th"].includes(node.tagName)));
      where = found && placed(found.node, found.cell);
    } else if (problem.code === "link") {
      const found = nodes.find(({ node, cell }) => node.tagName === "a" && cell);
      where = found && placed(found.node, found.cell);
    } else if (problem.code === "span") {
      const found = nodes.find(({ node }) => (node.tagName === "td" || node.tagName === "th") && (attrOf(node, "colspan") !== null || attrOf(node, "rowspan") !== null));
      where = found && placed(found.node, found.node);
    } else if (problem.code === "attribute" || problem.code === "code") {
      const found = nodes.find(({ node }) => node.attrs?.some(({ name }) => name === problem.detail));
      where = found && placed(found.node, found.cell ?? (found.node.tagName === "td" || found.node.tagName === "th" ? found.node : null));
    } else if (problem.code === "comment") where = placed(nodes.find(({ node }) => node.nodeName === "#comment")?.node);
    else if (problem.code === "wide-row") where = placed(nodes.find(({ node }) => node.tagName === "tr" && node !== header && elements(node).filter((cell) => cell.tagName === "td" || cell.tagName === "th").length > headerNames.length)?.node);
    else if (problem.code === "header-rows" || problem.code === "bodies") where = placed(nodes.filter(({ node }) => node.tagName === (problem.code === "bodies" ? "tbody" : "thead"))[1]?.node ?? (header?.parentNode?.tagName === "thead" ? elements(header.parentNode).filter((each) => each.tagName === "tr")[1] : null));
    else if (problem.code === "same-column") where = placed(nodes.filter(({ node }) => node.tagName === "th" && attrOf(node, COLUMN_ATTRIBUTE) === problem.detail)[1]?.node);
    if (where) places.set(key, where);
  }
  return places;
}

function headerRowOf(table) {
  const head = elements(table).find((child) => child.tagName === "thead");
  if (head) return elements(head).find((child) => child.tagName === "tr") ?? null;
  const body = elements(table).find((child) => child.tagName === "tbody");
  return elements(body ?? table).find((child) => child.tagName === "tr") ?? null;
}
const textOf = (node) => (node.childNodes ?? []).map((child) => (child.nodeName === "#text" ? child.value : child.tagName ? textOf(child) : "")).join("");

const LAYOUT_SAID = { table: "table", board: "board", list: "list", gallery: "cards", calendar: "calendar", chart: "chart" };
const CARD_SIZES = { s: "small", m: "medium", l: "large" };

/**
 * What database `host` (a parse5 element) holds and what each of its views shows, in one line of gallery check's
 * (English, its data in its own words): its records and columns, whether the page edits it, then each view: its
 * layout and what it is by, how many records it shows (its filters and sorts applied, as the page applies them),
 * and the titles of a filtered one's few, in their order; a table's totals, each group's too; a board's columns with
 * their counts, a calendar's records with a date and without, a chart's numbers by category; what a card shows. Then
 * how wide it is drawn where its own data-doc-wide says (or `wideLook`, the document's 宽多维表格), its number
 * columns drawn as bars or stars, the records that have a body, and each formula's values.
 */
export function databaseReading(host, { wideLook = false } = {}) {
  const parts = databaseParts(host);
  const database = readDatabase({ json: parts.json, header: parts.header, rows: parts.rows, links: parts.links, problems: parts.problems, rowAttrs: parts.rowAttrs });
  const { columns, rows, views } = database;
  const byId = Object.fromEntries(columns.map((column) => [column.id, column]));
  const title = columns.find((column) => column.type === "title");
  const formulas = columns.filter((column) => column.type === "formula");
  const titles = (records) => records.map((row) => words(title ? row.values[title.id] : "") || "(untitled)");
  // A filter in words: its column's name, its condition, its value (options by their names).
  const filterSaid = (filter) => {
    const column = byId[filter.prop];
    if (!isActive(filter, column)) return `${column?.name ?? filter.prop} ${filter.segments ? "as buttons, none chosen" : `${filter.op} (no value: it filters nothing)`}`;
    const value = Array.isArray(filter.value) ? filter.value.map((id) => (id === "__none" ? "(none)" : column?.options?.find((option) => option.id === id)?.name ?? id)).join(", ") : filter.value;
    return `${column?.name ?? filter.prop} ${filter.op}${value === undefined || value === "" ? "" : ` ${value}`}`;
  };
  // What a card (a line, a calendar's item) of `view` shows: its title always, then the columns it does not hide, no notes, not `but`; its size where the view says one.
  const cards = (view, but) => {
    const shown = columns.filter((column) => column.type !== "title" && !column.notes && !view.hidden.includes(column.id) && !but.includes(column.id));
    const size = ["board", "gallery"].includes(view.layout) && CARD_SIZES[view.cardSize] ? `; ${CARD_SIZES[view.cardSize]} cards` : "";
    return `; cards show the title${shown.length ? ` and ${listed(shown.map((column) => column.name))}` : " alone"}${size}`;
  };
  // A table's totals (`calc`, shown with showCalc) worked out of `records` as the page works them out.
  const totalsOf = (view, records) => Object.entries(view.calc ?? {}).filter(([id, kind]) => byId[id] && kind && kind !== "none").map(([id, kind]) => `${byId[id].name} ${kind} ${calc(records, byId[id], kind, byId)}`);
  const viewSaid = (view) => {
    const name = view.name || LAYOUT_SAID[view.layout];
    const shown = applyView(rows, columns, view, "");
    const filtered = view.filters.length > 0 && shown.length < rows.length;
    const few = filtered && shown.length > 0 && shown.length <= 12 ? `: ${listed(titles(shown))}` : "";
    const filters = view.filters.length ? `, filters ${view.filters.map(filterSaid).join(" · ")}` : "";
    const sorted = `${filters}${view.sorts.length ? `, sorted by ${listed(view.sorts.map((sort) => `${byId[sort.prop]?.name} ${sort.dir}`))}` : ""}`;
    // A table's totals under it, worked out of the records it shows as the page works them out (shown with showCalc).
    const totals = view.layout === "table" && view.showCalc ? totalsOf(view, shown) : [];
    const count = `${shown.length} of ${rows.length} record${rows.length === 1 ? "" : "s"} shown${few}${totals.length ? `; totals ${totals.join(" · ")}` : ""}`;
    if (view.layout === "board") {
      const by = view.boardBy && byId[view.boardBy];
      if (!by) return `${name} (board by no column: it asks the reader to choose one)`;
      // Every column, as the page draws them (it hides none of `boardHidden`: viewWarnings says so).
      const { shown: groups } = boardColumns(shown, by, byId);
      return `${name} (board by ${by.name}: ${groups.map((group) => `${group.label} ${group.rows.length}`).join(" · ")}${sorted}${cards(view, [])})`;
    }
    if (view.layout === "calendar") {
      const by = view.dateBy && byId[view.dateBy];
      if (!by) return `${name} (calendar by no column: it asks the reader to choose one)`;
      const { undated } = recordsByDay(shown, by, byId);
      return `${name} (calendar by ${by.name}: ${shown.length - undated.length} dated, ${undated.length} undated${filters}${cards(view, [by.id])})`;
    }
    if (view.layout === "chart") {
      const chart = view.chart;
      const x = chart?.x && byId[chart.x];
      if (!x) return `${name} (chart of no categories: it draws nothing until "x" names a column)`;
      const y = chart.y && byId[chart.y];
      if (chart.agg !== "count" && !y) return `${name} (chart: the ${chart.agg} of no number column: it measures nothing)`;
      const said = valueWords(chart, y);
      const data = chartData(shown, chart, x, y, byId);
      const inks = chart.color && chart.color !== "auto" ? ` in shades of ${chart.color}` : "";
      return `${name} (${chart.kind} chart of ${chart.agg === "count" ? "records counted" : `the ${chart.agg} of ${y.name}`} by ${x.name}${inks}: ${data.map((each) => `${each.key} ${said(each.value)}`).join(" · ")}${filters})`;
    }
    // A table's groups, each with its count and, with showCalc, its totals (on its heading row in the page).
    const by = view.layout === "table" && view.groupBy && byId[view.groupBy];
    const group = by ? `, grouped by ${by.name} (${groupRows(shown, by, byId).map((each) => { const sums = view.showCalc ? totalsOf(view, each.rows) : []; return `${each.label} ${each.rows.length}${sums.length ? `: ${sums.join(" · ")}` : ""}`; }).join("; ")})` : "";
    return `${name} (${LAYOUT_SAID[view.layout]}${group}${sorted}, ${count}${view.layout === "list" || view.layout === "gallery" ? cards(view, []) : ""})`;
  };
  const state = database.readOnly ? "read-only (see its fix line)" : "editable";
  // How wide it is drawn: its own data-doc-wide over the document's look (宽多维表格), said where either makes it wide or it says so itself.
  const own = attrOf(host, "data-doc-wide");
  const width = own === "on" ? `, wide (its own data-doc-wide="on")` : own === "off" ? `, as wide as the text (its own data-doc-wide="off"${wideLook ? ", over the document's wide look" : ""})` : wideLook ? ", wide (the document's look)" : "";
  // Its number columns drawn otherwise than as numbers (numberFormat's display).
  const drawn = columns.filter((column) => column.type === "number" && ["bar", "stars"].includes(column.numberFormat?.display)).map((column) => (column.numberFormat.display === "stars" ? `${column.name} as stars (0 to 5)` : `${column.name} as a bar ${column.numberFormat.format === "percent" ? "of its percent" : "against its largest"}`));
  // The records that have a body (a slot of its pages its row's data-record names), and of those the ones whose notes are kept beside it.
  const notes = columns.find((column) => column.notes);
  const bodied = new Set(databasePages(host).slots.filter((slot) => slot.first && slot.record).map((slot) => slot.record));
  const named = new Set(parts.rowAttrs.map((attrs) => attrs.find(({ name }) => name === RECORD_ATTRIBUTE)?.value).filter(Boolean));
  const withBody = rows.filter((row) => bodied.has(row.id) && named.has(row.id));
  const noted = notes ? withBody.filter((row) => words(row.values[notes.id])) : [];
  const bodies = withBody.length ? `; bodies: ${withBody.length} record${withBody.length === 1 ? "" : "s"} (${withBody.length <= 12 ? listed(titles(withBody)) : `${listed(titles(withBody.slice(0, 12)))} …`})${noted.length ? `, ${listed(titles(noted))} keeping ${notes.name} too (its details show them among its values, over the body)` : ""}` : "";
  // Each formula's values as the page works them out (TODAY() today here): its records', how many are empty, and its failures or none.
  const worked = formulas.map((column) => {
    const values = rows.map((row) => getValue(row, column, byId));
    const failed = values.filter(isError);
    const said = (value) => (typeof value === "number" ? String(Math.round(value * 100) / 100) : typeof value === "boolean" ? (value ? "✓" : "✗") : Array.isArray(value) ? value.join(", ") : String(value));
    // Every record's value where there are 20 or fewer, else the first 8.
    const shown = rows.map((row, at) => [titles([row])[0], values[at]]).filter(([, value]) => !isEmpty(value)).slice(0, rows.length <= 20 ? 20 : 8).map(([name, value]) => `${name} ${said(value)}`);
    const empty = values.filter((value) => isEmpty(value) && !isError(value)).length;
    return `${column.name}: ${shown.join(" · ") || "none"}${shown.length < values.length - empty - failed.length ? " …" : ""}${empty ? `, ${empty} empty` : ""}${failed.length ? `, ${failed.length} failing (${failed[0].error})` : ", none failing"}`;
  });
  const today = formulas.some((column) => /TODAY\s*\(/i.test(column.formula ?? "")) ? ` (TODAY() is ${todayStr()} here: the page works it out on the reader's day)` : "";
  return `${rows.length} record${rows.length === 1 ? "" : "s"}, ${columns.length} column${columns.length === 1 ? "" : "s"}, ${state}${width}; views: ${views.map(viewSaid).join("; ")}${drawn.length ? `; numbers drawn: ${drawn.join(", ")}` : ""}${bodies}${worked.length ? `; formulas${today}: ${worked.join("; ")}` : ""}`;
}

/**
 * Where the JSON of database `host` (a parse5 element) stops reading, as a line of the file, or null: the position
 * JSON.parse names, else the first of the slips an Agent makes most (a comma before a closing bracket, two values
 * with no comma between them, a comment, a single quote).
 */
export function jsonErrorLine(host) {
  const parts = databaseParts(host);
  const text = parts.json ?? "";
  const start = lineOf(parts.script?.node);
  if (!start) return null;
  let at = null;
  try {
    JSON.parse(text);
    return null;
  } catch (error) {
    const named = /at position (\d+)/.exec(error.message);
    if (named) at = Number(named[1]);
  }
  if (at === null) {
    const slips = [/,\s*[}\]]/, /[}\]"\d]\s*\n\s*[{"[]/, /\/\/|\/\*/, /'[^']*'\s*:/];
    const found = slips.map((slip) => slip.exec(text)).filter(Boolean).sort((a, b) => a.index - b.index)[0];
    if (found) at = found.index + (found[0].startsWith(",") ? 0 : found[0].search(/\S/));
  }
  return at === null ? null : start + (text.slice(0, at).match(/\n/g)?.length ?? 0);
}
