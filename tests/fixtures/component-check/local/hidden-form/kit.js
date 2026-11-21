// A ledger whose form is hidden where nothing is written (an export: context.canEdit() false) by the
// hidden attribute alone, while its style gives the form display: flex, which is the rule an author's
// class wins over the browser's [hidden] with: the kit holds [hidden] over it, so that the export shows
// no form (tests/unit/component-command.mjs: no note on controls an export still shows).

/**
 * One entry more: what the form's button calls, and the example too. Whether it was taken.
 * @param {DocComponentContext} context
 * @param {string} words
 */
function addEntry(context, words) {
  return context.editJSON("entries", (data) => {
    data.entries.push({ words });
  });
}

DocKit.component({
  id: "local/hidden-form",
  on: ["source", "editable"],
  mount(host, context) {
    const drawn = document.createElement("div");
    drawn.className = "ledger-drawn";
    const list = document.createElement("ul");
    const form = document.createElement("form");
    form.className = "ledger-form";
    const field = document.createElement("input");
    field.className = "ledger-field";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "ledger-add";
    add.textContent = "记一笔";
    form.append(field, add);
    drawn.append(list, form);
    host.append(drawn);
    add.addEventListener("click", () => {
      if (field.value.trim() && addEntry(context, field.value.trim())) field.value = "";
    }, { signal: context.signal });
    const draw = () => {
      const data = context.readJSON("entries");
      if (data === undefined) return;
      list.replaceChildren(...data.entries.map((/** @type {{ words: string }} */ entry) => {
        const line = document.createElement("li");
        line.textContent = entry.words;
        return line;
      }));
      form.hidden = !context.canEdit();
    };
    draw();
    return { update: draw };
  },
  example(host, context) {
    addEntry(context, "又一笔");
  },
});
