// Says the size its card is drawn at (context.size), and how often it heard it change (layout).
DocKit.component({
  id: "local/span",
  on: ["layout"],
  mount(host, context) {
    let layouts = 0;
    const draw = (reason) => {
      if (reason === "layout") layouts += 1;
      host.dataset.size = JSON.stringify(context.size);
      host.dataset.layouts = String(layouts);
    };
    draw();
    return { update: draw };
  },
});
