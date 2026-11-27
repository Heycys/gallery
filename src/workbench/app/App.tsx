import { startExtensions } from './features/extensions/runtime';
import { refreshStartup } from './features/preferences/startup';
import { ExtensionSettingsHost } from './features/extensions/ExtensionSettings';
import { useEffect } from 'react';
import { DialogHost } from './components/Dialog';
import { PopoverHost } from './components/Popover';
import { toast, ToastHost } from './components/Toast';
import { TooltipHost } from './components/Tooltip';
import { ReportView } from './features/report/ReportView';
import { SearchModal } from './features/search/SearchModal';
import { TransferHost } from './features/transfer/TransferDialogs';
import { ComponentSettingsHost } from './features/preferences/ComponentSettings';
import { WritingPreferencesHost } from './features/preferences/WritingPreferences';
import { PresentationHost } from './features/present/Presentation';
import { HistoryHost } from './features/history/HistoryDialog';
import { Sidebar } from './features/sidebar/Sidebar';
import { Topbar } from './features/topbar/Topbar';
import { useStore } from './lib/store';
import { cls } from './lib/util';
import { isPending } from './session/sessionStore';
import { useGlobalShortcuts } from './shortcuts';
import { sidebarStore } from './state/sidebar';
import { followUpdates } from './state/updates';
import { followWorkspace } from './workspace/live';
import { refreshWorkspace, workspaceStore } from './workspace/store';
import { t } from '../../shared/i18n/index.mjs';

function supportsEditing() {
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  if (brands?.length) return brands.some(b => b.brand === 'Chromium');
  const ua = navigator.userAgent;
  if (/\b(Chrome|Chromium|Edg)\//.test(ua)) return true;
  // iPadOS can request a desktop site and identify itself as a Mac.
  return /Macintosh.*Version\/[\d.]+ Safari\//.test(ua) && navigator.maxTouchPoints < 2;
}

/**
 * 工作台布局：侧栏（报告目录）+ 主区（顶栏 + 报告 iframe）；各种浮层挂在最外层。
 * React 只管工作台；报告正文由 iframe 里报告页自己的编辑器管理。
 */
export function App() {
  const sb = useStore(sidebarStore);
  const sandbox = useStore(workspaceStore, state => state.sandbox);
  const collapsed = sb.mobile || !sb.expanded;
  useGlobalShortcuts();

  useEffect(() => {
    void refreshWorkspace();
    void refreshStartup().catch(error => toast(error.message, { tone: 'error' }));
    void startExtensions().catch(error => toast(error.message, { tone: 'error' }));
    if (!supportsEditing()) toast(t('这个浏览器里可以阅读。要编辑，请用桌面版 Chrome、Edge 或 macOS 上的 Safari 打开这个地址。'), { duration: 15000 });
    // 回到这个标签页时重新读取报告列表（Agent 可能新建或修改了报告）
    let last = 0;
    const onVisible = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 2000) return;
      last = Date.now();
      void refreshWorkspace();
      void refreshStartup().catch(() => {});
    };
    // 关闭 / 刷新工作台时，当前报告还有修改在等保存就提示（它们也在浏览器的崩溃缓冲里）
    const onBeforeUnload = (e: BeforeUnloadEvent) => { if (isPending()) e.preventDefault(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('beforeunload', onBeforeUnload);
    // 工作台之外的改动（Agent 的 gallery 命令、别的标签页）：服务器说了就重新读，不用重新载入
    const unfollow = followWorkspace();
    // 别人（Agent）改了别的页面：侧栏里它那一行的蓝点，底部一句提示（state/updates.ts）
    const unfollowUpdates = followUpdates();
    return () => {
      unfollow();
      unfollowUpdates();
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  return (
    <>
      <div className={cls('app', collapsed && 'sb-collapsed', !sb.mobile && !sb.expanded && 'peekable')}>
        <Sidebar />
        <main className="main">
          {sandbox && <div className="sandbox-banner" title={sandbox}>{t('沙盒')}</div>}
          <Topbar />
          <ReportView />
        </main>
      </div>
      <PopoverHost />
      <SearchModal />
      <TransferHost />
      <WritingPreferencesHost />
      <ComponentSettingsHost />
      <ExtensionSettingsHost />
      <PresentationHost />
      <HistoryHost />
      <DialogHost />
      <TooltipHost />
      <ToastHost />
    </>
  );
}
