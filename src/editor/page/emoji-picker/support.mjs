import { workspaceAddress } from "../../../shared/workspace-address.mjs";
import { Z } from "../../../shared/layers.mjs";
import { escapeMarkup } from "../../../shared/escape.mjs";
import { icon } from "./icons.mjs";
import { setEmojiLibraryStorage } from "../../../shared/emoji/custom.mjs";
import { UPLOAD_LIMITS, sizeLimit } from "../../../shared/media.mjs";
import { blobBase64, failure, postAnswer } from "../post.mjs";
import { hideTooltip as hideBubble, showTooltipAt } from "../tooltip.mjs";
import { placeBox } from "../placement.mjs";
import { addStyle, appear, fadeAway, mount } from "../ui.mjs";
import { PICKER_CSS } from "./styles.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// What the icon picker (index, emoji-tab, icon-tab, upload, grid) stands on: its popups (placed by an
// origin, a side and an alignment, flipped where they do not fit, kept 12px inside the window, fading
// in; a press outside every one closes them all, one inside closes those above it), its tooltip (the
// editor's own, tooltip.mjs), its messages (the editor's status line), where its uploads and custom
// emojis go (Gallery's server: the document's own folder, the workspace's library) and its styles. The
// picker's own (styles.mjs) read the editor's palette (page/look.mjs); the older palette (--c-*, --ca-*,
// light and dark) stays on the layer for the media menu (media-menu/) and the image's alignment bar
// (components/image/page.mjs), which still read it. Everything drawn carries data-doc-dev.

export const esc = (s) => escapeMarkup(String(s ?? "")).replaceAll("'", "&#39;");
export { icon };

// ---------- styles ----------

// The older palette, light and dark: the media menu's and the image's alignment bar's (the picker reads --ge-*).
const TOKENS = `
  --ca-bacIntTra: light-dark(rgba(33,27,23,.05), rgba(255,255,255,.055));
  --ca-bacSecTra: light-dark(rgba(66,35,3,.03), rgba(252,252,252,.03));
  --ca-bluBacSecTra: light-dark(rgba(0,124,215,.094), rgba(67,155,255,.24));
  --ca-borPriTra: light-dark(rgba(28,19,1,.11), rgba(255,255,235,.1));
  --ca-borSecTra: light-dark(rgba(42,28,0,.07), rgba(255,255,243,.082));
  --ca-borStrTra: light-dark(rgba(27,21,0,.19), rgba(255,252,235,.306));
  --ca-graBacIntTra: light-dark(rgba(33,27,23,.05), rgba(255,255,255,.055));
  --ca-graBacPriTra: light-dark(rgba(66,35,3,.03), rgba(252,252,252,.03));
  --ca-swiTogDesTraBgVar: light-dark(rgba(206,205,202,.3), rgba(202,204,206,.3));
  --c-bacAccPri: #2c2c2b; --c-bluBacAccPri: #2783de; --c-graTexAccPri: #8e8b86; --c-redTexAccPri: #e56458;
  --c-texInvPri: #f0efed; --c-texInvSec: #ada9a3;
  --c-borPri: light-dark(#e6e5e3, #383836); --c-borSec: light-dark(#f0efed, #2c2c2b);
  --c-butBluFocRin: light-dark(0px 0px 0px 2px #f8f8f7, 0px 0px 0px 2px #191919), 0px 0px 0px 4px #2383e2;
  --c-icoPri: light-dark(#383836, #e6e5e3); --c-icoSec: light-dark(#8e8b86, #ada9a3); --c-icoTer: light-dark(#ada9a3, #7d7a75);
  --c-inpBluFocRin: 0px 0px 0px 1px #2383e2 inset, 0px 0px 0px 1px #2383e2;
  --c-popBac: light-dark(#fff, #252525); --c-priBla: light-dark(#000, #fff); --c-whi: light-dark(#fff, #000);
  --c-shaOutLg: 0px 20px 24px 0px light-dark(rgba(25,25,25,.05), rgba(25,25,25,.2)), 0px 5px 8px 0px light-dark(rgba(25,25,25,.027), rgba(25,25,25,.118)), 0px 0px 0px 1px light-dark(rgba(42,28,0,.07), #383836);
  --c-texPri: light-dark(#2c2c2b, #f0efed); --c-texSec: light-dark(#7d7a75, #ada9a3); --c-texTer: light-dark(#a19e99, #7d7a75);
`;
const FONT = `ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Helvetica, "PingFang SC", "Microsoft YaHei", Arial, sans-serif`;

/** The popups' layer and the picker's styles (styles.mjs), added once. */
export function style() {
  addStyle(`
    .ge-popup-layer { ${TOKENS} }
    .ge-popup-layer { position: fixed; inset: 0; pointer-events: none; z-index: ${Z.menu}; font: 14px/1.2 ${FONT}; color: var(--c-texPri); }
    .ge-popup { position: fixed; pointer-events: auto; }
    .ge-popup-layer .ge-picker-scroller { scrollbar-width: thin; scrollbar-color: var(--ge-edge) transparent; }
    ${PICKER_CSS}
  `);
}

// ---------- popups ----------

const MARGIN = 12;
const stack = [];
let layer = null;

function ensureLayer() {
  style();
  if (!layer?.isConnected) {
    layer = document.createElement("div");
    layer.className = "ge-popup-layer";
    mount(layer);
  }
  return layer;
}
document.addEventListener("mousedown", (event) => {
  if (!stack.length) return;
  const inside = stack.findLastIndex((popup) => popup.el.contains(event.target));
  if (inside === stack.length - 1) return;
  closePopup(stack[inside + 1]);
}, true);

/** Whether a popup is open (a press outside it closes it). */
export const popupOpen = () => stack.length > 0;

/** A popup holding `content`: { el, closed, close(), place(origin) }. */
export function openPopup({ origin, placement = "bottom", align = "start", gap = 0, content, onClose, className = "" }) {
  const el = document.createElement("div");
  el.className = "ge-popup" + (className ? ` ${className}` : "");
  el.append(content);
  ensureLayer().append(el);
  const popup = { el, closed: false, close: () => closePopup(popup), place: (next) => place(popup, next || popup.origin), origin, placement, align, gap, onClose };
  stack.push(popup);
  place(popup, origin);
  el.classList.add("shown");
  // Its opacity alone comes, as a card the reader types into (ui.mjs appear: the picker's search, the media menu's address).
  appear(el, null, { typed: true });
  return popup;
}

export function closePopup(popup) {
  const at = stack.indexOf(popup);
  if (at < 0) return;
  for (const each of stack.splice(at).reverse()) { // those above it go with it
    each.closed = true;
    fadeAway(each.el); // a picture of it fades out (ui.mjs), the popup itself gone at once
    each.onClose?.();
  }
}

function place(popup, origin) {
  popup.origin = origin;
  const { el, placement, align, gap } = popup;
  const { left, top } = placeBox(origin, { width: el.offsetWidth, height: el.offsetHeight }, { placement, align, gap, margin: MARGIN });
  el.style.top = `${top}px`;
  el.style.left = `${left}px`;
}

// ---------- the tooltip ----------

// The editor's own (tooltip.mjs): the picker only decides when it shows (a pause of 150ms, never
// while the keys move) and where (below, left edge or centered).
let timer = 0;
let keyboardMode = false;
addEventListener("keydown", () => { keyboardMode = true; }, true);
addEventListener("mousemove", () => { keyboardMode = false; }, true);

export function showTooltip(origin, text, { placement = "bottom", align = "center" } = {}) {
  showTooltipAt(origin, text, { placement, align });
}
export const isKeyboardMode = () => keyboardMode;
export function hideTooltip() {
  clearTimeout(timer);
  hideBubble();
}
export function hoverTooltip(target, content, { placement = "top", align, delay = 150 } = {}) {
  target.addEventListener("mouseenter", () => {
    clearTimeout(timer);
    if (keyboardMode) return;
    timer = setTimeout(() => {
      if (target.isConnected) showTooltip(target.getBoundingClientRect(), typeof content === "function" ? content() : content, { placement, align });
    }, delay);
  });
  target.addEventListener("mouseleave", hideTooltip);
  target.addEventListener("mousedown", hideTooltip);
}

// ---------- the snackbar, the storage ----------

let say = (text) => console.info(text);
/** The editor's status line, for what the picker tells the reader. */
export const showSnackbar = (text) => say(text);

const MAX_SIDE = 512; // px: an icon shows at 56; a larger image is made this size before it is sent
const MAX_BYTES = UPLOAD_LIMITS.icon; // what the server keeps of an icon's image (shared/media.mjs)

// An image as the server takes it: a raster image larger than MAX_SIDE made that size (PNG), others as they are.
async function shrink(blob) {
  if (!/^image\/(png|jpeg|webp|avif)$/.test(blob.type)) return blob;
  const bitmap = await createImageBitmap(blob).catch(() => null);
  if (!bitmap || Math.max(bitmap.width, bitmap.height) <= MAX_SIDE) return blob;
  const scale = MAX_SIDE / Math.max(bitmap.width, bitmap.height);
  const canvas = new OffscreenCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return canvas.convertToBlob({ type: "image/png" });
}

/** An error whose message tells the reader why (`said`: the upload form shows it as it is). */
export const saidError = (message) => Object.assign(new Error(message), { said: true });

let server = null; // { slug, token }
async function post(route, body) {
  const answer = await postAnswer(`/__gallery/edit/${route}`, server.token, { slug: server.slug, ...body });
  if (answer.ok) return answer;
  const why = failure(answer, null); // the server's reason in the UI's language, or that it cannot be reached
  throw why ? saidError(why) : new Error(t("请求失败"));
}

/** Where uploads go: the report's own folder (assets/), and the workspace's emoji library. */
export const uiStorage = {
  /** An image the reader chose: stored in the report's folder; its path there (assets/<file>). */
  async saveFile(blob, name) {
    const image = await shrink(blob);
    if (image.size > MAX_BYTES) throw saidError(t("图片太大（最多 {0}）", sizeLimit("icon")));
    return (await post("upload", { name, type: image.type, data: await blobBase64(image) })).path;
  },
  /** An image from a link: downloaded by the server into the report's folder; its path, or null. */
  async importImage(url, name) {
    try {
      return (await post("upload", { name, url })).path;
    } catch {
      return null;
    }
  },
};

/**
 * The page's: `slug` and `token` (the edit service's), and `notify(text)`, the status line. The
 * emoji library answers through the same server (custom.mjs).
 */
export function connectPicker({ slug, token, notify }) {
  server = { slug, token };
  say = notify;
  setEmojiLibraryStorage({
    loadEmojiLibrary: () => fetch(workspaceAddress(`/__gallery/edit/emoji-library`)).then((response) => response.json()).then((answer) => (answer.list ?? []).map(entry => ({ ...entry, url: workspaceAddress(entry.url) }))).catch(() => []),
    addEmoji: async ({ name, url }) => { const entry = (await post("emoji-library", { name, url })).entry; return { ...entry, url: workspaceAddress(entry.url) }; },
  });
}
