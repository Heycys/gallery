// A component that writes back: what its table says drawn as a list in what it owns, a row dragged to
// another's place or sent one down by its button writing the table, a press on its counter the count
// its script of data holds. All it knows of saving is `context.edit`. `window.rowsContext` is the
// tests' way to a context.
window.rowsContext ??= new WeakMap();

DocKit.component({
  id: "local/rows",
  on: ["source", "editable"],
  mount(host, context) {
    window.rowsContext.set(host, context);
    const drawn = document.createElement("ol");
    drawn.className = "rows-drawn";
    host.append(drawn);
    const rows = () => [...context.part("rows").tBodies[0].rows];
    const move = (from, to) => context.edit("rows", (table) => {
      const body = table.tBodies[0];
      body.insertBefore(body.rows[from], body.rows[to + (to > from ? 1 : 0)] ?? null);
    });
    const count = () => context.edit("moves", (script) => {
      const data = JSON.parse(script.textContent);
      script.textContent = JSON.stringify({ ...data, moves: data.moves + 1 });
    });
    const draw = () => {
      drawn.toggleAttribute("data-writes", context.canEdit());
      drawn.replaceChildren(...rows().map((row, index) => {
        const line = document.createElement("li");
        line.textContent = row.cells[0].textContent;
        line.dataset.row = String(index);
        const down = document.createElement("button");
        down.type = "button";
        down.className = "rows-down";
        down.textContent = "下移";
        down.addEventListener("click", () => move(index, index + 1), { signal: context.signal });
        line.append(down);
        return line;
      }));
      const log = context.part("moves");
      if (!log) return;
      const counter = document.createElement("li");
      counter.className = "rows-count";
      counter.textContent = String(JSON.parse(log.textContent).moves);
      counter.addEventListener("click", count, { signal: context.signal });
      drawn.append(counter);
    };
    let dragged = null;
    drawn.addEventListener("pointerdown", (event) => {
      dragged = event.target.closest("li[data-row]");
    }, { signal: context.signal });
    window.addEventListener("pointerup", (event) => {
      const onto = document.elementFromPoint(event.clientX, event.clientY)?.closest("li[data-row]");
      if (dragged && onto && onto !== dragged && drawn.contains(onto)) move(Number(dragged.dataset.row), Number(onto.dataset.row));
      dragged = null;
    }, { signal: context.signal });
    draw();
    return { update: draw };
  },
  example(host, context) {
    context.edit("rows", (table) => {
      const body = table.tBodies[0];
      body.append(body.rows[0]);
    });
  },
});
