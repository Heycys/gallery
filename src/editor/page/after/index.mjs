import { IN_LAYER } from "../../../shared/layers.mjs";
import { UNIT, can, isEmpty, isHost, newHost, removalTarget, takeOut, withLeads } from "../core.mjs";
import { atEdge, caretAt, hosts } from "../caret.mjs";
import { caretBeside } from "../beside.mjs";
import { contentOf, extentOf } from "../geometry.mjs";
import { FOLLOW, task } from "../frames.mjs";
import { layerOf } from "../overlay-layer.mjs";
import { onSettle, own } from "../overlays.mjs";
import { addStyle, element } from "../ui.mjs";
import { alignClass, shownAlign } from "../align.mjs";
import { accepts, texOnly } from "../../components/registry.mjs";

// The caret after a block (docs/editor.md, "The caret after a block"; the user's, 2026-11-09): a click
// right of a block that is no text of its own (a picture, a table, a code block, a callout, a divider, a
// card, an instance of a custom block, a row of columns…: insert/ boxedBeside, beside.mjs) puts a caret
// at its bottom right, a blinking one, as the browser draws in text (a click there selected the
// block before).
// The text right below such a block comes back to it (the user's, 2026-11-09: Backspace there went
// into the block, a table's last cell, a callout's box, or past it, a picture passed over): Backspace
// at the start of the text block right after it (typing/, after the block's own keys and its
// alignment), and ← or ↑ there, put this caret after it, an empty block left going as it does
// (one undo step), one with words staying (no step); a second Backspace is this caret's.
//
//   Backspace, Delete   the block becomes an empty paragraph in its place, whatever follows it (the
//                       user's, 2026-11-09; the box it stands in taking one), aligned as the block was
//                       shown (a picture centred: centred, align.mjs shownAlign), the caret in it; one
//                       more Backspace takes that alignment off (typing/: align.mjs unalign) before
//                       anything else
//   Enter               an empty paragraph right after it, the caret in it
//   a key typed         a paragraph right after it holding what was typed, the caret at its end (an
//                       input method composes in the caret, its words going there once it ends)
//   ↑ ←, ↓ →            the text before it (its own last text: a table's last cell, a picture's caption),
//                       or after it, at its end or start; none there, the caret stays
//   Esc                 the block selected
//   Ctrl+V              a paste goes into a new paragraph after it
//
// Each change is one undo step, the words typed going with the paragraph they made (history.mjs
// typedInto), and undo puts this caret back after the block. The caret is an element of the editor's
// layer (overlay-layer.mjs: the page's, a dialog's), never the report's: an empty field that takes the
// focus, in the body text's font, at the block's right edge with its bottom on the block's, kept there
// as the page moves (a task of frames.mjs); it goes with the focus, its block, or a press elsewhere.

const STYLE = `
  .ge-after { z-index: ${IN_LAYER.frame}; display: inline-block; min-width: 2px; margin: 0; padding: 0; border: 0; outline: none; white-space: pre; background: transparent; color: var(--doc-text, currentColor); caret-color: var(--doc-text, currentColor); pointer-events: none; }
`;

/**
 * struct(parents, touched, mutate, options): the editor's undoable structural change (history.mjs).
 * blocks(): the block tools (blocks.mjs). keepText(unit): why a block may not go. removeBlocks(units):
 * the blocks deleted as the selected ones are (where no paragraph can take its place). say: the status
 * line. undo(), redo(): the editor's.
 */
export function createAfter({ struct, blocks, keepText, removeBlocks, say, undo, redo }) {
  addStyle(STYLE);
  const node = element("span", { class: "ge-after", contenteditable: "true", spellcheck: "false", "data-doc-dev": "" });
  let at = null; // the block the caret stands after

  const follow = task("after", {
    run() {
      if (!at) return false;
      if (!at.isConnected || at.getClientRects().length === 0) {
        hide();
        return false;
      }
      draw();
      return FOLLOW;
    },
    fail: () => hide(),
  });

  // At the block's right edge, its bottom on the block's: as tall as a line of the body text of the box it stands in.
  function draw() {
    const rect = extentOf(at);
    if (!rect) return;
    const layer = layerOf(at);
    if (node.parentNode !== layer) layer.append(node);
    const origin = layer.getBoundingClientRect();
    const height = node.offsetHeight || 24;
    node.style.transform = `translate(${Math.round(rect.right + 1 - origin.left)}px, ${Math.round(rect.bottom - height - origin.top)}px)`;
    own(node, "after", { owner: at, alive: () => Boolean(at) && at.isConnected });
  }

  /** The caret after block `unit`, focused. */
  function place(unit) {
    if (!unit?.isConnected) return;
    blocks().clear();
    at = unit;
    // The body text's font of the box it stands in (what a paragraph there is typed in).
    const style = getComputedStyle(unit.parentElement ?? document.body);
    const size = parseFloat(style.fontSize) || 16;
    const line = parseFloat(style.lineHeight) || size * 1.5;
    Object.assign(node.style, { fontFamily: style.fontFamily, fontSize: `${size}px`, lineHeight: `${line}px`, height: `${line}px` });
    node.textContent = "";
    draw();
    node.focus({ preventScroll: true });
    const range = document.createRange();
    range.setStart(node, 0);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
    follow.wake();
  }

  function hide() {
    at = null;
    node.textContent = "";
    node.remove();
  }

  // What the caret stands after, the caret taken away (the focus going where the change puts it).
  function take() {
    const unit = at;
    at = null;
    node.textContent = "";
    if (document.activeElement === node) node.blur();
    node.remove();
    return unit;
  }

  const takesParagraph = (box) => Boolean(box) && accepts(box.getAttribute("data-ge-box-kind") ?? "flow", "paragraph");

  // A paragraph right after the block (`text` in it: what was typed), the caret at its end; one undo
  // step, the words typed on into it with it (typedInto), undo putting this caret back after the block.
  function paragraphAfter(text = "") {
    const unit = at;
    const box = unit?.parentElement;
    if (!takesParagraph(box)) return null;
    take();
    const paragraph = newHost(document, "paragraph");
    if (text) paragraph.textContent = text;
    struct([box], [], () => {
      unit.after(paragraph);
      return { touched: [paragraph], focus: paragraph, settle: (backwards) => backwards && queueMicrotask(() => place(unit)) };
    }, { typedInto: text ? paragraph : null });
    caretAt(paragraph, "end");
    return paragraph;
  }

  // Backspace, Delete: the block becomes an empty paragraph in its place, aligned as it was shown, the
  // caret in it, whatever follows it (the user's, 2026-11-09: it was the text after it that took the
  // caret, no paragraph made); where its box takes none, it is deleted as a selected block is. One undo
  // step, which puts this caret back after the block.
  function remove() {
    const unit = at;
    const reason = keepText(unit);
    if (reason) {
      say(reason, "note", 6000);
      return;
    }
    const box = unit.parentElement;
    if (!takesParagraph(box)) {
      take();
      removeBlocks([unit]);
      return;
    }
    const parts = withLeads(unit);
    const area = contentOf(box.getBoundingClientRect(), getComputedStyle(box));
    const aligned = alignClass(shownAlign(unit.getBoundingClientRect(), area));
    take();
    const paragraph = newHost(document, "paragraph");
    if (aligned) paragraph.classList.add(aligned);
    struct([box], [], () => {
      parts[0].before(paragraph);
      parts.forEach((part) => part.remove());
      return { touched: [paragraph], focus: paragraph, settle: (backwards) => backwards && queueMicrotask(() => place(unit)) };
    });
    caretAt(paragraph, "start");
  }

  // The block of no text right above text block `host` (one a click right of puts this caret after:
  // beside.mjs caretBeside), shown: the block before it in its box, before a list's first item the one
  // before the list; or null. `host` is the first text of its block (a paragraph, a heading, a list's
  // first item), never a table's cell or a code block's text.
  function above(host) {
    if (!isHost(host) || texOnly(host) || !host.matches(UNIT)) return null;
    let node = host;
    while (!withLeads(node)[0].previousElementSibling && /^(UL|OL)$/.test(node.parentElement?.tagName ?? "") && node.parentElement.matches(UNIT)) node = node.parentElement;
    const block = withLeads(node)[0].previousElementSibling;
    return caretBeside(block) && block.parentElement?.hasAttribute("data-ge-box") && block.getClientRects().length > 0 && block.checkVisibility?.() !== false ? block : null;
  }

  /**
   * Backspace at the start of text block `host` (typing/, after its own keys): the caret after the
   * block of no text right above it, `host` going when it is empty (one undo step, undo putting the
   * caret back in it, redo this caret after the block), staying when it holds words. Whether it did.
   */
  function back(host) {
    const unit = above(host);
    if (!unit) return false;
    const node = isEmpty(host) && can(host, "remove") ? removalTarget(host) : null;
    if (node && !keepText(node)) {
      struct([node.parentNode], [host], () => {
        takeOut(node);
        return { touched: [], focus: null, settle: (backwards) => !backwards && queueMicrotask(() => place(unit)) };
      });
    }
    place(unit);
    return true;
  }

  /** ← or ↑ with the caret at the start of text block `host` (editor.mjs): the caret after the block above it, as back(). Whether it did. */
  function up(host, key) {
    if (key !== "ArrowLeft" && key !== "ArrowUp") return false;
    const selection = getSelection();
    if (!selection.rangeCount || !selection.isCollapsed || !atEdge(host, false)) return false;
    const unit = above(host);
    if (!unit) return false;
    place(unit);
    return true;
  }

  // ↑ ←: the text before the caret (the block's own last, or the one before it), at its end; ↓ →: the
  // first after it, at its start. Formula blocks are passed over (no text to type in).
  function leave(back) {
    const unit = at;
    const list = hosts().filter((host) => !texOnly(host));
    const before = (host) => unit.contains(host) || Boolean(host.compareDocumentPosition(unit) & Node.DOCUMENT_POSITION_FOLLOWING);
    const target = back ? list.filter(before).at(-1) : list.find((host) => !before(host));
    if (!target) return;
    take();
    caretAt(target, back ? "end" : "start");
  }

  /** A key with the caret after a block (editor.mjs onKeydown, first): whether it was this caret's. */
  function key(event) {
    if (!at || event.target !== node) return false;
    if (event.isComposing || event.keyCode === 229) return true; // an input method's: composed here, put in at its end
    const mod = event.ctrlKey || event.metaKey;
    const name = event.key.toLowerCase();
    if (mod && !event.altKey && (name === "z" || name === "y")) {
      event.preventDefault();
      take();
      name === "y" || event.shiftKey ? redo() : undo();
      return true;
    }
    if (mod && !event.altKey && !event.shiftKey && name === "v") {
      paragraphAfter(); // the paste that follows goes into it
      return true;
    }
    if (mod && name === "s") return false; // saving, the editor's
    if (event.key === "Backspace" || event.key === "Delete") remove();
    else if (event.key === "Enter") paragraphAfter();
    else if (event.key === "Escape") {
      const unit = take();
      blocks().select(unit);
    } else if (event.key.startsWith("Arrow") && !mod && !event.altKey) leave(event.key === "ArrowUp" || event.key === "ArrowLeft");
    else if (!mod && event.key.length === 1) return true; // a character: typed here, put in a paragraph (input)
    else if (mod || event.key === "Tab") event.preventDefault(); // nothing to format or move: the keys do nothing here
    else return true;
    event.preventDefault();
    return true;
  }

  // What was typed (a key's character, an input method's words once it ends): a paragraph after the
  // block holding it.
  node.addEventListener("input", (event) => {
    if (event.isComposing || !at) return;
    const text = node.textContent;
    node.textContent = ""; // nothing stays in the field, wherever the words go (a box that takes no paragraph: nowhere)
    if (text) paragraphAfter(text);
  });
  node.addEventListener("compositionend", (event) => {
    if (!at) return;
    const text = event.data || node.textContent;
    node.textContent = "";
    if (text) paragraphAfter(text);
  });
  // The focus gone elsewhere on the page (a press, a key that moved it): the caret goes. The window
  // losing it keeps it, as the browser's own caret is kept.
  node.addEventListener("blur", () => {
    if (at && document.hasFocus()) hide();
  });
  // Its block taken off the page (an Agent's write, undo): it goes at once.
  onSettle(() => {
    if (at && !at.isConnected) hide();
  });
  globalThis.__galleryAfter = () => (at && document.activeElement === node ? at : null); // the block the caret stands after (the browser tests)

  return {
    place,
    key,
    back,
    up,
    /** The block the caret stands after, or null. */
    get block() { return at; },
    /** The editor's UI nodes to keep in the top layer when a modal dialog opens. */
    get nodes() { return node.isConnected ? [node] : []; },
  };
}
