// What a chart view draws (docs/render.md, "Databases: views", the chart view), worked out from the records the
// view shows: no element made here, so that the drawing (views/chart.js) and the unit tests read the same numbers.
// A view's `chart` is the file's { kind, x, agg, y, color? }: `x` the column the records are put in categories by, `agg`
// what each category measures (its records counted, or the sum or the average of the numbers of `y`), `color` what
// it is drawn in (none: each category its option's color, the others in turn; one of the nine: a shade of it each).
import { COLORS } from '../../../../shared/colors.mjs';
import { formatNumber, friendlyDate, getValue, optionOf } from './values.js';
import { groupKeys } from './query.js';
import { language, w } from '../words.js';

/**
 * The categories of `rows` by `xp` with what each measures: [{ raw, key, value }], `raw` the category (an option's id,
 * yes or no, a date as written, words; '' for none), `key` its words, `value` the count, the sum or the average (0 for
 * none) of `yp`'s numbers. A select's or a multi's options in their order, each though no record has it; the others
 * ascending, the records with none last (and left out where they measure 0).
 */
export function chartData(rows, chart, xp, yp, byId) {
  const byKey = new Map();
  if (xp.type === 'select' || xp.type === 'multi') for (const option of xp.options || []) byKey.set(option.id, []);
  for (const row of rows) {
    const value = yp ? getValue(row, yp, byId) : null;
    for (const key of groupKeys(row, xp, byId)) {
      if (!byKey.has(key)) byKey.set(key, []);
      if (chart.agg === 'count') byKey.get(key).push(1);
      else if (typeof value === 'number') byKey.get(key).push(value);
    }
  }
  let out = [...byKey.entries()].map(([raw, values]) => ({
    raw,
    key: raw === '' ? w('无{0}', xp.name) : xp.type === 'select' || xp.type === 'multi' ? optionOf(xp, raw)?.name ?? raw : xp.type === 'checkbox' ? (raw === 'yes' ? w('已勾选') : w('未勾选')) : xp.type === 'date' ? friendlyDate(raw) : raw,
    value: chart.agg === 'count' ? values.length : chart.agg === 'sum' ? values.reduce((a, b) => a + b, 0) : values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0,
  }));
  out = out.filter((each) => !(each.raw === '' && each.value === 0));
  if (!(xp.type === 'select' || xp.type === 'multi')) out.sort((a, b) => (a.raw === '' ? 1 : b.raw === '' ? -1 : a.raw.localeCompare(b.raw, 'zh-CN', { numeric: true })));
  return out;
}

/** A value of the chart as its words say it: a count as it is, a number as `yp`'s format says (an average a decimal more), else two decimals at most. */
export const valueWords = (chart, yp) => (value) => (chart.agg === 'count' ? String(value) : yp?.type === 'number' ? formatNumber(value, yp.numberFormat, chart.agg === 'avg' ? 1 : 0) : String(Math.round(value * 100) / 100));

/** A value on the axis: 1万, 2.5万 (1k in English). */
export const tickWords = (t) => (language() === 'en' ? (t >= 1000 ? `${t / 1000}k` : String(t)) : t >= 10000 ? t / 10000 + w('万') : String(t));

/** An axis from 0 past `max` in about four even steps of 1, 2, 2.5 or 5 times a power of ten. */
export function niceTicks(max) {
  const raw = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((each) => each * mag).find((each) => each >= raw) || mag;
  const out = [];
  for (let t = 0; t <= max + step * 0.999; t += step) out.push(Math.round(t * 1000) / 1000);
  if (out.length < 2) out.push(step);
  return out;
}

/** A donut's slice from angle `a0` to `a1` between radii `r` and `r0`, as an SVG path. */
export function arc(a0, a1, r, r0) {
  if (a1 - a0 >= Math.PI * 2 - 0.01) a1 = a0 + Math.PI * 2 - 0.01;
  const large = a1 - a0 > Math.PI ? 1 : 0;
  const p = (a, rr) => `${Math.cos(a) * rr} ${Math.sin(a) * rr}`;
  return `M ${p(a0, r)} A ${r} ${r} 0 ${large} 1 ${p(a1, r)} L ${p(a1, r0)} A ${r0} ${r0} 0 ${large} 0 ${p(a0, r0)} Z`;
}

/** What a chart can be drawn in (its `chart.color`): 'auto' (written as none) or one of the kit's nine. */
export const CHART_COLORS = ['auto', ...COLORS.map(({ name }) => name)];

/**
 * Where each of `count` categories stands among the shades of one color, from its deepest (0) to its palest (1), the
 * first the deepest: evenly apart over a stretch centred on the middle (0.5), half the way for two, three quarters for
 * three, the whole way for four or more; one alone in the middle.
 */
export function shadeSteps(count) {
  if (count <= 1) return count === 1 ? [0.5] : [];
  const spread = Math.min(1, 0.25 + (count - 1) * 0.25);
  return Array.from({ length: count }, (_, at) => Math.round((0.5 + spread * (at / (count - 1) - 0.5)) * 1000) / 1000);
}

/**
 * The CSS color of the shade at `step` (0 the deepest, 1 the palest: shadeSteps) of color `color` (one of the nine),
 * in light and in dark: between its ink deepened toward black and its ink paled toward white in light; between its
 * ink brightened toward white and its ink dimmed toward the dark page in dark (the palest still clear of the page;
 * no label is drawn on a shade). Null for a name not of the nine.
 */
export function shadeOf(color, step) {
  const family = COLORS.find(({ name }) => name === color);
  if (!family) return null;
  const [light, dark] = family.text;
  const deep = Math.round((1 - Math.min(1, Math.max(0, step))) * 100);
  const mix = (deepest, palest) => (deep >= 100 ? deepest : deep <= 0 ? palest : `color-mix(in oklab, ${deepest} ${deep}%, ${palest})`);
  const lightShade = mix(`color-mix(in oklab, ${light} 88%, #000)`, `color-mix(in oklab, ${light} 40%, #fff)`);
  const darkShade = mix(`color-mix(in oklab, ${dark} 64%, #fff)`, `color-mix(in oklab, ${dark} 62%, #202020)`);
  return `light-dark(${lightShade}, ${darkShade})`;
}
