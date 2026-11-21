/* The icon picker's 表情符号 tab.
 *   Groups: 最近 (while the filter is empty), 推荐 (opened from a highlight block or a flow step: Gallery's 24), then the data's groups
 *     in the Unicode order (src/shared/emoji/data/categories.json: 笑脸与人物, 动物与自然, 食物与饮料, 旅行与地点, 活动, 物品, 符号;
 *     no flag: the owner's decision), then 自定义 (the workspace's custom emojis by name, the round "添加自定义表情" plus first).
 *   12 a row ((408 − 24) / 32); a group's title 12px / 500, 28 high, sticking to the list's top as it scrolls; a cell 32×32,
 *     6 round, its emoji 24 (a Twemoji picture: src/shared/emoji/emoji.mjs).
 *   The filter (rank): an emoji is found by its words in Chinese and English (data.mjs searchWords: its name, its short
 *     codes, its keywords) or, a custom one, by its name. Best first: the filter holding the emoji itself; a word equal to
 *     the filter; a word starting with it; every word of the filter starting one of its words; a word holding it. Among
 *     the first two a word's place counts: its name, then a short code, then a keyword; an English name holding the filter
 *     as words of it counts as a keyword, and goes first among the equal ones (emoji-search.mjs says the ties); between
 *     equal ones Gallery's list of the emojis a document reaches for most decides (src/shared/emoji/everyday.mjs). This
 *     browser's frequently used go first of all. A filter between colons (:fire:) is tried without them too. Over 72 results (12 × 12 / 2,
 *     the plus counted) they stay
 *     in their groups, each best first; fewer, they are one list best first (the plus last); only the plus left, 无结果
 *     and a 添加自定义表情 button.
 *   The bar below: a --ge-line above it, padding 6 12 8; buttons 28×28, icons 18; the group scrolled to has a fill; a
 *     group with no emoji left is faint and not clickable (自定义 and 添加 always are); a tip names the group (below, left
 *     aligned); a click scrolls the group (its title too) to the top, 添加 opens the 添加自定义表情 popup. Hidden while the
 *     results are one list.
 *   最近: the frequently used, by count then the last use, two rows, those the data still knows and custom ones (a flag
 *     used before no longer shows); read once as it opens; an emoji picked counts once (data.mjs recordEmojiUse).
 *   A cell: with no skin tone chosen yet, an emoji with skin tones shows them in a row first (one of five picked keeps the
 *     tone); a custom emoji is its picture, 24×24, its name the tip.
 *   The button at the right: the skin tone, a hand 18 in 28×28 (a Twemoji picture, of the tone chosen; drawn when the data
 *     is in), opening a row of six hands.
 *   随机: one of 旅行与地点, 活动 or 物品, picked without closing the picker.
 *   添加自定义表情: the plus, the bar's button or the 无结果 button opens ./upload.mjs's form below it; saved, the new emoji
 *     goes to env.uploaded (picked, the picker closed).
 * Not a virtual list: every cell is drawn, each picture loaded as it scrolls near (grid.mjs).
 * createEmojiTab(env) → { el, right, load(), render(filter), move(key), activateFocused(), random(), destroy() }
 *   env: { isCallout, pictures, submit(value), keepOpenPick(value), uploaded(value), refocus(), openSub(anchor, el, onKey), closeSub() }
 */
import { esc } from './support.mjs';
import { icon } from './support.mjs';
import { hoverTooltip, hideTooltip } from './support.mjs';
import { openPopup, closePopup } from './support.mjs';
import {
  loadEmojiData, emojiDataLoaded, emojiInfo, emojisInCategory, emojiName, emojiVariations, normalizeFilter, randomEmoji,
  getSkinTone, setSkinTone, withSkinTone, SKIN_TONE_HANDS, SKIN_TONE_VARIATIONS, recordEmojiUse, recentEmojis,
} from '../../../shared/emoji/data.mjs';
import { emojiHTML } from '../../../shared/emoji/emoji.mjs';
import { loadCustomEmojis, customEmojiStrings, customEmojiOf, isCustomEmojiString } from '../../../shared/emoji/custom.mjs';
import { rank } from './emoji-search.mjs';
import { createGridFocus } from './grid.mjs';
import { createUploadForm } from './upload.mjs';
import { t } from "../../../shared/i18n/index.mjs";

export const PER_ROW = 12;                                     // (408 − 24) / 32
const SHOW_CATEGORIES_THRESHOLD = Math.floor(PER_ROW * 12 / 2);   // 72: more results than this stay in their groups
const ADD = '__ADD_CUSTOM_EMOJI__';                             // the plus cell
const ADD_LABEL = t("添加自定义表情");

// The data's groups (categories.json: its keys, in its order, the Unicode groups'), each titled in the product's words.
const GROUPS = [
  { id: 'people', title: t("笑脸与人物"), icon: 'emojiFace' },
  { id: 'nature', title: t("动物与自然"), icon: 'leaf' },
  { id: 'food', title: t("食物与饮料"), icon: 'carrot' },
  { id: 'travel', title: t("旅行与地点"), icon: 'airplane' },
  { id: 'activities', title: t("活动"), icon: 'soccerBall' },
  { id: 'objects', title: t("物品"), icon: 'lightBulbBright' },
  { id: 'symbols', title: t("符号"), icon: 'checkmarkCircle' },
];
const CATEGORIES = [
  { id: 'recent', title: t("最近"), icon: 'clock' },
  { id: 'callout', title: t("推荐") },
  ...GROUPS,
  { id: 'custom', title: t("自定义"), icon: 'squareGrid2X2' },
  { id: 'add', title: ADD_LABEL, icon: 'plusCircle' },
];
const CATEGORY = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
/* 推荐, the group a highlight block or a flow step opens the picker with: two rows of what such a block says, as the
   data writes each (fully qualified). A note, then what is to be done, a time, data, people and a result. */
const CALLOUT_EMOJIS = [
  '💡', '📌', '⚠️', '❗', '✅', '❌', '❓', 'ℹ️', '📝', '🔑', '🎯', '🔥',
  '🚧', '⏰', '📅', '📊', '📈', '🔍', '💬', '📢', '👥', '🛠️', '🚀', '🎉',
];

/* The grid's rows: the groups, each cut into rows of 12. { categorized, rows: [{ id, title?, emojis }] }; only the plus left,
   rows is [{ emojis: [ADD] }]. `pictures` false (where an icon may be no picture: a custom page in the sidebar, a web link, a
   page of another workspace): no 自定义 group, and no custom emoji among the recent. */
function buildRows(rawFilter, isCallout, recent, pictures = true) {
  const cats = [!rawFilter.trim() ? CATEGORY.recent : null, isCallout ? CATEGORY.callout : null, ...GROUPS, pictures ? CATEGORY.custom : null].filter(Boolean);
  const filter = normalizeFilter(rawFilter) ?? '';
  const split = filter.split(' ').filter(Boolean);
  const rows = [];
  let total = 0;
  for (const cat of cats) {
    const source = cat.id === 'recent' ? (pictures ? recent : recent.filter(e => !isCustomEmojiString(e))) : cat.id === 'callout' ? CALLOUT_EMOJIS : cat.id === 'custom' ? customEmojiStrings() : emojisInCategory(cat.id);
    const ranked = source.map(emoji => ({ emoji, rank: rank(emoji, filter, split) })).filter(x => x.rank !== undefined)
      .sort((a, b) => b.rank - a.rank)
      .map(x => ({ rank: x.rank, emoji: withSkinTone(x.emoji) }));
    if (cat.id === 'custom') ranked.unshift({ rank: -Infinity, emoji: ADD });   // where custom emojis may be added, the plus leads 自定义
    for (let i = 0; i < ranked.length; i += PER_ROW) rows.push({ id: cat.id, title: i === 0 ? cat.title : undefined, emojis: ranked.slice(i, i + PER_ROW) });
    total += ranked.length;
  }
  if (rawFilter === '' || total > SHOW_CATEGORIES_THRESHOLD) return { categorized: true, rows: rows.map(r => ({ ...r, emojis: r.emojis.map(x => x.emoji) })) };
  const flat = [...new Set(rows.flatMap(r => r.emojis).sort((a, b) => b.rank - a.rank).map(x => x.emoji))];
  const out = [];
  for (let i = 0; i < flat.length; i += PER_ROW) out.push({ emojis: flat.slice(i, i + PER_ROW) });
  return { categorized: false, rows: out };
}

/* 一排表情的小浮层（肤色变体、选肤色；padding 4，横向，←→ / 回车 / Esc） */
function emojiRow(env, anchor, emojis, initial, onChoose) {
  const row = document.createElement('div');
  row.className = 'ge-picker-variations';
  row.innerHTML = emojis.map((e, i) => `<div role="gridcell" class="ge-picker-cell${i === initial ? ' focused' : ''}" data-i="${i}">${emojiHTML(e, { size: 24 })}</div>`).join('');
  let at = initial;
  const focusAt = i => { row.children[at]?.classList.remove('focused'); at = i; row.children[at]?.classList.add('focused'); };
  row.addEventListener('mouseover', e => { const c = e.target.closest('.ge-picker-cell'); if (c) focusAt(Number(c.dataset.i)); });
  row.addEventListener('click', e => { const c = e.target.closest('.ge-picker-cell'); if (c) { env.closeSub(); onChoose(emojis[Number(c.dataset.i)], Number(c.dataset.i)); } });
  env.openSub(anchor, row, e => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { e.preventDefault(); focusAt(Math.max(0, Math.min(emojis.length - 1, at + (e.key === 'ArrowRight' ? 1 : -1)))); }
    else if (e.key === 'Enter') { e.preventDefault(); env.closeSub(); onChoose(emojis[at], at); }
    else if (e.key === 'Escape') { e.preventDefault(); env.closeSub(); }
  });
}

/* The 添加自定义表情 popup, below `anchor`, left aligned; saved, onDone(the new emoji's value). */
export function openCustomEmojiPopup(anchor, { onDone, onClose }) {
  hideTooltip();
  const box = document.createElement('div');
  box.className = 'ge-picker-custom-emoji-popup';
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-label', t("添加自定义表情"));
  let popup = null;
  const form = createUploadForm({
    showTitle: true, largeEmoji: false, allowUrlPaste: false, confirmToAdd: false,
    onCancel: () => closePopup(popup),
    onStart: () => closePopup(popup),   // closed as it saves
    onDone,
  });
  box.append(form.el);
  box.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePopup(popup); } });
  popup = openPopup({ origin: anchor.getBoundingClientRect(), placement: 'bottom', align: 'start', content: box, onClose });
  form.focus();
  return popup;
}

export function createEmojiTab(env) {
  const el = document.createElement('div');
  el.className = 'ge-picker-body';
  el.innerHTML = `<div class="ge-picker-scroller vertical"><div role="grid" class="ge-picker-grid"></div></div><div class="ge-picker-categories"></div>`;
  const grid = el.querySelector('.ge-picker-grid'), scroller = el.querySelector('.ge-picker-scroller'), bar = el.querySelector('.ge-picker-categories');
  let recent = null;   // read once, when the data is in (render): not reordered while the picker is open
  let view = { categorized: true, rows: [] }, lastFilter = '', addPopup = null;
  const focus = createGridFocus({ scroller, grid, rows: () => view.rows.map(r => r.emojis.length) });

  /* An emoji picked: counted among the frequently used, handed on (the picker closes) */
  const submit = emoji => { recordEmojiUse(emoji); env.submit(emoji); };

  function cellHTML(emoji, r, c) {
    if (emoji === ADD) {
      return `<div role="gridcell" class="ge-picker-cell ge-picker-add-cell" data-add data-r="${r}" data-c="${c}" aria-label="${ADD_LABEL}">${icon('plusSmall', 16)}</div>`;
    }
    if (isCustomEmojiString(emoji)) {
      const custom = customEmojiOf(emoji);
      const img = custom ? `<img class="ge-custom-emoji" alt="${esc(custom.name)}" src="data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==" data-src="${esc(custom.url)}" draggable="false" style="width:24px;height:24px">` : '';
      return `<div role="gridcell" class="ge-picker-cell" data-emoji="${esc(emoji)}" data-r="${r}" data-c="${c}" aria-label="${esc(custom?.name || '')}">${img}</div>`;
    }
    return `<div role="gridcell" class="ge-picker-cell" data-emoji="${esc(emoji)}" data-r="${r}" data-c="${c}" aria-label="${esc(emojiName(emoji) || '')}">${emojiHTML(emoji, { size: 24, lazy: true })}</div>`;
  }

  function render(filter) {
    lastFilter = filter;
    if (!emojiDataLoaded()) { grid.innerHTML = ''; bar.hidden = true; view = { categorized: true, rows: [] }; return; }   // 数据加载完再画
    if (recent === null) {   // 数据到了：最近（只要还认得的，去掉的旗不再出现）读一次，选肤色的手画成 Twemoji 图
      recent = recentEmojis(PER_ROW, e => isCustomEmojiString(e) || Boolean(emojiInfo(e)));
      paintSkin();
    }
    view = buildRows(filter, env.isCallout, recent, env.pictures !== false);
    const { rows } = view;
    let html = '';
    if (!view.categorized && rows.length === 1 && rows[0].emojis.length === 1 && rows[0].emojis[0] === ADD) {
      // Only the plus left: 无结果 and a 添加自定义表情 button (the one cell the keys reach)
      html = `<div class="ge-picker-empty with-add"><div class="ge-picker-empty-caption"><div>${t("无结果")}</div></div>` +
        `<div role="gridcell" class="ge-picker-cell ge-picker-add-button" data-add data-r="0" data-c="0">${icon('plusSmall', 16)}${ADD_LABEL}</div></div>`;
    } else if (!rows.length) html = `<div class="ge-picker-empty"><div class="ge-picker-empty-caption"><div>${t("无结果")}</div></div></div>`;
    else if (!view.categorized) {
      html = `<div class="ge-picker-section"><div class="ge-picker-rows">${rows.map((row, r) => `<div role="row" class="ge-picker-row">${row.emojis.map((e, c) => cellHTML(e, r, c)).join('')}</div>`).join('')}</div></div>`;
    } else {
      rows.forEach((row, r) => {
        if (row.title) html += `${r ? '</div></div>' : ''}<div class="ge-picker-section" data-section="${row.id}"><div class="ge-picker-section-title"><div class="ge-picker-section-title-text">${esc(row.title)}</div></div><div class="ge-picker-rows">`;
        html += `<div role="row" class="ge-picker-row">${row.emojis.map((e, c) => cellHTML(e, r, c)).join('')}</div>`;
      });
      html += '</div></div>';
    }
    grid.innerHTML = html;
    scroller.scrollTop = 0;
    renderBar();
    focus.reset(!grid.querySelector('.ge-picker-empty'));
    focus.observeImages();
  }

  /* The bar of groups (no 推荐; 自定义 and 添加 always clickable) */
  function renderBar() {
    bar.hidden = !view.categorized || !view.rows.length;
    if (bar.hidden) return;
    const present = new Set(view.rows.map(r => r.id));
    const enabled = c => c.id === 'custom' || c.id === 'add' || present.has(c.id);
    bar.innerHTML = CATEGORIES.filter(c => c.id !== 'callout' && (env.pictures !== false || (c.id !== 'custom' && c.id !== 'add'))).map(c =>
      `<div role="button" tabindex="-1" class="ge-picker-category${enabled(c) ? '' : ' disabled'}" data-category="${c.id}" aria-label="${esc(c.id === 'add' ? c.title : t("转到{0}", c.title))}" aria-pressed="false"${enabled(c) ? '' : ' aria-disabled="true"'}>${icon(c.icon, 18)}</div>`).join('');
    for (const b of bar.children) hoverTooltip(b, CATEGORY[b.dataset.category].title, { placement: 'bottom', align: 'start' });
    updateBarFocus();
  }
  /* 当前滚到的分组：第一行露出来的那一组 */
  function updateBarFocus() {
    if (bar.hidden) return;
    const top = scroller.getBoundingClientRect().top;
    let id = null;
    for (const s of grid.querySelectorAll('.ge-picker-section')) if (s.getBoundingClientRect().bottom > top + 1) { id = s.dataset.section; break; }
    for (const b of bar.children) {
      const on = b.dataset.category === id;
      b.classList.toggle('focused', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }
  scroller.addEventListener('scroll', updateBarFocus, { passive: true });
  bar.addEventListener('click', e => {
    const b = e.target.closest('.ge-picker-category');
    if (!b || b.classList.contains('disabled')) return;
    if (b.dataset.category === 'add') return openAdd(b);
    const s = grid.querySelector(`.ge-picker-section[data-section="${b.dataset.category}"]`);
    if (s) scroller.scrollTop = s.offsetTop;
    updateBarFocus();
  });

  /* The plus, the 无结果 button or the bar's 添加: the 添加自定义表情 popup below it */
  function openAdd(anchor) {
    env.closeSub();
    addPopup = openCustomEmojiPopup(anchor, { onDone: value => env.uploaded(value), onClose: () => { addPopup = null; env.refocus(); } });
  }

  /* A cell clicked. With no skin tone chosen yet, an emoji with skin tones shows them in a row first */
  function activate(cell) {
    if (cell.hasAttribute('data-add')) return openAdd(cell);
    const emoji = cell.dataset.emoji;
    const variations = getSkinTone() === undefined ? emojiVariations(emoji) : [];
    if (!variations.length) return submit(emoji);
    emojiRow(env, cell, [emoji, ...variations], 0, (picked, i) => {
      if (variations.length === SKIN_TONE_VARIATIONS) setSkinTone(i);   // one of five picked: that tone kept
      submit(picked);
    });
  }
  grid.addEventListener('click', e => {
    const cell = e.target.closest('.ge-picker-cell');
    if (cell) { hideTooltip(); activate(cell); }
  });

  /* The skin tone button */
  const right = document.createElement('div');
  right.className = 'ge-picker-skin-wrap';
  right.innerHTML = `<div role="button" tabindex="0" class="ge-picker-skin" data-act="skin"></div>`;
  const skinBtn = right.firstElementChild;
  // The hand as a Twemoji picture (a placeholder of its size until the data is in: render paints it again then).
  function paintSkin() { skinBtn.innerHTML = emojiHTML(SKIN_TONE_HANDS[getSkinTone() ?? 0], { size: 18 }); }
  paintSkin();
  hoverTooltip(skinBtn, t("选择肤色"), { placement: 'bottom' });
  skinBtn.addEventListener('click', () => {
    hideTooltip();
    emojiRow(env, skinBtn, SKIN_TONE_HANDS, getSkinTone() ?? 0, (_, i) => { setSkinTone(i); paintSkin(); render(lastFilter); });
  });

  return {
    el, right,
    load: () => Promise.all([loadEmojiData(), loadCustomEmojis()]),
    render,
    move: key => focus.move(key),
    activateFocused() { const cell = focus.focused(); if (cell) activate(cell); },
    random: () => env.keepOpenPick(randomEmoji()),   // picked without closing the picker, not counted among the frequently used
    destroy: () => { focus.destroy(); if (addPopup && !addPopup.closed) closePopup(addPopup); },
  };
}
