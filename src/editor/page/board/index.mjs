import { workspaceAddress } from "../../../shared/workspace-address.mjs";
import { GAP, GRID, NARROW, dropped, fitHeight, gridFor, landing, moved, sizeFor, spanOf } from "../../../shared/board-places.mjs";
import { NARROW_ATTRIBUTES, cellsOf } from "../../../shared/card-size.mjs";
import { language, t } from "../../../shared/i18n/index.mjs";
import { BLOCK_ICON, SETTINGS_ICON, svg } from "../../components/icons.mjs";
import { instanceAround, instanceOf, packageOf } from "../../components/instances.mjs";
import { gestureLock } from "../gesture.mjs";
import { ICONS, createMenu } from "../menu.mjs";
import { say } from "../notices.mjs";
import { createTodoWrites } from "../todo-writes.mjs";
import { tooltip } from "../tooltip.mjs";
import { addStyle, element, mount } from "../ui.mjs";
import { createClient } from "./client.mjs";
import { createHistory } from "./history.mjs";
import { createEdgeScroll, createSettle, glide, isGliding, stopGlide } from "./motion.mjs";
import { showBlank, showHint, showNews } from "./hint.mjs";
import { closeSettings, formOpen, openSettings } from "./settings.mjs";

// A custom page's board edited (docs/render.md "A custom page"):
// what the reader does to the cards of its boards, each change written through the page service
// (src/editor/page-service.mjs: ./client.mjs) and undone by the page's own undo (./history.mjs). The
// kit's board script (src/render/kit/board/) lays the cards out; this moves them, as the editor's
// handle, menus and notices do on a document's page, in the editor's look (look.mjs: grays for every
// line, guide and handle, never a bright blue; nothing that snaps hard).
//
//   - The grip, the card's one handle (no ⋯ beside it). The pointer on a card shows, INSIDE it at its
//     top-right corner (a GRIP.size px box, GRIP.inset px from the card's top and right edges, which no
//     block puts a control or text in: the corner is the grip's), the grip (six dots, their quiet gray,
//     darker under the pointer, grey behind only while pressed or while its menu is open). It shows while
//     the pointer is over the card, while its menu is open and while the keyboard focus is in the card
//     (or on the grip), never outside the card. A press that moves past THRESHOLD px drags the card;
//     one that moves less, or a key (Enter, Space) on the grip, opens the card's menu: what is dragged
//     and selected in a card is its block's (DocKit.drag never moves a card). A bare card (its block's
//     card.bare) shows where it stands by a dashed line of the guides' gray.
//   - The board while a card is moved or resized (the user's word of 2026-11-09): no landing shadow
//     under it; the board's lattice drawn as faint grey dots, one where the gaps between four cells
//     cross (the board's outer edge too), from the gesture's start to its end (.ge-board-dots, light
//     and dark), and the card snapping to the cells it would land at as it comes within SNAP px of them,
//     each axis on its own: where it snaps is where a drop puts it.
//   - Its motion (./motion.mjs; the user's word of 2026-11-09, as smooth as a phone's home-screen
//     widgets): the card held follows the pointer at once and settles onto the cells it snaps to (or
//     off them) on a spring in SETTLE ms, never a jump; the cards making way, the card let go (to its cells, or back on Escape), a
//     resize's and 大小 ›'s, an undo's and a redo's glide from where they were seen to their new place on
//     that spring (FLIP, GLIDE ms), each starting again from where it is seen when the target changes under
//     it; near the window's top or bottom edge the page scrolls, timed by the frames, faster nearer the edge
//     and never past FASTEST px a second. prefers-reduced-motion: no glide or settling.
//   - Moving. The card follows the pointer, and where it would go is where it lands (shared/board-places.mjs
//     landing; the user's word of 2026-11-14, a card passed on the way flashed down and back): the whole
//     cells nearest to it where they share no cell with another card, or cover more than half of one they
//     meet (or one covers more than half of them), the card put there; where they only clip the cards they
//     meet, the free place among the whole cells around it, else where it was going before, so that a card
//     it passes never moves. Put on exactly one card that can take its place (the user's word of 2026-11-19:
//     a card dragged onto its neighbour, the two change places; board-places.mjs exchange), it lands where
//     the exchange puts it, the other's side (or end) of the cells the two span, and that card is drawn at
//     the held card's, gliding there, and back once the pointer goes on (the same more-than-half, the same
//     spring as a card making way). The card itself is
//     drawn there (DocBoard.draft, the card it exchanges with drafted too), moved off it by the pointer's
//     offset but within SNAP px of it on an axis, where it stands on it; the cards it meets there are drawn
//     pushed down under it (dropped: pushDown where there is no exchange, the service's own rule), never up,
//     gliding (./motion.mjs glide). Escape, or the pointer taken away, puts all back; a drop sends `place`
//     (its `swap` the card it exchanges with), and the board stands as the service answers, one step of
//     undo for every card it moved. The rows above a board's first card are not drawn (DocBoard.skipped): the
//     pointer's row is the drawn one plus the rows skipped as the drag began, so that a card let go
//     where it was writes nothing and one held above the first row goes above it (drawn at the top, the
//     others under it).
//   - Resizing. A card whose block says card.resize has a grip at its bottom-right: it follows the
//     pointer, snapping to the size a drop gives (within SNAP px of its width or height), the nearest of
//     card.sizes, else whole cells between card.min and card.max (sizeFor), never past the row's end;
//     one of fit content only gets wider (its height is its content's); one whose manifest frees it
//     (`any`) reaches every whole size. The menu's 大小 › gives the listed sizes (the common ones), in a
//     card of rows of words alone, only as wide as they are.
//   - The card's menu (the grip's click): 设置… (a block with settings: ./settings.mjs, written by the
//     service's `settings`), 大小 ›, 删除 (`remove`).
//   - 添加自定义块: in a workbench (`hosted`) the workbench's top bar has its button, which asks by the
//     session's `add-card` command (./index.mjs `addCard`; custom-page.mjs): the library opens in the
//     page, under the button's place (the rect the workbench sends, in the frame's own coordinates) or
//     centred, and adds to the page's FIRST board; a page open alone in a tab has the button of its own
//     at the top right of each board, above it. The library (the service's GET library: the blocks
//     whose places hold page and are not turned off, with their previews, Gallery's own not yet in the
//     workspace too, which the service puts in), in a section of each pack under its name (no pack's
//     name in grey after a block's): the card put at the first free spot by its block's
//     default size (`add`); the page is then shown again (the host's hidden-frame swap), which brings
//     the block's script and style.
//   - A block's own write (context.edit, the kit's cancellable doc-component-edit): taken here, its
//     drafts put on the page and sent as `edit`, one step of undo.
//   - Undo and redo (Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y, never in a field): the reverse op of each step,
//     a move's and a resize's putting back up the cards they pushed (`arrange`).
//   - A to-do of a document checked by a block (context.workspace.setTodo: ../todo-writes.mjs),
//     which writes that document, not this page: one step of undo each that changed it, its undo the
//     check the other way (the item named by the id the write gave it), never the document's undo.
//   - Each op, and each undo and redo, is a task of the client's: sent once those before it are done
//     (answered, their cards' bases and their undo steps taken in), so that what it sends goes with the
//     bases they left, never with those it had when it was asked.
//   - Two views (the user's word of 2026-11-13): a board whose room holds twelve of the fixed cells shows
//     its wide view, one narrower its narrow view (NARROW columns: the kit's gridFor), each arranged on its
//     own, the same cards on both. Every gesture acts on the view the board shows (the kit's DocBoard.placeOf
//     its start: a card's narrow place, or where the narrow view puts one that has none), and its op says so
//     (`view: "narrow"`: the service writes the narrow view's places, data-narrow-*); an undo goes to the
//     view its step was done in, whichever the window shows then. A card added in either view is on both.
//   - The card of a block that does not run on a page (the server holds its instance in a template:
//     a block of documents alone, one turned off) says so in its frame.
//   - 恢复默认卡片 (the home page's, which the workbench's sidebar asks of it: custom-page.mjs): the
//     service's restore-defaults, the default cards the home page misses put in at free spots, one step
//     of undo that takes them all out again, and the page shown again with their blocks; the workbench
//     says what came back, its 撤销 the page's undo of that step while it is still the last one.
//   - The home page's first-open note (./hint.mjs), while the map says `hint`.
//   - Shown again: the page's own writes are no one else's (the live script's "page <version>" of a
//     version its ops wrote changes nothing: __galleryPageChanged); someone else's (an Agent's write of
//     page.html, an op answered on a version the page did not know) shows the page again once nothing
//     of the page waits: no op unanswered, no drag, no form, no field of a card typed in and not left
//     (DocKit.input commits as it is left).

const BOARD = ".gallery-board";
const CARD = ".gallery-card";
const THRESHOLD = 4; // px a press moves before it is a drag
const SNAP = 14; // px from the place (or the size) a drop gives within which a moved (or resized) card stands on it
const DOT = 3; // px of room around each of the board's dots while a card is moved or resized (their tile's corner)
const GRIP = { size: 28, inset: 6 }; // the grip's box, and its room from the card's top and right edges (inside the card)
const FIELDS = "input, textarea, select, [contenteditable]:not([contenteditable=false])";

const DOTS = '<svg viewBox="0 0 10 16" aria-hidden="true"><circle cx="2.5" cy="2" r="1.25"/><circle cx="7.5" cy="2" r="1.25"/><circle cx="2.5" cy="8" r="1.25"/><circle cx="7.5" cy="8" r="1.25"/><circle cx="2.5" cy="14" r="1.25"/><circle cx="7.5" cy="14" r="1.25"/></svg>';
const CORNER = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13 6.5 6.5 13M13 10.5 10.5 13"/></svg>';
const GEAR = SETTINGS_ICON;
const SIZE = svg('<rect x="3.25" y="3.25" width="13.5" height="13.5" rx="2.5"/><path d="M10 3.25v13.5M3.25 10H10"/>');
const BLOCK = BLOCK_ICON;

const STYLE = `
  /* As wide as the page and clipped there: a grip left where a wider window put it (hidden, or not yet put again) never widens the page. */
  .ge-board-layer { position: absolute; left: 0; top: 0; width: 100%; height: 0; overflow-x: clip; z-index: 30; }
  /* The grip: one box inside the card at its top-right corner, an icon button, so no fill under the pointer (the dots go darker), grey only while pressed or while its menu is open. */
  .ge-board-grip { position: absolute; display: flex; align-items: center; justify-content: center; box-sizing: border-box; width: ${GRIP.size}px; height: ${GRIP.size}px; border-radius: 6px; outline: none; color: var(--ge-ico3); cursor: grab;
    user-select: none; touch-action: none; opacity: 0; pointer-events: none; transition: opacity .1s ease-out; }
  .ge-board-grip[data-shown] { opacity: 1; pointer-events: auto; }
  .ge-board-grip[data-narrow] { cursor: pointer; }
  .ge-board-grip svg { display: block; width: 10px; height: 16px; fill: currentColor; pointer-events: none; }
  .ge-board-grip:hover { color: var(--ge-ico); }
  .ge-board-grip[data-pressed] { background: var(--ge-press); color: var(--ge-ico); }
  .ge-board-grip:focus-visible { background: var(--ge-hover); }
  /* The size corner: a 24px target in the card's corner, its 14px mark where it was (4px in from the corner), an icon button: darker under the pointer, gray only while it is dragged. */
  .ge-board-resize { position: absolute; display: flex; align-items: flex-end; justify-content: flex-end; box-sizing: border-box; width: 24px; height: 24px; padding: 0 4px 4px 0; border-radius: 6px; color: var(--ge-ico3); cursor: nwse-resize; opacity: 0; pointer-events: none; touch-action: none; transition: opacity .1s ease-out; }
  .ge-board-resize[data-shown] { opacity: 1; pointer-events: auto; }
  .ge-board-resize:hover { color: var(--ge-ico); }
  .ge-board-resize[data-pressed] { background: var(--ge-press); color: var(--ge-ico); }
  .ge-board-resize svg { display: block; width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; pointer-events: none; }
  .ge-board-add { position: absolute; display: flex; align-items: center; gap: 4px; box-sizing: border-box; height: 28px; padding: 0 8px 0 6px; border: 0; border-radius: var(--ge-r-ctl); background: none; color: var(--ge-tx2);
    font: 14px/1 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI Variable Display", "Segoe UI", Helvetica, "PingFang SC", "Microsoft YaHei", Arial, sans-serif; white-space: nowrap; cursor: pointer; user-select: none; }
  .ge-board-add:hover { background: var(--ge-hover); color: var(--ge-tx); }
  .ge-board-add:active, .ge-board-add[data-pressed] { background: var(--ge-press); color: var(--ge-tx); }
  .ge-board-add svg { display: block; width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; }
  /* The board's lattice while a card is moved or resized: a faint grey dot where the gaps between four cells cross, under the cards (first in the board, which stands as their containing block meanwhile), placed by dotsOn. */
  .gallery-board[data-ge-dotted] { position: relative; }
  .gallery-board > .ge-board-dots { position: absolute; pointer-events: none; background-image: radial-gradient(circle at ${DOT}px ${DOT}px, light-dark(rgb(55 53 47 / 24%), rgb(255 255 255 / 20%)) 0 1.1px, transparent 1.6px); background-repeat: repeat; animation: ge-board-dots-in .14s ease-out; }
  @keyframes ge-board-dots-in { from { opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .gallery-board > .ge-board-dots { animation: none; } }
  /* The card held lifts: its own shadow kept as it is, layer for layer, and a soft lift added after it, so
     that only the lift eases in and out (a menu's shadow in its place made each of the card's layers turn
     into another's, the shadow swelling and shrinking on the way: the user, 2026-11-09); a frameless card
     takes the lift alone. One let go stays over the others while it glides to its cells. */
  .gallery-board { --ge-board-lift: 0 10px 28px -10px light-dark(rgb(15 15 15 / 16%), rgb(0 0 0 / 55%)), 0 3px 10px -4px light-dark(rgb(15 15 15 / 8%), rgb(0 0 0 / 30%)); }
  .gallery-board > .gallery-card[data-ge-lifted], .gallery-board > .gallery-card[data-ge-landing] { transition: box-shadow .2s ease-out; }
  .gallery-board > .gallery-card[data-ge-lifted] { z-index: 3; box-shadow: var(--gallery-card-shadow), var(--ge-board-lift); cursor: grabbing; }
  .gallery-board > .gallery-card[data-ge-bare][data-ge-lifted] { box-shadow: var(--ge-board-lift); }
  .gallery-board > .gallery-card[data-ge-sizing], .gallery-board > .gallery-card[data-ge-landing] { z-index: 3; }
  @media (prefers-reduced-motion: reduce) { .gallery-board > .gallery-card[data-ge-lifted], .gallery-board > .gallery-card[data-ge-landing] { transition: none; } }
  .gallery-board > .gallery-card[data-ge-bare][data-ge-hover] { outline: 1px dashed var(--ge-guide); outline-offset: 2px; }
  /* The card the grip stands in: a head's quiet note in its corner fades (the kit's --gallery-grip-shown, board.css). */
  .gallery-board > .gallery-card[data-ge-hover] { --gallery-grip-shown: 1; }
  ${gestureLock("data-ge-dragging", { cursor: "grabbing", select: true })}
  ${gestureLock("data-ge-sizing", { cursor: "nwse-resize", select: true })}
  .gallery-card > .ge-card-note { display: flex; align-items: center; justify-content: center; box-sizing: border-box; min-height: 100%; padding: 4px; color: var(--ge-tx3); font-size: 13px; line-height: 1.5; text-align: center; }
`;

const said = (words) => (typeof words === "string" ? words : words?.[language] ?? words?.zh ?? words?.en ?? "");
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const cellsSame = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
// Where a drag lands, the card it exchanges with too (landing's `swap`).
const landsSame = (a, b) => cellsSame(a, b) && (a.swap ?? null) === (b.swap ?? null);

/**
 * The board edited, on a custom page served with its map (`map`: { slug, token, version, blocks, hint },
 * routes.mjs: each block of its cards { state, card, settings, parts, fit, bare, name }; `hint`: the
 * home page's first-open note is shown). `reload()`: the page shown again (the workbench's swap;
 * location.reload on its own). `hosted`: the page stands in a workbench's frame, whose top bar has the
 * 添加自定义块 button (the page draws none of its own). Returns { swap() (show the page again once nothing waits), undo(),
 * redo(), idle() (a promise of the ops sent being answered), restoreDefaults() (恢复默认卡片: its
 * answer, { ok, added, skipped }), undoRestore(cards) (that step undone while it is the last one),
 * addCard({ anchor }) (the workbench's 添加自定义块: its answer, { ok, opened }) }.
 */
export function startBoard({ map, reload, hosted = false }) {
  addStyle(STYLE);
  const { slug, token, version, blocks = {} } = map;
  const history = createHistory(slug);
  const menu = createMenu();
  const kept = new Map(); // a card taken out -> its node, for its undo to put back
  const leaving = new Set(); // the cards taken off the page whose remove is not yet answered
  // The to-dos its blocks check (workspace.setTodo): each that changed its document one step of undo; an
  // undo's or a redo's own write (`step`) none.
  const todos = createTodoWrites({
    token,
    done: (ask, answer) => {
      if (ask.step || !answer.ok || !answer.changed) return;
      history.push({ kind: "checked", slug: ask.slug, ref: { ...ask.ref, block: answer.block ?? ask.ref.block }, done: ask.done });
    },
  });
  todos.listen();

  // ---------- the page shown again ----------
  let gesture = null; // a drag or a resize under way
  let typing = null; // a field of a card typed in and not yet left
  let swapWanted = false;
  let waitTimer = 0;
  const busy = () => client.busy || gesture !== null || formOpen() || (typing !== null && typing.isConnected && document.activeElement === typing);
  const trySwap = () => {
    clearTimeout(waitTimer);
    if (!swapWanted) return;
    if (busy()) {
      waitTimer = setTimeout(trySwap, 250);
      return;
    }
    swapWanted = false;
    history.know(basesNow());
    reload();
  };
  const wantSwap = () => {
    swapWanted = true;
    trySwap();
  };
  const client = createClient({ slug, token, version, others: wantSwap });
  window.__galleryPageChanged = (next) => {
    if (client.ours(next)) return;
    if (client.busy) client.idle().then(() => { if (!client.ours(next)) wantSwap(); });
    else wantSwap();
  };

  // ---------- the cards ----------
  const boards = () => [...document.querySelectorAll(BOARD)];
  const cardsIn = (board) => [...board.querySelectorAll(`:scope > ${CARD}`)];
  const allCards = () => boards().flatMap(cardsIn);
  const cardById = (id) => allCards().find((card) => card.dataset.cardId === id) ?? null;
  const boardById = (id) => boards().find((board) => board.dataset.boardId === id) ?? null;
  const blockIdOf = (card) => packageOf(instanceOf(card)) ?? packageOf(card.querySelector(":scope > template[data-ge-held]")?.content.firstElementChild);
  const infoOf = (card) => blocks[blockIdOf(card)] ?? null;
  const runs = (card) => infoOf(card)?.state === "page" && !card.dataset.geState;
  // The view a board shows (the kit's DocBoard.view): "wide", "narrow", or "tiny" (a phone's room, the cards flowed, which moves nothing).
  const viewOf = (board) => { const columns = Number(board.dataset.columns) || GRID.columns; return columns >= GRID.columns ? "wide" : columns === NARROW ? "narrow" : "tiny"; };
  const tiny = (board) => viewOf(board) === "tiny";
  const columnsOf = (board) => (viewOf(board) === "narrow" ? NARROW : GRID.columns);
  // A card's place in the view its board shows now, as the file has it (the kit's DocBoard.placeOf): what a
  // drag, a resize, 大小 › and the steps of undo go by.
  const placeOf = (card) => globalThis.DocBoard?.placeOf?.(card) ?? cellsOf(card);
  const viewed = (view) => (view === "narrow" ? { view } : {});
  const basesNow = () => Object.fromEntries(allCards().map((card) => [card.dataset.cardId, card.dataset.geBase]));
  const layoutOf = (board) => cardsIn(board).map((card) => ({ id: card.dataset.cardId, ...placeOf(card) }));
  // A card at `cells` in `view`: its data-x, -y, -w and -h, or its narrow place (none: null, taken away).
  const setCells = (card, cells, view = "wide") => {
    for (const axis of ["x", "y", "w", "h"]) {
      const name = view === "narrow" ? NARROW_ATTRIBUTES[axis] : `data-${axis}`;
      if (!cells) card.removeAttribute(name);
      else if (card.getAttribute(name) !== String(cells[axis])) card.setAttribute(name, String(cells[axis]));
    }
  };
  // A board's grid as drawn: where its columns are (the board stands them in its middle: `rect`, their
  // box's left and right, the board's top), its cell's side, a cell and its gap.
  const geometry = (board) => {
    const box = board.getBoundingClientRect();
    const grid = gridFor(board.clientWidth);
    const cell = parseFloat(board.style.getPropertyValue("--gallery-cell")) || grid.cell;
    const columns = Number(board.dataset.columns) || grid.columns;
    const inset = Math.max(0, (board.clientWidth - spanOf(columns, cell)) / 2) + board.clientLeft;
    const rect = { left: box.left + inset, right: box.left + inset + spanOf(columns, cell), top: box.top, bottom: box.bottom };
    return { rect, cell, step: cell + GAP };
  };
  const drawn = (card) => globalThis.DocBoard?.drawn(card) ?? cellsOf(card);
  // How many rows above its first card the board does not draw (the kit's DocBoard.skipped): its drawn row
  // r is the file's row r + skipped, which a dragged card's place and a drop are reckoned by.
  const skipped = (board) => globalThis.DocBoard?.skipped?.(board) ?? 0;
  const draft = (board, cells) => globalThis.DocBoard?.draft(board, cells);

  // What an answer says of the cards: each at its cells, with its base. A card it names that the page
  // has not, or one the page has that it does not name, is someone else's doing: the page is shown again.
  function took(answer, { own = [] } = {}) {
    const named = new Set();
    // Where the page drew a card elsewhere than the service put it, it glides there (a held card follows the pointer).
    glide(allCards(), () => {
      for (const card of answer.cards ?? []) {
        named.add(card.id);
        const node = cardById(card.id);
        if (!node) {
          if (!own.includes(card.id) && !leaving.has(card.id)) wantSwap(); // one the page took out meanwhile, its remove asked, is its own
          continue;
        }
        setCells(node, card);
        setCells(node, card.narrow ?? null, "narrow");
        node.dataset.geBase = card.base;
      }
      if (!gesture) for (const board of boards()) globalThis.DocBoard?.layout(board);
    }, { still: gesture?.card ?? null, settled: placeAgain });
    if (allCards().some((card) => !named.has(card.dataset.cardId))) wantSwap();
    history.know(basesNow());
  }
  // An op refused or failed: said, and the page shown as the file is.
  function failed(answer) {
    if (answer?.refused) say(t("这张卡片刚被改过，请再操作一次"), "error");
    else if (answer?.reason === "offline") say(t("连不上本地服务"), "error");
    else say(t("没能改动这个页面"), "error");
    wantSwap();
  }

  // The card of a block that does not run here says why, in its frame.
  for (const card of allCards()) {
    const why = card.dataset.geState === "document" ? t("这个块只能放在文档里") : card.dataset.geState === "disabled" ? t("这个块已停用") : null;
    if (why) card.append(element("div", { class: "ge-card-note", "data-doc-dev": "", text: why }));
  }

  // ---------- the grip, the corner, 添加自定义块 ----------
  const layer = mount(element("div", { class: "ge-board-layer" }));
  const grip = element("div", { class: "ge-board-grip", role: "button", tabindex: "-1", "aria-haspopup": "menu", "aria-label": t("拖动以移动卡片，点击打开菜单"), html: DOTS });
  // In a phone's room (tiny) the grip only opens the menu: its tooltip says so, and what gives it its drag back.
  tooltip(grip, () => (shown && tiny(shown.parentElement) ? t("点击打开菜单") : t("拖动以移动")), () => (shown && tiny(shown.parentElement) ? t("窗口宽一些才能拖动") : t("点击打开菜单")));
  const corner = element("div", { class: "ge-board-resize", role: "button", "aria-label": t("拖动调整大小"), html: CORNER });
  tooltip(corner, t("拖动调整大小"));
  layer.append(grip, corner);
  let shown = null; // the card the grip stands in
  let hideTimer = 0;
  let at = null; // where the pointer was last seen: { x, y }
  const layerBox = () => layer.getBoundingClientRect();
  const resizable = (card) => runs(card) && Boolean(infoOf(card)?.card?.resize) && !tiny(card.parentElement);
  const cardOf = (node) => (node instanceof Element ? node.closest(`${BOARD} > ${CARD}`) : null);
  function show(card) {
    clearTimeout(hideTimer);
    if (shown !== card) shown?.removeAttribute("data-ge-hover");
    shown = card;
    card.setAttribute("data-ge-hover", "");
    grip.setAttribute("data-shown", "");
    grip.tabIndex = 0;
    put(card);
  }
  // The grip and the corner on `card` as it stands now (a hide still pending stays pending).
  function put(card) {
    const box = layerBox();
    const rect = card.getBoundingClientRect();
    // Inside the card at its top-right corner, left of the scrollbar a card that scrolls has.
    const bar = Math.max(0, card.offsetWidth - card.clientWidth - 2 * card.clientLeft);
    grip.style.left = `${Math.round(rect.right - bar - GRIP.inset - GRIP.size - box.left)}px`;
    grip.style.top = `${Math.round(rect.top + GRIP.inset - box.top)}px`;
    grip.toggleAttribute("data-narrow", tiny(card.parentElement)); // a phone's room: a click's cursor, the grip drags nothing
    if (resizable(card)) {
      corner.style.left = `${Math.round(rect.right - box.left - 24)}px`;
      corner.style.top = `${Math.round(rect.bottom - box.top - 24)}px`;
      corner.setAttribute("data-shown", "");
    } else corner.removeAttribute("data-shown");
  }
  function hide() {
    clearTimeout(hideTimer);
    if (menu.isOpen || gesture) return;
    shown?.removeAttribute("data-ge-hover");
    shown = null;
    grip.removeAttribute("data-shown");
    grip.tabIndex = -1;
    corner.removeAttribute("data-shown");
  }
  // The card whose grip shows: the one the pointer is over, else the one the keyboard focus is in (or
  // the grip's own focus: the card it stands in), none when neither is.
  const underPointer = () => {
    if (!at) return null;
    const node = document.elementFromPoint(at.x, at.y);
    return node && (grip.contains(node) || corner.contains(node)) ? shown : cardOf(node);
  };
  const focusedCard = () => {
    const node = document.activeElement;
    if (!(node instanceof Element) || node === document.body) return null;
    if (grip.contains(node)) return shown;
    return node.matches(":focus-visible") ? cardOf(node) : null;
  };
  function settle() {
    clearTimeout(hideTimer);
    if (menu.isOpen || gesture) return;
    const card = underPointer() ?? focusedCard();
    if (card) show(card);
    else hide();
  }
  const hideSoon = () => {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(settle, 150);
  };
  addEventListener("pointermove", (event) => {
    at = { x: event.clientX, y: event.clientY };
    if (gesture || menu.isOpen) return; // the grip stays at the card whose menu is open
    const target = event.target instanceof Element ? event.target : null;
    if (grip.contains(target) || corner.contains(target)) return void clearTimeout(hideTimer);
    const card = cardOf(target);
    if (card) show(card);
    else if (shown) hideSoon();
  }, { passive: true });
  document.documentElement.addEventListener("pointerleave", () => {
    at = null;
    if (!gesture) hideSoon();
  });
  addEventListener("scroll", () => { if (shown && !gesture) show(shown); }, { passive: true });
  addEventListener("focusin", () => { if (!gesture) settle(); });
  addEventListener("focusout", () => { if (!gesture) hideSoon(); });

  // 添加自定义块 of a page open alone in a tab: a button at the top right of each board, above it (in a
  // workbench the top bar has it: addCard below).
  const adds = new Map(); // a board -> its 添加自定义块
  const PLUS = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 4.75v10.5M4.75 10h10.5"/></svg>';
  function placeAdds() {
    if (hosted) return;
    const box = layerBox();
    for (const board of boards()) {
      let add = adds.get(board);
      if (!add) {
        add = element("button", { type: "button", class: "ge-board-add", "aria-label": t("添加自定义块") }, element("span", { html: PLUS }), element("span", { text: t("添加自定义块") }));
        add.addEventListener("mousedown", (event) => event.preventDefault());
        add.addEventListener("click", () => {
          window.focus();
          openLibrary(board, { button: add });
        });
        layer.append(add);
        adds.set(board, add);
      }
      const { rect } = geometry(board); // its right edge the last column's
      add.style.left = `${Math.round(rect.right - box.left - add.offsetWidth)}px`;
      add.style.top = `${Math.round(Math.max(4, rect.top - box.top - add.offsetHeight - 8))}px`;
    }
    for (const [board, add] of adds) {
      if (!board.isConnected) {
        add.remove();
        adds.delete(board);
      }
    }
  }
  placeAdds();
  // The room or a board's columns changed (the window resized, the sidebar folded, a card's size told): the
  // grip stands on its card where it is now, its menu with it (closed where the board's columns changed
  // under it: its rows, 大小 ›, read them).
  let menuColumns = "";
  const columnsNow = () => boards().map((board) => board.dataset.columns).join();
  function placeAgain() {
    placeAdds();
    if (!shown || gesture) return;
    put(shown);
    if (!menu.isOpen) return;
    if (columnsNow() !== menuColumns) menu.close();
    else menu.follow(grip.getBoundingClientRect());
  }
  addEventListener("doc-layout-change", placeAgain);
  addEventListener("resize", placeAgain);
  new ResizeObserver(placeAgain).observe(document.body);
  new MutationObserver(placeAgain).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["data-columns"] });
  document.fonts?.ready.then(placeAgain);

  // ---------- the menu ----------
  const press = new Map(); // a pointer's press on the grip: { card, x, y }
  function openMenu(card) {
    const info = infoOf(card);
    const board = card.parentElement;
    const cells = placeOf(card);
    const items = [];
    if (runs(card) && info.settings?.length) items.push({ label: t("设置…"), icon: GEAR, run: () => openCardSettings(card) });
    const sizes = (info?.card?.sizes ?? []).filter(([w]) => cells.x + w <= columnsOf(board));
    if (resizable(card) && sizes.length > 1) {
      items.push({
        label: t("大小"), icon: SIZE, icons: false, compact: true,
        // By width, then height (the user's word of 2026-11-09; the manifest lists its default first).
        submenu: () => [...sizes].sort(([aw, ah], [bw, bh]) => aw - bw || ah - bh).map(([w, h]) => ({ label: `${w} × ${h}`, current: w === cells.w && h === cells.h, run: () => layOut(board, () => placeCard(card, { ...cells, w, h }), { lift: card }) })),
      });
    }
    if (items.length) items.push({ separator: true });
    items.push({ label: t("删除"), icon: ICONS.trash, danger: true, run: () => removeCard(card) });
    if (!board) return;
    show(card);
    menuColumns = columnsNow();
    grip.setAttribute("data-pressed", "");
    menu.open(items, grip.getBoundingClientRect(), {
      label: t("卡片菜单"), highlight: false, align: "end",
      onClose: () => {
        grip.removeAttribute("data-pressed");
        hideSoon();
      },
    });
  }
  grip.addEventListener("keydown", (event) => {
    // Enter with the menu open is the menu's own (the keys below run its highlighted row); only a closed menu is the grip's to open.
    if (event.defaultPrevented || event.isComposing || (event.key !== "Enter" && event.key !== " ") || !shown || gesture || menu.isOpen) return;
    event.preventDefault();
    event.stopPropagation();
    openMenu(shown);
  });
  addEventListener("pointerdown", (event) => {
    if (!menu.isOpen) return;
    const target = event.target instanceof Node ? event.target : null;
    if (menu.contains(target) || grip.contains(target) || [...adds.values()].some((add) => add.contains(target))) return;
    menu.close();
  }, true);

  // ---------- moving and resizing ----------
  const dots = element("div", { class: "ge-board-dots", "data-doc-dev": "", "aria-hidden": "true" });
  // The board's dots over all it draws now (its rows grow as a draft puts a card lower), each at a point of
  // its lattice: where the gaps between four cells cross, and as far out on its edges, a DOT px room
  // around each (the tile's corner the gradient draws it in).
  const dotsOn = (board) => {
    const { rect, step } = geometry(board);
    const box = board.getBoundingClientRect();
    const columns = Math.round((rect.right - rect.left + GAP) / step);
    const rows = Math.max(1, Math.round((board.clientHeight + GAP) / step));
    Object.assign(dots.style, {
      left: `${rect.left - box.left - board.clientLeft - GAP / 2 - DOT}px`, top: `${-GAP / 2 - DOT}px`,
      width: `${columns * step + 2 * DOT}px`, height: `${rows * step + 2 * DOT}px`, backgroundSize: `${step}px ${step}px`,
    });
  };
  // Each frame of a gesture: near the window's top or bottom edge the page scrolls (./motion.mjs
  // createEdgeScroll: timed by the frames, faster nearer the edge, never past FASTEST px a second) and the
  // gesture follows what came into view; a card settling onto (or off) what it snaps to is drawn again.
  let pointer = null;
  let scrolling = 0;
  const edge = createEdgeScroll();
  const frame = () => {
    scrolling = 0;
    if (!gesture || !pointer) return;
    if (edge.frame(pointer.clientY, performance.now())) follow(pointer);
    else if (gesture.settle.gliding()) draw();
    scrolling = requestAnimationFrame(frame);
  };
  // The cards of `board` laid out by `change` (cells set), those it moves gliding there (./motion.mjs), the grip
  // put again on its card once they stand.
  const layOut = (board, change, options = {}) => glide(cardsIn(board), () => {
    const result = change();
    globalThis.DocBoard?.layout(board);
    return result;
  }, { settled: placeAgain, ...options });

  function begin(kind, card, event) {
    stopGlide(card); // still gliding from a drop: taken up where its cells are
    const board = card.parentElement;
    const file = placeOf(card);
    const rect = card.getBoundingClientRect();
    // skip: the rows the board skipped as the gesture began, which the kit keeps while its draft is shown
    // (a card held above the first row skips fewer): the pointer's row is reckoned by it throughout.
    gesture = { kind, card, board, file, skip: skipped(board), target: { ...file }, grab: { x: event.clientX - rect.left, y: event.clientY - rect.top }, start: { x: event.clientX, y: event.clientY, width: rect.width, height: rect.height, scroll: scrollY }, settle: createSettle(SNAP), size: null };
    document.documentElement.setAttribute(kind === "move" ? "data-ge-dragging" : "data-ge-sizing", "");
    card.setAttribute(kind === "move" ? "data-ge-lifted" : "data-ge-sizing", "");
    board.setAttribute("data-ge-dotted", "");
    board.prepend(dots);
    dotsOn(board);
    grip.removeAttribute("data-shown");
    corner.removeAttribute("data-shown");
    follow(event);
    scrolling = requestAnimationFrame(frame);
  }
  function follow(event) {
    const { kind, card, board, file, skip, grab, start } = gesture;
    pointer = { clientX: event.clientX, clientY: event.clientY };
    const { rect, cell, step } = geometry(board);
    const fits = card.dataset.geFit === "content";
    const columns = columnsOf(board);
    let target;
    if (kind === "move") {
      // Where it lands (landing): the whole cells nearest to its top-left, unless they only clip the cards they
      // meet, half of neither, when it is the free place around them, else where it landed before; put on one
      // card that can take its place, where the exchange puts it, the two exchanging (`swap`).
      const left = event.clientX - grab.x - rect.left;
      const top = event.clientY - grab.y - rect.top;
      const at = { x: left / step, y: top / step + skip };
      target = { ...file, ...landing(layoutOf(board), { id: card.dataset.cardId, w: file.w, h: file.h }, at, gesture.target, columns) };
    } else {
      // The card follows the pointer between the least and the most it can snap to (its listed sizes', or
      // its min and max), never past its row's end, standing at the size a drop gives where it is near it.
      const block = infoOf(card)?.card ?? {};
      const listed = block.any ? null : block.sizes?.filter(([w]) => file.x + w <= columns); // a card its block frees (any) takes every whole size
      const least = listed?.length ? { w: Math.min(...listed.map(([w]) => w)), h: Math.min(...listed.map(([, h]) => h)) } : { w: block.min?.w ?? 1, h: block.min?.h ?? 1 };
      const most = listed?.length ? { w: Math.max(...listed.map(([w]) => w)), h: Math.max(...listed.map(([, h]) => h)) } : { w: Math.min(columns - file.x, block.max?.w ?? 12), h: block.max?.h ?? 24 };
      const scrolled = scrollY - start.scroll;
      const width = clamp(start.width + event.clientX - start.x, spanOf(least.w, cell), spanOf(most.w, cell));
      const height = clamp(start.height + event.clientY - start.y + scrolled, spanOf(least.h, cell), spanOf(most.h, cell));
      const asked = { w: Math.max(1, Math.round((width + GAP) / step)), h: Math.max(1, Math.round((height + GAP) / step)) };
      const size = listed?.length ? sizeFor({ sizes: listed }, asked) : sizeFor(block, { w: Math.min(asked.w, columns - file.x), h: asked.h }, columns - file.x);
      target = { ...file, w: size.w, h: fits ? file.h : size.h };
      gesture.size = { width, height, w: spanOf(size.w, cell), h: spanOf(size.h, cell), fits };
    }
    if (!landsSame(target, gesture.target) || !gesture.drafted) {
      gesture.target = target;
      gesture.drafted = true;
      // The cards it meets make way, gliding (the held card follows the pointer: draw); the card it exchanges
      // with drafted at its new place, as the drop leaves it (dropped).
      const cells = new Map([[card, target]]);
      if (target.swap) {
        const other = cardById(target.swap);
        const after = dropped(layoutOf(board), { id: card.dataset.cardId, ...target }, columns).find((one) => one.id === target.swap);
        if (other?.parentElement === board && after) cells.set(other, after);
      }
      glide(cardsIn(board), () => draft(board, cells), { still: card });
    }
    draw();
    dotsOn(board);
  }
  // The held card drawn where the pointer has it: moved, at the cells it would land at (the draft's), off them
  // by the pointer's offset but where that is within SNAP px; resized, at the pointer's size but where that is
  // within SNAP px of the size a drop gives. Each axis settles onto (or off) what it snaps to (createSettle).
  function draw() {
    const { kind, card, board, grab, settle, size } = gesture;
    const time = performance.now();
    if (kind === "move") {
      const { rect, step } = geometry(board);
      const now = drawn(card);
      const cells = { x: now.x * step, y: (now.y - skipped(board)) * step };
      const x = settle.at("x", pointer.clientX - grab.x - rect.left, cells.x, time);
      const y = settle.at("y", pointer.clientY - grab.y - rect.top, cells.y, time);
      card.style.translate = `${Math.round(x - cells.x)}px ${Math.round(y - cells.y)}px`;
    } else {
      card.style.width = `${Math.round(settle.at("w", size.width, size.w, time))}px`;
      if (!size.fits) card.style.height = `${Math.round(settle.at("h", size.height, size.h, time))}px`;
    }
  }
  function finish(drop) {
    const done = gesture;
    gesture = null;
    cancelAnimationFrame(scrolling);
    edge.stop();
    pointer = null;
    const { card, board, file, target, kind } = done;
    document.documentElement.removeAttribute("data-ge-dragging");
    document.documentElement.removeAttribute("data-ge-sizing");
    card.setAttribute("data-ge-landing", ""); // its lifted shadow eases out (and it stays over the others while it glides)
    card.removeAttribute("data-ge-lifted");
    card.removeAttribute("data-ge-sizing");
    // Let go: it glides from where it is seen to its cells (dropped) or back to its own (Escape), over the
    // others meanwhile, and they to theirs.
    glide(cardsIn(board), () => {
      card.style.translate = "";
      card.style.width = "";
      card.style.height = "";
      dots.remove();
      board.removeAttribute("data-ge-dotted");
      if (drop && !cellsSame(target, file)) placeCard(card, target, { kind });
      draft(board, null);
    }, { lift: card, settled: placeAgain });
    if (!isGliding(card)) setTimeout(() => { if (!isGliding(card)) card.removeAttribute("data-ge-landing"); }, 220);
    trySwap();
    hideSoon(); // the grip comes back where the pointer is
  }
  grip.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !shown || gesture) return;
    event.preventDefault();
    window.focus(); // the page's keys (Escape) in a workbench, whose frame a press kept from moving the focus would not take them
    grip.setPointerCapture(event.pointerId);
    grip.setAttribute("data-pressed", "");
    press.set(event.pointerId, { card: shown, x: event.clientX, y: event.clientY, opened: menu.isOpen });
  });
  grip.addEventListener("pointermove", (event) => {
    const held = press.get(event.pointerId);
    if (!held) return;
    if (gesture) return follow(event);
    if (Math.hypot(event.clientX - held.x, event.clientY - held.y) < THRESHOLD) return;
    held.moved = true; // a press that went this far is no click: a phone's room moves nothing and opens nothing
    if (tiny(held.card.parentElement)) return;
    menu.close();
    begin("move", held.card, { clientX: held.x, clientY: held.y });
    follow(event);
  });
  const release = (event, drop) => {
    const held = press.get(event.pointerId);
    if (!held) return;
    press.delete(event.pointerId);
    grip.removeAttribute("data-pressed");
    corner.removeAttribute("data-pressed");
    if (gesture) return finish(drop);
    // A click opens the card's menu, and closes it where it stood open as the press began.
    if (drop && held.kind !== "resize" && !held.moved) {
      if (held.opened && menu.isOpen) menu.close();
      else openMenu(held.card);
    }
  };
  grip.addEventListener("pointerup", (event) => release(event, true));
  grip.addEventListener("pointercancel", (event) => release(event, false));
  grip.addEventListener("lostpointercapture", (event) => release(event, false));
  corner.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !shown || gesture || !resizable(shown)) return;
    event.preventDefault();
    window.focus();
    corner.setPointerCapture(event.pointerId);
    corner.setAttribute("data-pressed", "");
    press.set(event.pointerId, { card: shown, x: event.clientX, y: event.clientY, kind: "resize" });
    begin("resize", shown, event);
  });
  corner.addEventListener("pointermove", (event) => { if (press.has(event.pointerId) && gesture) follow(event); });
  corner.addEventListener("pointerup", (event) => release(event, true));
  corner.addEventListener("pointercancel", (event) => release(event, false));
  corner.addEventListener("lostpointercapture", (event) => release(event, false));

  // ---------- the ops ----------
  // Each op is a task of the client's (./client.mjs): what the page shows of it is drawn at once, what it
  // sends is built once the tasks before it are done (each card's base as their answers left it), and its
  // answer and its undo step are taken in before the next task starts. One done inside another task (an
  // undo's) is handed that task's `send` and runs there.
  const inTask = (send, work) => (send ? work(send) : client.run(work));

  // A card at `cells` (a drop, a resize, 大小 ›; a drop's `swap` the card it exchanges with): the board as the
  // service's rule has it at once (dropped: pushDown where there is no exchange), then as it answers.
  function placeCard(card, cells, { kind = "move" } = {}) {
    const board = card.parentElement;
    const view = viewOf(board);
    const before = layoutOf(board);
    const id = card.dataset.cardId;
    const after = dropped(before, { id, ...cells }, columnsOf(board));
    for (const one of after) {
      const node = cardById(one.id);
      if (node) setCells(node, one, view);
    }
    return client.run(async (send) => {
      const answer = await send({ op: "place", card: id, x: cells.x, y: cells.y, w: cells.w, h: cells.h, ...(cells.swap ? { swap: cells.swap } : {}), base: card.dataset.geBase, ...viewed(view) });
      if (!answer?.ok) {
        for (const one of before) {
          const node = cardById(one.id);
          if (node) setCells(node, one, view);
        }
        return failed(answer);
      }
      took(answer);
      // The board's cards in the view the op acted on, as the service wrote them.
      const now = answer.cards.filter((one) => one.board === board.dataset.boardId).map((one) => (view === "narrow" ? { id: one.id, ...(one.narrow ?? {}) } : one));
      const changed = moved(before, now).map((one) => ({ id: one.id, before: before.find((was) => was.id === one.id), after: { x: one.x, y: one.y, w: one.w, h: one.h } })).filter(({ before: was }) => was);
      if (changed.length && kind !== "measure") history.push({ kind: "cells", view, cards: changed.map(({ id: one, before: was, after: is }) => ({ id: one, before: { x: was.x, y: was.y, w: was.w, h: was.h }, after: is })) });
    });
  }

  // A card taken out (删除, an add's undo, a remove's redo): off the page at once, then by the service
  // (`send`: inside a task already), one step of undo where `step` says so.
  function removeCard(card, { step = true, send = null } = {}) {
    const board = card.parentElement;
    const id = card.dataset.cardId;
    const at = card.nextSibling;
    if (shown === card) hide();
    card.remove();
    leaving.add(id);
    return inTask(send, async (post) => {
      const answer = await post({ op: "remove", card: id, base: card.dataset.geBase });
      leaving.delete(id);
      if (!answer?.ok) {
        board.insertBefore(card, at?.parentNode === board ? at : null);
        return failed(answer) ?? false;
      }
      kept.set(id, card);
      took(answer);
      if (step) history.push({ kind: "remove", id, board: board.dataset.boardId, html: answer.removed.html });
      return true;
    });
  }

  // A card put back (`html`, as remove gave it): its node, where this page kept it, else the page shown again. Inside an undo's task.
  async function putBack(step, send) {
    const board = boardById(step.board) ?? boards()[0];
    if (!board) return false;
    const answer = await send({ op: "add", html: step.html, board: board.dataset.boardId });
    if (!answer?.ok) return failed(answer) ?? false;
    const node = kept.get(step.id);
    if (answer.card !== step.id) {
      history.renamed(step.id, answer.card);
      step.id = answer.card;
    }
    if (node) {
      kept.delete(step.id);
      node.dataset.cardId = answer.card;
      board.append(node);
    }
    took(answer, { own: [answer.card] });
    if (!node) wantSwap();
    return true;
  }

  // A block's data parts (`parts`: name -> its inside) written: on the page, then by the service.
  const partNodes = (card, names) => {
    const at = infoOf(card)?.parts ?? {};
    const instance = instanceOf(card);
    return Object.fromEntries(names.map((name) => [name, at[name] && instance ? [...instance.querySelectorAll(at[name])].find((node) => instanceAround(node) === instance) ?? null : null]));
  };
  const putInto = (node, html) => {
    if (!node) return;
    if (node.localName === "script") node.textContent = html;
    else node.innerHTML = html;
  };
  // On the page at once; then, in its turn (`send`: inside a task already), by the service, one step of
  // undo where `step` says so. Gives the answer, or null where it was refused (the parts put back).
  function writeParts(card, parts, { step = false, send = null } = {}) {
    const nodes = partNodes(card, Object.keys(parts));
    const was = Object.fromEntries(Object.entries(nodes).map(([name, node]) => [name, node ? (node.localName === "script" ? node.textContent : node.innerHTML) : null]));
    for (const [name, html] of Object.entries(parts)) putInto(nodes[name], html);
    return inTask(send, async (post) => {
      const answer = await post({ op: "edit", card: card.dataset.cardId, parts, base: card.dataset.geBase });
      if (!answer?.ok) {
        for (const [name, html] of Object.entries(was)) if (html !== null) putInto(nodes[name], html);
        failed(answer);
        return null;
      }
      took(answer);
      if (step) history.push({ kind: "edit", id: card.dataset.cardId, parts: answer.parts });
      return answer;
    });
  }

  // ---------- settings ----------
  function settingsOf(card) {
    const node = partNodes(card, ["settings"]).settings;
    try {
      const value = JSON.parse(node?.textContent?.trim() || "{}");
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    } catch {
      return {};
    }
  }
  function openCardSettings(card) {
    const info = infoOf(card);
    openSettings({
      fields: info.settings, values: settingsOf(card), name: info.name, anchor: (shown === card ? grip : card).getBoundingClientRect(),
      save: (values) => client.run(async (send) => {
        const answer = await send({ op: "settings", card: card.dataset.cardId, values, base: card.dataset.geBase });
        if (!answer?.ok) return failed(answer);
        putInto(partNodes(card, ["settings"]).settings, answer.parts.settings.now);
        took(answer);
        if (answer.parts.settings.was !== answer.parts.settings.now) history.push({ kind: "edit", id: card.dataset.cardId, parts: answer.parts });
      }),
    });
  }

  // ---------- the library ----------
  // Opened under `button` (a page alone's 添加自定义块), else under `rect` (a workbench's: the place of its top
  // bar's button, in this frame's coordinates), else in the middle of the window. Gives whether it opened;
  // asked while it stands, it closes. In a workbench a press elsewhere in it (this frame losing the focus)
  // closes it, as a press on the page does.
  let library = false;
  async function openLibrary(board, { button = null, rect = null } = {}) {
    if (library) {
      menu.close();
      return false;
    }
    menu.close();
    let listed = [];
    try {
      listed = (await (await fetch(workspaceAddress(`/__gallery/pages/${slug}/library?language=${language}`))).json()).blocks ?? [];
    } catch {
      say(t("连不上本地服务"), "error");
      return false;
    }
    // A section of each pack (the user's word of 2026-11-09), its name over its blocks, in the service's order
    // (the packs as 设置 › 组件列表 has them, each's blocks by name); what is typed keeps the sections it finds blocks in.
    const rows = (text = "") => {
      const items = [];
      let pack;
      for (const block of listed) {
        const words = `${said(block.name)} ${said(block.description)} ${block.id}`.toLowerCase();
        if (text.trim() && !words.includes(text.trim().toLowerCase())) continue;
        if (block.pack?.id !== pack) {
          pack = block.pack?.id;
          if (pack) items.push({ title: said(block.pack.name) || pack });
        }
        items.push({
          label: said(block.name) || block.id, icon: BLOCK, hint: block.installed ? `${block.size.w} × ${block.size.h}` : t("自带"),
          ...(block.picture || block.description ? { preview: { picture: block.picture ?? null, says: said(block.description) } } : {}),
          run: () => addBlock(board, block),
        });
      }
      return items;
    };
    button?.setAttribute("data-pressed", "");
    const closed = () => menu.close();
    if (!button) addEventListener("blur", closed);
    library = true;
    menu.open(rows(), button ? button.getBoundingClientRect() : rect ?? { left: innerWidth / 2, right: innerWidth / 2, top: 0, bottom: 0, width: 0, height: 0 }, {
      label: t("添加自定义块"), align: "end", empty: t("没有能放在页面上的块"),
      ...(button || rect ? {} : { stand: ({ width, height }) => ({ left: Math.max(8, (innerWidth - width) / 2), top: Math.max(8, (innerHeight - height) / 3) }) }),
      onClose: () => {
        library = false;
        button?.removeAttribute("data-pressed");
        removeEventListener("blur", closed);
      },
      search: { placeholder: t("搜索块…"), filter: rows, empty: t("没有找到") },
    });
    return true;
  }
  // The workbench's 添加自定义块 (the session's add-card command: `anchor` the place of its button in this
  // frame's coordinates, none for the middle of the window): the library of the page's FIRST board;
  // asked while it stands, it closes.
  async function addCard({ anchor = null } = {}) {
    const board = boards()[0];
    if (!board) return { ok: false, reason: "board" };
    window.focus();
    const rect = anchor && [anchor.left, anchor.right, anchor.top, anchor.bottom].every(Number.isFinite)
      ? { left: anchor.left, right: anchor.right, top: Math.max(0, anchor.top), bottom: Math.max(0, anchor.bottom), width: anchor.right - anchor.left, height: Math.max(0, anchor.bottom - Math.max(0, anchor.top)) } : null;
    const closing = library;
    const opened = await openLibrary(board, { rect });
    return { ok: true, opened: !closing && opened };
  }
  const addBlock = (board, block) => client.run(async (send) => {
    const answer = await send({ op: "add", block: block.id, board: board.dataset.boardId, ...viewed(viewOf(board)) });
    if (!answer?.ok) {
      if (answer?.reason === "places" || answer?.reason === "disabled" || answer?.reason === "missing") return say(t("这个块不能放在页面上"), "error");
      return failed(answer);
    }
    history.push({ kind: "add", id: answer.card, board: board.dataset.boardId, html: answer.html });
    if (answer.measure) history.toMeasure(answer.card);
    took(answer, { own: [answer.card] });
    // The page shown again, with the block's script and style (the server puts them in), the step kept.
    wantSwap();
  });

  // ---------- 恢复默认卡片 ----------
  // The default cards a page with them misses put back (the service's restore-defaults), a task as every
  // op is: one step of undo for all of them (a group of adds), the page shown again with their blocks'
  // scripts and styles. Gives the service's answer ({ ok, added: [{ card, block, name }], skipped }),
  // which the workbench says, or its refusal.
  const restoreDefaults = () => client.run(async (send) => {
    const answer = await send({ op: "restore-defaults" });
    if (!answer?.ok) return answer ?? { ok: false };
    const added = answer.added ?? [];
    if (added.length > 0) {
      const boardOf = (id) => answer.cards.find((card) => card.id === id)?.board ?? null;
      history.push({ kind: "group", steps: added.map(({ card, html }) => ({ kind: "add", id: card, board: boardOf(card), html })) });
      took(answer, { own: added.map(({ card }) => card) });
      wantSwap();
    }
    return { ok: true, added: added.map(({ card, block, name }) => ({ card, block, name })), skipped: answer.skipped ?? [] };
  });
  // The workbench's 撤销 of that: the step undone only while it is the last one, the cards it names.
  const undoRestore = (cards) => client.run(async (send) => {
    const step = history.nextUndo();
    const ids = step?.kind === "group" ? step.steps.map((one) => one.id) : [];
    if (!Array.isArray(cards) || ids.length !== cards.length || ids.some((id, index) => id !== cards[index])) return { ok: false, reason: "moved-on" };
    history.takeUndo();
    if (!(await perform(step, "undo", send))) return { ok: false, reason: "refused" };
    history.undone(step);
    return { ok: true };
  });

  // ---------- undo and redo ----------
  // A step taken back or done again, inside the task of the undo or the redo (`send`): a group's each
  // in turn (undone from its last), whether any of them went.
  async function perform(step, way, send) {
    if (step.kind === "checked") {
      const answer = await todos.write({ slug: step.slug, ref: step.ref, done: way === "undo" ? !step.done : step.done, step: true });
      if (!answer.ok) {
        say(answer.reason === "offline" ? t("连不上本地服务") : answer.reason === "changed" || answer.reason === "ambiguous" ? t("这一项待办刚被改过，没能撤销") : t("没能改动这一项待办"), "error");
        return false;
      }
      if (answer.block) step.ref = { ...step.ref, block: answer.block };
      return true;
    }
    if (step.kind === "group") {
      let any = false;
      for (const one of way === "undo" ? [...step.steps].reverse() : step.steps) any = (await perform(one, way, send)) || any;
      return any;
    }
    if (step.kind === "cells") {
      const cards = step.cards.filter(({ id }) => cardById(id));
      if (cards.length === 0) return false;
      const to = way === "undo" ? "before" : "after";
      const view = step.view ?? "wide"; // the view the step was done in, whichever the board shows now
      layOut(cardById(cards[0].id).parentElement, () => { for (const one of cards) setCells(cardById(one.id), one[to], view); });
      const answer = await send({ op: "arrange", ...viewed(view), cards: cards.map((one) => ({ card: one.id, ...one[to], base: cardById(one.id).dataset.geBase })) });
      if (!answer?.ok) return failed(answer) ?? false;
      took(answer);
      return true;
    }
    if (step.kind === "edit") {
      const card = cardById(step.id);
      if (!card) return false;
      // The service's parts are as the page shows them (its own files where the server serves them), put on the page as they are.
      const parts = Object.fromEntries(Object.entries(step.parts).map(([name, { was, now }]) => [name, way === "undo" ? was : now]));
      return Boolean(await writeParts(card, parts, { send }));
    }
    const out = (step.kind === "remove") === (way === "redo");
    if (out) {
      const card = cardById(step.id);
      return card ? removeCard(card, { step: false, send }) : false;
    }
    return putBack(step, send);
  }
  // A task each: the step taken off once the tasks before it are done, so that a Ctrl+Z pressed before a
  // drop or a write is answered takes back that one, and two pressed at once go one after the other. The
  // checks of to-dos a block asked are such writes, though they are no tasks of the client (their own line,
  // todos): their step is pushed as each is answered, so the task waits for those asked before it.
  const undo = () => client.run(async (send) => {
    await todos.idle();
    const step = history.takeUndo();
    if (step && (await perform(step, "undo", send))) history.undone(step);
  });
  const redo = () => client.run(async (send) => {
    await todos.idle();
    const step = history.takeRedo();
    if (step && (await perform(step, "redo", send))) history.redone(step);
  });

  // ---------- keys ----------
  addEventListener("keydown", (event) => {
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    if (gesture && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      const held = [...press.keys()];
      press.clear();
      grip.removeAttribute("data-pressed");
      corner.removeAttribute("data-pressed");
      for (const pointer of held) {
        try {
          grip.releasePointerCapture(pointer);
          corner.releasePointerCapture(pointer);
        } catch {}
      }
      finish(false);
      return;
    }
    const inField = event.target instanceof Element && event.target.closest(FIELDS);
    if (menu.isOpen && !inField) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") menu.move(event.key === "ArrowDown" ? 1 : -1);
      else if (event.key === "Enter") menu.choose();
      else if (event.key === "Escape") menu.close();
      else return;
      event.preventDefault();
      return;
    }
    const key = event.key.toLowerCase();
    if (!(event.ctrlKey || event.metaKey) || event.altKey || inField || formOpen()) return;
    if (key === "z" && !event.shiftKey) undo();
    else if ((key === "z" && event.shiftKey) || key === "y") redo();
    else return;
    event.preventDefault();
  }, true);

  // ---------- a block's own writes ----------
  // A field of a card typed in: the page is not shown again under it until it is left.
  addEventListener("input", (event) => {
    const field = event.target instanceof Element ? event.target : null;
    if (field?.closest(`${BOARD} > ${CARD}`) && field.matches("input, textarea, select")) typing = field;
  }, true);
  addEventListener("focusout", (event) => {
    if (event.target === typing) {
      typing = null;
      trySwap();
    }
  }, true);
  // context.edit (the kit's doc-component-edit, cancelled to say it is taken): the block's change run on
  // a draft of each part it names, which goes onto the page when it returns; a change that wrote the part
  // on the page instead is put back and refused, as the document's editor refuses it.
  document.addEventListener("doc-component-edit", (event) => {
    const host = event.target instanceof Element ? event.target : null;
    const card = host?.parentElement?.closest(`${BOARD} > ${CARD}`);
    if (!card || instanceOf(card) !== host || !runs(card)) return;
    const { parts, run } = event.detail ?? {};
    if (!Array.isArray(parts) || typeof run !== "function") return;
    const read = (node) => (node.localName === "script" ? node.textContent : node.innerHTML);
    const before = parts.map(({ part }) => read(part));
    const drafts = parts.map(({ part }) => part.cloneNode(true));
    const ran = run(Object.fromEntries(parts.map(({ name }, index) => [name, drafts[index]])));
    const live = parts.findIndex(({ part }, index) => read(part) !== before[index]);
    if (live >= 0) {
      parts.forEach(({ part }, index) => { if (read(part) !== before[index]) putInto(part, before[index]); });
      console.error(`[DocKit] ${packageOf(host)}: context.edit: it wrote the part ${parts[live].name} on the page: a change writes the draft it is handed, which goes onto the page when it returns`);
      return;
    }
    if (!ran) return;
    event.preventDefault();
    if (typing && card.contains(typing)) typing = null;
    const changed = parts.map(({ name }, index) => [name, read(drafts[index])]).filter(([, html], index) => html !== before[index]);
    if (changed.length === 0) return;
    writeParts(card, Object.fromEntries(changed), { step: true });
  });

  // ---------- as the page starts ----------
  // The steps of the page before this one (its swap), but those of a card someone else changed since.
  history.forgetChanged(basesNow());
  // A card just added whose height is its content's: as high as that once drawn (the add's own step).
  const measuring = history.takeMeasure();
  if (measuring) {
    const card = cardById(measuring);
    const fit = () => {
      if (!card?.isConnected || !runs(card)) return;
      const inner = instanceOf(card);
      const style = getComputedStyle(card);
      const sides = ["paddingTop", "paddingBottom", "borderTopWidth", "borderBottomWidth"].reduce((sum, side) => sum + (parseFloat(style[side]) || 0), 0);
      const { cell } = geometry(card.parentElement);
      const cells = cellsOf(card);
      const h = fitHeight((inner?.getBoundingClientRect().height ?? 0) + sides, cell);
      if (h !== cells.h && viewOf(card.parentElement) === "wide") placeCard(card, { ...cells, h }, { kind: "measure" });
    };
    const drawnAlready = () => document.documentElement.hasAttribute("data-doc-drawn");
    if (drawnAlready()) requestAnimationFrame(fit);
    else {
      const watch = new MutationObserver(() => {
        if (!drawnAlready()) return;
        watch.disconnect();
        requestAnimationFrame(fit);
      });
      watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-doc-drawn"] });
    }
  }
  // The page's first-open note, while its map says so, its note of new default cards (put in as
  // 恢复默认卡片 puts them: restoreDefaults), and the middle of a blank page (an Agent writes it).
  if (map.hint) showHint(map, { hosted });
  if (map.news) showNews(map, { restore: restoreDefaults });
  if (map.blank) showBlank(map);
  // Its blocks may write from now on (the kit's context.canEdit, editable).
  dispatchEvent(new Event("doc-editable"));
  return { swap: wantSwap, undo, redo, idle: () => Promise.all([client.idle(), todos.idle()]), restoreDefaults, undoRestore, addCard };
}
