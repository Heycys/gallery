import { Z } from "../../../shared/layers.mjs";
import { can, isMention, limitText, mentionOf, newEmptyLink, ownHTML } from "../core.mjs";
import { editable, followPress, pointRange, select } from "../caret.mjs";
import { joinMarks, rangeAt, rangeOffsets } from "../marks.mjs";
import { wholeAddress } from "../clipboard/own/export.mjs";
import { ICONS, createMenu } from "../menu.mjs";
import { own } from "../overlays.mjs";
import { placeBox } from "../placement.mjs";
import { tooltip } from "../tooltip.mjs";
import { addStyle, appear, copyAddress, element, fadeAway, mount, swallowNext } from "../ui.mjs";
import { typedHref } from "./address.mjs";
import { findPages, heldList, pageRows, placeIn, readPages, titleIn, trashed, webLinkIn } from "./pages.mjs";
import { DIALOG_TRIGGER } from "../../components/dialog/index.mjs";
import { DIALOG_ICON } from "../../components/icons.mjs";
import { VIEWS, closeOffer, closeViews, hasViews, hrefOf, isPageChip, offerViews, openViews, pageChip, refetch, viewNodes, viewOf, viewsHold } from "./views.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { referencedFile } from "../../../shared/media.mjs";
import { decoded, elsewhere, fileLink, fromFile, fullAddress, pageAddress, workbenchHash } from "../../../shared/page-address.mjs";
import { inTrash } from "../../../shared/page-links.mjs";

// Links in the text (docs/editor.md, "Browser side"): the link card that adds, changes or removes a
// link, and following a link while editing. The card: a field for the
// address (a blue ring while it has the focus), a button that copies it and one that takes the link
// away; for a link to a web page, after a line, the view it is shown in with ▾ (链接视图 ▾:
// its views, views.mjs). Ctrl+K or the format bar's link button opens it below the selected text,
// the field taking the focus while the text stays marked (the selection's own color, drawn over
// it); resting on a link in the text for 0.6s opens it below the link, the focus staying where it
// was, unless something else is open that a press would close. What is typed in the field looks for
// a page (pages.mjs), its results under the field, in the card; what is pasted looks for nothing, so
// that an address pasted stays one. ↑/↓ move in them, and a row clicked or Enter links to its page.
// Enter takes the row the keys moved to, else what reads as a whole address, else the first row, and
// with no row says so, the card staying; a press anywhere else keeps what the field says when that is
// an address, and gives up words that are none; an emptied field takes the link away; Esc gives up. A
// link to a document shows the document's title, the card keeping the link's own address beside
// it: left as it is, nothing changes, and 复制 copies the address that opens it from anywhere. Resting
// is a pointer's that moved onto the link: one that came under a still pointer opens nothing. A card
// opened by resting goes again 0.3s after the pointer leaves the link and the card (and its views),
// unless its field was clicked. A
// plain click on a link opens it, as for a reader: in a new tab, in front of the page (one to a file
// of the report's folder, which the text writes assets/… as the file does, where the preview hands
// the file out), a link to a detail card (href="#dialog id") by opening the card, one to a block of
// the page (#<block id>) by going to it or saying it is gone, one to a document of the workspace or
// a block of one, in any form an address takes (shared/page-address.mjs), by going there in this
// tab (`go`, the editor's), one with no address not at all; an address on another port is asked of
// the list, a document's if it holds it (shared/page-address.mjs addressOn), there on this server,
// another program's if not, in a new tab as any web address (followElsewhere); a middle click, or Ctrl
// or ⌘ held, opens it in a tab of its own, a middle click behind the page, which the browser leaves to
// links outside editable text. The press stays the browser's, so a drag
// in a link selects its text, and the click that ends it opens nothing, nor does a Shift click (a
// drag from which selects on as over any text), the second click of a double click, or the press
// that closes something open: this card being filled in, a formula's editor, a menu or a picker. Its
// words are edited by going in with the arrow keys; an input method over text that starts in a link
// keeps the link (compositionEnded). A link outside editable text opens in a new tab too, the page
// staying (followOutside). A link shown with its icon (图标视图) is a whole, as a formula is: a click
// opens it, and only resting brings its card; its field changed, the page is read again; taken away,
// its title stays as text. The "/" menu's 链接 puts a gray 链接 where it goes (as 公式 puts 新公式:
// core.mjs newEmptyLink, components/placeholder.mjs), tinted while the card asks for the address: Enter makes the link, its address its text, and
// offers its views at its end (显示为); a press elsewhere makes it too; nothing given, or Esc, leaves
// the gray 链接 there, a link left empty (written so, shown to no reader), a whole as a character is;
// a click on it asks for its address again. The "/" menu's 页面 does the same with a gray 页面, for a
// page block: the same element, a document's address (views.mjs pageChip), its title and icon what
// the server draws (render/page-chips.mjs); nothing but a click on it, which opens the document, and
// no card on resting, so that it is deleted to go elsewhere. The card asks in its way: the pages are
// listed at once, Enter takes the page an address names (another address says it is no page, the
// card staying), else the row highlighted, and with no row makes a page of the words under this one
// (a new subpage: 写作偏好, ?solo, has none); a press elsewhere keeps the page an address
// names and nothing else, leaving the gray 页面. A detail card's entry (a link to it, the kit's chip)
// has a card of its own instead: 打开 and 移除 (no address: an id is no reader's business; no name:
// the entry's words are it). Nothing is committed while the card is open (linkPending). connectLinks()
// gives them what they need from the editor.

const STYLE = `
  .ge-link {
    position: fixed; left: 0; top: 0; z-index: ${Z.card}; display: flex; flex-wrap: wrap; align-items: center; gap: 2px; width: 246px; max-width: calc(100vw - 16px); padding: 6px;
    border-radius: var(--ge-r-card); background: var(--ge-bg); color: var(--ge-tx);
    box-shadow: var(--ge-shadow-card);
    font: 14px/1.2 ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
  }
  .ge-link[data-views] { width: 346px; }
  .ge-link-field { display: flex; align-items: center; flex: 1; min-width: 0; height: 28px; margin-right: 4px; padding: 3px 6px; border-radius: var(--ge-r-ctl); background: var(--ge-field); box-shadow: 0 0 0 1px var(--ge-edge); cursor: text; }
  .ge-link-field:focus-within { box-shadow: inset 0 0 0 1px var(--ge-focus), 0 0 0 1px var(--ge-focus); }
  .ge-link-field:last-child { margin-right: 0; }
  .ge-link-field input { flex: 1; min-width: 0; padding: 0; border: 0; outline: none; background: transparent; color: inherit; font: inherit; line-height: 20px; }
  .ge-link-field input::placeholder { color: var(--ge-tx3); }
  .ge-link-tool { display: flex; align-items: center; justify-content: center; flex: none; width: 28px; height: 28px; padding: 0; border: 0; border-radius: var(--ge-r-ctl); background: transparent; color: var(--ge-ico); cursor: pointer; }
  .ge-link-tool:hover, .ge-link-view:hover, .ge-link-view[aria-expanded="true"] { background: var(--ge-hover); }
  .ge-link-tool:active, .ge-link-view:active { background: var(--ge-press); }
  .ge-link-tool svg { display: block; width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; }
  .ge-link-sep { flex: none; width: 1px; height: 20px; margin: 0 4px; background: var(--ge-line); }
  .ge-link-view { display: flex; align-items: center; gap: 2px; flex: none; height: 28px; padding: 0 4px 0 8px; border: 0; border-radius: var(--ge-r-ctl); background: transparent; color: inherit; font: inherit; white-space: nowrap; cursor: pointer; }
  .ge-link-view svg { display: block; width: 16px; height: 16px; fill: none; stroke: var(--ge-tx3); stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; }
  .ge-link-mark { position: fixed; left: 0; top: 0; z-index: ${Z.mark}; pointer-events: none; background: var(--ge-select); }
  /* A link in editable text is one to click on, where the browser shows a text cursor. */
  [data-ge-editing] a[href] { cursor: pointer; }
  .ge-link[data-entry] { width: auto; padding: 4px; }
  .ge-link-open { display: flex; align-items: center; gap: 6px; flex: none; height: 28px; padding: 0 9px 0 7px; border: 0; border-radius: var(--ge-r-ctl); background: transparent; color: inherit; font: inherit; cursor: pointer; }
  .ge-link-open svg { display: block; width: 20px; height: 20px; fill: none; stroke: var(--ge-ico); stroke-width: 1.25; stroke-linecap: round; stroke-linejoin: round; }
  .ge-link-open:hover { background: var(--ge-hover); }
  .ge-link-open:active { background: var(--ge-press); }
`;
const HOVER_DELAY = 600; // resting on a link this long opens its card
const LEAVE = 300; // a card opened by resting goes this long after the pointer leaves link and card
const DRAGGED = 4; // a pointer released this far from its press has dragged, not clicked
const CHEVRON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4.5 6.25 3.5 3.5 3.5-3.5"/></svg>';

let use = null; // { say, recordStep, hideFormatBar, active, served(file), closing(), slug, own(): this page, as pages.mjs readPages takes it, reveal(id), go(place, href), subpage(title): a new page under this one, the answer's report, null where it has none }

export function connectLinks(editor) {
  use = editor;
  addStyle(STYLE);
  // Resting on a link in the text opens its card, and only for a pointer that moved there, as on a
  // 批注's marker: a link that came under a still pointer (the next page, shown where a link was just
  // clicked; the page scrolled) hears an over and no move, and its card would stand over the lines
  // below, in the way of the next click. Leaving the link and the card closes it (not while its views
  // are open).
  document.addEventListener("mouseover", (event) => {
    const rested = use.active() && !event.buttons ? linkOf(event.target) : null;
    const link = rested && !isPageChip(rested) ? rested : null; // a page block has no card
    clearTimeout(hoverTimer);
    reached = null;
    if (linkBox && !linkBox.pinned && (linkBox.held || link === linkBox.link || linkBox.node.contains(event.target) || viewsHold(event.target))) return;
    if (linkBox && !linkBox.pinned) hoverTimer = setTimeout(() => closeLink(false), LEAVE);
    reached = link;
  }, true);
  document.addEventListener("mousemove", (event) => {
    const moved = !pointer || pointer.x !== event.clientX || pointer.y !== event.clientY;
    pointer = { x: event.clientX, y: event.clientY };
    if (!moved || !reached || !use.active()) return;
    const link = reached;
    reached = null;
    if (!linkBox?.pinned && linkBox?.link !== link) hoverTimer = setTimeout(() => { if (!use.closing()) openLinkAt(link); }, HOVER_DELAY);
  }, { passive: true, capture: true });
  // What a press came down on, for the click it ends in (opens), on the window to see what it closes
  // before that goes; a press on a link leaves no card on its way to open over a drag.
  addEventListener("pointerdown", (event) => {
    press = { x: event.clientX, y: event.clientY, selection: selectionNow(), keeps: (Boolean(linkBox?.pinned) && !linkHolds(event.target)) || use.closing() };
    if (linkOf(event.target)) {
      clearTimeout(hoverTimer);
      reached = null;
    }
  }, true);
  // Shift on a link in the block of the caret: the selection reaches it and follows the pointer, as
  // over any other text, where the browser moves the caret there.
  document.addEventListener("mousedown", (event) => {
    const host = use.active() && event.button === 0 && event.shiftKey && linkOf(event.target) ? editable(event.target) : null;
    const selection = getSelection();
    const at = host && editable(selection.anchorNode) === host ? pointRange(event.clientX, event.clientY) : null;
    if (!at) return;
    event.preventDefault();
    const from = document.createRange();
    from.setStart(selection.anchorNode, selection.anchorOffset);
    selection.extend(at.startContainer, at.startOffset);
    followPress(host, from);
  }, true);
  // A middle click, which a browser takes for a link only outside editable text: here for all of
  // them (a chip is such a link, and would open twice), its press starting no scrolling by the pointer.
  document.addEventListener("mousedown", (event) => {
    if (event.button === 1 && use.active() && linkOf(event.target)) event.preventDefault();
  }, true);
  document.addEventListener("auxclick", (event) => {
    const link = event.button === 1 && use.active() ? linkOf(event.target) : null;
    if (!link) return;
    event.preventDefault();
    if (leadsAway(link)) follow(hrefOf(link), true);
  }, true);
  // A link shown with its icon is a whole: a press puts no caret in it, and selects nothing with Ctrl
  // or ⌘ held. One left empty asks for its address at a click, here, ahead of the editor's listener,
  // which follows those that have one.
  const chipAt = (target) => {
    const chip = use.active() ? target?.closest?.(".doc-link-mention[data-ge-atom]") : null;
    return chip && editable(chip) ? chip : null;
  };
  document.addEventListener("mousedown", (event) => {
    if (event.button === 0 && !event.shiftKey && chipAt(event.target)) event.preventDefault();
  }, true);
  document.addEventListener("click", (event) => {
    const chip = event.ctrlKey || event.metaKey || event.shiftKey ? null : chipAt(event.target);
    if (!chip?.hasAttribute("data-ge-empty")) return;
    event.preventDefault();
    if (linkBox?.fresh?.chip !== chip) openLinkAt(chip);
  }, true);
  document.addEventListener("click", followOutside);
  document.addEventListener("compositionstart", compositionBegun, true);
  document.addEventListener("compositionend", compositionEnded, true);
  addEventListener("scroll", () => { if (linkBox) linkBox.paint(); }, { passive: true, capture: true });
  addEventListener("resize", () => { if (linkBox) linkBox.paint(); });
}

// ---------- the link card ----------

// { node, host, range, link, input, marks, pinned, held (its views open), paint, fresh: the gray 链接 the
// card asks the address of ({ chip, before, made: the "/" menu's, new }) or null, shown: what the field
// was given for the link, reading: the reading of the list of pages, once it is asked for, workspace:
// what it read (pages.mjs readPages; null until then, and for a list that cannot be read), asksPage: it
// fills a page block, making: a new page is on its way, entered: an Enter waits for the list, pasted:
// what the field holds was pasted, place(): the card put by the text, tallest: the most it has been high }
let linkBox = null;
let results = null; // the pages found, under the field (a menu of the card's, made when first needed)
let hoverTimer = 0;
let reached = null; // the link the pointer came over, until a move starts the wait for its card
let pointer = null; // where the pointer last moved to: { x, y } (a move the browser makes up goes nowhere)
let pasted = null; // the list of pages being read for what was just pasted
let press = null; // the last press: { x, y, selection: where it found the selection (selectionNow), keeps: it closes something open, and does no more }

/**
 * Close the card; `restore`: the selection goes back to the text it was opened on (after the gray
 * 链接, which stays when given up).
 */
export function closeLink(restore = true) {
  clearTimeout(hoverTimer);
  closeViews();
  if (!linkBox) return;
  const { node, host, range, marks, fresh } = linkBox;
  fadeAway(node); // a picture of it fades out (ui.mjs), the card itself gone at once
  results?.close();
  marks.forEach((mark) => mark.remove());
  linkBox = null;
  if (!host.isConnected) return;
  if (fresh) return leaveEmpty(host, fresh, restore);
  if (restore) {
    host.focus({ preventScroll: true });
    select(range);
  }
}

/** A press outside the card: what its field says is kept, when that is an address (words that are none are given up; a card opened by resting just goes). */
export function dismissLink() {
  if (!linkBox || linkBox.making) return;
  const typed = linkBox.input.value;
  if (linkBox.asksPage) {
    const page = listed(typedHref(typed.trim()));
    return page ? keepPage(page, false) : closeLink(false);
  }
  if (linkBox.pinned && normalizeHref(typed) !== null) setLink(typed, false);
  else closeLink(false);
}

// Ctrl+K: add a link to the selected text, or change or remove the link under the caret; `fresh`
// (the "/" menu's 链接): a new link at the caret, a gray 链接 there, its address asked for; with
// `page` (its 页面) a page block, the gray 页面.
export function openLink(host, { fresh = false, page = false } = {}) {
  if (!can(host, "links")) {
    use.say(limitText(host, "links"));
    return;
  }
  const selection = getSelection();
  if (!selection.rangeCount) return;
  const range = selection.getRangeAt(0).cloneRange();
  if (fresh) {
    closeLink(false);
    closeOffer();
    const before = ownHTML(host);
    range.deleteContents();
    const chip = newEmptyLink(document, page);
    range.insertNode(chip);
    askAddress(host, chip, before, true);
    return;
  }
  const link = linkAround(host, range);
  if (!link && range.collapsed) {
    use.say(t("先选中要加链接的文字，再按 Ctrl+K。"));
    return;
  }
  if (link && range.collapsed) range.selectNode(link);
  showCard(host, range, link, true);
}

// The card asking the address of a gray 链接 (`made`: just now, by the "/" menu; else one left empty,
// clicked), `host`'s html `before` it; the chip tinted meanwhile.
function askAddress(host, chip, before, made) {
  chip.setAttribute("data-ge-link-edit", "");
  const at = document.createRange();
  at.selectNode(chip);
  showCard(host, at, null, true, { chip, before, made });
}

// The gray 链接 given no address stays (one undo step when the "/" menu made it); `restore`: the
// caret after it.
function leaveEmpty(host, { chip, before, made }, restore) {
  chip.removeAttribute("data-ge-link-edit");
  if (!chip.isConnected) return;
  if (made) use.recordStep(host, before);
  if (restore) {
    host.focus({ preventScroll: true });
    const after = document.createRange();
    after.setStartAfter(chip);
    after.collapse(true);
    select(after);
  }
}

// Resting on a link: its card, below it; the focus stays where it is until the field is clicked. A
// link left empty (a click on it): its address asked for.
function openLinkAt(link) {
  const host = editable(link);
  if (!host || !link.isConnected || !can(host, "links")) return;
  if (link.hasAttribute("data-ge-empty")) {
    closeLink(false);
    closeOffer();
    return askAddress(host, link, ownHTML(host), false);
  }
  const range = document.createRange();
  range.selectNode(link);
  showCard(host, range, link, false);
}

// A button of the card; a press on it leaves the focus where it is (the field keeps it).
function tool(label, icon, action) {
  const node = element("button", { type: "button", class: "ge-link-tool", "aria-label": label, html: icon });
  node.addEventListener("mousedown", (event) => event.preventDefault());
  node.addEventListener("click", action);
  tooltip(node, label);
  return node;
}

/**
 * Open the detail card a link to it opens (dialogs.js), as a reader's `click` would; the card now
 * under the pointer, or its backdrop, takes no second press of a double click.
 */
export function openEntry(link, click) {
  const card = targetOf(link);
  if (!(card instanceof HTMLDialogElement)) return;
  swallowNext(click, () => card.open);
  if (globalThis.DocDialogs?.open) globalThis.DocDialogs.open(card, link);
  else card.showModal?.();
}

// A detail card's entry: 打开 and 移除 (the words stay as text; the detail card is no longer saved,
// core.mjs nodeOf). Below the entry, the focus staying in the text.
function showEntry(host, range, link) {
  const open = element("button", { type: "button", class: "ge-link-open", html: DIALOG_ICON }, element("span", {}, t("打开")));
  open.addEventListener("mousedown", (event) => event.preventDefault());
  open.addEventListener("click", (event) => {
    closeLink(false);
    openEntry(link, event);
  });
  const remove = tool(t("移除入口"), ICONS.trash, () => setLink(null));
  const node = element("div", { class: "ge-link", role: "dialog", "aria-label": t("详情卡片"), "data-entry": "" }, open, remove);
  tooltip(open, t("打开详情卡片"));
  linkBox = { node, host, range, link, input: { value: hrefOf(link) }, marks: [], pinned: false, held: false, paint: () => {}, fresh: null };
  mount(node);
  const rect = range.getClientRects()[0] ?? host.getBoundingClientRect();
  const { left, top } = placeBox(rect, { width: node.offsetWidth, height: node.offsetHeight }, { gap: 6 });
  node.style.left = `${Math.round(left)}px`;
  node.style.top = `${Math.round(top)}px`;
  appear(node, rect); // out of its corner nearest the entry (ui.mjs)
}

function showCard(host, range, link, focus, fresh = null) {
  closeLink(false);
  use.hideFormatBar();
  if (link?.classList.contains(DIALOG_TRIGGER) && !fresh) return showEntry(host, range, link);
  const asksPage = fresh?.chip.getAttribute("data-ge-empty") === "page";
  const input = element("input", { type: "text", placeholder: asksPage ? t("输入页面标题") : t("输入链接或页面标题"), "aria-label": asksPage ? t("页面标题") : t("链接地址"), spellcheck: "false" });
  // A link to a document shows its title, once the list is read.
  const toPage = link ? wholeAddress(hrefOf(link)) : null;
  input.value = link && !toPage ? hrefOf(link) : "";
  // 复制链接 and 移除链接 only for a link there is: a new one's field takes the card's width.
  const tools = link ? [tool(t("复制链接"), ICONS.copy, () => copyLink(input.value, link)), tool(t("移除链接"), ICONS.trash, () => setLink(null))] : [];
  const views = link && hasViews(link) ? viewButton(link) : null;
  const node = element("div", { class: "ge-link", role: "dialog", "aria-label": t("链接") }, element("label", { class: "ge-link-field" }, input), ...tools);
  if (views) {
    node.setAttribute("data-views", "");
    node.append(element("div", { class: "ge-link-sep", role: "separator" }), views);
  }
  input.addEventListener("keydown", (event) => {
    if (event.isComposing || event.keyCode === 229) return; // an input method's: its letters filter, and its Enter commits them
    if (box.making) event.preventDefault();
    else if (results?.isOpen && results.arrow(event)) event.preventDefault();
    else if (event.key === "Enter") {
      event.preventDefault();
      enterField(box);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      closeLink();
    }
  });
  // What is typed looks for a page (an input method's letters too, as they come), what is pasted does not.
  input.addEventListener("input", (event) => {
    box.pasted = event.inputType === "insertFromPaste";
    if (!box.pasted) return search(box, event.isComposing);
    results?.close();
    place();
  });
  input.addEventListener("compositionend", () => search(box));
  // Clicking into the field keeps the card until Enter or a press elsewhere.
  input.addEventListener("focus", () => {
    if (!linkBox) return;
    linkBox.pinned = true;
    clearTimeout(hoverTimer);
    readList(linkBox);
    linkBox.paint();
  });
  const marks = [];
  // The text the card is about, marked as the selection is while the field has the focus (not the
  // "/" menu's gray 链接, which shows where it goes).
  const paint = () => {
    marks.forEach((mark) => mark.remove());
    marks.length = 0;
    if (!linkBox?.pinned || linkBox.fresh || !range.startContainer.isConnected) return;
    for (const rect of range.getClientRects()) {
      if (rect.width < 1) continue;
      const mark = mount(own(element("div", { class: "ge-link-mark" }), "link mark", { alive: () => marks.includes(mark) }));
      Object.assign(mark.style, { transform: `translate(${rect.left}px, ${rect.top}px)`, width: `${rect.width}px`, height: `${rect.height}px` });
      marks.push(mark);
    }
  };
  const box = { node, host, range, link, input, marks, pinned: focus, held: false, paint, fresh, asksPage, making: false, entered: false, shown: input.value, reading: null, workspace: null, tallest: 0, place: () => {} };
  linkBox = box;
  mount(node);
  // Its opacity alone comes (ui.mjs appear): the field the reader types into never moves.
  appear(node, null, { typed: true });
  // Below the text, its left edge with the text's (above it when there is no room below), where the
  // pages found under the field stay clear of the window's end: by the most it has been high in this
  // opening, so that the field does not move back and forth as rows come and go.
  const rect = range.getClientRects()[0] ?? host.getBoundingClientRect();
  const place = () => {
    box.tallest = Math.max(box.tallest, node.offsetHeight);
    const { left, top } = placeBox(rect, { width: node.offsetWidth, height: box.tallest }, { gap: 6 });
    node.style.left = `${Math.round(left)}px`;
    node.style.top = `${Math.round(top)}px`;
  };
  box.place = place;
  place();
  if (focus) {
    input.focus();
    input.select();
    paint();
  }
  if (toPage) readList(box).then(() => {
    if (linkBox !== box || input.value) return;
    input.value = box.shown = titleIn(box.workspace ?? heldList(), fromFile(hrefOf(link), use.slug, location.origin)) || hrefOf(link);
    if (document.activeElement === input) input.select();
  });
}

// The list of pages, read once for each opening of the card (for what is typed in its field, or the
// title of the page it is about); what was typed before it came is looked for then.
function readList(box) {
  box.reading ??= readPages(use.own()).then((list) => {
    box.workspace = list;
    if (linkBox === box && (box.asksPage || (box.input.value !== box.shown && !box.pasted))) search(box);
  });
  return box.reading;
}

// The pages the field's words find, in the card under it (a page block's, with no words the first of
// them): looked for as they are typed (`composing`: an input method's letters, which it may show with
// its syllables apart, as "/" reads them), the first highlighted unless the words read as an address,
// which Enter keeps.
function search(box, composing = false) {
  if (linkBox !== box) return;
  const written = box.input.value;
  const query = (composing ? written.replace(/['\s]/g, "") : written).trim();
  const found = box.workspace && (query || box.asksPage) ? findPages(box.workspace.pages, query) : [];
  if (found.length === 0) {
    results?.close();
    return box.place();
  }
  results ??= createMenu();
  const rows = pageRows(found, (page) => { if (linkBox === box) keepPage(page); });
  const first = Boolean(query) && !normalizeHref(query);
  if (results.isOpen) results.update(rows, undefined, { first });
  else results.open(rows, null, { inside: box.node, label: t("页面"), highlight: first });
  box.place();
}

// Enter in the field, once the list is read (a moment, at the very start, in which another Enter is
// nothing more): nothing changed for a link
// left as it was; else the row highlighted (the one the keys moved to, or the first of what is no
// address); else what reads as an address, or a page block's own rule; else it says so and the card stays.
async function enterField(box) {
  if (box.entered) return;
  box.entered = true;
  readList(box);
  await box.reading;
  box.entered = false;
  if (linkBox !== box) return;
  const value = box.input.value.trim();
  if (box.link && value === box.shown) return setLink(value);
  if (!results?.isOpen) search(box); // what a paste did not look for
  if (results?.isOpen && results.hasChoice) return void results.choose();
  if (box.asksPage) return enterPage(box, value);
  if (normalizeHref(value) === null && !unsafe(value)) return use.say(t("没有找到这个页面。"), "error");
  setLink(value);
}

// Enter in a page block's field with no row to take: nothing typed is Esc; an address is the page it
// names, or no page of the workspace, said with the card staying; words found nothing, and make a
// new page of them under this one, the card holding what was typed until the answer comes. The page
// stays as it is, the caret too, and undo takes the block away, not the new page. What fails is said,
// the gray 页面 staying and the card open on the words.
async function enterPage(box, value) {
  if (!value) return closeLink();
  const address = typedHref(value);
  const page = address && box.workspace ? placeIn(box.workspace, address) : null;
  if (page) return keepPage(page);
  if (address || !use.subpage) return use.say(address ? t("这个地址不是工作区里的页面。") : t("没有找到这个页面。"), "error");
  box.making = box.input.readOnly = true;
  try {
    const report = await use.subpage(value);
    if (linkBox !== box) return;
    keepPage({ ...report, block: null }, document.activeElement === box.input);
    use.say(t("已新建子页面：{0}", report.title));
  } catch (error) {
    box.making = box.input.readOnly = false;
    use.say(error.message, "error");
  }
}

// The card's view button: the link's view and ▾; a click opens its views below it (views.mjs), a
// pick closing the card and switching the link.
function viewButton(link) {
  const button = element("button", { type: "button", class: "ge-link-view", "aria-haspopup": "menu", "aria-label": t("显示为"), html: `<span>${VIEWS[viewOf(link)].label}</span>${CHEVRON}` });
  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => {
    if (button.getAttribute("aria-expanded") === "true") return closeViews();
    if (!linkBox) return;
    linkBox.held = true;
    clearTimeout(hoverTimer);
    button.setAttribute("aria-expanded", "true");
    const rect = button.getBoundingClientRect();
    openViews(link, { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }, () => closeLink(false), () => {
      button.setAttribute("aria-expanded", "false");
      if (linkBox) linkBox.held = false;
    });
  });
  tooltip(button, t("显示为"));
  return button;
}

// What the link leads to, as an address that opens it from anywhere (a document's, a block's), else as it stands.
function copyLink(value, link) {
  const href = fieldHref(value, link);
  if (!href) return use.say(t("还没有链接地址。"));
  copyAddress(wholeAddress(href) ?? href, use.say);
}

// The link the whole range sits in, if any.
export function linkAround(host, range) {
  const start = range.commonAncestorContainer;
  const anchor = (start.nodeType === 1 ? start : start.parentElement).closest("a");
  return anchor && host.contains(anchor) ? anchor : null;
}

const unsafe = (value) => /^(javascript|vbscript|data):/i.test(value.replace(/[\u0000- ]/g, ""));

// The list a card goes by: its own, or the one held until that comes.
const listOf = () => linkBox?.workspace ?? heldList();

// A document that a card's address names in its list, or null (#<id> within a page stays a link to it).
const listed = (href) => (href && !href.startsWith("#") ? placeIn(listOf(), href) : null);

// The words for a link to `href`, where there is nothing to say of it but what it leads to: `page`'s
// title, the title of a page in the trash, else the address.
const wordsFor = (href, page) => page?.title ?? (href && titleIn(listOf(), href)) ?? href;

// The href of what is typed in the card (links/address.mjs typedHref), "" for an empty field, null
// for what is no address or is unsafe; the address of a document of the workspace as a file writes it
// (one on another server only if the list holds it, pages.mjs placeIn, for it may be another program's,
// and a click asks the list; so is a workbench's address, which only the list reads).
export function normalizeHref(value) {
  const href = value.trim();
  if (unsafe(href)) return null;
  const typed = typedHref(href);
  const place = listed(typed) ?? (use && elsewhere(typed, location.origin) ? null : pageAddress(typed));
  return place ? fileLink(place, use?.slug) : typed;
}

// The href of what the card's field says for `link`: what the field was given for it stands.
const fieldHref = (value, link) => (link && value.trim() === linkBox?.shown ? hrefOf(link) : normalizeHref(value));

/** Keep what the card's field says (`null`: take the link away) and close the card; `restore`: the
 * selection goes back to the text (not after a press elsewhere, which puts the caret there). */
export function setLink(value, restore = true) {
  const href = value === null ? "" : fieldHref(value, linkBox.link);
  if (href === null) {
    use.say(t("不支持这种链接地址。"), "error");
    return;
  }
  keep(href, restore, listed(href));
}

// A page chosen from the list (a row, Enter): the link leads to it.
const keepPage = (page, restore = true) => keep(fileLink(page, use.slug), restore, page);

// The link leads to `href` (`page`: the document of the list it is an address of), the card closing.
function keep(href, restore, page) {
  const { host, range, link, fresh } = linkBox;
  if (fresh) return setFresh(href, restore, page);
  closeLink(restore);
  if (link && href === hrefOf(link)) return; // nothing changed
  // A link shown with its icon: taken away, its title stays; its address changed, read again.
  if (link && isMention(link)) {
    if (href) return void refetch(link, href, page);
    const before = ownHTML(host);
    link.replaceWith(mentionOf(link).title);
    use.recordStep(host, before);
    use.say(t("链接已移除"));
    return;
  }
  const before = ownHTML(host);
  const entry = link?.classList.contains(DIALOG_TRIGGER);
  if (link && !href) link.replaceWith(...link.childNodes);
  else if (link) link.setAttribute("href", href);
  else if (href) {
    const anchor = document.createElement("a");
    anchor.setAttribute("href", href);
    const content = range.extractContents();
    content.querySelectorAll("a").forEach((inner) => inner.replaceWith(...(isMention(inner) ? [mentionOf(inner).title] : inner.childNodes)));
    anchor.append(content.textContent ? content : document.createTextNode(wordsFor(href, page))); // at a caret: its address, or a page's title
    range.insertNode(anchor);
    if (restore) {
      const after = document.createRange();
      after.setStartAfter(anchor);
      select(after);
    }
  } else return;
  use.recordStep(host, before);
  use.say(href ? t("链接：{0}", wordsFor(href, page)) : entry ? t("入口已移除：页面上没有地方能打开这张详情卡片了 · Ctrl+Z 撤销") : t("链接已移除"));
}

// The gray 链接 given its address: a link of it in its place, its words the address or a page's title
// (`page`), one undo step; Enter (restore) puts the caret after it and offers its views. Nothing
// given: it stays (leaveEmpty).
function setFresh(href, restore, page = null) {
  const { host, fresh, asksPage } = linkBox;
  linkBox.fresh = null; // closed as it is now
  closeLink(false);
  if (!host.isConnected || !fresh.chip.isConnected) return;
  if (!href) return leaveEmpty(host, fresh, restore);
  let link = asksPage ? pageChip(page) : null;
  if (!link) {
    link = document.createElement("a");
    link.setAttribute("href", href);
    link.textContent = wordsFor(href, page);
  }
  fresh.chip.replaceWith(link);
  if (restore) {
    host.focus({ preventScroll: true });
    const after = document.createRange();
    after.setStartAfter(link);
    after.collapse(true);
    select(after);
  }
  use.recordStep(host, fresh.before);
  use.say(t("链接：{0}", wordsFor(href, page)));
  if (restore) offerViews(link);
}

/** The open link card, if any (the editor's UI moves it into an open dialog). */
export const linkBoxNode = () => linkBox?.node ?? null;

/** The card and its views' menus (the editor's UI moves them into an open dialog). */
export const linkNodes = () => [linkBox?.node, ...viewNodes()].filter(Boolean);

/** Whether a press on `target` is one on the card or its views (no press elsewhere). */
export const linkHolds = (target) => Boolean(linkBox?.node.contains(target) || viewsHold(target));

/** Whether a gray 链接 or 页面 waits for its address (nothing is committed meanwhile). */
export const linkPending = () => Boolean(linkBox?.fresh);

// What an address of this computer names in the list the server gives: a page (pages.mjs placeIn), or
// null for any other address, or no answer.
async function listedPage(address) {
  const list = await readPages(use.own());
  return list && placeIn(list, address);
}

/**
 * Whether a page alone in a tab may leave for a workbench's `hash`, which only the list reads: not for
 * one that names no document, said as the workbench says it, the page staying. A web link of the sidebar,
 * or an entry of an extension's column with an address (#~<id>/<entry id>), is a place the workbench
 * opens (in its content area), so it goes there. With no answer it goes,
 * for the workbench to say.
 */
export async function leadsToPage(hash) {
  const list = await readPages(use.own());
  if (!list || placeIn(list, `#${hash}`) || webLinkIn(list, hash)) return true;
  use.say(inTrash(list.trash, hash) ? t("这个页面已删除。") : t("没有找到这个页面。"));
  return false;
}

/**
 * A page block just pasted, shown as the server draws one (render/page-chips.mjs): the title its
 * document has now and its icon, from the list. What the file says of it stays what was copied, and
 * one the list does not hold stays as it came. The blocks of one paste read the list once.
 */
export async function drawPasted(chip) {
  if (!isPageChip(chip)) return;
  pasted ??= readPages(use.own()).finally(() => { pasted = null; });
  const list = await pasted;
  const page = list && placeIn(list, fromFile(hrefOf(chip), use.slug, location.origin));
  if (page && chip.isConnected) chip.replaceChildren(...pageChip(page).childNodes);
}

/**
 * What an address of this computer is when it is a document's, in the list (a paste, which can wait: a
 * workbench's address needs the list): the page and its block (placeIn) with `href`, the link this
 * document's file writes to it; null for any other address, or no answer.
 */
export async function pageLinkOf(address) {
  const page = await listedPage(address);
  return page && { ...page, href: fileLink(page, use.slug) };
}

// ---------- following links ----------

export const linkOf = (target) => target?.nodeType === 1 && editable(target) ? target.closest("a[href]") : null;

// What a link's #<id> says, or null for a link that is no such thing.
function anchorOf(link) {
  const href = hrefOf(link);
  return href.startsWith("#") && href.length > 1 ? decoded(href.slice(1)) : null;
}

const targetOf = (link) => {
  const id = anchorOf(link);
  return id === null ? null : document.getElementById(id);
};

// The document of the workspace, or block of one, that `address` is the address of, as `go` takes it,
// or null. A workbench's address comes with its hash, for only the list can say what that names.
function placeOf(address) {
  const hash = workbenchHash(address);
  const place = pageAddress(address);
  return place || hash !== null ? { ...place, hash } : null;
}

// A new tab. A plain click brings it to the front; with Ctrl or ⌘ held the browser leaves it behind
// the page, as for any link.
const openTab = (url) => window.open(url, "_blank", "noopener");

// Where the selection stands.
function selectionNow() {
  const { anchorNode, anchorOffset, focusNode, focusOffset } = getSelection();
  return [anchorNode, anchorOffset, focusNode, focusOffset];
}

// Whether a click on a link in the text is one that opens it: not the end of a drag in it (a pointer
// moved, or a selection the press made: a selection it came down on stands until after the click,
// and a press on a whole touches none), not a Shift or Alt click, not the second click of a double
// click, not the press that closed something open.
function opens(event) {
  if (event.shiftKey || event.altKey || event.detail > 1) return false;
  if (!press || event.detail === 0) return true;
  if (press.keeps || Math.hypot(event.clientX - press.x, event.clientY - press.y) > DRAGGED) return false;
  return getSelection().isCollapsed || selectionNow().every((part, index) => part === press.selection[index]);
}

// An address of this computer on another server: on this one if the list holds its document in the
// words it has now, a link outliving the server it was copied from; else another program's, or another
// workspace's page of one folder name, opened as any web address. A tab
// of its own opens with the click, the list read after, for only what the click itself opens does the
// browser leave behind the page.

// Go where `href`, a link of this page that is no anchor, leads, read as its file reads it, so that
// doc.html beside it is this document: a document's address there, with `tab` in a tab of its own, a
// workbench at its link, by the list held (an id, with none, opens it all the same); a file of the
// report's folder (assets/<file>) in a new tab, where the preview serves it, and any other address too.
function follow(href, tab) {
  const address = fromFile(href, use.slug, location.origin);
  if (!address) return;
  if (elsewhere(address, location.origin)) return void openTab(address);
  const place = placeOf(address);
  const file = referencedFile(href);
  if (place && !tab) use.go(place, address);
  else if (place?.slug) openTab(fullAddress(location.origin, place, heldList().named));
  else openTab(file ? use.served(file) : address);
}

// A page block whose document is not there: deleted when the trash holds it, else there never was
// one, as the workbench and a presentation say it.
async function sayGone(link) {
  const slug = pageAddress(fromFile(hrefOf(link), use.slug))?.slug ?? "";
  use.say((await trashed(slug)) ? t("这个页面已删除。") : t("没有找到这个页面。"));
}

// Whether a link in the text is one that leads away: not an anchor, nor a link with no address.
const leadsAway = (link) => hrefOf(link) !== "" && !hrefOf(link).startsWith("#");

/**
 * Follow a link in the text being edited (its click): a detail card's opens it, an anchor's goes to
 * its block or says it is gone, a document's goes there, any other opens in a new tab.
 */
export function followLink(event, link) {
  clearTimeout(hoverTimer);
  event.preventDefault();
  if (!opens(event)) return;
  if (link.hasAttribute("data-doc-gone")) sayGone(link);
  else if (targetOf(link) instanceof HTMLDialogElement) openEntry(link, event);
  else if (anchorOf(link) !== null) use.reveal(anchorOf(link));
  else if (leadsAway(link)) follow(hrefOf(link), event.ctrlKey || event.metaKey);
}

// A click on a link of the page outside editable text (a block the page does not edit, a card an
// Agent wrote, a figure drawn in SVG, whose links have an object for an href, and may write it
// xlink:href) while editing, last of all (the document, as it bubbles; what took the click is left
// alone), by the rules of a link in the text: a document's goes there and a web address to a new tab,
// or it would take the page with it, and in a workbench the frame (not by the press that closed
// something open); a link to a block of the page goes to it; a link with no address goes nowhere,
// where it would load the page again. What the browser or the kit does with a click stays theirs: a
// link to save (a file block's), one of a target of its own (a bookmark's card), any other anchor,
// any click with a key held.
function followOutside(event) {
  if (!use.active() || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const link = event.target.closest?.("main a[*|href]");
  if (!link || link.matches("[download], [target]")) return;
  if (link.matches("[*|href='']")) return event.preventDefault();
  const href = link.href.baseVal ?? link.getAttribute("href");
  const url = URL.parse(fromFile(href, use.slug, location.origin) ?? "");
  if (!url || !/^https?:$/.test(url.protocol)) return;
  const anchor = link.matches("[*|href^='#']") ? decoded(url.hash.slice(1)) : null;
  if (anchor !== null && !document.querySelector(`[data-block-id="${CSS.escape(anchor)}"]`)) return;
  event.preventDefault();
  if (event.detail > 1 || press?.keeps) return;
  if (anchor !== null) use.reveal(anchor);
  else follow(href, false);
}

// ---------- an input method over a link ----------

// What replaces selected text takes the marks of its start, and what
// an input method puts in goes in as one. The browser takes a link for gone once its words are, and
// an entry's card with it: the link the selection starts in is kept here when a composition begins
// and put back around what it put in (a copy, as the one on the page may be gone by then).
let replacing = null; // { host, from: where the selection starts in its text, link: a copy of the link there }

function compositionBegun() {
  replacing = null;
  const selection = getSelection();
  const range = selection.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0) : null;
  const host = range ? editable(range.startContainer) : null;
  if (!host?.contains(range.endContainer)) return;
  const [from] = rangeOffsets(host, range);
  const { startContainer: first } = rangeAt(host, [from, from + 1]);
  const link = (first.nodeType === 1 ? first : first.parentElement).closest("a[href]");
  if (link && host.contains(link)) replacing = { host, from, link: link.cloneNode(false) };
}

function compositionEnded() {
  const kept = replacing;
  replacing = null;
  const selection = getSelection();
  if (!kept?.host.isConnected || !selection.rangeCount) return;
  const { host, from, link } = kept;
  const [, to] = rangeOffsets(host, selection.getRangeAt(0));
  if (to <= from) return;
  const words = rangeAt(host, [from, to]);
  if (linkAround(host, words)) return; // the browser kept it
  link.append(words.extractContents());
  link.querySelectorAll("a").forEach((inner) => inner.replaceWith(...inner.childNodes));
  words.insertNode(link);
  link.parentNode.normalize();
  joinMarks(link, link.nextSibling);
  joinMarks(link.previousSibling, link);
  select(rangeAt(host, [to, to]));
}
