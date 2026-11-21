import { BESIDE, ENTERS_AFTER } from "../components/registry.mjs";
import { isHost } from "./core.mjs";

// What a click beside a block and Enter on a selected block do with it, shared by the tools that
// place the caret or blocks (insert/), select blocks (blocks.mjs) and say what a selection takes
// (selection/).

/**
 * Whether a click to the right of a block (insert/ boxedBeside) puts the caret after it (after/): a
 * boxed block (a code block, a highlight block, a disclosure, a card, a table, a divider…) or a row
 * of columns, as opposed to text and the boxes text flows in (a list, a quote, a section).
 */
export const caretBeside = (unit) => BESIDE.has(unit?.getAttribute?.("data-ge-unit-kind"));

/**
 * Whether Enter on a block selected (the first of those selected) puts a new paragraph after them
 * (blocks.mjs, insert.paragraphAfter): a block of no text of its own, those a click to their right
 * puts the caret after and a 选项卡区块; not a text block among them (a formula block, whose editor it opens).
 */
export const entersAfter = (unit) => Boolean(unit) && !isHost(unit) && ENTERS_AFTER.has(unit.getAttribute("data-ge-unit-kind"));
