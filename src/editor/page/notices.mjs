import { Z } from "../../shared/layers.mjs";
import { PANEL_STYLE, barPlace, onPanels, panelGone, panelRoom, panelShown } from "./panel.mjs";
import { addStyle, element, fadeIn, fadeOut, mount, textButton } from "./ui.mjs";
import { t } from "../../shared/i18n/index.mjs";
import { preference } from "../../shared/preferences.mjs";
import { routine } from "./quiet.mjs";

// What the editor tells the reader: a short notice at the bottom (a toast, as the workbench shows
// its own), and a panel for what needs more room (texts to copy). There is no toolbar: the page
// saves by itself, undo and redo are Ctrl+Z / Ctrl+Y, exporting is the workbench's. In a workbench
// the notice is the workbench's toast (the session's `notice`, relay()); on its own the page shows
// one that looks the same.
//
// A note shows for a few seconds, an error a little longer (and until the reader goes on editing,
// messageKind), a prompt for 15 seconds or until it is replaced. A hint is a note that says what the
// pointer resting there says too (hints/: why a click landed on what cannot be edited).
//
// No notice covers a bottom panel (panel.mjs: the conflicts', the lost texts', the bar of the Agent's
// changes). On the page alone the toast follows the bar's rule (the user's of 2026-11-14 for the bar, over
// the picture of two writing at once): it stays on the bottom line and moves sideways, no further than it
// must, to clear a card by 8px (panel.mjs barPlace), standing 8px above the bar where the two would meet,
// and over the cards (ABOVE) only where no place beside them is wide enough (a narrow window); until
// 2026-11-17 a conflict card at the left threw it up the page, over the very lines in conflict. In a
// workbench, which shows the notice itself, it is told the room the panels take (relayRoom) and stands
// above them.
//
// Both toasts are as wide as their words, at most 640px and the window less 32px, in the middle of the
// window, their words wrapping past that: left: 0 and right: 0 with margins that share what is left,
// so that the box has the whole window to be as wide as.

const STYLE = `
  /* In the middle of the page: the page's scrollbar room off its right while a detail card holds the page still (the kit's dialog.css, --doc-page-bar). */
  .ge-toast { position: fixed; left: 0; right: var(--doc-page-bar, 0px); bottom: 24px; z-index: ${Z.toast}; display: flex; align-items: center; gap: 10px; box-sizing: border-box; width: fit-content; max-width: min(640px, calc(100vw - 32px)); margin: 0 auto; padding: 8px 14px; border-radius: 8px; background: var(--ge-toast-bg); color: #f0efed; box-shadow: var(--ge-shadow); font: 14px/1.45 var(--doc-sans-font, var(--doc-font, system-ui, sans-serif)); opacity: 0; transform: translateY(10px); pointer-events: none; transition: opacity .18s, transform .18s; }
  .ge-toast[data-show] { opacity: 1; transform: none; }
  @media (prefers-reduced-motion: reduce) { .ge-toast { transform: none; transition: none; } }
  .ge-toast[data-tone="error"]::before { content: ""; flex: none; width: 6px; height: 6px; border-radius: 50%; background: #ff6b6b; }
`;

const HOLD = { note: 3000, hint: 3000, error: 6000, prompt: 15000 };
const ABOVE = 8; // px between a bottom panel (or the bar) and the toast over it
const embedded = window.parent !== window && !new URLSearchParams(location.search).has("solo"); // ?solo: a page of its own in a frame (session.mjs SOLO)

let message = null; // { kind } while a notice shows
let timer = 0;
let toast = null;
let relay = null; // (notice: { text, tone, hold, room }) => void: the workbench shows it
let relayRoom = null; // (room) => void: the room the bottom panels take, told the workbench
let toldRoom = 0; // what it was told last
let waiting = null; // said in a workbench before the session was there

// The page's own toast, made when first needed.
function node() {
  if (!toast) {
    addStyle(STYLE);
    toast = mount(element("div", { class: "ge-toast", role: "status", "aria-live": "polite" }));
  }
  return toast;
}

/**
 * Tell the reader `text` ("note", "hint", "error" or "prompt"), in the UI's language: a text the
 * server sent (its messages are written in Chinese) is looked up too; one already put in it stays as
 * it is. With 减少通知 on, a routine notice (quiet.mjs: what was just done, how to go on; a prompt's
 * too, a drag's) is not shown, nor a hint (the pointer resting there says it); an error always is.
 */
export function say(said, kind = "note", hold = HOLD[kind] ?? HOLD.note) {
  const text = t(said);
  if (kind !== "error" && preference("quietNotices") && (kind === "hint" || routine(text))) return;
  clearTimeout(timer);
  message = { kind: kind === "hint" ? "note" : kind };
  const tone = kind === "error" ? "error" : "info";
  const room = panelRoom();
  timer = setTimeout(settle, hold);
  if (embedded) {
    toldRoom = room;
    if (relay) relay({ text, tone, hold, room });
    else waiting = { text, tone, hold, room };
    return;
  }
  const shown = node();
  shown.textContent = text;
  shown.dataset.tone = tone;
  place(shown);
  shown.dataset.show = "";
}

// The page's own toast among the bottom panels (the rule above): its margins move it sideways, its bottom up.
function place(shown) {
  shown.style.bottom = "";
  shown.style.marginLeft = "";
  shown.style.marginRight = "";
  const rects = (selector) => [...document.querySelectorAll(selector)].map((panel) => panel.getBoundingClientRect()).filter((rect) => rect.height > 0);
  const panels = rects(".ge-conflicts:not([hidden]), .ge-panel");
  const root = document.documentElement;
  const room = parseFloat(getComputedStyle(root).getPropertyValue("--doc-page-bar")) || 0;
  const width = shown.offsetWidth;
  const { x, blocked = [] } = barPlace(panels, root.clientWidth, room, width);
  const middle = x ?? (root.clientWidth - room) / 2;
  let bottom = 0;
  for (const rect of blocked) bottom = Math.max(bottom, innerHeight - rect.top + ABOVE);
  // Above the bar where the two would meet across (it moves aside for the cards as the toast does).
  for (const rect of rects(".ge-changes:not([hidden])")) {
    if (rect.left - ABOVE < middle + width / 2 && rect.right + ABOVE > middle - width / 2) bottom = Math.max(bottom, innerHeight - rect.top + ABOVE);
  }
  if (x !== null) {
    shown.style.marginLeft = `${Math.round(x - width / 2)}px`;
    shown.style.marginRight = "0";
  }
  if (bottom) shown.style.bottom = `${Math.round(bottom)}px`;
}

// The room the bottom panels take changed (one came, grew, shrank, was hidden or went): the toast
// stands above them again, or the workbench is told.
function panelsChanged() {
  const room = panelRoom();
  if (embedded) {
    if (room !== toldRoom) relayRoom?.(room);
    toldRoom = room;
  } else if (toast?.hasAttribute("data-show")) place(toast);
}
onPanels(panelsChanged);

/** The notice goes. */
export function settle() {
  clearTimeout(timer);
  if (!message) return;
  message = null;
  if (embedded) relay?.({ text: "" });
  else toast?.removeAttribute("data-show");
}

/** The kind of the notice shown now ("note", "error" or "prompt"), or null. */
export const messageKind = () => message?.kind ?? null;

/** In a workbench: the session that shows notices there (null: none), and that hears the room the bottom panels take (`sendRoom`). */
export function relayTo(send, sendRoom = null) {
  relay = send;
  relayRoom = sendRoom;
  toldRoom = panelRoom();
  relayRoom?.(toldRoom);
  if (relay && waiting && message) relay({ ...waiting, room: toldRoom });
  waiting = null;
}

/** The page's own toast, if there is one (the editor's UI moves it into an open dialog). */
export const noticeNode = () => toast;

// ---------- the panel ----------

let panel = null;

// It fades out (the bottom panels' one way out, ui.mjs fadeOut), the room it took given back once it has gone;
// replaced by another (`fade` false: showPanel), it goes at once.
export function closePanel(fade = true) {
  if (!panel) return;
  const gone = panel;
  panel = null;
  const done = () => {
    gone.remove();
    panelGone(gone);
  };
  if (fade === false) done();
  else fadeOut(gone, 100, done);
}

export function showPanel(title) {
  closePanel(false);
  addStyle(PANEL_STYLE);
  panel = mount(element("div", { class: "ge-panel", role: "region", "aria-label": title, hidden: "" },
    element("div", { class: "ge-panel-head" }, element("span", { text: title }), textButton(t("关闭"), closePanel, { quiet: true }))));
  fadeIn(panel);
  panelShown(panel);
}

export function panelItem(...children) {
  const item = element("div", { class: "ge-panel-item" }, ...children);
  panel.append(item);
  return item;
}

/** The open panel, if any. */
export const panelNode = () => panel;
