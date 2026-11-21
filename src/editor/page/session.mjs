import { OLD_PROTOCOL, PROTOCOL, PROTOCOLS, VERSION, keyCombo } from "../../shared/session.mjs";
import { lookOf, lookOfElement } from "../../shared/document-look.mjs";
import { still } from "./ui.mjs";

// The report page inside a workbench (an iframe of the same origin): it answers a few commands and
// tells the workbench its state, never the report's content. Nothing happens when the page is not
// embedded. The protocol is src/shared/session.mjs; how a workbench uses it, docs/workbench.md.
//
// A message counts only from the parent window, of this exact origin and protocol. A command names the
// report it is meant for: one for another report (the iframe went to another page meanwhile) is
// refused. Every command gets exactly one reply, once it is done. Besides the editor's commands the
// session itself answers five: `theme` (show the report light or dark, or as the reader chose, without
// storing it), `look` (show the document in a look, 字体与布局: { look }, src/shared/document-look.mjs; the
// workbench writes it into doc.json), `keys` (key combinations to hand to the workbench when the page does not use them),
// `scroll-top` (back to the top when scrolled down) and `close-card` (the detail card on top closes as a
// press on its backdrop closes it: the workbench asks on a press on its own bars, or Esc there, while
// the page says a card is open, `card` in what it sends). A card stands in the middle of the
// workbench's window, not of the frame (centreCards, below). A block's 允许访问 (doc-net-consent, the kit's)
// is sent as `consent`.

/** A page opened in a frame on its own (?solo), not as the workbench's report: no session, its own notices. */
export const SOLO = new URLSearchParams(location.search).has("solo");
/**
 * slug: the report's; snapshot(): { title, state } (state: STATE_FLAGS of src/shared/session.mjs);
 * commands: name -> async (message) => result ({ ok, … }); modals: what stands open over the page
 * (`modalOps`, page-objects.mjs: open(), listen(listener), closeTop()).
 * Returns { update() (call it when the state may have changed), notice({ text, tone, hold, room }) (the
 * workbench shows it: a toast, `room` px above the frame's bottom, what the page's bottom panels take;
 * text "" takes it away), noticeRoom(room) (that room changed: the workbench's toasts stand above it),
 * reload() (the workbench shows the report
 * again in a new page, swapped in once drawn), focus({ caret, selection }) (where the reader is: the block the caret is in, the
 * words or blocks selected; the workbench reports it to the server, gallery status), annotationsRemoved(items) (批注 deleted in the page:
 * the workbench says so and offers them back), open({ target, block } or { hash }) (the workbench
 * goes to another document), jump({ block, place }) (a link goes to a block of this page: the
 * workbench adds a history entry, `place` where the reader was, for the way back: `show-place`),
 * workspace() (a page was made under this one: the sidebar reads the list
 * again and opens this page's row) }, or null when not embedded, or opened on its own in a frame of the
 * workbench (?solo: the 写作偏好 dialog's page, which talks to no session).
 */
export function connectWorkbench({ slug, snapshot, commands, modals }) {
  if (window.parent === window || SOLO) return null;
  centreCards(modals);
  const parentOrigin = location.origin;
  // The id the workbench speaks (src/shared/session.mjs, OLD_PROTOCOL): null until its first command,
  // and meanwhile every message goes under both, so that a workbench of either version hears it.
  let spoken = null;
  const send = (type, fields, protocols = spoken ? [spoken] : [PROTOCOL, OLD_PROTOCOL]) => {
    for (const protocol of protocols) window.parent.postMessage({ protocol, v: VERSION, type, slug, ...fields }, parentOrigin);
  };
  let last = null;
  let told = null; // the state last sent
  // A card opened, or the last one closed, is told at once, as any change of the state (the workbench covers
  // its bars, takes Esc and a press for it); and again once its fade (the kit's dialog.css: the card and its
  // backdrop, in one) has started, with the time it started (`cardAt`, on the clock the pages of a browser
  // share: performance.timeOrigin + startTime, ms since the epoch), from which the workbench's underlay fades,
  // on the same curve, not from when it heard. A browser starts an animation as the frame that shows it is
  // drawn, and a card's first frame takes a while: the workbench's own fade started a frame or three after the
  // backdrop's, and the window dimmed, and lit again, in two steps (2026-11-17). Not told where the cards came
  // or went again meanwhile. A card with no fade: the time of the next frame drawn.
  let shown = modals.open();
  const update = () => {
    const open = modals.open();
    const now = { ...snapshot(), card: open.length > 0 };
    if (now.card !== shown.length > 0) {
      const changed = [...open.filter((one) => !shown.includes(one)), ...shown.filter((one) => !open.includes(one))];
      fadeStart(changed, (cardAt) => {
        if (told?.card === now.card) send("state", { ...told, cardAt });
      });
    }
    shown = open;
    const key = JSON.stringify(now);
    if (key === last) return;
    last = key;
    told = now;
    send("state", now);
  };
  modals.listen(update);

  // A key combination the workbench asked for goes to it when nothing on the page took it (the
  // editor's own keys, Ctrl+K for a link among them, are handled and prevented before this).
  let keys = new Set();
  addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing || keys.size === 0) return;
    const key = keyCombo(event);
    if (!keys.has(key)) return;
    event.preventDefault();
    send("key", { key });
  });
  // A block's card asks the reader to let it online (its 允许访问 button: the kit's net.js): the workbench
  // opens its consent dialog, the one 设置 › 组件列表 opens, and writes what the reader says; the page
  // hears it on its event stream, and the kit starts the instance again.
  addEventListener("doc-net-consent", (event) => {
    const { block, hosts } = event.detail ?? {};
    if (typeof block !== "string") return;
    event.preventDefault();
    send("consent", { block, hosts: Array.isArray(hosts) ? hosts : [] });
  });
  const own = {
    async theme({ theme = null }) {
      if (theme !== null && theme !== "light" && theme !== "dark") return { ok: false, reason: "theme" };
      dispatchEvent(new CustomEvent("doc-theme-request", { detail: { theme } })); // the kit's ui.js
      return { ok: true };
    },
    // The document's look shown at once (the kit's ui.js puts it on <html> and lays out again), never
    // stored here: the workbench writes doc.json. Answers with the look the page shows then.
    async look({ look = null }) {
      if (look !== null && (typeof look !== "object" || Array.isArray(look))) return { ok: false, reason: "look" };
      dispatchEvent(new CustomEvent("doc-look-request", { detail: { look: lookOf(look) } }));
      return { ok: true, look: lookOfElement(document.documentElement) };
    },
    async keys({ keys: list }) {
      if (!Array.isArray(list) || !list.every((key) => typeof key === "string")) return { ok: false, reason: "keys" };
      keys = new Set(list);
      return { ok: true };
    },
    // Scrolled down (10px or more), the page glides back to its top: the top bar's current page, clicked.
    // Less than that, it answers `scrolled: false` and the top bar opens its menu instead.
    async "scroll-top"() {
      if (Math.abs(scrollY) < 10) return { ok: true, scrolled: false };
      scrollTo({ top: 0, behavior: still() ? "instant" : "smooth" });
      return { ok: true, scrolled: true };
    },
    // A press on the workbench's own bars, or Esc there, while a detail card is open.
    async "close-card"() {
      return { ok: true, closed: modals.closeTop() };
    },
  };
  const all = { ...commands, ...own };

  addEventListener("message", async (event) => {
    const message = event.data;
    if (event.source !== window.parent || event.origin !== parentOrigin) return;
    if (!PROTOCOLS.includes(message?.protocol) || message.v !== VERSION || message.type !== "command") return;
    spoken = message.protocol;
    const run = Object.hasOwn(all, message.name) ? all[message.name] : null;
    let result;
    try {
      result = message.slug !== slug ? { ok: false, reason: "slug" } : run ? await run(message) : { ok: false, reason: "unknown" };
    } catch (error) {
      result = { ok: false, reason: "error", message: String(error?.message ?? error) };
    }
    send("reply", { id: message.id, ...result }, [message.protocol]);
    update();
  });
  const first = { ...snapshot(), card: modals.open().length > 0 };
  last = JSON.stringify(first);
  send("ready", { commands: Object.keys(all), ...first });
  return {
    update,
    notice: (fields) => send("notice", fields),
    noticeRoom: (room) => send("noticeRoom", { room }),
    // Show the report again (the file changed): the workbench loads it out of sight and puts it in
    // this page's place once drawn; this page does nothing more meanwhile.
    reload: () => send("reload", {}),
    annotationsRemoved: (items) => send("annotations-removed", { items }),
    // Where the reader is, for gallery status (focus.mjs): { caret, selection }, told when it changed.
    focus: (where) => send("focus", where),
    open: (place) => send("open", place),
    jump: (fields) => send("jump", fields),
    workspace: () => send("workspace", {}),
  };
}

// `then(at)` once the fade of `cards` (those just opened or closed) has started, `at` the time it did, ms
// since the epoch; without a fade, after the next frame the page draws, then. At most 100ms on (a hidden
// tab draws no frame).
function fadeStart(cards, then) {
  let done = false;
  const run = (at = performance.timeOrigin + performance.now()) => {
    if (done) return;
    done = true;
    then(at);
  };
  const fades = cards.flatMap((card) => card.getAnimations?.() ?? []);
  if (fades.length) {
    Promise.race(fades.map((fade) => fade.ready)).then((fade) => {
      const start = Number(fade.startTime);
      run(Number.isFinite(start) ? performance.timeOrigin + start : undefined);
    }, () => run());
  } else requestAnimationFrame(() => setTimeout(run, 0));
  setTimeout(run, 100);
}

// A detail card stands in the middle of the workbench's window, as the workbench's own dialogs do
// (组件列表, 写作偏好), not in the middle of this frame right of its sidebar and under its top bar;
// the workbench covers its bars while the page says a card is open (`card`), the card's backdrop
// the rest. The kit's dialog.css puts the card's middle at --doc-dialog-centre-x and -y, as far as
// the frame lets it stay clear of its sides, and makes it 80% as high as --doc-dialog-window-height.
// They are read from the frame's place in the workbench's window (of this origin, as every message
// of the session is), and said in a sheet the document adopts, which is in no markup (a copy of the
// view, the file); again as the frame changes size (the window resized, the sidebar opened, closed or
// dragged wider) and as a card opens or closes.
function centreCards(modals) {
  let sheet;
  try {
    sheet = new CSSStyleSheet();
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  } catch {
    return; // a browser with no constructed sheets: the card in the middle of the frame
  }
  let said = null;
  const place = () => {
    let rule = "";
    try {
      const frame = window.frameElement;
      const outer = frame?.ownerDocument.documentElement;
      if (outer) {
        const box = frame.getBoundingClientRect();
        const style = frame.ownerDocument.defaultView.getComputedStyle(frame);
        const left = box.left + frame.clientLeft + parseFloat(style.paddingLeft);
        const top = box.top + frame.clientTop + parseFloat(style.paddingTop);
        rule = `:root { --doc-dialog-centre-x: ${outer.clientWidth / 2 - left}px; --doc-dialog-centre-y: ${outer.clientHeight / 2 - top}px; --doc-dialog-window-height: ${outer.clientHeight}px; }`;
      }
    } catch { /* a frame of another origin's page, or one taken away: in the middle of the frame */ }
    if (rule === said) return;
    said = rule;
    sheet.replaceSync(rule);
  };
  place();
  addEventListener("resize", place);
  modals.listen(place);
}
