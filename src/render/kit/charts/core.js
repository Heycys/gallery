// What every chart host is handled with (docs/render.md, "Charts"): the host a script names, the
// chart on it (mounts), the data a declared chart keeps in it, emptying it before a drawing, and the
// layout notes the kit writes on it.

/** Each host's chart, as the report's script sees it (DocCharts.get). */
export const mounts = new WeakMap();

export function elementFor(target) {
  const element = typeof target === "string" ? document.querySelector(target) : target;
  if (!(element instanceof Element)) throw new Error("DocCharts target was not found.");
  return element;
}

// A declared chart (declared.js) keeps its data in a <script type="application/json"> child of its
// host: drawing replaces everything else there, and its layout notes (writeLayoutNotes) go with the
// drawing they were about, so a chart destroyed, or one whose drawing failed midway, says nothing
// about what it no longer shows.
export const isConfig = (node) => node.tagName === "SCRIPT" && node.type === "application/json";
export function clear(host) {
  host.replaceChildren(...[...host.children].filter(isConfig));
  host.removeAttribute("data-doc-layout");
}

// A chart's layout notes (docs/render.md, "Charts"): "<kind>: <message>" each, on its host as
// data-doc-layout (the preview and the QA tool read them), written again with every drawing and gone
// when there is nothing to say: a chart drawn from a table that draws nothing (from-table.js) says
// why there ("data-missing: …").
export function writeLayoutNotes(host, notes) {
  if (notes.length > 0) host.setAttribute("data-doc-layout", notes.join("\n"));
  else host.removeAttribute("data-doc-layout");
}
