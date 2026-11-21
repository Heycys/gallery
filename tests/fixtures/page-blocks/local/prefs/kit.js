// Its settings as one line of words: each field's value, the manifest's default where the part holds none.
const DEFAULTS = { title: "默认标题", count: 3, mode: "简洁", day: "", framed: false, doc: "" };

DocKit.component({
  id: "local/prefs",
  on: ["source"],
  mount(host, context) {
    const line = document.createElement("p");
    line.className = "prefs-shown";
    host.append(line);
    const draw = () => {
      const held = context.readJSON("settings") ?? {};
      const values = { ...DEFAULTS, ...held };
      line.textContent = ["title", "count", "mode", "day", "framed", "doc"].map((key) => `${key}=${values[key]}`).join(";");
    };
    draw();
    return { update: draw };
  },
});
