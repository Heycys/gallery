import { OUTER, UNIT, blocksIn, boxKind, heldIn, newHost, newTail, placeBefore, unitElement, withLeads } from "../core.mjs";
import { containerType } from "../convert.mjs";
import { begin, done, made } from "../made.mjs";
import { caretBeside } from "../beside.mjs";
import { caretAt, nearestOnLine, placeCaret, selectAt } from "../caret.mjs";
import { sectionOps } from "../page-objects.mjs";
import { endOf, hoverAt, innerBox, measure } from "../geometry.mjs";
import { BOXED, HOLDS_ONE, accepts } from "../../components/registry.mjs";
import { DIALOG } from "../../components/kit.mjs";

// Where new blocks come from (docs/editor.md, "New blocks and conversions" and "Selecting
// blocks"): a click on the empty space below the last block of a box (not one whose end is its
// padding; a new paragraph there, or the caret into the empty one already at its end), Enter at the very start of a block (a paragraph
// before it), the handle's "+" (an empty block beside the block: addNear), and the block menu's new section after a block (components/section/page.mjs). A
// paragraph made here is written once it has text. "在下方新建一块" in a block's menu, like the "/"
// menu's blocks in a block with text, is the editor's insertBelow; blocks also come from conversions
// (convert.mjs), pasting (clipboard/) and splitting a block (typing/).

/**
 * struct(parents, touched, mutate): the editor's undoable structural change (history.mjs). blocks():
 * the block tools (blocks.mjs). after: the caret after a block (after/).
 */
export function createInsert({ struct, blocks, after }) {
  // An empty paragraph right before the block of a text block, the caret staying where it is.
  // Returns whether one could go there.
  function paragraphBefore(host) {
    const unit = unitElement(host);
    const box = unit?.parentElement;
    if (!unit || !box || !accepts(box.getAttribute("data-ge-box-kind"), "paragraph")) return false;
    const paragraph = newHost(document, "paragraph");
    struct([box], [], () => {
      box.insertBefore(paragraph, withLeads(unit)[0]);
      return { touched: [paragraph], focus: host };
    });
    caretAt(host, "start");
    return true;
  }

  // A new, empty paragraph in `parent` right after `after` (null: at its start), with the caret in it.
  // `picked`: the blocks selected as it was made, which undo selects again and redo leaves for its caret.
  function newParagraph(parent, after, picked = null) {
    const paragraph = newHost(document, "paragraph");
    struct([parent], [], () => {
      if (after) after.after(paragraph);
      else parent.prepend(paragraph);
      return { touched: [paragraph], focus: paragraph, ...(picked ? { select: picked, caret: paragraph } : {}) };
    });
    caretAt(paragraph, "start");
  }

  // A click on empty space (selection/marquee.mjs), below the last block of the box clicked (the
  // page, a Sheet panel, a section, a column, a detail card's content, a flowchart's node; below the
  // report, the page): a new paragraph at its end, or the caret into the empty paragraph already there
  // (geometry.mjs endOf). Under the last block of a box whose end is its own padding (endIsPadding: a
  // highlight block, a callout, a disclosure's content; the user's, 2026-11-06: a block is made only
  // below the page and in a column) it is a gap like any other, below. Right of
  // a boxed block (a code block, a callout, a file…: not text) or a row of columns, at its height
  // (boxedBeside), the caret after it, at its bottom right (after/: Backspace deletes it, Enter or a
  // key makes a paragraph after it; the user's, 2026-11-09: a click there selected it before).
  // Elsewhere beside text, the caret goes into the text block on that line (the nearest of those
  // side by side), where the line is nearest the click; in the gap between two
  // blocks, or beside a block of no text, into the nearer of the blocks around it that is text, in the
  // innermost box at that height (boxBeside: the press may be on the page's margin, the block in a
  // Sheet's panel or a section), else in the boxes around that one, at the place nearest the click on
  // its nearest line (somewhere in the box clicked or around it, when any is text). The page stays where it
  // is, that text out of sight too (caretNear: a click on empty space never scrolls the page).
  function clickBlank(x, y, target) {
    // In an open detail card, its content is the page: never a block behind it (marquee.mjs topOf).
    const card = target?.closest?.(DIALOG.open);
    const main = card ? card.querySelector(DIALOG.openContent) : document.querySelector("main");
    if (!main) return;
    if (doubleBlank(main, x, y, target)) return;
    // A box that always holds a block (holdsOne) that the file has empty, clicked (a disclosure's
    // content showing its placeholder, a highlight block of only its icon): a paragraph in it, after
    // its lead.
    if (HOLDS_ONE.has(target?.getAttribute?.("data-ge-box-kind")) && main.contains(target) && heldIn(target).length === 0) {
      return newParagraph(target, blocksIn(target).at(-1) ?? null);
    }
    const box = boxAt(main, target);
    const end = endOf(measure(box), y + scrollY);
    if (end?.focus) return caretAt(end.focus, "end");
    if (end) return newParagraph(end.box, end.after);
    const top = y + scrollY;
    const beside = boxedBeside(main, x, y, target);
    if (beside) return after.place(beside);
    const host = hoverAt(measure(main, { top, bottom: top }), x + scrollX, top, { reach: Infinity, skip: (unit) => !unit.text });
    if (host) return caretNear(host, x, y);
    for (let around = boxBeside(box, x, y); around; around = around === box ? null : around.parentElement.closest("[data-ge-box]")) {
      const { above, below } = neighbours(around, y);
      const nearer = [above, below].filter(Boolean).sort((a, b) => gapTo(a, y) - gapTo(b, y));
      for (const unit of nearer) {
        const text = textEdge(unit, unit === above);
        if (text) return caretNear(text, x, unit === above ? text.getBoundingClientRect().bottom - 2 : text.getBoundingClientRect().top + 2);
      }
    }
  }

  // A second click on empty space right after the first, where it was (a double click: the press on
  // empty space is the box selection's, so the browser makes no dblclick of it), between two boxed
  // blocks of a box (two callouts, a code block and a file…): a new paragraph between them, with the
  // caret (a single click there finds no text to go to).
  let lastBlank = null;
  function doubleBlank(main, x, y, target) {
    const now = performance.now();
    const twice = lastBlank && now - lastBlank.time < 450 && Math.hypot(x - lastBlank.x, y - lastBlank.y) < 6;
    lastBlank = twice ? null : { time: now, x, y };
    if (!twice) return false;
    const box = boxBeside(boxAt(main, target), x, y);
    const { above, below } = neighbours(box, y);
    if (!above || !below || !boxed(above) || !boxed(below) || !accepts(box.getAttribute("data-ge-box-kind") ?? "flow", "paragraph")) return false;
    blocks().clear();
    newParagraph(box, above);
    return true;
  }

  // The caret into text block `host` at the place nearest (x, y) on the line nearest y; where no place
  // can be read off the window (a block out of sight), its start or end, the page staying where it is.
  function caretNear(host, x, y) {
    const at = nearestOnLine(host, x, y);
    if (at) {
      host.focus({ preventScroll: true });
      selectAt(at, y);
    } else placeCaret(host, x < host.getBoundingClientRect().left ? "start" : "end");
  }

  // The box a click on empty space was in: the one it targets, else the page.
  const boxAt = (main, target) => (target?.hasAttribute?.("data-ge-box") && main.contains(target) ? target : main);

  // The innermost box of `box` at the height of (x, y) (window coordinates): what stands beside a click there.
  const boxBeside = (box, x, y) => {
    const top = y + scrollY;
    return innerBox(measure(box, { top, bottom: top }), x + scrollX, top).el;
  };

  // The blocks of `box` right above and right below height `y` (window coordinates), either null.
  function neighbours(box, y) {
    let above = null;
    let below = null;
    for (const unit of [...box.children].filter((child) => child.matches(UNIT) && child.getClientRects().length > 0)) {
      const rect = unit.getBoundingClientRect();
      if (rect.bottom <= y && (!above || rect.bottom > above.getBoundingClientRect().bottom)) above = unit;
      if (rect.top >= y && (!below || rect.top < below.getBoundingClientRect().top)) below = unit;
    }
    return { above, below };
  }
  const gapTo = (unit, y) => {
    const rect = unit.getBoundingClientRect();
    return Math.max(rect.top - y, y - rect.bottom, 0);
  };
  // A block that is no text of its own (its category: a card, a container of its own or a whole
  // block, a highlight block, a callout; a code block, a formula block, a divider), as opposed to text
  // blocks and the boxes text flows in (a list, a quote, a section, columns).
  const boxed = (unit) => BOXED.has(unit.getAttribute("data-ge-unit-kind"));
  // The text block of `unit` at its bottom (`last`) or its top: itself, or the last (first) of those it holds; none in a boxed block.
  function textEdge(unit, last) {
    if (boxed(unit)) return null;
    const texts = [unit, ...unit.querySelectorAll("[data-ge-block], [data-ge-new]")].filter((node) => node.isContentEditable && node.getClientRects().length > 0 && !node.closest("details:not([open]) > :not(summary)"));
    return (last ? texts.at(-1) : texts[0]) ?? null;
  }
  // A boxed block or a row of columns at height `y` with (x, y) right of it: between its right edge
  // and the text area's it stands in (a table, a picture narrower than its column: the user's,
  // 2026-11-09, the caret after it where a click there once selected it, 2026-11-07, and later went to
  // the nearest text), in the padding of the box it stands in (a highlight block's, a callout's) or in the
  // page's margin; or null. Never in another text area (the blank box `target` the press was on holds the
  // block: a column further right is no place beside one in the column left of it). The innermost,
  // but never a block inside a row of columns the click is to the right of too (the caret goes after
  // the row): past a column's edge is the gap to the next column, whose press is the gap's (columns/:
  // it drags, a click alone changes nothing), or past the row.
  function boxedBeside(main, x, y, target) {
    let found = null;
    const right = (unit) => {
      const rect = unit.getBoundingClientRect();
      if (y < rect.top || y > rect.bottom || (target?.contains && !target.contains(unit))) return false;
      return x > rect.right;
    };
    for (const unit of main.querySelectorAll(`[data-ge-unit-kind]`)) {
      if (!caretBeside(unit) || !unit.parentElement?.hasAttribute("data-ge-box") || unit.parentElement.closest("details:not([open])")) continue;
      if (!right(unit)) continue;
      const row = unit.parentElement.closest('[data-ge-unit-kind="columns"]');
      if (row && main.contains(row) && right(row)) continue;
      if (!found || found.contains(unit)) found = unit; // the innermost
    }
    return found;
  }

  // A new paragraph, or a section holding one, right after a block (the block menu).
  function addAfter(unit, what) {
    if (what !== "paragraph") return sectionOps()?.addAfter(unit);
    blocks().clear();
    newParagraph(unit.parentElement, unit);
  }

  // Enter on selected blocks that are no text (blocks.mjs): a new paragraph right after the last of
  // them, with the caret, when its box takes one. Returns whether one was made.
  function paragraphAfter(unit) {
    const box = unit?.parentElement;
    if (!box || !accepts(box.getAttribute("data-ge-box-kind") ?? "flow", "paragraph")) return false;
    const picked = [...blocks().picked];
    blocks().clear();
    newParagraph(box, unit, picked.length > 0 ? picked : null);
    return true;
  }

  // The handle's "+" (handle/): an empty paragraph at the block's level, right after it ("below")
  // or right before it ("above": Alt, before its lead), the caret in it: a text block beside the
  // block in its parent, here a paragraph in the box the block stands in where it takes one (the
  // page, a section, a column, a quote, a disclosure's content, the blocks a list item holds, a
  // node's content). A list's item is a block of the box its list stands in (the user's, 2026-10-26): the
  // paragraph goes beside it at its level (after what the item holds), its list split there as
  // turning an item into 文本 splits it (convert.mjs takeOut: the items after it a list of their
  // own, a numbered one's from 1 again); an item only where that box takes no paragraph. Where the
  // box takes neither, beside the first block out whose box takes a paragraph (a flowchart's node is
  // the editor's: flowchart/ addAfter). One undo step. Returns the new block, or null when none can
  // go there.
  function addNear(unit, where = "below") {
    let at = unit;
    let type = null;
    while (at && !type) {
      const kind = boxKind(at.parentElement);
      type = accepts(kind, "paragraph") ? "paragraph" : accepts(kind, "item") ? "item" : null;
      if (!type) at = at.parentElement?.closest(OUTER) ?? null;
    }
    if (!at) return null;
    blocks().clear();
    const list = type === "item" && accepts(boxKind(at.parentElement.parentElement), "paragraph") ? at.parentElement : null;
    const fresh = newHost(document, list ? "paragraph" : type, at);
    if (list) {
      struct([list, list.parentElement], [], () => {
        begin();
        const items = blocksIn(list);
        const index = items.indexOf(at) + (where === "above" ? 0 : 1);
        if (index === 0) list.before(fresh);
        else if (index === items.length) list.after(fresh);
        else {
          const tail = made(newTail(list, containerType(list)));
          placeBefore(tail, items.slice(index), null);
          list.after(fresh, tail);
        }
        return { ...done(fresh), touched: [fresh] };
      });
    } else {
      struct([at.parentElement], [], () => {
        if (where === "above") withLeads(at)[0].before(fresh);
        else at.after(fresh);
        return { touched: [fresh], focus: fresh };
      });
    }
    caretAt(fresh, "start");
    return fresh;
  }

  return { paragraphBefore, newParagraph, clickBlank, addAfter, paragraphAfter, addNear };
}
