import { Z } from "../shared/layers.mjs";
import { escapeMarkup } from "../shared/escape.mjs";
import { layoutNotesScript } from "../shared/qa-levels.mjs";
import { quickFailures } from "./pipeline.mjs";

// What the live preview says of a report's checks (docs/render.md, "Live preview"): the fast ones
// (structure, the components' markup, the shared tags, removed calls; not TypeScript or the chart
// declaration checks, which gallery check adds) run on every request for its page, and when any fails,
// a small note at the bottom left of the page lists them. The same note lists the kit's layout notes
// that gallery qa fails, as the page shows them (data-doc-layout, which the kit writes on what it
// drew and takes off again, one note a line, read as gallery qa reads them: layoutNotesOf,
// src/shared/qa-levels.mjs, at the window's width): data-missing, a chart drawn from a table whose
// table is gone or gives it nothing (which the full checks fail too), said in the UI's language
// (noteInWords; a chart's own line of why it drew nothing), the kit's words in the item's tooltip.
// The kit's other notes (a table's columns or rows out of its frame) are no failure and are not shown
// here: gallery qa reports them to the Agent. Preview only (data-doc-dev: no export and no edit takes it); the report still
// renders, and a draft that fails is saved as it is. The note's own words are Gallery's: Chinese as
// written here, English when the page's root says the UI is (data-ge-language, src/shared/i18n
// languageScript), which its script reads as it starts; the failures themselves are the checks'
// (English, for the Agent).

const LIMIT = 30;

const STYLE = `
[data-doc-dev].doc-checks { position: fixed; z-index: ${Z.checks}; left: 12px; bottom: 12px; max-width: min(520px, calc(100vw - 24px));
  font: 13px/1.5 system-ui, sans-serif; color: light-dark(#37352f, #e3e2e0); }
[data-doc-dev].doc-checks[hidden] { display: none; }
[data-doc-dev].doc-checks > summary { display: inline-flex; gap: 6px; align-items: center; padding: 4px 10px; border-radius: 999px; cursor: pointer;
  list-style: none; color: light-dark(#a1352b, #f19c92); background: light-dark(#fce9e7, #3b2321);
  box-shadow: 0 0 0 1px light-dark(rgb(161 53 43 / 18%), rgb(241 156 146 / 22%)); user-select: none; }
[data-doc-dev].doc-checks > summary::-webkit-details-marker { display: none; }
[data-doc-dev].doc-checks > div { margin-top: 6px; padding: 8px 12px; max-height: 50vh; overflow: auto; border-radius: 10px;
  background: light-dark(#ffffff, #252525); box-shadow: 0 0 0 1px light-dark(rgb(42 28 0 / 7%), #383836), 0 20px 24px light-dark(rgb(25 25 25 / 5%), rgb(0 0 0 / 20%)); }
[data-doc-dev].doc-checks ul { margin: 0; padding-left: 18px; }
[data-doc-dev].doc-checks li { margin: 2px 0; overflow-wrap: anywhere; }
[data-doc-dev].doc-checks p { margin: 6px 0 0; color: light-dark(#787774, #9b9a97); }
[data-doc-dev].doc-checks .doc-checks-live:not(:first-child) { margin-top: 8px; }
@media print { [data-doc-dev].doc-checks { display: none; } }`;

// In the page: the kit's layout notes that fail, an item each (an element's attribute holds one a
// line), with what it is on (a chart card by its title, a table by its caption, else its first
// column's header), kept in the note's list as they come and go; the note shows while it has a
// failure. It removes its own element, as the preview's other scripts do.
const WATCH = `(() => {
  document.currentScript.remove();
  ${layoutNotesScript()}
  const panel = document.querySelector("details.doc-checks[data-doc-dev]");
  if (!panel) return;
  const failures = Number(panel.dataset.failures) || 0;
  const live = panel.querySelector(".doc-checks-live ul");
  // The note's words in the UI's language (the root's data-ge-language).
  const english = document.documentElement.getAttribute("data-ge-language") === "en";
  const WORDS = english
    ? { card: "Figure", table: "Table", named: (kind, name) => kind + " “" + name + "”", first: (name) => "Table (first column “" + name + "”)", colon: ": ",
      failing: (count) => "Checks failed · " + count, more: (count) => count + " more", all: (slug) => "gallery check " + slug + " runs every check (TypeScript too)." }
    : { card: "图形", table: "表格", named: (kind, name) => kind + "「" + name + "」", first: (name) => "表格（首列「" + name + "」）", colon: "：",
      failing: (count) => "检查未通过 · " + count + " 项", more: (count) => "还有 " + count + " 项", all: (slug) => "gallery check " + slug + " 跑全部检查（含 TypeScript）。" };
  const more = panel.querySelector("[data-more]");
  if (more) more.textContent = WORDS.more(more.dataset.more);
  const all = panel.querySelector("[data-all]");
  if (all) all.textContent = WORDS.all(all.dataset.all);
  const tidy = (node) => (node?.textContent ?? "").replace(/\\s+/g, " ").trim().slice(0, 40);
  const what = (host) => {
    const card = host.closest("figure");
    const title = card?.querySelector(":scope > h3, :scope > figcaption");
    const table = host.closest(".doc-table-wrap, table");
    const caption = table?.querySelector("caption");
    const header = table?.querySelector("th");
    return title ? WORDS.named(WORDS.card, tidy(title)) : card ? WORDS.card : caption && tidy(caption) ? WORDS.named(WORDS.table, tidy(caption)) : header ? WORDS.first(tidy(header)) : host.localName;
  };
  // A chart that drew nothing says why in its card (the kit's line, in the same language): that line, else the note in words.
  const said = (host, name, note) => (name === "data-missing" && tidy(host.querySelector(".doc-chart-message"))) || noteInWords(note, { english });
  let shown = "";
  let frame = 0;
  const draw = () => {
    frame = 0;
    const notes = [...document.querySelectorAll("[data-doc-layout]")].filter((host) => !host.closest("[data-doc-dev]"))
      .flatMap((host) => layoutNotesOf(host.getAttribute("data-doc-layout"), document.documentElement.clientWidth)
        .filter(({ level }) => level === "fail")
        .map(({ note, name }) => ({ line: what(host) + WORDS.colon + said(host, name, note), note })));
    const key = notes.map(({ line }) => line).join("\\n");
    if (key === shown) return;
    shown = key;
    live.replaceChildren(...notes.map(({ line, note }) => Object.assign(document.createElement("li"), { textContent: line, title: note })));
    live.parentElement.hidden = notes.length === 0;
    const failing = failures + notes.length;
    panel.querySelector("summary").textContent = failing ? WORDS.failing(failing) : "";
    panel.hidden = failing === 0;
  };
  const later = (records) => {
    if (!globalThis.document?.defaultView) return; // the page is gone
    if (!frame && records.some((record) => !record.target.closest?.("[data-doc-dev]"))) frame = requestAnimationFrame(draw);
  };
  new MutationObserver(later).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-doc-layout"] });
  addEventListener("resize", () => { if (!frame) frame = requestAnimationFrame(draw); });
  draw();
})();`;

/**
 * The note of a report's preview: its failing fast checks listed, and a place for the kit's layout
 * notes that fail, which the page fills as they appear (hidden while it has none). `directory`: the
 * document's folder, where its files are (the workspace's <slug>/ by default).
 */
export function checkPanel(slug, html, metadata = {}, { directory } = {}) {
  const failures = quickFailures({ slug, html, metadata, ...(directory ? { directory } : {}) });
  const items = failures.slice(0, LIMIT).map((failure) => `<li>${escapeMarkup(failure)}</li>`).join("");
  // Written in Chinese; the page's script says them again in the UI's language (WATCH).
  const more = failures.length > LIMIT ? `<p data-more="${failures.length - LIMIT}">还有 ${failures.length - LIMIT} 项</p>` : "";
  const listed = failures.length ? `<ul>${items}</ul>${more}<p data-all="${escapeMarkup(slug)}">gallery check ${escapeMarkup(slug)} 跑全部检查（含 TypeScript）。</p>` : "";
  const live = `<div class="doc-checks-live" hidden><ul></ul></div>`; // a chart's data-missing, as the page draws it
  return `<details class="doc-checks" data-doc-dev data-failures="${failures.length}"${failures.length ? "" : " hidden"}><summary>${failures.length ? `检查未通过 · ${failures.length} 项` : ""}</summary><div>${listed}${live}</div><style>${STYLE}</style></details>
  <script data-doc-dev>${WATCH}</script>`;
}
