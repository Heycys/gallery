import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { IMPORT_EXT } from '../../../../shared/import-types.mjs';
import { Icon } from '../../components/Icon';
import type { MenuEntry } from '../../components/Menu';
import { closePopover, openMenu, usePopoverOwner } from '../../components/Popover';
import { useDimFadesOut } from '../../lib/afterimage';
import { pushLayer } from '../../lib/layers';
import { useModalFocus } from '../../lib/modalFocus';
import { createStore, useStore } from '../../lib/store';
import { cls, storage } from '../../lib/util';
import { exportPage, importFiles } from '../../workspace/commands';
import { reportTitle, workspaceStore } from '../../workspace/store';
import type { ExportContent, ExportFormat, Paper } from '../../workspace/transfer';
import { canPickFolder, chooseExportFolder, exportFolder, writable, type DirectoryHandle } from '../../workspace/exportFolder';
import './transfer.css';
import { t } from '../../../../shared/i18n/index.mjs';

/**
 * 导出、导入两个对话框。
 * 导出：宽 320、内边距 24；导出格式、页面内容，PDF 还有页面格式和比例百分比（10 到 200 之间，超出时下面出红字、
 *   导出按钮不可用），包含子页面、为子页面创建文件夹（没开包含子页面时不可用）；取消 + 导出。记住上次的格式和纸张。
 *   下拉菜单贴在按钮下方 4px、右对齐、宽 180、不打勾；开关 30×18，200ms 过渡。
 *   保存到：浏览器下载，或选过的文件夹（workspace/exportFolder.ts：系统的选文件夹窗口，记在本机，导出直接写进去），
 *   记住上次选的哪个。
 * 格式只有 PDF、HTML、Markdown：没有数据库，所以没有 CSV 和数据库视图，也没有评论。“为子页面创建文件夹”在 Windows 上默认关着，别的系统默认开着。
 * 导入：拖放或选择文件（导入认得的格式，ZIP 最大 5GB），样子是工作台的对话框，一块：
 *   标题“导入”和导入到哪里（页面菜单的导入放在这一页下面，工作区菜单的放在顶层），一个拖放区（点它也能选文件），一行说明。
 *   整个对话框都能拖文件进来，拖着时拖放区变蓝。打开时焦点在拖放区上（回车、空格选文件）。
 * 两个都是对话框（lib/modalFocus.ts）：Tab 在里面转，关上时焦点回到打开前的地方；关上时后面的遮罩淡出（lib/afterimage.ts）。
 */

type Open = { kind: 'export'; slug: string } | { kind: 'import'; parent: string } | null;
const transferStore = createStore<Open>(null);
const close = () => transferStore.set(null);

/** 打开导出对话框 */
export const openExport = (slug: string) => { closePopover(); transferStore.set({ kind: 'export', slug }); };
/** 打开导入对话框：导入的页面放在 parent 下面（空串：顶层） */
export const openImport = (parent: string) => { closePopover(); transferStore.set({ kind: 'import', parent }); };

export function TransferHost() {
  const open = useStore(transferStore);
  if (!open) return null;
  return createPortal(<TransferOverlay key={open.kind === 'export' ? `export:${open.slug}` : `import:${open.parent}`} open={open} />, document.body);
}

function TransferOverlay({ open }: { open: NonNullable<Open> }) {
  const overlay = useRef<HTMLDivElement>(null);
  useDimFadesOut(overlay);
  return (
    <div ref={overlay} className="xf-overlay" onPointerDown={e => { if (e.target === e.currentTarget) close(); }}>
      {open.kind === 'export' ? <ExportDialog slug={open.slug} /> : <ImportDialog parent={open.parent} />}
    </div>
  );
}

/* ---------------- 导出 ---------------- */

const KEY = 'workbench:export-options';
const FORMATS: [ExportFormat, string][] = [['pdf', 'PDF'], ['html', 'HTML'], ['markdown', 'Markdown']];
const CONTENTS: [ExportContent, string][] = [['everything', t('所有内容')], ['no_files', t('文件和图片除外')]];
const PAPERS: [Paper, string][][] = [[['A4', 'A4'], ['A3', 'A3']], [['Letter', 'Letter'], ['Legal', 'Legal'], ['Tabloid', 'Tabloid']]];
const IS_WINDOWS = /Win/.test(navigator.platform);
const scaleOK = (value: number) => value > 0.1 && value < 2;
const pressed = (e: KeyboardEvent, keys = ['Enter', ' ']) => keys.includes(e.key);

function ExportDialog({ slug }: { slug: string }) {
  const saved = storage.get<{ format?: ExportFormat; paper?: Paper; place?: 'download' | 'folder' }>(KEY) ?? {};
  const [format, setFormat] = useState<ExportFormat>(FORMATS.some(([value]) => value === saved.format) ? saved.format! : 'markdown');
  const [paper, setPaper] = useState<Paper>(PAPERS.flat().some(([value]) => value === saved.paper) ? saved.paper! : 'A4');
  const [content, setContent] = useState<ExportContent>('everything');
  const [scale, setScale] = useState(1);
  const [scaleText, setScaleText] = useState('100');
  const [subpages, setSubpages] = useState(false);
  const [folders, setFolders] = useState(!IS_WINDOWS);
  const [folder, setFolder] = useState<DirectoryHandle | null>(null);
  const [toFolder, setToFolder] = useState(saved.place === 'folder');
  useEffect(() => { void exportFolder().then(handle => { setFolder(handle); if (!handle) setToFolder(false); }); }, []);
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, () => ref.current?.querySelector<HTMLElement>('[role="button"]'));
  useEffect(() => pushLayer(close), []);
  const valid = format !== 'pdf' || scaleOK(scale);
  // 写进文件夹前要有它的权限（浏览器重开后得在这次点击里再问）；没给就改为浏览器下载
  const run = async () => {
    if (!valid) return;
    storage.set(KEY, { format, paper, place: toFolder && folder ? 'folder' : 'download' });
    const target = toFolder && folder && (await writable(folder)) ? folder : null;
    close();
    void exportPage(slug, { format, content, subpages, folders, paper, scale }, { folder: target, refused: toFolder && folder && !target ? folder.name : undefined });
  };
  const place = (value: string) => {
    if (value === 'download') setToFolder(false);
    else if (value === 'folder') setToFolder(true);
    else void chooseExportFolder().then(handle => { if (handle) { setFolder(handle); setToFolder(true); } });
  };
  const label = (list: [string, string][], value: string) => list.find(([v]) => v === value)?.[1] ?? value;
  return (
    <div className="xf-export" role="dialog" aria-modal="true" aria-label={t('导出')} ref={ref}>
      <SelectRow label={t('导出格式')} value={label(FORMATS, format)} groups={[FORMATS]} onPick={v => setFormat(v as ExportFormat)} />
      <SelectRow label={t('页面内容')} value={label(CONTENTS, content)} groups={[CONTENTS]} onPick={v => setContent(v as ExportContent)} />
      {format === 'pdf' && (
        <>
          <SelectRow label={t('页面格式')} value={paper} groups={PAPERS} onPick={v => setPaper(v as Paper)} />
          <div className="xf-row xf-scale-row">
            <div className="xf-label">{t('比例百分比')}</div>
            <input
              className="xf-scale"
              type="text"
              inputMode="decimal"
              aria-label={t('比例百分比')}
              value={scaleText}
              onChange={e => {
                setScaleText(e.target.value);
                const n = parseFloat(e.target.value.replace(/[%\s]/g, ''));
                if (!Number.isNaN(n)) setScale(n / 100);
              }}
              onKeyDown={e => { if (e.key === 'Enter') void run(); }}
            />
          </div>
          {!scaleOK(scale) && <div className="xf-error">{t('比例百分比必须是 10 到 200 之间的数字')}</div>}
        </>
      )}
      {canPickFolder && (
        <SelectRow
          label={t('保存到')}
          value={toFolder && folder ? folder.name : t('浏览器下载')}
          groups={[[['download', t('浏览器下载')], ...(folder ? [['folder', folder.name] as [string, string]] : [])], [['choose', t('选择文件夹…')]]]}
          onPick={place}
        />
      )}
      <SwitchRow label={t('包含子页面')} on={subpages} onChange={setSubpages} />
      <SwitchRow label={t('为子页面创建文件夹')} on={folders} disabled={!subpages} onChange={setFolders} />
      <div className="xf-actions">
        <div role="button" tabIndex={0} className="xf-btn gray" onClick={close} onKeyDown={e => { if (pressed(e)) { e.preventDefault(); close(); } }}>{t('取消')}</div>
        <div role="button" tabIndex={0} className="xf-btn blue" aria-disabled={!valid || undefined} onClick={() => void run()} onKeyDown={e => { if (pressed(e)) { e.preventDefault(); void run(); } }}>{t('导出')}</div>
      </div>
    </div>
  );
}

/** 一行“标签 …… 当前值 ⌄”：点按钮在它下方 4px、右对齐弹出下拉菜单 */
function SelectRow({ label, value, groups, onPick }: { label: string; value: string; groups: [string, string][][]; onPick: (value: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const owner = `export-${label}`;
  const open = usePopoverOwner(owner);
  const show = () => {
    const entries: MenuEntry[] = groups.flatMap((group, i) => [
      ...(i ? [{ kind: 'sep' } as const] : []),
      ...group.map(([v, text]) => ({ label: text, onSelect: () => onPick(v) })),
    ]);
    openMenu(ref.current!, entries, { ownerKey: owner, placement: 'bottom-end', className: 'menu-select' });
  };
  return (
    <div className="xf-row">
      <div className="xf-label">{label}</div>
      <div
        ref={ref}
        role="button"
        tabIndex={0}
        aria-haspopup="menu"
        className={cls('xf-select', open && 'open')}
        onClick={show}
        onKeyDown={e => { if (pressed(e, ['Enter', ' ', 'ArrowDown'])) { e.preventDefault(); show(); } }}
      >
        <span>{value}</span>
        <Icon name="selectArrows" />
      </div>
    </div>
  );
}

/** 一行“标签 …… 开关”：元素不换，开关的圆点和底色才有过渡 */
function SwitchRow({ label, on, disabled = false, onChange }: { label: string; on: boolean; disabled?: boolean; onChange: (on: boolean) => void }) {
  const toggle = () => { if (!disabled) onChange(!on); };
  return (
    <div className="xf-row xf-switch-row">
      <div className="xf-label">{label}</div>
      <div
        role="switch"
        aria-label={label}
        aria-checked={on}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : 0}
        className={cls('xf-switch', 'g-switch', on && 'on', disabled && 'disabled')}
        onClick={toggle}
        onKeyDown={e => { if (pressed(e)) { e.preventDefault(); toggle(); } }}
      >
        <span />
      </div>
    </div>
  );
}

/* ---------------- 导入 ---------------- */

// 选文件时可选的类型：能导入的，再加上图片（和 Markdown 一起选，它引用的图片就一起进来）
const ACCEPT = [...Object.values(IMPORT_EXT).flat(), 'image/*'].join(',');

function ImportDialog({ parent }: { parent: string }) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const ws = useStore(workspaceStore);
  const dialog = useRef<HTMLDivElement>(null);
  const drop = useRef<HTMLDivElement>(null);
  useModalFocus(dialog, () => drop.current);
  useEffect(() => pushLayer(close), []);
  const start = (files: File[]) => {
    close();
    void importFiles(files, parent);
  };
  const pick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = ACCEPT;
    input.addEventListener('change', () => { if (input.files?.length) start([...input.files]); });
    input.click();
  };
  const hasFiles = (e: React.DragEvent) => e.dataTransfer?.types.includes('Files');
  const where = parent && ws.reports[parent] ? t('导入到「{0}」下面', reportTitle(ws.reports[parent])) : t('导入为顶层页面');
  return (
    <div
      ref={dialog}
      className="xf-import"
      role="dialog"
      aria-modal="true"
      aria-label={t('导入')}
      onDragEnter={e => { if (hasFiles(e)) { e.preventDefault(); depth.current += 1; setDragging(true); } }}
      onDragLeave={() => { depth.current -= 1; if (depth.current <= 0) { depth.current = 0; setDragging(false); } }}
      onDragOver={e => { if (hasFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; } }}
      onDrop={e => {
        if (!e.dataTransfer?.files.length) return;
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        start([...e.dataTransfer.files]);
      }}
    >
      <div className="xf-import-head">
        <div className="xf-import-title">{t('导入')}</div>
        <div className="xf-import-where">{where}</div>
      </div>
      <div
        ref={drop}
        role="button"
        tabIndex={0}
        aria-label={t('选择要导入的文件')}
        className={cls('xf-drop', dragging && 'dragging')}
        onClick={pick}
        onKeyDown={e => { if (pressed(e)) { e.preventDefault(); pick(); } }}
      >
        <Icon name="upload" />
        <div className="xf-drop-main">{t('拖放文件到这里，或')}<span className="xf-choose">{t('选择文件')}</span></div>
        <div className="xf-drop-kinds">{t('Markdown、HTML、Word、PDF、EPUB、CSV 或 ZIP')}</div>
      </div>
      <div className="xf-import-note">{t('ZIP 里的每个文件都会成为一个页面，最大 5GB')}</div>
    </div>
  );
}
