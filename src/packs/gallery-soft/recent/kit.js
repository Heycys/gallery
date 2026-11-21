// gallery-soft/recent (最近编辑, 柔光风格): Gallery 风格's gallery/recent in the soft look, the same logic. The
// workspace's documents edited last, the last first, read through context.workspace.query("recent") (its
// manifest's needs hold "workspace"): each its page icon, its title and when it was edited, said as a person
// says it (刚刚, 5 分钟前, 昨天, 11月2日), which moves on by itself (the kit's clock, each minute). A click opens
// the document (context.workspace.open: the workbench goes there). It reads again whenever the workspace
// says the list changed (the `data` signal, "recent": a document written, renamed, given another icon, made
// or gone). It holds no part and writes nothing: all it shows is drawn (the manifest's `runtime`). Where the
// workspace cannot be read (an exported file, where it has no server; a server that does not answer) it
// says so on the cards' empty face. The words are the page's language (the UI's where Gallery says it, else
// the page's lang).
//
// Its face, laid out by its card's size (`context.size`, read again on `layout`; data-w, data-h, data-pad): a
// head of a clock's chip and 最近编辑, how many of those listed were edited today at its end (今天 3 篇); the
// documents as rows like the sidebar's, the latest's time in the accent; a card 6 cells high and more says
// over them which of today, yesterday, this week and earlier each is in (`sectionOf`). The list shows whole
// rows only: as many as fit what the card has under its head (`fit`, its height the bottom of the last row
// none is cut at), a muted line under them saying how many more are below (还有 3 篇), counted again as the
// list scrolls or the card changes size (its own ResizeObserver on the face) and gone at its end; a card 2
// cells high shows its rows at the bottom, no such line.
//
// A document's icon is drawn as Gallery's sidebar draws it, from the server that shows the page (its icon
// route, /__gallery/edit/icon, one picture of any icon's value): an emoji as Twemoji's picture (never the system
// font's), a picture of its folder
// as a picture, one of Gallery's glyphs as a mask in the muted color, which follows the theme; a document
// with none a page drawn on a soft gray square.

const WORDS = {
  zh: {
    title: "最近编辑",
    empty: "还没有文档",
    emptyHow: "新建一篇，或者让 Agent 写一篇",
    offline: "在 Gallery 里打开时显示",
    failed: "读不到工作区的文档",
    more: (/** @type {number} */ count) => `还有 ${count} 篇`,
    today: (/** @type {number} */ count) => `今天 ${count} 篇`,
    open: (/** @type {string} */ title) => `打开「${title}」`,
    now: "刚刚",
    minutes: (/** @type {number} */ count) => `${count} 分钟前`,
    hours: (/** @type {number} */ count) => `${count} 小时前`,
    yesterday: "昨天",
    days: (/** @type {number} */ count) => `${count} 天前`,
    date: (/** @type {Date} */ date, /** @type {boolean} */ thisYear) => (thisYear ? `${date.getMonth() + 1}月${date.getDate()}日` : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`),
    sections: { today: "今天", yesterday: "昨天", week: "本周", earlier: "更早" },
  },
  en: {
    title: "Recently edited",
    empty: "No documents yet",
    emptyHow: "Make one, or ask your Agent to write one",
    offline: "Shown when opened in Gallery",
    failed: "The workspace's documents could not be read",
    more: (/** @type {number} */ count) => `${count} more`,
    today: (/** @type {number} */ count) => `${count} today`,
    open: (/** @type {string} */ title) => `Open “${title}”`,
    now: "just now",
    minutes: (/** @type {number} */ count) => `${count} min ago`,
    hours: (/** @type {number} */ count) => `${count} h ago`,
    yesterday: "yesterday",
    days: (/** @type {number} */ count) => `${count} days ago`,
    date: (/** @type {Date} */ date, /** @type {boolean} */ thisYear) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()]} ${date.getDate()}${thisYear ? "" : `, ${date.getFullYear()}`}`,
    sections: { today: "Today", yesterday: "Yesterday", week: "This week", earlier: "Earlier" },
  },
};

/** The language the page speaks: the UI's where Gallery says it (data-ge-language), else its lang's. */
function languageOf(/** @type {HTMLElement} */ root) {
  const ui = root.getAttribute("data-ge-language");
  return (ui !== null ? ui === "en" : /^en(?:-|$)/i.test(root.lang)) ? "en" : "zh";
}

/**
 * When `edited` (an ISO time) was, from `now` (the reader's clock), as a person says it: within a minute
 * 刚刚, then minutes, then hours (the same day, or within 6 hours of it), 昨天 for the day before, days
 * within the week, else the date (the year said when it is another).
 * @param {string} edited
 * @param {Date} now
 * @param {"zh" | "en"} language
 */
function whenOf(edited, now, language) {
  const words = WORDS[language];
  const then = new Date(edited);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (!Number.isFinite(minutes)) return "";
  if (minutes < 1) return words.now;
  if (minutes < 60) return words.minutes(minutes);
  const day = (/** @type {Date} */ date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
  const days = day(now) - day(then);
  if (days === 0 || minutes < 360) return words.hours(Math.floor(minutes / 60));
  if (days === 1) return words.yesterday;
  if (days < 7) return words.days(days);
  return words.date(then, then.getFullYear() === now.getFullYear());
}

/**
 * Which part of the time `edited` (an ISO time) falls in from `now`, as a tall card's labels say it: today,
 * yesterday, this week (since Monday), or earlier.
 * @param {string} edited
 * @param {Date} now
 * @returns {"today" | "yesterday" | "week" | "earlier"}
 */
function sectionOf(edited, now) {
  const then = new Date(edited);
  const day = (/** @type {Date} */ date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;
  const days = day(now) - day(then);
  if (!(days >= 0) || days === 0) return "today";
  if (days === 1) return "yesterday";
  return days <= (now.getDay() + 6) % 7 ? "week" : "earlier";
}

/** What a document's icon is, as Gallery writes its value: a glyph (/icons/…), a picture of its folder (assets/…), an emoji, or none. @param {string | null} value */
function iconKindOf(value) {
  if (typeof value !== "string" || !value) return null;
  if (value.startsWith("/icons/")) return "glyph";
  if (value.startsWith("assets/")) return "image";
  return "emoji";
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
  node.className = `gallery-soft-recent-${kind}`;
  if (text !== undefined) node.textContent = text;
  return node;
}

const line = (/** @type {string} */ paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
const PAGE = '<path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>';

/**
 * The control of `list` the keys are on, by the key it carries (data-focus-key), or "": a list drawn anew (a
 * document written while a row has the focus) puts the focus back where it was.
 * @param {HTMLElement} list
 */
function focusKeyIn(list) {
  const at = /** @type {HTMLElement | null} */ (document.activeElement);
  return at && list.contains(at) ? at.dataset?.focusKey ?? "" : "";
}

/**
 * The focus on the control of `list` that `key` names, once it is drawn anew (the list scrolls for nothing).
 * @param {HTMLElement} list
 * @param {string} key
 */
function focusKeyed(list, key) {
  if (!key) return;
  for (const node of /** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll("[data-focus-key]"))) {
    if (node.dataset.focusKey === key) return void node.focus({ preventScroll: true });
  }
}

// A document's icon: its picture from the server's icon route (an emoji too), a glyph masked, or a page on a gray square.
function iconFor(/** @type {string} */ slug, /** @type {string | null} */ value) {
  const kind = iconKindOf(value);
  const icon = made("span", "icon");
  if (!kind || value === null) {
    icon.classList.add("gallery-soft-recent-plain");
    icon.innerHTML = line(PAGE);
    return icon;
  }
  const address = `/__gallery/edit/icon?value=${encodeURIComponent(value)}&slug=${encodeURIComponent(slug)}`;
  if (kind === "glyph") {
    icon.classList.add("gallery-soft-recent-glyph");
    icon.style.setProperty("--gallery-soft-recent-icon", `url("${address}")`);
    return icon;
  }
  const picture = document.createElement("img");
  picture.alt = "";
  picture.src = address;
  picture.decoding = "async";
  // An emoji is the picture the sidebar and the document show (Twemoji, from the server's icon route), never the system font's.
  icon.classList.add(kind === "emoji" ? "gallery-soft-recent-emoji" : "gallery-soft-recent-picture");
  icon.append(picture);
  return icon;
}

DocKit.component({
  id: "gallery-soft/recent",
  on: ["data", "clock", "layout"],
  mount(host, context) {
    const language = languageOf(document.documentElement);
    const words = WORDS[language];
    const face = made("div", "face");
    const list = made("ul", "list");
    const head = made("div", "head");
    const chip = made("span", "chip");
    chip.setAttribute("aria-hidden", "true");
    chip.innerHTML = line('<circle cx="12" cy="12" r="8.6"/><path d="M12 7.6V12l2.9 1.9"/>');
    // Its quiet meta at the head's end: how many of the documents listed were edited today.
    const meta = made("span", "meta");
    head.append(chip, made("span", "title", words.title), meta);
    const more = made("p", "more");
    const arrow = made("span", "arrow");
    arrow.innerHTML = line('<path d="M12 5v14M6.5 13.5L12 19l5.5-5.5"/>');
    const moreWords = made("span", "more-words");
    more.append(arrow, moreWords);
    more.hidden = true;
    const empty = made("div", "empty");
    face.append(head, list, more, empty);
    host.append(face);
    let high = 4; // the card's cells high, as last laid out
    // How many rows are below what the list shows (one cut off counted), said under it, or nothing.
    const recount = () => {
      const bottom = list.scrollTop + list.clientHeight;
      let below = 0;
      for (const row of /** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll(".gallery-soft-recent-item"))) if (row.offsetTop + row.offsetHeight > bottom + 1) below++;
      const said = below > 0 && high > 2 ? words.more(below) : "";
      if (moreWords.textContent !== said) moreWords.textContent = said;
      more.hidden = said === "";
    };
    // The list as high as the whole rows that fit the room under the head (with the line of more under it
    // where they are not all shown, but on a card 2 cells high), so that no row is cut at the card's bottom.
    const fit = () => {
      list.style.maxHeight = "";
      more.hidden = true;
      if (list.clientHeight === 0 || list.scrollHeight <= list.clientHeight + 1) return void recount();
      if (high > 2) {
        moreWords.textContent = words.more(0);
        more.hidden = false;
      }
      const room = list.clientHeight;
      const rows = /** @type {HTMLElement[]} */ ([...list.children]);
      const bottoms = rows.filter((row) => row.classList.contains("gallery-soft-recent-item")).map((row) => row.offsetTop + row.offsetHeight).filter((bottom) => bottom <= room + 0.5).sort((a, b) => b - a);
      const whole = bottoms.find((bottom) => rows.every((row) => !(row.offsetTop < bottom - 0.5 && row.offsetTop + row.offsetHeight > bottom + 0.5)));
      if (whole !== undefined) list.style.maxHeight = `${whole}px`;
      recount();
    };
    list.addEventListener("scroll", recount, { passive: true });
    const watch = typeof ResizeObserver === "function" ? new ResizeObserver(() => fit()) : null;
    watch?.observe(face);
    context.signal?.addEventListener("abort", () => {
      list.removeEventListener("scroll", recount);
      watch?.disconnect();
    }, { once: true });
    const workspace = context.workspace;
    if (!workspace) return void context.fail(new Error("its manifest's needs hold \"workspace\": context.workspace is not there"));
    /** @type {Array<{ node: HTMLElement, edited: string }>} */
    let times = [];
    /** @type {Array<{ slug: string, title: string, icon: string | null, edited: string }> | null} */
    let documents = null;
    let failure = "";
    const lay = () => {
      const { w, h, pad } = sizeOf(context.size, [4, 4]);
      high = h;
      Object.assign(face.dataset, { w: String(w), h: String(h), pad });
    };
    // The cards' empty face: a soft disc, a line, what to do.
    const say = (/** @type {string | null} */ said, /** @type {string} */ how = "", /** @type {string} */ picture = PAGE) => {
      face.toggleAttribute("data-empty", said !== null);
      if (said === null) return void empty.replaceChildren();
      const disc = made("span", "disc");
      disc.innerHTML = line(picture);
      empty.replaceChildren(disc, made("p", "line", said), ...(how ? [made("p", "how", how)] : []));
    };
    // Each time said again, only where its words are others; the head's count of today's too.
    const retime = () => {
      const now = new Date();
      let today = 0;
      for (const { node, edited } of times) {
        const said = whenOf(edited, now, language);
        if (node.textContent !== said) node.textContent = said;
        node.classList.toggle("gallery-soft-recent-now", said === words.now);
        const then = new Date(edited);
        if (then.getFullYear() === now.getFullYear() && then.getMonth() === now.getMonth() && then.getDate() === now.getDate()) today++;
      }
      const counted = today > 0 ? words.today(today) : "";
      if (meta.textContent !== counted) meta.textContent = counted;
    };
    const draw = () => {
      lay();
      times = [];
      if (documents === null) {
        meta.textContent = "";
        list.replaceChildren();
        if (failure === "offline") say(words.offline, "", '<circle cx="12" cy="12" r="8.6"/><path d="M12 7.6V12l2.9 1.9"/>');
        else if (failure) say(words.failed);
        else say(null);
        return fit();
      }
      const now = new Date();
      /** @type {string} */
      let section = "";
      /** @type {HTMLElement[]} */
      const rows = [];
      for (const entry of documents) {
        if (high >= 6) {
          const part = sectionOf(entry.edited, now);
          if (part !== section) {
            section = part;
            const label = made("li", "section", words.sections[part]);
            label.setAttribute("aria-hidden", "true");
            rows.push(label);
          }
        }
        const item = made("li", "item");
        const button = made("button", "document");
        button.type = "button";
        button.dataset.focusKey = `row:${entry.slug}`;
        const when = made("time", "when");
        when.dateTime = entry.edited;
        times.push({ node: when, edited: entry.edited });
        const name = made("span", "name", entry.title);
        name.setAttribute("data-doc-tip-cut", ""); // the document's whole title, where it is cut
        button.append(iconFor(entry.slug, entry.icon), name, when);
        button.addEventListener("click", () => workspace.open({ slug: entry.slug }));
        item.append(button);
        rows.push(item);
      }
      const focused = focusKeyIn(list);
      list.replaceChildren(...rows);
      focusKeyed(list, focused);
      retime();
      say(documents.length === 0 ? words.empty : null, words.emptyHow);
      fit();
    };
    let asking = 0; // the last read asked: an older answer that comes after it is dropped
    const read = () => {
      const ticket = ++asking;
      workspace.query("recent", { limit: 20 }).then(({ data }) => {
        if (ticket !== asking || context.signal.aborted) return;
        documents = data;
        failure = "";
        draw();
      }, (/** @type {any} */ error) => {
        if (ticket !== asking || context.signal.aborted) return;
        documents = null;
        failure = error?.code === "offline" ? "offline" : "failed";
        draw();
      });
    };
    lay();
    read();
    return {
      update(reason, detail) {
        if (reason === "data" && detail === "recent") read();
        else if (reason === "clock") retime();
        else if (reason === "layout") draw();
      },
    };
  },
});
