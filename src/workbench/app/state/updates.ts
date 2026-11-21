import { t } from '../../../shared/i18n/index.mjs';
import { NEW_KEYS } from '../../../shared/renamed-storage.mjs';
import { hideToast, renameToast, toast, toastShown } from '../components/Toast';
import { createStore } from '../lib/store';
import { storage } from '../lib/util';
import { onPageUpdated } from '../workspace/api';
import { childrenOf } from '../workspace/meta';
import { pageOf, pageTitle, reportTitle, workspaceStore } from '../workspace/store';
import type { WorkspaceMeta } from '../workspace/types';
import { navStore, openCustomPage, openReport, pageKey } from './navigation';

/**
 * 别人改了、读者还没看的页面（docs/workbench.md「Updated elsewhere」）：服务器的事件流说 updated <键>（src/server/updates.mjs：
 * Agent 或别的程序写了一份文档的 doc.html、一个自定义页的 page.html，不是读者自己的修改），读者没在看它时，侧栏里它那一行的右端
 * 有个蓝色的圆点（它在收着的上级下面时，点在看得见的最近一级上），在打开的页面底部说一句「「周报」刚被 Agent 更新 · 打开」。
 * 读者在看的那一页不说（它自己原地拉取了改动）。键是侧栏的写法：这个工作区的文档是 slug，别处的底稿是 ~ws-xxxxxx/<slug>，
 * 自定义页是 @<slug>。
 *
 * 「看过」= 在工作台里打开过它，只记在这个浏览器里（localStorage 的 NEW_KEYS.updated：键 → 听到的时间），不写进任何文件；
 * 别的标签页打开了也算（storage 事件），开着它的标签页把别的标签页记下的它当场划掉。
 *
 * 一阵更新只说一次：提示条还在时，又一个页面变成没看过的，并进同一条（「「周报」等 3 个页面刚被 Agent 更新」，「打开」开最新的那个）；
 * 同一个页面接着又被写，点还是那一个，提示条在时只是重新计时，不在时不再说（它的点还在）。工作台的标签页在后台时提示等它回到前台再说。
 * 不算「减少通知」管的日常操作：照样说
 */

const KEY = NEW_KEYS.updated;
/** 提示条留多久（毫秒）：期间又有页面更新就并进来、重新计时 */
export const NOTICE_FOR = 8000;
/** 列表里找不到的键（删了、栏移除了）多久后划掉：刚建的文档可能比列表先到 */
const GRACE = 30000;

type Unseen = Record<string, number>;
const read = (): Unseen => {
  const value = storage.get<Unseen>(KEY);
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
};
export const updatesStore = createStore<Unseen>(read());
updatesStore.subscribe(() => {
  const value = updatesStore.get();
  if (JSON.stringify(value) !== JSON.stringify(read())) {
    if (Object.keys(value).length) storage.set(KEY, value); else storage.remove(KEY);
  }
});

/** 正在看的那一页的键（文档、底稿、链接是 slug，自定义页是 @<slug>），没有时 null */
function shownKey() {
  const { current } = navStore.get();
  return !current ? null : current.kind === 'page' ? pageKey(current.slug) : current.slug;
}

/** 从 key 往下（不含它自己）有没有没看过的 */
export function unseenBelow(unseen: Unseen, meta: WorkspaceMeta, key: string, seen = new Set<string>()): boolean {
  for (const child of childrenOf(meta, key)) {
    if (seen.has(child)) continue;
    seen.add(child);
    if (unseen[child] || unseenBelow(unseen, meta, child, seen)) return true;
  }
  return false;
}

const forget = (keys: string[]) => updatesStore.set(state => {
  if (!keys.some(key => state[key])) return state;
  const next = { ...state };
  for (const key of keys) delete next[key];
  return next;
});

const titleOf = (key: string) => {
  const ws = workspaceStore.get();
  const title = key.startsWith('@') ? pageTitle(pageOf(key.slice(1), ws)) : reportTitle(ws.reports[key]);
  return title.length > 24 ? `${title.slice(0, 23)}…` : title;
};
const open = (key: string) => void (key.startsWith('@') ? openCustomPage(key.slice(1)) : openReport(key));

/** 提示条说的那一阵：最新的在前 */
let burst: string[] = [];
/** 提示条的编号（Toast） */
let notice = 0;
/** 标签页在后台，提示条等它回到前台 */
let waiting = false;
const noticeUp = () => waiting || toastShown(notice);
const message = () => (burst.length === 1
  ? t('「{0}」刚被 Agent 更新', titleOf(burst[0]))
  : t('「{0}」等 {1} 个页面刚被 Agent 更新', titleOf(burst[0]), burst.length));

function showNotice() {
  if (document.visibilityState === 'hidden') { waiting = true; return; }
  waiting = false;
  const unseen = updatesStore.get();
  burst = burst.filter(key => unseen[key]);
  if (burst.length === 0) { hideToast(notice); return; }
  const latest = burst[0];
  notice = toast(message(), { action: t('打开'), onAction: () => open(latest), duration: NOTICE_FOR, tone: 'update' });
}

/** 听到 key 被别人写了 */
function heard(key: string) {
  if (!key || key === shownKey()) return; // 在看的那一页：它自己原地显示了改动
  const fresh = !updatesStore.get()[key];
  updatesStore.set(state => ({ ...state, [key]: Date.now() }));
  if (!fresh && !(noticeUp() && burst.includes(key))) return; // 点已经在了，提示也说过了
  if (!noticeUp()) burst = [];
  burst = [key, ...burst.filter(one => one !== key)];
  showNotice();
}

/** 打开着的那一页算看过了；它在提示条说的那一阵里时，提示条收起（读者已经去看了，别的还有点） */
function seeShown() {
  const key = shownKey();
  if (!key) return;
  forget([key]);
  if (burst.includes(key)) {
    burst = burst.filter(one => one !== key);
    waiting = false;
    hideToast(notice);
  }
}

/** 列表读好了：找不到的键（删掉的、移除了的栏里的）过了 GRACE 划掉；提示条还在时，标题跟上列表 */
function followList() {
  const ws = workspaceStore.get();
  if (ws.status !== 'ready') return;
  const unseen = updatesStore.get();
  const gone = Object.keys(unseen).filter(key => (key.startsWith('@') ? !pageOf(key.slice(1), ws) : !ws.reports[key]) && Date.now() - unseen[key] > GRACE);
  if (gone.length) forget(gone);
  if (toastShown(notice) && burst.length) renameToast(notice, message());
}

/** 开始听（App 启动时）；返回的函数停下 */
export function followUpdates(): () => void {
  seeShown();
  const unheard = onPageUpdated(heard);
  const unNav = navStore.subscribe(seeShown);
  const unList = workspaceStore.subscribe(followList);
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY && event.key !== null) return;
    updatesStore.set(read());
    seeShown();
  };
  const onVisible = () => { if (document.visibilityState === 'visible' && waiting) showNotice(); };
  window.addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    unheard();
    unNav();
    unList();
    window.removeEventListener('storage', onStorage);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
