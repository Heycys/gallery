import { task } from "./frames.mjs";

// What scrolls when the pointer of a press gesture nears the top or bottom edge of what it works in
// (docs/editor.md, "Selecting blocks"): dragging blocks, drawing a box selection, selecting text across
// blocks. One rule for the three, and one driver: edgeScroll() scrolls once and says whether
// anything moved; the box selection and the text selection are tasks of the editor's frames
// (edgeFollower, frames.mjs: no loop of their own), and a drag calls edgeScroll from the block
// tools' task, which already runs on every frame of a drag. What scrolls is the gesture's: the
// content of the detail card it started in (the one on top when one was opened from another, never
// the card under it), else the window.

const EDGE = 56; // how near the edge of what scrolls the pointer is when it starts to

/**
 * Scroll `scroller` (a detail card's content; null: the window) when the pointer at (x, y) is
 * within EDGE of its top or bottom edge, faster the nearer the edge. Returns whether it moved.
 */
export function edgeScroll(x, y, scroller = null) {
  const content = scroller?.isConnected ? scroller : null;
  const rect = content ? content.getBoundingClientRect() : { top: 0, bottom: innerHeight };
  const step = Math.round(y < rect.top + EDGE ? -(rect.top + EDGE - y) / 3 : y > rect.bottom - EDGE ? (y - rect.bottom + EDGE) / 3 : 0);
  if (!step) return false;
  if (content) {
    const was = content.scrollTop;
    content.scrollTop += step;
    return content.scrollTop !== was;
  }
  const was = scrollY;
  scrollBy(0, step);
  return scrollY !== was;
}

/**
 * A task of the editor's frames that scrolls near the edge for a gesture, on each frame from its
 * wake() until `pointer()` gives null (the gesture is over). pointer(): where the pointer is, { x, y };
 * scroller(): what the gesture scrolls (a card's content, null: the window); scrolled(): what to do
 * once a frame has scrolled (the box or the selection follows what came into view); fail(): the
 * gesture goes when the task throws (frames.mjs).
 */
export function edgeFollower(name, { pointer, scroller, scrolled, fail }) {
  return task(name, {
    run() {
      const at = pointer();
      if (!at) return false;
      if (edgeScroll(at.x, at.y, scroller())) scrolled();
      return true;
    },
    fail,
  });
}
