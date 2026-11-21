// The icon picker's look (index.mjs, emoji-tab.mjs, icon-tab.mjs, upload.mjs, grid.mjs): the editor's
// palette (page/look.mjs, --ge-*), text tabs and gray fills as the formula editor's symbol bar
// (formula/panel.mjs), buttons without a frame, nothing in blue or any other bright color but a switch
// that is on. 408 x 390, 4px under the icon. Its classes: .ge-picker, its parts .ge-picker-*, the color the line
// drawings take --ge-picker-icon. support.mjs style() adds it to the popups' layer (.ge-popup-layer).
export const PICKER_CSS = `
.ge-picker { display: flex; flex-direction: column; max-height: calc(100vh - 24px); border-radius: var(--ge-r-card); background: var(--ge-bg); box-shadow: var(--ge-shadow-card); overflow: hidden; color: var(--ge-tx); font-size: 14px; line-height: 1.2; }

/* The tab bar: 6 8, a --ge-line under it. A tab 26 high, 8 each side, 13px, rounded 6, --ge-tx2; the one
   shown the only gray block (--ge-hover) in --ge-tx, another darkening its words alone under the pointer.
   移除 at its right end, a text button of the same size (as the formula editor's 完成). */
.ge-picker-header { flex-shrink: 0; }
.ge-picker-tabbar { display: flex; align-items: center; gap: 2px; padding: 6px 8px; border-bottom: 1px solid var(--ge-line); overflow: auto hidden; scrollbar-width: none; }
.ge-picker-tabs { display: flex; gap: 2px; }
.ge-picker-tab-wrap { display: flex; }
.ge-picker-tab { display: inline-flex; align-items: center; height: 26px; padding: 0 8px; border-radius: var(--ge-r-ctl); font-size: 13px; white-space: nowrap; color: var(--ge-tx2); cursor: pointer; user-select: none; }
.ge-picker-tab:hover { background: var(--ge-hover); color: var(--ge-tx); }
.ge-picker-tab.selected { background: var(--ge-hover); color: var(--ge-tx); }
.ge-picker-tabbar-right { display: flex; align-items: center; margin-inline-start: auto; }
.ge-picker-text-button { display: flex; align-items: center; height: 26px; padding: 0 8px; border-radius: var(--ge-r-ctl); font-size: 13px; color: var(--ge-tx2); white-space: nowrap; cursor: pointer; user-select: none; }
.ge-picker-text-button:hover { background: var(--ge-hover); color: var(--ge-tx); }

/* The filter row: 8 12 6. The field 28 high on --ge-field, a 1px --ge-edge inside it, which focus only
   deepens (to --ge-ico3, no blue ring). The buttons right of it (随机, the skin tone, the icon color, the
   set) 28 x 28 without a frame, their icons --ge-ico2; --ge-hover under the pointer, --ge-press pressed. */
.ge-picker-filter-row { padding: 8px 12px 6px; }
.ge-picker-filter { display: flex; align-items: center; gap: 4px; }
.ge-picker-input { flex: 1 1 auto; min-width: 0; display: flex; align-items: center; height: 28px; box-sizing: border-box; margin-inline-end: 4px; padding: 0 4px 0 8px; border-radius: var(--ge-r-ctl); background: var(--ge-field); box-shadow: inset 0 0 0 1px var(--ge-edge); cursor: text; }
.ge-picker-input:focus-within { box-shadow: inset 0 0 0 1px var(--ge-ico3); }
.ge-picker-input-icon { display: flex; width: 16px; height: 16px; margin-inline-end: 6px; --ge-picker-icon: var(--ge-ico2); }
.ge-picker-input input { flex: 1; min-width: 0; height: 20px; border: none; outline: none; background: transparent; padding: 0; font: inherit; font-size: 14px; line-height: 20px; color: var(--ge-tx); }
.ge-picker-input input::placeholder { color: var(--ge-tx3); }
.ge-picker-clear { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; --ge-picker-icon: var(--ge-ico3); cursor: pointer; }
.ge-picker-clear[hidden] { display: none; }
.ge-picker-clear:hover { --ge-picker-icon: var(--ge-ico2); }
.ge-picker-filter-right { display: flex; flex: 0 0 auto; align-items: center; gap: 2px; }
.ge-picker-tab-left { display: flex; }
.ge-picker-tab-left:empty { display: none; }
.ge-picker-skin-wrap { display: flex; }
.ge-picker-random, .ge-picker-color-button, .ge-picker-skin { display: flex; align-items: center; justify-content: center; flex: 0 0 auto; width: 28px; height: 28px; box-sizing: border-box; border-radius: var(--ge-r-ctl); --ge-picker-icon: var(--ge-ico2); cursor: pointer; user-select: none; }
.ge-picker-skin img, .ge-picker-skin .ge-emoji-pending { display: block; width: 18px; height: 18px; }
/* The 图标 tab: left of 随机 the set shown (MingCute / Tabler), a click the other one (icon-tab.mjs); 72 wide at least, so a new name moves nothing */
.ge-picker-set-toggle { display: flex; align-items: center; justify-content: center; min-width: 72px; height: 28px; box-sizing: border-box; padding: 0 8px; border-radius: var(--ge-r-ctl); color: var(--ge-tx2); font-size: 12px; font-weight: 500; white-space: nowrap; cursor: pointer; user-select: none; }
.ge-picker-random:hover, .ge-picker-color-button:hover, .ge-picker-skin:hover, .ge-picker-set-toggle:hover { background: var(--ge-hover); color: var(--ge-tx); --ge-picker-icon: var(--ge-ico); }
.ge-picker-random:active, .ge-picker-color-button:active, .ge-picker-skin:active, .ge-picker-set-toggle:active { background: var(--ge-press); }

/* The list: in the 表情符号 tab above the category bar, in the 图标 tab all the rest. The scroller is
   positioned, so a group's offsetTop counts from it (a category's button scrolls its group to the top). */
.ge-picker-content { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.ge-picker-body { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.ge-picker-scroller { position: relative; flex: 1 1 auto; min-height: 0; padding-bottom: 6px; overflow: hidden auto; overscroll-behavior: contain; }
.ge-picker-section { display: flex; flex-direction: column; }
/* A group's title sticks to the list's top as it scrolls (the next one pushes it away): 28 high, 12px / 500,
   --ge-tx2, on the card's own color; 16 from the left, where the first column's emoji and the tabs' words start
   (the rows' 12 and a cell's 4) */
.ge-picker-section-title { position: sticky; top: 0; z-index: 1; display: flex; align-items: flex-end; height: 28px; box-sizing: border-box; padding: 0 16px 6px; background: var(--ge-bg); font-size: 12px; font-weight: 500; line-height: 16px; color: var(--ge-tx2); user-select: none; }
.ge-picker-section-title-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ge-picker-rows { display: flex; flex-direction: column; padding: 0 12px; }
.ge-picker-row { display: flex; }
/* A cell 32 x 32, rounded 6, its emoji or icon 24: --ge-hover under the pointer, --ge-press where the keys moved to (no blue ring) */
.ge-picker-cell { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 32px; height: 32px; border-radius: var(--ge-r-ctl); font-size: 24px; line-height: 1; cursor: pointer; user-select: none; }
.ge-picker-cell.focused { background: var(--ge-hover); }
.ge-picker-cell.focus-visible { background: var(--ge-press); }
.ge-picker-cell img { display: block; }
.ge-picker-cell img.ge-custom-emoji { object-fit: contain; color: transparent; }
/* 添加自定义表情: the custom group's first cell, a round plus (26, 3 around, the plus --ge-ico3, no line round
   it: gray under the pointer as a cell); with no result, a button (28 high, 13px / 500, no line either) */
.ge-picker-cell.ge-picker-add-cell { width: 26px; height: 26px; margin: 3px; box-sizing: border-box; border-radius: 50%; --ge-picker-icon: var(--ge-ico3); }
.ge-picker-cell.ge-picker-add-cell.focused { --ge-picker-icon: var(--ge-ico); }
.ge-picker-empty { padding: 8px 12px; }
.ge-picker-empty-caption { display: flex; align-items: center; height: 20px; padding: 0 4px; font-size: 12px; font-weight: 500; color: var(--ge-tx3); }
.ge-picker-empty.with-add { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; }
.ge-picker-cell.ge-picker-add-button { justify-content: flex-start; gap: 6px; width: max-content; height: 28px; padding: 0 10px 0 8px; box-sizing: border-box; border-radius: var(--ge-r-ctl); font-size: 13px; font-weight: 500; line-height: 1; color: var(--ge-tx); white-space: nowrap; --ge-picker-icon: var(--ge-ico2); }

/* The category bar: a --ge-line above it, 6 12 8; buttons 28 x 28, icons 18 in --ge-ico3; the group scrolled
   to on --ge-hover, its icon --ge-ico; a group with no emoji faded to .35 and not to be clicked (自定义 and
   添加 always can) */
.ge-picker-categories { display: flex; justify-content: space-between; flex-shrink: 0; padding: 6px 12px 8px; border-top: 1px solid var(--ge-line); }
.ge-picker-categories[hidden] { display: none; }
.ge-picker-category { display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: var(--ge-r-ctl); --ge-picker-icon: var(--ge-ico3); cursor: pointer; }
.ge-picker-category:hover { background: var(--ge-hover); --ge-picker-icon: var(--ge-ico2); }
.ge-picker-category.focused { background: var(--ge-hover); --ge-picker-icon: var(--ge-ico); }
.ge-picker-category.disabled { opacity: var(--ge-off); cursor: default; background: none; }

/* The small popups: the skin tones of an emoji or to choose (one row), an icon's colors (two rows of 5), the
   icon color's menu; the card's color, shadow and corners */
.ge-picker-variations, .ge-picker-icon-variations, .ge-picker-color-menu { border-radius: var(--ge-r-card); background: var(--ge-bg); box-shadow: var(--ge-shadow-card); }
.ge-picker-variations { display: flex; gap: 2px; padding: 4px; }
.ge-picker-icon-variations { padding: 4px; }
.ge-picker-icon-variations-row { display: flex; gap: 2px; }
.ge-picker-color-menu { width: 160px; box-sizing: border-box; padding: 6px; }
.ge-picker-color-row { display: flex; justify-content: space-between; padding: 2px 0; }
.ge-picker-color-row.dim { opacity: .5; }
.ge-picker-color-swatch { display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 6px; opacity: .45; cursor: pointer; }
.ge-picker-color-swatch.selected, .ge-picker-color-swatch:hover { opacity: 1; background: var(--ge-hover); }
.ge-picker-color-ask { display: flex; margin: 6px -6px 0; padding: 6px 6px 0; border-top: 1px solid var(--ge-line); }
.ge-picker-color-ask-item { display: flex; align-items: center; gap: 8px; width: 100%; height: 28px; padding: 0 6px; border-radius: var(--ge-r-row); font-size: 13px; color: var(--ge-tx); cursor: pointer; user-select: none; }
.ge-picker-color-ask-item:hover { background: var(--ge-hover); }
.ge-picker-color-ask-label { flex: 1; white-space: nowrap; }
/* 每次先选颜色's switch, every switch's one look (a design review, 2026-11-17): 30 x 18, its knob 14 and white, the track --ge-switch-track off and
   --ge-control-blue on, 160ms; the knob 3px wider while pressed. */
.ge-picker-switch { display: flex; flex-shrink: 0; width: 26px; height: 14px; padding: 2px; box-sizing: content-box; border-radius: 9px; background: var(--ge-switch-track); transition: background 160ms cubic-bezier(.32, .72, 0, 1); }
.ge-picker-switch.on { background: var(--ge-control-blue); justify-content: flex-end; }
.ge-picker-switch-knob { width: 14px; height: 14px; border-radius: 7px; background: #fff; transition: width 160ms cubic-bezier(.32, .72, 0, 1); }
:active > .ge-picker-switch .ge-picker-switch-knob, .ge-picker-switch:active .ge-picker-switch-knob { width: 17px; }

/* The 上传 tab and the 添加自定义表情 popup (upload.mjs): the zone an image goes in on --ge-field, a 1px
   --ge-edge inside it, rounded 8, deeper while a file is dragged over it (--ge-hover, --ge-ico3), never blue;
   保存 the pale blue primary and 取消 / 返回 the plain text button (look.mjs BUTTONS: .ge-btn, dimmed while it cannot be
   clicked); the checkbox checked --ge-tx2 with a white tick; an error --ge-red */
.ge-picker-upload { display: flex; flex-direction: column; padding: 0 16px; font-size: 14px; color: var(--ge-tx); }
.ge-picker-upload-title { margin-top: 14px; font-size: 14px; font-weight: 600; }
.ge-picker-upload-description { margin-top: 2px; font-size: 12px; color: var(--ge-tx2); }
.ge-picker-upload-zone-wrap { display: flex; flex-direction: column; align-items: stretch; margin-top: 16px; }
.ge-picker-upload-zone { border-radius: 8px; background: var(--ge-field); }
.ge-picker-upload-zone-wrap.dragover .ge-picker-upload-zone { background: var(--ge-hover); }
.ge-picker-upload-button { display: flex; align-items: center; justify-content: center; gap: 8px; padding: 18px 14px; border-radius: 8px; font-weight: 500; line-height: 1.2; white-space: nowrap; color: var(--ge-tx2); --ge-picker-icon: var(--ge-ico2); cursor: pointer; user-select: none; }
.ge-picker-upload-button:hover { background: var(--ge-hover); color: var(--ge-tx); }
.ge-picker-upload-preview { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 12px; }
.ge-picker-upload.large .ge-picker-upload-preview { padding: 16px; }
.ge-picker-upload-preview.with-replace { padding-bottom: 4px; }
.ge-picker-upload-preview-label { margin-bottom: 4px; font-size: 12px; color: var(--ge-tx2); }
.ge-picker-upload-preview-row { display: flex; align-items: center; gap: 6px; }
.ge-picker-upload-preview-row img { width: 48px; height: 48px; padding: 8px; box-sizing: border-box; border: 1px solid var(--ge-edge); border-radius: 8px; object-fit: cover; }
.ge-picker-upload.large .ge-picker-upload-preview-row img { width: 80px; height: 80px; padding: 6px; }
.ge-picker-upload-zone.contain .ge-picker-upload-preview-row img { object-fit: contain; }
.ge-picker-upload-preview-row img.light { background: #fff; }
.ge-picker-upload-preview-row img.dark { background: #191919; }
.ge-picker-upload-replace { display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 8px; border-radius: var(--ge-r-ctl); font-size: 12px; font-weight: 500; color: var(--ge-tx2); --ge-picker-icon: var(--ge-ico2); cursor: pointer; user-select: none; }
.ge-picker-upload-replace:hover { background: var(--ge-hover); }
.ge-picker-upload-paste { margin-top: 10px; font-size: 12px; color: var(--ge-tx3); text-align: center; }
.ge-picker-upload-error { margin-top: 10px; font-size: 12px; color: var(--ge-red); text-align: center; }
.ge-picker-upload-confirm { display: flex; align-items: center; gap: 8px; margin-top: 12px; font-size: 14px; cursor: pointer; user-select: none; }
.ge-picker-upload-checkbox { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 14px; height: 14px; box-sizing: border-box; border: 1px solid var(--ge-ico3); border-radius: 3px; cursor: pointer; transition: background .2s ease-out; }
.ge-picker-upload-checkbox[aria-checked="true"] { border-color: transparent; background: var(--ge-tx2); }
.ge-picker-upload-name { display: block; margin-top: 20px; }
.ge-picker-upload-name-label { margin-bottom: 6px; font-size: 12px; font-weight: 500; color: var(--ge-tx2); }
.ge-picker-upload-input { display: flex; align-items: center; height: 28px; box-sizing: border-box; padding: 0 8px; border-radius: var(--ge-r-ctl); background: var(--ge-field); box-shadow: inset 0 0 0 1px var(--ge-edge); cursor: text; }
.ge-picker-upload-input:focus-within { box-shadow: inset 0 0 0 1px var(--ge-ico3); }
.ge-picker-upload-input input { flex: 1; min-width: 0; height: 20px; border: none; outline: none; background: transparent; padding: 0; font: inherit; font-size: 14px; line-height: 20px; color: var(--ge-tx); }
.ge-picker-upload-input input::placeholder { color: var(--ge-tx3); }
.ge-picker-upload-name-error { margin-top: 10px; font-size: 12px; color: var(--ge-red); }
.ge-picker-upload-name-error[hidden], .ge-picker-upload [hidden] { display: none; }
.ge-picker-upload-footer { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 16px 0 12px; }
.ge-picker-upload-secondary, .ge-picker-upload-save { font-size: 14px; }
.ge-picker-custom-emoji-popup { min-width: 280px; border-radius: var(--ge-r-card); background: var(--ge-bg); box-shadow: var(--ge-shadow-card); }

/* A button reached by Tab: a gray fill, not the browser's dark or blue ring; the checkbox a gray ring */
.ge-picker [role="button"]:focus-visible, .ge-picker-custom-emoji-popup [role="button"]:focus-visible { outline: none; background: var(--ge-hover); }
.ge-picker-upload-checkbox:focus-visible { outline: 1px solid var(--ge-ico3); outline-offset: 2px; }

/* Icons: the editor's own line drawings (icons.mjs), in the color --ge-picker-icon gives where they are (the media menu's are in this layer too) */
.ge-popup-layer svg:not(.ge-glyph) { fill: none; stroke: var(--ge-picker-icon, currentColor); stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.ge-picker-upload-checkbox { --ge-picker-icon: #fff; }
.ge-picker-upload-checkbox svg { stroke-width: 2; }
`;
