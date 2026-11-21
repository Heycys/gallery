import { BLOCK_TYPES, TYPE_INFO } from "../components/registry.mjs";
import { pageOfType } from "./page-objects.mjs";
import { tooltip } from "./tooltip.mjs";
import { addStyle, element } from "./ui.mjs";
import { t } from "../../shared/i18n/index.mjs";

// The types a block can be turned into, as icons side by side, the block's
// own type marked: the top of the block menu (block-menu/) and the format bar's "turn into"
// (format-bar/). The buttons are the format bar's (32×28px, 4px apart; the current one marked as
// a pressed tool of the bar is, its icon's lines in the bar's blue, --ge-accent, and no fill of its
// own, so the pointer's gray fills it as any other), so both read alike. Each icon names its type, and its Markdown shortcut, in a tooltip.
// A type that says `corner` has no cell of its own but the gray corner of that type's (a split
// button): 小字's of 文本's, so 文本 and the headings fill one line. The corner shows only with the
// pointer (or the keys) on the cell, or, blue, when the block is of that type. It is a click target
// only, not in the arrow keys' path. A type that says `preload` has what it needs loaded as soon as
// the grid offers it, and a block with text waits for it to be turned into that type (preloading).

const CELL = 32; // a button's width (28px high)
const GAP = 4;
const SIDE = 6; // the room left and right of the grid in the block menu: the card's padding (--ge-card-pad, 5) and 1px, so its icons stand 12px from the card's side, as its rows' do
const CORNER = 13; // the 小字 corner's legs: its right angle rounded off by the cell's own corner,
// its other two corners a little (2.5px back from each tip along both sides).
const TRIANGLE = "M13 2.5L13 13L2.5 13Q0 13 1.77 11.23L11.23 1.77Q13 0 13 2.5Z";

const STYLE = `
  /* In a menu card (the block menu) the card's padding is its room at the sides; it stands in the middle of the card. */
  .ge-types { display: grid; grid-template-columns: repeat(var(--ge-types-columns, 6), ${CELL}px); justify-content: center; gap: ${GAP}px; padding: 3px 0 2px; }
  .ge-type { display: flex; align-items: center; justify-content: center; width: ${CELL}px; height: 28px; padding: 0; border: 0; border-radius: var(--ge-r-ctl); background: transparent; color: var(--ge-ico); cursor: pointer; }
  .ge-type:hover, .ge-type[data-active] { background: var(--ge-hover-row); }
  .ge-type:active { background: var(--ge-press); }
  /* The block's own type: its icon in the accent, no fill of its own (the owner's 2026-11-17: no pale blue behind it). */
  .ge-type[aria-current="true"] { color: var(--ge-accent); }
  .ge-type-pair { position: relative; border-radius: var(--ge-r-ctl); overflow: hidden; }
  .ge-type-corner { position: absolute; right: 0; bottom: 0; width: ${CORNER}px; height: ${CORNER}px; padding: 0; border: 0; background: transparent; cursor: pointer; }
  .ge-type-corner::before { content: ""; position: absolute; inset: 0; background: light-dark(rgb(55 53 47 / 12%), rgb(255 255 255 / 13%)); clip-path: path("${TRIANGLE}"); opacity: 0; transition: background 20ms ease-in, opacity 120ms ease-out; }
  .ge-type-pair:is(:hover, :has(.ge-type[data-active]), :has(.ge-type-corner[aria-current="true"])) .ge-type-corner::before { opacity: 1; }
  .ge-type-corner:hover::before { background: light-dark(rgb(55 53 47 / 30%), rgb(255 255 255 / 28%)); }
  .ge-type-corner[aria-current="true"]::before { background: var(--ge-accent); }
  .ge-type svg { display: block; width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; }
`;

/** What `type` still waits for on the page (`preload`, its page object's): the promise of its coming, or null when nothing. */
export function preloading(type) {
  return BLOCK_TYPES[type].preload ? pageOfType(type)?.preload(type) ?? null : null;
}

/** How wide a grid of `columns` is, its padding included (the block menu is as wide as its grid). */
export const gridWidth = (columns) => columns * CELL + (columns - 1) * GAP + 2 * SIDE;

/** The block menu's grid: types on a line; the menu as wide as it. A card of a few actions (a table's
 * row or column menu) is as wide as the block menu. */
export const MENU_COLUMNS = 5;
export const MENU_WIDTH = gridWidth(MENU_COLUMNS);

/**
 * A grid of `types` (block type names), `current` marked; choosing one calls `choose(type)`.
 * `columns`: how many fit on a line. Its cells, in order, are its `.ge-type` buttons.
 */
export function typeGrid(types, current, choose, { columns = 6 } = {}) {
  addStyle(STYLE);
  for (const type of types) preloading(type);
  const grid = element("div", { class: "ge-types", role: "group", "aria-label": t("转换为") });
  grid.style.setProperty("--ge-types-columns", String(columns));
  const button = (type, className, html = "") => {
    const { label, hint } = TYPE_INFO[type];
    const node = element("button", { type: "button", class: className, "aria-label": label, "aria-current": String(type === current), html });
    node.addEventListener("mousedown", (event) => event.preventDefault()); // the caret stays until the block turns
    node.addEventListener("click", () => choose(type));
    // "---" and "```" turn a block on their own; the others take a space after them.
    tooltip(node, type === current ? t("{0}（当前）", label) : label, hint ? t("Markdown：{0}", `${hint}${/^(---|```)$/.test(hint) ? "" : t(" 空格")}`) : null);
    return node;
  };
  const corners = new Map(types.filter((type) => types.includes(BLOCK_TYPES[type].corner)).map((type) => [BLOCK_TYPES[type].corner, type]));
  const cornered = new Set(corners.values());
  for (const type of types) {
    if (cornered.has(type)) continue;
    const cell = button(type, "ge-type", TYPE_INFO[type].icon);
    if (corners.has(type)) {
      const pair = element("div", { class: "ge-type-pair" });
      pair.append(cell, button(corners.get(type), "ge-type-corner"));
      grid.append(pair);
    } else grid.append(cell);
  }
  return grid;
}
