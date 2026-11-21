// 演示视图 (the workbench's, src/workbench/app/features/present/): the controls the page keeps its keys for (a field to
// type in, an editable text, a block's instance: the reader's keys in them are theirs, Esc alone is the presentation's, unless the
// control used it), and 上一节 / 下一节, which the presentation does on a page of its own origin and a draft's page does itself
// (src/editor/page/present-shell.mjs), for the presentation cannot reach into a page of another origin.

export const KEEPS_KEYS = 'input:not([type="checkbox"], [type="radio"], [type="button"], [type="submit"], [type="reset"], [type="file"], [type="color"]), textarea, select, [contenteditable]:not([contenteditable="false"]), [data-doc-component]';

/**
 * The report in window `win` scrolled to the next section (`direction` 1) or the one before (-1): the visible h2 and h1 of its main,
 * placed 24px below the window's top; at the last, the page's end, at the first, its top.
 */
export function stepSection(win, direction) {
  const doc = win.document;
  const tops = [...doc.querySelectorAll("main h2, main h1")].filter((node) => node.getClientRects().length).map((node) => node.getBoundingClientRect().top - 24);
  const target = direction > 0 ? tops.find((top) => top > 4) : tops.filter((top) => top < -4).pop();
  win.scrollTo({ top: target === undefined ? (direction > 0 ? doc.documentElement.scrollHeight : 0) : win.scrollY + target, behavior: "smooth" });
}
