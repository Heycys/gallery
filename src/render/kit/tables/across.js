import { ACROSS, acrossLook, areaOf, contentBox, inBody } from "../../../shared/table-across.mjs";
import { setStyle } from "./scrollbars.js";

// 宽表格 (the document's look `tables: "wide"`, data-doc-tables="wide" on <html>: src/shared/document-look.mjs;
// docs/render.md "Wide tables"; the user's 表格跨越边界, 2026-11-20): a table wider than the text, its
// frame standing in the body itself, is centred on its line and goes past the text's edges on both sides, as far
// as the page's area at full width (the gutters page.css gives the page there, --doc-area-start and --doc-area-end:
// the page editor's room gives its own, src/editor/page/margin.mjs). Only one wider than that area scrolls
// sideways in its frame, as every wide table did before, the frame then as wide as the area. A table that fits the
// text, one in a container (a highlight block, columns, a disclosure, tabs, a list item: the container has a
// frame of its own and keeps its tables inside it, as ever), and every table on a narrow screen (the kit's narrow
// layout, NARROW_PAGE, whose gutters leave nothing to go into) are as they were. What stands in the body and the
// area are src/shared/table-across.mjs's, which the page editor's tools that size a table read too. The layout
// (layout.js) asks acrossRoom how much room a frame has past the text and places the frame with placeAcross; the
// frame's own width, its left margin and its max-width are written on it then (inline, as the layout's widths
// are: never in the file, a copy of the view takes them off), with data-doc-across, which says it is placed so.
// The table's tools (its scrollbars, its sticky header row, the page editor's tools over it) all go by the frame
// as it stands.

export { ACROSS, acrossLook };

// The kit's narrow layout (styles/: the page's 760px breakpoint), where no table goes past the text.
const NARROW_PAGE = "(max-width: 760px)";

/**
 * The room the frame `wrapper` has past the text for its columns (px: the area's width less the frame's own
 * `edges`, its borders and padding), or null where it goes nowhere past the text: the look does not let it, it
 * stands in a container or on a narrow screen, or the area gives it no more than the text's `available`.
 */
export function acrossRoom(wrapper, available, edges) {
  if (!wrapper || !acrossLook() || globalThis.matchMedia?.(NARROW_PAGE).matches || !inBody(wrapper)) return null;
  const area = areaOf();
  if (!area) return null;
  const room = area.right - area.left - edges;
  return room > available + 0.5 ? room : null;
}

// A length in whole device pixels, so that the frame's lines fall on pixels as the text's do.
const onDevice = (value) => {
  const ratio = globalThis.devicePixelRatio || 1;
  return Math.round(value * ratio) / ratio;
};

/**
 * The frame `wrapper` placed past the text at `width` px (its border box): centred on the line it stands on (its
 * parent's content box), moved in where that would take it past the area's edges. Its width, its left margin and
 * no max-width written on it, each only where it changes (setStyle), and ACROSS.
 */
export function placeAcross(wrapper, width) {
  const area = areaOf();
  const line = contentBox(wrapper.parentElement);
  const centred = line.left + (line.width - width) / 2;
  const left = area ? Math.max(area.left, Math.min(centred, area.right - width)) : centred;
  setStyle(wrapper, "max-width", "none");
  setStyle(wrapper, "width", `${width}px`);
  setStyle(wrapper, "margin-left", `${onDevice(left - line.left)}px`);
  if (!wrapper.hasAttribute(ACROSS)) wrapper.setAttribute(ACROSS, "");
}

/** The frame back in the text: what placeAcross wrote taken off (its width is the layout's to write again). */
export function clearAcross(wrapper) {
  if (!wrapper?.hasAttribute(ACROSS)) return false;
  wrapper.removeAttribute(ACROSS);
  wrapper.style.removeProperty("max-width");
  wrapper.style.removeProperty("margin-left");
  wrapper.style.removeProperty("width");
  if (wrapper.getAttribute("style") === "") wrapper.removeAttribute("style");
  return true;
}
