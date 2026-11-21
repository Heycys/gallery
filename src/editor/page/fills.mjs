import { IN_LAYER } from "../../shared/layers.mjs";
import { deviceSize, drawOver, fillRectOf, onDevice, reachOf, shapeOf } from "./overlay-layer.mjs";
import { own } from "./overlays.mjs";
import { addStyle, element } from "./ui.mjs";

// The fills laid over blocks (docs/editor.md, "Overlays"), one painter for all of them: the blocks
// selected (selection/), the blocks of the 批注 whose card shows (annotate/) and the blocks an Agent added
// or changed (changes/). There is one fill per
// block, in the editor's own layer for that block (overlay-layer.mjs), never inside it, and what it
// covers is the block's own to say: where it shows (a list item with its marker), how far the fill
// reaches past it (reachOf), the room its neighbours leave (roomOf), its corners and what cuts it. Only
// the colour is the caller's. The bars beside blocks (createBars) stand where a block's fill would, a
// little left of it.

const STYLE = `
  /* A block's fill, as a box selection's rectangle: blue for the blocks selected, warm for a 批注's, green for what an Agent added or changed (changes/). */
  .ge-halo, .ge-note-halo, .ge-diff-halo, .ge-diff-glow, .ge-diff-bar { position: absolute; left: 0; top: 0; z-index: ${IN_LAYER.halo}; pointer-events: none; }
  .ge-halo { background: var(--ge-halo); }
  .ge-note-halo { background: var(--ge-note); }
  .ge-diff-halo { background: var(--ge-diff-add-fill); }
  .ge-diff-bar { width: 2px; border-radius: 1px; background: var(--ge-diff-add-line); }
`;

/**
 * The fills of one colour. kind: what the overlays call them; className: the colour; stands(block):
 * whether a block's fill still stands for something, besides the block being on the page; made(block,
 * fill): told of each fill as it is made (changes/ marks an arrival's). Returns { paint(blocks), clear(),
 * count }: paint draws a fill on each of `blocks` that shows, where it is now, and takes away those of any
 * other block at once; clear takes every fill down; count is how many there are.
 */
export function createFills({ kind, className, stands, made = null }) {
  addStyle(STYLE);
  const fills = new Map(); // block -> its fill

  function paint(blocks) {
    const wanted = new Set(blocks);
    for (const [block, fill] of fills) {
      if (wanted.has(block)) continue;
      fill.remove();
      fills.delete(block);
    }
    for (const block of wanted) {
      const shape = shapeOf(block);
      let fill = fills.get(block);
      if (!shape) { // not shown now (another Sheet, a closed disclosure)
        fill?.remove();
        continue;
      }
      if (!fill) {
        const node = element("div", { class: className });
        own(node, kind, { owner: block, alive: () => fills.get(block) === node && block.isConnected && stands(block), expected: () => fillRectOf(block) });
        fills.set(block, node);
        fill = node;
        made?.(block, node);
      }
      drawOver(fill, shape, reachOf(shape.radius, shape.reach, shape.room));
    }
  }

  function clear() {
    for (const fill of fills.values()) fill.remove();
    fills.clear();
  }

  return { paint, clear, get count() { return fills.size; } };
}

// A bar: 2px wide, its right edge 8px left of the block's own edge (its words', a card's frame), whatever its
// fill reaches past it (2px for a text block, 6 at most for a card), so that the bars of a run of blocks, words
// and cards alike, stand on one line in the margin (2026-11-17: a card's stood 4px further out than its
// neighbours', 4px left of its own fill): 10 to 8px left of the block, clear of the grip's box (10px left of
// it: handle-sizes.mjs) and of every fill (6px from a text block's, 2 from a card's); as tall as that fill. On a
// scaled screen its edges are on device pixels and its width whole ones (overlay-layer.mjs onDevice, deviceSize:
// 2.4px at 125%), so that it is a crisp line there too, never three soft columns.
const BAR = 2;
const BAR_OFF = 8;

// Where a bar beside a block measured as `shape` (shapeOf) stands, relative to its layer: { left, top, width,
// height, cutTop, cutBottom }, cut above and below where the block is (a box that scrolls by itself), never at
// its sides (the bar is in the margin, outside whatever box cuts the block across).
function barOf(shape) {
  const { top: above, bottom: below } = reachOf(shape.radius, shape.reach, shape.room);
  const { rect, clip, origin } = shape;
  const across = (value) => onDevice(value, origin.left);
  const down = (value) => onDevice(value, origin.top);
  const width = deviceSize(BAR);
  const left = across(Math.round(rect.left) - BAR_OFF) - width;
  const top = down(Math.round(rect.top - above));
  const height = down(Math.round(rect.bottom + below)) - top;
  const cutTop = clip ? Math.max(0, down(clip.top) - top) : 0;
  const cutBottom = clip ? Math.max(0, top + height - down(clip.bottom)) : 0;
  return { left, top, width, height, cutTop, cutBottom };
}

/**
 * The bars beside blocks, in the left margin (changes/: one beside every block an Agent added or changed,
 * docs/editor.md "Agent's changes"), each its own node in the block's layer, so that nothing cutting the
 * block's fill (a clip-path) cuts it. kind, className, stands: as createFills. Returns { paint(blocks),
 * clear(), count }.
 */
export function createBars({ kind, className, stands }) {
  addStyle(STYLE);
  const bars = new Map(); // block -> its bar

  // Where a block's bar should be now (client coordinates), for the overlays' audit.
  const expected = (block) => {
    const shape = shapeOf(block);
    if (!shape) return null;
    const { left, top, width, height } = barOf(shape);
    return { left: shape.origin.left + left, top: shape.origin.top + top, right: shape.origin.left + left + width, bottom: shape.origin.top + top + height };
  };

  function paint(blocks) {
    const wanted = new Set(blocks);
    for (const [block, bar] of bars) {
      if (wanted.has(block)) continue;
      bar.remove();
      bars.delete(block);
    }
    for (const block of wanted) {
      const shape = shapeOf(block);
      let bar = bars.get(block);
      if (!shape) {
        bar?.remove();
        continue;
      }
      if (!bar) {
        const node = element("div", { class: className });
        own(node, kind, { owner: block, alive: () => bars.get(block) === node && block.isConnected && stands(block), expected: () => expected(block) });
        bars.set(block, node);
        bar = node;
      }
      if (bar.parentNode !== shape.layer) shape.layer.append(bar);
      const { left, top, width, height, cutTop, cutBottom } = barOf(shape);
      Object.assign(bar.style, {
        transform: `translate(${left}px, ${top}px)`, width: `${width}px`, height: `${height}px`,
        clipPath: cutTop || cutBottom ? `inset(${cutTop}px 0px ${cutBottom}px 0px)` : "",
        display: cutTop + cutBottom >= height ? "none" : "",
      });
    }
  }

  function clear() {
    for (const bar of bars.values()) bar.remove();
    bars.clear();
  }

  return { paint, clear, get count() { return bars.size; } };
}
