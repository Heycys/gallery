// Going to a block (docs/render.md, "Links to blocks"). A block's id is no element's id (data-block-id),
// so the browser's own jump finds nothing: for a reader (an exported file, 演示视图) a link #<block id>
// and an address ending in one (…/b.html#<block id>, on load and as the hash changes) find it here,
// open what hides it and bring it to the middle of the window; nothing is selected, nothing saved.
// A link clicked to a block of the page is a step of the history, as a browser's jump to an anchor
// is, and the way back comes to where the reader was (reading-place.mjs), the detail cards as they
// were. An element's own id and a detail card's come here too, for an address from another page,
// which no click in this one handled (dialogs.js). While the page editor edits the page these are the
// editor's (links/, which selects the block too), and `reveal` is what the two share, its outline as well.

import { cssString, goBackTo, placeIn, unmoved } from "../../../shared/reading-place.mjs";

const CARD = "dialog.doc-dialog";

const shown = (panel) => {
  const area = panel.parentElement;
  const key = panel.getAttribute("data-doc-sheet");
  globalThis.DocSheets?.get(area)?.set(key);
  if (panel.hidden) [...area.querySelectorAll("[data-sheet-tab]")].find((tab) => tab.getAttribute("data-sheet-tab") === key)?.click(); // an area the kit has not started
};

/**
 * What hides `target` opened, reading state that is never saved: the detail cards open that do not
 * hold it closed, then from the outside in the disclosures closed around it opened, the tabs it is in
 * shown and the detail card it is in opened; a tab's panel or a detail card given as `target` itself too.
 */
export function reveal(target) {
  for (const card of [...document.querySelectorAll(`${CARD}[open]`)].reverse()) {
    if (card.contains(target)) continue;
    if (globalThis.DocDialogs) globalThis.DocDialogs.close(card, "outside");
    else card.close();
  }
  const around = [];
  for (let node = target; node; node = node.parentElement) around.unshift(node);
  for (const node of around) {
    if (node.hasAttribute("data-doc-sheet") && node.hidden && node.parentElement?.matches("[data-doc-sheets]")) shown(node);
    else if (node.matches(`${CARD}:not([open])`)) {
      if (globalThis.DocDialogs) globalThis.DocDialogs.open(node);
      else node.showModal();
    } else if (node !== target && node.localName === "details" && !node.open) node.open = true;
  }
}

/** The links to blocks of page `doc`, for a reader. */
export function startBlockLinks(doc) {
  const win = doc.defaultView;
  const root = doc.documentElement;
  const editing = () => root.hasAttribute("data-ge-editing");
  const idOf = (hash) => {
    try { return decodeURIComponent(hash.slice(1)); } catch { return hash.slice(1); } // as it is written
  };
  const blockNamed = (hash) => (idOf(hash) ? doc.querySelector(`[data-block-id="${cssString(win, idOf(hash))}"]`) : null);
  const named = (hash) => blockNamed(hash) ?? (idOf(hash) ? doc.getElementById(idOf(hash)) : null);
  const go = (hash) => {
    putting += 1;
    const target = named(hash);
    if (!target) return;
    reveal(target);
    target.scrollIntoView({ block: "center" });
  };
  // The history: the entry left keeps where the reader was (`docPlace`: placeIn's, and the detail
  // cards open), the one made the block (`docBlock`, its hash the address's); a link to the hash the
  // page is at makes none, as for the browser. `seen` is the hash the page was at, so that the
  // hashchange of a step the way back or forth took (popstate first, then hashchange, when the hash
  // differs) goes nowhere else.
  // The detail cards open, in the order they opened (the last on top: one opened from a link in
  // another), as the editor keeps them (dialog/page.mjs), each with how far its content is scrolled.
  let order = [...doc.querySelectorAll(`${CARD}[open]`)];
  new win.MutationObserver((records) => {
    for (const { target } of records) {
      if (!target.matches?.(CARD)) continue;
      order = order.filter((card) => card !== target);
      if (target.open) order.push(target);
    }
  }).observe(root, { subtree: true, attributes: true, attributeFilter: ["open"] });
  const contentOf = (card) => card.querySelector(".doc-dialog-content");
  const cards = () => {
    const open = [...doc.querySelectorAll(`${CARD}[open]`)];
    return [...order.filter((card) => card.open), ...open.filter((card) => !order.includes(card))]
      .filter((card) => card.id)
      .map((card) => ({ id: card.id, top: contentOf(card)?.scrollTop ?? 0 }));
  };
  let putting = 0; // the newest way back: a later step leaves it
  let seen = win.location.hash;
  let stepped = null;
  const jump = (hash) => {
    if (hash !== win.location.hash) {
      const state = win.history.state;
      try {
        win.history.replaceState({ ...(state && typeof state === "object" ? state : {}), docPlace: { ...placeIn(win), cards: cards() } }, "");
        win.history.pushState({ docBlock: hash.slice(1) }, "", hash);
        seen = hash;
      } catch { /* a page whose address cannot change (a sandbox): the browser's own jump */
        win.location.hash = hash;
        return;
      }
    }
    go(hash);
  };
  const back = (place) => {
    const kept = (Array.isArray(place.cards) ? place.cards : []).filter((card) => typeof card?.id === "string");
    const keep = new Set(kept.map((card) => card.id));
    for (const card of [...cards()].reverse().map(({ id }) => doc.getElementById(id))) {
      if (!card || keep.has(card.id)) continue;
      if (globalThis.DocDialogs) globalThis.DocDialogs.close(card, "outside");
      else card.close();
    }
    const scrolled = () => kept.forEach(({ id, top }) => { const content = contentOf(doc.getElementById(id) ?? doc.body); if (content && Number.isFinite(top)) content.scrollTop = top; });
    for (const { id } of kept) {
      const card = doc.getElementById(id);
      if (!card?.matches(`${CARD}:not([open])`)) continue;
      if (globalThis.DocDialogs) globalThis.DocDialogs.open(card);
      else card.showModal();
    }
    // Chrome puts the scroll position the entry kept back after popstate: the place again past it.
    const mine = ++putting;
    goBackTo(win, place);
    scrolled();
    const put = [win.scrollX, win.scrollY];
    win.requestAnimationFrame(() => {
      if (mine !== putting) return;
      if (!unmoved(win, place, put)) return; // the reader scrolled meanwhile
      goBackTo(win, place);
      scrolled();
    });
  };
  // A link to a block of the page, clicked, is jumped to here, which the browser cannot find; one to
  // an element's own id stays the browser's jump (a step of its history already, the hash changing
  // bringing it here), one to a detail card dialogs.js's, and a click with a key held the browser's.
  doc.addEventListener("click", (event) => {
    if (event.defaultPrevented || editing() || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const hash = event.target.closest?.("a[href^='#']:not([download]):not([target])")?.getAttribute("href");
    const block = hash ? blockNamed(hash) : null;
    if (!block || block instanceof win.HTMLDialogElement) return;
    event.preventDefault();
    jump(hash);
  });
  // 演示视图's link to a block of its own page by the page's address (editor/page/present-links.mjs).
  win.addEventListener("doc-jump-request", (event) => {
    const hash = event.detail?.hash;
    if (!editing() && typeof hash === "string" && hash.startsWith("#") && blockNamed(hash)) jump(hash);
  });
  win.addEventListener("popstate", (event) => {
    const state = event.state;
    const moved = win.location.hash !== seen;
    seen = win.location.hash;
    if (editing() || !state || typeof state !== "object") return;
    if (state.docPlace && typeof state.docPlace === "object") back(state.docPlace);
    else if (typeof state.docBlock === "string") go(win.location.hash);
    else return;
    stepped = moved ? win.location.hash : null;
  });
  win.addEventListener("hashchange", () => {
    const took = stepped !== null && stepped === win.location.hash;
    stepped = null;
    seen = win.location.hash;
    if (!took && !editing()) go(win.location.hash);
  });
  // Once the page is drawn: what its charts move is moved by then.
  const arrive = () => { if (win.location.hash && !editing()) go(win.location.hash); };
  if (root.hasAttribute("data-doc-drawn")) return arrive();
  const observer = new win.MutationObserver(() => {
    if (!root.hasAttribute("data-doc-drawn")) return;
    observer.disconnect();
    arrive();
  });
  observer.observe(root, { attributes: true, attributeFilter: ["data-doc-drawn"] });
}
