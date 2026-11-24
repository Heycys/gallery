// Values: read (a formula's worked out), shown, parsed from what a reader types, and carried over
// when a column changes its type.
import { cellValue, isDate, nextColor as nextColorOf, numberOf, numberText, optionName, optionNames, realDay, safeAddress } from '../../../../shared/database.mjs';
import { language, w } from '../words.js';
import { compile, evaluate, FormulaError, todayStr } from './formula.js';
export const uid = (p = 'id') => p + Math.random().toString(36).slice(2, 9);
export const typeLabel = (t) => ({
  title: w('标题'), text: w('文本'), number: w('数字'), select: w('单选'), multi: w('多选'), date: w('日期'), checkbox: w('复选框'), url: w('网址'), formula: w('公式'),
})[t];
export const TYPE_ORDER = ['text', 'number', 'select', 'multi', 'date', 'checkbox', 'url', 'formula'];
export const COLORS = ['default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red'];
export const colorLabel = (c) => ({
  default: w('默认'), gray: w('灰色'), brown: w('棕色'), orange: w('橙色'), yellow: w('黄色'), green: w('绿色'), blue: w('蓝色'), purple: w('紫色'), pink: w('粉色'), red: w('红色'),
})[c];
/** A new option's color: one the column's options do not have yet. */
export const nextColor = (p, extra = []) => nextColorOf(p, extra);
export const optionOf = (p, id) => p.options?.find(o => o.id === id);
/** The record's title: its title column's words. */
export const titleProp = (props) => props.find(p => p.type === 'title');
export const titleOf = (row, props) => { const p = titleProp(props); return p ? String(row.values[p.id] ?? '') : ''; };
export function isEmpty(v) {
  return v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && 'error' in v);
}
export const isError = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && 'error' in v;
// ---------- a value, a formula's worked out ----------
export function getValue(row, p, byId, depth = 0) {
  if (p.type !== 'formula')
    return row.values[p.id] ?? null;
  if (depth > 8)
    return { error: w('循环引用') };
  if (!(p.formula || '').trim())
    return null; // no formula written yet: empty, no failure
  const node = compile(p.formula || '');
  if (node instanceof FormulaError)
    return { error: node.message };
  try {
    const v = evaluate(node, id => {
      const c = byId[id];
      if (!c)
        throw new FormulaError(w('找不到属性：{0}', id));
      const r = getValue(row, c, byId, depth + 1);
      if (isError(r))
        throw new FormulaError(r.error);
      if (c.type === 'select')
        return optionOf(c, r)?.name ?? (typeof r === 'string' ? r : '');
      if (c.type === 'multi')
        return (Array.isArray(r) ? r : []).map((x) => optionOf(c, x)?.name ?? x);
      return r;
    });
    if (typeof v === 'number' && !isFinite(v))
      return { error: w('结果无效') };
    return v;
  }
  catch (e) {
    return { error: e.message || w('公式错误') };
  }
}
// A formula refers to columns by id in the file and by name where the reader edits it.
export const exprToNames = (expr, props) => expr.replace(/\{([^}]+)\}/g, (m, id) => { const c = props.find(c => c.id === id); return c ? `{${c.name}}` : m; });
export const exprToIds = (expr, props) => expr.replace(/\{([^}]+)\}/g, (m, name) => { const c = props.find(c => c.name === name.trim()) || props.find(c => c.id === name.trim()); return c ? `{${c.id}}` : m; });
// ---------- shown ----------
export const numberFormats = () => [
  { id: 'number', label: w('数字'), sample: '1234.5' },
  { id: 'thousands', label: w('千分位'), sample: '1,234.5' },
  { id: 'percent', label: w('百分比'), sample: '12%' },
  { id: 'cny', label: w('人民币'), sample: '¥1,234.50' },
  { id: 'usd', label: w('美元'), sample: '$1,234.50' },
];
export const defaultNum = () => ({ format: 'number', decimals: null, display: 'number' });
export function formatNumber(v, f = defaultNum(), extraDecimals = 0) {
  const money = f.format === 'cny' || f.format === 'usd';
  let d = f.decimals ?? (money ? 2 : null);
  if (d !== null)
    d = Math.min(6, d + extraDecimals);
  if (f.format === 'percent') {
    const x = v * 100;
    return (d === null ? String(Math.round(x * 100) / 100) : x.toFixed(d)) + '%';
  }
  const opts = d === null ? { maximumFractionDigits: 4 } : { minimumFractionDigits: d, maximumFractionDigits: d };
  const s = v.toLocaleString('en-US', { ...opts, useGrouping: f.format !== 'number' });
  return f.format === 'cny' ? '¥' + s : f.format === 'usd' ? '$' + s : s;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** A month as a calendar's heading says it: 2026年11月, November 2026. */
export const monthTitle = (y, m) => (language() === 'en' ? `${MONTH_NAMES[m]} ${y}` : `${y}年${m + 1}月`);
/** A month's first day as a calendar's cell says it: 11月1日, Nov 1. */
export const monthStart = (m) => (language() === 'en' ? `${MONTHS[m]} 1` : `${m + 1}月1日`);
/** The days of a week, from Monday: short (a date picker's) or as a calendar's heading says them. */
export const weekdays = (short = true) => language() === 'en'
  ? (short ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'] : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'])
  : (short ? ['一', '二', '三', '四', '五', '六', '日'] : ['周一', '周二', '周三', '周四', '周五', '周六', '周日']);
/** A date as the reader reads it: 今天, 明天, 11月25日, 2027年11月25日 (Today, Nov 25, Nov 25, 2027). */
export function friendlyDate(s) {
  const m = isDate(s) ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) : null;
  if (!m)
    return s;
  const diff = dateDiff(s);
  if (diff === 0)
    return w('今天');
  if (diff === 1)
    return w('明天');
  if (diff === -1)
    return w('昨天');
  const t = todayStr();
  const sameYear = m[1] === t.slice(0, 4);
  if (language() === 'en')
    return `${MONTHS[+m[2] - 1]} ${+m[3]}${sameYear ? '' : `, ${m[1]}`}`;
  const md = `${+m[2]}月${+m[3]}日`;
  return sameYear ? md : `${m[1]}年${md}`;
}
export function dateDiff(s) {
  const t = todayStr();
  const m = isDate(s) ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(s) : null;
  if (!m)
    return null;
  return Math.round((Date.UTC(+m[1], +m[2] - 1, +m[3]) - Date.UTC(+t.slice(0, 4), +t.slice(5, 7) - 1, +t.slice(8, 10))) / 86400000);
}
export const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)); };
export function shortUrl(u) {
  return u.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');
}
/** A value as words: for search, a copy, a CSV. */
export function displayText(v, p) {
  if (isEmpty(v))
    return isError(v) ? w('#错误') : '';
  switch (p.type) {
    case 'number': return typeof v === 'number' ? formatNumber(v, p.numberFormat) : String(v);
    case 'select': return optionOf(p, v)?.name ?? String(v);
    case 'multi': return Array.isArray(v) ? v.map(x => optionOf(p, x)?.name ?? x).join(', ') : String(v);
    case 'checkbox': return typeof v === 'string' ? v : v ? w('是') : w('否');
    case 'formula':
      if (typeof v === 'boolean')
        return v ? w('是') : w('否');
      if (typeof v === 'number')
        return String(Math.round(v * 100) / 100);
      return Array.isArray(v) ? v.join(', ') : String(v);
    default: return String(v);
  }
}
/** What an editor of a cell opens with. */
export function editText(v, p) {
  if (v === null || v === undefined)
    return '';
  if (p.type === 'number' && typeof v === 'number')
    return p.numberFormat?.format === 'percent' ? numberText(v, 2) : numberText(v);
  if (p.type === 'select' || p.type === 'multi')
    return displayText(v, p);
  if (p.type === 'checkbox')
    return v === true ? w('是') : typeof v === 'string' ? v : '';
  if (Array.isArray(v))
    return v.join(', ');
  return String(v);
}
// ---------- what a reader types (what reads as nothing of its kind stays as typed: no value changes silently) ----------
const EN_MONTH = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?$/i;
const monthOf = (word) => (EN_MONTH.test(word) ? MONTHS.findIndex(m => m.toLowerCase() === word.slice(0, 3).toLowerCase()) + 1 : 0);
/** A date typed (2026-11-25, 11月25日, Nov 25, 明天…) in the file's form, or null: none, or no day of the calendar (2026-13-45, 2月30日). */
export function normalizeDate(s) {
  const found = readDate(s);
  return found && realDay(+found.slice(0, 4), +found.slice(5, 7), +found.slice(8, 10)) ? found : null;
}
function readDate(s) {
  const t = s.trim();
  const pad = (n) => String(n).padStart(2, '0');
  let m = /^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/.exec(t);
  if (m)
    return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  m = /^(\d{1,2})[-/.月](\d{1,2})日?$/.exec(t);
  if (m)
    return `${todayStr().slice(0, 4)}-${pad(m[1])}-${pad(m[2])}`;
  // Nov 25, Nov 25 2027, Nov 25, 2027, 25 Nov
  m = /^([A-Za-z]+\.?)\s+(\d{1,2})(?:,?\s+(\d{4}))?$/.exec(t);
  if (m && monthOf(m[1]))
    return `${m[3] ?? todayStr().slice(0, 4)}-${pad(monthOf(m[1]))}-${pad(m[2])}`;
  m = /^(\d{1,2})\s+([A-Za-z]+\.?)(?:,?\s+(\d{4}))?$/.exec(t);
  if (m && monthOf(m[2]))
    return `${m[3] ?? todayStr().slice(0, 4)}-${pad(monthOf(m[2]))}-${pad(m[1])}`;
  const word = t.toLowerCase();
  if (t === '今天' || word === 'today')
    return todayStr();
  if (t === '明天' || word === 'tomorrow')
    return addDays(todayStr(), 1);
  if (t === '昨天' || word === 'yesterday')
    return addDays(todayStr(), -1);
  if (t === '后天')
    return addDays(todayStr(), 2);
  return null;
}
/**
 * The option of `options` a name means: the one of that very name, else one of that name in another case
 * (as the file's reading finds it: database.mjs cellValue), or none.
 */
export const optionNamed = (options, name) => options.find(o => o.name === name) ?? options.find(o => o.name.toLowerCase() === name.toLowerCase());
/**
 * The value typed words are, by the file's own reading of a cell where it has one (a number, a box), so
 * that what a reader types reads back as itself: what reads as nothing of its kind stays the words (shown
 * gray), as a file's cell does.
 */
export function parseInput(p, text, pending = []) {
  const t = text.trim();
  if (t === '')
    return { value: p.type === 'checkbox' ? false : p.type === 'multi' ? [] : null };
  switch (p.type) {
    case 'number': {
      // 60 in a percent's column is 60%; 1,234.5, ¥12, 60% read as a file's cell reads them (no 0x10, no Infinity).
      const percent = p.numberFormat?.format === 'percent' || t.endsWith('%');
      const value = numberOf(t.replace(/[¥$￥,，\s]/g, '').replace(/%$/, ''), percent ? 2 : 0);
      return { value: value ?? t };
    }
    // Checked or not as the file reads a box (✓, 是, 1…; empty, 否, 0…), 已 too; any other words kept as they are.
    case 'checkbox': return { value: /^已$/.test(t) ? true : cellValue(t, { type: 'checkbox' }) };
    case 'date': return { value: normalizeDate(t) ?? t };
    case 'select':
    case 'multi': {
      // Several apart as a file's cell parts them (optionNames), so that a name made with a semicolon stays one.
      const parts = p.type === 'multi' ? optionNames(t) : [t];
      const all = [...(p.options || []), ...pending];
      const created = [];
      const ids = parts.map(part => {
        const name = optionName(part);
        const hit = optionNamed([...all, ...created], name);
        if (hit)
          return hit.id;
        const o = { id: uid('o'), name, color: nextColor(p, [...pending, ...created].map(o => o.color)) };
        created.push(o);
        return o.id;
      });
      const value = p.type === 'multi' ? Array.from(new Set(ids)) : ids[0];
      return { value, newOptions: created.length ? created : undefined };
    }
    default: return { value: t };
  }
}
/** A value that reads as nothing of its kind (words in a number's column, a date that is none): kept as the file wrote it, shown gray. */
export function isDirty(v, p) {
  if (v === null || v === undefined || v === '')
    return false;
  if (p.type === 'number')
    return typeof v !== 'number';
  if (p.type === 'date')
    return !isDate(v);
  if (p.type === 'checkbox')
    return typeof v === 'string';
  return false;
}
export function isRowDone(row, props) {
  return props.some(p => p.type === 'select' && p.options?.some(o => o.done && o.id === row.values[p.id]));
}
// ---------- a column's type changed: no value lost ----------
export function convertProp(d, propId, type) {
  const p = d.props.find(c => c.id === propId);
  if (p.type === type || p.type === 'title')
    return d;
  const byId = Object.fromEntries(d.props.map(c => [c.id, c]));
  const next = { ...p, type };
  if (type === 'number')
    next.numberFormat ??= defaultNum();
  if (type === 'formula')
    next.formula ??= '';
  if (type !== 'text')
    delete next.notes;
  // Each value as words, every digit of a number kept (exactText), a single select keeping the first of several.
  const texts = d.rows.map(r => {
    const v = getValue(r, p, byId);
    if (p.type === 'checkbox')
      return v === true ? w('是') : typeof v === 'string' ? v : '';
    if (p.type === 'multi' && type === 'select')
      return Array.isArray(v) ? (optionOf(p, v[0])?.name ?? (v[0] === undefined ? '' : String(v[0]))) : exactText(v, p);
    return exactText(v, p);
  });
  if (type === 'select' || type === 'multi') {
    // An option for every name the words hold, as a file's cell names them (optionNames, optionName): all of
    // them, each name its own (Done and done two), so that no value is left without its option.
    const opts = p.type === 'select' || p.type === 'multi' ? (p.options || []).map(o => ({ ...o, added: undefined })) : [];
    for (const t of texts) {
      for (const name of type === 'multi' ? optionNames(t) : [optionName(t)].filter(Boolean)) {
        if (!opts.some(o => o.name === name))
          opts.push({ id: uid('o'), name, color: nextColor({ ...next, options: opts }) });
      }
    }
    next.options = opts;
  }
  else
    delete next.options;
  if (type !== 'number')
    delete next.numberFormat;
  if (type !== 'formula')
    delete next.formula;
  const rows = type === 'formula' ? d.rows.map(r => { const values = { ...r.values }; delete values[p.id]; return { ...r, values }; }) : d.rows.map((r, i) => {
    const text = texts[i];
    // An option by the very name it was made of; a box read as the file reads one (words that are neither kept as they are).
    const value = type === 'select' || type === 'multi' ? cellValue(text, next, (column, name) => optionNamed(column.options, optionName(name))?.id ?? null) : type === 'checkbox' ? cellValue(text, { type: 'checkbox' }) : parseInput(next, text).value;
    return { ...r, values: { ...r.values, [p.id]: value } };
  });
  return { ...d, props: d.props.map(c => (c.id === propId ? next : c)), rows };
}
/**
 * A value as words that read back as it (a copy, a type changed): as it shows (displayText) where that
 * reads as the same value, else, for a number, every digit it holds (12.3456% where 12% shows).
 */
export function exactText(v, p) {
  const shown = displayText(v, p);
  if (p.type !== 'number' || typeof v !== 'number')
    return shown;
  if (parseInput(p, shown).value === v)
    return shown;
  return p.numberFormat?.format === 'percent' ? `${numberText(v, 2)}%` : numberText(v);
}
/** The address a url value links to, or null where it may be no link's (an address of code: javascript:…): shown as words then. */
export const safeHref = (v) => (typeof v === 'string' && safeAddress(v) ? v : null);
export function uniqueName(props, base) {
  if (!props.some(p => p.name === base))
    return base;
  for (let i = 1;; i++)
    if (!props.some(p => p.name === `${base} ${i}`))
      return `${base} ${i}`;
}
/** A number, a date and a formula have an alignment (the whole column's, its header too; centered by default); others stand at the left. */
export const canAlign = (p) => p.type === 'number' || p.type === 'date' || p.type === 'formula';
export const alignOf = (p) => (canAlign(p) ? p.align || 'center' : 'left');
/** The class of an alignment: none for the left. */
export const alignCls = (p) => { const a = alignOf(p); return a === 'left' ? '' : ' al-' + a; };
