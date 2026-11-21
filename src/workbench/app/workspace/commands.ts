import { chooseLanguage, language } from '../../../shared/i18n/index.mjs';
import { kindOf } from '../../../shared/import-types.mjs';
import { choose } from '../components/Dialog';
import { createStore } from '../lib/store';
import { hideToast, toast } from '../components/Toast';
import { leaveReport, saveReport } from '../session/guard';
import { can, command, sessionStore, waitForSession } from '../session/sessionStore';
import { currentDocument, currentEntry, currentLink, currentPage, openCustomPage, openReport } from '../state/navigation';
import { openSection, setExpandedKey } from '../state/tree';
import * as api from './api';
import * as M from './meta';
import { columnShown, columnTitle, draftParts, firstPage, isLink, pageOf, pageTitle, refreshWorkspace, reportTitle, updateMeta, workspaceStore } from './store';
import { DOCS, columnWorkspaceId, entryWorkspace, isTop } from '../../../shared/outline-shape.mjs';
import { exportFile, importUploads, pageMarkdown, uploadFile, type ExportOptions } from './transfer';
import { writeInto, type DirectoryHandle } from './exportFolder';
import { ROOT, type DocLook, type Report, type WorkspaceMeta } from './types';
import { lookOf } from '../../../shared/document-look.mjs';
import { t } from '../../../shared/i18n/index.mjs';

/**
 * 界面调用的高层命令。
 * - 目录组织（移动、收藏）只改目录，不移动磁盘目录
 * - 报告级操作（新建、复制、删除、恢复、导入、导出）由 dev:local 执行，完成后重新读取；
 *   新建、复制、恢复的报告放在哪里也由服务器决定（新建放在父报告末尾、副本紧跟原报告、恢复回原处）
 * - 会关闭当前报告的操作，先经过 leaveReport()；用到当前报告源文件的操作（复制、导出），先保存还在等的修改
 */

const fail = (error: unknown) => toast((error as Error).message || t('操作失败'));

export function moveReport(slug: string, target: M.MoveTarget): boolean {
  const ws = workspaceStore.get();
  const next = M.move(ws.meta, slug, target);
  if (!next) return false;
  const column = M.columnOf(next, slug);
  const owner = columnWorkspaceId(column, ws.self);
  if (ws.shared && owner && owner !== entryWorkspace(slug, ws.self)) {
    void copyAcross(slug, next, owner);
    return false;
  }
  return updateMeta(m => M.move(m, slug, target));
}

async function copyAcross(slug: string, next: WorkspaceMeta, owner: string) {
  const ws = workspaceStore.get();
  const parent = M.parentOf(next, slug)!;
  const column = M.columnOf(next, slug)!;
  const choice = await choose({
    title: t('复制到另一个工作区？'),
    message: t('将「{0}」及其子页面复制到「{1}」，原项保留。', reportTitle(ws.reports[slug]), columnTitle(ws.meta.groups.find(group => owner === ws.self ? group.id === DOCS : group.workspace === owner) ?? column)),
    actions: [{ id: 'cancel', label: t('取消') }, { id: 'copy', label: t('复制'), primary: true }], cancelId: 'cancel',
  });
  if (choice !== 'copy') return;
  try {
    if (currentDocument() === slug) await saveReport();
    const source = draftParts(slug);
    const localParent = isTop(parent) ? column.workspace === owner ? ROOT : parent : draftParts(parent)?.slug ?? parent;
    const made = await api.copyAcross(owner === ws.self ? null : owner, { sourceWs: source?.ws ?? ws.self!, slug: source?.slug ?? slug, parent: localParent, index: M.childrenOf(next, parent).indexOf(slug) });
    await refreshWorkspace();
    openSection(column.id);
    if (!isTop(parent)) setExpandedKey(parent, true);
    toast(t('已复制 {0} 项，原项保留', made.count), { routine: true });
  } catch (error) { fail(error); }
}
export const toggleFavorite = (slug: string) => updateMeta(m => M.toggleFavorite(m, slug));
export const placeFavorite = (slug: string, ref: string | null, pos: 'before' | 'after') => {
  openSection('fav');
  return updateMeta(m => M.placeFavorite(m, slug, ref, pos));
};

/** 新文档落在哪一栏：after 所在的那一栏，否则 parent（一栏的顶层键就是那一栏，一个条目就是它所在的那一栏） */
function landingColumn(place: api.NewPlace) {
  const { meta } = workspaceStore.get();
  if (place.after) return M.columnOf(meta, place.after);
  const parent = place.parent ?? ROOT;
  return isTop(parent) ? meta.groups.find(group => M.columnTop(group) === parent) ?? null : M.columnOf(meta, parent);
}

/**
 * 新建文档，放在 place 说的位置（after 之后的同一层；否则 parent 下，first 时第一个，否则最后）。建在它落进的那一栏对应的工作区里：
 * 其他文件夹里的文档由同一服务的 /~ws-xxxxxx/ 路径处理，保留原来的文件位置。
 * 读者新建的、旧版的「链接」栏）里的，建在这个工作区里。标题是空的（灰字「未命名文档」只是占位），建好后打开它，光标放在标题里等着写
 */
export async function createReport(place: api.NewPlace = { parent: ROOT }) {
  if (!(await leaveReport())) return;
  const column = landingColumn(place);
  const owner = columnWorkspaceId(column, workspaceStore.get().self);
  const elsewhere = owner && owner !== workspaceStore.get().self ? owner : null;
  try {
    const slug = elsewhere ? await api.createElsewhere(elsewhere, '', place) : (await api.create('', place)).slug;
    await refreshWorkspace();
    if (column) openSection(column.id);
    const parent = place.after ? M.parentOf(workspaceStore.get().meta, place.after) : place.parent ?? ROOT;
    if (parent && !isTop(parent)) setExpandedKey(parent, true);
    await openReport(slug, { skipGuard: true });
    void editReportTitle(slug, { quiet: true });
  } catch (error) { fail(error); }
}

/**
 * 侧栏头部的「新建」：打开着的是侧栏里的一条（文档、别处的底稿、网页链接）时，新文档放在它的下一个位置（同一层），建在它所在那一栏的工作区里；
 * 否则放在这个工作区自己那一栏的第一个（默认工作区的工作台里就是「默认文档」栏）
 */
export function newDocument() {
  const ws = workspaceStore.get();
  const open = currentEntry();
  const column = open && ws.reports[open] ? M.columnOf(ws.meta, open) : null;
  return createReport(open && column && columnShown(column, ws) ? { after: open } : { parent: ROOT, first: true });
}

/**
 * 换界面的语言（设置 › 语言）：先离开打开着的文档（还在等的修改存掉），记下语言，再重新载入工作台：
 * 每一句话都按新的语言重新生成（报告页也是，它们读同一个设置）。
 */
export async function switchLanguage(code: string) {
  if (code === language || !(await leaveReport())) return;
  chooseLanguage(code);
  location.reload();
}

export async function duplicateReport(slug: string) {
  if (currentDocument() === slug) await saveReport();
  try {
    // 别处的底稿：它所在工作区的服务做副本，条目 ~ws/<slug> 放在底稿后面（draft-duplicate）
    const draft = draftParts(slug);
    const copy = draft ? (await api.duplicateDraft(draft.ws, draft.slug)).entry : (await api.duplicate(slug)).slug;
    await refreshWorkspace();
    toast(t('已创建副本'), { routine: true });
    await openReport(copy);
  } catch (error) { fail(error); }
}

export async function trashReport(slug: string) {
  const draft = draftParts(slug);
  const link = isLink(slug);
  const isCurrent = currentEntry() === slug;
  if (isCurrent && !link && !(await leaveReport())) return;
  const title = reportTitle(workspaceStore.get().reports[slug]);
  const where = { parent: ROOT, index: Infinity, kids: M.childrenOf(workspaceStore.get().meta, slug) };
  let entry;
  try {
    entry = await (draft ? api.trashDraft(draft.ws, draft.slug, link ? 'link' : undefined) : link ? api.trashLink(slug) : api.trash(slug));
  } catch (error) { fail(error); return; }
  // 别处的底稿进的是它所在工作区的回收区；这里的文档树里它那一条拿掉（它下面的条目上移），其工作区的栏本来也不再列它
  if (draft) {
    updateMeta(m => {
      if (M.parentOf(m, slug) === null) return null;
      const { meta, parent, index } = M.detach(m, slug);
      Object.assign(where, { parent, index });
      return meta;
    });
  }
  await refreshWorkspace();
  if (isCurrent) {
    const ws = workspaceStore.get();
    const up = draft ? where.parent : entry.parent;
    const fallback = up && ws.reports[up] ? up : M.flatten(ws.meta)[0];
    if (fallback) await openReport(fallback, { skipGuard: true, push: false });
  }
  const undo = draft ? () => void restoreDraftReport(draft.ws, entry.id, slug, where) : () => void restoreReport(entry.id);
  toast(draft ? t('「{0}」已移至它所在工作区的回收区', title) : t('「{0}」已移至回收区', title), { action: t('撤销'), onAction: undo });
}

/**
 * 别处的底稿移至回收区之后的撤销：它所在工作区的服务把它放回它的位置，这里的文档树里也放回原处（原来的上级还在，下面的条目回到它下面；
 * 恢复时名字被占了会换一个，条目跟着换）
 */
async function restoreDraftReport(ws: string, id: string, entry: string, where: { parent: string; index: number; kids: string[] }) {
  try {
    const { report } = await api.restoreDraft(ws, id);
    await refreshWorkspace();
    const back = report ? `~${ws}/${report.slug}` : entry;
    // 放回原来的上级下面（它的栏在这里画着的话，栏已经把它补回来了，这里挪一下）
    updateMeta(m => {
      if (!M.isColumnTop(where.parent) && M.parentOf(m, where.parent) === null) return null;
      const base = M.parentOf(m, back) === null ? m : M.detach(m, back).meta;
      let next = M.insert(base, back, where.parent, where.index);
      for (const kid of where.kids) if (M.parentOf(next, kid) !== null) next = M.move(next, kid, { pos: 'inside', ref: back }) ?? next;
      return next;
    });
    const column = M.columnOf(workspaceStore.get().meta, back);
    if (column) openSection(column.id);
    toast(t('已恢复「{0}」', reportTitle(workspaceStore.get().reports[back] ?? report)), { routine: true });
  } catch (error) { fail(error); }
}

export async function restoreReport(id: string) {
  try {
    const { report, page, entry } = await api.restore(id);
    await refreshWorkspace();
    // 放回了它原来的栏：那一栏收着的话打开它
    const where = report && entry?.kind !== 'page' ? M.columnOf(workspaceStore.get().meta, report.slug) : null;
    if (where) openSection(where.id);
    toast(t('已恢复「{0}」', page ? pageTitle(page) : reportTitle(report)), { routine: true }); // 侧栏里看得到它回来了
  } catch (error) { fail(error); }
}

/* ---------------- 栏（栏标题的 ··· 菜单：新建栏、从侧边栏移除……，拖动栏标题） ---------------- */

/** 新建一栏，放在 after 那一栏的下一个位置（不给时放最后），没有名字时叫「未命名栏」；返回它的 id（侧栏接着在栏标题上改名） */
export function createColumn(after?: string): string | null {
  const meta = workspaceStore.get().meta;
  const id = M.newColumnId(meta);
  const at = after ? meta.groups.findIndex(group => group.id === after) : -1;
  const owner = columnWorkspaceId(meta.groups[at], workspaceStore.get().self);
  if (!updateMeta(m => M.addColumn(m, { id, ...(workspaceStore.get().shared && owner ? { owner } : {}) }, at < 0 ? undefined : at + 1))) return null;
  openSection(id);
  return id;
}
export const renameColumn = (id: string, title: string) => updateMeta(m => M.renameColumn(m, id, title));

/** Extension edits use the existing service/refresh path, without copying entries into outline.json. */
async function changeExtension(id: string, change: api.ExtensionChange) {
  try { await api.editExtension(id, change); }
  catch (error) { fail(error); }
  await refreshWorkspace();
}
export async function renameExtension(id: string, title: string, baseTitle: string) {
  const extension = workspaceStore.get().extensions.find(entry => entry.id === id);
  const name = title.replace(/\s+/g, ' ').trim();
  if (!extension || extension.error || !name || name === baseTitle) return;
  await changeExtension(id, { title: name, baseTitle });
}
export async function moveExtensionEntry(id: string, entry: string, ref: string, side: 'before' | 'after', baseOrder: string[]) {
  if (entry === ref) return;
  await changeExtension(id, { move: { entry, ref, side }, baseOrder });
}

/** Confirm exactly the displayed source version, so an Agent's edit during the dialog is retained. */
export async function deleteExtension(id: string, entryId?: string) {
  const extension = workspaceStore.get().extensions.find(item => item.id === id);
  if (!extension?.file || !extension.revision) return;
  const entry = entryId === undefined ? null : extension.entries.find(item => item.id === entryId);
  if (entryId !== undefined && !entry) return;
  const choice = await choose({
    title: entry ? t('删除页面「{0}」？', entry.title) : t('删除分栏「{0}」？', extension.title),
    message: entry
      ? t('将从 sidebar.json 删除这个条目及其全部子项，共用此配置的工作区会同步更新。不会删除网站上的原文档，此操作无法撤销。')
      : t('将删除此分栏的 sidebar.json，共用此配置的工作区会同步移除分栏。其他文件和网站上的原文档不受影响，此操作无法撤销。'),
    actions: [{ id: 'cancel', label: t('取消') }, { id: 'delete', label: t('删除'), danger: true, primary: true }],
    cancelId: 'cancel',
  });
  if (choice !== 'delete') return;
  await changeExtension(id, { remove: entry ? { entry: entry.id } : 'column', baseFile: extension.file, baseRevision: extension.revision });
}
/** 把一栏挪到第 index 栏之前（按挪之前的顺序数；等于栏数时放最后） */
export const moveColumn = (id: string, index: number) => updateMeta(m => M.moveColumn(m, id, index));
/**
 * 从侧边栏移除一栏（这个工作区自己那一栏不能）。工作区的栏只是藏起来：登记表不动，gallery list --all 照样找得到，Agent 在那个工作区里新建、
 * 打开文档时它回来；提示条上可以撤销。读者新建的栏和旧版的「链接」栏是删掉：里面的条目连同它们下面的回到这个工作区自己那一栏末尾，不删任何文件，
 * 提示条上可以撤销（放回原来的栏和位置）
 */
export function removeColumn(id: string) {
  const before = workspaceStore.get().meta;
  const column = before.groups.find(group => group.id === id);
  const moved = M.childrenOf(before, M.columnTop(id));
  const title = columnTitle(column);
  const strays = M.straysOf(before, id);
  if (!column || !updateMeta(m => M.removeColumn(m, id))) return;
  if (column.workspace) {
    // 拖进去的别的条目接到了自己那一栏的末尾：说一声；撤销时连它们一起放回去
    const index = before.groups.findIndex(group => group.id === id);
    const said = strays.length ? t('已从侧边栏移除「{0}」，拖进去的 {1} 项回到了「{2}」，文件都没动', title, strays.length, columnTitle(before.groups.find(group => group.id === DOCS))) : t('已从侧边栏移除「{0}」，文件都没动', title);
    toast(said, { action: t('撤销'), onAction: () => { updateMeta(m => { const shown = M.showColumn(m, id, index); return shown && M.returnStrays(shown, strays); }); } });
    return;
  }
  const destination = before.groups.find(group => column.owner ? group.workspace === column.owner : group.id === DOCS) ?? before.groups.find(group => group.id === DOCS)!;
  const destinationTop = M.columnTop(destination);
  openSection(destination.id);
  toast(t('已删除「{0}」栏，里面的 {1} 项回到了「{2}」', title, moved.length, columnTitle(destination)), {
    action: t('撤销'),
    onAction: () => {
      updateMeta(m => {
        if (m.groups.some(group => group.id === id)) return null;
        const index = Math.min(before.groups.findIndex(group => group.id === id), m.groups.length);
        const groups = [...m.groups];
        groups.splice(index, 0, column);
        const top = M.childrenOf(m, destinationTop).filter(slug => !moved.includes(slug));
        return { ...m, groups, children: { ...m.children, [destinationTop]: top, [M.columnTop(id)]: moved.filter(slug => M.childrenOf(m, destinationTop).includes(slug)) } };
      });
    },
  });
}

/* ---------------- 网页链接（shared/web-links.mjs：<slug>/link.json，内容区里显示那个网页） ---------------- */

/**
 * 添加网页链接（栏标题的 ··· › 添加在线网页…）：放在那一栏（parent 是它的顶层键，不给时是这个工作区自己那一栏）的第一个。网站的图标服务器随后去取，
 * 取到了侧栏和标签页显示它。加好后打开它；网站不让嵌入时提示一句（点开时会提供「在浏览器中打开」）。
 * 服务器拒绝时（Gallery 自己的地址、不是网址……）返回它说的原因，添加的卡片里说出来；加好了返回 null
 */
export async function addLink(link: { url: string; title: string }, parent: string = ROOT): Promise<string | null> {
  let made;
  try {
    const ws = workspaceStore.get();
    const column = landingColumn({ parent });
    const owner = columnWorkspaceId(column, ws.self);
    if (owner && owner !== ws.self) {
      const localParent = isTop(parent) ? column?.workspace === owner ? ROOT : parent : draftParts(parent)?.slug ?? parent;
      const result = await api.draftCommand<{ link: Report }>(owner, 'link', { ...link, parent: localParent, first: true });
      made = { ...result.link, slug: `~${owner}/${result.link.slug}` };
    } else made = await api.createLink({ ...link, parent, first: true });
  } catch (error) { return (error as Error).message || t('操作失败'); }
  await refreshWorkspace();
  const where = M.columnOf(workspaceStore.get().meta, made.slug);
  if (where) openSection(where.id);
  if (parent !== undefined && !isTop(parent)) setExpandedKey(parent, true);
  await openReport(made.slug);
  void api.frameable(made.url ?? link.url).then(({ frameable }) => {
    if (!frameable) toast(t('这个网站不允许在 Gallery 里显示，点开时会提供“在浏览器中打开”'), { duration: 6000 });
  }, () => {});
  return null;
}

/** 链接改名（侧栏条目上的改名框）：只改它的 link.json；空的、和原来一样的不改 */
export async function renameLink(slug: string, title: string) {
  const name = title.replace(/\s+/g, ' ').trim();
  const link = workspaceStore.get().reports[slug];
  if (!name || !link || name === link.title) return;
  workspaceStore.set(s => ({ ...s, reports: { ...s.reports, [slug]: { ...s.reports[slug], title: name } } }));
  try {
    await api.setLink(slug, { title: name });
  } catch (error) { fail(error); }
  await refreshWorkspace();
}

/** 修改网址… */
export async function setLinkUrl(slug: string, url: string): Promise<boolean> {
  try {
    await api.setLink(slug, { url });
  } catch (error) { fail(error); return false; }
  await refreshWorkspace();
  return true;
}

/** 在浏览器中打开：新标签页，不带来源，也拿不到工作台 */
export const openInBrowser = (url: string) => { window.open(url, '_blank', 'noopener,noreferrer'); };

/** 复制网址 */
export function copyLinkUrl(url: string) {
  navigator.clipboard.writeText(url).then(() => toast(t('已复制网址')), (error: Error) => toast(t('没有复制：{0}', error.message), { tone: 'error', duration: 5000 }));
}

/** 打开着的是不是这个链接 */
export const isOpenLink = (slug: string) => currentLink() === slug;

/* ---------------- 自定义页（侧栏头部那几行的 ··· 和右键菜单，页的顶栏 ···） ---------------- */

/**
 * 新建页面：一个空白的自定义页，放在 after 那一页的下面（页的菜单里点的），不给时放在头部最后；打开它，侧栏里它那一行直接是改名框
 * （标题先是「未命名页面」，全选着，打字就换掉；回车或点别处保存）。页的中间说让 Agent 来写，有一句可以复制的话；有了内容之前没有画布
 */
export async function createCustomPage(after: string | null = null, rename: (slug: string) => void = () => {}) {
  if (!(await leaveReport())) return;
  try {
    const page = await api.newPage(t('未命名页面'), after);
    await refreshWorkspace();
    await openCustomPage(page.slug, { skipGuard: true });
    rename(page.slug);
  } catch (error) { fail(error); }
}

/** 自定义页改标题：只写它的 page.json；空的、和原来一样的不改 */
export async function renameCustomPage(slug: string, title: string) {
  const name = title.replace(/\s+/g, ' ').trim();
  if (!name || name === pageOf(slug)?.title) return;
  try {
    await api.renamePage(slug, name);
    await refreshWorkspace();
  } catch (error) { fail(error); }
}

/** 恢复默认卡片说的话：放回了哪些（按界面的语言叫它们）、哪些停用了没放回、哪些没能放回；什么都不缺时说都在 */
function restoredNotice({ added, skipped }: api.Restored) {
  const named = (entry: { block: string; name?: { zh: string; en: string } | null }) => entry.name?.[language === 'en' ? 'en' : 'zh'] ?? entry.block;
  const list = (entries: { block: string; name?: { zh: string; en: string } | null }[]) => entries.map(named).join(t('、'));
  const off = skipped.filter(entry => entry.reason === 'disabled');
  const other = skipped.filter(entry => entry.reason !== 'disabled');
  const parts = [
    ...(added.length ? [t('已放回默认卡片：{0}', list(added))] : []),
    ...(off.length ? [t('{0}已停用，没有放回', list(off))] : []),
    ...(other.length ? [t('没能放回：{0}', list(other))] : []),
  ];
  return parts.length ? parts.join(t('；')) : t('默认卡片都在，没有要放回的');
}

/**
 * 「恢复默认卡片」（有默认卡片的页的菜单里，page.json 的 defaultCards，默认首页有）：这一页上缺的默认卡片放回空位，
 * 别的卡片和数据都不动（页面服务的 restore-defaults）。由这一页自己做：是它画布的一步，在页面上 Ctrl+Z 能撤销，提示条的撤销也是它
 * （这一步还是最后一步时）；没打开就先打开、等它连上。连不上时工作台自己发，页面看到别人写过就重新显示，这时没有撤销
 */
export async function restoreDefaultCards(slug: string) {
  if (!pageOf(slug)?.defaultCards) return;
  if (currentPage() !== slug && !(await openCustomPage(slug))) return;
  const ready = await waitForSession(s => s.slug === `@${slug}` && s.connected && !s.reloading && s.commands.includes('restore-defaults'), 15000);
  const reply = ready && can('restore-defaults') ? await command('restore-defaults') : null;
  if (reply && !reply.ok && reply.reason !== 'board') { toast(t('没能恢复默认卡片'), { tone: 'error' }); return; }
  if (reply?.ok) {
    const restored = { added: (reply.added ?? []) as api.RestoredCard[], skipped: (reply.skipped ?? []) as api.SkippedBlock[] };
    const cards = restored.added.map(entry => entry.card);
    toast(restoredNotice(restored), cards.length ? {
      action: t('撤销'),
      onAction: () => void (async () => {
        if (!(await waitForSession(s => s.slug === `@${slug}` && s.connected && !s.reloading, 8000)) || !can('undo-restore')) return;
        const undone = await command('undo-restore', { cards });
        // moved-on（之后又有一步）：在页面上按 Ctrl+Z；refused（放回的卡片已经不在或被改过，服务拒绝拿掉）：没有可撤的，Ctrl+Z 会撤到前一步
        if (!undone.ok) toast(undone.reason === 'refused' ? t('放回的卡片之后被改过或拿掉了，没有撤销') : t('这一页之后又改过，在页面上按 Ctrl+Z 撤销'));
      })(),
    } : {});
    return;
  }
  try {
    toast(restoredNotice(await api.restoreDefaults(slug)));
  } catch (error) { fail(error); }
}

/**
 * 自定义页移到回收区（首页也一样）：整个文件夹，能恢复（提示条上的撤销，或设置 › 回收区），恢复后回到侧栏头部原来的位置。
 * 打开着的是它的话，换到侧栏头部剩下的第一个页，没有页时换到目录里的第一份
 */
export async function trashCustomPage(slug: string) {
  const isCurrent = currentPage() === slug;
  if (isCurrent && !(await leaveReport())) return;
  const title = pageTitle(pageOf(slug));
  let entry;
  try {
    entry = await api.trashPage(slug);
  } catch (error) { fail(error); return; }
  await refreshWorkspace();
  if (isCurrent) {
    const ws = workspaceStore.get();
    const first = M.flatten(ws.meta)[0];
    const page = firstPage(ws);
    if (page) await openCustomPage(page.slug, { skipGuard: true, push: false });
    else if (first) await openReport(first, { skipGuard: true, push: false });
  }
  toast(t('「{0}」已移至回收区', title), { action: t('撤销'), onAction: () => void restoreReport(entry.id) });
}

export const trashDeleteBusy = createStore(false);

export async function destroyReport(id: string) {
  const entry = workspaceStore.get().trash.find(e => e.id === id);
  await destroyTrash([id], t('永久删除「{0}」？', entry?.title ?? t('这份文档')));
}

export async function destroyAllTrash() {
  // Freeze the confirmed set: entries arriving while the dialog is open stay in the trash.
  const ids = workspaceStore.get().trash.map(entry => entry.id);
  await destroyTrash(ids, t('永久删除回收区中的全部 {0} 项？', ids.length));
}

async function destroyTrash(ids: string[], title: string) {
  if (!ids.length || trashDeleteBusy.get()) return;
  trashDeleteBusy.set(true);
  try {
    const choice = await choose({
      title,
      message: t('删除后无法恢复。'),
      actions: [{ id: 'cancel', label: t('取消') }, { id: 'delete', label: t('永久删除'), danger: true, primary: true }],
      cancelId: 'cancel',
    });
    if (choice !== 'delete') return;
    try {
      for (const id of ids) await api.destroy(id);
    } finally {
      // A failed item stops the batch; still show the real remainder after a partial deletion.
      await refreshWorkspace();
    }
  } catch (error) { fail(error); }
  finally { trashDeleteBusy.set(false); }
}

/**
 * 导出（导出对话框的「导出」）：服务器用保存过的源文件做好文件，浏览器下载。打开着的文档先保存还在等的修改
 * （它可能就是要导出的页面或它的子页面）。出错时提示条说原因（例如导出 PDF 时电脑上没有 Chrome 或 Edge）；
 * 没有通过导出前的检查时，对话框说哪一页的哪一处没有通过（这次没有生成文件）。
 */
export async function exportPage(slug: string, options: ExportOptions, place: { folder?: DirectoryHandle | null; refused?: string } = {}) {
  const current = currentDocument();
  if (current && !(await saveReport())) return;
  const busy = toast(t('正在导出…'), { duration: 600000 });
  try {
    const { name, blob } = await exportFile(slug, options);
    hideToast(busy);
    // 选过的文件夹：直接写进去（同名的不覆盖）
    if (place.folder) {
      const written = await writeInto(place.folder, name, blob);
      toast(t('已导出到「{0}」：{1}', place.folder.name, written), { duration: 5000 });
      return;
    }
    if (place.refused) toast(t('没有写入「{0}」的权限，已改为浏览器下载', place.refused), { duration: 5000 });
    const url = URL.createObjectURL(blob);
    const link = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    // 没有通过导出前的检查：说明长（哪一页、哪一行、怎么改），放进对话框读完，不用一闪而过的提示条
    if ((error as { reason?: string }).reason === 'check') {
      hideToast(busy);
      await choose({ title: t('导出失败'), message: (error as Error).message, actions: [{ id: 'ok', label: t('确定'), primary: true }], cancelId: 'ok' });
      return;
    }
    toast(t('导出失败：{0}', (error as Error).message), { tone: 'error', duration: 6000 });
  }
}

/**
 * 导入（导入对话框选的、拖进来的文件）：逐个上传，服务器把它们转换成页面（每个页面一份新文档，zip 里的子页面
 * 跟着层级），放在 parent 下面（空串：顶层），然后打开导入的第一个页面。没有一个能导入的文件时不上传。
 * 提示：正在导入… → 「文件名」已成功导入 / 你的文件已成功导入 / 已导入 N 个页面，M 个文件不支持：…
 * 页面链接的图片没找到（只选了 Markdown 文件，没选它的图片）时，说出是哪几张，和怎样带上它们。
 * 不是本机导出的 Gallery 文档，导入时去掉了会运行的东西（脚本、事件属性等：src/transfer/own-report.mjs inertPage）时，
 * 在提示后面说去掉了几处，提示多留一会儿。
 */
export async function importFiles(files: File[], parent: string) {
  if (!files.some(file => kindOf(file.name))) { toast(t('不支持的文件类型')); return; }
  toast(t('正在导入…'), { duration: 600000 });
  let result;
  try {
    const uploads: string[] = [];
    const draft = draftParts(parent); // 导入到别处的底稿下面：文件交给它所在工作区的服务
    for (const file of files) uploads.push(await uploadFile(file, draft?.ws));
    result = await importUploads(uploads, parent);
  } catch (error) {
    toast(t('导入失败：{0}', (error as Error).message), { tone: 'error', duration: 6000 });
    return;
  }
  await refreshWorkspace();
  if (!result.pages) { toast(t('不支持的文件类型')); return; }
  if (parent) setExpandedKey(parent, true); else openSection(DOCS);
  if (result.reports[0]) await openReport(result.reports[0]);
  const missing = result.missing ?? [];
  const missed = missing.length ? t('{0} 张图片没有找到：{1}', missing.length, missing.join(t('、'))) : '';
  const inert = result.inert ? ` · ${t('不是本机导出的文件，已去掉其中 {0} 处会运行的代码（脚本、事件属性等），它自己画的图表不会显示', result.inert)}` : '';
  if (result.skipped.length) toast(t('已导入 {0} 个页面，{1} 个文件不支持：{2}', result.pages, result.skipped.length, result.skipped.join(t('、'))) + (missed ? ` · ${missed}` : '') + inert, { duration: missed || inert ? 10000 : 6000 });
  else if (missed) toast(t('已导入，{0} · 把图片和 Markdown 文件一起选上（图片在别的文件夹里时，把整个文件夹压缩成 .zip）再导入，就能带上它们', missed) + inert, { duration: 10000 });
  else toast((files.length === 1 ? t('{0}已成功导入', files[0].name) : t('你的文件已成功导入')) + inert, inert ? { duration: 10000 } : undefined);
}

/**
 * 复制页面内容：整页转成 Markdown 放进剪贴板（src/transfer/markdown.mjs；服务器用保存过的源文件转换，打开着的这页先保存；
 * 图片、文件链接到本地服务的地址，图表是它的表格）。要在点菜单的那一刻同步调用：剪贴板当场就开始写
 * （ClipboardItem 等文字转换好），浏览器才认它是用户的操作。
 */
export function copyPageContent(slug: string) {
  let failed: Error | null = null;
  const text = (async () => {
    if (currentDocument() === slug && !(await saveReport())) throw new Error(t('这页还有修改没有保存'));
    return pageMarkdown(slug);
  })().catch((error: Error) => { failed = error; throw error; });
  const written = typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write
    ? navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then(value => new Blob([value], { type: 'text/plain' })) })])
    : text.then(value => navigator.clipboard.writeText(value));
  written.then(
    () => toast(t('已复制页面内容')), // 剪贴板里有什么看不见：减少通知也说
    (error: Error) => toast(t('没有复制：{0}', (failed ?? error).message), { tone: 'error', duration: 5000 }),
  );
}

/**
 * 复制本地路径：这份文档的 doc.html（旧文档是 report.html）在这台电脑上的完整路径（按系统的写法，Windows 是反斜杠），由 dev:local 给出
 * （它知道文档放在哪个目录），好直接告诉 Agent 改哪份。和复制页面内容一样在点菜单的那一刻开始写剪贴板。
 * 提示总会显示（减少通知时也显示：这是读者从菜单里要的结果）。page：自定义页的 page.html（它的 ⋯ 菜单，Agent 改的就是这个文件）。
 */
export function copySourcePath(slug: string, { page = false }: { page?: boolean } = {}) {
  let failed: Error | null = null;
  const text = api.sourcePath(slug, page).catch((error: Error) => { failed = error; throw error; });
  const written = typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write
    ? navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then(value => new Blob([value], { type: 'text/plain' })) })])
    : text.then(value => navigator.clipboard.writeText(value));
  written.then(
    () => toast(t('已复制本地路径')),
    (error: Error) => toast(t('没有复制：{0}', (failed ?? error).message), { tone: 'error', duration: 5000 }),
  );
}

/**
 * 在侧栏条目上改名（不打开报告）。打开着的报告交给报告页（set-title：它自己的一步修改，能撤销，自动保存写回
 * h1、<title> 和 report.json）；别的报告由 dev:local 直接改（POST rename，和报告页保存标题时一样）。
 * 侧栏先显示新标题，失败了再按服务器重新读取。
 */
export async function renameReport(slug: string, title: string) {
  const name = title.replace(/\s+/g, ' ').trim();
  const ws = workspaceStore.get();
  const report = ws.reports[slug];
  const session = sessionStore.get();
  const open = session.slug === slug && session.connected;
  if (!name || !report || name === ((open && session.title) || reportTitle(report))) return;
  workspaceStore.set(s => ({ ...s, reports: { ...s.reports, [slug]: { ...s.reports[slug], title: name } } }));
  if (open && can('set-title', session)) {
    const answer = await command('set-title', { title: name });
    if (answer.ok) return;
    toast(answer.reason === 'no-title' ? t('这份文档没有标题') : t('没有改成标题'));
    void refreshWorkspace();
    return;
  }
  // 别处的底稿：当前的服务转给它自己工作区的服务（没开就先启动它）
  const draft = draftParts(slug);
  try {
    if (draft) await api.renameDraft(draft.ws, draft.slug, name);
    else await api.rename(slug, name);
  } catch (error) { fail(error); }
  await refreshWorkspace();
}

/** 侧栏里能换图标的条目：文档（这个工作区的，或别处的底稿）、自定义页、网页链接 */
export type IconTarget = { kind: 'document' | 'page' | 'link'; slug: string };

/**
 * 侧栏里换图标（条目的图标，点它打开的图标选择器选好的；icon 为 null 是「移除」）。打开着的文档交给它的页面（set-icon：它自己的一步，
 * 能撤销，提示条上说 Ctrl+Z 撤销，自动保存写回页眉和 doc.json）；别的文档（别处的底稿也是，按它的前缀转给它的工作区）由 dev:local 写
 * （POST icon，和 gallery set --icon 一样只改页眉的图标和 doc.json）；自定义页写它的 page.json（POST icon，kind page）；网页链接写它的
 * link.json（link-set，去掉后显示网站自己的图标）。侧栏先显示新图标，失败了按服务器重新读取。
 */
export async function changeIcon({ kind, slug }: IconTarget, icon: string | null) {
  if (kind === 'page') {
    if ((pageOf(slug)?.icon ?? null) === icon) return;
    workspaceStore.set(s => ({ ...s, pages: s.pages.map(page => (page.slug === slug ? { ...page, icon } : page)) }));
    try { await api.setPageIcon(slug, icon); } catch (error) { fail(error); }
    await refreshWorkspace();
    return;
  }
  const report = workspaceStore.get().reports[slug];
  if (!report) return;
  const session = sessionStore.get();
  const open = kind === 'document' && session.slug === slug && session.connected;
  if ((open && session.icon !== undefined ? session.icon : report.icon ?? null) === icon) return;
  workspaceStore.set(s => ({ ...s, reports: { ...s.reports, [slug]: { ...s.reports[slug], icon: icon ?? undefined } } }));
  if (open && can('set-icon', session)) {
    const answer = await command('set-icon', { icon });
    if (answer.ok) return;
    toast(answer.reason === 'no-title' ? t('这份文档没有标题，放不下图标') : t('图标没有换成'));
    void refreshWorkspace();
    return;
  }
  try {
    if (kind === 'link') await api.setLink(slug, { icon });
    else await api.setIcon(slug, icon);
  } catch (error) { fail(error); }
  await refreshWorkspace();
}

/* ---------------- 别处的底稿（另一个工作区的文档：~ws-xxxxxx/<slug>，shared/drafts.mjs） ---------------- */

/** 剪贴板里写一段文字，写好了说 done；写不进去说原因（在点菜单的那一刻同步开始写，浏览器才认它是读者的操作） */
function copyText(text: string, done: string) {
  navigator.clipboard.writeText(text).then(() => toast(done), (error: Error) => toast(t('没有复制：{0}', error.message), { tone: 'error', duration: 5000 }));
}

/** 复制本地路径（别处的底稿）：它的 doc.html 在这台电脑上的位置，列表里就有，不用问服务器 */
export function copyDraftPath(slug: string) {
  const report = workspaceStore.get().reports[slug];
  if (!report?.path) { toast(t('找不到底稿')); return; }
  copyText(report.path, t('已复制本地路径'));
}

/** 复制本地路径（工作区的栏，这个工作区自己那一栏也是）：那个工作区的文件夹 */
export function copyWorkspacePath(ws: string) {
  const root = workspaceStore.get().workspaces[ws]?.root;
  if (!root) { toast(t('找不到它所在的工作区')); return; }
  copyText(root, t('已复制本地路径'));
}

/** 在文件夹中显示：别处的底稿的文件夹（entry）、一个工作区的（ws）或一个自定义页的（page，pages/<slug>/），用系统的文件管理器打开 */
export async function revealFolder(target: { entry?: string; ws?: string; page?: string; preference?: string }) {
  try {
    const { opened, why } = await api.reveal(target);
    if (!opened) toast(t('没有打开文件夹：{0}', why ?? ''), { duration: 5000 });
  } catch (error) { fail(error); }
}

/**
 * 从文档树移除（别处的底稿）：只拿掉这一条，它下面的条目上移到它原来的位置，不删任何文件（底稿在它自己的工作区里）。它工作区的栏是整栏时
 * 记进那一栏的 left（M.leaveOut），整栏不再把它补回来。提示条上可以撤销（放回原处，下面的条目也回到它下面）
 */
export function removeDraft(slug: string) {
  const before = workspaceStore.get().meta;
  const title = reportTitle(workspaceStore.get().reports[slug]);
  const kids = M.childrenOf(before, slug);
  const place = { parent: ROOT, index: 0 };
  const ok = updateMeta(m => {
    if (M.parentOf(m, slug) === null) return null;
    const { meta, parent, index } = M.detach(m, slug);
    Object.assign(place, { parent, index });
    return M.leaveOut(meta, slug);
  });
  if (!ok) return;
  const { parent, index } = place;
  toast(t('已从文档树移除「{0}」，底稿没有删除', title), {
    action: t('撤销'),
    onAction: () => {
      updateMeta(m => {
        if (M.parentOf(m, slug) !== null || (!M.isColumnTop(parent) && M.parentOf(m, parent) === null)) return null;
        let next = M.insert(M.leaveOut(m, slug, false), slug, parent, index);
        for (const kid of kids) if (M.parentOf(next, kid) !== null) next = M.move(next, kid, { pos: 'inside', ref: slug }) ?? next;
        return next;
      });
    },
  });
}

/**
 * 添加其他 Gallery 项目…（栏标题的 ··· 菜单，after 是那一栏）：路径（工作区的文件夹，文档的 doc.html 或它的文件夹）交给服务器（POST draft-add）。
 * 工作区：它的栏（全部文档）放到 after 的下一个位置，已经显示着的挪过去；文档：已经在侧栏里的定位过去，否则它工作区的栏放到下一个位置，只放它和它下面的，
 * 然后打开它。不在任何工作区里时先问读者，同意了才把那个文件夹登记成工作区。服务器拒绝的（普通 HTML、找不到……）返回它说的原因，卡片里说出来；
 * 加好了返回 null
 */
export async function addGalleryProject(path: string, after: string | null): Promise<string | null> {
  let made: api.ProjectAdded;
  try {
    made = await api.addProject(path, after);
  } catch (error) {
    const { reason, answer } = error as { reason?: string; answer?: { folder?: string } };
    if (reason !== 'unregistered') return (error as Error).message || t('操作失败');
    const choice = await choose({
      title: t('把这个文件夹登记成工作区？'),
      message: (error as Error).message,
      actions: [{ id: 'cancel', label: t('取消') }, { id: 'register', label: t('登记并添加'), primary: true }],
      cancelId: 'cancel',
    });
    if (choice !== 'register') return t('没有添加：{0} 不在任何工作区里', answer?.folder ?? path);
    try {
      made = await api.addProject(path, after, true);
    } catch (again) { return (again as Error).message || t('操作失败'); }
  }
  await refreshWorkspace();
  const ws = workspaceStore.get();
  if (made.kind === 'workspace') {
    if (!made.own && !made.column) return t('侧边栏最多 {0} 栏，放不下这个工作区了', 50);
    const column = made.own ? DOCS : made.column;
    if (column) {
      openSection(column);
      document.querySelector(`.sec-head[data-column="${CSS.escape(column)}"]`)?.scrollIntoView({ block: 'nearest' });
    }
    if (made.own) toast(t('这就是当前的工作区'), { routine: true });
    return null;
  }
  const entry = made.entry!;
  const where = M.columnOf(ws.meta, entry);
  if (where) openSection(where.id);
  for (const above of M.ancestorsOf(ws.meta, entry)) setExpandedKey(above, true);
  if (made.added && made.added.length > 1) setExpandedKey(entry, true);
  await openReport(entry);
  if (made.existing) toast(made.own ? t('这份文档就在这个工作区里') : t('它已经在侧边栏里了'), { routine: true });
  return null;
}

/**
 * 改标题：标题是报告正文的一部分，交给报告页的编辑器处理（撤销、草稿、保存、同步 report.json 都走它自己的流程）。
 * 工作台只负责打开报告并请它把标题选中。
 */
export async function editReportTitle(slug: string, { quiet = false } = {}) {
  if (currentDocument() !== slug && !(await openReport(slug, { fresh: true }))) return; // 标题在开头：不回到上次离开的地方再跳上去
  const ready = await waitForSession(s => s.slug === slug && s.connected, 8000);
  if (!ready) {
    if (!quiet) toast(t('文档还没有打开，请稍后再试'));
    return;
  }
  const answer = await command('edit-title');
  if (answer.ok || quiet) return;
  toast(answer.reason === 'no-title' ? t('这份文档没有标题') : t('没有进入改标题'));
}

// 刚选、还在写进 doc.json 的字体与布局（按文档）：写完之前以它为准，接着点的下一项从它算起（报告页上报的那份这时可能还没跟上）
const pendingLooks = new Map<string, { look: DocLook }>();

/** 这份文档现在的字体与布局：刚选还在写的，打开着的报告页上报的（它 <html> 上的），否则目录里读到的（它显示的：doc.json 的 look 盖在工作区默认上） */
export function currentLook(slug: string): DocLook {
  const pending = pendingLooks.get(slug);
  if (pending) return pending.look;
  const session = sessionStore.get();
  if (session.slug === slug && session.connected && session.look) return session.look;
  return workspaceStore.get().reports[slug]?.look ?? {};
}

let lookWrites: Promise<unknown> = Promise.resolve();

/**
 * 字体与布局（顶栏「更多」的子菜单）：明确选择一项（系统默认也是自己的选择）。打开着的报告页马上换上
 * （会话命令 look：页面不重新载入，排版按新的重新量），菜单里也马上标出；再写进 doc.json（POST look，一次一个，
 * 按点的顺序）。写不进去就换回原来的，并说原因。没有撤销步骤：换回去也是在这里再点一次。
 */
export function chooseLook(slug: string, key: keyof DocLook, value: string) {
  const before = lookOf(currentLook(slug)) as DocLook;
  const next = lookOf({ ...before, [key]: value }) as DocLook;
  const show = (look: DocLook) => {
    workspaceStore.set(s => (s.reports[slug] ? { ...s, reports: { ...s.reports, [slug]: { ...s.reports[slug], look } } } : s));
    const session = sessionStore.get();
    if (session.slug === slug && can('look', session)) void command('look', { look });
  };
  const mine = { look: next };
  pendingLooks.set(slug, mine);
  show(next);
  const draft = draftParts(slug); // 别处的底稿：写进它所在工作区的 doc.json（它自己的服务）
  lookWrites = lookWrites.then(() => (draft ? api.setLookDraft(draft.ws, draft.slug, key, value) : api.setLook(slug, key, value))).then(
    (report) => {
      if (pendingLooks.get(slug) === mine) {
        pendingLooks.delete(slug);
        workspaceStore.set(s => (s.reports[slug] ? { ...s, reports: { ...s.reports, [slug]: { ...s.reports[slug], look: report.look } } } : s));
      }
    },
    (error: Error) => {
      if (pendingLooks.get(slug) === mine) {
        pendingLooks.delete(slug);
        show(before);
      }
      toast(t('字体与布局没有保存：{0}', error.message), { tone: 'error', duration: 5000 });
    },
  );
}

/** Set one default shared by all storage directories; retain individual document overrides. */
export function setGlobalLook(slug: string) {
  const draft = draftParts(slug);
  lookWrites = lookWrites.then(async () => {
    if (draft) await api.setGlobalLookDraft(draft.ws, draft.slug);
    else await api.setGlobalLook(slug);
    await refreshWorkspace();
    toast(t('已设置为全局默认'));
  }).catch((error: Error) => toast(t('全局默认设置失败：{0}', error.message), { tone: 'error', duration: 5000 }));
}
