// A picture of the page's own (assets/x.png) in a data part of HTML, and a button that adds a caption line
// under it: one write of the part (context.edit), which the page's Ctrl+Z takes back as the part was.
DocKit.component({
  id: "local/pics",
  on: ["source", "editable"],
  mount(host, context) {
    const add = document.createElement("button");
    add.type = "button";
    add.className = "pics-add";
    add.textContent = "加说明";
    host.append(add);
    add.addEventListener("click", () => context.edit("body", (body) => {
      const line = document.createElement("p");
      line.textContent = "说明";
      body.append(line);
    }), { signal: context.signal });
    const draw = () => {
      add.disabled = !context.canEdit();
    };
    draw();
    return { update: draw };
  },
});
