// A habit, for the trials of gallery block try (tests/unit/component-try.mjs) that type and choose:
// its data part a script of JSON, { "name", "unit", "count" }, drawn as a field holding its name, which
// writes the name typed once Enter is pressed and never while an input method composes; a <select> of
// its unit, which writes the one chosen; a button that adds one to its count as the pointer goes down on
// it; and a button 更多 that shows a line of words or hides it, written nowhere, as a filter or a tab
// is. Each write a context.edit, one undo step. data-trial on the instance makes it otherwise:
// "forgets" writes the name typed under another key, which no mount reads, and draws it from memory,
// so the page shows it and a fresh page of what it wrote does not; "blurs" writes the name typed as
// the field loses the focus too, as a field that commits on Enter or blur does; "stamps" writes how
// many times a page opened it as the page comes to edit, a write with no gesture.

DocKit.component({
  id: "local/habit",
  on: ["source", "editable"],
  mount(host, context) {
    const trial = host.dataset.trial ?? "";
    const forgets = trial === "forgets";
    const read = () => JSON.parse(context.part("habit")?.textContent ?? "{}");
    const write = (/** @type {(data: any) => void} */ change) => context.edit("habit", (script) => {
      const data = JSON.parse(script.textContent ?? "{}");
      change(data);
      script.textContent = `{ ${Object.entries(data).map(([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`).join(", ")} }`;
    });
    const drawn = document.createElement("div");
    drawn.className = "habit-drawn";
    const name = document.createElement("input");
    name.className = "habit-name";
    const unit = document.createElement("select");
    unit.className = "habit-unit";
    for (const each of ["杯", "瓶", "次"]) unit.append(new Option(each, each));
    const count = document.createElement("span");
    count.className = "habit-count";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "habit-add";
    add.textContent = "+1";
    const more = document.createElement("button");
    more.type = "button";
    more.className = "habit-more";
    more.textContent = "更多";
    const tip = document.createElement("p");
    tip.className = "habit-tip";
    tip.textContent = "坚持就好";
    tip.hidden = true;
    drawn.append(name, unit, count, add, more, tip);
    host.append(drawn);
    /** @type {string | null} */
    let remembered = null;
    const draw = () => {
      const data = read();
      if (document.activeElement !== name) name.value = remembered ?? data.name ?? "";
      unit.value = data.unit ?? "次";
      count.textContent = String(data.count ?? 0);
      for (const control of [name, unit, add]) control.disabled = !context.canEdit();
    };
    const named = () => {
      const typed = name.value.trim();
      if (typed === read().name) return;
      if (forgets) remembered = typed;
      write((data) => { data[forgets ? "title" : "name"] = typed; });
    };
    name.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing || event.keyCode === 229 || !context.canEdit()) return;
      event.preventDefault();
      named();
    }, { signal: context.signal });
    name.addEventListener("blur", () => {
      if (trial === "blurs" && context.canEdit()) named();
      draw();
    }, { signal: context.signal });
    unit.addEventListener("change", () => {
      if (context.canEdit() && unit.value !== read().unit) write((data) => { data.unit = unit.value; });
    }, { signal: context.signal });
    add.addEventListener("pointerdown", () => {
      if (context.canEdit()) write((data) => { data.count = (data.count ?? 0) + 1; });
    }, { signal: context.signal });
    more.addEventListener("click", () => { tip.hidden = !tip.hidden; }, { signal: context.signal });
    const stamp = () => { if (trial === "stamps" && context.canEdit()) write((data) => { data.opened = (data.opened ?? 0) + 1; }); };
    draw();
    queueMicrotask(stamp);
    return {
      update(reason) {
        if (reason === "editable") stamp();
        draw();
      },
    };
  },
  example(host, context) {
    context.edit("habit", (script) => { script.textContent = (script.textContent ?? "").replace(/"count": (\d+)/, (_, count) => `"count": ${Number(count) + 1}`); });
  },
});
