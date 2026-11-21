// The sizes of a block's handle and of a section's bar (handle/), by themselves so that what has to
// stand clear of them can reckon with them: a 批注's marker and button (annotate/) and a drop beside a
// block (drag/drop.mjs, a pure function of the tree, tested without a browser).

// The grip (18×24, 10px left of the block); gap: from the block's left edge.
export const HANDLE = { width: 18, height: 24, gap: 10 };
// The bar's square left of the grip (the "+": 24×24, 52px left of the block):
// all of it reaches the bar, which draws 2px wide, 3px clear of the grip's fill. edge: how near the
// window's edge it stands at most.
export const ADD = { width: 24, edge: 2 };
// A section's bar: its strip's distance from the section, its width; how far out the pointer finds it,
// as far past the strip as the strip stands from the section.
const STRIP = { gap: 6, width: 16 };
export const BAR = { ...STRIP, reach: STRIP.gap + STRIP.width + STRIP.gap };
