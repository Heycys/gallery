# Databases (多维表格)

A 多维表格 is a block of records that the reader sees as a table, a board, a list, cards, a calendar or a chart. Each view has its own filters, sorts, grouping, hidden columns and totals, and the reader edits where it stands: every change the reader makes is written back into `doc.html`. Read this before you write one, change one, or turn a table into one. [writing-html.md](writing-html.md) has the rest of the page's rules.

Everything a reader can do to a database you do by editing its two parts in `doc.html`: the JSON of its columns and views, and the table of its records. The file is the truth: the page reads it again as you write it, a reader's open page too.

Sections: [When to use one](#when-to-use-one) · [The format](#the-format) · [Columns](#columns) · [Values in cells](#values-in-cells) · [Views](#views) · [Formulas](#formulas) · [Records' bodies](#records-bodies) · [Changing one](#changing-one) (records, columns, options, views, width, a table turned into one) · [Read-only](#read-only) · [Reading and checking it](#reading-and-checking-it).

## When to use one

- **A database:** records of the same fields that the user keeps changing or looks at in several ways: tasks by status and owner, a backlog, a pipeline, a reading list, people and their roles, a log with dates. Use one when the user asks for a board (看板), a calendar (日历), a filtered or sorted view, totals per group, or a chart of records counted or summed.
- **A plain table** ([writing-html.md](writing-html.md#tables)): a fixed table of figures, a comparison, a table whose cells need bold, links, code or pictures, merged cells or a total row, and a table a chart of yours draws from (`data-doc-chart`). A database's cells hold words alone.
- A count or sum of a plain table kept in step is `gallery/metric` (SKILL.md); inside a database, totals are its own (`calc`, below), and a chart of its records is a view of it.
- A page of its own for each record (the user's 详情页, “每条一页”, “这条记录自己的页面”, notes or minutes about one record) is that record's body: [Records' bodies](#records-bodies).

## The format

One block, `div.doc-database`, holding two parts, straight inside it: a `<script type="application/json">` with its columns and views, then a `<table>` with a row per record; and, where records have a body ([Records' bodies](#records-bodies)), a `div.doc-database-pages` after the table. Nothing else goes in the div: a heading or a paragraph about it stands before or after it.

<!-- the file holds -->
```html
<div class="doc-database">
  <script type="application/json">{
    "columns": [
      { "id": "title", "name": "任务", "type": "title", "width": 220 },
      { "id": "status", "name": "状态", "type": "select", "options": [
        { "name": "待开始", "color": "gray" },
        { "name": "进行中", "color": "blue" },
        { "name": "已完成", "color": "green", "done": true }
      ] },
      { "id": "owner", "name": "负责人", "type": "select", "options": [{ "name": "林夏", "color": "orange" }, { "name": "周舟", "color": "purple" }] },
      { "id": "tags", "name": "标签", "type": "multi", "options": [{ "name": "前端", "color": "blue" }, { "name": "后端", "color": "pink" }] },
      { "id": "due", "name": "截止", "type": "date" },
      { "id": "hours", "name": "工时", "type": "number" },
      { "id": "progress", "name": "进度", "type": "number", "numberFormat": { "format": "percent", "decimals": 0, "display": "bar" } },
      { "id": "reviewed", "name": "已评审", "type": "checkbox" },
      { "id": "link", "name": "链接", "type": "url" },
      { "id": "left", "name": "剩余工时", "type": "formula", "formula": "ROUND({工时} * (1 - {进度}), 1)" },
      { "id": "notes", "name": "备注", "type": "text", "notes": true }
    ],
    "views": [
      { "id": "all", "name": "全部", "layout": "table", "calc": { "hours": "sum" }, "showCalc": true },
      { "id": "board", "name": "看板", "layout": "board", "boardBy": "status", "hidden": ["status", "tags", "progress", "reviewed", "link", "left"] },
      { "id": "calendar", "name": "日历", "layout": "calendar", "dateBy": "due", "hidden": ["tags", "hours", "progress", "reviewed", "link", "left"] },
      { "id": "hours-chart", "name": "工时", "layout": "chart", "chart": { "kind": "column", "x": "owner", "agg": "sum", "y": "hours" } },
      { "id": "open", "name": "未完成", "layout": "list", "filters": [{ "prop": "status", "op": "isnot", "value": ["已完成"] }], "sorts": [{ "prop": "due", "dir": "asc" }] }
    ]
  }</script>
  <table>
    <thead><tr><th data-column="title">任务</th><th data-column="status">状态</th><th data-column="owner">负责人</th><th data-column="tags">标签</th><th data-column="due">截止</th><th data-column="hours">工时</th><th data-column="progress">进度</th><th data-column="reviewed">已评审</th><th data-column="link">链接</th><th data-column="notes">备注</th></tr></thead>
    <tbody>
      <tr><td>登录页改版</td><td>已完成</td><td>林夏</td><td>前端</td><td>2026-11-12</td><td>12</td><td>1</td><td>✓</td><td><a href="https://example.com/spec/login">方案</a></td><td></td></tr>
      <tr><td>接口限流</td><td>进行中</td><td>周舟</td><td>后端</td><td>2026-11-28</td><td>16</td><td>0.4</td><td></td><td></td><td>先做登录接口。<br>其余下周。</td></tr>
      <tr><td>看板拖拽</td><td>待开始</td><td>林夏</td><td>前端, 后端</td><td>2026-12-03</td><td>8</td><td>0</td><td></td><td></td><td></td></tr>
    </tbody>
  </table>
</div>
```

- **The JSON** holds `columns` and `views` and nothing else: the records are never in it. It is plain JSON: double quotes, no comments, no trailing commas. A column and a view each have an `id` of their own (letters, digits, `-`, `_`; it never changes once written: views and the header name columns by it) and a `name` the reader sees.
- **The table** has one header row (`<thead><tr>` of `<th>`) and one `<tbody>` of rows (`<tr>` of `<td>`), nothing more: no `<caption>`, `<tfoot>`, `<colgroup>`, second header row or second body.
- **Header and rows:** each header cell names its column by `data-column="<id>"`; its words are the column's name, the same as the JSON's `name`. Each row is a record, its cells in the header's order, one cell per header cell (`<td></td>` for no value).
- **Order:** the records show in the table's row order (a reader's drag moves a `<tr>`); the columns in the JSON's `columns` order (the page writes the header in that order on its first change); the views as tabs in `views` order, the first shown first.
- **A formula column** (`"type": "formula"`) is in the JSON alone: no header cell, no cells. Its values are worked out where they show.
- **Records have no ids** in the file: a record is its row, but for one with a body, whose row says its id (`data-record`, below). Do not add `data-block-id` or any other id inside the table; the export gives the div itself one.
- A `div.doc-database` holding a table and no script is read as columns of words named by its header, the first the title, with one table view: a quick start, but write the JSON for anything more.

## Columns

| `type` | A cell holds | Fields of its own |
|---|---|---|
| `title` | the record's name, words | exactly one column; the first if none says it |
| `text` | words; a line break `<br>` | `"notes": true`: the records' notes (below) |
| `number` | a number as its value: `12`, `0.6`, `-3.5`, `1234.5` | `numberFormat` |
| `select` | one option, by its name | `options` |
| `multi` | options by their names, apart by `, ` | `options` |
| `date` | `2026-11-12` | |
| `checkbox` | `✓` checked, empty unchecked | |
| `url` | an address, or one `<a href="…">words</a>` (its value the address) | |
| `formula` | no cells | `formula` |

Every column takes `id`, `name`, `type`, and `width` (pixels, 40 or more; else as wide as its kind is). `align` (`left`, `center`, `right`) is for a number, date or formula column. A field that is none of these is not read: there is no `format`, `choices`, `description` or `default`.

- **Options** (select, multi): `[{ "name": "进行中", "color": "blue" }, …]`, in the order they show (a board's columns, a chart's categories, a sort by the column all follow it).
  - `color` is one of `gray` `brown` `orange` `yellow` `green` `blue` `purple` `pink` `red` (none: no color).
  - `"done": true` on a select's option makes its records done: their titles drawn faded and their dates never shown late (a board's 已完成).
  - An option's name holds no comma or `、` (they part the names in a cell).
  - **Ids:** in a new column give an option no `id`: its id is its name. A database whose options have ids (`"id": "s1"`, as the page writes one it renamed) takes a new option with an id of its own or none, either reads. Cells name an option by its name always, views by its name or its id.
  - A cell naming an option the column does not list shows it as a new option of a color picked in turn (`gallery check` notes it); the page writes it into `options` once the reader changes that column.
- **Numbers:** `"numberFormat": { "format": "percent", "decimals": 0, "display": "bar" }`, each field optional. The cell always holds the plain value; the format is how it shows.
  - `format`: `number` (the default), `thousands` (1,234.5), `percent` (the cell holds `0.6` and shows `60%`), `cny` (¥1,234.50), `usd`.
  - `decimals`: 0 to 6 (none: as many as the value has, money two).
  - `display`: `number`; `bar`, a bar of the value: of a percent's own (write `"format": "percent"` for values from 0 to 1, a progress), else against the column's largest; `stars`, the value as stars out of five (rounded: 3.5 shows four, more than 5 shows five; `decimals` does nothing to them). An empty cell shows no bar and no stars.
  - A formula column has no `numberFormat`: its numbers show as numbers; a bar or stars need a number column.
- **The notes column:** a `text` column with `"notes": true` is the records' notes: words of several lines (`<br>`), never a column of a view. It has a header cell and a cell in each row like any column. One per database.
  - A record's details show its notes under its values where it has no body, and the reader's first word there turns them into the body's first paragraph (the notes cell emptied).
  - Where a record has a body and notes, the details show the notes among its values, over the body. Write longer words about a record as its body ([Records' bodies](#records-bodies)).
- **A formula:** `"formula": "{工时} * 2"` (below).

## Values in cells

Write each cell as a reader would read it, the value alone: `12`, not `12 小时` (say the unit in the column's name); `2026-11-28`, not `11月28日` or `下周五`; `✓` or nothing; an option's exact name.

Inside a cell: words, `&amp;`-style entities, `<br>`, and in a url column one `<a href>`. Nothing else: no `<strong>`, `<code>`, `<span>`, picture or attribute but `scope`, `class`, `id`, `lang`, `dir`, `title` and `data-*` (not `data-column`, `data-block-id` or Gallery's own `data-doc-*`).

What is read anyway, and how it then shows: `60%`, `1,234.5` and `¥12` read as numbers; `2026/11/2` and `2026.11.2` as dates; `x`, `1`, `true`, `yes`, `是`, `对` as checked and `0`, `false`, `no`, `否` as not; a multi's names apart by `，` or `、` too.

A cell that is no value of its column (`3天` in a number column, `下周` in a date column, two names in a select) stays as written and shows gray; filters, sorts, totals and charts leave it out until the reader changes it. `gallery check` notes each such column.

## Views

A view is `{ "id": "…", "name": "…", "layout": "…" }` with the settings below, each optional. Every column a view names, it names by its **id**, never its name; an option, by its name. A view with no `name` shows its layout's name (表格, 看板…).

| `layout` | Shows | Its own settings |
|---|---|---|
| `table` | a grid, a column each | `groupBy`, `calc`, `showCalc`, `wrap`, `clickEdit` |
| `board` | a column per option of a select, a card per record | `boardBy` (needed), `cardSize` |
| `list` | a line per record: its title, its values at the right | |
| `gallery` | a wall of cards | `cardSize` |
| `calendar` | a month, each record on its date's day; those of no date under 未排期 | `dateBy` (needed) |
| `chart` | the records counted or summed by category | `chart` (needed) |

Every layout takes `filters`, `hidden` and `open`, and all but a chart `sorts`.

- **`hidden`:** the ids of the columns it does not show (the title always shows). On a board, a list, cards and a calendar the columns it shows are a card's fields: hide all but the two or three a card needs, as the example's board does (a board need not show the column it is grouped by).
- **`filters`:** `[{ "prop": "<column id>", "op": "<condition>", "value": … }]`; a record shows when it meets every one (there is no "or"). The conditions and their values, by the column's kind:

| Column | `op` | `value` |
|---|---|---|
| title, text, url | `contains`, `ncontains`, `eq` | words |
| number | `eq`, `ne`, `gt`, `lt`, `gte`, `lte` | a number; a percent column's as it shows (`60` for 60%) |
| select | `is`, `isnot` | a list of option names: `["进行中", "待开始"]`; `"__none"` for no value |
| multi | `has` (any of them), `nhas` | a list of option names |
| date | `on`, `before`, `after` (the day itself out), `onbefore`, `onafter` (the day itself in) | `"2026-11-30"`, or `"today"`, `"tomorrow"`, `"yesterday"`, `"nextweek"`, `"lastweek"` (the day a week on, or back) |
| checkbox | `is` | `true` or `false` |
| formula | `contains` (words), `gt`, `lt` (a number) | |
| any | `empty`, `nempty` | none |

  - A select's or a multi's value is always a list, even of one name. "Not done" is `isnot` the done options (`["已完成"]`), or `is` the others. A view that already filters takes a new condition beside its others (they all hold).
  - There is no "me", no reader a view knows: "my tasks" filters the column of people by the user's own name (ask it when you do not know it), and says so in its view's name.
  - There is no "this month" or "this week": the dates a filter moves with are those five days. A month is `onafter` its first day and `onbefore` its last, fixed (say so in the handoff: it does not move on to the next month).
  - `"segments": true` on a select's `is` or a multi's `has` filter shows its options as a row of buttons with their counts, one click switching between them (its `value` `[]`: all). A filter may carry an `id`; the page gives one where it has none.
- **`sorts`:** `[{ "prop": "<column id>", "dir": "asc" }, …]` (`asc` or `desc`), the first deciding first; records of no value come last. A select sorts by its options' order. Where a view sorts, a reader's drag cannot reorder its records.
- **`open`:** where a record's details open, `side` (the default for a table, a board, a list) or `center` (for cards, a calendar, a chart).
- **A table:**
  - `groupBy`: a column's id (a select, multi, checkbox, date, text or number column): a heading row per value, in the options' order, each folded by a click. Hide the column it groups by: its heading rows say it.
  - `calc`: totals under the table and on each group's heading, `{ "<column id>": "<kind>" }`, shown with `"showCalc": true` (without it they are kept but hidden).
  - The kinds of total: every column `count`; all but a checkbox `filled`, `empty`; a number or formula `sum`, `avg`, `min`, `max`, `range`; a checkbox `checked`, `unchecked`, `pctChecked`; a title, text, select, multi, url or date column `unique`, `pctFilled`; a date `earliest`, `latest`.
  - `"wrap": true` wraps long words in cells; `"clickEdit": true` has a click edit a cell at once (else a click selects it and a second click or typing edits).
- **A board:** `boardBy`, a select column's id. Its columns are that column's options in their order (reorder the options to reorder them), with a column of the records of no value while there are some.
  - A board shows a column for every option: it hides none (a `boardHidden` in the file is kept and does nothing). To leave an option's records off it, filter the view (`isnot` that option), and say so to the user.
  - `cardSize` `s`, `m` or `l`. A card dragged to another column changes that cell.
  - With `sorts` the cards of a column keep that order and a drag cannot put one between others, so a board grouped by a column needs no sort by that same column.
- **A calendar:** `dateBy`, a date column's id (a formula giving a date works too). The month shown is the reader's.
- **Cards** (`gallery`): `cardSize` `s`, `m`, `l` (the size of each card).
- **A chart** (the database's own: nothing of charts-and-figures.md is needed for it): `"chart": { "kind": "column", "x": "<column id>", "agg": "count" }`. It draws the records its `filters` keep; it has no sorts or hidden columns.
  - `kind`: `column`, `bar`, `line`, `donut` (a ring of each category's share, its total in the middle, a legend with each one's number and percent).
  - `x`: the column its records are put in categories by: a select (its options in their order, each though no record has it), a multi (a record in each of its options: the counts can add up to more than the records), a checkbox, a date, a title, a text or a number column.
  - `agg`: `count` (the records), `sum` or `avg` of `y`, a number or formula column's id (needed with sum and avg).
  - `color`: one of the nine, the categories in shades of it, in their order ("in greens", 绿色系: `"green"`); none: each category its option's color (a brown or orange option drawn in another).

What a reader does that is theirs alone, never the file's: the view shown, the search, the calendar's month, a group folded, the width of a record's details, a CSV exported. The rest is in the file.

## Formulas

A formula column's `formula` works out a value for each record from the record's other values:

- `{name}` or `{id}` is the record's value of that column; either reads, mixed too. The page writes ids, `{hours}`, once it changes the database; `gallery read` prints names. A select gives its option's name, a multi its names (`LEN` counts them), a date `"2026-11-12"`, a checkbox `true` or `false`, an empty cell `""` (0 in arithmetic).
- `+ - * /`, `&` joins words (`"共 " & {工时} & " 小时"`), comparisons `= != < > <= >=` (dates compare as their words), `"words"` in double quotes, `TRUE`, `FALSE`, parentheses.
- Functions: `IF(cond, yes, no)`, `ROUND(n, places)`, `ABS(n)`, `MIN(a, b, …)`, `MAX(…)`, `SUM(…)`, `CONCAT(a, b, …)`, `LEN(words)`, `TODAY()`, `DAYS(end, start)` (days between two dates), `AND(…)`, `OR(…)`, `NOT(a)`. Nothing else: no `IFS`, `SWITCH`, `YEAR`, `MONTH`, `COUNT` over records, no reference to other records.
- A failure shows in the cell (`#错误`, its reason under the pointer): a column it names that there is not, a division by 0, words that are no number in arithmetic, formulas naming each other round. `gallery check` notes a column or a function that is not there.
- Examples: `IF({进度} >= 1, "已完成", "进行中")`; `DAYS({截止}, TODAY())` (days left, negative when late); `IF(AND({状态} != "已完成", DAYS({截止}, TODAY()) < 0), "逾期", "")`; `ROUND({金额} * 0.06, 2)`; `IF({状态} = "已解决", 0, MAX(0, {预计} - {已用}))` (what is left, never below 0).

A formula's values show as numbers (two decimals at most), words or a box; views filter, sort, total and chart them like any column. A sum, an average, a minimum or a maximum (a total's or a chart's) takes its numbers alone, `""` and words left out; a sort puts the empty last.

`TODAY()` is the reader's day, worked out as the page shows (an export's too, on the day it is opened). `IF({截止} = "", "", DAYS({截止}, TODAY()))` leaves a record of no date empty.

## Records' bodies

A record may have a body: its own page of the document's blocks (headings, paragraphs, lists, a to-do list, pictures, a table, a callout…), what a reader sees under its values when its details open, edited there as any part of the page.

Its row names it (`data-record="<id>"` on its `<tr>`: letters, digits, `-` and `_`, no other row's). After the table, one `div.doc-database-pages` holds a `<div data-doc-slot="record:<id>">` per record that has a body, its blocks inside, written as anywhere in the document:

<!-- the file holds -->
```html
<div class="doc-database">
  <script type="application/json">{ "columns": [{ "id": "title", "name": "任务", "type": "title" }], "views": [{ "id": "all", "layout": "table" }] }</script>
  <table>
    <thead><tr><th data-column="title">任务</th></tr></thead>
    <tbody>
      <tr data-record="login"><td>登录页改版</td></tr>
      <tr><td>接口限流</td></tr>
    </tbody>
  </table>
  <div class="doc-database-pages">
    <div data-doc-slot="record:login">
      <h2>要点</h2>
      <ul>
        <li>先做手机号登录</li>
        <li>邮箱登录下周</li>
      </ul>
    </div>
  </div>
</div>
```

- A record with no body has no slot, and its row needs no `data-record`. To give one a body, add the attribute to its row and its slot to the pages (the pages after the table, where there are none yet).
- A body holds blocks alone (no words straight in the slot) and no database, however far in. Its blocks are written as anywhere ([writing-html.md](writing-html.md)), and work in the details as on the page:
  - a to-do list (`<ul><li><input type="checkbox"> …`), its boxes ticked there;
  - a place for a picture the reader adds later: `<figure class="doc-image"></figure>`, the editor's empty picture (添加图片, which a click or a paste fills), no reader's export shows it. Not a line of words asking for one.
- **A record with notes** given a body: move its notes into the body's first paragraph and empty its notes cell, as the page does; or leave them in the cell, where its details show them among its values, over the body. Not the same words in both places, which the details would show twice: `gallery check` notes a body that opens with its notes word for word.
- There is no template: a body is one record's, and a record added later has none until someone writes one. Say so in the handoff when the user asked for the same page in every record.
- Change a body as any blocks of the document, finding it by its slot. Take a record's slot out to take its body away; deleting a record, take its slot out too.
- `gallery read <slug>` shows each body under its record's title, after the table; `--format markdown` writes them there too. `gallery check` names the records that have a body in its `database` line, and notes a body of no record (no row says its id), two bodies of one record, two rows of one id, and what in the pages is no body.

## Changing one

Edit the parts in place, as SKILL.md's Revising a document says: replace exact spans, keep what you do not change byte for byte (the reader's edits are in it: its layout, its options' colors, its views). Change the JSON and the table together when a change touches both, in one write. Read it first with `gallery read <slug>` (below).

- **Add records:** a `<tr>` with a `<td>` per header cell, in the header's order, where it should stand (the end, or among the rows it belongs with). An empty cell is no value.
- **Change records:** change the cells' words; to change many (everything of one owner to 已完成), change each row's cell of that column, finding each row by its cells. A select's cell takes one of its options' names exactly.
- **Delete records:** take their `<tr>` out whole.
- **Add a column:** its object in `columns` (where it should show), a `<th data-column="<id>">name</th>` in the header row, and a `<td>` in every row at the same place, in that order of cells (an empty one where a record has no value).
  - A select or multi column lists its options with their colors. A formula column is its object alone.
  - Every view shows the new column unless its `hidden` lists it: add its id to the `hidden` of a board, a list, cards or a calendar whose cards should stay as they were (the `database` line says what each view's cards show).
- **Rename a column:** its `name` in the JSON and its header cell's words, both; a formula naming it `{old name}` is changed too (one naming it by id needs nothing). Its id stays.
- **Change a column's kind:** its `type` (and the fields of the new kind: `options` for a select, listing every value its cells hold), and its cells rewritten as the new kind reads them (a number alone, a date `2026-11-12`, an option's name, `✓`). Views that filter it take the new kind's conditions.
- **Delete a column** (its values go with it: `gallery revert` or `gallery history` brings them back), in one write:
  1. its object in `columns`;
  2. its header cell, and in every row the cell at that place (count the cells: a formula column has none);
  3. every place that names it by id: views' `hidden`, `filters` (`prop`), `sorts`, `groupBy`, `calc`, `boardBy`, `dateBy`, `chart` `x` and `y`;
  4. every formula that names it, by name or id (`{用户价值}`).

  `gallery check` then notes any place still naming it.
- **Options:** add one to `options`; recolor it by its `color`; reorder `options` to reorder a board's columns.
  - Rename one: its `name`, every cell that names it, and every filter value that names it (an option of no `id` is named by its name everywhere; one with an id keeps it, and its filters need nothing).
  - Delete one: take it out of `options` and change or empty each cell that names it (one still naming it shows it again as a new option).
- **Add a view:** an object at its place in `views`, an `id` no other view has; a filtered and sorted one is `filters` and `sorts` as above. Change a view by its settings; delete one by taking it out (keep at least one).
- **Move records or columns:** move the `<tr>`; reorder `columns`.
- **Wide:** 宽多维表格 (a database wider than the text drawn across the page, every view as wide as its table) is the document's look: `gallery set <slug> --wide-databases on`. `data-doc-wide="on"` or `"off"` on one `div.doc-database` sets that database alone, over the look: "this one wide" is the attribute, and the document's other tables and databases stay as they are.

**Turning a plain table into one:** make `div.doc-database` hold a JSON script and the table itself. After an export a table stands in a `div.doc-table-wrap`: the database replaces that div, keeping its `data-block-id`, the `<table>` moved into it as it is (its `class` attributes may stay). Run `gallery read <slug> --format json` before and after, and compare the records (`records` under the block's `data`) with the table's rows, so that nothing is lost.

1. One header row: each `<th>` gets `data-column="<id>"`, and the JSON a column of that id and name, with the kind its cells are (a column of a few repeated words is a select, its options those words; numbers a number column; dates a date column).
2. Cells hold their values alone: take out bold, code, spans and links, unit words (into the column's name), and percent signs where you set the percent format (or keep `60%`, read as 0.6).
   - A column of links becomes a url column: one `<a href>` per cell.
   - A cell of words and a link, in a column of words: the words stay; the link goes into a url column of its own, in the same row.
3. What the format cannot hold goes: a `<caption>` (put it in a heading or a paragraph before the database), a `<tfoot>` or a total row (a table view's `calc` with `showCalc`), merged cells (one value per cell), `style` and `colspan` attributes.
4. A chart, a `gallery/metric` or a link that read the old table by its key (`data-doc-chart-source`) reads nothing now: make it a chart view of the database, a total, or keep the plain table.
5. Add the views asked for; check it (below). In the handoff, say what the table held that the database could not: bold, a total row, a caption moved, merged cells, a link moved.

## Read-only

A database whose file holds what its format cannot is shown read-only, with a note under its head saying why, and the page writes nothing of it: the reader's edits are refused until you fix it. `gallery check` fails JSON that does not read, and prints the rest first among its lines, each problem at its line (`fix <slug>: line N: database read-only: …`). Each, and its fix:

| Said | Fix |
|---|---|
| the JSON does not read | valid JSON: double quotes, no trailing comma, no comment, no `</script` inside a string (write `<\/script`) |
| a `<tfoot>`, `<caption>`, `<colgroup>` | take it out (totals: `calc`; a title: a heading before the database) |
| more than one header row, several `<tbody>` | one `<thead><tr>`, one `<tbody>` |
| cells past the header, merged cells (`colspan`, `rowspan`) | one cell per header cell in each row (words in a cell past the header: into the cell they belong in, the notes if none, and say so) |
| a cell holds a `<tag>` | words and `<br>` alone; a url column's cell one `<a href>` |
| a link in a column that is no url's | make that column `url`, or keep the words alone |
| an attribute (`style`, `data-block-id`, a handler…) | take it out of the table |
| an address of code (`javascript:`…) | take it out |
| a comment in the table | take it out |
| two header cells of one `data-column` | each column one header cell |
| a formula column's cells | a formula column has no header cell and no cells |

## Reading and checking it

- **Find it:** `gallery read <slug> --outline` lists the document's databases after its headings, each with its line, its id, the heading it follows, its columns, records and views. `gallery read <slug> --block <id>` then reads that database alone (one with no id yet: `--section <heading id>`, the section holding it).
- **Read it:** `gallery read <slug>` shows a database as a box:
  - its columns, each with its id, kind and options (options the cells name that the JSON does not list; a number's format and its bar or stars; a formula as written), and its views with their ids;
  - the problems that make it read-only (`提示：`);
  - its records as a Markdown table of the file's cells, each row at its line in `doc.html` (a formula column has no cells: the box says so; `gallery check` gives its values, worked out);
  - its records' bodies, each under its record's title;
  - its JSON as the file has it, each line at its line in `doc.html` too (find a column or a view there by its id).
- **As data:** `--format json` gives, under the block's `data`, `columns`, `views` (as read, with their defaults), `records` (each the cells' words by column id), `rows` (each the values by column id: an option by its id, a number as a number), `readOnly` and `problems`. A question about its data needs nothing more: answer from what `gallery read` prints, the database alone by `--block`.
- **Check it:** `gallery check <slug>` (and `gallery export`, so `gallery qa` when it exports) prints, for every database:
  - `fix <slug>: line N: database read-only: …` first, when the page shows it read-only: each problem at its line ([Read-only](#read-only)); fix these before anything else.
  - `note <slug>: line N: database: …`, each at its line, what of it reads otherwise than you wrote it. None stops the export, but each is a database that does not do what you meant: fix each and check again until none is left.
    - Of its JSON: a view naming a column by its name or naming none, a field or a layout that is none, a filter whose condition or value is not of its column's kind, an option's color that is none, a formula naming a column or a function there is not.
    - Of its table and bodies: a header cell of no column or a column of no header cell, cells that are no value of their column, options the cells name that the column does not list, a body that repeats its record's notes.
  - `database <slug>: line N: …`, always. Read it against what the user asked for: it is how you see a view without a browser. It says:
    - its records and columns, whether the page edits it (`editable`: its file is as the format holds it, so the page takes edits; no browser opened it), and how wide it is drawn where it or the document says wide;
    - each view: its filters in words and its sorts, how many records it shows and, when it filters them to 12 or fewer, their titles in its order; a table's groups with their counts and a table's totals (with `showCalc`), each group's too, worked out; a board's columns with their counts; a calendar's records with a date and without; a chart's numbers by category and its color; what a card shows (the title, then its columns) and its size;
    - its number columns drawn as bars or stars, and the records that have a body;
    - each formula's values as the page works them out (`TODAY()` today; every record's where there are 20 or fewer), how many are empty, and its failures or none.

  `gallery qa <slug>` then looks at the page: it counts the databases it saw, and its `charts` are figures (`data-doc-chart`), not a database's chart views. It does not open each view or a record's details.
- A reader's change in the page is written into the file as they make it: `gallery read` or the file shows it. Before you change a database the user has open, `gallery status` says whether their edits are saved.
