// A small formula language: {column id} references a value of the same record, the four operations,
// comparisons, & to join words, and a few functions. A formula is worked out where it shows; the
// file holds the formula alone.
import { realDay } from '../../../../shared/database.mjs';
import { w } from '../words.js';
export class FormulaError extends Error {
}
function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j]))
        j++;
      out.push({ t: 'num', v: parseFloat(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (c === '"' || c === '“' || c === '”') {
      let j = i + 1;
      while (j < src.length && !['"', '“', '”'].includes(src[j]))
        j++;
      if (j >= src.length)
        throw new FormulaError(w('字符串缺少结束引号'));
      out.push({ t: 'str', v: src.slice(i + 1, j) });
      i = j + 1;
      continue;
    }
    if (c === '{') {
      const j = src.indexOf('}', i);
      if (j < 0)
        throw new FormulaError(w('列引用缺少 }'));
      out.push({ t: 'ref', v: src.slice(i + 1, j).trim() });
      i = j + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z_0-9]/.test(src[j]))
        j++;
      out.push({ t: 'id', v: src.slice(i, j).toUpperCase() });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '!=', '<>', '=='].includes(two)) {
      out.push({ t: 'op', v: two === '<>' ? '!=' : two === '==' ? '=' : two });
      i += 2;
      continue;
    }
    if ('+-*/()<>=,&，'.includes(c)) {
      out.push({ t: 'op', v: c === '，' ? ',' : c });
      i++;
      continue;
    }
    throw new FormulaError(w('无法识别的字符：{0}', c));
  }
  out.push({ t: 'end', v: null });
  return out;
}
export function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v) => peek().t === 'op' && peek().v === v;
  const expect = (v) => { if (!isOp(v))
    throw new FormulaError(w('缺少 {0}', v)); p++; };
  function cmp() {
    let a = add();
    while (peek().t === 'op' && ['<', '>', '<=', '>=', '=', '!='].includes(peek().v)) {
      const op = toks[p++].v;
      a = { k: 'bin', op, a, b: add() };
    }
    return a;
  }
  function add() {
    let a = mul();
    while (peek().t === 'op' && ['+', '-', '&'].includes(peek().v)) {
      const op = toks[p++].v;
      a = { k: 'bin', op, a, b: mul() };
    }
    return a;
  }
  function mul() {
    let a = un();
    while (peek().t === 'op' && ['*', '/'].includes(peek().v)) {
      const op = toks[p++].v;
      a = { k: 'bin', op, a, b: un() };
    }
    return a;
  }
  function un() {
    if (isOp('-')) {
      p++;
      return { k: 'un', op: '-', a: un() };
    }
    return prim();
  }
  function prim() {
    const t = toks[p++];
    if (t.t === 'num' || t.t === 'str')
      return { k: 'lit', v: t.v };
    if (t.t === 'ref')
      return { k: 'ref', id: t.v };
    if (t.t === 'id') {
      if (t.v === 'TRUE')
        return { k: 'lit', v: true };
      if (t.v === 'FALSE')
        return { k: 'lit', v: false };
      expect('(');
      const args = [];
      if (!isOp(')')) {
        args.push(cmp());
        while (isOp(',')) {
          p++;
          args.push(cmp());
        }
      }
      expect(')');
      if (!FUNCS[t.v])
        throw new FormulaError(w('未知函数：{0}', t.v));
      return { k: 'call', fn: t.v, args };
    }
    if (t.t === 'op' && t.v === '(') {
      const e = cmp();
      expect(')');
      return e;
    }
    throw new FormulaError(w('表达式不完整'));
  }
  const n = cmp();
  if (peek().t !== 'end')
    throw new FormulaError(w('多余的内容'));
  return n;
}
const num = (v) => {
  if (v === null || v === undefined || v === '')
    return 0;
  if (typeof v === 'boolean')
    return v ? 1 : 0;
  if (Array.isArray(v))
    return v.length;
  const n = Number(v);
  if (isNaN(n))
    throw new FormulaError(w('不是数字：{0}', v));
  return n;
};
const str = (v) => (v === null || v === undefined ? '' : Array.isArray(v) ? v.join(', ') : typeof v === 'number' ? String(Math.round(v * 1e6) / 1e6) : String(v));
const dayMs = (v) => {
  if (!v)
    return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  // A day of the calendar alone: 2026-02-30 is none (not the day after 02-28 it would roll over to).
  if (!m || !realDay(+m[1], +m[2], +m[3]))
    return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
};
/** Today on the reader's clock, as a file writes a date. */
export const todayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
/** The functions a formula may call: how each is written and what it does (in Chinese: w() says them), and what it does. */
export const FUNCS = {
  IF: { sig: 'IF(条件, 是, 否)', desc: '条件成立取第二个值，否则取第三个', fn: a => (a[0] ? a[1] : a[2] ?? null) },
  ROUND: { sig: 'ROUND(数字, 位数)', desc: '四舍五入', fn: a => { const f = Math.pow(10, num(a[1] ?? 0)); return Math.round(num(a[0]) * f) / f; } },
  ABS: { sig: 'ABS(数字)', desc: '绝对值', fn: a => Math.abs(num(a[0])) },
  MIN: { sig: 'MIN(a, b, …)', desc: '最小值', fn: a => Math.min(...a.map(num)) },
  MAX: { sig: 'MAX(a, b, …)', desc: '最大值', fn: a => Math.max(...a.map(num)) },
  SUM: { sig: 'SUM(a, b, …)', desc: '求和', fn: a => a.reduce((s, x) => s + num(x), 0) },
  CONCAT: { sig: 'CONCAT(a, b, …)', desc: '拼接文字', fn: a => a.map(str).join('') },
  LEN: { sig: 'LEN(文本)', desc: '文字长度；多选为个数', fn: a => (Array.isArray(a[0]) ? a[0].length : str(a[0]).length) },
  TODAY: { sig: 'TODAY()', desc: '今天的日期', fn: () => todayStr() },
  DAYS: { sig: 'DAYS(结束, 开始)', desc: '两个日期相差的天数', fn: a => { const x = dayMs(a[0]), y = dayMs(a[1]); return x === null || y === null ? null : Math.round((x - y) / 86400000); } },
  AND: { sig: 'AND(a, b, …)', desc: '全部成立', fn: a => a.every(Boolean) },
  OR: { sig: 'OR(a, b, …)', desc: '任一成立', fn: a => a.some(Boolean) },
  NOT: { sig: 'NOT(a)', desc: '取反', fn: a => !a[0] },
};
export function evaluate(node, ref) {
  switch (node.k) {
    case 'lit': return node.v;
    case 'ref': return ref(node.id);
    case 'un': return -num(evaluate(node.a, ref));
    case 'call': return FUNCS[node.fn].fn(node.args.map(a => evaluate(a, ref)));
    case 'bin': {
      const a = evaluate(node.a, ref), b = evaluate(node.b, ref);
      switch (node.op) {
        case '+': return typeof a === 'string' && isNaN(Number(a)) || typeof b === 'string' && isNaN(Number(b)) ? str(a) + str(b) : num(a) + num(b);
        case '&': return str(a) + str(b);
        case '-': return num(a) - num(b);
        case '*': return num(a) * num(b);
        case '/': {
          const d = num(b);
          if (d === 0)
            throw new FormulaError(w('除以 0'));
          return num(a) / d;
        }
        case '=': return str(a) === str(b);
        case '!=': return str(a) !== str(b);
        default: {
          const both = typeof a === 'number' || typeof b === 'number';
          const x = both ? num(a) : str(a), y = both ? num(b) : str(b);
          return node.op === '<' ? x < y : node.op === '>' ? x > y : node.op === '<=' ? x <= y : x >= y;
        }
      }
    }
  }
}
// A formula's parse, once for each text (and language: a failure says its words in it).
const cache = new Map();
export function compile(expr) {
  let c = cache.get(expr);
  if (!c) {
    try {
      c = parse(expr);
    }
    catch (e) {
      c = e instanceof FormulaError ? e : new FormulaError(String(e?.message || e));
    }
    cache.set(expr, c);
  }
  return c;
}
