import { DIALOG } from "../components/kit.mjs";
import { TOKENS } from "./look.mjs";
import { t } from "../../shared/i18n/index.mjs";
// Small DOM helpers for the editor's own UI (panels, cards, the formatting bar). Every node the
// editor adds carries data-doc-dev, so the page's "export modified HTML" control drops it.

export function element(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(props)) {
    if (name === "text") node.textContent = value;
    else if (name === "class") node.className = value;
    else if (name === "html") node.innerHTML = value; // editor-owned markup only (icons)
    else node.setAttribute(name, value);
  }
  node.append(...children);
  return node;
}

const loads = new Map();

/**
 * A script the page was served without, loaded when the editor first needs it (a component made on
 * a page that has none yet: the kit's tables or code script, KaTeX): a promise of whether `ready()`
 * says it is there. One load per address; a failed one is forgotten, so the next call tries again.
 * `before` runs once as the load starts (a stylesheet the script goes with).
 */
export function loadScript(src, ready, { before } = {}) {
  if (ready()) return Promise.resolve(true);
  if (!loads.has(src)) {
    loads.set(src, new Promise((resolve) => {
      before?.();
      const script = element("script", { src, "data-doc-dev": "" });
      script.addEventListener("load", () => resolve(Boolean(ready())));
      script.addEventListener("error", () => {
        script.remove();
        loads.delete(src);
        resolve(false);
      });
      document.head.append(script);
    }));
  }
  return loads.get(src);
}

/** An address on the clipboard, and said so: called right in the click that asked, as a browser takes no write after a wait. */
export function copyAddress(address, say) {
  navigator.clipboard?.writeText(address).then(() => say(t("已复制链接")), () => say(t("没能复制：浏览器不允许写剪贴板。"), "error"));
}

export function button(label, action, { primary = false, ...props } = {}) {
  const node = element("button", { type: "button", ...(label ? { text: label } : {}), ...props });
  if (primary) node.dataset.primary = "";
  node.addEventListener("mousedown", (event) => event.preventDefault()); // keep the selection where it is
  node.addEventListener("click", action);
  return node;
}

/**
 * A text button in the editor's one button look (look.mjs BUTTONS, `.ge-btn`): no line, no fill, a gray
 * under the pointer. `primary` the pale blue one (add, confirm, save; `data-primary`), `danger` with it the
 * pale red (a delete), `quiet` a small one for looking, not deciding (`data-quiet`). A press on it leaves
 * the selection where it is (button()).
 */
export function textButton(label, action, { primary = false, danger = false, quiet = false, class: own = "", ...props } = {}) {
  const node = button(label, action, { primary, class: `ge-btn${own ? ` ${own}` : ""}`, ...props });
  if (danger) node.dataset.danger = "";
  if (quiet) node.dataset.quiet = "";
  return node;
}

// Editor UI lives in the top layer with an open modal dialog, otherwise it would be inert.
export function layer() {
  return document.querySelector(DIALOG.open) ?? document.body;
}

export function mount(node) {
  node.dataset.docDev = "";
  layer().append(node);
  return node;
}

/**
 * What a click did has changed what stands under the pointer: a double click's second press would
 * land on that. A press that follows at the same spot within a double click's time does nothing,
 * while `stands()` says that what it did is still there.
 */
export function swallowNext(click, stands = () => true) {
  const types = ["pointerdown", "mousedown", "pointerup", "mouseup", "click", "dblclick"];
  const near = (event) => Math.hypot(event.clientX - click.clientX, event.clientY - click.clientY) <= 6;
  const swallow = (event) => {
    if (!near(event) || !stands()) return done();
    event.preventDefault();
    event.stopImmediatePropagation();
    if (event.type === "dblclick") done();
  };
  const timer = setTimeout(done, 500);
  function done() {
    clearTimeout(timer);
    for (const type of types) removeEventListener(type, swallow, true);
  }
  for (const type of types) addEventListener(type, swallow, true);
}

// Fades: the editor's cards fade in when they appear and their panels fade out
// when they go; nothing moves for a reader who asks for reduced motion.
/** Whether the reader asks for reduced motion: then nothing glides (a scroll goes at once, nothing fades). */
export const still = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** Show `node` (`hidden` off), fading in over `ms`; a fade out under way stops. */
export function fadeIn(node, ms = 120) {
  for (const animation of node.getAnimations?.() ?? []) animation.cancel();
  node.hidden = false;
  if (!still()) node.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: ms, easing: "ease-out" });
}

/** Fade `node` out over `ms`, then hide it and call `done`; a fadeIn() meanwhile keeps it. */
export function fadeOut(node, ms = 100, done = null) {
  if (node.hidden) return;
  const animation = still() ? null : node.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: "ease-out", fill: "forwards" });
  const finish = () => {
    animation?.cancel();
    node.hidden = true;
    done?.();
  };
  if (animation) animation.onfinish = finish;
  else finish();
}

// How a card comes and goes (a design review, 2026-11-17): it grows out of the point of it nearest what
// opened it, from .96 of its size with its opacity,
// over APPEAR; it goes by its opacity alone, over LEAVE. Opened from the keys ("/" typed, Enter, →) it
// stands at once, as a key's answer is never animated; a reader who asks for reduced motion, and a card
// the reader types into (a field: the link card, the formula editor, a menu's search), see its opacity
// alone, so that nothing they are about to type into moves.
const APPEAR = 140;
const LEAVE = 90;
const EASE_OUT = "cubic-bezier(.23, 1, .32, 1)";
// What the reader did last, in each window the editor draws in: a key, or the pointer (pressed, or moved).
const lastInput = new WeakMap();
function watchInput(win) {
  if (!win || lastInput.has(win)) return;
  lastInput.set(win, "pointer");
  win.addEventListener("keydown", () => lastInput.set(win, "key"), true);
  win.addEventListener("pointerdown", () => lastInput.set(win, "pointer"), true);
  // A move the browser makes up as the page changes under a still pointer has no movement.
  win.addEventListener("pointermove", (event) => { if (event.movementX || event.movementY) lastInput.set(win, "pointer"); }, true);
}
if (typeof window !== "undefined") watchInput(window);

/** Whether the reader's last act in `node`'s window was a key: what opens now opens from the keys. */
export const fromKeys = (node = null) => lastInput.get(node?.ownerDocument?.defaultView ?? globalThis.window) === "key";

/**
 * `node` comes (it is placed already): from the point of it nearest `from` (a rect or { x, y }: what opened
 * it; its middle when none), at .96 of its size and no opacity, to all of both over APPEAR. `typed`: a card
 * with a field, whose opacity alone changes; `keys`: it was opened from the keys (fromKeys() unless said),
 * and stands at once. Runs on `node`'s transform and opacity, by the Web Animations API: nothing it is
 * placed with (left, top) changes.
 */
export function appear(node, from = null, { typed = false, keys = fromKeys(node) } = {}) {
  if (!node?.animate) return null;
  for (const animation of node.getAnimations?.() ?? []) if (animation.id === "ge-appear") animation.cancel();
  if (keys) return null;
  const grow = !typed && !still();
  if (grow) {
    const box = node.getBoundingClientRect();
    const point = from ? { x: from.x ?? (from.left + from.right) / 2, y: from.y ?? (from.top + from.bottom) / 2 } : { x: box.left + box.width / 2, y: box.top + box.height / 2 };
    const at = (value, low, high) => Math.max(low, Math.min(high, value));
    node.style.transformOrigin = `${Math.round(at(point.x, box.left, box.right) - box.left)}px ${Math.round(at(point.y, box.top, box.bottom) - box.top)}px`;
  }
  const animation = node.animate(grow ? [{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "none" }] : [{ opacity: 0 }, { opacity: 1 }], { duration: APPEAR, easing: EASE_OUT });
  animation.id = "ge-appear";
  return animation;
}

// The editor's sheets and the page's own, as sheets a shadow root can take (fadeAway): each copied once, as it first is needed.
const copies = new WeakMap(); // a sheet of the page -> its copy
function sheetsOf(doc) {
  const view = doc.defaultView;
  if (!view?.CSSStyleSheet || !("adoptedStyleSheets" in doc)) return null;
  const sheets = [];
  for (const sheet of doc.styleSheets) {
    if (!copies.has(sheet)) {
      let text = "";
      try {
        for (const rule of sheet.cssRules) if (!(rule instanceof view.CSSImportRule)) text += `${rule.cssText}\n`;
      } catch {} // another origin's: not read
      const copy = new view.CSSStyleSheet();
      try { copy.replaceSync(text); } catch {}
      copies.set(sheet, copy);
    }
    sheets.push(copies.get(sheet));
  }
  return sheets;
}

/**
 * `node` goes from the page at once (what reads the page finds it gone, as before) and a picture of it
 * fades out where it stood over LEAVE: a copy in a shadow root of its own, which no selector of the page
 * reaches, under no pointer and inert, with the page's sheets. At once where nothing can fade.
 */
export function fadeAway(node, ms = LEAVE) {
  const doc = node?.ownerDocument;
  const parent = node?.parentNode;
  const sheets = node?.isConnected && doc?.body?.attachShadow ? sheetsOf(doc) : null;
  if (!sheets || !node.getClientRects().length) {
    node?.remove();
    return;
  }
  const host = doc.createElement("div");
  host.dataset.docDev = "";
  host.setAttribute("aria-hidden", "true");
  host.inert = true;
  host.style.cssText = `position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: ${doc.defaultView.getComputedStyle(node).zIndex}; pointer-events: none;`;
  const root = host.attachShadow({ mode: "closed" });
  root.adoptedStyleSheets = sheets;
  const copy = node.cloneNode(true);
  copy.removeAttribute("id");
  root.append(copy);
  const scrolled = node.scrollTop;
  node.remove();
  parent.append(host);
  copy.scrollTop = scrolled;
  const gone = () => host.remove();
  const animation = host.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: ms, easing: "ease-out", fill: "forwards" });
  if (animation) animation.onfinish = gone;
  setTimeout(gone, ms + 200); // a page hidden meanwhile runs no animation
}

const styled = new WeakMap(); // document -> the style sheets put in it (their texts)
/**
 * A style sheet in `doc` (the page's, or the workbench's for an overlay there), once per text: a
 * menu, a submenu or a crop window may ask for its sheet at every opening and the head still holds one.
 * The first sheet a document gets is the palette (look.mjs) every sheet of the editor paints with.
 */
export function addStyleTo(doc, css) {
  const done = styled.get(doc) ?? styled.set(doc, new Set()).get(doc);
  if (!doc.head.querySelector("style[data-ge-palette]")) put(doc, TOKENS).setAttribute("data-ge-palette", ""); // the server's, when it served the page so (service.mjs)
  if (done.has(css)) return;
  done.add(css);
  put(doc, css);
}

function put(doc, css) {
  const style = doc.createElement("style");
  style.textContent = css;
  style.dataset.docDev = "";
  doc.head.append(style);
  return style;
}

/** A style sheet in the page, once (addStyleTo). */
export const addStyle = (css) => addStyleTo(document, css);

/**
 * Where an overlay over the whole window goes (a picture viewed, an embed full screen): the
 * workbench's document when the page is shown in one (its iframe, of the same origin), so the
 * overlay covers the sidebar and top bar too, the whole window; else the page's
 * own. { doc, win }.
 */
export function overlayHost() {
  try {
    const parent = window.parent;
    if (parent !== window && parent.document?.querySelector(".app")) return { doc: parent.document, win: parent };
  } catch {} // another origin: the page's own
  return { doc: document, win: window };
}

/** `node` over the whole window of `host` (overlayHost): the editor's layer on the page, the body of the workbench's document. */
export function mountOver(host, node) {
  if (host.doc === document) return mount(node);
  node.dataset.docDev = "";
  host.doc.body.append(node);
  return node;
}
