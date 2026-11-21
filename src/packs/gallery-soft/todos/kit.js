// gallery-soft/todos (我的待办, 柔光风格): Gallery 风格's gallery/todos in the soft look, the same logic. The
// to-dos of the workspace's documents (each item of a to-do list, ul.doc-todo), those not done yet, read
// through context.workspace.query("todos") (its manifest's needs hold "workspace"), grouped by document, the
// one edited last first, each group's items in its document's order, each with the headings it stands under.
// Its box checks the item in its document (context.workspace.setTodo: the server writes that document as the
// reader's edit, and the home page's undo checks it back), drawn checked at once, put back with a line saying
// why where the write is refused (the item changed meanwhile, several items alike, one the document's own
// page cannot check, the document being written, no server); an item checked here stays in the list, struck
// through, until the page is shown again, so that a slip is undone where it was made, and its group stays
// where it is (once a box is checked here the groups keep the order they were drawn in, a document new to the
// card first). A click on an item's words opens its document there, at the item's block where it has an id,
// else at the document (context.workspace.open); a click on a group's title opens the document. It reads
// again whenever the workspace says its to-dos changed (the `data` signal, "todos") and when its settings do
// (`source`). Its two settings, the card's form (the grip at its top right › 设置…), are kept in its data part
// `settings`, which the board writes and this block only reads: `document` (a document's slug: its to-dos
// alone) and `done` (the done ones too, checked and struck through). Where the workspace cannot be read (an
// exported file, where it has no server; a server that does not answer) it says so; where nothing writes it
// (an exported file: no setTodo) its boxes are only drawn. The words are the page's language.
//
// Each group's title has its document's icon before it, as the sidebar draws it, read from the documents
// edited last (workspace.query("recent"), the 50 the workspace gives; a document none of them is gets a
// page's picture), drawn from the server's icon route as Gallery's sidebar draws one.
//
// Its face, laid out by its card's size (`context.size`, read again on `layout`; data-w, data-h, data-pad): a
// head of a checked list's chip and 我的待办, at its end how many are done of all (a 4 × 4 card: a small ring
// and 18 / 27; a 4 × 6 card: 共 27 项; an 8 × 4 card: how many are open and in how many documents); a tall card
// under it the share done as a ring with its percent in the middle and a key of the two counts, an 8 × 4 card
// the same down its left side and the groups in two columns beside it; the list of whole rows only (`fit`), a
// muted line under it saying how many more are below (还有 4 项), counted again as it scrolls or the card
// changes size. All done: the ring full in green, 待办都完成了 under it. The face says by `data-state` what it
// shows: items, done (every one done), none or unread.

const WORDS = {
  zh: {
    title: "我的待办",
    empty: "所有文档里的待办会出现在这里",
    emptyHow: "在文档里输入 [] 就是一个待办",
    allDone: "待办都完成了",
    allDoneHow: (/** @type {number} */ count, /** @type {number} */ documents) => `${count} 项，分在 ${documents} 篇文档里`,
    noneIn: "这篇文档里没有待办",
    noneInHow: "在这篇文档里输入 [] 就是一个待办",
    offline: "在 Gallery 里打开时显示待办",
    offlineHow: "导出的文件读不到工作区",
    failed: "读不到工作区的待办",
    failedHow: "文档一有改动就会再读",
    open: (/** @type {string} */ title) => `打开「${title}」`,
    path: (/** @type {string[]} */ path) => path.join(" › "),
    check: "标记为完成",
    uncheck: "标记为未完成",
    done: "已完成",
    left: "没做完",
    share: (/** @type {number} */ done, /** @type {number} */ all) => `${all} 项待办完成了 ${done} 项`,
    all: (/** @type {number} */ count) => `共 ${count} 项`,
    openIn: (/** @type {number} */ count, /** @type {number} */ documents) => [`${count} 项没做完`, `${documents} 篇文档`],
    more: (/** @type {number} */ count) => `还有 ${count} 项`,
    refused: {
      changed: "这一项刚被改过，已重新读取",
      ambiguous: "文档里有几项一样的待办，请在文档里勾选",
      locked: "这一项在文档里是只读的，不能勾选",
      busy: "文档正在被修改，请稍后再勾选",
      offline: "在 Gallery 里打开时才能勾选",
      missing: "找不到这篇文档",
      failed: "没能勾选这一项",
    },
  },
  en: {
    title: "My to-dos",
    empty: "The to-dos of every document will show here",
    emptyHow: "Type [] in a document for a to-do",
    allDone: "Every to-do is done",
    allDoneHow: (/** @type {number} */ count, /** @type {number} */ documents) => `${count} in ${documents} ${documents === 1 ? "document" : "documents"}`,
    noneIn: "This document has no to-dos",
    noneInHow: "Type [] in it for a to-do",
    offline: "Shown when opened in Gallery",
    offlineHow: "An exported file can't read the workspace",
    failed: "The workspace's to-dos could not be read",
    failedHow: "It reads again as soon as a document changes",
    open: (/** @type {string} */ title) => `Open “${title}”`,
    path: (/** @type {string[]} */ path) => path.join(" › "),
    check: "Mark as done",
    uncheck: "Mark as not done",
    done: "Done",
    left: "Open",
    share: (/** @type {number} */ done, /** @type {number} */ all) => `${done} of ${all} to-dos done`,
    all: (/** @type {number} */ count) => `${count} in all`,
    openIn: (/** @type {number} */ count, /** @type {number} */ documents) => [`${count} open`, `${documents} ${documents === 1 ? "document" : "documents"}`],
    more: (/** @type {number} */ count) => `${count} more`,
    refused: {
      changed: "This to-do just changed: read again",
      ambiguous: "The document has several to-dos alike: check it in the document",
      locked: "This to-do is read-only in its document: it cannot be checked",
      busy: "The document is being written: try again in a moment",
      offline: "Open it in Gallery to check it",
      missing: "The document is not there",
      failed: "The to-do could not be checked",
    },
  },
};

/** How far a row may run past the list's bottom and still be whole: the empty bottom of its 28px box, under its 16px box and words. */
const SLACK = 6;

/** How long a line saying why a check was refused stays, in ms. */
const SAID_FOR = 4000;

/** The language the page speaks: the UI's where Gallery says it (data-ge-language), else its lang's. */
function languageOf(/** @type {HTMLElement} */ root) {
  const ui = root.getAttribute("data-ge-language");
  return (ui !== null ? ui === "en" : /^en(?:-|$)/i.test(root.lang)) ? "en" : "zh";
}

/**
 * What the card's settings ask (context.readJSON's, {} where none is set yet): { document, done }, the
 * slug of the one document to read (null: every one) and whether the done ones show too.
 * @param {any} settings
 */
function askedOf(settings) {
  const table = settings !== null && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  return { document: typeof table.document === "string" && table.document ? table.document : null, done: table.done === true };
}

/** @typedef {{ ref: DocTodoRef, text: string, done: boolean, slug: string, title: string, path: string[] }} Todo */

/**
 * An item by its document, its headings and its words: what names it while the card lives, whether it has
 * an id yet or not (its check gives it one).
 * @param {Todo} todo
 */
const itemKey = (todo) => JSON.stringify([todo.slug, todo.path, todo.text]);

/**
 * The control of `list` the keys are on, by the key it carries (data-focus-key), or "": a list drawn anew (a
 * check draws every row again) puts the focus back where it was.
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

/**
 * The to-dos (workspace.query("todos")'s data) as the card shows them, of `asked`: { groups, open,
 * all }, groups [{ slug, title, items }] in the order the documents come (the one edited last first),
 * items those shown (not done, or all with `asked.done`, and the ones checked on this card: `kept`);
 * `open` how many are not done, `all` how many there are of the document asked or of the workspace.
 * `order` (the slugs as drawn before, or null): the groups keep that order, a document not in it before them.
 * @param {Todo[]} todos
 * @param {{ document: string | null, done: boolean }} asked
 * @param {Set<string>} kept
 * @param {string[] | null} [order]
 */
function groupsOf(todos, asked, kept, order = null) {
  const mine = todos.filter((todo) => asked.document === null || todo.slug === asked.document);
  /** @type {Map<string, { slug: string, title: string, items: Todo[] }>} */
  const groups = new Map();
  for (const todo of mine) {
    if (todo.done && !asked.done && !kept.has(itemKey(todo))) continue;
    if (!groups.has(todo.slug)) groups.set(todo.slug, { slug: todo.slug, title: todo.title, items: [] });
    groups.get(todo.slug)?.items.push(todo);
  }
  const placed = [...groups.values()];
  if (order) placed.sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug)); // stable: those not in it keep the order they came in
  return { groups: placed, open: mine.filter((todo) => !todo.done).length, all: mine.length, documents: new Set(mine.map((todo) => todo.slug)).size };
}

/**
 * The line the card says where it shows no item, or null where it shows some: none in the workspace,
 * none in the one document asked, all done.
 * @param {{ groups: unknown[], all: number }} shown
 * @param {{ document: string | null }} asked
 * @param {"zh" | "en"} language
 */
function emptyLine(shown, asked, language) {
  if (shown.groups.length > 0) return null;
  const words = WORDS[language];
  if (shown.all > 0) return words.allDone;
  return asked.document === null ? words.empty : words.noneIn;
}

/** What a document's icon is, as Gallery writes its value: a glyph (/icons/…), a picture of its folder (assets/…), an emoji, or none. @param {string | null | undefined} value */
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
  node.className = `gallery-soft-todos-${kind}`;
  if (text !== undefined) node.textContent = text;
  return node;
}

// The list's picture (the chip's, the empty disc's): on a 16 grid, its line the 1.8 of the others' 24 in proportion (1.2).
const LIST = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="m2.6 4.4 1.1 1.1 1.9-2.1M2.6 10.4l1.1 1.1 1.9-2.1M8 4.5h5.5M8 10.5h5.5"/></svg>';
// A done item's tick in its box: 12px, a line of 1.5px on the screen (a 2 on its 16 grid).
const BOX_TICK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3.25 8.4 3.2 3.2 6.3-7.2"/></svg>';
const line = (/** @type {string} */ paths, /** @type {number} */ width = 1.8) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

/**
 * A ring of `share` (0 to 1) done, `size` px across, its line `stroke` px, what `inner` holds in its middle.
 * @param {number} size
 * @param {number} stroke
 * @param {number} share
 * @param {Node[]} inner
 */
function ringOf(size, stroke, share, inner = []) {
  const ring = made("span", "ring");
  const radius = (size - stroke) / 2;
  const round = 2 * Math.PI * radius;
  ring.style.width = `${size}px`;
  ring.style.height = `${size}px`;
  ring.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true"><circle class="gallery-soft-todos-track" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}"/><circle class="gallery-soft-todos-arc" cx="${size / 2}" cy="${size / 2}" r="${radius}" stroke-width="${stroke}" stroke-dasharray="${(round * share).toFixed(2)} ${round.toFixed(2)}" transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
  ring.append(...inner);
  return ring;
}

/**
 * How much of `all` is done, as a whole percent, as every soft card says it (the to-dos' ring, the stats'
 * bar): rounded, but 100 only when all are done and 0 only when none is (18 of 27: 67; 199 of 200: 99;
 * 1 of 300: 1).
 * @param {number} done
 * @param {number} all
 */
function percentDone(done, all) {
  if (!(all > 0) || !(done > 0)) return 0;
  if (done >= all) return 100;
  return Math.min(99, Math.max(1, Math.round((100 * done) / all)));
}

/** A percent as the ring says it in its middle, its sign small and muted. @param {number} value */
function percentOf(value) {
  const node = made("span", "percent", String(value));
  node.append(made("small", "percent-sign", "%"));
  return node;
}

DocKit.component({
  id: "gallery-soft/todos",
  on: ["source", "data", "layout"],
  mount(host, context) {
    const language = languageOf(document.documentElement);
    const words = WORDS[language];
    const face = made("div", "face");
    const head = made("div", "head");
    const count = made("span", "count");
    const chip = made("span", "chip");
    chip.setAttribute("aria-hidden", "true");
    chip.innerHTML = LIST;
    head.append(chip, made("span", "title", words.title), count);
    // How many are done of all: a ring of the share done and a key of the two counts (a tall or a wide card's).
    const summary = made("div", "summary");
    summary.setAttribute("role", "img");
    const list = made("div", "list");
    const more = made("p", "more");
    const arrow = made("span", "arrow");
    arrow.innerHTML = line('<path d="M12 5v14M6.5 13.5L12 19l5.5-5.5"/>');
    const moreWords = made("span", "more-words");
    more.append(arrow, moreWords);
    more.hidden = true;
    const note = made("p", "note");
    note.hidden = true;
    note.setAttribute("role", "status");
    const empty = made("div", "empty");
    face.append(head, summary, list, more, note, empty);
    host.append(face);
    const workspace = context.workspace;
    if (!workspace) return void context.fail(new Error("its manifest's needs hold \"workspace\": context.workspace is not there"));
    const open = (/** @type {{ slug: string, block?: string | null }} */ target) => workspace.open(target);
    const setTodo = workspace.setTodo;
    const kept = new Set(); // the items checked on this card, shown until the page is shown again
    /** @type {Todo[] | null} */
    let last = null; // what was read last, as drawn (a check drawn into it at once)
    /** @type {{ document: string | null, done: boolean }} */
    let lastAsked = { document: null, done: false };
    /** @type {string[]} */
    let order = []; // the documents of the groups as drawn
    /** @type {string[] | null} */
    let held = null; // that order as it was when the first box was checked here: the groups keep it from then on
    /** @type {Map<string, string | null>} */
    let icons = new Map(); // each document's icon, of those edited last
    let failure = ""; // why nothing could be read, or ""

    let noteTimer = 0;
    const tell = (/** @type {string} */ said) => {
      note.textContent = said;
      note.hidden = false;
      clearTimeout(noteTimer);
      noteTimer = context.timeout(() => { note.hidden = true; }, SAID_FOR);
    };

    // An item's box checked or cleared: drawn so at once, then written in its document; a refusal puts it
    // back, says why and reads again.
    const check = (/** @type {Todo} */ todo) => {
      if (!setTodo || !last) return;
      const done = !todo.done;
      const drawn = { ...todo, done };
      kept.add(itemKey(todo));
      held ??= order;
      last = last.map((one) => (one === todo ? drawn : one));
      draw();
      setTodo(todo.ref, done).catch((/** @type {any} */ error) => {
        if (context.signal.aborted) return;
        if (last?.includes(drawn)) {
          last = last.map((one) => (one === drawn ? todo : one));
          draw();
        }
        const refused = /** @type {Record<string, string>} */ (words.refused);
        tell(refused[error?.code] ?? refused.failed);
        read();
      });
    };

    // A document's icon: its picture from the server's icon route (an emoji too: Twemoji, as the sidebar draws it), a glyph masked, or a page's picture.
    const iconOf = (/** @type {string} */ slug) => {
      const value = icons.get(slug) ?? null;
      const kind = iconKindOf(value);
      const icon = made("span", "icon");
      icon.setAttribute("aria-hidden", "true");
      if (!kind || value === null) {
        icon.classList.add("gallery-soft-todos-plain");
        icon.innerHTML = line('<path d="M7 3.5h10a1.5 1.5 0 0 1 1.5 1.5v14a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M9 8.5h6M9 12h6M9 15.5h3.5"/>');
        return icon;
      }
      const address = `/__gallery/edit/icon?value=${encodeURIComponent(value)}&slug=${encodeURIComponent(slug)}`;
      if (kind === "glyph") {
        icon.classList.add("gallery-soft-todos-glyph");
        icon.style.setProperty("--gallery-soft-todos-icon", `url("${address}")`);
        return icon;
      }
      const picture = document.createElement("img");
      picture.alt = "";
      picture.src = address;
      picture.decoding = "async";
      icon.append(picture);
      return icon;
    };

    // How many items are below what the list shows (one cut off counted), said under it, or nothing.
    const recount = () => {
      const bottom = list.scrollTop + list.clientHeight;
      let below = 0;
      for (const item of /** @type {NodeListOf<HTMLElement>} */ (list.querySelectorAll(".gallery-soft-todos-item"))) if (item.offsetTop + item.offsetHeight > bottom + SLACK) below++;
      const said = below > 0 ? words.more(below) : "";
      if (moreWords.textContent !== said) moreWords.textContent = said;
      more.hidden = below === 0;
    };
    // The list as high as the whole rows that fit the room it has (the line of more under it where they are
    // not all shown): its height the bottom of the last item no row or group's title is cut at.
    const fit = () => {
      list.style.maxHeight = "";
      more.hidden = true;
      if (list.clientHeight === 0 || list.scrollHeight <= list.clientHeight + 1) return void recount();
      moreWords.textContent = words.more(0);
      more.hidden = false;
      const room = list.clientHeight;
      const rows = /** @type {HTMLElement[]} */ ([...list.querySelectorAll(".gallery-soft-todos-item, .gallery-soft-todos-group-head")]);
      const bottoms = rows.filter((row) => row.classList.contains("gallery-soft-todos-item")).map((row) => row.offsetTop + row.offsetHeight).filter((bottom) => bottom <= room + SLACK).sort((a, b) => b - a);
      const whole = bottoms.find((bottom) => rows.every((row) => !(row.offsetTop < bottom - 0.5 && row.offsetTop + row.offsetHeight > bottom + 0.5)));
      if (whole !== undefined && whole < room) list.style.maxHeight = `${whole}px`;
      recount();
    };
    list.addEventListener("scroll", recount, { passive: true });
    const watch = typeof ResizeObserver === "function" ? new ResizeObserver(() => fit()) : null;
    watch?.observe(face);
    context.signal?.addEventListener("abort", () => {
      list.removeEventListener("scroll", recount);
      watch?.disconnect();
    }, { once: true });

    // The empty face: a soft disc with the list's picture (or the ring full, all done), a line and what to do.
    const showEmpty = (/** @type {string} */ said, /** @type {string} */ how, /** @type {"plain" | "bad" | "done"} */ look) => {
      const disc = look === "done" ? ringOf(88, 8, 1, [percentOf(100)]) : made("span", "disc");
      if (look === "done") disc.classList.add("gallery-soft-todos-full");
      else disc.innerHTML = LIST;
      disc.classList.toggle("gallery-soft-todos-bad", look === "bad");
      empty.replaceChildren(disc, made("p", "line", said), ...(how ? [made("p", "how", how)] : []));
    };

    // The list drawn anew of what was read, scrolled where it was.
    const draw = () => {
      const { w, h, pad } = sizeOf(context.size, [4, 4]);
      const wide = w >= 6;
      const tall = !wide && h >= 6;
      Object.assign(face.dataset, { w: String(w), h: String(h), pad, layout: wide ? "wide" : tall ? "tall" : "square" });
      if (!last) {
        face.dataset.state = failure ? "unread" : "none";
        count.replaceChildren();
        summary.replaceChildren();
        list.replaceChildren();
        if (failure) showEmpty(failure === "offline" ? words.offline : words.failed, failure === "offline" ? words.offlineHow : words.failedHow, failure === "offline" ? "plain" : "bad");
        else empty.replaceChildren();
        return fit();
      }
      const asked = lastAsked;
      const shown = groupsOf(last, asked, kept, held);
      order = shown.groups.map((group) => group.slug);
      const top = list.scrollTop;
      const focused = focusKeyIn(list);
      const done = shown.all - shown.open;
      const share = shown.all > 0 ? done / shown.all : 0;
      const percent = () => [percentOf(percentDone(done, shown.all))];
      face.dataset.state = shown.groups.length > 0 ? "items" : shown.all > 0 ? "done" : "none";
      // The head's end: how many are done of all, as the card's size says it.
      if (shown.all === 0) count.replaceChildren();
      else if (face.dataset.state !== "items" || tall) count.replaceChildren(words.all(shown.all));
      else if (wide) {
        const [left, documents] = words.openIn(shown.open, shown.groups.length);
        count.replaceChildren(left, made("span", "dot"), documents);
      } else count.replaceChildren(ringOf(18, 3, share), made("b", "done-count", String(done)), made("span", "of", `/ ${shown.all}`));
      summary.setAttribute("aria-label", words.share(done, shown.all));
      if (face.dataset.state === "items" && (tall || wide)) {
        const key = made("dl", "key");
        for (const [kind, name, value] of [["done", words.done, done], ["left", words.left, shown.open]]) {
          const row = made("div", "key-row");
          row.dataset.kind = String(kind);
          const term = made("dt", "key-name");
          term.append(made("i", "key-dot"), String(name));
          row.append(term, made("dd", "key-count", String(value)));
          key.append(row);
        }
        summary.replaceChildren(wide ? ringOf(100, 9, share, percent()) : ringOf(64, 7, share, percent()), key);
      } else summary.replaceChildren();
      list.replaceChildren(...shown.groups.map((group) => {
        const section = made("section", "group");
        const title = made("div", "group-head");
        const name = made("button", "doc", group.title);
        name.type = "button";
        name.setAttribute("data-doc-tip-cut", ""); // the document's whole title, where it is cut
        name.dataset.focusKey = `doc:${group.slug}`;
        name.addEventListener("click", () => open({ slug: group.slug }));
        title.append(iconOf(group.slug), name, made("span", "group-count", String(group.items.length)));
        const items = made("ul", "items");
        for (const todo of group.items) {
          const item = made("li", "item");
          if (todo.done) item.classList.add("gallery-soft-todos-done");
          const button = made("button", "todo");
          button.type = "button";
          button.dataset.focusKey = `todo:${itemKey(todo)}`;
          const text = made("span", "text", todo.text);
          text.setAttribute("data-doc-tip-cut", ""); // the to-do's own words, where they are cut
          if (setTodo) {
            const box = made("button", "check");
            box.type = "button";
            box.setAttribute("role", "checkbox");
            box.setAttribute("aria-checked", String(todo.done));
            box.dataset.docTip = todo.done ? words.uncheck : words.check;
            box.dataset.focusKey = `check:${itemKey(todo)}`;
            box.setAttribute("aria-label", `${todo.done ? words.uncheck : words.check}: ${todo.text}`);
            const mark = made("span", "box");
            mark.innerHTML = BOX_TICK;
            box.append(mark);
            box.addEventListener("click", (event) => {
              event.stopPropagation();
              check(todo);
            });
            item.append(box);
            button.append(text);
          } else {
            const mark = made("span", "box");
            mark.innerHTML = BOX_TICK;
            button.append(mark, text);
          }
          // Its headings, but for the document's title the group's title above says (its first heading, as often); a wide card's two columns leave them out.
          const path = todo.path[0] === group.title ? todo.path.slice(1) : todo.path;
          if (path.length > 0 && !wide) button.append(made("span", "path", words.path(path)));
          button.addEventListener("click", () => open({ slug: todo.ref.slug, block: todo.ref.block }));
          item.append(button);
          items.append(item);
        }
        section.append(title, items);
        return section;
      }));
      list.scrollTop = top;
      focusKeyed(list, focused);
      const said = emptyLine(shown, asked, language);
      if (said === null) empty.replaceChildren();
      else if (shown.all > 0) showEmpty(said, words.allDoneHow(shown.all, shown.documents), "done");
      else showEmpty(said, asked.document === null ? words.emptyHow : words.noneInHow, "plain");
      fit();
    };

    let asking = 0; // the last read asked: an older answer that comes after it is dropped
    const read = () => {
      const settings = context.readJSON("settings");
      if (settings === undefined) return; // no JSON: the instance has failed, and Gallery shows what it holds
      const asked = askedOf(settings);
      const ticket = ++asking;
      workspace.query("todos", { limit: 1000, ...(asked.document ? { slugs: [asked.document] } : {}) }).then(({ data }) => {
        if (ticket !== asking || context.signal.aborted) return;
        last = data;
        lastAsked = asked;
        failure = "";
        draw();
      }, (/** @type {any} */ error) => {
        if (ticket !== asking || context.signal.aborted) return;
        last = null;
        failure = error?.code === "offline" ? "offline" : "failed";
        draw();
      });
    };
    // The documents' icons, of those edited last: none where they cannot be read.
    const readIcons = () => {
      workspace.query("recent", { limit: 50 }).then(({ data }) => {
        if (context.signal.aborted) return;
        icons = new Map(data.map((entry) => [entry.slug, entry.icon]));
        if (last) draw();
      }, () => {});
    };
    read();
    readIcons();
    return {
      update(reason, detail) {
        if (reason === "source" || (reason === "data" && detail === "todos")) read();
        else if (reason === "data" && detail === "recent") readIcons();
        else if (reason === "layout") draw();
      },
    };
  },
});
