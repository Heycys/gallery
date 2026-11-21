// gallery/kanban (看板): a view of a table of the document (its manifest's needs hold "tables"; the table's
// frame carries the key its data-doc-from names, which a board made from "/" takes from the table above it). Each row of the
// table is a card, grouped by a column (its settings' `group`, else the column that reads as a status: one
// named 状态, 进度, 阶段, status…, else the one after the first whose words repeat most), the groups in
// the order its settings' `order` lists (empty ones too), then any other value as the rows first say it,
// the cards of a group in the table's order, each group's head a dot of the kit's series colors in that
// order (the rows of no value a gray one). A card is its row's first cell, the other cells' words under
// it, and a chip for each link its row holds: one to a document opens it (context.workspace.open: the
// workbench goes there), one to the web a new tab.
//
// The table is the file's whole truth and the reader's: the board writes nothing of its own but its
// settings. Each gesture asks the page editor through context.table(), one intent, one undo step: a card
// dragged (DocKit.drag) to another place of its group moves its row, to another group moves it and sets
// its cell of the grouping column in the same step (set alone where the group has no other card); the +
// at a group's head adds a row after the group's last, its cell of the group set, and puts the caret in
// its title; a card's 🗑 takes the row out. The words drawn from a cell are typed in where they stand
// (DocKit.text: the light accent fill under the pointer, as a figure's words; the user, 2026-11-20), each
// its cell: a card's title its first cell, the words under it theirs; a group's name each cell of its
// rows (one step, its place in the settings' order with it: table().set(rows, …, { editJSON }); typed as
// another group's name, the two are one; typed empty, nothing). A cell holding more than words (a link,
// a mark) is not typed in here, which would write it as plain words: the table has it. Where the table
// can take no change (an export, 演示视图, before the page edits, a table the editor's tools do not
// manage: table().canEdit()) the board only shows, and says why where the page edits. Its settings are
// its own data part (`settings`, JSON), changed by the ⚙ at its head (分组依据, which takes the order of
// the groups off, as that named the values of the column grouped by before), one undo step each.
//
// A card is kept while its row's element is in the table, and drawn again in place only where its row is
// another object (context.table() gives a row anew only once it or the header changed), its words set
// (DocKit.text's set: what the reader is typing there stays) and its props, its chips made again as they
// changed: so that a keystroke in a table of 500 rows draws one card again and makes none, and someone
// else's write of a row whose words the reader is typing in leaves them typing (a card made anew would
// lose what they typed, and its words leaving the page would commit half of it). A card moved to another
// group while its words are typed in gets the caret back where it was. The words are the page's language.

const WORDS = {
  zh: {
    by: (/** @type {string} */ name) => `按“${name}”分组`,
    group: "分组依据",
    settings: "设置",
    none: "（空）",
    untitled: "无标题",
    add: "新建卡片",
    remove: "删除",
    open: "打开",
    cards: (/** @type {number} */ count) => `${count} 张卡片`,
    unbound: "这个看板还没有接到表格上：在它的菜单里选“设置…”，选一张表格。",
    unread: "读不到这个看板的表格：它不在页面上了，或者有合并的单元格。",
    missing: (/** @type {string} */ name) => `找不到列“${name}”：表格的列名改过了吗？`,
    readOnly: "这张表格有表尾，或者各行的格数不一样，看板改不了它，这里只能看。",
    empty: "表格里还没有行。",
  },
  en: {
    by: (/** @type {string} */ name) => `Grouped by “${name}”`,
    group: "Group by",
    settings: "Settings",
    none: "(empty)",
    untitled: "Untitled",
    add: "New card",
    remove: "Delete",
    open: "Open",
    cards: (/** @type {number} */ count) => `${count} cards`,
    unbound: "This board reads no table yet: pick Settings… in its menu and choose a table.",
    unread: "This board's table cannot be read: it is not on the page, or it has merged cells.",
    missing: (/** @type {string} */ name) => `No column “${name}”: was the table's column renamed?`,
    readOnly: "This table has a footer, or rows of other lengths: the board cannot change it, only show it.",
    empty: "The table has no rows yet.",
  },
};

// A column whose name says it is a status, the one a board groups by when its settings name none.
const STATUS = /状态|進度|进度|阶段|階段|状況|状况|status|stage|state|phase/i;

// How far off the groups a card held is still over them, in pixels.
const MARGIN = 24;

// The icons of a card's tool, a group's + and the head's settings (16 × 16, the kit's line weight).
const ICONS = {
  gear: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4.5h6M12 4.5h1M3 11.5h1M7 11.5h6" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="10.5" cy="4.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><circle cx="5.5" cy="11.5" r="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>',
  remove: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 4.5h9M6.5 4.5V3h3v1.5M5 4.5l.6 8h4.8l.6-8" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" stroke-linecap="round"/></svg>',
  page: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2.5h4.5l2.5 2.5v8.5h-7z" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  web: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.5 3.5h-3v9h9v-3M9 3h4v4M13 3L7.5 8.5" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  add: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3.5v9M3.5 8h9" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
};

/** The language the page speaks: the UI's where Gallery says it (data-ge-language), else its lang's. */
function languageOf(/** @type {HTMLElement} */ root) {
  const ui = root.getAttribute("data-ge-language");
  return (ui !== null ? ui === "en" : /^en(?:-|$)/i.test(root.lang)) ? "en" : "zh";
}

/** Words as a cell shows them, its white space one space. */
const wordsOf = (/** @type {Node | null | undefined} */ node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();

/** Whether a cell holds words alone (no link, no mark), which typing over them where the board shows them writes as they were. */
const plain = (/** @type {Element | undefined} */ cell) => Boolean(cell) && /** @type {Element} */ (cell).childElementCount === 0;

/** A row's value of a column as the board groups by it: its words ("" for none). */
const keyOf = (/** @type {DocRow} */ row, /** @type {string} */ column) => {
  const value = row.values[column];
  return value === null || value === undefined ? "" : String(value).trim();
};

/**
 * What its settings ask (context.readJSON's; {} where none is set): the column to group by ("" for the
 * one it finds) and the order of the groups.
 * @param {any} settings
 */
function askedOf(settings) {
  const table = settings !== null && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const group = typeof table.group === "string" ? table.group.trim() : "";
  const order = typeof table.order === "string" ? table.order.split(/[,，、]/).map((name) => name.trim()).filter(Boolean) : [];
  return { group, order };
}

/**
 * The order of the groups (its settings' `order`, as written) with the group `from` named `to`: in its
 * place, or gone where `to` is listed already (the two groups one) or holds a comma the order would split
 * it at (、 , ，: the order can name no such group; it comes after those it names, as one it does not list),
 * written with the comma it was; null where it does not list `from`.
 * @param {unknown} written
 * @param {string} from
 * @param {string} to
 */
function orderRenamed(written, from, to) {
  if (typeof written !== "string") return null;
  const names = written.split(/[,，、]/).map((name) => name.trim()).filter(Boolean);
  if (!names.includes(from)) return null;
  const comma = /[,，、]/.exec(written)?.[0] ?? ",";
  const renamed = names.includes(to) || /[,，、]/.test(to) ? names.filter((name) => name !== from) : names.map((name) => (name === from ? to : name));
  return renamed.join(comma);
}

/**
 * The column a board of `table` groups by when its settings name none: one whose name says it is a
 * status, else the column after the first holding words (not numbers) whose values repeat most (the
 * fewest of them), else the second, else the first.
 * @param {DocTableView} table
 */
function groupColumnOf(table) {
  const [first = null, ...rest] = table.columns;
  if (rest.length === 0) return first;
  const named = rest.find((name) => STATUS.test(name));
  if (named) return named;
  /** @type {[string, number] | null} */
  let best = null;
  for (const name of rest) {
    if (table.rows.some((row) => typeof row.values[name] === "number")) continue;
    const kinds = new Set(table.rows.map((row) => keyOf(row, name))).size;
    if (best === null || kinds < best[1]) best = [name, kinds];
  }
  return best ? best[0] : rest[0];
}

/**
 * An element of the board, of `kind` (its class gallery-kanban-<kind>).
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {string} kind
 * @param {string} [text]
 */
function made(tag, kind, text) {
  const node = document.createElement(tag);
  node.className = `gallery-kanban-${kind}`;
  if (text !== undefined) node.textContent = text;
  return node;
}

/**
 * A button of an icon and its words for whoever cannot see it (the kit's tooltip shows them under the pointer).
 * @param {string} kind
 * @param {string} icon
 * @param {string} label
 */
function iconButton(kind, icon, label) {
  const button = made("button", kind);
  button.type = "button";
  button.dataset.docTip = label;
  button.setAttribute("aria-label", label);
  button.innerHTML = icon;
  return button;
}

/**
 * `parent`'s children made `nodes`, what is there already left in place: where only some are new, each
 * standing where the one it replaces stood, those alone are put in (a keystroke in the table changes one
 * card, and the page lays out that much); anything else is the list anew.
 * @param {Element} parent
 * @param {Element[]} nodes
 */
function put(parent, nodes) {
  const now = [...parent.children];
  if (now.length === nodes.length) {
    const differs = nodes.map((node, at) => node !== now[at]);
    if (!differs.includes(true)) return;
    if (nodes.every((node, at) => !differs[at] || !node.isConnected)) {
      nodes.forEach((node, at) => { if (differs[at]) parent.replaceChild(node, now[at]); });
      return;
    }
  }
  parent.replaceChildren(...nodes);
}

/**
 * The chips of a row's links: each anchor of its cells, a document's (one of `row.links`, which name
 * them in the same order, by their words) or the web's.
 * @param {DocRow} row
 * @returns {{ anchor: HTMLAnchorElement, page: DocRow["links"][number] | null }[]}
 */
function linksIn(row) {
  let next = 0;
  return [...row.el.querySelectorAll("a[href]")].flatMap((anchor) => {
    if (!(anchor instanceof HTMLAnchorElement)) return [];
    const page = row.links[next] && row.links[next].title === wordsOf(anchor) ? row.links[next] : null;
    if (page) next += 1;
    return [{ anchor, page }];
  });
}

DocKit.component({
  id: "gallery/kanban",
  on: ["source", "data", "editable"],
  mount(host, context) {
    const language = languageOf(document.documentElement);
    const words = WORDS[language];
    const face = made("div", "face");
    const head = made("div", "head");
    const caption = made("span", "caption");
    const gear = iconButton("gear", ICONS.gear, words.settings);
    gear.setAttribute("aria-expanded", "false");
    head.append(caption, gear);
    const strip = made("div", "strip");
    strip.hidden = true;
    const groupLabel = made("label", "setting");
    const groupField = document.createElement("select");
    groupLabel.append(made("span", "setting-name", words.group), groupField);
    strip.append(groupLabel);
    const line = made("p", "line");
    const board = made("div", "groups");
    face.append(head, strip, line, board);
    host.append(face);
    gear.addEventListener("click", () => {
      strip.hidden = !strip.hidden;
      gear.setAttribute("aria-expanded", String(!strip.hidden));
    }, { signal: context.signal });

    // 分组依据 picked: its settings' group, one undo step (context.editJSON), the order of the groups going
    // with it, as it named the values of the column grouped by before.
    const grouping = DocKit.input(groupField, {
      commit: (value) => void context.editJSON("settings", (draft) => {
        const settings = draft !== null && typeof draft === "object" && !Array.isArray(draft) ? draft : {};
        settings.group = value;
        delete settings.order;
        return settings;
      }),
      signal: context.signal,
    });
    let groupOptions = "";

    // Words written only where they change: a keystroke in the table changes one card and nothing else.
    const write = (/** @type {HTMLElement} */ node, /** @type {string} */ text) => {
      if (node.textContent !== text) node.textContent = text;
    };
    const say = (/** @type {string | null} */ text) => {
      line.hidden = text === null;
      write(line, text ?? "");
    };

    /**
     * A card: its element, the row it was drawn from (as context.table() gave it), the column grouped by and the
     * header then, its title's words, its props by the place of their cell in the row, its chips and what they were made of.
     * @typedef {{ card: HTMLLIElement, row: DocRow | null, column: string, header: string, title: DocTextHandle, titled: boolean,
     *   list: HTMLElement, props: Map<number, { node: HTMLElement, text: DocTextHandle, typable: boolean }>, links: HTMLElement, linked: string }} Card
     */
    /** @type {Map<HTMLTableRowElement, Card>} */
    const cards = new Map(); // a row's element -> its card, kept while the row is in the table
    /** @type {WeakMap<Element, Card>} */
    const cardOfNode = new WeakMap(); // a card's element -> its card
    const textsOf = (/** @type {Card} */ card) => [card.title, ...[...card.props.values()].map(({ text }) => text)];
    /** @type {Map<string, { section: HTMLElement, name: HTMLElement, named: DocTextHandle, count: HTMLElement, list: HTMLOListElement }>} */
    const groups = new Map(); // a group's value -> its section
    /** @type {{ column: string, value: string, known: Set<HTMLTableRowElement> } | null} */
    let adding = null; // a row asked for by a group's +, whose title takes the caret once drawn
    let column = ""; // the column grouped by, as drawn last
    let canWrite = false; // whether the table takes a change, as drawn last: what the words typed in ask
    /** @type {DocTableView | null} */
    let drawnTable = null; // the table as drawn last: which rows a group's name stands for

    // The row a card stands for, as the table reads now; null once it is gone.
    const rowNow = (/** @type {DocTableView} */ table, /** @type {Element | null} */ card) => {
      const element = card ? cardOfNode.get(card)?.row?.el : undefined;
      return element ? table.rows.find((row) => row.el === element) ?? null : null;
    };
    // The table, where it takes a change now.
    const writable = () => {
      const table = context.table();
      return table && table.canEdit() ? table : null;
    };
    // Whether the reader is typing in the board's words (a drag does not start then: a press there selects).
    const typing = () => {
      const active = document.activeElement;
      return active instanceof HTMLElement && board.contains(active) && active.isContentEditable;
    };
    // Where the caret is in the words the reader is typing in, before the board is drawn: what gives it back to
    // them after, where drawing took them out and put them back (their card moved to another group), and nothing
    // where it did not.
    const keepTyping = () => {
      const active = typing() ? /** @type {HTMLElement} */ (document.activeElement) : null;
      if (!active) return () => {};
      const selection = document.getSelection();
      const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      const at = range && active.contains(range.startContainer) ? [range.startOffset, range.endOffset] : null;
      return () => {
        if (!active.isConnected || document.activeElement === active) return;
        active.focus();
        const words = active.firstChild;
        if (!at || !words || !selection) return;
        const length = words.textContent?.length ?? 0;
        const again = document.createRange();
        again.setStart(words, Math.min(at[0], length));
        again.setEnd(words, Math.min(at[1], length));
        selection.removeAllRanges();
        selection.addRange(again);
      };
    };

    // A cell's words typed in where a card shows them: the cell numbered `at` of its row set, one step, where the
    // header names its column once (the column `set` writes).
    const writeCell = (/** @type {Card} */ card, /** @type {number} */ at, /** @type {string} */ text) => {
      const table = writable();
      const row = table && card.row ? table.rows.find((each) => each.el === card.row?.el) ?? null : null;
      const name = table?.columns[at];
      return Boolean(table && row && name !== undefined && table.columns.lastIndexOf(name) === at && table.set(row, name, text));
    };

    // A card for a row's element: its title (its first cell's words, typed in where it shows them), the list of
    // its props and its chips, filled as its row is drawn (fill).
    const newCard = (/** @type {HTMLTableRowElement} */ element) => {
      const node = made("li", "card");
      const hold = made("div", "hold");
      const titled = made("span", "title");
      const list = made("span", "props");
      list.hidden = true;
      hold.append(titled, list);
      const links = made("div", "links");
      links.hidden = true;
      const tools = made("div", "tools");
      tools.append(iconButton("remove", ICONS.remove, words.remove));
      node.append(hold, links, tools);
      /** @type {Card} */
      const card = { card: node, row: null, column: "", header: "", title: /** @type {any} */ (null), titled: false, list, props: new Map(), links, linked: "" };
      card.title = DocKit.text(titled, { commit: (text) => writeCell(card, 0, text), enabled: () => canWrite && card.titled, placeholder: words.untitled });
      cards.set(element, card);
      cardOfNode.set(node, card);
      return card;
    };

    // A card drawn from its row as the table reads it now: its title, its props (the other cells' words but the
    // column grouped by's: each its words typed in where they stand, kept by the place of its cell, one typed in
    // kept though its cell says nothing now), its chips made again where its links changed.
    const fill = (/** @type {Card} */ card, /** @type {DocRow} */ row, /** @type {DocTableView} */ table) => {
      const cells = [...row.el.cells];
      // Its first cell, of the header's first name and holding words alone (of a header naming it twice, or a link in it, the table has it).
      const first = table.columns[0];
      card.titled = first !== undefined && table.columns.lastIndexOf(first) === 0 && plain(cells[0]);
      card.title.set(wordsOf(cells[0]));
      const title = wordsOf(cells[0]);
      const grouped = table.columns.lastIndexOf(column);
      /** @type {Card["props"]} */
      const props = new Map();
      cells.forEach((cell, at) => {
        const said = wordsOf(cell);
        const kept = card.props.get(at);
        if (at === 0 || at === grouped || at >= table.columns.length || (!said && !kept?.text.editing)) return;
        let prop = kept;
        if (!prop) {
          const node = made("span", "prop");
          /** @type {{ node: HTMLElement, text: DocTextHandle, typable: boolean }} */
          const entry = { node, text: /** @type {any} */ (null), typable: false };
          entry.text = DocKit.text(node, { commit: (text) => writeCell(card, at, text), enabled: () => canWrite && entry.typable });
          prop = entry;
        }
        const name = table.columns[at];
        prop.typable = table.columns.lastIndexOf(name) === at && plain(cell);
        if (prop.node.dataset.docTip !== name) prop.node.dataset.docTip = name; // which column the value is of
        prop.text.set(said);
        props.set(at, prop);
      });
      card.props = props;
      put(card.list, [...props.values()].map(({ node }) => node));
      card.list.hidden = props.size === 0;
      const links = linksIn(row);
      const linked = JSON.stringify([title, links.map(({ anchor, page }) => [anchor.getAttribute("href"), wordsOf(anchor), page?.slug ?? null, page?.block ?? null])]);
      if (linked !== card.linked) {
        card.linked = linked;
        const chips = [];
        for (const { anchor, page } of links) {
          const chip = made("a", "link");
          chip.href = anchor.getAttribute("href") ?? "";
          chip.innerHTML = page ? ICONS.page : ICONS.web;
          const said = wordsOf(anchor);
          const shown = made("span", "words", said && said !== title ? said : words.open);
          shown.setAttribute("data-doc-tip-cut", ""); // the link's whole words, where they are cut
          chip.append(shown);
          if (page) chip.dataset.page = page.slug;
          else {
            chip.target = "_blank";
            chip.rel = "noopener noreferrer";
          }
          // A document's link opens it where Gallery shows the page; in an exported file it is a link.
          if (page) chip.addEventListener("click", (event) => {
            if (context.place !== "document" || !context.workspace) return;
            event.preventDefault();
            context.workspace.open({ slug: page.slug, block: page.block });
          });
          chips.push(chip);
        }
        card.links.replaceChildren(...chips);
        card.links.hidden = chips.length === 0;
      }
    };

    // The card of a row: kept by its element, filled again where the row, the column grouped by or the header changed.
    const cardOf = (/** @type {DocRow} */ row, /** @type {DocTableView} */ table) => {
      const card = cards.get(row.el) ?? newCard(row.el);
      const header = JSON.stringify(table.columns);
      if (card.row !== row || card.column !== column || card.header !== header) {
        card.row = row;
        card.column = column;
        card.header = header;
        fill(card, row, table);
      }
      return card.card;
    };

    // A group's name typed: each cell of its rows in the column grouped by, its place in the order of the
    // settings with it (as one step: table().set carries the settings' change), or the order alone for a
    // group that has no row; empty, nothing. Whether it was taken.
    const renameGroup = (/** @type {string} */ value, /** @type {string} */ text) => {
      const table = writable();
      if (!table || !table.columns.includes(column) || text === "") return false;
      if (text === value) return true;
      const rows = table.rows.filter((row) => keyOf(row, column) === value);
      const settings = context.readJSON("settings");
      const order = settings !== null && typeof settings === "object" && !Array.isArray(settings) ? orderRenamed(settings.order, value, text) : null;
      const orderIt = (/** @type {any} */ draft) => {
        const now = orderRenamed(draft?.order, value, text);
        if (now === "") delete draft.order;
        else if (now !== null) draft.order = now;
        return draft;
      };
      if (rows.length === 0) return order !== null && context.editJSON("settings", orderIt);
      return table.set(rows, column, text, order !== null ? { editJSON: ["settings", orderIt] } : undefined);
    };

    const groupOf = (/** @type {string} */ value) => {
      const kept = groups.get(value);
      if (kept) return kept;
      const section = made("section", "group");
      section.dataset.value = value;
      const top = made("div", "group-head");
      const dot = made("span", "dot");
      dot.setAttribute("aria-hidden", "true");
      const name = made("span", "name", value);
      const named = DocKit.text(name, {
        commit: (text) => renameGroup(value, text),
        // Each cell of its rows holds words alone (drawnTable: as drawn), else the table has it.
        enabled: () => canWrite && (drawnTable?.rows ?? []).every((row) => keyOf(row, column) !== value || plain(row.el.cells[drawnTable?.columns.lastIndexOf(column) ?? -1])),
        placeholder: words.none,
      });
      const count = made("span", "count");
      const add = iconButton("add", ICONS.add, words.add);
      top.append(dot, name, count, add);
      const list = made("ol", "cards");
      section.append(top, list);
      const group = { section, name, named, count, list };
      groups.set(value, group);
      return group;
    };

    const drawNow = () => {
      const table = context.table();
      const settings = askedOf(context.readJSON("settings"));
      const wrote = canWrite;
      canWrite = Boolean(table && table.canEdit());
      drawnTable = table;
      face.toggleAttribute("data-writes", context.canEdit());
      board.toggleAttribute("data-writes", canWrite);
      head.hidden = !table;
      if (!table) {
        cards.clear();
        groups.clear();
        write(caption, "");
        board.replaceChildren();
        groupField.replaceChildren();
        groupOptions = "";
        return say(host.hasAttribute("data-doc-from") ? words.unread : words.unbound);
      }
      const options = table.columns.length > 1 ? table.columns.slice(1) : [...table.columns];
      const signed = JSON.stringify(options);
      if (signed !== groupOptions) {
        groupOptions = signed;
        groupField.replaceChildren(...options.map((name) => new Option(name, name)));
      }
      const wanted = settings.group || groupColumnOf(table);
      if (wanted === null || !table.columns.includes(wanted)) {
        cards.clear();
        groups.clear();
        write(caption, "");
        board.replaceChildren();
        grouping.set(wanted ?? "");
        return say(wanted === null ? words.empty : words.missing(wanted));
      }
      grouping.set(wanted);
      column = wanted; // what a card shows under its title leaves it out: each card filled again where it changed (cardOf)
      write(caption, `${words.by(column)} · ${words.cards(table.rows.length)}`);
      say(context.canEdit() && !canWrite ? words.readOnly : table.rows.length === 0 ? words.empty : null);
      // The groups: those the settings list, then the rest as the rows say them, the empty value last.
      /** @type {Map<string, DocRow[]>} */
      const byValue = new Map(settings.order.map((value) => [value, []]));
      for (const row of table.rows) {
        const value = keyOf(row, column);
        const rows = byValue.get(value);
        if (rows) rows.push(row);
        else byValue.set(value, [row]);
      }
      const empty = byValue.get("");
      if (empty && !settings.order.includes("")) {
        byValue.delete("");
        byValue.set("", empty);
      }
      const live = new Set(table.rows.map((row) => row.el));
      for (const element of [...cards.keys()]) if (!live.has(element)) cards.delete(element);
      // The words the reader is typing in, should drawing move their card (another group): the caret given back.
      const resume = keepTyping();
      let colored = 0; // the groups with a value so far: each takes the next of the kit's series colors for its dot
      put(board, [...byValue].map(([value, rows]) => {
        const group = groupOf(value);
        if (group.count.textContent !== String(rows.length)) group.count.textContent = String(rows.length);
        const dot = value === "" ? "var(--doc-muted)" : `var(--doc-series-${(colored++ % 6) + 1})`;
        if (group.section.style.getPropertyValue("--gallery-kanban-dot") !== dot) group.section.style.setProperty("--gallery-kanban-dot", dot);
        group.named.set(value);
        put(group.list, rows.map((row) => cardOf(row, table)));
        return group.section;
      }));
      for (const value of [...groups.keys()]) if (!byValue.has(value)) groups.delete(value);
      resume();
      // The table come to take changes, or gone from it: each card's words asked again whether they take the caret.
      if (canWrite !== wrote) for (const card of cards.values()) for (const text of textsOf(card)) text.refresh();
      // A row a group's + asked for, drawn now: the caret in its title.
      if (adding) {
        const asked = adding;
        const fresh = table.rows.find((row) => !asked.known.has(row.el) && keyOf(row, asked.column) === asked.value);
        if (fresh) {
          adding = null;
          cards.get(fresh.el)?.title.edit();
        }
      }
    };
    const draw = () => context.frame(() => {
      if (dragging.dragging && !held?.isConnected) {
        dragging.cancel();
        unlift();
      }
      drawNow();
    });

    // A card whose words are typed in, marked (data-typing) for its style: its 🗑 hidden, which would stand over their end.
    const typingIn = (/** @type {Event} */ event, /** @type {boolean} */ on) => {
      const target = event.target;
      if (target instanceof HTMLElement && target.hasAttribute("data-doc-text")) target.closest(".gallery-kanban-card")?.toggleAttribute("data-typing", on);
    };
    board.addEventListener("focusin", (event) => typingIn(event, true), { signal: context.signal });
    board.addEventListener("focusout", (event) => typingIn(event, false), { signal: context.signal });

    board.addEventListener("click", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const button = target?.closest("button");
      if (!button || !board.contains(button)) return;
      const table = writable();
      if (!table) return;
      if (button.classList.contains("gallery-kanban-add")) {
        const value = button.closest(".gallery-kanban-group")?.getAttribute("data-value") ?? "";
        const mates = table.rows.filter((row) => keyOf(row, column) === value);
        const title = table.columns[0];
        adding = { column, value, known: new Set(table.rows.map((row) => row.el)) };
        const values = title === column ? { [column]: value } : { [title]: "", [column]: value };
        if (!table.add(values, mates.length > 0 ? { after: mates[mates.length - 1] } : {})) adding = null;
        return;
      }
      const card = button.closest(".gallery-kanban-card");
      if (!(card instanceof HTMLElement)) return;
      if (button.classList.contains("gallery-kanban-remove")) {
        const row = rowNow(table, card);
        if (row) table.remove(row);
      }
    }, { signal: context.signal });

    // A card dragged (DocKit.drag, from its words: its links and buttons are presses; not while its words
    // are typed in, where a press selects): a copy of it follows the pointer, lifted, and where it would go is
    // marked as the pointer moves, and on its release over a group the table is asked once. Where a card
    // dropped at (x, y) goes: nowhere off the groups, past a margin around them; else the group under it, or
    // the nearest, before the card shown in it whose middle is below the pointer, else at its end.
    const marker = made("li", "drop");
    /** @type {HTMLElement | null} */
    let held = null;
    // A copy of the card held, lifted under the pointer as it moves (where it goes is the marker's): put in as the
    // drag moves first, gone as the pointer is let go, taken back or Escape is pressed (the drag's own keys come first).
    const lift = made("ul", "lift");
    lift.setAttribute("aria-hidden", "true");
    /** @type {{ x: number, y: number } | null} */
    let grip = null; // where the pointer holds the card, from its corner
    let released = true;
    const unlift = () => {
      lift.remove();
      lift.replaceChildren();
      grip = null;
    };
    const liftAt = (/** @type {number} */ x, /** @type {number} */ y, /** @type {HTMLElement} */ item) => {
      if (released) return;
      if (!lift.isConnected) {
        const box = item.getBoundingClientRect();
        grip = { x: Math.min(Math.max(x - box.left, 0), box.width), y: Math.min(Math.max(y - box.top, 0), box.height) };
        const copy = /** @type {HTMLElement} */ (item.cloneNode(true));
        copy.classList.remove("doc-dragging");
        for (const node of [copy, ...copy.querySelectorAll("[contenteditable]")]) node.removeAttribute("contenteditable");
        lift.style.width = `${box.width}px`;
        lift.replaceChildren(copy);
        face.append(lift);
      }
      if (grip) lift.style.transform = `translate(${Math.round(x - grip.x)}px, ${Math.round(y - grip.y)}px)`;
    };
    const view = host.ownerDocument.defaultView ?? window;
    view.addEventListener("pointerdown", () => { released = false; }, { capture: true, signal: context.signal });
    for (const type of ["pointerup", "pointercancel"]) view.addEventListener(type, () => { released = true; unlift(); }, { capture: true, signal: context.signal });
    view.addEventListener("keydown", (event) => { if (event.key === "Escape" && lift.isConnected) { released = true; unlift(); } }, { capture: true, signal: context.signal });
    board.addEventListener("lostpointercapture", unlift, { signal: context.signal });
    context.signal.addEventListener("abort", unlift, { once: true });
    /** @param {number} x @param {number} y @param {HTMLElement} item */
    const spotAt = (x, y, item) => {
      held = item;
      liftAt(x, y, item);
      const area = board.getBoundingClientRect();
      if (x < area.left - MARGIN || x > area.right + MARGIN || y < area.top - MARGIN || y > area.bottom + MARGIN) return null;
      /** @type {{ section: HTMLElement, list: HTMLOListElement } | null} */
      let group = null;
      let nearest = Infinity;
      for (const each of groups.values()) {
        if (!each.section.isConnected) continue;
        const { left, right } = each.section.getBoundingClientRect();
        const far = x < left ? left - x : x > right ? x - right : 0;
        if (far < nearest) [group, nearest] = [each, far];
      }
      if (!group) return null;
      const next = [...group.list.children].find((card) => {
        if (card === item || card === marker) return false;
        const { top, height } = card.getBoundingClientRect();
        return y < top + height / 2;
      }) ?? null;
      return { into: group.list, before: next, value: group.section.getAttribute("data-value") ?? "", card: next };
    };
    const dragging = DocKit.drag(board, {
      items: ".gallery-kanban-card",
      handle: ".gallery-kanban-hold",
      enabled: () => !typing() && writable() !== null,
      marker,
      signal: context.signal,
      over: spotAt,
      drop(item, { value, card }) {
        held = null;
        const table = writable();
        const row = table ? rowNow(table, item) : null;
        if (!table || !row || !table.columns.includes(column)) return;
        const before = card ? rowNow(table, card) : null;
        const mates = table.rows.filter((other) => other !== row && keyOf(other, column) === value);
        const same = keyOf(row, column) === value;
        const values = same ? undefined : { [column]: value };
        if (same) {
          // Where it was: before the card after it in its group, or at the group's end as its last.
          const own = table.rows.filter((other) => keyOf(other, column) === value);
          const at = own.indexOf(row);
          if (before ? own[at + 1] === before : at === own.length - 1) return;
        }
        if (before) table.move(row, { before, values });
        else if (mates.length > 0) table.move(row, { after: mates[mates.length - 1], values });
        else if (!same) table.set(row, column, value);
      },
    });

    drawNow();
    return { update: draw };
  },
});
