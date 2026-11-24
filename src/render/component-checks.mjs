import vm from "node:vm";
import { LINE_START, lineStart } from "../shared/code-lines.mjs";
import { currentCatalog, problemIn } from "../shared/component-catalog.mjs";
import { BODY, COMPONENTS, FLOWS, instanceSlots, instancesOf, isInstance, isSlot, matchesNode, ownSlots, partOf, vocabulary } from "../shared/components/index.mjs";
import { ATTRIBUTE, INSTANCE, PACKAGE_ID, SCHEMA, SLOT, schemaAhead } from "../shared/components/installed.mjs";
import { packageScript } from "../shared/export-wrap.mjs";
import { asDocName, kitNamespace } from "../shared/old-names.mjs";
import { shortSheets } from "../shared/components/sheets.mjs";
import { DATABASE_CLASS, PAGES_CLASS, databaseProblems, problemSaid, slotRecord } from "../shared/database.mjs";
import { databaseReading, databaseWarnings, jsonErrorLine, problemPlaces } from "./database-checks.mjs";
import { attr, curlyQuoted, hasClass, walk } from "../shared/html-tree.mjs";
import { packageText, packagesOf } from "./package-files.mjs";
import { lineAt, parseReport } from "./report-tree.mjs";

// What a report's markup says of the kit's components, checked against their descriptions
// (src/shared/components/; docs/render.md, "Build pipeline"):
//
//   - each instance has the parts it needs, as many as it may (a dialog's title and content, a
//     Sheet area's tabs and panels), and parts that go together pair (each tab its panel);
//   - every data-doc-* attribute and doc-* class is one the kit says an author writes: not a
//     mark the kit sets itself, not a name it does not know (a misspelling, or a report's own
//     class named like the kit's, which the editor would take for the kit's);
//   - what is bound makes sense: data-doc-bind on an element that can hold a key, and every
//     key data-doc-show reads bound by something;
//   - first of all, no attribute's value is opened with a curly quote (“ or ”), which HTML reads as
//     part of the value: the cause said before the failures it makes;
//   - an instance of a component package stands on what can be one and names a package; of one the
//     workspace holds it has the parts its manifest says, as a kit component has, and of one it does
//     not hold, or cannot load, there is nothing to check it by: a note says so and why
//     (componentNotes), never a failure; a package it uses has a script a browser can read.
//     What stands in an instance is its component's: none of the above goes into one (`instancesOf`,
//     `walk` with `stop`) but the kit's own names, doc-* and data-doc-*, closed there too.

const { authoring, runtime } = vocabulary();
const BINDABLE = "input, select, textarea, button, details, table";
const lineOf = (node) => node.sourceCodeLocation?.startLine;
const at = (node) => (lineOf(node) ? ` (line ${lineOf(node)})` : "");

// The author's name nearest a misspelled one, if one is near.
function nearest(name) {
  const distance = (a, b) => {
    const row = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i++) {
      let previous = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const kept = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
        previous = kept;
      }
    }
    return row[b.length];
  };
  const [best] = [...authoring.keys()].filter((candidate) => candidate.startsWith(name.slice(0, 7))).map((candidate) => [candidate, distance(name, candidate)]).sort((a, b) => a[1] - b[1]);
  return best && best[1] <= 3 ? ` (${best[0]}?)` : "";
}

// A part's shares of its instance (columns: their widths), a custom property in each element's
// style attribute: on every one or on none, each a number from `min` to 1. The kit lays them out
// in proportion (the editor writes them adding up to 1).
function shareFailures(component, host, elements) {
  const { part, property, min } = component.shares;
  const pattern = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]*)`);
  const values = elements.map((node) => pattern.exec(attr(node, "style") ?? "")?.[1].trim() ?? null);
  const given = values.filter((value) => value !== null);
  if (given.length === 0) return [];
  const where = `${component.id}${at(host)}`;
  if (given.length < values.length) return [`${where}: ${property} on ${given.length} of its ${values.length} ${part}: write it on every one of them, or on none (equal widths)`];
  const numbers = given.map(Number);
  if (numbers.some((value) => !Number.isFinite(value) || value < min - 1e-9 || value > 1)) return [`${where}: ${property} is a share of the row, a number from ${Math.round(min * 1000) / 1000} to 1 (${given.join(", ")})`];
  return [];
}

// Names the kit had and gave up, with what is written instead.
const GONE = {
  "doc-dialog-header": "a detail card has no header: its content region (<div class=\"doc-dialog-content\">) stands alone in its panel",
  "doc-dialog-title": "a detail card's title is an ordinary heading (<h3>), first in its content region",
  "doc-dialog-close": "a detail card has no close button: Esc and a press outside it close it",
  "data-doc-dialog-close": "a detail card has no close button: Esc and a press outside it close it",
  "doc-section-header": "a section's title is a plain heading (<h2>) with an ordinary paragraph below it for the line that says what the section is: no <div> goes around them",
  "doc-grid": "a card row is now columns: <div class=\"doc-columns\"> holding one <div class=\"doc-column\"> per card",
  "doc-grid-3": "a card row is now columns: <div class=\"doc-columns\"> holding three <div class=\"doc-column\">",
  "doc-lede": "write the line under the title as a paragraph of the header (an ordinary <p>), or as small text, <p class=\"doc-note\"): the header's lines read as the body's paragraphs",
  "doc-source": "write the line under the title as a plain paragraph of the header (an ordinary <p>), or as small text (<p class=\"doc-note\">): the header's lines read as the body's paragraphs",
  "doc-prose": "write the text straight in its flow (the page, a Sheet panel, a section, a panel, a column…): it reads the same there",
  "doc-prose-h1": "write an h1",
  "doc-prose-h2": "write an h2",
  "doc-prose-h3": "write an h3",
  "doc-prose-h4": "write an h4",
  "doc-state-grid": "put the groups side by side in columns (<div class=\"doc-columns\">)",
  "doc-state-group": "write the group's title as a heading and its controls as blocks of their own in a column",
  "doc-state-status": "write the line as small text, <p class=\"doc-note\">",
  "doc-code-block": "a code block is <div class=\"doc-code\"> holding its title (<div class=\"doc-code-title\">) and the <pre><code>",
  "doc-code-card": "a code block is <div class=\"doc-code\"> holding its title and its <pre>; a diff is <div class=\"doc-diff\">",
  "doc-code-header": "write the title as <div class=\"doc-code-title\">: the kit draws the rest of the header",
  "data-doc-diff": "a diff is <div class=\"doc-diff\"> holding its title and its options as JSON (sdk/doc-code.d.ts)",
  "data-doc-diff-stats": "the kit shows a diff's counts in its header: remove it",
  "doc-code--wrap": "a code block wraps its long lines by itself: remove it (doc-code--nowrap scrolls them instead)",
};

// A code block's own attributes, which the kit and the editor read on its <div class="doc-code">
// alone, with what to write where its pre or its code carries one (the export moves them from a pre
// written without its block: src/editor/source/natural.mjs).
const CODE_OWN = {
  [LINE_START]: 'write it on its <div class="doc-code">',
  "data-start": `write ${LINE_START} on its <div class="doc-code">`,
  "data-line-numbers": 'write it on its <div class="doc-code">',
  "data-folded-lines": 'write it on its <div class="doc-code">',
  "data-title": 'write the title in its <div class="doc-code-title">',
  "data-wrap": 'for long lines that scroll, write class="doc-code doc-code--nowrap" on its <div class="doc-code">',
};
// What of them a code block's pre, or its pre's code, carries; and its first line's number when it
// writes none.
function codeFailures(node) {
  const failures = [];
  const block = node.tagName === "pre" ? node.parentNode : node.tagName === "code" && node.parentNode?.tagName === "pre" ? node.parentNode.parentNode : null;
  if (block?.tagName && matchesNode(block, ".doc-code")) {
    for (const [name, instead] of Object.entries(CODE_OWN)) if (attr(node, name) !== undefined) failures.push(`${name}${at(node)} on the <${node.tagName}> of a code block does nothing: ${instead}`);
  }
  const first = node.tagName === "div" && matchesNode(node, ".doc-code") ? attr(node, LINE_START) : undefined;
  if (first !== undefined && lineStart(first) === null) failures.push(`${LINE_START}="${first}"${at(node)}: the number of a code block's first line is a whole number from 1`);
  return failures;
}

// The flows a block stands in straight (the components' descriptions say which: the page, a Sheet
// panel, a section, a panel, a disclosure's or a dialog's content, a column), and a plain div inside one.
const FLOW_SELECTOR = FLOWS.join(", ");
const inFlow = (node) => matchesNode(node.parentNode, FLOW_SELECTOR)
  || (node.parentNode?.tagName === "div" && !attr(node.parentNode, "class") && matchesNode(node.parentNode.parentNode, FLOW_SELECTOR));

// Attributes whose value the file opens with a curly quote (html-tree.mjs curlyQuoted): the cause of
// the failures that follow from them (a class or a key read with the quotes in it: a Sheet area with
// no tabs, a whole block of a class of the report's own), said first, the first in full, the others
// each with its line and what to write.
function curlyQuoteFailures(html, tree) {
  const found = [];
  walk(tree, (node) => found.push(...curlyQuoted(html, node)));
  const straight = (written) => written.replace(/=(\s*)[“”]/, '=$1"').replace(/[“”]$/, '"');
  return found.map(({ written, line }, index) => (index === 0
    ? `line ${line}: attribute ${written} uses curly quotes (U+201C/U+201D), which HTML reads as part of the value: write straight quotes, ${straight(written)}; an editor keeping a file's “…” style may change them`
    : `line ${line}: attribute ${written} uses curly quotes too: write ${straight(written)}`));
}

// The components an Agent writes as plain HTML, which the export makes the kit's (natural.mjs), with
// what to write: one that carries the kit's class without a part it needs is said in one line, to
// write the plain form, instead of each part it lacks (which led an Agent to write the kit's markup
// by hand, part by part).
const PLAIN = {
  details: "write a plain <details> without the class (its <summary>, then what it holds): the export makes it the kit's",
};
// A Sheet area in neither form (no row of tabs, no panel: shortSheets), or a bookmark's link the
// export did not make a card (a short form that is none): said in one line, with what to write.
const SHORT_SHEETS = "write a <section> of no attribute straight in it for each tab, starting with its heading (<h2>–<h4>), the tab's name, the rest its blocks, and nothing else: the export makes the kit's tabs";
const SHORT_BOOKMARK = 'a bookmark written the short way is a paragraph in a flow holding only <a class="doc-bookmark" href="https://…">its title</a> (a title attribute its description, nothing else on it, words alone in it): the export makes the card';

// The elements of a report that say they are an instance of a component package, what an instance
// holds apart but for what its slots hold, the document's.
function marked(tree) {
  const found = [];
  walk(tree, (node) => { if (attr(node, ATTRIBUTE) !== undefined) found.push(node); }, BODY);
  return found;
}

// The nearest instance or slot around a parsed node (itself left out), or null.
const edgeAround = (node) => {
  let around = node.parentNode;
  while (around && !(isInstance(around) || isSlot(around))) around = around.parentNode;
  return around ?? null;
};

// What is wrong with the slots of a report (data-doc-slot): a slot is a div or a section of an
// instance's own markup, no block of the document's and none of its parts, and its manifest's part
// edited as flow, one of each name (`packages`: the catalog's, by id, where it was read). A slot of an
// instance in another instance's own region is the outer component's, and none of the document's.
function slotFailures(tree, packages) {
  const failures = [];
  walk(tree, (node) => {
    const name = attr(node, SLOT);
    if (name === undefined) return;
    if (isInstance(node)) return void failures.push(`${SLOT}="${name}"${at(node)} on the instance itself: a slot is an element inside it`);
    // A record's body: a div straight in a database's pages (src/shared/database.mjs), named record:<id>.
    const pages = node.parentNode;
    if (pages?.tagName === "div" && hasClass(pages, PAGES_CLASS) && pages.parentNode?.tagName === "div" && hasClass(pages.parentNode, DATABASE_CLASS)) {
      if (node.tagName !== "div" || !slotRecord(name)) failures.push(`${SLOT}="${name}"${at(node)}: a slot in a database's div.${PAGES_CLASS} is a record's body, a <div data-doc-slot="record:<id>">, <id> its row's data-record (letters, digits, - and _)`);
      else if (attr(node, "data-block-id") !== undefined) failures.push(`${SLOT}="${name}"${at(node)}: a record's body is no block: it carries no data-block-id`);
      return;
    }
    if (!isSlot(node)) return void failures.push(`${SLOT}${at(node)} on a <${node.tagName}>: a slot is a block-level <div> or <section>`);
    const instance = edgeAround(node);
    const found = instance && isInstance(instance) ? packages?.get(attr(instance, ATTRIBUTE)) : null;
    if (!instance || !isInstance(instance) || (found && inParts(instance, found, node))) return void failures.push(`${SLOT}="${name}"${at(node)} stands outside any instance's own markup: a slot is a part of a component package's instance, written in its template`);
    if (attr(node, "data-block-id") !== undefined) failures.push(`${SLOT}="${name}"${at(node)}: a slot is no block: it carries no data-block-id`);
  });
  return failures;
}
const contains = (outer, node) => {
  for (let around = node.parentNode; around; around = around.parentNode) if (around === outer) return true;
  return false;
};
// Whether a slot of instance `host` stands in a part its package (`found`) edits as text or data: the component's to write, no slot.
const inParts = (host, found, slot) => Object.values(found.parts ?? {}).filter(({ edit }) => edit === "text" || edit === "data").some(({ at: where }) => partOf(host, where).some((part) => contains(part, slot)));
// The slots of an instance of a package, as the scan has them: of its own markup, none in such a part.
const slotsOfPackage = (host, found) => ownSlots(host).filter((slot) => !inParts(host, found, slot));

// What is wrong with how they say it: an instance is a block-level div or section, and names a package.
const instanceFailures = (instances) => instances.flatMap((node) => {
  if (!isInstance(node)) return [`${ATTRIBUTE}${at(node)} on a <${node.tagName}>: an instance of a component is a block-level <div> or <section>`];
  return PACKAGE_ID.test(attr(node, ATTRIBUTE)) ? [] : [`${ATTRIBUTE}="${attr(node, ATTRIBUTE)}"${at(node)} names no custom block: write <scope>/<name>, the id of a custom block of the workspace's components/ folder`];
});

// Databases (多维表格, shared/database.mjs), in the page and in templates alike: JSON that does not read is a
// failure (the drawing shows the database read-only and writes nothing until it is fixed); a table the
// format cannot hold is a note (read-only too, never rewritten: the Agent writes it in the format).
function databasesIn(tree) {
  const found = [];
  walk(tree, (node) => { if (node.tagName === "div" && hasClass(node, DATABASE_CLASS)) found.push(node); });
  return found;
}
const databaseFailures = (tree) => databasesIn(tree).flatMap((node) => databaseProblems(node).filter((problem) => problem.code === "json").map((problem) => {
  const stops = jsonErrorLine(node);
  return `database${at(node)}: ${problemSaid(problem)}${stops ? `, near line ${stops}` : ""}: it shows read-only, and no change of it is written, until the JSON reads (databases.md, "Read-only")`;
}));
/**
 * What makes each database of the report read-only, a note to act on first (pipeline.mjs notesByKind `fix`): each
 * problem at the line it stands on. The page refuses every edit of it until it is fixed.
 */
export function databaseFixes(tree) {
  return databasesIn(tree).flatMap((node) => {
    const problems = databaseProblems(node).filter((problem) => problem.code !== "json");
    const places = problemPlaces(node, problems);
    const placed = (problem) => {
      const where = places.get(`${problem.code}:${problem.detail ?? ""}`);
      return `${problemSaid(problem)}${where ? ` (${where})` : ""}`;
    };
    return problems.length === 0 ? [] : [`line ${lineOf(node)}: database read-only: ${problems.map(placed).join("; ")}: the page shows it read-only and refuses every edit of it; write its table as the format holds it (databases.md, "Read-only")`];
  });
}
// A note each of what a database holds that reads otherwise than written (database-checks.mjs: a view naming a
// column by its name, a filter's value of the wrong shape, a cell that is no value of its column…), at its line.
const databaseNotes = (tree) => databasesIn(tree).flatMap((node) => databaseWarnings(node).map(({ said, node: where }) => `line ${lineOf(where ?? node) ?? lineOf(node)}: database: ${said}`));

/** What each database of the report holds and each of its views shows (database-checks.mjs databaseReading), information, at its line; `options.wideLook`: the document's look draws its databases wide. */
export const databaseReadings = (tree, options = {}) => databasesIn(tree).map((node) => `line ${lineOf(node)}: ${databaseReading(node, options)}`);

/** The notes of a report's instances: each that names a package the workspace does not hold, or holds and cannot load, with why, and each in a shape its package does not reach, and of its databases that the format cannot hold */
export function componentNotes(tree) {
  return [...instanceNotes(tree), ...databaseNotes(tree)];
}

// The notes of its instances.
function instanceNotes(tree) {
  const instances = marked(tree).filter((node) => isInstance(node) && PACKAGE_ID.test(attr(node, ATTRIBUTE)));
  const catalog = instances.length > 0 ? currentCatalog() : null;
  return instances.flatMap((node) => {
    const id = attr(node, ATTRIBUTE);
    const found = catalog.packages.get(id);
    if (found && !schemaAhead(attr(node, SCHEMA), found.schema)) return [];
    if (found) return [`line ${lineOf(node)}: <${node.tagName} ${ATTRIBUTE}="${id}">: ${SCHEMA}="${attr(node, SCHEMA)}" is past the ${found.schema ?? 1} its package's manifest reads (schema): nothing can write it back, and the block shows read-only until the package reads it`];
    const problem = catalog.problems.get(id)?.problem;
    const why = problem ? `package ${id} does not load (${problemIn("en", problem)})` : `no package ${id} in this workspace (components/${id}/component.json)`;
    return [`line ${lineOf(node)}: <${node.tagName} ${ATTRIBUTE}="${id}">: ${why}: the block shows what it holds, read-only, and moves, copies and deletes whole`];
  });
}

// What is wrong with the names `node` carries, `closed` telling a class in the kit's namespace: one
// gone, one the kit sets itself, one it does not know.
function nameFailures(node, closed) {
  const failures = [];
  for (const { name, value } of node.attrs) {
    if (GONE[name] && !authoring.has(name)) {
      failures.push(`${name}${at(node)} is gone: ${GONE[name]}`);
      continue;
    }
    if (name.startsWith("data-doc-") && !authoring.has(name)) {
      failures.push(runtime.has(name) ? `${name}${at(node)} is the kit's to set: remove it` : `${name}${at(node)} is no attribute of the kit's${nearest(name)}`);
    }
    if (name === "class") {
      for (const token of value.split(/\s+/).filter(closed)) {
        if (authoring.has(token)) continue;
        if (GONE[token]) {
          failures.push(`class ${token}${at(node)} is gone: ${GONE[token]}`);
          continue;
        }
        failures.push(runtime.has(token) ? `class ${token}${at(node)} is the kit's to set: remove it` : `class ${token}${at(node)} is no class of the kit's${nearest(asDocName(token))}: give a class of the document's own a name of its own (not doc-…)`);
      }
    }
  }
  return failures;
}

// In an instance, where every other name is free, the kit's are doc-*: report-* is no name of it.
const closedInInstance = (name) => name.startsWith("doc-");

/** What a browser would say of a package's script, compiled as a page holds it (packageScript, on the file's lines) and never run, as no script of a package runs on the server: { message, line }, or null. */
export function scriptSyntax(code) {
  try {
    new vm.Script(packageScript(code), { filename: "kit.js" });
    return null;
  } catch (error) {
    const line = /^kit\.js:(\d+)/.exec(error.stack ?? "")?.[1];
    return { message: error.message, line: line ? Number(line) : null };
  }
}

// Kept by its stamp: every preview's checks come by, and a package holds still.
const compiled = new Map(); // a package's folder -> { stamp, failure }
function scriptFailure(found) {
  if (!found.files.includes("kit.js")) return null;
  if (compiled.get(found.folder)?.stamp !== found.stamp) {
    const code = packageText(found, "kit.js");
    const syntax = code === null ? null : scriptSyntax(code);
    const failure = code === null ? `${found.id}: its kit.js cannot be read` : syntax && `${found.id}: its kit.js does not run: ${syntax.message}${syntax.line ? ` (line ${syntax.line})` : ""}`;
    compiled.set(found.folder, { stamp: found.stamp, failure });
  }
  return compiled.get(found.folder).failure;
}

/**
 * The failures of a report's components, in source order (`tree`: the report parsed, read only;
 * `catalog`: the workspace's packages, read when it has an instance): the one check of whether a
 * component is valid, which gallery check and both of the server's exports run (pipeline.mjs).
 */
export function componentFailures(html, tree = parseReport(html), catalog = null) {
  const failures = curlyQuoteFailures(html, tree);
  failures.push(...databaseFailures(tree));
  const instances = marked(tree);
  failures.push(...instanceFailures(instances));
  const known = instances.length > 0 ? catalog ?? currentCatalog() : null;
  const packages = known ? [...known.packages.values()] : [];
  if (known) failures.push(...packagesOf(html, known, tree).map(scriptFailure).filter(Boolean));

  for (const component of [...COMPONENTS, ...packages].filter((entry) => entry.match && (entry.parts || entry.pairs))) {
    for (const host of instancesOf(tree, component)) {
      // One left empty where the component allows it (a media block's placeholder): nothing to check.
      if (component.empty && !(host.childNodes ?? []).some((node) => node.tagName || (node.nodeName === "#text" && node.value.trim()))) continue;
      const short = component.id === "sheets" ? shortSheets(host) : null;
      if (short) {
        failures.push(`${component.id}${at(host)} has no tabs and is no short form: ${short.why ?? "it stands where no block does (in a whole block or a figure)"}; ${SHORT_SHEETS}`);
        continue;
      }
      if (PLAIN[component.id] && Object.values(component.parts ?? {}).some((part) => partOf(host, part.at).length < (part.optional ? 0 : part.min ?? 1))) {
        failures.push(`${component.id}${at(host)} carries the kit's class without the kit's parts: ${PLAIN[component.id]}`);
        continue;
      }
      const found = {};
      for (const [name, part] of Object.entries(component.parts ?? {})) {
        if (part.edit === "flow" && PACKAGE_ID.test(component.id)) {
          // A package's slot, by its mark in the instance's own markup (none of an instance in it), one of each name.
          const slots = slotsOfPackage(host, component).filter((slot) => attr(slot, SLOT) === name);
          if (slots.length === 0 && !part.optional) failures.push(`${component.id}${at(host)} has no ${name} (${SLOT}="${name}")`);
          for (const extra of slots.slice(1)) failures.push(`${component.id}${at(extra)}: slot "${name}" twice`);
          found[name] = slots.slice(0, 1);
          continue;
        }
        found[name] = partOf(host, part.at);
        const min = part.optional ? 0 : part.min ?? 1;
        const max = part.max ?? Infinity;
        if (found[name].length < min) failures.push(`${component.id}${at(host)} has ${found[name].length === 0 ? "no" : `${found[name].length} of`} ${name} (${part.at.replace(":scope > ", "")})${found[name].length > 0 ? `, at least ${min}` : ""}`);
        else if (found[name].length > max) failures.push(`${component.id}${at(host)} has ${found[name].length} of ${name}, at most ${max}`);
      }
      if (component.only) {
        const parts = new Set(component.only.flatMap((name) => found[name]));
        for (const child of (host.childNodes ?? []).filter((node) => node.tagName && !parts.has(node))) {
          failures.push(`${component.id}${at(host)} holds a <${child.tagName}>${at(child)}: only its ${component.only.join(", ")} (${component.only.map((name) => component.parts[name].at.replace(":scope > ", "")).join(", ")}) go in it`);
        }
      }
      if (component.shares) failures.push(...shareFailures(component, host, found[component.shares.part]));
      if (PACKAGE_ID.test(component.id)) {
        const flows = Object.entries(component.parts ?? {}).filter(([, part]) => part.edit === "flow").map(([name]) => name);
        for (const slot of slotsOfPackage(host, component).filter((slot) => !flows.includes(attr(slot, SLOT)))) failures.push(`${component.id}${at(slot)}: slot "${attr(slot, SLOT)}" is no part of its manifest edited as flow`);
      }
      for (const { a, attrA, b, attrB } of component.pairs ?? []) {
        const keysA = found[a].map((node) => attr(node, attrA));
        const keysB = found[b].map((node) => attr(node, attrB));
        for (const key of new Set(keysA.filter((key, index) => keysA.indexOf(key) !== index))) failures.push(`${component.id}${at(host)}: ${a} "${key}" twice`);
        for (const key of keysA.filter((key) => !keysB.includes(key))) failures.push(`${component.id}${at(host)}: ${a.replace(/s$/, "")} "${key}" has no ${b.replace(/s$/, "")} (${attrB}="${key}")`);
        for (const key of keysB.filter((key) => !keysA.includes(key))) failures.push(`${component.id}${at(host)}: ${b.replace(/s$/, "")} "${key}" has no ${a.replace(/s$/, "")} (${attrA}="${key}")`);
      }
    }
  }

  failures.push(...slotFailures(tree, known?.packages));
  const bound = new Set();
  const shown = [];
  walk(tree, (node) => {
    if (isInstance(node)) {
      // Its own markup, its slots' tags among it; what its slots hold the walk goes on in (BODY), as the document's.
      const slots = new Set(instanceSlots(node));
      failures.push(...nameFailures(node, closedInInstance));
      walk(node, (inside) => failures.push(...nameFailures(inside, closedInInstance)), { stop: (inside) => slots.has(inside) });
      return;
    }
    if (node.tagName === "pre" && inFlow(node)) failures.push(`<pre>${at(node)} straight in the text: a code block is <div class="doc-code"> holding its title (<div class="doc-code-title">) and the <pre>`);
    failures.push(...codeFailures(node));
    if (node.tagName === "a" && hasClass(node, "doc-bookmark")) failures.push(`<a class="doc-bookmark">${at(node)} is no bookmark: ${SHORT_BOOKMARK}`);
    failures.push(...nameFailures(node, kitNamespace));
    const key = attr(node, "data-doc-bind");
    if (key !== undefined) {
      if (!key.trim()) failures.push(`data-doc-bind${at(node)} names no key`);
      else if (!matchesNode(node, BINDABLE)) failures.push(`data-doc-bind${at(node)} on a ${node.tagName}: only inputs, selects, textareas, buttons with a value, details and tables hold a key`);
      else if (node.tagName === "button" && attr(node, "value") === undefined) failures.push(`data-doc-bind${at(node)} on a button without a value: give it the value a click chooses`);
      else bound.add(key.trim());
    }
    const show = attr(node, "data-doc-show");
    if (show !== undefined) shown.push([node, show]);
  }, BODY);
  for (const [node, show] of shown) {
    const key = show.split(":")[0].trim();
    if (!key || !show.includes(":")) failures.push(`data-doc-show="${show}"${at(node)}: write key:value`);
    else if (!bound.has(key)) failures.push(`data-doc-show="${show}"${at(node)}: nothing binds "${key}" (data-doc-bind="${key}")`);
  }
  failures.push(...dollarFailures(html, tree));
  return failures;
}

// A formula between single dollars, as Markdown and LaTeX write one ($x^2$): the kit draws none (a
// single $ is money: "$5 and $6"), so the reader would see its TeX. Only what is TeX for sure: a \ or
// ^ inside, or a subscript as TeX writes one (TEX_SUBSCRIPT), the dollars where pandoc takes them for
// a formula's (a non-blank right after the first and right before the last, no digit after it), in
// text the page shows as words: not in code, a script, a style or a drawing, not in a formula of the
// kit's, and not under an element that asks for single dollars (data-doc-math-dollar, which
// math.js draws so). A variable's name ($JAVA_HOME, $_GET, ${user_name}) is no formula.
const DOLLAR_TEX = /(?<![\\$])\$(?=[^\s$])([^$]*?[^\s$\\])\$(?![$\d])/g;
// A subscript after a letter of its own, a closing bracket or brace (x_1, a_{ij}, (x+y)_2), never a
// name's underscore (JAVA_HOME, my_var, _GET), and not in what opens with a brace (a shell's ${…}).
const TEX_SUBSCRIPT = /(?:(?<![A-Za-z0-9_])[A-Za-z]|[)\]}])_[A-Za-z0-9{]/;
const isTex = (inside) => /[\\^]/.test(inside) || (!inside.startsWith("{") && TEX_SUBSCRIPT.test(inside));
const NOT_WORDS = new Set(["head", "code", "pre", "kbd", "samp", "script", "style", "template", "textarea", "noscript", "svg", "math", "title", "iframe", "object"]);
const DRAWN = `.doc-math-inline, .doc-math-block, .doc-code, .doc-diff, [data-doc-math-dollar], [data-doc-chart], ${INSTANCE}`;
function dollarFailures(html, tree) {
  const failures = [];
  const visit = (node) => {
    for (const child of node.childNodes ?? []) {
      if (child.nodeName === "#text" && child.sourceCodeLocation && child.value.includes("$")) {
        const { startOffset, endOffset } = child.sourceCodeLocation;
        for (const match of html.slice(startOffset, endOffset).matchAll(DOLLAR_TEX)) {
          if (!isTex(match[1])) continue;
          const tex = match[1].replace(/\s+/g, " ");
          const shown = tex.length > 60 ? `${tex.slice(0, 59)}…` : tex;
          failures.push(`line ${lineAt(html, startOffset + match.index)}: $${shown}$ is not drawn as a formula (single dollars are off: they are money): write \\(${shown}\\)`);
        }
      } else if (child.tagName && !NOT_WORDS.has(child.tagName) && !matchesNode(child, DRAWN)) visit(child);
    }
  };
  visit(tree);
  return failures;
}
