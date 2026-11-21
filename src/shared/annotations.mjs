import { attr, hasClass } from "./html-tree.mjs";
import { BLOCK_ID, randomId } from "./ids.mjs";

// 批注 (docs/workbench.md "Annotations", docs/editor.md "Annotations"): the reader's suggestions for a
// local Agent, each about a piece of a report: words of its text, or blocks taken whole. One has
// words: an item with none is none (cleanItem). Kept in <workspace>/<slug>/annotations.json, never in the document's HTML:
//
//   { v: 1, items: [{ id, created, updated, text, anchor, done? }] }   (done: true once an Agent has acted on it: gallery notes done)
//   anchor: { kind: "text", blocks: [data-block-id…], quote, prefix, suffix }
//         | { kind: "blocks", blocks: [data-block-id…], quote }
//
// What the page and the server share, pure (no parser, no DOM): reading a block's text alike on both
// sides (the page from its DOM, editor/page/annotate/anchors.mjs; the server from the parsed file,
// treeText), finding an anchor's words again after edits (findQuote), the check that deletes an
// annotation with its text (checkAnnotations), the Markdown 复制批注 hands an Agent
// (annotationsMarkdown), and the numbers of the page's markers and card (stackItems, RAIL; where the
// column goes is editor/page/margin.mjs's).
//
// Text is compared with its white space taken out (squash): the page and the file break lines and
// space words differently around tags, and a quote is the same words either way. A block's text is
// its words with formulas as their TeX, runs of spaces as one, blocks inside it a line each.

export const FILE = "annotations.json";
export const VERSION = 1;
/** The most of a selection a text anchor quotes, and of a block anchor's text (for the copy only). */
export const QUOTE_MOST = 2000;
export const BLOCKS_QUOTE_MOST = 200;
/** The words kept before and after a quote, to tell two places with the same words apart. */
export const CONTEXT = 32;
/** A quote shorter than this is found only as it is (a few characters found "half" would be anywhere). */
export const EXACT_UNDER = 10;
/** How much of its context a quote not found as it is must still have beside it, on each side (characters). */
export const CONTEXT_KEPT = 3;
/** The most a suggestion holds. */
export const TEXT_MOST = 20000;

const BLANK = /[\s​﻿]/;
const FORMULA = /\\\(([\s\S]*?)\\\)|\\\[([\s\S]*?)\\\]|\$\$([\s\S]*?)\$\$/g;

/** Runs of white space as one space, the ends trimmed, zero-width characters out. */
export const tidy = (text) => String(text ?? "").replace(/[​﻿]/g, "").replace(/\s+/g, " ").trim();

/** Each line tidied, empty lines out, joined by line breaks: a text of several blocks. */
export const tidyLines = (text) => String(text ?? "").split("\n").map(tidy).filter(Boolean).join("\n");

/** `text` with all its white space out: how two texts are compared. */
export const squash = (text) => String(text ?? "").replace(/[\s​﻿]+/g, "");

/** `text` squashed, and where each of its characters is in `text`. */
export function glyphsOf(text) {
  const at = [];
  let squashed = "";
  for (let index = 0; index < text.length; index++) {
    if (BLANK.test(text[index])) continue;
    at.push(index);
    squashed += text[index];
  }
  return { squashed, at };
}

// ---------- reading a block's text (the server's side; the page's is anchors.mjs) ----------

const SKIP_TAGS = new Set(["script", "style", "template", "noscript", "svg", "head", "title"]);
/** Elements that are a line of their own in a block's text (the page reads the same ones). */
export const LINE_TAGS = new Set(["p", "li", "ul", "ol", "h1", "h2", "h3", "h4", "h5", "h6", "table", "tr", "td", "th", "caption", "summary", "details", "figure", "figcaption", "pre", "blockquote", "div", "section", "article", "aside", "dl", "dt", "dd", "hr", "br", "header", "footer", "nav", "main", "dialog"]);

/**
 * The text of a parsed element (parse5's tree, shared/html-tree.mjs) as a block's text is compared:
 * its words, a formula as its TeX, the lines of the blocks in it, no script, style or drawing.
 */
export function treeText(node) {
  let raw = "";
  const walk = (parent) => {
    for (const child of parent.childNodes ?? []) {
      if (child.nodeName === "#text") raw += child.value;
      if (!child.tagName || SKIP_TAGS.has(child.tagName)) continue;
      if (child.tagName === "button" && !hasClass(child, "doc-sheet-tab")) continue; // the page's own controls
      if (attr(child, "aria-hidden") === "true") continue;
      const line = LINE_TAGS.has(child.tagName);
      if (line) raw += "\n";
      walk(child.tagName === "template" ? child.content : child);
      if (line) raw += "\n";
    }
  };
  walk(node);
  // A formula as the page reads one (its TeX in \( \), or \[ \] for one shown apart: the page cannot
  // tell $$ from \[), so a quote of it is found on both sides and in the file by an Agent.
  return tidyLines(raw.replace(FORMULA, (_, inline, display, dollars) => (inline !== undefined ? ` \\(${inline}\\) ` : ` \\[${display ?? dollars}\\] `)));
}

// ---------- finding a quote ----------

// The longest common end of two strings (`a`'s end with `b`'s end), and the longest common start.
const commonEnd = (a, b) => {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) n++;
  return n;
};
const commonStart = (a, b) => {
  let n = 0;
  while (n < a.length && n < b.length && a[n] === b[n]) n++;
  return n;
};

// The most cells the alignment below works through (the quote's characters times the text's): a
// quote of 200 characters in a text of 20000; beyond, a quote not found as it is stays as it was.
const ALIGN_MOST = 4_000_000;
// What a character of the text inside the stretch that is none of the quote's costs, against 1 for
// one of the quote's kept: a word typed into the quote is bridged, a far-off piece of it is not.
const EXTRA = 0.1;

/**
 * The stretch of `hay` (squashed) that keeps the most of `needle`'s characters in their order, each
 * character of the stretch that is not one of them costing EXTRA: { start, end, kept }, or null.
 * One pass over the text, two rows of the quote's length.
 */
export function alignQuote(needle, hay) {
  const m = needle.length;
  const n = hay.length;
  if (m === 0 || n === 0) return null;
  let score = new Float64Array(m + 1);
  let kept = new Int32Array(m + 1);
  let from = new Int32Array(m + 1);
  let nextScore = new Float64Array(m + 1);
  let nextKept = new Int32Array(m + 1);
  let nextFrom = new Int32Array(m + 1);
  // Column 0: nothing of the text taken, every character of the quote skipped.
  for (let i = 0; i <= m; i++) { score[i] = 0; kept[i] = 0; from[i] = 0; }
  let best = null;
  for (let j = 1; j <= n; j++) {
    const char = hay[j - 1];
    nextScore[0] = 0;
    nextKept[0] = 0;
    nextFrom[0] = j; // an empty stretch, starting here
    for (let i = 1; i <= m; i++) {
      // The quote's character skipped (not in the text).
      let s = nextScore[i - 1];
      let k = nextKept[i - 1];
      let f = nextFrom[i - 1];
      // The text's character taken as one the quote does not have (inside the stretch only).
      if (kept[i] > 0) {
        const extra = score[i] - EXTRA;
        if (extra > s || (extra === s && from[i] > f)) { s = extra; k = kept[i]; f = from[i]; }
      }
      // Both taken: the same character.
      if (needle[i - 1] === char) {
        const start = kept[i - 1] > 0 ? from[i - 1] : j - 1;
        const both = score[i - 1] + 1;
        if (both > s || (both === s && start > f)) { s = both; k = kept[i - 1] + 1; f = start; }
      }
      nextScore[i] = s;
      nextKept[i] = k;
      nextFrom[i] = f;
    }
    if (nextKept[m] > 0 && (!best || nextScore[m] > best.score || (nextScore[m] === best.score && j - nextFrom[m] < best.end - best.start))) {
      best = { score: nextScore[m], kept: nextKept[m], start: nextFrom[m], end: j };
    }
    [score, nextScore] = [nextScore, score];
    [kept, nextKept] = [nextKept, kept];
    [from, nextFrom] = [nextFrom, from];
  }
  return best && { start: best.start, end: best.end, kept: best.kept };
}

/**
 * Where an anchor's quote is in `text` (a block's text, or several blocks' joined by line breaks):
 * { start, end, exact } (offsets in `text`), null when it is gone, or { unknown: true } when the
 * text is too long to look for a quote not found as it is (it is kept as it was).
 * 1. The quote as it is (white space aside): of several, the one whose prefix and suffix agree most, else the first.
 * 2. Not as it is (edited in part): the stretch keeping at least half of its characters in their
 *    order, no longer than one and a half times the quote (alignQuote), and standing where the quote
 *    stood: on each side what was around it is still right beside it (the last CONTEXT_KEPT
 *    characters of the prefix before it, the first of the suffix after it, with room between for
 *    words that replaced the quote's first or last ones), or, where it had nothing around it, the
 *    text's edge. So a quote deleted never moves onto other words that share its characters (a
 *    parallel sentence beside it), and one edited where what is around it was rewritten too is
 *    taken as gone. A quote under EXACT_UNDER characters is found only as it is.
 * With `exact`, only 1 (the page's first look, before it follows the reader's edit: editor/page/annotate/).
 */
export function findQuote(text, { quote, prefix = "", suffix = "" }, { exact = false } = {}) {
  const hay = glyphsOf(String(text ?? ""));
  const needle = squash(quote);
  if (!needle) return null;
  const span = (a, b, exact) => ({ start: hay.at[a], end: hay.at[b - 1] + 1, exact });
  const hits = [];
  for (let at = hay.squashed.indexOf(needle); at >= 0; at = hay.squashed.indexOf(needle, at + 1)) hits.push(at);
  if (hits.length > 0) {
    const before = squash(prefix);
    const after = squash(suffix);
    let pick = hits[0];
    let most = -1;
    for (const at of hits) {
      const agree = commonEnd(before, hay.squashed.slice(Math.max(0, at - before.length), at)) + commonStart(after, hay.squashed.slice(at + needle.length, at + needle.length + after.length));
      if (agree > most) { most = agree; pick = at; }
    }
    return span(pick, pick + needle.length, true);
  }
  if (exact || needle.length < EXACT_UNDER) return null;
  if (needle.length * hay.squashed.length > ALIGN_MOST) return { unknown: true };
  const found = alignQuote(needle, hay.squashed);
  if (!found || found.kept * 2 < needle.length || found.end - found.start > needle.length * 1.5) return null;
  if (!standsBetween(hay.squashed, found, squash(prefix), squash(suffix), Math.ceil(needle.length / 2))) return null;
  return span(found.start, found.end, false);
}

// Whether the stretch `found` of `hay` (squashed) stands where a quote with `before` and `after`
// around it stood: the end of `before` ends at most `slack` characters before it (what replaced the
// quote's first words), the start of `after` starts at most `slack` after it; for an empty side,
// the text's edge as near.
function standsBetween(hay, found, before, after, slack) {
  const tail = before.slice(-CONTEXT_KEPT);
  const head = after.slice(0, CONTEXT_KEPT);
  let left = !tail && found.start <= slack;
  for (let end = found.start; tail && !left && end >= Math.max(tail.length, found.start - slack); end--) {
    if (hay.slice(end - tail.length, end) === tail) left = true;
  }
  if (!left) return false;
  if (!head) return hay.length - found.end <= slack;
  for (let start = found.end; start <= Math.min(hay.length - head.length, found.end + slack); start++) {
    if (hay.slice(start, start + head.length) === head) return true;
  }
  return false;
}

/** An anchor's quote, prefix and suffix as `text` has them from `start` to `end`. */
export function excerptOf(text, start, end) {
  const quote = tidyLines(text.slice(start, end)).slice(0, QUOTE_MOST);
  const before = tidy(text.slice(0, start).replace(/\n/g, " "));
  const after = tidy(text.slice(end).replace(/\n/g, " "));
  return { quote, prefix: before.slice(Math.max(0, before.length - CONTEXT)), suffix: after.slice(0, CONTEXT) };
}

// ---------- the check: an annotation goes with its text ----------

/**
 * Where an anchor is in a report's units (`units`: [{ id (its data-block-id, or null), text, parent
 * (its index in units, or null) }], in page order): { at (the index of its first unit), offset,
 * anchor (as the file has it now: its blocks, its quote and what is around it) } or null when it is
 * gone, { unknown: true, at } when it cannot be told (kept as it is).
 * - text: the quote in its blocks' text (findQuote); none of its blocks there, the quote as it is
 *   found exactly once in the report, in the innermost block holding it (a block without an id yet:
 *   its blocks stay as they were, the page names it).
 * - blocks: kept while at least one of its blocks is there; its quote their text now.
 */
export function locateAnchor(anchor, units) {
  const index = new Map(units.map((unit, at) => [unit.id, at]).filter(([id]) => id));
  const present = [...new Set((anchor.blocks ?? []).filter((id) => index.has(id)))].sort((a, b) => index.get(a) - index.get(b));
  if (anchor.kind === "blocks") {
    if (present.length === 0) return null;
    const text = present.map((id) => units[index.get(id)].text).join("\n");
    return { at: index.get(present[0]), offset: 0, anchor: { kind: "blocks", blocks: present, quote: tidyLines(text).slice(0, BLOCKS_QUOTE_MOST) } };
  }
  if (present.length > 0) {
    let texts = present.map((id) => units[index.get(id)].text);
    let found = findQuote(texts.join("\n"), anchor);
    // Split by Enter in its middle: the words as they are, across its blocks and the one right after
    // them (begun in its own, gone on in that one: not words of their own further on).
    if (!found) {
      const next = unitAfter(units, index.get(present.at(-1)));
      const more = next === null || !units[next].id ? null : [...texts, units[next].text];
      const own = texts.join("\n").length;
      const split = more ? findQuote(more.join("\n"), anchor, { exact: true }) : null;
      if (split && split.start < own && split.end > own) {
        present.push(units[next].id);
        texts = more;
        found = split;
      }
    }
    const text = texts.join("\n");
    if (found?.unknown) return { unknown: true, at: index.get(present[0]) };
    if (!found) return null;
    // The blocks the words are in now: those of the joined text the stretch reaches.
    const blocks = [];
    let start = 0;
    texts.forEach((part, k) => {
      const end = start + part.length;
      if (found.start < end && found.end > start) blocks.push(present[k]);
      start = end + 1;
    });
    const first = present.indexOf(blocks[0]);
    const offset = found.start - texts.slice(0, first).reduce((sum, part) => sum + part.length + 1, 0);
    return { at: index.get(blocks[0]), offset, anchor: { kind: "text", blocks, ...excerptOf(text, found.start, found.end) } };
  }
  // None of its blocks: the words as they are, once in the report, in the innermost block holding them.
  const needle = squash(anchor.quote);
  if (!needle) return null;
  const holding = [];
  units.forEach((unit, at) => { if (squash(unit.text).includes(needle)) holding.push(at); });
  const innermost = holding.filter((at) => !holding.some((other) => other !== at && isInside(units, other, at)));
  const count = innermost.reduce((sum, at) => sum + occurrences(squash(units[at].text), needle), 0);
  if (count !== 1) return null;
  const [at] = innermost;
  const unit = units[at];
  const found = findQuote(unit.text, anchor);
  if (!found || found.unknown) return null;
  return { at, offset: found.start, anchor: { kind: "text", blocks: unit.id ? [unit.id] : [...(anchor.blocks ?? [])], ...excerptOf(unit.text, found.start, found.end) } };
}

// The unit right after unit `at` and what it holds (the next in page order not inside it), or null.
function unitAfter(units, at) {
  for (let next = at + 1; next < units.length; next++) if (!isInside(units, next, at)) return next;
  return null;
}

const occurrences = (hay, needle) => {
  let count = 0;
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + 1)) count++;
  return count;
};
// Whether unit `inner` is inside unit `outer` (by their parents).
const isInside = (units, inner, outer) => {
  for (let at = units[inner].parent; at !== null && at !== undefined; at = units[at]?.parent) if (at === outer) return true;
  return false;
};

const sameAnchor = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The check (docs/editor.md "Annotations"): each annotation against the report's units (locateAnchor),
 * those whose words or blocks are gone deleted, those found otherwise than they were rewritten to what
 * the report holds now, all in page order. `keep`: the ids of those a page has and the file may not
 * hold yet (its words, a block's id: the commit that writes them is on its way): each stands as it was
 * sent, placed by what is found of it, until the report has its words and all its blocks, and `waiting`
 * in the answer says which still stand so. Returns { items, dropped (those deleted), changed (whether
 * the file is to be written), places (id -> { at, offset }), waiting }.
 */
export function checkAnnotations(items, units, { keep = new Set() } = {}) {
  const named = new Set(units.map((unit) => unit.id));
  const placed = [];
  const dropped = [];
  const waiting = new Set();
  let changed = false;
  items.forEach((item, order) => {
    const found = locateAnchor(item.anchor, units);
    if (keep.has(item.id) && (!found || found.unknown || !(item.anchor.blocks ?? []).every((id) => named.has(id)))) {
      waiting.add(item.id);
      placed.push({ item, at: found?.at ?? Infinity, offset: found?.offset ?? 0, order });
      return;
    }
    if (!found) {
      dropped.push(item);
      changed = true;
      return;
    }
    if (found.unknown) {
      placed.push({ item, at: found.at, offset: 0, order });
      return;
    }
    const next = sameAnchor(found.anchor, item.anchor) ? item : { ...item, anchor: found.anchor };
    if (next !== item) changed = true;
    placed.push({ item: next, at: found.at, offset: found.offset, order });
  });
  placed.sort((a, b) => a.at - b.at || a.offset - b.offset || a.order - b.order);
  if (placed.some((entry, index) => entry.order !== index)) changed = true;
  return {
    items: placed.map((entry) => entry.item),
    dropped,
    changed,
    places: new Map(placed.map((entry) => [entry.item.id, { at: entry.at, offset: entry.offset }])),
    waiting,
  };
}

// ---------- what the file holds ----------

const ID = /^[a-z0-9]{8}$/;

/** A new annotation's id: eight letters and digits. */
export const newAnnotationId = () => randomId(8);

const strings = (list) => Array.isArray(list) && list.every((value) => typeof value === "string");

/** An anchor as the file keeps it, from what was sent, or null when it is none. */
export function cleanAnchor(anchor) {
  if (!anchor || (anchor.kind !== "text" && anchor.kind !== "blocks") || !strings(anchor.blocks ?? []) || typeof anchor.quote !== "string") return null;
  const blocks = [...new Set(anchor.blocks ?? [])].filter((id) => BLOCK_ID.test(id));
  const quote = anchor.kind === "text" ? tidyLines(anchor.quote).slice(0, QUOTE_MOST) : tidyLines(anchor.quote).slice(0, BLOCKS_QUOTE_MOST);
  if (anchor.kind === "text" && !squash(quote)) return null;
  return anchor.kind === "text"
    ? { kind: "text", blocks, quote, prefix: tidy(anchor.prefix ?? "").slice(-CONTEXT), suffix: tidy(anchor.suffix ?? "").slice(0, CONTEXT) }
    : { kind: "blocks", blocks, quote };
}

/**
 * Whether two anchors say the same for finding them again (their blocks, their quote, and the ends
 * of their context the check looks at), white space aside: the page tells the server of an anchor
 * that followed the reader's edit only when it says something else.
 */
export const sameWords = (a, b) => Boolean(a && b) && a.kind === b.kind && (a.blocks ?? []).join() === (b.blocks ?? []).join() && squash(a.quote) === squash(b.quote)
  && squash(a.prefix).slice(-CONTEXT_KEPT) === squash(b.prefix).slice(-CONTEXT_KEPT) && squash(a.suffix).slice(0, CONTEXT_KEPT) === squash(b.suffix).slice(0, CONTEXT_KEPT);

/** An annotation as the file keeps it, from what was sent (`now`: when it is saved), or null when it is none (no id, no anchor, no words). */
export function cleanItem(item, now = new Date().toISOString()) {
  if (!item || typeof item !== "object" || typeof item.id !== "string" || !ID.test(item.id) || typeof item.text !== "string") return null;
  const anchor = cleanAnchor(item.anchor);
  if (!anchor) return null;
  const text = item.text.replace(/\r\n?/g, "\n").slice(0, TEXT_MOST);
  if (!text.trim()) return null;
  return { id: item.id, created: typeof item.created === "string" ? item.created : now, updated: now, text, anchor, ...(item.done === true ? { done: true } : {}) };
}

/** `items` with those whose id `ids` holds marked done (`done` true) or not done (false), the others as they were. */
export function markItems(items, ids, done, now = new Date().toISOString()) {
  const named = new Set(ids);
  return items.map((item) => (named.has(item.id) && Boolean(item.done) !== done ? cleanItem({ ...item, done }, now) : item));
}

/**
 * `items` without those a request takes out: `ids` (those ids), `done` (every one marked done), `all`: { items (the rest),
 * removed (those taken out, as they were, for 撤销) }.
 */
export function withoutItems(items, { ids = [], done = false, all = false } = {}) {
  const named = new Set(ids);
  const takes = (item) => all || named.has(item.id) || (done && item.done === true);
  return { items: items.filter((item) => !takes(item)), removed: items.filter(takes) };
}

/** The ids of `ids` that no item of `items` has. */
export const unknownIds = (items, ids) => ids.filter((id) => !items.some((item) => item.id === id));

/** The annotations of a file's text (annotations.json), those it holds that are not annotations left out. */
export function readItems(text) {
  let data = null;
  try { data = JSON.parse(text); } catch {}
  if (!data || typeof data !== "object" || !Array.isArray(data.items)) return [];
  const seen = new Set();
  return data.items.filter((item) => {
    const clean = cleanItem(item, item?.updated);
    if (!clean || seen.has(clean.id)) return false;
    seen.add(clean.id);
    return true;
  }).map((item) => cleanItem(item, item.updated));
}

/** The file's text for `items` (none: no file, null). */
export const itemsText = (items) => (items.length === 0 ? null : `${JSON.stringify({ v: VERSION, items }, null, 2)}\n`);

// ---------- 复制批注 ----------

/** What the Markdown says, in the UI's language (the workbench passes them through t()). */
export const MARKDOWN_WORDS = {
  head: "以下是我对这份文档的批注，共 {0} 条。请逐条按“建议”修改底稿；每条给出它在文档里的位置、块的 data-block-id 和批注的原文。",
  headOne: "以下是我对这份文档的一条批注。请按“建议”修改底稿；它给出在文档里的位置、块的 data-block-id 和批注的原文。",
  report: "文档",
  source: "底稿",
  block: "块",
  whole: "（整块）",
  noId: "（还没有 id，按原文找）",
  suggestion: "建议",
  body: "正文",
  top: "页首",
  colon: "：",
  comma: "，",
};

const fill = (text, ...values) => text.replace(/\{(\d+)\}/g, (whole, index) => (index < values.length ? String(values[index]) : whole));

/**
 * 复制批注's Markdown for a local Agent: a line saying what it is, the report's title and source path,
 * then each annotation in page order: where it is (`where`: the tab, the headings above it, the
 * disclosure it is in; `top`: before the report's first heading, said 页首, which no tab or heading
 * named 正文 is taken for), its blocks' ids (as the file has them), its quote and the suggestion, each
 * of its lines a paragraph (blank lines in it make no more of them).
 * data: { title, path, items: [{ where: [text], top, blocks: [id], whole, quote, text }] }.
 */
export function annotationsMarkdown({ title, path, items }, words = MARKDOWN_WORDS) {
  const w = { ...MARKDOWN_WORDS, ...words };
  const head = items.length === 1 && w.headOne ? w.headOne : fill(w.head, items.length);
  const lines = [head, "", `- ${w.report}${w.colon}${title}`, `- ${w.source}${w.colon}${path}`];
  items.forEach((item, index) => {
    const where = item.where?.length ? item.where.join(" › ") : item.top ? w.top : w.body;
    const ids = item.blocks?.length ? item.blocks.map((id) => `\`data-block-id="${id}"\``).join(w.comma) + (item.whole ? w.whole : "") : w.noId;
    lines.push("", `## ${index + 1}. ${where}`, "", `${w.block}${w.colon}${ids}`, "");
    for (const line of String(item.quote ?? "").split("\n")) lines.push(`> ${line}`);
    const said = String(item.text ?? "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
    lines.push("", `${w.suggestion}${w.colon}${said[0] ?? ""}`);
    for (const line of said.slice(1)) lines.push("", line);
  });
  return `${lines.join("\n")}\n`;
}

// ---------- the margin ----------

/**
 * The margin: items stacked without overlapping, the active one at its own line, the others
 * pushed up above it and down below it. items: [{ ideal (top), height, marker (a 24px marker, else a
 * card), active }], in page order. Gaps: `markers` between two markers, `cards` next to a card;
 * nothing above `top` and nothing past `bottom` (the page's end: what would pass it goes up, so a
 * card near the end never makes the page longer; the top wins where both cannot hold); `obstacles`
 * ([{ top, bottom }]: the format bar's box where it reaches into the margin) are stepped over, on the
 * side nearer the item's line. Returns the tops, in the order given.
 */
export function stackItems(items, { markers = 4, cards = 8, top = 52, bottom = Infinity, obstacles = [] } = {}) {
  const order = items.map((item, index) => ({ ...item, index })).sort((a, b) => a.ideal - b.ideal || a.index - b.index);
  if (order.length === 0) return [];
  const gap = (a, b) => (a.marker && b.marker ? markers : cards);
  let k = order.findIndex((item) => item.active);
  if (k < 0) k = 0;
  order[k].top = order[k].ideal;
  for (let i = k + 1; i < order.length; i++) order[i].top = Math.max(order[i].ideal, order[i - 1].top + order[i - 1].height + gap(order[i - 1], order[i]));
  for (let i = k - 1; i >= 0; i--) order[i].top = Math.min(order[i].ideal, order[i + 1].top - gap(order[i], order[i + 1]) - order[i].height);
  // What would pass the page's end goes up (and what comes before it with it).
  let ceiling = bottom;
  for (let i = order.length - 1; i >= 0; i--) {
    order[i].top = Math.min(order[i].top, ceiling - order[i].height);
    ceiling = order[i].top - (i > 0 ? gap(order[i - 1], order[i]) : 0);
  }
  // What would go above the page's top room goes down instead, and what meets an obstacle goes to its
  // nearer side (above it only where that keeps clear of the item before); what follows goes with it.
  let floor = top;
  for (let i = 0; i < order.length; i++) {
    let at = Math.max(order[i].top, floor);
    for (const box of obstacles) {
      if (!(at < box.bottom && at + order[i].height > box.top)) continue;
      const above = box.top - cards - order[i].height;
      const below = box.bottom + cards;
      at = above >= floor && Math.abs(above - order[i].ideal) < Math.abs(below - order[i].ideal) ? above : below;
    }
    order[i].top = at;
    floor = at + order[i].height + (order[i + 1] ? gap(order[i], order[i + 1]) : 0);
  }
  const tops = new Array(items.length);
  for (const item of order) tops[item.index] = item.top;
  return tops;
}

/**
 * The measures of the cards standing beside the page: how far above its anchor a card stands, the gap under each, how much further
 * down a new one's anchor counts, the room under the last, to scroll it up to.
 */
export const CARD = Object.freeze({ above: 18, gap: 10, draft: 14, end: 50 });

/**
 * Where the cards stand, given [{ id, top (its anchor's), height, created }] and the id of the one in
 * front (or null). In page order (those level with each other, the one made first first), each
 * CARD.above above its anchor (one nearer the page's top than that stays there), pushed down by the one
 * above it with CARD.gap between them. The one in front, pushed down, comes back beside its anchor: those
 * right before it touching go up with it, all those after it follow. Returns [{ id, top }] in that order.
 */
export function cardTops(items, front = null) {
  const order = items.map((item) => ({ ...item })).sort((a, b) => a.top - b.top || (a.created < b.created ? -1 : a.created > b.created ? 1 : 0) || (a.id < b.id ? -1 : 1));
  let floor = 0;
  let moved = 0;
  let at = -1;
  order.forEach((item, index) => {
    if (item.top >= CARD.above) item.top -= CARD.above;
    const top = Math.max(item.top, floor);
    if (item.id === front) {
      moved = top - item.top;
      at = index;
    }
    item.top = top;
    floor = top + item.height + CARD.gap;
  });
  if (moved > 0) {
    let after = order[at];
    after.top -= moved;
    for (let index = at - 1; index >= 0; index--) {
      const item = order[index];
      if (after.top > item.top + item.height + CARD.gap) break;
      item.top -= moved;
      after = item;
    }
    for (let index = at + 1; index < order.length; index++) order[index].top -= moved;
  }
  return order.map(({ id, top }) => ({ id, top }));
}

/**
 * The numbers of 批注 on the page (docs/editor.md "Annotations"): a marker's size; where the markers
 * stand, from the column's right edge, in its own 64px gutter, 5px right of a block anchor's bar (level
 * with a table's corner + at +2 to +20, which stands under the table); where that bar stands (left of
 * the section bar's line at +12 to +16); the card's width by its words or blocks, in the column, where
 * the margin has no room for cards (those are margin.mjs's: MARGIN.card).
 */
export const RAIL = Object.freeze({ marker: 24, markerAt: 10, bar: 7, card: 280 });

/**
 * Where a marker stands across a window `width` wide, the column's right edge being `right`: `markerAt`
 * right of it, or at `clear` where that is further right (past a section's strip, for what is in that
 * section), inside the window (at the column's edge, in it, where the gutter is too narrow). The button
 * beside a block stands here too (handle/): it and the marker it becomes are one place.
 */
export const markerLeft = (right, width, clear = 0) => Math.max(right - RAIL.marker, Math.min(Math.max(right + RAIL.markerAt, clear), width - RAIL.marker - 2));

/** The top of a marker in the middle of `line` ({ top, height }): a block's first line, or several blocks. */
export const markerTop = (line) => line.top + (line.height - RAIL.marker) / 2;
