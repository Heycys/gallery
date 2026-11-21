// A memo: what is typed in its field goes to its data part when the field is left or Ctrl+Enter is
// pressed (DocKit.input), one write. It says the size its card is drawn at, and how often it heard it.
DocKit.component({
  id: "local/memo",
  on: ["source", "editable", "layout"],
  mount(host, context) {
    const field = document.createElement("textarea");
    field.className = "memo-field";
    field.placeholder = "写点什么";
    host.append(field);
    let layouts = 0;
    const input = DocKit.input(field, {
      signal: context.signal,
      commit: (value) => context.editJSON("note", (data) => {
        data.text = value;
      }),
    });
    const draw = (reason) => {
      if (reason === "layout") layouts += 1;
      const data = context.readJSON("note");
      if (data) input.set(String(data.text ?? ""));
      field.readOnly = !context.canEdit();
      host.dataset.size = JSON.stringify(context.size);
      host.dataset.layouts = String(layouts);
    };
    draw();
    return { update: draw };
  },
});
