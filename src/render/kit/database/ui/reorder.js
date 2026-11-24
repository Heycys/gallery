/**
 * Moving one of a row of things to another place (a view's tab, a board's column, a filter's chip, a sort's line, a
 * column's line in the settings, a select's option):
 * - a press moves it once it has gone 4px; less is a click (which goes on as one);
 * - the one held lifts and follows the pointer along one axis, the others making room: a neighbour gives way as soon
 *   as the held one's leading edge passes its middle (src/shared/drag-place.mjs: by the thing held, not the pointer,
 *   so that a wide column held by its edge does not cover most of the next before that one moves);
 * - what the row stands in scrolls as the pointer comes near its edges (edge-scroll.js), the one held staying under
 *   the pointer;
 * - let go, it lands in its new place and slides there from where it was let go; the click a drag ends with is
 *   swallowed; Esc, the window losing the focus or the page hidden: everything slides back, nothing written;
 * - for a reader who asks for less motion nothing slides: each is at once where it goes.
 */
import { along, beforeIndex, placeInRow } from "../../../../shared/drag-place.mjs";
import { edgeScroll, scrollerOf } from "./edge-scroll.js";

const EASE = 'transform .18s cubic-bezier(.2, 0, 0, 1)';
/** Whether the reader asks for less motion (nothing slides then). */
export const calm = () => Boolean(globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
/** The drawing an element stands in, which marks a drag while one goes on (no mark on the page's body). */
export const appOf = (el) => el?.closest('.doc-database-app');
/** The click a drag ends with, which the browser sends after the release, swallowed. */
export function swallowClick() {
  const swallow = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
  window.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
}
/**
 * Esc (taken before anything else hears it), the window losing the focus or the page hidden call `cancel()` while a
 * gesture lasts; the returned function stops listening.
 */
export function cancelOn(cancel) {
  const key = (ev) => {
    if (ev.key !== 'Escape')
      return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    cancel();
  };
  const hidden = () => { if (document.hidden)
    cancel(); };
  window.addEventListener('keydown', key, true);
  window.addEventListener('blur', cancel);
  document.addEventListener('visibilitychange', hidden);
  return () => {
    window.removeEventListener('keydown', key, true);
    window.removeEventListener('blur', cancel);
    document.removeEventListener('visibilitychange', hidden);
  };
}
/**
 * The click that ends a press given up while it was held (Esc), when the button is let go, swallowed; a new press
 * before that (the button let go outside the window) takes the wait away.
 */
export function swallowRelease() {
  const done = () => {
    window.removeEventListener('mouseup', release, true);
    window.removeEventListener('mousedown', done, true);
  };
  const release = () => { done(); swallowClick(); };
  window.addEventListener('mouseup', release, true);
  window.addEventListener('mousedown', done, true);
}
/**
 * `opts`: `axis` ("x" or "y"), `index` (the one pressed), `items()` (the row, in order), `onDrop(from, to)` (`to` a
 * place in the order before the move), `keyOf(el)` (what tells an element of the row drawn anew by the drop for the
 * one it was, so that it slides from where it was let go: the element itself where none is given).
 */
export function startReorder(e, opts) {
  if (e.button !== 0)
    return;
  const els = opts.items();
  const src = els[opts.index];
  if (!src)
    return;
  const app = appOf(src);
  const keyOf = opts.keyOf ?? ((el) => el);
  const axis = opts.axis === 'x' ? 'x' : 'y';
  const horiz = axis === 'x';
  const x0 = e.clientX, y0 = e.clientY;
  const from = opts.index;
  const still = calm();
  let dragging = false;
  let k = from; // the place of the one held in the new order
  let rects = [];
  let step = 0;
  let last = { x: x0, y: y0 };
  // What the row scrolls in along its axis (none where it does not scroll), and how far it had as the drag began.
  const scroller = scrollerOf(src.parentElement, axis);
  const scrolled = () => (scroller ? (horiz ? scroller.scrollLeft : scroller.scrollTop) : 0);
  let scroll0 = 0;
  const edges = edgeScroll(() => (scroller ? [{ el: scroller, axis }] : []), () => follow());
  let stopCancel = () => { };
  const begin = () => {
    dragging = true;
    rects = els.map(el => along(el.getBoundingClientRect(), axis));
    scroll0 = scrolled();
    const r = rects[from], next = rects[from + 1], prev = rects[from - 1];
    const gap = next ? next.start - r.end : prev ? r.start - prev.end : 4;
    step = r.end - r.start + Math.max(0, gap);
    app?.classList.add('is-dragging');
    src.classList.add('reorder-lift');
    src.style.transition = 'none';
    for (const el of els)
      if (el !== src)
        el.style.transition = still ? 'none' : EASE;
    stopCancel = cancelOn(cancel);
  };
  // The one held where the pointer (and the scroll since the drag began) has taken it, held to a little past the
  // first and the last; the others where its place among them puts them.
  const follow = () => {
    const r = rects[from], first = rects[0], end = rects[rects.length - 1];
    const raw = (horiz ? last.x - x0 : last.y - y0) + scrolled() - scroll0;
    const lo = first.start - r.start - 6;
    const hi = end.end - r.end + 6;
    const d = Math.max(lo, Math.min(hi, raw));
    src.style.transform = horiz ? `translateX(${d}px)` : `translateY(${d}px)`;
    k = placeInRow(rects, from, { start: r.start + d, end: r.end + d });
    els.forEach((el, i) => {
      if (i === from)
        return;
      const shift = from < k && i > from && i <= k ? -step : from > k && i >= k && i < from ? step : 0;
      el.style.transform = shift ? (horiz ? `translateX(${shift}px)` : `translateY(${shift}px)`) : '';
    });
  };
  const move = (ev) => {
    last = { x: ev.clientX, y: ev.clientY };
    if (!dragging) {
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 4)
        return;
      begin();
    }
    follow();
    edges.at(ev.clientX, ev.clientY);
  };
  const onScroll = () => { if (dragging)
    follow(); };
  scroller?.addEventListener('scroll', onScroll, { passive: true });
  const stop = () => {
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    scroller?.removeEventListener('scroll', onScroll);
    edges.stop();
    stopCancel();
  };
  // Given up: each slides back to its place, nothing written (the click after the release still swallowed).
  function cancel() {
    stop();
    if (!dragging)
      return;
    dragging = false;
    app?.classList.remove('is-dragging');
    swallowRelease();
    for (const el of els) {
      el.style.transition = still ? 'none' : EASE;
      el.style.transform = '';
    }
    const done = () => {
      src.classList.remove('reorder-lift');
      for (const el of els)
        el.style.transition = '';
    };
    if (still)
      done();
    else
      setTimeout(done, 200);
  }
  function up() {
    stop();
    if (!dragging)
      return;
    dragging = false;
    app?.classList.remove('is-dragging');
    swallowClick();
    // Where each stood as it was let go, so that each slides from there to its new place.
    const seen = new Map(els.map(el => [keyOf(el), el.getBoundingClientRect()]));
    for (const el of els) {
      el.style.transition = still ? '' : 'none';
      el.style.transform = '';
    }
    src.classList.remove('reorder-lift');
    const to = beforeIndex(from, k);
    if (to !== from && to !== from + 1)
      opts.onDrop(from, to);
    if (still)
      return;
    const settle = () => {
      const now = opts.items();
      for (const el of now) {
        const b = seen.get(keyOf(el));
        if (!b)
          continue;
        const a = el.getBoundingClientRect();
        const dx = b.left - a.left, dy = b.top - a.top;
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5)
          continue;
        el.style.transition = 'none';
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        void el.offsetWidth;
        el.style.transition = EASE;
        el.style.transform = '';
      }
      setTimeout(() => { for (const el of [...now, ...els]) {
        el.style.transition = '';
        el.style.transform = '';
      } }, 220);
    };
    requestAnimationFrame(settle);
  }
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
}
/** The list with the one at `from` moved to `to` (a place in the order before the move). */
export function moveItem(list, from, to) {
  const out = [...list];
  const [it] = out.splice(from, 1);
  out.splice(to > from ? to - 1 : to, 0, it);
  return out;
}
