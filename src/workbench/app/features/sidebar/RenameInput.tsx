import { useEffect, useLayoutEffect, useRef } from 'react';
import { pushLayer } from '../../lib/layers';
import { createStore, useStore } from '../../lib/store';
import { holdPeek } from '../../state/sidebar';
import type { TreeScope } from '../../state/tree';
import { renameReport } from '../../workspace/commands';
import { t } from '../../../../shared/i18n/index.mjs';

/**
 * 侧栏条目上的改名框（条目右键 / ··· 菜单里的「重命名」）：就在条目的标题处，原标题全选。
 * Enter 或点到别处 = 改名（renameReport；自定义页那几行是 onSave：只改它的 page.json；网页链接只改它的 link.json，普通栏的标题改 outline.json，扩展栏改 sidebar.json 的 title），Esc = 放弃。
 * 同一份报告在「收藏」和「报告」里各有一个条目，只在点的那个上改。
 */
const renamingStore = createStore<string | null>(null);
/** 改名框在哪一处：目录树、收藏，自定义页那几行（page），一栏的标题（column，slug 是栏的 id），或顶栏上自定义页的标题（title） */
export type RenameScope = TreeScope | 'page' | 'column' | 'title';
const keyOf = (slug: string, scope: RenameScope) => `${scope}:${slug}`;

export const startRename = (slug: string, scope: RenameScope) => renamingStore.set(keyOf(slug, scope));
/** 改名框收起（换了页面，输入框随它被拿掉时没有失焦事件）：不然回到那一页时框又冒出来 */
export const stopRename = () => renamingStore.set(null);
export const useRenaming = (slug: string, scope: RenameScope) => useStore(renamingStore, key => key === keyOf(slug, scope));

export function RenameInput({ slug, title, label = t('文档标题'), onSave }: { slug: string; title: string; label?: string; onSave?: (title: string, baseTitle: string) => void }) {
  // 未命名的文档（标题是空的，侧栏叫它「未命名文档」）：框里是空的，灰字「未命名文档」，和文档页上的空标题一样
  const untitled = !onSave && title === t('未命名文档');
  const ref = useRef<HTMLInputElement>(null);
  const baseTitle = useRef(title);
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    renamingStore.set(null);
    if (!save) return;
    const value = ref.current?.value ?? '';
    if (onSave) onSave(value, baseTitle.current);
    else void renameReport(slug, value);
  };
  const finishRef = useRef(finish);
  finishRef.current = finish;

  useLayoutEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  // 浮动侧栏改名时不收回；Esc 放弃
  useEffect(() => {
    const release = holdPeek();
    const popLayer = pushLayer(() => finishRef.current(false));
    return () => { popLayer(); release(); };
  }, []);

  return (
    <input
      ref={ref}
      className="row-rename"
      defaultValue={untitled ? '' : title}
      placeholder={untitled ? title : undefined}
      aria-label={label}
      spellCheck={false}
      onKeyDown={e => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); finish(true); }
      }}
      onBlur={() => finish(true)}
      onClick={e => e.stopPropagation()}
    />
  );
}
