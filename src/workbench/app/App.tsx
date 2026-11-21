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

/**
 * 是不是 Chromium 内核的浏览器（Chrome、Edge……）：编辑器只为它们做（contenteditable 的行为各家不同）。
 * gallery open 打开的是系统默认浏览器，可能是 Safari 或 Firefox。
 */
function chromium() {
  const brands = (navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }).userAgentData?.brands;
  if (brands?.length) return brands.some(b => b.brand === 'Chromium');
  return /\b(Chrome|Chromium|Edg)\//.test(navigator.userAgent);
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
    // 不是 Chrome 或 Edge：说一次（可以读，编辑请换浏览器）
    if (!chromium()) toast(t('编辑只支持 Chrome 和 Edge：这个浏览器里可以阅读，要编辑请用 Chrome 或 Edge 打开这个地址'), { duration: 15000 });
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
