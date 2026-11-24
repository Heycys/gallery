// The database a host holds, read from its parts and written back to them (src/shared/database.mjs is
// the format), and the records' ids kept from one reading to the next.
import { jsonIn } from '../../../../shared/json-layout.mjs';
import { isJsonType, layoutOf, readDatabase, readElement, rowMarkup, tableMarkup, writeDatabase } from '../../../../shared/database.mjs';
/** What a host's parts hold, read: the database, whether it had JSON, and what of it the format cannot hold (which makes it read-only). */
export function readHost(host) {
  const read = readDatabase(readElement(host));
  return { doc: { props: read.columns, rows: read.rows, views: read.views, shape: read.shape }, json: read.json, problems: read.problems };
}
/**
 * A database's parts as they are to hold it: its script's JSON laid out as the script lays it out, and its
 * table's markup; `out`, what the format writes of it (writeDatabase), and its `signature` (what signature says of it).
 */
export function written(doc, host) {
  const { script, table } = partsOf(host);
  const out = writeDatabase({ columns: doc.props, rows: doc.rows, views: doc.views, shape: doc.shape });
  const before = script?.textContent ?? '';
  // A JSON part written as it was laid out; a new one, or one that held none, as a person lays it out.
  const json = before.trim() ? jsonIn(before, out.json) : jsonIn('\n{\n}\n', out.json);
  return { json, table: tableMarkup(out, layoutOf(edgesOf(table))), out, signature: JSON.stringify(out) };
}
/**
 * The rows of `draft` (a draft of a table part holding what the format wrote of the database before)
 * written anew of `out` (writeDatabase's answer now) where `ids`, records of `doc` whose values alone
 * changed, stand: whether it could (one body, a row a record). The caller looks at what it made: the
 * same markup as the whole table written anew, or that is written instead.
 */
export function writeRows(draft, out, doc, ids) {
  const bodies = [...draft.children].filter((node) => node.localName === 'tbody');
  if (bodies.length !== 1 || [...draft.children].some((node) => node.localName === 'tr'))
    return false;
  const rows = [...bodies[0].children];
  if (rows.length !== doc.rows.length || rows.some((row) => row.localName !== 'tr'))
    return false;
  for (const id of ids) {
    const at = doc.rows.findIndex((row) => row.id === id);
    if (at < 0)
      return false;
    const holder = draft.ownerDocument.createElement('tbody');
    holder.innerHTML = rowMarkup(out, at);
    if (holder.childNodes.length !== 1 || holder.firstChild.localName !== 'tr')
      return false;
    rows[at].replaceWith(holder.firstChild);
  }
  return true;
}
/** A host's two parts as the format finds them (its first script of JSON, its first table), read no further. */
export function partsOf(host) {
  const children = [...host.children];
  return {
    script: children.find((node) => node.localName === 'script' && isJsonType(node.getAttribute('type'))) ?? null,
    table: children.find((node) => node.localName === 'table') ?? null,
  };
}
// What layoutOf reads of a table's markup, its blanks before the first tag and after the last and its body's around
// its rows, without writing out the whole of it (a long table's markup is long).
function edgesOf(table) {
  if (!table) return '';
  const blank = (node) => (node?.nodeType === 3 && !node.data.trim() ? node.data : '');
  // Its body's blanks before its first row and after its last (the rows' own indentation).
  const body = [...table.children].find((node) => node.localName === 'tbody');
  const rows = body?.querySelector(':scope > tr') ? `<tbody>${blank(body.firstChild)}<tr></tr>${blank(body.lastChild)}</tbody>` : '';
  return `${blank(table.firstChild)}<x>${rows}${blank(table.lastChild)}`;
}
/** What the file would hold of a database: the same for two that write the same. */
export const signature = (doc) => JSON.stringify(writeDatabase({ columns: doc.props, rows: doc.rows, views: doc.views, shape: doc.shape }));
// A record's values as a key.
const valuesKey = (row) => JSON.stringify(row.values);
/**
 * The records of `next` (read again from the file: an undo, the Agent's write) with the ids `prev`
 * gave them, where they are the same records: one of the same values first, in order, then one at
 * the same place; any other a new id. So an open record, a row a click is on, stay on their record.
 */
export function keepIds(next, prev) {
  if (!prev)
    return next;
  // A record its row names (data-record: one with a body may) is that one, whatever it holds now.
  const named = new Set(next.rows.filter((row) => row.named).map((row) => row.id));
  const free = new Map();
  for (const row of prev.rows) {
    if (named.has(row.id))
      continue;
    const key = valuesKey(row);
    free.set(key, [...(free.get(key) ?? []), row.id]);
  }
  const used = new Set(named);
  const ids = next.rows.map((row) => {
    if (row.named)
      return row.id;
    const id = free.get(valuesKey(row))?.shift() ?? null;
    if (id)
      used.add(id);
    return id;
  });
  next.rows.forEach((_, at) => {
    if (ids[at])
      return;
    const there = prev.rows[at]?.id;
    if (there && !used.has(there)) {
      ids[at] = there;
      used.add(there);
    }
  });
  let fresh = 0;
  const taken = new Set([...used, ...prev.rows.map((row) => row.id)]);
  const make = () => { let id; do
    id = `r${prev.rows.length + next.rows.length + ++fresh}`;
  while (taken.has(id)); taken.add(id); return id; };
  return { ...next, rows: next.rows.map((row, at) => ({ ...row, id: ids[at] ?? make() })) };
}
