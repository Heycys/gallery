// gallery-soft/today (问候与日期, 柔光风格): Gallery 风格's gallery/today in the soft look, the same logic. A
// greeting by the hour of the reader's clock (早上好 from 5 to 11, 下午好 from 12 to 17, 晚上好 from 18 to 4),
// today's date and its weekday, in the page's language and in the order it writes them (11月7日 星期六,
// Saturday, November 7): the UI's where Gallery says it (data-ge-language on the root), else English for a
// page whose lang is en, else Chinese, the kit's own rule. Drawn again by the kit's clock (`clock`): at each
// whole minute, which moves the greeting on as the hour turns, and as a day begins, which moves the date;
// one timer for every block on the page, none of its own. It holds no part and writes nothing: all it shows
// is drawn (the manifest's `runtime`), and a file holds the bare instance.
//
// Its face is laid out by its card's size (`context.size`, read again on `layout`; the manifest's first size
// where no card is): on a 4 × 2 card the greeting is the hero, large, after the sun by day (from 5 to 17)
// or the moon in the evening, the date under it with the number of the week (ISO 8601's, `weekNumberOf`) at
// its end, and the week it is in at the bottom, Monday to Sunday, each day's initial over its date, today's
// 今 over its date on a disc of the accent (`weekOf`); a 2 × 2 card says the month and the weekday at the
// top beside the sun, the day of the month large, and the greeting at the bottom. A glow at the card's top
// left, the sun's warm color by day, the accent's in the evening (the face's data-sky). The face says its
// size as data-w and data-h, and the frame's padding as data-pad (style.css).

const WORDS = {
  zh: {
    morning: "早上好",
    afternoon: "下午好",
    evening: "晚上好",
    weekdays: ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"],
    initials: ["日", "一", "二", "三", "四", "五", "六"],
    today: "今",
    week: (/** @type {number} */ number) => `第 ${number} 周`,
    /** The date and its weekday as the language writes them, pieces a line breaks between. @param {number} month @param {number} day @param {string} weekday */
    line: (month, day, weekday) => [`${month}月${day}日`, weekday],
    /** Which of the line's pieces is the weekday. */
    weekdayAt: 1,
    /** A small card's top line: the month and the weekday. @param {number} month @param {string} weekday */
    month: (month, weekday) => `${month}月 · ${weekday}`,
  },
  en: {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
    weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
    initials: ["S", "M", "T", "W", "T", "F", "S"],
    today: "Today",
    week: (/** @type {number} */ number) => `Week ${number}`,
    /** The weekday first: Saturday, November 7. @param {number} month @param {number} day @param {string} weekday */
    line: (month, day, weekday) => [`${weekday},`, `${["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][month - 1]} ${day}`],
    weekdayAt: 0,
    /** @param {number} month @param {string} weekday */
    month: (month, weekday) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][month - 1]} · ${weekday.slice(0, 3)}`,
  },
};

/** The language the page speaks: the UI's where Gallery says it (data-ge-language), else its lang's. */
function languageOf(/** @type {HTMLElement} */ root) {
  const ui = root.getAttribute("data-ge-language");
  return (ui !== null ? ui === "en" : /^en(?:-|$)/i.test(root.lang)) ? "en" : "zh";
}

/**
 * The part of the day an hour (0 to 23) is in, as the greeting says it: morning from 5 to 11,
 * afternoon from 12 to 17, evening from 18 to 4.
 * @param {number} hour
 * @returns {"morning" | "afternoon" | "evening"}
 */
function partOfDay(hour) {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

/**
 * What the card says at `now` (the reader's clock) in `language`: the greeting, the date line (its
 * month and day and the weekday, in the language's order, a list of words a line breaks between and
 * never inside), and the date as a <time> names it (YYYY-MM-DD).
 * @param {Date} now
 * @param {"zh" | "en"} language
 */
function faceOf(now, language) {
  const words = WORDS[language];
  const two = (/** @type {number} */ value) => String(value).padStart(2, "0");
  return {
    greeting: words[partOfDay(now.getHours())],
    line: words.line(now.getMonth() + 1, now.getDate(), words.weekdays[now.getDay()]),
    datetime: `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`,
  };
}

// The two pictures, 24 x 24 lines in the face's ink: the sun by day, the moon in the evening.
const PICTURES = {
  sun: '<circle cx="12" cy="12" r="4.2"/><path d="M12 2.8v2.1M12 19.1v2.1M2.8 12h2.1M19.1 12h2.1M5.5 5.5l1.5 1.5M17 17l1.5 1.5M5.5 18.5L7 17M17 7l1.5-1.5"/>',
  moon: '<path d="M19.5 14.6A8 8 0 0 1 9.4 4.5a8 8 0 1 0 10.1 10.1z"/>',
};

/**
 * The week `now` is in, Monday first, as the card's strip draws it in `language`: seven of { initial (the
 * weekday's, today's 今 or Today), date (the day of the month), today, past (a day before today) }.
 * @param {Date} now
 * @param {"zh" | "en"} language
 */
function weekOf(now, language) {
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7), 12);
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + index, 12);
    const today = index === (now.getDay() + 6) % 7;
    return { initial: today ? WORDS[language].today : WORDS[language].initials[day.getDay()], date: day.getDate(), today, past: index < (now.getDay() + 6) % 7 };
  });
}

/**
 * The number of the week `now` is in, as ISO 8601 counts them (the week a year's first Thursday is in its
 * first, Monday its first day), 1 to 53.
 * @param {Date} now
 */
function weekNumberOf(now) {
  const thursday = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7)); // the Thursday of its week, which says the year
  const first = Date.UTC(thursday.getUTCFullYear(), 0, 1);
  return Math.ceil(((thursday.getTime() - first) / 86_400_000 + 1) / 7);
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
 */
function made(tag, kind) {
  const node = document.createElement(tag);
  node.className = `gallery-soft-today-${kind}`;
  return node;
}

DocKit.component({
  id: "gallery-soft/today",
  on: ["clock", "layout"],
  mount(host, context) {
    const face = made("div", "face");
    const sun = made("span", "sun");
    sun.setAttribute("aria-hidden", "true");
    const greeting = made("p", "greeting");
    const date = made("time", "date");
    // The line's end: the number of the week.
    const number = made("span", "meta");
    number.setAttribute("aria-hidden", "true");
    const week = made("ol", "week");
    week.setAttribute("aria-hidden", "true");
    // A small card's: the month and the weekday at the top, the day of the month large.
    const month = made("span", "month");
    month.setAttribute("aria-hidden", "true");
    const day = made("span", "day");
    day.setAttribute("aria-hidden", "true");
    face.append(sun, greeting, month, day, date, number, week);
    host.append(face);
    // Each word set only when it is another, so that a minute that changes nothing writes nothing.
    const put = (/** @type {HTMLElement} */ node, /** @type {string} */ words) => {
      if (node.textContent !== words) node.textContent = words;
    };
    const lay = () => {
      const { w, h, pad } = sizeOf(context?.size, [4, 2]);
      if (face.dataset.w !== String(w)) face.dataset.w = String(w);
      if (face.dataset.h !== String(h)) face.dataset.h = String(h);
      if (face.dataset.pad !== pad) face.dataset.pad = pad;
    };
    const draw = () => {
      const at = new Date();
      const language = languageOf(document.documentElement);
      const words = WORDS[language];
      const now = faceOf(at, language);
      const sky = partOfDay(at.getHours()) === "evening" ? "moon" : "sun";
      if (face.dataset.sky !== sky) {
        face.dataset.sky = sky;
        sun.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${PICTURES[sky]}</svg>`;
      }
      put(greeting, now.greeting);
      put(month, words.month(at.getMonth() + 1, words.weekdays[at.getDay()]));
      put(day, String(at.getDate()));
      // The date line's pieces, a space between them, made again only when its words are others.
      if (date.textContent !== now.line.join(" ")) {
        date.replaceChildren(...now.line.flatMap((piece, index) => {
          const node = made("span", "piece");
          node.classList.toggle("gallery-soft-today-weekday", index === words.weekdayAt);
          node.textContent = piece;
          return index === 0 ? [node] : [" ", node];
        }));
      }
      if (date.dateTime !== now.datetime) {
        date.dateTime = now.datetime;
        number.textContent = words.week(weekNumberOf(at));
        week.replaceChildren(...weekOf(at, language).map((one) => {
          const item = made("li", "date-of");
          item.classList.toggle("gallery-soft-today-now", one.today);
          item.classList.toggle("gallery-soft-today-past", one.past);
          const initial = made("span", "initial");
          initial.textContent = one.initial;
          const figure = made("span", "number");
          figure.textContent = String(one.date);
          item.append(initial, figure);
          return item;
        }));
      }
    };
    lay();
    draw();
    return {
      update(reason) {
        if (reason === "layout") lay();
        else draw();
      },
    };
  },
});
