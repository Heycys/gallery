// gallery/metric (指标): a view of a table of the document (its manifest's needs hold "tables"; the table's
// frame carries the key its data-doc-from names, which a metric made from "/" takes from the table above it): one number of
// the table, large, under its name. Its settings (its data part `settings`, JSON) say which: `op`
// "count" (the rows: the default), "sum" or "average" of the numbers of a `column` (the first column
// holding numbers where it names none; a cell holding no number is left out, as a chart leaves it out),
// over every row or those whose cell of `where` is `is`; `title` its name (one made of the rest where it
// gives none), `unit` the words after the number; under it, of a count of one value, how many rows there are in
// all, and of a sum or an average, how many rows had no number to take. It reads the table each time its rows change (the
// `data` signal: a cell typed in, a row added or taken out), and draws only what changed, so that it
// follows the reader's typing at once. Its ⚙, at its head while the page edits, opens its settings,
// each change one undo step of the document's (context.editJSON); its name and its unit are typed in
// where they stand (DocKit.text: the light accent fill under the pointer, as a figure's words; the user,
// 2026-11-20), each its setting, `title` and `unit` (emptied, taken out: the name it makes shown again),
// one step each; its number is worked out, nobody's words. It writes nothing else. The words are the
// page's language.

const WORDS = {
  zh: {
    settings: "设置",
    op: "计算",
    ops: { count: "计数", sum: "合计", average: "平均" },
    column: "列",
    where: "只算",
    every: "所有行",
    is: "等于",
    title: "名称",
    unit: "单位",
    rows: "行数",
    named: (/** @type {string} */ where, /** @type {string} */ is) => `${where}为“${is}”`,
    sum: (/** @type {string} */ column) => `${column}合计`,
    average: (/** @type {string} */ column) => `${column}平均`,
    of: (/** @type {string} */ label, /** @type {string} */ where) => `${label}（${where}）`,
    leftOut: (/** @type {number} */ count) => `有 ${count} 行没有数，没算进去`,
    outOf: (/** @type {number} */ count) => `共 ${count} 行`,
    unbound: "这个指标还没有接到表格上：在它的菜单里选“设置…”，选一张表格。",
    unread: "读不到这个指标的表格：它不在页面上了，或者有合并的单元格。",
    missing: (/** @type {string} */ name) => `找不到列“${name}”：表格的列名改过了吗？`,
    noNumbers: "表格里没有写数的列：合计和平均要一列数。",
  },
  en: {
    settings: "Settings",
    op: "Calculate",
    ops: { count: "Count", sum: "Sum", average: "Average" },
    column: "Column",
    where: "Only where",
    every: "Every row",
    is: "is",
    title: "Name",
    unit: "Unit",
    rows: "Rows",
    named: (/** @type {string} */ where, /** @type {string} */ is) => `${where}: ${is}`,
    sum: (/** @type {string} */ column) => `Total ${column}`,
    average: (/** @type {string} */ column) => `Average ${column}`,
    of: (/** @type {string} */ label, /** @type {string} */ where) => `${label} (${where})`,
    leftOut: (/** @type {number} */ count) => `${count} ${count === 1 ? "row has" : "rows have"} no number, left out`,
    outOf: (/** @type {number} */ count) => `${count} rows in all`,
    unbound: "This metric reads no table yet: pick Settings… in its menu and choose a table.",
    unread: "This metric's table cannot be read: it is not on the page, or it has merged cells.",
    missing: (/** @type {string} */ name) => `No column “${name}”: was the table's column renamed?`,
    noNumbers: "The table has no column of numbers: a sum and an average need one.",
  },
};

const GEAR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h6M12 4.5h1M3 11.5h1M7 11.5h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="10.5" cy="4.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="5.5" cy="11.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';

/** The language the page speaks: the UI's where Gallery says it (data-ge-language), else its lang's. */
function languageOf(/** @type {HTMLElement} */ root) {
  const ui = root.getAttribute("data-ge-language");
  return (ui !== null ? ui === "en" : /^en(?:-|$)/i.test(root.lang)) ? "en" : "zh";
}

/**
 * What its settings ask (context.readJSON's; {} where none is set).
 * @param {any} settings
 * @returns {{ op: "count" | "sum" | "average", column: string, where: string, is: string, title: string, unit: string }}
 */
function askedOf(settings) {
  const table = settings !== null && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const text = (/** @type {string} */ key) => (typeof table[key] === "string" ? table[key].trim() : typeof table[key] === "number" ? String(table[key]) : "");
  const op = table.op === "sum" || table.op === "average" ? table.op : "count";
  return { op, column: text("column"), where: text("where"), is: text("is"), title: text("title"), unit: text("unit") };
}

/** The columns of `table` holding numbers: a number in a cell at least, and no words. */
const numberColumns = (/** @type {DocTableView} */ table) => table.columns.filter((name) => table.rows.some((row) => typeof row.values[name] === "number") && table.rows.every((row) => row.values[name] === null || typeof row.values[name] === "number"));

/** Whether a row's value is what `is` says: its words, or the same number. */
function matches(/** @type {string | number | null | undefined} */ value, /** @type {string} */ is) {
  if (value === null || value === undefined) return is === "";
  if (typeof value === "number") {
    const plain = Number(is.replace(/[\s,，]/g, ""));
    if (is.trim() !== "" && Number.isFinite(plain)) return plain === value;
  }
  return String(value).trim() === is;
}

/**
 * The metric of `table` as `asked` says: { value, label, foot } or { line } where there is none to say.
 * @param {DocTableView} table
 * @param {ReturnType<typeof askedOf>} asked
 * @param {typeof WORDS.zh} words
 */
function metricOf(table, asked, words) {
  if (asked.where && !table.columns.includes(asked.where)) return { line: words.missing(asked.where) };
  const rows = asked.where ? table.rows.filter((row) => matches(row.values[asked.where], asked.is)) : [...table.rows];
  const where = asked.where ? words.named(asked.where, asked.is) : "";
  if (asked.op === "count") {
    return { value: rows.length, label: asked.title || where || words.rows, foot: asked.where ? words.outOf(table.rows.length) : null };
  }
  const column = asked.column || numberColumns(table)[0] || "";
  if (!column) return { line: words.noNumbers };
  if (!table.columns.includes(column)) return { line: words.missing(column) };
  const numbers = rows.map((row) => row.values[column]).filter((value) => typeof value === "number");
  const sum = numbers.reduce((total, value) => total + /** @type {number} */ (value), 0);
  const value = asked.op === "sum" ? sum : numbers.length > 0 ? sum / numbers.length : null;
  const named = asked.op === "sum" ? words.sum(column) : words.average(column);
  // A line under the number only where it says something the number does not: the rows a cell of no number kept out.
  const left = rows.length - numbers.length;
  return { value, label: asked.title || (where ? words.of(named, where) : named), foot: left > 0 ? words.leftOut(left) : null };
}

/**
 * An element of the face, of `kind` (its class gallery-metric-<kind>).
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} kind
 * @param {string} [text]
 */
function made(tag, kind, text) {
  const node = document.createElement(tag);
  node.className = `gallery-metric-${kind}`;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * The settings strip: a field a setting, a select of its choices (`options()`, [value, words]) or a
 * text, shown while `shown()` says so, each committed (DocKit.input: Enter, the field left, a choice
 * made) as one write of the settings part, a key set or, for "", taken off (`write`, which the words
 * typed in where they stand write by too).
 * @param {DocComponentContext} context
 * @param {{ key: string, label: string, options?: () => [string, string][], shown?: () => boolean, value: () => string }[]} fields
 */
function settingsStrip(context, fields) {
  const strip = made("div", "strip");
  strip.hidden = true;
  const write = (/** @type {string} */ key, /** @type {string} */ value) => context.editJSON("settings", (draft) => {
    const settings = draft !== null && typeof draft === "object" && !Array.isArray(draft) ? draft : {};
    if (value.trim() === "") delete settings[key];
    else settings[key] = value.trim();
    return settings;
  });
  const controls = fields.map((field) => {
    const label = made("label", "setting");
    const control = field.options ? document.createElement("select") : document.createElement("input");
    if (control instanceof HTMLInputElement) control.type = "text";
    label.append(made("span", "setting-name", field.label), control);
    strip.append(label);
    const handle = DocKit.input(control, { commit: (value) => void write(field.key, value), signal: context.signal });
    return { field, label, control, handle, signed: "" };
  });
  return {
    strip,
    write,
    /** The fields as the settings and the table say now: their choices, which show, their values. */
    update() {
      for (const each of controls) {
        each.label.hidden = each.field.shown ? !each.field.shown() : false;
        const { control, field } = each;
        if (field.options && control instanceof HTMLSelectElement) {
          const options = field.options();
          const signed = JSON.stringify(options);
          if (signed !== each.signed) {
            each.signed = signed;
            control.replaceChildren(...options.map(([value, words]) => new Option(words, value)));
          }
        }
        each.handle.set(field.value());
      }
    },
  };
}

DocKit.component({
  id: "gallery/metric",
  on: ["source", "data", "editable"],
  mount(host, context) {
    const language = languageOf(document.documentElement);
    const words = WORDS[language];
    const format = new Intl.NumberFormat(language === "en" ? "en-US" : "zh-CN", { maximumFractionDigits: 2 });
    const face = made("div", "face");
    const head = made("div", "head");
    const label = made("span", "label");
    const gear = made("button", "gear");
    gear.type = "button";
    gear.dataset.docTip = words.settings;
    gear.setAttribute("aria-label", words.settings);
    gear.setAttribute("aria-expanded", "false");
    gear.innerHTML = GEAR;
    head.append(label, gear);
    const value = made("p", "value");
    const number = made("span", "number");
    const unit = made("span", "unit");
    value.append(number, unit);
    const foot = made("p", "foot");
    const line = made("p", "line");

    /** @type {DocTableView | null} */
    let table = null;
    let asked = askedOf({});
    const columnsOf = () => (table ? table.columns.map((name) => /** @type {[string, string]} */ ([name, name])) : []);
    const { strip, update: updateStrip, write: writeSetting } = settingsStrip(context, [
      { key: "op", label: words.op, options: () => [["count", words.ops.count], ["sum", words.ops.sum], ["average", words.ops.average]], value: () => asked.op },
      { key: "column", label: words.column, options: () => (table ? numberColumns(table).map((name) => /** @type {[string, string]} */ ([name, name])) : []), shown: () => asked.op !== "count", value: () => asked.column || (table ? numberColumns(table)[0] ?? "" : "") },
      { key: "where", label: words.where, options: () => [["", words.every], ...columnsOf()], value: () => asked.where },
      { key: "is", label: words.is, shown: () => asked.where !== "", value: () => asked.is },
      { key: "title", label: words.title, value: () => asked.title },
      { key: "unit", label: words.unit, value: () => asked.unit },
    ]);
    face.append(head, strip, value, foot, line);
    host.append(face);
    // Its name and its unit typed in where they stand: each its setting (empty: taken out), drawn again after it
    // (a name emptied where the settings held none changes nothing, and shows the one it makes again).
    const typedIn = (/** @type {string} */ key) => (/** @type {string} */ text) => {
      const taken = writeSetting(key, text);
      context.frame(drawNow);
      return taken;
    };
    const named = DocKit.text(label, { commit: typedIn("title"), enabled: () => context.canEdit(), signal: context.signal });
    const united = DocKit.text(unit, { commit: typedIn("unit"), enabled: () => context.canEdit(), signal: context.signal });
    gear.addEventListener("click", () => {
      strip.hidden = !strip.hidden;
      gear.setAttribute("aria-expanded", String(!strip.hidden));
    }, { signal: context.signal });

    const show = (/** @type {HTMLElement} */ node, /** @type {string | null} */ text) => {
      node.hidden = text === null;
      if (node.textContent !== (text ?? "")) node.textContent = text ?? "";
    };
    // Words typed in where they stand (DocKit.text), shown or hidden: what the file says unless they are typed in.
    const showText = (/** @type {HTMLElement} */ node, /** @type {DocTextHandle} */ text, /** @type {string | null} */ said) => {
      node.hidden = said === null && !text.editing;
      text.set(said ?? "");
    };
    const drawNow = () => {
      table = context.table();
      asked = askedOf(context.readJSON("settings"));
      face.toggleAttribute("data-writes", context.canEdit());
      head.hidden = !table;
      updateStrip();
      const metric = table ? metricOf(table, asked, words) : { line: host.hasAttribute("data-doc-from") ? words.unread : words.unbound };
      if (metric.line !== undefined) {
        showText(label, named, asked.title || null);
        showText(unit, united, null);
        value.hidden = true;
        show(foot, null);
        show(line, metric.line);
        return;
      }
      showText(label, named, metric.label);
      value.hidden = false;
      const said = metric.value === null ? "—" : format.format(metric.value);
      if (number.textContent !== said) number.textContent = said;
      showText(unit, united, asked.unit || null);
      show(foot, metric.foot);
      show(line, null);
    };
    drawNow();
    return { update: () => context.frame(drawNow) };
  },
});
