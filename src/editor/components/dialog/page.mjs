import { can, firstHost, newHost } from "../../page/core.mjs";
import { caretAt, editable } from "../../page/caret.mjs";
import { padCaret } from "../../page/pads.mjs";
import { DIALOG } from "../kit.mjs";
import { linkAround } from "../../page/links/index.mjs";
import { DIALOG_TRIGGER, dialogContent, entryOf } from "./index.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// 详情卡片 on the page. The format bar makes the selected text the entry of a new detail card (a
// link to it, as the kit writes one in text): the card goes at the end of the report and opens, a
// heading of that text first in it and the caret in the empty paragraph under it. One undo step
// takes both away again, and redo brings the card back open; a new card whose link was removed is
// not saved (core.mjs nodeOf), and a card of the file stays in it, with nothing left to open it.
//
// However a card closes (Esc, a press outside it, the workbench's bars) nothing stands where it was:
// what stood over its text goes, and a caret left in it comes out at its entry. What lands in a card
// no one sees (an undo step, a word 搜索文档 found) opens it (show). A page shown again has the
// cards it had, the same one on top (kept, reopen).

/**
 * A new detail card (dialog.doc-dialog) with this id, the kit's markup: a content region (a box)
 * holding a heading of `title` (text), the size a detail card's opens with, and an empty paragraph.
 */
export function newDialog(doc, id, title = "") {
  const dialog = doc.createElement("dialog");
  dialog.className = "doc-dialog";
  dialog.id = id;
  for (const [name, value] of [["data-ge-new", ""], ["data-ge-type", "dialog"], ["data-ge-unit-kind", "dialog"]]) dialog.setAttribute(name, value);
  const panel = doc.createElement("div");
  panel.className = "doc-dialog-panel";
  const content = doc.createElement("div");
  content.className = "doc-dialog-content";
  for (const [name, value] of [["data-ge-box", ""], ["data-ge-box-kind", "dialog"], ["data-ge-pure", ""]]) content.setAttribute(name, value);
  const heading = newHost(doc, "heading3");
  heading.textContent = title;
  content.append(heading, newHost(doc, "paragraph"));
  panel.append(content);
  dialog.append(panel);
  return dialog;
}

/** An id no element of the page has yet, for a new detail card: dialog-1, dialog-2… */
export function freshDialogId(doc) {
  let number = 1;
  while (doc.getElementById(`dialog-${number}`)) number++;
  return `dialog-${number}`;
}

/** A link opening a detail card, as the kit writes it in text. */
export function dialogLink(doc, id) {
  const link = doc.createElement("a");
  link.className = DIALOG_TRIGGER;
  link.setAttribute("href", `#${id}`);
  return link;
}

// A card opened as the kit opens one, which goes back to `opener` once it closes.
function openCard(card, opener) {
  if (globalThis.DocDialogs?.open) globalThis.DocDialogs.open(card, opener);
  else card.showModal?.();
}

/**
 * The detail cards open now, in the order they opened (the last one on top: a card opened from a
 * link in another), followed as their `open` attribute comes and goes; each `listener` of them
 * hears of that, and of the kit's page lock (the root's doc-dialog-open, dialogs.js) changing.
 */
function followCards() {
  const listeners = new Set();
  const told = () => listeners.forEach((listener) => listener());
  let order = [...document.querySelectorAll(DIALOG.open)];
  new MutationObserver((records) => {
    for (const { target } of records) {
      if (!(target instanceof HTMLDialogElement) || !target.matches(DIALOG.match)) continue;
      order = order.filter((card) => card !== target);
      if (target.open) order.push(target);
    }
    told();
  }).observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["open"] });
  new MutationObserver(told).observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return {
    listen: (listener) => listeners.add(listener),
    /** The cards open, the one on top last (one the page put back open, unheard, after those heard). */
    open() {
      const now = [...document.querySelectorAll(DIALOG.open)];
      order = order.filter((card) => now.includes(card));
      return [...order, ...now.filter((card) => !order.includes(card))];
    },
  };
}

/**
 * Detail cards, with what the editor gives it: struct (a structural undo step), say, limitText,
 * selectionContext (the selection inside one text block), hideFormatBar, closeTools (what opens over
 * the page), blocks (the block tools) and isEditing.
 */
export function create({ struct, say, limitText, selectionContext, hideFormatBar, closeTools, blocks, isEditing }) {
  const cards = followCards();

  // A card closed: it leaves nothing behind. The caret goes to its entry, outside it, when that is in
  // what shows now (the page, or the card on top); else to the first text of the card on top, or
  // nowhere. The focus went back as the card closed, which put it at the start of the block that
  // takes it.
  function closed(card) {
    closeTools();
    if (blocks().picked.some((block) => card.contains(block))) blocks().clear();
    const top = cards.open().at(-1);
    const entry = entryOf(card);
    const host = entry && (!top || top.contains(entry)) ? editable(entry) : null;
    if (host) {
      host.focus({ preventScroll: true });
      padCaret(entry, "after");
    } else if (top) caretAt(firstHost(dialogContent(top)), "start");
    else if (card.contains(getSelection().anchorNode)) getSelection().removeAllRanges();
  }
  // Heard after the kit's, which gives the focus back (`close` does not bubble: on its way down).
  document.addEventListener("close", (event) => {
    if (isEditing() && event.target.matches?.(DIALOG.match)) closed(event.target);
  }, true);

  // The card on top closes as a press on its backdrop closes it (the kit's dialogs.js); one under it
  // stays. Returns whether one was open.
  function closeTop() {
    const card = cards.open().at(-1);
    if (!card) return false;
    if (globalThis.DocDialogs?.close) globalThis.DocDialogs.close(card, "outside");
    else card.close();
    return true;
  }
  // The browser's own Esc takes together the cards opened with no key or press between them, as a
  // page shown again opens them; what the page's Esc takes first it has prevented by now.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || event.defaultPrevented || event.isComposing || cards.open().length < 2) return;
    event.preventDefault();
    closeTop();
  });

  // The format bar's card button (`fromSelection`): the selected text opens a new detail card.
  function fromSelection() {
    const context = selectionContext();
    if (!context) return say(t("先选中点开详情卡片的文字。"));
    const { host, range } = context;
    if (!can(host, "links")) return say(limitText(host, "links"));
    if (linkAround(host, range) || range.cloneContents().querySelector("a")) return say(t("选中的文字里已经有链接，先移除链接（Ctrl+K）再做详情卡片的入口。"));
    const title = range.toString().replace(/\s+/g, " ").trim();
    const main = document.querySelector("main[data-ge-box]");
    if (!title || !main) return say(title ? t("这里不能新建详情卡片。") : t("先选中点开详情卡片的文字。"));
    const id = freshDialogId(document);
    const dialog = newDialog(document, id, title);
    hideFormatBar();
    struct([main], [host], () => {
      const link = dialogLink(document, id);
      link.append(range.extractContents());
      range.insertNode(link);
      main.append(dialog);
      return { touched: [host], focus: dialogContent(dialog).lastElementChild };
    });
    openCard(dialog);
    caretAt(dialogContent(dialog).lastElementChild, "start");
    say(t("已新建详情卡片：标题取自选中的文字，接着写卡片里的内容 · Esc 关闭 · Ctrl+Z 撤销"));
  }

  // Esc in what stands in an open card is the card's (it closes it, as for a reader): no block selected.
  const escape = ({ host }) => Boolean(host.closest("dialog[open]"));

  return {
    fromSelection,
    keys: { around: { escape } },
    modalOps: {
      /** The cards open, the one on top last; `listen(listener)`: told when that may have changed. */
      open: () => cards.open(),
      listen: cards.listen,
      closeTop,
      /**
       * The card holding `node` shown, for what lands in it: closed, it opens over the others; put back
       * open by an undo step, as no modal, it opens as one. Returns its content region, or null for a
       * node in no card.
       */
      show(node) {
        const card = (node?.nodeType === 1 ? node : node?.parentElement)?.closest(DIALOG.match);
        if (!card) return null;
        if (!card.matches(":modal")) {
          card.removeAttribute("open");
          openCard(card, entryOf(card) ?? undefined);
        }
        return dialogContent(card);
      },
      /** The cards open, for a page shown again: their ids, the one on top last, and how far each is scrolled. */
      kept: () => cards.open().map((card) => ({ id: card.id, top: dialogContent(card)?.scrollTop ?? 0 })),
      /** The cards of `kept` the page still has, open again. */
      reopen(kept) {
        for (const { id, top } of kept) {
          const card = document.getElementById(id);
          if (!card?.matches(DIALOG.match)) continue;
          openCard(card, entryOf(card) ?? undefined);
          dialogContent(card).scrollTop = top;
        }
      },
    },
  };
}
