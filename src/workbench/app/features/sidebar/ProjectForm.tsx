import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react';
import { Icon, PageIcon } from '../../components/Icon';
import { openPopover } from '../../components/Popover';
import { cls } from '../../lib/util';
import { addGalleryProject } from '../../workspace/commands';
import * as api from '../../workspace/api';
import type { ProjectWorkspace } from '../../workspace/types';
import { t } from '../../../../shared/i18n/index.mjs';

/**
 * 添加其他 Gallery 项目…（一栏标题的 ··· 菜单，after 是那一栏：加进来的放在它的下一个位置；docs/workbench.md「Columns」）。
 * 浏览器拿不到本机文件的路径，所以上面是一个路径框，右边只有一个「添加」（没有「取消」：Esc 或点到外面关掉）：粘贴工作区的文件夹、doc.html
 * 或它所在的文件夹。下面列出本机登记过的别的工作区（GET projects），每个可以展开看它的文档（按它自己侧栏的顺序，按层级缩进）；点一行就选中它，
 * 它的路径填进路径框（工作区是它的文件夹，文档是它的 doc.html），双击直接添加。「添加」照路径框里的路径做（commands.ts addGalleryProject）：
 * 工作区是它的整栏（全部文档），文档是它工作区的一栏只放它和它下面的；已经在侧栏里的只定位过去。服务器拒绝的（普通 HTML、找不到……）在卡片里说，卡片不关。
 * 样子（sidebar.css）：路径框和添加（主按钮，淡蓝底）在一行；下面的行是侧栏条目的样子（.project-row：30 高、圆角 6、选中是侧栏选中的底色），
 * 放不下的名字、灰字用样式在末尾收成 …。钩子：.project-form、.project-path（路径框和添加那一行）、.project-confirm（添加）、.project-list、
 * .project-group[data-ws]、.project-workspace（工作区那一行，展开的 aria-expanded 在 .project-toggle 上；.project-count 是文档个数）、
 * .project-document[data-entry]（--depth 是层级）、.selected（选中的那一行）
 */
export function openProjectForm(anchor: HTMLElement, after: string | null, ownerKey?: string) {
  openPopover({
    anchor,
    ownerKey, // 打开它的那一栏的标题开着时一直标着
    placement: anchor.closest('.row, .sec-head') ? 'right-start' : 'bottom-start',
    className: 'menu-wide link-form-pop project-form-pop',
    content: close => <ProjectForm close={close} after={after} />,
  });
}

function ProjectForm({ close, after }: { close: () => void; after: string | null }) {
  const [path, setPath] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [choices, setChoices] = useState<ProjectWorkspace[] | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    let live = true;
    api.projectChoices().then(found => { if (live) setChoices(found); }, () => { if (live) setChoices([]); });
    return () => { live = false; };
  }, []);

  const confirm = async (written: string) => {
    if (busy || !written.trim()) return;
    setBusy(true);
    setError('');
    try {
      const problem = await addGalleryProject(written.trim(), after);
      if (problem) setError(problem); else close();
    } finally {
      setBusy(false);
    }
  };
  // 选中一行：它的路径填进路径框
  const select = (key: string, value: string) => {
    setSelected(key);
    setPath(value);
    setError('');
  };
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing && (e.target as Element).matches('input')) { e.preventDefault(); void confirm(path); }
  };

  return (
    <div className="link-form project-form" onKeyDown={onKeyDown}>
      <div className="menu-head">{t('添加其他 Gallery 项目')}</div>
      <div className="project-path">
        <input
          ref={input}
          className="pop-input"
          name="path"
          autoComplete="off"
          aria-label={t('工作区文件夹或 doc.html 的路径')}
          placeholder={t('工作区文件夹或 doc.html 的路径')}
          value={path}
          spellCheck={false}
          onChange={e => { setPath(e.target.value); setSelected(null); setError(''); }}
        />
        <button className={cls('dialog-btn primary project-confirm', busy && 'busy')} disabled={busy || !path.trim()} onClick={() => void confirm(path)}>{t('添加')}</button>
      </div>
      {error && <div className="link-error" role="alert">{error}</div>}
      {choices === null && <div className="menu-empty">{t('正在读取别的工作区…')}</div>}
      {choices !== null && choices.length === 0 && <div className="menu-empty">{t('本机没有登记别的工作区')}</div>}
      {choices !== null && choices.length > 0 && (
        <div className="project-list">
          {choices.map(workspace => {
            const open = Boolean(opened[workspace.ws]);
            return (
              <div key={workspace.ws} className="project-group" data-ws={workspace.ws}>
                <div
                  className={cls('project-row project-workspace', selected === workspace.ws && 'selected')}
                  data-ws={workspace.ws}
                  data-tip={workspace.root}
                  onClick={() => select(workspace.ws, workspace.root)}
                  onDoubleClick={() => void confirm(workspace.root)}
                >
                  <button
                    className="project-toggle"
                    aria-expanded={open}
                    aria-label={open ? t('收起') : t('展开')}
                    disabled={workspace.documents.length === 0}
                    onClick={e => { e.stopPropagation(); setOpened(state => ({ ...state, [workspace.ws]: !open })); }}
                  >
                    <Icon name="chevron" />
                  </button>
                  <span className="mi-icon"><Icon name="folderClosed" /></span>
                  <span className="mi-label">
                    {workspace.name}
                    {workspace.above && <span className="project-above">{workspace.above}</span>}
                  </span>
                  <span className="project-count">{workspace.documents.length}</span>
                </div>
                {open && workspace.documents.map(document => (
                  <div
                    key={document.entry}
                    className={cls('project-row project-document', selected === document.entry && 'selected')}
                    data-entry={document.entry}
                    data-tip={document.path}
                    style={{ '--depth': document.depth } as CSSProperties}
                    onClick={() => select(document.entry, document.path)}
                    onDoubleClick={() => void confirm(document.path)}
                  >
                    <span className="mi-icon"><span className="pg-icon"><PageIcon icon={document.icon} /></span></span>
                    <span className="mi-label">{document.title}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
