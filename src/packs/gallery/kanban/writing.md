# 看板 (gallery/kanban)

A board of a table of the document: each row a card, grouped by a column (a task's status, a deal's stage). The table holds the data and stays an ordinary table the reader can edit; the board is a view of it. Use it for tasks, a pipeline, anything whose rows move through a few states. A task that needs more than a line: link its first cell to a document of its own, and the card opens it.

## How to write it

Write a table, then the board after it, as example.html does (`gallery block show gallery/kanban` prints it):

- the table: an ordinary table of the document whose `<table>` carries `data-doc-chart-source="<key>"`, a key of the document's own (a letter, then letters, digits, `_` or `-`; 32 at most): its header row names the columns, its first column is each card's title, the other columns its words under the title, a link in any cell a chip on the card. No merged cells, no `<tfoot>`, every row as long as the header: the board reads such a table and cannot change it.
- the board: `<div data-doc-component="gallery/kanban" data-doc-from="<key>">`, the same key, holding its settings, one `<script type="application/json">` on one line:
  - `group`: the name of the column it groups by. Left out, it finds one: a column named like a status (状态, 进度, 阶段, status, stage), else the one whose values repeat most.
  - `order`: the groups first, in this order, comma-separated (`"待办,进行中,已完成"`), each shown even with no card; any other value the rows hold comes after them.

  Write `{}` for no settings. One table may have several views (another board, a 指标, a 图表), each with the same key.

The reader adds a board in Gallery from "/" (看板): it reads the nearest table above it, the key written on both; its menu's 设置… picks another table.

## How it looks

A muted line saying what it groups by, then the groups side by side (scrolling sideways past the width of the page), each on a soft fill with a colored dot (the kit's series colors, in the groups' order: list the groups in `order` so that they keep their colors), its name, its count and its cards. Where the page edits: a card dragged to another group changes its cell of that column and puts its row there in the table, dragged within its group puts its row before the card it is dropped on; the + at a group's head adds a row to the table, the caret in its title; the words of a card are typed in where they stand, as a figure's words are (a light blue fill under the pointer), each its cell, and a group's name renames the group, each of its rows' cell of that column and its place in `order` (named as another group, the two are one; a name with a comma in it leaves `order`); a cell holding a link or a mark is left to the table; a card's 🗑 takes its row out; the ⚙ at the board's right picks the column it groups by. Each is one undo step of the document's. In an exported file, 演示视图, and for a table it cannot change, it only shows. Where the block is not, a reader has the table.
