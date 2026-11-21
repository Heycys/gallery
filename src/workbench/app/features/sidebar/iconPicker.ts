import { closePopover } from '../../components/Popover';
import { toast } from '../../components/Toast';
import { createStore, useStore } from '../../lib/store';
import { holdPeek } from '../../state/sidebar';
import { themeOf, themeStore } from '../../state/theme';
import { editToken } from '../../workspace/api';
import { ICON_PICKER, ICON_PICKER_ROUTE } from '../../../../shared/icon-picker.mjs';
import { t } from '../../../../shared/i18n/index.mjs';

/**
 * 侧栏条目的图标选择器（docs/workbench.md「The sidebar」**Row icons**，协议在 src/shared/icon-picker.mjs）：就是文档页眉上点图标打开的那个
 * （编辑器的 emoji-picker：表情符号 / 图标 / 上传），放在它自己的 iframe 里（GET /__gallery/edit/icon-picker，编辑器的 icon-frame.mjs），
 * 工作台不画第二个。框第一次用时建好，以后一直留着（关着时完全透明、不接指针；不用 visibility，那样焦点进不去），打开时铺满整个窗口、
 * 透明（框里的 color-scheme 跟着工作台的浅色 / 深色：两边不同时浏览器会给框画上不透明的底，所以等框说 shown 才显出来）：选择器在窗口里照它自己的规则摆在
 * 条目的图标下面（放不下就翻到上面），在它外面按一下就关上（和页面上一样，这一下不落到下面的工作台）。焦点进到框里，Esc 关上后回到那个图标。
 * 选好的值交给 onPick（commands.ts changeIcon 写进文件）；「随机」每按一下都交一次，选择器不关。开着的时候浮动的侧栏不收回去（holdPeek）。
 */

/** 正在给哪一行选图标（行的 ownerKey），行据此保持悬停的样子 */
const pickerStore = createStore<{ owner: string | null }>({ owner: null });
export const useIconPicking = (owner: string) => useStore(pickerStore, s => s.owner === owner);

interface Request {
  /** 行的图标按钮：选择器摆在它下面，关上后焦点回到它 */
  anchor: HTMLElement;
  /** 哪一行（行的 ownerKey） */
  owner: string;
  /** 现在的图标，没有时 null */
  value: string | null;
  /** 能不能用图片：这个工作区自己的文档（上传、自定义表情放进它的文件夹）；自定义页、网页链接、别处的底稿不能 */
  pictures: boolean;
  /** 能用图片时，那份文档的 slug */
  slug?: string;
  onPick: (value: string | null) => void;
}

let frame: HTMLIFrameElement | null = null;
let loaded: Promise<void> | null = null;
let markLoaded: (() => void) | null = null;
let current: (Request & { id: number; release: () => void }) | null = null;
let serial = 0;

function ensureFrame(): Promise<void> {
  if (frame?.isConnected && loaded) return loaded;
  loaded = new Promise(resolve => { markLoaded = resolve; });
  frame = document.createElement('iframe');
  frame.className = 'icon-picker-frame';
  frame.title = t('图标');
  frame.src = ICON_PICKER_ROUTE;
  document.body.appendChild(frame);
  return loaded;
}

addEventListener('message', event => {
  const message = event.data;
  if (!frame || event.source !== frame.contentWindow || event.origin !== location.origin || message?.protocol !== ICON_PICKER) return;
  if (message.type === 'ready') markLoaded?.();
  else if (message.type === 'notice' && typeof message.text === 'string') toast(message.text, { tone: 'error' });
  else if (message.type === 'shown' && current?.id === message.id) frame.classList.add('open');
  else if (message.type === 'pick' && current?.id === message.id) current?.onPick(typeof message.value === 'string' ? message.value : null);
  else if (message.type === 'closed' && current?.id === message.id) finish(true);
});

// 收起：框看不见、不接指针；焦点回到那一行（它还在时：图标本身不能聚焦，就是它所在的那一行，菜单打开它之前焦点在哪也是那一行），
// 总之离开框，不留在看不见的框里（否则工作台的快捷键就收不到了）
function finish(refocus: boolean) {
  const was = current;
  current = null;
  frame?.classList.remove('open');
  pickerStore.set({ owner: null });
  if (!was) return;
  was.release();
  if (!refocus) return;
  const target = was.anchor.isConnected ? was.anchor.closest<HTMLElement>('button, [tabindex], a[href]') : null;
  if (target) target.focus({ preventScroll: true });
  else if (document.activeElement === frame) frame?.blur();
}

/** 打开图标选择器（同一行的又点了一下，由框里「在外面按一下」先关上，不会走到这里） */
export async function openIconPicker(request: Request) {
  if (current) {
    frame?.contentWindow?.postMessage({ protocol: ICON_PICKER, type: 'close', id: current.id }, location.origin);
    finish(false);
  }
  closePopover();
  const id = ++serial;
  current = { ...request, id, release: holdPeek() };
  pickerStore.set({ owner: request.owner });
  // 框 10 秒还没好（连不上本地服务）：不等了，说一声，下次重新建
  const ready = Promise.race([ensureFrame().then(() => true), new Promise<boolean>(resolve => setTimeout(() => resolve(false), 10000))]);
  const [token, loadedNow] = await Promise.all([request.pictures ? editToken().catch(() => '') : Promise.resolve(''), ready]);
  if (!loadedNow) {
    frame?.remove();
    frame = null;
    loaded = null;
    if (current?.id === id) { finish(false); toast(t('图标选择器没有打开'), { tone: 'error' }); }
    return;
  }
  if (current?.id !== id || !frame?.contentWindow) return;
  if (!request.anchor.isConnected) { finish(false); return; }
  const box = request.anchor.getBoundingClientRect();
  frame.focus();
  frame.contentWindow.postMessage({
    protocol: ICON_PICKER, type: 'open', id,
    origin: { left: box.left, top: box.top, right: box.right, bottom: box.bottom, width: box.width, height: box.height },
    value: request.value, theme: themeOf(themeStore.get()), pictures: request.pictures, slug: request.slug ?? null, token,
  }, location.origin);
}
