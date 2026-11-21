import { tooltip } from "../tooltip.mjs";
import { element } from "../ui.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { keyAction } from "./tree.mjs";

// The outline's rows (outline/index.mjs puts them in its dock, or in the strip's card): a tree as
// aria has it (role tree, a treeitem a row with its level, open or folded, the current one
// aria-current), one tab stop (the current row, else the first), the keys of tree.mjs keyAction.
// A row's title, cut short, shows whole in the shared tooltip, left of the list (over the gutter,
// not the rows above); a parent's triangle just short of its title, out of the row's flow (titles of
// a level line up, a leaf's too), folds or unfolds it (a folded one always
// shows it, an open one while the pointer is on the rows or the keyboard is in the list: STYLE in
// index.mjs); a click elsewhere on the row goes to its heading. The strip (strip.mjs) lights a row
// from outside (hot): the one its line under the pointer stands for, filled as under the pointer, a
// blue segment on the guide.

export const ROW = 28; // a row's height
const MARK = 16; // the current row's segment on the guide (and the hot row's)

/**
 * The list's geometry (px from its left edge, where the column's right room ends: margin.mjs; index.mjs
 * STYLE draws it): the guide's hairline at `guide` (its grip from MARGIN.grip left of it to 5px right);
 * the rows from `row` (their fill 2px clear of the hairline, a top-level row's a `step` further left to take in
 * its triangle: index.mjs STYLE); a title `text` into its row, `step`
 * further a level (the top level's 26px in, 8px clear of the hairline; a tab's pill 22px in, 4px clear);
 * a parent's triangle `twist` wide (its 16px glyph centered on it) in its row's indentation, `gap`
 * short of its title at every level (the top level's from 11px in, on the hairline and its grip, which it
 * stands over while shown; the next level's from 23px in). Until 2026-11-07 the top level's stood in the
 * list's first 13px, left of the guide, which the user found too far from their titles.
 */
export const LIST = Object.freeze({ twist: 13, guide: 17, row: 20, text: 6, step: 12, gap: 2 });

// A small solid triangle on the 20-unit grid, pointing right (folded); turned down when open.
export const TRIANGLE = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M8 6.5v7l5-3.5z"/></svg>';

const cut = (node) => node.scrollWidth > node.clientWidth + 1;

/**
 * jump(node, { keyboard }): a row chosen (a click, or Enter or Space: keyboard); fold(node): its
 * chevron (a click, ← or →); escape(): Esc in the list; page(direction): PageDown (1) or PageUp (-1).
 * Returns { node (the list), render(rows, folded, marked), mark(marked), focus(index), rowAt(index), holds(target) }.
 */
export function createList({ jump, fold, escape, page }) {
  const node = element("div", { class: "ge-outline-list", role: "tree", "aria-label": t("目录") });
  const segment = element("span", { class: "ge-outline-mark", "aria-hidden": "true" });
  const hotSegment = element("span", { class: "ge-outline-mark", "data-hot": "", "aria-hidden": "true", hidden: "" });
  const empty = element("div", { class: "ge-outline-empty", text: t("添加标题后，这里会列出它们") });
  let rows = [];
  let folded = new Set();
  let marked = -1;
  let hot = -1;
  let rowNodes = [];

  function rowFor({ node: item, depth, parent }, index) {
    const label = element("span", { class: "ge-outline-text" });
    const named = item.kind === "tab" ? element("span", { class: "ge-outline-tab", text: item.text }) : label;
    if (item.kind === "tab") label.append(named);
    else label.textContent = item.text;
    const open = !folded.has(item.key);
    const twist = item.children.length ? [element("span", { class: "ge-outline-twist", role: "button", "aria-label": open ? t("折叠") : t("展开"), html: TRIANGLE })] : [];
    const row = element("div", { class: "ge-outline-row", role: "treeitem", tabindex: "-1", "aria-level": String(depth + 1), "data-index": String(index), "data-kind": item.kind }, ...twist, label);
    row.style.setProperty("--ge-depth", String(depth));
    if (item.kind === "tab" && item.shown) row.dataset.shown = "";
    // The top level's headings (bold): at the top, or right under a tab (a tab's own top level).
    if (item.kind === "heading" && (parent < 0 || rows[parent]?.node.kind === "tab")) row.dataset.top = "";
    if (item.children.length) row.setAttribute("aria-expanded", String(open));
    tooltip(row, () => (cut(named) ? item.text : null), null, { placement: "left", align: "center", gap: LIST.row + 8 });
    return row;
  }

  /** Draw `rows` (tree.mjs rowsOf) with what is `folded`, row `marked` the current one. */
  function render(next, nextFolded, nextMarked) {
    const focusedKey = node.contains(document.activeElement) ? rows[Number(document.activeElement.dataset?.index)]?.node.key : null;
    rows = next;
    folded = nextFolded;
    rowNodes = rows.map(rowFor);
    node.replaceChildren(...rowNodes, ...(rows.length ? [segment, hotSegment] : [empty]));
    node.toggleAttribute("data-empty", rows.length === 0);
    marked = -2;
    mark(nextMarked);
    const wasHot = hot;
    hot = -2;
    light(wasHot);
    if (focusedKey !== null) {
      const again = rows.findIndex((row) => row.node.key === focusedKey);
      focus(again >= 0 ? again : Math.max(0, Math.min(rows.length - 1, marked)));
    }
  }

  /** The rows' data, the same rows drawn (the tree read again, its elements new: an undo put them back). */
  function update(next) {
    rows = next;
  }

  /** Row `index` the current one (-1: none). */
  function mark(index) {
    if (index === marked) return;
    marked = index;
    rowNodes.forEach((row, at) => {
      const current = at === index;
      row.toggleAttribute("data-current", current);
      if (current) row.setAttribute("aria-current", "location");
      else row.removeAttribute("aria-current");
    });
    const stop = index >= 0 ? index : 0;
    rowNodes.forEach((row, at) => { row.tabIndex = at === stop ? 0 : -1; });
    place(segment, index);
  }

  // A segment on the guide by row `index` (rows stand ROW apart, measured or not: the card closed).
  function place(mark, index) {
    mark.hidden = !rowNodes[index];
    if (!mark.hidden) mark.style.transform = `translateY(${index * ROW + (ROW - MARK) / 2}px)`;
  }

  /** Row `index` lit from outside (the strip's line under the pointer; -1: none). Returns its node. */
  function light(index) {
    if (index === hot) return rowNodes[index] ?? null;
    rowNodes[hot]?.removeAttribute("data-hot");
    hot = rowNodes[index] ? index : -1;
    rowNodes[hot]?.setAttribute("data-hot", "");
    place(hotSegment, hot);
    return rowNodes[hot] ?? null;
  }

  function focus(index) {
    const row = rowNodes[index];
    if (!row) return;
    rowNodes.forEach((other) => { other.tabIndex = other === row ? 0 : -1; });
    row.focus({ preventScroll: true });
    const box = row.closest(".ge-outline-scroll");
    if (!box) return;
    const top = row.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop;
    if (top < box.scrollTop) box.scrollTop = top - 4;
    else if (top + ROW > box.scrollTop + box.clientHeight) box.scrollTop = top + ROW - box.clientHeight + 4;
  }

  const indexOf = (target) => Number(target?.closest?.(".ge-outline-row")?.dataset.index ?? -1);

  node.addEventListener("click", (event) => {
    const index = indexOf(event.target);
    if (index < 0 || !rows[index]) return;
    if (event.target.closest(".ge-outline-twist")) fold(rows[index].node);
    else jump(rows[index].node, { keyboard: event.detail === 0 });
  });
  node.addEventListener("keydown", (event) => {
    // Ctrl/⌘+A selects nothing here (the rows are no text; the page's select-all is the text's).
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === "a") {
      event.preventDefault();
      return;
    }
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      escape();
      return;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      page?.(event.key === "PageDown" ? 1 : -1);
      return;
    }
    const index = indexOf(event.target);
    const action = index >= 0 ? keyAction(rows, index, event.key, folded) : null;
    if (!action) return;
    event.preventDefault();
    if ("focus" in action) focus(action.focus);
    else if (action.fold || action.unfold) fold(action.fold ?? action.unfold);
    else if (action.jump) jump(action.jump, { keyboard: true });
  });

  return {
    node,
    render,
    update,
    mark,
    light,
    focus,
    get marked() { return marked; },
    get hot() { return hot; },
    rowAt: (index) => rowNodes[index] ?? null,
    holds: (target) => node.contains(target),
  };
}
