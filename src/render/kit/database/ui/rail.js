// The sideways scrollbar of a table or a board: the system's hidden (.no-native-scrollbar), the kit's own drawn instead
// (../../scrollbar.js, the one every scrollbar of the kit is; database.css places it).
// - It takes no room: it lies along the bottom of what scrolls (sticky), the spacer's height where nothing scrolls.
// - It shows while the pointer is over the area (its frame, database.css) or it scrolls.
// - It starts right of the column that stays (`start()`) and runs along what scrolls.
// - Its thumb follows the scroll on the compositor (what scrolls names its timeline and its frame hoists the name to
//   the rail, database.css); what is placed here is placed when a size changes or the view is drawn, never as it
//   scrolls.
// - Its thumb drags; a press on its track moves the thumb there first.
// - Pushed on past either end, by the wheel or a drag of its thumb, the content does not move (it never bounces) and
//   the thumb gives way instead, squeezed from the end it is pushed against, and springs back the moment the pushing
//   stops (../../scroll-squeeze.js: the resistance, the touchpad's momentum told from a hand, the spring).
import { createScrollbar, setStyle } from "../../scrollbar.js";
import { h } from "./dom.js";

const MIN_THUMB = 28;

/** The rail of `target` (what scrolls sideways): { element, place(), node, rail, spacer, destroy() }. */
export function createRail(target, { start = () => 0 } = {}) {
  const bar = createScrollbar(target, "x", { least: MIN_THUMB });
  const rail = h("div", { class: "scroll-rail" }, bar.element);
  const spacer = h("div", { class: "scroll-rail-spacer" });
  const element = h("div", { style: { display: "contents" } }, spacer);
  let overflows = false;

  // Its track from the column that stays to the right edge, its thumb as long as the columns shown of those that
  // scroll; the rail in place of the spacer while the content overflows, the spacer back where it does not.
  function place() {
    const width = target.clientWidth;
    const total = target.scrollWidth;
    overflows = total - width > 1;
    if (!overflows) {
      if (rail.isConnected) rail.replaceWith(spacer);
      return;
    }
    const from = start();
    const room = Math.max(0, width - from);
    const size = Math.min(room, Math.max(MIN_THUMB, (room * Math.max(0, width - from)) / Math.max(1, total - from)));
    if (spacer.isConnected) spacer.replaceWith(rail);
    setStyle(bar.element, "left", `${from}px`);
    bar.set({ track: room, size, range: total - width });
  }

  // Every sideways wheel event goes to the squeeze, at the end or not (it tells a hand from momentum by the run of
  // them); at the end, what the content could not take of it pushes the thumb.
  const onWheel = (event) => {
    if (!overflows || event.ctrlKey) return;
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? target.clientWidth : 1;
    const delta = (event.deltaX || (event.shiftKey ? event.deltaY : 0)) * unit;
    if (!delta || (Math.abs(delta) < Math.abs(event.deltaY * unit) && !event.shiftKey)) return;
    bar.push(delta, { time: event.timeStamp || undefined, end: bar.atEnd(Math.sign(delta)) });
  };
  target.addEventListener("wheel", onWheel, { passive: true });

  const sizes = new ResizeObserver(place);
  sizes.observe(target);
  let watched = null;
  const watchContent = () => {
    const content = target.firstElementChild;
    if (content === watched) return;
    if (watched) sizes.unobserve(watched);
    watched = content;
    if (content) sizes.observe(content);
  };
  watchContent();

  return {
    element,
    /** Placed again (the content or its first column changed). */
    place() {
      watchContent();
      if (rail.isConnected || spacer.isConnected) place();
      else requestAnimationFrame(place);
    },
    /** The rail or the spacer, whichever stands now (put it in place of `element` where the drawing goes). */
    get node() { return rail.isConnected ? rail : spacer; },
    rail,
    spacer,
    destroy() {
      sizes.disconnect();
      target.removeEventListener("wheel", onWheel);
      bar.destroy();
    },
  };
}
