import { t } from '../../../shared/i18n/index.mjs';
import { entryIn, parseExtensionKey } from '../../../shared/extension-sidebar.mjs';
import { hashAddress } from '../../../shared/page-address.mjs';
import { placeIn } from '../../../shared/reading-place.mjs';
import { inTrash, linkedPages, pageLink, pageLinks, pageOfLink } from '../../../shared/page-links.mjs';
import { toast } from '../components/Toast';
import { createStore } from '../lib/store';
import { leaveReport } from '../session/guard';
import type { PagePlace, PageSpot } from '../session/protocol';
import { can, command, sessionStore, waitForSession } from '../session/sessionStore';
import { flatten } from '../workspace/meta';
import { draftParts, firstPage, isDraft, isLink, pageOf, refreshWorkspace, workspaceStore, type WorkspaceState } from '../workspace/store';
import { setMobileOpen } from './sidebar';
import { consumeExtensionSettingsLink } from './extensionSettings';
import { expandAncestors, setExpandedKey } from './tree';
import { arrive } from './recall';

/**
 * 当前打开的报告 + 地址栏 hash 同步（#标题的词-页面 id，支持浏览器前进后退）。链接从标题和目录名算出来，和服务器、报告页是同
 * 一个算法（shared/page-links.mjs），什么都不用记：所以标题一改地址栏就跟着改，没保存的标题也算（和侧栏一样）；读地址时只看页面 id，
 * 前面的词只是标签，所以改名前记下的地址一直打得开；history 的 state 记 slug，所以前进后退不受改名影响。
 * 目录名（#slug，早先复制的地址里的）也能打开，打开后地址栏换成现在的链接。
 * #<链接>/<块 id>（复制块链接，shared/page-address.mjs）打开文档并定位到块，定位完地址栏也换成链接：
 * 链接和 slug 里都不会有 /，所以 hash 里有 / 的就是块的地址。
 * 切换报告一律经过 leaveReport()：报告页先保存还在等的修改。它保存的同时新报告已经开始载入：current、侧栏、
 * 地址栏在点下去时就是新的，报告区在新页面画好、旧页面回答了以后才换过去（ReportView）。
 * 离开一页时读者在哪里由 recall.ts 记在内存里，侧栏、链接、后退前进回到它时放回去（ReportView 换上之前放好）；要去自己的地方的打开
 * （带块的地址、搜索的定位、改标题、在地址栏里打开的地址）说 fresh，从开头开始或去那里。
 * 一页里点链接跳到本页的块（页面的 jump）也加一条历史，像浏览器跳到页内锚点一样：离开的那条记下页面给的位置（place），
 * 新的一条记块，地址栏不变；后退、前进只在页面里走（show-place、reveal-block），不重新读列表也不重新打开（stepWithin、within）。
 * 自定义页（src/shared/pages.mjs）也在这里打开：地址是 #@<slug>（slug 和文档的链接里都不会有 @），history 的 state 记 { page }，
 * 地址栏里什么都没有时进侧栏头部的第一个自定义页（有的话；没有页时照旧是目录里的第一份）：没有哪一页因为 slug 特殊。
 * 别处的底稿（另一个工作区的文档，docs/workbench.md「Drafts of other workspaces」）的地址是 #~ws-xxxxxx/<它的链接>：它在自己工作区里的
 * 链接（标题的词和页面 id），前面是它工作区的 id，因为不同工作区里同名的文件夹页面 id 相同；带块时后面再接 /<块 id>。
 * 沙箱 iframe 里 history.pushState 会抛异常，所以一律 try/catch。
 */
/**
 * 打开着的是什么：一份文档，一个自定义页（docs/workbench.md「Custom pages」），或一个网页链接（「Web links」：内容区里显示那个网页，
 * 不建会话；地址栏和文档一样是它的链接，#<标题的词>-<页面 id>），或扩展提供的一个条目（「Extension columns」：也是内容区里显示那个网页，
 * slug 是条目的键 ~<扩展 id>/<条目 id>，地址栏就是 #~<扩展 id>/<条目 id>）
 */
export interface Current { kind: 'document' | 'page' | 'link' | 'extension'; slug: string }

interface NavState {
  current: Current | null;
  /** 每次需要“在侧栏里定位当前报告”时加一 */
  revealNonce: number;
}

export const navStore = createStore<NavState>({ current: null, revealNonce: 0 });
// An initial settings address is not a document address.
consumeExtensionSettingsLink();

/** 自定义页在工作台地址和会话里的写法：@<slug> */
export const pageKey = (slug: string) => `@${slug}`;
/** 地址（hash）是不是一个自定义页的（#@<slug>）：是的话它的 slug */
const pageOfHash = (hash: string) => (hash.startsWith('@') && !hash.includes('/') ? hash.slice(1) : null);
/** 打开着的文档的 slug；打开的是自定义页、或什么都没打开时 null */
export const currentDocument = (state: NavState = navStore.get()) => (state.current?.kind === 'document' ? state.current.slug : null);
/** 打开着的自定义页的 slug，没有时 null */
export const currentPage = (state: NavState = navStore.get()) => (state.current?.kind === 'page' ? state.current.slug : null);
/** 打开着的网页链接的 slug，没有时 null */
export const currentLink = (state: NavState = navStore.get()) => (state.current?.kind === 'link' ? state.current.slug : null);
/** 侧栏里打开着的那一条（文档或链接），没有时 null */
export const currentEntry = (state: NavState = navStore.get()) => (state.current && state.current.kind !== 'page' ? state.current.slug : null);
const same = (a: Current | null, b: Current | null) => a?.kind === b?.kind && a?.slug === b?.slug;
/**
 * 扩展提供的条目（键 ~<扩展 id>/<条目 id>）和它的扩展，列表里没有时 undefined。条目的 id 在扩展改写文件后保持不变，所以打开着的条目跟着它走
 */
export function extensionEntry(key: string, ws: WorkspaceState = workspaceStore.get()) {
  const named = parseExtensionKey(key);
  const extension = named ? ws.extensions.find(item => item.id === named.extension) : undefined;
  const entry = named && extension ? entryIn(extension.entries, named.entry) : null;
  return extension && entry ? { extension, entry } : undefined;
}
/** 键里的扩展现在读不出文件（条目暂时都不见了）：打开着的条目不因此关掉，等文件好了或者被扩展移除 */
export const extensionUnreadable = (key: string, ws: WorkspaceState = workspaceStore.get()) => {
  const named = parseExtensionKey(key);
  return Boolean(named && ws.extensions.find(item => item.id === named.extension)?.error);
};
/** 它在不在、能不能打开（文档、链接在列表里，自定义页在页面列表里，扩展的条目是有网址的、在扩展的文件里的；别处的底稿找不到时灰着，打不开） */
const there = (ws: WorkspaceState, target: Current) => (target.kind === 'page' ? Boolean(pageOf(target.slug, ws))
  : target.kind === 'link' ? isLink(target.slug, ws)
    : target.kind === 'extension' ? Boolean(extensionEntry(target.slug, ws)?.entry.url)
      : Boolean(ws.reports[target.slug]) && !isLink(target.slug, ws) && !ws.reports[target.slug].missing);
/**
 * 打开着的那个留不留着：在的留着；扩展的条目在扩展的文件暂时读不出来时也留着（等文件好了再看它还在不在）。
 * 只管已经打开着的：读不出来的时候不能新打开那个扩展的条目（不知道有没有这一条，goTo 用 there）
 */
const stays = (ws: WorkspaceState, target: Current) => there(ws, target) || (target.kind === 'extension' && extensionUnreadable(target.slug, ws));
/** 目录里的一条（文档或链接）该怎么打开 */
const entry = (slug: string, ws: WorkspaceState = workspaceStore.get()): Current => ({ kind: isLink(slug, ws) ? 'link' : 'document', slug });

const readHash = () => { try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; } };

function currentLinks() {
  const session = sessionStore.get();
  const pages = linkedPages(workspaceStore.get().reports).map(report => (
    report.slug === session.slug && session.connected && typeof session.title === 'string' ? { ...report, title: session.title } : report
  ));
  const links = pageLinks(pages.filter(report => !isDraft(report.slug)));
  for (const report of pages) if (isDraft(report.slug)) links.set(report.slug, draftLink(report));
  return links;
}
/** 别处的底稿的链接：~ws-xxxxxx/ 加它在自己工作区里的链接 */
function draftLink({ slug, title }: { slug: string; title?: string }) {
  const parts = draftParts(slug);
  return parts ? `~${parts.ws}/${pageLink({ slug: parts.slug, title })}` : slug;
}
/** 地址（hash，# 后面的）指的文档和块：别处的底稿是 ~ws-xxxxxx/<它的链接>[/<块 id>]，按那个工作区的底稿读；别的照 shared/page-address.mjs */
function addressOf(hash: string): { slug: string; block: string | null } | null {
  const draft = /^~(ws-[0-9a-f]{6})\/([^/]+)(?:\/(.+))?$/.exec(hash);
  const links = currentLinks();
  if (!draft) return hashAddress(hash, new Map([...links].filter(([slug]) => !isDraft(slug))));
  const [, ws, name, block = null] = draft;
  const own = new Map<string, string>();
  for (const [slug, link] of links) {
    const parts = isDraft(slug) ? draftParts(slug) : null;
    if (parts?.ws === ws) own.set(parts.slug, link.slice(ws.length + 2));
  }
  const slug = pageOfLink(own, name);
  return slug ? { slug: `~${ws}/${slug}`, block } : null;
}
/** 显示着的报告页滚到了哪里（iframe 和工作台同源）：滚动位置和窗口顶上的元素（reading-place.mjs），回来时按元素放回，读者展开过的折叠块在新页面里是收起的 */
function readerPlace() {
  const page = document.querySelector<HTMLIFrameElement>('iframe.report-frame:not([data-pending])')?.contentWindow;
  try { return page ? placeIn(page) : null; } catch { return null; }
}
function writeHistory(target: Current, push: boolean) {
  const { slug } = target;
  if (target.kind === 'page') {
    try {
      if (push) {
        history.replaceState({ ...history.state, view: readerPlace() }, '');
        history.pushState({ page: slug }, '', `#${pageKey(slug)}`);
      } else history.replaceState({ page: slug }, '', `#${pageKey(slug)}`);
    } catch { /* 沙箱环境不支持 */ }
    return;
  }
  if (target.kind === 'extension') {
    try {
      if (push) {
        history.replaceState({ ...history.state, view: readerPlace() }, '');
        history.pushState({ extension: slug }, '', `#${slug}`);
      } else history.replaceState({ extension: slug }, '', `#${slug}`);
    } catch { /* 沙箱环境不支持 */ }
    return;
  }
  const link = currentLinks().get(slug) ?? slug;
  try {
    if (push) {
      history.replaceState({ ...history.state, view: readerPlace() }, '');
      history.pushState({ slug }, '', `#${link}`);
    } else history.replaceState(history.state?.slug === slug ? { ...history.state } : { slug }, '', `#${link}`); // 同一份文档的这一条还记着页内跳转的位置
  } catch { /* 沙箱环境不支持 */ }
}

/**
 * 报告页里的链接去了本页的一个块（jump，在页面跳过去之前发来）：离开的这条历史记下读者在的地方（view，页面给的 place），
 * 新加的一条记块，地址栏还是这份文档的链接。已经在跳到这个块的那一条上（又点了同一个链接）就不加，和浏览器对同一个地址一样
 */
export function stepWithin(slug: string, block: string, place: PageSpot) {
  if (currentDocument() !== slug) return;
  const state = history.state ?? {};
  if (state.slug === slug && state.block === block) return;
  try {
    history.replaceState({ ...state, slug, view: place }, '');
    history.pushState({ slug, block }, '', `#${currentLinks().get(slug) ?? slug}`);
  } catch { /* 沙箱环境不支持 */ }
}

/** 在新标签页打开：一个完整的工作台，地址是这份文档的链接 */
export const openInTab = (slug: string) => window.open(`#${currentLinks().get(slug) ?? slug}`, '_blank');
/** 在新标签页打开自定义页 */
export const openPageInTab = (slug: string) => window.open(`#${pageKey(slug)}`, '_blank');
/** 在新标签页打开扩展的条目：地址是它的键 */
export const openExtensionInTab = (key: string) => window.open(`#${key}`, '_blank');

/** 扩展条目上面的几级（从上往下，不含它自己），条目不在列表里时空 */
export function extensionAncestors(key: string, ws: WorkspaceState = workspaceStore.get()) {
  const named = parseExtensionKey(key);
  const extension = named ? ws.extensions.find(item => item.id === named.extension) : undefined;
  if (!named || !extension) return [];
  const walk = (list: typeof extension.entries, above: typeof extension.entries): typeof extension.entries | null => {
    for (const entry of list) {
      if (entry.id === named.entry) return above;
      const inside = walk(entry.children ?? [], [...above, entry]);
      if (inside) return inside;
    }
    return null;
  };
  return walk(extension.entries, []) ?? [];
}

/** 打开扩展条目时，把它上面的几级在侧栏里展开，让它看得见 */
function expandExtensionAncestors(key: string, ws: WorkspaceState) {
  const named = parseExtensionKey(key);
  if (!named) return;
  for (const entry of extensionAncestors(key, ws)) setExpandedKey(`~${named.extension}/${entry.id}`, true);
}

/**
 * 换到 target（文档或自定义页）：先发 prepare-close，不等回答就换 current：服务器生成新页面和旧页面保存同时进行（旧页面回答了才移除）；
 * 接连点了几份，最后点的那份算数。点回还显示着的那份（新的还没换上）时不请它离开。返回时旧页面已经回答（leaveReport 总是放行）。
 * fresh：它要去自己的地方（块、搜索到的字、标题），不回到读者上次离开它的地方（recall.ts）
 */
async function goTo(target: Current, { push = true, reveal = true, skipGuard = false, fresh = false } = {}): Promise<boolean> {
  if (!there(workspaceStore.get(), target)) return false;
  moves += 1;
  const cur = navStore.get();
  const shownKey = target.kind === 'page' ? pageKey(target.slug) : target.slug;
  const leaving = cur.current && !same(cur.current, target) && !skipGuard && sessionStore.get().slug !== shownKey ? leaveReport() : null;
  const revealing = reveal && target.kind !== 'page' && target.kind !== 'extension';
  if (revealing) expandAncestors(target.slug);
  if (target.kind === 'extension') expandExtensionAncestors(target.slug, workspaceStore.get());
  const latest = navStore.get();
  arrive(shownKey, fresh);
  navStore.set({ current: target, revealNonce: revealing ? latest.revealNonce + 1 : latest.revealNonce });
  setMobileOpen(false);
  writeHistory(target, push && !same(cur.current, target));
  if (leaving) await leaving;
  return true;
}

/** 打开目录里的一条：文档，或网页链接（内容区里显示那个网页） */
export const openReport = (slug: string, options: { push?: boolean; reveal?: boolean; skipGuard?: boolean; fresh?: boolean } = {}) => goTo(entry(slug), options);

/** 打开扩展提供的条目（侧栏里扩展那一栏的行、地址 #~<扩展 id>/<条目 id>）：内容区里显示它的网页，和网页链接一样 */
export const openExtensionEntry = (key: string, options: { push?: boolean; skipGuard?: boolean } = {}) => goTo({ kind: 'extension', slug: key }, { ...options, reveal: false });

/** 打开自定义页（侧栏里「新建」「搜索」下面那几行、地址 #@<slug>、页面里的链接） */
export const openCustomPage = (slug: string, options: { push?: boolean; skipGuard?: boolean; fresh?: boolean } = {}) => goTo({ kind: 'page', slug }, { ...options, reveal: false });

/** 正在办的地址（hash）：popstate 和 hashchange 都会报告同一次导航，只办一次 */
let arriving: string | null = null;

/** 第几次要去别的文档：先读列表再去的，读完时已经有新的要去的地方就作罢，最后点的算数 */
let moves = 0;

/** 这份文档连上以后请它定位到块（页面画好才定位，块在折叠块、选项卡、详情卡片里也打开）；地址栏里是块的地址的，定位完换成标题 */
async function revealBlock(slug: string, block: string) {
  const hash = readHash();
  arriving = hash;
  if ((await waitForSession(s => s.slug === slug && s.connected && !s.reloading, 8000)) && can('reveal-block')) await command('reveal-block', { block });
  if (arriving === hash) arriving = null;
  if (currentDocument() === slug && readHash().includes('/')) writeHistory({ kind: 'document', slug }, false);
}

/** 找不到的文档：回收区里有的是删除了（按 slug 或页面 id，name 里 / 之前的部分），别的是地址不对；自定义页（@<slug>）按回收区里自定义页的 slug */
function sayGone(name: string) {
  const page = pageOfHash(name);
  const trash = workspaceStore.get().trash;
  const binned = page !== null ? trash.some(entry => entry.kind === 'page' && entry.slug === page) : inTrash(trash.filter(entry => entry.kind !== 'page'), name);
  toast(binned ? t('这个页面已删除。') : t('没有找到这个页面。'));
}

/** 地址栏里找不到文档时要不要说：块的地址，或者回收区里的；别的词（旧书签之类）不说 */
const saysGone = (hash: string) => hash.includes('/') || inTrash(workspaceStore.get().trash, hash);

const placeOf = (place: PagePlace) => {
  if ('hash' in place) return addressOf(place.hash);
  const slug = pageOfLink(currentLinks(), place.target);
  return slug ? { slug, block: place.block ?? null } : null;
};

/** 报告页里的链接要去的文档（openReport 处理没保存的文字）和块，或自定义页（#@<slug>）；先重新读一次列表：文档可能是别处刚建的，也可能刚被删除 */
export async function openPage(place: PagePlace) {
  const move = (moves += 1);
  await refreshWorkspace();
  if (move !== moves) return;
  const page = 'hash' in place ? pageOfHash(place.hash) : null;
  if (page !== null) {
    if (!(await openCustomPage(page))) sayGone(pageKey(page));
    return;
  }
  // 扩展的条目（#~<扩展 id>/<条目 id>：文档里写着它在工作台的地址）：打开它；没有这一条、它没有网址时说找不到，页面不动
  if ('hash' in place && parseExtensionKey(place.hash)) {
    if (!(await openExtensionEntry(place.hash))) toast(t('没有找到这个页面。'));
    return;
  }
  const found = placeOf(place);
  if (!found) { sayGone('hash' in place ? place.hash : place.target); return; }
  await openReport(found.slug, { fresh: Boolean(found.block) });
  if (found.block) await revealBlock(found.slug, found.block);
}

/**
 * 别处的底稿的页面里点了链接（open）：它说的是它自己工作区里的文档（slug 或那里的地址）。侧栏里有那一篇（~ws-xxxxxx/<slug>）就打开它；
 * 没有时说一句，提示条上可以在它自己的工作台里打开（新标签页，origin 是它的服务）
 */
export async function openDraftPlace(entry: string, place: PagePlace) {
  const parts = draftParts(entry);
  if (!parts) return;
  const move = (moves += 1);
  await refreshWorkspace();
  if (move !== moves) return;
  const hash = 'hash' in place ? place.hash : null;
  const target = 'target' in place ? { key: `~${parts.ws}/${place.target}`, block: place.block ?? null } : null;
  const found = target
    ? (workspaceStore.get().reports[target.key] ? { slug: target.key, block: target.block } : null)
    : hash !== null && !hash.startsWith('@') ? addressOf(`~${parts.ws}/${hash}`) : null;
  if (found && (await openReport(found.slug, { fresh: Boolean(found.block) }))) {
    if (found.block) await revealBlock(found.slug, found.block);
    return;
  }
  toast(t('找不到这份文档'));
}

/**
 * 当前打开的不存在（首次加载、被删除）时，打开 hash 指定的：一个自定义页（#@<slug>）或一份文档；地址里什么都没有、
 * 或打不开时进侧栏头部的第一个自定义页（有的话），否则目录里的第一份
 */
function ensureCurrent() {
  const ws = workspaceStore.get();
  if (ws.status !== 'ready') return;
  const cur = navStore.get();
  if (cur.current && stays(ws, cur.current)) return;
  const hash = readHash();
  const asked = pageOfHash(hash);
  // 地址是扩展条目的（#~<扩展 id>/<条目 id>）：条目在就打开它，不在就说一声（打开着的条目被扩展移除了，是「已被扩展移除」）
  const named = asked === null && parseExtensionKey(hash) !== null;
  const address = asked === null && !named ? addressOf(hash) : null;
  // 目录里的第一份文档：不是别处的底稿（打开它要启动它工作区的服务，只在读者点它、或地址指着它时打开），也先不是网页链接（新加的网页排在一栏的第一个，
  // 打开工作台不去载入一个网站）；只有网页链接时才是第一个链接
  const listed = flatten(ws.meta).filter(slug => !isDraft(slug));
  const first = listed.find(slug => !isLink(slug, ws)) ?? listed[0];
  const target: Current | null = asked !== null && pageOf(asked, ws) ? { kind: 'page', slug: asked }
    : named && extensionEntry(hash, ws)?.entry.url ? { kind: 'extension', slug: hash }
    : address ? entry(address.slug, ws)
      : firstPage(ws) ? { kind: 'page', slug: firstPage(ws)!.slug }
        : first ? entry(first, ws) : null;
  if (same(target, cur.current)) return;
  if (target?.kind === 'extension') expandExtensionAncestors(target.slug, ws);
  else if (target && target.kind !== 'page') expandAncestors(target.slug);
  navStore.set({ current: target, revealNonce: cur.revealNonce + 1 });
  if (target?.kind === 'document' && address?.block) void revealBlock(target.slug, address.block);
  else if (target) writeHistory(target, false);
  if (named) {
    if (target?.kind !== 'extension') toast(cur.current?.kind === 'extension' ? t('这个条目已被扩展移除') : t('没有找到这个页面。'));
  } else if (asked !== null ? !pageOf(asked, ws) : !address && saysGone(hash)) sayGone(hash);
}
workspaceStore.subscribe(ensureCurrent);

/** 打开着的报告改了标题，或地址栏里是它的目录名、改名前的地址：换成现在的链接；块的地址等定位完再换（revealBlock）。自定义页的地址就是 #@<slug> */
function followTitle() {
  const { current } = navStore.get();
  const hash = readHash();
  if (hash === 'settings/extensions' || !current || arriving !== null || !stays(workspaceStore.get(), current)) return;
  if (current.kind === 'page') {
    if (hash !== pageKey(current.slug)) writeHistory(current, false);
    return;
  }
  if (current.kind === 'extension') {
    if (hash !== current.slug) writeHistory(current, false);
    return;
  }
  if (hash !== currentLinks().get(current.slug) && !hash.includes('/')) writeHistory(current, false);
}
workspaceStore.subscribe(followTitle);
sessionStore.subscribe(followTitle);

/**
 * 地址变了（前进后退，或地址栏里贴了新的地址）：一次导航 popstate 和 hashchange 都来，后到的那个看到的已经是办好的。
 * 先重新读一次列表（文档可能是别处刚建的，也可能刚被删除，后退到的那份也一样），读的时候 arriving 挡住同一次导航的另一个事件；
 * 后退、前进到别的页面回到读者离开它的地方（recall.ts，和从侧栏回去一样）；没有 state 的一条是在地址栏里打开的地址（或页面脚本改的 hash），
 * 和新打开一样从开头开始（fresh），带块的去那个块
 */
type EntryState = { slug?: string; page?: string; extension?: string; block?: string; view?: PageSpot | null } | null;

/** 这一条历史是不是当前文档里页内跳转留下的（stepWithin）：地址是这份文档的、不带块，记着块或位置 */
function within(state: EntryState, hash: string) {
  const current = currentDocument();
  if (!current || state?.slug !== current || !(typeof state.block === 'string' || state.view)) return false;
  const address = addressOf(hash);
  return address?.slug === current && !address.block;
}

/**
 * 后退、前进到页内跳转的一条：记着位置的回到那里（光标、详情卡片也回去），只记着块的再跳到块。页面请过重新显示（reloading）时等换上的
 * 新页面（它带着请之前的位置载入，旧页面走了也会被换掉）；等的时候又走了几步，只办最后一步
 */
async function stepTo(state: NonNullable<EntryState>) {
  const move = (moves += 1);
  const slug = state.slug!;
  if (!(await waitForSession(s => s.slug === slug && s.connected && !s.reloading, 8000)) || move !== moves || currentDocument() !== slug) return;
  if (state.view && can('show-place')) await command('show-place', { place: state.view });
  else if (typeof state.block === 'string' && can('reveal-block')) await command('reveal-block', { block: state.block });
}

async function followAddress(state: EntryState, popped = false) {
  if (consumeExtensionSettingsLink()) return;
  const hash = readHash();
  // 页内的一步：popstate 来办；地址上的词不同（中间改过标题）时换成现在的链接（followTitle 留着这一条记的位置），随后的 hashchange 看到的已经是它
  if (within(state, hash)) {
    followTitle();
    if (popped) void stepTo(state!);
    return;
  }
  if (hash === arriving) return;
  const move = (moves += 1);
  arriving = hash;
  await refreshWorkspace();
  if (arriving === hash) arriving = null;
  if (move !== moves || readHash() !== hash) return;
  // 读列表的时候又后退、前进到了同一个地址的一条（页内跳转留下的几条地址一样，它的 popstate 被 arriving 挡住了）：按现在这一条办
  if (popped) state = history.state;
  const { current: shown } = navStore.get();
  // 没有 state：不是工作台记下的一步，是在地址栏里打开的地址
  const opened = !state;
  // 自定义页（#@<slug>）：打开它；打不开时说，地址回到打开着的那个
  const page = typeof state?.page === 'string' ? state.page : pageOfHash(hash);
  if (page !== null) {
    if (shown?.kind === 'page' && shown.slug === page) return;
    void openCustomPage(page, { push: false, fresh: opened }).then(ok => {
      if (ok || !shown) return;
      sayGone(pageKey(page));
      writeHistory(shown, true);
    });
    return;
  }
  // 扩展的条目（#~<扩展 id>/<条目 id>）：打开它；打不开时说，地址回到打开着的那个
  const extension = typeof state?.extension === 'string' ? state.extension : parseExtensionKey(hash) ? hash : null;
  if (extension !== null) {
    if (shown?.kind === 'extension' && shown.slug === extension) return;
    void openExtensionEntry(extension, { push: false }).then(ok => {
      if (ok || !shown) return;
      toast(t('没有找到这个页面。'));
      writeHistory(shown, true);
    });
    return;
  }
  const address = addressOf(hash);
  const slug = state?.slug ?? address?.slug ?? hash;
  const block = address?.block ?? null;
  const current = currentEntry();
  if (!slug) return;
  if (slug === current) {
    if (block) void revealBlock(slug, block);
    else followTitle();
    return;
  }
  void openReport(slug, { push: false, fresh: opened || Boolean(block) }).then(ok => {
    if (ok && block) void revealBlock(slug, block);
    if (ok || !shown) return;
    if (saysGone(hash)) sayGone(hash);
    writeHistory(shown, true);
  });
}
window.addEventListener('popstate', event => void followAddress(event.state, true));
window.addEventListener('hashchange', () => void followAddress(history.state));
