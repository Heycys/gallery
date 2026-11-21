import { toast } from '../../components/Toast';
import { can, command, sessionStore } from '../../session/sessionStore';
import { editToken, restoreAnnotationsDraft } from '../../workspace/api';
import { draftParts } from '../../workspace/store';
import { annotationsMarkdown } from '../../../../shared/annotations.mjs';
import { t } from '../../../../shared/i18n/index.mjs';

/**
 * 批注列表（顶栏 ☆ 左边的按钮，docs/workbench.md「批注」）：写批注在报告页里随时可以（editor/page/annotate/：格式工具栏的批注按钮、
 * 块右边的按钮、块菜单、快捷键），报告页也一直画着它们（正文右边的卡片，放不下时的小图标，和文字上的标记），这里管的是已有的批注：列出来，定位过去，复制，全部删除。
 * 批注存在 <工作区>/<slug>/annotations.json；有地方时正文左移给卡片让位，目录不受它影响（editor/page/margin.mjs）。
 * 列表、定位、复制、全部删除都经报告页去做（会话命令 annotations），复制和删除时它先存好还在打的字；撤销按删除时那份报告的 slug 直接交给 dev:local（那时打开的可能已经是另一份）。
 * 其他目录的底稿由同一服务提供；批注与撤销通过所有者路径前缀写回原目录的 annotations.json。
 */

/**
 * 没有东西可批注时的快捷键：等于点一下按钮。焦点也像点击那样到按钮上：焦点留在报告页里时，工作台不知道那里的按下，列表就关不上了。
 * 一条批注也没有时没有按钮，说一声怎么写
 */
export function pressAnnotate() {
  const button = document.querySelector<HTMLButtonElement>('.annot-btn');
  if (!button) { toast(t('还没有批注。选中文字或点块右边的按钮来写')); return; }
  button.focus({ preventScroll: true });
  button.click();
}

/** 批注列表的一行：建议（正在卡片里清空的那条是空的），和它的原文（块的批注是块的文字；图片这样没有文字的块是空的） */
export interface AnnotationRow { id: string; text: string; quote: string; /** Agent 处理过了（gallery notes done）：列表里字是灰的，卡片也灰着 */ done?: boolean }

/** 这一页的批注，按页面顺序（报告页没回答时是空的） */
export async function listAnnotations(): Promise<AnnotationRow[]> {
  const answer = await command('annotations', { action: 'list' });
  return answer.ok ? (answer.items as AnnotationRow[]) : [];
}

/** 定位到一条批注：报告页展开藏着它的折叠块、选项卡，滚过去，显示它的卡片，不拿走焦点。焦点不在报告页里，工作台里的下一次按下它听不到，这里告诉它一声 */
export function locateAnnotation(id: string) {
  void command('annotations', { action: 'locate', id });
  addEventListener('pointerdown', () => { void command('annotations', { action: 'away' }); }, { capture: true, once: true });
}

/** 复制批注的 Markdown 用界面的语言（shared/annotations.mjs annotationsMarkdown） */
const words = () => ({
  head: t('以下是我对这份文档的批注，共 {0} 条。请逐条按“建议”修改底稿；每条给出它在文档里的位置、块的 data-block-id 和批注的原文。'),
  headOne: t('以下是我对这份文档的一条批注。请按“建议”修改底稿；它给出在文档里的位置、块的 data-block-id 和批注的原文。'),
  report: t('文档@doc'),
  source: t('底稿'),
  block: t('块'),
  whole: t('（整块）'),
  noId: t('（还没有 id，按原文找）'),
  suggestion: t('建议@note'),
  body: t('正文'),
  top: t('页首'),
  colon: t('：'),
  comma: t('，'),
});

interface CopyData { title: string; path: string; items: { where: string[]; top?: boolean; blocks: string[]; whole: boolean; quote: string; text: string }[] }

/**
 * 复制批注：报告页先存好还在打的字，dev:local 对着底稿查过一遍（字已经删掉的批注不复制），按页面顺序写成给本地 Agent 的 Markdown
 * （说明、标题、底稿路径，每条的位置、块的 id、原文和建议）。和复制页面内容一样，在点菜单的那一刻就开始写剪贴板。提示总会显示（减少通知时也显示）。
 */
export function copyAnnotations() {
  let failed: Error | null = null;
  let count = 0;
  const text = (async () => {
    const answer = await command('annotations', { action: 'copy' }, 30000);
    if (!answer.ok) throw new Error(answer.reason === 'offline' ? t('没有连上本地服务') : t('没有读到批注'));
    const data = answer.data as CopyData;
    count = data.items.length;
    return annotationsMarkdown(data, words());
  })().catch((error: Error) => { failed = error; throw error; });
  const written = typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write
    ? navigator.clipboard.write([new ClipboardItem({ 'text/plain': text.then(value => new Blob([value], { type: 'text/plain' })) })])
    : text.then(value => navigator.clipboard.writeText(value));
  written.then(
    () => toast(count === 1 ? t('已复制 1 条批注') : t('已复制 {0} 条批注', count)),
    (error: Error) => toast(t('没有复制：{0}', (failed ?? error).message), { tone: 'error', duration: 5000 }),
  );
}

/** 撤销全部删除：按那份报告的 slug 交给 dev:local（换了文档也放回原来那份）；打开着的正是它，就让它重读 */
async function restoreAnnotations(slug: string, items: unknown[]) {
  // 别处的底稿：放回它所在工作区的 annotations.json（同一服务按所有者前缀处理；slug 是条目 ~ws/<slug>）
  const draft = draftParts(slug);
  if (draft) {
    try {
      await restoreAnnotationsDraft(draft.ws, draft.slug, items);
    } catch { toast(t('没有恢复批注'), { tone: 'error' }); return; }
    if (sessionStore.get().slug === slug && can('annotate')) void command('annotate', { refresh: true });
    return;
  }
  const post = async (fresh: boolean) => {
    const token = await editToken(fresh).catch(() => '');
    const response = await fetch('/__gallery/edit/annotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Gallery-Token': token },
      body: JSON.stringify({ slug, restore: items }),
    }).catch(() => null);
    return (await response?.json().catch(() => null)) ?? { ok: false, reason: 'offline' };
  };
  let answer = await post(false);
  if (!answer.ok && answer.reason === 'token') answer = await post(true); // 服务器换了令牌：重新取一次
  if (!answer.ok) { toast(t('没有恢复批注'), { tone: 'error' }); return; }
  if (sessionStore.get().slug === slug && can('annotate')) void command('annotate', { refresh: true });
}

/** 批注删掉了：提示说几条，里面带撤销（不弹确认框）；提示总会显示（它带着撤销） */
export function offerAnnotations(slug: string | null, removed: unknown[]) {
  toast(removed.length === 1 ? t('已删除 1 条批注') : t('已删除 {0} 条批注', removed.length), {
    action: t('撤销'),
    duration: 6000,
    onAction: () => { if (slug) void restoreAnnotations(slug, removed); },
  });
}

/**
 * 删除已处理：Agent 处理过（gallery notes done）的那些，其余不动（报告页先存好还在打的字）；和全部删除一样提示，里面带撤销。
 * 没有已处理的时候菜单里这一行是灰的，这里不会被调用。
 */
export async function deleteDoneAnnotations() {
  const slug = sessionStore.get().slug;
  const answer = await command('annotations', { action: 'clearDone' });
  if (!answer.ok) { toast(t('没有删除批注'), { tone: 'error' }); return; }
  offerAnnotations(draftParts(slug ?? '') ? slug : (answer.slug as string | undefined) ?? slug, (answer.removed as unknown[]) ?? []);
}

/** 全部删除：这一页的全部批注（报告页先存好还在打的字） */
export async function deleteAnnotations() {
  const slug = sessionStore.get().slug;
  const answer = await command('annotations', { action: 'clear' });
  if (!answer.ok) { toast(t('没有删除批注'), { tone: 'error' }); return; }
  // 别处的底稿的页面答的是它在自己工作区里的 slug；撤销要的是条目（~ws/<slug>），打开着的会话的 slug
  offerAnnotations(draftParts(slug ?? '') ? slug : (answer.slug as string | undefined) ?? slug, (answer.removed as unknown[]) ?? []);
}
