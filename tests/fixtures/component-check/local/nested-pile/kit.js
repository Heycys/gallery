// What it draws, a node holding a row of its own, is named neither in the manifest's runtime nor in a
// dehydrate: one fault, which the check says once, of the outer node.
DocKit.component({
  id: "local/nested-pile",
  mount(host) {
    const drawn = document.createElement("div");
    drawn.className = "nest-drawn";
    const row = document.createElement("p");
    row.className = "nest-row";
    row.textContent = "画的";
    drawn.append(row);
    host.append(drawn);
  },
});
