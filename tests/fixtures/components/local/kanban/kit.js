// A task board drawn from its table: a column for each status, a card for each row. The table is the
// file's whole truth, and stays an ordinary table: a card dragged to another place writes it, its row
// moved and its status cell changed, in one write of its rows (context.rows), which is one undo step;
// nothing else of the board reaches the file. A filter by words is the reader's own (context.state), and
// works wherever the board is drawn, in an exported file too, where nothing can be dragged
// (context.canEdit()). The drag is the kit's (DocKit.drag): its threshold, Escape, its marker.
//
// The first cell of a row is its card's title, the second its status, the others what the card shows
// under it. The columns are what the instance's data-columns lists, in its order, empty ones too, then
// any other status a row says. A table it cannot fully read (no header row, a cell spanning others, a
// row of fewer than two cells, more than one body) it leaves as it stands, read-only.

// The words of the board, by the document's language.
const WORDS = {
  zh: { filter: "筛选卡片", none: "（无状态）" },
  en: { filter: "Filter cards", none: "(no status)" },
};
const wordsOf = () => WORDS[/^en\b/i.test(document.documentElement.lang) ? "en" : "zh"];

// How far off the board's columns a card held is still over them, in pixels.
const MARGIN = 24;

const textOf = (/** @type {HTMLTableCellElement} */ cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim();

/**
 * @typedef {{ row: DocRow, title: string, status: string, more: string[] }} Card
 * @typedef {{ status: string, before: number | null }} Place
 */

/**
 * What the board reads of its table: its rows (context.rows), each card's title, status and the other
 * cells' words, or null for a table it cannot fully read.
 * @param {DocComponentContext} context
 * @returns {{ rows: DocRowSet, cards: Card[] } | null}
 */
function readBoard(context) {
  const table = context.part("tasks");
  const rows = context.rows("tasks");
  if (!(table instanceof HTMLTableElement) || !rows || table.tBodies.length !== 1 || (table.tHead && table.tHead.rows.length !== 1)) return null;
  const header = table.tHead?.rows[0] ?? table.tBodies[0].rows[0];
  if (!header || (!table.tHead && ![...header.cells].every((cell) => cell.localName === "th"))) return null;
  if (rows.columns.length < 2 || rows.rows.some(({ el }) => el.cells.length < 2)) return null;
  return { rows, cards: rows.rows.map((row) => ({ row, title: textOf(row.el.cells[0]), status: textOf(row.el.cells[1]), more: [...row.el.cells].slice(2).map(textOf).filter(Boolean) })) };
}

/**
 * The columns: those the instance lists, then any other status, each once.
 * @param {Element} host
 * @param {{ status: string }[]} cards
 */
const columnsOf = (host, cards) => [...new Set([...(host.getAttribute("data-columns") ?? "").split(/[,，、]/).map((name) => name.trim()).filter(Boolean), ...cards.map(({ status }) => status)])];

/**
 * The card numbered `from` moved where it dropped: `status`, the column's, and `before`, the number of
 * the card it goes before, or null for the end of that column (or where it is, in a column with no other
 * card). One write of the rows: the row moved and its status cell set, the blank before it along.
 * @param {{ rows: DocRowSet, cards: Card[] }} board
 * @param {number} from
 * @param {Place} to
 */
function moveCard({ rows, cards }, from, { status, before }) {
  const moved = cards[from];
  if (!moved) return false;
  const values = moved.status === status ? undefined : { [rows.columns[1]]: status };
  if (before !== null) return rows.move(moved.row, { before: cards[before].row, values });
  const last = cards.filter((each, index) => index !== from && each.status === status).at(-1);
  return rows.move(moved.row, { after: last?.row, values });
}

/**
 * Whether a card dropped there changes nothing: where it was, in its own column.
 * @param {Card[]} cards
 * @param {number} from
 * @param {Place} to
 */
function staysPut(cards, from, { status, before }) {
  if (cards[from].status !== status) return false;
  const column = cards.map((card, index) => ({ ...card, index })).filter((card) => card.status === status);
  const at = column.findIndex(({ index }) => index === from);
  return before === null ? at === column.length - 1 : before === from || column[at + 1]?.index === before;
}

DocKit.component({
  id: "local/kanban",
  on: ["source", "editable"],
  mount(host, context) {
    const words = wordsOf();
    const state = context.state({ version: 1, defaults: { filter: "" } });
    const board = document.createElement("div");
    board.className = "kanban-board";
    const bar = document.createElement("div");
    bar.className = "kanban-bar";
    const filter = document.createElement("input");
    filter.type = "search";
    filter.className = "kanban-filter";
    filter.placeholder = words.filter;
    filter.setAttribute("aria-label", words.filter);
    filter.value = String(state.get("filter"));
    bar.append(filter);
    const columns = document.createElement("div");
    columns.className = "kanban-columns";
    board.append(bar, columns);
    host.append(board);

    /** @type {{ element: HTMLDivElement, status: string, count: HTMLSpanElement, list: HTMLOListElement, cards: { element: HTMLLIElement, row: number }[] }[]} */
    let drawn = [];
    // The cards the filter leaves, and each column's count of them.
    const sift = () => {
      const wanted = filter.value.trim().toLowerCase();
      for (const { count, cards } of drawn) {
        for (const { element } of cards) element.hidden = wanted !== "" && !(element.textContent ?? "").toLowerCase().includes(wanted);
        count.textContent = String(cards.filter(({ element }) => !element.hidden).length);
      }
    };
    const draw = () => {
      const table = context.part("tasks");
      const read = readBoard(context);
      board.hidden = read === null;
      if (table instanceof HTMLElement) table.hidden = read !== null;
      const cards = read?.cards ?? [];
      drawn = (read ? columnsOf(host, cards) : []).map((status) => {
        const element = document.createElement("div");
        element.className = "kanban-column";
        const head = document.createElement("div");
        head.className = "kanban-column-head";
        const name = document.createElement("span");
        name.textContent = status || words.none;
        const count = document.createElement("span");
        count.className = "kanban-column-count";
        head.append(name, count);
        const list = document.createElement("ol");
        list.className = "kanban-cards";
        const shown = cards.flatMap(({ title, status: said, more }, row) => {
          if (said !== status) return [];
          const card = document.createElement("li");
          card.className = "kanban-card";
          const titled = document.createElement("span");
          titled.className = "kanban-card-title";
          titled.textContent = title;
          card.append(titled);
          if (more.length > 0) {
            const meta = document.createElement("span");
            meta.className = "kanban-card-meta";
            meta.textContent = more.join(" · ");
            card.append(meta);
          }
          list.append(card);
          return [{ element: card, row }];
        });
        element.append(head, list);
        return { element, status, count, list, cards: shown };
      });
      board.toggleAttribute("data-writes", context.canEdit());
      columns.replaceChildren(...drawn.map(({ element }) => element));
      sift();
    };
    filter.addEventListener("input", () => {
      state.set("filter", filter.value);
      sift();
    }, { signal: context.signal });

    // A card dragged (DocKit.drag): where it would go is marked as the pointer moves, and on its release
    // over a column the table is written once. Where a card dropped at (x, y) goes: nowhere off the
    // board's columns, past a margin around them; else the column under it, or the nearest, before the
    // card shown in it whose middle is below the pointer, else at its end.
    const marker = document.createElement("li");
    marker.className = "kanban-drop";
    /** @param {number} x @param {number} y @param {HTMLElement} held */
    const spotAt = (x, y, held) => {
      const area = columns.getBoundingClientRect();
      if (x < area.left - MARGIN || x > area.right + MARGIN || y < area.top - MARGIN || y > area.bottom + MARGIN) return null;
      let column = null;
      let nearest = Infinity;
      for (const each of drawn) {
        const { left, right } = each.element.getBoundingClientRect();
        const far = x < left ? left - x : x > right ? x - right : 0;
        if (far < nearest) [column, nearest] = [each, far];
      }
      if (!column) return null;
      const next = column.cards.find(({ element }) => {
        if (element === held || element.hidden) return false;
        const { top, height } = element.getBoundingClientRect();
        return y < top + height / 2;
      }) ?? null;
      return { into: column.list, before: next?.element ?? null, to: { status: column.status, before: next ? next.row : null } };
    };
    const dragging = DocKit.drag(board, {
      items: ".kanban-card",
      enabled: () => context.canEdit(),
      marker,
      signal: context.signal,
      over: spotAt,
      drop(item, { to }) {
        const from = drawn.flatMap(({ cards }) => cards).find(({ element }) => element === item)?.row;
        const read = readBoard(context);
        if (from === undefined || !read?.cards[from] || staysPut(read.cards, from, to)) return;
        moveCard(read, from, to);
      },
    });

    draw();
    return {
      update() {
        dragging.cancel();
        draw();
      },
    };
  },
  // A reader's drag, as the check makes one: the first card to the next column.
  example(host, context) {
    const read = readBoard(context);
    if (!read || read.cards.length === 0) return;
    const columns = columnsOf(host, read.cards);
    const status = columns[(columns.indexOf(read.cards[0].status) + 1) % columns.length];
    moveCard(read, 0, { status, before: null });
  },
});
