// The database's menus and cards (.popover in the database's own layer, so its keys and presses are the
// block's): one stack for the page. A press outside closes those of the stack that do not hold it (a press on
// a card's anchor holds it, as one in [data-keep-popovers] does), Esc the top one alone. Each is placed by
// its anchor (an element, or a box of the window's) as `placement` says: "bottom" (above where the window has
// no room below), "top", "right" (a submenu: at its left where the window has no room) or "over"; `align`
// "start" or "end"; kept 8px inside the window. Its rows (.menu-item) are Gallery's menu rows: 28px, the row
// fill under the pointer. A card holds what `build(card, api)` puts in it; `api.refresh()` builds it again
// (what it shows changed: the database's change heard while it is open), keeping the field the reader types
// in where it is.
import { h } from "./dom.js";
import { icon } from "./icons.js";

/** A menu row: an icon, words (and a line of small words), a value at its right, a check, a submenu's arrow. */
export function item({ icon: glyph, label, right, checked, chevron, danger, disabled, active, tip, onClick, cls = "", data } = {}) {
  return h("button", {
    type: "button",
    class: `menu-item${danger ? " danger" : ""}${active ? " active" : ""}${disabled ? " disabled" : ""}${cls ? ` ${cls}` : ""}`,
    "data-doc-tip": tip || null,
    "aria-disabled": disabled ? "true" : null,
    data,
    on: { click: (event) => { if (!disabled) onClick?.(event); } },
  },
  glyph !== undefined && glyph !== null ? h("span", { class: "menu-icon" }, typeof glyph === "string" ? icon(glyph, 20) : glyph) : null,
  h("span", { class: "menu-label" }, label),
  right !== undefined && right !== null && right !== "" ? h("span", { class: "menu-right" }, right) : null,
  checked ? h("span", { class: "menu-check" }, icon("check", 16)) : null,
  chevron ? h("span", { class: "menu-chev" }, icon("chevronRight", 16)) : null);
}

/**
 * A row that is on or off: the whole row a button, a box at its right (its state its aria-checked); `look`
 * "switch", Gallery's switch there instead (a view's settings).
 */
export function checkItem({ icon: glyph, label, on, onChange, tip, look = "box" }) {
  const mark = (state) => (look === "switch" ? h("span", { class: "switch", "aria-hidden": "true" }, h("span")) : box(state));
  const row = h("button", { type: "button", class: `menu-item check-item${look === "switch" ? " is-switch" : ""}`, role: "menuitemcheckbox", "aria-checked": String(Boolean(on)), "data-doc-tip": tip || null, on: { click: (event) => {
    event.stopPropagation();
    const next = row.getAttribute("aria-checked") !== "true";
    row.setAttribute("aria-checked", String(next));
    if (look !== "switch") row.lastElementChild.replaceWith(mark(next));
    onChange(next);
  } } },
    glyph !== undefined && glyph !== null ? h("span", { class: "menu-icon" }, typeof glyph === "string" ? icon(glyph, 20) : glyph) : null,
    h("span", { class: "menu-label" }, label),
    mark(Boolean(on)));
  return row;
}

/** A checkbox as the drawing shows one (a record's, a filter's, a row of a menu's). */
export const box = (on, size = 16) => h("span", { class: `cbox${on ? " on" : ""}`, style: { width: size, height: size } }, on ? icon("check", size - 3, { bold: 2.6 }) : null);

export const sep = () => h("div", { class: "menu-sep" });

/** A small gray heading of a part of a menu (Gallery's), with something at its right. */
export const heading = (label, right = null) => h("div", { class: "menu-label-row" }, h("span", null, label), right);

/** A row of words in the menu's gray (a hint, nothing to choose). */
export const note = (label) => h("div", { class: "menu-empty" }, label);

/** A page's head in a card that goes back: its arrow back, its title. */
export function pageHead(title, onBack) {
  return h("div", { class: "page-head" },
    onBack ? h("button", { type: "button", class: "icon-btn sm", "aria-label": onBack.label ?? "", on: { click: onBack } }, icon("back", 15)) : null,
    h("span", { class: "page-title" }, title));
}

/** A segmented control: a value of a few, each a button. */
export function seg({ value, options, onChange, small = true }) {
  return h("div", { class: `seg${small ? " sm" : ""}` }, options.map((option) => h("button", {
    type: "button",
    class: option.value === value ? "on" : "",
    "data-doc-tip": option.tip || null,
    on: { click: () => onChange(option.value) },
  }, option.label)));
}

/** A field in a card: an icon before it, its words. */
export function field({ icon: glyph = null, value = "", placeholder = "", cls = "" }) {
  const input = h("input", { value, placeholder, spellcheck: "false" });
  const wrap = h("div", { class: `name-input${cls ? ` ${cls}` : ""}` }, glyph ? (typeof glyph === "string" ? icon(glyph, 15, { cls: "prop-ic" }) : glyph) : null, input);
  return { wrap, input };
}

/** How wide every menu and card of the database is (Gallery's menus', a view's settings'), unless one needs more. */
export const MENU_WIDTH = 250;
/** A formula's editor: its words, the columns and the functions to put in. */
export const FORMULA_WIDTH = 420;

// ---------- the stack ----------
// The cards open, of every database on the page: a press outside closes those that do not hold it, Esc the top one.
const stack = []; // { card, anchor, close }
const onDown = (event) => {
  const target = event.target;
  for (const entry of [...stack].reverse()) {
    if (entry.card.contains(target)) break;
    if (entry.anchor instanceof Element && entry.anchor.contains(target)) break;
    if (target instanceof Element && target.closest("[data-keep-popovers]")) break;
    entry.close("outside");
  }
};
const onKey = (event) => {
  if (event.key !== "Escape" || !stack.length || event.isComposing) return;
  event.stopPropagation();
  event.preventDefault();
  stack[stack.length - 1].close("escape");
};
function push(entry) {
  if (!stack.length) {
    document.addEventListener("mousedown", onDown, true);
    document.addEventListener("keydown", onKey, true);
  }
  stack.push(entry);
}
function pull(entry) {
  const at = stack.indexOf(entry);
  if (at >= 0) stack.splice(at, 1);
  if (!stack.length) {
    document.removeEventListener("mousedown", onDown, true);
    document.removeEventListener("keydown", onKey, true);
  }
}

// The cards open in each database's layer, so that the drawing can close them all (a view switched, a drag begun)
// and draw again those that show what a change of the store touched.
const opened = new WeakMap(); // layer -> Set of the cards' apis

/** Every card open in `layer` closed. */
export function closeAll(layer) {
  for (const api of [...(opened.get(layer) ?? [])]) api.close();
}

/** Every card open in `layer` that draws what changes (its `update`) drawn again: the store changed. */
export function refreshAll(layer) {
  for (const api of [...(opened.get(layer) ?? [])]) if (api.update && api.open) api.refresh();
}

/** Whether a card is open in `layer`. */
export const anyOpen = (layer) => (opened.get(layer)?.size ?? 0) > 0;

const STOPPED = ["mousedown", "click", "dblclick", "keydown", "contextmenu", "paste", "copy", "cut"];

/**
 * A card of the database's (.popover) in `layer`, by `anchor` (an element, or a box of the window's:
 * { left, top, right, bottom }). Returns { card, close, refresh, rebuild, place, open }. `build(card, api)`
 * fills it; `refresh` builds it again (or calls the card's own `api.update`), the field holding the focus kept.
 * Every card is MENU_WIDTH wide unless it says otherwise (one that needs more: a formula's editor; a cell's options under it).
 */
export function pop(layer, anchor, { build, width = MENU_WIDTH, minWidth, placement = "bottom", align = "start", gap = 4, cls = "", onClose, onRefresh } = {}) {
  if (!opened.has(layer)) opened.set(layer, new Set());
  const open = opened.get(layer);
  const card = h("div", { class: `popover${cls ? ` ${cls}` : ""}`, style: { top: "-9999px", left: "-9999px", ...(width ? { width: `${width}px` } : {}), ...(minWidth ? { minWidth: `${minWidth}px` } : {}) } });
  for (const kind of STOPPED) card.addEventListener(kind, (event) => event.stopPropagation());
  let last = null; // the anchor's box last seen (an anchor taken off the page keeps it)
  let shut = false;
  const place = () => {
    if (shut) return;
    if (anchor instanceof Element) {
      if (anchor.isConnected) last = anchor.getBoundingClientRect();
    } else if (anchor) last = { left: anchor.left, top: anchor.top, right: anchor.right ?? anchor.left, bottom: anchor.bottom ?? anchor.top };
    const a = last;
    if (!a) return;
    const wide = card.offsetWidth;
    const tall = card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let top = 0;
    let left = 0;
    if (placement === "right") {
      left = a.right + gap;
      top = a.top - 6;
      if (left + wide > vw - 8) left = a.left - gap - wide;
    } else if (placement === "over") {
      left = a.left;
      top = a.top;
    } else if (placement === "top") {
      top = a.top - gap - tall;
      left = align === "end" ? a.right - wide : a.left;
    } else {
      top = a.bottom + gap;
      left = align === "end" ? a.right - wide : a.left;
      if (top + tall > vh - 8 && a.top - gap - tall > 8) top = a.top - gap - tall;
    }
    left = Math.max(8, Math.min(left, vw - wide - 8));
    top = Math.max(8, Math.min(top, vh - tall - 8));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
  };
  const sizes = new ResizeObserver(place);
  const entry = { card, anchor, close: (reason) => api.close(reason) };
  const api = {
    card,
    close: (reason = "closed") => {
      if (shut) return;
      shut = true;
      pull(entry);
      open.delete(api);
      sizes.disconnect();
      removeEventListener("resize", place);
      removeEventListener("scroll", place, true);
      // A field of it left as it goes (what was typed there saved, as when the focus moves away).
      if (card.contains(document.activeElement)) document.activeElement.blur();
      try { card.hidePopover?.(); } catch {}
      card.remove();
      onClose?.(reason);
    },
    // What it shows drawn again: by the card's own `update` where it has one (a card with a field the reader
    // types in keeps that element, its caret, its own undo, an input method's letters, and draws only what
    // changes around it), else built anew.
    refresh: () => {
      if (shut) return;
      const scroll = [...card.querySelectorAll("[data-scroll]")].map((node) => [node.dataset.scroll, node.scrollTop]);
      if (api.update) api.update();
      else {
        card.replaceChildren();
        build(card, api);
      }
      for (const [name, top] of scroll) { const node = card.querySelector(`[data-scroll="${name}"]`); if (node) node.scrollTop = top; }
      place();
      onRefresh?.();
    },
    /** Built anew from `build` (another page of the card shown): what a page drew itself (`update`) goes with it. */
    rebuild: () => {
      api.update = null;
      api.refresh();
    },
    /** Set by a card that draws its changing part itself (above). */
    update: null,
    place,
    get open() { return !shut; },
  };
  // One opened from inside an open card stays with it (a submenu, a picker in a card); any other takes the place of
  // those open.
  for (const entry of [...stack].reverse()) if (!(anchor instanceof Element && entry.card.contains(anchor))) entry.close("replaced");
  layer.append(card);
  // In the top layer, over the page and over a record's details (themselves there): nothing covers or cuts it.
  card.setAttribute("popover", "manual");
  try {
    card.showPopover();
  } catch {
    card.removeAttribute("popover");
  }
  build(card, api);
  if (shut) return api;
  push(entry);
  open.add(api);
  place();
  sizes.observe(card);
  // A card on a cell follows the cell as it grows (a cell of several options wrapping).
  if (anchor instanceof Element) sizes.observe(anchor);
  addEventListener("resize", place);
  addEventListener("scroll", place, true);
  return api;
}
