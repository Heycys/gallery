import { Z } from "../../../shared/layers.mjs";
import { SPAN } from "../../../shared/media.mjs";
import { CENTERED } from "../../components/figure/index.mjs";
import { RESIZABLE, RESIZABLE_AT, SIZES } from "../../components/registry.mjs";
import { scrollHeight } from "../../components/table/index.mjs";
import { acrossLook, areaOf, inBody } from "../../../shared/table-across.mjs";
import { cancelOnEscape, endsGesture, gestureLock } from "../gesture.mjs";
import { kept } from "../kept.mjs";
import { note, own } from "../overlays.mjs";
import { addStyle, element, mount } from "../ui.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// Resizing chart cards and tables in the preview ("Sizes" in the kit's styles/sizes.css). With the pointer on the
// right edge of a card or table, or on its bottom edge (a chart's plot height, a table's scroll
// height), the cursor changes; dragging shows a gray line where the edge goes (darker where it
// snaps) and the bottom notice says the size that makes while the drag lasts (no label beside the
// line: the user, 2026-11-07), and letting go applies it as one undo step (Esc cancels). Widths are shares of the width
// the block stands in: the reading width, or its column's. A card's width snaps to the middle and
// to the end; a centered card grows on both sides. A table's
// width moves its own right end by as much as the pointer moves, also when the table is wider than
// its frame and scrolls in it; it snaps to the width it stands in, and past it the table is wider than
// the text and scrolls sideways in its frame, which stays at that width. Where the document's look lets
// wide tables past the text (宽表格: a table in the body, the kit's tables/across.js), a table past
// the text stands centred on its line, as far as the page's area: its right end is where the pointer is
// there too, the table as wide as that makes it (growing on both sides; on one side once the area stops it). (The columns of a row
// are resized by the gaps between them: columns/.)
// A table of a dozen rows or fewer has no bottom edge to drag. A code block's bottom edge sets the
// height of its frame: shorter than its code, the code scrolls inside it, and the edge snaps to the
// height that shows all of it (no height of its own). Letting go where the drag started changes
// nothing. Anything that ends the press another way (the capture lost, the window losing the
// focus, the page hidden) cancels it; the lines belong to the drag (overlays.mjs), and the notice it
// put up goes with it. Snapping takes the edge within SNAP (6px) of a place, little enough that a
// size near one can still be had (14px before 2026-11-07, which the user found too strong).

const STYLE = `
  ${gestureLock("data-ge-resize=\"x\"", { cursor: "ew-resize" })}
  ${gestureLock("data-ge-resize=\"y\"", { cursor: "ns-resize" })}
  .ge-resize-line { position: fixed; left: 0; top: 0; z-index: ${Z.guide}; border-radius: 1px; background: var(--ge-guide-hot); pointer-events: none; }
  .ge-resize-line[data-snap] { background: var(--ge-guide-snap); }
`;
const GRAB = { inside: 3, outside: 8 }; // how near an edge the pointer takes it, inside and outside the block (px)
const SNAP = 6; // px
const LIVE = 60000; // ms: the notice saying the size dragged to stays while the drag lasts (it is taken off when it ends)
const MIN_WIDTH = 160; // px: the least a card's edge is dragged to (a table's is its columns' floors)
// The sizes (name and range) are each component's description's (registry SIZES): the same ones the
// server checks a size by.
const range = (kind, name) => SIZES[kind][name];
// The size a kind's bottom edge sets (`height` among its sizes), and that size's least: a code block's
// frame is about a line and a half.
const heightOf = (kind) => Object.keys(SIZES[kind]).find((name) => SIZES[kind][name].height);
const heightRange = (kind) => range(kind, heightOf(kind));

/**
 * units: Map(id -> { kind }) from the edit map. active(): whether resizing may start.
 * look(element, { sizes }, select): the editor's undoable change of sizes. say(text, kind, hold): the
 * bottom notice; settle(): the notice taken off.
 * owns(node): whether a table's right and bottom edges are the table tools' (table/widths.mjs: a
 * click arms one, a drag then is this tool's, `startTable`).
 */
export function createResize({ units, active, look, say, settle = () => {}, owns = () => false }) {
  addStyle(STYLE);
  let hover = null; // { node, axis } under the pointer
  let drag = null;

  // Blocks made or converted on the page carry their kind (a code block made from a paragraph).
  const kindOf = (node) => node.getAttribute("data-ge-unit-kind") ?? units.get(Number(node.getAttribute("data-ge-unit")))?.kind;
  const codeOf = (node) => node.querySelector(":scope > pre");
  // A card's chart: the svg its host holds, straight in it or beside controls of its own (a part).
  const plot = (node) => node.querySelector(".doc-chart > svg") ?? node.querySelector(".doc-chart svg");
  const sizeOf = (node, name) => node.style.getPropertyValue(name).trim() || null;
  // The page's gutter in full width (--doc-wide-gutter) while editing: the room the handle takes
  // beside the blocks (--ge-edge-room, handle/; the tool works only while editing).
  const gutter = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--ge-edge-room")) || 0;
  const SHORT = 12; // a table with this many rows or fewer shows them all: no height to set

  // The blocks that may resize (`resizable`) of the open modal dialog if there is one, else of the page: kept
  // between moves (kept.mjs), as looking them up and measuring each on every move cost up to 1.8ms a
  // move on a long report.
  const blocks = kept(() => {
    const scope = document.querySelector("dialog[open]") ?? document.querySelector("main");
    return [...(scope?.querySelectorAll(RESIZABLE_AT) ?? [])];
  });
  // One of them the reader can reach now: visible, of a kind that resizes, not folded or inert.
  const reachable = (node) => RESIZABLE.has(kindOf(node)) && node.getClientRects().length > 0 && !node.closest("[inert]") && !node.matches(".doc-code--folded");

  // Which edge of which block the pointer is on: the right one of a card or table, or the bottom
  // one of a table, a card with a chart or a code block that is (or may be) shorter than its code.
  // Only a block whose edges the pointer is within the grab of is looked at any further.
  function edgeAt(x, y) {
    for (const node of blocks()) {
      const rect = node.getBoundingClientRect();
      const near = x >= Math.min(rect.left, rect.right - GRAB.inside) && x <= rect.right + GRAB.outside && y >= Math.min(rect.top, rect.bottom - GRAB.inside) && y <= rect.bottom + GRAB.outside;
      if (!near || !reachable(node)) continue;
      const kind = kindOf(node);
      if (kind !== "code" && !(kind === "table" && owns(node)) && y >= rect.top && y <= rect.bottom && x >= rect.right - GRAB.inside && x <= rect.right + GRAB.outside) return { node, axis: "x" };
      if (!(x >= rect.left && x <= rect.right && y >= rect.bottom - GRAB.inside && y <= rect.bottom + GRAB.outside)) continue;
      const code = kind === "code" ? codeOf(node) : null;
      const tall = kind === "table" ? !owns(node) && node.querySelectorAll(":scope > table > tbody > tr").length > SHORT
        : kind === "code" ? Boolean(code) && (code.scrollHeight > heightRange(kind).min * 2 || sizeOf(node, heightOf(kind)) !== null) : plot(node);
      if (tall) return { node, axis: "y" };
    }
    return null;
  }

  function setHover(next) {
    hover = next;
    const axis = next?.axis ?? null;
    if (document.documentElement.getAttribute("data-ge-resize") === axis) return; // the same on every move along an edge
    if (axis) document.documentElement.setAttribute("data-ge-resize", axis);
    else document.documentElement.removeAttribute("data-ge-resize");
  }

  function contentBox(container) {
    const rect = container.getBoundingClientRect();
    const style = getComputedStyle(container);
    const left = rect.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
    const right = rect.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
    return { left, right, width: right - left };
  }

  // ---------- widths ----------

  // The share of the width it stands in a right edge at x gives; a centered card's is twice its half.
  function shareAt(x) {
    const { rect, box, centered } = drag;
    if (centered) return (2 * (x - (box.left + box.right) / 2)) / box.width;
    return (x - rect.left) / box.width;
  }

  // A table's width goes by how far the pointer moved: the table's own right
  // end moves that much, also when the table is wider than its frame and scrolls in it (its end
  // then lies past the frame's edge, or at it when scrolled to the end). It snaps back where it
  // started and to the reading width; past that it is wider than the text, as far as the window goes.
  // A table narrower than the text never scrolls: it goes no narrower than its columns' readable
  // floors (tables.js leaves them on the wrapper).
  function tableWidthAt(x) {
    const { box, table } = drag;
    const far = Math.max(box.right, document.documentElement.clientWidth - gutter());
    // Past the text (table.area: 宽表格), centred on its line within the page's area: as wide as puts its
    // right end at the pointer (twice the pointer's way from the line's middle, or from the area's left edge where
    // the area stops it there: the less of the two).
    const across = (at) => (table.area ? Math.min(2 * (at - (box.left + box.right) / 2), at - table.area.left) : null);
    // A table wider than the area already (its frame the area's width, the table scrolling in it) moves its own
    // right end by the pointer's way, as one in the text does.
    const width = (at) => {
      const moved = table.width + (at - table.press);
      const scrolls = table.area && table.width > table.area.right - table.area.left + 1;
      return table.area && !scrolls && moved > box.width ? Math.max(box.width, across(at)) : moved;
    };
    const narrowest = table.press - (table.width - Math.max(MIN_WIDTH, table.floor));
    let edge = Math.min(Math.max(x, narrowest), far);
    const snaps = [{ x: table.press, label: t("原宽度"), keep: true }, { x: table.press + (box.width - table.width), label: t("铺满正文") }];
    const snap = snaps.find((candidate) => Math.abs(candidate.x - edge) <= SNAP);
    if (snap) edge = snap.x;
    if (snap?.keep) return { edge, label: snap.label, value: drag.before, snapped: true };
    // Rounded up, so the frame is never narrower than where it was let go (at the floors, say).
    const share = Math.ceil(Math.max(range("table", SPAN).min, width(edge) / box.width) * 1000) / 1000;
    const past = table.area && width(edge) <= table.area.right - table.area.left;
    const label = snap?.label ?? (share > 1 ? (past ? t("超宽表 · 表宽 {0}px，居中超出正文", Math.round(width(edge))) : t("超宽表 · 表宽 {0}px，横向滚动", Math.round(width(edge))))
      : edge <= narrowest + 0.5 ? t("最窄 · {0}%", Math.round(share * 100)) : `${Math.round(share * 100)}%`);
    return { edge, label, value: Math.abs(share - 1) < 0.005 ? "1" : String(Math.min(share, range("table", SPAN).max)), snapped: Boolean(snap) };
  }

  // Where the edge may go and where it snaps: back where it started (no change), the middle (a
  // card), the end of the line or the reading width.
  function widthAt(x) {
    const { node, kind, rect, box, centered } = drag;
    if (kind === "table") return tableWidthAt(x);
    const center = (box.left + box.right) / 2;
    const far = box.right;
    const near = centered ? center + MIN_WIDTH / 2 : rect.left + MIN_WIDTH;
    const fromStart = Math.abs(rect.left - box.left) < 2;
    const snaps = [{ x: rect.right, label: t("原宽度"), keep: true }];
    const middle = centered ? center + box.width / 4 : box.left + box.width / 2;
    if (kind === "figure" && middle > near) snaps.push({ x: middle, label: centered ? t("半宽 · 居中") : fromStart ? t("半宽") : t("到中线") });
    snaps.push({ x: box.right, label: fromStart || centered ? t("全宽") : t("占满本行") });
    let edge = Math.min(Math.max(x, near), far);
    const snap = snaps.find((candidate) => Math.abs(candidate.x - edge) <= SNAP);
    if (snap) edge = snap.x;
    if (snap?.keep) return { edge, label: snap.label, value: drag.before, snapped: true };
    const share = Math.round(Math.max(range(kind, SPAN).min, shareAt(edge)) * 1000) / 1000;
    const whole = Math.abs(share - 1) < 0.005;
    const label = snap?.label ?? `${Math.round(share * 100)}%${centered ? t(" · 居中") : ""}`;
    // A card at the whole width is the default.
    const value = whole ? (kind === "figure" && !centered ? null : "1") : String(Math.min(share, range(kind, SPAN).max));
    return { edge, label, value, snapped: Boolean(snap) };
  }

  // ---------- heights ----------

  // The plot's height as drawn: at least 280px wide, scaled down in a narrower card, so the
  // height set is the viewBox's, not the one shown.
  const drawnHeight = (svg) => svg.viewBox?.baseVal?.height || svg.getBoundingClientRect().height;

  // A chart card: the plot's height, never below what the chart needs; back where it started
  // changes nothing. A table: its scroll area,
  // at most all its rows. A code block: its frame (a code card's header aside), at most its whole
  // code, which it snaps to.
  function heightAt(y) {
    const { node, kind, rect, before } = drag;
    if (kind === "code") {
      const code = codeOf(node);
      const header = rect.height - code.getBoundingClientRect().height;
      const whole = rect.height + (code.scrollHeight - code.clientHeight); // all its lines, no scrolling
      const height = Math.min(Math.max(y - rect.top, Math.min(whole, header + heightRange(kind).min)), whole);
      if (before !== null && Math.abs(rect.top + height - rect.bottom) <= SNAP / 2) return { edge: rect.bottom, label: t("原高度"), value: before, snapped: true };
      if (whole - height <= SNAP) return { edge: rect.top + whole, label: t("显示全部代码"), value: null, snapped: true };
      const frame = Math.round(height - header);
      return { edge: rect.top + header + frame, label: t("高 {0}px · 其余滚动查看", frame), value: `${frame}px` };
    }
    if (kind === "figure") {
      const svg = plot(node);
      const drawn = drawnHeight(svg);
      const scale = svg.getBoundingClientRect().height / drawn || 1;
      const floor = 160; // the least a chart is drawn at (a softer floor than the one a size is checked by)
      if (Math.abs(rect.bottom - y) <= SNAP) return { edge: rect.bottom, label: t("原高度"), value: before, snapped: true };
      // Level with a card beside it (in another column of its row): the bottoms meet.
      const beside = drag.beside.find((bottom) => Math.abs(bottom - y) <= SNAP);
      const height = Math.round(Math.min(Math.max(drawn + ((beside ?? y) - rect.bottom) / scale, floor), heightRange(kind).max));
      const edge = rect.bottom + (height - drawn) * scale;
      const level = beside !== undefined && Math.abs(edge - beside) < 1.5;
      return { edge, label: level ? t("与旁边对齐 · 图表高 {0}px", height) : t("图表高 {0}px", height), value: `${height}px`, snapped: level };
    }
    const all = node.scrollHeight + (node.offsetHeight - node.clientHeight);
    let height = Math.min(Math.max(y - rect.top, heightRange(kind).min), all);
    if (Math.abs(rect.top + height - rect.bottom) <= SNAP / 2) return { edge: rect.bottom, label: t("原高度"), value: drag.before, snapped: true };
    if (height >= all - 2) {
      const fits = all <= scrollHeight(node); // the default scroll area shows them all
      return { edge: rect.top + all, label: t("显示全部行"), value: fits ? null : "none", snapped: true };
    }
    height = Math.round(height);
    return { edge: rect.top + height, label: t("高 {0}px", height), value: `${height}px` };
  }

  // The bottoms of the cards standing beside a card: alone in another column of its row of columns.
  function besideBottoms(node) {
    const column = node.parentElement;
    const row = column?.classList.contains("doc-column") ? column.parentElement : null;
    if (!row?.classList.contains("doc-columns")) return [];
    return [...row.children].filter((other) => other !== column && other.classList.contains("doc-column"))
      .flatMap((other) => [...other.children].filter((card) => card.matches("figure.doc-figure") && card.getClientRects().length > 0))
      .map((card) => card.getBoundingClientRect().bottom);
  }

  // ---------- dragging ----------

  function start(event, { node, axis }) {
    const kind = kindOf(node);
    const name = axis === "x" ? SPAN : heightOf(kind);
    const before = sizeOf(node, name);
    const rect = node.getBoundingClientRect();
    drag = {
      node, axis, kind, name, before, rect,
      press: { x: event.clientX, y: event.clientY },
      box: contentBox(node.parentElement),
      // A card's height snaps level with the cards beside it: the bottoms of those in the other columns of its row.
      beside: axis === "y" && kind === "figure" ? besideBottoms(node) : [],
      centered: axis === "x" && kind === "figure" && node.classList.contains(CENTERED),
      // A table's whole width (past its frame when it scrolls sideways), where the press was, and
      // whether it is scrolled to its end.
      table: axis === "x" && kind === "table" ? {
        width: Math.max(rect.width, node.scrollWidth + (node.offsetWidth - node.clientWidth)),
        floor: Number(node.dataset.docMinWidth) || 0,
        press: event.clientX,
        atEnd: node.scrollLeft + node.clientWidth >= node.scrollWidth - 2,
        // 宽表格: the page's area at full width, where the table goes past the text (null: it scrolls in the text).
        area: acrossLook() && inBody(node) ? areaOf() : null,
      } : null,
      result: null,
      told: null, // what the notice says now
    };
    const session = drag;
    session.lines = (session.centered ? [0, 1] : [0]).map(() => element("div", { class: "ge-resize-line" }));
    for (const part of session.lines) mount(own(part, "resize", { owner: node, alive: () => drag === session }));
    note("resize", `start ${axis}`);
    document.documentElement.setPointerCapture?.(event.pointerId);
    update(event.clientX, event.clientY);
  }

  // What is being resized, in the notice's words: 图形 and 宽度, 表格 and 高度, 代码块 and 高度.
  const what = (kind, axis) => [kind === "figure" ? t("图形") : kind === "code" ? t("代码块") : t("表格"), axis === "x" ? t("宽度") : t("高度")];

  function update(x, y) {
    const { axis, kind, rect, box, lines } = drag;
    drag.result = axis === "x" ? widthAt(x) : heightAt(y);
    const { edge } = drag.result;
    if (axis === "x") {
      const mirror = 2 * ((box.left + box.right) / 2) - edge;
      lines.forEach((line, index) => Object.assign(line.style, {
        width: "2px", height: `${Math.round(rect.height)}px`,
        transform: `translate(${Math.round((index ? mirror : edge) - 1)}px, ${Math.round(rect.top)}px)`,
      }));
    } else {
      Object.assign(lines[0].style, { width: `${Math.round(rect.width)}px`, height: "2px", transform: `translate(${Math.round(rect.left)}px, ${Math.round(edge - 1)}px)` });
    }
    lines.forEach((line) => line.toggleAttribute("data-snap", Boolean(drag.result.snapped)));
    // The size in the bottom notice once the pointer has moved (a press alone says nothing), said again
    // only when it changes (a workbench is told each time).
    if (!drag.told && Math.hypot(x - drag.press.x, y - drag.press.y) < 2) return;
    const told = t("{0}{1}：{2}", ...what(kind, axis), drag.result.label);
    if (told !== drag.told) say(told, "note", LIVE);
    drag.told = told;
  }

  function finish(commit) {
    if (!drag) return;
    const { node, axis, kind, name, lines, result, table, told } = drag;
    note("resize", commit ? "released" : "cancelled");
    drag = null;
    lines.forEach((line) => line.remove());
    if (told) settle(); // the size dragged to: what is said next (or nothing) replaces it
    setHover(null);
    if (commit && result && look(node, { sizes: { [name]: result.value } }, null)) {
      say(t("已调整{0}{1}：{2} · Ctrl+Z 撤销", ...what(kind, axis), result.label));
      // Scrolled to its end, a table stays so: its new end shows at the frame's edge, ready for the
      // next drag (after tables.js has laid it out again, on the next frame).
      if (table?.atEnd) requestAnimationFrame(() => requestAnimationFrame(() => { node.scrollLeft = node.scrollWidth; }));
    }
  }

  // ---------- events ----------

  document.addEventListener("pointermove", (event) => {
    if (drag) return update(event.clientX, event.clientY);
    const busy = !active() || event.buttons || document.documentElement.hasAttribute("data-ge-drag") || event.target?.closest?.("[data-doc-dev]");
    setHover(busy ? null : edgeAt(event.clientX, event.clientY));
  }, { passive: true, capture: true });
  document.addEventListener("pointerdown", (event) => {
    if (drag || event.button !== 0 || !active() || event.target?.closest?.("[data-doc-dev]")) return;
    const at = edgeAt(event.clientX, event.clientY);
    if (!at) return;
    event.preventDefault(); // no caret, no text selection
    event.stopImmediatePropagation(); // nor the editor's reaction to a press on the page
    start(event, at);
  }, true);
  document.addEventListener("pointerup", () => { if (drag) finish(true); }, true);
  // After pointerup the drag is over already; any other way it ends, it is cancelled (gesture.mjs).
  endsGesture({ active: () => Boolean(drag), cancel: () => finish(false) });
  cancelOnEscape({ active: () => Boolean(drag), cancel: () => { finish(false); say(t("已取消调整")); } });

  return {
    /** A table's width ("x", from its right edge) or scroll height ("y", from its bottom edge) dragged, the press `event` on it (the table tools' armed edge). */
    startTable(event, node, axis = "x") {
      if (drag || !active()) return false;
      setHover({ node, axis });
      start(event, { node, axis });
      return true;
    },
    /** Stop any resizing. */
    hide() {
      if (drag) finish(false);
      setHover(null);
    },
    /** The editor's UI nodes to keep in the top layer when a modal dialog opens. */
    get nodes() { return drag ? [...drag.lines] : []; },
  };
}
