import { note, onSettle, own } from "../../page/overlays.mjs";
import { drawBox, layerOf } from "../../page/overlay-layer.mjs";
import { tooltip } from "../../page/tooltip.mjs";
import { addStyle, element } from "../../page/ui.mjs";
import { IN_LAYER } from "../../../shared/layers.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// The round "+" that adds a node (the user's design, 2026-10-25): with the pointer on a node of
// a flowchart the page edits, a 22px round button stands centred on the node's right border at the
// card's vertical middle (the layer over the page draws it: overlay-layer.mjs, so it scrolls with
// the node and never touches the report's markup; above the handle and a section's bar there,
// IN_LAYER button, so the half of a row's last node's button over its section's bar is the
// button's), a white surface lifted by a soft shadow (no line round it) and a thin outline plus, the plus
// darker once the pointer is on it and the surface grey only while it is pressed (the editor's icon button
// look, look.mjs BUTTONS; flat: no blue). A click adds a node right
// after it (page.mjs addAfter: one undo step, the caret in its empty first line, bold armed); the
// press itself moves no caret and starts no box selection. It goes as the pointer leaves the node
// (and the button), as a drag or a box selection begins, and with any structural change that takes
// its node away.

const STYLE = `
  .ge-flow-add { z-index: ${IN_LAYER.button}; box-sizing: border-box; width: 22px; height: 22px; padding: 0; border: 0; border-radius: 50%;
    background: var(--doc-surface, #fff); color: var(--ge-ico2); cursor: pointer; pointer-events: auto; box-shadow: 0 1px 3px light-dark(rgb(25 25 25 / 18%), rgb(0 0 0 / 45%));
    opacity: 0; transition: opacity .12s, background-color .12s, color .12s; }
  .ge-flow-add[data-shown] { opacity: 1; }
  .ge-flow-add > svg { display: block; width: 14px; height: 14px; margin: 3px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }
  .ge-flow-add:hover { color: var(--ge-ico); }
  .ge-flow-add:active { background: light-dark(#ebebea, #404040); }
  @media (prefers-reduced-motion: reduce) { .ge-flow-add { transition: none; } }
`;
// The mock's thin plus (its place is a transform of the layer's: drawBox, so it fades in, no scale), on a 14-unit grid.
const PLUS = '<svg viewBox="0 0 14 14" aria-hidden="true"><path d="M7 3v8M3 7h8"/></svg>';
const SIZE = 22;

// The node of a flowchart the page edits under the pointer (the innermost: a flowchart in a node has
// nodes of its own), or null.
function nodeAt(target) {
  const step = target?.closest?.("main ol.doc-flow > li");
  const flow = step?.parentElement;
  if (!step || !flow?.hasAttribute("data-ge-box") || !step.hasAttribute("data-ge-box") || flow.hasAttribute("data-ge-keep")) return null;
  return step.closest("[inert], [data-ge-dragging]") ? null : step;
}

// active(): whether the tools may show (editing, no reload on its way). add(step): a node after it
// (page.mjs addAfter).
function createAddNode({ active, add }) {
  addStyle(STYLE);
  let shown = null; // { step, button }

  function hide() {
    if (!shown) return;
    shown.button.remove();
    shown = null;
  }

  // Its place: centred on the node's right border, at the card's vertical middle.
  function place({ step, button }) {
    const rect = step.getBoundingClientRect();
    const left = rect.right - SIZE / 2;
    const top = rect.top + rect.height / 2 - SIZE / 2;
    drawBox(button, layerOf(step), { left, top, right: left + SIZE, bottom: top + SIZE });
  }

  function show(step) {
    if (shown?.step === step) return place(shown);
    hide();
    const session = { step };
    session.button = own(element("button", { type: "button", class: "ge-flow-add", "data-doc-dev": "", "aria-label": t("在后面添加节点"), html: PLUS }), "flowchart add", {
      owner: step, alive: () => shown === session && step.isConnected,
    });
    tooltip(session.button, t("在后面添加节点"));
    session.button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopImmediatePropagation();
    });
    session.button.addEventListener("click", (event) => {
      event.preventDefault();
      hide();
      note("flowchart", "add node");
      add(step);
    });
    shown = session;
    place(session);
    requestAnimationFrame(() => { if (shown === session) session.button.setAttribute("data-shown", ""); });
  }

  document.addEventListener("pointermove", (event) => {
    if (shown?.button.contains(event.target)) return;
    const busy = !active() || event.buttons || document.documentElement.hasAttribute("data-ge-drag") || document.documentElement.hasAttribute("data-ge-resize") || document.documentElement.hasAttribute("data-ge-gap-drag");
    const step = busy ? null : nodeAt(event.target);
    if (step) show(step);
    else hide();
  }, { passive: true, capture: true });
  addEventListener("scroll", () => { if (shown) place(shown); }, { passive: true, capture: true });
  addEventListener("resize", () => { if (shown) place(shown); });
  // A structural change (a node added, deleted, moved; undo): drawn again where its node is, or gone with it.
  onSettle(() => {
    if (shown && !shown.step.isConnected) hide();
    else if (shown) place(shown);
  });

  return {
    hide,
    /** The editor's UI nodes to keep in the top layer when a modal dialog opens. */
    get nodes() { return shown ? [shown.button] : []; },
  };
}

/**
 * The "+" with what the editor gives it: active(), blocks() (the block tools) and the flowcharts' page
 * object (pages.flowchart: addAfter). It is a page object of its own, not part of page.mjs, whose
 * unit tests load it without a page: the overlays this module draws with watch one from their import.
 */
export function create({ active, blocks, pages }) {
  let adder = null;
  return {
    /** Set going once the block tools are there (editor.mjs boot). */
    install() {
      adder = createAddNode({ active, add: (step) => { blocks().clear(); pages.flowchart.addAfter(step); } });
    },
    /** The editor's UI nodes to keep in the top layer when a modal dialog opens. */
    get nodes() { return adder?.nodes ?? []; },
  };
}
