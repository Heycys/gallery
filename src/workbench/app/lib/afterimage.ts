import { useLayoutEffect, type RefObject } from 'react';

/**
 * 关上的东西淡出去（2026-11-17 定的：菜单只淡出 90ms，对话框和它的暗色一起淡出 140ms）。
 * 东西本身照旧马上卸下：状态、焦点、Esc 的下一层都在关的那一刻就变了，
 * 查菜单、对话框的选择器也马上找不到它。留下的只是它的一份样子（afterimage）：放在一个影子树里（document 里查 .menu-item、
 * .dialog 都查不到它），不接指针、读屏不读、键盘走不到（inert），从关上时的样子淡到透明后移除。
 * 影子树里没有工作台的样式表：用页面上已有的样式表拼一张（adoptedStyleSheets；样式表变了才重拼），颜色的变量从外面继承进来。
 * 里面的 iframe（写作偏好、历史版本里的页面）复制过去会重新载入：换成一块它自己底色的空白。
 */
let sheet: CSSStyleSheet | null = null;
let sheetKey = '';
// 影子树里的东西一律不接指针（样式表里有些控件自己给了 pointer-events），也不再播放自己的出场动画、过渡
const QUIET = (() => {
  try {
    const quiet = new CSSStyleSheet();
    quiet.replaceSync('* { pointer-events: none !important; animation: none !important; transition: none !important; }');
    return quiet;
  } catch { return null; }
})();

function pageSheet(): CSSStyleSheet | null {
  try {
    const list = [...document.styleSheets];
    const count = (s: CSSStyleSheet) => { try { return s.cssRules.length; } catch { return -1; } };
    const key = list.map(count).join(',');
    if (sheet && key === sheetKey) return sheet;
    const text = list.map(s => { try { return [...s.cssRules].map(rule => rule.cssText).join('\n'); } catch { return ''; } }).join('\n');
    const next = new CSSStyleSheet();
    next.replaceSync(text);
    sheet = next;
    sheetKey = key;
    return sheet;
  } catch {
    return null;
  }
}

/** 对话框、菜单淡出的时长（tokens.css 的 --dialogOut、--menuOut） */
export const DIALOG_OUT = 140;
export const MENU_OUT = 90;
/** 淡出的曲线：菜单 ease-out（编辑器 ui.mjs、套件 choice.css 的离开也是）；
 *  对话框和它的暗色用一开始就动的那条（--easeOut，套件的详情卡片 dialog.css 也是） */
const MENU_EASE = 'ease-out';
const DIALOG_EASE = 'cubic-bezier(.23,1,.32,1)';

/**
 * el（还在页面上，马上要卸下）的样子淡出 ms 毫秒后移除（easing：默认菜单的 ease-out），从它那一刻的不透明度开始（正在淡入的菜单）。
 * 减少动态效果时照样淡（淡出不算动）。background：把它的底色钉在复制品上
 */
export function ghostOut(el: HTMLElement | null, ms: number, { background, easing = MENU_EASE }: { background?: boolean; easing?: string } = {}) {
  if (!el?.isConnected || typeof el.attachShadow !== 'function') return;
  const styles = pageSheet();
  if (!styles) return;
  const look = getComputedStyle(el);
  const from = Number(look.opacity) || 0;
  if (from < 0.02) return;
  const host = document.createElement('div');
  host.className = 'afterimage';
  host.setAttribute('aria-hidden', 'true');
  host.inert = true;
  host.style.zIndex = look.zIndex === 'auto' ? '1000' : look.zIndex;
  const root = host.attachShadow({ mode: 'closed' });
  root.adoptedStyleSheets = QUIET ? [styles, QUIET] : [styles];
  const copy = el.cloneNode(true) as HTMLElement;
  // 量出来的样子钉在复制品上：它的样式有的看外面（body:has(...) 下嵌在别的对话框上的遮罩更淡、正在淡入的暗色），影子树里看不到
  if (background) copy.style.backgroundColor = look.backgroundColor;
  copy.style.left = look.left;
  copy.style.top = look.top;
  for (const frame of copy.querySelectorAll('iframe')) {
    const blank = document.createElement('div');
    blank.className = frame.className;
    blank.removeAttribute('data-pending');
    blank.style.background = 'var(--pageBac)';
    frame.replaceWith(blank);
  }
  // 原来滚到哪里，复制品也滚到哪里（菜单、搜索结果、组件列表的列表）
  const scrolled = [...el.querySelectorAll<HTMLElement>('*')].filter(node => node.scrollTop || node.scrollLeft).map(node => [node, node.scrollTop, node.scrollLeft] as const);
  root.append(copy);
  document.body.append(host);
  if (el.scrollTop) copy.scrollTop = el.scrollTop;
  for (const [node, top, left] of scrolled) {
    const path = pathOf(node, el);
    const twin = path && follow(copy, path);
    if (twin) { twin.scrollTop = top; twin.scrollLeft = left; }
  }
  const done = () => host.remove();
  try {
    const run = copy.animate([{ opacity: from }, { opacity: 0 }], { duration: ms, easing, fill: 'forwards' });
    run.finished.then(done, done);
  } catch { done(); return; }
  window.setTimeout(done, ms + 200);
}

const pathOf = (node: Element, root: Element) => {
  const path: number[] = [];
  for (let at: Element | null = node; at && at !== root; at = at.parentElement) {
    const parent: Element | null = at.parentElement;
    if (!parent) return null;
    path.unshift([...parent.children].indexOf(at));
  }
  return path;
};
const follow = (root: Element, path: number[]) => path.reduce<Element | undefined>((at, index) => at?.children[index], root) as HTMLElement | undefined;

/**
 * 对话框关上时，它和后面的暗色一起淡出（140ms，一开始就动的曲线）。overlay 是暗色那一层（对话框在它里面），
 * 它的颜色钉在复制品上（嵌在别的对话框上的那一层更淡，正在淡入的是那一刻的颜色）
 */
export function fadeOutDim(overlay: HTMLElement | null) {
  ghostOut(overlay, DIALOG_OUT, { background: true, easing: DIALOG_EASE });
}

/**
 * 给对话框的遮罩（ref）用：它卸下时连同里面的对话框一起淡出。用 useLayoutEffect：卸下时它的清理在遮罩从页面上拿走之前跑，
 * 还读得到它的样子
 */
export function useDimFadesOut(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const overlay = ref.current;
    // React 开发时把刚挂上的效果先撤一次：那一下不算（还没过一帧，什么也没画出来）
    let shown = false;
    const frame = requestAnimationFrame(() => { shown = true; });
    return () => {
      cancelAnimationFrame(frame);
      if (shown) fadeOutDim(overlay);
    };
  }, []);
}
