import { Z } from "../../shared/layers.mjs";
import { own } from "./overlays.mjs";
import { addStyle, element, mount } from "./ui.mjs";

// The pale field over what is typed for a menu that filters by it (--ge-field, with no outline: a
// 5.5px outline of the same color round it, which Chrome rounds to 6px corners, covered the characters
// beside what is typed and reached over the lines above and below, the user's of 2026-11-20): the "@" menu's (at-menu/) and
// the "/" menu's (slash-menu/), one look for both. A box for each line what is typed runs over, as wide
// as the text and as high as the text, never higher than the line it stands in (its line-height; 0.5px
// corners), and on the last one, where asked, a hint after it in the tertiary gray
// (链接到页面或块…, 输入以搜索), dropped where it would pass the block's right edge. It is drawn over the
// text, not in it: the block holds the characters typed and nothing else, so that an input method,
// offsets, undo and a commit know nothing of it. Painted again with nothing moved it writes nothing: in
// a detail card it stands among what the page's mutations are read from (frames.mjs).

const STYLE = `
  .ge-typed { position: fixed; left: 0; top: 0; z-index: ${Z.mark}; box-sizing: border-box; pointer-events: none; white-space: nowrap;
    border-radius: .5px; background: var(--ge-field); color: var(--ge-tx3); }
`;

/**
 * name: the class of its boxes (beside ge-typed: ge-at, ge-slash); kind: what owns them (overlays.mjs).
 * paint(range, host, hint): the field over `range` of `host`, `hint` (words, or null) after its last line;
 * returns the boxes of the range's lines (none: an empty list). clear(): nothing drawn. drawn: what it shows, as a key. nodes: its boxes.
 */
export function createTypedField(name, kind) {
  addStyle(STYLE);
  const marks = [];
  let drawn = ""; // what the field shows, as a key

  function clear() {
    marks.splice(0).forEach((mark) => mark.remove());
    drawn = "";
  }

  function paint(range, host, hint = null) {
    const rects = [...range.getClientRects()].filter((rect) => rect.width > 0);
    const { right } = host.getBoundingClientRect();
    const key = JSON.stringify([rects.map(({ left, top, width, height }) => [left, top, width, height]), hint, right]);
    if (key === drawn) return rects;
    clear();
    drawn = key;
    const { font } = getComputedStyle(host);
    // A line's own height: what its text's element sets (a text's box is its font's, which a tight line-height is under).
    const owner = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const line = parseFloat(getComputedStyle(owner ?? host).lineHeight); // "normal": NaN, the text's box stands
    rects.forEach((rect, index) => {
      const high = line > 0 ? Math.min(rect.height, line) : rect.height;
      const top = rect.top + (rect.height - high) / 2;
      const mark = mount(own(element("div", { class: `ge-typed ${name}` }), kind, { alive: () => marks.includes(mark) }));
      Object.assign(mark.style, { transform: `translate(${rect.left}px, ${top}px)`, height: `${high}px`, width: `${rect.width}px` });
      if (hint && index === rects.length - 1) {
        Object.assign(mark.style, { font, lineHeight: `${high}px`, paddingLeft: `${rect.width}px`, width: "" });
        mark.textContent = hint;
        if (rect.left + mark.offsetWidth > right) {
          mark.textContent = "";
          Object.assign(mark.style, { paddingLeft: "", width: `${rect.width}px` });
        }
      }
      marks.push(mark);
    });
    return rects;
  }

  return {
    paint, clear,
    /** What it shows, as a key: changed when it was drawn anew. */
    get drawn() { return drawn; },
    /** Its boxes, to keep in the top layer when a dialog opens. */
    get nodes() { return [...marks]; },
  };
}

/** Whether nothing follows `typed` in `host` (no words, no chip, no picture): only then is there room for a hint. */
export function nothingAfter(host, typed) {
  const rest = document.createRange();
  rest.selectNodeContents(host);
  rest.setStart(typed.endContainer, typed.endOffset);
  const held = rest.cloneContents();
  return held.textContent.trim() === "" && !held.querySelector("[data-ge-atom], img");
}
