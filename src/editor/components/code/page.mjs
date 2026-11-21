import { FOLD_DOTS } from "../../../shared/code-folds.mjs";
import { LINE_START } from "../../../shared/code-lines.mjs";
import { UNIT, matchesSource, ownHTML } from "../../page/core.mjs";
import { pointRange, select } from "../../page/caret.mjs";
import { ICONS, createMenu } from "../../page/menu.mjs";
import { capsFor } from "../registry.mjs";
import { lookRow } from "../rows.mjs";
import { addStyle, loadScript } from "../../page/ui.mjs";
import { CODE_HEIGHT, FOLDED, FOLDED_LINES, LANGUAGE, LINE, NOWRAP, codeBaseline, codeLanguage, codePre, codeText, isCode, linesOf, openCode, setCode, syncGutter } from "./index.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// 代码块 on the page. A code block keeps the lines the kit highlighted until the reader clicks into
// them (or the arrow keys reach it, or Enter in its title): its source text then goes into a `code`
// text block, the caret at the character pressed. While edited it is highlighted again as it is typed
// (not while an input method composes) and its line numbers follow; Enter breaks a line keeping its
// indentation, Tab indents two spaces, a paste keeps its lines. Its title is a text block of its own
// (plain text, one line; Enter goes into the code). The header's fold arrow and wrap button switch
// its classes as one undo step each (the kit's do it in a reading view); its language label opens a
// menu of languages (自动识别 first: the language it looks like, the kit's guess), the one picked
// set as its data-language, one undo step, and the block drawn again in it. The arrow beside a line
// that starts a structure folds that line: its data-folded-lines, one undo step; the kit's
// lines fold as it says, and so do the open code's, a span a line, their numbers and arrows in the
// gutter (index.mjs syncGutter), the folds following the lines through typing.

// A code block as it is edited (the kit draws the rest, styles/code.css): the page's styles.
const STYLE = `
  /* A code block being edited looks as the kit draws it: its line numbers in a column of their
     own (the same size and gaps as the kit's), its code colored, redrawn as it changes, its long
     lines wrapped unless it scrolls them (doc-code--nowrap). Folded, it hides its code as the
     kit's does. */
  /* Opened, its code and line numbers side by side; the room below the last line the code's own (a row
     of flex items leaves the scroller's bottom padding out of what it scrolls through: scrolled to its
     end, the last line stood against the edge). */
  [data-ge-editing] .doc-code:not(.doc-code--folded) > pre:has(> code[data-ge-kind="code"]) { display: flex; align-items: flex-start; padding-bottom: 0; }
  [data-ge-editing] .doc-code:not(.doc-code--folded) > pre:has(> code[data-ge-kind="code"]) > * { margin-bottom: 18px; } /* a margin: the line numbers count the code's own height */
  [data-ge-editing] pre > code[data-ge-kind="code"], [data-ge-editing] pre > code[data-ge-kind="code"]:focus { --ge-text-tint: none; flex: 1 1 auto; display: block; min-width: 0; min-height: var(--doc-code-line-height, 20px); padding: 0 2px; white-space: pre-wrap; word-break: break-word; outline: none; }
  [data-ge-editing] .doc-code--nowrap > pre > code[data-ge-kind="code"] { flex: 1 0 auto; min-width: auto; white-space: pre; word-break: normal; }
  .ge-code-gutter { flex: none; display: flex; flex-direction: column; color: var(--doc-code-line-number, #b4b1ab); font-size: var(--doc-code-number-size, 12px); line-height: var(--doc-code-line-height, 20px); font-variant-numeric: tabular-nums; user-select: none; pointer-events: none; }
  .ge-code-row { display: flex; flex: none; min-height: var(--doc-code-line-height, 20px); }
  /* Numbers left-aligned on the line the title's text starts on, as wide as the last one: the kit's numbers, their size, inset and gap, and the rows' height, read from its custom properties (styles/code.css). */
  .ge-code-number { box-sizing: content-box; min-width: calc(var(--ge-code-digits, 1) * 1ch); padding: 0 var(--doc-code-number-gap, 12px) 0 var(--doc-code-number-inset, 6px); text-align: left; }
  .ge-code-gutter--bare .ge-code-row { padding-right: 4px; }
  /* A line's arrow (its structure folds), as the kit's: left of its number, under the block's own
     fold arrow; rounded, light, shown while the pointer is over the block (a folded one always,
     turned); a short fill while pressed. */
  .ge-code-fold, .ge-code-slot { flex: none; width: 16px; height: 16px; margin: 2px 0; }
  .ge-code-fold { display: flex; align-items: center; justify-content: center; border-radius: 4px; color: var(--doc-code-line-fold, #c1c0bc); cursor: pointer; pointer-events: auto; visibility: hidden; }
  .ge-code-fold svg { width: 10px; height: 10px; fill: currentColor; transition: transform .2s ease-out; }
  .ge-code-fold:active { background: var(--doc-code-pressed, rgb(31 35 41 / 12%)); }
  .doc-code:hover .ge-code-fold, .ge-code-fold[data-folded] { visibility: visible; }
  .ge-code-fold[data-folded] svg { transform: rotate(-90deg); }
  /* The open code's lines a fold hides, and "…" after a folded one (a click on it unfolds it). */
  [data-ge-editing] code[data-ge-kind="code"] > .ge-code-line--hidden { display: none; }
  [data-ge-editing] code[data-ge-kind="code"] > .ge-code-line--folded::after { content: ""; display: inline-block; width: 24px; height: 16px; margin-left: 6px; vertical-align: -3px; border-radius: 4px; background: ${FOLD_DOTS} center / 12px 2px no-repeat, var(--doc-code-fold-more, rgb(55 53 47 / 8%)); cursor: pointer; }
  [data-ge-editing] pre[data-ge-code] { cursor: text; }
  /* A code block's title being edited: one line (its placeholder is the typing's). */
  [data-ge-editing] .doc-code-title[contenteditable="true"] { --ge-text-tint: none; outline: none; text-overflow: clip; cursor: text; }
  /* Its language opens the menu of languages: a button with a chevron, held while the menu is open;
     folded, plain text (its language is picked unfolded). */
  [data-ge-editing] main .doc-code:is(${UNIT}):not(.doc-code--folded) .doc-code-language { display: inline-flex; align-items: center; gap: 2px; padding: 0 4px 0 6px; border-radius: 4px; cursor: pointer; transition: background .1s ease-in-out; }
  [data-ge-editing] main .doc-code:is(${UNIT}):not(.doc-code--folded) .doc-code-language::after { content: ""; width: 12px; height: 12px; background: currentColor; -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3.25 4.75 6 7.5l2.75-2.75' fill='none' stroke='black' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 12px no-repeat; mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 12 12'%3E%3Cpath d='M3.25 4.75 6 7.5l2.75-2.75' fill='none' stroke='black' stroke-width='1.3' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E") center / 12px no-repeat; }
  [data-ge-editing] main .doc-code:is(${UNIT}):not(.doc-code--folded) .doc-code-language:hover, [data-ge-editing] .doc-code[data-ge-menu] .doc-code-language { background: var(--doc-hover); }
  [data-ge-editing] .doc-code[data-ge-menu] > .doc-code-tools { opacity: 1; pointer-events: auto; }
`;

// A code block's code opened for editing, or null.
const openHost = (block) => codePre(block)?.querySelector(':scope > code[data-ge-kind="code"]') ?? null;

// The kit's code script (/kit/code.js) on a page served without it (a report with no code block
// yet): loaded when the page makes its first, so that block's header (arrow, language, buttons) shows
// at once, and its colors: those of the text it came with (a code block pasted) as soon as the script
// is there (colored), those typed as they are typed.
let colored = null; // (code element) => its text highlighted (create)
const loadKit = () => loadScript("/kit/code.js", () => globalThis.DocCode);

/**
 * A new code block: div.doc-code (the block) holding its title (a text block, empty: 代码块) and a
 * pre holding a code element (its text block) with this text; its language, when one was picked, and
 * the number its first line shows, when it is a copy of an excerpt numbered as in its file.
 */
export function newCode(doc, text = "", title = "", language = null, first = null) {
  const block = doc.createElement("div");
  block.className = "doc-code";
  // Framed like the code blocks of the file; its language is the one it looks like (自动识别) until
  // the reader picks one.
  for (const [name, value] of [["data-ge-new", ""], ["data-ge-type", "code"], ["data-ge-unit-kind", "code"], ["data-ge-frame", ""]]) block.setAttribute(name, value);
  if (language) block.setAttribute(LANGUAGE, language);
  if (first) block.setAttribute(LINE_START, String(first));
  const heading = doc.createElement("div");
  heading.className = "doc-code-title";
  for (const [name, value] of [["contenteditable", "true"], ["data-ge-new", ""], ["data-ge-kind", "codeTitle"], ["data-ge-caps", capsFor("codeTitle")], ["data-ge-framed", ""], ["spellcheck", "false"]]) heading.setAttribute(name, value);
  heading.textContent = title;
  const pre = doc.createElement("pre");
  const code = doc.createElement("code");
  for (const [name, value] of [["contenteditable", "true"], ["data-ge-new", ""], ["data-ge-kind", "code"], ["data-ge-caps", capsFor("code")], ["spellcheck", "false"]]) code.setAttribute(name, value);
  setCode(code, text);
  pre.append(code);
  block.append(heading, pre);
  // The header's arrow, language and buttons, as the kit draws them, and the colors of the text it
  // came with (a code block pasted): at once where the page has the kit's script, else once it came.
  if (globalThis.DocCode) {
    globalThis.DocCode.decorate(block);
    if (code.textContent.trim()) colored?.(code);
  } else if (doc === globalThis.document) loadKit().then((ok) => {
    if (!ok || !block.isConnected) return;
    globalThis.DocCode.decorate(block);
    if (code.textContent.trim()) colored?.(code);
  });
  syncGutter(code);
  return block;
}

/** A code block made again from the clipboard's description (its type's `build`, builders.mjs). */
export function build({ doc, block }) {
  return newCode(doc, block.text, block.title ?? "", block.language ?? null, block.lineStart ?? null);
}

/** A code block made of a block's text (its type's `create`), standing for that block: the caret goes into its code. */
export const make = ({ doc, text, put, stand }) => put(stand(newCode(doc, text))).querySelector(":scope > pre > code");

/** Whether a text block is a code block's title. */
export const isCodeTitle = (host) => host?.getAttribute("data-ge-kind") === "codeTitle";

/**
 * Editing code blocks, with what the editor gives it: the edit map, the baselines, the last
 * recorded content of each block, recordText (one step of typing), whether an input method is
 * composing, caretAtOffset (the caret after a number of characters of a block), look(element,
 * { classes, sizes, attributes }, select) (the editor's undoable change), say (the status line) and
 * closeTools() (what a press closes that opens over the page: the format bar, the "/" menu, the formula box).
 */
export function create({ map, baselines, lastKnown, recordText, isComposing, caretAtOffset, look, say, closeTools }) {
  addStyle(STYLE);
  // A new code block's text highlighted once the kit's script has come (newCode): no step of its own,
  // its last known content the highlighted one.
  colored = (code) => {
    highlight(code);
    lastKnown.set(code, ownHTML(code));
  };
  // A code block keeps the lines the kit highlighted until the reader clicks into it (openAt);
  // its baseline is its source text. The code block is its unit, the pre, which holds no text block
  // meanwhile: one written with no code element has the pre for its element, and what the kit drew
  // there is not its text.
  function prepare(block) {
    const pre = codePre(document.querySelector(`[data-ge-unit="${block.unit}"]`));
    if (!pre) return;
    if (!matchesSource(pre, block.inner)) {
      pre.setAttribute("data-ge-lock", "script");
      return;
    }
    pre.setAttribute("data-ge-code", String(block.id));
    pre.removeAttribute("data-ge-block");
    baselines.set(block.id, codeBaseline(block.inner));
  }

  // Open a code block for editing, with the caret where the reader pressed (or at its start).
  function openAt(pre, point = null) {
    const id = Number(pre.getAttribute("data-ge-code"));
    const block = map.blocks.find((entry) => entry.id === id);
    let offset = 0;
    const at = point && pointRange(point.x, point.y);
    if (at && pre.contains(at.startContainer)) {
      const probe = document.createRange();
      probe.selectNodeContents(pre);
      probe.setEnd(at.startContainer, at.startOffset);
      offset = probe.toString().length;
    }
    const host = openCode(pre, id, block.inner);
    host.focus({ preventScroll: true });
    const caret = document.createRange();
    caret.setStart(host.firstChild, Math.min(offset, host.firstChild.length - 1));
    select(caret);
    highlight(host);
    lastKnown.set(host, host.innerHTML);
    return host;
  }

  // The characters from a block's start to the caret, or null when the caret is elsewhere.
  function caretOffset(host) {
    const selection = getSelection();
    if (!selection.rangeCount || !host.contains(selection.anchorNode)) return null;
    const head = document.createRange();
    head.setStart(host, 0);
    head.setEnd(selection.anchorNode, selection.anchorOffset);
    return head.toString().length;
  }

  // A code block's colors while it is edited: the kit's highlighter (DocCode, when the report
  // has code blocks) draws its code again in its language (自动识别: the one it looks like now, shown
  // in its header), a span a line (LINE), the caret kept at the same character; its folds carried
  // over (carriedFolds) and marked on its lines. The line numbers follow either way.
  const drawnIn = new WeakMap(); // block -> the language it was last drawn in
  function highlight(host) {
    const pre = host.closest("pre");
    const block = host.closest(".doc-code");
    const kit = globalThis.DocCode;
    if (pre && block && kit && !isComposing()) {
      const text = codeText(host);
      const caret = caretOffset(host);
      const scratch = document.createElement("pre");
      const language = kit.languageOf(block, text);
      try {
        kit.drawLines(scratch, text, language);
        const lines = [...scratch.querySelectorAll(".doc-code-content")].map((content, index) => {
          const line = document.createElement("span");
          line.className = LINE;
          if (index > 0) line.append(document.createTextNode("\n"));
          line.append(...content.childNodes);
          return line;
        });
        const regions = kit.folds.regions(text, language);
        markFolds(lines, regions, carriedFolds(host, block, text, regions, caret));
        host.replaceChildren(...lines, document.createTextNode("\n"));
        if (caret !== null) caretAtOffset(host, caret);
        drawnIn.set(block, language);
      } catch {}
      kit.decorate(block);
    }
    syncGutter(host);
  }

  // The lines folded before a change, where they are now: a folded line's span keeps its place
  // through what the browser typed in the code, so the line it starts now is the one folded (code just
  // opened or made, with no spans yet, takes the block's data-folded-lines). Kept while the line
  // still starts a structure, and not when a line was made or joined with the caret inside its
  // structure (Enter or Backspace there opens it).
  function carriedFolds(host, block, text, regions, caret) {
    const kit = globalThis.DocCode;
    const lines = linesOf(host);
    let folded;
    if (lines.length === 0) folded = kit.folds.foldedLines(block.getAttribute(FOLDED_LINES));
    else {
      folded = new Set();
      let at = 0;
      for (const node of host.childNodes) {
        const own = node.textContent;
        if (node.nodeType === 1 && node.classList.contains(`${LINE}--folded`)) folded.add(at + Number(own.startsWith("\n")));
        at += own.split("\n").length - 1;
      }
    }
    const remade = lines.length > 0 && lines.length !== text.split("\n").length;
    return new Set([...folded].filter((line) => {
      const region = regions.get(line);
      return region && !(remade && caret !== null && caret >= region.from && caret <= region.to);
    }));
  }

  // Lines marked as their structure folds: those starting one, those folded, those a fold hides.
  function markFolds(lines, regions, folded) {
    const hidden = globalThis.DocCode.folds.hiddenLines(regions, folded);
    lines.forEach((line, index) => {
      line.classList.toggle(`${LINE}--foldable`, regions.has(index));
      line.classList.toggle(`${LINE}--folded`, folded.has(index));
      line.classList.toggle(`${LINE}--hidden`, hidden.has(index));
    });
  }

  // A code block drawn again in the language it has now (picked, undone, or 自动识别 after its
  // title changed): its open code by the editor, else its lines by the kit.
  function redraw(block) {
    const kit = globalThis.DocCode;
    if (!kit || !block.isConnected) return;
    const host = openHost(block);
    if (host) return highlight(host);
    const language = kit.languageOf(block);
    if (drawnIn.get(block) !== language) {
      kit.draw(block);
      drawnIn.set(block, language);
    }
    kit.decorate(block);
  }

  // Its folded lines changed (an arrow, undo, redo): its lines folded as they say, the kit's or (its
  // code open) the editor's; nothing when they already are (the open code's own lines wrote them).
  // The caret leaves the lines folded away, to the end of the line folding them.
  function refold(block) {
    const kit = globalThis.DocCode;
    if (!kit || !block.isConnected) return;
    const host = openHost(block);
    if (!host) return kit.fold(block);
    const lines = linesOf(host);
    if (lines.length === 0) return;
    const wanted = kit.folds.foldedLines(block.getAttribute(FOLDED_LINES));
    const now = lines.flatMap((line, index) => line.classList.contains(`${LINE}--folded`) ? [index] : []);
    if (now.length === wanted.size && now.every((line) => wanted.has(line))) return;
    const text = codeText(host);
    const regions = kit.folds.regions(text, kit.languageOf(block, text));
    markFolds(lines, regions, new Set([...wanted].filter((line) => regions.has(line))));
    const selection = getSelection();
    const inside = selection.rangeCount ? lines.find((line) => line.classList.contains(`${LINE}--hidden`) && line.contains(selection.anchorNode)) : null;
    if (inside) {
      let shown = lines.indexOf(inside);
      while (shown > 0 && lines[shown].classList.contains(`${LINE}--hidden`)) shown--;
      caretAtOffset(host, lines.slice(0, shown + 1).reduce((sum, line) => sum + line.textContent.length, 0));
    }
    lastKnown.set(host, host.innerHTML);
    syncGutter(host);
  }

  // Its language set or removed (the menu, undo, redo), or its title typed in: drawn again; its
  // folded lines: folded again.
  new MutationObserver((records) => {
    const changed = new Map();
    for (const { target, attributeName } of records) if (target.matches?.(".doc-code")) changed.set(target, (changed.get(target) ?? new Set()).add(attributeName));
    for (const [block, names] of changed) {
      if (names.has(LANGUAGE)) redraw(block);
      else refold(block);
    }
  }).observe(document.body, { subtree: true, attributes: true, attributeFilter: [LANGUAGE, FOLDED_LINES] });
  document.addEventListener("input", (event) => {
    const block = isCodeTitle(event.target) ? event.target.closest(".doc-code") : null;
    if (block && !codeLanguage(block) && !isComposing()) redraw(block);
  });
  document.addEventListener("compositionend", (event) => {
    const block = isCodeTitle(event.target) ? event.target.closest(".doc-code") : null;
    if (block && !codeLanguage(block)) redraw(block);
  });

  // Type into a code block: its text, a line break with the indentation of the line it breaks.
  function type(host, text) {
    const selection = getSelection();
    if (!selection.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (text === "\n") {
      const head = document.createRange();
      head.setStart(host, 0);
      head.setEnd(range.startContainer, range.startOffset);
      text += /[^\n]*$/.exec(head.toString())[0].match(/^[ \t]*/)[0];
    }
    range.deleteContents();
    // At the very end, a line break needs one after it for the browser to show the new line.
    const tail = document.createRange();
    tail.setStart(range.endContainer, range.endOffset);
    tail.setEnd(host, host.childNodes.length);
    const node = document.createTextNode(text.endsWith("\n") && tail.toString() === "" ? `${text}\n` : text);
    range.insertNode(node);
    range.setStart(node, text.length);
    range.collapse(true);
    select(range);
    highlight(host);
    recordText(host);
  }

  // A code block's code, opened for editing or not; null when it cannot be read (left to a script).
  // What copying a code block takes (its `clipboard.describe`).
  function textOf(unit) {
    const pre = codePre(unit) ?? unit;
    const host = pre.querySelector(':scope > code[data-ge-kind="code"]');
    if (host) return codeText(host);
    const block = pre.hasAttribute("data-ge-code") ? map.blocks.find((entry) => entry.id === Number(pre.getAttribute("data-ge-code"))) : null;
    if (!block) return null;
    const template = document.createElement("template");
    template.innerHTML = block.inner;
    return template.content.textContent;
  }

  // A click on a code block's fold arrow, wrap button or language (the kit's, in its header) while
  // the page is edited: the arrow and the button switch a class of the block's (doc-code--folded,
  // doc-code--nowrap), saved, one undo step, the kit's own click (a reading view's) not running;
  // the language opens the menu of languages. Returns whether it was one.
  function headerClick(event) {
    if (lineFoldClick(event)) return true;
    const button = event.target?.closest?.(".doc-code-fold, .doc-code-wrap, .doc-code-language");
    const block = button?.closest(".doc-code");
    if (!block || !block.closest("main") || !block.matches(UNIT)) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (button.matches(".doc-code-language")) {
      // Folded, its language is not picked: only unfolded.
      if (closedFrom !== button && !block.classList.contains(FOLDED)) openLanguages(block, button);
      closedFrom = null;
      return true;
    }
    const name = button.matches(".doc-code-fold") ? FOLDED : NOWRAP;
    const on = !block.classList.contains(name);
    // The caret leaves code that folds away, and so does its language menu.
    if (name === FOLDED && on && block.contains(document.activeElement)) document.activeElement.blur();
    if (name === FOLDED && on && block.hasAttribute("data-ge-menu")) menu.close();
    if (look(block, { classes: { [name]: on } })) {
      globalThis.DocCode?.decorate?.(block);
      say(t("{0} · Ctrl+Z 撤销", name === FOLDED ? (on ? t("已折叠代码块") : t("已展开代码块")) : (on ? t("代码已取消自动换行") : t("代码已自动换行"))));
    }
    return true;
  }

  // ---------- folding a line's structure ----------
  // The control a press or click is on, with its block and line: a line's arrow (the kit's in its
  // lines, the editor's in the open code's gutter) or the "…" after a folded line (the kit's, or the
  // one the open code's folded line shows after its text). Null for anything else.
  function lineFoldAt(event) {
    const target = event.target;
    const kit = target?.closest?.(".doc-code-line-fold, .doc-code-line-more");
    const gutter = !kit && target?.closest?.(".ge-code-fold");
    const more = !kit && !gutter && target?.matches?.(`.${LINE}--folded`) && pastText(target, event.clientX) ? target : null;
    const control = kit || gutter || more;
    const block = control?.closest(".doc-code");
    if (!block || !block.closest("main") || !block.matches(UNIT)) return null;
    const row = kit?.closest(".doc-code-line");
    const line = row ? [...row.parentElement.children].indexOf(row) : gutter ? Number(gutter.getAttribute("data-line")) : linesOf(more.parentElement).indexOf(more);
    return { block, line, unfold: Boolean(more) || control.matches(".doc-code-line-more") };
  }
  // Whether a point is past a line's text (on the "…" its ::after draws).
  function pastText(line, x) {
    const range = document.createRange();
    range.selectNodeContents(line);
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
    return rects.length > 0 && x >= rects[rects.length - 1].right - 1;
  }
  // A press on one moves no caret and opens no code; its click folds or unfolds the line, one undo step.
  document.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || !lineFoldAt(event)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
  function lineFoldClick(event) {
    const at = lineFoldAt(event);
    const kit = globalThis.DocCode;
    if (!at || !kit) return false;
    event.preventDefault();
    event.stopImmediatePropagation();
    const folded = kit.folds.foldedLines(at.block.getAttribute(FOLDED_LINES));
    const fold = !folded.has(at.line) && !at.unfold;
    if (fold) folded.add(at.line);
    else folded.delete(at.line);
    if (look(at.block, { attributes: { [FOLDED_LINES]: kit.folds.foldedValue(folded) } })) say(t("{0}第 {1} 行的代码结构 · Ctrl+Z 撤销", fold ? t("已折叠") : t("已展开"), at.line + 1));
    return true;
  }

  // ---------- its language ----------
  // The language label opens a menu below it: a search field, 自动识别
  // (the language the block looks like, shown beside it), then the kit's languages; the current one
  // checked. What is picked is the block's data-language (自动识别 removes it): one undo step, saved.
  const menu = createMenu();
  let closedFrom = null; // the label a press closed the menu from: its click does not open it again
  function openLanguages(block, label) {
    const kit = globalThis.DocCode;
    if (!kit) return;
    const own = codeLanguage(block);
    const detected = kit.languageName(kit.autoLanguage(block));
    const rows = (query) => {
      const typed = query.trim().toLowerCase();
      const found = (words) => !typed || words.toLowerCase().includes(typed);
      return [
        ...(found(t("自动识别 auto detect zidong zdsb")) ? [{ label: t("自动识别"), hint: detected, current: !own, run: () => pick(block, null) }, { separator: true }] : []),
        // Each by the name the kit's header gives it (纯文本 in the UI's language).
        ...kit.languages.filter((language) => found(`${language.name} ${language.words}`))
          .map((language) => ({ label: kit.languageName(language.id), current: Boolean(own) && kit.languageName(own) === kit.languageName(language.id), run: () => pick(block, language.id) })),
      ];
    };
    block.setAttribute("data-ge-menu", "");
    menu.open(rows(""), label.getBoundingClientRect(), {
      label: t("代码语言"), width: 220, height: 300, align: "end", icons: false, empty: t("没有找到这种语言"), showCurrent: true,
      search: { placeholder: t("搜索语言…"), filter: rows },
      onClose: () => block.removeAttribute("data-ge-menu"),
    });
  }
  function pick(block, language) {
    const kit = globalThis.DocCode;
    if (!block.isConnected || !look(block, { attributes: { [LANGUAGE]: language } })) return;
    say(t("{0} · Ctrl+Z 撤销", language ? t("代码语言：{0}", kit.languageName(language)) : t("代码语言：自动识别（{0}）", kit.languageName(kit.autoLanguage(block)))));
  }
  // A press elsewhere, scrolling the page, resizing or leaving the window closes the menu. Every press
  // says anew whether it closes it from its label: one whose click
  // never came to the label (released off it, of another button) says nothing of the next click.
  document.addEventListener("pointerdown", (event) => {
    const label = menu.isOpen ? event.target.closest?.(".doc-code-language") : null;
    closedFrom = label?.closest(".doc-code")?.hasAttribute("data-ge-menu") ? label : null;
    if (menu.isOpen && !menu.contains(event.target)) menu.close();
  }, true);
  addEventListener("scroll", (event) => { if (menu.isOpen && !menu.contains(event.target)) menu.close(); }, { passive: true, capture: true });
  addEventListener("resize", () => menu.close());
  addEventListener("blur", () => menu.close());

  // Enter in a code block's title: the caret goes into its code (opened, unfolded first), at its start.
  function titleEnter(host) {
    if (!isCodeTitle(host)) return false;
    const block = host.closest(".doc-code");
    if (block?.classList.contains(FOLDED)) {
      look(block, { classes: { [FOLDED]: false } });
      globalThis.DocCode?.decorate?.(block);
    }
    const pre = codePre(block);
    const open = pre?.querySelector(':scope > code[data-ge-kind="code"]');
    if (open) {
      open.focus({ preventScroll: true });
      const caret = document.createRange();
      caret.setStart(open.firstChild ?? open, 0);
      select(caret);
    } else if (pre?.hasAttribute("data-ge-code")) {
      const code = openAt(pre);
      const caret = document.createRange();
      caret.setStart(code.firstChild ?? code, 0);
      select(caret);
    }
    return true;
  }

  /**
   * A press on its lines (`press`): it opens for editing, the caret where the pointer was. True when
   * the press was its.
   */
  function press(event) {
    const pre = event.target.closest?.("main pre[data-ge-code]");
    if (!pre) return false;
    event.preventDefault();
    closeTools();
    openAt(pre, { x: event.clientX, y: event.clientY });
    return true;
  }

  return {
    create: make, prepare, openAt, type, textOf, press,
    /**
     * A code block someone else's write put on the page where it stands (page/pull/: the kit draws the page's code
     * blocks once, as it loads, and none put in later): its header and lines drawn as the kit draws them then, before
     * the editor prepares it (prepare), as at a load.
     */
    arrived(block) {
      if (!globalThis.DocCode) return;
      globalThis.DocCode.decorate(block);
      globalThis.DocCode.draw(block);
    },
    click: headerClick,
    /** What was typed in its code highlighted; a change of its text undone or redone, its line numbers. */
    typed(host) {
      if (isCode(host)) highlight(host);
    },
    afterText(host) {
      if (isCode(host)) syncGutter(host);
    },
    // Its keys: in its code Enter breaks the line, and Tab types two
    // spaces; Shift+Enter is Enter there as it is anywhere; Enter in its title goes into its code.
    keys: {
      enter({ host }) {
        if (!isCode(host)) return titleEnter(host);
        type(host, "\n");
        return true;
      },
      shiftEnter({ host, enter }) {
        if (!isCode(host)) return false;
        enter();
        return true;
      },
      tab({ host }, back) {
        if (back || !isCode(host)) return false;
        type(host, "  ");
        return true;
      },
    },
    /** A new one: its text highlighted, as what it last held. */
    onCreated(code) {
      highlight(code);
      lastKnown.set(code, ownHTML(code));
      return false;
    },
    /** Enter on it selected: opened, when it is one of the file's (a new one's code takes the caret as any text). */
    activate(unit) {
      const pre = unit.matches(".doc-code") ? unit.querySelector(":scope > pre[data-ge-code]") : null;
      if (pre) openAt(pre);
      return Boolean(pre);
    },
    /** A code block's row of the block menu once its frame has a height: 显示全部代码 (none for another block). */
    menuItems(target) {
      if (target?.getAttribute?.("data-ge-unit-kind") !== "code" || target.style.getPropertyValue(CODE_HEIGHT).trim() === "") return [];
      return [lookRow({ look, say }, target, { label: t("显示全部代码"), icon: ICONS.reset, change: { sizes: { [CODE_HEIGHT]: null } }, done: t("代码块已显示全部代码") })];
    },
    /** Whether a node is the language menu's (its keys are its own). */
    keepsKeys: (node) => menu.contains(node),
    /** The nodes to keep in the top layer when a modal dialog opens. */
    get nodes() { return menu.nodes; },
  };
}
