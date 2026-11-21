import { validateDiff } from "./kit/diff-options.js";
import { currentCatalog } from "../shared/component-catalog.mjs";
import { BODY, isInstance } from "../shared/components/index.mjs";
import { ATTRIBUTE } from "../shared/components/installed.mjs";
import { attr, elementsOf, hasClass, walk } from "../shared/html-tree.mjs";
import { tableCells } from "../shared/file-table.mjs";
import { CHART_DATA, CHART_KEY, CHART_SOURCE, VIEW_FROM, cellWords, rowsReading, tableRows } from "../shared/table-chart.mjs";
import { packagesOf, packageText } from "./package-files.mjs";
import { parseReport } from "./report-tree.mjs";

// Declared charts (<div data-doc-chart="type"><script type="application/json">…</script></div>, see
// "declared charts" in src/render/kit/charts/declared.js), each of a type the report's script defines
// with DocCharts.define: a type no define names fails, and so does data that is no JSON. A chart drawn
// from a table (data-doc-chart-data: src/shared/table-chart.mjs) holds no JSON: its data are its
// table's rows, read from the file as the kit reads them from the page (charts/from-table.js), and
// what it reads of its table is said for the Agent (tableChartReadings). Declared diffs (div.doc-diff)
// are checked by the check the code kit draws them with (kit/diff-options.js), which Node imports
// directly: /kit/code.js carries the highlighter (typecheck.mjs checks their options against the SDK
// types too). A view of a table (an instance of a custom block that names a table by its key,
// VIEW_FROM: shared/table-chart.mjs) is held to its table as a chart drawn from one is (tableViews).

const isConfig = (node) => node.tagName === "script" && (attr(node, "type") ?? "").trim().toLowerCase() === "application/json";
const textOf = (node) => (node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(textOf).join(""));

// The words of the title of the card `node` stands in: the first h2, h3 or h4 of its nearest
// figure's own (itself too); "" for none, or for a host standing in no figure.
function cardTitle(node) {
  let card = node;
  while (card && card.tagName !== "figure") card = card.parentNode;
  const heading = card ? elementsOf(card).find((child) => /^h[2-4]$/.test(child.tagName)) : null;
  return heading ? cellWords(textOf(heading)) : "";
}

// What the report declares of one kind: { type, line, text, source, tag, holder, title } of each
// element `typeOf` names (text: its JSON, or null when it has none; source: the key of the table it
// draws, data-doc-chart-data; tag: its tag; holder: its parent's; title: its card's, cardTitle), none
// of what an instance of a component package holds, which is its component's.
function declarations(html, typeOf, tree = parseReport(html)) {
  const found = [];
  walk(tree, (node) => {
    const type = typeOf(node);
    if (type === undefined || !node.sourceCodeLocation) return;
    const config = node.childNodes.find(isConfig);
    found.push({
      type,
      line: node.sourceCodeLocation.startLine,
      text: config ? config.childNodes.map((text) => text.value ?? "").join("") : null,
      source: attr(node, CHART_DATA),
      tag: node.tagName,
      holder: node.parentNode?.tagName,
      title: cardTitle(node),
    });
  }, BODY);
  return found;
}

// A list the intake makes a flowchart (<ol data-doc-chart="flow">: src/editor/source/natural.mjs
// flowMarked) asks for no chart.
const flowMark = (node) => node.tagName === "ol" && attr(node, "data-doc-chart") === "flow";

/** Every chart the report declares: { type, line, text, source, tag, holder, title }. */
export const chartDeclarations = (html, tree) => declarations(html, (node) => (flowMark(node) ? undefined : attr(node, "data-doc-chart")), tree);
/** Every diff the report declares: { type: "diff", line, text }. */
const diffDeclarations = (html) => declarations(html, (node) => (hasClass(node, "doc-diff") ? "diff" : undefined));

// ---------- charts drawn from a table ----------

// What a table of the file holds for a chart: shared/file-table.mjs tableCells, which the workspace's
// facts read a table another document names by too (re-exported for the tests).
export { tableCells };

// The tables a chart may read: key -> the frames carrying it as data-doc-chart-source, each
// { line, offset (where it starts in the file), table }, in the page's order (none a <template> holds, which the page does not show, nor
// the own region of an instance of a component package: what its slots hold is the document's).
function sourceTables(tree) {
  const found = new Map();
  walk(tree, (node) => {
    const key = attr(node, CHART_SOURCE);
    if (key === undefined || !node.sourceCodeLocation) return;
    const frames = found.get(key) ?? found.set(key, []).get(key);
    frames.push({ line: node.sourceCodeLocation.startLine, offset: node.sourceCodeLocation.startOffset, table: elementsOf(node).find((child) => child.tagName === "table") ?? null });
  }, { ...BODY, inTemplates: false });
  return found;
}

// What a chart drawn from the table of `key` reads of it: tableRows' with the table's line and
// cells, or { error } (no such table, two of them, merged cells).
function readTable(key, sources) {
  const frames = sources.get(key) ?? [];
  if (frames.length === 0) return { error: `no table's frame carries ${CHART_SOURCE}="${key}", so the chart has nothing to draw: put the table back, or delete the card` };
  if (frames.length > 1) return { error: `${frames.length} tables carry ${CHART_SOURCE}="${key}" (lines ${frames.map(({ line }) => line).join(", ")}): a key names one table (the chart draws the first); take it off the copies` };
  const [{ line, table }] = frames;
  if (!table) return { error: `the frame carrying ${CHART_SOURCE}="${key}" (line ${line}) holds no table` };
  const cells = tableCells(table);
  const found = tableRows(cells);
  return found.error ? { error: `its table (line ${line}) ${found.error}` } : { ...found, line, cells };
}

// ---------- the checks ----------

// The types the report's script defines (DocCharts.define("type", …)), and the names it gives
// define that the kit refuses (not lowercase letters, digits and hyphens, a letter first:
// kit/charts/declared.js), which the check says rather than "does not define it". The script of a
// custom block the page holds an instance of defines types for it too, as it runs on that page (a
// chart table an Agent writes in its slot): what its kit.js defines counts as the page's.
function definedTypes(html) {
  const scripts = [html, ...packagesOf(html).filter(({ files }) => files.includes("kit.js")).map((found) => packageText(found, "kit.js") ?? "")].join("\n");
  const defined = new Set([...scripts.matchAll(/DocCharts\.define\(\s*(["'`])([a-z][a-z0-9-]*)\1/g)].map((match) => match[2]));
  const misnamed = new Set([...scripts.matchAll(/DocCharts\.define\(\s*(["'`])([^"'`\n]*)\1/g)].map((match) => match[2]).filter((name) => !defined.has(name)));
  return { defined, misnamed };
}

// The type of `defined` that `type` most likely means (a letter or two apart, or one holding the other:
// "region-bar" for "region-bars"), or null: a slip of the name said as one, not as a type to write.
function nearestType(type, defined) {
  const apart = (a, b) => {
    let row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
      const next = [i];
      for (let j = 1; j <= b.length; j++) next[j] = Math.min(row[j] + 1, next[j - 1] + 1, row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      row = next;
    }
    return row[b.length];
  };
  const ranked = [...defined].map((name) => ({ name, far: name.includes(type) || type.includes(name) ? 1 : apart(type, name) })).sort((a, b) => a.far - b.far);
  return ranked[0] && ranked[0].far <= Math.max(2, Math.floor(type.length / 4)) ? ranked[0].name : null;
}

/** Check messages for the report's declared charts and diffs. */
export function chartDeclarationFailures(html) {
  const tree = parseReport(html);
  const failures = [];
  const { defined, misnamed } = definedTypes(html);
  let sources = null;
  for (const { type, line, text, source, tag, holder } of chartDeclarations(html, tree)) {
    const at = `data-doc-chart="${type}" (line ${line})`;
    // A table written with it that the intake left as it is (natural.mjs: what a whole block holds is
    // the report's; a card stands in a flow, not in a figure or a cell).
    if (tag === "table") {
      failures.push(holder === "figure"
        ? `${at} is on a table inside a <figure>: the chart's card is a figure of its own, so write the table outside it, its <caption> the chart's title`
        : `${at} is on a table the tools leave as written (inside a whole block, an element with a class of the document's own, a cell): a chart is drawn from a table outside one`);
      continue;
    }
    if (misnamed.has(type)) {
      failures.push(`${at}: the document's script defines "${type}" with DocCharts.define, which refuses that name: a chart type's name is lowercase letters, digits and hyphens, a letter first ("interval", "ci-plot"); rename it in both places`);
      continue;
    }
    if (!defined.has(type)) {
      const near = nearestType(type, defined);
      failures.push(near
        ? `${at}: the document's script does not define "${type}", and defines "${near}": write the same name in both places`
        : `${at}: the document's script does not define "${type}": define it once in the document's <script> with DocCharts.define("${type}", ({ host, data, tokens, width, height }) => { … }) (references/writing-html.md, "Figures and charts")`);
      continue;
    }
    if (source !== undefined) {
      // Drawn from a table: its data are the table's rows.
      if (text !== null) {
        failures.push(`${at}: a chart drawn from a table takes its data from the table: take its <script type="application/json"> out`);
        continue;
      }
      const read = readTable(source, (sources ??= sourceTables(tree)));
      if (read.error) failures.push(`${at}: ${read.error}`);
      continue;
    }
    if (text === null) {
      failures.push(`${at} needs its data in a <script type="application/json"> child`);
      continue;
    }
    try {
      JSON.parse(text);
    } catch (error) {
      failures.push(`${at}: its data is not valid JSON (${error.message})`);
    }
  }
  failures.push(...tableViews(tree, (sources ??= sourceTables(tree))).failures);
  for (const { line, text } of diffDeclarations(html)) {
    if (text === null) continue;
    const at = `.doc-diff (line ${line})`;
    try {
      validateDiff(JSON.parse(text));
    } catch (error) {
      failures.push(`${at}: ${error instanceof SyntaxError ? `its options are not valid JSON (${error.message})` : error.message}`);
    }
  }
  return failures;
}

/**
 * Notes on the report's charts drawn from a table, never failures: a card with no title (its table
 * had no caption when it was taken in), and a header the rows are read by that names no column (a
 * header cell with no words: the key "") or one twice (the later column's value kept). `written`: the
 * file's text, when `html` is the file as the intake makes it in memory (gallery check:
 * src/cli/natural.mjs naturalInMemory); a card no chart of the file names its table's key by was made
 * of a table the file holds written with data-doc-chart, whose caption titles it, where only an h3 in
 * the card titles one the file holds (its table's caption then being the table's own).
 */
export function chartDeclarationNotes(html, { written = html } = {}) {
  const tree = parseReport(html);
  const notes = [];
  const { defined } = definedTypes(html);
  let sources = null;
  let filed = null; // the keys of the tables the file's charts draw
  for (const { type, line, text, source, title, tag } of chartDeclarations(html, tree)) {
    if (source === undefined || tag === "table" || text !== null || !defined.has(type)) continue; // a failure's, or no table's
    const at = `data-doc-chart="${type}" (line ${line})`;
    if (!title) {
      filed ??= new Set(written === html ? [] : chartDeclarations(written).map((chart) => chart.source).filter((key) => key !== undefined));
      const made = written !== html && !filed.has(source); // made in memory of a table the file holds
      notes.push(`${at}: this chart card has no title: ${made ? "write a <caption> on its table (the one with data-doc-chart), which becomes the card's h3" : "write an h3 in the card's figure, before the chart"}`);
    }
    const read = readTable(source, (sources ??= sourceTables(tree)));
    if (read.error) continue; // a failure of its own (chartDeclarationFailures)
    const { blank, twice } = rowsReading(read.cells, read.data);
    if (blank) notes.push(`${at}: its table's header (line ${read.line}) has a cell with no words, so that column's values are keyed "" in data: write the column's name there`);
    if (twice.length > 0) notes.push(`${at}: its table's header (line ${read.line}) names ${twice.map((name) => `"${name}"`).join(", ")} twice, so data keeps the later column's value under it: give each column a name of its own`);
  }
  notes.push(...tableViews(tree, (sources ??= sourceTables(tree))).notes);
  return notes;
}

// ---------- views of a table ----------

/**
 * The rows a view's table was held to: typing in one of VIEW_ROWS rows read by three views stayed under
 * its bound (scenario tableViewLatency, docs/testing.md); past it a note.
 */
export const VIEW_ROWS = 500;

// What is wrong with the views of tables in the document (`failures`, the checks', as a chart's: a key
// on what is no instance, a key no table, or two, carries, a frame with no table) and what is worth a
// look (`notes`: its table has merged cells, which no view reads; more rows than VIEW_ROWS; its block
// does not read tables, its needs holding no "tables"; the view written before its table, which works
// as it is and is not how a block's writing.md writes it: the table, then the view after it).
function tableViews(tree, sources) {
  const failures = [];
  const notes = [];
  let packages = null; // the catalog, read at the first view (a page with none needs none of it)
  walk(tree, (node) => {
    const key = attr(node, VIEW_FROM);
    if (key === undefined || !node.sourceCodeLocation) return;
    packages ??= currentCatalog().packages;
    const id = attr(node, ATTRIBUTE);
    const at = `${id ?? node.tagName} (line ${node.sourceCodeLocation.startLine})`;
    if (!isInstance(node)) return void failures.push(`<${node.tagName}> (line ${node.sourceCodeLocation.startLine}) carries ${VIEW_FROM}="${key}", which only a view of a table carries: an instance of a custom block (<div data-doc-component="<scope>/<name>">) whose block's needs hold "tables"; take it off`);
    if (!CHART_KEY.test(key)) return void failures.push(`${at}: ${VIEW_FROM}="${key}" is no key: a letter, then letters, digits, "_" or "-", 32 at most, as the table's frame writes it in ${CHART_SOURCE}`);
    const frames = sources.get(key) ?? [];
    if (frames.length === 0) return void failures.push(`${at}: no table's frame carries ${CHART_SOURCE}="${key}", so the view has no table to read: put the table back, or delete the view`);
    if (frames.length > 1) return void failures.push(`${at}: ${frames.length} tables carry ${CHART_SOURCE}="${key}" (lines ${frames.map(({ line }) => line).join(", ")}): a key names one table (the view reads the first); take it off the copies`);
    const [{ line, offset, table }] = frames;
    if (!table) return void failures.push(`${at}: the frame carrying ${CHART_SOURCE}="${key}" (line ${line}) holds no table`);
    if (node.sourceCodeLocation.startOffset < offset) notes.push(`${at} stands before the table it reads (${CHART_SOURCE}="${key}", line ${line}): it works there, but each block's writing.md writes the table first and the view after it, as its example does: move the view below the table, unless the document is meant to open on it`);
    const needs = packages.get(id)?.needs;
    if (needs && !needs.includes("tables")) notes.push(`${at} carries ${VIEW_FROM}="${key}", but its block's needs hold no "tables", so it reads no table: add "tables" to needs in its component.json, or take the key off`);
    const cells = tableCells(table);
    if (cells.merged) notes.push(`${at}: its table (line ${line}) has merged cells, which no view reads, so the view shows nothing of it: write each value in its own cell`);
    const rows = cells.names ? cells.rows.length : Math.max(0, cells.rows.length - 1);
    if (rows > VIEW_ROWS) notes.push(`${at}: its table (line ${line}) has ${rows} rows: every view of a table reads it again as it is typed in, and past ${VIEW_ROWS} rows that slows typing in it; split it, or keep what a view shows to ${VIEW_ROWS} rows`);
  }, BODY);
  return { failures, notes };
}

/**
 * What each chart drawn from a table reads of it, never a failure (gallery check and gallery export
 * print them, so the Agent sees how its cells read before its code meets them). `readings`, a line a
 * chart, information with nothing to do ("chart <slug>: …", pipeline.mjs reportNotes): at the chart's
 * line and its table's, how many rows its data has, each column by its header's words and how its
 * values read (numbers, words, or the counts of each and of the empty ones, null). `notes`, what is
 * worth a look ("note <slug>: …"): a column whose values read as numbers in some rows and as words in
 * others, the rows of its <tfoot> left out, cells past the header. None for one that fails
 * (chartDeclarationFailures says why); a blank or repeated header is chartDeclarationNotes'.
 */
export function tableChartReadings(html) {
  const tree = parseReport(html);
  const readings = [];
  const notes = [];
  const { defined } = definedTypes(html);
  let sources = null;
  const plural = (count, word) => `${count} ${word}${count === 1 ? "" : "s"}`;
  for (const { type, line, text, source, tag } of chartDeclarations(html, tree)) {
    if (source === undefined || tag === "table" || text !== null || !defined.has(type)) continue;
    const read = readTable(source, (sources ??= sourceTables(tree)));
    if (read.error) continue;
    const { rows, columns, foot, extra } = rowsReading(read.cells, read.data);
    const at = `data-doc-chart="${type}" (line ${line})`;
    const parts = [plural(rows, "row")];
    for (const { name, numbers, words, empty } of columns) {
      const total = numbers + words + empty;
      const said = numbers === total && total > 0 ? "numbers"
        : words === total && total > 0 ? "words"
          : [numbers && plural(numbers, "number"), words && `${words} as words`, empty && `${empty} empty (null)`].filter(Boolean).join(", ") || "no rows";
      parts.push(`"${name}": ${said}`);
      if (numbers > 0 && words > 0) notes.push(`${at}: its table's column "${name}" (line ${read.line}) reads as numbers in ${plural(numbers, "row")} and as words in ${words}: write each of its cells as one number (an empty cell, "—" or "n/a" for none: null in data), or, for a column of words, data-sort-type="text" on its header cell`);
    }
    if (foot > 0) notes.push(`${at}: its table's <tfoot> (line ${read.line}) holds ${plural(foot, "row")} the chart leaves out, and a table with a <tfoot> has no table tools in the preview: keep a total out of a table you chart and say it in the text`);
    if (extra > 0) notes.push(`${at}: ${plural(extra, "row")} of its table (line ${read.line}) ${extra === 1 ? "has" : "have"} cells past the header, which the chart does not read: give each column a header cell`);
    readings.push(`${type} (line ${line}) reads its table (line ${read.line}): ${parts.join("; ")}`);
  }
  return { readings, notes };
}
