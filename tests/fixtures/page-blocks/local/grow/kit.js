// A list of its data part's lines, each 40px high, and a button that adds one (one write, editJSON).
DocKit.component({
  id: "local/grow",
  on: ["source", "editable"],
  mount(host, context) {
    const list = document.createElement("ul");
    list.className = "grow-list";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "grow-add";
    add.textContent = "加一行";
    host.append(list, add);
    add.addEventListener("click", () => context.editJSON("items", (items) => [...items, `第 ${items.length + 1} 行`]), { signal: context.signal });
    const draw = () => {
      const items = context.readJSON("items") ?? [];
      list.replaceChildren(...items.map((text) => Object.assign(document.createElement("li"), { textContent: String(text) })));
      add.disabled = !context.canEdit();
    };
    draw();
    return { update: draw };
  },
});
