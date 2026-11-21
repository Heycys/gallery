import { HEADING, LEFT_OUT, headingText } from "../outline/read.mjs";
import { UNIT, unitsOf } from "../core.mjs";
import { CHAPTER, LEADS_CHAPTER } from "../../components/registry.mjs";
import { FOLDED } from "../folded.mjs";

// What folding a heading's section takes (docs/editor.md, "Folding a heading's section"), pure so the
// unit tests hold it (tests/unit/heading-folds.mjs); the tool that folds is index.mjs. A heading the
// outline lists, standing straight in a box, folds what follows it in that box up to the first block
// that ends it: a heading of its level or higher, or a block holding one the outline lists (a section,
// a tabs area, a row of columns, a disclosure, a highlight block…), the outline's rule of what nests
// under a heading (outline/tree.mjs treeOf), so the fold and the outline say the same of a section.
// What it hides is all that shows of the section, its blocks and whatever else stands among them
// (hiddenAfter); what ends it is a block.

export { FOLDED };

/** A heading's level, 1-4. */
export const levelOf = (heading) => Number(heading.localName[1]);

const kindOf = (node) => node.getAttribute("data-ge-unit-kind");

/** Whether a node is a heading that folds: one the outline lists, standing straight in a box, with words. */
export function foldable(node) {
  return node?.nodeType === 1 && node.matches(HEADING) && node.matches(UNIT) && !node.closest(LEFT_OUT)
    && Boolean(node.parentElement?.hasAttribute("data-ge-box")) && headingText(node) !== "";
}

/** Whether `unit` ends a section of level `level`: a heading of that level or higher, or a block holding one the outline lists. */
export function ends(unit, level) {
  if (unit.matches(HEADING)) return levelOf(unit) <= level;
  for (const heading of unit.querySelectorAll(HEADING)) {
    if (levelOf(heading) <= level && !heading.closest(LEFT_OUT) && headingText(heading) !== "") return true;
  }
  return false;
}

/** The units after `heading` in its box that are its section (at `level`, its own by default), the one ending it not among them. */
export function sectionAfter(heading, level = levelOf(heading)) {
  const box = heading.parentElement;
  if (!box) return [];
  const out = [];
  let past = false;
  for (const unit of unitsOf(box)) {
    if (!past) {
      past = unit === heading;
      continue;
    }
    if (ends(unit, level)) break;
    out.push(unit);
  }
  return out;
}

// What shows nothing of itself where it stands: no fold hides it (a detail card's dialog opens over
// the page from its link, wherever that is; the editor's own elements are its).
const SHOWS_NOTHING = "script, style, template, noscript, link, meta, dialog, [data-doc-dev]";

/**
 * What folding `heading` hides: every element after it in its box up to the unit ending its section
 * (sectionAfter), its units and whatever else shows there, a block or not (an <h4> the parser closed
 * with an </h3>, which the file has no end tag of its own for; a <header>, a <form>, an element of the
 * report's own name around blocks), so nothing of the section stays in sight; not what shows nothing.
 */
export function hiddenAfter(heading, level = levelOf(heading)) {
  const out = [];
  for (let node = heading.nextElementSibling; node; node = node.nextElementSibling) {
    if (node.matches(UNIT) && ends(node, level)) break;
    if (!node.matches(SHOWS_NOTHING)) out.push(node);
  }
  return out;
}

/** Nodes in document order, each once, none inside another. */
export function inOrder(nodes) {
  const set = [...new Set(nodes)];
  return set.filter((node) => !set.some((other) => other !== node && other.contains(node)))
    .sort((a, b) => (a.compareDocumentPosition(b) & 4 ? -1 : 1)); // 4: DOCUMENT_POSITION_FOLLOWING
}

/**
 * What an operation that takes blocks away whole takes for `units`: each folded heading with what it
 * hides (isFolded(heading), hiddenBy(heading): the units its fold hides, those of folds inside it too),
 * in document order. A folded heading whose box is a chapter (a section) of which it and what it hides
 * are every unit, but for dividers before it, stands for that section: the section is taken.
 */
export function takenWith(units, { isFolded, hiddenBy }) {
  const out = [];
  for (const unit of units) {
    out.push(unit);
    if (isFolded(unit)) out.push(...hiddenBy(unit));
  }
  for (const unit of [...out]) {
    const box = unit.parentElement;
    if (!isFolded(unit) || !box?.matches(UNIT) || !CHAPTER.has(kindOf(box))) continue;
    const covered = new Set([unit, ...hiddenBy(unit)]);
    const all = unitsOf(box);
    const at = all.indexOf(unit);
    if (all.every((each, index) => covered.has(each) || (index < at && LEADS_CHAPTER.has(kindOf(each))))) out.push(box);
  }
  return inOrder(out);
}

/**
 * Where Ctrl+Shift+↑/↓ takes a folded heading (its section with it): past the next section of its
 * level going down (the block after what it hides, which ends it, and what follows that up to the
 * next block ending a section of its level), past the one before going up (back to the block ending a
 * section of its level, or the box's first block, up to the block before it). `list`: the blocks it
 * moves among, in order. { first, last } of what it goes past, or null where there is none.
 */
export function stepOver(heading, delta, list = unitsOf(heading.parentElement)) {
  const level = levelOf(heading);
  const at = list.indexOf(heading);
  if (at < 0) return null;
  if (delta > 0) {
    const from = at + 1 + sectionAfter(heading).length;
    if (from >= list.length) return null;
    let to = from;
    while (to + 1 < list.length && !ends(list[to + 1], level)) to++;
    return { first: list[from], last: list[to] };
  }
  if (at === 0) return null;
  let from = at - 1;
  while (from > 0 && !ends(list[from], level)) from--;
  return { first: list[from], last: list[at - 1] };
}

/**
 * The key a folded heading is kept by: `b:<block id>`, or with none `t:<tag>:<words>#<n>`, n its place
 * among the foldable headings of its tag and words (`all`, in document order; with an id or not).
 */
export function keyOf(heading, all) {
  const id = heading.getAttribute("data-block-id");
  if (id) return `b:${id}`;
  const text = headingText(heading);
  const same = all.filter((each) => each.localName === heading.localName && headingText(each) === text);
  return `t:${heading.localName}:${text}#${Math.max(0, same.indexOf(heading))}`;
}

/** The heading of `all` a key names (keyOf), or null: by its block id, or the n-th of its tag and words, with an id or not. */
export function headingOf(key, all) {
  if (key.startsWith("b:")) return all.find((each) => each.getAttribute("data-block-id") === key.slice(2)) ?? null;
  const match = /^t:(h[1-4]):([\s\S]*)#(\d+)$/.exec(key);
  if (!match) return null;
  const [, tag, text, n] = match;
  return all.filter((each) => each.localName === tag && headingText(each) === text)[Number(n)] ?? null;
}
