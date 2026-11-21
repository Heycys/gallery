import { CELL_ALIGN_CLASSES } from "../../../../shared/components/table.mjs";
import { languageFromFence } from "./languages.mjs";
import { decodeEntities, parseCellMarkdown, parseInlineMarkdown, unescapeMarkdown } from "./inline.mjs";
import { spec } from "./rich.mjs";

// Markdown and plain text as block specs, read line by line straight into blocks (no HTML between).
// Notion's Markdown export reads back with its structure (own/export.mjs writes the same):
//   # … ######  (5 and 6 are heading 4), - * + • items, 1. 1) items (a numbered one's number
//   kept, props.number: to-blocks.mjs starts the list at its first item's), - [ ] / - [x] to-dos,
//   ``` and ~~~ code (its language after the fence), $$ math $$ and the forms AI answers copy (below),
//   ---, | tables |, > quotes (lines in a row are one quote; after an empty line or a nested > its
//   blocks), <aside> callouts </aside> (the first line an emoji and text), ![images](…).
//   Indentation (any number of spaces; own/export.mjs writes 4) makes blocks of the line above; empty
//   lines are skipped; inline text is inline.mjs's. An item whose line holds "&nbsp;" alone is one of
//   no words, as a page export (复制页面内容's) writes an item of none over what it holds (own/
//   writers.mjs lineOf), and as the import reads it.
//
// A whole document (readMarkdownDocument: the import's, src/transfer/import.mjs, never a paste) is
// read as a Markdown viewer shows it (CommonMark and GFM, as GitHub shows a .md file), on the same
// rules where they agree:
//   paragraphs  the lines of one (up to an empty line or a line that starts another block; a line 4
//               spaces deeper than it is a block under it, as a paste reads it) joined by a space, none between
//               two East Asian characters (Pandoc's east_asian_line_breaks); a line ending in two
//               spaces or a backslash a line break; a line of === or --- right under one makes it a
//               heading (setext); a display formula amid its words ($$…$$) a formula block between
//               its parts, as a viewer shows one on a line of its own
//   items       their lines joined so too (a line less than 4 spaces deeper than the item's text);
//               a numbered one's number kept (props.number: a list that starts at 3 goes on so); one
//               of no words on its line ("- ", or "- &nbsp;" as a page export writes one over what it
//               holds) holds the blocks indented under it, its text empty
//   headings    their level and line kept (props.level, props.line: the import makes the report's
//               title and sections of them), a {#id} after one left off
//   code        its title from the fence's info string, ```js title="src/x.js" (title=src/x.js,
//               title='…'; Pandoc's ```{.js title="…"} too); a language the kit does not know kept
//               by the fence's name (props.fence); a ```mermaid flowchart that is one chain of
//               steps (flowchart or graph, edges A --> B --> C, labels in [] or ()) a flow of its
//               steps, a spec { type: "flow", props: { steps, line } } (the import writes the flow
//               component's markup); any other mermaid stays code,
//               noted. A title is the fence's alone: a bold line above the fence is a paragraph
//   math        a display formula ($$, \[ on a line) by Pandoc's rule: closed before an empty line, at
//               a line ending in its close or starting with it ("$$ (1)": its number a \tag, other
//               words a paragraph after it); one not closed so ends at the empty line (or a heading,
//               a fence), noted, and one with nothing in it stays its line's text. \begin{equation|
//               align|gather|multline|…} … \end{…} on lines of its own a formula block too, ended so
//               (its \end added), one KaTeX does not draw (multline, flalign, eqnarray) as the
//               nearest it does, noted
//   tables      GFM's: a header row and its delimiter row (pipes at the ends or not; \| a pipe in
//               a cell, inside code and formulas too), then its rows up to an empty line or a line
//               that starts another block
//   quotes      > lines and the lazy lines after them, read as a document: its paragraphs a quote,
//               any other block of it (a list, code, a table…) standing in place out of the quote,
//               which holds paragraphs alone, noted; GitHub's alerts (> [!NOTE], [!TIP],
//               [!IMPORTANT], [!WARNING], [!CAUTION]) callouts
//   pictures    a paragraph's pictures blocks of their own, the text around them paragraphs; an
//               item's blocks it holds; a table cell's its own, amid its words (单元格里的图片: the
//               import makes each a file of the page's, transfer/import.mjs); elsewhere (a heading,
//               a disclosure's title) a picture of the web a link, any other its alt text, noted
//   HTML        <details><summary> … </details> a toggle, its blocks read as Markdown; an HTML block
//               of pictures alone (<p align="center"><img …></p>, a link around them) its picture
//               blocks, of an <hr> a divider, of line breaks or empty tags nothing; any other HTML
//               block (CommonMark's: a block element's tag starting a line, up to an empty line;
//               <pre> up to </pre>; a tag alone on its line) kept as written, a spec { type:
//               "html", props: { html, line } }; comments left out, <script>, <style> and
//               <textarea> left out and noted
//   footnotes   [^label]: definitions (and their indented lines) taken out and returned as
//               `footnotes`, numbered as first referred to (those never referred to after them);
//               a reference is inline.mjs's
//   links       [label]: address "title" definitions taken out (an address with a . / : or #, or in
//               <>: "[注]: 一句话" stays words), their references inline.mjs's
//   dividers    "- - -", "* * *" too; a [TOC] line left out
// What it leaves out or keeps otherwise than a viewer shows it is noted, with its line (counted from
// `firstLine`): `notes` [{ line, kind, text }]; what the import tries or looks for afterwards is
// returned with its line too: the formulas (`formulas`, KaTeX draws them or not) and the links to
// addresses that are no web ones (`links`: a file beside the document, a place in it).
//
// Yuque's Markdown (`yuque`: its toolbar's 复制为 Markdown, which yuque.mjs reads so; never the
// import's) is that, and what Yuque writes besides:
//   :::info … :::  its 提示 (info, tips, success, warning, danger, color1–5; up to a line of ::: alone),
//               a spec { type: "report_callout", props: { alert } } of the blocks between
//   HTML        every HTML block a spec { type: "html", props: { html } } (yuque.mjs reads it as the
//               paste reads HTML: a picture's alt is no caption, Yuque's being a file's name)
//   tables      a row of more cells than its header's (Yuque writes a | in a cell as it is) its cells
//               past the header's last one that one's, joined by |; the delimiter row's alignments
//               each cell's (props.looks: doc-align-left / center / right)
//   code        a ```mermaid fence code, never a flow
//   inline      inline.mjs's: $ … $ with spaces inside, <font style> colors

// A callout's first line: an emoji first is its icon, then its text.
const EMOJI = /^(\p{Extended_Pictographic}(?:[\u{FE0F}\u{200D}\u{1F3FB}-\u{1F3FF}]|\p{Extended_Pictographic})*)\s*/u;
function callout(head, children, inline = parseInlineMarkdown) {
  const match = EMOJI.exec(head);
  const text = (match ? head.slice(match[0].length) : head).trim();
  const blocks = text ? [spec("text", inline(text)), ...children] : children;
  return spec("callout", [], match ? { icon: match[1] } : {}, blocks.length ? blocks : [spec("text")]);
}

/** A table spec of rows of rich text (columns c0, c1, …); `looks`, each column's look of its cells (a class, or none); `lines`: each row's line in a document (what the import notes of its pictures is at it). */
export function tableSpec(rows, header, looks = [], lines = null) {
  const width = Math.max(1, ...rows.map((row) => row.length));
  const columns = Array.from({ length: width }, (_, i) => `c${i}`);
  const looked = Object.fromEntries(columns.map((column, i) => [column, looks[i]]).filter(([, look]) => look));
  return spec("table", [], { table_block_column_order: columns, table_block_column_format: {}, table_block_column_header: header, table_block_row_header: false },
    rows.map((row, index) => spec("table_row", [], { cells: Object.fromEntries(row.map((cell, i) => [columns[i], cell])), ...(Object.keys(looked).length ? { looks: looked } : {}), ...(lines ? { line: lines[index] } : {}) })));
}

// A delimiter row's cell's alignment (:--, :-:, --:) as a cell's look (the table's classes: left,
// center, right), or null.
const [LEFT, CENTER, RIGHT] = CELL_ALIGN_CLASSES;
const alignOf = (cell) => {
  const text = cell.trim();
  return text.startsWith(":") && text.endsWith(":") ? CENTER : text.startsWith(":") ? LEFT : text.endsWith(":") ? RIGHT : null;
};

const indentOf = (raw) => raw.match(/^[ \t]*/)[0].replace(/\t/g, "    ").length;
const dedent = (lines, n) => lines.map((line) => line.replace(new RegExp(`^[ \\t]{0,${n}}`), ""));

/** Markdown (or any plain text) as block specs. */
export const fromMarkdown = (text) => parseLines(text.replace(/\r\n?/g, "\n").split("\n"));

// Display formulas: $$ on lines of their own (Notion's export) and what AI answers copy: $$ … $$ in
// one line, $$ followed by the formula up to a line ending in $$, \[ … \] in one line or on lines
// of their own, \\[ … \\] (escaped Markdown, ChatGPT's: unescaped inside). Returns { close, unescape,
// rest, single } when the line starts one (rest: the formula's part on that line).
const DISPLAY_MATH = [
  { open: "\\\\[", close: "\\\\]", unescape: true },
  { open: "\\[", close: "\\]", unescape: false },
  { open: "$$", close: "$$", unescape: false },
];
function displayMathStart(line) {
  for (const d of DISPLAY_MATH) {
    if (!line.startsWith(d.open)) continue;
    const rest = line.slice(d.open.length).trimEnd();
    if (!rest.endsWith(d.close) && rest.includes(d.close)) return null; // text after its end: an inline one
    return { ...d, rest, single: rest.endsWith(d.close) };
  }
  return null;
}
const mathTitle = (body, unescape) => {
  const tex = body.join("\n").trim();
  const text = unescape ? unescapeMarkdown(tex) : tex;
  return text ? [[text]] : [];
};

// A table row's cells: split at |, but not at \|, nor inside `code` or a formula (GFM's rule, and
// formulas). `escaped`: a whole document's, where \| is a pipe inside code and formulas too (GFM).
function tableCells(line, escaped = false) {
  const s = line.trim().replace(/^\|/, "").replace(/(?<!\\)\|$/, "");
  const cells = [];
  let cell = "";
  for (let i = 0; i < s.length;) {
    const rest = s.slice(i);
    const span = /^(`+)[\s\S]*?\1/.exec(rest) || /^\\\\\([\s\S]*?\\\\\)/.exec(rest) || /^\\\([\s\S]*?\\\)/.exec(rest) || /^\$\$[^$]*?\$\$/.exec(rest) || /^\$(?=\S)[^$]*?\S\$/.exec(rest);
    if (span) {
      cell += escaped ? span[0].replace(/\\\|/g, "|") : span[0];
      i += span[0].length;
      continue;
    }
    if (rest.startsWith("\\|")) {
      cell += "|";
      i += 2;
      continue;
    }
    if (s[i] === "|") {
      cells.push(cell.trim());
      cell = "";
      i++;
      continue;
    }
    cell += s[i++];
  }
  cells.push(cell.trim());
  return cells;
}

const HEADINGS = ["header", "sub_header", "sub_sub_header", "header_4", "header_4", "header_4"];
const FENCE = /^(`{3,}|~{3,})\s*([\w+#.-]*)([^`]*)$/;
const HEADING = /^(#{1,6})\s+(.*?)(?:\s+#+)?$/;
// The line of an item of no words over what it holds, as a page export writes it (own/writers.mjs lineOf).
const NO_WORDS = "&nbsp;";

function parseLines(lines, doc = null, base = 0) {
  const root = [];
  const stack = [{ depth: -1, children: root }];
  const add = (block, indent) => {
    while (stack.length > 1 && stack.at(-1).depth >= indent) stack.pop();
    stack.at(-1).children.push(block);
    stack.push({ depth: indent, children: block.children });
  };
  const lineOf = (i) => (doc ? doc.firstLine + base + i : 0);
  // Inline text: parseInlineMarkdown's rules (inline.mjs) for a paste; a document's rules, its pictures links or words (textOnly), for a document.
  const inline = (text, i) => (doc ? textOnly(docInline(doc, text, lineOf(i)), lineOf(i), doc) : parseInlineMarkdown(text));
  // A table's cell, which holds pictures (单元格里的图片): a document's rules or a paste's, its pictures kept.
  const cellInline = (text, i) => (doc ? docInline(doc, text, lineOf(i)) : parseCellMarkdown(text));
  // A list item: a paste's rules for a paste (a page export's line of no words, "&nbsp;", none); a
  // document's, its pictures blocks it holds (before the blocks indented under it).
  const item = (type, text, i, props = {}) => {
    if (!doc) return spec(type, text === NO_WORDS ? [] : parseInlineMarkdown(text), props);
    const title = docInline(doc, text, lineOf(i));
    return spec(type, trimmed(title.filter((piece) => !pictureOf(piece))), props, title.filter(pictureOf).map((piece) => pictureSpec(pictureOf(piece), lineOf(i))));
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim()) continue;
    const indent = indentOf(raw);
    const line = raw.trim();
    let block;
    let blocks = null; // several blocks of one source (a paragraph and its pictures)
    let m;
    let math;
    let html;
    if ((m = FENCE.exec(line))) {
      // Code: ``` or ~~~ (a language after it), up to a fence of the same kind, no shorter.
      const fence = m[1];
      const start = i;
      const body = [];
      for (i++; i < lines.length && !(lines[i].trim().startsWith(fence[0].repeat(fence.length)) && /^(`+|~+)$/.test(lines[i].trim())); i++) body.push(lines[i]);
      const code = dedent(body, indent).join("\n").replace(/\n+$/, ""); // no empty lines at its end
      if (doc) block = documentCode(m[2], m[3], code, lineOf(start), doc);
      else {
        const language = m[2] ? languageFromFence(m[2]) ?? m[2][0].toUpperCase() + m[2].slice(1) : undefined;
        block = spec("code", code ? [[code]] : [], language ? { language } : {});
      }
    } else if (doc?.yuque && (m = YUQUE_ALERT.exec(line))) {
      // Yuque's 提示: its blocks up to a line of ::: alone (one opened in it closing first).
      const start = i;
      const body = [];
      for (let depth = 1, at = i + 1; at < lines.length; at++) {
        const each = lines[at].trim();
        depth += YUQUE_ALERT.test(each) ? 1 : each === ":::" ? -1 : 0;
        i = at;
        if (depth === 0) break;
        body.push(lines[at]);
      }
      block = spec("report_callout", [], { alert: m[1].toLowerCase() }, parseLines(dedent(body, indent), doc, base + start + 1));
    } else if ((math = displayMathStart(line))) {
      if (math.single) {
        block = spec("equation", mathTitle([math.rest.slice(0, -math.close.length)], math.unescape));
        if (doc && block.title.length) doc.formulas.push({ tex: block.title[0][0], line: lineOf(i), display: true });
      } else if (doc) {
        // A whole document's (Pandoc's rule): closed before an empty line, at a line that ends in its
        // close or starts with it ("$$ (1)": its number a \tag, other words a paragraph after it).
        // One that is not ends there, noted; one with nothing in it its line as text.
        const start = i;
        const end = displayEnd(lines, i, math.close);
        const body = [math.rest, ...lines.slice(i + 1, end.at).map((each) => each.trim()), end.rest].filter((each) => each.trim());
        i = end.closed ? end.at : end.at - 1;
        if (!end.closed && !body.length) {
          doc.notes.push({ line: lineOf(start), kind: "math", text: `${math.open} opens no formula (an empty line follows it): kept as text` });
          block = spec("text", [[line]]);
        } else {
          if (!end.closed) doc.notes.push({ line: lineOf(start), kind: "math", text: `the display formula opened by ${math.open} is not closed before an empty line: it ends at line ${lineOf(i)}` });
          let tex = mathTitle(body, math.unescape)[0]?.[0] ?? "";
          const number = /^\(([\w.:-]{1,16})\)$/.exec(end.after);
          if (number && !/\\(tag|notag|nonumber)\b/.test(tex)) tex += ` \\tag{${number[1]}}`;
          blocks = [spec("equation", tex ? [[tex]] : [])];
          if (tex) doc.formulas.push({ tex, line: lineOf(start), display: true });
          if (end.after && !number) blocks.push(...paragraphBlocks(docInline(doc, end.after, lineOf(i)), lineOf(i)));
        }
      } else {
        const body = math.rest.trim() ? [math.rest] : [];
        for (i++; i < lines.length; i++) {
          const next = lines[i].trim();
          if (next.endsWith(math.close)) {
            body.push(next.slice(0, -math.close.length));
            break;
          }
          body.push(next);
        }
        block = spec("equation", mathTitle(body, math.unescape));
      }
    } else if (doc && (m = BEGIN.exec(line))) {
      // \begin{align} … \end{align}: the whole environment, KaTeX draws it as a display formula; one
      // KaTeX has not (multline, flalign, eqnarray) as the nearest it has, noted.
      // One not ended before an empty line (a heading, a fence) ends there, its \end{…} added, noted.
      const start = i;
      const end = `\\end{${m[1]}}`;
      const body = [line];
      let closed = line.includes(end);
      for (let j = i + 1; !closed && j < lines.length; j++) {
        const next = lines[j].trim();
        if (!next || HEADING.test(next) || FENCE.test(next)) break;
        body.push(next);
        i = j;
        closed = next.includes(end);
      }
      if (!closed) {
        body.push(end);
        doc.notes.push({ line: lineOf(start), kind: "math", text: `\\begin{${m[1]}} is not ended before an empty line: ${end} added at line ${lineOf(i)}` });
      }
      let tex = body.join("\n");
      const name = m[1].replace(/\*$/, "");
      if (KATEX_LACKS[name]) {
        const as = KATEX_LACKS[name] + m[1].slice(name.length);
        tex = tex.replace(`\\begin{${m[1]}}`, `\\begin{${as}}`).replace(end, `\\end{${as}}`);
        doc.notes.push({ line: lineOf(start), kind: "math", text: `KaTeX draws no ${m[1]} environment: written as ${as}` });
      }
      block = spec("equation", [[tex]]);
      doc.formulas.push({ tex, line: lineOf(start), display: true });
    } else if (line === "<aside>") {
      // A callout as Notion's Markdown writes it: its first line an icon and text, then its blocks, up to its own </aside> (a
      // callout in a highlight block has its own too).
      const start = i;
      const body = [];
      for (let depth = 1, at = i + 1; at < lines.length; at++) {
        const each = lines[at].trim();
        depth += each === "<aside>" ? 1 : each === "</aside>" ? -1 : 0;
        i = at;
        if (depth === 0) break;
        body.push(lines[at]);
      }
      const inner = dedent(body, indent);
      const first = inner.findIndex((l) => l.trim());
      const head = first < 0 ? "" : inner[first].trim();
      block = doc
        ? callout(head, first < 0 ? [] : parseLines(inner.slice(first + 1), doc, base + start + first + 2), (text) => inline(text, start + first + 1))
        : callout(head, first < 0 ? [] : parseLines(inner.slice(first + 1)));
    } else if (doc && /^<details(?=[\s>]|$)/i.test(line)) {
      // A disclosure of HTML: its summary its title, what is between its tags read as Markdown.
      const start = i;
      const body = [];
      let depth = 0;
      for (; i < lines.length; i++) {
        body.push(lines[i]);
        depth += (lines[i].match(/<details(?=[\s>])/gi) ?? []).length - (lines[i].match(/<\/details\s*>/gi) ?? []).length;
        if (depth <= 0) break;
      }
      const text = body.join("\n");
      const summary = /<summary(?:\s[^>]*)?>([\s\S]*?)<\/summary\s*>/i.exec(text);
      let inner = text.replace(/^\s*<details(?:\s[^>]*)?>/i, "").replace(/<\/details\s*>\s*$/i, "");
      if (summary) inner = inner.replace(summary[0], "");
      block = spec("toggle", summary ? inline(summary[1].replace(/\s+/g, " ").trim(), start) : [], {}, parseLines(dedent(inner.split("\n"), indent), doc, base + start));
    } else if (doc && (html = htmlStart(line))) {
      // An HTML block: up to an empty line, or up to its end tag's line (<pre>, <script>, a comment).
      const start = i;
      const body = [raw];
      if (html.end) {
        if (!line.toLowerCase().slice(1).includes(html.end)) {
          for (i++; i < lines.length; i++) {
            body.push(lines[i]);
            if (lines[i].toLowerCase().includes(html.end)) break;
          }
        }
      } else for (; i + 1 < lines.length && lines[i + 1].trim(); i++) body.push(lines[i + 1]);
      if (html.kind === "comment") continue;
      if (DROPPED_HTML.has(html.kind)) {
        doc.notes.push({ line: lineOf(start), kind: "html", text: `a <${html.kind}> block is left out` });
        continue;
      }
      const written = dedent(body, indent).join("\n").trim();
      const bare = written.replace(/<!--[\s\S]*?-->/g, "").replace(PICTURE_TAGS, "").trim();
      if (doc.yuque) block = spec("html", [], { html: written, line: lineOf(start) }); // read as the paste reads HTML (yuque.mjs)
      else if (!bare && /<img\s/i.test(written)) blocks = paragraphBlocks(docInline(doc, written.replace(/\s+/g, " "), lineOf(start)), lineOf(start)); // pictures alone (<p align="center"><img …></p>): picture blocks
      else if (!bare && /<hr\b/i.test(written)) block = spec("divider");
      else if (!bare) continue; // line breaks or empty tags alone: a viewer's spacing
      else block = spec("html", [], { html: written, line: lineOf(start) });
    } else if (/^>/.test(line)) {
      if (doc) {
        // A quote: its > lines (and the lazy lines after its text) read as a document.
        const start = i;
        const body = [];
        for (; i < lines.length; i++) {
          if (/^\s*>/.test(lines[i])) body.push(lines[i].replace(/^\s*>\s?/, ""));
          else if (lines[i].trim() && body.length && body.at(-1).trim() && !startsBlock(lines[i].trim())) body.push(lines[i].trim());
          else break;
        }
        i--;
        blocks = documentQuote(body, doc, base + start);
      } else {
        // Lines of > in a row are one quote: its first lines (up to an empty line or a nested >) its
        // text, the rest its blocks (a nested > a quote of its own).
        const body = [];
        for (; i < lines.length && /^\s*>/.test(lines[i]); i++) body.push(lines[i].trim().replace(/^>\s?/, ""));
        i--;
        const end = body.findIndex((l) => !l.trim() || /^>/.test(l.trim()));
        const head = end < 0 ? body : body.slice(0, end);
        block = spec("quote", parseInlineMarkdown(head.join("\n")), {}, end < 0 ? [] : parseLines(body.slice(end)));
      }
    } else if (doc && tableAt(lines, i)) {
      // GFM's table: its header row, its delimiter row, then its rows.
      // Each row's cells read at its line (what they leave out noted there).
      const rows = [[tableCells(lines[i], true), i]];
      const delimiter = tableCells(lines[i + 1], true);
      for (i += 2; i < lines.length && lines[i].trim() && (/^\s*\|/.test(lines[i]) || !startsBlock(lines[i].trim())); i++) rows.push([tableCells(lines[i], true), i]);
      i--;
      // Yuque's: a | it wrote as it is joins the cells past the header's last one to that one; its alignments its cells'.
      const width = rows[0][0].length;
      const fitted = doc.yuque ? rows.map(([row, at]) => [row.length > width ? [...row.slice(0, width - 1), row.slice(width - 1).join("|")] : row, at]) : rows;
      block = tableSpec(fitted.map(([row, at]) => row.map((cell) => cellInline(cell, at))), true, doc.yuque ? delimiter.map(alignOf) : [], fitted.map(([, at]) => lineOf(at)));
    } else if (/^\|.*\|$/.test(line)) {
      const rows = [];
      let header = false;
      for (; i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i]); i++) {
        const cells = tableCells(lines[i], Boolean(doc));
        if (cells.every((cell) => /^:?-+:?$/.test(cell))) {
          if (rows.length === 1) header = true;
          continue;
        }
        rows.push(cells.map((cell) => cellInline(cell, i)));
      }
      i--;
      block = tableSpec(rows, header);
    } else if ((m = HEADING.exec(line))) {
      const text = doc ? m[2].replace(/\s*\{#[^}\s]*\}$/, "") : m[2];
      block = spec(HEADINGS[m[1].length - 1], doc ? inline(text, i) : parseInlineMarkdown(text), doc ? { level: m[1].length, line: lineOf(i) } : {});
    } else if (doc && HR.test(line)) block = spec("divider");
    else if ((m = /^[-*+•]\s+\[([ xX])\]\s*(.*)$/.exec(line)) || (m = /^\[([ xX]?)\]\s+(.*)$/.exec(line))) {
      const start = i;
      const text = doc ? itemText(lines, i, indent, line.length - m[2].length, (end) => (i = end)) : m[2];
      block = item("to_do", text, start, { checked: /x/i.test(m[1]) });
    } else if ((m = /^[-*+•]\s+(.*)$/.exec(line)) || /^[-*+•]$/.test(line)) {
      const start = i;
      const text = doc && m ? itemText(lines, i, indent, line.length - m[1].length, (end) => (i = end)) : m ? m[1] : "";
      block = item("bulleted_list", text, start);
    } else if ((m = /^\d+[.)]\s+(.*)$/.exec(line))) {
      const start = i;
      const text = doc ? itemText(lines, i, indent, line.length - m[1].length, (end) => (i = end)) : m[1];
      block = item("numbered_list", text, start, { number: Number.parseInt(line, 10) });
    } else if (/^(-{3,}|\*{3,}|_{3,})$/.test(line)) block = spec("divider");
    else if (!doc && (m = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(line))) block = spec("image", [], { source: m[2], ...(m[1] ? { caption: [[m[1]]] } : {}) });
    else if (doc && /^\[\[?toc\]\]?$/i.test(line)) continue; // a viewer's table of contents
    else if (doc) {
      // A paragraph: its lines, then a setext heading's underline under it.
      const start = i;
      const end = continuationEnd(lines, i, indent + 4);
      const text = joinLines(lines.slice(i, end + 1));
      i = end;
      const under = lines[i + 1];
      if (under !== undefined && indentOf(under) <= 3 && /^(=+|-+)\s*$/.test(under.trim())) {
        i++;
        const level = under.trim()[0] === "=" ? 1 : 2;
        block = spec(HEADINGS[level - 1], inline(text, start), { level, line: lineOf(start) });
      } else blocks = paragraphBlocks(docInline(doc, text, lineOf(start)), lineOf(start));
    } else block = spec("text", parseInlineMarkdown(line));
    for (const each of blocks ?? [block]) add(each, indent);
  }
  return root;
}

// ---------- a whole document ----------

const BEGIN = /^\\begin\{((?:equation|align|alignat|gather|multline|flalign|eqnarray)\*?)\}/;
// LaTeX's display environments KaTeX has not, and the nearest it has.
const KATEX_LACKS = { multline: "gather", flalign: "align", eqnarray: "align" };
const HR = /^([-*_])(?:[ \t]*\1){2,}$/;
// CommonMark's HTML blocks that end at an empty line: these elements' tags starting a line.
const BLOCK_TAGS = new Set(("address article aside base basefont blockquote body caption center col colgroup dd details dialog dir div dl dt "
  + "fieldset figcaption figure footer form frame frameset h1 h2 h3 h4 h5 h6 head header hr html iframe legend li link main menu menuitem nav "
  + "noframes ol optgroup option p param search section summary table tbody td tfoot th thead title tr track ul").split(" "));
const DROPPED_HTML = new Set(["script", "style", "textarea"]);
// The tags an HTML block of pictures alone is made of (a README's <p align="center"><img …></p>).
const PICTURE_TAGS = /<\/?(?:p|div|a|center|picture|source|span|br|img|hr)(?=[\s/>])[^>]*>/gi;
const ALERTS = { note: "ℹ️", tip: "💡", important: "❗", warning: "⚠️", caution: "🚨" };
// Yuque's 提示 opened (its Markdown's): ::: and its kind, alone on its line.
const YUQUE_ALERT = /^:::[ \t]*([A-Za-z][\w-]*)[ \t]*$/;
const LINK_DEFINITION = /^\[([^\]^][^\]]*)\]:\s*(<[^>]*>|\S+)(?:\s+("[^"]*"|'[^']*'|\([^)]*\)))?\s*$/;
const FOOTNOTE_DEFINITION = /^\[\^([^\]\s]+)\]:\s?(.*)$/;
// East Asian wide characters (CJK, kana, Hangul, their punctuation and full-width forms): a line
// break between two of them is no space.
const WIDE = /[\u{1100}-\u{115F}\u{2E80}-\u{303E}\u{3041}-\u{33FF}\u{3400}-\u{4DBF}\u{4E00}-\u{9FFF}\u{A960}-\u{A97F}\u{AC00}-\u{D7A3}\u{F900}-\u{FAFF}\u{FE30}-\u{FE4F}\u{FF00}-\u{FF60}\u{FFE0}-\u{FFE6}\u{20000}-\u{3FFFD}]/u;

/** The HTML block a line starts in a whole document: { kind, end? }, or null. */
function htmlStart(line) {
  if (line.startsWith("<!--")) return { kind: "comment", end: "-->" };
  let m = /^<(script|pre|style|textarea)(?=[\s>]|$)/i.exec(line);
  if (m) return { kind: m[1].toLowerCase(), end: `</${m[1].toLowerCase()}>` };
  m = /^<\/?([A-Za-z][A-Za-z0-9-]*)(?=[\s/>]|$)/.exec(line);
  if (m && BLOCK_TAGS.has(m[1].toLowerCase())) return { kind: "block" };
  // A tag alone on its line (CommonMark's 7th kind, which cannot interrupt a paragraph).
  if (/^(?:<[A-Za-z][A-Za-z0-9-]*(?:\s+[A-Za-z_:][\w.:-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*\s*\/?>|<\/[A-Za-z][A-Za-z0-9-]*\s*>)$/.test(line)) return { kind: "tag" };
  return null;
}

/**
 * Where a whole document's display formula opened at lines[start] ends, by Pandoc's rule (no empty
 * line in it): { at, closed, rest, after }. Closed, `at` is the line that closes it (one that ends in
 * `close`, for $$ a $$ not paired in that line, or one that starts with it), `rest` the formula's
 * part of that line and `after` the words after its close; else `at` is the first line it does not
 * take (an empty one, a heading, a fence, or the end).
 */
function displayEnd(lines, start, close) {
  let at = start + 1;
  for (; at < lines.length; at++) {
    const line = lines[at].trim();
    if (!line || HEADING.test(line) || FENCE.test(line)) break;
    if (line.startsWith(close)) return { at, closed: true, rest: "", after: line.slice(close.length).trim() };
    if (line.endsWith(close) && (close !== "$$" || line.split("$$").length % 2 === 0)) return { at, closed: true, rest: line.slice(0, -close.length), after: "" };
  }
  return { at, closed: false, rest: "", after: "" };
}

/** Whether a line (trimmed) starts a block that ends a paragraph before it (a whole document's). */
function startsBlock(line) {
  return FENCE.test(line) || Boolean(displayMathStart(line)) || BEGIN.test(line) || HEADING.test(line) || /^>/.test(line) || HR.test(line)
    || /^[-*+•](\s|$)/.test(line) || /^\d+[.)](\s|$)/.test(line) || /^\|/.test(line) || /^=+$/.test(line)
    || line === "<aside>" || (htmlStart(line)?.kind ?? "tag") !== "tag" || FOOTNOTE_DEFINITION.test(line);
}

/** Whether lines[i] is a GFM table's header row: its delimiter row under it, of as many cells. */
function tableAt(lines, i) {
  const head = lines[i]?.trim();
  const next = lines[i + 1]?.trim();
  if (!head?.includes("|") || !next || !/^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?$/.test(next) || !next.includes("|") && !head.startsWith("|")) return false;
  return tableCells(head, true).length === tableCells(next, true).length;
}

// The last line of the text that starts at lines[i]: the lines after it up to an empty line, one
// that starts a block, a table's header, or one `limit` spaces in or deeper (a block under it).
function continuationEnd(lines, i, limit) {
  let end = i;
  while (end + 1 < lines.length) {
    const next = lines[end + 1];
    if (!next.trim() || indentOf(next) >= limit || startsBlock(next.trim()) || tableAt(lines, end + 1)) break;
    end++;
  }
  return end;
}

/** A list item's text in a whole document: its line's after the marker (`marker` long) and the lines that go on with it. */
function itemText(lines, i, indent, marker, moved) {
  const end = continuationEnd(lines, i, indent + marker + 4);
  moved(end);
  return joinLines([lines[i].trim().slice(marker), ...lines.slice(i + 1, end + 1)]);
}

/**
 * Lines of one paragraph as one text: each ended by a space (none between two East Asian
 * characters), or by a line break where it ends in two spaces or a backslash.
 */
function joinLines(raws) {
  let text = "";
  raws.forEach((raw, index) => {
    let line = raw.trim();
    if (index === raws.length - 1) {
      text += line;
      return;
    }
    const slashes = /\\*$/.exec(line)[0].length;
    const hard = / {2,}$/.test(raw.replace(/\t/g, "    ")) || slashes % 2 === 1;
    if (slashes % 2 === 1) line = line.slice(0, -1);
    const next = raws[index + 1].trim();
    text += line + (hard ? "\n" : WIDE.test(line.at(-1) ?? "") && WIDE.test(next[0] ?? "") ? "" : " ");
  });
  return text;
}

const docInline = (doc, text, line) => {
  doc.at = line;
  return parseInlineMarkdown(text, doc);
};
const pictureOf = (piece) => piece[1]?.find((annotation) => annotation[0] === "img") ?? null;
const fileName = (src) => {
  const name = src.split(/[?#]/)[0].split("/").pop() || src;
  try {
    return decodeURIComponent(name);
  } catch {
    return name; // a % that encodes nothing: as written
  }
};

/** Rich text with its pictures (inline.mjs's pieces) as text where a block cannot hold one: a web picture's link, any other's alt text, noted. */
function textOnly(title, line, doc) {
  if (!title.some(pictureOf)) return title;
  return title.map((piece) => {
    const picture = pictureOf(piece);
    if (!picture) return piece;
    const [, src, alt] = picture;
    const others = piece[1].filter((annotation) => annotation !== picture);
    doc.notes.push({ line, kind: "picture-in-text", text: `the picture ${src} stands in a line of text, kept as ${/^https?:\/\//i.test(src) ? "a link to it" : "its words"}` });
    if (/^https?:\/\//i.test(src)) return [alt || src, [...others.filter((annotation) => annotation[0] !== "a"), ["a", src]]];
    return others.length ? [alt || fileName(src), others] : [alt || fileName(src)];
  }).filter((piece) => piece[0]);
}

// A rich text's pieces with the white space at its ends taken off (empty: none).
function trimmed(title) {
  const out = title.map((piece) => [...piece]);
  while (out.length && !out[0][0].trim()) out.shift();
  while (out.length && !out.at(-1)[0].trim()) out.pop();
  if (out.length) {
    out[0][0] = out[0][0].replace(/^\s+/, "");
    out.at(-1)[0] = out.at(-1)[0].replace(/\s+$/, "");
  }
  return out.map((piece) => (piece[1] ? piece : [piece[0]]));
}

// A display formula in a line of text ($$…$$ amid words, inline.mjs's): its TeX, or null.
const displayOf = (piece) => (piece[1]?.some((annotation) => annotation[0] === "display") ? piece[1].find((annotation) => annotation[0] === "e")[1] : null);

/**
 * A paragraph's rich text as blocks: its pictures and display formulas ($$…$$ amid its words, as a
 * viewer shows one: on a line of its own) blocks of their own, the text between them paragraphs,
 * each of them with the paragraph's line (the import joins the words around a picture it does not
 * find again).
 */
function paragraphBlocks(title, line) {
  if (!title.some((piece) => pictureOf(piece) || displayOf(piece) !== null)) return [spec("text", title)];
  const blocks = [];
  let run = [];
  const flush = () => {
    const text = trimmed(run);
    if (text.length) blocks.push(spec("text", text, { line }));
    run = [];
  };
  for (const piece of title) {
    const picture = pictureOf(piece);
    const display = displayOf(piece);
    if (!picture && display === null) {
      run.push(piece);
      continue;
    }
    flush();
    blocks.push(picture ? pictureSpec(picture, line) : spec("equation", display ? [[display]] : []));
  }
  flush();
  return blocks;
}

/** A picture (inline.mjs's img annotation) as a picture block: its alt text its caption, else its title. */
function pictureSpec([, source, alt, title], line) {
  const caption = (alt || title).trim();
  return spec("image", [], { source, ...(caption ? { caption: [[caption]] } : {}), line });
}

/** A fenced code block of a whole document: its title and language from its info string; a simple mermaid flowchart its steps. */
function documentCode(name, meta, code, line, doc) {
  const braces = /^\{([^}]*)\}/.exec(meta.trim());
  const fence = name || /\.([\w+#-]+)/.exec(braces?.[1] ?? "")?.[1] || "";
  const title = /(?:^|[\s{])title=(?:"([^"]*)"|'([^']*)'|([^\s}]+))/.exec(meta);
  if (fence.toLowerCase() === "mermaid" && !doc.yuque) {
    const steps = flowSteps(code);
    if (steps) return spec("flow", [], { steps, line });
    doc.notes.push({ line, kind: "mermaid", text: "a mermaid diagram that is not one chain of steps is kept as its code" });
  }
  const language = fence ? languageFromFence(fence) ?? fence[0].toUpperCase() + fence.slice(1) : undefined;
  const titled = title ? (title[1] ?? title[2] ?? title[3]).trim() : "";
  return spec("code", code ? [[code]] : [], {
    ...(language ? { language } : {}),
    ...(/^[a-z][\w+#.-]{0,23}$/i.test(fence) ? { fence: fence.toLowerCase() } : {}),
    ...(titled ? { title: titled } : {}),
  });
}

// A mermaid flowchart that is one chain of steps: "flowchart" or "graph" (any direction), then edges
// A --> B, chained (A --> B --> C) or one a line, each node's label in [] or () (([ ]), [[ ]], (( ))
// too; else its id), styling lines (style, classDef, class, linkStyle) and %% comments aside. Its
// steps' labels in order, or null: a node alone, a branch, a join, a loop, a labelled or another kind
// of edge, a subgraph.
function flowSteps(code) {
  const statements = code.split("\n").map((each) => each.replace(/%%.*$/, "").trim().replace(/;+$/, "").trim()).filter(Boolean);
  if (!/^(flowchart|graph)(\s+(LR|RL|TD|TB|BT))?$/i.test(statements[0] ?? "")) return null;
  const NODE = /^([^\s[\](){}|<>"]+)\s*(?:\(\[([^\]]*)\]\)|\[\[([^\]]*)\]\]|\(\(([^)]*)\)\)|\[([^\]]*)\]|\(([^)]*)\))?$/;
  const labels = new Map();
  const after = new Map();
  const before = new Map();
  for (const statement of statements.slice(1)) {
    if (/^(style|classDef|class|linkStyle)\s/.test(statement)) continue;
    const parts = statement.split(/\s*-->\s*/);
    if (parts.length < 2) return null;
    let previous = null;
    for (const part of parts) {
      const node = NODE.exec(part);
      if (!node) return null;
      const [, id, ...shapes] = node;
      const label = shapes.find((shape) => shape !== undefined);
      if (label !== undefined) labels.set(id, flowLabel(label));
      else if (!labels.has(id)) labels.set(id, id);
      if (previous !== null) {
        if (after.has(previous) || before.has(id)) return null;
        after.set(previous, id);
        before.set(id, previous);
      }
      previous = id;
    }
  }
  const starts = [...labels.keys()].filter((id) => !before.has(id));
  if (labels.size < 2 || starts.length !== 1) return null;
  const steps = [];
  for (let id = starts[0]; id !== undefined && steps.length <= labels.size; id = after.get(id)) steps.push(labels.get(id));
  return steps.length === labels.size && steps.every(Boolean) ? steps : null;
}
const flowLabel = (label) => decodeEntities(label.trim().replace(/^"([\s\S]*)"$/, "$1").replace(/<br\s*\/?>/gi, " ").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();

// What a quote's blocks other than paragraphs are called in a note.
const KINDS = {
  bulleted_list: "list", numbered_list: "list", to_do: "list", code: "code", table: "table", equation: "formula", image: "picture", html: "HTML",
  callout: "callout", toggle: "disclosure", divider: "divider", flow: "flow", header: "heading", sub_header: "heading", sub_sub_header: "heading", header_4: "heading",
};

/**
 * A quote of a whole document, its lines without their > (`base`: the number of its first line in
 * the lines read): GitHub's alert a callout; else what they read as, its paragraphs a quote (the
 * kit's holds paragraphs alone, a quote in it its paragraphs too) and its other blocks standing
 * where they are, out of it (the paragraphs after one a quote again; a heading starting no section:
 * props.boxed), noted. Returns its blocks.
 */
function documentQuote(body, doc, base) {
  const first = body.findIndex((line) => line.trim());
  const alert = first < 0 ? null : /^\[!(note|tip|important|warning|caution)\]\s*$/i.exec(body[first].trim());
  if (alert) {
    const blocks = parseLines(body.slice(first + 1), doc, base + first + 1);
    return [spec("callout", [], { icon: ALERTS[alert[1].toLowerCase()] }, blocks.length ? blocks : [spec("text")])];
  }
  const inner = parseLines(body, doc, base);
  if (!inner.length) return [spec("quote")];
  const paragraphs = (s) => (s.type === "quote" ? [spec("text", s.title), ...s.children.flatMap(paragraphs)] : [s]);
  const out = [];
  const outside = new Set();
  let run = null;
  for (const s of inner.flatMap(paragraphs)) {
    if (s.type === "text" && !s.children.length) {
      if (run) run.push(s);
      else out.push(run = [s]);
      continue;
    }
    run = null;
    if (/header/.test(s.type)) s.props.boxed = true;
    outside.add(KINDS[s.type] ?? "block");
    out.push(s);
  }
  if (outside.size) doc.notes.push({ line: doc.firstLine + base, kind: "quote", text: `a quote holds paragraphs alone: its ${[...outside].join(", ")} kept in place, out of it` });
  return out.map((each) => (Array.isArray(each) ? spec("quote", each[0].title, {}, each.slice(1)) : each));
}

// Link and footnote definitions, taken out of a document's lines (each emptied, so that the lines
// keep their numbers) before it is read, as a viewer reads them wherever they stand. Code is left alone.
function takeDefinitions(lines, doc) {
  let fence = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const open = /^(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (open && line[0] === fence[0] && open[1].length >= fence.length && /^(`+|~+)$/.test(line)) fence = null;
      continue;
    }
    if (open) {
      fence = open[1];
      continue;
    }
    if (indentOf(lines[i]) > 3) continue;
    let m;
    if ((m = FOOTNOTE_DEFINITION.exec(line))) {
      // Its first line, the lines that go on with it, and paragraphs after an empty line 4 spaces in.
      const start = i;
      const paragraphs = [[m[2]]];
      lines[i] = "";
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j];
        if (!next.trim()) {
          const ahead = lines.slice(j + 1).findIndex((each) => each.trim());
          if (ahead < 0 || indentOf(lines[j + 1 + ahead]) < 4) break;
          paragraphs.push([]);
          continue;
        }
        if (indentOf(next) < 2 && (startsBlock(next.trim()) || paragraphs.length > 1)) break;
        paragraphs.at(-1).push(next);
        lines[j] = "";
        i = j;
      }
      const key = m[1].toLowerCase();
      if (!doc.definitions.has(key)) doc.definitions.set(key, { line: doc.firstLine + start, text: paragraphs.filter((each) => each.length).map(joinLines).join("\n"), number: 0 });
    } else if ((m = LINK_DEFINITION.exec(line)) && /^<|[./:#]/.test(m[2])) {
      const label = m[1].trim().replace(/\s+/g, " ").toLowerCase();
      if (!doc.refs.has(label)) doc.refs.set(label, { href: m[2].replace(/^<|>$/g, ""), title: m[3] ? m[3].slice(1, -1) : "" });
      lines[i] = "";
    }
  }
}

/**
 * A whole Markdown document (the import's) as block specs, read as a Markdown viewer shows it (the
 * header of this file says what that adds to a paste's rules): { specs, footnotes: [{ number,
 * title }] (in order), notes: [{ line, kind, text }], formulas: [{ tex, line, display }] (each
 * formula read, for the import to try), links: [{ href, line }] (each link to an address that is no
 * web one: a file beside it, a place in it) }. `firstLine`: the number of its first line in its file
 * (after a front matter the import took off). `yuque`: Yuque's Markdown, read with what Yuque
 * writes besides (this file's header; a paste's, yuque.mjs).
 */
export function readMarkdownDocument(text, { firstLine = 1, yuque = false } = {}) {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const doc = { firstLine, yuque, refs: new Map(), definitions: new Map(), order: [], notes: [], formulas: [], links: [], at: firstLine };
  doc.footnote = (label) => {
    const definition = doc.definitions.get(label.toLowerCase());
    if (!definition) {
      doc.notes.push({ line: doc.at, kind: "footnote", text: `the footnote [^${label}] has no definition, kept as text` });
      return null;
    }
    if (!definition.number) {
      definition.number = doc.order.length + 1;
      doc.order.push(definition);
    }
    return definition.number;
  };
  takeDefinitions(lines, doc);
  const specs = parseLines(lines, doc);
  // Each note's text, read in turn (one may refer to another, numbered then), then those never referred to.
  for (let index = 0; index < doc.order.length; index++) doc.order[index].title = textOnly(docInline(doc, doc.order[index].text, doc.order[index].line), doc.order[index].line, doc);
  for (const definition of doc.definitions.values()) {
    if (definition.number) continue;
    definition.number = doc.order.length + 1;
    doc.order.push(definition);
    definition.title = textOnly(docInline(doc, definition.text, definition.line), definition.line, doc);
  }
  return { specs, footnotes: doc.order.map(({ number, title }) => ({ number, title })), notes: doc.notes.sort((a, b) => a.line - b.line), formulas: doc.formulas, links: doc.links };
}
