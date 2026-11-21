import { CARD, RAIL, TEXT_MOST } from "../../../shared/annotations.mjs";
import { Z } from "../../../shared/layers.mjs";
import { ICONS } from "../menu.mjs";
import { tooltip } from "../tooltip.mjs";
import { element } from "../ui.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// What 批注 draws on the page (docs/editor.md "Annotations"), in a layer of its own at the page's
// origin (it scrolls with the page natively), level `note` (shared/layers.mjs): with room, a card of
// each annotation right of the column (data-margin on the layer); with none, the marker of each in the
// column's right gutter and the card of the one shown by its words or blocks; and a block anchor's bar.
// The words an anchor holds are marked by two CSS highlights (no DOM change): ge-note, and ge-note-hot
// for the one shown; the blocks of the one shown are filled (fills.mjs).

// Our own drawing, on the editor's 20-unit grid: the speech bubble of components/icons.mjs filled, its
// two lines of text cut out: drawn by its fill alone (no stroke over it, which a translucent color
// would paint twice), as far out as the line version's stroke reaches, the cuts a line wide (SOLID_NOTE);
// the top bar's button is the same bubble in line (workbench components/icons.ts annotate).
const SOLID_NOTE = "M10 17.425A7.425 7.425 0 1 0 2.575 10v5.25a2.175 2.175 0 0 0 2.175 2.175zM7.5 8.325h5.5a.675 .675 0 1 1 0 1.35h-5.5a.675 .675 0 1 1 0-1.35zM7.5 11.325h3.5a.675 .675 0 1 1 0 1.35h-3.5a.675 .675 0 1 1 0-1.35z"; // the bubble filled for a 1.35 stroke, its lines cut out
const MARKER_ICON = `<svg viewBox="0 0 20 20" aria-hidden="true"><path fill-rule="evenodd" d="${SOLID_NOTE}"/></svg>`;

export const MARK = "ge-note";
export const HOT = "ge-note-hot";

export const STYLE = `
  ::highlight(${MARK}) { background-color: var(--ge-note); text-decoration: underline 2px var(--ge-note-line); }
  ::highlight(${HOT}) { background-color: var(--ge-note-hot); text-decoration: underline 2px var(--ge-note-hot-line); }
  .ge-note-layer { position: absolute; left: 0; top: 0; width: 0; height: 0; overflow: visible; z-index: ${Z.note}; pointer-events: none;
    font: 14px/22px ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", Helvetica, Arial, sans-serif; }
  .ge-note-layer > * { position: absolute; left: 0; top: 0; }
  .ge-note-layer svg { display: block; fill: none; stroke: currentColor; stroke-linecap: round; stroke-linejoin: round; }
  .ge-note-marker { width: ${RAIL.marker}px; height: ${RAIL.marker}px; box-sizing: border-box; margin: 0; padding: 0; border: 0; border-radius: var(--ge-r-small); background: transparent; display: grid; place-items: center; color: var(--ge-ico2); cursor: pointer; pointer-events: auto; }
  .ge-note-marker svg { width: 18px; height: 18px; fill: currentColor; stroke: none; }
  .ge-note-marker[hidden], .ge-note-card[hidden] { display: none; }
  .ge-note-marker[data-hot] { background: var(--ge-hover); color: var(--ge-ico); }
  /* The card, where the format bar would stand: a popover as the bar is, as wide as ${RAIL.card}px or the column. Its face is what shows; the card itself stands still, so a face going left under the pointer keeps it. */
  .ge-note-card { z-index: 1; width: ${RAIL.card}px; box-sizing: border-box; color: var(--ge-tx); pointer-events: auto; cursor: text; }
  /* A card (look.mjs: 14px round, --ge-shadow-card), in the margin as over the text. */
  .ge-note-face { position: relative; box-sizing: border-box; padding: 8px 12px; border-radius: var(--ge-r-card); background: var(--ge-bg); box-shadow: var(--ge-shadow-card); }
  /* In the margin: at rest a hairline on the page's own background, a shade under the pointer, the one in front no line and a shadow. They stand 10px from the column, so none goes left of its place (5px or 20px, from 32px out, would reach the text). They move down once they have been laid out (data-moves), never on the first paint. */
  .ge-note-layer[data-margin] .ge-note-card { z-index: 0; }
  .ge-note-layer[data-margin] .ge-note-card[data-front] { z-index: 1; }
  .ge-note-layer[data-moves] .ge-note-card { transition: top 350ms ease; }
  .ge-note-layer[data-margin] .ge-note-face { padding: 7px 11px; border: 1px solid var(--ge-line); background: var(--doc-bg); box-shadow: none; transition: background-color 200ms ease, box-shadow 200ms ease; }
  .ge-note-layer[data-margin] .ge-note-card:hover .ge-note-face { background: var(--ge-note-shade); }
  .ge-note-layer[data-margin] .ge-note-card[data-front] .ge-note-face { border-color: transparent; background: var(--ge-bg); box-shadow: var(--ge-shadow-card); }
  .ge-note-layer[data-margin][data-pressed] .ge-note-card { pointer-events: none; }
  /* In the margin a card's delete stands only while it can be used: under the pointer, the keys in the card, the card in front; always where nothing hovers. */
  .ge-note-layer[data-margin] .ge-note-delete { top: 6px; right: 6px; opacity: 0; transition: opacity 120ms ease; }
  .ge-note-layer[data-margin] .ge-note-card:is(:hover, :focus-within, [data-front]) .ge-note-delete { opacity: 1; }
  @media (hover: none) { .ge-note-layer[data-margin] .ge-note-delete { opacity: 1; } }
  .ge-note-layer[data-margin] .ge-note-card[data-last]::after { content: ""; position: absolute; top: 100%; left: 0; width: 1px; height: ${CARD.end}px; pointer-events: none; }
  @media (prefers-reduced-motion: reduce) {
    .ge-note-layer[data-moves] .ge-note-card, .ge-note-layer[data-margin] .ge-note-face, .ge-note-layer[data-margin] .ge-note-delete { transition: none; }
  }
  .ge-note-card textarea { display: block; width: calc(100% - 28px); height: 22px; min-height: 22px; max-height: 220px; box-sizing: border-box; margin: 0; padding: 0; border: 0; outline: none; resize: none; overflow: hidden;
    background: transparent; color: inherit; font: inherit; line-height: 22px; white-space: pre-wrap; overflow-wrap: anywhere; cursor: text; }
  .ge-note-card textarea::placeholder { color: var(--ge-tx3); opacity: 1; }
  .ge-note-card[data-long] textarea { overflow-y: auto; scrollbar-width: thin; }
  .ge-note-card[data-long] textarea { --top: 0px; --end: 0px; -webkit-mask-image: linear-gradient(transparent, #000 var(--top), #000 calc(100% - var(--end)), transparent); mask-image: linear-gradient(transparent, #000 var(--top), #000 calc(100% - var(--end)), transparent); }
  .ge-note-card[data-long]:not([data-end]) textarea { --end: 28px; }
  .ge-note-card[data-long][data-top] textarea { --top: 28px; }
  /* Its delete button, on the field's first line, in the room the field leaves it. */
  .ge-note-delete { position: absolute; top: 7px; right: 7px; width: 24px; height: 24px; box-sizing: border-box; margin: 0; padding: 0; border: 0; border-radius: 6px; background: transparent; display: grid; place-items: center; color: var(--ge-ico3); cursor: pointer; }
  .ge-note-delete svg { width: 18px; height: 18px; pointer-events: none; }
  .ge-note-bar { width: 2px; border-radius: 1px; background: var(--ge-note-line); }
  /* Acted on (gallery notes done): grey, as a resolved comment is quieter. */
  .ge-note-card[data-done] .ge-note-face { opacity: 0.55; }
  .ge-note-card[data-done] textarea { color: var(--ge-tx3); }
  .ge-note-marker[data-done] { color: var(--ge-ico3); opacity: 0.6; }
  .ge-note-bar[data-done] { opacity: 0.4; }
  .ge-note-card[data-done][data-front] .ge-note-face { opacity: 1; }
  .ge-note-bar[data-hot] { background: var(--ge-note-hot-line); }
  @media print {
    .ge-note-layer { display: none; }
    ::highlight(${MARK}), ::highlight(${HOT}) { background-color: transparent; text-decoration: none; }
  }
`;

export const layerNode = () => element("div", { class: "ge-note-layer", "data-doc-dev": "" });

export function markerNode(id) {
  return element("button", { type: "button", class: "ge-note-marker ge-icon-btn", "data-note": id, "aria-label": t("批注"), tabindex: "-1", html: MARKER_ICON });
}

/** A card: a plain-text field, and the button that deletes what it holds, on its face. */
export function cardNode() {
  const field = element("textarea", { rows: "1", spellcheck: "false", maxlength: TEXT_MOST, placeholder: t("写下建议…"), "aria-label": t("批注") });
  const erase = element("button", { type: "button", class: "ge-note-delete ge-icon-btn", "aria-label": t("删除批注"), tabindex: "-1", html: ICONS.trash });
  tooltip(erase, t("删除批注"));
  return { node: element("div", { class: "ge-note-card", role: "group" }, element("div", { class: "ge-note-face" }, field, erase)), field, erase };
}

export const barNode = () => element("div", { class: "ge-note-bar" });

/** The field as tall as its text (ten lines at most; then it scrolls, fading at its foot until its end and at its top once scrolled). Returns its height. */
export function fitField(card, field) {
  const scrolled = field.scrollTop;
  field.style.height = "22px";
  const height = Math.min(field.scrollHeight, 220);
  field.style.height = `${Math.max(22, height)}px`;
  field.scrollTop = scrolled;
  const long = field.scrollHeight > 222;
  card.toggleAttribute("data-long", long);
  card.toggleAttribute("data-end", !long || field.scrollTop + field.clientHeight >= field.scrollHeight - 2);
  card.toggleAttribute("data-top", long && field.scrollTop > 2);
  return Math.max(22, height);
}
