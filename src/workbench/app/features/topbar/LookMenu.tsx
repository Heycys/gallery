import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import type { MenuEntry } from '../../components/Menu';
import { useStore } from '../../lib/store';
import { cls } from '../../lib/util';
import { sessionStore } from '../../session/sessionStore';
import { setGlobalLook, chooseLook, currentLook } from '../../workspace/commands';
import { workspaceStore } from '../../workspace/store';
import type { DocLook } from '../../workspace/types';
import { LOOK, SERIF_FONT } from '../../../../shared/document-look.mjs';
import { t } from '../../../../shared/i18n/index.mjs';

/**
 * 「更多」里字体与布局的子菜单卡片。四栏，从上到下：
 * - 字体：三个大按钮横排（等线体、衬线体、混合体），上面是用各自的字体写的“Ag”（混合体：A 是衬线的、g 是等线的，
 *   标题衬线、正文等线；和旁边两个一样的字、一样大。试过上下两行（衬线的 Ag 压在小的等线 Ag 上）：意思更直白，
 *   但比旁边两个小、也更乱；“Aa” 换了字母），下面一行小字；悬停有提示
 * - 字体大小（小号、默认、大号）、正文宽度（偏窄、默认、偏宽）、正文间距（紧凑、默认、宽松），按这个顺序（用户 2026-11-07
 *   要正文宽度放在字体大小下面）：三个文字按钮横排，没有边框和底色，只有指针在上面时是灰的
 * 当前选中的那个是蓝的（大按钮是它的“Ag”，文字按钮是字）。点了不关菜单，打开着的报告页马上换上（commands.ts chooseLook）。
 * 选择仅作用于这份文档。底部「设置为全局默认」把当前样式设为所有工作区共用的默认；
 * 文档单独设置的项优先保留。新文档和未设置的项跟随全局默认。
 * 全宽（fullWidthEntry，更多里目录下面的开关）也是这份文档的样子（look.full）：开着时页面不管正文宽度设的是多少都按全宽显示，
 * 所以正文宽度那一栏淡着（还能点，点的宽度记着，关掉全宽后用），提示里说明。
 * 键盘：从「字体与布局」那一行按 → 或回车打开时，焦点落在当前字体上；← → 在一栏里移动，↑ ↓ 换栏，回车或空格选中，
 * Esc 关上卡片回到那一行（MenuList：data-own-keys 里的按键归卡片自己）。
 */

type Key = keyof DocLook;
interface Choice { value: string; label: string; tip?: string }

const SANS_GLYPH = 'var(--font)'; // 工作台的界面字体：和报告页的等线体一样是系统的无衬线
const FONTS: (Choice & { glyph: ReactNode })[] = [
  { value: 'sans', label: t('等线体'), tip: t('无衬线字体，屏幕上读起来清楚，适合任何文档'), glyph: <span style={{ fontFamily: SANS_GLYPH }}>Ag</span> },
  { value: 'serif', label: t('衬线体'), tip: t('标题和正文都用衬线字体，适合长文章'), glyph: <span style={{ fontFamily: SERIF_FONT }}>Ag</span> },
  { value: 'mixed', label: t('混合体'), tip: t('标题用衬线字体，正文用等线体'), glyph: <span><span style={{ fontFamily: SERIF_FONT }}>A</span><span style={{ fontFamily: SANS_GLYPH }}>g</span></span> },
];
// 字体大小只改字（字号和行高），正文宽度是固定的宽度（648、712、776px：默认字号下一行 40、44、48 个字），
// 不随字体大小变，所以提示里说的是默认字号下的字数
const ROWS: { key: Exclude<Key, 'font'>; title: string; choices: Choice[] }[] = [
  { key: 'size', title: t('字体大小'), choices: [{ value: 'small', label: t('小号') }, { value: 'default', label: t('默认') }, { value: 'large', label: t('大号') }] },
  {
    key: 'width', title: t('正文宽度'), choices: [
      { value: 'narrow', label: t('偏窄'), tip: t('默认字号下一行约 {0} 个字', 40) },
      { value: 'default', label: t('默认'), tip: t('默认字号下一行约 {0} 个字', 44) },
      { value: 'wide', label: t('偏宽'), tip: t('默认字号下一行约 {0} 个字', 48) },
    ],
  },
  { key: 'spacing', title: t('正文间距'), choices: [{ value: 'compact', label: t('紧凑') }, { value: 'default', label: t('默认') }, { value: 'loose', label: t('宽松') }] },
];

/** 全宽开着时正文宽度那一栏的提示：这一栏暂时不起作用 */
const WIDTH_OFF_TIP = t('全宽开着时不起作用，关掉全宽后按这里的宽度显示');

/**
 * 更多里目录下面的「全宽」开关（顶栏用）：打开着的报告页马上全宽显示，不管字体与布局里的正文宽度是多少，关掉就回到它原来的宽度；
 * 和字体与布局一样是这份文档的样子，写进它的 doc.json 的 look（chooseLook：页面不重新载入，导出也带着），不是这个浏览器的偏好。
 */
export function fullWidthEntry(slug: string): MenuEntry {
  return {
    kind: 'switch', key: 'full-width', icon: 'fullWidth', label: t('全宽'), tip: t('不管字体与布局里的正文宽度设成多少，页面都按全宽显示'),
    value: () => currentLook(slug).full === 'full',
    onChange: (on: boolean) => chooseLook(slug, 'full', on ? 'full' : 'default'),
  };
}

/**
 * 更多里全宽下面的「宽表格」开关（用户 2026-11-20 说的「表格跨越边界」）：比正文宽、直接在正文里的表格在它那一行居中，
 * 左右都可以超出正文的边，最宽到页面两边（和全宽时一样的边距）；连这么宽都放不下才在表格自己的框里左右滚动。高亮块、分栏、
 * 折叠块、选项卡、列表里的表格不变（容器有自己的框）。默认关；和全宽一样是这份文档的样子（look.tables，chooseLook），导出也带着。
 */
export function wideTablesEntry(slug: string): MenuEntry {
  return {
    kind: 'switch', key: 'wide-tables', icon: 'wideTables', label: t('宽表格'), tip: t('比正文宽的表格居中显示，左右可以超出正文，最宽到页面两边；再放不下才左右滚动'),
    value: () => currentLook(slug).tables === 'wide',
    onChange: (on: boolean) => chooseLook(slug, 'tables', on ? 'wide' : 'default'),
  };
}

export function LookCard({ slug }: { slug: string }) {
  // 跟着打开着的报告页（它上报的 look）和目录（doc.json 的 look）重画
  useStore(sessionStore, s => s.look);
  useStore(workspaceStore, s => s.reports[slug]?.look);
  const look = currentLook(slug);
  const chosen = (key: Key) => look[key] ?? LOOK[key][0];
  const full = chosen('full') === 'full'; // 全宽开着：它说了算，正文宽度这一栏暂时不起作用
  const card = useRef<HTMLDivElement>(null);

  // ← → 在一栏里，↑ ↓ 换到上一栏、下一栏的同一个位置
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const rows = [...(card.current?.querySelectorAll<HTMLElement>('[data-look-row]') ?? [])];
    const row = rows.findIndex(each => each.contains(target));
    if (row < 0) return;
    const buttons = (index: number) => [...rows[index].querySelectorAll<HTMLButtonElement>('button')];
    const at = buttons(row).indexOf(target as HTMLButtonElement);
    // 上一栏、下一栏的同一个位置；那一栏没有那么多（最下面只有「应用到全部文档」一个）就是它的最后一个
    const near = (index: number) => { const list = buttons(index); return list[Math.min(at, list.length - 1)]; };
    let next: HTMLButtonElement | undefined;
    if (e.key === 'ArrowLeft') next = buttons(row)[at - 1];
    else if (e.key === 'ArrowRight') next = buttons(row)[at + 1];
    else if (e.key === 'ArrowUp') next = row > 0 ? near(row - 1) : undefined;
    else if (e.key === 'ArrowDown') next = row < rows.length - 1 ? near(row + 1) : undefined;
    else return;
    e.preventDefault();
    next?.focus();
  };

  const radio = (key: Key, choice: Choice) => ({
    type: 'button' as const,
    role: 'radio',
    'aria-checked': chosen(key) === choice.value,
    'data-look': key,
    'data-value': choice.value,
    'data-tip': choice.tip,
    'data-menu-focus': key === 'font' && chosen(key) === choice.value ? '' : undefined,
    onClick: () => chooseLook(slug, key, choice.value),
  });

  return (
    <div ref={card} className="look-card" data-own-keys="" onKeyDown={onKeyDown}>
      <div className="menu-head">{t('字体')}</div>
      <div className="look-fonts" role="radiogroup" aria-label={t('字体')} data-look-row="">
        {FONTS.map(font => (
          <button key={font.value} className={cls('look-font', chosen('font') === font.value && 'on')} {...radio('font', font)}>
            <span className="look-glyph">{font.glyph}</span>
            <span className="look-caption">{font.label}</span>
          </button>
        ))}
      </div>
      {ROWS.map(row => {
        const off = row.key === 'width' && full;
        return (
          <div key={row.key}>
            <div className="menu-head">{row.title}</div>
            <div className={cls('look-row', off && 'look-off')} role="radiogroup" aria-label={row.title} data-look-row="" data-look-off={off ? '' : undefined}>
              {row.choices.map(choice => (
                <button key={choice.value} className={cls('look-option', chosen(row.key) === choice.value && 'on')} {...radio(row.key, off ? { ...choice, tip: WIDTH_OFF_TIP } : choice)}>{choice.label}</button>
              ))}
            </div>
          </div>
        );
      })}
      <div className="menu-sep" />
      <div className="look-row" data-look-row="">
        <button type="button" className="look-option look-apply" data-look-apply="" data-tip={t('所有工作区共用此默认字体与布局，保留文档的单独设置')} onClick={() => setGlobalLook(slug)}>{t('设置为全局默认')}</button>
      </div>
    </div>
  );
}
