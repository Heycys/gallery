import { createStore } from '../lib/store';
import { storage } from '../lib/util';
import { KEYS } from '../../../shared/renamed-storage.mjs';
import { t } from '../../../shared/i18n/index.mjs';

/**
 * 工作台的外观：浅色或深色两种（没有“跟随系统”这一项）。还没选过时用系统当时的那一种（prefers-color-scheme，
 * 选之前系统换了也跟着换）；选了就存下来（localStorage），以后一直是它，不再看系统。旧版存的 'system' 当作没选过。
 * 只管工作台自己的；报告页的阅读菜单（render/kit/ui.js 外观）不变，工作台里打开的报告页跟着这里（ReportView 的 theme 命令）。
 */
export type Theme = 'light' | 'dark';
const KEY = KEYS.theme;
const darkMq = window.matchMedia('(prefers-color-scheme: dark)');
const saved = (value: unknown): Theme | null => (value === 'light' || value === 'dark' ? value : null);

/** picked：存下来的选择（null：还没选过）；systemDark：系统现在是不是深色 */
export const themeStore = createStore<{ picked: Theme | null; systemDark: boolean }>({
  picked: saved(storage.get(KEY)),
  systemDark: darkMq.matches,
});

/** 现在用的外观：选过的那一种，没选过就是系统的 */
export const themeOf = (s: { picked: Theme | null; systemDark: boolean }): Theme => s.picked ?? (s.systemDark ? 'dark' : 'light');
export const isDarkState = (s: { picked: Theme | null; systemDark: boolean }) => themeOf(s) === 'dark';

// 没选过：不写 data-theme，样式表按 prefers-color-scheme 走（和系统一起变）；选过：写上
function apply() {
  const { picked } = themeStore.get();
  if (picked) document.documentElement.setAttribute('data-theme', picked);
  else document.documentElement.removeAttribute('data-theme');
}
apply();
themeStore.subscribe(apply);
darkMq.addEventListener('change', () => themeStore.set(s => ({ ...s, systemDark: darkMq.matches })));

/**
 * 换外观：浏览器有视图过渡（document.startViewTransition）、读者没要减少动态效果时，在它里面换，整个窗口 160ms 淡过去
 * （:root.theme-fade 的 ::view-transition-*，styles/base.css），不在一帧里从白跳到 #191919；报告页晚一两帧才换的那一下也在淡入的画面里。
 * 没有（Firefox）或减少动态效果时照旧一下子换
 */
export function setTheme(theme: Theme) {
  const change = () => {
    storage.set(KEY, theme);
    themeStore.set(s => ({ ...s, picked: theme }));
  };
  const doc = document as Document & { startViewTransition?: (update: () => void) => { finished: Promise<unknown> } };
  let calm = false;
  try { calm = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* 没有 matchMedia：照常 */ }
  if (!doc.startViewTransition || calm) { change(); return; }
  const root = document.documentElement;
  root.classList.add('theme-fade');
  try {
    void doc.startViewTransition(change).finished.finally(() => root.classList.remove('theme-fade'));
  } catch {
    root.classList.remove('theme-fade');
    change();
  }
}
/** 外观的两种：说法、图标；侧栏底部的外观按钮在两者之间切换 */
export const THEMES: Record<Theme, { label: string; icon: 'sun' | 'moon' }> = {
  light: { label: t('浅色'), icon: 'sun' },
  dark: { label: t('深色'), icon: 'moon' },
};
export const nextTheme = (theme: Theme): Theme => (theme === 'light' ? 'dark' : 'light');
export const cycleTheme = () => setTheme(nextTheme(themeOf(themeStore.get())));
