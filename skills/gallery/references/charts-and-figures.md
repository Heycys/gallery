# Figures and charts

The rules for what you draw yourself, read when a document needs a chart, a diagram or a layout of its own. [writing-html.md](writing-html.md) has the rest of the page's rules; the example report ([example-report.html](example-report.html)) shows a chart from JSON, a chart from a table, a timeline, `.box-path`, `.branch` and a metric strip written out.

A figure the reader looks at as one picture, with a title, is a card: `<figure class="doc-figure">`, its title an `h3`, a scope or unit line `p.doc-figure-caption`. Data charts are types of your own (`DocCharts.define`); diagrams, timelines and architectures are your own HTML or SVG inside the card. A layout that is no figure is a whole block.

The card draws the frame and the surface once: draw no second outer box (a border, a background, a shadow) inside `figure.doc-figure`. The words in a figure or a whole block are the user's to fix in place, not to split: a `<p>`, a heading or an `<li>` in them stays one. The user moves, resizes, retitles and copies a card, and takes its frame away (显示边框 in its menu): `doc-figure--plain` on the `figure` is the same card with no line, no ground and no room inside it, its title, drawing and caption at the text's edges. Write it for a figure that should sit in the text without a box; keep it when editing.

**A chart** (intervals, distributions, small multiples, slopes, anything on axes), as the example's slope chart is: a card holding `<div data-doc-chart="type">` with its data as JSON, and the type defined once in the document's script with `DocCharts.define(type, draw)` (`type` lowercase letters, digits and hyphens, a letter first). The same type draws every chart declared with it, each from its own data.

- The kit calls `draw({ host, data, tokens, width, height })` with the host emptied, and again whenever its width, the theme or the card's height change; `height` is the card's height when the reader set one, else `null`. Draw into `host` with d3 v7 (on the page), and give the SVG `role="img"` and an `aria-label`.
- Give the data its shape once in JSDoc, on a line of its own right above the declaration (`/** @type {Array<{ label: string, value: number }>} */` then `const rows = data;`): untyped, d3 reads its values as strings and the checks put type notes on code that is correct. `d3.min` and `d3.max` may give `undefined`: write `?? 0`.
- Colors come from `tokens`: `text`, `muted`, `border`, `grid`, `surface`, `bg`, `accent`, `accentSoft`, `success`, `warning`, `danger`, `series[0..5]` (the kit's variables: `series[0]` is `--doc-series-1`, `accentSoft` `--doc-accent-soft`), and status colors from `tokens.tone("success" | "danger" | "warning" | "info" | "neutral")` ([sdk/doc-tokens.d.ts](../sdk/doc-tokens.d.ts)).
- Text in the host is the document's font at 16px, and in a group of class `axis` the kit's axis look (13px, muted): set a `font-size` only to change that, never under 13px. Measure the label column from the longest label (draw a text in the host and read `getComputedTextLength`), never a fixed width; when that leaves the plot too little room (long labels, a phone's width), put the labels above their rows. Draw for 360px as well: fewer ticks, labels that fit. `ticks(n)` is only a hint to d3 and may draw more (on 0–8,000, `ticks(3)` draws five); `tickValues` caps the count: at most four along a phone's axis, such as the domain's ends and middle, as the example's lollipop gives them. `gallery qa` warns `ticks` where an axis's labels crowd.
- Keep marks off the words: a zero, reference or grid line stops short of a label or a value's text, or the text moves clear of it, and a label stands at least 4px from the mark under or beside it. A legend belongs to the card: say the encoding in its `p.doc-figure-caption` or draw a key inside the chart, never in a paragraph outside the card; name the marks by shape or series (实心/空心, the series' name), never by light or dark, which the dark theme inverts.
- To change what a chart shows, change its JSON; change its `define` code to change how every chart of that type draws.
- An interactive one is `DocCharts.define(type, { mount })`: `mount` gets what `draw` gets and a `signal` (for `addEventListener`), starts once in the emptied host with its controls, and may return `update(context)` and `destroy()` ([sdk/doc-charts.d.ts](../sdk/doc-charts.d.ts)).

**A chart drawn from a table**, as the example's lollipop is: write `data-doc-chart="<type>"` on the `<table>`, its `<caption>` the title; the tools put the card right after the table and link the two by a key. The kit calls your type's `draw` with `data` the table's rows: an object per body row, in the file's order, keyed by the header's words (give each column words of its own, never none), and `data.columns` the header's words in order. A value is `null` for an empty cell, a dash or `n/a`; a number when the cell writes one number (`12.5%` is 12.5, `3.6亿` 360000000, `约 20` 20; read from a cell's `data-sort-value` when it has one); else the cell's words: a range (`3–5 天`), a ratio (`3 / 4`), and every cell of a column whose header cell has `data-sort-type="text"` or `"date"`. Rows of a `<tfoot>` are left out of the chart, but a table with a `<tfoot>` has no table tools in the preview: keep a total out of a table you chart and say it in the text (a total row in the body is charted as a row). Type it with `/** @type {DocTableRows} */` on the line above `const rows = data;`. The chart draws again whenever the user edits the table, and they may add, rename or delete any row: so draw everything from the rows. Domains and ticks come from the values (`[0, d3.max(…)]` for a length, `d3.extent` for a position, `.nice()`), highlights and groups from a column of the table (a 重点 or 类别 column), never from row labels, numbers or the reason for an empty cell written in the code; an empty cell draws as a gap or a neutral no-value, its reason said in the table or the text. Merged cells, or a key no table carries, draw nothing (the card says why). Give a type drawn from a table a name of its own: drawn from JSON elsewhere, its `data` would have another shape. `gallery check` prints how each one reads its table (`chart …`: its rows, each column numbers or words), and a `note` where a column reads as numbers in some rows and words in others.

Written this way, on the `<table>`, the table always shows, its card after it. To fold the table under its card from the start, write the card with a key of your own and the table carrying the same key; once exported, a chart card may stay in a column or a panel while its table's frame moves elsewhere:

<!-- you write -->
```html
<figure class="doc-figure">
  <h3>各类别的数值</h3>
  <div data-doc-chart="table-dots" data-doc-chart-data="values"></div>
</figure>
<details>
  <summary>数据</summary>
  <table data-doc-chart-source="values">
    <thead><tr><th>类别</th><th>数值</th></tr></thead>
    <tbody><tr><td>类别 A</td><td>12</td></tr><tr><td>类别 B</td><td>18</td></tr></tbody>
  </table>
</details>
```

```js
// data: the table's rows, each keyed by its header's words; data.columns the header's words in order.
DocCharts.define("table-dots", ({ host, data, tokens, width }) => {
  /** @type {DocTableRows} */
  const rows = data;
  const [name, value] = rows.columns;
  const points = rows.flatMap((row) => (typeof row[value] === "number" ? [{ label: String(row[name]), value: row[value] }] : []));
  // The label column as wide as its longest label (the example's lollipop also puts long ones above their rows).
  const probe = d3.select(host).append("svg").append("text");
  const left = Math.ceil(d3.max(points, (point) => probe.text(point.label).node()?.getComputedTextLength() ?? 0) ?? 0) + 16;
  probe.node()?.ownerSVGElement?.remove();
  const tall = points.length * 36 + 40;
  const x = d3.scaleLinear([0, d3.max(points, (point) => point.value) ?? 0], [left, width - 24]).nice();
  const y = d3.scaleBand(points.map((point) => point.label), [8, tall - 28]);
  const svg = d3.select(host).append("svg").attr("width", width).attr("height", tall).attr("role", "img").attr("aria-label", `${value}，按${name}`);
  // Three ticks when narrow, the domain's ends and middle: ticks(3) is a hint d3 may exceed.
  const [low, high] = x.domain();
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${tall - 28})`).call(d3.axisBottom(x).tickValues(width < 520 ? [low, (low + high) / 2, high] : x.ticks(5)));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${left},0)`).call(d3.axisLeft(y).tickSize(0));
  svg.append("g").selectAll("circle").data(points).join("circle")
    .attr("cx", (point) => x(point.value)).attr("cy", (point) => (y(point.label) ?? 0) + y.bandwidth() / 2).attr("r", 5).attr("fill", tokens.series[0]);
});
```

**A drawing in a card** (a layered structure, a diagram of parts, an architecture, a timeline), as the example's timeline, `.box-path` and `.branch` are: your own HTML and CSS, or inline SVG, inside `figure.doc-figure` after its title and caption. Give its elements classes of your own (never `doc-…`) and style them in the page's `<style>`: draw what the figure needs (boxes, lines, gaps, sizes) but not the card's frame, colored with the kit's variables so that it follows the dark theme.

- A `<figure>` inside the drawing is part of it, not a card of its own.
- Boxes joined by arrows, as the example draws them two ways. `.box-path`, HTML and CSS: each box but the last draws its line (`::after`) and its arrowhead (`::before`), one box under another with arrows down on a phone, in a row with arrows right from `@media (min-width: 560px)`. `.branch`, inline SVG: one box into two, its lines ending in a `<marker>` arrowhead (`marker-end`), colored by classes with `--doc-muted`, `--doc-border` and `--doc-accent`.
- Give each figure's SVG `<defs>` ids a prefix of its own (`<marker id="fig-branch-arrow">`, as the example's): two figures with the same id fail the repeated-id check; a copy the user makes gets its own prefix. Write markers, gradients and clip paths as attributes (`marker-end="url(#fig-branch-arrow)"`), not in a `<style>` inside the SVG.
- A `viewBox` scales the drawing, its text with it: 14-unit text in a viewBox 800 wide reads at 6px on a 360px phone. Size the text in the viewBox's units so that it reads at 11px or more at 360px, or lay the drawing out for narrow widths (HTML that wraps, an `@media` rule, or a chart of your own drawn from its width). The other way too: a viewBox sized for a phone grows its text with the card on a wide page (14 units in a viewBox 320 wide read at 31px drawn 712px wide), so give such an SVG a `max-width` (the example's `.branch`: 360px).
- `gallery qa` pictures it, warns `overflow-in-block` when its words run past their box at some width (give them room in an `@media` rule), `cut-in-block` when a box of a fixed height cuts off its words or marks (let it grow: `min-height`) and `svg-text-small` when a viewBox draws its text under 11px.

**A whole block** (整体块): a layout of your own that is no figure (a strip of metrics, a comparison panel, controls your script handles that only change what a reader looks at), as the example's `.metric-strip` is. Give it a class of your own (never `doc-…`) and style it in the page's `<style>` with the kit's variables. The user moves it whole and can fix its words in the preview; `gallery qa` warns `overflow-in-block` and `cut-in-block` as for a drawing. A drawing, a diagram or a timeline is a figure, in a card, not a whole block.

**A picture**: a diagram, scan or photo ([Pictures](writing-html.md#pictures)).
