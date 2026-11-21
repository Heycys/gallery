// A ledger that never hides its form: where nothing is written (an export: context.canEdit() false) it
// still shows the field and the button, which a reader presses to no effect: gallery block check notes it.

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
  id: "local/leaky",
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
    };
    draw();
    return { update: draw };
  },
  example(host, context) {
    addEntry(context, "又一笔");
  },
});
