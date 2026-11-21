// A view of a table for the scenarios (tests/fixtures/table-views/, docs/testing.md "Table views"): the
// rows of the table its data-doc-from names, grouped by the column its data-group names (状态 by
// default), each group a heading with its count and a card for each row, its first cell's words. Its
// buttons ask the table to change through context.table() and nothing else: 完成 moves a row to the end
// of the table, its status 已完成 set in the same step, 上移 puts it before the row above it in its group,
// 改名 sets its first cell, 删除 takes it out, and a group's 添加 puts a row in after its last. It hears the
// table by `data` and draws in a frame, as a view of a long table draws: a card for each row kept while
// its row is the same object (context.table() gives a row anew only once it changed), so that a keystroke
// in the table makes one card again and moves none. `window.taskViewContext` is the tests' way to a
// context; `taskViewDraws`, `taskViewDrawn` and `taskViewCards` count its frames, the time they took
// and the cards it made.
window.taskViewContext ??= new WeakMap();
window.taskViewDraws ??= 0;
window.taskViewDrawn ??= 0;
window.taskViewCards ??= 0;

DocKit.component({
  id: "local/task-view",
  on: ["data", "editable"],
  mount(host, context) {
    window.taskViewContext.set(host, context);
    const board = document.createElement("div");
    board.className = "tv-board";
    host.append(board);
    const group = host.dataset.group || "状态";
    const line = (name, words) => {
      const node = document.createElement("p");
      node.className = name;
      node.textContent = words;
      return node;
    };
    const button = (act, words) => {
      const node = document.createElement("button");
      node.type = "button";
      node.dataset.act = act;
      node.textContent = words;
      return node;
    };
    const cards = new Map(); // a row -> its card, while the row is the one context.table() gives
    const rowOf = new WeakMap(); // a card -> its row's element
    const groups = new Map(); // a group's value -> { section, head, list }
    const cardOf = (row, title) => {
      if (cards.has(row)) return cards.get(row);
      window.taskViewCards += 1;
      const card = document.createElement("li");
      card.className = "tv-card";
      const words = document.createElement("span");
      words.className = "tv-title";
      words.textContent = String(row.values[title] ?? "");
      card.append(words, button("done", "完成"), button("up", "上移"), button("rename", "改名"), button("remove", "删除"));
      rowOf.set(card, row.el);
      cards.set(row, card);
      return card;
    };
    // `parent`'s children as `nodes`, what is there already left in place: new cards in the places of the
    // ones they stand for are put in alone (a keystroke in the table changes one card, and the page lays
    // out that much), anything else is the list anew.
    const put = (parent, nodes) => {
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
    };
    const drawNow = () => {
      const table = context.table();
      board.toggleAttribute("data-writes", context.canEdit());
      if (!table || !table.columns.includes(group)) {
        cards.clear();
        groups.clear();
        return void board.replaceChildren(line(table ? "tv-missing" : "tv-none", table ? `找不到列“${group}”：表格的列名改过了吗？` : "这个视图没有可读的表格"));
      }
      const title = table.columns[0];
      const byValue = new Map();
      for (const row of table.rows) {
        const value = String(row.values[group] ?? "");
        (byValue.get(value) ?? byValue.set(value, []).get(value)).push(row);
      }
      const live = new Set(table.rows);
      for (const row of [...cards.keys()]) if (!live.has(row)) cards.delete(row);
      put(board, [...byValue].map(([value, rows]) => {
        if (!groups.has(value)) {
          const section = document.createElement("section");
          section.className = "tv-group";
          section.dataset.value = value;
          const head = document.createElement("h4");
          const list = document.createElement("ol");
          section.append(head, list, button("add", "添加"));
          groups.set(value, { section, head, list });
        }
        const { section, head, list } = groups.get(value);
        if (head.textContent !== `${value} ${rows.length}`) head.textContent = `${value} ${rows.length}`;
        put(list, rows.map((row) => cardOf(row, title)));
        return section;
      }));
      for (const value of [...groups.keys()]) if (!byValue.has(value)) groups.delete(value);
    };
    const draw = () => context.frame(() => {
      const began = performance.now();
      window.taskViewDraws += 1;
      try {
        drawNow();
      } finally {
        window.taskViewDrawn += performance.now() - began;
      }
    });
    // A press on a button asks the table, as the rows read now say them.
    board.addEventListener("click", (event) => {
      const pressed = event.target.closest("button[data-act]");
      const table = context.table();
      if (!pressed || !table) return;
      const title = table.columns[0];
      const act = pressed.dataset.act;
      const section = pressed.closest(".tv-group");
      const mates = table.rows.filter((other) => String(other.values[group] ?? "") === section.dataset.value);
      if (act === "add") return void table.add({ [title]: "新任务", [group]: section.dataset.value }, { after: mates.at(-1) });
      const row = table.rows.find((each) => each.el === rowOf.get(pressed.closest(".tv-card")));
      if (!row) return;
      if (act === "done") table.move(row, { after: table.rows.at(-1), values: { [group]: "已完成" } });
      else if (act === "up" && mates.indexOf(row) > 0) table.move(row, { before: mates[mates.indexOf(row) - 1] });
      else if (act === "rename") table.set(row, title, `${row.values[title]}（改）`);
      else if (act === "remove") table.remove(row);
    }, { signal: context.signal });
    draw();
    return { update: draw };
  },
});
