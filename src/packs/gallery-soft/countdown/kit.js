// gallery-soft/countdown (倒计时, 柔光风格): Gallery 风格's gallery/countdown in the soft look, the same logic.
// The days between today, by the reader's clock, and the date its settings name: how many are left before
// it, 就是今天 on the day itself, how many have gone since after it. Its two settings, `title` (the name of the
// day) and `date` (YYYY-MM-DD), are the card's form (on a custom page the grip at the card's top right ›
// 设置…), kept in the data part `settings`, a script of JSON, which the board writes and this block only
// reads: it writes nothing. Drawn from that part on every `source` (the form, an Agent's write, an undo)
// and again as a day begins (the kit's `clock`, "day"), so that the count moves at midnight. A date it
// cannot read, or none, shows the cards' empty face, a calendar in a soft disc over 还没有设日期 and where
// to set one; the words are the page's language (the UI's where Gallery says it, else the page's lang).
//
// Its face, laid out by its card's size (`context.size`, read again on `layout`; data-w, data-h, data-pad):
// a head of an hourglass's chip and the day's name (春节, or 倒计时 where it has none); the count the hero,
// large, 还有 (or 已过) before it and 天 after it, muted; on the day 就是今天 in the accent; under it the date
// (2月6日 周六 on a 2 × 2 card, 2027年2月6日 星期六 on a wider one, which sets a small page of a calendar
// beside the count, the month on a band of the accent over the day). The face says by `data-kind` which of
// left, today, since or none it shows.

const WORDS = {
  zh: {
    left: "还有",
    since: "已过",
    today: "就是今天",
    unit: () => "天",
    countdown: "倒计时",
    pick: "还没有设日期",
    where: "右上角手柄 › 设置…",
    whereShort: "手柄 › 设置…",
    weekdays: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],
    short: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
    date: (/** @type {number} */ year, /** @type {number} */ month, /** @type {number} */ day, /** @type {string} */ weekday) => [`${year}年${month}月${day}日`, weekday],
    dateShort: (/** @type {number} */ month, /** @type {number} */ day, /** @type {string} */ weekday) => [`${month}月${day}日`, weekday],
    month: (/** @type {number} */ month) => `${month}月`,
  },
  en: {
    left: "In",
    since: "",
    today: "Today",
    unit: (/** @type {number} */ count, /** @type {boolean} */ since = false) => `${count === 1 ? "day" : "days"}${since ? " ago" : ""}`,
    countdown: "Countdown",
    pick: "No date yet",
    where: "The grip at the top right › Settings…",
    whereShort: "Grip › Settings…",
    weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    short: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    date: (/** @type {number} */ year, /** @type {number} */ month, /** @type {number} */ day, /** @type {string} */ weekday) => [`${weekday},`, `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][month - 1]} ${day}, ${year}`],
    dateShort: (/** @type {number} */ month, /** @type {number} */ day, /** @type {string} */ weekday) => [`${weekday},`, `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} ${day}`],
    month: (/** @type {number} */ month) => ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1],
  },
};

/** The language the page speaks: the UI's where Gallery says it (data-ge-language), else its lang's. */
function languageOf(/** @type {HTMLElement} */ root) {
  const ui = root.getAttribute("data-ge-language");
  return (ui !== null ? ui === "en" : /^en(?:-|$)/i.test(root.lang)) ? "en" : "zh";
}

/**
 * A date written YYYY-MM-DD as { year, month, day }, or null for anything else (no such day too:
 * 2027-02-30).
 * @param {unknown} written
 */
function dateOf(written) {
  const found = typeof written === "string" ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(written) : null;
  if (!found) return null;
  const [year, month, day] = found.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? { year, month, day } : null;
}

/**
 * Where `now` (the reader's clock) stands to the date `written` (YYYY-MM-DD): { kind: "left", days }
 * before it, { kind: "today", days: 0 } on it, { kind: "since", days } after it, by whole days of the
 * calendar (counted in UTC from each day's date, so that a change of the clocks in between changes
 * nothing); { kind: "none" } for a date it cannot read.
 * @param {unknown} written
 * @param {Date} now
 * @returns {{ kind: "left" | "since" | "today", days: number } | { kind: "none" }}
 */
function countdownOf(written, now) {
  const date = dateOf(written);
  if (!date) return { kind: "none" };
  const days = Math.round((Date.UTC(date.year, date.month - 1, date.day) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86_400_000);
  if (days === 0) return { kind: "today", days: 0 };
  return days > 0 ? { kind: "left", days } : { kind: "since", days: -days };
}

/**
 * What the card says, in `language`, of its `settings` (context.readJSON's, {} where none is set yet)
 * at `now`: its head (the day's name, or 倒计时), the words before the count (还有, 已过) and its unit after it
 * ("" with no count), its count (null on the day and with no date), the words standing there instead
 * (`big`: 就是今天, or with no date 还没有设日期), the date (a list of words a line breaks between and never
 * inside: the date and its weekday) long and short, or with no date where to set one (`where`, `whereShort`),
 * and the calendar's page (its month and day; null with no date).
 * @param {any} settings
 * @param {Date} now
 * @param {"zh" | "en"} language
 */
function faceOf(settings, now, language) {
  const words = WORDS[language];
  const date = dateOf(settings?.date);
  const named = typeof settings?.title === "string" ? settings.title.trim() : "";
  const count = countdownOf(settings?.date, now);
  const head = named || words.countdown;
  if (!date || count.kind === "none") return { head, label: "", count: null, unit: "", big: words.pick, foot: [words.where], footShort: [words.whereShort], page: null };
  const weekday = new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay();
  const foot = words.date(date.year, date.month, date.day, words.weekdays[weekday]);
  const footShort = words.dateShort(date.month, date.day, words.short[weekday]);
  const page = { month: words.month(date.month), day: String(date.day) };
  if (count.kind === "today") return { head, label: "", count: null, unit: "", big: words.today, foot, footShort, page };
  return { head, label: count.kind === "left" ? words.left : words.since, count: String(count.days), unit: words.unit(count.days, count.kind === "since"), big: "", foot, footShort, page };
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
  node.className = `gallery-soft-countdown-${kind}`;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Words as pieces a line breaks between and never inside. @param {string[]} pieces */
const piecesOf = (pieces) => pieces.flatMap((words, index) => {
  const piece = made("span", "piece", words);
  return index === 0 ? [piece] : [" ", piece];
});

DocKit.component({
  id: "gallery-soft/countdown",
  on: ["source", "clock", "layout"],
  mount(host, context) {
    const language = languageOf(document.documentElement);
    const face = made("div", "face");
    host.append(face);
    const draw = (/** @type {string} */ reason = "", /** @type {unknown} */ detail = null) => {
      if (reason === "clock" && detail !== "day") return; // a minute moves no count
      const settings = context.readJSON("settings");
      if (settings === undefined) return; // no JSON: the instance has failed, and Gallery shows what it holds
      if (settings === null || typeof settings !== "object" || Array.isArray(settings)) return context.fail(new Error("its settings are no object: { \"title\": \"…\", \"date\": \"YYYY-MM-DD\" }"));
      const { w, h, pad } = sizeOf(context.size, [2, 2]);
      const small = w <= 2;
      const at = new Date();
      const now = faceOf(settings, at, language);
      const kind = countdownOf(settings.date, at).kind;
      Object.assign(face.dataset, { kind, w: String(w), h: String(h), pad });
      const head = made("div", "head");
      const chip = made("span", "chip");
      chip.setAttribute("aria-hidden", "true");
      chip.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h10M7 20.5h10"/><path d="M8 3.5v2.4c0 1.4.7 2.6 1.8 3.4L12 11l2.2-1.7A4.2 4.2 0 0 0 16 5.9V3.5"/><path d="M8 20.5v-2.4c0-1.4.7-2.6 1.8-3.4L12 13l2.2 1.7a4.2 4.2 0 0 1 1.8 3.4v2.4"/></svg>';
      const named = made("span", "name", now.head);
      named.setAttribute("data-doc-tip-cut", ""); // the countdown's whole name, where it is cut
      head.append(chip, named);
      if (kind === "none") {
        // The cards' empty face: a calendar in a soft disc, what is missing, where to set it.
        const empty = made("div", "empty");
        const disc = made("span", "disc");
        disc.setAttribute("aria-hidden", "true");
        disc.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="5.5" width="16" height="14.5" rx="2.4"/><path d="M8 3.5v4M16 3.5v4M4 10.5h16"/></svg>';
        empty.append(disc, made("p", "line", now.big), made("p", "how", (small ? now.footShort : now.foot).join(" ")));
        face.replaceChildren(head, empty);
        return;
      }
      // The count: 还有 before it, 天 after it; on the day, its words.
      const figure = made("p", "count");
      if (now.count === null) {
        figure.classList.add("gallery-soft-countdown-words");
        figure.textContent = now.big;
      } else {
        figure.append(...(now.label ? [made("span", "label", now.label)] : []), made("span", "number", now.count), made("span", "unit", now.unit));
      }
      const date = made("p", "date");
      date.append(...piecesOf(small ? now.footShort : now.foot));
      const body = made("div", "body");
      const grow = made("div", "grow");
      grow.append(figure, date);
      body.append(grow);
      if (!small && now.page) {
        const page = made("div", "page");
        page.setAttribute("aria-hidden", "true");
        page.append(made("span", "month", now.page.month), made("span", "day", now.page.day));
        body.append(page);
      }
      face.replaceChildren(head, body);
    };
    draw();
    return { update: draw };
  },
});
