// What a unit's `read` writes with (registry.mjs: a kind's way in gallery read, src/transfer/read-view.mjs).
// The default view is rows: { text, line, id, node }, line and id those of the block that starts on the
// row (null on the rows after its first), text what the right column shows. A block that holds others,
// or that Markdown cannot say, is boxed: a ┌─ row naming it, its rows behind │, a └─ row; a block whose
// first row is not its own words opens with a ── row naming it (a list, a quote, a table, a code block).
// `view` (read-view.mjs viewOf) writes a node of any kind (view.node), another kind's way on an element
// (view.readAs), and has the tools: inline Markdown of a text block (own), a block's {…} of its file's
// classes and attributes (looks), the words (plain, words, wordsIn), the file's own text of an element
// (source), its line (lineAt), a file of the document's folder (fileFacts). Nothing here needs Node.

/** A row that starts block `node` (null: no block's). */
export const rowOf = (node, text) => ({ text, line: node?.line ?? null, id: node?.id ?? null, node: node ?? null });
/** A row that starts no block. */
export const plainRow = (text) => ({ text, line: null, id: null, node: null });
/** Rows behind `by` (an empty row behind it with its trailing blanks off). */
export const prefixed = (rows, by) => rows.map((row) => ({ ...row, text: row.text ? `${by}${row.text}` : by.trimEnd() }));
/** A box: a ┌─ row naming it (block `node`'s), `inner` behind │, a └─ row. */
export const boxed = (node, title, inner) => [rowOf(node, `┌─ ${title}`), ...prefixed(inner, "│ "), plainRow("└─")];
/** A ── row naming block `node`, then `inner`. */
export const labeled = (node, title, inner) => [rowOf(node, `── ${title}`), ...inner];
/** Lines of `text` as rows, the first block `node`'s. */
export const textRows = (node, text) => text.split("\n").map((line, index) => (index === 0 ? rowOf(node, line) : plainRow(line)));
/** A fence as long as it must be: longer than any run of backticks starting a line of `lines`. */
export const fenceOf = (lines) => "`".repeat(Math.max(2, ...lines.map((line) => /^\s*(`*)/.exec(line)[1].length)) + 1);
/** `lines` fenced, of `language`. */
export const fenced = (language, lines) => {
  const fence = fenceOf(lines);
  return [plainRow(`${fence}${language}`), ...lines.map(plainRow), plainRow(fence)];
};
/** A flow's nodes in turn, an empty row between two. */
export function flowRows(nodes, view) {
  const out = [];
  for (const node of nodes) {
    const rows = view.node(node);
    if (rows.length === 0) continue;
    if (out.length) out.push(plainRow(""));
    out.push(...rows);
  }
  return out;
}

/**
 * `text` taken out of its indentation: its lines, the least indentation of them taken off each (the
 * first's counted at the column it starts at, `column`; null: as it is written), blank lines at its
 * start and end left out.
 */
export function dedented(text, column = null) {
  const lines = text.replace(/\s+$/, "").replace(/^(?:[ \t]*\n)+/, "").split("\n");
  const indents = lines.map((line, index) => (line.trim() ? (index === 0 && column !== null ? column : /^[ \t]*/.exec(line)[0].length) : Infinity));
  const least = Math.min(...indents);
  if (!Number.isFinite(least) || least === 0) return lines;
  return lines.map((line, index) => (index === 0 && column !== null ? line.trimStart() : line.slice(Math.min(least, /^[ \t]*/.exec(line)[0].length))));
}

/** A copy of `element` without the elements of `nodes` (blocks it holds, written on their own). */
export function withoutNodes(element, nodes) {
  for (const node of nodes) if (node.el.nodeType === 1) node.el.setAttribute("data-read-held", "");
  const copy = element.cloneNode(true);
  for (const node of nodes) if (node.el.nodeType === 1) node.el.removeAttribute("data-read-held");
  for (const held of copy.querySelectorAll("[data-read-held]")) held.remove();
  return copy;
}

/** The JSON a script of data holds, read; { unreadable: its text } when it does not read. */
export function scriptData(script) {
  try {
    return JSON.parse(script.textContent);
  } catch {
    return { unreadable: script.textContent };
  }
}

/** Rows of a script of data: its JSON as the file has it (taken out of its indentation), fenced. */
export const dataRows = (script) => fenced("json", dedented(script.textContent));
