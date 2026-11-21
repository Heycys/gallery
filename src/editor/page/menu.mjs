import { Z } from "../../shared/layers.mjs";
import { addStyle, appear, element, fadeAway, mount } from "./ui.mjs";
import { hideTooltip, tooltip } from "./tooltip.mjs";
import { blockPreview, hideBlockPreview, keyedBlockPreview } from "./block-preview.mjs";
import { SECTION_ICON, svg } from "../components/icons.mjs";
import { t } from "../../shared/i18n/index.mjs";

// The editor's menu card, used by the "/" menu (slash-menu/: block types, filtered as the reader
// types) and by the block menu a block's handle opens (block-menu/: a header with the block's type,
// the types it can be turned into as a grid of icons, then its commands). One row (or cell of a
// grid) is highlighted: ↑/↓ move it (a line of the grid at a time, ←/→ along it) and Enter runs it,
// the keys being forwarded by the editor, because the focus stays where it was (in the text, or on
// the page with a block selected). A press on a row never moves the caret. Colors follow the
// report's light or dark theme (light-dark()). A row may open a submenu (a block's 颜色 ›): a second
// card right of it, opened by resting on the row, a click, Enter or →, and closed by ←, by resting
// on another row, or with the menu; while it is open from the keys they move in it. A row that both
// runs and opens a submenu (a split row: a table's 一键优化 ›) is two parts side by side, each with
// its own grey under the pointer: its words, which a click or Enter runs, and its › at its right,
// which opens the submenu (resting on it, a click, or →); resting on its words opens nothing.
//
// A card is as wide as its rows (180px at least), up to FIT.most, past which a row's
// words are cut by an ellipsis, so a short submenu (一键优化 ›: 自动调整列宽, 识别数字列; 对齐 ›) is no
// wider than its words; it once took 265px whatever it held. A card whose rows change as it is used
// keeps the one width its caller gives (`width`: the block menu's grid, the "/" menu, a code block's
// languages), or SEARCHING when it has a search field and gives none, so it never jumps as rows come
// and go. A card of a few fixed rows may ask for a floor of its own (`least`: a table's row and column
// menus, as wide as the block menu at least; a list's number menu) and grows past it with its rows, as
// every other card does (an English row was cut by an ellipsis in a fixed width until 2026-11-17).

const FIT = { least: 180, most: 320 }; // a card with no width given: as wide as its rows, between these
const SEARCHING = 240; // a card with a search field and no width given: its rows filtered as typed
const SUB_OPEN = 120; // ms: the pointer resting on a row opens its submenu (as the workbench's menus do; 80, 200 while another was open, until 2026-11-17)
const SUB_CLOSE = 100; // ms: resting on another row, or leaving the row not into the submenu, closes it (250 until 2026-11-17)
let rowIds = 0; // each row an id, so the field that keeps the focus can name the highlighted one (aria-activedescendant)

const STYLE = `
  /* The card (look.mjs: --ge-r-card, --ge-card-pad round the rows, --ge-shadow-card); its widths are the whole card's (border-box). */
  .ge-pop {
    position: fixed; left: 0; top: 0; z-index: ${Z.menu}; box-sizing: border-box; width: max-content; min-width: ${FIT.least}px; max-width: min(${FIT.most}px, calc(100vw - 16px)); max-height: calc(100vh - 24px);
    overflow-x: hidden; overflow-y: auto; overscroll-behavior: contain; scroll-padding-block: var(--ge-card-pad); padding: var(--ge-card-pad); border-radius: var(--ge-r-card); background: var(--ge-bg); color: var(--ge-tx);
    box-shadow: var(--ge-shadow-card);
    font: 14px/1.2 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Helvetica, "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
    user-select: none; scrollbar-width: thin; scrollbar-color: var(--ge-line-strong) transparent;
  }
  /* A width given (data-sized: opts.width, placed by place()): that width, whatever the rows hold. */
  .ge-pop[data-sized] { min-width: 0; max-width: calc(100vw - 16px); }
  /* A short list of one kind of word (a card's 大小 ›: 4 × 2): only as wide as its rows, no 180px floor. */
  .ge-pop[data-compact] { min-width: 0; }
  /* A list that goes on past the card's edge fades out over its last 34px there: drawn by a strip of the
     card's own color standing at that edge (sticky, taking no room, nothing under it caught) rather than a
     mask on the scroller, so the card keeps its shadow; below a search field
     the top one stands under it. data-fade-b / data-fade-t: rows remain below / above (fades()). */
  .ge-pop[data-fade-b]::after, .ge-pop[data-fade-t]::before { content: ""; position: sticky; z-index: 1; display: block; height: 34px; pointer-events: none; }
  .ge-pop[data-fade-b]::after { bottom: 0; margin-top: -34px; background: linear-gradient(to bottom, transparent, var(--ge-bg)); }
  .ge-pop[data-fade-t]::before { top: 0; margin-bottom: -34px; background: linear-gradient(to top, transparent, var(--ge-bg)); }
  .ge-pop:has(> .ge-pop-search)[data-fade-t]::before { top: 38px; }
  /* A group's title: its words where a row's words without an icon are (9px in), 4px over its first row, 8px under the
     row before it, as the workbench's menus' and the kit's have it. */
  .ge-pop-title { display: flex; align-items: center; gap: 8px; padding: 8px 9px 4px; color: var(--ge-tx2); font-size: 12px; font-weight: 500; line-height: 14px; }
  .ge-pop-title:has(> .ge-pop-icon) { padding: 4px 9px 4px 7px; }
  .ge-pop-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* A title first stands nearer the card's top (its padding is room enough); a search field first keeps its own room. */
  .ge-pop > .ge-pop-title:first-child { padding-top: 3px; }
  .ge-pop:has(> .ge-pop-search:first-child) { padding-top: 0; }
  /* A row (look.mjs: --ge-r-row, the rows flush): its icon 7px in, where the block menu's grid has its icons (12px from the card's side), its words or check 9px from its right. */
  .ge-pop-row { display: flex; align-items: center; gap: 8px; width: 100%; height: 28px; margin: 0; padding: 0 9px 0 7px; border: 0; border-radius: var(--ge-r-row); background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .ge-pop[data-plain] .ge-pop-row { padding-left: 9px; }
  .ge-pop-row[data-active] { background: var(--ge-hover-row); }
  /* Pressed: a step deeper (on a split row, the part pressed). */
  .ge-pop-row:active:not(:disabled):not([data-split]) { background: var(--ge-press); }
  .ge-pop-row:disabled { cursor: default; }
  .ge-pop-row:disabled:not([data-current]) .ge-pop-label, .ge-pop-row:disabled:not([data-current]) .ge-pop-icon { opacity: var(--ge-off); }
  /* A row that takes something away for good (a block's 删除, a table's rows', a tab's, a card's): a pale red behind red
     words while it is the one highlighted; one that cannot be done now is gray as any other row. */
  .ge-pop-row[data-danger][data-active]:not(:disabled) { background: var(--ge-danger-tint); }
  .ge-pop-row[data-danger][data-active]:not(:disabled), .ge-pop-row[data-danger][data-active]:not(:disabled) :is(.ge-pop-icon, .ge-pop-hint) { color: var(--ge-btn-danger-text); }
  .ge-pop-row[data-danger]:active:not(:disabled) { background: var(--ge-btn-danger); }
  .ge-pop-icon { flex: none; display: flex; align-items: center; justify-content: center; width: 20px; height: 20px; color: var(--ge-ico); }
  .ge-pop-icon svg { display: block; width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; }
  .ge-pop-icon img { display: block; width: 20px; height: 20px; border-radius: 3px; object-fit: contain; }
  .ge-pop-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  /* A row with a hint (its current choice, its key) reads by its label first: the label keeps its
     words and the hint takes what is left, cut short with an ellipsis where it is too long (an English
     row's current choice once took the whole row, its label drawn 0px wide). */
  .ge-pop-label:has(+ .ge-pop-hint) { flex: 1 0 auto; max-width: 100%; }
  .ge-pop-of { color: var(--ge-tx3); }
  .ge-pop-hint { flex: 0 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--ge-tx3); font-size: 12px; white-space: nowrap; }
  /* A row of a page (its title, the page it is under as its hint): a long title is what an ellipsis
     cuts, and the page above keeps its words, up to a part of the row. */
  .ge-pop-row[data-long] .ge-pop-label { flex: 1 1 0; max-width: none; }
  .ge-pop-row[data-long] .ge-pop-hint { flex: none; max-width: 40%; }
  .ge-pop-check, .ge-pop-arrow { flex: none; width: 16px; height: 16px; }
  .ge-pop-arrow { color: var(--ge-tx3); }
  /* Every glyph of a card one weight (the owner's 2026-11-17: one card, one size and weight): the icons 20px, the › and the ✓ 16px, every line 1.25px. */
  .ge-pop-arrow svg { display: block; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; }
  .ge-pop-row[aria-expanded="true"] { background: var(--ge-hover-row); }
  /* A split row (run and submenu both): its words (.ge-pop-main) and its › (.ge-pop-more, 32px wide:
     the › where another submenu row has its own) side by side, 2px apart, each grey on its own: the words
     when the row is highlighted and the pointer is not on the ›, the › under the pointer and while its
     submenu is open. The row itself takes no grey. */
  .ge-pop-row[data-split] { gap: 2px; padding: 0; }
  .ge-pop-row[data-split][data-active], .ge-pop-row[data-split][aria-expanded="true"] { background: transparent; }
  .ge-pop-main { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; align-self: stretch; padding: 0 9px 0 7px; border-radius: var(--ge-r-row); }
  .ge-pop-more { flex: none; display: flex; align-items: center; justify-content: center; width: 32px; align-self: stretch; border-radius: var(--ge-r-row); }
  .ge-pop-row[data-split][data-active]:not([data-more]) > .ge-pop-main,
  .ge-pop-row[data-split][data-more] > .ge-pop-more,
  .ge-pop-row[data-split][aria-expanded="true"] > .ge-pop-more { background: var(--ge-hover-row); }
  .ge-pop-row[data-split]:active:not([data-more]) > .ge-pop-main, .ge-pop-row[data-split][data-more]:active > .ge-pop-more { background: var(--ge-press); }
  .ge-pop-check svg { display: block; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; }
  .ge-pop-sep { height: 1px; margin: 5px 9px; background: var(--ge-line); }
  /* A note wraps at the card's width and never widens it (no width of its own: contain). */
  /* Sentences (why a row cannot be taken, nothing found) in the secondary gray; a row's shortcut, hint
     and a field's placeholder keep the tertiary. Under a row, where its words start. */
  .ge-pop-note { contain: inline-size; padding: 0 9px 6px 35px; color: var(--ge-tx2); font-size: 12px; line-height: 1.5; }
  .ge-pop-empty { padding: 7px 9px; color: var(--ge-tx2); }
  .ge-pop-search { position: sticky; top: 0; z-index: 1; padding: 5px 0; background: var(--ge-bg); }
  .ge-pop-search input { box-sizing: border-box; width: 100%; height: 28px; margin: 0; padding: 0 8px; border: 0; border-radius: var(--ge-r-ctl); outline: none; background: var(--ge-field); color: var(--ge-tx); font: inherit; box-shadow: inset 0 0 0 1px var(--ge-edge); }
  .ge-pop-search input:focus { box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--ge-tx3) 60%, transparent); }
  .ge-pop-search input::placeholder { color: var(--ge-tx3); }
  /* Rows in a card that is there already (inside: a link card's pages): under what stands in it, as wide as it, no card of their own. */
  .ge-pop[data-inside] { position: static; flex: 0 0 100%; width: auto; min-width: 0; max-width: none; padding: 4px 0 0; border-radius: 0; background: none; box-shadow: none; }
`;

// A section's lines, of the icons of 在下方新建分区 and 解散分区: the mark beside them says which.
const SECTION_LINES = '<path d="M3.25 5.25h13.5M3.25 9.75h9"/>';

/** Icons of the editor's menus (a block type's own is in its component's description). */
export const ICONS = {
  plus: svg('<path d="M10 4.25v11.5M4.25 10h11.5"/>'),
  copy: svg('<rect x="7.25" y="7.25" width="9.5" height="9.5" rx="2"/><path d="M12.75 7.25V5.5a2 2 0 0 0-2-2h-5.5a2 2 0 0 0-2 2V11a2 2 0 0 0 2 2h2"/>'),
  trash: svg('<path d="M3.75 5.75h12.5M8 5.75V4.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.25M5.25 5.75l.7 9.6a1.5 1.5 0 0 0 1.5 1.4h5.1a1.5 1.5 0 0 0 1.5-1.4l.7-9.6"/>'),
  outer: svg('<rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2.5" stroke-dasharray="2.2 2.2"/><rect x="6.5" y="6.5" width="7" height="7" rx="1.25"/>'),
  section: svg(`${SECTION_LINES}<path d="M14.5 12v5M12 14.5h5"/>`),
  dissolve: svg(`${SECTION_LINES}<path d="m12.75 12.75 3.5 3.5M16.25 12.75l-3.5 3.5"/>`), // section's plus, turned 45°
  group: SECTION_ICON, // blocks gathered into a new section: their lines between brackets (components/icons.mjs)
  center: svg('<rect x="5.25" y="4.25" width="9.5" height="11.5" rx="1.75"/><path d="M2.75 4v12M17.25 4v12"/>'),
  full: svg('<rect x="3.25" y="4.25" width="13.5" height="11.5" rx="1.75"/><path d="m6.5 10h7M6.5 10l1.75-1.75M6.5 10l1.75 1.75M13.5 10l-1.75-1.75M13.5 10l-1.75 1.75"/>'),
  reset: svg('<path d="M4.75 6.75A6 6 0 1 1 4 10.5"/><path d="M4.5 3.5v3.5H8"/>'), // 恢复默认大小: back as it was
  swap: svg('<path d="M4.25 7.25h11.5M12.75 4.25l3 3-3 3"/><path d="M15.75 12.75H4.25M7.25 9.75l-3 3 3 3"/>'), // 替换: two arrows, one each way
  check: svg('<path d="m3.5 8.5 3 3 6-7"/>', 16),
  frame: svg('<rect x="3.25" y="4.25" width="13.5" height="11.5" rx="3"/><path d="M6.25 7.75h3"/>'),
  rename: svg('<path d="M11.75 4.75l3.5 3.5"/><path d="M13.25 3.25a1.5 1.5 0 0 1 2.12 0l1.38 1.38a1.5 1.5 0 0 1 0 2.12L7.5 16H4v-3.5z"/>'),
  chevron: svg('<path d="m6.25 4.25 3.75 3.75-3.75 3.75"/>', 16), // the workbench's menus' › (components/icons.ts), drawn alike
  face: svg('<circle cx="10" cy="10" r="6.75"/><path d="M7.5 11.5a3 3 0 0 0 5 0"/><circle cx="7.9" cy="8.5" r=".9" fill="currentColor" stroke="none"/><circle cx="12.1" cy="8.5" r=".9" fill="currentColor" stroke="none"/>'),
};

const opened = new Set(); // the menus open now, whichever part of the page opened them

/** Whether a menu is open anywhere on the page (a press outside it closes it). */
export const menuOpen = () => opened.size > 0;

/**
 * items: rows { label, run, icon?, of?, hint?, long?, current?, checked?, disabled?, note?, preview? } (of: what
 * the label is of, grey after it, a block's pack where two rows have one name; long:
 * a label of any length, a page's title, cut before its hint is; current: the choice
 * made, checked and not to be chosen again; checked: a switch that is on, checked and clicked to turn
 * it off; selected: the choice of a dropdown (a field's list of options), checked as current is but
 * still a row to click, which closes the card with nothing changed; preview: { picture, says }, what a row that adds a block makes:
 * its pictures ({ light, dark }, or null) and a line on it, a card beside the menu while the pointer rests on the row or the keys
 * are on it (block-preview.mjs), or with no picture the line alone, at the row's right while the pointer rests on it, as a tooltip) (or { label, icon?, submenu:
 * () => items, width?, search? } opening a submenu, with a search field at its top when `search` is
 * given, as `opts.search` below, and `search.empty` the words shown when nothing is found; a row
 * with both `run` and `submenu` is a split row: its words run, its › opens the submenu), titles
 * { title, icon? }, separators { separator: true } and grids { node, cells, columns } (type-grid.mjs: the
 * node shown as it is, its cells, buttons that act on their own click, highlighted as rows are).
 * opts: { label, empty, highlight, onClose, around, side, width, least } — width: the card's, in px, whatever
 * its rows hold (the block menu: as wide as its grid of types), where without it the card is as wide
 * as its rows (FIT; SEARCHING with a search field); least: with no width, the card's least width in px in
 * place of FIT's (it grows with its rows up to FIT.most). around: the rect of the block a handle
 * (the anchor) stands for; the menu keeps clear of that block: left of it beside the handle, else
 * below or above it (scrolling inside when only part of it fits), and over it only when the block
 * leaves no room at all; a tall block (more than TALL high: a table, a formula, a highlight, an image)
 * has it beside the handle, left of it or, with no room there,
 * right of it over the block, centered on the handle, never over the handle. side: "right": beside the anchor, right of it (left of it when there is no
 * room), level with it (a section's bar). Without either the menu stands below the anchor (the
 * caret), or above it when there is no room below; align: "end", its right edge at the anchor's.
 * icons: false, rows of words alone (no column for icons: a code block's languages; a row that opens a
 * submenu says it of its own as `icons: false`, and `compact: true` makes it only as wide as its rows, no
 * 180px floor: a card's 大小 ›); height: the
 * card's greatest height, in px (its rows scroll inside it past that). showCurrent: the row of the choice
 * made (current) scrolled to the card's middle as it opens. A row's `danger`: red while highlighted. stand(size): where the card
 * stands, its { left, top } for its { width, height }, in place of all of these rules (a pasted
 * address's 选择视图, by the format bar's rule: placement.mjs besideText). inside: an element the rows
 * go in, in place of a card over the page (a link card's pages): they stand where it has them.
 * search: { placeholder, filter(text) }: a field above the rows, which takes the focus (unless
 * `focus` is false: a submenu the pointer opened, whose field the first letter typed goes to,
 * menu.type); what is typed in it gives the rows anew (filter returns the items), its keys moving the
 * highlight (↑/↓), running the row (Enter) and closing the menu (Esc). typed: a card with a field of
 * its own the reader types into (a list's 修改编号值), which comes by its opacity alone, as one with a
 * search field does (ui.mjs appear).
 *
 * The card grows out of its corner nearest the anchor as it opens, at once when the keys opened it
 * (ui.mjs appear), and a picture of it fades out as it closes (ui.mjs fadeAway), the card itself gone at once.
 */
export function createMenu() {
  addStyle(STYLE);
  let node = null;
  let list = null; // where the rows go: the card, or under its search field
  let rows = [];
  let active = -1;
  let pointed = false; // the highlight is where the pointer is (not where the keys moved it)
  let options = {};
  let anchor = null;
  let sub = null; // the submenu's card (a menu of its own), made when first needed
  let subRow = null; // the row it is open from
  let subKeys = false; // opened from the keys: they move in it
  let subTimer = 0;
  let pointedRow = null;
  let pointedMore = false; // the pointer on a split row's › (not on its words)

  // The pointer over a row highlights it. In a menu that starts with nothing highlighted (the block
  // menu), leaving the row takes the highlight off again, as :hover would; a row the keys moved to
  // stays, and so does the "/" menu's, the row Enter runs. On a split row, `more`: the pointer is on
  // its › (data-more on the row, which greys the › instead of the words), the part that opens.
  const point = (row, more = false) => {
    highlight(rows.indexOf(row), false);
    pointed = true;
    if (row.split) row.toggleAttribute("data-more", more);
    if (row === pointedRow && more === pointedMore) return;
    pointedRow = row;
    pointedMore = more;
    clearTimeout(subTimer);
    // As in the workbench's menus: a submenu opens SUB_OPEN after the pointer rests on its row, and goes
    // SUB_CLOSE after the pointer rests elsewhere (a split row's words being elsewhere).
    const opens = Boolean(row.submenu) && (!row.split || more);
    if (opens && row !== subRow) subTimer = setTimeout(() => openSub(row), SUB_OPEN);
    else if (!opens && subRow) subTimer = setTimeout(closeSub, SUB_CLOSE);
  };
  const leave = (row) => {
    if (pointed && rows[active] === row && options.highlight === false) highlight(-1);
    row.removeAttribute("data-more");
    if (pointedRow !== row) return;
    pointedRow = null;
    pointedMore = false;
    clearTimeout(subTimer); // passing over a row opens nothing
    if (subRow === row && !subKeys) subTimer = setTimeout(closeSub, SUB_CLOSE); // unless the pointer goes into it
  };

  function build(items) {
    rows = [];
    const children = [];
    for (const item of items) {
      if (item.separator) {
        if (children.length > 0 && !children.at(-1).classList.contains("ge-pop-sep")) children.push(element("div", { class: "ge-pop-sep", role: "separator" }));
      } else if (item.title) {
        // A titled group needs no line before it: its title parts it from the rows above (a design review, 2026-11-17).
        if (children.at(-1)?.classList.contains("ge-pop-sep")) children.pop();
        children.push(element("div", { class: "ge-pop-title" }, ...(item.icon ? [element("span", { class: "ge-pop-icon", html: item.icon })] : []), element("span", { class: "ge-pop-name", text: item.title })));
      }
      else if (item.node) {
        const grid = { start: rows.length, count: item.cells.length, columns: item.columns };
        for (const cell of item.cells) {
          cell.grid = grid;
          cell.addEventListener("pointermove", () => point(cell));
          cell.addEventListener("pointerleave", () => leave(cell));
          rows.push(cell);
        }
        children.push(item.node);
      } else {
        // A row with a check is a switch (checked) or the choice of a list (current, selected): roles that may say so.
        const role = item.checked ? "menuitemcheckbox" : item.current || item.selected ? "menuitemradio" : "menuitem";
        const row = element("button", { type: "button", class: "ge-pop-row", role, id: `ge-pop-row-${++rowIds}` });
        // A split row's words go in a part of their own, its › in another (CSS above).
        row.split = Boolean(item.run && item.submenu);
        const words = row.split ? element("span", { class: "ge-pop-main" }) : row;
        if (row.split) row.setAttribute("data-split", "");
        if (item.long) row.setAttribute("data-long", "");
        if (options.icons !== false) words.append(element("span", { class: "ge-pop-icon", html: item.icon ?? "" }));
        // A row's pack where two rows have one name (我的待办 · 柔光风格): grey, after the name, in the label.
        words.append(item.of ? element("span", { class: "ge-pop-label" }, item.label, element("span", { class: "ge-pop-of", text: ` · ${item.of}` })) : element("span", { class: "ge-pop-label", text: item.label }));
        if (item.hint) words.append(element("span", { class: "ge-pop-hint", text: item.hint }));
        if (row.split) row.append(words, element("span", { class: "ge-pop-more", html: `<span class="ge-pop-arrow">${ICONS.chevron}</span>` }));
        else if (item.submenu) row.append(element("span", { class: "ge-pop-arrow", html: ICONS.chevron }));
        if (item.submenu) {
          row.setAttribute("aria-haspopup", "menu");
          row.submenu = item.submenu;
          row.subWidth = item.width;
          row.subSearch = item.search;
          row.subLook = { icons: item.icons, compact: item.compact };
        }
        if (item.current || item.checked || item.selected) {
          row.append(element("span", { class: "ge-pop-check", html: ICONS.check, "aria-hidden": "true" }));
          row.setAttribute("data-current", "");
          row.setAttribute("aria-checked", "true");
        }
        if (item.danger) row.setAttribute("data-danger", "");
        row.disabled = Boolean(item.disabled || item.current);
        row.run = item.run;
        row.addEventListener("mousedown", (event) => event.preventDefault());
        const onMore = (event) => row.split && Boolean(event.target.closest?.(".ge-pop-more"));
        row.addEventListener("pointermove", (event) => point(row, onMore(event)));
        row.addEventListener("pointerleave", () => leave(row));
        row.addEventListener("click", (event) => run(row, onMore(event)));
        rows.push(row);
        children.push(row);
        if (item.note) children.push(element("div", { class: "ge-pop-note", text: item.note }));
        if (item.preview?.picture) blockPreview().watch(row, item.preview);
        else if (item.preview?.says) tooltip(row, item.preview.says, null, { placement: "right", align: "start", beside: true });
      }
    }
    while (children.at(-1)?.classList.contains("ge-pop-sep")) children.pop();
    if (rows.length === 0 && options.empty) children.push(element("div", { class: "ge-pop-empty", text: options.empty }));
    hideTooltip();
    hideBlockPreview();
    list.replaceChildren(...children);
    active = -1;
    pointed = false;
  }

  function highlight(index, scroll = true) {
    rows[active]?.removeAttribute("data-active");
    active = index;
    const row = rows[active];
    const field = node?.querySelector(".ge-pop-search input");
    if (row?.id) field?.setAttribute("aria-activedescendant", row.id);
    else field?.removeAttribute("aria-activedescendant");
    if (!row) return;
    row.setAttribute("data-active", "");
    if (scroll) row.scrollIntoView({ block: "nearest" });
  }

  // The highlight moved by the keys: the picture of the row's block beside the menu, where it has one (block-preview.mjs).
  function moved(index) {
    highlight(index);
    keyedBlockPreview(rows[active] ?? null);
  }

  // The fades at an edge the list goes on past (STYLE: data-fade-b, data-fade-t), as it opens, is
  // filtered and scrolls.
  function fades() {
    if (!node || options.inside) return;
    const over = node.scrollHeight - node.clientHeight > 1;
    node.toggleAttribute("data-fade-b", over && node.scrollTop + node.clientHeight < node.scrollHeight - 1);
    node.toggleAttribute("data-fade-t", over && node.scrollTop > 1);
  }

  const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
  const TALL = 34; // px: a block taller than this (a line of text is 26px) is a tall one: its menu may stand over it

  function place() {
    if (options.inside) return;
    const margin = 8;
    const gap = 6;
    node.style.maxHeight = options.height ? `${options.height}px` : "";
    if (options.width) node.style.width = `${options.width}px`;
    const width = node.offsetWidth;
    let height = node.offsetHeight;
    const room = innerHeight - 2 * margin;
    const fit = (space) => {
      if (height > space) {
        node.style.maxHeight = `${Math.floor(space)}px`;
        height = space;
        // A card as wide as its content widens by the scrollbar it now has.
        if (options.width) node.style.width = `${options.width + node.offsetWidth - node.clientWidth}px`;
      }
    };
    let left;
    let top;
    const block = options.around;
    if (options.stand) {
      fit(room);
      ({ left, top } = options.stand({ width, height }));
    } else if (options.side === "right") {
      fit(room);
      const aside = options.gap ?? gap;
      left = anchor.right + aside + width <= innerWidth - margin ? anchor.right + aside : anchor.left - aside - width;
      top = clamp(anchor.top, margin, innerHeight - margin - height);
    } else if (!block) {
      // Below the anchor (the caret), or above it where there is more room; never over it (it once
      // covered the line typed in, at the top of the window): the card scrolls inside when it fits
      // in neither.
      const aside = options.gap ?? gap;
      left = clamp(options.align === "end" ? anchor.right - width : anchor.left, margin, innerWidth - width - margin);
      const below = innerHeight - margin - (anchor.bottom + aside);
      const above = anchor.top - aside - margin;
      if (height <= below || below >= above) {
        fit(Math.max(below, 120));
        top = anchor.bottom + aside;
      } else {
        fit(Math.max(above, 120));
        top = Math.max(margin, anchor.top - aside - height);
      }
    } else {
      const below = innerHeight - margin - (block.bottom + gap);
      const above = block.top - gap - margin;
      const beside = anchor.left - gap - width;
      // A block of more than a line (a table, a formula, a highlight, an image: taller than TALL) may
      // have the menu over it: beside its handle, right of it where there is no room left of it,
      // rather than below the block, away from the handle.
      const middle = (anchor.top + anchor.bottom) / 2;
      const onRight = block.bottom - block.top > TALL && anchor.right + gap + width <= innerWidth - margin;
      if (beside >= margin || onRight) {
        // Beside the handle (never over it), left first, centered on it.
        fit(room);
        left = beside >= margin ? beside : anchor.right + gap;
        top = clamp(middle - height / 2, margin, innerHeight - margin - height);
      } else if (Math.max(below, above) >= Math.min(height, 180)) {
        // Below the block, else above it; in the larger of the two when it fits in neither.
        left = clamp(anchor.left, margin, innerWidth - width - margin);
        const under = height <= below || (height > above && below >= above);
        fit(under ? below : above);
        top = under ? block.bottom + gap : block.top - gap - height;
      } else {
        // The block fills the window: beside the handle, over the block.
        fit(room);
        left = Math.min(anchor.right + gap, innerWidth - width - margin);
        top = clamp((anchor.top + anchor.bottom) / 2 - height / 2, margin, innerHeight - margin - height);
      }
    }
    node.style.left = `${Math.round(Math.max(margin, left))}px`;
    node.style.top = `${Math.round(top)}px`;
    fades();
  }

  // ---------- a row's submenu ----------

  function openSub(row, keys = false) {
    clearTimeout(subTimer);
    if (!node || !rows.includes(row)) return;
    if (subRow === row && sub?.isOpen) {
      if (keys && !subKeys) {
        subKeys = true;
        sub.move(1);
      }
      return;
    }
    closeSub();
    sub ??= createMenu();
    subRow = row;
    subKeys = keys;
    row.setAttribute("aria-expanded", "true");
    // A choice in it closes both cards, then runs; so does one its search field found.
    const closing = (items) => items.map((item) => (item.run ? { ...item, run: () => { close(); item.run(); } } : item));
    const items = closing(row.submenu());
    const search = row.subSearch && { placeholder: row.subSearch.placeholder, filter: (text) => closing(row.subSearch.filter(text)) };
    sub.open(items, row.getBoundingClientRect(), {
      side: "right", gap: 0, height: Math.round(innerHeight * 0.7), highlight: keys, width: row.subWidth, label: row.textContent, search, empty: row.subSearch?.empty, focus: keys,
      ...(row.subLook.icons === false ? { icons: false } : {}), ...(row.subLook.compact ? { compact: true } : {}),
      onClose: () => {
        row.removeAttribute("aria-expanded");
        if (subRow === row) {
          subRow = null;
          subKeys = false;
        }
      },
    });
    for (const card of sub.nodes) card.addEventListener("pointerenter", () => clearTimeout(subTimer));
  }

  function closeSub() {
    clearTimeout(subTimer);
    sub?.close();
  }

  // A row's work: its submenu opened (a split row's only from its ›: `more`), a grid's cell's own
  // click, or the menu closed and its action run (Enter and a click on a split row's words).
  function run(row, more = false) {
    if (!row || row.disabled) return false;
    if (row.submenu && (!row.split || more)) {
      openSub(row, true);
      return true;
    }
    if (row.grid) {
      row.click(); // a grid's cell does its own work (and closes the menu)
      return true;
    }
    const action = row.run;
    close();
    action?.();
    return true;
  }

  // The search field: what is typed in it filters the rows (not while an input method composes).
  function searchField(search) {
    const field = element("input", { type: "text", placeholder: search.placeholder ?? t("搜索"), spellcheck: "false", autocomplete: "off", "aria-label": search.placeholder ?? t("搜索") });
    const filter = () => {
      build(search.filter(field.value));
      highlight(rows.findIndex((row) => !row.disabled));
    };
    field.addEventListener("input", (event) => { if (!event.isComposing) filter(); });
    field.addEventListener("compositionend", filter);
    field.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (!menu.arrow(event)) {
        if (event.key === "Enter") menu.choose();
        else if (event.key === "Escape") close();
        else if (event.key !== "Tab") return;
      }
      event.preventDefault();
    });
    return element("div", { class: "ge-pop-search" }, field);
  }

  function close() {
    if (!node) return;
    opened.delete(menu);
    closeSub();
    hideTooltip();
    hideBlockPreview();
    pointedRow = null;
    // It goes from the page at once; a picture of it fades out (ui.mjs fadeAway), but for rows inside another card.
    if (options.inside) node.remove();
    else fadeAway(node);
    node = null;
    list = null;
    rows = [];
    active = -1;
    const done = options.onClose;
    options = {};
    done?.();
  }

  const menu = {
    open(items, rect, opts = {}) {
      close();
      options = opts.search && !opts.width ? { ...opts, width: SEARCHING } : opts;
      anchor = rect;
      opened.add(menu);
      node = element("div", { class: "ge-pop", role: "menu", "aria-label": opts.label ?? t("菜单") });
      if (options.width) node.setAttribute("data-sized", "");
      if (options.compact) node.setAttribute("data-compact", "");
      if (options.icons === false) node.setAttribute("data-plain", "");
      if (options.least && !options.width) node.style.minWidth = `${options.least}px`;
      if (opts.inside) {
        node.setAttribute("data-inside", "");
        opts.inside.append(node);
      } else mount(node);
      list = node;
      if (opts.search) {
        list = element("div");
        node.append(searchField(opts.search), list);
      }
      node.addEventListener("scroll", fades, { passive: true });
      build(items);
      if (opts.highlight !== false) highlight(rows.findIndex((row) => !row.disabled && !row.passed));
      place();
      // The choice made, in the middle of the card (a code block's language: the list opens on its
      // checked row), by the card's own scroll alone.
      const current = opts.showCurrent ? list.querySelector(".ge-pop-row[data-current]") : null;
      if (current && node.scrollHeight > node.clientHeight) {
        node.scrollTop = current.offsetTop - (node.clientHeight - current.offsetHeight) / 2;
        fades();
      }
      // It grows out of its corner nearest what opened it (ui.mjs appear): at once from the keys (a submenu
      // that → opened, the "/" typed), its opacity alone with a search field the reader types into.
      if (!opts.inside) appear(node, anchor, { typed: Boolean(opts.search || opts.typed) });
      if (opts.focus !== false) node.querySelector(".ge-pop-search input")?.focus({ preventScroll: true });
    },
    /** Replace the rows (filtering), keeping the place; `first`: the first row highlighted. */
    update(items, rect = anchor, { first = true } = {}) {
      if (!node) return;
      anchor = rect;
      build(items);
      if (first) highlight(rows.findIndex((row) => !row.disabled && !row.passed));
      place();
    },
    /** Stand again, by `rect` or by what `stand` reads: the page moved under it. */
    follow(rect = anchor) {
      if (!node) return;
      anchor = rect;
      place();
    },
    close,
    /**
     * Move the highlight by one row, skipping disabled rows; in a grid by a line of it, out of it
     * past its first or last line. `along`: ←/→ in a grid (false when no cell is highlighted).
     */
    move(delta, along = false) {
      if (sub?.isOpen && subKeys) {
        if (along && delta < 0 && !sub.move(delta, true)) {
          closeSub();
          return true;
        }
        return along ? true : sub.move(delta);
      }
      if (along && delta > 0 && rows[active]?.submenu) {
        openSub(rows[active], true);
        return true;
      }
      if (rows.length === 0) return false;
      pointed = false;
      const grid = rows[active]?.grid;
      if (along) {
        if (!grid) return false;
        moved(grid.start + (active - grid.start + delta + grid.count) % grid.count);
        return true;
      }
      let index = active < 0 && delta < 0 ? rows.length : active; // from nothing, ↑ reaches the last row
      if (grid) {
        const at = active - grid.start;
        const line = Math.floor(at / grid.columns);
        const last = Math.floor((grid.count - 1) / grid.columns);
        const next = delta > 0 && line < last ? Math.min(at + grid.columns, grid.count - 1) : delta < 0 && line > 0 ? at - grid.columns : null;
        if (next !== null) {
          moved(grid.start + next);
          return true;
        }
        index = delta > 0 ? grid.start + grid.count - 1 : grid.start;
      }
      // Passed over: a disabled row, and a cell that is already the block's (passed: a color's swatch).
      for (let step = 0; step < rows.length; step++) {
        index = (index + delta + rows.length) % rows.length;
        if (!rows[index].disabled && !rows[index].passed) break;
      }
      moved(index);
      return true;
    },
    /** ↑/↓ as a key event: moves the highlight (`move`); false for any other key (the caller's own keys stay its). */
    arrow(event) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return false;
      menu.move(event.key === "ArrowDown" ? 1 : -1);
      return true;
    },
    /**
     * A letter typed while a submenu with a search field is open (the pointer opened it, the focus
     * staying where it was): the field takes the focus, and the letter goes into it (the key's own
     * typing, not prevented). Returns whether it went there.
     */
    type(event) {
      const field = sub?.isOpen ? sub.nodes[0]?.querySelector(".ge-pop-search input") : null;
      if (!field || event.ctrlKey || event.metaKey || event.altKey || (event.key.length !== 1 && event.keyCode !== 229)) return false;
      subKeys = true; // its keys now move in it
      field.focus({ preventScroll: true });
      return true;
    },
    /** Run the highlighted row. Returns whether one ran. */
    choose: () => (sub?.isOpen && subKeys ? sub.choose() : run(rows[active])),
    get isOpen() { return node !== null; },
    get hasChoice() { return sub?.isOpen && subKeys ? sub.hasChoice : Boolean(rows[active] && !rows[active].disabled); },
    /** Whether the highlight is where the pointer is, not where the keys moved it. */
    get pointed() { return pointed; },
    contains: (target) => Boolean(node?.contains(target) || sub?.contains(target)),
    /** The nodes to keep in the top layer when a modal dialog opens. */
    get nodes() { return node ? [node, ...(sub?.nodes ?? [])] : []; },
  };
  return menu;
}
