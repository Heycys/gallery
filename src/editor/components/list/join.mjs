import { placeBefore } from "../../page/core.mjs";
import { FLOW_DIRECTION, START, listType } from "./index.mjs";

// Lists that a change sets side by side become one (consecutive numbered items are one run, counted
// from 1; two bullet lists side by side are one list as well): the block between two lists deleted, cut, moved away, merged into the line above
// or turned into an item of one of them. Around a structural step (history.mjs struct, given
// tidyLists by editor.mjs): listsAround(parents) before it names the lists the step may set side
// by side, so the step records them, and the pairs side by side already, which stay as they are
// (a file may hold two lists written apart); joinSideBySide after it puts the second list of each
// new pair at the end of the first. A list with a start of its own (a number set, 开始新列表, a list begun by "5. ") stays a
// list of its own, a run that starts at its own number; so does a flowchart laid out otherwise
// than the one before it (data-direction: its author's layout of the whole, none or another).

const isList = (node) => node?.localName === "ul" || node?.localName === "ol";
// A list the page may take apart: a box nothing refers to, made on the page or holding only blocks.
const free = (list) => list.hasAttribute("data-ge-box") && !list.hasAttribute("data-ge-keep") && (list.hasAttribute("data-ge-new") || list.hasAttribute("data-ge-pure"));
const listsIn = (flow) => [...flow.children].filter(isList);
// The block after a list, past the editor's own nodes (data-doc-dev).
const after = (node) => {
  let next = node.nextElementSibling;
  while (next?.hasAttribute("data-doc-dev")) next = next.nextElementSibling;
  return next;
};

/** The lists right in the flows a step changes, and the pairs of them side by side before it. */
export function listsAround(parents) {
  const flows = [...new Set(parents.filter((node) => node?.nodeType === 1))];
  const lists = flows.flatMap(listsIn);
  return { flows, lists, before: new Map(lists.filter((list) => isList(after(list))).map((list) => [list, after(list)])) };
}

/** Whether a list takes the one after it in: of its type, both free, the second with no start of its own (two flowcharts: laid out alike). */
export const joins = (list, next) => listType(list) === listType(next) && free(list) && free(next) && !next.hasAttribute(START)
  && (listType(list) !== "flowchart" || list.getAttribute(FLOW_DIRECTION) === next.getAttribute(FLOW_DIRECTION));

/**
 * Join the lists a step set side by side (listsAround before it), but those the step made (`created`:
 * an item's lists set out after it as it turns into text, the items after it split off from them:
 * the first stays under the text, the second a run of its own). Returns the lists that
 * took others in, each with the nodes it held before them: [list, nodes].
 */
export function joinSideBySide({ flows, before }, created = []) {
  const made = new Set(created);
  const grown = new Map();
  for (const flow of flows) {
    if (!flow.isConnected) continue;
    for (let list = flow.firstElementChild; list; list = list.nextElementSibling) {
      for (let next = after(list); isList(list) && isList(next) && before.get(list) !== next && !made.has(list) && !made.has(next) && joins(list, next); next = after(list)) {
        if (!grown.has(list)) grown.set(list, [...list.childNodes]);
        placeBefore(list, [...next.children].filter((child) => child.localName === "li"), null);
        next.remove();
      }
    }
  }
  return [...grown];
}

/**
 * What a structural step (history.mjs) does around lists, as a tidier: the lists of the flows it
 * changes are recorded with it, and the lists it set side by side are joined after it (but those
 * the step made: `created`). A list the step brought there (one pasted or moved) is recorded by what
 * it took in (`grown`).
 */
export function tidyLists(parents) {
  const around = listsAround(parents);
  return { parents: around.lists, settle: ({ created }) => ({ grown: joinSideBySide(around, created) }) };
}
