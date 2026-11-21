/* 外部 HTML 粘贴对照用的紧凑写法：一块一行（类型[属性] "富文本"），子块缩进两格，表格每行 |格|格|；
 * 富文本里带注解的段写成 {文字|注解,…}（a / h / e 带值）。每个样例一段：
 *   ## 名字 rich=… table=… office=…
 *   inline: "取成一段富文本的结果"
 *   块……
 * formatSpec 写粘贴转换出的块规格（属性在 props 里）。tests/unit/paste.mjs 比的是这一段的 FNV 哈希，
 * 和 ./html-corpus.mjs 里的 reference 字段对照。
 */
const annText = a => (['a', 'h', 'e'].includes(a[0]) ? a[0] + ':' + a[1] : a[0]);
export const formatRich = t => (t || []).map(([s, a]) => (a?.length ? `{${s}|${a.map(annText).sort().join(',')}}` : s)).join('');

const FORMAT_KEYS = ['block_width', 'block_height', 'block_color', 'toggleable', 'code_wrap'];

export function formatSpec(b, depth = 0) {
  const pad = '  '.repeat(depth), p = [], f = b.props || {};
  if (f.checked) p.push('checked');
  if (f.language) p.push('lang=' + f.language);
  if (f.source) p.push('src=' + f.source);
  if (f.caption) p.push('cap=' + formatRich(f.caption));
  for (const k of FORMAT_KEYS) if (f[k] !== undefined && f[k] !== false) p.push(k + '=' + f[k]);
  if (f.icon) p.push('page_icon=' + f.icon);
  if (f.table_block_column_header) p.push('hrow');
  if (f.table_block_row_header) p.push('hcol');
  const noTitle = ['divider', 'image', 'table', 'embed', 'column_list', 'column', 'tab', 'file'].includes(b.type) && !b.title?.length;
  const line = pad + b.type + (p.length ? '[' + p.join(' ') + ']' : '') + (noTitle ? '' : ' ' + JSON.stringify(formatRich(b.title)));
  if (b.type === 'table') return [line, ...(b.children || []).map(r => pad + '  |' + (f.table_block_column_order || []).map(c => formatRich(r.props.cells?.[c])).join('|') + '|')].join('\n');
  return [line, ...(b.children || []).map(c => formatSpec(c, depth + 1))].join('\n');
}

/* 一个样例的整段 */
export const formatCase = ({ name, rich, isTable, office, inline, blocks }, fmt) =>
  `## ${name} rich=${rich} table=${isTable} office=${office}\ninline: ${JSON.stringify(formatRich(inline))}\n${blocks.map(b => fmt(b)).join('\n')}`;

export function fnv(s) {
  let x = 2166136261;
  for (const c of s) { x ^= c.codePointAt(0); x = Math.imul(x, 16777619) >>> 0; }
  return x.toString(16);
}
