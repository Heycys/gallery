import { appear, element } from "../ui.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { ROW } from "./list.mjs";
import { ticksOf } from "./tree.mjs";

// The outline's narrow form (outline/index.mjs shows it where the page has no room for the list:
// margin.mjs): a strip at the window's right edge of short lines, a line a row
// shown (folds kept), as wide as the row is shallow, the current heading's dark; 240px of lines at the
// most (tree.mjs ticksOf: a long report's deepest levels left out).
//
// The pointer reaching it shows the list as a card beside it at once (faded in, sliding a little from
// the strip), its top level with the strip's, and each line is a target of its own: the one nearest the
// pointer turns blue and stands out (longer, thicker), and the card lights its row (index.mjs: filled
// as under the pointer, a blue segment on the guide), kept in view; moving up and down moves both. The
// pointer over the card's rows lights their lines the same way. A click on a line goes to its heading
// (`choose`), as a click on a row does; the card stays while the pointer is on the strip or the card,
// and goes a moment after it leaves both (faded out), or at a press elsewhere.
//
// The keyboard: the strip is one button (Enter or Space opens the card with the focus in its list;
// again, or Esc in the list, closes it with the focus back on the strip; the focus leaving both (Tab)
// or a heading chosen by a key closes it too). Esc on the strip itself leaves it as Esc in the list
// does (escape). Folding in the card keeps it open; it follows the page's scroll (its current row)
// while open, unless the pointer is on it. With no headings the strip shows the outline's icon.
//
// The card's guide (its list's hairline) has a grip of its own (`guide`, a few px either side of it):
// index.mjs makes a click on it take the reader's collapse back (the list in full where the room allows it).

// Three lines, the lower two set in: the 目录 icon (the workbench's 更多 row draws the same, icons.ts outline).
export const OUTLINE_ICON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3.75 5.25h12.5M7.25 10h9M7.25 14.75h9"/></svg>';
export const STRIP_TOP = 54; // the lines' top in the window, and their card's
const ROOM = 16 + 16; // their padding and a margin below them
const HIDE = 280; // ms the card stays after the pointer left the strip and the card
const SHOW = { ms: 140 }; // the strip coming: a fade (its card comes as every card does: ui.mjs appear; it goes by its opacity, 90ms)
const FADE = { top: 24, bottom: 32 }; // the card's faded ends (index.mjs STYLE): a lit row kept clear of them

const still = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/**
 * list: list.mjs (shown in the card). opened(), closed(): the card opened, closed. escape(): Esc on
 * the strip. choose(row): a line clicked, row its index in the rows drawn.
 */
export function createStrip({ list, opened, closed, escape, choose }) {
  const button = element("div", { class: "ge-outline-ticks", role: "button", tabindex: "0", "aria-label": t("目录"), "aria-expanded": "false" });
  const strip = element("div", { class: "ge-outline-strip", "data-doc-dev": "", hidden: "" }, button);
  // Its guide's grip in its scroller, before the list, placed by the card (as the dock's: index.mjs).
  const guide = element("div", { class: "ge-outline-card-grip", "aria-hidden": "true" });
  const scroll = element("div", { class: "ge-outline-scroll" }, guide);
  const card = element("nav", { class: "ge-outline-card", "aria-label": t("目录"), "data-doc-dev": "", hidden: "" }, scroll);
  let open = false;
  let keyed = false; // opened by a key (the focus in it), not by the pointer
  let over = false; // the pointer on the strip or the card
  let drawn = "";
  let ticks = []; // the lines drawn: { row, width }
  let lines = []; // and their nodes
  let hot = -1; // the row lit (a line under the pointer, or a row of the card)
  let hideTimer = 0;

  /** The lines for `rows` (tree.mjs rowsOf), row `marked` the current one. */
  function draw(rows, marked) {
    const height = Math.max(40, innerHeight - STRIP_TOP - ROOM);
    const drawing = ticksOf(rows, height, marked);
    const key = `${height}:${drawing.gap}:${drawing.current}:${drawing.ticks.map((tick) => `${tick.row}.${tick.width}`).join(",")}`;
    if (key === drawn) return;
    drawn = key;
    ticks = drawing.ticks;
    if (!rows.length) {
      lines = [];
      button.style.removeProperty("--ge-tick-gap");
      button.replaceChildren(element("span", { class: "ge-outline-none", html: OUTLINE_ICON }));
      return;
    }
    button.style.setProperty("--ge-tick-gap", `${drawing.gap}px`);
    lines = ticks.map((tick, index) => {
      const line = element("i");
      line.style.setProperty("--ge-tick", `${tick.width}px`);
      if (index === drawing.current) line.dataset.current = "";
      return line;
    });
    button.replaceChildren(...lines);
    paint();
  }

  // The line that stands for row `row`: its own, or (left out) the last line before it.
  function lineOf(row) {
    let at = -1;
    if (row >= 0) ticks.forEach((tick, index) => { if (tick.row <= row) at = index; });
    return at;
  }

  function paint() {
    const at = lineOf(hot);
    lines.forEach((line, index) => line.toggleAttribute("data-hot", index === at));
  }

  // The line nearest the pointer's height (the gaps and the strip's ends belong to the nearest).
  function lineAt(y) {
    let best = -1;
    let distance = Infinity;
    lines.forEach((line, index) => {
      const rect = line.getBoundingClientRect();
      const off = Math.abs(y - (rect.top + rect.bottom) / 2);
      if (off < distance) {
        distance = off;
        best = index;
      }
    });
    return best;
  }

  // Row `row` lit, its line and its row in the card; `keep`: the card scrolled to show it (the
  // pointer on the strip, not on the card's rows themselves).
  function light(row, { keep = false } = {}) {
    if (row === hot) return;
    hot = row;
    paint();
    const node = list.light(open ? row : -1);
    if (keep && node) inView(node);
  }

  // As little scrolled as shows `node` whole, clear of the card's faded ends.
  function inView(node) {
    const top = node.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
    const view = scroll.clientHeight;
    if (top - FADE.top < scroll.scrollTop) scroll.scrollTop = Math.max(0, top - FADE.top);
    else if (top + ROW + FADE.bottom > scroll.scrollTop + view) scroll.scrollTop = Math.min(scroll.scrollHeight - view, top + ROW + FADE.bottom - view);
  }

  function showCard() {
    for (const animation of card.getAnimations?.() ?? []) animation.cancel();
    card.hidden = false;
    appear(card, button.getBoundingClientRect()); // out of its corner by the strip, as every card comes (ui.mjs)
  }

  function hideCard() {
    if (card.hidden) return;
    const animation = still() ? null : card.animate?.([{ opacity: 1 }, { opacity: 0 }], { duration: 90, easing: "ease-out", fill: "forwards" });
    const finish = () => {
      animation?.cancel();
      if (!open) card.hidden = true;
    };
    if (animation) animation.onfinish = finish;
    else finish();
  }

  /** Open the card; `focus`: by a key, the focus in its list (on its current row). */
  function openCard({ focus = false } = {}) {
    clearTimeout(hideTimer);
    if (open) {
      if (focus) {
        keyed = true;
        list.focus(list.marked >= 0 ? list.marked : 0);
      }
      return;
    }
    open = true;
    keyed = focus;
    button.setAttribute("aria-expanded", "true");
    if (list.node.parentNode !== scroll) scroll.append(list.node);
    showCard();
    // The row lit (else the current one) in the card's middle (as far as the list goes), not at its edge.
    const shown = list.light(hot);
    const row = shown ?? list.rowAt(list.marked);
    if (row) {
      const top = row.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop;
      scroll.scrollTop = Math.max(0, Math.min(scroll.scrollHeight - scroll.clientHeight, Math.round(top - (scroll.clientHeight - ROW) / 2)));
    }
    if (focus) list.focus(list.marked >= 0 ? list.marked : 0);
    opened?.();
  }

  /** Close the card; `focus`: the focus back on the strip (Esc in it). */
  function closeCard({ focus = false } = {}) {
    clearTimeout(hideTimer);
    if (!open) return;
    open = false;
    keyed = false;
    over = button.matches(":hover"); // (the card going from under a still pointer tells no leaving)
    button.setAttribute("aria-expanded", "false");
    list.light(-1);
    hideCard();
    if (focus) button.focus({ preventScroll: true });
    closed?.();
  }

  const inside = (node) => Boolean(node && (card.contains(node) || button.contains(node)));
  const focusIn = () => inside(document.hasFocus() ? document.activeElement : null);

  // The pointer: on the strip, the card at once and the line nearest it lit; leaving both, the card
  // goes a moment later (crossing the gap to the card keeps it), unless the keys opened it and hold
  // the focus in it. A touch has no leaving: its card stays until a press elsewhere.
  function enter() {
    over = true;
    clearTimeout(hideTimer);
  }
  function leave(event) {
    if (event.pointerType === "touch" || inside(event.relatedTarget)) return;
    over = false;
    light(-1);
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      if (!over && !(keyed && focusIn())) closeCard();
    }, HIDE);
  }
  button.addEventListener("pointerenter", (event) => {
    enter();
    openCard();
    light(ticks[lineAt(event.clientY)]?.row ?? -1, { keep: true });
  });
  button.addEventListener("pointermove", (event) => light(ticks[lineAt(event.clientY)]?.row ?? -1, { keep: true }));
  button.addEventListener("pointerleave", leave);
  card.addEventListener("pointerenter", enter);
  card.addEventListener("pointerleave", leave);
  // A row of the card under the pointer: its line lit on the strip.
  card.addEventListener("pointerover", (event) => {
    const row = event.target?.closest?.(".ge-outline-row");
    light(row ? Number(row.dataset.index) : -1);
  });

  // A click on the strip goes to the heading of the line nearest it (a key's click is the keys' below).
  button.addEventListener("click", (event) => {
    if (event.detail === 0) return;
    const row = ticks[lineAt(event.clientY)]?.row;
    if (row !== undefined) choose?.(row);
    else openCard();
  });
  button.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !open && !event.isComposing) {
      event.preventDefault();
      escape?.();
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (open && keyed) closeCard({ focus: true });
    else openCard({ focus: true });
  });
  // A press anywhere but on the strip and its card closes the card.
  document.addEventListener("pointerdown", (event) => {
    if (open && !inside(event.target)) closeCard();
  }, true);
  // So does the focus leaving both (Tab out of it, to the workbench or another window, as the block
  // menu closes), unless the pointer holds it there: looked at once the focus has settled, since rows
  // drawn again (a fold) take the focus with them and give it back.
  const left = () => setTimeout(() => {
    if (open && !over && !focusIn()) closeCard();
  }, 0);
  card.addEventListener("focusout", left);
  button.addEventListener("focusout", left);

  return {
    strip,
    card,
    scroll,
    guide,
    draw,
    openCard,
    closeCard,
    get open() { return open; },
    /** Whether the keys opened the card (a heading chosen by a key closes it; by the pointer, it stays while the pointer is on it). */
    get keyed() { return keyed; },
    focusButton: () => button.focus({ preventScroll: true }),
    /** Show the strip (or take it away, its card with it). `fade`: it comes faded in. */
    show(on, { fade = false } = {}) {
      clearTimeout(hideTimer);
      if (!on) {
        if (open) {
          open = false;
          keyed = false;
          button.setAttribute("aria-expanded", "false");
          for (const animation of card.getAnimations?.() ?? []) animation.cancel();
          card.hidden = true;
        }
        over = false;
        hot = -1;
        list.light(-1);
        strip.hidden = true;
        return;
      }
      if (list.node.parentNode !== scroll) scroll.append(list.node);
      drawn = "";
      for (const animation of strip.getAnimations?.() ?? []) animation.cancel();
      strip.hidden = false;
      if (fade && !still()) strip.animate?.([{ opacity: 0 }, { opacity: 1 }], { duration: SHOW.ms, easing: "ease-out" });
    },
    holds: (target) => strip.contains(target) || card.contains(target),
  };
}
