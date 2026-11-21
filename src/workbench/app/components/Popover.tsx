import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { pushLayer } from '../lib/layers';
import { growFrom, useFadesOut } from '../lib/menuMotion';
import { holdFocus, nearFocusable } from '../lib/modalFocus';
import { createStore, useStore } from '../lib/store';
import { clamp, cls } from '../lib/util';
import { holdPeek, sidebarStore } from '../state/sidebar';
import { MenuList, type MenuEntry } from './Menu';

/**
 * 全局唯一的弹出层（侧栏条目菜单、重命名、移动到、回收区、面包屑菜单……）。
 * 同一时间只开一个；点外部 / Esc / 窗口缩放关闭。锚点在侧栏内时保持浮动侧栏不收回。
 * 不是菜单的（移动到、添加在线网页、添加其他 Gallery 项目这几张小卡片）：Tab 在卡片里转，关上时焦点还给打开它的那一行
 * （锚点，或它所在的那一行、一栏标题的名字：lib/modalFocus.ts）；菜单的焦点归 MenuList 管
 */
export type Placement = 'bottom-start' | 'bottom-end' | 'right-start' | 'top-start';

export interface PopoverOptions {
  anchor: HTMLElement;
  /** 标记“谁打开了它”，用来给触发条目加高亮、以及再次点击时关闭 */
  ownerKey?: string;
  placement?: Placement;
  /** 右键菜单：摆在鼠标处（右下方，放不下时翻到左边 / 上边），不看 placement；anchor 仍是被右键的条目 */
  point?: { x: number; y: number };
  className?: string;
  content: (close: () => void) => ReactNode;
  /** 内容是菜单（MenuList，openMenu 开的）：焦点它自己管 */
  menu?: boolean;
}

interface PopoverState extends PopoverOptions { id: number }

export const popoverStore = createStore<PopoverState | null>(null);
let seq = 0;
let releasePeek: (() => void) | null = null;

export function openPopover(opts: PopoverOptions) {
  closePopover();
  if (opts.anchor.closest('#sidebar')) releasePeek = holdPeek();
  popoverStore.set({ ...opts, id: ++seq });
}

export function closePopover() {
  if (!popoverStore.get()) return;
  popoverStore.set(null);
  releasePeek?.();
  releasePeek = null;
}

/** 同一个触发者再次点击 = 关闭 */
export function togglePopover(opts: PopoverOptions & { ownerKey: string }) {
  if (popoverStore.get()?.ownerKey === opts.ownerKey) closePopover();
  else openPopover(opts);
}

/** 右键菜单每次都在新的鼠标位置重新打开，不切换。菜单的焦点行由 MenuList 管（controlled：悬停高亮不靠 :hover） */
export function openMenu(anchor: HTMLElement, entries: MenuEntry[], opts: Omit<PopoverOptions, 'anchor' | 'content'> = {}) {
  const o = { ...opts, anchor, menu: true, className: cls(opts.className, 'controlled'), content: (close: () => void) => <MenuList entries={entries} onDone={close} /> };
  if (opts.ownerKey && !opts.point) togglePopover(o as PopoverOptions & { ownerKey: string });
  else openPopover(o);
}

export const usePopoverOwner = (key: string) => useStore(popoverStore, s => s?.ownerKey === key);

/** 根据锚点位置（或鼠标处）摆放浮层，放不下时翻转，并限制在视口内 */
export function placeEl(el: HTMLElement, anchor: HTMLElement, placement: Placement, point?: { x: number; y: number }) {
  const r = anchor.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight, m = 8;
  let x: number, y: number;
  if (point) {
    x = point.x + w > innerWidth - m ? point.x - w : point.x;
    y = point.y + h > innerHeight - m ? point.y - h : point.y;
  } else if (placement === 'right-start') {
    x = r.right + 4; y = r.top - 6;
    if (x + w > innerWidth - m) x = r.left - w - 4;
  } else if (placement === 'bottom-end') { x = r.right - w; y = r.bottom + 4; }
  else if (placement === 'top-start') { x = r.left; y = r.top - h - 4; }
  else { x = r.left; y = r.bottom + 4; }
  if (!point && y + h > innerHeight - m) y = placement === 'right-start' ? r.bottom - h + 6 : r.top - h - 4;
  el.style.left = `${clamp(x, m, Math.max(m, innerWidth - w - m))}px`;
  el.style.top = `${clamp(y, m, Math.max(m, innerHeight - h - m))}px`;
}

/** 浮层的外壳：卸下时（关上、换成另一个）它的样子淡出 90ms（lib/menuMotion.ts） */
function PopoverCard({ pop, elRef }: { pop: PopoverState; elRef: RefObject<HTMLDivElement | null> }) {
  useFadesOut(elRef);
  return (
    <div ref={elRef} className={cls('menu', pop.className)} role="menu">
      {pop.content(closePopover)}
    </div>
  );
}

export function PopoverHost() {
  const pop = useStore(popoverStore);
  const ref = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!pop || !el) return;
    const place = () => placeEl(el, pop.anchor, pop.placement ?? 'bottom-start', pop.point);
    place();
    // 从触发它的那个角长出来（右键菜单：从指针处）；用键盘打开的不做动画
    growFrom(el, pop.point ?? pop.anchor.getBoundingClientRect());
    // 内容变化导致尺寸变化时（例如回收区恢复了一项）重新摆放
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [pop]);

  useEffect(() => {
    if (!pop) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (ref.current?.contains(t) || pop.anchor.contains(t) || (t as Element).closest?.('.menu-sub')) return; // 子菜单（MenuList）也算菜单里
      closePopover();
    };
    document.addEventListener('pointerdown', onDown, true);
    window.addEventListener('resize', closePopover);
    // 点进报告 iframe 时父页面收不到 pointerdown，只会失去焦点
    window.addEventListener('blur', closePopover);
    const popLayer = pushLayer(closePopover);
    // 不是菜单的卡片：它的内容已经把焦点给了自己的输入框（子组件的效果先跑），留在那里
    const el = ref.current;
    const release = !pop.menu && el ? holdFocus(el, { first: () => (el.contains(document.activeElement) ? document.activeElement as HTMLElement : null), back: () => nearFocusable(pop.anchor) }) : null;
    let wasExpanded = sidebarStore.get().expanded;
    const unsub = sidebarStore.subscribe(() => {
      const { expanded } = sidebarStore.get();
      if (expanded !== wasExpanded) closePopover();
      wasExpanded = expanded;
    });
    return () => {
      document.removeEventListener('pointerdown', onDown, true);
      window.removeEventListener('resize', closePopover);
      window.removeEventListener('blur', closePopover);
      popLayer();
      unsub();
      release?.();
    };
  }, [pop]);

  if (!pop) return null;
  return createPortal(<PopoverCard key={pop.id} pop={pop} elRef={ref} />, document.body);
}
