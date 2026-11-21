import { IN_LAYER } from "../../shared/layers.mjs";
import { FOLLOW, task } from "./frames.mjs";
import { fillExtentOf } from "./geometry.mjs";
import { drawOver, shapeOf } from "./overlay-layer.mjs";
import { onSettle, own } from "./overlays.mjs";
import { addStyle, element } from "./ui.mjs";

// The red frame round a block the page cannot save as it is (docs/editor.md, "Conflicts"): a block
// in conflict (data-ge-flag="conflict", conflicts.mjs) or a new block that has no place in the file
// yet (data-ge-flag="check", editor.mjs). Drawn in the editor's layer like every other frame (frame.mjs,
// selection/), 2px past the block, so it follows its corners, its list marker and what clips it, and
// no rule of the report's own elements (the outline some of them take off) can undo it. It stands
// for the attribute: each flagged block shown has one, and it goes with the flag or the block.

const REACH = 2;
const STYLE = `
  .ge-flag { position: absolute; left: 0; top: 0; z-index: ${IN_LAYER.frame}; box-sizing: border-box; border: ${REACH}px solid var(--ge-diff-del-text); pointer-events: none; }
`;

/** editing(): whether the page is being edited. */
export function createFlags(editing) {
  addStyle(STYLE);
  const frames = new Map(); // flagged block -> its frame

  const reach = (shape) => ({ x: REACH, y: REACH, radius: shape.radius > 0 ? shape.radius + REACH : 4 });
  const outset = (box) => box && { left: box.left - REACH, top: box.top - REACH, right: box.right + REACH, bottom: box.bottom + REACH };

  function takeDown() {
    for (const frame of frames.values()) frame.remove();
    frames.clear();
  }

  function run() {
    const flagged = new Set(editing() ? document.querySelectorAll("[data-ge-flag]") : []);
    for (const [block, frame] of frames) {
      if (flagged.has(block) && block.isConnected) continue;
      frame.remove();
      frames.delete(block);
    }
    for (const block of flagged) {
      const shape = shapeOf(block);
      let frame = frames.get(block);
      if (!shape) { // not shown now (another Sheet, a closed disclosure)
        frame?.remove();
        frames.delete(block);
        continue;
      }
      if (!frame) {
        frame = element("div", { class: "ge-flag" });
        const mine = frame;
        own(mine, "flag", { owner: block, alive: () => frames.get(block) === mine && block.isConnected && block.hasAttribute("data-ge-flag") && editing(), expected: () => outset(fillExtentOf(block)) });
        frames.set(block, frame);
      }
      drawOver(frame, shape, reach(shape));
    }
    return frames.size > 0 ? FOLLOW : false; // drawn again when a flagged block may have moved (frames.mjs)
  }
  const drawing = task("flag", { run, fail: takeDown });

  // A flag set or taken off, editing begun or ended: draw again. Blocks taken off the page go at once.
  new MutationObserver(() => drawing.wake()).observe(document.documentElement, { attributes: true, subtree: true, attributeFilter: ["data-ge-flag", "data-ge-editing"] });
  onSettle(() => {
    for (const [block, frame] of frames) {
      if (block.isConnected) continue;
      frame.remove();
      frames.delete(block);
    }
  });
  drawing.wake();
}
