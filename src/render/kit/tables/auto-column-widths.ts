/** Adapted from the user-supplied autoColumnWidths.ts: deterministic P90 + water filling, with scrolling at readable floors. */
// The types are the SDK's (skills/gallery/sdk/column-widths.d.ts), so that sdk/ stands alone (a skill carries no src/).
import type { ColumnInput, ColumnKind, ColumnLayout, ColumnWidthOptions } from "../../../../skills/gallery/sdk/column-widths.js";
import { numberValue } from "../../../shared/number-reading.mjs";
export type { ColumnInput, ColumnKind, ColumnLayout, ColumnWidthOptions };
const defaults = {percentile:0.9, hardMinWidth:48, narrativeMinWidth:160, maxReadableFloor:Infinity, tokenHeavyMinWidth:140,
  compactMaxProtectedWidth:160, longWordMaxWidth:640, keepLongWords:false, cellPadding:24, columnOverhead:0, font:'14px system-ui'};
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
 * closing mark nor after an opening one ((1616)， is one word), nor after a comma or a slash between
 * digits (12,345 and 11/24 are one word, as the browser keeps them). A Chinese word, a number range,
 * 3.5, doc.json and 7B-8 stay whole.
 */
export const WORD_BREAKS = /\s+|(?<=[、，。；：！？）」』》】〉〕”’,;!?)\]/])(?!(?<=\d[,/])\d)(?=[^\s、，。；：！？）」』》】〉〕”’,;!?)\]])|(?<=-)(?=[^\d\s-])|(?<=[^\s（「『《【〈〔“‘(\[])(?=[（「『《【〈〔“‘(\[])/u;
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
  return token.length >= 28 && !/[぀-ヿ㐀-鿿가-힯]/.test(token);
}
/**
 * A column's kind from its text (`cells`: its cells' texts, the empty ones left out; `header` read
 * when it has none), each text's width given by `measure`: token-heavy when at least half of its
 * words are paths, links or long identifiers; compact when at least half of them are numbers (a
 * list of figures, +8,214 +19,877, is no prose however long); narrative (prose) when its cells
 * average four words or a line as wide as the Latin alphabet; compact otherwise. The kit's
 * tables/whole.js reads a table's columns of words by it.
 */
export function columnKind(header: string, cells: string[], measure: (text: string) => number): ColumnKind {
  return analyze(header, cells, measure).kind;
}
function analyze(header: string, cells: string[], measure: (text: string) => number) {
  const values = cells.length ? cells : [header];
  let words = 0, width = 0, heavy = 0, numbers = 0;
  for (const value of values) {
    const tokens = value.trim().split(/\s+/).filter(Boolean);
    words += tokens.length;
    width += measure(value);
    // A number as tables write it (src/shared/number-reading.mjs: 1,204, -3.2%, 4.2 GB), the whole
    // value or each of its words.
    const whole = /\d/.test(value) && numberValue(value) !== null;
    for (const token of tokens) {
      if (tokenHeavy(token)) heavy++;
      if (whole || /\d/.test(token) && numberValue(token) !== null) numbers++;
    }
  }
  const kind: ColumnKind = heavy > 0 && heavy / words >= 0.5 ? 'token-heavy'
    : numbers > 0 && numbers / words >= 0.5 ? 'compact'
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
/**
 * What a table that does not fit its frame at its readable floors may give up to fit it, cheapest
 * first (the floors a column has below the one that keeps it whole; giveUp below): the words of its
 * short text (`words`: a list of figures, +8,214 +19,877 …, one to a line; a short field beside prose
 * down to its median word), the width of its headers (`headers`: a header much wider than its values
 * wrapped at its words), then its long identifiers (`identifiers`: a dataset's or a hash's name, kept
 * whole on its line until then, broken where its column ends).
 */
type Stage = 'words' | 'headers' | 'identifiers';
/**
 * Each column's floor with every stage given up (allocateColumnWidths writes it for the columns it
 * returns): the narrowest the table gets before it scrolls, whatever it keeps whole while it has room
 * (the kit's frame says it, data-doc-min-width, for the page editor's handle that resizes it).
 */
export const leastWidths = new WeakMap<ColumnLayout, number>();
// The floors of a table that does not fit its frame (`target`) at the floors that keep its columns
// whole (`keep`): lowered toward `gives` (each column's floor once a stage is given up), as little as
// brings the table inside the frame. The cheap stages first, the widest floors of a stage first (water
// filling); identifiers, once they must break, break whole (wherever a line ends in them, a column a
// little wider breaks them as well) and the cheap stages give only what is left. A table that scrolls
// at the floors of every stage given up keeps every floor whole: it gives nothing for nothing.
function giveUp(keep: number[], gives: Array<Partial<Record<Stage, number>>>, target: number, stages: Stage[]): number[] {
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  const floorsWith = (given: Stage[], from = keep) => from.map((floor, index) => Math.min(floor, ...given.map(stage => gives[index][stage] ?? Infinity)));
  if (sum(keep) <= target + 0.000001) return keep;
  if (sum(floorsWith(stages)) > target + 0.000001) return keep;
  // Lowered by water filling within the stages given part of: earlier ones whole, the last as little as needed.
  const fill = (from: number[], order: Stage[]) => {
    let floors = from;
    for (const [index, stage] of order.entries()) {
      const whole = floorsWith([stage], floors);
      if (sum(whole) <= target + 0.000001) {
        const columns = floors.map((floor, column) => whole[column] < floor ? column : -1).filter(column => column >= 0);
        const lowered = lowerWidest(columns.map(column => floors[column]), columns.map(column => whole[column]), sum(floors) - target);
        floors = [...floors];
        columns.forEach((column, at) => { floors[column] = lowered[at]; });
        return floors;
      }
      floors = whole;
      if (index === order.length - 1) return floors;
    }
    return floors;
  };
  const cheap = stages.filter(stage => stage !== 'identifiers');
  if (!stages.includes('identifiers') || sum(floorsWith(cheap)) <= target + 0.000001) return fill(keep, cheap);
  const broken = floorsWith(['identifiers']);
  return sum(broken) <= target + 0.000001 ? broken : fill(broken, cheap);
}
// The fewest lines `text` can take in `room` px (its one line, `width` px, packed edge to edge, the
// spaces where lines end left out): no browser lays it in fewer.
function fewestLines(text: string, width: number, room: number, space: number): number {
  if (!text.trim() || width <= 0) return 0;
  const spaces = text.trim().split(/\s+/).length - 1;
  return Math.max(1, Math.ceil((width - spaces * space) / Math.max(1, room) - 0.000001));
}
// The lines `text` takes in `room` px where a line breaks only at a space or between its `breaks`
// (a short field's words kept whole: keep-all), each piece `scale` times as wide as `measure` says,
// filled one line after another as a browser fills them; a piece wider than a line breaks anywhere.
function linesOf(text: string, room: number, breaks: RegExp, measure: (text: string) => number, scale: number): number {
  if (!text.trim()) return 0;
  const space = measure(' ') * scale;
  let lines = 1, line = 0;
  for (const token of text.trim().split(/\s+/)) {
    token.split(breaks).filter(Boolean).forEach((piece, index) => {
      const width = measure(piece) * scale;
      const gap = index === 0 && line > 0 ? space : 0;
      if (line > 0 && line + gap + width > room) { lines++; line = 0; } else line += gap;
      if (width > room) {
        const more = Math.ceil(width / room) - 1;
        lines += more;
        line = width - more * room;
      } else line += width;
    });
  }
  return lines;
}
export function allocateColumnWidths(columns: ColumnInput[], options: ColumnWidthOptions): ColumnLayout[] {
  const config = {...defaults, ...options};
  if (!Number.isFinite(config.totalWidth) || config.totalWidth <= 0) throw new Error('totalWidth must be positive and finite.');
  for (const key of ['percentile', 'hardMinWidth', 'narrativeMinWidth', 'tokenHeavyMinWidth', 'compactMaxProtectedWidth', 'cellPadding', 'columnOverhead'] as const) {
    if (!Number.isFinite(config[key]) || config[key] < 0) throw new Error(`${key} must be finite and nonnegative.`);
  }
  if (!(config.maxReadableFloor > 0)) throw new Error('maxReadableFloor must be positive.');
  if (!(config.longWordMaxWidth >= 0)) throw new Error('longWordMaxWidth must be nonnegative.');
  if (typeof config.keepLongWords !== 'boolean') throw new Error('keepLongWords must be a boolean.');
  if (config.hardMinWidth === 0 || config.percentile > 1) throw new Error('hardMinWidth must be positive; percentile must be between 0 and 1.');
  if (typeof config.font !== 'string' || !config.font.trim()) throw new Error('font must be a nonempty string.');
  if (!Array.isArray(columns)) throw new Error('columns must be an array.');
  const keys = new Set<string>();
  const measure = createTextMeasurer(config.font);
  const compactTargets: Array<{column: ColumnLayout; width: number}> = [];
  // A short text column's floors by its words: `whole` each word whole, `least` down to its median word;
  // `long`: values wider than its protection (they wrap at its floor already).
  const wordFloors = new Map<ColumnLayout, {whole: number; least: number; long: boolean}>();
  // The floors a column gives up to when its table does not fit (giveUp): a header's longest word
  // where its header is wider than its values; a long identifier's floor, kept whole until then.
  const headerFloors = new Map<ColumnLayout, number>();
  const identifierFloors = new Map<ColumnLayout, number>();
  // Each column's cells by row (its texts and their one-line widths with padding, 0 for an empty
  // one) and its header's, for the rows a narrower column would make taller (narrowFree below).
  const rows = new Map<ColumnLayout, {texts: string[]; widths: number[]; header: string; headerWidth: number}>();
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
    const headerWord = column.headerWordWidth ?? (longest(column.header, WORD_BREAKS, measure) + config.cellPadding);
    const analysis = analyze(column.header, values, measure);
    const kind = column.kind ?? analysis.kind;
    const measuredWidths = nonempty.map(({value, index}) => column.cellWidths?.[index] ?? (measure(String(value)) + config.cellPadding));
    const words = nonempty.map(({value, index}) => column.cellWordWidths?.[index] ?? (longest(String(value), WORD_BREAKS, measure) + config.cellPadding));
    // P90 can fall just below a short label (even API/Agent with two rows).
    // Protect complete compact values within the existing budget; long outliers
    // still use P90 and may wrap. Explicit maxWidth remains authoritative.
    const protectedWidth = kind === 'compact' ? measuredWidths.reduce((max, width) =>
      width <= config.compactMaxProtectedWidth ? Math.max(max, width) : max, 0) : 0;
    const p90 = quantile(measuredWidths, config.percentile);
    const preferredWidth = clamp(Math.max(headerWidth, protectedWidth, p90), hardMinWidth, column.maxWidth ?? Infinity);
    // Give typical long values roughly three lines before switching to scrolling.
    // Cap the content-derived floor so extreme text never demands a huge column.
    const contentFloor = Math.min(320, config.cellPadding + Math.max(0, p90 - config.cellPadding) / 3);
    const floor = kind === 'token-heavy' ? Math.max(config.tokenHeavyMinWidth, contentFloor)
      : kind === 'narrative' ? Math.max(config.narrativeMinWidth, contentFloor)
      : Math.min(config.compactMaxProtectedWidth, preferredWidth);
    // A column of text never needs more than maxReadableFloor (a narrow screen's share); one of numbers keeps its own.
    const readable = (width: number) => column.numeric ? width : Math.min(config.maxReadableFloor, width);
    const softMinWidth = clamp(readable(floor), hardMinWidth, preferredWidth);
    const layout = {key:column.key, kind, preferredWidth, softMinWidth, hardMinWidth, width:preferredWidth, ratio:0};
    const texts = column.cells.map(value => value == null ? '' : String(value));
    rows.set(layout, {texts, header: column.header, headerWidth,
      widths: texts.map((text, index) => !text.trim() ? 0 : column.cellWidths?.[index] ?? (measure(text) + config.cellPadding))});
    if (kind === 'token-heavy' && !column.numeric) {
      // A column of long identifiers (a dataset's name, a hash) keeps each whole on its line: its floor
      // is its widest word no wider than longWordMaxWidth (about eighty characters; every such word, as a
      // short field's values within their protection, never P90's interpolation a pixel short of the
      // widest); a wider one breaks where its column ends whatever its width. Given up (the floor above,
      // about three lines of its text) only when that brings the table inside its frame (giveUp).
      const widest = Math.min(Math.max(0, ...words.filter(width => width <= config.longWordMaxWidth)), column.maxWidth ?? Infinity);
      const whole = Math.max(hardMinWidth, readable(widest));
      if (whole > softMinWidth + 0.5) {
        layout.preferredWidth = layout.width = Math.max(preferredWidth, whole);
        layout.softMinWidth = whole;
        identifierFloors.set(layout, softMinWidth);
      }
    }
    if (kind === 'compact') {
      for (const width of new Set(measuredWidths)) {
        if (width > preferredWidth && width <= (column.maxWidth ?? Infinity)) compactTargets.push({column:layout, width});
      }
      // A short text column's floors by its words, for giveUp: its cells' longest words (P90 of
      // them: each word whole), then their median (the longer half break where they must); at least
      // its header's longest word, and its widest piece no line breaks in ((1606)，, a number), which
      // a narrower column would cut anywhere, a closing mark starting a line.
      if (!column.numeric) {
        const pieces = nonempty.map(({value, index}) => column.cellPieceWidths?.[index] ?? (longest(String(value), PIECE_BREAKS, measure) + config.cellPadding));
        const least = Math.max(headerWord, ...pieces);
        wordFloors.set(layout, {whole: Math.max(least, quantile(words, config.percentile)), least: Math.max(least, quantile(words, 0.5)), long: p90 > config.compactMaxProtectedWidth});
      }
      // A header wider than what its column's values keep (平均响应延迟（毫秒） over 12): its longest
      // word, its values as they are kept (a number never wraps), for giveUp.
      const values = column.numeric ? Math.max(0, ...measuredWidths)
        : p90 > config.compactMaxProtectedWidth ? config.compactMaxProtectedWidth : protectedWidth;
      const header = clamp(readable(Math.max(headerWord, values)), hardMinWidth, preferredWidth);
      if (headerWidth > values && header < softMinWidth - 0.5) headerFloors.set(layout, header);
    }
    return layout;
  });
  // A short text column beside columns of prose (卷数 beside 看点) is as narrow as its words, not
  // its whole values: added to a table of prose, it wraps at its punctuation (六十卷、 / 目录一卷)
  // before the prose is pushed past the frame (it shrinks only after the prose has reached its own
  // floor: shrink below), and gives up its longer words to fit (giveUp). Elsewhere one whose values
  // are longer than its protection (a list of figures, +8,214 +19,877 …: it wraps already) gives up
  // its words to fit; a table of short fields alone keeps its values whole.
  const besideProse = layouts.some(column => column.kind === 'narrative');
  const gives = layouts.map(() => ({}) as Partial<Record<Stage, number>>);
  layouts.forEach((column, index) => {
    const words = wordFloors.get(column);
    if (words && besideProse) {
      column.softMinWidth = clamp(Math.min(column.softMinWidth, words.whole), column.hardMinWidth, column.preferredWidth);
      gives[index].words = clamp(Math.min(column.softMinWidth, words.least), column.hardMinWidth, column.preferredWidth);
    } else if (words?.long) {
      gives[index].words = clamp(Math.min(column.softMinWidth, words.whole), column.hardMinWidth, column.preferredWidth);
    }
    if (headerFloors.has(column)) gives[index].headers = headerFloors.get(column);
    if (identifierFloors.has(column)) gives[index].identifiers = identifierFloors.get(column);
  });
  // Scrolling is available: do not trade readability for fitting the viewport.
  const target = config.totalWidth - columns.length * config.columnOverhead;
  const stages: Stage[] = config.keepLongWords ? ['words', 'headers'] : ['words', 'headers', 'identifiers'];
  const floors = giveUp(layouts.map(column => column.softMinWidth), gives, target, stages);
  layouts.forEach((column, index) => leastWidths.set(column, Math.min(column.softMinWidth, ...Object.values(gives[index]))));
  layouts.forEach((column, index) => { column.softMinWidth = floors[index]; });
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
  // A table that scrolls anyway (wider than its room with everything given up, so it gave up nothing):
  // a column that would give up its words to fit (a list of figures) is still made as narrow as its
  // words where that makes no row taller than another of its cells makes it (its figures one to a line
  // beside a cell of four dataset names), so the table scrolls no further than it must. A row's height
  // is read as the fewest lines its other cells can take (fewestLines), the list's own as it fills its
  // lines (linesOf), so the estimate errs toward keeping the list wider.
  if (readableWidth > target + 0.5) narrowFree();
  const sum = total(layouts);
  layouts.forEach(column => { column.ratio = column.width / sum; });
  return layouts;

  function narrowFree() {
    const padding = config.cellPadding;
    const space = measure(' ');
    const count = Math.max(0, ...[...rows.values()].map(row => row.texts.length));
    const tallest = (except: ColumnLayout, row: number | null) => Math.max(0, ...layouts.filter(column => column !== except).map(column => {
      const cells = rows.get(column)!;
      const [text, width] = row === null ? [cells.header, cells.headerWidth] : [cells.texts[row] ?? '', cells.widths[row] ?? 0];
      return fewestLines(text, width - padding, column.width - padding, space);
    }));
    layouts.forEach((column, index) => {
      const least = gives[index].words;
      if (least === undefined || !wordFloors.get(column)?.long || least >= column.width - 0.5) return;
      const cells = rows.get(column)!;
      // Each cell as wide as the adapter measured it (inline marks, its own font), its pieces scaled to that.
      const scaleOf = (text: string, width: number) => clamp((width - padding) / Math.max(1, measure(text)), 0.8, 1.5);
      // Each row's height without this column (the other columns keep their widths meanwhile), the header row's first.
      const own = [cells.header, ...Array.from({length: count}, (_, row) => cells.texts[row] ?? '')];
      const scales = own.map((text, row) => scaleOf(text, row ? cells.widths[row - 1] : cells.headerWidth));
      const limits = own.map((text, row) => text.trim() ? Math.max(1, tallest(column, row ? row - 1 : null)) : 0);
      const fits = (width: number) => own.every((text, row) => !text.trim() || linesOf(text, width - padding - 1, WORD_BREAKS, measure, scales[row]) <= limits[row]);
      if (!fits(least)) {
        let low = least, high = column.width;
        if (!fits(high)) return;
        for (let step = 0; step < 24; step++) {
          const middle = (low + high) / 2;
          if (fits(middle)) high = middle;
          else low = middle;
        }
        column.width = column.softMinWidth = high;
      } else column.width = column.softMinWidth = least;
    });
  }
}
