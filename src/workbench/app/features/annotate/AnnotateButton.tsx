import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { MenuList, type MenuEntry } from '../../components/Menu';
import { togglePopover, usePopoverOwner } from '../../components/Popover';
import { useStore } from '../../lib/store';
import { cls, IS_MAC } from '../../lib/util';
import { can, sessionStore } from '../../session/sessionStore';
import { copyAnnotations, deleteAnnotations, deleteDoneAnnotations, listAnnotations, locateAnnotation, type AnnotationRow } from './annotate';
import './annotate.css';
import { t } from '../../../../shared/i18n/index.mjs';

const OWNER = 'annotate';

/**
 * 批注列表：这一页的每条批注一行，按页面顺序，建议一行、原文一行灰字（没有文字的块写“整块”），正在卡片里被清空的那条只有原文那一行，点一行定位过去；
 * 下面是复制批注（右边是条数）和全部删除（悬停变红）。开着时批注没了（Agent 写的、别的标签页），一行灰字说怎么写，两个操作灰着。条数变了就重新问报告页要这些行。
 */
function AnnotationList({ onDone }: { onDone: () => void }) {
  const count = useStore(sessionStore, s => s.annotations ?? 0);
  const slug = useStore(sessionStore, s => s.slug);
  const [rows, setRows] = useState<AnnotationRow[]>([]);
  useEffect(() => {
    let stale = false;
    void listAnnotations().then(list => { if (!stale) setRows(list); });
    return () => { stale = true; };
  }, [count, slug]);
  const listed = count === 0 ? 0 : rows.length;
  const entries = useMemo<MenuEntry[]>(() => {
    // 处理过的（Agent 用 gallery notes done 标的）不再算要改的：复制批注不带它们，列表里字是灰的，可以一键删掉
    const done = rows.filter(row => row.done).length;
    const todo = rows.length ? count - done : count;
    const actions: MenuEntry[] = [
      { icon: 'copy', label: t('复制批注'), kbd: todo ? t('{0} 条', todo) : '', disabled: todo === 0, onSelect: copyAnnotations },
      ...(done > 0 ? [{ icon: 'trash' as const, label: t('删除已处理'), kbd: t('{0} 条', done), onSelect: () => void deleteDoneAnnotations() }] : []),
      { icon: 'trash', label: t('全部删除'), danger: true, disabled: count === 0, onSelect: () => void deleteAnnotations() },
    ];
    if (count === 0) return [{ kind: 'empty', label: t('还没有批注。选中文字或点块右边的按钮来写') }, { kind: 'sep' }, ...actions];
    if (rows.length === 0) return actions;
    const place = (row: AnnotationRow) => row.quote || t('（整块）');
    return [...rows.map(row => ({ key: row.id, label: row.text.trim() || place(row), detail: row.text.trim() ? place(row) : undefined, muted: row.done, onSelect: () => locateAnnotation(row.id) })), { kind: 'sep' }, ...actions];
  }, [rows, count]);
  return <MenuList entries={entries} onDone={onDone} scrolled={listed} />;
}

/**
 * 顶栏 ☆ 左边的批注按钮：打开这一页批注的列表，再点一下关上，按在外面（报告页也算）也关上；写批注不经过它（editor/page/annotate/）。
 * 这一页一条批注也没有时不显示：点了也没用。列表开着时是按下的灰底，没有蓝色。焦点在按钮上时按 ↓ 也打开它。
 */
export function AnnotateButton() {
  const session = useStore(sessionStore);
  const open = usePopoverOwner(OWNER);
  const button = useRef<HTMLButtonElement>(null);
  const shown = useRef(false);
  const toggle = () => togglePopover({ anchor: button.current!, ownerKey: OWNER, menu: true, placement: 'bottom-end', className: 'controlled annot-list', content: close => <AnnotationList onDone={close} /> });

  // 换文档、刷新时报告页要断开再连上：这时按钮保持原样，等连上的页面读好批注、说出条数；列表开着时它还要托着列表
  if (session.connected && !can('annotate', session)) shown.current = false;
  else if (session.connected && session.annotations !== undefined) shown.current = session.annotations > 0;
  if (!shown.current && !open) return null;
  return (
    <button
      ref={button}
      className={cls('icon-btn', 'annot-btn', open && 'annot-open')}
      aria-label={t('批注')}
      aria-haspopup="menu"
      aria-expanded={open}
      data-tip={open ? undefined : t('批注')}
      data-sub={open ? undefined : IS_MAC ? '⌘⌥M' : 'Ctrl+Alt+M'}
      onClick={toggle}
      onKeyDown={e => {
        if (e.key === 'ArrowDown' && !open) { e.preventDefault(); toggle(); }
      }}
    >
      <Icon name="annotate" />
    </button>
  );
}
