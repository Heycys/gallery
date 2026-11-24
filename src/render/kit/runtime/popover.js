// A floating card of the kit's own with whatever a block puts in it (docs/render.md, "Choices"): the card
// DocKit.choose opens (styles/choice.css: rounded, the floating surface and the card's shadow, light or
// dark as the document is), for what is more than a list to choose from: a menu of rows with icons and
// submenus, a field and its suggestions, a small form. DocKit.popover(anchor, { build }) opens one under
// `anchor` (an element, or a box of the window's: { left, top, right, bottom }) and `build(card, handle)`
// fills it; it answers with the handle: `card`, `close()`, `place()` (once what it holds changed its
// size), `open`.
//
// Cards open from one another stack: one opened from an element inside an open card stays with it (a
// submenu, a picker in a card), one opened from anywhere else closes those open first. A press outside
// closes every card of the stack that does not hold it, from the top (a press on a card's anchor, or in a
// choice menu, DocKit.choose's, holds it); Esc closes the top one alone (and is no one else's); the window
// resized or anything scrolled places them again by their anchors (an anchor taken off the page keeps its
// last place). `onClose(reason)` hears it close, whatever closed it: "outside", "escape", "replaced",
// "closed" (handle.close()).
//
// A card is a popover (the top layer: no z-index or overflow of the page or the editor covers or cuts it)
// put in `within` where the caller gives one (an element of its own drawing: the keys and presses in the
// card are then the block's, as the page editor asks, `keepsKeys`), else in the modal detail card the
// anchor stands in, else at the end of <body>. Where it stands by its anchor is `placement`: "bottom"
// (under it, above where there is more room there), "top", "right" (a submenu: beside it, at its left
// where the window has no room) or "over" (on it); `align` "start" or "end" (the edges together), `gap`
// px between. `width` and `minWidth` size it (px), its height the window's room at most, its content
// scrolling past that. It grows out of its anchor's corner as the choice menu does and leaves by its
// opacity; it is a generated node (.doc-popover, the state description's runtime) that an export of the
// view leaves out, and it never prints.

const CARD = "doc-popover";
const EDGE = 8; // the card keeps this far from the window's edge

/** @type {{ card: HTMLElement, anchor: Element | null, finish(reason: string): void, place(): void }[]} */
const stack = [];
let listening = null; // the window the stack's listeners are on

const boxOf = (anchor, last) => {
  if (anchor && typeof anchor.getBoundingClientRect === "function") {
    if (anchor.isConnected) return anchor.getBoundingClientRect();
    return last;
  }
  if (anchor && typeof anchor.left === "number") return { left: anchor.left, top: anchor.top, right: anchor.right ?? anchor.left, bottom: anchor.bottom ?? anchor.top, width: (anchor.right ?? anchor.left) - anchor.left, height: (anchor.bottom ?? anchor.top) - anchor.top };
  return last;
};

function listen(view) {
  if (listening) return;
  listening = view;
  view.addEventListener("pointerdown", onPress, true);
  view.addEventListener("keydown", onKey, true);
  view.addEventListener("scroll", onMove, { capture: true, passive: true });
  view.addEventListener("resize", onMove);
}

function quiet() {
  if (!listening || stack.length > 0) return;
  listening.removeEventListener("pointerdown", onPress, true);
  listening.removeEventListener("keydown", onKey, true);
  listening.removeEventListener("scroll", onMove, { capture: true });
  listening.removeEventListener("resize", onMove);
  listening = null;
}

// A press: every card from the top that does not hold it closes, down to one that does (or its anchor).
function onPress(event) {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (target instanceof Element && target.closest(".doc-choice, .doc-choice-leaving, [data-doc-keep-popovers]")) return;
  for (const entry of [...stack].reverse()) {
    if (entry.card.contains(target) || (entry.anchor instanceof Element && entry.anchor.contains(target))) return;
    entry.finish("outside");
  }
}

// Esc: the top card closes; an input method's Esc (it cancels what it composes) is the input method's.
function onKey(event) {
  if (event.key !== "Escape" || event.isComposing || event.keyCode === 229 || stack.length === 0) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  stack[stack.length - 1].finish("escape");
}

function onMove(event) {
  // The card's own scroll (its rows) places nothing.
  if (event?.type === "scroll" && stack.some((entry) => entry.card === event.target || entry.card.contains?.(event.target))) return;
  for (const entry of stack) entry.place();
}

/** Whether a card of the kit's is open (a block's keys of its own wait while one is: its Esc is the card's). */
export const popoverOpen = () => stack.length > 0;

/**
 * DocKit.popover: a card under `anchor` holding what `build(card, handle)` puts in it (above).
 * @param {Element | { left: number, top: number, right?: number, bottom?: number }} anchor
 * @param {{ build(card: HTMLElement, handle: object): void, within?: Element | null, placement?: "bottom" | "top" | "right" | "over",
 *   align?: "start" | "end", gap?: number, width?: number, minWidth?: number, className?: string, label?: string,
 *   onClose?(reason: string): void }} options
 */
export function popover(anchor, { build, within = null, placement = "bottom", align = "start", gap = 4, width, minWidth, className = "", label = "", onClose } = {}) {
  if (typeof build !== "function") throw new Error("DocKit.popover: build(card, handle) fills the card");
  const element = anchor instanceof Element ? anchor : null;
  const doc = element?.ownerDocument ?? within?.ownerDocument ?? document;
  const view = doc.defaultView;
  // Opened from a card of the stack: it stays, with those under it; from anywhere else, they all close.
  const parent = element ? stack.findLastIndex((entry) => entry.card.contains(element)) : -1;
  for (const entry of stack.slice(parent + 1).reverse()) entry.finish("replaced");

  const card = doc.createElement("div");
  card.className = className ? `${CARD} ${className}` : CARD;
  if (label) card.setAttribute("aria-label", label);
  if (width) card.style.width = `${width}px`;
  if (minWidth) card.style.minWidth = `${minWidth}px`;
  let last = boxOf(anchor, null) ?? { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 };
  let done = false;
  const observer = new view.ResizeObserver(() => place());

  function place() {
    if (done) return;
    last = boxOf(anchor, last);
    const box = last;
    const height = view.innerHeight;
    const room = doc.documentElement.clientWidth || view.innerWidth;
    card.style.maxHeight = "";
    const size = { width: card.offsetWidth, height: card.offsetHeight };
    let left = align === "end" ? box.right - size.width : box.left;
    let top;
    if (placement === "right") {
      left = box.right + gap;
      top = box.top - 6;
      if (left + size.width > room - EDGE) left = box.left - gap - size.width;
    } else if (placement === "over") {
      top = box.top;
    } else if (placement === "top") {
      top = box.top - gap - size.height;
    } else {
      const below = height - box.bottom - gap - EDGE;
      const above = box.top - gap - EDGE;
      const up = size.height > below && above > below;
      top = up ? box.top - gap - Math.min(size.height, above) : box.bottom + gap;
      card.style.maxHeight = `${Math.floor(Math.max(120, up ? above : below))}px`;
      card.style.transformOrigin = `${align === "end" ? "right" : "left"} ${up ? "bottom" : "top"}`;
    }
    const tall = Math.min(card.offsetHeight, height - 2 * EDGE);
    left = Math.max(EDGE, Math.min(left, room - size.width - EDGE));
    top = Math.max(EDGE, Math.min(top, height - tall - EDGE));
    card.style.left = `${Math.round(left)}px`;
    card.style.top = `${Math.round(top)}px`;
  }

  const handle = {
    card,
    place,
    close: () => finish("closed"),
    get open() {
      return !done;
    },
  };

  function finish(reason) {
    if (done) return;
    done = true;
    observer.disconnect();
    const at = stack.findIndex((entry) => entry.card === card);
    // What was opened from it goes with it.
    if (at >= 0) for (const entry of stack.splice(at).slice(1).reverse()) entry.finish(reason);
    quiet();
    const gone = () => {
      try {
        card.hidePopover?.();
      } catch {}
      card.remove();
    };
    if (card.isConnected) {
      card.classList.add("is-leaving");
      view.setTimeout(gone, 90);
    }
    try {
      onClose?.(reason);
    } catch (error) {
      console.error("[DocKit] popover onClose:", error);
    }
  }

  stack.push({ card, anchor: element, finish, place });
  listen(view);
  (within ?? element?.closest?.("dialog[open]") ?? doc.body).append(card);
  card.setAttribute("popover", "manual");
  try {
    card.showPopover();
  } catch {
    card.removeAttribute("popover"); // no popover: a fixed card, its z-index the stylesheet's
  }
  build(card, handle);
  place();
  observer.observe(card);
  return handle;
}
