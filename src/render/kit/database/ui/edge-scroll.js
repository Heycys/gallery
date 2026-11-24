// What a drag goes on in scrolls as the pointer comes near its edges (a board sideways under a card or a column held
// near its left or right, the page up and down under a card held near the window's top or bottom, a row of tabs or a
// list in a card under the one held): faster the nearer the edge, at the most past it; it stops at the scroller's ends
// and as the pointer leaves the edge. Each frame it scrolls, `onScroll()` is told, so that what the drag shows follows
// what moved under the pointer.

const EDGE = 40; // px in from an edge where the scrolling starts
const MOST = 16; // px a frame at the edge and past it

const scrolls = (el, axis) => {
  const style = getComputedStyle(el);
  const overflow = axis === "x" ? style.overflowX : style.overflowY;
  if (!/(auto|scroll|overlay)/.test(overflow)) return false;
  return axis === "x" ? el.scrollWidth - el.clientWidth > 1 : el.scrollHeight - el.clientHeight > 1;
};

/**
 * The element `from` and its ancestors that scrolls along `axis` ("x" or "y"), the nearest; null where none does
 * (`page`: the page's own scroller then, where it scrolls).
 */
export function scrollerOf(from, axis, { page = false } = {}) {
  for (let el = from; el && el !== document.body && el !== document.documentElement; el = el.parentElement) if (scrolls(el, axis)) return el;
  const root = document.scrollingElement;
  if (!page || !root) return null;
  return (axis === "x" ? root.scrollWidth - root.clientWidth : root.scrollHeight - root.clientHeight) > 1 ? root : null;
}

// Where a scroller shows along its axis, in the window: the window itself for the page's.
function shownOf(el, axis) {
  const page = el === document.scrollingElement;
  const box = page ? { left: 0, top: 0, right: innerWidth, bottom: innerHeight } : el.getBoundingClientRect();
  const start = axis === "x" ? Math.max(0, box.left) : Math.max(0, box.top);
  const end = axis === "x" ? Math.min(innerWidth, box.right) : Math.min(innerHeight, box.bottom);
  return { start, end };
}

/**
 * The edges of `scrollers()` (each `{ el, axis }`, asked again each frame) followed while a drag lasts: `at(x, y)`
 * where the pointer is, `stop()` as the drag ends.
 */
export function edgeScroll(scrollers, onScroll) {
  let pointer = null;
  let frame = 0;
  const speedOf = (el, axis) => {
    const { start, end } = shownOf(el, axis);
    if (end - start < EDGE * 3) return 0; // too small to have edges of its own
    const at = axis === "x" ? pointer.x : pointer.y;
    const edge = Math.min(EDGE, (end - start) / 4);
    if (at < start + edge) return -MOST * Math.min(1, (start + edge - at) / edge);
    if (at > end - edge) return MOST * Math.min(1, (at - (end - edge)) / edge);
    return 0;
  };
  const step = () => {
    frame = 0;
    if (!pointer) return;
    let moved = false;
    for (const { el, axis } of scrollers()) {
      if (!el?.isConnected) continue;
      const speed = speedOf(el, axis);
      if (!speed) continue;
      const before = axis === "x" ? el.scrollLeft : el.scrollTop;
      if (axis === "x") el.scrollLeft = before + speed;
      else el.scrollTop = before + speed;
      if ((axis === "x" ? el.scrollLeft : el.scrollTop) !== before) moved = true;
    }
    if (moved) {
      onScroll();
      frame = requestAnimationFrame(step);
    }
  };
  return {
    at(x, y) {
      pointer = { x, y };
      if (!frame) frame = requestAnimationFrame(step);
    },
    stop() {
      pointer = null;
      cancelAnimationFrame(frame);
      frame = 0;
    },
  };
}
