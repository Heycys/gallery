import { select } from "./caret.mjs";
import { holdsNothing } from "./marks.mjs";
import { ZWSP } from "../../shared/inline-spacing.mjs";

// Zero-width pads: a text node holding nothing but a zero-width space where the browser would not
// keep the caret, so that what is typed there lands on the side the reader chose: after a mark a
// Markdown shortcut made (typed text would go into it, markdown/), outside after inline code or
// inside at its start (typing/code-edges.mjs). Text typed into a pad stays there and the space
// goes (settlePads); a pad the caret left empty goes. A text node holding nothing but the space is
// never saved (core.mjs serializeNode).

const pads = new Set();

/** Whether `node` is a text node holding nothing but the zero-width space. */
export const isPad = (node) => node?.nodeType === 3 && node.data === ZWSP;

/**
 * The caret in a pad `where` `node` is ("after" or "before" it, or "start": inside it, first),
 * after its space; one already there is used again.
 */
export function padCaret(node, where) {
  let pad = where === "start" ? node.firstChild : where === "after" ? node.nextSibling : node.previousSibling;
  if (!isPad(pad)) {
    pad = node.ownerDocument.createTextNode(ZWSP);
    if (where === "start") node.prepend(pad);
    else if (where === "after") node.after(pad);
    else node.before(pad);
  }
  pads.add(pad);
  const caret = node.ownerDocument.createRange();
  caret.setStart(pad, 1);
  caret.collapse(true);
  select(caret);
  return pad;
}

/**
 * Text arrived in a pad: the space goes, the caret staying after the text. `left` (the selection
 * moved): a pad still empty goes unless the caret is in it.
 */
export function settlePads(left = false) {
  const selection = getSelection();
  for (const pad of [...pads]) {
    if (!pad.isConnected) {
      pads.delete(pad);
      continue;
    }
    const inside = selection.rangeCount > 0 && selection.anchorNode === pad;
    if (pad.data === ZWSP) {
      if (left && !inside) {
        pads.delete(pad);
        const parent = pad.parentElement;
        pad.remove();
        // Inline code that held nothing but the pad (its text deleted, the caret gone) goes too: it
        // would stay drawn as an empty box.
        if (parent?.tagName === "CODE" && holdsNothing(parent)) parent.remove();
      }
      continue;
    }
    pads.delete(pad);
    const at = pad.data.indexOf(ZWSP);
    if (at < 0) continue;
    const offset = inside ? selection.anchorOffset : null;
    pad.deleteData(at, 1);
    if (offset !== null) {
      const caret = pad.ownerDocument.createRange();
      caret.setStart(pad, Math.max(0, offset - (offset > at ? 1 : 0)));
      select(caret);
    }
  }
}
