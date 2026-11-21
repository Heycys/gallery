// Each of what can go wrong on the way back to the file, by the instance's `data-fault`, for what
// gallery block check says of each. `gallery check` has nothing to say of any of them.
const kept = new WeakMap(); // what the instance marked `stale` draws: its own idea of the part, which no undo reaches

// What the instances marked `mounts`, `hears` and `sources` write with no gesture: a mark of their own on the list.
const mark = (context) => context.edit("rows", (list) => { list.firstElementChild.textContent = "一（看过）"; });

DocKit.component({
  id: "local/astray",
  on: ["source", "editable"],
  mount(host, context) {
    const fault = host.dataset.fault;
    const drawn = document.createElement("p");
    drawn.className = "astray-drawn";
    const draw = () => { drawn.textContent = kept.get(host) ?? context.part("rows").textContent; };
    draw();
    host.append(drawn);
    if (fault === "spaces") context.part("rows").append(" ");
    if (fault === "mounts" && context.canEdit()) mark(context);
    return {
      update(reason) {
        if (fault === "hears" && reason === "editable") mark(context);
        if (fault === "sources" && reason === "source") mark(context);
        draw();
      },
    };
  },
  example(host, context) {
    const fault = host.dataset.fault;
    if (fault === "nothing") return context.edit("rows", () => {});
    if (fault === "refuses") return context.edit("rows", () => { throw new Error("no"); });
    if (fault === "live") return context.edit("rows", () => { context.part("rows").firstElementChild.textContent = "二"; });
    if (fault === "beside") host.setAttribute("data-moved", "");
    if (fault === "stale") kept.set(host, "二");
    return context.edit("rows", (list) => {
      list.firstElementChild.textContent = "二";
      if (fault === "handler") list.firstElementChild.setAttribute("onclick", "1");
      if (fault === "own") list.setAttribute("data-sorted", "1");
    });
  },
});
