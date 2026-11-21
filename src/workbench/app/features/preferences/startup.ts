import { t } from '../../../../shared/i18n/index.mjs';
import { createStore } from '../../lib/store';
import { editToken } from '../../workspace/api';
import { toast } from '../../components/Toast';

type StartupStatus = { enabled: boolean; available: boolean };
export const startupStore = createStore<StartupStatus & { ready: boolean; busy: boolean }>({ enabled: false, available: false, ready: false, busy: true });
export const startupEnabled = () => startupStore.get().enabled;
let generation = 0;
let reading: Promise<void> | null = null;
let writing = false;

async function readStatus(): Promise<StartupStatus> {
  const response = await fetch('/__gallery/startup');
  if (!response.ok) throw new Error(t('开机自启动设置读取失败'));
  return response.json();
}
const show = (status: StartupStatus) => startupStore.set({ enabled: status.enabled, available: status.available, ready: true, busy: writing });

// All menus observe one snapshot. A write invalidates earlier reads, including a
// visibility refresh in flight; its late answer cannot undo the write.
export function refreshStartup(): Promise<void> {
  if (writing) return Promise.resolve();
  if (reading) return reading;
  const turn = ++generation;
  const pending = readStatus().then(status => {
    if (turn === generation) show(status);
  }).catch(error => {
    if (turn !== generation) return;
    startupStore.set(state => ({ ...state, busy: false }));
    throw error;
  }).finally(() => { if (reading === pending) reading = null; });
  reading = pending;
  return pending;
}

export async function setStartup(enabled: boolean) {
  if (writing) return;
  writing = true;
  ++generation;
  reading = null;
  startupStore.set(state => ({ ...state, busy: true }));
  try {
    const status = await readStatus();
    show(status);
    if (!status.available) { toast(t('开机自启动需要 Windows 或 macOS 上正式安装的 Gallery。')); return; }
    const response = await fetch('/__gallery/startup', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gallery-Token': await editToken() }, body: JSON.stringify({ enabled }) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    show(result);
  } catch (error) {
    await readStatus().then(show).catch(() => {});
    toast(t('开机自启动设置失败：{0}', error instanceof Error ? error.message : String(error)), { tone: 'error' });
  } finally {
    writing = false;
    startupStore.set(state => ({ ...state, busy: false }));
  }
}
