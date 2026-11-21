import { useEffect, useState } from 'react';

/**
 * 报告区 iframe 的左边是侧栏的宽度，上边是顶栏的高度。屏幕缩放 125%、225% 这类时，270px 宽的侧栏落在半个物理像素上，
 * iframe 的边也在半个像素上：iframe 里页面的底色把那一整列画满，详情卡片的背景却只盖住半列，卡片开着时侧栏边上
 * 就是一条亮线（用户 2026-11-13；遮罩怎么叠都去不掉，features/report/cards.ts）。所以这两个尺寸取到离它最近的
 * 整物理像素上，而且那个值的 CSS 像素能被布局精确表示（Chrome 的布局精确到 1/64 CSS 像素：125% 下 270.4 表示不了，
 * 线还在；272 可以）。最多挪 `reach` 个 CSS 像素，找不到就不动（110% 这类缩放，近处没有这样的值）。
 */
export function devicePx(css: number, ratio = window.devicePixelRatio || 1, reach = 6): number {
  const near = Math.round(css * ratio);
  for (let step = 0; step / ratio <= reach + 1; step++) {
    for (const pixels of step ? [near - step, near + step] : [near]) {
      const value = pixels / ratio;
      const units = value * 64;
      if (Math.abs(value - css) <= reach && Math.abs(units - Math.round(units)) < 1e-3) return Math.round(units) / 64;
    }
  }
  return css;
}

/**
 * 一条细线的粗细（CSS 像素）：占满整物理像素，1x、1.25x、1.5x、1.75x 是 1 个物理像素，2x、2.25x 是 2 个。1px 的线在 125% 下是 1.25 个物理像素，
 * 多出来的那一点画成线旁边一行淡淡的毛边（顶栏滚动后的线，2026-11-17 复核量到）；线的边落在整物理像素上（例如贴着 --topbar-h 的底）时，
 * 用这个粗细就是一条干净的线，颜色还是原来的
 */
export function hairline(ratio = window.devicePixelRatio || 1): number {
  return Math.max(1, Math.floor(ratio + 1e-6)) / ratio;
}

/** 现在的 devicePixelRatio，屏幕缩放（浏览器缩放、换到另一块屏）变了就跟着变 */
export function usePixelRatio(): number {
  const [ratio, setRatio] = useState(() => window.devicePixelRatio || 1);
  useEffect(() => {
    let query: MediaQueryList | null = null;
    const watch = () => {
      query?.removeEventListener('change', changed);
      query = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      query.addEventListener('change', changed);
    };
    function changed() {
      setRatio(window.devicePixelRatio || 1);
      watch();
    }
    watch();
    return () => query?.removeEventListener('change', changed);
  }, []);
  return ratio;
}
