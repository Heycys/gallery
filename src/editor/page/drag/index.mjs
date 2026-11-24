import { IN_LAYER } from "../../../shared/layers.mjs";
import { gestureLock } from "../gesture.mjs";
import { nestedBlocks, newContainer, placeBefore, removalTarget, unitsOf, withLeads } from "../core.mjs";
import { accepts, isLead, isSelectable, refusedWithin } from "../../components/registry.mjs";
import { columnOps } from "../page-objects.mjs";
import { DIALOG, SHEETS } from "../../components/kit.mjs";
import { heldListType, listType } from "../../components/list/index.mjs";
import { extentOf, measure } from "../geometry.mjs";
import { edgeScroll } from "../edge-scroll.mjs";
import { alive, ordered } from "../block-info.mjs";
import { resolveDrop } from "./drop.mjs";
import { describe, note, own } from "../overlays.mjs";
import { drawBox, layerOf } from "../overlay-layer.mjs";
import { createPreview } from "./preview.mjs";
import { addStyle, element } from "../ui.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// Moving blocks (docs/editor.md, "Moving blocks"). Dragging a block's handle (handle/ starts it once
// the press has moved a few pixels) moves it, with the others selected when it is one of them,
// anywhere it may go (accepts(): any flow of the document, a column, a list, the chapters): where
// is drop.mjs resolveDrop (containers by their edges, a step out per 12px past edges that coincide;
// lists by indentation, a step right of the item above going under it; beside a block, side by side
// with it in a new row of columns, and at a column's edge, a new column: 分栏), shown by a blue line and
// the container tinted (no label: the line and the tint say where); a faded copy of the blocks
// follows the pointer (preview.mjs). Resting on a Sheet tab switches
// to its Sheet, resting on a closed disclosure's title opens it; near the window's edges the page
// scrolls. Releasing moves the very same nodes there as one undo step that keeps them selected; Esc
// cancels, and so does anything that ends the press another way (the handle losing the pointer
// capture, the window losing the focus, the page hidden): never a drop. Ending is idempotent, and
// the line, tint and copy belong to their drag (overlays.mjs). Ctrl+Shift+arrows move selected blocks standing next to each other by one place (moveBy).
// A folded heading goes with what it hides, or as the section it covers whole (fold/ takenWith); its
// copy shows what is in sight, and Ctrl+Shift+↑/↓ take it a section of its level at a time.
// What is dragged in from outside the page (files of this computer, a picture of another page: drop-in/)
// is shown the same way (`outside`): no blocks of the page go with it and no copy follows the pointer,
// the line says where the blocks it makes go (the kinds it makes, as dragged blocks of those kinds would
// go), or the empty placeholder it would fill is tinted (`onto`); it ends with no move, and `put` puts the
// new blocks there, one undo step.

const STYLE = `
  ${gestureLock("data-ge-drag", { cursor: "grabbing", select: true })}
  [data-ge-dragging] { opacity: .5; }
  .ge-drop-line { position: absolute; left: 0; top: 0; z-index: ${IN_LAYER.drop}; border-radius: 2px; background: light-dark(rgb(151 197 241), rgb(29 70 111)); pointer-events: none; }
  /* The container the dragged blocks would go into (not the page itself). */
  .ge-drop-tint { position: absolute; left: 0; top: 0; z-index: ${IN_LAYER.tint}; border-radius: 6px; background: color-mix(in srgb, var(--ge-halo) 50%, transparent); pointer-events: none; }
  /* An empty placeholder what is dragged in from outside would fill (drop-in/): as its 上传 menu shows a file over it. */
  .ge-drop-tint[data-onto] { background: light-dark(color-mix(in srgb, var(--ge-focus) 14%, transparent), rgb(67 155 255 / 24%)); }
  .ge-drop-tint[hidden], .ge-drop-line[hidden] { display: none; }
`;


/**
 * info: block-info.mjs. selection: selection/index.mjs. struct(parents, touched, mutate): the
 * editor's undoable structural change (history.mjs). say: the status line. closeMenu(): the block
 * menu closes. schedule(): the block tools' next frame (blocks.mjs), which calls step() while a
 * drag lasts. folds: the headings' folds (fold/).
 */
export function createDrag({ info, selection, struct, say, closeMenu, schedule, folds }) {
  addStyle(STYLE);
  const { addColumn, columnsOf, rowAround } = columnOps() ?? {};
  const { kindOf, nameOf, named, fixedText, boxKindOf } = info;
  let drag = null; // blocks being dragged: { targets, target (the one pressed), from (their container), x, y, line, tint, preview, drop: { container, slot } | null, rest, opened, tree, measured }

  // The containers moving `targets` out leaves empty, which go with them (as when the last block of one
  // is deleted), except those holding `place` (where they go) or being targets themselves.
  function leftoversOf(targets, place) {
    const gone = new Set(targets.flatMap(withLeads));
    return [...new Set(targets.map((target) => removalTarget(target, gone)))].filter((node) => !targets.includes(node) && !node.contains(place));
  }

  // Put blocks (with their leads, in their order) into `container` before `reference`, as one undo
  // step that keeps them selected. A container they leave empty goes too, as when its last block
  // is deleted. Returns whether an emptied
  // container went. `container` may be a list item: list items go to the end of its last list (when
  // it is the last block it holds), or of a new list (of the kind their own list is) put at the end
  // of the item; other blocks among the blocks it holds, before `reference` (at the end without one).
  // A flowchart's nodes go among blocks as list items do: into the flowchart they land right beside,
  // else a flowchart of their own (their list's type, "flowchart"); dropAt never puts them under an item.
  function moveTo(targets, container, reference) {
    const parts = targets.flatMap(withLeads);
    const leftovers = leftoversOf(targets, container);
    const item = container.tagName === "LI" && targets.every((target) => kindOf(target) === "item") ? container : null;
    const last = item ? nestedBlocks(item).at(-1) : null;
    const list = last?.matches("ul, ol") && last.hasAttribute("data-ge-box") ? last : null;
    // List items dropped among blocks (an item goes anywhere): they join a list
    // of their kind right before or after the place, else they make one there.
    const kind = listType(targets[0].parentElement); // items join a list of their own type
    const sameKind = (node) => Boolean(node?.matches?.("ul, ol")) && listType(node) === kind;
    const loose = !item && targets.every((target) => target.tagName === "LI") && !container.matches("ul, ol");
    const before = loose ? (reference ? reference.previousElementSibling : container.lastElementChild) : null;
    // Never the list they leave empty, which goes (it would take them with it).
    const joins = (node) => sameKind(node) && node.hasAttribute("data-ge-box") && !targets.includes(node) && !leftovers.includes(node);
    const join = !loose ? null : joins(before) ? { list: before, at: null }
      : joins(reference) ? { list: reference, at: reference.firstChild } : null;
    const parents = [...new Set([...targets.map((target) => target.parentNode), list ?? container, join?.list, ...leftovers.map((node) => node.parentNode)].filter(Boolean))];
    struct(parents, [], () => {
      let into = list ?? container;
      const created = [];
      if (item && !list) {
        into = newContainer(document, heldListType(listType(targets[0].parentElement))); // a 流程图's steps a numbered list there
        item.append(into);
        created.push(into);
      }
      if (loose && join) placeBefore(join.list, parts, join.at);
      else if (loose) {
        const wrapper = newContainer(document, kind);
        container.insertBefore(wrapper, reference);
        created.push(wrapper);
        placeBefore(wrapper, parts, null);
      } else placeBefore(into, parts, item ? null : reference);
      leftovers.forEach((node) => node.remove());
      return { touched: [], focus: null, select: targets, reselect: true, created };
    });
    return leftovers.length > 0;
  }

  // Put blocks beside a block (drop.mjs `aside`): { target, side }, the two side by side in a new
  // row of columns (a folded heading's column taking what it hides: fold/ withHidden); { row, index,
  // whole }, a new column of that row at `index` holding them, or,
  // when they are all of one column of it (`whole`), that column moved there. One undo step that
  // keeps them selected; a container they leave empty goes, as when they move (and a row left
  // with one column gives its blocks back: history.mjs).
  function besideTo(targets, aside) {
    if (aside.whole) {
      const row = aside.row;
      struct([row], [], () => {
        row.insertBefore(aside.whole, columnsOf(row)[aside.index] ?? null);
        return { touched: [], focus: null, select: targets, reselect: true };
      });
      return;
    }
    const parts = targets.flatMap(withLeads);
    const leftovers = leftoversOf(targets, aside.row ?? aside.target);
    const parents = [...new Set([...targets.map((target) => target.parentNode), aside.row ?? aside.target.parentElement, ...leftovers.map((node) => node.parentNode)].filter(Boolean))];
    struct(parents, [], () => {
      const { created } = aside.row ? addColumn(aside.row, aside.index, parts) : rowAround(folds.withHidden(aside.target), [parts], aside.side);
      leftovers.forEach((node) => node.remove());
      return { touched: [], focus: null, select: targets, reselect: true, created };
    });
  }

  /**
   * Move a block, or selected blocks standing next to each other, one place back (-1) or on (+1)
   * among their container's blocks. Returns whether they moved.
   */
  function moveBy(targets, delta, { keepFocus = false } = {}) {
    closeMenu();
    const picked = ordered([targets].flat().filter(alive));
    targets = folds.takenWith(picked);
    if (targets.length === 0) return false;
    const reason = targets.map(fixedText).find(Boolean);
    if (reason) {
      say(reason);
      return false;
    }
    const name = folds.namedWith(picked, targets, named);
    // Blocks of several containers (a line of the page's header and the page's blocks, say: a box
    // selection across the header's end) move only by a drag, which puts them all in one.
    if (targets.some((target) => target.parentElement !== targets[0].parentElement)) {
      say(t("选中的块不在同一层，不能一起上下移动；可以拖动其中一块的手柄，把它们一起移到别处。"));
      return false;
    }
    // The blocks to move among: not a box's lead (a highlight block's icon stays first in it), nor a
    // unit never selected (the page's icon stays above the title: a header's first line goes no
    // higher), as the reader sees them: a folded heading and what it hides one (fold/ groupsOf).
    const boxKind = boxKindOf(targets[0].parentElement);
    const list = unitsOf(targets[0].parentElement).filter((unit) => !isLead(boxKind, kindOf(unit)) && isSelectable(kindOf(unit)));
    const groups = folds.groupsOf(list);
    const first = groups.findIndex((group) => group[0] === targets[0]);
    let last = first;
    let count = first < 0 ? 0 : groups[first].length;
    while (first >= 0 && count < targets.length && last + 1 < groups.length) count += groups[++last].length;
    if (first < 0 || !groups.slice(first, last + 1).flat().every((unit, index) => targets[index] === unit) || count !== targets.length) {
      say(t("选中的块不相邻，不能一起上下移动；可以拖动其中一块的手柄，把它们一起移到别处。"));
      return false;
    }
    // A folded heading alone goes a section of its level at a time (fold/ stepOver); others a block in sight at a time.
    const alone = first === last && folds.isFolded(targets[0]);
    const step = alone ? folds.stepOver(targets[0], delta, list) : null;
    const over = alone ? step && [step.first, step.last] : groups[delta < 0 ? first - 1 : last + 1];
    if (!over) {
      say(groups.length === last - first + 1 ? t("这里只有{0}；可以拖动手柄移到别处。", targets.length === 1 ? t("这一个{0}", nameOf(targets[0])) : t("这几块")) : t("{0}已经在{1}。", name, delta < 0 ? t("最前面") : t("最后面")));
      return false;
    }
    moveTo(targets, targets[0].parentElement, delta < 0 ? withLeads(over[0])[0] : over.at(-1).nextSibling);
    if (!keepFocus) selection.select(targets, { quiet: true });
    targets[delta < 0 ? 0 : targets.length - 1].scrollIntoView({ block: "nearest", inline: "nearest" });
    say(t("已移动{0} · Ctrl+Z 撤销", name));
    return true;
  }

  // Dragging the handle of `target`: it goes with the others selected, or alone. Returns whether
  // the drag started (a block that cannot move says why).
  function start(target, x, y) {
    const picked = selection.picked;
    const chosen = picked.length > 1 && picked.includes(target) ? [...picked] : [target];
    const targets = folds.takenWith(chosen); // a folded heading with what it hides (fold/)
    const reason = targets.map(fixedText).find(Boolean);
    if (reason) {
      say(reason);
      return false;
    }
    closeMenu();
    selection.select(targets, { quiet: true });
    const session = {
      targets, target, from: target.parentElement, x, y, drop: null, rest: null, opened: new Set(), name: folds.namedWith(chosen, targets, named),
      line: element("div", { class: "ge-drop-line", hidden: "" }),
      tint: element("div", { class: "ge-drop-tint", hidden: "" }),
      preview: null,
      tree: null, measured: 0,
      at: target.getBoundingClientRect(), // where the pressed block stood (window coordinates): where its copy starts
    };
    const alive = () => drag === session;
    // The line and the tint go in the layer of where the blocks would go
    // (overlay-layer.mjs), when there is one; the copy follows the pointer in the window.
    for (const kind of ["line", "tint"]) own(session[kind], `drag ${kind}`, { owner: target, alive });
    session.preview = createPreview(targets.filter((node) => !folds.hidden(node)), x, y, { owner: target, alive }); // what is in sight
    drag = session;
    note("drag", `start ${targets.map(describe).join(", ")}`);
    targets.flatMap(withLeads).forEach((part) => part.setAttribute("data-ge-dragging", ""));
    document.documentElement.setAttribute("data-ge-drag", "");
    say(t("正在移动{0} · 拖到要放的位置后松开 · 停在选项卡上切换，停在折叠块标题上展开 · Esc 取消", session.name), "prompt");
    update();
    schedule();
    return true;
  }

  // Where dragged blocks go (drop.mjs resolveDrop), from the page's boxes as they are: measured
  // again at most every 100ms (resting on a tab or a disclosure's title changes them), in an open
  // modal dialog from its content. The tree is in page coordinates, so scrolling leaves it valid.
  function dropAt(x, y) {
    const now = performance.now();
    if (!drag.tree || now - drag.measured > 100) {
      const root = drag.target?.closest(`${DIALOG.openContent}[data-ge-box]`) ?? document.querySelector(`${DIALOG.openContent}[data-ge-box]`) ?? document.querySelector("main");
      drag.tree = root && measure(root);
      drag.measured = now;
    }
    if (!drag.tree) return null;
    const { targets } = drag;
    const kinds = drag.outside ? drag.kinds : new Set(targets.map(kindOf));
    const tabs = kinds.has("tab");
    // Tabs stay in their row; list items go wherever a list may (among blocks, in a list of their kind
    // or a new one); a flowchart's nodes into a flowchart, or wherever a flowchart may go outside any
    // (among blocks: a flowchart of their own there, or the one they land beside: moveTo), never into a
    // node or under an item (nodes never nest); anything else goes where its box takes every one of them.
    const items = [...kinds].every((kind) => kind === "item");
    const steps = [...kinds].every((kind) => kind === "step");
    const takes = (box) => (tabs ? kinds.size === 1 && targets.every((target) => target.parentElement === box.el)
      : items ? accepts(box.kind, "item") || accepts(box.kind, "list")
      : steps ? accepts(box.kind, "step") || (accepts(box.kind, "flowchart") && box.kind !== "nest" && !box.el.closest("ol.doc-flow"))
      : [...kinds].every((kind) => accepts(box.kind, kind) && !refusedWithin(box.el, kind))); // none a box around it refuses, however far in (except)
    // Blocks a column takes may go beside a block, into a column (分栏); beside a folded heading when a
    // column takes what it hides too, which goes into its column with it (besideTo).
    const aside = !tabs && [...kinds].every((kind) => accepts("column", kind)) && ((unit) => folds.withHidden(unit.el).every((node) => accepts("column", kindOf(node))));
    return resolveDrop(drag.tree, x + scrollX, y + scrollY, { takes, dragged: (unit) => targets.includes(unit.el), count: Math.max(1, targets.length), items, aside, edge: scrollX });
  }

  // Resting on a Sheet tab while dragging switches to that Sheet; resting on the title of a
  // closed disclosure opens it, so the block can go in (end() closes it again if it did not).
  function restOn(x, y) {
    const hit = document.elementFromPoint(x, y);
    const tab = drag.targets.some((target) => kindOf(target) === "tab") ? null : hit?.closest(SHEETS.tabIn) ?? null;
    const closed = tab ? null : hit?.closest("details:not([open]) > summary")?.parentElement ?? null;
    const node = tab ?? (closed && !drag.targets.some((target) => target.contains(closed)) ? closed : null);
    if (node === (drag.rest?.node ?? null)) return;
    clearTimeout(drag.rest?.timer);
    if (!node || (tab && tab.getAttribute("aria-selected") === "true")) {
      drag.rest = node ? { node, timer: 0 } : null;
      return;
    }
    drag.rest = {
      node,
      timer: setTimeout(() => {
        if (tab) tab.click();
        else {
          node.open = true;
          drag.opened.add(node);
        }
      }, 450),
    };
  }

  // Where the dragged blocks would go (drag.drop), shown as a line (none where they already are or
  // where nothing takes them) and the container they would go into tinted (not the page itself).
  function update() {
    const { x, y, line, tint } = drag;
    drag.preview?.move(x, y);
    restOn(x, y);
    // From outside, over an empty placeholder that takes what is dragged: it, tinted, and no line.
    const onto = drag.outside ? drag.onto(x, y) : null;
    if (onto) {
      drag.drop = { onto };
      line.hidden = true;
      tint.hidden = false;
      tint.setAttribute("data-onto", "");
      drawBox(tint, layerOf(onto), onto.getBoundingClientRect(), 2);
      return;
    }
    tint.removeAttribute("data-onto");
    const found = dropAt(x, y);
    drag.drop = found && { container: found.box, slot: found.slot, nest: found.nest, same: found.same, aside: found.aside ?? null };
    line.hidden = !found || found.same;
    tint.hidden = line.hidden || !found.halo;
    if (line.hidden) return;
    // The drop's rectangles are in page coordinates (drop.mjs), drawn in the layer of the container
    // the blocks would go into (overlay-layer.mjs).
    const layer = layerOf(found.box);
    const client = (rect) => ({ left: rect.left - scrollX, top: rect.top - scrollY, right: rect.right - scrollX, bottom: rect.bottom - scrollY });
    const at = client(found.line);
    drawBox(line, layer, at);
    if (found.halo) drawBox(tint, layer, client(found.halo), 2);
  }

  // Releasing (commit) or cancelling: the blocks go where the line showed, or stay.
  function end(commit) {
    if (drag?.outside) return leave();
    if (!drag) return;
    const { targets, target, drop, line, tint, preview, opened, name, at } = drag;
    clearTimeout(drag.rest?.timer);
    drag = null;
    line.remove();
    tint.remove();
    // The copy lands where the pressed block is once this is over (moved, or not), or goes back to it.
    preview.land(target, () => {
      const now = target.isConnected ? target.getBoundingClientRect() : null;
      return now && (now.width > 0 || now.height > 0) ? { dx: now.left - at.left, dy: now.top - at.top } : null;
    });
    targets.flatMap(withLeads).forEach((part) => part.removeAttribute("data-ge-dragging"));
    document.documentElement.removeAttribute("data-ge-drag");
    const lands = commit && drop && !drop.same && targets.every(alive) && drop.container.isConnected && (!drop.aside || (drop.aside.row ?? drop.aside.target).isConnected);
    note("drag", lands ? "dropped" : commit ? "released in place" : "cancelled");
    // Disclosures opened on the way close again, unless the blocks went into one of them.
    for (const details of opened) if (!(lands && details.contains(drop.container))) details.open = false;
    if (!lands) {
      selection.select(targets.filter(alive), { quiet: true });
      say(!commit ? t("已取消移动") : t("位置没有变化"));
      return;
    }
    if (drop.aside) {
      besideTo(targets, drop.aside);
      selection.select(targets, { quiet: true });
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
      say(t("{0} · 拖动栏间的竖线调宽度 · Ctrl+Z 撤销", drop.aside.whole ? t("已移动这一栏") : drop.aside.row ? t("已把{0}放进新的一栏", name) : t("已把{0}并排分栏", name)));
      return;
    }
    const others = unitsOf(drop.container).filter((unit) => !targets.includes(unit) && extentOf(unit));
    // The place is never before a box's lead (a highlight block's icon): drop.mjs. At the end, after
    // what the last block in sight hides too (a folded heading's section: fold/), never between them.
    const reference = drop.slot < others.length ? withLeads(others[drop.slot])[0] : others.length > 0 ? folds.lastOf(others.at(-1)).nextSibling : null;
    const emptied = moveTo(targets, drop.nest ?? drop.container, drop.nest ? null : reference);
    selection.select(targets, { quiet: true });
    target.scrollIntoView({ block: "nearest", inline: "nearest" });
    say(t("已移动{0}{1}{2} · Ctrl+Z 撤销", name, drop.nest ? t("到上一项下面") : "", emptied ? t("（原来的外层已空，一并去掉）") : ""));
  }

  // ---------- from outside the page (drop-in/) ----------

  // Something dragged in from outside over the page at (x, y), window coordinates: `kinds`, the unit
  // kinds of the blocks it would make, go where blocks of those kinds dragged would (the line, the
  // container tinted; resting on a Sheet tab or a closed disclosure's title opens it, the page scrolls
  // by the window's edges); `onto(x, y)`, an empty placeholder there that would take it instead, or
  // null. Returns whether it is shown (not while blocks of the page are dragged).
  function over(kinds, x, y, onto = () => null) {
    if (drag && !drag.outside) return false;
    if (!drag) {
      closeMenu();
      const session = {
        outside: true, targets: [], target: null, kinds: new Set(kinds), onto, x, y, drop: null, rest: null, opened: new Set(),
        line: element("div", { class: "ge-drop-line", hidden: "" }),
        tint: element("div", { class: "ge-drop-tint", hidden: "" }),
        preview: null, tree: null, measured: 0,
      };
      const alive = () => drag === session;
      for (const kind of ["line", "tint"]) own(session[kind], `drop ${kind}`, { alive });
      drag = session;
      note("drag", `outside ${kinds.join(", ")}`);
    }
    Object.assign(drag, { x, y, kinds: new Set(kinds), onto });
    update();
    schedule();
    return true;
  }

  // The drag from outside over: the line and tint go; disclosures opened on the way close again, but
  // the one `kept` (where what it brought goes).
  function leave(kept = null) {
    if (!drag?.outside) return;
    const { line, tint, opened } = drag;
    clearTimeout(drag.rest?.timer);
    drag = null;
    line.remove();
    tint.remove();
    note("drag", "outside over");
    for (const details of opened) if (!(kept && details.contains(kept))) details.open = false;
  }

  /**
   * New blocks (`nodes`, not on the page) where a drag from outside let go (`place`, what `place` said
   * then: a box and its slot, under a list item, beside a block in a row of columns; or { after }, right
   * after a block), one undo step (redo selects them). Returns whether they went (the place still on the page).
   */
  function put(nodes, place) {
    // Right after a block (an empty placeholder that took the first of them).
    if (place?.after) {
      const { after } = place;
      if (!after.isConnected) return false;
      struct([after.parentElement], [], () => {
        after.after(...nodes);
        return { touched: [], focus: null, selectAfter: nodes };
      });
      return true;
    }
    const aside = place?.aside;
    if (aside) {
      const at = aside.row ?? aside.target;
      if (!at?.isConnected) return false;
      struct([aside.row ?? aside.target.parentElement], [], () => {
        const { created } = aside.row ? addColumn(aside.row, aside.index, nodes) : rowAround(folds.withHidden(aside.target), [nodes], aside.side);
        return { touched: [], focus: null, selectAfter: nodes, created };
      });
      return true;
    }
    const container = place?.nest ?? place?.container;
    if (!container?.isConnected) return false;
    // The place among the blocks in sight, as a block dragged there goes: never before a box's lead, at
    // the end after what the last block hides (a folded heading's section); under an item, at its end.
    const others = place.nest ? [] : unitsOf(place.container).filter((unit) => extentOf(unit));
    const reference = place.nest ? null : place.slot < others.length ? withLeads(others[place.slot])[0] : others.length > 0 ? folds.lastOf(others.at(-1)).nextSibling : null;
    struct([container], [], () => {
      placeBefore(container, nodes, reference);
      return { touched: [], focus: null, selectAfter: nodes };
    });
    return true;
  }

  // The window losing the focus, or the page going out of sight, ends a drag: cancelled.
  addEventListener("blur", () => end(false));
  document.addEventListener("visibilitychange", () => { if (document.hidden) end(false); });

  return {
    start,
    /** The pointer moved while dragging. */
    move(x, y) {
      if (!drag) return;
      drag.x = x;
      drag.y = y;
      update();
    },
    end,
    /** A frame while dragging: the page scrolls near the window's edges, the drop follows. */
    step() {
      if (!drag) return;
      edgeScroll(drag.x, drag.y, drag.outside ? document.querySelector(DIALOG.openContent) : drag.target.closest(DIALOG.openContent)); // the card it started in (from outside: the one open), else the window
      update();
    },
    moveBy,
    /** Blocks are being dragged. */
    get active() { return Boolean(drag); },
    /** The block whose handle was pressed (its handle stays), while dragging. */
    get target() { return drag?.target ?? null; },
    get nodes() { return drag?.preview ? [drag.preview.node] : []; },
    /** What is dragged in from outside the page (drop-in/): shown over the page, where it would go, gone, put there. */
    outside: {
      over,
      leave,
      put,
      /** Where it would go now: { onto } (an empty placeholder), { container, slot, nest, aside }, or null (nowhere). */
      get place() { return drag?.outside ? drag.drop : null; },
    },
  };
}
