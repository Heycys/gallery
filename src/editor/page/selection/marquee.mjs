import { Z } from "../../../shared/layers.mjs";
import { blankTarget, measure, pick } from "../geometry.mjs";
import { DIALOG } from "../../components/kit.mjs";
import { edgeFollower } from "../edge-scroll.mjs";
import { cancelOnEscape, endsGesture, gestureLock } from "../gesture.mjs";
import { note, own } from "../overlays.mjs";
import { addStyle, element, mount } from "../ui.mjs";

// A press on empty space (geometry.mjs blankTarget: the page around the report, a box between its
// blocks): moved more than a few pixels, it draws a box selection (docs/editor.md, "Selecting
// blocks"); released where it was, it is a click on empty space. The rectangle's start stays on
// the content while the page scrolls (the wheel, or the pointer near the window's top or bottom
// edge); the blocks it takes are geometry.mjs pick()'s. With Shift held (at any moment), what it
// takes is added to or taken out of what was selected when it started. While a detail card is open,
// one is drawn in the card's content alone, its own top as for Ctrl+A (select-all/): the press on
// its empty space, the blocks it takes of that content, the rectangle's start staying on the content
// as the content scrolls. Only a mouse draws one, and not where the pointer is on an edge that resizes (resize/) or in a
// gap that does (between two columns, or two nodes of a flowchart's row: columns/, which takes that
// press; its listener comes after this one, so it cannot keep the press from here).
// Anything that ends the press another way (the capture lost, the window losing the focus, the
// page hidden, Esc) cancels it: what it took is let go. The rectangle belongs to the press
// (overlays.mjs); scrolling near the edges is a task of the editor's frames (edge-scroll.mjs), and the
// ways a press gives up are gesture.mjs's.

const STYLE = `
  .ge-marquee { position: fixed; left: 0; top: 0; z-index: ${Z.marquee}; box-sizing: border-box; border: 1px solid transparent; background: var(--ge-halo); pointer-events: none; }
  ${gestureLock("data-ge-marquee", { cursor: "default", select: true })}
`;

const START = 4; // how far the pointer moves before the press draws a box selection

/**
 * active(): whether block tools may show. selection: { get() -> blocks, set(blocks, { quiet }),
 * clear() }. click(x, y, target): a click on empty space.
 */
export function createMarquee({ active, selection, click }) {
  addStyle(STYLE);
  let held = null; // { x, y, pageX, pageY, start, shift, target, tree, drawn, pointer }
  const shape = own(element("div", { class: "ge-marquee" }), "box selection", { alive: () => Boolean(held?.drawn) });
  // Near the top or bottom edge of what it is drawn in (the window, or the card's content) that
  // scrolls, and the rectangle follows (a frame; again on the next one while the rectangle is drawn).
  const scrolling = edgeFollower("box selection", { pointer: () => (held?.drawn ? held : null), scroller: () => held.scroller, scrolled: () => update(), fail: () => cancel() });

  // Where a press may draw one: the page, or, while a detail card is open, the content of the card
  // the press is in (its own top, as Ctrl+A's: select-all/), never the page behind it. null: nowhere.
  function topOf(target) {
    if (!document.querySelector(DIALOG.open)) return document.querySelector("main");
    const content = target.closest(DIALOG.open)?.querySelector(DIALOG.openContent);
    return content?.contains(target) ? content : null;
  }

  // What scrolls under the rectangle: a card's content scrolls by itself, the page with the window.
  const scrolled = () => (held.scroller ? { x: held.scroller.scrollLeft, y: held.scroller.scrollTop } : { x: scrollX, y: scrollY });

  /** A press on the page: takes it (true) when it is on empty space. */
  function begin(event) {
    if (held || event.button !== 0 || event.pointerType !== "mouse" || !active() || !blankTarget(event.target)) return false;
    if (document.documentElement.hasAttribute("data-ge-resize") || document.documentElement.hasAttribute("data-ge-gap")) return false;
    const root = topOf(event.target);
    if (!root) return false;
    // Not cancelled: the page still takes the focus, as a click on empty space always gave it (in a
    // workbench, its keys then reach the page); text selection is off while the press lasts.
    document.documentElement.setAttribute("data-ge-marquee", "");
    const focused = document.activeElement;
    if (focused?.isContentEditable && focused.closest("main")) focused.blur();
    getSelection()?.removeAllRanges();
    held = {
      x: event.clientX, y: event.clientY, root, scroller: root.localName === "main" ? null : root, card: root.closest("dialog"),
      start: selection.get(), shift: event.shiftKey, target: event.target, tree: null, drawn: false, pointer: event.pointerId,
    };
    // Its start, on the content: where it is as what scrolls under it moves (the tree's frame: from()).
    const at = scrolled();
    held.startX = event.clientX + at.x;
    held.startY = event.clientY + at.y;
    note("box selection", "press");
    try {
      document.documentElement.setPointerCapture(event.pointerId);
    } catch {}
    return true;
  }

  function draw() {
    held.drawn = true;
    held.tree = measure(held.root); // page coordinates, as what scrolls under it was then (held.at)
    held.at = scrolled();
    held.page = { x: scrollX, y: scrollY };
    if (!held.shift) selection.clear();
    // In the card's own top layer, over its content (the card on top when one was opened from another).
    if (held.card) {
      shape.dataset.docDev = "";
      held.card.append(shape);
    } else mount(shape);
    scrolling.wake();
  }

  // The rectangle from where the press started (on the content) to the pointer, and what it takes:
  // the window's rectangle in the tree's frame, moved by what has scrolled since it was measured.
  function update() {
    const now = scrolled();
    const startX = held.startX - now.x;
    const startY = held.startY - now.y;
    const left = Math.min(startX, held.x);
    const top = Math.min(startY, held.y);
    const width = Math.abs(held.x - startX);
    const height = Math.abs(held.y - startY);
    Object.assign(shape.style, { transform: `translate(${Math.round(left)}px, ${Math.round(top)}px)`, width: `${Math.round(width)}px`, height: `${Math.round(height)}px` });
    const dx = now.x - held.at.x + held.page.x;
    const dy = now.y - held.at.y + held.page.y;
    let taken = pick(held.tree, { left: left + dx, top: top + dy, right: left + width + dx, bottom: top + height + dy });
    if (held.shift) taken = [...held.start.filter((node) => !taken.includes(node)), ...taken.filter((node) => !held.start.includes(node))];
    selection.set(taken, { quiet: true });
  }

  function stop() {
    if (!held) return;
    const { pointer } = held;
    held = null;
    shape.remove();
    document.documentElement.removeAttribute("data-ge-marquee");
    try {
      document.documentElement.releasePointerCapture(pointer);
    } catch {}
  }

  /** Give up the press (Esc, the window losing focus): a box selection being drawn takes nothing. */
  function cancel() {
    if (!held) return;
    note("box selection", "cancelled");
    if (held.drawn) selection.clear();
    stop();
  }

  addEventListener("pointermove", (event) => {
    if (!held || event.pointerId !== held.pointer) return;
    held.x = event.clientX;
    held.y = event.clientY;
    held.shift = event.shiftKey;
    const at = scrolled();
    if (!held.drawn && Math.hypot(event.clientX + at.x - held.startX, event.clientY + at.y - held.startY) > START) draw();
    if (held.drawn) update();
  }, true);
  addEventListener("pointerup", (event) => {
    if (!held || event.pointerId !== held.pointer) return;
    const { drawn, target } = held;
    stop();
    if (!drawn) {
      selection.clear();
      click(event.clientX, event.clientY, target);
      return;
    }
    const taken = selection.get();
    if (taken.length > 0) selection.set(taken); // says what was taken
  }, true);
  // After pointerup the press is over already (stop() let the capture go); it ends any other way too.
  endsGesture({ active: () => Boolean(held), cancel, owns: (event) => event.pointerId === held.pointer });
  cancelOnEscape({ active: () => Boolean(held), cancel });
  addEventListener("scroll", () => { if (held?.drawn) update(); }, { passive: true, capture: true });
  const shiftKey = (event) => {
    if (!held?.drawn || event.key !== "Shift") return;
    held.shift = event.type === "keydown";
    update();
  };
  addEventListener("keyup", shiftKey, true);
  addEventListener("keydown", shiftKey, true);

  return {
    begin,
    cancel,
    /** A box selection is being drawn (the handle steps aside). */
    get drawing() { return Boolean(held?.drawn); },
    /** The editor's UI nodes to keep in the top layer when a modal dialog opens. */
    get nodes() { return shape.isConnected ? [shape] : []; },
  };
}
