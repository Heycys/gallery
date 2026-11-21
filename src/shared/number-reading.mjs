// How a table's cells are read as numbers: the one reading of the kit (src/render/kit/tables/
// cells.js: its numeric columns, centered and sorted by number, and the values a sort compares) and
// the page editor (src/editor/components/table/index.mjs: 一键优化's header column is a column of
// names, so none of its cells is a number; page/table/index.mjs sortRows sorts by parsedValue).
// A column is a number column only when every cell holds one, so what counts as a number is decided here and nowhere else.

/** What a cell holds in the way of a value: its sort value when it has one, else its words. */
export function rawCellValue(cell) {
  return (cell?.dataset.sortValue ?? cell?.textContent ?? "").trim();
}

// A cell that holds no value: it does not disqualify a column of numbers (a dash is also what a
// minus sign alone reads as, below).
const missingValues = new Set(["", "-", "—", "–", "−", "n/a", "na", "null"]);

export function isMissingValue(raw) {
  return missingValues.has(raw.toLowerCase());
}

// A number as tables write it: a qualifier before it (约, ≈, ~, <, ≥ …), a sign, a currency, digits
// grouped by commas (in thousands or ten-thousands) or spaces, a decimal part (a point with no digit
// after it too: "1." is 1, as a number being typed reads), an exponent, then a percent, a multiplier
// or a unit (12.5%, 3.4亿, 120 ms, 50 元/月); a range (3–5, 3~5 天) reads as its first number, an
// accountant's negative ((12)) as -12; 千, 万 and 亿 scale it (1.2万 is 12000). Full-width
// characters (１２，３４５％) read as their ASCII, a Unicode minus or dash as a minus.
const QUALIFIER = String.raw`(?:约|大约|近|超过|不足|≈|~|<=?|>=?|≤|≥|±)?`;
const AMOUNT = String.raw`[$¥€£₩₹]?\s*((?:\d{1,3}(?:[,\s\u00a0\u2009]\d{3})+|\d{1,4}(?:,\d{4})+|\d+)(?:\.\d*)?(?:e[+-]?\d+)?|\.\d+)`;
const UNIT = String.raw`((?:[%‰x×]|[A-Za-zµμ\u4e00-\u9fff°℃]+(?:\/[A-Za-zµμ\u4e00-\u9fff°℃·]+)?)?)`;
/** What a unit's first character scales its number by (1.2万 is 12000): such a unit is its base unit (3.6亿元: 元) in that scale. */
export const UNIT_SCALES = { 千: 1e3, 万: 1e4, 亿: 1e8 };
const SCALE = UNIT_SCALES;
const SINGLE = new RegExp(`^${QUALIFIER}\\s*([+-]?)\\s*${AMOUNT}\\s*${UNIT}$`, "i");
const RANGE = new RegExp(`^([+-]?)\\s*${AMOUNT}\\s*${UNIT}\\s*(?:-|~|至|到)\\s*[+-]?\\s*${AMOUNT}\\s*${UNIT}$`, "i");

/**
 * How a cell's words write a number (read as above): { value, written, unit }, `value` the number
 * they hold (3.6亿 is 360000000), `written` the number before its unit scales it (3.6), `unit` what
 * follows it as written ("亿", "%", "ms"; "" for none; a range's first), and `range: true` for a range
 * (its first number: a sort's value, which a chart, drawing one number a cell, does not take). Null
 * when they hold none.
 */
export function numberReading(raw) {
  let text = raw.normalize("NFKC").trim().replace(/[−–—]/g, "-");
  const accounting = /^\((.+)\)$/.exec(text);
  if (accounting) text = accounting[1].trim();
  const single = SINGLE.exec(text);
  const match = single ?? RANGE.exec(text);
  if (!match) return null;
  const value = Number(`${match[1]}${match[2].replace(/[,\s\u00a0\u2009]/g, "")}`);
  const written = accounting ? -value : value;
  const unit = match[3] ?? "";
  const scaled = written * (SCALE[unit[0]] ?? 1);
  if (!Number.isFinite(scaled)) return null;
  return single ? { value: scaled, written, unit } : { value: scaled, written, unit, range: true };
}

/** The number a cell's words hold (read as above), or null. */
export function numberValue(raw) {
  return numberReading(raw)?.value ?? null;
}

/** The numbers a cell holds: one (12.5%), or several told apart by a slash (3 / 4), or null when it is none. */
export function numericParts(cell) {
  const raw = rawCellValue(cell);
  if (isMissingValue(raw)) return null;

  const scalar = numberValue(raw);
  if (scalar !== null) return [scalar];

  const tokens = raw.split(/\s*\/\s*/);
  if (tokens.length < 2) return null;
  const values = tokens.map(numberValue);
  return values.every((value) => value !== null) ? values : null;
}

/** The value a sort reads from a cell: a number ("number"), a date ("date") or its words; null when it is missing (or no number, no date). */
export function parsedValue(cell, type) {
  const raw = rawCellValue(cell);
  if (isMissingValue(raw)) return null;

  if (type === "number") {
    const values = numericParts(cell);
    return values?.length === 1 ? values[0] : null;
  }

  if (type === "date") {
    const value = Date.parse(raw);
    return Number.isFinite(value) ? value : null;
  }

  return raw;
}
