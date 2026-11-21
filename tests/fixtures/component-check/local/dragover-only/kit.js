// The rows of its table as a list a row is dragged in by HTML5 drag and drop, the list cancelling
// dragover and not dragenter, so that a release just as the pointer enters it drops nothing: what
// gallery block check notes, at the line that listens. Its move keeps the table a row a line, and
// nothing else is wrong with it.

// The row numbered `from` put before the row numbered `before`, or last, with the blank before it.
function move(context, from, before) {
  return context.edit("rows", (table) => {
    const body = /** @type {HTMLTableElement} */ (table).tBodies[0];
    const blankBefore = (node) => (node?.previousSibling?.nodeType === Node.TEXT_NODE && !node.previousSibling.textContent.trim() ? node.previousSibling : null);
    const row = body.rows[from];
    const next = before === null ? null : body.rows[before];
    const at = next ? blankBefore(next) ?? next : body.lastChild?.nodeType === Node.TEXT_NODE ? body.lastChild : null;
    for (const node of [blankBefore(row), row]) if (node) body.insertBefore(node, at);
  });
}

DocKit.component({
  id: "local/dragover-only",
  on: ["source", "editable"],
  mount(host, context) {
    const list = document.createElement("ol");
    list.className = "drops-list";
    host.append(list);
    const draw = () => {
      const table = context.part("rows");
      if (!(table instanceof HTMLTableElement)) return;
      table.hidden = true;
      list.replaceChildren(...[...table.tBodies[0].rows].map((row, index) => {
        const item = document.createElement("li");
        item.textContent = row.cells[0]?.textContent ?? "";
        item.draggable = context.canEdit();
        item.dataset.row = String(index);
        return item;
      }));
    };
    let dragged = -1;
    list.addEventListener("dragstart", (event) => { dragged = event.target instanceof HTMLElement ? Number(event.target.dataset.row) : -1; }, { signal: context.signal });
    list.addEventListener("dragover", (event) => event.preventDefault(), { signal: context.signal });
    list.addEventListener("drop", (event) => {
      event.preventDefault();
      const onto = event.target instanceof HTMLElement ? event.target.closest("li") : null;
      if (dragged >= 0 && onto && Number(onto.dataset.row) !== dragged) move(context, dragged, Number(onto.dataset.row));
    }, { signal: context.signal });
    draw();
    return { update: draw };
  },
  example(host, context) {
    move(context, 0, null);
  },
});
