import { documentKey, workspaceStoragePrefix } from "../../shared/workspace-address.mjs";
import { workspaceAddress } from "../../shared/workspace-address.mjs";
// First: what the browser keeps under the names before 2026-10-28 carried to the new ones (the
// editor's gallery-edit:… keys, src/shared/renamed-storage.mjs), before any module below reads them.
import "../../shared/renamed-storage.mjs";
import { OUTER, can, captureLayout, editableAhead, firstByAttribute, firstHost, isHost, limitText, markFrames, markKinds, matchesSource, newHost, newMention, ownHTML, plainText, prepareBlock, splitBlock, textEnd, tidyEmptied, unitElement, withLeads } from "./core.mjs";
import { createBlocks } from "./blocks.mjs";
import { hiddenByFold, reveal } from "./folded.mjs";
import { createFlags } from "./flags.mjs";
import { createFrame } from "./frame.mjs";
import { createHistory } from "./history.mjs";
import { editable, hostOf, select, selectAt, caretAt, caretAtOffset, atEdge, endArrowRun, arrow, besideLine, chipsPress, followPress, outOfAtom, showCaret, followEnd, selectionContext, textNear } from "./caret.mjs";
import { closePanel, messageKind, noticeNode, panelItem, panelNode, relayTo, say, settle, showPanel } from "./notices.mjs";
import { failure, postAnswer } from "./post.mjs";
import { exportReport } from "./export-report.mjs";
import { createCommits, kindOf } from "./commit.mjs";
import { createConflicts, packageChanged, unfit } from "./conflicts.mjs";
import { checkLeft, createAutosave, keepWith, lostKey, pendingKey, readLost, recover, reloadView, setReloader, takeView, viewNow } from "./autosave.mjs";
import { createPull, pullOn } from "./pull/apply.mjs";
import { SOLO, connectWorkbench } from "./session.mjs";
import { OUTLINE_OPEN_KEY, onOutlineOpen, outlineOpen, setOutlineOpen } from "../../shared/preferences.mjs";
import { lookOfElement } from "../../shared/document-look.mjs";
import { belowTargets, convertBlock, convertGroup, groupParents, groupTargets, headingShifts, noTextToCarry, shiftHeadings, targetsOf, touchedBy, turnInto, turnParents, turnUnit, typeOf } from "./convert.mjs";
import { joinCode, rangeAt, rangeOffsets } from "./marks.mjs";
import { SURFACE_MARK, addStyle, copyAddress, element, layer, textButton } from "./ui.mjs";
import { PROVISIONAL } from "../../shared/provisional.mjs";
import { createClipboard } from "./clipboard/index.mjs";
import { createDropIn } from "./drop-in/index.mjs";
import { createPageDrop } from "./page-drop/index.mjs";
import { serveFiles } from "./served.mjs";
import { followFiles, stampedUrl } from "./assets-live.mjs";
import { createFormatting } from "./format-bar/index.mjs";
import { connectHints, hideHint, readOnlyReason, scheduleHint, trackPointer } from "./hints/index.mjs";
import { createInsert } from "./insert/index.mjs";
import { createAfter } from "./after/index.mjs";
import { connectLinks, dismissLink, drawPasted, followLink, leadsToPage, linkBoxNode, linkHolds, linkNodes, linkOf, linkPending, openLink, pageLinkOf } from "./links/index.mjs";
import { bookmarkItems, connectViews, linkTitle, offerViews } from "./links/views.mjs";
import { connectChipFills } from "./chip-fills.mjs";
import { connectFormula, dismissFormula, formulaBoxNode, loadKatex, openFormula } from "./formula/index.mjs";
import { settlePads } from "./pads.mjs";
import { followLongRuns } from "./long-runs.mjs";
import { beforeDelete, codeArrow, codeClick, codePress, deletedBack, deletingBack, settleCodeEdge, takeEntry } from "./typing/code-edges.mjs";
import { createMarkdown } from "./markdown/index.mjs";
import { createResize } from "./resize/index.mjs";
import { connectPages, fieldOpen, keptByComponent, menuRow, modalOps, pageAt, pageIcon, pageObjects, pageOf, pageOfHost, pageOfType, pageOfUnit, panelOpen, setPageIcon, typedAsIs } from "./page-objects.mjs";
import { preloading } from "./type-grid.mjs";
import { createColumnGaps } from "./columns/index.mjs";
import { viewFrames } from "./table/binding.mjs";
import { createTableEditing } from "./table/index.mjs";
import { createAtMenu } from "./at-menu/index.mjs";
import { createSlashMenu } from "./slash-menu/index.mjs";
import { STRAY_SPLIT, createTyping } from "./typing/index.mjs";
import { createLeaving } from "./typing/leave.mjs";
import { createTextSelection } from "./text-select/index.mjs";
import { createSelectAll, topStep } from "./select-all/index.mjs";
import { revealText } from "./find/index.mjs";
import { createOutline } from "./outline/index.mjs";
import { createAnnotate } from "./annotate/index.mjs";
import { watchFocus } from "./focus.mjs";
import { createChanges as createAgentChanges } from "./changes/index.mjs";
import { BLOCK_TYPES, HOSTS, PLAIN_TEXT, TYPE_INFO, accepts, blankSaysOf, boxOwner, texOnly, textFilters } from "../components/registry.mjs";
import { createPages } from "../components/pages.mjs";
import { openMediaPicker } from "./emoji-picker/index.mjs";
import { connectPicker, popupOpen } from "./emoji-picker/support.mjs";
import { menuOpen } from "./menu.mjs";
import { DEFAULT_TAB_ICON, iconKind, iconUrl } from "../../shared/emoji/icon-value.mjs";
import { mediaUrl } from "../../shared/media.mjs";
import { decoded, fullAddress, isFileLink } from "../../shared/page-address.mjs";
import { goBackTo, onReaderMove, placeIn, unmoved } from "../../shared/reading-place.mjs";
import { leaveView } from "../../shared/kept-view.mjs";
import { heldList, holdPages } from "./links/pages.mjs";
import { hideBlocks } from "./offered.mjs";
import { storageOf } from "./storage.mjs";
import { createTodoWrites } from "./todo-writes.mjs";
import { language, t } from "../../shared/i18n/index.mjs";

// In-place editing for the live preview (`npm run dev:local` only; never exported).
// Each editable block is its own contenteditable host, so a selection never spans blocks and
// every block maps to one source range (a list item's text; the lists it holds are blocks of their
// own, never part of its content). Plain typing and IME composition stay with the browser.
//
// This module starts the editor and routes the page's events to the editing tools, each in a
// folder of its own (docs/editor.md, "Where the editing tools live"):
//
//   typing/       Enter, Backspace/Delete at block edges, auto spacing, placeholders
//   insert/       new blocks: below a block (its menu), a click below the last block, a paragraph before or after
//   after/        the caret after a block of no text (a click right of it): Backspace deletes it, Enter or a key a paragraph after it
//   format-bar/   the bar over selected text and its keys (marks.mjs does the marks)
//   links/        the link box (Ctrl+K), following links; hints/: why something is read-only
//   formula/      the formula box: selected text made an inline formula (Ctrl+Shift+E)
//   slash-menu/   the "/" menu; at-menu/: the "@" menu; markdown/: Markdown shortcuts as the reader types
//   page-drop/    a page of the workbench's sidebar dragged into the text: a page block where it is let go (the "@" menu's)
//   clipboard/    copying, cutting and pasting blocks and text
//   resize/       dragging the edges of cards, tables and code blocks
//   columns/      the gaps between columns (分栏) and between a flowchart's nodes in a row: resizing the two beside one, a column added at its pin
//   table/        a table's rows and columns: their grips and menus, + to put one in, the bars that add them
//   select-all/   Ctrl+A: the block's text, then its container's blocks, one level a press, then the page
//   outline/      目录: the page's headings at its right (the room there is margin.mjs's)
//   annotate/     批注: started from the format bar, a block's button or Ctrl+Alt+M; cards in the margin, with no room markers in the gutter and the card by the words
//   changes/      the Agent's changes (设置 › 显示变更): what an Agent wrote since the reader last kept or reverted it, marked; the bar at the bottom
//   blocks.mjs    the block tools: handle/, block-menu/, selection/, drag/
//
// and the components' own editing (src/editor/components/<name>/page.mjs). Undo and redo are
// history.mjs; turning blocks into other types goes through convert.mjs (convertHost, convertUnit
// below). A report's page is always editing and saves by itself (autosave.mjs, commit.mjs).

const mapElement = document.getElementById("doc-edit-map");
const MAP = JSON.parse(mapElement.textContent);
mapElement.remove();

const keys = { tab: "gallery-edit:tab" };
const units = new Map((MAP.units ?? []).map((unit) => [unit.id, unit]));
const boxes = new Map((MAP.boxes ?? []).map((box) => [box.id, box]));
const baselines = new Map();
let layout = null; // the page's units as the last commit left them (captureLayout, commit.mjs)
let blocks = null; // block handles, selection and deleting (blocks.mjs)
let resize = null; // resizing cards and tables (resize/)
let gaps = null; // the gaps between columns (columns/)
let tables = null; // a table's rows and columns (table/)
let formatting = null; // the bar over selected text (format-bar/)
let slash = null; // the "/" menu (slash-menu/)
let atMenu = null; // the "@" menu (at-menu/)
let pageDrop = null; // a page of the workbench's sidebar dropped into the text (page-drop/)
let markdown = null; // Markdown shortcuts as the reader types (markdown/)
let selectAll = null; // Ctrl+A widening step by step (select-all/)
let outline = null; // the page's headings at its right (outline/), not on a page opened on its own (?solo)
let annotate = null; // 批注 (annotate/), on every page of a session
let agentChanges = null; // what an Agent changed, under review (changes/), on every page of a session
let editing = false;
let composing = false; // an input method is composing
// A composition ends with compositionend, which Chrome does not always send (a paste over the text
// being composed): a key, an input, a press or a paste that is no part of one ends it too, so that
// saving and the format bar never wait on a composition that is over.
const compositionOver = (event) => {
  if (composing && !event.isComposing && event.keyCode !== 229) composing = false;
};
let pressing = false; // the main button is down on the page (a click or a drag under way)
let pressedText = null; // the text block a press of the main button came down in (onPointerDown), for the click that ends it
let commits = null; // the page's commits (commit.mjs)
let autosave = null; // when they go (autosave.mjs)
let conflicts = null; // what the file refused, for the reader to decide (conflicts.mjs)
let unsaveable = { blank: 0, unplaced: 0, strays: 0 }; // blocks the page cannot save as they are
let notice = null; // { text, time }: what a commit just said, to say again if the page reloads by itself
// Whether a merge (or a manifest given up) was said a moment ago: 已保存 and 已重新连上 say less and do not say over it,
// a page that takes someone else's write in where it stands (pull/) having no load to say it again.
const mergeTold = () => Boolean(notice) && Date.now() - notice.time < 5000;

const storageScope = { prefix: workspaceStoragePrefix() };
const local = storageOf(() => localStorage, storageScope);
const session = storageOf(() => sessionStorage, storageScope);

// This tab, kept over reloads (sessionStorage). Each tab keeps what waits to be saved (the crash
// buffer, autosave.mjs) under its own id, so two tabs of a report never overwrite each other's; the
// open tabs answer with their ids (a BroadcastChannel), so a page only sends what tabs that are gone
// left there.
const newTab = () => Math.random().toString(36).slice(2, 10);
let TAB = session.get(keys.tab) ?? newTab();
session.set(keys.tab, TAB);
const channel = (() => { try { return new BroadcastChannel(`gallery-edit:${documentKey(MAP.slug)}`); } catch { return null; } })();
channel?.addEventListener("message", (event) => {
  if (event.data?.type === "who") channel.postMessage({ type: "here", tab: TAB });
});

function openTabs(wait = 150) {
  if (!channel) return Promise.resolve(new Set());
  const open = new Set();
  const listen = (event) => { if (event.data?.type === "here") open.add(event.data.tab); };
  channel.addEventListener("message", listen);
  channel.postMessage({ type: "who" });
  return new Promise((resolve) => setTimeout(() => {
    channel.removeEventListener("message", listen);
    resolve(open);
  }, wait));
}

const STYLE = `
  /* A frame shows only around what is being edited: the text with the caret, or the component
     whose text it is, drawn in the editor's layer (frame.mjs) with the corners given here, never
     as the element's own outline. Selected blocks get a fill instead (selection/). */
  /* Editable text has a text block's corners and, framed, a light fill under the pointer, unless its
     component declares others: --ge-text-radius, and --ge-text-tint (none: plain; a cell, a code
     block and its title, a disclosure's title, a media block's
     caption, a card's title and caption). */
  [data-ge-editing] [contenteditable="true"] { border-radius: var(--ge-text-radius, 3px); }
  [data-ge-editing] [contenteditable="true"]:focus { outline: none; }
  [data-ge-editing] [data-ge-round="box"] { border-radius: 8px; }
  [data-ge-editing] [data-ge-round="text"] { border-radius: 3px; } /* as a text block's */
  /* Text inside a component: the component carries the frame, the text lights up under the pointer. */
  [data-ge-editing] [data-ge-framed][contenteditable="true"]:is(:hover, :focus) { box-shadow: var(--ge-text-tint, inset 0 0 0 100vmax color-mix(in srgb, var(--doc-accent, #2678d8) 9%, transparent)); }
  /* An inline element of the report's own kept whole (data-ge-own) looks as the report draws it. */
  [data-ge-editing] [data-ge-atom]:not([data-ge-own]) { border-radius: 4px; }
  /* A chip of the text is one character to a selection (user-select: all): a drag that reaches it takes all of it. */
  [data-ge-editing] [data-ge-atom] { user-select: all; }
  /* An empty block under the caret says what it takes; out of the flow, so the caret stays at its start. */
  [data-ge-editing] [data-ge-placeholder]::before { content: attr(data-ge-placeholder); position: absolute; color: var(--doc-muted, #716e69); opacity: .7; white-space: nowrap; pointer-events: none; }
  [data-ge-editing] :is(h1, h2, h3, h4)[data-ge-placeholder]::before { opacity: .35; }
  /* 输入以筛选… while the handle's "+" menu is open (typing/ updatePlaceholder): the tertiary text on the pale field gray (--ge-field), as typed-field.mjs draws it: no outline round it (it reached over the lines beside it). */
  [data-ge-editing] [data-ge-adding][data-ge-placeholder]::before { color: var(--ge-tx3); opacity: 1; background: var(--ge-field); border-radius: .5px; }
  /* An empty block one is typing in is a line high, yet Chrome lets the margin above it pass
     through it as through an empty box, and counts it again below it: a new paragraph made a
     quote's bar, a panel, a paragraph gap longer until it got a character. A trace of padding
     keeps the margin where it is (a minimum height does not). It weighs nothing: a text with
     padding of its own keeps it (a new code block's empty title lost its 8px below, standing 4px
     off its fold arrow until a character came). */
  :where([data-ge-editing]) :where([contenteditable="true"]:empty) { padding-bottom: .1px; }
`;

// ---------- state ----------

// What the editor says when the preview server cannot be reached.
const OFFLINE = t("连不上 Gallery 的服务（它还在运行吗？gallery open 会启动它）");

// Where saving stands: what the workbench session (session.mjs) reports and data-ge-save says.
const IDLE_STATE = { waiting: 0, syncing: false, offline: false, stopped: null, foreign: false, reloading: false, held: 0, drafts: 0, unstored: false };
// A change made in the last moment, not counted yet (checkChanges), waits too.
const view = () => {
  const state = autosave?.state ?? IDLE_STATE;
  return {
    editing, ...state, waiting: state.waiting + (checkPending ? 1 : 0) + (heldBack() ? 1 : 0), ...unsaveable,
  };
};

// The editor's state changed: data-ge-save, the workbench session, and a word when commits stop
// getting through or get through again. While editing, the preview's live reload leaves
// reloading to the page (autosave.mjs: once nothing waits).
let lastState = "saved";
let reconnecting = false; // back from offline, what it held on its way: said to be saved once it is
function refresh() {
  window.__galleryEditBusy = editing;
  const state = saveState(view());
  document.documentElement.setAttribute("data-ge-save", state);
  document.documentElement.toggleAttribute("data-ge-drafts", view().drafts > 0); // blocks not finished, not written (tests read it)
  document.documentElement.toggleAttribute("data-ge-behind", Boolean(view().foreign)); // someone else's write not shown yet (tests read it)
  if (autosave) {
    if (state === "offline" && lastState !== "offline") say(t("{0}：修改暂存在浏览器里，连上后自动保存。", OFFLINE), "error");
    else if (state === "saved" && reconnecting && !mergeTold()) say(t("已重新连上，修改已保存。"));
    reconnecting = state !== "held" && state !== "saved" && (reconnecting || state === "offline");
    lastState = state;
  }
  workbench?.update();
  showTabIcon();
}

// The browser tab shows the page's icon (the server's link in the head, render/emoji.mjs), changed
// with it: a new icon, one taken away, an undo. A page with none shows the default document icon
// (DEFAULT_TAB_ICON: a tab whose link is taken away keeps the image it showed), its link the
// preview's own (data-doc-dev: an export of the view leaves it out, as the file has no icon).
let tabIcon;
function showTabIcon() {
  const value = pageIcon();
  if (value === tabIcon) return;
  tabIcon = value;
  let link = document.head.querySelector("link[data-doc-tab-icon]");
  if (!link) {
    link = element("link", { rel: "icon", "data-doc-tab-icon": "" });
    document.head.append(link);
  }
  link.toggleAttribute("data-doc-dev", !value);
  const href = value ? iconUrl(value, MAP.slug, { tab: true }) : DEFAULT_TAB_ICON;
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}

// Where saving stands, in one word (on the page's root as data-ge-save, for styles and tests). A block
// holding structure its words cannot (`strays`, checkChanges) is held as a refusal is: the file keeps
// what it had, the page shows more.
const saveState = ({ waiting, syncing, offline, stopped, reloading, held, strays = 0 }) => stopped ? "stopped" : reloading ? "reloading" : offline ? "offline"
  : syncing ? "syncing" : waiting > 0 ? "waiting" : held > 0 || strays > 0 ? "held" : "saved";

// ---------- undo, the components, typing ----------

// What a block's drawing holds back unwritten (a database's: database/page.mjs), which the page counts as
// unsaved (`view`'s waiting), keeps from being shown again (autosave's holding) and has written first
// (flushHeld) before undo and redo, before it closes (prepare-close) and as it is hidden (pagehide).
const heldBack = () => pageObjects().some((page) => page.holding?.());
const flushHeld = () => { for (const page of pageObjects()) page.flush?.(); };

const history = createHistory({
  changed: markChanged, beforeUndo: () => { closeTyped(); flushHeld(); }, blocks: () => blocks, show: showLanded, tidy: () => [...pageObjects().flatMap((page) => page.tidy ?? []), tidyEmptied],
  afterText: (element) => pageOf(element)?.afterText?.(element), // what follows a text step undone or redone
  refuse: (why) => say(why === "pulled" ? t("Agent 拿走或改动了这一步改过的块：没有撤销，可以直接改。") : t("这里合并进了 Agent 同时写的字，撤销会把它们一起撤掉：没有撤销，可以直接改。"), "error"),
  mergedOff: (hosts) => commits?.unseen(hosts), // what undo took off the page with someone else's words in it: the file asks first
  // A change about to be recorded in a box the file has not got yet (a record's body before its first word): the
  // page object whose box it is makes it the file's first, its own step (database/page.mjs).
  realize: (node) => { if (node?.closest?.(`[${PROVISIONAL}]`)) for (const page of pageObjects()) page.realize?.(node); },
});
const { lastKnown, recordText, recordStep, sourceStep, closeTyping, struct, finish: finishStep, lookStep, undo, redo } = history;

// Where undo or redo landed shown: the Sheet panels out of sight around it, from the outside in (a
// click on a panel's tab switches to it), and the detail card it is in.
function showLanded(node) {
  const panels = [];
  for (let at = node?.nodeType === 1 ? node : node?.parentElement; at; at = at.parentElement) if (at.hidden) panels.unshift(at);
  panels.forEach((panel) => boxOwner(panel)?.click());
  modalOps().show(node);
}

// The caret after a block of no text, where a click right of one puts it (insert/ clickBlank).
const after = createAfter({ struct, blocks: () => blocks, keepText: (node) => blocks.keepText(node), removeBlocks: (units) => blocks.remove(units), say, undo: () => undo(), redo: () => redo() });
const insert = createInsert({ struct, blocks: () => blocks, after });
const { newParagraph } = insert;

// What a component does on the page beyond what every block does is its own page module
// (src/editor/components/<name>/page.mjs, listed in components/pages.mjs); the editor calls it where
// that happens (Enter, Backspace, Tab, typing, a press, undo) and gives them all one `ctx`.

// The icon picker's images go into the report's folder (editor/media-store.mjs), where the server serves them,
// each by the stamp the page heard last of it (assets-live.mjs: a file written again is a new address).
const assetUrl = (file) => stampedUrl(mediaUrl("asset", MAP.slug, file), file);
serveFiles(assetUrl); // a table cell's pictures (单元格里的图片) show where the server serves them
connectPicker({ slug: MAP.slug, token: MAP.token, notify: say });
// A file of the folder written again while the page is open (an Agent's picture copied over one of the same name): shown where it
// stands, and wherever what the page held before the write comes back (an undo, a pull's units, a block brought back: assets-live.mjs).
followFiles({ slug: MAP.slug });
// A block of the page checking a to-do of a document (context.workspace.setTodo: ./todo-writes.mjs): written
// by the workspace's service, this one's too as any write it did not make, which the page merges; no step of
// its undo (only a custom page keeps one: board/).
createTodoWrites({ token: MAP.token }).listen();
// Whether a block tool may act: the page edits, no reload is on its way and no field of a component is being edited.
const active = () => editing && !autosave?.state.reloading && !fieldOpen();
// A picture or file sent to the report's folder (kind: "image", "file" or "embed"): the server's answer.
async function uploadTo(kind, body) {
  const answer = await post("/__gallery/edit/upload", { slug: MAP.slug, kind, ...body });
  if (!answer.ok) throw new Error(failure(answer, t("上传失败")));
  return answer;
}
// A web page as the server reads it (parts: "all" for a bookmark, "icon" or "title" for a link's
// views: links/views.mjs), its images kept in the report's folder.
async function readPage(url, parts = "all") {
  const answer = await post("/__gallery/edit/unfurl", { slug: MAP.slug, url, parts });
  if (!answer.ok) throw new Error(failure(answer, t("打不开这个网页")));
  return answer;
}
// The one `ctx` of the components' page modules, each taking what it uses of it (docs/editor.md,
// "Component definitions"); createPages adds `pages`, what they have of each other. What is made
// only in boot() (the block tools, the format bar, the "/" menu) is asked for when it is used.
connectPages(createPages({
  // the page's file and undo: the edit map, the baselines, the last recorded content of each block, an undo step of each kind
  map: MAP, baselines, lastKnown, recordText, closeTyping, struct, finishStep, look: lookStep, sourceStep,
  // a box made on the page that the file holds once a block goes in (a record's body: commit.mjs madeBox)
  madeBox: (node, kind, key) => commits?.madeBox(node, kind, key) ?? null,
  // the editor's state, and what it does for a component
  say, isEditing: () => editing, isComposing: () => composing, active, closeTools, refreshState: () => refresh(),
  hideFormatBar: () => formatting.hide(),
  // text blocks and their types
  limitText, caretAtOffset, selectionContext, typeOf, targetsOf, convertHost, newParagraph,
  // the block tools, and a table's tools (table/); a key that is the "/" or "@" menu's, standing on text a component takes keys of (their key())
  blocks: () => blocks, tables: () => tables,
  typedKey,
  // the report's folder: pictures, files, embedded files and a bookmark's images go there (editor/media-store.mjs)
  assetUrl, upload: uploadTo,
  // 复制图片: an image's picture on the system clipboard as a PNG, with the clipboard's own data (clipboard/picture.mjs)
  copyPicture: (unit) => clipboard.copyPicture(unit),
  fileUrl: (path) => stampedUrl(mediaUrl("file", MAP.slug, path), path),
  embedUrl: (path) => stampedUrl(mediaUrl("embed", MAP.slug, path), path),
  async importEmoji(library) {
    const answer = await post("/__gallery/edit/upload", { slug: MAP.slug, library });
    if (!answer.ok) throw new Error(failure(answer, t("无法使用这个自定义表情")));
    return answer.path;
  },
  // the web, through the server: a bookmark's page, whether a page lets frames show it
  unfurl: (url) => readPage(url),
  frameable: (url) => post("/__gallery/edit/frameable", { slug: MAP.slug, url }),
  // tools of the page's: the icon picker, a link's 显示为 › rows (links/views.mjs), KaTeX
  openMediaPicker, showAs: (figure, link) => bookmarkItems(figure, link), loadKatex,
})); // what the engines ask of a component (page-objects.mjs)

const typing = createTyping({
  struct, say, keepText: (node) => blocks.keepText(node), paragraphBefore: insert.paragraphBefore, removeBlocks: (units) => blocks.remove(units), selectBlock: (unit) => blocks.select(unit),
  adding: () => slash?.adding ?? null,
  leave: createLeaving({ struct, touchedBy, convertHost, typeOf, targetsOf }),
  showHidden: (node) => blocks?.folds.showAround(node), // a folded heading's section opened before a join takes in its words (fold/)
  look: lookStep, // a block's alignment and indent taken off by Backspace (align.mjs)
  afterAbove: (host) => after.back(host), // Backspace right after a block of no text: the caret after it (after/)
});
// Selecting text across blocks: its listeners go before the editor's own keys and clipboard.
const crossText = createTextSelection({
  isEditing: () => editing, struct, say, keepText: (node) => blocks.keepText(node), selectUnits: (list) => blocks.select(list), markUnits: (list) => blocks.mark(list), split: (host) => typing.split(host),
  copy: (data, range, pieces, cut) => clipboard.copyAcross(data, range, pieces, cut), // its blocks, each of its type (clipboard/)
  claims: (from, to) => tables?.claims(from, to) ?? false, // a drag between cells of a table selects them (table/)
  selectAll: (event, touched) => selectAll?.across(event, touched) ?? false, // Ctrl+A: the first container holding its blocks (select-all/)
  // The format bar: shown for it, its keys and buttons formatting it (format-bar/).
  keeps: (node) => formatting?.holds(node) ?? false, formatKey: (event) => formatting?.key(event) ?? false, changed: () => formatting?.schedule(),
});
// A key that is the "/" or "@" menu's, standing on what is typed: it comes before anything of the text's.
function typedKey(event) {
  return slash.key(event) || atMenu.key(event);
}

// What stands on what is being typed goes, the text staying: the "/" menu and the "@" menu, which
// hold commits back while they stand.
function closeTyped() {
  slash?.close();
  atMenu?.close();
}

// The box of a formula in the text closes, and what stands open over the page as a component's editor
// (`panel`), what is in them kept: commits wait while one stands.
function keepPanels() {
  if (formulaBoxNode()) dismissFormula();
  panelOpen()?.dismiss();
}

// What a press that edits something closes first: what opens over the page.
function closeTools() {
  formatting.hide();
  closeTyped();
  blocks.closeMenu();
  if (linkBoxNode()) dismissLink();
  keepPanels();
}
const clipboard = createClipboard({
  editing: () => editing, blocks: () => blocks, struct, recordText, say,
  loadKatex,
  // A link shown with its icon pasted: its icon kept where it is a file of this report's folder
  // (served from it, or a copy of this report's own blocks), else a globe; a page block as it is, its
  // address good in any document, but for one to a block of the page it was copied from, and shown
  // as its document is now.
  mention(parts, same, from) {
    const chip = newMention(document, { href: parts.href.startsWith("#") && !same && from ? `../${from}/doc.html${parts.href}` : parts.href, title: isFileLink(parts.href) ? parts.title : linkTitle(parts.title, parts.href), icon: (parts.slug ? parts.slug === MAP.slug : same) ? parts.icon : null, drawn: parts.drawn }, assetUrl);
    drawPasted(chip);
    return chip;
  },
  linkPasted: (link, page) => offerViews(link, { pasted: true, page }),
  pageLink: pageLinkOf,
  titleBold: () => formatting?.armed ?? false, // a node's empty title: what is pasted there bold, as typed
  spaced: (host) => typing.spaces.after(host, "paste"), // a space what is pasted strands goes in its step (typing/spaces.mjs)
  showCaret,
  pictures: () => tables?.pictures ?? null, // a table cell's (table/pictures.mjs)
  // Another document's media blocks pasted: their files sent to this document's folder, and shown where the server serves them.
  upload: (kind, body) => uploadTo(kind, body),
  served: (route, path) => (route === "asset" ? assetUrl(path) : stampedUrl(mediaUrl(route, MAP.slug, path), path)),
});

// ---------- editing ----------

// The page edits from the start: every block prepared, the layout and the commits set up.
function enter() {
  if (editing) return;
  // Two passes: every block made editable (or not) as the page was served, then every block rebuilt
  // (core.mjs editableAhead: a contenteditable set after blocks were rebuilt lays the page out again).
  // Resolve the initial hosts in one scan; a query for each block repeatedly walks a long page.
  const marked = firstByAttribute(document, "data-ge-block");
  const nodes = new Map();
  for (const block of MAP.blocks) {
    if (HOSTS[block.kind]?.closed) continue;
    const node = marked.get(String(block.id));
    if (!node) continue;
    if (HOSTS[block.kind]?.tex) node.setAttribute("contenteditable", "true"); // a display formula (components/math/)
    else if (!matchesSource(node, block.inner)) {
      node.setAttribute("data-ge-lock", "script");
      continue;
    } else editableAhead(node, block);
    nodes.set(block, node);
  }
  const hosts = [];
  // The blocks rebuilt from the file look as the page drew them: the kit's components hear it
  // quietly (DocKit.quietly: its tables lay themselves out again once the page is idle, not in
  // the frame editing starts in, which the outline's first drawing and a workbench's ready wait for).
  const quietly = globalThis.DocKit?.quietly ?? ((rebuild) => rebuild());
  quietly(() => {
    for (const block of MAP.blocks) {
      if (HOSTS[block.kind]?.closed) {
        pageOfHost(block.kind).prepare(block);
        continue;
      }
      const node = nodes.get(block);
      if (!node) continue;
      if (HOSTS[block.kind]?.tex) { // a display formula: the kit's drawing as its chip (components/math/)
        baselines.set(block.id, pageOfHost(block.kind).prepare(block, node));
        lastKnown.set(node, ownHTML(node));
        hosts.push(node);
        continue;
      }
      baselines.set(block.id, prepareBlock(node, block));
      const host = node.hasAttribute("data-ge-block") ? node : node.firstElementChild; // a Sheet tab's name span
      lastKnown.set(host, ownHTML(host));
      hosts.push(host);
    }
  });
  layout = captureLayout(document, MAP);
  markFrames(document, layout, hosts);
  // A text block holding a long run (a path, a URL) breaks anywhere, judged now and as its text changes (long-runs.mjs).
  followLongRuns(document.querySelector("main") ?? document.body);
  commits = createCommits({ root: document, map: MAP, baselines, units, boxes, getLayout: () => layout, setLayout: (next) => (layout = next) });
  // Commits wait while an input method composes, a formula is being edited (formula/), the "/" menu
  // or the "@" menu stands on what is typed for it (half of it is no text of the file's) or a gap
  // between a flowchart's nodes is dragged (columns/: the row is shown at the weights being dragged,
  // written on its nodes, until letting go makes them one undo step or Esc puts them back); the page
  // is not shown again (someone else's write) while the pointer is down, a 批注 is being written
  // (annotate/) or 仍然调整 has just written over someone else's change, its undo the reader's to take
  // (keepsOverwrite), unless the page asked to be shown again itself.
  autosave = createAutosave({
    map: MAP, commits, blocked: () => composing || formulaBoxNode() !== null || panelOpen() !== null || linkPending() || Boolean(gaps?.dragging || slash?.host || atMenu?.host), changedAt: () => lastChange, holding: (asked) => pressing || Boolean(annotate?.writing()) || keepsOverwrite(asked) || heldBack(), refresh, applied: committed, failed: refused, storage: local, tab: () => TAB,
    before: () => annotate?.sync() ?? null, // where the words of 批注 went with the edit, told before it is written (annotate/)
    warn: () => say(t("浏览器存储写不进去（空间满了，或被禁用）：没保存的修改只在这个页面上，先不要关掉它。"), "error"),
    notice: () => notice && Date.now() - notice.time < 10000 ? notice.text : null,
    session,
    reverted: (entries) => {
      conflicts.add(entries.map((entry) => ({ ...entry, key: `r:${entry.key}`, revert: entry.key, kind: entry.written ? "reverted-source" : entry.unit === undefined ? "reverted" : "reverted-unit" })));
      say(t("Agent 的写入把你之前保存的 {0} 处修改改回去了：在左下方选择保留哪一边。", entries.length), "error");
    },
    lapsed: (keys) => keys.forEach((key) => conflicts.remove(`r:${key}`)), // a block's card a later write settled (its own blocks where it stood)
    listed: () => showLost(), // a block the page before this one made, which someone else's write took out
    // Someone else's write shown where the page stands (pull/): the words of the blocks it changed put in, their
    // undo steps undoing three ways, the Agent's changes read again; off (pullOn), every write shows by a swap.
    pull: pullOn() ? createPull({
      commits: () => commits,
      merged: (host) => history.merged(host),
      rebased: (moved) => {
        history.pulled(moved); // undo steps recorded before go by the units as the pull left them
        blocks?.folds.pulled(); // what is folded stays so, what the write put under a folded heading hidden with it (fold/)
        // Blocks selected (Esc) that the write took out: no longer selected (the others stay).
        if (blocks?.picked.some((node) => !node.isConnected)) blocks.select(blocks.picked.filter((node) => node.isConnected), { quiet: true });
      },
      after: () => {
        agentChanges?.pulled();
        typing.untitled();
        refresh();
      },
    }) : null,
  });
  conflicts = createConflicts({ act: decide, nodeOf: conflictNode, restorable, copyBlock: (node) => clipboard.copyBlocks([node]), say });
  editing = true;
  document.documentElement.setAttribute("data-ge-editing", "");
  typing.untitled(); // an empty title says 未命名文档 from the start
  blocks?.folds.start(); // what was folded, folded again in this task: no frame shows it open (fold/)
  refresh();
  for (const page of pageObjects()) page.entered?.();
}

// What the page says when what a component wrote went by a manifest that changed: given up, the page shown again.
const outdatedNotice = () => t("自定义块刚刚变了，这次改动没有保存，页面已按新的块重新显示。");

// What 仍然调整 wrote over someone else's change of what a component writes, by page unit: the step that
// gives theirs back (installed/ overwrite), and when its write went in, all of it (commit.mjs `forced`).
// Refused again (someone wrote it again since the reader was shown it), the step stands for nothing and
// goes; gone in, no undo goes below it (history fold), and the page is not shown again for someone else's
// write before the reader's next change (that undo among them) or KEEP_OVERWRITE: shown again, the page has
// no undo steps, and theirs would be gone from it. A showing the page asks for itself (保留 Agent 的, a
// package changed) is not held: `asked`.
const overwrites = new Map(); // unit -> { step, landed }
const KEEP_OVERWRITE = 30000;
const keepsOverwrite = (asked) => !asked && [...overwrites.values()].some(({ landed }) => landed > lastChange && Date.now() - landed < KEEP_OVERWRITE);

// A commit was taken in (commit.mjs): a block merged with someone else's words shows the merge;
// what the file refused is flagged and held back, the rest goes on.
function committed({ conflicts: held, merged, outdated, forced = [], rekeyed = [] }, receipt) {
  agentChanges?.committed(receipt);
  for (const host of merged) history.merged(host);
  history.rekeyed(rekeyed); // the keys of tables the file gave otherwise, in the steps that recorded them
  for (const unit of forced) {
    const written = overwrites.get(unit);
    if (!written || written.landed > 0) continue;
    history.fold(written.step);
    written.landed = Date.now();
  }
  for (const entry of held) {
    const written = entry.kind === "unit" && entry.again && entry.change?.source ? overwrites.get(entry.unit) : null; // that write, refused again
    if (!written || written.landed > 0) continue;
    history.drop(written.step);
    overwrites.delete(entry.unit);
  }
  if (outdated) autosave.reloadSoon(); // what a component wrote by a manifest that changed: the page goes by the new one, shown again
  if (held.length > 0) {
    conflicts.add(held);
    const conflicted = held.filter((entry) => !unfit(entry) && !packageChanged(entry)).length;
    const packaged = held.filter(packageChanged).length;
    say(conflicted > 0 ? t("{0} 处修改和文件的最新版本冲突，没有保存：在左下方选择怎么处理。", conflicted) : packaged > 0 ? t("自定义块刚刚变了，{0} 处修改没有保存：在左下方选择怎么处理。", packaged) : t("{0} 处内容文档存不下，没有保存：在左下方选择怎么处理。", held.length), "error");
  }
  else if (outdated || merged.length > 0 || receipt.texts?.some((entry) => entry.status === "merged")) {
    const count = receipt.texts.filter((entry) => entry.status === "merged").length;
    notice = { text: outdated ? outdatedNotice() : t("已自动合并 {0} 段 Agent 同时做的修改。", count), time: Date.now() };
    say(notice.text, "note", 5000);
  }
  // What the server says besides (service.mjs retitle, reicon: "标题已更新", what did not follow it),
  // each note in the UI's language, as one sentence.
  else if (receipt.notes?.length) say(receipt.notes.length === 1 ? t(receipt.notes[0]) : t("{0}。", receipt.notes.map((note) => t(note)).join(t("；"))), "note", receipt.notes.length > 1 ? 6000 : undefined);
}

// ---------- conflicts ----------

// The block a conflict is about, on the page.
function conflictNode(entry) {
  if (entry.kind === "text") return document.querySelector(`[data-ge-block="${entry.block}"]`);
  if (entry.kind === "unit" || entry.kind === "reverted-unit" || entry.kind === "reverted-source") return document.querySelector(`[data-ge-unit="${entry.unit}"]`);
  if (entry.kind === "insert") return entry.element?.isConnected ? entry.element : null;
  // Someone else put a committed text back: found by what names it (it may be from an earlier load).
  if (entry.block?.title) return document.querySelector('[data-ge-kind="title"]');
  const unit = entry.block?.unit?.id ? document.querySelector(`[data-block-id="${CSS.escape(entry.block.unit.id)}"]`) : null;
  return entry.block?.self ? unit : null;
}

// Whether a key types or edits text: a character or an input method's (229), Enter, Backspace, Delete
// or Tab, with no Ctrl, Alt or ⌘.
const EDIT_KEYS = new Set(["Enter", "Backspace", "Delete", "Tab"]);
const editsText = (event) => !event.ctrlKey && !event.metaKey && !event.altKey && (event.key.length === 1 || event.keyCode === 229 || EDIT_KEYS.has(event.key));

// A text the file no longer has can be made again as a new block when it is a plain one.
// The keys that only modify others: pressed alone, nothing is typed.
const MODIFIER_KEYS = new Set(["Alt", "AltGraph", "Control", "Shift", "Meta", "OS", "CapsLock", "Fn"]);

function restorable(entry) {
  const host = entry.kind === "text" && entry.reason === "missing" ? conflictNode(entry) : null;
  return Boolean(host && MAP.blocks[entry.block]?.self && PLAIN_TEXT.has(typeOf(host)));
}

// Whether a held entry is about nothing the page still changes: a block made on the page that is off
// it, a text or a block's change the file cannot hold, which the page no longer asks for, or a block's
// change refused for someone else's change of it (`changed`) when the page makes no change of that kind
// any more (the deletion undone, the conversion undone or the block deleted since): what the reader does
// to it then goes, or asks, as any change does. What a component wrote stays on its card through undo and
// redo, as the reader's version of the block.
function undoneRefusal(entry, { edits, units }) {
  if (entry.kind === "insert") return Boolean(entry.element) && !entry.element.isConnected;
  if (entry.kind === "unit" && entry.reason === "changed" && !entry.change?.source) return !units.some((change) => change.id === entry.unit && kindOf(change) === kindOf(entry.change));
  if (!unfit(entry)) return false;
  return entry.kind === "text" ? !edits.some((edit) => edit.id === entry.block) : entry.kind === "unit" && !units.some((change) => change.id === entry.unit);
}

/** Do what the reader chose for a conflict (conflicts.mjs); true when it is settled. */
async function decide(entry, action) {
  if (entry.kind.startsWith("reverted")) return autosave.decide(entry.revert, action === "mine");
  const key = entry.key; // as commit.mjs holds it: "b<block>", "u<unit>" or "i<id>"
  const node = conflictNode(entry);
  if (action === "mine" || action === "force") {
    commits.resolve(key, action);
    // Written over what someone else wrote of what its component writes (`theirs`, by part, as the reader
    // was shown it): one undo gives the file's back.
    const step = action === "force" && entry.theirs && typeof entry.theirs === "object" && node ? pageOfUnit(node)?.overwrite?.(node, entry.theirs) : null;
    if (step) overwrites.set(entry.unit, { step, landed: 0 });
  } else if (action === "theirs") {
    // Words: given up for the file's (what the card did not show listed), shown as the file has them where the page
    // stands (pull/) or the page shown anew; a block's change: the page shown anew once nothing else waits.
    if (entry.kind === "text") autosave.giveUp(entry);
    else {
      commits.resolve(key, "discard");
      autosave.reloadSoon();
    }
    return true;
  } else if (action === "accept") { // the file deleted it: so does the page
    const unit = entry.kind === "text" ? node?.closest("[data-ge-unit]") : node;
    unit && withLeads(unit).forEach((part) => part.remove());
    commits.resolve(key, entry.kind === "text" ? "forget" : "discard");
  } else if (action === "restore") { // made again, as a new block where it was
    const next = newHost(document, typeOf(node), node);
    next.innerHTML = ownHTML(node);
    node.replaceWith(next);
    commits.resolve(key, "forget");
  } else if (action === "undo" && entry.element) { // the block made on the page goes
    withLeads(entry.element).forEach((part) => part.remove());
    commits.resolve(key, "discard");
  } else if (action === "nearby" && entry.element?.isConnected) {
    // Where the file surely takes it: right after the block it stands in, in the page's own flow,
    // or at the end of that flow when it stands there already. An undoable move; then written anew.
    const block = entry.element;
    const flow = block.closest("main");
    let top = block;
    while (top.parentElement && top.parentElement !== flow) top = top.parentElement;
    if (!flow || !top.parentElement) return false;
    const moved = struct([block.parentElement, flow], [], () => {
      if (top === block) flow.append(block);
      else top.after(block);
      return { touched: [], focus: null, select: block };
    });
    if (!moved) return false;
    commits.resolve(key, "retry");
  } else return false;
  markChanged(true);
  return true;
}

// A commit the server refuses whatever the page does: saving stops, and the page says why (the
// server's message, a whole one, in the UI's language).
function refused(reason, message) {
  if (reason === "token" || reason === "origin" || reason === "host") {
    say(t("预览服务器不认得这个页面了（重启过？），正在刷新；没保存的修改会自动放回。"), "prompt");
    autosave.store();
    setTimeout(() => reloadView(MAP.slug), 600);
    return;
  }
  say(reason === "missing" ? t("这份文档的文件不见了（被移动或删除了？）。修改暂存在浏览器里，没有保存。") : t("没有保存：{0}", message ? t(message) : reason), "error");
}

// ---------- change tracking ----------

// Comparing every block with its baseline is cheap but not free, so batch bursts of input.
// A timer, not requestAnimationFrame: animation frames pause while the page is not painted.
// `now`: a discrete change (not typing), committed without waiting for a pause.
let checkPending = false;
let discrete = false;
let lastChange = 0; // when the reader last changed anything (the page reloads by itself only in a pause)
function markChanged(now = false) {
  if (now) {
    // A structural change (undo among them): blocks it brought back are marked from what the file
    // has, and a conflict's flag is on the block it is about now.
    commits?.marks();
    conflicts?.reflag();
  }
  if (messageKind() === "error") settle(); // the reader is dealing with it
  typing.untitled(); // a title emptied (or filled) by any change says 未命名文档 (or nothing) at once
  lastChange = Date.now();
  discrete ||= now;
  const counting = checkPending;
  checkPending = true; // counts as waiting until counted
  refresh();
  if (!counting) setTimeout(checkChanges, 60);
}

// Also run at once when the page goes away, so the last keystrokes are counted.
function checkChanges() {
  if (!checkPending || !autosave) return;
  checkPending = false;
  const now = discrete;
  discrete = false;
  document.querySelectorAll('[data-ge-flag="check"]').forEach((node) => node.removeAttribute("data-ge-flag"));
  const collected = commits.collect();
  // What the file refused and the reader has undone: nothing is held for it any more.
  const lapsed = conflicts.drop((entry) => undoneRefusal(entry, collected));
  lapsed.forEach((entry) => commits.resolve(entry.key, "retry"));
  if (lapsed.length > 0 && messageKind() === "error") settle();
  // A new block with no place, or one that must keep some text: left out until the reader fixes it.
  // So is a block holding structure its words cannot (core.mjs strayIn): never written emptied.
  collected.unplaced.forEach((node) => node.setAttribute("data-ge-flag", "check"));
  collected.strays.forEach((node) => node.setAttribute("data-ge-flag", "check"));
  const before = unsaveable;
  unsaveable = { blank: collected.blank.length, unplaced: collected.unplaced.length, strays: collected.strays.length };
  if (unsaveable.unplaced > before.unplaced) say(t("红框里的新段落所在的位置放不下段落，没有保存：请并入相邻段落，或拖到别处。"), "error");
  else if (unsaveable.strays > (before.strays ?? 0)) say(t("红框里的块混进了文档存不下的结构，没有保存，文件里还是原来的内容：请撤销刚才的操作。"), "error");
  else if (unsaveable.blank > before.blank && !messageKind()) {
    say(collected.blank.map(blankSaysOf).find(Boolean) ?? t("这里还空着：写上内容后才会保存。")); // what its component says
  }
  autosave.changed(now, collected);
  refresh();
}

// ---------- block types ----------
// Turning blocks into other types (convert.mjs) as undo steps: from the "/" menu (slash-menu/),
// Markdown typed at a block's start (markdown/), the block menu (block-menu/) and the components.

// Turn a text block into another type as one undo step; the caret goes to the start of the block
// that holds its text now. `typed`: a range of what the reader typed to ask for it ("/…", "# "),
// taken away first (the block it leaves empty stands for a new highlight block or disclosure:
// convertBlock's `fresh`).
// `after(focus)`: what else the same undo step does to the converted block (a list made by "3. "
// beginning at 3), returning the containers it made.
function convertHost(host, type, typed = null, after = null) {
  const result = struct(touchedBy(host), [host], () => {
    typed?.deleteContents();
    const { focus, created } = convertBlock(host, type, { fresh: typed !== null });
    if (!focus && !typed) return null;
    const more = focus && after ? after(focus) : [];
    return { touched: [focus ?? host], focus: focus ?? host, created: [...created, ...more] };
  }, { attributes: viewFrames(type) });
  if (result) afterConvert(result.focus, type, result.focus !== host ? t("已转换为{0}", menuRow(type).label) : null);
}

// What the component of a type does with a new block of it (`onCreated`, registry.mjs): true when
// what comes next is its own.
const onCreated = (type, block) => pageOfType(type)?.onCreated?.(block, type);

// What a block turned or made into a type needs next: its component's (a media block's picture,
// file, link or page chosen, a formula block's formula typed), else the caret goes in it, on the
// words it came with where those are a sample, which typing takes the place of (`sample`); `said`,
// what the status line says of it.
function afterConvert(focus, type, said) {
  if (onCreated(type, focus)) return;
  caretAt(focus, "start");
  if (menuRow(type)?.sample && isHost(focus)) {
    const words = document.createRange();
    words.selectNodeContents(focus);
    select(words);
  }
  if (said) say(t("{0} · Ctrl+Z 撤销", said));
}

/**
 * A block of `type` below `target` (a text block or any other block), as the "/" menu makes one in a
 * block with text and the block menu's 在下方新建: the typed "/…" (`typed`) taken away; a
 * text block splits at its end (as Enter there would: an item after an item, a paragraph after a
 * heading) and the new block turns into the type; below any other block, an empty paragraph of its
 * box does (the first box out that takes one). One undo step.
 */
// A view of a table (a custom block that reads tables) is bound to the table above it as it is made
// (installed/page.mjs create), the tables' keys recorded in the same step (viewFrames).
function insertBelow(target, type, typed = null) {
  const splits = isHost(target) && can(target, "split");
  let after = target;
  while (!splits && after && !accepts(after.parentElement?.getAttribute("data-ge-box-kind"), "paragraph")) after = after.parentElement?.closest(OUTER);
  if (!splits && !after) return say(t("这里不能新建块。"));
  const result = struct(splits ? touchedBy(target) : [after.parentElement], splits ? [target] : [], () => {
    typed?.deleteContents();
    let fresh;
    if (splits) {
      const end = document.createRange();
      end.selectNodeContents(target);
      end.collapse(false);
      fresh = splitBlock(target, end);
    } else {
      fresh = newHost(document, "paragraph");
      after.after(fresh);
    }
    if (!fresh) return null;
    const turned = type === "paragraph" && fresh.localName === "p" ? { focus: null, created: [] } : convertBlock(fresh, type, { fresh: true });
    const focus = turned.focus ?? fresh;
    return { touched: splits ? [target, focus] : [focus], focus, created: turned.created };
  }, { attributes: viewFrames(type) });
  if (result) afterConvert(result.focus, type, t("已插入{0}", menuRow(type).label));
}

// The block handle's "+" (handle/): an empty block at the block's
// level below it (`where` "above": Alt, before it), the caret in it and the "/" menu open there
// unfiltered (slash-menu/ add: what is typed then filters it, as after a "/"), one undo step taking
// the block away again. A flowchart's node gets a node beside it (flowchart/ addAfter: its title the
// menu's, whose blocks go below the title, as a "/" typed there), any other block an empty paragraph
// or list item (insert/ addNear).
function addNear(unit, where) {
  const above = where === "above";
  const own = pageOfUnit(unit)?.addNear?.(unit, above);
  const host = own === undefined ? insert.addNear(unit, above ? "above" : "below") : own;
  if (!host) return say(t("这里不能新建块。"));
  if (slash.add(host)) typing.updatePlaceholder(host); // 输入以筛选… while nothing is typed
}

// 公式, 链接 and 页面 from the "/" menu: the typed "/…" goes (as typing), then a formula, a link or a
// page block where it was, its field open (formula/, links/).
const inlineInsert = {
  formula(host, typed) {
    typed.deleteContents();
    recordText(host);
    select(typed);
    openFormula(host, { fresh: true });
  },
  link(host, typed) {
    typed.deleteContents();
    recordText(host);
    select(typed);
    openLink(host, { fresh: true });
  },
  page(host, typed) {
    typed.deleteContents();
    recordText(host);
    select(typed);
    openLink(host, { fresh: true, page: true });
  },
};

// The block menu: a block (its handle) turned into a type, as one undo step (convert.mjs turnInto,
// turnUnit). What the type draws as it is made (`preload`) comes first when the block has text, the
// grid's preload (type-grid.mjs) not having brought it yet: what undo and redo put back is what was made.
function convertUnit(unit, type, { loaded = false } = {}) {
  const made = noTextToCarry(unit); // with no text to carry it is a new block, whose component says what follows (`onCreated`)
  const waits = !loaded && !made ? preloading(type) : null;
  if (waits) return void waits.then(() => unit.isConnected && convertUnit(unit, type, { loaded: true }));
  let emptied = false; // no block left to select: an empty one to write in
  const result = struct(turnParents(unit), [], () => {
    const turned = turnUnit(unit, type);
    emptied = Boolean(turned.emptied);
    return turned.focus ? { touched: [turned.focus], focus: turned.focus, created: turned.created, select: emptied ? null : unit } : null;
  }, { attributes: viewFrames(type) });
  if (!result) return;
  if (!made || !onCreated(type, result.focus)) {
    if (emptied && isHost(result.focus)) caretAt(result.focus, "start");
    else {
      // What it is now: the new highlight block or callout a block went into, as a disclosure (the
      // container is selected), the flowchart a block or a list went into (a container
      // of a type that takes a block as it is, no `wraps`), else the block holding the text.
      const { container, wraps } = BLOCK_TYPES[type];
      const target = container && !wraps ? result.focus.closest(container) : unitElement(result.focus);
      if (target) blocks.select(target, { quiet: true });
    }
  }
  say(t("已转换为{0} · Ctrl+Z 撤销", TYPE_INFO[type].label));
}

/**
 * Several blocks turned into one type at once (convert.mjs convertGroup: the block menu of a group
 * of selected blocks, the format bar over text across
 * blocks), one undo step. `select`: what they are now is selected (the block menu: undo selects what
 * they were, redo again what they are now); the format bar keeps its text selection itself. Returns
 * convertGroup's outcome (`hosts`: where each text block's text is now), or null when nothing changed.
 */
function convertAll(group, type, { select = true } = {}) {
  let outcome = null;
  const result = struct(groupParents(group, type), group.filter(isHost), () => {
    outcome = convertGroup(group, type);
    if (!outcome.changed) return null;
    const texts = [...outcome.hosts.values()].filter((host) => host?.isConnected && isHost(host));
    return { touched: texts, focus: texts[0] ?? null, created: outcome.created, ...(select ? { select: [...group], selectAfter: outcome.units } : {}) };
  });
  if (!result) return null;
  if (select) blocks.select(outcome.units, { quiet: true });
  preloading(type)?.then(() => pageOfType(type).redraw?.(outcome.units)); // what the type draws, come after the blocks did
  say(t("已转换为{0} · Ctrl+Z 撤销", TYPE_INFO[type].label));
  return outcome;
}

/**
 * 所有标题增大一级 ("up") and 所有标题减小一级 ("down"), the menu of a heading's level badge (fold/): every
 * heading of the document a level larger or smaller (convert.mjs headingShifts and shiftHeadings: 标题 1
 * stays, 标题 4 becomes a paragraph bold throughout), one undo step, which puts the caret back where it
 * was; with none to turn, nothing changes and nothing is written. The caret, or a text selection, in a
 * heading turned stays where it was in its words; selected blocks stay selected, a heading turned as what
 * it is now.
 */
function shiftAllHeadings(way, only = null) {
  const root = document.querySelector("main");
  // `only`: one heading (its level badge's 增大一级, 减小一级), turned by the same rule as all of them.
  const shifts = root ? headingShifts(root, way).filter(({ host }) => !only || host === only) : [];
  if (shifts.length === 0) {
    if (only) return void say(way === "up" ? t("这个标题不能再增大一级") : t("这个标题不能再减小一级"));
    return void say(way === "up" ? t("没有可以增大一级的标题") : t("没有可以减小一级的标题"));
  }
  const hosts = shifts.map(({ host }) => host);
  const text = getSelection();
  const range = text?.rangeCount ? text.getRangeAt(0) : null;
  const start = range && editable(range.startContainer);
  const end = range && editable(range.endContainer);
  const kept = start && end ? { start, end, from: rangeOffsets(start, range)[0], to: rangeOffsets(end, range)[1] } : null;
  const picked = blocks.picked;
  let outcome = null;
  const result = struct([...new Set(hosts.flatMap(touchedBy))], hosts, () => {
    outcome = shiftHeadings(shifts);
    if (!outcome.changed) return null;
    const texts = [...outcome.hosts.values()];
    return { touched: texts, focus: (kept && outcome.hosts.get(kept.start)) ?? texts[0], created: outcome.created };
  }, { caret: true });
  if (!result) return;
  const now = (node) => outcome.hosts.get(node) ?? node;
  if (kept && (outcome.hosts.has(kept.start) || outcome.hosts.has(kept.end)) && now(kept.start).isConnected && now(kept.end).isConnected) {
    const from = rangeAt(now(kept.start), [kept.from, kept.from]);
    const to = rangeAt(now(kept.end), [kept.to, kept.to]);
    const next = document.createRange();
    next.setStart(from.startContainer, from.startOffset);
    next.setEnd(to.startContainer, to.startOffset);
    now(kept.start).focus({ preventScroll: true });
    select(next);
  }
  if (picked.some((node) => outcome.hosts.has(node))) blocks.select(picked.map(now).filter((node) => node.isConnected), { quiet: true });
  if (only) say(way === "up" ? t("已将这个标题增大一级 · Ctrl+Z 撤销") : t("已将这个标题减小一级 · Ctrl+Z 撤销"));
  else say(way === "up" ? t("已将 {0} 个标题增大一级 · Ctrl+Z 撤销", outcome.hosts.size) : t("已将 {0} 个标题减小一级 · Ctrl+Z 撤销", outcome.hosts.size));
}

// A text block of the page left without its marks (contenteditable and its kind, no data-ge-block or
// data-ge-new: what the commits' table names no more): hostOf finds no block there, and the browser's
// own Enter would split it its own way (a division its item's text leaves out, no commit writing
// it), so Enter there says so and does nothing (typing/ STRAY_SPLIT).
function unmarkedText(target) {
  const start = target?.nodeType === 1 ? target : target?.parentElement;
  const root = start?.closest?.('[contenteditable="true"]');
  return Boolean(root?.closest("main")) && root.hasAttribute("data-ge-kind") && !isHost(root);
}

function onKeydown(event) {
  compositionOver(event);
  if (!editing) return;
  if (after.key(event)) return; // the caret after a block: its keys are its own (after/)
  // A 批注's card is a field of its own: its keys are its own, but for Ctrl+S, which saves it and the report.
  if (annotate?.holds(event.target)) {
    const mod = event.ctrlKey || event.metaKey;
    if (mod && !event.altKey && !event.shiftKey && event.key.toLowerCase() === "s") {
      event.preventDefault();
      saveNow();
    }
    return;
  }
  if (keptByComponent(event.target, event)) return; // the field of a code block's language menu keeps its keys, and all that stands in an instance of a component package
  followEnd(); // the caret it takes into a detail card's last block: the content to its end (caret.mjs)
  if (annotate?.key(event)) return; // Ctrl+Alt+M: what is selected or the caret's block annotated, or the marked words' card
  if (event.target?.closest?.(".ge-pop") && event.target.localName === "input") return; // so does any field of a menu card (a list number's)
  if (event.target?.closest?.(".ge-popup-layer")) return; // and the icon picker (emoji-picker/), which keeps its own
  if (typedKey(event)) return;
  const mod = event.ctrlKey || event.metaKey;
  if ((event.key !== "ArrowUp" && event.key !== "ArrowDown") || mod || event.altKey || event.shiftKey) endArrowRun();
  const key = event.key.toLowerCase();
  if (mod && !event.altKey && !event.shiftKey && key === "s") {
    event.preventDefault();
    saveNow();
    return;
  }
  if (pageAt(event.target)?.key?.(event)) return; // F2 on a tab, Enter or Esc in a tab being renamed
  // The outline keeps its own keys (outline/list.mjs); undo and redo work there as on the page itself.
  if (outline?.holds(event.target)) {
    if (mod && !event.altKey && (key === "z" || key === "y")) {
      event.preventDefault();
      key === "y" || event.shiftKey ? redo() : undo();
    }
    return;
  }
  const renamed = fieldOpen() === event.target;
  // Undo and redo also work with the focus on the page itself, or where a component says.
  if ((pageAt(event.target)?.undoHere?.(event.target) || event.target === document.body) && mod && !event.altKey && (key === "z" || key === "y")) {
    event.preventDefault();
    key === "y" || event.shiftKey ? redo() : undo();
    return;
  }
  const host = hostOf(event);
  // A formula block has no text the keys go into, its TeX changing in its editor alone (its
  // keys are those of a selected block). With the caret on one (a right click puts it
  // there), Enter opens its editor, as on it selected (blocks.mjs), and any other key that types or
  // edits selects it, saying so, and does nothing more, the focus staying on the page: the next key is
  // the selected block's (Backspace and Delete delete it), as Backspace selects a block above that holds
  // no text before it deletes it (typing/).
  if (texOnly(host) && editsText(event)) {
    const enter = event.key === "Enter";
    blocks.select(unitElement(host), { quiet: enter });
    if (!enter || !blocks.onKeydown(event)) event.preventDefault();
    return;
  }
  if (!host && !renamed && blocks.onKeydown(event)) return; // a selected block (keys wait while blocks are dragged)
  // Ctrl+A: the block's text, then its container's blocks, one level a press, then the page; a tab
  // being renamed keeps the browser's (its name).
  if (!renamed && selectAll.key(event, host)) return;
  if (!host && event.key === "Enter" && !event.isComposing && event.keyCode !== 229 && unmarkedText(event.target)) {
    event.preventDefault();
    say(STRAY_SPLIT());
    return;
  }
  if (!host || event.isComposing || event.keyCode === 229) return;
  // A modifier pressed alone types nothing: the handle and a hint stay (Alt held over the handle's
  // "+" adds above, handle/).
  if (!MODIFIER_KEYS.has(event.key)) {
    hideHint();
    blocks.typing();
  }
  if (formatting.key(event)) return; // Esc hides the format bar, its keys format the selected text
  // Backspace and Delete never stop at a pad by inline code (typing/code-edges.mjs); beside a
  // component's entry, outside it, they take the whole entry away, one undo step.
  if ((event.key === "Backspace" || event.key === "Delete") && !mod && !event.altKey && textFilters(host)) {
    const before = ownHTML(host);
    const removed = beforeDelete(host, event.key);
    if (removed) {
      event.preventDefault();
      recordStep(host, before);
      say(removed);
      return;
    }
  }
  const unit = event.key === "Escape" && !typing.escape(host) ? unitElement(host) : null;
  if (unit) {
    event.preventDefault(); // Esc in text selects the block around it, where no component keeps it
    blocks.select(unit);
  } else if (mod && !event.altKey && (key === "z" || key === "y")) {
    event.preventDefault();
    key === "y" || event.shiftKey ? redo() : undo();
  } else if (mod && !event.altKey && key === "k") {
    event.preventDefault();
    openLink(host);
  } else if (event.key === "Tab" && !mod && !event.altKey) {
    if (typing.tab(host, event.shiftKey)) event.preventDefault();
    else tabFrom(host, event.shiftKey); // the browser's, which passes over a formula block (passTab)
  } else if (event.key === "Enter" && mod && !event.altKey && !event.shiftKey && typing.commandEnter(host)) {
    event.preventDefault();
  } else if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    typing.split(host);
  } else if (event.key === "Enter") {
    if (typing.shiftEnter(host)) event.preventDefault();
  } else if (event.key === "Backspace" && !mod && !event.altKey && atEdge(host, false)) {
    if (typing.backspace(host)) event.preventDefault();
  } else if (event.key === "Delete" && !mod && !event.altKey && atEdge(host, true)) {
    if (typing.forwardDelete(host)) event.preventDefault();
  } else if (mod && event.shiftKey && !event.altKey && (event.key === "ArrowUp" || event.key === "ArrowDown") && !renamed) {
    event.preventDefault();
    moveHostBlock(host, event.key === "ArrowUp" ? -1 : 1);
  } else if (event.key.startsWith("Arrow") && !mod && !event.altKey && !event.shiftKey && !renamed) {
    // ←/→ stop on both sides of inline code's edges (typing/code-edges.mjs); a tab's caret stays in its name.
    // ← or ↑ at the start of the text right after a block of no text: the caret after that block (after/).
    if ((textFilters(host) && codeArrow(host, event.key)) || after.up(host, event.key) || arrow(host, event.key)) event.preventDefault();
  }
}

// The browser's Tab or Shift+Tab from a text block while it moves the focus (tabFrom): the block, which
// way, and where the caret was in it; null once the focus has moved, or left the page.
let tabbing = null;
function tabFrom(host, back) {
  const selection = getSelection();
  tabbing = { host, back, range: selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null };
  setTimeout(() => { tabbing = null; });
}

// A formula block is no stop of the browser's Tab, having no text to type in, as the arrow keys pass
// over it (caret.mjs places): the focus Tab puts on one goes on to the text block beyond it that way,
// the caret at its start, or, with none there, back to where it was.
function passTab(event) {
  const tab = tabbing;
  tabbing = null;
  const formula = tab ? editable(event.target) : null;
  if (!texOnly(formula)) return;
  const beyond = textNear(formula, tab.back ? -1 : 1);
  if (beyond) return void caretAt(beyond, "start");
  if (!tab.host.isConnected || !tab.range) return;
  tab.host.focus({ preventScroll: true });
  select(tab.range);
}

function onBeforeInput(event) {
  if (!editing) return;
  endArrowRun();
  const host = hostOf(event);
  const type = event.inputType;
  if (!host) {
    // An input method's Enter (its keydown's keyCode 229) in a text block left without its marks, as onKeydown's.
    if ((type === "insertParagraph" || type === "insertLineBreak") && !event.isComposing && unmarkedText(event.target)) {
      event.preventDefault();
      say(STRAY_SPLIT());
    }
    return;
  }
  // The text as the browser's edit begins, for the spaces it may strand (typing/spaces.mjs): a composition's is
  // taken as it starts (compositionstart), and an undo, a redo, formatting or a menu's query is no edit of the rule's.
  if (!event.isComposing) {
    if (!/^(history|format)/.test(type) && textFilters(host) && !typedFor(host)) typing.spaces.before(host);
    else typing.spaces.forget();
  }
  if (type === "historyUndo" || type === "historyRedo") {
    event.preventDefault();
    // Chrome has one undo stack for a page: past what a field of a component or a 批注's card can undo,
    // its Ctrl+Z lands on the last text block typed in, and with the focus there it is no undo of the page's.
    if (keptByComponent(document.activeElement) || annotate?.holds(document.activeElement)) return;
    type === "historyUndo" ? undo() : redo();
  } else if (type === "insertParagraph" && !event.isComposing) {
    event.preventDefault();
    typing.split(host);
  } else if (type === "insertLineBreak" && typedAsIs(host, "\n")) {
    event.preventDefault();
  } else if (type === "insertLineBreak" && can(host, "plain")) {
    event.preventDefault();
    say(limitText(host, "split"));
  } else if (/^delete[A-Za-z]+(Backward|Forward)$/.test(type) && !event.isComposing && textFilters(host)) {
    // Backspace or Delete beside a component's entry whose keydown onKeydown passed by (an input
    // method's, keyCode 229): the whole entry, as there (typing/code-edges.mjs takeEntry). A
    // deletion backward the browser does: the caret kept outside inline code it comes to (deletedBack).
    const back = type.endsWith("Backward");
    const before = type === "deleteContentBackward" || type === "deleteContentForward" ? ownHTML(host) : null;
    const removed = before !== null ? takeEntry(host, back) : undefined;
    if (removed) {
      event.preventDefault();
      recordStep(host, before);
      say(removed);
    } else if (back) deletingBack(host);
  } else if (type.startsWith("format")) {
    event.preventDefault(); // formatting goes through format-bar/: the kit's markup only
  } else if (type === "insertFromDrop" || type === "deleteByDrag") {
    event.preventDefault(); // no drag-moves between blocks
  }
}

// Whether what is typed in `host` is a menu's to look for.
const typedFor = (host) => slash.host === host || atMenu.host === host;

// The text as an edit the browser makes for the editor begins (a cut's deletion, a paste), for the spaces
// it may strand (typing/spaces.mjs; the browser's own edits: onBeforeInput).
function spacesBefore(event, kind) {
  const host = editing ? hostOf(event) : null;
  if (host && textFilters(host) && !typedFor(host)) typing.spaces.before(host, kind);
  else typing.spaces.forget();
}

// A "、", "／" or "＠" typed beside a space between Chinese and a Latin word waits for the menu it may have
// opened: once none is open there, what is left of it is looked at (typing/spaces.mjs settle), a change
// recorded with the typing it came with.
function settleMenu() {
  const host = typing.spaces.parkedHost();
  if (editing && host && !typedFor(host) && typing.spaces.settle(host)) recordText(host);
}

function onInput(event) {
  compositionOver(event);
  const host = editing && hostOf(event);
  if (!host) return;
  if (event.isComposing) {
    if (slash.host === host) slash.update(); // the "/" menu filters on the pinyin being typed too (its letters)
    if (atMenu.host === host) atMenu.update(); // and so does the "@" menu
    return;
  }
  settlePads();
  // What is typed after a "/" or an "@" while its menu is open is the menu's (what it looks for), no
  // words: no space goes beside it, to stay in the text once the menu has put something there.
  if ((event.inputType === "insertText" || event.inputType === "insertCompositionText") && !typedFor(host)) {
    formatting.typed(host, event.data); // the formats the caret kept (Ctrl+B with nothing selected)
    typing.autoSpace(host, event.data);
  }
  // A space between Chinese and a Latin word that what was typed or deleted left with no such pair beside
  // it goes, in the same step (typing/spaces.mjs); what a menu's query is has none (typedFor).
  if (/^(insert|delete)/.test(event.inputType) && textFilters(host) && !typedFor(host)) typing.spaces.after(host, "input", event.data ?? "");
  else typing.spaces.forget();
  // What stood between two pieces of inline code deleted: they are one (marks.mjs joinCode).
  if (event.inputType.startsWith("delete") && textFilters(host)) joinCode(host);
  if (event.inputType.startsWith("delete") && event.inputType.endsWith("Backward") && textFilters(host)) deletedBack(host);
  pageOf(host)?.typed?.(host);
  recordText(host);
  markdown.typed(host, event.data);
  settleMenu(); // a "、" that opened no menu
  typing.updatePlaceholder(host);
  if (event.inputType === "insertText" || event.inputType === "insertCompositionText") showCaret(); // what an input method put in without composing ("、")
}

function onCompositionEnd(event) {
  composing = false;
  settlePads();
  const host = editing && hostOf(event);
  if (host) {
    if (!typedFor(host)) {
      formatting.typed(host, event.data);
      typing.autoSpace(host, event.data); // a menu's query: no space beside it (onInput)
      if (textFilters(host)) typing.spaces.after(host, "composition", event.data ?? ""); // what the composition stranded, now that it is over
    } else typing.spaces.forget();
    pageOf(host)?.typed?.(host);
    // Typed text as a key's is: committed after the reader's pause, not at once. Each phrase put in
    // was once a commit of its own (a file written and a version announced per phrase, about 100ms
    // of the server's and 200–400ms of the page's each); the commit still waits out a composition
    // under way (autosave.mjs blocked()), and the crash buffer still takes the first change at once.
    recordText(host);
    markdown.typed(host, event.data);
    settleMenu();
    typing.updatePlaceholder(host);
    showCaret(); // the browser followed the composition, not the text put in for it (caret.mjs)
  }
  formatting.schedule();
}

function onPointerDown(event) {
  compositionOver(event);
  // A press on the editor's own controls (the handle, its menu, the format bar) keeps the caret
  // where it is, so it moves no focus: in a workbench, where the focus may still be outside the
  // report's frame, the page takes it here, or the keys after it (Ctrl+Z) would go to the workbench.
  if (editing && !document.hasFocus()) window.focus();
  hideHint();
  endArrowRun();
  if (event.button === 0) pressing = true;
  pressedText = event.button === 0 && editing ? editable(event.target) : null;
  // What the press came down on may take it, by its component's `press`: code opens for editing, a
  // display formula goes into the formula editor, and no caret goes in.
  if (editing && event.button === 0 && pageAt(event.target)?.press?.(event)) return;
  if (!editing || annotate?.holds(event.target) || formatting.holds(event.target) || linkHolds(event.target) || formulaBoxNode()?.contains(event.target) || panelOpen()?.holds(event.target) || slash.contains(event.target) || atMenu.contains(event.target)) return;
  if (event.target.closest?.('[data-ge-flag="conflict"]')) conflicts?.show(event.target);
  closeTyped();
  formatting.pressed(event.button === 0, keptByComponent(event.target));
  if (messageKind() === "note" && editable(event.target)) settle(); // an old note never outlives a click into the text
  if (linkBoxNode()) dismissLink(); // a press elsewhere keeps what the link card says
  keepPanels();
  const reason = readOnlyReason(event.target);
  if (reason) say(reason, "hint"); // what its hover hint says (hints/)
}

// ---------- the block under the caret ----------

function onSelectionChange() {
  if (!editing) return;
  formatting.schedule();
  if (!composing) formatting.moved();
  const selection = getSelection();
  // The caret, or an end of a text selection, in what a folded heading hides (undo put it back there):
  // the fold opens (fold/).
  for (const end of [selection.anchorNode, selection.focusNode]) if (end && hiddenByFold(end)) blocks?.folds.showAround(end);
  const host = selection.rangeCount ? editable(selection.anchorNode) : null;
  // A text block no step named, one a block made on the page came with: what the caret finds there is
  // what the first change of it undoes to, as a change is only seen once made.
  if (host && !lastKnown.has(host)) lastKnown.set(host, ownHTML(host));
  if (slash.host && host !== slash.host) slash.close();
  else if (slash.host) slash.update(); // the caret before the "/": it closes
  if (atMenu.host && host !== atMenu.host) atMenu.close();
  else atMenu.moved();
  // A caret after the lists a list item holds (a click below them) goes to the end of its text.
  if (host && selection.isCollapsed && selection.anchorNode === host && selection.anchorOffset > textEnd(host)) {
    caretAt(host, "end");
    return;
  }
  settlePads(true);
  if (host && !pressing && outOfAtom()) return; // never a caret inside a formula (a click settles on pointerup)
  if (host && !pressing && textFilters(host)) settleCodeEdge(host); // a click settles on pointerup
  typing.updatePlaceholder(host);
}

// ---------- moving the block under the caret, Enter on a selected block ----------

// Ctrl+Shift+↑/↓ in text moves the block around it; the caret stays where it was.
function moveHostBlock(host, delta) {
  const unit = unitElement(host);
  if (!unit) return;
  const selection = getSelection();
  const offsets = selection.rangeCount ? rangeOffsets(host, selection.getRangeAt(0)) : null;
  if (!blocks.moveBy(unit, delta, { keepFocus: true })) return;
  host.focus({ preventScroll: true });
  if (offsets) select(rangeAt(host, offsets));
}

// Enter on a selected block (the first of those selected, when it is text: blocks.mjs): what the
// page object it is the block of does with it (its `activate`: a formula block, which has no text,
// its editor open), each testing the element itself, else the caret at the end of its first
// editable text.
function editBlock(unit) {
  if (pageObjects().some((page) => page.activate?.(unit))) return;
  const host = isHost(unit) ? unit : firstHost(unit);
  if (host) caretAt(host, "end");
  else say(t("这一块里没有可以直接修改的文字。"));
}

// ---------- the parts, and a workbench around the page ----------

// How many of what is held the file cannot hold (conflicts.mjs unfit), no conflicts with a newer version.
const unfitCount = () => [...(commits?.issues.values() ?? [])].filter(unfit).length;

// Ctrl+S: whatever waits goes now.
async function saveNow() {
  checkAll();
  await annotate?.flush();
  const outcome = await autosave?.flush();
  const { held, drafts } = view();
  const unfitHeld = unfitCount();
  const told = mergeTold() && held === 0 && drafts === 0;
  if ((outcome === "saved" || outcome === "nothing") && !told) say(unfitHeld === 0 && held > 0 ? t("其余修改已保存；红框处的冲突还没有保存。") : held > unfitHeld ? t("其余修改已保存；红框处的内容还没有保存。") : held > 0 ? t("其余修改已保存；红框处的内容文档存不下，没有保存。") : drafts > 0 ? t("其余修改已保存；还没写完的块（红框或空标题）没有保存。") : t("已保存"));
  else if (outcome === "offline") say(t("{0}：修改暂存在浏览器里，连上后自动保存。", OFFLINE), "error");
  return outcome;
}

// The last keystrokes, counted now (not after the pause): what is typed for a menu is text now.
function checkNow() {
  if (!autosave) return;
  closeTyped();
  checkPending = true;
  checkChanges();
}

// All the page holds, as it is saved or left: the last keystrokes, and what is in a formula's box or a component's editor.
function checkAll() {
  keepPanels();
  checkNow();
}

// The report built from the saved source, once whatever waits is saved.
async function exportNow() {
  await saveNow();
  return exportReport(MAP);
}

function post(route, body) {
  return postAnswer(route, MAP.token, body);
}

// A write of the file the reader asked for elsewhere (历史版本's 恢复 and its 撤销: POST /__gallery/edit/history,
// `body` its action), as 撤回 of the Agent's changes goes (changes/): what waits is saved first, and nothing may
// wait for the reader (a text not saved, a conflict, offline: `pending`, nothing done); then the server writes it
// and the page is shown again as after a write of its own (autosave showOwn: no question of what that write put
// back of the reader's, who asked for it). Answers the server's answer (`undo` for a restore) as soon as it
// comes, before the page goes (the workbench takes a page's reload for its end, and a reply after it for none).
async function writeOwn(body) {
  if (!editing || !autosave) return { ok: false, reason: "editing" };
  checkAll();
  await annotate?.flush();
  await autosave.flush();
  const state = autosave.state;
  if (state.waiting > 0 || state.syncing || state.held > 0 || state.offline) return { ok: false, reason: "pending" };
  return new Promise((resolve) => {
    let answered = false;
    autosave.showOwn(async () => {
      const answer = await post("/__gallery/edit/history", { slug: MAP.slug, ...body });
      answered = true;
      const { id: _, ...said } = answer; // the reply's own id is the command's
      resolve(said);
      await new Promise((sent) => setTimeout(sent, 0)); // the reply posted first
      return answer.ok && !answer.same ? answer.version || true : false;
    }).then(() => { if (!answered) resolve({ ok: false, reason: "pending" }); }, () => { if (!answered) resolve({ ok: false, reason: "pending" }); });
  });
}

let workbench = null; // the session with a workbench embedding the page (session.mjs), if any
let released = false; // the workbench closes the page: what does not get saved in time stays in the crash buffer

// A new page under this one (a page block's box: links/), the page staying as it is: the sidebar
// hears of it; as the workbench's 新建 makes one, its title typed. Throws what stopped it.
async function newSubpage(title) {
  const answer = await post("/__gallery/workspace/create", { title, description: t("新文档"), parent: MAP.slug, language });
  if (!answer.ok) throw new Error(failure(answer, t("没能新建页面")));
  workbench?.workspace();
  return answer.report;
}

// The report's title as the reader sees it now (while editing, the title block's text).
const titleNode = () => document.querySelector('[data-ge-kind="title"]') ?? document.querySelector("h1.doc-title, .doc-header h1");
const currentTitle = () => titleNode()?.textContent.replace(/\s+/g, " ").trim() ?? "";

// This page, as the list of pages takes it (links/pages.mjs).
const thisPage = () => ({ slug: MAP.slug, title: currentTitle() });

// What the page tells the workbench of its state (session.mjs).
const sessionState = () => {
  const state = view();
  return { editing, pending: state.waiting > 0 || state.syncing, saving: state.syncing, offline: state.offline, conflicts: state.held, unfit: unfitCount(), changed: state.foreign };
};

// What the workbench can ask of the page (session.mjs).
const COMMANDS = {
  // As Ctrl+S.
  async save() {
    const outcome = await saveNow();
    return { ok: outcome === "saved" || outcome === "nothing", outcome };
  },
  // The page may always be closed: it saves what waits first (for a moment), and what does not get
  // saved in time stays in the crash buffer, for the next page of this report to send.
  // The workbench swaps this page in for the one it showed (the same document shown again), where the
  // reader has scrolled that one to meanwhile (`place`: reading-place.mjs placeIn of it): the page put
  // there, and kept there when charts drawn later lay it out again (restoreView).
  async place({ place = null }) {
    if (!place || typeof place !== "object" || !Number.isFinite(place.y)) return { ok: false, reason: "place" };
    restoring = { x: Number(place.x) || 0, y: place.y, top: place.top && typeof place.top === "object" ? place.top : null };
    putBack();
    return { ok: true };
  },
  async "prepare-close"() {
    flushHeld();
    checkAll();
    annotate?.flush();
    await Promise.race([autosave?.flush(), new Promise((resolve) => setTimeout(resolve, 1000))]);
    autosave?.store();
    released = true;
    return { ok: true, canClose: true };
  },
  // The report built from its saved source (once whatever waits is saved), or with `copy` the view
  // copy with the reading state (the kit's "导出当前视图副本").
  async export({ copy = false }) {
    if (copy) {
      const control = document.querySelector("[data-doc-export-copy]");
      if (!control) return { ok: false, reason: "unavailable" };
      if (control.disabled) return { ok: false, reason: "busy" };
      const done = new Promise((resolve) => addEventListener("doc-export-copy-done", (event) => resolve(event.detail), { once: true }));
      control.click();
      return done;
    }
    return exportNow();
  },
  // 历史版本's 恢复 of a version and the 撤销 of one (the workbench's: features/history/), the reader's own writes.
  async "restore-version"({ version }) {
    return writeOwn({ action: "restore", version });
  },
  async "undo-version"({ undo }) {
    return writeOwn({ action: "undo", undo });
  },
  // 搜索文档 opened the report at a hit: its words scrolled into view and marked for a moment (find/).
  async reveal(message) {
    return revealText(message, (node) => {
      blocks?.folds.showAround(node); // a folded heading's section opened (fold/)
      return modalOps().show(node);
    });
  },
  // A link or an address opened the report at a block.
  async "reveal-block"({ block }) {
    return revealBlock(block);
  },
  // The way back or forth to a place a link to a block of the page left (jump).
  async "show-place"({ place }) {
    return showPlace(place);
  },
  // A page of the workbench's sidebar dragged over the page and let go there: a page block where the pointer is (page-drop/).
  async "drop-page"(message) {
    return pageDrop ? pageDrop.command(message) : { ok: false, reason: "editing" };
  },
  // 批注 (annotate/): what there is read and drawn ({ refresh }), and the workbench's list, 复制批注, 全部删除 and 撤销.
  async annotate(message) {
    if (!editing || !annotate) return { ok: false, reason: "editing" };
    return annotate.command(message);
  },
  async annotations(message) {
    if (!editing || !annotate) return { ok: false, reason: "editing" };
    return annotate.action(message);
  },
  // The outline (目录) switched by the workbench's 更多: a draft of another workspace is shown from that workspace's own origin,
  // whose storage the workbench cannot write (the switch is kept per origin: shared/preferences.mjs outlineOpen), so it asks and
  // this page keeps it, shown as another tab's change is (the storage event the outline listens for). Answers the switch as kept.
  async outline({ open }) {
    if (typeof open !== "boolean") return { ok: false, reason: "open" };
    setOutlineOpen(MAP.slug, open);
    dispatchEvent(new StorageEvent("storage", { key: OUTLINE_OPEN_KEY }));
    return { ok: true, outline: outlineOpen(MAP.slug) };
  },
  // Rename the report: its title, selected for typing (saving it updates <title> and report.json).
  async "edit-title"() {
    const title = document.querySelector('[data-ge-kind="title"]');
    if (!editing || !title || !isHost(title)) return { ok: false, reason: "no-title" };
    title.focus({ preventScroll: true });
    const range = document.createRange();
    range.selectNodeContents(title);
    select(range);
    title.scrollIntoView({ block: "nearest" });
    return { ok: true };
  },
  // Rename the report from outside the page (the workbench's sidebar): the title block takes the new
  // text as a step of its own, undone like one and saved at once (with <title> and report.json).
  async "set-title"({ title: text }) {
    const title = document.querySelector('[data-ge-kind="title"]');
    if (!editing || !title || !isHost(title)) return { ok: false, reason: "no-title" };
    const name = typeof text === "string" ? text.replace(/\s+/g, " ").trim() : "";
    if (!name) return { ok: false, reason: "title" };
    if (title.textContent === name) return { ok: true };
    const before = ownHTML(title);
    title.textContent = name;
    recordStep(title, before);
    typing.updatePlaceholder(title);
    return { ok: true };
  },
  // The page's icon set from outside the page (the workbench's sidebar, its row's icon): `icon` an icon value
  // (an emoji, an icon of the 图标 tab, a picture of the document's assets/) or null for none, as a pick of the
  // header's own picker: a step of its own, undone like one, said on the status line and saved at once (the
  // header's div.doc-icon and doc.json's icon).
  async "set-icon"({ icon = null }) {
    if (!editing) return { ok: false, reason: "editing" };
    if (icon !== null && (typeof icon !== "string" || !iconKind(icon))) return { ok: false, reason: "value" };
    return (await setPageIcon(icon)) ? { ok: true } : { ok: false, reason: "no-title" };
  },
};

// ---------- links to blocks and documents ----------

// The block of this id, once the page is drawn (what its charts move is moved by then), or an element
// of this id (an address may name a heading's): what hides it opened (a folded heading's section,
// folded.mjs reveal, then the kit's DocKit.reveal: a detail card that does not hold it closed, a
// disclosure, a tab, the card it is in), in the middle of the window and selected,
// and the keys are the page's. What was just shown lays itself out in the frames after (a
// tab's tables) and a card closed gives the focus back then, so it is brought there again before it is
// selected. A block that is gone is said, unless
// `quiet`, the page staying as it is; #top with no such element is the top of the page, as for a browser.
// A later step (a link, the way back or forth, an address) started past its waits leaves it there.
async function revealBlock(id, { quiet = false } = {}) {
  const step = ++stepping;
  await reached("data-doc-drawn");
  if (step !== stepping) return { ok: false, reason: "moved" };
  const block = document.querySelector(`[data-block-id="${CSS.escape(id)}"]`) ?? document.getElementById(id);
  if (!block) {
    if (id === "top") scrollTo(0, 0);
    else if (!quiet) say(t("这个块已经不在了。"));
    return { ok: false, reason: "missing" };
  }
  reveal(block); // a fold over it too (fold/)
  block.scrollIntoView({ block: "center" });
  await painted();
  await painted();
  if (step !== stepping) return { ok: false, reason: "moved" };
  block.scrollIntoView({ block: "center" });
  if (block.hasAttribute("data-block-id")) blocks.select(block, { quiet: true });
  window.focus();
  return { ok: true };
}

let stepping = 0; // the newest step to a block or a place (revealBlock, showPlace): one a later step started past does nothing more

// A link to a block of this page (links/, goTo), a step of the history as a browser's jump to an
// anchor is, so that the way back comes to where the reader was: in a workbench the workbench's
// (`jump`, its address staying the page's), a page alone in a tab its own, the address as it is
// (`docPlace` kept in the entry left, `docBlock` the one made, as the kit's for a reader); a page
// opened in a frame on its own (?solo) makes none, nor a link to a block that is not there, nor one to
// the block the page has just gone to (its entry the one made), as the browser makes none for the
// address it is at.
function jumpTo(id) {
  const there = Boolean(document.querySelector(`[data-block-id="${CSS.escape(id)}"]`) ?? document.getElementById(id) ?? (id === "top" || null));
  if (there && !SOLO) {
    const place = { ...viewNow(), ...placeIn(window) };
    if (workbench) workbench.jump({ block: id, place });
    else if (window.parent === window && window.history.state?.docBlock !== id) { // the browser's history: `history` is the page's undo
      const state = window.history.state;
      try {
        window.history.replaceState({ ...(state && typeof state === "object" ? state : {}), docPlace: place }, "");
        window.history.pushState({ docBlock: id }, "");
      } catch { /* no history to write */ }
    }
  }
  return revealBlock(id);
}

// Back where a jump to a block left the reader (the way back, `show-place` in a workbench): the
// detail cards that were open open again and those the jump opened close, the block that stood at the
// top of the window stands there again (what the jump opened above it moving the rest) and the caret
// is back in the block it was in, else no block is selected (the jump selected its target).
async function showPlace(place) {
  if (!place || typeof place !== "object") return { ok: false, reason: "place" };
  const step = ++stepping;
  await reached("data-doc-drawn");
  if (step !== stepping) return { ok: false, reason: "moved" };
  const cards = modalOps();
  const kept = Array.isArray(place.modals) ? place.modals : Array.isArray(place.cards) ? place.cards.filter((card) => typeof card?.id === "string") : []; // the kit's entry (runtime/reveal.js), a jump taken before the page edited
  const keep = new Set(kept.map((card) => card.id));
  while (cards.open().some((card) => !keep.has(card.id)) && cards.closeTop()) { /* the cards opened since */ }
  const open = new Set(cards.open().map((card) => card.id));
  cards.reopen(kept.filter((card) => !open.has(card.id)));
  blocks.clear();
  const unit = typeof place.unit === "string" ? document.querySelector(`[data-block-id="${CSS.escape(place.unit)}"]`) : null;
  const host = caretHost(unit, place);
  if (host && isHost(host) && Number.isInteger(place.offset)) {
    host.focus({ preventScroll: true });
    caretAtOffset(host, place.offset);
  }
  goBackTo(window, place);
  const put = [scrollX, scrollY];
  await painted();
  if (step !== stepping) return { ok: false, reason: "moved" };
  if (unmoved(window, place, put)) goBackTo(window, place); // what was laid out since, or a browser putting the entry's scroll position back (a page alone), moved it; the reader scrolling meanwhile did not
  window.focus();
  return { ok: true };
}

// What an address's hash asks of a page alone in a tab, on load and as it changes (in a workbench the
// workbench asks: reveal-block). One that changes while the page is open may be no block's, a report's
// script keeping its state there, and what it finds nothing for is `quiet`.
function followHash(options) {
  if (location.hash.length > 1) revealBlock(decoded(location.hash.slice(1)), options);
}

// The id `element` has in the file, or is given now, by a commit that goes at once (commit.mjs idFor),
// so that asking for it is what writes it; null for what cannot be named yet.
function blockId(element) {
  const named = element.getAttribute("data-block-id");
  const id = commits?.idFor(element) ?? null;
  if (!named) markChanged(true);
  return id;
}

// 复制块链接 (the block menu): the block's address, which opens it in a workbench from anywhere, by
// the link the address bar shows for this page, the title it shows counted; in the click on the row,
// the clipboard's own rule, so by the list held ready (links/pages.mjs).
function copyBlockLink(unit) {
  const id = blockId(unit);
  if (id) copyAddress(fullAddress(location.origin, { slug: MAP.slug, block: id }, heldList().named), say);
  else say(t("这一块还没有保存，保存后才能复制它的链接。"));
}

// Where a link leads when that is a document of the workspace (links/, shared/page-address.mjs): a
// block of this one is gone to where it stands; another opens in the workbench around the page, which
// has this page save what waits, as for a click in its sidebar, and reads a workbench's address
// (`hash`) on its own list. A page alone in a tab goes there itself, once what waits is saved
// (prepare-close), so that nothing holds it back on beforeunload, and to a workbench's address only
// when the list holds it, as a page in a workbench stays where a link leads nowhere; a page opened on
// its own in a frame (?solo: the 写作偏好 dialog's) opens it in a new tab, the dialog staying.
async function goTo({ slug = null, block = null, hash = null }, href) {
  if (slug === MAP.slug) {
    if (block) jumpTo(block);
  } else if (SOLO) window.open(href, "_blank", "noopener");
  else if (window.parent !== window) workbench?.open(hash === null ? { target: slug, block } : { hash });
  else if (hash === null || (await leadsToPage(hash))) COMMANDS["prepare-close"]().then(() => location.assign(hash === null ? workspaceAddress( `/generated/${slug}.html${block ? `#${encodeURIComponent(block)}` : ""}` ) : href));
}

function connectParts() {
  holdPages(thisPage);
  addEventListener("focus", () => holdPages(thisPage));
  connectLinks({
    say, recordStep, hideFormatBar: () => formatting.hide(), active: () => editing && !composing,
    served: (file) => mediaUrl("file", MAP.slug, file), // a link to a file of the folder: where the preview hands it out
    closing: () => menuOpen() || popupOpen() || Boolean(formulaBoxNode() || panelOpen()),
    slug: MAP.slug, own: thisPage, reveal: jumpTo, go: goTo,
    subpage: SOLO ? null : newSubpage, // 写作偏好 stands outside the tree of pages
  });
  connectViews({
    say, recordStep, struct, assetUrl, slug: MAP.slug, unfurl: readPage,
    blocksAt: (host, range, made, kinds) => clipboard.blocksAt(host, range, made, kinds),
  });
  connectFormula({ say, recordStep, active: () => editing && !composing });
  connectChipFills(() => editing);
  connectHints({ editing: () => editing });
}

// Opening: first what this tab left unsaved when it reloaded or crashed (the crash buffer), then
// editing, where the reader was when the page reloaded by itself; what pages that are gone left
// comes after, once the open tabs have answered.
// The kit holds the page's first paint until the report is set up (the kit's styles/base.css; ui.js sets
// data-doc-ready on a frame after DOMContentLoaded, which may come after the editor starts).
// Until then nothing on the page can take the focus, so a workbench hears the page is ready only
// once it shows (else "edit-title" would select the title of a hidden page and keys would go
// nowhere). The kit shows it after 1.2s whatever happens; so does this.
// The kit also says when its drawing is done (data-doc-drawn: charts drawn, nothing left to move).
function reached(attribute) {
  const root = document.documentElement;
  if (root.hasAttribute(attribute)) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      observer.disconnect();
      clearTimeout(timer);
      resolve();
    };
    const observer = new MutationObserver(() => { if (root.hasAttribute(attribute)) done(); });
    observer.observe(root, { attributes: true, attributeFilter: [attribute] });
    const timer = setTimeout(done, 1300);
  });
}

// A frame drawn (the outline shown before enter(): start), or 200ms gone by: a page put out of sight
// meanwhile draws no frame, and its editor does not wait for one.
function painted() {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 200);
    requestAnimationFrame(() => setTimeout(() => {
      clearTimeout(timer);
      resolve();
    }, 0));
  });
}

// In a workbench, showing the report again is the workbench's: this page stops (it commits and
// stores nothing more) and asks; the workbench swaps in a page it loaded out of sight meanwhile, so
// the reader never sees a reload (session.mjs reload). The preview's live reload asks the same way
// when the page does not edit (src/server/routes.mjs).
function handOff() {
  window.__galleryEditReload = () => reloadView(MAP.slug);
  keepWith(() => ({ modals: modalOps().kept() }));
  if (!workbench) return;
  setReloader(() => {
    autosave?.close();
    workbench.reload();
  });
}

// The workbench around the page, if any: it hears the page's state and notices, and asks it to save,
// close and show the report again.
function connect() {
  // The look the page shows (字体与布局: its <html>'s, src/shared/document-look.mjs), which the workbench's
  // 更多 marks as chosen; told again when it changes (the kit's ui.js, doc-look-change).
  // `title`: null for a page with no title at all (the workbench names it by its doc.json); "" an untitled one (未命名文档).
  workbench = connectWorkbench({ slug: MAP.slug, snapshot: () => ({ title: titleNode() ? currentTitle() : null, icon: pageIcon(), look: lookOfElement(document.documentElement), state: sessionState(), annotations: annotate?.count(), outline: outlineOpen(MAP.slug) }), commands: COMMANDS, modals: modalOps() });
  addEventListener("doc-look-change", () => workbench?.update());
  onOutlineOpen(() => workbench?.update()); // the switch changed in another tab of this origin: the workbench's 目录 follows it (a draft's)
  // A block's context.workspace.open (the kit's runtime/workspace.js): a document, or a block of one, goes
  // where a link to it goes (goTo: in the workbench, its address; on its own, the page once saved); a custom
  // page, the workbench's #@<slug>, or /pages/<slug> once saved.
  addEventListener("doc-open-request", (event) => {
    const { slug = null, block = null, page = null } = event.detail ?? {};
    event.preventDefault();
    if (page) {
      if (window.parent !== window && !SOLO) workbench?.open({ hash: `@${page}` });
      else COMMANDS["prepare-close"]().then(() => location.assign(workspaceAddress(`/pages/${page}`)));
    } else goTo({ slug, block }, `/generated/${slug}.html${block ? `#${encodeURIComponent(block)}` : ""}`);
  });
  relayTo(workbench ? workbench.notice : null, workbench ? workbench.noticeRoom : null); // the workbench shows the page's notices, above the page's bottom panels
  handOff();
  // A page on its own in a frame (?solo: the 写作偏好 dialog's, which no session asks to save) is saved
  // by the frame's owner through this, quietly (the dialog's 保存, which writes its file once the page
  // has saved): what waits goes now; the outcome as Ctrl+S's.
  window.__galleryEditFlush = async () => {
    checkAll();
    return (await autosave?.flush()) ?? "nothing";
  };
}

async function start() {
  hideBlocks(MAP.hidden);
  const view = takeView(MAP.slug);
  given = view;
  // Where the reader is, for the workbench as it leaves the page (its state/recall.ts, which hands it back when the
  // reader comes back): the view the page was given while it is not there yet, else viewNow (the caret's block too).
  if (!SOLO) window.__galleryViewNow = () => (given && !readerMoved ? given : viewNow());
  const own = await recover({ map: MAP, storage: local, keys: [pendingKey(MAP.slug, TAB)] }); // what this tab left unsaved, put back first
  const notice = own.outdated ? outdatedNotice() : view?.notice; // what a component wrote by a manifest that changed, given up
  const note = (words) => say(words, "note", 6000);
  if (own.sent) return reloadView(MAP.slug, view, own.outdated ? notice : null); // show what was put back
  // The outline (目录) comes with the page, before its blocks are made editable: it reads the headings
  // by their units' kinds, which enter() marks (captureLayout), marked here first from the map (the same
  // marks); drawn at once while the page's layout is still clean (after enter() its first reading of
  // the window's width and the headings' places laid the whole page out: 24-128 ms), and shown in a
  // frame of its own before enter() holds the main thread (100 ms to 1.5 s on a long report). What
  // enter() changes in the headings its observer sees: it reads them again on the next frame. Where the
  // reader was (a page shown again, a page the workbench came back to) is scrolled to first, by the element that
  // was at the top of the window (the scroll position where it gave none), so that frame has the page and the
  // outline's current row there (restoreView puts it there again once the page edits). A page the workbench came
  // back to may be shown already (it put it there as it swapped it in): this moves nothing then.
  if (!SOLO) {
    if (view && !readerMoved) (view.top ? goBackTo(window, view) : scrollTo(view.x, view.y));
    markKinds(document, MAP);
    outline = createOutline({ slug: MAP.slug });
    if (outline.shown && !document.hidden) await painted();
  }
  enter();
  const restored = view ? restoreView(view) : null;
  if (notice) note(notice);
  checkLeft(local, MAP.slug, commits.texts()); // words a page it recovered showed that this one does not
  showLost(); // what could not be put back, at every opening until the reader is done with it
  if (own.offline) say(t("有上次没保存的修改，但现在连不上预览服务器；连上后刷新页面即可放回。"), "error");
  else if (own.left) say(t("有上次没保存的修改还没能放回（文件正在被修改，或预览服务器出错）；稍后刷新页面会再试。"), "error");
  await reached("data-doc-ready");
  await restored; // ready (a workbench may show it now) once where the reader was
  given = null;
  connect();
  if (!view) followHash(); // a page shown again stays where the reader was
  addEventListener("hashchange", () => followHash({ quiet: true }));
  // The way back or forth over a page alone's jumps (jumpTo), its address the same all along.
  addEventListener("popstate", (event) => {
    const state = event.state;
    if (workbench || SOLO || !state || typeof state !== "object") return;
    if (state.docPlace && typeof state.docPlace === "object") showPlace(state.docPlace);
    else if (typeof state.docBlock === "string") revealBlock(state.docBlock, { quiet: true });
  });
  annotate?.start();
  agentChanges?.start();
  const open = await openTabs();
  if (open.has(TAB)) { // a duplicated tab: its own id from now on
    TAB = newTab();
    session.set(keys.tab, TAB);
  }
  // What earlier pages of the document committed, made and wrote (this tab's, and those of tabs no longer
  // open), asked of at once where this page opened on another version of the file than they last knew
  // (its cards and list said through the workbench).
  autosave?.opened(open);
  const prefix = pendingKey(MAP.slug, "");
  const left = local.keys().filter((key) => key.startsWith(prefix) && key !== pendingKey(MAP.slug, TAB) && !open.has(key.slice(prefix.length)));
  if (left.length === 0) return;
  const others = await recover({ map: MAP, storage: local, keys: left });
  if (others.outdated) note(outdatedNotice());
  if (others.sent) autosave.heard(null, true); // shown once nothing waits here (checked then)
  else checkLeft(local, MAP.slug, commits.texts());
  if (readLost(local, MAP.slug).length > 0) showLost();
}

// Back where the reader was: the scroll position, the detail cards open and the caret in the block
// it was in. Done once the kit has drawn (its charts, which may have moved things) and the scroll
// position is put again. Where the page before this one did not hold the focus (`data-no-focus`, the
// workbench's: a dialog stands open over it, a field holds it) what holds it keeps it, and the keys;
// the caret comes back when the focus does, by anything but a press, which puts it where it lands.
// Where restoreView puts the page, and puts it again once charts are drawn: the view it was given, or
// the place the workbench gives the page as it swaps it in (the `place` command: the reader scrolled
// the page it replaces meanwhile).
// The reader moving the page themselves meanwhile (a wheel, a key, a touch, a press: reading-place.mjs
// onReaderMove, heard from the module's start, before the page shows) stops it: theirs wins.
let restoring = null;
const putBack = () => restoring && (restoring.top ? goBackTo(window, restoring) : scrollTo(restoring.x, restoring.y));
let readerMoved = false;
onReaderMove(window, () => {
  readerMoved = true;
  restoring = null;
});
// The view this page was given (takeView) until it stands there: what it leaves as it goes before then
// (pagehide), rather than where it stands while it is not back yet.
let given = null;

// The editable text a kept view's caret was in (autosave.mjs viewNow), in its block `unit`: the block itself,
// else the how-manieth of its editable texts it was (a table's cell: not the first), else its first (a view
// kept before it said which).
function caretHost(unit, { self, nth }) {
  if (!unit) return null;
  if (self) return unit;
  const hosts = [...unit.querySelectorAll("[contenteditable='true']")];
  const there = Number.isInteger(nth) ? hosts[nth] : null;
  return there && isHost(there) ? there : hosts.find(isHost) ?? null;
}

function restoreView({ x, y, top = null, unit, self, nth = null, offset, modals = [] }) {
  restoring = readerMoved ? null : { x, y, top }; // the way back from another document: by the place the workbench kept (reading-place.mjs)
  const put = putBack;
  put();
  // (The frame itself holding the workbench's focus is no such element: the workbench gave it the focus, coming back to the page.)
  const held = window.frameElement?.hasAttribute("data-no-focus") ? window.frameElement.ownerDocument.activeElement : null;
  const outside = held === window.frameElement ? null : held;
  modalOps().reopen(modals);
  outside?.focus();
  const block = unit ? document.querySelector(`[data-block-id="${CSS.escape(unit)}"]`) : null;
  const host = caretHost(block, { self, nth });
  if (host && isHost(host) && offset !== null) {
    const caretBack = () => {
      host.focus({ preventScroll: true });
      caretAtOffset(host, offset);
    };
    if (outside) addEventListener("focus", () => { if (!pressing && host.isConnected && document.activeElement === document.body) caretBack(); }, { once: true });
    else caretBack();
  }
  return reached("data-doc-drawn").then(put); // charts drawn since may have moved things
}

// What pages of this report could not put back into the file (recover: lostKey), the reader's
// words, listed at every opening until the reader says they are dealt with; closing the panel only
// hides it.
const LOST = {
  changed: t("文件里的这一段已被修改，你的版本如下："),
  missing: t("文件里的这一块已被删除，你的版本如下："),
  insert: t("新建的这一块放不进文件（周围的块已被改动或删除）："),
  draft: t("还没写完、没能保存的块："),
  reverted: t("被 Agent 的写入改回去的修改，你的版本如下："),
  rebase: t("上次没等到保存结果的新块里，后来写的内容："),
  refused: t("没能保存的修改："),
  unreadable: t("读不出来的暂存内容："),
};
function showLost() {
  const lost = readLost(local, MAP.slug);
  if (lost.length === 0) return;
  showPanel(t("{0} 处修改没能放回", lost.length));
  for (const item of lost) {
    // What a component wrote, where its block stands on the page: that block holding it, to copy and paste
    // back, as a conflict's card offers it; its parts' insides are no text to read.
    const instance = typeof item.unit === "string" && item.parts ? document.querySelector(`main [data-block-id="${CSS.escape(item.unit)}"]`) : null;
    const block = instance ? pageOfUnit(instance)?.withData?.(instance, item.parts) ?? null : null;
    if (block) {
      panelItem(
        element("p", { text: t("文件里的这一块已被修改：复制你的版本，再粘贴到页面上。") }),
        element("div", { class: "ge-actions" }, textButton(t("复制这一块"), () => { if (!clipboard.copyBlocks([block])) say(t("没能完成，请再试一次。"), "error"); })),
      );
      continue;
    }
    const text = item.text ?? String(item.html ?? "").split(/\n/).map((line) => plainText(line)).filter(Boolean).join("\n");
    panelItem(
      element("p", { text: LOST[item.why] ?? LOST.refused }),
      element("div", { class: "ge-version", text }),
      element("div", { class: "ge-actions" }, textButton(t("复制文字"), () => navigator.clipboard?.writeText(text).then(() => say(t("已复制"))))),
    );
  }
  panelItem(element("div", { class: "ge-actions" }, textButton(t("都处理好了，不再保留"), () => {
    local.remove(lostKey(MAP.slug));
    closePanel();
  }, { primary: true })));
  say(t("有 {0} 处修改没能放回文件，列在右下方：复制保存好再标记处理完。", lost.length), "error"); // said over the panel, which stands first
}

function boot() {
  connectParts();
  addStyle(STYLE);
  formatting = createFormatting({
    active: () => editing && !composing, say, recordStep, struct, convert: convertHost, cross: crossText,
    turnIntoAll: groupTargets, convertAll: (hosts, type) => convertAll(hosts, type, { select: false }), selectBlocks: (list) => blocks.select(list, { quiet: true }),
    annotates: () => Boolean(annotate?.canSelection()), annotate: () => annotate?.annotateSelection(), // the bar's 批注
  });
  slash = createSlashMenu({
    convert: convertHost, insertBelow, inline: inlineInsert, composing: () => composing,
    // The "+"'s menu closed: its block's hint is its own again (where it still shows one).
    closed: (host) => { if (host.hasAttribute("data-ge-placeholder")) typing.updatePlaceholder(host); },
    over: () => setTimeout(settleMenu), // after what a row chosen does with the "、" and its query
  });
  atMenu = createAtMenu({ composing: () => composing, page: thisPage, recordText, recordStep, over: () => setTimeout(settleMenu) });
  markdown = createMarkdown({ slash, at: atMenu, convert: convertHost, recordStep });
  pageDrop = createPageDrop({ editing: () => editing, page: thisPage, recordStep, closeTyped, typed: (host) => typing.updatePlaceholder(host) });
  blocks = createBlocks({
    slug: MAP.slug, units, boxes, active, struct, look: lookStep, say, edit: editBlock, turnInto, convert: convertUnit, turnIntoAll: groupTargets, convertAll, add: insert.addAfter, after: insert.paragraphAfter,
    below: insertBelow, belowTypes: belowTargets,
    blank: insert.clickBlank, nest: (units, delta) => pageObjects().some((page) => page.nestBlocks?.(units, delta)),
    keepsHandle: (node) => tables?.holds(node) ?? false,
    addNear,
    // 批注 on blocks: the button beside one (annotate/).
    notes: { can: (units) => annotate?.canBlocks(units) ?? false, at: (unit) => annotate?.markerSpot(unit) ?? null, write: (units) => annotate?.annotateBlocks(units) },
    copyLink: SOLO ? null : copyBlockLink, // what ?solo shows (写作偏好) only its dialog opens: no address leads there
    linkAhead: () => holdPages(thisPage),
    shiftHeadings: shiftAllHeadings, // a heading's level badge: 所有标题增大一级, 所有标题减小一级 (fold/)
  });
  resize = createResize({ units, active, look: lookStep, say, settle, owns: (node) => tables?.owns(node) ?? false });
  gaps = createColumnGaps({ active, struct, look: lookStep, say, settle });
  for (const page of pageObjects()) page.install?.(); // the round "+" at a flowchart node's right, renaming Sheet tabs
  tables = createTableEditing({
    active, struct, look: lookStep, selectBlock: (unit) => blocks.select(unit), resizeTable: (event, unit, axis) => resize.startTable(event, unit, axis), say, settle, cellsOf: (data) => clipboard.cellsOf(data), upload: uploadTo, typedKey,
    recordStep,
  });
  selectAll = createSelectAll({ blocks, say, cells: { table: () => tables.selectedTable, clear: () => tables.clear() } });
  createFrame(() => editing);
  createFlags(() => editing);
  // A page of its own in a frame (?solo) has no session, and so no 批注: nothing would show them.
  if (!SOLO) annotate = createAnnotate({
    slug: MAP.slug, token: MAP.token, isEditing: () => editing, say,
    picked: () => blocks?.picked ?? [], wholePage: () => topStep(document).units, crossTexts: () => crossText.texts(),
    unpick() {
      crossText.letGo();
      if (blocks?.picked.length > 0) blocks.clear();
      if (messageKind() === "note") settle();
    },
    // The blocks it is about are named with the next commit (commit.mjs idFor), at once.
    idFor(element) {
      const named = element.getAttribute("data-block-id");
      const id = commits?.idFor(element) ?? null;
      if (!named) markChanged(true); // a commit names it now
      return id;
    },
    changed: () => workbench?.update(),
    removed: (items) => workbench?.annotationsRemoved(items),
  });
  // Where the reader is (the caret's block, the words and blocks selected), told to the workbench for gallery status.
  if (!SOLO) watchFocus({ picked: () => blocks?.picked ?? [], crossTexts: () => crossText.texts(), tell: (where) => workbench?.focus(where) });
  // Read at once, drawn once the page is ready; commits and autosave are made as the page edits (enter).
  if (!SOLO) agentChanges = createAgentChanges({
    slug: MAP.slug, token: MAP.token, commits: () => commits, autosave: () => autosave, say, session,
    across: crossText, // a selection across blocks, kept on its words as the marks go and come
    flush: async () => {
      checkAll();
      return (await autosave?.flush()) ?? "nothing";
    },
  });
  document.addEventListener("pointerup", (event) => {
    pressing = false;
    formatting.released();
    // A click at an edge of inline code or an entry: the caret on the side it was made on, when the
    // press came down on that text; a press elsewhere that put the caret there (a card's backdrop,
    // which closed it and put the caret at its entry; the page's empty space) leaves it at the stop
    // it is at.
    const selection = getSelection();
    const host = editing && event.button === 0 && selection.rangeCount && selection.isCollapsed ? editable(selection.anchorNode) : null;
    const pressed = pressedText;
    pressedText = null;
    if (host && outOfAtom(event.clientX)) return; // a click beside a formula that put the caret in it
    if (!host || !textFilters(host)) return;
    if (pressed && (pressed === host || pressed.contains(host))) codeClick(host, event.clientX);
    else settleCodeEdge(host);
  }, true);
  document.addEventListener("focusin", passTab, true);
  document.addEventListener("compositionstart", (event) => {
    // On an empty formula block (an input method that sends no key before it): the block selected, as a
    // key there selects it (onKeydown), and the composition has no text to go into. On one drawn, whose
    // chip is all it holds, the browser begins none, and what it puts in is refused as anything typed
    // there is (components/math/page.mjs).
    const host = editing ? hostOf(event) : null;
    if (texOnly(host)) return void blocks.select(unitElement(host));
    // The text before anything is composed (what is selected still there), for the spaces the commit strands
    // (typing/spaces.mjs): nothing is taken out while it is composed.
    if (host && textFilters(host) && !typedFor(host)) typing.spaces.before(host, "composition");
    else typing.spaces.forget();
    composing = true;
    formatting.hide();
    atMenu.follow(); // its hint goes
  }, true);
  addEventListener("resize", () => {
    formatting.schedule();
    atMenu.follow();
  });
  // The workbench took the focus: no menu stays, holding commits back, where no press reaches it, and a
  // formula's box goes as for a press elsewhere. Another window taking it leaves the box, for what is copied there.
  addEventListener("blur", () => {
    closeTyped();
    if (window.frameElement?.ownerDocument.hasFocus()) keepPanels();
  });
  document.addEventListener("keydown", onKeydown, true);
  document.addEventListener("beforeinput", onBeforeInput, true);
  document.addEventListener("input", onInput, true);
  document.addEventListener("compositionend", onCompositionEnd, true);
  document.addEventListener("paste", (event) => {
    compositionOver(event);
    if (annotate?.holds(event.target) || keptByComponent(event.target)) return; // a 批注's card is a field of its own, and so is what a component keeps
    spacesBefore(event, "paste"); // what the paste replaces may strand a space (clipboard/ insertNodes, typing/spaces.mjs)
    if (!atMenu.paste(event)) clipboard.paste(event);
  }, true);
  const copied = (event) => {
    if (annotate?.holds(event.target) || keptByComponent(event.target)) return;
    if (event.type === "cut") spacesBefore(event, "input"); // the cut deletes as typing does (execCommand: no beforeinput)
    clipboard.copy(event);
  };
  document.addEventListener("copy", copied, true);
  document.addEventListener("cut", copied, true);
  document.addEventListener("selectionchange", onSelectionChange);
  document.addEventListener("mouseover", scheduleHint, true);
  document.documentElement.addEventListener("mouseleave", hideHint); // a pointer gone into a workbench moves nothing here
  document.addEventListener("mousemove", (event) => {
    trackPointer(event);
  }, { passive: true, capture: true });
  document.addEventListener("pointerdown", onPointerDown, true);
  // A press beside a line of text on its block's empty space puts the caret where that line is
  // nearest, where the browser would put it elsewhere (caret.mjs besideLine); one at an edge of
  // inline code, on the side of the edge it was made on at once (typing/code-edges.mjs codePress);
  // one in a block holding chips of the text, for a drag to go by whole chips (chipsPress). The press
  // is the editor's then, and so is a drag from it (followPress).
  document.addEventListener("mousedown", (event) => {
    const host = editing && event.button === 0 && !event.shiftKey && event.detail < 2 ? editable(event.target) : null;
    if (!host) return;
    const place = besideLine(host, event.clientX, event.clientY) ?? chipsPress(host, event.clientX, event.clientY);
    if (place) {
      event.preventDefault();
      host.focus({ preventScroll: true });
      selectAt(place, event.clientY);
      followPress(host, place);
      return;
    }
    const stop = textFilters(host) && codePress(host, event.clientX, event.clientY);
    if (!stop) return;
    event.preventDefault();
    followPress(host, stop);
  }, true);
  addEventListener("scroll", (event) => {
    hideHint();
    if (formatting.visible) formatting.schedule();
    if (slash.host && !slash.contains(event.target)) slash.update(); // it follows its block
    if (atMenu.host && !atMenu.contains(event.target)) atMenu.follow();
  }, { passive: true, capture: true });
  // Files and pictures dragged in from outside the page: blocks where the line shows (drop-in/); anything
  // else let go in a block's text goes nowhere, as before.
  createDropIn({ editing: () => editing, active, blocks: () => blocks, say });
  // A click goes first to the component of what it came down on: a code block's fold arrow or wrap
  // button (an edit), a disclosure's title being typed in, a tab being renamed.
  document.addEventListener("click", (event) => {
    if (editing && pageAt(event.target)?.click?.(event)) return;
    const link = editing ? linkOf(event.target) : null;
    if (link) followLink(event, link);
  }, true);
  // Keep the editor UI usable while a modal dialog is open.
  new MutationObserver(() => {
    const target = layer();
    for (const node of [noticeNode(), formatting.node, panelNode(), ...linkNodes(), formulaBoxNode(), panelOpen()?.panel, conflicts?.node(), ...slash.nodes, ...atMenu.nodes, ...blocks.nodes, ...resize.nodes, ...gaps.nodes, ...tables.nodes, ...pageObjects().flatMap((page) => page.nodes ?? [])]) if (node && node.parentNode !== target) target.append(node);
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open", SURFACE_MARK] }); // a dialog opened, a surface of the document's shown (ui.mjs layer)
  window.addEventListener("doc-source-changed", (event) => autosave?.heard(event.detail?.version ?? null));
  window.addEventListener("doc-assets-changed", () => say(t("页面的样式或编辑器已更新，刷新页面即可看到。"), "note", 6000));
  // A component package the page holds an instance of changed: what it runs of it is another page's.
  window.addEventListener("doc-components-changed", () => autosave?.reloadSoon());
  // What the reader's settings offer changed: the menus follow, and no page is shown again for it.
  window.addEventListener("doc-settings-changed", (event) => hideBlocks(event.detail.hidden));
  // Only while something waits: it is in the crash buffer too, so this is a courtesy.
  window.addEventListener("beforeunload", (event) => {
    const state = autosave?.state;
    if (((state && (state.waiting > 0 || state.syncing) && !state.reloading) || heldBack()) && !released) event.preventDefault();
  });
  // Closing the page: keep what waits and try a last commit. Hiding it: commit now.
  window.addEventListener("pagehide", () => {
    // Where the reader is, for the page the workbench shows again when it loads anew (shared/kept-view.mjs).
    if (!SOLO) leaveView(MAP.slug, given ?? viewNow());
    flushHeld();
    checkAll();
    autosave?.leave();
    annotate?.leave();
    agentChanges?.leave();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden || !autosave) return;
    checkNow();
    autosave.flush();
  });
  // Once the shared kit has rendered formulas.
  setTimeout(start, 0);
}

if (document.readyState === "complete") boot();
else window.addEventListener("load", boot, { once: true });
