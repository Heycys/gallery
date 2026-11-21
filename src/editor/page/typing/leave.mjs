import { blocksIn, boxKind, dropIfEmpty, isEmpty } from "../core.mjs";
import { caretAt } from "../caret.mjs";
import { begin, done } from "../made.mjs";
import { BLOCK_TYPES, LEAVES_BY_ENTER, accepts } from "../../components/registry.mjs";

// Where Enter and Backspace leave a block's container: one rule, driven by what the components
// declare (a block of a `resettable` type left
// empty, or the last empty block of a container whose body it is, goes out a level, else turns into
// body text; Backspace at the start of such a block turns it into text). It comes after the keys of
// the block's component and of what stands around it, which may have a way out of their own (a
// nested list item out a level; the empty last block of a flowchart's node the first line of a new
// node after it, the empty only line of its last node a paragraph after the flowchart).
//   - The empty last block of a box that says `leaveByEnter` (a highlight block, the opening summary
//     too) moves out after the box, which goes if nothing is left in it (`leaveBox`).
//   - A block of a type that says `resettable` (a quote's paragraph, a list item) turns into a
//     paragraph where it stands, its container splitting around it (convert.mjs).
//   - Backspace in an empty block of a type that says `emptyToText` (a heading, small text) turns it
//     into an empty paragraph where it stands (`emptied`; the user's, 2026-11-09).
// Enter in a title that goes into its content (a disclosure, a card, a code block) is another rule
// (their components').

/**
 * The empty last block of a box that says `leaveByEnter`, moved out after the box (the box goes if
 * nothing is left in it). Returns { focus, created }, focus null when `host` is not such a block.
 */
export function leaveBox(host) {
  begin();
  const box = host.parentElement;
  if (!LEAVES_BY_ENTER.has(boxKind(box)) || blocksIn(box).at(-1) !== host || !isEmpty(host)
    || !accepts(boxKind(box.parentElement), "paragraph")) return done(null);
  box.after(host);
  dropIfEmpty(box);
  return done(host);
}

/**
 * Enter and Backspace on a block left empty or at its start, with what the editor gives it: struct
 * and touchedBy (a structural undo step), convertHost, typeOf and targetsOf (convert.mjs).
 */
export function createLeaving({ struct, touchedBy, convertHost, typeOf, targetsOf }) {
  // A block of a type that says `field` (resettable, emptyToText), which can be body text where it stands.
  const says = (host, field) => BLOCK_TYPES[typeOf(host)]?.[field] === true && targetsOf(host).includes("paragraph");
  const resets = (host) => says(host, "resettable");
  const toText = (host) => convertHost(host, "paragraph");

  // Enter on an empty text block. True when it left its container or became text.
  function enter(host) {
    if (!isEmpty(host)) return false;
    if (LEAVES_BY_ENTER.has(boxKind(host.parentElement))) {
      const left = struct(touchedBy(host), [], () => {
        const { focus, created } = leaveBox(host);
        return focus ? { touched: [focus], focus, created } : null;
      });
      if (!left) return false;
      caretAt(host, "start");
      return true;
    }
    if (!resets(host)) return false;
    toText(host);
    return true;
  }

  // Backspace at the start of a block: the first block of its container, of a type that resets (a
  // quote's first paragraph), turns into body text before the container. True when it did.
  function backspace(host) {
    if (!resets(host) || host.parentElement?.firstElementChild !== host) return false;
    toText(host);
    return true;
  }

  // Backspace in an empty text block of a type that says `emptyToText` (a heading, small text): it turns
  // into an empty paragraph where it stands, the caret in it, one undo step (the user's, 2026-11-09: as an
  // emptied item or quote paragraph, and as every container left empty, goes back to body text). True
  // when it did.
  function emptied(host) {
    if (!isEmpty(host) || !says(host, "emptyToText")) return false;
    toText(host);
    return true;
  }

  return { enter, backspace, emptied };
}
