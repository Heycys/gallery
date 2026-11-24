import { LOOK_ATTRIBUTES, READER_WIDE } from "./components/page.mjs";

// 宽表格 (the document's look `tables: "wide"`: ./document-look.mjs) and 宽多维表格, what the kit's tables
// (src/render/kit/tables/across.js, which places a table's frame past the text), its databases (database/across.js)
// and the page editor (its tools that size a table: src/editor/page/resize/, page/table/widths.mjs; the handle, the
// block menu, 批注) all read of a page: whether its look, or a block's own word (WIDE), lets a wide block past the
// text, which blocks stand in the body itself, the page's area at full width they may take, and what of a block
// stands past the text now. In a browser, of the page they run in.

/** The attribute on a table's frame placed past the text (the kit's: tables/across.js). */
export const ACROSS = "data-doc-across";

/** Whether the document's look lets wide tables past the text (data-doc-tables="wide" on its <html>). */
export const acrossLook = (root = globalThis.document?.documentElement) => root?.getAttribute(LOOK_ATTRIBUTES.tables) === "wide";

/**
 * A block's own 宽表格 or 宽多维表格, in the file: "on" or "off" on a table's frame (.doc-table-wrap) or on a
 * database (div.doc-database), over the page's look for that one block (the block menu's switch of the same name
 * writes it; the page's switch, which sets every block, takes them all away). None: the block goes by the page.
 */
export const WIDE = "data-doc-wide";

/**
 * The reader's own choice in an export's display menu (the kit's ui.js), on its <html>: their 宽表格 or 宽多维表格,
 * which, as the page's switch does, sets every block of the kind, whatever the block's own says. Never while the page
 * editor edits the page (html[data-ge-editing]): there the file's word stands.
 */
export { READER_WIDE };

// The block's own word, "on" true, "off" false, else null (none, or the reader's choice over it).
function ownWide(element, kind, root) {
  if (root?.hasAttribute(READER_WIDE[kind]) && !root.hasAttribute("data-ge-editing")) return null;
  const value = element?.getAttribute?.(WIDE);
  return value === "on" ? true : value === "off" ? false : null;
}

/** Whether the table frame `wrapper` goes past the text where it is wider: its own 宽表格, else the page's. */
export const wideTable = (wrapper, root = globalThis.document?.documentElement) => ownWide(wrapper, "tables", root) ?? acrossLook(root);

/** Whether the database `host` goes past the text where its views are wider: its own 宽多维表格, else the page's. */
export const wideDatabase = (host, root = globalThis.document?.documentElement) => ownWide(host, "databases", root) ?? acrossDatabasesLook(root);

/** The class of a database's drawing (.doc-database-app) placed past the text (the kit's database/across.js). */
export const WIDE_DRAWING = "is-wide";

/**
 * The width a database's views take past the text's left edge (its widest table view's, px: the kit's
 * database/across.js), on its drawing whether or not it goes past the text: what the block's 宽多维表格 is offered by.
 */
export const VIEWS_WIDTH = "data-doc-views-width";

/**
 * Whether the database `host` would go past the text were it wide (宽多维表格): its views wider than the text, standing in
 * the body, on a screen wider than the kit's narrow layout. What offers its own switch (the page editor's block menu).
 */
export function databaseWider(host) {
  const wanted = Number(host?.querySelector?.(`:scope > .doc-database-app`)?.getAttribute(VIEWS_WIDTH));
  return wanted > 0 && !globalThis.matchMedia?.("(max-width: 760px)").matches && inBody(host) && wanted > contentBox(host).width + 0.5;
}

/**
 * What of the block `node` is in stands past the text now: a table's frame (ACROSS) or a database's drawing
 * (WIDE_DRAWING), or null. What the page editor draws beside a block (its handle, the bars and markers at its right)
 * goes by its edges.
 */
export function placedPast(node) {
  const element = node?.nodeType === 1 ? node : node?.parentElement;
  const frame = element?.closest?.(`[${ACROSS}]`);
  if (frame) return frame;
  // A block of a record's body (a slot of the database's) is none of its drawing.
  const database = element?.closest?.(".doc-database");
  const body = element?.closest?.("[data-doc-slot]");
  if (!database || (body && database.contains(body))) return null;
  return database.querySelector(`:scope > .doc-database-app.${WIDE_DRAWING}`) ?? null;
}

/** What of the element itself stands past its own box: a database's drawing (its child) placed past the text, or null. */
export const drawnPast = (element) => (element?.matches?.(".doc-database") ? element.querySelector(`:scope > .doc-database-app.${WIDE_DRAWING}`) : null);

/**
 * What stands past the text inside `element` now and shows (its tables' frames, its databases' drawings), its own
 * drawing aside (a database's: drawnPast): what a section's bar is dotted across, and what has a selected section filled
 * block by block (the page editor's handle/ and selection/).
 */
export function placedIn(element) {
  const own = drawnPast(element);
  const placed = element?.querySelectorAll?.(`[${ACROSS}], .doc-database > .doc-database-app.${WIDE_DRAWING}`) ?? [];
  return [...placed].filter((each) => each !== own && each.checkVisibility?.() !== false && each.getClientRects().length > 0);
}

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

/**
 * Whether the page in `doc` holds a table 宽表格 acts on (a table frame standing in the body itself: inBody): what
 * offers the switch, the workbench's 更多 and an export's display menu, offers it only then (the user's 2026-11-23).
 */
export const holdsBodyTables = (doc) => [...(doc?.querySelectorAll?.("main .doc-table-wrap") ?? [])].some(inBody);

/** Whether the document's look lets wide databases past the text (宽多维表格: data-doc-databases="wide" on its <html>). */
export const acrossDatabasesLook = (root = globalThis.document?.documentElement) => root?.getAttribute(LOOK_ATTRIBUTES.databases) === "wide";

/**
 * Whether the page in `doc` holds a 多维表格 宽多维表格 acts on (one standing in the body itself, as inBody says of a
 * table's frame): what offers that switch, the workbench's 更多 and an export's display menu, offers it only then.
 */
export const holdsBodyDatabases = (doc) => [...(doc?.querySelectorAll?.("main .doc-database") ?? [])].some(inBody);

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
