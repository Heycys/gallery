import { COLORS as SHARED_COLORS } from "../../shared/colors.mjs";
import { t } from "../../shared/i18n/index.mjs";

// A block's colors (颜色, the block menu's: the families a component says it takes, `colors` in
// registry.mjs, are its class switches): its text in one of the nine colors (doc-text-<color>)
// and a background behind the whole block (doc-highlight-<color>), one of each family at most,
// so a text block may have both, a text color and a background (the user's rule). A table cell has
// one of the eighteen, `only`. The classes are the kit's
// (src/render/kit/styles/base.css: the same as the selection toolbar's for text; a block's
// background has room around its text, flow.css).

// What the reader calls each color in the UI's language (src/shared/colors.mjs `label`: its Chinese).
const LABELS = { gray: t("灰色"), brown: t("棕色"), orange: t("橙色"), yellow: t("黄色"), green: t("绿色"), blue: t("蓝色"), purple: t("紫色"), pink: t("粉色"), red: t("红色") };

/** The nine colors, in their order, with their names (src/shared/colors.mjs, in the UI's language). */
export const COLORS = SHARED_COLORS.map(({ name, label }) => [name, LABELS[name] ?? label]);

export const textClass = (color) => `doc-text-${color}`;
export const backgroundClass = (color) => `doc-highlight-${color}`;

/** The classes of each family of colors, by its name: "text" and "background". */
export const COLOR_CLASSES = { text: COLORS.map(([color]) => textClass(color)), background: COLORS.map(([color]) => backgroundClass(color)) };

/** Every class a block's color may be. */
export const BLOCK_COLORS = [...COLOR_CLASSES.text, ...COLOR_CLASSES.background];

const classOf = (kind, color) => (kind === "text" ? textClass(color) : backgroundClass(color));

/** A block's colors: { text, background }, each a color's name or null (none). */
export function blockColorsOf(element) {
  const of = (kind) => COLORS.find(([color]) => element.classList.contains(classOf(kind, color)))?.[0] ?? null;
  return { text: of("text"), background: of("background") };
}

/** A table cell's one color: { kind, color } or null (none). */
export function cellColorOf(element) {
  const { text, background } = blockColorsOf(element);
  return text ? { kind: "text", color: text } : background ? { kind: "background", color: background } : null;
}

/**
 * The class switches that give a block color `color` of family `kind` ({ kind, color }; color null:
 * none of that family), the other family's as it is; `only` (a table cell): no other color at all.
 * As a look change: { classes }.
 */
export function colorLook({ kind, color }, { only = false } = {}) {
  const classes = Object.fromEntries((only ? BLOCK_COLORS : COLOR_CLASSES[kind]).map((name) => [name, false]));
  if (color) classes[classOf(kind, color)] = true;
  return { classes };
}
