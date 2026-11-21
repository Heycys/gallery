import { LOOK_ATTRIBUTES } from "./components/page.mjs";

// 宽表格 (the document's look `tables: "wide"`: ./document-look.mjs), what the kit's tables
// (src/render/kit/tables/across.js, which places a table's frame past the text) and the page editor (its tools
// that size a table: src/editor/page/resize/, page/table/widths.mjs) both read of a page: whether its look lets
// wide tables past the text, which frames stand in the body itself, and the page's area at full width they may
// take. In a browser, of the page they run in.

/** The attribute on a table's frame placed past the text (the kit's: tables/across.js). */
export const ACROSS = "data-doc-across";

/** Whether the document's look lets wide tables past the text (data-doc-tables="wide" on its <html>). */
export const acrossLook = (root = globalThis.document?.documentElement) => root?.getAttribute(LOOK_ATTRIBUTES.tables) === "wide";

/** An element's content box (client coordinates): { left, right, width }. */
export function contentBox(element) {
  const rect = element.getBoundingClientRect();
  const style = getComputedStyle(element);
  const left = rect.left + (parseFloat(style.borderLeftWidth) || 0) + (parseFloat(style.paddingLeft) || 0);
  const right = rect.right - (parseFloat(style.borderRightWidth) || 0) - (parseFloat(style.paddingRight) || 0);
  return { left, right, width: right - left };
}

// What a frame may stand in and still stand in the body: the page's own sections and plain blocks of no look of
// their own (a section, a div or an article, of no class but the kit's section, .doc-section), each as wide as the
// page's text. A container (anything else: a highlight block, a callout, columns, a disclosure, tabs, a list item,
// a card, a detail card) has a frame of its own and keeps its tables inside it.
const PLAIN = /^(?:SECTION|DIV|ARTICLE)$/;
const plainClasses = (element) => [...element.classList].every((name) => name === "doc-section");

/** Whether the table frame `wrapper` stands in the body itself: its parent and every element up to the page (main.doc-page) plain. */
export function inBody(wrapper) {
  const page = wrapper?.closest?.(".doc-page");
  if (!page) return false;
  const text = contentBox(page);
  for (let node = wrapper.parentElement; node && node !== page; node = node.parentElement) {
    if (!PLAIN.test(node.tagName) || !plainClasses(node)) return false;
    const box = contentBox(node);
    if (Math.abs(box.left - text.left) > 1 || Math.abs(box.right - text.right) > 1) return false;
  }
  return true;
}

/**
 * The page's area at full width (client coordinates: { left, right }): the body's content box less the gutters the
 * page has at full width (the kit's --doc-area-start and --doc-area-end, registered lengths, styles/page.css; the page
 * editor's room gives its own, src/editor/page/margin.mjs), or null where they do not read.
 */
export function areaOf(doc = globalThis.document) {
  const style = getComputedStyle(doc.documentElement);
  const start = parseFloat(style.getPropertyValue("--doc-area-start"));
  const end = parseFloat(style.getPropertyValue("--doc-area-end"));
  if (!Number.isFinite(start) || !Number.isFinite(end) || !doc.body) return null;
  const body = contentBox(doc.body);
  return { left: body.left + start, right: body.right - end };
}
