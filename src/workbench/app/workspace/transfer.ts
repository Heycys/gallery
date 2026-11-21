import { draftCommand, editToken } from './api';
import { projectBase } from "../../../shared/workspace-address.mjs";
import { draftParts } from './store';
import { language, t, told } from '../../../shared/i18n/index.mjs';

/**
 * 导入、导出接口：dev:local 的 /__gallery/transfer/*（src/transfer/service.mjs，规格见 docs/workbench.md「Import and export」）。
 * 和工作区接口一样带令牌、校验 Host、Origin；出错时抛出服务器给的说明，用界面的语言（told）。
 */

export type ExportFormat = 'pdf' | 'html' | 'markdown';
export type ExportContent = 'everything' | 'no_files';
export type Paper = 'A4' | 'A3' | 'Letter' | 'Legal' | 'Tabloid';
export interface ExportOptions { format: ExportFormat; content: ExportContent; subpages: boolean; folders: boolean; paper: Paper; scale: number }

const offline = () => new Error(t('没有连上 Gallery 的本地服务：运行 gallery open 启动它。'));

// 带令牌请求同一个服务；draft 为注册的文档存储目录 ID，路径前缀选择其导入、导出运行时。
// 令牌失效时刷新后重试一次。markdown 和 import 复用 draftCommand。
async function send(name: string, init: RequestInit & { query?: Record<string, string> }, draft?: string): Promise<Response> {
  const url = `${draft ? projectBase(draft) : ''}/__gallery/transfer/${name}${init.query ? `?${new URLSearchParams(init.query)}` : ''}`;
  for (const fresh of [false, true]) {
    const token = await editToken(fresh);
    const response = await fetch(url, { ...init, headers: { ...init.headers, 'X-Gallery-Token': token } }).catch(() => { throw offline(); });
    if (response.status === 403 && !fresh) {
      const body = await response.clone().json().catch(() => null);
      if (body?.reason === 'token') continue;
    }
    return response;
  }
  throw offline();
}

/** 出错的回答：服务器的说明，用界面的语言（told；例如 check：导出前的检查没有通过，哪一页、第一处、共几处），reason 带着 */
async function failure(response: Response): Promise<Error & { reason?: string }> {
  const body = await response.json().catch(() => null);
  return Object.assign(new Error(told(body) ?? t('操作没有成功（HTTP {0}）', response.status)), { reason: body?.reason as string | undefined });
}

/** 导出：服务器做好的文件（单页 PDF 是 PDF 本身，其余是 zip）和它的文件名 */
export async function exportFile(slug: string, options: ExportOptions): Promise<{ name: string; blob: Blob }> {
  // 回答是文件本身（出错时才是 JSON），所以不走 api.ts 的 post()
  const draft = draftParts(slug);
  const response = await send('export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft ? { ws: draft.ws, slug: draft.slug, options } : { slug, options }) }, draft?.ws);
  if (!response.ok) throw await failure(response);
  const name = decodeURIComponent(response.headers.get('X-File-Name') ?? 'Export.zip');
  return { name, blob: await response.blob() };
}

/** 整页的 Markdown（复制页面内容）：用保存过的源文件转换，图片、文件链接到本地服务的地址 */
export async function pageMarkdown(slug: string): Promise<string> {
  const draft = draftParts(slug);
  if (draft) return (await draftCommand<{ text: string }>(draft.ws, 'markdown', { slug: draft.slug })).text;
  const response = await send('markdown', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug }) });
  if (!response.ok) throw await failure(response);
  return (await response.json()).text as string;
}

/**
 * 写作偏好那一页和 <home>/preferences/<name>.md（Agent 读的那份），以文件为准，只有点「保存」才写文件。
 * opening（对话框要打开时）：按文件重做页面（文件刚按默认的写作偏好建好、被人改过，或者页面上有没保存的修改，
 * 颜色这类 Markdown 记不下的也算），文件原样不动；两边自上次对齐（保存，或按文件重做）后都没变，或页面没变、
 * 两边说的一样时不动。不带 opening（点「保存」）：把页面写成这份 Markdown，两边说的一样时文件不动。
 * unshown：文件里页面显示不了的那些行（注释、指向本机文件的链接……），保存时会去掉。
 */
export async function writePreferences({ opening = false, preference, slug }: { opening?: boolean; preference?: string; slug?: string } = {}): Promise<{ path: string; remade: boolean; unshown: string[]; preference?: string }> {
  const response = await send('preferences', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ opening, preference, slug }) });
  if (!response.ok) throw await failure(response);
  const body = await response.json();
  return { path: body.path as string, remade: body.remade === true, unshown: Array.isArray(body.unshown) ? body.unshown as string[] : [], preference: body.preference };
}

/** 上传一个要导入的文件（原样作为请求体，最大 5GB），返回它在服务器上的编号；draft：导入到别处的底稿所在的工作区，由它自己的服务收下 */
export async function uploadFile(file: File, draft?: string): Promise<string> {
  const response = await send('upload', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: file, query: { name: file.name, ...(draft ? { ws: draft } : {}) } }, draft);
  if (!response.ok) throw await failure(response);
  return (await response.json()).id as string;
}

/** 把上传好的文件导入成页面，放在 parent（空串：顶层）下面；missing：页面链接了、却没找到的图片（按页面里写的地址）。
 * 页面的说明（导入自哪个文件）用界面的语言，界面是英文时没写 lang 的页面也是 en */
export async function importUploads(uploads: string[], parent: string): Promise<{ pages: number; reports: string[]; skipped: string[]; missing?: string[]; inert?: number }> {
  // 导入到别处的底稿下面：它所在工作区的服务做成文档，回答里的 reports 是它们的条目（~ws/<slug>，draft-import 放进这里的文档树）
  const draft = draftParts(parent);
    if (draft) {
    const answer = await draftCommand<{ pages: number; reports: string[]; skipped: string[]; missing?: string[] }>(draft.ws, 'import', { uploads, parent: draft.slug, from: t('导入自 {0}'), language });
    return { ...answer, reports: answer.reports.map(slug => `~${draft.ws}/${slug}`) };
  }
  const response = await send('import', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uploads, parent, from: t('导入自 {0}'), language }) });
  if (!response.ok) throw await failure(response);
  return response.json();
}
