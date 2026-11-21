// The z-order of everything the editor and the preview draw over a report, written once, lowest
// first. Each name is one level; a level's number is a step below TOP, near the largest z-index a
// page can have, so no report's own content covers them. Add a level where it belongs in the list;
// nothing else in src/ writes a number that big (tests/unit/editor-look.mjs holds it to that).
//
// Levels that used to share a number now stand one above the other: the resize guide was level with
// the panels (format bar, conflicts) and the size label with the toast and the hint; they follow the
// order below (the format bar is hidden while a picture is resized, so nothing shows the difference).
//
//   checks     the preview's note of failing checks (render/preview-checks.mjs)
//   outline    the outline at the page's right (page/outline/: its list or its strip; the strip's card is a menu)
//   layer      the overlay layers (page/overlay-layer.mjs): fills, frames, the handle, drop lines
//   marquee    the box a box selection draws
//   affordance a button that appears by the text it adds to (添加图标)
//   note       批注 in the margin: the markers, the cards, a block anchor's bar (editor/page/annotate/)
//   preview    the copies of the blocks being dragged
//   mark       the text a link card is about, marked
//   spin       a link's spinner
//   guide      the line a resize drags
//   label      its size label
//   panel      the format bar, the conflicts, the lost texts
//   toast      the page's own notice
//   hint       the bubble that says why a block cannot be edited
//   menu       the menus (block types, commands, the icon picker)
//   card       a card over the text it belongs to (a formula, a link)
//   viewer     a window over the whole page (a picture viewed, an embed full screen, the crop)
//   tooltip    the tooltip, over everything
const LEVELS = ["checks", "outline", "layer", "marquee", "affordance", "note", "preview", "mark", "spin", "guide", "label", "panel", "toast", "hint", "menu", "card", "viewer", "tooltip"];
const TOP = 2147483010;

/** name -> z-index. */
export const Z = Object.freeze(Object.fromEntries(LEVELS.map((name, index) => [name, TOP - (LEVELS.length - 1 - index)])));

/**
 * What stands inside one overlay layer (a stacking context of its own), lowest first: a drop's tint,
 * a selected block's fill, the frames, the handle and a section's bar, a button standing on a block's
 * edge (a flowchart node's "+", centred on its right border: over the bar of the section it is in,
 * whose right side it may reach) or beside it (the 批注 button, over that bar too), a drop's line.
 */
export const IN_LAYER = Object.freeze({ tint: 1, halo: 2, frame: 3, handle: 4, button: 5, drop: 6 });

export const LEVEL_NAMES = LEVELS;
