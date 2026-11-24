import { uid, uniqueName } from './data/values.js';
import { w } from './words.js';
export const layoutLabel = (l) => ({ table: w('表格'), board: w('看板'), list: w('列表'), gallery: w('卡片'), calendar: w('日历'), chart: w('图表') })[l];
export const LAYOUTS = ['table', 'board', 'list', 'gallery', 'calendar', 'chart'];
export const viewName = (v) => v.name || layoutLabel(v.layout);
export const defaultOpen = (l) => (l === 'gallery' || l === 'calendar' || l === 'chart' ? 'center' : 'side');
/** A view of nothing filtered, sorted or grouped. */
export const baseView = (layout) => ({
  layout, hidden: [], filters: [], sorts: [], groupBy: null, calc: {},
});
const CARDLIKE = ['board', 'list', 'gallery', 'calendar'];
/**
 * What a view takes as its layout changes, in the same step: a board with no select column makes one
 * (状态, Status), a calendar with no date column makes one, and a layout of cards shows its first
 * few columns alone.
 */
export function applyLayout(d, viewId, layout) {
  let props = d.props;
  const v = d.views.find(x => x.id === viewId);
  const patch = { layout };
  if (layout === 'board' && !(v.boardBy && props.some(p => p.id === v.boardBy))) {
    let sel = props.find(p => p.type === 'select');
    if (!sel) {
      sel = { id: uid('p'), name: uniqueName(props, w('状态')), type: 'select', width: 120, options: [{ id: uid('o'), name: w('待开始'), color: 'gray' }, { id: uid('o'), name: w('进行中'), color: 'blue' }, { id: uid('o'), name: w('已完成'), color: 'green', done: true }] };
      props = [...props, sel];
    }
    patch.boardBy = sel.id;
  }
  if (layout === 'calendar' && !(v.dateBy && props.some(p => p.id === v.dateBy))) {
    let date = props.find(p => p.type === 'date');
    if (!date) {
      date = { id: uid('p'), name: uniqueName(props, w('日期')), type: 'date', width: 120 };
      props = [...props, date];
    }
    patch.dateBy = date.id;
  }
  if (layout === 'chart' && !v.chart) {
    const x = props.find(p => p.type === 'select') || props.find(p => p.type === 'multi') || props.find(p => p.type === 'checkbox');
    patch.chart = { kind: 'column', x: x?.id || null, agg: 'count', y: null };
  }
  if (CARDLIKE.includes(layout) && !CARDLIKE.includes(v.layout)) {
    const shown = props.filter(p => p.type !== 'title' && !p.notes && !v.hidden.includes(p.id) && p.id !== patch.boardBy && p.id !== v.boardBy);
    const keep = new Set(shown.filter(p => p.type !== 'formula' && p.type !== 'url' && p.type !== 'text').slice(0, layout === 'calendar' ? 0 : 3).map(p => p.id));
    patch.hidden = props.filter(p => p.type !== 'title' && !keep.has(p.id)).map(p => p.id);
  }
  if (!v.name || v.name === layoutLabel(v.layout))
    patch.name = '';
  if (v.open === defaultOpen(v.layout))
    patch.open = undefined;
  return { ...d, props, views: d.views.map(x => (x.id === viewId ? { ...x, ...patch } : x)) };
}
export function createView(d, layout) {
  const id = uid('v');
  const same = d.views.filter(v => v.layout === layout).length;
  const v = { ...baseView('table'), id, name: same ? `${layoutLabel(layout)} ${same + 1}` : '' };
  const doc = applyLayout({ ...d, views: [...d.views, v] }, id, layout);
  return { doc, id };
}
export const groupableForBoard = (props) => props.filter(p => p.type === 'select' || p.type === 'checkbox');
