import { useEffect, useRef, useState } from 'react';
import { t, told } from '../../../../shared/i18n/index.mjs';
import { useStore } from '../../lib/store';
import { extensionSettingsVisible } from '../../state/extensionSettings';
export { openExtensionSettings } from '../../state/extensionSettings';
import { useDimFadesOut } from '../../lib/afterimage';
import { pushLayer } from '../../lib/layers';
import { useModalFocus } from '../../lib/modalFocus';
import { choose } from '../../components/Dialog';
import { Icon, PageIcon } from '../../components/Icon';
import { closePopover } from '../../components/Popover';
import type { IconName } from '../../components/icons';
import { toast } from '../../components/Toast';
import { editToken } from '../../workspace/api';
import { deleteExtension } from '../../workspace/commands';
import { workspaceStore } from '../../workspace/store';
import { setExpanded } from '../../state/sidebar';
import { openSection } from '../../state/tree';
import type { ExtensionMeta } from '../../workspace/types';
import { extensionsStore, refreshExtensions, type ExtensionCapability, type ExtensionSetting } from './runtime';
import './extensions.css';

async function post(path: string, body: object) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gallery-Token': await editToken() }, body: JSON.stringify(body) });
  const answer = await response.json();
  if (!response.ok || !answer.ok) throw new Error(told(answer) ?? t('扩展设置保存失败'));
  return answer;
}
async function reveal(kind: 'extension' | 'sidebar' | 'extension-log' | 'extension-agent', id: string) {
  try {
    const result = await post('/__gallery/reveal', { kind, id });
    if (!result.opened) toast(result.why || t('无法打开文件夹'), { tone: 'error' });
  } catch (error) { toast(t((error as Error).message), { tone: 'error' }); }
}
function ExtIcon({ item }: { item?: ExtensionCapability }) {
  const icon = item?.manifest?.icon;
  return <span className="ext-icon" aria-hidden="true">{icon && !/[/.\\]/.test(icon) ? icon : icon && item
    ? <img alt="" src={`/__gallery/extensions/${encodeURIComponent(item.id)}/icon?v=${encodeURIComponent(item.manifest?.revision ?? '')}`} />
    : <Icon name="puzzle" />}</span>;
}
function DetailRow({ icon, label, value, action, run }: { icon: IconName; label: string; value: string; action?: string; run?: () => void }) {
  return <div className="ext-detail-row"><span className="comp-icon"><Icon name={icon} /></span><span className="ext-detail-label">{label}</span><span className="ext-detail-value" data-tip={value}>{value}</span>{action ? <button className="ext-link" onClick={run}>{action}</button> : <span />}</div>;
}
// One of the extension's own settings (its extension.json's `settings`): its label and help, the extension's
// words, and its control, as 组件列表's switches are (.comp-opt). Only a boolean has a control yet; a type this
// workbench does not know is not drawn. Greyed (and saying why) while the extension is off.
function SettingRow({ setting, value, locked, tip, onChange }: { setting: ExtensionSetting; value: unknown; locked: boolean; tip?: string; onChange: (value: unknown) => void }) {
  if (setting.type !== 'boolean') return null;
  const on = value === true;
  return <button type="button" role="switch" className="comp-opt ext-setting" data-key={setting.key} aria-checked={on} aria-disabled={locked} aria-label={setting.label} data-tip={tip} onClick={() => { if (!locked) onChange(!on); }}>
    <span className="comp-opt-text"><span className="comp-toggle-name">{setting.label}</span>{setting.help && <span className="comp-opt-hint">{setting.help}</span>}</span>
    <span className={'mi-switch' + (on ? ' on' : '')}><span /></span>
  </button>;
}
function Settings() {
  const { items } = useStore(extensionsStore);
  const columns = useStore(workspaceStore, s => s.extensions);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [installing, setInstalling] = useState(false);
  const [view, setView] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const previous = useRef<string | null>(null);
  const close = () => { closePopover(); extensionSettingsVisible.set(false); };
  // 焦点：打开时在第一个按钮（关闭），Tab 在里面转，关上时回到原处（lib/modalFocus.ts）；关上时遮罩淡出（lib/afterimage.ts）
  useModalFocus(dialog, () => dialog.current?.querySelector<HTMLButtonElement>('button'));
  useDimFadesOut(overlay);
  useEffect(() => {
    void refreshExtensions().catch(error => toast(t((error as Error).message), { tone: 'error' }));
    return pushLayer(close);
  }, []);
  const programs = (items ?? []).filter(item => item.manifest || item.error);
  // A program's columns (its sidebar.json's, those its program writes in columns/: owner) are rows of its detail, never cards.
  const standalone = columns.filter(column => !column.owner && !programs.some(item => item.id === column.id));
  const empty = !programs.length && !standalone.length;
  const selected = programs.find(item => item.id === view);
  const column = columns.find(column => column.id === view);
  const visibleView = selected || column ? view : null;
  const owned = selected ? columns.filter(value => value.id === selected.id || value.owner === selected.id) : column ? [column] : [];
  useEffect(() => {
    if (visibleView) dialog.current?.querySelector<HTMLButtonElement>('.comp-back')?.focus();
    else if (previous.current) dialog.current?.querySelector<HTMLButtonElement>('[data-id="' + CSS.escape(previous.current) + '"] .comp-pack-open')?.focus();
    previous.current = visibleView;
  }, [visibleView]);
  const go = (id: string | null) => { setView(id); setInstalling(false); };
  const showColumn = (column: ExtensionMeta) => {
    const group = workspaceStore.get().meta.groups.find(group => group.extension === column.id);
    close(); setExpanded(true); if (group) openSection(group.id);
    requestAnimationFrame(() => document.querySelector<HTMLElement>('#sidebar .sec-head[data-extension="' + CSS.escape(column.id) + '"]')?.scrollIntoView({ block: 'nearest' }));
  };
  const toggle = async (item: ExtensionCapability) => {
    if (busy[item.id]) return;
    const enabled = !(item.wanted ?? item.enabled);
    setBusy(value => ({ ...value, [item.id]: true }));
    try {
      await post('/__gallery/extensions', { id: item.id, enabled }); await refreshExtensions();
      toast(enabled ? t('已启用「{0}」', item.manifest?.name || item.id) : t('已停用「{0}」', item.manifest?.name || item.id));
    } catch (error) { toast(t((error as Error).message), { tone: 'error' }); }
    finally { setBusy(value => ({ ...value, [item.id]: false })); }
  };
  const toggleButton = (item: ExtensionCapability) => {
    const on = item.wanted ?? item.enabled, disabled = Boolean(busy[item.id] || (item.error && !on));
    return <button type="button" role="switch" className="comp-toggle" aria-label={t('启用扩展：{0}', item.manifest?.name || item.id)} aria-checked={on} aria-disabled={disabled} data-tip={item.error && !on ? t('修好 extension.json 之后才能启用') : on ? t('停用') : t('启用')} onClick={() => { if (!disabled) void toggle(item); }}><span className={'mi-switch' + (on ? ' on' : '')}><span /></span></button>;
  };
  // A setting switched: saved by the server (gallery.json, the backend's file), then the list read again,
  // which holds the values (the switch follows it, and so does the script's api.settings).
  const setSetting = async (item: ExtensionCapability, key: string, value: unknown) => {
    const at = item.id + ':' + key;
    if (busy[at]) return;
    setBusy(state => ({ ...state, [at]: true }));
    try { await post('/__gallery/extensions/settings', { id: item.id, values: { [key]: value } }); await refreshExtensions(); }
    catch (error) { toast(t((error as Error).message), { tone: 'error' }); }
    finally { setBusy(state => ({ ...state, [at]: false })); }
  };
  const settingRows = (item: ExtensionCapability) => {
    const declared = item.manifest?.settings ?? [];
    if (!declared.length) return null;
    const off = !(item.wanted ?? item.enabled);
    return <div className="comp-opts ext-settings" role="group" aria-label={t('扩展设置')}>
      {declared.map(setting => <SettingRow key={setting.key} setting={setting} value={item.settings?.[setting.key] ?? setting.default} locked={off || Boolean(busy[item.id] || busy[item.id + ':' + setting.key])} tip={off ? t('启用扩展之后才能改它的设置') : undefined} onChange={value => void setSetting(item, setting.key, value)} />)}
    </div>;
  };
  const status = (item: ExtensionCapability, full = false) => {
    const error = item.error ? t('extension.json 读不出来：{0}', item.error) : item.workbenchError ? item.workbenchError : item.enabled && item.backend?.state === 'retrying' ? t('后台程序退出了（退出码 {0}）', item.backend.exitCode ?? '?') : null;
    if (error) return <span className="ext-state" data-tone="error" role="alert">{full ? error : item.error ? t('配置错误') : item.workbenchError ? t('界面错误') : t('后台异常')}</span>;
    return null;
  };
  const remove = async (item: ExtensionCapability) => {
    const name = item.manifest?.name || item.id;
    const answer = await choose({ title: t('移除扩展「{0}」？', name), message: t('它的文件夹会被删除，包括它在侧栏里的栏目。这一步不能撤销。'), actions: [{ id: 'cancel', label: t('取消') }, { id: 'remove', label: t('移除'), primary: true, danger: true }], cancelId: 'cancel' });
    if (answer !== 'remove') return;
    try { await post('/__gallery/extensions/remove', { id: item.id }); await refreshExtensions(); go(null); toast(t('已移除「{0}」', name)); }
    catch (error) { toast(t((error as Error).message), { tone: 'error' }); }
  };
  const columnRow = (value: ExtensionMeta) => <DetailRow key={value.id} icon="sidebar" label={t('侧栏栏目')} value={value.title + ' · ' + (value.error ? t('条目读不出来：{0}', told(value.error) ?? '') : t('{0} 个条目', value.count))} action={t('在侧栏中显示')} run={() => showColumn(value)} />;
  return <div ref={overlay} className="pref-overlay ext-overlay" onPointerDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="pref-dialog comp-dialog ext-dialog" role="dialog" aria-modal="true" aria-label={t('拓展列表')} ref={dialog}>
      <header className="pref-head"><span className="pref-title">{t('拓展列表')}</span><span className="pref-sub">{t('给 Gallery 加按钮、侧栏栏目和后台功能，所有工作区共用。')}</span><div className="pref-actions"><button className="icon-btn" aria-label={t('关闭')} data-tip={t('关闭')} onClick={close}><Icon name="close" /></button></div></header>
      <div className="comp-body" aria-busy={items === null}>
        {items !== null && (!visibleView ? <>
          {empty ? <>
            <div className="ext-empty"><ExtIcon /><div className="ext-empty-title">{t('还没有安装扩展')}</div><div className="ext-empty-hint">{t('把扩展的文件夹或 zip 交给 Agent，或点下面的「安装扩展」。')}</div></div>
            <button className="ext-add" aria-expanded={installing} onClick={() => setInstalling(!installing)}><Icon name="plus" /><span>{t('安装扩展')}</span></button>
          </> : <div className="comp-packs">{programs.map(item => <div className="comp-pack ext-card" key={item.id} data-id={item.id} data-off={!(item.wanted ?? item.enabled) ? '' : undefined}>
            <button className="comp-pack-open" onClick={() => go(item.id)}><span className="comp-pack-icon"><ExtIcon item={item} /></span><span className="comp-pack-words"><span className="comp-pack-name">{item.manifest?.name || item.id}</span><span className="comp-pack-meta">{status(item) || item.manifest?.version || item.id}</span></span></button>{toggleButton(item)}
          </div>)}{standalone.map(column => <div className="comp-pack ext-card" key={column.id} data-id={column.id}><button className="comp-pack-open" onClick={() => go(column.id)}><span className="comp-pack-icon"><PageIcon icon={column.icon} fallback="sidebar" /></span><span className="comp-pack-words"><span className="comp-pack-name">{column.title}</span><span className="comp-pack-meta">{t('侧栏栏目')} · {t('{0} 个条目', column.count)}</span></span></button></div>)}
            <button className="comp-pack comp-pack-add" aria-expanded={installing} onClick={() => setInstalling(!installing)}><span className="comp-pack-icon"><Icon name="plus" /></span><span className="comp-pack-name">{t('安装')}</span></button>
          </div>}{installing && <Install done={() => setInstalling(false)} />}
        </> : <div className="comp-pack-view ext-view">
          <button className="comp-back" onClick={() => go(null)}><span className="comp-back-icon" aria-hidden="true"><Icon name="chevron" /></span>{t('返回')}</button>
          <div className="comp-pack-head"><span className="comp-pack-icon">{selected ? <ExtIcon item={selected} /> : <PageIcon icon={column?.icon} fallback="sidebar" />}</span><span className="comp-pack-words"><span className="comp-pack-name">{selected ? selected.manifest?.name || selected.id : column?.title}</span><span className="comp-pack-meta">{selected ? [selected.manifest?.version, selected.id].filter(Boolean).join(' · ') : t('侧栏栏目') + ' · ' + t('{0} 个条目', column?.count ?? 0)}</span></span>{selected && toggleButton(selected)}</div>
          {selected?.manifest?.description && <div className="comp-note">{selected.manifest.description}</div>}
          {selected && (status(selected, true) || (!selected.enabled && <div className="comp-note">{t('这个扩展关着：它的按钮和后台程序都不运行。')}</div>))}
          {column?.error && <div className="ext-state" data-tone="error" role="alert">{t('条目读不出来：{0}', told(column.error) ?? '')}</div>}
          {selected && settingRows(selected)}
          <div className="ext-detail-rows">
            {selected?.manifest?.workbench && <DetailRow icon="page" label={t('界面')} value={[selected.manifest.workbench.script, selected.manifest.workbench.style].filter(Boolean).join('、')} />}
            {selected?.manifest?.server && <DetailRow icon="fileCode" label={t('后台程序')} value={selected.manifest.server.command.join(' ') + ' · ' + ({ idle: t('尚未启动'), starting: t('正在启动'), running: t('运行中'), retrying: t('正在重试') }[selected.backend?.state ?? 'idle'])} action={t('查看日志')} run={() => void reveal('extension-log', selected.id)} />}
            {owned.map(columnRow)}
            {selected?.agent && <DetailRow icon="page" label={t('Agent 说明')} value={selected.agent} action={t('打开')} run={() => void reveal('extension-agent', selected.id)} />}
            <DetailRow icon="folder" label={selected ? t('文件夹') : t('文件')} value={selected?.folder ?? column?.file ?? ''} action={t('在文件夹中显示')} run={() => void reveal(selected ? 'extension' : 'sidebar', visibleView)} />
          </div>
          <button className="ext-link ext-remove" disabled={!selected && !column?.revision} onClick={() => selected ? void remove(selected) : void deleteExtension(visibleView)}>{selected ? t('移除扩展…') : t('删除分栏')}</button>
        </div>)}
      </div>
    </div>
  </div>;
}
function Install({ done }: { done: () => void }) {
  const [path, setPath] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null), file = useRef<HTMLInputElement>(null);
  useEffect(() => { input.current?.focus(); }, []);
  const install = async (source: { path: string } | { zip: string; filename: string }) => {
    setBusy(true); setError('');
    try { const result = await post('/__gallery/extensions/install', { ...source, enable: true }); await refreshExtensions(); done(); toast(t('已安装并启用「{0}」', result.installed.name || result.installed.id)); }
    catch (problem) { setError(t((problem as Error).message)); }
    finally { setBusy(false); }
  };
  const selected = async (picked?: File) => {
    if (!picked) return;
    if (picked.size > 100 * 1024 * 1024) { setError(t('扩展 ZIP 超过 100MB')); if (file.current) file.current.value = ''; return; }
    try {
      const bytes = new Uint8Array(await picked.arrayBuffer()); let text = '';
      for (let at = 0; at < bytes.length; at += 0x8000) text += String.fromCharCode(...bytes.subarray(at, at + 0x8000));
      await install({ zip: btoa(text), filename: picked.name });
    } catch (problem) { setError((problem as Error).message); }
    if (file.current) file.current.value = '';
  };
  return <div className="comp-import ext-import"><div className="comp-import-row"><input ref={input} className="pop-input" value={path} autoComplete="off" aria-label={t('粘贴扩展的文件夹或 zip 的路径')} placeholder={t('粘贴扩展的文件夹或 zip 的路径')} onChange={event => { setPath(event.target.value); setError(''); }} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && path.trim() && !busy) void install({ path: path.trim() }); }} />
    <button className="dialog-btn primary" disabled={busy || !path.trim()} onClick={() => void install({ path: path.trim() })}>{t('安装')}</button></div>
    <button className="comp-import-pick" disabled={busy} onClick={() => file.current?.click()}>{t('选择 zip 文件…')}</button><input ref={file} type="file" accept=".zip,application/zip" hidden onChange={event => void selected(event.target.files?.[0])} />
    {error && <div className="comp-import-error" role="alert">{error}</div>}</div>;
}
export function ExtensionSettingsHost() { return useStore(extensionSettingsVisible) ? <Settings /> : null; }
