import { ExtensionSlot } from '../extensions/runtime';
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Icon } from '../../components/Icon';
import { openMenu, usePopoverOwner } from '../../components/Popover';
import { devicePx, usePixelRatio } from '../../lib/devicePixels';
import { pushLayer } from '../../lib/layers';
import { useStore } from '../../lib/store';
import { cls, IS_MAC, MOD } from '../../lib/util';
import {
  cancelPeekTimer, leavePeekTrigger, scheduleHide, setExpanded, setMobileOpen, setSidebarWidth, showPeek, sidebarStore,
} from '../../state/sidebar';
import { THEMES, cycleTheme, nextTheme, themeOf, themeStore } from '../../state/theme';
import { sessionStore } from '../../session/sessionStore';
import { navStore, openCustomPage } from '../../state/navigation';
import { firstPage, workspaceStore } from '../../workspace/store';
import { newDocument } from '../../workspace/commands';
import { openSearch } from '../search/SearchModal';
import { workspaceMenuEntries } from './reportMenus';
import { SidebarHead } from './SidebarHead';
import { SidebarTree } from './SidebarTree';
import { WebSidebarButton } from './WebSidebarButton';
import './sidebar.css';
import { t } from '../../../../shared/i18n/index.mjs';

/**
 * 侧栏收起时，贴着窗口左边缘唤出它的感应条：平时宽一些（wide）；打开的报告页正文左边、连同编辑器给
 * 拖动手柄留的位置（报告页的 --ge-edge-room）离窗口左边很近时，收窄到剩下的空当，最窄 narrow；
 * 目录在右边占了位置、正文左边只剩手柄本身的位置时（margin.mjs 最少 52px），再窄到手柄左边为止
 * （手柄的位置左边还留着 breath 的空，editor/page/handle/index.mjs EDGE），最窄 least：
 * 免得伸手去拿手柄时唤出侧栏。
 */
const EDGE = { wide: 32, narrow: 8, least: 2, clear: 8, breath: 14 };
function edgeWidth(frame: HTMLIFrameElement | null | undefined): number {
  const doc = frame?.contentDocument;
  const page = doc?.querySelector('main.doc-page');
  if (!frame || !doc || !page) return EDGE.wide;
  const room = parseFloat(getComputedStyle(doc.documentElement).getPropertyValue('--ge-edge-room')) || 0;
  const free = frame.getBoundingClientRect().left + page.getBoundingClientRect().left - room;
  const handle = free + EDGE.breath; // 手柄左边离窗口左边
  return Math.round(Math.max(EDGE.least, Math.min(EDGE.wide, Math.max(free - EDGE.clear, Math.min(EDGE.narrow, handle)))));
}

/**
 * 侧栏外壳。结构：
 * 容器（占位宽度，收起时宽度过渡到 0）→ 0 宽锚点 → 侧栏本体（固定 / 浮动 / 移动端抽屉三种形态）。
 * 头部（用户 2026-11-17 定的）：开关、字标 Gallery 和行尾的「新建」一行，下面是一整行灰底的搜索，再下面是自定义页（SidebarHead：拖动排顺序）；
 * 浮动时第一行照旧在（新建在这一行），只是开关不显示（顶栏有自己的展开按钮）。
 * 添加在线网页…、新建栏、添加其他 Gallery 项目… 在每一栏标题的 ··· 菜单里（SidebarTree.tsx）
 */
export function Sidebar() {
  const sb = useStore(sidebarStore);
  const home = useStore(workspaceStore, ws => firstPage(ws)?.slug ?? null);
  const webPage = useStore(navStore, nav => nav.current?.kind === 'link' || nav.current?.kind === 'extension');
  const collapsed = sb.mobile || !sb.expanded;
  const floating = !sb.mobile && !sb.expanded;
  const [scrolled, setScrolled] = useState(false);

  // 取整到物理像素：报告区 iframe 的左边就是它，落在半个像素上时详情卡片开着会在侧栏边上漏出一条亮线（lib/devicePixels.ts）。
  // 拖着调宽度时不取整（125% 下一档 4px，拖起来一跳一跳），松手后再取
  const ratio = usePixelRatio();
  const [resizing, setResizing] = useState(false);
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--sb-w', `${resizing ? sb.width : devicePx(sb.width, ratio)}px`);
  }, [sb.width, ratio, resizing]);

  // 收起时左边缘感应条的宽度：量当时显示着的报告页（重新显示时换过 iframe）；页面换了、连上了、
  // 报告区变了大小（侧栏收起的过渡、窗口缩放），都再量一次；报告页里正文挪了位置也再量（目录开关、
  // 拖目录的宽度、宽度停下后才排好的那一步：editor/page/margin.mjs 每次挪正文都在页面的 window 上
  // 发一个 resize，听着显示着的那一页；换上新页面时跟着换过去）
  const openSlug = useStore(sessionStore, s => s.slug);
  const connected = useStore(sessionStore, s => s.connected);
  const [edge, setEdge] = useState(EDGE.wide);
  useEffect(() => {
    if (!floating || webPage) return;
    const shown = () => document.querySelector<HTMLIFrameElement>('iframe.report-frame:not([data-pending])');
    let heard: Window | null = null;
    const measure = () => {
      const page = shown()?.contentWindow ?? null;
      if (page !== heard) {
        // 另一个源的在线网页听不了：量不到它的正文，感应条按宽的来
        try { heard?.removeEventListener('resize', measure); } catch { /* 另一个源 */ }
        heard = page;
        try { heard?.addEventListener('resize', measure); } catch { heard = null; }
      }
      setEdge(edgeWidth(shown()));
    };
    measure();
    const area = shown()?.parentElement;
    const observer = new ResizeObserver(measure);
    if (area) observer.observe(area);
    const swapped = new MutationObserver(measure);
    if (area) swapped.observe(area, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-pending'] });
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      swapped.disconnect();
      try { heard?.removeEventListener('resize', measure); } catch { /* 另一个源 */ }
      window.removeEventListener('resize', measure);
    };
  }, [floating, webPage, openSlug, connected]);

  // 移动端抽屉：Esc 关闭
  useEffect(() => (sb.mobile && sb.mobileOpen ? pushLayer(() => setMobileOpen(false)) : undefined), [sb.mobile, sb.mobileOpen]);

  // 键盘的焦点在侧栏的哪一行（文档树、扩展栏的条目，自定义页的行，一栏的标题）上或里面：那一行标上 data-keys，它的 ＋ ··· 显出来，
  // Tab 走得到（sidebar.css）。只认键盘走到的（:focus-visible），点一下不算；焦点在这一行里挪（行 → ＋ → ···）时不摘，挪出去才摘
  useEffect(() => {
    const nav = document.getElementById('sidebar');
    if (!nav) return;
    const holder = (node: EventTarget | null) => (node instanceof Element ? node.closest<HTMLElement>('.row, .sb-page, .sec-head') : null);
    const onIn = (e: FocusEvent) => {
      const row = holder(e.target);
      if (row && (e.target as Element).matches(':focus-visible')) row.setAttribute('data-keys', '');
    };
    const onOut = (e: FocusEvent) => {
      const row = holder(e.target);
      if (row && !(e.relatedTarget instanceof Node && row.contains(e.relatedTarget))) row.removeAttribute('data-keys');
    };
    nav.addEventListener('focusin', onIn);
    nav.addEventListener('focusout', onOut);
    return () => {
      nav.removeEventListener('focusin', onIn);
      nav.removeEventListener('focusout', onOut);
    };
  }, []);

  const navClass = cls(
    'sidebar',
    floating && 'floating',
    floating && sb.peek && 'peek',
    sb.mobile && 'mobile',
    sb.mobile && sb.mobileOpen && 'mobile-open',
  );

  return (
    <aside className={cls('sb-container', collapsed && 'collapsed')}>
      <div className={cls('sb-backdrop', sb.mobile && sb.mobileOpen && 'show')} onClick={() => setMobileOpen(false)} />
      {/* 收起时贴着窗口左边缘的感应条 */}
      {!webPage && <div className="sb-edge" id="sbEdge" style={{ width: edge }} onMouseEnter={() => showPeek()} onMouseLeave={leavePeekTrigger} />}
      {webPage && collapsed && !sb.mobileOpen && <WebSidebarButton />}
      <div className="sb-anchor">
        <nav
          id="sidebar"
          className={navClass}
          aria-label={t('侧边栏')}
          onMouseEnter={() => { if (sidebarStore.get().peek) cancelPeekTimer(); }}
          onMouseLeave={() => scheduleHide()}
        >
          <div className="float-bg" />
          <div className="sb-inner">
            <div className={cls('sb-head', scrolled && 'scrolled')}>
              {/* 第一行：开关、字标 Gallery（衬线的名字）、行尾的「新建」（用户 2026-11-17 定的：开关还在最左，
                  图标和下面各行的图标在一条竖线上；新建从单独的一行挪到这里）。有自定义页时点字标进头部的第一个页，没有时它只是名字 */}
              <div className="sb-top">
                <button className="icon-btn sb-toggle" data-tip={t('关闭侧边栏')} data-sub={`${MOD}\\`} aria-label={t('关闭侧边栏')} onClick={() => setExpanded(false, { fromClick: true })}>
                  <Icon name="sidebar" />
                </button>
                {/* 有自定义页时它是个按钮（键盘也走得到）；没有时只是名字 */}
                {home
                  ? <button type="button" className="sb-brand home" onClick={() => void openCustomPage(home)}>Gallery</button>
                  : <span className="sb-brand">Gallery</span>}
                {/* 新建：打开着侧栏里的一条时放在它的下一个位置，否则放在这个工作区自己那一栏的第一个（commands.ts newDocument） */}
                <button className="icon-btn sb-new" data-tip={t('新建文档')} aria-label={t('新建文档')} onClick={() => void newDocument()}>
                  <Icon name="composeNew" />
                </button>
              </div>
              {/* 搜索：一整行的灰底（圆角 8，不是胶囊），右边写着它的快捷键 Ctrl/⌘+K（shortcuts.ts） */}
              <button className="sb-search" aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'} onClick={openSearch}>
                <span className="sb-search-icon"><Icon name="search" /></span>
                <span className="sb-search-label">{t('搜索')}</span>
                <kbd className="sb-search-key">{`${MOD}K`}</kbd>
              </button>
              {/* 自定义页：一列行，按住拖动排顺序（SidebarHead） */}
              <SidebarHead />
            </div>
            <SidebarTree onScrolled={setScrolled} />
            <ExtensionSlot name="sidebar-footer" />
            <SidebarFoot />
          </div>
        </nav>
      </div>
      {!collapsed && <Resizer width={sb.width} onResizing={setResizing} />}
    </aside>
  );
}

/** 侧栏底部：设置（导入、回收区、偏好、语言；没连上本地服务时按钮上有个点）和外观按钮（浅色 ⇄ 深色；没选过时是系统的那一种） */
function SidebarFoot() {
  const theme = useStore(themeStore, themeOf);
  const wsOpen = usePopoverOwner('workspace');
  const status = useStore(workspaceStore, w => w.status);
  return (
    <div className="sb-foot">
      <button className={cls('ws-btn', wsOpen && 'menu-open')} aria-haspopup="menu" aria-expanded={wsOpen} onClick={e => openMenu(e.currentTarget, workspaceMenuEntries(), { placement: 'top-start', ownerKey: 'workspace', className: 'ws-menu' })}>
        <Icon name="settings" />
        <span className="ws-name">{t('设置')}</span>
        {status !== 'ready' && <span className={cls('ws-dot', status)} data-tip={status === 'loading' ? t('正在连接本地服务') : t('没有连上本地服务')} />}
      </button>
      <button className="icon-btn" data-tip={t('外观：{0}', THEMES[theme].label)} data-sub={t('点击切换为{0}', THEMES[nextTheme(theme)].label)} aria-label={t('切换主题')} onClick={cycleTheme}>
        <Icon name={THEMES[theme].icon} />
      </button>
    </div>
  );
}

/** 拖动调整宽度（SIDEBAR_MIN–SIDEBAR_MAX：216–480px）；没有移动就松开 = 收起侧栏。onResizing：拖着的时候 true */
function Resizer({ width, onResizing }: { width: number; onResizing: (on: boolean) => void }) {
  const startRef = useRef<{ x: number; w: number; moved: boolean } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* 合成事件没有真实 pointerId */ }
    startRef.current = { x: e.clientX, w: width, moved: false };
    document.body.classList.add('resizing');
    onResizing(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = startRef.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (!s.moved && Math.abs(dx) < 3) return;
    s.moved = true;
    setSidebarWidth(s.w + dx);
  };
  const onPointerUp = () => {
    const s = startRef.current;
    startRef.current = null;
    document.body.classList.remove('resizing');
    onResizing(false);
    if (s && !s.moved) setExpanded(false);
  };

  return (
    <div
      className="sb-resizer"
      data-tip={t('拖动调整宽度')}
      data-sub={t('点击收起侧边栏')}
      data-tip-pos="cursor"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    />
  );
}
