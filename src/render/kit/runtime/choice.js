// A choice as the kit draws it (docs/render.md, "Choices"): never a native <select>'s popup, which is a
// square white box the page's theme does not reach, but one flat menu card of the kit's own, the look of
// the display menu's (styles/choice.css): rounded, rows of 28px, the one chosen checked at its right, as
// wide as its rows (as the trigger at least), light or dark as the document is. Two ways in:
//
//   a <select> of the document, whoever drew it (the file's, a block's script's, the kit's):
//     startChoices() watches the page's presses and keys once and, where a press or Space, Enter, an
//     arrow or F4 would open the browser's popup, opens the menu instead. The <select> stays where it
//     is, the trigger, and holds the value: nothing is added to the page, so the file, the editor, an
//     export of the view and a script reading `select.value` or listening to `change` see what they did.
//     A choice sets `selectedIndex` and sends `input` and `change` as the browser's own would. A list
//     box (`multiple`, `size` over 1) is no popup and stays the browser's; so does a disabled select.
//   DocKit.choose(anchor, { options, value }): the same menu from any element, a button of a block's
//     own, answering with the value chosen or null.
//
// The menu is a popover (the top layer, so no z-index of the page or the editor covers it), at the end of
// <body> or, where the trigger stands in a modal detail card, in it (the rest of the page is inert while a
// card is open). One is open at a time. ↑ ↓ Home End PageUp PageDown move the highlight, Enter or Space
// chooses it, a letter jumps to the row that starts with what is typed, Esc closes (and is no one else's),
// Tab leaves; the focus stays on the trigger throughout, so it is there when the menu closes. A press
// outside, a scroll of the page, a resize, the window losing the focus, or the trigger leaving the page
// closes it too. It is a generated node (`.doc-choice`, the state description's runtime) that an export of
// the view leaves out, and it never prints.

const MENU = "doc-choice";
const CHECK = '<svg class="doc-choice-check" viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7"/></svg>';
const GAP = 4; // between the trigger and the card
const EDGE = 8; // the card keeps this far from the window's edge
const LEAST_HEIGHT = 96;
const TYPING = 700; // ms a typed letter waits for the next

/** @type {{ finish(row: object | null, refocus?: boolean): void, anchor: Element } | null} */
let open = null;
// A menu leaving (its fade), taken away at once when another opens.
let leaving = null;

/**
 * Rows from what a caller gives: `[value, words]`, `{ value, label?, disabled? }`, a bare string (its
 * own value and words) or `{ group: words }`, a heading that is no row to choose.
 * @param {unknown[]} options
 */
function rowsOf(options) {
  const rows = [];
  for (const entry of Array.isArray(options) ? options : []) {
    if (Array.isArray(entry)) rows.push({ value: String(entry[0]), label: String(entry[1] ?? entry[0]) });
    else if (entry !== null && typeof entry === "object" && "group" in entry) rows.push({ group: String(entry.group) });
    else if (entry !== null && typeof entry === "object") rows.push({ value: String(entry.value), label: String(entry.label ?? entry.value), disabled: Boolean(entry.disabled) });
    else rows.push({ value: String(entry), label: String(entry) });
  }
  return rows;
}

const choosable = (row) => row.value !== undefined && !row.disabled;

/**
 * The menu over `anchor` with `rows`, `current` (an index into them) checked and highlighted; resolves with
 * the row chosen, or null when the menu was dismissed. `signal` ends it from outside.
 */
function show(anchor, rows, { current = -1, signal = null, label = "", keyed = false } = {}) {
  open?.finish(null);
  leaving?.();
  const doc = anchor.ownerDocument;
  const view = doc.defaultView;
  const menu = doc.createElement("div");
  menu.className = MENU;
  // Opened from the keys it is there at once (choice.css), with no growing out of its corner.
  if (keyed) menu.classList.add("is-keyed");
  menu.setAttribute("role", "listbox");
  if (label) menu.setAttribute("aria-label", label);
  const nodes = rows.map((row, index) => {
    const node = doc.createElement("div");
    if (row.group !== undefined) {
      node.className = "doc-choice-group";
      node.setAttribute("role", "presentation");
      node.textContent = row.group;
    } else {
      node.className = "doc-choice-row";
      node.setAttribute("role", "option");
      node.setAttribute("aria-selected", String(index === current));
      if (row.disabled) node.setAttribute("aria-disabled", "true");
      const words = doc.createElement("span");
      words.className = "doc-choice-label";
      words.textContent = row.label;
      node.append(words);
      if (index === current) node.insertAdjacentHTML("beforeend", CHECK);
    }
    menu.append(node);
    return node;
  });
  const first = () => rows.findIndex(choosable);
  let active = current >= 0 && choosable(rows[current]) ? current : first();
  const light = () => nodes.forEach((node, index) => node.classList.toggle("is-active", index === active));
  const reveal = () => {
    const node = nodes[active];
    if (!node) return;
    if (node.offsetTop < menu.scrollTop) menu.scrollTop = node.offsetTop - 4;
    else if (node.offsetTop + node.offsetHeight > menu.scrollTop + menu.clientHeight) menu.scrollTop = node.offsetTop + node.offsetHeight - menu.clientHeight + 4;
  };
  const move = (to) => {
    if (to < 0 || to >= rows.length || !choosable(rows[to])) return;
    active = to;
    light();
    reveal();
  };
  const step = (from, by) => {
    for (let at = from + by; at >= 0 && at < rows.length; at += by) if (choosable(rows[at])) return at;
    return from;
  };

  // Where it stands: under the trigger, left edges together, as wide as the trigger at least; above it
  // where there is more room there; its rows scroll where neither side holds them.
  const place = () => {
    const box = anchor.getBoundingClientRect();
    const root = doc.documentElement;
    const width = root.clientWidth || view.innerWidth;
    const height = view.innerHeight;
    menu.style.minWidth = `${Math.round(box.width)}px`;
    menu.style.maxHeight = "";
    menu.style.left = "0px";
    menu.style.top = "0px";
    // Its laid-out size, not its box as drawn: it is growing from 96% just then (choice.css), which would
    // place it a little low above the trigger and let it past the window's edge.
    const size = { width: menu.offsetWidth, height: menu.offsetHeight };
    const below = height - box.bottom - GAP - EDGE;
    const above = box.top - GAP - EDGE;
    const up = size.height > below && above > below;
    const room = Math.max(LEAST_HEIGHT, up ? above : below);
    menu.style.maxHeight = `${Math.floor(room)}px`;
    const tall = Math.min(size.height, room);
    const rtl = view.getComputedStyle(anchor).direction === "rtl";
    const left = rtl ? box.right - size.width : box.left;
    menu.style.left = `${Math.round(Math.max(EDGE, Math.min(left, width - size.width - EDGE)))}px`;
    menu.style.top = `${Math.round(up ? box.top - GAP - tall : box.bottom + GAP)}px`;
    // It grows out of the corner by its trigger: the top one under it, the bottom one above it, on its side.
    menu.style.transformOrigin = `${rtl ? "right" : "left"} ${up ? "bottom" : "top"}`;
  };

  return new Promise((resolve) => {
    const controller = new AbortController();
    const { signal: own } = controller;
    let typed = "";
    let typedAt = 0;
    let done = false;
    const watcher = new view.MutationObserver((records) => {
      if (!anchor.isConnected || (anchor.localName === "select" && records.some((record) => anchor.contains(record.target)))) finish(null);
    });
    function finish(row, refocus = true) {
      if (done) return;
      done = true;
      if (open?.finish === finish) open = null;
      controller.abort();
      watcher.disconnect();
      // It leaves by its opacity (choice.css, 90ms), the pointer passing through it, then goes; one opened meanwhile
      // takes it away at once. Its class is no longer the menu's meanwhile (doc-choice-leaving), so that nothing
      // takes it for the open menu.
      const gone = () => {
        if (leaving === gone) leaving = null;
        try {
          menu.hidePopover?.();
        } catch {}
        menu.remove();
      };
      const fades = !menu.classList.contains("is-keyed") && menu.isConnected;
      if (fades) {
        leaving = gone;
        menu.classList.replace(MENU, "doc-choice-leaving");
        setTimeout(gone, 90);
      } else gone();
      if (refocus && anchor.isConnected) anchor.focus({ preventScroll: true });
      resolve(row);
    }
    open = { finish, anchor };
    signal?.addEventListener("abort", () => finish(null, false), { once: true, signal: own });
    if (signal?.aborted) return finish(null, false);

    // In the modal card the trigger is in, else at the end of <body>.
    (anchor.closest?.("dialog[open]") ?? doc.body).append(menu);
    menu.setAttribute("popover", "manual");
    try {
      menu.showPopover();
    } catch {
      menu.removeAttribute("popover"); // no popover: a fixed card, its z-index the stylesheet's
    }
    light();
    place();
    reveal();

    const inside = (target) => target instanceof view.Node && menu.contains(target);
    view.addEventListener("pointerdown", (event) => {
      if (!inside(event.target) && !(event.target instanceof view.Node && anchor.contains(event.target))) finish(null, false);
    }, { capture: true, signal: own });
    view.addEventListener("scroll", (event) => { if (!inside(event.target)) finish(null, false); }, { capture: true, signal: own });
    view.addEventListener("resize", () => finish(null, false), { signal: own });
    view.addEventListener("blur", () => finish(null, false), { signal: own });
    watcher.observe(doc.documentElement, { childList: true, subtree: true });

    // The keys are the menu's while it is open, ahead of any the page or the editor listens for.
    view.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      const take = () => {
        event.preventDefault();
        event.stopImmediatePropagation();
      };
      const key = event.key;
      // The key that opened the menu, held down, repeats: Enter or Space again is no choice.
      if (event.repeat && (key === "Enter" || key === " ")) take();
      else if (key === "Escape") {
        take();
        finish(null);
      } else if (key === "Tab") {
        finish(null, false);
      } else if (key === "ArrowDown" || key === "ArrowUp") {
        take();
        if (event.altKey) finish(choosable(rows[active] ?? {}) ? rows[active] : null);
        else move(step(active, key === "ArrowDown" ? 1 : -1));
      } else if (key === "Home" || key === "End") {
        take();
        move(key === "Home" ? first() : rows.length - 1 - [...rows].reverse().findIndex(choosable));
      } else if (key === "PageDown" || key === "PageUp") {
        take();
        const page = Math.max(1, Math.floor(menu.clientHeight / 28) - 1);
        let to = active;
        for (let count = 0; count < page; count++) to = step(to, key === "PageDown" ? 1 : -1);
        move(to);
      } else if (key === "Enter" || (key === " " && typed === "")) {
        take();
        if (choosable(rows[active] ?? {})) finish(rows[active]);
      } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        take();
        typed = Date.now() - typedAt > TYPING ? key.toLowerCase() : typed + key.toLowerCase();
        typedAt = Date.now();
        // One letter again and again goes on to the next row with it; letters together find the first.
        const same = [...typed].every((letter) => letter === typed[0]);
        const at = (from) => rows.findIndex((row, index) => index >= from && choosable(row) && row.label.trim().toLowerCase().startsWith(same ? typed[0] : typed));
        const found = same && typed.length > 1 ? (at(active + 1) >= 0 ? at(active + 1) : at(0)) : at(0);
        if (found >= 0) move(found);
        setTimeout(() => { if (Date.now() - typedAt >= TYPING) typed = ""; }, TYPING + 20);
      }
    }, { capture: true, signal: own });

    // The pointer: a row lights under it; the press keeps the focus on the trigger; a click chooses.
    menu.addEventListener("pointermove", (event) => {
      const node = event.target instanceof view.Element ? event.target.closest(".doc-choice-row") : null;
      const at = node ? nodes.indexOf(node) : -1;
      if (at >= 0 && at !== active && choosable(rows[at])) {
        active = at;
        light();
      }
    }, { signal: own });
    menu.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
    }, { signal: own });
    menu.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const node = event.target instanceof view.Element ? event.target.closest(".doc-choice-row") : null;
      const at = node ? nodes.indexOf(node) : -1;
      if (at >= 0 && choosable(rows[at])) finish(rows[at]);
    }, { signal: own });
  });
}

/**
 * The menu of a <select>'s options (its groups as headings, a disabled option a row that is not chosen),
 * its chosen option checked; resolves once it is chosen from or dismissed. A choice that differs from the
 * value sets the option and sends `input` and `change`, as the browser's popup does.
 * @param {HTMLSelectElement} select
 */
export async function chooseIn(select, { keyed = false } = {}) {
  const rows = [];
  const current = { at: -1 };
  const walk = (parent, disabled) => {
    for (const child of parent.children) {
      if (child.localName === "optgroup") {
        if (child.label) rows.push({ group: child.label });
        walk(child, disabled || child.disabled);
      } else if (child.localName === "option" && !child.hidden) {
        if (child.selected) current.at = rows.length;
        rows.push({ value: child.value, label: child.label || child.textContent.trim(), disabled: disabled || child.disabled, option: child });
      }
    }
  };
  walk(select, false);
  const row = await show(select, rows, { current: current.at, label: select.getAttribute("aria-label") ?? "", keyed });
  if (!row?.option || !select.isConnected || row.option.index === select.selectedIndex) return;
  select.selectedIndex = row.option.index;
  const view = select.ownerDocument.defaultView;
  select.dispatchEvent(new view.Event("input", { bubbles: true, composed: true }));
  select.dispatchEvent(new view.Event("change", { bubbles: true }));
}

/**
 * DocKit.choose: the menu over `anchor` (any element: a button of the block's own) with `options`;
 * resolves with the value chosen, or null when the menu is dismissed (Esc, a press outside, `signal`
 * aborted, the anchor leaving the page). Called again on the anchor of a menu that is open, it closes it.
 * @param {Element} anchor
 * @param {{ options: unknown[], value?: string | null, label?: string, signal?: AbortSignal }} settings
 * @returns {Promise<string | null>}
 */
export async function choose(anchor, { options, value = null, label = "", signal } = {}) {
  if (anchor?.nodeType !== 1) throw new Error("DocKit.choose: the first argument is the element the menu opens under");
  if (open?.anchor === anchor) {
    open.finish(null);
    return null;
  }
  const rows = rowsOf(options);
  const current = value === null || value === undefined ? -1 : rows.findIndex((row) => row.value === String(value));
  const row = await show(anchor, rows, { current, signal, label });
  return row?.value ?? null;
}

const popup = (select) => {
  if (!(select instanceof select.ownerDocument.defaultView.HTMLSelectElement)) return false;
  if (select.multiple || Number(select.getAttribute("size")) > 1 || select.disabled) return false;
  return !select.closest("fieldset:disabled");
};
const selectAt = (event, view) => {
  const node = event.target instanceof view.Element ? event.target.closest("select") : null;
  return node && popup(node) ? node : null;
};

/**
 * Take the browser's popup from every <select> of `doc`: its press, and the keys that open it, open the
 * menu above (chooseIn) instead; once, for the page and whatever is added to it later.
 * @param {Document} doc
 */
export function startChoices(doc) {
  const view = doc.defaultView;
  // The press: the browser's popup opens on mousedown, so that is what is stopped; the focus it would
  // have taken is taken here. Ahead of the page's own listeners, so none that stops the event hides it.
  view.addEventListener("mousedown", (event) => {
    if (event.button !== 0 || event.ctrlKey) return;
    const select = selectAt(event, view);
    if (!select) return;
    event.preventDefault();
    // The focus a press gives, as the browser gives it: no keyboard's ring (where the browser has the option).
    select.focus({ preventScroll: true, focusVisible: false });
    if (open?.anchor === select) open.finish(null);
    else void chooseIn(select);
  }, true);
  view.addEventListener("keydown", (event) => {
    if (event.isComposing || event.keyCode === 229 || event.defaultPrevented) return;
    const select = selectAt(event, view);
    if (!select || open) return;
    const opens = event.key === " " || event.key === "Enter" || event.key === "F4" || event.key === "ArrowDown" || event.key === "ArrowUp";
    if (!opens || event.ctrlKey || event.metaKey || event.shiftKey) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // Held down, the key repeats; it opened the menu once.
    if (!event.repeat) void chooseIn(select, { keyed: true });
  }, true);
}
