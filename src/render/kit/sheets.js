(function initDocSheets(global) {
  "use strict";

  if (!global.DocState) throw new Error("DocSheets requires /kit/state.js to be loaded first.");
  if (!global.DocKit) throw new Error("DocSheets requires /kit/runtime.js to be loaded first.");

  // Sheets (docs/render.md, "Sheets"): a row of tabs and their panels, one shown, the chosen one kept
  // in a DocState (nothing beside the page, no copy of the tabs at its edge). The kit's runtime (DocKit) starts each area once the page has loaded, and those
  // added later (an undo puts one back): its tab is kept in a state named after its
  // data-doc-sheets (one per name); it destroys an area and its listeners when it leaves the page. A report's script may
  // ask an area which tab is shown, or show one (DocSheets.get).
  const mounts = new WeakMap();
  const FADE = 18; // the fade at an end of a row of tabs that scrolls (styles/sheets.css)
  const ownStates = new Map(); // an area's name -> the state its tab is kept in
  let sequence = 0;

  function resolveTarget(target) {
    if (typeof target === "string") return document.querySelector(target);
    return target instanceof Element ? target : null;
  }

  // An area, its tab kept in the state of its name.
  function start(root) {
    const tablist = root.querySelector(":scope > .doc-sheet-tabs");
    const tabs = tablist ? [...tablist.querySelectorAll(":scope > [data-sheet-tab]")] : [];
    const first = tabs[0]?.dataset.sheetTab;
    if (!first) return null;
    const name = root.getAttribute("data-doc-sheets") || "sheets";
    if (!ownStates.has(name)) ownStates.set(name, global.DocState.create({ id: `sheets-${name}`, version: 1, defaults: { sheet: first } }));
    return create(root, tablist, tabs, ownStates.get(name));
  }

  // The runtime's handle of an area: its API, and what takes it down.
  function create(root, tablist, tabs, state) {
    const panels = [...root.querySelectorAll(":scope > [data-doc-sheet]")];
    const ids = tabs.map((tab) => tab.dataset.sheetTab).filter(Boolean);
    if (!ids.length || ids.length !== tabs.length || new Set(ids).size !== ids.length || panels.length !== ids.length || ids.some((id) => panels.filter((panel) => panel.dataset.docSheet === id).length !== 1)) throw new Error("Sheets require unique tabs with matching panels.");
    const fallback = ids[0];
    const prefix = root.id || `doc-sheets-${++sequence}`;
    tabs.forEach((tab, index) => {
      const panel = panels.find((candidate) => candidate.dataset.docSheet === ids[index]);
      tab.id ||= `${prefix}-tab-${index}`;
      panel.id ||= `${prefix}-panel-${index}`;
      tab.setAttribute("aria-controls", panel.id);
      panel.setAttribute("role", "tabpanel");
      panel.setAttribute("aria-labelledby", tab.id);
    });
    tablist.setAttribute("role", "tablist");
    let current = ids.includes(state.get("sheet")) ? state.get("sheet") : fallback;

    function render(next = current) {
      current = ids.includes(next) ? next : fallback;
      tabs.forEach((tab) => {
        const active = tab.dataset.sheetTab === current;
        tab.classList.toggle("is-active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      });
      panels.forEach((panel) => {
        const active = panel.dataset.docSheet === current;
        panel.hidden = !active;
        panel.setAttribute("aria-hidden", String(!active));
      });
      root.dataset.activeSheet = current;
      showChosen();
    }

    // The chosen tab in view in its row, which scrolls where it is wider than its frame (styles/sheets.css:
    // no scrollbar, a fade at an end that hides more), clear of the fades; the row alone scrolls, the page
    // never moves for it.
    function showChosen() {
      const tab = tabs.find((each) => each.dataset.sheetTab === current);
      if (!tab || tablist.scrollWidth <= tablist.clientWidth + 1) return;
      const row = tablist.getBoundingClientRect();
      const box = tab.getBoundingClientRect();
      if (box.left < row.left + FADE) tablist.scrollLeft -= row.left + FADE - box.left;
      else if (box.right > row.right - FADE) tablist.scrollLeft += box.right - (row.right - FADE);
    }

    function select(next) {
      if (!ids.includes(next) || next === current) return;
      state.set("sheet", next);
    }

    function onClick(event) {
      select(event.currentTarget.dataset.sheetTab);
    }

    function onKeydown(event) {
      const index = tabs.indexOf(event.currentTarget);
      if (index < 0) return;
      let nextIndex = index;
      if (event.key === "ArrowRight") nextIndex = (index + 1) % tabs.length;
      else if (event.key === "ArrowLeft") nextIndex = (index - 1 + tabs.length) % tabs.length;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = tabs.length - 1;
      else return;
      event.preventDefault();
      tabs[nextIndex].focus({preventScroll:true});
      select(tabs[nextIndex].dataset.sheetTab);
    }

    tabs.forEach((tab) => {
      tab.setAttribute("role", "tab");
      tab.addEventListener("click", onClick);
      tab.addEventListener("keydown", onKeydown);
    });
    const unsubscribe = state.subscribe((snapshot) => render(snapshot.sheet));
    render(current);

    const api = Object.freeze({
      get: () => current,
      set: select,
      destroy: () => global.DocKit.destroy(root),
    });
    mounts.set(root, api);
    return {
      api,
      destroy() {
        unsubscribe();
        if (mounts.get(root) === api) mounts.delete(root);
        tabs.forEach((tab) => {
          tab.removeEventListener("click", onClick);
          tab.removeEventListener("keydown", onKeydown);
        });
      },
    };
  }

  global.DocSheets = Object.freeze({
    /** The area a selector or element finds: { get, set } its tab; null if it has not started. */
    get: (target) => mounts.get(resolveTarget(target)) ?? null,
  });
  global.ReportSheets = global.DocSheets; // its old name (before 2026-10-26), for a script no tool rewrote (shared/old-names.mjs)
  global.DocKit.component({ id: "sheets", mount: start });
})(globalThis);
