(function initDocDialogs(global) {
  "use strict";

  const openerByDialog = new WeakMap();

  function elementFor(target) {
    const element = typeof target === "string" ? document.querySelector(target) : target;
    if (!(element instanceof HTMLDialogElement)) {
      throw new Error("DocDialogs target must be a dialog element.");
    }
    return element;
  }

  // The page keeps still under an open card, so that nothing on it moves as a card opens or closes.
  // Where it had a scrollbar, the room the scrollbar took is given to the page as padding on its
  // right (--doc-page-bar, styles/dialog.css), in a sheet the document adopts, so none of it is in
  // the markup; not kept as the scrollbar's, which would leave that strip outside the window the
  // card's backdrop covers. A browser with no constructed sheets keeps the scrollbar's room.
  let barSheet = null;
  function sayBar(width) {
    try {
      if (!barSheet) {
        barSheet = new CSSStyleSheet();
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, barSheet];
      }
      barSheet.replaceSync(`@media screen { :root.doc-dialog-open.doc-dialog-gutter { scrollbar-gutter: auto; padding-right: ${width}px; --doc-page-bar: ${width}px; } }`);
    } catch {
      // the scrollbar's room kept (dialog.css)
    }
  }

  function syncPageLock() {
    const root = document.documentElement;
    const open = Boolean(document.querySelector("dialog.doc-dialog[open]"));
    if (open && !root.classList.contains("doc-dialog-open")) {
      const bar = global.innerWidth - root.clientWidth;
      root.classList.toggle("doc-dialog-gutter", bar > 0);
      if (bar > 0) sayBar(bar);
    }
    root.classList.toggle("doc-dialog-open", open);
    if (!open) root.classList.remove("doc-dialog-gutter");
  }

  // What opens a card: `opener` when it is a link or a button, else the first link in the page to it.
  function entryOf(dialog, opener) {
    return opener?.closest?.("a[href], button") ?? [...document.querySelectorAll("a[href]")].find((link) => link.getAttribute("href") === `#${dialog.id}`);
  }

  const words = (node) => (node?.textContent ?? "").replace(/\s+/g, " ").trim();

  // A card goes by its first heading with words, whichever block that is by now, else by the words
  // that open it, so it is named each time it opens, and nothing in the file says which heading. A
  // name the file gives it stays.
  const named = new WeakSet();
  function nameCard(dialog, opener) {
    if (dialog.hasAttribute("aria-labelledby") || (dialog.hasAttribute("aria-label") && !named.has(dialog))) return;
    const name = [...dialog.querySelectorAll("h1, h2, h3, h4")].map(words).find(Boolean) || words(entryOf(dialog, opener));
    if (name) dialog.setAttribute("aria-label", name);
    else dialog.removeAttribute("aria-label");
    named.add(dialog);
  }

  // A card opens at its top: showModal gives the focus to the first link or control in it, wherever
  // that stands, or to its content when that scrolls. The focus goes to its first text where the
  // page is being edited, the caret there, else to the content, to be scrolled by keys.
  function focusContent(dialog) {
    const content = dialog.querySelector(".doc-dialog-content");
    if (!content) return;
    const text = content.querySelector("[contenteditable='true']");
    if (!text) content.tabIndex = -1;
    (text ?? content).focus({ preventScroll: true });
    content.scrollTop = 0;
  }

  function open(target, opener = document.activeElement) {
    const dialog = enhance(target);
    if (opener instanceof HTMLElement) openerByDialog.set(dialog, opener);
    if (!dialog.open) {
      nameCard(dialog, opener);
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
      focusContent(dialog);
    }
    syncPageLock();
    return dialog;
  }

  function close(target, returnValue = "") {
    const dialog = elementFor(target);
    if (!dialog.open) return dialog;
    if (typeof dialog.close === "function") dialog.close(returnValue);
    else {
      dialog.removeAttribute("open");
      dialog.dispatchEvent(new Event("close"));
    }
    return dialog;
  }

  // What a card does is the document's (delegated below), so a card the page made or put back
  // (an editor's undo, a copy carrying data-doc-dialog-ready) behaves as one the page started with.
  function enhance(target) {
    const dialog = elementFor(target);
    if (dialog.dataset.docDialogReady !== "true") dialog.dataset.docDialogReady = "true";
    return dialog;
  }

  // Closed (a press outside it, Esc, close()): the focus back on what opened it, and the page unlocked once the
  // card and its backdrop have faded (dialog.css: its closed state's transition, kept where motion is reduced),
  // so that the page's scrollbar does not come back beside the backdrop while it fades.
  // `close` does not bubble: heard on its way down.
  document.addEventListener("close", (event) => {
    const dialog = event.target;
    if (!(dialog instanceof HTMLDialogElement) || !dialog.matches("dialog.doc-dialog")) return;
    const fading = Math.max(0, ...getComputedStyle(dialog).transitionDuration.split(",").map((part) => parseFloat(part) * (part.trim().endsWith("ms") ? 1 : 1000) || 0));
    if (fading > 0) setTimeout(syncPageLock, Math.min(fading, 400));
    else syncPageLock();
    const opener = openerByDialog.get(dialog);
    openerByDialog.delete(dialog);
    if (opener?.isConnected) opener.focus({ preventScroll: true });
  }, true);

  // A press outside the card (on its backdrop: the dialog itself is all that is there, outside its
  // box) closes it, as a modal's underlay does: on the press, so a press inside it that
  // ends outside (selecting its text) never closes it, and a press there always does. Only the
  // primary button, and not the second press of a double click on what opened it, which would shut
  // the card again; the press does nothing else (no focus, no selection behind it).
  document.addEventListener("mousedown", (event) => {
    const dialog = event.target;
    if (event.button !== 0 || event.detail > 1 || !(dialog instanceof HTMLDialogElement) || !dialog.open || !dialog.matches("dialog.doc-dialog")) return;
    const box = dialog.getBoundingClientRect();
    const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
    if (inside) return;
    event.preventDefault();
    close(dialog, "backdrop");
  });

  // The dialog an in-page link points to (href="#id"), or null: a link in the text opens its
  // detail card like any trigger instead of jumping to it.
  function linkedDialog(link) {
    const href = link?.getAttribute("href") ?? "";
    if (!href.startsWith("#") || href.length < 2) return null;
    let id = href.slice(1);
    try { id = decodeURIComponent(id); } catch { /* keep it as written */ }
    const target = document.getElementById(id);
    return target instanceof HTMLDialogElement ? target : null;
  }

  document.addEventListener("click", (event) => {
    if (event.defaultPrevented) return; // handled already (the preview's text editor, say)
    const link = event.target.closest?.("a[href^='#']");
    const dialog = linkedDialog(link);
    if (dialog) {
      event.preventDefault();
      open(dialog, link);
      return;
    }

    const opener = event.target.closest?.("[data-doc-dialog-open]");
    if (opener) {
      const selector = opener.getAttribute("data-doc-dialog-open");
      if (selector) {
        event.preventDefault();
        open(selector, opener);
      }
    }
  });

  // A link that opens a card says so to a screen reader (aria-haspopup="dialog", as a picture that opens large
  // does: runtime/zoom.js) while the page is read; never while the page editor edits it (html[data-ge-editing]),
  // whose file it would reach. Only those the kit marked are unmarked, an author's own word kept; an export of
  // the view takes it off (the description's runtime, src/shared/components/dialog.mjs).
  const marked = new WeakSet();
  function offerTriggers() {
    const editing = document.documentElement.hasAttribute("data-ge-editing");
    for (const link of document.querySelectorAll("a.doc-dialog-trigger")) {
      if (!editing && linkedDialog(link)) {
        if (link.hasAttribute("aria-haspopup")) continue;
        link.setAttribute("aria-haspopup", "dialog");
        marked.add(link);
      } else if (marked.has(link)) {
        link.removeAttribute("aria-haspopup");
        marked.delete(link);
      }
    }
  }
  new MutationObserver(offerTriggers).observe(document.documentElement, { attributes: true, attributeFilter: ["data-ge-editing"] });

  global.DocDialogs = Object.freeze({ open, close });
  global.ReportDialogs = global.DocDialogs; // its old name (before 2026-10-26), for a script no tool rewrote (shared/old-names.mjs)

  // The kit's runtime (DocKit) enhances every detail card once the page has loaded, and those
  // added later; one that leaves the page open no longer locks it.
  if (!global.DocKit) throw new Error("DocDialogs requires /kit/runtime.js to be loaded first.");
  global.DocKit.component({
    id: "dialog",
    mount(dialog) {
      enhance(dialog);
      offerTriggers();
      return { destroy: () => queueMicrotask(() => global.document?.defaultView && syncPageLock()) };
    },
  });
})(globalThis);
