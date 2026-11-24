// A column's menus and what edits it: its menu (its name, its kind, its alignment, filter, sort, group,
// hide, insert beside it, a copy, delete), the menu of a new column (in the table, the columns the view
// hides first, shown again with a click, then a new one of each kind), its name typed where its header
// stands, and the editors of a number's format, of the options and of a formula.
import { optionName } from "../../../shared/database.mjs";
import { FUNCS, FormulaError, compile } from "./data/formula.js";
import { canGroupBy } from "./data/query.js";
import { COLORS, TYPE_ORDER, alignOf, canAlign, colorLabel, convertProp, defaultNum, displayText, exprToIds, exprToNames, getValue, isError, nextColor, numberFormats, titleOf, typeLabel, uid, uniqueName } from "./data/values.js";
import { swatches } from "./ui/colors.js";
import { composing, fit, h, kids } from "./ui/dom.js";
import { icon, typeIcon } from "./ui/icons.js";
import { moveItem, startReorder } from "./ui/reorder.js";
import { box, checkItem, field, FORMULA_WIDTH, heading, item, MENU_WIDTH, pageHead, pop, sep, seg } from "./ui/menu.js";
import { pill } from "./ui/values.js";
import { w } from "./words.js";

const EDITABLE = ["number", "select", "multi", "formula"];
export const hasEditPage = (prop) => EDITABLE.includes(prop.type);

/** A database without the column `id`: its values, and every view's mention of it. */
export function deleteProp(d, id) {
  return {
    ...d,
    props: d.props.filter((prop) => prop.id !== id),
    rows: d.rows.map((row) => {
      const values = { ...row.values };
      delete values[id];
      return { ...row, values };
    }),
    views: d.views.map((view) => ({
      ...view,
      hidden: view.hidden.filter((hidden) => hidden !== id),
      filters: view.filters.filter((filter) => filter.prop !== id),
      sorts: view.sorts.filter((sort) => sort.prop !== id),
      groupBy: view.groupBy === id ? null : view.groupBy,
      boardBy: view.boardBy === id ? null : view.boardBy,
      dateBy: view.dateBy === id ? null : view.dateBy,
      calc: Object.fromEntries(Object.entries(view.calc || {}).filter(([prop]) => prop !== id)),
      ...(view.chart ? { chart: { ...view.chart, x: view.chart.x === id ? null : view.chart.x, y: view.chart.y === id ? null : view.chart.y } } : {}),
    })),
  };
}

const updateProp = (store, id, patch, merge) => store.commit((d) => ({ ...d, props: d.props.map((prop) => (prop.id === id ? { ...prop, ...(typeof patch === "function" ? patch(prop) : patch) } : prop)) }), merge);
const names = (store, prop) => store.doc.props.some((each) => each.id !== prop.id && each.name === prop.name);

/**
 * A column's name typed where its header (or its label in a record's details) stands: the field lies
 * exactly over its words (the same font, size, spacing and line: a copy of the words no one sees sizes
 * it, so neither the words nor what follows them move as it opens), written a character at a time (one
 * step of undo). Left empty, or with another column's name, it goes back to the name it had as it opened.
 * `onEnter()` when Enter ends it. Returns { element, input, end() }.
 */
export function headNameInput(store, prop, { onEnter }) {
  const orig = prop.name;
  // The field is the name's own words made editable, not an <input>: a browser draws an input's words by a path of
  // their own, which at some screen scales (125%, 200%, 225%) sets them a device pixel lower than the name's, so
  // that they moved as the name turned into its field (the user's 2026-11-24). One line: Enter is the caller's, a
  // line break pasted is a space. `value`, `select()` and `setSelectionRange()` as an input has them.
  const input = h("span", { class: "th-input", contenteditable: "plaintext-only", spellcheck: "false", role: "textbox", "aria-label": w("属性名称"), "aria-placeholder": w("属性名称") }, orig);
  const element = h("span", { class: "th-input-wrap" }, input);
  const caretAt = (start, end = start) => {
    const words = input.firstChild;
    const range = document.createRange();
    if (words) {
      range.setStart(words, Math.min(start, words.length));
      range.setEnd(words, Math.min(end, words.length));
    } else range.selectNodeContents(input);
    const selection = getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
  };
  Object.defineProperty(input, "value", { get: () => input.textContent, set: (value) => { input.textContent = value; } });
  input.select = () => caretAt(0, input.textContent.length);
  input.setSelectionRange = caretAt;
  // What typing or a paste left: one line of words, no element (the browser's <br> in an emptied field taken out,
  // so that the placeholder shows: database.css .th-input:empty).
  const tidy = () => {
    const words = input.textContent;
    const flat = words.replace(/[\r\n]+/g, " ");
    if (flat === words && (input.childNodes.length === 1 && input.firstChild.nodeType === 3 || !words && !input.firstChild)) return;
    const selection = getSelection();
    const at = selection.rangeCount && input.contains(selection.focusNode) ? flat.length : null;
    input.textContent = flat;
    if (!flat) input.replaceChildren();
    if (at !== null) caretAt(at);
  };
  input.addEventListener("beforeinput", (event) => {
    if (event.inputType === "insertParagraph" || event.inputType === "insertLineBreak") event.preventDefault();
  });
  const merge = `rename-${prop.id}`;
  const taken = (name) => store.doc.props.some((each) => each.name === name && each.id !== prop.id);
  const markTaken = () => {
    const name = input.value.trim();
    const bad = Boolean(name) && taken(name);
    input.classList.toggle("bad", bad);
    input.toggleAttribute("data-doc-tip", bad);
    if (bad) input.setAttribute("data-doc-tip", w("已经有一个叫“{0}”的属性了", name));
  };
  const rename = () => {
    const name = input.value.trim();
    const now = store.byId[prop.id];
    if (name && now && name !== now.name && !taken(name)) updateProp(store, prop.id, { name }, merge);
  };
  input.addEventListener("input", (event) => {
    // Written a character at a time; what an input method is still composing, once it is chosen (and left as the
    // input method has it until then).
    if (!event.isComposing) tidy();
    markTaken();
    if (!event.isComposing) rename();
  });
  input.addEventListener("compositionend", () => {
    tidy();
    markTaken();
    rename();
  });
  // The first press in the field soon after the click that opened it (and selected its words) is that click's second
  // to the system, a double click that would select the word again: it puts the caret where it lands, as a click does
  // (the user's 2026-11-24: the second click "did nothing" now and then).
  let pressed = false;
  input.addEventListener("mousedown", (event) => {
    event.stopPropagation();
    if (!pressed && event.button === 0 && event.detail > 1) {
      event.preventDefault();
      const point = caretFromPoint(event.clientX, event.clientY);
      input.focus({ preventScroll: true });
      if (point && input.contains(point.startContainer)) {
        point.collapse(true);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(point);
      }
    }
    pressed = true;
  });
  input.addEventListener("click", (event) => event.stopPropagation());
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter" && !composing(event)) {
      event.preventDefault();
      onEnter?.();
    }
  });
  let ended = false;
  return {
    element,
    input,
    end() {
      if (ended) return;
      ended = true;
      const name = input.value.trim();
      if ((!name || taken(name)) && store.byId[prop.id]?.name !== orig) updateProp(store, prop.id, { name: orig }, merge);
      store.flush();
    },
  };
}

// A caret where a point is, as a collapsed range (null where none is there).
function caretFromPoint(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  const at = document.caretPositionFromPoint?.(x, y);
  if (!at) return null;
  const range = document.createRange();
  range.setStart(at.offsetNode, at.offset);
  return range;
}

/** A column's name in a field of a menu: saved as the field is left or Enter pressed (one step); left empty or as another column's name, nothing is written. */
export function nameField(store, prop, { onEnter, focus = true } = {}) {
  const { wrap, input } = field({ icon: typeIcon(prop.type, 16), value: prop.name, placeholder: w("属性名称") });
  input.dataset.field = "name";
  const error = h("div", { class: "input-error", hidden: true });
  const taken = () => {
    const name = input.value.trim();
    return name !== prop.name && store.doc.props.some((each) => each.name === name && each.id !== prop.id);
  };
  const save = () => {
    const name = input.value.trim();
    const now = store.byId[prop.id];
    if (!name || !now || name === now.name || taken()) return;
    updateProp(store, prop.id, { name });
  };
  input.addEventListener("input", () => {
    error.hidden = !taken();
    error.textContent = w("已经有一个叫“{0}”的属性了", input.value.trim());
  });
  input.addEventListener("blur", save);
  input.addEventListener("focus", () => input.select());
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !composing(event)) {
      save();
      onEnter?.();
    }
  });
  if (focus) input.focus({ preventScroll: true });
  return h("div", null, h("div", { class: "menu-pad" }, wrap), error);
}

const ALIGN_ICON = { left: "alignLeft", center: "alignCenter", right: "alignRight" };
const aligns = () => [{ value: "left", label: w("左对齐") }, { value: "center", label: w("居中") }, { value: "right", label: w("右对齐") }];
/** A number's, a date's or a formula's alignment: the whole column's (its header, its cells, its total). */
function alignRow(store, prop) {
  const at = alignOf(prop);
  return h("div", { class: "menu-item static align-row" }, h("span", { class: "menu-icon" }, icon(ALIGN_ICON[at], 16)), h("span", { class: "menu-label" }, w("对齐")),
    seg({ value: at, onChange: (value) => updateProp(store, prop.id, { align: value }), options: aligns().map((option) => ({ value: option.value, tip: option.label, label: icon(ALIGN_ICON[option.value], 14) })) }));
}

/**
 * A column's menu over `anchor` (its header; `inlineName`: its name typed in the header, no field of it
 * here); `startPage` "type" (its icon pressed: the kinds) or "edit". `db`: the drawing's (the view, its
 * changes). `onInsert(side)`: a column put in beside it (the table's). `onClose` as it closes.
 */
export function propMenu(store, db, { propId, anchor, startPage, inlineName, onInsert, onFilter, onClose }) {
  let page = startPage || (store.byId[propId]?.type === "formula" && !store.byId[propId]?.formula ? "edit" : "main");
  const card = pop(store.layer, anchor, {
    onClose,
    build: (node, api) => {
      api.update = null;
      const prop = store.byId[propId];
      if (!prop) return void api.close();
      const isTitle = prop.type === "title";
      node.style.width = `${page === "edit" && prop.type === "formula" ? FORMULA_WIDTH : MENU_WIDTH}px`;
      const go = (next) => { page = next; api.rebuild(); };
      // The main page's rows, of the column as it is now.
      function mainRows(prop) {
        const isTitle = prop.type === "title";
        const view = db.view();
        return [
            hasEditPage(prop) ? item({ icon: "sliders", label: prop.type === "formula" ? w("编辑公式") : prop.type === "number" ? w("数字格式") : w("编辑选项"), chevron: true, onClick: () => go("edit") }) : null,
            !isTitle ? item({ icon: "swap", label: w("更改类型"), right: typeLabel(prop.type), chevron: true, onClick: () => go("type") }) : null,
            canAlign(prop) ? alignRow(store, prop) : null,
            sep(),
            item({ icon: "filter", label: w("筛选"), onClick: () => { api.close(); onFilter?.(prop); } }),
            item({ icon: "arrowUp", label: w("升序排列"), onClick: () => { db.sortFromHeader([{ prop: prop.id, dir: "asc" }]); api.close(); } }),
            item({ icon: "arrowDown", label: w("降序排列"), onClick: () => { db.sortFromHeader([{ prop: prop.id, dir: "desc" }]); api.close(); } }),
            view.layout === "table" && canGroupBy(prop)
              ? view.groupBy === prop.id
                ? item({ icon: "group", label: w("取消分组"), onClick: () => { db.updateView({ groupBy: null }); api.close(); } })
                : item({ icon: "group", label: w("按此属性分组"), onClick: () => { db.updateView({ groupBy: prop.id }); api.close(); } })
              : null,
            !isTitle ? item({ icon: "eyeOff", label: w("在此视图隐藏"), onClick: () => { db.updateView({ hidden: [...view.hidden, prop.id] }); api.close(); } }) : null,
            sep(),
            onInsert ? item({ icon: "insertLeft", label: w("在左侧插入"), onClick: () => onInsert("left") }) : null,
            onInsert ? item({ icon: "insertRight", label: w("在右侧插入"), onClick: () => onInsert("right") }) : null,
            !isTitle ? item({ icon: "copy", label: w("创建属性副本"), onClick: () => {
              const copy = { ...structuredClone(prop), id: uid("p"), name: uniqueName(store.doc.props, w("{0} 副本", prop.name)) };
              store.commit((d) => {
                const props = [...d.props];
                props.splice(props.findIndex((each) => each.id === prop.id) + 1, 0, copy);
                return { ...d, props, rows: prop.type === "formula" ? d.rows : d.rows.map((row) => ({ ...row, values: { ...row.values, [copy.id]: structuredClone(row.values[prop.id] ?? null) } })) };
              });
              store.snack(w("已创建「{0}」", copy.name));
              api.close();
            } }) : null,
            !isTitle ? item({ icon: "trash", label: w("删除属性"), danger: true, onClick: () => {
              api.close();
              store.commit((d) => deleteProp(d, prop.id));
              store.snack(w("已删除属性「{0}」", prop.name));
            } }) : null,
        ].filter(Boolean);
      }
      if (page === "main") {
        const rest = h("div");
        node.append(...kids(inlineName ? null : nameField(store, prop, { onEnter: () => api.close() }), rest));
        api.update = () => {
          const now = store.byId[propId];
          if (!now) return void api.close();
          rest.replaceChildren(...kids(...mainRows(now)));
        };
        api.update();
      } else if (page === "type") {
        node.append(...kids(pageHead(w("更改类型"), Object.assign(() => go("main"), { label: w("返回") })),
          ...TYPE_ORDER.map((type) => item({ icon: typeIcon(type, 20), label: typeLabel(type), checked: prop.type === type, onClick: () => {
            if (type === prop.type) return go("main");
            store.commit((d) => convertProp(d, prop.id, type));
            store.snack(type === "formula" ? w("已改为公式：这一列原来的值不再保留，可以撤销") : ["number", "date", "checkbox"].includes(type) ? w("已改为{0}，识别不了的值会原样保留并显示为灰色", typeLabel(type)) : w("已改为{0}，可以撤销", typeLabel(type)));
            if (EDITABLE.includes(type)) go("edit");
            else api.close();
          } }))));
      } else {
        const title = prop.type === "formula" ? w("编辑公式 · {0}", prop.name) : prop.type === "number" ? w("数字格式 · {0}", prop.name) : w("编辑选项 · {0}", prop.name);
        node.append(...kids(pageHead(title, Object.assign(() => go("main"), { label: w("返回") }))));
        const editor = propEditor(store, db, prop, { onDone: () => api.close() });
        if (editor) {
          node.append(...kids(editor.element));
          api.update = editor.update ? () => editor.update() : null;
        }
      }
    },
  });
  return card;
}

/**
 * The menu of a new column over `anchor`: a name (may be left out) and its kind; `at` where it goes
 * ({ side, of }: beside a column; else at the end). `hidden`: the columns the view hides, listed first
 * (a click shows one again where it stands). `onCreated(id, type)` once it is made.
 */
export function newPropMenu(store, db, { anchor, at, title, hidden = [], onCreated, onClose, placement }) {
  return pop(store.layer, anchor, {
    placement,
    onClose,
    build: (node, api) => {
      const { wrap, input } = field({ icon: icon("edit", 15, { cls: "prop-ic" }), placeholder: w("属性名称（可不填）") });
      input.dataset.field = "name";
      const create = (type) => {
        const id = uid("p");
        const prop = { id, name: uniqueName(store.doc.props, input.value.trim() || typeLabel(type)), type, width: type === "checkbox" ? 90 : type === "number" ? 110 : 160 };
        if (type === "number") prop.numberFormat = defaultNum();
        if (type === "select" || type === "multi") prop.options = [];
        if (type === "formula") prop.formula = "";
        const view = db.view();
        store.commit((d) => {
          const props = [...d.props];
          if (at) {
            const of = props.findIndex((each) => each.id === at.of);
            props.splice(at.side === "left" ? Math.max(1, of) : of + 1, 0, prop);
          } else props.push(prop);
          // A view of cards shows its few chosen columns: a new column is hidden there, shown where it was made.
          const views = d.views.map((each) => (each.id !== view.id && each.layout !== "table" ? { ...each, hidden: [...each.hidden, id] } : each));
          return { ...d, props, views };
        });
        api.close();
        onCreated?.(id, type);
      };
      const shown = hidden.map((id) => store.byId[id]).filter(Boolean);
      // The columns the view hides first (a click shows one again where it stands), then a new one.
      node.append(...kids(
        shown.length ? heading(w("隐藏的属性")) : null,
        ...shown.map((prop) => item({ icon: typeIcon(prop.type, 20), label: prop.name, right: w("显示"), cls: "hidden-prop", data: { prop: prop.id }, onClick: () => {
          db.updateView({ hidden: db.view().hidden.filter((each) => each !== prop.id) });
          api.close();
          onCreated?.(prop.id, prop.type, true);
        } })),
        shown.length ? sep() : null,
        title ? heading(title) : null,
        h("div", { class: "menu-pad" }, wrap),
        heading(w("选择类型")),
        h("div", { class: "type-grid" }, TYPE_ORDER.map((type) => h("button", { type: "button", class: "type-btn", on: { click: () => create(type) } }, typeIcon(type, 16), h("span", null, typeLabel(type))))),
      ));
      input.focus({ preventScroll: true });
    },
  });
}

// ---------- a column edited: a number's format, the options, a formula ----------
/** The editor of a column of `prop`'s kind (none for the others): { element, update? }. */
export function propEditor(store, db, prop, { onDone } = {}) {
  if (prop.type === "number") return numberEditor(store, prop);
  if (prop.type === "select" || prop.type === "multi") return optionsEditor(store, prop);
  if (prop.type === "formula") return formulaEditor(store, db, prop, { onDone });
  return null;
}

function numberEditor(store, prop) {
  const format = prop.numberFormat || defaultNum();
  const set = (patch) => updateProp(store, prop.id, { numberFormat: { ...format, ...patch } });
  return {
    element: h("div", { class: "menu-pad stack" },
      heading(w("格式")),
      h("div", { class: "fmt-grid" }, numberFormats().map((each) => h("button", {
        type: "button",
        class: `fmt-btn${format.format === each.id ? " on" : ""}`,
        on: { click: () => set({ format: each.id, display: each.id === "percent" ? format.display : format.display === "bar" ? "number" : format.display }) },
      }, h("span", null, each.label), h("span", { class: "muted sm num" }, each.sample)))),
      heading(w("小数位数")),
      seg({ value: format.decimals, onChange: (value) => set({ decimals: value }), options: [{ value: null, label: w("自动") }, { value: 0, label: "0" }, { value: 1, label: "1" }, { value: 2, label: "2" }, { value: 3, label: "3" }] }),
      heading(w("显示为")),
      seg({ value: format.display, onChange: (value) => set({ display: value }), options: [{ value: "number", label: w("数字") }, { value: "bar", label: w("进度条") }, { value: "stars", label: w("星级") }] }),
      h("div", { class: "muted sm" }, w("进度条：百分比按 0–100% 画，其他数字按这一列的最大值画。星级：1–5 星。"))),
  };
}

function optionsEditor(store, prop) {
  const { wrap, input } = field({ icon: "plus", placeholder: w("添加选项，回车确认") });
  input.dataset.field = "option";
  const list = h("div", { class: "menu-scroll", "data-scroll": "options" });
  const live = () => store.byId[prop.id] ?? prop;
  const setOptions = (options) => updateProp(store, prop.id, { options: options.map((option) => ({ ...option, added: undefined })) });
  const usage = (id) => store.doc.rows.filter((row) => {
    const value = row.values[prop.id];
    return Array.isArray(value) ? value.includes(id) : value === id;
  }).length;
  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || composing(event)) return;
    const name = optionName(input.value);
    const options = live().options || [];
    input.value = "";
    if (!name || options.some((option) => option.name === name)) return;
    setOptions([...options, { id: uid("o"), name, color: nextColor(live()) }]);
  });
  const draw = () => {
    const options = live().options || [];
    list.replaceChildren(...kids(...options.map((option, at) => {
      const row = h("div", { class: "opt-row", "data-opt": option.id }, h("span", { class: "grip" }, icon("grip", 14)), pill(option), option.done ? h("span", { class: "tag-done" }, w("完成")) : null, h("span", { class: "grow" }), h("span", { class: "muted sm" }, String(usage(option.id))), icon("chevronRight", 14, { cls: "muted" }));
      // Dragged up or down among the others (as a column's line in the settings): the options' order.
      row.addEventListener("mousedown", (event) => {
        const rows = () => [...list.querySelectorAll(":scope > .opt-row")];
        startReorder(event, { axis: "y", index: at, items: rows, keyOf: (each) => each.dataset.opt, onDrop: (from, to) => setOptions(moveItem(live().options || [], from, to)) });
      });
      row.addEventListener("click", () => optionMenu(store, prop, option.id, row, { usage: usage(option.id) }));
      return row;
    })));
    if (!options.length) list.append(h("div", { class: "menu-empty" }, w("还没有选项。也可以直接在格子里输入，回车即创建。")));
  };
  draw();
  return {
    element: h("div", { class: "opt-editor" }, h("div", { class: "menu-pad" }, wrap), list, h("div", { class: "muted sm menu-pad" }, w("拖动调整顺序；这个顺序也是看板分栏和排序的顺序。"))),
    update: draw,
  };
}

/**
 * An option's menu (an option clicked among a column's options, a board column's ···): its name in a field
 * (with `onRename`, a row that edits it where it stands), counts as done (a select's), delete, its color.
 */
export function optionMenu(store, prop, optionId, anchor, { usage = 0, onRename, placement = "right", onClose } = {}) {
  const live = () => store.byId[prop.id] ?? prop;
  const patch = (change) => updateProp(store, prop.id, (now) => ({ options: (now.options || []).map((option) => ({ ...(option.id === optionId ? { ...option, ...change } : option), added: undefined })) }));
  let rename = () => {};
  return pop(store.layer, anchor, {
    width: 220,
    placement,
    onClose: () => { rename(); onClose?.(); },
    build: (node, api) => {
      const option = (live().options || []).find((each) => each.id === optionId);
      if (!option) return void api.close();
      if (onRename) node.append(...kids(item({ icon: "edit", label: w("重命名"), onClick: () => { api.close(); onRename(); } })));
      else {
        const input = h("input", { class: "text-input", value: option.name, "data-field": "option-name" });
        const error = h("div", { class: "input-error", hidden: true }, w("这个选项已经存在"));
        const taken = () => input.value.trim() !== option.name && (live().options || []).some((each) => each.name === input.value.trim());
        rename = () => {
          const name = optionName(input.value);
          const now = (live().options || []).find((each) => each.id === optionId);
          if (name && now && name !== now.name && !taken()) patch({ name });
        };
        input.addEventListener("input", () => { error.hidden = !taken(); });
        input.addEventListener("blur", () => rename());
        input.addEventListener("keydown", (event) => { if (event.key === "Enter" && !composing(event)) { rename(); api.close(); } });
        node.append(...kids(h("div", { class: "menu-pad" }, input), error));
        input.focus({ preventScroll: true });
      }
      const done = Boolean(option.done);
      const palette = swatches(COLORS, { value: option.color, label: colorLabel, onPick: (color) => patch({ color }) });
      node.append(...kids(
        prop.type === "select" ? checkItem({ icon: "check", label: w("视为已完成"), on: done, tip: w("勾上后，这个选项的记录整行变淡，算作已完成"), onChange: (on) => patch({ done: on || undefined }) }) : null,
        item({ icon: "trash", label: onRename ? w("删除这一列") : w("删除选项"), danger: true, onClick: () => {
          store.commit((d) => ({
            ...d,
            props: d.props.map((each) => (each.id === prop.id ? { ...each, options: (each.options || []).filter((one) => one.id !== optionId) } : each)),
            rows: d.rows.map((row) => {
              const value = row.values[prop.id];
              if (Array.isArray(value) ? value.includes(optionId) : value === optionId) return { ...row, values: { ...row.values, [prop.id]: Array.isArray(value) ? value.filter((one) => one !== optionId) : null } };
              return row;
            }),
          }));
          rename = () => {};
          api.close();
          store.snack(usage ? w("已删除选项「{0}」，{1} 条记录的这一格被清空", option.name, usage) : w("已删除选项「{0}」", option.name));
        } }),
        sep(),
        heading(w("颜色")),
        palette.element,
      ));
      api.update = () => {
        const now = (live().options || []).find((each) => each.id === optionId);
        if (!now) return void api.close();
        palette.set(now.color);
        const done = node.querySelector(".check-item");
        if (done && done.getAttribute("aria-checked") !== String(Boolean(now.done))) {
          done.setAttribute("aria-checked", String(Boolean(now.done)));
          done.lastElementChild.replaceWith(box(Boolean(now.done)));
        }
      };
    },
  });
}

// ---------- a formula's editor: what it refers to put in by a click, its results shown as it is typed ----------
function formulaEditor(store, db, prop, { onDone }) {
  const area = h("textarea", { class: "formula-input", spellcheck: "false", placeholder: w("例如：{估时} * (1 - {进度})"), "data-field": "formula" });
  area.value = exprToNames(prop.formula || "", store.doc.props);
  const status = h("div", { class: "formula-status" });
  const preview = h("div", { class: "formula-preview" });
  const done = h("button", { type: "button", class: "btn primary sm" }, w("完成"));
  const read = () => {
    const words = area.value;
    const ids = exprToIds(words, store.doc.props);
    const node = words.trim() ? compile(ids) : null;
    const error = node instanceof FormulaError ? node.message : null;
    const unknown = [...words.matchAll(/\{([^}]+)\}/g)].map((found) => found[1].trim()).filter((name) => !store.doc.props.some((each) => each.name === name || each.id === name));
    return { words, ids, error, unknown };
  };
  const draw = () => {
    const { words, ids, error, unknown } = read();
    status.classList.toggle("bad", Boolean(error || unknown.length));
    status.textContent = error ? error : unknown.length ? w("找不到属性：{0}", unknown.join(w("、"))) : words.trim() ? w("公式可用") : w("用 {属性名} 引用同一行的值");
    done.disabled = Boolean(error) || unknown.length > 0;
    preview.hidden = Boolean(error || unknown.length || !words.trim());
    if (preview.hidden) return;
    const fake = { ...prop, formula: ids };
    const map = { ...store.byId, [prop.id]: fake };
    preview.replaceChildren(...kids(...db.rows().slice(0, 3).map((row) => {
      const value = getValue(row, fake, map);
      return h("div", { class: "fp-row" }, h("span", { class: "ellipsis" }, titleOf(row, store.doc.props) || w("无标题")), h("span", { class: `num${isError(value) ? " v-error" : ""}` }, isError(value) ? value.error : displayText(value, { ...prop, type: "formula" }) || "空"));
    })));
  };
  const insert = (words) => {
    const from = area.selectionStart;
    const to = area.selectionEnd;
    area.value = area.value.slice(0, from) + words + area.value.slice(to);
    area.focus();
    const at = from + words.length - (words.endsWith("()") ? 1 : 0);
    area.setSelectionRange(at, at);
    draw();
  };
  const save = () => {
    const { ids, error, unknown } = read();
    if (error || unknown.length) return;
    updateProp(store, prop.id, { formula: ids });
    onDone?.();
  };
  area.addEventListener("input", draw);
  area.addEventListener("keydown", (event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) save(); });
  done.addEventListener("click", save);
  draw();
  requestAnimationFrame(() => area.focus({ preventScroll: true }));
  return {
    element: h("div", { class: "formula" }, area, status, preview,
      heading(w("插入属性")),
      h("div", { class: "formula-chips" }, store.doc.props.filter((each) => each.id !== prop.id).map((each) => h("button", { type: "button", class: "chip-btn", on: { click: () => insert(`{${each.name}}`) } }, typeIcon(each.type, 13), each.name))),
      heading(w("函数")),
      h("div", { class: "formula-funcs" }, Object.entries(FUNCS).map(([name, fn]) => h("button", { type: "button", class: "fn-row", "data-doc-tip": w(fn.desc), on: { click: () => insert(`${name}()`) } }, h("code", null, w(fn.sig)), h("span", { class: "muted sm" }, w(fn.desc))))),
      h("div", { class: "formula-foot" }, h("span", { class: "muted sm" }, w("只算同一行；文件里只存公式，不存结果")), done)),
    update: draw,
  };
}

export { fit };
