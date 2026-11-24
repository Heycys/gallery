// A board (看板): a column per option of the view's single select (`boardBy`), in the options' order (a column of
// records with none only while there are some), each a card per record. A card dragged goes to another column (its
// value) and, with no sort, to its place among the cards (the records' order), the cards making room as it goes
// (card-drag.js); a column's head dragged moves the column (the options' order, ui/reorder.js); its name pressed is
// typed where it stands; its ··· gives the option's menu, its + a new record in it; the round + past the last column
// a new column (a new option), its name typed at once.
import { optionName } from "../../../../shared/database.mjs";
import { nextColor, uid } from "../data/values.js";
import { optionMenu } from "../props.js";
import { paint } from "../ui/colors.js";
import { h, kids, toggle } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { createRail } from "../ui/rail.js";
import { startReorder } from "../ui/reorder.js";
import { pill } from "../ui/values.js";
import { w } from "../words.js";
import { dragCard } from "./card-drag.js";
import { card, cardProps } from "./cards.js";
import { boardColumns, moveOptions } from "./model.js";

/** The board view of the store's database for `db`. */
export function createBoard(store, db) {
  const board = h("div", { class: "board no-native-scrollbar" });
  const frame = h("div", { class: "board-frame" }, board);
  const rail = createRail(board);
  frame.append(rail.element);
  // Its edges fade where columns lie past them (database.css: .more-start, .more-end), said again as it scrolls, as
  // its size or its columns change.
  const edges = () => {
    const room = board.scrollWidth - board.clientWidth;
    toggle(board, "more-start", room > 1 && board.scrollLeft > 1);
    toggle(board, "more-end", room > 1 && board.scrollLeft < room - 1);
  };
  board.addEventListener("scroll", edges, { passive: true });
  const sizes = new ResizeObserver(edges);
  sizes.observe(board);
  const empty = h("div", { class: "empty-state" }, icon("board", 28), h("div", null, w("看板按一个单选属性分栏")),
    h("button", { type: "button", class: "btn", on: { click: () => db.openSettings("layout") } }, w("选择分栏依据")));
  const element = h("div", { style: { display: "contents" } });
  let naming = null; // the option whose name is typed in its column's head
  let menuOpen = null; // the option whose column's menu is open
  let held = false; // a card dragged: the board not drawn meanwhile
  let missed = false; // a change that came while it was held
  let shown = new Map(); // the records each column shows, by its key, as last drawn

  const prop = () => (db.view().boardBy ? store.byId[db.view().boardBy] : null);
  const setOptions = (change) => {
    const gp = prop();
    store.commit((d) => ({ ...d, props: d.props.map((each) => (each.id === gp.id ? { ...each, options: change(each.options || []).map((option) => ({ ...option, added: undefined })) } : each)) }));
  };

  function draw() {
    const gp = prop();
    if (!gp) {
      element.replaceChildren(empty);
      return;
    }
    if (element.firstElementChild !== frame) element.replaceChildren(frame);
    const now = db.view();
    const { rows } = store.rowsOf(now);
    const props = cardProps(store, now);
    const opts = gp.options || [];
    const groups = boardColumns(rows, gp, store.byId).shown;
    shown = new Map(groups.map((group) => [group.key, group.rows]));
    board.className = `board no-native-scrollbar size-${now.cardSize || "m"}`;
    const scrolled = board.scrollLeft;
    board.replaceChildren(...groups.map((group, at) => column(gp, opts, group, props, at === groups.length - 1)));
    board.scrollLeft = scrolled;
    rail.place();
    edges();
    // A column just made: its name typed at once.
    const field = board.querySelector(".board-name-input");
    if (field && document.activeElement !== field) {
      field.focus({ preventScroll: true });
      field.select();
    }
  }

  function column(gp, opts, group, props, last) {
    const option = opts.find((each) => each.id === group.key);
    const name = option?.name ?? group.label;
    const head = h("div", { class: `board-head${option ? " movable" : ""}` });
    const col = paint(h("div", { class: `board-col${group.rows.length ? "" : " empty"}${menuOpen === group.key ? " menu-open" : ""}`, "data-col": group.key, "data-opt": option ? option.id : null }, head), option ? option.color : "default");
    if (option && naming === option.id) head.append(nameInput(gp, option));
    else if (option) head.append(h("span", { class: "board-name", "data-doc-tip": store.editable ? w("点击改名；按住列头可以拖动换位置") : null, on: { click: () => { if (!store.editable) return; naming = option.id; draw(); } } }, pill(option)));
    else head.append(h("span", { class: "group-label" }, group.label));
    head.append(h("span", { class: "group-n" }, String(group.rows.length)), h("span", { class: "grow" }));
    if (store.editable) {
      const acts = h("span", { class: "board-acts" });
      if (option) {
        const more = h("button", { type: "button", class: "icon-btn xs", "aria-label": w("“{0}”这一列的更多操作", name), "data-doc-tip": w("更多") }, icon("more", 15));
        more.addEventListener("click", () => {
          menuOpen = option.id;
          col.classList.add("menu-open");
          optionMenu(store, gp, option.id, more, {
            placement: "bottom",
            usage: store.doc.rows.filter((row) => row.values[gp.id] === option.id).length,
            onRename: () => { naming = option.id; draw(); },
            onClose: () => { menuOpen = null; col.classList.remove("menu-open"); },
          });
        });
        acts.append(more);
      }
      const label = w("在“{0}”里新建", name);
      acts.append(h("button", { type: "button", class: "icon-btn xs", "aria-label": label, "data-doc-tip": label, on: { click: () => db.addRow({ [gp.id]: gp.type === "checkbox" ? group.key === "yes" : group.key || null }, { open: true, before: group.rows[0]?.id }) } }, icon("plus", 15)));
      head.append(acts);
    }
    if (option) head.addEventListener("mousedown", (event) => {
      if (!store.editable || event.target.closest("button, input")) return;
      const items = () => [...board.querySelectorAll(".board-col[data-opt]")];
      startReorder(event, { axis: "x", index: items().indexOf(col), items, keyOf: (each) => each.dataset.opt, onDrop: (from, to) => setOptions((list) => moveOptions(list, items().map((each) => each.dataset.opt), from, to)) });
    });
    const cards = h("div", { class: "board-cards" }, group.rows.map((row) => h("div", { class: "card-slot" }, card(store, db, row, props, { onDown: (event, node) => dragCard(event, node, {
      store, db, board, row, prop: gp,
      rowsOf: (key) => shown.get(key) ?? [],
      colorOf: (key) => opts.find((each) => each.id === key)?.color || "default",
      hold: (on) => {
        held = on;
        if (!on && missed) {
          missed = false;
          draw();
        }
      },
      draw,
    }) }))));
    col.append(cards);
    if (last && store.editable && gp.type === "select") {
      col.append(h("div", { class: "col-add-zone" }, h("button", { type: "button", class: "end-plus", "aria-label": w("新建分组"), "data-doc-tip": w("新建分组"), on: { click: addGroup } }, icon("plus", 14, { bold: 2.2 }))));
    }
    return col;
  }

  // A group's name edited in its column's head (as a column's in its header: what is typed one step; left empty or
  // as the name of another, it goes back as it ends).
  function nameInput(gp, option) {
    const orig = option.name;
    const opts = () => prop()?.options || [];
    const taken = (name) => opts().some((each) => each.name === name && each.id !== option.id);
    const setName = (name) => store.commit((d) => ({ ...d, props: d.props.map((each) => (each.id === gp.id ? { ...each, options: (each.options || []).map((one) => ({ ...(one.id === option.id ? { ...one, name } : one), added: undefined })) } : each)) }), `optname-${option.id}`);
    const input = paint(h("input", { class: "board-name-input", value: option.name, spellcheck: "false", placeholder: w("分组名称") }), option.color);
    const size = () => { input.size = Math.max(2, [...input.value].reduce((n, ch) => n + (ch.charCodeAt(0) > 255 ? 2 : 1), 0) + 1); };
    size();
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      const name = input.value.trim();
      if (!name || taken(name)) setName(orig);
      store.flush();
      naming = null;
      draw();
    };
    input.addEventListener("mousedown", (event) => event.stopPropagation());
    input.addEventListener("input", () => {
      const value = input.value.replace(/[,，、]/g, "");
      if (value !== input.value) input.value = value;
      size();
      // As the format holds a name (what parts names a space: a tab pasted in), so that it reads back as one.
      const name = optionName(value);
      const bad = Boolean(name) && taken(name);
      input.classList.toggle("bad", bad);
      if (bad) input.setAttribute("data-doc-tip", w("已经有一个叫“{0}”的分组了", name));
      else input.removeAttribute("data-doc-tip");
      if (name && !bad) setName(name);
    });
    input.addEventListener("blur", end);
    input.addEventListener("keydown", (event) => {
      event.stopPropagation();
      if ((event.key === "Enter" && !event.isComposing) || event.key === "Escape") {
        event.preventDefault();
        end();
      }
    });
    return input;
  }

  // The + right of the last column: a new column (a new option), its name typed in its head at once.
  function addGroup() {
    const gp = prop();
    const opts = gp.options || [];
    const id = uid("o");
    let name = w("新分组");
    for (let n = 2; opts.some((option) => option.name === name); n++) name = `${w("新分组")} ${n}`;
    naming = id;
    setOptions((list) => [...list, { id, name, color: nextColor(gp) }]);
    requestAnimationFrame(() => board.scrollTo({ left: board.scrollWidth, behavior: "smooth" }));
  }

  return {
    element,
    update() {
      // A column's name being typed: what it types is the only change, the field stays as it is.
      const field = board.querySelector(".board-name-input");
      if (naming && field && document.activeElement === field) return;
      if (held) missed = true;
      else draw();
    },
    destroy() {
      rail.destroy();
      sizes.disconnect();
    },
  };
}
