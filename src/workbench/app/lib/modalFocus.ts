import { useEffect, type RefObject } from 'react';

/**
 * 对话框的焦点（aria-modal 说的）：打开时记下拿着焦点的元素、把焦点给对话框里的一个（first，没有就是第一个能拿焦点的），
 * Tab / Shift+Tab 在对话框里转（到头接到另一头，不走到对话框后面去）；关上时（卸下：对话框都是马上卸下的，关的淡出另有一层，
 * lib/afterimage.ts）焦点还在对话框里或掉到了 body，就还给打开前的那个（back：另给一个）。几个叠着时只有最上面那个转 Tab。
 * 用在确认对话框、搜索、导出和导入、组件列表、拓展列表、历史版本，和侧栏里开的小卡片（移动到、添加在线网页、添加其他 Gallery 项目：
 * 它们关上时焦点还给打开它的那一行，Popover.tsx）。
 * 对话框用 useModalFocus（useEffect，不是 useLayoutEffect）：从菜单里打开的对话框，菜单先把焦点还给打开它的按钮（Menu.tsx，
 * 同一次提交里卸下的效果先跑），对话框记下的就是那个按钮，关上时焦点回到那里。
 */
const FOCUSABLE = 'button:not(:disabled), input:not(:disabled):not([type="hidden"]):not([type="file"]):not([hidden]), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';

const stack: HTMLElement[] = [];

/** 一个元素里能用 Tab 走到的（看得见的） */
export const tabStops = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(node => node.getClientRects().length > 0 && !node.closest('[inert]'));

/** 离 node 最近的能拿焦点的：它自己，它所在的侧栏那一行，或它里面的第一个（一栏的标题：名字那个按钮） */
export function nearFocusable(node: Element | null | undefined): HTMLElement | null {
  if (!(node instanceof HTMLElement) || !node.isConnected) return null;
  const ok = (el: HTMLElement) => el.matches(FOCUSABLE) && el.getClientRects().length > 0;
  if (ok(node)) return node;
  const row = node.closest<HTMLElement>('.row, .sb-page');
  if (row && ok(row)) return row;
  return tabStops(node)[0] ?? null;
}

function onTab(event: KeyboardEvent) {
  const root = stack.at(-1);
  if (event.key !== 'Tab' || event.ctrlKey || event.metaKey || event.altKey || !root?.isConnected) return;
  const now = document.activeElement;
  if (now?.closest('.menu') && !root.contains(now)) return; // 对话框里开着的下拉菜单（导出的格式……）：它自己管
  const stops = tabStops(root);
  if (!stops.length) { event.preventDefault(); root.focus({ preventScroll: true }); return; }
  const inside = now instanceof HTMLElement && root.contains(now);
  const [from, to] = event.shiftKey ? [stops[0], stops.at(-1)!] : [stops.at(-1)!, stops[0]];
  // 在里面、不在头尾：浏览器自己走（也包括 iframe 这种不在 stops 里的）；在头尾上、在对话框本身上、在外面：接到另一头
  if (inside && now !== from && now !== root) return;
  event.preventDefault();
  (now === from ? to : event.shiftKey ? stops.at(-1)! : stops[0]).focus({ preventScroll: true });
}

/** 焦点还给 to：焦点还在 from 里、掉到了 body 时才还（已经在别的地方，比如随后打开的浮层：不动） */
export function giveBack(to: Element | null | undefined, from?: Element | null) {
  const now = document.activeElement;
  if (now && now !== document.body && !(from && from.contains(now))) return;
  if (!(to instanceof HTMLElement) || !to.isConnected) return;
  to.focus({ preventScroll: true });
}

/** 拿住焦点（见上），返回放开的函数（关上时调：焦点还回去） */
export function holdFocus(root: HTMLElement, { first, back }: { first?: () => HTMLElement | null | undefined; back?: () => Element | null | undefined } = {}) {
  const before = document.activeElement;
  const start = first?.() ?? tabStops(root)[0] ?? root;
  if (start === root && !root.hasAttribute('tabindex')) root.tabIndex = -1;
  if (document.activeElement !== start) start.focus({ preventScroll: true });
  stack.push(root);
  if (stack.length === 1) window.addEventListener('keydown', onTab, true);
  return () => {
    const at = stack.indexOf(root);
    if (at >= 0) stack.splice(at, 1);
    if (!stack.length) window.removeEventListener('keydown', onTab, true);
    giveBack(back ? back() : before, root);
  };
}

export function useModalFocus(ref: RefObject<HTMLElement | null>, first?: () => HTMLElement | null | undefined) {
  useEffect(() => (ref.current ? holdFocus(ref.current, { first }) : undefined), []);
}
