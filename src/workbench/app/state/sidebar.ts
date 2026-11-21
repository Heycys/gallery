import { createStore } from '../lib/store';
import { clamp, storage } from '../lib/util';
import { KEYS } from '../../../shared/renamed-storage.mjs';

/**
 * 侧栏状态。expanded / width 存在本机（KEYS.sidebar）。
 * 收起后的“浮出（peek）”逻辑也在这里：悬停 ≡ 或窗口左边缘浮出，离开 300ms 后收回；
 * 菜单开着或正在拖拽时通过 holdPeek() 保持不收回。
 */
export const SIDEBAR_MIN = 216;
/** 最宽 480px */
export const SIDEBAR_MAX = 480;
/** 默认宽度（与 tokens.css 的 --sb-w 一致） */
const SIDEBAR_DEFAULT = 270;
const KEY = KEYS.sidebar;

interface SidebarState {
  expanded: boolean;
  width: number;
  peek: boolean;
  mobile: boolean;
  mobileOpen: boolean;
}

const mq = window.matchMedia('(max-width: 768px)');
const saved = storage.get<{ expanded: boolean; width: number }>(KEY);

export const sidebarStore = createStore<SidebarState>({
  expanded: saved?.expanded ?? true,
  width: clamp(saved?.width ?? SIDEBAR_DEFAULT, SIDEBAR_MIN, SIDEBAR_MAX),
  peek: false,
  mobile: mq.matches,
  mobileOpen: false,
});

const patch = (p: Partial<SidebarState>) => sidebarStore.set(s => ({ ...s, ...p }));

let lastSaved = '';
sidebarStore.subscribe(() => {
  const { expanded, width } = sidebarStore.get();
  const json = JSON.stringify({ expanded, width });
  if (json !== lastSaved) { lastSaved = json; storage.set(KEY, { expanded, width }); }
});
mq.addEventListener('change', () => patch({ mobile: mq.matches, mobileOpen: false, peek: false }));

let peekTimer = 0;
let holdCount = 0;
/** 点击收起后，≡ 恰好出现在鼠标下方：要等鼠标离开一次才允许浮出 */
let suppressPeek = false;

export function setExpanded(expanded: boolean, { fromClick = false } = {}) {
  if (sidebarStore.get().mobile) { patch({ mobileOpen: expanded }); return; }
  clearTimeout(peekTimer);
  if (!expanded && fromClick) suppressPeek = true;
  patch({ expanded, peek: false });
}

export function toggleSidebar() {
  const s = sidebarStore.get();
  if (s.mobile) patch({ mobileOpen: !s.mobileOpen });
  else setExpanded(!s.expanded);
}

export const setMobileOpen = (open: boolean) => patch({ mobileOpen: open });
export const setSidebarWidth = (w: number) => patch({ width: clamp(w, SIDEBAR_MIN, SIDEBAR_MAX) });

export function showPeek(delay = 60) {
  const s = sidebarStore.get();
  if (s.mobile || s.expanded || suppressPeek) return;
  clearTimeout(peekTimer);
  peekTimer = window.setTimeout(() => patch({ peek: true }), delay);
}

export function hidePeek() {
  clearTimeout(peekTimer);
  if (sidebarStore.get().peek) patch({ peek: false });
}

const hovered = (id: string) => !!document.getElementById(id)?.matches(':hover');

export function scheduleHide(delay = 300) {
  clearTimeout(peekTimer);
  if (!sidebarStore.get().peek) return;
  peekTimer = window.setTimeout(() => {
    if (holdCount > 0) return;
    if (hovered('sidebar') || hovered('tbMenu') || hovered('sbEdge') || hovered('sbWebButton')) return;
    hidePeek();
  }, delay);
}

/** 离开触发区：已浮出则准备收回，否则取消还没触发的浮出 */
export function leavePeekTrigger() {
  if (sidebarStore.get().peek) scheduleHide();
  else clearTimeout(peekTimer);
}

export const cancelPeekTimer = () => clearTimeout(peekTimer);
export const clearSuppressPeek = () => { suppressPeek = false; };
export const isPeekSuppressed = () => suppressPeek;

/** 保持浮出（返回释放函数） */
export function holdPeek(): () => void {
  holdCount++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    holdCount = Math.max(0, holdCount - 1);
    scheduleHide();
  };
}
