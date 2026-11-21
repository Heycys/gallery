import { Z } from "../../../shared/layers.mjs";
import { DIALOG } from "../../components/kit.mjs";
import { withLeads } from "../core.mjs";
import { own } from "../overlays.mjs";
import { element, mount, still } from "../ui.mjs";

// The picture of the blocks being dragged (docs/editor.md, "Moving blocks"): a copy of
// each, faded, where it stands on the page when the drag starts, moving with the pointer by as much
// as the pointer moves. The copies live in a shadow root of their own, so nothing of the page ever
// meets them: not the editor's map and the commit's scans, not the kit's scripts, not the page's ids
// (theirs stay theirs, a chart's gradients among them). The page's own rules are brought in as one
// stylesheet (made once, applied at once: no unstyled first frame), and each copy stands in a frame
// of its ancestors as the page has them (shallow copies, display: contents), so a list item keeps its
// marker and its number, and a section's paragraph its section's look. A frame draws nothing of its
// own (visibility: hidden, the copy visible): display: contents leaves an element's ::before and
// ::after and a <details>'s own summary drawn (Chrome's "▶ 详细信息" for one without a summary, an
// ancestor item's marker, a flowchart step's number, each at the window's left or top), which would
// follow the pointer (the user's report of 2026-11-06). At most MAX blocks, each at most TALL of the
// window (cut, fading out at the bottom). When the drag ends the copy lands (land): it travels to where
// the block now is, or back to it, and fades into it.

const MAX = 12;
const TALL = 0.6;
const LAND = 160; // ms: the copies' way to where the block landed, or back to it
const INSIDE = `
  .ge-copy { box-sizing: border-box; pointer-events: none; }
  .ge-copy.ge-cut { overflow: hidden; -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - 48px), transparent); mask-image: linear-gradient(to bottom, #000 calc(100% - 48px), transparent); }
`;
const OUTSIDE = `
  .ge-drag-preview { position: fixed; inset: 0; overflow: visible; z-index: ${Z.preview}; opacity: .4; pointer-events: none; }
`;

// The page's rules as one stylesheet, made again only when the page has more or fewer sheets (the
// editor adds its own as its tools start). Rules that cannot go into a shadow root's sheet are left
// out: @import (none in the kit) and @font-face (the page's fonts are the page's already).
let rules = null; // { count, sheet }
function pageSheet() {
  const count = document.styleSheets.length;
  if (rules?.count === count) return rules.sheet;
  const text = [];
  for (const sheet of document.styleSheets) {
    let list;
    try {
      list = sheet.cssRules;
    } catch {
      continue; // another origin's
    }
    for (const rule of list) if (!(rule instanceof CSSImportRule) && !(rule instanceof CSSFontFaceRule)) text.push(rule.cssText);
  }
  text.push(INSIDE);
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(text.join("\n"));
  rules = { count, sheet };
  return sheet;
}

// What a copy must not carry: the drag's own marks, a caret to take, media that would play.
function clean(node) {
  for (const each of [node, ...node.querySelectorAll("*")]) {
    each.removeAttribute("data-ge-dragging");
    each.removeAttribute("contenteditable");
    each.removeAttribute("autofocus");
  }
  node.querySelectorAll("iframe, video, audio, object, embed").forEach((media) => media.remove());
  return node;
}

// `part` copied, standing in shallow copies of its ancestors up to the page (or the dialog's
// content), at `rect` (window coordinates, where it is now).
function copyOf(part, rect, top) {
  const copy = clean(part.cloneNode(true));
  copy.classList.add("ge-copy");
  // An ordered list's item keeps its number.
  const list = part.parentElement;
  if (part.localName === "li" && list?.localName === "ol") {
    const items = [...list.children].filter((child) => child.localName === "li");
    copy.setAttribute("value", String((Number(list.getAttribute("start")) || 1) + items.indexOf(part)));
  }
  const cut = rect.height > innerHeight * TALL;
  if (cut) copy.classList.add("ge-cut");
  // Its own size, as it was on the page: no share of a row or of its box (the window is the box here); inline, so the page's rules for the block cannot undo it. Visible, in frames that are not.
  Object.assign(copy.style, {
    position: "absolute", margin: "0", maxWidth: "none", minWidth: "0", maxHeight: "none", flex: "none", visibility: "visible",
    left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`,
    height: `${cut ? Math.round(innerHeight * TALL) : rect.height}px`,
  });
  let outer = copy;
  for (let node = part.parentElement; node && node !== top.parentElement; node = node.parentElement) {
    const shell = clean(node.cloneNode(false));
    shell.style.display = "contents";
    shell.style.visibility = "hidden"; // a frame lends the copy its rules and draws nothing of its own
    shell.append(outer);
    outer = shell;
  }
  outer.setAttribute("data-ge-editing", ""); // the editor's own rules for blocks being edited apply
  return outer;
}

/**
 * The picture of `targets` (blocks, in page order) for a drag starting at the pointer (`x`, `y`):
 * { node, move(x, y) }; it belongs to the drag (`alive`, overlays.mjs) and goes with node.remove().
 */
export function createPreview(targets, x, y, { owner, alive }) {
  if (!document.querySelector("style[data-ge-drag-preview]")) {
    const style = element("style", { text: OUTSIDE, "data-ge-drag-preview": "" });
    style.dataset.docDev = "";
    document.head.append(style);
  }
  const node = own(element("div", { class: "ge-drag-preview" }), "drag preview", { owner, alive });
  const root = node.attachShadow({ mode: "open" });
  root.adoptedStyleSheets = [pageSheet()];
  for (const target of targets.slice(0, MAX)) {
    const top = target.closest(DIALOG.openContent) ?? target.closest("main") ?? target.parentElement;
    for (const part of withLeads(target)) {
      const rect = part.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) continue;
      root.append(copyOf(part, rect, top));
    }
  }
  mount(node);
  return {
    node,
    /** The pointer is at `left`, `top`: the copies go with it. */
    move(left, top) {
      node.style.transform = `translate(${Math.round(left - x)}px, ${Math.round(top - y)}px)`;
    },
    /**
     * The drag is over (a design review, 2026-11-17): the copies are the landing's from now on (an overlay of
     * their own, `owner`'s, until they go), and once `where()` tells where the pressed block stands now against
     * where it stood as the drag started ({ dx, dy }, window coordinates: the move made and the page scrolled
     * since; null, nowhere to go) they travel there from where the pointer left them and fade into it, LAND ms,
     * then go. Dropped, the copy lands on the block in its new place; cancelled, or released where it was, it goes
     * back to it. Only the picture moves: never a block of the page. At once with reduced motion or nowhere to go.
     */
    land(owner, where) {
      let landing = true;
      const gone = () => {
        landing = false;
        node.remove();
      };
      own(node, "drag landing", { owner, alive: () => landing });
      queueMicrotask(() => { // after the drop has moved the blocks (the same task) and scrolled to them
        const to = still() || !node.animate ? null : where();
        if (!to) return gone();
        const now = node.style.transform || "translate(0px, 0px)";
        // It keeps most of its .4 on the way and fades as it comes onto the block (the last quarter of the way).
        const animation = node.animate([
          { transform: now, opacity: 0.4 },
          { opacity: 0.32, offset: 0.75 },
          { transform: `translate(${Math.round(to.dx)}px, ${Math.round(to.dy)}px)`, opacity: 0 },
        ], { duration: LAND, easing: "cubic-bezier(.2, .8, .2, 1)", fill: "forwards" });
        animation.finished.then(gone, gone);
      });
    },
  };
}
