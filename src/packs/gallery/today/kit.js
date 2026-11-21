// gallery/today (问候与日期): a greeting by the hour of the reader's clock (早上好 from 5 to 11, 下午好
// from 12 to 17, 晚上好 from 18 to 4), today's date and its weekday, in the page's language and in the
// order it writes them (11月7日 星期六, Saturday, November 7: as the countdown's foot writes a date): the
// UI's where Gallery says it (data-ge-language on the root), else English for a page whose lang is en,
// else Chinese, the kit's own rule. Drawn again by the kit's clock (`clock`): at each whole minute, which
// moves the greeting on as the hour turns, and as a day begins, which moves the date; one timer for
// every block on the page, none of its own. It holds no part and writes nothing: all it shows is drawn
// (the manifest's `runtime`), and a file holds the bare instance.
//
// Its face (since 2026-11-09) is laid out by its card's
// cells (`context.size`, read again on `layout`: the face's `data-layout`, style.css): a card 3 or more
// wide and 2 or more high ("full", the 4 × 2 default) has a head of the chip (the sun from 5 to 17 in its
// warm color, the moon after it in the accent's), the date and the number of the week (ISO 8601's,
// `weekNumberOf`: 第 46 周) as its quiet meta, the greeting large under it, and the week it is in at the
// bottom, Monday to Sunday, each day's initial over its date, the days gone fainter, today's 今 (Today)
// over its date on the accent (`weekOf`, for the eye alone: the date says it); a narrow card ("narrow",
// 2 wide) is a page of a desk calendar, the greeting in its head, today's day of the month large at the
// bottom and its weekday and month under it; a card one cell high ("line", 4 × 1) a line, the chip, the
// greeting and the date. A soft glow from the card's top left, the sun's warm color by day, the accent's
// in the evening (the face's `data-sky`), the one mood of a home page. The date line's weekday is
// marked (gallery-today-weekday), a piece a line breaks before and never inside.

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
    /** A desk calendar's foot: the weekday, then the month. @param {number} month @param {string} weekday */
    foot: (month, weekday) => [weekday, `${month}月`],
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
    line: (month, day, weekday) => [`${weekday},`, `${MONTHS[month - 1]} ${day}`],
    weekdayAt: 0,
    /** @param {number} month @param {string} weekday */
    foot: (month, weekday) => [weekday, MONTHS[month - 1].slice(0, 3)],
  },
};
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

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

/**
 * How a card of `size` (context.size: its cells, or null where no card holds it, a document) lays its face
 * out: "line" one cell high, "narrow" two wide or less, else "full".
 * @param {{ w: number, h: number } | null | undefined} size
 * @returns {"full" | "narrow" | "line"}
 */
function layoutOf(size) {
  if (!size) return "full";
  if (size.h <= 1) return "line";
  return size.w <= 2 ? "narrow" : "full";
}

// The chip's two pictures, 24 x 24 lines in the chip's ink: the sun by day, the moon in the evening.
const PICTURES = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.8v1.9M12 19.3v1.9M2.8 12h1.9M19.3 12h1.9M5.5 5.5l1.3 1.3M17.2 17.2l1.3 1.3M5.5 18.5l1.3-1.3M17.2 6.8l1.3-1.3"/>',
  moon: '<path d="M19.5 14.3A7.8 7.8 0 0 1 9.7 4.5a7.8 7.8 0 1 0 9.8 9.8z"/>',
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
 * An element of the face, of `kind` (its class).
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} kind
 */
function made(tag, kind) {
  const node = document.createElement(tag);
  node.className = `gallery-today-${kind}`;
  return node;
}

DocKit.component({
  id: "gallery/today",
  on: ["clock", "layout"],
  mount(host, context) {
    const face = made("div", "face");
    const chip = made("span", "chip");
    chip.setAttribute("aria-hidden", "true");
    const greeting = made("p", "greeting");
    const date = made("time", "date");
    // The head's quiet meta, after the date: the number of the week.
    const number = made("span", "meta");
    number.setAttribute("aria-hidden", "true");
    const week = made("ol", "week");
    week.setAttribute("aria-hidden", "true");
    // A narrow card's desk calendar: the day of the month, large, and its weekday and month under it.
    const big = made("span", "big");
    big.setAttribute("aria-hidden", "true");
    const foot = made("span", "foot");
    foot.setAttribute("aria-hidden", "true");
    face.append(chip, greeting, date, number, week, big, foot);
    host.append(face);
    // Each word set only when it is another, so that a minute that changes nothing writes nothing.
    const put = (/** @type {HTMLElement} */ node, /** @type {string} */ words) => {
      if (node.textContent !== words) node.textContent = words;
    };
    const draw = () => {
      const at = new Date();
      const language = languageOf(document.documentElement);
      const words = WORDS[language];
      const now = faceOf(at, language);
      const layout = layoutOf(context?.size);
      if (face.dataset.layout !== layout) face.dataset.layout = layout;
      const sky = partOfDay(at.getHours()) === "evening" ? "moon" : "sun";
      if (chip.dataset.sky !== sky) {
        chip.dataset.sky = sky;
        face.dataset.sky = sky;
        chip.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${PICTURES[sky]}</svg>`;
      }
      put(greeting, now.greeting);
      // The date line's pieces, a space between them, made again only when its words are others.
      if (date.textContent !== now.line.join(" ")) {
        date.replaceChildren(...now.line.flatMap((piece, index) => {
          const node = made("span", "piece");
          node.classList.toggle("gallery-today-weekday", index === words.weekdayAt);
          node.textContent = piece;
          return index === 0 ? [node] : [" ", node];
        }));
      }
      if (date.dateTime !== now.datetime) {
        date.dateTime = now.datetime;
        number.textContent = words.week(weekNumberOf(at));
        big.textContent = String(at.getDate());
        const [weekday, month] = words.foot(at.getMonth() + 1, words.weekdays[at.getDay()]);
        const dot = made("span", "dot");
        dot.textContent = "·";
        foot.replaceChildren(weekday, dot, month);
        week.replaceChildren(...weekOf(at, language).map((day) => {
          const item = made("li", "day");
          item.classList.toggle("gallery-today-now", day.today);
          item.classList.toggle("gallery-today-past", day.past);
          const initial = made("span", "initial");
          initial.textContent = day.initial;
          const value = made("span", "number");
          value.textContent = String(day.date);
          item.append(initial, value);
          return item;
        }));
      }
    };
    draw();
    return { update: draw };
  },
});
