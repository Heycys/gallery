import { COLORS, backgroundClass, blockColorsOf, textClass } from "../../components/colors.mjs";
import { svg } from "../../components/icons.mjs";
import { RINGS } from "../format-bar/colors.mjs";
import { tooltip } from "../tooltip.mjs";
import { addStyle, element } from "../ui.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// The block menu's 颜色 ›: 上次使用 (the color given last in
// this page, when there is one), 文本颜色 and 背景颜色, each 默认 and the nine colors, as swatches
// five to a line, as the format bar's colors are (format-bar/bar.mjs: the same swatches and rings);
// the block's own colors ringed, one of each family (默认 when it has none of it). When the blocks
// show one of the nine with none of a family (a callout's background is blue: `defaults`), that
// family has no 默认: that color is ringed for none, and picking it takes the class away. Each
// swatch names its color in a tooltip. The swatches are drawn with the kit's own classes, so they
// match the text in either theme, a background's as the block's fill (`--doc-fill`). A pick gives every target that color of its family, the other family's staying (one
// undo step: look, history.mjs; a table cell's one color: table/). Only the families the targets take show.

const STYLE = `
  .ge-pop .ge-color-grid { display: grid; grid-template-columns: repeat(5, 30px); gap: 4px; padding: 0 6px 4px; } /* 11px from the card's side, its padding (--ge-card-pad) and 6 */
  .ge-pop .ge-color-cell { display: block; width: 30px; height: 30px; padding: 2px; border: 0; border-radius: var(--ge-r-ctl); background: transparent; color: inherit; font: inherit; cursor: pointer; }
  .ge-pop .ge-color-cell > span { display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: 26px; height: 26px; border-radius: 6px;
    font-size: 16px; font-weight: 500; line-height: 1; box-shadow: inset 0 0 0 1px var(--ge-ring); }
  .ge-pop .ge-color-cell > span:not([class*="doc-text-"]) { color: var(--ge-tx); }
  /* A block's background swatch shows the block's fill, not the words' deeper one the kit gives a span. */
  .ge-pop .ge-color-cell > span[class*="doc-highlight-"] { background: var(--doc-fill); }
  .ge-pop .ge-color-cell:hover > span, .ge-pop .ge-color-cell[data-active] > span { box-shadow: inset 0 0 0 2px var(--ge-ring); }
  .ge-pop .ge-color-cell[aria-current="true"] > span { box-shadow: inset 0 0 0 2px var(--ge-ring-strong); }
  ${Object.entries(RINGS).map(([name, [light, dark, strong, strongDark]]) => `.ge-pop .ge-color-cell[data-ring="${name}"] { --ge-ring: light-dark(${light}, ${dark}); --ge-ring-strong: light-dark(${strong}, ${strongDark}); }`).join("\n  ")}
`;

/** The 颜色 row's icon: a letter over a stroke. */
export const COLOR_ICON = svg('<path d="m6.25 12.75 3.75-9.5 3.75 9.5M7.6 9.25h4.8"/><path d="M4 16.25h12" stroke-width="2"/>');

/** How wide 颜色 › is: five swatches and their room. */
export const COLOR_WIDTH = 5 * 30 + 4 * 4 + 2 * 11;

let lastUsed = null; // { kind, color }: the color given last on this page, kept only while it stays open

const NAMES = Object.fromEntries(COLORS);
const nameOf = (kind, color) => t("{0}{1}", color ? NAMES[color] : t("默认"), kind === "text" ? t("文本") : t("背景")); // two words: one in Chinese, two in English

/**
 * The items of 颜色 › for `targets` (blocks that take a color): grids of swatches under their
 * titles, for `families` ("text", "background"). `look(targets, color)` gives them that color of its
 * family ({ kind, color }, color null for none of it); `close()` closes the menu (a swatch does its
 * own work, as a grid's cells do: menu.mjs). `recent`: whether 上次使用 shows (a table's cells have
 * none: table/). `defaults`: by family, the color the targets all show with none
 * of it (a callout's background: "blue", registry.mjs COLOR_DEFAULTS), which stands for none.
 */
export function colorItems(targets, look, close = () => {}, { recent = true, families = ["text", "background"], defaults = {} } = {}) {
  addStyle(STYLE);
  // Each family's color the targets share (null: none of it), or undefined when they differ; a
  // target with none of a family that has a default shows that one.
  const colors = targets.map(blockColorsOf).map((each) => Object.fromEntries(Object.entries(each).map(([kind, color]) => [kind, color ?? defaults[kind] ?? null])));
  const shared = (kind) => (colors.every((each) => each[kind] === colors[0][kind]) ? colors[0][kind] : undefined);
  const cell = (kind, color) => {
    const value = { kind, color };
    const current = shared(kind) === color;
    const name = nameOf(kind, color);
    const node = element("button", { type: "button", class: "ge-color-cell", "aria-label": name, "aria-current": String(current), "data-ring": color ?? "default" });
    node.append(element("span", { class: color ? (kind === "text" ? textClass(color) : backgroundClass(color)) : "", text: kind === "text" ? "A" : "" }));
    node.passed = current; // the keys pass over it (menu.mjs move), as they did a checked row
    node.addEventListener("mousedown", (event) => event.preventDefault());
    node.addEventListener("click", () => {
      close();
      if (current) return;
      if (color) lastUsed = value;
      look(targets, color && color === defaults[kind] ? { kind, color: null } : value);
    });
    tooltip(node, current ? t("{0}（当前）", name) : name);
    return node;
  };
  const grid = (cells) => {
    const node = element("div", { class: "ge-color-grid", role: "group" }, ...cells);
    return { node, cells, columns: 5 };
  };
  const items = [];
  if (recent && lastUsed && families.includes(lastUsed.kind)) items.push({ title: t("上次使用") }, grid([cell(lastUsed.kind, lastUsed.color)]));
  // A family's 默认, unless one of the nine is its default.
  const all = (kind) => [...(defaults[kind] ? [] : [cell(kind, null)]), ...COLORS.map(([color]) => cell(kind, color))];
  if (families.includes("text")) items.push({ title: t("文本颜色") }, grid(all("text")));
  if (families.includes("background")) items.push({ title: t("背景颜色") }, grid(all("background")));
  return items;
}
