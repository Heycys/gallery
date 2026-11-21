// Wrong as it runs, and right to read: a line of its own drawn into the slot, the document's, which
// a component reads and never writes in (gallery block check names it: what the slot holds). It
// writes a moment after it mounts, from a timer of the browser's: what it wrote as it mounted the kit
// would put back itself and fail the instance for, and this is what the kit's calls do not hold.
DocKit.component({
  id: "local/slot-writer",
  mount(host, context) {
    setTimeout(() => {
      if (context.signal.aborted || host.querySelector(".slot-writer-line")) return;
      const line = document.createElement("p");
      line.className = "slot-writer-line";
      line.textContent = "组件写进插槽的一行";
      context.part("body")?.append(line);
    }, 0);
  },
  dehydrate(host) {
    host.querySelector(".slot-writer-line")?.remove();
  },
});
