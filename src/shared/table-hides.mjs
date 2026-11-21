// What a table's frame hides at rest (scrolled to its start): the one measure of the kit's layout
// notes of a frame and of its fading right edge (render/kit/tables/scrollbars.js: columns-hidden,
// rows-hidden, data-more; docs/render.md, "Table layout internals") and of gallery qa's look at a
// table (src/cli/qa.mjs), which puts these functions in the page it looks at as their text
// (tableHidesScript): so they read nothing outside themselves but each other.
//
// A column hides what its words hide, never its cells' padding: the words of each of its cells (the
// header's and the body's, a merged cell's in the last column it covers) as the page draws them, so a
// table a few pixels wider than its frame hides nothing, and a long word deep in the body that
// reaches past the edge is a column cut though its header fits. A column is out of sight when none of
// its words starts before the frame's right edge, cut when some reach past it and some start before
// it. The first column that stays as the frame scrolls (a sticky first column, a header column:
// tables/sticky.js) never hides. A row (of the body's, those a filter hides aside) is shown when its
// words end above the frame's bottom edge.

/**
 * The column each cell of `table` ends in, by the HTML table model's slots as src/shared/table-slots.mjs
 * tiles them (tileSlots: a cell takes the first slot of its row no cell above covers, and covers its
 * rowspan and colspan from there), read here on its own so that it can go into a page as its text,
 * and so that a table that does not tile (a hole, a span past its section, a span of 0, read as 1)
 * still gives each cell a column: { columnOf: Map(cell → its last column), columns: how many }.
 * tests/unit/qa.mjs holds it to tileSlots on tables that tile.
 */
export function cellColumns(table) {
  const taken = [];
  const columnOf = new Map();
  let columns = 0;
  [...table.rows].forEach((row, r) => {
    let c = 0;
    for (const cell of row.cells) {
      while (taken[r]?.[c]) c++;
      const across = Math.max(1, cell.colSpan);
      for (let i = 0; i < Math.max(1, cell.rowSpan); i++) for (let j = 0; j < across; j++) (taken[r + i] ??= [])[c + j] = true;
      columnOf.set(cell, c + across - 1);
      c += across;
      columns = Math.max(columns, c);
    }
  });
  return { columnOf, columns };
}

/**
 * Where the words of `cell` are drawn, as one box ({ left, right, top, bottom }, the page's): the
 * boxes of its text's lines and of what it shows that is no text (a picture, a drawing, a control),
 * never an element's own box (a list or a paragraph in a cell is as wide as the cell, its words are
 * not; a formula's MathML, laid out unseen, is no words of it); null when it shows none.
 */
export function wordsBox(cell) {
  const boxes = [];
  const range = document.createRange();
  const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.nodeValue.trim() || node.parentElement?.closest(".katex-mathml")) continue;
    range.selectNodeContents(node);
    boxes.push(...range.getClientRects());
  }
  for (const element of cell.querySelectorAll("img, svg, canvas, input, video")) boxes.push(element.getBoundingClientRect());
  const drawn = boxes.filter((box) => box.width > 0 || box.height > 0);
  if (drawn.length === 0) return null;
  return {
    left: Math.min(...drawn.map((box) => box.left)), right: Math.max(...drawn.map((box) => box.right)),
    top: Math.min(...drawn.map((box) => box.top)), bottom: Math.max(...drawn.map((box) => box.bottom)),
  };
}

/**
 * What the frame `wrapper` (its client box) hides of its `table` at rest: { columns: how many, away
 * and cut: the columns out of sight and cut, [{ column, name: its first words, the header's }], said:
 * those columns in words ("of 6 columns, 1 cut at the frame's edge ("结论")", "" for none), reach:
 * how far from the table's left edge the words past the frame's right edge end (px; 0 when none lies
 * past it: what the fading edge shows while the frame is not scrolled to it), rows: the body's rows
 * shown, shown: how many of them the frame shows }.
 */
export function tableHides(wrapper, table) {
  const width = wrapper.clientWidth;
  const height = wrapper.clientHeight;
  const box = table.getBoundingClientRect();
  const holds = (cell) => Boolean((cell.textContent ?? "").trim() || cell.querySelector("img, svg, canvas, input, video"));
  const { columnOf, columns } = cellColumns(table);
  const fixed = table.classList.contains("doc-table--sticky-first") || Boolean(table.querySelector(':scope > tbody > tr > th[scope="row"]:first-child'));
  const before = new Set(); // columns some of whose words start before the edge
  const past = new Set(); // columns some of whose words reach past it
  const names = [];
  let reach = 0;
  for (const row of table.rows) {
    if (row.getClientRects().length === 0) continue;
    for (const cell of row.cells) {
      const column = columnOf.get(cell);
      if (names[column] === undefined && cell.colSpan <= 1 && holds(cell)) names[column] = (cell.textContent ?? "").replace(/\s+/g, " ").trim();
      if (fixed && column === 0) continue;
      if (cell.getBoundingClientRect().right - box.left <= width + 1) {
        if (holds(cell)) before.add(column);
        continue;
      }
      const found = wordsBox(cell);
      if (!found) continue;
      if (found.left - box.left < width - 1) before.add(column);
      if (found.right - box.left > width + 1) {
        past.add(column);
        reach = Math.max(reach, found.right - box.left);
      }
    }
  }
  const named = (column) => ({ column, name: names[column] ?? "" });
  const away = [...past].filter((column) => !before.has(column)).sort((a, b) => a - b).map(named);
  const cut = [...past].filter((column) => before.has(column)).sort((a, b) => a - b).map(named);
  const quoted = (list) => `${list.slice(0, 4).map(({ column, name }) => (name ? `"${name.length > 16 ? `${name.slice(0, 15)}…` : name}"` : `column ${column + 1}`)).join(", ")}${list.length > 4 ? ", …" : ""}`;
  const parts = [cut.length && `${cut.length} cut at the frame's edge (${quoted(cut)})`, away.length && `${away.length} out of sight (${quoted(away)})`].filter(Boolean);
  const rows = [...table.tBodies].flatMap((body) => [...body.rows]).filter((row) => row.getClientRects().length > 0);
  const shown = rows.filter((row) => {
    const { top, bottom } = row.getBoundingClientRect();
    if (bottom - box.top <= height + 1) return true;
    if (top - box.top >= height - 1) return false;
    return Math.max(-Infinity, ...[...row.cells].map(wordsBox).filter(Boolean).map((found) => found.bottom)) - box.top <= height + 1;
  }).length;
  return { columns, away, cut, said: parts.length ? `of ${columns} columns, ${parts.join(", ")}` : "", reach, rows: rows.length, shown };
}

/** tableHides as a script's text, with what it reads (an expression: the function), for a page to measure a table as the kit does. */
export const tableHidesScript = () => `(() => { ${cellColumns}; ${wordsBox}; return ${tableHides}; })()`;
