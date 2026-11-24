// A view's settings: one card of pages, as wide as Gallery's menus, its titles Gallery's small gray headings
// (nothing to close it but a press outside or Esc), each page going back to the one it came from:
// the view's name, its layout (and what the layout goes by), the columns it shows (dragged into their
// order), its filters and sorts (the filter bar's cards), its groups, a table's own switches, the columns
// themselves (each its name, kind and editor), the view as a CSV file, a copy of the view, delete it; a chart's
// kind, categories, measure and colors.
import { CHART_COLORS, shadeOf, shadeSteps } from "./data/chart.js";
import { canGroupBy, isActive, toCSV } from "./data/query.js";
import { TYPE_ORDER, colorLabel, convertProp, typeLabel } from "./data/values.js";
import { LAYOUTS, applyLayout, defaultOpen, layoutLabel, viewName } from "./layouts.js";
import { deleteProp, hasEditPage, nameField, newPropMenu, propEditor } from "./props.js";
import { colorStyle, SEQUENCE } from "./ui/colors.js";
import { composing, h, keyed, kids } from "./ui/dom.js";
import { icon, typeIcon } from "./ui/icons.js";
import { checkItem, field, FORMULA_WIDTH, heading, item, MENU_WIDTH, pageHead, pop, sep, seg } from "./ui/menu.js";
import { moveItem, startReorder } from "./ui/reorder.js";
import { w } from "./words.js";

const pageTitle = (page) => ({ main: w("视图设置"), layout: w("布局"), chart: w("编辑图表"), props: w("显示哪些属性"), group: w("分组"), edit: w("编辑属性"), newView: w("新视图") })[page] ?? "";

/**
 * The settings card of the view shown, over `anchor`; `start`: its first page ("newView": a view just
 * made, its name and layout). `db`: the drawing's (its view, its records, its changes, its filter bar).
 */
export function openSettings(store, db, { anchor, start = "main", onClose }) {
  const stack = [{ id: start }];
  return pop(store.layer, anchor, {
    align: "end",
    cls: "settings",
    onClose,
    build: (card, api) => {
      api.update = null;
      const page = stack[stack.length - 1];
      const view = db.view();
      // Another page: built anew (a page drawing its own changes, api.update, draws only itself).
      const turn = () => { api.update = null; api.refresh(); };
      const push = (next) => { stack.push(next); turn(); };
      const back = stack.length > 1 ? Object.assign(() => { stack.pop(); turn(); }, { label: w("返回") }) : null;
      const prop = page.prop ? store.byId[page.prop] : null;
      card.style.width = `${page.id === "prop" && prop?.type === "formula" ? FORMULA_WIDTH : MENU_WIDTH}px`;
      if (page.id === "main" || page.id === "newView") mainPage(card, api, view, push, page.id === "newView");
      else if (page.id === "layout") { card.append(...kids(pageHead(w("布局"), back))); layoutPage(card, api, view, push); }
      // The chart's own button (编辑图表): its chart alone, no layouts to choose, and no title of its own over the first
      // section's (a card never opens with two names: the user's 2026-11-24).
      else if (page.id === "chart") { if (back) card.append(...kids(pageHead(pageTitle("chart"), back))); layoutPage(card, api, view, push, { grid: false }); }
      else if (page.id === "props") { card.append(...kids(pageHead(w("在{0}中显示", layoutLabel(view.layout)), back))); propsPage(card, api, view); }
      else if (page.id === "group") { card.append(...kids(pageHead(pageTitle("group"), back))); groupPage(card, view, () => { stack.pop(); turn(); }); }
      else if (page.id === "edit") { card.append(...kids(pageHead(pageTitle("edit"), back))); editPage(card, api, push); }
      else if (page.id === "prop" && prop) { card.append(...kids(pageHead(prop.name, back))); propPage(card, api, prop, () => { stack.pop(); turn(); }); }
      else if (page.id === "pick") { card.append(...kids(pageHead(pickTitle(page.pick), back))); pickPage(card, view, page.pick, () => { stack.pop(); turn(); }); }
    },
  });

  function mainPage(card, api, view, push, fresh) {
    const shown = store.doc.props.filter((prop) => prop.type !== "title" && !prop.notes && !view.hidden.includes(prop.id)).length;
    const filters = view.filters.filter((filter) => isActive(filter, store.byId[filter.prop])).length;
    card.append(...kids(heading(pageTitle(fresh ? "newView" : "main")), viewNameField(view, fresh ? () => api.close() : null)));
    const rest = h("div");
    card.append(...kids(rest));
    const draw = () => {
      const now = db.view();
      if (fresh) {
        rest.replaceChildren(...kids(layoutGrid(now)));
        rest.append(...kids(h("div", { class: "menu-pad row-end" }, h("button", { type: "button", class: "btn primary sm", on: { click: () => api.close() } }, w("完成")))));
        return;
      }
      rest.replaceChildren(...kids(
        item({ icon: now.layout, label: w("布局"), right: layoutLabel(now.layout), chevron: true, onClick: () => push({ id: "layout" }) }),
        now.layout !== "chart" ? item({ icon: "eye", label: w("属性"), right: shown, chevron: true, onClick: () => push({ id: "props" }) }) : null,
        item({ icon: "filter", label: w("筛选"), right: filters || "", onClick: () => { api.close(); db.addFilter(); } }),
        item({ icon: "sort", label: w("排序"), right: now.sorts.length || "", onClick: () => { api.close(); db.addSort(); } }),
        now.layout === "table" ? item({ icon: "group", label: w("分组"), right: now.groupBy ? store.byId[now.groupBy]?.name : "", chevron: true, onClick: () => push({ id: "group" }) }) : null,
        now.layout === "table" && store.editable ? [
          sep(),
          heading(w("表格")),
          checkItem({ look: "switch", icon: "cursor", label: w("单击格子先选中"), on: !now.clickEdit, tip: w("勾上：点一下先选中，再点或直接打字才编辑。不勾：点一下就编辑"), onChange: (on) => db.updateView({ clickEdit: on ? undefined : true }) }),
          checkItem({ look: "switch", icon: "sigma", label: w("显示计算行"), on: Boolean(now.showCalc), tip: w("表格底部的计数、求和、平均等，分组时也显示在每组标题上"), onChange: (on) => db.updateView({ showCalc: on || undefined }) }),
          checkItem({ look: "switch", icon: "wrap", label: w("内容换行显示"), on: Boolean(now.wrap), onChange: (on) => db.updateView({ wrap: on || undefined }) }),
        ] : null,
        sep(),
        heading(w("数据表")),
        store.editable ? item({ icon: "sliders", label: w("编辑属性"), right: store.doc.props.length, chevron: true, onClick: () => push({ id: "edit" }) }) : null,
        item({ icon: "download", label: w("导出当前视图为 CSV"), onClick: exportCSV }),
        store.editable ? [
          sep(),
          item({ icon: "copy", label: w("复制视图"), onClick: () => { api.close(); db.duplicateView(db.view()); } }),
          store.doc.views.length > 1 ? item({ icon: "trash", label: w("删除视图"), danger: true, onClick: () => { api.close(); db.deleteView(db.view()); } }) : null,
        ] : null,
      ));
    };
    draw();
    api.update = draw;
  }

  // The view's name: saved as the field is left or Enter pressed (one step).
  function viewNameField(view, onEnter) {
    const { wrap, input } = field({ icon: icon(view.layout, 16, { cls: "prop-ic" }), value: view.name, placeholder: layoutLabel(view.layout) });
    input.dataset.field = "view-name";
    const save = () => { if (input.value.trim() !== (db.view().name ?? "")) store.updateView(view.id, { name: input.value.trim() }); };
    input.addEventListener("blur", save);
    input.addEventListener("focus", () => input.select());
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !composing(event)) {
        save();
        onEnter?.();
      }
    });
    return h("div", { class: "menu-pad" }, wrap);
  }

  function layoutGrid(view) {
    return h("div", { class: "layout-grid" }, LAYOUTS.map((layout) => h("button", {
      type: "button",
      class: `layout-btn${view.layout === layout ? " on" : ""}`,
      "aria-pressed": String(view.layout === layout),
      on: { click: () => { if (layout !== db.view().layout) store.commit((d) => applyLayout(d, view.id, layout)); } },
    }, icon(layout, 20), h("span", null, layoutLabel(layout)))));
  }

  function layoutPage(card, api, view, push, { grid = true } = {}) {
    const rest = h("div");
    card.append(...kids(rest));
    const draw = () => {
      const now = db.view();
      const chart = now.chart || { kind: "column", x: null, agg: "count", y: null };
      const setChart = (patch) => db.updateView({ chart: { ...chart, ...patch } });
      const open = now.open || defaultOpen(now.layout);
      rest.replaceChildren(...kids(
        grid ? layoutGrid(now) : null,
        now.layout === "board" ? item({ icon: "board", label: w("分栏依据"), right: now.boardBy ? store.byId[now.boardBy]?.name : w("未选"), chevron: true, onClick: () => push({ id: "pick", pick: "boardBy" }) }) : null,
        now.layout === "calendar" ? item({ icon: "date", label: w("日期依据"), right: now.dateBy ? store.byId[now.dateBy]?.name : w("未选"), chevron: true, onClick: () => push({ id: "pick", pick: "dateBy" }) }) : null,
        now.layout === "board" || now.layout === "gallery" ? staticRow("gallery", w("卡片大小"), seg({ value: now.cardSize || "m", onChange: (value) => db.updateView({ cardSize: value }), options: [{ value: "s", label: w("小") }, { value: "m", label: w("中") }, { value: "l", label: w("大") }] })) : null,
        now.layout === "chart" ? [
          heading(w("图表类型")),
          h("div", { class: "chart-kinds" }, [["column", "chart", w("柱状图")], ["bar", "chartBar", w("条形图")], ["line", "chartLine", w("折线图")], ["donut", "chartDonut", w("环形图")]].map(([kind, glyph, label]) => h("button", { type: "button", class: `layout-btn${chart.kind === kind ? " on" : ""}`, on: { click: () => setChart({ kind }) } }, icon(glyph, 18), h("span", null, label)))),
          item({ icon: "group", label: chart.kind === "donut" ? w("按什么分") : w("分类（横轴）"), right: store.byId[chart.x]?.name ?? w("未选"), chevron: true, onClick: () => push({ id: "pick", pick: "chartX" }) }),
          staticRow("sigma", w("统计"), seg({ value: chart.agg, onChange: (value) => setChart({ agg: value, y: value === "count" ? chart.y : chart.y || store.doc.props.find((prop) => prop.type === "number")?.id || null }), options: [{ value: "count", label: w("计数") }, { value: "sum", label: w("求和") }, { value: "avg", label: w("平均") }] })),
          chart.agg !== "count" ? item({ icon: "number", label: w("统计哪个数字"), right: store.byId[chart.y]?.name ?? w("未选"), chevron: true, onClick: () => push({ id: "pick", pick: "chartY" }) }) : null,
          item({ icon: "color", label: w("颜色"), right: chartColorLabel(chart.color), chevron: true, onClick: () => push({ id: "pick", pick: "chartColor" }) }),
        ] : null,
        now.layout !== "chart" ? staticRow(open === "side" ? "open" : "center", w("打开记录"), seg({ value: open, onChange: (value) => db.updateView({ open: value === defaultOpen(now.layout) ? undefined : value }), options: [{ value: "side", label: w("侧边") }, { value: "center", label: w("居中") }] })) : null,
      ));
    };
    draw();
    api.update = draw;
  }

  // A function declaration, hoisted: the card is built (above, in `return pop(…)`) before any line after it runs.
  function staticRow(glyph, label, control) {
    return h("div", { class: "menu-item static" }, h("span", { class: "menu-icon" }, icon(glyph, 16)), h("span", { class: "menu-label" }, label), control);
  }

  // The columns the view shows (dragged into their order, the title's first and always) and those it hides.
  function propsPage(card, api, view) {
    let query = "";
    const search = h("input", { placeholder: w("搜索属性…"), "data-field": "search" });
    search.addEventListener("input", () => { query = search.value; draw(); });
    const list = h("div", { class: "menu-scroll tall", "data-scroll": "props" });
    card.append(...kids(h("div", { class: "menu-search" }, search), list, h("div", { class: "muted sm menu-pad" }, w("拖动调整顺序；隐藏只影响这个视图，数据不会丢。"))));
    const toggleShown = (id) => {
      const now = db.view();
      db.updateView({ hidden: now.hidden.includes(id) ? now.hidden.filter((each) => each !== id) : [...now.hidden, id] });
    };
    // Each part's rows kept by their column (keyed), so that a row dropped slides to its place (reorder.js) rather than being drawn anew.
    const shownHead = h("div");
    const locked = h("div");
    const shownRows = h("div");
    const hiddenHead = h("div");
    const hiddenRows = h("div");
    const empty = h("div");
    list.append(...kids(shownHead, locked, shownRows, hiddenHead, hiddenRows, empty));
    const rowOf = (prop, on) => {
      const grip = h("span", { class: "grip" }, icon("grip", 14));
      const eye = h("button", { type: "button", class: "icon-btn xs", "aria-label": w("切换是否显示"), on: { click: () => toggleShown(prop.id) } });
      const node = h("div", { class: "vis-row", "data-prop": prop.id }, grip, typeIcon(prop.type, 16), h("span", { class: "grow ellipsis" }), eye);
      // Dragged among the rows of its part: the columns' order.
      node.addEventListener("mousedown", (event) => {
        if (query || event.target.closest(".icon-btn")) return;
        const part = node.parentElement;
        const items = () => [...part.children];
        startReorder(event, {
          axis: "y",
          index: items().indexOf(node),
          items,
          onDrop: (from, to) => {
            const ids = moveItem(items().map((each) => each.dataset.prop), from, to);
            store.commit((d) => {
              const order = new Map(ids.map((id, at) => [id, at]));
              const moved = d.props.filter((each) => order.has(each.id)).sort((a, b) => order.get(a.id) - order.get(b.id));
              let next = 0;
              return { ...d, props: d.props.map((each) => (order.has(each.id) ? moved[next++] : each)) };
            });
          },
        });
      });
      fillRow(node, prop, on);
      return node;
    };
    const fillRow = (node, prop, on) => {
      node.querySelector(".grip").hidden = Boolean(query);
      node.querySelector(".prop-ic").replaceWith(typeIcon(prop.type, 16));
      node.querySelector(".grow").textContent = prop.name;
      const eye = node.querySelector(".icon-btn");
      eye.classList.toggle("dim", !on);
      eye.setAttribute("aria-pressed", String(on));
      eye.replaceChildren(...kids(icon(on ? "eye" : "eyeOff", 15)));
    };
    const draw = () => {
      const now = db.view();
      const props = store.doc.props.filter((prop) => prop.type !== "title" && !prop.notes && (!query || prop.name.includes(query)));
      const shown = props.filter((prop) => !now.hidden.includes(prop.id));
      const hidden = props.filter((prop) => now.hidden.includes(prop.id));
      shownHead.replaceChildren(...kids(heading(w("显示"), shown.length > 0 && !query ? h("button", { type: "button", class: "link-btn sm", on: { click: () => db.updateView({ hidden: store.doc.props.filter((prop) => prop.type !== "title").map((prop) => prop.id) }) } }, w("全部隐藏")) : null)));
      locked.replaceChildren(...kids(now.layout !== "chart" ? h("div", { class: "vis-row locked" }, typeIcon("title", 16), h("span", { class: "grow" }, store.doc.props.find((prop) => prop.type === "title")?.name ?? ""), h("span", { class: "muted sm" }, w("始终显示"))) : ""));
      keyed(shownRows, shown, (prop) => prop.id, (prop) => rowOf(prop, true), (node, prop) => fillRow(node, prop, true));
      hiddenHead.replaceChildren(...kids(hidden.length > 0 ? heading(w("隐藏"), !query ? h("button", { type: "button", class: "link-btn sm", on: { click: () => db.updateView({ hidden: [] }) } }, w("全部显示")) : null) : ""));
      keyed(hiddenRows, hidden, (prop) => prop.id, (prop) => rowOf(prop, false), (node, prop) => fillRow(node, prop, false));
      empty.replaceChildren(...kids(!props.length ? h("div", { class: "menu-empty" }, w("无结果")) : ""));
    };
    draw();
    api.update = draw;
  }

  function groupPage(card, view, done) {
    card.append(...kids(item({ label: w("不分组"), checked: !view.groupBy, onClick: () => { db.updateView({ groupBy: null }); done(); } }),
      ...store.doc.props.filter(canGroupBy).map((prop) => item({ icon: typeIcon(prop.type, 20), label: prop.name, checked: view.groupBy === prop.id, onClick: () => { db.updateView({ groupBy: prop.id }); done(); } })),
      h("div", { class: "muted sm menu-pad" }, w("分组后可以折叠；打开“显示计算行”时，统计也会显示在每组的标题上。"))));
  }

  function editPage(card, api, push) {
    const list = h("div", { class: "menu-scroll tall", "data-scroll": "edit" });
    const add = item({ icon: "plus", label: w("新建属性"), onClick: () => newPropMenu(store, db, { anchor: add, onCreated: (id) => push({ id: "prop", prop: id }) }) });
    card.append(...kids(list, sep(), add));
    const draw = () => list.replaceChildren(...kids(...store.doc.props.map((prop) => item({ icon: typeIcon(prop.type, 20), label: prop.name, right: typeLabel(prop.type), chevron: true, onClick: () => push({ id: "prop", prop: prop.id }) }))));
    draw();
    api.update = draw;
  }

  function propPage(card, api, prop, onDeleted) {
    const name = nameField(store, prop, { focus: false });
    const rest = h("div");
    card.append(...kids(name, rest));
    const draw = () => {
      const now = store.byId[prop.id];
      if (!now) return onDeleted();
      const editor = hasEditPage(now) ? propEditor(store, db, now) : null;
      const kind = item({ icon: "swap", label: w("类型"), right: typeLabel(now.type), chevron: true, onClick: () => typeMenu(kind, now) });
      rest.replaceChildren(...kids(
        now.type !== "title" ? kind : null,
        editor ? [sep(), editor.element] : null,
        now.type !== "title" ? [sep(), item({ icon: "trash", label: w("删除属性"), danger: true, onClick: () => {
          store.commit((d) => deleteProp(d, now.id));
          store.snack(w("已删除属性「{0}」", now.name));
          onDeleted();
        } })] : null,
      ));
      rest.dataset.editor = editor?.update ? "1" : "";
      rest._editor = editor;
    };
    draw();
    // A change while it is open: its editor (a formula typed) draws what changes; its kind changed, all of it anew.
    let kindWas = prop.type;
    api.update = () => {
      const now = store.byId[prop.id];
      if (!now) return onDeleted();
      if (now.type !== kindWas || !rest._editor?.update) {
        kindWas = now.type;
        draw();
      } else rest._editor.update();
    };
  }

  function typeMenu(anchor, prop) {
    pop(store.layer, anchor, {
      width: 200,
      placement: "right",
      build: (node, api) => node.append(...kids(...TYPE_ORDER.map((type) => item({ icon: typeIcon(type, 20), label: typeLabel(type), checked: prop.type === type, onClick: () => { store.commit((d) => convertProp(d, prop.id, type)); api.close(); } })))),
    });
  }

  function pickTitle(which) {
    return { boardBy: w("分栏依据"), dateBy: w("日期依据"), chartX: w("分类依据"), chartY: w("统计哪个数字"), chartColor: w("颜色") }[which];
  }

  // A chart's colors as a row says them: 自动 or the color's name.
  function chartColorLabel(color) {
    return color ? colorLabel(color) : w("自动");
  }

  // A chart's colors in a row's icon: four of the colors it draws in (自动: the first colors taken in turn; one of the
  // nine: four of its shades, the deepest first).
  function chartRamp(color) {
    const inks = color === "auto" ? SEQUENCE.slice(0, 4).map((name) => colorStyle(name)["--db-ink"]) : shadeSteps(4).map((step) => shadeOf(color, step));
    return h("span", { class: "chart-ramp" }, inks.map((ink) => h("span", { style: { background: ink } })));
  }

  function pickPage(card, view, which, done) {
    const chart = view.chart || { kind: "column", x: null, agg: "count", y: null };
    // A chart's colors: 自动 (each category its option's color, the others in turn) or one of the nine (a shade each).
    if (which === "chartColor") {
      const { color: now, ...rest } = chart;
      card.append(...kids(...CHART_COLORS.map((color) => item({
        icon: chartRamp(color),
        label: color === "auto" ? w("自动") : colorLabel(color),
        tip: color === "auto" ? w("每类用它选项的颜色，没有颜色的轮流取色") : null,
        checked: (now || "auto") === color,
        onClick: () => {
          if (color !== (now || "auto")) db.updateView({ chart: color === "auto" ? rest : { ...rest, color } });
          done();
        },
      }))));
      return;
    }
    const fits = {
      boardBy: (prop) => prop.type === "select",
      dateBy: (prop) => prop.type === "date",
      chartX: (prop) => ["select", "multi", "checkbox", "date", "text", "title"].includes(prop.type),
      chartY: (prop) => prop.type === "number" || prop.type === "formula",
    };
    const current = which === "boardBy" ? view.boardBy : which === "dateBy" ? view.dateBy : which === "chartX" ? chart.x : chart.y;
    const list = store.doc.props.filter(fits[which]);
    card.append(...kids(...list.map((prop) => item({ icon: typeIcon(prop.type, 20), label: prop.name, checked: current === prop.id, onClick: () => {
      if (which === "boardBy") db.updateView({ boardBy: prop.id });
      else if (which === "dateBy") db.updateView({ dateBy: prop.id });
      else if (which === "chartX") db.updateView({ chart: { ...chart, x: prop.id } });
      else db.updateView({ chart: { ...chart, y: prop.id } });
      done();
    } }))));
    if (!list.length) card.append(...kids(h("div", { class: "menu-empty" }, which === "boardBy" ? w("还没有单选属性") : which === "dateBy" ? w("还没有日期属性") : w("没有可用的属性"))));
  }

  function exportCSV() {
    const view = db.view();
    const columns = store.doc.props.filter((prop) => prop.type === "title" || !view.hidden.includes(prop.id));
    const rows = db.rows();
    const blob = new Blob([toCSV(rows, columns, store.doc.props)], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${w("多维表格")}-${viewName(view)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    store.snack(w("已导出 {0} 条记录", rows.length));
  }
}
