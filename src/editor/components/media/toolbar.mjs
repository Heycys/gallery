import { IN_LAYER } from "../../../shared/layers.mjs";
import { tooltip } from "../../page/tooltip.mjs";
import { element } from "../../page/ui.mjs";

// The toolbar a media block with something to show gets with the pointer on it (an image's, an
// embed's): at its top right, in the editor's overlay layer, a bar of small buttons. What each block
// puts in it, and where it stands, is its own.

/** The toolbar's look, and its buttons' (a popover's too: an image's 对齐 pops three of them). */
export const TOOLBAR_STYLE = `
  .ge-layer > .ge-media-bar { pointer-events: auto; z-index: ${IN_LAYER.button}; } /* over its block's fill while the block is selected */
  /* A small bar on the picture (look.mjs: a bar's lighter shadow): its 24px tools are small buttons (--ge-r-small, 6), its corners 2px past theirs. */
  .ge-media-bar { display: flex; padding: 2px; border-radius: var(--ge-r-ctl); background: var(--ge-bg); box-shadow: var(--ge-shadow-bar); }
  .ge-media-tool { display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; border-radius: var(--ge-r-small); color: var(--ge-ico2); cursor: pointer; user-select: none; }
  .ge-media-tool:active { background: var(--ge-press); }
  .ge-media-tool svg { display: block; width: 20px; height: 20px; flex: none; fill: none; stroke: currentColor; stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; }
  .ge-media-tool:hover, .ge-media-tool[data-on] { background: var(--ge-hover); }
`;

/** An empty toolbar named `label`. */
export const mediaBar = (label) => element("div", { class: "ge-media-bar", role: "toolbar", "aria-label": label });

/**
 * A toolbar button: `label` (what it is), `tip` (the tooltip), `icon` (an svg, or a function giving
 * it, drawn by draw() each time the bar is shown), `run(button)` on a click while `alive()` (the block it stands for is
 * still on the page). draw() puts a new icon in only when it changed: a bar placed every frame (an
 * image's, while it is selected) that put its icons in anew each time took the svg a press landed on
 * out of the page before the button was let go, and the browser then fired no click (2026-11-09).
 */
export function toolButton({ label, tip, icon, run, alive }) {
  const button = element("div", { class: "ge-media-tool", role: "button", "aria-label": label });
  let drawn = null;
  button.draw = () => {
    const markup = typeof icon === "function" ? icon() : icon;
    if (markup === drawn) return;
    drawn = markup;
    button.innerHTML = markup;
  };
  if (typeof icon !== "function") button.draw(); // a function icon depends on the block: drawn when the bar is shown
  tooltip(button, tip);
  button.addEventListener("pointerdown", (event) => event.preventDefault());
  button.addEventListener("click", (event) => {
    event.preventDefault();
    if (alive()) run(button);
  });
  return button;
}
