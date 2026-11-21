import { FLOW_RATIO } from "../../components/flowchart/index.mjs";
import { FLOW_ROW } from "../../../shared/components/list.mjs";
import { cancelOnEscape, endsGesture, gestureLock } from "../gesture.mjs";
import { kept } from "../kept.mjs";
import { note, own } from "../overlays.mjs";
import { columnOps, rowOps } from "../page-objects.mjs";
import { drawBox, layerOf } from "../overlay-layer.mjs";
import { tooltip } from "../tooltip.mjs";
import { addStyle, element } from "../ui.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// The gaps between columns (分栏), and between the nodes of a flowchart's row (步骤流程图: the
// same tool, the user's of 2026-10-25). With the pointer in the gap between two of them, a thin line stands down
// it, and the cursor says it resizes: dragging it moves only the two beside it (ratiosAfterResize:
// snapping to their equal split and to tenths of the row within SNAP px, each keeping its least
// share), the bottom notice saying the row's shares while it lasts (no badge on the parts: the user,
// 2026-11-07, who also found the old snap of 1% of the row too strong); letting go writes the shares
// as one undo step, Esc cancels, and a double click makes the row's parts equal again. The line is
// a gray, never a bright blue (the guide tokens, look.mjs): faint where a drag may start, darker
// while it is dragged, darkest where it snaps. A kind of row (KINDS) says how its parts are found,
// measured, shown while dragged and written:
//   - a row of columns: the line darker in the row (fainter above it, up to its pin); above each gap,
//     and right of the last column, a dot turns into a round + that adds a column there (新增分栏). While the
//     pointer is over a row, or the caret in it, its columns are tinted, so the reader sees where they
//     are. A row stacked on a narrow screen has no gaps. Its shares (--doc-column-ratio) are shown
//     as the columns' flex-grow while dragged, written as one structural step.
//   - a flowchart's row, as the kit laid it out (its nodes whose cards stand at one height:
//     components/flowchart/page.mjs rowsOfFlow): the line faint, darker once pressed, the
//     arrow under it dimmed while it shows; no pin (a node is added by the "+" at a node's right,
//     add.mjs). A node keeps the least width the kit gives a card beside others (leastWidth: 116px and
//     its longest word), so the row never wraps under the pointer. Its shares are each node's weight
//     in its row (--doc-flow-ratio, on every node of the row once dragged), written on the nodes
//     while dragged so the kit lays the row out as it will be (its widths, the arrow turning from its
//     last node), commits holding off meanwhile (`dragging`, editor.mjs), and put back as they were
//     before letting go makes them one look step (or Esc leaves them so); a double click takes the
//     row's weights off (equal widths). Only the row dragged changes: each row's weights are its own.

const STYLE = `
  .doc-columns[data-ge-box] > .doc-column { border-radius: 4px; transition: background-color 100ms ease-in-out, box-shadow 100ms ease-in-out; }
  .doc-columns[data-ge-box]:is(:hover, :focus-within) > .doc-column,
  .doc-columns[data-ge-gap-drag] > .doc-column {
    background-color: light-dark(rgb(100 106 115 / 5%), rgb(255 255 255 / 5%));
    box-shadow: 0 0 0 4px light-dark(rgb(100 106 115 / 5%), rgb(255 255 255 / 5%));
  }
  ${gestureLock("data-ge-gap", { cursor: "col-resize" })}
  html[data-ge-gap-drag] { -webkit-user-select: none; user-select: none; }
  .ge-gap-line { width: 2px; border-radius: 1px; background: var(--ge-guide); pointer-events: none; }
  .ge-gap-line[data-hot] { background: var(--ge-guide-hot); }
  .ge-gap-line[data-hot][data-snap] { background: var(--ge-guide-snap); }
  .ge-gap-pin { width: 16px; height: 16px; color: var(--ge-ico3); cursor: pointer; pointer-events: auto; }
  .ge-gap-pin > .ge-gap-dot { position: absolute; left: 6px; top: 6.5px; display: block; }
  .ge-gap-pin > .ge-gap-add { position: absolute; left: -2px; top: -2px; display: grid; place-items: center; box-sizing: border-box; width: 20px; height: 20px; border-radius: 50%;
    background: var(--ge-bg); color: var(--ge-ico); box-shadow: 0 1px 3px light-dark(rgb(25 25 25 / 18%), rgb(0 0 0 / 45%)); opacity: 0; transform: scale(.6); transition: opacity .15s, transform .15s; }
  .ge-gap-pin > .ge-gap-add > svg { display: block; }
  .ge-gap-pin:hover > .ge-gap-dot { opacity: 0; }
  .ge-gap-pin:hover > .ge-gap-add { opacity: 1; transform: scale(1); }
  /* The arrow under a flowchart's gap line (the node's ::after, the kit's) dimmed while the line shows. */
  ol.doc-flow > li::after { transition: opacity .12s; }
  ol.doc-flow > li[data-ge-gap-dim]::after { opacity: .15; }
  @media (prefers-reduced-motion: reduce) { ol.doc-flow > li::after { transition: none; } }
`;
// A dot above each gap, in the handle's quietest gray; under the pointer it turns into a round + in
// the look of the editor's small floating buttons (a white disc, a hairline, a gray +), never a blue pin.
const DOT = '<svg class="ge-gap-dot" width="4" height="3" viewBox="0 0 4 3" aria-hidden="true"><path d="M3.5 1.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" fill="currentColor"/></svg>';
const PIN = '<span class="ge-gap-add"><svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1.75v8.5M1.75 6h8.5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg></span>';
const TAIL = 20; // right of the last column, the pin's gap
const ABOVE = 30; // the pin stands this far above the row: the gap reaches up to it
const DOUBLE = { time: 500, distance: 4 }; // two presses on a gap this soon and this near: a double click (ms, px)
const SNAP = 5; // px: how near the equal split or a tenth of the row a dragged gap snaps to it
const LIVE = 60000; // ms: the notice saying the shares stays while the drag lasts (it is taken off when it ends)

const percent = (ratios) => ratios.map((ratio) => `${Math.round(100 * ratio)}%`).join(" / ");
const same = (a, b) => a.every((ratio, index) => Math.abs(ratio - b[index]) < 0.0005);

/**
 * active(): whether the tools may show. struct(parents, touched, mutate): the editor's undoable
 * structural change (it records the columns' widths). look(elements, changes): the editor's undoable
 * change of blocks' looks (a flowchart's nodes' weights, history.mjs lookStep). say(text, kind, hold):
 * the bottom notice; settle(): the notice taken off.
 * What is resized is known by the page objects that say so: `columnOps` (a row's ratios, add(row,
 * index): a new column there) and `rowOps` (a row of nodes, its shares and weights).
 */
export function createColumnGaps({ active, struct, look, say, settle = () => {} }) {
  addStyle(STYLE);
  const { add, columnsOf, ratiosAfterResize, ratiosOf, setRatios, sized } = columnOps() ?? {};
  const { leastWidth, rowShares, rowsOfFlow, weightValue } = rowOps() ?? {};
  let hover = null; // { row, index, last, line, pin }: the gap after part `index` of `row` (last: right of the last column)
  let drag = null; // { row, index, start, before, least, ratios, snapped, span, x, line, told }

  // ---------- the kinds of row ----------
  // A row: { kind, el: the element holding it (a row of columns, a flowchart), parts: its parts in
  // order (columns, nodes) }.
  const KINDS = {
    columns: {
      label: "column", // what its overlays are listed as (overlays.mjs)
      live: (ratios) => t("栏宽：{0}", percent(ratios)), // the notice while a gap is dragged
      containers: kept(() => [...document.querySelectorAll(".doc-columns[data-ge-box]")]),
      // Its one row, side by side (a stacked one has no gaps).
      rows: (el) => (getComputedStyle(el).flexDirection.startsWith("column") ? [] : [columnsOf(el)]),
      pins: true,
      span: (row) => row.el.getBoundingClientRect().width || 1,
      ratios: (row) => ratiosOf(row.el),
      least: () => [],
      before: () => null,
      // Shown as each column's flex-grow (nothing written until the drag ends), then taken off.
      show: (row, ratios) => row.parts.forEach((column, at) => { column.style.flexGrow = String(100 * ratios[at]); }),
      reset: (row) => row.parts.forEach((column) => {
        column.style.removeProperty("flex-grow");
        if (column.getAttribute("style") === "") column.removeAttribute("style");
      }),
      write(row, ratios) {
        struct([row.el], [], () => {
          setRatios(row.el, ratios);
          return { touched: [], focus: null };
        });
        say(t("已调整栏宽：{0} · 双击竖线平分 · Ctrl+Z 撤销", percent(ratios)));
      },
      even(row) {
        if (!sized(row.el)) return;
        struct([row.el], [], () => {
          setRatios(row.el, null);
          return { touched: [], focus: null };
        });
        say(t("已平分栏宽 · Ctrl+Z 撤销"));
      },
    },
    flowchart: {
      label: "flowchart",
      live: (ratios) => t("节点宽度：{0}", percent(ratios)),
      containers: kept(() => [...document.querySelectorAll("ol.doc-flow[data-ge-box]:not([data-ge-keep])")]),
      // Its rows of two nodes or more, laid out in rows by the kit (one node a row has no gaps).
      rows: (el) => (getComputedStyle(el).flexDirection.startsWith("column") ? [] : rowsOfFlow(el).filter((steps) => steps.length > 1 && steps.every((step) => step.hasAttribute("data-ge-box")))),
      pins: false,
      // The shares are of the row's width less the gaps between its nodes (the kit's).
      span: (row) => (row.el.clientWidth - (parseFloat(getComputedStyle(row.el).columnGap) || FLOW_ROW.gap) * (row.parts.length - 1)) || 1,
      ratios: (row) => rowShares(row.parts),
      // A pixel to spare: the weights are written to three places, which may take a little off.
      least: (row, span) => row.parts.map((step) => (leastWidth(step) + 1) / span),
      before: (row) => row.parts.map((step) => step.style.getPropertyValue(FLOW_RATIO)),
      // Written on the nodes (the kit lays the row out again: its widths, the turning arrow from its
      // last node), then put back as they were.
      show: (row, ratios) => row.parts.forEach((step, at) => step.style.setProperty(FLOW_RATIO, weightValue(ratios[at]))),
      reset: (row, before) => row.parts.forEach((step, at) => {
        if (before[at]) step.style.setProperty(FLOW_RATIO, before[at]);
        else step.style.removeProperty(FLOW_RATIO);
        if (step.getAttribute("style") === "") step.removeAttribute("style");
      }),
      write(row, ratios) {
        look(row.parts, row.parts.map((_, at) => ({ sizes: { [FLOW_RATIO]: weightValue(ratios[at]) } })));
        say(t("已调整节点宽度：{0} · 双击竖线等宽 · Ctrl+Z 撤销", percent(ratios)));
      },
      even(row) {
        if (!row.parts.some((step) => step.style.getPropertyValue(FLOW_RATIO).trim() !== "")) return;
        look(row.parts, { sizes: { [FLOW_RATIO]: null } });
        say(t("这一行的节点已等宽 · Ctrl+Z 撤销"));
      },
    },
  };

  // Where the reader can reach: in the open modal dialog if there is one, else the page; shown, not
  // inert, not being dragged.
  function reachable(el) {
    const scope = document.querySelector("dialog[open]") ?? document.querySelector("main");
    return Boolean(scope?.contains(el)) && el.getClientRects().length > 0 && !el.closest("[inert], [data-ge-dragging]");
  }

  // The gap at (x, y), client coordinates: between two parts of a row, or right of a row of
  // columns' last column (only its pin); up to the pin above a row of columns.
  function gapAt(x, y) {
    for (const [name, kind] of Object.entries(KINDS)) {
      for (const el of kind.containers()) {
        const box = el.getBoundingClientRect();
        if (y < box.top - (kind.pins ? ABOVE : 0) || y > box.bottom || x < box.left - 2 || x > box.right + (kind.pins ? TAIL : 2) || !reachable(el)) continue;
        for (const parts of kind.rows(el)) {
          const rects = parts.map((part) => part.getBoundingClientRect());
          const top = kind.pins ? box.top : Math.min(...rects.map((rect) => rect.top));
          const bottom = kind.pins ? box.bottom : Math.max(...rects.map((rect) => rect.bottom));
          if (y < top - (kind.pins ? ABOVE : 0) || y > bottom) continue;
          for (let index = 0; index < rects.length; index++) {
            const last = index === rects.length - 1;
            if (last && !kind.pins) break;
            const left = rects[index].right;
            const right = last ? left + TAIL : rects[index + 1].left;
            if (x >= left && x <= right) return { row: { kind: name, el, parts }, index, last, inRow: y >= top };
          }
        }
      }
    }
    return null;
  }

  const kindOf = (row) => KINDS[row.kind];
  const sameRow = (a, b) => a.el === b.el && a.parts.length === b.parts.length && a.parts.every((part, index) => part === b.parts[index]);

  function hide() {
    if (!hover) return;
    hover.line.remove();
    hover.pin?.remove();
    hover.dimmed?.removeAttribute("data-ge-gap-dim");
    hover = null;
    document.documentElement.removeAttribute("data-ge-gap");
  }

  // The gap's line (none right of the last column: nothing to resize there) and a row of columns' pin.
  function show(at) {
    const kind = kindOf(at.row);
    if (!hover || !sameRow(hover.row, at.row) || hover.index !== at.index) {
      hide();
      const session = { row: at.row, index: at.index, last: at.last };
      const owner = at.row.el;
      session.line = own(element("div", { class: "ge-gap-line", "data-doc-dev": "" }), `${kind.label} gap`, { owner, alive: () => hover === session || drag?.line === session.line });
      if (kind.pins) {
        session.pin = own(element("div", { class: "ge-gap-pin", "data-doc-dev": "", html: DOT + PIN }), "column pin", { owner, alive: () => hover === session });
        tooltip(session.pin, t("新增分栏"));
        session.pin.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          event.stopImmediatePropagation();
        });
        session.pin.addEventListener("click", (event) => {
          event.preventDefault();
          const { row, index } = session;
          hide();
          add(row.el, index + 1);
        });
      } else {
        // The arrow from the node left of the gap to the one right of it, under the line: dimmed.
        session.dimmed = at.row.parts[at.index];
        session.dimmed.setAttribute("data-ge-gap-dim", "");
      }
      hover = session;
    }
    place(hover);
    if (at.inRow && !at.last) document.documentElement.setAttribute("data-ge-gap", "");
    else document.documentElement.removeAttribute("data-ge-gap");
    if (hover.last) hover.line.remove();
    hover.line.toggleAttribute("data-hot", kind.pins ? at.inRow : Boolean(drag));
  }

  // Where a gap's line and pin stand: down the middle of the gap, 8px in from the row's top and
  // bottom (a flowchart's row: its cards', the line starting 6px under the arrow across the gap, the
  // left node's ::after, so the arrow stays in sight, dimmed: the user, 2026-10-26); the pin above it.
  function place({ row, index, last, line, pin }) {
    const layer = layerOf(row.el);
    const rects = row.parts.map((part) => part.getBoundingClientRect());
    const box = kindOf(row).pins ? row.el.getBoundingClientRect() : { top: Math.min(...rects.map((rect) => rect.top)), bottom: Math.max(...rects.map((rect) => rect.bottom)) };
    const middle = last ? rects[index].right + TAIL / 2 : (rects[index].right + rects[index + 1].left) / 2;
    let top = box.top + 8;
    if (!kindOf(row).pins && !last) {
      const arrow = getComputedStyle(row.parts[index], "::after");
      const below = rects[index].top + parseFloat(arrow.top) + parseFloat(arrow.height) + 6;
      if (arrow.content !== "none" && Number.isFinite(below)) top = Math.max(top, below);
    }
    if (!last) drawBox(line, layer, { left: middle - 1, top, right: middle + 1, bottom: Math.max(top + 26, box.bottom - 8) });
    if (pin) drawBox(pin, layer, { left: middle - 8, top: box.top - 24, right: middle + 8, bottom: box.top - 8 });
  }

  // ---------- dragging a gap ----------

  function start(event, { row, index }) {
    const kind = kindOf(row);
    const span = kind.span(row);
    const begun = kind.ratios(row);
    drag = {
      row, index, start: begun, ratios: begun, span, x: event.clientX,
      before: kind.before(row),
      least: kind.least(row, span),
      line: hover?.line ?? null,
      snapped: false,
      told: null, // what the notice says now
    };
    hover?.pin?.remove();
    hover?.line.setAttribute("data-hot", "");
    row.el.setAttribute("data-ge-gap-drag", "");
    document.documentElement.setAttribute("data-ge-gap-drag", "");
    document.documentElement.setPointerCapture?.(event.pointerId);
    note(row.kind, `resize gap ${index}`);
    update(event.clientX);
  }

  // The two parts beside the gap as the pointer has moved (none until it has: a press alone changes
  // nothing), shown; the row's shares in the bottom notice (said again only when they change), the
  // line darkest where they snapped.
  function update(x) {
    const { row, index, start, span, least } = drag;
    const kind = kindOf(row);
    const moved = (x - drag.x) / span;
    drag.ratios = Math.abs(x - drag.x) < 1 ? start : ratiosAfterResize(start, index, moved, least, SNAP / span);
    drag.snapped = Math.abs(x - drag.x) >= 1 && !same(drag.ratios, ratiosAfterResize(start, index, moved, least, 0));
    if (same(drag.ratios, start)) kind.reset(row, drag.before);
    else kind.show(row, drag.ratios);
    drag.line?.toggleAttribute("data-snap", drag.snapped);
    const told = drag.told || Math.abs(x - drag.x) >= 1 ? kind.live(drag.ratios) : null; // a press alone says nothing
    if (told && told !== drag.told) say(told, "note", LIVE);
    drag.told = told ?? drag.told;
    // A row of columns is laid out again at once; a flowchart's by the kit, in a frame of its own
    // asked for as the weights are written (after this one's): the line placed again the frame after that.
    if (kind.pins) { if (hover) place(hover); }
    else requestAnimationFrame(() => requestAnimationFrame(() => { if (drag?.row === row && hover) place(hover); }));
  }

  function finish(commit) {
    if (!drag) return;
    const { row, start, ratios, before, line, told } = drag;
    const kind = kindOf(row);
    drag = null;
    note(row.kind, commit ? "gap released" : "gap cancelled");
    line?.removeAttribute("data-snap");
    if (told) settle(); // the shares dragged to: what is said next (or nothing) replaces them
    kind.reset(row, before);
    row.el.removeAttribute("data-ge-gap-drag");
    document.documentElement.removeAttribute("data-ge-gap-drag");
    hide();
    if (!commit || !row.el.isConnected || !row.parts.every((part) => part.isConnected) || same(ratios, start)) return;
    kind.write(row, ratios);
  }

  // ---------- events ----------

  document.addEventListener("pointermove", (event) => {
    // The row went (the page's own script took it away): the drag is over, nothing is written.
    if (drag) return drag.row.el.isConnected && drag.row.parts.every((part) => part.isConnected) ? update(event.clientX) : finish(false);
    if (hover?.pin?.contains(event.target)) return;
    const busy = !active() || event.buttons || document.documentElement.hasAttribute("data-ge-drag") || document.documentElement.hasAttribute("data-ge-resize") || event.target?.closest?.("[data-doc-dev]");
    const at = busy ? null : gapAt(event.clientX, event.clientY);
    if (at) show(at);
    else hide();
  }, { passive: true, capture: true });
  // A press in a gap drags it; a second press on the same gap soon after the first, the pointer where
  // it was (a double click), makes the row's parts equal again. Told by the presses themselves: the
  // first one's drag holds the pointer on the document element and its press is the tool's (no
  // mousedown follows it), so the browser counts no double click there.
  let lastPress = null; // { el, index, time, x, y }
  document.addEventListener("pointerdown", (event) => {
    if (drag || event.button !== 0 || !active() || event.target?.closest?.("[data-doc-dev]")) return;
    const at = gapAt(event.clientX, event.clientY);
    if (!at || !at.inRow || at.last) return;
    event.preventDefault(); // no caret, no text selection
    event.stopImmediatePropagation(); // nor a box selection, nor the editor's reaction to a press
    const twice = lastPress && lastPress.el === at.row.el && lastPress.index === at.index && event.timeStamp - lastPress.time < DOUBLE.time && Math.hypot(event.clientX - lastPress.x, event.clientY - lastPress.y) <= DOUBLE.distance;
    lastPress = twice ? null : { el: at.row.el, index: at.index, time: event.timeStamp, x: event.clientX, y: event.clientY };
    show(at);
    if (twice) kindOf(at.row).even(at.row);
    else start(event, at);
  }, true);
  document.addEventListener("pointerup", () => { if (drag) finish(true); }, true);
  endsGesture({ active: () => Boolean(drag), cancel: () => finish(false) });
  cancelOnEscape({ active: () => Boolean(drag), cancel: () => { finish(false); say(t("已取消调整")); } });
  addEventListener("scroll", () => { if (hover && !drag) place(hover); }, { passive: true, capture: true });

  return {
    /** Stop any resizing, take the gap's line and pin away. */
    hide() {
      if (drag) finish(false);
      hide();
    },
    /** Whether a gap is being dragged (a flowchart's row shows the weights dragged, not yet a step: commits wait). */
    get dragging() { return Boolean(drag); },
    /** The editor's UI nodes to keep in the top layer when a modal dialog opens. */
    get nodes() { return hover ? [hover.line, ...(hover.pin ? [hover.pin] : [])] : []; },
  };
}
