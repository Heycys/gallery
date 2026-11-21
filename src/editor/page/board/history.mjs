// A custom page's own undo and redo (docs/render.md "A custom page", the board's editing): what the
// page did, each step a list of what to send the page service to take it back or do it again, never
// a copy of the file. Kept in the tab's sessionStorage by the page's slug, so that a page shown again
// (the hidden frame's swap after a card is added from the library, or after someone else wrote
// page.html) undoes what this one did: the next page takes the steps up, and forgets those of a card
// someone else changed meanwhile (`forgetChanged`: its base, as the page knew it last, is not the one
// it is served with), whose undo would write over what they did. Each step names its cards by id; what
// it sends is held to each card's base as the page knows it then, so a card someone else changed is
// refused by the service whenever the page has not yet heard of it.
//
// A step is one of:
//   { kind: "cells", cards: [{ id, before: { x, y, w, h }, after: { x, y, w, h } }] }  moved, resized, pushed
//   { kind: "edit", id, parts: { <name>: { was, now } } }                             a block's data or its settings
//   { kind: "remove", id, board, html }                                                 a card taken out
//   { kind: "add", id, board, html }                                                    a card put in
//   { kind: "group", steps: [step, …] }                                                 several at once (恢复默认卡片's cards)
//   { kind: "checked", slug, ref, done }                                                   a to-do of document `slug` checked (done) or not by a block

const MOST = 100; // steps kept each way

const read = (key) => {
  try {
    const value = JSON.parse(sessionStorage.getItem(key) ?? "null");
    return value && Array.isArray(value.undo) && Array.isArray(value.redo) && value.bases && typeof value.bases === "object" ? value : null;
  } catch {
    return null;
  }
};

/** The page `slug`'s steps. */
export function createHistory(slug) {
  const key = `gallery-edit:${slug}:page-history`; // an editor key as the others (gallery-edit:<slug>:<kind>, shared/renamed-storage.mjs): made after the rename, so no old name
  const kept = read(key);
  let undo = kept?.undo ?? [];
  let redo = kept?.redo ?? [];
  let bases = kept?.bases ?? {}; // a card's id -> its base as this page knew it last
  let measure = kept?.measure ?? null; // a card just added whose height its content gives, to measure once shown
  const save = () => {
    try {
      sessionStorage.setItem(key, JSON.stringify({ undo, redo, bases, measure }));
    } catch {} // no storage: the steps last as long as the page
  };
  const touches = (step, id) => (step.kind === "group" ? step.steps.some((one) => touches(one, id)) : step.kind === "cells" ? step.cards.some((card) => card.id === id) : step.id === id);
  const rename = (step, from, to) => {
    if (step.kind === "group") for (const one of step.steps) rename(one, from, to);
    else if (step.kind === "cells") for (const card of step.cards) card.id = card.id === from ? to : card.id;
    else if (step.id === from) step.id = to;
  };
  return {
    /** A step done: undo takes it back first; what was undone cannot be done again any more. */
    push(step) {
      undo.push(step);
      if (undo.length > MOST) undo.shift();
      redo = [];
      save();
    },
    /** The step undo takes back now, left where it is (null: none). */
    nextUndo: () => undo.at(-1) ?? null,
    /** The step undo takes back now, taken off (null: none). */
    takeUndo: () => {
      const step = undo.pop() ?? null;
      save();
      return step;
    },
    takeRedo: () => {
      const step = redo.pop() ?? null;
      save();
      return step;
    },
    /** A step undone (it can be done again) or done again (it can be undone again). */
    undone(step) {
      redo.push(step);
      save();
    },
    redone(step) {
      undo.push(step);
      save();
    },
    /** Card `from` goes by `to` now (put back under another id): the steps say so. */
    renamed(from, to) {
      for (const step of [...undo, ...redo]) rename(step, from, to);
      save();
    },
    /** The cards' bases as this page knows them now ({ id: base }), for the next page to hold its own against. */
    know(now) {
      bases = { ...now };
      save();
    },
    /**
     * The page shown again: the steps of each card whose base (`served`, { id: base }) is not the one the
     * page before knew are forgotten, someone else's change of it standing; so is a card gone or come.
     */
    forgetChanged(served) {
      const changed = Object.keys(bases).filter((id) => served[id] !== bases[id]);
      const gone = (step) => changed.some((id) => touches(step, id));
      undo = undo.filter((step) => !gone(step));
      redo = redo.filter((step) => !gone(step));
      bases = { ...served };
      save();
    },
    /** A card added whose height is its content's: measured once the next page shows it (`take`: and forgotten). */
    toMeasure(id) {
      measure = id;
      save();
    },
    takeMeasure() {
      const id = measure;
      measure = null;
      save();
      return id;
    },
    get canUndo() {
      return undo.length > 0;
    },
    get canRedo() {
      return redo.length > 0;
    },
  };
}
