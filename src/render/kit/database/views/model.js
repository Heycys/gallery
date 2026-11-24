// What the layouts of cards work out before they draw, with no element of the page: a board's columns (its
// select's options in their order, the records with none in a column of their own, the hidden ones apart), the
// options reordered by a column dragged, a card dropped (its cell and its place in one change; where a sort orders
// the view, the place the sort gives it), a calendar's month (its weeks from Monday) and its records by day.
// tests/unit/database-layouts.mjs holds them.
import { isDate } from "../../../../shared/database.mjs";
import { NONE, compareRows, groupRows } from "../data/query.js";
import { getValue, ymd } from "../data/values.js";

/** The key a hidden column of no value is written by in a view (`boardHidden`): a filter's "no value" too. */
export const EMPTY_KEY = NONE;

/**
 * A board's columns over `rows` by the select `prop`: each `{ key, label, rows }`, an option's id as its key
 * ("" for the records with no value, a column shown only while it holds some), in the options' order;
 * `shown` and `hidden` (the keys of `hiddenKeys`, a view's boardHidden: "__none" the column of no value).
 */
export function boardColumns(rows, prop, byId, hiddenKeys = []) {
  const all = groupRows(rows, prop, byId, true).filter((group) => group.key !== "" || group.rows.length > 0);
  const hide = new Set(hiddenKeys.map((key) => (key === EMPTY_KEY ? "" : key)));
  return { shown: all.filter((group) => !hide.has(group.key)), hidden: all.filter((group) => hide.has(group.key)) };
}

/** A column's key as a view's boardHidden writes it. */
export const hiddenKey = (key) => (key === "" ? EMPTY_KEY : key);

/**
 * The options of a column in their new order, the one shown at `from` among `shownIds` (the options a board
 * shows, in their order) moved to `to` (a place in that order before the move); those not shown keep their places.
 */
export function moveOptions(options, shownIds, from, to) {
  const order = [...shownIds];
  const [moved] = order.splice(from, 1);
  order.splice(to > from ? to - 1 : to, 0, moved);
  const shown = new Set(shownIds);
  const byId = new Map(options.map((option) => [option.id, option]));
  let next = 0;
  return options.map((option) => (shown.has(option.id) ? byId.get(order[next++]) : option));
}

/**
 * The database with a card dropped on a board: record `rowId`'s cell of `prop` made `value` (an option's id or
 * null) and, where no sort orders the view (`reorder`), the record put before `before` (a record's id) or after
 * the last record of its new column. The same database where nothing changes. One change: one step of undo.
 */
export function dropCard(doc, { rowId, prop, value, before = null, reorder = true }) {
  const row = doc.rows.find((each) => each.id === rowId);
  if (!row) return doc;
  const same = (row.values[prop.id] ?? null) === value;
  let rows = same ? doc.rows : doc.rows.map((each) => (each.id === rowId ? { ...each, values: { ...each.values, [prop.id]: value } } : each));
  if (reorder) {
    const moving = rows.find((each) => each.id === rowId);
    const rest = rows.filter((each) => each.id !== rowId);
    let at = before ? rest.findIndex((each) => each.id === before) : -1;
    if (at < 0) {
      const column = rest.filter((each) => (each.values[prop.id] ?? null) === value);
      const last = column[column.length - 1];
      at = last ? rest.indexOf(last) + 1 : rest.length;
    }
    rest.splice(at, 0, moving);
    if (!rest.every((each, index) => each === rows[index])) rows = rest;
  }
  if (rows === doc.rows) return doc;
  // The column changed: the options its cells named that it did not list (read from the file) are written now, as a cell's change writes them.
  const props = !same && prop.options?.some((option) => option.added)
    ? doc.props.map((each) => (each.id === prop.id ? { ...each, options: each.options.map((option) => ({ ...option, added: undefined })) } : each))
    : doc.props;
  return { ...doc, props, rows };
}

/**
 * Where `sorts` put record `row` among `rows` (a board's column, sorted by them, the record not among them) once its
 * cell of `prop` is `value`: the place it takes there (0 to `rows.length`). Of equals, the records' own order
 * (`order`: a record's id to its place in the records), as the sort keeps it.
 */
export function sortedPlace(rows, row, prop, value, sorts, byId, order) {
  const moved = { ...row, values: { ...row.values, [prop.id]: value } };
  const after = (other) => {
    const by = compareRows(moved, other, sorts, byId);
    return by > 0 || (by === 0 && (order.get(row.id) ?? 0) > (order.get(other.id) ?? 0));
  };
  let place = 0;
  while (place < rows.length && after(rows[place])) place++;
  return place;
}

/** A month's days as a calendar draws them: whole weeks from Monday, those of the months around it too. */
export function monthDays(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7;
  const weeks = Math.ceil((offset + new Date(year, month + 1, 0).getDate()) / 7);
  return Array.from({ length: weeks * 7 }, (_, at) => new Date(year, month, 1 - offset + at));
}

/** `year`, `month` (0–11) moved by `by` months. */
export function shiftMonth({ year, month }, by) {
  const date = new Date(year, month + by, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

/** A month as a layout keeps it (its reading state): "2026-11"; and back, null for what is none. */
export const monthKey = ({ year, month }) => `${year}-${String(month + 1).padStart(2, "0")}`;
export function readMonth(key) {
  const found = /^(\d{4})-(\d{2})$/.exec(String(key ?? ""));
  return found && +found[2] >= 1 && +found[2] <= 12 ? { year: +found[1], month: +found[2] - 1 } : null;
}

/** The records by the day `prop` says (a Map of "2026-11-12" to records, in order) and those with none it reads as a date. */
export function recordsByDay(rows, prop, byId) {
  const days = new Map();
  const undated = [];
  for (const row of rows) {
    const value = getValue(row, prop, byId);
    // A day of the calendar; words that are none (下周, 2026-02-30) are under 未排期, so that every record shows.
    if (isDate(value)) {
      if (!days.has(value)) days.set(value, []);
      days.get(value).push(row);
    } else undated.push(row);
  }
  return { days, undated };
}

export { ymd };
