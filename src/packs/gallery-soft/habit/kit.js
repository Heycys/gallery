// gallery-soft/habit (习惯打卡, 柔光风格): Gallery 风格's gallery/habit in the soft look, the same logic and
// data. One habit, checked in once a day. Its data part, a script of JSON, holds the habit's name and the
// days it was done, each YYYY-MM-DD by the reader's clock, in order: { "name": "喝八杯水", "days":
// ["2026-11-05", "2026-11-06"] }. The card draws the name in a field of its own in its head (DocKit.input:
// written as the reader presses Enter or leaves it, never while an input method composes), the streak (the
// days in a row up to today, or up to yesterday while today is not checked yet, so that a streak lasts the
// day it is to be kept), how many days in all, and a way to check today in, or take today's check-in back
// when it is there. Each press and each name is one context.editJSON, one undo step, the JSON written back on
// one line as it was: what the reader does is in the file, and nothing else is (the streak, the days and the
// calendar are worked out as it draws). It draws from the part on every `source` (an undo, an Agent's write)
// and again as a day begins (the kit's `clock`, "day"), so that "today" moves at midnight. Where nothing
// takes its writes (an export, a page that has not come to edit yet: context.canEdit() false) the name is
// read-only and nothing can be pressed: the button a plain line saying whether today is done.
//
// Its face, laid out by its card's size (`context.size`, read again on `layout`; data-w, data-h, data-pad):
// a head of a ringed check's warm chip, the name and the days in all at its end (共 42 天); the streak the hero
// (连续打卡 over its count). A 4 × 2 card sets the last seven days beside it as a row of dots, a check in
// each one done, today's the button itself (a ring with a plus that a press fills); a 2 × 2 card the streak
// over a button as wide as the card (打卡, or 已打卡 in green); a 4 × 4 card the streak, the longest one and
// the button, over the last four weeks as a calendar, Monday first, each day done tinted, today ringed. A
// habit never checked in shows, where the streak stands, a line inviting the first (还没打过卡, 从今天开始).
// Its words are the page's language (the UI's where Gallery says it, else the page's lang).

const WORDS = {
  zh: {
    name: "给习惯起个名字",
    nameShort: "起个名字",
    check: "打卡",
    checked: "已打卡",
    undo: "再按一下，撤回今天的打卡",
    todayDone: "今天已打卡",
    todayOpen: "今天还没打卡",
    streak: "连续打卡",
    streakShort: "连续",
    unit: () => "天",
    total: (/** @type {number} */ days) => `共 ${days} 天`,
    longest: (/** @type {number} */ days) => `最长 ${days} 天`,
    fresh: "还没打过卡",
    freshHow: "从今天开始",
    week: "最近七天",
    weekdays: ["日", "一", "二", "三", "四", "五", "六"],
    monday: ["一", "二", "三", "四", "五", "六", "日"],
    today: "今",
    day: (/** @type {number} */ month, /** @type {number} */ day, /** @type {boolean} */ done) => `${month}月${day}日${done ? "，已打卡" : "，没打卡"}`,
  },
  en: {
    name: "Name this habit",
    nameShort: "Name it",
    check: "Check in",
    checked: "Done",
    undo: "Press again to take today's check-in back",
    todayDone: "Done today",
    todayOpen: "Not done today",
    streak: "Streak",
    streakShort: "Streak",
    unit: (/** @type {number} */ days) => (days === 1 ? "day" : "days"),
    total: (/** @type {number} */ days) => `${days} ${days === 1 ? "day" : "days"} in all`,
    longest: (/** @type {number} */ days) => `Best ${days}`,
    fresh: "No check-ins yet",
    freshHow: "Start today",
    week: "The last seven days",
    weekdays: ["S", "M", "T", "W", "T", "F", "S"],
    monday: ["M", "T", "W", "T", "F", "S", "S"],
    today: "Today",
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

/** The weekday of a day (YYYY-MM-DD), 0 for Sunday. @param {string} day */
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
 * The longest run of days in a row the habit was done, 0 for none (the 4 × 4 card's 最长).
 * @param {string[]} days
 */
function longestOf(days) {
  const sorted = [...new Set(days)].sort();
  let longest = 0;
  let run = 0;
  sorted.forEach((day, index) => {
    run = index > 0 && dayAfter(sorted[index - 1], 1) === day ? run + 1 : 1;
    longest = Math.max(longest, run);
  });
  return longest;
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
 * The seven days that end today, the oldest first: each its day (YYYY-MM-DD), its weekday (0 for
 * Sunday) and whether it was done.
 * @param {string[]} days
 * @param {string} today
 */
function weekOf(days, today) {
  const done = new Set(days);
  return Array.from({ length: 7 }, (_, index) => {
    const day = dayAfter(today, index - 6);
    return { day, weekday: weekdayOf(day), done: done.has(day) };
  });
}

/**
 * The last `weeks` weeks to the one of `today`, Monday first, as the 4 × 4 card's calendar draws them: each
 * day its date (YYYY-MM-DD), whether it was done, whether it is today and whether it is still to come.
 * @param {string[]} days
 * @param {string} today
 * @param {number} [weeks]
 */
function calendarOf(days, today, weeks = 4) {
  const done = new Set(days);
  const first = dayAfter(today, -((weekdayOf(today) + 6) % 7) - 7 * (weeks - 1));
  return Array.from({ length: 7 * weeks }, (_, index) => {
    const day = dayAfter(first, index);
    return { day, done: done.has(day), today: day === today, future: day > today };
  });
}

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
  node.className = `gallery-soft-habit-${kind}`;
  if (text !== undefined) node.textContent = text;
  return node;
}

const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.3 4.3L19 7.3"/></svg>';
const PLUS = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>';

DocKit.component({
  id: "gallery-soft/habit",
  on: ["source", "editable", "clock", "layout"],
  mount(host, context) {
    const words = WORDS[languageOf(document.documentElement)];
    const face = made("div", "face");
    const head = made("div", "head");
    const chip = made("span", "chip");
    chip.setAttribute("aria-hidden", "true");
    chip.innerHTML = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="5.5"/><path d="m5.6 8.2 1.7 1.7 3.2-3.4"/></svg>'; // a ringed check, on a 16 grid, its line the 1.8 of the others' 24 in proportion
    const name = made("input", "name");
    name.type = "text";
    name.placeholder = words.name;
    name.spellcheck = false;
    name.setAttribute("aria-label", words.name);
    const total = made("span", "total");
    head.append(chip, name, total);
    // The streak: its label over its count, the count large and its unit after it; the longest beside it on a tall card.
    const streak = made("div", "streak");
    const label = made("span", "label", words.streak);
    const figure = made("p", "figure");
    const before = made("span", "before", words.streakShort);
    const count = made("strong", "count");
    const unit = made("span", "unit");
    figure.append(before, count, unit);
    const longest = made("span", "longest");
    const row = made("div", "row");
    row.append(figure, longest);
    streak.append(label, row);
    // Never checked in: this, where the streak stands.
    const fresh = made("p", "fresh");
    fresh.append(made("span", "fresh-line", words.fresh), made("span", "fresh-how", words.freshHow));
    const press = made("button", "check");
    press.type = "button";
    const week = made("ol", "week");
    week.setAttribute("aria-label", words.week);
    const calendar = made("div", "calendar");
    calendar.setAttribute("aria-hidden", "true");
    const top = made("div", "top");
    top.append(streak, fresh, press);
    face.append(head, top, week, calendar);
    host.append(face);
    const named = DocKit.input(name, { signal: context.signal, commit: (value) => rename(context, value) });
    const pressed = () => {
      if (context.canEdit()) pressToday(context, dayOf(new Date()));
    };
    press.addEventListener("click", pressed, { signal: context.signal });

    const draw = (/** @type {string} */ reason = "", /** @type {unknown} */ detail = null) => {
      if (reason === "clock" && detail !== "day") return; // a minute moves no day
      const data = context.readJSON("habit");
      if (data === undefined) return; // no JSON: the instance has failed, and Gallery shows what it holds
      let habit;
      try {
        habit = readHabit(data);
      } catch (error) {
        return context.fail(error);
      }
      const { w, h, pad } = sizeOf(context.size, [4, 2]);
      Object.assign(face.dataset, { w: String(w), h: String(h), pad });
      name.placeholder = pad === "s" ? words.nameShort : words.name; // a 2 × 2 card's head holds no more
      const today = dayOf(new Date());
      const writes = context.canEdit();
      const done = habit.days.includes(today);
      name.readOnly = !writes;
      named.set(habit.name);
      face.toggleAttribute("data-named", habit.name.trim() !== "");
      // Where nothing is written, the button is a line saying how today stands: nothing to press.
      press.disabled = !writes;
      press.classList.toggle("gallery-soft-habit-done", done);
      press.innerHTML = writes ? `${done ? CHECK : PLUS}<span></span>` : "<span></span>";
      /** @type {HTMLElement} */ (press.lastElementChild).textContent = writes ? (done ? words.checked : words.check) : (done ? words.todayDone : words.todayOpen);
      if (writes && done) press.dataset.docTip = words.undo;
      else delete press.dataset.docTip;
      press.setAttribute("aria-pressed", String(done));
      face.toggleAttribute("data-fresh", habit.days.length === 0);
      const days = streakOf(habit.days, today);
      count.textContent = String(days);
      unit.textContent = words.unit(days);
      total.textContent = habit.days.length > 0 ? words.total(new Set(habit.days).size) : "";
      longest.textContent = habit.days.length > 0 ? words.longest(longestOf(habit.days)) : "";
      // The last seven days, today's dot the button (drawn anew, it gets the focus back if the keys were on it: Space checks in, and the keys stay).
      const onToday = week.contains(document.activeElement);
      week.replaceChildren(...weekOf(habit.days, today).map(({ day, weekday, done: kept }) => {
        const item = made("li", "day");
        const now = day === today;
        item.classList.toggle("gallery-soft-habit-kept", kept);
        item.classList.toggle("gallery-soft-habit-today", now);
        const [, month, date] = day.split("-").map(Number);
        item.dataset.docTip = now && writes && kept ? words.undo : words.day(month, date, kept);
        const dot = made(now ? "button" : "span", now ? "today-press" : "dot");
        dot.innerHTML = kept ? CHECK : now ? PLUS : "";
        if (now) {
          // Today's dot is the button: pressed, today is checked in or taken back.
          const button = /** @type {HTMLButtonElement} */ (dot);
          button.type = "button";
          button.disabled = !writes;
          button.setAttribute("aria-pressed", String(kept));
          button.setAttribute("aria-label", writes ? (kept ? words.checked : words.check) : (kept ? words.todayDone : words.todayOpen));
          button.addEventListener("click", pressed);
        } else item.setAttribute("aria-label", words.day(month, date, kept));
        item.append(dot, made("span", "weekday", now ? words.today : words.weekdays[weekday]));
        return item;
      }));
      if (onToday) /** @type {HTMLElement | null} */ (week.querySelector(".gallery-soft-habit-today-press"))?.focus({ preventScroll: true });
      // The last four weeks, Monday first, under their weekdays' initials.
      calendar.replaceChildren(...words.monday.map((initial) => made("span", "initial", initial)), ...calendarOf(habit.days, today).map((one) => {
        const cell = made("span", "date", String(Number(one.day.slice(8))));
        cell.classList.toggle("gallery-soft-habit-on", one.done && !one.future);
        cell.classList.toggle("gallery-soft-habit-now", one.today && !one.done);
        cell.classList.toggle("gallery-soft-habit-future", one.future);
        return cell;
      }));
    };
    draw();
    return { update: draw };
  },
  example(host, context) {
    pressToday(context, dayOf(new Date()));
  },
});
