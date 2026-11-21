// gallery/habit (习惯打卡): one habit, checked in once a day. Its data part, a script of JSON, holds the
// habit's name and the days it was done, each YYYY-MM-DD by the reader's clock, in order:
// { "name": "喝八杯水", "days": ["2026-11-05", "2026-11-06"] }. The card draws the name in a field of its
// own (DocKit.input: written as the reader presses Enter or leaves it, never while an input method
// composes), the streak (the days in a row up to today, or up to yesterday while today is not checked
// yet, so that a streak lasts the day it is to be kept), how many days in all, and a button that checks
// today in, or takes today's check-in back when it is there. Each press and each name is one
// context.editJSON, one undo step, the JSON written back on one line as it was: what the reader does is
// in the file, and nothing else is (the streak and the days are worked out as it draws). It draws from
// the part on every `source` (an undo, an Agent's write) and again as a day begins (the kit's `clock`,
// "day"), so that "today" moves at midnight. Where nothing takes its writes (an export, a page that has
// not come to edit yet: context.canEdit() false) the name is read-only and the button a plain line saying
// whether today is done. Its words are the page's language (the UI's where Gallery says it, else the
// page's lang).
//
// Its face (in the kit's card tokens), laid out by the card's cells (`data-layout`,
// by context.size, read again on `layout`): "wide" (4 × 2, the default) a head of the chip, a flame in
// its warm color, the name (the field) and the days in all after it (共 41 天), the streak, the hero, and
// 天连续 after it, the button at its right (a pale blue 打卡, a pale green ✓ 已打卡 a press takes back),
// and this week at the bottom, Monday to Sunday, seven circles (`weekOf`): a day done filled with the
// accent and ticked, one not done a soft gray with its initial, today ringed in the accent (今), filled
// and ringed twice once done, the days to come an outline; "narrow" (2 wide) the name alone at the top,
// a flame and the streak, and the button as wide as the card at the bottom (the name shown as words of
// up to two lines, the field over them unseen until a press or Tab brings it, so that a long name is
// never cut to a few characters); "tall" (4 high) the head, the streak and the button, and the last five
// weeks as a month (`monthOf`), Monday first, the days of the streak the accent's, the days done before
// it its pale tint, the others bare, today ringed, the days to come an outline, with 最近五周 and how
// many of them were done (打了 27 天) over it. A habit never
// checked in (no days at all) says 还没打过卡 where the streak stands (the face's data-fresh), the chip
// gray and no count of days, until the first check-in. Start a block of your own from it with gallery
// block new <id> --recipe habit.

const WORDS = {
  zh: {
    name: "给习惯起个名字",
    check: "打卡",
    checked: "已打卡",
    undo: "再按一下，撤回今天的打卡",
    todayDone: "今天已打卡",
    todayOpen: "今天还没打卡",
    streak: "天连续",
    unit: () => "天",
    total: (/** @type {number} */ days) => `共 ${days} 天`,
    fresh: ["还没打过卡", "今天开始第 1 天"],
    weeks: "最近五周",
    got: (/** @type {number} */ days) => ["打了 ", String(days), " 天"],
    week: "这一周",
    initials: ["日", "一", "二", "三", "四", "五", "六"],
    today: "今",
    day: (/** @type {number} */ month, /** @type {number} */ day, /** @type {boolean} */ done) => `${month}月${day}日${done ? "，已打卡" : "，没打卡"}`,
  },
  en: {
    name: "Name this habit",
    check: "Check in",
    checked: "Done",
    undo: "Press again to take today's check-in back",
    todayDone: "Done today",
    todayOpen: "Not done today",
    streak: "in a row",
    unit: (/** @type {number} */ days) => (days === 1 ? "day" : "days"),
    total: (/** @type {number} */ days) => `${days} ${days === 1 ? "day" : "days"} in all`,
    fresh: ["No check-ins yet", "today can be day 1"],
    weeks: "Last five weeks",
    got: (/** @type {number} */ days) => ["", String(days), ` ${days === 1 ? "day" : "days"} done`],
    week: "This week",
    initials: ["S", "M", "T", "W", "T", "F", "S"],
    today: "", // a week's circle is too small for "Today": its initial, ringed as today
    day: (/** @type {number} */ month, /** @type {number} */ day, /** @type {boolean} */ done) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} ${day}${done ? ", done" : ", not done"}`,
  },
};

/** The language the page speaks: the UI's where Gallery says it (data-ge-language), else its lang's. */
function languageOf(/** @type {HTMLElement} */ root) {
  const ui = root.getAttribute("data-ge-language");
  return (ui !== null ? ui === "en" : /^en(?:-|$)/i.test(root.lang)) ? "en" : "zh";
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * A day of the reader's clock as the data writes it, YYYY-MM-DD.
 * @param {Date} date
 */
function dayOf(date) {
  const two = (/** @type {number} */ value) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/**
 * The day `count` days after `day` (before it for a count below 0), both YYYY-MM-DD, by the calendar
 * (counted in UTC, so that a change of the clocks changes nothing).
 * @param {string} day
 * @param {number} count
 */
function dayAfter(day, count) {
  const [year, month, date] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + count));
  const two = (/** @type {number} */ value) => String(value).padStart(2, "0");
  return `${moved.getUTCFullYear()}-${two(moved.getUTCMonth() + 1)}-${two(moved.getUTCDate())}`;
}

/** The weekday of a day written YYYY-MM-DD, 0 for Sunday. @param {string} day */
function weekdayOf(day) {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date)).getUTCDay();
}

/**
 * The habit `data` is (context.readJSON's, or the draft context.editJSON hands a change): its name ("" for
 * none yet) and its days, as they stand; throws saying why it is none, and the block draws nothing over it.
 * @param {any} data
 * @returns {{ name: string, days: string[] }}
 */
function readHabit(data) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new Error("its data is no object: a habit holds { \"name\": \"…\", \"days\": [\"YYYY-MM-DD\", …] }");
  const name = data.name ?? "";
  if (typeof name !== "string") throw new Error("its name is no string");
  const days = data.days ?? [];
  if (!Array.isArray(days) || !days.every((day) => typeof day === "string" && DAY.test(day))) throw new Error("its days are no list of dates written YYYY-MM-DD");
  return { name, days };
}

/**
 * The days in a row that end today, or yesterday while today is not checked yet (a streak lasts the day
 * it is to be kept); 0 when neither was done.
 * @param {string[]} days
 * @param {string} today
 */
function streakOf(days, today) {
  const done = new Set(days);
  let day = done.has(today) ? today : dayAfter(today, -1);
  let count = 0;
  while (done.has(day)) {
    count += 1;
    day = dayAfter(day, -1);
  }
  return count;
}

/**
 * `days` with `today` checked in, or taken back where it was: in order, each once.
 * @param {string[]} days
 * @param {string} today
 */
function toggled(days, today) {
  const done = new Set(days);
  if (done.has(today)) done.delete(today);
  else done.add(today);
  return [...done].sort();
}

/**
 * The days of the `weeks` weeks that end with the one `today` is in, Monday first, oldest first: each its
 * day (YYYY-MM-DD), its weekday (0 for Sunday), whether it was done, whether it is today, one to come
 * (after today) and one of the streak (`streak`: the days of streakOf, back from today or yesterday).
 * @param {string[]} days
 * @param {string} today
 * @param {number} [weeks]
 */
function monthOf(days, today, weeks = 5) {
  const done = new Set(days);
  const streak = streakOf(days, today);
  const last = done.has(today) ? today : dayAfter(today, -1);
  const first = dayAfter(today, -((weekdayOf(today) + 6) % 7) - 7 * (weeks - 1));
  return Array.from({ length: weeks * 7 }, (_, index) => {
    const day = dayAfter(first, index);
    return { day, weekday: weekdayOf(day), done: done.has(day), today: day === today, future: day > today, streak: day <= last && day > dayAfter(last, -streak) };
  });
}

/**
 * The week `today` is in, Monday to Sunday, as monthOf draws a day.
 * @param {string[]} days
 * @param {string} today
 */
const weekOf = (days, today) => monthOf(days, today, 1);

/**
 * Today checked in, or taken back: one write (context.editJSON), what a press of the button calls, and
 * the example too. Whether it was taken.
 * @param {DocComponentContext} context
 * @param {string} today
 */
function pressToday(context, today) {
  return context.editJSON("habit", (data) => {
    data.days = toggled(readHabit(data).days, today);
  });
}

/**
 * The habit named `name`, one write (context.editJSON): what the name's field calls once the reader is
 * done with it. Whether it was taken.
 * @param {DocComponentContext} context
 * @param {string} name
 */
function rename(context, name) {
  return context.editJSON("habit", (data) => {
    readHabit(data);
    data.name = name.trim();
  });
}

/**
 * An element of the face, of `kind` (its class).
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} kind
 */
function made(tag, kind) {
  const node = document.createElement(tag);
  node.className = `gallery-habit-${kind}`;
  return node;
}

const FLAME = '<path d="M12 20.8a6 6 0 0 0 6-6c0-3.6-2.4-5.6-3.6-8.6-.3-.8-1.3-1-1.8-.3-1.4 2-2 3.6-2 5-.9-.6-1.4-1.5-1.6-2.4-.1-.6-.9-.8-1.2-.2C6.9 9.6 6 11.4 6 14.8a6 6 0 0 0 6 6z"/>';
// The head's picture: a ringed check, on a 16 grid, its line the 1.9 of the others' 24 in proportion (the flame stays the streak's).
const CHIP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.27" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="5.5"/><path d="m5.6 8.2 1.7 1.7 3.2-3.4"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 12.5l4 4 9-9"/></svg>';

DocKit.component({
  id: "gallery/habit",
  on: ["source", "editable", "clock", "layout"],
  mount(host, context) {
    const words = WORDS[languageOf(document.documentElement)];
    const face = made("div", "face");
    const head = made("div", "head");
    const chip = made("span", "chip");
    chip.setAttribute("aria-hidden", "true");
    chip.innerHTML = CHIP;
    const name = made("input", "name");
    name.type = "text";
    name.placeholder = words.name;
    name.spellcheck = false;
    name.setAttribute("aria-label", words.name);
    // A narrow card's name as words of up to two lines over the field, which stays the one a press or Tab reaches (style.css).
    const label = made("span", "label");
    label.setAttribute("aria-hidden", "true");
    const total = made("span", "total");
    head.append(chip, name, label, total);
    // The streak: its count large and its unit after it (a narrow card a flame before it), or, never
    // checked in, a line inviting the first.
    const row = made("div", "row");
    const streak = made("p", "streak");
    const flame = made("span", "flame");
    flame.setAttribute("aria-hidden", "true");
    flame.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${FLAME}</svg>`;
    const count = made("strong", "count");
    const unit = made("span", "unit");
    streak.append(flame, count, unit);
    const fresh = made("p", "fresh");
    const press = made("button", "check");
    press.type = "button";
    row.append(streak, fresh, press);
    // A tall card's five weeks: what they are and how many were done, over the month.
    const caption = made("div", "caption");
    const captionName = made("span", "caption-name");
    captionName.textContent = words.weeks;
    const captionCount = made("span", "caption-count");
    caption.append(captionName, captionCount);
    const week = made("ol", "week");
    week.setAttribute("aria-label", words.week);
    face.append(head, row, caption, week);
    host.append(face);
    const named = DocKit.input(name, { signal: context.signal, commit: (value) => rename(context, value) });
    press.addEventListener("click", () => {
      if (context.canEdit()) pressToday(context, dayOf(new Date()));
    }, { signal: context.signal });

    const draw = (/** @type {string} */ reason = "", /** @type {unknown} */ detail = null) => {
      if (reason === "clock" && detail !== "day") return; // a minute moves no day
      const size = context.size;
      const layout = !size ? "wide" : size.w <= 2 ? "narrow" : size.h >= 4 ? "tall" : "wide";
      if (face.dataset.layout !== layout) face.dataset.layout = layout;
      const data = context.readJSON("habit");
      if (data === undefined) return; // no JSON: the instance has failed, and Gallery shows what it holds
      let habit;
      try {
        habit = readHabit(data);
      } catch (error) {
        return context.fail(error);
      }
      const today = dayOf(new Date());
      const writes = context.canEdit();
      const done = habit.days.includes(today);
      name.readOnly = !writes;
      named.set(habit.name);
      label.textContent = habit.name || words.name;
      label.toggleAttribute("data-empty", !habit.name);
      // Where nothing is written, the button is a line saying how today stands: nothing to press.
      press.disabled = !writes;
      press.classList.toggle("gallery-habit-done", done);
      if (writes && done) press.innerHTML = `${CHECK}<span>${words.checked}</span>`;
      else press.textContent = writes ? words.check : (done ? words.todayDone : words.todayOpen);
      if (writes && done) press.dataset.docTip = words.undo;
      else delete press.dataset.docTip;
      press.setAttribute("aria-pressed", String(done));
      face.toggleAttribute("data-fresh", habit.days.length === 0);
      const days = streakOf(habit.days, today);
      count.textContent = String(days);
      unit.textContent = layout === "narrow" ? words.unit(days) : words.streak;
      fresh.replaceChildren(...(layout === "narrow" ? [words.fresh[0]] : [words.fresh[0], document.createElement("br"), words.fresh[1]]));
      total.textContent = habit.days.length > 0 ? words.total(new Set(habit.days).size) : "";
      const span = layout === "tall" ? 5 : 1;
      const shown = monthOf(habit.days, today, span);
      week.dataset.weeks = String(span);
      const [before, got, after] = words.got(shown.filter((day) => day.done && !day.future).length);
      const bold = document.createElement("b");
      bold.textContent = got;
      captionCount.replaceChildren(before, bold, after);
      const initials = span === 5 ? [1, 2, 3, 4, 5, 6, 0].map((weekday) => {
        const item = made("li", "initial");
        item.setAttribute("aria-hidden", "true");
        item.textContent = words.initials[weekday];
        return item;
      }) : [];
      week.replaceChildren(...initials, ...shown.map(({ day, weekday, done: kept, today: now, future, streak: inStreak }) => {
        const item = made("li", "day");
        item.classList.toggle("gallery-habit-kept", kept);
        item.classList.toggle("gallery-habit-today", now);
        item.classList.toggle("gallery-habit-future", future);
        item.classList.toggle("gallery-habit-streak-day", inStreak);
        const [, month, date] = day.split("-").map(Number);
        item.setAttribute("aria-label", words.day(month, date, kept));
        item.dataset.docTip = words.day(month, date, kept);
        // A week's circle says its day by its initial (今 for today), a month's by its date; a day done of a week, a tick.
        if (span === 1 && kept && !future) item.innerHTML = CHECK;
        else item.textContent = span === 5 ? String(date) : now && words.today ? words.today : words.initials[weekday];
        return item;
      }));
    };
    draw();
    return { update: draw };
  },
  example(host, context) {
    pressToday(context, dayOf(new Date()));
  },
});
