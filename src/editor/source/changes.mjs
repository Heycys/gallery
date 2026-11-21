import { parseFragment } from "parse5";
import { treeText } from "../../shared/annotations.mjs";
import { escapeAttribute } from "../../shared/escape.mjs";
import { attr } from "../../shared/html-tree.mjs";
import { applyEdits } from "./apply.mjs";
import { scan } from "./blocks.mjs";
import { commitEdits } from "./commit.mjs";
import { resembles } from "./locate.mjs";
import { commonRun } from "./merge.mjs";
import { blockIdSpans, unitHash } from "./units.mjs";

// The Agent's changes, block by block (docs/editor.md, "Agent's changes"): what a report's text says
// now against the baseline the reader last confirmed (editor/changes.mjs keeps it), as the page marks
// them. Each unit of a text is a row, its own content (its source and a Sheet tab's panel, the units
// in it taken out, its block ids too, white space as one space) with its kind its key; the title is a
// row of its own. The two lists of rows are aligned on their keys (the page's one LCS, merge.mjs
// commonRun; past 2000 by 2000, first on the keys each side holds once), and in each gap left the rows
// of one block id, then of one kind that say much the same (locate.mjs resembles), are one block
// changed; the rest were added or deleted (a block moved is both). Counted by blocks, as Cursor counts
// lines: a container that only holds blocks, no words of its own (a list, a quote, a section, columns,
// a Sheet area, a plain div…), counts as the blocks it brought or took, each one, or as one when it
// brought or took none (put around blocks that were there, or taken from around them). A block is named as the page finds it in the file now: by its id where that is the file's
// alone, else by its unitHash and which of that hash it is in the file's order.
// Pure: what the edit service runs, a test reads.

const ALIGN_MOST = 2000 * 2000; // the most cells one LCS table takes
const TEXT_MOST = 2000; // a deleted block's words, as the page's ghost of it shows them
const ROWS_MOST = 50; // and the most blocks one ghost of deletions shows
const WORDS_MOST = 1500; // a text block with more words is marked whole (the page's word diff reads no more)

// `source` from `start` to `end`, without the spans `holes` (sorted by start; they may overlap).
function cut(source, start, end, holes) {
  let text = "";
  let at = start;
  for (const hole of holes) {
    if (hole.end <= at || hole.start >= end) continue;
    if (hole.start > at) text += source.slice(at, hole.start);
    at = Math.max(at, hole.end);
  }
  return text + source.slice(at, end);
}

const squeeze = (text) => text.replace(/\s+/g, " ").trim();
// Whether a unit's own content (its source, the units in it taken out) says anything: words, not tags or comments.
const says = (own) => /\S/.test(own.replace(/<!--[^]*?-->/g, "").replace(/<[^>]*>/g, "").replace(/\u0000/g, ""));
const rangesOf = (unit) => (unit.companion ? [{ start: unit.start, end: unit.end }, { start: unit.companion.start, end: unit.companion.end }] : [{ start: unit.start, end: unit.end }]);

/**
 * The rows of a report's text (as its pages see it), in the file's order: [{ unit (null for the
 * title), kind, key, own, counts (0 or 1), parent (the row it is in, its index, or null), blockId,
 * text (its words) }], and what they were read from: { rows, scanned, ref(row) }.
 */
export function rowsOf(text) {
  const scanned = scan(text);
  const { units, blocks } = scanned;
  let root = units[0]?.node ?? blocks[0]?.node ?? null;
  while (root?.parentNode) root = root.parentNode;
  const ids = root ? blockIdSpans(text, [root]) : [];
  // Each unit's innermost container: the unit whose range holds it (well formed, so nested or apart),
  // or the Sheet tab whose panel does, when that holds it more closely.
  const sorted = [...units].sort((a, b) => a.start - b.start || b.end - a.end);
  const container = new Map();
  const stack = [];
  for (const unit of sorted) {
    while (stack.length && stack.at(-1).end <= unit.start) stack.pop();
    container.set(unit, stack.at(-1) ?? null);
    stack.push(unit);
  }
  for (const tab of units.filter((unit) => unit.companion)) {
    const { start, end } = tab.companion;
    for (const unit of units) {
      if (unit === tab || unit.start < start || unit.end > end) continue;
      const now = container.get(unit);
      if (!now || now.start < start) container.set(unit, tab);
    }
  }
  const children = new Map();
  for (const unit of units) {
    const outer = container.get(unit);
    if (outer) children.set(outer, [...(children.get(outer) ?? []), unit]);
  }
  const title = blocks.find((block) => block.kind === "title") ?? null;
  const entries = [
    ...units.map((unit) => ({ unit, at: unit.elStart })),
    ...(title ? [{ unit: null, at: title.start }] : []),
  ].sort((a, b) => a.at - b.at);
  const index = new Map(entries.map((entry, at) => [entry.unit, at]));
  const known = new Map(); // block id -> how many units carry it
  for (const unit of units) if (unit.blockId) known.set(unit.blockId, (known.get(unit.blockId) ?? 0) + 1);
  const rows = entries.map(({ unit }) => {
    if (!unit) {
      const own = squeeze(cut(text, title.start, title.end, ids));
      return { unit: null, title: true, kind: "title", key: `title\u0000${own}`, own, counts: 1, parent: null, blockId: null, text: treeText(title.node).slice(0, TEXT_MOST) };
    }
    const inner = children.get(unit) ?? [];
    const holes = [...inner.flatMap(rangesOf), ...ids].sort((a, b) => a.start - b.start);
    const own = squeeze(rangesOf(unit).map(({ start, end }) => cut(text, start, end, holes)).join("\u0000"));
    const holder = inner.length > 0 && !says(own); // a container that only holds blocks
    const outer = container.get(unit);
    return { unit, kind: unit.kind, key: `${unit.kind}\u0000${own}`, own, counts: holder ? 0 : 1, parent: outer ? index.get(outer) : null, blockId: unit.blockId, text: treeText(unit.node).slice(0, TEXT_MOST) };
  });
  // How the page finds a row's block: its id when no other carries it, else its hash and which of the file's units with that hash it is.
  let hashes = null;
  const ref = (row) => {
    if (row.title) return { title: true };
    if (row.blockId && known.get(row.blockId) === 1) return { id: row.blockId };
    hashes ??= (() => {
      const seen = new Map();
      const of = new Map();
      for (const { unit } of entries) {
        if (!unit) continue;
        const hash = unitHash(text, unit);
        of.set(unit, { hash, nth: seen.get(hash) ?? 0 });
        seen.set(hash, (seen.get(hash) ?? 0) + 1);
      }
      return of;
    })();
    return hashes.get(row.unit);
  };
  return { rows, scanned, ref };
}

// A list of keys aligned to another: index pairs of what they share, in order (commonRun); past
// ALIGN_MOST, the keys each side holds once first (the longest run of them in order), then each gap.
function align(xs, ys) {
  if (xs.length * ys.length <= ALIGN_MOST) return commonRun(xs, ys);
  const counts = (list) => list.reduce((map, key) => map.set(key, (map.get(key) ?? 0) + 1), new Map());
  const [inX, inY] = [counts(xs), counts(ys)];
  const where = new Map();
  ys.forEach((key, j) => { if (inY.get(key) === 1 && inX.get(key) === 1) where.set(key, j); });
  const anchors = [];
  xs.forEach((key, i) => { if (where.has(key)) anchors.push([i, where.get(key)]); });
  // The longest run of them whose places in `ys` rise too (patience: piles by their tops).
  const tops = [];
  const back = [];
  anchors.forEach(([, j], at) => {
    let low = 0;
    let high = tops.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (anchors[tops[middle]][1] < j) low = middle + 1;
      else high = middle;
    }
    back[at] = low > 0 ? tops[low - 1] : -1;
    tops[low] = at;
  });
  const chain = [];
  for (let at = tops.at(-1) ?? -1; at >= 0; at = back[at]) chain.unshift(anchors[at]);
  const pairs = [];
  let [i0, j0] = [0, 0];
  for (const [i, j] of [...chain, [xs.length, ys.length]]) {
    if ((i - i0) * (j - j0) <= ALIGN_MOST) for (const [x, y] of commonRun(xs.slice(i0, i), ys.slice(j0, j))) pairs.push([i0 + x, j0 + y]);
    if (i < xs.length) pairs.push([i, j]);
    [i0, j0] = [i + 1, j + 1];
  }
  return pairs;
}

// A text block's words as the page reads them: a list item holding blocks, its own text alone.
const blockText = (text, block) => (block.nested ? treeText(parseFragment(text.slice(block.innerStart, block.innerEnd))) : treeText(block.node));
// Its words as the page's word diff reads them (page/merge.mjs wordDiff: spaces too).
const wordCount = (text) => text.match(/[A-Za-z0-9]+|\s+|[^A-Za-z0-9\s]/gu)?.length ?? 0;
// A row's own text blocks, in the file's order.
const textBlocks = ({ scanned }, row) => (row.title ? scanned.blocks.filter((block) => block.kind === "title")
  : scanned.blocks.filter((block) => block.unit === row.unit.id)).sort((a, b) => a.innerStart - b.innerStart);

// Words of a parsed fragment, a line each of its blocks (treeText); a table's a line each row, its cells apart by " · ".
function wordsOf(fragment) {
  const rows = [];
  const walk = (node) => {
    for (const child of node.childNodes ?? []) {
      if (child.tagName === "tr") rows.push((child.childNodes ?? []).filter((cell) => cell.tagName === "td" || cell.tagName === "th").map((cell) => treeText(cell).replace(/\s+/g, " ")).join(" · "));
      else if (child.tagName) walk(child.tagName === "template" ? child.content : child);
    }
  };
  walk(fragment);
  return rows.length ? rows.join("\n") : treeText(fragment);
}

// A deleted row as the page's ghost of the deleted blocks draws it (page/changes/ghost.mjs): its kind,
// its tag, its own words (the blocks in it apart: a list item's, not its nested items'), how many of
// the deleted rows that show it stands in (`depth`: an item of a nested list one more than its item),
// and an item's marker (its list's tag, its number in an ordered one). A container with no words of
// its own (a list, a highlight block…) shows none: its blocks stand for it.
function ghostRow(rows, at, shows) {
  const row = rows[at];
  let depth = 0;
  for (let up = row.parent; up !== null; up = rows[up].parent) if (shows(up)) depth += 1;
  const tag = row.title ? "h1" : row.unit.node.tagName;
  const text = row.title ? row.text : wordsOf(parseFragment(row.own.replace(/\u0000/g, " "))).slice(0, TEXT_MOST);
  const ghost = { kind: row.kind, tag, depth, text };
  const list = tag === "li" ? row.unit.node.parentNode : null;
  if (list?.tagName === "ul" || list?.tagName === "ol") {
    ghost.marker = list.tagName;
    if (list.tagName === "ol") {
      const items = (list.childNodes ?? []).filter((node) => node.tagName === "li");
      ghost.number = (Number.parseInt(attr(list, "start") ?? "1", 10) || 1) + items.indexOf(row.unit.node);
    }
  }
  return ghost;
}

/**
 * What `nowText` changed of `baseText` (both as pages see them), by blocks; null when nothing. Else
 * { counts: { added, changed, removed }, added: [{ ref }] (the outermost), changed: [{ ref, texts:
 * [{ nth, base }] (its own text blocks that changed, by their order in it, as they were) | whole: true }],
 * title?: { base }, removed: [{ before | after: ref, or into: "main", count, rows: [{ kind, tag, depth, text, marker?, number? }] (ghostRow), more? }] },
 * a ref being { id }, { hash, nth } or { title: true } of the file now. `named(row, rows)`: what names a
 * row of the text now in their place instead (rows: rowsOf's of it), for a caller that marks them in it
 * (markedVersion).
 */
export function diffRows(baseText, nowText, { named = null } = {}) {
  if (baseText === nowText) return null;
  const old = rowsOf(baseText);
  const now = rowsOf(nowText);
  const nameOf = named ? (row) => named(row, now) : now.ref;
  const [xs, ys] = [old.rows.map((row) => row.key), now.rows.map((row) => row.key)];
  const pairs = align(xs, ys);
  if (pairs.length === xs.length && pairs.length === ys.length) return null;
  // Ids each side's rows carry once.
  const single = (rows) => {
    const counts = new Map();
    for (const row of rows) if (row.blockId) counts.set(row.blockId, (counts.get(row.blockId) ?? 0) + 1);
    return (row) => Boolean(row.blockId) && counts.get(row.blockId) === 1;
  };
  const [oneOld, oneNow] = [single(old.rows), single(now.rows)];
  const steps = []; // { type: "same" | "del" | "ins" | "chg", i, j }
  let [i0, j0] = [0, 0];
  for (const [i, j] of [...pairs, [xs.length, ys.length]]) {
    // The gap: rows of one id, then rows of one kind that say much the same, in order, are one row changed.
    const ids = new Map();
    for (let y = j0; y < j; y++) if (oneNow(now.rows[y])) ids.set(now.rows[y].blockId, y);
    const byId = [];
    let last = j0 - 1;
    for (let x = i0; x < i; x++) {
      const y = oneOld(old.rows[x]) ? ids.get(old.rows[x].blockId) : undefined;
      if (y !== undefined && y > last) {
        byId.push([x, y]);
        last = y;
      }
    }
    const matched = [];
    let [x, y] = [i0, j0];
    for (const [px, py] of [...byId, [i, j]]) {
      for (; x < px; x++) {
        const row = old.rows[x];
        for (let candidate = y; candidate < py; candidate++) {
          const other = now.rows[candidate];
          if (other.kind === row.kind && (row.title || resembles(row.own, other.own))) { // the one title is the title, however it changed
            matched.push([x, candidate]);
            y = candidate + 1;
            break;
          }
        }
      }
      if (px < i) matched.push([px, py]);
      [x, y] = [px + 1, py + 1];
    }
    matched.sort((a, b) => a[0] - b[0]);
    [x, y] = [i0, j0];
    for (const [px, py] of [...matched, [i, j]]) {
      for (; x < px; x++) steps.push({ type: "del", i: x });
      for (; y < py; y++) steps.push({ type: "ins", j: y });
      if (px < i) steps.push({ type: "chg", i: px, j: py });
      [x, y] = [px + 1, py + 1];
    }
    if (i < xs.length) steps.push({ type: "same", i, j });
    [i0, j0] = [i + 1, j + 1];
  }
  const inserted = new Set(steps.filter((step) => step.type === "ins").map((step) => step.j));
  const deleted = new Set(steps.filter((step) => step.type === "del").map((step) => step.i));
  // What a row added or deleted counts: a block one; a container that only holds blocks none, unless
  // none of those added or deleted with it counts (it was put around blocks that stay, or taken away
  // from around them): then one.
  const weigh = (rows, marked) => {
    const holding = new Set();
    for (const at of marked) {
      if (!rows[at].counts) continue;
      for (let up = rows[at].parent; up !== null; up = rows[up].parent) holding.add(up);
    }
    return (at) => rows[at].counts || (holding.has(at) ? 0 : 1);
  };
  const [addedWeight, removedWeight] = [weigh(now.rows, inserted), weigh(old.rows, deleted)];
  const counts = { added: 0, changed: 0, removed: 0 };
  const added = [];
  const changed = [];
  const removed = [];
  let title;
  let group = null;
  let lastNew = null; // the last row of the text now passed
  const close = (next) => {
    if (!group) return;
    const more = Math.max(0, group.rows.length - ROWS_MOST);
    removed.push({ ...(next !== null ? { before: nameOf(now.rows[next]) } : lastNew !== null ? { after: nameOf(now.rows[lastNew]) } : { into: "main" }), count: group.count, rows: group.rows.slice(0, ROWS_MOST), ...(more ? { more } : {}) });
    group = null;
  };
  // A deleted row the ghost shows: any but a container with no words of its own (a picture, a divider among them).
  const shown = (at) => deleted.has(at) && old.rows[at].counts > 0;
  for (const step of steps) {
    if (step.type === "del") {
      group ??= { count: 0, rows: [] };
      group.count += removedWeight(step.i);
      counts.removed += removedWeight(step.i);
      if (shown(step.i)) group.rows.push(ghostRow(old.rows, step.i, shown));
      continue;
    }
    close(step.j);
    lastNew = step.j;
    if (step.type === "ins") {
      const row = now.rows[step.j];
      counts.added += addedWeight(step.j);
      if (row.parent === null || !inserted.has(row.parent)) added.push({ ref: nameOf(row) });
    } else if (step.type === "chg") {
      const [was, is] = [old.rows[step.i], now.rows[step.j]];
      counts.changed += 1;
      const before = textBlocks(old, was);
      const after = textBlocks(now, is);
      let texts = [];
      let whole = before.length !== after.length || before.length === 0 || before.some((block, at) => block.tag !== after[at].tag);
      if (!whole) {
        before.forEach((block, nth) => {
          const [then, then2] = [blockText(baseText, block), blockText(nowText, after[nth])];
          if (wordCount(then) > WORDS_MOST || wordCount(then2) > WORDS_MOST) whole = true;
          else if (then !== then2) texts.push({ nth, base: then });
        });
        if (texts.length === 0) whole = true;
      }
      if (whole) texts = [];
      changed.push({ ref: nameOf(is), ...(whole ? { whole: true } : { texts }) });
      if (is.title) title = { base: was.text };
    }
  }
  close(null);
  return { counts, added, changed, ...(title ? { title } : {}), removed };
}

const LISTED_WORDS = 40; // a block as a list of blocks names it: its first words

/**
 * The blocks `nowText` changed of `baseText` (both as pages see them), one by one, for a list a person or an
 * Agent reads (the recent versions' summaries, gallery revert): diffRows' own, each with what names it,
 * { change: "added" | "changed" | "removed", kind, tag, id (its data-block-id, null for one without, and
 * for one removed: diffRows keeps a deleted block's words, not its id), text (its first words), title?:
 * true } in the file's order, the deleted ones where they stood; the outermost of those added, a deleted
 * one with words of its own. With `counts`: diffRows' counts. null when nothing changed.
 */
export function changedBlocks(baseText, nowText) {
  const diff = diffRows(baseText, nowText);
  if (!diff) return null;
  const { rows, ref } = rowsOf(nowText);
  const found = new Map(rows.map((row) => [JSON.stringify(ref(row)), row]));
  const words = (text) => {
    const line = text.replace(/\s+/g, " ").trim();
    return line.length > LISTED_WORDS ? `${line.slice(0, LISTED_WORDS)}…` : line;
  };
  const named = (change, refOf) => {
    const row = found.get(JSON.stringify(refOf));
    if (!row) return null;
    const tag = row.title ? "h1" : row.unit.node.tagName;
    return { change, kind: row.kind, tag, id: row.blockId ?? null, text: words(row.text), ...(row.title ? { title: true } : {}), at: rows.indexOf(row) };
  };
  const listed = [
    ...diff.added.map(({ ref: at }) => named("added", at)),
    ...diff.changed.map(({ ref: at }) => named("changed", at)),
  ].filter(Boolean);
  // A group deleted stands before the block after it (or after the last, or alone in the body).
  for (const group of diff.removed) {
    const near = group.before ? found.get(JSON.stringify(group.before)) : group.after ? found.get(JSON.stringify(group.after)) : null;
    const at = near ? rows.indexOf(near) + (group.before ? -0.5 : 0.5) : -1;
    group.rows.forEach((row, nth) => listed.push({ change: "removed", kind: row.kind, tag: row.tag, id: null, text: words(row.text), at: at + nth / 1000 }));
  }
  return { counts: diff.counts, blocks: listed.sort((a, b) => a.at - b.at).map(({ at: _, ...block }) => block) };
}

// Where an attribute goes into an element's start tag: right after its name (what follows it is a space, a `/` or the `>`).
const afterName = (node) => node.sourceCodeLocation.startOffset + 1 + node.tagName.length;

/**
 * `nowText` (a recent version, as pages see it) with what it changed of `baseText` (the version before it,
 * the same) marked in it for 历史版本's view of it (docs/editor.md "Recent versions"; the page draws the marks,
 * editor/page/changes/version.mjs, as the Agent's changes are drawn): diffRows' own, each block in its start tag.
 * `data-ge-hist="add"` on a block added (the outermost) and on one changed with no words to tell (diffRows'
 * `whole`), filled green; `data-ge-hist="words"` on one whose words changed, and `data-ge-hist-was` (its words in
 * the version before) on each of its text blocks that changed, its words compared there word by word; the blocks
 * deleted, a ghost each place they stood: `data-ge-hist-before`, `-after` (the index of the group in
 * `ghosts`) on the block after the place or the last one, `data-ge-hist-into` on the main when none is left, and
 * the groups ({ count, rows, more? }: diffRows' removed) in a JSON script before </body>
 * (`script[data-ge-hist-ghosts]`). { text, counts }, or null when no block changed. Only a page is shown this text:
 * nothing of it is ever a file's.
 */
export function markedVersion(baseText, nowText) {
  const diff = diffRows(baseText, nowText, { named: (row, rows) => ({ row, rows }) });
  if (!diff) return null;
  const inserts = []; // { at, text }
  const mark = (node, name, value) => {
    if (node?.sourceCodeLocation?.startTag) inserts.push({ at: afterName(node), text: ` ${name}="${escapeAttribute(String(value))}"` });
  };
  // A row's element: its unit's, or the title's (a text block of its own).
  const elementOf = ({ row, rows }) => (row.title ? textBlocks(rows, row)[0]?.node ?? null : row.unit.node);
  for (const { ref } of diff.added) mark(elementOf(ref), "data-ge-hist", "add");
  for (const { ref, whole, texts } of diff.changed) {
    if (whole) {
      mark(elementOf(ref), "data-ge-hist", "add");
      continue;
    }
    mark(elementOf(ref), "data-ge-hist", "words");
    const blocks = textBlocks(ref.rows, ref.row);
    for (const { nth, base } of texts) mark(blocks[nth]?.node, "data-ge-hist-was", base);
  }
  const ghosts = diff.removed.map(({ before, after, into, count, rows, more }, at) => {
    if (before) mark(elementOf(before), "data-ge-hist-before", at);
    else if (after) mark(elementOf(after), "data-ge-hist-after", at);
    else if (into) {
      const main = /<main\b/i.exec(nowText);
      if (main) inserts.push({ at: main.index + 5, text: ` data-ge-hist-into="${at}"` });
    }
    return { count, rows, ...(more ? { more } : {}) };
  });
  let text = nowText;
  for (const { at, text: put } of inserts.sort((a, b) => b.at - a.at)) text = text.slice(0, at) + put + text.slice(at);
  if (ghosts.length) {
    const script = `<script type="application/json" data-ge-hist-ghosts data-doc-dev>${JSON.stringify(ghosts).replace(/</g, "\\u003c")}</script>\n`;
    const end = text.search(/<\/body>(?![^]*<\/body>)/i);
    text = end >= 0 ? text.slice(0, end) + script + text.slice(end) : text + script;
  }
  return { text, counts: diff.counts };
}

/**
 * What `nowText` changed of `baseText` (both as pages see them), every block with its words, for an Agent to
 * read (gallery history --changes: what 历史版本 marks on a version's page): diffRows' own, in the file's
 * order, the deleted ones where they stood, { change: "added" | "changed" | "removed", kind, tag, id (its
 * data-block-id; null for none and for one deleted), text (its words, now; a deleted one's as it was), title?,
 * texts?: [{ before, now }] (of one changed, its text blocks whose words changed), whole?: true (one changed
 * with no words to tell: an attribute, a picture, a chart's or a component's data) }, and `counts`; null when
 * no block changed.
 */
export function blockChanges(baseText, nowText) {
  const diff = diffRows(baseText, nowText, { named: (row, rows) => ({ row, rows }) });
  if (!diff) return null;
  const words = (text) => text.replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  const entry = (change, { row, rows }, more = {}) => ({
    change, kind: row.kind, tag: row.title ? "h1" : row.unit.node.tagName, id: row.blockId ?? null, text: words(row.text),
    ...(row.title ? { title: true } : {}), ...more, at: rows.rows.indexOf(row),
  });
  const listed = [
    ...diff.added.map(({ ref }) => entry("added", ref)),
    ...diff.changed.map(({ ref, whole, texts }) => {
      if (whole) return entry("changed", ref, { whole: true });
      const blocks = textBlocks(ref.rows, ref.row);
      return entry("changed", ref, { texts: texts.map(({ nth, base }) => ({ before: words(base), now: words(blocks[nth] ? blockText(nowText, blocks[nth]) : "") })) });
    }),
  ];
  for (const { before, after, rows: gone } of diff.removed) {
    const near = before ?? after;
    const at = near ? near.rows.rows.indexOf(near.row) + (before ? -0.5 : 0.5) : -1;
    gone.forEach((row, nth) => listed.push({ change: "removed", kind: row.kind, tag: row.tag, id: null, text: words(row.text ?? ""), at: at + nth / 1000 }));
  }
  return { counts: diff.counts, blocks: listed.sort((a, b) => a.at - b.at).map(({ at: _, ...block }) => block) };
}

const TEXT_ROWS_MOST = 400; // the most blocks a version's words show

/**
 * A report's text (as its pages see it) as its words, a row each block that has words of its own, in the
 * file's order, as the page's ghost of deleted blocks draws one (ghostRow: { kind, tag, depth, text,
 * marker?, number? }), for a look at a recent version; past TEXT_ROWS_MOST, `more` says how many rows more.
 */
export function textRows(text) {
  const { rows } = rowsOf(text);
  const shows = (at) => rows[at].counts > 0;
  const shown = rows.map((_, at) => at).filter(shows);
  return { rows: shown.slice(0, TEXT_ROWS_MOST).map((at) => ghostRow(rows, at, shows)), more: Math.max(0, shown.length - TEXT_ROWS_MOST) };
}

/**
 * Whether a report's text is a new one's (the starter's, or one as bare): no block with words or
 * media but its title, its header and the starter's placeholder section (data-doc-placeholder). An
 * Agent's first write of such a report is no change to review.
 */
export function isNewDocument(text) {
  const { units } = scan(text);
  const outside = (node) => {
    for (let at = node; at; at = at.parentNode) {
      if (!at.tagName) continue;
      if (attr(at, "data-doc-placeholder") !== undefined) return false;
      if (at.tagName === "header" || (attr(at, "class") ?? "").split(/\s+/).includes("doc-header")) return false;
    }
    return true;
  };
  const media = (node) => /^(img|picture|svg|canvas|video|audio|iframe|object|embed)$/.test(node.tagName ?? "") || (node.childNodes ?? []).some(media);
  return !units.some((unit) => outside(unit.node) && (treeText(unit.node) !== "" || media(unit.node)));
}

/**
 * The baseline with a commit of the reader's applied to it as it was to the file (`commit`: its
 * { opening, texts, units, touch, pageIds, seal, ids }), only what of it went into the file (`answer`, the
 * file's commit's: its `texts` and `units` by key): a text or an operation the file refused (a conflict,
 * held on a card) stays out of the baseline too, and of what a component wrote that partly went in, only the
 * parts that did (`wrote`), so that what the reader gives up there (用文件里的, 保留 Agent 的) is never the
 * baseline's (撤回 once wrote words the file never held, and took away a block whose deletion was refused);
 * of a list deleted item by item of which the file refused some, the items that went (`went`, their keys).
 * What of it the baseline cannot take (in blocks the Agent made or words it changed too) stays out. A text
 * the reader kept over the file's words (保留我的: its `before` the words the card showed, its `from` those the
 * reader's were written from) goes in from `from`, as the reader made it: what the reader kept is the
 * reader's; from its `before` where the baseline holds those very words (the review kept, 确认, while the card
 * stood: the new baseline holds the Agent's words, and from `from` the reader's met them as the Agent's). What
 * the reader said to do anyway (`force`: 仍然删除, 仍然转换类型, 仍然调整), over the unit as the card showed it in the
 * file, goes over the unit as the baseline holds it (its hash, and the hashes of the parts a component writes),
 * so that the reader's word is the reader's there too; one the baseline has no one unit of that id for, from the
 * hash the page saw, as any change. The baseline as it was when it fails.
 */
export function rebaseOnto(base, commit, answer = null) {
  const refused = (list) => new Map((Array.isArray(list) ? list : []).filter((entry) => entry?.status === "conflict").map((entry) => [entry.key, entry]));
  const heldTexts = refused(answer?.texts);
  const heldUnits = refused(answer?.units);
  const sent = (commit.texts ?? []).filter((entry) => !heldTexts.has(entry?.key));
  // The texts kept (保留我的) whose `before` the baseline holds: tried alone, giving no ids.
  const kept = sent.filter((entry) => typeof entry?.block?.from === "string");
  let holds = new Set();
  if (kept.length > 0) {
    try {
      const tried = commitEdits({ current: base, opening: commit.opening, texts: kept, pageIds: commit.pageIds, ids: false });
      holds = new Set(tried.texts.filter((entry) => entry.status === "applied").map((entry) => entry.key));
    } catch {
      // from `from`, each
    }
  }
  const texts = sent.map((entry) => (typeof entry?.block?.from === "string" && !holds.has(entry.key) ? { ...entry, block: { ...entry.block, before: entry.block.from } } : entry));
  let baseUnits = null;
  const overBase = (op) => {
    if (op?.force !== true) return op;
    const own = typeof op.unit?.id === "string" ? (baseUnits ??= scan(base).units).filter((unit) => unit.blockId === op.unit.id) : [];
    if (own.length !== 1) {
      const { force, ...rest } = op;
      return rest;
    }
    const [unit] = own;
    const parts = op.source && typeof op.source === "object" ? { parts: { ...op.parts, ...Object.fromEntries(Object.keys(op.source).filter((name) => typeof unit.parts?.[name] === "string").map((name) => [name, unit.parts[name]])) } } : {};
    return { ...op, hash: unitHash(base, unit), ...parts };
  };
  const units = (commit.units ?? []).flatMap((op) => {
    const held = heldUnits.get(op?.key);
    if (!held) return [overBase(op)];
    const went = Array.isArray(held.wrote) && op?.source && typeof op.source === "object" ? held.wrote.filter((name) => Object.hasOwn(op.source, name)) : [];
    if (went.length > 0) return [overBase({ ...op, source: Object.fromEntries(went.map((name) => [name, op.source[name]])) })];
    const items = Array.isArray(held.went) && op?.remove === true && Array.isArray(op.items) ? op.items.filter((ref) => held.went.includes(ref?.key)) : [];
    return items.map((ref, at) => ({ key: `${op.key}:${at}`, unit: ref, remove: true, hash: ref.hash ?? null }));
  });
  try {
    return commitEdits({ current: base, ids: true, ...commit, texts, units }).text;
  } catch {
    return base;
  }
}

/** The baseline with its title made `html`, as the sidebar's renaming writes it (applyEdits); as it was when it cannot be. */
export function retitledBase(base, html) {
  try {
    const block = scan(base).blocks.find((candidate) => candidate.kind === "title");
    if (!block) return base;
    const result = applyEdits({ current: base, edits: [{ id: block.id, parts: [{ keep: true, html }] }], ids: false });
    return result.ok ? result.text : base;
  } catch {
    return base;
  }
}
