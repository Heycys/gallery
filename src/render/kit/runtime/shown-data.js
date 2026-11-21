import { DATA_LINE, DATA_ONE, DATA_SHORT, DATA_SHOWN } from "../../../shared/components/installed.mjs";
import { sayRuntime as say } from "../words.js";

// What a script of data holds, drawn read-only for an instance the kit shows as it stands (kernel.js
// showAsItStands): its package missing, turned off or failed, what such a script holds would be no
// word on the page, and the reader would see a blank where its component drew. So the kit draws the
// JSON as what it is, the same for any package, none of whose style is there: an array of objects as a
// table, its keys the columns; an object as its keys beside their values; any other array as a list,
// below the top a line of its values where it holds values alone; a value as itself, true and false as
// words, null as a dash, and an empty script as empty. What is deeper than DEPTH levels is said by how
// many it holds, and what is past ITEMS entries, COLUMNS keys or TEXT characters is left out and said;
// so is what is past the MOST values one drawing holds, whatever each level holds, so that no JSON,
// however wide and deep, makes a page of more than a few hundred cells. What is no JSON is shown as it
// is written, and said to be none to who writes the page alone. Every word of it is text, markup in a
// key or a value too. Its root is always a table, a list of terms or a list, none of which a
// manifest's text part can be, and the page takes no text part in it, so that no editor takes its
// words for a part; it is the kit's (`DATA_SHOWN`, which a copy of the view and every mount take off),
// and none of it reaches a file.

const DEPTH = 3; // an object, a table in it, a list in a cell of that
const ITEMS = 20;
const COLUMNS = 8;
const TEXT = 200;
const MOST = 400;
const SHORT = 20; // a cell's words that stand on one line, the drawing scrolling sideways where they are wider than the page

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isValue = (value) => value === null || typeof value !== "object";
const cut = (text) => (text.length > TEXT ? `${text.slice(0, TEXT)}…` : text);
const sizeOf = (value) => (Array.isArray(value) ? value.length : Object.keys(value).length);

function made(doc, tag, text = null, className = null) {
  const node = doc.createElement(tag);
  if (text !== null) node.textContent = text;
  if (className) node.className = className;
  return node;
}

// A value of no structure, as words.
function scalar(value) {
  if (value === null) return "—";
  if (value === true) return say("value-true");
  if (value === false) return say("value-false");
  return cut(String(value));
}

// `value` at `depth` levels down, one of the values `left` still has room for: an element, or words.
function drawn(doc, value, depth, left) {
  left.values--;
  if (isValue(value)) return doc.createTextNode(scalar(value));
  if (sizeOf(value) === 0) return doc.createTextNode(say("value-empty"));
  if (depth >= DEPTH || left.values <= 0) return doc.createTextNode(say("value-deeper", String(sizeOf(value))));
  if (Array.isArray(value) && value.every(isObject)) return table(doc, value, depth, left);
  if (Array.isArray(value)) return list(doc, value, depth, left);
  return pairs(doc, value, depth, left);
}

// Rows by their keys, in the order the first rows give them.
function table(doc, rows, depth, left) {
  const keys = [...new Set(rows.slice(0, ITEMS).flatMap((row) => Object.keys(row)))];
  const columns = keys.slice(0, COLUMNS);
  const node = made(doc, "table");
  const head = node.createTHead().insertRow();
  for (const key of columns) head.append(made(doc, "th", cut(key)));
  const body = node.createTBody();
  let shown = 0;
  for (const row of rows.slice(0, ITEMS)) {
    if (left.values <= 0) break;
    const line = body.insertRow();
    for (const key of columns) {
      const cell = line.insertCell();
      if (!Object.hasOwn(row, key)) continue;
      const inner = drawn(doc, row[key], depth + 1, left);
      if (inner.nodeType === 3 && inner.data.length <= SHORT) cell.className = DATA_SHORT;
      cell.append(inner);
    }
    shown++;
  }
  const said = [shown < rows.length && say("rows-more", String(rows.length - shown)), keys.length > COLUMNS && say("columns-more", String(keys.length - COLUMNS))].filter(Boolean);
  if (said.length > 0) {
    const cell = made(doc, "td", said.join(" "), "doc-component-more");
    cell.colSpan = columns.length;
    node.createTFoot().insertRow().append(cell);
  }
  return node;
}

// An item of a list, holding what `inner` is.
function item(doc, inner) {
  const node = made(doc, "li");
  node.append(inner);
  return node;
}

// Below the top, a list of values alone is a line of them.
function list(doc, items, depth, left) {
  const node = made(doc, "ul", null, depth > 0 && items.every(isValue) ? DATA_LINE : null);
  let shown = 0;
  for (const value of items.slice(0, ITEMS)) {
    if (left.values <= 0) break;
    node.append(item(doc, drawn(doc, value, depth + 1, left)));
    shown++;
  }
  if (shown < items.length) node.append(made(doc, "li", say("value-more", String(items.length - shown)), "doc-component-more"));
  return node;
}

function pairs(doc, object, depth, left) {
  const node = made(doc, "dl");
  const entries = Object.entries(object);
  let shown = 0;
  for (const [key, value] of entries.slice(0, ITEMS)) {
    if (left.values <= 0) break;
    const said = made(doc, "dd");
    said.append(drawn(doc, value, depth + 1, left));
    node.append(made(doc, "dt", cut(key)), said);
    shown++;
  }
  if (shown < entries.length) node.append(made(doc, "dd", say("value-more", String(entries.length - shown)), "doc-component-more"));
  return node;
}

/**
 * What `script`, a script of data, holds, drawn read-only: a table, a list of terms or a list, marked as
 * the kit's (DATA_SHOWN). `writing`: the page is one its writer reads, a preview, where what is no JSON
 * is said to be none; elsewhere it is only shown.
 */
export function drawData(script, { writing = false } = {}) {
  const doc = script.ownerDocument;
  const text = script.textContent.trim();
  let root;
  try {
    root = text === "" ? doc.createTextNode(say("value-empty")) : drawn(doc, JSON.parse(text), 0, { values: MOST });
  } catch {
    root = doc.createTextNode(writing ? say("not-json", cut(text)) : cut(text));
  }
  if (root.nodeType !== 1) {
    const one = made(doc, "ul", null, DATA_ONE);
    one.append(item(doc, root));
    root = one;
  }
  root.classList.add(DATA_SHOWN);
  return root;
}
