import { select } from "../../page/caret.mjs";
import { padCaret } from "../../page/pads.mjs";
import { TAB, isNote } from "./index.mjs";

// 小字's Tab (small text: isNote): what follows the caret stands at the line's right end, a
// span.doc-tab the kit floats there (styles/flow.css), as a line of scope on the left and unit
// on the right; Tab before one puts the words up to it into it too. Shift+Tab, or Tab with the
// caret in that end part, puts its words back after the words before it.

/** Tab (`back`: Shift+Tab) in small text `host`. Returns whether it changed (the caller records it). */
function noteTab(host, back) {
  const selection = getSelection();
  if (!selection.rangeCount || !host.contains(selection.anchorNode)) return false;
  const tab = host.querySelector(`:scope > span.${TAB}`);
  const range = selection.getRangeAt(0);
  if (back || tab?.contains(range.startContainer)) {
    if (!tab) return false;
    // Its words back where it stood, the caret where they begin.
    const mark = document.createTextNode("");
    tab.before(mark);
    tab.replaceWith(...tab.childNodes);
    const caret = document.createRange();
    caret.setStartAfter(mark);
    mark.remove();
    select(caret);
    return true;
  }
  // The words from the caret to the end part (or the line's end) go to the right.
  const rest = document.createRange();
  rest.setStart(range.startContainer, range.startOffset);
  if (tab) rest.setEndBefore(tab);
  else rest.setEnd(host, host.childNodes.length);
  const words = rest.extractContents();
  const span = tab ?? Object.assign(document.createElement("span"), { className: TAB });
  span.prepend(words);
  if (!tab) host.append(span);
  padCaret(span, "start");
  return true;
}

/** Small text's keys (`keys`), with what the editor gives it: recordText (one step of typing). */
export function create({ recordText }) {
  return {
    keys: {
      tab({ host }, back) {
        if (!isNote(host)) return false;
        if (noteTab(host, back)) recordText(host);
        return true;
      },
    },
  };
}
