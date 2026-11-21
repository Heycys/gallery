// The kit's tooltip (docs/render.md, "Tooltips"): an element of a document or a card with data-doc-tip shows
// its words in Gallery's dark bubble, the look of the page editor's (.ge-tip: styles/controls.css .doc-tip,
// tokens --doc-tip-*), never the browser's square title tooltip; data-doc-tip-sub is a second, dimmer line.
// data-doc-tip-cut (no value) shows the element's own text, and only while it is cut short (its text wider
// than its box, or its lines past a line clamp). Shown 150ms after the pointer rests on it, 6px under it (over it
// where the window has no room below), kept 12px inside the window's sides; the pointer's alone (no focus
// from the keys shows it); gone at once when the pointer leaves or presses, the page or anything in it scrolls,
// the wheel turns, the window loses the focus or the page is hidden, or the element is taken out, hidden
// (display, visibility) or moved: the browser says no pointerout for those. One at a time. It is a popover (the top layer, over a modal detail card and any z-index of
// the page), a generated node (.doc-tip, data-doc-dev: an export of the view leaves it out), never printed.

export const TIP = "[data-doc-tip], [data-doc-tip-cut]";
const DELAY = 150;
const GAP = 6;
const EDGE = 12;
const DRIFT = 2; // px an element may move or change its size (a hover's slight scale) before its bubble leaves it

/** Whether `node` is no longer to be seen: taken out, laid out as nothing or hidden. */
const gone = (node) => !node.isConnected || node.getClientRects().length === 0 || node.ownerDocument.defaultView?.getComputedStyle(node).visibility === "hidden";

/** The words `node` shows now: its data-doc-tip, or (data-doc-tip-cut) its own text while it is cut short. */
function wordsOf(node) {
  if (node.hasAttribute("data-doc-tip")) return node.getAttribute("data-doc-tip")?.trim() ?? "";
  // Cut short across (an ellipsis) or down (a line clamp: -webkit-line-clamp, a to-do's two lines).
  return node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1 ? (node.textContent ?? "").trim() : "";
}

export function startTips(doc) {
  const view = doc.defaultView;
  if (!view) return;
  let owner = null; // the element the pointer rests on
  let tip = null;
  let timer = 0;
  let frame = 0;

  function hide() {
    view.clearTimeout(timer);
    view.cancelAnimationFrame?.(frame);
    timer = 0;
    frame = 0;
    owner = null;
    if (!tip) return;
    try {
      tip.hidePopover?.();
    } catch {}
    tip.remove();
    tip = null;
  }

  function show(node) {
    if (owner !== node || gone(node)) return;
    const words = wordsOf(node);
    if (!words) return;
    const sub = node.getAttribute("data-doc-tip-sub")?.trim() ?? "";
    tip = doc.createElement("div");
    tip.className = "doc-tip";
    tip.setAttribute("role", "tooltip");
    tip.setAttribute("data-doc-dev", "");
    tip.textContent = words;
    if (sub) {
      const line = doc.createElement("span");
      line.className = "doc-tip-sub";
      line.textContent = sub;
      tip.append(line);
    }
    // In the modal card the element is in (the rest of the page is inert while it is open), else at the end of <body>.
    (node.closest("dialog[open]") ?? doc.body).append(tip);
    tip.setAttribute("popover", "manual");
    try {
      tip.showPopover();
    } catch {
      tip.removeAttribute("popover"); // no popover: a fixed bubble, its z-index the stylesheet's
    }
    const box = node.getBoundingClientRect();
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    const left = Math.max(EDGE, Math.min(box.left + box.width / 2 - width / 2, view.innerWidth - EDGE - width));
    const below = box.bottom + GAP;
    const top = below + height > view.innerHeight - EDGE && box.top - GAP - height >= EDGE ? box.top - GAP - height : below;
    tip.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
    // Seen at every frame while it shows: the element taken out, hidden or moved from under the pointer ends it.
    const tick = () => {
      if (owner !== node || !tip) return;
      const now = node.getBoundingClientRect();
      if (gone(node) || Math.abs(now.left - box.left) > DRIFT || Math.abs(now.top - box.top) > DRIFT || Math.abs(now.width - box.width) > DRIFT || Math.abs(now.height - box.height) > DRIFT) return hide();
      frame = view.requestAnimationFrame?.(tick) ?? 0;
    };
    frame = view.requestAnimationFrame?.(tick) ?? 0;
  }

  doc.addEventListener("pointerover", (event) => {
    if (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen") return;
    const node = event.target instanceof view.Element ? event.target.closest(TIP) : null;
    if (node === owner) return;
    hide();
    if (!node) return;
    owner = node;
    timer = view.setTimeout(() => show(node), DELAY);
  });
  doc.addEventListener("pointerout", (event) => {
    if (owner && !(event.relatedTarget instanceof view.Node && owner.contains(event.relatedTarget))) hide();
  });
  doc.addEventListener("pointerdown", hide, true);
  view.addEventListener("scroll", hide, true);
  view.addEventListener("wheel", hide, { capture: true, passive: true });
  view.addEventListener("blur", hide);
  doc.addEventListener("visibilitychange", () => {
    if (doc.hidden) hide();
  });
}
