import { useEffect, useMemo, useState } from 'react';
import { Icon } from '../../components/Icon';
import { useStore } from '../../lib/store';
import { cls } from '../../lib/util';
import * as api from '../../workspace/api';
import { openInBrowser } from '../../workspace/commands';
import { reportTitle, workspaceStore } from '../../workspace/store';
import { extensionKey } from '../../../../shared/extension-sidebar.mjs';
import { WEB_SANDBOX, ownAddress as isOwn } from '../../../../shared/web-links.mjs';
import type { ExtensionEntry, Report } from '../../workspace/types';
import './link.css';
import { t } from '../../../../shared/i18n/index.mjs';

/**
 * 网页链接在内容区里显示（docs/workbench.md「Web links」）：不建文档的会话，一个网页一个 iframe，沙箱和「嵌入」块的网页一样
 * （shared/web-links.mjs WEB_SANDBOX：网页有它自己的来源，读不到工作台和写入令牌），referrerpolicy strict-origin-when-cross-origin，可以全屏。
 * 打开之前先问服务器它让不让别的页面嵌入（frameable，服务器记一小时），最多等 1.5 秒，等不到就照常载入（问不到的当作可以）；
 * 不让的不建 iframe，显示一张卡片：这个网站不允许在别的页面里显示、网址、在浏览器中打开。Gallery 自己的地址（同一个主机和端口）也是这张卡片。
 * 最近打开的 3 个网页切走后藏在后台（display: none，iframe 还在），切回来不重新加载，登录状态、滚动位置都在；
 * 它们在 DOM 里的顺序从不调换（挪动 iframe 会让它重新加载），超过 3 个时去掉最久没看的那个。改了网址的、移到回收区的，跟着换掉、去掉。
 * 拖动侧栏条目、调侧栏宽度时 iframe 不接收鼠标（report.css：body.dragging iframe）
 * 扩展提供的条目（有网址的，docs/workbench.md「Extension columns」）也在这里显示，键是 ~<扩展 id>/<条目 id>，和网页链接一样的规矩；
 * 扩展的文件暂时读不出来时，它已经打开的几个网页留着（文件好了或条目被移除再说）。
 */
const KEPT = 3;
const WAIT = 1500;

interface Kept { slug: string; url: string; used: number }
interface Page { url: string; title: string }

/** 显示得出来的网页：每个网页链接（键是它的 slug）和扩展里每个有网址的条目（键是 ~<扩展 id>/<条目 id>） */
function pagesOf(reports: Record<string, Report>, extensions: { id: string; error?: unknown; entries: ExtensionEntry[] }[]) {
  const pages: Record<string, Page> = {};
  for (const [slug, report] of Object.entries(reports)) if (report.kind === 'link') pages[slug] = { url: report.url ?? '', title: reportTitle(report) };
  const walk = (extension: string, list: ExtensionEntry[]) => {
    for (const entry of list) {
      if (entry.url) pages[extensionKey(extension, entry.id)] = { url: entry.url, title: entry.title };
      walk(extension, entry.children ?? []);
    }
  };
  for (const extension of extensions) walk(extension.id, extension.entries);
  return pages;
}

export function LinkFrames({ current }: { current: string | null }) {
  const reports = useStore(workspaceStore, ws => ws.reports);
  const extensions = useStore(workspaceStore, ws => ws.extensions);
  const pages = useMemo(() => pagesOf(reports, extensions), [reports, extensions]);
  const unreadable = useMemo(() => extensions.filter(extension => extension.error).map(extension => `~${extension.id}/`), [extensions]);
  const [kept, setKept] = useState<Kept[]>([]);

  useEffect(() => {
    setKept(list => {
      // 不在了的（移到回收区、被扩展移除）、不再是网页的去掉（扩展暂时读不出来的留着）；网址变了的换成新的（它会重新载入）
      let next = list.filter(entry => pages[entry.slug] || unreadable.some(prefix => entry.slug.startsWith(prefix))).map(entry => (!pages[entry.slug] || pages[entry.slug].url === entry.url ? entry : { ...entry, url: pages[entry.slug].url }));
      const url = current ? pages[current]?.url : undefined;
      if (current && url) {
        const at = next.findIndex(entry => entry.slug === current);
        if (at >= 0) next = next.map(entry => (entry.slug === current ? { ...entry, used: Date.now() } : entry));
        else next = [...next, { slug: current, url, used: Date.now() }];
        while (next.length > KEPT) {
          const oldest = next.reduce((a, b) => (b.slug !== current && (a.slug === current || b.used < a.used) ? b : a));
          next = next.filter(entry => entry !== oldest);
        }
      }
      return next.length === list.length && next.every((entry, i) => entry === list[i]) ? list : next;
    });
  }, [current, pages, unreadable]);

  return (
    <div className={cls('link-view', !current && 'off')}>
      {kept.map(entry => (
        <LinkPane key={`${entry.slug} ${entry.url}`} slug={entry.slug} url={entry.url} title={pages[entry.slug]?.title ?? entry.slug} shown={entry.slug === current} />
      ))}
    </div>
  );
}

/** 一个网页：先问能不能嵌入，能就是 iframe，不能就是卡片 */
function LinkPane({ slug, url, title, shown }: { slug: string; url: string; title: string; shown: boolean }) {
  const [state, setState] = useState<{ show: 'wait' | 'frame' | 'refused'; reason?: string }>(() => (ownAddress(url) ? { show: 'refused', reason: 'own' } : { show: 'wait' }));

  useEffect(() => {
    if (ownAddress(url)) return;
    let live = true;
    const timer = window.setTimeout(() => { if (live) setState(now => (now.show === 'wait' ? { show: 'frame' } : now)); }, WAIT);
    api.frameable(url).then(
      ({ frameable, reason }) => { if (live) setState(frameable ? (now => (now.show === 'wait' ? { show: 'frame' } : now)) : { show: 'refused', reason }); },
      () => { if (live) setState(now => (now.show === 'wait' ? { show: 'frame' } : now)); },
    ).finally(() => clearTimeout(timer));
    return () => { live = false; clearTimeout(timer); };
  }, [url]);

  return (
    <div className={cls('link-pane', !shown && 'off')} data-link={slug} data-show={state.show}>
      {state.show === 'frame' && (
        <iframe
          className="link-frame"
          src={url}
          title={title}
          sandbox={WEB_SANDBOX}
          referrerPolicy="strict-origin-when-cross-origin"
          allow="fullscreen"
          allowFullScreen
        />
      )}
      {state.show === 'refused' && (
        <div className="report-state link-refused">
          <span className="link-refused-icon"><Icon name="web" /></span>
          <h2>{state.reason === 'own' ? t('这是 Gallery 自己的地址，请直接链接文档') : t('这个网站不允许在别的页面里显示')}</h2>
          <p className="link-refused-url">{url}</p>
          <div className="report-state-actions">
            <button className="dialog-btn primary" onClick={() => openInBrowser(url)}><Icon name="external" /><span>{t('在浏览器中打开')}</span></button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 这个网址是不是工作台自己的（同一个主机和端口，127.0.0.1、localhost 都算）：嵌进来就是同源的工作台页面，不显示 */
const ownAddress = (url: string) => isOwn(url, location.port || (location.protocol === 'https:' ? '443' : '80'));
