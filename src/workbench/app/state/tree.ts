import { createStore } from '../lib/store';
import { storage } from '../lib/util';
import { KEYS } from '../../../shared/renamed-storage.mjs';
import { DOCS } from '../../../shared/outline-shape.mjs';
import { ancestorsOf, childrenOf, columnTop } from '../workspace/meta';
import { workspaceStore } from '../workspace/store';

/** 侧栏树的展开状态 + 分组折叠状态（界面状态，只存在本地） */
interface TreeState {
  /** key = 报告 slug；收藏分组里的副本用 "fav:" + slug，与正常树互不影响 */
  expanded: Record<string, true>;
  /** key = "fav"（收藏），或一栏的 id（「文档」栏是 docs） */
  collapsedSections: Record<string, boolean>;
}

const KEY = KEYS.tree;
// 分栏之前「文档」分组记作 reports：读的时候换成「文档」栏的 id
function stored(): TreeState {
  const state = storage.get<TreeState>(KEY) ?? { expanded: {}, collapsedSections: {} };
  const { reports, ...rest } = state.collapsedSections ?? {};
  return { expanded: state.expanded ?? {}, collapsedSections: reports === undefined ? rest : { [DOCS]: reports, ...rest } };
}
export const treeStore = createStore<TreeState>(stored());
treeStore.subscribe(() => storage.set(KEY, treeStore.get()));

export type TreeScope = 'tree' | 'fav';
/** 收藏（"fav"），或一栏的 id */
export type SectionKey = string;
export const FAV = 'fav';
export const expKey = (slug: string, scope: TreeScope) => (scope === 'fav' ? `fav:${slug}` : slug);

export function setExpandedKey(key: string, open: boolean) {
  treeStore.set(s => {
    if (!!s.expanded[key] === open) return s;
    const expanded = { ...s.expanded };
    if (open) expanded[key] = true; else delete expanded[key];
    return { ...s, expanded };
  });
}
export const toggleExpandedKey = (key: string) => setExpandedKey(key, !treeStore.get().expanded[key]);

/** 展开报告的所有祖先（打开深层报告时让它在侧栏里可见） */
export function expandAncestors(slug: string) {
  for (const a of ancestorsOf(workspaceStore.get().meta, slug)) setExpandedKey(a, true);
}

export function toggleSection(key: SectionKey) {
  treeStore.set(s => ({ ...s, collapsedSections: { ...s.collapsedSections, [key]: !s.collapsedSections[key] } }));
}
export function openSection(key: SectionKey) {
  treeStore.set(s => (s.collapsedSections[key] ? { ...s, collapsedSections: { ...s.collapsedSections, [key]: false } } : s));
}

/** 折叠 / 展开某分组（收藏，或一栏）内的全部条目 */
export function setSectionExpanded(section: SectionKey, open: boolean) {
  const { meta } = workspaceStore.get();
  const scope: TreeScope = section === FAV ? 'fav' : 'tree';
  const expanded = { ...treeStore.get().expanded };
  const walk = (slugs: string[]) => slugs.forEach(slug => {
    const kids = childrenOf(meta, slug);
    const key = expKey(slug, scope);
    if (open && kids.length) expanded[key] = true; else if (!open) delete expanded[key];
    walk(kids);
  });
  walk(section === FAV ? meta.favorites : childrenOf(meta, columnTop(section)));
  treeStore.set(s => ({ ...s, expanded }));
}
