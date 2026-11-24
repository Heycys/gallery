// A record's details: at the window's right side (the view's 打开记录 侧边) or in its middle over a veil (居中).
// Its title, each column's value (its label pressed: the column's menu, its name typed where it stands; its
// value pressed: edited where it stands, as a table's cell is) and its body. No bar of its own: closing it, the
// record before and after (↑ ↓, and their buttons) and which one it is of how many float at its top right. At
// the side its left edge is a line that drags to change its width (the reader's own, kept in the page's state)
// and, pressed without a drag, puts the details away; Esc does too. It stands in the top layer (a popover) so
// that nothing of the page (the editor's buttons beside a block, an annotation's mark) covers it, under the
// workbench's top bar and its line as the page is; at the side it slides in from the window's right edge and out
// again as the workbench's sidebar does (its clock and its curve), the page's own scrollbar out of sight
// meanwhile, so that the one scrollbar at the window's right is the details' own (the page under it still
// scrolls by the wheel).
//
// A record's body is the document's own blocks (src/shared/database.mjs: a slot of the database's pages, which
// the page editor edits as any flow): the details are drawn in the pages element itself, made the details for as
// long as they show (the slot stays where the file has it, the others hidden, the details' head drawn before it),
// and marked a surface of the document (data-doc-surface), so that the editor draws its tools there, over the
// details. A record with none yet is drawn so too, around the body the page makes for it (doc-database-body,
// `provisional`: a slot holding an empty paragraph, or one of its old notes, which the file has not got): the same
// editor, nothing written by opening it or clicking in it; the first change made there makes it the file's, one step
// of undo with the drawing's write that gives its row an id and takes its notes away (`write`), and nothing on the
// screen moves as it does (the same slot, the same paragraph, the caret where it is). The details going, or going to
// another record, it is taken away again (`drop`) where it is still none. Where nothing takes edits (an export) a
// body shows as it is, read only, and a record with none its notes.
import { titleProp } from "./data/values.js";
import { defaultOpen } from "./layouts.js";
import { headNameInput, newPropMenu, propMenu } from "./props.js";
import { isInlineEditable, openEditor } from "./editors.js";
import { attr, fit, h, text, toggle, kids } from "./ui/dom.js";
import { icon, typeIcon } from "./ui/icons.js";
import { anyOpen } from "./ui/menu.js";
import { valueView } from "./ui/values.js";
import { w } from "./words.js";
import { RECORD_ATTRIBUTE, bodyOf, databasePages, newRecordId } from "../../../shared/database.mjs";
import { PROVISIONAL } from "../../../shared/provisional.mjs";

const WIDTH = 560; // px, the side's width by default
const LEAST = 380;
const DRAG = 3; // px a press on the edge moves before it drags
const SLIDE = 280; // ms, the workbench's sidebar's (--sbDur)
const EASE = "cubic-bezier(.32, .72, 0, 1)"; // its curve (--easeSheet)
const FADE = 120; // ms, the details coming and going for a reader who asks for less motion: their opacity alone
/** The mark on the slot of the body shown, and on the pages element while it is the details. */
export const SHOWN = "data-doc-shown";
export const PEEK = "data-doc-peek";
export const SURFACE = "data-doc-surface";

const still = () => globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

// The page's own scrollbar while details stand at the side (one of any database of the page): out of sight, its
// room the page's padding on its right meanwhile (--doc-page-bar, as a detail card's: what is fixed against the
// window's right side stands where it was), so that nothing of the page moves and the details reach the window's
// edge, their scrollbar where the page's was. In a sheet the document adopts, so none of it is in the markup.
let sides = 0;
let barSheet = null;
function pageBar(on) {
  const root = document.documentElement;
  sides = Math.max(0, sides + (on ? 1 : -1));
  if (on && sides === 1) {
    const bar = innerWidth - root.clientWidth;
    try {
      if (!barSheet) {
        barSheet = new CSSStyleSheet();
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, barSheet];
      }
      barSheet.replaceSync(`@media screen { :root.doc-peek-side { scrollbar-width: none; } :root.doc-peek-side::-webkit-scrollbar { display: none; } :root.doc-peek-side.doc-peek-gutter { padding-right: ${bar}px; --doc-page-bar: ${bar}px; } }`);
    } catch {}
    root.classList.add("doc-peek-side");
    root.classList.toggle("doc-peek-gutter", bar > 0);
  } else if (!on && sides === 0) root.classList.remove("doc-peek-side", "doc-peek-gutter");
}

/** The details of the record open (store.ui.peek), drawn in the store's layer or in its database's pages: { update(change), destroy() }. */
export function createPeek(store, db) {
  let shown = null; // { id, mode, slot, root, panel, pin, chrome, ... } of the record drawn
  let editing = null; // { propId, handle } a value edited
  let renaming = null; // { propId, input } a label's name typed
  let menu = null; // the column's menu open from a label
  const leaving = new Set(); // details sliding away: { panel, end }
  let spare = null; // the body the page made for a record with none yet, drawn in its details: { row, record, slot }
  let keeping = null; // the slot details are being drawn in again, which no details sliding away take with them

  const order = () => store.rowsOf().rows.map((row) => row.id);
  const modeOf = () => store.view.open || defaultOpen(store.view.layout);
  const widthOf = () => Math.max(LEAST, Math.min(maxWidth(), store.reading.peekWidth || WIDTH));
  const maxWidth = () => Math.max(LEAST, Math.min(1100, innerWidth - 320));
  const notesOf = () => store.doc.props.find((prop) => prop.notes) ?? null;

  function close() {
    store.flush();
    store.setUi({ peek: null });
  }

  function go(id) {
    if (!id) return;
    endEdit();
    store.flush();
    store.setUi({ peek: id });
  }

  // A popover shown in the top layer (over what was there before it).
  const lift = (node) => {
    node.setAttribute("popover", "manual");
    try {
      node.showPopover();
    } catch {
      node.removeAttribute("popover");
    }
  };

  /** The details of record `id` drawn anew, `mode` "side" or "center", in its body's pages where it has one (`slot`); `slide`: coming in. */
  function build(id, mode, slot, { slide = false } = {}) {
    const scrolled = shown?.id === id ? shown.panel.scrollTop : 0;
    takeDown();
    // Details still sliding away in the pages these are drawn in: gone at once.
    keeping = slot;
    for (const each of [...leaving]) if (slot && each.panel === slot.parentElement) each.end();
    keeping = null;
    const prev = h("button", { type: "button", class: "icon-btn sm", "aria-label": w("上一条（↑）"), "data-doc-tip": w("上一条（↑）") }, icon("chevronUp", 16));
    const next = h("button", { type: "button", class: "icon-btn sm", "aria-label": w("下一条（↓）"), "data-doc-tip": w("下一条（↓）") }, icon("chevronDown", 16));
    const count = h("span", { class: "peek-count num" });
    const flag = h("span", { class: "peek-flag", hidden: true }, w("已不符合当前筛选"));
    const shut = h("button", { type: "button", class: "icon-btn sm", "aria-label": w("关闭（Esc）"), "data-doc-tip": w("关闭（Esc）") }, icon(mode === "side" ? "chevronRight" : "x", 16));
    shut.addEventListener("click", () => close());
    const nav = h("div", { class: "peek-nav" }, flag, shut, prev, next, count);
    prev.addEventListener("click", () => go(neighbours().prev));
    next.addEventListener("click", () => go(neighbours().next));
    const title = h("textarea", { class: "peek-title", rows: "1", placeholder: w("无标题"), spellcheck: "false" });
    const props = h("div", { class: "peek-props" });
    const sep = h("div", { class: "peek-sep" });
    // Where its body would be, for a record with none that no editor takes edits of: its notes, read only.
    const field = slot ? null : h("div", { class: "peek-body-new" });
    // What stands still as the details scroll (sticky, the first thing in them): the small bar at their top right, the edge at their left.
    const pin = h("div", { class: "db-peek-pin" }, nav);
    const chrome = h("div", { class: "db-peek-chrome" }, title, props, sep, field);
    for (const node of [pin, chrome]) node.addEventListener("mousedown", (event) => event.stopPropagation());
    let panel;
    let root;
    let mask = null;
    if (slot) {
      // Its database's pages are the details: what is drawn in them is the kit's (generated, data-doc-dev), the
      // slot of this record shown, the others hidden.
      panel = slot.parentElement;
      for (const node of [pin, chrome]) {
        node.classList.add("doc-database-app");
        node.setAttribute("data-doc-dev", "");
      }
      panel.prepend(pin, chrome);
      slot.setAttribute(SHOWN, "");
      panel.setAttribute(PEEK, mode);
      panel.setAttribute(SURFACE, "");
      panel.setAttribute("role", "dialog");
      panel.setAttribute("aria-label", w("记录详情"));
    } else {
      panel = h("div", { class: `peek ${mode}`, role: "dialog", "aria-label": w("记录详情") }, pin, chrome);
    }
    if (mode === "side") {
      const edge = h("div", { class: "peek-edge", "aria-hidden": "true", "data-doc-tip": w("拖动调整宽度，点击收起") });
      pin.append(edge);
      panel.style.width = `${widthOf()}px`;
      edge.addEventListener("pointerdown", (event) => resize(event, panel, edge));
    }
    if (mode === "center") {
      mask = h("div", { class: "peek-mask" });
      mask.addEventListener("pointerdown", (event) => {
        if (event.target === mask && !anyOpen(store.layer)) close();
      });
      if (!slot) mask.append(panel);
      store.layer.append(mask);
      lift(mask);
      root = mask;
    } else {
      if (!slot) store.layer.append(panel);
      root = panel;
    }
    if (slot) lift(panel);
    else if (mode === "side") lift(panel);
    if (mode === "side") pageBar(true);
    panel.scrollTop = scrolled;
    shown = { id, mode, slot, root, panel, mask, pin, chrome, title, props, sep, field, prev, next, count, flag };
    wireTitle(shown);
    // One the page could not make a body for yet (a database made a moment ago, its first save on its way): asked again as it is pressed.
    field?.addEventListener("pointerdown", () => { if (store.editable) update(); });
    if (slide && mode === "side") {
      const frames = still() ? [{ opacity: 0 }, { opacity: 1 }] : [{ transform: "translateX(100%)", opacity: 0 }, { transform: "none", opacity: 1 }];
      panel.animate?.(frames, { duration: still() ? FADE : SLIDE, easing: EASE });
    }
  }

  /** What the details drew taken off; `slide`: at the side, slid out and faded first; `release`: the body made for a record with none taken away then. */
  function takeDown({ slide = false, release = false } = {}) {
    endEdit();
    endRename();
    menu?.close();
    menu = null;
    if (!shown) return;
    const part = shown;
    shown = null;
    const away = () => {
      if (part.mode === "side") pageBar(false);
      if (part.slot) {
        try {
          part.panel.hidePopover?.();
        } catch {}
        for (const name of ["popover", PEEK, SURFACE, "role", "aria-label", "style"]) part.panel.removeAttribute(name);
        part.slot.removeAttribute(SHOWN);
      }
      for (const node of part.slot ? [part.pin, part.chrome] : []) node.remove();
      if (!part.slot) {
        try {
          part.panel.hidePopover?.();
        } catch {}
        part.panel.remove();
      }
      if (part.mask) {
        try {
          part.mask.hidePopover?.();
        } catch {}
        part.mask.remove();
      }
      if (release && spare && spare.slot === part.slot && keeping !== part.slot) letGo();
    };
    if (!slide || part.mode !== "side" || !part.panel.animate) return away();
    const frames = still() ? [{ opacity: 1 }, { opacity: 0 }] : [{ transform: "none", opacity: 1 }, { transform: "translateX(100%)", opacity: 0 }];
    const motion = part.panel.animate(frames, { duration: still() ? FADE : SLIDE, easing: EASE, fill: "forwards" });
    const entry = { panel: part.panel, end: null };
    let gone = false;
    entry.end = () => {
      if (gone) return;
      gone = true;
      leaving.delete(entry);
      away();
      motion.cancel();
    };
    leaving.add(entry);
    motion.onfinish = entry.end;
  }

  const neighbours = () => {
    const ids = order();
    const at = ids.indexOf(shown?.id);
    return { at, total: ids.length, prev: at > 0 ? ids[at - 1] : null, next: at >= 0 && at < ids.length - 1 ? ids[at + 1] : null };
  };

  // ---------- its title: written a character at a time (one step of undo for the typing) ----------
  function wireTitle(part) {
    const area = part.title;
    const write = () => {
      const prop = titleProp(store.doc.props);
      const words = area.value.replace(/\n/g, "");
      if (words !== area.value) area.value = words;
      fit(area);
      if (!prop) return;
      const id = part.id;
      store.commit((d) => ({ ...d, rows: d.rows.map((row) => (row.id === id ? { ...row, values: { ...row.values, [prop.id]: words } } : row)) }), `peek-${id}-${prop.id}`);
    };
    area.addEventListener("input", (event) => { if (!event.isComposing) write(); else fit(area); });
    area.addEventListener("compositionend", write);
    area.addEventListener("blur", () => store.flush());
    area.addEventListener("keydown", (event) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Enter") {
        event.preventDefault();
        store.flush();
        area.blur();
      }
    });
  }

  // ---------- its body, where it has none yet ----------
  const notesWords = (row) => {
    const notes = notesOf();
    return notes ? String(row?.values[notes.id] ?? "") : "";
  };
  // The body the page made for record `id` (by its id now, or the one it is to have), while it is still none.
  const spareOf = (id) => (spare && (spare.row === id || spare.record === id) && spare.slot.isConnected && spare.slot.hasAttribute(PROVISIONAL) && spare.slot.parentElement?.parentElement === store.host ? spare.slot : null);
  // What the details of record `id` are drawn around now: its body, or the body made for it.
  const slotNow = (id) => bodyOf(store.host, id) ?? spareOf(id);

  /**
   * The slot the details of `row` are drawn in: its body, or where no editor takes edits none; else the body the page
   * makes for it (doc-database-body, `provisional`: { record, the id its row is to have, text, its notes, which the
   * page's first paragraph holds, and write }), or null where the page makes none (then its notes are drawn, read only).
   */
  function slotOf(row) {
    const body = bodyOf(store.host, row.id);
    if (body || !store.editable) return body;
    const made = spareOf(row.id);
    if (made) return made;
    const taken = new Set([...store.doc.rows.map((each) => each.id), ...databasePages(store.host).slots.map((slot) => slot.record).filter(Boolean)]);
    const record = row.named ? row.id : newRecordId(taken);
    const from = row.id;
    const detail = { provisional: { record, text: notesWords(row), write: () => giveId(from, record) } };
    if (store.host.dispatchEvent(new CustomEvent("doc-database-body", { bubbles: true, cancelable: true, detail })) || !detail.slot) return null;
    spare = { row: from, record, slot: detail.slot };
    return detail.slot;
  }

  /**
   * The first change made in a record's body before its first word (the page's step, which this write is part of):
   * its row given the id its body goes by (data-record), what this reading holds of it following (renameRecord, and
   * the details', so that they are not drawn anew), its notes taken away (they are its body's words now).
   */
  function giveId(from, id) {
    const row = store.doc.rows.find((each) => each.id === id) ?? store.doc.rows.find((each) => each.id === from);
    if (!row) return;
    if (row.id !== id) {
      const was = row.id;
      store.renameRecord(was, id);
      if (shown?.id === was) shown.id = id;
      if (spare?.row === was) spare.row = id;
    }
    const notes = notesOf();
    const named = (each) => ({
      ...each,
      named: true,
      values: notes ? { ...each.values, [notes.id]: "" } : each.values,
      attrs: { row: [...(each.attrs?.row ?? []).filter(({ name }) => name !== RECORD_ATTRIBUTE), { name: RECORD_ATTRIBUTE, value: id }], cells: each.attrs?.cells ?? {} },
    });
    store.commit((d) => ({ ...d, rows: d.rows.map((each) => (each.id === id ? named(each) : each)) }));
  }

  // The body made for a record with none taken away again by the page, where it is still none (doc-database-body, `drop`).
  function letGo() {
    const was = spare;
    spare = null;
    if (was?.slot.hasAttribute(PROVISIONAL)) store.host.dispatchEvent(new CustomEvent("doc-database-body", { bubbles: true, cancelable: true, detail: { drop: was.record } }));
  }

  // Its notes, read only: what stands where its body would be when no editor takes edits.
  function fillField(part, row) {
    const { field } = part;
    const words = notesWords(row);
    if (field.textContent !== words.replace(/\n/g, "")) field.replaceChildren(...words.split("\n").flatMap((line, at) => [...(at > 0 ? [h("br")] : []), line]));
    field.hidden = !words;
  }

  // ---------- its values ----------
  function drawProps(row) {
    const { props } = shown;
    // Its notes among its values where it has a body besides them (written so): a column of words as any. Before its
    // first word its body holds them (the page's first paragraph).
    const list = store.doc.props.filter((prop) => prop.type !== "title" && (!prop.notes || (shown.slot && !shown.slot.hasAttribute(PROVISIONAL) && String(row.values[prop.id] ?? "").trim())));
    const keep = new Map([...props.querySelectorAll(":scope > .peek-prop")].map((node) => [node.dataset.prop, node]));
    const nodes = list.map((prop) => {
      const node = keep.get(prop.id) ?? makeProp(prop.id);
      fillProp(node, prop, row);
      return node;
    });
    let add = props.querySelector(":scope > .peek-add");
    if (!add) {
      add = h("button", { type: "button", class: "peek-add" }, icon("plus", 14), w("添加属性"));
      add.addEventListener("click", () => {
        newPropMenu(store, db, { anchor: add, onCreated: (id, type) => {
          if (type !== "formula") return;
          requestAnimationFrame(() => {
            const label = shown?.props.querySelector(`.peek-prop[data-prop="${CSS.escape(id)}"] .peek-label`);
            if (label) openMenu(id, label, {});
          });
        } });
      });
    }
    add.hidden = !store.editable;
    props.replaceChildren(...kids(...nodes, add));
  }

  function makeProp(id) {
    const type = h("span", { class: "peek-type" });
    const name = h("span", { class: "peek-name ellipsis" });
    const label = h("div", { class: "peek-label", role: "button", tabindex: "-1" }, type, name);
    const value = h("div", { class: "peek-value" });
    const node = h("div", { class: "peek-prop", "data-prop": id }, label, value);
    label.addEventListener("click", (event) => {
      if (!store.editable || event.target.closest(".th-input-wrap")) return;
      openMenu(id, label, { page: event.target.closest(".peek-type") ? "type" : undefined });
    });
    value.addEventListener("click", (event) => {
      if (!store.editable || event.target.closest("a, .cell-editor")) return;
      const prop = store.byId[id];
      const row = store.doc.rows.find((each) => each.id === shown?.id);
      if (!prop || !row || prop.type === "formula") return;
      if (prop.type === "checkbox") {
        store.setCell(row.id, prop.id, row.values[prop.id] !== true);
        return;
      }
      startEdit(prop, row, value);
    });
    return node;
  }

  function fillProp(node, prop, row) {
    const label = node.querySelector(".peek-label");
    const type = label.querySelector(".peek-type");
    attr(type, "data-doc-tip", store.editable ? w("更改类型") : null);
    if (type.dataset.type !== prop.type) {
      type.dataset.type = prop.type;
      type.replaceChildren(...kids(typeIcon(prop.type, 15)));
    }
    if (renaming?.propId !== prop.id) text(label.querySelector(".peek-name") ?? label, prop.name);
    label.setAttribute("data-doc-tip-cut", "");
    toggle(label, "open", menu?.propId === prop.id);
    const value = node.querySelector(".peek-value");
    value.className = `peek-value t-${prop.type}${prop.type === "formula" || !store.editable ? " readonly" : ""}${editing?.propId === prop.id ? " editing" : ""}`;
    if (editing?.propId === prop.id && value.querySelector(":scope > .cell-editor")) return;
    value.replaceChildren(...kids(valueView(store, row, prop, "peek") ?? ""));
  }

  function startEdit(prop, row, place) {
    if (!isInlineEditable(prop)) return;
    endEdit();
    place.classList.add("editing");
    place.replaceChildren();
    editing = { propId: prop.id, handle: null };
    let handle = null;
    handle = openEditor(store, { row, prop, place, surface: "peek", onDone: () => {
      if (editing?.handle && handle && editing.handle !== handle) return;
      editing = null;
      const now = store.doc.rows.find((each) => each.id === row.id);
      if (shown && now) drawProps(now);
    } });
    if (!handle) {
      editing = null;
      place.classList.remove("editing");
      return;
    }
    editing.handle = handle;
  }

  function endEdit() {
    const was = editing;
    editing = null;
    was?.handle?.close();
  }

  function openMenu(propId, label, { page } = {}) {
    endRename();
    const prop = store.byId[propId];
    if (!prop) return;
    if (!page) {
      const input = headNameInput(store, prop, { onEnter: () => menu?.close() });
      renaming = { propId, input };
      label.classList.add("head-edit");
      label.querySelector(".peek-name").replaceWith(input.element);
      input.input.focus();
      input.input.select();
    }
    const card = propMenu(store, db, {
      propId,
      anchor: label,
      inlineName: !page,
      startPage: page,
      onFilter: (each) => db.filterBy(each),
      onClose: () => {
        if (menu === card) menu = null;
        if (renaming?.propId === propId) endRename();
        label.classList.remove("open");
      },
    });
    menu = card;
    menu.propId = propId;
    label.classList.add("open");
  }

  function endRename() {
    if (!renaming) return;
    const { propId, input } = renaming;
    renaming = null;
    input.end();
    const node = shown?.props.querySelector(`.peek-prop[data-prop="${CSS.escape(propId)}"]`);
    const label = node?.querySelector(".peek-label");
    if (label) {
      label.classList.remove("head-edit");
      label.querySelector(".th-input-wrap")?.replaceWith(h("span", { class: "peek-name ellipsis" }, store.byId[propId]?.name ?? ""));
    }
  }

  // ---------- its width: its left edge dragged (pressed alone, it puts the details away) ----------
  function resize(event, panel, edge) {
    if (event.button !== 0) return;
    event.preventDefault();
    const x0 = event.clientX;
    const from = panel.getBoundingClientRect().width;
    let width = from;
    let dragging = false;
    const app = store.layer.parentElement;
    edge.setPointerCapture?.(event.pointerId);
    const move = (moved) => {
      if (!dragging && Math.abs(moved.clientX - x0) < DRAG) return;
      if (!dragging) {
        dragging = true;
        app.classList.add("is-resizing");
        edge.classList.add("on");
      }
      // The edge follows the pointer from where it was pressed: no jump as the drag begins.
      width = Math.round(Math.max(LEAST, Math.min(maxWidth(), from - (moved.clientX - x0))));
      panel.style.width = `${width}px`;
    };
    const up = () => {
      edge.removeEventListener("pointermove", move);
      edge.removeEventListener("pointerup", up);
      edge.removeEventListener("pointercancel", up);
      app.classList.remove("is-resizing");
      edge.classList.remove("on");
      if (!dragging) {
        close();
        return;
      }
      store.setReading({ peekWidth: width === WIDTH ? 0 : width });
    };
    edge.addEventListener("pointermove", move);
    edge.addEventListener("pointerup", up);
    edge.addEventListener("pointercancel", up);
  }

  // ---------- the keys: ↑ ↓ the record before and after, Esc puts it away ----------
  const onKey = (event) => {
    if (!shown || event.isComposing || event.keyCode === 229 || event.defaultPrevented || anyOpen(store.layer) || editing) return;
    const target = event.target instanceof Element ? event.target : null;
    const typing = target?.closest("input, textarea, [contenteditable=\"true\"]");
    if (event.key === "Escape") {
      // A field of the details' own left; in the body, the page editor's keys (it selects the block).
      if (typing && (shown.chrome.contains(typing) || shown.pin.contains(typing))) typing.blur();
      else if (!typing && !(shown.slot && target && shown.slot.contains(target))) close();
      return;
    }
    if (typing) return;
    // The arrows of a table the focus is in are its own (its cells), and those of the body the page editor's.
    if (target && shown.slot?.contains(target)) return;
    if (target && !shown.root.contains(target) && !shown.panel.contains(target) && target !== document.body && target !== document.documentElement) return;
    if (event.key === "ArrowUp" && neighbours().prev) {
      event.preventDefault();
      go(neighbours().prev);
    } else if (event.key === "ArrowDown" && neighbours().next) {
      event.preventDefault();
      go(neighbours().next);
    }
  };
  addEventListener("keydown", onKey);

  function update() {
    const id = store.ui.peek;
    const row = id ? store.doc.rows.find((each) => each.id === id) : null;
    if (!row) {
      takeDown({ slide: true, release: true });
      return;
    }
    const mode = modeOf();
    const slot = slotOf(row);
    // The body made for another record (the details gone to one with a body, or to one drawn read only): taken away.
    if (spare && spare.slot !== slot) letGo();
    if (!shown || shown.id !== id || shown.mode !== mode || shown.slot !== slot) {
      build(id, mode, slot, { slide: !shown });
      shown.fresh = true;
    }
    const part = shown;
    const editable = store.editable;
    // Its title, where the reader is not typing in it.
    const titleWords = String(row.values[titleProp(store.doc.props)?.id] ?? "");
    part.title.readOnly = !editable;
    if (document.activeElement !== part.title && part.title.value !== titleWords) part.title.value = titleWords;
    if (part.field) fillField(part, row);
    part.sep.hidden = !part.slot && part.field.hidden;
    drawProps(row);
    const { at, total, prev, next } = neighbours();
    part.prev.disabled = !prev;
    part.next.disabled = !next;
    text(part.count, at >= 0 ? `${at + 1} / ${total}` : "");
    part.flag.hidden = !store.rowsOf().stale.has(id);
    if (part.mode === "side") part.panel.style.width = `${widthOf()}px`;
    requestAnimationFrame(() => {
      if (shown !== part) return;
      fit(part.title);
      // A record just made, no title yet: its title typed at once.
      if (part.fresh && editable && !part.title.value) part.title.focus();
      part.fresh = false;
    });
  }

  return {
    update,
    /** Its records' bodies changed (one made or taken away: the page's step, its undo, someone else's write): drawn again. */
    bodies() {
      if (shown && shown.slot !== slotNow(shown.id)) update();
    },
    destroy() {
      removeEventListener("keydown", onKey);
      takeDown();
      for (const each of [...leaving]) each.end();
      letGo();
    },
  };
}
