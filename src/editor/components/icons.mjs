// The editor's icons as markup: 20×20 line drawings (the menus' CSS draws them, menu.mjs and
// type-grid.mjs), the block types' in thin lines (a serif T, a light H with its level small beside
// it). Pure strings, so components can name their icons in
// their descriptions, which the server loads too.
import { FORMULA_LINES } from "../../shared/math-marks.mjs";

/** A line drawing in a box of `box` units. */
export const svg = (body, box = 20) => `<svg viewBox="0 0 ${box} ${box}" aria-hidden="true">${body}</svg>`;

// The level beside a heading's H, small and on its baseline.
const LEVELS = {
  1: '<path d="M13.25 10.6 15.1 9.25v6"/>',
  2: '<path d="M12.85 10.7a1.85 1.85 0 0 1 3.6.5c0 1.1-.85 1.8-3.65 4.05h3.85"/>',
  3: '<path d="M12.9 9.75h3.35l-1.85 2.1a1.7 1.7 0 1 1-1.55 2.55"/>',
  4: '<path d="M15.6 15.25V9.6l-3.1 4.15h4.2"/>',
};

/** A formula (√x): the format bar's button and the "/" menu's 公式, one drawing. */
export const FORMULA_ICON = svg(FORMULA_LINES);

/** A link (two rings of a chain): the "/" menu's 链接, 链接视图, an empty link's chip, one drawing. */
/** A page (the workbench's plain Lucide file outline, here in 20 units): the "/" menu's 页面, a page block left empty, a page with no icon in a search's rows. */
export const PAGE_ICON = svg('<path d="M5 18.33a1.67 1.67 0 0 1-1.67-1.66V3.33a1.67 1.67 0 0 1 1.67-1.66h6.67a2 2 0 0 1 1.42.58l2.99 2.99a2 2 0 0 1 .59 1.43v10a1.67 1.67 0 0 1-1.67 1.66z"/><path d="M11.67 1.67v4.16c0 .46.37.84.83.84h4.17"/>');

/** A section (分区): blocks gathered between brackets, the block menu's 组成新分区 and the section's line in 设置 › 组件列表. */
export const SECTION_ICON = svg('<path d="M6 3.75h-.75a2 2 0 0 0-2 2v8.5a2 2 0 0 0 2 2H6M14 3.75h.75a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2H14"/><path d="M7.25 7.75h5.5M7.25 12.25h5.5"/>');

/**
 * A custom block (自定义块): a card of text, a rounded square with a short title line over two longer
 * ones. The one mark of a block that has no picture of its own: the "/" menu's row and a block's menu,
 * 添加自定义块's library, and a custom block's line in 设置 › 组件列表. On the 20 box of the icons beside
 * it, so that the menus' stroke (1.25 at 20px) is its stroke too.
 */
export const BLOCK_ICON = svg('<rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2.5"/><path d="M6.75 7h3.5M6.75 10h6.5M6.75 13h4.5"/>');

/** 设置: a ring with eight short rays, the board's card menu and a custom block's handle menu. */
export const SETTINGS_ICON = svg('<circle cx="10" cy="10" r="2.25"/><path d="M10 3.25v1.5M10 15.25v1.5M3.25 10h1.5M15.25 10h1.5M5.2 5.2l1.06 1.06M13.74 13.74l1.06 1.06M5.2 14.8l1.06-1.06M13.74 6.26l1.06-1.06"/>');

/** A detail card (详情卡片): a card with two lines of text. */
export const DIALOG_ICON = svg('<rect x="3.25" y="3.75" width="13.5" height="12.5" rx="2.5"/><path d="M6.5 8h7M6.5 11.5h4.5"/>');
export const LINK_ICON = svg('<g transform="rotate(45 10 10)"><path d="M7 8.5V6a3 3 0 0 1 6 0v2.5M7 11.5V14a3 3 0 0 0 6 0v-2.5M10 7.5v5"/></g>'); // two U's and the line between them, turned 45°

// A speech bubble, round with its lower left a corner, a little rounded.
const BUBBLE = '<path d="M10 16.75A6.75 6.75 0 1 0 3.25 10v5.25a1.5 1.5 0 0 0 1.5 1.5z"/>';
/** 批注: the bubble with two lines of text, the upper longer (a row of the format bar's "更多", the block menu's row). */
export const NOTE_ICON = svg(`${BUBBLE}<path d="M7.5 9h5.5M7.5 12h3.5"/>`);
/** A new 批注: the bubble with a plus (the button beside a block). */
export const NOTE_ADD_ICON = svg(`${BUBBLE}<path d="M10 7v6M7 10h6"/>`);

/** Code (</>): the format bar's inline code and the 代码块 type, one drawing, as wide as the others. */
export const CODE_ICON = svg('<path d="M6.5 5.5 2.25 10l4.25 4.5M13.5 5.5l4.25 4.5-4.25 4.5M11.6 3.75 8.4 16.25"/>');

/** "H" with a heading level beside it. */
export const headingIcon = (level) => svg(`<path d="M3.25 4.75v10.5M10.25 4.75v10.5M3.25 10h7"/>${LEVELS[level]}`);

// A heading's level as the badge right of its fold triangle says it (fold/): "H1"–"H4", the H and the
// figure one height (the user's 2026-11-12: not an H with a small figure), drawn on a 22×16 box.
const LEVEL_FIGURES = {
  1: '<path d="M13 5.4 16 3v10"/>',
  2: '<path d="M12.6 5.6a2.85 2.85 0 0 1 5.6.6c0 1.7-1.5 2.8-5.7 6.8h5.9"/>',
  3: '<path d="M12.8 3h5.3l-2.9 3.6a3.1 3.1 0 1 1-2.8 4.9"/>',
  4: '<path d="M17 13V3l-4.7 6.9h6.4"/>',
};
/** "H1"–"H4": a heading's level badge. */
export const levelIcon = (level) => `<svg viewBox="0 0 22 16" aria-hidden="true"><path d="M2.5 3v10M9.5 3v10M2.5 8h7"/>${LEVEL_FIGURES[level]}</svg>`;

/** A picture (a frame, a sun, a hill): the 图片 type and its placeholder, the icon picker's upload. */
export const PHOTO_ICON = svg('<rect x="3.25" y="4.25" width="13.5" height="11.5" rx="2"/><circle cx="7.5" cy="8.25" r="1.25"/><path d="m3.75 14.25 3.6-3.4a1 1 0 0 1 1.36 0l1.79 1.65 2.1-2.05a1 1 0 0 1 1.4 0l2.75 2.75"/>');

/** A smiling face: the block menu's 更换图标 and 添加图标, the 添加图标 control, the icon picker's people. */
export const FACE_ICON = svg('<circle cx="10" cy="10" r="6.75"/><path d="M7.5 11.5a3 3 0 0 0 5 0"/><circle cx="7.9" cy="8.5" r=".9" fill="currentColor" stroke="none"/><circle cx="12.1" cy="8.5" r=".9" fill="currentColor" stroke="none"/>');
