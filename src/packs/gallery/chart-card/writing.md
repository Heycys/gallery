# 表格图表卡片 (gallery/chart-card)

Gallery leaves this block out of the menus ("/", 在下方新建, the handle's grid) until the user turns it on in 设置 › 组件列表, and a document that has it shows and edits it as ever. Do not write it into a document: for a chart of a table, draw one of the document's own from the table (references/writing-html.md, "Figures and charts"), or write an ordinary table and `gallery/chart-view` after it.

A card with a title, a table, and the bar chart the block draws from that table, with no script of the document's. Use it for a comparison of a few numbers by name (channels, teams, months) that the reader may change; for any other chart, write a chart of the document's own (references/writing-html.md, "Figures and charts").

## How to write it

Write the element as example.html does (`gallery block show gallery/chart-card` prints it):

- the title, its `h3`: what the numbers are, with their unit.
- the table, in its `<div data-doc-slot="table">`: a plain table of the document's, with no `data-doc-chart` and no `<caption>` (the card's title is its title):
  - its header row: the names of the columns;
  - the first column: the name of each bar;
  - each column after it that holds numbers: a series, its header the legend's words (two or more draw their bars one under another, a legend above them);
  - a cell with no number (empty, a dash, `n/a`): no bar. A number may have thousands separators and a `%`.

The reader edits the table as any table of the document's, and the bars draw again.

## How it looks

A framed card: the title, horizontal bars from zero with each value at its end, in the kit's series colors, which follow the theme, then the table; in a narrow card (a phone, a column of a row) each name stands over its bars. Two or three series read well; past that, write a chart of the document's. The bars are drawn by the block's script and are not in the file: where the block is not, and in a Markdown export, a reader has the title and the table.
