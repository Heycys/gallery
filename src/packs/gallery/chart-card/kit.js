// gallery/chart-card: a card with a title, the bar chart this script draws from the table in its slot,
// and that table. The table is the document's, a plain table in the slot: the reader edits it as any
// table of the page, and each change of it (`source`) draws the bars again. Its first column names the
// bars; each column after it that holds a number is a series, its header the legend's words (bars one
// under another, a legend above them when there are two or more); a cell with no number has no bar.
// The chart is no chart card of the kit's: "/" makes what a template's slot holds as a paste of it
// makes blocks, and a paste makes a table and never a chart card, so the block draws the bars itself.
// They are laid out in percents and colored by the kit's variables, so that a width or a theme draws
// nothing again; the manifest's `runtime` names what is drawn, which the file never holds.

DocKit.component({
  id: "gallery/chart-card",
  on: ["source"],
  mount(host, context) {
    const drawn = document.createElement("div");
    drawn.className = "gallery-chart-card-bars";
    const slot = context.part("table");
    host.insertBefore(drawn, slot && slot.parentElement === host ? slot : null);
    const draw = () => drawBars(drawn, tableOf(context.part("table")));
    draw();
    return { update: draw };
  },
});

/** The language the page speaks: the UI's where Gallery says it (data-ge-language), else its lang's (Chinese where it says none). */
function languageOf(/** @type {HTMLElement} */ root) {
  const ui = root.getAttribute("data-ge-language");
  return (ui !== null ? ui === "en" : /^en(?:-|$)/i.test(root.lang)) ? "en" : "zh";
}

/**
 * The first table in `slot` as words: the names of its columns (the last row of its <thead>, or its
 * first row) and the rows after them, a <tfoot> left out. Null where the slot holds no table.
 * @param {HTMLElement | null} slot
 * @returns {{ columns: string[], rows: string[][] } | null}
 */
function tableOf(slot) {
  const table = slot?.querySelector("table");
  if (!(table instanceof HTMLTableElement)) return null;
  /** @param {HTMLTableRowElement} row */
  const words = (row) => [...row.cells].map((cell) => (cell.textContent ?? "").replace(/\s+/g, " ").trim());
  const rows = [...table.rows].filter((row) => row.parentElement?.localName !== "tfoot");
  const head = table.tHead?.rows[table.tHead.rows.length - 1] ?? rows[0];
  if (!head) return null;
  return { columns: words(head), rows: rows.filter((row) => row !== head && row.parentElement?.localName !== "thead").map(words) };
}

/**
 * A cell's number as a reader writes one (1,234 · 12.5% · −3), or null.
 * @param {string} text
 */
function numberOf(text) {
  const plain = text.replace(/[\s,，]/g, "").replace(/^[−–]/, "-").replace(/%$/, "");
  return /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(plain) ? Number(plain) : null;
}

/**
 * An element of the drawing, of `kind` (its class) and with `words`.
 * @param {string} kind
 * @param {string} [words]
 */
function part(kind, words) {
  const node = document.createElement("span");
  node.className = `gallery-chart-card-${kind}`;
  if (words !== undefined) node.textContent = words;
  return node;
}

/**
 * The bars of `table` in `drawn`, all it held before taken off.
 * @param {HTMLElement} drawn
 * @param {{ columns: string[], rows: string[][] } | null} table
 */
function drawBars(drawn, table) {
  const chinese = languageOf(document.documentElement) === "zh";
  const [name = "", ...rest] = table?.columns ?? [];
  const rows = table?.rows ?? [];
  const series = rest.map((label, index) => ({ label, column: index + 1 })).filter(({ column }) => rows.some((row) => numberOf(row[column] ?? "") !== null));
  drawn.replaceChildren();
  drawn.classList.remove("gallery-chart-card-below", "gallery-chart-card-many");
  drawn.removeAttribute("role");
  drawn.removeAttribute("aria-label");
  if (series.length === 0) {
    const empty = document.createElement("p");
    empty.className = "gallery-chart-card-empty";
    empty.textContent = chinese ? "表格里还没有数：第一列写名字，后面的列写数。" : "The table has no numbers yet: names in its first column, numbers in the columns after it.";
    drawn.append(empty);
    return;
  }
  const values = rows.flatMap((row) => series.map(({ column }) => numberOf(row[column] ?? ""))).filter((value) => value !== null);
  const low = Math.min(0, ...values);
  const span = Math.max(0, ...values) - low || 1;
  /** @param {number} value */
  const at = (value) => ((value - low) / span) * 100;
  const zero = at(0);
  drawn.classList.toggle("gallery-chart-card-below", low < 0);
  drawn.classList.toggle("gallery-chart-card-many", series.length > 1);
  drawn.style.setProperty("--gallery-chart-card-zero", `${zero}%`);
  drawn.setAttribute("role", "img");
  drawn.setAttribute("aria-label", chinese ? `${series.map(({ label }) => label).join("、")}，按${name}` : `${series.map(({ label }) => label).join(", ")} by ${name}`);
  const color = (/** @type {number} */ index) => `var(--doc-series-${(index % 6) + 1})`;
  if (series.length > 1) {
    const legend = part("legend");
    series.forEach(({ label }, index) => {
      const key = part("key");
      const swatch = part("swatch");
      swatch.style.background = color(index);
      key.append(swatch, label);
      legend.append(key);
    });
    drawn.append(legend);
  }
  for (const row of rows) {
    const line = part("row");
    const lanes = part("lanes");
    series.forEach(({ column }, index) => {
      const lane = part("lane");
      const value = numberOf(row[column] ?? "");
      if (value !== null) {
        const from = Math.min(zero, at(value));
        const to = Math.max(zero, at(value));
        const bar = part("bar");
        bar.style.left = `${from}%`;
        bar.style.width = `max(1px, ${to - from}%)`;
        bar.style.background = color(index);
        const said = part("value", row[column]);
        if (value < 0) said.style.right = `calc(${100 - from}% + 4px)`;
        else said.style.left = `calc(${to}% + 4px)`;
        lane.append(bar, said);
      }
      lanes.append(lane);
    });
    line.append(part("label", row[0] ?? ""), lanes);
    drawn.append(line);
  }
}
