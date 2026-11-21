// A count a press adds one to, for the trials of gallery block try (tests/unit/component-try.mjs):
// its data part a script of JSON, { "count": n }, and a button that adds one as the pointer goes down
// on it (pointerdown, which a click() of the DOM's never makes), one context.edit, one undo step. What
// the instance's data-trial says makes it go wrong as a trial asks: "covered", a box drawn over the
// count and the button, which a press lands on; "keeps-undo", a reader's Ctrl+Z kept from the page
// while the focus is on the button; "again", the highest count it has drawn written back as an undo
// takes the part below it, so that one Ctrl+Z cannot give the file back; "undrawn", nothing drawn and
// an error thrown a moment after the mount; "throws", an error thrown as it mounts, which the kit
// answers by showing what the instance holds, read-only.

DocKit.component({
  id: "local/counter",
  on: ["source", "editable"],
  mount(host, context) {
    const trial = host.dataset.trial ?? "";
    if (trial === "throws") throw new Error("no count to start from");
    if (trial === "undrawn") {
      setTimeout(() => { missingHelper(); }, 0); // a name no script defines
      return {};
    }
    const drawn = document.createElement("div");
    drawn.className = "counter-drawn";
    const count = document.createElement("span");
    count.className = "counter-count";
    const add = document.createElement("button");
    add.type = "button";
    add.className = "counter-add";
    add.textContent = "+1";
    drawn.append(count, add);
    if (trial === "covered") {
      const cover = document.createElement("div");
      cover.className = "counter-cover";
      drawn.append(cover);
    }
    host.append(drawn);
    const read = () => Number(JSON.parse(context.part("count")?.textContent ?? "{}").count ?? 0);
    const write = (/** @type {number} */ value) => context.edit("count", (script) => { script.textContent = (script.textContent ?? "").replace(/\d+/, String(value)); });
    let highest = read();
    const draw = () => {
      count.textContent = String(read());
      add.disabled = !context.canEdit();
    };
    add.addEventListener("pointerdown", () => {
      if (!context.canEdit()) return;
      highest = Math.max(highest, read() + 1);
      write(read() + 1);
    }, { signal: context.signal });
    if (trial === "keeps-undo") {
      addEventListener("keydown", (event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z" && drawn.contains(document.activeElement)) event.stopImmediatePropagation();
      }, { capture: true, signal: context.signal });
    }
    draw();
    return {
      update(/** @type {string} */ reason) {
        if (trial === "again" && reason === "source" && read() < highest) write(highest);
        draw();
      },
    };
  },
});
