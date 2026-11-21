// A component that reads and never writes: its title drawn again in what it owns whenever the page
// changes it, and a count of the presses on its button, this instance's reading state. What it
// leaves on the page is in its manifest's `runtime`, but for the words it draws in an element of the
// file, which `dehydrate` takes off. Its text says what an inline copy must hold as it is: </script>
<!-- and <script>, here and in a comment of the old way, which a classic script may still hold
DocKit.component({
  id: "local/tally",
  on: ["source"],
  mount(host, context) {
    const state = context.state({ version: 1, defaults: { presses: 0 } });
    const drawn = host.querySelector(".tally-drawn");
    const count = document.createElement("span");
    count.className = "tally-count";
    count.textContent = String(state.get("presses"));
    host.append(count);
    const draw = () => { drawn.textContent = context.part("title").textContent; };
    draw();
    host.dataset.spelled = "</script><!-- <script>".replace(/<!--/u, "") + `</script>`; // as a string, an expression and a template say them
    host.dataset.withDialogs = String(typeof DocDialogs === "object"); // a file of the kit's its manifest asks for
    host.querySelector(".tally-refresh").addEventListener("click", () => {
      host.toggleAttribute("data-refreshed");
      state.set("presses", state.get("presses") + 1);
      count.textContent = String(state.get("presses"));
    }, { signal: context.signal });
    return {
      update(reason) {
        window.tallyUpdates = [...(window.tallyUpdates ?? []), reason];
        draw();
      },
    };
  },
  dehydrate(host) {
    host.querySelector(".tally-drawn").textContent = "";
    delete host.dataset.withDialogs;
    delete host.dataset.spelled;
  },
});
