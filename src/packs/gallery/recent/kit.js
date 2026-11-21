// gallery/recent (最近编辑): the workspace's documents edited last, the last first, read through
// context.workspace.query("recent") (its manifest's needs hold "workspace"; and "stats", for how many
// there are in all): each its page icon, its title and when it was edited. A click opens the document
// (context.workspace.open: the workbench goes there). It reads again whenever the workspace says the list
// changed (the `data` signal, "recent": a document written, renamed, given another icon, made or gone), and
// says the times again each minute (the kit's clock). It holds no part and writes nothing: all it shows is
// drawn (the manifest's `runtime`). Where the workspace cannot be read (an exported file, where it has no
// server; a server that does not answer) it says so. The words are the page's language (the UI's where
// Gallery says it, else the page's lang).
//
// Its face (in the kit's card tokens): a head of the chip (a clock), 最近编辑 and how
// many of them were edited today, its quiet meta (今天 3 篇); then rows like the sidebar's, grouped by
// when (今天, 昨天, 本周, 更早: `groupOf`), each its icon, its title and its time at its end, said by its
// group (`whenOf`: today's 12 分钟前, or the hour once an hour has gone, 08:05; yesterday's its hour; this
// week's its weekday, 周二; earlier ones the date, 11月7日); under them, faint, how many more there are (还有
// 20 篇). The card shows whole rows only, as many as the room under its head holds with their groups'
// titles (`fit`, measured again as the card changes size: its own ResizeObserver on the face). A card two
// cells high (`data-layout` "short", by context.size) lists the last three, no groups, their times as a
// person says them (昨天, 周二). No document yet: the cards' empty face.
//
// A document's icon is drawn as Gallery's sidebar draws it, from the server that shows the page (its icon
// route, /__gallery/edit/icon, one picture of any icon's value): an emoji or a picture of its folder as a
// picture, one of Gallery's glyphs as a mask in the muted color, which follows the theme; a document with
// none a page drawn in its line.

const WORDS = {
  zh: {
    title: "最近编辑",
    empty: ["还没有文档", "新建一篇，或者让 Agent 写一篇"],
    offline: ["在 Gallery 里打开时显示", "这里会列出最近改过的文档"],
    failed: ["读不到工作区的文档", "过一会儿会再读"],
    more: (/** @type {number} */ count) => `还有 ${count} 篇`,
    today: (/** @type {number} */ count) => `今天 ${count} 篇`,
    open: (/** @type {string} */ title) => `打开「${title}」`,
    groups: { today: "今天", yesterday: "昨天", week: "本周", earlier: "更早" },
    now: "刚刚",
    minutes: (/** @type {number} */ count) => `${count} 分钟前`,
    yesterday: "昨天",
    weekdays: ["周日", "周一", "周二", "周三", "周四", "周五", "周六"],
    date: (/** @type {Date} */ date, /** @type {boolean} */ thisYear) => (thisYear ? `${date.getMonth() + 1}月${date.getDate()}日` : `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`),
  },
  en: {
    title: "Recently edited",
    empty: ["No documents yet", "Make one, or ask your Agent to write one"],
    offline: ["Shown when opened in Gallery", "The documents edited last show here"],
    failed: ["The workspace's documents could not be read", "It reads them again in a while"],
    more: (/** @type {number} */ count) => `${count} more`,
    today: (/** @type {number} */ count) => `${count} today`,
    open: (/** @type {string} */ title) => `Open “${title}”`,
    groups: { today: "Today", yesterday: "Yesterday", week: "This week", earlier: "Earlier" },
    now: "just now",
    minutes: (/** @type {number} */ count) => `${count} min ago`,
    yesterday: "Yesterday",
    weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
    date: (/** @type {Date} */ date, /** @type {boolean} */ thisYear) => `${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][date.getMonth()]} ${date.getDate()}${thisYear ? "" : `, ${date.getFullYear()}`}`,
  },
};
/** The documents it asks for: as many as the tallest card shows, and more. */
const LIMIT = 50;
/** A group's title and a row, in px (style.css). */
const GROUP_HEIGHT = 26;
const ROW_HEIGHT = 30;
/** The line of how many more there are, with the gap above it, in px (style.css): kept free only where it is drawn. */
const MORE_HEIGHT = 24;

/** The language the page speaks: the UI's where Gallery says it (data-ge-language), else its lang's. */
function languageOf(/** @type {HTMLElement} */ root) {
  const ui = root.getAttribute("data-ge-language");
  return (ui !== null ? ui === "en" : /^en(?:-|$)/i.test(root.lang)) ? "en" : "zh";
}

/** A local day, as a number of days. @param {Date} date */
const dayNumber = (date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86_400_000;

/**
 * Which group a document edited at `edited` (an ISO time) is in, from `now` (the reader's clock): "today",
 * "yesterday", "week" (earlier this week, from its Monday) or "earlier".
 * @param {string} edited
 * @param {Date} now
 */
function groupOf(edited, now) {
  const then = new Date(edited);
  const days = dayNumber(now) - dayNumber(then);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return days <= (now.getDay() + 6) % 7 ? "week" : "earlier";
}

/**
 * When `edited` (an ISO time) was, from `now` (the reader's clock), in `language`: within the hour 刚刚
 * and N 分钟前, then today's hour (08:05); yesterday's hour where its group says yesterday (`grouped`),
 * else 昨天; a day earlier this week its weekday (周二); else its date, the year said when it is another.
 * @param {string} edited
 * @param {Date} now
 * @param {"zh" | "en"} language
 * @param {boolean} [grouped]
 */
function whenOf(edited, now, language, grouped = true) {
  const words = WORDS[language];
  const then = new Date(edited);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (!Number.isFinite(minutes)) return "";
  const two = (/** @type {number} */ value) => String(value).padStart(2, "0");
  const hour = `${two(then.getHours())}:${two(then.getMinutes())}`;
  const group = groupOf(edited, now);
  if (group === "today") return minutes < 1 ? words.now : minutes < 60 ? words.minutes(minutes) : hour;
  if (group === "yesterday") return grouped ? hour : words.yesterday;
  if (group === "week") return words.weekdays[then.getDay()];
  return words.date(then, then.getFullYear() === now.getFullYear());
}

/** What a document's icon is, as Gallery writes its value: a glyph (/icons/…), a picture of its folder (assets/…), an emoji, or none. @param {string | null} value */
function iconKindOf(value) {
  if (typeof value !== "string" || !value) return null;
  if (value.startsWith("/icons/")) return "glyph";
  if (value.startsWith("assets/")) return "image";
  return "emoji";
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
  node.className = `gallery-recent-${kind}`;
  if (text !== undefined) node.textContent = text;
  return node;
}


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

// A document's icon: its picture from the server's icon route, a glyph masked, or none (the page CSS draws).
function iconFor(/** @type {string} */ slug, /** @type {string | null} */ value) {
  const kind = iconKindOf(value);
  const icon = made("span", "icon");
  if (!kind || value === null) return icon;
  const address = `/__gallery/edit/icon?value=${encodeURIComponent(value)}&slug=${encodeURIComponent(slug)}`;
  if (kind === "glyph") {
    icon.classList.add("gallery-recent-glyph");
    icon.style.setProperty("--gallery-recent-icon", `url("${address}")`);
    return icon;
  }
  const picture = document.createElement("img");
  picture.alt = "";
  picture.src = address;
  picture.decoding = "async";
  icon.classList.add("gallery-recent-picture");
  icon.append(picture);
  return icon;
}

DocKit.component({
  id: "gallery/recent",
  on: ["data", "clock", "layout"],
  mount(host, context) {
    const language = languageOf(document.documentElement);
    const words = WORDS[language];
    const face = made("div", "face");
    const list = made("ul", "list");
    const head = made("div", "head");
    const chip = made("span", "chip");
    chip.setAttribute("aria-hidden", "true");
    chip.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 1.8"/></svg>';
    // Its quiet meta after the title: how many of the documents were edited today.
    const meta = made("span", "meta");
    head.append(chip, made("span", "title", words.title), meta);
    const more = made("p", "more");
    more.hidden = true;
    // No document, or no workspace: the cards' empty face.
    const empty = made("div", "empty");
    const emptyPicture = made("span", "empty-picture");
    emptyPicture.setAttribute("aria-hidden", "true");
    emptyPicture.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5h6.5L18 8v11a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M13.5 3.5V8H18"/></svg>';
    const line = made("p", "line");
    const hint = made("p", "hint");
    empty.append(emptyPicture, line, hint);
    empty.hidden = true;
    face.append(head, list, more, empty);
    host.append(face);
    const workspace = context.workspace;
    if (!workspace) return void context.fail(new Error("its manifest's needs hold \"workspace\": context.workspace is not there"));
    /** @type {Array<{ slug: string, title: string, icon: string | null, edited: string }> | null} */
    let documents = null;
    let total = 0;
    /** @type {Array<{ node: HTMLElement, edited: string }>} */
    let times = [];
    let shown = -1;
    const short = () => Boolean(context.size && context.size.h <= 2);
    const say = (/** @type {string[] | null} */ said) => {
      empty.hidden = said === null;
      list.hidden = said !== null;
      if (said === null) return;
      line.textContent = said[0];
      hint.textContent = said[1] ?? "";
    };
    // Each time said again, only where its words are others; the head's count of today's too.
    const retime = () => {
      const now = new Date();
      for (const { node, edited } of times) {
        const said = whenOf(edited, now, language, !short());
        if (node.textContent !== said) node.textContent = said;
      }
      const today = (documents ?? []).filter(({ edited }) => groupOf(edited, now) === "today").length;
      const counted = today > 0 ? words.today(today) : "";
      if (meta.textContent !== counted) meta.textContent = counted;
    };
    // The rows the room under the head holds, whole, with their groups' titles (none on a short card), and
    // a line of how many more there are: drawn again only when that is another number.
    const fit = (/** @type {boolean} */ again = false) => {
      if (!documents) return;
      const layout = short() ? "short" : "full";
      face.dataset.layout = layout;
      const now = new Date();
      // The room: the face's height under the head (none measured where nothing lays it out: every row).
      const spare = face.clientHeight > 0 ? face.clientHeight - head.offsetHeight - (layout === "short" ? 4 : 6) : Infinity;
      // The rows, whole, with their groups' titles, that `room` holds.
      const rowsIn = (/** @type {number} */ room) => {
        let used = 0;
        let group = "";
        let counted = 0;
        for (const entry of documents ?? []) {
          const next = groupOf(entry.edited, now);
          const cost = (next !== group ? GROUP_HEIGHT : 0) + ROW_HEIGHT;
          if (used + cost > room) break;
          used += cost;
          group = next;
          counted++;
        }
        return counted;
      };
      let count = 0;
      if (layout === "short") count = Math.min(3, documents.length);
      else {
        // First with no room kept for the line of more: where every document fits (and there is no other in the
        // workspace) it is not wanted, and the last row is not given up for it (一篇 left would be a lie of 24px).
        count = rowsIn(spare);
        if (count < documents.length || total > count) count = rowsIn(spare - MORE_HEIGHT);
      }
      const key = `${layout}:${count}`;
      if (!again && String(shown) === key) return;
      shown = /** @type {any} */ (key);
      times = [];
      let group = "";
      const focused = focusKeyIn(list);
      list.replaceChildren(...documents.slice(0, count).flatMap((entry) => {
        const rows = [];
        const next = groupOf(entry.edited, now);
        if (layout === "full" && next !== group) {
          rows.push(made("li", "group", words.groups[/** @type {keyof typeof words.groups} */ (next)]));
          group = next;
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
        return rows;
      }));
      focusKeyed(list, focused);
      const below = Math.max(0, total - count);
      more.hidden = below === 0 || layout === "short";
      more.textContent = below > 0 ? words.more(below) : "";
      retime();
    };
    const watch = typeof ResizeObserver === "function" ? new ResizeObserver(() => fit()) : null;
    watch?.observe(face);
    context.signal?.addEventListener("abort", () => watch?.disconnect(), { once: true });
    let asking = 0; // the last read asked: an older answer that comes after it is dropped
    const read = () => {
      const ticket = ++asking;
      const counted = workspace.query("stats").then(({ data }) => data?.documents ?? null, () => null);
      workspace.query("recent", { limit: LIMIT }).then(async ({ data }) => {
        const all = await counted;
        if (ticket !== asking || context.signal.aborted) return;
        documents = data;
        total = typeof all === "number" ? Math.max(all, data.length) : data.length;
        say(data.length === 0 ? words.empty : null);
        fit(true);
      }, (/** @type {any} */ error) => {
        if (ticket !== asking || context.signal.aborted) return;
        documents = null;
        times = [];
        meta.textContent = "";
        list.replaceChildren();
        more.hidden = true;
        say(error?.code === "offline" ? words.offline : words.failed);
      });
    };
    read();
    return {
      update(reason, detail) {
        if (reason === "data" && detail === "recent") read();
        else if (reason === "clock") retime();
        else if (reason === "layout") fit();
      },
    };
  },
});
