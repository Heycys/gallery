import { atomOf, editable } from "./caret.mjs";
import { addStyle } from "./ui.mjs";

// What fills a chip of the text (core.mjs: a formula, a link shown with its icon, a page block): one
// rectangle around all of it, a chip being one whole. A formula's under the pointer and while its box
// is open; any chip's when a selection holds it, whose color the browser would paint on the pieces of
// the chip that hold text, in strips as broken as they are (so nothing is painted inside a chip).
//   KaTeX's boxes stand out of a formula's inline box, whose background is a narrow strip through the
// middle of a fraction, so its fill is its .katex with as much padding above and below as the drawing
// reaches past that box, which moves nothing: a padding above an inline box counts for no line. A
// chip selected is as high as its line, as the words selected beside it are, the hair of room at its
// sides filled too (they reach it): a box of its own, ::after behind it, which takes a chip of any
// display and moves nothing. (A chip the line wraps fills its pieces, its background on each line.) How
// much of each is known only by measuring, so it is measured for the chips that show a fill and written
// in a style sheet of the page's own, as is which chips those are, no attribute of theirs: nothing here
// enters a block's snapshots or the file, or reaches what the editor's observers watch, and a selection
// that holds no chip, and a caret moving, cost nothing but the look at it.

const STYLE = `
  [data-ge-editing] [data-ge-atom]::selection, [data-ge-editing] [data-ge-atom] ::selection { background-color: transparent; }
`;

let sheet = null; // made as the page starts editing: the import reads the editor's modules with no page
let hovered = null; // the formula under the pointer, or the last one
let edited = null; // the formula whose box is open
let selected = []; // the chips the browser's selection holds whole

// How far up and down a formula's drawing goes (window px), or null for a chip with no drawing.
function drawingOf(chip) {
  const boxes = [...chip.querySelectorAll(".katex-base")].map((base) => base.getBoundingClientRect());
  return boxes.length > 0 ? { top: Math.min(...boxes.map((box) => box.top)), bottom: Math.max(...boxes.map((box) => box.bottom)) } : null;
}

/** Where a chip of the text shows, all of its drawing (window px): what stands by a formula stands clear of this. */
export function chipBox(chip) {
  const { left, right, top, bottom, width } = chip.getBoundingClientRect();
  const drawing = drawingOf(chip) ?? { top, bottom };
  const box = { top: Math.min(top, drawing.top), bottom: Math.max(bottom, drawing.bottom) };
  return { left, right, width, ...box, height: box.bottom - box.top };
}

// Where a chip stands on its line (window px): all of its drawing, and a line high around the line's
// middle, which is an inline chip's; one of the page's own boxes (placeholder.mjs) stands at the line's top.
function bandOf(chip) {
  const { top, bottom } = chip.getBoundingClientRect();
  const half = parseFloat(getComputedStyle(chip.parentElement).lineHeight) / 2 || 0;
  const middle = getComputedStyle(chip).display === "inline" ? (top + bottom) / 2 : top + half;
  const drawing = drawingOf(chip);
  return { top: Math.min(middle - half, drawing?.top ?? top), bottom: Math.max(middle + half, drawing?.bottom ?? bottom) };
}

// The lines the chips `chosen` stand on, by chip: as the browser fills a line for the words selected on it, as high as all the chips of its block on it.
function linesOf(chosen) {
  const lines = new Map();
  for (const host of new Set(chosen.map((chip) => editable(chip.parentElement) ?? chip.parentElement))) {
    const found = [];
    for (const chip of host.querySelectorAll("[data-ge-atom]")) {
      const band = bandOf(chip);
      const line = found.find((each) => band.top < each.bottom - 1 && band.bottom > each.top + 1) ?? found[found.push(band) - 1];
      line.top = Math.min(line.top, band.top);
      line.bottom = Math.max(line.bottom, band.bottom);
      lines.set(chip, line);
    }
  }
  return lines;
}

// The rules of one chip: a formula's padding, and a chip selected (on `line`) its fill. Its name stands
// three times, for a chip selected to outweigh the looks it has under the pointer and of its own.
function rulesOf(chip, line) {
  const name = `[data-ge-editing] ${`[data-ge-atom="${chip.getAttribute("data-ge-atom")}"]`.repeat(3)}`;
  const drawing = drawingOf(chip);
  const rules = [];
  let box = chip.getBoundingClientRect();
  if (drawing) {
    // By what the padding does not move: KaTeX's own line inside .katex.
    const inner = chip.querySelector(".katex-html").getBoundingClientRect();
    box = { top: Math.min(inner.top, drawing.top), bottom: Math.max(inner.bottom, drawing.bottom) };
    if (box.top < inner.top || box.bottom > inner.bottom) rules.push(`${name} .katex { padding-block: ${inner.top - box.top}px ${box.bottom - inner.bottom}px; }`);
  }
  if (selected.includes(chip)) {
    const fill = drawing ? " .katex" : "";
    if (chip.getClientRects().length > 1) rules.push(`${name}${fill} { background: var(--ge-select); border-radius: 0; }`);
    else {
      const room = parseFloat(getComputedStyle(chip).marginLeft);
      rules.push(`${name}${fill} { position: relative; isolation: isolate; background: transparent; border-radius: 0; }`);
      rules.push(`${name}${fill}::after { content: ""; position: absolute; inset: ${line.top - box.top}px ${-room}px ${box.bottom - line.bottom}px; z-index: -1; background: var(--ge-select); pointer-events: none; }`);
    }
  }
  return rules;
}

// A sheet written anew is looked at against the whole page (10ms on a page of a thousand blocks): only when it changes.
let written = "";
function write() {
  const lines = linesOf(selected.filter((chip) => chip.isConnected));
  const rules = [...new Set([hovered, edited, ...selected])].filter((chip) => chip?.isConnected).flatMap((chip) => rulesOf(chip, lines.get(chip))).join("\n");
  if (rules !== written) sheet?.replaceSync((written = rules));
}

/** The formula whose box is open, drawn anew by what is typed (null: none). */
export function fillEdited(chip) {
  edited = chip;
  write();
}

/** Start following the pointer and the selection on the page (`isEditing`: the page edits). */
export function connectChipFills(isEditing) {
  addStyle(STYLE);
  sheet = new CSSStyleSheet();
  document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
  document.addEventListener("mouseover", (event) => {
    const chip = isEditing() ? atomOf(event.target) : null;
    if (!chip || chip === hovered) return;
    hovered = chip;
    write();
  }, true);
  document.addEventListener("selectionchange", () => {
    const selection = getSelection();
    const around = isEditing() && selection.rangeCount && !selection.isCollapsed ? selection.getRangeAt(0).commonAncestorContainer : null;
    const chips = around ? [...(around.nodeType === 1 ? around : around.parentElement).querySelectorAll("[data-ge-atom]")].filter((chip) => selection.containsNode(chip)) : [];
    if (chips.length === selected.length && chips.every((chip, index) => chip === selected[index])) return;
    selected = chips;
    write();
  });
}
