import type { Column, ComponentSettings, DocLook, ExtensionMeta, OtherWorkspace, PageMeta, ProjectWorkspace, Report, TrashEntry } from './types';
import { language, t, told } from '../../../shared/i18n/index.mjs';
import { projectBase, projectItem } from '../../../shared/workspace-address.mjs';

/**
 * 工作区接口：dev:local 的 /__gallery/workspace/*（src/workbench/service.mjs，规格见 docs/workbench.md）。
 * GET 只校验 Host；POST 带着 info 里拿到的令牌，和保存一样校验 Host、Origin、令牌，
 * 与保存排在同一个队列里逐个执行。出错时抛出服务器给的说明，用界面的语言（told：带着模板和值的按模板说，否则整句查一遍）。
 */

interface Answer { ok: boolean; reason?: string; message?: string; text?: string; values?: unknown[] }

export type ExtensionChange = { title: string; baseTitle: string } | { move: { entry: string; ref: string; side: 'before' | 'after' }; baseOrder: string[] }
  | { remove: 'column' | { entry: string }; baseFile: string; baseRevision: string };
export const editExtension = (id: string, change: ExtensionChange) => post('extension-edit', { id, ...change });

const REASONS: Record<string, string> = {
  missing: t('找不到这份文档'), token: t('令牌失效'), origin: t('请求来源不对'), host: t('请求地址不对'), body: t('请求格式不对'),
};

async function answer<T>(response: Response): Promise<T & Answer> {
  const body = await response.json().catch(() => ({ ok: false, reason: 'server', message: t('服务器没有给出结果（HTTP {0}）', response.status) }));
  return body as T & Answer;
}

const offline = () => new Error(t('没有连上 Gallery 的本地服务：运行 gallery open 启动它。'));

async function get<T>(name: string, base = ''): Promise<T> {
  const query = new URL(name, 'http://gallery/');
  const owner = projectItem(query.searchParams.get('slug'));
  if (owner) { base = owner.base; query.searchParams.set('slug', owner.slug); name = query.pathname.slice(1) + query.search; }
  const response = await fetch(`${base}/__gallery/workspace/${name}`, { cache: 'no-store' }).catch(() => { throw offline(); });
  const body = await answer<T>(response);
  if (!body.ok) throw new Error(told(body) ?? REASONS[body.reason ?? ''] ?? t('读取失败（{0}）', body.reason));
  return body;
}

let cachedToken: string | null = null;

/** 请求带的令牌（info 里拿一次）；fresh：服务器换了令牌，重新拿 */
export async function editToken(fresh = false): Promise<string> {
  if (fresh) cachedToken = null;
  return cachedToken ??= (await get<{ token: string }>('info')).token;
}

export async function post<T>(name: string, payload: object, retry = true, scope: { base?: string; area?: string } = {}): Promise<T> {
  const fields = payload as Record<string, unknown>;
  const field = ['slug', 'id', 'page'].find(key => projectItem(fields[key]));
  const owner = field ? projectItem(fields[field]) : null;
  const base = owner?.base ?? scope.base ?? '';
  const token = await editToken();
  const response = await fetch(`${base}/__gallery/${scope.area ?? 'workspace'}/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gallery-Token': token },
    body: JSON.stringify(owner && field ? { ...fields, [field]: owner.slug } : payload),
  }).catch(() => { throw offline(); });
  const body = await answer<T>(response);
  // 服务器丢了状态、换了令牌：重新取一次
  if (!body.ok && body.reason === 'token' && retry) {
    cachedToken = null;
    return post(name, payload, false, scope);
  }
  // 带着服务器给的 reason（store.ts 的目录写回认 stale）和整个回答（添加其他 Gallery 项目… 要它的 folder）
  if (!body.ok) throw Object.assign(new Error(told(body) ?? REASONS[body.reason ?? ''] ?? t('操作没有成功（{0}）', body.reason)), { reason: body.reason, answer: body });
  if (owner) {
    const scoped = body as typeof body & { page?: PageMeta; report?: Report; entry?: TrashEntry };
    for (const item of [scoped.page, scoped.report, scoped.entry]) if (item?.slug && !projectItem(item.slug)) item.slug = '~' + owner.ws + '/' + item.slug;
    if (scoped.entry?.id && !projectItem(scoped.entry.id)) scoped.entry.id = '~' + owner.ws + '/' + scoped.entry.id;
  }
  return body;
}

/** 目录（写作偏好以外的每个条目恰好出现一次，侧栏的栏，哪些是网页链接）、写作偏好那份，它们的标题和说明（链接带 kind 和 url），自定义页（侧栏里的顺序，首页在前），回收区，扩展提供的栏和它们的条目 */
export const outline = () => get<{ outline: { children: Record<string, string[]>; groups?: Column[]; links?: string[]; drafts?: string[] }; instructions: string | null; reports: Record<string, Report>; pages?: PageMeta[]; head?: string[]; trash: TrashEntry[]; workspaces?: Record<string, OtherWorkspace>; self?: string; shared?: boolean; extensions?: ExtensionMeta[]; sandbox?: string; favorites?: string[] }>('outline');
/**
 * 目录写回服务器（层级、顺序和栏）；base：改之前的目录（工作台读到或上一次写的）。服务器上的已经不是它（gallery 命令、页面、别的标签页
 * 刚写过，工作台还没读到）时什么也不写，答 409 stale（store.ts updateMeta 重新读了再改一次）：写回的是整棵树，照写就把那次改动抹掉了
 */
/** 收藏的改动写进目录文件里的收藏（gallery favorite 和各个浏览器共用的那一份：shared/favorites.mjs）；失败不要紧，下次读到时再推一次 */
export const setFavorites = (change: { add?: string[]; remove?: string[] }) => post<{ favorites: string[] }>('favorite', change);
export const saveOutline = (tree: { children: Record<string, string[]>; groups: Column[] }, base: { children: Record<string, string[]>; groups: Column[] }) => post('outline', { outline: tree, base });
/** 文档菜单底部那两行：report.html 上次写入的时间（毫秒）和字数 */
/** 搜索文档的正文：标题或正文里有这些字的报告，各带出现次数和前几处的片段（shared/search.mjs） */
export interface SearchHit { text: string; start: number; end: number; before: string; index: number }
export interface SearchResult { slug: string; title: boolean; count: number; hits: SearchHit[] }
export const search = async (q: string) => (await get<{ results: SearchResult[] }>(`search?q=${encodeURIComponent(q)}`)).results;
export const stats = (slug: string) => get<{ edited: number; words: number }>(`stats?slug=${encodeURIComponent(slug)}`);
/** 复制本地路径：这份文档的 doc.html（旧文档是 report.html）在这台电脑上的完整路径（系统的写法）；page：自定义页的 page.html */
export const sourcePath = async (slug: string, page = false) => (await get<{ path: string }>(`source?slug=${encodeURIComponent(slug)}${page ? '&kind=page' : ''}`)).path;

/** 设置 › 组件列表：工作区里的自定义块和内置块，各自的开关（src/server/component-settings.mjs） */
export const componentSettings = () => get<ComponentSettings>('components');
/** 拨一个开关：写进 gallery.json，答的是拨完之后的样子；net：允许这个块访问它 needs 里的网站（true），或撤回（false） */
export const switchComponent = (change: { id: string; hidden?: boolean; shown?: boolean; disabled?: boolean; unlisted?: boolean; net?: boolean }) => post<ComponentSettings>('components', change);
/** 拨一个块包的开关（gallery.json 的 components.packs），答的是拨完之后的样子 */
export const switchPack = (pack: string, enabled: boolean) => post<ComponentSettings>('components', { pack, enabled });
/** 导入一个块包：本机上文件夹或 zip 的路径（path），或选的 zip 文件的内容（zip，base64）；答的是装完之后的样子，installed 说装了什么 */
export const installPack = (from: { path: string } | { zip: string }) => post<ComponentSettings & { installed: { id: string; name: { zh: string; en: string }; version: string; did: 'installed' | 'updated' | 'same'; kept: string[] } }>('pack-install', from);
/** 目录变了就叫一声（页面听的同一条事件流，连上时也说一次，docs/render.md「Settings」）；返回的函数关掉它 */
export function onCatalogChange(heard: () => void) {
  const events = new EventSource('/__gallery/events');
  events.onmessage = ({ data }) => { if (String(data).startsWith('settings ')) heard(); };
  return () => events.close();
}

/**
 * 工作区的文档列表变了就叫一声（同一条事件流，带 ?workspace 才听得到 workspace 消息：目录写过了——工作台自己、
 * 别的标签页或 gallery 命令写的——文档新建或没了、doc.json 的标题图标说明改了，src/server/routes.mjs）。
 * 断开后重新连上时也叫一声：断开期间可能错过了。返回的函数关掉它。
 *
 * 同一个地址的工作台标签页共用一条这样的连接（gallery open 每次都开一个标签页，gallery new 加 --open 也开）：HTTP/1.1 下浏览器对一个
 * 地址最多开 6 条连接，所有标签页一起算，每个标签页的页面已经占着一条（它自己的事件流），各开各的，三个标签页就占满了，
 * 之后的请求（保存、编辑器的模块、换页）都一直等着。拿到 Web Lock 的那个标签页开着它，听到的经 BroadcastChannel
 * 告诉别的标签页；它关掉了，锁交给下一个等着的标签页，那个连上时叫一声（交接之间可能错过了）。没有 Web Locks 的浏览器各开各的
 */
const WORKSPACE_EVENTS = 'gallery-workspace-events';
const workspaceListeners = new Set<() => void>();
const extensionListeners = new Set<(id: string | null) => void>();
const updateListeners = new Set<(key: string) => void>();
let stopWorkspaceEvents: (() => void) | null = null;

function followWorkspaceEvents() {
  const shared = typeof BroadcastChannel === 'function' && 'locks' in navigator ? new BroadcastChannel(WORKSPACE_EVENTS) : null;
  const deliver = (message: string) => {
    if (message === 'workspace') workspaceListeners.forEach(heard => heard());
    else if (message === 'extensions') extensionListeners.forEach(heard => heard(null));
    else if (message.startsWith('extensions ')) extensionListeners.forEach(heard => heard(message.slice('extensions '.length)));
    else if (message.startsWith('updated ')) updateListeners.forEach(heard => heard(message.slice('updated '.length)));
  };
  const tell = (message: string) => { deliver(message); shared?.postMessage(message); };
  // 开着事件流，听到的也告诉别的标签页；took：接手别的标签页的，连上时就叫一声
  const listen = (took: boolean) => {
    const events = new EventSource('/__gallery/events?workspace');
    let lost = took;
    events.onmessage = ({ data }) => {
      const message = String(data);
      if (message.startsWith('workspace ')) tell('workspace');
      else if (message.startsWith('extensions ') || message.startsWith('updated ')) tell(message);
    };
    events.onerror = () => { lost = true; };
    events.onopen = () => { if (lost) { lost = false; tell('workspace'); tell('extensions'); } };
    return () => events.close();
  };
  if (!shared) return listen(false);
  shared.onmessage = ({ data }) => { if (typeof data === 'string') deliver(data); };
  const quit = new AbortController();
  // 拿着锁、开着事件流，直到关掉
  const hold = (took: boolean) => new Promise<void>(release => {
    if (quit.signal.aborted) return release();
    const close = listen(took);
    quit.signal.addEventListener('abort', () => { close(); release(); }, { once: true });
  });
  let held = false;
  navigator.locks.request(WORKSPACE_EVENTS, { ifAvailable: true }, lock => { if (!lock) return; held = true; return hold(false); })
    .then(() => (held || quit.signal.aborted ? undefined : navigator.locks.request(WORKSPACE_EVENTS, { signal: quit.signal }, () => hold(true))))
    .catch(() => {}); // 还在等锁就关掉了（AbortError）
  return () => { quit.abort(); shared.close(); };
}

function stopIfUnused() {
  if (workspaceListeners.size || extensionListeners.size || updateListeners.size) return;
  stopWorkspaceEvents?.();
  stopWorkspaceEvents = null;
}

export function onWorkspaceChange(heard: () => void) {
  workspaceListeners.add(heard);
  stopWorkspaceEvents ??= followWorkspaceEvents();
  return () => { workspaceListeners.delete(heard); stopIfUnused(); };
}

/**
 * 别人写了的页面（同一条事件流的 updated <键>，src/server/updates.mjs）：Agent 或别的程序改了一份文档的 doc.html 或一个自定义页的 page.html，
 * 不是读者自己的修改。键是侧栏里的写法：这个工作区的文档是 slug，别处的底稿是 ~ws-xxxxxx/<slug>，自定义页是 @<slug>。断开期间的不补
 */
export function onPageUpdated(heard: (key: string) => void) {
  updateListeners.add(heard);
  stopWorkspaceEvents ??= followWorkspaceEvents();
  return () => { updateListeners.delete(heard); stopIfUnused(); };
}

/** Extension IDs received on the shared workspace stream; null means reconnect and re-read all. */
export function onExtensionChange(heard: (id: string | null) => void) {
  extensionListeners.add(heard);
  stopWorkspaceEvents ??= followWorkspaceEvents();
  return () => { extensionListeners.delete(heard); stopIfUnused(); };
}

/** 新文档放在哪里：after 之后（同一层），否则 parent 下（一个条目，或一栏的顶层键），first 时放第一个，否则放最后 */
export interface NewPlace { parent?: string; after?: string | null; first?: boolean }
/** 新建文档：标题、说明用界面的语言，界面是英文时页面的 lang 也是 en（导出的文件里套件自己的文字跟着它） */
export const create = async (title: string, place: NewPlace) => (await post<{ report: Report }>('create', { title, ...place, description: t('新文档'), language })).report;
/** 在其他目录的栏目新建：同一服务的 create 按所有者前缀保存，条目仍为 ~ws-xxxxxx/<slug> */
const localPlace = (key: string | null | undefined, ws: string) => key === `:${ws}` ? '' : key?.startsWith(`~${ws}/`) ? key.slice(ws.length + 2) : key;
export const createElsewhere = async (ws: string, title: string, place: NewPlace) => {
  const { report } = await draftCommand<{ report: Report }>(ws, 'create', { title, ...place, parent: localPlace(place.parent, ws), after: localPlace(place.after, ws), description: t('新文档'), language });
  return `~${ws}/${report.slug}`;
};
/** 写作偏好那份（Agent 写报告时照着写的规则），第一次时新建 */
export const instructions = async (preference?: string) => (await post<{ report: Report }>('instructions', { preference, title: t('写作偏好'), description: t('Agent 每次写报告前都会先读的写作偏好'), language })).report;
export const duplicate = async (slug: string) => (await post<{ report: Report }>('duplicate', { slug, suffix: t('（副本）'), untitled: t('未命名文档') })).report;
/** 改标题：h1、<title>（还是原标题时）和 report.json，与报告页保存标题时一样 */
export const rename = async (slug: string, title: string) => (await post<{ report: Report }>('rename', { slug, title })).report;
/** 侧栏里换图标：没打开的文档（别处的底稿按它的前缀转给它的工作区）写页眉和 doc.json；icon 为 null 去掉 */
export const setIcon = async (slug: string, icon: string | null) => (await post<{ report: Report }>('icon', { slug, icon })).report;
/** 字体与布局只更新 doc.json 中明确选择的字段，保留其余单篇设置；report.look 是生效后的样式。 */
export const setLook = async (slug: string, field: keyof DocLook, value: string) => (await post<{ report: Report }>('look', { slug, field, value })).report;
/** 当前文档的有效样式设为用户级全局默认，各文档自己的覆盖不变。 */
export const setGlobalLook = (slug: string) => post<{ look: DocLook }>('looks', { slug });
export const trash = async (slug: string) => (await post<{ entry: TrashEntry }>('trash', { slug })).entry;

/* ---------------- 其他目录的文档：同一服务，路径前缀选择文件所属目录 ---------------- */

/** 文档命令按注册的工作区 ID 选择存储目录；回收区、历史和文档修改留在原目录。 */
export const draftCommand = <T>(ws: string, name: string, fields: object = {}) => post<T>(name, fields, true, { base: projectBase(ws), area: ['markdown', 'import'].includes(name) ? 'transfer' : name === 'annotations' ? 'edit' : 'workspace' });
/** Confirmed copy, handled by the destination's ordinary workspace service. */
export const copyAcross = (destination: string | null, fields: { sourceWs: string; slug: string; parent: string; index: number }) => destination
  ? draftCommand<{ slug: string; count: number }>(destination, 'copy-from', fields)
  : post<{ slug: string; count: number }>('copy-from', fields);
/** 改别处的底稿的标题（rename） */
export const renameDraft = async (ws: string, slug: string, title: string) => (await draftCommand<{ report: Report }>(ws, 'rename', { slug, title })).report;
/** 移至回收区（trash）：进的是它所在工作区的回收区；撤销是 restore（entry.id） */
export const trashDraft = async (ws: string, slug: string, kind?: 'link') => (await draftCommand<{ entry: TrashEntry }>(ws, 'trash', { slug, kind })).entry;
export const restoreDraft = (ws: string, id: string) => draftCommand<{ report?: Report; entry: TrashEntry }>(ws, 'restore', { id });
/** 创建副本：普通 duplicate 命令写入原目录，返回带所有者前缀的目录树条目 */
export const duplicateDraft = async (ws: string, slug: string) => {
  const { report } = await draftCommand<{ report: Report }>(ws, 'duplicate', { slug, suffix: t('（副本）'), untitled: t('未命名文档') });
  const entry = `~${ws}/${report.slug}`;
  return { entry, report: { ...report, slug: entry } };
};
/** 外部底稿同样按字段写入原位置的 doc.json；设置全局默认仍使用同一用户级配置。 */
export const setLookDraft = async (ws: string, slug: string, field: keyof DocLook, value: string) => (await draftCommand<{ report: Report }>(ws, 'look', { slug, field, value })).report;
export const setGlobalLookDraft = (ws: string, slug: string) => draftCommand<{ look: DocLook }>(ws, 'looks', { slug });
/** 批注删除的撤销：放回它的 annotations.json */
export const restoreAnnotationsDraft = (ws: string, slug: string, items: unknown[]) => draftCommand(ws, 'annotations', { slug, restore: items });
/**
 * 添加其他 Gallery 项目…：路径指的工作区（kind workspace：它的栏，全部文档，放在 after 那一栏的下一个位置）或文档（kind draft：已经在侧栏里的答
 * existing，否则它工作区的栏，只放它和它下面的）；当前工作区的答 own。不在任何工作区里时抛出的错误带 reason unregistered 和 answer.folder：
 * 读者确认后 confirm 再来一次，把那个文件夹登记成工作区
 */
export interface ProjectAdded { kind: 'workspace' | 'draft'; own?: boolean; existing?: boolean; entry?: string; column?: string | null; added?: string[]; moved?: boolean; shown?: boolean; whole?: boolean }
export const addProject = (path: string, after: string | null, confirm = false) => post<ProjectAdded>('draft-add', { path, after, confirm });
/** 添加其他 Gallery 项目… 的列表：本机登记过的别的工作区，各带它的文档 */
export const projectChoices = async () => (await get<{ workspaces: ProjectWorkspace[] }>('projects')).workspaces;
/** 在文件夹中显示：别处的底稿（entry）、一个工作区（ws）或一个自定义页（page）的文件夹；opened 为 false 时 why 说原因 */
export const reveal = (target: { entry?: string; ws?: string; page?: string; preference?: string }) => post<{ path: string; opened: boolean; why?: string }>('reveal', target);

/* ---------------- 网页链接（shared/web-links.mjs：工作区的 <slug>/link.json） ---------------- */

/**
 * 新建网页链接：放在 parent 下（一个条目，或一栏的顶层键；不给时放进放链接的那一栏，没有就建一个），after 之后或最前（first）。
 * 服务器拒绝 Gallery 自己的地址（reason own）
 */
export const createLink = async (link: { url: string; title: string; icon?: string; parent?: string; after?: string | null; first?: boolean }) =>
  (await post<{ link: Report; parent: string; index: number }>('link', link)).link;
/** 改链接的网址、名称或图标（icon: null 去掉） */
export const setLink = async (slug: string, change: { url?: string; title?: string; icon?: string | null }) => {
  const foreign = /^~(ws-[0-9a-f]{6})\/(.+)$/.exec(slug);
  return (foreign ? await draftCommand<{ link: Report }>(foreign[1], 'link-set', { slug: foreign[2], ...change }) : await post<{ link: Report }>('link-set', { slug, ...change })).link;
};
export const trashLink = async (slug: string) => (await post<{ entry: TrashEntry }>('trash', { slug, kind: 'link' })).entry;
/** 网页让不让别的页面嵌入（服务器去问，记一小时）：reason own 是 Gallery 自己的地址 */
export const frameable = (url: string) => post<{ frameable: boolean; reason?: string }>('frameable', { url });
/** 网页的标题（添加链接时预填名称），取不到时空字符串 */
export const pageTitleOf = async (url: string) => (await post<{ title: string }>('title', { url })).title;
/** 自定义页改标题：只改它的 page.json（page.html 是 Agent 写的） */
export const renamePage = async (slug: string, title: string) => (await post<{ page: PageMeta }>('rename', { slug, title, kind: 'page' })).page;
/** 自定义页换图标（侧栏头部那一行的图标）：只写它的 page.json；icon 为 null 去掉 */
export const setPageIcon = async (slug: string, icon: string | null) => (await post<{ page: PageMeta }>('icon', { slug, icon, kind: 'page' })).page;
/** 自定义页移到回收区（首页也一样）：整个文件夹，它在侧栏头部的位置留着，恢复时回到原处 */
export const trashPage = async (slug: string) => (await post<{ entry: TrashEntry }>('trash', { slug, kind: 'page' })).entry;
/** 侧栏头部各行的新顺序（拖动之后）：写进工作区的目录文件，每个浏览器都按它排 */
export const setHead = async (order: string[]) => (await post<{ head: string[] }>('head', { order })).head;
/** 新建页面：一个空白的自定义页（中间说让 Agent 来写），标题先是给的（未命名页面），放在 after 那一页的下面，不给时放最后 */
export const newPage = async (title: string, after: string | null) => (await post<{ page: PageMeta }>('new-page', { title, after, language })).page;
/** 一张放回的卡片、一个没放回的默认块（页面服务 restore-defaults 的回答：docs/render.md「A custom page」） */
export interface RestoredCard { card: string; block: string; name?: { zh: string; en: string } | null }
export interface SkippedBlock { block: string; reason: string; name?: { zh: string; en: string } | null }
export interface Restored { added: RestoredCard[]; skipped: SkippedBlock[] }
/**
 * 「恢复默认卡片」由工作台自己发（那一页没连上时；连上时由页面做，见 commands.ts restoreDefaultCards）：
 * 页面服务的 restore-defaults，和保存一样带令牌、排队
 */
export async function restoreDefaults(slug: string, retry = true): Promise<Restored> {
  const owner = projectItem(slug), base = owner?.base ?? '';
  const token = await editToken();
  const response = await fetch(`${base}/__gallery/pages/${encodeURIComponent(owner?.slug ?? slug)}/cards`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Gallery-Token': token },
    body: JSON.stringify({ op: 'restore-defaults' }),
  }).catch(() => { throw offline(); });
  const body = await answer<Restored>(response);
  if (!body.ok && body.reason === 'token' && retry) {
    cachedToken = null;
    return restoreDefaults(slug, false);
  }
  if (!body.ok) throw new Error(told(body) ?? REASONS[body.reason ?? ''] ?? t('操作没有成功（{0}）', body.reason));
  return body;
}
/** 恢复：文档答 report，自定义页答 page */
export const restore = (id: string) => post<{ report?: Report; page?: PageMeta; entry: TrashEntry }>('restore', { id });
export const destroy = (id: string) => post('destroy', { id });

export interface PreferenceDocument { id: string; name: string; file: string; enabled: boolean; revision: string; slug: string | null }
export const preferenceDocuments = () => get<{ items: PreferenceDocument[]; hint?: boolean }>('preferences');
export const changePreferences = (change: object) => post<{ items: PreferenceDocument[]; selected: string; hint?: boolean }>('preference-edit', change);
