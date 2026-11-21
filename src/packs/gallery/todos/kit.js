// gallery/todos (我的待办): the to-dos of the workspace's documents (each item of a to-do list, ul.doc-todo),
// those not done yet, read through context.workspace.query("todos") (its manifest's needs hold
// "workspace"), grouped by document, the one edited last first, each group's items in its document's
// order, each with the headings it stands under. Its box checks the item in its document
// (context.workspace.setTodo: the server writes that document as the reader's edit, and the home page's
// undo checks it back), drawn checked at once, put back with a line saying why where the write is refused
// (the item changed meanwhile, several items alike, one the document's own page cannot check, the document
// being written, no server); an item checked here stays in the list, struck through, until the page is shown
// again, so that a slip is undone where it was made, and its group stays where it is (the document the box
// wrote is the one edited last, which the facts would put first: once a box is checked here the groups keep
// the order they were drawn in, a document new to the card first). A click on an item's words opens its
// document there, at the item's block where it has an id, else at the document (context.workspace.open:
// the workbench goes there); a click on a group's title opens the document. It reads again whenever the
// workspace says its to-dos changed (the `data` signal, "todos": a to-do added, checked or taken out in any
// document, a document renamed or gone) and when its settings do (`source`). Its two settings, the card's
// form (the grip at its top right › 设置…), are kept in its data part `settings`, which the board writes and
// this block only reads: `document` (a document's slug: its to-dos alone) and `done` (the done ones too,
// checked and struck through). Where the workspace cannot be read (an exported file, where it has no
// server; a server that does not answer) it says so; where nothing writes it (an exported file: no
// setTodo) its boxes are only drawn. The words are the page's language (the UI's where Gallery says it,
// else the page's lang).
//
// Its face (in the kit's card tokens), laid out by the card's cells (`data-layout`, by
// context.size, read again on `layout`): a head of the chip (a checked list), 我的待办 and its quiet meta;
// how many are done of all (of the document asked, or of every one); and the list, grouped under each
// document's icon and title (small, gray, its open count after it), each item a box, its words and, under
// them (beside them on a wide card), the headings it stands under, faint, but for the document's own
// title (its first heading, as often), which the group's says; the list fades at its foot while there is
// more under it. The share done is drawn by the room: on a 4 × 4 card ("default") a line (已完成 19 / 27,
// the percent at its end) over a row of ticks, one an item (a bar past 48); on a 4 × 6 ("tall") a ring
// of the share, its percent in the middle, beside the open count large (8 项没完成) and 已完成 19 / 27; on
// an 8 × 4 ("wide") a ring at the left over a key (已完成, 未完成, 来自文档). The head's meta says how many are
// open (8 项; 来自 4 篇文档 on a tall card). The face says by `data-state` what it shows: items, every one
// done (a full green ring with a tick, 待办都完成了), none, or the workspace not read.

const WORDS = {
  zh: {
    title: "我的待办",
    empty: ["还没有待办", "所有文档里的待办会出现在这里", "在文档里输入 [] 就能新建一项"],
    noneIn: ["这篇文档里没有待办", "在文档里输入 [] 就能新建一项"],
    allDone: "待办都完成了",
    allDoneSaid: (/** @type {number} */ all) => `${all} 项，全都勾掉了`,
    offline: ["在 Gallery 里打开时显示", "现在读不到工作区"],
    failed: ["读不到工作区的待办", "过一会儿会再读"],
    open: (/** @type {string} */ title) => `打开「${title}」`,
    path: (/** @type {string[]} */ path) => path.join(" › "),
    check: "标记为完成",
    uncheck: "标记为未完成",
    done: "已完成",
    left: "未完成",
    from: "来自文档",
    progress: (/** @type {number} */ done, /** @type {number} */ all) => ["已完成 ", String(done), ` / ${all}`],
    openUnit: "项没完成",
    share: (/** @type {number} */ done, /** @type {number} */ all) => `${all} 项待办完成了 ${done} 项`,
    openCount: (/** @type {number} */ count) => `${count} 项`,
    all: (/** @type {number} */ count) => `共 ${count} 项`,
    documents: (/** @type {number} */ count) => `来自 ${count} 篇文档`,
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
    empty: ["No to-dos yet", "The to-dos of every document show here", "Type [] in a document to make one"],
    noneIn: ["This document has no to-dos", "Type [] in it to make one"],
    allDone: "Every to-do is done",
    allDoneSaid: (/** @type {number} */ all) => `All ${all} checked off`,
    offline: ["Shown when opened in Gallery", "The workspace cannot be read now"],
    failed: ["The workspace's to-dos could not be read", "It reads them again in a while"],
    open: (/** @type {string} */ title) => `Open “${title}”`,
    path: (/** @type {string[]} */ path) => path.join(" › "),
    check: "Mark as done",
    uncheck: "Mark as not done",
    done: "Done",
    left: "Open",
    from: "Documents",
    progress: (/** @type {number} */ done, /** @type {number} */ all) => ["", String(done), ` of ${all} done`],
    openUnit: "open",
    share: (/** @type {number} */ done, /** @type {number} */ all) => `${done} of ${all} to-dos done`,
    openCount: (/** @type {number} */ count) => `${count} open`,
    all: (/** @type {number} */ count) => `${count} in all`,
    documents: (/** @type {number} */ count) => `from ${count} ${count === 1 ? "document" : "documents"}`,
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

/** How long a line saying why a check was refused stays, in ms. */
const SAID_FOR = 4000;
/** The most items the ticks draw one each; past them, a bar. */
const MOST_TICKS = 48;

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

/** @typedef {{ ref: DocTodoRef, text: string, done: boolean, slug: string, title: string, icon?: string | null, path: string[] }} Todo */

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
 * all, documents }, groups [{ slug, title, icon, items }] in the order the documents come (the one edited
 * last first), items those shown (not done, or all with `asked.done`, and the ones checked on this card:
 * `kept`); `open` how many are not done, `all` how many there are of the document asked or of the
 * workspace, `documents` how many documents hold one open. `order` (the slugs as drawn before, or null):
 * the groups keep that order, a document not in it before them.
 * @param {Todo[]} todos
 * @param {{ document: string | null, done: boolean }} asked
 * @param {Set<string>} kept
 * @param {string[] | null} [order]
 */
function groupsOf(todos, asked, kept, order = null) {
  const mine = todos.filter((todo) => asked.document === null || todo.slug === asked.document);
  /** @type {Map<string, { slug: string, title: string, icon: string | null, items: Todo[] }>} */
  const groups = new Map();
  for (const todo of mine) {
    if (todo.done && !asked.done && !kept.has(itemKey(todo))) continue;
    if (!groups.has(todo.slug)) groups.set(todo.slug, { slug: todo.slug, title: todo.title, icon: todo.icon ?? null, items: [] });
    groups.get(todo.slug)?.items.push(todo);
  }
  const placed = [...groups.values()];
  if (order) placed.sort((a, b) => order.indexOf(a.slug) - order.indexOf(b.slug)); // stable: those not in it keep the order they came in
  return { groups: placed, open: mine.filter((todo) => !todo.done).length, all: mine.length, documents: new Set(mine.filter((todo) => !todo.done).map((todo) => todo.slug)).size };
}

/**
 * What the card says where it shows no item, or null where it shows some: none in the workspace, none in
 * the one document asked, all done.
 * @param {{ groups: unknown[], all: number }} shown
 * @param {{ document: string | null }} asked
 * @param {"zh" | "en"} language
 */
function emptyLine(shown, asked, language) {
  if (shown.groups.length > 0) return null;
  const words = WORDS[language];
  if (shown.all > 0) return words.allDone;
  return asked.document === null ? words.empty[1] : words.noneIn[0];
}

/** What a document's icon is, as Gallery writes its value: a glyph (/icons/…), a picture of its folder (assets/…), an emoji, or none. @param {string | null | undefined} value */
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
  node.className = `gallery-todos-${kind}`;
  if (text !== undefined) node.textContent = text;
  return node;
}

// A document's icon, as the sidebar draws it: its picture from the server's icon route, a glyph masked
// in the muted color, or none (style.css draws a page).
function iconFor(/** @type {string} */ slug, /** @type {string | null} */ value) {
  const kind = iconKindOf(value);
  const icon = made("span", "icon");
  icon.setAttribute("aria-hidden", "true");
  if (!kind || value === null) return icon;
  const address = `/__gallery/edit/icon?value=${encodeURIComponent(value)}&slug=${encodeURIComponent(slug)}`;
  if (kind === "glyph") {
    icon.classList.add("gallery-todos-glyph");
    icon.style.setProperty("--gallery-todos-icon", `url("${address}")`);
    return icon;
  }
  const picture = document.createElement("img");
  picture.alt = "";
  picture.src = address;
  picture.decoding = "async";
  icon.classList.add("gallery-todos-picture");
  icon.append(picture);
  return icon;
}

// The list's picture (the chip's, the empty face's): on a 16 grid, its line the 1.9 of the other cards' 24 in proportion (1.27).
const CHIP = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.27" stroke-linecap="round" stroke-linejoin="round"><path d="m2.6 4.4 1.1 1.1 1.9-2.1M2.6 10.4l1.1 1.1 1.9-2.1M8 4.5h5.5M8 10.5h5.5"/></svg>';
// A done item's tick in its box: 12px, a line of 1.5px on the screen (a 2 on its 16 grid).
const BOX_TICK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3.25 8.4 3.2 3.2 6.3-7.2"/></svg>';
const TICK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5.5 12.5l4 4 9-9"/></svg>';

DocKit.component({
  id: "gallery/todos",
  on: ["source", "data", "layout"],
  mount(host, context) {
    const language = languageOf(document.documentElement);
    const words = WORDS[language];
    const face = made("div", "face");
    const head = made("div", "head");
    const count = made("span", "count");
    const chip = made("span", "chip");
    chip.setAttribute("aria-hidden", "true");
    chip.innerHTML = CHIP;
    head.append(chip, made("span", "title", words.title), count);
    // How many are done of all: a line and its ticks, a ring and its percent, the open count large, a key.
    const summary = made("div", "summary");
    summary.hidden = true;
    summary.setAttribute("role", "img");
    const progress = made("p", "progress");
    const progressWords = made("span", "progress-words");
    const sharePercent = made("span", "share");
    progress.append(progressWords, sharePercent);
    const ticks = made("span", "ticks");
    ticks.setAttribute("aria-hidden", "true");
    const ring = made("span", "ring");
    ring.innerHTML = '<svg aria-hidden="true"><circle class="gallery-todos-track"/><circle class="gallery-todos-arc" pathLength="100"/></svg><span class="gallery-todos-percent"></span>';
    const percent = /** @type {HTMLElement} */ (ring.querySelector(".gallery-todos-percent"));
    const big = made("div", "big");
    const bigLine = made("p", "big-line");
    const openNumber = made("span", "open");
    bigLine.append(openNumber, made("span", "open-unit", words.openUnit));
    const bigDone = made("p", "big-done");
    big.append(bigLine, bigDone);
    const key = made("dl", "key");
    const keyRow = (/** @type {string} */ kind, /** @type {string} */ name) => {
      const row = made("div", "key-row");
      row.dataset.kind = kind;
      const value = made("dd", "key-count");
      row.append(made("dt", "key-name", name), value);
      key.append(row);
      return value;
    };
    const doneCount = keyRow("done", words.done);
    const leftCount = keyRow("left", words.left);
    const fromCount = keyRow("from", words.from);
    summary.append(progress, ticks, ring, big, key);
    const list = made("div", "list");
    // Where it shows no item: the cards' empty face (a soft square with the list's picture, or the full ring).
    const empty = made("div", "empty");
    const emptyPicture = made("span", "empty-picture");
    emptyPicture.setAttribute("aria-hidden", "true");
    const line = made("p", "line");
    const hint = made("p", "hint");
    empty.append(emptyPicture, line, hint);
    empty.hidden = true;
    const note = made("p", "note");
    note.hidden = true;
    note.setAttribute("role", "status");
    face.append(head, summary, list, empty, note);
    host.append(face);
    // The list fades at its foot while there is more under it.
    const fade = () => list.toggleAttribute("data-more", list.scrollHeight - list.scrollTop - list.clientHeight > 1);
    list.addEventListener("scroll", fade, { passive: true });
    context.signal?.addEventListener("abort", () => list.removeEventListener("scroll", fade), { once: true });
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

    const layoutOf = () => {
      const size = context.size;
      return !size ? "default" : size.w >= 8 ? "wide" : size.h >= 6 ? "tall" : "default";
    };
    // A ring of `size` px, its stroke `width` px, the share done (`share`, 0 to 1).
    const drawRing = (/** @type {number} */ size, /** @type {number} */ width, /** @type {number} */ share) => {
      const svg = /** @type {SVGSVGElement} */ (ring.querySelector("svg"));
      svg.setAttribute("viewBox", `0 0 ${size} ${size}`);
      svg.setAttribute("width", String(size));
      svg.setAttribute("height", String(size));
      for (const circle of svg.querySelectorAll("circle")) {
        circle.setAttribute("cx", String(size / 2));
        circle.setAttribute("cy", String(size / 2));
        circle.setAttribute("r", String((size - width) / 2));
        circle.setAttribute("stroke-width", String(width));
      }
      svg.querySelector(".gallery-todos-arc")?.setAttribute("stroke-dasharray", `${Math.max(0, Math.min(1, share)) * 100} 100`);
    };
    // The empty face: its words, and its picture (the list's, or the full green ring with a tick).
    const sayEmpty = (/** @type {string[] | null} */ said, /** @type {"list" | "done"} */ picture = "list") => {
      empty.hidden = said === null;
      list.hidden = said !== null;
      if (said === null) return;
      empty.dataset.picture = picture;
      emptyPicture.innerHTML = picture === "done" ? `<svg viewBox="0 0 72 72"><circle class="gallery-todos-done-ring" cx="36" cy="36" r="32.5"/></svg>${TICK}` : CHIP;
      line.textContent = said[0];
      hint.replaceChildren(...said.slice(1).flatMap((piece, index) => (index === 0 ? [piece] : [document.createElement("br"), piece])));
    };
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

    // The list drawn anew of what was read, scrolled where it was.
    const draw = () => {
      const layout = layoutOf();
      face.dataset.layout = layout;
      if (!last) return;
      const asked = lastAsked;
      const shown = groupsOf(last, asked, kept, held);
      order = shown.groups.map((group) => group.slug);
      const top = list.scrollTop;
      const focused = focusKeyIn(list);
      const done = shown.all - shown.open;
      const allDone = shown.groups.length === 0 && shown.all > 0;
      count.textContent = shown.all === 0 ? "" : allDone ? words.all(shown.all) : layout === "tall" ? words.documents(shown.documents) : words.openCount(shown.open);
      // The summary of all the to-dos asked (of one document, or of every one), none where there are none.
      summary.hidden = shown.all === 0 || allDone;
      summary.setAttribute("aria-label", words.share(done, shown.all));
      const share = shown.all > 0 ? done / shown.all : 0;
      const whole = shown.all > 0 ? String(Math.floor(100 * share)) : "";
      const [before, middle, after] = words.progress(done, shown.all);
      const bold = document.createElement("b");
      bold.textContent = middle;
      progressWords.replaceChildren(before, bold, after);
      sharePercent.textContent = shown.all > 0 ? `${whole}%` : "";
      const value = made("span", "percent-value", whole);
      value.append(made("span", "percent-sign", "%"));
      percent.replaceChildren(value);
      drawRing(layout === "wide" ? 96 : 64, layout === "wide" ? 9 : 7, share);
      openNumber.textContent = String(shown.open);
      const [doneBefore, doneMiddle, doneAfter] = words.progress(done, shown.all);
      bigDone.textContent = `${doneBefore}${doneMiddle}${doneAfter}`;
      doneCount.textContent = String(done);
      leftCount.textContent = String(shown.open);
      fromCount.textContent = String(shown.documents);
      // A tick an item (done first), or one bar past MOST_TICKS.
      if (shown.all > MOST_TICKS) {
        const on = made("i", "tick");
        on.classList.add("gallery-todos-on");
        on.style.flex = String(done);
        const off = made("i", "tick");
        off.style.flex = String(shown.open);
        ticks.replaceChildren(on, off);
      } else {
        ticks.replaceChildren(...Array.from({ length: shown.all }, (_, index) => {
          const tick = made("i", "tick");
          tick.classList.toggle("gallery-todos-on", index < done);
          return tick;
        }));
      }
      face.dataset.state = shown.groups.length > 0 ? "items" : shown.all > 0 ? "done" : "none";
      list.replaceChildren(...shown.groups.map((group) => {
        const section = made("section", "group");
        const title = made("div", "group-head");
        const doc = made("button", "doc");
        doc.type = "button";
        doc.setAttribute("data-doc-tip-cut", ""); // the document's whole title, where it is cut
        doc.dataset.focusKey = `doc:${group.slug}`;
        doc.append(iconFor(group.slug, group.icon), group.title);
        doc.addEventListener("click", () => open({ slug: group.slug }));
        title.append(doc, made("span", "group-count", String(group.items.filter((todo) => !todo.done).length)));
        const items = made("ul", "items");
        for (const todo of group.items) {
          const item = made("li", "item");
          const button = made("button", "todo");
          button.type = "button";
          if (todo.done) {
            button.classList.add("gallery-todos-done");
            item.classList.add("gallery-todos-done");
          }
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
            const square = made("span", "box");
            if (todo.done) square.innerHTML = BOX_TICK;
            box.append(square);
            box.addEventListener("click", (event) => {
              event.stopPropagation();
              check(todo);
            });
            item.append(box);
            button.append(text);
          } else {
            const square = made("span", "box");
            if (todo.done) square.innerHTML = BOX_TICK;
            item.append(square);
            button.append(text);
          }
          // Its headings, but for the document's title the group's title above says (its first heading, as often).
          const path = todo.path[0] === group.title ? todo.path.slice(1) : todo.path;
          if (path.length > 0) button.append(made("span", "path", words.path(path)));
          button.addEventListener("click", () => open({ slug: todo.ref.slug, block: todo.ref.block }));
          item.append(button);
          items.append(item);
        }
        section.append(title, items);
        return section;
      }));
      list.scrollTop = top;
      focusKeyed(list, focused);
      if (shown.groups.length > 0) sayEmpty(null);
      else if (shown.all > 0) sayEmpty([words.allDone, words.allDoneSaid(shown.all)], "done");
      else sayEmpty(asked.document === null ? words.empty : words.noneIn);
      fade();
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
        draw();
      }, (/** @type {any} */ error) => {
        if (ticket !== asking || context.signal.aborted) return;
        last = null;
        count.textContent = "";
        summary.hidden = true;
        face.dataset.state = "unread";
        list.replaceChildren();
        sayEmpty(error?.code === "offline" ? words.offline : words.failed);
      });
    };
    read();
    return {
      update(reason, detail) {
        if (reason === "source" || (reason === "data" && detail === "todos")) read();
        else if (reason === "layout") draw();
      },
    };
  },
});
