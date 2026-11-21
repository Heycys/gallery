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

/** Each swatch's ring and, when it is the selection's, its strong ring (light, dark). */
export const RINGS = {
  default: ["rgb(28 19 1 / 11%)", "rgb(255 255 235 / 10%)", "#2c2c2b", "#5f5e59"],
  gray: ["rgb(28 19 1 / 11%)", "rgb(255 255 235 / 10%)", "#d4d3cf", "#5f5e59"],
  brown: ["rgb(127 51 0 / 15.7%)", "rgb(255 177 129 / 19.2%)", "#e0cdc0", "#6d5340"],
  orange: ["rgb(196 88 0 / 20.4%)", "rgb(255 147 75 / 28%)", "#eaccb2", "#88522f"],
  yellow: ["rgb(209 156 0 / 28.2%)", "rgb(255 205 75 / 24%)", "#e8d497", "#836426"],
  green: ["rgb(0 96 38 / 15.7%)", "rgb(108 255 172 / 15.7%)", "#bed9c9", "#37674c"],
  blue: ["rgb(0 118 217 / 20.4%)", "rgb(67 155 255 / 24%)", "#b6d4f3", "#355f8b"],
  purple: ["rgb(92 0 163 / 14%)", "rgb(200 125 255 / 20%)", "#dbc8e8", "#674d7b"],
  pink: ["rgb(183 0 78 / 15.3%)", "rgb(255 103 177 / 23%)", "#eac4d5", "#7b4760"],
  red: ["rgb(206 24 0 / 16.5%)", "rgb(255 104 92 / 24%)", "#f0c5be", "#924943"],
};

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
