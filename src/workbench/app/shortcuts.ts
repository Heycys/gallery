import { useEffect } from 'react';
import { closeTopLayer } from './lib/layers';
import { saveReport } from './session/guard';
import { can, sessionStore } from './session/sessionStore';
import { toggleSidebar } from './state/sidebar';
import { toggleSearch } from './features/search/SearchModal';
import { pressAnnotate } from './features/annotate/annotate';

/**
 * 工作台的全局快捷键（焦点在工作台时）：
 * - Ctrl/⌘ + \  收起 / 展开侧栏
 * - Ctrl/⌘ + K  搜索报告
 * - Ctrl/⌘ + S  立即保存当前报告还在等的修改（报告页本来就会自动保存）
 * - Ctrl/⌘ + Alt + M  打开或关上批注列表，等于点一下批注按钮（打开着的报告能批注时；焦点在报告页里、有东西可批注时报告页自己用它）
 * - Esc         关闭最上层浮层
 * 焦点在报告 iframe 里时，按键归报告页；Ctrl+\ 和 Ctrl+K 由报告页按会话协议转回来（见 ReportView 的 KEYS）。
 */
export function useGlobalShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (mod && (e.key === '\\' || e.code === 'Backslash')) { e.preventDefault(); toggleSidebar(); return; }
      if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); toggleSearch(); return; }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (can('save', sessionStore.get())) void saveReport();
        return;
      }
      if (mod && e.altKey && !e.shiftKey && e.code === 'KeyM') {
        if (can('annotate', sessionStore.get())) { e.preventDefault(); pressAnnotate(); }
        return;
      }
      if (e.key === 'Escape' && closeTopLayer()) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
