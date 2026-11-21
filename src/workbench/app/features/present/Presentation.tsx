import { projectBase } from "../../../../shared/workspace-address.mjs";
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '../../components/Icon';
import type { IconName } from '../../components/icons';
import { closePopover } from '../../components/Popover';
import { pushLayer } from '../../lib/layers';
import { createStore, useStore } from '../../lib/store';
import { cls, storage } from '../../lib/util';
import { KEYS } from '../../../../shared/renamed-storage.mjs';
import { KEEPS_KEYS, stepSection } from '../../../../shared/present-step.mjs';
import { isReportMessage } from '../../session/protocol';
import { can, command } from '../../session/sessionStore';
import { currentDocument, navStore } from '../../state/navigation';
import { isDarkState, themeStore } from '../../state/theme';
import { draftParts, workspaceStore } from '../../workspace/store';
import { t } from '../../../../shared/i18n/index.mjs';
import './present.css';

/**
 * 演示（顶栏「更多操作」）：整个工作台全屏，只显示这份报告读者看到的样子（/generated/<slug>.html?present：没有编辑器），
 * 左下角一条浮动工具条：指针、激光笔、画笔、荧光笔、橡皮擦（点一下擦掉碰到的那一笔，双击按钮清除全部）、
 * 缩放（− 百分比 +，每档 10%，指针在百分比上时滚轮也一档档地调，点百分比回到 100%，记住上次的），上一节 / 下一节、退出。
 * 缩放像浏览器的缩放：报告在 1/缩放 宽的窗口里排版，再整体放大，报告自己的脚本和图表照常。
 * 笔迹画在报告上方的一层画布里，按报告的坐标记（跟着报告滚动、跟着缩放），不写进文件，退出演示就没了。
 * 键：V 指针、L 激光笔、P 画笔、H 荧光笔、E 橡皮擦、Ctrl+Z 撤销（添的、擦的、清除的都能撤）、
 * + / − / 0 缩放、←/→ 上一节 / 下一节、Esc 退出（全屏时 Esc 先退出全屏，演示随之结束）。
 * 读者在输入框里打字、在组件实例里按键时，键归它们自己；只有 Esc 还是退出，除非组件自己用掉了它。
 */

type Tool = 'pointer' | 'laser' | 'pen' | 'marker' | 'eraser';
interface Point { x: number; y: number }
interface Stroke { tool: 'pen' | 'marker'; points: Point[] }
// 撤销的一步：添了一笔、擦掉几笔（各在原来的位置）、清除全部
type Step = { kind: 'add'; stroke: Stroke } | { kind: 'erase'; erased: { stroke: Stroke; index: number }[] } | { kind: 'clear'; strokes: Stroke[] };

const presentStore = createStore<string | null>(null);

/** 开始演示：先请打开着的报告把还在等的修改存下（演示的页面读文件），全屏要在这次点击里请求 */
export function openPresentation(slug: string) {
  closePopover();
  const saved = can('save') ? command('save') : Promise.resolve(null);
  pending = Promise.race([saved, new Promise(resolve => setTimeout(resolve, 1500))]);
  presentStore.set(slug);
  document.documentElement.requestFullscreen?.().catch(() => {});
}
let pending: Promise<unknown> = Promise.resolve();

/**
 * 地址带 ?present（gallery open <文档> --present 给的：http://…/?present#<文档的链接>）：工作台打开着文档以后直接进演示，
 * 并把 ?present 从地址里去掉（刷新或分享时不再进演示）。浏览器只在读者点一下以后才肯全屏，所以这样进的演示不是全屏的，
 * 其余和菜单里的演示视图一样。地址里没有这个参数就什么也不做。
 */
function useLinkedPresentation() {
  useEffect(() => {
    let asked = false;
    try { asked = new URLSearchParams(location.search).has('present'); } catch { /* 沙箱环境 */ }
    if (!asked) return;
    const arrive = () => {
      const slug = currentDocument();
      if (!slug || workspaceStore.get().status !== 'ready') return false;
      try {
        const query = new URLSearchParams(location.search);
        query.delete('present');
        const rest = query.toString();
        history.replaceState(history.state, '', location.pathname + (rest ? `?${rest}` : '') + location.hash);
      } catch { /* 沙箱环境 */ }
      openPresentation(slug);
      return true;
    };
    if (arrive()) return;
    const stop = [navStore.subscribe(() => { if (arrive()) stop.forEach(off => off()); }), workspaceStore.subscribe(() => { if (arrive()) stop.forEach(off => off()); })];
    return () => stop.forEach(off => off());
  }, []);
}

export function PresentationHost() {
  const slug = useStore(presentStore);
  useLinkedPresentation();
  if (!slug) return null;
  return createPortal(<Presentation slug={slug} />, document.body);
}

const TOOLS: { tool: Tool; icon: IconName; label: string; key: string }[] = [
  { tool: 'pointer', icon: 'pointer', label: t('指针'), key: 'V' },
  { tool: 'laser', icon: 'laser', label: t('激光笔'), key: 'L' },
  { tool: 'pen', icon: 'pen', label: t('画笔'), key: 'P' },
  { tool: 'marker', icon: 'marker', label: t('荧光笔'), key: 'H' },
  { tool: 'eraser', icon: 'eraser', label: t('橡皮擦'), key: 'E' },
];
const INK = { pen: { color: '#e03e3e', width: 3 }, marker: { color: 'rgba(255, 204, 0, 0.6)', width: 18 } };
const TRAIL = 450; // 激光笔的尾迹留这么久（毫秒）
const LASER = { color: '#ff2d2d', rgb: [255, 45, 45], alpha: 0.55 }; // 尾迹的颜色和它最新那头的浓淡（透明度）
const ERASER = 10; // 橡皮擦的半径（屏幕像素，和它的光标一样大）
// 缩放的档：50% 到 200%，每档 10%（按钮、键和滚轮都是这些）；记在本机
const ZOOMS = Array.from({ length: 16 }, (_, index) => (50 + index * 10) / 100);
// 滚轮在百分比上：鼠标滚一格调一档（按行、按页滚的一下，或者一下就滚了这么多像素：Chrome 一格 100，
// Windows 设成一格一行的 33），触控板的小步子攒够这么多像素调一档
const WHEEL_NOTCH = 30;
const WHEEL_STEP = 50;
const ZOOM_KEY = KEYS.presentZoom;
const storedZoom = () => {
  const value = storage.get<number>(ZOOM_KEY);
  return typeof value === 'number' && ZOOMS.includes(value) ? value : 1;
};

// 键归它们自己的地方：能打字的控件，和组件实例里的一切（docs/render.md："A custom block on a page"）：KEEPS_KEYS（shared/present-step.mjs）

// 点 p 到线段 a–b 的距离
function distance(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const along = dx || dy ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy))) : 0;
  return Math.hypot(p.x - (a.x + along * dx), p.y - (a.y + along * dy));
}

function Presentation({ slug }: { slug: string }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const draft = draftParts(slug);
  const [tool, setTool] = useState<Tool>('pointer');
  const [count, setCount] = useState(0);
  const [notice, setNotice] = useState('');
  const [idle, setIdle] = useState(false);
  const fading = useRef(0);
  const [zoom, setZoomState] = useState(storedZoom);
  const zoomRef = useRef(zoom);
  const strokes = useRef<Stroke[]>([]);
  const steps = useRef<Step[]>([]);
  const drawing = useRef<Stroke | null>(null);
  const erasing = useRef<{ stroke: Stroke; index: number }[] | null>(null);
  const laser = useRef<(Point & { at: number })[]>([]);
  const laserLayer = useRef<HTMLCanvasElement | null>(null);
  const wheeled = useRef(0);
  const frameRequest = useRef(0);

  const close = () => {
    presentStore.set(null);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };
  // 报告页的窗口；框架被带去别的源时读不到（SecurityError），这时笔迹和缩放都不再跟着它
  const reportWindow = () => {
    const win = frame.current?.contentWindow;
    try {
      return win?.document ? win : null;
    } catch {
      return null;
    }
  };
  const view = () => {
    const win = reportWindow();
    return { x: win?.scrollX ?? 0, y: win?.scrollY ?? 0 };
  };
  const theme = () => (isDarkState(themeStore.get()) ? 'dark' : 'light');

  // 画一遍：笔迹（报告坐标：减去报告滚过的距离，乘上缩放），激光笔的尾迹和红点
  const draw = () => {
    const node = canvas.current;
    const ctx = node?.getContext('2d');
    if (!node || !ctx) return;
    const ratio = devicePixelRatio || 1;
    const scale = ratio * zoomRef.current;
    const { x, y } = view();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, node.width, node.height);
    ctx.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const stroke of [...strokes.current, ...(drawing.current ? [drawing.current] : [])]) {
      const [first, ...rest] = stroke.points;
      ctx.beginPath();
      ctx.moveTo(first.x, first.y);
      if (!rest.length) ctx.lineTo(first.x + 0.01, first.y);
      rest.forEach((point, index) => {
        const next = rest[index + 1];
        if (next) ctx.quadraticCurveTo(point.x, point.y, (point.x + next.x) / 2, (point.y + next.y) / 2);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.strokeStyle = INK[stroke.tool].color;
      ctx.lineWidth = INK[stroke.tool].width;
      ctx.stroke();
    }
    const now = performance.now();
    laser.current = laser.current.filter((point, index, all) => now - point.at < TRAIL || index === all.length - 1);
    const trail = laser.current;
    // 激光笔的尾迹：一段段从新到旧由粗变细、由浓变淡（每段从前一个点和这个点的中点，弯过这个点，到它和下一个点的中点）。
    // 半透明的一段段直接画，接头处叠两层，尾迹就一节浓一节淡；所以浓淡不用透明度，用颜色：笔迹这层和报告是
    // 相乘（浅色）或滤色（深色）叠的，白色（滤色时是黑色）叠上去什么也不变，红色掺进去多少就是多浓。
    // 每段都不透明，先在另一层里画，叠在一起的地方取更浓的那个（变暗 / 变亮），接头处就还是新的那段的颜色；
    // 再同样取更浓的盖到笔迹上（不把底下的画笔盖白）
    if (trail.length > 1) {
      const layer = (laserLayer.current ??= document.createElement('canvas'));
      if (layer.width !== node.width || layer.height !== node.height) {
        layer.width = node.width;
        layer.height = node.height;
      }
      const ink = layer.getContext('2d');
      if (ink) {
        ink.setTransform(1, 0, 0, 1, 0, 0);
        ink.clearRect(0, 0, layer.width, layer.height);
        ink.setTransform(scale, 0, 0, scale, -x * scale, -y * scale);
        ink.lineCap = 'round';
        ink.lineJoin = 'round';
        const screen = getComputedStyle(node).mixBlendMode === 'screen';
        const stronger: GlobalCompositeOperation = screen ? 'lighten' : 'darken';
        ink.globalCompositeOperation = stronger;
        const middle = (a: Point, b: Point) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
        for (let index = 1; index < trail.length; index++) {
          const life = Math.max(0, 1 - (now - trail[index].at) / TRAIL);
          const share = LASER.alpha * life; // 这一段红色掺进去多少
          const [red, green, blue] = LASER.rgb.map((value) => Math.round(screen ? value * share : 255 - (255 - value) * share));
          ink.strokeStyle = `rgb(${red}, ${green}, ${blue})`;
          const point = trail[index];
          const from = index === 1 ? trail[0] : middle(trail[index - 1], point);
          const next = trail[index + 1];
          ink.beginPath();
          ink.moveTo(from.x, from.y);
          if (next) {
            const to = middle(point, next);
            ink.quadraticCurveTo(point.x, point.y, to.x, to.y);
          } else ink.lineTo(point.x, point.y);
          ink.lineWidth = (4 * life + 1) / zoomRef.current;
          ink.stroke();
        }
        ctx.save();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalCompositeOperation = stronger;
        ctx.drawImage(layer, 0, 0);
        ctx.restore();
      }
    }
    const dot = trail[trail.length - 1];
    if (dot) {
      ctx.save();
      ctx.shadowColor = 'rgba(255, 30, 30, 0.9)';
      ctx.shadowBlur = 14;
      ctx.fillStyle = LASER.color;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, 5 / zoomRef.current, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    if (trail.length > 1) frameRequest.current = requestAnimationFrame(draw);
  };
  const redraw = () => {
    cancelAnimationFrame(frameRequest.current);
    frameRequest.current = requestAnimationFrame(draw);
  };

  const changed = () => {
    setCount(strokes.current.length);
    redraw();
  };
  const undo = () => {
    const step = steps.current.pop();
    if (!step) return;
    if (step.kind === 'add') strokes.current = strokes.current.filter(stroke => stroke !== step.stroke);
    else if (step.kind === 'erase') for (const { stroke, index } of [...step.erased].reverse()) strokes.current.splice(index, 0, stroke); // back in the reverse of the order they went
    else strokes.current = step.strokes;
    changed();
  };
  const clear = () => {
    if (!strokes.current.length) return;
    steps.current.push({ kind: 'clear', strokes: strokes.current });
    strokes.current = [];
    changed();
  };
  // 橡皮擦碰到的那几笔擦掉（记下它们原来的位置，撤销时放回去）
  const erase = (point: Point) => {
    const reach = ERASER / zoomRef.current;
    for (let index = strokes.current.length - 1; index >= 0; index--) {
      const stroke = strokes.current[index];
      const width = INK[stroke.tool].width / 2;
      const hit = stroke.points.some((p, i) => distance(point, stroke.points[Math.max(0, i - 1)], p) <= reach + width);
      if (!hit) continue;
      strokes.current.splice(index, 1);
      (erasing.current ??= []).push({ stroke, index });
    }
    changed();
  };

  const setZoom = (next: number) => {
    zoomRef.current = next;
    setZoomState(next);
    storage.set(ZOOM_KEY, next);
    redraw();
  };
  const stepZoom = (direction: 1 | -1) => {
    const at = ZOOMS.indexOf(zoomRef.current);
    const next = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, (at < 0 ? ZOOMS.indexOf(1) : at) + direction))];
    if (next !== zoomRef.current) setZoom(next);
  };

  // 上一节 / 下一节：报告里看得见的二级标题，滚到离窗口顶 24px
  const step = (direction: 1 | -1) => {
    const win = frame.current?.contentWindow;
    if (!win?.document) return;
    stepSection(win, direction);
  };

  const keys = useRef<(event: KeyboardEvent) => void>(() => {});
  keys.current = (event: KeyboardEvent) => {
    if (event.isComposing) return;
    // 事件可能来自报告页（另一个窗口的节点），所以不用 instanceof
    const kept = (event.target as Element | null)?.closest?.(KEEPS_KEYS);
    if (kept && (event.key !== 'Escape' || event.defaultPrevented)) return;
    const key = event.key.toLowerCase();
    const mod = event.ctrlKey || event.metaKey;
    if (mod && key === 'z') { event.preventDefault(); undo(); return; }
    if (mod || event.altKey) return;
    const picked = TOOLS.find(entry => entry.key.toLowerCase() === key);
    if (picked) setTool(picked.tool);
    else if (event.key === 'ArrowRight') step(1);
    else if (event.key === 'ArrowLeft') step(-1);
    else if (event.key === '+' || event.key === '=') stepZoom(1);
    else if (event.key === '-' || event.key === '_') stepZoom(-1);
    else if (event.key === '0') setZoom(1);
    else if (event.key === 'Escape') close();
    else return;
    event.preventDefault();
  };

  useEffect(() => pushLayer(close), []);
  // 演示里的页面要告诉读者的话（链接到的页面不在了）：工作台的提示条这时不显示，演示自己说，显示三秒
  useEffect(() => {
    let timer = 0;
    const heard = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.origin !== location.origin || !isReportMessage(event.data)) return;
      const message = event.data;
      if (message.type === 'notice') {
        setNotice(message.text);
        clearTimeout(timer);
        timer = window.setTimeout(() => setNotice(''), 3000);
      }
    };
    addEventListener('message', heard);
    return () => { clearTimeout(timer); removeEventListener('message', heard); };
  }, []);
  useEffect(() => {
    let live = true;
    void pending.then(async () => {
      if (!live) return;
      setSrc(draft ? `${projectBase(draft.ws)}/generated/${encodeURIComponent(draft.slug)}.html?present` : `/generated/${encodeURIComponent(slug)}.html?present`);
    });
    return () => { live = false; };
  }, [slug]);
  // 全屏退出（Esc、浏览器自己的退出）时演示也结束
  useEffect(() => {
    let entered = Boolean(document.fullscreenElement);
    const change = () => {
      if (document.fullscreenElement) entered = true;
      else if (entered) presentStore.set(null);
    };
    const key = (event: KeyboardEvent) => keys.current(event);
    const size = () => {
      const node = canvas.current;
      if (!node) return;
      node.width = Math.round(innerWidth * (devicePixelRatio || 1));
      node.height = Math.round(innerHeight * (devicePixelRatio || 1));
      redraw();
    };
    size();
    document.addEventListener('fullscreenchange', change);
    addEventListener('keydown', key);
    addEventListener('resize', size);
    return () => {
      document.removeEventListener('fullscreenchange', change);
      removeEventListener('keydown', key);
      removeEventListener('resize', size);
      cancelAnimationFrame(frameRequest.current);
    };
  }, []);
  // 工具条打开 2.5 秒后、指针离开它 2.5 秒后淡下去，只有指针移到它上面才恢复（指针在页面上怎么动都不算）
  const fadeLater = () => {
    clearTimeout(fading.current);
    fading.current = window.setTimeout(() => setIdle(true), 2500);
  };
  useEffect(() => {
    fadeLater();
    return () => clearTimeout(fading.current);
  }, []);

  // 报告页载入：外观跟工作台，报告滚动时笔迹跟着重画，焦点在报告里时的键也归演示
  const loaded = () => {
    const win = reportWindow();
    if (!win) return;
    win.dispatchEvent(new CustomEvent('doc-theme-request', { detail: { theme: theme() } }));
    win.addEventListener('scroll', redraw, { passive: true });
    win.addEventListener('keydown', event => keys.current(event));
    win.focus();
    redraw();
  };

  // 指针在报告里的位置（报告的坐标）
  const at = (event: { clientX: number; clientY: number }): Point => {
    const { x, y } = view();
    return { x: event.clientX / zoomRef.current + x, y: event.clientY / zoomRef.current + y };
  };
  // 滚轮在百分比上：往上放大、往下缩小，滚一格一档，触控板滚够一档的量一档（换了方向重新算）
  const wheelZoom = (event: React.WheelEvent) => {
    if (event.ctrlKey) return; // Ctrl+滚轮是浏览器自己的缩放
    const { deltaY, deltaMode } = event;
    if (!deltaY) return;
    const notch = deltaMode !== 0 || Math.abs(deltaY) >= WHEEL_NOTCH;
    if (!notch) {
      if (Math.sign(deltaY) !== Math.sign(wheeled.current)) wheeled.current = 0;
      wheeled.current += deltaY;
      if (Math.abs(wheeled.current) < WHEEL_STEP) return;
    }
    wheeled.current = 0;
    stepZoom(deltaY < 0 ? 1 : -1);
  };
  const inking = tool === 'pen' || tool === 'marker';

  return (
    <div className="present" data-tool={tool}>
      {src && (
        <iframe
          ref={frame}
          className="present-frame"
          title={t('演示')}
          src={src}
          onLoad={loaded}
          style={{ width: `${100 / zoom}%`, height: `${100 / zoom}%`, transform: `scale(${zoom})` }}
        />
      )}
      <canvas
        ref={canvas}
        className="present-ink"
        data-strokes={count}
        onPointerDown={event => {
          if (event.button !== 0 || !(inking || tool === 'eraser')) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          if (tool === 'eraser') {
            erasing.current = [];
            erase(at(event));
            return;
          }
          drawing.current = { tool: tool as Stroke['tool'], points: [at(event)] };
          redraw();
        }}
        onPointerMove={event => {
          if (drawing.current) {
            drawing.current.points.push(at(event));
            redraw();
          } else if (erasing.current) erase(at(event));
          else if (tool === 'laser') {
            // 浏览器合在这一下里的那些位置也都记上：尾迹更顺
            const moves = event.nativeEvent.getCoalescedEvents?.() ?? [];
            const now = performance.now();
            for (const move of moves.length ? moves : [event]) laser.current.push({ ...at(move), at: now });
            redraw();
          }
        }}
        onPointerUp={() => {
          if (erasing.current) {
            if (erasing.current.length) steps.current.push({ kind: 'erase', erased: erasing.current });
            erasing.current = null;
            return;
          }
          if (!drawing.current) return;
          strokes.current.push(drawing.current);
          steps.current.push({ kind: 'add', stroke: drawing.current });
          drawing.current = null;
          changed();
        }}
        onPointerLeave={() => { laser.current = []; redraw(); }}
        onWheel={event => {
          const by = { left: event.deltaX / zoomRef.current, top: event.deltaY / zoomRef.current };
          reportWindow()?.scrollBy(by);
        }}
      />
      <div
        className={cls('present-bar', idle && 'idle')}
        role="toolbar"
        aria-label={t('演示')}
        onPointerEnter={() => { clearTimeout(fading.current); setIdle(false); }}
        onPointerLeave={fadeLater}
      >
        {TOOLS.map(entry => (
          <button
            key={entry.tool}
            className="present-btn"
            aria-pressed={tool === entry.tool}
            aria-label={entry.label}
            data-tip={entry.label}
            data-sub={entry.tool === 'eraser' ? t('{0} · 双击清除全部', entry.key) : entry.key}
            onClick={() => setTool(entry.tool)}
            onDoubleClick={entry.tool === 'eraser' ? clear : undefined}
          >
            <Icon name={entry.icon} />
          </button>
        ))}
        <span className="present-sep" />
        <button className="present-btn" aria-label={t('缩小')} data-tip={t('缩小')} data-sub="−" disabled={zoom <= ZOOMS[0]} onClick={() => stepZoom(-1)}><Icon name="minus" /></button>
        <button className="present-zoom" aria-label={t('缩放比例')} data-tip={t('恢复到 100%')} data-sub="0" onClick={() => setZoom(1)} onWheel={wheelZoom}>{Math.round(zoom * 100)}%</button>
        <button className="present-btn" aria-label={t('放大')} data-tip={t('放大')} data-sub="+" disabled={zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => stepZoom(1)}><Icon name="plus" /></button>
        <span className="present-sep" />
        <button className="present-btn" aria-label={t('上一节')} data-tip={t('上一节')} data-sub="←" onClick={() => step(-1)}><Icon name="chevronUp" /></button>
        <button className="present-btn" aria-label={t('下一节')} data-tip={t('下一节')} data-sub="→" onClick={() => step(1)}><Icon name="chevronDown" /></button>
        <span className="present-sep" />
        <button className="present-btn" aria-label={t('退出演示')} data-tip={t('退出演示')} data-sub="Esc" onClick={close}><Icon name="close" /></button>
      </div>
      {notice && <div className="present-notice" role="status">{notice}</div>}
    </div>
  );
}
