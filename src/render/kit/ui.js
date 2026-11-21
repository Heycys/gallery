import { PACKAGE_MARK } from "../../shared/components/installed.mjs";
import { MENTION_ICON } from "../../shared/components/mention.mjs";
import { keptGrammars } from "../../shared/code-grammars.mjs";
import { PICTURE_QUALITY, encodePicture, lighter, pictureCeiling, pictureTask } from "../../shared/export-pictures.mjs";
import { cssReferences, cssWithAddresses } from "../../shared/css-references.mjs";
import { COPY_DATA, EXPORT_CSP, isolateUmd, scriptText, styleText } from "../../shared/export-wrap.mjs";
import { fromFile, hosted, pageAddress, workbenchHash } from "../../shared/page-address.mjs";
import { LOOK_ATTRIBUTES, lookOf, setLookOn } from "../../shared/document-look.mjs";
import { sayDisplay as say } from "./words.js";

(function initReportUI() {
  "use strict";

  // A document's page (main.doc-page) gets the reader's display settings below; a custom page
  // (main.gallery-page: src/render/page-html.mjs) the theme alone, as a workbench or the system says
  // it, no button and nothing stored. Either way the root says the theme it shows as
  // data-doc-effective-theme ("light" or "dark"), which a custom page's own colors are written by.
  const root = document.documentElement;
  const page = document.querySelector(".doc-page");
  const custom = page ? null : document.querySelector(".gallery-page");
  if (!(page || custom) || document.querySelector(".doc-display")) return;

  const systemTheme = matchMedia("(prefers-color-scheme: dark)");
  if (!globalThis.DocState) throw new Error("Report UI requires /kit/state.js to be loaded first.");
  if (!globalThis.DocKit) throw new Error("Report UI requires /kit/runtime.js to be loaded first.");
  const reportId = page?.dataset.docId || location.pathname || "report";
  const displayState = page ? DocState.create({
    id: "display", // this report's (DocState scopes it by data-doc-id)
    version: 1,
    // tables: the reader's 宽表格 ("wide" or "default"), null while they have not chosen (the file's look stands).
    defaults: { theme: null, width: "reading", tables: null, exportVersion: 0 },
  }) : null;
  // The reader's own choice of theme on this document (its display menu), or null: the system's.
  const chosenTheme = () => {
    const theme = displayState?.get("theme");
    return theme === "light" || theme === "dark" ? theme : null;
  };

  function effectiveTheme() {
    return root.dataset.docTheme || (systemTheme.matches ? "dark" : "light");
  }

  // The theme the page shows now, on its root (data-doc-effective-theme) and told to its scripts:
  // doc-theme-change, and report-theme-change, its old name (before 2026-10-26), for a script of the
  // report's folder no tool rewrote (shared/old-names.mjs).
  const themeChanged = () => {
    root.dataset.docEffectiveTheme = effectiveTheme();
    for (const name of ["doc-theme-change", "report-theme-change"]) dispatchEvent(new CustomEvent(name, { detail: { theme: effectiveTheme() } }));
  };

  // A theme asked of the page from outside (the preview's workbench session dispatches it): shown,
  // not stored; null goes back to the reader's own choice, or the system's.
  addEventListener("doc-theme-request", (event) => {
    const theme = event.detail?.theme ?? chosenTheme();
    if (theme === "light" || theme === "dark") root.dataset.docTheme = theme;
    else delete root.dataset.docTheme;
    updateThemeItems();
    themeChanged();
  });
  systemTheme.addEventListener?.("change", () => {
    if (root.dataset.docTheme) return;
    themeChanged();
  });

  // Reveal the held first paint (styles/base.css) on the frame after DOMContentLoaded: the report's
  // inline script (Sheets, charts) and the kit's DOMContentLoaded work (formulas, tables) are done.
  const markReady = () => requestAnimationFrame(() => root.setAttribute("data-doc-ready", ""));
  const ready = () => (document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", markReady, { once: true }) : markReady());

  if (custom) {
    root.dataset.docEffectiveTheme = effectiveTheme();
    ready();
    return;
  }

  const icons = {
    // Two sliders, their knobs open circles the lines stop at.
    settings: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 6.5h7.25M15.25 6.5h1.25M3.5 13.5h1.25M9.25 13.5h7.25"/><circle cx="13" cy="6.5" r="2.25"/><circle cx="7" cy="13.5" r="2.25"/></svg>',
    system: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.75" y="3.75" width="14.5" height="10" rx="2"/><path d="M7.5 16.75h5M10 13.75v3"/></svg>',
    sun: '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.25"/><path d="M10 2.75v1.5M10 15.75v1.5M4.87 4.87l1.06 1.06M14.07 14.07l1.06 1.06M2.75 10h1.5M15.75 10h1.5M4.87 15.13l1.06-1.06M14.07 5.93l1.06-1.06"/></svg>',
    moon: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M16.5 12.4A6.9 6.9 0 0 1 7.6 3.5a6.9 6.9 0 1 0 8.9 8.9Z"/></svg>',
    width: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 10h14M6 7l-3 3 3 3M14 7l3 3-3 3"/></svg>',
    // A table across two short lines above and below it (the text's edges): the workbench's 宽表格 (icons.ts wideTables).
    tables: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.75" y="6.25" width="14.5" height="7.5" rx="1.5"/><path d="M2.75 10h14.5M10 6.25v7.5M6.25 2.75v2M13.75 2.75v2M6.25 15.25v2M13.75 15.25v2"/></svg>',
    download: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5v9M6.5 9l3.5 3.5L13.5 9M4.5 16.5h11"/></svg>',
    // Two sheets, one over the other: the words as they are.
    copy: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7.25" y="7.25" width="9.5" height="9.5" rx="2"/><path d="M12.75 7.25V5.25a2 2 0 0 0-2-2h-5.5a2 2 0 0 0-2 2v5.5a2 2 0 0 0 2 2h2"/></svg>',
    // Markdown's own mark, an M and an arrow down, in a frame.
    markdown: '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="2.75" y="4.75" width="14.5" height="10.5" rx="2"/><path d="M5.75 12.25v-4.5l2 2.25 2-2.25v4.5M14 7.75v4.5M12.25 10.5 14 12.25l1.75-1.75"/></svg>',
    done: '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m5 10.5 3.25 3.25L15 6.75"/></svg>',
    check: '<svg class="doc-display-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>',
  };

  // The display settings (styles/controls.css): one quiet button at the top right,
  // opening a menu of the reader's choices for this report: in an offline file first its words copied
  // (复制为完整文本, 复制为 Markdown: below), then its look (the system's, light or dark), full width and
  // 宽表格 (wide tables past the text), and a copy of the view as it is now. The menu is made once and only hidden, so
  // the copy's hook is always there (the preview's workbench session clicks it).
  const display = document.createElement("div");
  display.className = "doc-display";

  const menuButton = document.createElement("button");
  menuButton.type = "button";
  menuButton.className = "doc-display-button";
  menuButton.innerHTML = icons.settings;
  menuButton.setAttribute("aria-label", say("display"));
  menuButton.setAttribute("aria-haspopup", "menu");
  menuButton.setAttribute("aria-expanded", "false");

  const menu = document.createElement("div");
  menu.className = "doc-display-menu";
  menu.id = "doc-display-menu";
  menu.hidden = true;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", say("display-menu"));
  menuButton.setAttribute("aria-controls", menu.id);

  // A row of the menu: its icon, its label, and what stands at its right (a check, a switch).
  function menuItem(role, icon, label, right = "") {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "doc-display-item";
    item.tabIndex = -1;
    item.setAttribute("role", role);
    item.innerHTML = `<span class="doc-display-icon">${icon}</span><span class="doc-display-label"></span>${right}`;
    item.querySelector(".doc-display-label").textContent = label;
    return item;
  }
  function menuSection(header, ...items) {
    const section = document.createElement("div");
    section.className = "doc-display-section";
    if (header) {
      const title = document.createElement("div");
      title.className = "doc-display-header";
      title.textContent = header;
      section.append(title);
    }
    section.append(...items);
    return section;
  }

  // The look: the system's (nothing stored), light or dark.
  const themeItems = [["system", icons.system], ["light", icons.sun], ["dark", icons.moon]].map(([theme, icon]) => {
    const item = menuItem("menuitemradio", icon, say(`theme-${theme}`), icons.check);
    item.dataset.theme = theme;
    return item;
  });
  const widthItem = menuItem("menuitemcheckbox", icons.width, say("full-width"), '<span class="doc-display-switch" aria-hidden="true"><span></span></span>');
  // 宽表格 (the document's look `tables`, data-doc-tables="wide": src/shared/document-look.mjs, the kit's
  // tables/across.js), on as the file was made (the look its render put on <html>), the reader's to change.
  const tablesItem = menuItem("menuitemcheckbox", icons.tables, say("wide-tables"), '<span class="doc-display-switch" aria-hidden="true"><span></span></span>');
  tablesItem.dataset.docTables = "";
  const exportButton = menuItem("menuitem", icons.download, say("export-view"));
  // A copy of the page as the reader sees it now, with its reading state (Sheet, disclosures, notes);
  // the report's source is never changed by it. The preview's workbench session uses the hook.
  exportButton.dataset.docExportCopy = "";

  // The document's words, as gallery read writes them (--format text, --format markdown), which an offline
  // file carries (src/transfer/carry.mjs: worked out where the file was made, from its doc.html, every kind
  // of block read by its own rule, a Sheet's other tabs and a closed disclosure with the rest): put on the
  // clipboard as they are. The file writes them at its end, after this script: read once the page is parsed
  // (takeWords); a page that carries none (the preview, a copy made of it) shows neither row.
  let copyWords = null;
  const copyItems = [["text", icons.copy, say("copy-text")], ["markdown", icons.markdown, say("copy-markdown")]].map(([kind, icon, label]) => {
    const item = menuItem("menuitem", icon, label);
    item.dataset.docCopy = kind;
    return item;
  });
  const copySection = menuSection(null, ...copyItems);
  copySection.hidden = true;
  function takeWords() {
    try {
      const words = JSON.parse(document.querySelector(`script[${COPY_DATA}]`)?.textContent ?? "null");
      copyWords = typeof words?.text === "string" && typeof words.markdown === "string" ? words : null;
    } catch {
      copyWords = null;
    }
    copySection.hidden = !copyWords;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", takeWords, { once: true });
  else takeWords();

  menu.append(copySection, menuSection(say("appearance"), ...themeItems), menuSection(null, widthItem, tablesItem), menuSection(null, exportButton));
  display.append(menuButton, menu);
  document.body.prepend(display);
  root.dataset.docControls = "ready";
  ready();

  const storedTheme = chosenTheme();
  if (storedTheme) root.dataset.docTheme = storedTheme;
  root.dataset.docEffectiveTheme = effectiveTheme();

  const storedWidth = displayState.get("width");
  if (storedWidth === "full") root.dataset.docWidth = "full";
  // The reader's own 宽表格, either way, over the file's (none chosen: the file's stands).
  const TABLES = LOOK_ATTRIBUTES.tables;
  const storedTables = displayState.get("tables");
  if (storedTables === "wide") root.setAttribute(TABLES, "wide");
  else if (storedTables === "default") root.removeAttribute(TABLES);

  // The reader's own choice of look is checked (a theme a workbench shows is not theirs). A function
  // declared, so that the theme's request (above) calls it; on a custom page (no menu) it does nothing.
  function updateThemeItems() {
    if (!displayState) return;
    const current = chosenTheme() ?? "system";
    themeItems.forEach((item) => item.setAttribute("aria-checked", String(item.dataset.theme === current)));
  }

  function updateWidthItem() {
    widthItem.setAttribute("aria-checked", String(root.dataset.docWidth === "full"));
  }

  function updateTablesItem() {
    tablesItem.setAttribute("aria-checked", String(root.getAttribute(TABLES) === "wide"));
  }

  function reportFileName() {
    const name = (location.pathname.split("/").pop() || `${reportId}.html`).replace(/\.html$/i, "");
    return name.replace(/\.v\d+$/i, "");
  }

  function copyLiveFormValues(source, clone) {
    const sourceControls = source.querySelectorAll("input, textarea, select");
    const cloneControls = clone.querySelectorAll("input, textarea, select");
    sourceControls.forEach((control, index) => {
      const target = cloneControls[index];
      if (!target) return;
      if (control instanceof HTMLTextAreaElement) target.textContent = control.value;
      else if (control instanceof HTMLSelectElement) {
        Array.from(target.options).forEach((option, optionIndex) => option.toggleAttribute("selected", control.options[optionIndex]?.selected));
      } else if (control instanceof HTMLInputElement) {
        target.setAttribute("value", control.value);
        target.toggleAttribute("checked", control.checked);
      }
    });
  }

  // A picture ({ bytes, type }) as a copy holds it: a WebP as light as the page needs, or itself (none tried, none made,
  // one not a tenth lighter, a browser that writes no WebP).
  async function lighterPicture(asset, ceiling) {
    const task = pictureTask(asset.bytes, ceiling);
    if (!task) return asset;
    try {
      const made = await encodePicture(new Blob([asset.bytes], { type: asset.type }), { ceiling, lossy: task.lossy, quality: PICTURE_QUALITY });
      if (made && lighter(made.size, asset.bytes.length)) return { bytes: new Uint8Array(await made.arrayBuffer()), type: made.type };
    } catch {}
    return asset;
  }

  async function inlineLinkedAssets(clone) {
    clone.querySelectorAll('script[src="/@vite/client"]').forEach((node) => node.remove());
    const cache = new Map();
    async function resource(url, base = location.href) {
      const resolved = new URL(url, base);
      if (resolved.origin !== location.origin || !["http:", "https:"].includes(resolved.protocol)) throw new Error("Export requires same-origin preview assets or an already standalone HTML.");
      if (!cache.has(resolved.href)) cache.set(resolved.href, fetch(resolved.href).then(async (response) => {
        if (!response.ok) throw new Error(`Unable to embed ${resolved.pathname}: ${response.status}`);
        return { bytes: new Uint8Array(await response.arrayBuffer()), type: response.headers.get("content-type") || "application/octet-stream", url: resolved.href };
      }));
      return cache.get(resolved.href);
    }
    function dataUrl(asset) {
      let binary = "";
      for (const byte of asset.bytes) binary += String.fromCharCode(byte);
      return `data:${asset.type};base64,${btoa(binary)}`;
    }
    for (const link of clone.querySelectorAll('link[rel="stylesheet"][href]')) {
      const asset = await resource(link.getAttribute("href"));
      const css = new TextDecoder().decode(asset.bytes);
      // Each file it names, read as CSS reads it. A package's style may name what is not there, which
      // shows nothing on the page either: that stays as written, and costs the copy nothing.
      const references = cssReferences(css).filter(({ value, kind }) => kind !== "import" && !/^(data:|#|$)/i.test(value));
      const embedded = new Map();
      for (const reference of references) {
        try {
          embedded.set(reference, dataUrl(await resource(reference.value, asset.url)));
        } catch {}
      }
      const style = document.createElement("style");
      // The kit's stylesheet says whose it is, as an export's inline copy does (<id>-inline), and so
      // does a component package's: an import of the copy (src/transfer/own-report.mjs) leaves it
      // out, as none of the report's own.
      for (const mark of ["data-doc-kit", "data-doc-vendor"]) {
        if (link.hasAttribute(mark)) style.setAttribute(mark, `${link.getAttribute(mark)}-inline`);
      }
      if (link.hasAttribute(PACKAGE_MARK)) style.setAttribute(PACKAGE_MARK, link.getAttribute(PACKAGE_MARK));
      style.textContent = styleText(cssWithAddresses(css, references, (reference) => embedded.get(reference)));
      link.replaceWith(style);
    }
    let codeScript = null; // the kit's code.js, once its text is in
    for (const script of clone.querySelectorAll("script[src]")) {
      const asset = await resource(script.getAttribute("src"));
      let code = new TextDecoder().decode(asset.bytes);
      if (script.hasAttribute("data-doc-vendor")) code = isolateUmd(code);
      script.removeAttribute("src");
      script.textContent = script.hasAttribute(PACKAGE_MARK) ? scriptText(code) : code.replace(/<\/script/gi, "<\\/script");
      if (script.getAttribute("data-doc-kit") === "code") codeScript = script;
    }
    // Of code.js, the grammars the copy's code is colored with, read once every script is in (a package's may
    // draw code of any language), as an export of the document carries (src/shared/code-grammars.mjs).
    if (codeScript && globalThis.DocCode?.grammarsUsed) codeScript.textContent = keptGrammars(codeScript.textContent, globalThis.DocCode.grammarsUsed(clone));
    // Each picture as light as the page needs (src/shared/export-pictures.mjs: the copy's, the files stay as they
    // are), drawn again here, as the command's export has the user's browser draw them.
    const ceiling = pictureCeiling((name) => clone.getAttribute(name));
    for (const image of clone.querySelectorAll("img[src]")) {
      const src = image.getAttribute("src");
      if (src.startsWith("blob:")) continue;
      const embedded = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(src);
      if (src.startsWith("data:") && !embedded) continue;
      const asset = embedded ? { bytes: Uint8Array.from(atob(embedded[2]), (char) => char.charCodeAt(0)), type: embedded[1] } : await resource(src);
      const light = await lighterPicture(asset, ceiling);
      if (light !== asset || !embedded) image.setAttribute("src", dataUrl(light));
    }
    // Pictures given in style attributes (a Sheet tab's emoji: --doc-tab-icon) inside the file too.
    for (const node of clone.querySelectorAll('[style*="url("]')) {
      let style = node.getAttribute("style");
      for (const match of [...style.matchAll(/url\(\s*["']?([^"')\s]+)["']?\s*\)/g)]) {
        if (/^(data:|blob:|#)/.test(match[1])) continue;
        const embedded = dataUrl(await resource(match[1]));
        style = style.replace(match[0], () => `url("${embedded}")`);
      }
      node.setAttribute("style", style);
    }
    for (const icon of clone.querySelectorAll('link[rel~="icon"][href]')) {
      if (!/^(data:|blob:)/.test(icon.getAttribute("href"))) icon.setAttribute("href", dataUrl(await resource(icon.getAttribute("href"))));
    }
    clone.querySelectorAll('meta[http-equiv="Content-Security-Policy"]').forEach((node) => node.remove());
    const policy = document.createElement("meta");
    policy.httpEquiv = "Content-Security-Policy";
    policy.content = EXPORT_CSP;
    clone.querySelector("head")?.prepend(policy);
  }

  async function serializableHtml() {
    // Code blocks still waiting for their colors (code.js colors them once the page is idle) are
    // colored first: the copy holds them as the reader will see them.
    globalThis.DocCode?.colorAll?.();
    const clone = document.documentElement.cloneNode(true);
    // What the reader typed, while the clone's fields are the page's one for one: what the cleaning
    // below takes out (a field a component drew) would leave the others out of step.
    copyLiveFormValues(document, clone);
    // Development-only preview tooling (the in-place text editor) never travels with an export.
    clone.querySelectorAll("[data-doc-dev]").forEach((node) => node.remove());
    [clone, ...clone.querySelectorAll("*")].forEach((node) => {
      // The editor marks (data-ge-*; data-rs-* before 2026-10-28, which a file may keep).
      const marks = [...node.attributes].filter(({ name }) => /^data-(?:ge|rs)-/.test(name));
      if (marks.length === 0) return;
      marks.forEach(({ name }) => node.removeAttribute(name));
      node.removeAttribute("contenteditable");
    });
    // What the kit left on the page (the display settings, a table's sizing and
    // sort buttons, a chart's drawing, the marks of live listeners, the first paint shown) comes
    // off: the copy's kit makes it again (the components' descriptions, src/shared/components/).
    DocKit.dehydrate(clone);
    clone.querySelectorAll("[data-doc-transient-view]").forEach((node) => {
      if (node instanceof HTMLDetailsElement) node.removeAttribute("open");
      else node.removeAttribute("hidden");
    });
    // The copy stands alone: a link to another document has nowhere to go, and keeps its words, as an
    // export's to a document it does not hold (render/page-link-rewrite.mjs). A workbench's address needs
    // the list to say which, and on a disk it is the disk's root in any case.
    clone.querySelectorAll("a[href]").forEach((link) => {
      const href = link.getAttribute("href");
      const address = hosted(href) ? null : fromFile(href, reportId);
      const place = pageAddress(address);
      if (place ? place.slug === reportId : workbenchHash(address) === null) return;
      link.querySelector(`:scope > .${MENTION_ICON}`)?.remove();
      link.replaceWith(...link.childNodes);
    });
    clone.querySelectorAll('meta[name="doc-export-id"]').forEach((node) => node.remove());
    const version = (displayState.get("exportVersion", 0) || 0) + 1;
    displayState.set("exportVersion", version);
    const exportMeta = document.createElement("meta");
    exportMeta.name = "doc-export-id";
    exportMeta.content = `${reportId}.v${version}-${crypto.randomUUID()}`;
    clone.querySelector("head")?.append(exportMeta);
    const stateScript = document.createElement("script");
    stateScript.type = "application/json";
    stateScript.dataset.docState = "";
    stateScript.textContent = DocState.serializeAll().replaceAll("<", "\\u003c");
    clone.querySelector("head")?.append(stateScript);
    await inlineLinkedAssets(clone);
    return `<!doctype html>\n${clone.outerHTML}`;
  }

  async function exportCurrentReport() {
    const filename = `${reportFileName()}.v${(displayState.get("exportVersion", 0) || 0) + 1}.html`;
    let handle;
    // Ask for the destination during the click gesture, before loading preview assets.
    if (typeof globalThis.showSaveFilePicker === "function") {
      try {
        handle = await globalThis.showSaveFilePicker({
          id: "html-report-export",
          suggestedName: filename,
          types: [{ description: say("html-file"), accept: { "text/html": [".html"] } }],
        });
      } catch (error) {
        if (error?.name === "AbortError") return false;
      }
    }
    const html = await serializableHtml();
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(html);
      await writable.close();
      return true;
    }
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  }

  // The menu: the button opens and closes it; a press anywhere else, Esc, the window losing the
  // focus or a copy being made closes it. Opened from the keyboard, the focus goes into it, and
  // ↑/↓ (Home, End) move along its rows.
  const items = () => [...menu.querySelectorAll(".doc-display-item")].filter((item) => !item.parentElement.hidden);
  function openMenu(fromKeyboard) {
    // Opened from the keys it is there at once, no growing out of its corner (controls.css).
    menu.classList.toggle("doc-display-menu--keys", fromKeyboard);
    menu.hidden = false;
    menuButton.setAttribute("aria-expanded", "true");
    if (fromKeyboard) (items().find((item) => item.getAttribute("aria-checked") === "true") ?? items()[0])?.focus();
  }
  function closeMenu({ focusButton = false } = {}) {
    if (menu.hidden) return;
    menu.hidden = true;
    if (exportButton.classList.contains("is-failed")) showExport(false);
    copyItems.forEach((item) => (item.classList.contains("is-done") || item.classList.contains("is-failed")) && showCopy(item, null));
    menuButton.setAttribute("aria-expanded", "false");
    if (focusButton) menuButton.focus();
  }
  menuButton.addEventListener("click", (event) => (menu.hidden ? openMenu(event.detail === 0) : closeMenu()));
  document.addEventListener("pointerdown", (event) => { if (!display.contains(event.target)) closeMenu(); }, true);
  addEventListener("blur", () => closeMenu());
  display.addEventListener("keydown", (event) => {
    if (menu.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu({ focusButton: true });
      return;
    }
    if (event.key === "Tab") return closeMenu();
    const list = items();
    const at = list.indexOf(document.activeElement);
    const next = event.key === "ArrowDown" ? (at + 1) % list.length : event.key === "ArrowUp" ? (at - 1 + list.length) % list.length
      : event.key === "Home" ? 0 : event.key === "End" ? list.length - 1 : null;
    if (next === null) return;
    event.preventDefault();
    list[next].focus();
  });

  themeItems.forEach((item) => item.addEventListener("click", () => {
    const theme = item.dataset.theme;
    if (theme === "system") delete root.dataset.docTheme;
    else root.dataset.docTheme = theme;
    displayState.set("theme", theme === "system" ? null : theme);
    updateThemeItems();
    themeChanged();
  }));

  // The document's look asked of the page (字体与布局, src/shared/document-look.mjs: the workbench's choice,
  // which the page's session dispatches, or its doc.json written again, which the preview's live
  // reload says): put on <html> as the render puts doc.json's, the page shown in it at once, never
  // reloaded. What lays itself out by its text or its width (a table's columns, a flowchart's rows,
  // what the page editor places over the text, its column's room) is laid out again, as after a
  // resize; doc-look-change tells the page (its editor's session) the look it shows now.
  // A look said by the file (from: "file") while one asked of the page is being written (LOOK_HELD
  // after the ask) is the echo of an earlier write of the asker's, older than what the page shows
  // (choices clicked one after another: 小号, then 大号 before 小号's write came back): it is held, and
  // the last the file said shown once that time is over (the same as shown, by then, but for a write
  // of someone else's meanwhile).
  const LOOK_HELD = 2000;
  let held = null; // { timer, said: the file's last look meanwhile, or null }
  const showLook = (look) => {
    if (!setLookOn(root, look)) return;
    updateWidthItem();
    updateTablesItem();
    dispatchEvent(new Event("doc-layout-change"));
    dispatchEvent(new Event("resize"));
    dispatchEvent(new CustomEvent("doc-look-change", { detail: { look: lookOf(look) } }));
  };
  addEventListener("doc-look-request", (event) => {
    const look = event.detail?.look;
    if (event.detail?.from === "file") {
      if (held) held.said = look;
      else showLook(look);
      return;
    }
    clearTimeout(held?.timer);
    held = { said: null, timer: setTimeout(() => {
      const said = held?.said;
      held = null;
      if (said) showLook(said);
    }, LOOK_HELD) };
    showLook(look);
  });

  widthItem.addEventListener("click", () => {
    const next = root.dataset.docWidth === "full" ? "reading" : "full";
    if (next === "full") root.dataset.docWidth = "full";
    else delete root.dataset.docWidth;
    displayState.set("width", next);
    updateWidthItem();
  });

  // 宽表格: shown at once (the tables laid out again: doc-layout-change), kept for this document in this browser.
  tablesItem.addEventListener("click", () => {
    const on = root.getAttribute(TABLES) !== "wide";
    if (on) root.setAttribute(TABLES, "wide");
    else root.removeAttribute(TABLES);
    displayState.set("tables", on ? "wide" : "default");
    updateTablesItem();
    dispatchEvent(new Event("doc-layout-change"));
  });

  // A copy that failed for a reader who asked for it (their click or key, not the workbench's hook, which
  // says so itself) is told on its row: the menu opens again with the row saying it failed, in the
  // danger's color, for a few seconds or until the menu closes; a press on it tries again.
  const exportLabel = exportButton.querySelector(".doc-display-label");
  let failedTimer = 0;
  function showExport(failed) {
    clearTimeout(failedTimer);
    exportButton.classList.toggle("is-failed", failed);
    exportLabel.textContent = say(failed ? "export-failed" : "export-view");
    if (failed) failedTimer = setTimeout(() => showExport(false), 6000);
  }

  // The words on the clipboard: the browser's clipboard first (a file opened from the disk has it too, a
  // click being the reader's), else the selection's copy of a field put in for it (a browser that keeps the
  // clipboard from the page), else, where neither writes it, the words shown selected in a card for the
  // reader's own Ctrl+C. Told on the row: its icon a check and its label 已复制 for a moment, the menu then
  // closed; a copy that failed says so on its row, which tries again.
  async function writeClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.cssText = "position: fixed; top: 0; left: 0; width: 1px; height: 1px; opacity: 0; pointer-events: none;";
    document.body.append(field);
    field.select();
    let done = false;
    try {
      done = document.execCommand("copy");
    } catch {}
    field.remove();
    return done;
  }
  function copyByHand(text) {
    const card = document.createElement("dialog");
    card.className = "doc-copy-card";
    card.setAttribute("data-doc-dev", "");
    card.setAttribute("aria-label", say("copy-by-hand", /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘C" : "Ctrl+C"));
    card.innerHTML = '<p class="doc-copy-card-hint"></p><textarea class="doc-copy-card-text" readonly></textarea><button type="button" class="doc-copy-card-close"></button>';
    card.querySelector(".doc-copy-card-hint").textContent = card.getAttribute("aria-label");
    card.querySelector(".doc-copy-card-close").textContent = say("copy-card-close");
    const field = card.querySelector("textarea");
    field.value = text;
    card.querySelector("button").addEventListener("click", () => card.close());
    card.addEventListener("close", () => card.remove());
    document.body.append(card);
    card.showModal();
    field.focus();
    field.select();
  }
  const copyTimers = new WeakMap();
  function showCopy(item, how) {
    clearTimeout(copyTimers.get(item));
    const label = item.querySelector(".doc-display-label");
    const icon = item.querySelector(".doc-display-icon");
    const kind = item.dataset.docCopy;
    item.classList.toggle("is-done", how === "done");
    item.classList.toggle("is-failed", how === "failed");
    label.textContent = how === "done" ? say("copy-done") : how === "failed" ? say("copy-retry") : kind === "text" ? say("copy-text") : say("copy-markdown");
    icon.innerHTML = how === "done" ? icons.done : kind === "text" ? icons.copy : icons.markdown;
    if (how) copyTimers.set(item, setTimeout(() => {
      if (how === "done") closeMenu();
      showCopy(item, null);
    }, how === "done" ? 900 : 6000));
  }
  copyItems.forEach((item) => item.addEventListener("click", async () => {
    if (!copyWords) return; // a page that carries none: its rows stand hidden, a click (a script's) does nothing
    const text = copyWords[item.dataset.docCopy];
    if (await writeClipboard(text)) return showCopy(item, "done");
    showCopy(item, null);
    closeMenu();
    try {
      copyByHand(text);
    } catch {
      showCopy(item, "failed");
      openMenu(false);
    }
  }));

  // Each copy ends with a "doc-export-copy-done" event, { ok } or { ok: false, reason }: the
  // preview's workbench session answers its export command with it.
  exportButton.addEventListener("click", async (event) => {
    if (exportButton.disabled) return;
    closeMenu();
    exportButton.disabled = true;
    let outcome;
    try {
      outcome = (await exportCurrentReport()) ? { ok: true } : { ok: false, reason: "cancelled" };
    } catch (error) {
      console.error("Unable to export report HTML", error);
      outcome = { ok: false, reason: "error", message: error.message };
    } finally {
      exportButton.disabled = false;
    }
    if (outcome.reason === "error" && event.isTrusted) {
      showExport(true);
      openMenu(false);
    }
    dispatchEvent(new CustomEvent("doc-export-copy-done", { detail: outcome }));
  });

  // Printed by the reader (Ctrl+P, the browser's own PDF): the whole document on paper, as Gallery's PDF prints
  // it (src/transfer/browser.mjs showEverything): each Sheet panel under a copy of its own tab (the same pill,
  // a node of the kit's: data-doc-dev), the row of tabs gone, every disclosure open; all put back as it was
  // after. Nothing while the page editor edits the page (its file would see it), nor where the page is shown
  // whole already (Gallery's PDF did it first: every panel shown, every disclosure open).
  let unprint = null;
  addEventListener("beforeprint", () => {
    if (unprint || root.hasAttribute("data-ge-editing")) return;
    const undo = [];
    for (const area of document.querySelectorAll("[data-doc-sheets]")) {
      const row = area.querySelector(":scope > .doc-sheet-tabs");
      const panels = [...area.querySelectorAll(":scope > [data-doc-sheet]")];
      if (!row || panels.every((panel) => !panel.hidden)) continue;
      for (const tab of row.querySelectorAll(":scope > .doc-sheet-tab")) {
        const panel = panels.find((each) => each.getAttribute("data-doc-sheet") === tab.getAttribute("data-sheet-tab"));
        if (!panel) continue;
        const hidden = panel.hidden;
        const said = panel.getAttribute("aria-hidden");
        panel.hidden = false;
        panel.removeAttribute("aria-hidden");
        const label = row.cloneNode(false);
        for (const name of ["id", "role", "aria-label"]) label.removeAttribute(name);
        label.setAttribute("data-doc-dev", "");
        label.setAttribute("aria-hidden", "true");
        label.style.breakAfter = "avoid";
        const pill = tab.cloneNode(true);
        pill.removeAttribute("id");
        pill.setAttribute("aria-selected", "true");
        pill.classList.add("is-active");
        label.append(pill);
        panel.before(label);
        undo.push(() => {
          label.remove();
          panel.hidden = hidden;
          if (said !== null) panel.setAttribute("aria-hidden", said);
        });
      }
      const display = row.style.display;
      row.style.display = "none";
      undo.push(() => {
        row.style.display = display;
        if (!row.getAttribute("style")) row.removeAttribute("style");
      });
    }
    for (const details of document.querySelectorAll("details:not([open])")) {
      details.open = true;
      undo.push(() => { details.open = false; });
    }
    unprint = () => undo.reverse().forEach((step) => step());
    dispatchEvent(new Event("doc-layout-change"));
  });
  addEventListener("afterprint", () => {
    if (!unprint) return;
    unprint();
    unprint = null;
    dispatchEvent(new Event("doc-layout-change"));
  });

  updateThemeItems();
  updateWidthItem();
  updateTablesItem();
})();
