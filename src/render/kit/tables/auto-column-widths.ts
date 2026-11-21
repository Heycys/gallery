/** Adapted from the user-supplied autoColumnWidths.ts: deterministic P90 + water filling, with scrolling at readable floors. */
// The types are the SDK's (skills/gallery/sdk/column-widths.d.ts), so that sdk/ stands alone (a skill carries no src/).
import type { ColumnInput, ColumnKind, ColumnLayout, ColumnWidthOptions } from "../../../../skills/gallery/sdk/column-widths.js";
export type { ColumnInput, ColumnKind, ColumnLayout, ColumnWidthOptions };
const defaults = {percentile:0.9, hardMinWidth:48, narrativeMinWidth:160, maxReadableFloor:Infinity, tokenHeavyMinWidth:140,
  compactMaxProtectedWidth:160, cellPadding:24, columnOverhead:0, font:'14px system-ui'};
const kinds: ColumnKind[] = ['token-heavy', 'narrative', 'compact'];
const total = (columns: ColumnLayout[]) => columns.reduce((sum, column) => sum + column.width, 0);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
function quantile(values: number[], q: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * q;
  const low = Math.floor(position), high = Math.ceil(position);
  return sorted[low] * (1 - position + low) + sorted[high] * (position - low);
}
export function createTextMeasurer(font: string): (text: string) => number {
  const context = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  if (context) context.font = font;
  const size = Number(font.match(/([\d.]+)px/)?.[1]) || 14;
  const cache = new Map<string, number>();
  return (text) => {
    if (cache.has(text)) return cache.get(text)!;
    // Fallback is only for unavailable canvas; real browsers use measureText.
    const width = Math.max(0, ...text.split(/\r\n|\r|\n/).map(line => context ? context.measureText(line).width
      : Array.from(line).reduce((sum, char) => sum + size * (/[^\x00-\xff]/.test(char) ? 1 : 0.55), 0)));
    cache.set(text, width);
    return width;
  };
}
/**
 * Where a cell that keeps its words whole breaks its text (keep-all, the kit's styles/table.css: a
 * header, a short text column's cell): at a space, after a closing or separating mark (、，。；）… ,
 * ; ) a slash) or a hyphen before a letter, before an opening one (（「《… ( [); never before a
 * closing mark nor after an opening one ((1616)， is one word). A Chinese word, a number range, 3.5,
 * doc.json and 7B-8 stay whole.
 */
export const WORD_BREAKS = /\s+|(?<=[、，。；：！？）」』》】〉〕”’,;!?)\]/])(?=[^\s、，。；：！？）」』》】〉〕”’,;!?)\]])|(?<=-)(?=[^\d\s-])|(?<=[^\s（「『《【〈〔“‘(\[])(?=[（「『《【〈〔“‘(\[])/u;
/**
 * Where a cell that breaks its words as Chinese text does breaks its text (a short field narrower
 * than its longest word): where WORD_BREAKS does, and before and after each Chinese or Japanese
 * character, but never before a closing mark nor after an opening one. What it leaves whole no line
 * breaks in: （1606）， and a number are one piece each.
 */
export const PIECE_BREAKS = new RegExp(String.raw`${WORD_BREAKS.source}|(?<=[^\s（「『《【〈〔“‘(\[])(?=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])|(?<=[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}])(?=[^\s、，。；：！？）」』》】〉〕”’,;!?)\]])`, 'u');
const longest = (text: string, breaks: RegExp, measure: (text: string) => number) => Math.max(0, ...text.trim().split(breaks).map(measure));
function tokenHeavy(token: string): boolean {
  if (/^https?:\/\//i.test(token) || /[/\\]/.test(token)) return true;
  if (/^[a-f0-9]{20,}$/i.test(token)) return true;
  if (token.length >= 24 && /^[A-Za-z0-9_.:@/+~-]+$/.test(token)) return true;
  // Unspaced Chinese/Japanese prose is natural text, not a long identifier.
  return token.length >= 28 && !/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af]/.test(token);
}
/**
 * A column's kind from its text (`cells`: its cells' texts, the empty ones left out; `header` read
 * when it has none), each text's width given by `measure`: token-heavy when at least half of its
 * words are paths, links or long identifiers, narrative (prose) when its cells average four words
 * or a line as wide as the Latin alphabet, compact otherwise. The kit's tables/whole.js reads a
 * table's columns of words by it.
 */
export function columnKind(header: string, cells: string[], measure: (text: string) => number): ColumnKind {
  return analyze(header, cells, measure).kind;
}
function analyze(header: string, cells: string[], measure: (text: string) => number) {
  const values = cells.length ? cells : [header];
  let words = 0, width = 0, heavy = 0;
  for (const value of values) {
    const tokens = value.trim().split(/\s+/).filter(Boolean);
    words += tokens.length;
    width += measure(value);
    for (const token of tokens) {
      if (tokenHeavy(token)) heavy++;
    }
  }
  const kind: ColumnKind = heavy > 0 && heavy / words >= 0.5 ? 'token-heavy'
    : words / values.length >= 4 || width / values.length >= measure('abcdefghijklmnopqrstuvwxyz') ? 'narrative' : 'compact';
  return {kind};
}
function shrink(columns: ColumnLayout[], available: number, padding: number) {
  let overflow = total(columns) - available;
  const epsilon = 0.000001;
  // Share wrapping pressure across paths and prose. Equal content-width ratios
  // approximate equal line counts; padding must not count as compressible text.
  // Compact fields participate only after flexible columns reach readable floors.
  for (const compact of [false, true]) {
    const group = columns.filter(column => (column.kind === 'compact') === compact);
    while (overflow > epsilon) {
      const states = group.map(column => ({column, slack:column.width - column.softMinWidth,
        content:Math.max(1, column.preferredWidth - padding)})).filter(item => item.slack > epsilon);
      if (!states.length) break;
      const contentSum = states.reduce((sum, state) => sum + state.content, 0);
      const fraction = Math.min(overflow / contentSum, ...states.map(state => state.slack / state.content));
      let reduced = 0;
      for (const {column, content} of states) {
        const before = column.width;
        column.width = Math.max(column.softMinWidth, before - fraction * content);
        reduced += before - column.width;
      }
      if (reduced <= epsilon) break;
      overflow -= reduced;
    }
  }
}
// `widths` lowered by `excess` px in all, none below its floor: the widest first, to one level
// (water filling from above); as far as the floors allow.
function lowerWidest(widths: number[], floors: number[], excess: number): number[] {
  const lowered = (level: number) => widths.map((width, index) => Math.min(width, Math.max(level, floors[index])));
  const saved = (level: number) => widths.reduce((sum, width, index) => sum + width - Math.min(width, Math.max(level, floors[index])), 0);
  let low = Math.min(...floors), high = Math.max(...widths);
  if (saved(low) <= excess) return lowered(low);
  for (let step = 0; step < 40; step++) {
    const level = (low + high) / 2;
    if (saved(level) > excess) low = level;
    else high = level;
  }
  return lowered(high);
}
export function allocateColumnWidths(columns: ColumnInput[], options: ColumnWidthOptions): ColumnLayout[] {
  const config = {...defaults, ...options};
  if (!Number.isFinite(config.totalWidth) || config.totalWidth <= 0) throw new Error('totalWidth must be positive and finite.');
  for (const key of ['percentile', 'hardMinWidth', 'narrativeMinWidth', 'tokenHeavyMinWidth', 'compactMaxProtectedWidth', 'cellPadding', 'columnOverhead'] as const) {
    if (!Number.isFinite(config[key]) || config[key] < 0) throw new Error(`${key} must be finite and nonnegative.`);
  }
  if (!(config.maxReadableFloor > 0)) throw new Error('maxReadableFloor must be positive.');
  if (config.hardMinWidth === 0 || config.percentile > 1) throw new Error('hardMinWidth must be positive; percentile must be between 0 and 1.');
  if (typeof config.font !== 'string' || !config.font.trim()) throw new Error('font must be a nonempty string.');
  if (!Array.isArray(columns)) throw new Error('columns must be an array.');
  const keys = new Set<string>();
  const measure = createTextMeasurer(config.font);
  const compactTargets: Array<{column: ColumnLayout; width: number}> = [];
  const wordFloors = new Map<ColumnLayout, {whole: number; least: number}>();
  const layouts = columns.map(column => {
    if (!column || typeof column.key !== 'string' || !column.key || keys.has(column.key)) throw new Error('Column keys must be unique nonempty strings.');
    keys.add(column.key);
    if (typeof column.header !== 'string' || !Array.isArray(column.cells)) throw new Error('Each column requires a header and cells.');
    if (column.kind !== undefined && !kinds.includes(column.kind)) throw new Error('Invalid column kind.');
    if (column.numeric !== undefined && typeof column.numeric !== 'boolean') throw new Error('numeric must be a boolean.');
    for (const value of column.cells) if (value != null && typeof value !== 'string' && (typeof value !== 'number' || !Number.isFinite(value))) throw new Error('Cells must be strings, finite numbers, null or undefined.');
    const hardMinWidth = Math.max(config.hardMinWidth, column.minWidth ?? 0);
    for (const bound of [column.minWidth, column.maxWidth]) if (bound !== undefined && (!Number.isFinite(bound) || bound <= 0)) throw new Error('Column bounds must be positive and finite.');
    if (column.maxWidth !== undefined && column.maxWidth < hardMinWidth) throw new Error('maxWidth cannot be below the hard minimum.');
    if (column.cellWidths !== undefined && (!Array.isArray(column.cellWidths) || column.cellWidths.length !== column.cells.length
      || column.cellWidths.some(width => !Number.isFinite(width) || width < 0))) throw new Error('cellWidths must match cells and contain finite nonnegative widths.');
    if (column.cellWordWidths !== undefined && (!Array.isArray(column.cellWordWidths) || column.cellWordWidths.length !== column.cells.length
      || column.cellWordWidths.some(width => !Number.isFinite(width) || width < 0))) throw new Error('cellWordWidths must match cells and contain finite nonnegative widths.');
    if (column.headerWordWidth !== undefined && (!Number.isFinite(column.headerWordWidth) || column.headerWordWidth < 0)) throw new Error('headerWordWidth must be finite and nonnegative.');
    if (column.cellPieceWidths !== undefined && (!Array.isArray(column.cellPieceWidths) || column.cellPieceWidths.length !== column.cells.length
      || column.cellPieceWidths.some(width => !Number.isFinite(width) || width < 0))) throw new Error('cellPieceWidths must match cells and contain finite nonnegative widths.');
    const nonempty = column.cells.map((value, index) => ({value, index})).filter(({value}) => value != null && String(value).trim() !== '');
    const values = nonempty.map(({value}) => String(value));
    if (column.headerWidth !== undefined && (!Number.isFinite(column.headerWidth) || column.headerWidth < 0)) throw new Error('headerWidth must be finite and nonnegative.');
    const headerWidth = column.headerWidth ?? (measure(column.header) + config.cellPadding);
    const analysis = analyze(column.header, values, measure);
    const kind = column.kind ?? analysis.kind;
    const measuredWidths = nonempty.map(({value, index}) => column.cellWidths?.[index] ?? (measure(String(value)) + config.cellPadding));
    // P90 can fall just below a short label (even API/Agent with two rows).
    // Protect complete compact values within the existing budget; long outliers
    // still use P90 and may wrap. Explicit maxWidth remains authoritative.
    const protectedWidth = kind === 'compact' ? measuredWidths.reduce((max, width) =>
      width <= config.compactMaxProtectedWidth ? Math.max(max, width) : max, 0) : 0;
    const preferredWidth = clamp(Math.max(headerWidth, protectedWidth, quantile(measuredWidths, config.percentile)), hardMinWidth, column.maxWidth ?? Infinity);
    // Give typical long values roughly three lines before switching to scrolling.
    // Cap the content-derived floor so extreme text never demands a huge column.
    const contentFloor = Math.min(320, config.cellPadding + Math.max(0, quantile(measuredWidths, config.percentile) - config.cellPadding) / 3);
    const floor = kind === 'token-heavy' ? Math.max(config.tokenHeavyMinWidth, contentFloor)
      : kind === 'narrative' ? Math.max(config.narrativeMinWidth, contentFloor)
      : Math.min(config.compactMaxProtectedWidth, preferredWidth);
    // A column of text never needs more than maxReadableFloor (a narrow screen's share); one of numbers keeps its own.
    const soft = column.numeric ? floor : Math.min(config.maxReadableFloor, floor);
    const layout = {key:column.key, kind, preferredWidth, softMinWidth:clamp(soft, hardMinWidth, preferredWidth), hardMinWidth, width:preferredWidth, ratio:0};
    if (kind === 'compact') {
      for (const width of new Set(measuredWidths)) {
        if (width > preferredWidth && width <= (column.maxWidth ?? Infinity)) compactTargets.push({column:layout, width});
      }
      // A short text column's floors beside prose, for below: its cells' longest words (P90 of
      // them: each word whole), then their median (the longer half break where they must); at least
      // its header's longest word, and its widest piece no line breaks in ((1606)，, a number), which
      // a narrower column would cut anywhere, a closing mark starting a line.
      if (!column.numeric) {
        const words = nonempty.map(({value, index}) => column.cellWordWidths?.[index] ?? (longest(String(value), WORD_BREAKS, measure) + config.cellPadding));
        const pieces = nonempty.map(({value, index}) => column.cellPieceWidths?.[index] ?? (longest(String(value), PIECE_BREAKS, measure) + config.cellPadding));
        const least = Math.max(column.headerWordWidth ?? (longest(column.header, WORD_BREAKS, measure) + config.cellPadding), ...pieces);
        wordFloors.set(layout, {whole: Math.max(least, quantile(words, config.percentile)), least: Math.max(least, quantile(words, 0.5))});
      }
    }
    return layout;
  });
  // A short text column beside columns of prose (卷数 beside 看点) may get as narrow as its words,
  // not its whole values: added to a table of prose, it wraps at its punctuation (六十卷、 / 目录一卷)
  // before the prose is pushed past the frame (it shrinks only after the prose has reached its own
  // floor: shrink below). A table of short fields alone keeps its values whole.
  const besideProse = layouts.some(column => column.kind === 'narrative') ? wordFloors : new Map<ColumnLayout, {whole: number; least: number}>();
  for (const [column, {whole}] of besideProse) column.softMinWidth = clamp(Math.min(column.softMinWidth, whole), column.hardMinWidth, column.preferredWidth);
  // Scrolling is available: do not trade readability for fitting the viewport.
  const target = config.totalWidth - columns.length * config.columnOverhead;
  const readableWidth = layouts.reduce((sum, column) => sum + column.softMinWidth, 0);
  const available = Math.max(target, readableWidth);
  // P90 need not force a short field to wrap when the viewport still has room.
  // Buy complete values with spare space, small additions first. Never partially
  // expand an outlier, exceed explicit bounds, or take space from another column.
  let spare = available - total(layouts);
  compactTargets.sort((a, b) => (a.width - a.column.width) - (b.width - b.column.width)
    || a.column.key.localeCompare(b.column.key));
  for (const {column, width} of compactTargets) {
    const extra = width - column.width;
    if (extra > 0 && extra <= spare) {
      column.width = width;
      column.preferredWidth = width;
      spare -= extra;
    }
  }
  shrink(layouts, available, config.cellPadding);
  // Still past the frame with each word whole: those short text columns give up their longest words,
  // the widest of them first, down to their median word (lowerWidest), when that brings the table
  // inside the frame; a table that scrolls anyway keeps their words whole.
  const excess = total(layouts) - target;
  if (excess > 0.5 && besideProse.size) {
    const lowered = [...besideProse].map(([column, {least}]) => ({column, floor: clamp(Math.min(column.softMinWidth, least), column.hardMinWidth, column.preferredWidth)}));
    if (lowered.reduce((sum, {column, floor}) => sum + column.width - floor, 0) >= excess) {
      const widths = lowerWidest(lowered.map(({column}) => column.width), lowered.map(({floor}) => floor), excess);
      lowered.forEach(({column}, index) => { column.width = widths[index]; column.softMinWidth = Math.min(column.softMinWidth, widths[index]); });
    }
  }
  const sum = total(layouts);
  layouts.forEach(column => { column.ratio = column.width / sum; });
  return layouts;
}
