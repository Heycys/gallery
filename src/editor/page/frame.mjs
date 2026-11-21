import { IN_LAYER } from "../../shared/layers.mjs";
import { innerHost } from "./caret.mjs";
import { frameOf } from "./core.mjs";
import { FOLLOW, task } from "./frames.mjs";
import { drawOver, fillRectOf, reachOf, shapeOf } from "./overlay-layer.mjs";
import { onSettle, own } from "./overlays.mjs";
import { addStyle, element } from "./ui.mjs";
import { onPreferences, preference } from "../../shared/preferences.mjs";

// The dashed frame around what is being edited (docs/editor.md, "Browser side"): the text with the
// focus when it is a block of its own, or the component whose text it is (core.mjs markFrames,
// frameOf). It is drawn in the editor's layer (overlay-layer.mjs), as a selected block's fill is (selection/), over
// where the block shows (geometry.mjs extentOf: a list item with its marker), so the two line up;
// never as an outline of the report's own elements, which could not take in a list item's marker.
// It follows scrolling, resizing and reflow while it shows (a task of the editor's frames,
// frames.mjs), cut where the block is cut, and belongs to the block it frames (overlays.mjs). Only
// with the reader's 显示编辑框 on (the workbench's 设置: shared/preferences.mjs editFrame, off at first):
// otherwise it never shows, and switched there it comes or goes at once.

const STYLE = `
  .ge-frame { position: absolute; left: 0; top: 0; z-index: ${IN_LAYER.frame}; box-sizing: border-box; border: 1px dashed color-mix(in srgb, var(--doc-accent, #2678d8) 45%, transparent); pointer-events: none; }
`;


/** editing(): whether the page is being edited. */
export function createFrame(editing) {
  addStyle(STYLE);
  const node = element("div", { class: "ge-frame" });
  let current = null; // the block framed
  let shown = preference("editFrame");

  // The focused text of the report, or the component it belongs to.
  function framed() {
    const focused = innerHost(document.activeElement); // a paragraph a list item holds: its own (caret.mjs)
    if (!shown || !editing() || focused?.getAttribute("contenteditable") !== "true" || focused.closest("[data-doc-dev]")) return null;
    return frameOf(focused) ?? focused;
  }

  // The frame follows its block's corners (rounded while editing when it has none, editor.mjs).
  function run() {
    const target = framed();
    const shape = target && shapeOf(target);
    current = shape ? target : null;
    if (!shape) {
      node.remove();
      return false;
    }
    const block = target;
    own(node, "frame", { owner: block, alive: () => current === block && block.isConnected && framed() === block, expected: () => fillRectOf(block) });
    drawOver(node, shape, reachOf(shape.radius, shape.reach, shape.room)); // where a selected block's fill is
    return FOLLOW; // drawn again when the block may have moved (frames.mjs)
  }
  const frames = task("frame", {
    run,
    fail: () => {
      current = null;
      node.remove();
    },
  });
  // The text framed taken off the page: the frame goes at once.
  onSettle(() => {
    if (current && !current.isConnected) {
      current = null;
      node.remove();
    }
  });
  document.addEventListener("focusin", () => frames.wake());
  document.addEventListener("focusout", () => frames.wake());
  document.addEventListener("selectionchange", () => frames.wake());
  onPreferences(() => {
    shown = preference("editFrame");
    frames.wake();
  });
}
