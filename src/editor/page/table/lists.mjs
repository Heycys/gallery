import { ZWSP } from "../../../shared/inline-spacing.mjs";
// Lists in a table's cells (单元格里的列表; as the reader settled it, 2026-10-18): a cell stays one
// text block, a list is part of its text (<td>…<ul><li>…</li></ul>…</td>: core.mjs serializeInner,
// source/blocks.mjs inlineProblem), the cell's lines its own lines (<br> between them) and its
// lists'. "- " (or "* ") typed at the start of a line makes it a bulleted list's item, "1. " a
// numbered one's (into the list right above or below it of that kind); in an item, Enter makes the
// next one with what follows the caret, Enter in an empty one leaves the list (an empty line where it
// was, the items after it a list of their own), Backspace at an item's start makes it a line again.
// Each is one undo step of the cell's text. A paste's lists go in by the same rules (placeInCell).

const isList = (node) => node?.nodeType === 1 && (node.tagName === "UL" || node.tagName === "OL");
const isBreak = (node) => node?.nodeType === 1 && node.tagName === "BR";
// What stands on a line of the cell with others: neither a line break nor a list.
const inline = (node) => Boolean(node) && !isBreak(node) && !isList(node);
const empty = (node) => !node.textContent.replaceAll(ZWSP, "").trim() && !node.querySelector("[data-ge-atom], img");
// A line break holding the caret on an empty line or in an empty item (left out when written).
const holder = () => document.createElement("br");

/** t: the table tools (index.mjs): struct, say. */
export function createCellLists(t) {
  // The cell's child holding a node (the node itself at the cell's level).
  const topOf = (cell, node) => {
    while (node && node.parentNode !== cell) node = node.parentNode;
    return node;
  };

  // The caret, put after a change of the cell's text.
  function caret(node, offset) {
    const range = document.createRange();
    range.setStart(node, offset);
    range.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }

  // One undo step of the cell's text.
  const change = (cell, mutate, said) => {
    let after = null;
    t.struct([], [cell], () => {
      after = mutate();
      return { touched: [cell], focus: null };
    });
    after?.();
    if (said) t.say(said);
  };

  /** A space typed into a cell: "- ", "* " or "1. " at the start of a line makes it a list's item. Returns whether it did. */
  function typed(cell, data) {
    if (data !== " ") return false;
    const selection = getSelection();
    if (!selection.rangeCount || !selection.isCollapsed) return false;
    const at = selection.getRangeAt(0);
    if (!cell.contains(at.startContainer)) return false;
    const inside = at.startContainer.nodeType === 1 ? at.startContainer : at.startContainer.parentElement;
    if (inside?.closest("li") && cell.contains(inside.closest("li"))) return false;
    // The line: the cell's children between the break or list before the caret and the one after it.
    const top = at.startContainer === cell ? cell.childNodes[at.startOffset - 1] : topOf(cell, at.startContainer);
    if (!inline(top)) return false;
    let first = top;
    while (inline(first.previousSibling)) first = first.previousSibling;
    let last = top;
    while (inline(last.nextSibling)) last = last.nextSibling;
    const head = document.createRange();
    head.setStartBefore(first);
    head.setEnd(at.startContainer, at.startOffset);
    const typedText = head.toString().replace(/ /g, " ");
    const tag = /^[-*] $/.test(typedText) ? "UL" : /^1\. $/.test(typedText) ? "OL" : null;
    if (!tag || head.cloneContents().querySelector("[data-ge-atom]")) return false;
    // The whole line (a live range: it follows the marker's removal).
    const line = document.createRange();
    line.setStartBefore(first);
    line.setEndAfter(last);
    change(cell, () => {
      head.deleteContents(); // the marker
      const item = document.createElement("li");
      item.append(line.extractContents());
      if (empty(item)) item.replaceChildren(holder());
      // Where the line was; a list stands on lines of its own: the breaks around it go.
      let before = cell.childNodes[line.startOffset - 1] ?? null;
      let after = cell.childNodes[line.startOffset] ?? null;
      if (isBreak(after)) {
        const next = after.nextSibling;
        after.remove();
        after = next;
      }
      if (isBreak(before)) {
        const previous = before.previousSibling;
        before.remove();
        before = previous;
      }
      // Into the list of its kind right above it (and the one right below it joins), else a new one.
      let list = before?.tagName === tag ? before : null;
      if (list) list.append(item);
      else {
        list = document.createElement(tag.toLowerCase());
        list.append(item);
        cell.insertBefore(list, after);
      }
      if (after?.tagName === tag) {
        list.append(...after.children);
        after.remove();
      }
      return () => caret(item, 0);
    });
    return true;
  }

  /** A key in a cell (no modifier): Enter in an item, Backspace at an item's start. Returns whether it was the list's. */
  function key(event, cell) {
    if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || (event.key !== "Enter" && event.key !== "Backspace")) return false;
    const selection = getSelection();
    if (!selection.rangeCount) return false;
    const at = selection.getRangeAt(0);
    const inside = at.startContainer.nodeType === 1 ? at.startContainer : at.startContainer.parentElement;
    const item = inside?.closest("li");
    if (!item || !cell.contains(item) || item.parentElement?.parentElement !== cell) return false;
    if (event.key === "Enter") {
      enter(cell, item, at);
      return true;
    }
    const start = document.createRange();
    start.setStart(item, 0);
    start.setEnd(at.startContainer, at.startOffset);
    if (!selection.isCollapsed || start.toString() !== "" || start.cloneContents().querySelector("[data-ge-atom]")) return false;
    unlist(cell, item);
    return true;
  }

  // Enter in an item: the next item with what follows the caret; in an empty one, out of the list.
  function enter(cell, item, at) {
    change(cell, () => {
      if (!at.collapsed) at.deleteContents();
      const list = item.parentElement;
      if (empty(item)) {
        const after = [...list.children].slice([...list.children].indexOf(item) + 1);
        item.remove();
        const line = holder();
        list.after(line);
        if (after.length > 0) {
          const rest = document.createElement(list.tagName.toLowerCase());
          rest.append(...after);
          line.after(rest);
        }
        if (list.children.length === 0) list.remove();
        return () => caret(cell, [...cell.childNodes].indexOf(line));
      }
      const tail = document.createRange();
      tail.setStart(at.startContainer, at.startOffset);
      tail.setEnd(item, item.childNodes.length);
      const next = document.createElement("li");
      next.append(tail.extractContents());
      if (empty(next)) next.replaceChildren(holder());
      if (empty(item)) item.replaceChildren(holder());
      item.after(next);
      return () => caret(next, 0);
    });
  }

  // Backspace at an item's start: a line where it was (the items before it stay in the list, those
  // after it a list of their own), on a line of its own.
  function unlist(cell, item) {
    change(cell, () => {
      const list = item.parentElement;
      const items = [...list.children];
      const index = items.indexOf(item);
      const after = items.slice(index + 1);
      const nodes = empty(item) ? [holder()] : [...item.childNodes].filter((node, i, all) => !(isBreak(node) && i === all.length - 1));
      item.remove();
      const reference = index === 0 ? list : list.nextSibling;
      if (index === 0 ? inline(list.previousSibling) : false) cell.insertBefore(document.createElement("br"), reference);
      for (const node of nodes) cell.insertBefore(node, reference);
      if (index > 0 && after.length > 0) {
        const rest = document.createElement(list.tagName.toLowerCase());
        rest.append(...after);
        cell.insertBefore(rest, reference);
      }
      if (list.children.length === 0) list.remove();
      // A line followed by words of the cell's: a break between them.
      const end = nodes.at(-1);
      if (inline(end.nextSibling) && !isBreak(end)) end.after(document.createElement("br"));
      const first = nodes[0];
      return () => caret(cell, [...cell.childNodes].indexOf(first));
    });
  }

  return { typed, key };
}

/** Whether nodes of a cell's text (components/table/index.mjs cellNodes) hold a list. */
export const listsIn = (nodes) => nodes.some(isList);

/**
 * `nodes`, a cell's text made of what is pasted (components/table/index.mjs cellNodes) with lists among
 * them, in at `at` in `cell` (a collapsed range out of the marks around the caret). At a line of the
 * cell its lists stand on lines of their own: the line break that ended the caret's line before or after
 * them goes, and a list of them beside one of its kind joins it. In an item the item splits there, as
 * Enter splits it: what comes before the first list joins the words before the caret, the items of its
 * lists and the lines between them (each run of them an item) follow as items, each of its own list's
 * kind (the caret's list split around those of another), the words after the caret joining the last,
 * and an item left with no words gives them its place. Returns a range for the caret, at the end of
 * what went in.
 */
export function placeInCell(cell, at, nodes) {
  const doc = cell.ownerDocument;
  const marker = doc.createTextNode(""); // where the caret goes
  const inside = at.startContainer.nodeType === 1 ? at.startContainer : at.startContainer.parentElement;
  const item = inside?.closest("li");
  if (item && cell.contains(item) && item.parentElement?.parentElement === cell) inItem(doc, item, at, nodes, marker);
  else {
    const fragment = doc.createDocumentFragment();
    fragment.append(...nodes);
    const last = nodes.at(-1);
    if (isList(last)) last.lastElementChild.append(marker);
    else fragment.append(marker);
    at.insertNode(fragment);
    const first = nodes[0];
    let end = last; // the last list, joined to one before it too
    if (isList(first)) {
      const before = beside(first, false);
      if (isBreak(before) && inline(beside(before, false))) before.remove();
      const above = beside(first, false);
      if (joinLists(above, first) && first === last) end = above;
    }
    if (isList(end)) {
      const after = beside(end, true);
      if (isBreak(after)) after.remove();
      joinLists(end, beside(end, true));
    }
  }
  const range = doc.createRange();
  range.setStartBefore(marker);
  range.collapse(true);
  marker.remove();
  return range;
}

// The sibling of `node` before it (after it: `forward`), past empty text (the pads a split leaves).
function beside(node, forward) {
  let next = forward ? node.nextSibling : node.previousSibling;
  while (next?.nodeType === 3 && !next.data.replaceAll(ZWSP, "")) next = forward ? next.nextSibling : next.previousSibling;
  return next;
}

// Two lists side by side of one kind made one (the first keeps the items of both). Returns whether they were.
function joinLists(first, second) {
  if (!isList(first) || !isList(second) || first.tagName !== second.tagName) return false;
  first.append(...second.children);
  second.remove();
  return true;
}

// Pasted in `item`, a cell's list's item, at `at` (placeInCell).
function inItem(doc, item, at, nodes, marker) {
  const list = item.parentElement;
  const after = doc.createRange();
  after.setStart(at.startContainer, at.startOffset);
  after.setEnd(item, item.childNodes.length);
  const tail = after.extractContents();
  // What goes after the item: { tag, nodes } each.
  const rows = [];
  let leading = true;
  for (const node of nodes) {
    if (isList(node)) {
      leading = false;
      for (const entry of [...node.children]) rows.push({ tag: node.tagName, nodes: [...entry.childNodes] });
    } else if (leading) item.append(node);
    else if (rows.at(-1)?.run) rows.at(-1).nodes.push(node);
    else rows.push({ tag: list.tagName, run: true, nodes: [node] });
  }
  rows.at(-1).nodes.push(marker, ...tail.childNodes);
  const kinds = new Map();
  let previous = item;
  for (const row of rows) {
    const entry = doc.createElement("li");
    const words = row.nodes.filter((node) => !(isBreak(node) && node === row.nodes.at(-1) && row.nodes.length > 1));
    entry.append(...words);
    if (empty(entry)) entry.append(holder());
    kinds.set(entry, row.tag);
    previous.after(entry);
    previous = entry;
  }
  if (empty(item)) item.remove();
  // The caret's list split around items of another kind.
  const entries = [...list.children];
  if (entries.every((entry) => (kinds.get(entry) ?? list.tagName) === list.tagName)) return;
  const lists = [];
  for (const entry of entries) {
    const tag = kinds.get(entry) ?? list.tagName;
    if (lists.at(-1)?.tagName !== tag) lists.push(doc.createElement(tag.toLowerCase()));
    lists.at(-1).append(entry);
  }
  list.replaceWith(...lists);
  joinLists(beside(lists[0], false), lists[0]);
  joinLists(lists.at(-1), beside(lists.at(-1), true));
}
