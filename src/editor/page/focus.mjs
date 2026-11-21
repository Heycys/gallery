import { cutWords } from "../../shared/presence.mjs";
import { editable } from "./caret.mjs";
import { unitElement } from "./core.mjs";
import { readText, textSelection } from "./annotate/anchors.mjs";

// Where the reader is on the page, for gallery status (shared/presence.mjs): the block the caret is in, or the words and
// blocks selected, told to the workbench (session.mjs `focus`), which reports them to the server with its tab's other facts.
// Only what the reader has in front of them: the block's data-block-id (null for one the file has no id for yet: its commit is
// on its way) and its words, or the selected words, cut to 200 characters (shared/presence.mjs cutWords) before they leave the page.
//
// Given: picked() (the blocks selected whole: blocks.mjs), crossTexts() (text selected across blocks: text-select/, [{ host, range }]
// or null), tell({ caret, selection }) (the workbench's `focus`). Nothing is told while nothing changed: the selection and the caret
// are read 250ms after the last event that may have moved them (selectionchange, a press, a key, the focus), and the blocks selected
// whole, which no browser event announces, are looked at every 2s.

const AFTER = 250;
const WATCH = 2000;

/** A block's id as the file has it, or null. */
const idOf = (unit) => unit?.getAttribute?.("data-block-id") || null;
/** A block's words, cut. */
const wordsOf = (unit) => cutWords(readText([unit]).text).text;

/** The blocks the reader has selected whole: { kind: "blocks", blocks: [ids], text: the first one's words }, or null. */
function blockSelection(units) {
  const list = units.filter((unit) => unit?.isConnected);
  if (list.length === 0) return null;
  return { kind: "blocks", blocks: list.map(idOf).filter(Boolean), text: wordsOf(list[0]) };
}

/** Words selected as one range: { kind: "text", blocks: [ids], text, length }, or null. */
function wordsSelection(range) {
  const found = textSelection(range);
  if (found) {
    const words = cutWords(found.excerpt.quote);
    return { kind: "text", blocks: found.units.map(idOf).filter(Boolean), text: words.text, length: found.excerpt.quote.length };
  }
  // Words the annotations leave out (the title, a code block's): the block holding them, the words as the browser gives them.
  const unit = unitElement(range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement);
  const text = range.toString();
  const words = cutWords(text);
  return words.text ? { kind: "text", blocks: [idOf(unit)].filter(Boolean), text: words.text, length: text.length } : null;
}

/** What the reader has selected now (blocks, text across blocks, text in one block), or null. */
function selectionNow({ picked, crossTexts }) {
  const blocks = picked();
  if (blocks.length > 0) return blockSelection(blocks);
  const texts = crossTexts();
  if (texts?.length) {
    const range = document.createRange();
    range.setStart(texts[0].range.startContainer, texts[0].range.startOffset);
    range.setEnd(texts.at(-1).range.endContainer, texts.at(-1).range.endOffset);
    return wordsSelection(range);
  }
  const selection = getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!editable(range.commonAncestorContainer) && !editable(range.startContainer)) return null;
  return wordsSelection(range.cloneRange());
}

/** The block the caret is in: { block, text }, or null (no caret in the page's text). */
function caretNow() {
  const selection = getSelection();
  const host = selection?.rangeCount ? editable(selection.anchorNode) : null;
  const unit = host ? unitElement(host) : null;
  return unit ? { block: idOf(unit), text: wordsOf(unit) } : null;
}

export function watchFocus({ picked, crossTexts, tell }) {
  let last = null;
  let timer = 0;
  const read = () => {
    timer = 0;
    const selection = selectionNow({ picked, crossTexts });
    const caret = selection ? null : caretNow();
    const key = JSON.stringify({ caret, selection });
    if (key === last) return;
    last = key;
    tell({ caret, selection });
  };
  const soon = () => {
    if (!timer) timer = setTimeout(read, AFTER);
  };
  for (const type of ["selectionchange", "pointerup", "keyup", "focusin", "focusout"]) document.addEventListener(type, soon, { capture: true, passive: true });
  // The blocks selected whole: no event says they changed, so their list is compared now and then.
  let held = "";
  const watching = setInterval(() => {
    const now = picked().map(idOf).join(",");
    if (now !== held) {
      held = now;
      soon();
    }
  }, WATCH);
  return {
    /** Tell now (the page is ready, or the workbench asks again). */
    now: () => { last = null; clearTimeout(timer); read(); },
    stop() {
      clearInterval(watching);
      clearTimeout(timer);
    },
  };
}
