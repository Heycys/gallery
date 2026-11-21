import { GLYPH_SETS, ICON_COLORS, ICON_COLOR_VALUES, glyphOf, glyphValue } from "./icon-value.mjs";
import { KEYS } from "../renamed-storage.mjs";

/* The 图标 tab's icons (glyphs): two open-source sets of filled icons, MingCute Core Filled
 * (Apache-2.0) and Tabler Filled (MIT), as the 443 pairs of icons both have for one thing, and
 * Tabler's 40 numbers (0–9 in four shapes), which MingCute has no series of (data/icons.json, made
 * by src/cli/import-icons.mjs), each in one of 12 categories. The tab shows one set (MingCute unless
 * the reader switched to Tabler: kept in this browser), each pair in the same place in either, so
 * the switch compares them in place; an icon only one set has (a number) is that set's in either.
 * Shared by the page editor (the icon picker, the page's icon) and the workbench;
 * src/render/emoji.mjs reads the same data for the preview and an export.
 *   A glyph's value: `/icons/<name>_<color>.svg` (MingCute's) or `/icons/tabler/<name>_<color>.svg`
 *   (icon-value.mjs glyphOf, glyphValue): a number is always Tabler's.
 *   Colors (the ten of icon-value.mjs, the one chosen kept in this browser): set once, an icon goes in in it; not
 *   set ("每次先选颜色"), a click on an icon asks for one first. Recent: at most 2 × 12 icons, by pair.
 *   Search: an icon's Chinese name, both sets' names (and each name's words, split at "-") and its
 *   search words (the list's, English; the numbers' Chinese too; a name it had before), best first:
 *   the Chinese name equal (100) > it begins with the filter (80) > a set's name or a word of it
 *   equal (50) > the Chinese name holds it (40) > a set's name or word begins with it (30) > a search
 *   word equal (20) > one begins with it (10) > one holds it (5, Chinese filters alone: an English
 *   word inside another, "art" in "start", is no match); among equals, the tab's order.
 *   Random: any icon of the tab, in the set shown (a number: Tabler's), in the color set (or any one).
 * The data is fetched (the page editor's modules are served unbundled); the settings, the recent
 * pairs and the set shown are this browser's (localStorage). */

/* The ten colors' names in Chinese (the picker says them in the UI's language: icon-tab.mjs COLOR_WORDS) */
export const ICON_COLOR_NAMES = { gray: '默认', lightgray: '浅灰色', brown: '棕色', yellow: '黄色', orange: '橙色', green: '绿色', blue: '蓝色', purple: '紫色', pink: '粉色', red: '红色' };
/* The color button's and swatches' values (an icon's fill too), by theme: from icon-value.mjs's one table. */
export const ICON_COLOR_BY_THEME = {
  light: Object.fromEntries(ICON_COLORS.map(color => [color, ICON_COLOR_VALUES[color][0]])),
  dark: Object.fromEntries(ICON_COLORS.map(color => [color, ICON_COLOR_VALUES[color][1]])),
};
/** The sets' names as the tab shows them. */
export const GLYPH_SET_NAMES = { mingcute: 'MingCute', tabler: 'Tabler' };
const COLOR_KEY = KEYS.iconColor, RECENT_KEY = KEYS.recentGlyphs, SET_KEY = KEYS.glyphSet;

// An icon of the tab (a pair, or a number only Tabler has): { key (its MingCute name; one of
// Tabler's alone `tabler/<name>`), label (its Chinese name), names: { mingcute, tabler } and svg
// (each undefined for a set that has it not), category (its name, Chinese), words (its search words) }.
const state = { loaded: false, pairs: [], categories: [], byKey: new Map(), byName: new Map() };
let loading = null;

export function loadGlyphs() {
  loading ??= fetch(new URL('./data/icons.json', import.meta.url).href).then(response => {
    if (!response.ok) throw new Error(`icons.json: ${response.status}`);
    return response.json();
  }).then(data => {
    state.categories = data.categories;
    for (const [label, mingcute, tabler, mingcuteSvg, tablerSvg, category, words] of data.icons) {
      const pair = {
        key: mingcute ?? `tabler/${tabler}`, label, names: { mingcute: mingcute ?? undefined, tabler }, svg: { mingcute: mingcuteSvg ?? undefined, tabler: tablerSvg },
        category: data.categories[category], words: (words ?? []).flatMap(word => [word, ...(/\s/.test(word) ? word.split(/\s+/) : [])]),
      };
      state.pairs.push(pair);
      state.byKey.set(pair.key, pair);
      for (const set of GLYPH_SETS) if (pair.names[set]) state.byName.set(`${set}/${pair.names[set]}`, pair);
    }
    state.loaded = true;
  });
  return loading;
}
export const glyphsLoaded = () => state.loaded;
/** Every icon of the tab, in its order: by category, each's pairs, then its icons of one set alone. */
export const allPairs = () => state.pairs;
/** The categories' names (Chinese), in the tab's order. */
export const glyphCategories = () => state.categories;
export const pairOf = key => state.byKey.get(key);
/** The set `pair` is drawn in when the tab shows `set`: that one, or the one set it has (a number: Tabler). */
export const glyphSetOf = (pair, set) => (pair.svg[set] ? set : GLYPH_SETS.find(each => pair.svg[each]));
/** The one set `pair` is of when only one has it (a number: "tabler"), else null (a pair). */
export const onlySetOf = pair => { const sets = GLYPH_SETS.filter(set => pair.svg[set]); return sets.length === 1 ? sets[0] : null; };
/** The value of `pair`'s icon of `set` (or of the one set it has) in `color`. */
export const pairValue = (pair, set, color) => { const shown = glyphSetOf(pair, set); return glyphValue(shown, pair.names[shown], color); };
/** The pair a glyph's value is of, or undefined (none, or the data not loaded yet). */
export function pairOfValue(value) {
  const glyph = glyphOf(value);
  return glyph ? state.byName.get(`${glyph.set}/${glyph.name}`) : undefined;
}
export const isGlyph = value => glyphOf(value) !== null;

/** A pair's icon of `set` (or of the one set it has) drawn in `color` for theme `mode` ("light", "dark"), its SVG text. */
export const glyphSVG = (pair, set, color, mode) => pair.svg[glyphSetOf(pair, set)].split('#COLOR').join(ICON_COLOR_BY_THEME[mode][color] ?? ICON_COLOR_BY_THEME[mode].gray);
/** A glyph's SVG text drawn in the color of where it stands (currentColor), or null. */
export function glyphSVGOf(value) {
  const glyph = glyphOf(value), pair = pairOfValue(value);
  return pair ? pair.svg[glyph.set].split('#COLOR').join('currentColor') : null;
}

/* Search: the icons' keys, best first (the scores above; a stable sort keeps the tab's order among equals). */
export function searchGlyphs(filter) {
  const q = filter.trim().toLowerCase();
  if (!q) return [];
  const chinese = /[^\x00-\x7f]/.test(q);
  const hits = [];
  for (const pair of state.pairs) {
    const label = pair.label.toLowerCase();
    const names = [...new Set(GLYPH_SETS.flatMap(set => pair.names[set] ? [pair.names[set], ...pair.names[set].split('-')] : []))];
    const score = label === q ? 100 : label.startsWith(q) ? 80 : names.includes(q) ? 50 : label.includes(q) ? 40
      : names.some(w => w.startsWith(q)) ? 30 : pair.words.includes(q) ? 20 : pair.words.some(w => w.startsWith(q)) ? 10
      : chinese && pair.words.some(w => w.includes(q)) ? 5 : 0;
    if (score) hits.push([score, pair.key]);
  }
  return hits.sort((a, b) => b[0] - a[0]).map(h => h[1]);
}

/* ---------- settings, the recent pairs and the set shown ---------- */
const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* for this session only */ } };

let iconColor = read(COLOR_KEY) ?? undefined;
export const getIconColor = () => iconColor;
/* undefined = 每次先选颜色 */
export function setIconColor(color) {
  iconColor = color;
  write(COLOR_KEY, color === undefined ? null : color);
}

let set = GLYPH_SETS.includes(read(SET_KEY)) ? read(SET_KEY) : GLYPH_SETS[0];
/** The set the tab shows: "mingcute" (the default) or "tabler". */
export const getGlyphSet = () => set;
export function setGlyphSet(next) {
  set = GLYPH_SETS.includes(next) ? next : GLYPH_SETS[0];
  write(SET_KEY, set === GLYPH_SETS[0] ? null : set);
}

let recent = (() => { try { return JSON.parse(read(RECENT_KEY) || '[]'); } catch { return []; } })();
export const recentGlyphs = () => recent;
export function recordGlyphUse(key, max) {
  recent = [key, ...recent.filter(k => k !== key)].slice(0, max); // first, once
  write(RECENT_KEY, JSON.stringify(recent));
}

const pickOne = list => list[Math.floor(Math.random() * list.length)];
export const randomGlyph = () => pairValue(pickOne(state.pairs), set, iconColor ?? pickOne(ICON_COLORS));
