import { HIGHLIGHTS, TEXT_COLORS, UNDERLINE_COLORS, UNDERLINE_WEIGHTS } from "../marks.mjs";
import { keep, stored } from "../storage.mjs";
import { colorName, lineName } from "./colors.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// The format brush (应用格式, the bar's first button): it remembers the formats last set on a
// selection, and a click puts them on the selected text. What it remembers: bold, italic,
// strikethrough, a text color, a background and an underline with its color and weight (not inline
// code, formulas or links). Formats set on one selection add up (bold, then red: both); the first
// format set on another selection starts over with it. Taking a format off the selection the
// brush remembers takes it out of the brush too; taking formats off other text leaves the brush
// alone. Text the brush was just put on counts as the selection it remembers, so a format set on
// it adds to the brush. Remembered in localStorage, so it survives the reload after a save.
//
// Effects: { bold?: true, italic?: true, strike?: true, text?: color, highlight?: color,
// underline?: { color, weight } } (an underline's facets "default" or a value of that facet).

const KEY = "gallery-edit:format-brush";
const LINE_FACETS = { color: ["default", ...UNDERLINE_COLORS], weight: ["default", ...UNDERLINE_WEIGHTS] };
const valid = (saved) => typeof saved === "object" && saved !== null && !Array.isArray(saved) && Object.entries(saved).every(([facet, value]) => {
  if (facet === "bold" || facet === "italic" || facet === "strike") return value === true;
  if (facet === "text") return TEXT_COLORS.includes(value);
  if (facet === "highlight") return HIGHLIGHTS.includes(value);
  if (facet === "underline") return typeof value === "object" && value !== null && Object.entries(LINE_FACETS).every(([name, values]) => values.includes(value[name]));
  return false;
});

let effects = stored(KEY, {}, valid);
let session = null; // the selection the brush remembers: { host, start, end } (character offsets)

const same = (host, at) => session !== null && session.host === host && session.start === at.start && session.end === at.end;

/**
 * Formats set (or taken off) on the selected text of `host` at `at` ({ start, end }): `touched`
 * maps each format to its value now on the text (false or null: not on it).
 */
export function noteEffects(host, at, touched) {
  const next = same(host, at) ? { ...effects } : {};
  for (const [facet, value] of Object.entries(touched)) {
    if (value === false || value === null) delete next[facet];
    else next[facet] = value;
  }
  if (!same(host, at) && Object.keys(next).length === 0) return; // only formats taken off other text
  effects = next;
  session = { host, start: at.start, end: at.end };
  keep(KEY, effects);
}

/** The brush was put on this text: formats set on it next add to the brush. */
export function brushed(host, at) {
  session = { host, start: at.start, end: at.end };
}

/** What the brush remembers (a copy). */
export const currentEffects = () => JSON.parse(JSON.stringify(effects));

/** The brush as format changes ([[name, value]], marks.mjs formatRange), in a fixed order. */
export function effectChanges(of = effects) {
  const changes = [];
  for (const name of ["bold", "italic", "strike"]) if (of[name]) changes.push([name, true]);
  if (of.text) changes.push(["text", of.text]);
  if (of.highlight) changes.push(["highlight", of.highlight]);
  if (of.underline) changes.push(["underlineColor", of.underline.color], ["underlineWeight", of.underline.weight]);
  return changes;
}

/** What the brush remembers, in words: "加粗、红色文本、蓝色粗下划线", or "" when nothing. */
export function describeEffects(of = effects) {
  const words = [];
  if (of.bold) words.push(t("加粗"));
  if (of.italic) words.push(t("斜体"));
  if (of.strike) words.push(t("删除线"));
  if (of.text) words.push(colorName("text", of.text));
  if (of.highlight) words.push(colorName("highlight", of.highlight));
  if (of.underline) words.push(lineName(of.underline));
  return words.join(t("、"));
}
