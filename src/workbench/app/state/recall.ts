/**
 * 读者离开一页时在哪里，回来时放回去（docs/workbench.md「Back where the reader left」；用户 2026-11-20：在一篇中间写着字，去另一篇看一眼再点回来，
 * 又回到了开头）。只记在工作台这一页的内存里：读者按 F5、在地址栏或新标签页打开一个地址，工作台重新载入，什么都没有了，页面从开头开始。
 * 键是报告区里页面的键（文档的 slug、自定义页的 @<slug>、别处的底稿的 ~ws-xxxxxx/<slug>），记的是那一页的 view（编辑页的 viewNow：
 * 窗口顶上的元素和它离窗口顶多远、滚动位置、选项卡、打开的详情卡片、光标所在的块和偏移；自定义页的 reading-place.mjs placeIn），
 * 和离开的时刻。离开不到 RECALL_FOR 再回来，回到那里（ReportView 在换上新页面之前就把它放好，光标随焦点回来）；更久了从开头开始。
 * 要去一个地方的打开（带块的地址、搜索的定位、在地址栏里打开）不用记下的：goTo 先说 fresh。
 */

/** 离开一页多久以内回来还回到原处（毫秒）。5 分钟是替用户定的（他问"一分钟还是？"：去别的文档看一眼常常超过一分钟），要改改这里 */
export const RECALL_FOR = 5 * 60 * 1000;

/** 一页的 view：至少有滚动位置，别的照 viewNow / placeIn */
export type LeftView = { x: number; y: number } & Record<string, unknown>;

const lefts = new Map<string, { view: LeftView; at: number }>();
/** 下一次显示的那一页从开头开始（或去它自己的地方），不用记下的：goTo 说，ReportView 载入它时取走 */
let arrival: { key: string; fresh: boolean } | null = null;

/** 读者离开了 key 那一页，在 view 那里（null：读不出来，记下的不动）。复制一份：view 来自那一页的 iframe，不留着它的对象 */
export function leftPage(key: string, view: unknown) {
  if (!view || typeof view !== 'object' || typeof (view as LeftView).y !== 'number') return;
  try {
    lefts.set(key, { view: JSON.parse(JSON.stringify(view)), at: Date.now() });
  } catch { /* 读不成 JSON：不记 */ }
}

/** 接下来要显示 key 那一页：fresh 时从开头开始（它要去自己的地方），否则回到离开时的地方 */
export function arrive(key: string, fresh: boolean) {
  arrival = { key, fresh };
}

/** 载入 key 那一页时它该在哪里：离开它不到 RECALL_FOR 的 view，或 null（从开头开始）。goTo 说过的 fresh 在这里取走 */
export function recall(key: string): LeftView | null {
  const asked = arrival;
  arrival = null;
  if (asked?.key === key && asked.fresh) return null;
  const left = lefts.get(key);
  if (!left) return null;
  if (!(Date.now() - left.at < RECALL_FOR)) {
    lefts.delete(key);
    return null;
  }
  return left.view;
}

/** view 里有光标（编辑页的 viewNow：所在的块和偏移） */
export const caretIn = (view: LeftView | null | undefined) => Boolean(view && typeof view.unit === 'string' && Number.isInteger(view.offset));
