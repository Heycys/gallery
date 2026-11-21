import path from "node:path";
import { parse } from "parse5";
import { attr, curlyQuoted } from "../../shared/html-tree.mjs";
import { FOLDED_LINES, LINE_START, NOWRAP, lineStart, validFolded } from "../../shared/code-lines.mjs";
import { COLORS } from "../../shared/colors.mjs";
import { FLOWS, instanceSlots, isInstance, isSlot, matchesNode } from "../../shared/components/index.mjs";
import { HEADED } from "../../shared/components/dialog.mjs";
import { pageLanguage } from "../../shared/components/page.mjs";
import { SHEETS_LABEL, shortSheets } from "../../shared/components/sheets.mjs";
import { iconMarkup, iconValueOf } from "../../shared/emoji/icon-value.mjs";
import { escapeText } from "../../shared/escape.mjs";
import { COLUMN_GAP, READING_WIDTH, SPAN, SPAN_SIZE } from "../../shared/media.mjs";
import { kitNamespace } from "../../shared/old-names.mjs";
import { newNames } from "../../shared/new-names.mjs";
import { CHART_DATA, CHART_SOURCE, TABLE_READERS, nextChartKey } from "../../shared/table-chart.mjs";
import { ALIGNS } from "../components/align.mjs";
import { BLOCK_COLORS } from "../components/colors.mjs";
import { DETAILS, DIALOG, PAGE, SECTION, SHEETS } from "../components/kit.mjs";
import { DIALOG_TRIGGER } from "../components/dialog/index.mjs";
import { tabButton } from "../components/sheets/file.mjs";
import { CHECKED, FLOW, TODO } from "../components/list/index.mjs";
import { texSource } from "../components/math/index.mjs";
import { BOX_CLASSES, HOLDS_ONE, UNIT_KINDS } from "../components/registry.mjs";
import { HEADER_LOOK } from "../components/table/index.mjs";
import { backgroundColor, parseColor, textColor } from "../page/clipboard/import/colors.mjs";
import { cellPictureProblem, findUnits, scan } from "./blocks.mjs";
import { BLOCK_LEVEL } from "./html.mjs";
import { addBlockIds, blocksWithoutIds, placeGivenIds, repeatedBlockIds } from "./ids.mjs";
import { lineIndent, removeLines, retitle, textOf } from "./text.mjs";
import { isComponent } from "./units.mjs";

// Natural HTML made the kit's (docs/editor.md, "Natural HTML"): what an Agent writes as any web page
// would, where the kit has markup of its own, is rewritten in place in report.html, so the preview
// edits it as the block it is and the kit shows it as one. The file changes at moments the Agent
// knows of: the reader's first edit in the preview (a commit writes the page's text, which is this
// one: shownSource), an export (handedInSource, with every block's id), `add-block-ids.mjs`, and the import
// for a report it brings in; the preview and the checks read it in memory and write nothing. Only the start and end tags the rules name change (and a formula's delimiters gain a
// span); the rest of the file stays byte for byte. Nothing the author wrote goes silently: what a
// rule would lose stays as written (and readOnlyTexts names it), and what a rule drops, makes near
// or keeps where the kit's markup has no place of its own for it is said in its change's notes.
//   \( … \) in text                → <span class="doc-math-inline">\( … \)</span>
//   <p>\[ … \]</p> (or $$ … $$)    → <div class="doc-math-block">\[ … \]</div>
//   <details> without the kit's (of no class but a block color, its fill, kept)
//                                  → details.doc-details, its summary's words in
//                                    .doc-details-summary-label, the rest in .doc-details-content
//   <pre> outside a code block, a class of its own or not; a <figure> of a pre and its <figcaption>
//                                  → div.doc-code (its language from a language-x class, its id,
//                                    an anchor's target, its data-line-start or Prism's data-start
//                                    as data-line-start, its data-line-numbers and data-folded-lines,
//                                    on the block; its data-wrap="false", or the kit's
//                                    doc-code--nowrap on the pre, the block's doc-code--nowrap;
//                                    a fill, doc-highlight-<color>, on the pre or its code, the block's),
//                                    a .doc-code-title of the caption's words on
//                                    one line, else of the pre's data-title, else empty, pre › code,
//                                    what else the pre and its code carry kept on them
//   <table> outside a table wrapper → div.doc-table-wrap › table.doc-table (its block id on
//                                    the wrapper, the block, and so is a chart's key written on
//                                    it, data-doc-chart-source, and the frame's sizes written in its
//                                    style, --doc-table-height and --doc-span), and only then (a table wrapped already
//                                    is never touched again): each th of it but a row's header
//                                    (scope="row", the header column's: it only sticks) the
//                                    header's look
//                                    (doc-bold doc-highlight-gray, bold alone on one with a
//                                    color of its own), a first row all th (no rowspan) with rows
//                                    after it a thead (neither where the report's own <style> styles
//                                    th or thead), the rows straight in it a tbody, and a caption
//                                    of words alone a p.doc-note right above the wrapper (not
//                                    where the report's own <style> styles caption)
//   <table data-doc-chart="slope"> (a table's rule, and a chart drawn from it: src/shared/table-chart.mjs)
//                                  → figure.doc-figure (its caption of words its h3, the caption
//                                    out of the table) › an empty host
//                                    [data-doc-chart="slope"][data-doc-chart-data="t1"], right
//                                    after the table's wrapper; the wrapper carries
//                                    data-doc-chart-source="t1": a key no other table or chart of
//                                    the report has; data-doc-chart off the table. A table of the
//                                    kit's written so: the same card, its wrapper taking the key (or
//                                    keeping its own)
//   <figure> of one picture, <img> standing in a flow, a paragraph of one picture
//                                  → figure.doc-image with its figcaption (empty when there is none);
//                                    the picture's width="N" (px) or "N%" its --doc-span, a share
//                                    of the reading width wherever it stands (N / 712; a percent of
//                                    the width it stands in: of a column's share in a column, else
//                                    N / 100; .1 to 1), the attribute off the picture, noted
//   any other <figure> (a figure of the report's own: bare, or of classes of its own) standing where
//   a block does (in a flow, FLOW_PARENTS, no figure around it)
//                                  → figure.doc-figure, a card (卡片块), its classes kept after
//                                    its own; a bare one's inside taken in as anywhere (its
//                                    tables, its code, its formulas), one of classes of its own
//                                    (a drawing) left as written; a figure in a card's drawing
//                                    (or in a cell) is part of it, left as written
//   <p>, <h1> … <h4> with text-align: center or right in its style
//                                  → the class doc-align-center or doc-align-right (rule "alignment"; the
//                                    page editor's 对齐与缩进), that declaration off the style (the
//                                    style attribute gone with none left), the rest as written
//   <p> holding only <a class="doc-bookmark" href="…">words</a> (a title, a target, a rel on it at most)
//                                  → figure.doc-bookmark, a bookmark (网页书签) as bookmark/file.mjs
//                                    writes one: its words the title, its title attribute the
//                                    description, its address the URL (the checks fail one that is
//                                    no web address, as for the kit's), an empty caption; nothing fetched
//   <aside> without a class (but a block color, its fill, kept)
//                                  → aside.doc-panel (a highlight panel), unless the report's
//                                    own <style> styles aside; its words paragraphs
//   <dialog id="x"> of no other attribute, of words or starting with a block, no form in it (x a
//   card's id, no other element's) → dialog.doc-dialog, a detail card as dialog/file.mjs writes
//                                    one: its panel, and in .doc-dialog-content all it holds (its
//                                    words paragraphs), a plain <h2> or <h3> first in it an h3
//   <a href="#x"> of no other attribute in a text block, x a detail card's (the kit's or one so
//   written)                       → a.doc-dialog-trigger (rule "dialog link")
//   a detail card outside main (of the kit, or written the short way: the rule above)
//                                  → at main's end, in the file's order, the lines it stood on gone
//                                    (rule "card outside main"): a page's blocks are looked for
//                                    in main alone
//   <section data-doc-sheets="name"> holding <section>s alone, a tab each, the heading it starts
//   with (h2–h4) its name (shared/components/sheets.mjs shortSheets; the area's name may be left out)
//                                  → section.doc-sheet-shell as sheets/file.mjs writes one: its row
//                                    of tabs (div.doc-sheet-tabs) on the shell's line, a
//                                    button.doc-sheet-tab a section, its name the heading's words on
//                                    one line, its key ASCII made of them (else tab-<n>); each
//                                    section a panel, div[data-doc-sheet], of the rest, the heading's
//                                    lines left blank; a name made when none (tabs-<n>, no other
//                                    area's). An area of the kit's (a row of tabs, a panel) is never
//                                    touched; one in neither form the checks fail, saying why
//   a GFM task list (each item a checkbox first), GFM items in a ul.doc-todo
//                                  → ul.doc-todo, a checked item li[data-checked], the boxes gone
//                                    (unless the report's own style or script uses GFM's classes or
//                                    checkboxes)
//   <ol data-doc-chart="flow">, <ol data-flow> (no class of the report's own)
//                                  → ol.doc-flow, a flowchart (each item a step, what it holds
//                                    after its words, a paragraph, a list…, that step's content), the
//                                    tag as written but the mark
//   a flowchart's step written the short way, <li>收集数据<p>…</p></li> (its own words first, after
//   its icon when one comes first)
//                                  → a node: <li><p><strong>收集数据</strong></p><p>…</p></li>, its
//                                    words its first paragraph, its title (a <p> alone around words
//                                    all bold already); words after a block of it a paragraph; the
//                                    node's form noted once a flowchart
//   a flowchart's step holding nothing, or its icon alone (<li></li>)
//                                  → a node of an empty title: <li><p></p></li>, the paragraph after
//                                    its icon (rule "step title" too)
//   <div>\[ … \]</div> (no class)  → div.doc-math-block, as a paragraph of one
//   loose words in a container of no class of its own (main, a section, a div, an article, an aside,
//   a quote, a disclosure's content, the kit's flows) that holds blocks too, or in a box of the kit's
//   that always holds a block (`holdsOne`: a highlight block, a callout, a disclosure's content: a
//   callout written the old way, its words straight in it) whether it holds blocks or not: each run of words and
//   inline elements between its blocks a <p> (a run of one display formula a formula block; a
//   comment or a control amid the words in it, as they are one line; one with an inline element
//   holding a block as written)
//   in a text block (a paragraph, a heading, an item, a cell…):
//   mark → span.doc-highlight-yellow; del, strike → s; ins → u; kbd, samp, tt, var → code;
//   small → span.doc-text-gray; q → “ ”; span with only a style → the kit's color classes, strong,
//   em, u, s (what the style says) or its words, when every declaration of the style is one of those
//   (a color the nearest of the kit's, noted when it is not one of them), else as written; a span
//   or a font with nothing, or an abbr, cite, dfn, time, bdi or data with no attribute but a title,
//   datetime or value → its words (what those said noted: the Agent writes it in the text)
// Left alone: what is the kit's already, code (pre, code, kbd…), scripts, styles and drawings, a
// chart's host and the kit's cards, controls and code blocks, and everything inside an element with
// a class of the report's own that is no text block (a whole block, 整体块: its tags are its layout
// and its styles), and the own region of an instance of a component package, which every walk below
// passes by, what it holds staying byte for byte (isInstance), going on in its slots (instanceSlots:
// what they hold is the document's, made the kit's as in any flow, the slot's tag the component's). A text block with a class of its own (p.lead) is a text block still, and so is
// one of the kit's elements with a class of the report's own beside the kit's: a section, a panel,
// columns, a disclosure, a card (section.doc-section.appendix) stays the kit's element, as the
// editor finds it (units.mjs, blocks.mjs), its inside the kit's.

const SKIPPED = new Set(["script", "style", "template", "textarea", "noscript", "code", "svg", "math", "select", "option", "button", "iframe", "video", "audio", "canvas", "object", "picture"]);
// The kit's parts whose inside is theirs.
const KIT_OWN = ["doc-figure", "doc-code", "doc-diff", "doc-math-inline", "doc-math-block", "doc-link-mention", "doc-sheet-tabs",
  "doc-state-fields", "doc-filter-row", "doc-image", "doc-file", "doc-bookmark", "doc-embed", "doc-icon", "doc-title", "doc-table-meta"];
const TEXT_BLOCKS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "li", "td", "th", "dt", "dd", "blockquote", "figcaption", "caption", "summary"]);
const FLOW_PARENTS = new Set(["main", "section", "div", "article", "aside", "blockquote", "li", "details", "dialog"]);
const KIT_COLORS = new Set(COLORS.map(({ name }) => name));

const classesOf = (node) => (attr(node, "class") ?? "").split(/\s+/).filter(Boolean);
// An element of no class but the kit's block colors (components/colors.mjs).
const colorsOnly = (node) => classesOf(node).every((name) => BLOCK_COLORS.includes(name));
// The block colors that are a fill (doc-highlight-<color>), the one family a code block takes.
const FILLS = BLOCK_COLORS.filter((name) => name.startsWith("doc-highlight-"));
const ownClass = (node) => classesOf(node).some((name) => !kitNamespace(name));
const isText = (node) => node.nodeName === "#text";
// Text with no word in it: blanks, and the characters that take no room (a zero-width space, a
// joiner, a byte-order mark), which a paragraph of their own would show as an empty line.
const WORDLESS = /^[\s\u200b-\u200d\u2060\ufeff]*$/;
const blankText = (node) => isText(node) && WORDLESS.test(node.value);
const elements = (node) => (node.childNodes ?? []).filter((child) => child.tagName);
const attributes = (node) => (node.attrs ?? []).map((entry) => entry.name);
// Only these attributes (or none).
const only = (node, names) => attributes(node).every((name) => names.includes(name));

// The kit's elements, by what the editor's scanner finds them by (units.mjs boxKind, unitKind and
// isComponent; blocks.mjs): a component (a code block, a table's frame…), a container by
// its class (a panel, the summary, a callout, columns and a column, a disclosure's or a dialog's content), a
// unit kind told by its class (a media block, a Sheet area…), a section, a disclosure, a dialog, a
// Sheet area or a table of the kit's, and the parts whose inside is the kit's (KIT_OWN). One of them
// with a class of the report's own beside the kit's stays the kit's element: never a whole block.
const KIT_MATCHES = [SECTION.match, DETAILS.match, DIALOG.match, SHEETS.match, "table.doc-table"].join(", ");
function kitElement(node) {
  const classes = classesOf(node);
  return classes.some((name) => KIT_OWN.includes(name)) || isComponent(node) || matchesNode(node, KIT_MATCHES)
    || BOX_CLASSES.some(([name]) => classes.includes(name))
    || UNIT_KINDS.some((rule) => rule.class && classes.includes(rule.class) && (!rule.tag || [rule.tag].flat().includes(node.tagName)));
}
// Whether a <figure> stands around `node` (in main): a card's drawing it is part of.
const inFigure = (node) => {
  for (let up = node.parentNode; up?.tagName && up.tagName !== "main"; up = up.parentNode) if (up.tagName === "figure") return true;
  return false;
};
// A table's parts: never a block of their own (a row of the report's own class is the table's row).
const TABLE_PARTS = new Set(["thead", "tbody", "tfoot", "tr", "colgroup", "col"]);
// A whole block (整体块): an element with a class of the report's own that is no text block, no part
// of a table, no figure (a card: block() adds the kit's class) and none of the kit's elements. Its
// tags are its layout and its styles: nothing in it is touched.
const wholeBlock = (node) => ownClass(node) && node.tagName !== "figure" && !TEXT_BLOCKS.has(node.tagName) && !TABLE_PARTS.has(node.tagName) && !kitElement(node);
// The whole blocks the editor takes as blocks (units.mjs: a block-level element that is no page
// furniture, form or part of another): those writingNotes names.
const BLOCK_UNITS = new Set([...BLOCK_LEVEL].filter((tag) => !["header", "main", "dialog", "form", "fieldset", "caption", "dd", "dt", "figcaption", "summary", "li", "td", "th", ...TABLE_PARTS].includes(tag)));

const INLINE_FORMULA = /\\\(([\s\S]*?)\\\)/g;
// A display formula that is all of a text (a paragraph's, a div's, a run's), as written (entities
// and all): one, its TeX alone (components/math texSource: what the editor edits as a formula).
const oneDisplayFormula = (raw) => texSource(raw) && /\S/.test(raw);
// A display formula that would be all of a text but for a bare < or > in its TeX (texSource refuses
// either: in a<b the "<" opens a tag): the text from where it starts (`raw`, as written, to its end
// tag; `closed` false when the parser found none, a<b having opened one, so that the formula alone is
// read, from its start to its close). What readOnlyTexts tells apart from a formula among words.
function angledFormula(raw, closed = true) {
  const formula = closed ? raw : /^\s*(?:\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$)/.exec(raw)?.[0] ?? "";
  return /[<>]/.test(formula) && oneDisplayFormula(formula.replace(/</g, "\\lt ").replace(/>/g, "\\gt "));
}

// The elements a run of words may hold that have no end tag.
const VOID = new Set(["br", "wbr", "img", "input"]);
// Where a container's loose words stop: a block, what is no text (a script, a style…).
const STOPS = new Set([...BLOCK_LEVEL, "script", "style", "template", "noscript", "link", "meta"]);
// A control: amid words it stays on their line, in their paragraph (read-only then, as readOnlyTexts
// says: the preview edits no control); controls alone are no paragraph.
const CONTROLS = new Set(["input", "select", "textarea", "button", "label", "option"]);
// The elements that close a paragraph left open (the HTML parser's rule): one of them inside a run's
// inline element (a link around a card, a span around a paragraph) would have the browser close the
// paragraph made of the run there and draw the rest otherwise than written.
const CLOSES_P = new Set([...BLOCK_LEVEL, "hgroup", "search", "center", "dir", "listing", "xmp", "plaintext"]);
const holdsBlock = (node) => elements(node).some((child) => CLOSES_P.has(child.tagName) || holdsBlock(child));
// The containers whose loose words become paragraphs: class-less (main, a section, a div, an
// article, an aside, a quote) or one of the kit's flows (a section, a panel, the summary, a column,
// a disclosure's or a dialog's content, a Sheet panel) with no class of the report's own.
const LOOSE_HOLDERS = new Set(["main", "section", "div", "article", "aside", "blockquote"]);
const FLOW_SELECTOR = FLOWS.join(", ");
const looseHolder = (node) => (LOOSE_HOLDERS.has(node.tagName) && !ownClass(node) && (classesOf(node).length === 0 || matchesNode(node, FLOW_SELECTOR))) || isSlot(node); // a slot is a flow whatever class its component gives it
// Words in it (a text's, or an element's text).
const hasWords = (node) => isText(node) ? !WORDLESS.test(node.value) : (node.childNodes ?? []).some(hasWords);
// The kit's boxes that always hold a block (`holdsOne`: a highlight block, a callout, a disclosure's
// content), by their classes: words straight in one are a paragraph whether it holds blocks or not,
// as a box of words alone is none the page edits (a callout written the old way, its words straight
// in it, which the kit showed as one text block); not one with a class of the report's own, which
// no loose words are taken out of (looseHolder).
const HOLDS_BLOCKS = BOX_CLASSES.filter(([, kind]) => HOLDS_ONE.has(kind)).map(([name]) => name);
const holdsOneBlock = (node) => looseHolder(node) && classesOf(node).some((name) => HOLDS_BLOCKS.includes(name));
// Whether a container holds both blocks and words straight in it (not in a block of their own).
const looseWords = (node) => node.childNodes.some((child) => isText(child) && !WORDLESS.test(child.value)) && elements(node).some((child) => BLOCK_LEVEL.has(child.tagName));
const HTML_SPACE = /^[ \t\n\r\f]*/;

// The runs of loose words among `nodes` (a container's children): text, inline elements, controls
// and comments between its blocks (a block, or what is no text, ending one), the comments and blanks
// at either end left out (a comment amid the words stays in their paragraph, read-only then: the
// words are one line on the page); only those with words in them outside a control.
function runsOf(nodes) {
  const runs = [];
  let run = [];
  for (const node of nodes) {
    if (node.tagName && STOPS.has(node.tagName)) {
      runs.push(run);
      run = [];
    } else run.push(node);
  }
  runs.push(run);
  const edge = (node) => !node.tagName && !hasWords(node); // a comment, or text of no words
  const spoken = (node) => (isText(node) || (node.tagName && !CONTROLS.has(node.tagName))) && hasWords(node);
  return runs.map((each) => {
    const first = each.findIndex((node) => !edge(node));
    return first < 0 ? [] : each.slice(first, each.findLastIndex((node) => !edge(node)) + 1);
  }).filter((each) => each.some(spoken));
}

// The selectors of the report's own <style> elements (with their at-rules' conditions), their comments left out.
function ownSelectors(document) {
  const found = [];
  const visit = (node) => {
    for (const child of node.childNodes ?? []) {
      if (child.tagName === "style") found.push(child.childNodes.map((text) => text.value ?? "").join(""));
      else if (child.tagName && child.tagName !== "template") visit(child);
    }
  };
  visit(document);
  return found.flatMap((css) => [...css.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, " ").matchAll(/([^{};]*)\{/g)].map(([, selector]) => selector));
}
// Whether one of `selectors` (ownSelectors) names one of `tags` by its type (an aside, a th: not a
// class or an id of that name), or one of `classes`.
const styles = (selectors, { tags = [], classes = [] }) => {
  const names = [...tags.map((tag) => `(?<![\\w.#-])${tag}`), ...classes.map((name) => `\\.${name}`)];
  const pattern = names.length ? new RegExp(`(?:${names.join("|")})(?![\\w-])`, "i") : null;
  return Boolean(pattern) && selectors.some((selector) => pattern.test(selector));
};

// The text of the report's own scripts written in the page (what one loaded from a file does is not to be read).
function ownScripts(document) {
  const found = [];
  const visit = (node) => {
    for (const child of node.childNodes ?? []) {
      if (child.tagName === "script") found.push(child.childNodes.map((text) => text.value ?? "").join(""));
      else if (child.tagName && child.tagName !== "template") visit(child);
    }
  };
  visit(document);
  return found.join("\n");
}

// The class-name tokens a GFM task list (markdown-it, GitHub, marked) puts on the list, its items
// and their boxes.
const GFM_LIST = ["contains-task-list", "task-list-item"];
const GFM_ITEM = ["task-list-item"];
const GFM_BOX = ["task-list-item-checkbox"];
const within = (node, names) => classesOf(node).every((name) => names.includes(name));
// An item's box: its first element, nothing but blanks before it, an <input type="checkbox"> with
// only a type, checked, disabled and the GFM class. Else null.
function taskBox(item) {
  const first = item.childNodes.find((child) => !blankText(child));
  return first?.tagName === "input" && only(first, ["type", "checked", "disabled", "class"]) && attr(first, "type")?.toLowerCase() === "checkbox"
    && within(first, GFM_BOX) && first.sourceCodeLocation?.startTag ? first : null;
}
// A GFM task item: GFM's class at most, no checked state of the kit's yet, starting with its box.
const taskItem = (item) => item.tagName === "li" && within(item, GFM_ITEM) && attr(item, CHECKED) === undefined && item.sourceCodeLocation?.startTag && taskBox(item);
// A GFM task list: a ul of no class but GFM's, holding items alone, each a task item.
const taskList = (node) => node.tagName === "ul" && within(node, GFM_LIST) && elements(node).length > 0
  && node.childNodes.every((child) => child.tagName === "li" || blankText(child))
  && elements(node).every(taskItem);
// What of a report says a GFM task list is the report's own as written: its <style> styling GFM's
// classes, or a script of its own reading checkboxes or those classes (the boxes would be gone).
const GFM_STYLED = { classes: [...new Set([...GFM_LIST, ...GFM_ITEM, ...GFM_BOX])] };
const GFM_SCRIPTED = /checkbox|task-list/i;

// A list marked to be drawn as a flowchart: <ol data-doc-chart="flow"> (as a chart is asked for), or
// <ol data-flow> on a list no chart is asked of.
const flowMarked = (node) => node.tagName === "ol" && (attr(node, "data-doc-chart") === "flow" || (attr(node, "data-flow") !== undefined && attr(node, "data-doc-chart") === undefined));
// A flowchart the kit draws (ol.doc-flow, or one marked to be: no class of the report's own), and a step of one.
const flowchart = (node) => node?.tagName === "ol" && !ownClass(node) && (classesOf(node).includes(FLOW) || flowMarked(node));
const flowStep = (node) => node.tagName === "li" && flowchart(node.parentNode);
const ICON = "doc-icon"; // a node's icon (components/icon/), first in it
// Words all bold already: <strong> or <b> elements, blanks between them at most.
const allBold = (run) => run.some((node) => node.tagName === "strong" || node.tagName === "b")
  && run.every((node) => node.tagName === "strong" || node.tagName === "b" || (isText(node) && WORDLESS.test(node.value)) || node.nodeName === "#comment");

// A text color that leaves the words as the block has them (none, which CSS ignores, is one).
const SAME_TEXT = /^(?:inherit|unset|currentcolor|none)$/i;
// A background that is none of its own, the block's showing through.
const NO_BACKGROUND = /^(?:inherit|initial|unset|revert|revert-layer|transparent|none)$/i;

// One line of what an attribute or a style said, for a note: its spaces and line breaks one space.
const oneLine = (value) => value.replace(/\s+/g, " ").trim();
// The sizes a table's frame takes in its style (sizes.css), read there and not on the table.
const FRAME_SIZES = /^\s*--doc-(?:table-height|span)\s*:/i;

// A paragraph's or a heading's text-align in its style (centred or at the right: the kit's classes, components/align.mjs).
const ALIGN_TAGS = /^(?:p|h[1-4])$/;
const ALIGN_VALUE = /^(center|right)$/i;

// A style's declarations: split at the semicolons outside quotes and parentheses (a url() may
// hold one), its comments left out.
function declarationsOf(style) {
  const text = style.replace(/\/\*[\s\S]*?(?:\*\/|$)/g, " ");
  const found = [];
  let quote = "";
  let depth = 0;
  let from = 0;
  for (let index = 0; index <= text.length; index++) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index++;
      else if (char === quote) quote = "";
    } else if (char === '"' || char === "'") quote = char;
    else if (char === "(") depth++;
    else if (char === ")") depth = Math.max(0, depth - 1);
    else if ((char === ";" && depth === 0) || index === text.length) {
      found.push(text.slice(from, index));
      from = index + 1;
    }
  }
  return found.filter((declaration) => declaration.trim());
}

/**
 * What a style says, as the kit writes it: { open, close, notes } (the opening tags, the closing
 * ones, a note for each color written as a kit color it is not exactly, or left out), or
 * { foreign: [property…] } when some declaration is none the kit has a format for, and the element
 * is to stay as written. The kit's formats: color and background (the nine colors, the nearest as a
 * paste takes them: clipboard/import/colors.mjs), bold, italic, underline and line-through. A text
 * color that hides the words (transparent, no alpha) or puts back the browser's own (initial,
 * revert) is none of them.
 */
function styled(style) {
  const declarations = new Map(); // the last one of a property wins, as in CSS
  for (const declaration of declarationsOf(style)) {
    const colon = declaration.indexOf(":");
    const name = oneLine(colon < 0 ? declaration : declaration.slice(0, colon)).toLowerCase();
    declarations.set(name === "background-color" ? "background" : name, colon < 0 ? "" : oneLine(declaration.slice(colon + 1).replace(/!\s*important\s*$/i, "")));
  }
  const foreign = [];
  const notes = [];
  let text;
  let background;
  const formats = new Set();
  // A color (`property`: color or background) as one of the kit's, by `kind` (textColor or
  // backgroundColor), noted when it is not exactly that one; one that is no color is foreign.
  const color = (property, value, kind) => {
    if ((property === "color" ? SAME_TEXT : NO_BACKGROUND).test(value)) return undefined;
    const parsed = parseColor(value);
    if (!parsed || (parsed.a === 0 && property === "color")) {
      foreign.push(property);
      return undefined;
    }
    if (parsed.a === 0) return undefined;
    const near = kind(value, { nearest: true })?.replace(/_background$/, "");
    if (!near || !KIT_COLORS.has(near)) {
      notes.push(`${property} ${value} left out: the ${property === "color" ? "text's" : "page's"} own is the nearest`);
      return undefined;
    }
    if (kind(value)?.replace(/_background$/, "") !== near) notes.push(`${property} ${value} written as the kit's ${near}${property === "color" ? "" : " highlight"}`);
    return near;
  };
  for (const [property, value] of declarations) {
    if (property === "color") text = color(property, value, textColor);
    else if (property === "background") background = color(property, value, backgroundColor);
    else if (property === "font-weight" && /^(?:bold|bolder|[6-9]\d\d)$/i.test(value)) formats.add("strong");
    else if (property === "font-style" && /^(?:italic|oblique)\b/i.test(value)) formats.add("em");
    else if ((property === "text-decoration" || property === "text-decoration-line") && /^(?:(?:underline|line-through|solid)\s*)+$/i.test(value) && /underline|line-through/i.test(value)) {
      if (/underline/i.test(value)) formats.add("u");
      if (/line-through/i.test(value)) formats.add("s");
    } else foreign.push(property);
  }
  if (foreign.length) return { foreign: [...new Set(foreign)] };
  const opens = [];
  if (text) opens.push([`<span class="doc-text-${text}">`, "</span>"]);
  if (background) opens.push([`<span class="doc-highlight-${background}">`, "</span>"]);
  for (const tag of ["strong", "em", "u", "s"]) if (formats.has(tag)) opens.push([`<${tag}>`, `</${tag}>`]);
  return { open: opens.map(([open]) => open).join(""), close: opens.map(([, close]) => close).reverse().join(""), notes };
}

// A code's language as a class names it (language-x, lang-x): on the kit's block, data-language.
const LANGUAGE_CLASS = /^(?:language|lang)-([\w#+.-]+)$/;
// What a pre and its code carry that goes on the kit's block: the language, the block id, the id.
const BLOCK_ATTRIBUTES = new Set(["data-language", "data-lang", "data-block-id"]);
// What else a pre, its code or its figure may carry that is its code block's own, which the kit and
// the editor read on the block alone: the attribute the block takes (`name`), as written (`names`:
// Prism's data-start numbers a first line too), the value it writes there of one (`value`: null
// when one says none) and what one says (`says`), for a note when one says none.
const CODE_OWN = [
  { name: LINE_START, names: [LINE_START, "data-start"], value: (value) => lineStart(value)?.toString() ?? null, says: "the number of its first line is a whole number from 1" },
  { name: "data-line-numbers", names: ["data-line-numbers"], value: (value) => (/^\s*(?:true|false)\s*$/i.test(value) ? value.trim().toLowerCase() : null), says: "false hides its line numbers, true shows them" },
  { name: FOLDED_LINES, names: [FOLDED_LINES], value: (value) => (validFolded(oneLine(value)) ? oneLine(value) : null), says: "its folded lines are their numbers from 1, spaces between" },
];
// What names a code's file in its title, written on its pre (or its code, or its figure).
const TITLE_ATTRIBUTE = "data-title";
// Whether a code's long lines wrap, written beside data-line-numbers: "false" keeps each on one line
// (the block's NOWRAP class: they scroll, as a directory tree's or a log's are read), "true" wraps
// them, as the block does anyway.
const WRAP_ATTRIBUTE = "data-wrap";

// A pre's one code element (blank text around it at most), or null.
const codeOf = (pre) => elements(pre).length === 1 && elements(pre)[0].tagName === "code" && pre.childNodes.every((child) => child.tagName || blankText(child)) ? elements(pre)[0] : null;
// The inline tags a code's caption may hold around its words, which its title (plain text) leaves out.
const TITLE_TAGS = new Set(["a", "abbr", "b", "bdi", "bdo", "cite", "code", "data", "del", "dfn", "em", "font", "i", "ins", "kbd", "mark", "q", "s",
  "samp", "small", "span", "strike", "strong", "sub", "sup", "time", "tt", "u", "var", "br", "wbr"]);
// Those that say their words are code, which a code block's title is anyway: left out unsaid when
// they carry nothing else (a path written <code>src/x.js</code>).
const CODE_TAGS = new Set(["code", "kbd", "samp", "tt", "var"]);
// What in a caption a code block's title cannot take, or "" when it is words alone: its text and the
// inline tags of TITLE_TAGS, each closed in the file (no comment, no picture, no block).
function captionFault(node) {
  for (const child of node.childNodes) {
    if (isText(child)) continue;
    if (!child.tagName) return "a comment in its <figcaption>";
    if (["img", "picture", "svg"].includes(child.tagName)) return "a picture in its <figcaption>";
    if (!TITLE_TAGS.has(child.tagName)) return `a <${child.tagName}> in its <figcaption>`;
    if (!child.sourceCodeLocation?.startTag || !(child.sourceCodeLocation.endTag || VOID.has(child.tagName))) return `a <${child.tagName}> not closed in its <figcaption>`;
    const inside = captionFault(child);
    if (inside) return inside;
  }
  return "";
}
// A figure holding a pre (straight in it), as a code block takes it: a code figure, a <figure> of no
// class holding the pre and at most one <figcaption> of words its title takes (before the pre or
// after it), blanks between them, is { pre, caption }; another is { pre, caption, why }, `why` what
// keeps it from being one. Null for a figure holding no pre.
function codeFigure(node) {
  const children = elements(node);
  const pres = children.filter((child) => child.tagName === "pre");
  const captions = children.filter((child) => child.tagName === "figcaption");
  if (!pres.length) return null;
  const [pre] = pres;
  const [caption = null] = captions;
  const loose = node.childNodes.find((child) => !child.tagName && !blankText(child));
  const why = pres.length > 1 || captions.length > 1 || children.length > pres.length + captions.length ? "more than the pre and one <figcaption> in its <figure>"
    : loose ? (isText(loose) ? "words in its <figure> outside its caption" : "a comment in its <figure>")
    : !caption ? ""
    : attributes(caption).length ? `its <figcaption> has an attribute of its own (${attributes(caption).join(", ")})`
    : !caption.sourceCodeLocation?.endTag ? "its <figcaption> is not closed in the file"
    : captionFault(caption);
  return why ? { pre, caption, why } : { pre, caption };
}

// What the attributes of an inline tag that goes said (an abbreviation's full name, a date), a
// change's note each: the Agent writes it in the text when the reader needs it. None when they said nothing.
function droppedNotes(node) {
  const said = (node.attrs ?? []).filter(({ value }) => value.trim());
  const name = node.tagName === "abbr";
  return said.map((entry) => `${entry.name} ${JSON.stringify(oneLine(entry.value))} dropped: ${name && entry.name === "title" ? "write the full name in the text" : "write it in the text if the reader needs it"}`);
}

const escapeAttribute = (value) => value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");

// The keys a report's tables and the charts drawn from them and views of them carry (data-doc-chart-source, -data, data-doc-from).
function chartKeys(document) {
  const found = new Set();
  const visit = (node) => {
    for (const child of node.childNodes ?? []) {
      if (!child.tagName) continue;
      for (const name of [CHART_SOURCE, ...TABLE_READERS]) if (attr(child, name) !== undefined) found.add(attr(child, name));
      visit(child.tagName === "template" ? child.content : child);
    }
  };
  visit(document);
  return found;
}

// The ids a report's elements carry, each with how many carry it.
function idCounts(document) {
  const counts = new Map();
  const visit = (node) => {
    for (const child of node.childNodes ?? []) {
      if (!child.tagName) continue;
      const id = attr(child, "id");
      if (id !== undefined) counts.set(id, (counts.get(id) ?? 0) + 1);
      visit(child.tagName === "template" ? child.content : child);
    }
  };
  visit(document);
  return counts;
}

const DIALOG_ID = /^[A-Za-z][\w-]{0,63}$/;

/**
 * Report `written` with its natural HTML made the kit's: { text, changes: [{ line, rule, note?, key? }] },
 * each change at its line in `written` (the rules add no line, so the result's too), `note` saying
 * one thing it dropped, wrote near (the nearest kit color) or kept where the kit's markup has no
 * place of its own for it, a change for each; a chart's `key` the one its card and table share.
 * The format's old names are made new first (shared/new-names.mjs newNames: report-* classes,
 * data-report-*, --report-*, Report* in its own style and script), silently: no change says it, and
 * `text` differs from `written` by them alone when nothing in it is natural. So does a detail card
 * of the kit's older form, with a header (headedCard).
 */
export function naturalize(written) {
  const source = newNames(written);
  const document = parse(source, { sourceCodeLocationInfo: true });
  const main = findMain(document);
  if (!main) return { text: source, changes: [] };
  const splices = [];
  const changes = [];
  const lineAt = (offset) => source.slice(0, offset).split("\n").length;
  // `extra`: what else a change says (a chart's key).
  const change = (node, rule, notes = [], extra = {}) => {
    const line = lineAt(node.sourceCodeLocation.startOffset);
    if (!notes.length) changes.push({ line, rule, ...extra });
    for (const note of notes) changes.push({ line, rule, note, ...extra });
  };
  // A splice. Text put in at one place goes in the order asked for, but for tags that open an element
  // (`opens`: where it ends) or close one (`closes`: where it began): closing ones first, the
  // innermost first (the one begun last), then opening ones, the outermost first (the one ending
  // last), so a paragraph made of a run of words closes inside a disclosure's content and after a
  // formula's span it holds, and opens after a table's frame closes.
  // `move` ({ from, to }): the source's text there goes with the splice (a caption's words into a
  // chart's card), whose text is then a function of it as the splices inside it make it; another
  // splice takes it away from where it was (`leaves`, when that is all it takes).
  let order = 0;
  const splice = (start, end, text, { opens = null, closes = null, move = null, leaves = false } = {}) => splices.push({ start, end, text, order: order++, opens, closes, move, leaves });
  // An element put around source `from`…`to`.
  const around = (from, to, open, close) => {
    splice(from, from, open, { opens: to });
    splice(to, to, close, { closes: from });
  };
  // An element the parser implied (a <tbody> nobody wrote) has no place in the file: no rule touches it.
  const start = (node) => node.sourceCodeLocation?.startTag;
  const end = (node) => node.sourceCodeLocation?.endTag;
  // A start tag's class with `names` added after its own (the editor's classList.add) and `drop`
  // taken out, the tag otherwise as written: its class attribute written again where it stands (or
  // taken out with the blank before it, left with no class), or one put in after the tag's name.
  const addClasses = (node, names, { drop = [] } = {}) => {
    const kept = classesOf(node).filter((name) => !drop.includes(name));
    const value = [...kept, ...names.filter((name) => !kept.includes(name))];
    const at = node.sourceCodeLocation.attrs?.class;
    if (value.join(" ") === classesOf(node).join(" ")) return;
    if (at && value.length) splice(at.startOffset, at.endOffset, `class="${escapeAttribute(value.join(" "))}"`);
    else if (at) dropAttribute(node, "class");
    else {
      const after = start(node).startOffset + 1 + node.tagName.length;
      splice(after, after, ` class="${escapeAttribute(value.join(" "))}"`);
    }
  };
  // An attribute taken out of a start tag, with the blanks before it.
  const dropAttribute = (node, name) => {
    const at = node.sourceCodeLocation.attrs[name];
    let from = at.startOffset;
    while (/[ \t\n\r\f]/.test(source[from - 1] ?? "")) from--;
    splice(from, at.endOffset, "");
  };
  // A start tag written again as `tag`, with its attributes but `drop` and with `classes` first in its class.
  const retag = (node, tag, { classes = [], drop = [] } = {}) => {
    const location = node.sourceCodeLocation;
    const kept = Object.entries(location.attrs ?? {}).filter(([name]) => name !== "class" && !drop.includes(name))
      .map(([, at]) => ` ${source.slice(at.startOffset, at.endOffset)}`).join("");
    const names = [...classes, ...classesOf(node).filter((name) => !classes.includes(name))];
    return `<${tag}${names.length ? ` class="${escapeAttribute(names.join(" "))}"` : ""}${kept}>`;
  };
  // What the report's own styles and scripts say of its elements, read once when a rule asks.
  let selectors;
  const reportStyles = (what) => styles(selectors ??= ownSelectors(document), what);
  let scripts;
  const reportScripts = (pattern) => pattern.test(scripts ??= ownScripts(document));
  const rewrap = (node, open, close) => {
    splice(start(node).startOffset, start(node).endOffset, open);
    if (end(node)) splice(end(node).startOffset, end(node).endOffset, close);
  };
  const unwrap = (node) => rewrap(node, "", "");
  const complete = (node) => Boolean(start(node) && (end(node) || node.tagName === "img"));
  // A detail card written the short way: <dialog id="x"> of no class and no other attribute, holding
  // words or starting with a block, with no form of the report's own in it, its id one a card may
  // take (dialog/file.mjs) and no other element's.
  let ids;
  const shortDialog = (node) => {
    const id = attr(node, "id");
    if (node.tagName !== "dialog" || !only(node, ["id"]) || !DIALOG_ID.test(id ?? "") || !complete(node)) return false;
    const held = elements(node);
    const opens = held.length ? BLOCK_UNITS.has(held[0].tagName) && complete(held[0]) : node.childNodes.some((child) => !blankText(child) && child.nodeName !== "#comment");
    if (!opens || held.some((child) => child.tagName === "form")) return false;
    ids ??= idCounts(document);
    return ids.get(id) === 1;
  };
  // What such a card goes by: a plain <h2> or <h3> first in it (only blanks before it), or null.
  const shortHeading = (node) => {
    const first = elements(node)[0];
    if (!matchesNode(first, DIALOG.short) || attributes(first).length) return null;
    return node.childNodes.slice(0, node.childNodes.indexOf(first)).every(blankText) ? first : null;
  };
  const isCard = (node) => node.tagName === "dialog" && (classesOf(node).includes("doc-dialog") || shortDialog(node));
  // The detail cards outside main, whole, in the file's order (a main of no end tag has no end to go to).
  const strayCards = (node, found = []) => {
    for (const child of node.childNodes ?? []) {
      if (child === main) continue;
      if (isInstance(child)) {
        instanceSlots(child).forEach((slot) => strayCards(slot, found));
        continue;
      }
      if (isCard(child) && complete(child)) found.push(child);
      else strayCards(child, found);
    }
    return found;
  };
  const strays = end(main) ? strayCards(document) : [];
  // Whether `href` (#id) is a link to a detail card of the report: the kit's or one written the short way.
  let dialogs;
  const dialogLinked = (href) => {
    dialogs ??= new Set((function collect(node, found = []) {
      for (const child of node.childNodes ?? []) {
        if (!child.tagName) continue;
        if (isInstance(child)) {
          instanceSlots(child).forEach((slot) => collect(slot, found));
          continue;
        }
        if (isCard(child)) found.push(attr(child, "id"));
        collect(child, found);
      }
      return found;
    })({ childNodes: [main, ...strays] }));
    return /^#./.test(href ?? "") && dialogs.has(href.slice(1));
  };

  // A detail card of the kit's older form: a panel of a header and the content region, the header
  // holding its title and at most a close button, nothing else in either but blanks and comments.
  // Its parts, or null: a card of any other shape stays as written, and the checks say so (GONE).
  const headedCard = (dialog) => {
    const [panel, ...others] = elements(dialog);
    if (!panel || others.length || !classesOf(panel).includes("doc-dialog-panel")) return null;
    const [header, content, ...more] = elements(panel);
    if (more.length || !header || !content || !classesOf(header).includes(HEADED.header) || !classesOf(content).includes("doc-dialog-content")) return null;
    const loose = (node) => node.childNodes.some((child) => !child.tagName && !blankText(child) && child.nodeName !== "#comment");
    if (loose(panel) || loose(header) || !complete(header) || !start(content)) return null;
    const parts = elements(header);
    const title = parts.filter((child) => classesOf(child).includes(HEADED.title));
    const closes = parts.filter((child) => !title.includes(child));
    const closing = (child) => (classesOf(child).includes(HEADED.close) || attr(child, HEADED.closeAttribute) !== undefined) && complete(child);
    if (title.length !== 1 || !complete(title[0]) || closes.length > 1 || !closes.every(closing)) return null;
    return { header, title: title[0], close: closes[0] ?? null, content };
  };
  // Where the file can name an id: its attributes' values, scripts and styles, read once when a card asks.
  let naming;
  const namingIn = (node, found = []) => {
    for (const child of node.childNodes ?? []) {
      if (!child.tagName) continue;
      for (const { name, value } of child.attrs) if (name !== "id" && name !== "class") found.push(value);
      if (child.tagName === "script" || child.tagName === "style") found.push(child.childNodes.map((text) => text.value ?? "").join(""));
      namingIn(child, found);
    }
    return found;
  };
  // Whether the file names `id` but for the card that points to its title with it (`labelled`).
  const namedElsewhere = (id, labelled) => {
    naming ??= namingIn(document).join("\n");
    let times = 0;
    for (let at = naming.indexOf(id); at >= 0; at = naming.indexOf(id, at + id.length)) {
      if (!/[\w-]/.test(naming[at - 1] ?? "") && !/[\w-]/.test(naming[at + id.length] ?? "")) times++;
    }
    return times > (labelled ? 1 : 0);
  };
  // Such a card as dialog/file.mjs writes one, in place: the content region's start tag where the
  // header began, the title a plain h3 first in it (its id gone when nothing else names it), the
  // rest of the header gone, so that no line moves. Silent, as newNames: what it says is what it said.
  function unheaded(dialog) {
    const card = headedCard(dialog);
    if (!card) return;
    const { header, title, close, content } = card;
    const id = attr(title, "id");
    const labelled = Boolean(id) && attr(dialog, "aria-labelledby")?.trim() === id;
    if (labelled) dropAttribute(dialog, "aria-labelledby");
    splice(start(header).startOffset, start(header).endOffset, source.slice(start(content).startOffset, start(content).endOffset));
    const name = start(title).startOffset + 1;
    splice(name, name + title.tagName.length, "h3");
    addClasses(title, [], { drop: [HEADED.title] });
    if (id !== undefined && !(id && namedElsewhere(id, labelled))) dropAttribute(title, "id");
    splice(end(title).startOffset, end(title).endOffset, "</h3>");
    if (close) splice(close.sourceCodeLocation.startOffset, close.sourceCodeLocation.endOffset, "");
    splice(end(header).startOffset, end(header).endOffset, "");
    splice(start(content).startOffset, start(content).endOffset, "");
  }
  const headedCards = (node) => {
    for (const child of node.childNodes ?? []) {
      if (isInstance(child)) {
        instanceSlots(child).forEach(headedCards);
        continue;
      }
      if (child.tagName && matchesNode(child, DIALOG.match)) unheaded(child);
      headedCards(child);
    }
  };

  // ---------- inline ----------
  const formats = new Set(); // the elements the rule below took: a format of the kit's, or their words
  function inline(node) {
    const tag = node.tagName;
    if (!complete(node)) return false;
    let notes = [];
    if (tag === "mark" && only(node, [])) {
      rewrap(node, '<span class="doc-highlight-yellow">', "</span>");
    } else if ((tag === "del" || tag === "strike") && only(node, ["cite", "datetime"])) {
      rewrap(node, "<s>", "</s>");
      notes = droppedNotes(node);
    } else if (tag === "ins" && only(node, ["cite", "datetime"])) {
      rewrap(node, "<u>", "</u>");
      notes = droppedNotes(node);
    } else if (["kbd", "samp", "tt", "var"].includes(tag) && only(node, [])) {
      rewrap(node, "<code>", "</code>");
      formats.add(node);
      change(node, tag);
      return true; // its words are code: nothing in them changes
    } else if (tag === "a" && only(node, ["href"]) && dialogLinked(attr(node, "href"))) {
      addClasses(node, [DIALOG_TRIGGER]);
      change(node, "dialog link");
      return false; // its words go on
    } else if (tag === "small" && only(node, [])) rewrap(node, '<span class="doc-text-gray">', "</span>");
    else if (tag === "q" && only(node, ["cite"])) {
      rewrap(node, "“", "”");
      notes = droppedNotes(node);
    } else if (["abbr", "cite", "dfn", "time", "bdi", "data"].includes(tag) && only(node, ["title", "datetime", "value"])) {
      unwrap(node);
      notes = droppedNotes(node);
    } else if ((tag === "span" && only(node, [])) || (tag === "font" && only(node, ["color"]) && !attr(node, "color")?.trim())) unwrap(node);
    else if ((tag === "span" && only(node, ["style"])) || (tag === "font" && only(node, ["color"]))) {
      // A style the kit has formats for, every declaration of it; else the span stays as written
      // (its text read-only in the preview, as readOnlyTexts says).
      const style = styled(tag === "span" ? attr(node, "style") ?? "" : `color: ${attr(node, "color")}`);
      if (style.foreign) return false;
      rewrap(node, style.open, style.close);
      notes = style.notes;
    } else return false;
    formats.add(node);
    change(node, tag, notes);
    return false;
  }

  // Bare inline formulas in a text node: each in the kit's span.
  function formulas(node) {
    const { startOffset, endOffset } = node.sourceCodeLocation;
    const raw = source.slice(startOffset, endOffset);
    for (const match of raw.matchAll(INLINE_FORMULA)) {
      around(startOffset + match.index, startOffset + match.index + match[0].length, '<span class="doc-math-inline">', "</span>");
      changes.push({ line: lineAt(startOffset + match.index), rule: "formula" });
    }
  }

  // ---------- loose words ----------
  // What runs of loose words made paragraphs hold: their elements walked as a paragraph's words (an
  // inline tag a format, a picture amid them no figure of its own), and the texts of a formula
  // block, which are its TeX.
  const inRun = new Set();
  const tex = new Set();
  // Each run of loose words among `nodes` (runsOf) a paragraph, or a formula block when it is one
  // display formula and nothing else; the blanks around it left outside. A run holding an element
  // not closed in the file, what the parser put there, or an element with a block inside it (which
  // would close the paragraph: CLOSES_P) stays as written (readOnlyTexts names it). `titled(run)`:
  // whether the run is a flowchart step's title (stepWords), a paragraph of bold words then.
  function paragraphs(nodes, titled = () => false) {
    for (const run of runsOf(nodes)) {
      if (!run.every((node) => (node.tagName ? start(node) && (end(node) || VOID.has(node.tagName)) && !holdsBlock(node) : node.sourceCodeLocation))) continue;
      const first = run[0].sourceCodeLocation.startOffset;
      const last = run.at(-1).sourceCodeLocation.endOffset;
      const raw = source.slice(first, last);
      const from = first + HTML_SPACE.exec(raw)[0].length;
      const to = last - /[ \t\n\r\f]*$/.exec(raw)[0].length;
      if (run.every(isText) && oneDisplayFormula(source.slice(from, to))) {
        around(from, to, '<div class="doc-math-block">', "</div>");
        changes.push({ line: lineAt(from), rule: "display formula" });
        run.forEach((node) => tex.add(node));
      } else if (titled(run)) {
        const bold = allBold(run);
        around(from, to, bold ? "<p>" : "<p><strong>", bold ? "</p>" : "</strong></p>");
        changes.push({ line: lineAt(from), rule: "step title", ...titleNote(run[0].parentNode) });
        run.forEach((node) => inRun.add(node));
      } else {
        around(from, to, "<p>", "</p>");
        changes.push({ line: lineAt(from), rule: "loose words" });
        run.forEach((node) => inRun.add(node));
      }
    }
  }

  // ---------- a flowchart's steps ----------
  // A step of a flowchart written the short way, its own words before its blocks (<li>收集数据<p>…</p>
  // </li>), made a node as the kit and the editor take one: its words (after its icon, when one comes
  // first) its first block, a paragraph, its title, bold (<p><strong>…</strong></p>: a <p> alone
  // around words all in <strong> or <b> already); words after one of its blocks a paragraph of its
  // content (loose words), as in any container; a run of one display formula a formula block. Its
  // data-direction, its --doc-flow-ratio and an icon first in it are a node's as written. The
  // first step rewritten in each flowchart notes the node's form once, so the Agent writes it so.
  const leads = (run) => run[0].parentNode.childNodes.slice(0, run[0].parentNode.childNodes.indexOf(run[0])).every((node) => !node.tagName || classesOf(node).includes(ICON));
  const noted = new Set(); // the flowcharts whose node form a note has said
  const titleNote = (step) => {
    if (noted.has(step.parentNode)) return {};
    noted.add(step.parentNode);
    return { note: "a step's own words written as its title, the first block of its node: <li><p><strong>…</strong></p> then its content (a paragraph, a list…)</li>" };
  };
  // A step holding nothing, or its icon alone (<li></li>, as a list item left empty is written), is a
  // node with an empty title: a paragraph after its icon (<li><p></p></li>), its first line, which the
  // editor writes in (bold armed there).
  const stepWords = (step) => {
    paragraphs(step.childNodes, leads);
    const others = step.childNodes.filter((child) => child.tagName && !classesOf(child).includes(ICON));
    if (others.length > 0 || runsOf(step.childNodes).length > 0 || !start(step) || !end(step)) return;
    const icon = step.childNodes.filter((child) => child.tagName).at(-1);
    const at = icon?.sourceCodeLocation?.endOffset ?? start(step).endOffset;
    splice(at, at, "<p></p>");
    changes.push({ line: lineAt(at), rule: "step title", ...titleNote(step) });
  };

  // ---------- charts drawn from a table ----------
  // The keys the report's tables and charts carry already (chartKeys), read once a rule needs a new
  // one, and those given since: each new one the first of t1, t2 … none of them holds.
  let keys;
  const newKey = () => {
    keys ??= chartKeys(document);
    const key = nextChartKey(keys);
    keys.add(key);
    return key;
  };
  // The chart a table written with data-doc-chart draws: an empty host of its type and the table's
  // key (its data are the table's rows).
  const chartHost = (table, key) => `<div data-doc-chart="${escapeAttribute(attr(table, "data-doc-chart"))}" ${CHART_DATA}="${escapeAttribute(key)}"></div>`;
  const eol = source.includes("\r\n") ? "\r\n" : "\n";
  // The blanks a line starts with: the line of `offset`.
  const indentOf = (offset) => /^[ \t]*/.exec(source.slice(source.lastIndexOf("\n", offset - 1) + 1))[0];
  // The card of the chart table `table` (written with data-doc-chart) draws by `key`, right after
  // `block`, what stands as the table's block (its frame, or the table getting one: then `frameEnd`
  // is the frame's end tag, which the card follows). Its title the table's caption of words
  // (captionOf): its words moved into the card's h3 and the caption taken out of the table (the line
  // it stood on with it, when it had one of its own: the card then takes a line of its own, so the
  // file keeps its lines); without one, no title (the checks say so). A frame the file leaves open
  // (no end tag of its own) has no place after it: the card goes right before it. Its change is at
  // the line the card takes. Returns whether it wrote `frameEnd`.
  function chartCard(table, block, key, frameEnd = null) {
    const caption = captionOf(table);
    const cut = caption ? removeLines(source, caption.sourceCodeLocation.startOffset, caption.sourceCodeLocation.endOffset) : null;
    // On a line of its own (at the line's start too): its line goes with it.
    const own = Boolean(cut) && (cut.start !== caption.sourceCodeLocation.startOffset || cut.end !== caption.sourceCodeLocation.endOffset);
    const move = caption ? { from: start(caption).endOffset, to: end(caption).startOffset } : null;
    const card = (title) => `<figure class="doc-figure">${title ? `<h3>${title}</h3>` : ""}${chartHost(table, key)}</figure>`;
    // Its text, made of the caption's words when they move.
    const put = (make) => (move ? make : make(""));
    const line = own ? `${eol}${indentOf(start(block).startOffset)}` : "";
    const after = Boolean(frameEnd ?? end(block));
    if (after) {
      // Inside what closes where the table's block does (a disclosure's content): closing first.
      const at = frameEnd ? end(table).endOffset : end(block).endOffset;
      splice(at, at, put((title) => `${frameEnd ?? ""}${line}${card(title)}`), { closes: start(block).startOffset, move });
      changes.push({ line: lineAt(at), rule: "chart", key });
    } else {
      // Where an element opening there would go (after a disclosure's content opening right before it).
      splice(start(block).startOffset, start(block).startOffset, put((title) => `${card(title)}${line}`), { opens: start(block).endOffset, move });
      changes.push({ line: lineAt(start(block).startOffset), rule: "chart", key });
    }
    if (cut) splice(cut.start, cut.end, "");
    return after && Boolean(frameEnd);
  }

  // ---------- tables ----------
  const [BOLD] = HEADER_LOOK;
  // A table's caption of words alone (text and inline elements, no attribute of its own, no control,
  // no block inside one of them), its first element with only blanks before it; else null. Not one
  // that is a display formula alone (as a paragraph it would be a formula block), nor in a report
  // whose own <style> styles captions (where and how it shows is the report's).
  const captionOf = (table) => {
    const first = table.childNodes.find((child) => !blankText(child));
    if (first?.tagName !== "caption" || !complete(first) || attributes(first).length > 0 || !hasWords(first)) return null;
    if (!first.childNodes.every((child) => isText(child) || (child.tagName && !STOPS.has(child.tagName) && !CONTROLS.has(child.tagName) && !holdsBlock(child)))) return null;
    if (first.childNodes.every(isText) && oneDisplayFormula(source.slice(start(first).endOffset, end(first).startOffset))) return null;
    return reportStyles({ tags: ["caption"] }) ? null : first;
  };
  // A row's cell that spans no other row (a rowspan of 1, as the file's table reads it: table.mjs).
  const oneRow = (cell) => {
    const span = attr(cell, "rowspan");
    return span === undefined || (/^\s*\d+\s*$/.test(span) && Number(span) === 1);
  };
  // A table the kit takes in (only then: a look the reader took off a table of the kit's stays off):
  // the header's look (components/table HEADER_LOOK, the 标题行 of the editor and of a paste: bold,
  // and the gray fill unless the cell has a color of its own) on each of its th (not a nested
  // table's) but a row's header (scope="row", the header column's: 标题列 only sticks, no look: the
  // user's, 2026-11-06), and a first row all th (no rowspan) with rows after it a thead (as a paste takes a
  // header row) when its rows are one group (a tbody, written or the parser's); neither in a report
  // whose own <style> styles th or thead (the kit's fill of a header would cover the report's; the
  // table's change says so). An explicit tbody whose first row is the header gives way to the thead
  // and opens again after it. The rows written straight in the table (the parser's tbody, after a
  // thead or not) a tbody: the browser makes the same, and the page's table tools are for the table
  // then. A last row that is a total (合计, Total) stays in the body: the kit's table script and the
  // page's table tools read a table's head and body (one with a <tfoot> is no table the page's tools
  // are for: table.mjs plainTable), and a chart drawn from it reads it as a row like the others
  // (src/shared/table-chart.mjs tableRows). Rows not closed in the file stay as written.
  // Returns the table change's notes.
  const rowHeader = (cell) => (attr(cell, "scope") ?? "").trim().toLowerCase() === "row";
  function header(table) {
    const groups = elements(table).filter((child) => ["thead", "tbody", "tfoot"].includes(child.tagName));
    const cells = groups.flatMap((group) => elements(group)).flatMap((row) => elements(row)).filter((cell) => cell.tagName === "th" && start(cell));
    const looks = !reportStyles({ tags: ["th", "thead"] });
    if (looks) for (const cell of cells) if (!rowHeader(cell)) addClasses(cell, BLOCK_COLORS.some((name) => classesOf(cell).includes(name)) ? [BOLD] : HEADER_LOOK);
    const notes = looks || !cells.length ? [] : ["its th as written (no header look, no thead): the document's own <style> styles th"];
    const closed = (rows) => rows.length > 0 && rows.every((row) => row.tagName === "tr" && complete(row));
    for (const group of groups) {
      const rows = elements(group);
      if (group.tagName !== "tbody" || !closed(rows)) continue;
      const [first, ...rest] = rows;
      const head = looks && groups.length === 1 && rest.length > 0 && elements(first).length > 0 && elements(first).every((cell) => cell.tagName === "th" && oneRow(cell));
      const written = start(group);
      if (written) {
        if (!head || !end(group)) continue;
        splice(written.startOffset, written.endOffset, "<thead>");
        splice(first.sourceCodeLocation.endOffset, first.sourceCodeLocation.endOffset, `</thead>${source.slice(written.startOffset, written.endOffset)}`);
        change(first, "header row");
        continue;
      }
      if (head) {
        around(first.sourceCodeLocation.startOffset, first.sourceCodeLocation.endOffset, "<thead>", "</thead>");
        change(first, "header row");
      }
      const body = head ? rest : rows;
      around(body[0].sourceCodeLocation.startOffset, body.at(-1).sourceCodeLocation.endOffset, "<tbody>", "</tbody>");
    }
    return notes;
  }

  // ---------- Sheet tabs and bookmarks written the short way ----------
  // The names the report's Sheet areas carry, read once an area needs one made, and those made since:
  // each new one the first of tabs-1, tabs-2 … none of them holds (the page names an area it makes
  // tabs- and four letters or digits: sheets/page.mjs).
  let sheetNames;
  const newSheetName = () => {
    sheetNames ??= (function collect(node, found = new Set()) {
      for (const child of node.childNodes ?? []) {
        if (!child.tagName) continue;
        if (attr(child, "data-doc-sheets") !== undefined) found.add(attr(child, "data-doc-sheets"));
        collect(child.tagName === "template" ? child.content : child, found);
      }
      return found;
    })(document);
    let index = 1;
    while (sheetNames.has(`tabs-${index}`)) index++;
    sheetNames.add(`tabs-${index}`);
    return `tabs-${index}`;
  };
  // The headings made tabs' names: the walk leaves them (their words go into the tab's button).
  const named = new Set();
  // A tab's name from its heading: its words as written (entities and all) on one line, its inline
  // tags left out (`raw`), and as read (`plain`, what its key is made of); `left`: the start tags left out.
  const tabName = (heading) => {
    const left = [];
    const collect = (node) => node.childNodes.map((child) => {
      if (isText(child)) return child.sourceCodeLocation ? source.slice(child.sourceCodeLocation.startOffset, child.sourceCodeLocation.endOffset) : child.value;
      if (!child.tagName) return ""; // a comment
      if (start(child)) left.push(oneLine(source.slice(start(child).startOffset, start(child).endOffset)));
      return child.tagName === "br" ? " " : collect(child);
    }).join("");
    const plain = (node) => node.childNodes.map((child) => (isText(child) ? child.value : child.tagName === "br" ? " " : child.tagName ? plain(child) : "")).join("");
    return { raw: oneLine(collect(heading)), plain: oneLine(plain(heading)), left: [...new Set(left)] };
  };
  // A tab's key, as a report's tabs have (sheets/file.mjs KEY): ASCII made of its name, else tab-<n>
  // (its place in the area), one no other tab of the area has.
  const tabKey = (name, index, taken) => {
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+/, "").slice(0, 48).replace(/-+$/, "") || `tab-${index + 1}`;
    let key = base;
    for (let count = 2; taken.has(key); count++) key = `${base}-${count}`;
    taken.add(key);
    return key;
  };
  // A Sheet area written the short way (shortSheets: <section>s alone, each the tab of the
  // heading it starts with), made as sheets/file.mjs writes one: the shell's start tag with the kit's class, its name
  // (one made when it has none) and its aria-label (the file's language: SHEETS_LABEL), its row of
  // tabs right after it, on its line; each section a panel, div[data-doc-sheet] of its tab's key, its
  // heading taken out (the lines it took left blank, so the file keeps its lines). What the heading
  // carried besides its words (its attributes, inline tags) is left out, noted.
  function sheetsArea(node, tabs) {
    const language = pageLanguage(source);
    const label = SHEETS_LABEL[language] ?? SHEETS_LABEL.zh;
    const name = attr(node, "data-doc-sheets")?.trim() ? null : newSheetName();
    const taken = new Set();
    const notes = [];
    const buttons = tabs.map(({ section, heading }, index) => {
      const { raw, plain, left } = tabName(heading);
      const key = tabKey(plain, index, taken);
      if (attributes(heading).length) notes.push(`${attributes(heading).join(", ")} of the heading "${plain}" left out: a tab is its name alone`);
      for (const tag of left) notes.push(`${tag} in the heading "${plain}" left out: a tab's name is plain text`);
      rewrap(section, `<div data-doc-sheet="${key}">`, "</div>");
      named.add(heading);
      const { startOffset, endOffset } = heading.sourceCodeLocation;
      const cut = removeLines(source, startOffset, endOffset);
      splice(cut.start, cut.end, eol.repeat(source.slice(cut.start, cut.end).split("\n").length - 1));
      return tabButton({ sheet: key, title: raw });
    });
    let open = retag(node, node.tagName, { classes: ["doc-sheet-shell"], drop: name ? ["data-doc-sheets"] : [] });
    if (name) open = open.replace(/>$/, ` data-doc-sheets="${name}">`);
    if (attr(node, "aria-label") === undefined) open = open.replace(/>$/, ` aria-label="${label}">`);
    splice(start(node).startOffset, start(node).endOffset, `${open}<div class="doc-sheet-tabs" aria-label="${label}">${buttons.join("")}</div>`);
    change(node, "sheets", notes);
  }
  // A bookmark written the short way: a paragraph holding only <a class="doc-bookmark" href="…">
  // (its class alone, a title, a target or a rel on it at most) of words alone (text, no element).
  const shortBookmark = (node) => {
    const link = elements(node)[0];
    return elements(node).length === 1 && link.tagName === "a" && classesOf(link).join(" ") === "doc-bookmark" && only(link, ["class", "href", "title", "target", "rel"])
      && Boolean(attr(link, "href")?.trim()) && complete(link) && link.childNodes.every(isText) && node.childNodes.every((child) => child === link || blankText(child));
  };
  // It made a bookmark card as bookmark/file.mjs writes one: the paragraph a figure.doc-bookmark (its
  // attributes kept), the link its card (the kit's target and rel), its words the title (the page's
  // host when it has none), its title attribute the description, its address the URL, and an empty
  // caption. Nothing is fetched: a cover or an icon is the reader's to add (刷新预览 reads the page). A link that is
  // no web address the checks fail as they fail the kit's (render/images.mjs). A target or a rel
  // other than the card's is noted, left out.
  function bookmark(node) {
    const link = elements(node)[0];
    const href = attr(link, "href").trim();
    const description = oneLine(attr(link, "title") ?? "");
    let host = href;
    try {
      host = new URL(href).hostname || href;
    } catch {
      // no address a URL reads: the address itself is the title (the checks fail the link)
    }
    const notes = [];
    const target = attr(link, "target");
    if (target !== undefined && target.trim() !== "_blank") notes.push(`target ${JSON.stringify(oneLine(target))} left out: a bookmark opens its page in a new tab`);
    const rel = attr(link, "rel");
    if (rel !== undefined && rel.split(/\s+/).some((word) => word && !["noopener", "noreferrer"].includes(word.toLowerCase()))) notes.push(`rel ${JSON.stringify(oneLine(rel))} left out: a bookmark's link is rel="noopener noreferrer"`);
    splice(start(node).startOffset, start(node).endOffset, retag(node, "figure", { classes: ["doc-bookmark"] }));
    const title = hasWords(link) ? "" : escapeText(host);
    splice(start(link).startOffset, start(link).endOffset, `<a class="doc-bookmark-card" href="${escapeAttribute(href)}" target="_blank" rel="noopener noreferrer"><span class="doc-bookmark-text"><span class="doc-bookmark-title">${title}`);
    const said = description ? `<span class="doc-bookmark-description">${escapeText(description)}</span>` : "";
    splice(end(link).startOffset, end(link).endOffset, `</span>${said}<span class="doc-bookmark-url"><span class="doc-bookmark-href">${escapeText(href)}</span></span></span></a>`);
    splice(end(node).startOffset, end(node).endOffset, "<figcaption></figcaption></figure>");
    change(node, "bookmark", notes);
  }

  // ---------- blocks ----------
  // The share of the reading width a column of the kit's (`parent`, in a row of columns) takes: its
  // share of the row (--doc-column-ratio, 1 where none is written, styles/columns.css) less the
  // gaps; null for anything else a picture stands in.
  const columnShare = (parent) => {
    const row = parent?.parentNode;
    if (!parent?.tagName || !classesOf(parent).includes("doc-column") || !row?.tagName || !classesOf(row).includes("doc-columns")) return null;
    const ratio = (column) => Number(/--doc-column-ratio\s*:\s*(\d*\.?\d+)/i.exec(attr(column, "style") ?? "")?.[1] ?? 1) || 1;
    const columns = elements(row).filter((child) => classesOf(child).includes("doc-column"));
    const all = columns.reduce((sum, column) => sum + ratio(column), 0);
    return ((READING_WIDTH - COLUMN_GAP * (columns.length - 1)) / READING_WIDTH) * (ratio(parent) / all);
  };
  // A picture's width written on its <img> (width="N", pixels, or "N%") made its figure's share of
  // the reading width (--doc-span, what the page editor's resize writes; styles/sizes.css: a
  // picture's share is of the reading width wherever it stands, at most the width it stands in, so a
  // picture keeps its width in pixels in a column too): N / READING_WIDTH; a percent, as HTML means it,
  // of the width the picture stands in: N / 100 of its column's share of the reading width in a
  // column (columnShare), else N / 100 (a list, a disclosure, a panel or a quote is the reading width
  // less a little); within SPAN_SIZE, to three places, the attribute taken off the picture. `holder`:
  // the element made the figure, whose own style is kept before the span (null for a picture
  // standing alone); `parent`: what the figure stands in. { attribute: the figure's style attribute,
  // note }, or null: no width, one of another unit, or a holder whose style has a span already (the
  // picture then as written).
  const pictureSpan = (img, holder, parent) => {
    const written = attr(img, "width");
    const number = /^\s*(\d+(?:\.\d+)?)\s*(px|%)?\s*$/i.exec(written ?? "");
    const style = (holder ? attr(holder, "style") ?? "" : "").trim().replace(/;\s*$/, "");
    const at = img.sourceCodeLocation.attrs?.width;
    if (!number || !at || /--doc-span\s*:/i.test(style)) return null;
    const percent = number[2] === "%";
    const column = percent ? columnShare(parent) : null;
    const share = percent ? (Number(number[1]) / 100) * (column ?? 1) : Number(number[1]) / READING_WIDTH;
    const span = Math.round(Math.min(SPAN_SIZE.max, Math.max(SPAN_SIZE.min, share)) * 1000) / 1000;
    let from = at.startOffset;
    while (/[ \t\n\r\f]/.test(source[from - 1] ?? "")) from--;
    splice(from, at.endOffset, "");
    const within = share < SPAN_SIZE.min || share > SPAN_SIZE.max ? `, within ${SPAN_SIZE.min} to ${SPAN_SIZE.max}` : "";
    const of = !percent ? `${Number(number[1])}px of the ${READING_WIDTH}px reading width`
      : column === null ? "a share of the width it stands in" : `a share of the width it stands in, its column ${Math.round(column * 1000) / 1000} of the reading width`;
    return {
      attribute: ` style="${escapeAttribute(`${style ? `${style}; ` : ""}${SPAN}: ${span}`)}"`,
      note: `width="${written}" written as ${SPAN}: ${span} on its figure (${of}${within}; at most the width it stands in)`,
    };
  };
  // A figure's start tag: `holder`'s as written (retag), or the kit's alone, with a picture's span.
  const pictureOpen = (holder, sized) => {
    const open = holder ? retag(holder, "figure", { classes: ["doc-image"], drop: sized?.attribute ? ["style"] : [] }) : '<figure class="doc-image">';
    return sized?.attribute ? `${open.slice(0, -1)}${sized.attribute}>` : open;
  };
  const pictureFigure = (node) => elements(node).filter((child) => child.tagName === "img").length === 1
    && elements(node).every((child) => child.tagName === "img" || child.tagName === "figcaption")
    && node.childNodes.every((child) => child.tagName || blankText(child));
  const onePicture = (node) => elements(node).length === 1 && elements(node)[0].tagName === "img" && node.childNodes.every((child) => child.tagName || blankText(child));
  // Text alone, one display formula (as written: entities and all).
  const displayFormula = (node) => node.childNodes.length > 0 && node.childNodes.every(isText)
    && oneDisplayFormula(source.slice(start(node).endOffset, end(node).startOffset));
  const panels = new Set(); // the asides made highlight panels: their words go in paragraphs
  // A report whose own <style> styles GFM's classes, or whose own script reads checkboxes or GFM's
  // classes, keeps its task lists as written (readOnlyTexts and writingNotes name them).
  const gfmKept = () => reportStyles(GFM_STYLED) || reportScripts(GFM_SCRIPTED);
  const gfmTaken = (node) => taskList(node) && !gfmKept();

  // A code block made of `pre`, or of `figure` (a code figure: codeFigure) holding it and `caption`;
  // `said`: notes of its own (why a figure around it stays). On the kit's block: its language, its
  // block id and its id (the figure's, else the pre's, else its code's: an anchor's target), and its
  // own attributes (CODE_OWN: the number its first line shows, the first data-line-start, else
  // Prism's data-start, that writes one, src/shared/code-lines.mjs; whether it shows line numbers;
  // its folded lines), each the first that says one, and whether its long lines scroll (NOWRAP, of a
  // data-wrap="false" or the class on the pre or its code). Its title: the caption's words on one line (its
  // inline tags left out, noted but a code's or the like of no attribute; its blanks one space, the
  // lines they took left blank after it; a caption after the pre moved before it, the line it stood on
  // with it when it had one of its own, the pre then taking a line of its own, so the file keeps its
  // lines), else the first data-title, else empty. Every other one of those (one that says none, one
  // said before it, a data-title beside a caption) left out, noted, so none stands where the kit
  // does not read it (never twice on the block). What else the pre and its code carry (a style, a
  // tabindex, a highlighter's class, a second id) kept on them as written, and what else the figure
  // carries on the block, noted.
  function codeBlock(pre, figure = null, caption = null, said = []) {
    const code = codeOf(pre);
    const pair = [pre, code].filter(Boolean);
    const holders = [figure, ...pair].filter(Boolean);
    const named = pair.flatMap(classesOf).map((name) => LANGUAGE_CLASS.exec(name)?.[1]).find(Boolean)
      ?? holders.map((element) => attr(element, "data-language") ?? attr(element, "data-lang")).find(Boolean);
    // The first of them with an attribute `name`, and that attribute as written.
    const holder = (name) => holders.find((element) => element.sourceCodeLocation.attrs?.[name]);
    const written = (element, name) => {
      const at = element?.sourceCodeLocation.attrs[name];
      return at ? ` ${source.slice(at.startOffset, at.endOffset)}` : "";
    };
    const ided = holder("id");
    const notes = [...said];
    // The block's own attributes as they wrote them, each { element, name, value }: those `names`
    // name (the first name's first, as they stand: figure, pre, code), taken off them.
    const taken = new Map(holders.map((element) => [element, new Set()]));
    const found = (names) => names.flatMap((name) => holders.filter((element) => attr(element, name) !== undefined).map((element) => {
      taken.get(element).add(name);
      return { element, name, value: attr(element, name) };
    }));
    const leftOut = (each, why) => notes.push(`${each.name} ${JSON.stringify(oneLine(each.value))} left out (its <${each.element.tagName}>'s): ${why}`);
    const own = CODE_OWN.flatMap(({ name, names, value, says }) => {
      const all = found(names);
      const chosen = all.find((each) => value(each.value) !== null);
      for (const each of all) if (each !== chosen) leftOut(each, value(each.value) === null ? says : `the block takes its <${chosen.element.tagName}>'s ${chosen.name}`);
      return chosen ? [` ${name}="${escapeAttribute(value(chosen.value))}"`] : [];
    });
    // Whether its long lines scroll (NOWRAP on the block): the first data-wrap that says true or false,
    // else the kit's class written on the pre or its code (where it does nothing: it goes to the block).
    const wraps = found([WRAP_ATTRIBUTE]);
    const wrap = wraps.find((each) => /^\s*(?:true|false)\s*$/i.test(each.value));
    for (const each of wraps) if (each !== wrap) leftOut(each, wrap ? `the block takes its <${wrap.element.tagName}>'s ${WRAP_ATTRIBUTE}` : "false keeps its long lines on one line (they scroll), true wraps them");
    const nowrap = wrap ? wrap.value.trim().toLowerCase() === "false" : pair.some((element) => classesOf(element).includes(NOWRAP));
    // Its fill (a code block's one color: components/colors.mjs), the first written on the pre or its code.
    const fill = pair.flatMap(classesOf).find((name) => FILLS.includes(name));
    const titles = found([TITLE_ATTRIBUTE]);
    const titled = caption ? null : titles[0];
    const title = titled ? escapeText(oneLine(titled.value)) : "";
    for (const each of titles) if (each !== titled) leftOut(each, caption ? "its caption is its title" : `the block takes its <${titled.element.tagName}>'s ${TITLE_ATTRIBUTE}`);
    // What else they carry: not what went on the block, into its title or out.
    const kept = (element) => Object.keys(element.sourceCodeLocation.attrs ?? {})
      .filter((name) => name !== "class" && !BLOCK_ATTRIBUTES.has(name) && !(name === "id" && element === ided) && !taken.get(element).has(name));
    // The start tag of the pre or its code without what went on the block, the rest as written.
    const rest = (element) => {
      const classes = classesOf(element).filter((name) => !LANGUAGE_CLASS.test(name) && name !== NOWRAP && name !== fill);
      const names = kept(element);
      // The frame's height written on the pre (style="--doc-code-height: none", as writing-html.md
      // says) is where the kit reads it: nothing to note (an Agent read "style kept on its <pre>" as
      // a problem with what it was told to write; a review, 2026-10-29).
      const style = element.attrs.find((attribute) => attribute.name === "style")?.value ?? "";
      const sized = style.split(";").map((part) => part.trim()).filter(Boolean).every((part) => /^--doc-code-height\s*:/i.test(part));
      const carried = [...(classes.length ? [`class ${JSON.stringify(classes.join(" "))}`] : []), ...names.filter((name) => !(name === "style" && sized))];
      if (carried.length) notes.push(`${carried.join(", ")} kept on its <${element.tagName}>`);
      return `<${element.tagName}${classes.length ? ` class="${escapeAttribute(classes.join(" "))}"` : ""}${names.map((name) => written(element, name)).join("")}>`;
    };
    const others = figure ? kept(figure) : [];
    const block = `<div class="doc-code${nowrap ? ` ${NOWRAP}` : ""}${fill ? ` ${fill}` : ""}"${written(ided, "id")}${written(holder("data-block-id"), "data-block-id")}${named ? ` data-language="${escapeAttribute(named.toLowerCase())}"` : ""}${own.join("")}${others.map((name) => written(figure, name)).join("")}>`;
    if (others.length) notes.push(`${others.join(", ")} kept on the block (its <figure>'s)`);
    const preTag = rest(pre);
    const opened = (head) => (code ? `${head}${preTag}` : `${head}${preTag}<code>`);
    const closed = code && complete(code) ? "</pre>" : "</code></pre>";
    const titleOf = (words) => `<div class="doc-code-title">${words}</div>`;
    if (!figure) rewrap(pre, opened(`${block}${titleOf(title)}`), `${closed}</div>`);
    else {
      rewrap(figure, block, "</div>");
      if (!caption) rewrap(pre, opened(titleOf(title)), closed);
      else {
        // The caption's words (its inside, as the splices in it make it) the title's, on one line.
        const { startOffset, endOffset } = caption.sourceCodeLocation;
        const move = { from: start(caption).endOffset, to: end(caption).startOffset };
        const words = (text) => text.replace(/[ \t\n\r\f]+/g, " ").trim();
        const breaks = (from, to) => source.slice(from, to).split("\n").length - 1;
        if (startOffset < pre.sourceCodeLocation.startOffset) {
          // Where the caption stood, the lines it took left blank after it.
          splice(startOffset, endOffset, (text) => `${titleOf(words(text))}${eol.repeat(breaks(startOffset, endOffset))}`, { move });
          rewrap(pre, opened(""), closed);
        } else {
          // Moved before the pre, the caption taken out (its line with it, when it had one of its
          // own), the pre then on a line of its own after the lines it took.
          const cut = removeLines(source, startOffset, endOffset);
          const lines = breaks(cut.start, cut.end);
          const after = lines ? `${eol.repeat(lines)}${indentOf(start(pre).startOffset)}` : "";
          splice(start(pre).startOffset, start(pre).endOffset, (text) => opened(`${titleOf(words(text))}${after}`), { move });
          splice(cut.start, cut.end, "");
          if (end(pre)) splice(end(pre).startOffset, end(pre).endOffset, closed);
        }
      }
    }
    if (code && attributes(code).length) splice(start(code).startOffset, start(code).endOffset, rest(code));
    // The caption's inline tags left out of its words (a line break a space), each start tag (a
    // link's address with it) said once, but a code's, a key's, a sample's or a variable's of no
    // attribute (CODE_TAGS: the title is code's anyway).
    if (caption) {
      const left = new Set();
      const leave = (node) => {
        for (const child of elements(node)) {
          if (!CODE_TAGS.has(child.tagName) || attributes(child).length) left.add(oneLine(source.slice(start(child).startOffset, start(child).endOffset)));
          if (VOID.has(child.tagName)) splice(start(child).startOffset, start(child).endOffset, child.tagName === "br" ? " " : "");
          else {
            unwrap(child);
            leave(child);
          }
        }
      };
      leave(caption);
      for (const tag of left) notes.push(`${tag} in its caption left out: a code block's title is plain text`);
    }
    change(figure ?? pre, "code", notes);
  }

  function block(node, parent) {
    const tag = node.tagName;
    if (!complete(node)) return false;
    // A paragraph, or a div of no class, that is one display formula.
    if ((tag === "p" || (tag === "div" && classesOf(node).length === 0)) && displayFormula(node)) {
      rewrap(node, retag(node, "div", { classes: ["doc-math-block"] }), "</div>");
      change(node, "display formula");
      return true;
    }
    // A picture: in a figure of its own, standing in a flow, or a paragraph's only content; its
    // width the figure's span (pictureSpan).
    if (tag === "figure" && classesOf(node).length === 0 && pictureFigure(node)) {
      const sized = pictureSpan(elements(node).find((child) => child.tagName === "img"), node, parent);
      splice(start(node).startOffset, start(node).endOffset, pictureOpen(node, sized));
      if (!elements(node).some((child) => child.tagName === "figcaption")) splice(end(node).startOffset, end(node).startOffset, "<figcaption></figcaption>");
      change(node, "figure", sized ? [sized.note] : []);
      return true;
    }
    if (tag === "img" && FLOW_PARENTS.has(parent?.tagName)) {
      const sized = pictureSpan(node, null, parent);
      around(start(node).startOffset, start(node).endOffset, pictureOpen(null, sized), "<figcaption></figcaption></figure>");
      change(node, "picture", sized ? [sized.note] : []);
      return true;
    }
    // A bookmark written the short way, standing in a flow.
    if (tag === "p" && FLOW_PARENTS.has(parent?.tagName) && shortBookmark(node)) {
      bookmark(node);
      return true;
    }
    // A Sheet area written the short way: its tabs and panels the kit's.
    if (attr(node, "data-doc-sheets") !== undefined) {
      const tabs = shortSheets(node)?.tabs;
      if (tabs) sheetsArea(node, tabs);
      return false; // its panels' blocks go on
    }
    if (tag === "p" && onePicture(node)) {
      const sized = pictureSpan(elements(node)[0], node, parent);
      rewrap(node, pictureOpen(node, sized), "<figcaption></figcaption></figure>");
      change(node, "picture", sized ? [sized.note] : []);
      return true;
    }
    // A code block: a figure of a code and its caption, or a pre (codeBlock). A pre in a figure of no
    // class that is no code figure, holding a caption: the code block says why the caption stays.
    const figured = tag === "figure" && classesOf(node).length === 0 ? codeFigure(node) : null;
    if (figured && !figured.why && complete(figured.pre)) {
      codeBlock(figured.pre, node, figured.caption);
      return true;
    }
    if (tag === "pre" && !classesOf(parent ?? {}).includes("doc-code")) {
      const captioned = parent?.tagName === "figure" && classesOf(parent).length === 0 && elements(parent).some((child) => child.tagName === "figcaption");
      const kept = captioned ? codeFigure(parent) : null;
      const why = kept?.pre === node ? kept.why : "";
      codeBlock(node, null, null, why ? [`its <figure>'s caption stays a caption beside it: ${why}; a <figure> holding the pre and one <figcaption> of words alone makes them its title`] : []);
      return true;
    }
    // Any other figure is a card (卡片块: a chart, a drawing of the report's own), the kit's class
    // added to what it has (the media cards, the kit's already, never come here). One of no class of
    // the report's own (a bare one: its tables, its code, its formulas) has its inside taken in as
    // anywhere; one with classes of its own was the report's drawing, its inside left as written
    // (as a whole block's was). Only a figure standing where a block does (in a flow, no figure
    // around it) is a card: a bare <figure> in a bare card's drawing, or in a cell, is part of what it
    // stands in, left as written, its inside too (the kit's card around it is a drawing never walked).
    if (tag === "figure") {
      if (!FLOW_PARENTS.has(parent?.tagName) || inFigure(node)) return true;
      addClasses(node, ["doc-figure"]);
      change(node, "figure");
      return ownClass(node);
    }
    // A table written with data-doc-chart where a card stands in no flow (in a <figure>, a cell):
    // left as it is, the checks saying why (chart-declarations.mjs).
    const wrapped = tag === "table" && classesOf(parent ?? {}).includes("doc-table-wrap");
    if (tag === "table" && attr(node, "data-doc-chart") !== undefined && !FLOW_PARENTS.has((wrapped ? parent.parentNode : parent)?.tagName)) return false;
    // A table of the kit's (in its wrapper) written with data-doc-chart: the chart's card (its
    // caption the card's title) right after its wrapper (chartCard); the wrapper takes the key (or
    // keeps the one it has), data-doc-chart off the table.
    if (tag === "table" && attr(node, "data-doc-chart") !== undefined && wrapped && start(parent)) {
      const key = attr(parent, CHART_SOURCE) ?? newKey();
      chartCard(node, parent, key);
      if (attr(parent, CHART_SOURCE) === undefined) {
        const last = start(parent).endOffset - 1; // its start tag's ">"
        splice(last, last, ` ${CHART_SOURCE}="${escapeAttribute(key)}"`);
      }
      splice(start(node).startOffset, start(node).endOffset, retag(node, "table", { drop: ["data-doc-chart"] }));
      return false; // its cells' words go on
    }
    // A table outside the kit's wrapper (a table of the kit's with a class of the report's own
    // too): its block id on the wrapper, which is the block; its header and its rows as the kit
    // writes them, and its caption of words the line above it (header, captionOf). One written with
    // data-doc-chart is a chart's data too: the chart's card (its caption the card's title, not
    // the line above the table) right after the wrapper (chartCard), the wrapper and the card's host
    // linked by a key of their own (src/shared/table-chart.mjs), data-doc-chart off the table. A key
    // written on the table
    // (data-doc-chart-source: the table a card declared elsewhere draws, folded in a disclosure
    // under it) is its frame's, as the kit reads it there.
    if (tag === "table" && (!ownClass(node) || kitElement(node)) && !classesOf(parent ?? {}).includes("doc-table-wrap")) {
      const id = node.sourceCodeLocation.attrs?.["data-block-id"];
      const charted = attr(node, "data-doc-chart") !== undefined;
      const written = attr(node, CHART_SOURCE)?.trim() || null;
      const key = written ?? (charted ? newKey() : null);
      // The frame's sizes written in the table's style (style="--doc-table-height: none": every row;
      // --doc-span) are the frame's, where the kit reads them (table.css, sizes.css): they go on the
      // wrapper, the rest of the style stays on the table.
      const style = attr(node, "style");
      const sizes = style === undefined ? [] : declarationsOf(style).filter((declaration) => FRAME_SIZES.test(declaration));
      const rest = sizes.length ? declarationsOf(style).filter((declaration) => !FRAME_SIZES.test(declaration)) : [];
      const sized = (declarations) => ` style="${escapeAttribute(declarations.map((declaration) => declaration.trim()).join("; "))}"`;
      const wrap = `<div class="doc-table-wrap"${id ? ` ${source.slice(id.startOffset, id.endOffset)}` : ""}${key ? ` ${CHART_SOURCE}="${escapeAttribute(key)}"` : ""}${sizes.length ? sized(sizes) : ""}>`;
      const opening = retag(node, "table", { classes: ["doc-table"], drop: ["data-block-id", ...(attr(node, CHART_SOURCE) !== undefined ? [CHART_SOURCE] : []), ...(charted ? ["data-doc-chart"] : []), ...(sizes.length ? ["style"] : [])] });
      const opened = rest.length ? `${opening.slice(0, -1)}${sized(rest)}>` : opening;
      const caption = charted ? null : captionOf(node); // a chart's caption is its card's title
      let closed = false; // the frame's end tag written with a card after it
      if (charted) closed = chartCard(node, node, key, "</div>");
      if (caption) {
        // Its words stay where they are, now a paragraph's of small text above the frame: the
        // table's start tag and the caption's (and the blanks between) give way to the paragraph's,
        // the caption's end tag to the paragraph's and the frame's and table's start tags, the
        // blanks between them (so the file keeps its lines).
        const blanks = source.slice(start(node).endOffset, caption.sourceCodeLocation.startOffset);
        splice(start(node).startOffset, start(caption).endOffset, '<p class="doc-note">');
        splice(end(caption).startOffset, end(caption).endOffset, `</p>${blanks}${wrap}${opened}`);
        change(caption, "caption");
      } else {
        // Where the frame opens, right before the table (inside a disclosure's content opening there
        // too).
        splice(start(node).startOffset, start(node).startOffset, wrap, { opens: end(node).endOffset });
        splice(start(node).startOffset, start(node).endOffset, opened);
      }
      if (!closed) splice(end(node).endOffset, end(node).endOffset, "</div>", { closes: start(node).startOffset });
      change(node, "table", header(node));
      return false; // its cells' words go on
    }
    // A disclosure without the kit's parts (of no class but a block color, its fill): its loose words
    // paragraphs in its content, blocks or not.
    if (tag === "details" && colorsOnly(node)) {
      const summary = elements(node)[0]?.tagName === "summary" ? elements(node)[0] : null;
      if (!summary || !complete(summary)) return false;
      splice(start(node).startOffset, start(node).endOffset, retag(node, "details", { classes: ["doc-details"] }));
      if (!elements(summary).some((child) => classesOf(child).includes("doc-details-summary-label"))) {
        around(start(summary).endOffset, end(summary).startOffset, '<span class="doc-details-summary-label">', "</span>");
      }
      around(end(summary).endOffset, end(node).startOffset, '<div class="doc-details-content">', "</div>");
      paragraphs(node.childNodes.slice(node.childNodes.indexOf(summary) + 1));
      change(node, "details");
      return false; // its words and blocks go on
    }
    // A dialog of no class with an id, of words or starting with a block: a detail card (dialog/file.mjs
    // writes one so), all it holds its content, a heading first in it an h3, loose words paragraphs.
    if (tag === "dialog" && shortDialog(node)) {
      const heading = shortHeading(node);
      splice(start(node).startOffset, start(node).endOffset, retag(node, "dialog", { classes: ["doc-dialog"] }));
      around(start(node).endOffset, end(node).startOffset, '<div class="doc-dialog-panel"><div class="doc-dialog-content">', "</div></div>");
      if (heading) rewrap(heading, "<h3>", "</h3>");
      paragraphs(node.childNodes.slice(heading ? node.childNodes.indexOf(heading) + 1 : 0));
      change(node, "dialog");
      return false; // its heading's words and its content go on
    }
    // An aside of no class but a block color (its fill): a highlight panel (the tag kept), unless the
    // report styles its asides.
    if (tag === "aside" && colorsOnly(node) && !reportStyles({ tags: ["aside"] })) {
      addClasses(node, ["doc-panel"]);
      panels.add(node);
      change(node, "aside");
      return false; // its words and blocks go on
    }
    // A GFM task list: the kit's to-do list, each item taken in (taskItem); GFM's classes gone, the
    // rest of each tag as written. Items written as GFM's into one of the kit's to-do lists (an Agent
    // adding to it as Markdown writes) are taken in the same way.
    if (tag === "ul" && gfmTaken(node)) {
      addClasses(node, [TODO], { drop: GFM_LIST });
      for (const item of elements(node)) takeItem(item);
      change(node, "task list");
      return false; // its items' words go on
    }
    // A list marked to be drawn as a flowchart: the kit's (ol.doc-flow), its tag as written but the mark.
    if (flowMarked(node) && !ownClass(node)) {
      splice(start(node).startOffset, start(node).endOffset, retag(node, "ol", { classes: [FLOW], drop: ["data-doc-chart", "data-flow"] }));
      change(node, "flowchart");
      return false; // its items' words go on
    }
    if (tag === "ul" && classesOf(node).includes(TODO) && !ownClass(node)) {
      const items = elements(node).filter(taskItem);
      if (items.length && !gfmKept()) {
        for (const item of items) takeItem(item);
        change(node, "task list");
      }
      return false;
    }
    aligned(node); // a paragraph or a heading (its words go on)
    return false;
  }
  // A paragraph or a heading aligned by its style (text-align: center | right; the last such declaration
  // wins, as in CSS): the kit's class instead (it takes the alignment of any it had), the declaration
  // off the style, whose other declarations stay as written.
  function aligned(node) {
    const style = attr(node, "style");
    if (style === undefined || !ALIGN_TAGS.test(node.tagName)) return;
    const found = declarationsOf(style).map((declaration) => {
      const colon = declaration.indexOf(":");
      const name = oneLine(colon < 0 ? declaration : declaration.slice(0, colon)).toLowerCase();
      return { declaration: declaration.trim(), name, value: colon < 0 ? "" : oneLine(declaration.slice(colon + 1).replace(/!\s*important\s*$/i, "")) };
    });
    const last = found.filter(({ name }) => name === "text-align").at(-1);
    const name = last && ALIGN_VALUE.exec(last.value)?.[1].toLowerCase();
    if (!name) return;
    const rest = found.filter((each) => each.name !== "text-align").map(({ declaration }) => declaration);
    const { class: classAt, style: styleAt } = node.sourceCodeLocation.attrs;
    const named = Object.values(ALIGNS);
    if (rest.length === 0 && !classAt) splice(styleAt.startOffset, styleAt.endOffset, `class="${ALIGNS[name]}"`);
    else {
      addClasses(node, [ALIGNS[name]], { drop: named });
      if (rest.length) splice(styleAt.startOffset, styleAt.endOffset, `style="${escapeAttribute(rest.join("; "))}"`);
      else dropAttribute(node, "style");
    }
    change(node, "alignment");
  }

  // A GFM task item made a to-do list's: its box gone (and the one space after it), li[data-checked]
  // when the box was checked, GFM's class gone.
  function takeItem(item) {
    const box = taskBox(item);
    addClasses(item, [], { drop: GFM_ITEM });
    if (attr(box, "checked") !== undefined) {
      const after = start(item).startOffset + 1 + item.tagName.length;
      splice(after, after, ` ${CHECKED}`);
    }
    const { startOffset, endOffset } = box.sourceCodeLocation;
    splice(startOffset, endOffset + (source[endOffset] === " " ? 1 : 0), "");
  }

  // ---------- the walk ----------
  // `text`: inside a text block (a paragraph, a heading, an item, a cell…), where inline tags are
  // words' formats; elsewhere an inline element is a part of something (a scope line's spans).
  function walk(node, parent = null, text = false) {
    // A container's loose words: paragraphs (a disclosure's are made with its content, in block();
    // a panel made of an aside, and a box of the kit's that always holds a block, have their words in
    // paragraphs whether they hold blocks or not).
    const words = () => runsOf(node.childNodes).length > 0;
    if (looseHolder(node) && (looseWords(node) || ((panels.has(node) || holdsOneBlock(node)) && words()))) paragraphs(node.childNodes);
    else if (flowStep(node) && start(node)) stepWords(node); // a flowchart's step written the short way: a node
    for (const child of node.childNodes ?? []) {
      if (isText(child)) {
        if (child.sourceCodeLocation && child.value.includes("\\(") && !tex.has(child)) formulas(child);
        continue;
      }
      if (!child.tagName || SKIPPED.has(child.tagName) || named.has(child)) continue;
      if (isInstance(child)) {
        // Its slots: flows of the document's, their loose words paragraphs whether they hold blocks or not.
        for (const slot of instanceSlots(child)) {
          panels.add(slot);
          walk(slot, slot);
        }
        continue;
      }
      // A chart's host is the kit's; a table written with one (the chart's data) is made a chart and a
      // table; a list marked as a flowchart is none (block() makes it the kit's flowchart).
      if ((attr(child, "data-doc-chart") !== undefined && child.tagName !== "table" && !flowMarked(child)) || attr(child, "contenteditable") !== undefined) continue;
      if (classesOf(child).some((name) => KIT_OWN.includes(name))) continue;
      if (child.tagName === "pre") {
        block(child, node); // a code block, its class or not; its text is code either way
        continue;
      }
      if (wholeBlock(child) && !gfmTaken(child)) continue; // a whole block's inside is its own (GFM's classes are no report's)
      if (inRun.has(child)) { // a paragraph's words now
        if (!inline(child)) walk(child, child, true);
        continue;
      }
      if (block(child, node) || (text && inline(child))) continue;
      walk(child, child, text || TEXT_BLOCKS.has(child.tagName));
    }
  }
  walk(main, main);
  walk({ childNodes: strays });
  if (source.includes(HEADED.header)) headedCards(document);
  // Each stray card at main's end, the line of main's end tag kept for that tag when it has one of its
  // own; the lines it stood on go with it, so the file keeps its count.
  for (const card of strays) {
    const { startOffset: from, endOffset: to } = card.sourceCodeLocation;
    const cut = removeLines(source, from, to);
    const at = end(main).startOffset;
    const lead = cut.end > to ? lineIndent(source, at) : null;
    splice(at, at, (text) => (lead === null ? text : `${text}${eol}${lead}`), { move: { from, to } });
    splice(cut.start, cut.end, "", { leaves: true });
    change(card, "card outside main");
  }

  if (!splices.length) return { text: source, changes: [] };
  // Text moved: the splices inside what it takes made in it alone, the splice taking it given it, and
  // that one, made, one like them for a text moved around it.
  let pending = splices;
  for (const entry of splices.filter((each) => each.move)) {
    const { from, to } = entry.move;
    const inside = pending.filter((each) => !each.move && !each.leaves && each.start >= from && each.end <= to);
    pending = pending.filter((each) => !inside.includes(each));
    entry.text = entry.text(spliced(source.slice(from, to), inside, from));
    entry.move = null;
  }
  return { text: spliced(source, pending), changes: changes.sort((a, b) => a.line - b.line) };
}

// Text `text` (the source's from `base` on) with `splices` made in it ({ start, end, text, order,
// opens, closes }, at the source's offsets). Text put in at one place: closing tags first, the
// innermost first, then what is neither, then opening tags, the outermost first (each in the order
// asked for when that says nothing).
function spliced(text, splices, base = 0) {
  const rank = (at) => (at.closes !== null ? 0 : at.opens !== null ? 2 : 1);
  const inText = (a, b) => rank(a) - rank(b)
    || (a.closes !== null ? b.closes - a.closes || b.order - a.order : 0)
    || (a.opens !== null ? b.opens - a.opens : 0)
    || a.order - b.order;
  // From the end of the text back, so each splice's offsets are the source's; at one place, what
  // comes last in the text first.
  const sorted = [...splices].sort((a, b) => b.start - a.start || b.end - a.end || (a.start === a.end ? inText(b, a) : b.order - a.order));
  let result = text;
  for (const { start: at, end: to, text: put } of sorted) result = result.slice(0, at - base) + put + result.slice(to - base);
  return result;
}

/**
 * A report's source as its pages see it and the checks and the build read it, the file left as it
 * is: naturalize's text with the kit tags its blocks then need (`finish`: the render's
 * withNeededKitTags, which the editor does not import), or the source itself (its old names new:
 * naturalize) when nothing in it is natural. { text, changes }. The preview serves this text, a page opens on its version and a
 * commit is applied to it (so the reader's first edit writes the kit's markup).
 */
export function shownSource(source, { finish = (text) => text } = {}) {
  const { text, changes } = naturalize(source);
  return { text: changes.length ? finish(text) : text, changes };
}

/**
 * What an export writes into a report's file (the hand-in, the moment the Agent hands the report in):
 * its source as pages see it (shownSource) with an id for every block that has none (addBlockIds:
 * harmless to a page open on it, as no unit's hash counts ids), so that the Agent's next edit starts
 * from the file the reader edits and every later commit finds blocks by their ids; and its <title>
 * in step with its title (inStep: what the editor does when the reader renames it). A report whose
 * ids repeat is left as it is (`repeated`, at the file's lines and columns: which block is the copy
 * is its author's to say, and the export says so, as add-block-ids.mjs does; never renamed). `next`: the ids (addBlockIds); `metadata`: report.json's, whose title and icon the page's
 * are to be. { text, changes, added, given, repeated, title, icon } (`given`: [{ id, tag, line }],
 * each block given an id, at its line in `text`; title and icon: inStep's).
 */
export function handedInSource(source, { finish, next, metadata = null } = {}) {
  const repeated = repeatedBlockIds(source); // naturalize gives no element another's id
  if (repeated.length) return { text: source, changes: [], added: 0, given: [], repeated, title: null, icon: null };
  const shown = shownSource(source, { finish });
  const { text, added, given } = addBlockIds(shown.text, next);
  const stepped = inStep(text, metadata);
  return { ...stepped, changes: shown.changes, added, given: placeGivenIds(stepped.text, given), repeated };
}

/**
 * The blocks an export's hand-in will give an id (handedInSource), which gallery check, writing
 * nothing, says: those of the source as pages see it without one (blocksWithoutIds: [{ line, tag }]),
 * at the file's lines, which naturalize keeps (the kit tags `finish` would add in the head are left
 * out). None for a report whose ids repeat, which the hand-in leaves as it is.
 */
export function pendingBlockIds(source) {
  if (repeatedBlockIds(source).length) return [];
  return blocksWithoutIds(shownSource(source).text);
}

// The page's icon among the units `found` (findUnits') holds: the icon in the header's box, the div.doc-icon
// before the title, or null. One rule for inStep, which reads report.json's icon by it, and headerChanged, which
// writes it as gallery set says.
const headerIconOf = (found) => found.units.find((each) => each.kind === "icon" && found.boxes[each.box]?.kind === "header") ?? null;

/**
 * A report's name and icon kept in step with its page's (the hand-in's; the editor does the same when
 * the reader renames the report or changes its icon, service.mjs retitle and reicon): the report's
 * title is its h1.doc-title. Its <title> takes it when it does not hold it already (words of
 * report.json's title that hold the h1's are not it: "销售报告（草稿）" does not hold "销售报告"
 * when the title was that): where it holds report.json's title once, that is replaced (as the
 * editor's retitle does), else the whole of it. report.json's title and icon are to be the page's
 * (the icon its header's, the one the editor finds as the page's: none when that is none, and one the
 * page holds no valid value in is left to the check). A header with no icon leaves report.json's as it
 * is (an icon left out is not one taken away: which is meant is the Agent's to say, and the hand-in
 * says so). { text, title: { from, to, page } or null (`page`: <title> written), icon: { from, to } or
 * { from, to: from, missing: true } (report.json's kept, the page showing none) or null }: what changes.
 */
export function inStep(source, metadata = null) {
  const document = parse(source, { sourceCodeLocationInfo: true });
  const main = findMain(document);
  const heading = main && findElement(main, (node) => matchesNode(node, PAGE.title));
  const name = heading?.sourceCodeLocation?.endTag ? textOf(source.slice(heading.sourceCodeLocation.startTag.endOffset, heading.sourceCodeLocation.endTag.startOffset)) : "";
  let text = source;
  let title = null;
  if (name) {
    const head = findElement(document, (node) => node.tagName === "head");
    const element = head && findElement(head, (node) => node.tagName === "title"); // not a drawing's
    const at = element?.sourceCodeLocation;
    const was = typeof metadata?.title === "string" ? metadata.title : null;
    let page = false;
    if (at?.startTag && at.endTag) {
      const shown = textOf(source.slice(at.startTag.endOffset, at.endTag.startOffset));
      const holds = was && was !== name && was.includes(name) ? shown.split(was).join("\u0000").includes(name) : shown.includes(name);
      if (!holds) {
        const splice = (was && was !== name && retitle(source, { from: was, to: name })) || { start: at.startTag.endOffset, end: at.endTag.startOffset, text: escapeText(name) };
        text = source.slice(0, splice.start) + splice.text + source.slice(splice.end);
        page = true;
      }
    }
    if (page || (was !== null && was !== name)) title = { from: was, to: name, page };
  }
  let icon = null;
  if (main && metadata && typeof metadata === "object") {
    const found = findUnits(source);
    const unit = headerIconOf(found);
    const value = unit ? iconValueOf(source.slice(unit.start, unit.end)) : null;
    const was = metadata.icon ?? null;
    if (!unit) icon = was === null ? null : { from: was, to: was, missing: true };
    else if (value !== null && value !== was) icon = { from: was, to: value };
  }
  return { text, title, icon };
}

/**
 * A report's header changed as gallery set changes it (src/cli/set.mjs), written into `source` as an
 * Agent writes it, the rest of the file as it is: `title`, the h1.doc-title's words (its inside
 * replaced whole, as the editor's renaming does), <title> kept in step as inStep keeps it (where it
 * holds the h1's words of before once, those replaced, else the whole of it); `icon`, the header's
 * div.doc-icon: its value written in it (its block id kept), one made right before the h1 on a line
 * of its own when there is none, or taken away with its line (null). Either left out (undefined) is
 * left as it is. { text, before: { title, icon } (the h1's words and the header's icon as they were) },
 * or { missing: true } for a page with no h1.doc-title in its main (no title to change, no place for an icon).
 */
export function headerChanged(source, { title, icon } = {}) {
  const heading = (text) => {
    const main = findMain(parse(text, { sourceCodeLocationInfo: true }));
    const found = main && findElement(main, (node) => matchesNode(node, PAGE.title));
    return found?.sourceCodeLocation?.endTag ? found.sourceCodeLocation : null;
  };
  const headerIcon = (text) => headerIconOf(findUnits(text));
  let at = heading(source);
  if (!at) return { missing: true };
  const was = textOf(source.slice(at.startTag.endOffset, at.endTag.startOffset));
  const unit = headerIcon(source);
  const before = { title: was, icon: unit ? iconValueOf(source.slice(unit.start, unit.end)) : null };
  let text = source;
  if (icon !== undefined && icon !== before.icon) {
    if (unit && icon === null) {
      const cut = removeLines(text, unit.start, unit.end);
      text = text.slice(0, cut.start) + text.slice(cut.end);
    } else if (unit) {
      const id = /\sdata-block-id="[^"]*"/.exec(/^<[^>]*>/.exec(text.slice(unit.start, unit.end))?.[0] ?? "")?.[0] ?? "";
      text = text.slice(0, unit.start) + iconMarkup(icon, id) + text.slice(unit.end);
    } else {
      const indent = lineIndent(text, at.startTag.startOffset);
      text = text.slice(0, at.startTag.startOffset) + iconMarkup(icon) + (indent === null ? "" : `\n${indent}`) + text.slice(at.startTag.startOffset);
    }
    at = heading(text);
  }
  if (title !== undefined) {
    text = text.slice(0, at.startTag.endOffset) + escapeText(title) + text.slice(at.endTag.startOffset);
    text = inStep(text, { title: was || null }).text;
  }
  return { text, before };
}

// What each rule of the conversion made of the element it names, in the words changeLines says it: so that
// an Agent that reads "rewritten in this file as the kit's markup" knows what its element is now, and
// tells the user (a revision of a document that has tables: its `<caption>` is a note line above the
// table now, its header cells highlighted). A rule with none here has nothing to tell (formula, step
// title, chart, loose words: the words it makes are the ones that were written).
const BECAME = {
  table: "a table is the kit's framed table",
  "header row": "a header row is a thead, its cells highlighted",
  caption: "a table's caption is a note line above it (p.doc-note)",
  figure: "a figure is the kit's card",
  picture: "a picture is the kit's picture block",
  details: "a details is the kit's disclosure",
  dialog: "a dialog is a detail card",
  aside: "an aside is a highlight panel",
  "task list": "a task list is the kit's to-do list",
  flowchart: "a marked list is a flowchart",
  sheets: "headings become tabs",
  bookmark: "a link card is a bookmark",
  alignment: "a text-align in a paragraph's or a heading's style is the kit's class",
  "display formula": "a display formula is the kit's math block",
  "card outside main": "a card outside main moved to main's end",
};

/**
 * What naturalize wrote in report file `file`, as the lines its writers print (gallery export,
 * add-block-ids.mjs, gallery check): the file (from the project's folder) and each rule with its lines,
 * said as rewritten in the file with nothing to fix (an Agent read "written as the kit's markup" as
 * nothing done to its file, and the line as nothing to do, in a dry run of the skill-only install),
 * one line for each note (a thing it dropped, a color it wrote as the nearest kit color, what it
 * kept on a code block's pre). Whether and what to read again is the Agent's to judge from these. `dryRun`:
 * what it would write; `pending`: what an export will write (gallery check, which writes nothing).
 */
export function changeLines(file, changes, { dryRun = false, pending = false } = {}) {
  const rules = new Map(); // rule -> its lines, in the order of the file
  for (const { rule, line } of changes) rules.set(rule, [...new Set([...(rules.get(rule) ?? []), line])]);
  const listed = [...rules].map(([rule, lines]) => `${rule} (line${lines.length > 1 ? "s" : ""} ${lines.join(", ")})`).join(", ");
  const shown = path.resolve(file); // as the system writes it: an Agent uses it as it is
  // What they are now, and that it is the markup that changed: tell the user of a document that was theirs.
  const became = [...rules.keys()].filter((rule) => BECAME[rule]).map((rule) => BECAME[rule]).join("; ");
  const now = `${became ? `; ${became}` : ""}; the words and numbers are unchanged`;
  return [
    pending ? `natural ${shown}: ${listed} not rewritten yet: the export rewrites them in this file as the kit's markup (nothing to fix)${now}`
      : `natural ${shown}: ${listed}${dryRun ? " would be" : ""} rewritten in this file as the kit's markup (nothing to fix)${now}`,
    ...changes.filter((change) => change.note).map(({ line, rule, note }) => `  line ${line}, ${rule}: ${note}`),
  ];
}

// ---------- what stays read-only ----------

const INLINE_TAGS = "strong, em, b, i, u, s, code, a, sub, sup and br, the kit's colors (doc-text-*, doc-highlight-*) and formulas";
// What a list of checkboxes the kit did not take in is to be written as.
const TODO_ADVICE = `write a to-do list as ul.${TODO} › li, li[${CHECKED}] for a checked item (a GFM task list, every item starting with its box, is made one unless the document's own style or script uses GFM's classes or the boxes)`;
// The spans in a text block that are not the kit's (a color, a highlight: doc-* classes alone).
const kitClasses = (node) => classesOf(node).every(kitNamespace);
const ownSpans = (node) => elements(node).flatMap((child) => [
  ...(child.tagName === "span" && !(only(child, ["class"]) && kitClasses(child)) ? [child] : []),
  ...ownSpans(child),
]);
// A picture in it.
const pictured = (node) => elements(node).some((child) => child.tagName === "img" || pictured(child));
// The pictures in it, in order.
const pictures = (node) => elements(node).flatMap((child) => (child.tagName === "img" ? [child] : pictures(child)));
// Whether `node` holds a drawing: an <svg> or a <canvas>.
const drawn = (node) => elements(node).some((child) => child.tagName === "svg" || child.tagName === "canvas" || drawn(child));
// A checkbox in it (a GFM task list's item that is not one of a list naturalize takes: partial).
const checkbox = (node) => elements(node).some((child) => (child.tagName === "input" && attr(child, "type")?.toLowerCase() === "checkbox") || checkbox(child));
// Why the text of `node` (a text block) is read-only, from the scan's `reason`: for a span, a style
// the kit has no format for when one of them has one (and no attribute but a kit class), else the
// report's own class or attribute.
const why = (reason, node) => {
  if (reason === "tag:img") return "a picture amid the words: give it a paragraph of its own";
  if (reason === "picture") {
    const wrong = pictures(node).map(cellPictureProblem).find(Boolean);
    return `a picture in a cell written another way${wrong ? ` (${wrong})` : ""}: the preview edits <img src="assets/<file>" alt="…" width="N"> (N pixels, or no width), no other attribute`;
  }
  if (reason === "tag:span") {
    const foreign = ownSpans(node).filter((span) => only(span, ["style", "class"]) && attr(span, "style") !== undefined && kitClasses(span))
      .map((span) => styled(attr(span, "style")).foreign).find(Boolean);
    if (foreign) return `a span with a style the kit has no format for (${foreign.join(", ")}): left as written`;
    return `a <span> with a class or attribute of the document's own (the preview edits ${INLINE_TAGS})`;
  }
  if (reason === "tag:input" && checkbox(node)) return `a checkbox amid the words: ${TODO_ADVICE}`;
  if (reason.startsWith("tag:") && BLOCK_LEVEL.has(reason.slice(4))) return `a block (<${reason.slice(4)}>) amid the words: give the words a paragraph of their own`;
  if (reason.startsWith("tag:")) return `<${reason.slice(4)}> amid the words (the preview edits ${INLINE_TAGS})`;
  if (reason === "comment") return "an HTML comment amid the words";
  if (reason === "markup") return "an element not closed in the file (the parser closed it)";
  if (reason === "mention") return 'a page block written another way: the preview edits only <a class="doc-link-mention" href="../<slug>/doc.html"><span class="doc-link-mention-icon"></span>title</a>, its title plain words, no other attribute';
  if (reason === "link") return "a javascript: or data: link";
  return reason;
};

// The containers whose words straight in them the preview cannot reach while they hold blocks too.
const HOLDERS = new Set([...LOOSE_HOLDERS, "details"]);

/**
 * The text of report `source` (its natural HTML made the kit's first: naturalize) that its preview
 * will leave read-only, each with why: ["line 12: <p>: …"]. Not what is the kit's own or inside a
 * whole block of the report's own (as naturalize leaves them alone), and not code. Words straight in
 * a container that holds blocks too, which naturalize left (a run with an element not closed in the
 * file, a container with a class of the report's own), and a table's caption, which the preview
 * does not edit, are among them, and so is a part a component package's manifest edits as text that
 * can be no text block, alone of what an instance holds. Never a failure: gallery check prints them
 * as notes.
 */
export function readOnlyTexts(source) {
  const document = parse(source, { sourceCodeLocationInfo: true });
  const main = findMain(document);
  if (!main) return [];
  const lineAt = (offset) => source.slice(0, offset).split("\n").length;
  const shown = new Map(); // a start tag's last offset -> its element, where the preview's editing reaches
  const notes = [];
  const loose = (node) => {
    if (HOLDERS.has(node.tagName) && node.sourceCodeLocation?.startTag && looseWords(node)) {
      notes.push({ line: lineAt(node.sourceCodeLocation.startOffset), text: `<${node.tagName}>: words straight in it, outside any paragraph: give them a <p> (the preview cannot reach them, nor move its blocks one by one)` });
    }
  };
  const reach = (node, stop = () => false) => {
    for (const child of elements(node)) {
      if (stop(child)) continue;
      const at = child.sourceCodeLocation?.startTag;
      if (at) shown.set(at.endOffset - 1, child);
      reach(child, stop);
    }
  };
  const visit = (node) => {
    for (const child of node.childNodes ?? []) {
      if (!child.tagName || SKIPPED.has(child.tagName)) continue;
      if (isInstance(child)) {
        reach(child, isSlot); // the scan locks nothing in its own region but a text part
        instanceSlots(child).forEach(visit); // and in its slots what it locks anywhere
        continue;
      }
      if (attr(child, "data-doc-chart") !== undefined || classesOf(child).some((name) => KIT_OWN.includes(name))) continue;
      if (wholeBlock(child)) continue;
      const at = child.sourceCodeLocation?.startTag;
      if (at) shown.set(at.endOffset - 1, child);
      // A display formula amid the words (the kit draws it on a line of its own, the preview cannot edit
      // the words); one alone but for a bare < or > in its TeX, which keeps it from being a formula, said so.
      const end = child.sourceCodeLocation?.endTag;
      if (TEXT_BLOCKS.has(child.tagName) && at && child.childNodes.some((text) => isText(text) && /\\\[|\$\$/.test(text.value))
        && !(end && child.childNodes.every(isText) && oneDisplayFormula(source.slice(at.endOffset, end.startOffset)))) {
        const angled = angledFormula(source.slice(at.endOffset, end ? end.startOffset : child.sourceCodeLocation.endOffset), Boolean(end));
        notes.push({ line: lineAt(at.startOffset), text: angled
          ? `<${child.tagName}>: the formula holds a bare < or >: write \\lt / \\gt (or &lt; / &gt;)`
          : `<${child.tagName}>: a display formula (\\[…\\] or $$…$$) amid the words: give it a paragraph of its own` });
      }
      if (child.tagName === "caption" && at && (hasWords(child) || elements(child).length > 0)) notes.push({ line: lineAt(at.startOffset), text: '<caption>: the preview cannot edit a table caption; write the line above the table as <p class="doc-note">' });
      loose(child);
      visit(child);
    }
  };
  loose(main);
  visit(main);
  const lists = new Set(); // the lists of checkboxes named: once each, not an item each
  for (const { at, reason } of scan(source).locks) {
    const node = shown.get(at);
    if (!node) continue;
    const list = reason === "tag:input" && node.tagName === "li" && checkbox(node) && node.parentNode?.sourceCodeLocation?.startTag ? node.parentNode : null;
    if (list && lists.has(list)) continue;
    if (list) lists.add(list);
    if (list) notes.push({ line: lineAt(list.sourceCodeLocation.startOffset), text: `<${list.tagName}>: checkboxes in its items: ${TODO_ADVICE}` });
    else notes.push({ line: lineAt(node.sourceCodeLocation.startOffset), text: `<${node.tagName}>: ${why(reason, node)}` });
  }
  return notes.sort((a, b) => a.line - b.line).map(({ line, text }) => `line ${line}: ${text}`);
}

// ---------- what the Agent is told ----------

/**
 * What report `source` (its natural HTML made the kit's first: naturalize) holds that the preview
 * takes otherwise than as its blocks, each with its line: ["line 40: <div class=\"kpi\"> is a whole
 * block: …"]. Each whole block (an element with a class of the report's own that is no text block
 * and none of the kit's elements, which naturalize leaves alone: the outermost alone, what is in one
 * being its own; not a drawing or a layout the report styles, which a whole block is for), a table's column widths (a colgroup's or its cols'), which the kit sets itself,
 * what a flowchart holds besides its steps, and a step whose first block is no paragraph (its title).
 * Not what is the kit's own, nor code; but a line or paragraph separator (U+2028, U+2029) anywhere
 * in the page's text, code and the kit's blocks too (a tool decoding escapes wrote it, and the page
 * shows it as an empty line; found testing the skill with Agents, 2026-10-26), a note at its line.
 * Never a failure: gallery check prints them as notes.
 */
export function writingNotes(source) {
  const document = parse(source, { sourceCodeLocationInfo: true });
  const main = findMain(document);
  if (!main) return [];
  const lineAt = (offset) => source.slice(0, offset).split("\n").length;
  const notes = [];
  // The report's own <style>s (in its head or its page), and whether one names a class in a selector.
  const sheets = [];
  const gather = (node) => {
    for (const child of node.childNodes ?? []) {
      if (child.tagName === "style") sheets.push((child.childNodes ?? []).map((text) => text.value ?? "").join(""));
      else gather(child);
    }
  };
  gather(document);
  const css = sheets.join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  const styled = (name) => new RegExp(`\\.${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(css);
  // A table's column widths: its colgroups' (written, or the parser's for cols written straight in
  // it), not the kit's own.
  const widths = (table) => {
    for (const group of elements(table).filter((child) => child.tagName === "colgroup" && attr(child, "data-doc-columns") === undefined)) {
      const sized = [group, ...elements(group)].filter((node) => attr(node, "width") !== undefined || /(?:^|;)\s*(?:min-|max-)?width\s*:/i.test(attr(node, "style") ?? ""));
      const where = (group.sourceCodeLocation ? group : elements(group)[0])?.sourceCodeLocation;
      if (sized.length && where) notes.push({ line: lineAt(where.startOffset), text: `<${group.sourceCodeLocation ? "colgroup" : "col"}> widths: the kit sizes columns itself; a merged table uses yours` });
    }
  };
  const visit = (node) => {
    for (const child of node.childNodes ?? []) {
      if (!child.tagName || SKIPPED.has(child.tagName)) continue;
      if (isInstance(child)) {
        instanceSlots(child).forEach(visit);
        continue;
      }
      if (attr(child, "data-doc-chart") !== undefined || classesOf(child).some((name) => KIT_OWN.includes(name))) continue;
      if (wholeBlock(child)) {
        const at = child.sourceCodeLocation;
        // Not one with no words and no picture in it (a host the report's own script draws in, a
        // drawing: its class is for that, and nothing in it would be a block of the reader's), nor
        // one whose class the file opens with a curly quote (class=”doc-…”: the kit's class read
        // with the quotes in it, which the checks fail as the cause, curlyQuoted).
        // Nor a layout or a drawing of the Agent's own, which a whole block is meant for: one holding an
        // <svg> or a <canvas>, or of a class the report's own <style> styles (`.layer-stack`); the
        // note is for words wrapped in a class of their own that were meant as ordinary blocks.
        const curly = curlyQuoted(source, child).some(({ name }) => name === "class");
        if (BLOCK_UNITS.has(child.tagName) && at?.startTag && !curly && (hasWords(child) || pictured(child)) && !drawn(child) && !classesOf(child).some(styled)) {
          // A list of checkboxes (GFM's classes on it, a partial task list): what the kit's to-do list is.
          const todo = (child.tagName === "ul" || child.tagName === "ol") && checkbox(child) ? `; for its checkboxes, ${TODO_ADVICE}` : "";
          notes.push({ line: lineAt(at.startOffset), text: `<${child.tagName} class="${attr(child, "class").trim()}"> is a whole block (整体块): the reader moves it whole and edits its words in place; right for a layout of yours that is no figure (a figure, a diagram or a timeline, goes in <figure class="doc-figure">); drop its class only if its contents were meant as ordinary blocks${todo}` });
        }
        continue; // what is in it is its own
      }
      if (child.tagName === "table") widths(child);
      // A flowchart's steps are its items: anything else in it stands outside every card.
      const stray = child.tagName === "ol" && classesOf(child).includes(FLOW) ? elements(child).find((node) => node.tagName !== "li" && node.sourceCodeLocation) : null;
      if (stray) notes.push({ line: lineAt(stray.sourceCodeLocation.startOffset), text: `<ol class="${FLOW}"> holds a <${stray.tagName}> outside its items: a flowchart's steps are its <li>s (what one holds after its words, a paragraph or a list, is that step's content)` });
      // A step whose first block (after its icon) is no paragraph: it has no title (one written the
      // short way, its own words first, has them).
      if (child.tagName === "ol" && classesOf(child).includes(FLOW)) {
        for (const step of elements(child).filter((node) => node.tagName === "li")) {
          const first = elements(step).find((node) => !classesOf(node).includes(ICON));
          const before = first ? step.childNodes.slice(0, step.childNodes.indexOf(first)) : [];
          if (first && first.tagName !== "p" && first.sourceCodeLocation && !before.some((node) => !classesOf(node).includes(ICON) && hasWords(node))) {
            notes.push({ line: lineAt(first.sourceCodeLocation.startOffset), text: `a step of <ol class="${FLOW}"> begins with a <${first.tagName}>: a step's first block is its title, a paragraph (<p><strong>…</strong></p>), the blocks after it its content` });
          }
        }
      }
      visit(child);
    }
  };
  visit(main);
  separators(main, (line, character) => notes.push({ line, text: `a ${SEPARATORS[character]} in the text: the page shows it as a break or an empty line, not as a character (a tool that decodes \\u2028 or \\u2029 escapes writes one); write the break the text means (<br>, a new paragraph, a new line in code) or take it out` }));
  return notes.sort((a, b) => a.line - b.line).map(({ line, text }) => `line ${line}: ${text}`);

  // A line or paragraph separator (U+2028, U+2029) in the page's text, code too, but for scripts and
  // styles (where JavaScript and JSON take it): `found(line, character)` once a text of the file.
  function separators(node, found) {
    for (const child of node.childNodes ?? []) {
      if (child.tagName === "script" || child.tagName === "style") continue;
      if (isInstance(child)) {
        instanceSlots(child).forEach((slot) => separators(slot, found));
        continue;
      }
      if (isText(child) && child.sourceCodeLocation && /[\u2028\u2029]/.test(child.value)) {
        const { startOffset, endOffset } = child.sourceCodeLocation;
        const raw = source.slice(startOffset, endOffset);
        const at = raw.search(/[\u2028\u2029]/); // written as a character (an entity of one: the text's start)
        found(lineAt(startOffset + Math.max(at, 0)), child.value.match(/[\u2028\u2029]/)[0]);
      }
      separators(child, found); // a <template>'s content none of it: the page does not show it
    }
  }
}

/**
 * The blocks of report `source` (as its preview shows it) that its own script keeps, each with the
 * names that keep it and its line: ["line 40: <figure> in 方法 kept by the script: .lo …"]. The
 * preview will not let the reader delete or convert such a block (units.mjs keepReferenced), so the
 * Agent learns it and renames a class the script does not select by (found testing the skill with
 * Agents, 2026-10-28: a script's row.lo kept a figure of class "lo" and its section, and nothing said so). A block
 * kept only for one it holds is left to that one's note. Never a failure: gallery check prints them as notes.
 */
export function scriptKept(source) {
  const lineAt = (offset) => source.slice(0, offset).split("\n").length;
  const raw = (node) => (isText(node) ? node.value : (node.childNodes ?? []).map(raw).join(""));
  const words = (node) => raw(node).replace(/\s+/g, " ").trim();
  const heading = (section) => elements(section).find((child) => /^h[1-6]$/.test(child.tagName));
  const notes = [];
  for (const unit of scan(source).units) {
    if (unit.keep?.reason !== "script" || !unit.keep.own) continue;
    let section = unit.node.parentNode;
    while (section && section.tagName !== "section") section = section.parentNode;
    const title = unit.tag === "section" && heading(unit.node) ? ` ${words(heading(unit.node))}` : "";
    const where = section?.tagName && heading(section) ? ` in ${words(heading(section))}` : "";
    notes.push({ line: lineAt(unit.elStart), text: `<${unit.tag}>${title}${where} kept by the script: ${unit.keep.names.join(", ")} (the reader cannot delete or convert it; rename any of these the script does not select it by)` });
  }
  return notes.sort((a, b) => a.line - b.line).map(({ line, text }) => `line ${line}: ${text}`);
}

// The separators a tool decoding escapes writes in a text, by what writingNotes calls them.
const SEPARATORS = { "\u2028": "line separator (U+2028)", "\u2029": "paragraph separator (U+2029)" };

function findMain(node) {
  return findElement(node, (element) => element.tagName === "main");
}

// The first element under `node` (itself included) that `test` says yes to, in document order.
function findElement(node, test) {
  if (node.tagName && test(node)) return node;
  for (const child of node.childNodes ?? []) {
    const found = findElement(child, test);
    if (found) return found;
  }
  return null;
}
