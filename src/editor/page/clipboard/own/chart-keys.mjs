import { CHART_SOURCE, TABLE_READERS, nextChartKey } from "../../../../shared/table-chart.mjs";
import { COPY_KEYS } from "../../../components/figure/index.mjs";

// The keys of tables in what a paste made (docs/editor.md, "Copying blocks"): a chart drawn from a
// table and a view of one (an instance of a custom block that reads tables) name the table by a key
// (src/shared/table-chart.mjs: TABLE_READERS, a reader), and what a paste makes of a card, a view or a
// table carries its original's: a copy of it (data-ge-type="copy"), what a clipboard carried of a view
// (its markup), or a table made anew of its data (components/table tableData `chart`: one cut, one whose
// original is gone or changed since the copy, one of another document). The rules, by key:
//   - a reader and a table pasted together are a pair of their own: both take a new key, the first of
//     t1, t2 … the page does not hold, so that two pairs never cross (a table copied with its board
//     is a board of its own), in its document or another;
//   - a table pasted without its reader keeps its key while no table on the page carries it (a cut
//     table put back, one whose original was deleted: the card draws it again); otherwise, and in
//     another document, it is a table alone, its key taken off (a reader reads the first table of its
//     key, which could be it; another document's readers are no readers of it);
//   - a reader pasted alone keeps its key in its document: it reads the same table as its original,
//     both reading it; in another document it takes it off (`same` false: the clipboard's document is
//     not this one), as the table it read is not there and one there carrying the key is no table of
//     its (keys are t1, t2 … in every document): a view of no table, never one reading and changing that.
// A copy's new keys ride on it (COPY_KEYS) to the server, which writes them into the copy's source
// (core.mjs nodeOf: { copy, keys }; source/text.mjs copiedSource); a table made anew is written with
// its own, a view with its own or none (components/installed extras `from`). The commit makes sure of
// them against the file as it is then (source/chart-keys.mjs) and says what it changed (page/commit.mjs).

// What carries a key in `root` and in what its templates hold.
const NAMES = [CHART_SOURCE, ...TABLE_READERS];
const CARRIES = NAMES.map((name) => `[${name}]`).join(", ");
const carriers = (root) => [
  ...(root.matches?.(CARRIES) ? [root] : []),
  ...root.querySelectorAll(CARRIES),
  ...[...root.querySelectorAll("template")].flatMap((template) => carriers(template.content)),
];
const keysOf = (node) => NAMES.map((name) => node.getAttribute(name)).filter((key) => key !== null);
const readerKey = (node) => TABLE_READERS.map((name) => node.getAttribute(name)).find((key) => key !== null) ?? null;

/**
 * The blocks a paste made (`made`, not on the page yet), the keys of their cards, views and tables made
 * their own; `same`: the clipboard's document is this one (clipboard/index.mjs origin).
 */
export function relinkCopies(doc, made, { same = true } = {}) {
  const inMade = made.flatMap(carriers);
  const hosts = inMade.filter((node) => readerKey(node) !== null);
  const frames = inMade.filter((node) => node.hasAttribute(CHART_SOURCE));
  if (frames.length === 0 && (same || hosts.length === 0)) return;
  const onPage = carriers(doc);
  const taken = new Set([...onPage, ...inMade].flatMap(keysOf));
  const renamed = new Map(); // a key -> its new value, null: taken off
  const tabled = new Set(frames.map((frame) => frame.getAttribute(CHART_SOURCE)));
  for (const key of tabled) {
    if (hosts.some((host) => readerKey(host) === key)) {
      const next = nextChartKey(taken);
      taken.add(next);
      renamed.set(key, next);
    } else if (!same || onPage.some((node) => node.getAttribute(CHART_SOURCE) === key)) renamed.set(key, null);
  }
  if (!same) for (const host of hosts) if (!tabled.has(readerKey(host))) renamed.set(readerKey(host), null);
  const sent = new Map(); // a copy -> its keys { old: new | null }
  for (const [name, nodes] of [...TABLE_READERS.map((reader) => [reader, hosts]), [CHART_SOURCE, frames]]) {
    for (const node of nodes) {
      const key = node.getAttribute(name);
      if (key === null || !renamed.has(key)) continue;
      const next = renamed.get(key);
      if (next === null) node.removeAttribute(name);
      else node.setAttribute(name, next);
      const copy = node.closest('[data-ge-type="copy"]');
      if (copy) (sent.get(copy) ?? sent.set(copy, {}).get(copy))[key] = next;
    }
  }
  for (const [copy, keys] of sent) copy.setAttribute(COPY_KEYS, JSON.stringify(keys));
}
