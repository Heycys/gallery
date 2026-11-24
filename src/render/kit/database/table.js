// The table view of a database: a grid of the records' values (.tbl: a row per record, a cell per column shown),
// the room at its left (.gut) holding each row's handle, its first column staying as the columns scroll
// sideways, its own thin scrollbar under it (ui/rail.js).
//
// - Cells are selected (a press, a drag, Shift; the cell the keys are at framed, the others of a range lit):
//   the arrows (Shift: grow, Ctrl/⌘: to the end), Tab, Enter or F2 or a second press (or the first, as the view
//   says: clickEdit) edits, a key typed edits starting with it, Delete clears, Ctrl/⌘+D fills down, Ctrl/⌘+A
//   selects all, Space opens the record (checks a box).
// - Copied, cut and pasted as words between tabs and lines (a spreadsheet's, Excel's or another table's): a
//   paste goes from the selection's top left, new records where it runs past the last; one value pasted over
//   several cells fills them all.
// - A header pressed edits its name where it stands, its menu right under it; its kind's icon opens the menu at
//   its kinds; its arrow sorts (ascending, descending, none); dragged, the column moves (a copy of it under the
//   pointer, a line where it goes: by the copy, not the pointer, its leading edge past a column's middle,
//   src/shared/drag-place.mjs); its right edge dragged sizes it (held until it is let go: the store tells the page).
// - A row's handle (in the room at its left, under the pointer): dragged, the row moves (no sort or group: the
//   file's order; where it goes by its copy as a column's); pressed, its menu. With the pointer on the header row,
//   a dot at the top of the nearest column edge; in the room at the left, at the left of the nearest row edge: on it
//   a +, a line along the edge saying where, a press puts a column or a row in there. Past the last column the
//   header's +: a column (the view's hidden ones listed first).
// - Grouped, a heading row per group (a click folds it), its totals in each column where the calculation row
//   shows; the calculation row at the bottom, a click on a cell choosing what it works out.
// What a change of the records redraws is its row alone (`update`), every other row kept as it is; a long view
// draws the rows in the window's sight and a screen's worth around them.
import { along, beforeIndex, placeInRow } from "../../../shared/drag-place.mjs";
import { calc, calcKinds, calcLabel, groupRows, parseTSV } from "./data/query.js";
import { alignOf, editText, exactText, getValue, isRowDone, safeHref } from "./data/values.js";
import { tableClip } from "./clipboard.js";
import { openEditor } from "./editors.js";
import { headNameInput, newPropMenu, propMenu } from "./props.js";
import { attr, h, text, toggle, kids } from "./ui/dom.js";
import { icon, typeIcon } from "./ui/icons.js";
import { item, pop, sep } from "./ui/menu.js";
import { createRail } from "./ui/rail.js";
import { pill, valueView } from "./ui/values.js";
import { w } from "./words.js";

const widthOf = (prop) => prop.width || (prop.type === "title" ? 240 : 160);
/** The room left of the rows: their handles and the + that puts a row in, still as the table scrolls sideways. */
const GUTTER = 32;
/** Each row's line runs on a little past the last column (to the right edge where the table is narrower than its frame). */
const FILL = 40;

/**
 * The width a table view `view` of the store's database takes past the text's left edge (its columns' widths and
 * the room past the last, its rows' gutter left of the text), whether it is shown or not: what 宽多维表格 places every
 * view of the database by (app.js `place`, across.js). The columns it shows are those drawn (`compute`): the title
 * and those it does not hide, notes never.
 */
export const tableWidthOf = (store, view) => store.doc.props.filter((prop) => !prop.notes && (prop.type === "title" || !(view.hidden ?? []).includes(prop.id))).reduce((sum, prop) => sum + widthOf(prop), 0) + FILL;
const EMPTY = "__empty";
const DRAG = 5; // px a press moves before it drags
// Whether nodes drawn anew (`next`) are what a cell holds already (`now`): the same markup, by isEqualNode.
const sameNodes = (now, next) => now.length === next.length && next.every((node, at) => node.isEqualNode(now[at]));

/** The table view of the store's database for `db` (the drawing's: the view, its records, its changes). */
export function createTable(store, db) {
  const headRow = h("div", { class: "tr th-row" }, h("div", { class: "gut" }));
  const calcRow = h("div", { class: "tr calc-row" });
  const tbl = h("div", { class: "tbl" }, headRow);
  const wrap = h("div", { class: "tbl-wrap no-native-scrollbar", tabindex: "0" }, tbl);
  const element = h("div", { class: "tbl-frame" }, wrap);
  const rail = createRail(wrap, { start: () => GUTTER + (cols[0] ? widthOf(cols[0]) : 0) });
  element.append(rail.element);
  // Its right edge fades while columns lie past it (database.css: .tbl-wrap.more-end), said again as it scrolls and as
  // it or its columns change size.
  const edge = () => toggle(wrap, "more-end", wrap.scrollWidth - wrap.clientWidth > 1 && wrap.scrollLeft < wrap.scrollWidth - wrap.clientWidth - 1);
  wrap.addEventListener("scroll", edge, { passive: true });
  const edgeSizes = new ResizeObserver(edge);
  edgeSizes.observe(wrap);
  edgeSizes.observe(tbl);
  const fillHead = h("div", { class: "th fill" });

  let cols = [];
  let nav = []; // the records shown, in order (a folded group's left out)
  let prefillOf = new Map(); // a record put in beside another is of its group
  let maxes = {};
  let calcCols = []; // the columns the calculations row was drawn of
  let sel = null; // { r0, c0, r1, c1 }: indices into nav and cols
  let editing = null; // { rowId, propId, handle }
  let press = null; // a press on a cell: { r, c, was, moved }
  let collapsed = new Set();
  let renaming = null; // { propId, input }: a header's name typed where it stands
  let colsKey = "";
  let dragging = false; // a row or a column dragged: no + points, no end's +
  const rowCache = new Map(); // a record's id -> { tr, row, sig, r }
  // The rows drawn: those in the window's sight and a screen's worth around them, spacers standing for the others
  // (a long view is a few dozen rows in the page, not hundreds: switching to it, typing in it and the editor's work
  // on the page around it stay quick). Each row's height as measured once drawn, the others the usual one's.
  let items = []; // what the body shows, in order: { kind: "row" | "group" | "empty", ... }
  let itemOfRow = []; // a record's place in nav -> its place in items
  const heights = new Map(); // an item's key -> its height as drawn (its margin too)
  let rowHeight = 35;
  let shown = [0, -1]; // the items drawn
  const topSpace = h("div", { class: "tr-space", "aria-hidden": "true" });
  const bottomSpace = h("div", { class: "tr-space", "aria-hidden": "true" });
  let tableWidth = 0; // px: its columns' widths and the room past the last

  const view = () => db.view();
  const editable = () => store.editable;
  const range = () => sel && { top: Math.min(sel.r0, sel.r1), bottom: Math.max(sel.r0, sel.r1), left: Math.min(sel.c0, sel.c1), right: Math.max(sel.c0, sel.c1) };
  const cellAt = (r, c) => tbl.querySelector(`[data-cell="${r}-${c}"]`);
  const focusWrap = () => wrap.focus({ preventScroll: true });
  const app = () => element.closest(".doc-database-app");

  // ---------- drawing ----------
  function compute() {
    const now = view();
    cols = store.doc.props.filter((prop) => !prop.notes && (prop.type === "title" || !now.hidden.includes(prop.id)));
    const { rows, stale } = store.rowsOf(now);
    const group = now.groupBy ? store.byId[now.groupBy] : null;
    items = [];
    nav = [];
    prefillOf = new Map();
    if (group) {
      for (const each of groupRows(rows, group, store.byId)) {
        const key = `${group.id}:${each.key}`;
        items.push({ kind: "group", key, group: each });
        const prefill = each.key === "" || !["select", "multi", "checkbox"].includes(group.type) ? {} : { [group.id]: group.type === "multi" ? [each.key] : group.type === "checkbox" ? each.key === "yes" : each.key };
        if (!collapsed.has(key)) for (const row of each.rows) { items.push({ kind: "row", row, r: nav.length }); nav.push(row); prefillOf.set(row.id, prefill); }
      }
    } else for (const row of rows) { items.push({ kind: "row", row, r: nav.length }); nav.push(row); }
    if (!nav.length && !group) items.push({ kind: "empty" });
    itemOfRow = [];
    items.forEach((entry, at) => { if (entry.kind === "row") itemOfRow[entry.r] = at; });
    maxes = {};
    for (const prop of cols) if (prop.type === "number" && prop.numberFormat?.display === "bar" && prop.numberFormat.format !== "percent") maxes[prop.id] = Math.max(0, ...rows.map((row) => (typeof row.values[prop.id] === "number" ? row.values[prop.id] : 0)));
    return { items, stale, group, rows };
  }

  function draw() {
    const now = view();
    const { rows } = compute();
    // What every row's cells depend on besides their record: the columns, their kinds and looks, the bars' wholes.
    const key = JSON.stringify([cols.map((prop) => [prop.id, prop.type, prop.options, prop.numberFormat, prop.align, prop.formula, widthOf(prop)]), maxes, store.doc.props.length, editable(), Boolean(now.wrap), now.open, now.sorts.length > 0 || Boolean(now.groupBy)]);
    if (key !== colsKey) {
      colsKey = key;
      rowCache.clear();
    }
    toggle(wrap, "wrap-text", Boolean(now.wrap));
    drawHead(now);
    drawCalc(now, rows);
    drawRows(true);
    const ids = new Set(nav.map((row) => row.id));
    for (const id of [...rowCache.keys()]) if (!ids.has(id)) rowCache.delete(id);
    clampSelection();
    paintSelection();
    placeEditor();
    rail.place();
    edge();
  }

  const keyOf = (entry) => (entry.kind === "row" ? `r:${entry.row.id}` : entry.kind === "group" ? `g:${entry.key}` : "empty");
  const heightOf = (entry) => heights.get(keyOf(entry)) ?? (entry.kind === "group" ? rowHeight + 14 : rowHeight);
  const ALL = 60; // a view of this many rows or fewer is drawn whole
  const AROUND = 720; // px drawn above and below what the window shows

  // The items to draw: those within AROUND of what the window shows (all of a short view); `keep`, an item that
  // must be among them (the keys moved to it).
  function windowOf(keep = -1) {
    if (items.length <= ALL) return [0, items.length - 1];
    const sight = innerHeight || 800;
    const start = headRow.getBoundingClientRect().bottom; // where the first item stands on the screen
    const top = -AROUND - start;
    const bottom = sight + AROUND - start;
    let y = 0;
    let first = 0;
    let last = items.length - 1;
    for (let at = 0; at < items.length; at++) {
      const tall = heightOf(items[at]);
      if (y + tall <= top) first = at + 1;
      if (y > bottom) { last = at - 1; break; }
      y += tall;
    }
    first = Math.min(first, items.length - 1);
    last = Math.max(last, first);
    if (keep >= 0 && (keep < first || keep > last)) {
      const span = Math.max(20, last - first);
      first = Math.max(0, Math.min(keep - Math.floor(span / 2), items.length - 1 - span));
      last = Math.min(items.length - 1, first + span);
    }
    return [first, last];
  }

  /** The rows in sight drawn (`fresh`: the items changed, every row looked at again). */
  function drawRows(fresh = false, keep = -1) {
    const now = view();
    const span = windowOf(keep);
    if (!fresh && span[0] === shown[0] && span[1] === shown[1]) return false;
    shown = span;
    const { stale } = store.rowsOf(now);
    const group = now.groupBy ? store.byId[now.groupBy] : null;
    const nodes = [headRow];
    let above = 0;
    let below = 0;
    const drawn = [];
    items.forEach((entry, at) => {
      if (at < span[0]) above += heightOf(entry);
      else if (at > span[1]) below += heightOf(entry);
      else if (entry.kind === "group") drawn.push(groupRow(entry.key, entry.group, group, now));
      else if (entry.kind === "empty") drawn.push(emptyRow());
      else drawn.push(dataRow(entry.row, entry.r, stale.has(entry.row.id)));
    });
    topSpace.style.height = `${above}px`;
    bottomSpace.style.height = `${below}px`;
    if (above > 0) nodes.push(topSpace);
    nodes.push(...drawn);
    if (below > 0) nodes.push(bottomSpace);
    if (now.showCalc) nodes.push(calcRow);
    const keepNodes = new Set(nodes);
    for (const child of [...tbl.children]) if (!keepNodes.has(child)) child.remove();
    let at = tbl.firstElementChild;
    for (const node of nodes) {
      if (node !== at) tbl.insertBefore(node, at);
      else at = at.nextElementSibling;
    }
    if (items.length > ALL) measureSoon();
    return true;
  }

  // The rows drawn measured in the next frame: their heights the spacers count by from then on.
  let measuring = 0;
  function measureSoon() {
    if (measuring) return;
    measuring = requestAnimationFrame(() => {
      measuring = 0;
      if (!wrap.isConnected) return;
      let changed = false;
      for (const node of tbl.children) {
        if (node === headRow || node === calcRow || node.classList.contains("tr-space")) continue;
        const key = node.dataset.rowid && node.dataset.rowid !== EMPTY ? `r:${node.dataset.rowid}` : node.dataset.group ? `g:${node.dataset.group}` : null;
        if (!key) continue;
        const tall = node.getBoundingClientRect().height + parseFloat(getComputedStyle(node).marginTop || "0");
        if (Math.abs((heights.get(key) ?? -1) - tall) > 0.5) changed = true;
        heights.set(key, tall);
        if (key.startsWith("r:")) rowHeight = tall;
      }
      if (changed) {
        drawRows(true);
        paintSelection();
      }
    });
  }

  // The window scrolled: the rows now in sight drawn (once a frame).
  let scrolling = 0;
  const onPageScroll = () => {
    if (scrolling || items.length <= ALL) return;
    scrolling = requestAnimationFrame(() => {
      scrolling = 0;
      if (!wrap.isConnected) return;
      if (drawRows()) {
        placeEditor();
        paintSelection();
      }
    });
  };
  addEventListener("scroll", onPageScroll, { passive: true, capture: true });

  /** The item at `at` drawn (a long view's), so that it can be brought into sight. */
  function bring(at) {
    if (items.length <= ALL || at === undefined || at < 0) return;
    if (at >= shown[0] && at <= shown[1]) return;
    if (drawRows(true, at)) {
      placeEditor();
      paintSelection();
    }
  }

  function drawHead(now) {
    const widths = cols.map(widthOf);
    const total = widths.reduce((sum, width) => sum + width, 0);
    tableWidth = total + FILL;
    tbl.style.width = `${GUTTER + total + FILL}px`;
    const heads = [headRow.firstElementChild];
    for (const [c, prop] of cols.entries()) {
      let th = headRow.querySelector(`:scope > [data-head="${CSS.escape(prop.id)}"]`);
      if (!th) th = makeHead(prop);
      fillHeadCell(th, prop, c, now);
      heads.push(th);
    }
    heads.push(fillHead);
    const addShown = editable() && !dragging && cols.length > 0;
    if (addShown && !fillAdd.isConnected) fillHead.append(fillAdd);
    else if (!addShown && fillAdd.isConnected) fillAdd.remove();
    const keep = new Set(heads);
    for (const child of [...headRow.children]) if (!keep.has(child)) child.remove();
    let at = headRow.firstElementChild;
    for (const node of heads) {
      if (node !== at) headRow.insertBefore(node, at);
      else at = at.nextElementSibling;
    }
  }

  function makeHead(prop) {
    return h("div", { "data-head": prop.id },
      h("span", { class: "th-type" }),
      h("span", { class: "th-name" }),
      h("button", { type: "button", class: "th-sort-btn" }));
  }

  function fillHeadCell(th, prop, c, now) {
    const sortAt = now.sorts.findIndex((sort) => sort.prop === prop.id);
    const sort = sortAt >= 0 ? now.sorts[sortAt] : null;
    const moving = th.classList.contains("moving");
    const className = `th${c === 0 ? " sticky" : ""}${alignClass(prop)}${sort ? " sorted" : ""}${moving ? " moving" : ""}${renaming?.propId === prop.id ? " head-edit" : ""}`;
    if (th.className !== className) th.className = className;
    th.style.width = `${widthOf(prop)}px`;
    const type = th.querySelector(".th-type");
    const fixed = prop.type === "title" || !editable();
    toggle(type, "fixed", fixed);
    attr(type, "data-doc-tip", fixed ? null : w("更改类型"));
    if (type.dataset.type !== prop.type) {
      type.dataset.type = prop.type;
      type.replaceChildren(...kids(typeIcon(prop.type, 15)));
    }
    if (renaming?.propId !== prop.id) {
      let name = th.querySelector(".th-name");
      if (!name) {
        name = h("span", { class: "th-name" });
        th.querySelector(".th-input-wrap")?.replaceWith(name);
      }
      text(name, prop.name);
    }
    const button = th.querySelector(".th-sort-btn");
    const said = !sort ? w("升序排列") : sort.dir === "asc" ? w("改为降序") : w("取消排序");
    attr(button, "aria-label", said);
    attr(button, "data-doc-tip", said);
    toggle(button, "on", Boolean(sort));
    const several = Boolean(sort) && now.sorts.length > 1;
    toggle(button, "has-n", several);
    const name = !sort ? "sortNone" : sort.dir === "asc" ? "sortAsc" : "sortDesc";
    const shows = `${name}${several ? sortAt + 1 : ""}`;
    if (button.dataset.shows !== shows) {
      button.dataset.shows = shows;
      button.replaceChildren(...kids(icon(name, 16, { bold: sort ? 2.1 : 1.8 }), several ? h("span", { class: "th-sort-n" }, String(sortAt + 1)) : null));
    }
    const resizer = th.querySelector(":scope > .resizer");
    if (editable() && !resizer) th.append(h("span", { class: "resizer" }));
    else if (!editable() && resizer) resizer.remove();
  }

  // The end past the last column: its header shows a + while the pointer is in it, a new column at the end.
  const fillAdd = h("button", { type: "button", class: "fill-add", "aria-label": w("新建属性"), "data-doc-tip": w("新建属性") }, icon("plus", 15));
  fillAdd.addEventListener("mousedown", (event) => event.stopPropagation());
  fillAdd.addEventListener("click", () => openNewColumn(fillAdd));

  const alignClass = (prop) => (alignOf(prop) === "left" ? "" : ` al-${alignOf(prop)}`);

  function dataRow(row, r, stale) {
    const done = isRowDone(row, store.doc.props);
    const sig = `${stale}|${done}|${store.ui.peek === row.id}`;
    const cached = rowCache.get(row.id);
    if (cached && cached.row === row && cached.sig === sig) {
      if (cached.r !== r) {
        cached.r = r;
        cellsOf(cached.tr).forEach((td, c) => { td.dataset.cell = `${r}-${c}`; });
      }
      return cached.tr;
    }
    const tr = cached?.tr ?? makeRow(row.id);
    fillRow(tr, row, r, stale, done);
    rowCache.set(row.id, { tr, row, sig, r });
    return tr;
  }

  const cellsOf = (tr) => [...tr.children].filter((node) => node.dataset.cell !== undefined);

  function makeRow(id) {
    return h("div", { class: "tr", "data-rowid": id }, h("div", { class: "gut" }), h("div", { class: "td fill" }));
  }

  function fillRow(tr, row, r, stale, done) {
    toggle(tr, "stale", stale);
    attr(tr, "data-doc-tip", stale ? w("这条记录已不符合当前筛选，切换视图后会隐藏") : null);
    const gut = tr.firstElementChild;
    let handle = gut.firstElementChild;
    if (editable() && !handle) gut.append(handle = h("button", { type: "button", class: "row-handle" }, icon("grip", 14)));
    else if (!editable() && handle) handle.remove();
    if (editable()) attr(handle, "data-doc-tip", canReorder() ? w("拖动调整顺序，点击打开菜单") : w("点击打开菜单"));
    const fill = tr.lastElementChild;
    const cells = cellsOf(tr);
    const editingHere = editing && editing.rowId === row.id ? editing.propId : null;
    cols.forEach((prop, c) => {
      let td = cells[c];
      if (!td) {
        td = h("div", { class: "td" });
        tr.insertBefore(td, fill);
        cells.push(td);
      }
      td.dataset.cell = `${r}-${c}`;
      td.dataset.prop = prop.id;
      const width = `${widthOf(prop)}px`;
      if (td.style.width !== width) td.style.width = width;
      const isEditing = editingHere === prop.id;
      const className = `td${c === 0 ? " sticky" : ""}${alignClass(prop)}${selClass(r, c)}${prop.type === "title" && done ? " done" : ""}${isEditing ? " editing" : ""} t-${prop.type}`;
      if (td.className !== className) td.className = className;
      if (isEditing && td.querySelector(":scope > .cell-editor")) return; // the editor stays, the cell drawn once it is done
      const extra = [];
      if (prop.type === "title") {
        const open = store.ui.peek === row.id;
        extra.push(h("span", { class: `cell-act open-btn${open ? " on" : ""}`, "data-doc-tip": open ? w("关闭详情") : null }, icon(view().open === "center" ? "center" : "open", 13), w("打开")));
      }
      if (prop.type === "url" && safeHref(row.values[prop.id])) extra.push(h("a", { class: "cell-act url-open", href: safeHref(row.values[prop.id]), target: "_blank", rel: "noreferrer", "data-doc-tip": w("在新标签页打开") }, icon("arrowUpRight", 13)));
      // A cell drawn as it is drawn already stays (a cell's words typed beside it): a cell put in anew has the
      // browser lay out the whole table again, tens of rows of it, at every character.
      const next = kids(valueView(store, row, prop, "table", maxes[prop.id]), ...extra);
      if (!sameNodes(td.childNodes, next)) td.replaceChildren(...next);
    });
    for (const extra of cells.slice(cols.length)) extra.remove();
  }

  function groupRow(key, group, prop, now) {
    const folded = collapsed.has(key);
    const option = prop.type === "select" || prop.type === "multi" ? prop.options?.find((each) => each.id === group.key) : undefined;
    const head = h("div", { class: "td group-head sticky", style: { width: `${widthOf(cols[0])}px` }, on: { click: () => { if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key); collapsed = new Set(collapsed); draw(); } } },
      icon(folded ? "chevronRight" : "chevronDown", 14, { cls: "group-tog" }), option ? pill(option) : h("span", { class: "group-label" }, group.label), h("span", { class: "group-n" }, String(group.rows.length)));
    return h("div", { class: "tr group-row", "data-group": key }, h("div", { class: "gut" }), head, ...cols.slice(1).map((each) => {
      const kind = now.calc[each.id];
      return h("div", { class: `td group-calc${alignClass(each)}`, style: { width: `${widthOf(each)}px` } }, ...(now.showCalc && kind && kind !== "none" ? [h("span", { class: "calc-k" }, calcLabel(kind)), calc(group.rows, each, kind, store.byId)] : []));
    }), h("div", { class: "td fill group-calc" }));
  }

  function emptyRow() {
    return h("div", { class: "tr empty-row", "data-rowid": EMPTY }, h("div", { class: "gut" }), h("div", { class: "td sticky empty-cell", style: { width: `${widthOf(cols[0])}px` } }, w("还没有记录")), ...cols.slice(1).map((prop) => h("div", { class: "td", style: { width: `${widthOf(prop)}px` } })), h("div", { class: "td fill" }));
  }

  function drawCalc(now, rows) {
    if (!now.showCalc) {
      calcCols = [];
      return;
    }
    const has = cols.some((prop) => now.calc[prop.id] && now.calc[prop.id] !== "none");
    const cells = [h("div", { class: "gut" }), ...cols.map((prop) => {
      const kind = now.calc[prop.id];
      const on = kind && kind !== "none";
      const td = h("div", { class: `td calc-cell${on ? " on" : ""}${prop.type === "title" ? " sticky" : ""}${alignClass(prop)}`, style: { width: `${widthOf(prop)}px` } },
        ...(on ? [h("span", { class: "calc-k" }, calcLabel(kind)), h("span", { class: "num" }, calc(rows, prop, kind, store.byId))] : [h("span", { class: "calc-ph" }, w("计算"), icon("chevronDown", 11))]));
      td.addEventListener("click", () => calcMenu(td, prop));
      return td;
    }), h("div", { class: "td fill calc-cell" })];
    toggle(calcRow, "has", has);
    // The same row of the same columns stays (its cells' menus are of those columns): a row put in anew lays the table out again.
    if (calcCols.length === cols.length && calcCols.every((prop, at) => prop === cols[at]) && sameNodes(calcRow.childNodes, cells)) return;
    calcCols = [...cols];
    calcRow.replaceChildren(...cells);
  }

  function calcMenu(anchor, prop) {
    pop(store.layer, anchor, {
      width: 180,
      placement: "top",
      build: (node, api) => {
        const current = view().calc[prop.id] || "none";
        calcKinds(prop).forEach((group, at) => {
          if (at > 0) node.append(sep());
          node.append(...kids(...group.map((kind) => item({ label: calcLabel(kind), checked: current === kind, onClick: () => { db.updateView({ calc: { ...view().calc, [prop.id]: kind } }); api.close(); } }))));
        });
      },
    });
  }

  // ---------- the selection ----------
  function clampSelection() {
    if (!sel) return;
    const maxR = nav.length - 1;
    const maxC = cols.length - 1;
    if (maxR < 0 || maxC < 0) { sel = null; return; }
    const k = (value, most) => Math.max(0, Math.min(value, most));
    sel = { r0: k(sel.r0, maxR), r1: k(sel.r1, maxR), c0: k(sel.c0, maxC), c1: k(sel.c1, maxC) };
  }

  // A cell's selection: the cell the keys are at framed (cursor), the others of a range of several lit (in-sel).
  function selClass(r, c) {
    const area = range();
    if (!area) return "";
    const many = Boolean(sel.row) || area.bottom > area.top || area.right > area.left;
    const inside = r >= area.top && r <= area.bottom && c >= area.left && c <= area.right;
    return `${many && inside ? " in-sel" : ""}${sel.r1 === r && sel.c1 === c ? " cursor" : ""}`;
  }

  let painted = [];
  function paintSelection() {
    for (const td of painted) td.classList.remove("in-sel", "cursor");
    painted = [];
    const area = range();
    if (!area) return;
    const many = area.bottom > area.top || area.right > area.left;
    if (many) {
      for (let r = area.top; r <= area.bottom; r++) {
        const at = itemOfRow[r];
        if (at === undefined || at < shown[0] || at > shown[1]) continue;
        for (let c = area.left; c <= area.right; c++) {
          const td = cellAt(r, c);
          if (!td) continue;
          td.classList.add("in-sel");
          painted.push(td);
        }
      }
    }
    // A row picked by its handle (sel.row) is its fill alone: no cell of it framed as the keys' place.
    const cursor = sel.row ? null : cellAt(sel.r1, sel.c1);
    if (cursor) {
      cursor.classList.add("cursor");
      painted.push(cursor);
    }
  }

  function select(next, { reveal = true } = {}) {
    sel = next;
    if (reveal && sel) bring(itemOfRow[sel.r1]);
    paintSelection();
    if (reveal && sel) cellAt(sel.r1, sel.c1)?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  function move(dr, dc, extend = false) {
    if (!nav.length || !cols.length) return;
    const from = sel || { r0: 0, c0: 0, r1: 0, c1: 0 };
    const r = Math.max(0, Math.min(nav.length - 1, from.r1 + dr));
    const c = Math.max(0, Math.min(cols.length - 1, from.c1 + dc));
    select(extend ? { ...from, r1: r, c1: c } : { r0: r, c0: c, r1: r, c1: c });
  }

  // ---------- editing a cell ----------
  function startEdit(r, c, init) {
    const prop = cols[c];
    const row = nav[r];
    if (!prop || !row || !editable()) return;
    if (prop.type === "formula") { store.snack(w("公式列由公式算出，点列标题可以修改公式")); return; }
    if (prop.type === "checkbox") { store.setCell(row.id, prop.id, row.values[prop.id] !== true); return; }
    endEdit();
    bring(itemOfRow[r]);
    const td = cellAt(r, c);
    if (!td) return;
    td.classList.add("editing");
    editing = { rowId: row.id, propId: prop.id, handle: null };
    hideTools();
    let handle = null;
    handle = openEditor(store, {
      row,
      prop,
      place: td,
      surface: "table",
      init,
      onDone: (direction) => {
        if (editing?.handle && handle && editing.handle !== handle) return;
        editing = null;
        for (const each of tbl.querySelectorAll(".td.editing")) each.classList.remove("editing");
        redrawRow(row.id);
        focusWrap();
        if (direction === "down") move(1, 0);
        else if (direction === "right") move(0, 1);
        else if (direction === "left") move(0, -1);
        else paintSelection();
      },
      onGridPaste: (words) => {
        editing = null;
        select({ r0: r, c0: c, r1: r, c1: c });
        focusWrap();
        pasteGrid(words, { r, c });
      },
    });
    if (!handle) { editing = null; td.classList.remove("editing"); return; }
    editing.handle = handle;
  }

  function endEdit() {
    editing?.handle?.close();
    editing = null;
  }

  // The editor stays in its cell as the rows are drawn again around it (its record's change, someone else's write).
  function placeEditor() {
    if (!editing?.handle) return;
    const r = nav.findIndex((row) => row.id === editing.rowId);
    const c = cols.findIndex((prop) => prop.id === editing.propId);
    const td = r >= 0 && c >= 0 ? cellAt(r, c) : null;
    if (!td) { endEdit(); return; }
    if (!td.contains(editing.handle.element)) {
      const focused = document.activeElement;
      td.replaceChildren(...kids(editing.handle.element));
      td.classList.add("editing");
      if (editing.handle.element.contains(focused)) focused.focus({ preventScroll: true });
    }
  }

  function redrawRow(id) {
    const cached = rowCache.get(id);
    if (!cached) return;
    const { stale } = store.rowsOf(view());
    const row = store.doc.rows.find((each) => each.id === id);
    if (!row) return;
    fillRow(cached.tr, row, cached.r, stale.has(id), isRowDone(row, store.doc.props));
    cached.row = row;
  }

  // ---------- changing the cells ----------
  function clearRange() {
    const area = range();
    if (!area || !editable()) return;
    const writes = [];
    for (let r = area.top; r <= area.bottom; r++) for (let c = area.left; c <= area.right; c++) if (cols[c].type !== "formula") writes.push({ rowId: nav[r].id, propId: cols[c].id, text: "" });
    if (writes.length) store.writeCells(writes);
  }

  function fillDown() {
    const area = range();
    if (!area || area.bottom === area.top || !editable()) return;
    const writes = [];
    for (let c = area.left; c <= area.right; c++) {
      const prop = cols[c];
      const source = editText(getValue(nav[area.top], prop, store.byId), prop);
      for (let r = area.top + 1; r <= area.bottom; r++) writes.push({ rowId: nav[r].id, propId: prop.id, text: source });
    }
    store.writeCells(writes);
    store.snack(w("已向下填充 {0} 行", area.bottom - area.top));
  }

  function selectionTSV() {
    const area = range();
    if (!area) return "";
    const lines = [];
    for (let r = area.top; r <= area.bottom; r++) {
      const cells = [];
      for (let c = area.left; c <= area.right; c++) {
        const prop = cols[c];
        const words = prop.type === "checkbox" ? (nav[r].values[prop.id] === true ? w("是") : "") : exactText(getValue(nav[r], prop, store.byId), prop);
        cells.push(/[\t\n"]/.test(words) ? `"${words.replace(/"/g, '""')}"` : words);
      }
      lines.push(cells.join("\t"));
    }
    return lines.join("\n");
  }

  function pasteGrid(words, at) {
    if (!words || !editable()) return;
    const grid = parseTSV(words.replace(/\r\n?/g, "\n").replace(/\n$/, ""));
    if (!grid.length) return;
    const area = range();
    const start = at || (area ? { r: area.top, c: area.left } : { r: nav.length, c: 0 });
    const writes = [];
    const newRows = [];
    const many = area && (area.bottom > area.top || area.right > area.left);
    if (!at && grid.length === 1 && grid[0].length === 1 && many) {
      for (let r = area.top; r <= area.bottom; r++) for (let c = area.left; c <= area.right; c++) writes.push({ rowId: nav[r].id, propId: cols[c].id, text: grid[0][0] });
    } else {
      const group = view().groupBy;
      grid.forEach((line, i) => {
        let row = nav[start.r + i];
        if (!row) {
          if (group) return;
          row = store.newRow();
          newRows.push(row);
        }
        line.forEach((cell, j) => { const prop = cols[start.c + j]; if (prop) writes.push({ rowId: row.id, propId: prop.id, text: cell }); });
      });
    }
    store.writeCells(writes, newRows);
    const tall = grid.length;
    const wide = Math.min(grid[0].length, cols.length - start.c);
    select({ r0: start.r, c0: start.c, r1: Math.min(start.r + tall - 1, nav.length - 1), c1: start.c + Math.max(0, wide - 1) });
    store.snack(newRows.length ? w("已粘贴 {0} 格，新增 {1} 行", writes.length, newRows.length) : w("已粘贴 {0} 格", writes.length));
  }

  // ---------- the keys ----------
  wrap.addEventListener("keydown", (event) => {
    if (editing || event.target !== wrap) return;
    if (event.isComposing) return;
    const mod = event.metaKey || event.ctrlKey;
    if (!sel) {
      if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter", "Tab"].includes(event.key) && nav.length) {
        event.preventDefault();
        select({ r0: 0, c0: 0, r1: 0, c1: 0 });
      }
      return;
    }
    switch (event.key) {
      case "ArrowDown": event.preventDefault(); return move(mod ? 9999 : 1, 0, event.shiftKey);
      case "ArrowUp": event.preventDefault(); return move(mod ? -9999 : -1, 0, event.shiftKey);
      case "ArrowLeft": event.preventDefault(); return move(0, mod ? -9999 : -1, event.shiftKey);
      case "ArrowRight": event.preventDefault(); return move(0, mod ? 9999 : 1, event.shiftKey);
      case "Tab": event.preventDefault(); return move(0, event.shiftKey ? -1 : 1);
      case "Enter": case "F2": event.preventDefault(); return startEdit(sel.r1, sel.c1);
      case "Delete": case "Backspace": event.preventDefault(); return clearRange();
      case "Escape": select(null); return;
      case " ":
        event.preventDefault();
        if (cols[sel.c1]?.type === "checkbox") return startEdit(sel.r1, sel.c1);
        return db.openRow(nav[sel.r1].id);
    }
    if (mod && event.key.toLowerCase() === "d") { event.preventDefault(); return fillDown(); }
    if (mod && event.key.toLowerCase() === "a") { event.preventDefault(); return select({ r0: 0, c0: 0, r1: nav.length - 1, c1: cols.length - 1 }, { reveal: false }); }
    if (!mod && !event.altKey && event.key.length === 1) {
      const prop = cols[sel.c1];
      if (prop && !["checkbox", "formula"].includes(prop.type)) { event.preventDefault(); startEdit(sel.r1, sel.c1, event.key); }
    } else if (event.key === "Process" && cols[sel.c1] && !["checkbox", "formula"].includes(cols[sel.c1].type)) {
      // An input method's first key: the cell's field takes the composition from here.
      startEdit(sel.r1, sel.c1, "");
    }
  });

  const copySelection = (event) => {
    event.preventDefault();
    const words = selectionTSV();
    tableClip.last = words;
    event.clipboardData.setData("text/plain", words);
    const area = range();
    store.snack(w("已复制 {0} 格", (area.bottom - area.top + 1) * (area.right - area.left + 1)));
  };
  wrap.addEventListener("copy", (event) => {
    if (editing || !range() || event.target !== wrap) return;
    copySelection(event);
  });
  wrap.addEventListener("cut", (event) => {
    if (editing || !range() || event.target !== wrap) return;
    copySelection(event);
    clearRange();
  });
  wrap.addEventListener("paste", (event) => {
    if (editing || event.target !== wrap || !editable()) return;
    event.preventDefault();
    pasteGrid(event.clipboardData.getData("text/plain"));
  });

  // The pointer in the room past the last column (of any row): the header's + shows (database.css).
  tbl.addEventListener("mouseover", (event) => toggle(tbl, "fill-hover", event.target instanceof Element && Boolean(event.target.closest(".fill"))));
  tbl.addEventListener("mouseleave", () => toggle(tbl, "fill-hover", false));

  // ---------- the pointer on the cells ----------
  tbl.addEventListener("mousedown", (event) => {
    if (event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const handle = target.closest(".row-handle");
    if (handle) return dragRow(event, handle.closest("[data-rowid]").dataset.rowid, handle);
    if (target.closest(".th[data-head]")) return headDown(event, target);
    // A press on a cell's button is the button's (its click below): no cell selected or edited by it.
    if (target.closest(".cell-act, .cell-editor")) {
      if (target.closest(".cell-act")) event.stopPropagation();
      return;
    }
    const td = target.closest(".td[data-cell]");
    if (!td) return;
    event.preventDefault();
    focusWrap();
    const [r, c] = td.dataset.cell.split("-").map(Number);
    if (event.shiftKey && sel) { select({ ...sel, r1: r, c1: c }, { reveal: false }); return; }
    const area = range();
    const was = Boolean(sel) && area.top === area.bottom && area.left === area.right && sel.r0 === r && sel.c0 === c;
    endEdit();
    select({ r0: r, c0: c, r1: r, c1: c }, { reveal: false });
    press = { r, c, was, moved: false };
  });
  // 打开: the record's details (the selection goes to its title's cell); on the record open in them, they close.
  tbl.addEventListener("click", (event) => {
    const open = event.target instanceof Element ? event.target.closest(".open-btn") : null;
    if (!open) return;
    const td = open.closest(".td[data-cell]");
    if (!td) return;
    const [r, c] = td.dataset.cell.split("-").map(Number);
    const row = nav[r];
    if (!row) return;
    endEdit();
    select({ r0: r, c0: c, r1: r, c1: c }, { reveal: false });
    focusWrap();
    if (store.ui.peek === row.id) db.closePeek();
    else db.openRow(row.id);
  });
  tbl.addEventListener("mouseover", (event) => {
    if (!press) return;
    const td = event.target instanceof Element ? event.target.closest(".td[data-cell]") : null;
    if (!td) return;
    const [r, c] = td.dataset.cell.split("-").map(Number);
    if (r !== press.r || c !== press.c) press.moved = true;
    if (sel && (sel.r1 !== r || sel.c1 !== c)) select({ ...sel, r1: r, c1: c }, { reveal: false });
  });
  const onUp = () => {
    const done = press;
    press = null;
    if (!done || done.moved) return;
    const prop = cols[done.c];
    if (prop?.type === "checkbox") {
      const row = nav[done.r];
      if (row && editable()) store.setCell(row.id, prop.id, row.values[prop.id] !== true);
      return;
    }
    if (view().clickEdit || done.was) startEdit(done.r, done.c);
  };
  addEventListener("mouseup", onUp);
  tbl.addEventListener("dblclick", (event) => {
    const td = event.target instanceof Element ? event.target.closest(".td[data-cell]") : null;
    if (!td || event.target.closest(".cell-editor, .cell-act")) return;
    const [r, c] = td.dataset.cell.split("-").map(Number);
    if (!editing) startEdit(r, c);
  });
  tbl.addEventListener("contextmenu", (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const th = target?.closest(".th[data-head]");
    if (th) {
      event.preventDefault();
      if (editable()) openHeadMenu(th.dataset.head, th, { inline: false });
      return;
    }
    const tr = target?.closest(".tr[data-rowid]");
    if (!tr || tr.dataset.rowid === EMPTY || !editable() || target.closest(".cell-editor")) return;
    event.preventDefault();
    const r = nav.findIndex((row) => row.id === tr.dataset.rowid);
    const area = range();
    const c = sel?.c1 ?? 0;
    if (!area || r < area.top || r > area.bottom || c < area.left || c > area.right) select({ r0: r, c0: 0, r1: r, c1: cols.length - 1 }, { reveal: false });
    db.openRowMenu(tr.dataset.rowid, { left: event.clientX, top: event.clientY, right: event.clientX, bottom: event.clientY });
  });
  // Selected or not, nothing between: a press outside the table clears the selection, leaving no pale frame of a lost focus.
  const onDown = (event) => {
    const target = event.target;
    if (!(target instanceof Node) || wrap.contains(target)) return;
    if (target instanceof Element && target.closest(".popover, [data-keep-popovers], .edge-plus, .scroll-rail")) return;
    if (sel) select(null);
  };
  document.addEventListener("mousedown", onDown, true);

  // ---------- the header ----------
  // A header pressed: its arrow sorts, its edge sizes it, anywhere else it is dragged (its column moved) or clicked (its menu).
  function headDown(event, target) {
    const th = target.closest(".th[data-head]");
    const prop = store.byId[th.dataset.head];
    if (!prop || !editable()) return;
    if (target.closest(".th-sort-btn")) { event.stopPropagation(); return; }
    if (target.closest(".resizer")) { resizeColumn(event, prop); return; }
    if (target.closest(".th-input, .th-input-wrap")) return;
    // Its name being typed: a press beside the field puts the caret at that end of it (no drag of the column while
    // the reader selects its words), the type's icon still opening its kinds.
    if (renaming?.propId === prop.id && !target.closest(".th-type")) {
      event.preventDefault();
      const field = renaming.input.input;
      const before = event.clientX < field.getBoundingClientRect().left;
      field.focus({ preventScroll: true });
      field.setSelectionRange(before ? 0 : field.value.length);
      return;
    }
    dragColumn(event, prop, th, Boolean(target.closest(".th-type")) && prop.type !== "title");
  }
  tbl.addEventListener("click", (event) => {
    const button = event.target instanceof Element ? event.target.closest(".th-sort-btn") : null;
    if (!button) return;
    event.stopPropagation();
    db.closeMenus();
    db.cycleSort(button.closest(".th").dataset.head);
  });

  /** A header's menu: `inline`, its name typed where it stands (the field over its words), the menu right under it. */
  function openHeadMenu(propId, th, { inline = true, page } = {}) {
    const prop = store.byId[propId];
    if (!prop) return;
    db.closeMenus();
    endRename();
    if (inline) {
      const input = headNameInput(store, prop, { onEnter: () => menu?.close() });
      renaming = { propId, input };
      th.classList.add("head-edit");
      th.querySelector(".th-name").replaceWith(input.element);
      input.input.focus();
      input.input.select();
    }
    let menu = null;
    menu = propMenu(store, db, {
      propId,
      anchor: th,
      inlineName: inline,
      startPage: page,
      onFilter: (each) => db.filterBy(each),
      onInsert: (side) => { menu?.close(); openNewColumn(th, { side, of: propId }); },
      onClose: () => { if (renaming?.propId === propId) endRename(); },
    });
  }

  function endRename() {
    if (!renaming) return;
    const { propId, input } = renaming;
    renaming = null;
    input.end();
    const th = headRow.querySelector(`[data-head="${CSS.escape(propId)}"]`);
    if (th) {
      th.classList.remove("head-edit");
      const name = h("span", { class: "th-name" }, store.byId[propId]?.name ?? "");
      th.querySelector(".th-input-wrap")?.replaceWith(name);
    }
  }

  // A header dragged moves its column; pressed and let go where it was, it is a click (its menu).
  function dragColumn(event, prop, th, onType) {
    const x0 = event.clientX;
    let moving = false;
    let ghost = null;
    let target = -1;
    const heads = () => [...headRow.querySelectorAll(":scope > [data-head]")];
    const line = h("div", { class: "col-drop" });
    const onMove = (moved) => {
      if (!moving && Math.abs(moved.clientX - x0) < DRAG) return;
      if (prop.type === "title") return;
      if (!moving) {
        moving = true;
        db.closeMenus();
        app()?.classList.add("is-dragging");
        startDrag();
        // Its ghost: the column's cells in sight, from its header to the bottom of the window.
        const box = wrap.getBoundingClientRect();
        const head = th.getBoundingClientRect();
        const c = cols.findIndex((each) => each.id === prop.id);
        const cells = [th, ...tbl.querySelectorAll(`[data-cell$="-${c}"]`)];
        const rows = tbl.querySelectorAll(":scope > [data-rowid]");
        const last = rows[rows.length - 1];
        const bottom = Math.min(innerHeight - 4, last ? last.getBoundingClientRect().bottom : head.bottom);
        const stay = heads()[0].getBoundingClientRect().right;
        ghost = makeGhost("col", cells, { left: head.left, top: head.top, width: head.width, height: bottom - head.top }, x0, { min: stay, max: Math.min(box.right, tbl.getBoundingClientRect().right - FILL) });
        th.classList.add("moving");
        for (const td of tbl.querySelectorAll(`[data-cell$="-${c}"]`)) td.classList.add("moving-col");
        element.append(line);
      }
      moveGhost(ghost, moved.clientX);
      const all = heads();
      // Where it lands goes by its copy: a column gives way as the copy's leading edge passes its middle.
      const from = all.indexOf(th);
      const copy = ghost.el.getBoundingClientRect();
      target = Math.max(1, beforeIndex(from, placeInRow(all.map((each) => along(each.getBoundingClientRect(), "x")), from, { start: copy.left, end: copy.right })));
      // Where it lands: placed by the frame (no scroll moves it), at the right of the column that stays where that covers it.
      const frame = element.getBoundingClientRect();
      const stay = all[0].getBoundingClientRect().right;
      const x = all[target] ? all[target].getBoundingClientRect().left : all[all.length - 1].getBoundingClientRect().right;
      const top = all[0].getBoundingClientRect().top - frame.top;
      Object.assign(line.style, { left: `${Math.max(x, stay) - frame.left}px`, top: `${top}px`, height: `${wrap.offsetTop + wrap.clientHeight - top}px` });
    };
    const up = () => {
      removeEventListener("mousemove", onMove);
      removeEventListener("mouseup", up);
      if (!moving) {
        // A click: on the kind's icon, the menu at its kinds; anywhere else, the name edited in the header, its menu under it.
        if (onType) openHeadMenu(prop.id, th, { inline: false, page: "type" });
        else openHeadMenu(prop.id, th, { inline: true });
        return;
      }
      ghost?.el.remove();
      line.remove();
      th.classList.remove("moving");
      for (const td of tbl.querySelectorAll(".moving-col")) td.classList.remove("moving-col");
      app()?.classList.remove("is-dragging");
      endDrag();
      const before = cols[target]?.id;
      if (before === prop.id || cols[target - 1]?.id === prop.id) return;
      store.commit((d) => {
        const props = d.props.filter((each) => each.id !== prop.id);
        let at = before ? props.findIndex((each) => each.id === before) : props.length;
        if (!before) {
          const last = cols[cols.length - 1];
          at = last.id === prop.id ? props.length : props.findIndex((each) => each.id === last.id) + 1;
        }
        props.splice(Math.max(1, at), 0, d.props.find((each) => each.id === prop.id));
        return { ...d, props };
      });
    };
    addEventListener("mousemove", onMove);
    addEventListener("mouseup", up);
  }

  // A column's width: one step of undo for the whole drag (held meanwhile: the store tells the page).
  function resizeColumn(event, prop) {
    event.preventDefault();
    event.stopPropagation();
    const x0 = event.clientX;
    const w0 = widthOf(prop);
    const onMove = (moved) => {
      const width = Math.max(prop.type === "title" ? 120 : 64, Math.round(w0 + moved.clientX - x0));
      store.commit((d) => ({ ...d, props: d.props.map((each) => (each.id === prop.id ? { ...each, width } : each)) }), `drag:resize-${prop.id}`);
    };
    const up = () => {
      removeEventListener("mousemove", onMove);
      removeEventListener("mouseup", up);
      store.flush();
    };
    addEventListener("mousemove", onMove);
    addEventListener("mouseup", up);
  }

  function openNewColumn(anchor, at) {
    db.closeMenus();
    const fill = !at;
    const hidden = fill ? view().hidden.filter((id) => store.byId[id] && !store.byId[id].notes && store.byId[id].type !== "title") : [];
    if (fill) fillAdd.classList.add("on");
    newPropMenu(store, db, {
      anchor,
      at: at ?? (cols.length ? { side: "right", of: cols[cols.length - 1].id } : undefined),
      title: at ? w("在这里插入属性") : w("新建属性"),
      hidden,
      onClose: () => { if (fill) fillAdd.classList.remove("on"); },
      onCreated: (id, type, shown) => {
        if (fill && !shown) requestAnimationFrame(() => wrap.scrollTo({ left: wrap.scrollWidth }));
        // A formula column opens its formula's editor as it is made.
        if (type === "formula" && !shown) setTimeout(() => {
          const th = headRow.querySelector(`[data-head="${CSS.escape(id)}"]`);
          if (th) openHeadMenu(id, th, { inline: false });
        }, 30);
      },
    });
  }

  // ---------- the + points ----------
  // With the pointer on the header row (or a little above it), a dot at the top of the column edge nearest it; with
  // the pointer in the room left of the rows, a dot at the left of the row edge nearest it; on the dot it is a +, a
  // line along the edge saying where; a press puts the row or column in. It hears the pointer itself: the table is not
  // drawn again for it.
  let points = [];
  let pointsKey = "";
  let held = null; // a column's + pressed: it and its line stay while the new column's kind is chosen
  const onPointer = (event) => {
    if (held) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest(".edge-plus")) return;
    // No dot while the pointer is on a header's button (its kind, its arrow, the end's +): two things never crowd one place.
    const onButton = target?.closest(".th-sort-btn, .th-type:not(.fixed), .fill-add");
    if (onButton || event.buttons || !editable() || dragging || app()?.classList.contains("is-dragging") || element.querySelector(".cell-editor")) return hideTools();
    showTools(computePoints(event.clientX, event.clientY));
  };
  element.addEventListener("mousemove", onPointer);
  element.addEventListener("mouseleave", () => hideTools());
  wrap.addEventListener("scroll", () => hideTools(), { passive: true });

  function computePoints(x, y) {
    const frame = element.getBoundingClientRect();
    const box = wrap.getBoundingClientRect();
    const heads = [...headRow.querySelectorAll(":scope > [data-head]")];
    if (!heads.length) return [];
    const head = heads[0].getBoundingClientRect(); // the header of the first column, which stays
    const table = tbl.getBoundingClientRect();
    const right = Math.min(box.right, table.right);
    const rows = [...tbl.querySelectorAll(":scope > [data-rowid]")];
    const bottom = rows.length ? rows[rows.length - 1].getBoundingClientRect().bottom : head.bottom;
    const stay = head.right;
    // A column: the pointer on the header row (or 14px above it), one dot at the top of the column edge within 20px.
    if (y >= head.top - 14 && y <= head.bottom && x >= head.left - 4 && x <= right + 10) {
      let best = null;
      let nearest = 20;
      for (let b = 1; b <= heads.length; b++) {
        const edge = heads[b - 1].getBoundingClientRect().right;
        // The first column's right edge only while nothing scrolls sideways; none covered by the column that stays or out of sight.
        if (b === 1 ? wrap.scrollLeft >= 1 : edge < stay + 1 || edge > box.right + 1) continue;
        // The last edge from the column's side alone: the end past it has a + of its own.
        if (b === heads.length && x > edge + 3) continue;
        const distance = Math.abs(x - edge);
        if (distance <= nearest) { nearest = distance; best = { b, edge }; }
      }
      if (!best) return [];
      return [{ key: `c${best.b}`, axis: "col", after: heads[best.b - 1].dataset.head, x: best.edge - frame.left, y: head.top - frame.top, line: { x: best.edge - frame.left - 1, y: head.top - frame.top, w: 2, h: bottom - head.top } }];
    }
    // A row: the pointer in the room at the left, one dot at the left of the row edge within 10px.
    if (x >= frame.left && x <= head.left + 10 && y > head.bottom - 4 && y <= bottom + 10) {
      let best = null;
      let nearest = 10;
      for (const node of rows) {
        const r = node.getBoundingClientRect();
        // Its top edge puts the row before it, its bottom edge after it (of its group, where the table is grouped); the edge between two rows is after the one above.
        for (const [edge, side] of [[r.top, "before"], [r.bottom, "after"]]) {
          const distance = Math.abs(y - edge);
          if (distance < nearest || (distance === nearest && side === "after")) { nearest = distance; best = { edge, id: node.dataset.rowid, side }; }
        }
      }
      if (!best) return [];
      return [{ key: `r${Math.round(best.edge - table.top)}`, axis: "row", row: { id: best.id, side: best.side }, x: head.left - frame.left, y: best.edge - frame.top, line: { x: head.left - frame.left, y: best.edge - frame.top - 1, w: right - head.left, h: 2 } }];
    }
    return [];
  }

  function showTools(next) {
    const key = next.map((point) => `${point.key}:${point.x}:${point.y}`).join("|");
    if (key === pointsKey) return;
    hideTools();
    pointsKey = key;
    points = next.map((point) => {
      const line = h("div", { class: "edge-line", hidden: true, style: { left: `${point.line.x}px`, top: `${point.line.y}px`, width: `${point.line.w}px`, height: `${point.line.h}px` } });
      const plus = h("div", { class: "edge-plus", role: "button", style: { left: `${point.x - 9}px`, top: `${point.y - 9}px` }, "aria-label": point.axis === "col" ? w("在这里插入一列") : w("在这里插入一行"), "data-doc-tip": point.axis === "col" ? w("在这里插入属性") : w("在这里插入一行") }, h("i", null, icon("plus", 11, { bold: 2.4 })));
      plus.addEventListener("mouseenter", () => { plus.classList.add("hot"); line.hidden = false; });
      plus.addEventListener("mouseleave", () => { if (held?.plus === plus) return; plus.classList.remove("hot"); line.hidden = true; });
      plus.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (point.axis === "col") {
          // While its kind is chosen, the + and the line stay where the new column goes.
          held = { plus, line };
          plus.classList.add("hot");
          line.hidden = false;
          plus.style.pointerEvents = "none";
          newPropMenu(store, db, {
            anchor: plus.getBoundingClientRect(),
            at: { side: "right", of: point.after },
            title: w("在这里插入属性"),
            onClose: () => { held = null; hideTools(); },
            onCreated: (id, type) => {
              // A formula column opens its formula's editor as it is made.
              if (type === "formula") setTimeout(() => { const th = headRow.querySelector(`[data-head="${CSS.escape(id)}"]`); if (th) openHeadMenu(id, th, { inline: false }); }, 30);
            },
          });
        } else {
          hideTools();
          insertRow(point.row.id, point.row.side);
        }
      });
      element.append(line, plus);
      return { line, plus };
    });
  }

  function hideTools() {
    if (held || !points.length) return;
    pointsKey = "";
    for (const { line, plus } of points) { line.remove(); plus.remove(); }
    points = [];
  }

  const canReorder = () => !view().sorts.length && !view().groupBy;

  function insertRow(rowId, side) {
    if (rowId === EMPTY) { db.addRow({}, { focus: true }); return; }
    db.addRow(prefillOf.get(rowId) || {}, side === "before" ? { before: rowId, focus: true } : { after: rowId, focus: true });
  }

  // A drag under way: no + points, no end's +, the frame's cursor the grabbing hand.
  function startDrag() {
    dragging = true;
    hideTools();
    wrap.classList.add("dragging");
    fillAdd.remove();
  }
  function endDrag() {
    dragging = false;
    wrap.classList.remove("dragging");
    if (editable() && cols.length) fillHead.append(fillAdd);
  }

  // A row's handle dragged moves the row (with no sort and no group); pressed and let go, its menu.
  function dragRow(event, rowId, handle) {
    event.preventDefault();
    event.stopPropagation();
    const y0 = event.clientY;
    let moving = false;
    let ghost = null;
    let drop = null;
    const tr = handle.closest("[data-rowid]");
    const onMove = (moved) => {
      if (!moving && Math.abs(moved.clientY - y0) < DRAG) return;
      if (!canReorder()) return;
      if (!moving) {
        moving = true;
        db.closeMenus();
        app()?.classList.add("is-dragging");
        startDrag();
        // Its ghost: what is in sight of the row, from the column that stays to the frame's right.
        const box = wrap.getBoundingClientRect();
        const r = tr.getBoundingClientRect();
        const head = headRow.querySelector("[data-head]").getBoundingClientRect();
        const right = Math.min(box.right, tbl.getBoundingClientRect().right);
        const all = [...tbl.querySelectorAll(":scope > [data-rowid]")];
        const lastBottom = all.length ? all[all.length - 1].getBoundingClientRect().bottom : r.bottom;
        ghost = makeGhost("row", [...tr.querySelectorAll(":scope > .td")], { left: head.left, top: r.top, width: right - head.left, height: r.height }, y0, { min: head.bottom, max: Math.min(innerHeight, lastBottom) });
        tr.classList.add("moving");
      }
      moveGhost(ghost, moved.clientY);
      const rows = [...tbl.querySelectorAll(":scope > [data-rowid]")].filter((each) => each.dataset.rowid !== EMPTY);
      // Where it lands goes by its copy, as a column's: a row gives way as the copy's leading edge passes its middle.
      const from = rows.indexOf(tr);
      const copy = ghost.el.getBoundingClientRect();
      const place = from < 0 ? -1 : placeInRow(rows.map((each) => along(each.getBoundingClientRect(), "y")), from, { start: copy.top, end: copy.bottom });
      const next = place < 0 ? null : place === from ? { id: rowId, side: "before", node: tr } : { id: rows[place].dataset.rowid, side: place < from ? "before" : "after", node: rows[place] };
      if (drop?.node !== next?.node || drop?.side !== next?.side) {
        drop?.node.classList.remove("drop-before", "drop-after");
        next?.node.classList.add(`drop-${next.side}`);
      }
      drop = next;
    };
    const up = () => {
      removeEventListener("mousemove", onMove);
      removeEventListener("mouseup", up);
      if (!moving) {
        // A click on the handle picks the row, its cells lit across (no cell framed), and opens its menu.
        const r = nav.findIndex((row) => row.id === rowId);
        if (r >= 0 && cols.length) {
          endEdit();
          select({ r0: r, c0: 0, r1: r, c1: cols.length - 1, row: true }, { reveal: false });
        }
        db.openRowMenu(rowId, handle);
        return;
      }
      ghost?.el.remove();
      tr.classList.remove("moving");
      drop?.node.classList.remove("drop-before", "drop-after");
      app()?.classList.remove("is-dragging");
      endDrag();
      if (drop && drop.id !== rowId) store.moveRow(rowId, drop.id, drop.side);
    };
    addEventListener("mousemove", onMove);
    addEventListener("mouseup", up);
  }

  // What follows the pointer as a row or a column is dragged: a copy of its cells in sight as they are, with a soft
  // shadow and no frame or handles, moving along the drag's axis alone and never out of the table's sight. It stands
  // in the database's layer, taken off as the drag ends.
  function makeGhost(axis, cells, box, pointer, bounds) {
    const el = h("div", { class: "tghost", "data-axis": axis });
    const inner = h("div", { class: "tghost-cells" });
    // The cells of the column that stays last, drawn on top (as in the table, over what slides under them).
    const ordered = [...cells].sort((a, b) => Number(a.classList.contains("sticky")) - Number(b.classList.contains("sticky")));
    for (const cell of ordered) {
      const r = cell.getBoundingClientRect();
      if (r.right <= box.left || r.left >= box.left + box.width || r.bottom <= box.top || r.top >= box.top + box.height) continue;
      const copy = cell.cloneNode(true);
      copy.classList.remove("cursor", "in-sel", "editing", "moving", "moving-col", "head-edit");
      copy.removeAttribute("data-cell");
      copy.removeAttribute("data-head");
      copy.querySelectorAll(".cell-act, .resizer").forEach((node) => node.remove());
      Object.assign(copy.style, { position: "absolute", left: `${r.left - box.left}px`, top: `${r.top - box.top}px`, width: `${r.width}px`, height: `${r.height}px`, margin: "0", zIndex: "auto" });
      inner.append(copy);
    }
    el.append(inner);
    Object.assign(el.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
    store.layer.append(el);
    return { el, grab: pointer - (axis === "col" ? box.left : box.top), box, bounds, axis };
  }

  function moveGhost(ghost, pointer) {
    const size = ghost.axis === "col" ? ghost.box.width : ghost.box.height;
    const at = Math.max(ghost.bounds.min, Math.min(pointer - ghost.grab, Math.max(ghost.bounds.min, ghost.bounds.max - size)));
    if (ghost.axis === "col") ghost.el.style.left = `${at}px`;
    else ghost.el.style.top = `${at}px`;
  }

  return {
    element,
    /** Draw as the store is now (a change heard: `change`, or none: everything). */
    update(change) {
      if (change && change.rows instanceof Set && change.rows.size > 0 && !change.views && !change.props && !change.ui) {
        // Values of some records changed: their rows alone, where the records shown and their order stay.
        const before = nav.map((row) => row.id).join(",");
        const now = view();
        const { rows } = store.rowsOf(now);
        const group = now.groupBy;
        const ids = rows.map((row) => row.id).join(",");
        if (!group && ids === before) {
          const maxesBefore = JSON.stringify(maxes);
          compute();
          if (JSON.stringify(maxes) === maxesBefore) {
            for (const id of change.rows) redrawRow(id);
            drawCalc(now, rows);
            return;
          }
        }
      }
      draw();
    },
    /** A record just made: its title's cell selected and edited. */
    focusRow(id) {
      const r = nav.findIndex((row) => row.id === id);
      if (r < 0) return false;
      const c = Math.max(0, cols.findIndex((prop) => prop.type === "title"));
      select({ r0: r, c0: c, r1: r, c1: c });
      startEdit(r, c);
      return true;
    },
    /** The width its columns take past the text's left edge (宽多维表格 places the drawing by it: across.js). */
    width: () => tableWidth,
    /** The header of a column (a new formula's menu opens on it). */
    headOf: (id) => headRow.querySelector(`[data-head="${CSS.escape(id)}"]`),
    destroy() {
      endEdit();
      endRename();
      held = null;
      hideTools();
      rail.destroy();
      edgeSizes.disconnect();
      removeEventListener("mouseup", onUp);
      removeEventListener("scroll", onPageScroll, { capture: true });
      document.removeEventListener("mousedown", onDown, true);
      cancelAnimationFrame(measuring);
      cancelAnimationFrame(scrolling);
    },
  };
}
