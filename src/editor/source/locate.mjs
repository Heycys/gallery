import { parse } from "parse5";
import { commonPrefix, commonSuffix } from "./merge.mjs";
import { blockIdSpans } from "./units.mjs";

// Finding a block of the version the page opened in the file as it is now (commitEdits, for what
// the page names by that version alone): by its exact text, told apart from its twins by what comes
// before it, or by what surrounds it (counterpart). Both read the two versions without their block
// ids (`idBlind`), as unitHash does: ids given in between (an export, add-block-ids.mjs) change no block's
// text, so they never make a block that is still there look gone, changed or moved.

// A source read without its block ids: { text, at(offset) the place in `text` of an offset of the
// source, source(offset) the offset in the source of a place in `text` }. The last few are kept, as
// one commit reads the same two versions for every block it looks for.
const readings = new Map();
function idBlind(source) {
  const known = readings.get(source);
  if (known) return known;
  const spans = /data-block-id/i.test(source) ? blockIdSpans(source, [parse(source, { sourceCodeLocationInfo: true })]) : [];
  let text = "";
  let cursor = 0;
  let removed = 0;
  const places = []; // [{ at: the span's place in text, removed: the length removed up to its end }]
  for (const span of spans) {
    text += source.slice(cursor, span.start);
    cursor = span.end;
    removed += span.end - span.start;
    places.push({ at: text.length, end: span.end, removed });
  }
  text += source.slice(cursor);
  const reading = {
    text,
    // An offset of the source (never inside an id: blocks start and end outside start tags).
    at: (offset) => offset - (places.findLast((place) => place.end <= offset)?.removed ?? 0),
    // A place in the text: the source's offset of the character there (after an id taken out there).
    source: (at) => at + (places.findLast((place) => place.at <= at)?.removed ?? 0),
  };
  readings.set(source, reading);
  while (readings.size > 4) readings.delete(readings.keys().next().value);
  return reading;
}

// The file changed: find the block's original text in the current file. Text that repeats (in
// the file now or in the version the page opened) is told apart by the text right before it, so
// a block the file changed is never mistaken for its twin elsewhere. Returns where `point` (an
// offset of the block in `base`, its start by default) is in `current`; -2: ambiguous, -1: not found.
export function locate(base, current, block, point = block.start) {
  const [then, now] = [idBlind(base), idBlind(current)];
  const start = then.at(block.start);
  const needle = then.text.slice(start, then.at(block.end));
  const found = (hit) => now.source(hit + then.at(point) - start);
  const find = (text) => {
    const hits = [];
    for (let index = text.indexOf(needle); index >= 0; index = text.indexOf(needle, index + 1)) hits.push(index);
    return hits;
  };
  const hits = find(now.text);
  if (hits.length <= 1 && find(then.text).length <= 1) return hits.length === 1 ? found(hits[0]) : -1;
  const context = then.text.slice(Math.max(0, start - 120), start);
  const matching = hits.filter((hit) => now.text.slice(Math.max(0, hit - context.length), hit) === context);
  if (matching.length === 1) return found(matching[0]);
  return hits.length > 1 ? -2 : -1;
}

// The block's text changed in the file too: the current block of the same tag whose surrounding
// text matches best is its counterpart, if it wins clearly. Used to show the reader both versions.
export function counterpart(base, current, block, candidates) {
  const span = 400;
  const [then, now] = [idBlind(base), idBlind(current)];
  const [start, end] = [then.at(block.start), then.at(block.end)];
  const before = then.text.slice(Math.max(0, start - span), start);
  const after = then.text.slice(end, end + span);
  const scored = candidates
    .filter((other) => other.tag === block.tag)
    .map((other) => {
      const [from, to] = [now.at(other.start), now.at(other.end)];
      return { other, score: commonSuffix(before, now.text.slice(Math.max(0, from - span), from)) + commonPrefix(after, now.text.slice(to, to + span)) };
    })
    .sort((a, b) => b.score - a.score);
  const [best, second] = scored;
  return best && best.score >= 40 && best.score - (second?.score ?? 0) >= 20 ? best.other : null;
}

// Whether two pieces of source say much the same: their words (tags left out), as a block edited
// since still does and another block does not. Dice's coefficient of their pairs of characters, at
// least one half; two with no words at all (a chart, a divider) cannot be told apart by them.
export function resembles(a, b) {
  const words = (source) => source.replace(/<[^>]*>/g, " ").replace(/&(?:[a-z]+|#\d+);/gi, " ").replace(/\s+/g, " ").trim();
  const x = words(a);
  const y = words(b);
  if (!x || !y) return !x && !y;
  if (x.length < 2 || y.length < 2) return x === y;
  const pairs = (text) => {
    const counts = new Map();
    for (let index = 0; index < text.length - 1; index++) counts.set(text.slice(index, index + 2), (counts.get(text.slice(index, index + 2)) ?? 0) + 1);
    return counts;
  };
  const theirs = pairs(y);
  let shared = 0;
  for (const [pair, count] of pairs(x)) shared += Math.min(count, theirs.get(pair) ?? 0);
  return (2 * shared) / (x.length - 1 + y.length - 1) >= 0.5;
}
