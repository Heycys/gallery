import { Z } from "../../shared/layers.mjs";
import { language } from "../../shared/i18n/index.mjs";
import { addStyle, element, fadeAway, mount } from "./ui.mjs";

// The picture of a block beside its row in a menu that adds blocks (the owner, 2026-11-17): the
// custom page's 添加自定义块 (board/index.mjs) and the custom blocks of "/" (components/installed/page.mjs).
// The list stays rows; a row whose block has its pictures (component-catalog.mjs PICTURES: the block as
// its example draws it, light and dark, which gallery block check makes) shows, while the pointer rests on
// it or the keys move onto it, a card beside the menu: the picture of the page's theme now
// (data-doc-effective-theme) and of the UI's language where the block has a pair in it (LANGUAGE_PICTURES:
// Gallery's own blocks have an English one), else its own, at its own size up to WIDEST, and the block's
// description under it. A row whose block has none keeps its tooltip of the description, as before.
//
// The card is the floating cards' (look.mjs: --ge-r-card, --ge-card-pad, the picture's corners --ge-r-row,
// --ge-shadow-card), never over the row: beside the menu at its right, else at its left, else (a narrow
// window) over the menu under the row, else above it, smaller where it has to be, and none where nothing
// leaves the row clear. It appears without moving: the picture is fetched as the menu is built (preload)
// and shown once decoded, at its size, the card placed before it is seen, then faded in (opacity alone,
// FADE; none with reduced motion); while one is shown, the next row's comes at once, no fade (WARM), as the
// tooltips along a bar do; it goes as the menus go (ui.mjs fadeAway). Its edges, the picture's and its own,
// stand on whole pixels of the screen (at the owner's 125% a 1px line at a fraction of one smears over two):
// its place, its padding, the picture's size and its height are each on the screen's step (pixelStep, snap).

/** CSS px a picture is shown at, at most: its pictures are made at this width or less, at DENSITY. */
export const WIDEST = 480;
/** Device pixels to a CSS pixel in a picture (src/cli/block-picture.mjs DENSITY). */
export const DENSITY = 2;
const TALLEST = 480; // CSS px the picture is shown at, at most
const DELAY = 150; // ms the pointer rests on a row (the keys stay on one) before its card shows
const LEAVE = 100; // ms after the pointer left a row before its card goes, unless it came onto another
const WARM = 300; // ms after a card went in which the next shows at once
const GAP = 6; // px between the menu and the card
const MARGIN = 8; // px the card keeps from the window's edges
const PAD = 5; // the cards' padding (look.mjs --ge-card-pad), where previewPlace is asked without the card's own

const STYLE = `
  .ge-preview {
    position: fixed; left: 0; top: 0; z-index: ${Z.card}; box-sizing: border-box; padding: var(--ge-card-pad); border-radius: var(--ge-r-card);
    background: var(--ge-bg); color: var(--ge-tx2); pointer-events: none;
    box-shadow: var(--ge-shadow-card);
    font: 12px/1.5 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Helvetica, "PingFang SC", "Microsoft YaHei", Arial, sans-serif;
    animation: ge-preview-in 120ms ease-out;
  }
  .ge-preview[data-instant] { animation: none; }
  .ge-preview[data-measuring] { visibility: hidden; animation: none; }
  /* The picture, its corners a row's, its hairline drawn over its edge (an inset shadow over it: an outline is drawn 1.25 device
     pixels wide at 125%, this one --ge-preview-line, a whole number of them). */
  .ge-preview-picture { position: relative; border-radius: var(--ge-r-row); }
  .ge-preview-picture img { display: block; max-width: none; border-radius: inherit; }
  .ge-preview-picture::after { content: ""; position: absolute; inset: 0; border-radius: inherit; box-shadow: inset 0 0 0 var(--ge-preview-line, 1px) var(--ge-line); pointer-events: none; }
  .ge-preview-says { padding: 6px 7px 2px; overflow-wrap: break-word; }
  .ge-preview-says:empty { display: none; }
  @keyframes ge-preview-in { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .ge-preview { animation: none; } }
`;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/**
 * The size a picture of `natural` CSS px ({ width, height }) is shown at within `most` ({ width, height }):
 * its own, or smaller by one scale for both, never larger.
 */
export function shownSize(natural, most) {
  const scale = Math.min(1, most.width / natural.width, most.height / natural.height);
  return { width: Math.max(1, Math.floor(natural.width * scale)), height: Math.max(1, Math.floor(natural.height * scale)) };
}

/**
 * The step a length of the card is laid on so that it is a whole number of device pixels on a screen of
 * `ratio` device pixels to a CSS pixel, as the browser lays it out: it keeps a length in 64ths of a CSS
 * pixel, so at 1.25 a device pixel (0.8) is no length it has (4.8 is laid out as 4.797, its edge a fiftieth
 * of a pixel off, which smears it), and the least that is both is 4 (5 device pixels); at 1, 1; at 1.5, 2;
 * at 2, 0.5. A screen whose step would be more than 4 takes whole device pixels, the nearest it has.
 */
export function pixelStep(ratio) {
  const scale = ratio > 0 ? ratio : 1;
  for (let count = 1; count / scale <= 4; count++) {
    const step = count / scale;
    if (Math.abs(step * 64 - Math.round(step * 64)) < 1e-6) return step;
  }
  return 1 / scale;
}

/** `value` CSS px on the step of a screen of `ratio` (pixelStep): the nearest, or with `how` "down" or "up" the one under or over it. */
export function snap(value, ratio, how = "near") {
  const step = pixelStep(ratio);
  const steps = value / step;
  return (how === "down" ? Math.floor(steps + 1e-6) : how === "up" ? Math.ceil(steps - 1e-6) : Math.round(steps)) * step;
}

/**
 * Where a card of `size` stands for the row `row` of the menu card `menu` (client rects) in a window of
 * `view` ({ width, height }): { left, top, side } or null. Right of the menu, its top level with the row's
 * (within the window), else left of it; else over the menu, under the row, else above it. Never over the row.
 * `pad`: the card's padding, by which its picture's top is level with the row's.
 */
export function previewPlace(row, menu, size, view, pad = PAD) {
  const top = clamp(row.top - pad, MARGIN, view.height - MARGIN - size.height);
  if (menu.right + GAP + size.width <= view.width - MARGIN) return { left: menu.right + GAP, top, side: "right" };
  if (menu.left - GAP - size.width >= MARGIN) return { left: menu.left - GAP - size.width, top, side: "left" };
  const left = clamp(menu.left, MARGIN, Math.max(MARGIN, view.width - MARGIN - size.width));
  if (row.bottom + GAP + size.height <= view.height - MARGIN) return { left, top: row.bottom + GAP, side: "below" };
  if (row.top - GAP - size.height >= MARGIN) return { left, top: row.top - GAP - size.height, side: "above" };
  return null;
}

// The room a card may take beside the menu (right or left of it, the window's height) or, in a narrow
// window, under or above the row: its picture's greatest { width, height }, `words` the height the
// description takes, `pad` the card's padding.
function roomFor(row, menu, view, words, pad) {
  const chrome = 2 * pad;
  const beside = Math.max(view.width - MARGIN - (menu.right + GAP), menu.left - GAP - MARGIN);
  if (beside >= 200 + chrome) return { width: Math.min(WIDEST, beside - chrome), height: Math.min(TALLEST, view.height - 2 * MARGIN - chrome - words) };
  const across = view.width - 2 * MARGIN - chrome;
  const tall = Math.max(view.height - MARGIN - (row.bottom + GAP), row.top - GAP - MARGIN) - chrome - words;
  return { width: Math.min(WIDEST, across), height: Math.min(TALLEST, tall) };
}

let shared = null;

/** The card taken away, where there is one: a menu closed, filtered anew, or not a menu of blocks. */
export const hideBlockPreview = () => shared?.hide();

/** The keys moved a menu's highlight onto `row` (null: off every row): its card where it has a picture, else none. */
export const keyedBlockPreview = (row) => (row?.blockPreview ? blockPreview().keyed(row) : shared?.hide());

/**
 * The address of the picture a row's `preview` ({ picture, says }) shows in `theme`: of the UI's language's
 * pair where its block has one, else of its own; null where it has none.
 */
export function pictureAddress(preview, theme, inLanguage = language) {
  const picture = preview?.picture;
  if (!picture) return null;
  return (picture[inLanguage] ?? picture)[theme] ?? null;
}

/**
 * The page's one card (one menu adds blocks at a time): { watch(row, preview), keyed(row), hide(), shown }.
 * `preview`: a row's { picture: { light, dark, <language>?: { light, dark } }, says }.
 */
export function blockPreview() {
  if (shared) return shared;
  addStyle(STYLE);
  const pictures = new Map(); // address -> Promise of the decoded <img>, or null where it does not load
  let card = null;
  let shownRow = null;
  let timer = 0;
  let leaving = 0;
  let warmUntil = 0;
  let asked = null; // the row whose card is wanted now
  const scrolled = new WeakSet(); // the menus whose scroll moves the card with its row

  const theme = () => (document.documentElement.dataset.docEffectiveTheme === "dark" ? "dark" : "light");
  const addressOf = (preview) => pictureAddress(preview, theme());
  const load = (address) => {
    if (!pictures.has(address)) {
      const img = new Image();
      img.decoding = "async";
      img.alt = "";
      img.src = address;
      pictures.set(address, img.decode().then(() => img, () => {
        pictures.delete(address); // tried again the next time
        return null;
      }));
    }
    return pictures.get(address);
  };

  // The card taken away: faded as a menu goes (`fade`), or at once (another takes its place).
  function hide(warm = false, fade = true) {
    clearTimeout(timer);
    clearTimeout(leaving);
    asked = null;
    if (card && warm) warmUntil = performance.now() + WARM;
    shownRow?.removeAttribute("aria-describedby");
    if (card && fade && !card.hasAttribute("data-measuring")) fadeAway(card);
    else card?.remove();
    card = null;
    shownRow = null;
  }

  // The card of `row` drawn and placed (`instant`: no fade), once its picture is decoded.
  async function draw(row, instant) {
    const preview = row.blockPreview;
    const address = addressOf(preview);
    asked = row;
    const img = address ? await load(address) : null;
    if (asked !== row || !row.isConnected) return;
    const menu = row.closest(".ge-pop");
    if (!img || !menu) return hide();
    const natural = { width: img.naturalWidth / DENSITY, height: img.naturalHeight / DENSITY };
    const view = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
    const ratio = globalThis.devicePixelRatio || 1;
    const next = element("div", { class: "ge-preview", role: "tooltip", id: "ge-preview", "data-measuring": "", ...(instant || card ? { "data-instant": "" } : {}) });
    const words = element("div", { class: "ge-preview-says", text: preview.says ?? "" });
    next.append(element("div", { class: "ge-preview-picture" }, img), words);
    const rowBox = row.getBoundingClientRect();
    const menuBox = menu.getBoundingClientRect();
    shownRow?.removeAttribute("aria-describedby");
    card?.remove();
    card = mount(next);
    // The padding the cards have (--ge-card-pad), on the screen's step (pixelStep: 4 at 125%, 5 at 100%).
    const pad = Math.max(pixelStep(ratio), snap(parseFloat(getComputedStyle(next).paddingTop), ratio, "down"));
    // The picture's hairline a whole number of device pixels wide, the nearest to 1px: one of them at 125%.
    next.style.setProperty("--ge-preview-line", `${Math.max(1, Math.round(ratio)) / ratio}px`);
    next.style.padding = `${pad}px`;
    // The words wrap at the picture's width: measured at the widest it may be, then at the width it takes.
    let size = shownSize(natural, roomFor(rowBox, menuBox, view, 0, pad));
    const fit = () => {
      const width = snap(size.width, ratio, "down");
      img.style.width = `${width}px`;
      img.style.height = `${Math.max(pixelStep(ratio), snap(width * natural.height / natural.width, ratio))}px`; // its height by its width, its shape kept
      next.style.width = `${width + 2 * pad}px`;
      next.style.height = "";
    };
    fit();
    const said = words.offsetHeight;
    size = shownSize(natural, roomFor(rowBox, menuBox, view, said, pad));
    fit();
    // Its foot on the step too (the words' lines, 18px, are 22.5 device pixels at 125%): as tall as it is, up to the next one.
    next.style.height = `${snap(next.getBoundingClientRect().height, ratio, "up")}px`;
    const place = previewPlace(rowBox, menuBox, { width: next.offsetWidth, height: next.getBoundingClientRect().height }, view, pad);
    if (!place) return hide(false, false);
    next.style.left = `${snap(place.left, ratio)}px`;
    next.style.top = `${snap(place.top, ratio)}px`;
    next.dataset.side = place.side;
    next.removeAttribute("data-measuring");
    shownRow = row;
    row.setAttribute("aria-describedby", next.id);
    // The list scrolled (the keys bring a row into sight, the wheel): the card goes with its row, or with it out of sight.
    if (!scrolled.has(menu)) {
      scrolled.add(menu);
      menu.addEventListener("scroll", () => {
        if (!card || !shownRow || shownRow.closest(".ge-pop") !== menu) return;
        const box = shownRow.getBoundingClientRect();
        const room = menu.getBoundingClientRect();
        if (box.bottom <= room.top || box.top >= room.bottom) hide();
        else draw(shownRow, true);
      }, { passive: true });
    }
  }

  // The card of `row` wanted: at once while one shows (or just went), else after DELAY.
  function want(row) {
    clearTimeout(timer);
    clearTimeout(leaving);
    if (!addressOf(row.blockPreview)) return hide();
    if (row === shownRow && card) return;
    const warm = Boolean(card) || performance.now() < warmUntil;
    asked = row;
    if (warm) draw(row, true);
    else timer = setTimeout(() => draw(row, false), DELAY);
  }

  shared = {
    /** The card shown while the pointer rests on `row` (a menu's), whose block's picture `preview` says ({ picture, says }). */
    watch(row, preview) {
      row.blockPreview = preview;
      const address = addressOf(preview);
      if (address) load(address); // fetched now, so that it is there when asked for
      row.addEventListener("pointerenter", () => want(row));
      row.addEventListener("pointerleave", () => {
        clearTimeout(timer);
        if (asked === row && !card) asked = null;
        leaving = setTimeout(() => { if (shownRow === row || asked === null) hide(true); }, LEAVE);
      });
      row.addEventListener("pointerdown", () => hide());
    },
    /** The keys moved the highlight onto `row` (or off every row: null): its card, where it has one, else none. */
    keyed(row) {
      if (row?.blockPreview) want(row);
      else hide();
    },
    hide: () => hide(),
    /** Whether a card stands now, and for which row (the tests'). */
    get shown() { return card ? shownRow : null; },
  };
  return shared;
}
