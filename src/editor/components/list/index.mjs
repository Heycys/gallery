import { svg } from "../icons.mjs";
import { FLOW, FLOW_DIRECTION, HELD_TAGS } from "../../../shared/components/list.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { labeled, plainRow, prefixed, rowOf } from "../read-rows.mjs";

// 符号列表, 编号列表 and 待办事项: ul, ol and ul.doc-todo, whose items are text blocks (a to-do's
// checked item carries data-checked; its box is the kit's, drawn where a bullet would be). An item may hold
// blocks after its text (its children: lists, and any other block, a
// paragraph, an image, a code block…: <li>text<p>…</p><ul>…</ul></li>): it is then also a box (kind
// "nest") whose units are those blocks.
// The markers by depth are the kit's (src/render/kit/styles/flow.css), so nothing but the nesting tells levels apart.
// A flowchart (流程图, ol.doc-flow) is a list for the kit, and one of the kinds a whole list turns
// into (LIST_TYPES, listType), but no list for the editor: its steps are nodes, no items
// (components/flowchart/, which also turns a list into one and back).
// page.mjs: indenting and outdenting items, Enter and Backspace in them, a list turned into the
// other kind; file.mjs: an item holding lists in report.html.
//
// Where the engines reach it (src/editor/page/ unless named): core.mjs (an item's own text comes
// before the blocks it holds: nestedBlocks, textEnd, ownHTML, setOwnHTML, parentItem, holderItem, previousLine, splitting
// and merging items, the save's nested lists), typing/ (Tab, Ctrl+Enter, Enter, Backspace, Delete: `keys`, page.mjs),
// convert.mjs (a block turned into an item, a list into the other kind or into paragraphs, "- ",
// "1. "), drag/drop.mjs (a drop goes by indentation), drag/ (a block dropped under an item),
// caret.mjs (an item's own lines), history.mjs (lists set side by side join: its page object's tidy),
// clipboard/own/ (copying lists and items: `clipboard`), src/transfer/markdown.mjs (a page exported: `read`), commit.mjs (an item's box for its
// lists), ../source/ (finding items and what they hold: trailingBlocks, nest; retagUnit, itemIndent,
// cutLines).
// Its look: the kit's styles/flow.css, todo.css and flowchart.css (src/render/kit/).
// A numbered list's first number (start, from 1) and whether it counts on from the numbered list
// before it (data-continue): what the reader sets by clicking a number (page.mjs), saved as attributes.
export const START = "start";
export const CONTINUE = "data-continue";
export const validStart = (value) => typeof value === "string" && /^[1-9]\d{0,8}$/.test(value);
// A to-do list (a box before each item, checked or not) is a ul of this class, a
// checked item one with this attribute: a class switch of the list, an attribute of the item.
export const TODO = "doc-todo";
export const CHECKED = "data-checked";
// A flowchart is an ol of its class (components/flowchart/); its layout fixed, an attribute of the
// list (and of a step): row or column, none while the kit chooses.
export { FLOW, FLOW_DIRECTION };
export const DIRECTIONS = ["row", "column"];
export const validDirection = (value) => DIRECTIONS.includes(value);

/** The kinds of list, in menu order: a whole list turns into any other of them. */
export const LIST_TYPES = ["bullets", "numbers", "todo", "flowchart"];

/** The type a list shows as: "numbers", "flowchart", "todo" or "bullets". */
export const listType = (list) => (list.localName === "ol" ? (list.classList.contains(FLOW) ? "flowchart" : "numbers") : list.classList.contains(TODO) ? "todo" : "bullets");

/**
 * The type of a list made in an item (an item indented under another, items dropped under one, a new
 * item right below one holding blocks): `type`, a flowchart's being a numbered list there (a flowchart's
 * steps are no items, so none is ever made so; a flowchart in a node or an item is the reader's to
 * make, turning a list into 步骤流程图, never one Tab or Enter makes).
 */
export const heldListType = (type) => (type === "flowchart" ? "numbers" : type);

// The tags of the blocks a list item may hold after its text: the shared description's, which the kit reads too.
export { HELD_TAGS };

// What an item says it holds: its items (子项) where the blocks it holds are lists of items alone (a
// flowchart's steps are no items), its content (内容) where any is another block (a paragraph, an
// image, a task board).
const holdsItems = (blocks) => blocks.every((block) => (block.localName === "ul" || block.localName === "ol") && !block.classList.contains(FLOW));

/** Why an item holding `blocks` (the page's nestedBlocks) does not go by itself, in the words of what it holds. */
export const holdsSays = (blocks) => (holdsItems(blocks)
  ? t("这一项下面还有子项；要连同子项一起删除，点左侧的手柄后按 Delete。")
  : t("这一项下面还有内容；要连同这些内容一起删除，点左侧的手柄后按 Delete。"));

/** Why an item holding `blocks` does not join the line above it, so. */
export const mergeSays = (blocks) => (holdsItems(blocks) ? t("这一项下面还有子项，不能并入上一项。") : t("这一项下面还有内容，不能并入上一项。"));

/**
 * What a page export writes of a list: its first number and its items, each with whether it is
 * checked and `written()`, the text of its line and the blocks it holds, which are asked as each is
 * written, a text naming the files it shows. By default an item's own text (not the blocks it holds,
 * written below), its pictures kept: one holding a picture is no text block of the editor's, but
 * its content all the same.
 */
export const readList = (list, how, written = (item) => ({ text: how.own(item), held: how.nestedBlocks(item) })) => ({
  start: Number(list.getAttribute(START)) || 1,
  items: how.unitsOf(list).map((item) => ({ checked: item.hasAttribute(CHECKED), written: () => written(item) })),
});

// How a list is copied: the blocks it holds checked as any box's. A list a selection goes through
// is its items, each carrying its list's kind (an item of a list in an item keeps its own).
const check = (block, { container }) => container(block);
function across(unit, { walk }) {
  if (unit.localName !== "ul" && unit.localName !== "ol") return undefined;
  const list = listType(unit);
  return walk(unit).map((block) => (block.type === "item" ? { list, ...block } : block));
}
const CLIPBOARDS = {
  bullets: { kind: "bullet", read: readList, check, across },
  numbers: {
    kind: "number", read: readList, check, across,
    // Its first number (a document's list that goes on after a block).
    build({ block, box, inner }) {
      const list = box();
      list.append(...inner(block.blocks));
      if (validStart(block.start)) list.setAttribute(START, block.start);
      return list;
    },
  },
  todo: { kind: "todo", read: readList, check, across },
};

// An li as a text block, in a list or a step written the short way: copied with what it holds after
// its text, and in part with what of that a selection reaches.
export function describeItem(node, { isHost, nestedBlocks, describe, serializeInner }) {
  if (node.localName !== "li" || !isHost(node)) return undefined;
  const lists = nestedBlocks(node).map(describe);
  return lists.every(Boolean) ? { type: "item", html: serializeInner(node), ...(node.hasAttribute(CHECKED) ? { checked: true } : {}), lists } : null;
}
export const itemPiece = (host, html, { walk, groupItems }) => (host.localName === "li" ? { type: "item", html, ...(host.hasAttribute(CHECKED) ? { checked: true } : {}), lists: groupItems(walk(host)) } : undefined);

// What gallery read calls each kind of list.
const READ_NAMES = { bullets: "符号列表", numbers: "编号列表", todo: "待办事项", flowchart: "步骤流程图" };

// A list item in gallery read: its marker (its number from its list's start, its box checked or not),
// its words and {…}, then the blocks it holds under its words, in from its marker.
function itemRows(item, view) {
  const { tools } = view;
  const list = item.el.parentElement;
  const type = list ? listType(list) : "bullets";
  const index = list ? [...list.children].filter((child) => child.localName === "li").indexOf(item.el) : 0;
  const marker = type === "numbers" ? `${(Number(list.getAttribute(START)) || 1) + index}. ` : type === "todo" ? `- [${item.el.hasAttribute(CHECKED) ? "x" : " "}] ` : "- ";
  const [first, ...rest] = `${tools.own(item.el)}${tools.looks(item.el, { skip: [CHECKED] })}`.split("\n");
  const rows = [rowOf(item, `${marker}${first}`), ...rest.map((line) => plainRow(`${" ".repeat(marker.length)}${line}`))];
  return [...rows, ...prefixed(item.children.flatMap((child) => view.node(child)), " ".repeat(marker.length))];
}

// A list's words in gallery read's text: an item a line, those it holds in from it.
function listWords(node, view, depth) {
  const lines = [];
  for (const item of node.children.filter((child) => child.el.localName === "li")) {
    const words = view.tools.words(item.el);
    if (words) lines.push(`${"  ".repeat(depth)}${words.replace(/\n/g, " ")}`);
    for (const held of item.children) lines.push(...(held.el.localName === "ul" || held.el.localName === "ol" ? listWords(held, view, depth + 1) : view.words(held).map((line) => `${"  ".repeat(depth + 1)}${line}`)));
  }
  return lines;
}

export default {
  name: "list",
  listed: () => t("列表"), hideable: false,
  units: {
    list: {
      name: t("列表"), match: [{ rank: 150, tag: ["ul", "ol"] }],
      attributes: { [START]: validStart, [CONTINUE]: (value) => value === "" },
      toggles: [TODO], // 符号列表 and 待办事项 turn into each other by a class
      emptyIsNothing: true,
      canHaveChildren: true, // a block right after it goes under its last item (page.mjs keys.around)
      clipboard: { of: (unit) => CLIPBOARDS[listType(unit)] },
      // gallery read (../read-rows.mjs): a ── row of its kind, then its items as Markdown's.
      read: {
        name: "列表",
        label: (node) => READ_NAMES[listType(node.el)],
        rows: (node, view) => labeled(node, `${READ_NAMES[listType(node.el)]}${view.tools.looks(node.el)}`, node.children.flatMap((child) => (child.el.localName === "li" ? itemRows(child, view) : view.node(child)))),
        words: (node, view) => listWords(node, view, 0),
        data: (node) => ({ list: listType(node.el), start: Number(node.el.getAttribute(START)) || 1, continue: node.el.hasAttribute(CONTINUE) }),
      },
    },
    // An item's color (颜色 in the block menu): its text and its marker, or a
    // background behind it, its marker and the items it holds.
    // Outside a list, which a file may leave it, a page export has its words.
    item: {
      name: t("列表项"), match: [{ rank: 160, tag: "li" }], fixed: true, emptyIsNothing: true, colors: ["text", "background"], attributes: { [CHECKED]: (value) => value === "" }, clipboard: { kind: "words" },
      read: {
        name: "列表项",
        rows: (node, view) => itemRows(node, view),
        words: (node, view) => [view.tools.words(node.el).replace(/\n/g, " "), ...node.children.flatMap((child) => view.words(child))],
        data: (node) => ({ checked: node.el.hasAttribute(CHECKED) }),
        // Read by itself, as Markdown: a list of it alone, its number its own.
        alone(node, writer) {
          const list = node.el.parentElement;
          if (!list) return writer.block(node.el);
          const alone = list.cloneNode(false);
          alone.append(node.el.cloneNode(true));
          if (list.localName === "ol") alone.setAttribute(START, String((Number(list.getAttribute(START)) || 1) + [...list.children].filter((child) => child.localName === "li").indexOf(node.el)));
          return writer.block(alone);
        },
      },
    },
  },
  boxes: {
    list: { role: "list", name: t("列表") },
    nest: { role: "nest", find: (unit) => unit.localName === "li" ? unit : null, selectAll: { content: t("这一项下面的全部内容") } }, // a list item holds blocks after its text
  },
  types: {
    item: {
      tag: "li", kind: "item", empty: true, placeholder: false, // its marker says what it is
      // Copied with what it holds after its text (its lists, a paragraph, an image…) as `lists`; run
      // of its own: a bulleted list, unless it carries its list's kind (`list`). A flowchart takes one
      // from the clipboard, each made a node (a flowchart copied before its steps were nodes).
      clipboard: {
        html: "item", run: "bullets", pastedIn: "flowchart",
        holds: (block) => block.lists ?? [],
        describe: describeItem,
        piece: itemPiece,
        across: (unit, { walk }) => (unit.localName === "li" ? walk(unit) : undefined), // its own text comes before the start: what it holds
        check: (block, { string, valid }) => string(block.html) && (block.checked === undefined || block.checked === true) && (block.list === undefined || LIST_TYPES.includes(block.list))
          && (block.lists ?? []).every((list) => valid(list, "nest")),
        build({ block, host, inline, one }) {
          const item = host();
          if (block.checked) item.setAttribute(CHECKED, "");
          item.append(...inline(block.html));
          for (const list of block.lists ?? []) item.append(one(list));
          return item;
        },
        text: (block, lines) => [block.html, ...(block.lists ?? []).flatMap((each) => lines([each]))],
      },
    },
    bullets: {
      turn: 7, menu: ["basic", 7],
      tag: "ul", kind: "list", box: "list", leaf: "item", wraps: true, resettable: true, container: `ul:not(.${TODO})`, clipboard: CLIPBOARDS.bullets,
      label: t("符号列表"),
      icon: svg('<circle cx="4.75" cy="6.5" r="1.2" fill="currentColor" stroke="none"/><circle cx="4.75" cy="13.5" r="1.2" fill="currentColor" stroke="none"/><path d="M8.5 6.5h8M8.5 13.5h8"/>'),
      hint: "-", markdown: [{ match: /^[-*+－•·][ \u00a0\u3000]$/ }], words: "符号列表 项目符号 无序列表 列表 fuhao liebiao wuxu fhlb lb bullet list ul",
      glance: { row: 3, name: "符号列表", write: "`<ul>`", rule: "Text and lists" },
    },
    numbers: {
      turn: 8, menu: ["basic", 8],
      tag: "ol", kind: "list", box: "list", leaf: "item", wraps: true, resettable: true, container: `ol:not(.${FLOW})`, clipboard: CLIPBOARDS.numbers,
      // A numbered list made on the page carries its first number (1 too: a list right after another
      // with a start of its own, list/page.mjs) and whether it counts on.
      extras: (element) => ({
        ...(validStart(element.getAttribute(START)) ? { start: element.getAttribute(START) } : {}),
        ...(element.hasAttribute(CONTINUE) ? { continue: true } : {}),
      }),
      label: t("编号列表"),
      icon: svg('<path d="M3.6 4.35 4.9 3.6v4.15" stroke-width="1.1"/><path d="M3.55 12.4a1.25 1.25 0 0 1 2.4.35c0 .75-.6 1.2-2.45 2.75h2.6" stroke-width="1.1"/><path d="M8.75 6h7.75M8.75 13.75h7.75"/>'),
      // "3. " begins the list at 3, "0. " at its first number.
      hint: "1.", markdown: [{ match: /^(\d{1,9})[.．。)）][ \u00a0\u3000]$/, props: ([, number]) => (Number(number) > 0 ? { number: Number(number) } : {}) }], words: "编号列表 有序列表 列表 bianhao youxu liebiao bhlb lb numbered number list ol",
      glance: { row: 3, name: "编号列表", write: "`<ol>` (`start`, `data-continue`)", rule: "Text and lists" },
    },
    todo: {
      turn: 9, menu: ["basic", 9],
      tag: "ul", className: TODO, kind: "list", box: "list", leaf: "item", wraps: true, resettable: true, container: `ul.${TODO}`, clipboard: CLIPBOARDS.todo,
      label: t("待办事项"),
      icon: svg('<rect x="3.5" y="4.75" width="4.25" height="4.25" rx="1"/><rect x="3.5" y="11" width="4.25" height="4.25" rx="1"/><path d="M10.5 6.875h6M10.5 13.125h6"/>'),
      // "[] ", "[ ] " (or 【】, 【 】), and "[x] " checked.
      hint: "[]", markdown: [{ match: /^\[[xX]\][ \u00a0\u3000]$/, props: () => ({ checked: true }) }, { match: /^(\[ ?\]|【 ?】)[ \u00a0\u3000]$/ }], words: "待办事项 待办 清单 任务 勾选 复选框 daiban qingdan renwu dbsx db todo to-do checkbox checklist task",
      glance: { row: 4, name: "待办事项", write: "`<ul><li><input type=\"checkbox\" checked> …`", after: "`ul.doc-todo`", rule: "Text and lists" },
    },
  },
};
