import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon, PageIcon } from '../../components/Icon';
import { pushLayer } from '../../lib/layers';
import { growFrom, useFadesOut } from '../../lib/menuMotion';
import { createStore, useStore } from '../../lib/store';
import { clamp, cls } from '../../lib/util';
import { currentDocument, navStore, openReport } from '../../state/navigation';
import { sidebarStore } from '../../state/sidebar';
import { childrenOf, parentOf } from '../../workspace/meta';
import { columnTitle, reportTitle, workspaceStore, type WorkspaceState } from '../../workspace/store';
import { ROOT } from '../../workspace/types';
import { useSessionTitle } from '../report/useSessionTitle';
import { t } from '../../../../shared/i18n/index.mjs';

/**
 * 面包屑的页面浮层：鼠标停在面包屑上，下面列出它的同级报告，点一下就打开。
 * - 停 100ms 打开；鼠标离开按钮和所有浮层（各留 20px 余量）200ms 后收起，点在它们外面立即收起；
 *   移进报告 iframe 父页面收不到 mousemove，按离开算；点进 iframe（窗口失去焦点）、Esc、换报告、浮动侧栏浮出也收起
 * - 浮层宽 180、内边距 4、条目高 28 间距 1；一栏的顶层报告上面有那一栏的名字
 * - 当前打开的报告蓝底，被悬停的面包屑自己那一项灰底
 * - 有子报告的条目右边一个 ›，停 100ms 在右边展开子报告，移到没有子报告的条目上 200ms 后收起
 * - 超过 6 项只列 5 项（优先保留面包屑自己 / 当前报告）+「另外 N 个」，点了全部列出
 * - 键盘：在打开着的那一页的面包屑上按回车（没往下滚过时）打开它，焦点进到浮层（打开着的那一行）；↑ / ↓ 在各行之间走，
 *   回车、空格打开那一页，→ 展开有子页面的那一行、焦点进去，← 收回到上一层；Esc 收起，焦点回到面包屑
 */
const OPEN_DELAY = 100;
const CLOSE_DELAY = 200;
const SUBMENU_EXPAND = 100;
const SUBMENU_COLLAPSE = 200;
const MARGIN = 20;
const LIMIT = 5;

interface PopupState { id: number; slug: string; anchor: HTMLElement; focus?: boolean }

const popupStore = createStore<PopupState | null>(null);
const panels = new Set<HTMLElement>();
let seq = 0;
let openTimer = 0;
let closeTimer = 0;
let detach: (() => void) | null = null;

const cancelClose = () => { clearTimeout(closeTimer); closeTimer = 0; };
const scheduleClose = () => { if (!closeTimer) closeTimer = window.setTimeout(closeCrumbPopup, CLOSE_DELAY); };

/** 鼠标停在面包屑上：100ms 后打开它的浮层（已经开着就留着） */
export function hoverCrumb(slug: string, anchor: HTMLElement) {
  if (popupStore.get()?.slug === slug) { cancelClose(); return; }
  clearTimeout(openTimer);
  openTimer = window.setTimeout(() => openCrumbPopup(slug, anchor), OPEN_DELAY);
}

/** 鼠标离开面包屑：还没打开的不再打开；开着的由鼠标位置决定收不收 */
export const leaveCrumb = () => clearTimeout(openTimer);

/** focus：用键盘打开的，焦点进浮层 */
export function openCrumbPopup(slug: string, anchor: HTMLElement, focus = false) {
  clearTimeout(openTimer);
  cancelClose();
  if (sidebarStore.get().peek || !anchor.isConnected) return;
  if (popupStore.get()?.slug === slug) {
    if (focus) firstRow(document.querySelector('.crumb-pop'))?.focus({ preventScroll: true });
    return;
  }
  popupStore.set({ id: ++seq, slug, anchor, focus });
  detach ??= attach();
}

/** 一层浮层里焦点先给的那一行：打开着的那一页，没有就是第一行 */
const firstRow = (panel: Element | null) => panel?.querySelector<HTMLElement>(':scope > .crumb-pop-item.current') ?? panel?.querySelector<HTMLElement>(':scope > .crumb-pop-item') ?? null;

export function closeCrumbPopup() {
  clearTimeout(openTimer);
  cancelClose();
  const pop = popupStore.get();
  if (!pop) return;
  // 焦点在浮层里（用键盘走过来的）：还给面包屑
  if ([...panels].some(panel => panel.contains(document.activeElement)) && pop.anchor.isConnected) pop.anchor.focus({ preventScroll: true });
  popupStore.set(null);
  detach?.();
  detach = null;
}

const within = (r: DOMRect, x: number, y: number, m: number) => r.left - m <= x && x <= r.right + m && r.top - m <= y && y <= r.bottom + m;
function inside(x: number, y: number, margin: number) {
  const pop = popupStore.get();
  if (pop && within(pop.anchor.getBoundingClientRect(), x, y, margin)) return true;
  for (const panel of panels) if (within(panel.getBoundingClientRect(), x, y, margin)) return true;
  return false;
}

/** 浮层开着时的监听：指针移出、点在外面、失去焦点、换页、侧栏浮出时收起 */
function attach() {
  const onMove = (e: MouseEvent) => (inside(e.clientX, e.clientY, MARGIN) ? cancelClose() : scheduleClose());
  const onOver = (e: MouseEvent) => { if (e.target instanceof HTMLIFrameElement) scheduleClose(); };
  // 键盘按的（回车、空格：detail 0，没有坐标）落在浮层里的：不算点在外面
  const onClick = (e: MouseEvent) => { if (e.detail === 0 && [...panels].some(panel => panel.contains(e.target as Node))) return; if (!inside(e.clientX, e.clientY, 0)) closeCrumbPopup(); };
  const root = document.documentElement;
  document.addEventListener('mousemove', onMove, true);
  document.addEventListener('mouseover', onOver, true);
  document.addEventListener('click', onClick, true);
  root.addEventListener('mouseleave', scheduleClose);
  window.addEventListener('blur', closeCrumbPopup);
  window.addEventListener('resize', closeCrumbPopup);
  const popLayer = pushLayer(closeCrumbPopup);
  const unsubSidebar = sidebarStore.subscribe(() => { if (sidebarStore.get().peek) closeCrumbPopup(); });
  let current = navStore.get().current;
  const unsubNav = navStore.subscribe(() => {
    if (navStore.get().current !== current) closeCrumbPopup();
    current = navStore.get().current;
  });
  return () => {
    document.removeEventListener('mousemove', onMove, true);
    document.removeEventListener('mouseover', onOver, true);
    document.removeEventListener('click', onClick, true);
    root.removeEventListener('mouseleave', scheduleClose);
    window.removeEventListener('blur', closeCrumbPopup);
    window.removeEventListener('resize', closeCrumbPopup);
    popLayer();
    unsubSidebar();
    unsubNav();
  };
}

/** 面包屑这一项的同级：一栏的顶层报告列那一栏的顶层（上面是那一栏的名字，侧栏里叫它的那个）；其余列同一个父报告下的报告 */
function siblingsOf(ws: WorkspaceState, slug: string): { items: string[]; label?: string } {
  const parent = parentOf(ws.meta, slug) ?? ROOT;
  const items = childrenOf(ws.meta, parent).filter(s => ws.reports[s]);
  const column = ws.meta.groups.find(group => (group.id === 'docs' ? ROOT : `:${group.id}`) === parent);
  return column ? { items, label: columnTitle(column, ws) } : { items };
}

const kidsOf = (ws: WorkspaceState, slug: string) => childrenOf(ws.meta, slug).filter(s => ws.reports[s]);

/** 超过 6 项只列 5 项；要优先保留的那一项不在前 5 项里时放在第一个 */
function limit(items: string[], priority: string | null, showAll: boolean) {
  if (showAll || items.length <= LIMIT + 1) return { visible: items, extra: 0 };
  const head = items.slice(0, LIMIT);
  if (!priority || head.includes(priority) || !items.includes(priority)) return { visible: head, extra: items.length - LIMIT };
  return { visible: [priority, ...items.filter(s => s !== priority).slice(0, LIMIT - 1)], extra: items.length - LIMIT };
}

type Side = 'below' | 'beside';

/** below：面包屑下方、左边对齐，间隔 4。beside：条目右边、顶端对齐，间隔 4，右边放不下放到左边 */
function place(el: HTMLElement, anchor: HTMLElement, side: Side) {
  const r = anchor.getBoundingClientRect(), w = el.offsetWidth, h = el.offsetHeight, m = 8;
  const x = side === 'below' ? r.left : r.right + 4 + w > innerWidth - m ? r.left - w - 4 : r.right + 4;
  const y = side === 'below' ? r.bottom + 4 : r.top;
  el.style.left = `${clamp(x, m, Math.max(m, innerWidth - w - m))}px`;
  el.style.top = `${clamp(y, m, Math.max(m, innerHeight - h - m))}px`;
}

export function CrumbPopupHost() {
  const pop = useStore(popupStore);
  const ws = useStore(workspaceStore);
  if (!pop || ws.status !== 'ready' || !ws.reports[pop.slug]) return null;
  const { items, label } = siblingsOf(ws, pop.slug);
  return <PagePanel key={pop.id} ws={ws} items={items} label={label} trigger={pop.slug} anchor={pop.anchor} side="below" focus={pop.focus} />;
}

/** 一层浮层。trigger：被悬停的面包屑（同级列表里灰底、优先保留）；子报告那一层没有，优先保留当前报告 */
function PagePanel({ ws, items, label, trigger, anchor, side, focus = false, back }: {
  ws: WorkspaceState; items: string[]; label?: string; trigger: string | null; anchor: HTMLElement; side: Side;
  /** 打开时焦点进来（键盘） */ focus?: boolean;
  /** ← 回到上一层（子页面那一层才有） */ back?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [showAll, setShowAll] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const timer = useRef(0);
  const current = useStore(navStore, s => currentDocument(s));

  useFadesOut(ref);
  useLayoutEffect(() => {
    const el = ref.current!;
    const put = () => place(el, anchor, side);
    put();
    // 从面包屑（子页面那一层：那一行）那一边长出来，和菜单一样（lib/menuMotion.ts）；用键盘打开的不做动画
    growFrom(el, anchor.getBoundingClientRect(), focus);
    const ro = new ResizeObserver(put);
    ro.observe(el);
    return () => ro.disconnect();
  }, [anchor, side]);
  useEffect(() => {
    const el = ref.current!;
    panels.add(el);
    if (focus) firstRow(el)?.focus({ preventScroll: true });
    return () => { panels.delete(el); clearTimeout(timer.current); };
  }, []);
  // 用键盘展开的子页面那一层：焦点进去
  const [keyed, setKeyed] = useState(false);

  // 一层一个计时器：展开 100ms，收起 200ms，后来的取代先来的
  const expand = (slug: string) => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setExpanded(slug), SUBMENU_EXPAND); };
  const collapse = () => { clearTimeout(timer.current); timer.current = window.setTimeout(() => setExpanded(null), SUBMENU_COLLAPSE); };

  const { visible, extra } = limit(items, trigger ?? current, showAll);
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const rows = [...ref.current!.querySelectorAll<HTMLElement>(':scope > .crumb-pop-item')];
    const at = rows.indexOf(document.activeElement as HTMLElement);
    if (at < 0 || e.ctrlKey || e.metaKey || e.altKey) return;
    const slug = rows[at].dataset.slug;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') rows[(at + (e.key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length].focus({ preventScroll: true });
    else if (e.key === 'Enter' || e.key === ' ') rows[at].click();
    else if (e.key === 'ArrowRight' && slug && kidsOf(ws, slug).length) { clearTimeout(timer.current); setKeyed(true); setExpanded(slug); }
    else if (e.key === 'ArrowLeft' && back) back();
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  return createPortal(
    <div ref={ref} className="crumb-pop" role="menu" onKeyDown={onKeyDown}>
      {label && <div className="crumb-pop-head">{label}</div>}
      {visible.map(slug => (
        <PageRow
          key={slug}
          ws={ws}
          slug={slug}
          tone={slug === current ? 'current' : slug === trigger ? 'trigger' : undefined}
          open={expanded === slug}
          keyed={keyed && expanded === slug}
          onHover={() => (kidsOf(ws, slug).length ? expand(slug) : collapse())}
          onBack={() => { const row = ref.current?.querySelector<HTMLElement>(`:scope > .crumb-pop-item[data-slug="${CSS.escape(slug)}"]`); setKeyed(false); setExpanded(null); row?.focus({ preventScroll: true }); }}
        />
      ))}
      {extra > 0 && (
        <div className="crumb-pop-item more" role="menuitem" tabIndex={-1} onMouseOver={collapse} onClick={() => setShowAll(true)}>
          {t('另外 {0} 个', extra)}
        </div>
      )}
    </div>,
    document.body,
  );
}

function PageRow({ ws, slug, tone, open, keyed, onHover, onBack }: {
  ws: WorkspaceState; slug: string; tone?: 'current' | 'trigger'; open: boolean; keyed: boolean; onHover: () => void; onBack: () => void;
}) {
  const [row, setRow] = useState<HTMLDivElement | null>(null);
  const liveTitle = useSessionTitle(slug);
  const report = ws.reports[slug];
  const kids = kidsOf(ws, slug);
  return (
    <>
      <div
        ref={setRow}
        className={cls('crumb-pop-item', tone, open && 'open')}
        role="menuitem"
        tabIndex={-1}
        aria-haspopup={kids.length > 0 ? 'menu' : undefined}
        aria-expanded={kids.length > 0 ? open : undefined}
        data-slug={slug}
        onMouseOver={onHover}
        onClick={() => { closeCrumbPopup(); void openReport(slug); }}
      >
        <span className="pg-icon"><PageIcon icon={report?.icon} slug={slug} fallback={report?.kind === 'link' ? 'web' : 'page'} /></span>
        <span className="t" data-tip-cut="">{liveTitle ?? reportTitle(report)}</span>
        {kids.length > 0 && <span className="crumb-pop-arrow"><Icon name="chevron" /></span>}
      </div>
      {open && row && kids.length > 0 && <PagePanel ws={ws} items={kids} trigger={null} anchor={row} side="beside" focus={keyed} back={onBack} />}
    </>
  );
}
