// A database (多维表格) as its file holds it: one block, div.doc-database, holding a script of JSON
// (its columns and views) and a <table> (its records, a row each). Every side reads and writes it
// through this module alone: the kit's database (src/render/kit/database/), the page editor and the
// server (src/editor/components/database/), gallery read and the checks. Pure: no DOM, no Node.
//
//   <div class="doc-database">
//     <script type="application/json">{ "columns": [...], "views": [...] }</script>
//     <table>
//       <thead><tr><th data-column="title">任务</th><th data-column="status">状态</th></tr></thead>
//       <tbody><tr><td>登录页改版</td><td>已完成</td></tr></tbody>
//     </table>
//   </div>
//
// The JSON holds what each column is (its id, name, type, options and their colors, the option that
// counts as done, a number's format, its alignment and width, a formula) and the views; the records
// are the table's rows, a cell a value, each cell's column the header's data-column, the header's
// words its name. A value is written as a reader reads it: words as they are, a number as its value
// (0.6: its format is how it shows), an option by its name, several by their names apart by ", ", a
// date as 2026-11-12, a checked box as ✓ and an unchecked one empty. A formula column has no cells:
// it is worked out where it shows, the file holding its formula alone. A column marked `notes` is the
// records' notes: words of several lines, shown in a record's details and in no table column.
//
// What a file holds that is no value of its column is kept as it was written (`dirty`), and so is
// what an Agent wrote without the JSON: a table alone is read as columns of words named by its header,
// its first column the title, each header cell a column of its own (two of the same words two columns).
// A number is written as its shortest words (String), every digit it holds, and read back as itself. An option a cell names that the column does not list is added as the
// file is read (`added`), and written to the JSON only once the reader changes that column. A cell is
// written back as the file had it (its markup, `raw`) until the reader changes what it holds: a value
// that is none of its kind, two names in a single select, 1,234.5, a url cell's link with its words.
//
// What the format cannot hold, it never rewrites: JSON that does not read, and a table holding more than
// a header row, rows of cells and in them words, line breaks and a url cell's one link (a <tfoot>, a
// caption, a second header row or <tbody>, cells past the header, merged cells, attributes, other markup,
// two header cells of one column, cells under a formula's header) make a database read-only (`problems`, `readOnly`), which the kit shows with a note and gallery check
// says (problemSaid). Its JSON is a script of type application/json alone (no ld+json, no other +json).
// So does an attribute that changes nothing it holds but that no write of its table could carry (what
// refusedInData refuses: a block's identity, data-block-id, a value that is an address of code), which
// would leave it looking editable with every change refused.
//
// A record may have a body: the document's own blocks (headings, lists, pictures…), written after the
// table in a div.doc-database-pages, one slot a record (data-doc-slot="record:<id>"), its record the row
// whose data-record says that id. A record with no body has no slot (and its row needs no id); the page
// editor edits a body as any flow of the document, the kit shows it in the record's details.
//
//   <table>…<tr data-record="r7">…</tr>…</table>
//   <div class="doc-database-pages">
//     <div data-doc-slot="record:r7"><h2>…</h2><p>…</p></div>
//   </div>

import { refusedInData } from "./components/installed.mjs";
import { PROVISIONAL } from "./provisional.mjs";

/** The class that makes an element a database. */
export const DATABASE_CLASS = "doc-database";

/** The attribute of a header cell naming its column (its id in the JSON). */
export const COLUMN_ATTRIBUTE = "data-column";

/** The shape of what a database holds, which a page editor's write of one is held to (its `definition`). */
export const DATABASE_FORMAT = "database/1";

/** The attribute of a record's row naming it (its id), which its body's slot goes by. */
export const RECORD_ATTRIBUTE = "data-record";

/** The class of the element after a database's table holding its records' bodies, a slot each. */
export const PAGES_CLASS = "doc-database-pages";

/** What a record's id may be: letters, digits, "-" and "_", 64 at most. */
export const RECORD_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** The name of the slot of record `id`'s body. */
export const recordSlot = (id) => `record:${id}`;

/** The record a slot's name says (`record:<id>`), or null. */
export const slotRecord = (name) => {
  const found = /^record:(.+)$/.exec(typeof name === "string" ? name : "");
  return found && RECORD_ID.test(found[1]) ? found[1] : null;
};

/** A new record id, none of `taken` (a Set of ids): a letter and six of letters and digits. */
export function newRecordId(taken = new Set()) {
  for (;;) {
    const id = `r${Math.random().toString(36).slice(2, 8).padEnd(6, "0")}`;
    if (!taken.has(id)) return id;
  }
}

/** The kinds of column. */
export const COLUMN_TYPES = ["title", "text", "number", "select", "multi", "date", "checkbox", "url", "formula"];

/** The colors an option takes: none of its own, then the kit's nine (src/shared/colors.mjs). */
export const OPTION_COLORS = ["default", "gray", "brown", "orange", "yellow", "green", "blue", "purple", "pink", "red"];

/** The layouts a view takes. */
export const LAYOUTS = ["table", "board", "list", "gallery", "calendar", "chart"];

/** The type of its script of JSON: this one alone. */
export const JSON_TYPE = "application/json";

/**
 * Whether a script's `type` makes it a database's JSON part: application/json in any case (a browser's
 * selector [type="application/json"], which the page and the kit find the part by, reads a type so), kept
 * as it is spelled. The one test every reader and writer of the part goes by; ld+json and others are none.
 */
export const isJsonType = (type) => typeof type === "string" && type.toLowerCase() === JSON_TYPE;

/**
 * Whether an attribute of its table's sections, rows, cells or a url cell's link changes nothing the format
 * holds, so that a table carrying it is written all the same, the attribute kept where it was: scope,
 * class, id, lang, dir, title, data-* (but data-column, and Gallery's own data-ge-*, data-doc-*). Any other
 * (colspan, rowspan, style, a handler…) makes the database read-only.
 */
export const harmlessAttribute = (name) => ["scope", "class", "id", "lang", "dir", "title"].includes(name) || (name.startsWith("data-") && name !== COLUMN_ATTRIBUTE && !/^data-(?:ge|rs|doc)-/.test(name));

const NUMBER_FORMATS = ["number", "thousands", "percent", "cny", "usd"];
const NUMBER_DISPLAYS = ["number", "bar", "stars"];
const ALIGNS = ["left", "center", "right"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isObject = (value) => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value) => (typeof value === "string" ? value : value === undefined || value === null ? "" : String(value));
const words = (value) => text(value).trim();

/** Whether a year, a month (1–12) and a day are a day of the calendar (no 2026-02-30, no month 13). */
export function realDay(year, month, day) {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) return false;
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Whether `value` is a date as a file writes one: 2026-11-12, a day of the calendar. */
export const isDate = (value) => typeof value === "string" && DATE.test(value) && realDay(Number(value.slice(0, 4)), Number(value.slice(5, 7)), Number(value.slice(8, 10)));

// ---------- values: the file's words and back ----------

/** A date in the file's form from what an Agent may write for one (2026-11-12, 2026/11/2, 2026.11.2), or null (none, or no day of the calendar). */
export function fileDate(written) {
  const found = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(words(written));
  if (!found) return null;
  const [year, month, day] = [Number(found[1]), Number(found[2]), Number(found[3])];
  if (!realDay(year, month, day)) return null;
  return `${found[1]}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// A number's words as the file writes them: a sign, digits with a point, an exponent.
const NUMBER = /^([-+]?(?:\d+\.?\d*|\.\d+))(?:e([-+]?\d+))?$/i;

/**
 * The number a number's words say (`bare`: NUMBER's form), its point moved `places` to the left (2: a
 * percent's), worked out on the words rather than by dividing, so that 12.3456 (%) is 0.123456 exactly as
 * that is read: null where it says none, or none a number holds (beyond the largest).
 */
export function numberOf(bare, places = 0) {
  const found = NUMBER.exec(bare);
  if (!found) return null;
  const value = Number(`${found[1]}e${Number(found[2] ?? 0) - places}`);
  return Number.isFinite(value) ? value : null;
}

/** A number from what a file's cell says (1234.5, 1,234.5, 60%, ¥12), or null where it says none. */
export function fileNumber(written) {
  const said = words(written);
  if (!said) return null;
  const percent = /%$/.test(said);
  const bare = said.replace(/[¥$￥,，\s]/g, "").replace(/%$/, "");
  return numberOf(bare, percent ? 2 : 0);
}

/**
 * A number's words with its point moved `places` to the right (2: as a percent says it), exact: the digits
 * the shortest words of the number have (String), so that numberOf(numberText(v, 2), 2) is v again.
 */
export function numberText(value, places = 0) {
  const said = String(value);
  if (places === 0 || !Number.isFinite(value)) return said;
  const [, sign, whole, part = "", power = "0"] = /^(-?)(\d+)(?:\.(\d+))?(?:e([-+]?\d+))?$/.exec(said);
  const digits = whole + part;
  const point = whole.length + Number(power) + places;
  // Far from 1: an exponent, as String writes one.
  if (point > 21 || point < -6) return `${sign}${whole}${part ? `.${part}` : ""}e${Number(power) + places}`;
  const placed = point <= 0 ? `0.${"0".repeat(-point)}${digits}` : point >= digits.length ? digits + "0".repeat(point - digits.length) : `${digits.slice(0, point)}.${digits.slice(point)}`;
  const trimmed = placed.replace(/^0+(?=\d)/, "").replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return trimmed === "0" ? "0" : `${sign}${trimmed}`;
}

const CHECKED = /^(?:✓|✔|√|☑|x|1|true|yes|y|是|对)$/i;
const UNCHECKED = /^(?:✗|×|☐|0|false|no|n|否)$/i;

// What parts the names of several options, in a file's cell and wherever a reader types, pastes or fills them:
// a comma (a Chinese one too), 、, a line break, a tab. A semicolon is none: it is a name's, as any other mark.
const PARTING = /[,，、\r\n\t]/;
const PARTINGS = /[,，、\r\n\t]/g;

/** The names a cell of several options lists: apart by commas (a Chinese one too), 、, line breaks or tabs. */
export const optionNames = (written) => text(written).split(PARTING).map((name) => name.trim()).filter(Boolean);

/**
 * An option's name as the format holds one: what parts a cell of several (PARTING) a space, so that the name
 * reads back as itself in such a cell and stays one name whatever its words go through (a fill, a copy pasted
 * back). Every side that names an option goes by it.
 */
export const optionName = (name) => words(name).replace(PARTINGS, " ").trim();

/** An option's id where it has none: its name, which stays its id once it is renamed. */
const optionId = (option) => (typeof option.id === "string" && option.id.trim() ? option.id.trim() : words(option.name));

/**
 * The value of a cell of `column` from its words: a number, an option's id (or ids), a date, true or
 * false, or the words; what is no value of its kind stays the words as written (a dirty value, which
 * the kit shows gray). `options` takes the options a cell names that the column does not list, which
 * it adds (the reader's next change of the column writes them).
 */
export function cellValue(written, column, addOption = () => null) {
  const said = text(written).replace(/^\s+|\s+$/g, "");
  switch (column.type) {
    case "number": return said === "" ? null : fileNumber(said) ?? said;
    case "date": return said === "" ? null : fileDate(said) ?? said;
    case "checkbox": return said === "" || UNCHECKED.test(said) ? false : CHECKED.test(said) ? true : said;
    case "select": return said === "" ? null : idOfName(column, said, addOption);
    case "multi": return [...new Set(optionNames(said).map((name) => idOfName(column, name, addOption)))];
    case "formula": return null;
    default: return said;
  }
}

function idOfName(column, name, addOption) {
  const found = (column.options ?? []).find((option) => option.name === name) ?? (column.options ?? []).find((option) => option.name.toLowerCase() === name.toLowerCase());
  if (found) return found.id;
  return addOption(column, name) ?? name;
}

/** What a cell of `column` holding `value` says in the file. */
export function cellText(value, column) {
  if (value === null || value === undefined) return "";
  // An option by its name as the format holds one (optionName), whatever the drawing has it as.
  const nameOf = (id) => {
    const found = (column.options ?? []).find((option) => option.id === id);
    return found ? optionName(found.name) : String(id);
  };
  switch (column.type) {
    case "number": return typeof value === "number" ? numberText(value) : text(value);
    case "checkbox": return value === true ? "✓" : value === false ? "" : text(value);
    case "select": return value === "" ? "" : nameOf(value);
    case "multi": return Array.isArray(value) ? value.map(nameOf).join(", ") : text(value);
    case "formula": return "";
    default: return text(value);
  }
}


// ---------- the JSON: columns and views ----------

// A column as the kit reads it, from what the JSON says of it (or none): its fields checked, what is
// none of them left out, an option without an id given its name, a formula's references to names
// turned into references to ids (below, once every column is known).
function columnOf(given, at) {
  const type = COLUMN_TYPES.includes(given?.type) ? given.type : "text";
  const id = words(given?.id) || `c${at + 1}`;
  const column = { id, name: words(given?.name) || id, type };
  if (Number.isFinite(given?.width) && given.width >= 40) column.width = Math.round(given.width);
  if (ALIGNS.includes(given?.align)) column.align = given.align;
  if (type === "text" && given?.notes === true) column.notes = true;
  if (type === "select" || type === "multi") {
    const seen = new Set();
    column.options = (Array.isArray(given?.options) ? given.options : []).filter((option) => isObject(option) && words(option.name)).map((option) => ({
      id: optionId(option),
      name: optionName(option.name),
      color: OPTION_COLORS.includes(option.color) ? option.color : "default",
      ...(type === "select" && option.done === true ? { done: true } : {}),
    })).filter((option) => !seen.has(option.id) && seen.add(option.id));
  }
  if (type === "number") {
    const format = isObject(given?.numberFormat) ? given.numberFormat : {};
    column.numberFormat = {
      format: NUMBER_FORMATS.includes(format.format) ? format.format : "number",
      decimals: Number.isInteger(format.decimals) && format.decimals >= 0 && format.decimals <= 6 ? format.decimals : null,
      display: NUMBER_DISPLAYS.includes(format.display) ? format.display : "number",
    };
  }
  if (type === "formula") column.formula = text(given?.formula);
  return column;
}

// A view as the kit reads it: what it says of itself, checked against the columns there are, its
// defaults filled in.
function viewOf(given, at, columns) {
  const ids = new Set(columns.map((column) => column.id));
  const byId = new Map(columns.map((column) => [column.id, column]));
  const known = (id) => typeof id === "string" && ids.has(id);
  const layout = LAYOUTS.includes(given?.layout) ? given.layout : "table";
  // An option a filter names, by its id or its name (what an Agent may write), the name as the options' own are
  // held (optionName: "C、D" is the option C D).
  const optionIds = (column, values) => (Array.isArray(values) ? values : [values]).map((value) => {
    if (value === "__none") return value;
    const option = (column?.options ?? []).find((each) => each.id === value) ?? (typeof value === "string" ? (column?.options ?? []).find((each) => each.name === optionName(value)) : null);
    return option?.id ?? null;
  }).filter(Boolean);
  const view = {
    id: words(given?.id) || `v${at + 1}`,
    name: text(given?.name).trim(),
    layout,
    hidden: (Array.isArray(given?.hidden) ? given.hidden : []).filter(known),
    filters: (Array.isArray(given?.filters) ? given.filters : []).filter((filter) => isObject(filter) && known(filter.prop) && typeof filter.op === "string").map((filter, index) => {
      const column = byId.get(filter.prop);
      const value = column && (column.type === "select" || column.type === "multi") && Array.isArray(filter.value ?? []) ? optionIds(column, filter.value ?? []) : filter.value;
      return { id: words(filter.id) || `f${index + 1}`, prop: filter.prop, op: filter.op, ...(value !== undefined ? { value } : {}), ...(filter.segments === true ? { segments: true } : {}) };
    }),
    sorts: (Array.isArray(given?.sorts) ? given.sorts : []).filter((sort) => isObject(sort) && known(sort.prop)).map((sort) => ({ prop: sort.prop, dir: sort.dir === "desc" ? "desc" : "asc" })),
    groupBy: known(given?.groupBy) ? given.groupBy : null,
    calc: Object.fromEntries(Object.entries(isObject(given?.calc) ? given.calc : {}).filter(([id, kind]) => known(id) && typeof kind === "string")),
  };
  if (known(given?.boardBy)) view.boardBy = given.boardBy;
  // A board's columns hidden: options of its select, by id or name ("__none" the column of no value).
  if (view.boardBy && Array.isArray(given?.boardHidden)) {
    const hidden = [...new Set(optionIds(byId.get(view.boardBy), given.boardHidden))];
    if (hidden.length) view.boardHidden = hidden;
  }
  if (known(given?.dateBy)) view.dateBy = given.dateBy;
  if (["s", "m", "l"].includes(given?.cardSize)) view.cardSize = given.cardSize;
  if (["side", "center"].includes(given?.open)) view.open = given.open;
  for (const flag of ["wrap", "clickEdit", "showCalc"]) if (given?.[flag] === true) view[flag] = true;
  if (isObject(given?.chart)) {
    const chart = given.chart;
    view.chart = {
      kind: ["column", "bar", "line", "donut"].includes(chart.kind) ? chart.kind : "column",
      x: known(chart.x) ? chart.x : null,
      agg: ["count", "sum", "avg"].includes(chart.agg) ? chart.agg : "count",
      y: known(chart.y) ? chart.y : null,
      // Its colors: one of the nine, every category a shade of it; none (or "auto") each its option's, the others in turn.
      ...(OPTION_COLORS.includes(chart.color) && chart.color !== "default" ? { color: chart.color } : {}),
    };
  }
  return view;
}

// A formula's references by name ({估时}) as references by id ({est}), what the kit works it out by.
const formulaByIds = (formula, columns) => formula.replace(/\{([^}]+)\}/g, (whole, name) => {
  const said = name.trim();
  const column = columns.find((each) => each.id === said) ?? columns.find((each) => each.name === said);
  return column ? `{${column.id}}` : whole;
});

/** A new view's fields the JSON need not say: what readDatabase fills in. */
const VIEW_DEFAULTS = { hidden: [], filters: [], sorts: [], groupBy: null, calc: {} };

// ---------- the whole: read and written ----------

/**
 * A database from what its file holds: `json` the text of its script of JSON (null where it has
 * none), `header` its header's cells ([{ column (its data-column, or null), name (its words) }]),
 * `rows` its rows' cells' words ([[words]]), and as readElement gives them `links` (a cell's one link's
 * address, or null), `cells` (each cell's markup) and `problems` (what of its table the format cannot
 * hold). Returns { columns, rows: [{ id, values, raw }], views, json (whether it had JSON it could
 * read), problems ([{ code, detail }]), readOnly }: a column for each the JSON names and for each
 * header cell of no column it names (words), every header cell of a column of its own, the first column
 * the title where none is; a row's values
 * by column id, and `raw`, the markup of each cell that its value written anew would not give back; at
 * least one view. Options a cell names that its column does not list are added, marked `added`
 * (writeDatabase leaves them out until the column changes). With any problem it is read-only.
 */
export function readDatabase({ json = null, header = [], rows = [], links = [], cells = [], problems: found = [], shape = null, rowAttrs = [], cellAttrs = [] } = {}) {
  const problems = [...found];
  let given = null;
  if (typeof json === "string" && json.trim()) {
    try {
      given = JSON.parse(json);
      if (!isObject(given)) throw new Error("it holds no object");
    } catch (error) {
      problems.push({ code: "json", detail: error.message });
      given = null;
    }
  }
  const columns = [];
  const seen = new Set();
  for (const [at, each] of (Array.isArray(given?.columns) ? given.columns : []).entries()) {
    if (!isObject(each)) continue;
    const column = columnOf(each, at);
    if (seen.has(column.id)) continue;
    seen.add(column.id);
    columns.push(column);
  }
  // Each header cell is a column of its own, never another cell's, so that a write gives back every column
  // the table holds: first those that name theirs (data-column), the JSON's of that id or one of words of it;
  // then each other one the JSON's column of its words that no header cell is of yet, or one of words. Two
  // header cells naming one column, or one standing for a formula's (which has no cells: by its id, or by its
  // name where no other column has it), the format cannot hold: read-only, said, each cell read as a column of
  // words of its own meanwhile, so that all of it shows and nothing of it is written.
  const problemOnce = (code, detail) => { if (!problems.some((each) => each.code === code && each.detail === detail)) problems.push({ code, detail }); };
  const named = header.map((cell) => words(cell.column));
  const held = new Set(); // the JSON's columns a header cell is of
  const placed = header.map((cell, at) => {
    const id = named[at];
    if (!id) return null;
    const found = columns.find((column) => column.id === id);
    if (named.indexOf(id) !== at) {
      problemOnce("same-column", id);
      return { fresh: true };
    }
    if (found?.type === "formula") {
      problemOnce("formula-cells", found.name);
      return { fresh: true };
    }
    if (found) {
      held.add(found);
      return { column: found };
    }
    seen.add(id);
    return { id };
  });
  header.forEach((cell, at) => {
    if (placed[at]) return;
    const name = words(cell.name);
    const found = columns.find((column) => column.type !== "formula" && column.name === name && !held.has(column));
    if (found) {
      held.add(found);
      placed[at] = { column: found };
      return;
    }
    const formula = name ? columns.find((column) => column.type === "formula" && column.name === name) : null;
    if (formula && !columns.some((column) => column.type !== "formula" && column.name === name)) problemOnce("formula-cells", formula.name);
    placed[at] = { fresh: true };
  });
  const cellColumns = header.map((cell, at) => {
    const { column: found, id } = placed[at];
    if (found) {
      if (cell.attrs?.length && !found.headAttrs) found.headAttrs = cell.attrs;
      return found;
    }
    const column = columnOf({ id: id ?? uniqueId(seen, `c${at + 1}`), name: words(cell.name) || id || `${at + 1}`, type: "text" }, at);
    seen.add(column.id);
    if (cell.attrs?.length) column.headAttrs = cell.attrs;
    columns.push(column);
    return column;
  });
  if (!columns.some((column) => column.type === "title")) {
    const first = columns.find((column) => column.type !== "formula");
    if (first) {
      first.type = "title";
      delete first.options;
      delete first.numberFormat;
      delete first.notes;
    } else columns.unshift({ id: uniqueId(seen, "title"), name: "", type: "title" });
  }
  // One title: a second one is words.
  columns.filter((column) => column.type === "title").slice(1).forEach((column) => (column.type = "text"));
  for (const column of columns) if (column.type === "formula") column.formula = formulaByIds(column.formula ?? "", columns);
  const addOption = (column, name) => {
    const clean = optionName(name);
    if (!clean) return null;
    const existing = column.options.find((option) => option.name === clean);
    if (existing) return existing.id;
    const id = uniqueOption(column, clean);
    column.options.push({ id, name: clean, color: nextColor(column), added: true });
    return id;
  };
  // A record's id: its row's data-record where that is an id and the first row to say it, else its place
  // (r1, r2…), none another row's data-record says.
  const said = rows.map((_, index) => {
    const value = (rowAttrs[index] ?? []).find(({ name }) => name === RECORD_ATTRIBUTE)?.value;
    return typeof value === "string" && RECORD_ID.test(value) ? value : null;
  });
  const taken = new Set(said.filter(Boolean));
  const ids = said.map((id, index) => (id && said.indexOf(id) === index ? id : null));
  const placedIds = new Set(ids.filter(Boolean));
  ids.forEach((id, index) => {
    if (id) return;
    let place = `r${index + 1}`;
    for (let more = 2; taken.has(place) || placedIds.has(place); more++) place = `r${index + 1}-${more}`;
    ids[index] = place;
    placedIds.add(place);
  });
  const records = rows.map((words, index) => {
    const values = {};
    const raw = {};
    const attrs = {};
    cellColumns.forEach((column, at) => {
      if (!column || column.id in values) return;
      if (cellAttrs[index]?.[at]?.length) attrs[column.id] = cellAttrs[index][at];
      // A url cell holding one link is its address; a link in any other column is no value the format holds.
      const link = links[index]?.[at] ?? null;
      if (link !== null && column.type !== "url" && !problems.some((problem) => problem.code === "link")) problems.push({ code: "link" });
      const value = cellValue(link ?? words[at] ?? "", column, addOption);
      values[column.id] = value;
      const html = cells[index]?.[at];
      const text = cellText(value, column);
      if (typeof html === "string" && escapeCell(text) !== html) raw[column.id] = { html, value: structuredClone(value), text };
    });
    const row = rowAttrs[index] ?? [];
    return { id: ids[index], ...(said[index] === ids[index] ? { named: true } : {}), values, ...(Object.keys(raw).length > 0 ? { raw } : {}), ...(row.length > 0 || Object.keys(attrs).length > 0 ? { attrs: { row, cells: attrs } } : {}) };
  });
  const views = (Array.isArray(given?.views) ? given.views : []).filter(isObject).map((view, at) => viewOf(view, at, columns));
  const viewIds = new Set();
  const unique = views.filter((view) => !viewIds.has(view.id) && viewIds.add(view.id));
  if (unique.length === 0) unique.push({ id: "v1", name: "", layout: "table", ...structuredClone(VIEW_DEFAULTS) });
  return { columns, rows: records, views: unique, json: given !== null, problems, readOnly: problems.length > 0, ...(shape ? { shape } : {}) };
}

const uniqueId = (taken, base) => {
  if (!taken.has(base)) return base;
  for (let at = 2; ; at++) if (!taken.has(`${base}${at}`)) return `${base}${at}`;
};
const uniqueOption = (column, name) => uniqueId(new Set(column.options.map((option) => option.id)), name);

/** The color a new option of `column` takes: one its options do not have yet, in the palette's order. */
export function nextColor(column, extra = []) {
  const used = new Set([...(column.options ?? []).map((option) => option.color), ...extra]);
  const free = OPTION_COLORS.filter((color) => color !== "default" && !used.has(color));
  const pool = free.length ? free : OPTION_COLORS.slice(1);
  return pool[((column.options?.length ?? 0) + extra.length) % pool.length];
}

// A column as the JSON writes it: what is no default.
function writtenColumn(column) {
  const out = { id: column.id, name: column.name, type: column.type };
  if (column.width) out.width = column.width;
  if (column.align && ["number", "date", "formula"].includes(column.type)) out.align = column.align;
  if (column.notes && column.type === "text") out.notes = true;
  if (column.type === "select" || column.type === "multi") {
    out.options = (column.options ?? []).filter((option) => !option.added).map((option) => ({
      ...(option.id !== option.name ? { id: option.id } : {}),
      name: optionName(option.name),
      color: option.color,
      ...(option.done && column.type === "select" ? { done: true } : {}),
    }));
  }
  if (column.type === "number" && column.numberFormat) {
    const { format, decimals, display } = column.numberFormat;
    if (format !== "number" || decimals !== null || display !== "number") out.numberFormat = { format, decimals, display };
  }
  if (column.type === "formula") out.formula = column.formula ?? "";
  return out;
}

// A view as the JSON writes it: what is no default.
function writtenView(view) {
  const out = { id: view.id };
  if (view.name) out.name = view.name;
  out.layout = view.layout;
  if (view.hidden?.length) out.hidden = [...view.hidden];
  if (view.filters?.length) out.filters = view.filters.map(({ id, prop, op, value, segments }) => ({ id, prop, op, ...(value !== undefined ? { value } : {}), ...(segments ? { segments: true } : {}) }));
  if (view.sorts?.length) out.sorts = view.sorts.map(({ prop, dir }) => ({ prop, dir }));
  if (view.groupBy) out.groupBy = view.groupBy;
  if (view.calc && Object.keys(view.calc).some((id) => view.calc[id] && view.calc[id] !== "none")) out.calc = Object.fromEntries(Object.entries(view.calc).filter(([, kind]) => kind && kind !== "none"));
  for (const key of ["boardBy", "dateBy", "cardSize", "open"]) if (view[key]) out[key] = view[key];
  if (view.boardHidden?.length) out.boardHidden = [...view.boardHidden];
  for (const flag of ["wrap", "clickEdit", "showCalc"]) if (view[flag]) out[flag] = true;
  if (view.chart) out.chart = { ...view.chart };
  return out;
}

// Whether two values of a cell are the same.
const sameValue = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/**
 * What a database (as readDatabase gives one, changed) is written as: { json (the object its script
 * holds), header ([{ column, name }]), rows ([[words]]), html ([[markup, or null]]) }: every column in
 * the JSON, those that are no formula in the table too, in their order; each record a row; `html` a
 * cell's markup as the file had it (its `raw`) where its value and its words are what they were read as,
 * null where it is written anew from its words.
 */
export function writeDatabase({ columns, rows, views, shape = null }) {
  const cells = columns.filter((column) => column.type !== "formula");
  const words = rows.map((row) => cells.map((column) => cellText(row.values[column.id], column)));
  return {
    json: { columns: columns.map(writtenColumn), views: views.map(writtenView) },
    header: cells.map((column) => ({ column: column.id, name: column.name, attrs: column.headAttrs ?? [] })),
    rows: words,
    shape,
    rowAttrs: rows.map((row) => row.attrs?.row ?? []),
    cellAttrs: rows.map((row) => cells.map((column) => row.attrs?.cells?.[column.id] ?? [])),
    html: rows.map((row, at) => cells.map((column, index) => {
      const raw = row.raw?.[column.id];
      return raw && raw.text === words[at][index] && sameValue(raw.value, row.values[column.id]) ? raw.html : null;
    })),
  };
}

const escapeCell = (value) => text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/ /g, "&nbsp;").replace(/\r?\n/g, "<br>");

/**
 * What a database's <table> holds, as markup a browser writes back as it reads it: its header row in
 * a <thead>, its rows in a <tbody>, a line each, each line `indent` in (its tags' own: the table's
 * first line's blanks in the file), its rows `rows` in and its </tbody> after `last` where the file's
 * body lays them out so (layoutOf: its rows further in than its sections, as an Agent writes them), and
 * the last before `close` (the blanks before </table>); a cell `html` gives markup for (as the file had
 * it) that markup, any other its words.
 */
export function tableMarkup({ header, rows, html = [], shape = null, rowAttrs = [], cellAttrs = [] }, { indent = "\n", close = "\n", rows: rowIndent = indent, last = indent } = {}) {
  // A header cell's attributes as it had them, its column named where it was (first where it named none).
  const headOf = ({ column, attrs = [] }) => (attrs.some(({ name }) => name === COLUMN_ATTRIBUTE) ? attrs.map((each) => (each.name === COLUMN_ATTRIBUTE ? { name: COLUMN_ATTRIBUTE, value: column } : each)) : [{ name: COLUMN_ATTRIBUTE, value: column }, ...attrs]);
  const head = `<thead${attributesText(shape?.head)}><tr${attributesText(shape?.headRow)}>${header.map((cell) => `<th${attributesText(headOf(cell))}>${escapeCell(cell.name)}</th>`).join("")}</tr></thead>`;
  const opened = `<tbody${attributesText(shape?.body)}>`;
  const body = rows.length === 0 ? `${opened}</tbody>` : `${opened}${rows.map((_, at) => `${rowIndent}${rowMarkup({ rows, html, rowAttrs, cellAttrs }, at)}`).join("")}${last}</tbody>`;
  return `${indent}${head}${indent}${body}${close}`;
}

/** The row `at` of what tableMarkup writes (of writeDatabase's answer), its <tr> alone: what a write of that record's values alone changes. */
export const rowMarkup = ({ rows, html = [], rowAttrs = [], cellAttrs = [] }, at) => `<tr${attributesText(rowAttrs[at])}>${rows[at].map((cell, index) => `<td${attributesText(cellAttrs[at]?.[index])}>${html[at]?.[index] ?? escapeCell(cell)}</td>`).join("")}</tr>`;

// Attributes as a browser writes them after a tag's name.
const attributesText = (attrs = []) => (attrs ?? []).map(({ name, value }) => ` ${name}="${text(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/\u00a0/g, "&nbsp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}"`).join("");

/**
 * The blanks a part's markup opens and closes with in the file, which a write keeps: { indent, close },
 * and where its body holds rows, the blanks before its first row and before its </tbody> ({ rows, last }),
 * so that a table an Agent laid out with its rows further in is written in that layout (and a write of
 * one record's row is the same markup as the whole table written anew: kit/database/data/file.js).
 */
export function layoutOf(inner) {
  const indent = /^(\s*)</.exec(inner ?? "")?.[1] || "\n";
  const close = /(\s*)$/.exec(inner ?? "")?.[1] || (indent.includes("\n") ? indent.replace(/[ \t]{1,2}$/, "") : "");
  const rows = /<tbody\b[^>]*>(\s*)<tr\b/i.exec(inner ?? "")?.[1];
  const last = /<\/tr>(\s*)<\/tbody>/i.exec(inner ?? "")?.[1];
  return { indent: indent.includes("\n") ? indent : `\n${indent}`, close, ...(rows !== undefined && last !== undefined ? { rows, last } : {}) };
}

/**
 * A header cell's or a cell's words from its markup as a DOM gives it (`cell`, an element): a line
 * break a new line, what else it holds its words.
 */
export function cellWords(cell) {
  return wordsOf(plainOf(cell));
}

// ---------- reading a database's markup, a DOM's or parse5's ----------

// What the kit's passes over a page's text may have put in it (runtime/spacing.js: a range, a long run
// held whole): none of the file's markup. The kit leaves a database alone (components/database.mjs
// DATA_ONLY); a reading of the page goes through any all the same, as the file has none of it.
const DECORATION = "span.doc-long-run, span.doc-range";
const decoration = (node) => node.nodeType === 1 && node.matches(DECORATION);
// A DOM node's children, what the kit put in taken as what it holds.
const childrenOf = (node) => [...node.childNodes].flatMap((child) => (decoration(child) ? childrenOf(child) : [child]));

/** A cell's markup as the file holds it: what the kit put in it taken out. */
const fileMarkup = (cell) => {
  if (!cell.querySelector(DECORATION)) return cell.innerHTML;
  const copy = cell.cloneNode(true);
  for (const added of [...copy.querySelectorAll(DECORATION)].reverse()) added.replaceWith(...added.childNodes);
  copy.normalize();
  return copy.innerHTML;
};

// A node as the readings below take it, from a DOM (the page, a template, jsdom) or from parse5 (the
// server's checks): { tag, attrs: [{ name, value }], children, node }, { text } or { comment }.
function plainOf(node) {
  if (node.nodeType !== undefined) {
    if (node.nodeType === 3) return { text: node.data };
    if (node.nodeType === 8) return { comment: true };
    if (node.nodeType !== 1) return null;
    return { tag: node.localName, attrs: [...node.attributes].map(({ name, value }) => ({ name, value })), children: joinTexts(childrenOf(node).map(plainOf).filter(Boolean)), node };
  }
  if (node.nodeName === "#text") return { text: node.value };
  if (node.nodeName === "#comment") return { comment: true };
  if (!node.tagName) return null;
  return { tag: node.tagName, attrs: node.attrs.map(({ name, value }) => ({ name, value })), children: (node.childNodes ?? []).map(plainOf).filter(Boolean), node };
}

// Texts side by side as one (what a decoration taken out leaves apart).
const joinTexts = (nodes) => nodes.reduce((out, node) => {
  const last = out.at(-1);
  if (node.text !== undefined && last?.text !== undefined) out[out.length - 1] = { text: last.text + node.text };
  else out.push(node);
  return out;
}, []);

// A database element's own scripts and tables, in their order, as plain nodes (what else it holds,
// the kit's drawing among it, is none of what it is read from).
const hostOf = (host) => ({ children: (host.nodeType !== undefined ? [...host.children] : (host.childNodes ?? []).filter((child) => child.tagName)).filter((child) => ["script", "table"].includes(child.localName ?? child.tagName)).map(plainOf) });

const attrOf = (node, name) => node.attrs?.find((each) => each.name === name)?.value ?? null;
const elementsOf = (node) => (node.children ?? []).filter((child) => child.tag);
const wordsOf = (node) => (node.children ?? []).map((child) => (child.text !== undefined ? child.text : child.tag === "br" ? "\n" : child.tag ? wordsOf(child) : "")).join("");
const blank = (node) => node.text !== undefined && !node.text.trim();
// An address a link may not go to: code.
const CODE_ADDRESS = /^(?:javascript|vbscript|data):/i;
/** Whether an address may be a link's: none that is code (javascript:, vbscript:, data:, spaced or not). A url column's value goes by it too. */
export const safeAddress = (href) => typeof href === "string" && href.trim() !== "" && !CODE_ADDRESS.test(href.replace(/[\u0000- ]/g, ""));

/**
 * What a database's plain node (hostOf) holds as its format reads it: { json, header, rows (words),
 * links (a cell's one link's address, or null), cells (each body cell's node), problems (what of its
 * table the format cannot hold, [{ code, detail }]), script, table }.
 */
function readPlain(host) {
  const problems = [];
  const problem = (code, detail) => {
    if (!problems.some((each) => each.code === code && each.detail === detail)) problems.push(detail === undefined ? { code } : { code, detail });
  };
  const script = host.children.find((child) => child.tag === "script" && isJsonType(attrOf(child, "type"))) ?? null;
  const table = host.children.find((child) => child.tag === "table") ?? null;
  // An element's attributes, those that change nothing (harmlessAttribute) or `allowed` kept, in their order; any other a problem.
  const attributesOf = (node, allowed = []) => {
    for (const { name, value } of node.attrs ?? []) {
      if (allowed.includes(name) || harmlessAttribute(name)) {
        // One no write of the table could carry (refusedInData: a block's identity, a value that is an
        // address of code): every write of it would be refused, so it is read-only from the start.
        if (refusedInData(node.tag, [{ name, value }])) problem(name.toLowerCase() === "data-block-id" ? "attribute" : "code", name);
        continue;
      }
      problem(name === "colspan" || name === "rowspan" ? "span" : "attribute", name === "colspan" || name === "rowspan" ? undefined : name);
    }
    return (node.attrs ?? []).map(({ name, value }) => ({ name, value }));
  };
  const shape = { head: null, headRow: [], body: [] };
  const rowsOf = (section) => (section.children ?? []).filter((child) => {
    if (child.comment) problem("comment");
    else if (child.tag && child.tag !== "tr") problem("markup", child.tag);
    return child.tag === "tr";
  });
  let headRow = null;
  const bodyRows = [];
  if (table) {
    let heads = 0;
    let bodies = 0;
    for (const part of table.children ?? []) {
      if (part.comment) problem("comment");
      if (!part.tag) continue;
      if (part.tag === "thead") {
        if (heads === 0) shape.head = attributesOf(part);
        else attributesOf(part);
        const rows = rowsOf(part);
        if (++heads > 1 || rows.length > 1) problem("header-rows");
        headRow ??= rows[0] ?? null;
      } else if (part.tag === "tbody") {
        if (bodies === 0) shape.body = attributesOf(part);
        else attributesOf(part);
        if (++bodies > 1) problem("bodies");
        bodyRows.push(...rowsOf(part));
      } else if (part.tag === "tr") bodyRows.push(part);
      else if (["tfoot", "caption", "colgroup"].includes(part.tag)) problem(part.tag);
      else problem("markup", part.tag);
    }
    // A table written with no <thead>: its first row is its header.
    if (!headRow) headRow = bodyRows.shift() ?? null;
  }
  const cellsOf = (row) => (row.children ?? []).filter((child) => {
      if (child.comment) problem("comment");
      else if (child.tag && child.tag !== "td" && child.tag !== "th") problem("markup", child.tag);
      return child.tag === "td" || child.tag === "th";
    });
  // What a cell holds: words and line breaks, or (a cell of a row) one link and nothing else: its address.
  const contentOf = (cell, linked) => {
    let link = null;
    const kids = cell.children ?? [];
    for (const child of kids) {
      if (child.comment) problem("comment");
      else if (child.tag === "a" && linked) {
        const href = attrOf(child, "href");
        const alone = kids.every((other) => other === child || blank(other));
        if (alone && safeAddress(href) && (child.attrs ?? []).every(({ name }) => ["href", "target", "rel"].includes(name) || harmlessAttribute(name)) && !refusedInData("a", child.attrs ?? []) && elementsOf(child).length === 0 && !(child.children ?? []).some((each) => each.comment)) link = href;
        else problem("markup", "a");
      } else if (child.tag && child.tag !== "br") problem("markup", child.tag);
    }
    return link;
  };
  if (headRow) shape.headRow = attributesOf(headRow);
  const headCells = headRow ? cellsOf(headRow) : [];
  const header = headCells.map((cell) => {
    const attrs = attributesOf(cell, [COLUMN_ATTRIBUTE]);
    contentOf(cell, false);
    return { column: attrOf(cell, COLUMN_ATTRIBUTE), name: wordsOf(cell).trim(), attrs };
  });
  const rowAttrs = bodyRows.map((row) => attributesOf(row));
  const cells = bodyRows.map((row) => {
    const found = cellsOf(row);
    if (headRow && found.length > headCells.length) problem("wide-row");
    return found;
  });
  const cellAttrs = cells.map((row) => row.map((cell) => attributesOf(cell)));
  const links = cells.map((row) => row.map((cell) => contentOf(cell, true)));
  return { json: script ? (script.children ?? []).map((child) => child.text ?? "").join("") : null, header, rows: cells.map((row) => row.map(wordsOf)), links, cells, problems, script, table, shape, rowAttrs, cellAttrs };
}

/**
 * What a database element holds, read from a DOM (the page, a copy of it, jsdom): { json, header,
 * rows, links, cells (each cell's markup), problems, script, table } as readDatabase takes it, `script`
 * and `table` the elements (null where it has none). Its own children only: a table drawn inside
 * something else in it is none of its.
 */
export function readElement(host) {
  const read = readPlain(hostOf(host));
  return {
    script: read.script?.node ?? null,
    table: read.table?.node ?? null,
    json: read.json,
    header: read.header,
    rows: read.rows,
    links: read.links,
    cells: read.cells.map((row) => row.map((cell) => fileMarkup(cell.node))),
    problems: read.problems,
    shape: read.shape,
    rowAttrs: read.rowAttrs,
    cellAttrs: read.cellAttrs,
  };
}

/**
 * Why a database element (a DOM's, or parse5's: the server's checks) cannot be written, as readDatabase
 * says it: [{ code, detail }], none where its drawing edits it.
 */
export function databaseProblems(host) {
  const { json, header, rows, links, problems } = readPlain(hostOf(host));
  return readDatabase({ json, header, rows, links, problems }).problems;
}

/**
 * What a database element (a DOM's, or parse5's) holds as the format reads it, for the checks that say more
 * than its problems (src/render/database-checks.mjs): { json, header, rows, links, problems, script, table,
 * cells }, each plain node (`script`, `table`, a row's `cells`) keeping the node it was read from as `node`.
 */
export const databaseParts = (host) => readPlain(hostOf(host));

// An element's own element children and what it says, of a DOM's or parse5's.
const ownElements = (node) => (node?.nodeType !== undefined ? [...node.children] : (node?.childNodes ?? []).filter((child) => child.tagName));
const tagOf = (node) => node.localName ?? node.tagName;
const attributeOf = (node, name) => (node.nodeType !== undefined ? node.getAttribute(name) : node.attrs?.find((each) => each.name === name)?.value ?? null);
const classed = (node, name) => (attributeOf(node, "class") ?? "").split(/\s+/).includes(name);

/**
 * The bodies of a database element (a DOM's or parse5's): { pages, slots }, `pages` its div.doc-database-pages
 * (its first one straight in it, null for none) and `slots` the bodies in it, [{ name, record, node }] in their
 * order: each div straight in it that says data-doc-slot, `record` the id its name says (null for a name that
 * says none) and `first` whether it is the first of its name, which alone is that record's body.
 */
export function databasePages(host) {
  const pages = ownElements(host).find((child) => tagOf(child) === "div" && classed(child, PAGES_CLASS)) ?? null;
  const names = new Set();
  // A record's body the page shows before its first word (PROVISIONAL) is none yet.
  const slots = pages ? ownElements(pages).filter((child) => tagOf(child) === "div" && attributeOf(child, "data-doc-slot") !== null && attributeOf(child, PROVISIONAL) === null).map((node) => {
    const name = attributeOf(node, "data-doc-slot");
    const first = !names.has(name);
    names.add(name);
    return { name, record: slotRecord(name), first, node };
  }) : [];
  return { pages, slots };
}

/** The slot of record `id`'s body in a database element (a DOM's), or null. */
export const bodyOf = (host, id) => databasePages(host).slots.find((slot) => slot.first && slot.record === id)?.node ?? null;

/** The body a database element (a DOM's) shows for a record before its first word (PROVISIONAL: the page's, never the file's), or null. */
export const provisionalOf = (host) => databasePages(host).pages?.querySelector(`:scope > div[data-doc-slot][${PROVISIONAL}]`) ?? null;

const SAID = {
  zh: {
    json: "列和视图的 JSON 读不出来（{0}）",
    tfoot: "表格有表尾（<tfoot>）",
    caption: "表格有标题（<caption>）",
    colgroup: "表格有 <colgroup>",
    "header-rows": "表头不止一行",
    bodies: "表格有几个 <tbody>",
    "wide-row": "有的行比表头多出格子",
    span: "有合并的格子",
    markup: "格子里有 <{0}>",
    link: "网址列以外的格子里有链接",
    attribute: "表格里有 {0} 属性",
    code: "表格里的 {0} 属性写着一个代码地址（javascript: 之类）",
    comment: "表格里有注释",
    "same-column": "两个表头都写着 data-column=\"{0}\"（一列只能有一个表头）",
    "formula-cells": "公式列「{0}」在表格里有一列格子（公式列没有格子，是算出来的）",
  },
  en: {
    json: "the JSON of its columns and views does not read ({0})",
    tfoot: "its table has a <tfoot>",
    caption: "its table has a <caption>",
    colgroup: "its table has a <colgroup>",
    "header-rows": "its header has more than one row",
    bodies: "its table has several <tbody>",
    "wide-row": "a row has cells past its header",
    span: "it has merged cells",
    markup: "a cell holds a <{0}>",
    link: "a cell of a column that is no url's holds a link",
    attribute: "its table has a {0} attribute",
    code: "a {0} attribute of its table holds an address of code (javascript: and the like)",
    comment: "its table holds a comment",
    "same-column": "two header cells say data-column=\"{0}\" (a column has one header cell)",
    "formula-cells": "the formula column {0} has cells in its table (a formula column has none: it is worked out)",
  },
};

/** A problem of a database (readDatabase's) in words, "zh" or "en". */
export const problemSaid = (problem, language = "en") => ((SAID[language] ?? SAID.en)[problem.code] ?? problem.code).replace("{0}", problem.detail ?? "");

/**
 * A database element made anew in `doc` from `root` (one parsed apart from the page, in a <template>:
 * what a clipboard carried), of its format alone: its class, its script of JSON (its text), its table's
 * header and rows, their words, line breaks and a url cell's link; or null where `root` holds anything
 * else (an attribute, another element, markup in a cell, a script of code, JSON that does not read), so
 * that nothing of what someone else wrote is put on a page but what the format reads.
 */
export function cleanDatabase(root, doc) {
  if (root?.nodeType !== 1 || root.localName !== "div" || root.getAttribute("class") !== DATABASE_CLASS) return null;
  if ([...root.attributes].some(({ name }) => name !== "class" && name !== "data-block-id")) return null;
  const kids = [...root.childNodes];
  // Its records' bodies, carried apart (a copy's blocks): its pages of empty slots alone, each a record's, once.
  const isPages = (node) => node.localName === "div" && node.getAttribute("class") === PAGES_CLASS && node.attributes.length === 1;
  if (kids.some((node) => !(node.nodeType === 3 && !node.data.trim()) && !(node.nodeType === 1 && ((node.localName === "script" && isJsonType(node.getAttribute("type")) && node.attributes.length === 1) || (node.localName === "table" && [...node.attributes].every(({ name }) => harmlessAttribute(name))) || isPages(node))))) return null;
  if (kids.filter((node) => node.localName === "script").length > 1 || kids.filter((node) => node.localName === "table").length > 1 || kids.filter(isPages).length > 1) return null;
  const pages = kids.find(isPages) ?? null;
  const bodies = pages ? [...pages.childNodes].filter((node) => !(node.nodeType === 3 && !node.data.trim())) : [];
  if (bodies.some((node) => node.nodeType !== 1 || node.localName !== "div" || node.attributes.length !== 1 || !slotRecord(node.getAttribute("data-doc-slot")) || node.childNodes.length > 0)) return null;
  if (new Set(bodies.map((node) => node.getAttribute("data-doc-slot"))).size !== bodies.length) return null;
  const read = readPlain(hostOf(root));
  if (read.json !== null && (/<\/script|<!--/i.test(read.json) || !read.json.trim())) return null;
  const database = readDatabase({ json: read.json, header: read.header, rows: read.rows, links: read.links, problems: read.problems });
  if (database.problems.length > 0) return null;
  const host = doc.createElement("div");
  host.className = DATABASE_CLASS;
  if (read.script) {
    const script = doc.createElement("script");
    script.setAttribute("type", JSON_TYPE);
    script.textContent = read.json;
    host.append("\n", script);
  }
  if (read.table) {
    const words = (cell, text) => text.split("\n").forEach((line, at) => cell.append(...(at > 0 ? [doc.createElement("br")] : []), line));
    const table = doc.createElement("table");
    const row = (cells, tag, link = () => null) => {
      const tr = doc.createElement("tr");
      cells.forEach((cell, at) => {
        const element = doc.createElement(tag);
        if (cell.column) element.setAttribute(COLUMN_ATTRIBUTE, cell.column);
        const href = link(at);
        if (href !== null) {
          const a = doc.createElement("a");
          a.setAttribute("href", href);
          words(a, cell.words);
          element.append(a);
        } else words(element, cell.words);
        tr.append(element);
      });
      return tr;
    };
    if (read.header.length > 0) {
      const head = doc.createElement("thead");
      head.append(row(read.header.map(({ column, name }) => ({ column, words: name })), "th"));
      table.append(head);
    }
    const body = doc.createElement("tbody");
    read.rows.forEach((cells, at) => {
      const tr = row(cells.map((text) => ({ words: text })), "td", (index) => read.links[at]?.[index] ?? null);
      // Its record's id where it names one (what its body goes by).
      const id = read.rowAttrs[at]?.find(({ name }) => name === RECORD_ATTRIBUTE)?.value;
      if (typeof id === "string" && RECORD_ID.test(id)) tr.setAttribute(RECORD_ATTRIBUTE, id);
      body.append(tr);
    });
    table.append(body);
    host.append("\n", table);
  }
  const named = new Set(read.rowAttrs.map((attrs) => attrs.find(({ name }) => name === RECORD_ATTRIBUTE)?.value).filter(Boolean));
  if (bodies.some((node) => !named.has(slotRecord(node.getAttribute("data-doc-slot"))))) return null;
  if (bodies.length > 0) {
    const made = doc.createElement("div");
    made.className = PAGES_CLASS;
    for (const node of bodies) {
      const slot = doc.createElement("div");
      slot.setAttribute("data-doc-slot", node.getAttribute("data-doc-slot"));
      made.append(slot);
    }
    host.append("\n", made);
  }
  host.append("\n");
  return host;
}

// ---------- a new one ----------

const NEW = {
  zh: { title: "名称", status: "状态", date: "日期", options: ["待开始", "进行中", "已完成"] },
  en: { title: "Name", status: "Status", date: "Date", options: ["Not started", "In progress", "Done"] },
};

/** A new database's columns and view in `language` ("zh" or "en"), the words of the file it goes into, and its rows. */
export function newDatabase(language = "zh", rowCount = 3) {
  const said = NEW[language] ?? NEW.zh;
  const columns = [
    { id: "title", name: said.title, type: "title", width: 240 },
    { id: "status", name: said.status, type: "select", width: 140, options: said.options.map((name, at) => ({ id: ["todo", "doing", "done"][at], name, color: ["gray", "blue", "green"][at], ...(at === 2 ? { done: true } : {}) })) },
    { id: "date", name: said.date, type: "date", width: 140 },
  ];
  return { columns, rows: Array.from({ length: rowCount }, (_, at) => ({ id: `r${at + 1}`, values: { title: "", status: null, date: null } })), views: [{ id: "v1", name: "", layout: "table", ...structuredClone(VIEW_DEFAULTS) }] };
}
