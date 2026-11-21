import { ICONS } from "../../page/menu.mjs";
import { own } from "../../page/overlays.mjs";
import { drawAt, shapeOf } from "../../page/overlay-layer.mjs";
import { keptByComponent } from "../../page/page-objects.mjs";
import { tooltip } from "../../page/tooltip.mjs";
import { addStyle, element, still } from "../../page/ui.mjs";
import { SHEETS } from "../kit.mjs";
import { TAB_ICON, iconKind, iconUrl, tabIconValue } from "../../../shared/emoji/icon-value.mjs";
import { panelFor, tabOf } from "./index.mjs";
import { newTab } from "./page.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// 选项卡 as pills, while the page is edited. A click
// on a tab not shown switches to it (sheets.js, as when reading); a click on the tab shown opens
// its menu below it (重命名, 删除: block-menu/), a second click closes it; the right button opens it
// on any tab, switching first. Pressing a tab and moving more than a few pixels drags it along its
// row (drag/: a tab stays in its row). With the pointer on a tab row, + stands after its last tab:
// a new tab "选项卡 N" at the end, shown and renamed at once (page.mjs newTab; one undo step). An
// empty tab shows a placeholder: a click there makes a paragraph in it (insert/ clickBlank)
// and blocks drop into it (drag/drop.mjs). Whenever a row's tabs change (+, deleting, moving, undo
// and redo), its area starts again (DocKit), so sheets.js knows them.

const STYLE = `
  [data-ge-editing] .doc-sheet-tab:focus-visible { outline: 2px solid var(--doc-accent, #2678d8); }
  .ge-layer > .ge-tab-add { pointer-events: auto; }
  .ge-tab-add { box-sizing: border-box; display: flex; align-items: center; justify-content: center; width: 28px; height: 28px; border-radius: 9999px; color: var(--ge-ico2); cursor: pointer; transition: background .1s ease-in-out; }
  .ge-tab-add:hover { background: var(--ge-hover); }
  .ge-tab-add:active { background: var(--ge-press); }
  .ge-tab-add svg { display: block; width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; }
  /* The tab whose menu is open: as the shown tab under the pointer. */
  [data-ge-editing] .doc-sheet-tab[data-ge-open] { background: light-dark(rgb(33 27 23 / 7.5%), rgb(255 255 255 / 8.25%)); }
  /* A tab being renamed (data-ge-renaming, page.mjs: no :has() on contenteditable, which made every
     host's contenteditable set as the page opens recalculate the page's style): a pill on a field's fill, the name a field. */
  [data-ge-editing] .doc-sheet-tab[data-ge-renaming] { padding: 0 8px; background: var(--ge-field); cursor: text; }
  [data-ge-editing] .doc-sheet-tab > [contenteditable="true"] { min-width: 1px; outline: none; -webkit-user-select: text; user-select: text; cursor: text; }
  /* An empty tab: a placeholder, a click makes a paragraph there. It takes the room of the
     empty paragraph the click makes (a line of body text, no margin: flow.css's panel edges), so
     nothing moves when it does; its fill under the pointer reaches 3px past the line, drawn as a
     shadow that takes no room. */
  [data-ge-editing] [data-doc-sheet]:not(:has(> *))::before { content: ${JSON.stringify(t("空白选项卡。点击或拖动区块到这里。"))}; display: block; border-radius: 1px; color: var(--ge-tx3); cursor: pointer; transition: background 20ms ease-in, box-shadow 20ms ease-in; }
  [data-ge-editing] [data-doc-sheet]:not(:has(> *)):hover::before { background: var(--ge-hover); box-shadow: 0 0 0 3px var(--ge-hover); }
`;

/**
 * The pills' page object (a module of its own, as this one needs a page to load in, which page.mjs does
 * not), with what the editor gives them: active() (whether block tools may show), struct (one undo
 * step of changes to the page's structure, history.mjs), say (a notice) and the Sheet area's page
 * object. Its blockTools(tools) is called by the block tools, which hold the rest: drag (drag/index.mjs),
 * menu (their menu card) and openMenu(tab, rect, side, { onClose }), the block menu (block-menu/).
 */
export function create({ active, struct, say, pages }) {
  const rename = (tab) => {
    const name = tabOf(tab);
    if (name) pages.sheets.start(name);
  };
  return { blockTools: ({ drag, menu, openMenu }) => tabPills({ active, drag, menu, openMenu, struct, rename, say }) };
}

function tabPills({ active, drag, menu, openMenu, struct, rename, say }) {
  addStyle(STYLE);
  let press = null; // a tab pressed: { tab, x, y, shown: its Sheet showed, dragged }
  let swallow = false; // the click ending a drag switches nothing
  let row = null; // the tab row + stands in

  const tabAt = (target) => (keptByComponent(target) ? null : target?.closest?.("main " + SHEETS.tabIn) ?? null);
  const openTab = () => document.querySelector(SHEETS.tabIn + "[data-ge-open]"); // the tab whose menu is open
  const keysOf = (area) => [...area.querySelectorAll(SHEETS.tabs)].map((tab) => tab.getAttribute(SHEETS.tabKey)).join(" ");

  // ---------- a press, a drag, the menu ----------

  document.addEventListener("pointerdown", (event) => {
    swallow = false;
    const tab = event.button === 0 && active() ? tabAt(event.target) : null;
    const open = tab && openTab();
    if (open && open !== tab) menu.close(); // another tab's menu goes; this one's closes on the click
    press = tab && { tab, x: event.clientX, y: event.clientY, shown: tab.getAttribute("aria-selected") === "true", dragged: false };
  }, true);
  document.addEventListener("pointermove", (event) => {
    if (!press) return;
    if (press.dragged) {
      if (drag.active) drag.move(event.clientX, event.clientY);
      return;
    }
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) <= 4) return;
    menu.close();
    if (drag.start(press.tab, event.clientX, event.clientY)) press.dragged = true;
    else press = null;
  }, true);
  document.addEventListener("pointerup", (event) => {
    const pressed = press;
    press = null;
    if (!pressed) return;
    if (pressed.dragged) {
      swallow = true;
      if (drag.active) drag.end(true);
      return;
    }
    if (!pressed.shown || tabAt(event.target) !== pressed.tab) return; // the click shows its Sheet (sheets.js)
    if (pressed.tab.hasAttribute("data-ge-open") && menu.isOpen) menu.close();
    else openFor(pressed.tab);
  }, true);
  document.addEventListener("pointercancel", () => {
    press = null;
    if (drag.active) drag.end(false);
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

  const add = element("div", { class: "ge-tab-add", role: "button", "aria-label": t("添加选项卡") });
  add.innerHTML = ICONS.plus;
  tooltip(add, t("添加选项卡"));
  add.addEventListener("pointerdown", (event) => event.preventDefault()); // the focus stays where it is
  add.addEventListener("click", (event) => {
    event.preventDefault();
    if (row?.isConnected) addTab(row);
  });

  // After the last tab of the row, or at the row's right end while its tabs run past it.
  function place() {
    const last = row?.isConnected && active() ? [...row.querySelectorAll(SHEETS.tabsOfRow)].at(-1) : null;
    const shape = last && shapeOf(row);
    if (!shape) return hideAdd();
    const tab = last.getBoundingClientRect();
    const right = row.getBoundingClientRect().right;
    const shown = row;
    own(add, "tab add", { owner: row, alive: () => row === shown && shown.isConnected });
    drawAt(add, shape.layer, Math.min(tab.right + 4, right - 28) - shape.origin.left, (tab.top + tab.bottom) / 2 - 14 - shape.origin.top);
  }
  function hideAdd() {
    row = null;
    add.remove();
  }
  document.addEventListener("mousemove", (event) => {
    if (add.contains(event.target)) return;
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
    const { tab, panel, key } = newTab(area, t("选项卡 {0}", tabs.length + 1));
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
    /** The editing stops (or the block tools go). */
    hide() {
      press = null;
      hideAdd();
    },
    get nodes() { return [add]; },
  };
}
