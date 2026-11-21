import { useEffect, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react';
import { Icon, PageIcon } from '../../components/Icon';
import type { MenuEntry } from '../../components/Menu';
import { openMenu, usePopoverOwner } from '../../components/Popover';
import { useStore } from '../../lib/store';
import { cls } from '../../lib/util';
import { toast } from '../../components/Toast';
import { currentEntry, navStore, openReport } from '../../state/navigation';
import { unseenBelow, updatesStore } from '../../state/updates';
import { useSessionIcon, useSessionTitle } from '../report/useSessionTitle';
import {
  FAV, expKey, setExpandedKey, setSectionExpanded, toggleExpandedKey, toggleSection, treeStore, type SectionKey, type TreeScope,
} from '../../state/tree';
import { changeIcon, copyWorkspacePath, createColumn, createReport, removeColumn, renameColumn, renameExtension, renameLink, revealFolder } from '../../workspace/commands';
import { childrenOf, columnTop, ownColumnOf } from '../../workspace/meta';
import { columnAbove, columnPath, columnShown, columnTitle, columnWorkspace, reportTitle, workspaceStore, workspaceTitle, type WorkspaceState } from '../../workspace/store';
import type { Column } from '../../workspace/types';
import { DOCS } from '../../../../shared/outline-shape.mjs';
import { openLinkForm } from './LinkForm';
import { openProjectForm } from './ProjectForm';
import { ExtensionRows, extensionColumnMenuEntries } from './SidebarExtension';
import { RenameInput, startRename, useRenaming } from './RenameInput';
import { draftMenuEntries, linkMenuEntries, reportMenuEntries } from './reportMenus';
import { useTreeDnd } from './useTreeDnd';
import { openIconPicker, useIconPicking } from './iconPicker';
import { t } from '../../../../shared/i18n/index.mjs';

/**
 * 侧栏滚动区：「收藏」，然后是并列的几栏（shared/outline-shape.mjs）：这个工作区自己的一栏（默认工作区的叫「默认文档」），本机登记过的别的工作区
 * 各一栏（读者移除了的、工作区不在了的不显示：columnShown），读者新建的栏，旧版的「链接」栏。新建在头部，栏的末尾没有「新建文档」一行；
 * 回收区和写作偏好在底部的「设置」里。扩展提供的栏（SidebarExtension.tsx）也是其中的一栏：位置可以拖，条目归扩展管
 */
export function SidebarTree({ onScrolled }: { onScrolled: (scrolled: boolean) => void }) {
  const ws = useStore(workspaceStore);
  const tree = useStore(treeStore);
  const nav = useStore(navStore);
  const unseen = useStore(updatesStore);
  const current = currentEntry(nav);
  const { revealNonce } = nav;
  const scrollRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  useTreeDnd(scrollRef, lineRef);

  // 打开报告时把它滚动到可见位置
  useEffect(() => {
    scrollRef.current?.querySelector(`.row[data-id="${CSS.escape(current ?? '')}"]:is([data-scope="tree"], [data-scope="ext"])`)?.scrollIntoView({ block: 'nearest' });
  }, [current, revealNonce]);

  const favs = ws.meta.favorites.filter(s => ws.reports[s]);

  return (
    <div className="sb-scroll" ref={scrollRef} onScroll={e => onScrolled(e.currentTarget.scrollTop > 0)}>
      {ws.status === 'loading' && <div className="sb-note wait">{t('正在读取文档…')}</div>}
      {ws.status === 'offline' && <div className="sb-note">{t('没有连上本地服务')}</div>}
      {ws.status === 'ready' && (
        <>
          {favs.length > 0 && (
            <Section sectionKey={FAV} label={t('收藏@section')} collapsed={!!tree.collapsedSections[FAV]} updated={favs.some(s => s !== current && (unseen[s] || unseenBelow(unseen, ws.meta, s)))}>
              {favs.map(s => <TreeNode key={s} slug={s} depth={0} scope="fav" ws={ws} expanded={tree.expanded} current={current} />)}
            </Section>
          )}
          {ws.meta.groups.map((column, index) => {
            if (!columnShown(column, ws)) return null;
            if (column.extension) {
              return (
                <Section key={column.id} sectionKey={column.id} column={column} index={index} label={columnTitle(column)} path={columnPath(column, ws)} collapsed={!!tree.collapsedSections[column.id]}>
                  <ExtensionRows extension={ws.extensions.find(extension => extension.id === column.extension)} expanded={tree.expanded} current={current} />
                </Section>
              );
            }
            const roots = childrenOf(ws.meta, columnTop(column)).filter(s => ws.reports[s]);
            return (
              <Section key={column.id} sectionKey={column.id} column={column} index={index} label={columnTitle(column, ws)} above={columnAbove(column, ws)} path={columnPath(column, ws)} collapsed={!!tree.collapsedSections[column.id]} updated={unseenBelow(unseen, ws.meta, columnTop(column))}>
                {roots.map(s => <TreeNode key={s} slug={s} depth={0} scope="tree" ws={ws} expanded={tree.expanded} current={current} />)}
                {roots.length === 0 && <div className="sb-note inset sb-empty">{column.id === DOCS || (column.workspace && !column.picked) ? t('还没有文档') : t('把条目拖到这里')}</div>}
              </Section>
            );
          })}
        </>
      )}
      <div className="drop-line" ref={lineRef} />
    </div>
  );
}

/**
 * 一栏的 ··· 菜单：工作区的路径操作；分隔线；添加在线网页、添加其他 Gallery 项目；分隔线；
 * 新建栏、重命名、全部折叠 / 全部展开、从侧边栏移除（这个工作区自己的一栏没有）。新建文档是标题上的 ＋。
 */
function columnMenuEntries(column: Column, anchorFor: () => HTMLElement, ownerKey: string): MenuEntry[] {
  const top = columnTop(column);
  const ws = workspaceStore.get();
  const workspace = columnWorkspace(column, ws);
  const path = columnPath(column, ws);
  return [
    { kind: 'head', label: columnTitle(column) },
    ...(workspace ? [
      { icon: 'folderClosed' as const, label: t('复制本地路径'), tip: path ?? undefined, onSelect: () => copyWorkspacePath(workspace) },
      { icon: 'folder' as const, label: t('在文件夹中显示'), onSelect: () => void revealFolder({ ws: workspace }) },
      { kind: 'sep' as const },
    ] : []),
    { icon: 'web', label: t('添加在线网页…'), onSelect: () => openLinkForm(anchorFor(), { parent: top, ownerKey }) },
    ...(!ws.sandbox ? [{ icon: 'folderAdd' as const, label: t('添加其他 Gallery 项目…'), tip: t('别的工作区，或其中的一篇文档：文件不动'), onSelect: () => openProjectForm(anchorFor(), column.id, ownerKey) }] : []),
    { kind: 'sep' },
    { icon: 'columnAdd', label: t('新建栏'), onSelect: () => { const id = createColumn(column.id); if (id) startRename(id, 'column'); } },
    { icon: 'rename', label: t('重命名'), onSelect: () => startRename(column.id, 'column') },
    { icon: 'collapseAll', label: t('全部折叠'), onSelect: () => setSectionExpanded(column.id, false) },
    { icon: 'expandAll', label: t('全部展开'), onSelect: () => setSectionExpanded(column.id, true) },
    ...(column.id === DOCS || (ws.shared && column.workspace) ? [] : [
      column.workspace
        ? { icon: 'minus' as const, label: t('从侧边栏移除'), tip: t('只是不在这里显示，工作区和文件都不动'), onSelect: () => removeColumn(column.id) }
        : { icon: 'minus' as const, label: t('从侧边栏移除'), tip: t('里面的条目回到「{0}」，不删除任何文件', columnTitle(ws.meta.groups.find(group => column.owner && group.workspace === column.owner) ?? ws.meta.groups.find(group => group.id === DOCS))), onSelect: () => removeColumn(column.id) },
    ]),
  ];
}

/**
 * 分组（收藏，或一栏）。标题整行只占位置（拖放的落点、拖放线的宽度按整行量），悬停灰底只包着名字和三角（.sec-toggle），点它折叠 / 展开。
 * 一栏的标题悬停时右边先是 ＋（在这一栏的第一个位置新建文档，建在这一栏的工作区里），再是 ···（这一栏的菜单），和下面条目的两个按钮一样的顺序；
 * 右键也是它的菜单，开在鼠标处；拖动标题调整栏的顺序（useTreeDnd）。工作区或扩展栏的名字上停约 1 秒提示工作区或 sidebar.json 的路径（data-tip，data-tip-delay）。
 * 收藏的标题右键 = 全部折叠 / 全部展开。名字和同名时的灰字（.sec-above）在一个盒子里（.sec-text），放不下时样式从末尾用 … 收住，先灰字后名字。
 * 给样式的钩子：.sec-label（名字）、.sec-above、.sec-toggle[data-tip]（路径）。收着时里面有别人刚改了、还没看的页面（updated），标题右端有蓝点（state/updates.ts）
 */
function Section({ sectionKey, column, label, above = null, path = null, collapsed, updated = false, children }: {
  sectionKey: SectionKey; column?: Column; index?: number; label: string; above?: string | null; path?: string | null; collapsed: boolean; updated?: boolean; children: ReactNode;
}) {
  const ownerKey = `sec:${sectionKey}`;
  const menuOpen = usePopoverOwner(ownerKey);
  const renaming = useRenaming(sectionKey, 'column');
  const headRef = useRef<HTMLDivElement>(null);
  const anchorFor = (fallback: HTMLElement) => () => (headRef.current?.isConnected ? headRef.current : fallback);
  const extension = Boolean(column?.extension);
  const entries = (fallback: HTMLElement): MenuEntry[] => (column?.extension ? extensionColumnMenuEntries(column) : column ? columnMenuEntries(column, anchorFor(fallback), ownerKey) : [
    { icon: 'collapseAll', label: t('全部折叠'), onSelect: () => setSectionExpanded(sectionKey, false) },
    { icon: 'expandAll', label: t('全部展开'), onSelect: () => setSectionExpanded(sectionKey, true) },
  ]);
  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('input')) return;
    e.preventDefault();
    openMenu(e.currentTarget, entries(e.currentTarget), { ownerKey, point: { x: e.clientX, y: e.clientY } });
  };
  const onMore = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    openMenu(e.currentTarget, entries(e.currentTarget), { placement: 'bottom-start', ownerKey });
  };
  return (
    <div className={cls('section', !collapsed && 'expanded')} data-section={sectionKey} data-column={column?.id} data-extension={column?.extension}>
      <div ref={headRef} className={cls('sec-head', menuOpen && 'menu-open', renaming && 'renaming')} data-section={sectionKey} data-column={column?.id} data-extension={column?.extension} onContextMenu={onContextMenu}>
        {renaming && column ? (
          <RenameInput slug={column.id} title={label} label={t('栏的名字')} onSave={(value, baseTitle) => { if (column.extension) void renameExtension(column.extension, value, baseTitle); else renameColumn(column.id, value); }} />
        ) : (
          <button className="sec-toggle" aria-expanded={!collapsed} onClick={() => toggleSection(sectionKey)} data-tip={path ?? undefined} data-tip-delay={path ? 1000 : undefined}>
            {/* 名字和（别处的工作区的栏和别的栏同名时）后面的灰字：上一级目录，放在一个盒子里，放不下时样式从末尾用 … 收住：先灰字后名字 */}
            <span className="sec-text">
              <span className="sec-label">{label}</span>
              {above && <span className="sec-above">{above}</span>}
            </span>
            <span className="sec-chev"><Icon name="chevron" /></span>
          </button>
        )}
        {/* 收着的栏里有别人刚改了、还没看的页面：标题右端的蓝点（.row-new，悬停时让给 ＋ ···） */}
        {collapsed && updated && !renaming && <span className="row-new" role="img" aria-label={t('里面有页面刚被 Agent 更新')} />}
        {column && !renaming && (
          <div className="sec-actions">
            {!extension && <button className="row-act" data-tip={t('在这一栏新建文档')} aria-label={t('在这一栏新建文档')} onClick={e => { e.stopPropagation(); void createReport({ parent: columnTop(column), first: true }); }}><Icon name="plus" /></button>}
            <button className="row-act" data-tip={t('这一栏的操作…')} aria-label={t('这一栏的操作')} aria-haspopup="menu" aria-expanded={menuOpen} onClick={onMore}><Icon name="more" /></button>
          </div>
        )}
      </div>
      {!collapsed && <div className="tree">{children}</div>}
    </div>
  );
}

/**
 * 条目（文档、网页链接或别处的底稿）。子节点来自目录元数据：有子条目的，图标左边一直有展开箭头（sidebar.css .row-chevron：
 * 盖住图标左边的整段空白，点它只展开或收起），一眼看出它是父级页面；点图标（一个按钮，.row-icon）和 ··· 菜单、右键菜单里的「更换图标」一样，打开图标选择器
 * （iconPicker.ts，开在这一行的图标下面），不打开条目；找不到底稿的图标不能点，菜单里也没有这一项）。网页链接右边有灰色的「链接」二字，图标是读者选的，没有时是网站自己的（siteIcon），都没有时是网格地球；文档（这个工作区的，或别处的底稿）不在它自己那一栏时，右边的灰字写它自己那一栏的名字
 * （侧栏现在叫它的名字；那一栏移除了时是工作区的名字），完整路径在灰字和标题的提示里（.row-tag.row-column），在自己那一栏里不显示；
 * 找不到底稿的整行灰着，右边写「找不到底稿」，点它只说一声。别人（Agent）刚改了、读者还没打开的（state/updates.ts），行的右端有个蓝色圆点（.row-new），
 * 在 ＋ ··· 的位置，悬停时让给它们；它在收着的上级下面时，点在看得见的最近一级上
 */
function TreeNode({ slug, depth, scope, ws, expanded, current }: {
  slug: string; depth: number; scope: TreeScope; ws: WorkspaceState; expanded: Record<string, true>; current: string | null;
}) {
  const report = ws.reports[slug];
  const rowRef = useRef<HTMLDivElement>(null);
  const ownerKey = `row:${scope}:${slug}`;
  const menuOpen = usePopoverOwner(ownerKey);
  const liveTitle = useSessionTitle(slug);
  const liveIcon = useSessionIcon(slug);
  const renaming = useRenaming(slug, scope);
  const picking = useIconPicking(ownerKey);
  const unseen = useStore(updatesStore);
  if (!report) return null;
  const link = report.kind === 'link';
  const draft = report.kind === 'draft';
  const missing = draft && Boolean(report.missing);
  const kids = childrenOf(ws.meta, slug).filter(s => ws.reports[s]);
  const hasKids = kids.length > 0;
  const open = hasKids && !!expanded[expKey(slug, scope)];
  // 别人刚改了、读者还没看：它自己，或它收着时下面的哪一页（点在看得见的最近一级上）；在看的那一页没有
  const updated = slug !== current && (Boolean(unseen[slug]) || (hasKids && !open && unseenBelow(unseen, ws.meta, slug)));
  const title = (link ? null : liveTitle) ?? reportTitle(report);
  // 不在它自己那一栏里（拖进了别的栏）：右边的灰字写那一栏的名字，提示里是它的完整路径（别处的底稿是它的 doc.html，这个工作区的是它的文件夹）
  const own = !link && !missing ? ownColumnOf(ws.meta, slug, draft ? report.workspace ?? null : null) : null;
  const ownName = !own ? null : own.id && !(own as Column).hidden ? columnTitle(own as Column, ws) : workspaceTitle(own.workspace ?? columnWorkspace(own as Column, ws) ?? '', ws);
  const selfRoot = ws.self ? ws.workspaces[ws.self]?.root : undefined;
  const fullPath = draft ? report.path ?? report.folder : selfRoot ? [selfRoot, slug].join(selfRoot.includes('\\') ? '\\' : '/') : undefined;
  const away = Boolean(ownName);

  const anchorFor = (fallback: HTMLElement) => () => (rowRef.current?.isConnected ? rowRef.current : fallback);
  const entries = (fallback: HTMLElement) => (link
    ? linkMenuEntries(slug, anchorFor(fallback), { onRename: () => startRename(slug, scope), onChangeIcon, ownerKey })
    : draft ? draftMenuEntries(slug, anchorFor(fallback), { onRename: () => startRename(slug, scope), onChangeIcon, ownerKey })
      : reportMenuEntries(slug, anchorFor(fallback), { onRename: () => startRename(slug, scope), onChangeIcon, ownerKey }));
  // 打开它：点这一行，或焦点在这一行上按回车、空格；找不到底稿的只说一声
  const openRow = () => (missing ? toast(report.missing === 'ambiguous' ? t('找不到底稿：本机登记的两个工作区编号相同') : t('找不到底稿：{0}', report.path ?? report.workspace ?? slug)) : void openReport(slug, { reveal: false }));
  // 键盘（焦点在这一行本身上时；改名框、里面的按钮的键归它们）：回车、空格打开它，→ ← 展开、收起它下面的条目
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || renaming || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(); }
    else if (hasKids && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); setExpandedKey(expKey(slug, scope), e.key === 'ArrowRight'); }
  };
  const onMore = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    openMenu(e.currentTarget, entries(e.currentTarget), { placement: 'right-start', ownerKey });
  };
  // 右键 = 同一个菜单，开在鼠标处；改名框里留给浏览器自己的菜单
  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest('input')) return;
    e.preventDefault();
    openMenu(e.currentTarget, entries(e.currentTarget), { ownerKey, point: { x: e.clientX, y: e.clientY } });
  };
  const onAdd = (e: MouseEvent) => {
    e.stopPropagation();
    setExpandedKey(expKey(slug, scope), true);
    void createReport({ parent: slug }); // 建在它所在那一栏的工作区里
  };
  // 图标：打开着的文档以页面上报的为准；网页链接是读者选的，没有时是网站自己的
  const icon = !link && !draft && liveIcon !== undefined ? liveIcon : link ? report.icon ?? report.siteIcon : report.icon;
  // 更换图标（点图标，或 ··· 菜单和右键菜单里的那一项）：图标选择器开在这一行的图标下面，选好的写进文件（commands.ts changeIcon）；这个工作区的文档
  // 能用图片（上传、自定义表情放进它的文件夹），网页链接和别处的底稿只能是表情或图标（侧栏画不出底稿文件夹里的图，链接不存文件）；找不到底稿的没有
  const onChangeIcon = missing ? undefined : () => {
    const anchor = rowRef.current?.querySelector<HTMLElement>('.row-icon') ?? rowRef.current;
    if (!anchor) return;
    const own = !link && !draft;
    void openIconPicker({
      anchor, owner: ownerKey, value: (link ? report.icon : icon) ?? null, pictures: own, slug: own ? slug : undefined,
      onPick: value => void changeIcon({ kind: link ? 'link' : 'document', slug }, value),
    });
  };
  const shownIcon = <span className="pg-icon"><PageIcon icon={icon} slug={link || draft ? undefined : slug} fallback={link ? 'web' : hasKids ? 'folderClosed' : 'page'} /></span>;

  return (
    <div className={cls('node', open && 'open')}>
      <div
        ref={rowRef}
        className={cls('row', hasKids && 'has-kids', link && 'link-row', draft && 'draft-row', missing && 'missing', slug === current && 'selected', (menuOpen || picking) && 'menu-open', picking && 'picking', renaming && 'renaming', updated && 'updated')}
        role="button"
        tabIndex={0}
        aria-current={slug === current ? 'page' : undefined}
        aria-expanded={hasKids ? open : undefined}
        style={{ '--depth': depth } as CSSProperties}
        data-id={slug}
        data-scope={scope}
        data-depth={depth}
        data-kind={link ? 'link' : draft ? 'draft' : undefined}
        onClick={openRow}
        onKeyDown={onKeyDown}
        onContextMenu={onContextMenu}
      >
        {hasKids && (
          <button className="row-chevron" tabIndex={-1} aria-expanded={open} aria-label={open ? t('折叠') : t('展开')} onClick={e => { e.stopPropagation(); toggleExpandedKey(expKey(slug, scope)); }}>
            <Icon name="chevron" />
          </button>
        )}
        {onChangeIcon
          ? <button className="row-icon" tabIndex={-1} aria-label={t('更换图标')} data-tip={t('更换图标')} onClick={e => { e.stopPropagation(); onChangeIcon(); }}>{shownIcon}</button>
          : <div className="row-icon">{shownIcon}</div>}
        {renaming
          ? <RenameInput slug={slug} title={title} label={link ? t('链接的名称') : undefined} onSave={link ? value => void renameLink(slug, value) : undefined} />
          : <div className="row-title" data-tip={away ? fullPath : undefined} data-tip-cut={away ? undefined : ''}>{title}</div>}
        {link && !renaming && <span className="row-tag">{t('链接')}</span>}
        {missing && !renaming && <span className="row-tag">{t('找不到底稿')}</span>}
        {away && !renaming && <span className="row-tag row-column" data-tip={fullPath}>{ownName}</span>}
        {updated && !renaming && <span className="row-new" role="img" aria-label={unseen[slug] ? t('刚被 Agent 更新') : t('里面有页面刚被 Agent 更新')} />}
        <div className="row-actions">
          <button className="row-act" data-tip={t('在下面新建文档')} aria-label={t('在下面新建文档')} onClick={onAdd}><Icon name="plus" /></button>
          <button className="row-act" data-tip={link ? t('改名、复制网址等…') : draft ? t('复制本地路径、移除等…') : t('移动、收藏等…')} aria-label={t('更多操作')} aria-haspopup="menu" aria-expanded={menuOpen} onClick={onMore}><Icon name="more" /></button>
        </div>
      </div>
      {open && (
        <div className="kids">
          {kids.map(k => <TreeNode key={k} slug={k} depth={depth + 1} scope={scope} ws={ws} expanded={expanded} current={current} />)}
        </div>
      )}
    </div>
  );
}
