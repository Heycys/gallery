import { UNIT, boldThroughout, dropIfEmpty, emptyContainer, firstLineOf, heldIn, isEmpty, isFirstLine, isHost, nestedBlocks, newContainer, newHost, ownHTML } from "../../page/core.mjs";
import { arrow, atEdge, caretAt, hosts } from "../../page/caret.mjs";
import { begin, done, made } from "../../page/made.mjs";
import { formatRange } from "../../page/marks.mjs";
import { ICONS } from "../../page/menu.mjs";
import { TOGGLES, accepts, sizeValue, textTypeOf } from "../registry.mjs";
import { START, validStart } from "../list/index.mjs";
import { FLOW_DIRECTION, FLOW_RATIO, isFlowchart, isStep, nodeAround, validDirection } from "./index.mjs";
import { FLOW_ROW, flowShares } from "../../../shared/components/list.mjs";
import { svg } from "../icons.mjs";
import { addStyle } from "../../page/ui.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// 步骤流程图 on the page (index.mjs; docs/editor.md, "Flowcharts"). A node is a container as a
// highlight block is, its keys the highlight block's (Enter splits the block the caret is in,
// Backspace at a block's start joins it to the block above, an empty one deleted, Delete joins the
// block after it), the list machinery never reaching it (core.mjs: parentItem, holderItem,
// previousLine and nextLine stop at it), and a few rules of its own (its keys, decided 2026-10-25):
//   - Enter on the empty last block of a node (not its first line) takes that block out of the node:
//     it is the first line of a new node right after it (`enter`);
//   - Enter on the empty first line of the flowchart's last node, which holds nothing else, takes the
//     node out of the flowchart: its line a body paragraph right after the flowchart (`enter`);
//   - Enter in the first line splits it, what follows the caret a plain paragraph below it, never a
//     new node or a list (core.mjs splitBlock); at its very start, with words in it, a new node goes
//     before this one, the caret and the words (their bold too) staying where they are (`enterAtStart`);
//   - Backspace at the start of a node's first line deletes the node when nothing is written in it
//     (core.mjs emptyContainer: the step is `removedEmpty`), and otherwise changes nothing, the caret
//     going to the end of the node before (`backspace`); a block of its content never leaves it by
//     Backspace or Shift+Tab (a list item of it at its start a paragraph of the node, as in a
//     highlight block: components/list/page.mjs);
//   - Delete at the end of a node's last block does nothing: neither the next node nor the block
//     after the flowchart is taken in (`forwardDelete`; core.mjs nextLine);
//   - Tab and Shift+Tab indent only within the lists a node holds; nodes never nest (`tab`: a hint).
// A new node comes after one from the round "+" at its right (add.mjs) and from its block menu
// (在后面添加节点, menuItems), one undo step, the caret in its empty first line, bold armed
// (format-bar/). The conversions' DOM work (a list's item made a node and back, a whole list made a
// flowchart and back) is here; where they take a block out of its container and put it back
// (convert.mjs) they are the conversions'.
//
// The layout tools (the user's choice of 2026-10-25): 方向 in the block menu of
// the flowchart (自动换行, 排成一行, 排成一列: the list's data-direction) and of a node (under 这个节点之后:
// 跟随整体, 向右, 向下: the node's own data-direction, for the joint after it; then the flowchart's
// three, under 整个流程图, the handles a reader finds on a flowchart being its nodes'), one undo step
// each (menuItems); and the widths of the nodes of a row, dragged at the gap between two of them (the gap
// tool of 分栏, page/columns/, which finds a flowchart's rows here: rowsOfFlow, rowShares,
// leastWidth), written as each node's weight in its row (--doc-flow-ratio).

// ---------- nodes and titles (DOM only; tested with jsdom) ----------

/** The node (a flowchart's step) a block stands right in, or null. */
export const stepOf = (block) => (isStep(block?.parentElement) ? block.parentElement : null);

// The whole text of a block as a range.
const wholeOf = (host) => {
  const range = host.ownerDocument.createRange();
  range.selectNodeContents(host);
  return range;
};

/**
 * A paragraph made a node's title: its text bold throughout (<p><strong>…</strong></p>), unless it
 * is so already or empty (an empty one is empty: bold is armed in it as the caret comes, format-bar/).
 * Returns it.
 */
export function asTitle(paragraph) {
  if (isEmpty(paragraph)) paragraph.replaceChildren();
  else if (!boldThroughout(paragraph)) formatRange(paragraph, wholeOf(paragraph), "bold", true);
  return paragraph;
}

/** A title's words as the own text of a list item made of its node: its bold taken off when it covers them all (as inline HTML). */
export function titleWords(paragraph) {
  const copy = paragraph.cloneNode(true);
  if (boldThroughout(copy)) formatRange(copy, wholeOf(copy), "bold", false);
  return ownHTML(copy);
}

// The color classes of an element that a unit kind takes (an item's for a node, a node's for an item).
const colorsFor = (element, kind) => [...element.classList].filter((name) => (TOGGLES[kind] ?? []).includes(name));

/**
 * A new node (a step and its node box, a container the change made) holding `blocks`, its icon
 * first when one is among them; an empty title made first when no paragraph comes first after its
 * icon (a node's first block is always one). `colors`: its color classes.
 */
export function newStep(doc, blocks = [], colors = []) {
  const step = made(newContainer(doc, "step"));
  for (const name of colors) step.classList.add(name);
  const icon = blocks.find((block) => block.matches?.(".doc-icon")) ?? null;
  const rest = blocks.filter((block) => block !== icon);
  const first = rest[0];
  const title = first && textTypeOf(first) === "paragraph" ? [] : [newHost(doc, "paragraph")];
  step.append(...(icon ? [icon] : []), ...title, ...rest);
  return step;
}

/** A list's item made a node: its words its title (bold), the blocks it holds its content, its color its own. */
export function stepFromItem(item) {
  const doc = item.ownerDocument;
  const title = newHost(doc, "paragraph");
  title.innerHTML = ownHTML(item);
  return newStep(doc, [asTitle(title), ...nestedBlocks(item)], colorsFor(item, "step"));
}

/** A node made a list's item: its title's words its own text (bold taken off), the rest of its blocks held after them; its icon is left behind. */
export function itemFromStep(step) {
  const doc = step.ownerDocument;
  const item = newHost(doc, "item");
  for (const name of colorsFor(step, "item")) item.classList.add(name);
  const first = firstLineOf(step);
  if (first) item.innerHTML = titleWords(first);
  // What it holds is no part of the item's text (core.mjs editableAhead does the same for an item the file has).
  const held = heldIn(step).filter((block) => block !== first);
  for (const block of held) if (block.getAttribute("contenteditable") !== "true") block.setAttribute("contenteditable", "false");
  item.append(...held);
  return item;
}

/**
 * A list (a whole one) turned into a flowchart in its place: each of its items a node (stepFromItem),
 * what an item holds that node's content as it is; its first number (an ol's) and its direction, when
 * it has them, kept. Returns the flowchart.
 */
export function flowchartFromList(list) {
  const flow = made(newContainer(list.ownerDocument, "flowchart"));
  if (list.localName === "ol" && validStart(list.getAttribute(START))) flow.setAttribute(START, list.getAttribute(START));
  if (validDirection(list.getAttribute(FLOW_DIRECTION))) flow.setAttribute(FLOW_DIRECTION, list.getAttribute(FLOW_DIRECTION));
  flow.append(...[...list.children].filter((child) => child.localName === "li").map(stepFromItem));
  list.replaceWith(flow);
  return flow;
}

/**
 * A flowchart turned into a list of `type` (bullets, numbers, todo) in its place: each node an item
 * (itemFromStep); a numbered list keeps its first number. Returns the list.
 */
export function listFromFlowchart(flow, type) {
  const list = made(newContainer(flow.ownerDocument, type));
  if (type === "numbers" && validStart(flow.getAttribute(START))) list.setAttribute(START, flow.getAttribute(START));
  list.append(...[...flow.children].filter(isStep).map(itemFromStep));
  flow.replaceWith(list);
  return list;
}

/**
 * A highlight block turned into a flowchart of one node holding its blocks as they are (its icon in
 * the number's place, an empty title first when its first block is no paragraph), its background the
 * node's. Returns the flowchart.
 */
export function flowchartFromPanel(panel) {
  const doc = panel.ownerDocument;
  const flow = made(newContainer(doc, "flowchart"));
  const blocks = [...panel.children].filter((child) => child.matches(UNIT));
  flow.append(newStep(doc, blocks, colorsFor(panel, "step")));
  panel.replaceWith(flow);
  return flow;
}

/** A node's blocks for a highlight block made of it (its icon among them), its background the block's. */
export const panelColors = (step) => colorsFor(step, "highlight");

// ---------- rows and widths (read from the page) ----------

/**
 * A flowchart's rows as the kit laid them out (runtime/flowchart.js): its nodes shown, in order, a row
 * the run of them whose cards stand at one height (a flex line: its cards' tops are one), the next
 * row lower. One list of nodes a row.
 */
export function rowsOfFlow(flow) {
  const rows = [];
  let top = null;
  for (const step of [...flow.children].filter(isStep)) {
    const rect = step.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (top !== null && Math.abs(rect.top - top) < 2) rows.at(-1).push(step);
    else rows.push([step]);
    top = rect.top;
  }
  return rows;
}

/** A node's weight in its row as its style attribute writes it (--doc-flow-ratio: a positive number), or null. */
export function weightOf(step) {
  const value = Number(step.style.getPropertyValue(FLOW_RATIO).trim() || NaN);
  return value > 0 && Number.isFinite(value) ? value : null;
}

/** The shares of the row's width the nodes of a row take now, as the kit lays them out (the shared description's flowShares). */
export const rowShares = (steps) => flowShares(steps.map(weightOf));

/** A share written as a node's weight (to three places; the least a part of a row takes, at most all of it). */
export const weightValue = (share) => sizeValue("step", FLOW_RATIO, String(share));

// A run of letters, digits and marks a line cannot break in (a Chinese, Japanese or Korean character
// is a word of its own, narrower than any card: the kit's runtime/flowchart.js WORDS).
const LONG_WORD = /[^\s\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef]{2,}/g;
// The elements whose box a line of words starts in (where a word's line begins: a list's indent, a quote's).
const LINE_START = "p, h1, h2, h3, h4, h5, h6, li, blockquote, figcaption, td, th, summary, div";

/**
 * The narrowest a node's card may be drawn beside others (px), as the kit lays it out (runtime/
 * flowchart.js `fits`): FLOW_ROW.least, and its longest word with what stands beside it (from the
 * card's left edge to where that word's line starts: its padding and border, a list's or a quote's
 * indent; its padding and border on the right). Its words measured where they are drawn (a range's
 * boxes), its icon's and the editor's own drawings left out.
 */
export function leastWidth(step) {
  const card = step.getBoundingClientRect();
  const style = getComputedStyle(step);
  const right = (parseFloat(style.paddingRight) || 0) + (parseFloat(style.borderRightWidth) || 0);
  const walker = step.ownerDocument.createTreeWalker(step, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => (node.parentElement?.closest("[data-doc-dev], .doc-icon") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const range = step.ownerDocument.createRange();
  let least = FLOW_ROW.least;
  for (let text = walker.nextNode(); text; text = walker.nextNode()) {
    for (const match of text.data.matchAll(LONG_WORD)) {
      range.setStart(text, match.index);
      range.setEnd(text, match.index + match[0].length);
      const width = [...range.getClientRects()].reduce((sum, box) => sum + box.width, 0);
      const line = text.parentElement.closest(LINE_START) ?? step;
      const lineStyle = getComputedStyle(line);
      const start = line === step ? card.left + (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.paddingLeft) || 0)
        : line.getBoundingClientRect().left + (parseFloat(lineStyle.borderLeftWidth) || 0) + (parseFloat(lineStyle.paddingLeft) || 0);
      least = Math.max(least, Math.ceil(start - card.left + width + right));
    }
  }
  return least;
}

// ---------- directions (方向) ----------

// The mock's icons, on the 20-unit grid at the menus' line weight (menu.mjs): the 方向 row a node and
// its two ways out (right and down); 自动换行 (跟随整体) a node and a spark (the kit measures); 接在右边
// (排成一行) two nodes side by side and the arrow between them; 接在下边 (排成一列) one below the other
// and the arrow down.
const ROUTE_ICON = svg('<rect x="2.75" y="2.75" width="5" height="5" rx="1.25"/><path d="M9.75 5.25h6.5M14.5 3.5l1.75 1.75-1.75 1.75"/><path d="M5.25 9.75v6.5M3.5 14.5l1.75 1.75 1.75-1.75"/>');
const AUTO_ICON = svg('<rect x="2.75" y="7.25" width="9.5" height="8.5" rx="2"/><path d="M15.25 2.5c.3 1.55.95 2.2 2.5 2.5-1.55.3-2.2.95-2.5 2.5-.3-1.55-.95-2.2-2.5-2.5 1.55-.3 2.2-.95 2.5-2.5z" fill="currentColor" stroke-width="1"/>');
const RIGHT_ICON = svg('<rect x="2.25" y="7.25" width="4.25" height="5.5" rx="1.25"/><rect x="13.5" y="7.25" width="4.25" height="5.5" rx="1.25"/><path d="M8 10h4M10.5 8.5 12 10l-1.5 1.5"/>');
const DOWN_ICON = svg('<rect x="7.25" y="2.25" width="5.5" height="4.25" rx="1.25"/><rect x="7.25" y="13.5" width="5.5" height="4.25" rx="1.25"/><path d="M10 8v4M8.5 10.5 10 12l1.5-1.5"/>');

// The flowchart's three (its data-direction), each its words alone, no note under it (the user,
// 2026-10-25): 自动换行 none (the kit fills rows as wide as read well and wraps the rest onto the next:
// the user's decision of 2026-10-25), 排成一行 row (one row, wrapping only where a card would be
// narrower than it may be), 排成一列 column (one node a row).
const FLOW_CHOICES = [
  { value: null, label: t("自动换行"), icon: AUTO_ICON },
  { value: "row", label: t("排成一行"), icon: RIGHT_ICON },
  { value: "column", label: t("排成一列"), icon: DOWN_ICON },
];
// A node's three (its own data-direction, for the joint after it, winning over the flowchart's),
// no note under them either: 跟随整体 none (the flowchart's), 接在右边 row (the next node beside it,
// past the kit's count while the cards keep their least width), 接在下边 column (the row ends after it,
// the arrow turning from this row's end to the next row's start).
const NODE_CHOICES = [
  { value: null, label: t("跟随整体"), icon: AUTO_ICON },
  { value: "row", label: t("接在右边"), icon: RIGHT_ICON },
  { value: "column", label: t("接在下边"), icon: DOWN_ICON },
];

// ---------- keys, a new node ----------

// A node keeps its card's corners while edited (the kit's, flowchart.css), the blocks in it a text
// block's (editor.mjs --ge-text-radius, passed down to them otherwise); an empty title says what it is
// at the title's weight (the editor's placeholder, typing/ updatePlaceholder).
const STYLE = `
  [data-ge-editing] ol.doc-flow > li { --ge-text-radius: 8px; }
  [data-ge-editing] ol.doc-flow > li > * { --ge-text-radius: 3px; }
  [data-ge-editing] ol.doc-flow > li > p[data-ge-placeholder]:first-of-type::before { font-weight: 700; }
`;

/**
 * Flowcharts' keys, a new node and 方向, with what the editor gives it: struct (a structural undo
 * step), look (an undoable change of a block's attributes, history.mjs: look(element, change,
 * select), `select` selected again on undo) and say (the status line).
 */
export function create({ struct, look, say }) {
  addStyle(STYLE);
  /**
   * A new node right after `step`, its first line empty (bold armed there as the caret comes:
   * format-bar/), the caret in it: one undo step. Returns the new node. `before`: right before
   * `step` instead (the block handle's "+" with Alt).
   */
  function addAfter(step, { before = false } = {}) {
    if (!step?.isConnected || !step.parentElement?.hasAttribute("data-ge-box")) return null;
    let node = null;
    const result = struct([step.parentElement], [], () => {
      begin();
      node = newStep(step.ownerDocument);
      if (before) step.before(node);
      else step.after(node);
      const { created } = done(null);
      const title = firstLineOf(node);
      return { touched: [title], focus: title, created };
    });
    if (!result) return null;
    caretAt(result.focus, "start");
    say(t("已添加节点 · Ctrl+Z 撤销"));
    return node;
  }

  // Enter on an empty block of a node. True when it was the node's: its empty last block (not its
  // first line) the first line of a new node after it (an empty paragraph the block was, or one
  // standing for it); the empty first line of the flowchart's last node, holding nothing else, a
  // body paragraph after the flowchart (the node going, and the flowchart when it had no other).
  function enter(host) {
    const step = stepOf(host);
    if (!step || !isEmpty(host) || !isHost(host)) return false;
    const held = heldIn(step);
    const flow = step.parentElement;
    if (!isFirstLine(host)) {
      if (held.at(-1) !== host) return false;
      const result = struct([flow, step], [host], () => {
        begin();
        const paragraph = host.localName === "p" && !host.classList.contains("doc-note") ? host : newHost(host.ownerDocument, "paragraph");
        if (paragraph !== host) host.remove();
        step.after(newStep(host.ownerDocument, [paragraph]));
        const { created } = done(null);
        return { touched: [paragraph], focus: paragraph, created };
      });
      if (!result) return false;
      caretAt(result.focus, "start");
      return true;
    }
    if (held.length !== 1 || [...flow.children].filter(isStep).at(-1) !== step) return false;
    if (!accepts(flow.parentElement?.getAttribute("data-ge-box-kind"), "paragraph") || flow.hasAttribute("data-ge-keep")) return false;
    const result = struct([flow.parentElement, flow, step], [host], () => {
      flow.after(host);
      step.remove();
      dropIfEmpty(flow);
      return { touched: [host], focus: host };
    });
    if (!result) return false;
    caretAt(host, "start");
    return true;
  }

  // Enter with the caret at the very start of a node's first line holding words: a new node before
  // this one, its first line empty (bold armed there as the caret comes), the caret staying at the
  // start of this one's, whose words keep their bold (a list makes an empty item before an item so,
  // and a highlight block an empty line before its first one: nothing goes before a node's first
  // line in it, so the empty line is a node of its own). One undo step. True when it was the node's.
  function enterAtStart(host) {
    const step = stepOf(host);
    if (!step || !isFirstLine(host) || isEmpty(host) || !atEdge(host, false) || !step.parentElement?.hasAttribute("data-ge-box")) return false;
    const result = struct([step.parentElement], [], () => {
      begin();
      const node = newStep(step.ownerDocument);
      step.before(node);
      const { created } = done(null);
      return { touched: [firstLineOf(node)], focus: host, created };
    });
    if (!result) return false;
    caretAt(host, "start");
    return true;
  }

  // Backspace at the start of a node's first line, the node holding something (an empty one is
  // deleted whole, core.mjs emptyContainer, by typing/): nothing changes but the caret, which goes to the
  // end of the node before, where ← takes it from here (caret.mjs arrow: the end of that node's last
  // block, a code block there opened at the end of its code, a closed disclosure there at the end of
  // its title; the text blocks alone would skip a code block not open yet); in the first node it
  // stays, and the status line says why. True when it was the node's.
  function backspace(host) {
    if (!isFirstLine(host) || !stepOf(host) || emptyContainer(host)) return false;
    const step = stepOf(host);
    const before = step.previousElementSibling;
    if (!isStep(before)) {
      say(t("节点里还有内容：清空后再按 Backspace 会删除节点"));
      return true;
    }
    if (arrow(host, "ArrowLeft")) return true;
    const last = hosts().filter((node) => before.contains(node)).at(-1);
    if (last) caretAt(last, "end");
    return true;
  }

  // Delete at the end of a text block in a node. True when it was the node's: at the end of the
  // node's last block nothing happens (the next node and the block after the flowchart stay where
  // they are); an empty first line with blocks after it is not deleted (a node's first block is
  // always its title): the block after it joins it as Delete joins any (typing/).
  function forwardDelete(host) {
    const step = nodeAround(host);
    if (!step) return false;
    return hosts().filter((node) => nodeAround(node) === step).at(-1) === host;
  }

  // Tab and Shift+Tab in a node that the lists did not take (components/list/page.mjs takes them in
  // an item of a list the node holds, and Tab in a block right after such a list): nodes never nest,
  // and a block never leaves its node, so nothing moves; the status line says where Tab works. True
  // when it was the node's.
  function tab(host) {
    if (!nodeAround(host)) return false;
    say(t("节点不能缩进：Tab 只在节点里的列表中缩进。"));
    return true;
  }

  // The choices of 方向 for `element` (the flowchart, or a node), under `title`, the one it has
  // checked: a choice writes data-direction on it (none for the first: the flowchart's 自动, a node's
  // 跟随整体), one undo step that selects `target` again (the block whose menu it was), the status
  // line saying what it is now (`says`).
  const currentOf = (element, choices) => choices.find((choice) => choice.value === (validDirection(element.getAttribute(FLOW_DIRECTION)) ? element.getAttribute(FLOW_DIRECTION) : null));
  function directionGroup(element, choices, title, says, target) {
    const current = currentOf(element, choices);
    return [{ title }, ...choices.map((choice) => ({
      label: choice.label, icon: choice.icon, current: choice === current,
      run: () => { if (look(element, { attributes: { [FLOW_DIRECTION]: choice.value } }, target)) say(t("{0} · Ctrl+Z 撤销", says(choice.label))); },
    }))];
  }
  const flowSays = (label) => t("方向已改为{0}", label);
  const nodeSays = (label) => t("节点方向已改为{0}", label);

  /**
   * The block menu's rows of a flowchart and of a node. 方向 (the route icon, the current choice
   * beside it): on the flowchart its own (自动换行 / 排成一行 / 排成一列, under 流程图的方向); on a node the
   * joint after it (跟随整体 / 接在右边 / 接在下边, under 这个节点之后) and, below them, the whole flowchart's three
   * (under 整个流程图): a flowchart has no handle of its own (the handles a reader finds on it are its
   * nodes', as a list's are its items'), so its direction is set from a node's menu too, where
   * 跟随整体 says what it follows. Then a node's 在后面添加节点. None for another block, or for one of
   * a flowchart the page does not edit.
   */
  function menuItems(target) {
    const flow = isFlowchart(target) ? target : isStep(target) ? target.parentElement : null;
    if (!flow?.hasAttribute("data-ge-box") || flow.hasAttribute("data-ge-keep")) return [];
    if (flow === target) {
      return [{ label: t("方向"), icon: ROUTE_ICON, hint: currentOf(flow, FLOW_CHOICES).label, submenu: () => directionGroup(flow, FLOW_CHOICES, t("流程图的方向"), flowSays, flow) }];
    }
    return [
      {
        label: t("方向"), icon: ROUTE_ICON, hint: currentOf(target, NODE_CHOICES).label,
        submenu: () => [...directionGroup(target, NODE_CHOICES, t("这个节点之后"), nodeSays, target), { separator: true }, ...directionGroup(flow, FLOW_CHOICES, t("整个流程图"), flowSays, target)],
      },
      { label: t("在后面添加节点"), icon: ICONS.plus, run: () => addAfter(target) },
    ];
  }

  return {
    addAfter, menuItems,
    /** The handle's "+" on a node: a node beside it (`before`: Alt), the first line of that new node returned for the "/" menu; undefined for a flowchart. */
    addNear: (unit, before) => (isStep(unit) ? firstLineOf(addAfter(unit, { before })) : undefined),
    // A node holds blocks of other components (its first line is a paragraph), and what it does to
    // their keys it says `around` them.
    keys: {
      around: {
        enter: ({ host }) => enter(host) || enterAtStart(host),
        tab: ({ host }) => tab(host),
        backspace: ({ host }) => backspace(host),
        delete: ({ host }) => forwardDelete(host),
      },
    },
    rowOps: { rowsOfFlow, rowShares, leastWidth, weightValue }, // what the gaps between a row's nodes resize (page/columns/)
  };
}
