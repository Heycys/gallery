import bookmark from "./bookmark.mjs";
import callout from "./callout.mjs";
import chart from "./chart.mjs";
import code from "./code.mjs";
import columns from "./columns.mjs";
import database from "./database.mjs";
import details from "./details.mjs";
import diff from "./diff.mjs";
import dialog from "./dialog.mjs";
import divider from "./divider.mjs";
import embed from "./embed.mjs";
import figure from "./figure.mjs";
import file from "./file.mjs";
import heading from "./heading.mjs";
import highlight from "./highlight.mjs";
import icon from "./icon.mjs";
import image from "./image.mjs";
import installed from "./installed.mjs";
import list from "./list.mjs";
import math from "./math.mjs";
import mention from "./mention.mjs";
import page from "./page.mjs";
import paragraph from "./paragraph.mjs";
import quote from "./quote.mjs";
import section from "./section.mjs";
import sheets from "./sheets.mjs";
import state from "./state.mjs";
import table from "./table.mjs";
import text from "./text.mjs";
import widget from "./widget.mjs";
import { attr, elementsOf, walk } from "../html-tree.mjs";
import { ATTRIBUTE, INSTANCE, SLOT, SLOT_PART } from "./installed.mjs";

// The kit's components as every system sees them (docs/internals.md, "Components"): what each is
// in a report's markup, one plain-data description each, shared by the kit (how it runs), the
// checks and the build (src/render/), and the editor (src/editor/). What is no fact of the markup
// stays with its system: how a component is drawn (src/render/kit/), what files it loads
// (src/render/assets.mjs, by the ids in `assets`), how it is edited (src/editor/components/).
//
//   id        the component's name (an editor component of the same name edits it)
//   category  what kind of block it is (CATEGORIES below); none for the page, inline marks and
//             behaviors (bindings)
//   within    the category of the block it lives in, for what is a block's content (a chart is a
//             card's)
//   media     a media block (图片, 文件, 网页书签, 嵌入): a card of one picture, file, page or frame with
//             a caption of its own kind under it, made from an empty block and empty until filled; the
//             editor and the server take their names from these (MEDIA_BLOCKS below)
//   pending   what is still to change for it to be fully of its category
//   match     where it is in a report: a selector of the grammar below (comma for several)
//   assets    the shared assets it needs (src/render/assets.mjs)
//   uses      when a report uses it, besides its match: patterns of the report's text (its asset
//             tags, comments and the text of code samples taken out: render/assets.mjs
//             usedAssets). Broad on purpose: a false match only keeps an asset
//   parts     its structure, by name: { at, edit, optional?, min?, max?, groups? }. at: ":scope > a > b"
//             (children, step by step), one compound selector (any descendant), or a list of those
//             with commas, * any element in either; edit: "text" (its text is written), "flow" (it
//             holds blocks) or "none" (the kit's own UI)
//   flow      the elements of it that are flows (a selector, a list of them with commas): blocks stand
//             in them straight, whatever they are (the page, a section, a summary and a panel). A
//             part that is edited as "flow" is one too, and needs no `flow` of its own. Where a flow
//             is spelled out, it is taken from here (FLOWS below)
//   groups    false where a plain <div> without a class in the flow is a block of its own, not a
//             group of blocks (the page and a Sheet panel: on the component, or on the part)
//   pairs     parts that go together by an attribute's value: { a, attrA, b, attrB }
//   only      the parts that are all an instance holds: no other element child (columns: only
//             its columns)
//   empty     an instance holding nothing at all is valid: a placeholder the page editor keeps (a
//             media block not filled yet), which the kit shows to no reader
//   shares    a part's share of the instance, a custom property in its style attribute: { part,
//             property, min }. Written on every element of the part or on none, each from min to
//             1 (columns: their widths, laid out in proportion)
//   frame, lead, header, title, tail   other elements of a component (a table's frame and the scope
//             line above it, the page's header and the title in it, small
//             text's end part): selectors
//   attrs     the attributes an author (an Agent, the editor) writes: { name: what it says }
//   classes   the classes an author writes
//   wholes    those of `classes` that are a whole block of their own, as the editor takes them (the reading
//             state: a filter, its row, the fields, the list of what was kept; the rest are parts)
//   fills     attributes the kit gives an instance when it starts: { selector: [names] } (":host"
//             is the instance itself); the author need not write them
//   runtime   what the kit leaves on the page, which an export of the current view takes off
//             again (DocKit.dehydrate; the copy's kit makes it again):
//             generated  nodes it adds (selectors)
//             attrs      attributes it sets: { selector: [names] }
//             classes    classes it sets: { selector: [names] }
//             root       { attrs, classes } on <html>
//             and what it leaves that stays:
//             state      marks that show reading state (a Sheet chosen, the theme): { selector:
//                        [names] }, "html" for <html>
//             internal   names used only inside what it generates ("doc-chart-*": a prefix)
//
// Only tag, .class, [attr] and [attr=value] make a compound selector, a class and an unquoted value
// being what CSS calls an identifier and a quoted value one line with no backslash, so the same string
// finds an element in the browser (Element.matches, querySelectorAll) and in a parsed source
// (matchesNode below, on parse5's tree).

export const COMPONENTS = [
  page, text, mention, // the page; inline marks, links shown with their icon
  paragraph, heading, list, quote, code, divider, math, // basic blocks
  section, highlight, callout, details, dialog, sheets, table, columns, // containers
  figure, chart, image, file, bookmark, embed, // cards (a figure: a chart or a drawing of the report's own; an image, a file, a bookmark, an embed)
  widget, diff, database, icon, installed, // whole blocks (the page's icon one, in the header; a database; an instance of a component package)
  state, // reading state, bound to blocks of any kind
];

/** The media blocks (a description's `media`), by id: image, file, bookmark, embed. */
const media = COMPONENTS.filter((component) => component.media);
export const MEDIA_BLOCKS = media.map((component) => component.id);
/** The class of each media block's figure, by id (doc-image, …). */
export const MEDIA_CLASS = Object.fromEntries(media.map((component) => [component.id, parseCompound(component.match).classes[0]]));
/** The id of the media block an element is (image, file, bookmark or embed), or null. */
export const mediaBlockOf = (element) => MEDIA_BLOCKS.find((id) => element?.classList?.contains(MEDIA_CLASS[id])) ?? null;

/**
 * The four kinds of block (docs/internals.md, "Components"), by what the reader does with one in
 * the live preview:
 *
 *   block      基础块: text edited as text, made and turned into another type on the page, split and
 *              merged, moved, deleted, copied
 *   container  容器块: holds basic blocks, which are edited as anywhere; moved and deleted as a whole
 *   card       卡片块: a figure, framed (a chart, a drawing, a timeline or a diagram of the report's
 *              own; a picture, a file, a bookmark, an embedded page): moved and resized as a whole,
 *              its title and caption edited, its inside its own
 *   whole      整体块: a layout of the report's own that is no figure (a strip of metrics, a panel,
 *              controls), or the kit's: free inside (the report's markup, styles and script), moved
 *              as a whole, its words edited as words
 */
export const CATEGORIES = {
  block: { name: "基础块" },
  container: { name: "容器块" },
  card: { name: "卡片块" },
  whole: { name: "整体块" },
};

/** The events the kit sends or listens for on window (or a table). */
export const EVENTS = {
  "doc-theme-change": "the theme shown changed (ui.js): the reader chose one, the workbench asked for one, or the system's changed while none is chosen",
  "doc-theme-request": "a workbench asks for a theme (ui.js listens)",
  "doc-look-request": "the document's look is asked of the page (字体与布局: the page's session for the workbench, the preview's live reload for doc.json written again; ui.js puts it on <html>, src/shared/document-look.mjs)",
  "doc-look-change": "the look the page shows changed (ui.js): the page editor's session tells the workbench",
  "doc-wide-follow": "the page's 宽表格 or 宽多维表格 flipped in the workbench (the page editor's session, `look` with `follow`): the editor takes every table's (database's) own data-doc-wide away, one undo step",
  "doc-layout-change": "a card's size changed where widths do not tell (the editor, a custom page's canvas), or the document's look changed (ui.js)",
  "doc-workspace-change": "what the workspace holds changed, the kind its detail (the page's live script, as the server's \"data <kind>\" says it): the kit tells the instances that hear data and read that kind",
  "doc-todo-set": "a block's context.workspace.setTodo asks whoever shows the page to check a to-do of a document (cancelable: a custom page's board or a document's editor cancels it and answers from the workspace's service)",
  "doc-open-request": "a block's context.workspace.open asks to open a document or a custom page (cancelable: the page's session for the workbench answers it, else the kit goes there)",
  "doc-editable": "the page takes what a component writes from now on (the editor)",
  "doc-component-edit": "a component's context.edit asks to write a part: the editor cancels it to say it took the edit, the kit writing no file (on the instance)",
  "doc-flush": "the page editor asks a database to write what its drawing holds back unwritten, at once, before it returns: before an undo or a redo, a close or a hide (on the database)",
  "doc-holding": "a database's drawing holds back what it has not written (detail true) or no longer (false): the page counts it as unsaved, is not shown again meanwhile, and asks doc-flush for it (on the database, bubbling)",
  "doc-table-intent": "a view's context.table() asks to change the table it reads (set a cell, move, add or take out a row), or whether it would take such a change now (canEdit, op check): the editor cancels it to say it made the change (or would), one undo step, the kit writing nothing (on the instance)",
  "doc-settings-changed": "what gallery.json says of the components changed (the page's event stream, its settings line: hidden, disabled, shown, the consents to the net, unlisted, the packs off and listed): the editor's menus follow it, and the kit starts again an instance whose block's consent changed (runtime/net.js)",
  "doc-net-fetch": "a block's context.fetch asks whoever serves the page to fetch for it (runtime/net.js sends it; the server's live script cancels it and answers from its net route)",
  "doc-net-consent": "a block's 允许访问 asks the reader to let it online (runtime/net.js sends it; the page's session cancels it and the workbench opens its consent dialog)",
  "doc-export-copy-done": "导出当前视图副本 finished (ui.js)",
  "doc-table-sort": "a table's sort changed (tables/, on the table)",
  "doc-table-sort-edit": "a press on a header's sort arrow on a page that holds the file's order (html[data-ge-order=file]) asks for the rows in the order it gives (detail.rows, detail.direction; tables/sort.js sends it on the table): the page editor cancels it to say it wrote them as an edit, one undo step",
  "doc-jump-request": "演示视图 asks the kit to go to a block of its own page, a step of the history (runtime/reveal.js listens, editor/page/present-links.mjs sends)",
};

/**
 * The flows of a report (docs/render.md, "Flows"): the elements blocks stand in straight — the page,
 * a Sheet panel, the content of a section, a summary, a highlight panel, a disclosure, a detail card
 * and a column — as selectors of the grammar below, in the order of the components. The checks
 * (component-checks.mjs) and the formulas (kit/math.js) take their flows from here; styles/flow.css,
 * where a stylesheet cannot import them, spells the same list once (components.mjs holds it to this).
 * GROUPING_FLOWS are those a plain <div> without a class groups blocks in.
 */
const flowList = COMPONENTS.flatMap((component) => [
  ...(component.flow ? component.flow.split(",").map((selector) => ({ selector: selector.trim(), groups: component.groups !== false })) : []),
  ...Object.values(component.parts ?? {}).filter((part) => part.edit === "flow").map((part) => ({ selector: part.at.split(">").at(-1).trim(), groups: part.groups !== false })),
]);
export const FLOWS = Object.freeze(flowList.map((flow) => flow.selector));
export const GROUPING_FLOWS = Object.freeze(flowList.filter((flow) => flow.groups).map((flow) => flow.selector));
/**
 * Every element blocks stand straight in, as one selector: the flows, and a plain <div> grouping
 * blocks in one of GROUPING_FLOWS; styles/flow.css spells the same list. The page editor and the kit's
 * runtime (given it by the build, __COMPONENT_BLOCK_FLOWS__) read by it which items keep a line of
 * their own (list.mjs keepsLine).
 */
export const FLOW_BLOCKS = `${FLOWS.join(", ")}, :is(${GROUPING_FLOWS.join(", ")}) > div:not([class])`;

/**
 * What the kit's runtime reads of the descriptions (runtime/kernel.js): where each component's
 * instances are (`match`) and what it leaves on the page (`runtime`), of the components that say
 * either. /kit/runtime.js carries these alone (assets.mjs, `define`), so an export holds no prose.
 * A field the kernel starts reading is added to RUNTIME_FIELDS (tests/unit/runtime.mjs checks it):
 * `needs`, what a custom block uses (its context.workspace), which only a package describes (no
 * component of the kit has it, so the runtime carries none).
 */
export const RUNTIME_FIELDS = ["match", "runtime", "schema", "needs"];
// The parts of a component of the kit's whose drawing writes some (`edit: "data"`: a database's JSON and
// table), which its context reads and writes as a package's do (runtime/kernel.js); a package's parts its
// catalog tells, and no other component's are carried.
const writesData = (component) => Object.values(component.parts ?? {}).some((part) => part.edit === "data");
export const runtimeDescriptions = (components = COMPONENTS) => components
  .filter((component) => RUNTIME_FIELDS.some((field) => component[field] !== undefined))
  .map((component) => Object.fromEntries([["id", component.id], ...RUNTIME_FIELDS.filter((field) => component[field] !== undefined).map((field) => [field, component[field]]), ...(writesData(component) ? [["parts", component.parts]] : [])]));

export const componentOf = (id) => COMPONENTS.find((component) => component.id === id) ?? null;

// ---------- selectors ----------

/** Throws what is wrong with a selector of the grammar: a compound, a list of them, or a chain of them (":scope > a > b"; * any element). */
export const parseSelector = (selector) => selector.split(",").forEach((one) => one.split(">").map((step) => step.trim()).filter((step) => step !== ":scope" && step !== "*").forEach(parseCompound));

// A part's `at` as its pieces, each its steps: [":scope", "a", "b"], or one compound alone.
const piecesOf = (at) => at.split(",").map((piece) => piece.split(">").map((step) => step.trim()));

/** Throws what is wrong with a part's `at`, read as partOf reads it: a list of chains from :scope and compounds, * any element. */
export function parsePart(at) {
  for (const [first, ...steps] of piecesOf(at)) {
    if ((first === ":scope") !== (steps.length > 0)) throw new Error(`part "${at}": write ":scope > a > b" or one compound selector`);
    for (const step of first === ":scope" ? steps : [first]) if (step !== "*") parseCompound(step);
  }
}

// What stops a compound at `rest`, in what a writer can act on: a descendant, which the grammar has no
// step for, and an attribute's value that needs its quotes first.
function compoundFault(rest) {
  if (/^\s/.test(rest)) return "one element, with no space in it: write each step with > (:scope > a > b), or the last step alone, which finds it at any depth";
  const value = /^\[([a-z][a-z0-9-]*)=([^"'\]]+)\]/.exec(rest);
  if (value) return `write its value in quotes: [${value[1]}="${value[2]}"]`;
  return "only tag, .class, [attr] and [attr=value]";
}

/** "figure.doc-figure[data-surface=bounded]" -> { tag, classes, attrs }. */
export function parseCompound(selector) {
  const out = { tag: null, classes: [], attrs: [] };
  let rest = selector.trim();
  const tag = /^[a-z][a-z0-9]*/.exec(rest);
  if (tag) {
    out.tag = tag[0];
    rest = rest.slice(tag[0].length);
  }
  while (rest) {
    let found;
    if ((found = /^\.(-?[A-Za-z_][A-Za-z0-9_-]*)/.exec(rest))) out.classes.push(found[1]);
    else if ((found = /^\[([a-z][a-z0-9-]*)(?:=(?:"([^"\\\n\r\f]*)"|'([^'\\\n\r\f]*)'|(-?[A-Za-z_][A-Za-z0-9_-]*)))?\]/.exec(rest))) out.attrs.push({ name: found[1], value: found[2] ?? found[3] ?? found[4] ?? null });
    else throw new Error(`selector "${selector}": ${compoundFault(rest)}`);
    rest = rest.slice(found[0].length);
  }
  if (!out.tag && out.classes.length === 0 && out.attrs.length === 0) throw new Error(`empty selector "${selector}"`);
  return out;
}

/** Whether a parsed element (parse5: { tagName, attrs }) matches a selector of the grammar above. */
export function matchesNode(node, selector) {
  if (!node?.tagName) return false;
  return selector.split(",").some((part) => {
    if (part.trim() === "*") return true;
    const { tag, classes, attrs } = parseCompound(part);
    if (tag && node.tagName !== tag) return false;
    const own = (attr(node, "class") ?? "").split(/\s+/);
    return classes.every((name) => own.includes(name))
      && attrs.every(({ name, value }) => attr(node, name) !== undefined && (value === null || attr(node, name) === value));
  });
}

/** Whether a parsed node is an instance of a component package (installed.mjs): asked of every element by every walk, so by its attribute first, which few have. */
export const isInstance = (node) => attr(node, ATTRIBUTE) !== undefined && matchesNode(node, INSTANCE);

/** Whether a parsed node is a slot of an instance (installed.mjs SLOT): a block-level div or section marked so, wherever it stands. */
export const isSlot = (node) => attr(node, SLOT) !== undefined && matchesNode(node, SLOT_PART);

// The nearest edge of a region around a parsed node (an instance or a slot, itself left out), or null.
const edgeAround = (node) => {
  let around = node.parentNode;
  while (around && !(isInstance(around) || isSlot(around))) around = around.parentNode;
  return around ?? null;
};

/**
 * The instance whose own region a parsed node stands in, or null where it is the document's: the rule
 * of installed.mjs heldBy, on parse5's tree (the edges folded from the outermost in: an instance's own
 * slot opens the document's again, what stands in a component's region stays its).
 */
export function heldByNode(node) {
  const edge = edgeAround(node);
  if (!edge) return null;
  const owner = heldByNode(edge);
  if (isInstance(edge)) return owner ?? edge;
  return owner !== null && edgeAround(edge) === owner ? null : owner;
}

/**
 * Every slot of an instance's own markup, in document order (none of an instance in it, none in
 * another slot), whatever its name: what the checks hold to its manifest.
 */
export function ownSlots(instance) {
  const found = [];
  const look = (node) => {
    for (const child of elementsOf(node)) {
      if (isSlot(child)) found.push(child);
      else if (!isInstance(child)) look(child);
    }
  };
  look(instance);
  return found;
}

/** The slots of an instance, the first of each name: where what it holds is the document's (a second of a name is a failure of the checks). */
export function instanceSlots(instance) {
  const named = new Set();
  return ownSlots(instance).filter((slot) => !named.has(attr(slot, SLOT)) && named.add(attr(slot, SLOT)));
}

/**
 * How a walk (html-tree.mjs) goes through what is the document's own: it stops at an instance of a
 * component package and goes on in its slots, never handing a slot itself to the visit (its tag is
 * the component's, what it holds the document's).
 */
export const BODY = Object.freeze({ stop: isInstance, through: instanceSlots });

/** A part's elements in a parsed host, each once, in document order. */
export function partOf(host, at) {
  const pieces = piecesOf(at);
  const chains = pieces.filter(([first]) => first === ":scope");
  const chain = ([, ...steps]) => steps.reduce((nodes, step) => nodes.flatMap((node) => elementsOf(node).filter((child) => matchesNode(child, step))), [host]);
  if (pieces.length === 1 && chains.length === 1) return chain(pieces[0]);
  const chained = new Set(chains.flatMap(chain));
  const anywhere = pieces.filter(([first]) => first !== ":scope").map(([first]) => first).join(",");
  const found = [];
  walk(host, (element) => { if (chained.has(element) || (anywhere && matchesNode(element, anywhere))) found.push(element); });
  return found;
}

/**
 * Each instance of a component in a parsed tree, in document order. What stands in an instance of a
 * component package is its component's and no other's, but for what its slots hold, which is the
 * document's (BODY), and such an element is of its own package alone, whatever class it carries.
 */
export function instancesOf(root, component) {
  const found = [];
  if (component.match) walk(root, (element) => { if (matchesNode(element, component.match) && (!isInstance(element) || attr(element, ATTRIBUTE) === component.id)) found.push(element); }, BODY);
  return found;
}

// ---------- vocabulary ----------

const namesIn = (selector) => [
  ...[...selector.matchAll(/\[([a-z][a-z0-9-]*)/g)].map((found) => found[1]),
  ...[...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map((found) => found[1]),
];

/**
 * The names of the kit's markup, by who writes them: `authoring` (attributes and classes an author
 * writes, with the components that say so), `runtime` (what the kit sets or generates), and
 * `isInternal(name)` (names inside what it generates).
 */
export function vocabulary(components = COMPONENTS) {
  const authoring = new Map();
  const runtime = new Map();
  const internal = [];
  const add = (map, name, id) => map.set(name, [...new Set([...(map.get(name) ?? []), id])]);
  for (const component of components) {
    Object.keys(component.attrs ?? {}).forEach((name) => add(authoring, name, component.id));
    (component.classes ?? []).forEach((name) => add(authoring, name, component.id));
    const marks = component.runtime ?? {};
    for (const selector of marks.generated ?? []) namesIn(selector).forEach((name) => add(runtime, name, component.id));
    for (const names of [...Object.values(marks.attrs ?? {}), ...Object.values(marks.classes ?? {}), marks.root?.attrs ?? [], marks.root?.classes ?? [], ...Object.values(marks.state ?? {})]) {
      names.forEach((name) => add(runtime, name, component.id));
    }
    internal.push(...(marks.internal ?? []));
  }
  const isInternal = (name) => internal.some((entry) => (entry.endsWith("*") ? name.startsWith(entry.slice(0, -1)) : name === entry));
  return { authoring, runtime, isInternal };
}

// ---------- checks ----------

/** What is wrong with the descriptions (an empty list when nothing): checked by kit:check. */
export function componentProblems(components = COMPONENTS) {
  const problems = [];
  const ids = components.map((component) => component.id);
  for (const id of new Set(ids.filter((id, index) => ids.indexOf(id) !== index))) problems.push(`component "${id}" is listed twice`);
  for (const component of components) {
    try {
      if (component.match) parseSelector(component.match);
      if (component.flow) parseSelector(component.flow);
      for (const name of ["frame", "lead", "header"]) if (component[name]) parseSelector(component[name]);
      for (const part of Object.values(component.parts ?? {})) parsePart(part.at);
      for (const selector of [...(component.runtime?.generated ?? []), ...Object.keys(component.runtime?.attrs ?? {}), ...Object.keys(component.runtime?.classes ?? {}), ...Object.keys(component.runtime?.state ?? {}), ...Object.keys(component.fills ?? {})]) parseSelector(selector);
    } catch (error) {
      problems.push(`component "${component.id}": ${error.message}`);
    }
    if (component.parts && !component.match) problems.push(`component "${component.id}" has parts but no match`);
    for (const field of ["category", "within"]) {
      if (component[field] !== undefined && !(component[field] in CATEGORIES)) problems.push(`component "${component.id}": ${field} "${component[field]}" is no category (${Object.keys(CATEGORIES).join(", ")})`);
    }
    if (component.category && component.within) problems.push(`component "${component.id}" is a block of its own or a block's content, not both`);
    for (const [name, part] of Object.entries(component.parts ?? {})) {
      if (!["text", "flow", "data", "none"].includes(part.edit)) problems.push(`component "${component.id}": part "${name}" edits as "${part.edit}" (text, flow, data or none)`);
    }
    for (const { a, b } of component.pairs ?? []) {
      for (const name of [a, b]) if (!component.parts?.[name]) problems.push(`component "${component.id}" pairs an unknown part "${name}"`);
    }
    for (const name of [...(component.only ?? []), ...(component.shares ? [component.shares.part] : [])]) {
      if (!component.parts?.[name]) problems.push(`component "${component.id}" names an unknown part "${name}"`);
    }
    if ((component.assets ?? []).length > 0 && !(component.uses ?? []).length) problems.push(`component "${component.id}" needs assets but nothing tells when a report uses it (uses)`);
  }
  const { authoring, runtime } = vocabulary(components);
  for (const [name, owners] of authoring) {
    if (owners.length > 1) problems.push(`"${name}" is described by several components: ${owners.join(", ")}`);
    if (runtime.has(name)) problems.push(`"${name}" is written by authors (${owners.join(", ")}) and by the kit (${runtime.get(name).join(", ")})`);
  }
  // What the kit fills in is an author's to write as well, or no name of the kit's at all.
  for (const component of components) {
    for (const name of Object.values(component.fills ?? {}).flat()) {
      if (/^(data-|doc-)/.test(name) && !authoring.has(name)) problems.push(`component "${component.id}" fills "${name}", which no component says an author writes`);
    }
  }
  return problems;
}
