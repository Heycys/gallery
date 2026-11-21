# Tables

A table is a container block (容器块) of cells: in the preview the reader edits the cells, adds, moves and deletes rows and columns, merges cells, sets column widths, resizes the table, and moves, deletes and copies it.

Use a table when the source is already rows and columns or the reader needs exact lookup. Write a plain table, with its scope or unit line as small text right above it:

<!-- you write -->
```html
<p class="doc-note">范围：两个候选实验 · 最新检查点<span class="doc-tab">单位：分</span></p>
<table>
  <thead><tr><th>实验</th><th>综合得分</th><th>相对基线</th></tr></thead>
  <tbody>
    <tr><td>候选 A</td><td>49.80</td><td>+2.60</td></tr>
    <tr><td>候选 B</td><td>48.90</td><td>+1.70</td></tr>
  </tbody>
</table>
```

The export (or the reader's first edit in the preview) wraps it, `div.doc-table-wrap` › `table.doc-table`, and gives its header row's cells the header look, bold words on a gray fill (`doc-bold doc-highlight-gray`). The two numeric columns, headers included, are centered and sortable; the first stays left-aligned. A `<caption>` becomes the small text above the table; `span.doc-tab` puts the rest of that line at its right end.

## What the kit does by itself

The shared table script (`/kit/tables.js`) enhances every `.doc-table`, the ones the reader puts back in the preview too. Write no table-specific JavaScript, width, or alignment markup.

- A column whose every non-missing body cell is numeric is centered, header included, set in tabular figures, and sortable. Numeric means a number with grouping, a sign, a currency, a percent or a unit (`120 ms`, `3.4亿`, `50 元/月`: 千, 万 and 亿 scale them), an approximate value (`约 30`, `≥ 90%`), a range (`3~5 天`, by its first number), full-width digits, or a cell with a numeric `data-sort-value`. Empty cells, `-`, `—`, `–`, `−`, `N/A`, `NA` and `null` are missing and sort last either way.
- A composite such as `95 / 42` is centered but sorts only when every non-missing cell gives one `data-sort-value`. A column that mixes numbers with words stays left-aligned and unsorted. The script owns `.number`: never write it.
- Rows keep the source order until the reader clicks a sortable header; equal values keep their order.
- Column widths come from the content: compact fields such as names and scores stay on one line when they fit, paths and prose share the rest with balanced wrapping, and long names wrap without spaces. When the columns cannot fit readably, the wrapper scrolls sideways instead of shrinking the text, its right edge fading while more columns lie past it. A table of at most 20 body rows, or one where at least half of the text is sentences, is shown whole; a longer table of data scrolls inside its wrapper (at most 72% of the viewport height or 720px) under a sticky, opaque header; printed, every table is shown whole. Widths are measured again on resize, font loading and when a hidden Sheet or disclosure shows; filtered rows still count.
- A cell holds inline text, or a short list (`<td>…<ul><li>…</li></ul></td>`, no attributes, one level). Cells may merge with `colspan` / `rowspan`, tiling the rows into a rectangle; a table whose header or body has merged cells is never sorted and has no numeric columns. A header column (each body row's first cell a `<th scope="row">`) stays at the left when the table scrolls sideways, as the header row stays at the top, with no look of its own (no bold, no gray fill: the export and the page editor's 标题列 give it none).

## What you may add

- `data-doc-table-static` on the table, only when the row order is itself information (a timeline, steps, a ranking) that a reader's sort would mislead about. Numeric alignment still applies.
- `data-sort-value` on each formatted cell of a column (`$1.84`, `18,420`) to give it a number; `data-sort-default="asc|desc"` on a header for an initial sort; `data-sort-type="text|number|date"` to make a column sortable (text and date columns need it) or override what the script reads (a `text` or `date` header also keeps its column from being read as numbers: write `data-sort-type="text"` on dates such as 10.16 or versions such as 1.10); `data-sort-ignore` on a numeric header to keep it centered but unsorted; `data-sort-rank` on the cells of a rank column to number them again after a sort; `data-sort-status` on the table pointing to a live status element.
- `data-number-columns="off"` on the table when the numbers are labels, codes or years: no column is read as numbers.
- `.doc-table--sticky-first` on the table only when row identity must stay visible while scrolling sideways. The kit fills that column's cells itself, with their `doc-highlight-*` color or the table's own fill: color such a cell with a class, never a `style`.
- A cell's looks, as the preview writes them: one color (`doc-text-<color>` or `doc-highlight-<color>`), `doc-bold`, one `doc-align-left|center|right`, one `doc-valign-top|middle|bottom`.
- Sizes in the wrapper's `style`: `--doc-span`, its width as a share of the width it stands in (above `1` the table is that many times wider and scrolls inside it), and `--doc-table-height: 480px` (or `none`). Written in a plain `<table>`'s `style`, the conversion moves them onto the wrapper it makes (the rest of the style stays on the table); on a table already in its wrapper they are the wrapper's to carry. The reader sets them by dragging the table's edges, and the widths of columns as `--doc-column-width` on a cell of each column; keep all of them when editing a document, and never write column widths yourself.

<!-- you write -->
```html
<p id="sort-status" class="doc-note" aria-live="polite">当前排序：综合得分 · 降序</p>
<table data-sort-status="#sort-status">
  <thead>
    <tr>
      <th data-sort-ignore>排名</th>
      <th data-sort-type="text" data-sort-key="model">模型</th>
      <th data-sort-key="score" data-sort-default="desc">综合得分</th>
      <th data-sort-key="cost">成本 / 题</th>
    </tr>
  </thead>
  <tbody>
    <tr><td data-sort-rank>1</td><td>Model A</td><td>88.7</td><td data-sort-value="1.84">$1.84</td></tr>
    <tr><td data-sort-rank>2</td><td>Model B</td><td>86.9</td><td data-sort-value="">—</td></tr>
  </tbody>
</table>
```

## Sort as state

Bind a table to a key ([state.md](state.md)) to keep its sort, or to share it: `<table data-doc-bind="sort">`, with `data-doc-transient` when it should not outlast the visit. Rows shown for a key's value carry `data-doc-show="key:value"`.

## A chart from a table

A table can be a chart's data: `data-doc-chart="<type>"` on it, the type one the document's script defines, puts a card right after it whose chart is drawn from its rows, again whenever the reader edits a cell, adds or removes a row, or sorts it in the preview ([custom-chart.md](custom-chart.md#data-from-a-table)). Each value is read as the sort reads it: a cell's `data-sort-value` first, `data-sort-type="text"` or `"date"` keeping a column's words, a missing value `null`; a total goes in a `<tfoot>`, which no chart reads; merged cells draw nothing.

## For scripts

When a script writes a table from data, it emits plain headers and cells (the header look aside) and lets the shared script inspect every body cell:

```js
// Wrong: position does not prove that a column is numeric.
header.map((cell, index) =>
  `<th class="${index === 0 ? "" : "number "}doc-bold doc-highlight-gray">${cell}</th>`
);

// Correct: keep source semantics and let the shared script inspect every body cell.
header.map((cell) => `<th class="doc-bold doc-highlight-gray">${cell}</th>`);
```

A custom renderer can call the same width allocator from data; ordinary documents need neither call:

```js
const layouts = DocTables.allocateColumnWidths([
  {key: "model", header: "Model", cells: rows.map(row => row.model)},
  {key: "score", header: "Score", cells: rows.map(row => row.score)},
  {key: "source", header: "Source", cells: rows.map(row => row.source)},
], {totalWidth: 1000, font: "15px system-ui"});
```

Each result includes `key`, `kind`, `preferredWidth`, `softMinWidth`, `hardMinWidth`, `width`, and `ratio`; preserve at least the sum of returned widths when it exceeds the viewport. `DocTables.layout(table)` remeasures a mounted table at once and returns its layout (a hidden table returns the last valid layout or `[]`). `DocTables.getState(target)` returns `{sort: {column, key, direction}}` or `{sort: null}`; `setState(target, {sort: {column, direction}})` sorts a valid sortable column and `setState(target, {sort: null})` restores source order; `subscribe(target, listener)` documents changes and returns an unsubscribe function.
