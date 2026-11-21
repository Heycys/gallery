# 任务看板

Tasks as cards in columns by their status, the work of a release, a project or a week, for a reader who moves a card when its task moves on. Use it where the tasks change while the document is read; a list of tasks that only says what was done is a table or a to-do list.

## How to write it

Write the element as example.html does: `gallery block show local/kanban` prints it.

- the title, its `h3`: required.
- the tasks, its `table`: a header row, then a row for each task. The first cell is the card's title and the second its status; the cells after them (who, when) show under the title, in their order. No cell spans others.
- `data-columns` on the instance: the columns, in their order, separated by commas (`data-columns="待办,进行中,已完成"`). A column with no card yet still shows; a status no column names gets a column of its own at the end. With none, the columns are the statuses in the order the rows first say them.

A task is added, renamed or taken out in the source: in the page a reader moves cards and nothing else.

## How it looks

The columns side by side, each with its count of cards, scrolling inside the board where they are wider than the page, and a field above them that filters the cards by their words. Without its script (a reader with no such package, a Markdown export) it is the table itself.

## Its script

kit.js runs with the rights of a document's own script. It draws the board in `.kanban-board` and hides the table while it does. Where the page edits, a card dragged to another place writes the table: its row moves among the others and its status cell takes the column's, one undo step for the drag. In an exported file nothing is dragged, and the filter, which is each reader's own, still works.
