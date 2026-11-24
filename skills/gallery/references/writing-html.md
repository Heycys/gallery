# Writing the page

The rules behind the blocks of [example-report.html](example-report.html), which shows each block once.

Write the document as an ordinary web page, with a class only where HTML has no element. `gallery export` rewrites in `doc.html` what the kit has a block for as the kit's markup and gives every block its `data-block-id`; `gallery check <slug>` lists what it would rewrite and changes nothing.

The kit's names are `doc-*` classes, `data-doc-*` attributes, `--doc-*` custom properties and `Doc*` globals. The older `report-*`, `data-report-*`, `--report-*` and `Report*` forms are still read: the checks name them by their new names, and the tools write them as the new ones (a 写作偏好 written before may still name them: they are the same blocks).

## Blocks at a glance

Each block by the name Gallery's menu gives it (the user's word for it), what you write, what the file holds after an export where it differs, and the section below that holds its rule.

<!-- glance -->
| Block | You write | After export | Rule |
| --- | --- | --- | --- |
| 开头概括 | `section.doc-summary`, `<p><strong>` headings | | The page |
| 文本, 标题 2–4 | `<p>`, `<h2>`–`<h4>` | | Text and lists |
| 符号列表, 编号列表, 引用块 | `<ul>`, `<ol>` (`start`, `data-continue`), `<blockquote><p>` | | Text and lists |
| 待办事项 | `<ul><li><input type="checkbox" checked> …` | `ul.doc-todo` | Text and lists |
| 分割线 | `<hr>` | | The page |
| 折叠列表 | `<details><summary>`, never the kit's classes on it | `details.doc-details` | Text and lists |
| 代码块 | `<pre data-title="…"><code class="language-…">` | `div.doc-code[data-language]` | Text and lists |
| 公式块, a formula in a line | `<p>\[…\]</p>`, `\(…\)` | | Text and lists |
| 表格 | `<table>`, its title a `<caption>` | `div.doc-table-wrap` › `table.doc-table`, the caption a `p.doc-note` above it | Tables |
| 多维表格 | `div.doc-database` › `<script type="application/json">` (its columns and views), then `<table>` (a row per record, `th[data-column]`) | | Databases |
| 图片 | `<figure><img src="assets/…"><figcaption>`, or a lone `<img>` | `figure.doc-image` | Pictures |
| 小字 | `<p class="doc-note">`, `span.doc-tab` at its right | | Kit blocks |
| 提示块, 高亮块 | `div.doc-callout` holding `<p>`; `<aside>` | `aside.doc-panel` (one made in the preview a `div.doc-panel`, the same block) | Kit blocks |
| 步骤流程图 | `ol.doc-flow`, a step `<li><p><strong>…</strong></p>…</li>` | | Kit blocks |
| 选项卡 | `<section data-doc-sheets="name">` holding a `<section>` per tab, starting with its heading, the tab's name | `section.doc-sheet-shell`: its row of tabs, a `div[data-doc-sheet]` per tab | Kit blocks |
| 分栏 | `div.doc-columns` | | Kit blocks |
| 详情卡片 | `<a href="#x">` in the text, `<dialog id="x"><h3>…</h3>…</dialog>` | | Kit blocks |
| 文件, 嵌入 | `figure.doc-file`, `figure.doc-embed` | | Kit blocks |
| 网页书签 | `<p><a class="doc-bookmark" href="https://…" title="…">…</a></p>` | `figure.doc-bookmark` | Kit blocks |
| 颜色 | `doc-text-<color>`, `doc-highlight-<color>` on the block | | Kit blocks |
| 图表 | a card holding `<div data-doc-chart="type">` with its data as JSON, the type defined with `DocCharts.define`; or `<table data-doc-chart="type">`, drawn from its rows | for the table: its frame, then a card after it, its caption the card's `h3` | Figures and charts |
| 图 (示意图、时间线) | `figure.doc-figure` holding your own HTML or SVG | | Figures and charts |
| 整体块 | an element of a class of your own that is no figure (a strip of metrics, a panel of your own), styled in the page's `<style>` | | Figures and charts |
<!-- /glance -->

## The page

`gallery new` writes the head, the header with the title, and a starter section, which you replace.

- `data-doc-id` is the slug, `<html lang>` the page's language (the starter's is the system's: set it to the one the document is written in, `zh-CN` or `en`).
- `doc.json`, beside the page, holds its `title`, `description` and `type` (free text naming the kind of document; `gallery new`'s `report` is fine), and may hold `source` (text). Its title, icon and description are the sidebar's, and the title and icon the page header's too: change them with `gallery set <slug> --title "…" --icon <emoji, or none> --description "…"`, which writes the header and `doc.json` in step. It may also hold `look`, the reader's 字体与布局 (font, text size, spacing and width, 全宽, and whether tables wider than the text go past it; the workspace's `gallery.json` may hold a default one): keep it as it is whenever you rewrite `doc.json`, write it into the page nowhere, and change it only when the user asks (`gallery set --font …`: `gallery help set`).
- The header holds the title, an icon before it if any (`.doc-icon`, which `gallery set --icon` writes), and a source line if one is written (`p.doc-note`). A source line, and a scope line's 来源 likewise, holds no path of this machine (`D:\…`, `C:\Users\…`, `/home/…`), which the checks flag.
- The opening summary is `<section class="doc-summary" aria-label="概括">` (a 写作偏好 written before may write `aria-label="报告概括"`: the same block; keep the label 写作偏好 gives), its headings paragraphs of bold words (no `h2`–`h6`), each followed by a paragraph or a list.
- A section groups related blocks and draws nothing by itself; it needs no divider or heading. Existing dividers are independent blocks: preserve their ids when moving them. Text may also stand straight in `main`.
- The document's own CSS goes in one inline `<style>` using the kit's variables: colors, which follow the dark theme (`--doc-text`, `--doc-muted`, `--doc-border`, `--doc-grid`, `--doc-surface`, `--doc-bg`, `--doc-accent`, `--doc-series-1` … `-6`), and fonts and sizes (`--doc-font`, the text's; `--doc-mono` or `--doc-code-font`, monospace, a code block's the second; `--doc-body-font-size`, 16px; `--doc-small-font-size`, 13px, small text). Use only the `--doc-*` names this page gives: another may name nothing, and its `var()` then quietly falls back (`--doc-mono-font` names nothing). Its code goes in one inline `<script>` at the end of `body`; the kit's own tags are added when the page is shown or exported. The checks read the script as strict TypeScript would: a type error is a note (guard a value where it can really be null), a syntax error or a name nothing defines a failure. Write JavaScript, a type in JSDoc if any (`/** @type {…} */`), not `: number`.

## Text and lists

Write semantic elements (`h2`–`h4`, `p`, `ul`, `ol`, `blockquote` holding paragraphs, `hr`) straight in their flow (the page, a section, a Sheet panel, a panel, a disclosure, a dialog or a column), with no wrapper and no class; the kit styles them in every flow. Headings stop at `h4`; for a `<dl>`, write a list or a table.

A long path, URL or name breaks at the line's end by itself, in `<code>` too: write it whole, with no break of your own.

An item's words go straight in its `<li>`, and any block it holds after them (`<li>要点<p>…</p></li>`) stands under its line. An `<li>` that starts with a block is an item of no words over that block: the kit shows its marker on a line of its own above it, never beside the block's first line. So write `<li>` and the words, not `<li><p>` and the words.

The kit draws list markers itself; a list with a class of its own keeps the browser's. A numbered list may start at another number (`<ol start="4">`), or count on from the numbered list before it in the same flow when a paragraph interrupts them (`<ol data-continue start="4">`: write the start it continues at).

In a line, `strong`, `em`, `u` (a red underline), `s`, `code`, `a`, `sub`, `sup` and `br` stay; `<mark>` becomes a yellow highlight, `<small>` gray text, `<kbd>` `<code>`, `<del>` `<s>`, `<ins>` `<u>`, `<q>` “quotes”, and a `<span style>` of a color, background, bold, italic or line the kit's nearest colors and formats (a `span` styled otherwise stays as written). An `<abbr>`'s `title` or a `<time>`'s `datetime` is dropped and named in the output: write it in the text.

A formula is `\(…\)` in a sentence, or `\[…\]` as a paragraph of its own (a formula block); never `$…$`, and a `<` or `>` in it written `\lt`, `\gt`.

A code block's title (`data-title`, or a `<figcaption>` beside it in a `<figure>`) names the file or what the code is for. On its `<pre>`, `data-line-start="38"` numbers its lines from 38, their range shown beside the title (leave it out of the title); `data-line-numbers="false"` drops the numbers; `data-folded-lines="3"` folds line 3's structure; `data-wrap="false"` keeps long lines whole, scrolling sideways (a directory tree, a log). The block's frame shows 40 lines and scrolls for the rest; `style="--doc-code-height: none"` on its `<pre>` shows every line.

## Tables

In a file that holds the kit's markup (after an export or the user's first edit in the preview), still write what you add as plain HTML: the preview and the export convert it. To chart a table the file already holds, put `data-doc-chart="<type>"` on its `table.doc-table`, the type one your script defines ([below](#figures-and-charts)), with a `<caption>` first in it for the card's title; when the `p.doc-note` right above the table is its former caption (a title, not a scope or unit line), move its words into the `<caption>` and delete the note.

A table's scope or unit line (`p.doc-note` right above it, or `p.doc-table-meta` in older documents) moves with the table. When the table becomes another block (Sheet tabs, a chart, a list), its line goes with the data. A table folded into a disclosure: its former caption (a `p.doc-note` above it that is a title) becomes the words of the `<summary>`, which takes no id, and is deleted; its scope or unit line goes into the disclosure with it, and the table keeps its id. Tables made Sheet tabs: a scope line or caption true of every tab stays above the area as small text; a tab's table takes no caption of its own. Older documents may hold `data-doc-table-static` (rows kept in their order) and a cell's `data-sort-value` (the number the cell is read as, sorted and charted by): keep them, and change `data-sort-value` with the cell's number.

A long table of data shows in a frame at most `min(72vh, 720px)` tall (about 15 rows) and scrolls inside it under its header row, which stays; a short table, or one mostly of words, shows whole. To show every row of a long one, write `style="--doc-table-height: none"` on its `<table>`: the export moves it onto the table's frame (`div.doc-table-wrap`), where you write it on a table already in its frame.

A table wider than the text goes past it, centred, when the document's look says so (宽表格: `gallery set <slug> --wide-tables on`); `data-doc-wide="on"` or `"off"` on one table (on its frame where it has one) sets that table alone, over the look.

## Databases

A 多维表格 (`div.doc-database`) is records the reader sees as a table, a board, a list, cards, a calendar or a chart, filters, sorts and edits on the page. Write one when the content is records of the same fields that the user will keep changing (tasks, a backlog, people and their status); a plain table otherwise. Its columns and views are a `<script type="application/json">`, its records a `<table>`, a row each. Read [databases.md](databases.md) before you write, change or read one: its format, every view's settings, formulas, safe changes and what makes it read-only. A page of its own for each record (详情页) is that record's body ([Records' bodies](databases.md#records-bodies)), not a detail card.

## Pictures

A picture comes from a file right in the document's `assets/` (no folder in it), named with 1 to 81 ASCII letters, digits, dots, dashes and underscores, the first a letter or digit, in a format a page shows (png, jpg, gif, webp, avif, svg, ico): rename a file as you copy it in (`古籍 1.png` as `assets/guji-1.png`). Copy it in as it is: the export embeds a copy as light as the page needs (twice the reading width at most, a screenshot or a wide photo as WebP; the file in `assets/` stays as it is), and `gallery check` names the few it cannot make lighter. On a machine without Chrome or Edge, which draws the copies, that is every heavy one: copy those in at the size the page needs (ImageMagick: `magick in.png -resize 1400x1400> -quality 80 out.jpg`). Each further `<img>` of a picture embeds it again.

A place for a picture the user adds later (添加图片) is an empty one, `<figure class="doc-image"></figure>`: the editor shows it as a field a click or a paste fills, and readers see nothing of it until then. Write that, not a line of words asking for a picture.

A picture with no width shows at its own size, at most its column's width and 80% of the window's height (a tall scan shows whole, narrower); `width="360"` (pixels) gives it that share of the 712px reading width, `width="50%"` half the width it stands in. The share holds on a narrow page too: `width="300"` is 0.42 of a phone's 336px, 141px. A reader's click on a picture opens it large with its caption; you write nothing for it. A picture in a link follows the link; an icon or a picture shown under 48px does not open.

A small picture in a table's cell (a thumbnail, a logo, a product shot beside its row's words) stands amid the cell's words: `<td>猫 <img src="assets/cat.png" alt="小猫" width="120"></td>`, a file of `assets/` as any picture, `width` in pixels or none (it then shows 240px wide at most), no other attribute; the user resizes it by its edge. Written any other way, the cell is read-only (`gallery check` says why).

## Kit blocks

The blocks HTML has no element for, written with the kit's classes as the example writes them.

**Small text** (`p.doc-note`): a smaller line of text, a table's scope or unit line right above it for one. `span.doc-tab` puts the rest of the line at its right end.

**Callout** (`div.doc-callout`): text set apart from the paragraphs; its words in a `<p>` in it, and a list or a code block after that where it needs one (`<div class="doc-callout"><p>…</p></div>`). **Highlight panel** (`<aside>`): blocks set apart on a light fill, an icon first if any.

**A block's color** (颜色): a class on the block, not a `style`, of the colors gray, brown, orange, yellow, green, blue, purple, pink and red. A paragraph, a heading, a list item, a flowchart step or a file (on its `<figure>`) takes its words' color (`doc-text-<color>`), a fill (`doc-highlight-<color>`) or both; a disclosure, a code block (on its `<pre>`), a callout or a highlight panel a fill only; a table cell one of the two. Words in a line take theirs from `<mark>` or a `<span style>`.

**A block's alignment and indent** (对齐与缩进): `doc-align-center` or `doc-align-right` on a paragraph, an `h1`–`h4` or a table's frame (`div.doc-table-wrap`, when the table is narrower than the text), the left being none; `doc-indent-1` … `doc-indent-8` move a paragraph or a heading in by two body characters a level. A `text-align: center` or `right` in a paragraph's or heading's `style` is rewritten as the class.

**Columns** (`div.doc-columns` of 2 to 5 `div.doc-column`): blocks side by side (a picture beside its words: the picture's column first, so that on a phone it stands above them). `style="--doc-column-ratio: .4"` on a column gives it that share of the row: write it on every column of the row, the shares adding up to 1, or on none, and the columns share the row equally (one written on some columns only fails the check). A column holds any block but a row of columns, a section or a Sheet area. On a screen under 640px the columns stand one under another: do not point at one as the left or right.

**A process or steps** (步骤流程图, `ol.doc-flow`): one step an item, drawn as a card, arrows between them. A step's title is a paragraph of bold words, then any blocks it holds; an icon may stand first in it, drawn in its number's place. The kit numbers the steps (write no 1, ① or 第一步) and lays them out in rows that fill the width; `data-direction="row"` on the list keeps them in one row, `"column"` one a row; on a step it says where the arrow after it goes. A step written the short way (`<li>收集数据<p>…</p></li>`) is rewritten as a node. A flowchart has no title or caption of its own and stands in no `<figure>`; a legend goes in a `p.doc-note` beside it. A step takes a color as a list item does. A flowchart is for steps in order, each after the one before; a flow that branches, merges or loops is a drawing of boxes and arrows like the example's, and a structure or diagram a figure ([below](#figures-and-charts)).

**Sheet tabs** (选项卡): a part split into pages. Write `<section data-doc-sheets="<name>">` holding a `<section>` per tab and nothing else, each of no attribute (no `id`, no `class`) and starting with a heading (`<h2>`–`<h4>`) that is the tab's name, its blocks after it; the tools write the kit's area of it (`section.doc-sheet-shell`, a row of `button.doc-sheet-tab` and a `div[data-doc-sheet]` per tab, their keys made). Give each area of a report a name of its own (one is made when you leave it out). A panel holds any blocks, headings and chart cards included. In an area the file holds as the kit's, a new tab is a button in its row and a panel of the same key.

**Detail card** (详情卡片): a term's details over the page, opened by a link in the text; its `<dialog>` stands right after the link's paragraph, its id letters, digits, `-` and `_`, a letter first, and no other element's, and it starts with a plain `<h3>` of its title, the blocks after it (with no title, it starts with its blocks). `gallery qa` opens each one and checks it; its pictures show the blocks in it that changed, and `--tiles` the whole card.

**A link to another document** of the workspace is an ordinary relative link between the two files, by the other's folder name (its slug, which `gallery list` prints; `gallery list <address>` for an address the user gave you), not a title or a server's address: `<a href="../<slug>/doc.html">its title</a>`, `…/doc.html#<block id>` for one of its blocks, `<a href="#<block id>">` for a block of this document (the ids are the blocks' `data-block-id`). A click goes there inside Gallery, and an export of the two together links their files; a link to a document left out of an export keeps its words. The editor's page block is the same link shown with the document's icon and title (`<a class="doc-link-mention" href="../<slug>/doc.html"><span class="doc-link-mention-icon"></span>its title</a>`, written exactly so). `gallery check` notes a link to a document or a block that is not there. A slug shaped `doc-` and eight lowercase letters or digits (`doc-tacti90g`) is the workbench's page id: choose a slug of words.

**Files, bookmarks and embeds**: cards, written as the example writes them. A file's or an embed's caption is always there (`<figcaption></figcaption>` when there is none). A file is one file of `assets/` the reader saves: its link's `download` the name it is saved as; keep it small, as the export embeds it. A bookmark is a paragraph holding only its link, `<p><a class="doc-bookmark" href="https://…" title="…">…</a></p>`: an `https://` address, its words the page's title, its `title` its description; the tools write the card (`figure.doc-bookmark`) and fetch nothing. An embed shows an HTML or PDF file of `assets/` (`doc-embed--file`; an HTML file's `sandbox` without `allow-same-origin`, a PDF's none), shown offline too, or an `https://` page with a `sandbox`, shown only online; `--doc-embed-height` on the figure sets its height.

## Figures and charts

A figure the reader looks at as one picture, with a title, is a card: `<figure class="doc-figure">`, its title an `h3`, a scope or unit line `p.doc-figure-caption`. Inside it:

- **A chart** (anything on axes: intervals, distributions, slopes, small multiples): `<div data-doc-chart="type">` with its data as JSON, or `<table data-doc-chart="type">`, drawn from its rows, the type defined once in the document's script with `DocCharts.define(type, draw)` (d3 v7 is on the page).
- **A drawing** (a layered structure, a diagram of parts, an architecture, a timeline): your own HTML and CSS or inline SVG in the card, its classes your own (not `doc-…`), colored with the kit's variables.
- **A whole block** (整体块): a layout of your own that is no figure (a strip of metrics, a comparison panel), a class of your own styled in the page's `<style>`, outside a card.
- A diagram, scan or photo is a picture ([Pictures](#pictures)).

The card draws the frame and the surface once: draw no second outer box inside it. Before you write or redraw a chart or a drawing, or add rows or columns to a table one is drawn from, read [charts-and-figures.md](charts-and-figures.md): how a type is defined and what `draw` is given, colors, labels and ticks at 360px, a chart drawn from a table, and what `gallery qa` flags in a drawing. Changing a chart's numbers or labels needs none of it.

## Do not write

- The kit's classes on what you write as plain HTML (a `<details>` given `doc-details`): write the plain element.
- Attributes in curly quotes (`class=”x”`, which HTML reads as part of the value): an editing tool keeping a file's “…” may make them; look at the quotes of the tags you add.
- A bare `<button>` in the text: a link opens a detail card; an interactive figure is a chart of your own (`DocCharts.define(type, { mount })`), and a control a reader uses (a filter, a toggle) a custom block ([SKILL.md](../SKILL.md#output-contract)). A plain `<select>` in either needs nothing for its dropdown: the kit opens its own flat menu for every select, light and dark (the select keeps its `value` and `change`; for a choice from a button of your own, `DocKit.choose`: [block-script.md](block-script.md)).
- `<colgroup>`, column widths or `.number`: the kit measures columns and aligns numbers.
- base64 `data:` or remote addresses for scripts, styles, fonts and pictures: put the file in `assets/` and write `assets/<file>`, which the export embeds. Links to web pages are fine.
- Looks of your own on the kit's blocks (a paragraph, a table, a callout): gradients, shadows, frames, margins or type sizes; the kit sets them. The sizes this page names are the exception, each in its block's `style`: `--doc-table-height`, `--doc-code-height`, `--doc-embed-height`.

## Keep what you did not write

- Keep every class, `style` and `data-*` attribute you did not write: they hold the user's edits (sizes, colors, folds, crops, column widths, a flowchart's directions and widths) and each block's identity, its `data-block-id` ([SKILL.md](../SKILL.md#revising-a-document)).
- A whole block's or a figure's own tags, classes and styles stay as written; the user edits its words, not those inside an inline element of its own (a badge).
