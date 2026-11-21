import { t } from "../../../shared/i18n/index.mjs";
import { hostOf, select } from "../caret.mjs";
import { bareAddress } from "../clipboard/import/read.mjs";
import { can, ownHTML } from "../core.mjs";
import { FOLLOW, task } from "../frames.mjs";
import { addressOf, typedHref } from "../links/address.mjs";
import { findPages, pageRows, placeIn, readPages } from "../links/pages.mjs";
import { pageChip } from "../links/views.mjs";
import { rangeAt, rangeOffsets } from "../marks.mjs";
import { createMenu } from "../menu.mjs";
import { createTypedField, nothingAfter } from "../typed-field.mjs";

// The "@" menu (docs/editor.md, "Links"), a mention of a page: "@" or
// "＠" typed at the block's start, after a space, ( ) [ ], a character no Latin word or address has
// or a whole in the text (so "a@b" opens nothing, and as for "/" Chinese before it does), wherever the
// text takes links (a cell's does; a code block's and a title's do not) and not in inline code or a
// link. Only one typed opens it: a plain "@" stays plain whatever is deleted after it. Over what is
// typed lies a pale field with 链接到页面或块… in it (--ge-field, hugging
// the text: typed-field.mjs), the hint going with the first letter, an input method's too, where words follow the
// caret and where it would pass the block's edge (a narrow cell). It is drawn over the text, not in it:
// the block holds the characters typed and nothing else, so that an input method, offsets, undo and a
// commit know nothing of it, and it follows the page as what stands over blocks does (frames.mjs: a
// table laid out again in a frame of its own moves the "@"). Under it stand the pages
// (links/pages.mjs), at once and then as they are found; an address of one is the first row.
//
// Enter or Tab with words typed takes the first row, ↑/↓ another, a click any: a page block in place of
// the "@…", all of what is typed wherever the caret is in it, one undo step back to it. Enter with
// nothing typed or no row leaves a plain "@" and is an ordinary Enter, whatever row the pointer rests
// on (only the keys choose one then). A press elsewhere, Esc, the caret leaving what is typed, the
// workbench taking the focus or a space right after the "@" do too: the text stays, and is any other text.
//
// It gives up by one rule: what was committed less what had been committed when something was last
// found comes to 2 (a first character finding nothing goes on, a second gives up, a typing slip
// after a hit does not). An input method's letters filter but are not committed yet and do not
// count, and a commit of two characters finding nothing gives up at once. What may become an address is
// no miss. No page is made here (a page block's own box does that). While it stands nothing is committed
// (editor.mjs blocked), so the file never holds half of it; the crash buffer can bring back plain
// words, as what a press elsewhere leaves.

/** The characters that open the menu. */
export const AT = new Set(["@", "＠"]);

// What a query may be on its way to, or have begun with, to be an address (or a workbench's hash): no miss.
const ADDRESSES = ["http://", "https://", "127.0.0.1", "localhost"];
const mayBeAddress = (text) => text.startsWith("#") || ADDRESSES.some((start) => start.startsWith(text) || text.startsWith(start));

// The list when it cannot be read: nothing to find.
const NO_LIST = { pages: [], links: new Map() };

/** The page `text` is an address of in `list` (pages.mjs placeIn), as a link card reads what is typed. */
const placeOf = (list, text) => placeIn(list, text.startsWith("#") ? text : typedHref(text) ?? text);

/**
 * composing(): whether an input method is composing (editor.mjs). page(): this page, as readPages
 * takes it. recordText(host) and recordStep(host, before): undoable changes of a block's text (history.mjs).
 * over(): it closed, before a page chosen goes in (typing/spaces.mjs settles a "＠" after both).
 */
export function createAtMenu({ composing, page, recordText, recordStep, over = () => {} }) {
  const menu = createMenu();
  const typedField = createTypedField("ge-at", "at field"); // the field over what is typed (typed-field.mjs)
  let opened = null; // { host, at: where the "@" is (a character offset), after: how much of the block's text follows what is typed, hit: what had been committed when something was last found, list }

  const caretOffset = (host) => {
    const selection = getSelection();
    return selection.rangeCount && selection.isCollapsed && host.contains(selection.anchorNode) ? rangeOffsets(host, selection.getRangeAt(0))[1] : null;
  };

  // How long the block's text is, in the offsets of marks.mjs.
  const lengthOf = (host) => {
    const all = document.createRange();
    all.selectNodeContents(host);
    return rangeOffsets(host, all)[1];
  };

  // Where what is typed ends.
  const endOf = (state) => lengthOf(state.host) - state.after;

  // The "@…" typed, as a range of the block, or null when it is not there any more: up to the caret,
  // or with `whole` all of it, the caret anywhere in it.
  function typedRange(state, whole = false) {
    const caret = caretOffset(state.host);
    if (caret === null || caret <= state.at) return null;
    const range = rangeAt(state.host, [state.at, whole ? Math.max(caret, endOf(state)) : caret]);
    return AT.has(range.toString()[0]) ? range : null;
  }

  // Whether something may start with "@" at character `at` of the block.
  function startsHere(host, at) {
    if (at === 0) return true;
    const before = rangeAt(host, [at - 1, at]);
    return Boolean(before.cloneContents().querySelector("[data-ge-atom]")) || /^$|[\s()[\]]|[^\x00-\x7f]/.test(before.toString());
  }

  const clear = () => typedField.clear();

  // The field over what is typed, the hint after a lone "@" where it stays within the block; a box for
  // each line it runs over. Returns the boxes, or null. Looked at again with nothing moved, it writes
  // nothing: in a detail card it stands among what the page's mutations are read from (frames.mjs).
  function paint() {
    const typed = opened && typedRange(opened, true);
    if (!typed) {
      clear();
      return null;
    }
    const hint = typed.toString().length === 1 && !composing() && nothingAfter(opened.host, typed);
    return typedField.paint(typed, opened.host, hint ? t("链接到页面或块…") : null);
  }

  // The field and the rows stand on what is typed again, the page having moved under them.
  function follow() {
    const was = typedField.drawn;
    const rects = opened ? paint() : null;
    if (rects?.length && typedField.drawn !== was) menu.follow(anchorOf(rects));
  }

  const field = task("at field", {
    run() {
      if (!opened) return false;
      follow();
      return FOLLOW;
    },
    fail: clear,
  });

  function finish() {
    opened = null;
    clear();
    field.wake();
    over(); // closed, before a page chosen goes in (typing/spaces.mjs settles a "＠" after both)
  }

  // Closes it, whatever is typed staying as it is (the menu's own onClose: finish).
  const close = () => {
    if (menu.isOpen) menu.close();
    else if (opened) finish();
  };

  // The rows of what is typed: an address's page first, then what the search finds.
  function found(state, query) {
    const hits = findPages(state.list.pages, query);
    const place = query ? placeOf(state.list, query) : null;
    return place ? [place, ...hits.filter(({ slug }) => slug !== place.slug)] : hits;
  }

  // Where the rows stand, by the field's boxes: under its last line, at the "@".
  const anchorOf = (rects) => ({ left: rects[0].left - 4, top: rects.at(-1).top, bottom: rects.at(-1).bottom });

  // The "@…" typed goes, then: a page block in its place, the caret after it, one undo step.
  function choose(state, chosen) {
    const typed = state.host.isConnected ? typedRange(state, true) : null;
    if (!typed) return;
    const before = ownHTML(state.host);
    const chip = pageChip(chosen);
    typed.deleteContents();
    typed.insertNode(chip);
    const after = document.createRange();
    after.setStartAfter(chip);
    after.collapse(true);
    select(after);
    recordStep(state.host, before);
  }

  // The field and rows follow what is typed; `counts`: it changed by the reader's typing, which
  // the rule of giving up goes by.
  function refresh(counts) {
    const state = opened;
    const typed = typedRange(state);
    if (!typed) return close();
    const written = typed.toString().slice(1).replace(/ /g, " ");
    if (/^\s/.test(written)) return close(); // a space right after it is no search
    const query = composing() ? written.replace(/['\s]/g, "") : written.trim();
    const rows = state.list ? found(state, query) : [];
    if (counts && state.list && !composing()) {
      const count = [...query].length;
      if (rows.length > 0 || mayBeAddress(query.toLowerCase())) state.hit = count;
      else if (count - state.hit >= 2) return close();
    }
    const rects = paint();
    if (!state.list || !rects?.length) return;
    const items = pageRows(rows, (chosen) => choose(state, chosen));
    if (menu.isOpen) menu.update(items, anchorOf(rects), { first: Boolean(query) });
    else menu.open(items, anchorOf(rects), { label: t("链接到页面"), empty: t("没有结果"), width: 240, gap: 8, highlight: Boolean(query), onClose: finish });
  }

  return {
    /** `data` typed in `host`, `before` the caret: the menu opens when it ends with an "@" that may start one. Returns whether it opened. */
    typed(host, before, data) {
      if (opened || !AT.has(data?.at(-1)) || !AT.has(before.at(-1)) || !can(host, "links")) return false;
      const caret = caretOffset(host);
      if (caret === null || !startsHere(host, caret - 1)) return false;
      const { anchorNode } = getSelection();
      const inside = (anchorNode.nodeType === 1 ? anchorNode : anchorNode.parentElement).closest("code, a");
      if (inside && host.contains(inside)) return false;
      const state = { host, at: caret - 1, after: lengthOf(host) - caret, hit: 0, list: null };
      opened = state;
      paint();
      field.wake();
      readPages(page()).then((list) => {
        state.list = list ?? NO_LIST;
        if (opened === state) refresh(true);
      });
      return true;
    },
    /** The reader typed in the block (an input method's letters too). */
    update() {
      if (!opened) return;
      if (!opened.host.isConnected) return close();
      refresh(true);
    },
    /** The selection moved: out of what is typed it closes, within it the rows follow the caret. */
    moved() {
      if (!opened) return;
      const caret = caretOffset(opened.host);
      const end = endOf(opened);
      if (caret === null || caret <= opened.at || caret > end) close();
      else if (caret !== end) refresh(false);
    },
    /** The page moved under it, or the hint is to go: the field is drawn again, the rows follow. */
    follow,
    close,
    /**
     * Keys while it stands, in its block: true when handled. Enter or Tab with nothing to take, or
     * nothing typed and no row the keys moved to, leaves a plain "@" and goes on as itself.
     */
    key(event) {
      if (!opened || hostOf(event) !== opened.host || event.isComposing || event.keyCode === 229) return false;
      if (menu.isOpen && menu.arrow(event)) {
        event.preventDefault();
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        const nothingTyped = typedRange(opened, true)?.toString().length === 1;
        if (menu.isOpen && menu.hasChoice && !(nothingTyped && menu.pointed)) {
          menu.choose();
          event.preventDefault();
          return true;
        }
        close();
        return false;
      }
      if (event.key !== "Escape") return false;
      close();
      event.preventDefault();
      return true;
    },
    /**
     * A paste while it stands, three ways: the address of a page or a block is a page block in place
     * of the "@…" (true: it is done); a web address goes in by the ordinary paste in place of the
     * "@…", with its views; anything else by the ordinary paste after it, the "@…" plain text.
     */
    paste(event) {
      const state = opened;
      if (!state) return false;
      close();
      if (hostOf(event) !== state.host) return false;
      const data = event.clipboardData;
      const text = (data?.getData("text/plain") ?? "").trim();
      const chosen = text && state.list ? placeOf(state.list, text) : null;
      if (chosen) {
        event.preventDefault();
        choose(state, chosen);
        return true;
      }
      const typed = data && (bareAddress(data) ?? addressOf(text)) ? typedRange(state, true) : null;
      if (typed) {
        typed.deleteContents();
        recordText(state.host);
        select(typed);
      }
      return false;
    },
    /** The block it stands in, or null. */
    get host() { return opened?.host ?? null; },
    contains: (node) => menu.contains(node),
    /** What to keep in the top layer when a dialog opens. */
    get nodes() { return [...menu.nodes, ...typedField.nodes]; },
  };
}
