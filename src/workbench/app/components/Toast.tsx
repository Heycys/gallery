import { useEffect } from 'react';
import { createStore, useStore } from '../lib/store';
import { cls } from '../lib/util';
import { t } from '../../../shared/i18n/index.mjs';
import { preference } from '../../../shared/preferences.mjs';

interface ToastState { id: number; message: string; action?: string; onAction?: () => void; duration?: number; tone?: 'info' | 'error' | 'update'; visible: boolean }

const toastStore = createStore<ToastState>({ id: 0, message: '', visible: false });
/** 页面底部的面板占到离工作台窗口底多高（px）：提示条站在它上面 8px，工作台自己的提示也一样；和提示分开存，变了不重新计时 */
const roomStore = createStore<number>(0);
const ABOVE = 8;

/**
 * 底部提示条；可带一个动作按钮（如“撤销”），可指定显示多久、是不是出错。服务器给的中文说明也按界面语言查一遍（已经是界面语言的不变）。
 * 返回这一条的编号（没显示时 0）：hideToast(编号) 只收起它自己，toastShown(编号) 问它还在不在
 */
export function toast(message: string, { routine = false, ...opts }: { action?: string; onAction?: () => void; duration?: number; tone?: 'info' | 'error' | 'update'; routine?: boolean } = {}) {
  if (routine && preference('quietNotices')) return 0; // 减少通知：日常操作（看得到结果的）不说，和报告页一样（editor/page/quiet.mjs）
  toastStore.set(s => ({ id: s.id + 1, message: t(message), action: undefined, onAction: undefined, duration: undefined, tone: undefined, ...opts, visible: true }));
  return toastStore.get().id;
}

/** 编号为 id 的那一条还显示着（没有被别的提示换掉、没有收起） */
export const toastShown = (id: number) => { const s = toastStore.get(); return id > 0 && s.visible && s.id === id; };

/** 显示着的那一条还是 id 时，换掉它的文字，不重新计时 */
export function renameToast(id: number, message: string) {
  toastStore.set(s => (s.id === id && s.visible && s.message !== message ? { ...s, message } : s));
}

/** 页面底部的面板占到离窗口底多高（没有为 0） */
export function setToastRoom(room: number) {
  roomStore.set(room);
}

/** 收起提示条；给了编号时只收起那一条（已经换成别的提示时不动） */
export function hideToast(id?: number) {
  toastStore.set(s => (id !== undefined && s.id !== id ? s : { ...s, visible: false }));
}

export function ToastHost() {
  const t = useStore(toastStore);
  const room = useStore(roomStore);
  useEffect(() => {
    if (!t.visible) return;
    const timer = setTimeout(() => toastStore.set(s => ({ ...s, visible: false })), t.duration ?? (t.action ? 5000 : 2200));
    return () => clearTimeout(timer);
  }, [t.id, t.visible, t.action, t.duration]);

  return (
    <div className={cls('toast', t.visible && 'show', t.tone === 'error' && 'error', t.tone === 'update' && 'update')} role="status" style={room ? { bottom: room + ABOVE } : undefined}>
      <span>{t.message}</span>
      {/* 收起后（淡出时、之后）按钮还在，但 Tab 走不到、读屏不读、回车也按不到它（inert）：只有显示着的提示条的按钮能按 */}
      {t.action && (
        <button inert={!t.visible} onClick={() => { toastStore.set(s => ({ ...s, visible: false })); t.onAction?.(); }}>{t.action}</button>
      )}
    </div>
  );
}
