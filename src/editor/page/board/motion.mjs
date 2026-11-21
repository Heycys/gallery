// How a board's cards move while they are edited (./index.mjs; docs/render.md "Its cards edited"), the user's
// word of 2026-11-09: as smooth as the widgets of a phone's home screen, nothing that jumps or stutters.
//
//   - glide(): the cards a change of the layout moves (a draft while a card is dragged or resized, a drop, an
//     undo, 大小 ›) glide from where they were seen to where the layout now puts them (FLIP: their box before
//     and after, a transform from the one to the other run to none) on a spring's ease (spring: a little
//     less than critically damped, its overshoot under 2%), GLIDE ms; a card whose size changed glides its
//     width and height too. A card already gliding to where the layout still puts it is left to go on; one
//     the change sends elsewhere starts again from where it is seen then, so a target that changes under a
//     drag never makes a card jump (interruptible).
//   - createSettle(): a held card's place (or a resized card's size), axis by axis: the pointer's, or within
//     `snap` px of the cells (or the size) a drop gives, those; where that changes (the card comes within the
//     snap or leaves it, or the cells it stands on move) it settles from where it was carried to the new
//     place in SETTLE ms on the same spring, the pointer's own motion never delayed.
//   - createEdgeScroll(): near the window's top or bottom edge a gesture scrolls the page, timed by the frames'
//     clock (not by the pointer's events): within BAND px of the edge, faster as the pointer is nearer it (the
//     square of how far into the band, past the edge the most), FASTEST px a second at the most (12 a frame
//     at 60 frames a second), and growing from nothing over RAMP ms once the pointer comes into the band, so
//     that a card picked up near the edge does not set the page running.
//   - prefers-reduced-motion: no glide and no settling (the layout and the snap at once); the scroll as it is.

export const GLIDE = 280; // ms a card glides to where a layout puts it
export const SETTLE = 180; // ms a held (or resized) card settles on what it snaps to, or comes off it
export const BAND = 64; // px from the window's top or bottom edge within which a gesture scrolls the page
export const FASTEST = 720; // px a second the page scrolls at the most
export const RAMP = 320; // ms over which that speed grows from nothing once the pointer is in the band

export const reduced = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// The step response of a spring (damping ZETA, settled within 0.2% at t = 1): 0 at 0, 1 at 1, still at both
// ends, a crest of under 2% past 1 at t ≈ 0.65.
const ZETA = 0.8;
const OMEGA = 6.4 / ZETA;
const DAMPED = OMEGA * Math.sqrt(1 - ZETA * ZETA);
export function spring(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return 1 - Math.exp(-ZETA * OMEGA * t) * (Math.cos(DAMPED * t) + ((ZETA * OMEGA) / DAMPED) * Math.sin(DAMPED * t));
}
// The same as an easing a Web Animation takes (CSS linear() of 40 points), else a close cubic Bézier.
const EASE = (() => {
  const points = Array.from({ length: 41 }, (_, index) => Math.round(spring(index / 40) * 10000) / 10000).join(", ");
  const curve = `linear(${points})`;
  return typeof CSS !== "undefined" && CSS.supports?.("transition-timing-function", curve) ? curve : "cubic-bezier(.2, .9, .25, 1)";
})();

const running = new WeakMap(); // a card -> its glide under way
// Where the kit's board script draws a card now: its cells as the CSS takes them (the board's row skip in).
const keyOf = (card) => ["x", "y", "w", "h"].map((name) => card.style.getPropertyValue(`--gallery-${name}`)).join();

/** Whether a card is gliding now. */
export const isGliding = (card) => running.has(card);

/** A card's glide stopped where it is (a gesture takes it up): it stands where the layout puts it. */
export function stopGlide(card) {
  running.get(card)?.cancel();
}

/**
 * `change()` run (it lays the board out at once: DocBoard.draft or .layout), and each of `cards` it moves
 * glided from where it was seen to its new place. `still`: a card left out (the one a gesture holds, which
 * follows the pointer); `lift`: a card kept over the others while it glides (data-ge-landing: one let go);
 * `settled()`: run once every glide this started has ended (at once where none started). Gives what change() gave.
 */
export function glide(cards, change, { still = null, lift = null, duration = GLIDE, settled = null } = {}) {
  if (reduced()) {
    const result = change();
    settled?.();
    return result;
  }
  const started = [];
  const before = cards.filter((card) => card !== still).map((card) => ({ card, key: keyOf(card), box: card.getBoundingClientRect() }));
  const result = change();
  for (const { card, key, box } of before) {
    if (!card.isConnected) continue;
    const going = running.get(card);
    if (going && keyOf(card) === key) continue; // on its way to where it still goes
    going?.cancel();
    const now = card.getBoundingClientRect();
    const dx = box.left - now.left;
    const dy = box.top - now.top;
    const sized = Math.abs(box.width - now.width) > 0.5 || Math.abs(box.height - now.height) > 0.5;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && !sized) continue;
    const from = { transform: `translate(${dx}px, ${dy}px)` };
    const to = { transform: "translate(0px, 0px)" };
    if (sized) {
      Object.assign(from, { width: `${box.width}px`, height: `${box.height}px` });
      Object.assign(to, { width: `${now.width}px`, height: `${now.height}px` });
    }
    const animation = card.animate([from, to], { duration, easing: EASE });
    running.set(card, animation);
    if (card === lift) card.setAttribute("data-ge-landing", "");
    const end = () => {
      if (running.get(card) !== animation) return;
      running.delete(card);
      card.removeAttribute("data-ge-landing");
    };
    animation.addEventListener("finish", end);
    animation.addEventListener("cancel", end);
    started.push(animation.finished.catch(() => {}));
  }
  if (settled) {
    if (started.length) Promise.all(started).then(settled);
    else settled();
  }
  return result;
}

/**
 * A held card's place, or a resized card's size, axis by axis (`name`: "x", "y", "w", "h"): at(name, raw,
 * target, time) gives what is drawn for the pointer's `raw` and the `target` a drop gives (the cells' place
 * or size, px): the target within `snap` px of it, else raw; a change of which (or of the target while on
 * it) settles from where the card was carried, in `duration` ms. gliding(): whether any axis still settles.
 */
export function createSettle(snap, duration = SETTLE) {
  const axes = new Map();
  return {
    at(name, raw, target, time) {
      const on = Math.abs(raw - target) <= snap;
      const want = on ? target : raw;
      const axis = axes.get(name);
      if (!axis) {
        axes.set(name, { raw, target, on, shown: want, glide: null });
        return want;
      }
      // Where it would be had it gone with the pointer since the last time: what a settling starts from.
      const carried = axis.shown + (raw - axis.raw);
      if (on !== axis.on || (on && target !== axis.target)) axis.glide = reduced() ? null : { offset: carried - want, start: time };
      Object.assign(axis, { raw, target, on });
      let shown = want;
      if (axis.glide) {
        const progress = (time - axis.glide.start) / duration;
        if (progress >= 1) axis.glide = null;
        else shown = want + axis.glide.offset * (1 - spring(progress));
      }
      axis.shown = shown;
      return shown;
    },
    gliding: () => [...axes.values()].some((axis) => axis.glide !== null),
  };
}

/**
 * The page scrolled near the window's edge while a gesture lasts: frame(y, time) once a frame (the pointer's
 * y in the window, the frame's time), whether the page moved; stop() as the gesture ends.
 */
export function createEdgeScroll({ band = BAND, fastest = FASTEST, ramp = RAMP } = {}) {
  let since = null; // when the pointer came into the band
  let last = null; // the last frame's time
  let carry = 0; // px asked and not yet scrolled (a frame's share is seldom whole)
  return {
    frame(y, time) {
      const step = last === null ? 0 : Math.min(34, Math.max(0, time - last)); // a stalled frame scrolls no more than two
      last = time;
      const into = y < band ? -(band - y) / band : y > innerHeight - band ? (y - (innerHeight - band)) / band : 0;
      if (into === 0) {
        since = null;
        carry = 0;
        return false;
      }
      since ??= time;
      const depth = Math.min(1, Math.abs(into));
      carry += Math.sign(into) * fastest * depth * depth * Math.min(1, (time - since) / ramp) * (step / 1000);
      const whole = Math.trunc(carry);
      if (!whole) return false;
      carry -= whole;
      const was = scrollY;
      scrollBy(0, whole);
      return scrollY !== was;
    },
    stop() {
      since = null;
      last = null;
      carry = 0;
    },
  };
}
