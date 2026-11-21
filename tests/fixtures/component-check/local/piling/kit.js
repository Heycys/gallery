// What it draws is declared in neither its manifest nor a dehydrate, it writes its text part, and a
// moment after each mount it throws.
DocKit.component({
  id: "local/piling",
  mount(host, context) {
    const badge = document.createElement("span");
    badge.className = "piling-badge";
    host.append(badge);
    context.part("title").textContent = "画过的标题";
    setTimeout(() => { throw new Error("late"); });
  },
});
