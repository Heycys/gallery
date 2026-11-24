// A value as each place shows it (a table's cell, a card, a record's details): an option a pill in its
// color, a box checked or not, a number as its format says (a bar, stars), a date as a reader reads it
// (red when late, orange when due), an address shortened, a formula worked out; a value the file holds
// that is none of its column's kind gray, as written.
import { dateDiff, displayText, formatNumber, friendlyDate, getValue, isDirty, isEmpty, isError, isRowDone, optionOf, safeHref, shortUrl } from "../data/values.js";
import { w } from "../words.js";
import { paint } from "./colors.js";
import { h } from "./dom.js";
import { box } from "./menu.js";

/** An option as a pill in its color; one the column does not have (a value written that is none of its options) dashed, as written. */
export function pill(option, ghost = "") {
  if (!option) return ghost ? h("span", { class: "pill dashed" }, ghost) : null;
  return paint(h("span", { class: "pill" }, h("span", { class: "pill-text" }, option.name)), option.color);
}

/** A four-pointed star: its sides arcs curving in, its points rounded by the stroke's round joins. */
const STAR4 = "M8 1.9Q9.25 6.75 14.1 8Q9.25 9.25 8 14.1Q6.75 9.25 1.9 8Q6.75 6.75 8 1.9Z";
export function stars(value) {
  const count = Math.max(0, Math.min(5, Math.round(value)));
  const node = h("span", { class: "stars", role: "img", "aria-label": w("{0} 星", count) });
  for (let at = 0; at < 5; at++) node.insertAdjacentHTML("beforeend", `<svg class="${at < count ? "on" : ""}" width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path d="${STAR4}" fill="currentColor" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>`);
  return node;
}

export function bar(ratio, label) {
  const part = Math.max(0, Math.min(1, ratio));
  return h("span", { class: "bar" },
    h("span", { class: "bar-track" }, h("span", { class: `bar-fill${part >= 1 ? " full" : ""}`, style: { width: `${part * 100}%` } })),
    h("span", { class: "bar-label num" }, label));
}

/**
 * A record's value of `prop` as `surface` shows it ("table", "card", "peek", "list", "calendar"), or null
 * for nothing (an empty value; "空白" in the details). `max`: the largest of the column's numbers (a bar's whole).
 */
export function valueView(store, row, prop, surface, max) {
  const value = getValue(row, prop, store.byId);
  if (isError(value)) return h("span", { class: "v-error", "data-doc-tip": value.error }, w("#错误"));
  if (isDirty(value, prop)) return h("span", { class: "v-dirty", "data-doc-tip": prop.type === "number" ? w("不是数字，照文件里的原样保留") : prop.type === "date" ? w("不是日期，照文件里的原样保留") : w("照文件里的原样保留") }, String(value));
  if (prop.type === "checkbox") return box(value === true);
  if (isEmpty(value)) return surface === "peek" ? h("span", { class: "v-empty" }, w("空白")) : null;
  switch (prop.type) {
    case "title": return h("span", { class: "v-title" }, String(value));
    case "text": return h("span", { class: "v-text" }, String(value));
    case "number": {
      const format = prop.numberFormat;
      const label = formatNumber(value, format);
      if (format?.display === "bar") return bar(format.format === "percent" ? value : value / Math.max(max || value || 1, 1e-9), label);
      if (format?.display === "stars") return stars(value);
      return h("span", { class: "v-num num" }, label);
    }
    // In a table's cell its options run on to the cell's line and fade out over the room its padding leaves there
    // (.cell-tags), rather than stopping short of it, cut.
    case "select": return surface === "table" ? h("span", { class: "cell-tags" }, pill(optionOf(prop, value), String(value))) : pill(optionOf(prop, value), String(value));
    case "multi": return h("span", { class: surface === "table" ? "pills cell-tags" : "pills" }, value.map((id) => pill(optionOf(prop, id), id)));
    case "date": {
      const diff = dateDiff(value);
      const done = isRowDone(row, store.doc.props);
      const late = diff !== null && diff < 0 && !done;
      const soon = diff !== null && diff >= 0 && diff <= 1 && !done;
      return h("span", { class: `v-date${late ? " late" : soon ? " soon" : ""}` }, friendlyDate(value));
    }
    case "url": {
      // An address that is code (javascript:…) is no link: its words alone.
      if (!safeHref(value)) return h("span", { class: "v-text" }, String(value));
      const link = h("a", { class: "v-url", href: String(value), target: "_blank", rel: "noreferrer", "data-doc-tip-cut": true }, shortUrl(String(value)));
      // In a table's cell a click selects the cell; the address opens from its own button.
      if (surface === "table") link.addEventListener("click", (event) => event.preventDefault());
      return link;
    }
    case "formula": {
      if (typeof value === "boolean") return box(value);
      if (typeof value === "number") return h("span", { class: "v-num num" }, String(Math.round(value * 100) / 100));
      return h("span", { class: "v-text" }, displayText(value, prop));
    }
  }
  return null;
}

/** The columns a view shows besides the title, in their order: none hidden, no notes (a record's details show those). */
export const visibleProps = (props, hidden, withTitle = false) =>
  props.filter((prop) => !prop.notes && (withTitle || prop.type !== "title") && (prop.type === "title" ? withTitle : !hidden.includes(prop.id)));

