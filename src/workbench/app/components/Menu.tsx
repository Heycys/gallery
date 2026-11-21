import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type MutableRefObject, type ReactNode, type Ref } from 'react';
import { createPortal } from 'react-dom';
import { pushLayer } from '../lib/layers';
import { growFrom, useFadesOut } from '../lib/menuMotion';
import { clamp, cls } from '../lib/util';
import { Icon } from './Icon';
import type { IconName } from './icons';

/** 菜单条目的声明式描述；侧栏菜单、块菜单共用同一套样式（条目高 28、间距 1px） */
export type MenuEntry =
  | {
      kind?: 'item';
      key?: string;
      icon?: IconName | ReactNode;
      label: string;
      /** 标签下面的一行灰字（批注列表的原文），过长时省略 */
      detail?: string;
      /** 右边的灰字（快捷键、个数）；可以是跟着数据变的元素（回收区的个数），空的不占位 */
      kbd?: ReactNode;
      /** 悬停时的提示（Tooltip 的 data-tip） */
      tip?: string;
      check?: boolean;
      arrow?: boolean;
      danger?: boolean;
      /** 灰着、点了没反应、键盘也跳过它（例如还没有批注时的复制批注） */
      disabled?: boolean;
      /** 字灰着但照样能点（批注列表里已处理的那些） */
      muted?: boolean;
      onSelect?: () => void;
      /** 子菜单的内容（这一行右边显示 ›，见 MenuList）；submenuClass 加在子菜单的外壳上（例如 menu-wide） */
      submenu?: () => ReactNode;
      submenuClass?: string;
    }
  | { kind: 'switch'; key?: string; icon?: IconName | ReactNode; label: string; tip?: string; value: () => boolean; onChange: (on: boolean) => void | Promise<void>;
      /** Optional shared asynchronous state; local preference switches keep their existing behavior. */
      subscribe?: (listener: () => void) => () => void; snapshot?: () => { enabled: boolean; busy: boolean } }
  | { kind: 'sep' }
  | { kind: 'head'; label: string }
  | { kind: 'foot'; content: ReactNode }
  | { kind: 'note'; content: ReactNode }
  | { kind: 'empty'; label: string };

export type MenuItemEntry = Extract<MenuEntry, { label: string; kind?: 'item' }>;
type SwitchEntry = Extract<MenuEntry, { kind: 'switch' }>;

const renderIcon = (icon: MenuItemEntry['icon']) =>
  typeof icon === 'string' ? <Icon name={icon as IconName} /> : icon;

export function MenuItem({ entry, active, open, onClick, onMouseMove, onMouseLeave, rowRef }: {
  entry: MenuItemEntry;
  active?: boolean;
  /** 它的子菜单开着 */
  open?: boolean;
  onClick?: () => void;
  onMouseMove?: () => void;
  onMouseLeave?: () => void;
  rowRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={rowRef}
      className={cls('menu-item', entry.icon == null && 'noicon', entry.danger && 'danger', entry.disabled && 'off', entry.muted && 'muted', active && !entry.disabled && 'active')}
      role="menuitem"
      aria-disabled={entry.disabled || undefined}
      aria-haspopup={entry.submenu ? 'menu' : undefined}
      aria-expanded={entry.submenu ? Boolean(open) : undefined}
      data-key={entry.key}
      data-tip={entry.tip}
      onClick={onClick}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
    >
      {/* 没有图标的一行（语言、下拉选择）不留空的图标位，字和小标题对齐（components.css .noicon） */}
      {entry.icon != null && <span className="mi-icon">{renderIcon(entry.icon)}</span>}
      {entry.detail
        ? <span className="mi-label"><span className="mi-line">{entry.label}</span><span className="mi-line mi-detail">{entry.detail}</span></span>
        : <span className="mi-label">{entry.label}</span>}
      {entry.kbd != null && entry.kbd !== '' && <span className="mi-kbd">{entry.kbd}</span>}
      {(entry.arrow || entry.submenu) && <span className="mi-arrow"><Icon name="chevron" /></span>}
      {entry.check && <span className="mi-check"><Icon name="check" /></span>}
    </div>
  );
}

export function MenuEntryView({ entry, children }: { entry: MenuEntry; children?: ReactNode }) {
  switch (entry.kind) {
    case 'sep': return <div className="menu-sep" />;
    case 'head': return <div className="menu-head">{entry.label}</div>;
    case 'foot': return <div className="menu-foot">{entry.content}</div>;
    case 'note': return <div className="menu-note">{entry.content}</div>;
    case 'empty': return <div className="menu-empty">{entry.label}</div>;
    default: return <>{children}</>;
  }
}

/** 带开关的一行（设置里的偏好）：点它只拨开关，菜单不关；开关在最右边，200ms 过渡 */
const noSubscription = () => () => {};
const noSnapshot = () => null;
function SwitchItem({ entry, active, onMouseMove, onMouseLeave, rowRef }: {
  entry: SwitchEntry;
  active?: boolean;
  onMouseMove?: () => void;
  onMouseLeave?: () => void;
  rowRef?: Ref<HTMLDivElement>;
}) {
  const external = useSyncExternalStore(entry.subscribe ?? noSubscription, entry.snapshot ?? noSnapshot);
  const [localOn, setOn] = useState(entry.value);
  const [localBusy, setBusy] = useState(false);
  const pending = useRef(false);
  const on = external?.enabled ?? localOn;
  const busy = Boolean(external?.busy || localBusy);
  const flip = async () => {
    if (busy || pending.current) return;
    pending.current = true;
    setBusy(true);
    if (!external) setOn(!on);
    try { await entry.onChange(!on); }
    finally { setOn(entry.value()); pending.current = false; setBusy(false); }
  };
  return (
    <div ref={rowRef} className={cls('menu-item', active && 'active')} role="menuitemcheckbox" aria-checked={on} aria-disabled={busy} aria-busy={busy || undefined} data-key={entry.key} data-tip={entry.tip} onClick={flip} onMouseMove={onMouseMove} onMouseLeave={onMouseLeave}>
      <span className="mi-icon">{renderIcon(entry.icon)}</span>
      <span className="mi-label">{entry.label}</span>
      <span className={cls('mi-switch', on && 'on')}><span /></span>
    </div>
  );
}

const TYPING = 'input, textarea, select, [contenteditable="true"]';
const isRow = (entry: MenuEntry): entry is MenuItemEntry | SwitchEntry => (entry.kind === undefined || entry.kind === 'item' || entry.kind === 'switch') && !(entry.kind !== 'switch' && entry.disabled);
const opensSub = (entry: MenuEntry | undefined) => Boolean(entry && (entry.kind === undefined || entry.kind === 'item') && entry.submenu);

/**
 * 子菜单贴在它那一行的右边（那一行在菜单里缩进 4px，看起来和主菜单重叠 4px）、和那一行顶部对齐；右边放不下就放到左边，
 * 下面放不下就和那一行底部对齐，再限制在视口内
 */
function placeSub(el: HTMLElement, row: HTMLElement) {
  const r = row.getBoundingClientRect();
  const w = el.offsetWidth, h = el.offsetHeight, m = 8;
  let x = r.right;
  if (x + w > innerWidth - m) x = r.left - w;
  let y = r.top;
  if (y + h > innerHeight - 12) y = r.bottom - h;
  el.style.left = `${clamp(x, m, Math.max(m, innerWidth - w - m))}px`;
  el.style.top = `${clamp(y, m, Math.max(m, innerHeight - h - m))}px`;
}

/**
 * 子菜单里有自己收键盘的控件（data-own-keys：字体与布局的按钮）就把焦点给它标出的那个（data-menu-focus：当前的字体），
 * 没有标出的才给第一个按钮；给了返回 true。用键盘打开子菜单时（Submenu），和子菜单已经开着时在那一行按 → 或回车（MenuList）
 */
function focusOwnKeys(el: HTMLElement | null) {
  if (!el?.querySelector('[data-own-keys]')) return false;
  const target = el.querySelector<HTMLElement>('[data-menu-focus]') ?? el.querySelector<HTMLElement>('button');
  target?.focus({ preventScroll: true });
  return Boolean(target);
}

/**
 * 子菜单的外壳（.menu-sub：在它里面按下不算点在菜单外面，见 PopoverHost）；内容变了（例如回收区恢复了一项）就重新摆。
 * 在它里面按下不拿走焦点（mousedown 时 preventDefault），键盘还归菜单；输入框除外
 */
function Submenu({ entry, row, onEnter, elRef: ref, keyboard, menu }: { entry: MenuItemEntry; row: HTMLElement; onEnter: () => void; elRef: MutableRefObject<HTMLDivElement | null>; keyboard: boolean; menu: () => HTMLElement | null }) {
  useFadesOut(ref);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const place = () => placeSub(el, row);
    place();
    // 从那一行的那一边长出来（贴在右边就是左上角）；用键盘打开的不做动画
    growFrom(el, row.getBoundingClientRect(), keyboard);
    const ro = new ResizeObserver(place);
    ro.observe(el);
    return () => ro.disconnect();
  }, [row]);
  // 用键盘打开的（→、回车），里面有自己收键盘的控件：焦点进去（focusOwnKeys）；关上时焦点还在里面，就还给菜单
  useLayoutEffect(() => {
    const el = ref.current;
    if (keyboard) focusOwnKeys(el);
    return () => {
      const now = document.activeElement;
      if (el && now && (el.contains(now) || now === document.body)) menu()?.focus({ preventScroll: true });
    };
  }, []);
  return createPortal(
    <div
      ref={ref}
      className={cls('menu', 'menu-sub', entry.submenuClass)}
      role="menu"
      onMouseEnter={onEnter}
      onMouseDown={e => { if (!(e.target as Element).closest(TYPING)) e.preventDefault(); }}
    >
      {entry.submenu?.()}
    </div>,
    document.body,
  );
}

/**
 * 普通菜单：点击条目后先关闭菜单再执行动作（动作里可以再打开别的浮层）；开关条目不关菜单。
 * 焦点行：打开时没有，鼠标移到哪一行就是哪一行，离开那一行就没有了（和报告页的块菜单、:hover 一样；键盘移到的行、有子菜单的行留着），
 * ↑ / ↓ 在各行之间移动（到头接到另一头），回车执行它。
 * 有子菜单的行：悬停 120ms 打开，移到别的行 100ms 后关上（这期间移进子菜单就留着）；
 * 点一下、键盘 → 也打开；← 或 Esc 关上子菜单（Esc 再按一次关菜单）。
 * 键盘归拿着焦点的菜单（菜单自己拿焦点收键盘）：打开时菜单拿焦点，按键落在菜单或它的子菜单里才算，
 * 所以从子菜单打开的对话框（永久删除）按键归对话框；关上时焦点还给打开前拿着它的地方（例如导出对话框的下拉框）。
 * scrolled：前这么多条在一个自己滚动的框里（.menu-scroll，批注列表的各行），后面的留在它下面不动。
 */
export function MenuList({ entries, onDone, scrolled = 0 }: { entries: MenuEntry[]; onDone: () => void; scrolled?: number }) {
  const [active, setActive] = useState(-1);
  const [sub, setSub] = useState<number | null>(null);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const timer = useRef(0);
  const hovered = useRef(-1);
  const subEl = useRef<HTMLDivElement | null>(null);
  const state = useRef({ active });
  state.current = { active };
  // 开着的子菜单在改的那一刻就记下（不等重画）：关的计时器刚到、还没重画时指针回到这一行，也要再打开
  const opened = useRef<number | null>(null);
  // 子菜单是不是用键盘打开的（→、回车）：是的话焦点进它里面自己收键盘的控件（Submenu）
  const byKeyboard = useRef(false);
  const showSub = (index: number | null, keyboard = false) => { opened.current = index; byKeyboard.current = keyboard; setSub(index); };

  useEffect(() => () => clearTimeout(timer.current), []);
  // 子菜单开着时 Esc 先关它
  useEffect(() => (sub === null ? undefined : pushLayer(() => showSub(null))), [sub]);

  const openSub = (index: number, keyboard = false) => {
    clearTimeout(timer.current);
    setActive(index);
    showSub(index, keyboard);
  };
  const hover = (index: number) => {
    setActive(index);
    clearTimeout(timer.current);
    if (opened.current === index) return;
    const opens = opensSub(entries[index]);
    timer.current = window.setTimeout(() => showSub(opens ? index : null), opens ? 120 : 100);
  };
  const rowProps = (index: number) => ({
    active: active === index,
    rowRef: (el: HTMLDivElement | null) => { rows.current[index] = el; },
    onMouseMove: () => { if (hovered.current !== index) { hovered.current = index; hover(index); } },
    onMouseLeave: () => {
      if (hovered.current !== index) return;
      hovered.current = -1;
      if (!opensSub(entries[index])) setActive(at => (at === index ? -1 : at));
    },
  });

  // 菜单（PopoverHost 的 .menu）打开时拿焦点，记下打开前拿着它的元素。焦点在报告页里时（只有脚本的点击会这样打开菜单）
  // 留在那里：它的按键归报告页，也不在关上时还给 iframe（那会让工作台失去焦点、关掉随后打开的浮层）
  const menuEl = useRef<HTMLElement | null>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const root = rows.current.find(Boolean)?.closest<HTMLElement>('.menu');
    if (!root) return;
    menuEl.current = root;
    const before = document.activeElement as HTMLElement | null;
    if (before instanceof HTMLIFrameElement) return;
    if (before && before !== document.body && !root.contains(before)) returnTo.current = before; // React 开发时重跑一次效果：那时焦点已在菜单里
    root.tabIndex = -1;
    root.focus({ preventScroll: true });
  }, []);
  // 真关上时（菜单已经不在页面里；开发时 React 模拟的卸载不算）焦点还在菜单里、掉到了 body，就还回去（例如导出对话框的下拉框）。
  // 打开它的按钮这时看不见了（侧栏一行的 ···：指针不在那一行上就收起）：焦点给那一行（它能拿焦点；一栏的标题给它的名字那个按钮），不掉到页面上
  useEffect(() => () => {
    if (menuEl.current?.isConnected) return;
    const now = document.activeElement;
    const lost = !now || now === document.body || menuEl.current?.contains(now) || subEl.current?.contains(now);
    const to = returnTo.current;
    if (!lost || !to?.isConnected) return;
    to.focus({ preventScroll: true });
    if (document.activeElement === to) return;
    const near = to.closest<HTMLElement>('.row, .sb-page') ?? to.closest('.sec-head')?.querySelector<HTMLElement>('.sec-toggle');
    near?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const focusable = entries.map((entry, index) => (isRow(entry) ? index : -1)).filter(index => index >= 0);
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !focusable.length) return;
      const target = e.target as Element | null;
      const root = rows.current.find(Boolean)?.closest('.menu');
      if (!target || !(root?.contains(target) || subEl.current?.contains(target))) return; // 焦点不在菜单里（例如对话框）：不是给菜单的
      if (target.closest?.(TYPING)) return; // 在输入框里打字的键归输入框
      if (subEl.current?.contains(target) && target.closest?.('[data-own-keys]')) return; // 子菜单里自己收键盘的控件（字体与布局）：它的键归它，Esc 照旧关子菜单
      const { active: at } = state.current;
      const open = opened.current;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const step = e.key === 'ArrowDown' ? 1 : -1;
        const from = focusable.indexOf(at);
        const next = focusable[from < 0 ? (step > 0 ? 0 : focusable.length - 1) : (from + step + focusable.length) % focusable.length];
        clearTimeout(timer.current);
        setActive(next);
        if (open !== null && open !== next) showSub(null);
        rows.current[next]?.scrollIntoView({ block: 'nearest' });
      } else if ((e.key === 'ArrowRight' || e.key === 'Enter') && at >= 0 && opensSub(entries[at])) {
        // 子菜单已经开着（指针停在那一行、点了它打开的）：焦点进它里面自己收键盘的控件；没有那种控件，→ 什么也不做
        if (open !== at) openSub(at, true);
        else if (!focusOwnKeys(subEl.current) && e.key === 'ArrowRight') return;
      } else if (e.key === 'ArrowLeft' && open !== null) showSub(null);
      else if (e.key === 'Enter' && at >= 0) rows.current[at]?.click();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [entries]);

  const shown = sub !== null ? entries[sub] : undefined;
  const views = entries.map((entry, i) =>
    entry.kind === undefined || entry.kind === 'item' ? (
      <MenuItem key={i} entry={entry} open={sub === i} {...rowProps(i)} onClick={() => { if (entry.disabled) return; if (entry.submenu) openSub(i); else { onDone(); entry.onSelect?.(); } }} />
    ) : entry.kind === 'switch' ? (
      <SwitchItem key={i} entry={entry} {...rowProps(i)} />
    ) : (
      <MenuEntryView key={i} entry={entry} />
    ),
  );
  return (
    <>
      {scrolled > 0 && <div className="menu-scroll">{views.slice(0, scrolled)}</div>}
      {views.slice(scrolled)}
      {shown && (shown.kind === undefined || shown.kind === 'item') && rows.current[sub!] && (
        <Submenu key={sub} entry={shown} row={rows.current[sub!]!} elRef={subEl} keyboard={byKeyboard.current} menu={() => menuEl.current} onEnter={() => { clearTimeout(timer.current); setActive(sub!); }} />
      )}
    </>
  );
}
