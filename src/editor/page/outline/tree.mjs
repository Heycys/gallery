// The outline's model (outline/index.mjs reads the page into entries; this file is pure, so the unit
// tests hold it: tests/unit/outline.mjs): the tree of headings, the rows it shows with what is folded,
// the row that marks the current heading, the keys that move through the rows, and the strip's lines.
//
// An entry is one of:
//   { kind: "heading", key, level (1-4), text, ref }   a heading block
//   { kind: "scope", entries }                         a box that keeps its headings to itself: a row
//                                                      of columns, a disclosure, a tab's panel
//   { kind: "tabs", key, tabs: [{ key, text, shown, ref, entries }] }
//                                                      a tabs area, its tabs in their row's order
// A node of the tree: { key, kind: "heading" | "tab", text, ref, shown (a tab), children }.

// The highest level (the smallest number) of the headings in `entries`, Infinity for none.
function topLevel(entries) {
  let level = Infinity;
  for (const entry of entries) {
    if (entry.kind === "heading") level = Math.min(level, entry.level);
    else if (entry.kind === "scope") level = Math.min(level, topLevel(entry.entries));
    else if (entry.kind === "tabs") for (const tab of entry.tabs) level = Math.min(level, topLevel(tab.entries));
  }
  return level;
}

/**
 * The tree of `entries`: a heading closes the open ones of its level and deeper and nests under the one
 * left open, so a level the report skips does not indent twice (h2 then h4 is one step) and a report
 * starting at h3 has its h3s at the top. A scope (a row of columns, a disclosure) stands where its
 * highest heading would: it closes the open headings of that level and deeper, and its headings nest
 * under what is left open; when it ends its own headings are closed, so what follows goes on under
 * what was open before it (a column's h3 never takes in the section's next paragraphs' headings), and
 * the outline keeps the page's order. A tabs area too: a node per tab that holds a heading (the others
 * are left out; an area with none adds nothing), in the tab row's order, each tab's headings under it.
 */
export function treeOf(entries) {
  const roots = [];
  const stack = []; // { level, node }: the headings open
  const into = () => (stack.length ? stack.at(-1).node.children : roots);
  const close = (level) => { while (stack.length && stack.at(-1).level >= level) stack.pop(); };
  for (const entry of entries) {
    if (entry.kind === "scope") {
      close(topLevel(entry.entries));
      into().push(...treeOf(entry.entries));
    } else if (entry.kind === "heading") {
      close(entry.level);
      const node = { key: entry.key, kind: "heading", text: entry.text, ref: entry.ref ?? null, children: [] };
      into().push(node);
      stack.push({ level: entry.level, node });
    } else if (entry.kind === "tabs") {
      close(topLevel([entry]));
      for (const tab of entry.tabs) {
        const children = treeOf(tab.entries);
        if (children.length) into().push({ key: tab.key, kind: "tab", text: tab.text, shown: Boolean(tab.shown), ref: tab.ref ?? null, children });
      }
    }
  }
  return roots;
}

/** The tree's nodes in reading order (a node, then what it holds). */
export function nodesOf(tree, out = []) {
  for (const node of tree) {
    out.push(node);
    nodesOf(node.children, out);
  }
  return out;
}

/** The keys of the tree's nodes. */
export const keysOf = (tree) => new Set(nodesOf(tree).map((node) => node.key));

/**
 * The rows the outline shows: [{ node, depth, parent (the parent's row, -1 at the top) }], what a
 * folded node (its key in `folded`) holds left out.
 */
export function rowsOf(tree, folded = new Set(), depth = 0, parent = -1, out = []) {
  for (const node of tree) {
    const index = out.length;
    out.push({ node, depth, parent });
    if (node.children.length && !folded.has(node.key)) rowsOf(node.children, folded, depth + 1, index, out);
  }
  return out;
}

/** The nodes from the top of the tree down to `node` (null when it is not in it). */
export function pathTo(tree, node, chain = []) {
  for (const child of tree) {
    const path = [...chain, child];
    if (child === node) return path;
    const found = pathTo(child.children, node, path);
    if (found) return found;
  }
  return null;
}

/**
 * The row that marks the current heading (`path`: pathTo it): the first folded node on the way to it
 * (the heading is out of sight inside it), else the heading's own row; -1 for none.
 */
export function markedRow(rows, path, folded = new Set()) {
  if (!path?.length) return -1;
  const shown = path.find((node) => node.children.length && folded.has(node.key) && node !== path.at(-1)) ?? path.at(-1);
  return rows.findIndex((row) => row.node === shown);
}

/** What the outline draws of the tree, to tell whether it changed: keys, kinds, texts, depths, tabs shown. */
export function signatureOf(tree) {
  const parts = [];
  const walk = (nodes, depth) => {
    for (const node of nodes) {
      parts.push(`${depth}\u0001${node.kind}\u0001${node.key}\u0001${node.text}\u0001${node.shown ? 1 : 0}`);
      walk(node.children, depth + 1);
    }
  };
  walk(tree, 0);
  return parts.join("\u0002");
}

/**
 * A key in the outline (a tree of rows: aria's tree view): what it does at row `index` of `rows`.
 * ↑/↓ the row before or after, Home/End the first or last; → unfolds a folded row, else goes to its
 * first child; ← folds an open row, else goes to its parent; Enter or Space jumps there. Returns
 * { focus } (a row's index), { fold }, { unfold } (a node), { jump } (a node), or null (not its key).
 */
export function keyAction(rows, index, key, folded = new Set()) {
  if (!rows.length) return null;
  const at = Math.max(0, Math.min(index, rows.length - 1));
  const row = rows[at];
  const parent = row.node.children.length > 0;
  switch (key) {
    case "ArrowDown": return { focus: Math.min(rows.length - 1, at + 1) };
    case "ArrowUp": return { focus: Math.max(0, at - 1) };
    case "Home": return { focus: 0 };
    case "End": return { focus: rows.length - 1 };
    case "ArrowRight":
      if (parent && folded.has(row.node.key)) return { unfold: row.node };
      if (parent && rows[at + 1]?.parent === at) return { focus: at + 1 };
      return { focus: at };
    case "ArrowLeft":
      if (parent && !folded.has(row.node.key)) return { fold: row.node };
      return { focus: row.parent >= 0 ? row.parent : at };
    case "Enter":
    case " ": return { jump: row.node };
    default: return null;
  }
}


/**
 * The current heading of `tops` (each heading's top in the window, in the outline's order; null for
 * one with no box: in a hidden tab, a closed disclosure): the one furthest down of those whose top
 * has passed `line`, the first in order of those level with it (headings side by side in columns);
 * -1 for none (above the first).
 */
export function currentOf(tops, line) {
  let found = -1;
  tops.forEach((top, index) => {
    if (top === null || top > line) return;
    if (found < 0 || top > tops[found]) found = index;
  });
  return found;
}

/**
 * The line (px below the window's top) a heading's top must have passed to be the current one, with
 * the page scrolled to `scrollY` of `maxScroll`, the window `view` high: `base` while the page has
 * more than a window still to go, then coming down with the scroll to the window's bottom at the end
 * (the last window's headings, which can never reach `base`, each get their turn, the last one at the
 * very end). A page that scrolls less than a window comes down over what it scrolls; one that does
 * not scroll keeps `base`.
 */
export function spyLine({ scrollY, maxScroll, view, base }) {
  const ramp = Math.min(view, maxScroll);
  const left = Math.max(0, maxScroll - scrollY);
  if (ramp <= 0 || left >= ramp) return base;
  return base + (view - base) * (1 - left / ramp);
}

/**
 * Where a list scrolled to `scrollTop` (`view` px of it in view, `full` in all; `fade.top` and
 * `fade.bottom` px at its ends faded while there is more) goes to keep a row at `top` (`row` px high)
 * in its band: at least `least` px below the clear view's top, at most a third of the clear view down,
 * so reading down the rows to come fill two thirds of it, and reading up `least` px of rows stand above
 * it. As little as that takes (a row for each heading passed), centered in what is clear where the
 * view is too short for the band; null where it is in the band already.
 */
export function followTop({ top, row, scrollTop, view, full, least, fade = { top: 0, bottom: 0 } }) {
  const clear = view - fade.top - fade.bottom;
  const at = top - scrollTop - fade.top; // the row's top in the clear view
  let to = scrollTop;
  if (clear < row + 2 * least) to = top - fade.top - (clear - row) / 2;
  else {
    const third = Math.max(least, Math.round(clear / 3));
    if (at > third) to = top - fade.top - third;
    else if (at < least) to = top - fade.top - least;
  }
  to = Math.round(Math.max(0, Math.min(full - view, to)));
  return Math.abs(to - scrollTop) < 1 ? null : to;
}

/**
 * Where a jump from scrollY `from` to `to` (a window `view` high) starts its smooth scroll: more than
 * two windows away, a window short of `to` (gone to at once: the browser's smooth scroll takes 1.5s
 * over 14000px), else null (the whole way smoothly).
 */
export function glideFrom(from, to, view) {
  const distance = to - from;
  return Math.abs(distance) > 2 * view ? to - Math.sign(distance) * view : null;
}

// The strip's lines: 2px each, 6px apart (4 at the least), as wide as the row is shallow, 240px at the most.
export const TICK = Object.freeze({ line: 2, gap: 6, least: 4, most: 240, widths: [16, 12, 9, 6] });

/**
 * The strip's lines for `rows` in `height` px (TICK.most at the most): { gap, ticks: [{ row, width }] }.
 * More than fit 6px apart: the gap shrinks, down to 4px; then the deepest levels are left out, one at
 * a time, until they fit (the gap as wide again as what is left allows); a run of top-level rows still
 * too long is taken every so many, over the whole list. `marked` (a row's index, -1 for none): the
 * line that marks it, its own or, left out, the last line before it (its nearest ancestor shown):
 * `current`, a tick's index or -1.
 */
export function ticksOf(rows, height, marked = -1, { line, gap, least, most, widths } = TICK) {
  const room = Math.min(height, most);
  const span = (count, space) => count * line + Math.max(0, count - 1) * space;
  const spread = (count) => (count > 1 ? Math.max(least, Math.min(gap, Math.floor((room - count * line) / (count - 1)))) : gap);
  let shown = rows.map((row, index) => ({ ...row, index }));
  let space = gap;
  if (span(shown.length, gap) > room) {
    space = spread(shown.length);
    let deepest = Math.max(0, ...shown.map((row) => row.depth));
    while (span(shown.length, space) > room && deepest > 0) {
      deepest--;
      shown = shown.filter((row) => row.depth <= deepest);
      space = spread(shown.length);
    }
    if (span(shown.length, space) > room) {
      const count = Math.max(1, Math.floor((room + space) / (line + space)));
      const step = shown.length / count;
      shown = Array.from({ length: count }, (_, at) => shown[Math.floor(at * step)]);
    }
  }
  let current = -1;
  if (marked >= 0) shown.forEach((row, at) => { if (row.index <= marked) current = at; });
  return {
    gap: space,
    current,
    ticks: shown.map((row) => ({ row: row.index, width: widths[Math.min(row.depth, widths.length - 1)] })),
  };
}
