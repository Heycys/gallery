// What a structural change on the page made: the containers it created, whose child lists undo
// records too (editor.mjs `struct`), and the text block that holds the text now (the focus).
// Conversions (convert.mjs) and the components' own changes (a new section, an indented list item,
// a paragraph leaving a panel) collect them here and return done(focus): { focus, created }.

let created = [];

/** A change begins: nothing made yet. */
export const begin = () => {
  created = [];
};

/** A container the change made. */
export const made = (node) => {
  created.push(node);
  return node;
};

/** The change is done: { focus, created }. */
export const done = (focus) => {
  const result = { focus, created };
  created = [];
  return result;
};
