import { IN_LAYER } from "../../../shared/layers.mjs";
import { KIND_NAMES } from "../../components/registry.mjs";
import { UNIT, identityOf, withLeads } from "../core.mjs";
import { FOLDED, foldOver } from "../folded.mjs";
import { undrawn } from "../geometry.mjs";
import { own } from "../overlays.mjs";
import { deviceSize, drawAt, layerOf, onDevice } from "../overlay-layer.mjs";
import { element } from "../ui.mjs";

// The blocks an Agent deleted, shown where they were (docs/editor.md "Agent's changes"): a ghost of
// them, their words in red struck through on a faint red fill, a line each (a heading larger and
// bold, an item with its marker, nested items further in, a table a line each row, a block with no
// words its kind's name), never a block of the page: nothing of it is in the document's flows, so no
// commit, undo step, copy, selection, drop or search ever meets it. Room is made for it where the
// blocks were by a margin of the block after the place (`before`; at the document's end the last
// block's below it, `after`; with no block left at all, the body's top, `into`), written in a
// stylesheet of the editor's own keyed by that block's identity (data-ge-id: never a style
// attribute, which the file would get), and the ghost is drawn in that room in the block's overlay
// layer (overlay-layer.mjs), measured first: the room is its height and the gap the page had
// there, the gap kept above it and below it (a collapsed margin made good on a second measure). A
// block that stands beside others (a Sheet's tab in its bar, a flowchart's node in its row, a column
// of 分栏) has the room made before the row it stands in, which a margin of its own would push out of
// line; what stands at one place is one ghost in one room (two groups before one row; one before a
// block and one before the first of its blocks that stays, a paragraph before a list and the list's
// first item: a margin of the inner one would fold into the outer one's, the two drawn over each
// other). Placed again whenever the page may have moved (the overlays' frame loop), the room made
// again when its height changes (the window narrowed, its lines wrapped anew).

const REACH = 2; // px past the block at its sides, as a text block's fill
const BAR = 2; // its bar's width, and how far its right edge is left of the block's edge: where a block's bar stands (fills.mjs)
const BAR_OFF = 8;
const GAP_LEAST = 6;
const GAP_MOST = 20;

export const GHOST_STYLE = `
  .ge-diff-ghost { left: 0; top: 0; z-index: ${IN_LAYER.halo}; box-sizing: border-box; padding: 2px ${REACH}px; border-radius: 4px; background: var(--ge-diff-del-fill); color: var(--ge-diff-del-text); pointer-events: none; user-select: none; overflow-wrap: anywhere; }
  /* Its bar in the left margin, red, where a block's green one stands (fills.mjs createBars: 10 to 8px left of the
     block's edge, 2px wide; on a scaled screen whole device pixels, --ge-bar-at and --ge-bar-w, the ghost itself drawn on them). */
  .ge-diff-ghost::before { content: ""; position: absolute; left: var(--ge-bar-at, -8px); top: 0; bottom: 0; width: var(--ge-bar-w, 2px); border-radius: 1px; background: var(--ge-diff-del-line); }
  .ge-diff-ghost-line { position: relative; white-space: pre-line; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 4; overflow: hidden; }
  .ge-diff-ghost-line + .ge-diff-ghost-line { margin-top: 2px; }
  .ge-diff-ghost-words { text-decoration: line-through; text-decoration-color: var(--ge-diff-del-text); }
  /* A heading's ghost in a heading's weight: the kit's one weight for every heading, 700 (flow.css, since 2026-11-17). */
  .ge-diff-ghost-line[data-tag="h1"], .ge-diff-ghost-line[data-tag="h2"] { font-size: 1.25em; font-weight: 700; }
  .ge-diff-ghost-line:is([data-tag="h3"], [data-tag="h4"]) { font-size: 1.1em; font-weight: 700; }
  .ge-diff-ghost-line[data-tag="pre"] { font-family: var(--doc-mono, ui-monospace, SFMono-Regular, Consolas, monospace); font-size: .875em; }
  .ge-diff-ghost-marker { position: absolute; transform: translateX(-100%); padding-right: .45em; font-variant-numeric: tabular-nums; }
  .ge-diff-ghost-line[data-empty] .ge-diff-ghost-words { text-decoration: none; opacity: .8; }
  @media print { .ge-diff-ghost { display: none; } }
`;

const shows = (node) => node.isConnected && node.getClientRects().length > 0 && node.getBoundingClientRect().width > 0 && !undrawn(node);

// Whether `node` stands beside the blocks next to it rather than under them: in a row of a flex box,
// a grid of more than one column, or a line of text.
function beside(node) {
  const parent = node.parentElement;
  if (!parent || parent.localName === "main") return false;
  const style = getComputedStyle(parent);
  if (style.display.includes("flex")) return style.flexDirection.startsWith("row");
  if (style.display.includes("grid")) return style.gridTemplateColumns.trim().split(/\s+/).length > 1;
  return getComputedStyle(node).display.startsWith("inline");
}
// The block a room is made before or after for `node`: itself, or the row it stands in.
function rowOf(node) {
  while (beside(node)) node = node.parentElement;
  return node;
}
// Where a block's top is in the page itself, not in the window: its place less what the page and the boxes
// around it are scrolled. The browser keeps what the reader looks at where it is (scroll anchoring) when a
// layout above it changes, by scrolling: a block below the window's top that a margin pushed down is, in the
// window, where it was. Measured in the window, the room made would look like none, and be made twice.
function pageTop(node) {
  let top = node.getBoundingClientRect().top + scrollY;
  for (let at = node.parentElement; at && at !== document.body && at !== document.documentElement; at = at.parentElement) top += at.scrollTop;
  return top;
}
const level = (a, b) => Math.abs(a.getBoundingClientRect().top - b.getBoundingClientRect().top) < 1;

// Whether a ghost's place is in a folded section (docs/editor.md "Folding a heading's section"): the
// block before it hidden by a fold, or the folded heading itself (folded.mjs foldOver). It goes with
// the section as its blocks would have, unless they held a heading of the folded one's level or
// higher, which would have ended it.
function foldedAway(entry) {
  if (entry.edge === "into") return false;
  let before = entry.edge === "after" ? entry.target : entry.target.previousElementSibling;
  while (before && !before.matches(`${UNIT}, [${FOLDED}]`)) before = before.previousElementSibling;
  const heading = foldOver(before);
  if (!heading) return false;
  const most = Number(heading.localName[1]);
  return !entry.rows.some((row) => /^h[1-4]$/.test(row.tag ?? "") && Number(row.tag[1]) <= most);
}

/** A line of the ghost: one deleted block (source/changes.mjs ghostRow). */
function lineOf(row) {
  const words = (row.text ?? "").trim();
  const line = element("div", { class: "ge-diff-ghost-line", "data-tag": row.tag ?? "" });
  line.style.paddingLeft = `${(row.depth ?? 0) * 1.5 + (row.marker ? 1.5 : 0)}em`;
  if (row.marker) line.append(element("span", { class: "ge-diff-ghost-marker", text: row.marker === "ol" ? `${row.number ?? 1}.` : "•" }));
  if (!words) line.setAttribute("data-empty", "");
  line.append(element("span", { class: "ge-diff-ghost-words", text: words || KIND_NAMES[row.kind] || "…" }));
  return line;
}

/**
 * The ghosts of a review's deleted blocks. Returns { add(group, anchor, edge), place(), clear(),
 * drop(gone?), count, entries }: add makes one (drawn at the next place), place puts each where its
 * room is (made or made again as needed), clear takes them and their rooms away.
 */
export function createGhosts() {
  const sheet = element("style", { "data-doc-dev": "", "data-ge-changes-room": "" });
  let entries = []; // { drawn, group, anchor, edge, target, height, width, gap, room }

  // The rooms, one rule each, for the screen alone (printed, the page is as the file has it). A
  // room's margin is !important: the kit's spacing (a flow's first block's none, the gap between two
  // kinds of block) is said by rules more specific than one attribute, and the room is added to it.
  function writeRules() {
    const text = entries.map((entry) => entry.room).filter(Boolean).join("\n");
    const css = text ? `@media screen {\n${text}\n}` : "";
    if (sheet.textContent !== css) sheet.textContent = css;
    if (css && !sheet.isConnected) document.head.append(sheet);
    if (!css && sheet.isConnected) sheet.remove();
  }
  const selectorOf = (target) => (target.localName === "main" ? "main" : `[data-ge-id="${CSS.escape(identityOf(target))}"]`);
  const setRule = (entry, declaration) => {
    entry.room = declaration ? `${selectorOf(entry.target)} { ${declaration} }` : null;
    writeRules();
  };

  // Room for `height` px where `entry`'s blocks were, the gap the page had there kept on either side.
  function makeRoom(entry, height) {
    const { target, edge } = entry;
    setRule(entry, null);
    const style = getComputedStyle(target);
    if (edge === "after") {
      entry.gap = Math.min(GAP_MOST, Math.max(GAP_LEAST, parseFloat(style.marginBottom) || 0));
      setRule(entry, `margin-bottom: ${Math.round((parseFloat(style.marginBottom) || 0) + entry.gap + height + entry.gap)}px !important;`);
      return;
    }
    if (edge === "into") {
      entry.gap = GAP_LEAST;
      setRule(entry, `padding-top: ${Math.round((parseFloat(style.paddingTop) || 0) + height + 2 * entry.gap)}px !important;`);
      return;
    }
    const top = target.getBoundingClientRect().top;
    const placed = pageTop(target);
    let before = target.previousElementSibling;
    while (before && (before.hasAttribute("data-doc-dev") || !shows(before))) before = before.previousElementSibling;
    const above = before ? top - before.getBoundingClientRect().bottom : null;
    entry.gap = Math.min(GAP_MOST, Math.max(GAP_LEAST, above ?? GAP_LEAST));
    const want = height + entry.gap; // how far the block goes down
    let margin = (parseFloat(style.marginTop) || 0) + want;
    setRule(entry, `margin-top: ${Math.round(margin)}px !important;`);
    const moved = pageTop(target) - placed;
    if (Math.abs(moved - want) > 0.5) { // its margin collapsed with the one above it
      margin += want - moved;
      setRule(entry, `margin-top: ${Math.round(margin)}px !important;`);
    }
  }

  return {
    get count() { return entries.length; },
    get entries() { return entries; },
    /** A ghost of `group` (a review's `removed` entry) at `anchor`'s `edge` ("before", "after", "into"). */
    add(group, anchor, edge) {
      const lines = group.rows.map(lineOf);
      if (group.more || group.rows.length === 0) lines.push(lineOf({ text: "…", tag: "", depth: 0 }));
      const target = edge === "into" ? anchor : rowOf(edge === "before" ? withLeads(anchor)[0] : anchor);
      // At the place of one made already (the groups come in the page's order): its lines go on in that one.
      const one = entries.find((entry) => entry.edge === edge && (entry.target === target || (edge === "before" && entry.target.contains(target) && level(entry.target, target))));
      if (one) {
        one.drawn.append(...lines);
        one.rows.push(...group.rows);
        one.height = -1;
        return one;
      }
      const drawn = element("div", { class: "ge-diff-ghost", "data-doc-dev": "", "aria-hidden": "true" }, ...lines);
      const entry = { drawn, group, rows: [...group.rows], anchor, edge, target, height: -1, width: -1, gap: GAP_LEAST, room: null };
      own(drawn, "changes", { owner: anchor, alive: () => anchor.isConnected && entries.includes(entry) });
      entries.push(entry);
      return entry;
    },
    /** Each ghost where its room is; a block not shown (a closed disclosure, another tab), or a place a fold hides, neither ghost nor room. */
    place() {
      let changed = false;
      for (const entry of entries) {
        const { drawn: node, target } = entry;
        if (!entry.anchor.isConnected || !shows(target) || foldedAway(entry)) {
          node.remove();
          if (entry.room) {
            entry.room = null;
            entry.height = -1;
            changed = true;
          }
          continue;
        }
        const layer = layerOf(target);
        if (node.parentNode !== layer) {
          const font = getComputedStyle(target.closest("main") ?? document.body);
          Object.assign(node.style, { fontFamily: font.fontFamily, fontSize: font.fontSize, lineHeight: font.lineHeight });
          layer.append(node);
        }
        let rect = target.getBoundingClientRect();
        const width = Math.round(rect.width + 2 * REACH);
        if (width !== entry.width) {
          node.style.width = `${width}px`;
          entry.width = width;
        }
        const height = node.offsetHeight;
        if (height !== entry.height) {
          makeRoom(entry, height);
          entry.height = height;
          rect = target.getBoundingClientRect();
        }
        const top = entry.edge === "before" ? rect.top - entry.gap - height
          : entry.edge === "after" ? rect.bottom + entry.gap
          : rect.top + (parseFloat(getComputedStyle(target).paddingTop) || 0) - height - entry.gap;
        const origin = layer.getBoundingClientRect();
        // On device pixels, its bar as crisp as the blocks' beside it and on their line, worked out as theirs are
        // (fills.mjs barOf; overlay-layer.mjs onDevice, deviceSize), from where the ghost itself is drawn (drawAt).
        drawAt(node, layer, rect.left - REACH - origin.left, top - origin.top, origin);
        const drawn = onDevice(Math.round(rect.left - REACH - origin.left), origin.left);
        const bar = `${deviceSize(BAR)}px`;
        const at = `${onDevice(Math.round(rect.left - origin.left) - BAR_OFF, origin.left) - deviceSize(BAR) - drawn}px`;
        if (node.style.getPropertyValue("--ge-bar-w") !== bar) node.style.setProperty("--ge-bar-w", bar);
        if (node.style.getPropertyValue("--ge-bar-at") !== at) node.style.setProperty("--ge-bar-at", at);
      }
      if (changed) writeRules();
      return entries.length > 0;
    },
    /** Ghosts whose block left the page go, and their rooms. */
    settle() {
      const gone = entries.filter((entry) => !entry.anchor.isConnected);
      if (gone.length === 0) return;
      for (const entry of gone) entry.drawn.remove();
      entries = entries.filter((entry) => !gone.includes(entry));
      writeRules();
    },
    /** Every ghost and room taken away. */
    clear() {
      for (const entry of entries) entry.drawn.remove();
      entries = [];
      writeRules();
    },
  };
}
