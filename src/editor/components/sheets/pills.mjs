import { placeBefore } from "../../page/core.mjs";
import { cancelOnEscape, endsGesture, gestureLock } from "../../page/gesture.mjs";
import { ICONS } from "../../page/menu.mjs";
import { note, own } from "../../page/overlays.mjs";
import { drawAt, shapeOf } from "../../page/overlay-layer.mjs";
import { keptByComponent } from "../../page/page-objects.mjs";
import { tooltip } from "../../page/tooltip.mjs";
import { addStyle, element, still } from "../../page/ui.mjs";
import { SHEETS } from "../kit.mjs";
import { TAB_ICON, iconKind, iconUrl, tabIconValue } from "../../../shared/emoji/icon-value.mjs";
import { along, placeInRow } from "../../../shared/drag-place.mjs";
import { panelFor, tabOf } from "./index.mjs";
import { newTab } from "./page.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// 选项卡 as pills, while the page is edited. A click
// on a tab not shown switches to it (sheets.js, as when reading); a click on the tab shown opens
// its menu below it (重命名, 删除: block-menu/), a second click closes it; the right button opens it
// on any tab, switching first. Pressing a tab and moving more than a few pixels drags it along its
// row, as a database's view tabs move: it lifts and follows the pointer, the others making way (one
// gives way as the dragged tab's leading edge passes its middle: src/shared/drag-place.mjs), and
// let go it takes its new place (one undo step), each tab sliding there from where it stood; no block
// is selected for it. With the pointer on a tab row, a round + stands after its last tab: a new tab
// "选项 N" at the end, shown and renamed at once (page.mjs newTab; one undo step). An empty tab shows
// a placeholder: a click there makes a paragraph in it (insert/ clickBlank) and blocks drop into it
// (drag/drop.mjs). Whenever a row's tabs change (+, deleting, moving, undo and redo), its area starts
// again (DocKit), so sheets.js knows them.

// How the tabs a dragged one passes make way, and how each slides to its place once it is let go.
const EASE = "transform .18s cubic-bezier(.2, 0, 0, 1)";
const OVERSHOOT = 6; // how far a dragged tab goes past the first or the last
const ADD = 28; // the + (round)
const FADE = 120; // + fading in and out (ms)

const STYLE = `
  [data-ge-editing] .doc-sheet-tab:focus-visible { outline: 2px solid var(--doc-accent, #2678d8); }
  /* +: as a database's + after its view tabs (database.css .icon-btn.tab-add): a round icon button,
     no fill till the pointer is on it, the menu's icon color, a 16px + of a 1.25px stroke; it fades in
     as it comes and out as it goes. */
  .ge-layer > .ge-tab-add:not([data-ge-going]) { pointer-events: auto; }
  .ge-tab-add { box-sizing: border-box; display: grid; place-items: center; width: ${ADD}px; height: ${ADD}px; border-radius: 50%; color: var(--doc-menu-icon); cursor: pointer; transition: background-color 100ms ease-out; animation: ge-tab-add-in ${FADE}ms; }
  .ge-tab-add:hover { background: var(--doc-hover); }
  .ge-tab-add:active { background: var(--doc-press); }
  .ge-tab-add svg { display: block; width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.5625; stroke-linecap: round; }
  @keyframes ge-tab-add-in { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .ge-tab-add { animation: none; } }
  /* The tab whose menu is open: as the shown tab under the pointer. */
  [data-ge-editing] .doc-sheet-tab[data-ge-open] { background: light-dark(rgb(33 27 23 / 7.5%), rgb(255 255 255 / 8.25%)); }
  /* A tab dragged along its row: lifted on the page's floating fill, a hairline ring and a soft shadow
     (a database's view tab's look as it moves), over the others. Its row scrolls, so it clips: while a
     tab is dragged the row takes 8px of room round its tabs, its margins (styles/sheets.css) 8px less,
     so nothing moves and nothing of the lift is cut. */
  ${gestureLock("data-ge-tab-drag", { cursor: "grabbing", select: true })}
  [data-ge-editing] .doc-sheet-tabs[data-ge-moving] { padding: 8px; margin: 8px 8px 6px; }
  [data-ge-editing] .doc-sheet-shell--plain > .doc-sheet-tabs[data-ge-moving] { max-width: calc(100% + 16px); margin: -8px -8px 6px; }
  [data-ge-editing] .doc-sheet-tab[data-ge-tab-lifted] { position: relative; z-index: 1; background: var(--doc-float-fill); box-shadow: 0 0 0 1px var(--doc-border), 0 2px 6px rgb(15 15 15 / 14%); }
  /* A tab being renamed (data-ge-renaming, page.mjs: no :has() on contenteditable, which made every
     host's contenteditable set as the page opens recalculate the page's style): a pill on a field's fill, the name a field. */
  [data-ge-editing] .doc-sheet-tab[data-ge-renaming] { padding: 0 8px; background: var(--ge-field); cursor: text; }
  [data-ge-editing] .doc-sheet-tab > [contenteditable="true"] { min-width: 1px; outline: none; -webkit-user-select: text; user-select: text; cursor: text; }
  /* An empty tab: a placeholder, a click makes a paragraph there. It takes the room of the
     empty paragraph the click makes (a line of body text, no margin: flow.css's panel edges), so
     nothing moves when it does; under the pointer its words are lit, a fill as wide as they are that
     reaches 3px past them, round, its ring a shadow that takes no room. */
  [data-ge-editing] [data-doc-sheet]:not(:has(> *))::before { content: ${JSON.stringify(t("点击输入内容，或把块拖到这里"))}; display: block; width: fit-content; max-width: 100%; border-radius: 3px; color: var(--ge-tx3); cursor: pointer; transition: background 20ms ease-in, box-shadow 20ms ease-in; }
  [data-ge-editing] [data-doc-sheet]:not(:has(> *)):hover::before { background: var(--ge-hover); box-shadow: 0 0 0 3px var(--ge-hover); }
`;

/**
 * The pills' page object (a module of its own, as this one needs a page to load in, which page.mjs does
 * not), with what the editor gives them: active() (whether block tools may show), struct (one undo
 * step of changes to the page's structure, history.mjs), say (a notice) and the Sheet area's page
 * object. Its blockTools(tools) is called by the block tools, which hold the rest: menu (their menu
 * card), openMenu(tab, rect, side, { onClose }), the block menu (block-menu/), and clearSelection().
 */
export function create({ active, struct, say, pages }) {
  const rename = (tab) => {
    const name = tabOf(tab);
    if (name) pages.sheets.start(name);
  };
  const renamed = () => pages.sheets.field; // the name being renamed (a text field then), or null
  return { blockTools: ({ menu, openMenu, clearSelection }) => tabPills({ active, menu, openMenu, clearSelection, struct, rename, renamed, say }) };
}

function tabPills({ active, menu, openMenu, clearSelection, struct, rename, renamed, say }) {
  addStyle(STYLE);
  let press = null; // a tab pressed: { tab, x, y, shown: its Sheet showed, dragged }
  let moving = null; // a tab dragged along its row: { tab, row, tabs, rects, from, to, x, step }
  let swallow = false; // the click ending a drag switches nothing
  let row = null; // the tab row + stands in

  const tabAt = (target) => (keptByComponent(target) ? null : target?.closest?.("main " + SHEETS.tabIn) ?? null);
  const openTab = () => document.querySelector(SHEETS.tabIn + "[data-ge-open]"); // the tab whose menu is open
  const keysOf = (area) => [...area.querySelectorAll(SHEETS.tabs)].map((tab) => tab.getAttribute(SHEETS.tabKey)).join(" ");

  // ---------- a press, a drag, the menu ----------

  // A press on the tab being renamed is its name's (a text field's: selecting its words), no drag.
  document.addEventListener("pointerdown", (event) => {
    swallow = false;
    const pressed = event.button === 0 && active() ? tabAt(event.target) : null;
    const field = renamed();
    const tab = pressed && !(field && pressed.contains(field)) ? pressed : null;
    const open = tab && openTab();
    if (open && open !== tab) menu.close(); // another tab's menu goes; this one's closes on the click
    press = tab && { tab, x: event.clientX, y: event.clientY, shown: tab.getAttribute("aria-selected") === "true", dragged: false };
  }, true);
  document.addEventListener("pointermove", (event) => {
    if (!press) return;
    if (press.dragged) {
      if (moving) follow(event.clientX);
      return;
    }
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 4) return;
    menu.close();
    if (!lift(press.tab, press.x)) {
      press = null;
      return;
    }
    press.dragged = true;
    follow(event.clientX);
  }, true);
  document.addEventListener("pointerup", (event) => {
    const pressed = press;
    press = null;
    if (!pressed) return;
    if (pressed.dragged) {
      swallow = true;
      drop(true);
      return;
    }
    if (!pressed.shown || tabAt(event.target) !== pressed.tab) return; // the click shows its Sheet (sheets.js)
    if (pressed.tab.hasAttribute("data-ge-open") && menu.isOpen) menu.close();
    else openFor(pressed.tab);
  }, true);
  document.addEventListener("pointercancel", () => {
    press = null;
    drop(false);
  }, true);
  document.addEventListener("click", (event) => {
    if (!swallow) return;
    swallow = false;
    event.preventDefault();
    event.stopPropagation();
  }, true);
  document.addEventListener("contextmenu", (event) => {
    const tab = active() ? tabAt(event.target) : null;
    if (!tab) return;
    event.preventDefault();
    if (tab.getAttribute("aria-selected") !== "true") tab.click();
    openFor(tab);
  }, true);
  // Esc, the window losing the focus or the page hidden: the tab goes back to its place (the click
  // after the release still switches nothing).
  cancelOnEscape({ active: () => Boolean(moving), cancel: () => drop(false) });
  endsGesture({ active: () => Boolean(moving), cancel: () => drop(false) });

  // ---------- a tab dragged along its row ----------

  // The tab pressed lifts (false: it cannot move, and the status line says why), the blocks selected
  // let go (a drag of a tab selects nothing). Where each tab of its row stands is measured once, and
  // how far the others make way: its width and the gap after it.
  function lift(tab, x) {
    const at = tab.parentElement;
    if (!at?.hasAttribute("data-ge-box")) {
      say(t("这个{0}不能移动。", t("选项卡")));
      return false;
    }
    const tabs = [...at.querySelectorAll(SHEETS.tabsOfRow)];
    const from = tabs.indexOf(tab);
    if (from < 0) return false;
    hideAdd();
    clearSelection();
    at.setAttribute("data-ge-moving", "");
    const rects = tabs.map((each) => each.getBoundingClientRect());
    const [own, next, previous] = [rects[from], rects[from + 1], rects[from - 1]];
    const gap = next ? next.left - own.right : previous ? own.left - previous.right : 4;
    moving = { tab, row: at, tabs, rects, from, to: from, x, step: own.width + Math.max(0, gap) };
    tab.setAttribute("data-ge-tab-lifted", "");
    tab.style.transition = "none";
    for (const each of tabs) if (each !== tab) each.style.transition = still() ? "none" : EASE;
    document.documentElement.setAttribute("data-ge-tab-drag", "");
    note("tab drag", `start ${tab.getAttribute(SHEETS.tabKey) ?? ""}`);
    return true;
  }

  // The tab follows the pointer along its row, no further than a little past its first and last
  // tabs; its place among the others goes by the tab itself (its leading edge past a tab's middle,
  // src/shared/drag-place.mjs), and those it passes make way.
  function follow(x) {
    const { tab, tabs, rects, from, step } = moving;
    const own = rects[from];
    const shift = Math.max(rects[0].left - own.left - OVERSHOOT, Math.min(rects.at(-1).right - own.right + OVERSHOOT, x - moving.x));
    tab.style.transform = `translateX(${shift}px)`;
    const to = placeInRow(rects.map((rect) => along(rect, "x")), from, { start: own.left + shift, end: own.right + shift });
    moving.to = to;
    tabs.forEach((each, index) => {
      if (index === from) return;
      const by = from < to && index > from && index <= to ? -step : from > to && index >= to && index < from ? step : 0;
      each.style.transform = by ? `translateX(${by}px)` : "";
    });
  }

  // Let go (commit) or given up: the tab put down at its new place, one undo step, or back at its
  // own; each tab slides there from where it stood. Idempotent.
  function drop(commit) {
    if (!moving) return;
    const { tab, row: at, tabs, from, to } = moving;
    moving = null;
    document.documentElement.removeAttribute("data-ge-tab-drag");
    const seen = new Map(tabs.map((each) => [each, each.getBoundingClientRect()]));
    for (const each of tabs) {
      each.style.transition = "none";
      each.style.transform = "";
    }
    tab.removeAttribute("data-ge-tab-lifted");
    at.removeAttribute("data-ge-moving");
    const others = tabs.filter((each) => each !== tab);
    const moves = commit && to !== from && at.isConnected && tabs.every((each) => each.parentElement === at);
    note("tab drag", moves ? "dropped" : commit ? "released in place" : "cancelled");
    if (moves) {
      struct([at], [], () => {
        placeBefore(at, [tab], others[to] ?? null);
        return { touched: [], focus: null };
      });
      say(t("已移动选项卡 · Ctrl+Z 撤销"));
    } else if (!commit) say(t("已取消移动"));
    slide(tabs, seen);
  }

  // Each tab slides from where it stood (`seen`) to where it is, once the area has started again;
  // then what the slide wrote on it goes (a tab dragged or put down again meanwhile is the later one's).
  let slides = 0;
  const slidBy = new WeakMap(); // tab -> the last slide it took part in
  function slide(tabs, seen) {
    const run = ++slides;
    for (const each of tabs) slidBy.set(each, run);
    const tidy = () => {
      for (const each of tabs) {
        if (slidBy.get(each) !== run || moving?.tabs.includes(each)) continue;
        each.style.removeProperty("transition");
        each.style.removeProperty("transform");
        if (each.getAttribute("style") === "") each.removeAttribute("style");
      }
    };
    if (still()) return tidy();
    requestAnimationFrame(() => {
      if (moving) return tidy();
      for (const each of tabs) {
        if (slidBy.get(each) !== run) continue;
        const before = seen.get(each);
        if (!each.isConnected) continue;
        const now = each.getBoundingClientRect();
        const [dx, dy] = [before.left - now.left, before.top - now.top];
        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) continue;
        each.style.transition = "none";
        each.style.transform = `translate(${dx}px, ${dy}px)`;
        void each.offsetWidth;
        each.style.transition = EASE;
        each.style.transform = "";
      }
      setTimeout(tidy, 220);
    });
  }

  // Its menu below it, the tab drawn held (data-ge-open) while it is open.
  function openFor(tab) {
    const rect = tab.getBoundingClientRect();
    hideAdd();
    openMenu(tab, { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, null, {
      onClose: () => tab.removeAttribute("data-ge-open"),
    });
    tab.setAttribute("data-ge-open", "");
  }

  // ---------- + ----------

  const add = element("div", { class: "ge-tab-add", role: "button", "aria-label": t("添加选项卡"), html: ICONS.plus });
  tooltip(add, t("添加选项卡"));
  let going = null; // + fading as it goes (its animation), till it is taken off
  add.addEventListener("pointerdown", (event) => event.preventDefault()); // the focus stays where it is
  add.addEventListener("click", (event) => {
    event.preventDefault();
    if (row?.isConnected) addTab(row);
  });

  // After the last tab of the row, or at the row's right end while its tabs run past it. Put in its
  // layer it fades in (styles above); one fading as it goes comes back as it is.
  function place() {
    const last = row?.isConnected && active() ? [...row.querySelectorAll(SHEETS.tabsOfRow)].at(-1) : null;
    const shape = last && shapeOf(row);
    if (!shape) return hideAdd();
    if (going) {
      going.cancel();
      going = null;
      add.removeAttribute("data-ge-going");
    }
    const tab = last.getBoundingClientRect();
    const right = row.getBoundingClientRect().right;
    const shown = row;
    own(add, "tab add", { owner: row, alive: () => (row === shown && shown.isConnected) || Boolean(going) });
    drawAt(add, shape.layer, Math.min(tab.right + 4, right - ADD) - shape.origin.left, (tab.top + tab.bottom) / 2 - ADD / 2 - shape.origin.top);
  }
  // + fades as it goes (taken off at once where motion is reduced), no longer taking the pointer.
  function hideAdd() {
    row = null;
    if (!add.isConnected || going) return;
    if (still() || !add.animate) return add.remove();
    add.setAttribute("data-ge-going", "");
    const fade = add.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE, easing: "ease-out" });
    going = fade;
    fade.onfinish = () => {
      if (going !== fade) return;
      going = null;
      add.removeAttribute("data-ge-going");
      add.remove();
    };
  }
  document.addEventListener("mousemove", (event) => {
    if (moving || add.contains(event.target)) return;
    const over = active() && !openTab() && !keptByComponent(event.target) ? event.target.closest?.("main " + SHEETS.rowAt) ?? null : null;
    if (over === row) return;
    row = over;
    if (row) place();
    else hideAdd();
  }, { passive: true, capture: true });
  addEventListener("scroll", (event) => { if (row && event.target === row) place(); }, { passive: true, capture: true });
  document.documentElement.addEventListener("mouseleave", hideAdd);

  // A new tab at the end of the row: shown, its name selected to type over (one undo step).
  function addTab(at) {
    const area = at.parentElement;
    const tabs = [...at.querySelectorAll(SHEETS.tabsOfRow)];
    const last = tabs.at(-1);
    const after = last && panelFor(last);
    if (!after) return;
    const { tab, panel, key } = newTab(area, t("选项 {0}", tabs.length + 1));
    menu.close();
    struct([at, area], [], () => {
      last.after(tab);
      after.after(panel);
      return { touched: [], focus: null };
    });
    restart(area, key);
    at.scrollTo?.({ left: at.scrollWidth, behavior: still() ? "instant" : "smooth" });
    place();
    rename(tab);
    say(t("已添加选项卡 · 输入名称后按 Enter · Ctrl+Z 撤销"));
  }

  // ---------- the areas follow their tabs ----------

  const mounted = new WeakMap(); // area -> the keys of its tabs when it last started here
  function restart(area, show = null) {
    mounted.set(area, keysOf(area));
    const kit = globalThis.DocKit;
    if (!kit) return;
    kit.destroy(area);
    kit.mount(area);
    if (show) globalThis.DocSheets?.get(area)?.set(show);
  }
  new MutationObserver((records) => {
    const areas = new Set(records.map((record) => record.target).filter((node) => node.nodeType === 1 && node.matches(SHEETS.row)).map((node) => node.parentElement));
    for (const area of areas) if (area?.isConnected && area.matches(SHEETS.match) && mounted.get(area) !== keysOf(area)) restart(area);
    if (row) place();
  }).observe(document.querySelector("main") ?? document.body, { childList: true, subtree: true });
  // A tab's emoji, set or taken away: its picture (the server's image of it, as render/emoji.mjs
  // gives it when the page is served).
  new MutationObserver((records) => {
    for (const { target: tab } of records) {
      if (!tab.getAttribute?.(SHEETS.tabKey)) continue;
      const icon = tab.getAttribute("data-tab-icon");
      if (iconKind(icon) === "emoji") tab.style.setProperty(TAB_ICON, tabIconValue(iconUrl(icon)));
      else tab.style.removeProperty(TAB_ICON);
      if (tab.getAttribute("style") === "") tab.removeAttribute("style");
    }
  }).observe(document.querySelector("main") ?? document.body, { attributes: true, attributeFilter: ["data-tab-icon"], subtree: true });

  return {
    /** Whether a node is a tab of a row or +: a press there is theirs. */
    holds: (node) => Boolean(tabAt(node)) || add.contains(node),
    /** The editing stops (or the block tools go): a tab dragged goes back to its place. */
    hide() {
      press = null;
      drop(false);
      hideAdd();
    },
    get nodes() { return [add]; },
    /** A tab is dragged along its row: the handle steps aside meanwhile. */
    get busy() { return Boolean(moving); },
  };
}
