import { COLORS } from "../../components/colors.mjs";
import { HIGHLIGHTS, TEXT_COLORS } from "../marks.mjs";
import { recentList } from "../storage.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// The format bar's colors: their names, the rings of their swatches and the
// colors used recently (最近使用), remembered in localStorage so they survive the reload after a save.
// A color is { family: "text" | "highlight", value: a color name, or null for the default }.

const NAMES = Object.fromEntries(COLORS);

/** What the reader calls a color: "红色文本", "黄色背景", "默认文本", "默认背景". */
export const colorName = (family, value) => t("{0}{1}", value ? NAMES[value] : t("默认"), family === "text" ? t("文本") : t("背景")); // two words: one in Chinese, two in English

/** What the reader calls an underline: "下划线" (red, 2px), "蓝色粗下划线", "文字色细下划线". */
export const lineName = ({ color, weight }) => t("{0}{1}下划线", color === "default" ? "" : color === "plain" ? t("文字色") : NAMES[color], { thin: t("细"), thick: t("粗") }[weight] ?? "").replace(/\s+/g, " ").trim();

/** Each swatch's ring and, when it is the selection's, its strong ring (src/shared/colors.mjs, a database's swatches too). */
export { RINGS } from "../../../shared/colors.mjs";

const RECENT = "gallery-edit:recent-colors";
const known = ({ family, value } = {}) => (family === "text" || family === "highlight") && (value === null || (family === "text" ? TEXT_COLORS : HIGHLIGHTS).includes(value));

// The recent colors start with a yellow background (a highlighter).
const recent = recentList(RECENT, {
  max: 5, valid: known, same: (a, b) => a.family === b.family && a.value === b.value, fallback: [{ family: "highlight", value: "yellow" }],
});

/** The colors used recently, the last first (at most five). */
export const recentColors = () => recent.read().map((color) => ({ ...color }));

/** A color picked: it becomes the first of the recent colors. */
export function useColor(family, value) {
  recent.use({ family, value });
}
