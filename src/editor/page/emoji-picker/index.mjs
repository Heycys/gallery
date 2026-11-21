/* The icon picker: a page's icon, a highlight block's or a flow step's, a Sheet tab's, a sidebar row's (icon-frame.mjs).
 *   408 wide; the 表情符号 and 图标 tabs 390 high, the 上传 tab as high as its form.
 *   The tab bar: 6 8, a --ge-line under it; 表情符号, 图标 and 上传 as text tabs, the one shown on a gray block (no line
 *     under it); 移除 at the right end, a gray text button. It opens on 图标 when the icon is one of that tab's, else on
 *     表情符号 (the tab shown is not kept).
 *   The filter row, in the 表情符号 and 图标 tabs only: 8 12 6; the field (a magnifying glass, 筛选…, a clear button while
 *     it holds words; a deeper gray line inside it while focused), 随机 (28×28, no frame) and the tab's own buttons (表情符号:
 *     the skin tone; 图标: the set and the icon color). The two tabs share what is typed.
 *   The 上传 tab (./upload.mjs): an image chosen, dropped or pasted, or an image's link pasted, made the icon by 保存; with
 *     同时存进表情库 checked and a name it is saved as a custom emoji too (listed under 自定义 in 表情符号 from then on).
 *   随机 picks one and leaves the picker open (keepVisible).
 *   Keys: the focus stays in the field; the arrows move between cells, Enter picks, Esc closes a small popup first and then
 *     the picker. In the 上传 tab Esc closes the picker and Ctrl+V pastes an image or a link.
 *   Uploading, saving a custom emoji: the picker closes as it starts, and the icon changes once it is saved.
 * openMediaPicker({ origin, value, isCallout, onPick(value | null, { keepVisible }), only, pictures, onClose }): null is 移除.
 *   only: these tabs alone (["emoji"]: a Sheet tab's icon); pictures false: the icon may be no picture (a custom page in the
 *   sidebar, a web link, a page of another workspace): no 上传 tab, no 自定义 group in 表情符号; onClose: told as the picker
 *   closes (picked, Esc, a press outside), which the sidebar's frame (src/editor/page/icon-frame.mjs) needs.
 */
import { openPopup, closePopup } from './support.mjs';
import { icon } from './support.mjs';
import { hoverTooltip, hideTooltip } from './support.mjs';
import { iconKind } from '../../../shared/emoji/icon-value.mjs';
import { createEmojiTab } from './emoji-tab.mjs';
import { createIconTab } from './icon-tab.mjs';
import { createUploadForm } from './upload.mjs';
import { t } from "../../../shared/i18n/index.mjs";

const WIDTH = 408, TAB_HEIGHT = 390;
let current = null;

/* The 上传 tab: the form with no title, a large preview, a link that may be pasted and the box 同时存进表情库 */
function createUploadTab(env) {
  const form = createUploadForm({
    largeEmoji: true, allowUrlPaste: true, confirmToAdd: true,
    onCancel: env.close,
    onStart: env.close,
    onDone: env.uploaded,
  });
  return {
    el: form.el, right: null, noFilter: true,
    load: () => Promise.resolve(),
    render() {}, move() {}, activateFocused() {}, random() {}, destroy() {},
    focus: form.focus,
    paste: form.paste,
  };
}

export function openMediaPicker({ origin, value, isCallout = false, onPick, only = null, pictures = true, onClose = null }) {
  if (current && !current.popup.closed) closePopup(current.popup);
  const el = document.createElement('div');
  el.className = 'ge-picker';
  el.tabIndex = -1;
  el.style.width = `${WIDTH}px`;
  el.innerHTML =
    `<div class="ge-picker-header">` +
      `<div class="ge-picker-tabbar">` +
        `<div role="tablist" class="ge-picker-tabs">` +
          `<div class="ge-picker-tab-wrap"><div role="tab" class="ge-picker-tab" data-tab="emoji">${t("表情符号")}</div></div>` +
          `<div class="ge-picker-tab-wrap"><div role="tab" class="ge-picker-tab" data-tab="icon">${t("图标")}</div></div>` +
          `<div class="ge-picker-tab-wrap"><div role="tab" class="ge-picker-tab" data-tab="upload">${t("上传")}</div></div>` +
        `</div>` +
        `<div class="ge-picker-tabbar-right"><div role="button" tabindex="0" class="ge-picker-text-button" data-act="remove">${t("移除")}</div></div>` +
      `</div>` +
      `<div class="ge-picker-filter-row"><div class="ge-picker-filter">` +
        `<div class="ge-picker-input"><div class="ge-picker-input-icon">${icon('magnifyingGlassSmall', 16)}</div>` +
          `<input type="text" role="combobox" placeholder="${t("筛选…")}" autocomplete="off" spellcheck="false" aria-autocomplete="list" aria-haspopup="grid" aria-expanded="true">` +
          `<div role="button" tabindex="0" aria-label="${t("清空筛选")}" class="ge-picker-clear" data-act="clear" hidden>${icon('xMarkCircle', 20)}</div></div>` +
        `<div class="ge-picker-filter-right"><div class="ge-picker-tab-left"></div><div role="button" tabindex="0" aria-label="${t("随机")}" class="ge-picker-random" data-act="random">${icon('arrowIntersectRightSmall', 16)}</div><div class="ge-picker-tab-button"></div></div>` +
      `</div></div>` +
    `</div>` +
    `<div class="ge-picker-content"></div>`;

  const input = el.querySelector('input'), clear = el.querySelector('.ge-picker-clear'), filterRow = el.querySelector('.ge-picker-filter-row');
  const content = el.querySelector('.ge-picker-content'), tabButton = el.querySelector('.ge-picker-tab-button'), tabLeft = el.querySelector('.ge-picker-tab-left');
  let sub = null;

  const close = () => { if (!popup.closed) closePopup(popup); };
  const env = {
    isCallout,
    pictures,
    filter: () => input.value,
    close,
    submit(v) { close(); onPick(v, {}); },
    keepOpenPick(v) { onPick(v, { keepVisible: true }); },
    /* An image uploaded or a custom emoji saved: the picker closed, the icon changed */
    uploaded(v) { close(); onPick(v, {}); },
    refocus() { if (!popup.closed) (active.noFilter ? active.focus() : input.focus({ preventScroll: true })); },
    /* 菜单上面的一层小浮层（肤色变体、选肤色、图标颜色、选颜色菜单）；onKey 接管输入框的按键 */
    openSub(anchor, node, onKey, { gap = 4 } = {}) {
      env.closeSub();
      node.addEventListener('mousedown', e => e.preventDefault());
      sub = { popup: openPopup({ origin: anchor.getBoundingClientRect(), placement: 'bottom', align: 'start', gap, content: node, onClose: () => { sub = null; } }), onKey };
    },
    closeSub() {
      if (sub && !sub.popup.closed) closePopup(sub.popup);
      sub = null;
    },
  };
  const tabs = { emoji: createEmojiTab(env), icon: createIconTab(env), upload: createUploadTab(env) };
  // Some tabs only (`only`: a Sheet tab's icon is an emoji): the others go from the tab bar.
  const shown = only ?? (pictures ? null : Object.keys(tabs).filter(name => name !== 'upload'));
  if (shown) el.querySelectorAll('.ge-picker-tab-wrap').forEach(wrap => { if (!shown.includes(wrap.querySelector('[data-tab]').dataset.tab)) wrap.remove(); });
  let active = null;

  function show(name) {
    env.closeSub();
    active = tabs[name];
    for (const tab of el.querySelectorAll('.ge-picker-tab[data-tab]')) {
      const on = tab.dataset.tab === name;
      tab.classList.toggle('selected', on);
      tab.setAttribute('aria-selected', String(on));
      tab.parentElement.classList.toggle('selected', on);
    }
    filterRow.hidden = !!active.noFilter;          // the filter row: the 表情符号 and 图标 tabs only
    el.style.height = active.noFilter ? '' : `${TAB_HEIGHT}px`;
    content.replaceChildren(active.el);
    tabButton.replaceChildren(...(active.right ? [active.right] : []));
    tabLeft.replaceChildren(...(active.left ? [active.left] : [])); // the 图标 tab's set (icon-tab.mjs)
    hideTooltip();
    active.render(input.value);
    active.load().then(() => { if (!popup.closed && active === tabs[name]) active.render(input.value); });
    if (popup) popup.place();
    if (active.noFilter) active.focus(); else input.focus({ preventScroll: true });
  }

  const onInput = () => { clear.hidden = !input.value; active.render(input.value); };
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', e => {
    if (sub) return sub.onKey(e);
    if (e.isComposing) return;
    if (e.key.startsWith('Arrow')) { e.preventDefault(); active.move(e.key); }
    else if (e.key === 'Enter') { e.preventDefault(); active.activateFocused(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  });
  /* 上传页签里（焦点不在筛选框）：Esc 关菜单 */
  el.addEventListener('keydown', e => {
    if (e.target === input || e.key !== 'Escape' || e.isComposing) return;
    e.preventDefault(); e.stopPropagation(); close();
  });
  /* The 上传 tab: Ctrl+V pastes an image or an image link (upload.mjs paste) */
  const onPaste = e => { if (active.paste && !popup.closed && !sub) active.paste(e); };
  document.addEventListener('paste', onPaste, true);
  // 焦点留在输入框（上传页签里的输入框、按钮照常）
  el.addEventListener('mousedown', e => { if (e.target !== input && !e.target.closest('.ge-picker-upload input')) e.preventDefault(); });
  el.addEventListener('click', e => {
    const tab = e.target.closest('.ge-picker-tab[data-tab]');
    if (tab && !tab.classList.contains('selected')) return show(tab.dataset.tab);
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'remove') { close(); onPick(null, {}); }
    else if (act === 'clear') { input.value = ''; onInput(); input.focus(); }
    else if (act === 'random') active.random();
  });
  hoverTooltip(el.querySelector('.ge-picker-random'), t("随机"), { placement: 'bottom' });

  let popup = null;
  popup = openPopup({
    origin, placement: 'bottom', align: 'start', gap: 4, content: el,
    onClose: () => {
      env.closeSub(); hideTooltip();
      document.removeEventListener('paste', onPaste, true);
      for (const tab of Object.values(tabs)) tab.destroy();
      current = null;
      onClose?.();
    },
  });
  current = { popup };
  show(iconKind(value) === 'glyph' ? 'icon' : 'emoji');
  return popup;
}
