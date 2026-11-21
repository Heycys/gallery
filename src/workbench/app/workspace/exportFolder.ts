/**
 * 导出的保存位置：浏览器下载（默认），或用户选的一个文件夹（File System Access：showDirectoryPicker，系统的选文件夹窗口），
 * 选过的文件夹记在本机（IndexedDB 里存它的句柄，下次打开还在）。导出时直接写进去，同名的加“ (1)”“ (2)”，不覆盖。
 * 浏览器只给文件夹的名字，不给完整路径，所以对话框里显示名字。不支持的浏览器（Firefox、Safari）只有浏览器下载。
 */

import { DATABASES, OLD_DATABASES, carryDatabase } from '../../../shared/renamed-storage.mjs';

interface DirectoryHandle {
  name: string;
  getFileHandle(name: string, options?: { create?: boolean }): Promise<{ createWritable(): Promise<{ write(data: Blob): Promise<void>; close(): Promise<void> }> }>;
  queryPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(options: { mode: 'readwrite' }): Promise<PermissionState>;
}
type Picker = (options: { id?: string; mode?: 'readwrite'; startIn?: DirectoryHandle | string }) => Promise<DirectoryHandle>;

const picker = (globalThis as unknown as { showDirectoryPicker?: Picker }).showDirectoryPicker;
/** 这个浏览器能不能选文件夹 */
export const canPickFolder = typeof picker === 'function';

const DB = DATABASES.workbench;
const STORE = 'handles';
const KEY = 'export-folder';

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
/**
 * 改名前（2026-10-26 之前）选的文件夹记在旧的数据库（OLD_DATABASES.workbench）里：每个页面第一次读写前，新库里没有的就从旧库抄过来，
 * 旧库不动也不删（旧版本的工作台可能还开着）。抄失败了这次就当没有，下次打开再试（renamed-storage.mjs carryDatabase）。
 */
let carried: Promise<unknown> | null = null;
async function stored<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  await (carried ??= carryDatabase(indexedDB, { from: OLD_DATABASES.workbench, store: STORE, open: database }).catch(() => { carried = null; }));
  const db = await database();
  return new Promise((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

let known: DirectoryHandle | null | undefined;

/** 记住的导出文件夹（没有时 null） */
export async function exportFolder(): Promise<DirectoryHandle | null> {
  if (known !== undefined) return known;
  try {
    known = canPickFolder ? (await stored<DirectoryHandle>('readonly', store => store.get(KEY))) ?? null : null;
  } catch {
    known = null;
  }
  return known;
}

/** 选一个导出文件夹（系统的窗口，从上次的位置打开）并记住；取消时 null */
export async function chooseExportFolder(): Promise<DirectoryHandle | null> {
  if (!picker) return null;
  try {
    const handle = await picker({ id: 'report-export', mode: 'readwrite', ...(known ? { startIn: known } : {}) });
    known = handle;
    await stored('readwrite', store => store.put(handle, KEY)).catch(() => {});
    return handle;
  } catch {
    return null; // 取消了
  }
}

/** 能不能写进这个文件夹（浏览器重开后要再问一次：得在这次点击里问） */
export async function writable(handle: DirectoryHandle): Promise<boolean> {
  try {
    if ((await handle.queryPermission?.({ mode: 'readwrite' })) === 'granted') return true;
    return (await handle.requestPermission?.({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

/** 把 blob 写进文件夹，名字被占了就加“ (1)”…；返回写下的名字 */
export async function writeInto(handle: DirectoryHandle, name: string, blob: Blob): Promise<string> {
  const dot = name.lastIndexOf('.');
  const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, ''];
  let fileName = name;
  for (let n = 1; n < 1000; n++) {
    try {
      await handle.getFileHandle(fileName); // 已经有了：换个名字
      fileName = `${stem} (${n})${ext}`;
    } catch {
      break;
    }
  }
  const file = await handle.getFileHandle(fileName, { create: true });
  const out = await file.createWritable();
  await out.write(blob);
  await out.close();
  return fileName;
}

export type { DirectoryHandle };
