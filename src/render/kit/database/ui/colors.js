// An option's color as the drawing paints it: the kit's nine (src/shared/colors.mjs, the same values a
// highlight and a text color take), light and dark, and none of its own. Each is three custom properties
// on the element that wears it: its fill (a board's column, a card), its mark (a pill, a deeper fill for
// words) and its ink (a dot, a bar, words in the color).
import { COLORS, RINGS } from "../../../../shared/colors.mjs";
import { w } from "../words.js";
import { h, setStyles } from "./dom.js";

const pair = ([light, dark]) => `light-dark(${light}, ${dark})`;
const DEFAULT = { "--db-fill": "var(--doc-hover)", "--db-mark": "light-dark(rgb(55 53 47 / 9%), rgb(255 255 255 / 10%))", "--db-ink": "var(--doc-muted)" };
const BY_NAME = Object.fromEntries(COLORS.map(({ name, text, fill, mark }) => [name, { "--db-fill": pair(fill), "--db-mark": pair(mark), "--db-ink": pair(text) }]));

/** The custom properties of color `color`. */
export const colorStyle = (color) => BY_NAME[color ?? ""] ?? DEFAULT;

/** An element worn in color `color`. */
export function paint(node, color) {
  setStyles(node, colorStyle(color));
  return node;
}

/** The colors a chart takes in turn where its categories have none of their own. */
// No brown and no orange: a chart's colors of its own never take them (the user's 2026-11-24: their inks read as
// chocolate in a chart, the dark theme's orange most of all).
export const SEQUENCE = ["blue", "green", "purple", "pink", "yellow", "red", "gray"];
/** The colors a chart draws an option of in another color (views/chart.js). */
export const CHOCOLATE = new Set(["brown", "orange"]);

// A swatch's ring by its color, and its strong ring where it is the one chosen (the editor's color pickers' own).
const RING_BY_NAME = Object.fromEntries(Object.entries(RINGS).map(([name, [light, dark, strong, strongDark]]) => [name, { "--db-ring": `light-dark(${light}, ${dark})`, "--db-ring-strong": `light-dark(${strong}, ${strongDark})` }]));

/**
 * Colors to pick from, drawn as Gallery's color pickers draw theirs (the block menu's 颜色): a swatch each, five to
 * a line, in its color's ring (two pixels under the pointer, the strong ring around the one chosen), its name in a
 * tip. `label(color)` names one, `onPick(color)` picks it. Returns { element, set(color) } (another one chosen).
 */
export function swatches(colors, { value, label, onPick }) {
  const cells = colors.map((color) => {
    const cell = h("button", { type: "button", class: "color-cell", value: color, "aria-label": label(color), on: { click: () => onPick(color) } }, paint(h("span"), color));
    setStyles(cell, RING_BY_NAME[color] ?? RING_BY_NAME.default);
    return cell;
  });
  const set = (chosen) => {
    for (const cell of cells) {
      const on = cell.value === chosen;
      cell.setAttribute("aria-current", String(on));
      cell.setAttribute("data-doc-tip", on ? w("{0}（当前）", label(cell.value)) : label(cell.value));
    }
  };
  set(value);
  return { element: h("div", { class: "color-grid", role: "group" }, cells), set };
}
