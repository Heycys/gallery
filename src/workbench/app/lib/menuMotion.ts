import { useLayoutEffect, type RefObject } from 'react';
import { ghostOut, MENU_OUT } from './afterimage';

/**
 * 菜单和浮层怎么出现、怎么离开（2026-11-17 定的）：从触发它的那个角长出来（0.96 → 1 加淡入，140ms，
 * base.css 的 menu-in），离开只淡出 90ms（afterimage.ts）。用键盘打开的不做动画（.menu-still），马上在那里；
 * 减少动态效果时只剩淡入（base.css）。
 */

// 最近一次是按键还是指针：按键（回车、空格、Shift+F10）打开的菜单不做动画
let byKeys = false;
if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) byKeys = true; }, true);
  window.addEventListener('pointerdown', () => { byKeys = false; }, true);
}
export const openedByKeys = () => byKeys;

/**
 * el 已经摆好了：从离触发它的地方最近的那个角长出来。from 是触发它的东西（锚点的框），或者一个点（右键处、子菜单那一行）；
 * 用键盘打开的不做动画
 */
export function growFrom(el: HTMLElement, from: DOMRect | { x: number; y: number }, still = byKeys) {
  if (still) { el.classList.add('menu-still'); return; }
  const box = el.getBoundingClientRect();
  const x = 'width' in from ? from.left + from.width / 2 : from.x;
  const y = 'height' in from ? from.top + from.height / 2 : from.y;
  // 锚点在它左边（或左右对齐时在左半边）就是左边的角；上下同理。一个点（右键处）就是那个点自己，落在框外时取框边上最近的地方
  const ox = 'width' in from ? (x <= box.left + box.width / 2 ? 0 : box.width) : Math.min(box.width, Math.max(0, x - box.left));
  const oy = 'height' in from ? (y <= box.top + box.height / 2 ? 0 : box.height) : Math.min(box.height, Math.max(0, y - box.top));
  el.style.transformOrigin = `${Math.round(ox)}px ${Math.round(oy)}px`;
}

/**
 * 给浮层的外壳（ref）用：卸下时它的样子淡出 90ms。React 开发时把刚挂上的效果先撤一次：那一下不算（没过一帧）
 */
export function useFadesOut(ref: RefObject<HTMLElement | null>, ms = MENU_OUT) {
  useLayoutEffect(() => {
    const el = ref.current;
    let shown = false;
    const frame = requestAnimationFrame(() => { shown = true; });
    return () => {
      cancelAnimationFrame(frame);
      if (shown) ghostOut(el, ms);
    };
  }, []);
}
