import { Z } from "../../shared/layers.mjs";

// The editor's bottom panels: the conflicts' (conflicts.mjs, left) and the lost texts' (notices.mjs,
// right) are the same card (look.mjs: a card, 14px round with --ge-shadow-card; 16px in), and the bar of the Agent's changes (changes/bar.mjs, in the middle, moved aside by the
// cards and over them only where there is no room beside them) is its
// buttons in a row: a small muted head with a red dot, items under it, the reader's words as
// a quote, one pale blue primary button, the rest with no line and no fill (gray under the pointer) or, looking
// only, quiet text: all of them the editor's one button look (look.mjs BUTTONS, ui.mjs textButton), none of
// their own here. No notice covers one: the page's own toast moves sideways to clear the cards as the bar
// does and stands above the bar, or above a card only where there is no room beside it (notices.mjs); the
// workbench's toast is told the room they take and stands above them.

const PANELS = ".ge-conflicts:not([hidden]), .ge-panel, .ge-changes:not([hidden])";

/**
 * How far from the window's bottom the highest bottom panel shown reaches, 0 with none shown: what a
 * notice stands above.
 */
export function panelRoom() {
  let room = 0;
  for (const panel of document.querySelectorAll(PANELS)) {
    const { top, height } = panel.getBoundingClientRect();
    if (height > 0) room = Math.max(room, Math.round(innerHeight - top));
  }
  return room;
}

// Who hears that the room the panels take may have changed: as a panel comes, changes size (cards
// added or answered), is hidden (收起) and goes.
const hearing = new Set();
const told = () => hearing.forEach((listener) => listener());
const sizes = typeof ResizeObserver === "function" ? new ResizeObserver(told) : null;

/** `listener` told whenever the room the bottom panels take may have changed. */
export const onPanels = (listener) => hearing.add(listener);

// The caret kept clear of the panels: while they take room at the window's bottom, the page's
// scroll-padding-bottom is that room and 8px (a sheet of the editor's own, data-doc-dev: no export holds
// it), so the browser following the caret after a key, and caret.mjs reveal(), which reads it, keep the
// line typed on above the conflict card, the lost texts and the bar of the Agent's changes, where it
// went under them on the window's last lines (a design review, 2026-11-17).
let clearing = null;
hearing.add(() => {
  if (typeof document === "undefined" || !document.head) return;
  const room = panelRoom();
  const css = room ? `html { scroll-padding-bottom: ${room + 8}px; }` : "";
  if (!clearing) {
    if (!css) return;
    clearing = document.createElement("style");
    clearing.dataset.docDev = "";
    clearing.dataset.geRoom = "";
    document.head.append(clearing);
  }
  if (clearing.textContent !== css) clearing.textContent = css;
});

/** A bottom panel put on the page. */
export function panelShown(panel) {
  sizes?.observe(panel);
  told();
}

/** A bottom panel moved up or down (the bar of the Agent's changes lifted over the others): the room may have changed. */
export const panelMoved = told;

/** A bottom panel taken off the page. */
export function panelGone(panel) {
  sizes?.unobserve(panel);
  told();
}
const BESIDE = 8; // px between a bottom panel and what stands beside it (the bar of the Agent's changes, a notice)
const SIDE = 16; // px between the window's side and a panel or what stands beside it

/**
 * Where something `width` wide on the bottom line stands among `panels` (rects, each with left and right) in
 * a page `view` wide less `room` on the right (a detail card holding the page still): the bar of the Agent's
 * changes (changes/bar.mjs) and the page's own notice (notices.mjs). { x } its middle in px when it stands
 * beside them, { x: null } when it stands in the middle of the page because no panel is closer than
 * BESIDE to it across, { x: null, blocked: [...] } the panels it has to stand above when no place beside
 * them is wide enough.
 */
export function barPlace(panels, view, room, width) {
  const middle = (view - room) / 2;
  const reaches = (panel, x) => panel.left - BESIDE < x + width / 2 && panel.right + BESIDE > x - width / 2;
  const blocked = panels.filter((panel) => reaches(panel, middle));
  if (!blocked.length) return { x: null };
  // The free stretches between the page's sides and the panels, each side and each panel kept clear.
  let free = [[SIDE, view - room - SIDE]];
  for (const panel of panels) {
    free = free.flatMap(([from, to]) => [[from, Math.min(to, panel.left - BESIDE)], [Math.max(from, panel.right + BESIDE), to]]).filter(([from, to]) => to > from);
  }
  let best = null;
  for (const [from, to] of free) {
    const low = from + width / 2;
    const high = to - width / 2;
    if (low > high) continue; // too narrow for it
    const x = Math.min(high, Math.max(low, middle));
    if (!best || Math.abs(x - middle) < Math.abs(best - middle)) best = x;
  }
  return best === null ? { x: null, blocked } : { x: best };
}

export const PANEL_STYLE = `
  :is(.ge-conflicts, .ge-panel) { position: fixed; bottom: 16px; z-index: ${Z.panel}; box-sizing: border-box; width: min(400px, calc(100vw - 32px)); max-height: min(70vh, 600px); overflow: auto; border-radius: var(--ge-r-card); background: var(--ge-bg); color: var(--ge-tx); box-shadow: var(--ge-shadow-card); font: 13px/1.55 var(--doc-sans-font, var(--doc-font, system-ui, sans-serif)); }
  .ge-conflicts { left: 16px; }
  .ge-panel { right: calc(16px + var(--doc-page-bar, 0px)); } /* in by the page's scrollbar room while a detail card holds the page still (the kit's dialog.css, --doc-page-bar) */
  .ge-conflicts[hidden] { display: none; }
  :is(.ge-conflicts-head, .ge-panel-head) { position: sticky; top: 0; z-index: 1; display: flex; align-items: center; gap: 8px; padding: 12px 10px 6px 16px; background: var(--ge-bg); color: var(--ge-tx2); font-size: 12px; font-weight: 500; }
  :is(.ge-conflicts-head, .ge-panel-head)::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; background: var(--ge-red); }
  :is(.ge-conflicts-head, .ge-panel-head) span { flex: 1; }
  :is(.ge-conflict, .ge-panel-item) { padding: 8px 16px 12px; }
  :is(.ge-conflict, .ge-panel-item) + :is(.ge-conflict, .ge-panel-item) { border-top: 1px solid var(--ge-edge); }
  :is(.ge-conflict, .ge-panel-item) p { margin: 0; font-weight: 500; }
  :is(.ge-conflict, .ge-panel-item) p + .ge-version { margin-top: 6px; }
  :is(.ge-conflicts, .ge-panel) .ge-version { margin: 0; padding: 0 0 0 10px; border-left: 2px solid var(--ge-quote); overflow-wrap: anywhere; }
  :is(.ge-conflicts, .ge-panel) .ge-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-top: 12px; }
  /* Its buttons the editor's (look.mjs, --ge-r-ctl), a little wider; the quiet ones 26 high. */
  :is(.ge-conflicts, .ge-panel) .ge-actions .ge-btn { padding: 0 10px; }
  :is(.ge-conflicts, .ge-panel) .ge-actions .ge-btn[data-quiet] { height: 26px; padding: 0 8px; }
`;
