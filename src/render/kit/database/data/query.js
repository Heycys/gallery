// A view's records: filtered, searched, sorted, grouped, counted.
import { isDate } from '../../../../shared/database.mjs';
import { w } from '../words.js';
import { todayStr } from './formula.js';
import { addDays, displayText, formatNumber, friendlyDate, getValue, isEmpty, optionOf } from './values.js';
const emptyOps = () => [{ op: 'empty', label: w('为空'), chip: w('为空') }, { op: 'nempty', label: w('不为空'), chip: w('不为空') }];
const textOps = () => [
  { op: 'contains', label: w('包含'), chip: w('包含'), needs: 'text' },
  { op: 'ncontains', label: w('不包含'), chip: w('不包含'), needs: 'text' },
  { op: 'eq', label: w('是'), chip: '', needs: 'text' },
  ...emptyOps(),
];
/** The conditions a filter of each type of column takes, in the page's words. */
export const opsOf = (type) => {
  switch (type) {
    case 'title':
    case 'text':
    case 'url': return textOps();
    case 'number': return [
      { op: 'eq', label: '=', needs: 'number' }, { op: 'ne', label: '≠', needs: 'number' },
      { op: 'gt', label: '>', needs: 'number' }, { op: 'lt', label: '<', needs: 'number' },
      { op: 'gte', label: '≥', needs: 'number' }, { op: 'lte', label: '≤', needs: 'number' },
      ...emptyOps(),
    ];
    case 'select': return [{ op: 'is', label: w('是'), chip: '', needs: 'option' }, { op: 'isnot', label: w('不是'), chip: w('不是'), needs: 'option' }, ...emptyOps()];
    case 'multi': return [{ op: 'has', label: w('包含'), chip: '', needs: 'option' }, { op: 'nhas', label: w('不包含'), chip: w('不包含'), needs: 'option' }, ...emptyOps()];
    case 'date': return [
      { op: 'on', label: w('是'), chip: '', needs: 'date' }, { op: 'before', label: w('早于'), chip: w('早于'), needs: 'date' },
      { op: 'after', label: w('晚于'), chip: w('晚于'), needs: 'date' }, { op: 'onbefore', label: w('当日或之前'), chip: w('不晚于'), needs: 'date' },
      { op: 'onafter', label: w('当日或之后'), chip: w('不早于'), needs: 'date' }, ...emptyOps(),
    ];
    case 'checkbox': return [{ op: 'is', label: w('是'), chip: '', needs: 'bool' }];
    case 'formula': return [
      { op: 'contains', label: w('包含'), chip: w('包含'), needs: 'text' }, { op: 'gt', label: '>', needs: 'number' }, { op: 'lt', label: '<', needs: 'number' }, ...emptyOps(),
    ];
  }
};
/** The "none" button of a row of option buttons. */
export const NONE = '__none';
export const opDef = (p, op) => opsOf(p.type).find(o => o.op === op);
export const relativeDates = () => [
  { id: 'today', label: w('今天'), offset: 0 },
  { id: 'tomorrow', label: w('明天'), offset: 1 },
  { id: 'yesterday', label: w('昨天'), offset: -1 },
  { id: 'nextweek', label: w('一周后'), offset: 7 },
  { id: 'lastweek', label: w('一周前'), offset: -7 },
];
const RELATIVE = { today: 0, tomorrow: 1, yesterday: -1, nextweek: 7, lastweek: -7 };
export const isRelative = (v) => typeof v === 'string' && v in RELATIVE;
export const resolveDate = (v) => {
  if (!v)
    return null;
  return isRelative(v) ? addDays(todayStr(), RELATIVE[v]) : String(v);
};
export const dateValueLabel = (v) => relativeDates().find(r => r.id === v)?.label ?? (v ? friendlyDate(String(v)) : '');
export function newFilter(p, id) {
  const op = opsOf(p.type)[0].op;
  return { id, prop: p.id, op, value: p.type === 'checkbox' ? true : p.type === 'select' || p.type === 'multi' ? [] : undefined };
}
/** Whether a filter filters (one with no value yet filters nothing). */
export function isActive(f, p) {
  if (!p)
    return false;
  const d = opDef(p, f.op);
  if (!d)
    return false;
  if (!d.needs)
    return true;
  const v = f.value;
  return !(v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0));
}
const noneOf = (p) => w('无{0}', p.name);
export function chipParts(f, p) {
  const d = opDef(p, f.op);
  const opText = d?.chip ?? d?.label ?? '';
  let value = '';
  if (d?.needs === 'option')
    value = (f.value || []).map((id) => (id === NONE ? noneOf(p) : optionOf(p, id)?.name ?? '')).filter(Boolean).join(w('、'));
  else if (d?.needs === 'bool')
    value = f.value ? w('已勾选') : w('未勾选');
  else if (d?.needs === 'date')
    value = dateValueLabel(f.value);
  else if (d?.needs === 'number')
    value = f.value === undefined || f.value === '' ? '' : String(f.value) + (p.numberFormat?.format === 'percent' ? '%' : '');
  else if (d?.needs)
    value = f.value ?? '';
  return { name: p.name, op: opText, value };
}
export function matchFilter(row, f, byId) {
  const p = byId[f.prop];
  if (!p || !isActive(f, p))
    return true;
  const v = getValue(row, p, byId);
  const fv = f.value;
  const list = (x) => (Array.isArray(x) ? x : []);
  switch (f.op) {
    case 'empty': return isEmpty(v) || (p.type === 'checkbox' && v === false);
    case 'nempty': return !isEmpty(v) && !(p.type === 'checkbox' && v === false);
    case 'contains': return displayText(v, p).toLowerCase().includes(String(fv).toLowerCase());
    case 'ncontains': return !displayText(v, p).toLowerCase().includes(String(fv).toLowerCase());
    case 'is':
      if (p.type === 'checkbox')
        return (v === true) === !!fv;
      return list(fv).includes(v) || (isEmpty(v) && list(fv).includes(NONE));
    case 'isnot': return !list(fv).includes(v);
    case 'has': {
      const arr = Array.isArray(v) ? v : [];
      return list(fv).some(x => arr.includes(x)) || (!arr.length && list(fv).includes(NONE));
    }
    case 'nhas': {
      const arr = Array.isArray(v) ? v : [];
      return !list(fv).some(x => arr.includes(x));
    }
    case 'on':
    case 'before':
    case 'after':
    case 'onbefore':
    case 'onafter': {
      const d = resolveDate(fv);
      // A day of the calendar alone (2026-02-30, words kept as written, is none).
      if (!isDate(v) || !d)
        return false;
      return f.op === 'on' ? v === d : f.op === 'before' ? v < d : f.op === 'after' ? v > d : f.op === 'onbefore' ? v <= d : v >= d;
    }
    default: {
      if (p.type === 'text' || p.type === 'title' || p.type === 'url')
        return displayText(v, p) === String(fv);
      if (typeof v !== 'number')
        return false;
      let n = Number(fv);
      if (isNaN(n))
        return true;
      if (p.numberFormat?.format === 'percent')
        n = n / 100;
      const eps = 1e-9;
      switch (f.op) {
        case 'eq': return Math.abs(v - n) < eps;
        case 'ne': return Math.abs(v - n) >= eps;
        case 'gt': return v > n;
        case 'gte': return v >= n - eps;
        case 'lt': return v < n;
        case 'lte': return v <= n + eps;
      }
      return true;
    }
  }
}
// ---------- sorted (what is empty always last) ----------
function sortKey(v, p) {
  if (isEmpty(v))
    return null;
  if (p.type === 'select') {
    const i = (p.options || []).findIndex(o => o.id === v);
    return i < 0 ? 999 : i;
  }
  if (p.type === 'multi') {
    const i = (p.options || []).findIndex(o => o.id === v[0]);
    return i < 0 ? 999 : i;
  }
  if (p.type === 'checkbox')
    return v === true ? 1 : 0;
  return v;
}
export function compareRows(a, b, rules, byId) {
  for (const r of rules) {
    const p = byId[r.prop];
    if (!p)
      continue;
    const x = sortKey(getValue(a, p, byId), p), y = sortKey(getValue(b, p, byId), p);
    if (x === y)
      continue;
    if (x === null)
      return 1;
    if (y === null)
      return -1;
    const c = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y), 'zh-CN', { numeric: true });
    if (c !== 0)
      return r.dir === 'asc' ? c : -c;
  }
  return 0;
}
export function matchSearch(row, q, props, byId) {
  if (!q)
    return true;
  const s = q.toLowerCase();
  return props.some(p => displayText(getValue(row, p, byId), p).toLowerCase().includes(s));
}
export function applyView(rows, props, view, search, skipFilter) {
  const byId = Object.fromEntries(props.map(c => [c.id, c]));
  let out = rows.filter(r => view.filters.every(f => f.id === skipFilter || matchFilter(r, f, byId)) && matchSearch(r, search, props, byId));
  if (view.sorts.length)
    out = [...out].sort((a, b) => compareRows(a, b, view.sorts, byId));
  return out;
}
export function groupKeys(row, p, byId) {
  const v = getValue(row, p, byId);
  if (p.type === 'checkbox')
    return [v === true ? 'yes' : 'no'];
  if (isEmpty(v))
    return [''];
  if (p.type === 'multi')
    return v;
  if (p.type === 'select')
    return [String(v)];
  return [displayText(v, p)];
}
export const canGroupBy = (p) => ['select', 'multi', 'checkbox', 'date', 'text', 'number'].includes(p.type);
export function groupRows(rows, p, byId, keepEmpty = false) {
  const map = new Map();
  const labels = new Map();
  if (p.type === 'select' || p.type === 'multi')
    for (const o of p.options || []) {
      map.set(o.id, []);
      labels.set(o.id, o.name);
    }
  if (p.type === 'checkbox') {
    map.set('yes', []);
    map.set('no', []);
    labels.set('yes', w('已勾选'));
    labels.set('no', w('未勾选'));
  }
  for (const r of rows)
    for (const k of groupKeys(r, p, byId)) {
      if (!map.has(k))
        map.set(k, []);
      map.get(k).push(r);
    }
  let out = [...map.entries()].map(([key, rs]) => ({ key, label: key === '' ? noneOf(p) : p.type === 'date' ? friendlyDate(key) : labels.get(key) ?? key, rows: rs }));
  if (!keepEmpty)
    out = out.filter(g => g.rows.length > 0);
  const fixed = p.type === 'select' || p.type === 'multi' || p.type === 'checkbox';
  out.sort((a, b) => (a.key === '' ? 1 : b.key === '' ? -1 : fixed ? 0 : a.key.localeCompare(b.key, 'zh-CN', { numeric: true })));
  return out;
}
// ---------- counted (a column's foot) ----------
export const calcLabel = (kind) => ({
  none: w('不计算'), count: w('计数'), filled: w('已填写'), empty: w('未填写'), unique: w('不同值'), pctFilled: w('填写率'),
  sum: w('求和'), avg: w('平均值'), min: w('最小值'), max: w('最大值'), range: w('范围'),
  checked: w('已勾选'), unchecked: w('未勾选'), pctChecked: w('勾选率'), earliest: w('最早'), latest: w('最晚'),
}[kind] ?? kind);
export function calcKinds(p) {
  const base = ['count', 'filled', 'empty', 'unique', 'pctFilled'];
  if (p.type === 'number' || p.type === 'formula')
    return [['none'], ['count', 'filled', 'empty'], ['sum', 'avg', 'min', 'max', 'range']];
  if (p.type === 'checkbox')
    return [['none'], ['count', 'checked', 'unchecked', 'pctChecked']];
  if (p.type === 'date')
    return [['none'], base, ['earliest', 'latest']];
  return [['none'], base];
}
export function calc(rows, p, kind, byId) {
  if (!kind || kind === 'none')
    return '';
  const vals = rows.map(r => getValue(r, p, byId));
  const nums = vals.filter(v => typeof v === 'number');
  const fmt = (n, extra = 0) => (p.type === 'number' ? formatNumber(n, p.numberFormat, extra) : String(Math.round(n * 100) / 100));
  const pct = (a) => (rows.length ? Math.round((a / rows.length) * 100) + '%' : '–');
  const dates = vals.filter(isDate).sort();
  switch (kind) {
    case 'count': return String(rows.length);
    case 'filled': return String(vals.filter(v => !isEmpty(v)).length);
    case 'empty': return String(vals.filter(v => isEmpty(v)).length);
    case 'pctFilled': return pct(vals.filter(v => !isEmpty(v)).length);
    case 'unique': return String(new Set(vals.filter(v => !isEmpty(v)).map(v => displayText(v, p))).size);
    case 'sum': return nums.length ? fmt(nums.reduce((a, b) => a + b, 0)) : '–';
    case 'avg': return nums.length ? fmt(nums.reduce((a, b) => a + b, 0) / nums.length, p.numberFormat?.format === 'percent' ? 0 : 1) : '–';
    case 'min': return nums.length ? fmt(Math.min(...nums)) : '–';
    case 'max': return nums.length ? fmt(Math.max(...nums)) : '–';
    case 'range': return nums.length ? fmt(Math.max(...nums) - Math.min(...nums)) : '–';
    case 'checked': return String(vals.filter(v => v === true).length);
    case 'unchecked': return String(vals.filter(v => v !== true).length);
    case 'pctChecked': return pct(vals.filter(v => v === true).length);
    case 'earliest': return dates.length ? friendlyDate(dates[0]) : '–';
    case 'latest': return dates.length ? friendlyDate(dates[dates.length - 1]) : '–';
  }
  return '';
}
// ---------- CSV, and what is pasted ----------
/**
 * The CSV of `rows`, the columns `props` (those a view shows), each formula worked out of every column
 * there is (`all`: a hidden one too). A field a spreadsheet would take for a formula (=, +, -, @, a tab or
 * a carriage return first) starts with ' there, so that it is words, but a number as it shows (-5, -12%).
 */
export function toCSV(rows, props, all = props) {
  const byId = Object.fromEntries([...all, ...props].map(c => [c.id, c]));
  const words = (s) => (/^[=+\-@\t\r]/.test(s) && !/^[-+]?[\d,]*\.?\d+(?:e[-+]?\d+)?%?$/i.test(s) ? "'" + s : s);
  const esc = (s) => { const t = words(s); return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
  const lines = [props.map(c => esc(c.name)).join(',')];
  for (const r of rows)
    lines.push(props.map(c => esc(displayText(getValue(r, c, byId), c))).join(','));
  return '﻿' + lines.join('\n');
}
export function parseTSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      }
      else if (c === '"')
        q = false;
      else
        cell += c;
    }
    else if (c === '"' && cell === '')
      q = true;
    else if (c === '\t') {
      row.push(cell);
      cell = '';
    }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n')
        i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    }
    else
      cell += c;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}
/** A record made in a filtered view takes what the filters say it has, so that it does not vanish as it is made. */
export function defaultsFromFilters(filters, byId) {
  const out = {};
  for (const f of filters) {
    const p = byId[f.prop];
    if (!p || !isActive(f, p))
      continue;
    if (f.op === 'is' && p.type === 'select' && f.value.length === 1 && f.value[0] !== NONE)
      out[p.id] = f.value[0];
    if (f.op === 'is' && p.type === 'checkbox')
      out[p.id] = !!f.value;
    if (f.op === 'has' && f.value.length && f.value[0] !== NONE)
      out[p.id] = [f.value[0]];
    if (f.op === 'on')
      out[p.id] = resolveDate(f.value);
    if (f.op === 'eq' && p.type === 'number')
      out[p.id] = p.numberFormat?.format === 'percent' ? Number(f.value) / 100 : Number(f.value);
  }
  return out;
}
