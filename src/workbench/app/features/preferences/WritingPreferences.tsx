import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { along, placeInRow } from '../../../../shared/drag-place.mjs';
import { t } from '../../../../shared/i18n/index.mjs';
import { PREFIXES } from '../../../../shared/renamed-storage.mjs';
import { Icon } from '../../components/Icon';
import { closePopover, openMenu } from '../../components/Popover';
import { choose } from '../../components/Dialog';
import { toast } from '../../components/Toast';
import { useDimFadesOut } from '../../lib/afterimage';
import { pushLayer } from '../../lib/layers';
import { createStore, useStore } from '../../lib/store';
import { isDarkState, themeStore } from '../../state/theme';
import * as api from '../../workspace/api';
import { revealFolder } from '../../workspace/commands';
import type { PreferenceDocument } from '../../workspace/api';
import { writePreferences } from '../../workspace/transfer';
import { painted, SWAP_TIMEOUT, watchDrawn } from '../report/ReportView';
import './preferences.css';
import './writing-prefs.css';

const dialogStore = createStore<number | null>(null);
let opened = 0;
export function openWritingPreferences() { closePopover(); dialogStore.set(++opened); }
const close = () => { closePopover(); dialogStore.set(null); };
export function WritingPreferencesHost() {
  const open = useStore(dialogStore);
  return open === null ? null : createPortal(<WritingPreferences key={open} />, document.body);
}
function forgetUnsaved(slug: string) {
  const prefixes = PREFIXES.flatMap(([old, now]) => [`${old}${slug}:`, `${now}${slug}:`]);
  for (const area of [() => localStorage, () => sessionStorage]) {
    try {
      const storage = area();
      for (const key of Object.keys(storage)) if (prefixes.some((prefix) => key.startsWith(prefix))) storage.removeItem(key);
    } catch {} // 存不了东西的浏览器（隐私窗口……）：本来就没留下什么
  }
}


const unshownNote = (unshown: string[]) => {
  const first = [...unshown[0]].length > 40 ? `${[...unshown[0]].slice(0, 40).join('')}…` : unshown[0];
  return unshown.length === 1
    ? t('写作偏好里有一处这里显示不了：{0}。Agent 照样读得到；在这里保存后，它会被去掉。', first)
    : t('写作偏好里有 {0} 处这里显示不了，例如：{1}。Agent 照样读得到；在这里保存后，它们会被去掉。', unshown.length, first);
};


function tellTheme(frame: HTMLIFrameElement | null) {
  try {
    frame?.contentWindow?.dispatchEvent(new CustomEvent('doc-theme-request', { detail: { theme: isDarkState(themeStore.get()) ? 'dark' : 'light' } }));
  } catch {} // 页面正在换（载入到一半）：它载入完时（onLoad）再告诉
}


type Visit = { key: string; id: string; slug: string; unshown: string[] };
type Editor = { save: () => Promise<void>; dirty: () => boolean };
function WritingPreferences() {
  const [items, setItems] = useState<PreferenceDocument[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [active, setActive] = useState('');
  const [visits, setVisits] = useState<Visit[]>([]);
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [focusNew, setFocusNew] = useState('');
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rename, setRename] = useState<{ id: string; name: string } | null>(null);
  const [drag, setDrag] = useState<string | null>(null);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const grabbed = useRef(0); // how far in from the dragged tab's left edge it was pressed (its picture follows the pointer so)
  const [hint, setHint] = useState(false);
  const editors = useRef(new Map<string, Editor>());
  const overlay = useRef<HTMLDivElement>(null);
  useDimFadesOut(overlay); // 关上时遮罩淡出（lib/afterimage.ts）
  const pending = useRef(new Set<string>());
  const preparations = useRef(new Map<string, ReturnType<typeof writePreferences>>());
  const live = useRef(true), savingRef = useRef(false), mutating = useRef(false);
  const listRef = useRef(items), visitsRef = useRef(visits);
  listRef.current = items; visitsRef.current = visits;
  // `hint`: whether the first-open note shows, as the server says it (the list's and a change's answer).
  const sync = (next: PreferenceDocument[], shown?: boolean) => {
    if (!live.current) return;
    setLoaded(true);
    setItems(next);
    if (typeof shown === 'boolean') setHint(shown);
    setVisits(before => before.flatMap(visit => {
      const item = next.find(item => item.id === visit.id || (item.slug && item.slug === visit.slug));
      return item ? [{ ...visit, id: item.id }] : [];
    }));
    setActive(before => next.some(item => item.id === before) ? before : next.find(item => item.slug && item.slug === listRef.current.find(old => old.id === before)?.slug)?.id ?? next[0]?.id ?? '');
  };
  useEffect(() => {
    live.current = true;
    let reading = false, again = false;
    const refresh = async () => {
      if (reading) { again = true; return; } reading = true;
      try { do { again = false; const answer = await api.preferenceDocuments(); sync(answer.items, answer.hint === true); } while (again && live.current); }
      catch (error) { if (live.current) toast((error as Error).message, { tone: 'error' }); }
      finally { reading = false; }
    };
    void refresh(); const off = api.onWorkspaceChange(() => void refresh());
    const prior = document.activeElement as HTMLElement | null;
    const layer = pushLayer(() => void leaveRef.current());
    return () => { live.current = false; off(); layer(); prior?.focus(); };
  }, []);
  useEffect(() => {
    if (!active || visits.some(visit => visit.id === active) || pending.current.has(active)) return;
    pending.current.add(active);
    void (async () => {
      try {
        const page = await api.instructions(active);
        let preparing = preparations.current.get(page.slug);
        if (!preparing) {
          preparing = writePreferences({ opening: true, preference: active, slug: page.slug });
          preparations.current.set(page.slug, preparing);
          void preparing.catch(() => preparations.current.delete(page.slug));
        }
        const answer = await preparing;
        if (!live.current) return;
        forgetUnsaved(page.slug);
        setItems(before => before.map(item => item.id === active ? { ...item, slug: page.slug } : item));
        setVisits(before => before.some(visit => visit.slug === page.slug) ? before : [...before, { key: page.slug, id: answer.preference ?? active, slug: page.slug, unshown: answer.unshown }]);
      } catch (error) { if (live.current) { toast((error as Error).message, { tone: 'error' }); if (!visitsRef.current.length) close(); } }
      finally { pending.current.delete(active); }
    })();
  }, [active, visits]);
  const act = async (change: object) => {
    if (mutating.current || savingRef.current) return null;
    mutating.current = true; setBusy(true);
    try { const result = await api.changePreferences(change); sync(result.items, result.hint); return result; }
    catch (error) { toast((error as Error).message, { tone: 'error' }); return null; }
    finally { mutating.current = false; setBusy(false); }
  };
  const save = async (source?: PreferenceDocument) => {
    if (savingRef.current || mutating.current) return null;
    savingRef.current = true; setSaving(true);
    try {
      for (const [key, editor] of editors.current) if ((!source || visitsRef.current.some(visit => visit.key === key && visit.id === source.id)) && editor.dirty()) await editor.save();
      const next = (await api.preferenceDocuments()).items;
      sync(next); if (!source) toast(t('已保存'), { routine: true });
      return next;
    } catch (error) { toast(t('写作偏好没有保存：{0}', (error as Error).message), { tone: 'error' }); return null; }
    finally { savingRef.current = false; if (live.current) setSaving(false); }
  };
  const saveRef = useRef(save); saveRef.current = save;
  // 关掉写作偏好（点弹窗外的空白处、右上角的关闭、Esc）时还有没保存的修改：先问一句，免得手滑丢了（用户 2026-11-13）。
  // 继续编辑（默认，Esc 或点确认框外面也是它）、不保存（关掉，修改不要了）、保存并关闭（保存成功才关）。
  const leaving = useRef(false);
  const leave = async () => {
    if (leaving.current) return;
    if (![...editors.current.values()].some(editor => editor.dirty())) { close(); return; }
    leaving.current = true;
    try {
      const choice = await choose({ title: t('写作偏好还没保存'), message: t('现在关掉，这次的修改就没了。'), actions: [{ id: 'keep', label: t('继续编辑') }, { id: 'discard', label: t('不保存') }, { id: 'save', label: t('保存并关闭'), primary: true }], cancelId: 'keep' });
      if (choice === 'discard') close();
      else if (choice === 'save' && await saveRef.current()) close();
    } finally { leaving.current = false; }
  };
  const leaveRef = useRef(leave); leaveRef.current = leave;
  // 焦点在偏好的页面里时的 Esc：页面自己没用上（没有关菜单、没有选中块或取消选中：它们都 preventDefault）才是给对话框的，和焦点在外面时一样先问
  const escape = () => void leaveRef.current();
  const key = (event: KeyboardEvent) => {
    if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 's') { event.preventDefault(); event.stopPropagation(); void saveRef.current(); }
  };
  useEffect(() => { window.addEventListener('keydown', key, true); return () => window.removeEventListener('keydown', key, true); }, []);
  const uniqueName = (base: string) => { let name = base; for (let n = 2; items.some(item => item.name === name); n++) name = base + ' ' + n; return name; };
  const add = async (source?: PreferenceDocument) => {
    // Copy the current title/body through the existing save path, not the older Markdown.
    if (source) {
      const original = source, slug = visitsRef.current.find(visit => visit.id === original.id)?.slug ?? original.slug;
      const next = await save(source); if (!next) return;
      source = next.find(item => item.id === original.id || (item.slug && item.slug === slug));
      if (!source) return;
    }
    const result = await act({ action: source ? 'duplicate' : 'create', id: source?.id, name: uniqueName(source ? source.name + t('（副本）') : t('新偏好')) });
    if (result) { setActive(result.selected); const item = result.items.find(item => item.id === result.selected)!; setFocusNew(item.id); setRename({ id: item.id, name: item.name }); }
  };
  const finishRename = async () => {
    const value = rename; setRename(null);
    const item = items.find(item => item.id === value?.id);
    if (item && value && value.name !== item.name) { const result = await act({ action: 'rename', id: item.id, name: value.name.trim(), revision: item.revision }); if (result) { setActive(result.selected); if (focusNew === item.id) setFocusNew(result.selected); } }
  };
  const menu = (anchor: HTMLElement, item: PreferenceDocument) => openMenu(anchor, [
    { icon: 'rename', label: t('重命名'), disabled: busy || saving, onSelect: () => setRename({ id: item.id, name: item.name }) },
    { icon: 'duplicate', label: t('创建副本'), disabled: busy || saving, onSelect: () => void add(item) },
    { icon: 'folder', label: t('在文件夹中显示'), onSelect: () => void revealFolder({ preference: item.id }) },
    { kind: 'sep' }, { icon: 'trash', label: t('删除'), danger: true, disabled: busy || saving, onSelect: () => void (async () => {
      const choice = await choose({ title: t('删除偏好「{0}」？', item.name), message: t('对应的 Markdown 文件会被删除，无法恢复。'), actions: [{ id: 'cancel', label: t('取消') }, { id: 'delete', label: t('删除'), primary: true, danger: true }], cancelId: 'cancel' });
      if (choice === 'delete') await act({ action: 'delete', id: item.id, revision: item.revision });
    })() },
  ], { className: 'wp-menu' });
  // Where a tab dragged goes is by the tab itself (the browser's picture of it, under the pointer where it was
  // pressed), not the pointer: a tab gives way as the dragged one's leading edge passes its middle
  // (src/shared/drag-place.mjs), as a database's view tabs; none where it stays.
  const dropAt = (strip: HTMLElement, x: number) => {
    const tabs = [...strip.querySelectorAll<HTMLElement>(':scope > [role="tab"]')];
    const from = items.findIndex(item => item.id === drag);
    if (from < 0 || tabs.length !== items.length) return null;
    const boxes = tabs.map(tab => along(tab.getBoundingClientRect(), 'x'));
    const start = x - grabbed.current;
    const place = placeInRow(boxes, from, { start, end: start + boxes[from].end - boxes[from].start });
    return place === from ? null : { id: items[place].id, after: place > from };
  };
  const reorder = async () => {
    if (!drag || !drop || drag === drop.id) return;
    const order = items.map(item => item.id).filter(id => id !== drag);
    order.splice(order.indexOf(drop.id) + Number(drop.after), 0, drag);
    await act({ action: 'order', order });
  };
  // The first-open note (the user's 2026-11-13): what 写作偏好 is for, and a project report's preferences to
  // start from, in Chinese or in English. An example becomes a preference of its own, its tab shown at
  // once, and the note closes with it (the server's answer says so); its × closes it alone. For good,
  // for the default workspace (.gallery/hints.json).
  const examples = [{ language: 'zh', label: t('中文示例') }, { language: 'en', label: t('English example') }];
  const addExample = async (language: string) => {
    const result = await act({ action: 'example', language });
    if (result) setActive(result.selected);
  };
  const selected = items.find(item => item.id === active);
  const selectedVisit = visits.find(visit => visit.id === active);
  const anyDirty = visits.some(visit => dirty[visit.key]);
  return <div ref={overlay} className="pref-overlay" onPointerDown={event => { if (event.target === event.currentTarget) void leave(); }}>
    <div className="pref-dialog wp-dialog" role="dialog" aria-modal="true" aria-label={t('写作偏好')}>
      <header className="pref-head"><span className="pref-title">{t('写作偏好')}</span><span className="pref-sub">{t('Agent 写作前会查看启用的偏好，并按本次任务选择适用的规则。')}</span><div className="pref-actions"><button className="pref-save" disabled={!anyDirty || saving || busy} onClick={() => void save()}>{t('保存')}</button><button className="icon-btn pref-close" aria-label={t('关闭')} data-tip={t('关闭')} onClick={() => void leave()}><Icon name="close" /></button></div></header>
      {hint && <section className="wp-hint" aria-label={t('写作偏好是做什么的')}>
        <p className="wp-hint-title">{t('写作偏好是做什么的')}</p>
        <p>{t('Agent 写文档、改文档之前，会先读这里启用的偏好，照着写。')}</p>
        <p>{t('你可以在这里新建、改写、停用和排序偏好；也可以直接让 Agent 帮你写一份，或者把已有的规则整理成偏好，比如“把我们团队写周报的习惯整理成一份写作偏好”。')}</p>
        <p className="wp-hint-ask">{t('想先看个样子？加一份项目报告的写作偏好示例，加进来后可以随意改：')}</p>
        <div className="wp-hint-act">{examples.map(example => <button key={example.language} className="wp-hint-example" data-language={example.language} disabled={busy || saving} onClick={() => void addExample(example.language)}><Icon name="plus" />{example.label}</button>)}</div>
        <button className="wp-hint-close" aria-label={t('关闭说明')} disabled={busy || saving} onClick={() => void act({ action: 'closeHint' })}><Icon name="close" /></button>
      </section>}
      <div className="wp-tabs"><div className="wp-strip" role="tablist" aria-label={t('写作偏好')}>
        {items.map((item, index) => <div key={item.id} className={'wp-tab' + (!item.enabled ? ' wp-tab-off' : '') + (drag === item.id ? ' wp-dragging' : '')} role="tab" tabIndex={item.id === active ? 0 : -1} aria-selected={item.id === active} aria-controls={'preference-' + (item.slug ?? index)} data-tip={item.file} data-drop={drop?.id === item.id ? drop.after ? 'after' : 'before' : undefined}
          draggable={!rename && !busy && !saving} onDragStart={event => { grabbed.current = event.clientX - event.currentTarget.getBoundingClientRect().left; setDrag(item.id); event.dataTransfer.setData('text/plain', item.id); event.dataTransfer.effectAllowed = 'move'; closePopover(); }}
          onDragOver={event => { if (!drag) return; event.preventDefault(); const next = dropAt(event.currentTarget.parentElement!, event.clientX); setDrop(now => (now?.id === next?.id && now?.after === next?.after ? now : next)); }}
          onDrop={event => { event.preventDefault(); void reorder(); setDrag(null); setDrop(null); }} onDragEnd={() => { setDrag(null); setDrop(null); }}
          onClick={event => { if (rename) return; if (item.id === active) menu(event.currentTarget, item); else setActive(item.id); }} onContextMenu={event => { event.preventDefault(); menu(event.currentTarget, item); }}
          onKeyDown={event => {
            if (rename) return;
            if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); const next = items[(index + (event.key === 'ArrowRight' ? 1 : items.length - 1)) % items.length]; setActive(next.id); const tabs = event.currentTarget.parentElement?.querySelectorAll<HTMLElement>('[role="tab"]'); tabs?.[items.indexOf(next)]?.focus(); }
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); menu(event.currentTarget, item); }
            if (event.key === 'F2') { event.preventDefault(); setRename({ id: item.id, name: item.name }); }
          }}>
          {rename?.id === item.id ? <input className="pop-input" autoFocus autoComplete="off" aria-label={t('重命名')} value={rename.name} onFocus={event => event.currentTarget.select()} onChange={event => setRename({ id: item.id, name: event.target.value })} onBlur={() => void finishRename()} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === 'Escape') { event.stopPropagation(); setRename(null); } if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void finishRename(); } }} /> : <><span className="wp-tab-name">{titles[item.slug ?? ''] ?? item.name}</span>{!item.enabled && <span className="wp-tag">{t('已停用')}</span>}{visits.some(visit => visit.id === item.id && dirty[visit.key]) && <span className="wp-tag" aria-label={t('未保存')}>●</span>}</>}
        </div>)}<button className="wp-new" aria-label={t('新建偏好')} data-tip={t('新建偏好')} disabled={busy || saving} onClick={() => void add()}><Icon name="plus" /></button>
      </div>{selected && <button className="wp-enable" role="switch" aria-checked={selected.enabled} aria-label={t('启用偏好：{0}', selected.name)} disabled={busy || saving} onClick={() => void act({ action: 'enabled', id: selected.id, enabled: !selected.enabled })}><span className="wp-enable-label">{t('启用')}</span><span className={'mi-switch' + (selected.enabled ? ' on' : '')}><span /></span></button>}</div>
      {!!items.length && !items.some(item => item.enabled) && <div className="pref-note">{t('全部偏好已停用，Agent 将按本次要求写作。')}</div>}
      {visits.map(visit => <PreferenceEditor key={visit.key} visit={visit} active={visit.id === active} register={editor => { if (editor) editors.current.set(visit.key, editor); else editors.current.delete(visit.key); }} changed={value => setDirty(before => before[visit.key] === value ? before : { ...before, [visit.key]: value })} onKey={key} onEscape={escape} titleChanged={title => setTitles(before => before[visit.key] === title ? before : { ...before, [visit.key]: title })} focusNew={!rename && !busy && focusNew === visit.id} focused={() => setFocusNew('')} />)}
      {(!loaded || !!items.length) && !selectedVisit && <div className="pref-body" aria-busy="true"><div className="pref-loading" role="progressbar" aria-label={t('正在打开写作偏好…')} /></div>}
    </div>
  </div>;
}
function PreferenceEditor({ visit, active, register, changed, onKey, onEscape, titleChanged, focusNew, focused }: { visit: Visit; active: boolean; register: (editor: Editor | null) => void; changed: (dirty: boolean) => void; onKey: (event: KeyboardEvent) => void; onEscape: () => void; titleChanged: (title: string) => void; focusNew: boolean; focused: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [shown, setShown] = useState(false), [unshown, setUnshown] = useState(visit.unshown);
  const changes = useRef(0), savedAt = useRef(0), watcher = useRef<MutationObserver | null>(null);
  const current = useRef({ visit, changed, onKey, onEscape, titleChanged }); current.current = { visit, changed, onKey, onEscape, titleChanged };
  const titleWatcher = useRef<MutationObserver | null>(null);
  const ready = useRef(false);
  useEffect(() => {
    register({ dirty: () => changes.current !== savedAt.current, save: async () => {
      if (!ready.current) throw new Error(t('页面上的修改还没有存好，请稍后再试'));
      const page = frame.current?.contentWindow as (Window & { __galleryEditFlush?: () => Promise<string> }) | null;
      const outcome = await page?.__galleryEditFlush?.() ?? 'nothing';
      if (outcome !== 'saved' && outcome !== 'nothing') throw new Error(t('页面上的修改还没有存好，请稍后再试'));
      const at = changes.current;
      const answer = await writePreferences({ preference: current.current.visit.id, slug: current.current.visit.slug });
      savedAt.current = at; current.current.changed(changes.current !== at); setUnshown(answer.unshown);
    } });
    const off = themeStore.subscribe(() => tellTheme(frame.current));
    return () => { register(null); watcher.current?.disconnect(); titleWatcher.current?.disconnect(); off(); };
  }, []);
  useEffect(() => {
    const node = frame.current; if (!node) return;
    let live = true;
    const reveal = () => { if (live) { ready.current = true; setShown(true); } };
    const stop = watchDrawn(node, () => { tellTheme(node); void painted(node).then(reveal); });
    const timer = window.setTimeout(reveal, SWAP_TIMEOUT);
    return () => { live = false; stop(); clearTimeout(timer); };
  }, []);
  useEffect(() => {
    if (!active || !focusNew || !shown) return;
    const doc = frame.current?.contentDocument; if (!doc) return;
    const focus = () => {
      const body = doc.querySelector<HTMLElement>('main [contenteditable="true"]:not(.doc-title)');
      if (!body) return false;
      body.focus({ preventScroll: true }); focused(); return true;
    };
    if (focus()) return;
    const observer = new MutationObserver(() => { if (focus()) observer.disconnect(); });
    observer.observe(doc.documentElement, { subtree: true, attributes: true, attributeFilter: ['contenteditable'] });
    return () => observer.disconnect();
  }, [active, focusNew, shown]);
  useEffect(() => {
    frame.current?.contentWindow?.dispatchEvent(new CustomEvent('doc-live-active', { detail: active }));
  }, [active]);
  const onLoad = () => {
    const page = frame.current?.contentWindow, root = frame.current?.contentDocument?.documentElement;
    if (!page || !root) return;
    tellTheme(frame.current); watcher.current?.disconnect(); titleWatcher.current?.disconnect();
    const title = root.querySelector('.doc-title');
    if (title) {
      const update = () => current.current.titleChanged(root.querySelector('.doc-title')?.textContent?.trim() || t('未命名文档'));
      titleWatcher.current = new MutationObserver(update);
      titleWatcher.current.observe(root, { childList: true, characterData: true, subtree: true });
      update();
    }
    watcher.current = new MutationObserver(() => { if (root.getAttribute('data-ge-save') !== 'saved') { changes.current++; current.current.changed(true); } });
    watcher.current.observe(root, { attributes: true, attributeFilter: ['data-ge-save'] });
    page.addEventListener('keydown', event => current.current.onKey(event), true);
    // Esc：页面先用（它的菜单、块的选中在冒泡的路上 preventDefault），没用上的才转给对话框（关上前问有没有没保存的修改）
    page.addEventListener('keydown', event => { if (event.key === 'Escape' && !event.defaultPrevented && !event.isComposing) current.current.onEscape(); });
  };
  return <div className="wp-editor" role="tabpanel" id={'preference-' + visit.slug} hidden={!active}>
    {!!unshown.length && <div className="pref-note">{unshownNote(unshown)}</div>}
    <div className="pref-body" aria-busy={!shown}><iframe ref={frame} className="pref-frame" data-live-active={active} data-pending={shown ? undefined : ''} title={t('写作偏好')} src={'/generated/' + visit.slug + '.html?solo'} onLoad={onLoad} />{!shown && <div className="pref-loading" role="progressbar" aria-label={t('正在打开写作偏好…')} />}</div>
  </div>;
}
