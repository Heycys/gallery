/* The icon picker's 图标 tab: two open-source sets of the same 443 things, MingCute and Tabler, and Tabler's 40 numbers,
 * in 12 categories (src/shared/emoji/glyphs.mjs).
 *   Groups: 最近 (with no filter, once icons were picked: 2 × 12 at most), then the 12 categories (数字与符号 … 品牌与娱乐,
 *     in the order of icons.json), each titled as the 表情符号 tab's groups are (styles.mjs); with a filter, one flat list,
 *     or 无结果. 12 a row; no bar of groups below, the list taking the whole height. 数字与符号 holds the pairs first, then
 *     Tabler's 40 numbers, each shape's (circle, square, rounded square, hexagon) 0–9 a row of its own.
 *   A cell: 32×32, its icon 24 (inline SVG, ./glyph-html.mjs); its tip the Chinese name and the name in the set.
 *   The set: MingCute unless the reader switched. The button left of 随机 names the set shown; a click changes each cell
 *     in place to its pair's icon of the other set (where the list is scrolled to, the filter and the focus stay, for
 *     comparing), and again back; the choice is kept in this browser. Numbers only Tabler has: they stay as they are,
 *     their tip names Tabler, and picked they are always Tabler's value.
 *   The color (getIconColor): once set, an icon goes in in it and the cells show it; while unset (每次先选颜色) the cells
 *     are the default gray and a click first opens the ten colors (two rows of 5, right under the cell).
 *   The button at the right: the icon color, 28×28 with no frame, a circle drawn and filled in the color (unset: a light
 *     gray line round --ge-ico3); its menu 160 wide, two rows of swatches (26×26, rounded 6, faded while no color is set)
 *     and under a line the switch 每次先选颜色 (on: the calm control blue, --ge-control-blue, as every switch).
 *   随机: an icon of any category in the set shown, in the color set or else any; picked without closing the picker.
 * An icon picked is kept among the recent (by pair, for both sets); its value is `/icons/<name>_<color>.svg` (MingCute) or
 * `/icons/tabler/<name>_<color>.svg` (Tabler, a number always).
 * createIconTab(env) → { el, left, right, load(), render(filter), move(key), activateFocused(), random() }
 */
import { esc } from './support.mjs';
import { hoverTooltip, hideTooltip } from './support.mjs';
import { glyphHTML, glyphName, themeMode } from './glyph-html.mjs';
import {
  loadGlyphs, glyphsLoaded, allPairs, glyphCategories, pairOf, onlySetOf, pairValue, searchGlyphs, randomGlyph, getGlyphSet, setGlyphSet, GLYPH_SET_NAMES,
  getIconColor, setIconColor, recentGlyphs, recordGlyphUse, ICON_COLOR_NAMES, ICON_COLOR_BY_THEME,
} from '../../../shared/emoji/glyphs.mjs';
import { GLYPH_SETS, ICON_COLORS } from '../../../shared/emoji/icon-value.mjs';
import { createGridFocus } from './grid.mjs';
import { PER_ROW } from './emoji-tab.mjs';
import { language, t } from "../../../shared/i18n/index.mjs";

const MAX_RECENT = 2 * 12;   // two rows of the grid
// The ten colors' names (glyphs.mjs ICON_COLOR_NAMES: its Chinese) in the language in use.
const COLOR_WORDS = { gray: t("默认"), lightgray: t("浅灰色"), brown: t("棕色"), yellow: t("黄色"), orange: t("橙色"), green: t("绿色"), blue: t("蓝色"), purple: t("紫色"), pink: t("粉色"), red: t("红色") };
const colorWord = (color) => COLOR_WORDS[color] ?? ICON_COLOR_NAMES[color];
const theme = themeMode; // the report's theme (glyph-html.mjs)
const CIRCLE_16 = '<circle cx="8" cy="8" r="6.1"/>';
const CIRCLE_20 = '<circle cx="10" cy="10" r="7.6"/>';
// The categories' titles, by their names as icons.json has them (Chinese), in the language in use:
// each written out for t() (and en.mjs). A category not here shows its name as it is.
const CATEGORY_TITLES = {
  数字与符号: t("数字与符号"), 办公与学习: t("办公与学习"), 界面与操作: t("界面与操作"), 箭头与导航: t("箭头与导航"),
  设计与影音: t("设计与影音"), 设备与科技: t("设备与科技"), 沟通与表情: t("沟通与表情"), 交通与建筑: t("交通与建筑"),
  自然与天气: t("自然与天气"), 生活与消费: t("生活与消费"), 健康与运动: t("健康与运动"), 品牌与娱乐: t("品牌与娱乐"),
};

// A section's keys as rows of PER_ROW: a category's pairs, then each series of the icons one set has
// alone (a name but its last word: circle-number-0…9) on rows of its own, so 0–9 of a shape read as one
// row; recent icons and a search's, PER_ROW a row as they come.
function rowsOf(keys, bySeries) {
  const runs = [];
  let last = null;
  for (const key of keys) {
    const pair = pairOf(key), only = onlySetOf(pair);
    const series = bySeries && only ? pair.names[only].replace(/-[^-]+$/, '') : '';
    if (!runs.length || series !== last) runs.push([]);
    runs[runs.length - 1].push(key);
    last = series;
  }
  return runs.flatMap(run => Array.from({ length: Math.ceil(run.length / PER_ROW) }, (_, i) => run.slice(i * PER_ROW, (i + 1) * PER_ROW)));
}

export function createIconTab(env) {
  const el = document.createElement('div');
  el.className = 'ge-picker-body';
  el.innerHTML = `<div class="ge-picker-scroller ge-picker-icon-scroller vertical"><div role="grid" class="ge-picker-grid ge-picker-icon-grid"></div></div>`;
  const grid = el.querySelector('.ge-picker-grid'), scroller = el.querySelector('.ge-picker-scroller');
  let rows = [];
  const focus = createGridFocus({ scroller, grid, rows: () => rows.map(r => r.length) });

  // Its value in the set shown, or in the one set it has (a number: Tabler's, whichever is shown).
  const insert = (key, color) => { recordGlyphUse(key, MAX_RECENT); env.submit(pairValue(pairOf(key), getGlyphSet(), color)); };

  // A cell's tip: the icon's Chinese name, and its name in the set shown (one only one set has, a
  // number: that set's, named, in either); in English that name alone.
  const tip = (pair, set) => {
    const only = onlySetOf(pair);
    const own = only ? `${GLYPH_SET_NAMES[only]} ${pair.names[only]}` : pair.names[set];
    return language === "en" ? own : `${pair.label}（${own}）`;
  };
  const cellHTML = (key, color, r, c) => {
    const pair = pairOf(key), set = getGlyphSet();
    return `<div role="gridcell" class="ge-picker-cell ge-picker-icon-cell" data-icon="${esc(key)}" data-r="${r}" data-c="${c}" aria-label="${esc(`${tip(pair, set)} ${color}`)}" data-tip="${esc(tip(pair, set))}">${glyphHTML(pair, set, color, { size: 24 })}</div>`;
  };

  function render(filter) {
    if (!glyphsLoaded()) { grid.innerHTML = ''; rows = []; return; }
    const color = getIconColor() ?? 'gray';
    const q = filter.trim() ? filter : '';
    const sections = q
      ? [{ keys: searchGlyphs(q) }]
      : [
        { id: 'recent', title: t("最近"), keys: recentGlyphs().filter(k => pairOf(k)) },
        ...glyphCategories().map((name, at) => ({ id: String(at), title: CATEGORY_TITLES[name] ?? name, keys: allPairs().filter(p => p.category === name).map(p => p.key), bySeries: true })),
      ];
    rows = [];
    let html = '';
    for (const s of sections) {
      if (!s.keys.length) continue;
      html += `<div class="ge-picker-section"${s.id ? ` data-section="${s.id}"` : ''}>${s.title ? `<div class="ge-picker-section-title"><div class="ge-picker-section-title-text">${esc(s.title)}</div></div>` : ''}<div class="ge-picker-rows">`;
      for (const row of rowsOf(s.keys, s.bySeries)) {
        const r = rows.length;
        rows.push(row);
        html += `<div role="row" class="ge-picker-row">${row.map((k, c) => cellHTML(k, color, r, c)).join('')}</div>`;
      }
      html += '</div></div>';
    }
    grid.innerHTML = html || `<div class="ge-picker-empty"><div class="ge-picker-empty-caption"><div>${t("无结果")}</div></div></div>`;
    scroller.scrollTop = 0;
    focus.reset();
  }

  // The other set, in place: each cell's icon becomes its pair's of that set; where the grid is
  // scrolled to, the filter and the key focus stay. An icon one set has alone (a number) stays as it is.
  function swapSet() {
    env.closeSub();
    hideTooltip();
    setGlyphSet(GLYPH_SETS.find(each => each !== getGlyphSet()));
    const set = getGlyphSet(), color = getIconColor() ?? 'gray';
    for (const cell of grid.querySelectorAll('.ge-picker-cell[data-icon]')) {
      const pair = pairOf(cell.dataset.icon);
      if (onlySetOf(pair)) continue;
      cell.innerHTML = glyphHTML(pair, set, color, { size: 24 });
      cell.dataset.tip = tip(pair, set);
      cell.setAttribute('aria-label', `${tip(pair, set)} ${color}`);
    }
    paintSet();
  }

  /* An icon clicked: in the color set, or, with none set, the ten colors first (two rows of 5) */
  function activate(cell) {
    const key = cell.dataset.icon, color = getIconColor(), pair = pairOf(key), set = getGlyphSet();
    if (color) return insert(key, color);
    const pop = document.createElement('div');
    pop.className = 'ge-picker-icon-variations';
    pop.innerHTML = [ICON_COLORS.slice(0, 5), ICON_COLORS.slice(5)].map((row, r) =>
      `<div role="row" class="ge-picker-icon-variations-row">${row.map((c, i) => `<div role="gridcell" class="ge-picker-cell ge-picker-icon-cell${r === 0 && i === 0 ? ' focused' : ''}" data-color="${c}" data-i="${r * 5 + i}" aria-label="${esc(`${glyphName(pair, set)} ${c}`)}">${glyphHTML(pair, set, c, { size: 24 })}</div>`).join('')}</div>`).join('');
    const cells = [...pop.querySelectorAll('.ge-picker-cell')];
    let at = 0;
    const focusAt = i => { cells[at]?.classList.remove('focused'); at = Math.max(0, Math.min(cells.length - 1, i)); cells[at].classList.add('focused'); };
    pop.addEventListener('mouseover', e => { const c = e.target.closest('.ge-picker-cell'); if (c) focusAt(Number(c.dataset.i)); });
    pop.addEventListener('click', e => { const c = e.target.closest('.ge-picker-cell'); if (c) { env.closeSub(); insert(key, c.dataset.color); } });
    env.openSub(cell, pop, e => {
      const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 5, ArrowUp: -5 }[e.key];
      if (step) { e.preventDefault(); focusAt(at + step); }
      else if (e.key === 'Enter') { e.preventDefault(); env.closeSub(); insert(key, cells[at].dataset.color); }
      else if (e.key === 'Escape') { e.preventDefault(); env.closeSub(); }
    }, { gap: 0 });
  }
  grid.addEventListener('click', e => {
    const cell = e.target.closest('.ge-picker-cell');
    if (cell) { hideTooltip(); activate(cell); }
  });

  /* Left of 随机: the set shown, a click the other one (in place). */
  const left = document.createElement('div');
  left.className = 'ge-picker-set-wrap';
  left.innerHTML = `<div role="button" tabindex="0" class="ge-picker-set-toggle" data-act="glyph-set"></div>`;
  const setBtn = left.firstElementChild;
  function paintSet() {
    const set = getGlyphSet(), other = GLYPH_SETS.find(each => each !== set);
    setBtn.textContent = GLYPH_SET_NAMES[set];
    setBtn.dataset.set = set;
    setBtn.setAttribute('aria-label', t("图标：{0}，切换为 {1}", GLYPH_SET_NAMES[set], GLYPH_SET_NAMES[other]));
    setBtn.setAttribute('aria-pressed', String(set !== GLYPH_SETS[0]));
  }
  paintSet();
  hoverTooltip(setBtn, () => t("切换为 {0} 图标", GLYPH_SET_NAMES[GLYPH_SETS.find(each => each !== getGlyphSet())]), { placement: 'bottom' });
  setBtn.addEventListener('click', swapSet);

  /* The icon color button and its menu */
  const right = document.createElement('div');
  right.className = 'ge-picker-skin-wrap';
  right.innerHTML = `<div role="button" tabindex="0" class="ge-picker-color-button" data-act="icon-color" aria-haspopup="dialog"></div>`;
  const colorBtn = right.firstElementChild;
  function paintColor() {
    const color = getIconColor(), values = ICON_COLOR_BY_THEME[theme()];
    colorBtn.setAttribute('aria-label', color ? t("图标颜色：{0}", colorWord(color)) : t("图标颜色：每次先选"));
    colorBtn.innerHTML = `<svg viewBox="0 0 16 16" aria-hidden="true" style="width:14px;height:14px;display:block;stroke:${color ? values[color] : values.lightgray};fill:${color ? values[color] : 'var(--ge-ico3)'}">${CIRCLE_16}</svg>`;
  }
  paintColor();
  hoverTooltip(colorBtn, t("选择图标颜色"), { placement: 'bottom' });
  colorBtn.addEventListener('click', () => { hideTooltip(); openColorMenu(); });

  function openColorMenu() {
    const color = getIconColor(), values = ICON_COLOR_BY_THEME[theme()];
    const menu = document.createElement('div');
    menu.className = 'ge-picker-color-menu';
    const swatch = c => `<div role="gridcell" class="ge-picker-color-swatch${c === color ? ' selected' : ''}" data-color="${c}" aria-label="${colorWord(c)}">` +
      `<svg viewBox="0 0 20 20" aria-hidden="true" style="width:20px;height:20px;stroke:${values[c]};fill:${values[c]}">${CIRCLE_20}</svg></div>`;
    menu.innerHTML =
      [ICON_COLORS.slice(0, 5), ICON_COLORS.slice(5)].map(row => `<div role="row" class="ge-picker-color-row${color === undefined ? ' dim' : ''}">${row.map(swatch).join('')}</div>`).join('') +
      `<div role="row" class="ge-picker-color-ask"><div role="gridcell" class="ge-picker-color-ask-item" data-act="ask"><div class="ge-picker-color-ask-label">${t("每次先选颜色")}</div>` +
      `<div class="ge-picker-switch${color === undefined ? ' on' : ''}"><div class="ge-picker-switch-knob"></div></div></div></div>`;
    menu.addEventListener('click', e => {
      const sw = e.target.closest('.ge-picker-color-swatch');
      if (sw) { setIconColor(sw.dataset.color); env.closeSub(); paintColor(); render(env.filter()); return; }
      if (e.target.closest('[data-act="ask"]')) {
        setIconColor(getIconColor() !== undefined ? undefined : 'gray');   // a color set: cleared (每次先选颜色 on); none: the default gray (off)
        env.closeSub(); paintColor(); render(env.filter());
      }
    });
    env.openSub(colorBtn, menu, e => { if (e.key === 'Escape') { e.preventDefault(); env.closeSub(); } }, { gap: 4 });
  }

  return {
    el, left, right,
    load: loadGlyphs,
    render,
    move: key => focus.move(key),
    activateFocused() { const cell = focus.focused(); if (cell) activate(cell); },
    random: () => env.keepOpenPick(randomGlyph()),
    destroy: () => focus.destroy(),
  };
}
