import { clear, elementFor, mounts } from "./core.js";
import { define, startDeclared } from "./declared.js";

// The kit's charts (/kit/charts.js, an esbuild bundle of this folder; docs/render.md, "Charts"): the
// chart component of the kit's runtime (DocKit) and DocCharts, what a report's script may ask of it.
// Every chart is declared in its card (declared.js), of a type the report's script defines
// (DocCharts.define), drawn from the JSON it holds or from a table of the page (from-table.js); the
// kit gives it its host, the theme's colors, its size, and draws it again when they change. Needs
// /kit/runtime.js and /kit/tokens.js loaded first (a report whose script draws with D3 loads it too:
// the assets' list keeps it for a script that names d3).

const global = globalThis;

if (!global.DocTokens) throw new Error("DocCharts requires /kit/tokens.js to be loaded first.");
if (!global.DocKit) throw new Error("DocCharts requires /kit/runtime.js to be loaded first.");

global.DocCharts = Object.freeze({
  define,
  get: (target) => mounts.get(elementFor(target)) ?? null,
});
global.ReportCharts = global.DocCharts; // its old name (before 2026-10-26), for a script no tool rewrote (shared/old-names.mjs)

// A chart owns its host: what it draws there is its own, and an export of the view keeps only its
// data (the copy draws it again).
global.DocKit.component({
  id: "chart",
  when: "now",
  owns: true,
  on: ["resize", "theme", "layout"],
  mount: (host, context) => startDeclared(host, context),
  dehydrate: clear,
});
