import { useEffect, useRef, type MouseEvent, type RefObject } from 'react';
import { Icon, PageIcon } from '../../components/Icon';
import { openMenu, usePopoverOwner } from '../../components/Popover';
import { useStore } from '../../lib/store';
import { cls } from '../../lib/util';
import { currentPage, navStore, openCustomPage } from '../../state/navigation';
import { holdPeek } from '../../state/sidebar';
import { updatesStore } from '../../state/updates';
import { changeIcon, createCustomPage, renameCustomPage } from '../../workspace/commands';
import { pageTitle, pagesInHead, setHead, workspaceStore } from '../../workspace/store';
import type { PageMeta } from '../../workspace/types';
import { pageMenuEntries } from './reportMenus';
import { RenameInput, startRename, useRenaming } from './RenameInput';
import { openIconPicker, useIconPicking } from './iconPicker';
import { headPage, movedInHead, pageHeadKey } from '../../../../shared/sidebar-head.mjs';
import { t } from '../../../../shared/i18n/index.mjs';

/** 侧栏头部最多列几个自定义页：这一块不随文档树滚动，多的收进「更多页面」 */
export const SHOWN_PAGES = 5;

/**
 * 新建页面之后改它的标题：它在头部列出来的那几行里时，就在它那一行上改；被挤进了「更多页面」时，在顶栏的标题上改
 */
export function renameNewPage(slug: string) {
  const shown = pagesInHead().slice(0, SHOWN_PAGES).some(page => page.slug === slug);
  startRename(slug, shown ? 'page' : 'title');
}

/**
 * 侧栏头部的自定义页（2026-11-09 用户：首页这些都可以按住拖动排序，但不能有子项）：每个自定义页（src/shared/pages.mjs）
 * 是同一列行，按 head 的顺序（shared/sidebar-head.mjs：读者拖出来的顺序记在工作区的目录文件里，每个浏览器都一样；没排过的页按
 * gallery.json 的 pages.order、再按标题排在后面），行和行之间 1px。新建、搜索原来也是这一列里的行，2026-11-17 起不是了（新建在第一行的行尾，
 * 搜索是它下面一整行灰底：Sidebar.tsx），它们在 head 里的键照旧留着、这里跳过。最多列 5 个页，其余在最后一行「更多页面」的菜单里
 * （打开着的在里面时，这一行显示为选中）。按住一行拖动（useHeadDnd）：落点是两行之间的一条线，只在头部里，不能放进别的行，文档树的条目也拖不进来，
 * 这几行也拖不进文档树。
 * 自定义页的行：点它打开；光标移到行上时右边出现 ···（和文档树的条目一样），右键也是同一个菜单（pageMenuEntries：重命名、复制本地路径、
 * 在文件夹中显示、在新标签页打开、新建页面、有默认卡片的页还有恢复默认卡片，最后是红字的移至回收区）；重命名时标题处是改名框。
 */
export function SidebarHead() {
  const head = useStore(workspaceStore, ws => ws.head);
  const pages = useStore(workspaceStore, ws => ws.pages);
  const open = useStore(navStore, currentPage);
  const unseen = useStore(updatesStore);
  const moreOpen = usePopoverOwner('pages-more');
  const boxRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<HTMLDivElement>(null);
  // 列出来的行：前 5 个页；其余的页收进「更多页面」。head 里的新建、搜索（new、search）不再是这里的行（2026-11-17：新建在第一行的
  // 行尾，搜索是上面那一整行灰底，Sidebar.tsx）：键照旧留在目录文件里，这里跳过
  let count = 0;
  const rows: string[] = [];
  const rest: PageMeta[] = [];
  for (const key of head) {
    const slug = headPage(key);
    const page = slug === null ? null : pages.find(one => one.slug === slug);
    if (!page) continue;
    if (++count > SHOWN_PAGES) rest.push(page);
    else rows.push(key);
  }
  useHeadDnd(boxRef, lineRef, head, rows);
  const showMore = (e: MouseEvent<HTMLButtonElement>) => openMenu(e.currentTarget, rest.map(page => ({
    key: page.slug,
    icon: <span className="pg-icon"><PageIcon icon={page.icon} fallback={page.slug === 'home' ? 'home' : 'board'} /></span>,
    label: pageTitle(page),
    check: page.slug === open,
    onSelect: () => void openCustomPage(page.slug),
  })), { placement: 'right-start', ownerKey: 'pages-more' });
  return (
    <div className="sb-rows" ref={boxRef}>
      {rows.map(key => {
        const page = pages.find(one => one.slug === headPage(key));
        return page ? <PageRow key={key} page={page} selected={page.slug === open} updated={page.slug !== open && Boolean(unseen[`@${page.slug}`])} /> : null;
      })}
      {rest.length > 0 && (
        <button className={cls('sb-act sb-more-pages', moreOpen && 'menu-open', rest.some(page => page.slug === open) && 'selected')} aria-haspopup="menu" aria-expanded={moreOpen} onClick={showMore}>
          <span className="sb-act-icon"><Icon name="more" /></span>
          <span className="sb-act-label">{t('更多页面')}</span>
          {rest.some(page => page.slug !== open && unseen[`@${page.slug}`]) && <span className="row-new" role="img" aria-label={t('里面有页面刚被 Agent 更新')} />}
        </button>
      )}
      <div className="drop-line sb-head-line" ref={lineRef} />
    </div>
  );
}

/**
 * 一个自定义页的那一行：点它打开；悬停时右边有 ···，点它或右键打开页的菜单；重命名时标题处是改名框。别人（Agent）刚改了、读者还没打开时，
 * 右端有个蓝色圆点（.row-new，state/updates.ts），悬停时让给 ···；收在「更多页面」里的，点在那一行上。
 * 点图标和菜单里的「更换图标」一样，打开图标选择器（开在这一行的图标下面，不打开页；写 page.json，只能是表情或图标，没有上传）
 */
function PageRow({ page, selected, updated }: { page: PageMeta; selected: boolean; updated: boolean }) {
  const ownerKey = `page:${page.slug}`;
  const menuOpen = usePopoverOwner(ownerKey);
  const renaming = useRenaming(page.slug, 'page');
  const picking = useIconPicking(ownerKey);
  const title = pageTitle(page);
  const rowRef = useRef<HTMLDivElement>(null);
  const onChangeIcon = () => {
    const anchor = rowRef.current?.querySelector<HTMLElement>('.sb-act-icon') ?? rowRef.current;
    if (!anchor) return;
    void openIconPicker({ anchor, owner: ownerKey, value: page.icon ?? null, pictures: false, onPick: value => void changeIcon({ kind: 'page', slug: page.slug }, value) });
  };
  const entries = () => pageMenuEntries(page.slug, {
    onRename: () => startRename(page.slug, 'page'),
    onChangeIcon,
    onNewPage: () => void createCustomPage(page.slug, renameNewPage),
  });
  const onContextMenu = (e: MouseEvent<HTMLElement>) => {
    if ((e.target as Element).closest('input')) return;
    e.preventDefault();
    openMenu(e.currentTarget, entries(), { ownerKey, point: { x: e.clientX, y: e.clientY } });
  };
  const onMore = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    openMenu(e.currentTarget, entries(), { placement: 'right-start', ownerKey });
  };
  return (
    <div
      ref={rowRef}
      className={cls('sb-act sb-page', selected && 'selected', (menuOpen || picking) && 'menu-open', picking && 'picking', renaming && 'renaming', updated && 'updated')}
      role="button"
      tabIndex={0}
      data-page={page.slug}
      data-head={pageHeadKey(page.slug)}
      aria-current={selected ? 'page' : undefined}
      onClick={() => { if (!renaming) void openCustomPage(page.slug); }}
      onKeyDown={e => { if (!renaming && e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); void openCustomPage(page.slug); } }}
      onContextMenu={onContextMenu}
    >
      <button className="sb-act-icon sb-page-icon" aria-label={t('更换图标')} data-tip={t('更换图标')} onClick={e => { e.stopPropagation(); onChangeIcon(); }}><span className="pg-icon"><PageIcon icon={page.icon} fallback={page.slug === 'home' ? 'home' : 'board'} /></span></button>
      {renaming
        ? <RenameInput slug={page.slug} title={title} label={t('页面标题')} onSave={value => void renameCustomPage(page.slug, value)} />
        : <span className="sb-act-label" data-tip-cut="">{title}</span>}
      {updated && !renaming && <span className="row-new" role="img" aria-label={t('刚被 Agent 更新')} />}
      {!renaming && (
        <span className="row-actions sb-page-actions">
          <button className="row-act" data-tip={t('重命名、新建页面等…')} aria-label={t('页面的操作')} aria-haspopup="menu" aria-expanded={menuOpen} onClick={onMore}><Icon name="more" /></button>
        </span>
      )}
    </div>
  );
}

/**
 * 头部的拖动（只改顺序，记在工作区的目录文件里：setHead → POST head）。按住一行移动 5px 起拖：一个跟着指针的影子（行的图标和名字），
 * 原行变淡；落点是指针所在那一行的上半 / 下半 = 放到它前 / 后，画一条和文档树一样的蓝线；头部以外没有落点（文档树里、别处松开 = 不动）。
 * 浮动的侧栏拖动时不收回；Esc 取消；拖过之后的那一下点击不算。按在 ···、改名框上不拖。
 */
function useHeadDnd(boxRef: RefObject<HTMLDivElement | null>, lineRef: RefObject<HTMLDivElement | null>, head: string[], rows: string[]) {
  const state = useRef({ head, rows });
  state.current = { head, rows };
  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    type Drag = { key: string; row: HTMLElement; sx: number; sy: number; started: boolean; before: string | null | undefined; ghost?: HTMLElement; release?: () => void; offX: number; offY: number };
    let drag: Drag | null = null;
    let suppress = false;
    const line = () => lineRef.current!;
    const rowEls = () => [...box.querySelectorAll<HTMLElement>(':scope > [data-head]')];
    // 指针下的落点：它前面的那一行的 key（null = 列出来的最后一行之后），undefined = 头部以外
    const dropAt = (x: number, y: number): string | null | undefined => {
      const r = box.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top - 6 || y > r.bottom + 6) return undefined;
      const els = rowEls();
      for (const el of els) {
        const rect = el.getBoundingClientRect();
        if (y < rect.top + rect.height / 2) return el.dataset.head!;
      }
      return null;
    };
    const showLine = (before: string | null | undefined) => {
      const l = line();
      if (before === undefined) { l.classList.remove('show'); return; }
      const els = rowEls();
      const at = before === null ? els.at(-1) : els.find(el => el.dataset.head === before);
      if (!at) { l.classList.remove('show'); return; }
      const r = box.getBoundingClientRect(), rect = at.getBoundingClientRect();
      const top = (before === null ? rect.bottom : rect.top) - r.top;
      l.style.top = `${top - 1.5}px`;
      l.style.left = '8px';
      l.style.width = `${Math.max(24, r.width - 16)}px`;
      l.classList.add('show');
    };
    // 落在 before 前面，换算成整个 head 里的位置：列出来的最后一行之后 = 紧跟它（后面收进「更多页面」的页照旧在后面）
    const target = (before: string | null) => {
      const { head: all, rows: shown } = state.current;
      if (before !== null) return before;
      const last = shown.at(-1);
      const next = last === undefined ? -1 : all.indexOf(last) + 1;
      return next > 0 && next < all.length ? all[next] : null;
    };
    const start = (d: Drag) => {
      d.started = true;
      const rect = d.row.getBoundingClientRect();
      d.offX = Math.min(d.sx - rect.left, 60);
      d.offY = Math.min(d.sy - rect.top, 30);
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.style.maxWidth = `${Math.min(rect.width, 260)}px`;
      const icon = d.row.querySelector('.sb-act-icon')?.cloneNode(true);
      if (icon) ghost.appendChild(icon);
      const label = document.createElement('span');
      label.className = 't';
      label.textContent = d.row.querySelector('.sb-act-label')?.textContent ?? '';
      ghost.appendChild(label);
      document.body.appendChild(ghost);
      d.ghost = ghost;
      document.body.classList.add('dragging');
      d.row.classList.add('drag-src');
      d.release = holdPeek();
    };
    const finish = (commit: boolean) => {
      const d = drag;
      drag = null;
      if (!d?.started) return;
      d.ghost?.remove();
      document.body.classList.remove('dragging');
      d.row.classList.remove('drag-src');
      line().classList.remove('show');
      d.release?.();
      suppress = true;
      setTimeout(() => { suppress = false; }, 60);
      if (!commit || d.before === undefined) return;
      const { head: all } = state.current;
      const next = movedInHead(all, d.key, target(d.before));
      if (next.join('\n') !== all.join('\n')) void setHead(next);
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType === 'touch') return;
      const el = e.target as Element;
      if (el.closest('input, .row-act')) return;
      const row = el.closest<HTMLElement>('[data-head]');
      if (!row || row.parentElement !== box || row.classList.contains('renaming')) return;
      drag = { key: row.dataset.head!, row, sx: e.clientX, sy: e.clientY, started: false, before: undefined, offX: 0, offY: 0 };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
        start(drag);
      }
      drag.ghost!.style.transform = `translate(${e.clientX - drag.offX}px, ${e.clientY - drag.offY}px)`;
      drag.before = dropAt(e.clientX, e.clientY);
      showLine(drag.before);
    };
    const onUp = () => { if (drag) finish(true); };
    const onCancel = () => { if (drag) finish(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drag?.started) { e.preventDefault(); e.stopImmediatePropagation(); finish(false); }
    };
    const onClick = (e: globalThis.MouseEvent) => {
      if (suppress) { suppress = false; e.stopPropagation(); e.preventDefault(); }
    };
    const onDragStart = (e: DragEvent) => e.preventDefault();
    box.addEventListener('pointerdown', onDown);
    box.addEventListener('dragstart', onDragStart);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('click', onClick, true);
    return () => {
      box.removeEventListener('pointerdown', onDown);
      box.removeEventListener('dragstart', onDragStart);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('click', onClick, true);
      if (drag?.started) finish(false);
    };
  }, [boxRef, lineRef]);
}
