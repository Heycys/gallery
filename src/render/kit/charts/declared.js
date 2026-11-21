import { CHART_DATA } from "../../../shared/table-chart.mjs";
import { clear, isConfig, mounts } from "./core.js";
import { createBound } from "./from-table.js";

const global = globalThis;

// ---------- declared charts ----------
// A chart card declares its chart, of a type the report's script defines:
//   <div data-doc-chart="slope"><script type="application/json">…its data…</script></div>
// define(type, draw) draws it from the declared data, and define(type, { mount }) makes a part of the
// report's own that keeps what it needs (listeners, timers) until it is destroyed. A host with
// data-doc-chart-data="t1" holds no JSON: it is drawn from the rows of the table whose frame carries
// data-doc-chart-source="t1" (from-table.js), again whenever they change. The runtime (DocKit) starts
// declared charts once their type is defined, and those added later (an undo puts a card back); it
// destroys them when they leave the page. Nothing refers to them by id, so their cards can be
// deleted, copied and moved like any block; get() gives the handle of one (redraw, destroy).
const drawers = new Map(); // a report's own chart types: type -> draw, or a part ({ mount })

function declaredData(host) {
  try {
    return JSON.parse([...host.children].find(isConfig).textContent);
  } catch (error) {
    throw new Error(`DocCharts: the data of data-doc-chart="${host.dataset.docChart}" is not valid JSON (${error.message}).`);
  }
}

/** The runtime's handle of a declared chart on its host, or null (a type not defined yet, a host a script draws into). */
export function startDeclared(host, context) {
  const drawer = drawers.get(host.dataset.docChart);
  if (!drawer) return null;
  // Drawn from a table: its rows are its data.
  const make = (data) => (typeof drawer === "function" ? createDrawn(host, data, drawer, context) : createPart(host, data, drawer, context));
  if (host.hasAttribute(CHART_DATA)) return createBound(host, make, context);
  if (![...host.children].some(isConfig)) return null; // no JSON: a host a report's script draws into
  return make(declaredData(host));
}

// A chart of a report's own type: draw({ host, data, tokens, width, height }) draws into the
// emptied host, and again whenever its width, the theme or its card's height (--doc-chart-height,
// set in the preview; null otherwise) change, so the report never handles resizing itself.
// setData(data): drawn again with new data (a chart drawn from a table, when its rows change).
function createDrawn(host, data, draw, context) {
  host.classList.add("doc-chart");
  let destroyed = false;
  const render = () => {
    if (destroyed) return;
    context.frame(() => {
      if (destroyed) return;
      clear(host);
      draw(drawContext(host, data));
    });
  };
  render();
  const api = {
    redraw(nextData) {
      if (nextData !== undefined) data = nextData;
      render();
    },
    destroy: () => global.DocKit.destroy(host),
  };
  mounts.set(host, api);
  return {
    api,
    update: render,
    setData(next) {
      data = next;
      render();
    },
    destroy() {
      destroyed = true;
      if (mounts.get(host) === api) mounts.delete(host);
      clear(host);
    },
  };
}

// What a report's own chart is drawn with: its host, data, the theme's colors, its width and its
// card's plot height (--doc-chart-height, set in the preview; null otherwise).
function drawContext(host, data) {
  const card = parseFloat(getComputedStyle(host).getPropertyValue("--doc-chart-height"));
  return { host, data, tokens: global.DocTokens.read(host), width: host.clientWidth, height: card > 0 ? card : null };
}

// A part of a report's own type: mount({ ...drawContext, signal }) starts it in the emptied host and
// returns what it needs told: update(context) when its width, the theme or its card's height change
// (or a script redraws it, or its table's rows change), destroy() when its host leaves the page
// (signal aborts then too).
function createPart(host, data, part, context) {
  host.classList.add("doc-chart");
  clear(host);
  const made = part.mount({ ...drawContext(host, data), signal: context.signal }) ?? {};
  const update = () => context.frame(() => made.update?.({ ...drawContext(host, data), signal: context.signal }));
  const api = {
    redraw(nextData) {
      if (nextData !== undefined) data = nextData;
      update();
    },
    destroy: () => global.DocKit.destroy(host),
  };
  mounts.set(host, api);
  return {
    api,
    update,
    setData(next) {
      data = next;
      update();
    },
    destroy() {
      if (mounts.get(host) === api) mounts.delete(host);
      try {
        made.destroy?.();
      } finally {
        clear(host);
      }
    },
  };
}

export function define(type, draw) {
  if (typeof type !== "string" || !/^[a-z][a-z0-9-]*$/.test(type)) throw new Error("DocCharts.define: a chart type is lowercase letters, digits and hyphens, starting with a letter.");
  if (drawers.has(type)) throw new Error(`DocCharts.define: "${type}" is already defined.`);
  if (typeof draw !== "function" && typeof draw?.mount !== "function") throw new Error("DocCharts.define requires a draw function, or a part with a mount function.");
  drawers.set(type, draw);
  document.querySelectorAll("[data-doc-chart]").forEach((host) => {
    if (host.dataset.docChart === type) global.DocKit.mount(host);
  });
}
