// A calendar: a month of days, each record on the day of the view's date (`dateBy`); the month before and after,
// today's; a record dragged to another day takes that date; a day's + (or a double click on it) a new record of
// that date, opened; the records with no date in a card under 未排期, dragged from there onto a day.
import { todayStr } from "../data/formula.js";
import { isRowDone, monthStart, monthTitle, titleOf, weekdays, ymd } from "../data/values.js";
import { h, kids } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { pop } from "../ui/menu.js";
import { valueView } from "../ui/values.js";
import { w } from "../words.js";
import { appOf, cardProps, swallowClick } from "./cards.js";
import { monthDays, recordsByDay } from "./model.js";

/** The calendar view of the store's database for `db`. */
export function createCalendar(store, db) {
  const element = h("div", { style: { display: "contents" } });
  const today = todayStr();
  let month = { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 };
  let undated = null; // the card of the records with no date, open
  let undatedButton = null;
  let dragging = false;

  const dateProp = () => (db.view().dateBy ? store.byId[db.view().dateBy] : null);

  const byDay = (dp, rows) => {
    const { days, undated } = recordsByDay(rows, dp, store.byId);
    return { days, none: undated };
  };

  function item(row, dp, props, small = false) {
    const done = isRowDone(row, store.doc.props);
    const node = h("div", { class: `cal-item${done ? " done" : ""}${small ? " in-panel" : ""}` },
      h("span", { class: "cal-item-title" }, titleOf(row, store.doc.props) || w("无标题")),
      props.filter((prop) => prop.id !== dp.id).map((prop) => h("span", { class: "cal-item-prop" }, valueView(store, row, prop, "calendar"))));
    node.addEventListener("mousedown", (event) => drag(event, node, row));
    node.addEventListener("click", (event) => {
      event.stopPropagation();
      if (small) undated?.close();
      db.openRow(row.id);
    });
    node.addEventListener("contextmenu", (event) => {
      if (!store.editable) return;
      event.preventDefault();
      db.openRowMenu(row.id, { left: event.clientX, top: event.clientY, right: event.clientX, bottom: event.clientY });
    });
    return node;
  }

  function draw() {
    const dp = dateProp();
    if (!dp) {
      element.replaceChildren(h("div", { class: "empty-state" }, icon("calendar", 28), h("div", null, w("日历按一个日期属性排布")),
        h("button", { type: "button", class: "btn", on: { click: () => db.openSettings("layout") } }, w("选择日期依据"))));
      return;
    }
    const now = db.view();
    const { rows } = store.rowsOf(now);
    const props = cardProps(store, now);
    const { days, none } = byDay(dp, rows);
    const shownDays = monthDays(month.y, month.m);
    const weeks = shownDays.length / 7;
    undatedButton = h("button", { type: "button", class: `btn ghost sm${undated ? " active" : ""}`, on: { click: () => (undated ? undated.close() : openUndated()) } }, icon("inbox", 14), w("未排期 {0}", none.length));
    const head = h("div", { class: "cal-head" },
      h("span", { class: "cal-title" }, monthTitle(month.y, month.m)),
      h("span", { class: "grow" }),
      undatedButton,
      h("button", { type: "button", class: "icon-btn sm", "aria-label": w("上个月"), on: { click: () => { month = month.m === 0 ? { y: month.y - 1, m: 11 } : { y: month.y, m: month.m - 1 }; draw(); } } }, icon("chevronLeft", 15)),
      h("button", { type: "button", class: "btn ghost sm", on: { click: () => { month = { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }; draw(); } } }, w("今天")),
      h("button", { type: "button", class: "icon-btn sm", "aria-label": w("下个月"), on: { click: () => { month = month.m === 11 ? { y: month.y + 1, m: 0 } : { y: month.y, m: month.m + 1 }; draw(); } } }, icon("chevronRight", 15)));
    const grid = h("div", { class: "cal-grid", style: { gridTemplateRows: `repeat(${weeks}, minmax(112px, auto))` } }, shownDays.map((day) => {
      const key = ymd(day);
      const list = days.get(key) || [];
      const cell = h("div", { class: `cal-day${day.getMonth() !== month.m ? " out" : ""}${key === today ? " today" : ""}${day.getDay() === 0 || day.getDay() === 6 ? " weekend" : ""}`, "data-day": key },
        h("div", { class: "cal-day-head" },
          store.editable ? h("button", { type: "button", class: "icon-btn xs hover-only", "aria-label": w("在这天新建"), on: { click: () => db.addRow({ [dp.id]: key }, { open: true }) } }, icon("plus", 13)) : null,
          h("span", { class: "cal-num" }, day.getDate() === 1 ? monthStart(day.getMonth()) : String(day.getDate()))),
        list.map((row) => item(row, dp, props)));
      cell.addEventListener("dblclick", () => { if (store.editable) db.addRow({ [dp.id]: key }, { open: true }); });
      return cell;
    }));
    element.replaceChildren(h("div", { class: "calendar" }, head, h("div", { class: "cal-body" }, h("div", { class: "cal-grid-wrap" }, h("div", { class: "cal-week-head" }, weekdays(false).map((day) => h("span", null, day))), grid))));
    if (undated) undated.refresh();
  }

  // The records with no date hang under their button, taking no room beside the calendar.
  function openUndated() {
    undated = pop(store.layer, undatedButton, {
      align: "end",
      cls: "cal-pop",
      onClose: () => { undated = null; undatedButton?.classList.remove("active"); },
      build: (card, api) => {
        api.update = () => {
          const dp = dateProp();
          if (!dp) return void api.close();
          const now = db.view();
          const { none } = byDay(dp, store.rowsOf(now).rows);
          const props = cardProps(store, now);
          card.replaceChildren(...kids(
            h("div", { class: "cal-panel-head" }, w("未排期"), h("span", { class: "muted" }, ` ${none.length}`), h("span", { class: "grow" }), h("button", { type: "button", class: "icon-btn xs", "aria-label": w("关闭"), on: { click: () => api.close() } }, icon("x", 13))),
            store.editable ? h("div", { class: "muted sm cal-panel-tip" }, w("拖到日历上就排好期")) : null,
            h("div", { class: "cal-pop-list" }, none.map((row) => item(row, dp, props, true)), none.length ? null : h("div", { class: "menu-empty" }, w("所有记录都有“{0}”", dp.name)))));
        };
        api.update();
      },
    });
    undatedButton.classList.add("active");
  }

  // A record dragged onto a day takes its date (one step); its title follows the pointer.
  function drag(event, node, row) {
    const dp = dateProp();
    if (event.button !== 0 || !store.editable || !dp) return;
    event.stopPropagation();
    const app = appOf(node);
    const x0 = event.clientX;
    const y0 = event.clientY;
    let started = false;
    let over = null;
    let overCell = null;
    let ghost = null;
    const onMove = (moved) => {
      if (!started && Math.hypot(moved.clientX - x0, moved.clientY - y0) < 5) return;
      if (!started) {
        started = true;
        dragging = true;
        app?.classList.add("is-dragging");
        node.classList.add("ghosted");
        undated?.card.classList.add("dragging-out");
        ghost = h("div", { class: "drag-ghost cal-ghost" }, titleOf(row, store.doc.props) || w("无标题"));
        store.layer.append(ghost);
      }
      ghost.style.left = `${moved.clientX + 8}px`;
      ghost.style.top = `${moved.clientY + 8}px`;
      const cell = document.elementFromPoint(moved.clientX, moved.clientY)?.closest("[data-day]") ?? null;
      if (cell !== overCell) {
        overCell?.classList.remove("over");
        cell?.classList.add("over");
        overCell = cell;
      }
      over = cell?.dataset.day ?? null;
    };
    const up = () => {
      removeEventListener("mousemove", onMove);
      removeEventListener("mouseup", up);
      app?.classList.remove("is-dragging");
      if (!started) return;
      dragging = false;
      swallowClick();
      ghost?.remove();
      node.classList.remove("ghosted");
      overCell?.classList.remove("over");
      undated?.card.classList.remove("dragging-out");
      if (over && over !== row.values[dp.id]) store.commit((d) => ({ ...d, rows: d.rows.map((each) => (each.id === row.id ? { ...each, values: { ...each.values, [dp.id]: over } } : each)) }));
      else draw();
    };
    addEventListener("mousemove", onMove);
    addEventListener("mouseup", up);
  }

  return {
    element,
    update: () => { if (!dragging) draw(); },
    destroy() { undated?.close(); },
  };
}
