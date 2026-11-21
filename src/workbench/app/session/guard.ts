import { toast } from '../components/Toast';
import type { SessionConnection } from './connection';
import { attachedConnection, command, sessionStore } from './sessionStore';
import { t } from '../../../shared/i18n/index.mjs';

/**
 * prepare-close 还没回答的页面（按它的会话）和那个回答：回答之前再离开它（接连点了几份报告）不再发一次，
 * 报告区移除它之前也等这个（left）
 */
const leaving = new WeakMap<SessionConnection, Promise<unknown>>();

/**
 * 离开当前报告之前（切换报告、新建、删除、关闭窗口……）：请报告页先把还在等的修改保存掉。
 * 报告页总会放行、也不问读者：来不及保存的修改留在浏览器里（崩溃缓冲），下次打开这份报告时自动写回；
 * 冲突也不拦人，下次打开时列出读者的文字。所以这里只等它一下（最多 1.5 秒），总是放行。
 * 切换报告时不等这个回答就开始载入下一份（navigation.ts），报告区等它回答了才移除这个页面（ReportView 用 left）。
 */
export async function leaveReport(): Promise<boolean> {
  const conn = attachedConnection();
  if (conn && sessionStore.get().connected) {
    let answer = leaving.get(conn);
    if (!answer) {
      answer = conn.command('prepare-close', {}, 1500).finally(() => leaving.delete(conn));
      leaving.set(conn, answer);
    }
    await answer;
  }
  return true;
}

/** 这个会话的页面回答了 prepare-close（没有在等的：马上） */
export const left = (conn: SessionConnection): Promise<unknown> => leaving.get(conn) ?? Promise.resolve();

const OUTCOMES: Record<string, string> = {
  offline: t('没有连上本地服务：修改暂存在浏览器里，连上后自动保存'),
  busy: t('文件一直在变化（例如 Agent 正在写入），稍后会自动再保存'),
  error: t('自动保存已停止，请查看文档里的提示'),
};

/** 立即保存当前报告还在等的修改（Ctrl+S，导出之前）；没保存成功时提示原因。 */
export async function saveReport(): Promise<boolean> {
  const answer = await command('save', {}, 30000);
  if (answer.ok) return true;
  toast(OUTCOMES[String(answer.outcome ?? answer.reason)] ?? t('没有保存成功，请在文档里查看提示'));
  return false;
}
