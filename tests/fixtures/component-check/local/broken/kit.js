// Reads as a script, and asks for the network and for what the SDK does not have.
DocKit.component({
  id: "local/broken",
  mount(host, context) {
    fetch("/data");
    context.nope();
  },
});
