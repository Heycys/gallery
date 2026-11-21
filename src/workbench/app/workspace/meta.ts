import { clamp } from '../lib/util';
import { DOCS, isTop, newGroupId, topOf } from '../../../shared/outline-shape.mjs';
import { ROOT, type Column, type WorkspaceMeta } from './types';

/**
 * 目录元数据的纯函数操作（输入旧 meta，返回新 meta，不修改原对象）。
 * 父子关系只是目录组织，与磁盘目录无关。
 * 侧栏分成几栏（shared/outline-shape.mjs）：children 里一栏的顶层记在它的顶层键下（「文档」栏是 ROOT，也就是 ""，和分栏之前一样；
 * 别的栏是 ":<id>"），条目下面的记在条目的 slug 下。所以条目换到另一栏，就是换了一个上级。
 */

export const emptyMeta = (): WorkspaceMeta => ({ children: { [ROOT]: [] }, favorites: [], groups: [{ id: DOCS }] });

/** 一栏的顶层键 */
export const columnTop = (column: Column | string) => topOf(typeof column === 'string' ? column : column.id);
/** 一个键是不是一栏的顶层 */
export const isColumnTop = (key: string) => isTop(key);

/**
 * 与实际存在的条目对齐：去掉已不存在的、去重；新出现的文档追加到「文档」栏末尾，新出现的链接追加到放链接的那一栏（role links）末尾，没有那一栏时放「文档」。
 * slugs：目录里的条目；links：其中哪些是网页链接；known：收藏可以包含的全部 slug（默认就是 slugs）。
 */
export function reconcile(meta: Partial<WorkspaceMeta> | null, slugs: string[], links: string[] = [], known: string[] = slugs): WorkspaceMeta {
  const groups = meta?.groups?.length ? meta.groups : [{ id: DOCS }];
  const exists = new Set(slugs);
  const seen = new Set<string>();
  const children: Record<string, string[]> = { [ROOT]: [] };
  for (const group of groups) children[columnTop(group)] = [];
  const walk = (key: string) => {
    const list = (meta?.children?.[key] ?? []).filter(s => exists.has(s) && !seen.has(s));
    list.forEach(s => seen.add(s));
    if (list.length || isTop(key)) children[key] = list;
    list.forEach(walk);
  };
  groups.forEach(group => walk(columnTop(group)));
  const linked = groups.find(group => group.role === 'links');
  const linkSet = new Set(links);
  for (const s of slugs) {
    if (seen.has(s)) continue;
    children[linkSet.has(s) && linked ? columnTop(linked) : ROOT].push(s);
    seen.add(s);
  }
  const favoritable = new Set(known);
  const favorites = [...new Set((meta?.favorites ?? []).filter(s => favoritable.has(s)))];
  return { children, favorites, groups };
}

export const childrenOf = (meta: WorkspaceMeta, key: string) => meta.children[key] ?? [];

export function parentOf(meta: WorkspaceMeta, slug: string): string | null {
  for (const [key, list] of Object.entries(meta.children)) if (list.includes(slug)) return key;
  return null;
}

/** 祖先，从根往下（不含自身，也不含它所在的栏） */
export function ancestorsOf(meta: WorkspaceMeta, slug: string): string[] {
  const out: string[] = [];
  let p = parentOf(meta, slug);
  while (p !== null && !isTop(p) && !out.includes(p)) { out.unshift(p); p = parentOf(meta, p); }
  return out;
}

/** 条目所在的那一栏（沿上级找到顶层键），不在目录里时 null */
export function columnOf(meta: WorkspaceMeta, slug: string): Column | null {
  let p = parentOf(meta, slug);
  for (let guard = 0; p !== null && !isTop(p) && guard < 1000; guard++) p = parentOf(meta, p);
  return p === null ? null : meta.groups.find(group => columnTop(group) === p) ?? null;
}

/** slug 是否在 ofSlug 的子树里（或就是它） */
export function isInside(meta: WorkspaceMeta, slug: string, ofSlug: string): boolean {
  let cur: string | null = slug;
  for (let guard = 0; cur !== null && !isTop(cur) && guard < 1000; guard++) {
    if (cur === ofSlug) return true;
    cur = parentOf(meta, cur);
  }
  return false;
}

/** 深度优先的全部 slug（侧栏顺序：一栏一栏地） */
export function flatten(meta: WorkspaceMeta): string[] {
  const out: string[] = [];
  const walk = (key: string) => childrenOf(meta, key).forEach(s => { out.push(s); walk(s); });
  meta.groups.forEach(group => walk(columnTop(group)));
  return out;
}

function withList(meta: WorkspaceMeta, key: string, list: string[]): WorkspaceMeta {
  const children = { ...meta.children };
  if (list.length || isTop(key)) children[key] = list; else delete children[key];
  return { ...meta, children };
}

/** 从目录里摘掉（它的子报告上移到它原来的位置，避免连带“删除”别的报告） */
export function detach(meta: WorkspaceMeta, slug: string): { meta: WorkspaceMeta; parent: string; index: number } {
  const parent = parentOf(meta, slug) ?? ROOT;
  const siblings = childrenOf(meta, parent);
  const index = siblings.indexOf(slug);
  const kids = childrenOf(meta, slug);
  const next = [...siblings.slice(0, index), ...kids, ...siblings.slice(index + 1)];
  let m = withList(meta, parent, next);
  m = withList(m, slug, []);
  return { meta: m, parent, index: Math.max(0, index) };
}

export function insert(meta: WorkspaceMeta, slug: string, parent: string, index?: number): WorkspaceMeta {
  const list = childrenOf(meta, parent).filter(s => s !== slug);
  list.splice(index === undefined ? list.length : clamp(index, 0, list.length), 0, slug);
  return withList(meta, parent, list);
}

/** 移动：放到某条目前 / 后，放进某条目（末尾 / 开头），或放到一栏的顶层（column：栏的顶层键，默认「文档」栏） */
export type MoveTarget =
  | { pos: 'before' | 'after'; ref: string }
  | { pos: 'inside' | 'inside-start'; ref: string }
  | { pos: 'root'; index?: number; column?: string };

export function move(meta: WorkspaceMeta, slug: string, target: MoveTarget): WorkspaceMeta | null {
  if (target.pos !== 'root' && (target.ref === slug || isInside(meta, target.ref, slug))) return null;
  // 只摘掉自己，子报告跟着走（与 detach 不同）
  const from = parentOf(meta, slug) ?? ROOT;
  let m = withList(meta, from, childrenOf(meta, from).filter(s => s !== slug));
  if (target.pos === 'root') {
    const top = target.column ?? ROOT;
    if (!isTop(top) || !meta.groups.some(group => columnTop(group) === top && !group.extension && !group.hidden)) return null;
    return insert(m, slug, top, target.index);
  }
  if (target.pos === 'inside') return insert(m, slug, target.ref);
  if (target.pos === 'inside-start') return insert(m, slug, target.ref, 0);
  const parent = parentOf(m, target.ref) ?? ROOT;
  const i = childrenOf(m, parent).indexOf(target.ref);
  return insert(m, slug, parent, target.pos === 'after' ? i + 1 : i);
}

export function toggleFavorite(meta: WorkspaceMeta, slug: string): WorkspaceMeta {
  const favorites = meta.favorites.includes(slug) ? meta.favorites.filter(s => s !== slug) : [...meta.favorites, slug];
  return { ...meta, favorites };
}

/** 放进收藏的指定位置（ref 为 null 表示最前） */
export function placeFavorite(meta: WorkspaceMeta, slug: string, ref: string | null, pos: 'before' | 'after'): WorkspaceMeta {
  const favorites = meta.favorites.filter(s => s !== slug);
  let i = ref ? favorites.indexOf(ref) : 0;
  if (i < 0) i = favorites.length; else if (ref && pos === 'after') i++;
  favorites.splice(i, 0, slug);
  return { ...meta, favorites };
}

/* ---------------- 栏（新建栏、改名、调顺序、删除；「文档」栏不能删） ---------------- */

/** 新栏的 id（g- 加四个字母或数字），不和已有的重 */
export const newColumnId = (meta: WorkspaceMeta) => newGroupId(meta.groups);

/** 新建一栏，放在 index 处（默认最后）；已经有这个 id 的栏时 null */
export function addColumn(meta: WorkspaceMeta, column: Column, index?: number): WorkspaceMeta | null {
  if (meta.groups.some(g => g.id === column.id)) return null;
  const groups = [...meta.groups];
  groups.splice(index === undefined ? groups.length : clamp(index, 0, groups.length), 0, column);
  return { ...meta, groups, children: { ...meta.children, [columnTop(column.id)]: [] } };
}

/** 藏起来的工作区的栏再显示出来（移除的撤销），放回 index 处（不给时留在原处）；本来就显示着的 null */
export function showColumn(meta: WorkspaceMeta, id: string, index?: number): WorkspaceMeta | null {
  const group = meta.groups.find(g => g.id === id);
  if (!group?.hidden) return null;
  const { hidden: _hidden, ...shown } = group;
  void _hidden;
  const groups = meta.groups.filter(g => g.id !== id);
  groups.splice(index === undefined ? meta.groups.indexOf(group) : clamp(index, 0, groups.length), 0, shown);
  return { ...meta, groups };
}

/**
 * 条目不在它自己那一栏里时（这个工作区的文档不在自己那一栏，别处的底稿不在它工作区的那一栏），它自己那一栏：右边的灰字写这一栏的名字；
 * 在自己那一栏里、网页链接、找不到的，null。没有它工作区的栏时是 { workspace }（灰字写工作区的名字）
 */
export function ownColumnOf(meta: WorkspaceMeta, slug: string, workspace: string | null): Column | { workspace: string; id?: undefined } | null {
  const own = workspace ? meta.groups.find(g => g.workspace === workspace) : meta.groups.find(g => g.id === DOCS);
  const at = columnOf(meta, slug);
  if (!at || (own && own.id === at.id)) return null;
  return own ?? (workspace ? { workspace } : null);
}

/** 改栏名（空的、和原来一样的不改）；title 为 null 时回到默认的名字 */
export function renameColumn(meta: WorkspaceMeta, id: string, title: string | null): WorkspaceMeta | null {
  const name = title === null ? null : title.replace(/\s+/g, ' ').trim().slice(0, 100);
  const group = meta.groups.find(g => g.id === id);
  if (!group || group.extension || name === '' || (name ?? undefined) === group.title) return null;
  const groups = meta.groups.map(g => {
    if (g.id !== id) return g;
    const { title: _old, ...rest } = g;
    void _old;
    return name ? { ...rest, title: name } : rest;
  });
  return { ...meta, groups };
}

/** 把一栏挪到 index 处（按挪之前的顺序数：放在第 index 栏之前；等于栏数时放最后） */
export function moveColumn(meta: WorkspaceMeta, id: string, index: number): WorkspaceMeta | null {
  const from = meta.groups.findIndex(g => g.id === id);
  if (from < 0) return null;
  const to = clamp(index > from ? index - 1 : index, 0, meta.groups.length - 1);
  if (to === from) return null;
  const groups = [...meta.groups];
  const [group] = groups.splice(from, 1);
  groups.splice(to, 0, group);
  return { ...meta, groups };
}

/** 一栏里拖进来的别的条目原来在哪：撤销移除时放回去 */
export interface Stray { slug: string; parent: string; index: number }

/**
 * 工作区的栏里不是这个工作区的底稿的条目（拖进来的这个工作区的文档、网页链接、第三个工作区的底稿），按侧栏的顺序，各自在哪：
 * 这一栏藏起来时它们连同各自下面的接到这个工作区自己那一栏的末尾，不跟着看不见（服务器读目录时也这样放：shared/outline.mjs）
 */
export function straysOf(meta: WorkspaceMeta, id: string): Stray[] {
  const group = meta.groups.find(g => g.id === id);
  if (!group?.workspace) return [];
  const own = `~${group.workspace}/`;
  const found: Stray[] = [];
  const walk = (key: string) => childrenOf(meta, key).forEach((slug, index) => {
    if (slug.startsWith(own)) walk(slug);
    else found.push({ slug, parent: key, index });
  });
  walk(columnTop(id));
  return found;
}

/** 撤销移除：straysOf 记下的条目放回原处（放回去的地方已经不在了、或成了它自己下面的，就留在原地） */
export function returnStrays(meta: WorkspaceMeta, strays: Stray[]): WorkspaceMeta {
  let m = meta;
  for (const { slug, parent, index } of strays) {
    const from = parentOf(m, slug);
    if (from === null || (isTop(parent) ? !m.groups.some(g => columnTop(g) === parent) : parentOf(m, parent) === null) || isInside(m, parent, slug)) continue;
    m = insert(withList(m, from, childrenOf(m, from).filter(s => s !== slug)), slug, parent, index);
  }
  return m;
}

/**
 * 别处的底稿从文档树移除（out）或放回来（!out）：它工作区的栏是整栏（不是 picked）时，整栏读目录时会把它补回来，所以记进那一栏的 left
 * （它在那个工作区里的 slug），放回来时去掉；别的情形原样返回
 */
export function leaveOut(meta: WorkspaceMeta, entry: string, out = true): WorkspaceMeta {
  const parts = /^~(ws-[0-9a-f]{6})\/(.+)$/.exec(entry);
  const group = parts ? meta.groups.find(g => g.workspace === parts[1]) : undefined;
  if (!parts || !group || group.picked) return meta;
  const left = (group.left ?? []).filter(slug => slug !== parts[2]);
  if (out) left.push(parts[2]);
  const { left: _old, ...rest } = group;
  void _old;
  const next: Column = left.length ? { ...rest, left } : rest;
  return { ...meta, groups: meta.groups.map(g => (g === group ? next : g)) };
}

/**
 * 从侧边栏移除一栏。工作区的栏只是藏起来（hidden，这个工作区的底稿都留在里面：登记表不动，Agent 在那个工作区里新建、打开文档时它回来，
 * 撤销也是把它放回来）；拖进去的别的条目连同各自下面的接到这个工作区自己那一栏的末尾（straysOf）。
 * 读者新建的栏和旧版的「链接」栏是删掉：它顶层的条目（连同各自下面的）接到这个工作区自己那一栏的末尾，不删任何文件。
 * 这个工作区自己的一栏和扩展的栏不能移除（扩展的栏随它的 sidebar.json 来去）
 */
export function removeColumn(meta: WorkspaceMeta, id: string): WorkspaceMeta | null {
  if (id === DOCS || !meta.groups.some(g => g.id === id && !g.extension && !g.hidden)) return null;
  if (meta.groups.some(g => g.id === id && g.workspace)) {
    let m: WorkspaceMeta = { ...meta, groups: meta.groups.map(g => (g.id === id ? { ...g, hidden: true } : g)) };
    for (const { slug, parent } of straysOf(meta, id)) m = insert(withList(m, parent, childrenOf(m, parent).filter(s => s !== slug)), slug, ROOT);
    return m;
  }
  const top = columnTop(id);
  const owner = meta.groups.find(group => group.id === id)?.owner;
  const destination = owner ? columnTop(meta.groups.find(group => group.workspace === owner)?.id ?? DOCS) : ROOT;
  const children: Record<string, string[]> = { ...meta.children, [destination]: [...childrenOf(meta, destination), ...childrenOf(meta, top)] };
  delete children[top];
  return { ...meta, children, groups: meta.groups.filter(g => g.id !== id) };
}
