// gallery-soft/stats (工作区统计, 柔光风格): Gallery 风格's gallery/stats in the soft look, the same numbers.
// Four numbers of the workspace, read through context.workspace.query("stats") (its manifest's needs hold
// "workspace"): its documents, the words of all its documents, its to-dos done of all, and the documents
// edited this week (since Monday, 0:00); a workspace with none of them shows each 0. Under each number a small
// thing of its own: the words a document holds on average; how the words grew over the last 30 days (a line,
// its end ringed; a card 12 cells wide adds the words added this week in a green pill, against the last 14
// days), from the workspace's record of edits (query("activity"), the words each day added); the share of
// the to-dos done as a bar; and this week's edits day by day as small bars, today's in the accent, the days
// to come a stub. It reads again whenever the workspace says they changed (the `data` signal, "stats" and
// "activity": a document written, a to-do checked, a document made or gone) and as a day begins (the kit's
// clock: a new week starts on a Monday). It holds no part and writes nothing: all it shows is drawn (the
// manifest's `runtime`). Where the workspace cannot be read (an exported file, where it has no server; a
// server that does not answer) each number is a dash and a line says why; where its record of edits cannot
// be read the line and the bars are left out. The words are the page's language; a big number of words is
// said short (12.6 万字, 126.5K words) as the language does.
//
// Its face, laid out by its card's size (`context.size`, read again on `layout`; data-w, data-h, data-pad): no
// head of its own, each number's small chip and name the head of its cell. A card 8 or 12 cells wide and 2
// high holds the four side by side, a hairline between them, each like a small card; a 4 × 4 card two by two;
// a 4 × 2 card two by two, each its name over its number alone.

const WORDS = {
  zh: {
    documents: "文档",
    todos: "待办完成",
    words: "总字数",
    week: "本周编辑",
    weekUnit: "篇", // what the week's number counts: documents edited (the Gallery 风格 card counts the record's edits, 次)
    pieces: "篇",
    wordsUnit: "字",
    wordsBig: "万字",
    average: (/** @type {string} */ count) => ["平均每篇", count, "字"],
    added: "本周新增",
    offline: "在 Gallery 里打开时显示",
    failed: "读不到工作区的统计",
    locale: "zh-CN",
  },
  en: {
    documents: "Documents",
    todos: "To-dos done",
    words: "Words",
    week: "This week",
    weekUnit: "edited", // "This week 8" does not say what is counted
    pieces: "",
    wordsUnit: "words",
    wordsBig: "words",
    average: (/** @type {string} */ count) => ["", count, "words a document"],
    added: "this week",
    offline: "Shown when opened in Gallery",
    failed: "The workspace's numbers could not be read",
    locale: "en",
  },
};

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
 * The words of the workspace as the card's figure writes them, in `language`: { value, unit }, whole and
 * grouped under 10,000 (8,420 字), in 万 past it in Chinese (12.6 万字) and short in English (126.5K words).
 * @param {number} value
 * @param {"zh" | "en"} language
 */
function wordsOf(value, language) {
  const words = WORDS[language];
  if (Math.abs(value) < 10_000) return { value: countOf(value, language), unit: words.wordsUnit };
  if (language === "zh") return { value: (value / 10_000).toFixed(1).replace(/\.0$/, ""), unit: words.wordsBig };
  return { value: new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value), unit: words.wordsBig };
}

/**
 * The four cells the card shows of `stats` (workspace.query("stats")'s data), or of none (null: a dash
 * each), in `language`: [{ key, label, value, unit }].
 * @param {{ documents: number, todos: { done: number, total: number }, words: number, editedThisWeek: number } | null} stats
 * @param {"zh" | "en"} language
 */
function cellsOf(stats, language) {
  const words = WORDS[language];
  const dash = "—";
  const written = stats ? wordsOf(stats.words, language) : { value: dash, unit: words.wordsBig };
  return [
    { key: "documents", label: words.documents, value: stats ? countOf(stats.documents, language) : dash, unit: words.pieces },
    { key: "words", label: words.words, value: written.value, unit: written.unit },
    { key: "todos", label: words.todos, value: stats ? countOf(stats.todos.done, language) : dash, unit: stats ? `/ ${countOf(stats.todos.total, language)}` : "" },
    { key: "week", label: words.week, value: stats ? countOf(stats.editedThisWeek, language) : dash, unit: words.weekUnit },
  ];
}

/** A local day as the record writes it, YYYY-MM-DD. @param {Date} date */
const dayOf = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

/**
 * What the record of edits (`days`, workspace.query("activity")'s data, the last first or last; any order)
 * says the cells' feet draw, at `now`, the workspace's words now being `words`: `climb`, the words the
 * workspace held at the end of each of those days, the oldest first (the words now, less what each later day
 * added); `added`, the words this week added (since Monday); `week`, this week's edits day by day, Monday
 * first, null for a day still to come.
 * @param {Array<{ date: string, edits: number, words: number }>} days
 * @param {number} words
 * @param {Date} now
 */
function trendOf(days, words, now) {
  const sorted = [...days].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const climb = new Array(sorted.length);
  let held = words;
  for (let index = sorted.length - 1; index >= 0; index--) {
    climb[index] = held;
    held -= sorted[index].words;
  }
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7), 12);
  const byDay = new Map(sorted.map((day) => [day.date, day]));
  const week = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index, 12);
    return dayOf(date) > dayOf(now) ? null : byDay.get(dayOf(date))?.edits ?? 0;
  });
  const added = sorted.filter((day) => day.date >= dayOf(monday) && day.date <= dayOf(now)).reduce((sum, day) => sum + day.words, 0);
  return { climb, added, week };
}

/**
 * How much of `all` is done, as a whole percent, as every soft card says it (the to-dos' ring, the stats'
 * bar): rounded, but 100 only when all are done and 0 only when none is (18 of 27: 67; 199 of 200: 99;
 * 1 of 300: 1).
 * @param {number} done
 * @param {number} all
 */
function percentDone(done, all) {
  if (!(all > 0) || !(done > 0)) return 0;
  if (done >= all) return 100;
  return Math.min(99, Math.max(1, Math.round((100 * done) / all)));
}

/**
 * The size the face is laid out by: its card's cells (`context.size`), or `fallback` (the manifest's first
 * size) where no card is; and the frame's padding for it, as the soft cards pad theirs: "xs" on a card one
 * cell high, "s" on a small one (2 × 2 and less), "l" on one 3 cells high or more, else "m".
 * @param {DocComponentSize | null | undefined} size
 * @param {[number, number]} fallback
 */
function sizeOf(size, fallback) {
  const w = size?.w ?? fallback[0];
  const h = size?.h ?? fallback[1];
  return { w, h, pad: h === 1 ? "xs" : w <= 2 && h <= 2 ? "s" : h >= 3 ? "l" : "m" };
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
  node.className = `gallery-soft-stats-${kind}`;
  if (text !== undefined) node.textContent = text;
  return node;
}

// Each picture on its own grid (24 x 24, or 16 x 16 for those drawn on that), its line kept in proportion to the grid (pictureOf).
const ICONS = {
  documents: { grid: 16, body: '<path d="M5 2.5h3.9L12 5.6V12a1.5 1.5 0 0 1-1.5 1.5h-5A1.5 1.5 0 0 1 4 12V4a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M8.75 2.75V4.6a1.1 1.1 0 0 0 1.1 1.1h1.9"/>' },
  words: { grid: 24, body: '<path d="M6 6.5h12M12 6.5V19M9.5 19h5"/>' },
  todos: { grid: 16, body: '<path d="m2.6 4.4 1.1 1.1 1.9-2.1M2.6 10.4l1.1 1.1 1.9-2.1M8 4.5h5.5M8 10.5h5.5"/>' },
  week: { grid: 24, body: '<path d="M14.5 5.5l4 4L9 19H5v-4z"/>' },
};
/** A cell's picture on its grid; `width` is the line's on a 24 grid (1.8, a compact card's 2), kept in proportion to the grid. */
const pictureOf = (/** @type {{ grid: number, body: string }} */ { grid, body }, /** @type {number} */ width = 1.8) => `<svg viewBox="0 0 ${grid} ${grid}" fill="none" stroke="currentColor" stroke-width="${+((width * grid) / 24).toFixed(2)}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
const line = (/** @type {string} */ paths, /** @type {number} */ width = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

let sparks = 0; // the sparklines drawn on the page, each gradient's id its own

/**
 * A line of `values`, `width` x `height` px, the room under it washed with the accent, its last point ringed.
 * @param {number[]} values
 * @param {number} width
 * @param {number} height
 */
function sparkOf(values, width, height) {
  const id = `gallery-soft-stats-spark-${++sparks}`;
  const most = Math.max(...values);
  const least = Math.min(...values);
  const points = values.map((value, index) => [values.length > 1 ? (index / (values.length - 1)) * width : width, height - 2 - ((value - least) / (most - least || 1)) * (height - 5)]);
  const path = points.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const [lastX, lastY] = points[points.length - 1];
  const holder = made("span", "spark");
  holder.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="gallery-soft-stats-wash-top"/><stop offset="1" class="gallery-soft-stats-wash-end"/></linearGradient></defs><path d="${path} L${width} ${height} L0 ${height} Z" fill="url(#${id})"/><path class="gallery-soft-stats-spark-line" d="${path}"/><circle class="gallery-soft-stats-end" cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="2.6"/></svg>`;
  return holder;
}

DocKit.component({
  id: "gallery-soft/stats",
  on: ["data", "clock", "layout"],
  mount(host, context) {
    const language = languageOf(document.documentElement);
    const words = WORDS[language];
    const face = made("div", "face");
    const grid = made("dl", "grid");
    const note = made("p", "line");
    note.hidden = true;
    face.append(grid, note);
    host.append(face);
    const workspace = context.workspace;
    if (!workspace) return void context.fail(new Error("its manifest's needs hold \"workspace\": context.workspace is not there"));
    /** @type {Parameters<typeof cellsOf>[0]} */
    let stats = null;
    /** @type {Array<{ date: string, edits: number, words: number }> | null} */
    let record = null;
    let failure = "";
    // The cells drawn anew: each its chip and name, its number and unit, and its foot as the card's size has room for.
    const draw = () => {
      const { w, h, pad } = sizeOf(context.size, [8, 2]);
      const layout = h <= 2 && w >= 6 ? "row" : h <= 2 ? "compact" : "quad";
      Object.assign(face.dataset, { w: String(w), h: String(h), pad, layout });
      face.toggleAttribute("data-zero", stats !== null && stats.documents === 0 && stats.words === 0 && stats.todos.total === 0);
      const cells = cellsOf(stats, language);
      const trend = stats && record ? trendOf(record, stats.words, new Date()) : null;
      const showFeet = layout !== "compact" && stats !== null && !face.hasAttribute("data-zero");
      grid.replaceChildren(...cells.map(({ key, label, value, unit }) => {
        const cell = made("div", "cell");
        cell.dataset.stat = key;
        const name = made("dt", "label");
        const chip = made("span", "chip");
        chip.setAttribute("aria-hidden", "true");
        chip.innerHTML = pictureOf(ICONS[/** @type {keyof typeof ICONS} */ (key)], layout === "compact" ? 2 : 1.8);
        name.append(chip, made("span", "label-words", label));
        const figure = made("dd", "figure");
        figure.append(made("span", "number", value), ...(unit ? [made("span", "unit", unit)] : []));
        cell.append(name, figure);
        if (showFeet && stats) {
          const foot = made("dd", "foot");
          if (key === "documents" && stats.documents > 0) {
            const [before, count, after] = words.average(countOf(Math.round(stats.words / stats.documents), language));
            const said = made("span", "said");
            said.append(...(before ? [`${before} `] : []), made("b", "average", count), ` ${after}`);
            foot.append(said);
          } else if (key === "todos" && stats.todos.total > 0) {
            const bar = made("span", "bar");
            const fill = made("i", "fill");
            fill.style.width = `${((100 * stats.todos.done) / stats.todos.total).toFixed(1)}%`;
            bar.append(fill);
            foot.append(bar, made("b", "share", `${percentDone(stats.todos.done, stats.todos.total)}%`));
          } else if (key === "week" && trend) {
            const most = Math.max(1, ...trend.week.map((edits) => edits ?? 0));
            const bars = made("span", "bars");
            bars.setAttribute("aria-hidden", "true");
            const today = (new Date().getDay() + 6) % 7;
            bars.append(...trend.week.map((edits, index) => {
              const bar = made("i", "day");
              if (edits === null) bar.classList.add("gallery-soft-stats-future");
              else bar.style.height = `${Math.max(3, Math.round((edits / most) * 24))}px`;
              if (index === today) bar.classList.add("gallery-soft-stats-today");
              return bar;
            }));
            foot.append(bars);
          } else if (key === "words" && trend && trend.climb.length > 1) {
            if (w >= 12 && h <= 2) {
              const pill = made("span", trend.added < 0 ? "fell" : "grew");
              pill.innerHTML = line(trend.added < 0 ? '<path d="M4 7.5l5.5 5.5 3.5-3.5L20 17"/><path d="M14.5 17H20v-5.5"/>' : '<path d="M4 16.5l5.5-5.5 3.5 3.5L20 7"/><path d="M14.5 7H20v5.5"/>', 2.2);
              pill.append(countOf(Math.abs(trend.added), language));
              foot.append(pill, made("span", "added", words.added), made("span", "room"));
            } else foot.append(made("span", "room"));
          }
          cell.append(foot);
        }
        return cell;
      }));
      // The sparklines, as wide as their room once it is laid out.
      if (trend) {
        for (const room of /** @type {NodeListOf<HTMLElement>} */ (grid.querySelectorAll(".gallery-soft-stats-room"))) {
          const wide = room.parentElement?.querySelector(".gallery-soft-stats-grew, .gallery-soft-stats-fell") !== null;
          const width = Math.max(40, Math.floor(room.clientWidth));
          room.replaceChildren(sparkOf(wide ? trend.climb.slice(-14) : trend.climb, width, layout === "quad" ? 24 : 22));
        }
      }
      note.hidden = !failure;
      note.textContent = failure;
    };
    let asking = 0; // the last read asked: an older answer that comes after it is dropped
    const read = () => {
      const ticket = ++asking;
      workspace.query("stats").then(({ data }) => {
        if (ticket !== asking || context.signal.aborted) return;
        stats = data;
        failure = "";
        draw();
      }, (/** @type {any} */ error) => {
        if (ticket !== asking || context.signal.aborted) return;
        stats = null;
        failure = error?.code === "offline" ? words.offline : words.failed;
        draw();
      });
    };
    let reading = 0;
    const readRecord = () => {
      const ticket = ++reading;
      workspace.query("activity", { days: 30 }).then(({ data }) => {
        if (ticket !== reading || context.signal.aborted) return;
        record = data;
        draw();
      }, () => {
        if (ticket !== reading || context.signal.aborted) return;
        record = null;
        draw();
      });
    };
    draw();
    read();
    readRecord();
    // The sparklines' room changes with the card's width: drawn again as it does.
    if (typeof ResizeObserver === "function") {
      let width = 0;
      const watch = new ResizeObserver(() => {
        if (Math.round(face.clientWidth) === width) return;
        width = Math.round(face.clientWidth);
        draw();
      });
      watch.observe(face);
      context.signal?.addEventListener("abort", () => watch.disconnect(), { once: true });
    }
    return {
      update(reason, detail) {
        if (reason === "data" && detail === "stats") read();
        else if (reason === "data" && detail === "activity") readRecord();
        else if (reason === "clock" && detail === "day") {
          read();
          readRecord();
        } else if (reason === "layout") draw();
      },
    };
  },
});
