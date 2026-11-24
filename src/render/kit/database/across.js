// 宽多维表格 (the document's look `databases: "wide"`, data-doc-databases="wide" on <html>: src/shared/document-look.mjs;
// docs/render.md "Databases"), as 宽表格 is for a table (tables/across.js): a 多维表格 whose views are wider than the
// text, standing in the body itself, is centred on its line and goes past the text's edges on both sides, as far as the
// page's area at full width; only a view wider than that scrolls in its own frame, the drawing then as wide as the
// area. One in a container (a highlight block, columns, a disclosure, a custom block's slot) and every one on a narrow
// screen are as they were. What is placed is the drawing (.doc-database-app: its head, its filter bar and its view
// together), its width and left margin written on it (inline, never in the file: an export's copy takes the drawing
// off), with the class is-wide. Every view of one database takes one width, the one its table views take (app.js
// `place`), so that going from its table to its board or its calendar never makes it wider or narrower. A database's
// own word (data-doc-wide="on" or "off" on it, in the file: the block menu's 宽多维表格) is over the page's look for
// it (wideDatabase). The drawing says the width its views take (VIEWS_WIDTH), wide or not, by which the page editor's
// block menu offers that switch where it would go past the text; nothing of the page is measured where it stays in the
// text (a database's every change places it again: a cell typed too).
import { VIEWS_WIDTH, WIDE_DRAWING, areaOf, contentBox, inBody, wideDatabase } from "../../../shared/table-across.mjs";
import { tableWidthOf } from "./table.js";

const NARROW_PAGE = "(max-width: 760px)"; // the kit's narrow layout, whose gutters leave nothing to go into

/**
 * The width every view of the database `store` holds is placed by (past the text's left edge): that of its widest
 * table view (the view shown, `shown`, as it is drawn now, when it is one), 0 for a database with no table view,
 * which stays in the text whatever it shows. A table view narrower than that fills it, its rows' lines running on.
 */
export function viewsWidth(store, shown) {
  const tables = store.doc.views.filter((view) => view.layout === "table");
  return Math.max(0, ...tables.map((view) => tableWidthOf(store, view)), shown?.width?.() ?? 0);
}

// A length in whole device pixels, so that the drawing's lines fall on pixels as the text's do.
const onDevice = (value) => {
  const ratio = globalThis.devicePixelRatio || 1;
  return Math.round(value * ratio) / ratio;
};

/** The drawing `app` of the database `host` placed for views that take `wanted` px (none: as wide as the text). */
export function placeAcross(host, app, wanted) {
  const said = String(Math.round(wanted));
  if (app.getAttribute(VIEWS_WIDTH) !== said) app.setAttribute(VIEWS_WIDTH, said);
  if (!wanted || !wideDatabase(host) || globalThis.matchMedia?.(NARROW_PAGE).matches || !inBody(host)) return clearAcross(app);
  const line = contentBox(host);
  const room = wanted > line.width + 0.5 ? areaOf() : null;
  if (!room) return clearAcross(app);
  const width = Math.min(wanted, room.right - room.left);
  const centred = line.left + (line.width - width) / 2;
  const left = Math.max(room.left, Math.min(centred, room.right - width));
  const placed = { width: `${Math.round(width)}px`, margin: `${onDevice(left - line.left)}px` };
  if (app.style.width !== placed.width) app.style.width = placed.width;
  if (app.style.marginLeft !== placed.margin) app.style.marginLeft = placed.margin;
  if (!app.classList.contains(WIDE_DRAWING)) app.classList.add(WIDE_DRAWING);
}

/** The drawing back in the text. */
export function clearAcross(app) {
  if (!app.classList.contains(WIDE_DRAWING)) return;
  app.classList.remove(WIDE_DRAWING);
  app.style.removeProperty("width");
  app.style.removeProperty("margin-left");
  if (app.getAttribute("style") === "") app.removeAttribute("style");
}
