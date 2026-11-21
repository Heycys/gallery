// gallery/heatmap (编辑热力图): the workspace's record of edits by day, a year of days as a
// grid: a column a week (Monday at the top, as a Chinese calendar starts it), a square a day,
// darker for a day of more, read through context.workspace.query("activity") (its manifest's needs hold
// "workspace": the server's record, .gallery/state/activity.json, a reader's commits and the Agent's
// writes, by day). Its one setting, `words` (按字数显示, the card's form: the grip at its top right ›
// 设置…, kept in its data part `settings`, which the board writes and this block only reads), draws the
// words a day added (its net change, a day that took more away than it added drawn as none) instead of
// how many edits it had. It asks for every day 53 weeks draw (the record keeps as many); a day before the
// record started is a small gray dot, never an empty square, and a day to come is not drawn. It reads again
// whenever the workspace says its record changed (the `data` signal, "activity") and as a day begins (the
// kit's clock), and draws again as its card changes size (`layout`, and its own ResizeObserver on the room
// the squares have) or its settings change (`source`). Where the workspace cannot be read (an exported
// file, where it has no server; a server that does not answer) the squares are empty and a line over them
// says why. The words are the page's language (the UI's where Gallery says it, else the page's lang).
//
// Its face (in the kit's card tokens): a head of the chip (a calendar), 编辑热力图
// and its quiet meta; the squares the hero, five shades of the accent by how a day stands among the days
// recorded (`levelsOf`: the quarter of them with least, and so on, never by a straight line to the most,
// so that a busy day does not make every other pale); today's square ringed; the months' names over the
// weeks they begin in and 一 三 五 beside the rows; under them, less to more. Laid out by the card's cells
// (`data-layout`, by context.size): "full" (8 × 4, the default, and 12 × 4) squares of 23px, 4px apart,
// as many weeks as fit (14, 26), and at their left the figures (`summaryOf`): what the weeks are (近 14 周),
// the edits (or words) in them, large, the average a day, the days with any, the longest run of days in
// a row and today's, and a bar of how they split between the reader and the Agent; "compact" (4 × 4) squares
// of 21px over a line of the total and the days with any; "strip" (12 × 3, a card three cells high or
// less) squares of 14px (smaller where the card is lower), a year of them, the total and the days in the
// head's meta, and the day the record began said by the legend's dot. A record begun within the week is
// said so (从 11月11日 开始记录), and an export's figures say the time they are of (截至 …). A pointer on a
// square shows its day: its edits (or words), and the reader's and the Agent's.

const WORDS = {
  zh: {
    title: "编辑热力图",
    weeks: (/** @type {number} */ count) => `近 ${count} 周`,
    year: "过去一年",
    added: "新增",
    editsUnit: "次编辑",
    wordsUnit: "字",
    tenThousand: "万字",
    average: (/** @type {string} */ value, /** @type {boolean} */ words) => ["平均每天 ", value, words ? " 字" : " 次"],
    active: "有编辑的天数",
    run: "最长连续",
    today: "今天",
    days: "天",
    times: "次",
    you: "你",
    agent: "Agent",
    activeDays: (/** @type {number} */ count) => `${count} 天有编辑`,
    stripMeta: (/** @type {string} */ period, /** @type {string} */ total, /** @type {number} */ days) => [`${period} ${total}`, `${days} 天`],
    totalEdits: (/** @type {string} */ count) => `${count} 次编辑`,
    byWords: "按字数",
    fresh: "刚开始记录",
    freshSince: (/** @type {string} */ date) => `从 ${date} 开始记录`,
    freshSaid: ["以后每天写了多少，", "都会在右边亮起一格"],
    before: "开始记录之前",
    beforeSince: (/** @type {string} */ date) => `${date} 开始记录之前`,
    upTo: (/** @type {string} */ when) => `截至 ${when}`,
    less: "少",
    more: "多",
    tip: (/** @type {string} */ date, /** @type {number} */ edits, /** @type {number} */ words, /** @type {boolean} */ byWords) => `${date} · ${byWords ? `${words >= 0 ? "+" : "−"}${Math.abs(words).toLocaleString("zh-CN")} 字` : `${edits} 次编辑`}`,
    split: (/** @type {number} */ you, /** @type {number} */ agent) => `你 ${you} 次 · Agent ${agent} 次`,
    unrecorded: "还没开始记录",
    offline: "在 Gallery 里打开时显示",
    failed: "读不到工作区的编辑记录",
    date: (/** @type {Date} */ date) => `${date.getMonth() + 1}月${date.getDate()}日`,
    weekday: (/** @type {Date} */ date) => `${date.getMonth() + 1}月${date.getDate()}日 ${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()]}`,
    month: (/** @type {number} */ month) => `${month + 1}月`,
    rows: ["一", "", "三", "", "五", "", ""],
    locale: "zh-CN",
  },
  en: {
    title: "Editing heatmap",
    weeks: (/** @type {number} */ count) => `Last ${count} weeks`,
    year: "Past year",
    added: " added",
    editsUnit: "edits",
    wordsUnit: "words",
    tenThousand: "",
    average: (/** @type {string} */ value, /** @type {boolean} */ words) => ["", value, words ? " words a day" : " a day"],
    active: "Days with edits",
    run: "Longest run",
    today: "Today",
    days: "d",
    times: "",
    you: "You",
    agent: "Agent",
    activeDays: (/** @type {number} */ count) => `${count} ${count === 1 ? "day" : "days"} with edits`,
    stripMeta: (/** @type {string} */ period, /** @type {string} */ total, /** @type {number} */ days) => [`${period}: ${total}`, `${days} ${days === 1 ? "day" : "days"}`],
    totalEdits: (/** @type {string} */ count) => `${count} edits`,
    byWords: "by words",
    fresh: "Just started",
    freshSince: (/** @type {string} */ date) => `Recording since ${date}`,
    freshSaid: ["Each day you write lights a square on the right"],
    before: "Before recording",
    beforeSince: (/** @type {string} */ date) => `Before ${date}`,
    upTo: (/** @type {string} */ when) => `As of ${when}`,
    less: "Less",
    more: "More",
    tip: (/** @type {string} */ date, /** @type {number} */ edits, /** @type {number} */ words, /** @type {boolean} */ byWords) => `${date} · ${byWords ? `${words >= 0 ? "+" : "−"}${Math.abs(words).toLocaleString("en")} words` : `${edits} ${edits === 1 ? "edit" : "edits"}`}`,
    split: (/** @type {number} */ you, /** @type {number} */ agent) => `You ${you} · Agent ${agent}`,
    unrecorded: "Not recorded yet",
    offline: "Shown when opened in Gallery",
    failed: "The workspace's record of edits could not be read",
    date: (/** @type {Date} */ date) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()]} ${date.getDate()}`,
    weekday: (/** @type {Date} */ date) => `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()]}, ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()]} ${date.getDate()}`,
    month: (/** @type {number} */ month) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month],
    rows: ["Mon", "", "Wed", "", "Fri", "", ""],
    locale: "en",
  },
};

/** The language the page speaks: the UI's where Gallery says it (data-ge-language), else its lang's. */
function languageOf(/** @type {HTMLElement} */ root) {
  const ui = root.getAttribute("data-ge-language");
  return (ui !== null ? ui === "en" : /^en(?:-|$)/i.test(root.lang)) ? "en" : "zh";
}

const MOST_WEEKS = 53;
/** The days of the record it reads: as many as 53 weeks draw at the most (on a Sunday, its first square 370 days back). */
const DAYS = MOST_WEEKS * 7;
/** The weekdays' column and the months' row, in px. */
const LABELS = 20;
const MONTHS = 18;
const two = (/** @type {number} */ value) => String(value).padStart(2, "0");
/** A local day as the record writes it, YYYY-MM-DD. @param {Date} date */
const dayOf = (date) => `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
/** The day `count` days after `date` (before, negative), at noon. @param {Date} date @param {number} count */
const after = (date, count) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + count, 12);

/**
 * How a card of `size` (context.size: its cells, or null where no card holds it, a document) lays its face
 * out: "grid" two cells high or less (8 × 2: the squares alone, the user's word of 2026-11-09), "strip" three
 * cells high, "compact" four wide or less, else "full".
 * @param {{ w: number, h: number } | null | undefined} size
 * @returns {"full" | "compact" | "strip" | "grid"}
 */
function layoutOf(size) {
  if (!size) return "full";
  if (size.h <= 2) return "grid";
  if (size.h <= 3) return "strip";
  return size.w <= 4 ? "compact" : "full";
}

/**
 * The squares of a layout in a room of `width` x `height` px (the field's: the weekdays' column and the
 * months' row inside it): { pitch (from one square to the next), cell (a square's side), gap, weeks }.
 * "full" 23px squares 4px apart, "compact" 21px; "strip" and "grid" 14px, 3px apart, smaller where the room is
 * lower (seven of them and the months' row in its height, 4px at the least, 2px apart under 10px); as many
 * weeks as the width holds, 1 to 53.
 * @param {"full" | "compact" | "strip" | "grid"} layout
 * @param {number} width
 * @param {number} height
 */
function fitOf(layout, width, height) {
  let pitch = layout === "full" ? 27 : layout === "compact" ? 25 : 17;
  let gap = pitch === 17 ? 3 : 4;
  if ((layout === "strip" || layout === "grid") && Number.isFinite(height)) {
    pitch = Math.max(6, Math.min(17, Math.floor((height - MONTHS + gap) / 7)));
    gap = pitch < 12 ? 2 : 3;
  }
  const weeks = Math.max(1, Math.min(MOST_WEEKS, Math.floor((width - LABELS + gap) / pitch)));
  return { pitch, cell: pitch - gap, gap, weeks };
}

/**
 * The weeks drawn, the last the one of `today` (a Date), `weeks` of them: [[{ date, day, future }…7]…],
 * each a column, Monday first; `future` a day after today, which is not drawn.
 * @param {Date} today
 * @param {number} weeks
 */
function weeksOf(today, weeks) {
  const monday = after(today, -((today.getDay() + 6) % 7));
  const columns = [];
  for (let week = weeks - 1; week >= 0; week--) {
    const start = after(monday, -7 * week);
    columns.push(Array.from({ length: 7 }, (_, row) => {
      const date = after(start, row);
      return { date, day: dayOf(date), future: dayOf(date) > dayOf(today) };
    }));
  }
  return columns;
}

/**
 * The bounds of the levels of `values` (a day's edits, or the words it added, of every day recorded): the
 * values at 38%, 68% and 90% of the days with any, so that each shade holds a share of the days; for fewer
 * than five such days, a quarter, a half and three quarters of the most.
 * @param {number[]} values
 */
function levelsOf(values) {
  const some = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (some.length < 5) {
    const most = some[some.length - 1] ?? 0;
    return [most / 4, most / 2, (3 * most) / 4];
  }
  return [some[Math.floor(some.length * 0.38)], some[Math.floor(some.length * 0.68)], some[Math.floor(some.length * 0.9)]];
}

/**
 * The level of a day's square, 0 (none) to 4 (the most), of `value` by the bounds `levels` (levelsOf's).
 * @param {number} value
 * @param {number[]} levels
 */
function levelOf(value, levels) {
  if (!(value > 0)) return 0;
  if (value <= levels[0]) return 1;
  if (value <= levels[1]) return 2;
  return value <= levels[2] ? 3 : 4;
}

/**
 * What the card says of the record `days` (workspace.query("activity")'s data: [{ date, edits, words,
 * reader, agent }], from the day it started or 53 weeks back to today) over the `weeks` it draws (`today`,
 * a Date), counting `words` (the setting) or edits: `values` (each day's, by its date), `levels`, `since`
 * (the first day recorded), and the figures: `total` (in the weeks drawn), `average` (a day, of the days
 * recorded in them), `active` (days with any edit), `run` (the longest run of them), `today` (its value),
 * `you` and `agent` (the edits of each), and `fresh` (the record began within the week).
 * @param {Array<{ date: string, edits: number, words: number, reader?: { edits: number }, agent?: { edits: number } }>} days
 * @param {boolean} words
 * @param {number} weeks
 * @param {Date} today
 */
function summaryOf(days, words, weeks, today) {
  const valueOf = (/** @type {{ edits: number, words: number }} */ day) => (words ? Math.max(0, day.words) : day.edits);
  const values = new Map(days.map((day) => [day.date, valueOf(day)]));
  const since = days[0]?.date ?? null;
  const first = dayOf(after(today, -((today.getDay() + 6) % 7) - 7 * (weeks - 1)));
  const shown = days.filter((day) => day.date >= first && day.date <= dayOf(today));
  let run = 0;
  let longest = 0;
  for (const day of shown) {
    run = day.edits > 0 ? run + 1 : 0;
    longest = Math.max(longest, run);
  }
  const total = shown.reduce((sum, day) => sum + valueOf(day), 0);
  const agent = shown.reduce((sum, day) => sum + (day.agent?.edits ?? 0), 0);
  const you = shown.reduce((sum, day) => sum + (day.reader?.edits ?? 0), 0);
  const now = days.find((day) => day.date === dayOf(today));
  return {
    values, since, levels: levelsOf([...values.values()]),
    total, average: shown.length > 0 ? total / shown.length : 0, active: shown.filter((day) => day.edits > 0).length, run: longest,
    today: now ? valueOf(now) : 0, you, agent, fresh: since !== null && since > dayOf(after(today, -7)),
  };
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
  node.className = `gallery-heatmap-${kind}`;
  if (text !== undefined) node.textContent = text;
  return node;
}

DocKit.component({
  id: "gallery/heatmap",
  on: ["data", "source", "layout", "clock"],
  mount(host, context) {
    const language = languageOf(document.documentElement);
    const words = WORDS[language];
    const format = (/** @type {number} */ value) => new Intl.NumberFormat(words.locale, { maximumFractionDigits: 0 }).format(value);
    const face = made("div", "face");
    const head = made("div", "head");
    const meta = made("span", "line");
    const chip = made("span", "chip");
    chip.setAttribute("aria-hidden", "true");
    chip.innerHTML = '<svg viewBox="0 0 20 20" fill="currentColor" stroke="none"><rect x="3.6" y="3.6" width="3.4" height="3.4" rx="1"/><rect x="8.3" y="3.6" width="3.4" height="3.4" rx="1"/><rect x="13" y="3.6" width="3.4" height="3.4" rx="1"/><rect x="3.6" y="8.3" width="3.4" height="3.4" rx="1"/><rect x="8.3" y="8.3" width="3.4" height="3.4" rx="1"/><rect x="13" y="8.3" width="3.4" height="3.4" rx="1"/><rect x="3.6" y="13" width="3.4" height="3.4" rx="1"/><rect x="8.3" y="13" width="3.4" height="3.4" rx="1"/><rect x="13" y="13" width="3.4" height="3.4" rx="1"/></svg>'; // nine squares, filled, on a 20 grid
    head.append(chip, made("span", "title", words.title), meta);
    const body = made("div", "body");
    // The figures beside the squares (a full card), or the line over them (a compact one).
    const aside = made("div", "aside");
    const period = made("span", "label");
    const total = made("span", "total");
    const totalNumber = made("span", "number");
    const totalUnit = made("span", "unit");
    total.append(totalNumber, totalUnit);
    const average = made("span", "average");
    const facts = made("dl", "facts");
    const who = made("div", "who");
    const split = made("span", "split");
    const youBar = made("i", "you-bar");
    const agentBar = made("i", "agent-bar");
    split.append(youBar, agentBar);
    const whoWords = made("span", "who-words");
    who.append(split, whoWords);
    aside.append(period, total, average, facts, who);
    const field = made("div", "field");
    const area = made("div", "area");
    const months = made("div", "months");
    const rows = made("div", "rows");
    for (const label of words.rows) rows.append(made("span", "row", label));
    const grid = made("div", "grid");
    // The tip stands over the card, in the page's top layer (a popover; where a browser has none, fixed to the
    // window), never inside the card, whose overflow a tip near its edge would widen into a scrollbar.
    const tip = made("div", "tip");
    const popover = typeof tip.showPopover === "function";
    if (popover) tip.popover = "manual";
    else tip.hidden = true;
    tip.setAttribute("aria-hidden", "true");
    area.append(months, rows, grid, tip);
    const legend = made("div", "legend");
    const note = made("span", "note");
    legend.append(made("span", "less", words.less), ...[0, 1, 2, 3, 4].map((level) => {
      const square = made("span", "square");
      square.dataset.level = String(level);
      return square;
    }), made("span", "more", words.more), note);
    const overlay = made("p", "overlay");
    overlay.hidden = true;
    field.append(area, legend, overlay);
    body.append(aside, field);
    // As wide as the corner a board's grip takes of the content's top right (--gallery-grip-room, a custom
    // property CSS alone resolves), measured where the months' row is the face's first (the squares alone).
    const gripRoom = made("i", "grip-room");
    gripRoom.setAttribute("aria-hidden", "true");
    face.append(head, body, gripRoom);
    host.append(face);
    const workspace = context.workspace;
    if (!workspace) return void context.fail(new Error("its manifest's needs hold \"workspace\": context.workspace is not there"));

    /** @type {Array<{ date: string, edits: number, words: number, reader?: { edits: number, words: number }, agent?: { edits: number, words: number } }> | null} */
    let days = null;
    let at = "";
    let failure = "";
    let drawn = "";
    const kv = (/** @type {string} */ name, /** @type {string} */ value, /** @type {string} */ unit) => {
      const row = made("div", "fact");
      const said = made("dd", "fact-value", value);
      if (unit) said.append(made("small", "fact-unit", unit));
      row.append(made("dt", "fact-name", name), said);
      return row;
    };
    const bigOf = (/** @type {number} */ value, /** @type {boolean} */ byWords) => {
      if (!byWords) return [format(value), language === "zh" ? words.editsUnit : ` ${words.editsUnit}`];
      if (language === "zh" && value >= 10_000) return [(value / 10_000).toFixed(1), words.tenThousand];
      return [format(value), language === "zh" ? words.wordsUnit : ` ${words.wordsUnit}`];
    };
    const draw = () => {
      const settings = context.readJSON("settings");
      if (settings === undefined) return; // no JSON: the instance has failed, and Gallery shows what it holds
      const byWords = settings !== null && typeof settings === "object" && settings.words === true;
      const layout = layoutOf(context.size);
      face.dataset.layout = layout;
      const today = new Date();
      // The room the squares have: the field's, the legend's taken off (a strip's height says how large they are).
      const room = { width: field.clientWidth || 600, height: field.clientHeight > 0 ? field.clientHeight - legend.offsetHeight : Infinity };
      const { pitch, cell, gap, weeks } = fitOf(layout, room.width, room.height);
      const summary = summaryOf(days ?? [], byWords, weeks, today);
      const exported = context.place === "export" && at;
      const fresh = days !== null && summary.fresh;
      face.toggleAttribute("data-fresh", fresh);
      face.toggleAttribute("data-unread", Boolean(failure));
      const key = JSON.stringify([layout, pitch, weeks, dayOf(today), byWords, days, failure, at]);
      if (key === drawn) return;
      drawn = key;
      hide(); // the squares drawn anew: the one it stood over is gone
      // The head's meta.
      const [bigValue, bigUnit] = bigOf(summary.total, byWords);
      const atWhen = exported ? (() => { const when = new Date(at); return `${words.date(when)} ${two(when.getHours())}:${two(when.getMinutes())}`; })() : "";
      if (failure) meta.textContent = "";
      else if (layout === "strip") {
        const [first, second] = words.stripMeta(weeks >= 52 ? words.year : words.weeks(weeks), byWords ? `${bigValue} ${bigUnit.trim()}` : words.totalEdits(format(summary.total)), summary.active);
        const dot = made("span", "dot", "·");
        meta.replaceChildren(first, dot, second);
      } else if (layout === "compact") meta.textContent = words.weeks(weeks) + (byWords ? ` · ${words.byWords}` : "");
      else meta.textContent = fresh ? words.fresh : exported ? words.upTo(atWhen) : byWords ? words.byWords : "";
      // The figures.
      totalNumber.textContent = failure ? "—" : bigValue;
      totalUnit.textContent = failure ? "" : bigUnit;
      if (fresh && summary.since) {
        period.textContent = words.freshSince(words.date(new Date(`${summary.since}T12:00:00`)));
        average.replaceChildren();
        // Its clauses each whole on a line where one fits (style.css), so that it breaks after the comma.
        const said = made("p", "fresh");
        said.append(...words.freshSaid.map((clause) => made("span", "clause", clause)));
        facts.replaceChildren(said);
      } else {
        period.textContent = layout === "compact" ? "" : `${words.weeks(weeks)}${byWords ? words.added : ""}`;
        const [before, value, afterwards] = words.average(byWords ? format(Math.round(summary.average)) : summary.average.toFixed(1), byWords);
        average.replaceChildren(before, made("b", "strong", value), afterwards);
        const todayName = exported ? words.date(new Date(at)) : words.today;
        facts.replaceChildren(
          kv(words.active, String(summary.active), words.days),
          kv(words.run, String(summary.run), words.days),
          kv(todayName, byWords ? format(summary.today) : String(summary.today), byWords ? words.wordsUnit : words.times),
        );
      }
      if (layout === "compact") average.replaceChildren(words.activeDays(summary.active));
      const both = summary.you + summary.agent;
      const youShare = both > 0 ? Math.round((100 * summary.you) / both) : 0;
      youBar.style.flex = String(summary.you || (both ? 0 : 1));
      agentBar.style.flex = String(summary.agent);
      const label = (/** @type {string} */ kind, /** @type {string} */ name, /** @type {number} */ share) => {
        const piece = made("span", kind);
        piece.append(made("i", "swatch"), `${name} `, made("b", "strong", `${share}%`));
        return piece;
      };
      whoWords.replaceChildren(label("you", words.you, youShare), label("agent", words.agent, both > 0 ? 100 - youShare : 0));
      who.hidden = both === 0 || fresh;
      // The legend's note: since when the record is kept, where days before it are drawn.
      const columns = weeksOf(today, weeks);
      const firstDay = columns[0][0].day;
      const before = days !== null && summary.since !== null && summary.since > firstDay;
      note.replaceChildren(...(before && layout !== "compact" ? [made("s", "dot-key"), layout === "strip" ? words.beforeSince(words.date(new Date(`${summary.since}T12:00:00`))) : words.before] : []));
      overlay.hidden = !failure;
      overlay.textContent = failure;
      // The squares.
      face.style.setProperty("--gallery-heatmap-cell", `${cell}px`);
      face.style.setProperty("--gallery-heatmap-gap", `${gap}px`);
      face.style.setProperty("--gallery-heatmap-weeks", String(weeks));
      const byDate = new Map((days ?? []).map((item) => [item.date, item]));
      grid.replaceChildren(...columns.flatMap((column) => column.map(({ date, day, future }) => {
        const square = made("span", "day");
        if (future) {
          square.classList.add("gallery-heatmap-future");
          return square;
        }
        square.dataset.date = day;
        if (day === dayOf(today)) square.classList.add("gallery-heatmap-today");
        const recorded = days !== null && summary.since !== null && day >= summary.since;
        if (!recorded) {
          square.classList.add("gallery-heatmap-before");
          square.setAttribute("aria-label", `${words.weekday(date)} · ${days === null ? failure : words.unrecorded}`);
          return square;
        }
        const entry = byDate.get(day);
        square.dataset.level = String(levelOf(summary.values.get(day) ?? 0, summary.levels));
        square.setAttribute("aria-label", `${words.tip(words.weekday(date), entry?.edits ?? 0, entry?.words ?? 0, byWords)}（${words.split(entry?.reader?.edits ?? 0, entry?.agent?.edits ?? 0)}）`);
        return square;
      })));
      // A month's name over the week its first day falls in (the first week's too, but where the next is
      // fewer than three weeks after it).
      const starts = columns.flatMap((column, index) => (index === 0 || column[0].date.getMonth() !== columns[index - 1][0].date.getMonth() ? [index] : []));
      if (starts.length > 1 && starts[1] < 3) starts.shift();
      months.replaceChildren(...starts.map((index) => {
        const name = made("span", "month", words.month(columns[index][0].date.getMonth()));
        name.style.setProperty("--gallery-heatmap-week", String(index));
        return name;
      }));
      // The squares alone: the months' row is the card's first, and a name that would reach into the grip's corner is left out.
      if (layout === "grid") {
        const end = face.getBoundingClientRect().right - gripRoom.offsetWidth;
        for (const name of [...months.children]) if (name.getBoundingClientRect().right > end) name.remove();
      }
    };
    // A pointer on a square: its day, its count and whose, over it (under it where the window has no room
    // above), its middle at the square's but held 8px inside the window.
    const hide = () => {
      if (popover) {
        if (tip.matches(":popover-open")) tip.hidePopover();
      } else tip.hidden = true;
    };
    const show = (/** @type {Event} */ event) => {
      const square = /** @type {HTMLElement | null} */ (/** @type {HTMLElement} */ (event.target).closest?.(".gallery-heatmap-day[data-date]"));
      if (!square || !grid.contains(square)) return hide();
      const [first, second] = (square.getAttribute("aria-label") ?? "").replace(/）$/, "").split("（");
      tip.replaceChildren(first, ...(second ? [made("small", "tip-split", second)] : []));
      if (popover) {
        if (!tip.matches(":popover-open")) tip.showPopover();
      } else tip.hidden = false;
      const box = square.getBoundingClientRect();
      const width = tip.offsetWidth;
      const height = tip.offsetHeight;
      const left = Math.max(8, Math.min(innerWidth - 8 - width, box.left + box.width / 2 - width / 2));
      const below = box.top - 8 - height < 8;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(below ? box.bottom + 8 : box.top - 8 - height)}px`;
    };
    context.listen(grid, "pointerover", show);
    context.listen(grid, "pointerleave", hide);
    // A scroll (the page's, or a card's) moves the square from under it: gone until the pointer is on one again.
    context.listen(document, "scroll", hide, { capture: true, passive: true });
    context.signal?.addEventListener("abort", hide, { once: true });
    let asking = 0; // the last read asked: an older answer that comes after it is dropped
    const read = () => {
      const ticket = ++asking;
      workspace.query("activity", { days: DAYS }).then(({ data, at: when }) => {
        if (ticket !== asking || context.signal.aborted) return;
        days = data;
        at = typeof when === "string" ? when : "";
        failure = "";
        draw();
      }, (/** @type {any} */ error) => {
        if (ticket !== asking || context.signal.aborted) return;
        days = null;
        failure = error?.code === "offline" ? words.offline : words.failed;
        draw();
      });
    };
    draw();
    read();
    // The room the squares have, its height too: a card given its height after the first draw (a board laid
    // out late) is drawn again as it gets it.
    if (typeof ResizeObserver === "function") {
      const watch = new ResizeObserver(() => draw());
      watch.observe(body);
      context.signal?.addEventListener("abort", () => watch.disconnect(), { once: true });
    }
    return {
      update(reason, detail) {
        if ((reason === "data" && detail === "activity") || (reason === "clock" && detail === "day")) read();
        else if (reason !== "data" && reason !== "clock") draw();
      },
    };
  },
});
