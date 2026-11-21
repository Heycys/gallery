// gallery/countdown (倒计时): the days between today, by the reader's clock, and the date its settings
// name: how many are left before it, 就是今天 on the day itself, how many have gone since after it. Its two
// settings, `title` (the name of the day) and `date` (YYYY-MM-DD), are the card's form (on a custom page
// the grip at the card's top right › 设置…), kept in the data part `settings`, a script of JSON, which the
// board writes and this block only reads: it writes nothing. Drawn from that part on every `source` (the
// form, an Agent's write, an undo) and again as a day begins (the kit's `clock`, "day"), so that the count
// moves at midnight. The words are the page's language (the UI's where Gallery says it, else the page's
// lang). Its face (in the kit's card tokens): a head of the chip, an hourglass, and
// the day's name alone (春节, or 倒计时 where it has none), on one line; at the bottom the count's label
// (还有, 已经过去) over the count, the hero, and its unit, and the date under them, faint (2027年2月6日 周六);
// on the day, 就是今天 in the accent where the count stands. A card four cells wide (`data-layout` "wide",
// by context.size, read again on `layout`) sets the month of the date beside it, a small calendar, Monday
// first, the day itself the one solid square of the accent (`monthOf`). A date it cannot read, or none,
// is the cards' empty face under the head: 选一个日子, and where to set one. Its face says by `data-kind`
// which of left, today, since or none it shows.

const WORDS = {
  zh: {
    left: "还有",
    since: "已经过去",
    today: "就是今天",
    days: (/** @type {number} */ count) => `${count}`,
    unit: () => "天",
    countdown: "倒计时",
    pick: "选一个日子",
    where: "在卡片右上角的 设置… 里填日期",
    whereShort: "在 设置… 里填日期",
    weekdays: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
    initials: ["一", "二", "三", "四", "五", "六", "日"],
    date: (/** @type {number} */ year, /** @type {number} */ month, /** @type {number} */ day, /** @type {string} */ weekday) => [`${year}年${month}月${day}日`, weekday],
  },
  en: {
    left: "Days left",
    since: "Days since",
    today: "Today",
    days: (/** @type {number} */ count) => `${count}`,
    unit: (/** @type {number} */ count) => (count === 1 ? "day" : "days"),
    countdown: "Countdown",
    pick: "Pick a day",
    where: "Set its date in Settings… at the card's top right",
    whereShort: "Set its date in Settings…",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    initials: ["M", "T", "W", "T", "F", "S", "S"],
    date: (/** @type {number} */ year, /** @type {number} */ month, /** @type {number} */ day, /** @type {string} */ weekday) => [`${weekday},`, `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} ${day}, ${year}`],
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
 * at `now`: its head (the day's name, or 倒计时), the count's label (还有, 已经过去; "" with no count), its
 * count (null on the day and with no date; `big`, the words standing there instead: 就是今天), the count's
 * unit, its foot, a list of words a line breaks between and never inside (the date, its weekday), and,
 * with no date it can read, `empty`: what the empty face says (选一个日子, where to set one on a wide card
 * and on a narrow one).
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
  if (!date || count.kind === "none") return { head, label: "", count: null, unit: "", big: "", foot: [], empty: { title: words.pick, where: words.where, whereShort: words.whereShort } };
  const weekday = words.weekdays[new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay()];
  const foot = words.date(date.year, date.month, date.day, weekday);
  if (count.kind === "today") return { head, label: "", count: null, unit: "", big: words.today, foot, empty: null };
  return { head, label: count.kind === "left" ? words.left : words.since, count: words.days(count.days), unit: words.unit(count.days), big: "", foot, empty: null };
}

/**
 * The month of `date` ({ year, month, day }) as the small calendar draws it, Monday first: its weeks, each
 * seven days of the month (a number) or none before its first and after its last (null).
 * @param {{ year: number, month: number }} date
 */
function monthOf(date) {
  const first = (new Date(Date.UTC(date.year, date.month - 1, 1)).getUTCDay() + 6) % 7;
  const length = new Date(Date.UTC(date.year, date.month, 0)).getUTCDate();
  const cells = [...Array(first).fill(null), ...Array.from({ length }, (_, index) => index + 1)];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, week) => cells.slice(week * 7, week * 7 + 7));
}

/**
 * An element of the face, of `kind` (its class).
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} kind
 */
function made(tag, kind) {
  const node = document.createElement(tag);
  node.className = `gallery-countdown-${kind}`;
  return node;
}

DocKit.component({
  id: "gallery/countdown",
  on: ["source", "clock", "layout"],
  mount(host, context) {
    const language = languageOf(document.documentElement);
    const words = WORDS[language];
    const face = made("div", "face");
    const main = made("div", "main");
    const head = made("p", "head");
    const chip = made("span", "chip");
    chip.setAttribute("aria-hidden", "true");
    chip.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6.5 3.5h11M6.5 20.5h11M7.5 3.5v2.2c0 2 1.3 3.6 3.2 4.4l1.3.6 1.3-.6c1.9-.8 3.2-2.4 3.2-4.4V3.5M7.5 20.5v-2.2c0-2 1.3-3.6 3.2-4.4l1.3-.6 1.3.6c1.9.8 3.2 2.4 3.2 4.4v2.2"/></svg>';
    const named = made("span", "name");
    named.setAttribute("data-doc-tip-cut", ""); // the countdown's whole name, where it is cut
    head.append(chip, named);
    const core = made("div", "core");
    const label = made("p", "label");
    const middle = made("p", "count");
    const foot = made("p", "foot");
    core.append(label, middle, foot);
    // No date: the cards' empty face, what to do and where.
    const empty = made("div", "empty");
    const emptyTitle = made("p", "empty-title");
    const emptyWhere = made("p", "empty-where");
    empty.append(emptyTitle, emptyWhere);
    main.append(head, core, empty);
    // A wide card's month, beside the count: the calendar of the date, the day itself marked.
    const month = made("div", "month");
    month.setAttribute("aria-hidden", "true");
    face.append(main, month);
    host.append(face);
    const draw = (/** @type {string} */ reason = "", /** @type {unknown} */ detail = null) => {
      if (reason === "clock" && detail !== "day") return; // a minute moves no count
      const settings = context.readJSON("settings");
      if (settings === undefined) return; // no JSON: the instance has failed, and Gallery shows what it holds
      if (settings === null || typeof settings !== "object" || Array.isArray(settings)) return context.fail(new Error("its settings are no object: { \"title\": \"…\", \"date\": \"YYYY-MM-DD\" }"));
      const at = new Date();
      const now = faceOf(settings, at, language);
      const layout = context.size && context.size.w >= 4 ? "wide" : "narrow";
      face.dataset.layout = layout;
      face.dataset.kind = countdownOf(settings.date, at).kind;
      named.textContent = now.head;
      label.textContent = now.label;
      if (now.count === null) {
        middle.classList.add("gallery-countdown-words");
        middle.textContent = now.big;
      } else {
        middle.classList.remove("gallery-countdown-words");
        const number = made("span", "number");
        number.textContent = now.count;
        const unit = made("span", "unit");
        unit.textContent = now.unit;
        middle.replaceChildren(number, unit);
      }
      foot.replaceChildren(...now.foot.flatMap((piece, index) => {
        const node = made("span", "piece");
        node.textContent = piece;
        return index === 0 ? [node] : [" ", node];
      }));
      emptyTitle.textContent = now.empty?.title ?? "";
      emptyWhere.textContent = now.empty ? (layout === "wide" ? now.empty.where : now.empty.whereShort) : "";
      const date = dateOf(settings.date);
      if (!date) return void month.replaceChildren();
      const head = words.initials.map((initial, index) => {
        const cell = made("span", "initial");
        cell.classList.toggle("gallery-countdown-weekend", index >= 5);
        cell.textContent = initial;
        return cell;
      });
      const weeks = monthOf(date);
      month.dataset.weeks = String(weeks.length);
      month.replaceChildren(...head, ...weeks.flatMap((week) => week.map((day, index) => {
        const cell = made("span", "day");
        if (day === null) return cell;
        cell.textContent = String(day);
        cell.classList.toggle("gallery-countdown-weekend", index >= 5);
        cell.classList.toggle("gallery-countdown-on", day === date.day);
        return cell;
      })));
    };
    draw();
    return { update: draw };
  },
});
