// A value edited where it stands (a table's cell, a value of a record's details): the cell is the field,
// what shows is what changes. Words, a number and an address are typed in it, written a character at a
// time (one step of undo for the typing); options are chosen as pills with a caret between them, their
// list right under the cell; a date is typed or picked from the month under it, written once it reads as a
// date and the reader is done (held meanwhile: the store tells the page, which asks for it before an undo
// or as it closes).
import { todayStr } from "./data/formula.js";
import { isDate, optionName, optionNames } from "../../../shared/database.mjs";
import { addDays, alignOf, editText, friendlyDate, getValue, monthTitle, nextColor, normalizeDate, optionNamed, optionOf, parseInput, uid, weekdays, ymd } from "./data/values.js";
import { isGridPaste } from "./clipboard.js";
import { composing, fit, h, kids, pressFirstAsClick } from "./ui/dom.js";
import { icon } from "./ui/icons.js";
import { pop } from "./ui/menu.js";
import { pill } from "./ui/values.js";
import { w } from "./words.js";

/** Whether a value of `prop` is edited where it stands (not a box, which a click checks, nor a formula). */
export const isInlineEditable = (prop) => prop.type !== "checkbox" && prop.type !== "formula";
const isTextLike = (prop) => prop.type === "title" || prop.type === "text" || prop.type === "number" || prop.type === "url";

/**
 * The editor of `row`'s value of `prop`, put in `place` (the cell, or the value in the details): `surface`
 * "table" or "peek"; `init` the key typed that opened it (what it starts with); `onDone(direction)` once the
 * reader is done ("down", "right", "left", or null); `onGridPaste(text)`: cells pasted into it. Returns
 * { element, close(): done as if left }.
 */
export function openEditor(store, { row, prop, place, surface = "table", init, onDone, onGridPaste }) {
  if (prop.type === "select" || prop.type === "multi") return optionEditor(store, { row, prop, place, surface, init, onDone, onGridPaste });
  if (prop.type === "date") return dateEditor(store, { row, prop, place, surface, init, onDone, onGridPaste });
  if (isTextLike(prop)) return textEditor(store, { row, prop, place, surface, init, onDone, onGridPaste });
  return null;
}

const alignClass = (prop) => (alignOf(prop) === "left" ? "" : ` al-${alignOf(prop)}`);
const keep = (event) => event.stopPropagation();

// ---------- words, a number, an address: typed in the cell, written as they are typed ----------
function textEditor(store, { row, prop, place, surface, init, onDone, onGridPaste }) {
  const orig = editText(getValue(row, prop, store.byId), prop);
  // The value as editing began, which Esc puts back as it was (not as its words would read: every digit of it).
  const original = structuredClone((store.doc.rows.find((each) => each.id === row.id) ?? row).values[prop.id]);
  const now = () => (store.doc.rows.find((each) => each.id === row.id) ?? row).values[prop.id];
  const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  const multi = prop.type === "title" || prop.type === "text";
  const merge = `cell-${row.id}-${prop.id}`;
  const area = h("textarea", { class: `cell-editor-input${prop.type === "number" ? " num" : ""}`, rows: "1", spellcheck: "false", placeholder: prop.type === "url" ? w("粘贴或输入网址") : "" });
  area.value = init ?? orig;
  const box = h("div", { class: `cell-editor ${surface}${alignClass(prop)}`, "data-keep-popovers": true, on: { mousedown: keep, dblclick: keep, click: keep } }, area,
    prop.type === "number" && prop.numberFormat?.format === "percent" ? h("span", { class: "cell-editor-hint" }, w("输入 60 即 60%")) : null);
  place.append(...kids(box));
  let done = false;
  let written = orig;
  const write = () => {
    const words = area.value;
    if (words === written) return;
    written = words;
    const { value, newOptions } = parseInput(prop, words);
    store.setCell(row.id, prop.id, value, newOptions, merge);
  };
  const finish = (direction = null, cancel = false) => {
    if (done) return;
    done = true;
    if (cancel) {
      // Esc: the value it held as editing began, under the typing's own step, which then changes nothing
      // and is no step (history.mjs).
      if (written !== orig || !same(now(), original)) {
        written = orig;
        store.setCell(row.id, prop.id, structuredClone(original), undefined, merge);
      }
    } else write();
    store.flush();
    box.remove();
    onDone?.(direction);
  };
  area.addEventListener("input", (event) => {
    if (prop.type === "number" || prop.type === "url") {
      const flat = area.value.replace(/\n/g, "");
      if (flat !== area.value) area.value = flat;
    }
    fit(area);
    if (!event.isComposing) write();
  });
  area.addEventListener("compositionend", () => write());
  area.addEventListener("blur", () => finish(null));
  area.addEventListener("paste", (event) => {
    event.stopPropagation();
    // A grid of cells pasted: the cells go in from this one on.
    const words = event.clipboardData?.getData("text/plain") ?? "";
    if (onGridPaste && isGridPaste(words, multi)) {
      event.preventDefault();
      done = true;
      store.flush();
      box.remove();
      onGridPaste(words);
    }
  });
  area.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (composing(event)) return;
    if (event.key === "Enter" && !(multi && event.shiftKey)) { event.preventDefault(); finish("down"); }
    else if (event.key === "Tab") { event.preventDefault(); finish(event.shiftKey ? "left" : "right"); }
    else if (event.key === "Escape") { event.preventDefault(); finish(null, true); }
  });
  pressFirstAsClick(area);
  area.focus({ preventScroll: true });
  area.setSelectionRange(area.value.length, area.value.length);
  fit(area);
  if (init !== undefined && init !== orig) write();
  return { element: box, close: () => finish(null) };
}

// ---------- options: the ones chosen are like letters, the caret stands between any two ----------
// A click on a pill's left or right half puts the caret before or after it; ← → move it, Shift with ← → or
// a drag selects a run of pills; Backspace and Delete take out what is selected or the one beside the
// caret; Ctrl/⌘+A selects all; an option chosen from the list goes in at the caret; no spaces.
function optionEditor(store, { row, prop, place, surface, init, onDone, onGridPaste }) {
  const live = () => store.byId[prop.id] ?? prop;
  const current = () => store.doc.rows.find((each) => each.id === row.id) ?? row;
  const chosen = () => {
    const value = getValue(current(), live(), store.byId);
    return live().type === "multi" ? (Array.isArray(value) ? value : []) : value ? [value] : [];
  };
  let query = (init || "").replace(/\s/g, "");
  let caret = chosen().length;
  let anchor = null; // the selection's other end, or none
  let lit = init ? 0 : Math.max(0, (live().options || []).findIndex((option) => option.id === chosen()[0]));
  let done = false;
  let picker = null; // the list under the cell

  const pills = h("div", { class: "pills cell-editor-pills" });
  const mirror = h("span", { class: "tok-q-mirror", "aria-hidden": "true" });
  const input = h("input", { class: "cell-editor-q", spellcheck: "false" });
  input.value = query;
  const tokQ = h("span", { class: "tok-q" }, mirror, input);
  const box = h("div", { class: `cell-editor opt ${surface}`, "data-keep-popovers": true, on: { dblclick: keep, click: keep } }, pills);
  place.append(...kids(box));

  const range = () => {
    const count = chosen().length;
    const at = Math.max(0, Math.min(caret, count));
    const other = anchor === null ? at : Math.max(0, Math.min(anchor, count));
    return { lo: Math.min(other, at), hi: Math.max(other, at), at, count };
  };
  const write = (next, created) => store.setCell(row.id, prop.id, live().type === "multi" ? next : next[0] ?? null, created);
  const place_ = (to, extend = false) => {
    if (extend) anchor ??= caret;
    else anchor = null;
    caret = Math.max(0, Math.min(to, chosen().length));
    draw();
  };
  const cut = (a, b) => {
    if (b <= a) return;
    const list = chosen();
    write([...list.slice(0, a), ...list.slice(b)]);
    anchor = null;
    caret = a;
    draw();
  };
  // The names typed words make: several in a multi-select's (apart by commas or 、, as its cell reads them),
  // one in a single select's (what parts names a space), as the file reads them back.
  const typedNames = () => (live().type === "multi" ? optionNames(query) : [optionName(query)].filter(Boolean));
  // What the typed names would be: an option there is of each, or a new one in the color it would take.
  const planned = () => {
    const all = [...(live().options || [])];
    return typedNames().map((name, at) => {
      const found = optionNamed(all, name);
      if (found) return found;
      const option = { id: `new${at}`, name, color: nextColor({ ...live(), options: all }) };
      all.push(option);
      return option;
    });
  };
  const items = () => {
    const options = live().options || [];
    const typed = query.trim().toLowerCase();
    const list = typed ? options.filter((option) => option.name.toLowerCase().includes(typed)) : options;
    const names = typedNames();
    const exact = names.length > 0 && names.every((name) => optionNamed(options, name));
    return [...list.map((option) => ({ option })), ...(typed && !exact ? [{ create: true }] : [])];
  };
  const finish = (direction = null) => {
    if (done) return;
    done = true;
    picker?.close();
    box.remove();
    onDone?.(direction);
  };
  const choose = (option, created) => {
    const list = chosen();
    if (live().type === "multi") {
      const at = list.indexOf(option.id);
      if (at >= 0 && !created) {
        // One chosen already, clicked again, goes.
        write(list.filter((id) => id !== option.id));
        anchor = null;
        caret = at < caret ? caret - 1 : caret;
      } else {
        const { lo, hi, at: c } = range();
        const has = hi > lo;
        const base = has ? [...list.slice(0, lo), ...list.slice(hi)] : list;
        const to = has ? lo : c;
        write([...base.slice(0, to), option.id, ...base.slice(to)], created);
        anchor = null;
        caret = to + 1;
      }
      query = "";
      input.value = "";
      draw();
      input.focus({ preventScroll: true });
    } else {
      if (list[0] !== option.id || created) store.setCell(row.id, prop.id, option.id, created);
      finish(null);
    }
  };
  const create = () => {
    const names = typedNames();
    if (!names.length) return;
    if (live().type === "multi") return pasteNames(names);
    const found = optionNamed(live().options || [], names[0]);
    if (found) return choose(found);
    const option = { id: uid("o"), name: names[0], color: nextColor(live()) };
    choose(option, [option]);
  };
  const pick = (at) => {
    const entry = items()[at];
    if (!entry) return;
    if (entry.create) create();
    else choose(entry.option);
  };
  // A paste: options found by name (made where none is), put in at the caret or over the selected run.
  const pasteNames = (names) => {
    const all = [...(live().options || [])];
    const created = [];
    const ids = [];
    for (const name of names) {
      let option = optionNamed(all, optionName(name));
      if (!option) {
        option = { id: uid("o"), name: optionName(name), color: nextColor({ ...live(), options: all }) };
        all.push(option);
        created.push(option);
      }
      if (!ids.includes(option.id)) ids.push(option.id);
    }
    if (!ids.length) return;
    if (live().type === "select") {
      store.setCell(row.id, prop.id, ids[0], created.filter((option) => option.id === ids[0]));
      finish(null);
      return;
    }
    const list = chosen();
    const { lo, hi, at } = range();
    const base = hi > lo ? [...list.slice(0, lo), ...list.slice(hi)] : list;
    const to = hi > lo ? lo : at;
    const add = ids.filter((id) => !base.includes(id));
    write([...base.slice(0, to), ...add, ...base.slice(to)], created.filter((option) => add.includes(option.id)));
    anchor = null;
    caret = to + add.length;
    query = "";
    input.value = "";
    draw();
  };
  const rangeWords = () => {
    const { lo, hi } = range();
    return chosen().slice(lo, hi).map((id) => optionOf(live(), id)?.name ?? id).join(", ");
  };
  // The caret's place at a point: before the pill of the same line whose left half it is in.
  const placeAt = (x, y) => {
    let best = chosen().length;
    for (const token of pills.querySelectorAll("[data-tok]")) {
      const box = token.getBoundingClientRect();
      const at = Number(token.dataset.tok);
      if (y < box.top - 2) { best = Math.min(best, at); break; }
      if (y > box.bottom + 2) continue;
      if (x < box.left + box.width / 2) { best = at; break; }
      best = at + 1;
    }
    return best;
  };

  function draw() {
    if (done) return;
    const list = chosen();
    const { lo, hi, at } = range();
    caret = at;
    const token = (id, index) => h("span", { class: `tok${index >= lo && index < hi ? " on" : ""}`, "data-tok": String(index) }, pill(optionOf(live(), id), id));
    tokQ.classList.toggle("has-q", Boolean(query));
    mirror.textContent = query;
    pills.classList.toggle("has-range", hi > lo);
    const focused = document.activeElement === input;
    pills.replaceChildren(...kids(...list.slice(0, at).map(token), tokQ, ...list.slice(at).map((id, index) => token(id, at + index))));
    if (focused || !done) input.focus({ preventScroll: true });
    picker?.refresh();
  }

  box.addEventListener("mousedown", (event) => {
    event.stopPropagation();
    if (event.button !== 0) return;
    // A press in the typed words moves the text caret as ever.
    if (event.target === input && query) return;
    event.preventDefault();
    const to = placeAt(event.clientX, event.clientY);
    anchor = event.shiftKey ? (anchor ?? caret) : to;
    caret = to;
    draw();
    const move = (moved) => {
      caret = placeAt(moved.clientX, moved.clientY);
      draw();
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  });
  // The selected pills copied or cut as their names (", " between them), pasted back by name at the caret.
  input.addEventListener("copy", (event) => {
    const { lo, hi } = range();
    if (query || hi <= lo) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", rangeWords());
  });
  input.addEventListener("cut", (event) => {
    const { lo, hi } = range();
    if (query || hi <= lo) return;
    event.preventDefault();
    event.clipboardData.setData("text/plain", rangeWords());
    cut(lo, hi);
  });
  input.addEventListener("paste", (event) => {
    event.stopPropagation();
    event.preventDefault();
    const words = event.clipboardData?.getData("text/plain") ?? "";
    if (onGridPaste && isGridPaste(words, false)) {
      finish(null);
      onGridPaste(words);
      return;
    }
    // Taken apart as a file's cell is (a copy of options says ", " between them): a name of a semicolon stays one.
    pasteNames(optionNames(words));
  });
  input.addEventListener("input", () => {
    const typed = input.value.replace(/\s/g, "");
    if (typed !== input.value) input.value = typed;
    const { lo, hi } = range();
    if (typed && hi > lo) cut(lo, hi); // typed over a selected run: the run goes first
    else if (typed) anchor = null;
    query = typed;
    lit = 0;
    draw();
  });
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (composing(event)) return;
    const mod = event.metaKey || event.ctrlKey;
    const { lo, hi, at, count } = range();
    const list = items();
    if (event.key === " ") { event.preventDefault(); return; }
    if (event.key === "ArrowDown") { event.preventDefault(); lit = Math.min(list.length - 1, lit + 1); picker?.refresh(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); lit = Math.max(0, lit - 1); picker?.refresh(); }
    else if (event.key === "Enter") {
      event.preventDefault();
      if (query.trim() || live().type === "select") { if (list.length) pick(lit); else finish("down"); }
      else finish("down");
    } else if (event.key === "Tab") { event.preventDefault(); finish(event.shiftKey ? "left" : "right"); }
    else if (event.key === "Escape") { event.preventDefault(); finish(null); }
    else if (query) return; // with words typed, the arrows and the deletes act on them
    else if (event.key === "ArrowLeft") { event.preventDefault(); if (hi > lo && !event.shiftKey) place_(lo); else place_(at - 1, event.shiftKey); }
    else if (event.key === "ArrowRight") { event.preventDefault(); if (hi > lo && !event.shiftKey) place_(hi); else place_(at + 1, event.shiftKey); }
    else if (event.key === "Home") { event.preventDefault(); place_(0, event.shiftKey); }
    else if (event.key === "End") { event.preventDefault(); place_(count, event.shiftKey); }
    else if (mod && event.key.toLowerCase() === "a") { event.preventDefault(); anchor = 0; caret = count; draw(); }
    else if (event.key === "Backspace") { event.preventDefault(); if (hi > lo) cut(lo, hi); else cut(at - 1, at); }
    else if (event.key === "Delete") { event.preventDefault(); if (hi > lo) cut(lo, hi); else cut(at, at + 1); }
  });
  input.addEventListener("blur", () => {
    // Left for anywhere but its own list (a press there keeps the focus): done.
    setTimeout(() => { if (!done && document.activeElement !== input && !picker?.card.contains(document.activeElement)) finish(null); }, 0);
  });

  // The list under the cell.
  picker = pop(store.layer, box, {
    placement: "bottom",
    gap: 4, // clear of the cell's 2px ring (the user's 2026-11-24: flush against it, the card hid half of it)
    width: Math.max(box.offsetWidth, 240),
    cls: "picker below",
    onClose: () => finish(null),
    build: (card) => {
      const list = items();
      const typed = query.trim();
      const hint = typed ? (list.some((entry) => entry.create) ? w("回车创建新选项") : w("回车选中")) : live().type === "multi" ? w("选择一个或多个，打字可以搜索或创建") : w("选择一个，打字可以搜索或创建");
      const rows = h("div", { class: "picker-list", "data-scroll": "picker" });
      lit = Math.max(0, Math.min(lit, list.length - 1));
      list.forEach((entry, at) => {
        const row = entry.create
          ? h("button", { type: "button", class: `picker-row${at === lit ? " hi" : ""}` }, h("span", { class: "muted" }, w("创建")), ...planned().map((option) => pill(option)))
          : h("button", { type: "button", class: `picker-row${at === lit ? " hi" : ""}` }, pill(entry.option), chosen().includes(entry.option.id) ? icon("check", 15, { bold: 2, cls: "picker-check" }) : null);
        row.addEventListener("mouseenter", () => { if (lit !== at) { lit = at; for (const [index, node] of [...rows.children].entries()) node.classList.toggle("hi", index === at); } });
        row.addEventListener("mousedown", (event) => event.preventDefault());
        row.addEventListener("click", () => pick(at));
        rows.append(...kids(row));
      });
      if (!list.length) rows.append(...kids(h("div", { class: "picker-empty" }, typed ? w("没有匹配的选项") : w("还没有选项，打字后回车即可创建"))));
      card.append(...kids(h("div", { class: "picker-hint" }, hint), rows));
    },
  });
  draw();
  return { element: box, close: () => finish(null) };
}

// ---------- a date: typed as a reader reads it, or picked from the month right under it ----------
function dateEditor(store, { row, prop, place, surface, init, onDone, onGridPaste }) {
  const value = getValue(row, prop, store.byId);
  const valid = isDate(value);
  const orig = valid ? friendlyDate(value) : value ? String(value) : "";
  const key = `date-${row.id}-${prop.id}`;
  const input = h("input", { class: "cell-editor-input", spellcheck: "false" });
  input.value = init ?? orig;
  const box = h("div", { class: `cell-editor date ${surface}${alignClass(prop)}`, "data-keep-popovers": true, on: { mousedown: keep, dblclick: keep, click: keep } }, input);
  place.append(...kids(box));
  let done = false;
  let panel = null; // the month under the cell
  const parsed = () => (input.value.trim() ? normalizeDate(input.value) : null);
  const bad = () => Boolean(input.value.trim()) && !parsed() && input.value !== orig;
  // What the field holds, written: none where it reads as nothing new.
  const write = () => {
    store.release(key);
    if (input.value === orig) return;
    if (!input.value.trim()) store.setCell(row.id, prop.id, null);
    else if (parsed() && parsed() !== value) store.setCell(row.id, prop.id, parsed());
  };
  const finish = (direction, picked, cancel = false) => {
    if (done) return;
    done = true;
    if (cancel) store.release(key); // Esc: nothing typed is written
    else if (picked !== undefined) {
      store.release(key);
      if (picked !== (valid ? value : null)) store.setCell(row.id, prop.id, picked);
    } else write();
    panel?.close();
    box.remove();
    onDone?.(direction);
  };
  input.addEventListener("input", () => {
    input.classList.toggle("bad", bad());
    // Held while it says something new (written as the reader is done, or as the page asks).
    if (input.value !== orig && (parsed() || !input.value.trim())) store.hold(key, () => { if (!done) write(); });
    else store.release(key);
    panel?.refresh();
  });
  input.addEventListener("paste", (event) => {
    event.stopPropagation();
    const words = event.clipboardData?.getData("text/plain") ?? "";
    if (onGridPaste && isGridPaste(words, false)) {
      event.preventDefault();
      done = true;
      store.release(key);
      panel?.close();
      box.remove();
      onGridPaste(words);
    }
  });
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (composing(event)) return;
    if (event.key === "Enter") { event.preventDefault(); if (!bad()) finish("down"); }
    else if (event.key === "Tab") { event.preventDefault(); finish(event.shiftKey ? "left" : "right"); }
    else if (event.key === "Escape") { event.preventDefault(); finish(null, undefined, true); }
  });
  panel = pop(store.layer, box, {
    placement: "bottom",
    gap: 4, // clear of the cell's 2px ring (the user's 2026-11-24: flush against it, the card hid half of it)
    cls: "picker below",
    // Esc closes the month first (it stands over the field): the date as it was, as a cell of words' Esc leaves its words.
    onClose: (reason) => finish(null, undefined, reason === "escape"),
    build: (card, api) => {
      const said = h("div");
      const calendar = calendarPanel({ value: () => parsed() || (valid && input.value === orig ? value : null), onPick: (day) => finish(null, day), allowClear: valid });
      card.append(...kids(said, calendar.element));
      api.update = () => {
        const reads = parsed();
        said.replaceChildren(...kids(bad() ? h("div", { class: "date-bad" }, w("无法识别，可以写 11月25日、11-25、明天")) : reads && input.value.trim() !== orig ? h("div", { class: "picker-hint" }, w("回车设为 {0}", friendlyDate(reads))) : ""));
        calendar.update();
      };
      api.update();
    },
  });
  pressFirstAsClick(input);
  input.focus({ preventScroll: true });
  // Typed into from the keys, the caret at the end; opened by a click, all selected, to be typed over.
  if (init !== undefined) input.setSelectionRange(input.value.length, input.value.length);
  else input.select();
  if (init !== undefined) input.dispatchEvent(new Event("input"));
  return { element: box, close: () => finish(null) };
}

/**
 * The quick buttons and a month's days (`value()`: the day chosen now, which the month follows as it
 * changes); `onPick(day)`, null for 清除. Returns { element, update }.
 */
export function calendarPanel({ value, onPick, allowClear }) {
  const start = value() || todayStr();
  let month = { year: +start.slice(0, 4), month: +start.slice(5, 7) - 1 };
  let followed = value();
  const quick = h("div", { class: "date-quick" });
  const title = h("span");
  const grid = h("div", { class: "cal-mini-grid" });
  const step = (by) => {
    const next = new Date(month.year, month.month + by, 1);
    month = { year: next.getFullYear(), month: next.getMonth() };
    draw();
  };
  const element = h("div", { class: "date-cal" }, quick,
    h("div", { class: "cal-mini" },
      h("div", { class: "cal-mini-head" }, title, h("span", { class: "grow" }),
        h("button", { type: "button", class: "icon-btn sm", "aria-label": w("上个月"), on: { click: () => step(-1) } }, icon("chevronLeft", 14)),
        h("button", { type: "button", class: "icon-btn sm", "aria-label": w("下个月"), on: { click: () => step(1) } }, icon("chevronRight", 14))),
      grid));
  function draw() {
    const chosen = value();
    const today = todayStr();
    quick.replaceChildren(...kids(...[[w("今天"), 0], [w("明天"), 1], [w("一周后"), 7]].map(([label, by]) => h("button", { type: "button", class: "chip-btn", on: { click: () => onPick(addDays(today, by)) } }, label)),
      allowClear && chosen ? h("button", { type: "button", class: "chip-btn ghost", on: { click: () => onPick(null) } }, w("清除")) : null));
    title.textContent = monthTitle(month.year, month.month);
    const first = new Date(month.year, month.month, 1);
    const offset = (first.getDay() + 6) % 7; // weeks start on Monday
    grid.replaceChildren(...kids(...weekdays().map((day) => h("span", { class: "cal-mini-wd" }, day)), ...Array.from({ length: 42 }, (_, at) => {
      const day = new Date(month.year, month.month, 1 - offset + at);
      const said = ymd(day);
      return h("button", { type: "button", class: `cal-mini-day${day.getMonth() !== month.month ? " out" : ""}${said === today ? " today" : ""}${said === chosen ? " on" : ""}`, on: { click: () => onPick(said) } }, String(day.getDate()));
    })));
  }
  draw();
  return {
    element,
    update() {
      const chosen = value();
      if (chosen && chosen !== followed) month = { year: +chosen.slice(0, 4), month: +chosen.slice(5, 7) - 1 };
      followed = chosen;
      draw();
    },
  };
}

/**
 * A date typed or picked (a filter's): a field, its reading, the month. `onPick(day)` with the day (null:
 * none), `raw`: what was typed into it as it opened. Returns { element, focus }.
 */
export function datePanel({ value, raw, onPick, allowClear = true }) {
  const input = h("input", { placeholder: w("输入日期，如 11-25、明天"), "data-field": "date" });
  pressFirstAsClick(input);
  input.value = raw ?? (value ? value : "");
  const reading = h("span", { class: "date-input-hint" });
  const wrap = h("div", { class: "date-input" }, input, reading);
  const badNote = h("div", { class: "date-bad", hidden: true }, w("无法识别这个日期"));
  const calendar = calendarPanel({ value: () => value, onPick, allowClear: allowClear && Boolean(value) });
  const parsed = () => (input.value.trim() ? normalizeDate(input.value) : null);
  const showReading = () => {
    const reads = parsed();
    reading.textContent = reads && input.value.trim() !== reads ? friendlyDate(reads) : "";
  };
  input.addEventListener("input", () => {
    wrap.classList.remove("bad");
    badNote.hidden = true;
    showReading();
  });
  input.addEventListener("keydown", (event) => {
    if (composing(event) || event.key !== "Enter") return;
    event.preventDefault();
    if (!input.value.trim()) { if (allowClear) onPick(null); return; }
    if (parsed()) onPick(parsed());
    else { wrap.classList.add("bad"); badNote.hidden = false; }
  });
  showReading();
  return {
    element: h("div", { class: "date-panel" }, wrap, badNote, calendar.element),
    focus() {
      input.focus();
      if (raw) input.setSelectionRange(input.value.length, input.value.length);
      else input.select();
    },
  };
}
