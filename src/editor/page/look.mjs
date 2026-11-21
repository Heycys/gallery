// What every popup of the editor is painted with, written once: a neutral palette of warm grays, its
// blue and its two shadows, light and dark by light-dark() (the page's color-scheme decides). A sheet of
// `:root` custom properties and the one button look (BUTTONS), put in every document the editor draws in (ui.mjs addStyleTo), so a
// menu, a card, a bar, a notice reads them wherever it stands and none declares a palette of its
// own. The page's content colors (--doc-*, the kit's tokens.css) are another matter.
//
// The blue is two tokens, for two jobs: --ge-accent (a switch, a chosen icon, a table's tools, the
// bars that mark a place) and --ge-focus (the ring round a focused field). A button is
// neither: the one button look is BUTTONS below, whose primary is a pale blue (--ge-btn-primary*), the
// workbench's, never the solid --ge-accent.
//
// The shape and depth of what floats (a design review the owner confirmed, 2026-11-17), one rule
// per kind, all from the tokens below:
// - a card (--ge-r-card 14, --ge-card-pad 5 round its rows, --ge-shadow-card): every menu (menu.mjs: the
//   "/" menu, the block menu, the @ menu, a link's views, a table's menus, a code block's languages…), the
//   format bar's panels (its colors, its line, 更多, the types beside it), the link card, the formula editor,
//   the icon picker, the media menu, a 批注's card, the outline's card, a board's settings, the conflict card
//   and the lost texts' panel;
// - a bar (--ge-shadow-bar, a lighter shadow: it sits on the text): the format bar and the table cells'
//   bar (14, padding 6), the bar of the Agent's changes (44 high, 14), the small bars on a picture (their
//   tools' radius and their padding);
// - a row inside a card --ge-r-row 9, the rows flush (no gap); a control (a button, a tool, an icon
//   button, a field, a cell of a grid) --ge-r-ctl 8; a small one at a row's end --ge-r-small 6;
// - the fills, in the text's warm gray: --ge-hover 5% (a plain button under the pointer), --ge-hover-row
//   7% (a row of a card under the pointer or the keys), --ge-press 10% (pressed); a row that takes
//   something away for good the pale red --ge-danger-tint, its words red;
// - under the pointer a fill shows at once and fades out over 100ms when the pointer leaves (CONTROLS
//   below); pressed it goes a step deeper at once; nothing scales.
// How a card comes and goes is ui.mjs appear() and fadeAway(). Tooltips and notices keep their own look.
// --ge-shadow stays for a notice (notices.mjs); every card and bar takes one of the two above. The icon
// picker reads this palette too (emoji-picker/styles.mjs); emoji-picker/support.mjs keeps an older set of
// --c-* variables only for the media menu and the image's alignment bar, its popup and shadow taken from
// these.

/**
 * The one look of a button the editor draws on a page (the Agent changes' bar, the conflict card and the lost
 * texts' panel, the crop window, a list's number, the icon picker's upload, the media menu): rules in the
 * palette's sheet, so that every document the editor draws in has them from the first paint and no style
 * repeats them. `.ge-btn` is a text button (ui.mjs textButton): no line and no fill, a gray under the
 * pointer and while the keys are on it, a deeper one pressed; `data-primary` the pale blue (add, confirm,
 * save), with `data-danger` the pale red (a delete); `data-quiet` a small one for looking, not deciding
 * (收起, 定位). `.disabled` and `aria-disabled` are how a button made of a div says it cannot be pressed.
 * `.ge-icon-btn` is the look of an icon button standing alone (a 批注's marker and its delete): no fill under
 * the pointer (the icon goes darker), a gray only while it is pressed. The tools of a bar (the format bar's,
 * the link card's) and a menu's rows are gray under the pointer. Text fields are not buttons: they
 * keep their thin outline. A button is 28px high with 8px each side; its words are of the text's
 * weight, a primary's 500; one that cannot be pressed stands at --ge-off.
 *
 * Keys on a tool (FOCUSED): its fill, the gray under the pointer, and no line (an icon button's too:
 * the gray it has pressed would say it was pressed). Where a fill cannot show (a color's swatch, a
 * switch), a ring: the surface's color, then 2px of the focus blue (RING).
 */
const OFF = ":disabled, .disabled, [aria-disabled=\"true\"]";
const FOCUSED = ".ge-tool, .ge-format-turn, .ge-more-item, .ge-link-tool, .ge-link-view, .ge-link-open, .ge-fx-group, .ge-fx-cell, .ge-crop-shape, .ge-type";
/**
 * Every control of the editor's cards and bars whose fill comes under the pointer (or the keys) and goes:
 * the fill shows at once and fades out over 100ms when it goes (a design review, 2026-11-17); pressed, the
 * deeper fill at once. One rule here, none in the sheets of their own (where a control's transition also
 * moves something else, its own sheet says both).
 */
const CONTROLS = ".ge-btn, .ge-icon-btn, .ge-tool, .ge-format-turn, .ge-more-item, .ge-link-tool, .ge-link-view, .ge-link-open, .ge-type, .ge-pop-row, .ge-pop-main, .ge-pop-more, .ge-fx-group, .ge-fx-cell, .ge-swatch, .ge-color-cell, .ge-media-tool, .ge-board-pick, .ge-board-add, .ge-home-hint-close, .ge-picker-tab, .ge-picker-text-button, .ge-picker-random, .ge-picker-color-button, .ge-picker-skin, .ge-picker-set-toggle, .ge-picker-cell, .nmedia-menu-tab";
/** The ring of a control a fill cannot show on: 2px of the surface's color, then 2px of the focus blue. */
export const RING = "0 0 0 2px var(--ge-bg), 0 0 0 4px var(--ge-focus)";
export const BUTTONS = `
  :where(${CONTROLS}) { transition: background-color 100ms ease-out, color 100ms ease-out; }
  :where(${CONTROLS}):is(:hover, :active, :focus-visible, [data-active], [aria-expanded="true"]) { transition: none; }
  .ge-btn { box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; height: 28px; margin: 0; padding: 0 8px; border: 0; border-radius: var(--ge-r-ctl); box-shadow: none; background: transparent; color: var(--ge-tx); font: inherit; font-weight: 400; line-height: 1; white-space: nowrap; cursor: pointer; user-select: none; }
  .ge-btn:is(:hover, :focus-visible):not(${OFF}) { outline: none; background: var(--ge-hover); }
  .ge-btn:active:not(${OFF}) { background: var(--ge-press); }
  .ge-btn[data-primary] { background: var(--ge-btn-primary); color: var(--ge-btn-primary-text); font-weight: 500; }
  .ge-btn[data-primary]:is(:hover, :focus-visible):not(${OFF}) { background: var(--ge-btn-primary-hover); }
  .ge-btn[data-primary]:active:not(${OFF}) { background: var(--ge-btn-primary-press); }
  .ge-btn[data-primary][data-danger] { background: var(--ge-btn-danger); color: var(--ge-btn-danger-text); }
  .ge-btn[data-primary][data-danger]:is(:hover, :focus-visible):not(${OFF}) { background: var(--ge-btn-danger-hover); }
  .ge-btn[data-primary][data-danger]:active:not(${OFF}) { background: var(--ge-btn-danger-press); }
  .ge-btn[data-quiet] { height: 24px; padding: 0 6px; color: var(--ge-tx2); font-weight: 400; }
  .ge-btn[data-quiet]:is(:hover, :focus-visible):not(${OFF}) { color: var(--ge-tx); }
  .ge-btn:is(${OFF}) { opacity: var(--ge-off); cursor: default; }
  .ge-icon-btn { border: 0; border-radius: var(--ge-r-ctl); box-shadow: none; background: transparent; cursor: pointer; }
  .ge-icon-btn:hover:not(:disabled) { color: var(--ge-ico); }
  .ge-icon-btn:active:not(:disabled) { background: var(--ge-press); }
  :is(${FOCUSED}):focus-visible, .ge-icon-btn:focus-visible { outline: none; background: var(--ge-hover); }
  :is(.ge-swatch, .ge-color-cell):focus-visible { outline: none; box-shadow: ${RING}; }
`;

export const TOKENS = `
  :root {
    --ge-tx: light-dark(#2c2c2b, #f0efed);
    --ge-tx2: light-dark(#7d7a75, #ada9a3);
    --ge-tx3: light-dark(#a19e99, #7d7a75);
    /* The workbench's --icoPri, its main icon grey (--icoSec is --ge-ico2's). */
    --ge-ico: light-dark(#5c5a55, #a9a69e);
    --ge-ico2: light-dark(#8e8b86, #ada9a3);
    /* The quietest icon gray: the block handle's dots, its bar and its +. */
    --ge-ico3: light-dark(#ada9a3, #7d7a75);
    --ge-bg: light-dark(#ffffff, #252525);
    --ge-field: light-dark(rgb(66 35 3 / 3%), rgb(252 252 252 / 3%));
    --ge-hover: light-dark(rgb(33 27 23 / 5%), rgb(255 255 255 / 5.5%));
    /* A row of a card under the pointer or the keys, a step over --ge-hover (the workbench's --bacTerTra). */
    --ge-hover-row: light-dark(rgb(42 28 0 / 7%), rgb(255 255 243 / 8.2%));
    --ge-press: light-dark(rgb(33 27 23 / 10%), rgb(255 255 255 / 11%));
    /* A row that takes something away for good, under the pointer: a pale red behind its red words. */
    --ge-danger-tint: light-dark(rgb(235 87 87 / 10%), rgb(255 104 92 / 16%));
    /* Shapes (the header's note above): a control, a card, a row in a card, a small button at a row's end, a dialog's shell; a card's padding round its rows. */
    --ge-r-ctl: 8px;
    --ge-r-card: 14px;
    --ge-r-row: 9px;
    --ge-r-small: 6px;
    --ge-r-shell: 16px;
    --ge-card-pad: 5px;
    --ge-line: light-dark(rgb(42 28 0 / 7%), rgb(255 255 243 / 8.2%));
    --ge-edge: light-dark(rgb(28 19 1 / 11%), rgb(255 255 235 / 10%));
    --ge-outline: light-dark(rgb(42 28 0 / 7%), #383836);
    --ge-line-strong: light-dark(rgb(42 28 0 / 14%), rgb(255 255 243 / 14%));
    --ge-accent: #2783de;
    --ge-accent-hover: #3d93e8;
    --ge-accent-press: #55a2ec;
    --ge-accent-text: light-dark(#2783de, #5e9fe8);
    --ge-focus: #2383e2;
    /* A switch on (the workbench's and the kit's too: a design review, 2026-11-17): a calmer blue than the accent; its track off. */
    --ge-control-blue: light-dark(#4a81d4, #4f7fcb);
    --ge-switch-track: light-dark(rgb(0 0 0 / 16%), rgb(255 255 255 / 20%));
    --ge-red: light-dark(#eb5757, #ff6b6b);
    /* What cannot be pressed or chosen now (a button, a menu's row, a category): at 40% opacity. */
    --ge-off: .4;
    --ge-quote: light-dark(rgb(28 19 1 / 16%), rgb(255 255 235 / 16%));
    /* Buttons (BUTTONS below; the user's rule, restated 2026-11-09): a primary is a pale blue fill, always shown, its words the
       deeper blue; a primary that cannot be taken back a pale red; every other button has no fill and no line, a gray under
       the pointer (--ge-hover) and a deeper one pressed (--ge-press). The workbench's own values (--btnPriBg, --btnDanBg: tokens.css). */
    --ge-btn-primary: light-dark(rgb(35 131 226 / 14%), rgb(67 155 255 / 24%));
    --ge-btn-primary-hover: light-dark(rgb(35 131 226 / 22%), rgb(67 155 255 / 34%));
    --ge-btn-primary-press: light-dark(rgb(35 131 226 / 30%), rgb(67 155 255 / 44%));
    --ge-btn-primary-text: light-dark(#1a69bd, #7ab8ff);
    --ge-btn-danger: light-dark(rgb(235 87 87 / 14%), rgb(255 104 92 / 24%));
    --ge-btn-danger-hover: light-dark(rgb(235 87 87 / 22%), rgb(255 104 92 / 34%));
    --ge-btn-danger-press: light-dark(rgb(235 87 87 / 30%), rgb(255 104 92 / 44%));
    --ge-btn-danger-text: light-dark(#c4403c, #ff9a90);
    --ge-fill: light-dark(rgb(35 131 226 / 14%), rgb(35 131 226 / 28%));
    --ge-halo: rgb(35 131 226 / 14%);
    --ge-select: light-dark(rgb(35 131 226 / 28%), rgb(35 131 226 / 45%));
    /* The same blue as a strip blended over the page (text-select/: multiplied on a light page, screened on a dark one), so the text under it keeps its color. */
    --ge-select-strip: light-dark(rgb(193 220 247), rgb(5 53 100));
    --ge-shadow: 0 20px 24px 0 light-dark(rgb(25 25 25 / 5%), transparent), 0 5px 8px 0 light-dark(rgb(25 25 25 / 2.7%), transparent), 0 0 0 1px var(--ge-outline),
      0 14px 28px -6px light-dark(transparent, rgb(25 25 25 / 20%)), 0 2px 4px -1px light-dark(transparent, rgb(25 25 25 / 11.8%));
    /* A card (a menu, a popover, the conflict card) and a bar on the text (the format bar, the Agent's changes), the bar's a step
       lighter; round both the 1px line of today's --ge-outline (never a half pixel: it smears at 125%), nothing translucent. */
    --ge-shadow-card: 0 0 0 1px var(--ge-outline), 0 2px 8px light-dark(rgb(0 0 0 / 6%), transparent), 0 14px 40px light-dark(rgb(0 0 0 / 16%), rgb(0 0 0 / 50%));
    --ge-shadow-bar: 0 0 0 1px var(--ge-outline), 0 1px 2px light-dark(rgb(0 0 0 / 6%), transparent), 0 6px 20px light-dark(rgb(0 0 0 / 10%), rgb(0 0 0 / 36%));
    --ge-tip-bg: #2c2c2b;
    --ge-tip-tx: #f0efed;
    --ge-tip-tx2: #ada9a3;
    --ge-tip-shadow: 0 4px 12px -2px rgb(0 0 0 / 8%), inset 0 0 0 1px rgb(255 255 255 / 5%);
    /* A notice (notices.mjs): the darkest ink of the palette, the text's own, no black beyond it. */
    --ge-toast-bg: light-dark(#2c2c2b, #2f2f2f);
    /* The quiet gray a heading is lit with for a moment when the outline goes to it (outline/), never a blue. */
    --ge-outline-flash: light-dark(rgb(33 27 23 / 7%), rgb(255 255 255 / 8%));
    /* The lines a size is dragged by (resize/, columns/), translucent grays of the text's ink, never a
       bright blue (the user, 2026-11-07): where a drag may start, the line being dragged, and that line where it snaps. */
    --ge-guide: light-dark(rgb(55 53 47 / 16%), rgb(255 255 255 / 14%));
    --ge-guide-hot: light-dark(rgb(55 53 47 / 36%), rgb(255 255 255 / 32%));
    --ge-guide-snap: light-dark(rgb(55 53 47 / 62%), rgb(255 255 255 / 58%));
    /* 批注 (annotate/): a warm mark on the words an annotation is about, its 2px underline leading (a faint fill, so it is never
       taken for the report's own yellow background), a block anchor's bar; stronger for the one shown. */
    --ge-note: light-dark(rgb(255 212 0 / 6%), rgb(255 212 0 / 6%));
    --ge-note-line: light-dark(rgb(232 174 0 / 55%), rgb(255 204 64 / 42%));
    --ge-note-hot: light-dark(rgb(255 212 0 / 34%), rgb(255 212 0 / 24%));
    --ge-note-hot-line: light-dark(rgb(222 160 0 / 90%), rgb(255 204 64 / 80%));
    /* A card of 批注 in the margin under the pointer: a shade of the page. */
    --ge-note-shade: light-dark(#f9f9f8, #202020);
    /* The Agent's changes (changes/, 设置 › 显示变更): pale green and red backgrounds, the conflict card's two versions (conflicts.mjs);
       words added get a 批注's look (a faint fill under a 2px underline) in green, blocks a fainter fill; words
       taken out stand in red struck through on the red, deleted blocks' ghost on a fainter red. */
    --ge-diff-add: light-dark(rgb(0 100 45 / 9%), rgb(108 255 172 / 15.7%));
    --ge-diff-add-line: light-dark(rgb(68 131 97 / 60%), rgb(111 197 150 / 55%));
    --ge-diff-add-fill: light-dark(rgb(0 100 45 / 5.5%), rgb(108 255 172 / 9%));
    --ge-diff-add-text: light-dark(#448361, #6fc596);
    --ge-diff-del: light-dark(rgb(223 22 0 / 9.4%), rgb(255 104 92 / 24%));
    --ge-diff-del-fill: light-dark(rgb(223 22 0 / 4.5%), rgb(255 104 92 / 10%));
    --ge-diff-del-text: light-dark(#cf5148, #ff8f85);
    /* The bar in the left margin beside every block an Agent touched (changes/: green beside what it added or changed, red beside
       a ghost of what it deleted), the red one the twin of --ge-diff-add-line. */
    --ge-diff-del-line: light-dark(rgb(207 81 72 / 55%), rgb(255 143 133 / 50%));
    /* An Agent's write arriving (changes/): its fills start this strong, hold a moment and settle to their resting tints above
       (about three times them on a light page; less on a dark one, where the owner found that strength of green too loud). */
    --ge-diff-add-arrive: light-dark(rgb(0 100 45 / 17%), rgb(108 255 172 / 16%));
    --ge-diff-del-arrive: light-dark(rgb(223 22 0 / 13%), rgb(255 104 92 / 17%));
    /* The conflict card's two versions (conflicts.mjs): the reader's words where they differ on a neutral gray (never red, which
       on the page is what the Agent took out), the file's in the Agent's green; the gray deeper on a dark card to stay readable. */
    --ge-diff-mine: light-dark(rgb(55 53 47 / 14%), rgb(255 255 255 / 22%));
    /* The two switches on the Agent's-changes bar (changes/bar.mjs), on: a pale green and a pale red fill, deeper under the pointer and pressed, as the pale blue primary's (--ge-btn-primary*). */
    --ge-diff-add-btn: light-dark(rgb(68 131 97 / 16%), rgb(111 197 150 / 22%));
    --ge-diff-add-btn-hover: light-dark(rgb(68 131 97 / 24%), rgb(111 197 150 / 31%));
    --ge-diff-add-btn-press: light-dark(rgb(68 131 97 / 32%), rgb(111 197 150 / 40%));
    --ge-diff-del-btn: light-dark(rgb(207 81 72 / 14%), rgb(255 104 92 / 22%));
    --ge-diff-del-btn-hover: light-dark(rgb(207 81 72 / 22%), rgb(255 104 92 / 31%));
    --ge-diff-del-btn-press: light-dark(rgb(207 81 72 / 30%), rgb(255 104 92 / 40%));
    /* The words of those two switches, on their fills: a deeper ink than the marks' (4.9:1 and 4.7:1 on the light fills), as a pale fill's button takes. */
    --ge-diff-add-chip: light-dark(#2f6f4e, #6fc596);
    --ge-diff-del-chip: light-dark(#b93a36, #ff8f85);
  }
  /* Text selected in what the editor draws (a field, a card, the icon picker), Gallery's blue as in the
     blocks (text-select/), not the browser's: the rules of a block, a
     chip and the formula field say more and keep theirs. */
  ::selection { background: var(--ge-select); }
  ${BUTTONS}
`;
