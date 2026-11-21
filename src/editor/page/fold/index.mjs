import { IN_LAYER } from "../../../shared/layers.mjs";
import { FOLD_ARROW } from "../../../shared/code-folds.mjs";
import { levelIcon } from "../../components/icons.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { ELEMENT_ID, UNIT, identityOf, unitsOf, withLeads } from "../core.mjs";
import { caretAt } from "../caret.mjs";
import { HEADING } from "../outline/read.mjs";
import { foldsOf, keepFolds } from "../outline/folds.mjs";
import { drawAt, shapeOf } from "../overlay-layer.mjs";
import { own } from "../overlays.mjs";
import { local } from "../storage.mjs";
import { shortcut, tooltip } from "../tooltip.mjs";
import { addStyle, element } from "../ui.mjs";
import { FOLDED, hiddenByFold, setFoldOpener } from "../folded.mjs";
import { foldable, headingOf, hiddenAfter, keyOf, levelOf, stepOver, takenWith } from "./rule.mjs";

// Folding a heading's section (docs/editor.md, "Folding a heading's section"): a small rounded triangle
// a gap right of a heading's last line, shown while the pointer is at the heading (always while it is
// folded), folds what the heading's section is (rule.mjs: the outline's nesting, in its box) out of
// sight; Ctrl/⌘+Enter in its words does the same (components/heading/page.mjs). A fold is the reader's
// view, never the file's: no undo step, no commit; kept per report in the browser
// (gallery-edit:heading-folds, as the outline's folds are), so the page shown again after an Agent's
// write folds what was folded. While the page lives, what is folded is the headings' identities
// (data-ge-id: a heading turned into another level, or put back by undo, stays folded); what a fold
// hides is marked data-ge-folded (the outermost folded heading's identity), shown as nothing.
//
// What asks it: the block tools (blocks.mjs) draw the triangles each frame (place, beside the handle:
// handle.pointed), and take a folded heading's section with it wherever blocks are taken away whole
// (takenWith: drag/, selection/delete.mjs, clipboard/, block-menu/'s 组成新分区; groupsOf and
// stepOver: drag/ moveBy; withHidden: a row of columns made around it, columns/ and drag/);
// selection/ keeps what is hidden out of the selection; typing/ opens a fold before Backspace or
// Delete would join hidden words; editor.mjs opens the folds around the caret, and
// every path that opens what hides a block goes through reveal() (page/folded.mjs). One rule opens a fold
// of itself: a block a change of the page puts into a folded section (or one that was in sight and is not
// now) opens it, unless the block came onto the page with its heading in that same change (undo
// putting a folded section back, a folded section dragged).
//
// Right of the triangle stands the heading's level badge (the user's 2026-11-12): H1–H4, the H and the
// figure one height (components/icons.mjs levelIcon; until the next day the type grid's mark, an H with
// a small figure, which the user found too small) in the triangle's grey, shown and hidden with the
// triangle (down while the heading is open, right while folded, as a code block's and a disclosure's), so a heading's
// level is told at a glance. A press on it moves no caret and changes no selection; a click opens the
// editor's menu card below it (menu.mjs, the block tools' one), 增大一级 and 减小一级 (this heading alone,
// the user's 2026-11-20), then 所有标题增大一级 and 所有标题减小一级 (`shift`: editor.mjs shiftAllHeadings,
// every heading of the document, or the one it is given; one undo step), its keys on
// the window while it stands (↑/↓, Enter, Esc; any other key closes it and goes on), the badge shown
// and filled until it closes (a click elsewhere, Esc, a scroll, a row run).

const STORE = "gallery-edit:heading-folds";
// The button is what a press finds, drawn as nothing but its triangle; 16px (it was 20, filled under the
// pointer: the user's, 2026-11-07), its triangle's middle 14px past the words as before.
const SIZE = 16;
const GAP = 6; // from the end of the heading's last line to the button
// The level badge: a button 26px wide and 22 high, its H1–H4 10px high on a 22 × 16 drawing, 2px into
// the triangle's button (whose triangle ends 5px before its edge), on the same middle.
const LEVEL = { width: 26, height: 22 };
const LEVEL_INTO = 2;
// A press held that began off the triangles (words being selected, a box drawn, a block dragged): the
// triangles take no pointer until it ends. Under the pointer one stood for the place of the drag: the
// browser, finding a node outside the heading's editable text, put the selection's moving end at the
// heading's start (the whole heading selected while the pointer crossed the triangle, the user's
// 2026-11-07 第 6 条), and it darkened as if it were to be pressed.
const HELD = "data-ge-fold-held";
// What a fold hides is display: none !important: none of it shows, whatever display its blocks have
// of their own (a row of columns' grid, a card's flex, a rule of the report's own).
const STYLE = `
  [data-ge-editing] [${FOLDED}] { display: none !important; }
  .ge-fold, .ge-level { position: absolute; left: 0; top: 0; z-index: ${IN_LAYER.button}; box-sizing: border-box; display: flex; align-items: center; justify-content: center; width: ${SIZE}px; height: ${SIZE}px; border-radius: 4px; color: var(--ge-ico3); cursor: pointer; pointer-events: auto; user-select: none; }
  html[${HELD}] :is(.ge-fold, .ge-level) { pointer-events: none; }
  /* No fill under the pointer, the triangle darker (as the outline's), a short one while pressed (as a code block's arrow). */
  .ge-fold:hover { color: var(--ge-ico2); }
  .ge-fold:active { background: var(--ge-press); }
  /* Open it points down (as drawn); folded, right (turned a quarter back): a code block's and a disclosure's arrows. */
  .ge-fold svg { display: block; width: 12px; height: 12px; fill: currentColor; transform: none; transition: transform .2s ease-out; }
  .ge-fold[aria-expanded="false"] svg { transform: rotate(-90deg); }
  @media (prefers-reduced-motion: reduce) { .ge-fold svg { transition: none; } }
  /* The level badge: the triangle's grey, a fill under the pointer and while its menu is open (a flat button, no line). */
  .ge-level { width: ${LEVEL.width}px; height: ${LEVEL.height}px; }
  .ge-level:hover, .ge-level[aria-expanded="true"] { background: var(--ge-hover); color: var(--ge-ico2); }
  .ge-level:active { background: var(--ge-press); }
  .ge-level svg { display: block; width: 22px; height: 16px; fill: none; stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
`;

/** Where a heading's button stands (window coordinates): 6px right of its last line's end, on that line's middle; null where it shows no words. */
export function foldRectOf(heading) {
  const range = document.createRange();
  range.selectNodeContents(heading);
  const end = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0).at(-1);
  if (!end) return null;
  const left = end.right + GAP;
  const top = (end.top + end.bottom) / 2 - SIZE / 2;
  return { left, top, right: left + SIZE, bottom: top + SIZE };
}

/** Where a heading's level badge stands (window coordinates): right of its triangle's button, on its middle; null where it shows no words. */
export function levelRectOf(heading) {
  const fold = foldRectOf(heading);
  if (!fold) return null;
  const left = fold.right - LEVEL_INTO;
  const top = (fold.top + fold.bottom) / 2 - LEVEL.height / 2;
  return { left, top, right: left + LEVEL.width, bottom: top + LEVEL.height };
}

const MODIFIERS = new Set(["Shift", "Control", "Alt", "Meta"]);

/**
 * slug: the report's. selection: selection/index.mjs (what is hidden leaves it). active(): whether
 * the block tools may show. schedule(): the block tools' next frame. menu: the block tools' menu card
 * (menu.mjs), which the level badge opens; shift(way): every heading a level larger ("up") or smaller
 * ("down"), the editor's shiftAllHeadings.
 */
export function createFolds({ slug, selection, active, schedule, menu = null, shift = () => {} }) {
  addStyle(STYLE);
  const folded = new Set(); // the identities of the headings folded
  let heads = []; // the folded headings on the page at the last apply, in document order
  let hidden = new Set(); // the units hidden at the last apply
  let started = false;
  let observer = null;
  const buttons = new Map(); // heading -> its button
  const levels = new Map(); // heading -> its level badge
  let levelsFor = null; // the heading whose badge's menu is open
  const holds = (node) => [...buttons.values(), ...levels.values()].some((button) => button.contains(node));

  const main = () => document.querySelector("main");
  const idOf = (node) => node?.getAttribute?.(ELEMENT_ID) ?? null;
  const isFolded = (node) => node?.nodeType === 1 && folded.has(idOf(node)) && foldable(node);
  const headings = () => [...(main()?.querySelectorAll(HEADING) ?? [])].filter(foldable);
  // The units a folded heading hides (with those of folds inside it): those of its box marked with it.
  const hiddenBy = (heading) => (heading.parentElement ? unitsOf(heading.parentElement).filter((unit) => unit.getAttribute(FOLDED) === idOf(heading)) : []);

  function load() {
    const keys = foldsOf(local, slug, STORE);
    if (keys.size === 0) return;
    const all = headings();
    for (const key of keys) {
      const heading = headingOf(key, all);
      if (heading) folded.add(identityOf(heading));
    }
  }

  // What is folded, kept by the keys the headings have now (only those still on the page).
  function save() {
    if (!started) return;
    const all = headings();
    keepFolds(local, slug, new Set(all.filter((heading) => folded.has(idOf(heading))).map((heading) => keyOf(heading, all))), null, STORE);
  }

  // What each folded heading hides now: element (its units, and what else shows among them:
  // rule.mjs hiddenAfter) -> the outermost folded heading over it. A folded heading with no words is
  // folded no more; one hidden by a fold around it starts no section of its own.
  function wanted(root) {
    const want = new Map();
    const found = [];
    for (const heading of root.querySelectorAll(HEADING)) {
      const id = idOf(heading);
      if (!folded.has(id)) continue;
      if (!foldable(heading)) {
        folded.delete(id);
        continue;
      }
      found.push(heading);
      let under = false;
      for (let node = heading; node && node !== root && !under; node = node.parentElement) under = want.has(node);
      if (under) continue;
      for (const node of hiddenAfter(heading)) want.set(node, heading);
    }
    return { want, found };
  }

  /**
   * The marks set again as the folds are now. `added`: the elements a change of the page put in (null:
   * a fold toggled, or the page begun), for the rule that opens a fold: a unit hidden now that was not
   * (a block: what else a fold hides opens none) opens the folds over it, unless it came in with its
   * heading, or stands for one that was hidden (its identity: a hidden heading turned into another
   * level by 所有标题增大一级 stays hidden).
   */
  function apply({ added = null } = {}) {
    const root = main();
    if (!root) return;
    const within = (node) => {
      for (let at = node; at && at !== root; at = at.parentElement) if (added.has(at)) return true;
      return false;
    };
    const count = folded.size;
    const was = new Set([...hidden].map(idOf).filter(Boolean));
    let result;
    for (let round = 0; round < 16; round++) {
      result = wanted(root);
      if (added === null) break;
      const opened = new Set();
      for (const [unit, heading] of result.want) {
        if (unit.matches(UNIT) && !hidden.has(unit) && !was.has(idOf(unit)) && !(within(unit) && within(heading))) opened.add(heading);
      }
      if (opened.size === 0) break;
      for (const heading of opened) folded.delete(idOf(heading));
    }
    const marks = new Map();
    for (const [unit, heading] of result.want) for (const part of withLeads(unit)) marks.set(part, idOf(heading));
    for (const node of root.querySelectorAll(`[${FOLDED}]`)) if (!marks.has(node)) node.removeAttribute(FOLDED);
    for (const [node, id] of marks) if (node.getAttribute(FOLDED) !== id) node.setAttribute(FOLDED, id);
    heads = result.found;
    hidden = new Set(result.want.keys());
    if (added !== null && folded.size !== count) save(); // a fold opened of itself
    schedule();
  }

  // A change of the page: blocks put in or taken out (a container's children, or a node that is or
  // holds a block) apply the folds again; words typed in a heading too (emptied, its fold opens; a
  // heading in a box may now end a section). Words typed elsewhere are nothing to it.
  function changed(records) {
    if (folded.size === 0 && hidden.size === 0) return;
    const added = new Set();
    let again = false;
    for (const record of records) {
      const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
      if (target?.closest?.(HEADING)) again = true;
      if (record.type !== "childList") continue;
      if (target?.hasAttribute?.("data-ge-box")) again = true;
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        added.add(node);
        if (!again && (node.matches(UNIT) || node.querySelector(UNIT))) again = true;
      }
      if (!again) for (const node of record.removedNodes) if (node.nodeType === 1 && (node.matches(UNIT) || node.querySelector(UNIT))) again = true;
    }
    if (again) apply({ added });
  }

  // The caret, or an end of a text selection, in what a fold now hides goes to the end of its heading;
  // what is selected of it leaves the selection.
  function stepOut(heading) {
    const picked = selection.picked;
    const kept = picked.filter((node) => !hiddenByFold(node));
    if (kept.length !== picked.length) {
      if (kept.length) selection.select(kept, { quiet: true });
      else selection.clear();
    }
    const text = getSelection();
    if (text?.rangeCount && (hiddenByFold(text.anchorNode) || hiddenByFold(text.focusNode))) caretAt(heading, "end");
  }

  /** Fold or unfold a heading's section. Whether it is one that folds. */
  function toggle(heading) {
    if (!started || !foldable(heading)) return false;
    const id = identityOf(heading);
    if (!folded.delete(id)) folded.add(id);
    apply();
    if (folded.has(id)) stepOut(heading);
    save();
    return true;
  }

  /** The folds over `node` opened, outermost first, until it shows. Whether any was. */
  function showAround(node) {
    let opened = false;
    for (let round = 0; round < 16 && hiddenByFold(node); round++) {
      const marked = (node.nodeType === 1 ? node : node.parentElement).closest(`[${FOLDED}]`);
      if (!folded.delete(marked.getAttribute(FOLDED))) marked.removeAttribute(FOLDED); // no fold of this page's
      opened = true;
      apply();
    }
    if (opened) save();
    return opened;
  }

  // ---------- the buttons ----------

  // A press held that began off the triangles (HELD): set on the window before any tool sees the
  // press, gone with the press (let go, cancelled, the window left, or a move with no button down
  // where its end was missed). The triangles shown stay shown, as the handle's block stays while a
  // button is down (handle/ onMove), and take the pointer again once it is let go.
  let held = false;
  const hold = (on) => {
    if (held === on) return;
    held = on;
    document.documentElement.toggleAttribute(HELD, on);
  };
  addEventListener("pointerdown", (event) => hold(!holds(event.target)), true);
  for (const type of ["pointerup", "pointercancel"]) addEventListener(type, () => hold(false), true);
  addEventListener("blur", () => hold(false));
  addEventListener("pointermove", (event) => { if (held && event.buttons === 0) hold(false); }, { capture: true, passive: true });

  function make(heading) {
    const node = element("div", { class: "ge-fold", role: "button", html: FOLD_ARROW });
    tooltip(node, () => (isFolded(heading) ? t("展开") : t("折叠")), shortcut("mod+enter"));
    // No caret moves, no box selection starts, the focus stays (blocks.mjs passes presses on it by).
    node.addEventListener("pointerdown", (event) => event.preventDefault());
    node.addEventListener("click", (event) => {
      event.preventDefault();
      toggle(heading);
    });
    own(node, "heading fold", { owner: heading, alive: () => buttons.get(heading) === node && heading.isConnected && started && active(), expected: () => foldRectOf(heading) });
    return node;
  }

  // ---------- the level badge and its menu ----------

  // The menu's keys, on the window while it stands, before the editor's own (the caret may be in text):
  // ↑/↓ move in it, Enter runs the row highlighted (with none, it closes), Esc closes it; any other key
  // closes it and goes on.
  function keys(event) {
    if (!menu?.isOpen || event.isComposing || event.keyCode === 229) return;
    if (!menu.arrow(event)) {
      if (event.key === "Enter") {
        if (!menu.choose()) menu.close();
      } else if (event.key === "Escape") menu.close();
      else {
        if (!MODIFIERS.has(event.key)) menu.close();
        return;
      }
    }
    event.preventDefault();
    event.stopPropagation();
  }

  // A click on a heading's badge: its menu below it, or, open, closed.
  function openLevels(heading, node) {
    if (!menu) return;
    if (levelsFor === heading && menu.isOpen) return void menu.close();
    menu.open([
      { label: t("增大一级"), run: () => shift("up", heading) },
      { label: t("减小一级"), run: () => shift("down", heading) },
      { separator: true },
      { label: t("所有标题增大一级"), run: () => shift("up") },
      { label: t("所有标题减小一级"), run: () => shift("down") },
    ], node.getBoundingClientRect(), {
      label: t("标题级别"), highlight: false, icons: false,
      onClose: () => {
        removeEventListener("keydown", keys, true);
        node.setAttribute("aria-expanded", "false");
        if (levelsFor === heading) levelsFor = null;
        schedule();
      },
    });
    levelsFor = heading;
    node.setAttribute("aria-expanded", "true");
    addEventListener("keydown", keys, true);
  }

  function makeLevel(heading) {
    const node = element("div", { class: "ge-level", role: "button", "aria-haspopup": "menu", "aria-expanded": "false" });
    tooltip(node, () => (levelsFor === heading ? null : t("标题 {0}", levelOf(heading))), t("调整标题的级别"));
    // No caret moves, no selection changes, the focus stays (blocks.mjs passes presses on it by).
    node.addEventListener("pointerdown", (event) => event.preventDefault());
    node.addEventListener("click", (event) => {
      event.preventDefault();
      openLevels(heading, node);
    });
    own(node, "heading level", { owner: heading, alive: () => levels.get(heading) === node && heading.isConnected && started && active(), expected: () => levelRectOf(heading) });
    return node;
  }

  function drop(heading) {
    buttons.get(heading)?.remove();
    buttons.delete(heading);
    levels.get(heading)?.remove();
    levels.delete(heading);
    if (levelsFor === heading) menu?.close(); // its badge gone, its menu goes with it
  }

  /**
   * A frame: a button and a level badge by each folded heading in sight, by the heading the pointer is
   * at (`pointed`), and by the one whose badge's menu is open.
   */
  function place(pointed) {
    const want = new Set(started ? heads.filter((heading) => heading.isConnected && isFolded(heading)) : []);
    if (started && pointed && foldable(pointed) && !hiddenByFold(pointed)) want.add(pointed);
    if (started && levelsFor && menu?.isOpen && levelsFor.isConnected && foldable(levelsFor) && !hiddenByFold(levelsFor)) want.add(levelsFor);
    for (const heading of [...buttons.keys()]) if (!want.has(heading)) drop(heading);
    for (const heading of want) {
      const shape = shapeOf(heading);
      const rect = shape && foldRectOf(heading);
      if (!rect) {
        drop(heading);
        continue;
      }
      let node = buttons.get(heading);
      if (!node) {
        node = make(heading);
        buttons.set(heading, node);
      }
      const open = !isFolded(heading);
      if (node.getAttribute("aria-expanded") !== String(open)) {
        node.setAttribute("aria-expanded", String(open));
        node.setAttribute("aria-label", open ? t("折叠") : t("展开"));
      }
      drawAt(node, shape.layer, rect.left - shape.origin.left, rect.top - shape.origin.top);
      let badge = levels.get(heading);
      if (!badge) {
        badge = makeLevel(heading);
        levels.set(heading, badge);
      }
      const level = String(levelOf(heading));
      if (badge.getAttribute("data-level") !== level) {
        badge.setAttribute("data-level", level);
        badge.setAttribute("aria-label", t("标题 {0}", level));
        badge.innerHTML = levelIcon(level);
      }
      const spot = levelRectOf(heading);
      drawAt(badge, shape.layer, spot.left - shape.origin.left, spot.top - shape.origin.top);
    }
  }

  function hide() {
    for (const heading of new Set([...buttons.keys(), ...levels.keys()])) drop(heading);
  }

  const folds = {
    /** Editing begins: what was folded folded again, in the task editing begins in (no frame shows it open). */
    start() {
      if (started) return;
      started = true;
      setFoldOpener(showAround, (node) => started && isFolded(node));
      load();
      apply();
      observer = new MutationObserver(changed);
      const root = main();
      if (root) observer.observe(root, { childList: true, subtree: true, characterData: true });
      addEventListener("pagehide", save);
    },
    /**
     * Someone else's write was taken in where the page stands (page/pull/, called right after it changed the page,
     * before this observer hears of it): what is folded stays folded, and what the write put into a folded section is
     * hidden with it, as on the page shown anew after it (the rule that opens a fold of itself is the reader's
     * changes'); the caret, or an end of a selection, in what is hidden now opens the folds over it.
     */
    pulled() {
      if (!started) return;
      observer?.takeRecords();
      apply();
      const selection = getSelection();
      for (const end of [selection.anchorNode, selection.focusNode]) if (end && hiddenByFold(end)) showAround(end);
    },
    /** Editing ends: every fold shown open (what is folded is kept). */
    stop() {
      if (!started) return;
      save();
      started = false;
      observer?.disconnect();
      for (const node of document.querySelectorAll(`[${FOLDED}]`)) node.removeAttribute(FOLDED);
      heads = [];
      hidden = new Set();
      hide();
    },
    place,
    hide,
    /** A button shows (the frames go on following the headings). */
    get showing() { return buttons.size > 0 || levels.size > 0; },
    holds,
    toggle,
    isFolded,
    hidden: hiddenByFold,
    showAround,
    /** `units` with what each folded heading among them hides (a section it covers whole instead): rule.mjs takenWith. */
    takenWith: (units) => takenWith(units, { isFolded, hiddenBy }),
    /** A block with what it hides (a folded heading's section, folds inside it too), in document order: what goes into a column with it (columns/ split, drag/ besideTo). */
    withHidden: (unit) => (isFolded(unit) ? [unit, ...hiddenBy(unit)] : [unit]),
    /** The last block of a block and what it hides (a folded heading's last hidden block), for a place after it. */
    lastOf: (unit) => (isFolded(unit) ? hiddenBy(unit).at(-1) ?? unit : unit),
    /** The blocks of `list` as the reader sees them: each shown block, a folded heading with what it hides. */
    groupsOf(list) {
      const groups = [];
      for (const unit of list) {
        if (unit.hasAttribute(FOLDED) && groups.length > 0) groups.at(-1).push(unit);
        else groups.push([unit]);
      }
      return groups;
    },
    /** Where Ctrl+Shift+↑/↓ takes a folded heading (rule.mjs stepOver). */
    stepOver,
    /** What the status line calls `targets` taken for `picked` (named: block-info.mjs's): 标题和折叠的 N 块. */
    namedWith(picked, targets, named) {
      const extra = targets.length - picked.length;
      return extra > 0 && picked.every((node) => targets.includes(node)) ? t("{0}和折叠的 {1} 块", named(picked), extra) : named(targets);
    },
  };
  return folds;
}
