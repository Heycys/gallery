import { useEffect, type RefObject } from 'react';
import { clamp } from '../../lib/util';
import { can, command, sessionStore } from '../../session/sessionStore';
import { openReport } from '../../state/navigation';
import { holdPeek } from '../../state/sidebar';
import { expKey, openSection, setExpandedKey, type TreeScope } from '../../state/tree';
import { moveColumn, moveExtensionEntry, moveReport, placeFavorite } from '../../workspace/commands';
import { childrenOf, columnTop, isInside } from '../../workspace/meta';
import { columnTitle, reportTitle, workspaceStore } from '../../workspace/store';
import { groupOfTop } from '../../../../shared/outline-shape.mjs';
import { projectItem } from '../../../../shared/workspace-address.mjs';

/**
 * 侧栏拖拽（只改目录组织，不移动磁盘上的文件夹）：
 * - 条目（文档、网页链接）落在条目上 / 下 25% = 插到前 / 后；中间 = 放进它下面；展开着的条目下沿 = 成为它的第一个子项；
 *   一栏的标题 = 那一栏顶层的第一个；一栏最后一行下面（栏的下边距，最后一栏再往下滚动区里空着的）、空着的栏那一行灰字 = 那一栏顶层的最后。
 *   条目在栏之间、栏内部随意拖动，也能拖到别的条目下面：栏只是收纳（docs/workbench.md「Columns」）
 * - 拖进「收藏」= 收藏；收藏里的条目只能在收藏内排序；不能拖进自己的子树
 * - 拖一栏的标题 = 调整栏的顺序：落在一栏的上半 / 下半 = 放到它前 / 后；扩展提供的栏的标题也能拖；
 *   扩展一级条目（data-scope="ext"）只能在本栏内前后插入，整棵子树一起移动，顺序写回 sidebar.json（docs/workbench.md「Extension columns」）
 * - 悬停在折叠条目中间 700ms 自动展开；靠近上下边缘自动滚动；按 Esc 取消
 * - 文档条目拖出侧栏、到右边显示着的文档上：不再是排目录，而是在正文里插入一个页面块（和在那里输入「@」选这一页一样）。
 *   拖动期间 iframe 不接收鼠标（report.css：body.dragging iframe），指针一直是这里的；指针在文档上时用会话的 drop-page
 *   告诉页面它在框里的位置，页面在那里画一条插入线，松开时插入（editor/page/page-drop/）。回到侧栏又是排目录；
 *   网页链接、别的工作区的文档（「@」在这份文档里链接不到）、栏和扩展的条目不会变成插入（docs/workbench.md「The sidebar」）
 */
type Target =
  | { type: 'extension'; ref: string; pos: 'before' | 'after'; el: Element; level: number; linePos: 'before' | 'after' }
  | { type: 'page'; ref: string; pos: 'before' | 'after' | 'inside' | 'inside-start'; el: Element; level: number; linePos?: 'before' | 'after'; scope: TreeScope }
  | { type: 'fav'; ref: string | null; pos: 'before' | 'after'; el: Element; level: number; linePos?: 'before' | 'after' }
  | { type: 'section'; column: string; index?: number; el: Element; level: number; linePos: 'before' | 'after' }
  | { type: 'column'; index: number; el: Element; level: number; linePos: 'before' | 'after' };

/** 在文档上时影子的左上角离指针多远（右下方，在指针图标之外） */
const GHOST_BESIDE = 16;

/** 拖到文档上时（插入页面块）：哪个框、拖的是那份文档的工作区里的哪一页，在等页面回答的那一次之后还没发的位置 */
interface Insert { frame: HTMLIFrameElement; page: string; busy: boolean; next: { x: number; y: number } | null }

interface DragState {
  id: string;
  kind: 'page' | 'fav' | 'column' | 'extension';
  extension?: { id: string; entry: string; baseOrder: string[] };
  srcRow: HTMLElement;
  sx: number; sy: number;
  lastX: number; lastY: number;
  started: boolean;
  target: Target | null;
  ghost?: HTMLElement;
  offX?: number; offY?: number;
  raf?: number;
  expandTimer?: number;
  release?: () => void;
  /** 能插进显示着的文档的页（那份文档的工作区里的 slug）；null：这一行插不进去 */
  page?: string | null;
  into?: Insert;
}

/**
 * 拖着的这一行在显示着的文档里能链接到的页面，和那份文档里输入「@」能选到的一样：它在那份文档的工作区里的 slug。
 * 文档（自己工作区的，或别的工作区的底稿）才行，而且要和显示着的文档在同一个工作区（「@」只列自己工作区的文档）；
 * 网页链接、栏、扩展的条目，显示着的是自定义页或页面不会 drop-page 时：null。页面最后再按它的列表核对一次
 */
function linkablePage(kind: DragState['kind'], id: string): string | null {
  if (kind !== 'page' && kind !== 'fav') return null;
  const report = workspaceStore.get().reports[id];
  const shown = sessionStore.get().slug;
  if (!report || report.kind === 'link' || !shown || shown.startsWith('@') || !can('drop-page')) return null;
  const entry = projectItem(id), page = projectItem(shown);
  return (entry?.ws ?? null) === (page?.ws ?? null) ? entry?.slug ?? id : null;
}

/** 指针下显示着的文档的框（报告区里、没被别的东西盖住、不在换页中）；没有时 null */
function frameAt(x: number, y: number): HTMLIFrameElement | null {
  const view = document.elementFromPoint(x, y)?.closest('.report-view');
  const frame = view?.querySelector<HTMLIFrameElement>(':scope > iframe.report-frame:not([data-pending])');
  if (!frame || frame.inert) return null;
  const r = frame.getBoundingClientRect();
  return x >= r.left && x < r.right && y >= r.top && y < r.bottom ? frame : null;
}

/** 窗口里的一点在框里的位置（页面的窗口坐标） */
function inFrame(frame: HTMLIFrameElement, x: number, y: number) {
  const r = frame.getBoundingClientRect();
  return { x: x - r.left - frame.clientLeft, y: y - r.top - frame.clientTop };
}

export function useTreeDnd(scrollRef: RefObject<HTMLDivElement | null>, lineRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    const scroller = scrollRef.current!;
    let drag: DragState | null = null;
    let suppressClick = false;

    const line = () => lineRef.current!;
    const clearUI = () => {
      scroller.querySelectorAll('.drop-inside').forEach(e => e.classList.remove('drop-inside'));
      line().classList.remove('show');
    };
    const columnSections = () => [...scroller.querySelectorAll<HTMLElement>('.section[data-column]')];
    // 画出来的一栏在目录的栏里排第几：目录里还有不画的栏（移除了的、工作区不在了的），落点按目录的位置算，不按画出来的第几栏
    const groupIndex = (section: HTMLElement) => workspaceStore.get().meta.groups.findIndex(group => group.id === section.dataset.column);

    // 拖一栏的标题：落在哪一栏的上半 / 下半（收藏里 = 第一栏之前）；index 是目录里的位置（moveColumn）
    function columnTarget(el: Element, y: number): Target | null {
      const sections = columnSections();
      if (!sections.length) return null;
      const over = el.closest<HTMLElement>('.section[data-column]');
      if (!over) {
        if (el.closest('.section[data-section="fav"]')) return { type: 'column', index: groupIndex(sections[0]), el: sections[0], level: 0, linePos: 'before' };
        const last = sections[sections.length - 1];
        return y >= last.getBoundingClientRect().bottom ? { type: 'column', index: groupIndex(last) + 1, el: last, level: 0, linePos: 'after' } : null;
      }
      const at = groupIndex(over);
      if (at < 0) return null;
      const r = over.getBoundingClientRect();
      return y < r.top + r.height / 2 ? { type: 'column', index: at, el: over, level: 0, linePos: 'before' } : { type: 'column', index: at + 1, el: over, level: 0, linePos: 'after' };
    }

    // 一栏顶层的最后：那一栏的条目区（空着的栏是那一行灰字）
    const columnEnd = (section: HTMLElement): Target | null => {
      const column = section.dataset.column;
      const tree = section.querySelector(':scope > .tree');
      if (!column || !tree || section.dataset.extension) return null;
      const empty = tree.querySelector('.sb-empty');
      return { type: 'section', column: columnTop(column), el: empty ?? tree, linePos: empty ? 'before' : 'after', level: 0 };
    };

    function resolveTarget(el: Element, y: number): Target | null {
      const d = drag!;
      if (d.kind === 'column') return columnTarget(el, y);
      if (d.kind === 'extension') {
        const section = el.closest<HTMLElement>('.section[data-extension]');
        if (!section || section.dataset.extension !== d.extension!.id) return null;
        // A root and its expanded subtree move as one. Never offer an "inside" or cross-column target.
        const nodes = [...section.querySelectorAll<HTMLElement>(':scope > .tree > .node')];
        let node = nodes.find(node => node.contains(el));
        let pos: 'before' | 'after';
        if (node) {
          const row = node.querySelector<HTMLElement>(':scope > .row')!;
          const box = row.getBoundingClientRect();
          pos = y < box.top + box.height / 2 ? 'before' : 'after';
        } else if (el.closest('.sec-head')) { node = nodes[0]; pos = 'before'; }
        else if (nodes.length && y >= nodes[nodes.length - 1].getBoundingClientRect().bottom) { node = nodes[nodes.length - 1]; pos = 'after'; }
        else return null;
        const row = node?.querySelector<HTMLElement>(':scope > .row');
        if (!row || row.dataset.id === d.id) return null;
        const ref = row.dataset.id!.slice(row.dataset.id!.indexOf('/') + 1);
        return { type: 'extension', ref, pos, el: node!, level: 0, linePos: pos };
      }
      const row = el.closest<HTMLElement>('.row');
      if (row?.dataset.scope === 'ext') return null;
      if (row) {
        const r = row.getBoundingClientRect(), ratio = (y - r.top) / r.height;
        const id = row.dataset.id!, scope = row.dataset.scope as TreeScope, depth = Number(row.dataset.depth);
        const favRoot = scope === 'fav' && depth === 0;
        if (d.kind === 'fav') {
          if (!favRoot || id === d.id) return null;
          return { type: 'fav', ref: id, pos: ratio < 0.5 ? 'before' : 'after', el: row, level: 0 };
        }
        const pos = ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside';
        if (favRoot && pos !== 'inside') return { type: 'fav', ref: id, pos, el: row, level: 0 };
        if (isInside(workspaceStore.get().meta, id, d.id)) return null;
        if (pos === 'after' && row.parentElement!.classList.contains('open'))
          return { type: 'page', ref: id, pos: 'inside-start', el: row, linePos: 'after', level: depth + 1, scope };
        return { type: 'page', ref: id, pos, el: row, level: depth, scope };
      }
      const head = el.closest<HTMLElement>('.sec-head');
      if (head) {
        if (head.dataset.section === 'fav') return { type: 'fav', ref: null, pos: 'before', el: head, linePos: 'after', level: 0 };
        if (d.kind === 'fav' || !head.dataset.column || head.dataset.extension) return null;
        return { type: 'section', column: columnTop(head.dataset.column), index: 0, el: head, linePos: 'after', level: 0 };
      }
      if (d.kind === 'fav') return null;
      // 空着的栏那一行灰字：那一栏
      const empty = el.closest<HTMLElement>('.sb-empty');
      const section = (empty ?? el).closest<HTMLElement>('.section[data-column]');
      if (empty && section) return columnEnd(section);
      // 一栏最后一行下面（栏的下边距）= 那一栏顶层的最后；最后一栏再往下（滚动区里空着的）也是
      // （原来是末尾那行「新建文档」：最后一篇展开着时，这是放到顶层最后的唯一去处）
      const below = section ?? (el === scroller || el.closest('.drop-line') ? columnSections().at(-1) ?? null : null);
      const tree = below?.querySelector(':scope > .tree');
      if (below && tree && y >= tree.getBoundingClientRect().bottom && !el.closest('.row, .sec-head')) return columnEnd(below);
      return null;
    }

    function setTarget(t: Target | null) {
      const d = drag!;
      const prev = d.target;
      if (prev && t && prev.el === t.el && prev.type === t.type && ('pos' in prev ? prev.pos : '') === ('pos' in t ? t.pos : '') && prev.linePos === t.linePos) return;
      d.target = t;
      clearUI();
      clearTimeout(d.expandTimer);
      if (!t) return;
      if (t.type === 'page' && t.pos === 'inside') {
        t.el.classList.add('drop-inside');
        const node = t.el.parentElement!;
        if (!node.classList.contains('open') && childrenOf(workspaceStore.get().meta, t.ref).length) {
          d.expandTimer = window.setTimeout(() => {
            setExpandedKey(expKey(t.ref, t.scope), true);
            if (drag) { drag.target = null; setTimeout(() => drag && computeDrop(drag.lastX, drag.lastY), 0); }
          }, 700);
        }
        return;
      }
      const lp = t.linePos ?? ('pos' in t ? (t.pos === 'before' ? 'before' : 'after') : 'after');
      const sr = scroller.getBoundingClientRect(), r = t.el.getBoundingClientRect();
      const top = (lp === 'before' ? r.top : r.bottom) - sr.top + scroller.scrollTop;
      const left = r.left - sr.left + 16 + t.level * 8; // 行的左内边距 16px（父级的展开箭头就在这段里：sidebar.css .row-chevron），每深一级 8px
      const l = line();
      l.style.top = `${top - 1.5}px`;
      l.style.left = `${left}px`;
      l.style.width = `${Math.max(24, r.right - sr.left - left)}px`;
      l.classList.add('show');
    }

    function computeDrop(x: number, y: number) {
      const el = document.elementFromPoint(x, y);
      if (!el || !scroller.contains(el)) return setTarget(null);
      const t = resolveTarget(el, y);
      // 条目之间 1px 的缝隙：保持上一个目标，避免闪烁
      if (!t && drag!.kind !== 'extension' && !el.closest('.row, .sec-head') && el.closest('.tree, .kids')) return;
      setTarget(t);
    }

    // 指针在显示着的文档上（能插入的一行）：侧栏的落点和线收起，告诉页面指针在哪；页面一次只问一个，
    // 还没回答时来的位置只留最新的，回答了再发。返回是否在文档上
    function overFrame(x: number, y: number): boolean {
      const d = drag!;
      const frame = d.page ? frameAt(x, y) : null;
      if (!frame) {
        leaveFrame();
        return false;
      }
      if (d.into && d.into.frame !== frame) leaveFrame();
      if (d.target) setTarget(null);
      d.into ??= { frame, page: d.page!, busy: false, next: null };
      sendOver(d.into, inFrame(frame, x, y));
      return true;
    }
    function sendOver(into: Insert, at: { x: number; y: number }) {
      if (into.busy) { into.next = at; return; }
      into.busy = true;
      void command('drop-page', { phase: 'over', page: into.page, ...at }, 3000).then(reply => {
        into.busy = false;
        // 松开会插进去时指针是带加号的箭头；插不进去的地方（标题、代码块、图片上）还是抓手
        document.body.classList.toggle('drag-into', drag?.into === into && reply.ok && Boolean(reply.takes));
        const next = into.next;
        into.next = null;
        if (next && drag?.into === into) sendOver(into, next);
      });
    }
    // 离开文档（回到侧栏、到了别处、取消）：页面收起插入线
    function leaveFrame() {
      const d = drag;
      if (!d?.into) return;
      d.into = undefined;
      document.body.classList.remove('drag-into');
      void command('drop-page', { phase: 'leave' }, 3000);
    }

    function autoScroll() {
      if (!drag?.started) return;
      const r = scroller.getBoundingClientRect(), x = drag.lastX, y = drag.lastY, edge = 40;
      if (x >= r.left && x <= r.right) {
        let dy = 0;
        if (y < r.top + edge) dy = -Math.ceil((r.top + edge - y) / 4);
        else if (y > r.bottom - edge) dy = Math.ceil((y - (r.bottom - edge)) / 4);
        if (dy) { scroller.scrollTop += clamp(dy, -18, 18); computeDrop(x, y); }
      }
      drag.raf = requestAnimationFrame(autoScroll);
    }

    function start() {
      const d = drag!;
      const r = d.srcRow.getBoundingClientRect();
      d.started = true;
      d.offX = Math.min(d.sx - r.left, 60);
      d.offY = Math.min(d.sy - r.top, 30);
      const ghost = document.createElement('div');
      ghost.className = 'drag-ghost';
      ghost.style.maxWidth = `${Math.min(r.width, 260)}px`;
      const icon = d.kind === 'column' ? null : d.srcRow.querySelector('.pg-icon')?.cloneNode(true);
      if (icon) ghost.appendChild(icon);
      const t = document.createElement('span');
      t.className = 't';
      const ws = workspaceStore.get();
      t.textContent = d.kind === 'column' ? columnTitle(ws.meta.groups.find(group => group.id === d.id)) : d.kind === 'extension' ? d.srcRow.querySelector('.row-title')?.textContent ?? '' : reportTitle(ws.reports[d.id]);
      ghost.appendChild(t);
      document.body.appendChild(ghost);
      d.ghost = ghost;
      document.body.classList.add('dragging');
      d.srcRow.classList.add('drag-src');
      d.release = holdPeek();
      d.page = linkablePage(d.kind, d.id);
      d.raf = requestAnimationFrame(autoScroll);
    }

    function finish(commit: boolean) {
      const d = drag!;
      drag = null;
      if (!d.started) return;
      cancelAnimationFrame(d.raf!);
      clearTimeout(d.expandTimer);
      d.ghost?.remove();
      document.body.classList.remove('dragging', 'drag-into');
      d.srcRow.classList.remove('drag-src');
      clearUI();
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 60);
      d.release?.();
      // 在文档上松开：插入页面块（页面说插进去了，焦点给它，光标在页面块后面）；取消：页面收起插入线。侧栏的目录不动
      if (d.into) {
        const { frame, page } = d.into;
        if (!commit) void command('drop-page', { phase: 'leave' }, 3000);
        else void command('drop-page', { phase: 'drop', page, ...inFrame(frame, d.lastX, d.lastY) }).then(reply => {
          if (reply.ok && reply.placed && frame.isConnected) frame.focus({ preventScroll: true });
        });
        return;
      }
      const t = d.target;
      if (commit && t) {
        if (t.type === 'extension' && d.extension) void moveExtensionEntry(d.extension.id, d.extension.entry, t.ref, t.pos, d.extension.baseOrder);
        else if (t.type === 'column') moveColumn(d.id, t.index);
        else if (t.type === 'fav') placeFavorite(d.id, t.ref, t.pos);
        else if (t.type === 'section') {
          moveReport(d.id, { pos: 'root', column: t.column, index: t.index });
          openSection(groupOfTop(t.column));
        } else if (t.type === 'page' && moveReport(d.id, { pos: t.pos, ref: t.ref }) && t.pos.startsWith('inside')) {
          setExpandedKey(t.ref, true);
          if (t.scope === 'fav') setExpandedKey(expKey(t.ref, 'fav'), true);
        }
      } else if (commit && d.kind !== 'column' && d.kind !== 'extension' && document.elementFromPoint(d.lastX, d.lastY)?.closest('.row') === d.srcRow) {
        // 按下时手抖触发了拖拽、但最终落回原条目：按点击处理
        void openReport(d.id, { reveal: false });
      }
    }

    const onDown = (e: PointerEvent) => {
      if (e.button !== 0 || e.pointerType === 'touch') return;
      const target = e.target as Element;
      if (target.closest('input') || target.closest('button:not(.sec-toggle, .row-icon)')) return;
      const row = target.closest<HTMLElement>('.row');
      if (row?.dataset.scope === 'ext') {
        if (row.dataset.depth !== '0') return;
        const extension = workspaceStore.get().extensions.find(extension => extension.id === row.dataset.extension);
        const key = row.dataset.id!;
        const entry = key.slice(key.indexOf('/') + 1);
        if (!extension || extension.error || !extension.entries.some(item => item.id === entry)) return;
        drag = { id: key, kind: 'extension', extension: { id: extension.id, entry, baseOrder: extension.entries.map(item => item.id) }, srcRow: row,
          sx: e.clientX, sy: e.clientY, lastX: e.clientX, lastY: e.clientY, started: false, target: null };
        return;
      }
      const head = row ? null : target.closest<HTMLElement>('.sec-head[data-column]');
      if (head) {
        const section = head.closest<HTMLElement>('.section')!;
        drag = { id: head.dataset.column!, kind: 'column', srcRow: section, sx: e.clientX, sy: e.clientY, lastX: e.clientX, lastY: e.clientY, started: false, target: null };
        return;
      }
      if (!row) return;
      drag = {
        id: row.dataset.id!,
        kind: row.dataset.scope === 'fav' && row.dataset.depth === '0' ? 'fav' : 'page',
        srcRow: row, sx: e.clientX, sy: e.clientY, lastX: e.clientX, lastY: e.clientY, started: false, target: null,
      };
    };
    const onMove = (e: PointerEvent) => {
      if (!drag) return;
      drag.lastX = e.clientX; drag.lastY = e.clientY;
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 5) return;
        start();
      }
      // 在文档上时影子挪到指针右下方，不盖住指针下的插入线；回到侧栏，照按下时抓着它的那一点跟着走
      const into = overFrame(e.clientX, e.clientY);
      const [dx, dy] = into ? [-GHOST_BESIDE, -GHOST_BESIDE] : [drag.offX!, drag.offY!];
      drag.ghost!.style.transform = `translate(${e.clientX - dx}px, ${e.clientY - dy}px)`;
      if (!into) computeDrop(e.clientX, e.clientY);
    };
    const onUp = () => { if (drag) finish(true); };
    const onCancel = () => { if (drag) finish(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drag?.started) { e.preventDefault(); e.stopImmediatePropagation(); finish(false); }
    };
    const onClickCapture = (e: MouseEvent) => {
      if (suppressClick) { suppressClick = false; e.stopPropagation(); e.preventDefault(); }
    };
    const onDragStart = (e: DragEvent) => e.preventDefault();

    scroller.addEventListener('pointerdown', onDown);
    scroller.addEventListener('dragstart', onDragStart);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('click', onClickCapture, true);
    return () => {
      scroller.removeEventListener('pointerdown', onDown);
      scroller.removeEventListener('dragstart', onDragStart);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('click', onClickCapture, true);
    };
  }, [scrollRef, lineRef]);
}
