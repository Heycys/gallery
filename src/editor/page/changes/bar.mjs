import { t } from "../../../shared/i18n/index.mjs";
import { Z } from "../../../shared/layers.mjs";
import { PANEL_STYLE, barPlace, onPanels, panelGone, panelMoved, panelShown } from "../panel.mjs";
import { tooltip } from "../tooltip.mjs";
import { addStyle, element, fadeIn, fadeOut, mount, textButton } from "../ui.mjs";

// The bar of the Agent's changes (docs/editor.md "Agent's changes"), where they are reviewed: the third of
// the editor's bottom panels (panel.mjs), in the middle of the window's bottom, so that a notice
// stands above it as above the others. It says how many blocks the Agent added and changed (+) and
// changed and deleted (−), the numbers in the conflict card's green and red, each a switch of its own
// (the reader's, kept in the browser: shared/preferences.mjs showChangesAdded, showChangesRemoved; on, a
// pale green and a pale red fill, off, no fill, a gray under the pointer like any button; the number
// green or red either way, the user's 2026-11-12): the green one
// the marks of what was added or changed, the red one what was taken out, both off the page as the file
// has it, and offers 撤回 and 确认
// (the primary one: the pale blue), in the editor's one button look (look.mjs BUTTONS: no line, no fill
// until the pointer is on it). Reverted, it says so and offers
// 撤销 for UNDO_SHOWN.
//
// Where it stands: on the bottom line, 16px up like the panels, in the middle of the page. A conflict
// card at the left or the lost texts at the right that would reach under it (closer than 8px to it
// across) do not throw it up the page (the user's 2026-11-14, over the picture of two writing at once):
// it moves sideways, no further than it must, to the nearest place between the panels and the page's
// sides that clears each by 8px (barPlace): it rests against the card as the window narrows, follows
// the middle again, with no jump, once the middle clears the card. Only where no such place is wide
// enough for it does it stay in the middle and stand 8px above the panels under it (the window narrow,
// a phone). It is placed again as a panel comes, goes or changes size, as the window is resized and as
// a detail card holds the page still (a class on the root: --doc-page-bar narrows the page on the right),
// and says to the notices (panelMoved) when its top went up or down: a notice stands above it too. Once
// placed it glides sideways (180ms, the bar's own width never changes) rather than jumping; it comes in
// where it stands, and goes up or down at once (a notice reads its top as it is told).
//
// Its look (a design review the owner confirmed, 2026-11-17): the label, what the bar
// is, in the text's ink; a hairline between what changed (the two switches) and what to do about it (撤回,
// 确认); 44px high, its corners 14px (a card's, not a pill), the lighter shadow of a bar on the text
// (--ge-shadow-bar), its buttons 32 high and the switches 26, all at the controls' 8px corners. The numbers take an ink deeper than the marks' on their pale fills
// (--ge-diff-add-chip, --ge-diff-del-chip: 4.9:1 and 4.7:1), on and off alike. What a switch, 撤回 and 确认
// do is said by the editor's tooltip (tooltip.mjs), and to a screen reader by their names and descriptions.

const STYLE = `
  /* In the middle of the page, not of the window: less half the page's scrollbar room while a detail card holds the page still (the kit's dialog.css, --doc-page-bar). --ge-changes-x: where place() moved it to beside a panel (the middle of the bar, in px). */
  .ge-changes { position: fixed; left: var(--ge-changes-x, calc(50% - var(--doc-page-bar, 0px) / 2)); bottom: var(--ge-changes-bottom, 16px); transform: translateX(-50%); z-index: ${Z.panel};
    display: flex; align-items: center; gap: 6px; height: 44px; padding: 0 6px 0 16px; box-sizing: border-box; max-width: calc(100vw - 32px);
    border-radius: var(--ge-r-card); background: var(--ge-bg); color: var(--ge-tx); box-shadow: var(--ge-shadow-bar);
    font: 13px/1 var(--doc-sans-font, var(--doc-font, system-ui, sans-serif)); white-space: nowrap; }
  .ge-changes[hidden] { display: none; }
  .ge-changes[data-placed] { transition: left 180ms ease-out; }
  @media (prefers-reduced-motion: reduce) { .ge-changes[data-placed] { transition: none; } }
  .ge-changes-what { color: var(--ge-tx); }
  .ge-changes-count { display: inline-flex; align-items: center; gap: 4px; margin-left: 4px; }
  /* The hairline after the switches, 10px from them and from 撤回. */
  .ge-changes-count:not(:empty)::after { content: ""; flex: none; width: 1px; height: 18px; margin: 0 4px 0 6px; background: var(--ge-line); }
  /* 撤回, 确认 and 撤销 32px high, the switches 26 (the editor's buttons: look.mjs, their corners --ge-r-ctl). */
  .ge-changes > .ge-btn { height: 32px; padding: 0 12px; }
  .ge-changes .ge-changes-switch { height: 26px; min-width: 38px; padding: 0 9px; font-variant-numeric: tabular-nums; }
  /* Off, the number keeps its green or red (no fill, a gray under the pointer); on, the pale fill of its color behind it. */
  .ge-changes .ge-changes-plus { color: var(--ge-diff-add-chip); }
  .ge-changes .ge-changes-minus { color: var(--ge-diff-del-chip); }
  .ge-changes .ge-changes-plus[aria-pressed="true"] { background: var(--ge-diff-add-btn); }
  .ge-changes .ge-changes-plus[aria-pressed="true"]:is(:hover, :focus-visible) { background: var(--ge-diff-add-btn-hover); }
  .ge-changes .ge-changes-plus[aria-pressed="true"]:active { background: var(--ge-diff-add-btn-press); }
  .ge-changes .ge-changes-minus[aria-pressed="true"] { background: var(--ge-diff-del-btn); }
  .ge-changes .ge-changes-minus[aria-pressed="true"]:is(:hover, :focus-visible) { background: var(--ge-diff-del-btn-hover); }
  .ge-changes .ge-changes-minus[aria-pressed="true"]:active { background: var(--ge-diff-del-btn-press); }
  @media print { .ge-changes { display: none; } }
`;

export const UNDO_SHOWN = 6000; // how long a revert can be undone from the bar
const ABOVE = 8; // px between a bottom panel and the bar lifted over it
const BOTTOM = 16;

export { barPlace }; // (panel.mjs: the notice stands by the same rule)

/**
 * The bar: { counts(counts), reverted(left, undo), sync(), hide(), node }. revert(), accept(): what its
 * buttons do; shown(name): whether the switch of preference `name` (showChangesAdded, showChangesRemoved) is
 * on; toggle(name): what a press on it does (sync() then shows the new state).
 */
export function createBar({ revert, accept, shown, toggle }) {
  addStyle(PANEL_STYLE);
  addStyle(STYLE);
  let bar = null;
  let timer = 0;
  let lifted = BOTTOM;
  // Beside the bottom panels it would stand on, or above them where there is no room beside.
  const place = () => {
    if (!bar || bar.hidden) return;
    const root = document.documentElement;
    const room = parseFloat(getComputedStyle(root).getPropertyValue("--doc-page-bar")) || 0;
    const panels = [...document.querySelectorAll(".ge-conflicts:not([hidden]), .ge-panel")].map((panel) => panel.getBoundingClientRect()).filter((rect) => rect.height > 0);
    const { x, blocked = [] } = barPlace(panels, root.clientWidth, room, bar.offsetWidth);
    let lift = BOTTOM;
    for (const rect of blocked) lift = Math.max(lift, Math.round(innerHeight - rect.top) + ABOVE);
    if (x === null) bar.style.removeProperty("--ge-changes-x");
    else bar.style.setProperty("--ge-changes-x", `${x}px`);
    bar.style.setProperty("--ge-changes-bottom", `${lift}px`);
    // Its top is part of the room a notice stands above (panel.mjs): said again when it moved up or down.
    if (lift !== lifted) {
      lifted = lift;
      panelMoved();
    }
    // Placed once where it comes in: from now on it glides sideways (STYLE).
    if (!bar.hasAttribute("data-placed")) requestAnimationFrame(() => bar?.toggleAttribute("data-placed", !bar.hidden));
  };
  onPanels(place);
  addEventListener("resize", place, { passive: true });
  // A detail card holding the page still gives the page the room of its scrollbar on the right (--doc-page-bar), which no panel size says.
  if (typeof MutationObserver === "function") new MutationObserver(place).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  const made = () => {
    if (!bar) bar = mount(element("div", { class: "ge-changes", role: "region", "aria-label": t("Agent 的修改"), "aria-live": "polite", hidden: "" }));
    return bar;
  };
  // A switch: the number, on or off as the reader keeps it (aria-pressed), with what a press does in its tooltip and its name.
  const SWITCHES = {
    showChangesAdded: { kind: "plus", sign: "+", tip: (on, added, changed) => on
      ? t("新增 {0} 块、改动 {1} 块，已标成绿色。点一下不再标出", added, changed)
      : t("新增 {0} 块、改动 {1} 块，没有标出。点一下标成绿色", added, changed) },
    showChangesRemoved: { kind: "minus", sign: "−", tip: (on, removed, changed) => on
      ? t("删除 {0} 块、改动 {1} 块，删掉的内容标成红色显示在原处。点一下不再显示", removed, changed)
      : t("删除 {0} 块、改动 {1} 块，删掉的内容没有显示。点一下显示在原处", removed, changed) },
  };
  let numbers = { added: 0, changed: 0, removed: 0 };
  const says = (name) => {
    const { tip } = SWITCHES[name];
    const on = shown(name);
    return name === "showChangesAdded" ? tip(on, numbers.added, numbers.changed) : tip(on, numbers.removed, numbers.changed);
  };
  const aim = (node, name) => {
    node.setAttribute("aria-pressed", String(shown(name)));
    node.setAttribute("aria-label", says(name));
  };
  const switchOf = (name, count) => {
    const { kind, sign } = SWITCHES[name];
    const node = textButton(`${sign}${count}`, () => toggle(name), { class: `ge-changes-switch ge-changes-${kind}`, "data-switch": kind });
    aim(node, name);
    tooltip(node, () => says(name)); // read as it shows: the switch's state now
    return node;
  };
  // 撤回 and 确认: what they do in the tooltip, and to a screen reader as their description.
  const explained = (node, words) => {
    node.setAttribute("aria-description", words);
    return tooltip(node, words);
  };
  const show = (...children) => {
    clearTimeout(timer);
    const node = made();
    node.replaceChildren(...children);
    if (node.hidden) {
      fadeIn(node);
      panelShown(node);
    }
    place();
  };
  return {
    get node() { return bar; },
    counts({ added = 0, changed = 0, removed = 0 }) {
      const plus = added + changed;
      const minus = removed + changed;
      numbers = { added, changed, removed };
      show(
        element("span", { class: "ge-changes-what", text: t("Agent 已修改") }),
        element("span", { class: "ge-changes-count" },
          ...(plus ? [switchOf("showChangesAdded", plus)] : []),
          ...(minus ? [switchOf("showChangesRemoved", minus)] : [])),
        explained(textButton(t("撤回"), revert, { "data-action": "revert" }), t("撤回 Agent 的这些修改，你自己的修改会保留")),
        explained(textButton(t("确认"), accept, { primary: true, "data-action": "accept" }), t("保留这些修改，不再标出")),
      );
    },
    /** The switches as the reader keeps them now (pressed here, or in another page of the origin). */
    sync() {
      if (!bar) return;
      for (const [name, { kind }] of Object.entries(SWITCHES)) {
        const node = bar.querySelector(`.ge-changes-${kind}`);
        if (node) aim(node, name);
      }
    },
    // Reverted `left` ms ago at most: 撤销 offered until UNDO_SHOWN is over.
    reverted(left, undo) {
      show(
        element("span", { class: "ge-changes-what", text: t("已撤回 Agent 的修改") }),
        textButton(t("撤销"), undo, { "data-action": "undo" }),
      );
      timer = setTimeout(() => this.hide(), Math.max(0, left));
    },
    hide() {
      clearTimeout(timer);
      if (!bar || bar.hidden) return;
      const node = bar;
      fadeOut(node, 100, () => {
        node.removeAttribute("data-placed"); // shown again, it comes in where it stands
        panelGone(node);
      });
    },
  };
}
