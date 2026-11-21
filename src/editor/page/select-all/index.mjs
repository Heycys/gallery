import { BOXED, BOX_NAMES, KIND_NAMES, isLead, isSelectable, selectAllOf } from "../../components/registry.mjs";
import { UNIT, boxKind, textEnd, unitElement, unitsOf } from "../core.mjs";
import { editable, select } from "../caret.mjs";
import { ZWSP } from "../../../shared/inline-spacing.mjs";
import { t } from "../../../shared/i18n/index.mjs";
import { shortcut } from "../tooltip.mjs";

// Ctrl+A (⌘A) widening step by step (docs/editor.md, "Selecting all"). The base rule: the first
// press in a text block selects that block's text, a press when it is all selected (or empty)
// selects the page's blocks, and with blocks selected a press selects the page's. The user's
// (2026-10-23) puts the containers between, one level a press:
//
//   1. the text block's own text (a list item's words, not the blocks it holds; a code block's code;
//      a cell's text; the title's), the browser's selection, so the format bar shows for it;
//   2. everything in the container block it stands in, as blocks are selected (a box selection's
//      fills): a highlight block's blocks (not its icon, the box's lead, which is no block), a
//      disclosure's content (not its title, the disclosure's own text), a quote's paragraphs, a
//      column's blocks, the blocks of the tab shown, a detail card's content, the blocks a list item
//      holds under its text (its own words not among them);
//   3. the next container up, the one just selected whole among its blocks, and so on; a row of
//      columns, a Sheet area and a table are a step of their own, the block whole (all of its
//      columns, all of its tabs, all of its cells), above a column, a tab's panel and a cell;
//   4. the page: every block of it (the header's lines and the page's blocks; not its title or its
//      icon, the page's own and no blocks). In an open detail card its content is the
//      top: the page behind it is not the card's (of two open, the one the press is in: openCard).
//
// Not containers: sections (the user's: 分区的不用管; a section's blocks are the page's), lists (an
// item is a block of the flow it stands in, a list being no block of its own), the plain divs that group
// blocks, the header and a Sheet's tab row. A press that would select what is selected already goes
// on to the next step, so each press selects more (the top never, after a text block's text: the
// block selected is more than its text, a page of one paragraph too); at the top it does nothing. A selection of blocks
// (a box selection, a handle's) goes on from its blocks, a selection across blocks (text-select/)
// from the blocks it touches (to the first container holding them all, its text being only a part),
// selected cells (table/) from their table. A field of the page's own UI (the link card, the formula
// editor, a menu's search, a tab being renamed) keeps the browser's Ctrl+A.

const TEXT = "[data-ge-block], [data-ge-new][contenteditable='true']";

const kindOf = (node) => node.getAttribute("data-ge-unit-kind");
// A block of blocks with a box of its own around them (a highlight block; not a group, a plain div).
const drawsBox = (node) => node.hasAttribute("data-ge-box") && BOXED.has(kindOf(node)) && boxKind(node) !== "plain";

// On a Mac ⌘A (Ctrl+A is the line's start there, as in every text field), elsewhere Ctrl+A.
const MAC = /Mac|iPhone|iPad/.test(globalThis.navigator?.platform ?? "");

/** Ctrl+A (⌘A on a Mac), no Shift or Alt. */
export const isSelectAllKey = (event) => (MAC ? event.metaKey : event.ctrlKey) && !event.shiftKey && !event.altKey && event.key?.toLowerCase() === "a";

/** The blocks a box holds as its own: its units without its lead (a highlight block's icon). */
export const heldUnits = (box) => unitsOf(box).filter((unit) => !isLead(boxKind(box), kindOf(unit)));

// What each step selects, in the reader's words: those of the box (`selectAll`), else its name's.
function contentLabel(kind) {
  const own = selectAllOf(kind).content;
  return own === true ? t("{0}里的全部内容", BOX_NAMES[kind]) : own;
}
const wholeLabel = (unit) => t("整个{0}", KIND_NAMES[kindOf(unit)] ?? t("整体块"));

/**
 * What a selection of `units` reaches, to tell whether a step selects more: its text blocks, the
 * blocks in it that hold none (a picture, a divider, a highlight block's icon), and a block of
 * blocks drawing a box of its own (a highlight block: selected whole it is more than its blocks). A
 * list and its items, a quote and its paragraphs reach the same; a list item whole reaches its own
 * text besides the blocks it holds.
 */
export function coverage(units) {
  const reached = new Set();
  for (const unit of units) {
    for (const node of [unit, ...unit.querySelectorAll(`${TEXT}, ${UNIT}`)]) {
      if (node.matches(TEXT) || !node.querySelector(TEXT) || drawsBox(node)) reached.add(node);
    }
  }
  return reached;
}

/** The innermost element around all of `nodes` (none being another's): the parent of one. */
export function around(nodes) {
  let at = nodes[0]?.parentElement ?? null;
  while (at && !nodes.every((node) => node !== at && at.contains(node))) at = at.parentElement;
  return at;
}

/**
 * The open detail card a press is in: the one `from` stands in (the block or text block it goes on
 * from; outside them all, none: the page), else the one holding the focus, else the one drawn over
 * the others at its middle (a card opened from another's covers it; with no layout, the last). null: none.
 */
export function openCard(doc, from = null) {
  if (from) return from.closest?.("dialog[open]") ?? null;
  const focused = doc.activeElement?.closest?.("dialog[open]");
  if (focused) return focused;
  const open = [...doc.querySelectorAll("dialog[open]")];
  const drawn = open.filter((dialog) => {
    const box = dialog.getBoundingClientRect();
    const hit = box.width > 0 ? doc.elementFromPoint?.(box.left + box.width / 2, box.top + box.height / 2) : null;
    return Boolean(hit && dialog.contains(hit));
  });
  return drawn.at(-1) ?? open.at(-1) ?? null;
}

/**
 * The top: the content of the detail card open where the press is (openCard: `from`, the node it
 * goes on from, else the focus), else the page (the header's lines and the page's blocks). { units, label, top }.
 */
export function topStep(doc, from = null) {
  const card = openCard(doc, from)?.querySelector('[data-ge-box-kind="dialog"]');
  if (card) return { units: heldUnits(card), label: contentLabel("dialog"), top: true };
  const main = doc.querySelector('main[data-ge-box-kind="main"]') ?? doc.querySelector("main");
  if (!main) return { units: [], label: t("整个页面"), top: true };
  const header = [...main.children].find((child) => boxKind(child) === "header");
  const lines = header ? unitsOf(header).filter((unit) => isSelectable(kindOf(unit))) : []; // not the page's icon (`selectable: false`)
  return { units: [...lines, ...heldUnits(main)], label: t("整个页面"), top: true };
}

/**
 * The steps above `start` (an element: the box or block the selection stands in), innermost
 * first, the top last: [{ units, label, top? }]. A detail card's content is the last.
 */
export function stepsAbove(start) {
  const steps = [];
  for (let at = start; at; at = at.parentElement) {
    const kind = at.hasAttribute?.("data-ge-box") ? boxKind(at) : null;
    if (!kind) continue;
    if (kind === "main") break;
    const { content, whole, top = false } = selectAllOf(kind) ?? {};
    if (content) {
      const units = heldUnits(at);
      if (units.length > 0) steps.push({ units, label: contentLabel(kind), top });
      if (top) return steps;
    }
    if (whole) {
      const owner = at.matches(UNIT) ? at : at.parentElement?.closest(UNIT);
      if (owner && !steps.some((step) => step.units.length === 1 && step.units[0] === owner)) steps.push({ units: [owner], label: wholeLabel(owner) });
    }
  }
  steps.push(topStep(start?.ownerDocument ?? document, start));
  return steps;
}

/** The steps from text block `host` once its text is all selected: a table's cell the table whole first. */
export function stepsFromText(host) {
  const unit = unitElement(host);
  if (!unit) return [topStep(host.ownerDocument, host)]; // the title, one beside a detail card's content: no block of their own
  const whole = unit !== host && kindOf(unit) === "table" ? [{ units: [unit], label: wholeLabel(unit) }] : [];
  return [...whole, ...stepsAbove(unit.parentElement)];
}

/**
 * The first of `steps` that selects more than `reached` (coverage: what is selected now), holding
 * it all; `strict` false: one holding it is enough (a selection across blocks, whose text may be a
 * part of theirs). The top takes what it can (the title is no block of the page), and after a text
 * block's text (`text`) even when it holds that block alone: the block selected is more than its
 * text (a press with the text all selected selects the block; a page or a detail card of one paragraph).
 * null: none (the top is selected already).
 */
export function nextStep(steps, reached, { strict = true, text = false } = {}) {
  for (const step of steps) {
    const area = coverage(step.units);
    const holds = [...reached].every((node) => area.has(node));
    if (holds && (!strict || area.size > reached.size)) return step;
    if (step.top && area.size > 0 && (!holds || text)) return step;
  }
  return null;
}

// The selection's part in a text block's own text, against all of it: whether it holds all of it
// (an empty block's is all selected). Counted in characters and formulas, the
// zero-width pads (pads.mjs) none.
function wholeText(host) {
  const own = document.createRange();
  own.setStart(host, 0);
  own.setEnd(host, textEnd(host));
  const letters = (range) => range.toString().replaceAll(ZWSP, "");
  const atoms = (range) => range.cloneContents().querySelectorAll("[data-ge-atom]").length;
  const all = letters(own);
  if (all === "" && atoms(own) === 0) return { own, all: true };
  const selection = getSelection();
  if (!selection.rangeCount) return { own, all: false };
  const range = selection.getRangeAt(0);
  if (range.compareBoundaryPoints(Range.END_TO_START, own) > 0 || range.compareBoundaryPoints(Range.START_TO_END, own) < 0) return { own, all: false };
  const part = own.cloneRange();
  if (range.compareBoundaryPoints(Range.START_TO_START, own) > 0) part.setStart(range.startContainer, range.startOffset);
  if (range.compareBoundaryPoints(Range.END_TO_END, own) < 0) part.setEnd(range.endContainer, range.endOffset);
  return { own, all: letters(part) === all && atoms(part) === atoms(own) };
}

/**
 * blocks: the block tools (blocks.mjs: picked, select(units, { quiet })). say: the status line.
 * cells: the table tools' selection (table/): table() the table whose cells are selected (no
 * caret in one), or null; clear() lets it go.
 */
export function createSelectAll({ blocks, say, cells = { table: () => null, clear() {} } }) {
  const KEY = shortcut("mod+a"); // the key as the tooltips name it: Ctrl+A, ⌘A on a Mac
  const more = (steps, step) => {
    const next = nextStep(steps.slice(steps.indexOf(step) + 1), coverage(step.units));
    return next ? t(" · 再按 {0} 选中{1}", KEY, next.label) : "";
  };

  // A step taken: its blocks selected (the cells' selection let go), said with the step after it.
  function take(steps, step) {
    if (!step) return; // the top is selected already: nothing more
    cells.clear();
    blocks.select(step.units, { quiet: true });
    say(t("已选中{0} · Delete 删除 · Esc 取消{1}", step.label, more(steps, step)));
  }

  function fromText(host) {
    const { own, all } = wholeText(host);
    const steps = stepsFromText(host);
    const next = nextStep(steps, new Set([host]), { text: true });
    if (!all) {
      select(own);
      say(next ? t("已选中这一块的文字 · 再按 {0} 选中{1}", KEY, next.label) : t("已选中这一块的文字"));
      return;
    }
    take(steps, next);
  }

  return {
    /**
     * The editor's key chain (editor.mjs): Ctrl+A with the caret in text block `host` (null: none,
     * blocks or cells selected, or nothing). True when it was the key and handled.
     */
    key(event, host) {
      if (!isSelectAllKey(event) || event.isComposing || event.keyCode === 229) return false;
      const target = event.target;
      // A field of the page's own UI, or the report's own editable element, keeps the browser's.
      if (target?.closest?.("input, textarea, select") || (target?.isContentEditable && !editable(target))) return false;
      event.preventDefault();
      if (host) return fromText(host), true;
      const table = cells.table();
      if (table?.isConnected) {
        const steps = [{ units: [table], label: wholeLabel(table) }, ...stepsAbove(table.parentElement)];
        take(steps, steps[0]);
        return true;
      }
      const picked = blocks.picked;
      if (picked.length > 0) {
        const steps = stepsAbove(around(picked));
        take(steps, nextStep(steps, coverage(picked)));
      } else {
        const steps = [topStep(document)];
        take(steps, nextStep(steps, new Set()));
      }
      return true;
    },
    /**
     * A key over a selection across blocks (text-select/): Ctrl+A selects the first container
     * holding all it touches, `touched()` letting it go and giving its blocks. True when it was the key.
     */
    across(event, touched) {
      if (!isSelectAllKey(event)) return false;
      event.preventDefault();
      const units = touched();
      const steps = units.length > 0 ? stepsAbove(around(units)) : [topStep(document)];
      take(steps, nextStep(steps, coverage(units), { strict: false }));
      return true;
    },
  };
}
