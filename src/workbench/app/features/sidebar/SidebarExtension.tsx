import { useRef, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { Icon, PageIcon } from '../../components/Icon';
import type { MenuEntry } from '../../components/Menu';
import { openMenu, usePopoverOwner } from '../../components/Popover';
import { cls } from '../../lib/util';
import { openExtensionEntry } from '../../state/navigation';
import { setExpandedKey, toggleExpandedKey, treeStore } from '../../state/tree';
import { columnTitle, workspaceStore } from '../../workspace/store';
import type { Column, ExtensionEntry, ExtensionMeta } from '../../workspace/types';
import { extensionKey } from '../../../../shared/extension-sidebar.mjs';
import { extensionMenuEntries } from './reportMenus';
import { t, told } from '../../../../shared/i18n/index.mjs';
import { startRename } from './RenameInput';
import { deleteExtension } from '../../workspace/commands';

/**
 * 扩展提供的栏（docs/workbench.md「Extension columns」，工作区的 extensions/<id>/sidebar.json，或扩展程序写的 extensions/<id>/columns/<栏目>.json，键是 ~<id>:<栏目>/<条目>）里的条目。栏的位置记在目录里，可以拖它的标题调整；
 * 栏名可用同一个 RenameInput 修改；一级条目排序与删除都写回 sidebar.json。条目不能跨栏、改名、移至回收区。
 * 有网址的条目点开在右边显示（和网页链接共用 LinkView），没有网址的只用来收下级，点它展开或收起；右键菜单：在浏览器中打开、复制网址、在新标签页打开。
 * 文件读不出来时，栏里只有一行「条目读不出来：<原因>」
 */
export function ExtensionRows({ extension, expanded, current }: { extension: ExtensionMeta | undefined; expanded: Record<string, true>; current: string | null }) {
  if (!extension) return null;
  if (extension.error) {
    return <div className="sb-note inset sb-ext-note" data-extension-error={extension.id}>{t('条目读不出来：{0}', told(extension.error) ?? '')}</div>;
  }
  if (!extension.entries.length) return <div className="sb-note inset sb-ext-note">{t('没有条目')}</div>;
  return <>{extension.entries.map(entry => <ExtensionNode key={entry.id} extension={extension} entry={entry} depth={0} expanded={expanded} current={current} />)}</>;
}

function ExtensionNode({ extension, entry, depth, expanded, current }: {
  extension: ExtensionMeta; entry: ExtensionEntry; depth: number; expanded: Record<string, true>; current: string | null;
}) {
  const key = extensionKey(extension.id, entry.id);
  const rowRef = useRef<HTMLDivElement>(null);
  const ownerKey = `row:ext:${key}`;
  const menuOpen = usePopoverOwner(ownerKey);
  const kids = entry.children ?? [];
  const hasKids = kids.length > 0;
  const open = hasKids && !!expanded[key];
  const { url } = entry;

  const entries = (): MenuEntry[] => extensionMenuEntries(key);
  const onMore = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    openMenu(e.currentTarget, entries(), { placement: 'right-start', ownerKey });
  };
  // 右键 = 同一个菜单；一级分组没有网址也可删除，其他没有网址的条目保留浏览器菜单。
  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (!url && depth !== 0) return;
    e.preventDefault();
    openMenu(e.currentTarget, entries(), { ownerKey, point: { x: e.clientX, y: e.clientY } });
  };
  const onClick = () => { if (url) void openExtensionEntry(key); else toggleExpandedKey(key); };
  // 键盘（焦点在这一行本身上时）：回车、空格和点它一样，→ ← 展开、收起它下面的条目（和文档的行一样，SidebarTree.tsx）
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget || e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); }
    else if (hasKids && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) { e.preventDefault(); setExpandedKey(key, e.key === 'ArrowRight'); }
  };

  return (
    <div className={cls('node', open && 'open')}>
      <div
        ref={rowRef}
        className={cls('row', 'ext-row', hasKids && 'has-kids', key === current && 'selected', menuOpen && 'menu-open')}
        role="button"
        tabIndex={0}
        aria-current={key === current ? 'page' : undefined}
        aria-expanded={hasKids ? open : undefined}
        style={{ '--depth': depth } as CSSProperties}
        data-id={key}
        data-scope="ext"
        data-depth={depth}
        data-kind="extension"
        data-extension={extension.id}
        onClick={onClick}
        onKeyDown={onKeyDown}
        onContextMenu={onContextMenu}
      >
        {/* 有子条目：图标左边的展开箭头（和文档的行一样，sidebar.css .row-chevron） */}
        {hasKids && (
          <button className="row-chevron" tabIndex={-1} aria-expanded={open} aria-label={open ? t('折叠') : t('展开')} onClick={e => { e.stopPropagation(); toggleExpandedKey(key); }}>
            <Icon name="chevron" />
          </button>
        )}
        <div className="row-icon">
          <span className="pg-icon"><PageIcon icon={entry.icon ?? extension.icon} fallback={hasKids ? 'folderClosed' : 'page'} /></span>
        </div>
        <div className="row-title">{entry.title}</div>
        {(url || depth === 0) && (
          <div className="row-actions">
            <button className="row-act" data-tip={url ? t('在浏览器中打开、复制网址等…') : t('更多操作')} aria-label={t('更多操作')} aria-haspopup="menu" aria-expanded={menuOpen} onClick={onMore}><Icon name="more" /></button>
          </div>
        )}
      </div>
      {open && (
        <div className="kids">
          {kids.map(kid => <ExtensionNode key={kid.id} extension={extension} entry={kid} depth={depth + 1} expanded={expanded} current={current} />)}
        </div>
      )}
    </div>
  );
}

/** 栏里有子级的条目全部展开或折叠（栏标题菜单的「全部展开」「全部折叠」） */
export function setExtensionExpanded(extensionId: string, open: boolean) {
  const extension = workspaceStore.get().extensions.find(item => item.id === extensionId);
  if (!extension) return;
  const expanded = { ...treeStore.get().expanded };
  const walk = (list: ExtensionEntry[]) => list.forEach(entry => {
    const key = extensionKey(extensionId, entry.id);
    if (open && entry.children?.length) expanded[key] = true; else if (!open) delete expanded[key];
    walk(entry.children ?? []);
  });
  walk(extension.entries);
  treeStore.set(s => ({ ...s, expanded }));
}

/**
 * 扩展栏的菜单复用重命名、展开/折叠与删除确认，修改写回它的 sidebar.json。
 */
export function extensionColumnMenuEntries(column: Column): MenuEntry[] {
  const id = column.extension ?? '';
  return [
    { kind: 'head', label: columnTitle(column) },
    { icon: 'rename', label: t('重命名'), disabled: Boolean(workspaceStore.get().extensions.find(extension => extension.id === id)?.error), onSelect: () => startRename(column.id, 'column') },
    { icon: 'collapseAll', label: t('全部折叠'), onSelect: () => setExtensionExpanded(id, false) },
    { icon: 'expandAll', label: t('全部展开'), onSelect: () => setExtensionExpanded(id, true) },
    { kind: 'sep' },
    { icon: 'trash', label: t('删除分栏'), danger: true, disabled: !workspaceStore.get().extensions.find(extension => extension.id === id)?.revision, onSelect: () => void deleteExtension(id) },
  ];
}
