import { projectItem } from "../../../../shared/workspace-address.mjs";
import { goBackTo, placeIn } from "../../../../shared/reading-place.mjs";
import { keepLeft, leaveShown, shownBefore, shownByVite } from "../../../../shared/kept-view.mjs";
import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { hideToast, setToastRoom, toast } from '../../components/Toast';
import { useStore } from '../../lib/store';
import { cls } from '../../lib/util';
import { connectFrame, type SessionConnection } from '../../session/connection';
import { left } from '../../session/guard';
import { attachSession, attachedConnection, can, detachSession, sessionStore } from '../../session/sessionStore';
import { extensionEntry, extensionUnreadable, navStore, openDraftPlace, openPage, pageKey, stepWithin } from '../../state/navigation';
import { caretIn, leftPage, recall, type LeftView } from '../../state/recall';
import { toggleSidebar } from '../../state/sidebar';
import { setExpandedKey } from '../../state/tree';
import { isDarkState, themeStore } from '../../state/theme';
import { createReport } from '../../workspace/commands';
import { pageOf, pageTitle, refreshWorkspace, reportTitle, workspaceStore } from '../../workspace/store';
import { openSearch } from '../search/SearchModal';
import { offerAnnotations, pressAnnotate } from '../annotate/annotate';
import { askNetConsent } from '../preferences/netConsent';
import { watchCards } from './cards';
import { LinkFrames } from '../link/LinkView';
import './report.css';
import { t } from '../../../../shared/i18n/index.mjs';

/**
 * 报告区：报告页是一个完整的 HTML 文档，放在 iframe 里（文档隔离；普通同源 iframe 不承担安全隔离）。
 * 报告内部的块菜单、选区、格式条都留在报告页里，工作台只通过会话协议交换少量状态。
 * 自定义页也在这里显示，和文档一样换页、重新显示（src/editor/page/custom-page.mjs 是它那一边的会话）：
 * 下面按“页面的键”管 iframe，文档是它的 slug，自定义页是 @<slug>（会话里它也这样称呼自己）。
 * 别处的底稿（~ws-xxxxxx/<slug>）的页面由它自己工作区的服务给出（另一个源）：当前服务找到或启动那个服务、担保它的源（POST elsewhere），
 */

/** 报告页的地址（预览页，带页内编辑器）；自定义页（@<slug>）是 /pages/<slug> */
export const previewUrl = (key: string) => {
  const page = key.startsWith('@'), name = page ? key.slice(1) : key, owner = projectItem(name);
  return (owner?.base ?? '') + (page ? `/pages/${encodeURIComponent(owner?.slug ?? name)}` : `/generated/${encodeURIComponent(owner?.slug ?? name)}.html`);
};
/** 是不是自定义页的键 */
const isPageKey = (key: string) => key.startsWith('@');

/**
 * 焦点在报告里时，请报告页转给工作台的快捷键（报告页自己用到的，比如正文里的 Ctrl+K，不转）。
 * 批注键和焦点在工作台时一样（shortcuts.ts）：页面能批注才算数，自定义页没有批注，按了什么也不说
 */
const KEYS: Record<string, () => void> = {
  'Mod+\\': toggleSidebar,
  'Mod+K': openSearch,
  'Mod+Alt+M': () => { if (can('annotate', sessionStore.get())) pressAnnotate(); },
};

export function ReportView() {
  const ws = useStore(workspaceStore);
  const { current } = useStore(navStore);

  // 读文档列表：只要几十毫秒，0.3 秒还没好才淡出这句（base.css .wait），平常每次重新载入都不闪一下
  if (ws.status === 'loading') return <div className="report-state wait"><p className="muted">{t('正在读取文档…')}</p></div>;
  if (ws.status === 'offline') {
    return (
      <div className="report-state">
        <h2>{t('没有连上本地服务')}</h2>
        <p>{ws.message}</p>
        <div className="report-state-actions">
          <button className="dialog-btn primary" onClick={() => void refreshWorkspace()}><Icon name="restore" /><span>{t('重试')}</span></button>
        </div>
      </div>
    );
  }
  const page = current?.kind === 'page' ? pageOf(current.slug, ws) : undefined;
  const link = current?.kind === 'link' && ws.reports[current.slug]?.kind === 'link' ? ws.reports[current.slug] : undefined;
  // 扩展提供的条目（有网址的）也是网页，和链接一样在 LinkFrames 里；它的扩展暂时读不出文件时，打开着的网页照旧留着
  const extension = current?.kind === 'extension' && (extensionEntry(current.slug, ws)?.entry.url || extensionUnreadable(current.slug, ws)) ? current.slug : undefined;
  if (!current || (current.kind === 'document' ? !ws.reports[current.slug] : current.kind === 'page' ? !page : current.kind === 'extension' ? !extension : !link)) {
    // 工作区里一份文档也没有（新建的工作区把首页也移进了回收区，或者文档都删了）：告诉人怎么开始；
    // 有文档、只是打开着的那份不在了时，还是原来那几句
    if (!Object.values(ws.reports).some(entry => entry.kind !== 'link')) return <EmptyWorkspace />;
    return (
      <div className="report-state">
        <h2>{t('还没有文档')}</h2>
        <p>{t('新建一份文档，或让 Agent 生成一份。')}</p>
        <div className="report-state-actions">
          <button className="dialog-btn primary" onClick={() => void createReport()}><Icon name="plus" /><span>{t('新建文档')}</span></button>
        </div>
      </div>
    );
  }
  // 换报告不换 ReportFrame（它在原位置载入另一份，画好了才换上）；自定义页也一样。打开的是网页链接时它什么也不显示
  // （显示着的页面回答了 prepare-close 才移除），网页在 LinkFrames 里（最近的几个留在后台，切回来不重新加载）
  const key = current.kind === 'page' ? pageKey(current.slug) : current.kind === 'document' ? current.slug : null;
  const title = current.kind === 'page' ? pageTitle(page) : current.kind === 'extension' ? extensionEntry(current.slug, ws)?.entry.title ?? '' : reportTitle(ws.reports[current.slug]);
  return (
    <>
      <ReportFrame slug={key} title={title} />
      <LinkFrames current={link || extension ? current.slug : null} />
    </>
  );
}

/**
 * 空工作区（2026-11-17 定的）：和空白的自定义页同一种样子（editor/page/board/hint.mjs showBlank：左对齐的淡灰框，520 宽，
 * 离顶上约 18% 窗口高）：标题、一句怎么开始、「跟 Agent 说，比如：」、一句可以复制给 Agent 的话（写着 Gallery，Agent 才会用上 skill）带「复制」，
 * 最后是淡蓝的「新建文档」。复制之后按钮变成「已复制」，提示条说「已复制这句话，发给 Agent 就行」（和自定义页的那一句一样）
 */
function EmptyWorkspace() {
  const [copied, setCopied] = useState(false);
  const ask = t('用 Gallery 写一份周报：这周做了什么，下周打算做什么。');
  const copy = () => {
    navigator.clipboard?.writeText(ask).then(() => {
      setCopied(true);
      toast(t('已复制这句话，发给 Agent 就行'));
    }, () => toast(t('没能复制：浏览器不允许写剪贴板。'), { tone: 'error' }));
  };
  return (
    <div className="report-state report-empty">
      <div className="report-blank" role="note" aria-label={t('还没有文档')}>
        <p className="report-blank-title">{t('还没有文档')}</p>
        <p>{t('新建一份自己写，或者让 Agent 来写。')}</p>
        <p className="report-blank-ask">{t('跟 Agent 说，比如：')}</p>
        <div className="report-blank-say">
          <span>{ask}</span>
          <button type="button" className="report-blank-copy" onClick={copy}>{copied ? t('已复制') : t('复制')}</button>
        </div>
        <div className="report-state-actions">
          <button className="dialog-btn primary" onClick={() => void createReport()}>{t('新建文档')}</button>
        </div>
      </div>
    </div>
  );
}

/** 换上的新页面最多等它这么久（毫秒）：一直没准备好也换上，不让读者停在旧页面上（写作偏好的对话框也用它） */
export const SWAP_TIMEOUT = 15000;

/** 等 iframe 里的页面再画两帧（主题、滚动位置都已经画出来）；另一个源的页面（别处的底稿）等工作台自己的两帧 */
export const painted = (frame: HTMLIFrameElement) => new Promise<void>(resolve => {
  const view = frame.contentWindow;
  const timer = window.setTimeout(resolve, 300);
  if (!view) { resolve(); return; }
  const done = () => { clearTimeout(timer); resolve(); };
  try {
    view.requestAnimationFrame(() => view.requestAnimationFrame(done));
  } catch {
    requestAnimationFrame(() => requestAnimationFrame(done));
  }
});

/**
 * 别处的底稿所在工作区的服务的源：当前服务找到它，或在后台启动它（POST elsewhere，担保过的）。一秒还没好时说正在启动；
 * 没能打开时说原因，返回 null
 */

/**
 * 后台载入的另一份报告能不能换上了：套件已经把它显示出来（data-doc-ready：直接打开它时读者也是这时
 * 才看到它，在这之前套件压着首帧，styles/base.css），或者它不是套件压着首帧的页面（服务器的出错页），已经载入完。
 * 还是 iframe 起初的空白文档（about:blank）时不算。
 */
function drawn(frame: HTMLIFrameElement) {
  try {
    const doc = frame.contentDocument;
    if (!doc || doc.URL === 'about:blank' || !doc.documentElement) return false;
    return doc.documentElement.hasAttribute('data-doc-ready') || (doc.readyState === 'complete' && !doc.querySelector('body > .doc-page'));
  } catch { return true; } // 读不到（不同源）：直接换上
}

/**
 * 后台载入的另一份报告一画出来（drawn）就调 go，返回停止盯着的函数。套件标上 data-doc-ready 是在页面的一帧里
 * （ui.js 的 requestAnimationFrame），MutationObserver 在同一帧里就听到，这时换上，读者看到它和直接打开时是同一帧，
 * 不必再等两帧（painted）；每帧看一次 iframe 里是不是已经换成真正的文档（换了就盯着它的根元素，页面自己重新载入
 * 也跟过去），出错页也是这样看到它载入完。写作偏好的对话框载入它的页面时也这样等。
 */
export function watchDrawn(frame: HTMLIFrameElement, go: () => void): () => void {
  let watched: Element | null = null;
  let tick = 0;
  const check = () => {
    if (!drawn(frame)) return false;
    stop();
    go();
    return true;
  };
  const observer = new MutationObserver(check);
  const look = () => {
    if (check()) return;
    try {
      const doc = frame.contentDocument;
      if (doc && doc.URL !== 'about:blank' && doc.documentElement && doc.documentElement !== watched) {
        watched = doc.documentElement;
        observer.observe(watched, { attributes: true, attributeFilter: ['data-doc-ready'] });
      }
    } catch { /* 不同源：drawn 已经算画好了 */ }
    tick = requestAnimationFrame(look);
  };
  function stop() {
    cancelAnimationFrame(tick);
    observer.disconnect();
  }
  tick = requestAnimationFrame(look);
  return stop;
}

/** 工作台这一次载入是怎么来的（PerformanceNavigationTiming 的 type：navigate、reload、back_forward），读不到时空 */
const navigationType = () => {
  try { return (performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined)?.type ?? ''; } catch { return ''; }
};
/** 这个工作台文档自己的记号：报告区在同一个文档里重新建起来（kept-view.mjs shownBefore） */
const DOC = (() => { try { return performance.timeOrigin; } catch { return 0; } })();
/**
 * 工作台这一次离开是 Vite 要重新载入它（开发时：源文件变了，或者开发服务断了、回来以后），不是读者按 F5：
 * 读者自己的刷新什么都不留，页面从开头开始（用户 2026-11-20），Gallery 自己的重新载入回到原处（kept-view.mjs shownBefore）。
 * - 连接断了（开发服务停了）：它连上以后一定重新载入。读者按 F5 时连接也断（在 beforeunload 之后），那一次不算，和 Vite 自己一样（它的
 *   willUnload）；报告区已经拆掉（连不上服务时）的话，它记下的那一页也改成 Vite 要重新载入（shownByVite）。
 * - 它说要整页重新载入（vite:beforeFullReload）：改的是别的 HTML 文件（工作区里的文档）时它也这样说、却不载入这一页，所以照它
 *   自己的判断（vite/dist/client/client.mjs 的 full-reload：改的不是 HTML，或者就是这一页的 HTML）才算。
 */
let viteLost = false;
let viteFull = false;
const viteReloads = () => viteLost || viteFull;
if (import.meta.hot) {
  let unloading = false;
  addEventListener('beforeunload', () => { unloading = true; });
  import.meta.hot.on('vite:beforeFullReload', (payload: { path?: string }) => {
    const path = payload?.path;
    const page = decodeURI(location.pathname);
    const changed = path ? import.meta.env.BASE_URL + path.slice(1) : '';
    if (!path || !path.endsWith('.html') || path === '/index.html' || page === changed || (page.endsWith('/') && `${page}index.html` === changed)) viteFull = true;
  });
  import.meta.hot.on('vite:ws:disconnect', () => {
    if (unloading) return;
    viteLost = true;
    shownByVite();
  });
}

interface Page {
  slug: string; frame: HTMLIFrameElement; conn: SessionConnection;
  /** 请重新显示时滚到的位置（again） */ asked?: { x: number; y: number };
  /** 交给它的读者上次离开它的地方（recall.ts），换上之前放到那里 */ view?: LeftView | null;
}

/**
 * 读者在这一页的哪里（离开它时记下，recall.ts）：编辑页自己说（__galleryViewNow：viewNow，带光标；还没回到交给它的地方时是那个地方），
 * 自定义页和还没开始的编辑页按窗口顶上的元素（placeIn）；还藏着、没放好的页面是交给它的那个地方；读不到（另一个源、空白页）时 null
 */
function viewOf(page: Page): unknown {
  try {
    if (page.view && page.frame.hasAttribute('data-pending')) return page.view;
    const win = page.frame.contentWindow as (Window & { __galleryViewNow?: () => unknown }) | null;
    if (!win || win.document.URL === 'about:blank') return null;
    return win.__galleryViewNow?.() ?? { ...(page.view ?? {}), ...placeIn(win) };
  } catch {
    return null;
  }
}

/** 换上一个回到读者离开时那里的页面：放到那里（窗口顶上的元素，reading-place.mjs goBackTo），在它被看到之前 */
function placeAt(frame: HTMLIFrameElement, view: LeftView) {
  try {
    const win = frame.contentWindow;
    if (win && win.document.URL !== 'about:blank') goBackTo(win, view);
  } catch { /* 读不到：页面自己放（kept-view.mjs handedView） */ }
}

/** 焦点空着（在空白处、侧栏和顶栏的按钮上，或在报告区）：读者回到一页时光标可以回去，不从对话框、菜单、输入框里抢走 */
function focusFree() {
  const held = document.activeElement;
  if (!held || held === document.body || held.localName === 'iframe') return true;
  if (held.closest('dialog, [role="dialog"], [aria-modal="true"], [role="menu"]')) return false;
  return !held.matches('input, textarea, select, [contenteditable]:not([contenteditable="false"])');
}
interface Next extends Page { timer: number; stop: () => void; hadFocus: boolean; /** 报告区顶上等的时候的细线（.report-loading） */ line: HTMLElement }

/**
 * 报告页的 iframe 由这里直接管理，不经 React（ReportFrame 一挂上就建一个，卸下时全部移除）。显示着的页面之外，
 * 最多还有一个在后台载入（data-pending：叠在原位置、一样大、看不见），两种情况：
 * - 文件被别人改了、报告页请工作台重新显示（会话的 reload）：后台载入同一份，等它连上、拿到主题、滚动位置和
 *   光标都恢复、画出来以后，一下子换上，旧的移除；读者看不到刷新。旧页面在这期间不能操作（inert），它已经不再保存；
 *   但滚轮照样滚它（工作台把滚轮转给它），换上之前把它滚到的位置（窗口顶上的元素）交给新页面（会话的 place），
 *   读者在载入的这一两秒里滚动不会白滚（用户 2026-11-12：Agent 写入时页面滚不动）。
 * - 换到另一份报告（show）：点下去就开始载入新的，旧页面同时保存还在等的修改（navigation.ts 的 openReport
 *   先发 prepare-close，不等回答）。旧页面马上不能操作（inert），会话、标题、批注都还是它的；
 *   新页面画出来（drawn）、旧页面回答了 prepare-close（guard.ts left），才换上新的、移除旧的，会话随之换过去。
 *   服务器生成新页面和旧页面保存同时进行，读者也不再看到中间的空白页。还没换上又点了别的，后台那个换成新点的；
 *   点回显示着的那份，后台那个丢掉，旧页面恢复可以操作（它在换走期间请过重新显示的，这时再载入）。
 * iframe 都在 show 之后的一个微任务里才建：开发时 React 的 StrictMode 把刚挂上的效果先撤掉再跑一遍，
 * 撤掉（dispose）时还没建，就不会先发一个马上取消的请求，让服务器白白生成一遍页面、真正的请求排在它后面。
 * 工作台自己把显示着的那一页重新显示（读者没有要）：开发时 Vite 的整页刷新（开发服务重启后连上时也是），
 * 或者报告区被拆掉又建起来（连不上服务又连上、开发时的热更新）。这时第一个页面是离开时显示着的那一页的话，
 * 读者在那一页离开时的位置（页面 pagehide 时记下的，kept-view.mjs leaveView）交给它（keepLeft），
 * 它也像重新显示同一份那样在后台载入、恢复了位置、画好再显示（data-pending，onReady 里 reveal），读者看不到它从顶上跳下去。
 * 读者自己按 F5 不算：从开头开始（用户 2026-11-20）。
 * 换到别的页面时，读者在显示着的那一页的哪里记在 recall.ts（打开的一换就读，unsubNav 那里）；回到一页、离开它不到 RECALL_FOR 时，
 * 新页面带着那个地方载入（iframe 的 data-view，页面自己取：光标、详情卡片、画完以后再放一次），换上之前工作台先把它放好（placeAt），
 * 第一帧就在那里；有光标、焦点又空着（focusFree）时焦点给它，光标随之回去（编辑页的 restoreView，不滚动）。
 */
function createFrames(view: HTMLDivElement) {
  const theme = () => (isDarkState(themeStore.get()) ? 'dark' : 'light');
  let shown: Page | null = null;
  let next: Next | null = null;
  /** 显示着的页面请过重新显示（它已经停下，不再保存）：换走它期间不理，回到它时再载入 */
  let asked = false;
  /** show 要的报告，下一个微任务里照办 */
  let wanted: string | null = null;
  let disposed = false;
  /** 页面最近一次放上的提示条的编号：它说收起时只收这一条 */
  let pageNotice = 0;
  /** 还没显示过第一个页面（它看工作台是不是在重新显示离开时的那一页） */
  let first = true;
  /** 重新显示的第一个页面最多等它这么久就显示 */
  let revealTimer = 0;
  /** 每个页面说过的底部面板占到离框底多高：显示着的那个的，加上框底到窗口底的距离，是提示条要让开的 */
  const rooms = new WeakMap<HTMLIFrameElement, number>();
  const placeToast = () => {
    const frame = shown?.frame;
    const room = frame ? rooms.get(frame) ?? 0 : 0;
    setToastRoom(room && frame ? Math.round(room + window.innerHeight - frame.getBoundingClientRect().bottom) : 0);
  };
  const roomOf = (frame: HTMLIFrameElement, room: number | undefined) => {
    if (typeof room !== 'number') return;
    rooms.set(frame, room);
    if (shown?.frame === frame) placeToast();
  };

  /** 别处的底稿的 iframe 载入它的那个源（会话只认它） */
  const makeFrame = (slug: string, hidden: boolean, title: string, left: LeftView | null = null) => {
    const frame = document.createElement('iframe');
    frame.className = 'report-frame';
    frame.title = title;
    if (hidden) frame.setAttribute('data-pending', '');
    if (left) frame.setAttribute('data-view', JSON.stringify(left)); // 页面开始时取走（kept-view.mjs handedView）
    const draft = projectItem(isPageKey(slug) ? slug.slice(1) : slug);
    if (draft) {
      frame.dataset.draft = draft.ws;
      frame.src = previewUrl(slug);
    } else frame.src = previewUrl(slug);
    view.append(frame);
    return frame;
  };

  const connect = (slug: string, frame: HTMLIFrameElement): SessionConnection => {
    const draft = projectItem(isPageKey(slug) ? slug.slice(1) : slug);
    return connectFrame(frame, {
    slug,
    ...(draft ? { pageSlug: isPageKey(slug) ? '@' + draft.slug : draft.slug } : {}),
    onReady: command => {
      // 主题、转回来的快捷键都告诉了，批注读好、标记画好了，才换上（自定义页没有批注）
      const told = Promise.all([command('theme', { theme: theme() }), command('keys', { keys: Object.keys(KEYS) }), ...(isPageKey(slug) ? [] : [command('annotate')])]);
      const pending = next;
      if (pending?.frame === frame) void told.then(() => painted(frame)).then(() => swapWhenLeft(pending));
      else if (shown?.frame === frame && frame.hasAttribute('data-pending')) void told.then(() => painted(frame)).then(() => reveal(frame));
    },
    onKey: key => KEYS[key]?.(),
    // 报告页的提示（已保存、合并、冲突、离线……）用工作台的提示条，站在页面底部的面板上面
    // 收起时只收它自己的那一条（工作台自己的提示，例如别的页面刚被 Agent 更新，不跟着收）
    onNotice: ({ text, tone, hold, room }) => {
      roomOf(frame, room);
      if (text) pageNotice = toast(text, { tone, duration: hold }); else hideToast(pageNotice);
    },
    onNoticeRoom: room => roomOf(frame, room),
    onReload: () => reload(frame),
    // 别处的底稿里的链接说的是它自己工作区里的文档
    onOpen: place => void (draft ? openDraftPlace(isPageKey(slug) ? slug.slice(1) : slug, place) : openPage(place)),
    onJump: (block, place) => stepWithin(slug, block, place),
    onWorkspace: () => { void refreshWorkspace(); setExpandedKey(slug, true); },
    // 批注的撤销交给条目 slug（别处的底稿的，转给它所在工作区的服务放回）；联网的同意写进这个工作区的 gallery.json，
    // 别处的底稿的块在它自己的工作台里允许
    onAnnotationsRemoved: items => offerAnnotations(slug, items),
    // 卡片上的「允许访问」：组件列表里的同一个同意框；允许了，页面从事件流听到，块自己重新取
    onConsent: block => { void askNetConsent(block); },
    });
  };

  /** 回到读者上次离开的地方的页面换上了：光标在那一页里、焦点又空着时，焦点给它（页面放回光标，不滚动） */
  const focusBack = (frame: HTMLIFrameElement, left: LeftView | null | undefined) => {
    if (!caretIn(left) || !focusFree()) return;
    frame.removeAttribute('data-no-focus');
    frame.focus({ preventScroll: true });
  };
  /** 第一个页面等它画出来（回到读者离开时那里的，watchDrawn）的那个盯着的函数 */
  let revealWatch = () => {};
  /** 后台载入的第一个页面（工作台重新显示的那一页，或回到读者离开它时那里的）：恢复了位置、画好了，显示出来 */
  const reveal = (frame: HTMLIFrameElement) => {
    if (shown?.frame !== frame || !frame.hasAttribute('data-pending')) return;
    clearTimeout(revealTimer);
    revealWatch();
    if (shown.view) placeAt(frame, shown.view);
    frame.removeAttribute('data-pending');
    placeToast();
    focusBack(frame, shown.view);
  };
  // 工作台离开时记下显示着的是哪一页（Vite 重新载入它以后的第一个页面看它）
  const leaving = () => leaveShown(shown?.slug ?? null, DOC, viteReloads());
  window.addEventListener('pagehide', leaving);

  const drop = (pending: Next) => {
    clearTimeout(pending.timer);
    pending.stop();
    pending.conn.dispose();
    pending.frame.remove();
    pending.line.remove();
  };

  /**
   * 后台载入一个页面：同一份（重新显示）等它连上、恢复了读者的位置、画好再换上（onReady）；另一份一画出来就换上
   * （watchDrawn），不等它的编辑器开始，和直接打开它时读者看到它的时刻一样，会话在它 ready 时连上。
   * 等的时候报告区顶上有一条细线（写作偏好的对话框的那一条，.pref-loading）：0.3 秒还没换上才出来，快的时候什么也看不到；换上、丢掉时拿走
   */
  function load(slug: string, hadFocus: boolean, title: string, left: LeftView | null = null): Next {
    const frame = makeFrame(slug, true, title, left);
    if (!hadFocus) frame.setAttribute('data-no-focus', ''); // 焦点在别处（对话框、输入框）：它恢复光标时不把焦点抢过去
    const line = document.createElement('div');
    line.className = 'pref-loading report-loading';
    line.setAttribute('role', 'progressbar');
    line.setAttribute('aria-label', t('正在读取文档…'));
    view.append(line);
    const pending: Next = { slug, frame, conn: connect(slug, frame), hadFocus, stop: () => {}, timer: 0, line, view: left };
    pending.timer = window.setTimeout(() => void swapWhenLeft(pending), SWAP_TIMEOUT);
    if (slug !== shown?.slug) pending.stop = watchDrawn(frame, () => void swapWhenLeft(pending));
    return pending;
  }

  // 要移除的旧页面先回答了 prepare-close（还在等的修改存好了，最多 1.5 秒），再换上；同一份重新显示时，
  // 读者在这期间滚过旧页面（滚轮转给了它）的话，新页面先放到旧页面窗口顶上的那个元素（最多等 0.5 秒）
  async function swapWhenLeft(pending: Next) {
    if (next !== pending) return;
    if (shown) await left(shown.conn);
    if (next !== pending) return;
    const place = shown?.slug === pending.slug ? scrolledSince(shown) : null;
    if (place) await pending.conn.command('place', { place }, 500).catch(() => null);
    if (next === pending) swap();
  }

  /** 旧页面请重新显示以后又滚过的话，它现在的位置（reading-place.mjs placeIn）；没滚过：null */
  function scrolledSince(page: Page) {
    try {
      const win = page.frame.contentWindow;
      if (!win || !page.asked || (Math.round(win.scrollX) === page.asked.x && Math.round(win.scrollY) === page.asked.y)) return null;
      return placeIn(win);
    } catch {
      return null;
    }
  }

  // 同一份在后台重新载入时旧页面是 inert 的，滚轮落到它下面的报告区：转给它，照常滚动（Ctrl+滚轮是缩放，不管）
  const forwardWheel = (event: WheelEvent) => {
    const page = shown;
    if (!page?.frame.inert || !page.asked || next?.slug !== page.slug || event.ctrlKey) return;
    const win = page.frame.contentWindow;
    if (!win) return;
    const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? win.innerHeight : 1;
    win.scrollBy(event.deltaX * unit, event.deltaY * unit);
    event.preventDefault();
  };
  view.addEventListener('wheel', forwardWheel, { passive: false });

  function swap() {
    const { slug, frame, conn, timer, stop, hadFocus, line, view: left } = next!;
    clearTimeout(timer);
    stop();
    line.remove();
    next = null;
    const old = shown;
    if (left) placeAt(frame, left); // 第一帧就在读者离开时那里
    frame.removeAttribute('data-pending');
    shown = { slug, frame, conn, view: left };
    asked = false;
    placeToast(); // 换上的页面说过的面板
    attachSession(slug, conn); // 旧页面的会话随之断开
    // 旧页面马上移除（它在 pagehide 里存崩溃缓冲、试最后一次保存）。试过先藏起来、画出新页面后再移除：
    // 量下来新页面并没有更早出现（差别在误差以内，要存的 prepare-close 已经存过），旧页面却多活一会儿，
    // 占着一条连接（它的 EventSource；同一个地址最多 6 条），新页面的编辑器模块少一条连接下载
    old?.frame.remove();
    if (hadFocus && document.activeElement !== frame) frame.focus();
    else if (!hadFocus) focusBack(frame, left);
  }

  // 显示着的页面请重新显示：后台再载入同一份
  function again() {
    const page = shown!;
    const hadFocus = next ? next.hadFocus : document.activeElement === page.frame;
    if (next) drop(next);
    page.frame.inert = true;
    try {
      const win = page.frame.contentWindow;
      if (win && !page.asked) page.asked = { x: Math.round(win.scrollX), y: Math.round(win.scrollY) };
    } catch { /* 不同源：不转滚轮 */ }
    next = load(page.slug, hadFocus, page.frame.title);
  }

  // 某个页面请工作台重新显示它
  function reload(frame: HTMLIFrameElement) {
    if (disposed) return;
    if (shown?.frame === frame) {
      asked = true;
      if (!next || next.slug === shown.slug) again(); // 正在换到另一份时不理它：它就要移除了
    } else if (next?.frame === frame) {
      // 还在后台载入的那个：再载入一次
      const { slug, hadFocus } = next;
      drop(next);
      next = load(slug, hadFocus, frame.title);
    }
  }

  /**
   * 什么都不显示（打开的是网页链接）：后台在载入的丢掉；显示着的页面马上看不见、不能操作（叠在原位置，data-pending），
   * 等它回答了 prepare-close（navigation.ts 的 goTo 已经发了：还在等的修改存好）再移除，会话随之断开。
   * 这期间又回到一份文档时，那一份重新载入（第一个页面的样子），旧的照样等回答了再移除
   */
  function clear() {
    if (next) { drop(next); next = null; }
    if (!shown) return;
    const old = shown;
    shown = null;
    asked = false;
    old.frame.inert = true;
    old.frame.setAttribute('data-pending', '');
    placeToast();
    void left(old.conn).then(() => {
      if (attachedConnection() === old.conn) detachSession(old.slug);
      else old.conn.dispose();
      old.frame.remove();
    });
  }

  function apply() {
    const slug = wanted!;
    wanted = null;
    if (disposed) return;
    const kept = first && shownBefore(DOC, navigationType()) === slug && keepLeft(slug);
    first = false;
    if (slug === NONE) { clear(); return; }
    if (!shown) {
      // 第一个页面：直接显示，边载入边显示；工作台自己重新显示的那一页在后台载入，回到读者的位置、画好再显示（见上）；
      // 回到读者离开它时那里的（中间显示的是网页链接）也在后台载入，画出来就放好、显示（和换上一样）
      const left = kept ? null : recall(slug);
      const frame = makeFrame(slug, kept || Boolean(left), view.dataset.title ?? '', left);
      if (kept || left) {
        frame.setAttribute('data-no-focus', ''); // 光标等焦点回到页面时再回来
        revealTimer = window.setTimeout(() => reveal(frame), SWAP_TIMEOUT);
      }
      shown = { slug, frame, conn: connect(slug, frame), view: left };
      if (left) revealWatch = watchDrawn(frame, () => reveal(frame));
      attachSession(slug, shown.conn);
      return;
    }
    if (next?.slug === slug) return; // 已经在后台载入它
    if (slug === shown.slug) {
      // 点回显示着的那份：后台的丢掉，它恢复可以操作（换走期间请过重新显示的，现在再载入）
      if (next) { drop(next); next = null; }
      if (asked) again();
      else shown.frame.inert = false;
      return;
    }
    if (next) { drop(next); next = null; }
    shown.frame.inert = true;
    next = load(slug, false, view.dataset.title ?? '', recall(slug));
  }

  // 读者离开显示着的那一页（打开的换成了别的）：在哪里记下（recall.ts）。在打开的一换就读，在 show 之前：打开网页链接时报告区
  // 跟着就藏起来（.off），藏起来的页面读不出它滚到了哪里。后台已经在载入另一份的，读者离开它时记过了
  let opened = keyOf(navStore.get().current);
  const unsubNav = navStore.subscribe(() => {
    const key = keyOf(navStore.get().current);
    if (key === opened) return;
    opened = key;
    if (shown && key !== shown.slug && (!next || next.slug === shown.slug)) leftPage(shown.slug, viewOf(shown));
  });

  const unsubTheme = themeStore.subscribe(() => {
    if (shown) void shown.conn.command('theme', { theme: theme() });
    if (next) void next.conn.command('theme', { theme: theme() });
  });
  // 报告页里开着详情卡片时，工作台的侧栏和顶栏也是它的背景（cards.ts）
  const unwatchCards = watchCards();

  // 报告页上报的标题或页面图标与列表不同（例如保存了新标题、换了图标）时，重新读取报告列表
  let lastSlug: string | null = null;
  let lastTitle: string | null = null;
  let lastIcon: string | null | undefined;
  const unsubTitle = sessionStore.subscribe(() => {
    const s = sessionStore.get();
    if (!shown || s.slug !== shown.slug || isPageKey(s.slug) || !s.connected || s.flags.pending || typeof s.title !== 'string') return;
    if (s.slug !== lastSlug) { lastSlug = s.slug; lastTitle = null; lastIcon = undefined; }
    if (s.title === lastTitle && s.icon === lastIcon) return;
    lastTitle = s.title;
    lastIcon = s.icon;
    const listed = workspaceStore.get().reports[s.slug];
    if ((s.title || t('未命名文档')) !== reportTitle(listed) || (s.icon !== undefined && (s.icon ?? undefined) !== listed?.icon)) void refreshWorkspace();
  });

  return {
    /** 显示这份报告（下一个微任务里办，见上）；null：什么都不显示（clear） */
    show(slug: string | null) {
      if (wanted === null) queueMicrotask(apply);
      wanted = slug ?? NONE;
    },
    /** 这份报告的 iframe 改标题（显示着的、后台载入的） */
    title(slug: string, title: string) {
      for (const page of [shown, next]) if (page?.slug === slug) page.frame.title = title;
    },
    dispose() {
      disposed = true;
      // 报告区拆掉时显示着的那一页：再建起来时重新显示它（显示着的页面随后移除，在 pagehide 里记下读者的位置）
      if (shown) leaveShown(shown.slug, DOC, viteReloads());
      window.removeEventListener('pagehide', leaving);
      clearTimeout(revealTimer);
      revealWatch();
      view.removeEventListener('wheel', forwardWheel);
      unsubNav();
      unsubTheme();
      unsubTitle();
      unwatchCards();
      if (next) drop(next);
      next = null;
      if (shown) detachSession(shown.slug);
      shown = null;
      placeToast();
      view.replaceChildren();
    },
  };
}

/** show 里「什么都不显示」的写法（slug 和 @<slug> 都不会是空的） */
const NONE = '';
/** 打开着的在报告区里的键（文档的 slug、自定义页的 @<slug>）；网页链接、扩展的条目、什么都没有：NONE */
const keyOf = (current: ReturnType<typeof navStore.get>['current']) => (current?.kind === 'page' ? pageKey(current.slug) : current?.kind === 'document' ? current.slug : NONE);

function ReportFrame({ slug, title }: { slug: string | null; title: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const frames = useRef<ReturnType<typeof createFrames> | null>(null);

  useLayoutEffect(() => {
    const controller = createFrames(ref.current!);
    frames.current = controller;
    return () => {
      controller.dispose();
      if (frames.current === controller) frames.current = null;
    };
  }, []);

  // iframe 的标题随报告标题变（新建的 iframe 读 data-title）；先于 show，show 之后的微任务里建的就是新标题
  useLayoutEffect(() => {
    ref.current!.dataset.title = title;
    if (slug) frames.current?.title(slug, title);
  }, [slug, title]);

  useLayoutEffect(() => {
    frames.current?.show(slug);
  }, [slug]);

  return <div ref={ref} className={cls('report-view', !slug && 'off')} data-title={title} />;
}
