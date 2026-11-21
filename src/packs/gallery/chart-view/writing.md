# 图表 (gallery/chart-view)

A bar chart of a table of the document: the rows counted, summed or averaged by a column (tasks by status, sales by region), or a bar for each row's number. It is a view of the table, drawn again as the table is typed in: the table holds the data, the chart never writes it. Use it beside a 看板 or a few 指标 over the same table. For a chart of numbers written for the chart alone, use 表格图表卡片 (gallery/chart-card), whose table is its own; for any other kind of chart, a chart of the document's (references/writing-html.md, "Figures and charts").

## How to write it

Write a table, then the chart, as example.html does (`gallery block show gallery/chart-view` prints it):

- the table: an ordinary table of the document whose `<table>` carries `data-doc-chart-source="<key>"`, a key of the document's own (a letter, then letters, digits, `_` or `-`; 32 at most), its header row naming the columns, the first column naming each row. No merged cells.
- the chart: `<div data-doc-component="gallery/chart-view" data-doc-from="<key>">`, the same key, holding its settings, one `<script type="application/json">` on one line, each optional:
  - `by`: the column whose values are the bars, the rows grouped by it in the order they first say them. Left out, a column named like a status (状态, 阶段, status), else one whose words repeat; with none, a bar for each row (its first cell its name; at most 50);
  - `op`: `"count"`, `"sum"` or `"average"` of each group's rows. Left out: `"sum"` where the table has a column of numbers, else `"count"`;
  - `value`: the column of numbers summed, averaged, or drawn a bar a row. Left out: the first column of numbers;
  - `title`: what it shows, with its unit. Left out, one is made (各状态的行数, 各区域的金额合计).

  One table may have several views (a 看板, 指标, another chart), each with the same key.

The reader adds a chart in Gallery from "/" (图表): it reads the nearest table above it, the key written on both; its menu's 设置… picks another table and changes its settings (so does its ⚙, where the page edits).

## How it looks

A framed card: its title, then horizontal bars from zero, each with its name and its value, in the kit's series color, which follows the theme; in a narrow card (a phone, a column of a row) each name stands over its bar. Name the bars in a few words: a long name takes room from the bars. Where the page edits, the reader types its title and a bar's name where they stand (a light blue fill under the pointer): the title its setting `title`, a bar's name what the bar stands for in the table (a group's value in each of its rows, or a row's first cell); the numbers are the table's. The bars are drawn by the block's script and are not in the file: where the block is not, and in a Markdown export, a reader has the table.
