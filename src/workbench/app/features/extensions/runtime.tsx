import { t } from '../../../../shared/i18n/index.mjs';
import { navStore, extensionEntry } from '../../state/navigation';
import { workspaceStore } from '../../workspace/store';
import { editToken, onExtensionChange } from '../../workspace/api';
import { projectItem } from '../../../../shared/workspace-address.mjs';
import { toast } from '../../components/Toast';
import { choose, type DialogAction } from '../../components/Dialog';
import { openMenu } from '../../components/Popover';
import type { MenuEntry } from '../../components/Menu';
import { createStore } from '../../lib/store';

type Slot = 'topbar-end' | 'sidebar-footer';
export interface ExtensionRoute { kind: string; ws: string | null; slug: string | null; link: string; title: string }
/** A setting an extension.json declares (shared/extension-settings.mjs): only `boolean` is a type yet. */
export interface ExtensionSetting { key: string; type: string; label: string; help?: string; default?: unknown }
export type ExtensionSettingValues = Readonly<Record<string, unknown>>;
export interface ExtensionCapability {
  id: string; folder: string; enabled: boolean; wanted?: boolean; error?: string | null; agent?: string | null;
  manifest: { revision: string; name?: string; version?: string; description?: string; icon?: string; workbench?: { script?: string; style?: string }; server?: { command: string[] }; settings?: ExtensionSetting[] } | null;
  backend?: { state: 'idle' | 'starting' | 'running' | 'retrying'; exitCode?: number | null; retryAt?: number; log?: string } | null;
  workbenchError?: string | null;
  /** Every declared setting's value, the defaults filled in (none declared: absent). */
  settings?: Record<string, unknown>;
}
// What activate(api) receives: the only way an extension's script reaches the workbench (there is no
// global; a module that exports no activate is an extension error, reported as any other).
interface ExtensionAPI {
  slot(name: Slot): HTMLElement;
  onRoute(callback: (route: ExtensionRoute) => void): () => void;
  token(): Promise<string>;
  /** This extension's backend, as Gallery proxies it: an absolute URL ending in "/". */
  readonly backend: string;
  /** A request to the backend's `path` ("publish", "/publish?x=1"), with the token; the browser's Response. */
  fetch(path: string, init?: RequestInit): Promise<Response>;
  /** The values of the settings its extension.json declares, as 设置 › 拓展列表 has them now (frozen; {} for none). */
  readonly settings: ExtensionSettingValues;
  /** Told the values now and at each change of them; returns the unsubscribe. */
  onSettings(callback: (values: ExtensionSettingValues) => void): () => void;
  toast(message: string, options?: { tone?: 'info' | 'error'; action?: { label: string; run: () => void } }): void;
  confirm(options: { title: string; message?: string; actions: DialogAction[]; cancelId?: string }): Promise<string>;
  menu(anchor: HTMLElement, entries: MenuEntry[]): void;
}

const slots = new Map<Slot, HTMLElement>();
const slot = (name: Slot) => {
  if (name !== 'topbar-end' && name !== 'sidebar-footer') throw new Error(`Unknown Gallery slot: ${name}`);
  let element = slots.get(name);
  if (!element) { element = document.createElement('div'); element.className = `gallery-extension-slot ${name}`; slots.set(name, element); }
  return element;
};
export function ExtensionSlot({ name }: { name: Slot }) {
  return <div className="gallery-extension-anchor" ref={element => { if (element) element.append(slot(name)); }} />;
}
const route = (): ExtensionRoute => {
  const current = navStore.get().current, ws = workspaceStore.get();
  const owner = current ? projectItem(current.slug) : null;
  const title = !current ? '' : current.kind === 'page' ? ws.pages.find(page => page.slug === current.slug)?.title
    : current.kind === 'extension' ? extensionEntry(current.slug)?.entry.title : ws.reports[current.slug]?.title;
  return { kind: current?.kind ?? 'home', ws: owner?.ws ?? ws.self, slug: owner?.slug ?? current?.slug ?? null, link: location.href, title: title ?? '' };
};
function onRoute(callback: (value: ExtensionRoute) => void) {
  let previous = '';
  const changed = () => {
    const value = route(), key = JSON.stringify(value);
    if (key === previous) return; previous = key;
    try { callback(value); } catch (error) { console.error('Gallery extension route callback', error); }
  };
  const a = navStore.subscribe(changed), b = workspaceStore.subscribe(changed);
  window.addEventListener('hashchange', changed); changed();
  return () => { a(); b(); window.removeEventListener('hashchange', changed); };
}
// The backend's `path` as the address Gallery proxies (the backend's own /path, a query kept), never
// another address: a scheme, a backslash or a ".." out of it is the script's mistake, said as one. Scripts
// are served from files/@revision/<revision>/, so the address is never worked out from import.meta.url.
function backendURL(backend: string, path: string) {
  const refused = () => new TypeError(t('api.fetch 只接受这个扩展后台里的路径（如 "publish"），不接受 {0}', JSON.stringify(path)));
  if (typeof path !== 'string' || /^[a-z][a-z\d+.-]*:|\\/i.test(path)) throw refused();
  const url = new URL(path.replace(/^\/+/, ''), backend);
  if (!url.href.startsWith(backend)) throw refused();
  return url;
}
const shared: Pick<ExtensionAPI, 'token' | 'toast' | 'confirm' | 'menu'> = { token: () => editToken(),
  toast(message, options) { toast(message, { tone: options?.tone, action: options?.action?.label, onAction: options?.action?.run }); },
  confirm(options) { return choose({ ...options, cancelId: options.cancelId ?? 'cancel' }); },
  menu(anchor, entries) { openMenu(anchor, entries); },
};
export async function extensionCapabilities(): Promise<ExtensionCapability[]> {
  const response = await fetch('/__gallery/extensions', { cache: 'no-store' });
  if (!response.ok) throw new Error(t('扩展列表读取失败'));
  return (await response.json()).extensions;
}
type Loaded = { revision: string; style: HTMLLinkElement | null; owners: Map<Slot, HTMLElement>; cleanups: Set<() => void>; dispose?: () => void | Promise<void>; active: boolean;
  /** Its settings' values as last listed, and who hears them change (api.onSettings). */
  settings: ExtensionSettingValues; hearing: Set<(values: ExtensionSettingValues) => void> };
const valuesOf = (item: ExtensionCapability): ExtensionSettingValues => Object.freeze({ ...(item.settings ?? {}) });
const loaded = new Map<string, Loaded>();
const imports = new Map<string, Promise<any>>();
const errors = new Map<string, string>();
function reportError(id: string, revision: string, error: unknown) {
  const message = error instanceof Error ? error.stack || error.message : String(error ?? '');
  const key = `${revision}:${message}`;
  if (errors.get(id) === key) return;
  errors.set(id, key);
  void editToken().then(token => fetch('/__gallery/extensions/workbench-error', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gallery-Token': token }, body: JSON.stringify({ id, revision, message }) })).catch(error => console.error('Gallery extension error report', error));
}
function sourceError(source: string, error: unknown) {
  const match = /\/__gallery\/extensions\/([^/]+)\/files\/(?:@revision\/([a-f0-9]+)\/)?/.exec(source);
  if (!match) return;
  const id = decodeURIComponent(match[1]), entry = loaded.get(id);
  if (entry && (!match[2] || match[2] === entry.revision)) reportError(id, entry.revision, error);
}
export const extensionsStore = createStore<{ items: ExtensionCapability[] | null }>({ items: null });
function publish(items = extensionsStore.get().items) { extensionsStore.set({ items }); }
// An error of Gallery's own about the script, said without Gallery's stack.
const said = (message: string) => Object.assign(new Error(message), { stack: message });
function disposeEntry(id: string, entry: Loaded) {
  try { const result = entry.dispose?.(); if (result) void Promise.resolve(result).catch(error => console.error('Gallery extension dispose', id, error)); }
  catch (error) { console.error('Gallery extension dispose', id, error); }
  entry.dispose = undefined;
  entry.cleanups.forEach(off => off()); entry.cleanups.clear(); entry.hearing.clear();
  entry.owners.forEach(owner => owner.remove()); entry.owners.clear();
}
function unload(id: string, entry: Loaded) {
  if (loaded.get(id) === entry) loaded.delete(id);
  entry.active = false; entry.style?.remove();
  disposeEntry(id, entry);
}
function load(item: ExtensionCapability) {
  const workbench = item.manifest?.workbench;
  if (!workbench || imports.has(item.id)) return;
  const entry: Loaded = { revision: item.manifest!.revision, style: null, owners: new Map(), cleanups: new Set(), active: true, settings: valuesOf(item), hearing: new Set() };
  const backend = new URL(`/__gallery/extensions/${encodeURIComponent(item.id)}/api/`, location.origin).href;
  const api: ExtensionAPI = Object.freeze({ ...shared, backend,
    async fetch(path: string, init: RequestInit = {}) {
      const url = backendURL(backend, path), headers = new Headers(init.headers);
      headers.set('X-Gallery-Token', await editToken());
      return fetch(url, { ...init, headers });
    },
    slot(name: Slot) {
      let owner = entry.owners.get(name);
      if (!owner) { owner = document.createElement('div'); owner.className = 'gallery-extension-owner'; owner.dataset.extension = item.id; if (entry.active) slot(name).append(owner); entry.owners.set(name, owner); }
      return owner;
    },
    onRoute(callback: (value: ExtensionRoute) => void) {
      if (!entry.active) return () => {};
      const off = onRoute(value => { try { callback(value); } catch (error) { reportError(item.id, entry.revision, error); } }); entry.cleanups.add(off); return () => { off(); entry.cleanups.delete(off); };
    },
    get settings() { return entry.settings; },
    // As onRoute: the values now at once, then each change (refreshExtensions, when the list says other values).
    onSettings(callback: (values: ExtensionSettingValues) => void) {
      if (!entry.active) return () => {};
      const hear = (values: ExtensionSettingValues) => { try { callback(values); } catch (error) { reportError(item.id, entry.revision, error); } };
      const off = () => { entry.hearing.delete(hear); entry.cleanups.delete(off); };
      entry.hearing.add(hear); entry.cleanups.add(off); hear(entry.settings);
      return off;
    },
  });
  loaded.set(item.id, entry);
  const base = `/__gallery/extensions/${encodeURIComponent(item.id)}/files/@revision/${entry.revision}/`, suffix = '';
  if (workbench.style) { entry.style = document.createElement('link'); entry.style.rel = 'stylesheet'; entry.style.href = base + workbench.style + suffix; document.head.append(entry.style); }
  if (!workbench.script) return;
  // Do not block later disable/update events on an import or activate promise. A stale completion
  // cannot attach new owners; if it returns a disposer, call that disposer immediately.
  const pendingImport = import(/* @vite-ignore */ base + workbench.script + suffix);
  imports.set(item.id, pendingImport);
  void (async () => {
    const priorError = errors.get(item.id);
    try {
      let module;
      try { module = await pendingImport; }
      finally { if (imports.get(item.id) === pendingImport) imports.delete(item.id); }
      if (!entry.active) return;
      if (typeof module.activate !== 'function') throw said(t('工作台脚本需要导出 activate(api)'));
      const dispose = await module.activate(api);
      if (typeof dispose === 'function') entry.dispose = dispose;
      if (!entry.active) disposeEntry(item.id, entry);
      else if (errors.get(item.id) === priorError) reportError(item.id, entry.revision, '');
    } catch (error) {
      const current = entry.active && loaded.get(item.id) === entry;
      if (current) reportError(item.id, entry.revision, error);
      unload(item.id, entry); publish();
      // Wait for a new revision or an explicit re-enable; the same module is not evaluated twice.
      if (current) loaded.set(item.id, entry);
      if (current) {
        toast(t('扩展 {0} 加载失败', item.id), { tone: 'error' });
        console.error('Gallery extension load', item.id, error);
      }
    } finally {
      // A newer switch/update may have arrived before the import or activation finished.
      if (!entry.active && !loaded.has(item.id)) void refreshExtensions().catch(error => console.error('Gallery extensions refresh', error));
    }
  })();
}
let running: Promise<void> | null = null;
let dirty = false;
/** Coalesce events but read again when one arrives while an earlier read/load is in flight. */
export function refreshExtensions(): Promise<void> {
  dirty = true;
  if (running) return running;
  running = (async () => {
    do {
      dirty = false;
      const items = await extensionCapabilities();
      if (dirty) continue;
      const wanted = new Map(items.filter(item => item.enabled && item.manifest?.workbench).map(item => [item.id, item]));
      for (const [id, entry] of loaded) {
        const item = wanted.get(id);
        if (!item || item.manifest?.revision !== entry.revision) { unload(id, entry); continue; }
        // A setting changed (设置 › 拓展列表, gallery extension settings): no reload, its script told (api.onSettings).
        const values = valuesOf(item);
        if (JSON.stringify(values) === JSON.stringify(entry.settings)) continue;
        entry.settings = values;
        [...entry.hearing].forEach(hear => hear(values));
      }
      for (const item of wanted.values()) if (!loaded.has(item.id)) load(item);
      publish(items);
    } while (dirty);
  })().finally(() => { running = null; });
  return running;
}
let started: Promise<void> | undefined;
let listening = false;
export function startExtensions() {
  if (started) return started;
  if (!listening) {
    listening = true;
    window.addEventListener('error', event => sourceError(event.filename || String(event.error?.stack ?? ''), event.error || event.message));
    window.addEventListener('unhandledrejection', event => sourceError(String(event.reason?.stack ?? ''), event.reason));
    onExtensionChange(() => { void refreshExtensions().catch(error => console.error('Gallery extensions refresh', error)); });
  }
  started = refreshExtensions().catch(error => { started = undefined; throw error; });
  return started;
}
