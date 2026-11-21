import { parse } from "parse5";
import { IDENTITY } from "../components/registry.mjs";
import { escapeAttribute } from "../../shared/escape.mjs";
import { attr } from "../../shared/html-tree.mjs";
import { CHART_SOURCE, TABLE_READERS, nextChartKey } from "../../shared/table-chart.mjs";
import { attributeSpan } from "./text.mjs";

// The keys of tables a chart is drawn from or a view reads (src/shared/table-chart.mjs: a table's frame
// carries CHART_SOURCE, a chart's host and a view, an instance of a custom block that reads tables, one
// of TABLE_READERS) in what a commit made: copies of cards, views and tables, tables made anew of a copy's
// data, blocks put back by an undo, a view a menu made; and the key that put on a table
// the file has (`keyed`: an attribute of the unit, which the commit set). The page chose them
// (page/clipboard/own/chart-keys.mjs, page/table/views.mjs) from what it shows, which is not all the file
// may hold when the commit lands: an Agent may have added a chart table meanwhile (which the intake gave
// the first key not taken, maybe the very one), another page may have pasted a pair. So the commit makes
// sure of them against the file as the commit leaves it, the page's rules again with the rest of the file
// in view, and says what it changed, which the page then does to the blocks it made and the table it keyed
// too (page/commit.mjs apply). It repairs and never refuses: the reader made a pair whose key collided with
// one they cannot see, and a conflict card would ask them about it.
//   - a reader (a card, a view) and a table it made or keyed with one key that something else in the file
//     carries as well (a pair of the Agent's): both take a new key, the first of t1, t2 … the file does not hold;
//   - a table it made or keyed without a reader of that key, when another table carries the key: a table
//     alone (its key taken off);
//   - anything else as the page had it (a table put back for the card that draws it, a card or a view that
//     reads its original's table).

/**
 * `text` (what a commit wrote) with the keys in the blocks it made (`made`: their block ids, the
 * blocks inside them with them) and on the tables it keyed (`keyed`: the block ids of the units whose
 * CHART_SOURCE it set) made sure of against the rest of it: { text, keys }, `keys` { old: new | null }
 * what it changed (null: taken off a table), for the page.
 */
export function relinkMade(text, made, keyed = new Set()) {
  if ((made.size === 0 && keyed.size === 0) || !text.includes(CHART_SOURCE)) return { text, keys: {} };
  const carriers = []; // { name, key, made, at }: each key the file carries, where, and whether in a block the commit made (or on a table it keyed)
  const visit = (node, inMade) => {
    for (const child of node.childNodes ?? []) {
      if (!child.tagName) continue;
      const id = attr(child, IDENTITY);
      const mine = inMade || made.has(id);
      for (const name of [CHART_SOURCE, ...TABLE_READERS]) {
        const key = attr(child, name);
        if (key !== undefined) carriers.push({ name, key, made: mine || (name === CHART_SOURCE && keyed.has(id)), at: child.sourceCodeLocation?.attrs?.[name] ?? null });
      }
      visit(child.tagName === "template" ? child.content : child, mine);
    }
  };
  visit(parse(text, { sourceCodeLocationInfo: true }), false);
  const taken = new Set(carriers.map(({ key }) => key));
  const keys = {};
  for (const key of new Set(carriers.filter((one) => one.made && one.name === CHART_SOURCE).map((one) => one.key))) {
    const others = carriers.filter((one) => one.key === key && !one.made);
    const paired = carriers.some((one) => one.key === key && one.made && one.name !== CHART_SOURCE);
    if (paired && others.length > 0) {
      keys[key] = nextChartKey(taken);
      taken.add(keys[key]);
    } else if (!paired && others.some((one) => one.name === CHART_SOURCE)) keys[key] = null;
  }
  const cuts = carriers.filter(({ name, key, made: mine, at }) => mine && at && Object.hasOwn(keys, key) && !(keys[key] === null && name !== CHART_SOURCE))
    .map(({ name, key, at }) => (keys[key] === null ? { ...attributeSpan(text, at.startOffset, at.endOffset), put: "" } : { start: at.startOffset, end: at.endOffset, put: `${name}="${escapeAttribute(keys[key])}"` }));
  return {
    text: cuts.sort((a, b) => b.start - a.start).reduce((out, { start, end, put }) => out.slice(0, start) + put + out.slice(end), text),
    keys,
  };
}
