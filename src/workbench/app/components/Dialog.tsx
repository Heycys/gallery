import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useDimFadesOut } from '../lib/afterimage';
import { pushLayer } from '../lib/layers';
import { useModalFocus } from '../lib/modalFocus';
import { createStore, useStore } from '../lib/store';
import { cls } from '../lib/util';

/** 通用确认对话框：choose() 返回用户点的按钮 id；按 Esc 或点遮罩返回 cancelId */
export interface DialogAction { id: string; label: string; primary?: boolean; danger?: boolean }
interface DialogState {
  id: number;
  title: string;
  message?: string;
  actions: DialogAction[];
  cancelId: string;
  resolve: (id: string) => void;
}

const dialogStore = createStore<DialogState | null>(null);
let seq = 0;

export function choose(opts: Omit<DialogState, 'resolve' | 'id'>): Promise<string> {
  dialogStore.get()?.resolve(dialogStore.get()!.cancelId);
  return new Promise(resolve => dialogStore.set({ ...opts, id: ++seq, resolve }));
}

const finish = (id: string) => {
  const d = dialogStore.get();
  if (!d) return;
  dialogStore.set(null);
  d.resolve(id);
};

export function DialogHost() {
  const d = useStore(dialogStore);
  if (!d) return null;
  return createPortal(<DialogView key={d.id} d={d} />, document.body);
}

/**
 * 一个确认对话框：打开时焦点在主按钮上，Tab 在几个按钮之间转，关上时焦点回到打开前的地方（lib/modalFocus.ts）；
 * 关上时它马上卸下，后面的遮罩淡出（lib/afterimage.ts）
 */
function DialogView({ d }: { d: DialogState }) {
  const overlay = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, () => ref.current?.querySelector<HTMLButtonElement>('button[data-primary]'));
  useDimFadesOut(overlay);
  useEffect(() => pushLayer(() => finish(d.cancelId)), [d]);
  return (
    <div ref={overlay} className="modal dialog-overlay" onPointerDown={e => { if (e.target === e.currentTarget) finish(d.cancelId); }}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-label={d.title} ref={ref}>
        <div className="dialog-title">{d.title}</div>
        {d.message && <div className="dialog-message">{d.message}</div>}
        <div className="dialog-actions">
          {d.actions.map(a => (
            <button
              key={a.id}
              className={cls('dialog-btn', a.primary && 'primary', a.danger && 'danger')}
              data-primary={a.primary || undefined}
              onClick={() => finish(a.id)}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
