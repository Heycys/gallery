import { can, ownHTML } from "../core.mjs";
import { select } from "../caret.mjs";
import { typeOf, typedTargets } from "../convert.mjs";
import { formatRange } from "../marks.mjs";
import { spaceAround } from "../../../shared/inline-spacing.mjs";
import { padCaret } from "../pads.mjs";
import { pageOf, pageOfType } from "../page-objects.mjs";
import { inlineMark, markdownShortcut } from "./rules.mjs";

// Shortcuts as the reader types (docs/editor.md, "New blocks and conversions"): the Markdown of a
// type (its `markdown`, tried in rules.mjs) at a block's start converts it at once, what was typed
// being removed in the same undo step; "**text**" or "`text`" closed at the caret becomes bold or code through
// marks.mjs formatRange, and what is typed next goes after the new element. A "/" typed into an
// empty block opens the "/" menu (slash-menu/), and an "@" the "@" menu (at-menu/), each of which then
// follows what is typed. Each opens on what was typed (`data`, the input's or a composition's end) and on
// nothing else: a "/", "、" or "@" the caret merely comes to stand after (a deletion, a cut, an undo, a
// paste, the arrow keys, a click: no `data`) opens none.

/**
 * slash: the "/" menu (slash-menu/); at: the "@" menu (at-menu/). convert(host, type, typed): turn a text block into another
 * type as one undo step, `typed` (a range of what was typed) taken away first (editor.mjs
 * convertHost; a fourth argument, what else that step does to the converted block). recordStep(host,
 * before): a change of a block's text as its own undo step (history.mjs).
 */
export function createMarkdown({ slash, at, convert, recordStep }) {
  /** Text was typed (or composed) into `host`; `data`: what arrived. */
  function typed(host, data) {
    if (slash.host) return slash.update();
    if (at.host) return at.update();
    if (pageOf(host)?.shortcut?.(host, data)) return;
    const selection = getSelection();
    if (!selection.rangeCount || !selection.isCollapsed || !host.contains(selection.anchorNode)) return;
    const head = document.createRange();
    head.setStart(host, 0);
    head.setEnd(selection.anchorNode, selection.anchorOffset);
    const before = head.toString();
    const whole = host.textContent.replace(/ /g, " ").trim();
    if (slash.typed(host, before, whole, data) || at.typed(host, before, data)) return;
    if (head.cloneContents().querySelector("[data-ge-atom]")) return; // Markdown begins a block: no formula before it
    const alone = before === whole;
    const shortcut = markdownShortcut(before, { alone, takes: (type) => typeOf(host) !== type && typedTargets(host, alone).includes(type) });
    if (shortcut) {
      const { type, props } = shortcut;
      // A space put between the marker and the text after it (autoSpace: "3" next to Chinese) goes with the marker.
      const node = selection.anchorNode;
      let end = selection.anchorOffset;
      if (node.nodeType === 3 && !shortcut.alone) {
        while (node.data[end] === " ") end++;
        head.setEnd(node, end);
      }
      // What the shortcut sets (a numbered list's first number, a to-do checked): on the block it made, in the same step.
      const then = Object.keys(props).length > 0 ? (block) => pageOfType(type).setProps(block, props) : null;
      return convert(host, type, head, then);
    }
    if (data && /[*`]$/.test(data) && !can(host, "plain")) inlineShortcut(host, selection);
  }

  // "**text**" or "`text`" just closed at the caret, within one run of text: the markers go and
  // the text between is bold or code; the caret goes on after it, outside the new element.
  function inlineShortcut(host, selection) {
    const node = selection.anchorNode;
    if (node.nodeType !== 3 || node.parentElement.closest("code")) return;
    const offset = selection.anchorOffset;
    const found = inlineMark(node.data.slice(0, offset));
    if (!found) return;
    const before = ownHTML(host);
    const marker = found.name === "bold" ? 2 : 1;
    node.deleteData(offset - marker, marker);
    node.deleteData(found.start, marker);
    const range = document.createRange();
    range.setStart(node, found.start);
    range.setEnd(node, offset - 2 * marker);
    const result = formatRange(host, range, found.name, true);
    const end = result.endContainer.nodeType === 3 ? result.endContainer.parentElement : result.endContainer;
    const mark = end.closest(found.name === "bold" ? "strong, b" : "code");
    // Inline code stands a space apart from the words beside it (shared/inline-spacing.mjs spaceAround).
    const spaces = found.name === "code" && mark && host.contains(mark) ? spaceAround(mark) : { after: null };
    recordStep(host, before);
    // The browser puts text typed at the end of an element into it, so what follows would be bold
    // or code too: the caret goes into a pad after the element (pads.mjs), or after the space put
    // there.
    if (!mark || !host.contains(mark)) return select(result);
    if (!spaces.after) return void padCaret(mark, "after");
    const caret = document.createRange();
    caret.setStart(spaces.after, 1);
    select(caret);
  }

  return { typed };
}
