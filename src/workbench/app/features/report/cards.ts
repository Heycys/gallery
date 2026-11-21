import { pushLayer } from '../../lib/layers';
import { command, sessionStore } from '../../session/sessionStore';

/**
 * 报告页里开着详情卡片时（会话里的 card），工作台自己的侧栏和顶栏也是卡片的背景：弹窗的遮罩盖住整个应用；
 * 卡片也和组件列表、写作偏好一样站在整个窗口的正中，不是报告区的正中（报告页按 iframe 在窗口里的位置自己放：
 * editor/page/session.mjs 的 centreCards，报告区不够大时尽量靠近窗口正中，不出 iframe）。
 * 卡片的背景只盖得住 iframe，工作台再铺一层 `.card-underlay`：盖满整个窗口，不挖洞，报告区（.report-view）这时抬到它上面
 * （body.card-open，report.css）。报告区里是卡片自己的背景，报告页把滚动条那一条也让给了它（套件的 dialogs.js），
 * 所以两层不在同一条边上拼接：以前 underlay 在报告区挖洞（clip-path），屏幕缩放 125% 这类时洞的边缘落在半个像素上，
 * 侧栏贴着报告区的那一列只盖了一半，看着像一条亮线（用户 2026-11-13）。颜色、淡入和卡片的背景相同，即设置弹窗的 --overlay，随主题：
 * - 侧栏、顶栏一样变暗，指针在上面不触发它们的悬停（面包屑的列表、提示、侧栏浮出）；伸进报告区的侧栏拉宽条和
 *   收起时左边的浮出条这时不接指针（body.card-open），那里是卡片的背景；
 * - 在它上面按下主键，和在卡片的背景上按下一样：最上面那张卡片关上（会话命令 close-card），这一下不做别的
 *   （接着来的 click 也吞掉：卡片关上后遮罩就移走了，松开时指针下面可能已经是按钮）；
 * - 焦点在工作台时按 Esc 也关上它：卡片开着时工作台的浮层栈里有它一层，在它之后打开的浮层先关；
 * - 关上时它自己淡出，和报告页里的卡片和背景同时、同样快（套件的 dialog.css：140ms，同一条马上动起来的曲线），
 *   不在一帧里亮回来；淡完之前报告区一直在它上面（body.card-open 留到淡完），报告区里只有卡片自己的背景在淡，
 *   不被它再盖一层（2026-11-17：用工作台对话框的 .dim-after 时，它压在报告区上，关上的头一帧卡片反而变暗）。
 *   淡的时候不接指针；没淡完又开了一张，就从这时的深浅淡回来。减少动态效果时照样淡（淡入淡出不算动，和工作台的对话框、套件的卡片一样）。
 * - 淡入、淡出都从卡片自己的淡入、淡出开始的那一刻算起：页面一开、一关就说（card），等浏览器真正开始卡片的淡入淡出后再说一次
 *   那一刻（cardAt），这一块的淡入、淡出就把开始时刻挪到那时（since）。卡片头一帧要画的东西多，浏览器画出那一帧才开始淡，
 *   以前这一块从听到的那一刻起淡，晚了四五十毫秒，报告区已经暗了七成，侧栏和顶栏才开始暗，关上时也晚一截，
 *   暗下去、亮回来都分成两步（2026-11-17）。现在两边同一条曲线、同一刻起步。
 * 返回停止的函数。
 */
export function watchCards(): () => void {
  let shown: (() => void) | null = null;
  // 开着的那一块
  let current: HTMLElement | null = null;
  // 上一次对齐到的 cardAt
  let aligned: number | undefined;
  // 正在淡出的那一块，和它的淡出
  let leaving: { underlay: HTMLElement; fade: Animation } | null = null;

  const close = () => void command('close-card');

  function show() {
    let underlay: HTMLElement;
    if (leaving) {
      underlay = leaving.underlay;
      const from = getComputedStyle(underlay).opacity;
      leaving.fade.cancel();
      leaving = null;
      underlay.style.pointerEvents = '';
      underlay.animate([{ opacity: from }, { opacity: 1 }], { duration: OPEN_MS, easing: EASE });
    } else {
      underlay = document.createElement('div');
      underlay.className = 'card-underlay';
      underlay.setAttribute('aria-hidden', 'true');
      document.body.append(underlay);
    }
    current = underlay;
    document.body.classList.add('card-open');

    const press = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      swallowClick();
      close();
    };
    underlay.addEventListener('pointerdown', press);
    const unlayer = pushLayer(close);

    shown = () => {
      unlayer();
      underlay.removeEventListener('pointerdown', press);
      current = null;
      leave(underlay);
    };
  }

  /** 卡片关上了：这一块淡出后拿走；那时没有新开的卡片，报告区才放回原来的层次 */
  function leave(underlay: HTMLElement) {
    const gone = () => {
      underlay.remove();
      if (!shown) document.body.classList.remove('card-open');
    };
    if (typeof underlay.animate !== 'function') { gone(); return; }
    const from = getComputedStyle(underlay).opacity; // 淡入还没完就关上：从这时的深浅淡出
    for (const running of underlay.getAnimations()) running.cancel();
    underlay.style.pointerEvents = 'none';
    const fade = underlay.animate([{ opacity: from }, { opacity: 0 }], { duration: CLOSE_MS, easing: EASE, fill: 'forwards' });
    leaving = { underlay, fade };
    const end = () => {
      if (leaving?.fade !== fade) return; // 又开了一张，淡回来了
      leaving = null;
      gone();
    };
    fade.finished.then(end, () => { /* 取消了：又开了一张 */ });
    window.setTimeout(end, CLOSE_MS + 160); // 页面在后台时动画的帧不走，到时间也拿走
  }

  /** 马上拿走正在淡出的那一块（停止监听时） */
  function drop() {
    if (!leaving) return;
    const { underlay, fade } = leaving;
    leaving = null;
    fade.cancel();
    underlay.remove();
    if (!shown) document.body.classList.remove('card-open');
  }

  const hide = () => {
    const was = shown;
    shown = null;
    was?.();
  };

  const sync = () => {
    const s = sessionStore.get();
    const open = s.connected && Boolean(s.card);
    if (open && !shown) show();
    else if (!open && shown) hide();
    // 页面说卡片的淡入、淡出从什么时候开始的：这一块正在走的淡入（report.css 的 card-underlay-fade，或淡回来的那一段）、淡出从那时算起
    if (s.connected && typeof s.cardAt === 'number' && s.cardAt !== aligned) {
      aligned = s.cardAt;
      const underlay = shown ? current : leaving?.underlay;
      for (const running of underlay?.getAnimations() ?? []) since(running, s.cardAt);
    }
  };
  const unsubscribe = sessionStore.subscribe(sync);
  sync();
  return () => {
    unsubscribe();
    hide();
    drop();
  };
}

/** 卡片和它的背景在报告页里淡入、淡出的时长和曲线（套件的 dialog.css，--doc-ease-out；report.css 的 card-underlay-fade 同样） */
const OPEN_MS = 180;
const CLOSE_MS = 140;
const EASE = 'cubic-bezier(.23, 1, .32, 1)';

/**
 * 让 animation 从页面说的那一刻（at：从纪元起的毫秒，页面的 performance.timeOrigin 加上卡片淡入、淡出的开始时刻）算起：
 * 开始时刻挪回那时，已经走过的那一段不再走。说的是将来（不会有：同一台机器的钟），或者比走完一整段还早一秒以上（说得太晚），就不动它。
 */
function since(animation: Animation, at?: number) {
  if (typeof at !== 'number' || !Number.isFinite(at)) return;
  const now = performance.now();
  const start = at - performance.timeOrigin;
  const length = Number(animation.effect?.getComputedTiming().duration) || 0;
  if (!(start <= now) || now - start > length + 1000) return;
  animation.startTime = start;
}

/** 吞掉这次按下接着来的 click；下一次按下时不再等它 */
function swallowClick() {
  const stop = (event: Event) => {
    event.preventDefault();
    event.stopPropagation();
    done();
  };
  const done = () => {
    window.removeEventListener('click', stop, true);
    window.removeEventListener('pointerdown', done, true);
  };
  window.addEventListener('click', stop, true);
  window.addEventListener('pointerdown', done, true); // 这次按下的派发中加上的，听不到这次按下本身
}
