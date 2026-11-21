import { Z } from "../../shared/layers.mjs";
import { placeBox } from "./placement.mjs";
import { addStyle, addStyleTo, element, mount, mountOver, overlayHost } from "./ui.mjs";
import { t } from "../../shared/i18n/index.mjs";

// The editor's one tooltip: dark, small, above the control it explains (below with
// placement "bottom"), shown 150ms after the pointer rests on it, with a second, dimmer line for a
// shortcut (shortcut() writes one: Ctrl+⇧+S, ⌘⇧S on a Mac). The format bar's buttons,
// its color swatches (the color's name), the block types of the menus, the handle, the section's
// bar and the icon picker use it. A thing with no node of its own (a list's number, drawn by
// ::before) gets one by its rectangle: tooltipAt. The hint that says why a block cannot be edited
// (hints/) is the same bubble, by the pointer.
//
// Warm along a row (a design review, 2026-11-17; until then every control waited its delay): a
// tooltip that showed and went because the pointer left its control leaves the next one WARM ms to be
// shown at once and with no fade, so a row of tools reads at the speed of the hand, the label moving
// along it. A press, a scroll or anything else that takes a tooltip away (hideTooltip), and a control
// left before its tooltip showed, end that.
//
// A bubble stands only while what it explains is where the pointer found it (guardBubble: the rule of
// the tooltip and of the hint of hints/ alike, the bubble showing and the wait for it). It goes at once,
// with no fade, and a wait to show it ends, the moment the page or anything in it scrolls (the editor's
// window and the workbench's round it, any scroller: captured), the wheel turns, the window loses the
// focus or the page is hidden or put away, or its control is taken out, hidden or moved (a heading's
// badge dropped as the pointer goes off the heading, a bar drawn again at every frame, a block pushed
// down). The browser says no pointerleave for most of these (a control that moves from under the
// pointer is left only when the pointer next moves; one taken out or hidden never is), so no control
// needs a rule of its own. After that the next control the pointer comes onto shows its own after its
// delay.

const STYLE = `
  .ge-tip, .ge-hint { position: fixed; left: 0; top: 0; width: max-content; max-width: 300px; padding: 5px 8px; border-radius: 6px; background: var(--ge-tip-bg); color: var(--ge-tip-tx); box-shadow: var(--ge-tip-shadow); font: 400 12px/1.4 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif; overflow-wrap: break-word; white-space: pre-line; pointer-events: none; }
  .ge-tip { z-index: ${Z.tooltip}; animation: ge-tip-in 50ms ease-out; }
  .ge-tip[data-instant] { animation: none; }
  .ge-hint { z-index: ${Z.hint}; max-width: 320px; }
  .ge-tip small { display: block; color: var(--ge-tip-tx2); font-size: 12px; }
  @keyframes ge-tip-in { from { opacity: 0; } }
`;

const DELAY = 150;
const WARM = 300; // ms after a tooltip went with the pointer leaving its control: the next shows at once
const GAP = 6;
const MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? "");
const KEYS = MAC ? { mod: "⌘", shift: "⇧", alt: "⌥", enter: "↩" } : { mod: "Ctrl", shift: "⇧", alt: "Alt", enter: "Enter" };
let shown = null; // { node, tip }
let timer = 0;
let warmUntil = 0; // the next tooltip shows at once until then (performance.now())
let guarding = null; // stops the guard of the bubble that shows (guardBubble)
let waiting = null; // stops the guard of the wait for one to show

const style = () => addStyle(STYLE);

/** The bubble's look (the tooltip's and the hint's), put in the page. */
export const bubbleLook = style;

/** Shortcuts as the tooltip shows them: "mod+shift+s" is Ctrl+⇧+S (⌘⇧S on a Mac); several are alternatives. */
export function shortcut(...combos) {
  const text = combos.map((combo) => combo.split("+").map((key) => KEYS[key] ?? key.toUpperCase()).join("+")).join(t(" 或 "));
  return MAC ? text.replaceAll("+", "") : text;
}

// How far a control may move or change its size (a hover's slight scale, a fade's drift) before the bubble leaves it.
const DRIFT = 2;

/** Whether `node` is no longer to be seen: taken out of the page, laid out as nothing (display: none) or hidden. A rectangle's stand-in (tooltipAt) has no node to lose. */
function gone(node) {
  if (typeof node.getClientRects !== "function") return false;
  return !node.isConnected || node.getClientRects().length === 0 || node.ownerDocument.defaultView?.getComputedStyle(node).visibility === "hidden";
}

/**
 * Calls `drop` (once) when what a bubble stands by can no longer be under the pointer, and returns the
 * function that stops watching: a scroll anywhere in the page's window, in the workbench's that holds it
 * (ui.mjs overlayHost: the page is its iframe) or in the window of `node` (captured: a scroller of its
 * own too), the wheel, the window's blur, the page being hidden or put away; and, with a `node`, its
 * being taken out, hidden (display, visibility) or moved or resized by more than a couple of pixels,
 * seen at every frame. A bubble is bound to `node` only once it shows: a control moving while the wait
 * for it runs (a card fading in) is no reason.
 */
export function guardBubble(drop, node = null) {
  const wins = new Set([window, overlayHost().win, node?.ownerDocument?.defaultView].filter(Boolean));
  const start = node && typeof node.getClientRects === "function" ? node.getBoundingClientRect() : null;
  let live = true;
  let frame = 0;
  const events = [];
  const stop = () => {
    if (!live) return;
    live = false;
    cancelAnimationFrame(frame);
    for (const [target, type, on, options] of events) target.removeEventListener(type, on, options);
  };
  const away = () => {
    stop();
    drop();
  };
  const listen = (target, type, on, options) => {
    target.addEventListener(type, on, options);
    events.push([target, type, on, options]);
  };
  for (const win of wins) {
    listen(win, "scroll", away, { capture: true, passive: true });
    listen(win, "wheel", away, { capture: true, passive: true });
    listen(win, "blur", away, false);
    listen(win, "pagehide", away, false);
    try {
      const doc = win.document;
      listen(doc, "visibilitychange", () => { if (doc.hidden) away(); }, false);
    } catch {} // a window of another origin tells only of its own scroll
  }
  if (start) {
    const tick = () => {
      if (!live) return;
      if (gone(node)) return away();
      const box = node.getBoundingClientRect();
      if (Math.abs(box.left - start.left) > DRIFT || Math.abs(box.top - start.top) > DRIFT || Math.abs(box.width - start.width) > DRIFT || Math.abs(box.height - start.height) > DRIFT) return away();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
  }
  return stop;
}

// `warm`: it went because the pointer left the control it was about (the next one shows at once).
function hide(warm = false) {
  clearTimeout(timer);
  timer = 0;
  warmUntil = warm && shown ? performance.now() + WARM : 0;
  waiting?.();
  waiting = null;
  guarding?.();
  guarding = null;
  shown?.tip.remove();
  shown = null;
}

// `placement`: "top" (above, below where there is no room), "bottom" (the other way round), "left" or
// "right" (beside it); `align`: "center" or "start" (the control's left or top edge); `gap`: px from
// it; `beside`: it only adds to the control and never stands over it, so none where there is no room;
// `host`: the window it stands in when the control is over the workbench's (ui.mjs overlayHost: the
// picture viewer's bar), the page's by default.
function show(node, text, hint, { placement = "top", align = "center", gap = GAP, beside = false, host = null } = {}, instant = false) {
  hide();
  if (gone(node)) return;
  const over = host && host.doc !== document ? host : null;
  if (over) addStyleTo(over.doc, STYLE);
  const bubble = element("div", { class: "ge-tip", role: "tooltip", ...(instant ? { "data-instant": "" } : {}) }, text, ...(hint ? [element("small", { text: hint })] : []));
  const tip = over ? mountOver(over, bubble) : mount(bubble);
  const box = node.getBoundingClientRect();
  const view = over ? { width: over.doc.documentElement.clientWidth, height: over.doc.documentElement.clientHeight } : undefined;
  const { left, top } = placeBox(box, { width: tip.offsetWidth, height: tip.offsetHeight }, { placement, align, gap, view });
  if (beside && left < box.right && left + tip.offsetWidth > box.left) return void tip.remove();
  tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
  shown = { node, tip };
  guarding = guardBubble(hide, node);
}

/**
 * `node` shows `text` (and `hint`, a shortcut, on a line of its own) while the pointer rests on it.
 * `text` may be a function, read each time (a label that changes with the state; none when it gives
 * nothing: an outline row's title only when it is cut short).
 */
export function tooltip(node, text, hint = null, how = undefined) {
  style();
  node.addEventListener("pointerenter", () => {
    clearTimeout(timer);
    waiting?.();
    waiting = guardBubble(hide);
    const warm = performance.now() < warmUntil;
    const go = () => {
      const label = typeof text === "function" ? text() : text;
      if (label) show(node, label, typeof hint === "function" ? hint() : hint, how, warm);
      else {
        waiting?.();
        waiting = null;
      }
    };
    if (warm) go();
    else timer = setTimeout(go, DELAY);
  });
  node.addEventListener("pointerleave", () => {
    if (!shown || shown.node === node) hide(true);
    else {
      clearTimeout(timer);
      waiting?.();
      waiting = null;
    }
  });
  node.addEventListener("pointerdown", () => hide());
  return node;
}

/**
 * `text` (and `hint`) over the rectangle `rect` (client coordinates) once the pointer has rested
 * there for a moment; whatever was showing or waiting goes. `hideTooltip` takes it away.
 */
export function tooltipAt(rect, text, hint = null) {
  style();
  hide();
  const anchor = { isConnected: true, getBoundingClientRect: () => rect };
  waiting = guardBubble(hide);
  timer = setTimeout(() => show(anchor, text, hint), DELAY);
}

/** `text` over `rect` at once, for a caller with a delay of its own (the icon picker's: it waits while the keys move). */
export function showTooltipAt(rect, text, how = undefined) {
  style();
  show({ isConnected: true, getBoundingClientRect: () => rect }, text, null, how);
}

/** Take any tooltip away (a menu closing, a press); the next one waits its delay again. A scroll, a control going and the rest of guardBubble's need no call. */
export const hideTooltip = () => hide();
