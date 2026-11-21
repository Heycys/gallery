// A table's frame scrolls with its own scrollbars hidden (styles/table.css), so a scrollbar never
// takes room from the columns, whatever the system draws. The kit draws thin ones over the
// frame instead (a sticky layer at its top-left that takes no room), each thumb a little in from
// its edge and running only along the part that scrolls: the vertical one down the right edge from
// below the header (which stays while the rows scroll) to above the bottom corner's curve, the
// horizontal one along the bottom edge from after a sticky first column or a header column (or the corner's curve)
// to before the other corner. They show while the pointer is over the frame or it scrolls. A
// thumb can be dragged; a press beside it on its rail first moves it there. The wheel, touch
// and keys scroll as before; a frame that scrolls down never bounces past its top or bottom
// (styles/table.css), the wheel there scrolling what is around it instead (passOn). The same layer draws the frame's line, as big as the frame (as wide by the stylesheet, as tall by placeScrollbars): above
// everything in it, a header row or column that sticks too (styles/table.css), and a fading right
// edge while words lie past it (data-more), since the rails show only under the pointer. What the
// frame hides at rest, it says on itself (noteHidden).

import { tableHides } from "../../../shared/table-hides.mjs";
import { fixedFirstCell } from "./sticky.js";

const global = globalThis;
const RAIL = 12; // px: a rail's thickness, what a press takes (its thumb is thinner, against the edge)
const MIN_THUMB = 24; // px
const scrollbars = new WeakMap(); // wrapper -> { node, table, frame, x, y, timer, axes, noted, reach }

// A property of an element's style set, unless it holds that value already: a value set again to what
// it is still has the browser lay the page out again before the next read of a size.
const probe = globalThis.document?.createElement('div');
export function setStyle(element, property, value) {
  probe.style.setProperty(property, value); // the value as a style holds it
  if (element.style.getPropertyValue(property) !== probe.style.getPropertyValue(property)) element.style.setProperty(property, value);
}

export function drawScrollbars(wrapper, table) {
  if (scrollbars.has(wrapper)) return;
  // An exported view copy has none (ui.js); a layer left from an earlier run is taken over.
  let node = wrapper.querySelector(':scope > .doc-scrollbars');
  if (!node) {
    node = document.createElement('div');
    node.className = 'doc-scrollbars';
    node.setAttribute('aria-hidden', 'true');
    node.innerHTML = '<div class="doc-scrollbar doc-scrollbar--y"><div class="doc-scrollbar-thumb"></div></div>'
      + '<div class="doc-scrollbar doc-scrollbar--x"><div class="doc-scrollbar-thumb"></div></div>';
    wrapper.prepend(node);
  }
  let frame = node.querySelector(':scope > .doc-scrollbars-frame');
  if (!frame) {
    frame = document.createElement('div');
    frame.className = 'doc-scrollbars-frame';
    node.prepend(frame);
  }
  frame.style.removeProperty('width'); // a width an earlier kit wrote: the line's is the stylesheet's
  const bars = {node, table, frame, y:node.querySelector('.doc-scrollbar--y'), x:node.querySelector('.doc-scrollbar--x'), timer:0, axes:{}, noted:'', reach:0};
  scrollbars.set(wrapper, bars);
  wrapper.addEventListener('scroll', () => {
    placeScrollbars(wrapper);
    bars.node.setAttribute('data-active', '');
    clearTimeout(bars.timer);
    bars.timer = setTimeout(() => bars.node.removeAttribute('data-active'), 900);
  }, {passive:true});
  wrapper.addEventListener('wheel', event => passOn(wrapper, event), {passive:true});
  // The frame's size and the table's (rows, widths, a Sheet or disclosure shown) set the thumbs. The
  // first layout places them (refreshLayout, which the table's mount queues), and the observer
  // does as it starts watching: nothing is placed before the table has its columns.
  const observer = new ResizeObserver(() => placeScrollbars(wrapper));
  observer.observe(wrapper);
  observer.observe(table);
}

// Each overflowing axis's rail and thumb. The track runs along the part of the edge that
// scrolls: not the header row, a sticky first column or a header column (they stay), not the rounded corners, not the other
// rail. The thumb is as long and as far along as the rows (columns) shown, of those that scroll.
// Sizes are the table's, not the frame's scroll size, which counts the rails too: a rail left
// where a taller frame had it would make the frame seem to scroll. Placed again when the table's
// content changes (index.js): a header row or header column switched on or off moves where the
// part that scrolls begins without changing any size. What the frame hides is said again when a size
// changed, and after every layout (`renote`: refreshLayout), where words may have moved within sizes
// that stayed.
export function placeScrollbars(wrapper, {renote = false} = {}) {
  const bars = scrollbars.get(wrapper);
  if (!bars) return;
  const {table} = bars;
  // The frame and its table measured, then the frame's line made as tall as the frame: a height it
  // kept from a taller frame would reach past the table and make the frame scroll into nothing. Its
  // width is the stylesheet's (styles/table.css: the layer as wide as the frame's inside, the line
  // as the layer), laid out with the frame's own in the same pass, never a width read here that a
  // frame resized since could disagree with; its height is the frame's to the sub-pixel (its
  // computed height, as the layout has it; offsetHeight is whole pixels). The line (out of the flow,
  // in a layer that takes no room) changes no size read here, only how far the frame scrolls; so
  // everything is read before anything is written, and the browser lays the page out once for it,
  // not once for each write (a layout after each word typed in a cell). What is written is written
  // only when it changes (setStyle).
  const {clientWidth:width, clientHeight:height} = wrapper;
  const style = getComputedStyle(wrapper);
  const content = {width:Math.max(width, table.offsetWidth), height:Math.max(height, table.offsetHeight)};
  setStyle(bars.frame, 'height', `${outerHeight(wrapper, style)}px`);
  const x = content.width - width > 1, y = content.height - height > 1;
  const sizes = `${width}x${height}:${content.width}x${content.height}`;
  if (width > 0 && (renote || sizes !== bars.noted)) {
    bars.noted = sizes;
    bars.reach = noteHidden(wrapper, table);
  }
  // The right edge fades while words lie past it (to where the words past the frame's edge at rest
  // end, as the note measures them): never over the padding of a table a few pixels wider than its
  // frame, nor over cells past the edge with nothing written there, where the words it covers would
  // seem cut with nothing more to see.
  bars.node.toggleAttribute('data-more', x && wrapper.scrollLeft + width < bars.reach - 1);
  // How far a rounded corner's curve reaches in from the frame's inner edge.
  const corner = (radius, border) => Math.max(0, (parseFloat(style[radius]) || 0) - (parseFloat(style[border]) || 0));
  const header = table.tHead?.getBoundingClientRect().height || 0;
  const first = fixedFirstCell(table)?.getBoundingClientRect().width || 0;
  const place = (rail, start, end, fixed, view, total, at) => {
    const track = Math.max(0, end - start);
    const size = Math.min(track, Math.max(MIN_THUMB, track * Math.max(0, view - fixed) / (total - fixed)));
    const range = total - view;
    setStyle(rail, '--doc-scrollbar-track', `${track}px`);
    setStyle(rail, '--doc-scrollbar-thumb-size', `${size}px`);
    setStyle(rail, '--doc-scrollbar-thumb-at', `${(track - size) * Math.min(1, Math.max(0, at / range))}px`);
    return {track, size, range};
  };
  bars.node.toggleAttribute('data-x', x);
  bars.node.toggleAttribute('data-y', y);
  if (y) {
    const start = Math.max(header, corner('borderTopRightRadius', 'borderTopWidth'));
    const end = height - Math.max(corner('borderBottomRightRadius', 'borderBottomWidth'), x ? RAIL : 0);
    setStyle(bars.y, 'left', `${width - RAIL}px`);
    setStyle(bars.y, 'top', `${start}px`);
    bars.axes.y = place(bars.y, start, end, header, height, content.height, wrapper.scrollTop);
  }
  if (x) {
    const start = Math.max(first, corner('borderBottomLeftRadius', 'borderLeftWidth'));
    const end = width - Math.max(corner('borderBottomRightRadius', 'borderRightWidth'), y ? RAIL : 0);
    setStyle(bars.x, 'left', `${start}px`);
    setStyle(bars.x, 'top', `${height - RAIL}px`);
    bars.axes.x = place(bars.x, start, end, first, width, content.width, wrapper.scrollLeft);
  }
}

// An element's border box height, px to the sub-pixel: its computed height (the layout's own, not
// rounded) with its padding and borders, unless it is a border box's already; its offsetHeight where
// it has none.
function outerHeight(element, style) {
  const height = parseFloat(style.height);
  if (!Number.isFinite(height)) return element.offsetHeight;
  if (style.boxSizing === 'border-box') return height;
  return height + ['paddingTop', 'paddingBottom', 'borderTopWidth', 'borderBottomWidth'].reduce((sum, name) => sum + (parseFloat(style[name]) || 0), 0);
}

// What the frame hides at rest (scrolled to its start), as layout notes on it (data-doc-layout,
// "<kind>: <message>" each, which the preview and the QA tool read; docs/render.md, "Table layout
// internals"), measured as gallery qa measures a table (tableHides, src/shared/table-hides.mjs): the
// columns whose words lie past its right edge, in whole or in part, header or body (a first column
// that stays never does), the rows whose words lie below its bottom edge (the rows shown, not those a
// filter hides). A cell's words start its padding in from the cell's edge, so a table a few pixels
// wider or taller than its frame hides nothing, and a column whose cells reach past the edge with
// nothing written there hides nothing either. Written again when the frame or its table changes size
// and after every layout, gone when it hides nothing. Returns how far from the table's left edge the
// words past the frame's edge end (0 when none is past it): the fading edge shows until it is reached.
function noteHidden(wrapper, table) {
  const notes = [];
  const hides = tableHides(wrapper, table);
  if (hides.said) notes.push(`columns-hidden: ${hides.said} (scroll sideways)`);
  if (hides.shown < hides.rows) notes.push(`rows-hidden: the frame shows ${hides.shown} of ${hides.rows} rows (scroll down)`);
  // Written only when it changes: a layout says it again, and what watches the attribute hears no news.
  const said = notes.join('\n');
  if (said && wrapper.getAttribute('data-doc-layout') !== said) wrapper.setAttribute('data-doc-layout', said);
  else if (!said && wrapper.hasAttribute('data-doc-layout')) wrapper.removeAttribute('data-doc-layout');
  return hides.reach;
}

// The wheel at a frame's top or bottom, where it scrolls down but must not bounce (no scroll goes
// on from it: overscroll-behavior-block none, styles/table.css): what is around it scrolls by it,
// as the browser would have, the page or a scrolling box it stands in.
function passOn(wrapper, event) {
  if (event.ctrlKey || !event.deltaY || getComputedStyle(wrapper).overscrollBehaviorBlock !== 'none') return;
  const atTop = wrapper.scrollTop <= 0;
  const atEnd = wrapper.scrollTop + wrapper.clientHeight >= wrapper.scrollHeight - 1;
  if (!(event.deltaY < 0 ? atTop : atEnd)) return;
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? innerHeight : 1);
  for (let node = wrapper.parentElement; node && node !== document.body; node = node.parentElement) {
    const {overflowY} = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1) return node.scrollBy({top:delta, behavior:'instant'});
  }
  global.scrollBy({top:delta, behavior:'instant'});
}

// A press on a rail is the scrollbar's, as on a native one: neither the page nor a preview's
// editor hears it (window, capturing, comes before both), and it selects no text. On an edge
// the preview's editor resizes the table from (it marks the page with data-ge-resize), the
// press stays the editor's.
global.addEventListener('pointerdown', event => {
  const rail = event.button === 0 ? event.target.closest?.('.doc-scrollbar') : null;
  const wrapper = rail?.parentElement.parentElement;
  if (!scrollbars.has(wrapper) || document.documentElement.hasAttribute('data-ge-resize')) return;
  event.preventDefault();
  event.stopPropagation();
  const vertical = rail.classList.contains('doc-scrollbar--y');
  const property = vertical ? 'scrollTop' : 'scrollLeft';
  const along = pointer => vertical ? pointer.clientY - rail.getBoundingClientRect().top : pointer.clientX - rail.getBoundingClientRect().left;
  const {track = 0, size = 0, range = 0} = scrollbars.get(wrapper).axes[vertical ? 'y' : 'x'] ?? {};
  const perPixel = track > size ? range / (track - size) : 0;
  if (event.target === rail) wrapper[property] = (along(event) - size / 2) * perPixel; // beside the thumb: it goes there
  const start = {pointer:along(event), scroll:wrapper[property]};
  rail.setAttribute('data-drag', '');
  rail.setPointerCapture?.(event.pointerId);
  const move = moved => { wrapper[property] = start.scroll + (along(moved) - start.pointer) * perPixel; };
  const end = () => {
    rail.removeAttribute('data-drag');
    rail.removeEventListener('pointermove', move);
    rail.removeEventListener('pointerup', end);
    rail.removeEventListener('pointercancel', end);
  };
  rail.addEventListener('pointermove', move);
  rail.addEventListener('pointerup', end);
  rail.addEventListener('pointercancel', end);
}, true);
