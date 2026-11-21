// gallery-soft/heatmap (编辑热力图, 柔光风格): Gallery 风格's gallery/heatmap in the soft look, the same record.
// The workspace's record of edits by day, a year of days as a grid: a column a week (Monday at
// the top, as a Chinese calendar starts it), a square a day, darker for a day of more, read through
// context.workspace.query("activity") (its manifest's needs hold "workspace": the server's record,
// .gallery/state/activity.json, a reader's commits and the Agent's writes, by day). Its one setting, `words`
// (按字数显示, the card's form: the grip at its top right › 设置…, kept in its data part `settings`, which the
// board writes and this block only reads), draws the words a day added (its net change, a day that took more
// away than it added drawn as none) instead of how many edits it had. It asks for every day 53 weeks draw (the
// record keeps as many), so that a day drawn apart is one before the record started; it reads again whenever
// the workspace says its record changed (the `data` signal, "activity") and as a day begins (the kit's clock),
// and draws again as its card changes size (`resize`, `layout`, and its own ResizeObserver on the squares'
// room) or its settings change (`source`). Where the workspace cannot be read (an exported file, where it has
// no server; a server that does not answer) it says so on the cards' empty face. The words are the page's
// language.
//
// The squares are the hero: each at least 20px (22px on a card wider than 6 cells), 5px apart, as many weeks
// as the room beside the weekdays' initials holds, the last today's, the weeks spread so that they reach the
// card's right edge (`fitOf`); a square a level of five, by where its day stands among the record's days of
// any edit (`levelsOf`: none, then the quarters a third, two thirds and nine tenths of them reach); a day
// before the record began a faint dot; today ringed in the accent; a month's name over the week its first day
// falls in. The pointer on a square says its day, its count and how much of it was the reader's and how much
// the Agent's. A card wider than 6 cells has a column of figures beside the squares (`figuresOf`): the edits
// (or words) of the weeks drawn, large; the days with any of the days recorded, and today's; the average a
// day and the day of the most; and how the edits were shared between you and the Agent, a bar of two. Less to
// more (少 … 多) is the head's quiet meta there; a card 6 cells wide says the count and the weeks there instead,
// less to more under the squares. Laid out by its card's size (`context.size`; data-w, data-h, data-pad).

const WORDS = {
  zh: {
    title: "编辑热力图",
    since: (/** @type {string} */ date) => `从 ${date} 开始记录`,
    span: (/** @type {number} */ weeks) => `近 ${weeks} 周`,
    after: (/** @type {string} */ date) => `${date}以来`,
    edited: "编辑",
    written: "写作",
    editsUnit: "次",
    wordsUnit: "字",
    days: "天",
    activeLabel: "有编辑的天",
    todayLabel: "今天",
    averageLabel: "日均",
    mostLabel: (/** @type {string} */ date) => `最多 · ${date}`,
    you: "你",
    agent: "Agent",
    none: "还没有编辑",
    noneHow: (/** @type {string} */ date) => `从 ${date} 开始记录。你保存的修改、Agent 写进来的内容，都记在当天的格子里。`,
    tip: (/** @type {number} */ edits) => `${edits} 次编辑`,
    tipWords: (/** @type {string} */ words) => `${words} 字`,
    tipWho: (/** @type {number} */ reader, /** @type {number} */ agent) => `你 ${reader} · Agent ${agent}`,
    before: "还没开始记录",
    said: (/** @type {string} */ day, /** @type {string} */ what) => `${day}：${what}`,
    date: (/** @type {Date} */ date) => `${date.getMonth() + 1}月${date.getDate()}日`,
    weekday: (/** @type {Date} */ date) => `${date.getMonth() + 1}月${date.getDate()}日 ${["周日", "周一", "周二", "周三", "周四", "周五", "周六"][date.getDay()]}`,
    month: (/** @type {number} */ month) => `${month + 1}月`,
    rows: ["一", "", "三", "", "五", "", "日"],
    less: "少",
    more: "多",
    offline: "在 Gallery 里打开时显示",
    offlineHow: "导出的文件读不到工作区的编辑记录",
    failed: "读不到工作区的编辑记录",
    locale: "zh-CN",
  },
  en: {
    title: "Editing heatmap",
    since: (/** @type {string} */ date) => `Recording since ${date}`,
    span: (/** @type {number} */ weeks) => `${weeks} weeks`,
    after: (/** @type {string} */ date) => `Since ${date}`,
    edited: ": edits",
    written: ": words",
    editsUnit: "edits",
    wordsUnit: "words",
    days: "days",
    activeLabel: "Days with edits",
    todayLabel: "Today",
    averageLabel: "A day",
    mostLabel: (/** @type {string} */ date) => `Most · ${date}`,
    you: "You",
    agent: "Agent",
    none: "No edits yet",
    noneHow: (/** @type {string} */ date) => `Recording since ${date}. What you save and what your Agent writes go in the square of their day.`,
    tip: (/** @type {number} */ edits) => `${edits} ${edits === 1 ? "edit" : "edits"}`,
    tipWords: (/** @type {string} */ words) => `${words} words`,
    tipWho: (/** @type {number} */ reader, /** @type {number} */ agent) => `You ${reader} · Agent ${agent}`,
    before: "not recorded yet",
    said: (/** @type {string} */ day, /** @type {string} */ what) => `${day}: ${what}`,
    date: (/** @type {Date} */ date) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()]} ${date.getDate()}`,
    weekday: (/** @type {Date} */ date) => `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()]}, ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()]} ${date.getDate()}`,
    month: (/** @type {number} */ month) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month],
    rows: ["Mon", "", "Wed", "", "Fri", "", "Sun"],
    less: "Less",
    more: "More",
    offline: "Shown when opened in Gallery",
    offlineHow: "An exported file can't read the workspace's record of edits",
    failed: "The workspace's record of edits could not be read",
    locale: "en",
  },
};

/** The language the page speaks: the UI's where Gallery says it (data-ge-language), else its lang's. */
function languageOf(/** @type {HTMLElement} */ root) {
  const ui = root.getAttribute("data-ge-language");
  return (ui !== null ? ui === "en" : /^en(?:-|$)/i.test(root.lang)) ? "en" : "zh";
}

/** @typedef {{ date: string, edits: number, words: number, reader: { edits: number, words: number }, agent: { edits: number, words: number } }} Day */

const MOST_WEEKS = 53;
/** The days of the record it reads: as many as 53 weeks draw at the most (on a Sunday, its first square 370 days back). */
const DAYS = MOST_WEEKS * 7;
const two = (/** @type {number} */ value) => String(value).padStart(2, "0");
/** A local day as the record writes it, YYYY-MM-DD. @param {Date} date */
const dayOf = (date) => `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
/** The day `count` days after `date` (before, negative), at noon. @param {Date} date @param {number} count */
const after = (date, count) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + count, 12);

/**
 * How the squares fit a room of `width` x `height` px (the weekdays' column and the months' row left out),
 * a card `wide` cells wide: { cell, gap, weeks, pitch }. A square is 22px (20px on a card 6 cells wide or
 * less), less where seven of them and the gaps would not fit the height, 8px at the least; the gap 5px, 3px
 * where that leaves a square under 12px (a card two cells high: the squares alone); as many weeks as fit
 * across, at most 53, at least 1; `pitch` the step from one week to the next, the room shared out so that
 * the last week reaches the room's right edge.
 * @param {number} width
 * @param {number} height
 * @param {number} wide
 */
function fitOf(width, height, wide) {
  const most = wide <= 6 ? 20 : 22;
  const gap = Math.floor((height - 6 * 5) / 7) < 12 ? 3 : 5;
  const cell = Math.max(8, Math.min(most, Math.floor((height - 6 * gap) / 7)));
  const weeks = Math.max(1, Math.min(MOST_WEEKS, Math.floor((width + gap) / (cell + gap))));
  return { cell, gap, weeks, pitch: weeks > 1 ? (width + gap) / weeks : cell + gap };
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
 * Where a square's levels change, of `values` (each day's count): the counts a third, two thirds and nine
 * tenths of the days of any reach, so that a level says where a day stands among the days of the record.
 * @param {number[]} values
 */
function levelsOf(values) {
  const some = values.filter((value) => value > 0).sort((a, b) => a - b);
  const at = (/** @type {number} */ share) => (some.length ? some[Math.min(some.length - 1, Math.floor(share * some.length))] : 0);
  return [at(0.34), at(0.66), at(0.9)];
}

/**
 * The level of a day's square, 0 (none) to 4 (the most), of `value` (its edits, or the words it added,
 * none for a day that took more away) against `levels` (levelsOf's).
 * @param {number} value
 * @param {number[]} levels
 */
function levelOf(value, levels) {
  if (!(value > 0)) return 0;
  return value <= levels[0] ? 1 : value <= levels[1] ? 2 : value <= levels[2] ? 3 : 4;
}

/**
 * What the figures beside the squares say of the record `days` (workspace.query("activity")'s data) over
 * the days drawn, from `first` (YYYY-MM-DD, the first square) to `today`, counting `words` (the setting) or
 * edits, in `language`: the label (近 14 周编辑, or 11月10日以来编辑 where the record began after the first
 * square), the total, how many days had any edit of how many were recorded, today's, the average a day and
 * the day of the most (null for none), and the share of the edits that were the reader's (0 to 100, null
 * for none); `since`, the day the record began (null for no record), and `empty`, nothing counted at all.
 * @param {Array<{ date: string, edits: number, words: number, reader?: { edits: number }, agent?: { edits: number } }>} days
 * @param {boolean} words
 * @param {string} first
 * @param {string} today
 * @param {number} weeks
 * @param {"zh" | "en"} language
 */
function figuresOf(days, words, first, today, weeks, language) {
  const said = WORDS[language];
  const since = days.map((day) => day.date).sort()[0] ?? null;
  const drawn = days.filter((day) => day.date >= first && day.date <= today);
  const value = (/** @type {{ edits: number, words: number }} */ day) => (words ? Math.max(0, day.words) : day.edits);
  const total = drawn.reduce((sum, day) => sum + value(day), 0);
  const edits = drawn.reduce((sum, day) => sum + day.edits, 0);
  const reader = drawn.reduce((sum, day) => sum + (day.reader?.edits ?? 0), 0);
  const agent = drawn.reduce((sum, day) => sum + (day.agent?.edits ?? 0), 0);
  let most = null;
  for (const day of drawn) if (value(day) > 0 && (!most || value(day) > value(most))) most = day;
  const sinceDate = since ? new Date(`${since}T12:00:00`) : null;
  const period = since && since > first && sinceDate ? said.after(said.date(sinceDate)) : said.span(weeks);
  return {
    label: `${period}${words ? said.written : said.edited}`,
    total,
    active: drawn.filter((day) => day.edits > 0).length,
    recorded: drawn.length,
    today: value(drawn.find((day) => day.date === today) ?? { edits: 0, words: 0 }),
    average: drawn.length ? Math.round(total / drawn.length) : 0,
    most: most ? { date: most.date, value: value(most) } : null,
    share: reader + agent > 0 ? Math.round((100 * reader) / (reader + agent)) : null,
    since,
    empty: edits === 0,
  };
}

/** A count as the card writes it, grouped (1,407), short past 99,999 (12.3万, 123.5K). @param {number} value @param {"zh" | "en"} language */
const countOf = (value, language) => new Intl.NumberFormat(WORDS[language].locale, Math.abs(value) >= 100_000 ? { notation: "compact", maximumFractionDigits: 1 } : { maximumFractionDigits: 0 }).format(value);

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
  node.className = `gallery-soft-heatmap-${kind}`;
  if (text !== undefined) node.textContent = text;
  return node;
}

// The card's picture (the chip's, the empty disc's): nine filled squares, on a 20 grid.
const HEAT = '<svg viewBox="0 0 20 20" fill="currentColor" stroke="none"><rect x="3.6" y="3.6" width="3.4" height="3.4" rx="1"/><rect x="8.3" y="3.6" width="3.4" height="3.4" rx="1"/><rect x="13" y="3.6" width="3.4" height="3.4" rx="1"/><rect x="3.6" y="8.3" width="3.4" height="3.4" rx="1"/><rect x="8.3" y="8.3" width="3.4" height="3.4" rx="1"/><rect x="13" y="8.3" width="3.4" height="3.4" rx="1"/><rect x="3.6" y="13" width="3.4" height="3.4" rx="1"/><rect x="8.3" y="13" width="3.4" height="3.4" rx="1"/><rect x="13" y="13" width="3.4" height="3.4" rx="1"/></svg>';

DocKit.component({
  id: "gallery-soft/heatmap",
  on: ["data", "source", "resize", "layout", "clock"],
  mount(host, context) {
    const language = languageOf(document.documentElement);
    const words = WORDS[language];
    const face = made("div", "face");
    const head = made("div", "head");
    const chip = made("span", "chip");
    chip.setAttribute("aria-hidden", "true");
    chip.innerHTML = HEAT;
    const meta = made("span", "meta");
    head.append(chip, made("span", "title", words.title), meta);
    const body = made("div", "body");
    const aside = made("div", "aside");
    const grid = made("div", "grid");
    const room = made("div", "room");
    room.append(grid);
    body.append(aside, room);
    const legend = made("div", "legend");
    legend.setAttribute("aria-hidden", "true");
    legend.append(made("span", "less", words.less), ...[0, 1, 2, 3, 4].map((level) => {
      const square = made("i", "key");
      square.dataset.level = String(level);
      return square;
    }), made("span", "more", words.more));
    const empty = made("div", "empty");
    // The tip stands over the card, in the page's top layer (a popover; where a browser has none, fixed to the
    // window), never inside the card, whose overflow a tip near its edge would widen into a scrollbar or cut.
    const tip = made("div", "tip");
    const popover = typeof tip.showPopover === "function";
    if (popover) tip.popover = "manual";
    else tip.hidden = true;
    tip.setAttribute("role", "tooltip");
    // As wide as the corner a board's grip takes of the content's top right (--soft-grip-room, which CSS alone
    // resolves), measured where the months' row is the face's first (the squares alone).
    const gripRoom = made("i", "grip-room");
    gripRoom.setAttribute("aria-hidden", "true");
    face.append(head, body, empty, gripRoom);
    host.append(face);
    const workspace = context.workspace;
    if (!workspace) return void context.fail(new Error("its manifest's needs hold \"workspace\": context.workspace is not there"));

    /** @type {Day[] | null} */
    let days = null;
    let failure = "";
    let drawn = "";
    /** @type {Map<HTMLElement, { date: Date, entry: Day | null, value: number, recorded: boolean }>} */
    const squares = new Map();
    const draw = () => {
      const settings = context.readJSON("settings");
      if (settings === undefined) return; // no JSON: the instance has failed, and Gallery shows what it holds
      const byWords = settings !== null && typeof settings === "object" && settings.words === true;
      const { w, h, pad } = sizeOf(context.size, [8, 4]);
      const narrow = w <= 6;
      // Two cells high (8 × 2): the squares alone, no head, figures or legend (the user's word of 2026-11-09).
      const alone = h <= 2;
      face.toggleAttribute("data-alone", alone);
      Object.assign(face.dataset, { w: String(w), h: String(h), pad });
      face.toggleAttribute("data-narrow", narrow);
      face.toggleAttribute("data-unread", Boolean(failure));
      if (failure) {
        meta.replaceChildren();
        const disc = made("span", "disc");
        disc.innerHTML = HEAT;
        empty.replaceChildren(disc, made("p", "line", failure === "offline" ? words.offline : words.failed), ...(failure === "offline" ? [made("p", "how", words.offlineHow)] : []));
        drawn = "";
        return;
      }
      empty.replaceChildren();
      const today = new Date();
      // The room the squares have: the room's, the months' row and the weekdays' column taken off.
      const width = room.clientWidth - 22;
      const height = room.clientHeight - 18;
      const { cell, gap, weeks, pitch } = fitOf(width, height, w);
      const columns = weeksOf(today, weeks);
      const figures = figuresOf(days ?? [], byWords, columns[0][0].day, dayOf(today), weeks, language);
      const sinceSaid = figures.since ? words.since(words.date(new Date(`${figures.since}T12:00:00`))) : "";
      // The head's quiet meta: less to more beside the figures, the count and the weeks on a narrow card, since when while nothing is counted.
      if (days !== null && figures.empty) meta.replaceChildren(sinceSaid);
      else if (narrow) meta.replaceChildren(made("b", "count", countOf(figures.total, language)), ` ${byWords ? words.wordsUnit : words.editsUnit}`, made("span", "dot"), words.span(weeks));
      else meta.replaceChildren(legend);
      if (narrow) {
        if (legend.parentElement !== room) room.append(legend);
      } else if (legend.parentElement === room) legend.remove();
      // The figures beside the squares, on a card wide enough.
      aside.replaceChildren();
      if (!narrow && days !== null) {
        if (figures.empty) aside.append(made("span", "label", words.none), made("p", "note", figures.since ? words.noneHow(words.date(new Date(`${figures.since}T12:00:00`))) : ""));
        else {
          const unit = byWords ? words.wordsUnit : words.editsUnit;
          const total = made("p", "total", countOf(figures.total, language));
          total.append(made("span", "unit", unit));
          const figure = (/** @type {string} */ value, /** @type {string} */ small) => {
            const node = made("span", "value", value);
            node.append(made("small", "small", small));
            return node;
          };
          const table = made("div", "figures");
          table.append(made("span", "label", words.activeLabel), made("span", "label", words.todayLabel), figure(String(figures.active), `/ ${figures.recorded} ${words.days}`), figure(countOf(figures.today, language), unit));
          if (figures.recorded > 6 && figures.most) {
            const most = new Date(`${figures.most.date}T12:00:00`);
            table.append(made("span", "label", words.averageLabel), made("span", "label", words.mostLabel(words.date(most))), figure(countOf(figures.average, language), unit), figure(countOf(figures.most.value, language), unit));
          }
          aside.append(made("span", "label", figures.label), total, table);
          if (figures.share !== null) {
            const split = made("div", "split");
            const bar = made("div", "bar");
            const you = made("i", "you");
            you.style.width = `${figures.share}%`;
            bar.append(you, made("i", "agent"));
            const key = made("div", "key-line");
            const side = (/** @type {string} */ kind, /** @type {string} */ name, /** @type {number} */ share) => {
              const node = made("span", kind);
              node.append(made("i", "swatch"), `${name} `, made("b", "share", `${share}%`));
              return node;
            };
            key.append(side("you-key", words.you, figures.share), side("agent-key", words.agent, 100 - figures.share));
            split.append(bar, key);
            aside.append(split);
          }
        }
      }
      const key = JSON.stringify([cell, gap, weeks, pitch, width, dayOf(today), byWords, days, language]);
      if (key === drawn) return;
      drawn = key;
      const values = (days ?? []).map((day) => (byWords ? Math.max(0, day.words) : day.edits));
      const levels = levelsOf(values);
      const byDate = new Map((days ?? []).map((item) => [item.date, item]));
      squares.clear();
      hide(); // the squares drawn anew: the one it stood over is gone
      /** @type {HTMLElement[]} */
      const nodes = [];
      const top = (/** @type {number} */ row) => 18 + row * (cell + gap);
      columns.forEach((column, index) => {
        for (const [row, { date, day, future }] of column.entries()) {
          if (future) continue;
          const square = made("i", "day");
          square.style.left = `${(22 + index * pitch).toFixed(1)}px`;
          square.style.top = `${top(row)}px`;
          square.style.width = square.style.height = `${cell}px`;
          const recorded = days !== null && figures.since !== null && day >= figures.since;
          const entry = byDate.get(day) ?? null;
          const value = entry ? (byWords ? Math.max(0, entry.words) : entry.edits) : 0;
          if (!recorded) square.classList.add("gallery-soft-heatmap-before");
          else square.dataset.level = String(levelOf(value, levels));
          if (day === dayOf(today)) square.classList.add("gallery-soft-heatmap-today");
          square.setAttribute("aria-label", words.said(words.weekday(date), recorded ? (byWords ? words.tipWords(countOf(value, language)) : words.tip(value)) : words.before));
          squares.set(square, { date, entry, value, recorded });
          nodes.push(square);
        }
      });
      // A month's name over the week its first day falls in (the first week's too where most of it is that
      // month), none closer to the one before than 34px.
      let lastMonth = -1;
      let lastX = -99;
      columns.forEach((column, index) => {
        for (const { date } of column) {
          if (date.getDate() === 1 || (index === 0 && after(date, 21).getMonth() === date.getMonth())) {
            const x = 22 + index * pitch;
            if (date.getMonth() !== lastMonth && x - lastX >= 34) {
              const label = made("span", "month", words.month(date.getMonth()));
              label.style.left = `${x.toFixed(1)}px`;
              nodes.push(label);
              lastX = x;
            }
            lastMonth = date.getMonth();
            break;
          }
        }
      });
      words.rows.forEach((name, row) => {
        if (!name) return;
        const label = made("span", "row", name);
        label.style.top = `${top(row) + (cell - 14) / 2}px`;
        nodes.push(label);
      });
      grid.replaceChildren(...nodes, tip);
      // The squares alone: the months' row is the card's first, and a name that would reach into the grip's corner is left out.
      if (alone) {
        const end = room.getBoundingClientRect().right - gripRoom.offsetWidth;
        for (const label of grid.querySelectorAll(".gallery-soft-heatmap-month")) if (label.getBoundingClientRect().right > end) label.remove();
      }
    };
    // The pointer on a square: its day, its count, and the reader's and the Agent's shares of it, over it (under
    // it where the window has no room above), its middle at the square's but held 8px inside the window.
    const show = (/** @type {Event} */ event) => {
      const square = /** @type {HTMLElement} */ (event.target);
      const said = squares.get(square);
      if (!said || !said.recorded) return hide();
      const settings = context.readJSON("settings");
      const byWords = settings !== null && typeof settings === "object" && settings?.words === true;
      const first = made("b", "tip-count", byWords ? words.tipWords(countOf(said.value, language)) : words.tip(said.value));
      tip.replaceChildren(first, made("span", "tip-day", ` · ${words.weekday(said.date)}`), document.createElement("br"), made("span", "tip-who", words.tipWho(said.entry?.reader?.edits ?? 0, said.entry?.agent?.edits ?? 0)));
      if (popover) {
        if (!tip.matches(":popover-open")) tip.showPopover();
      } else tip.hidden = false;
      const box = square.getBoundingClientRect();
      const width = tip.offsetWidth;
      const height = tip.offsetHeight;
      const left = Math.max(8, Math.min(innerWidth - 8 - width, box.left + box.width / 2 - width / 2));
      const top = box.top - 8 - height < 8 ? box.bottom + 8 : box.top - 8 - height;
      tip.style.left = `${Math.round(left)}px`;
      tip.style.top = `${Math.round(top)}px`;
      for (const other of grid.querySelectorAll(".gallery-soft-heatmap-pointed")) other.classList.remove("gallery-soft-heatmap-pointed");
      square.classList.add("gallery-soft-heatmap-pointed");
    };
    function hide() {
      if (popover) {
        if (tip.matches(":popover-open")) tip.hidePopover();
      } else tip.hidden = true;
      for (const other of grid.querySelectorAll(".gallery-soft-heatmap-pointed")) other.classList.remove("gallery-soft-heatmap-pointed");
    }
    context.listen(grid, "pointerover", show);
    context.listen(grid, "pointerleave", hide);
    // A scroll (the page's, or a card's) moves the square from under it: gone until the pointer is on one again.
    context.listen(document, "scroll", hide, { capture: true, passive: true });
    context.signal?.addEventListener("abort", hide, { once: true });
    let asking = 0; // the last read asked: an older answer that comes after it is dropped
    const read = () => {
      const ticket = ++asking;
      workspace.query("activity", { days: DAYS }).then(({ data }) => {
        if (ticket !== asking || context.signal.aborted) return;
        days = data;
        failure = "";
        draw();
      }, (/** @type {any} */ error) => {
        if (ticket !== asking || context.signal.aborted) return;
        days = null;
        failure = error?.code === "offline" ? "offline" : "failed";
        draw();
      });
    };
    draw();
    read();
    // The room the squares have, its height too (the kit's `resize` hears its width alone): a card given its
    // height after the first draw (a board laid out late) is drawn again as it gets it.
    if (typeof ResizeObserver === "function") {
      const watch = new ResizeObserver(() => draw());
      watch.observe(room);
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
