import { PIECE_BREAKS, WORD_BREAKS, allocateColumnWidths, columnKind, createTextMeasurer } from "./auto-column-widths.ts";
import { columnCells, columnWidths, slotsOf } from "../../../shared/table-slots.mjs";
import { LOOK_ATTRIBUTES } from "../../../shared/document-look.mjs";
import { CODE_RUN, cellText, codeRuns, footRows, tableRows, wrapperOf } from "./cells.js";
import { drawScrollbars, placeScrollbars, setStyle } from "./scrollbars.js";
import { WHOLE_ROWS, shownWhole } from "./whole.js";
import { ACROSS, acrossLook, acrossRoom, clearAcross, placeAcross } from "./across.js";

// Column widths (docs/render.md, "Table layout internals"): each cell's text measured in its own
// font, the widths allocated over the frame's inner width (auto-column-widths.ts), written as one
// colgroup, and the frame's width; again whenever the table's container, frame or content changes
// (queueLayout, at most once a frame; index.js watches the page). A table whose columns the reader
// sized (--doc-column-width on a cell of the column, the page editor's table tools) is laid out
// at those widths instead (manualLayout). Where the document's look lets wide tables past the text
// (宽表格, across.js), a table wider than the text in the body takes the room past it.

// The narrowest a column gets while its table fits the reading width (a new column's width), the
// narrowest a column the reader sized is read to be (what its frame can shrink to) and the least a
// column the reader gave no width is made; the widest that last is made.
const COLUMN_FLOOR = 120;
const COLUMN_NATURAL_MAX = 240;
// A narrow screen (the kit's narrowest breakpoint, styles/): no column of text needs more than a
// third of the table's room there for its words, its readable floor (auto-column-widths.ts
// maxReadableFloor; a column of numbers keeps its own), so that a table of two or three columns wraps
// their text before it scrolls sideways; a run of code or a number range, which no line breaks
// inside, up to the room the other columns leave at that (two thirds beside one column, a third
// beside two: a file's name whole where the table still fits; wider ones break where their column
// ends).
const NARROW = '(max-width: 420px)';
// The most of a run of inline code a column is made as wide as (the allocator's cap on a column's
// content floor, auto-column-widths.ts): about forty characters of code. A longer run breaks where
// its column ends (styles/table.css).
const CODE_RUN_MAX = 320;
// Where code that is not drawn in runs breaks besides its spaces (code in a cell the page editor
// edits, or code holding a link: cells.js), as Chrome breaks it: after a hyphen, and before and after
// each Chinese, Japanese or Korean character (and a dash). A slash, a dot or an underscore breaks
// nothing there.
const WIDE = '\u2014\u3000-\u30ff\u3400-\u9fff\uac00-\ud7af\uf900-\ufaff\uff00-\uffef';
const NATIVE_BREAKS = new RegExp(`(?<=-)|(?<=[${WIDE}])|(?=[${WIDE}])`, 'u');

// Widths are compared as a ResizeObserver reads them, px of a content box to the sub-pixel: a
// difference under this is none (a layout unit, 1/64 px, or a rounding, is not a change of room).
const SUBPIXEL = 0.5;

export const layouts = new WeakMap();
export const layoutObservers = new WeakMap();
export const pendingLayouts = new Set();
let layoutFrame = 0;

// The font an element's text is measured in, as Canvas takes it, from its computed style.
const fontOf = style => `${style.fontStyle || 'normal'} ${style.fontWeight || '400'} ${style.fontSize || '15px'} ${style.fontFamily || 'system-ui'}`;
function fontFor(element) {
  return fontOf(getComputedStyle(element));
}

// The families a font-family list names, each as a loaded face says it (FontFace.family): without
// quotes, lowercased.
const familyName = name => name.trim().replace(/^(["'])(.*)\1$/, '$2').toLowerCase();
const familiesOf = list => list.split(',').map(familyName).filter(Boolean);

// The page's text measurers for the cells' words (createTextMeasurer, auto-column-widths.ts), one per
// font, each keeping the widths it measured from one layout to the next: a table laid out again
// (a word typed in a cell, its frame resized) measures only the words it has not measured before.
// A measurer goes when a font it names loads (a face's loadingdone, or all of them with the fonts'
// ready): Canvas measured those words in the font that stood in for it. (The words a table's rows
// are read by for its height, mostlyWords, keep measurers of their own: textMeasurers.)
const measurers = new Map(); // font -> { measure, families: the families its font-family list names }
function measurerFor(font, family) {
  let measurer = measurers.get(font);
  if (!measurer) measurers.set(font, measurer = {measure: createTextMeasurer(font), families: familiesOf(family)});
  return measurer.measure;
}
function forgetMeasurers(faces) {
  if (!faces) return measurers.clear();
  const loaded = new Set(faces.map(face => familyName(String(face.family ?? ''))));
  for (const [font, {families}] of [...measurers]) if (families.some(name => loaded.has(name))) measurers.delete(font);
}
globalThis.document?.fonts?.addEventListener?.('loadingdone', event => forgetMeasurers([...(event.fontfaces ?? [])]));
globalThis.document?.fonts?.ready.then(() => forgetMeasurers());

// What each cell of a table measured to in its last layout, with what it was measured from
// (cellKey): its own content and look, its computed font and edges, the table's and its frame's
// classes and the page's theme and width. A layout measures again only the cells whose key
// changed (the one a word was typed in), so typing in a cell no longer measures the whole table, and
// the widths come out as a layout measuring every cell makes them. A cell holding a formula is
// measured every time: its width is KaTeX's drawing as the page lays it out (nothing while it is
// hidden, another once its fonts load). A table forgets what it measured when a font it measured
// with loads (fontsChange, index.js) and when a report's script asks for a layout (DocTables.layout).
let cellMeasures = new WeakMap(); // table -> Map(cell -> { key, result, families })
// The page's zoom (its device pixel ratio) when the cells and words were measured: zoomed, every
// table measures every cell again, in new measurers, as it did before anything was kept.
let measuredRatio = globalThis.devicePixelRatio;
function sameZoom() {
  if (globalThis.devicePixelRatio === measuredRatio) return;
  measuredRatio = globalThis.devicePixelRatio;
  measurers.clear();
  cellMeasures = new WeakMap();
}
// The font families each table's last layout measured its cells in (normalized: familyName), or none
// for a table the browser lays out (nativeLayout), which measures nothing.
const measuredFamilies = new WeakMap(); // table -> Set
/** Forget what a table's cells measured to: its next layout measures each of them again. */
export const forgetMeasures = table => cellMeasures.delete(table);
/**
 * What faces of fonts that have loaded (`faces`, FontFace each; none: every font, the page's fonts
 * ready) change of a table: "words" when it measured its cells' words in a family among them (or the
 * browser lays it out, or it was not laid out yet: always), "formulas" when they are KaTeX's and it
 * holds a formula (whose cells are measured every time), else "".
 */
export function fontsChange(table, faces) {
  const families = measuredFamilies.get(table);
  if (!faces || !families) return 'words';
  const names = faces.map(face => familyName(String(face.family ?? '')));
  if (names.some(name => families.has(name))) return 'words';
  return names.some(name => name.startsWith('katex')) && table.querySelector('.katex') ? 'formulas' : '';
}

// What a cell takes of its column besides its text: its padding and its own lines (styles/table.css),
// from its computed style.
function cellPaddingFor(style) {
  return (parseFloat(style.paddingLeft || '12px') || 0) + (parseFloat(style.paddingRight || '12px') || 0)
    + (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
}

// A numeric column's digits are tabular (styles/table.css), which Canvas cannot set: each is as wide as
// the font's tabular digit, measured once per font in the page.
const tabularDigits = new Map();
function tabularDigitWidth(font) {
  if (!tabularDigits.has(font)) {
    const probe = document.createElement('span');
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:pre;font:${font};font-variant-numeric:tabular-nums`;
    probe.textContent = '0123456789';
    document.body.append(probe);
    tabularDigits.set(font, probe.getBoundingClientRect().width / 10);
    probe.remove();
  }
  return tabularDigits.get(font);
}

// What inline code takes of a line besides its text: its padding and its border, at both its ends,
// from its computed style.
function codeEdges(style) {
  return (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
    + (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
}

// What a table's cells are measured in besides their own looks and computed styles: the table's and
// its frame's classes (but the one the layout itself sets, doc-table--auto, which sizes no word),
// and the page's theme and width and the document's look (its font and size: src/shared/document-look.mjs),
// each of which the styles of what a cell holds may follow. (The page
// editor's styles of what it edits follow its marks, data-ge-*, which its rebuild of a cell writes
// on every element in it: a cell of words alone is measured as before, one holding elements again.)
function contextOf(table) {
  const root = document.documentElement;
  const classes = [...table.classList].filter(name => name !== 'doc-table--auto').join(' ');
  // (宽表格's attribute sizes no word: a table placed past the text measures as it did.)
  const look = Object.entries(LOOK_ATTRIBUTES).filter(([key]) => key !== 'tables').map(([, name]) => root.getAttribute(name) ?? '').join('|');
  return `${classes}\u0002${wrapperOf(table)?.className ?? ''}\u0002${root.getAttribute('data-doc-theme') ?? ''}|${root.getAttribute('data-doc-width') ?? ''}|${look}`;
}

// A cell measurer for one layout: measure(cell) is the width its words take on their widest line,
// with its padding (the column it needs not to wrap them); measure.least(cell) the width it cannot
// be narrower than, with its padding: its widest run no line breaks in, a run of its inline code
// (its runs, cells.js, or where Chrome breaks code not drawn in runs: NATIVE_BREAKS) with the code's
// own padding or a number range (runtime/spacing.js), up to CODE_RUN_MAX of it, or 0 without either;
// measure.run(cell) that run whole, however wide (a column narrower lets it break: data-run-wrap);
// measure.word(cell) its longest word with its padding, where a cell keeps its words whole
// (WORD_BREAKS); measure.piece(cell) its widest piece no line breaks in, where it breaks its
// words as Chinese text does (PIECE_BREAKS); and measure.prose(cell) that of its words outside inline
// code (whose runs break where they break: cells.js), a Latin word whole. Each cell is measured once a layout: its content does
// not change within one; and not again in the next while its key (cellKey) stays the same
// (cellMeasures). Each element's style is read once a layout (styleOf), not for each word of its
// text. measure.done() keeps what this layout measured for the next one.
function createCellMeasurer(table) {
  sameZoom();
  const styles = new Map(); // element -> { computed, font, family, spacing, tabular }
  const kept = cellMeasures.get(table);
  const measured = new Map(); // cell -> { key, result: { width, least, run, word, piece, prose }, families }
  const families = new Set();
  const context = contextOf(table);
  let using = null; // the families of the cell being measured
  const styleOf = element => {
    let style = styles.get(element);
    if (!style) {
      const computed = getComputedStyle(element);
      style = {computed, font: fontOf(computed), family: computed.fontFamily || 'system-ui', spacing: parseFloat(computed.letterSpacing) || 0, tabular: /tabular-nums/.test(computed.fontVariantNumeric || '')};
      styles.set(element, style);
    }
    return style;
  };
  const widthOf = (text, parent) => {
    const {font, family, spacing, tabular} = styleOf(parent);
    using?.add(family);
    const measureText = measurerFor(font, family);
    const digits = tabular ? text.replace(/\D/g, '').length : 0;
    return (digits ? measureText(text.replace(/\d/g, '')) + digits * tabularDigitWidth(font) : measureText(text))
      + Math.max(0, text.length - 1) * spacing;
  };
  // What a cell is measured from (its words, its marks and looks, the font and edges it has now, and
  // those its table, its frame and the page give it); null for a cell measured every time.
  const cellKey = cell => {
    if (cell.querySelector('.katex')) return null;
    const {computed, font} = styleOf(cell);
    return `${context}\u0001${cell.className}\u0001${cell.getAttribute('style') ?? ''}\u0001${font}|${computed.letterSpacing}|${computed.fontVariantNumeric}|${computed.paddingLeft}|${computed.paddingRight}|${computed.borderLeftWidth}|${computed.borderRightWidth}\u0001${cell.innerHTML}`;
  };
  const measureCell = cell => {
    let entry = measured.get(cell);
    if (!entry) {
      const key = cellKey(cell);
      const before = key === null ? null : kept?.get(cell);
      if (before && before.key === key) entry = before;
      else {
        using = new Set();
        entry = {key, result: measureWords(cell), families: using};
        using = null;
      }
      measured.set(cell, entry);
      entry.families.forEach(family => families.add(family));
    }
    return entry.result;
  };
  const measure = cell => measureCell(cell).width;
  measure.least = cell => measureCell(cell).least;
  measure.run = cell => measureCell(cell).run;
  measure.word = cell => measureCell(cell).word;
  measure.piece = cell => measureCell(cell).piece;
  measure.prose = cell => measureCell(cell).prose;
  // A layout that measured no cell (the browser's, or one of a frame with no room: nothing shown)
  // leaves what the last one measured, and a table whose fonts are not known.
  measure.done = () => {
    if (measured.size === 0) return measuredFamilies.delete(table);
    cellMeasures.set(table, new Map([...measured].filter(([, entry]) => entry.key !== null)));
    measuredFamilies.set(table, new Set([...families].flatMap(familiesOf)));
  };
  return measure;

  function measureWords(cell) {
    let line = 0, widest = 0, lastSpace = true, run = 0;
    // The word and the piece the text has reached (carried on from one node to the next), and the widest of each.
    // `prose`: the pieces of its words outside inline code alone.
    const word = {now: 0, widest: 0}, piece = {now: 0, widest: 0}, prose = {now: 0, widest: 0};
    const along = (part, width, restart) => {
      part.now = (restart ? 0 : part.now) + width;
      part.widest = Math.max(part.widest, part.now);
    };
    const content = cell; // a header's sort control holds no text (sort.js); the room it hangs in is the cell's padding
    const walk = node => {
      if (node.nodeType === Node.TEXT_NODE) {
        let text = node.textContent.replace(/\s+/g, ' ');
        if (lastSpace) text = text.replace(/^ /, '');
        if (!text) return;
        const parent = node.parentElement;
        const width = widthOf(text, parent);
        line += width;
        lastSpace = text.endsWith(' ');
        // A number range is one word, one piece and a run the line keeps whole.
        if (parent.closest('.doc-range')) {
          run = Math.max(run, width);
          along(word, width, false);
          along(piece, width, false);
          return;
        }
        text.split(WORD_BREAKS).forEach((part, index) => along(word, widthOf(part, parent), index > 0));
        text.split(PIECE_BREAKS).forEach((part, index) => along(piece, widthOf(part, parent), index > 0));
        if (parent.closest('code')) prose.now = 0;
        else text.split(PIECE_BREAKS).forEach((part, index) => along(prose, widthOf(part, parent), index > 0));
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      if (node.tagName === 'BR') { widest = Math.max(widest, line); line = 0; lastSpace = true; word.now = piece.now = prose.now = 0; return; }
      // A formula (KaTeX's) as wide as it is drawn, on one line: its words are its TeX and MathML,
      // not what shows.
      if (node.classList.contains('katex')) {
        const drawn = [...node.getClientRects()].reduce((sum, rect) => sum + rect.width, 0);
        line += drawn;
        along(word, drawn, false);
        along(piece, drawn, false);
        lastSpace = false;
        return;
      }
      // A link's icon (图标视图, 页面块) as wide as it is drawn: no words, and part of the line.
      if (node.classList.contains('doc-link-mention-icon')) {
        const {computed} = styleOf(node);
        const drawn = (parseFloat(computed.width) || 0) + (parseFloat(computed.marginInlineEnd) || 0);
        line += drawn;
        along(word, drawn, false);
        along(piece, drawn, false);
        lastSpace = false;
        return;
      }
      // A list in the cell: each item a line of its own, as far in as the list's indent.
      if (node.tagName === 'UL' || node.tagName === 'OL') {
        widest = Math.max(widest, line);
        const indent = parseFloat(styleOf(node).computed.paddingInlineStart) || 0;
        for (const item of node.children) {
          line = word.now = piece.now = prose.now = indent;
          lastSpace = true;
          item.childNodes.forEach(walk);
          widest = Math.max(widest, line);
        }
        line = word.now = piece.now = prose.now = 0;
        lastSpace = true;
        return;
      }
      // Inline code: each run of it whole on a line, with the code's padding: its runs where it is
      // drawn in them (cells.js), else where Chrome breaks it (in a cell the page editor edits).
      if (node.tagName === 'CODE') {
        const edges = codeEdges(styleOf(node).computed);
        const runs = node.querySelector(`.${CODE_RUN}`) ? codeRuns(node.textContent) : node.textContent.split(/\s+/).flatMap(part => part.split(NATIVE_BREAKS));
        for (const part of runs) if (part.trim()) run = Math.max(run, widthOf(part, node) + edges);
      }
      if (node !== content) {
        const style = styleOf(node).computed;
        // Inline code has its own font and padding; both consume column space.
        line += (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
      }
      node.childNodes.forEach(walk);
    };
    walk(content);
    // Rounded up: a column exactly as wide as its text can still wrap it by a fraction of a
    // pixel. A header's sort arrow hangs in the cell's right padding, which styles/table.css makes wider for it (15px, not 9): read here from the cell.
    const padding = cellPaddingFor(styleOf(cell).computed);
    return {
      width: Math.ceil(Math.max(widest, line) + padding),
      least: run > 0 ? Math.ceil(Math.min(run, CODE_RUN_MAX) + padding) : 0,
      run: run > 0 ? Math.ceil(run + padding) : 0,
      word: Math.ceil(word.widest + padding),
      piece: Math.ceil(piece.widest + padding),
      prose: Math.ceil(prose.widest + padding),
    };
  }
}

// The table's frame (.doc-table-wrap) and the width the reader gave it (--doc-span, from the
// preview), read once for a layout: { wrapper: the frame, or null; sized: it has a width of its own;
// wider: its share past the reading width (1 at most the reading width) }. Every layout below goes by it.
function frameOf(table) {
  const wrapper = wrapperOf(table);
  const sized = Boolean(wrapper) && getComputedStyle(wrapper).getPropertyValue('--doc-span-width').trim() !== '';
  const wider = sized ? Math.max(1, parseFloat(getComputedStyle(wrapper).getPropertyValue('--doc-span')) || 1) : 1;
  return {wrapper, sized, wider};
}

// An element's inside (its content box), px to the sub-pixel as a ResizeObserver reads it: from its
// computed width, the layout's own and not rounded (clientWidth is whole pixels, which put a filling
// table a fraction of a pixel off its frame at a fractional zoom), where it has a box (one with none,
// hidden, has its width as written there); else from its client width.
function innerWidth(element) {
  const style = getComputedStyle(element);
  const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const border = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
  if (element.getClientRects?.().length > 0 && /px$/.test(style.width)) {
    const width = parseFloat(style.width);
    return style.boxSizing === 'border-box' ? width - padding - border : width;
  }
  return (element.clientWidth || element.getBoundingClientRect().width - border) - padding;
}

// The room an element gives its table (innerWidth) while it takes `width` (a frame at 100%: as wide
// as it may be), its own width put back at once, before anything else is read or written: the width
// that measures the room is never drawn, nor left on the frame by anything that fails after the measure.
function roomOf(element, width = null) {
  const before = element.style.width;
  if (width === null || before === width) return innerWidth(element);
  element.style.width = width;
  try {
    return innerWidth(element);
  } finally {
    element.style.width = before;
  }
}

// A frame with a width of its own measured (its style's width cleared first): { wider, inner: its
// inside's width }, or null when it has none or no room.
function sizedInside({wrapper, sized, wider}) {
  if (!sized) return null;
  if (wrapper.style.width) wrapper.style.width = '';
  // A frame placed past the text (across.js) measured as the text holds it: no max-width of its own while it is read.
  const held = wrapper.hasAttribute(ACROSS) ? wrapper.style.maxWidth : '';
  if (held) wrapper.style.maxWidth = '';
  const inner = innerWidth(wrapper);
  if (held) wrapper.style.maxWidth = held;
  return inner > 0 ? {wider, inner} : null;
}

// 宽表格 (across.js): the frame of a table `needed` px wide (its columns), whose room in the text is
// `available` (px, its inside), placed past the text where the table is wider than that and the look lets it
// (as wide as the table, at most the page's area), else back in the text. Returns whether it is past the text.
function placeFrame(wrapper, needed, available) {
  if (!wrapper) return false;
  const edges = frameEdges(wrapper);
  const room = needed > available + 0.5 ? acrossRoom(wrapper, available, edges) : null;
  if (room === null) {
    clearAcross(wrapper);
    return false;
  }
  placeAcross(wrapper, Math.min(needed, room) + edges);
  return true;
}

// What the frame takes of its width besides its columns: its borders and padding.
function frameEdges(wrapper) {
  const style = getComputedStyle(wrapper);
  return (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0) + (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
}

const scratch = globalThis.document?.createElement('col');
// The table's colgroup, one `col` for each of `columns` ({width: a CSS width, key}). The layout owns
// it: one the source's author wrote goes. One that has those columns already is left as it is: a
// layout that comes out as the last one (a word typed that widens no column) changes nothing the
// browser has to lay out again.
function writeColgroup(table, columns) {
  let colgroup = table.querySelector(':scope > colgroup[data-doc-columns]');
  if (!colgroup) {
    table.querySelectorAll(':scope > colgroup').forEach(node => node.remove());
    colgroup = document.createElement('colgroup');
    colgroup.dataset.docColumns = '';
    table.insertBefore(colgroup, table.firstElementChild?.tagName === 'CAPTION' ? table.firstElementChild.nextSibling : table.firstElementChild);
  }
  const cols = colgroup.children;
  const same = ({width, key}, index) => {
    const col = cols[index];
    scratch.style.width = width; // the width as the col's style would hold it
    return col.attributes.length === 2 && col.dataset.columnKey === key && col.style.width === scratch.style.width;
  };
  if (cols.length === columns.length && columns.every(same)) return;
  colgroup.replaceChildren(...columns.map(({width, key}) => {
    const col = document.createElement('col');
    col.style.width = width;
    col.dataset.columnKey = key;
    return col;
  }));
}

// A cell's marks from the allocator's columns (its kind, whether it wraps).
function clearColumnMarks(table) {
  table.querySelectorAll('[data-column-kind], [data-column-wrap], [data-run-wrap]').forEach(cell => {
    delete cell.dataset.columnKind;
    cell.removeAttribute('data-column-wrap');
    cell.removeAttribute('data-run-wrap');
  });
}

// An attribute the layout writes, written only when it changes: a mark set again to what it is has
// the browser lay the table out again (and the page's observers hear a change).
const setAttribute = (element, name, value) => { if (element.getAttribute(name) !== value) element.setAttribute(name, value); };

// A cell holding a run the line keeps whole (a run of its inline code, a number range) wider than
// its column (`width`, px) lets that run break (data-run-wrap, styles/table.css), not out of the cell.
const markRunWrap = (cell, width, measureCell) => cell.toggleAttribute('data-run-wrap', measureCell.run(cell) > width + 0.5);

// What a layout at widths of the table's own (manual or allocated) leaves, taken away when the
// browser lays the table out.
function clearAuto(table, wrapper) {
  table.classList.remove('doc-table--auto');
  table.style.removeProperty('width');
  table.querySelector('colgroup[data-doc-columns]')?.remove();
  clearColumnMarks(table);
  if (wrapper) {
    wrapper.style.removeProperty('width');
    delete wrapper.dataset.docMinWidth;
  }
  layouts.delete(table);
}

// A table's slots (src/shared/table-slots.mjs, the one reading the page editor and the server share).
const tableSlots = table => slotsOf([...table.rows]);

// The width the reader gave a cell's column (px), or null.
const columnWidthOf = cell => {
  const width = parseFloat(cell.style.getPropertyValue('--doc-column-width'));
  return width > 0 ? width : null;
};

/**
 * The widths the reader gave the table's columns (a column's first cell alone with one, top down: a
 * merged cell gives none; shared/table-slots.mjs columnWidths), px or null each; null when none has
 * one or its cells tile no rectangle.
 */
export function manualWidths(table) {
  const slots = tableSlots(table);
  if (!slots) return null;
  const widths = columnWidths(slots, columnWidthOf);
  return widths.some(width => width !== null) ? widths : null;
}

// Columns at the reader's widths (a column without one as wide as its widest cell, COLUMN_FLOOR to
// COLUMN_NATURAL_MAX px), their text wrapping inside them; the frame as wide as the
// table up to the reading width, scrolling past it. A frame with a width of its own keeps it, and
// the columns grow or shrink in proportion to fill it. Returns the room it measured (px), or null.
function manualLayout(table, frame, widths, measureCell) {
  const {wrapper} = frame;
  const slots = tableSlots(table);
  const natural = widths.map((width, index) => width ?? Math.min(COLUMN_NATURAL_MAX, Math.max(COLUMN_FLOOR, ...columnCells(slots, index).map(measureCell))));
  const frameSize = sizedInside(frame);
  const scale = frameSize ? (frameSize.inner * frameSize.wider) / natural.reduce((sum, width) => sum + width, 0) : 1;
  const sizes = natural.map(width => width * scale);
  const total = sizes.reduce((sum, width) => sum + width, 0);
  table.classList.add('doc-table--auto');
  table.style.width = `${total}px`;
  clearColumnMarks(table);
  let room = frameSize?.inner ?? null;
  if (wrapper) {
    const edges = frameEdges(wrapper);
    setAttribute(wrapper, 'data-doc-min-width', String(Math.min(total, COLUMN_FLOOR) + edges));
    if (!frameSize) room = roomOf(wrapper, '100%');
    // Wider than the text: past it where the look lets it (across.js), else in the frame at the text's width.
    if (!placeFrame(wrapper, total, frameSize?.inner ?? room) && !frameSize) setStyle(wrapper, 'width', total < room ? `${total + edges}px` : '100%');
  }
  writeColgroup(table, sizes.map((width, index) => ({width: `${width}px`, key: String(index)})));
  layouts.set(table, sizes.map((width, index) => ({key: String(index), kind: 'compact', preferredWidth: width, softMinWidth: width, hardMinWidth: width, width, ratio: width / total})));
  // A cell as wide as the columns it stands in.
  for (const [cell, {c, cols}] of slots?.places ?? []) markRunWrap(cell, sizes.slice(c, c + cols).reduce((sum, width) => sum + width, 0), measureCell);
  return room;
}

// Widths under `floor` raised toward it with `room` px: the narrowest first, to one level (water filling).
function raiseNarrow(widths, room, floor) {
  const low = widths.filter(width => width < floor).sort((a, b) => a - b);
  let level = floor;
  if (low.reduce((sum, width) => sum + floor - width, 0) > room) {
    let sum = 0;
    for (let index = 0; index < low.length; index++) {
      sum += low[index];
      level = (room + sum) / (index + 1);
      if (index === low.length - 1 || level <= low[index + 1]) break;
    }
  }
  return widths.map(width => Math.max(width, Math.min(level, floor)));
}

// The table laid out, and its frame's scrollbars and line placed over the frame as it now is:
// whether or not the frame's size changed (a frame that grows and shrinks back within one layout
// tells its observer nothing), so the line never keeps a size the frame had; and what the frame
// hides said again (words may have moved within sizes that stayed). What it left the elements its
// observer watches at is kept (leftAt), so that the observer does not take the layout's own widths
// for a change; `observed`: the observer alone asked for it (followChain).
export function refreshLayout(table, {observed = false} = {}) {
  idleLayouts.delete(table);
  const measure = createCellMeasurer(table);
  const room = layOut(table, measure);
  measure.done();
  markWhole(table);
  followChain(table, room, observed);
  const watched = observedOf.get(table);
  if (watched) leftAt.set(table, new Map(watched.map(element => [element, innerWidth(element)])));
  const wrapper = wrapperOf(table);
  if (wrapper) placeScrollbars(wrapper, {renote: true});
}

// The table laid out by the rule its columns take; returns the room it measured (px), or null.
function layOut(table, measure) {
  const headers = [...(table.tHead?.rows[0]?.cells || [])];
  // The body's rows and its footer's (a total): each column as wide as the cells it holds need.
  const rows = [...tableRows(table), ...footRows(table)];
  const spanned = [...table.rows].some(row => [...row.cells].some(cell => cell.colSpan !== 1 || cell.rowSpan !== 1));
  const frame = frameOf(table);
  // Columns the reader sized are laid out at those widths, merged cells or not.
  const manual = manualWidths(table);
  if (manual) return manualLayout(table, frame, manual, measure);
  // Its columns: the header row's cells, or a table without one the first row's.
  const count = headers.length || rows[0]?.cells.length || 0;
  // Spanning/multilevel tables retain native layout; there is no unambiguous column input.
  if (!count || (table.tHead && table.tHead.rows.length !== 1) || spanned) return nativeLayout(table, frame);
  return allocatedLayout(table, frame, headers, rows, count, measure);
}

// What the elements a table's observer watches (the element its frame stands in, and the frame)
// measured (innerWidth) once its last layout's writes were done: a width the layout itself wrote, or
// one that followed from it, is no change for the observer.
const observedOf = new WeakMap(); // table -> [elements its observer watches]
const leftAt = new WeakMap(); // table -> Map(element -> px)

// Layouts the observer alone asks for, each within CHAIN_GAP of the last (a chain): the rooms they
// measured and how often the room came back to the one two layouts before (A, B, A: a frame whose
// width feeds back into its room through what holds it, which no layout of its own can settle).
// RETURNS_MAX such returns hold the chain: the observer is not followed for HOLD ms after its last
// layout, then the table is laid out once more. Any other layout (the table's content, the fonts,
// the window, an element around it shown, DocTables.layout) starts a chain afresh.
const CHAIN_GAP = 100; // ms
const RETURNS_MAX = 3;
const HOLD = 1000; // ms
const chains = new WeakMap(); // table -> { at, rooms, returns, held, timer }
function followChain(table, room, observed) {
  const now = performance.now();
  const chain = chains.get(table);
  if (!observed || !chain || now - chain.at > CHAIN_GAP) {
    if (chain?.timer) clearTimeout(chain.timer);
    chains.set(table, {at: now, rooms: [room], returns: 0, held: false, timer: 0});
    return;
  }
  const near = other => typeof room === 'number' && typeof other === 'number' && Math.abs(room - other) < SUBPIXEL;
  if (!near(chain.rooms.at(-1)) && near(chain.rooms.at(-2))) chain.returns++;
  chain.rooms = [...chain.rooms.slice(-2), room];
  chain.at = now;
  chain.held = chain.returns >= RETURNS_MAX;
}
// Whether the observer is held for the table (a chain that came back to its rooms): if so, the table
// is laid out once HOLD has passed since its chain's last layout.
function held(table) {
  const chain = chains.get(table);
  if (!chain?.held) return false;
  chain.timer ||= setTimeout(() => {
    chains.delete(table);
    queueLayout(table);
  }, Math.max(0, chain.at + HOLD - performance.now()));
  return true;
}

// The frame shown whole or at the kit's height (whole.js): data-doc-whole on it when its table
// is short or mostly words, which styles/table.css reads. A short table's cells are not read; a
// long one's text is, and what it said is kept until that text changes (a layout comes with each
// resize too). A frame that has just taken the kit's height keeps the caret in sight.
const wholeTexts = new WeakMap(); // table -> { text, whole }: its text when last read, and what it said
function markWhole(table) {
  const wrapper = wrapperOf(table);
  if (!wrapper) return;
  const rows = bodyRows(table);
  const whole = rows.length <= WHOLE_ROWS || mostlyWords(table, rows);
  const was = wrapper.hasAttribute('data-doc-whole');
  wrapper.toggleAttribute('data-doc-whole', whole);
  if (was && !whole) keepCaret(wrapper);
}

// The rows of a table's body that count as its rows: a table without a thead whose body begins with
// a row of header cells alone (its header row, written in the body) does not count that one.
function bodyRows(table) {
  const rows = tableRows(table);
  const headerCells = row => row.cells.length > 0 && [...row.cells].every(cell => cell.tagName === 'TH');
  return !table.tHead && rows.length > 1 && headerCells(rows[0]) && !headerCells(rows[1]) ? rows.slice(1) : rows;
}

// Whether at least half of the body's text stands in its columns of words (whole.js): each body
// cell's text by its column (a merged cell in its first), each column's kind as the allocator reads
// it (columnKind) and its text measured on one line in the table's font.
const textMeasurers = new Map(); // font -> createTextMeasurer(font): each keeps what it measured
function mostlyWords(table, rows) {
  const slots = slotsOf(rows);
  const columns = [];
  rows.forEach(row => [...row.cells].forEach((cell, index) => {
    const text = cellText(cell);
    if (text) (columns[slots ? slots.places.get(cell).c : index] ??= []).push(text);
  }));
  const font = fontFor(rows[0]?.cells[0] || table);
  const text = `${font}\n${columns.map(texts => texts?.join('\n') ?? '').join('\f')}`;
  const kept = wholeTexts.get(table);
  if (kept?.text === text) return kept.whole;
  if (!textMeasurers.has(font)) textMeasurers.set(font, createTextMeasurer(font));
  const measure = textMeasurers.get(font);
  const whole = shownWhole(rows.length, columns.filter(Boolean).map(texts => ({
    words: columnKind('', texts, measure) === 'narrative',
    width: texts.reduce((sum, each) => sum + measure(each), 0),
  })));
  wholeTexts.set(table, {text, whole});
  return whole;
}

// A frame that has just taken the kit's height (a row put in at the end of a table of 20 in the
// preview, the caret in it) scrolled down as little as brings the caret's cell over its bottom edge.
function keepCaret(wrapper) {
  const node = globalThis.getSelection?.()?.focusNode;
  const cell = (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement)?.closest('td, th');
  if (!cell || !wrapper.contains(cell)) return;
  const frame = wrapper.getBoundingClientRect();
  const below = cell.getBoundingClientRect().bottom - (frame.top + wrapper.clientTop + wrapper.clientHeight);
  if (below > 0) wrapper.scrollTop += below;
}

// The browser lays the table out. In a frame with a width of its own the table fills it (the browser
// shares the room out among its columns), past the reading width as much wider as the frame's share says.
function nativeLayout(table, frame) {
  if (table.classList.contains('doc-table--auto')) clearAuto(table, frame.wrapper);
  const frameSize = sizedInside(frame);
  if (frameSize) {
    table.dataset.docFilled = '';
    table.style.width = frameSize.wider > 1 ? `${frameSize.inner * frameSize.wider}px` : '100%';
    placeFrame(frame.wrapper, frameSize.inner * frameSize.wider, frameSize.inner);
  } else {
    if (table.hasAttribute('data-doc-filled')) {
      table.removeAttribute('data-doc-filled');
      table.style.removeProperty('width');
    }
    nativeAcross(table, frame.wrapper);
  }
  return frameSize?.inner ?? null;
}

// A table the browser lays out, its frame as wide as the table (styles/table.css: at most the text's width),
// past the text where the look lets it (across.js): the width the browser gives the table with the page's area
// for its frame (the most of its columns' widths, at most that, or the least they take where that is more)
// read, the frame as it was put back at once, then the frame placed by it.
function nativeAcross(table, wrapper) {
  if (!wrapper) return;
  if (!acrossLook()) return void clearAcross(wrapper); // nothing measured where the look keeps tables in the text
  const available = roomOf(wrapper, '100%');
  const edges = frameEdges(wrapper);
  const room = acrossRoom(wrapper, available, edges);
  if (room === null) return void clearAcross(wrapper);
  const before = {width: wrapper.style.width, maxWidth: wrapper.style.maxWidth};
  wrapper.style.maxWidth = 'none';
  wrapper.style.width = `${room + edges}px`;
  let natural;
  try {
    natural = table.getBoundingClientRect().width;
  } finally {
    wrapper.style.width = before.width;
    wrapper.style.maxWidth = before.maxWidth;
  }
  placeFrame(wrapper, natural, available);
}

// The columns' widths allocated from the cells' text (auto-column-widths.ts). Returns the room it
// measured (px), or null.
function allocatedLayout(table, frame, headers, rows, count, measureCell) {
  table.removeAttribute('data-doc-filled');
  const {wrapper, sized, wider} = frame;
  const parent = wrapper || table.parentElement;
  if (!parent) return null;
  // A wrapper with a width of its own (--doc-span, the reader's size from the preview) keeps
  // it, and the table fills it; past a share of 1 the wrapper stays at the reading width and the
  // table is that much wider, scrolling sideways. Any other wrapper is measured as wide as it may be
  // (100%, put back at once: roomOf) and takes the width its columns need, written once at the end.
  if (sized && wrapper.style.width) wrapper.style.width = '';
  const style = getComputedStyle(parent);
  const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0);
  const border = (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.borderRightWidth) || 0);
  // The frame's own scrollbars are hidden (styles/table.css; the kit draws thin ones over it, below),
  // so its whole inner width is the columns'. A frame with a width of its own placed past the text
  // (across.js) is measured as the text holds it (its max-width the stylesheet's while it is read).
  const held = sized && wrapper.hasAttribute(ACROSS) ? wrapper.style.maxWidth : '';
  if (held) wrapper.style.maxWidth = '';
  const available = roomOf(parent, wrapper && !sized ? '100%' : null);
  if (held) wrapper.style.maxWidth = held;
  if (!(available > 0)) return null;
  const font = fontFor(rows[0]?.cells[0] || table);
  const cellPadding = cellPaddingFor(getComputedStyle(rows[0]?.cells[0] || headers[0]));
  const measuredCells = new Map();
  for (const cell of [...headers, ...rows.flatMap(row => [...row.cells])]) measuredCells.set(cell, measureCell(cell));
  // On a narrow screen a third of the room: the most a column of text needs for its words; for a run
  // no line breaks in, the room the other columns leave at that (NARROW).
  const narrow = Boolean(globalThis.matchMedia?.(NARROW).matches);
  const share = narrow ? available / 3 : Infinity;
  const runRoom = narrow ? Math.max(share, available - (count - 1) * share) : Infinity;
  const columns = Array.from({length: count}, (_, index) => {
    const cells = [headers[index], ...rows.map(row => row.cells[index])].filter(Boolean);
    // The least its runs allow (a run of code or a number range whole on a line), when it has one;
    // on a narrow screen the widest piece of its words no line breaks in, where that is wider than its
    // share: a Latin word whole (comprehension, never comprehen|sion) up to 60% of the room, since the
    // table scrolls sideways anyway (a column is never under 120px); a Chinese column's
    // pieces are a character each, under any share, so it is as it was, and inline code keeps its own
    // rule (its runs, above: they break after a slash or a dot).
    const piece = narrow ? Math.max(0, ...cells.map(measureCell.prose)) : 0;
    const least = Math.max(Math.min(runRoom, Math.max(0, ...cells.map(measureCell.least))), piece > share ? Math.min(piece, available * 0.6) : 0);
    return {
      key: headers[index]?.dataset.columnKey || String(index),
      header: headers[index] ? cellText(headers[index]) : '',
      headerWidth: headers[index] ? measuredCells.get(headers[index]) : 0,
      // Include filtered-out rows so toggling a filter does not shift the columns.
      cells: rows.map(row => row.cells[index] ? cellText(row.cells[index]) : ''),
      cellWidths: rows.map(row => measuredCells.get(row.cells[index]) ?? 0),
      // Its longest words (WORD_BREAKS), for a short text column that wraps beside columns of prose.
      headerWordWidth: headers[index] ? measureCell.word(headers[index]) : 0,
      cellWordWidths: rows.map(row => row.cells[index] ? measureCell.word(row.cells[index]) : 0),
      // Its widest pieces no line breaks in (PIECE_BREAKS), the least such a column is lowered to.
      cellPieceWidths: rows.map(row => row.cells[index] ? measureCell.piece(row.cells[index]) : 0),
      // A numeric column (cells.js) keeps its floor on a narrow screen: a number never wraps.
      numeric: cells.some(cell => cell.classList.contains('number')),
      ...(least > 0 ? {minWidth: least} : {}),
    };
  });
  const target = available * wider;
  const options = {font, cellPadding, ...(share < Infinity ? {maxReadableFloor: share} : {})};
  let result = allocateColumnWidths(columns, {totalWidth:target, ...options});
  let sum = result.reduce((value, column) => value + column.width, 0);
  // Wider than the text (its columns at their readable floors still past it), in the body, where the look lets
  // it (宽表格, across.js): the columns allocated again over the room past the text, the page's area at
  // full width, so that they wrap as little as that room lets them; the frame placed on it below.
  const across = !sized && wrapper && sum > available + 0.5 ? acrossRoom(wrapper, available, border + padding) : null;
  if (across !== null) {
    result = allocateColumnWidths(columns, {totalWidth:across, ...options});
    sum = result.reduce((value, column) => value + column.width, 0);
  }
  // A table is as wide as its columns need, whatever their number. While it fits the reading
  // width, no column is narrower than a new column (COLUMN_FLOOR): the room left raises
  // the narrow ones, so an empty or short column does not shrink to its few characters.
  if (!sized && sum < available) {
    const raised = raiseNarrow(result.map(column => column.width), available - sum, COLUMN_FLOOR);
    result.forEach((column, index) => { column.width = raised[index]; });
    // All the room taken: the frame's width exactly (the sum of the shares is a hair off it).
    sum = Math.min(available, raised.reduce((value, width) => value + width, 0));
    if (available - sum < 0.01) sum = available;
    result.forEach(column => { column.ratio = column.width / sum; });
  }
  const tableWidth = sized ? Math.max(target, sum) : sum;
  table.classList.add('doc-table--auto');
  // A wrapper with a width of its own is rarely a whole number of pixels, and the reader may set
  // it right at the columns' floors: a table that fills it, or would overhang it by a few pixels,
  // takes 100% (its columns give up those pixels) rather than scrolling by a hair.
  table.style.width = sized && tableWidth <= available + 4 ? '100%' : `${tableWidth}px`;
  // The narrowest the wrapper may get before the table scrolls (the columns' readable floors),
  // for the preview's resize handle.
  if (wrapper) setAttribute(wrapper, 'data-doc-min-width', String(Math.ceil(result.reduce((value, column) => value + column.softMinWidth, 0) + border + padding)));
  if (across !== null) placeAcross(wrapper, Math.min(tableWidth, across) + border + padding);
  else if (wrapper && sized) placeFrame(wrapper, tableWidth, available);
  else if (wrapper) {
    clearAcross(wrapper);
    setStyle(wrapper, 'width', tableWidth >= available - 0.01
      ? '100%'
      : `${tableWidth + border + padding}px`);
  }
  writeColgroup(table, result.map(column => ({width: `${column.ratio * 100}%`, key: column.key})));
  result.forEach((column, index) => {
    for (const cell of [headers[index], ...rows.map(row => row.cells[index])].filter(Boolean)) {
      setAttribute(cell, 'data-column-kind', column.kind);
      // P90 deliberately ignores extremes: wrap outliers instead of clipping or overlapping. A
      // header or a short field that wraps keeps its words whole where its column holds its longest
      // one ("words", styles/table.css), else breaks between characters (never before a closing mark).
      const width = column.ratio * tableWidth;
      if (measuredCells.get(cell) > width + 0.5) setAttribute(cell, 'data-column-wrap', (cell.tagName === 'TH' || column.kind === 'compact') && measureCell.word(cell) <= width + 0.5 ? 'words' : '');
      else cell.removeAttribute('data-column-wrap');
      markRunWrap(cell, width, measureCell);
    }
  });
  layouts.set(table, result.map(column => ({...column, width:column.ratio * tableWidth})));
  return available;
}

// Tables laid out in the next frame, at most once each; `observed`: asked by its observer alone (a
// layout asked for anything else as well is not).
const observedOnly = new WeakSet();
export function queueLayout(table, {observed = false} = {}) {
  if (!observed) observedOnly.delete(table);
  else if (!pendingLayouts.has(table)) observedOnly.add(table);
  pendingLayouts.add(table);
  if (layoutFrame) return;
  layoutFrame = requestAnimationFrame(() => {
    layoutFrame = 0;
    const tables = [...pendingLayouts];
    pendingLayouts.clear();
    for (const table of tables) {
      const observed = observedOnly.has(table);
      observedOnly.delete(table);
      if (table.isConnected) refreshLayout(table, {observed});
    }
  });
}

// Tables laid out once the page is idle (a second at most): content rebuilt to look as it did (the
// page editor starting, DocKit.quietly), which seldom changes a width, is measured again then,
// not in the frame the editor starts in. A table laid out meanwhile is not laid out again for it.
const idleLayouts = new Set();
let idleQueued = false;
export function idleLayout(table) {
  idleLayouts.add(table);
  if (idleQueued) return;
  idleQueued = true;
  const run = () => {
    idleQueued = false;
    const tables = [...idleLayouts];
    idleLayouts.clear();
    tables.forEach(table => queueLayout(table));
  };
  if (globalThis.requestIdleCallback) requestIdleCallback(run, {timeout: 1000});
  else setTimeout(run, 50);
}

// The table watched: laid out again when the element its frame stands in, or the frame (one with a
// share of its own also narrows by itself), changes width, by SUBPIXEL or more from what the last
// layout left it at (leftAt): never for a width the layout itself wrote or caused.
export function applyColumnWidths(table, {layout = true} = {}) {
  if (!layoutObservers.has(table)) {
    const observer = new ResizeObserver(entries => {
      const left = leftAt.get(table);
      const changed = entries.some(({target, contentRect}) => !(Math.abs(contentRect.width - (left?.get(target) ?? NaN)) < SUBPIXEL));
      if (changed && !held(table)) queueLayout(table, {observed: true});
    });
    const wrapper = wrapperOf(table);
    const parent = wrapper ? wrapper.parentElement : table.parentElement;
    const watched = [parent, wrapper].filter(Boolean);
    watched.forEach(element => observer.observe(element));
    observedOf.set(table, watched);
    layoutObservers.set(table, observer);
    if (wrapper) drawScrollbars(wrapper, table);
  }
  if (layout) queueLayout(table);
}

export function applyLayoutDefaults(table, options) {
  applyColumnWidths(table, options);
  return table;
}
