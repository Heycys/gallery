import { uid } from '../lib/util';
import { editToken } from '../workspace/api';
import { sessionStore, type SessionState } from './sessionStore';

/**
 * 这个工作台标签页打开着什么，报给本机的服务（gallery status，规格见 src/shared/presence.mjs，docs/workbench.md「Status」）：
 * 打开的文档或自定义页、它的标题、保存到哪一步（会话 state 里的标志）、有几条批注、光标所在的块和选中的字（报告页经会话的 focus 说的），
 * 以及这个标签页是不是正显示着、窗口有没有焦点。
 * 变了才报（防抖 300 毫秒），没变也每 20 秒报一次（心跳；服务 90 秒没听到就当它关了），标签页关掉时报一次 gone。
 * 服务把它们只放在内存里。报不上去（服务停了、令牌换了又失败）就算了：这是给 Agent 看的，读者不会看到任何提示。
 */

const TAB = 'w' + uid() + uid();
const DEBOUNCE = 300;
const HEARTBEAT = 20000;

let started = false;
let last = '';
let timer = 0;
let touching = false;

const route = '/__gallery/workspace/presence';

/** 现在要报的：连着的会话（文档或自定义页），其余情况（没打开、正在载入、网页链接）不报 */
function reportOf(state: SessionState, touched: boolean): Record<string, unknown> | null {
  const entry = state.slug;
  if (!state.connected || !entry) return null;
  const page = entry.startsWith('@');
  return {
    tab: TAB,
    entry,
    kind: page ? 'page' : 'document',
    title: state.title ?? '',
    visible: document.visibilityState === 'visible',
    focused: document.hasFocus(),
    touched,
    flags: state.flags,
    notes: state.annotations ?? 0,
    caret: state.focus?.caret ?? null,
    selection: state.focus?.selection ?? null,
  };
}

async function post(body: object, keepalive = false, retry = true): Promise<void> {
  const token = await editToken();
  const response = await fetch(route, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gallery-Token': token },
    body: JSON.stringify(body),
    keepalive,
  }).catch(() => null);
  const answer = await response?.json().catch(() => null);
  if (answer && answer.ok === false && answer.reason === 'token' && retry) {
    await editToken(true);
    return post(body, keepalive, false);
  }
}

/** 报一次：`force`（心跳）没变也报；`touched`：读者刚在这里做了什么（决定哪个标签页是最后用的） */
function send(force = false) {
  timer = 0;
  const state = sessionStore.get();
  const touched = touching;
  touching = false;
  const body = reportOf(state, touched);
  if (!body) {
    // 什么都没开着了（换去了网页链接、文档载入失败）：说一声，不让服务把它当成还开着
    if (last) void post({ tab: TAB, gone: true }).catch(() => {});
    last = '';
    return;
  }
  const key = JSON.stringify({ ...body, touched: undefined });
  if (!force && key === last) return;
  last = key;
  void post(body).catch(() => {});
}

function soon(touched = false) {
  if (touched) touching = true;
  if (!timer) timer = window.setTimeout(() => send(), DEBOUNCE);
}

/** 开始报告（工作台启动时一次）；返回的函数停下它（测试用） */
export function startPresence(): () => void {
  if (started) return () => {};
  started = true;
  // “用过”（读者在这个标签页里做了什么，决定哪个标签页是最后用的）：换去了另一份文档，光标或选区动了，有修改开始等着保存。
  // Agent 写了文件、页面因此重新显示、批注数变了都不算：后台标签页里的文档被 Agent 改了，它不因此成了“最后用的”
  let lastEntry: string | null = null;
  let lastFocus = '';
  let wasPending = false;
  const unsubscribe = sessionStore.subscribe(() => {
    const now = sessionStore.get();
    const entry = now.connected ? now.slug : null;
    let used = false;
    if (entry !== null) {
      if (entry !== lastEntry) { used = true; lastEntry = entry; lastFocus = ''; }
      const where = now.focus ? JSON.stringify(now.focus) : '';
      if (where && where !== lastFocus) { used = true; lastFocus = where; }
      const pending = Boolean(now.flags.pending || now.flags.saving);
      if (pending && !wasPending) used = true;
      wasPending = pending;
    }
    soon(used);
  });
  const visibility = () => soon(document.visibilityState === 'visible');
  const focus = () => soon(true);
  const blur = () => soon(false);
  const gone = () => { void post({ tab: TAB, gone: true }, true).catch(() => {}); };
  document.addEventListener('visibilitychange', visibility);
  window.addEventListener('focus', focus);
  window.addEventListener('blur', blur);
  window.addEventListener('pagehide', gone);
  const beat = window.setInterval(() => send(true), HEARTBEAT);
  soon(true);
  return () => {
    started = false;
    unsubscribe();
    document.removeEventListener('visibilitychange', visibility);
    window.removeEventListener('focus', focus);
    window.removeEventListener('blur', blur);
    window.removeEventListener('pagehide', gone);
    clearInterval(beat);
    clearTimeout(timer);
    timer = 0;
  };
}
