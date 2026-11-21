# Classes and components

The maintainers' lookup of every class and component, which the skill does not hold: how an Agent writes the page, and what the tools write for it, is in [skills/gallery/references/writing-html.md](../skills/gallery/references/writing-html.md). Exact option types live in [`skills/gallery/sdk/`](../skills/gallery/sdk/) (entry: `skills/gallery/sdk/index.d.ts`); `tests/fixtures/component-catalog/doc.html` runs every component.

## Classes

The kit owns typography, color, light/dark theme, spacing, responsive layout, table behavior, and chart rendering; a document supplies content, data, and the choice of components. "Written for …" names the plain HTML the tools turn into a class, which you need not write yourself.

| Markup | Use |
| --- | --- |
| `.doc-page` | the single `main`, its `data-doc-id` the slug |
| `.doc-header` › `.doc-icon` | optional page icon right before `.doc-title`, shown above the title, left-aligned with it: one emoji (`<div class="doc-icon">🎯</div>`), an icon of Gallery's set in a color (`<div class="doc-icon" data-icon="/icons/airplane_blue.svg"></div>`: MingCute names, or `/icons/tabler/<name>_<color>.svg`, Tabler names; the 443 pairs in `src/shared/emoji/data/icons.json`, and numbers, Tabler's only: `/icons/tabler/circle-number-3_<color>.svg`, 0–9 in `circle`, `square`, `square-rounded`, `hexagon`; gray, lightgray, brown, yellow, orange, green, blue, purple, pink, red) or an image of the document's folder (`<div class="doc-icon"><img src="assets/<file>" alt=""></div>`); give the same value as `icon` in report.json (the emoji, the `/icons/…` path or `assets/<file>`) |
| `.doc-header` › `.doc-title` | the title, the document's name; at most one line of small text after it, the source line (`p.doc-note`) |
| `.doc-summary` | opening summary (written when the user's 写作偏好 asks for one); it looks and edits as a `.doc-panel` that comes first |
| `.doc-section` | a section (optional): its blocks, a heading as its title and an `<hr>` at its top for a line above it |
| `.doc-note` | small text: a brief label, unit, or scope note, not an explanatory paragraph (written for a table's `<caption>`, above the table); `span.doc-tab` in it puts the rest of the line at its right end |
| `.doc-callout` | rare emphasis for a risk, warning, state, or caveat that changes interpretation; holds blocks (`<p>`, a list…) as a panel does |
| `.doc-panel` | a group of blocks set apart (a callout, the preview editor's 高亮块; written for a bare `<aside>`): a light gray box, text inside reading as in any flow; an icon may come first in it, `<div class="doc-icon">💡</div>` (any value a page icon takes), standing left of its blocks; `doc-highlight-<color>` on it gives a background, `doc-text-<color>` colors its text with a thin border |
| `ul.doc-todo` › `li`, `li[data-checked]` | a to-do list (the preview editor's 待办事项; written for a task list): a box before each item instead of a bullet, filled and checked for an item with `data-checked` (its text struck through); nest one inside an item as any list |
| `span.doc-text-{gray,brown,orange,yellow,green,blue,purple,pink,red}`, `span.doc-highlight-{…}` | inline text color and highlight, theme-aware (a highlight on words is deeper than the same color as a block's background, and square) (written for `<mark>`, `<small>` and a styled `<span>`); the same classes on a block color it as a whole: a `p`, `h1`–`h4`, a list item, a disclosure, a highlight panel, a callout, a code block, a formula block, a file or a bookmark (its text, or a background); the preview editor writes them, and `u.doc-underline-{orange,blue,purple,plain}` and `u.doc-underline-{thin,thick}` for an underline's color (red by default) and weight: keep them when editing a document |
| `ol.doc-flow` › `li` | a flowchart (步骤流程图): each step a node, a card holding blocks as a highlight panel does, its title first (`<p><strong>收集数据</strong></p>`, bold by its `<strong>` alone), then its content (any blocks); an icon may come first in it (`div.doc-icon`, any value a page icon takes), drawn in its number's place; steps in rows that fill the width, arrows between them, a row's last turning down into the next row's first: without `data-direction` (自动) as many a row as read well, the rest wrapping, `data-direction="row"` one row (wrapping only where a card would be under 116px or its longest word), `"column"` one a row; on a step, `row` puts the next beside it and `column` ends the row after it; `style="--doc-flow-ratio: .4"` a step's share of its row (the preview editor writes it when the reader drags the gap between two steps); `doc-highlight-<color>` / `doc-text-<color>` on a step its background or text color; written for `<ol data-doc-chart="flow">`, and a step written the short way (`<li>收集数据<p>…</p></li>`) made a node; prints as a screen as wide as the paper shows it |
| `.doc-columns` › `.doc-column` | a row of 2 to 5 columns side by side (分栏), each a flow of blocks; equal widths unless every column has `--doc-column-ratio`; stacked on narrow screens, see [columns.md](components/columns.md) |
| `figure.doc-figure` › `h3`, `.doc-figure-caption`, a chart host or a drawing | a card (卡片块): a figure, a chart or a drawing of the document's own, framed once; `.doc-figure--compact` for one simple figure (centered), `.doc-figure--plain` for no frame and no room inside it, see [figure.md](components/figure.md) |
| `[data-doc-chart="type"]` › `script[type="application/json"]` | a chart of a type the document defines (`DocCharts.define`); with `data-doc-chart-data` and no JSON, it draws a table's rows, see [custom-chart.md](components/custom-chart.md) |
| `style="--doc-span: .5"`, `--doc-chart-height: 420px`, `--doc-table-height: 480px`, `--doc-code-height: 320px`, `--doc-column-ratio: .6` | sizes on a card or table wrapper: width as a share of the width it stands in, the reading width or its column's (past 1 a table is that much wider and scrolls in its wrapper; a picture's of the reading width wherever it stands, at most its column), plot height, scroll height; on a code block, the frame's height, longer code scrolling inside it; on a column, its share of the row; the preview editor writes them when the reader resizes, so keep them when editing a document |
| `figure.doc-image` › `img[src="assets/<file>"]`, `figcaption` | image (written for a lone `<img>` or a `<figure>` of one picture): a picture of the document's folder and its caption (empty `<figcaption></figcaption>` when there is none); `style="--doc-span: .6"` for a width, `.doc-image--left` / `--right` for a side ([image.md](components/image.md)) |
| `figure.doc-file` › `a.doc-file-link[href="assets/<file>"][download]` › `.doc-file-name`, `.doc-file-size`; `figcaption` | file: one file of the document's folder the reader saves, its name and size, and its caption ([file.md](components/file.md)) |
| `figure.doc-bookmark` › `a.doc-bookmark-card[href="https://…"]` › `.doc-bookmark-text` (`.doc-bookmark-title`, `.doc-bookmark-description`, `.doc-bookmark-url`), `.doc-bookmark-cover`; `figcaption` | bookmark: a web page as a card, its icon and cover files of the document's folder ([bookmark.md](components/bookmark.md)); written the short way, `<p><a class="doc-bookmark" href="https://…" title="description">title</a></p>`, the tools write the card |
| `figure.doc-embed` › `iframe.doc-embed-frame[src][sandbox]`, `figcaption` | embed: an https page in a sandboxed frame, or an HTML or PDF file of the document's folder (`.doc-embed--file`); `--doc-embed-height` ([embed.md](components/embed.md)) |
| `.doc-table-wrap` › `table.doc-table` | table (written for a bare `<table>`); header-row cells `doc-bold doc-highlight-gray` (a header column's `th scope="row"` none); `.doc-table--sticky-first` ([table.md](components/table.md)) |
| `details.doc-details` › `summary` › `.doc-details-summary-label`; `.doc-details-content` | disclosure (written for a bare `<details>`) |
| `dialog.doc-dialog` + a link to it (`a.doc-dialog-trigger[href="#id"]`, in text) or `[data-doc-dialog-open]` (a separate button) | modal detail card |
| `.doc-math-inline`, `.doc-math-block` | formula wrappers (written for `\(…\)` and a paragraph of `\[…\]`) |
| `a.doc-link-mention[href="https://…"]` › `img.doc-link-mention-icon[src="assets/…"][alt=""]` (or an empty `span.doc-link-mention-icon`), then the title as text | a link shown as its page's icon and title, in text (the page editor's 图标视图); the icon a file of the document's folder |
| `a.doc-link-mention[href="../<slug>/doc.html"]` (with `#<block id>`, or `#<block id>` alone within a page) › an empty `span.doc-link-mention-icon`, then the title as text | a page block: the same element, a document's address. What is shown is the document's title and icon now (`render/page-chips.mjs`), an empty icon a page, a gray fill under the pointer; `[data-doc-page]` with no address is one left empty, shown to no reader |
| `.doc-code` › `.doc-code-title`, `pre` › `code`; `.doc-diff` › `.doc-code-title`, options JSON | code block (written for a `<pre>`, or a `<figure>` of one and its caption, the title: its title, then its code; `doc-code--folded`, `doc-code--nowrap`; `data-language`, else told by the title or the code; `data-line-start`; `data-folded-lines`), declared diff |
| `.doc-sheet-shell[data-doc-sheets="name"]` › `.doc-sheet-tabs` › `.doc-sheet-tab` | Sheet tabs, in a frame; `.doc-sheet-shell--plain`: no frame; written the short way, `<section data-doc-sheets="name">` holding a `<section>` per tab (no attribute on it), starting with its heading, the tab's name, the tools write the tabs and panels ([sheets.md](components/sheets.md)) |
| `.doc-button`, `.doc-filter-row` › `.doc-filter-button`, `.doc-state-fields` › `label`, `.doc-state-field`, `.doc-state-list`; `[data-doc-bind]`, `[data-doc-show]` | controls and inputs, bound to keys ([state.md](components/state.md)) |

## Components

Every component is one of four kinds of block, by what the reader can do with it in the live preview:

| Kind | The reader | Components |
| --- | --- | --- |
| 基础块 (basic block) | edits its text, makes it, turns it into another type, splits, merges, moves, deletes, copies | paragraph, small text, headings, lists (bulleted, numbered, to-do), quote, code block, divider, formula block |
| 容器块 (container block) | edits the basic blocks in it; moves and deletes it as a whole | section, highlight panel, callout, disclosure, detail card, Sheet area, table (its cells), a row of columns (分栏), a flowchart (步骤流程图: its nodes, each holding blocks) |
| 卡片块 (card block) | moves and resizes it, edits its title and caption, copies it; its inside is yours | `figure.doc-figure`: a figure, a chart of a type the document defines or a drawing of the document's own (a diagram, a timeline); `figure.doc-image`: a picture of the document's folder; `figure.doc-file`: a file of it to save; `figure.doc-bookmark`: a web page as a card; `figure.doc-embed`: a page or file in a frame |
| 整体块 (whole block) | moves it as a whole, edits its words in place | an element with a class of the document's own that is no figure (a strip of metrics, a comparison panel: free inside), a diff, controls of reading state (labelled fields, filter buttons, a filter's list) |

Put a figure (a chart, a diagram, a timeline) in a card; make a layout that is no figure a whole block. Each component has a card in [components/](components/): when to use it, a minimal working example (`kit:check` checks every one), what to change, and what the reader can edit in the live preview.

| Card | Components |
| --- | --- |
| [columns.md](components/columns.md) | blocks side by side: a row of columns (分栏) |
| [figure.md](components/figure.md) | a card for a figure (卡片块): a chart or a drawing of the document's own, framed once; card widths and sizes |
| [custom-chart.md](components/custom-chart.md) | charts: a type of the document's own (`DocCharts.define`), drawn from JSON or a table's rows; a drawing, or a part that keeps listeners or timers |
| [image.md](components/image.md) | images: a picture of the document's folder, its caption, width and side |
| [file.md](components/file.md) | files: a file of the document's folder the reader saves |
| [bookmark.md](components/bookmark.md) | bookmarks: a web page as a card |
| [embed.md](components/embed.md) | embeds: a web page, or an HTML or PDF file, in a frame |
| [table.md](components/table.md) | tables: numeric columns, sorting, widths, scrolling, sticky parts |
| [state.md](components/state.md) | reading state and linkage without a script: `data-doc-bind`, `data-doc-show` |
| [sheets.md](components/sheets.md) | Sheet tabs |
| [details.md](components/details.md) | disclosures |
| [dialog.md](components/dialog.md) | modal detail cards |
| [code.md](components/code.md) | code blocks and declared diffs |
| [math.md](components/math.md) | formulas |

Prose and lists: [writing-html.md](../skills/gallery/references/writing-html.md#text-and-lists).

## Scripts

Every component starts from its markup, and moves, deletes and undoes in the live preview like any block. A document's inline script is for what markup cannot say: a chart type of its own ([custom-chart.md](components/custom-chart.md)), values it computes. Keep it within its own hosts (`DocCharts.get(host)`, `host.querySelector`) rather than reaching across the page by id: a block a script refers to by id is kept from being deleted in the live preview. `gallery check` fails a call that markup now says instead (`DocSheets.mount`, `DocCode.DiffView` and the like), naming what to write. The checks type-check the script strictly against the SDK ([report-contract.md](report-contract.md#checks)).
