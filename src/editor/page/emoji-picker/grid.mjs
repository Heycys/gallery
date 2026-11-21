/* The focus the 表情符号 and 图标 tabs' grids share, and their tips.
 *   The pointer and the arrow keys move one focus (a gray fill). The arrows do not wrap; up and down keep the column (on a
 *   shorter row, its last cell). Moved by the keys, the focused cell is a deeper gray, scrolled into view below a group's
 *   title stuck at the list's top, and its name shows below it; resting the pointer on a cell 150ms shows its name below it.
 *   Pictures load as they scroll near: a cell's img[data-src] / img[data-svg] gets its src then (shared/emoji/emoji.mjs
 *   lazySrc; there are over a thousand, too many to load at once).
 * A cell is .ge-picker-cell[data-r][data-c]; its tip is its data-tip, else its aria-label; a cell with neither shows none.
 * createGridFocus({ scroller, grid, rows }) → { reset(focusFirst), move(key), focused(), observeImages(), destroy() };
 *   rows() gives the number of cells in each row. reset(false) focuses no cell (no result: the arrows start again at the
 *   first one).
 */
import { showTooltip, hideTooltip, isKeyboardMode } from './support.mjs';
import { lazySrc } from '../../../shared/emoji/emoji.mjs';

export function createGridFocus({ scroller, grid, rows }) {
  let focus = null, tipTimer = 0;
  const cellAt = f => f && grid.querySelector(`.ge-picker-cell[data-r="${f.r}"][data-c="${f.c}"]`);
  const tipOf = cell => cell.dataset.tip ?? cell.getAttribute('aria-label') ?? '';

  function set(f, byKeyboard) {
    cellAt(focus)?.classList.remove('focused', 'focus-visible');
    focus = f;
    const cell = cellAt(f);
    if (!cell) return;
    cell.classList.add('focused');
    if (!byKeyboard) return;
    cell.classList.add('focus-visible');
    const cover = grid.querySelector('.ge-picker-section-title')?.offsetHeight ?? 0;   // a group's title stays at the top (styles.mjs: sticky); a flat search has none
    const cr = cell.getBoundingClientRect(), sr = scroller.getBoundingClientRect(), top = sr.top + cover;
    if (cr.top < top) scroller.scrollTop -= top - cr.top;
    else if (cr.bottom > sr.bottom) scroller.scrollTop += cr.bottom - sr.bottom;
    if (tipOf(cell)) showTooltip(cell.getBoundingClientRect(), tipOf(cell), { placement: 'bottom' });
  }

  function move(key) {
    const lens = rows();
    if (!lens.length) return;
    if (!focus) return set({ r: 0, c: 0 }, true);
    let { r, c } = focus;
    if (key === 'ArrowRight') { if (c + 1 < lens[r]) c++; else if (r + 1 < lens.length) { r++; c = 0; } }
    else if (key === 'ArrowLeft') { if (c > 0) c--; else if (r > 0) { r--; c = lens[r] - 1; } }
    else if (key === 'ArrowDown') { if (r + 1 < lens.length) { r++; c = Math.min(c, lens[r] - 1); } }
    else if (key === 'ArrowUp') { if (r > 0) { r--; c = Math.min(c, lens[r] - 1); } }
    set({ r, c }, true);
  }

  const onOver = e => {
    const cell = e.target.closest('.ge-picker-cell');
    if (!cell || cell === cellAt(focus) && !cell.classList.contains('focus-visible')) return;
    set({ r: Number(cell.dataset.r), c: Number(cell.dataset.c) }, false);
    hideTooltip();
    clearTimeout(tipTimer);
    if (isKeyboardMode()) return;
    if (!tipOf(cell)) return;
    tipTimer = setTimeout(() => { if (cell.isConnected && cellAt(focus) === cell) showTooltip(cell.getBoundingClientRect(), tipOf(cell), { placement: 'bottom' }); }, 150);
  };
  const onLeave = () => { clearTimeout(tipTimer); hideTooltip(); };
  grid.addEventListener('mouseover', onOver);
  grid.addEventListener('mouseleave', onLeave);
  scroller.addEventListener('scroll', hideTooltip, { passive: true });

  const io = new IntersectionObserver(entries => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const img = en.target;
      img.src = lazySrc(img);
      img.removeAttribute('data-src');
      img.removeAttribute('data-svg');
      io.unobserve(img);
    }
  }, { root: scroller, rootMargin: '160px 0px' });

  return {
    reset(focusFirst = true) { set(focusFirst && rows().length ? { r: 0, c: 0 } : null, false); },
    move,
    focused: () => cellAt(focus),
    observeImages() { io.disconnect(); for (const img of grid.querySelectorAll('img[data-src], img[data-svg]')) io.observe(img); },
    destroy() { clearTimeout(tipTimer); io.disconnect(); },
  };
}
