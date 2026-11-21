import { createStore } from '../lib/store';
import type { SessionConnection, SessionSnapshot } from './connection';
import { IDLE, type Reply } from './protocol';

/** 当前打开的报告的会话状态（工作台据此显示状态、决定能否离开） */
export interface SessionState extends SessionSnapshot { slug: string | null }

const initial: SessionState = { slug: null, connected: false, commands: [], flags: IDLE };
export const sessionStore = createStore<SessionState>(initial);

let current: { slug: string; conn: SessionConnection; unsubscribe: () => void } | null = null;

export function attachSession(slug: string, conn: SessionConnection) {
  detachSession();
  const unsubscribe = conn.subscribe(snapshot => sessionStore.set({ ...snapshot, slug }));
  current = { slug, conn, unsubscribe };
}

export function detachSession(slug?: string) {
  if (!current || (slug && current.slug !== slug)) return;
  current.unsubscribe();
  current.conn.dispose();
  current = null;
  sessionStore.set(initial);
}

/** 当前报告（显示着的页面）的会话；没有时 null */
export const attachedConnection = () => current?.conn ?? null;

/** 当前报告有修改还没保存（在等停顿，或正在保存） */
export const isPending = (s: SessionState = sessionStore.get()) => s.connected && (s.flags.pending || s.flags.saving);

/** 当前报告能不能回答这个命令 */
export const can = (name: string, s: SessionState = sessionStore.get()) => s.connected && s.commands.includes(name);

/** 给当前报告发一个命令；没有连上时直接得到 { ok: false, reason: 'offline' } */
export const command = (name: string, fields?: object, timeout?: number): Promise<Reply> =>
  current ? current.conn.command(name, fields, timeout) : Promise.resolve({ ok: false, reason: 'offline' });

/**
 * 等待当前报告的状态满足条件（报告页刷新时会断开再重连）。
 * 超时返回 false。
 */
export function waitForSession(test: (s: SessionState) => boolean, timeout: number): Promise<boolean> {
  return new Promise(resolve => {
    if (test(sessionStore.get())) { resolve(true); return; }
    const timer = setTimeout(() => { unsub(); resolve(false); }, timeout);
    const unsub = sessionStore.subscribe(() => {
      if (!test(sessionStore.get())) return;
      clearTimeout(timer);
      unsub();
      resolve(true);
    });
  });
}
