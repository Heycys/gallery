import { localPath } from "../../shared/workspace-address.mjs";
import { keepView, leaveView, takeView } from "../../shared/kept-view.mjs";
import { goBackTo, onReaderMove, placeIn } from "../../shared/reading-place.mjs";
import { startBoard } from "./board/index.mjs";
import { relayTo } from "./notices.mjs";
import { connectWorkbench } from "./session.mjs";

// A custom page inside a workbench (src/server/routes.mjs serves it at /pages/<slug> with this module;
// docs/workbench.md "Custom pages"): no document editor, the session, by which the workbench shows it
// as it shows a document's page, and its boards' editing (./board/: the cards moved, resized, added,
// taken out, their settings and their blocks' writes, through the page service, by the page map the
// server writes in its head), which shows the page again only once nothing of it waits. Its session's
// slug is "@<slug>", the page's address in the workbench (#@<slug>), which no document's slug can be.
// It answers the session's own commands (theme, keys, scroll-top: src/editor/page/session.mjs),
// prepare-close (once the board's ops sent are answered: each is written at once, nothing else waits),
// add-card where it has a board (the top bar's 添加自定义块: the library of the page's first board, under the
// button's place that the workbench sends; a page with none, a blank one or one an Agent wrote with no
// board, offers no 添加自定义块) and, on a page with the default cards (its page map's `defaults`: its
// page.json's defaultCards, the default home page's), restore-defaults (恢复默认卡片, its menu's: the board's,
// one step of its undo; its answer { ok, added, skipped } the workbench says) and undo-restore ({ cards }:
// that step undone while it is the board's last, the workbench's 撤销),
// and sends ready, reload (its live script heard that page.html or page.json changed, or a block it
// holds: the workbench loads it again in a hidden frame and swaps it in once drawn), open (a link to a
// document or another page, or a block's context.workspace.open: doc-open-request) and key. Opened on its own (not in a frame of the workbench), it has no
// session: its board edits all the same, and the live script reloads it.
// Shown again, by itself or by the workbench (its swap, the workbench loaded anew), it stands where the reader
// was, as a document's page does (docs/workbench.md "Where the reader was"): asking, it keeps where the reader is
// (shared/kept-view.mjs keepView), going, it leaves it (leaveView), and starting, it takes what was kept and
// puts the element that was at the top of the window there again (reading-place.mjs goBackTo) before it is
// shown, then once more when it is drawn (its fonts in, its cards' blocks laid out), unless the reader has
// moved the page meanwhile; the session's `place` (the reader scrolled the page it replaces while it loaded)
// puts it there instead.

const slug = decodeURIComponent(localPath(location.pathname).split("/")[2] ?? "");
const IDLE = { editing: false, pending: false, saving: false, offline: false, conflicts: 0, unfit: 0, changed: false };
// Nothing stands over a custom page as a modal.
const NO_MODALS = { open: () => [], listen() {}, closeTop: () => false };

// The page map (routes.mjs: its slug, its token, the version it was served at, its blocks): the boards edit.
let map = null;
try {
  map = JSON.parse(document.querySelector("script[data-ge-page]")?.textContent ?? "null");
} catch {}
const hasBoard = Boolean(document.querySelector(".gallery-board"));

// ---------- where the reader was ----------
const key = `@${slug}`;
let restoring = takeView(key);
let drawn = false;
const putBack = () => { if (restoring) goBackTo(window, restoring); };
onReaderMove(window, () => { restoring = null; });
putBack();
const whenDrawn = () => {
  drawn = true;
  putBack();
};
if (document.documentElement.hasAttribute("data-doc-drawn")) whenDrawn();
else {
  const watch = new MutationObserver(() => {
    if (!document.documentElement.hasAttribute("data-doc-drawn")) return;
    watch.disconnect();
    whenDrawn();
  });
  watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-doc-drawn"] });
}
addEventListener("pagehide", () => leaveView(key, !drawn && restoring ? restoring : placeIn(window)));
// Where the reader is, for the workbench as it leaves the page (its state/recall.ts), the same.
window.__galleryViewNow = () => (!drawn && restoring ? restoring : placeIn(window));
// Shown again (someone else wrote it, a block it holds changed): where the reader is kept for the page after it.
const again = () => {
  keepView(key, placeIn(window));
  if (session) session.reload();
  else location.reload();
};

let board = null;
const session = connectWorkbench({
  slug: `@${slug}`,
  snapshot: () => ({ title: document.title, icon: null, state: IDLE }),
  commands: {
    "prepare-close": async () => {
      await board?.idle();
      return { ok: true };
    },
    // Swapped in for the page it replaces, which the reader scrolled meanwhile: there (reading-place.mjs placeIn of it).
    place: async ({ place = null }) => {
      if (!place || typeof place !== "object" || !Number.isFinite(place.y)) return { ok: false, reason: "place" };
      restoring = place;
      putBack();
      return { ok: true };
    },
    // 添加自定义块 of the workbench's top bar: the library opens in the page, at `anchor` (the button's place in
    // this frame's coordinates; none: in the middle of the window), the first board's.
    ...(hasBoard ? { "add-card": async ({ anchor } = {}) => (board ? board.addCard({ anchor }) : { ok: false, reason: "board" }) } : {}),
    ...(map?.defaults ? {
      "restore-defaults": async () => (board ? board.restoreDefaults() : { ok: false, reason: "board" }),
      "undo-restore": async ({ cards }) => (board ? board.undoRestore(cards) : { ok: false, reason: "board" }),
    } : {}),
  },
  modals: NO_MODALS,
});

board = map?.token ? startBoard({ map, reload: again, hosted: Boolean(session) }) : null;
// The live script (routes.mjs) shows the page again through the workbench, which swaps a new page in
// once drawn: no reload seen; once the board's own writes, a drag, a form or a field typed in are done.
window.__galleryEditReload = board ? () => board.swap() : again;

if (session) {
  // Its notices (a card someone else changed) are the workbench's toasts, as a document's page's are.
  relayTo(session.notice, session.noticeRoom);

  // A block's context.workspace.open (the kit's runtime/workspace.js: 我的待办's item, 最近编辑's
  // document): a document, at its block where it names one, or a custom page, opened in the workbench.
  addEventListener("doc-open-request", (event) => {
    const { slug = null, block = null, page = null } = event.detail ?? {};
    event.preventDefault();
    session.open(page ? { hash: `@${page}` } : { target: slug, block });
  });

  // A link to a document or a page of the workbench goes there in the workbench, never in this frame:
  // a workbench's address (#<link>, #@<slug>, /#…), a document's page (/generated/<slug>.html) or its
  // file (../<slug>/doc.html), a custom page's served path (/pages/<slug>, the page alone that gallery
  // page open gives, or written relative to this one: "reading" from /pages/home). Another site's
  // opens in a tab of its own.
  addEventListener("click", (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link || link.hasAttribute("download")) return;
    const raw = link.getAttribute("href") ?? "";
    // A place in this page (an element of that id) is the browser's to go to.
    if (raw.startsWith("#") && raw.length > 1 && document.getElementById(decodeURIComponent(raw.slice(1)))) return;
    let url;
    try {
      url = new URL(raw, location.href);
    } catch {
      return;
    }
    if (url.origin !== location.origin) {
      event.preventDefault();
      window.open(url.href, "_blank", "noopener");
      return;
    }
    const custom = /^\/pages\/([a-z0-9-]+)\/?$/.exec(localPath(url.pathname))?.[1];
    const page = /^\/generated\/([a-z0-9-]+)\.html$/.exec(localPath(url.pathname))?.[1] ?? /^\/([a-z0-9-]+)\/(?:doc|report)\.html$/.exec(localPath(url.pathname))?.[1];
    if (custom) {
      event.preventDefault();
      session.open({ hash: `@${custom}` });
    } else if (page) {
      event.preventDefault();
      session.open({ target: page, block: url.hash.slice(1) || null });
    } else if ((url.pathname === "/" || raw.startsWith("#")) && url.hash.length > 1) {
      event.preventDefault();
      session.open({ hash: decodeURIComponent(url.hash.slice(1)) });
    }
  });
}
