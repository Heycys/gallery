// How a press gesture ends besides the pointer coming up (docs/editor.md, "Overlays"): resizing a
// card, dragging a gap between columns, drawing a box selection and selecting text across blocks
// all end the same ways, written once here. Each keeps its own state machine and what it does on
// letting go; only the ways of giving up are shared, and every one of them is idempotent.

/**
 * The CSS that locks the page while a gesture is under way, the tool having set `attribute` (a
 * name, or name="value") on the document element: the cursor it asks for (`cursor`) shows wherever
 * the pointer goes, and, with `select`, nothing gets selected. The one place the editor's gesture
 * styles are !important, and they must be: the elements under a pointer that a gesture holds (the
 * tool captures it on the document element) have rules of their own for the cursor (a grip's grab,
 * a table's resize bar) and for selecting, more specific than any rule about "everything while
 * this happens".
 */
export function gestureLock(attribute, { cursor = null, select = false } = {}) {
  const on = `html[${attribute}]`;
  return `${on}, ${on} * { ${cursor ? `cursor: ${cursor} !important; ` : ""}${select ? "-webkit-user-select: none !important; user-select: none !important; " : ""}}`;
}

/**
 * The gesture is over, cancelled (what it took is let go, nothing is written), when the browser
 * cancels the pointer (a touch it took), the capture is lost any other way (after pointerup the
 * gesture is over already), the window loses the focus, or the page is hidden. `active()`: whether
 * the gesture is under way; `cancel()`: give it up. `owns(event)`: whether a lost capture is the
 * gesture's, by default the document element's, where the tools hold the pointer.
 */
export function endsGesture({ active, cancel, owns = (event) => event.target === document.documentElement }) {
  addEventListener("pointercancel", () => { if (active()) cancel(); }, true);
  document.documentElement.addEventListener("lostpointercapture", (event) => { if (active() && owns(event)) cancel(); });
  addEventListener("blur", () => { if (active()) cancel(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden && active()) cancel(); });
}

/**
 * Esc while the gesture is under way gives it up, and nothing else sees the key (`cancel` may say
 * so on the status line).
 */
export function cancelOnEscape({ active, cancel }) {
  addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !active()) return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  }, true);
}
