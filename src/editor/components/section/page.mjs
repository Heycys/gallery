import { UNIT, boxKind, holdsBlocks, isHost, newContainer, newHost, placeBefore, unitsOf, withLeads } from "../../page/core.mjs";
import { outerOf } from "../../page/block-info.mjs";
import { caretAt } from "../../page/caret.mjs";
import { isTex } from "../math/index.mjs";
import { accepts, boxRole } from "../registry.mjs";
import { begin, done, made } from "../../page/made.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// 分区 on the page. A section is a container of ordinary blocks, like a highlight panel without a
// look of its own: a heading in it (its title, when it has one) and a divider line at its top are
// blocks like any other. It stands in the page or a Sheet panel only. A new one ("在下方新建分区")
// holds one empty paragraph to write in; blocks next to each other there can become one ("组成新分区");
// dissolving one ("解散分区", "解散所在分区" in the menu of a block in it) leaves its blocks where it
// was. Its handle is the bar along its right side (handle/).

const isSection = (node) => node?.nodeType === 1 && node.localName === "section" && boxKind(node) === "section";
const inRoot = (node) => Boolean(node?.parentElement?.hasAttribute("data-ge-box")) && boxRole(boxKind(node.parentElement)) === "root";

/** A new section after `unit` (a block standing in the page or a Sheet panel), holding one empty paragraph. Returns { focus: the paragraph, created }. */
export function sectionAfter(unit) {
  begin();
  const next = made(newContainer(unit.ownerDocument, "section"));
  const paragraph = newHost(unit.ownerDocument, "paragraph");
  next.append(paragraph);
  unit.after(next);
  return done(paragraph);
}

/**
 * The section `unit` stands in, the innermost, itself when it is one, or null: none is around it, or
 * only past a detail card, which stands for itself (outerOf).
 */
export function sectionOf(unit) {
  for (let node = unit; node; node = outerOf(node)) if (isSection(node)) return node;
  return null;
}

/**
 * "解散分区" for a section straight in the page or a Sheet panel: null when it does not apply,
 * otherwise why it cannot be done, or "".
 */
export function unwrapCheck(section) {
  if (!isSection(section) || !section.matches(UNIT) || !inRoot(section)) return null;
  if (section.hasAttribute("data-ge-keep-own")) return t("这个分区被脚本或链接用到，不能解散");
  return [...section.children].every(holdsBlocks) ? "" : t("分区里有不能移动的内容（例如脚本），不能解散");
}

/** The section dissolving from `unit` takes: the innermost around it unwrapCheck applies to, so that a section in a section goes with the one around it, or null. */
export function dissolvesFrom(unit) {
  for (let section = sectionOf(unit); section; section = sectionOf(outerOf(section))) if (unwrapCheck(section) !== null) return section;
  return null;
}

/**
 * "组成新分区" for blocks (in document order): null when they do not all stand straight in the page
 * or a Sheet panel, otherwise why they cannot become one section, or "". They must be neighbours in
 * one box, with nothing left out between them: a selection with gaps is not quietly completed.
 */
export function wrapCheck(units) {
  if (units.length === 0 || !units.every(inRoot)) return null;
  const box = units[0].parentElement;
  if (units.some((unit) => unit.parentElement !== box)) return t("只有同一层里的块能组成分区");
  if (units.some((unit) => !accepts("section", unit.getAttribute("data-ge-unit-kind")))) return t("分区里不能再放分区或选项卡区块");
  const blocks = unitsOf(box);
  const first = blocks.indexOf(units[0]);
  return units.every((unit, index) => blocks[first + index] === unit) ? "" : t("只有相邻的块能组成分区：中间还有没选中的块");
}

/** Blocks that pass wrapCheck, in a new section where they stood. Returns { focus: the section, created }. */
export function wrapSection(units) {
  begin();
  const section = made(newContainer(units[0].ownerDocument, "section"));
  const parts = units.flatMap((unit) => withLeads(unit));
  parts[0].before(section);
  section.append(...parts);
  return done(section);
}

// A block the caret can stand in: a text block, not a display formula, where nothing is typed.
const takesCaret = (node) => isHost(node) && !isTex(node);
// The block of a section that takes the reader once it is dissolved: its first that takes the caret, or its first block.
const firstOfSection = (section) => [...section.children].find(takesCaret) ?? [...section.children].find(holdsBlocks) ?? null;

/** A section's blocks where it was, the section gone (with its identity). Returns { focus: its first block, created }. */
export function unwrapSection(section) {
  const focus = firstOfSection(section);
  const moving = [...section.children];
  begin();
  placeBefore(section.parentElement, moving, withLeads(section)[0]);
  for (const part of withLeads(section)) part.remove();
  return done(focus);
}

/**
 * The block menu's section commands, with what the editor gives it: struct (a structural undo
 * step), say, and blocks() (the block handles and selection, blocks.mjs).
 */
export function create({ struct, say, blocks }) {
  // A new section holding one empty paragraph, right after a block.
  function addAfter(unit) {
    blocks().clear();
    const result = struct([unit.parentElement], [], () => {
      const { focus, created } = sectionAfter(unit);
      return { touched: [focus], focus, created };
    });
    caretAt(result.focus, "start");
    say(t("已新建分区 · 标题、分割线都可以按需加"));
  }

  // Blocks next to each other in the page or a Sheet panel, put into a new section where they stand
  // (block-menu/ checks wrapCheck first), one undo step; the section is selected.
  function wrap(units) {
    blocks().clear();
    const result = struct([units[0].parentElement], [], () => {
      const { focus: section, created } = wrapSection(units);
      return { touched: [], focus: section, select: units, created }; // undo selects the blocks again
    });
    blocks().select(result.focus, { quiet: true });
    say(t("已把{0}组成新分区 · 标题、分割线都可以按需加 · Ctrl+Z 撤销", units.length > 1 ? t(" {0} 块", units.length) : t("这一块")));
  }

  // A section dissolved: its blocks where it was, one undo step. Asked from blocks in it (`from`: the
  // menu of a block, which may stand far down a long section), those stay selected, undo and redo
  // selecting them again, and the page stays where it is; asked from the section, its first text block
  // takes the caret, undo and redo bringing it back there (its first block selected, when none is).
  function unwrap(section, from = null) {
    blocks().clear();
    const first = firstOfSection(section);
    const select = from ?? (first && !takesCaret(first) ? first : null);
    const result = struct([section, section.parentElement], first && takesCaret(first) ? [first] : [], () => {
      const { focus, created } = unwrapSection(section);
      return { touched: focus && takesCaret(focus) ? [focus] : [], focus, created, ...(select ? { select, reselect: true } : {}) };
    });
    if (from) blocks().select(from, { quiet: true });
    else if (result.focus && takesCaret(result.focus)) caretAt(result.focus, "start");
    else if (result.focus) blocks().select(result.focus, { quiet: true });
    say(t("已解散分区，内容留在原处 · Ctrl+Z 撤销"));
  }

  return { sectionOps: { addAfter, wrap, unwrap, wrapCheck, unwrapCheck, sectionOf, dissolvesFrom } };
}
