import { ExtensionSlot } from '../extensions/runtime';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { openMenu, usePopoverOwner } from '../../components/Popover';
import { toast } from '../../components/Toast';
import { devicePx, hairline, usePixelRatio } from '../../lib/devicePixels';
import { useStore } from '../../lib/store';
import { cls, MOD } from '../../lib/util';
import { can, command, sessionStore, type SessionState } from '../../session/sessionStore';
import { currentDocument, currentLink, currentPage, extensionEntry, extensionUnreadable, navStore, openReport } from '../../state/navigation';
import {
  clearSuppressPeek, isPeekSuppressed, leavePeekTrigger, setExpanded, setMobileOpen, showPeek, sidebarStore,
} from '../../state/sidebar';
import { createCustomPage, renameCustomPage, toggleFavorite } from '../../workspace/commands';
import { renameNewPage } from '../sidebar/SidebarHead';
import { ancestorsOf } from '../../workspace/meta';
import { pageOf, pageTitle, reportTitle, workspaceStore } from '../../workspace/store';
import { useSessionIcon, useSessionTitle } from '../report/useSessionTitle';
import { DEFAULT_TAB_ICON, iconUrl } from '../../../../shared/emoji/icon-value.mjs';
import { outlineOpen, setOutlineOpen } from '../../../../shared/preferences.mjs';
import { ReportStats, pageMenuEntries, reportMenuEntries } from '../sidebar/reportMenus';
import { RenameInput, startRename, stopRename, useRenaming } from '../sidebar/RenameInput';
import { closeCrumbPopup, CrumbPopupHost, hoverCrumb, leaveCrumb, openCrumbPopup } from './CrumbPopup';
import { AnnotateButton } from '../annotate/AnnotateButton';
import { LookCard, fullWidthEntry, wideTablesEntry } from './LookMenu';
import './topbar.css';
import { t } from '../../../../shared/i18n/index.mjs';

type Crumb = { slug: string } | { more: string[] };

/** 正在保存超过这么久（毫秒）才说「正在保存…」：本机的一次保存只要几十毫秒，说了也只是一闪 */
const SLOW_SAVE = 400;

/**
 * 已保存 → 待保存／正在保存…：改动不到这么久（毫秒）就又存好了，顶栏的字从头到尾不换（不然每次存都是一闪）。
 * 比页面自动保存的等待（停笔 1.6 秒才提交，editor/page/autosave.mjs IDLE）加上一次提交（量到过 0.3 秒）略长：平常打几个字、停下、存好，
 * 字不动；只有这么久还没存好（连着打了很久、慢盘、卡住了）才说待保存
 */
const SAVE_QUIET = 2500;
/** 待保存／正在保存… 一旦显示出来，至少停这么久（毫秒）才换回 已保存（刚出现就消失，同样是闪） */
const SAVE_SHOWN = 400;

/** on 已经连着开了 ms 毫秒（关掉时马上是 false） */
function useLasting(on: boolean, ms: number) {
  const [lasted, setLasted] = useState(false);
  useEffect(() => {
    setLasted(false);
    if (!on) return;
    const timer = window.setTimeout(() => setLasted(true), ms);
    return () => clearTimeout(timer);
  }, [on, ms]);
  return on && lasted;
}

/** calm：已保存；busy：待保存、正在保存…；alert：要用户留意的（冲突、内容待处理、离线），出现和消失都不等 */
type Badge = { text: string; tone: 'muted' | 'warn' | 'danger'; kind: 'calm' | 'busy' | 'alert' };

/**
 * 会话状态 → 顶栏上的状态文字（只显示报告页如实上报的状态位）。正在保存不到 SLOW_SAVE 时还说「待保存」：
 * 慢的时候（大文档、慢的磁盘）才说正在保存…；已保存和待保存之间来回的缓冲在 useSteadyBadge。
 */
function sessionBadge(s: SessionState, slowSave: boolean): Badge | null {
  if (!s.connected) return null;
  const f = s.flags;
  if (f.conflicts > 0) return { text: f.unfit > 0 ? t('{0} 处内容待处理', f.conflicts) : t('{0} 处冲突待处理', f.conflicts), tone: 'danger', kind: 'alert' };
  if (f.offline) return { text: t('离线：修改暂存在浏览器'), tone: 'warn', kind: 'alert' };
  if (f.saving) return { text: slowSave ? t('正在保存…') : t('待保存'), tone: 'muted', kind: 'busy' };
  if (f.pending) return { text: t('待保存'), tone: 'muted', kind: 'busy' };
  if (f.editing) return { text: t('已保存'), tone: 'muted', kind: 'calm' };
  return null;
}

/**
 * 保存状态不闪：已保存 变成 待保存／正在保存… 时先不换字，连着 SAVE_QUIET 毫秒都还没存好才换（这之前又存好了的，字一直是
 * 已保存）；显示出来之后，存好了也至少再停 SAVE_SHOWN 毫秒才换回 已保存。冲突、内容待处理、离线这些要留意的，和别的
 * 状态之间的切换都不缓冲，页面关闭前没存的提示也在页面那边，不经过这里。
 */
function useSteadyBadge(raw: Badge | null): Badge | null {
  const [held, setHeld] = useState(raw);
  const rawRef = useRef(raw);
  rawRef.current = raw;
  const since = useRef(Date.now()); // held 这一类（calm、busy）是什么时候开始显示的
  const heldKind = held?.kind ?? 'none';
  const rawKind = raw?.kind ?? 'none';
  const holding = (heldKind === 'calm' && rawKind === 'busy') || (heldKind === 'busy' && rawKind === 'calm');
  useEffect(() => {
    const latest = rawRef.current;
    if (!holding) {
      if (heldKind !== (latest?.kind ?? 'none')) since.current = Date.now();
      setHeld(prev => (prev?.text === latest?.text && prev?.tone === latest?.tone && prev?.kind === latest?.kind ? prev : latest));
      return;
    }
    const wait = rawKind === 'busy' ? SAVE_QUIET : Math.max(0, SAVE_SHOWN - (Date.now() - since.current));
    const timer = window.setTimeout(() => {
      since.current = Date.now();
      setHeld(rawRef.current);
    }, wait);
    return () => clearTimeout(timer);
  }, [holding, heldKind, rawKind, raw?.text, raw?.tone]);
  return holding ? held : raw;
}

/**
 * 页面往下滚过了没有（顶栏下面那条细线跟着它）。听显示着的那一页的滚动（同源的页面；另一个源的在线网页听不了，就当没滚）：
 * 报告区换了页面（重新显示时换过 iframe）、页面自己重新载入了，都跟过去
 */
function usePageScrolled(key: unknown) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const main = document.querySelector('.main');
    let frame: HTMLIFrameElement | null = null;
    let heard: Window | null = null;
    const check = () => { try { setScrolled(Boolean(heard && heard.scrollY > 0)); } catch { setScrolled(false); } };
    const hear = () => {
      try { heard?.removeEventListener('scroll', check); } catch { /* 另一个源 */ }
      heard = frame?.contentWindow ?? null;
      try { heard?.addEventListener('scroll', check, { passive: true }); } catch { heard = null; }
      check();
    };
    const follow = () => {
      const shown = document.querySelector<HTMLIFrameElement>('iframe.report-frame:not([data-pending])');
      if (shown === frame) return;
      frame?.removeEventListener('load', hear);
      frame = shown;
      frame?.addEventListener('load', hear);
      hear();
    };
    follow();
    const swapped = new MutationObserver(follow);
    if (main) swapped.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-pending'] });
    return () => {
      swapped.disconnect();
      frame?.removeEventListener('load', hear);
      try { heard?.removeEventListener('scroll', check); } catch { /* 另一个源 */ }
    };
  }, [key]);
  return scrolled;
}

/**
 * 顶栏：侧栏收起时的展开按钮、面包屑（打开着的文档和它的上级）、会话状态，右边是批注、收藏和「更多操作」。
 * 打开的是自定义页时左边只有它的标题（点它回到顶部），右边只有 ···（页的菜单，pageMenuEntries，和侧栏里那一行的一样），它的第一项是「添加自定义块」（页面连上、有画布、能回答 add-card 时）：
 * 收藏、字体与布局、目录、批注、导出、复制页面内容、演示视图都是文档才有的。
 * 打开的是网页链接时是它的上级和它（图标和名称），右边是「在浏览器中打开」和它的 ··· 菜单（和侧栏里那一行的一样，只是收藏、重命名、移动到
 * 在侧栏的菜单里，这里不重复）。打开的是扩展提供的条目时同样：扩展的名字、它上面的几级和它自己，右边是「在浏览器中打开」和复制网址、在新标签页打开
 * 打开的是别处的底稿（另一个工作区的文档）时和文档一样：面包屑、保存状态、批注、收藏和「更多操作」。「更多操作」和文档的是同一个菜单
 * （reportMenuEntries：同样的标题「文档」、项、顺序、分隔线，底部同样是上次编辑和字数；用户 2026-11-21），每一项都能用，
 * 同一服务按所有者前缀把修改写回它所在的存储目录；只有导入、移至回收区的悬停提示说清是在它所在的工作区里
 */
export function Topbar() {
  // 高 44px，取整到物理像素：报告区 iframe 的上边就是它（同侧栏的宽度，lib/devicePixels.ts）；
  // 滚动后底下那条线的粗细也取整到物理像素（--hairline），线就贴着这个整像素的底，125% 下不带毛边
  const ratio = usePixelRatio();
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--topbar-h', `${devicePx(44, ratio, 2)}px`);
    document.documentElement.style.setProperty('--hairline', `${hairline(ratio)}px`);
  }, [ratio]);
  const ws = useStore(workspaceStore);
  const nav = useStore(navStore);
  const current = currentDocument(nav);
  const pageSlug = currentPage(nav);
  const page = pageSlug ? pageOf(pageSlug, ws) : undefined;
  const mobile = useStore(sidebarStore, s => s.mobile);
  const session = useStore(sessionStore);
  const slowSave = useLasting(Boolean(session.connected && session.flags.saving), SLOW_SAVE);
  const steadyBadge = useSteadyBadge(session.slug === current ? sessionBadge(session, slowSave) : null);
  // 页面滚下去了：顶栏下面一条细线（topbar.css .scrolled）
  const scrolled = usePageScrolled(`${nav.current?.kind}:${nav.current?.slug}:${session.slug}:${session.connected}`);
  const moreOpen = usePopoverOwner('topbar-more');
  const crumbMoreOpen = usePopoverOwner('crumb-more');
  const renamingPage = useRenaming(pageSlug ?? '', 'title');
  useEffect(() => stopRename, [pageSlug]); // 换了页面：标题上的改名框不跟着去
  const liveTitle = useSessionTitle(current);
  const liveIcon = useSessionIcon(current);
  const report = current ? ws.reports[current] : undefined;
  const linkSlug = currentLink(nav);
  const link = linkSlug ? ws.reports[linkSlug] : undefined;
  const entryKey = nav.current?.kind === 'extension' ? nav.current.slug : null;
  // 扩展的文件暂时读不出来时（条目都不见了），打开着的条目照旧显示：顶栏留着最后读到的它
  const lastEntry = useRef<{ key: string; found: NonNullable<ReturnType<typeof extensionEntry>> } | null>(null);
  const read = entryKey ? extensionEntry(entryKey, ws) : undefined;
  if (read && entryKey) lastEntry.current = { key: entryKey, found: read };
  const provided = read ?? (entryKey && extensionUnreadable(entryKey, ws) && lastEntry.current?.key === entryKey ? lastEntry.current.found : undefined);

  // 点击收起侧栏后，鼠标离开 ≡ 所在位置才允许再次浮出
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (isPeekSuppressed() && !(e.target as Element).closest?.('#tbMenu')) clearSuppressPeek();
    };
    document.addEventListener('mousemove', onMove, { passive: true });
    return () => document.removeEventListener('mousemove', onMove);
  }, []);

  const title = page ? pageTitle(page) : link ? reportTitle(link) : provided ? provided.entry.title : liveTitle ?? reportTitle(report);
  const shown = Boolean(report || page || link || provided);
  useEffect(() => {
    document.title = shown ? `${title} · Gallery` : 'Gallery';
  }, [shown, title]);
  // 浏览器标签页的图标：打开的文档的页面图标（文档页上换了的先用），没有就是默认的文档图标（侧栏里没有图标的文档那个）。
  // 不能给空图：Chrome 碰到没有图或加载不出的图，会一直显示上一张，没图标的文档就顶着上一个文档的图标。
  // 所以先把图加载出来再换，加载不出（图片文件没了、表情包里没有）也用默认图标。
  const icon = page ? page.icon : link ? link.icon ?? link.siteIcon ?? null : provided ? provided.entry.icon ?? provided.extension.icon ?? null : report ? (liveIcon !== undefined ? liveIcon : report.icon) : null;
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) return;
    if (!icon || !(current || pageSlug || linkSlug || entryKey)) {
      link.href = DEFAULT_TAB_ICON;
      return;
    }
    const href = icon.startsWith('data:image/') ? icon : iconUrl(icon, current?.startsWith('~') ? null : current, { tab: true }); // 网页链接的网站图标是 data: 地址；// 自定义页的图标是表情或图标页签的，没有文件夹里的图
    let stale = false;
    const probe = new Image();
    probe.onload = () => { if (!stale) link.href = href; };
    probe.onerror = () => { if (!stale) link.href = DEFAULT_TAB_ICON; };
    probe.src = href;
    return () => { stale = true; };
  }, [icon, current, pageSlug, linkSlug, entryKey]);

  const menuButton = (
    <button
      id="tbMenu"
      className="icon-btn tb-menu"
      aria-label={t('展开侧边栏')}
      data-tip={mobile ? t('打开侧边栏') : t('锁定展开侧边栏')}
      data-sub={mobile ? undefined : `${MOD}\\`}
      onMouseEnter={() => { if (!isPeekSuppressed()) showPeek(); }}
      onMouseLeave={() => { clearSuppressPeek(); leavePeekTrigger(); }}
      onClick={() => (mobile ? setMobileOpen(true) : setExpanded(true))}
    >
      <Icon name="sidebar" />
    </button>
  );

  // 自定义页：左边只有标题，点它回到顶部（滚下去了的话）；右边只有 ···，页的菜单（pageMenuEntries）：重命名就在这里的标题上改（和侧栏那一行的改名框一样，
  // 改的是 page.json 的标题）；菜单的第一项「添加自定义块」，页面在自己的框里打开卡片库（放在 ··· 按钮下面、右边对齐，加到页面的第一块画布）
  if (page) {
    const addCard = async (button: HTMLElement) => {
      const frame = document.querySelector<HTMLIFrameElement>('iframe.report-frame:not([data-pending])');
      const at = button.getBoundingClientRect();
      const box = frame?.getBoundingClientRect();
      const anchor = box ? { left: at.left - box.left, right: at.right - box.left, top: at.top - box.top, bottom: at.bottom - box.top } : undefined;
      const reply = await command('add-card', { anchor });
      if (!reply.ok) toast(t('现在不能添加自定义块'), { tone: 'error' });
    };
    return (
      <header className={cls('topbar', 'tb-page', scrolled && 'scrolled')}>
        <div className="tb-left">
          {menuButton}
          <div className="crumbs">
            <span className="crumb-wrap">
              {renamingPage ? (
                <span className="crumb crumb-rename" data-current>
                  <RenameInput slug={page.slug} title={title} label={t('页面标题')} onSave={value => void renameCustomPage(page.slug, value)} />
                </span>
              ) : (
                <button className="crumb" data-current onClick={() => { if (can('scroll-top', session)) void command('scroll-top'); }}>
                  <span className="t" data-tip-cut="">{title}</span>
                </button>
              )}
            </span>
          </div>
        </div>
        <div className="tb-right">
          <ExtensionSlot name="topbar-end" />
          <button
            className={cls('icon-btn', moreOpen && 'menu-open')}
            data-tip={t('更多操作')}
            aria-label={t('操作')}
            aria-haspopup="menu"
            aria-expanded={moreOpen}
            onClick={e => {
              const button = e.currentTarget;
              openMenu(button, pageMenuEntries(page.slug, {
                inTopbar: true,
                onRename: () => startRename(page.slug, 'title'),
                onAddCard: can('add-card') ? () => void addCard(button) : undefined,
                onNewPage: () => void createCustomPage(page.slug, renameNewPage),
              }), { placement: 'bottom-end', ownerKey: 'topbar-more' });
            }}
          >
            <Icon name="moreLg" />
          </button>
        </div>
      </header>
    );
  }
  // 网页链接、扩展提供的有网址的条目：没有顶栏（网页占满内容区；拒绝嵌入时卡片上仍有「在浏览器中打开」，LinkView.tsx）。
  // 侧栏收起时由贴左边的悬浮按钮唤出（WebSidebarButton）。浏览器标签页的标题和图标照旧跟着它（上面的 effect）
  if ((linkSlug && link) || (entryKey && provided)) return null;
  if (!current || !report) return <header className="topbar"><div className="tb-left">{menuButton}</div></header>;

  const chain = [...ancestorsOf(ws.meta, current), current];
  let crumbs: Crumb[] = chain.map(slug => ({ slug }));
  if (mobile && chain.length > 1) crumbs = [{ more: chain.slice(0, -1) }, { slug: current }];
  else if (chain.length > 4) crumbs = [{ slug: chain[0] }, { more: chain.slice(1, -2) }, { slug: chain.at(-2)! }, { slug: current }];

  const fav = ws.meta.favorites.includes(current);
  const live = session.slug === current && session.connected;
  const badge = steadyBadge;
  const crumbTitle = (slug: string) => (slug === current ? title : reportTitle(ws.reports[slug]));
  // 当前报告那一项：报告往下滚过了就平滑回到顶部，否则打开页面浮层（不是改名）
  // 用键盘按的（click 的 detail 是 0）：焦点进浮层
  const clickCurrent = async (button: HTMLElement, keyboard: boolean) => {
    if (live && can('scroll-top', session) && (await command('scroll-top')).scrolled) closeCrumbPopup();
    else openCrumbPopup(current, button, keyboard);
  };

  return (
    <header className={cls('topbar', scrolled && 'scrolled')}>
      <div className="tb-left">
        {menuButton}
        <div className="crumbs">
          {crumbs.map((c, i) => (
            <span key={'slug' in c ? c.slug : `more-${i}`} className="crumb-wrap">
              {i > 0 && <span className="crumb-sep">/</span>}
              {'more' in c ? (
                <button className="crumb" aria-label={t('上级页面')} aria-haspopup="menu" aria-expanded={crumbMoreOpen} onClick={e => openMenu(e.currentTarget, c.more.map(slug => ({
                  icon: 'page', label: reportTitle(ws.reports[slug]), onSelect: () => void openReport(slug),
                })), { ownerKey: 'crumb-more' })}>…</button>
              ) : (
                <button
                  className="crumb"
                  data-current={c.slug === current || undefined}
                  onMouseEnter={e => hoverCrumb(c.slug, e.currentTarget)}
                  onMouseLeave={leaveCrumb}
                  onClick={e => void (c.slug !== current ? openReport(c.slug) : clickCurrent(e.currentTarget, e.detail === 0))}
                >
                  <span className="t" data-tip-cut="">{crumbTitle(c.slug)}</span>
                </button>
              )}
            </span>
          ))}
        </div>
        {badge && <span key={badge.text} className={cls('session-badge', badge.tone)}>{badge.text}</span>}
        <CrumbPopupHost />
      </div>
      <div className="tb-right">
        <AnnotateButton />
        <ExtensionSlot name="topbar-end" />
        <button className={cls('icon-btn', fav && 'on')} data-tip={fav ? t('取消收藏') : t('收藏')} aria-label={t('收藏')} aria-pressed={fav} onClick={() => toggleFavorite(current)}>
          <Icon name={fav ? 'starFill' : 'star'} />
        </button>
        <button
          className={cls('icon-btn', moreOpen && 'menu-open')}
          data-tip={t('更多操作')}
          aria-label={t('操作')}
          aria-haspopup="menu"
          aria-expanded={moreOpen}
          onClick={e => {
            const btn = e.currentTarget;
            const anchor = () => document.querySelector<HTMLElement>('.crumb[data-current]') ?? btn;
            openMenu(btn, [
              // 文档和别处的底稿是同一份（reportMenuEntries 里只差悬停提示和找不到底稿时用不了的项），底部的上次编辑和字数放在最后
              ...reportMenuEntries(current, anchor, { withExport: true, foot: false }),
              // 字体与布局：这份文档的字体、字体大小、正文宽度、正文间距（doc.json 的 look），
              // 子菜单卡片（LookMenu.tsx），点了不关菜单，报告页马上换上；写作偏好那份没有（也就没有这一组：分隔线跟着它，目录和它同组）
              ...(report.instructions ? [] : [{ kind: 'sep' as const }, { key: 'look', icon: 'textFormat' as const, label: t('字体与布局'), submenu: () => <LookCard slug={current} />, submenuClass: 'look-menu' }]),
              // 目录：页面右侧的标题目录，开关跟着这份文档走（每份文档各记各的，默认不开），报告页马上跟着变，
              // 别的标签页里开着的同一份也跟着；所有目录的文档共用带所有者身份的存储键。
              ...(report.instructions ? [] : [{ kind: 'switch' as const, key: 'outline', icon: 'outline' as const, label: t('目录'), tip: t('在页面右侧显示标题目录，点击标题跳到那里'), value: () => outlineOpen(current), onChange: (on: boolean) => setOutlineOpen(current, on) }]),
              // 全宽：目录下面，同样不在写作偏好那份上；这份文档的样子（look.full），不管正文宽度是多少都全宽显示（LookMenu.tsx）
              ...(report.instructions ? [] : [fullWidthEntry(current)]),
              // 宽表格：全宽下面；比正文宽的表格居中、左右超出正文（look.tables，LookMenu.tsx wideTablesEntry）
              ...(report.instructions ? [] : [wideTablesEntry(current)]),
              // 上次编辑和字数：底稿的由它所在工作区的服务答（GET /~<ws>/__gallery/workspace/stats，workspace/api.ts 按所有者前缀发）
              { kind: 'sep' as const }, { kind: 'foot' as const, content: <ReportStats slug={current} /> },
            ], { placement: 'bottom-end', ownerKey: 'topbar-more' });
          }}
        >
          <Icon name="moreLg" />
        </button>
      </div>
    </header>
  );
}
