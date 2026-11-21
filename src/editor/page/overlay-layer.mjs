import { Z } from "../../shared/layers.mjs";
import { UNIT, unitElement, withLeads } from "./core.mjs";
import { frameNumber, inFrame } from "./frames.mjs";
import { clipOf, fillExtentOf } from "./geometry.mjs";
import { provide } from "./overlays.mjs";
import { addStyle, element } from "./ui.mjs";

// Where the editor draws over the report's blocks (docs/editor.md, "Overlays"): a selected block's
// fill, the dashed frame of the text being edited, the handle and a section's bar, a drag's line
// and tint. Each goes into the layer of the coordinate system its block moves in:
//
//   page      the document's own scrolling (a block in the report's flow): a layer at the
//             document's origin (absolute, in the body), so scrolling the page moves the drawing
//             with its block natively, without waiting for a frame;
//   viewport  the window (a block that is fixed or sticky, or inside one: a table's sticky header
//             cell): a fixed layer;
//   dialog    the open modal dialog holding the block (it is in the top layer, where nothing of
//             the body shows): a fixed layer inside that dialog, never inside another one.
//
// Positions are measured against the layer's own rectangle, never worked out from scrollX/scrollY,
// so they hold whatever the layer's containing block. A box of the page that scrolls by itself (a
// dialog's content, a table wider than its frame, a code block's frame) moves its blocks without
// the layer: the frames that keep the drawings on their blocks put them back (frames.mjs, the same
// frame as the scroll). A block is measured once per frame (shapeOf): its fill, its frame and its
// handle drawn in one frame use the same numbers, kept relative to the layer, which scrolling the
// page leaves as they are; outside the frames (a selection made, a block converted) it is measured
// afresh.

const STYLE = `
  .ge-layer { left: 0; top: 0; width: 0; height: 0; overflow: visible; pointer-events: none; z-index: ${Z.layer}; }
  .ge-layer[data-context="page"] { position: absolute; }
  .ge-layer[data-context="viewport"], .ge-layer[data-context="dialog"] { position: fixed; }
  /* Whatever the tools put in a layer stands where they say; those that declared a position of their own (a relative box) would not, and the layer cannot know which rule a tool wrote them with: !important keeps it one rule. */
  .ge-layer > * { position: absolute !important; }
  .ge-layer > .ge-handle, .ge-layer > .ge-section-bar { pointer-events: auto; }
`;

// The coordinate system a block moves in, and the element its layer goes into.
function contextOf(target) {
  const dialog = target.closest("dialog[open]");
  if (dialog?.matches(":modal")) return { kind: "dialog", host: dialog };
  for (let node = target; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
    const { position } = getComputedStyle(node);
    if (position === "fixed" || position === "sticky") return { kind: "viewport", host: document.body };
  }
  return { kind: "page", host: document.body };
}

/** The layer the editor draws in over `target` (made when first needed). */
export function layerOf(target) {
  addStyle(STYLE);
  const { kind, host } = contextOf(target);
  let layer = [...host.children].find((child) => child.classList.contains("ge-layer") && child.dataset.context === kind);
  if (!layer) {
    layer = element("div", { class: "ge-layer", "data-context": kind, "data-doc-dev": "" });
    host.append(layer);
  }
  return layer;
}

const shapes = new WeakMap(); // block -> { at: the frame measured in, shape }

/**
 * Where `target` shows, as the editor draws over it: { layer, origin: the layer's corner in the
 * window, rect and clip relative to the layer, radius: its corners, reach: how far its fill reaches
 * when it says so, room: how far it may reach above and below it (roomOf, measured when first read:
 * only a selected block's fill and the frame of what is edited read it, so the handle, the flags and
 * the others never measure the neighbours) }, or null when it does not show. Measured once per
 * frame; outside the frames, afresh.
 */
export function shapeOf(target) {
  const at = inFrame() ? frameNumber() : -1;
  const cached = shapes.get(target);
  if (at >= 0 && cached?.at === at) return cached.shape;
  const box = fillExtentOf(target);
  let shape = null;
  if (box) {
    const layer = layerOf(target);
    const origin = layer.getBoundingClientRect();
    const relative = (rect) => rect && { left: rect.left - origin.left, top: rect.top - origin.top, right: rect.right - origin.left, bottom: rect.bottom - origin.top };
    let room = null;
    shape = {
      layer, origin: { left: origin.left, top: origin.top }, rect: relative(box), clip: relative(clipOf(target)), radius: boxRadius(target), reach: boxReach(target),
      get room() { return (room ??= roomOf(target, box)); },
    };
  }
  if (at >= 0) shapes.set(target, { at, shape });
  return shape;
}

/**
 * How far what the editor draws over a block reaches past it (a selected block's fill, the frame
 * of what is being edited): a block of its own rounded box (a code block, a
 * highlight block, a card) 6px, or what the block says (`reach`: a file's row 4px;
 * a callout's square box 6px), its corners its own and that much more, so the two are concentric; a
 * block of text 2px, 4px round. `radius`: the block's (boxRadius). Above and below it, never more
 * than its `room` (roomOf): two neighbours' fills, however close the blocks stand (disclosures and
 * code blocks 8px apart, list items 5px), never overlap; where the room is less, a block of its own
 * box reaches that much less at its sides too and its corners are round by that much less (the fill
 * as even around it as its box is: never wide at the sides and narrow above and below, never an
 * ellipse); a block of text keeps its 2px at its sides. { x: at its sides, y: its own reach, top,
 * bottom: above and below it, the same, radius, corners: null }.
 */
export const reachOf = (radius, reach = null, room = null) => {
  const text = radius <= 0 && reach === null;
  const out = text ? 2 : reach ?? 6;
  // The same above and below, the smaller room of the two: a block's fill is even, so in a run of
  // blocks the first and the last look as the ones between (not wider toward the text around them).
  const top = Math.min(out, room?.above ?? out, room?.below ?? out);
  const bottom = top;
  if (text) return { x: out, y: out, top, bottom, radius: 4, corners: null };
  // A box filled evenly on every side: where its room keeps the fill closer above and below, it is as
  // close at the sides (3px all round for disclosures 8px apart, not 6 at the sides and 3 above), and its
  // corners are the block's own and that reach (a circle, as the block's).
  return { x: top, y: out, top, bottom, radius: Math.max(0, radius) + top, corners: null };
};

/**
 * How far a block's fill may reach above and below it ({ above, below }, Infinity where nothing
 * limits it; reachOf takes the smaller of the two for both sides), one rule for every kind of block: half the gap to the block next to it that way
 * (neighbourOf) with a pixel left between them ((gap - 1) / 2, rounded down), or what that block's
 * own reach leaves of the gap less a pixel when that is more (a disclosure 12px under a paragraph,
 * whose fill reaches 2px, keeps its 6px), so two neighbours' fills never overlap: they keep a
 * hairline apart, or just meet where the blocks touch. `box`: its fillExtentOf.
 */
export function roomOf(target, box = fillExtentOf(target)) {
  if (!box) return null;
  const room = (neighbour, gap) => {
    if (!neighbour) return Infinity;
    const { x: reach } = reachOf(boxRadius(neighbour.unit), boxReach(neighbour.unit)); // its own, on every side
    return Math.max(0, Math.floor((gap - 1) / 2), Math.floor(gap - 1 - reach));
  };
  const above = neighbourOf(target, box, false);
  const below = neighbourOf(target, box, true);
  return { above: room(above, above && box.top - above.rect.bottom), below: room(below, below && below.rect.top - box.bottom) };
}

// The block next to `target` above it (`forward`: below it) and where it shows (fillExtentOf),
// { unit, rect }, or null: the nearest unit of its container that way that shows and stands over or
// under it (a column beside it, a step of a flowchart's row, does not); none, its container's (a
// disclosure's first block: the block before the disclosure). Any of them may be filled with it (a
// selection, the blocks a text selection takes whole), so its fill keeps clear of all of them.
function neighbourOf(target, box, forward) {
  for (let at = target; at; at = at.parentElement?.closest(UNIT) ?? null) {
    for (let next = forward ? at.nextElementSibling : withLeads(at)[0].previousElementSibling; next; next = forward ? next.nextElementSibling : next.previousElementSibling) {
      const unit = unitElement(next);
      if (!unit || unit === at || unit.parentElement !== at.parentElement) continue;
      const rect = fillExtentOf(unit);
      if (rect && rect.right > box.left && rect.left < box.right) return { unit, rect };
    }
  }
  return null;
}

/** Where a block's fill lies (client coordinates): its fillExtentOf and its reach past it (reachOf, roomOf), or null. */
export function fillRectOf(target) {
  const box = fillExtentOf(target);
  if (!box) return null;
  const { x, top, bottom } = reachOf(boxRadius(target), boxReach(target), roomOf(target, box));
  return { left: box.left - x, top: box.top - top, right: box.right + x, bottom: box.bottom + bottom };
}

/** How far a boxed block's fill reaches past it when it says so (--doc-box-reach; a square box too, a callout's), else null. */
export function boxReach(element) {
  const declared = parseFloat(getComputedStyle(element).getPropertyValue("--doc-box-reach"));
  return declared > 0 ? declared : null;
}

/**
 * The corner radius of a block that shows a box of its own (a background or a border: a code
 * block, a highlight block, a card), else 0 (text, however its element is rounded: a paragraph or
 * heading given a background color too, whose fill the kit lays where a text block's selection is).
 * The editor's own tints over a block (a formula block's under the pointer or while its box is open)
 * are inset shadows, never its background, so they never count: a block's fill is the same
 * whatever the pointer does.
 */
export function boxRadius(element) {
  const style = getComputedStyle(element);
  // A block whose box is drawn inside it (a file's row, a bookmark's card, an embed's frame), a list
  // item drawn as a box (a flowchart's step) or a list drawn as its items' boxes (a flowchart, whose
  // fill has its cards' corners: styles/flowchart.css), says so.
  const declared = parseFloat(style.getPropertyValue("--doc-box-radius"));
  if (declared > 0) return declared;
  if (/^(P|H[1-4]|LI|HR)$/.test(element.tagName)) return 0; // a divider is a line, no box either
  const radius = parseFloat(style.borderTopLeftRadius) || 0;
  if (radius === 0) return 0;
  const painted = !/^(transparent|rgba\(0, 0, 0, 0\))$/.test(style.backgroundColor) || style.backgroundImage !== "none";
  const bordered = ["Top", "Right", "Bottom", "Left"].some((side) => parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== "none");
  return painted || bordered ? radius : 0;
}

/**
 * Lay `node` over a block measured as `shape` (shapeOf): `x` past it at its sides, `above` and
 * `below` it (`y` both, unless said), with corners of `radius` (or `corners`, a border-radius: reachOf's),
 * cut where the block is cut. Each edge is rounded on its own, so two drawings kept apart stay apart.
 */
export function drawOver(node, { layer, rect, clip }, { x, y, top: above = y, bottom: below = y, radius, corners = null }) {
  if (node.parentNode !== layer) layer.append(node);
  const left = Math.round(rect.left - x);
  const top = Math.round(rect.top - above);
  const width = Math.round(rect.right + x) - left;
  const height = Math.round(rect.bottom + below) - top;
  const cut = clip && [clip.top - top, left + width - clip.right, top + height - clip.bottom, clip.left - left].map((side) => `${Math.max(0, Math.round(side))}px`).join(" ");
  Object.assign(node.style, {
    transform: `translate(${left}px, ${top}px)`, width: `${width}px`, height: `${height}px`, borderRadius: corners ?? `${radius}px`,
    clipPath: cut && cut !== "0px 0px 0px 0px" ? `inset(${cut})` : "",
  });
}

/**
 * A thin line's coordinates on a scaled screen (the owner's is at 125%, where a whole CSS pixel is 1.25 device
 * pixels and a 2px line begun on one is drawn as three soft columns): `onDevice(value, origin)` is `value`, relative
 * to a layer whose corner is at `origin` (client px), moved to the nearest edge of a device pixel; `deviceSize(css)`
 * a length as a whole number of device pixels, one at least (2px is 2.4px at 125%: three whole columns). At 100%
 * both are the whole CSS pixels they were. The bars beside the blocks an Agent touched (fills.mjs createBars) and
 * the ghosts' (changes/ghost.mjs) are drawn by them.
 */
export function onDevice(value, origin = 0) {
  const ratio = globalThis.devicePixelRatio || 1;
  return Math.round((origin + value) * ratio) / ratio - origin;
}
export function deviceSize(css) {
  const ratio = globalThis.devicePixelRatio || 1;
  return Math.max(1, Math.round(css * ratio)) / ratio;
}

/**
 * Put `node` in `layer` at `left`, `top` (relative to the layer), on whole CSS pixels; given the layer's
 * corner (`origin`, client px), on whole device pixels (onDevice).
 */
export function drawAt(node, layer, left, top, origin = null) {
  if (node.parentNode !== layer) layer.append(node);
  const x = origin ? onDevice(Math.round(left), origin.left) : Math.round(left);
  const y = origin ? onDevice(Math.round(top), origin.top) : Math.round(top);
  node.style.transform = `translate(${x}px, ${y}px)`;
}

/** Lay `node` in `layer` over `rect` (window coordinates), `outset` past it. */
export function drawBox(node, layer, rect, outset = 0) {
  if (node.parentNode !== layer) layer.append(node);
  const origin = layer.getBoundingClientRect();
  Object.assign(node.style, {
    transform: `translate(${Math.round(rect.left - origin.left - outset)}px, ${Math.round(rect.top - origin.top - outset)}px)`,
    width: `${Math.round(rect.right - rect.left + 2 * outset)}px`,
    height: `${Math.round(rect.bottom - rect.top + 2 * outset)}px`,
  });
}

provide("layers", () => [...document.querySelectorAll(".ge-layer")].map((layer) => ({ context: layer.dataset.context, in: layer.parentElement?.localName ?? null, drawings: layer.children.length })));
