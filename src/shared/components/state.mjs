// Reading state a report declares (runtime/bindings.js): a control, a table or a details bound to
// a key (data-doc-bind), elements shown for a key's value (data-doc-show),
// keys forgotten when the page is left (data-doc-transient); and the kit's styles of such
// controls (styles/state.css). A filter (.doc-filter) is one block: its row of buttons and what
// they filter below it (a list, say), together. A <select> of any control or block, bound or not, opens
// the kit's menu of choices (runtime/choice.js, styles/choice.css), never the browser's popup: a card at
// the end of <body> while it is open, nothing an author writes, which an export of the view leaves out.
export default {
  id: "state",
  match: "[data-doc-bind], [data-doc-show]",
  attrs: {
    "data-doc-bind": "the key an element writes and shows",
    "data-doc-show": "key:value, shown while the key holds this value or nothing",
    "data-doc-transient": "its key is forgotten when the page is left",
  },
  classes: ["doc-state-fields", "doc-state-field", "doc-state-actions", "doc-filter", "doc-filter-row", "doc-filter-button", "doc-state-list"],
  wholes: ["doc-filter", "doc-filter-row", "doc-state-fields", "doc-state-list"], // the classes above that are a whole block of their own (the others are parts inside one)
  runtime: {
    generated: [".doc-choice", ".doc-choice-leaving"], // the open menu, and one fading as it closes (90ms)
    attrs: { "[data-doc-show]": ["hidden"] },
    state: { "button[data-doc-bind]": ["aria-pressed"] },
    internal: ["doc-choice-*"], // the menu's rows, their words, the check and the group headings
  },
};
