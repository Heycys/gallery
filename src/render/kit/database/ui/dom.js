// What the drawing makes its elements with: h() builds one (its class, attributes, style, listeners and
// children in one call), and a few helpers say what it does with them again and again.

import { Z } from "../../../../shared/layers.mjs";

/**
 * An element: `tag` with `props` (class, text, html, style: an object of properties, custom ones too,
 * on: listeners by event, data: data-* by name, and any other attribute; a value of null, undefined or
 * false leaves it out, true writes it empty) and `children` (elements, strings, arrays of them; null,
 * undefined and false are none).
 * @returns {HTMLElement}
 */
export function h(tag, props, ...children) {
  const node = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === null || value === undefined || value === false) continue;
      if (key === "class") node.className = value;
      else if (key === "text") node.textContent = value;
      else if (key === "html") node.innerHTML = value;
      else if (key === "style") setStyles(node, value);
      else if (key === "on") {
        for (const [type, run] of Object.entries(value)) if (run) node.addEventListener(type, run);
      } else if (key === "data") {
        for (const [name, data] of Object.entries(value)) if (data !== null && data !== undefined && data !== false) node.dataset[name] = data === true ? "" : String(data);
      } else if (key === "value" && "value" in node) node.value = value;
      else node.setAttribute(key, value === true ? "" : String(value));
    }
  }
  append(node, children);
  return node;
}

/** Children appended: elements, strings (text), arrays of them; null, undefined and false skipped. */
export function append(node, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(node, child);
    else node.append(child instanceof Node ? child : String(child));
  }
  return node;
}

/**
 * What may be put in an element as its children, as the DOM's append and replaceChildren take them: arrays
 * flattened, null, undefined and false left out (the DOM would write them as words), the rest as they are.
 * `node.append(...kids(a, cond ? b : null, [c, d]))`.
 */
export function kids(...children) {
  const out = [];
  const take = (list) => {
    for (const child of list) {
      if (child === null || child === undefined || child === false) continue;
      if (Array.isArray(child)) take(child);
      else out.push(child);
    }
  };
  take(children);
  return out;
}

/** An element's style properties set (custom ones, --name, too); a value of null or undefined takes one off. */
export function setStyles(node, styles) {
  for (const [name, value] of Object.entries(styles ?? {})) {
    if (value === null || value === undefined || value === "") node.style.removeProperty(name.startsWith("--") ? name : kebab(name));
    else if (name.startsWith("--")) node.style.setProperty(name, String(value));
    else node.style.setProperty(kebab(name), typeof value === "number" && !UNITLESS.has(name) ? `${value}px` : String(value));
  }
}
const UNITLESS = new Set(["opacity", "zIndex", "flex", "flexGrow", "flexShrink", "fontWeight", "lineHeight", "order"]);
const kebab = (name) => name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

/** A class put on or taken off, but only where it changes (a class set again still has the browser restyle). */
export function toggle(node, name, on) {
  if (node.classList.contains(name) !== Boolean(on)) node.classList.toggle(name, Boolean(on));
}

/** An attribute set, or taken off for null, undefined and false, only where it changes. */
export function attr(node, name, value) {
  const next = value === null || value === undefined || value === false ? null : value === true ? "" : String(value);
  if (node.getAttribute(name) !== next) {
    if (next === null) node.removeAttribute(name);
    else node.setAttribute(name, next);
  }
}

/** Words set only where they change. */
export function text(node, words) {
  const next = String(words ?? "");
  if (node.textContent !== next) node.textContent = next;
}

/**
 * The children of `parent` made to be `items` in order, an element each, kept by key: an item whose key
 * stood there keeps its element, one new is `create`d, each `update`d (a new one too: what create made filled
 * at once), one gone removed. Elements of the
 * parent that are no item's (no data-key) stay where they are, after the items.
 */
export function keyed(parent, items, keyOf, create, update) {
  const was = new Map();
  for (const child of [...parent.children]) if (child.dataset.key !== undefined) was.set(child.dataset.key, child);
  let at = parent.firstElementChild;
  // Past what is no item at the start.
  while (at && at.dataset.key === undefined) at = at.nextElementSibling;
  const seen = new Set();
  for (const item of items) {
    const key = String(keyOf(item));
    seen.add(key);
    let node = was.get(key);
    if (!node) {
      node = create(item);
      node.dataset.key = key;
    }
    update?.(node, item);
    if (node !== at) parent.insertBefore(node, at);
    else at = at.nextElementSibling;
    while (at && at.dataset.key === undefined) at = at.nextElementSibling;
  }
  for (const [key, node] of was) if (!seen.has(key)) node.remove();
}

/** Whether a key event is an input method's (composing, or the keydown that ends a composition). */
export const composing = (event) => event.isComposing || event.keyCode === 229;

/** A textarea as tall as its words (at least `least` px). */
export function fit(area, least = 0) {
  area.style.height = "0px";
  area.style.height = `${Math.max(least, area.scrollHeight)}px`;
}

// The first press in a field soon after the click that opened it (a cell's editor, its words all selected or its
// caret at their end) is that click's second to the system, a double click that would select a word: it puts the
// caret where it lands, as a single click does (the user's 2026-11-24: the second click "did nothing" now and then).
// A double click in it after that is the browser's as ever.
export function pressFirstAsClick(field) {
  let pressed = false;
  field.addEventListener("mousedown", (event) => {
    if (!pressed && event.button === 0 && event.detail > 1) {
      event.preventDefault();
      const at = caretIndexAt(field, event.clientX, event.clientY);
      field.focus({ preventScroll: true });
      field.setSelectionRange(at, at);
    }
    pressed = true;
  });
}

// Where in an input's or a textarea's words a point is, as an offset: its words laid out again in a copy of it over it
// (the same font, spacing, padding, wrapping and scroll), the browser asked where a caret would go there.
function caretIndexAt(field, x, y) {
  const style = getComputedStyle(field);
  const copy = document.createElement("div");
  for (const name of ["font", "letterSpacing", "wordSpacing", "textIndent", "textTransform", "textAlign", "lineHeight", "tabSize", "direction", "boxSizing",
    "paddingTop", "paddingRight", "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth", "wordBreak", "overflowWrap"]) copy.style[name] = style[name];
  const box = field.getBoundingClientRect();
  Object.assign(copy.style, { position: "fixed", left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`, margin: "0", overflow: "hidden",
    whiteSpace: field.localName === "textarea" ? "pre-wrap" : "pre", borderStyle: "solid", borderColor: "transparent", opacity: "0", zIndex: String(Z.tooltip), pointerEvents: "auto" });
  copy.textContent = `${field.value}\u200b`; // a caret past the last letter has something to stand by
  field.parentElement.append(copy);
  // Placed where the field is, whatever the box it stands in (one that moves or is moved puts a fixed box elsewhere).
  const shown = copy.getBoundingClientRect();
  copy.style.left = `${box.left * 2 - shown.left}px`;
  copy.style.top = `${box.top * 2 - shown.top}px`;
  copy.scrollTop = field.scrollTop;
  copy.scrollLeft = field.scrollLeft;
  let at = field.value.length;
  const range = document.caretRangeFromPoint?.(x, y);
  const position = range ? { node: range.startContainer, offset: range.startOffset } : (() => { const found = document.caretPositionFromPoint?.(x, y); return found ? { node: found.offsetNode, offset: found.offset } : null; })();
  if (position && copy.contains(position.node)) at = Math.min(field.value.length, position.offset);
  copy.remove();
  return at;
}
