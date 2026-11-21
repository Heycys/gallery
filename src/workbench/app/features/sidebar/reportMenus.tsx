import { openExtensionSettings } from '../extensions/ExtensionSettings';
import { setStartup, startupEnabled, startupStore } from '../preferences/startup';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Icon, PageIcon } from '../../components/Icon';
import type { MenuEntry } from '../../components/Menu';
import { openPopover } from '../../components/Popover';
import { toast } from '../../components/Toast';
import { useStore } from '../../lib/store';
import { cls } from '../../lib/util';
import { extensionEntry, openExtensionInTab, openInTab, openPageInTab } from '../../state/navigation';
import { setExpandedKey } from '../../state/tree';
import {
  copyDraftPath, copyLinkUrl, copyPageContent, copySourcePath, destroyAllTrash, destroyReport, duplicateReport, editReportTitle, moveReport, openInBrowser, removeDraft, restoreDefaultCards, restoreReport, revealFolder,
  deleteExtension, switchLanguage, toggleFavorite, trashCustomPage, trashDeleteBusy, trashReport,
} from '../../workspace/commands';
import { openExport, openImport } from '../transfer/TransferDialogs';
import { openHistory } from '../history/HistoryDialog';
import { openComponentSettings } from '../preferences/ComponentSettings';
import { openWritingPreferences } from '../preferences/WritingPreferences';
import { openPresentation } from '../present/Presentation';
import { ancestorsOf, columnOf, columnTop, flatten, isInside } from '../../workspace/meta';
import * as api from '../../workspace/api';
import { columnShown, columnTitle, pageOf, reportTitle, workspaceStore, workspaceTitle } from '../../workspace/store';
import { openLinkForm } from './LinkForm';
import { DOCS } from '../../../../shared/outline-shape.mjs';
import { LANGUAGES, language } from '../../../../shared/i18n/index.mjs';
import { preference, setPreference } from '../../../../shared/preferences.mjs';
import { previewUrl } from '../report/ReportView';
import { t } from '../../../../shared/i18n/index.mjs';

type MaybeEntry = MenuEntry | false;
const compact = (list: MaybeEntry[]) => list.filter(Boolean) as MenuEntry[];
/** 分隔线只在两组之间：紧跟标题、紧跟另一条分隔线、在最后的不要（有的项不出现时，它两边的线不叠成两条） */
const tidy = (list: MenuEntry[]) => list.filter((entry, at) => entry.kind !== 'sep' || (at > 0 && list[at - 1].kind !== 'sep' && list[at - 1].kind !== 'head' && at < list.length - 1));

/**
 * 报告「···」菜单（侧栏条目的 ··· 和右键、顶栏共用）。
 * 重命名：侧栏条目传 onRename，在条目上直接改；顶栏没有条目可改，选中报告页里的标题。
 * 顶栏的「更多操作」（withExport）只放打开着的文档才有的操作：收藏（顶栏有星标）、重命名、创建副本、移动到都在侧栏条目的菜单里，这里不重复。
 * 历史版本两边都有（features/history/：存下的版本，恢复到其中一版）。
 * 它的头两项是复制页面内容和复制本地路径（doc.html 在这台电脑上的位置，好直接告诉 Agent 改哪份）。条目的菜单里没有「链接到…」（2026-11-09）：
 * 网页在栏标题的 ··· › 添加在线网页… 里加。
 * 打开着的别处的底稿（另一个工作区的文档）顶栏也是这一份（用户 2026-11-21：“不同工作区的都是几乎一样的”）：同样的标题「文档」、项、顺序、
 * 分隔线和底部；只是导入、移至回收区的悬停提示说清是在它所在的工作区里，复制本地路径复制的是底稿的位置（report.path），
 * 找不到底稿（missing）时用不了的项不出现。侧栏里底稿那一行的菜单另是 draftMenuEntries。
 * foot：false 时不带最后的分隔线和上次编辑、字数（顶栏在字体与布局、目录、全宽、宽表格下面自己放）。
 * ownerKey：打开这个菜单的那一行（Popover 的 ownerKey）；从菜单里开的移动到、修改网址也挂在它上面，开着时那一行一直标着（.menu-open）
 */
export function reportMenuEntries(slug: string, anchorFor: () => HTMLElement, { withExport = false, foot = true, onRename, onChangeIcon, ownerKey }: { withExport?: boolean; foot?: boolean; onRename?: () => void; onChangeIcon?: () => void; ownerKey?: string } = {}): MenuEntry[] {
  const ws = workspaceStore.get();
  const report = ws.reports[slug];
  const fav = ws.meta.favorites.includes(slug);
  const tree = !withExport; // the tree's menu, not the top bar's
  const draft = report?.kind === 'draft'; // 别处的底稿：只有顶栏用这一份
  const there = !report?.missing; // 底稿找得到（文档总是）
  if (report?.instructions) {
    return compact([
      { kind: 'head', label: t('写作偏好') },
      withExport && { icon: 'copy', label: t('复制页面内容'), tip: t('Markdown 格式'), onSelect: () => copyPageContent(slug) },
      { icon: 'external', label: t('在新标签页打开'), onSelect: () => window.open(previewUrl(slug), '_blank') },
      withExport && { icon: 'exportOut', label: t('导出'), tip: t('PDF、HTML、Markdown'), onSelect: () => openExport(slug) },
      foot && { kind: 'sep' },
      foot && { kind: 'foot', content: <ReportStats slug={slug} /> },
    ]);
  }
  return tidy(compact([
    { kind: 'head', label: t('文档@doc') },
    withExport && there && { icon: 'copy', label: t('复制页面内容'), tip: t('Markdown 格式'), onSelect: () => copyPageContent(slug) },
    withExport && (!draft || Boolean(report?.path)) && { icon: 'fileCode', label: t('复制本地路径'), tip: t('这份文档在电脑上的位置，可以直接告诉 Agent'), onSelect: () => (draft ? copyDraftPath(slug) : copySourcePath(slug)) },
    withExport && { kind: 'sep' },
    withExport && there && { icon: 'present', label: t('演示视图'), tip: t('全屏放映，可用激光笔和画笔'), onSelect: () => openPresentation(slug) },
    tree && { icon: fav ? 'starOff' : 'star', label: fav ? t('取消收藏') : t('收藏'), onSelect: () => toggleFavorite(slug) },
    tree && { kind: 'sep' },
    tree && { icon: 'rename', label: t('重命名'), onSelect: onRename ?? (() => void editReportTitle(slug)) },
    tree && onChangeIcon !== undefined && { icon: 'smile', label: t('更换图标'), onSelect: onChangeIcon },
    tree && { icon: 'duplicate', label: t('创建副本'), onSelect: () => void duplicateReport(slug) },
    tree && { icon: 'moveTo', label: t('移动到'), onSelect: () => openMoveTo(slug, anchorFor(), ownerKey) },
    there && { icon: 'history', label: t('历史版本'), tip: t('这份文档以前的样子，可以恢复到其中一版'), onSelect: () => openHistory(slug) },
    there && { icon: 'external', label: t('在新标签页打开'), onSelect: () => openInTab(slug) },
    withExport && { kind: 'sep' },
    withExport && there && { icon: 'importIn', label: t('导入'), tip: draft ? t('导入的页面在它所在的工作区里') : undefined, onSelect: () => openImport(slug) },
    withExport && there && { icon: 'exportOut', label: t('导出'), tip: t('PDF、HTML、Markdown'), onSelect: () => openExport(slug) },
    { kind: 'sep' },
    there && { icon: 'trash', label: t('移至回收区'), tip: draft ? t('进它所在工作区的回收区') : undefined, danger: true, onSelect: () => void trashReport(slug) },
    foot && { kind: 'sep' },
    foot && { kind: 'foot', content: <ReportStats slug={slug} /> },
  ]));
}

/**
 * 自定义页的菜单（侧栏里那一行悬停时的 ··· 和右键，和顶栏右上角的 ···，同一个函数，项一样）：重命名、复制本地路径（page.html 在这台电脑上的位置，
 * 好直接告诉 Agent 改哪一页）、在文件夹中显示（它的 pages/<slug>/）、在新标签页打开；一条分隔线，新建页面（一个空白页，放在这一页下面，
 * 中间说让 Agent 来写）和有默认卡片的页（page.json 的 defaultCards，默认首页有）的恢复默认卡片；再一条分隔线，红字的移至回收区（首页也一样，
 * 能从回收区恢复）。顶栏的（inTopbar）第一项是添加自定义块（onAddCard：页面连上、有画布、能回答 add-card 时才有，和别的项一样的普通菜单项，
 * 没有颜色；它下面一条分隔线，打开的是这一页的卡片库，所以侧栏的行里没有）。页上的内容归 Agent 写、页不在文档树里，
 * 所以没有创建副本、移动到，也没有「链接到…」。侧栏那一行的菜单在重命名下面有更换图标（onChangeIcon：图标选择器开在那一行的图标下面）
 */
export function pageMenuEntries(slug: string, { inTopbar = false, onRename, onChangeIcon, onAddCard, onNewPage }: { inTopbar?: boolean; onRename: () => void; onChangeIcon?: () => void; onAddCard?: () => void; onNewPage: () => void }): MenuEntry[] {
  const defaults = Boolean(pageOf(slug)?.defaultCards);
  return compact([
    { kind: 'head', label: t('自定义页') },
    inTopbar && onAddCard !== undefined && { icon: 'plus', label: t('添加自定义块'), onSelect: onAddCard },
    inTopbar && onAddCard !== undefined && { kind: 'sep' },
    { icon: 'rename', label: t('重命名'), onSelect: onRename },
    onChangeIcon !== undefined && { icon: 'smile', label: t('更换图标'), onSelect: onChangeIcon },
    { icon: 'fileCode', label: t('复制本地路径'), tip: t('这一页在电脑上的位置，可以直接告诉 Agent'), onSelect: () => copySourcePath(slug, { page: true }) },
    { icon: 'folder', label: t('在文件夹中显示'), onSelect: () => void revealFolder({ page: slug }) },
    { icon: 'external', label: t('在新标签页打开'), onSelect: () => openPageInTab(slug) },
    { kind: 'sep' },
    { icon: 'compose', label: t('新建页面'), tip: t('一个空白页，放在这一页下面，让 Agent 来写'), onSelect: onNewPage },
    defaults && { icon: 'restore', label: t('恢复默认卡片'), tip: t('把缺的默认卡片放回空位，别的不动'), onSelect: () => void restoreDefaultCards(slug) },
    { kind: 'sep' },
    { icon: 'trash', label: t('移至回收区'), danger: true, onSelect: () => void trashCustomPage(slug) },
  ]);
}

/**
 * 网页链接的「···」菜单（侧栏条目的 ··· 和右键；顶栏的「更多操作」是 inTopbar：收藏、重命名、移动到在侧栏条目的菜单里，那里不重复）：
 * 收藏、重命名、修改网址…、在浏览器中打开、复制网址、移动到、在新标签页打开、移至回收区
 */
export function linkMenuEntries(slug: string, anchorFor: () => HTMLElement, { inTopbar = false, onRename, onChangeIcon, ownerKey }: { inTopbar?: boolean; onRename?: () => void; onChangeIcon?: () => void; ownerKey?: string } = {}): MenuEntry[] {
  const ws = workspaceStore.get();
  const url = ws.reports[slug]?.url ?? '';
  const fav = ws.meta.favorites.includes(slug);
  const tree = !inTopbar;
  return compact([
    { kind: 'head', label: t('网页链接') },
    tree && { icon: fav ? 'starOff' : 'star', label: fav ? t('取消收藏') : t('收藏'), onSelect: () => toggleFavorite(slug) },
    tree && { kind: 'sep' },
    tree && onRename !== undefined && { icon: 'rename', label: t('重命名'), onSelect: onRename },
    tree && onChangeIcon !== undefined && { icon: 'smile', label: t('更换图标'), onSelect: onChangeIcon },
    { icon: 'link', label: t('修改网址…'), onSelect: () => openLinkForm(anchorFor(), { slug, ownerKey }) },
    { icon: 'web', label: t('在浏览器中打开'), onSelect: () => openInBrowser(url) },
    { icon: 'copy', label: t('复制网址'), onSelect: () => copyLinkUrl(url) },
    tree && { icon: 'moveTo', label: t('移动到'), onSelect: () => openMoveTo(slug, anchorFor(), ownerKey) },
    { icon: 'external', label: t('在新标签页打开'), onSelect: () => openInTab(slug) },
    { kind: 'sep' },
    { icon: 'trash', label: t('移至回收区'), danger: true, onSelect: () => void trashReport(slug) },
  ]);
}

/**
 * 别处的底稿（另一个工作区的文档）的「···」菜单（侧栏条目的 ··· 和右键）：收藏、重命名（改的是那篇底稿的标题，由同一服务写回原目录）、创建副本、移动到、
 * 历史版本（存在它所在工作区的 .gallery/state/history/ 里，由那个工作区的编辑服务答）、在新标签页打开、复制本地路径、在文件夹中显示；
 * 最后一组是从文档树移除（只移除这一条，不删底稿）、移至回收区（进它所在工作区的回收区）。
 * 找不到底稿的（灰着的）只有收藏、移动到、复制本地路径和从文档树移除。
 * 顶栏的「更多操作」不用这一份：打开着的底稿和文档一样用 reportMenuEntries（用户 2026-11-21）。
 * 所有命令都走同一个服务，按所有者前缀写回原目录（commands.ts、workspace/api.ts）
 */
export function draftMenuEntries(slug: string, anchorFor: () => HTMLElement, { onRename, onChangeIcon, ownerKey }: { onRename?: () => void; onChangeIcon?: () => void; ownerKey?: string } = {}): MenuEntry[] {
  const ws = workspaceStore.get();
  const report = ws.reports[slug];
  const fav = ws.meta.favorites.includes(slug);
  const there = !report?.missing;
  return compact([
    { kind: 'head', label: report?.workspace ? t('别处的底稿 · {0}', workspaceTitle(report.workspace, ws)) : t('别处的底稿') },
    { icon: fav ? 'starOff' : 'star', label: fav ? t('取消收藏') : t('收藏'), onSelect: () => toggleFavorite(slug) },
    { kind: 'sep' },
    there && onRename !== undefined && { icon: 'rename', label: t('重命名'), tip: t('改的是那篇底稿的标题'), onSelect: onRename },
    there && onChangeIcon !== undefined && { icon: 'smile', label: t('更换图标'), onSelect: onChangeIcon },
    there && { icon: 'duplicate', label: t('创建副本'), tip: t('副本在它所在的工作区里'), onSelect: () => void duplicateReport(slug) },
    { icon: 'moveTo', label: t('移动到'), tip: t('只改它在这里的显示位置，文件不动'), onSelect: () => openMoveTo(slug, anchorFor(), ownerKey) },
    there && { icon: 'history', label: t('历史版本'), tip: t('这份文档以前的样子，可以恢复到其中一版'), onSelect: () => openHistory(slug) },
    there && { icon: 'external', label: t('在新标签页打开'), onSelect: () => openInTab(slug) },
    Boolean(report?.path) && { icon: 'fileCode', label: t('复制本地路径'), tip: report?.path, onSelect: () => copyDraftPath(slug) },
    there && { icon: 'folder', label: t('在文件夹中显示'), onSelect: () => void revealFolder({ entry: slug }) },
    { kind: 'sep' },
    (!ws.shared || !there) && { icon: 'minus', label: t('从文档树移除'), tip: t('只移除这一条，不删除底稿'), onSelect: () => removeDraft(slug) },
    there && { icon: 'trash', label: t('移至回收区'), tip: t('进它所在工作区的回收区'), danger: true, onSelect: () => void trashReport(slug) },
  ]);
}

/**
 * 扩展条目菜单：有网址的可打开/复制网址，一级条目可确认删除整棵子树；共用 sidebar.json 写回流程。
 */
export function extensionMenuEntries(key: string, { inTopbar = false }: { inTopbar?: boolean } = {}): MenuEntry[] {
  const found = extensionEntry(key);
  const url = found?.entry.url ?? '';
  const root = found?.extension.entries.some(entry => entry.id === found.entry.id);
  return compact([
    { kind: 'head', label: found?.extension.title ?? t('扩展') },
    url && !inTopbar && { icon: 'web', label: t('在浏览器中打开'), onSelect: () => openInBrowser(url) },
    url && { icon: 'copy', label: t('复制网址'), onSelect: () => copyLinkUrl(url) },
    url && { icon: 'external', label: t('在新标签页打开'), onSelect: () => openExtensionInTab(key) },
    root && url && { kind: 'sep' },
    root && { icon: 'trash', label: t('删除页面'), danger: true, disabled: !found?.extension.revision, onSelect: () => void deleteExtension(found!.extension.id, found!.entry.id) },
  ]);
}

/* ---------------- 移动到（只改目录组织） ---------------- */

/**
 * 移动到：一张菜单样子的卡片，上面是筛选框，下面是栏和文档。键盘：↑ / ↓ 在各行之间移动（到头接到另一头，每次筛选后回到第一行），
 * 回车选它（输入法正在拼字时的回车不算）；指针移到哪一行就是哪一行，只有一处高亮（controlled：不靠 :hover）。
 * ownerKey 是打开它的那一行的菜单的（Popover：卡片开着时那一行一直标着）
 */
export function openMoveTo(slug: string, anchor: HTMLElement, ownerKey?: string) {
  openPopover({ anchor, ownerKey, placement: 'right-start', className: 'menu-wide controlled', content: close => <MoveToPopover slug={slug} close={close} /> });
}

function MoveToPopover({ slug, close }: { slug: string; close: () => void }) {
  const ws = useStore(workspaceStore);
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const query = q.trim().toLowerCase();
  // 一栏的顶层（只有这个工作区自己一栏时是「顶层」，和分栏之前一样）；按名字筛。扩展提供的栏里放不了条目，移除了的栏不显示，都不在其中；
  // 文档也只列画出来的栏里的（放到不画的栏里的条目下面，它就看不见了）
  const groups = ws.meta.groups.filter(group => !group.extension && columnShown(group, ws));
  const targets = useMemo(
    () => flatten(ws.meta).filter(s => {
      const column = columnOf(ws.meta, s);
      return Boolean(column && columnShown(column, ws)) && !isInside(ws.meta, s, slug) && reportTitle(ws.reports[s]).toLowerCase().includes(query);
    }),
    [ws, slug, query],
  );
  const columns = groups.filter(group => columnTitle(group).toLowerCase().includes(query) || (!query && groups.length === 1));
  const single = groups.length === 1;
  // 路径：在「文档」以外的栏里的，前面是栏的名字
  const path = (s: string) => {
    const column = columnOf(ws.meta, s);
    return [...(column && column.id !== DOCS ? [columnTitle(column)] : []), ...ancestorsOf(ws.meta, s).map(a => reportTitle(ws.reports[a]))].join(' / ');
  };
  const done = (ok: boolean, name: string) => { close(); if (ok) toast(t('已移动到「{0}」', name), { routine: true }); };
  // 键盘选的那一行（各行按列出来的顺序数）：每次筛选后回到第一行
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => setActive(0), [query]);
  const shownColumns = (single ? !query : columns.length > 0) ? (single ? groups : columns) : [];
  const count = shownColumns.length + targets.length;
  const at = count ? Math.min(active, count - 1) : -1;
  useEffect(() => { list.current?.querySelector('.menu-item.active')?.scrollIntoView({ block: 'nearest' }); }, [at]);
  const toColumn = (group: (typeof groups)[number]) => done(moveReport(slug, { pos: 'root', column: columnTop(group) }), single ? t('顶层') : columnTitle(group));
  const toDocument = (s: string) => {
    const ok = moveReport(slug, { pos: 'inside', ref: s });
    if (ok) setExpandedKey(s, true);
    done(ok, reportTitle(ws.reports[s]));
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && count) {
      e.preventDefault();
      setActive((at + (e.key === 'ArrowDown' ? 1 : count - 1)) % count);
    } else if (e.key === 'Enter' && !e.nativeEvent.isComposing && at >= 0) {
      e.preventDefault();
      if (at < shownColumns.length) toColumn(shownColumns[at]); else toDocument(targets[at - shownColumns.length]);
    }
  };
  return (
    <>
      <div className="pop-search"><input ref={input} className="pop-input" aria-label={t('移动到…')} autoComplete="off" placeholder={t('移动到…')} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKeyDown} /></div>
      <div className="pop-list" ref={list}>
        {shownColumns.length > 0 && (
          <>
            {!single && <div className="menu-head">{t('栏')}</div>}
            {shownColumns.map((group, index) => (
              <div key={group.id} className={cls('menu-item', at === index && 'active')} data-column={group.id} onMouseMove={() => { if (at !== index) setActive(index); }} onClick={() => toColumn(group)}>
                <span className="mi-icon"><Icon name="sidebar" /></span><span className="mi-label">{single ? t('顶层') : columnTitle(group)}</span>
              </div>
            ))}
          </>
        )}
        <div className="menu-head">{t('文档')}</div>
        {targets.length ? targets.map((s, index) => (
          <div key={s} className={cls('menu-item', at === shownColumns.length + index && 'active')} onMouseMove={() => { if (at !== shownColumns.length + index) setActive(shownColumns.length + index); }} onClick={() => toDocument(s)}>
            <span className="mi-icon"><span className="pg-icon"><PageIcon icon={ws.reports[s]?.icon} slug={ws.reports[s]?.kind ? undefined : s} fallback={ws.reports[s]?.kind === 'link' ? 'web' : 'page'} /></span></span>
            <span className="mi-label">{reportTitle(ws.reports[s])}</span>
            <span className="mi-kbd">{path(s)}</span>
          </div>
        )) : <div className="menu-empty">{t('没有匹配的文档')}</div>}
      </div>
    </>
  );
}

/* ---------------- 回收区（设置的子菜单：悬停或点一下打开，Menu.tsx MenuList） ---------------- */

function TrashPopover() {
  const { trash } = useStore(workspaceStore);
  const busy = useStore(trashDeleteBusy);
  return (
    <>
      <div className="menu-head trash-head">
        <span>{t('回收区')}</span>
        <button className="dialog-btn danger primary trash-clear" disabled={busy || !trash.length} onClick={() => void destroyAllTrash()}>{t('删除全部')}</button>
      </div>
      {trash.length ? trash.map(e => (
        <div key={e.id} className="trash-item">
          <span className="pg-icon"><Icon name={e.kind === 'page' ? 'board' : e.kind === 'link' ? 'web' : 'page'} /></span>
          <span className="t">{e.title}</span>
          <button className="row-act" disabled={busy} data-tip={t('恢复')} aria-label={t('恢复')} onClick={() => void restoreReport(e.id)}><Icon name="restore" /></button>
          <button className="row-act" disabled={busy} data-tip={t('永久删除')} aria-label={t('永久删除')} onClick={() => void destroyReport(e.id)}><Icon name="trash" /></button>
        </div>
      )) : <div className="menu-empty">{t('回收区是空的')}</div>}
    </>
  );
}

/** 回收区那一行右边的个数：跟着回收区变（菜单开着时恢复、删掉了一项，或刚移进来的一项列表才到） */
function TrashCount() {
  const count = useStore(workspaceStore, s => s.trash.length);
  return count ? <>{count}</> : null;
}

/* ---------------- 工作区菜单：报告列表 + 外观 ---------------- */

/** 设置（侧栏底部）：导入、回收区（子菜单），偏好，和界面的语言（文档列表自己会跟着变：回到这个标签页、做完一个操作都会重新读取，不用手动刷新） */
export function workspaceMenuEntries(): MenuEntry[] {
  return [
    { icon: 'importIn', label: t('导入'), onSelect: () => openImport('') },
    { icon: 'trash', label: t('回收区'), kbd: <TrashCount />, submenu: () => <TrashPopover />, submenuClass: 'settings-menu' },
    { kind: 'sep' },
    { kind: 'head', label: t('偏好') },
    { icon: 'guide', label: t('写作偏好'), tip: t('Agent 写报告时照着写的规则，每次写报告前都会先读'), onSelect: () => void openWritingPreferences() },
    { kind: 'switch', icon: 'frame', label: t('显示编辑框'), tip: t('点进一段文字时，在它周围显示蓝色虚线框'), value: () => preference('editFrame'), onChange: on => setPreference('editFrame', on) },
    { kind: 'switch', icon: 'bell', label: t('减少通知'), tip: t('日常操作不再提示，只说需要你处理或你该知道的事'), value: () => preference('quietNotices'), onChange: on => setPreference('quietNotices', on) },
    { kind: 'switch', icon: 'diff', label: t('显示变更'), tip: t('Agent 改过文档后，新增的标绿、删掉的标红，可以在页面底部确认或撤回'), value: () => preference('showChanges'), onChange: on => setPreference('showChanges', on) },
    { kind: 'sep' },
    { kind: 'head', label: t('功能') },
    { icon: 'blocks', label: t('组件列表'), tip: t('文档菜单里出现哪些块，这个工作区加载哪些自定义块'), onSelect: openComponentSettings },
    { icon: 'puzzle', label: t('拓展列表'), onSelect: openExtensionSettings },
    { kind: 'switch', icon: 'power', label: t('开机自启动'), tip: t('登录系统后在后台启动 Gallery，不打开浏览器窗口'), value: startupEnabled, onChange: setStartup, subscribe: startupStore.subscribe, snapshot: startupStore.get },
    { kind: 'sep' },
    { kind: 'head', label: t('语言') },
    // 语言这一组不带图标（2026-11-17 定的）：两行就是两种语言的名字，选中的那一行右边一个 ✓
    ...Object.entries(LANGUAGES).map(([code, name]) => ({ label: name, check: code === language, onSelect: () => void switchLanguage(code) })),
  ];
}

/* ---------------- 文档菜单底部：上次编辑时间和字数 ---------------- */

// 今天 / 昨天 / 今年的几月几日，带时分；更早的写年月日
function editedLabel(ms: number) {
  const at = new Date(ms);
  const now = new Date();
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(at)) / 86400000);
  if (days === 0) return t('今天 {0}@edited', time);
  if (days === 1) return t('昨天 {0}@edited', time);
  // 更早的：这种语言自己的写法（10月20日、Oct 20）
  const date = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(language === 'en' ? 'en' : 'zh-CN', { month: language === 'en' ? 'short' : 'long', day: 'numeric', ...options }).format(at);
  if (at.getFullYear() === now.getFullYear()) return `${date({})} ${time}`;
  return date({ year: 'numeric' });
}

/** 菜单打开时向 dev:local 要一次（GET stats）：上次编辑的时间（report.html 上次写入）和字数；没拿到前留出两行，菜单不跳 */
export function ReportStats({ slug }: { slug: string }) {
  const [stats, setStats] = useState<{ edited: number; words: number } | null>(null);
  useEffect(() => {
    let live = true;
    api.stats(slug).then(value => { if (live) setStats(value); }, () => {});
    return () => { live = false; };
  }, [slug]);
  return (
    <div className="menu-stats">
      <div>{stats ? t('上次编辑 {0}', editedLabel(stats.edited)) : '\u00a0'}</div>
      <div>{stats ? t('{0} 个字', stats.words.toLocaleString('zh-CN')) : '\u00a0'}</div>
    </div>
  );
}
