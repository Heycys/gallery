import { createBlockInfo } from "./block-info.mjs";
import { createBlockMenu } from "./block-menu/index.mjs";
import { createDrag } from "./drag/index.mjs";
import { createFolds } from "./fold/index.mjs";
import { createHandle } from "./handle/index.mjs";
import { createMenu } from "./menu.mjs";
import { createDelete } from "./selection/delete.mjs";
import { createSelection } from "./selection/index.mjs";
import { createMarquee } from "./selection/marquee.mjs";
import { FOLLOW, task } from "./frames.mjs";
import { entersAfter } from "./beside.mjs";
import { describe, onSettle, provide, report } from "./overlays.mjs";
import { pageObjects } from "./page-objects.mjs";

// The block tools (docs/editor.md, "Deleting blocks", "Moving blocks", "Selecting blocks"): what
// the reader does with whole blocks (units: paragraphs, lists, cards, tables, sections, Sheet
// tabs...; see findUnits in src/editor/source/), each in a folder of its own, wired here:
//
//   handle/       the handle beside a block (its grip, the bar and "+" beside it), a section's bar; which block the pointer is at
//   block-menu/   the menu a handle opens: turning a block into another type, layout, a new block below, columns, sections, deleting
//   selection/    the selected blocks and their fills; box selection (marquee.mjs); deleting (delete.mjs)
//   drag/         moving blocks: dragging a handle, where they would go (drop.mjs), Ctrl+Shift+arrows; where
//                 what is dragged in from outside would go (`outside`, for drop-in/)
//   fold/         a heading's section folded: the triangle right of its words, what is hidden, the section going with its heading;
//                 the level badge right of the triangle, whose menu shifts every heading a level
//
// What they share: what the page knows of a block (block-info.mjs), the menu card (menu.mjs), one
// task of the editor's frames (frames.mjs) that keeps the handle, the bar and the fills where their
// blocks are (it runs only while something shows, and then only when their blocks may have moved),
// and the keys while the focus is not in text (onKeydown). In each frame every tool's step stands
// alone: one that throws takes down what that tool draws (a drag is cancelled, never dropped) and is
// said, and the others go on.

/**
 * units: Map(id -> { kind, keep }) and boxes: Map(id -> { kind }) from the edit map. active(): whether block tools may show.
 * struct(parents, touched, mutate): the editor's undoable structural change. look(element,
 * { classes, sizes }, select): the editor's undoable change of classes and sizes (the block menu's colors).
 * say(text, kind, hold): the status line. edit(unit): put the caret into the block's text, if any.
 * turnInto(unit): the types the block can be turned into, { current, types }, or null;
 * convert(unit, type) turns it; turnIntoAll(units) / convertAll(units, type): the same for several
 * selected blocks together (convert.mjs groupTargets, editor.mjs convertAll); below(unit, type): a
 * block of the type below it (the block menu; the editor's insertBelow); add(unit, "section"): a new
 * section right after it, holding a paragraph with the caret. after(unit): a new paragraph right after
 * it, with the caret (false when its box takes none: the editor's insert.paragraphAfter).
 * blank(x, y, target): a click on empty space (the editor: a new
 * paragraph below the last block). nest(units, delta): selected list items indented (Tab) or
 * outdented (Shift+Tab) together (components/list/page.mjs); false when they are not all items.
 * keepsHandle(node): whether a node is another tool's over a block (a table's grips and edges:
 * table/), where the pointer keeps the handle as it is. addNear(unit, where): the handle's "+", an
 * empty block "below" the block (or "above": Alt) with the "/" menu open in it (the editor's addNear).
 * notes: 批注 on blocks (annotate/), for the button beside a block:
 * notes.can(units) whether they can take one, notes.at(unit) where the button beside the block stands,
 * notes.write(units) the annotation begun.
 * copyLink(unit): 复制块链接, the block menu's (the editor's copyBlockLink), or null for no such row.
 * linkAhead(): a block's menu opens with that row in it: what the click will want is read now.
 * slug: the report's (what is folded is kept by report: fold/).
 * shiftHeadings(way): every heading of the document a level larger ("up") or smaller ("down"), the
 * menu of a heading's level badge (fold/; the editor's shiftAllHeadings).
 */
export function createBlocks({ slug = "", units, boxes, active, struct, look, say, edit, turnInto, convert, turnIntoAll = () => null, convertAll = () => null, below, belowTypes = () => [], add, after = () => false, blank, nest, keepsHandle = () => false, addNear = () => {}, copyLink = () => {}, linkAhead = () => {}, notes, shiftHeadings = () => {} }) {
  const info = createBlockInfo({ units, boxes });
  const menu = createMenu();
  const closeMenu = () => menu.close();
  // What a failed frame takes down: what is drawn, and a drag (cancelled); the selection stays.
  const frames = task("blocks", { run: tick, fail: () => takeDown() });
  const schedule = () => frames.wake();

  const selection = createSelection({ info, active, say, closeMenu, schedule });
  const folds = createFolds({ slug, selection, active, schedule, menu, shift: shiftHeadings });
  const drag = createDrag({ info, selection, struct, say, closeMenu, schedule, folds });
  const blockMenu = createBlockMenu({ info, menu, selection, remove: (targets) => remove(targets), takenWith: folds.takenWith, turnInto, convert, turnIntoAll, convertAll, below, belowTypes, add, look, copyLink, linkAhead });
  const handle = createHandle({ info, active, selection, drag, menu, openMenu: blockMenu.open, drawing: () => marquee.drawing, schedule, keeps: (node) => keepsHandle(node) || folds.holds(node), aside: folds.holds, add: (target, where) => { selection.clear(); addNear(target, where); }, notes });
  const remove = createDelete({ info, selection, struct, say, closeMenu, forget: () => handle.forget(), folds });
  // What a component makes with these tools (`blockTools`): a Sheet's tabs as pills, a click, a drag, their menu, + (components/sheets/pills.mjs);
  // an image's grips and bar while it is the one block selected (components/image/page.mjs), placed in this task's frames (`follow`).
  const parts = pageObjects().flatMap((page) => page.blockTools?.({ active, drag, menu, openMenu: blockMenu.open, struct, say }) ?? []);
  // A press on empty space: a box selection, or a click there (marquee.mjs clears the selection).
  const marquee = createMarquee({
    active: () => active() && !drag.active,
    selection: { get: () => [...selection.picked], set: (list, options) => selection.select(list, options), clear: selection.clear },
    click: blank,
  });

  // Positions follow scrolling, resizing and reflow: while the handle, the bar or the fills show, the
  // task runs again whenever their blocks may have moved (FOLLOW, frames.mjs), not on every frame (the
  // pointer resting on a paragraph cost 60–160ms a second for the same picture); on every frame only
  // while blocks are dragged (the page scrolls by the window's edge under a still pointer).
  function tick() {
    if (!active()) {
      hide();
      return false;
    }
    step("handle", () => handle.track(), () => handle.hide());
    step("selection", () => selection.prune(), () => selection.unpaint());
    step("drag", () => drag.step(), () => drag.end(false));
    step("selection", () => selection.paint(drag.active), () => selection.unpaint());
    step("handle", () => handle.place(), () => handle.hide());
    step("fold", () => folds.place(handle.pointed), () => folds.hide());
    step("parts", () => parts.forEach((part) => part.follow?.(drag.active ? [] : selection.picked)), () => parts.forEach((part) => part.hide()));
    if (drag.active) return true;
    return handle.showing || folds.showing || selection.picked.length > 0 ? FOLLOW : false;
  }

  // One tool's part of a frame; when it throws, what that tool draws goes, and it is said.
  function step(name, run, fail) {
    try {
      run();
    } catch (error) {
      try {
        fail();
      } catch {}
      report(`block tools: ${name}`, error);
    }
  }

  // A press anywhere but on the block tools closes the menu; on a divider line it selects the line,
  // on empty space it may start a box selection, elsewhere it clears the selection.
  document.addEventListener("pointerdown", (event) => {
    if (handle.holds(event.target) || folds.holds(event.target) || menu.contains(event.target) || parts.some((part) => part.holds(event.target))) return;
    closeMenu();
    const line = event.button === 0 && active() ? handle.lineAt(event.target, event.clientX, event.clientY) : null;
    if (line) {
      event.preventDefault(); // no caret goes anywhere
      handle.hover(line);
      selection.select(line);
      return;
    }
    if (marquee.begin(event)) return;
    if (selection.picked.length > 0) selection.clear();
  }, true);
  addEventListener("scroll", (event) => { if (!menu.contains(event.target)) closeMenu(); }, { passive: true, capture: true });
  addEventListener("resize", closeMenu);
  addEventListener("blur", closeMenu);

  /**
   * Keys while the focus is not in editable text. Returns true when handled: with the menu open,
   * ↑/↓ move through it (←/→ along its grid of types) and Enter runs a row; Delete/Backspace delete the selected blocks,
   * Ctrl+Shift+arrows move them, Shift+↑/↓ widen or narrow the selection, Enter edits the first of
   * them (the caret at the end of its text; a formula block's editor opens) or, when that
   * one is no text (a code block, a highlight block, a disclosure, a card, a table, a divider, a row of
   * columns, a 选项卡区块: beside.mjs entersAfter), puts a new paragraph after the last, arrows select the
   * neighbouring block, Esc cancels a drag, closes the menu or clears the selection.
   */
  function onKeydown(event) {
    if (event.key === "Escape" && (drag.active || menu.isOpen)) {
      event.preventDefault();
      if (drag.active) drag.end(false);
      else closeMenu();
      return true;
    }
    if (drag.active) return true; // keys wait until the block is dropped
    const key = event.key;
    const plain = !event.ctrlKey && !event.metaKey && !event.altKey;
    if (menu.isOpen && plain && menu.arrow(event)) {
      event.preventDefault();
      return true;
    }
    // A letter while 在下方新建's blocks are open: into their search field (menu.mjs type).
    if (menu.isOpen && menu.type(event)) return true;
    // ←/→ move along the menu's grid of types, when one of them is highlighted.
    if (menu.isOpen && plain && (key === "ArrowLeft" || key === "ArrowRight") && menu.move(key === "ArrowRight" ? 1 : -1, true)) {
      event.preventDefault();
      return true;
    }
    if (menu.isOpen && plain && key === "Enter" && menu.hasChoice) {
      event.preventDefault();
      menu.choose();
      return true;
    }
    const picked = selection.picked;
    if (picked.length === 0) return false;
    // Tab and Shift+Tab: selected list items indent or outdent together, staying selected.
    if (key === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (nest(picked, event.shiftKey ? -1 : 1)) selection.select([...picked], { quiet: true });
      return true;
    }
    const vertical = key === "ArrowUp" || key === "ArrowDown";
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && !event.altKey && /^Arrow(Up|Down|Left|Right)$/.test(key)) {
      event.preventDefault();
      drag.moveBy(picked, key === "ArrowUp" || key === "ArrowLeft" ? -1 : 1);
      return true;
    }
    if (plain && event.shiftKey && vertical) {
      event.preventDefault();
      selection.extend(key === "ArrowDown" ? 1 : -1);
      return true;
    }
    if (!plain) return false;
    if (key === "Delete" || key === "Backspace") remove(picked);
    else if (key === "Escape") selection.clear();
    else if (key === "Enter") {
      const [first] = picked;
      closeMenu();
      if (!entersAfter(first) || !after(picked.at(-1))) {
        selection.clear();
        edit(first);
      }
    } else if (vertical) {
      // From the first selected block up, from the last down; the selection becomes that one block.
      const from = key === "ArrowDown" ? picked.at(-1) : picked[0];
      const next = selection.sibling(from, key === "ArrowDown") ?? (picked.length > 1 ? from : null);
      if (next) selection.select(next, { quiet: true });
    } else return false;
    event.preventDefault();
    return true;
  }

  function takeDown() {
    drag.end(false);
    marquee.cancel();
    handle.hide();
    folds.hide();
    selection.unpaint();
  }

  function hide() {
    if (drag.active) drag.end(false);
    marquee.cancel();
    handle.hide();
    folds.hide();
    parts.forEach((part) => part.hide());
    selection.hide();
    closeMenu();
  }

  // Blocks taken off the page by a structural change: out of the selection, the handle away from them.
  onSettle(() => {
    selection.prune();
    handle.settle();
  });
  provide("blockTools", () => ({ active: active(), ...selection.state(), dragging: drag.active, drawingBox: marquee.drawing, handleShowing: handle.showing, handleTarget: describe(drag.target) }));

  return {
    onKeydown,
    select: selection.select,
    clear: selection.clear,
    mark: selection.mark,
    keepText: info.keepText,
    moveBy: drag.moveBy,
    /** What is dragged in from outside the page, shown and put where it goes (drag/ `outside`, for drop-in/). */
    outside: drag.outside,
    /** Headings' sections folded (fold/). */
    folds,
    remove,
    closeMenu,
    /** A block selected and its menu open by `rect` (a component's own button: an image's 更多). */
    openMenu(target, rect) {
      selection.select(target, { quiet: true });
      blockMenu.open(target, rect);
    },
    /** The reader is typing: the handle steps aside until the pointer moves. */
    typing() {
      handle.typing();
      schedule();
    },
    /** The selected blocks, in document order. */
    get picked() { return [...selection.picked]; },
    /** The editor's UI nodes to keep in the top layer when a modal dialog opens (those drawn over
     * blocks go in the layer of their block's dialog by themselves, overlay-layer.mjs). */
    get nodes() { return [...menu.nodes, ...marquee.nodes, ...drag.nodes, ...parts.flatMap((part) => part.nodes)].filter((node) => node?.isConnected); },
  };
}
