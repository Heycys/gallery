import { MEDIA_BLOCKS, MEDIA_CLASS, mediaBlockOf } from "../../../shared/components/index.mjs";
import { caretAt } from "../../page/caret.mjs";
import { openMediaMenu } from "../../page/media-menu/index.mjs";
import { keptByComponent } from "../../page/page-objects.mjs";
import { blobBase64 } from "../../page/post.mjs";
import { addStyle } from "../../page/ui.mjs";
import { barClass } from "../placeholder-bar.mjs";
import { captionOf } from "./parts.mjs";
import { TOOLBAR_STYLE } from "./toolbar.mjs";
import { ZWSP } from "../../../shared/inline-spacing.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// What the four media blocks (图片, 文件, 网页书签, 嵌入) do on the page alike: a click on a placeholder opens the
// block's menu; what is chosen replaces the placeholder with a NEW element (never the same one, so
// that undo brings back the placeholder as it was and the file loses the block); a caption shows
// once it is asked for or focused, goes out of sight when it is left empty, and Enter in it makes a
// paragraph after the block; Backspace or Delete in an empty one closes it and selects its block. It
// is plain text under the block, with no fill under the pointer or the caret. What a block makes of
// what is chosen (its picture, row, card or frame), its menu, rows and tools are its own (image/,
// file/, bookmark/, embed/ page.mjs).

const STYLE = `${TOOLBAR_STYLE}
  /* A caption is shown with words, while it has the caret, or once 标题 asks for it (data-ge-caption), with its placeholder 写一个标题…. */
  ${MEDIA_BLOCKS.map((id) => `[data-ge-editing] .${MEDIA_CLASS[id]}[data-ge-caption] > figcaption`).join(", ")} { display: block; }
  ${MEDIA_BLOCKS.map((id) => `[data-ge-editing] .${MEDIA_CLASS[id]} > figcaption:empty::before`).join(", ")} { content: ${JSON.stringify(t("写一个标题…"))}; color: var(--ge-tx3); }
  /* A caption is plain text under its block: no fill under the pointer or the caret (editor.mjs's --ge-text-tint). */
  [data-ge-editing] [data-ge-kind="mediaCaption"][contenteditable="true"] { --ge-text-tint: none; }
`;

// Every media placeholder (a gray bar), by the selector the page finds it by.
const BARS = MEDIA_BLOCKS.map((id) => `main figure.${MEDIA_CLASS[id]} > .${barClass(MEDIA_CLASS[id])}`).join(", ");

// What a placeholder's words were before something was under way (busy), by the words' element.
const idleWords = new WeakMap();

// A caption with nothing in it: no words, no chip (a formula, a page's link); what the browser or a
// pad leaves (a <br>, a zero-width space) is nothing. A space is something: Backspace takes it.
const blank = (text) => !text.textContent.replaceAll(ZWSP, "") && !text.querySelector("[data-ge-atom]");

/**
 * The media blocks on the page, with what the editor gives them: struct (an undo step), say,
 * active() (the block tools may act), blocks() (the block tools), newParagraph(parent, after),
 * typedKey(event) (a key of the "/" or "@" menu, which comes before a caption's) and upload(kind,
 * body) (POST /__gallery/edit/upload: the server's answer, or an Error).
 *
 * Returns block(id), the parts a block's own editing is made from; each block's page object is `pages[id]`.
 */
export function create({ struct, finishStep, look, say, active, blocks, newParagraph, typedKey, upload, pages }) {
  const select = (unit) => blocks()?.select(unit);
  const openMenu = (unit, rect) => blocks()?.openMenu(unit, rect);
  addStyle(STYLE);

  // A click on a placeholder opens its block's menu.
  document.addEventListener("click", (event) => {
    const bar = event.target?.closest?.(BARS);
    if (!bar || !active() || keptByComponent(bar)) return;
    event.preventDefault();
    pages[mediaBlockOf(bar.parentElement)]?.pick(bar.parentElement);
  }, true);

  // A caption that has the caret is shown (data-ge-caption: an editing-only mark, gone once the caret
  // leaves): one the reader empties goes out of sight only then, not under it, where the caret would
  // be lost and the change with it.
  document.addEventListener("focusin", (event) => {
    const text = event.target;
    if (text?.localName === "figcaption" && text.getAttribute("data-ge-kind") === "mediaCaption") text.parentElement?.setAttribute("data-ge-caption", "");
  }, true);
  // Once the caret leaves, the caption is shown by its words (the kit), not by the mark; an empty one
  // goes out of sight again: emptied by the reader too, the line break the browser
  // leaves in it taken out, or the kit (:empty) would keep showing a blank line under the block.
  document.addEventListener("focusout", (event) => {
    const text = event.target;
    if (text?.localName !== "figcaption" || text.getAttribute("data-ge-kind") !== "mediaCaption") return;
    if (!text.textContent.trim() && !text.querySelector("[data-ge-atom]")) text.replaceChildren();
    text.parentElement?.removeAttribute("data-ge-caption");
  }, true);
  // Enter in a caption: a menu's first (its row), else a paragraph after the block.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.shiftKey || event.isComposing || event.keyCode === 229) return;
    const text = event.target?.closest?.('[data-ge-kind="mediaCaption"]');
    const figure = text?.parentElement?.closest("figure");
    if (!figure) return;
    event.stopImmediatePropagation();
    if (typedKey(event)) return;
    event.preventDefault();
    newParagraph(figure.parentElement, figure);
  }, true);
  // Backspace or Delete in an empty caption closes it (the user's rule, 2026-11-06): out of sight as
  // when the caret leaves it, the file keeping its
  // empty <figcaption> (no undo step: nothing of the file changes), and its block selected, as Esc
  // there does and as Backspace selects a block above that holds no text (typing/): Backspace again
  // deletes the block. A key held down stops at the empty caption (`repeat`), so that holding
  // Backspace to clear its words never takes the block with them.
  document.addEventListener("keydown", (event) => {
    if ((event.key !== "Backspace" && event.key !== "Delete") || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || event.keyCode === 229) return;
    const text = event.target?.closest?.('[data-ge-kind="mediaCaption"]');
    const figure = text?.parentElement?.closest("figure");
    if (!figure || !active() || !blank(text)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!event.repeat) closeCaption(text, figure);
  }, true);

  // A caption closed: emptied of what the browser left, its mark gone, its block selected (which
  // takes the focus off it; where the block cannot be selected, the focus leaves it all the same).
  function closeCaption(text, figure) {
    text.replaceChildren();
    figure.removeAttribute("data-ge-caption");
    select(figure);
    if (text.contains(document.activeElement)) text.blur();
  }

  /** The parts the editing of media block `id` is made from. */
  function block(id) {
    const wordsOf = (figure) => figure.querySelector(`:scope > .${barClass(MEDIA_CLASS[id])} span`);
    // The placeholder says what is under way ("正在上传…") until idle() puts its own words back.
    const busy = (figure, text) => {
      const words = wordsOf(figure);
      if (!words) return;
      if (!idleWords.has(words)) idleWords.set(words, words.textContent);
      words.textContent = text;
    };
    const idle = (figure) => {
      const words = wordsOf(figure);
      if (words && idleWords.has(words)) words.textContent = idleWords.get(words);
    };
    return {
      struct, look, say, active, select, openMenu,
      busy, idle,
      /** Something under way for `figure`: `working` said in its placeholder; `task()` failing, the placeholder is as it was and `failed` (and the reason) said. */
      async attempt(figure, working, failed, task) {
        busy(figure, working);
        try {
          await task();
        } catch (error) {
          idle(figure);
          say(t("{0}：{1}", failed, error.message), "error");
        }
      },
      /** The menu of this block (openMediaMenu's options), below the element `anchorOf(figure)` gives (the block itself). */
      pick(figure, menu, anchorOf = (each) => each) {
        if (figure?.isConnected) openMediaMenu(anchorOf(figure), menu);
      },
      /** A file the reader chose (or a picture cut out, `name`d) sent to the report's folder: the server's answer. */
      uploadFile: async (blob, name = blob.name) => upload(id, { name, type: blob.type, data: await blobBase64(blob) }),
      /** A link's file downloaded into the report's folder by the server: its answer. */
      uploadUrl: (url) => upload(id, { url }),
      /**
       * `next` (a new element made of what was chosen) in the place of `figure`, one undo step, the
       * block selected. `replacing`: the block had content: undo selects the block it was. `pasted`:
       * it fills a block just pasted, one undo step with the paste, the selection as it was. The
       * placeholder that goes has its own words back (not what was under way: "正在上传…", busy), so
       * that undo brings it back as it was before.
       */
      place(figure, next, { replacing = false, pasted = false } = {}) {
        const picked = blocks()?.picked ?? [];
        if (!pasted || !finishStep(figure, next)) {
          struct([figure.parentElement], [], () => {
            figure.replaceWith(next);
            return { touched: [], focus: null, select: replacing ? figure : null };
          });
        }
        idle(figure);
        if (!pasted) select(next);
        else if (picked.includes(figure)) blocks().select(picked.map((node) => (node === figure ? next : node)).filter((node) => node.isConnected), { quiet: true }); // others dropped in with it stay selected too
      },
      /** The caption shown (an empty one too), the caret at its end, no block left selected. */
      caption(figure) {
        const text = figure && captionOf(figure);
        if (!text) return;
        blocks()?.clear();
        figure.setAttribute("data-ge-caption", "");
        caretAt(text, "end");
      },
      /**
       * `file` pasted: a new block made by `make(doc)`, put in its place by `put` (the paste's, clipboard/:
       * where a block pasted there goes, one undo step; false when it could not), the block selected, then
       * `fill(figure, file, { pasted: true })` (its placeholder filled, in the same undo step: one Ctrl+Z
       * takes the paste back to what stood there). Returns whether it took the file.
       */
      paste(put, file, make, fill) {
        if (!file) return false;
        const figure = make(document);
        if (!put(figure)) return false;
        blocks()?.select(figure, { quiet: true });
        fill(figure, file, { pasted: true });
        return true;
      },
      /**
       * A new block for `file` dropped in from outside (page/drop-in/): `block`, made by `make(doc)`, not on
       * the page yet, and `fill()`, which puts the file in it once the drop has put it there
       * (`fill(figure, file, { pasted: true })`: its upload, one undo step with that drop).
       */
      forFile(file, make, fill) {
        const figure = make(document);
        return { block: figure, fill: () => fill(figure, file, { pasted: true }) };
      },
      /** Whether `figure` still shows its placeholder (nothing chosen for it yet), one a component keeps not counted. */
      empty: (figure) => Boolean(figure?.isConnected && mediaBlockOf(figure) === id && figure.querySelector(`:scope > .${barClass(MEDIA_CLASS[id])}`)) && !keptByComponent(figure),
    };
  }

  return { block };
}
