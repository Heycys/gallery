// A component with a slot (its manifest's part "body", edited as flow): what the slot holds is the
// document's blocks, which the reader writes in as anywhere. It reads the slot and never writes in it:
// a line under it counts the words the slot holds, drawn outside the slot (its manifest's `runtime`),
// drawn again whenever what the file says of it changes (source: a change in the slot too).
DocKit.component({
  id: "local/brief",
  on: ["source"],
  mount(host, context) {
    const count = document.createElement("div");
    count.className = "brief-count";
    const draw = () => {
      const words = (context.part("body")?.textContent ?? "").replace(/\s+/g, "").length;
      count.textContent = `共 ${words} 字`;
    };
    draw();
    host.append(count);
    return { update: draw };
  },
  dehydrate(host) {
    host.querySelector(":scope > .brief-count")?.remove();
  },
});
