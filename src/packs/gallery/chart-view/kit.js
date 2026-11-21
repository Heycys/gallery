// gallery/chart-view (图表): a view of a table of the document (its manifest's needs hold "tables"; the
// table's frame carries the key its data-doc-from names, which a chart made from "/" takes from the table above it), drawn as
// horizontal bars from zero, each with its value at its end, under its title. Its settings (its data part
// `settings`, JSON) say what: `by` a column whose values are the bars (the rows grouped by it, in the order
// the rows first say them), each the `op` of its rows, "count" (how many), "sum" or "average" of the
// numbers of the column `value`; with no `by` a bar for each row, its first cell its name and its number
// in `value`. Left out: `by` the column that reads as a status or whose words repeat (none: a bar a row),
// `value` the first column of numbers, `op` "sum" where there is one, else "count"; `title` one made of
// the rest. At most MAX_BARS bars, a line saying how many more.
//
// It reads the table each time its rows change (the `data` signal), and draws only what changed: a bar
// is kept by its group's value (or its row's element) and its label, its value and its length written
// only where they changed, so that typing in a table of 500 rows moves one bar. Its ⚙, at its head while
// the page edits, opens its settings, each change one undo step of the document's (context.editJSON). Its
// title and its bars' names are typed in where they stand (DocKit.text: the light accent fill under the
// pointer, as a figure's words; the user, 2026-11-20): the title its setting `title` (emptied, taken out:
// the one it makes shown again), a bar's name what it stands for in the table, of a group each cell of its
// rows in the column grouped by (one step; typed as another bar's name, the two are one; empty, nothing),
// of a row its first cell; one step each. A cell holding more than words (a link, a mark) is not typed in
// here, which would write it as plain words: the table has it. Its numbers are worked out, nobody's
// words. It writes nothing else. The colors are the kit's series colors, which follow the theme. The
// words are the page's language.

const WORDS = {
  zh: {
    settings: "设置",
    by: "分组依据",
    each: "每行一条",
    op: "计算",
    ops: { count: "计数", sum: "合计", average: "平均" },
    value: "数值列",
    title: "标题",
    none: "（空）",
    rows: (/** @type {string} */ by) => `各${by}的行数`,
    sum: (/** @type {string} */ by, /** @type {string} */ value) => `各${by}的${value}合计`,
    average: (/** @type {string} */ by, /** @type {string} */ value) => `各${by}的${value}平均`,
    each_: (/** @type {string} */ name, /** @type {string} */ value) => `各${name}的${value}`,
    more: (/** @type {number} */ shown, /** @type {number} */ all) => `只画了前 ${shown} 条，共 ${all} 条：按一列分组可以都画出来。`,
    unbound: "这张图还没有接到表格上：在它的菜单里选“设置…”，选一张表格。",
    unread: "读不到这张图的表格：它不在页面上了，或者有合并的单元格。",
    missing: (/** @type {string} */ name) => `找不到列“${name}”：表格的列名改过了吗？`,
    noNumbers: "表格里没有写数的列：每行一条、合计和平均要一列数。",
    empty: "表格里还没有行。",
  },
  en: {
    settings: "Settings",
    by: "Group by",
    each: "A bar a row",
    op: "Calculate",
    ops: { count: "Count", sum: "Sum", average: "Average" },
    value: "Numbers",
    title: "Title",
    none: "(empty)",
    rows: (/** @type {string} */ by) => `Rows by ${by}`,
    sum: (/** @type {string} */ by, /** @type {string} */ value) => `Total ${value} by ${by}`,
    average: (/** @type {string} */ by, /** @type {string} */ value) => `Average ${value} by ${by}`,
    each_: (/** @type {string} */ name, /** @type {string} */ value) => `${value} by ${name}`,
    more: (/** @type {number} */ shown, /** @type {number} */ all) => `The first ${shown} bars of ${all}: group by a column to draw them all.`,
    unbound: "This chart reads no table yet: pick Settings… in its menu and choose a table.",
    unread: "This chart's table cannot be read: it is not on the page, or it has merged cells.",
    missing: (/** @type {string} */ name) => `No column “${name}”: was the table's column renamed?`,
    noNumbers: "The table has no column of numbers: a bar a row, a sum and an average need one.",
    empty: "The table has no rows yet.",
  },
};

// The most bars it draws.
const MAX_BARS = 50;

// A column whose name says it is a status, the one it groups by when its settings name none.
const STATUS = /状态|進度|进度|阶段|階段|状況|状况|status|stage|state|phase/i;

const GEAR = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h6M12 4.5h1M3 11.5h1M7 11.5h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="10.5" cy="4.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="5.5" cy="11.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';

/** The language the page speaks: the UI's where Gallery says it (data-ge-language), else its lang's. */
function languageOf(/** @type {HTMLElement} */ root) {
  const ui = root.getAttribute("data-ge-language");
  return (ui !== null ? ui === "en" : /^en(?:-|$)/i.test(root.lang)) ? "en" : "zh";
}

/** Words as a cell shows them, its white space one space. */
const wordsOf = (/** @type {Node | null | undefined} */ node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Whether a cell holds words alone (no link, no mark), which typing over them where the chart shows them writes as they were. */
const plain = (/** @type {Element | undefined} */ cell) => Boolean(cell) && /** @type {Element} */ (cell).childElementCount === 0;

/** A row's value of a column as a group: its words ("" for none). */
const keyOf = (/** @type {DocRow} */ row, /** @type {string} */ column) => {
  const value = row.values[column];
  return value === null || value === undefined ? "" : String(value).trim();
};

/**
 * What its settings ask (context.readJSON's; {} where none is set): "" where a setting is left out.
 * @param {any} settings
 * @returns {{ by: string, op: "" | "count" | "sum" | "average", value: string, title: string }}
 */
function askedOf(settings) {
  const table = settings !== null && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const text = (/** @type {string} */ key) => (typeof table[key] === "string" ? table[key].trim() : "");
  const op = table.op === "count" || table.op === "sum" || table.op === "average" ? table.op : "";
  return { by: text("by"), op, value: text("value"), title: text("title") };
}

/** The columns of `table` holding numbers: a number in a cell at least, and no words. */
const numberColumns = (/** @type {DocTableView} */ table) => table.columns.filter((name) => table.rows.some((row) => typeof row.values[name] === "number") && table.rows.every((row) => row.values[name] === null || typeof row.values[name] === "number"));

/**
 * The column it groups by where its settings name none: one after the first whose name says it is a
 * status, else the one after the first holding words whose values repeat most (fewer than its rows),
 * else none: a bar a row.
 * @param {DocTableView} table
 */
function groupColumnOf(table) {
  const numbers = numberColumns(table);
  const rest = table.columns.slice(1).filter((name) => !numbers.includes(name));
  const named = rest.find((name) => STATUS.test(name));
  if (named) return named;
  /** @type {[string, number] | null} */
  let best = null;
  for (const name of rest) {
    const kinds = new Set(table.rows.map((row) => keyOf(row, name))).size;
    if (kinds < table.rows.length && (best === null || kinds < best[1])) best = [name, kinds];
  }
  return best ? best[0] : "";
}

/**
 * The chart `asked` says of `table`: { title, bars: [{ key, label, value }], all } or { line }.
 * @param {DocTableView} table
 * @param {ReturnType<typeof askedOf>} asked
 * @param {typeof WORDS.zh} words
 */
function chartOf(table, asked, words) {
  if (table.rows.length === 0) return { line: words.empty };
  const by = asked.by || groupColumnOf(table);
  if (by && !table.columns.includes(by)) return { line: words.missing(by) };
  const value = asked.value || numberColumns(table)[0] || "";
  const op = asked.op || (value ? "sum" : "count");
  if (value && !table.columns.includes(value)) return { line: words.missing(value) };
  if (!value && (!by || op !== "count")) return { line: words.noNumbers };
  /** @type {{ key: unknown, label: string, value: number | null }[]} */
  let bars;
  let title;
  if (by) {
    /** @type {Map<string, { count: number, sum: number, numbers: number }>} */
    const groups = new Map();
    for (const row of table.rows) {
      const group = keyOf(row, by);
      const kept = groups.get(group) ?? { count: 0, sum: 0, numbers: 0 };
      kept.count += 1;
      const number = value ? row.values[value] : null;
      if (typeof number === "number") {
        kept.sum += number;
        kept.numbers += 1;
      }
      groups.set(group, kept);
    }
    bars = [...groups].map(([group, { count, sum, numbers }]) => ({ key: group, label: group || words.none, value: op === "count" ? count : op === "sum" ? sum : numbers > 0 ? sum / numbers : null }));
    title = op === "count" ? words.rows(by) : op === "sum" ? words.sum(by, value) : words.average(by, value);
  } else {
    bars = table.rows.map((row) => {
      const number = row.values[value];
      return { key: row.el, label: wordsOf(row.el.cells[0]), value: typeof number === "number" ? number : null };
    });
    title = words.each_(table.columns[0] ?? "", value);
  }
  return { title: asked.title || title, bars: bars.slice(0, MAX_BARS), all: bars.length, by, op, value };
}

/**
 * An element of the drawing, of `kind` (its class gallery-chart-view-<kind>).
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} kind
 * @param {string} [text]
 */
function made(tag, kind, text) {
  const node = document.createElement(tag);
  node.className = `gallery-chart-view-${kind}`;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * `parent`'s children made `nodes`, what is there already left in place: where only some are new, each
 * standing where the one it replaces stood, those alone are put in; anything else is the list anew.
 * @param {Element} parent
 * @param {Element[]} nodes
 */
function put(parent, nodes) {
  const now = [...parent.children];
  if (now.length === nodes.length) {
    const differs = nodes.map((node, at) => node !== now[at]);
    if (!differs.includes(true)) return;
    if (nodes.every((node, at) => !differs[at] || !node.isConnected)) {
      nodes.forEach((node, at) => { if (differs[at]) parent.replaceChild(node, now[at]); });
      return;
    }
  }
  parent.replaceChildren(...nodes);
}

/**
 * The settings strip: a field a setting, a select of its choices (`options()`, [value, words]) or a
 * text, shown while `shown()` says so, each committed (DocKit.input: Enter, the field left, a choice
 * made) as one write of the settings part, a key set or, for "", taken off (`write`, which the title
 * typed in where it stands writes by too).
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
  id: "gallery/chart-view",
  on: ["source", "data", "editable"],
  mount(host, context) {
    const language = languageOf(document.documentElement);
    const words = WORDS[language];
    const format = new Intl.NumberFormat(language === "en" ? "en-US" : "zh-CN", { maximumFractionDigits: 2 });
    const face = made("div", "face");
    const head = made("div", "head");
    const title = made("span", "title");
    const gear = made("button", "gear");
    gear.type = "button";
    gear.dataset.docTip = words.settings;
    gear.setAttribute("aria-label", words.settings);
    gear.setAttribute("aria-expanded", "false");
    gear.innerHTML = GEAR;
    head.append(title, gear);
    const bars = made("div", "bars");
    bars.setAttribute("role", "group");
    const line = made("p", "line");

    /** @type {DocTableView | null} */
    let table = null;
    let asked = askedOf({});
    /** @type {{ by: string, op: string, value: string } | null} */
    let drawn = null; // what it drew last: its column, its op, its numbers
    const pairs = (/** @type {string[]} */ names) => names.map((name) => /** @type {[string, string]} */ ([name, name]));
    const { strip, update: updateStrip, write: writeSetting } = settingsStrip(context, [
      { key: "by", label: words.by, options: () => [["", words.each], ...pairs(table ? table.columns.slice(1) : [])], value: () => drawn ? drawn.by : asked.by },
      { key: "op", label: words.op, options: () => [["count", words.ops.count], ["sum", words.ops.sum], ["average", words.ops.average]], shown: () => Boolean(drawn && drawn.by), value: () => drawn ? drawn.op : asked.op },
      { key: "value", label: words.value, options: () => pairs(table ? numberColumns(table) : []), shown: () => !drawn || !drawn.by || drawn.op !== "count", value: () => drawn ? drawn.value : asked.value },
      { key: "title", label: words.title, value: () => asked.title },
    ]);
    face.append(head, strip, bars, line);
    host.append(face);
    // Its title typed in where it stands: its setting (empty: taken out), drawn again after it (a title emptied
    // where the settings held none changes nothing, and shows the one it makes again).
    const titled = DocKit.text(title, {
      commit(text) {
        const taken = writeSetting("title", text);
        context.frame(drawNow);
        return taken;
      },
      enabled: () => context.canEdit(),
      signal: context.signal,
    });
    let canWrite = false; // whether the table takes a change, as drawn last: what a bar's name typed in asks
    // A bar's name typed (`key`: its group's value, or its row's element): each cell of the group's rows in the
    // column grouped by (empty: nothing), or its row's first cell; one step. Whether it was taken.
    const renameBar = (/** @type {unknown} */ key, /** @type {string} */ text) => {
      const now = context.table();
      if (!now || !now.canEdit() || !drawn) return false;
      if (drawn.by) {
        if (text === "" || typeof key !== "string" || !now.columns.includes(drawn.by)) return false;
        const by = drawn.by;
        const rows = now.rows.filter((row) => keyOf(row, by) === key);
        return rows.length > 0 && now.set(rows, by, text);
      }
      const row = now.rows.find((each) => each.el === key);
      return Boolean(row && now.columns.length > 0 && now.set(/** @type {DocRow} */ (row), now.columns[0], text));
    };
    gear.addEventListener("click", () => {
      strip.hidden = !strip.hidden;
      gear.setAttribute("aria-expanded", String(!strip.hidden));
    }, { signal: context.signal });

    /** @type {Map<unknown, { line: HTMLElement, label: HTMLElement, named: DocTextHandle, plain: boolean, bar: HTMLElement, value: HTMLElement, said: string, at: string }>} */
    const lines = new Map(); // a bar's key (its group's value, or its row's element) -> what draws it
    const say = (/** @type {string | null} */ text) => {
      line.hidden = text === null;
      if (line.textContent !== (text ?? "")) line.textContent = text ?? "";
    };
    function drawNow() {
      table = context.table();
      asked = askedOf(context.readJSON("settings"));
      canWrite = Boolean(table && table.canEdit());
      face.toggleAttribute("data-writes", context.canEdit());
      head.hidden = !table;
      const chart = table ? chartOf(table, asked, words) : { line: host.hasAttribute("data-doc-from") ? words.unread : words.unbound };
      if (chart.line !== undefined) {
        drawn = null;
        updateStrip();
        titled.set(asked.title);
        head.classList.toggle("gallery-chart-view-untitled", !asked.title && !titled.editing);
        lines.clear();
        bars.replaceChildren();
        bars.hidden = true;
        return say(chart.line);
      }
      drawn = { by: chart.by, op: chart.by ? chart.op : "", value: chart.value };
      updateStrip();
      head.classList.remove("gallery-chart-view-untitled");
      titled.set(chart.title);
      bars.setAttribute("aria-label", chart.title);
      bars.hidden = false;
      say(chart.all > chart.bars.length ? words.more(chart.bars.length, chart.all) : null);
      const values = /** @type {number[]} */ (chart.bars.map(({ value }) => value).filter((value) => value !== null));
      const low = Math.min(0, ...values);
      const span = Math.max(0, ...values) - low || 1;
      const at = (/** @type {number} */ value) => ((value - low) / span) * 100;
      const zero = at(0);
      bars.classList.toggle("gallery-chart-view-below", low < 0);
      bars.style.setProperty("--gallery-chart-view-zero", `${zero}%`);
      const keys = new Set(chart.bars.map(({ key }) => key));
      for (const key of [...lines.keys()]) if (!keys.has(key)) lines.delete(key);
      // The bars whose name a reader can type over: a group's whose rows hold words alone in the column grouped
      // by, a row's whose first cell does (of a header naming it once).
      const t = /** @type {DocTableView} */ (table);
      const cellAt = chart.by ? t.columns.lastIndexOf(chart.by) : t.columns.lastIndexOf(t.columns[0] ?? "") === 0 ? 0 : -1;
      /** @type {Set<unknown>} */
      const marked = new Set(); // the keys of bars over a cell holding more than words
      for (const row of t.rows) if (!plain(row.el.cells[cellAt])) marked.add(chart.by ? keyOf(row, chart.by) : row.el);
      put(bars, chart.bars.map(({ key, label, value }) => {
        let kept = lines.get(key);
        if (!kept) {
          const row = made("div", "row");
          const name = made("span", "label");
          const lane = made("span", "lane");
          const bar = made("span", "bar");
          const said = made("span", "value");
          lane.append(bar, said);
          row.append(name, lane);
          /** @type {{ line: HTMLElement, label: HTMLElement, named: DocTextHandle, plain: boolean, bar: HTMLElement, value: HTMLElement, said: string, at: string }} */
          const entry = { line: row, label: name, named: /** @type {any} */ (null), plain: false, bar, value: said, said: "", at: "" };
          entry.named = DocKit.text(name, { commit: (text) => renameBar(key, text), enabled: () => canWrite && entry.plain, placeholder: chart.by ? words.none : "" });
          kept = entry;
          lines.set(key, kept);
        }
        kept.plain = !marked.has(key);
        kept.named.set(chart.by ? String(key) : label);
        const text = value === null ? "" : format.format(value);
        const from = value === null ? zero : Math.min(zero, at(value));
        const to = value === null ? zero : Math.max(zero, at(value));
        const place = `${from} ${to} ${value !== null && value < 0}`;
        if (kept.said !== text) {
          kept.said = text;
          kept.value.textContent = text;
        }
        if (kept.at !== place) {
          kept.at = place;
          kept.bar.hidden = value === null;
          kept.bar.style.left = `${from}%`;
          kept.bar.style.width = `${to - from}%`;
          kept.value.style.left = value !== null && value < 0 ? "" : `calc(${to}% + 4px)`;
          kept.value.style.right = value !== null && value < 0 ? `calc(${100 - from}% + 4px)` : "";
        }
        return kept.line;
      }));
    }
    drawNow();
    return { update: () => context.frame(drawNow) };
  },
});
