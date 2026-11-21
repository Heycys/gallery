# 指标 (gallery/metric)

One number of a table of the document, large under its name: how many rows (all, or those of one status), or the sum or the average of a column of numbers. It is a view of the table, read again as the table is typed in: the table holds the data, the metric never writes it. Use one or a few above a table of sales, tasks, expenses; put two or three side by side in the document's columns for a row of tiles.

## How to write it

Write a table, then the metric, as example.html does (`gallery block show gallery/metric` prints it):

- the table: an ordinary table of the document whose `<table>` carries `data-doc-chart-source="<key>"`, a key of the document's own (a letter, then letters, digits, `_` or `-`; 32 at most), its header row naming the columns. No merged cells.
- the metric: `<div data-doc-component="gallery/metric" data-doc-from="<key>">`, the same key, holding its settings, one `<script type="application/json">` on one line, each optional:
  - `op`: `"count"` (the rows; the default), `"sum"` or `"average"`;
  - `column`: the column summed or averaged (its cells' numbers; a cell with no number is left out). Left out: the first column of numbers;
  - `where` and `is`: only the rows whose cell of the column `where` is `is` (`{"where":"状态","is":"已成交"}`);
  - `title`: its name. Left out, one is made (行数, 金额合计, 状态为“已成交”);
  - `unit`: the words after the number (元, %, 个).

  One table may have several views (a 看板, a 图表, more metrics), each with the same key.

The reader adds a metric in Gallery from "/" (指标): it reads the nearest table above it, the key written on both; its menu's 设置… picks another table and changes its settings (so does its ⚙, where the page edits).

## How it looks

A framed card: its name small and muted, the number large with its unit, and under it a muted line only where there is more to know: of a count of one value, how many rows there are in all (共 12 行); of a sum or an average, how many rows had no number and were left out (有 1 行没有数，没算进去). Numbers keep two decimals at most and group their thousands. Side by side in the document's columns, two to four read as a row of tiles; alone it is a full-width card, so give it a name that says what the number is (`title`). Where the page edits, the reader types its name and its unit where they stand (a light blue fill under the pointer), which writes them in its settings (`title`, `unit`; a name emptied goes back to the one it makes); the number is the table's. In an exported file it shows the number the table holds there.
