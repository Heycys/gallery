// A scrollbar the kit draws (styles/scrollbar.css): one rail along one axis of what scrolls, its system scrollbar
// hidden, a thin thumb drawn over it instead. Every scrollbar the kit draws is one: a table frame's two
// (tables/scrollbars.js) and a database's sideways one under its table view and its board (database/ui/rail.js).
// Its owner places the rail (where its track starts, against which edge) and says its geometry when a size changes
// (`set`: the track's length, the thumb's, how far the content scrolls); the rail does the rest:
// - Its thumb follows the scroll on the compositor, in the same frame as the content, whatever the page's script is
//   doing: a scroll-driven animation (styles/scrollbar.css) moves it along the scroller's timeline, the length of its
//   travel a custom property written only when a size changes. The scroller names its timelines (scroll-timeline:
//   --doc-scrollbar-x x, --doc-scrollbar-y y) and, where the rail is not inside it, a common ancestor hoists the
//   names to where the rail is (timeline-scope). Nothing is written as it scrolls. A thumb placed by script on every
//   scroll event lags its content by a frame or more whenever the main thread is busy (the editor's observers, a
//   long table's layout): a slow swipe on a touchpad showed it stepping behind the columns.
// - Where the browser has no such timelines (`timelines` false), the scroll moves the thumb by script instead: its
//   place read and written once a frame (requestAnimationFrame), never in the scroll event itself.
// - It shows while what it scrolls scrolls or is pushed (data-active, SHOWN ms after the last of it; or the owner's
//   `shown`, a mark several rails share) and while its thumb is dragged (data-drag); the owner's stylesheet shows it
//   under the pointer too.
// - A press on it is the scrollbar's, as on a native one: on the thumb it drags, beside it the thumb first goes there
//   (`press`); neither the page nor the page editor hears it, and it selects no text.
// - Pushed on past an end (`push`: every wheel event along its axis; a drag of its thumb past an end), its thumb gives
//   way and springs back (../scroll-squeeze.js): drawn as two custom properties of the rail, the thumb's length and a
//   shift of its own (its `transform`), apart from the place the timeline gives it (its `translate`), so the two
//   compose and the spring, drawn frame by frame while it lasts, never stops the thumb following the scroll.
import { createSqueeze, roomOf } from "./scroll-squeeze.js";

/** ms a rail stays shown after what it scrolls last scrolled or was pushed. */
export const SHOWN = 900;
/** px: a rail's thickness, what a press takes (its thumb is thinner, against the edge: scrollbar.css). */
export const RAIL = 12;

// A property of an element's style set, unless it holds that value already: a value set again to what it is still
// has the browser restyle the element (and lay the page out again before the next read of a size).
const probe = globalThis.document?.createElement("div");
export function setStyle(element, property, value) {
  probe.style.setProperty(property, value); // the value as a style holds it
  if (element.style.getPropertyValue(property) !== probe.style.getPropertyValue(property)) element.style.setProperty(property, value);
}

/**
 * Whether the browser moves a thumb along its scroller's timeline: CSS scroll-driven animations, with a name hoisted
 * to a common ancestor for a rail outside its scroller. A rail marks it on itself (data-timeline), which is what its
 * stylesheet animates it by: the script and the stylesheet never disagree about which of the two moves it.
 */
export const timelines = Boolean(globalThis.CSS?.supports?.("animation-timeline: scroll()") && globalThis.CSS.supports("timeline-scope: --doc-a"));

const rails = new WeakMap(); // a rail's element -> its scrollbar's press

/**
 * A mark on `element` (data-active) while something goes on: set at `touch()`, gone `ms` after the last touch. One
 * timer, re-armed only when it runs out: a scroll event costs a time read, no DOM write once the mark is there.
 */
export function activity(element, ms = SHOWN) {
  let last = 0;
  let timer = 0;
  const expire = () => {
    const left = ms - (performance.now() - last);
    if (left > 1) {
      timer = setTimeout(expire, left);
      return;
    }
    timer = 0;
    element.removeAttribute("data-active");
  };
  return {
    touch() {
      last = performance.now();
      if (!element.hasAttribute("data-active")) element.setAttribute("data-active", "");
      if (!timer) timer = setTimeout(expire, ms);
    },
    destroy() {
      clearTimeout(timer);
      timer = 0;
    },
  };
}

/** A rail's element: `.doc-scrollbar.doc-scrollbar--<axis>` holding its thumb. */
export function railElement(axis) {
  const rail = document.createElement("div");
  rail.className = `doc-scrollbar doc-scrollbar--${axis}`;
  rail.innerHTML = '<div class="doc-scrollbar-thumb"></div>';
  return rail;
}

/**
 * The scrollbar of `scroller` along `axis` ("x" sideways, "y" down). `rail`: its element, one left from an earlier
 * run taken over (else made: `element`); `least`: px, the shortest its thumb gets; `shown()`: what marks it shown
 * as it scrolls or is pushed (else data-active on the rail, `activity`).
 */
export function createScrollbar(scroller, axis, { rail = null, least = 24, shown = null } = {}) {
  const vertical = axis === "y";
  const element = rail ?? railElement(axis);
  element.toggleAttribute("data-timeline", timelines);
  const own = shown ? null : activity(element);
  const show = shown ?? (() => own.touch());
  const property = vertical ? "scrollTop" : "scrollLeft";
  let geometry = { track: 0, size: 0, range: 0 };
  let seen = scroller[property]; // where the wheel's last event left the content
  let queued = 0;

  const squeeze = createSqueeze((given, side) => {
    const shownGiven = Math.min(given, roomOf(geometry.size, least));
    setStyle(element, "--doc-scrollbar-squeeze", `${shownGiven}px`);
    setStyle(element, "--doc-scrollbar-squeeze-shift", side > 0 ? `${shownGiven}px` : "0px");
  });

  // Whether the content is at its end on `side` (1 its right or bottom, -1 its left or top), as it scrolls now.
  const atEnd = (side) => {
    const at = scroller[property];
    const range = vertical ? scroller.scrollHeight - scroller.clientHeight : scroller.scrollWidth - scroller.clientWidth;
    return side > 0 ? at >= range - 1 : at <= 0;
  };

  // Without timelines, the thumb where the content is: its place read, then written, once a frame.
  function placeThumb() {
    const { track, size, range } = geometry;
    const share = range > 0 ? Math.min(1, Math.max(0, scroller[property] / range)) : 0;
    setStyle(element, "--doc-scrollbar-thumb-at", `${Math.max(0, track - size) * share}px`);
  }
  function frame() {
    queued = 0;
    // Turned back from the end it was pushed against: the thumb is whole again.
    if (squeeze.given > 0 && !atEnd(squeeze.side)) squeeze.away();
    if (!timelines) placeThumb();
  }
  const onScroll = () => {
    show();
    // Come to an end sideways by the wheel's scroll between its events: the gesture's bump (scroll-squeeze.js
    // arrive: once, and only where the gesture came there from off it). The vertical end passes the wheel on.
    if (!vertical) for (const towards of [1, -1]) if (atEnd(towards)) squeeze.arrive(towards, roomOf(geometry.size, least));
    if ((!timelines || squeeze.given > 0) && !queued) queued = requestAnimationFrame(frame);
  };
  scroller.addEventListener("scroll", onScroll, { passive: true });

  const bar = {
    element,
    get geometry() { return geometry; },
    /** Its geometry, px, as the owner measured it: the track's length, the thumb's, how far the content scrolls. */
    set({ track, size, range }) {
      geometry = { track: Math.max(0, track), size: Math.max(0, size), range: Math.max(0, range) };
      setStyle(element, "--doc-scrollbar-track", `${geometry.track}px`);
      setStyle(element, "--doc-scrollbar-thumb-size", `${geometry.size}px`);
      setStyle(element, "--doc-scrollbar-travel", `${Math.max(0, geometry.track - geometry.size)}px`);
      if (!timelines) placeThumb();
    },
    /**
     * A wheel event along its axis, `delta` its px (signed as it scrolls), `time` its time stamp, `end` whether the
     * content is at the end it pushes against (the owner's say: atEnd, and what is around it): every one goes to the
     * squeeze, at the end or not (it tells a hand from a touchpad's momentum by the run of them); at the end, what
     * the content could not take of it pushes the thumb.
     */
    push(delta, { time, end }) {
      const at = scroller[property];
      const moved = Math.abs(at - seen);
      seen = at;
      squeeze.wheel(delta, { time, end, past: end ? Math.abs(delta) - moved : 0, room: roomOf(geometry.size, least) });
      if (end) show();
    },
    atEnd,
    squeeze,
    destroy() {
      scroller.removeEventListener("scroll", onScroll);
      if (queued) cancelAnimationFrame(queued);
      queued = 0;
      own?.destroy();
      squeeze.destroy();
      rails.delete(element);
    },
  };

  // A press on the rail (the window's capturing listener below hands it here): beside the thumb, the thumb goes there
  // first; then it drags, the content following by the thumb's travel. Dragged past an end, the thumb gives way by
  // how far the pointer is past where the thumb reached it (squeeze), and springs back as the press ends.
  rails.set(element, (event) => {
    const { track, size, range } = geometry;
    const along = (pointer) => {
      const box = element.getBoundingClientRect();
      return vertical ? pointer.clientY - box.top : pointer.clientX - box.left;
    };
    const perPixel = track > size ? range / (track - size) : 0;
    if (event.target === element) scroller[property] = (along(event) - size / 2) * perPixel;
    const start = { pointer: along(event), scroll: scroller[property] };
    element.setAttribute("data-drag", "");
    element.setPointerCapture?.(event.pointerId);
    const move = (moved) => {
      const wanted = start.scroll + (along(moved) - start.pointer) * perPixel;
      scroller[property] = wanted;
      if (!perPixel) return;
      const over = wanted > range ? (wanted - range) / perPixel : wanted < 0 ? -wanted / perPixel : 0;
      squeeze.drag(over, wanted < 0 ? -1 : 1, roomOf(geometry.size || size, least));
    };
    const end = () => {
      element.removeAttribute("data-drag");
      squeeze.release();
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", end);
      element.removeEventListener("pointercancel", end);
    };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", end);
    element.addEventListener("pointercancel", end);
  });
  return bar;
}

// A press on a rail is the scrollbar's, as on a native one: neither the page nor a preview's editor hears it (the
// window, capturing, comes before both), and it selects no text. On an edge the preview's editor resizes a table from
// (it marks the page with data-ge-resize), the press stays the editor's. Each bundle that draws rails (tables.js,
// database.js) has this module and its listener, each answering for its own rails.
globalThis.addEventListener?.("pointerdown", (event) => {
  const element = event.button === 0 ? event.target.closest?.(".doc-scrollbar") : null;
  const press = element && rails.get(element);
  if (!press || document.documentElement.hasAttribute("data-ge-resize")) return;
  event.preventDefault();
  event.stopPropagation();
  press(event);
}, true);
