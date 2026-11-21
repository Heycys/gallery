import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { language, t } from '../../../../shared/i18n/index.mjs';
import { choose } from '../../components/Dialog';
import { Icon } from '../../components/Icon';
import { closePopover } from '../../components/Popover';
import { toast } from '../../components/Toast';
import { useDimFadesOut } from '../../lib/afterimage';
import { pushLayer } from '../../lib/layers';
import { useModalFocus } from '../../lib/modalFocus';
import { createStore, useStore } from '../../lib/store';
import { preference, setPreference } from '../../../../shared/preferences.mjs';
import { can, command, sessionStore } from '../../session/sessionStore';
import { isDarkState, themeStore } from '../../state/theme';
import * as api from '../../workspace/api';
import { reportTitle, workspaceStore } from '../../workspace/store';
import { painted, SWAP_TIMEOUT, watchDrawn } from '../report/ReportView';
import '../preferences/preferences.css';
import './history.css';

/**
 * 历史版本（文档的「···」菜单：侧栏条目的和顶栏的「更多操作」，docs/workbench.md「History」）：一份文档存下的版本
 * （编辑服务的 history/<slug>/，docs/editor.md "Recent versions"），最新的在前。对话框的外壳同组件列表（preferences.css 的 pref-*）；
 * 左边是选中那一版排好的页面（列表给的 view 地址：那一版用和编辑区同一套套件、样式、字体与布局、自定义块渲染，像演示视图那样
 * 没有编辑器、不能编辑、不连实时事件、什么也不写，routes.mjs versionScript），一选中就显示：新的一张在原位置看不见地载入，
 * 画好了才换上，之前那张留到这时（快速连点时只载入最后选的那一版，前面没载完的作废）；换上时滚到上一张滚到的地方，
 * 外观跟工作台。页面上标着这一版和前一版比改了什么，和平时看 Agent 的修改是同一种标法（editor/page/changes/version.mjs：
 * 加的块绿底、改的字绿色、删的字红色划掉、删的块在原处留一个红色的影子，旁边各一条竖线）；最早的一版没有上一版，照原样显示。
 * 底下「显示改动」开关（读者的偏好 historyChanges，默认开）：关了就是这一版本来的样子，开关时显示着的和正在载入的那张都跟着
 * 换（事件 doc-history-marks，不重新载入），之后选的一版地址带 marks=off。右边是版本的列表，每行：什么时候、
 * 谁改的（你：页面上的修改、撤回、恢复；Agent：它改写了文件或用了命令；未知：最早存下的，和 Gallery 记下是谁之前存的），
 * 怎么来的和改了多少（+加的和改的块、−删的和改的块，像 Agent 修改条上的两个数，悬停说几块），改的是哪几块；现在的样子标「当前」。
 * 版本多、文档长时服务器一次只算一会儿（列表的 later：还有几版没算），对话框接着再问，算出来的数补上（服务器存下了，下次不再算）。
 * 底下「恢复」（淡蓝主按钮；选中的就是现在的样子时按不动），
 * 先问一句，恢复后对话框关上，提示条带「撤销」。打开着的就是这份文档时由页面去做（会话命令 restore-version：先存下还在等的
 * 修改，有冲突或没存的不做；写完页面当作自己的写入重新显示，不问写回了读者的什么），否则直接请服务器做（POST
 * /__gallery/edit/history）。恢复是读者自己的修改：「Agent 的修改」的审阅就此结束，不标差异。
 * 钩子：.hist-dialog、.hist-item[data-id]（aria-selected）、.hist-counts（.hist-plus、.hist-minus）、.hist-view、
 * .hist-frame[data-id]（data-pending：还在后台载入）、.hist-marks（role=switch）、.hist-restore。
 */

interface Block { change: 'added' | 'changed' | 'removed'; name?: string; text?: string; id?: string | null; title?: boolean }
type Counts = { added: number; changed: number; removed: number };
interface Version {
  id: string; time: string; version: string; by: 'reader' | 'agent' | null; kind: string | null; from?: string;
  // counts：null 是最早的一版；没有（undefined）是服务器这一次还没算到（列表的 later），再问一次就有
  current: boolean; counts?: Counts | null; blocks: Block[]; more?: number; view: string;
}
interface Listed { versions: Version[]; later?: number }
// 预览区的一张：哪一版、它的页面地址；failed：载入的不是文档的页面（服务器说找不到这个版本）
interface Frame { id: string; src: string; failed?: boolean }

const dialogStore = createStore<string | null>(null);

/** 打开一份文档的历史版本（菜单项关上菜单） */
export function openHistory(slug: string) {
  closePopover();
  dialogStore.set(slug);
}

export function HistoryHost() {
  const slug = useStore(dialogStore);
  if (!slug) return null;
  return createPortal(<HistoryDialog key={slug} slug={slug} />, document.body);
}

const close = () => dialogStore.set(null);

const ask = <T,>(slug: string, body: object) => api.post<T>('history', { slug, ...body }, true, { area: 'edit' });

/** 这份文档正开着（工作台里显示的就是它，页面能做这件事）：由页面去写 */
const openHere = (slug: string, name: string) => sessionStore.get().slug === slug && can(name);

// 什么时候：今天 / 昨天 / 几月几日，带时分；不是今年的带年
function timeLabel(iso: string) {
  const at = new Date(iso);
  const now = new Date();
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(at)) / 86400000);
  if (days === 0) return t('今天 {0}', time);
  if (days === 1) return t('昨天 {0}', time);
  const date = new Intl.DateTimeFormat(language === 'en' ? 'en' : 'zh-CN', { month: language === 'en' ? 'short' : 'long', day: 'numeric', ...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }) }).format(at);
  return `${date} ${time}`;
}

const WHO: Record<string, string> = { reader: t('你'), agent: 'Agent' };

// 一版的页面跟工作台的外观（套件的 ui.js 听 doc-theme-request）
function tellTheme(frame: HTMLIFrameElement | null) {
  try {
    frame?.contentWindow?.dispatchEvent(new CustomEvent('doc-theme-request', { detail: { theme: isDarkState(themeStore.get()) ? 'dark' : 'light' } }));
  } catch {} // 正在换页：画好时再说
}
const documentOf = (frame: HTMLIFrameElement | null) => {
  try { return frame?.contentDocument ?? null; } catch { return null; }
};
// 一版的页面标不标改动（version.mjs 听 doc-history-marks）
function tellMarks(frame: HTMLIFrameElement | null, shown: boolean) {
  try {
    frame?.contentWindow?.dispatchEvent(new CustomEvent('doc-history-marks', { detail: { shown } }));
  } catch {} // 正在换页：画好时再说
}
// 一版的页面地址：显示改动关着时带 marks=off（页面一开始就不标）
const srcOf = (version: Version, marks: boolean) => (marks ? version.view : `${version.view}&marks=off`);

// 这一版是怎么来的
function madeOf(version: Version, first: boolean) {
  if (first) return t('最早存下的样子');
  switch (version.kind) {
    case 'commit': return version.by === 'agent' ? t('Agent 在自用页面上改的') : t('页面上的修改');
    case 'revert': return t('撤回了 Agent 的修改');
    case 'undo': return t('撤销了撤回或恢复');
    case 'restore': return t('恢复了更早的版本');
    case 'hand-in': return t('导出时补上了编号');
    case 'rename': return t('改了标题');
    case 'page-icon': return t('换了图标');
    case 'write': return t('改写了文件');
    default: return t('修改');
  }
}

// 和前一版比：加了几块、改了几块、删了几块
function countsOf(counts: Version['counts']) {
  if (!counts) return '';
  const parts = [
    counts.added && t('加了 {0} 块', counts.added),
    counts.changed && t('改了 {0} 块', counts.changed),
    counts.removed && t('删了 {0} 块', counts.removed),
  ].filter(Boolean);
  return parts.length ? parts.join(t('、')) : t('块没有变');
}
// 改了多少，像 Agent 修改条上的两个数（changes/bar.mjs）：+ 加的和改的块，− 删的和改的块；一个是零就不写它
function Counts({ counts }: { counts: Counts }) {
  const plus = counts.added + counts.changed;
  const minus = counts.removed + counts.changed;
  if (!plus && !minus) return null;
  return (
    <span className="hist-counts" data-tip={countsOf(counts)}>
      {plus > 0 && <span className="hist-plus">+{plus}</span>}
      {minus > 0 && <span className="hist-minus">−{minus}</span>}
    </span>
  );
}

const VERBS: Record<Block['change'], string> = { added: t('加了'), changed: t('改了'), removed: t('删了') };
// 一块：怎么了、什么块（服务器给的编辑器里的名字，按界面的语言说）、开头的字
const blockOf = (block: Block) => {
  const name = block.name ? t(block.name) : t('块');
  return `${VERBS[block.change]} ${block.text ? t('{0}「{1}」', name, block.text) : name}`;
};

function HistoryDialog({ slug }: { slug: string }) {
  const ws = useStore(workspaceStore);
  const title = reportTitle(ws.reports[slug]);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // 显示着的那张和后台正在载入的那张（选中的那一版，画好了换上）
  const [frames, setFrames] = useState<{ shown: Frame | null; pending: Frame | null }>({ shown: null, pending: null });
  const [busy, setBusy] = useState(false);
  const [marks, setMarks] = useState(() => preference('historyChanges') as boolean);
  const marksNow = useRef(marks);
  marksNow.current = marks;
  const dialog = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  // 焦点：打开时在关闭按钮上，Tab 在里面转，关上时回到原处（lib/modalFocus.ts）；关上时遮罩淡出（lib/afterimage.ts）
  useModalFocus(dialog, () => dialog.current?.querySelector<HTMLElement>('.pref-close'));
  useDimFadesOut(overlay);
  const shownFrame = useRef<HTMLIFrameElement | null>(null);
  const pendingFrame = useRef<HTMLIFrameElement | null>(null);

  useEffect(() => {
    let live = true;
    // 服务器这一次没算完的（later），再问一次，算出来的数补到对应的那一行上（每次只算一会儿，算过的存下了）
    const more = (tries: number) => {
      ask<Listed>(slug, { action: 'versions' }).then(({ versions: found, later }) => {
        if (!live) return;
        const said = new Map(found.map((version) => [version.id, version]));
        setVersions((now) => now?.map((version) => (version.counts === undefined && said.get(version.id)?.counts !== undefined ? { ...version, ...said.get(version.id) } : version)) ?? now);
        if (later && tries > 1) more(tries - 1);
      }, () => {});
    };
    ask<Listed>(slug, { action: 'versions' }).then(({ versions: found, later }) => {
      if (!live) return;
      setVersions(found);
      // 打开历史多半是要回到以前：选中现在的样子之前的那一版（只有一版时就是它）
      setSelected((found.find((version) => !version.current) ?? found[0])?.id ?? null);
      if (later) more(100);
    }, (error: Error) => { if (live) setFailure(error.message); });
    const off = pushLayer(close);
    return () => {
      live = false;
      off();
    };
  }, [slug]);

  // 选中一版：它的页面在后台载入（已经显示着的就不用；换选了别的，没载完的那张作废）
  useEffect(() => {
    const version = versions?.find((each) => each.id === selected);
    if (!version) return;
    setFrames((now) => (now.shown?.id === version.id ? { ...now, pending: null }
      : now.pending?.id === version.id ? now
      : { ...now, pending: { id: version.id, src: srcOf(version, marksNow.current) } }));
  }, [versions, selected]);

  // 后台那张画好了（套件放出首帧，watchDrawn）：外观跟工作台、滚到上一张滚到的地方、焦点在页面里时 Esc 也关上对话框，
  // 再等它画两帧换上；载入的不是文档的页面时说没能显示。太久没画好（SWAP_TIMEOUT）也换上
  const pendingId = frames.pending?.id;
  useEffect(() => {
    const node = pendingFrame.current;
    if (!node || !pendingId) return;
    let live = true;
    const reveal = (failed = false) => {
      if (!live) return;
      setFrames((now) => (now.pending?.id === pendingId ? { shown: { ...now.pending, ...(failed ? { failed } : {}) }, pending: null } : now));
    };
    const stop = watchDrawn(node, () => {
      if (!live) return;
      const doc = documentOf(node);
      if (!doc?.querySelector('.doc-page')) return reveal(true);
      tellTheme(node);
      tellMarks(node, marksNow.current); // 载入时开关又变过
      const view = node.contentWindow;
      try {
        const before = shownFrame.current?.contentWindow;
        if (before && view) view.scrollTo(0, before.scrollY);
        view?.addEventListener('keydown', (event) => { if (event.key === 'Escape' && !event.defaultPrevented) close(); });
      } catch { /* 读不到的页面：照常换上 */ }
      void painted(node).then(() => reveal());
    });
    const timer = window.setTimeout(() => { stop(); reveal(); }, SWAP_TIMEOUT);
    return () => { live = false; stop(); clearTimeout(timer); };
  }, [pendingId]);

  // 工作台换了外观：显示着的、正在载入的都跟着换
  useEffect(() => themeStore.subscribe(() => { tellTheme(shownFrame.current); tellTheme(pendingFrame.current); }), []);

  // 「显示改动」：记成读者的偏好，显示着的和正在载入的那张马上跟着标或不标
  const toggleMarks = () => {
    const next = !marks;
    setMarks(next);
    setPreference('historyChanges', next);
    tellMarks(shownFrame.current, next);
    tellMarks(pendingFrame.current, next);
  };

  // 选中的一行留在看得见的地方
  useEffect(() => {
    list.current?.querySelector<HTMLElement>(`.hist-item[aria-selected="true"]`)?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const chosen = useMemo(() => versions?.find((version) => version.id === selected) ?? null, [versions, selected]);
  const last = versions ? versions.length - 1 : -1;

  // 上下键在列表里换一版
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!versions?.length || !['ArrowDown', 'ArrowUp'].includes(event.key)) return;
    event.preventDefault();
    const at = versions.findIndex((version) => version.id === selected);
    const next = versions[Math.max(0, Math.min(versions.length - 1, at + (event.key === 'ArrowDown' ? 1 : -1)))];
    setSelected(next.id);
    list.current?.querySelector<HTMLElement>(`.hist-item[data-id="${CSS.escape(next.id)}"]`)?.focus();
  };

  const restore = async () => {
    if (!chosen || chosen.current || busy) return;
    const when = timeLabel(chosen.time);
    const answer = await choose({
      title: t('恢复到这一版？'),
      message: t('文档会变回{0}的样子。现在的样子会先存成一个版本，之后还能恢复回来。', when),
      actions: [{ id: 'cancel', label: t('取消') }, { id: 'restore', label: t('恢复'), primary: true }],
      cancelId: 'cancel',
    });
    if (answer !== 'restore') return;
    setBusy(true);
    const done = await restoreVersion(slug, chosen.id);
    setBusy(false);
    if (!done) return;
    close();
    toast(t('已恢复到{0}的版本', when), done.undo ? { action: t('撤销'), onAction: () => void undoRestore(slug, done.undo!), duration: 10000 } : {});
  };

  const loading = Boolean(frames.pending) || (Boolean(selected) && !frames.shown && !failure);
  return (
    <div ref={overlay} className="pref-overlay" onPointerDown={e => { if (e.target === e.currentTarget) close(); }}>
      <div className="pref-dialog hist-dialog" role="dialog" aria-modal="true" aria-label={t('历史版本')} ref={dialog} onKeyDown={onKeyDown}>
        <header className="pref-head">
          <span className="pref-title">{t('历史版本')}</span>
          <span className="pref-sub">{title}</span>
          <div className="pref-actions">
            <button className="icon-btn pref-close" aria-label={t('关闭')} data-tip={t('关闭')} onClick={close}><Icon name="close" /></button>
          </div>
        </header>
        <div className="hist-body">
          <div className="hist-view" aria-busy={loading} aria-label={t('这一版的内容')}>
            {failure ? <div className="hist-empty" role="alert">{failure}</div> : (
              <>
                {[frames.shown, frames.pending].map((frame) => {
                  if (!frame) return null;
                  const pending = frame === frames.pending;
                  if (frame.failed) return <div key={frame.id} className="hist-empty">{t('没能读出这一版')}</div>;
                  return (
                    <iframe
                      key={frame.id} ref={pending ? pendingFrame : shownFrame} className="hist-frame" data-id={frame.id}
                      data-pending={pending ? '' : undefined} title={t('这一版的内容')} src={frame.src}
                    />
                  );
                })}
                {loading && <div className="pref-loading" role="progressbar" aria-label={t('正在显示这一版…')} />}
              </>
            )}
          </div>
          <div className="hist-side">
            <div className="hist-list" role="listbox" aria-label={t('版本')} ref={list}>
              {versions?.length === 0 && <div className="hist-empty">{t('还没有存下的版本')}</div>}
              {versions?.map((version, at) => (
                <button
                  key={version.id} type="button" role="option" className="hist-item" data-id={version.id} aria-selected={version.id === selected}
                  tabIndex={version.id === selected ? 0 : -1} onClick={() => setSelected(version.id)}
                >
                  <span className="hist-line">
                    <span className="hist-time">{timeLabel(version.time)}</span>
                    {version.current && <span className="hist-tag">{t('当前')}</span>}
                    <span className="hist-who">{version.by ? WHO[version.by] : t('未知')}</span>
                  </span>
                  <span className="hist-line">
                    <span className="hist-sum">{at === last || !version.counts ? madeOf(version, at === last) : version.counts.added + version.counts.changed + version.counts.removed ? madeOf(version, false) : `${madeOf(version, false)} · ${countsOf(version.counts)}`}</span>
                    {at !== last && version.counts && <Counts counts={version.counts} />}
                  </span>
                  {version.blocks.slice(0, 3).map((block, nth) => <span key={nth} className="hist-block" data-tip-cut="">{blockOf(block)}</span>)}
                  {version.blocks.length > 3 || version.more ? <span className="hist-block">{t('还有 {0} 块', version.blocks.length - 3 + (version.more ?? 0))}</span> : null}
                </button>
              ))}
            </div>
            <div className="hist-foot">
              <button
                type="button" role="switch" className="hist-marks" aria-checked={marks}
                data-tip={marks ? t('页面上标出这一版和上一版比改了什么') : t('页面是这一版本来的样子')} onClick={toggleMarks}
              >
                <span className="hist-marks-label">{t('显示改动')}</span>
                <span className={'mi-switch' + (marks ? ' on' : '')}><span /></span>
              </button>
              <button
                type="button" className="dialog-btn primary hist-restore" disabled={!chosen || chosen.current || busy}
                data-tip={chosen?.current ? t('这就是现在的样子') : undefined} onClick={() => void restore()}
              >
                {t('恢复')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface Restored { ok: boolean; undo?: string; same?: boolean; reason?: string; message?: string }

/**
 * 恢复一份文档到某一版（读者自己的写入）：开着的就是它时由页面做（restore-version），否则请服务器做。
 * 做到了时回答它（带着撤销用的 undo），没做到时提示原因、回答 null
 */
export async function restoreVersion(slug: string, version: string): Promise<Restored | null> {
  try {
    if (openHere(slug, 'restore-version')) {
      const reply = await command('restore-version', { version }, 30000) as Restored;
      if (reply.ok) return reply;
      if (reply.reason === 'pending') toast(t('还有修改没保存或有冲突待处理，处理完再恢复'), { tone: 'error', duration: 5000 });
      else toast(t('没能恢复：{0}', reply.message ?? reply.reason ?? t('预览服务器出错')), { tone: 'error', duration: 6000 });
      return null;
    }
    return await ask<Restored>(slug, { action: 'restore', version });
  } catch (error) {
    toast(t('没能恢复：{0}', (error as Error).message), { tone: 'error', duration: 6000 });
    return null;
  }
}

/** 撤销一次恢复（提示条的「撤销」）：文件还是恢复写的样子时，写回恢复之前的 */
export async function undoRestore(slug: string, undo: string) {
  try {
    if (openHere(slug, 'undo-version')) {
      const reply = await command('undo-version', { undo }, 30000) as Restored;
      if (!reply.ok) throw new Error(reply.reason === 'pending' ? t('还有修改没保存或有冲突待处理') : reply.message ?? reply.reason ?? t('预览服务器出错'));
    } else await ask(slug, { action: 'undo', undo });
    toast(t('已撤销'), { routine: true });
  } catch (error) {
    toast(t('没能撤销：{0}', (error as Error).message), { tone: 'error', duration: 6000 });
  }
}
