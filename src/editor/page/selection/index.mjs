import { UNIT } from "../core.mjs";
import { alive, ordered } from "../block-info.mjs";
import { entersAfter } from "../beside.mjs";
import { createFills } from "../fills.mjs";
import { FOLDED } from "../folded.mjs";
import { describe, note, report } from "../overlays.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { UNFILLED_ALONE, isSelectable } from "../../components/registry.mjs";

// Selected blocks (docs/editor.md, "Selecting blocks"): a set of blocks, none inside another, in
// document order. A box selection drawn from empty space gives blocks of one container
// (marquee.mjs; the page's header's lines with the page's blocks: geometry.mjs pick), Shift can add
// others; Shift+↑/↓ widens or narrows a selection among the neighbours of the block it started from
// (the header's lines and the page's blocks one run: runOf). Each selected block is filled (fills.mjs: in the editor's own layer,
// the page's, so a fill scrolls with its block natively, never inside the block, as the frame of what
// is being edited is, frame.mjs); the fills hide while the blocks are dragged (drag/). Deleting
// selected blocks is delete.mjs; what the keys do with a selection, blocks.mjs.
//
// A selection of text across blocks (text-select/) marks the blocks it takes whole (a code block, a
// table, a file…): they are filled as selected ones are, without being selected (mark).
//
// The fills belong to their blocks (docs/editor.md, "Overlays"): one per selected block on the
// page, made to match the selection the moment it changes (render), never on a later frame, so no
// fill outlives its block's selection, and none is drawn while the block tools are off. The frames
// only keep them where their blocks are (paint); a fill that cannot be drawn goes.
//
// What a folded heading hides (fold/) is never selected: select() leaves it out, Shift+↑/↓ and ↑/↓
// pass over it; what takes a folded heading away whole takes it along when it acts (fold/ takenWith).
// Nor is a unit of a kind that is never selected (`selectable: false`: an icon, the page's or a
// highlight block's, whose own controls are its tools): select() leaves it out, the keys pass over it.

// Whether a block is hidden by a folded heading (data-ge-folded on it or a block around it).
const folded = (node) => node.closest(`[${FOLDED}]`) !== null;

// Whether a block is of a kind never selected (the page's icon: registry.mjs isSelectable).
const unselectable = (node) => !isSelectable(node.getAttribute?.("data-ge-unit-kind"));

// A box standing loose in another, no block of its own: the page's header, in the page.
const loose = (node) => Boolean(node?.hasAttribute("data-ge-box")) && !node.matches(UNIT) && Boolean(node.parentElement?.hasAttribute("data-ge-box"));

// The blocks a block stands among for the keys (Shift+↑/↓, ↑/↓), in order, none a folded heading
// hides nor one never selected (the page's icon, before the title): its container's; a loose box's blocks stand where it stands among the blocks of the box
// around it, one run, as a box selection takes them (geometry.mjs pick), so from the header's last
// line the next block is the page's first.
function runOf(node) {
  let box = node.parentElement;
  while (loose(box)) box = box.parentElement;
  const run = [];
  const walk = (container) => {
    for (const child of container.children) {
      if (child.matches(UNIT)) run.push(child);
      else if (loose(child)) walk(child);
    }
  };
  if (box) walk(box);
  return run.filter((unit) => !folded(unit) && !unselectable(unit));
}

/**
 * info: block-info.mjs. active(): whether block tools may show. say(text, kind, hold): the status
 * line. closeMenu(): the block menu closes. schedule(): the block tools' next frame (blocks.mjs),
 * which keeps the fills where their blocks are.
 */
export function createSelection({ info, active, say, closeMenu, schedule }) {
  const { nameOf } = info;
  let picked = []; // the selected blocks, in document order, none inside another
  let marked = []; // the blocks a text selection takes whole (text-select/): filled, not selected
  let anchor = null; // the block Shift+↑/↓ widens the selection from
  let hidden = false; // the fills hide while the blocks are dragged
  const halos = createFills({ kind: "halo", className: "ge-halo", stands: (node) => (picked.includes(node) || marked.includes(node)) && active() });

  /** Select a block, or several (none is clearing); `quiet`: without saying so. */
  function select(targets, { quiet = false } = {}) {
    closeMenu();
    const next = ordered([targets].flat().filter(alive)).filter((node) => !folded(node) && !unselectable(node));
    if (next.length === 0) return clear();
    if (next.length !== picked.length || next.some((node, index) => node !== picked[index])) {
      picked = next;
      note("select", picked.map(describe).join(", "));
    }
    if (!picked.includes(anchor)) anchor = picked[0];
    const focused = document.activeElement;
    if (focused && focused !== document.body && focused.closest("main")) focused.blur();
    getSelection()?.removeAllRanges();
    if (!quiet) {
      const [first] = picked;
      say(picked.length > 1
        ? t("已选中 {0} 块 · Delete 删除 · 拖动手柄一起移动 · Esc 取消", picked.length)
        : t("已选中{0} · Delete 删除{1} · Esc 取消", nameOf(first), entersAfter(first) ? t(" · Enter 在下方新建文本") : t(" · Enter 编辑")));
    }
    render();
    schedule();
  }

  function clear() {
    if (picked.length > 0) note("clear", picked.map(describe).join(", "));
    picked = [];
    anchor = null;
    render();
    schedule();
  }

  // Blocks taken off the page (undo, a commit, the page's own script) leave the selection, and
  // their fills go with them.
  function prune() {
    const gone = picked.filter((node) => !alive(node));
    if (gone.length === 0) return;
    note("prune", gone.map(describe).join(", "));
    picked = picked.filter(alive);
    if (!picked.includes(anchor)) anchor = picked[0] ?? null;
    render();
  }

  // Shift+↑/↓: the selection widens (or narrows) by one block among the anchor's neighbours.
  function extend(delta) {
    const list = anchor ? runOf(anchor) : [];
    const at = list.indexOf(anchor);
    if (at < 0) return;
    const inside = picked.map((node) => list.indexOf(node)).filter((index) => index >= 0);
    const low = Math.min(...inside);
    const high = Math.max(...inside);
    const end = Math.max(0, Math.min(list.length - 1, (high > at ? high : low < at ? low : at) + delta));
    select(list.slice(Math.min(at, end), Math.max(at, end) + 1), { quiet: true });
    list[end].scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  // The next or previous block in the same container (the page's header and the page one run: runOf).
  function sibling(node, forward) {
    const run = runOf(node);
    const at = run.indexOf(node);
    return at < 0 ? null : run[at + (forward ? 1 : -1)] ?? null;
  }

  // The fills made to match the selection now: those of blocks no longer selected (or no longer on
  // the page) go at once; each selected block shown gets its fill where it is, reaching past it as
  // reachOf says, never into a neighbour's (roomOf). One that cannot be drawn takes all the fills
  // down (said once): better none than one in the wrong place. A kind whose own tools show it selected
  // (UNFILLED_ALONE: the image with its picture, its corner grips and toolbar) draws no fill selected alone (the user, 2026-11-09: no pale
  // blue over a picture clicked); among other blocks it is filled as they are.
  const toolsShowIt = () => {
    if (picked.length !== 1 || marked.length !== 0) return false;
    const holds = UNFILLED_ALONE[picked[0].getAttribute?.("data-ge-unit-kind")];
    return holds !== undefined && picked[0].querySelector?.(holds) !== null;
  };
  function render() {
    try {
      halos.paint(hidden || !active() || toolsShowIt() ? [] : [...picked, ...marked].filter(alive));
    } catch (error) {
      unpaint();
      report("selection fills", error);
    }
  }

  // Every fill taken down (the selection stays).
  const unpaint = () => halos.clear();

  // For the tests and DevTools: the selected blocks (the page carries no mark of the selection).
  globalThis.__gallerySelected = () => [...picked];

  return {
    /** The selected blocks, in document order (the selection's own list: read it, never change it). */
    get picked() { return picked; },
    /**
     * With several blocks selected, the one that is `target` or holds it (an item of a selected
     * list: its handle's menu is the group's, as any selected block's handle's is), else null.
     */
    holderOf: (target) => (picked.length > 1 ? picked.find((node) => node === target || node.contains(target)) ?? null : null),
    select,
    clear,
    /** Fill `targets` as selected ones without selecting them (a text selection's whole blocks; none: no more). */
    mark(targets) {
      const next = ordered([targets].flat().filter(alive));
      if (next.length === marked.length && next.every((node, index) => node === marked[index])) return;
      marked = next;
      render();
      schedule();
    },
    extend,
    sibling,
    prune,
    /** A frame: the fills where their blocks are now; none while the blocks are dragged (`dragging`). */
    paint(dragging) {
      hidden = dragging;
      render();
    },
    unpaint,
    /** The editing stops: nothing selected, no fills. */
    hide() {
      marked = [];
      clear();
      unpaint();
    },
    /** The selection for the overlays' snapshot. */
    state: () => ({ picked: picked.map(describe), offPage: picked.filter((node) => !node.isConnected).length, fills: halos.count, hidden }),
  };
}
