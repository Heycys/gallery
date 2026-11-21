// gallery/stats (工作区统计): four numbers of the workspace, each over a small picture of itself, read
// through context.workspace.query("stats") and query("activity") (its manifest's needs hold "workspace"):
// its documents (a square a document, those edited this week, since Monday 0:00, in the accent), the
// words of all its documents (and, from the record of edits, how they grew over the last 30 days: a line
// of the total at the end of each day, and the words added in all), its to-dos done of all (a bar), and
// the edits made this week (the record's, the reader's and the Agent's: a bar a day, Monday to Sunday,
// today's in the accent, the days to come a stub; and against the same days of the week before, 比上周同期
// +14%). A workspace with none of them shows each 0 and says what each waits for. It reads again whenever
// the workspace says they changed (the `data` signal, "stats" or "activity": a document written, a to-do
// checked, a document made or gone) and as a day begins (the kit's clock: a new week starts on a Monday).
// It holds no part and writes nothing: all it shows is drawn (the manifest's `runtime`). Where the
// workspace cannot be read (an exported file, where it has no server; a server that does not answer) each
// number is a dash and a line says why. The words are the page's language (the UI's where Gallery says
// it, else the page's lang); a big number of words is said short (12.4万, 124K).
//
// Its face (in the kit's card tokens) has no head: the four labels, each after a
// small picture of what it counts, are its titles; four cells in a row a hairline apart (an 8 × 2 card,
// the default, and a 12 × 2 one, `data-layout` "row" and "wide", by context.size), or two by two (a 4 × 4
// card, "square"), each its label, its number (28px, 32px on a wide card), its picture and a faint line
// under it; a card four columns wide and under four rows high (what the phone flow makes of an 8 × 2: it
// keeps its height and loses its width), "compact": two by two, the labels and the numbers (24px) alone.

const WORDS = {
  zh: {
    documents: "文档",
    words: "总字数",
    todos: "待办完成",
    week: "本周编辑",
    pieces: "篇",
    times: "次",
    wordUnit: "字",
    tenThousand: "万字",
    editedWeek: (/** @type {number} */ count) => ["", String(count), " 篇本周改过"],
    month: (/** @type {string} */ added) => ["近 30 天 ", added, ""],
    left: (/** @type {number} */ percent, /** @type {number} */ open) => [`${percent}%`, ` · 还剩 ${open} 项`],
    allDone: "全部完成",
    against: (/** @type {string} */ delta) => ["比上周同期 ", delta, ""],
    lastNone: "上周同期没有编辑",
    zero: { documents: "新建一篇就从这里开始", todos: "还没有待办", week: "这周还没动过" },
    fresh: "刚开始记录", // documents were edited this week but the record of edits has none of it yet: not "nothing done"
    offline: "在 Gallery 里打开时显示",
    failed: "读不到工作区的统计",
    locale: "zh-CN",
  },
  en: {
    documents: "Documents",
    words: "Words",
    todos: "To-dos done",
    week: "Edits this week",
    pieces: "",
    times: "",
    wordUnit: "",
    tenThousand: "",
    editedWeek: (/** @type {number} */ count) => ["", String(count), " edited this week"],
    month: (/** @type {string} */ added) => ["", added, " in 30 days"],
    left: (/** @type {number} */ percent, /** @type {number} */ open) => [`${percent}%`, ` · ${open} left`],
    allDone: "All done",
    against: (/** @type {string} */ delta) => ["", delta, " on last week"],
    lastNone: "None this time last week",
    zero: { documents: "Make one to start", todos: "No to-dos yet", week: "Nothing yet this week" },
    fresh: "Just started",
    offline: "Shown when opened in Gallery",
    failed: "The workspace's numbers could not be read",
    locale: "en",
  },
};

/** The days of the record it reads: 30 for the words, and this week and the one before for the edits. */
const DAYS = 37;

/** The language the page speaks: the UI's where Gallery says it (data-ge-language), else its lang's. */
function languageOf(/** @type {HTMLElement} */ root) {
  const ui = root.getAttribute("data-ge-language");
  return (ui !== null ? ui === "en" : /^en(?:-|$)/i.test(root.lang)) ? "en" : "zh";
}

/**
 * A count as the card writes it, in `language`: whole and grouped up to 99,999 (12,345), shorter past
 * it (12.3万, 123.5K), as the language writes a big number.
 * @param {number} value
 * @param {"zh" | "en"} language
 */
function countOf(value, language) {
  const big = Math.abs(value) >= 100_000;
  return new Intl.NumberFormat(WORDS[language].locale, big ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }).format(value);
}

/**
 * The words of the workspace as the card's number says them: { value, unit }: in Chinese 万字 from
 * 10,000 (12.4 万字), else 字; in English 12.4K from 10,000.
 * @param {number} words
 * @param {"zh" | "en"} language
 */
function wordsOf(words, language) {
  const said = WORDS[language];
  if (Math.abs(words) < 10_000) return { value: countOf(words, language), unit: said.wordUnit };
  if (language === "zh") return { value: (words / 10_000).toFixed(1), unit: said.tenThousand };
  return { value: `${(words / 1000).toFixed(1)}K`, unit: "" };
}

/** A change of words, signed and short (+6万, +5,432, −120). @param {number} value @param {"zh" | "en"} language */
function addedOf(value, language) {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "+";
  const size = Math.abs(value);
  if (size < 10_000) return `${sign}${countOf(size, language)}`;
  const short = (Math.round(size / 1000) / 10).toFixed(1).replace(/\.0$/, "");
  return `${sign}${language === "zh" ? `${short}万` : `${(Math.round(size / 100) / 10).toFixed(1).replace(/\.0$/, "")}K`}`;
}

const two = (/** @type {number} */ value) => String(value).padStart(2, "0");
/** A local day as the record writes it, YYYY-MM-DD. @param {Date} date */
const dayOf = (date) => `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
/** The day `count` days after `date` (before, negative), at noon. @param {Date} date @param {number} count */
const after = (date, count) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + count, 12);

/**
 * What the record of edits says for the card (`days`: query("activity")'s data, [{ date, edits, words }];
 * `total`: the words of the workspace now; `today`: a Date): `curve`, the words in all at the end of each
 * of the last 30 days, oldest first (a day before the record started taken as no change), none below 0;
 * `added`, the words those days added, never more than the total (the record counts each edit's change,
 * and a document deleted takes its words out of the total and none out of the record, so that the days
 * before it would read as fewer words than none); `week`, the edits of each day Monday to Sunday (null for a day to come); `edits`,
 * this week's; `last`, those of the week before up to the same weekday; `delta`, their change in percent
 * (null where the week before had none).
 * @param {Array<{ date: string, edits: number, words: number }>} days
 * @param {number} total
 * @param {Date} today
 */
function trendOf(days, total, today) {
  const by = new Map(days.map((day) => [day.date, day]));
  const curve = [];
  let words = total;
  for (let back = 0; back < 30; back++) {
    curve.unshift(Math.max(0, words));
    words -= by.get(dayOf(after(today, -back)))?.words ?? 0;
  }
  const added = total - Math.max(0, words);
  const weekday = (today.getDay() + 6) % 7;
  /** @type {Array<number | null>} */
  const week = Array.from({ length: 7 }, (_, index) => (index > weekday ? null : by.get(dayOf(after(today, index - weekday)))?.edits ?? 0));
  let edits = 0;
  for (const value of week) edits += value ?? 0;
  let last = 0;
  for (let index = 0; index <= weekday; index++) last += by.get(dayOf(after(today, index - weekday - 7)))?.edits ?? 0;
  return { curve, added, week, edits, last, delta: last > 0 ? Math.round((edits / last - 1) * 100) : null };
}

/**
 * The four cells the card shows of `stats` (workspace.query("stats")'s data), or of none (null: a dash
 * each), and of the record's `trend` (trendOf's, or null), in `language`: [{ key, label, value, unit, of,
 * caption: [before, bold, after] }].
 * @param {{ documents: number, todos: { done: number, total: number }, words: number, editedThisWeek: number } | null} stats
 * @param {ReturnType<typeof trendOf> | null} trend
 * @param {"zh" | "en"} language
 */
function cellsOf(stats, trend, language) {
  const said = WORDS[language];
  const dash = "—";
  if (!stats) return ["documents", "words", "todos", "week"].map((key) => ({ key, label: said[/** @type {"documents"} */ (key)], value: dash, unit: "", of: "", caption: ["", "", ""] }));
  const open = stats.todos.total - stats.todos.done;
  const percent = stats.todos.total > 0 ? Math.round((100 * stats.todos.done) / stats.todos.total) : 0;
  const words = wordsOf(stats.words, language);
  const edits = trend?.edits ?? 0;
  const delta = trend?.delta;
  return [
    { key: "documents", label: said.documents, value: countOf(stats.documents, language), unit: said.pieces, of: "", caption: stats.documents === 0 ? ["", "", said.zero.documents] : said.editedWeek(stats.editedThisWeek) },
    { key: "words", label: said.words, value: words.value, unit: words.unit, of: "", caption: said.month(addedOf(trend?.added ?? 0, language)) },
    { key: "todos", label: said.todos, value: countOf(stats.todos.done, language), unit: "", of: `/ ${countOf(stats.todos.total, language)}`, caption: stats.todos.total === 0 ? ["", "", said.zero.todos] : open === 0 ? ["", "100%", ` · ${said.allDone}`] : ["", ...said.left(percent, open)] },
    { key: "week", label: said.week, value: countOf(edits, language), unit: said.times, of: "", caption: edits === 0 ? ["", "", stats.editedThisWeek > 0 ? said.fresh : said.zero.week] : delta === null || delta === undefined ? ["", "", said.lastNone] : said.against(`${delta > 0 ? "+" : delta < 0 ? "−" : ""}${Math.abs(delta)}%`) },
  ];
}

// The cells' small pictures, of lines, each on its own grid (24 x 24, or 16 x 16 for those drawn on that); the line is
// the 1.9 of a 24 grid and kept in proportion to the grid, so that the four weigh the same on the screen.
const ICONS = {
  documents: { grid: 16, body: '<path d="M5 2.5h3.9L12 5.6V12a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 4 12V4a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M8.75 2.75V4.6a1.1 1.1 0 0 0 1.1 1.1h1.9"/>' },
  words: { grid: 24, body: '<path d="M5 6.5h14M5 12h14M5 17.5h9"/>' },
  todos: { grid: 16, body: '<path d="m2.6 4.4 1.1 1.1 1.9-2.1M2.6 10.4l1.1 1.1 1.9-2.1M8 4.5h5.5M8 10.5h5.5"/>' },
  week: { grid: 24, body: '<path d="M5 19.5v-6M10 19.5v-13M15 19.5v-9M20 19.5v-4"/>' },
};
const pictureOf = (/** @type {{ grid: number, body: string }} */ { grid, body }) => `<svg viewBox="0 0 ${grid} ${grid}" fill="none" stroke="currentColor" stroke-width="${+((1.9 * grid) / 24).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

/** The pictures' sizes by the card's layout: the line's and the bars' width and height, and the squares' columns, side and gap. */
const SIZES = {
  row: { width: 112, height: 24, columns: 11, side: 6, gap: 2 },
  wide: { width: 190, height: 24, columns: 16, side: 8, gap: 3 },
  square: { width: 104, height: 40, columns: 8, side: 8, gap: 3 },
  compact: { width: 104, height: 40, columns: 8, side: 8, gap: 3 }, // its pictures are not shown
};

let made_ = 0; // the gradients' ids, one each

/**
 * The documents as squares, `lit` of them (those edited this week) in the accent: at most three rows of
 * `columns`, a square standing for more than one document past that; the rows as even as they can be
 * (12 in two rows of 6, 23 in 8, 8 and 7), so that no square is left alone on a row of its own.
 * @param {number} count @param {number} lit @param {{ columns: number, side: number, gap: number }} size
 */
function squares(count, lit, { columns, side, gap }) {
  const most = columns * 3;
  const shown = Math.min(count, most);
  const on = count > most ? Math.round((lit / count) * shown) : Math.min(lit, shown);
  const rows = Math.max(1, Math.ceil(shown / columns));
  const across = Math.max(1, Math.ceil(shown / rows));
  let drawn = "";
  for (let index = 0; index < shown; index++) {
    drawn += `<rect x="${(index % across) * (side + gap)}" y="${Math.floor(index / across) * (side + gap)}" width="${side}" height="${side}" rx="${side > 6 ? 2 : 1.6}" class="gallery-stats-${index < on ? "on" : "off"}"/>`;
  }
  if (shown === 0) drawn = `<rect width="${columns * (side + gap) - gap}" height="6" rx="3" class="gallery-stats-empty"/>`;
  const height = shown === 0 ? 6 : rows * (side + gap) - gap;
  return `<svg width="${columns * (side + gap) - gap}" height="${height}" aria-hidden="true">${drawn}</svg>`;
}

/** The words over 30 days as a line, its area fading under it and a dot at its end. @param {number[]} values @param {{ width: number, height: number }} size */
function curveOf(values, { width, height }) {
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (high === low) return `<svg width="${width}" height="${height}" aria-hidden="true"><line x1="0" x2="${width}" y1="${height - 2}" y2="${height - 2}" class="gallery-stats-flat" stroke-width="1.8" stroke-linecap="round"/></svg>`;
  const step = width / (values.length - 1);
  const y = (/** @type {number} */ value) => height - 3 - ((value - low) / (high - low)) * (height - 7);
  const points = values.map((value, index) => [index * step, y(value)]);
  const line = points.map(([x, at], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${at.toFixed(1)}`).join("");
  const [endX, endY] = points[points.length - 1];
  const id = `gallery-stats-fade-${++made_}`;
  return `<svg width="${width}" height="${height}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" class="gallery-stats-stop" stop-opacity=".22"/><stop offset="1" class="gallery-stats-stop" stop-opacity="0"/></linearGradient></defs><path d="${line}L${width} ${height}L0 ${height}Z" fill="url(#${id})"/><path d="${line}" fill="none" class="gallery-stats-line" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/><circle cx="${endX}" cy="${endY}" r="3.2" class="gallery-stats-end" stroke-width="2"/></svg>`;
}

/** This week's edits, a bar a day, today's in the accent, a day to come a stub. @param {Array<number | null>} values @param {number} today @param {{ width: number, height: number }} size */
function barsOf(values, today, { width, height }) {
  const most = Math.max(1, ...values.filter((value) => value !== null));
  const bar = Math.min(12, (width - 30) / 7);
  const gap = (width - 7 * bar) / 6;
  const none = values.every((value) => !value);
  let drawn = "";
  values.forEach((value, index) => {
    const x = index * (bar + gap);
    if (value === null || none) return void (drawn += `<rect x="${x}" y="${height - 2}" width="${bar}" height="2" rx="1" class="gallery-stats-stub"/>`);
    const tall = Math.max(3, (value / most) * height);
    drawn += `<path d="M${x} ${height}V${height - tall + 3}a3 3 0 0 1 3-3h${bar - 6}a3 3 0 0 1 3 3V${height}Z" class="gallery-stats-${index === today ? "today" : "day"}"/>`;
  });
  return `<svg width="${width}" height="${height}" aria-hidden="true">${drawn}</svg>`;
}

/**
 * An element of the face, of `kind` (its class).
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} kind
 * @param {string} [text]
 */
function made(tag, kind, text) {
  const node = document.createElement(tag);
  node.className = `gallery-stats-${kind}`;
  if (text !== undefined) node.textContent = text;
  return node;
}

DocKit.component({
  id: "gallery/stats",
  on: ["data", "clock", "layout"],
  mount(host, context) {
    const language = languageOf(document.documentElement);
    const words = WORDS[language];
    const face = made("div", "face");
    const grid = made("dl", "grid");
    const line = made("p", "line");
    line.hidden = true;
    face.append(grid, line);
    host.append(face);
    const workspace = context.workspace;
    if (!workspace) return void context.fail(new Error("its manifest's needs hold \"workspace\": context.workspace is not there"));
    /** @type {Parameters<typeof cellsOf>[0]} */
    let stats = null;
    /** @type {Array<{ date: string, edits: number, words: number }>} */
    let days = [];
    let drawnKey = "";
    // The cells, each its label over its number, its picture and its line, drawn again only when what they say is another.
    const draw = () => {
      const size = context.size;
      const layout = !size ? "row" : size.w >= 12 ? "wide" : size.w <= 4 ? (size.h >= 4 ? "square" : "compact") : "row";
      face.dataset.layout = layout;
      face.toggleAttribute("data-unread", !stats);
      const now = new Date();
      const trend = stats ? trendOf(days, stats.words, now) : null;
      const cells = cellsOf(stats, trend, language);
      const key = JSON.stringify([layout, cells, trend, dayOf(now)]);
      if (key === drawnKey) return;
      drawnKey = key;
      const sizes = SIZES[/** @type {keyof typeof SIZES} */ (layout)];
      grid.replaceChildren(...cells.map(({ key: kind, label, value, unit, of, caption }) => {
        const cell = made("div", "cell");
        cell.dataset.stat = kind;
        const name = made("dt", "label");
        name.innerHTML = pictureOf(ICONS[/** @type {keyof typeof ICONS} */ (kind)]);
        name.append(made("span", "label-words", label));
        const number = made("dd", "value");
        number.append(made("span", "number", value));
        if (unit) number.append(made("span", "unit", unit));
        if (of) number.append(made("span", "of", of));
        const picture = made("dd", "picture");
        if (stats && trend) {
          if (kind === "documents") picture.innerHTML = squares(stats.documents, stats.editedThisWeek, sizes);
          if (kind === "words") picture.innerHTML = curveOf(trend.curve, sizes);
          if (kind === "todos") {
            const bar = made("span", "bar");
            const fill = made("span", "fill");
            fill.style.width = `${stats.todos.total > 0 ? (100 * stats.todos.done) / stats.todos.total : 0}%`;
            bar.append(fill);
            picture.append(bar);
          }
          if (kind === "week") picture.innerHTML = barsOf(trend.week, (now.getDay() + 6) % 7, sizes);
        }
        const foot = made("dd", "caption");
        if (kind === "documents" && stats && stats.documents > 0) foot.append(made("i", "mark"));
        const [before, bold, after_] = caption;
        if (before) foot.append(before);
        if (bold) foot.append(made("b", "strong", bold));
        if (after_) foot.append(after_);
        if (!stats) foot.textContent = " ";
        cell.append(name, number, picture, foot);
        return cell;
      }));
    };
    let asking = 0; // the last read asked: an older answer that comes after it is dropped
    const read = () => {
      const ticket = ++asking;
      const record = workspace.query("activity", { days: DAYS }).then(({ data }) => data, () => []);
      workspace.query("stats").then(async ({ data }) => {
        const kept = await record;
        if (ticket !== asking || context.signal.aborted) return;
        line.hidden = true;
        stats = data;
        days = Array.isArray(kept) ? kept : [];
        draw();
      }, (/** @type {any} */ error) => {
        if (ticket !== asking || context.signal.aborted) return;
        stats = null;
        days = [];
        draw();
        line.hidden = false;
        line.textContent = error?.code === "offline" ? words.offline : words.failed;
      });
    };
    draw();
    read();
    return {
      update(reason, detail) {
        if ((reason === "data" && (detail === "stats" || detail === "activity")) || (reason === "clock" && detail === "day")) read();
        else if (reason === "layout") draw();
      },
    };
  },
});
