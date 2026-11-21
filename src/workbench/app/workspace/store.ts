import { toast } from '../components/Toast';
import { createStore } from '../lib/store';
import { storage } from '../lib/util';
import { KEYS } from '../../../shared/renamed-storage.mjs';
import * as api from './api';
import { emptyMeta, reconcile } from './meta';
import type { Column, ExtensionMeta, OtherWorkspace, PageMeta, Report, TrashEntry, WorkspaceMeta } from './types';
import { DOCS } from '../../../shared/outline-shape.mjs';
import { mergeFavorites } from '../../../shared/favorite-merge.mjs';
import { headOrder, headPage } from '../../../shared/sidebar-head.mjs';
import { t } from '../../../shared/i18n/index.mjs';

/**
 * 工作台数据：报告列表、目录、回收区。报告列表、目录的层级和顺序、回收区都以服务器为准，每次操作后重新读取；
 * 收藏是这台浏览器上的偏好，存 localStorage；gallery favorite 写的那份在目录文件里，读到时合并进来（刚加的出现、被拿掉的消失），浏览器里加的、拿掉的也告诉它。
 */
export interface WorkspaceState {
  status: 'loading' | 'ready' | 'offline';
  message?: string;
  /** 报告（和写作偏好那份），按 slug */
  reports: Record<string, Report>;
  meta: WorkspaceMeta;
  /** 写作偏好那份的 slug（不在目录里；还没有时是 null） */
  instructions: string | null;
  /** 自定义页，侧栏里的顺序（head 的顺序；没排过的按 gallery.json 的 pages.order，再按标题，在后面） */
  pages: PageMeta[];
  /** 侧栏头部各行的顺序：new（新建）、search（搜索）和每个自定义页的 @<slug>（shared/sidebar-head.mjs；读者拖出来的顺序记在工作区的目录文件里） */
  head: string[];
  trash: TrashEntry[];
  /** 侧栏里别处的底稿和工作区的栏所在的工作区（按 id）：名字、路径（shared/drafts.mjs） */
  workspaces: Record<string, OtherWorkspace>;
  /** 这个工作区自己的 id */
  self: string | null;
  shared: boolean;
  sandbox?: string;
  /** 扩展提供的栏（栏本身的位置在 meta.groups 里，group.extension 是它的 id）：名字、图标和条目来自 sidebar.json；栏名和一级顺序的修改写回该文件 */
  extensions: ExtensionMeta[];
}

const FAVORITES = KEYS.favorites;
/** 目录文件里的收藏上次读到的样子（和浏览器自己的一起合并：shared/favorite-merge.mjs） */
const SYNCED = `${KEYS.favorites}:synced`;

export const workspaceStore = createStore<WorkspaceState>({ status: 'loading', reports: {}, meta: emptyMeta(), instructions: null, pages: [], head: ['new', 'search'], trash: [], workspaces: {}, self: null, shared: false, extensions: [] });

const patch = (p: Partial<WorkspaceState>) => workspaceStore.set(s => ({ ...s, ...p }));

/**
 * 工作台自己改目录的次数（updateMeta）：读目录的那一阵里又改了（拖动、新建栏……，它的写回还在路上），读到的就是改之前的，
 * 不拿它盖掉侧栏（不然拖过去的条目会跳回去，再跳过来）；只按读到的条目增删，层级和栏用侧栏自己的。写回之后服务器会再说一声，那时再读
 */
let edits = 0;
/** 同样的道理，头部的顺序：拖完写回还在路上时读到的是拖之前的，不拿它盖掉 */
let headEdits = 0;

/** 重新读取；并发的刷新合并成一次 */
let refreshing: Promise<void> | null = null;
export function refreshWorkspace(): Promise<void> {
  refreshing ??= (async () => {
    try {
      const seen = edits;
      const seenHead = headEdits;
      const { outline, instructions, reports, pages = [], head = headOrder(null, pages.map(page => page.slug)), trash, workspaces = {}, self = null, shared = false, extensions = [], sandbox, favorites: served } = await api.outline();
      const kept = storage.get<string[]>(FAVORITES) ?? [];
      // 目录文件里的收藏（旧一点的服务器没有）合并进浏览器自己的；只在浏览器里有的，推给目录文件
      const merged = served ? mergeFavorites({ local: kept, seen: storage.get<string[]>(SYNCED) ?? [], server: served }) : null;
      const saved = merged ? merged.favorites : kept;
      const listed = Object.keys(reports).filter(slug => !reports[slug].instructions);
      const links = listed.filter(slug => reports[slug].kind === 'link');
      const meta = reconcile(edits === seen ? { children: outline.children, favorites: saved, groups: outline.groups } : workspaceStore.get().meta, listed, links);
      patch({ status: 'ready', message: undefined, reports, meta, instructions: instructions ?? null, pages, head: headEdits === seenHead ? head : headOrder(workspaceStore.get().head, pages.map(page => page.slug)), trash: trash.map(entry => ({ ...entry, kind: entry.kind ?? 'document' })), workspaces, self, shared, extensions, sandbox });
      if (meta.favorites.length !== saved.length || merged) storage.set(FAVORITES, meta.favorites);
      if (served) {
        storage.set(SYNCED, served);
        const push = merged!.push.filter((slug: string) => meta.favorites.includes(slug));
        const drop = merged!.drop.filter((slug: string) => !meta.favorites.includes(slug));
        if (push.length || drop.length) void api.setFavorites({ ...(push.length ? { add: push } : {}), ...(drop.length ? { remove: drop } : {}) }).catch(() => {});
      }
    } catch (error) {
      patch({ status: 'offline', message: (error as Error).message });
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

/** 等已经在读的那次读完，再读一次：服务器说变了的时候，正在读的那次可能是变之前开始的 */
export async function refreshWorkspaceAfresh(): Promise<void> {
  if (refreshing) await refreshing;
  return refreshWorkspace();
}

// 正在写回服务器的目录：工作区变了的通知（live.ts）等它们都写完再读，免得读到写之前的目录、侧栏闪回去
let saving = 0;
let saved: (() => void)[] = [];
/** 工作台自己改的目录都写回服务器之后 */
export const outlineSaved = () => (saving === 0 ? Promise.resolve() : new Promise<void>(resolve => saved.push(resolve)));

// 目录的写回排成一队，一次写完再写下一次：每次都带着它改之前的目录（base），服务器按它判断这期间别处有没有写过
let queue: Promise<void> = Promise.resolve();
const TRIES = 3;

/**
 * 写回一次目录改动：from 是改之前的目录，to 是改完的。服务器上的已经不是 from（gallery 命令、页面、别的标签页刚写过，
 * 事件流的通知还在路上或者断开了）时服务器不写、答 stale：重新读一次，把同一个改动（fn）做在读到的目录上再写，
 * 最多试 3 次，那次改动就不会被这里写回的整棵树抹掉。别的失败按服务器重新读取。
 */
type Tree = Pick<WorkspaceMeta, 'children' | 'groups'>;
const treeOf = ({ children, groups }: WorkspaceMeta): Tree => ({ children, groups });
async function saveChange(fn: (meta: WorkspaceMeta) => WorkspaceMeta | null, from: Tree, to: Tree, tries = TRIES): Promise<void> {
  try {
    await api.saveOutline(to, from);
  } catch (error) {
    if ((error as { reason?: string }).reason === 'stale' && tries > 1) {
      await refreshWorkspaceAfresh();
      const fresh = workspaceStore.get();
      if (fresh.status !== 'ready') return;
      const again = fn(fresh.meta);
      if (!again || (again.children === fresh.meta.children && again.groups === fresh.meta.groups)) return;
      edits++;
      patch({ meta: again });
      return saveChange(fn, treeOf(fresh.meta), treeOf(again), tries - 1);
    }
    toast(t('目录没有保存：{0}', (error as Error).message));
    void refreshWorkspace();
  }
}

/**
 * 修改目录（只改组织关系，不碰报告文件）；fn 返回 null 表示操作无效。
 * 层级、顺序和栏写回服务器（saveChange：别处刚改过就在改过的目录上再做一次），写失败就按服务器重新读取；收藏只存这台浏览器。
 */
export function updateMeta(fn: (meta: WorkspaceMeta) => WorkspaceMeta | null): boolean {
  const before = workspaceStore.get().meta;
  const next = fn(before);
  if (!next) return false;
  patch({ meta: next });
  if (next.children !== before.children || next.groups !== before.groups) {
    edits++;
    saving++;
    queue = queue.then(() => saveChange(fn, treeOf(before), treeOf(next))).catch(() => {}).finally(() => {
      if (--saving > 0) return;
      const waiting = saved;
      saved = [];
      waiting.forEach(resolve => resolve());
    });
  }
  if (next.favorites !== before.favorites) {
    storage.set(FAVORITES, next.favorites);
    const add = next.favorites.filter(slug => !before.favorites.includes(slug));
    const remove = before.favorites.filter(slug => !next.favorites.includes(slug));
    if (add.length || remove.length) void api.setFavorites({ add, remove }).catch(() => {});
  }
  return true;
}

/** 文档在侧栏、标签页、面包屑、搜索里的名字：它的标题，标题是空的（未命名的文档）就是「未命名文档」 */
export const reportTitle = (r: Report | undefined, fallback = t('未命名文档')) => (r?.title ?? '').trim() || fallback;

/** 这一条是不是网页链接（shared/web-links.mjs） */
export const isLink = (slug: string, ws: WorkspaceState = workspaceStore.get()) => ws.reports[slug]?.kind === 'link';

/** 这一条是不是别处的底稿（另一个工作区的文档：~ws-xxxxxx/<slug>，shared/drafts.mjs） */
export const isDraft = (slug: string | null | undefined) => typeof slug === 'string' && slug.startsWith('~');
/** 别处的底稿的工作区 id 和它在那里的 slug */
export const draftParts = (entry: string) => {
  const match = /^~(ws-[0-9a-f]{6})\/(.+)$/.exec(entry);
  return match ? { ws: match[1], slug: match[2] } : null;
};

/** 别处的工作区的名字（登记表里找不到时是它的 id） */
export const workspaceTitle = (id: string, ws: WorkspaceState = workspaceStore.get()) => ws.workspaces[id]?.name || id;

/** 一栏对应的工作区（这个工作区自己的一栏是 self），没有时 undefined */
export const columnWorkspace = (column: Column | undefined, ws: WorkspaceState = workspaceStore.get()) => (column?.id === DOCS ? ws.self ?? undefined : column?.workspace ?? column?.owner);
/**
 * 一栏显示的名字：读者起的；没有时，工作区的栏（这个工作区自己的一栏也是）是默认工作区的叫「默认文档」，别的叫工作区的名字（gallery.json 的 name，
 * 没有时是文件夹名，跳过通用名）；旧版的「链接」栏、读者新建的栏按界面的语言（链接、未命名栏）；扩展的栏是扩展自己起的名字
 */
export const columnTitle = (column: Column | undefined, ws: WorkspaceState = workspaceStore.get()) => {
  if (column?.extension) return ws.extensions.find(extension => extension.id === column.extension)?.title ?? column.extension;
  if (column?.title) return column.title;
  if (column?.owner && !column.workspace && column.id !== DOCS) return column.role === 'links' ? t('链接') : t('未命名栏');
  const id = columnWorkspace(column, ws);
  if (id) return ws.workspaces[id]?.default ? t('默认文档') : ws.workspaces[id]?.name || (column?.id === DOCS ? t('文档') : id);
  return column?.role === 'links' ? t('链接') : t('未命名栏');
};
/** 一栏在侧栏里显示不显示：读者移除了的（hidden）不显示，对应的工作区不在了的（登记表里没有、编号撞了、文件夹不在了）也不显示 */
export const columnShown = (column: Column, ws: WorkspaceState = workspaceStore.get()) => !column.hidden && (!column.workspace || ws.workspaces[column.workspace]?.there === true);
/** 工作区目录或扩展 sidebar.json 的路径（光标停在栏名上约 1 秒时提示），普通自建栏没有 */
export const columnPath = (column: Column | undefined, ws: WorkspaceState = workspaceStore.get()) => {
  if (column?.extension) return ws.extensions.find(extension => extension.id === column.extension)?.file ?? null;
  const id = columnWorkspace(column, ws);
  return id ? ws.workspaces[id]?.root ?? null : null;
};
/**
 * 工作区的栏（这个工作区自己的一栏也是），和侧栏里别的栏同名（不分大小写）时名字后面补上的灰字：和另一个按工作区起名的栏同名时是服务器给的（上一级目录，或它的路径），
 * 只和别种栏（用户起名的、链接）同名时是它的上一级目录；读者改过名的、叫「默认文档」的、不同名的没有
 */
export const columnAbove = (column: Column | undefined, ws: WorkspaceState = workspaceStore.get()) => {
  const id = columnWorkspace(column, ws);
  if (!id || column?.title || column?.owner) return null;
  const other = ws.workspaces[id];
  if (!other || other.default) return null;
  if (other?.above) return other.above;
  const name = columnTitle(column, ws).toLowerCase();
  return ws.meta.groups.some(each => each.id !== column!.id && columnShown(each, ws) && columnTitle(each, ws).toLowerCase() === name) ? other?.upper ?? other?.root ?? null : null;
};

/** 自定义页（按 slug），没有时 undefined */
export const pageOf = (slug: string, ws: WorkspaceState = workspaceStore.get()) => ws.pages.find(page => page.slug === slug);
/** 自定义页按侧栏头部的顺序 */
export const pagesInHead = (ws: WorkspaceState = workspaceStore.get()) => ws.head.map(key => headPage(key)).filter((slug): slug is string => Boolean(slug)).map(slug => pageOf(slug, ws)).filter((page): page is PageMeta => Boolean(page));
/** 侧栏头部第一个自定义页（地址里什么都没有时打开它，点字标也是它）；没有页时 null */
export const firstPage = (ws: WorkspaceState = workspaceStore.get()) => pagesInHead(ws)[0] ?? null;

/**
 * 侧栏头部换了顺序（拖动一行之后的整个顺序）：先在侧栏里换好，再写回工作区的目录文件（POST head）；
 * 写回没成功时说一声，重新读（回到服务器那边的顺序）
 */
export async function setHead(head: string[]) {
  headEdits++;
  patch({ head });
  try {
    await api.setHead(head);
  } catch (error) {
    toast((error as Error).message || t('操作失败'));
    headEdits++;
    await refreshWorkspace();
  }
}
/** 自定义页的标题（page.json 的，没写时是 slug） */
export const pageTitle = (page: PageMeta | undefined) => (page?.title ?? '').trim() || page?.slug || t('未命名页面');

