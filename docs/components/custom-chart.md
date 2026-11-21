# Charts

What a card block (卡片块, [figure.md](figure.md)) shows when it holds data: a chart type of the document's own. The reader moves, resizes, retitles and copies the card; inside it is the document's.

Every chart is drawn by the document's own code, D3 and SVG (bars, lines, distributions, small multiples, maps, networks). It belongs to the report: markup in the body, code in the document's inline script. Never add a report-specific visual to `src/render/kit/`.

Define the chart type once with `DocCharts.define(type, draw)`, and declare each chart in its card, its data as JSON (or a table's rows: below). The kit calls `draw({ host, data, tokens, width, height })` with the host emptied, and again whenever the chart's width, the theme or its card's height change, so the document never handles resizing or theme changes itself.

<!-- the file holds -->
```html
<figure class="doc-figure">
  <h3>各题得分分布</h3>
  <p class="doc-figure-caption">每个点是一道题 · 单位：分</p>
  <div data-doc-chart="score-strip">
    <script type="application/json">
      [
        { "group": "候选 A", "score": 62 }, { "group": "候选 A", "score": 71 }, { "group": "候选 A", "score": 78 },
        { "group": "共同基线", "score": 55 }, { "group": "共同基线", "score": 60 }, { "group": "共同基线", "score": 67 }
      ]
    </script>
  </div>
</figure>
```

```js
// Defined once; every chart declared as "score-strip" is drawn from its own data, and drawn again
// whenever its width, the theme or its card's height change.
DocCharts.define("score-strip", ({ host, data, tokens, width, height }) => {
  /** @type {Array<{ group: string, score: number }>} */
  const scores = data;
  const plot = height ?? 150; // the card's height when the reader set one
  const margin = { top: 12, right: 16, bottom: 28, left: 72 };
  const x = d3.scaleLinear([0, 100], [margin.left, width - margin.right]);
  const y = d3.scalePoint([...new Set(scores.map((row) => row.group))], [margin.top, plot - margin.bottom]).padding(0.5);
  const svg = d3.select(host).append("svg")
    .attr("width", width).attr("height", plot)
    .attr("role", "img").attr("aria-label", "各题得分分布")
    .attr("aria-description", "候选 A 每道题的得分都高于共同基线。")
    .style("font-size", "var(--doc-small-font-size)");
  svg.append("desc").text("候选 A 与共同基线每道题的得分，每个点是一道题。");
  const axis = (g) => g.attr("color", tokens.muted).attr("font-size", null).attr("font-family", null);
  svg.append("g").attr("transform", `translate(0,${plot - margin.bottom})`).call(d3.axisBottom(x).ticks(5)).call(axis);
  svg.append("g").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).tickSize(0)).call(axis)
    .call((g) => g.select(".domain").remove());
  svg.append("g").selectAll("circle").data(scores).join("circle")
    .attr("cx", (row) => x(row.score)).attr("cy", (row) => y(row.group) ?? 0).attr("r", 4)
    .attr("fill", (row) => tokens.series[row.group === "共同基线" ? 1 : 0]);
});
```

- Put it in a card, as above: it stands side by side with others in columns, and the reader can retitle, delete, move and resize it in the live preview. `height` is the card's plot height when the reader set one, otherwise `null`.
- Take colors from `tokens` (`DocTokens.read()`): `series[0..5]`, `text`, `muted`, `grid`, `border`, `surface`, and `tone("success" | "danger" | "warning" | "info" | "neutral")`. Never hard-code the palette.
- `gallery check` fails when a declared type is not defined in the document's script.
- Give each SVG `role="img"`, `aria-label`, and `aria-description` plus `<desc>`; do not add an SVG `<title>` or HTML `title`, which would cover a tooltip the chart draws.
- A drawing the kit draws again is all most visuals need. One that keeps something between drawings (listeners of its own, a timer, an animation, a simulation) is a part: `DocCharts.define(type, { mount })`. `mount({ host, data, tokens, width, height, signal })` starts it in the emptied host and returns `{ update(context), destroy() }`; `update` is called when its width, the theme or its card's height change, `destroy` when its host leaves the page (the reader deleted the card; an undo starts it again), and `signal` aborts then, so give it to `addEventListener` and clear timers on it:

```js
DocCharts.define("pulse", {
  mount({ host, data, signal }) {
    const dot = d3.select(host).append("svg").attr("width", 24).attr("height", 24).attr("role", "img").attr("aria-label", data.label).append("circle").attr("cx", 12).attr("cy", 12).attr("r", 6);
    const timer = setInterval(() => dot.attr("r", dot.attr("r") === "6" ? "9" : "6"), data.every);
    signal.addEventListener("abort", () => clearInterval(timer));
    return { update({ tokens }) { dot.attr("fill", tokens.series[0]); } };
  },
});
```

- A script may still draw somewhere no chart is declared (a visual spanning several hosts). Draw it in the document's inline script, not in a timer or after `load` (the page stays hidden until the shared scripts finish), and redraw it whenever its width changes, with a `ResizeObserver` on its host: the reading/full-width switch and a card resized in the live preview change it without any window `resize` event. Redraw on `doc-theme-change` on `window` and `matchMedia("(prefers-color-scheme: dark)")` changes too. Look up elements inside your own host rather than across the page by id: a block a script refers to by id is kept from being deleted in the live preview.

## Data from a table

A chart drawn from a table: write `data-doc-chart="<type>"` on the `<table>`, its `<caption>` the title; the tools put the card right after the table and link the two by a key (`data-doc-chart-source` on the table's frame, `data-doc-chart-data` on the host, which holds no JSON). The kit calls the type's `draw` with `data` the table's rows in d3.csvParse's shape, as [skills/gallery/references/writing-html.md](../../skills/gallery/references/writing-html.md) ("A chart drawn from a table") says value by value: an object per body row keyed by the header's words, `data.columns` the header's words in order, a value a number when its cell writes one number, else its words, `null` for an empty cell, a dash or `n/a`; `<tfoot>` rows are left out, and a table with a `<tfoot>` has no table tools in the preview, so a total stays out of a charted table. The chart draws again whenever the reader edits the table; merged cells draw nothing (the card says why), and so does a key no table carries. `gallery check` prints, for each, how it reads its table (`chart …`: its rows, each column numbers or words), and a `note` for a column of numbers and words.

<!-- you write -->
```html
<table data-doc-chart="lollipop">
  <caption>各类别数值</caption>
  <thead><tr><th>类别</th><th>数值</th></tr></thead>
  <tbody><tr><td>A</td><td>12</td></tr><tr><td>B</td><td>18</td></tr><tr><td>C</td><td>9</td></tr></tbody>
</table>
```

```js
DocCharts.define("lollipop", ({ host, data, tokens, width }) => {
  /** @type {DocTableRows} */
  const rows = data;
  const [name, value] = rows.columns;
  const points = rows.flatMap((row) => (typeof row[value] === "number" ? [{ label: String(row[name]), value: row[value] }] : []));
  const margin = { top: 8, right: 24, bottom: 28, left: 56 };
  const plot = points.length * 32 + margin.top + margin.bottom;
  const x = d3.scaleLinear([0, d3.max(points, (point) => point.value) ?? 0], [margin.left, width - margin.right]).nice();
  const [low, high] = x.domain();
  const y = d3.scaleBand(points.map((point) => point.label), [margin.top, plot - margin.bottom]).padding(0.4);
  const svg = d3.select(host).append("svg").attr("width", width).attr("height", plot).attr("role", "img").attr("aria-label", `${value}，按${name}`);
  svg.append("g").attr("class", "axis").attr("transform", `translate(0,${plot - margin.bottom})`).call(d3.axisBottom(x).tickValues(width < 520 ? [low, (low + high) / 2, high] : x.ticks(5)));
  svg.append("g").attr("class", "axis").attr("transform", `translate(${margin.left},0)`).call(d3.axisLeft(y).tickSize(0));
  const rowOf = svg.append("g").selectAll("g").data(points).join("g").attr("transform", (point) => `translate(0,${(y(point.label) ?? 0) + y.bandwidth() / 2})`);
  rowOf.append("line").attr("x1", x(0)).attr("x2", (point) => x(point.value)).attr("stroke", tokens.border);
  rowOf.append("circle").attr("cx", (point) => x(point.value)).attr("r", 5).attr("fill", tokens.series[0]);
});
```

Type the rows with `/** @type {DocTableRows} */` on a line of its own right above `const rows = data;` (JSDoc types the declaration it stands right before). A type drawn from a table is best given a name of its own: one drawn from JSON elsewhere would get the other shape.

## Drawing rules

A chart of the document's own keeps to these in its code.

- Name the specific metric, and label each axis with its quantity and unit.
- Keep visible chart text at least 13px. When labels need more room, make the geometry or margins larger; never shrink the text to fit.
- Derive padded domains from every visible observation and reference, so that no uncertainty band or end label is cropped.
- Leave room for the longest tick, category, direct label and value. At 360px, show at most four ticks along a dense continuous x-axis, with `tickValues` (the domain's ends and middle): `ticks(n)` is only a hint to d3, which may draw more (on 0–8,000, `ticks(3)` draws five). `gallery qa` warns `ticks` where an axis's labels stand closer than a character's width.
- Treat a vertical axis title, its formatted tick labels and the plot as separate lanes: measure the rendered tick strings, prefixes and suffixes included, and narrow the plot until they no longer overlap.
- Prefer direct labels; add a compact legend, centered below the plot, only when series cannot be labeled directly.
- One measure is one color; more colors only for a category or series the reader follows across the page. Pair color with text, shape or line style, and keep axes, grids and structural paths neutral.
- Compare several series at one x-position in one grouped tooltip. Never make hover the only way to read an important value, and use buttons for filters and legend toggles.
- Respect `prefers-reduced-motion`: no looping or decorative animation.
