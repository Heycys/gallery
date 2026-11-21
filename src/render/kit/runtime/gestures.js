// The gestures a package's component would each write anew, the kit's once (DocKit.input, DocKit.text,
// DocKit.drag; docs/render.md "A custom block on a page"): a field whose value goes to the file when the
// reader is done with it, words of the component's drawing typed in where they stand, and a drag of an
// element of its drawing to a place it shows. None writes anything: each calls what the component gives
// it, which writes by context.edit (or asks its table: context.table()), once a gesture, so that a gesture
// is one undo step.

import { TEXT_TYPED } from "../../../shared/components/installed.mjs";

const listen = (target, type, run, signal, options = {}) => target.addEventListener(type, run, { ...options, signal });

// The kit's mark on an item while it is dragged, for a component's style: a class, which comes off
// with the drag (src/shared/components/installed.mjs names it).
const DRAGGING = "doc-dragging";

/**
 * A field the reader types a value in (an input, a textarea, a select), committed when they are done:
 * Enter (in a textarea Ctrl+Enter or ⌘Enter, Enter being a line), the field left (blur), a select
 * changed; never while an input method is composing (a Chinese IME's Enter takes the letters, and the
 * keydown that ends a composition is no Enter of the reader's), and never a value it committed last or
 * was set to: `commit(value)` hears each value once. Escape puts the value committed last back and
 * leaves the field. A field left while it composes commits as the composition ends.
 * @param {HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement} field
 * @param {{ commit(value: string): void, signal?: AbortSignal }} options
 */
export function fieldIn(field, { commit, signal } = {}) {
  if (typeof commit !== "function") throw new Error("DocKit.input: commit(value) is a function");
  let committed = field.value; // what the file holds as far as the field knows: committed or set
  let composing = false;
  let leftComposing = false;
  const done = () => {
    if (composing || field.value === committed) return;
    committed = field.value;
    commit(committed);
  };
  listen(field, "compositionstart", () => { composing = true; }, signal);
  listen(field, "compositionend", () => {
    composing = false;
    if (leftComposing) {
      leftComposing = false;
      done();
    }
  }, signal);
  listen(field, "keydown", (event) => {
    // keyCode 229: the key an input method has, Safari's Enter right after it ends a composition.
    if (composing || event.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter" && field.localName !== "select" && (field.localName !== "textarea" || event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      done();
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      field.value = committed;
      field.blur();
    }
  }, signal);
  listen(field, "blur", () => {
    if (composing) leftComposing = true;
    else done();
  }, signal);
  if (field.localName === "select") listen(field, "change", done, signal);
  return Object.freeze({
    /**
     * The value the file holds now (drawn from a part): shown, unless the reader is typing another in
     * the field, whose words stay; either way it is what is committed against.
     */
    set(value) {
      const typing = field.ownerDocument.activeElement === field && field.value !== committed;
      committed = String(value);
      if (!typing) field.value = committed;
    },
    /** The value committed last, or set. */
    get value() {
      return committed;
    },
  });
}

// The kit's marks on words a component draws that a reader types in where they stand (DocKit.text):
// the words themselves, for the kit's look (styles/installed.css: under the pointer and while typed in,
// the light fill of the accent that a figure's or a layout's words take in the page editor), and the gray
// words shown while they are empty. A component's generated node carries them, and goes with them.
const TEXT = "data-doc-text";
const TEXT_EMPTY = "data-doc-text-empty";

/**
 * Words of a component's drawing (`node`, an element of its own holding them alone: a card's title, a
 * group's name, a chart's title) that stand for something of the file (a cell of its table, a setting)
 * and are typed in where they stand, as a figure's or a layout's words are in the page editor: while
 * `enabled()` says so (asked as they are set, as the pointer comes onto them and as they are pressed:
 * `() => context.canEdit()`, and false where what they stand for takes no change) they are plain text
 * that takes the caret (contenteditable="plaintext-only"), lit with the accent's light fill under the
 * pointer and while typed in; elsewhere (an export, 演示视图, before the page edits) they are words. One
 * line: Enter and Escape end the typing as leaving them does, and keep what was typed (the page editor's
 * Escape never takes words back: undo does), a line break pasted is a space, and nothing is written while
 * they are typed. Done (never while an input method composes: a Chinese input method's Enter only takes
 * its letters; one left while it composes commits as the composition ends), `commit(text)` hears their
 * words, their white space one space, trimmed, once, unless they say what it holds already; it answers
 * whether the change was taken, and `false` puts back the words it holds. Left as their element leaves the
 * page (a component drawing what it holds anew), they commit nothing; taken out and put back where they were
 * typed in, the caret given back to them (a card moved to another group as someone else's write came), they
 * go on. Ctrl+Z in them, while what was typed there is still to take back, is the browser's, within them
 * alone (the mark TEXT_TYPED); otherwise it is the page's undo, as on any of the component's drawing (the
 * browser's one stack would undo another field's words). `placeholder`: the gray words
 * shown while they are empty (never written). `signal`: what ends it before its element goes (it ends
 * with its element anyway), so that a component that makes a node of words for each row of a table need
 * give none.
 * @param {HTMLElement} node
 * @param {{ commit(text: string): (boolean | void), enabled?: () => boolean, placeholder?: string, signal?: AbortSignal }} options
 */
export function textIn(node, { commit, enabled = () => true, placeholder = "", signal } = {}) {
  if (node?.nodeType !== 1) throw new Error("DocKit.text: the first argument is the element of the words");
  if (typeof commit !== "function") throw new Error("DocKit.text: commit(text) is a function");
  const doc = node.ownerDocument;
  let committed = node.textContent ?? ""; // what the file holds as far as the words know: committed or set
  let began = ""; // what they said as they took the caret: what the browser's undo goes back to, no further
  let composing = false;
  let leftComposing = false;
  node.setAttribute(TEXT, "");
  if (placeholder) node.setAttribute(TEXT_EMPTY, placeholder);
  const focused = () => doc.activeElement === node;
  const typable = () => node.hasAttribute("contenteditable");
  const typed = () => (node.textContent ?? "").replace(/\s+/g, " ").trim();
  // Typed in or not, as `enabled()` says now: whether they are.
  const open = () => {
    const now = !signal?.aborted && Boolean(enabled());
    if (now && node.getAttribute("contenteditable") !== "plaintext-only") {
      node.setAttribute("contenteditable", "plaintext-only");
      node.spellcheck = false;
    } else if (!now && node.hasAttribute("contenteditable")) {
      if (focused()) node.blur();
      node.removeAttribute("contenteditable");
      node.removeAttribute("spellcheck");
    }
    return now;
  };
  const done = () => {
    if (!typable() || !node.isConnected) return;
    if (composing) {
      leftComposing = true;
      return;
    }
    const text = typed();
    if (text === committed) {
      if (node.textContent !== committed) node.textContent = committed;
      return;
    }
    const was = committed;
    committed = text;
    if (node.textContent !== text) node.textContent = text;
    if (commit(text) === false) {
      committed = was;
      node.textContent = was;
    }
  };
  listen(node, "pointerenter", open, signal);
  listen(node, "pointerdown", open, signal);
  listen(node, "compositionstart", () => { composing = true; }, signal);
  listen(node, "compositionend", () => {
    composing = false;
    if (leftComposing) {
      leftComposing = false;
      if (!focused()) done();
    }
  }, signal);
  listen(node, "keydown", (event) => {
    // keyCode 229: the key an input method has, Safari's Enter right after it ends a composition.
    if (!typable() || composing || event.isComposing || event.keyCode === 229) return;
    if (event.key === "Enter" || event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      node.blur();
    }
  }, signal);
  // One line: what would break it (an input method's own Enter, a line break typed some other way) does not.
  // The browser's undo and redo reach no further than what was typed here since the caret came (the page's
  // keys took any other: TEXT_TYPED).
  listen(node, "beforeinput", (event) => {
    if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") event.preventDefault();
    else if ((event.inputType === "historyUndo" || event.inputType === "historyRedo") && !node.hasAttribute(TEXT_TYPED)) event.preventDefault();
  }, signal);
  listen(node, "focus", () => {
    began = node.textContent ?? "";
    node.removeAttribute(TEXT_TYPED);
  }, signal);
  listen(node, "paste", (event) => {
    const text = event.clipboardData?.getData("text/plain");
    if (typeof text !== "string" || !typable()) return;
    event.preventDefault();
    doc.execCommand("insertText", false, text.replace(/\s+/g, " "));
  }, signal);
  // Emptied, nothing is left in it (a <br> a browser leaves), so that its gray words show. Typed in since the
  // caret came, and not back to what it said then: its undo the browser's.
  listen(node, "input", () => {
    if (node.textContent === "" && node.firstChild) node.replaceChildren();
    node.toggleAttribute(TEXT_TYPED, (node.textContent ?? "") !== began);
  }, signal);
  // Left: done, once what took the focus away has run, unless the words have it again by then (put back where
  // they were by a component that drew them anew) or have left the page.
  listen(node, "blur", () => {
    node.removeAttribute(TEXT_TYPED);
    if (composing) leftComposing = true;
    else queueMicrotask(() => { if (!focused()) done(); });
  }, signal);
  open();
  return Object.freeze({
    /**
     * The words the file holds now (drawn from it): shown, unless the reader is typing others there,
     * which stay; either way what is committed against. Whether they take the caret is asked again.
     */
    set(text) {
      const value = String(text ?? "");
      const typing = focused() && typed() !== committed;
      committed = value;
      open();
      if (!typing && node.textContent !== value) node.textContent = value;
    },
    /** The caret put in them, at their end (`select`: all of them selected), where they take it now; whether it was. */
    edit({ select = false } = {}) {
      if (!open() || !node.isConnected) return false;
      node.focus();
      const range = doc.createRange();
      range.selectNodeContents(node);
      if (!select) range.collapse(false);
      const selection = doc.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      return true;
    },
    /** Whether they take the caret now, asked again (`enabled()`), after what changes it: the page come to edit. */
    refresh: () => open(),
    /** Whether the reader is typing in them. */
    get editing() {
      return focused();
    },
    /** The words committed last, or set. */
    get value() {
      return committed;
    },
  });
}

/**
 * A drag of the elements `items` finds in `area` (a pointer's, a mouse's, a finger's: pointer events,
 * which want `touch-action: none` on what a finger drags), started by a press of the main button on one,
 * or on what `handle` finds in one, while `enabled()` says so, once the pointer has moved `threshold`
 * pixels (a press that moves less is a press). While it moves, `over(x, y, item)` says where a drop
 * there goes: a spot, { into, before } (what the marker is put in, and before which child of it, null
 * for its end) and anything of the component's, or null for nowhere; the `marker`, an element of the
 * component's, stands there, and the item carries the class doc-dragging. Released over a spot, `drop(item,
 * spot)`; anywhere else, on Escape, a pointer the browser took back, or `cancel()`, nothing. The click a
 * drag's release makes is none.
 * @param {HTMLElement} area
 * @param {{ items: string, handle?: string, threshold?: number, enabled?: () => boolean, marker?: Element | null,
 *   over(x: number, y: number, item: HTMLElement): ({ into: Element, before: Node | null } | null),
 *   drop(item: HTMLElement, spot: { into: Element, before: Node | null }): void, signal?: AbortSignal }} options
 */
export function dragIn(area, { items, handle = null, threshold = 4, enabled = () => true, marker = null, over, drop, signal } = {}) {
  if (typeof items !== "string" || typeof over !== "function" || typeof drop !== "function") throw new Error("DocKit.drag: items (a selector), over(x, y, item) and drop(item, spot) are given");
  const view = area.ownerDocument.defaultView;
  /** @type {{ item: HTMLElement, x: number, y: number, pointer: number, moving: boolean } | null} */
  let drag = null;
  const end = () => {
    drag?.item.classList.remove(DRAGGING);
    marker?.remove();
    drag = null;
  };
  // The click a release makes after a drag, on the item or what holds it: none, for the next moment.
  const noClick = () => {
    const swallow = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };
    view.addEventListener("click", swallow, { capture: true, once: true });
    view.setTimeout(() => view.removeEventListener("click", swallow, { capture: true }), 0);
  };
  listen(area, "pointerdown", (event) => {
    const at = event.target instanceof view.Element ? event.target : null;
    const item = at?.closest(items);
    if (!item || !area.contains(item) || event.button !== 0 || (handle && !at.closest(handle)) || !enabled()) return;
    drag = { item, x: event.clientX, y: event.clientY, pointer: event.pointerId, moving: false };
    item.setPointerCapture?.(event.pointerId);
  }, signal);
  listen(area, "pointermove", (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!drag.moving && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < threshold) return;
    drag.moving = true;
    drag.item.classList.add(DRAGGING);
    const spot = over(event.clientX, event.clientY, drag.item);
    if (spot && marker) spot.into.insertBefore(marker, spot.before ?? null);
    else marker?.remove();
  }, signal);
  listen(area, "pointerup", (event) => {
    if (!drag || event.pointerId !== drag.pointer) return;
    const { item, moving } = drag;
    const spot = moving ? over(event.clientX, event.clientY, item) : null;
    end();
    if (!moving) return;
    noClick();
    if (spot) drop(item, spot);
  }, signal);
  listen(area, "pointercancel", end, signal);
  // Its capture lost before the release (which comes first when it ends as it should): no drop.
  listen(area, "lostpointercapture", (event) => { if (drag && event.pointerId === drag.pointer) end(); }, signal);
  // Escape while an item is held: the drag's, ahead of the page's own keys, and only then.
  listen(view, "keydown", (event) => {
    if (!drag || event.key !== "Escape") return;
    event.preventDefault();
    event.stopPropagation();
    end();
  }, signal, { capture: true });
  signal?.addEventListener("abort", end, { once: true });
  return Object.freeze({
    /** Give up a drag going on, as Escape does: nothing dropped. */
    cancel: end,
    /** Whether an item is being dragged: past the threshold, not yet released. */
    get dragging() {
      return Boolean(drag?.moving);
    },
  });
}
