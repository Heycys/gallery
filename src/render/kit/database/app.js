// A database's drawing (index.js mounts it): its head (the views' tabs, a tab each, dragged into their order,
// a click switching to it or, on the one shown, opening its menu, as a right click does on any; the tools at
// the right: filter, sort, search and the view's settings), a note where it reads only, the filter bar, the
// view shown in its body (views.js: the layout's own module), a record's details (peek.js) and the words of a
// moment, the cards it opens in the layer of its own (ui/menu.js). It draws again what a change of the store
// touched (store.listen): the head and the bar are small and drawn whole, the view draws what its change
// says, a record's change its row alone.
import { isActive } from "./data/query.js";
import { uid } from "./data/values.js";
import { placeAcross, viewsWidth } from "./across.js";
import { createFilterBar } from "./filters.js";
import { LAYOUTS, createView, layoutLabel, viewName } from "./layouts.js";
import { createPeek } from "./peek.js";
import { openSettings } from "./settings.js";
import { attr, h, keyed, text, toggle, kids } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import { anyOpen, closeAll, heading, item, pop, refreshAll, sep } from "./ui/menu.js";
import { moveItem, startReorder } from "./ui/reorder.js";
import { makeView } from "./views.js";
import { w } from "./words.js";

const MENU = 250; // the width of Gallery's menus

/** The drawing of the database `store` holds: { element, update(), destroy() }. */
export function createDatabase(store) {
  const addView = h("button", { type: "button", class: "icon-btn tab-add", "aria-label": w("添加视图"), "data-doc-tip": w("添加视图") }, icon("plus", 16));
  const tabs = h("div", { class: "tabs", role: "tablist" }, addView);
  const filterButton = h("button", { type: "button", class: "icon-btn tool-filter" }, icon("filter", 17));
  const sortButton = h("button", { type: "button", class: "icon-btn tool-sort" }, icon("sort", 17));
  const searchButton = h("button", { type: "button", class: "icon-btn tool-search", "aria-label": w("搜索"), "data-doc-tip": w("搜索") }, icon("search", 17));
  const searchInput = h("input", { placeholder: w("输入并搜索…"), spellcheck: "false", "aria-label": w("搜索") });
  const searchClear = h("button", { type: "button", class: "icon-btn xs", "aria-label": w("清除搜索") }, icon("x", 12));
  const search = h("div", { class: "search" }, searchButton, searchInput, searchClear);
  const settingsButton = h("button", { type: "button", class: "icon-btn tool-settings", "aria-label": w("视图设置"), "data-doc-tip": w("视图设置") }, icon("sliders", 17));
  const tools = h("div", { class: "tools" }, filterButton, sortButton, search, settingsButton);
  const head = h("div", { class: "db-head" }, tabs, tools);
  const note = h("div", { class: "db-note", role: "note" }, icon("info", 16), h("span"));
  const body = h("div", { class: "db-body" });
  const root = h("div", { class: "db" }, head);

  let current = null; // the view drawn: { id, layout, view }
  let renaming = null; // the view whose tab's name is typed: { id, input, orig }
  let settings = null; // the settings card open
  let searchOpen = false;

  const db = {
    view: () => store.view,
    rows: () => store.rowsOf().rows,
    updateView: (patch, merge) => store.updateView(store.view.id, patch, merge),
    openRow: (id) => store.setUi({ peek: id }),
    closePeek: () => {
      store.flush();
      store.setUi({ peek: null });
    },
    openRowMenu,
    closeMenus: () => closeAll(store.layer),
    addRow: (prefill, options) => store.addRow(prefill, options),
    cycleSort,
    sortFromHeader,
    filterBy: (prop) => bar.filterBy(prop),
    addFilter: (anchor) => {
      store.setBarOpen(true);
      bar.addFilter(anchor ?? filterButton);
    },
    addSort: (anchor) => {
      store.setBarOpen(true);
      bar.addSort(anchor ?? sortButton);
    },
    canSort: () => store.view.layout !== "chart" && store.view.layout !== "calendar",
    canSearch: () => store.view.layout !== "chart",
    clearSearch,
    duplicateView,
    deleteView,
    openSettings: (start, anchor) => openViewSettings(start, anchor),
  };
  const bar = createFilterBar(store, db);
  const peek = createPeek(store, db);
  root.append(...kids(bar.element, body));

  // ---------- the head ----------
  function drawHead() {
    const shown = store.view;
    keyed(tabs, store.doc.views, (view) => view.id, makeTab, fillTab);
    if (store.editable) {
      if (tabs.lastElementChild !== addView) tabs.append(addView);
    } else addView.remove();
    const filters = shown.filters.some((filter) => store.byId[filter.prop]);
    const sorts = db.canSort() && shown.sorts.some((sort) => store.byId[sort.prop]);
    const open = store.barOpen();
    toggle(filterButton, "accent", filters);
    toggle(filterButton, "active", bar.card === "addFilter");
    const filterSaid = filters ? (open ? w("收起筛选条") : w("显示筛选条")) : w("筛选");
    attr(filterButton, "aria-label", filterSaid);
    attr(filterButton, "data-doc-tip", filterSaid);
    sortButton.hidden = !db.canSort();
    toggle(sortButton, "accent", sorts);
    toggle(sortButton, "active", bar.card === "addSort");
    const sortSaid = sorts ? (open ? w("收起筛选条") : w("显示筛选条")) : w("排序");
    attr(sortButton, "aria-label", sortSaid);
    attr(sortButton, "data-doc-tip", sortSaid);
    search.hidden = !db.canSearch();
    const words = store.ui.search;
    toggle(search, "open", searchOpen || Boolean(words));
    toggle(searchButton, "accent", Boolean(words));
    searchInput.hidden = !(searchOpen || words);
    searchClear.hidden = !words;
    if (document.activeElement !== searchInput && searchInput.value !== words) searchInput.value = words;
    toggle(settingsButton, "active", Boolean(settings?.open));
    edges();
  }

  function makeTab(view) {
    const tab = h("div", { class: "tab", role: "tab" }, h("span", { class: "tab-icon" }), h("span", { class: "tab-name" }));
    tab.addEventListener("mousedown", (event) => {
      if (event.button !== 0 || renaming?.id === tab.dataset.key || !store.editable) return;
      // A tab dragged sideways changes the views' order.
      const all = () => [...tabs.querySelectorAll(":scope > .tab")];
      startReorder(event, { axis: "x", index: all().indexOf(tab), items: all, onDrop: (from, to) => store.commit((d) => ({ ...d, views: moveItem(d.views, from, to) })) });
    });
    tab.addEventListener("click", () => pressTab(tab.dataset.key, tab));
    tab.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      pressTab(tab.dataset.key, tab, true);
    });
    tab.addEventListener("dblclick", () => {
      if (!store.editable) return;
      closeAll(store.layer);
      rename(tab.dataset.key);
    });
    return tab;
  }

  function fillTab(tab, view) {
    const on = view.id === store.view.id;
    toggle(tab, "on", on);
    attr(tab, "aria-selected", String(on));
    const glyph = tab.querySelector(".tab-icon");
    if (glyph.dataset.layout !== view.layout) {
      glyph.dataset.layout = view.layout;
      glyph.replaceChildren(...kids(icon(view.layout, 15)));
    }
    if (renaming?.id !== view.id) {
      const name = tab.querySelector(".tab-name") ?? h("span", { class: "tab-name" });
      if (!name.isConnected) tab.querySelector(".tab-input")?.replaceWith(name);
      text(name, viewName(view));
    }
  }

  // A tab pressed: another view shown; the one shown, its menu (a right click: its menu, whichever it is).
  function pressTab(id, tab, menu = false) {
    if (renaming?.id === id) return;
    if (id !== store.view.id) {
      switchView(id);
      tab = tabs.querySelector(`[data-key="${CSS.escape(id)}"]`) ?? tab;
      reveal(tab, !menu);
      if (!menu) return;
    } else reveal(tab, false);
    if (store.editable) tabMenu(id, tab);
  }

  // A tab pressed that stands partly past the row's edge, or under its fade there (database.css: .tabs.more-start,
  // .more-end, 24px), is brought in whole: the row slides to it (`glide`), at once where a menu is opened from it.
  function reveal(tab, glide) {
    if (!tab?.isConnected) return;
    const box = tabs.getBoundingClientRect();
    const at = tab.getBoundingClientRect();
    const fade = 24;
    const by = at.left < box.left + fade ? at.left - box.left - fade : at.right > box.right - fade ? at.right - box.right + fade : 0;
    if (Math.abs(by) < 1) return;
    const calm = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    tabs.scrollBy({ left: by, behavior: glide && !calm ? "smooth" : "instant" });
  }

  function tabMenu(id, tab) {
    const view = store.doc.views.find((each) => each.id === id);
    if (!view) return;
    pop(store.layer, tab, {
      width: 200,
      build: (card, api) => card.append(...kids(
        item({ icon: "edit", label: w("重命名"), onClick: () => { api.close(); rename(id); } }),
        item({ icon: "sliders", label: w("编辑视图"), onClick: () => { api.close(); openViewSettings(); } }),
        item({ icon: "copy", label: w("复制视图"), onClick: () => { api.close(); duplicateView(view); } }),
        store.doc.views.length > 1 ? [sep(), item({ icon: "trash", label: w("删除视图"), danger: true, onClick: () => { api.close(); deleteView(view); } })] : null,
      )),
    });
  }

  // A tab's name typed where it stands: written a character at a time (one step of undo), Esc giving back what it was.
  function rename(id) {
    const tab = tabs.querySelector(`[data-key="${CSS.escape(id)}"]`);
    const view = store.doc.views.find((each) => each.id === id);
    if (!tab || !view) return;
    if (id !== store.view.id) switchView(id);
    const merge = `view-name-${id}`;
    const input = h("input", { class: "tab-input", value: view.name ?? "", placeholder: layoutLabel(view.layout), spellcheck: "false" });
    renaming = { id, input, orig: view.name ?? "" };
    const name = tab.querySelector(".tab-name");
    name.replaceWith(input);
    const write = () => {
      const now = store.doc.views.find((each) => each.id === id);
      if (now && input.value.trim() !== (now.name ?? "")) store.updateView(id, { name: input.value.trim() }, merge);
    };
    const end = (keep = true) => {
      if (renaming?.input !== input) return;
      if (!keep && input.value.trim() !== renaming.orig) {
        input.value = renaming.orig;
        write();
      }
      renaming = null;
      store.flush();
      input.replaceWith(name);
      drawHead();
    };
    input.addEventListener("input", (event) => { if (!event.isComposing) write(); });
    input.addEventListener("compositionend", write);
    input.addEventListener("mousedown", (event) => event.stopPropagation());
    input.addEventListener("click", (event) => event.stopPropagation());
    input.addEventListener("blur", () => end(true));
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Enter") { event.preventDefault(); input.blur(); }
      if (event.key === "Escape") { event.preventDefault(); end(false); }
    });
    input.focus();
    input.select();
  }

  // The tabs' row fades at an end past which tabs lie (none of a bounce at the ends: the stylesheet): by where its
  // first and last tabs stand against its edge, not by how far it scrolls, as its padding scrolls too and a fade
  // over the last tab while only that padding is past the edge would hide what is all there; the + after them, shown
  // under the pointer alone, is no tab, so that a row whose tabs all fit is not faded for it.
  function edges() {
    const box = tabs.getBoundingClientRect();
    const pad = parseFloat(getComputedStyle(tabs).paddingLeft) || 0;
    const all = tabs.querySelectorAll(":scope > .tab");
    const first = all[0], last = all[all.length - 1];
    toggle(tabs, "more-start", !!first && first.getBoundingClientRect().left < box.left + pad - 1);
    toggle(tabs, "more-end", !!last && last.getBoundingClientRect().right > box.right - pad + 1);
  }
  tabs.addEventListener("scroll", edges, { passive: true });
  const tabsSize = new ResizeObserver(() => edges());
  tabsSize.observe(tabs);

  addView.addEventListener("click", () => {
    pop(store.layer, addView, {
      // The layouts as a grid of cards (the view settings' 布局's look: the user's 2026-11-24), one pressed making a view of it.
      build: (card, api) => card.append(...kids(heading(w("添加视图")), h("div", { class: "layout-grid add-view-grid" }, LAYOUTS.map((layout) => h("button", { type: "button", class: "layout-btn", on: { click: () => {
        api.close();
        let made = "";
        store.commit((d) => {
          const result = createView(d, layout);
          made = result.id;
          return result.doc;
        });
        if (!made) return;
        switchView(made);
        // A new view opens its settings at once: its name, its layout.
        requestAnimationFrame(() => openViewSettings("newView"));
      } } }, icon(layout, 20), h("span", null, layoutLabel(layout))))))),
    });
  });

  // ---------- the tools ----------
  filterButton.addEventListener("click", () => {
    const view = store.view;
    if (view.filters.some((filter) => store.byId[filter.prop])) {
      store.setBarOpen(!store.barOpen());
      bar.close();
    } else db.addFilter(filterButton);
    drawHead();
  });
  sortButton.addEventListener("click", () => {
    const view = store.view;
    if (view.sorts.some((sort) => store.byId[sort.prop])) {
      store.setBarOpen(!store.barOpen());
      bar.close();
    } else db.addSort(sortButton);
    drawHead();
  });
  searchButton.addEventListener("click", () => {
    searchOpen = true;
    drawHead();
    searchInput.focus();
  });
  searchInput.addEventListener("input", () => store.setUi({ search: searchInput.value }));
  searchInput.addEventListener("blur", () => {
    if (!store.ui.search) {
      searchOpen = false;
      drawHead();
    }
  });
  searchInput.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Escape" && !event.isComposing) {
      event.preventDefault();
      clearSearch();
      searchInput.blur();
    }
  });
  searchClear.addEventListener("click", () => clearSearch());
  settingsButton.addEventListener("click", () => {
    if (settings?.open) settings.close();
    else openViewSettings();
  });

  function openViewSettings(start, anchor = settingsButton) {
    settings?.close();
    settings = openSettings(store, db, { anchor, start, onClose: () => { settings = null; toggle(settingsButton, "active", false); } });
    toggle(settingsButton, "active", true);
  }

  function clearSearch() {
    searchOpen = false;
    searchInput.value = "";
    store.setUi({ search: "" });
  }

  // ---------- the views ----------
  function switchView(id) {
    if (id === store.view.id) return;
    closeAll(store.layer);
    store.flush();
    searchOpen = false;
    store.switchView(id);
  }

  function duplicateView(view) {
    const copy = { ...structuredClone(view), id: uid("v"), name: w("{0} 副本", viewName(view)) };
    store.commit((d) => {
      const views = [...d.views];
      views.splice(d.views.findIndex((each) => each.id === view.id) + 1, 0, copy);
      return { ...d, views };
    });
    switchView(copy.id);
    store.snack(w("已复制视图，改动不会影响原视图"));
  }

  function deleteView(view) {
    if (store.doc.views.length < 2) return;
    const at = store.doc.views.findIndex((each) => each.id === view.id);
    const next = store.doc.views[at === 0 ? 1 : at - 1];
    if (view.id === store.view.id) switchView(next.id);
    store.commit((d) => ({ ...d, views: d.views.filter((each) => each.id !== view.id) }));
    store.snack(w("已删除视图「{0}」，数据不受影响", viewName(view)));
  }

  /** A header's arrow: none, ascending, descending, none; where there was no rule the bar stays shut (the sort button blue). */
  function cycleSort(propId) {
    const view = store.view;
    const found = view.sorts.find((sort) => sort.prop === propId);
    quietBar();
    if (!found) db.updateView({ sorts: [...view.sorts, { prop: propId, dir: "asc" }] });
    else if (found.dir === "asc") db.updateView({ sorts: view.sorts.map((sort) => (sort.prop === propId ? { ...sort, dir: "desc" } : sort)) });
    else db.updateView({ sorts: view.sorts.filter((sort) => sort.prop !== propId) });
  }

  function sortFromHeader(sorts) {
    quietBar();
    db.updateView({ sorts });
  }

  // A rule set from a header where the view had none: the bar stays shut, the button says there is one.
  function quietBar() {
    const view = store.view;
    if (!view.filters.some((filter) => store.byId[filter.prop]) && !view.sorts.some((sort) => store.byId[sort.prop])) store.setBarOpen(false);
  }

  function openRowMenu(rowId, anchor) {
    if (!store.editable) return;
    pop(store.layer, anchor, {
      width: 200,
      build: (card, api) => card.append(...kids(
        item({ icon: "copy", label: w("创建副本"), onClick: () => { api.close(); store.duplicateRow(rowId); } }),
        sep(),
        item({ icon: "trash", label: w("删除"), danger: true, onClick: () => { api.close(); store.deleteRows([rowId]); } }),
      )),
    });
  }

  // ---------- the body ----------
  function drawBody(change) {
    const view = store.view;
    const { rows } = store.rowsOf(view);
    const filtering = view.filters.some((filter) => isActive(filter, store.byId[filter.prop])) || Boolean(store.ui.search);
    const none = rows.length === 0 && store.doc.rows.length > 0 && filtering;
    if (none) {
      if (current) {
        current.view.destroy();
        current = null;
      }
      body.replaceChildren(...kids(noMatch(view)));
      return;
    }
    if (!current || current.id !== view.id || current.layout !== view.layout) {
      current?.view.destroy();
      current = { id: view.id, layout: view.layout, view: makeView(store, db, view.layout) };
      body.replaceChildren(...kids(current.view.element));
      current.view.update();
    } else current.view.update(change);
    if (store.ui.focusRow && current.view.focusRow?.(store.ui.focusRow) !== false) store.ui.focusRow = null;
  }

  function noMatch(view) {
    const filtered = view.filters.some((filter) => isActive(filter, store.byId[filter.prop]));
    return h("div", { class: "empty-state" }, icon("search", 26), h("div", null, w("没有符合条件的记录")),
      h("div", { class: "row gap" },
        filtered ? h("button", { type: "button", class: "btn sm", on: { click: () => db.updateView({ filters: store.view.filters.filter((filter) => filter.segments).map((filter) => ({ ...filter, value: [] })) }) } }, w("清除筛选")) : null,
        store.ui.search ? h("button", { type: "button", class: "btn sm", on: { click: clearSearch } }, w("清除搜索")) : null));
  }

  // ---------- the words of a moment ----------
  let snackShown = null;
  function drawSnack() {
    const said = store.ui.snack;
    if (!said) {
      snackShown?.remove();
      snackShown = null;
      return;
    }
    if (snackShown?.dataset.at === String(said.at)) return;
    snackShown?.remove();
    snackShown = h("div", { class: "snack", role: "status", "data-at": String(said.at) }, h("span", null, said.words));
    store.layer.append(snackShown);
    // In the top layer: over a record's details too.
    snackShown.setAttribute("popover", "manual");
    try {
      snackShown.showPopover();
    } catch {
      snackShown.removeAttribute("popover");
    }
  }

  function drawNote() {
    // Where it reads only though the page takes edits: why, under its head (no note at all otherwise).
    const said = store.locked;
    if (!said) return void note.remove();
    text(note.lastElementChild, said);
    if (note.previousElementSibling !== head) head.after(note);
  }

  // ---------- each change ----------
  function update(change = {}) {
    drawHead();
    drawNote();
    bar.draw();
    drawBody(change);
    peek.update(change);
    drawSnack();
    toggle(store.layer.parentElement, "is-editable", store.editable);
    place();
  }

  // 宽多维表格: the drawing as wide as its table views would be, whichever view shows, past the text's edges
  // (across.js); again as the look, the page's width or the window change.
  function place() {
    placeAcross(store.host, store.layer.parentElement, viewsWidth(store, current?.view));
  }
  let placing = 0;
  const onResize = () => {
    cancelAnimationFrame(placing);
    placing = requestAnimationFrame(place);
  };
  addEventListener("resize", onResize);
  const stop = store.listen((change) => {
    update(change);
    // A card that shows what changed (a filter's, the settings, a column's) draws it again, its field kept.
    if (anyOpen(store.layer)) refreshAll(store.layer);
  });

  return {
    element: root,
    update,
    place,
    /** Its records' bodies changed (a slot made or taken away): the record open drawn again around its own. */
    bodies: () => peek.bodies(),
    destroy() {
      stop();
      removeEventListener("resize", onResize);
      cancelAnimationFrame(placing);
      tabsSize.disconnect();
      closeAll(store.layer);
      current?.view.destroy();
      peek.destroy();
      snackShown?.remove();
    },
  };
}
