import { useEffect, useRef } from 'react';
import { clamp } from '../lib/util';

/** 停多久才出来（毫秒）：150，和报告页的提示（editor/page/tooltip.mjs）一样 */
const DELAY = 150;
/** 一个提示走开后这么久（毫秒）里，指针进到下一个按钮，它的提示马上出来、不淡入（沿着一排按钮读下去） */
const WARM = 300;

/**
 * 全局提示：给任意元素加 data-tip（主文案）/ data-sub（第二行，通常是快捷键）即可。
 * data-tip-pos="cursor" 时跟随鼠标（用于很高的元素，比如侧栏拖拽手柄）。
 * data-tip-delay 是停多久（毫秒）才显示，默认 150：侧栏栏名上的路径停约 1 秒才出来（docs/workbench.md「Columns」），热着的时候也一样等。
 * data-tip-cut：被截断的字（侧栏条目的标题、面包屑……）：只有真的放不下（scrollWidth 比 clientWidth 宽）时才提示，提示的是它的全文。
 * 菜单（.menu、面包屑的页面浮层）里的提示站在菜单卡片的右边、和那一行的顶对齐（右边放不下就到左边），不盖住下面几行；那一行自己的子菜单开着时不提示。
 * 走开、按下、滚动（任何滚动容器，捕获阶段）、滚轮、按键、窗口失去焦点、页面被切走时马上收起；按下之后指针没动，下面换成了别的按钮（侧栏收起、展开，新加的标签），也不提示，等指针真的动了、进到下一个按钮再说。
 * 一个提示走开后 300ms 里进到下一个按钮：马上出来、不淡入（.instant）。
 */
export function TooltipHost() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tip = ref.current!;
    let timer = 0;
    let watch = 0;
    let target: HTMLElement | null = null;
    let armed = false;
    let shown = false;
    let pointer = { x: 0, y: 0 };
    /** 按下时指针在哪：指针没离开这一点之前，换到它下面的按钮不提示 */
    let pressed: { x: number; y: number } | null = null;
    let warmUntil = 0;

    const quiet = () => {
      clearTimeout(timer);
      clearInterval(watch);
      tip.classList.remove('show', 'instant');
      armed = false;
      shown = false;
    };
    /** 指针离开了它（进到别的元素）：出过的提示让下一个热着，没等到的不 */
    const leave = () => {
      if (shown) warmUntil = performance.now() + WARM;
      else if (armed) warmUntil = 0;
      quiet();
    };
    /** 按下、滚动、按键、失去焦点：收起，也不再热着 */
    const cancel = () => { quiet(); warmUntil = 0; };
    const busy = () => document.body.classList.contains('dragging') || document.body.classList.contains('resizing') || document.body.classList.contains('box-selecting');
    const under = (t: HTMLElement) => {
      const r = t.getBoundingClientRect();
      return pointer.x >= r.left - 1 && pointer.x <= r.right + 1 && pointer.y >= r.top - 1 && pointer.y <= r.bottom + 1;
    };
    // 说什么：data-tip；被截断的字是它的全文，没截断就不提示
    const wordsOf = (t: HTMLElement) => {
      if (t.dataset.tip !== undefined) return t.dataset.tip;
      return t.scrollWidth > t.clientWidth + 1 ? (t.textContent ?? '').trim() : '';
    };

    const show = (t: HTMLElement, instant: boolean) => {
      const words = t.isConnected && !busy() && under(t) ? wordsOf(t) : '';
      if (!words) { armed = false; return; }
      let x: number, y: number;
      const card = t.closest<HTMLElement>('.menu, .crumb-pop');
      const row = card ? t.closest<HTMLElement>('.menu-item, .crumb-pop-item, .project-row, .trash-item') ?? t : null;
      if (row && (row.getAttribute('aria-expanded') === 'true' || row.classList.contains('open'))) { armed = false; return; } // 它的子菜单开着
      tip.replaceChildren();
      const main = document.createElement('div');
      main.textContent = words;
      tip.appendChild(main);
      if (t.dataset.sub) {
        const sub = document.createElement('div');
        sub.className = 'sub';
        sub.textContent = t.dataset.sub;
        tip.appendChild(sub);
      }
      const tw = tip.offsetWidth, th = tip.offsetHeight;
      if (t.dataset.tipPos === 'cursor') { x = pointer.x + 12; y = pointer.y + 14; }
      else if (card && row) {
        const m = card.getBoundingClientRect();
        x = m.right + 6;
        if (x + tw > innerWidth - 8) x = m.left - tw - 6;
        y = row.getBoundingClientRect().top;
      } else {
        const r = t.getBoundingClientRect();
        if (t.closest('.crumb') && document.querySelector('.crumb-pop')) {
          // 面包屑下面是它的页面浮层：站在它右边
          x = r.right + 6;
          y = r.top + (r.height - th) / 2;
        } else {
          x = r.left + r.width / 2 - tw / 2;
          y = r.bottom + 6;
          if (y + th > innerHeight - 8) y = r.top - th - 6;
        }
      }
      tip.style.transform = `translate(${clamp(x, 8, innerWidth - tw - 8)}px, ${clamp(y, 8, innerHeight - th - 8)}px)`;
      tip.classList.toggle('instant', instant);
      tip.classList.add('show');
      shown = true;
      // 它不在了、挪开了（指针没动，下面的东西变了）：收起
      watch = window.setInterval(() => { if (!t.isConnected || !under(t)) quiet(); }, 150);
    };

    const onOver = (e: MouseEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
      if (pressed && (pressed.x !== e.clientX || pressed.y !== e.clientY)) pressed = null;
      const t = (e.target as Element).closest<HTMLElement>('[data-tip], [data-tip-cut]');
      if (t === target) return;
      leave();
      target = t;
      if (!t || pressed || !wordsOf(t)) return;
      const own = Number(t.dataset.tipDelay);
      armed = true;
      if (!own && performance.now() < warmUntil) show(t, true);
      else timer = window.setTimeout(() => show(t, false), own || DELAY);
    };
    const onMove = (e: MouseEvent) => {
      pointer = { x: e.clientX, y: e.clientY };
      if (pressed && (pressed.x !== e.clientX || pressed.y !== e.clientY)) pressed = null;
    };
    // 按下：收起；还停在按下的那个上面时不再出来，进到下一个才出来
    const onDown = (e: PointerEvent) => { cancel(); pressed = { x: e.clientX, y: e.clientY }; };
    const away = () => { cancel(); target = null; };
    const hidden = () => { if (document.hidden) away(); };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mousemove', onMove, { passive: true });
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('keydown', cancel, true);
    document.addEventListener('scroll', cancel, true);
    document.addEventListener('wheel', cancel, { capture: true, passive: true });
    document.addEventListener('visibilitychange', hidden);
    document.documentElement.addEventListener('mouseleave', away);
    window.addEventListener('blur', away);
    return () => {
      quiet();
      window.removeEventListener('blur', away);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('keydown', cancel, true);
      document.removeEventListener('scroll', cancel, true);
      document.removeEventListener('wheel', cancel, true);
      document.removeEventListener('visibilitychange', hidden);
      document.documentElement.removeEventListener('mouseleave', away);
    };
  }, []);

  return <div className="tip" ref={ref} />;
}
