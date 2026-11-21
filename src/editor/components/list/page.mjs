import { UNIT, dropIfEmpty, holderItem, isEmpty, isHost, keepLine, nestedBlocks, nestedLists, newContainer, newHost, newTail, ownHTML, parentItem, placeBefore } from "../../page/core.mjs";
import { caretAt, select } from "../../page/caret.mjs";
import { markerAt } from "../../page/geometry.mjs";
import { rangeAt, rangeOffsets } from "../../page/marks.mjs";
import { begin, done, made } from "../../page/made.mjs";
import { createMenu } from "../../page/menu.mjs";
import { keptByComponent } from "../../page/page-objects.mjs";
import { hideTooltip, tooltipAt } from "../../page/tooltip.mjs";
import { addStyle, element, textButton } from "../../page/ui.mjs";
import { CHECKED, CONTINUE, FLOW, START, TODO, heldListType, holdsSays, listType, mergeSays } from "./index.mjs";
import { BLOCK_TYPES, accepts } from "../registry.mjs";
import { FLOW_KEY, isFlowLabel } from "../../../shared/components/list.mjs";
import { tidyLists } from "./join.mjs";
import { continuation, formatNumber, formatOf, keepContinuing, numberOf, parseNumber } from "./numbers.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// Lists on the page (docs/editor.md "Lists"). An item indents under the
// item before it (Tab): it goes to the end of that item's last list (a new list of its own kind when
// it has none), its own lists coming along. Back out (Shift+Tab, Backspace at the start of a nested
// item, Enter on it empty), it goes right after the item it hung from, and the items after it in its
// list become its own (at the end of its last list). Several selected items indent and outdent
// together. Backspace at the start of an item of a list in a flow turns it into body text where it
// stands (the list split there, the items after it numbered from 1 again), its own lists following it;
// Enter at its start puts an empty item above it; Enter on it empty turns it into body text. A
// whole list turns into the other kind of list (retagList, the block menu). A flowchart (流程图) is
// components/flowchart/'s: its steps are nodes, never items, so nothing here reaches them (an item of a
// list a node holds is the outermost of its list: core.mjs parentItem stops at the node); its 方向,
// the flowchart's and a node's, is that component's too (components/flowchart/page.mjs menuItems).
//
// Numbers: consecutive items are one list from 1;
// a block between two lists starts the second at 1 again, and lists a change sets side by side
// become one (join.mjs). A number is the reader's to set too: a click on it opens 开始新列表 (from 1
// again) and 修改编号值 (a number of its own, typed as its depth writes numbers: 3, c, iii). On an
// item in the middle of a list, a new list starts there (the list split). A list right after
// another with a number of its own says so (its start written, 1 too), so it is not joined to it.
// "3. " typed at a block's start begins a list at 3. A list a file writes counting on from the one
// before it (data-continue) keeps its start in step as the lists before it change (keepContinuing).

const isItem = (node) => node?.localName === "li";
const itemsOf = (list) => [...list.children].filter(isItem);

/**
 * Turn a list into another kind of list (`type`: bullets, numbers, todo): a new element of its tag
 * with the same attributes (a numbered one's own only on an ol, the to-do class only on a to-do
 * list) and items. What the kit set on a flowchart (the key of its layout, the name it gave it) is
 * the kit's, never carried. A list and a flowchart are made of each other node by item
 * (components/flowchart/page.mjs), not retagged.
 */
export function retagList(list, type) {
  const { tag, className } = BLOCK_TYPES[type];
  const next = list.ownerDocument.createElement(tag);
  const kits = (name, value) => name === FLOW_KEY || (name === "aria-label" && isFlowLabel(value) && list.classList.contains(FLOW));
  for (const { name, value } of list.attributes) if ((tag === "ol" || (name !== START && name !== CONTINUE)) && !kits(name, value)) next.setAttribute(name, value);
  for (const name of [TODO, FLOW]) next.classList.toggle(name, name === className);
  if (next.getAttribute("class") === "") next.removeAttribute("class");
  next.setAttribute("data-ge-type", type);
  if (list.hasAttribute("data-ge-unit")) next.setAttribute("data-ge-convert", list.getAttribute("data-ge-unit"));
  list.replaceWith(next);
  placeBefore(next, [...list.childNodes], null);
  return next;
}

// ---------- nested list items ----------

// An item that may hold lists: in the file (its list-holding box) or made on the page.
const nestable = (item) => item?.tagName === "LI" && (item.getAttribute("data-ge-box-kind") === "nest" || (item.hasAttribute("data-ge-new") && !item.hasAttribute("data-ge-unit")));
const inBox = (item) => Boolean(item?.parentElement?.hasAttribute("data-ge-box"));

// The last list of an item that takes items, when it is the last block the item holds, or a new one of
// this type (bullets, numbers, todo: heldListType) put at its end.
function listIn(item, type) {
  const last = nestedBlocks(item).at(-1);
  if (last?.matches("ul, ol") && last.hasAttribute("data-ge-box")) return last;
  const list = made(newContainer(item.ownerDocument, heldListType(type)));
  item.append(list);
  return list;
}

/** Whether a list item can indent (Tab) or outdent (Shift+Tab). */
export function canNest(item, delta) {
  if (item?.tagName !== "LI" || !inBox(item)) return false;
  if (delta > 0) return nestable(item.previousElementSibling) && item.previousElementSibling.tagName === "LI";
  const parent = parentItem(item);
  return Boolean(parent) && inBox(parent) && (item.nextElementSibling === null || nestable(item));
}

/** The containers whose child lists indenting or outdenting an item may change. */
export function nestParents(item) {
  const list = item.parentElement;
  const parent = parentItem(item);
  const previous = item.previousElementSibling;
  return [...new Set([list, parent, parent?.parentElement, previous, nestedLists(previous).at(-1), item, nestedLists(item).at(-1)].filter((node) => node?.nodeType === 1))];
}

// Tab: the item goes under the one before it.
function indentOne(item) {
  if (!canNest(item, 1)) return false;
  placeBefore(listIn(item.previousElementSibling, listType(item.parentElement)), [item], null);
  return true;
}

// Shift+Tab: the item goes out of its list, right after the item it hung from; the items after it
// in its list become its own.
function outdentOne(item) {
  if (!canNest(item, -1)) return false;
  const list = item.parentElement;
  const parent = parentItem(item);
  const rest = [...list.children].slice([...list.children].indexOf(item) + 1);
  if (rest.length > 0) placeBefore(listIn(item, listType(list)), rest, null);
  placeBefore(parent.parentElement, [item], parent.nextSibling);
  dropIfEmpty(list);
  return true;
}

/** Tab: the item goes under the one before it. Returns { focus, created }. */
export function indentItem(item) {
  begin();
  return done(indentOne(item) ? item : null);
}

/** Shift+Tab: the item goes out of its list, right after the item it hung from. Returns { focus, created }. */
export function outdentItem(item) {
  begin();
  return done(outdentOne(item) ? item : null);
}

// ---------- other blocks under an item ----------
// A block of another kind (a paragraph, a heading, an image…) goes under a list item as its child:
// Tab right after a list puts it under that list's
// last item, at the end of what the item holds; Shift+Tab (or Backspace at its start) on the last
// block an item holds takes it out, right after the item: the item's list split there, the items
// after it a list of their own after the block (numbered from 1 again, as a block between lists
// makes them).

// The item right before a block: the last item of the list right before it.
const itemBefore = (block) => (block?.previousElementSibling?.matches("ul, ol") ? itemsOf(block.previousElementSibling).at(-1) ?? null : null);

/** Whether a block that is no list item can go under the item before it (`delta` 1) or out of the item holding it (-1). */
export function canHold(block, delta) {
  if (!block || isItem(block) || !inBox(block) || !accepts("nest", block.getAttribute("data-ge-unit-kind"))) return false;
  if (delta > 0) {
    const item = itemBefore(block);
    return nestable(item) && inBox(item);
  }
  const item = holderItem(block);
  return Boolean(item) && nestedBlocks(item).at(-1) === block && inBox(item) && inBox(item.parentElement);
}

/** The containers whose child lists `hold` changes for a block. */
export function holdParents(block, delta) {
  const item = delta > 0 ? itemBefore(block) : holderItem(block);
  return [...new Set([block.parentElement, item, item?.parentElement, item?.parentElement?.parentElement].filter(Boolean))];
}

function holdOne(block, delta) {
  if (!canHold(block, delta)) return false;
  if (delta > 0) {
    placeBefore(itemBefore(block), [block], null);
    return true;
  }
  const item = holderItem(block);
  const list = item.parentElement;
  const rest = itemsOf(list).slice(itemsOf(list).indexOf(item) + 1);
  placeBefore(list.parentElement, [block], list.nextSibling);
  if (rest.length > 0) {
    const tail = made(newTail(list, listType(list)));
    block.after(tail);
    placeBefore(tail, rest, null);
  }
  return true;
}

/** Tab (1) or Shift+Tab (-1) on a block that is no item: under the item before it, or out of the one holding it. Returns { focus, created }. */
export function holdBlock(block, delta) {
  begin();
  return done(holdOne(block, delta) ? block : null);
}

// ---------- the numbers' look while the page is edited ----------

const STYLE = `
  [data-ge-editing] main ol > li[data-ge-number]::before { background: var(--ge-hover); cursor: pointer; }
  [data-ge-editing] main ol > li[data-ge-number="pressed"]::before { background: var(--ge-press); }
  [data-ge-editing] main ul.doc-todo > li::before { cursor: pointer; transition: background-color .2s ease-out, border-color 100ms ease-out; }
  /* A to-do's box under the pointer, and pressed (data-ge-todo-box, the page's only: no file holds a data-ge-*): an
     unchecked box's gray line darker at once (the kit's --doc-check-line-hover, todo.css: the product's one checkbox
     of 2026-11-17), pressed with a faint fill under it too; a check's blue comes in over .2s, not in one frame. */
  [data-ge-editing] main ul.doc-todo > li:not([data-checked]):is([data-ge-todo-box="over"], [data-ge-todo-box="down"])::before { border-color: var(--doc-check-line-hover); transition: background-color .2s ease-out; }
  [data-ge-editing] main ul.doc-todo > li:not([data-checked])[data-ge-todo-box="down"]::before { background-color: light-dark(rgb(66 35 3 / 6%), rgb(252 252 252 / 6%)); }
  @media (prefers-reduced-motion: reduce) { [data-ge-editing] main ul.doc-todo > li::before { transition: none; } }
  .ge-list-value { display: flex; align-items: center; gap: 8px; padding: 5px 7px 7px; } /* 12px from the card's sides, its padding (--ge-card-pad) and 7 */
  .ge-list-value-title { padding: 5px 7px 0; color: var(--ge-tx2); font-size: 12px; font-weight: 500; line-height: 14px; }
  .ge-list-value input { box-sizing: border-box; flex: 1; min-width: 0; height: 28px; margin: 0; padding: 0 8px; border: 0; border-radius: var(--ge-r-ctl); outline: none; background: var(--ge-field); color: var(--ge-tx); font: inherit; box-shadow: inset 0 0 0 1px var(--ge-edge); } /* a field at rest as the menu card's search (menu.mjs) */
  .ge-list-value input:focus { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ge-tx3) 60%, transparent); }
  .ge-list-value .ge-btn { flex: none; }
`;

// ---------- keys, numbers ----------

/**
 * Lists' keys and numbers, with what the editor gives it: struct (a structural undo step), say,
 * convertHost (a text block turned into a type), targetsOf (convert.mjs), look (an
 * undoable change of a block's attributes, history.mjs: look(element, change, select), `select`
 * selected again on undo), isEditing and blocks() (the block tools, whose selection a click on a box follows).
 */
export function create({ struct, say, convertHost, targetsOf, look, isEditing, blocks }) {
  addStyle(STYLE);

  // ---------- a to-do's box ----------
  // A click on a to-do item's box (the kit's, drawn before it: todo.css) checks it or takes the
  // check away; the selected to-do items with it when it is one of them (all to the same state),
  // one undo step. Ctrl+Enter in an item does it for that item. The box is the item's
  // ::before: a press on it, on its item's first line, is on it (geometry.mjs markerAt).
  const isTodo = (item) => isItem(item) && item.parentElement?.classList.contains(TODO);
  const onBox = (item, x, y) => markerAt(item, x, y) !== null;
  function check(items) {
    const todo = items.filter(isTodo);
    if (todo.length === 0) return false;
    const checked = !todo[0].hasAttribute(CHECKED);
    look(todo, { attributes: { [CHECKED]: checked ? "" : null } });
    return true;
  }
  // The box under the pointer, marked on its item (BOX: "over", "down" from a press to its release) for the
  // fill its ::before cannot take by :hover (a pseudo-element's own place is not the item's).
  const BOX = "data-ge-todo-box";
  let boxed = null;
  const markBox = (item, state) => {
    // Any other item marked goes (one an undo step put back with its item, as it stood then, too).
    if (boxed !== item) for (const node of document.querySelectorAll(`[${BOX}]`)) if (node !== item) node.removeAttribute(BOX);
    boxed = state ? item : null;
    if (item && state && item.getAttribute(BOX) !== state) item.setAttribute(BOX, state);
    else if (item && !state) item.removeAttribute(BOX);
  };
  const boxUnder = (event) => {
    if (!isEditing() || !(event.target instanceof Element)) return null;
    const item = event.target.closest("main li");
    return item && isTodo(item) && onBox(item, event.clientX, event.clientY) ? item : null;
  };
  document.addEventListener("pointermove", (event) => {
    if (event.buttons && boxed?.getAttribute(BOX) === "down") return;
    const item = boxUnder(event);
    if (item || boxed) markBox(item, item ? "over" : null);
  }, { passive: true });
  document.addEventListener("pointerup", (event) => {
    if (!boxed) return;
    const item = boxUnder(event);
    markBox(item, item ? "over" : null);
  }, { passive: true });
  document.addEventListener("pointerleave", () => markBox(null, null));
  document.addEventListener("mousedown", (event) => {
    if (!isEditing() || event.button !== 0 || keptByComponent(event.target)) return;
    const item = [...document.elementsFromPoint(event.clientX, event.clientY)].map((node) => node.closest?.("main li")).find((node) => node && isTodo(node) && onBox(node, event.clientX, event.clientY))
      ?? [...document.querySelectorAll("main ul.doc-todo > li")].find((node) => onBox(node, event.clientX, event.clientY));
    if (!item) return;
    event.preventDefault();
    event.stopPropagation();
    const chosen = blocks()?.picked ?? [];
    check(chosen.includes(item) ? chosen : [item]);
    markBox(item, "down"); // after the change, so no undo step holds it
  }, true);
  // Tab and Shift+Tab in a list item: it goes under the item before it, or back out a level; the
  // caret stays where it was.
  function nest(host, delta) {
    if (!canNest(host, delta)) {
      say(delta > 0 ? t("这一项上面没有同级的项，不能再缩进。") : t("这一项已经在最外层。"));
      return;
    }
    const selection = getSelection();
    const offsets = selection.rangeCount && host.contains(selection.anchorNode) ? rangeOffsets(host, selection.getRangeAt(0)) : null;
    const result = struct(nestParents(host), [host], () => {
      const { focus, created } = delta > 0 ? indentItem(host) : outdentItem(host);
      return focus ? { touched: [focus], focus, created } : null;
    });
    if (!result) return;
    host.focus({ preventScroll: true });
    if (offsets) select(rangeAt(host, offsets));
    else caretAt(host, "start");
  }

  /**
   * Tab or Shift+Tab with blocks selected: the selected items (not those inside another selected
   * one) indent or outdent together, as one undo step (outdenting from the last, so each keeps its
   * place). True when every selected block is an item and one moved.
   */
  function nestBlocks(units, delta) {
    if (units.length > 0 && units.every((unit) => !isItem(unit))) return holdBlocks(units, delta);
    if (units.length === 0 || !units.every(isItem)) return false;
    const items = units.filter((item) => !units.some((other) => other !== item && other.contains(item)));
    const order = delta > 0 ? items : [...items].reverse();
    if (!order.some((item) => canNest(item, delta))) {
      say(delta > 0 ? t("选中的项上面没有同级的项，不能再缩进。") : t("选中的项已经在最外层。"));
      return true;
    }
    const parents = [...new Set(items.flatMap((item) => [...nestParents(item), ...nestParents(item).flatMap((node) => isItem(node) ? nestParents(node) : [])]))];
    struct(parents, items, () => {
      begin();
      const moved = order.filter((item) => (delta > 0 ? indentOne(item) : outdentOne(item)));
      const { created } = done(null);
      return moved.length > 0 ? { touched: items, focus: null, created, select: items, reselect: true } : null;
    });
    say(t("{0} {1} 项 · Ctrl+Z 撤销", delta > 0 ? t("已缩进") : t("已取消缩进"), items.length));
    return true;
  }

  // Selected blocks that are no items (a paragraph, an image…): under the item before the first, in
  // their order, or out of the item holding them, the last first (each the last it holds by then);
  // one undo step. True when they were the list's to move (a list right before them, or an item
  // holding them).
  function holdBlocks(units, delta) {
    const order = delta > 0 ? units : [...units].reverse();
    if (!canHold(order[0], delta)) return false;
    const parents = [...new Set(order.flatMap((unit) => holdParents(unit, delta)))];
    struct(parents, [], () => {
      begin();
      const moved = order.filter((unit) => holdOne(unit, delta));
      const { created } = done(null);
      return moved.length > 0 ? { touched: [], focus: null, created, select: units, reselect: true } : null;
    });
    say(t("{0} · Ctrl+Z 撤销", delta > 0 ? t("已放到上一项下面") : t("已移出这一项")));
    return true;
  }

  // Tab or Shift+Tab in a block that is no item (a paragraph under an item, or right after a list):
  // under the item before it, or out of the item holding it; the caret stays where it was.
  function hold(host, delta) {
    const selection = getSelection();
    const offsets = selection.rangeCount && host.contains(selection.anchorNode) ? rangeOffsets(host, selection.getRangeAt(0)) : null;
    const result = struct(holdParents(host, delta), [host], () => {
      const { focus, created } = holdBlock(host, delta);
      return focus ? { touched: [focus], focus, created } : null;
    });
    if (!result) return false;
    host.focus({ preventScroll: true });
    if (offsets) select(rangeAt(host, offsets));
    else caretAt(host, "start");
    say(t("{0} · Ctrl+Z 撤销", delta > 0 ? t("已放到上一项下面") : t("已移出这一项")));
    return true;
  }

  // Enter on an empty nested item that is the last of what the item above it holds: it moves out a
  // level (a block whose type Enter carries on, the last child of its parent, is outdented). One with
  // more after it under that item (an item after it in its list, a block after its list) is turned
  // into body text where it stands instead (typing/leave.mjs: its list split around it, the paragraph
  // held by that item), never taking what follows under it as
  // Shift+Tab does. True when it moved out. Enter at the start of an item with text puts an empty item
  // above it (the editor's split does).
  function outdentEmpty(host) {
    if (!isEmpty(host) || !parentItem(host) || !canNest(host, -1) || !lastHeld(host)) return false;
    nest(host, -1);
    return true;
  }
  const lastHeld = (item) => item.parentElement.lastElementChild === item && nestedBlocks(parentItem(item)).at(-1) === item.parentElement;

  // Enter on an empty item: a nested one moves out a level, and one of a list in a flow holding blocks
  // turns into body text where it stands, what it holds after it, as Backspace turns it (Enter on an
  // empty block of a type that resets: text, its children kept); one holding none is
  // typing/leave.mjs's. True when it was the list's to handle.
  function enterEmpty(host) {
    if (outdentEmpty(host)) return true;
    return isEmpty(host) && nestedBlocks(host).length > 0 && backspace(host);
  }

  // Backspace at the start of a list item; true when it was the list's to handle. A nested item
  // moves out a level. An item of a list in a flow turns into body text where it stands (first into
  // text, and only then does Backspace join it to the line above); an item
  // holding lists takes them along after it. The items after it are a list of their own, from 1.
  function backspace(host) {
    if (parentItem(host) && canNest(host, -1)) {
      nest(host, -1);
      return true;
    }
    if (host.tagName !== "LI" || parentItem(host) || !inBox(host)) return false;
    if (nestedBlocks(host).length > 0) return toBodyText(host);
    if (targetsOf(host).includes("paragraph")) {
      convertHost(host, "paragraph");
      return true;
    }
    return false;
  }

  // An item holding lists turned into body text: a paragraph where it stood (its list split there,
  // the items after it from 1 again), its lists right after the paragraph.
  function toBodyText(host) {
    const list = host.parentElement;
    const flow = list.parentElement;
    if (!flow?.hasAttribute("data-ge-box") || !nestedBlocks(host).every((inner) => inner.matches(UNIT))) return false;
    let paragraph = null;
    const result = struct([list, flow, host], [host], () => {
      begin();
      const items = itemsOf(list);
      const index = items.indexOf(host);
      const rest = items.slice(index + 1);
      paragraph = newHost(host.ownerDocument, "paragraph");
      paragraph.innerHTML = ownHTML(host);
      const lists = nestedBlocks(host);
      if (index === 0) list.before(paragraph, ...lists);
      else {
        if (rest.length > 0) {
          const tail = made(newTail(list, listType(list)));
          placeBefore(tail, rest, null);
          list.after(tail);
        }
        list.after(paragraph, ...lists);
      }
      host.remove();
      dropIfEmpty(list);
      const { created } = done(paragraph);
      return { touched: [paragraph], focus: paragraph, created };
    });
    if (!result) return false;
    caretAt(paragraph, "start");
    say(t("已转换为文本 · Ctrl+Z 撤销"));
    return true;
  }

  // "3. " typed at a block's start, which a conversion made a numbered item of (markdown/): the item
  // shows that number. First in its list, the list starts there (the items after it counting on);
  // further down, it begins a list of its own at the number, the items after it in it. Runs inside
  // the conversion's undo step; returns the lists it made.
  function numberTyped(item, number) {
    const list = item?.parentElement;
    if (list?.localName !== "ol" || !Number.isInteger(number) || number < 1 || numberOf(item) === number) return [];
    const items = itemsOf(list);
    const index = items.indexOf(item);
    if (index === 0) {
      const start = ownStart(list, number);
      if (start === null) list.removeAttribute(START);
      else list.setAttribute(START, start);
      list.removeAttribute(CONTINUE);
      return [];
    }
    const own = newContainer(item.ownerDocument, "numbers");
    own.setAttribute(START, String(number)); // right after the list it leaves: a start of its own, 1 too
    list.after(own);
    placeBefore(own, items.slice(index), null);
    return [own];
  }

  // What a Markdown shortcut set on the item it made (`props` of a type's `markdown`): the number it
  // shows, or checked. Runs inside the conversion's undo step; returns the lists it made.
  function setProps(item, { number, checked }) {
    if (checked) item.setAttribute(CHECKED, "");
    return number ? numberTyped(item, number) : [];
  }

  // The start a list writes for its first number: none for 1, unless it stands right after another
  // numbered list, which it would otherwise join (join.mjs).
  const ownStart = (list, number) => (number === 1 && !(list.previousElementSibling?.localName === "ol" && listType(list.previousElementSibling) === "numbers") ? null : String(number));

  // ---------- a number clicked ----------

  const menu = createMenu();
  let hovered = null;

  // The number of an item of a numbered list the editor may change, under a point: { item, rect }.
  function numberAt(target, x, y) {
    const item = target?.closest?.("main li");
    const list = item?.parentElement;
    if (!isEditing() || list?.localName !== "ol" || listType(list) !== "numbers" || !list.hasAttribute("data-ge-box") || list.hasAttribute("data-ge-keep")) return null;
    const rect = markerAt(item, x, y);
    return rect ? { item, rect } : null;
  }

  function hover(found) {
    const item = found?.item ?? null;
    if (item === hovered) return;
    if (hovered && hovered.getAttribute("data-ge-number") !== "open") hovered.removeAttribute("data-ge-number");
    hideTooltip();
    hovered = item;
    if (!item) return;
    if (!item.hasAttribute("data-ge-number")) item.setAttribute("data-ge-number", "");
    if (!menu.isOpen) tooltipAt(found.rect, t("设置编号")); // after a moment, as every tooltip
  }

  document.addEventListener("mousemove", (event) => hover(numberAt(event.target, event.clientX, event.clientY)), { passive: true, capture: true });
  // A press on a number moves no caret and selects nothing; its click opens the menu.
  document.addEventListener("pointerdown", (event) => {
    if (menu.isOpen && !menu.contains(event.target)) menu.close();
    const found = event.button === 0 ? numberAt(event.target, event.clientX, event.clientY) : null;
    if (!found) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    found.item.setAttribute("data-ge-number", "pressed");
  }, true);
  document.addEventListener("click", (event) => {
    const found = numberAt(event.target, event.clientX, event.clientY);
    if (!found) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    openNumbers(found.item, found.rect);
  }, true);
  addEventListener("scroll", (event) => { if (menu.isOpen && !menu.contains(event.target)) menu.close(); }, { passive: true, capture: true });
  addEventListener("resize", () => menu.close());

  // The menu of a number (a menu card): what is not possible greyed. Consecutive items count on
  // by themselves, so there is no 继续之前的编号.
  function openNumbers(item, rect) {
    hideTooltip();
    const list = item.parentElement;
    const first = itemsOf(list)[0] === item;
    const number = numberOf(item);
    item.setAttribute("data-ge-number", "open");
    menu.open([
      { label: t("开始新列表"), disabled: number === 1, run: () => (first ? setFirst(list, 1) : splitAt(item, 1)) },
      { label: t("修改编号值"), run: () => openValue(item, rect) },
    ], rect, { label: t("设置编号"), icons: false, least: 136, highlight: false, onClose: () => item.removeAttribute("data-ge-number") });
  }

  // 修改编号值: the number typed as its depth writes numbers (3, c, iii), ↑/↓ a step, Enter or 确定 sets it.
  function openValue(item, rect) {
    const list = item.parentElement;
    const format = formatOf(list);
    const field = element("input", { type: "text", value: formatNumber(numberOf(item), format), spellcheck: "false", autocomplete: "off", "aria-label": t("新编号") });
    const apply = () => {
      const value = parseNumber(field.value, format);
      if (!Number.isInteger(value) || value < 1 || value > 999999999) {
        say(format === "decimal" ? t("编号是从 1 开始的整数。") : format === "lower-alpha" ? t("这一层的编号是字母（a、b、c…）或数字。") : t("这一层的编号是罗马数字（i、ii、iii…）或数字。"));
        field.focus();
        return;
      }
      menu.close();
      setNumber(item, value);
    };
    field.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Enter") apply();
      else if (event.key === "Escape") menu.close();
      else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        const value = parseNumber(field.value, format);
        const next = Math.min(999999999, Math.max(1, (Number.isInteger(value) ? value : 1) + (event.key === "ArrowUp" ? 1 : -1)));
        field.value = formatNumber(next, format);
      } else return;
      event.preventDefault();
    });
    const confirm = textButton(t("确定"), apply, { primary: true });
    const view = element("div", {}, element("div", { class: "ge-list-value-title", text: t("新编号为") }), element("div", { class: "ge-list-value" }, field, confirm));
    item.setAttribute("data-ge-number", "open");
    menu.open([{ node: view, cells: [] }], rect, { label: t("修改编号值"), icons: false, width: 148, highlight: false, typed: true, onClose: () => item.removeAttribute("data-ge-number") });
    field.focus({ preventScroll: true });
    field.select();
  }

  // The first item's number: the list's start (its own, from the list before it too).
  function setFirst(list, number) {
    if (look(list, { attributes: { [CONTINUE]: null, [START]: ownStart(list, number) } })) {
      say(t("{0} · Ctrl+Z 撤销", number === 1 ? t("已开始新列表") : t("编号已改为 {0}", formatNumber(number, formatOf(list)))));
    }
  }

  // A list right after a numbered list given the number that list counts on to: one list, its items
  // joining that one (selected and moved as one list then), one undo step.
  function joinPrevious(list) {
    const previous = list.previousElementSibling;
    const result = struct([previous, list, list.parentElement], [], () => {
      placeBefore(previous, itemsOf(list), null);
      list.remove();
      return { touched: [], focus: null };
    });
    if (result) say(t("已接上前面的编号 · Ctrl+Z 撤销"));
  }

  // An item's number set: on the first, the list's start (or the list before it taken on, when it
  // is the number that list counts on to); in the middle, a new list from the item at that number
  // (none when it already shows it, as it counts on).
  function setNumber(item, number) {
    const list = item.parentElement;
    if (itemsOf(list)[0] === item) {
      const previous = list.previousElementSibling;
      if (previous?.localName === "ol" && listType(previous) === "numbers" && continuation(list) === number) return joinPrevious(list); // counting on right after it: one list
      return setFirst(list, number);
    }
    if (numberOf(item) === number) return;
    splitAt(item, number);
    caretAt(item, "end");
  }

  // A new numbered list from an item on, at a number (the items after it count on from it). It
  // stands right after the list it leaves, so its start is written, 1 too: it is a list of its own.
  function splitAt(item, number) {
    const list = item.parentElement;
    const result = struct([list, list.parentElement], [], () => {
      begin();
      const tail = made(newContainer(item.ownerDocument, "numbers"));
      tail.setAttribute(START, String(number));
      placeBefore(tail, itemsOf(list).slice(itemsOf(list).indexOf(item)), null);
      list.after(tail);
      const { created } = done(item);
      return { touched: [], focus: item, created };
    });
    if (result) say(t("{0} · Ctrl+Z 撤销", number === 1 ? t("已开始新列表") : t("编号已改为 {0}", formatNumber(number, formatOf(list)))));
  }

  // A list a file writes counting on from the one before it (data-continue) keeps its start in step
  // as the lists before it change (items made, removed or moved, a start set): written as the page changes, never a step of
  // its own, so undo puts it back with what it follows. A list whose start changed is drawn again:
  // Chrome does not recount the kit's numbers (counter(list-item) in ::before) for a start set later.
  new MutationObserver((records) => {
    if (!isEditing()) return;
    for (const list of new Set(records.filter((record) => record.type === "attributes" && record.target.localName === "ol").map((record) => record.target))) recount(list);
    const lists = (nodes) => [...nodes].some((node) => node.localName === "ol" || node.localName === "ul" || isItem(node));
    if (!records.some((record) => record.type === "attributes" || record.target.localName === "ol" || lists(record.addedNodes) || lists(record.removedNodes))) return;
    keepContinuing(document.querySelector("main") ?? document.body);
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: [START, CONTINUE, "value"] });

  // Its numbers drawn again: taken out of the layout and back in one go (nothing shows in between),
  // its style attribute as it was.
  function recount(list) {
    if (!list.isConnected) return;
    const style = list.getAttribute("style");
    list.style.display = "none";
    void list.offsetHeight;
    if (style === null) list.removeAttribute("style");
    else list.setAttribute("style", style);
  }

  // What a structural step may leave untidy around lists (history.mjs): the lists it set side by side
  // (join.mjs), and an item of the containers it changes that holds blocks with no text of its own and
  // has no line (keepLine), as the page opened on it gives it one: an item the file writes empty that
  // Tab gave the next item, items pasted or dropped with no text over what they hold.
  function tidy(parents) {
    const lists = tidyLists(parents);
    return {
      parents: lists.parents,
      settle(result) {
        for (const parent of parents.filter((node) => node.isConnected)) {
          for (const item of [parent, ...parent.querySelectorAll("li")]) if (item.localName === "li" && isHost(item)) keepLine(item);
        }
        return lists.settle(result);
      },
    };
  }

  return {
    nestBlocks, setProps,
    tidy,
    /** What was typed or deleted in an item: one left with no text over the blocks it holds keeps its line. */
    typed: keepLine,
    mergeRefused: (host) => mergeSays(nestedBlocks(host)),
    keys: {
      // Tab and Shift+Tab in an item nest it.
      tab({ host }, back) {
        nest(host, back ? -1 : 1);
        return true;
      },
      commandEnter: ({ host }) => check([host]), // checks a to-do
      enter: ({ host }) => enterEmpty(host),
      backspace: ({ host }) => backspace(host),
      // Delete in an empty item holding blocks: it does not go by itself.
      delete({ host }) {
        if (!isEmpty(host) || nestedBlocks(host).length === 0) return false;
        say(holdsSays(nestedBlocks(host)));
        return true;
      },
      // A block of another component right after a list goes under its last item, and the last block
      // an item holds out of it (a list's alone here: no other block holds blocks that way). Tab and
      // Shift+Tab, and Backspace at its start.
      around: {
        tab({ host }, back) {
          const delta = back ? -1 : 1;
          return canHold(host, delta) && hold(host, delta);
        },
        backspace: ({ host }) => canHold(host, -1) && hold(host, -1),
      },
    },
    /** The nodes to keep in the top layer when a modal dialog opens. */
    get nodes() { return menu.nodes; },
  };
}
