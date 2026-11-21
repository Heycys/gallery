import { escapeText } from "../../../shared/escape.mjs";
import { BLOCK_COLORS, cellColorOf, colorLook } from "../../components/colors.mjs";
import { CELLS_MIME as MIME, CELL_BOLD, OLD_CELLS_MIME, cellsPayload, pictureFile } from "../../components/table/index.mjs";
import { alignItems, alignLook } from "./aligns.mjs";
import { insertColumn, insertRow, tableParts, tableSlots, tableState } from "../../components/table/page.mjs";
import { atEdge, editable } from "../caret.mjs";
import { pastedLines, serializeInner } from "../core.mjs";
import { formulaMaker, loadKatex } from "../formula/index.mjs";
import { FORMAT_KEYS } from "../format-bar/index.mjs";
import { formatRange, markValue, rangeAt, rangeOffsets } from "../marks.mjs";
import { gestureLock } from "../gesture.mjs";
import { addStyle } from "../ui.mjs";
import { createCellBar } from "./cell-bar.mjs";
import { createCellLists } from "./lists.mjs";
import { t } from "../../../shared/i18n/index.mjs";

// Selected cells of a table and the keys in a table (rules decided 2026-10-18),
// with the cells' bar (cell-bar.mjs) over them.
//
// - Selecting: a press in a cell dragged into another selects the cells between (the text selection
//   goes; back in the first, that one cell, no caret); Shift+click from the selection's anchor (or
//   the caret's cell), and on with a drag. The caret in a cell makes that cell the selection (index.mjs
//   draws its frame). Until a press in a cell is let go, the table's tools take no pointer (STYLE).
// - The caret in a cell: Tab / Shift+Tab to the next / previous cell, Enter to the one below, Esc
//   selects the cell; Backspace at its start and Delete at its end do nothing. In a list of the
//   cell's (lists.mjs), Enter and Backspace at an item's start are the list's.
// - Cells selected: the arrows move a one-cell selection (a row's up and down, a column's left and
//   right), with Shift its far edge; Tab as →, Shift+Tab as Shift+←; Enter edits the focus cell
//   (Shift+Enter in the last row puts a row below); Esc selects the cell's row, else the table;
//   Backspace / Delete take out selected rows or columns, else empty the cells and take their color;
//   a typed character goes at the end of the last cell, editing it; Ctrl+D fills down (copies rows or
//   columns), Ctrl+R right; Ctrl+B / I / U / E and Ctrl+Shift+S format whole cells.
// - Copied, cells are the page's own (their inline HTML), an HTML table and lines of tab-separated
//   text (a cell in quotes holding its lines, as Excel writes one); pasted onto selected cells or with
//   the caret in one, what the clipboard holds as cells (clipboard/ cellsOf: the page's own, another
//   program's table with its marks and pictures, a Markdown table, tab-separated lines) fills them
//   from the top left or the caret's cell (repeated over a selection a whole number of times larger),
//   rows and columns put in where they overflow; one undo step. With the caret in a cell a single
//   value is the editor's paste at the caret (but one holding a picture: pictures.mjs).
// A cell's color (one, as a block's: components/colors.mjs) and alignment are its classes (its look:
// components/table/index.mjs); its text changes are the editor's (struct, history.mjs). Where cells
// are merged (shared/table-slots.mjs), Tab goes from cell to cell, the arrows and Enter step
// past a merged cell, and copies and pastes go by its top left slot.

const STYLE = `
  ${gestureLock("data-ge-tcells", { select: true })}
  /* The button held after a press in a cell (cells or text being selected): the tools standing by the table (the lines' strips, widths.mjs; the grips, + points and corner, index.mjs) take no pointer, so none lights, shows its cursor or draws its line as the pointer goes over them. */
  html[data-ge-tpress] :is(.ge-tcol, .ge-trows, .ge-tgrip, .ge-tplus, .ge-tgrow) { pointer-events: none; }
  /* A cell has square corners and no fill under the pointer, hovered or edited (selected cells have the table tools' frame). */
  [data-ge-editing] [data-ge-kind="cell"][contenteditable="true"] { --ge-text-radius: 0px; --ge-text-tint: none; }
`;
const MAX_PASTE = 5000; // cells a paste may fill (a table's limit: components/table/file.mjs)
const same = (a, b) => a?.[0] === b?.[0] && a?.[1] === b?.[1];
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const isCell = (node) => /^(TD|TH)$/.test(node?.tagName ?? "");
const writable = (cell) => cell.getAttribute("contenteditable") === "true";
const contents = (cell) => {
  const range = document.createRange();
  range.selectNodeContents(cell);
  return range;
};

/** Cells emptied, their color and their bold taken too (清除内容), one undo step. */
export function clearCells(tools, list) {
  const targets = list.filter((cell) => writable(cell) && (cell.hasChildNodes() || cellColorOf(cell) || cell.classList.contains(CELL_BOLD)));
  if (targets.length === 0) return;
  tools.struct([...new Set(targets.map((cell) => cell.parentElement))], targets, () => {
    for (const cell of targets) {
      cell.replaceChildren();
      cell.classList.remove(...BLOCK_COLORS, CELL_BOLD);
    }
    return { touched: targets, focus: null };
  });
  tools.say(t("已清除内容 · Ctrl+Z 撤销"));
}

/** t: the table tools' selection and changes (index.mjs). */
export function createCells(tools) {
  addStyle(STYLE);
  const bar = createCellBar(run);
  const lists = createCellLists(tools);
  let press = null; // the main button down in a cell: { unit, start: [row, column], crossed }
  let swallow = false; // a Shift+click selected: the mousedown after it does nothing

  // ---------- the pointer ----------

  document.addEventListener("pointerdown", (event) => {
    // (A header's sort arrow is the kit's control: index.mjs sorts by it.)
    if (!tools.active() || event.button !== 0 || event.target?.closest?.("[data-doc-dev], .ge-pop, .doc-table-sort-button")) return;
    const cell = event.target?.closest?.("td, th");
    const unit = tools.tableAt(cell);
    const sel = tools.sel;
    if (!unit) {
      // A press outside the table lets its selection go.
      if (sel && !sel.unit.contains(event.target)) tools.clear();
      return;
    }
    const at = tools.placeOf(tableSlots(unit), cell);
    // Until it is let go, the tools by the table wait (no hover while a drag may start): STYLE.
    document.documentElement.setAttribute("data-ge-tpress", "");
    if (event.shiftKey) {
      event.preventDefault();
      event.stopImmediatePropagation();
      swallow = true;
      const anchor = sel?.unit === unit ? sel.anchor : at;
      tools.selectCells(unit, anchor, at);
      press = { unit, start: anchor, crossed: true };
      document.documentElement.setAttribute("data-ge-tcells", "");
      return;
    }
    if (sel && !sel.editing) tools.clear(); // the caret goes in where it was pressed
    press = { unit, start: at, crossed: false };
  }, true);
  document.addEventListener("mousedown", (event) => {
    if (!swallow) return;
    swallow = false;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener("pointermove", (event) => {
    if (!press || !(event.buttons & 1)) return;
    const at = tools.cellAt(press.unit, event.clientX, event.clientY);
    if (!at || (!press.crossed && same(at, press.start))) return; // in the cell it began in: the browser's selection
    press.crossed = true;
    document.documentElement.setAttribute("data-ge-tcells", "");
    const sel = tools.sel;
    if (sel && !sel.editing && sel.type === "cell" && same(sel.anchor, press.start) && same(sel.focus, at)) return;
    tools.selectCells(press.unit, press.start, at);
  }, true);
  const release = () => {
    press = null;
    document.documentElement.removeAttribute("data-ge-tcells");
    document.documentElement.removeAttribute("data-ge-tpress");
  };
  document.addEventListener("pointerup", release, true);
  document.addEventListener("pointercancel", release, true);
  addEventListener("blur", release);

  // The caret in a cell is that cell's selection; in text outside the table, the selection goes.
  document.addEventListener("selectionchange", () => {
    if (!tools.active()) return;
    const selection = getSelection();
    if (press?.crossed) {
      if (selection.rangeCount) selection.removeAllRanges();
      return;
    }
    if (!selection.rangeCount) return;
    const host = editable(selection.anchorNode);
    const unit = isCell(host) ? tools.tableAt(host) : null;
    const sel = tools.sel;
    if (unit) {
      const at = tools.placeOf(tableSlots(unit), host);
      if (!(sel?.editing && sel.unit === unit && same(sel.anchor, at))) tools.editing(unit, at);
    } else if (sel && host) tools.clear();
  });

  // ---------- the keys ----------

  document.addEventListener("keydown", (event) => {
    const sel = tools.sel;
    if (!sel || !tools.active() || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
    if (tools.typedKey(event)) return void event.stopImmediatePropagation();
    if (!sel.unit.isConnected || tools.menuOpen() || tools.dragging() || event.target?.closest?.("input, textarea, .ge-pop, .ge-popup-layer")) return;
    if (sel.editing ? caretKey(event, sel) : cellKey(event, sel)) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  // The caret in a cell: whether the key was the table's.
  function caretKey(event, sel) {
    const host = editable(event.target);
    if (!isCell(host) || tools.tableAt(host) !== sel.unit || event.ctrlKey || event.metaKey || event.altKey) return false;
    const { unit } = sel;
    const { rows, slots } = tableState(unit);
    const at = tools.placeOf(slots, host);
    if (!at || !slots) return false;
    if (lists.key(event, host)) return true;
    const selection = getSelection();
    switch (event.key) {
      case "Tab": {
        // The next (previous) cell in reading order, a merged one once.
        const places = [...slots.places.values()];
        const index = places.findIndex((place) => place.r === at[0] && place.c === at[1]) + (event.shiftKey ? -1 : 1);
        if (index >= 0 && index < places.length) tools.editCell(unit, [places[index].r, places[index].c]);
        return true;
      }
      case "Enter": {
        if (event.shiftKey) return false; // a line break in the cell
        const below = at[0] + slots.places.get(host).rows;
        if (below < rows.length) tools.editCell(unit, [below, at[1]]);
        return true;
      }
      case "Backspace":
        return !event.shiftKey && selection.isCollapsed && atEdge(host, false);
      case "Delete":
        return !event.shiftKey && selection.isCollapsed && atEdge(host, true);
      case "Escape":
        tools.selectCells(unit, at);
        return true;
      default:
        return false;
    }
  }

  const ARROWS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

  // Cells (rows, columns) selected: whether the key was the table's.
  function cellKey(event, sel) {
    const { unit } = sel;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;
    const { rows, columns, body } = tableState(unit);
    const b = tools.bounds(sel);
    const single = b.r0 === b.r1 && b.c0 === b.c1;
    if (mod && !event.altKey) {
      const letter = key.toLowerCase();
      if (letter === "d" && !event.shiftKey) {
        if (sel.type === "row" || sel.type === "column") tools.duplicate(unit, sel.type, sel.type === "row" ? b.r0 : b.c0, sel.type === "row" ? b.r1 : b.c1);
        else if (b.r1 > b.r0) fill(sel, "down");
        return true;
      }
      if (letter === "r" && !event.shiftKey) {
        if (b.c1 > b.c0) fill(sel, "right");
        return true; // never the browser's reload
      }
      if (!event.shiftKey && FORMAT_KEYS[letter] === "bold") return bold(tools.selectedCells(sel)), true;
      if (!event.shiftKey && FORMAT_KEYS[letter]) return format(tools.selectedCells(sel), [[FORMAT_KEYS[letter]]]), true;
      if (event.shiftKey && (letter === "s" || letter === "x")) return format(tools.selectedCells(sel), [["strike"]]), true;
      return false; // copy, cut and paste come as their events
    }
    if (mod && event.altKey && key === "\\") {
      format(tools.selectedCells(sel), [["bold", false], ["italic", false], ["underline", false], ["strike", false], ["code", false], ["text", null], ["highlight", null]], { [CELL_BOLD]: false });
      return true;
    }
    if (event.altKey) return false;
    const arrow = key in ARROWS ? key : key === "Tab" ? (event.shiftKey ? "ArrowLeft" : "ArrowRight") : null;
    if (arrow) {
      tools.keys(true);
      const [dr, dc] = ARROWS[arrow];
      if (event.shiftKey) {
        // The edge furthest from the anchor moves.
        const anchor = [sel.type === "column" ? b.r0 : sel.anchor[0], sel.type === "row" ? b.c0 : sel.anchor[1]];
        const far = [anchor[0] === b.r0 ? b.r1 : b.r0, anchor[1] === b.c0 ? b.c1 : b.c0];
        tools.selectCells(unit, anchor, [clamp(far[0] + dr, 0, rows.length - 1), clamp(far[1] + dc, 0, columns - 1)]);
        return true;
      }
      if (sel.type === "row" && dc === 0) return tools.selectRows(unit, clamp(b.r0 + dr, 0, rows.length - 1)), true;
      if (sel.type === "column" && dr === 0) return tools.selectColumns(unit, clamp(b.c0 + dc, 0, columns - 1)), true;
      // From the focus's row and the first column (←/→), the first row and the focus's column (↑/↓);
      // ←/→ go on to the row before or after. One merged cell selected: from its edges, past it.
      const merged = tools.selectedCells(sel).length === 1 && (b.r1 > b.r0 || b.c1 > b.c0);
      let [r, c] = dc !== 0 ? [sel.focus[0], b.c0] : [b.r0, sel.focus[1]];
      if (merged && dc > 0) c = b.c1;
      if (merged && dr > 0) r = b.r1;
      if (dc !== 0) {
        c += dc;
        if (c < 0) [r, c] = r > 0 ? [r - 1, columns - 1] : [r, 0];
        else if (c >= columns) [r, c] = r < rows.length - 1 ? [r + 1, 0] : [r, columns - 1];
      } else r = clamp(r + dr, 0, rows.length - 1);
      tools.selectCells(unit, [r, c]);
      return true;
    }
    switch (key) {
      case "Enter":
        if (sel.type !== "cell") return false;
        if (!event.shiftKey) return tools.editCell(unit, sel.focus), true;
        // Shift+Enter on one cell of the last row: a row below, that cell's column edited.
        if (single && b.r0 === rows.length - 1 && tools.change(unit, () => insertRow(unit, rows.length), t("已插入一行"))) tools.editCell(unit, [b.r0 + 1, b.c0]);
        return true;
      case "Escape":
        if (sel.type === "cell" && single) tools.selectRows(unit, b.r0);
        else tools.selectBlock(unit);
        return true;
      case "Backspace":
      case "Delete": {
        // Rows or columns, not all of them, go (the one after them selected); else the cells empty.
        const heads = rows.length - body.rows.length;
        const allRows = b.r0 <= heads && b.r1 >= rows.length - 1;
        const allColumns = b.c0 === 0 && b.c1 >= columns - 1;
        if ((sel.type === "row" && !allRows) || (sel.type === "column" && !allColumns)) {
          const axis = sel.type;
          if (tools.removeRange(unit, axis, axis === "row" ? b.r0 : b.c0, axis === "row" ? b.r1 : b.c1)) {
            const now = tableState(unit);
            if (axis === "row") tools.selectRows(unit, Math.min(b.r0, now.rows.length - 1));
            else tools.selectColumns(unit, Math.min(b.c0, now.columns - 1));
          }
          return true;
        }
        clearCells(tools, tools.selectedCells(sel));
        return true;
      }
      default:
        // A character: at the end of the last cell, which is edited (the key goes on to it).
        if (key.length === 1 && !mod) tools.editCell(unit, [b.r1, b.c1]);
        return false;
    }
  }

  // Formats on whole cells (the format bar's, marks.mjs) and `classes` of their looks ({ name: on }),
  // one undo step. changes: [[name, value]], value undefined toggles (off when every cell with text
  // has it all over, else on).
  function format(list, changes, classes = null) {
    const cells = list.filter(writable);
    const written = cells.filter((cell) => cell.textContent.trim() !== "");
    const looked = classes ? cells.filter((cell) => Object.entries(classes).some(([name, on]) => cell.classList.contains(name) !== on)) : [];
    if (written.length === 0 && looked.length === 0) return false;
    const resolved = changes.map(([name, value]) => [name, value === undefined ? !written.every((cell) => markValue(cell, contents(cell), name) === true) : value]);
    const touched = [...new Set([...written, ...looked])]; // their text and classes recorded
    tools.struct([], touched, () => {
      for (const cell of written) for (const [name, value] of resolved) formatRange(cell, contents(cell), name, value);
      for (const cell of looked) for (const [name, on] of Object.entries(classes)) cell.classList.toggle(name, on);
      return { touched, focus: null };
    });
    update();
    return true;
  }

  // Bold on whole cells is theirs (CELL_BOLD, a look: the words typed in them later bold too, as a
  // header's are); off, the look and their words' bold both.
  const isBold = (cell) => cell.classList.contains(CELL_BOLD) || (cell.textContent.trim() !== "" && markValue(cell, contents(cell), "bold") === true);
  function bold(list) {
    const cells = list.filter(writable);
    const on = !cells.every(isBold);
    return format(cells, on ? [] : [["bold", false]], { [CELL_BOLD]: on });
  }

  // Ctrl+D / Ctrl+R: the first row (column) of the cells copied into the others (their text).
  function fill(sel, direction) {
    const { r0, r1, c0, c1 } = tools.bounds(sel);
    const slots = tableSlots(sel.unit);
    const pairs = [];
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (direction === "down" ? r === r0 : c === c0) continue;
        const from = tools.cellOf(slots, direction === "down" ? [r0, c] : [r, c0]);
        const to = tools.cellOf(slots, [r, c]);
        // A cell once, never from itself (a merged cell across the first row or column).
        if (from && to && to !== from && writable(to) && !pairs.some(([, other]) => other === to)) pairs.push([from, to]);
      }
    }
    const targets = pairs.map(([, to]) => to);
    if (targets.length === 0) return;
    tools.struct([...new Set(targets.map((cell) => cell.parentElement))], targets, () => {
      for (const [from, to] of pairs) {
        if (writable(from)) to.innerHTML = from.innerHTML;
        else to.textContent = from.textContent;
      }
      return { touched: targets, focus: null };
    });
    tools.say(direction === "down" ? t("已向下填充 · Ctrl+Z 撤销") : t("已向右填充 · Ctrl+Z 撤销"));
  }

  // ---------- the bar ----------

  function run(command, value) {
    const sel = tools.sel;
    if (!sel) return;
    const list = tools.selectedCells(sel);
    const b = tools.bounds(sel);
    if (command === "color") {
      if (tools.look(list, colorLook(value ?? { kind: "text", color: null }, { only: true }))) tools.say(t("已设置颜色 · Ctrl+Z 撤销"));
    } else if (command === "align") {
      tools.look(list, alignLook(value));
    } else if (command === "bold") {
      bold(list);
    } else if (command === "clear") {
      clearCells(tools, list);
    } else if (command === "insert") {
      const [axis, at] = { above: ["row", b.r0], below: ["row", b.r1 + 1], left: ["column", b.c0], right: ["column", b.c1 + 1] }[value];
      tools.insert(sel.unit, axis, at);
      return;
    } else if (command === "remove") {
      const axis = value === "rows" ? "row" : "column";
      if (tools.removeRange(sel.unit, axis, axis === "row" ? b.r0 : b.c0, axis === "row" ? b.r1 : b.c1)) tools.clear();
      return;
    } else if (command === "merge") {
      tools.merge();
    } else if (command === "split") {
      tools.split();
    }
    update();
  }

  // The bar over selected cells (not rows or columns, which have their menus; not the caret's cell).
  function update() {
    const sel = tools.sel;
    if (!sel || sel.editing || sel.type !== "cell" || !tools.active() || !sel.unit.isConnected) return bar.hide();
    const list = tools.selectedCells(sel);
    if (list.length === 0) return bar.hide();
    const rects = list.map((cell) => cell.getBoundingClientRect());
    const rect = { left: Math.min(...rects.map((r) => r.left)), top: Math.min(...rects.map((r) => r.top)), right: Math.max(...rects.map((r) => r.right)), bottom: Math.max(...rects.map((r) => r.bottom)) };
    bar.show({ ...rect, width: rect.right - rect.left, height: rect.bottom - rect.top }, stateOf(list));
  }

  // What the cells share: a color, bold, their alignments (aligns.mjs; none current when they differ).
  function stateOf(list) {
    const colorOf = (cell) => cellColorOf(cell);
    const first = colorOf(list[0]);
    const color = list.every((cell) => JSON.stringify(colorOf(cell)) === JSON.stringify(first)) ? first : undefined;
    const own = list.filter(writable);
    const bolded = own.length > 0 && own.every(isBold);
    // Several cells may be made one; one merged cell, separate cells again.
    const merge = list.length > 1 ? "merge" : list[0] && (list[0].rowSpan > 1 || list[0].colSpan > 1) ? "split" : null;
    return { color, bold: bolded, aligns: alignItems(list), merge };
  }

  // ---------- the clipboard ----------

  // A cell's inline HTML as copied (a locked cell's words alone: what a script drew is not its text).
  const htmlOf = (cell) => (writable(cell) ? serializeInner(cell) : escapeText(cell.textContent));
  // A cell's words as text: its lines (its line breaks, its list's items) apart, a picture its alt.
  const textOf = (cell) => {
    const copy = cell.cloneNode(true);
    copy.querySelectorAll("[data-doc-dev]").forEach((node) => node.remove());
    copy.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
    copy.querySelectorAll("li").forEach((node, index) => index > 0 && node.prepend("\n"));
    copy.querySelectorAll("img").forEach((node) => node.replaceWith(node.getAttribute("alt") ?? ""));
    return copy.textContent.replace(/[ \t]*\n[ \t]*/g, "\n").trim();
  };
  // A cell of tab-separated text as Excel writes one: in quotes when it holds a tab, a line break or a quote, its quotes doubled.
  const tsvCell = (text) => (/[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text);

  function copy(event) {
    const sel = tools.sel;
    if (!sel || sel.editing || !tools.active() || !sel.unit.isConnected) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const { r0, r1, c0, c1 } = tools.bounds(sel);
    const { slots } = tableState(sel.unit);
    // By slots: a merged cell in its top left one, the others it covers empty.
    const grid = [];
    for (let r = r0; r <= r1; r++) {
      grid.push([]);
      for (let c = c0; c <= c1; c++) {
        const cell = slots.matrix[r][c];
        const place = slots.places.get(cell);
        grid.at(-1).push(place.r === r && place.c === c ? cell : null);
      }
    }
    const html = grid.map((row) => row.map((cell) => (cell ? htmlOf(cell) : "")));
    // The report it was copied from, and its workspace: a paste in another one copies its pictures' files.
    const payload = cellsPayload(html, document);
    event.clipboardData.setData(MIME, payload);
    event.clipboardData.setData(OLD_CELLS_MIME, payload); // a page of the old version (before 2026-10-26) reads this one
    // For other programs (Excel, Google Sheets, another editor): an HTML table, its pictures where the
    // server serves them (an address of this computer), and tab-separated text.
    const shown = (cell) => (cell ? htmlOf(cell).replace(/<img src="(assets\/[^"]+)"/g, (all, file) => `<img src="${escapeText(new URL(cell.querySelector(`img[data-ge-src="${file}"]`)?.getAttribute("src") ?? file, location.href).href)}"`) : "");
    event.clipboardData.setData("text/html", `<table>${grid.map((row) => `<tr>${row.map((cell) => `<td>${shown(cell)}</td>`).join("")}</tr>`).join("")}</table>`);
    event.clipboardData.setData("text/plain", grid.map((row) => row.map((cell) => tsvCell(cell ? textOf(cell) : "")).join("\t")).join("\n"));
    if (event.type === "cut") clearCells(tools, grid.flat().filter(Boolean));
    else tools.say(t("已复制 {0} 格", grid.length * grid[0].length));
  }
  document.addEventListener("copy", copy, true);
  document.addEventListener("cut", copy, true);

  // The cell the caret (or a selection within it) is in, where a paste goes (`target`: the event's,
  // the cell or in it), in a table the tools manage, with where it is: { unit, at, cell }, or null.
  function caretCell(target) {
    const selection = getSelection();
    const node = selection.rangeCount ? selection.getRangeAt(0).commonAncestorContainer : null;
    const cell = (node?.nodeType === 1 ? node : node?.parentElement)?.closest?.("td, th");
    const unit = cell && writable(cell) && cell.contains(target) ? tools.tableAt(cell) : null;
    const at = unit ? tools.placeOf(tableSlots(unit), cell) : null;
    return at ? { unit, at, cell } : null;
  }
  // Whether a pasted cell holds nothing: no words, no picture.
  const blank = (html) => !html.includes("<img") && !html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim();

  // A paste into the cells (the user's 2026-11-09: cells pasted with the caret in a cell are cells,
  // not one cell's text): what the clipboard holds as cells (tools.cellsOf: the
  // page's own, another program's table, a Markdown table, tab-separated lines, else its text) goes
  // from the selected cells' top left, or the caret's cell. With the caret in a cell, a single value
  // is the editor's paste at the caret (its marks, an address a link: clipboard/), but one holding a
  // picture, which goes in at the caret here (its file copied first); with cells selected, it fills
  // them, as do picture files pasted on them (in the first one).
  function paste(event) {
    const sel = tools.sel;
    if (!tools.active()) return;
    const caret = !sel || sel.editing ? caretCell(event.target) : null;
    if (!(caret || (sel && !sel.editing && sel.unit.isConnected))) return;
    const data = event.clipboardData;
    const pasted = data ? tools.cellsOf(data) : null;
    const many = pasted && (pasted.rows.length > 1 || pasted.rows[0].length > 1);
    const files = [...(data?.files ?? [])].filter((file) => /^image\//.test(file.type));
    if (caret && !many && !(pasted?.rows[0][0].includes("<img") && !files.length)) return; // the editor's
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = caret ? { unit: caret.unit, type: "cell", anchor: caret.at, focus: caret.at, editing: false } : sel;
    if (!pasted && !files.length) return;
    const offsets = caret && !many ? rangeOffsets(caret.cell, getSelection().getRangeAt(0)) : null;
    (async () => {
      let rows = pasted?.rows;
      let found = new Map();
      if (!rows) {
        // Picture files on selected cells: the first one's pictures.
        const made = await tools.pictures.fromFiles(files);
        if (!made.length) return;
        rows = [[made.map((img) => `<img src="${pictureFile(img)}" alt="">`).join("")]];
        made.forEach((img) => found.set(pictureFile(img), { path: pictureFile(img) }));
      } else found = await tools.pictures.resolve(rows.flat(), pasted.from, { same: pasted.same, project: pasted.project });
      // Formulas in what is pasted are drawn at once, KaTeX loaded first where the page has none yet.
      const formula = rows.some((row) => row.some((html) => html.includes("doc-math-inline"))) && (await loadKatex()) ? formulaMaker() : null;
      const lines = (html) => {
        const made = pastedLines(document, html, { links: true, formula, picture: tools.pictures.maker(found) });
        return made.flatMap((line, index) => (index > 0 ? [document.createElement("br"), ...line] : line));
      };
      if (offsets) atCaret(caret, offsets, lines(rows[0][0]));
      else pasteGrid(target, rows, lines);
    })();
  }

  // A value holding a picture pasted at the caret in a cell (its file copied first): in at the caret,
  // one undo step, the caret after it.
  function atCaret({ unit, cell }, offsets, nodes) {
    if (!cell.isConnected || nodes.length === 0) return;
    let last = null;
    const made = tools.change(unit, () => {
      const range = rangeAt(cell, offsets);
      range.deleteContents();
      const fragment = document.createDocumentFragment();
      fragment.append(...nodes);
      last = nodes.at(-1);
      range.insertNode(fragment);
      return true;
    }, null, [cell]);
    if (made === null || !last?.isConnected) return;
    const range = document.createRange();
    range.setStartAfter(last);
    range.collapse(true);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }

  // `pasted`: rows of cells' inline HTML; `lines(html)`: a cell's nodes of one of them.
  function pasteGrid(sel, pasted, lines) {
    if (!sel.unit.isConnected) return;
    let grid = pasted;
    // Its empty last rows and columns go.
    while (grid.length > 1 && grid.at(-1).every(blank)) grid = grid.slice(0, -1);
    const width = Math.max(...grid.map((row) => row.length));
    grid = grid.map((row) => [...row, ...Array.from({ length: width - row.length }, () => "")]);
    while (grid[0].length > 1 && grid.every((row) => blank(row.at(-1)))) grid = grid.map((row) => row.slice(0, -1));
    const { unit } = sel;
    const { r0, r1, c0, c1 } = tools.bounds(sel);
    const times = [Math.max(1, Math.floor((r1 - r0 + 1) / grid.length)), Math.max(1, Math.floor((c1 - c0 + 1) / grid[0].length))];
    const size = [grid.length * times[0], grid[0].length * times[1]];
    if (size[0] * size[1] > MAX_PASTE) return void tools.say(t("一次粘贴的格子太多了。"));
    const { rows, columns, slots } = tableState(unit);
    // The cells there now, whose text the paste changes (undo puts it back).
    const existing = new Set();
    for (let r = r0; r < Math.min(rows.length, r0 + size[0]); r++) for (let c = c0; c < Math.min(columns, c0 + size[1]); c++) existing.add(tools.cellOf(slots, [r, c]));
    const made = tools.change(unit, () => {
      for (let now = tableState(unit); now.columns < c0 + size[1]; now = tableState(unit)) insertColumn(unit, now.columns);
      for (let now = tableParts(unit); now.rows.length < r0 + size[0]; now = tableParts(unit)) insertRow(unit, now.rows.length);
      // The slots after the rows and columns put in, read once for every cell below.
      const slotsNow = tableSlots(unit);
      for (let r = 0; r < size[0]; r++) {
        for (let c = 0; c < size[1]; c++) {
          const cell = tools.cellOf(slotsNow, [r0 + r, c0 + c]);
          // A merged cell takes what goes in its top left slot.
          const place = tools.placeOf(slotsNow, cell);
          if (!cell || !writable(cell) || place[0] !== r0 + r || place[1] !== c0 + c) continue;
          cell.replaceChildren(...lines(grid[r % grid.length][c % grid[0].length]));
        }
      }
      return true;
    }, null, [...existing].filter(writable));
    if (made === null) return;
    tools.selectCells(unit, [r0, c0], [r0 + size[0] - 1, c0 + size[1] - 1]);
    tools.say(t("已粘贴 · Ctrl+Z 撤销"));
  }
  document.addEventListener("paste", paste, true);

  return {
    /** The bar shown or hidden as the selection is now (index.mjs draw). */
    update,
    /** A space typed into a cell: its line a list's item when it starts with "- " or "1. " (lists.mjs). */
    typed: lists.typed,
    get nodes() { return [bar.node]; },
  };
}
