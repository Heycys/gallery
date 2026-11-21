import { svg } from "../icons.mjs";
import { FLOW, FLOW_DIRECTION, FLOW_RATIO } from "../../../shared/components/list.mjs";
import { DIRECTIONS, START, describeItem, itemPiece, readList, validDirection, validStart } from "../list/index.mjs";
import { MIN_RATIO } from "../columns/index.mjs";
import { BLOCK_COLORS } from "../colors.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { boxed, flowRows } from "../read-rows.mjs";

// 步骤流程图 (the kit's 流程图): an ordered list of the kit's class, ol.doc-flow, whose items are its
// steps (docs/editor.md, "Flowcharts"). The kit draws each step a card (its number, or its icon, in a
// circle on its first line; arrows between them: src/render/kit/styles/flowchart.css) and lays the
// steps out in rows (runtime/flowchart.js). For the kit it is a kind of list (its description is the
// list's, src/shared/components/list.mjs: `description` below); for the editor it is a block of its
// own (unit kind "flowchart", a box of kind "flowchart" that takes steps alone), and each step is
// no list item: a node, a container as a highlight block is (unit kind "step", a box of kind
// "node"), holding blocks and no text of its own:
//
//   <ol class="doc-flow" data-direction="row">
//     <li style="--doc-flow-ratio: .4"><p><strong>收集数据</strong></p><p>从三个平台导出原始日志。</p></li>
//     <li data-direction="column" class="doc-highlight-blue"><div class="doc-icon">📮</div><p><strong>分派</strong></p><ul>…</ul></li>
//   </ol>
//
// A node's first block (after its icon, its lead) is always a paragraph, its title (`firstBlock`),
// bold as the file writes it (<p><strong>…</strong></p>: the editor arms bold where it is empty,
// format-bar/; the reader's to take off); the blocks after it are its content, any blocks a flow
// takes. A node's color (颜色: its card's background, or its words, number and border), its own
// direction (data-direction: row, the next node beside it; column, the row ending after it) and its
// weight in its row (--doc-flow-ratio, a share) are its own; the flowchart's direction (row,
// column, none for 自动) and first number (start) are the list's.
//
// page.mjs: the keys in a node (Enter, Backspace and Delete keep to the node; the empty last block
// goes on as the next node's first line; an empty node goes; Tab never nests nodes), a list turned
// into a flowchart and back, a step turned into a list item or a highlight block, a new flowchart
// and a new node, 方向 (the flowchart's and a node's, in their block menus) and the rows and widths
// the gaps between a row's nodes resize (page/columns/: a node's weight in its row); add.mjs: the
// round "+" at a node's right that adds one after it; file.mjs: a flowchart and a node made on the
// page, in report.html.
//
// Where the engines reach it (src/editor/page/ unless named): core.mjs (a node is no list item:
// parentItem, holderItem, previousLine and nextLine stop at it; firstLineOf; splitBlock of a first
// line), typing/ (the keys: `keys.around`, page.mjs), convert.mjs (the first line is turned into nothing; a
// block, a list or a highlight block turned into a flowchart, a step and a flowchart into a list),
// slash-menu/ (blocks made from the first line go after it), format-bar/ (bold armed in an empty
// first line), drag/drop.mjs (nothing lands before a first line; a node alone in its row is dropped
// above or below it: geometry.mjs sideBySide "wrap"), columns/ (the gaps between a row's nodes),
// handle/ (a node's handle in the gap before it: nodeBefore; a node in a row has no 批注 button: inRow), clipboard/ (a paste in a node: nodeAround),
// components/icon/ (a node's icon in its number's place), clipboard/own/ (a flowchart and its
// nodes copied with their attributes and weights: `clipboard`), src/transfer/markdown.mjs (an ordered list), ../source/ (units.mjs: a flowchart's box, a step's node; natural.mjs: a step written the
// short way or empty made a node).
// Its look: the kit's styles/flowchart.css and runtime/flowchart.js (src/render/kit/).

export { FLOW, FLOW_DIRECTION, FLOW_RATIO };

/** Whether an element is a flowchart's step (a node): an li whose list is an ol.doc-flow. */
export const isStep = (node) => node?.localName === "li" && node.parentElement?.localName === "ol" && node.parentElement.classList.contains(FLOW);

/** Whether an element is a flowchart: an ol.doc-flow. */
export const isFlowchart = (node) => node?.localName === "ol" && node.classList.contains(FLOW);

// A node's own icon (one card) and the flowchart's (two steps, the line from the first to the second
// and its arrow), drawn on the 20-unit grid as the other types' are.
const STEP_ICON = svg('<rect x="3.25" y="5.25" width="13.5" height="9.5" rx="2"/><path d="M7 10h6"/>');
const FLOWCHART_ICON = svg('<rect x="2.75" y="3.25" width="6.5" height="5" rx="1.25"/><rect x="11" y="11.75" width="6.5" height="5" rx="1.25"/><path d="M6 8.25v4a2 2 0 0 0 2 2h2.5"/><path d="m8.85 12.5 1.75 1.75-1.75 1.75"/>');

// A node's weight in its row, a share as a column's is (the least a column of a row takes, to the whole).
const RATIO = { min: MIN_RATIO, max: 1 };

/** The node a text block is in, at any depth (the innermost: a flowchart in a node has nodes of its own), or null. */
export const nodeAround = (host) => host?.parentElement?.closest("ol.doc-flow > li") ?? null;

/**
 * The node standing right before `step` in its row, as the kit laid them out (its card at the same
 * height, left of it, the gap between them its arrow's), or null: a row's first node, or no node.
 * Its handle stands in that gap (handle/), narrow, the arrow under it dimmed.
 */
export function nodeBefore(step) {
  const before = isStep(step) ? step.previousElementSibling : null;
  if (!isStep(before)) return null;
  const left = before.getBoundingClientRect();
  const right = step.getBoundingClientRect();
  return right.width > 0 && Math.abs(left.top - right.top) < 2 && left.right <= right.left + 1 ? before : null;
}

/** Whether a node shares its line with another, as the kit laid them out (the unit's `inRow`). */
const sharesRow = (step) => Boolean(nodeBefore(step) || (isStep(step.nextElementSibling) && nodeBefore(step.nextElementSibling)));

// What a flowchart's node says of itself besides its blocks.
const nodeFields = (node, { colorOf, sizeValue }) => {
  const color = colorOf(node);
  const direction = validDirection(node.getAttribute(FLOW_DIRECTION)) ? node.getAttribute(FLOW_DIRECTION) : null;
  const ratio = sizeValue("step", FLOW_RATIO, node.style.getPropertyValue(FLOW_RATIO));
  return { ...(color ? { color } : {}), ...(direction ? { direction } : {}), ...(ratio ? { ratio } : {}) };
};

// What a page export writes of a node: its emoji and title on its item's line, the blocks after its
// title what the item holds; one written the short way, its own words and what it holds after them.
function writtenNode(step, { isHost, nestedBlocks, unitsOf, opening }) {
  const { head, rest } = isHost(step) ? opening(nestedBlocks(step), () => step)
    : opening(unitsOf(step), (first) => (first?.getAttribute("data-ge-unit-kind") === "paragraph" ? first : null));
  return { text: head, held: rest };
}

export default {
  name: "flowchart",
  listed: () => t("步骤流程图"),
  description: "list", // the kit's flowchart is a kind of list (src/shared/components/list.mjs)
  units: {
    // The flowchart: its first number (start) and its direction (none: 自动, the kit fills rows).
    flowchart: {
      name: t("步骤流程图"), match: [{ rank: 145, tag: "ol", class: FLOW }],
      attributes: { [START]: validStart, [FLOW_DIRECTION]: validDirection },
      // gallery read (../read-rows.mjs): boxed, how many steps, each step boxed in it.
      read: { name: "步骤流程图", rows: (node, view) => boxed(node, `步骤流程图 · ${node.children.length} 步${view.tools.looks(node.el)}`, flowRows(node.children, view)) },
    },
    // A step: a node, only in its flowchart (fixed); Backspace at the start of its first line, when
    // nothing is written in it, deletes it (removedEmpty, as a highlight block's); its color, its own
    // direction and its weight in its row. Its menu makes no block below it (a node goes after it:
    // 在后面添加节点, page.mjs menuItems).
    step: {
      name: t("节点"), icon: STEP_ICON, match: [{ rank: 155, tag: "li", parent: { tag: "ol", class: FLOW } }],
      fixed: true, removedEmpty: true, below: false, inRow: sharesRow, sharesHeight: true,
      colors: ["text", "background"],
      attributes: { [FLOW_DIRECTION]: validDirection },
      sizes: { [FLOW_RATIO]: RATIO },
      clipboard: { kind: "words" }, // outside its flowchart, which a file may leave it, a page export has its words
      read: {
        name: "步骤",
        rows(node, view) {
          const steps = node.parent?.children ?? [node];
          return boxed(node, `第 ${steps.indexOf(node) + 1} 步${view.tools.looks(node.el)}`, flowRows(node.children, view));
        },
      },
    },
  },
  boxes: {
    flowchart: { role: "steps", name: t("步骤流程图") },
    // A node: a container as a highlight block is, its icon first in it (its lead, in its number's
    // place), its first block showing its handle, an empty paragraph put back in it once emptied, and
    // that first block always a paragraph, its title.
    node: { role: "flow", name: t("节点"), also: ["icon"], lead: "icon", firstLineActs: true, holdsOne: true, firstBlock: "paragraph", firstSays: t("节点标题") },
  },
  types: {
    // 流程图: the list kinds' last in the menus (no Markdown makes one). A flowchart made on the page
    // carries its first number (one turned from a numbered list keeps it) and its direction, when the
    // reader fixed one; it is made with one node, its title empty and bold armed (page.mjs newFlowchart).
    flowchart: {
      turn: 10.5, menu: ["basic", 9.5],
      tag: "ol", className: FLOW, kind: "flowchart", box: "flowchart", container: `ol.${FLOW}`,
      // Written as a numbered list (`number`), each node an entry (writtenNode).
      clipboard: {
        kind: "number",
        read: (list, how) => readList(list, how, (step) => writtenNode(step, how)),
        // Its direction (方向), when one is fixed, its first number and its nodes.
        describe(node, { holding }) {
          if (!isFlowchart(node)) return undefined;
          const blocks = holding(node);
          const direction = validDirection(node.getAttribute(FLOW_DIRECTION)) ? node.getAttribute(FLOW_DIRECTION) : null;
          const start = validStart(node.getAttribute(START)) ? node.getAttribute(START) : null;
          return blocks ? { type: "flowchart", blocks, ...(direction ? { direction } : {}), ...(start ? { start } : {}) } : null;
        },
        // No list of items (its steps are nodes): one a selection holds all of is copied as a copy of
        // the block describes it; of one it holds some of, its nodes (`step`) make a flowchart again,
        // with its direction, and its first number where the selection holds its first node.
        across(unit, { holdsAll, describe, walk, startsIn }) {
          if (!isFlowchart(unit)) return undefined;
          const block = holdsAll(unit) ? describe(unit) : null;
          if (block) return [block];
          const direction = validDirection(unit.getAttribute(FLOW_DIRECTION)) ? unit.getAttribute(FLOW_DIRECTION) : null;
          const start = !startsIn(unit) && validStart(unit.getAttribute(START)) ? unit.getAttribute(START) : null;
          const out = [];
          let flow = null;
          for (const each of walk(unit)) {
            if (each.type !== "step") {
              out.push(each);
              flow = null;
              continue;
            }
            if (!flow) out.push(flow = { type: "flowchart", blocks: [], ...(direction ? { direction } : {}), ...(start && out.length === 0 ? { start } : {}) });
            flow.blocks.push(each);
          }
          return out;
        },
        check: (block, { container }) => container(block, validDirection),
        // Its items (copied before its steps were nodes): each a node, its words its title.
        build({ block, box, inner }) {
          const flow = box();
          if (block.direction) flow.setAttribute(FLOW_DIRECTION, block.direction);
          flow.append(...inner(block.blocks.map((one) => (one.type === "item" ? { type: "step", blocks: [{ type: "paragraph", html: one.html ? `<strong>${one.html}</strong>` : "" }, ...(one.lists ?? [])] } : one))));
          if (validStart(block.start)) flow.setAttribute(START, block.start);
          return flow;
        },
      },
      // The part split off it keeps the direction the whole had (the layout its author fixed): the two laid out alike.
      onSplit: (whole, tail) => { if (validDirection(whole.getAttribute(FLOW_DIRECTION))) tail.setAttribute(FLOW_DIRECTION, whole.getAttribute(FLOW_DIRECTION)); },
      extras: (element) => ({
        ...(validStart(element.getAttribute(START)) ? { start: element.getAttribute(START) } : {}),
        ...(validDirection(element.getAttribute(FLOW_DIRECTION)) ? { direction: element.getAttribute(FLOW_DIRECTION) } : {}),
      }),
      label: t("步骤流程图"), // the kit's 流程图 (FLOW_LABEL), named for what it draws: steps
      icon: FLOWCHART_ICON,
      words: "步骤流程图 流程图 流程 步骤 buzhouliuchengtu buzhou bzlct liuchengtu liucheng lct flow flowchart step process steps",
      glance: { row: 13, name: "步骤流程图", write: "`ol.doc-flow`, a step `<li><p><strong>…</strong></p>…</li>`", rule: "Kit blocks" },
    },
    // A node made on the page: its blocks, and its color (an item turned into one keeps its own),
    // direction and weight when it has them.
    step: {
      tag: "li", kind: "step", box: "node",
      // Its first text block heads its item's line (`headed`). One written the short way, a text
      // block, is copied as an item.
      clipboard: {
        html: "node", run: "flowchart", headed: true, piece: itemPiece,
        describe(node, { isHost, holding, ...what }) {
          if (isHost(node)) return describeItem(node, { isHost, ...what });
          if (!isStep(node)) return undefined;
          const blocks = holding(node);
          return blocks ? { type: "step", blocks, ...nodeFields(node, what) } : null;
        },
        // One a selection holds all of with its blocks, color, direction and weight; the one it ends in
        // a node still, with what of it comes before the end (its icon, its title), as a highlight
        // block it ends in; the one it starts in, only what of it the selection holds (a block the
        // selection starts in is never copied whole), its icon not.
        across(unit, { holdsAll, describe, walk, groupItems, startsIn, ...what }) {
          if (!isStep(unit)) return undefined;
          const block = holdsAll(unit) ? describe(unit) : null;
          if (block) return [block];
          const blocks = groupItems(walk(unit));
          if (startsIn(unit)) return blocks.filter((each) => each.type !== "icon");
          return [{ type: "step", blocks, ...nodeFields(unit, what) }];
        },
        check: (block, { valid, sizeValue }) => Array.isArray(block.blocks) && (block.direction === undefined || validDirection(block.direction))
          && (block.ratio === undefined || (typeof block.ratio === "string" && sizeValue("step", FLOW_RATIO, block.ratio) === block.ratio))
          && block.blocks.every((inner) => valid(inner, "node")),
        // Its blocks, an empty title first when none comes first after its icon (a node's first block is always one).
        build({ block, box, host, inner, colored }) {
          const step = colored(box());
          if (block.direction) step.setAttribute(FLOW_DIRECTION, block.direction);
          if (block.ratio) step.style.setProperty(FLOW_RATIO, block.ratio);
          const blocks = inner(block.blocks);
          const icon = blocks.find((each) => each.matches?.(".doc-icon"));
          const rest = blocks.filter((each) => each !== icon);
          const title = rest[0]?.localName === "p" && !rest[0].classList.contains("doc-note") ? [] : [host("paragraph")];
          step.append(...(icon ? [icon] : []), ...title, ...rest);
          return step;
        },
      },
      extras: (element, { sizeValue }) => {
        const ratio = sizeValue("step", FLOW_RATIO, element.style.getPropertyValue(FLOW_RATIO));
        const direction = element.getAttribute(FLOW_DIRECTION);
        const classes = BLOCK_COLORS.filter((name) => element.classList.contains(name));
        return { ...(classes.length > 0 ? { classes } : {}), ...(ratio ? { ratio } : {}), ...(validDirection(direction) ? { direction } : {}) };
      },
    },
  },
};

export { DIRECTIONS, validDirection };
