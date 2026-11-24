import { IN_LAYER } from "../../../shared/layers.mjs";
import { DIALOG } from "../../components/kit.mjs";
import { atomOf, besideLine, caretRect, editable, nearestOnLine, pointRange, select } from "../caret.mjs";
import { can, ownHTML } from "../core.mjs";
import { edgeScroll } from "../edge-scroll.mjs";
import { task } from "../frames.mjs";
import { readPages } from "../links/pages.mjs";
import { pageChip } from "../links/views.mjs";
import { drawBox, layerOf } from "../overlay-layer.mjs";
import { note, own } from "../overlays.mjs";
import { addStyle, element } from "../ui.mjs";

// A page of the workbench's sidebar dragged into the document (docs/editor.md, "Dropping a page from
// the sidebar"): the workbench keeps the drag (its rows are its own, and the frame takes no pointer
// while one is dragged), and tells the page where the pointer is over it by the session's command
// `drop-page` (session.mjs; docs/workbench.md), in the frame's coordinates:
//
//   over   the place under the pointer shown by a drop caret, a thin blue bar where the page block
//          would go; the page scrolls by its window's top and bottom edges as for a drag of blocks
//          (edge-scroll.mjs), the caret following.
//   drop   a page block of that page there: the one "@" puts for it (links/views.mjs pageChip, from
//          the list "@" reads, links/pages.mjs), the caret after it, one undo step.
//   leave  the caret goes (the pointer left the frame, Esc, the drag cancelled).
//
// Where it goes is where the caret would go under the pointer, in a text block that takes links (as
// "@" opens only there: a paragraph, a heading, a list item, a cell, a caption; not a title or code):
// on its words the place between the characters there; beside its lines (right of a line that ends
// early, past the column's edge at that height) the nearest place on the nearest line, so dropped
// past a block's words it goes at their end; a chip of the text is taken whole (the side of its
// middle the pointer is on), and so are a link and inline code, which hold no page block. Anywhere
// else (between blocks further than a few pixels from one, over a picture, a table's edge, the
// title, a block the editor does not edit) there is no caret and a drop does nothing. A page "@"
// cannot link (not in its list: a web link, a draft of another workspace, the trash) is never
// dropped; this page itself is, as "@" lists it.

const STYLE = `
  .ge-page-drop { z-index: ${IN_LAYER.drop}; border-radius: 1px; background: var(--ge-focus); pointer-events: none; }
  .ge-page-drop[hidden] { display: none; }
`;

const NEAR = 8; // px above or below a text block the pointer may be for the caret to go into it (the gap between two blocks)

/**
 * editing(): whether the page edits. page(): this page, as readPages takes it. recordStep(host,
 * before): an undoable change of a block's text (history.mjs). closeTyped(): the "/" and "@" menus
 * let go of what is typed for them (they hold commits back). typed(host): its placeholder and what
 * follows the text looked at again (typing/).
 */
export function createPageDrop({ editing, page, recordStep, closeTyped, typed = () => {} }) {
  addStyle(STYLE);
  let hover = null; // { x, y, slug, list: the pages "@" lists (a promise), found: that list once read }
  let caret = null; // the drop caret drawn

  // The text block at (x, y) that takes a page block and where in it, as a collapsed range, or null.
  function placeAt(x, y) {
    let found = textAt(x, y);
    if (!found) {
      // Past the column's edge (the margins beside a block): the block at that height.
      const column = document.querySelector(DIALOG.openContent) ?? document.querySelector("main");
      const box = column?.getBoundingClientRect();
      if (box && (x < box.left || x > box.right)) found = textAt(Math.min(Math.max(x, box.left + 1), box.right - 1), y, x);
    }
    return found;
  }

  // The place at (x, y), the probe at (px, y) finding the block (`x` the pointer's, for the line).
  function textAt(px, y, x = px) {
    const at = pointRange(px, y);
    const host = at && takes(editable(at.startContainer));
    if (!host) return null;
    const box = host.getBoundingClientRect();
    if (y < box.top - NEAR || y > box.bottom + NEAR) return null; // the browser's nearest place, far from the pointer (a picture's caption)
    // On the block (its words, or beside a line of them): where the browser puts the caret there, or
    // where that line is nearest when the browser gets that wrong (caret.mjs besideLine); above or
    // below it, or found past the column's edge, the nearest place on its nearest line.
    const under = document.elementFromPoint(px, y);
    const on = px === x && under && editable(under) === host && y >= box.top && y <= box.bottom;
    const range = on ? besideLine(host, x, y) ?? at : nearestOnLine(host, x, Math.min(Math.max(y, box.top + 1), box.bottom - 1)) ?? at;
    if (!host.contains(range.startContainer)) return null;
    range.collapse(true);
    whole(range, host, x);
    return { host, range };
  }

  // A text block that takes a page block, or null.
  const takes = (host) => (host && host.isConnected && can(host, "links") ? host : null);

  // A place inside what a page block cannot stand in (a chip of the text, a link, inline code) moved
  // out of it: before it when the place (or for a chip the pointer) is in its first half, else after.
  function whole(range, host, x) {
    const atom = atomOf(range.startContainer);
    if (atom && host.contains(atom)) {
      const { left, right } = atom.getBoundingClientRect();
      return beside(range, atom, x > (left + right) / 2);
    }
    const start = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
    const inside = start?.closest("a, code");
    if (!inside || !host.contains(inside) || inside === host) return;
    const before = document.createRange();
    before.selectNodeContents(inside);
    before.setEnd(range.startContainer, range.startOffset);
    beside(range, inside, before.toString().length * 2 >= inside.textContent.length);
  }

  function beside(range, node, after) {
    if (after) range.setStartAfter(node);
    else range.setStartBefore(node);
    range.collapse(true);
  }

  // The drop caret where `place` is, or none.
  function draw(place) {
    if (!place) return void caret?.setAttribute("hidden", "");
    const rect = caretRect(place.range);
    if (!rect) return void caret?.setAttribute("hidden", "");
    const line = parseFloat(getComputedStyle(place.host).lineHeight) || rect.bottom - rect.top;
    const height = Math.min(rect.bottom - rect.top || line, line * 1.5);
    if (!caret) {
      caret = element("div", { class: "ge-page-drop", "data-doc-dev": "" });
      const mine = caret;
      own(mine, "page drop", { alive: () => caret === mine && hover !== null });
    }
    caret.removeAttribute("hidden");
    drawBox(caret, layerOf(place.host), { left: rect.left - 1, right: rect.left + 1, top: rect.top, bottom: rect.top + height });
  }

  function leave() {
    hover = null;
    caret?.remove();
    caret = null;
  }

  // While it is over the page: near the window's edges the page scrolls (a detail card's content, in
  // one), and the caret follows what moves under the pointer.
  const follow = task("page drop", {
    run() {
      if (!hover || !editing()) {
        leave();
        return false;
      }
      edgeScroll(hover.x, hover.y, document.querySelector(DIALOG.openContent));
      draw(linkable(hover) ? placeAt(hover.x, hover.y) : null);
      return true;
    },
    fail: leave,
  });

  // Whether the page dragged is one "@" lists: true until its list is read (a moment), then by it.
  const linkable = (state) => !state.found || state.found.pages.some(({ slug }) => slug === state.slug);

  function over(x, y, slug) {
    if (!hover || hover.slug !== slug) {
      const state = { x, y, slug, list: readPages(page()), found: null };
      state.list.then((list) => {
        state.found = list ?? { pages: [] };
      });
      hover = state;
      note("drag", `page ${slug} over`);
    }
    Object.assign(hover, { x, y });
    follow.wake();
    return Boolean(placeAt(x, y)) && linkable(hover);
  }

  async function drop(x, y, slug) {
    const list = hover?.slug === slug ? hover.list : readPages(page());
    leave();
    const chosen = (await list)?.pages.find((one) => one.slug === slug) ?? null;
    if (!chosen || !editing()) return false;
    const place = placeAt(x, y);
    if (!place) return false;
    closeTyped(); // a menu standing elsewhere lets go of what is typed for it, which holds commits back
    const { host, range } = place;
    const before = ownHTML(host);
    const chip = pageChip(chosen);
    range.insertNode(chip);
    const after = document.createRange();
    after.setStartAfter(chip);
    after.collapse(true);
    window.focus();
    host.focus({ preventScroll: true });
    select(after);
    recordStep(host, before);
    typed(host);
    note("drag", `page ${slug} dropped`);
    return true;
  }

  return {
    /** The session's `drop-page` ({ phase, x, y, page }): its reply's fields. */
    async command({ phase, x, y, page: slug }) {
      if (phase === "leave") {
        leave();
        return { ok: true };
      }
      if (!editing()) {
        leave();
        return { ok: false, reason: "editing" };
      }
      if (!Number.isFinite(x) || !Number.isFinite(y) || typeof slug !== "string" || !slug) return { ok: false, reason: "place" };
      if (phase === "over") return { ok: true, takes: over(x, y, slug) };
      if (phase === "drop") return { ok: true, placed: await drop(x, y, slug) };
      return { ok: false, reason: "phase" };
    },
  };
}
