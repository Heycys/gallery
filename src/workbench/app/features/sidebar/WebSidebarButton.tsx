import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';
import { Icon } from '../../components/Icon';
import { useStore } from '../../lib/store';
import { clamp, cls } from '../../lib/util';
import { cancelPeekTimer, clearSuppressPeek, hidePeek, leavePeekTrigger, setExpanded, showPeek, sidebarStore } from '../../state/sidebar';
import { t } from '../../../../shared/i18n/index.mjs';

const SIZE = 36;
const PANEL_GAP = 2; // Both the panel and the button have a 1px outer outline.
// Keep the reader's height while switching pages or expanding the sidebar in this tab.
let dockedTop = 288;
const topWithinWindow = (top: number) => clamp(top, 8, Math.max(8, window.innerHeight - SIZE - 8));

/** Online pages have no top bar: this docked button replaces their left-edge hover strip. */
export function WebSidebarButton() {
  const sidebar = useStore(sidebarStore);
  const [position, setPosition] = useState(() => ({ x: 0, y: topWithinWindow(dockedTop) }));
  const [dragging, setDragging] = useState(false);
  const [besidePanel, setBesidePanel] = useState(false);
  const gesture = useRef<{ id: number; x: number; y: number; left: number; top: number; moved: boolean } | null>(null);
  const skipClick = useRef(false);
  const skipHover = useRef(false);
  const hoverPoint = useRef<{ x: number; y: number } | null>(null);

  // Read the existing panel's bounds rather than duplicating its top/bottom spacing here.
  useLayoutEffect(() => {
    const panel = document.getElementById('sidebar')?.getBoundingClientRect();
    const center = position.y + SIZE / 2;
    setBesidePanel(Boolean(panel && center >= panel.top && center <= panel.bottom));
  }, [position, sidebar.peek, sidebar.mobile]);

  // The panel moves under the stationary pointer as its trigger moves away. Do not let that
  // geometry change turn an intended button click into a row click (or a drag). A real pointer
  // move releases the guard; layout-generated pointer events at the same coordinates do not.
  useLayoutEffect(() => {
    if (!sidebar.peek || !besidePanel || !hoverPoint.current) return;
    const point = hoverPoint.current;
    let waiting = true;
    let pressed = false;
    const moved = (event: globalThis.PointerEvent) => {
      if (event.pointerType === 'mouse' && (event.clientX !== point.x || event.clientY !== point.y)) waiting = false;
    };
    const guard = (event: MouseEvent) => {
      if (event instanceof window.PointerEvent && event.pointerType !== 'mouse') { waiting = false; pressed = false; return; }
      if (event.type === 'click' && event.detail === 0) return; // Keyboard activation.
      if (event.type === 'pointerdown') pressed = waiting;
      if (!waiting && !pressed) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.type === 'click') pressed = false;
    };
    const events = ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click', 'dblclick', 'contextmenu'] as const;
    window.addEventListener('pointermove', moved, true);
    for (const name of events) window.addEventListener(name, guard, true);
    return () => {
      window.removeEventListener('pointermove', moved, true);
      for (const name of events) window.removeEventListener(name, guard, true);
    };
  }, [sidebar.peek, besidePanel]);

  useEffect(() => {
    const resize = () => setPosition(p => ({ x: clamp(p.x, 0, Math.max(0, window.innerWidth - SIZE)), y: topWithinWindow(p.y) }));
    window.addEventListener('resize', resize);
    return () => { window.removeEventListener('resize', resize); hidePeek(); };
  }, []);

  const start = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || !event.isPrimary) return;
    cancelPeekTimer();
    skipClick.current = false;
    const rect = event.currentTarget.getBoundingClientRect();
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse') hoverPoint.current = { x: event.clientX, y: event.clientY };
    const from = gesture.current;
    if (!from || from.id !== event.pointerId) return;
    const dx = event.clientX - from.x;
    const dy = event.clientY - from.y;
    if (!from.moved) {
      if (Math.hypot(dx, dy) < 4) return;
      from.moved = true;
      skipClick.current = true;
      skipHover.current = true;
      hidePeek();
      setDragging(true);
    }
    setPosition({ x: clamp(from.left + dx, 0, Math.max(0, window.innerWidth - SIZE)), y: topWithinWindow(from.top + dy) });
  };
  const finish = (event: PointerEvent<HTMLButtonElement>) => {
    const from = gesture.current;
    if (!from || from.id !== event.pointerId) return;
    gesture.current = null;
    if (event.type !== 'pointerup') skipClick.current = true;
    setDragging(false);
    setPosition(p => {
      dockedTop = topWithinWindow(p.y);
      return { x: 0, y: dockedTop };
    });
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <>
      {dragging && <div className="sb-web-drag-cover" />}
      <button
        id="sbWebButton"
        type="button"
        className={cls('sb-web-button', dragging && 'dragging')}
        style={{ transform: `translate(${dragging ? position.x : sidebar.peek && besidePanel ? sidebar.width + PANEL_GAP : 0}px, ${position.y}px)` }}
        aria-label={t('展开侧边栏')}
        aria-controls="sidebar"
        onPointerEnter={event => {
          if (event.pointerType !== 'mouse' || event.buttons || gesture.current || skipHover.current) return;
          hoverPoint.current = { x: event.clientX, y: event.clientY };
          clearSuppressPeek();
          showPeek(300);
        }}
        onPointerLeave={() => { skipHover.current = false; clearSuppressPeek(); leavePeekTrigger(); }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={finish}
        onPointerCancel={finish}
        onLostPointerCapture={finish}
        onClick={event => {
          if (skipClick.current && event.detail !== 0) { skipClick.current = false; return; }
          setExpanded(true);
        }}
      >
        <Icon name="sidebar" />
      </button>
    </>
  );
}
