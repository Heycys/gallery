import {
  UNIT, boxKind, can, emptyContainer, isEmpty, isFirstLine, isHost, limitText, mergeWithPrevious, nestedBlocks, nextLine, parentItem, previousLine, removalTarget, splitBlock, splitsAt, takeOut, textEnd, unitElement, newParagraphHost, withLeads,
} from "../core.mjs";
import { atEdge, caretAt, hosts, select, textNear } from "../caret.mjs";
import { convertible } from "../convert.mjs";
import { joinCode } from "../marks.mjs";
import { sideOf, WORD } from "../../../shared/inline-spacing.mjs";
import { createSpacing, needsSpace, writesTogether } from "./spaces.mjs";
import { pageOf, pagesAround } from "../page-objects.mjs";
import { BLOCK_TYPES, HOSTS, accepts, firstSaysOf, placeholderOf, textFilters, textTypeOf } from "../../components/registry.mjs";
import { unalign } from "../align.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// Typing in a block (docs/editor.md, "Browser side"): every key goes first to the component the block
// is of and to what stands around it, nearest first (`asked`), and only when none of them takes it to
// the rules of every block. Enter
// splits it, Backspace and Delete at its edges merge it with the block before or after, or remove it
// once empty, the caret going to the neighbouring block. Backspace in a container with nothing
// written in it (`removedEmpty`) or in an empty heading turns it into an empty paragraph. Chinese typed next to a Latin letter or
// digit gets a space between them (autoSpace; not a number and its unit, nor in a block written without), and an empty block under the caret says what it takes
// (placeholder). Plain typing and input methods stay with the browser; the keys are routed here by
// editor.mjs.

// Chinese next to Latin letters or digits gets a space between them as the reader types, where
// there is none yet: only around the text just typed (not in code or formulas, nor in a tab name).
// A number and the magnitude or measure word it goes with stay together (3.6亿, 5个, 2024年, 第3名,
// 3万5千), and a block written without such spaces is typed in its own way (none added). An edit
// that leaves such a space where no pair stands either side of it any more takes it out (spaces.mjs).
// The text blocks that say their placeholder whenever they are empty (HOSTS' `untitled`: the page's title).
const UNTITLED = Object.keys(HOSTS).filter((kind) => HOSTS[kind].untitled).map((kind) => `main [data-ge-kind="${kind}"]`).join(", ");
// ...and the blocks of a type that says so (`untitled` of `types`: a heading), found by
// their types' tags; a paragraph says its own only under the caret (data-ph-focus), and so does the text in a
// callout or a highlight, a paragraph there.
const UNTITLED_TAGS = [...new Set(Object.values(BLOCK_TYPES).filter((spec) => spec.untitled && !spec.className).map((spec) => spec.tag))];
const RESTING = [UNTITLED, ...UNTITLED_TAGS.map((tag) => `main ${tag}[contenteditable="true"]`)].filter(Boolean).join(", ");
const restingSays = (host) => {
  if (HOSTS[host.getAttribute("data-ge-kind")]?.untitled) return placeholderOf(host);
  const type = BLOCK_TYPES[textTypeOf(host)];
  return type?.untitled ? type.placeholder ?? null : null;
};
/** What Enter says where the caret stands in structure a block's words cannot hold (core.mjs splitsAt), or in a text block left without its marks. */
export const STRAY_SPLIT = () => t("这里的内容结构不完整，不能在这里换行：请撤销刚才的操作。");
// The block's own way with Chinese beside Latin letters and digits, from its text but what was just
// typed: true when it writes them together more often than apart (a number's unit is no sign either way).
function writtenTogether(host, node, start, end) {
  let text = "";
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  for (let each = walker.nextNode(); each; each = walker.nextNode()) {
    if (each.parentElement?.closest("code, [data-ge-atom]")) continue;
    text += each === node ? `${each.data.slice(0, start)}\n${each.data.slice(end)}` : each.data;
  }
  return writesTogether(text);
}

/**
 * struct(parents, touched, mutate): the editor's undoable structural change (history.mjs). say: the
 * status line. keepText(unit): why a block may not go (block-info.mjs). paragraphBefore(host): an
 * empty paragraph before the block, the caret staying (insert/). removeBlocks(units): the blocks
 * deleted as the selected ones are (selection/delete.mjs). adding(): the block the "/" menu the
 * handle's "+" opened is open in (slash-menu/), or null. leave: where Enter and Backspace leave a
 * container (leave.mjs). showHidden(node): the folds hiding a block opened (fold/ showAround).
 * look(element, change): the editor's undoable change of classes (a block's alignment, align.mjs).
 * afterAbove(host): Backspace at the start of a text block right after a block of no text, the caret
 * put after that block (after/ back); whether it was.
 */
export function createTyping({ struct, say, keepText, paragraphBefore, removeBlocks, selectBlock = () => {}, adding = () => null, leave, showHidden = () => {}, look = () => false, afterAbove = () => false }) {
  const spacing = createSpacing(); // the spaces autoSpace puts in, taken out where an edit strands them (spaces.mjs)
  // A key, asked of the component of the text block `host` and then of what stands around it, nearest
  // first (docs/editor.md, "The order of keys"): whether it was theirs. `ctx` holds what a key reads:
  // the block (`host`, an element) and `enter`, which splits it.
  function asked(key, host, ...rest) {
    const ctx = { host, enter: () => split(host) };
    return Boolean(key(pageOf(host)?.keys ?? {})?.(ctx, ...rest) || pagesAround(host).some((page) => key(page.keys?.around ?? {})?.(ctx, ...rest)));
  }

  // Enter in the page's title (HOSTS' `opensBody`): what is selected goes, what follows the caret leaves the title for a new paragraph right
  // below it, the first block of the page (an empty one at its end, a new untitled document's too), and
  // the caret goes to its start; the title keeps what stands before the caret, never a line break. One
  // undo step, the caret back in the title where it was. Below the title is the header's first line when it has one
  // (the paragraph goes before it, in the header), else the first block after the header.
  function enterBody(title) {
    const selection = getSelection();
    if (!selection.rangeCount || !title.contains(selection.getRangeAt(0).startContainer) || !title.contains(selection.getRangeAt(0).endContainer)) return;
    const range = selection.getRangeAt(0);
    const header = title.parentElement;
    let line = title.nextElementSibling;
    while (line && !line.matches(UNIT)) line = line.nextElementSibling;
    const [box, before] = line ? [header, withLeads(line)[0]] : [header.parentElement, header.nextSibling];
    const paragraph = newParagraphHost(document);
    if (!box?.hasAttribute("data-ge-box") || !accepts(box.getAttribute("data-ge-box-kind"), paragraph.getAttribute("data-ge-type"))) {
      say(limitText(title, "split"));
      return;
    }
    struct([...new Set([header, box])], [title], () => {
      range.deleteContents();
      const tail = document.createRange();
      tail.setStart(range.startContainer, range.startOffset);
      tail.setEnd(title, title.childNodes.length);
      const moved = tail.extractContents();
      if (moved.textContent.length > 0) paragraph.append(document.createTextNode(moved.textContent)); // the title's words, plain
      title.normalize();
      if (isEmpty(title)) title.replaceChildren();
      box.insertBefore(paragraph, before);
      return { touched: [title, paragraph], focus: paragraph };
    }, { caret: true });
    caretAt(paragraph, "start");
  }

  // Enter.
  function split(host) {
    if (HOSTS[host.getAttribute("data-ge-kind")]?.opensBody) return enterBody(host);
    // The caret at the very start of a block with text: an empty paragraph goes before the block and
    // the caret stays (a block that splits does this itself, splitBlock). Only hosts that opt in take
    // this rule; code keeps its own Enter, which breaks the line even at the start.
    const own = HOSTS[host.getAttribute("data-ge-kind")]?.opensBefore; // not a cell, a card's field, the title
    if (own && !can(host, "split") && !isEmpty(host) && atEdge(host, false) && paragraphBefore(host)) return;
    // Its component's Enter (a code block's line, a nested item out a level, a title going into its
    // content), that of what stands around it (a node's), then an empty block leaves its container
    // (leave.mjs: an empty item of a top-level list or an empty quote paragraph becomes a paragraph, as
    // in any editor, and so does the empty last paragraph of a panel), the rule of every block.
    if (asked((keys) => keys.enter, host) || leave.enter(host)) return;
    if (!can(host, "split")) {
      say(limitText(host, "split"));
      return;
    }
    const selection = getSelection();
    if (!selection.rangeCount || !host.contains(selection.getRangeAt(0).startContainer)) return;
    const range = selection.getRangeAt(0);
    // Only in the block's own words: a caret in structure inside them (an item, a list: core.mjs
    // strayIn), which the split would take along into the new block, splits nothing.
    if (!splitsAt(host, range)) {
      say(STRAY_SPLIT());
      return;
    }
    // A list item holding blocks splits carrying them (core.mjs splitBlock `carry`): the new
    // item right after it takes all it held, the caret at its start; the step records the item's
    // blocks leaving it and the new item holding them (created: empty before the step).
    const holds = nestedBlocks(host).length > 0;
    const result = struct([host.parentNode, ...(holds ? [host] : [])], [host], () => {
      spacing.split(host, range); // a space between Chinese and a Latin word where the line breaks: no pair beside it (spaces.mjs)
      const target = splitBlock(host, range, { carry: true });
      const created = target === host ? host.previousElementSibling : target;
      return { touched: [host, created], focus: target, created: holds && target !== host ? [target] : [] };
    });
    caretAt(result.focus, "start");
  }

  function merge(removed) {
    const into = previousLine(removed);
    if (!into) return false;
    const joint = textEnd(into);
    // A nested list the merge leaves empty goes from the item it hangs from.
    // An item holding blocks takes them under the line it joins.
    const parents = [...new Set([removed.parentNode, parentItem(removed), ...(nestedBlocks(removed).length > 0 ? [into, removed] : [])].filter(Boolean))];
    let joined = false;
    const result = struct(parents, [into, removed], () => {
      if (!mergeWithPrevious(removed)) return null;
      // Inline code meeting inline code at the join is one piece (marks.mjs joinCode), the caret at the join inside it.
      const caret = document.createRange();
      caret.setStart(into, joint);
      select(caret);
      joined = joinCode(into);
      return { touched: [into], focus: into };
    });
    if (!result) return false;
    if (joined) into.focus({ preventScroll: true });
    else caretAt(into, "start", joint);
    return true;
  }

  // Whether a block may not go (keepText): the reason said, a note that stays a while.
  function kept(node) {
    const reason = keepText(node);
    if (reason) say(reason, "note", 6000);
    return Boolean(reason);
  }

  // An empty container turned into an empty paragraph where it stands, the caret in it (the user's,
  // 2026-11-09: as an empty heading, an empty item and every other empty block go back to body text,
  // not away with the caret on the block before); one undo step, which brings the container back.
  // Where its box takes no paragraph it is deleted whole (one undo step, which selects it again), the
  // caret at the end of the block before it, or at the start of the one after it when it was first (a
  // formula block passed over: textNear).
  function removeContainer(container) {
    const box = container.parentElement;
    const paragraph = newParagraphHost(document);
    if (box && accepts(boxKind(box), paragraph.getAttribute("data-ge-type"))) {
      if (kept(container)) return true;
      const parts = withLeads(container);
      struct([box], [], () => {
        parts[0].before(paragraph);
        parts.forEach((part) => part.remove());
        return { touched: [paragraph], focus: paragraph };
      });
      caretAt(paragraph, "start");
      return true;
    }
    const list = hosts();
    const inside = list.filter((node) => container.contains(node));
    const before = textNear(inside[0], -1, list);
    const after = textNear(inside.at(-1), 1, list);
    removeBlocks([container]);
    if (container.isConnected) return true; // refused: the reason is said
    if (before?.isConnected) caretAt(before, "end");
    else if (after?.isConnected) caretAt(after, "start");
    return true;
  }

  // Delete a block with nothing left in it; the caret goes to the neighbouring block with text, a
  // formula block passed over (textNear).
  function removeHost(host, forward) {
    if (!can(host, "remove")) {
      say(limitText(host, "remove"));
      return true;
    }
    const list = hosts();
    const next = textNear(host, 1, list);
    const previous = textNear(host, -1, list);
    const [target, where] = forward
      ? (next ? [next, "start"] : [previous, "end"])
      : (previous ? [previous, "end"] : [next, "start"]);
    const node = removalTarget(host);
    if (kept(node)) return true;
    struct([node.parentNode], [host], () => {
      takeOut(node);
      return { touched: [], focus: target };
    });
    if (target) caretAt(target, where);
    return true;
  }

  // A block on the line above or below that a folded heading hides (fold/: data-ge-folded on it or
  // around it): its fold opens first, so a join never takes in words out of sight.
  const opened = (line) => {
    if (line?.closest?.("[data-ge-folded]")) showHidden(line);
  };

  // Backspace at the start of a block. Returns whether it was handled.
  function backspace(host) {
    opened(previousLine(host));
    // A paragraph's or a heading's alignment, then its indent a level at a time, goes before anything
    // else, one undo step each (align.mjs unalign: 退对齐, then 反缩进, before a join).
    if (unalign(host, look)) return true;
    // The block's component (a list item's: a nested item moves out a level, the first or last item of
    // a top-level list leaves it as body text, an emptied item holding lists stays), then what stands
    // around it (the item a block stands under; a node, at the start of its first line, holding
    // something: nothing but the caret moves). Before a container with nothing written in it goes: an
    // empty item in one leaves its list first, one Backspace at a time.
    if (asked((keys) => keys.backspace, host)) return true;
    const container = emptyContainer(host);
    if (container) return removeContainer(container);
    if (leave.backspace(host)) return true;
    // An empty heading (or small text) is an empty paragraph, where it stands (leave.mjs emptied).
    if (leave.emptied(host)) return true;
    // Right after a block of no text (a picture, a table, a code block, a callout, a divider, a card…):
    // the caret after it, at its bottom right (after/), an empty block going (the user's, 2026-11-09:
    // Backspace there went into the block, or past a picture to the text before it); never a join.
    if (afterAbove(host)) return true;
    if (isEmpty(host)) return removeHost(host, false);
    if (merge(host)) return true;
    // A block holding blocks that did not join the line above says why, as its component puts it.
    const refused = nestedBlocks(host).length > 0 && isHost(previousLine(host)) ? pageOf(host)?.mergeRefused?.(host) : null;
    if (refused) {
      say(refused);
      return true;
    }
    // The block above holds no text to join (a divider, a code block, a highlight block, a card…):
    // Backspace selects it, and Backspace again deletes it as a selected block.
    const above = previousLine(host);
    const unit = above && !isHost(above) ? unitElement(above) : null;
    if (unit?.closest("main") && !unit.contains(host)) {
      selectBlock(unit);
      return true;
    }
    if (!can(host, "merge") && isHost(host.previousElementSibling)) say(limitText(host, "merge"));
    return false;
  }

  // Delete at the end of a block. Returns whether it was handled.
  function forwardDelete(host) {
    opened(nextLine(host));
    // Its component (an empty item holding blocks stays), then what stands around it (at the end of a
    // node's last block nothing is taken in).
    if (asked((keys) => keys.delete, host)) return true;
    // A node's first line is never deleted (its first block is its title): the block after it joins it.
    if (isEmpty(host) && !isFirstLine(host)) return removeHost(host, true);
    // The block on the next line: the first item a list item holds, the block after it, or after
    // the last item of a list the block after the list (joined to the item, as Backspace there does).
    const next = nextLine(host);
    if (isHost(next) && previousLine(next) === host && merge(next)) return true;
    return nestedBlocks(host).length > 0; // the browser would delete the blocks after the text
  }

  function autoSpace(host, typed) {
    if (!typed || !textFilters(host)) return;
    const selection = getSelection();
    if (!selection.rangeCount || !selection.isCollapsed) return;
    const node = selection.anchorNode;
    if (node?.nodeType !== 3 || !host.contains(node) || node.parentElement.closest("code, [data-ge-atom]")) return;
    const end = selection.anchorOffset;
    const start = end - typed.length;
    if (start < 0 || node.data.slice(start, end) !== typed) return;
    const atStart = start === 0;
    const atEnd = end === node.length;
    let caret = end;
    const together = writtenTogether(host, node, start, end);
    for (let at = Math.min(end, node.length - 1); at >= Math.max(1, start) && !together; at--) {
      if (!needsSpace(node.data[at - 1], node.data[at], node.data[at - 2])) continue;
      node.insertData(at, " ");
      if (at < end) caret++;
    }
    // Words typed right beside inline code or a formula: a space between them (there is none yet,
    // the text there being the typed text's own); punctuation takes none.
    if (atStart && WORD.test(node.data[0]) && sideOf(node, false) === true) {
      node.insertData(0, " ");
      caret++;
    }
    if (atEnd && WORD.test(node.data.at(-1)) && sideOf(node, true) === true) node.appendData(" ");
    if (node.data.slice(start, caret) === typed && caret === end) return;
    const range = document.createRange();
    range.setStart(node, caret);
    range.collapse(true);
    select(range);
  }

  // The empty block under the caret says what it takes; a block of a type that says `placeholder: false`
  // says nothing (a list item: its marker says it already, and a hint beside a number or a checkbox only
  // stood in the way); a first line that says what it is (`firstSays`) says that, turned into no other type.
  // While the "/" menu the handle's "+" opened is open in it, nothing typed yet, it says 输入以筛选…
  // on the pale field of what the menu filters by (data-ge-adding, editor.mjs); such a block says
  // nothing then either.
  let placeholder = null;
  function updatePlaceholder(host) {
    const own = host ? BLOCK_TYPES[textTypeOf(host)]?.placeholder : undefined;
    const says = Boolean(host) && own !== false;
    const add = says && isEmpty(host) && adding() === host;
    const hint = !host || !isEmpty(host) ? null
      : (add ? t("输入以筛选…") : null)
          ?? placeholderOf(host)
          ?? (isFirstLine(host) ? firstSaysOf(boxKind(host.parentElement)) : null)
          ?? (convertible(host) && says ? own ?? t("输入 / 选择类型") : null);
    if (placeholder && placeholder !== host) {
      placeholder.removeAttribute("data-ge-placeholder");
      placeholder.removeAttribute("data-ge-adding");
    }
    placeholder = hint ? host : null;
    if (hint) host.setAttribute("data-ge-placeholder", hint);
    else host?.removeAttribute("data-ge-placeholder");
    host?.toggleAttribute("data-ge-adding", add);
    untitled();
  }

  // The page's title says 未命名文档 whenever it is empty, the caret in it or not (HOSTS' `untitled`),
  // and so do an empty heading (标题 1…4) and a disclosure's
  // title (RESTING; until 2026-11-17 only under the caret, a blank bar or an arrow
  // alone at rest); asked again on every move of the caret and every input, so an undo, a deletion across
  // blocks and the workbench's renaming are followed too. The block under the caret says what
  // updatePlaceholder gave it.
  function untitled() {
    if (!RESTING) return;
    for (const host of document.querySelectorAll(RESTING)) {
      if (!isHost(host) || host === placeholder) continue;
      const says = restingSays(host);
      if (says && isEmpty(host)) {
        if (host.getAttribute("data-ge-placeholder") !== says) host.setAttribute("data-ge-placeholder", says);
      } else if (host.hasAttribute("data-ge-placeholder")) host.removeAttribute("data-ge-placeholder");
    }
  }

  return {
    split, backspace, forwardDelete, autoSpace, updatePlaceholder, untitled,
    /** The spaces an edit strands (spaces.mjs createSpacing): before(host, kind) as it begins, after(host, kind, data) once done, before its step is recorded. */
    spaces: spacing,
    /** Tab (`back`: Shift+Tab). Whether the key was taken. */
    tab: (host, back) => asked((keys) => keys.tab, host, back),
    /** Ctrl+Enter. Whether the key was taken. */
    commandEnter: (host) => asked((keys) => keys.commandEnter, host),
    /** Shift+Enter. Whether the key was taken (else a line break, the browser's). */
    shiftEnter: (host) => asked((keys) => keys.shiftEnter, host),
    /** Esc. Whether the key was taken (else it selects the block around the text). */
    escape: (host) => asked((keys) => keys.escape, host),
  };
}
