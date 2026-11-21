// Who is on duty, from its script of data, a press passing it on: written back as JSON.stringify lays it
// out, so that the names, written on one line, come back on five, which gallery block check notes,
// and nothing else is wrong with it.

/** The data `script` holds: the names and which of them is picked. @param {HTMLElement | null} script */
const read = (script) => {
  const { names, picked } = JSON.parse(script?.textContent ?? "{}");
  return { names: Array.isArray(names) ? names.map(String) : [], picked: Number(picked) || 0 };
};

// The next of the names picked, written back laid out anew.
function pass(context) {
  return context.edit("picks", (script) => {
    const data = JSON.parse(script.textContent ?? "{}");
    data.picked = (data.picked + 1) % data.names.length;
    script.textContent = `\n${JSON.stringify(data, null, 2)}\n`;
  });
}

DocKit.component({
  id: "local/laid-anew",
  on: ["source"],
  mount(host, context) {
    const drawn = document.createElement("button");
    drawn.type = "button";
    drawn.className = "laid-drawn";
    host.append(drawn);
    const draw = () => {
      const { names, picked } = read(context.part("picks"));
      drawn.textContent = names[picked] ?? "";
    };
    drawn.addEventListener("click", () => pass(context), { signal: context.signal });
    draw();
    return { update: draw };
  },
  example(host, context) {
    pass(context);
  },
});
