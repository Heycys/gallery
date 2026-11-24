// The filter bar under the database's head: the sorts' chip, each filter's chip (or its row of buttons, an
// option each, with how many records each has), "+ 筛选", and at its right how many records show of how
// many and 清除. A chip pressed opens its card (the condition, its value); a chip dragged sideways moves the
// filter among the others. The cards: a column picked (a filter added, a sort added), a filter's, the
// sorts'. What a card changes is the view's, written into the file (a filter's words a character at a time).
import { applyView, chipParts, groupKeys, isActive, isRelative, NONE, newFilter, opDef, opsOf, relativeDates } from "./data/query.js";
import { typeLabel, uid } from "./data/values.js";
import { datePanel } from "./editors.js";
import { paint } from "./ui/colors.js";
import { composing, h, keyed, text, toggle, kids } from "./ui/dom.js";
import { icon, typeIcon } from "./ui/icons.js";
import { box, item, MENU_WIDTH, pop, sep } from "./ui/menu.js";
import { moveItem, startReorder } from "./ui/reorder.js";
import { pill } from "./ui/values.js";
import { w } from "./words.js";

const DATE_FILTER_WIDTH = 284;

/**
 * A column picked from a card over `anchor` (a search field over the columns `props`), `onPick(prop)`.
 */
export function propPicker(store, { anchor, props, onPick, placeholder = w("搜索属性…"), empty = w("没有可选的属性"), onClose }) {
  let query = "";
  let lit = 0; // the row ↑ ↓ are at, Enter picks
  return pop(store.layer, anchor, {
    onClose,
    build: (card, api) => {
      const input = h("input", { placeholder, "data-field": "search" });
      const list = h("div", { class: "menu-scroll tall", "data-scroll": "props" });
      card.append(...kids(h("div", { class: "menu-search" }, input), list));
      const shown = () => props.filter((prop) => !query || prop.name.toLowerCase().includes(query.toLowerCase()) || typeLabel(prop.type).includes(query));
      api.update = () => {
        const each = shown();
        list.replaceChildren(...kids(...each.map((prop, at) => item({ icon: typeIcon(prop.type, 20), label: prop.name, active: at === lit, onClick: () => onPick(prop) }))));
        if (!each.length) list.append(h("div", { class: "menu-empty" }, query ? w("无结果") : empty));
      };
      input.addEventListener("input", () => { query = input.value; lit = 0; api.update(); api.place(); });
      input.addEventListener("keydown", (event) => {
        if (composing(event)) return;
        const each = shown();
        if (event.key === "ArrowDown") { event.preventDefault(); lit = Math.min(each.length - 1, lit + 1); api.update(); }
        if (event.key === "ArrowUp") { event.preventDefault(); lit = Math.max(0, lit - 1); api.update(); }
        if (event.key === "Enter" && each[lit]) onPick(each[lit]);
      });
      api.update();
      input.focus({ preventScroll: true });
    },
  });
}

/**
 * The filter bar of the view `db.view()` (`db`: the drawing's), drawn into `bar` as the view, the
 * records, the search and the reader's state are now (`draw`), and its cards.
 */
export function createFilterBar(store, db) {
  const bar = h("div", { class: "filter-bar" });
  const scroll = h("div", { class: "filter-scroll" });
  const count = h("div", { class: "filter-count" });
  bar.append(...kids(scroll, count));
  const addButton = h("button", { type: "button", class: "add-filter" }, icon("plus", 13), w("筛选"));
  addButton.addEventListener("click", () => openAddFilter(addButton));
  let card = null; // { kind, id?, handle }

  const filtersOf = (view) => view.filters.filter((filter) => store.byId[filter.prop]);
  const close = () => { card?.handle?.close(); card = null; };

  /** Whether the bar shows: with rules and open, or a search, or a card of it open. */
  const shows = () => {
    const view = db.view();
    const sorts = db.canSort() ? view.sorts.filter((sort) => store.byId[sort.prop]) : [];
    return (store.barOpen(view) && (sorts.length > 0 || filtersOf(view).length > 0)) || Boolean(store.ui.search) || card?.kind === "sort" || card?.kind === "filter";
  };

  function setFilter(id, patch, merge) {
    const view = db.view();
    db.updateView({ filters: view.filters.map((filter) => (filter.id === id ? { ...filter, ...patch } : filter)) }, merge);
  }

  function draw() {
    const view = db.view();
    bar.hidden = !shows();
    if (bar.hidden) return;
    const filters = filtersOf(view);
    const sorts = db.canSort() ? view.sorts.filter((sort) => store.byId[sort.prop]) : [];
    const items = [
      ...(sorts.length ? [{ key: "sorts", kind: "sorts" }, { key: "div", kind: "div" }] : []),
      ...filters.map((filter) => ({ key: `${filter.segments ? "s" : "c"}:${filter.id}`, kind: filter.segments ? "segments" : "chip", filter })),
    ];
    keyed(scroll, items, (entry) => entry.key, (entry) => made(entry), (node, entry) => fill(node, entry));
    if (addButton.parentNode !== scroll || scroll.lastElementChild !== addButton) scroll.append(...kids(addButton));
    toggle(addButton, "open", card?.kind === "addFilter");
    const active = filters.filter((filter) => isActive(filter, store.byId[filter.prop])).length;
    const filtering = active > 0 || Boolean(store.ui.search);
    count.hidden = !filtering;
    if (filtering) {
      const { rows } = store.rowsOf(view);
      count.replaceChildren(...kids(h("span", null, w("{0} / {1} 条", rows.length, store.doc.rows.length)), h("button", { type: "button", class: "link-btn", on: { click: clearAll } }, w("清除"))));
    }
  }

  function made(entry) {
    if (entry.kind === "div") return h("span", { class: "bar-div" });
    if (entry.kind === "sorts") {
      const node = h("button", { type: "button", class: "chip on", "data-chip": "sorts" });
      node.addEventListener("click", () => (card?.kind === "sort" ? close() : openSorts(node)));
      fill(node, entry);
      return node;
    }
    if (entry.kind === "segments") {
      const node = h("div", { class: "segments", "data-chip": entry.filter.id });
      fill(node, entry);
      return node;
    }
    const node = h("button", { type: "button", class: "chip", "data-chip": entry.filter.id });
    node.addEventListener("mousedown", (event) => dragChip(event, node));
    node.addEventListener("click", () => {
      const id = node.dataset.chip;
      if (card?.kind === "filter" && card.id === id) close();
      else openFilter(id, node);
    });
    fill(node, entry);
    return node;
  }

  function fill(node, entry) {
    if (entry.kind === "div") return;
    if (entry.kind === "sorts") {
      const sorts = db.view().sorts.filter((sort) => store.byId[sort.prop]);
      toggle(node, "open", card?.kind === "sort");
      node.replaceChildren(...kids(...(sorts.length === 1
        ? [icon(sorts[0].dir === "asc" ? "arrowUp" : "arrowDown", 14), h("span", null, store.byId[sorts[0].prop].name)]
        : [icon("sort", 14), h("span", null, w("{0} 个排序", sorts.length))]), icon("chevronDown", 12, { cls: "chip-chev" })));
      return;
    }
    const filter = entry.filter;
    const prop = store.byId[filter.prop];
    if (entry.kind === "segments") return fillSegments(node, filter, prop);
    const on = isActive(filter, prop);
    const { name, op, value } = chipParts(filter, prop);
    const numeric = prop.type === "number" && opDef(prop, filter.op)?.needs === "number";
    toggle(node, "on", on);
    toggle(node, "open", card?.kind === "filter" && card.id === filter.id);
    node.replaceChildren(...kids(typeIcon(prop.type, 14), on ? h("span", { class: "chip-text" }, h("b", null, name), numeric ? " " : "：", op ? `${op} ` : "", value) : h("span", null, name), icon("chevronDown", 12, { cls: "chip-chev" })));
  }

  // A filter as a row of buttons, an option each, with how many records each has.
  function fillSegments(node, filter, prop) {
    const view = db.view();
    const base = applyView(store.doc.rows, store.doc.props, { filters: view.filters, sorts: [] }, store.ui.search, filter.id);
    const counts = {};
    for (const row of base) for (const key of groupKeys(row, prop, store.byId)) counts[key || NONE] = (counts[key || NONE] || 0) + 1;
    const chosen = filter.value || [];
    const negate = filter.op === "isnot" || filter.op === "nhas";
    const pick = (id, event) => {
      const now = (db.view().filters.find((each) => each.id === filter.id)?.value) || [];
      if (event.shiftKey || event.metaKey || event.ctrlKey) setFilter(filter.id, { value: now.includes(id) ? now.filter((each) => each !== id) : [...now, id] });
      else setFilter(filter.id, { value: now.length === 1 && now[0] === id ? [] : [id] });
    };
    const label = h("button", { type: "button", class: "seg-label", "data-doc-tip": w("点击编辑；按住拖动可调整位置") }, prop.name, negate ? h("span", { class: "muted" }, ` ${w("不是")}`) : null);
    label.addEventListener("mousedown", (event) => dragChip(event, node));
    label.addEventListener("click", () => openFilter(filter.id, node));
    const button = (id, words, on, extra = null) => h("button", { type: "button", class: `seg-btn${on ? " on" : ""}`, "aria-pressed": String(on), on: { click: (event) => (id === null ? setFilter(filter.id, { value: [] }) : pick(id, event)) } }, extra, words, h("span", { class: "seg-n" }, String(id === null ? base.length : counts[id] || 0)));
    node.replaceChildren(...kids(label,
      button(null, w("全部"), !chosen.length),
      ...(prop.options || []).map((option) => {
        const node = button(option.id, option.name, chosen.includes(option.id), paint(h("span", { class: "dot" }), option.color));
        node.setAttribute("data-doc-tip", w("按住 Shift 可以多选"));
        return node;
      }),
      (counts[NONE] || 0) > 0 ? button(NONE, w("无{0}", prop.name), chosen.includes(NONE)) : null));
  }

  // A chip (a row of buttons by its name at the left) dragged sideways changes the filters' order.
  function dragChip(event, node) {
    const chips = () => [...scroll.querySelectorAll(":scope > [data-chip]:not([data-chip=sorts])")];
    const index = chips().indexOf(node);
    if (index < 0) return;
    startReorder(event, {
      axis: "x",
      index,
      items: chips,
      onDrop: (from, to) => {
        const view = db.view();
        const filters = filtersOf(view);
        db.updateView({ filters: [...moveItem(filters, from, to), ...view.filters.filter((filter) => !store.byId[filter.prop])] });
      },
    });
  }

  function clearAll() {
    const view = db.view();
    db.updateView({ filters: view.filters.filter((filter) => filter.segments).map((filter) => ({ ...filter, value: [] })) });
    db.clearSearch();
  }

  // ---------- the cards ----------
  function openAddFilter(anchor) {
    const view = db.view();
    card = { kind: "addFilter" };
    draw();
    card.handle = propPicker(store, {
      anchor,
      placeholder: w("按什么筛选…"),
      props: store.doc.props.filter((prop) => !view.filters.some((filter) => filter.prop === prop.id)),
      empty: w("每个属性都已经有筛选了"),
      onPick: (prop) => addFilter(prop),
      onClose: () => { if (card?.kind === "addFilter") { card = null; draw(); } },
    });
  }

  /** A filter of `prop` added (or its card opened, where the view has one), its card hanging on its chip. */
  function addFilter(prop) {
    store.setBarOpen(true);
    const view = db.view();
    const found = view.filters.find((filter) => filter.prop === prop.id);
    if (found) {
      card = null;
      draw();
      return openFilter(found.id);
    }
    const filter = newFilter(prop, uid("f"));
    db.updateView({ filters: [...view.filters, filter] });
    card = null;
    draw();
    openFilter(filter.id);
  }

  function openFilter(id, anchor) {
    close();
    card = { kind: "filter", id };
    draw();
    const chip = anchor ?? scroll.querySelector(`[data-chip="${CSS.escape(id)}"]`) ?? bar;
    card.handle = filterCard(chip, id);
    draw();
  }

  function openSorts(anchor) {
    close();
    card = { kind: "sort" };
    draw();
    const chip = anchor ?? scroll.querySelector('[data-chip="sorts"]') ?? bar;
    card.handle = sortCard(chip);
    draw();
  }

  function openAddSort(anchor) {
    const view = db.view();
    close();
    store.setBarOpen(true);
    card = { kind: "addSort" };
    card.handle = propPicker(store, {
      anchor,
      placeholder: w("按什么排序…"),
      props: store.doc.props.filter((prop) => !view.sorts.some((sort) => sort.prop === prop.id)),
      onPick: (prop) => {
        db.updateView({ sorts: [...db.view().sorts, { prop: prop.id, dir: "asc" }] });
        card = null;
        draw();
        openSorts();
      },
      onClose: () => { if (card?.kind === "addSort") { card = null; draw(); } },
    });
  }

  // A filter's card: its column, its condition, its value; a row of buttons or a chip; delete.
  function filterCard(anchor, id) {
    let query = "";
    const live = () => db.view().filters.find((filter) => filter.id === id);
    // As wide as every card; a date's a little wider, its five relative days on one line above the month.
    const width = () => {
      const filter = live();
      return filter && store.byId[filter.prop] && opDef(store.byId[filter.prop], filter.op)?.needs === "date" ? DATE_FILTER_WIDTH : MENU_WIDTH;
    };
    const handle = pop(store.layer, anchor, {
      width: width(),
      onClose: () => {
        // What was typed in it goes as one step as it closes.
        store.flush();
        if (card?.kind === "filter" && card.id === id) { card = null; draw(); }
      },
      build: (node, api) => {
        const filter = live();
        const prop = filter && store.byId[filter.prop];
        if (!prop) return void api.close();
        const head = h("div", { class: "fe-head" });
        const body = h("div", { class: "fe-body" });
        node.append(...kids(head, body));
        let shape = ""; // what the body was built for: its condition's kind
        let field = null;
        api.update = () => {
          const now = live();
          if (!now) return void api.close();
          const def = opDef(prop, now.op);
          const canSegments = prop.type === "select" || prop.type === "multi";
          const opButton = opsOf(prop.type).length > 1 ? h("button", { type: "button", class: "fe-op" }, def?.label ?? "", icon("chevronDown", 11)) : null;
          opButton?.addEventListener("click", () => opMenu(opButton, now));
          head.replaceChildren(...kids(h("span", { class: "fe-name" }, prop.name), opButton, h("span", { class: "grow" }),
            canSegments ? h("button", { type: "button", class: "icon-btn xs", "data-doc-tip": now.segments ? w("收起成胶囊") : w("展开成分段按钮，一键切换"), "aria-label": now.segments ? w("收起成胶囊") : w("展开成分段按钮"), on: { click: () => {
              setFilter(id, now.segments ? { segments: false } : { segments: true, op: prop.type === "multi" ? "has" : "is", value: now.op === "is" || now.op === "has" ? now.value : [] });
              api.close();
            } } }, icon(now.segments ? "pill" : "segments", 14)) : null,
            h("button", { type: "button", class: "icon-btn xs danger-hover", "data-doc-tip": w("删除筛选"), "aria-label": w("删除筛选"), on: { click: () => {
              db.updateView({ filters: db.view().filters.filter((each) => each.id !== id) });
              api.close();
            } } }, icon("trash", 14))));
          const kind = def?.needs ?? "none";
          if (kind !== shape) {
            shape = kind;
            node.style.width = `${width()}px`;
            field = null;
            body.replaceChildren();
            if (kind === "text" || kind === "number") {
              field = h("input", { class: "text-input", placeholder: kind === "number" ? (prop.numberFormat?.format === "percent" ? w("百分数，如 50") : w("输入一个数字…")) : w("输入一个值…"), "data-field": "value", inputmode: kind === "number" ? "decimal" : null });
              field.value = now.value ?? "";
              const write = () => setFilter(id, { value: field.value }, `filter-${id}`);
              field.addEventListener("input", (event) => { if (!event.isComposing) write(); });
              field.addEventListener("compositionend", write);
              field.addEventListener("keydown", (event) => { if (event.key === "Enter" && !composing(event)) api.close(); });
              body.append(...kids(kind === "number" ? h("div", { class: "fe-num" }, h("span", { class: "muted" }, def.label), field) : field));
              field.focus({ preventScroll: true });
            } else if (kind === "option") {
              const options = prop.options || [];
              if (options.length > 7) {
                const search = h("input", { class: "text-input sm", placeholder: w("搜索选项…"), "data-field": "search" });
                search.addEventListener("input", () => { query = search.value; api.update(); });
                body.append(...kids(search));
                search.focus({ preventScroll: true });
              }
              body.append(...kids(h("div", { class: "fe-opts" })));
            } else if (kind === "bool") {
              body.append(...kids(h("div", { class: "fe-opts" })));
            } else if (kind === "date") {
              body.append(...kids(h("div", { class: "date-quick" }), h("div", { class: "fe-note-slot" }), h("div", { class: "fe-date" })));
            } else {
              body.append(...kids(h("div", { class: "muted sm fe-note" })));
            }
          }
          if (kind === "option") {
            const list = body.querySelector(".fe-opts");
            const chosen = now.value || [];
            list.replaceChildren(...kids(...(prop.options || []).filter((option) => !query || option.name.toLowerCase().includes(query.toLowerCase())).map((option) => h("button", { type: "button", class: "fe-opt", on: { click: () => {
              const value = live()?.value || [];
              setFilter(id, { value: value.includes(option.id) ? value.filter((each) => each !== option.id) : [...value, option.id] });
            } } }, box(chosen.includes(option.id), 14), pill(option)))));
          } else if (kind === "bool") {
            body.querySelector(".fe-opts").replaceChildren(...kids(...[true, false].map((on) => item({ icon: box(on, 14), label: on ? w("已勾选") : w("未勾选"), checked: now.value === on, onClick: () => { setFilter(id, { value: on }); api.close(); } }))));
          } else if (kind === "date") {
            body.querySelector(".date-quick").replaceChildren(...kids(...relativeDates().map((relative) => h("button", { type: "button", class: `chip-btn${now.value === relative.id ? " on" : ""}`, on: { click: () => setFilter(id, { value: relative.id }) } }, relative.label))));
            body.querySelector(".fe-note-slot").replaceChildren(...kids(isRelative(now.value) ? h("div", { class: "muted sm fe-note" }, w("相对日期会随今天变化")) : ""));
            const holder = body.querySelector(".fe-date");
            const key = String(now.value);
            if (holder.dataset.for !== key) {
              holder.dataset.for = key;
              const panel = datePanel({ value: now.value && !isRelative(now.value) ? now.value : null, onPick: (day) => setFilter(id, { value: day ?? undefined }) });
              holder.replaceChildren(...kids(panel.element));
              panel.focus();
            }
          } else if (kind === "none") {
            text(body.querySelector(".fe-note"), w("“{0}”{1}的记录", prop.name, def?.label ?? ""));
          } else if (field && document.activeElement !== field && field.value !== String(now.value ?? "")) {
            field.value = now.value ?? "";
          }
        };
        api.update();
      },
    });
    return handle;
  }

  function opMenu(anchor, filter) {
    const prop = store.byId[filter.prop];
    pop(store.layer, anchor, {
      width: 170,
      build: (node, api) => {
        node.append(...kids(...opsOf(prop.type).map((option) => item({ label: option.label, checked: option.op === filter.op, onClick: () => {
          const def = opDef(prop, filter.op);
          const next = opDef(prop, option.op);
          setFilter(filter.id, { op: option.op, value: next?.needs === def?.needs ? filter.value : next?.needs === "option" ? [] : next?.needs === "bool" ? true : undefined });
          api.close();
        } }))));
      },
    });
  }

  // The sorts' card: a row each (its column, its direction; dragged up and down to change which comes first), add, delete all.
  function sortCard(anchor) {
    return pop(store.layer, anchor, {
      onClose: () => { if (card?.kind === "sort") { card = null; draw(); } },
      build: (node, api) => {
        const sorts = db.view().sorts;
        if (!sorts.length) return void api.close();
        const set = (next) => {
          db.updateView({ sorts: next });
          if (!next.length) api.close();
        };
        const list = h("div", { class: "sort-list" });
        sorts.forEach((sort, at) => {
          const prop = store.byId[sort.prop];
          const grip = h("span", { class: "grip", "data-doc-tip": w("拖动调整先后：上面的先排") }, icon("grip", 14));
          grip.addEventListener("mousedown", (event) => startReorder(event, { axis: "y", index: at, items: () => [...list.querySelectorAll(".sort-row")], onDrop: (from, to) => set(moveItem(db.view().sorts, from, to)) }));
          const which = h("button", { type: "button", class: "select-btn grow" }, typeIcon(prop?.type || "text", 14), h("span", { class: "ellipsis" }, prop?.name ?? ""), icon("chevronDown", 12));
          which.addEventListener("click", () => propPicker(store, { anchor: which, props: store.doc.props.filter((each) => !sorts.some((other, index) => other.prop === each.id && index !== at)), onPick: (picked) => { set(db.view().sorts.map((each, index) => (index === at ? { ...each, prop: picked.id } : each))); } }));
          list.append(...kids(h("div", { class: "sort-row" }, grip, which,
            h("button", { type: "button", class: "select-btn", on: { click: () => set(db.view().sorts.map((each, index) => (index === at ? { ...each, dir: each.dir === "asc" ? "desc" : "asc" } : each))) } }, sort.dir === "asc" ? w("升序") : w("降序"), icon(sort.dir === "asc" ? "arrowUp" : "arrowDown", 13)),
            h("button", { type: "button", class: "icon-btn xs", "aria-label": w("删除这条排序"), on: { click: () => set(db.view().sorts.filter((_, index) => index !== at)) } }, icon("x", 13)))));
        });
        const add = store.doc.props.some((prop) => !sorts.some((sort) => sort.prop === prop.id))
          ? item({ icon: "plus", label: w("添加排序"), onClick: (event) => propPicker(store, { anchor: event.currentTarget, props: store.doc.props.filter((prop) => !db.view().sorts.some((sort) => sort.prop === prop.id)), onPick: (prop) => set([...db.view().sorts, { prop: prop.id, dir: "asc" }]) }) })
          : null;
        node.append(...kids(list, sep(), add, item({ icon: "trash", label: w("删除排序"), danger: true, onClick: () => set([]) })));
      },
    });
  }

  return {
    element: bar,
    draw,
    /** The card of a filter of `prop` (added where the view has none). */
    filterBy: addFilter,
    /** A filter added from the toolbar's button (`anchor`). */
    addFilter: openAddFilter,
    /** A sort added from `anchor`, or the sorts' card where the view has some. */
    addSort: (anchor) => (db.view().sorts.length ? openSorts() : openAddSort(anchor)),
    openSorts,
    /** Whether a card of the bar is open, and which. */
    get card() { return card?.kind ?? null; },
    close,
    refresh() { card?.handle?.refresh?.(); },
  };
}
