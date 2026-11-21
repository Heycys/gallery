import { isUtf8 } from "node:buffer";
import fs from "node:fs";
import path from "node:path";
import { readOnlyTexts, shownSource } from "../editor/source.mjs";
import { BLOCK_LEVEL } from "../editor/source/html.mjs";
import { scriptSyntax } from "../render/component-checks.mjs";
import { packageText, scriptExportProblems, styleExportProblems } from "../render/package-files.mjs";
import { checkReports, notesOf } from "../render/pipeline.mjs";
import { lineAt, parseReport } from "../render/report-tree.mjs";
import { diagnoseScript, usesIn } from "../render/typecheck.mjs";
import { ts } from "../render/typescript.mjs";
import { SETTINGS_PART, instanceMarkup, keepCatalog, problemIn, readCatalog, templateProblem } from "../shared/component-catalog.mjs";
import { instanceSlots, instancesOf, isInstance, partOf } from "../shared/components/index.mjs";
import { fewestSyllables } from "../shared/pinyin.mjs";
import { ATTRIBUTE, refusedInCopy } from "../shared/components/installed.mjs";
import { attr, elementsOf, walk } from "../shared/html-tree.mjs";
import { blockPictures, picturesWritten, writePictures } from "./block-picture.mjs";
import { missingSaid, packageFolder } from "./component.mjs";
import { BROWSER_SECTION, documentsSection, lookAtDocuments, lookAtPackage, pageOfMarkup } from "./component-look.mjs";
import { slotReach, styleReach } from "./component-style.mjs";
import { unopenedSaid } from "./qa.mjs";
import { shown } from "./report-start.mjs";

// gallery block check <id> [--documents] (./usage.mjs): five things, each a section of what it
// prints, each problem at its place in the package's files (style.css:12), a note never a failure:
//   1 the manifest: as the catalog reads it, template.html there, no text part the editor would
//     leave read-only, and words a menu finds as an input method composes
//   2 kit.js: what a browser would refuse, what an export refuses, what a script keeps to the kit's
//     state, what it registers, and a type check against the SDK
//   3 style.css: every selector in the instance (./component-style.mjs), and what an export cannot hold;
//     a note on one that goes down by a blank into a slot's blocks too
//   4 template.html and example.html, each as the page of a document, through what gallery check
//     runs, and template.html as what a menu can put in, its slots holding what a menu can make
//   5 both in a temporary document, exported and run in a browser (./component-look.mjs)
// and with --documents a section more for each document of the workspace that holds instances of it,
// those run as the example is (lookAtDocuments), each problem at its line of the document's file
// (board/doc.html:15), no document written. One that passes all of it gets, written into its folder and said
// nowhere, the menus' two pictures of it (./block-picture.mjs: its example, light and dark), unless it is one of
// Gallery's own or of a pack installed. A package that does not load is taken as far as it goes: its script and style are read all the
// same, and what cannot run is said not to have. One the user turned off loads here all the same:
// that is theirs to change and nothing its writer can mend, so it is checked as any, a note saying
// so. Exits 1 when anything fails, else 3 when the browser could not look at it, as gallery qa does.

const TEMPLATE = "template.html";
const EXAMPLE = "example.html";
const MANIFEST = "component.json";
const STORAGE = new Set(["localStorage", "sessionStorage"]);
// What gallery check says of the package a page uses, not of the page: said here of kit.js and style.css themselves.
const OF_THE_PACKAGE = /^\S+: (?:line \d+ of )?its (?:kit\.js|style\.css) /;
// What a document's rules say of a page's files, and what a package's page has instead: it stands in no
// document, and has no folder to save a picture in.
const OF_THE_FOLDER = /(?: (?:names a file that )?is not in the document's folder|: it is (?:no file of|not in) the document's .*)$|^external resources are not portable: .*$/;
const NO_FOLDER = ": an example stands in no document: write a picture as a data: address, or draw it from style.css with a file the manifest's assets name";
const ofAPackage = (what) => what.replace(OF_THE_FOLDER, (said) => (said.startsWith("external") ? said : "") + NO_FOLDER);

const fileIn = (folder, name) => packageText({ folder }, name);

// What is said of a file of the package that is not UTF-8, which is all that can be said of it (what
// PowerShell's > writes is UTF-16, and read as words it is nonsense), or null.
function notUtf8(folder, file) {
  let bytes = null;
  try {
    bytes = fs.readFileSync(path.join(folder, file));
  } catch {
    return null;
  }
  return isUtf8(bytes) ? null : { file, what: "it is not UTF-8: save it as UTF-8 (PowerShell's > writes UTF-16; Set-Content -Encoding utf8 does not)" };
}

// A failure or a note of gallery check's as a problem of `file`, at the line its words give ("line 4: …"
// or "… (line 4) …"), which is that line of the file (pageOfMarkup). One that gives none is of the page as a whole.
function atItsLine(file, what) {
  const found = /^line (\d+): | \(line (\d+)\)/.exec(what);
  return found ? { file, line: Number(found[1] ?? found[2]), what: what.replace(found[0], "") } : { file, what };
}

// The line a field of a manifest (a path: "parts.title.at") stands on: of the deepest of it that is
// there, or null when none is.
function fieldLine(text, field) {
  const file = ts.parseJsonText(MANIFEST, text);
  let node = file.statements[0]?.expression;
  let line = null;
  for (const key of field.split(".")) {
    const property = node?.properties?.find(({ name }) => name?.text === key);
    if (!property) break;
    line = file.getLineAndCharacterOfPosition(property.getStart(file)).line + 1;
    node = property.initializer;
  }
  return line;
}

// The line of a manifest a problem of the catalog's is about: where JSON stopped reading, or the first
// field it names, in what it fills in or in its words.
function problemLine(text, { message, text: words = "", values = [] }) {
  const position = /at position (\d+)/.exec(message)?.[1];
  if (position) return lineAt(text, Number(position));
  for (const field of [...values.map(String), ...(words.match(/[a-zA-Z][\w.]*/g) ?? [])]) {
    const line = fieldLine(text, field);
    if (line) return line;
  }
  return null;
}

// What readOnlyTexts says of a checked page, read back: [{ line, tag, why }].
const readOnlyOf = (html) => readOnlyTexts(html).map((note) => /^line (\d+): <([^>]+)>: ([\s\S]*)$/.exec(note)).filter(Boolean).map(([, line, tag, why]) => ({ line: Number(line), tag, why }));

// The text parts of a checked page's instances the editor would leave read-only: one that holds a
// block, or anything else that is no word and no mark, and one in a part edited as data or around one,
// which is the component's.
function partsNotText(found, { file, tree, html }) {
  const problems = [];
  const readOnly = readOnlyOf(html);
  const text = Object.entries(found.parts).filter(([, part]) => part.edit === "text");
  const data = Object.entries(found.parts).filter(([, part]) => part.edit === "data");
  const holds = (outer, inner) => {
    let held = false;
    walk(outer, (node) => { held ||= node === inner; });
    return held;
  };
  for (const host of instancesOf(tree, found)) {
    for (const [name, part] of text) {
      for (const node of partOf(host, part.at)) {
        const line = node.sourceCodeLocation?.startLine;
        const block = elementsOf(node).find((child) => BLOCK_LEVEL.has(child.tagName));
        const said = readOnly.find((note) => note.line === line && note.tag === node.tagName);
        const crossing = data.find(([, other]) => partOf(host, other.at).some((each) => each === node || holds(each, node) || holds(node, each)))?.[0];
        if (crossing) problems.push({ file, line, what: `the part ${name} (${part.at}) is edited as text, and stands in the part ${crossing}, edited as data, or around it, which is the component's: the editor leaves it read-only: name elements apart` });
        else if (block) problems.push({ file, line, what: `the part ${name} (${part.at}) is edited as text and holds a block, its <${block.tagName}> at line ${block.sourceCodeLocation?.startLine}: a text part holds words and marks alone, and the editor would leave this one read-only: write its \`at\` as what holds the words (${part.at} > ${block.tagName}), or give each block a part of its own` });
        else if (said) problems.push({ file, line, what: `the part ${name} (${part.at}) is edited as text, and the editor would leave it read-only for what it holds: ${said.why}. A text part holds words and marks alone` });
      }
    }
  }
  return problems;
}

// Pinyin is read as "/" reads it (shared/pinyin.mjs, which also makes the initials a block is found by).
const HAN = /\p{Script=Han}/u;
const charactersIn = (text) => [...text].filter((character) => HAN.test(character)).length;
const PINYIN = { test: (word) => { const count = fewestSyllables(word); return count !== null && count <= 8; } };

export { fewestSyllables };

/**
 * Whether a manifest ({ name, words }) is of a package a reader looks for in Chinese whose words do not
 * spell it as an input method composes it: "/" goes by the letters being composed, a word starting
 * with them or holding them (slash-menu matchScore), so that it finds the block while its whole name is
 * composed only by a word of as many syllables as the name has characters, and otherwise only once
 * they have turned into words. A name with no Chinese and words with some: by a word of pinyin at all.
 */
export function wantsPinyin({ name, words }) {
  const characters = charactersIn(name.zh);
  const spelled = words.split(/\s+/).filter(Boolean);
  if (characters === 0) return HAN.test(words) && !spelled.some((word) => PINYIN.test(word));
  return !spelled.some((word) => fewestSyllables(word.toLowerCase()) === characters);
}

/** Section 1. */
function manifestSection({ id, folder, catalog, off, parts }) {
  const found = catalog.packages.get(id);
  const problem = catalog.problems.get(id)?.problem;
  const text = fileIn(folder, MANIFEST) ?? "";
  const problems = [];
  if (problem) problems.push({ file: MANIFEST, line: problemLine(text, problem), what: problemIn("en", problem) });
  if (found?.template === null) problems.push({ file: TEMPLATE, what: `there is none, and it is what "/" puts in a document: with none, no menu offers the block: write one <div ${ATTRIBUTE}="${id}"> with what a new instance holds` });
  problems.push(...parts);
  const writing = notUtf8(folder, "writing.md");
  if (writing) problems.push(writing);
  const notes = writing || fileIn(folder, "writing.md")?.trim() ? [] : [{ file: "writing.md", what: "there is none, so gallery block show has nothing to say of how to write it" }];
  if (found && wantsPinyin(found)) notes.push({ file: MANIFEST, line: fieldLine(text, "words") ?? fieldLine(text, "name.zh"), what: HAN.test(found.name.zh) ? `no word of words spells its whole name ${found.name.zh} in pinyin as an input method composes it, its ${charactersIn(found.name.zh)} Chinese characters a syllable each in one word (as 方案打分 is fangandafen): "/" finds it while those letters are being composed only by such a word. What is counted is how many syllables a word reads as, not which characters they spell` : 'its words are Chinese and none of them is pinyin: "/" goes by the letters an input method is composing, so write the pinyin there (看板 kanban)' });
  if (off) notes.push({ file: "gallery.json", what: "the user turned it off in 设置 › 组件列表, which is theirs to change and says nothing of the block: it is checked as if it were on, and the instances of a document show what they hold, read-only, until it is on" });
  if (found) {
    problems.push(...settingsProblems(found));
    notes.push(...placesNotes(found, text));
  }
  return { title: "manifest", problems, notes };
}

// What a block with `places` and `card` stands on that its manifest cannot say by itself:
// a text part is shown on a custom page and
// edited nowhere there, and a card is a custom page's alone.
function placesNotes({ places, parts, card }, text) {
  const notes = [];
  if (places.includes("page")) {
    for (const [name, part] of Object.entries(parts)) {
      if (part.edit === "text") notes.push({ file: MANIFEST, line: fieldLine(text, `parts.${name}`), what: `the part ${name} is edited as text, which is read-only on a custom page (no editor runs there): a block whose places hold page keeps what a reader changes there in a data part, with its own field or the card's settings` });
    }
  } else if (fieldLine(text, "card")) notes.push({ file: MANIFEST, line: fieldLine(text, "card"), what: `card is for a custom page's board, and its places (${places.join(", ")}) hold no page: nothing reads it` });
  return notes;
}

// A block with settings keeps their values in its settings part, a JSON data part, which its
// template.html is to hold as a new card's starting values: one <script type="application/json"> of
// an object.
function settingsProblems(found) {
  if (found.settings.length === 0 || !found.template) return [];
  const read = instanceMarkup(found.template, found.id);
  const held = read ? partOf(read.root, found.parts[SETTINGS_PART].at) : [];
  if (held.length !== 1 || (attr(held[0], "type") ?? "").trim().toLowerCase() !== "application/json") {
    return [{ file: TEMPLATE, what: `its manifest has settings, and the template holds ${held.length === 1 ? `a <${held[0].tagName}> where` : `${held.length} elements of`} its settings part (${found.parts[SETTINGS_PART].at}): it is to hold one <script type="application/json">, the values a new card starts with ({} for each setting's default)` }];
  }
  const words = held[0].childNodes.map((node) => node.value ?? "").join("").trim();
  try {
    const value = JSON.parse(words || "{}");
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error("it is no object");
    return [];
  } catch (error) {
    return [{ file: TEMPLATE, line: held[0].sourceCodeLocation?.startLine, what: `its settings part is not a JSON object (${error.message}): write {} or the values of some of its settings, by key` }];
  }
}

// What a script gives DocKit.component as its id: [{ id (null for what is no plain string), at }].
function registered(code) {
  const file = ts.createSourceFile("kit.js", code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const found = [];
  const visit = (node) => {
    const callee = ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) ? node.expression : null;
    if (callee?.name.text === "component" && /\bDocKit$/.test(callee.expression.getText(file))) {
      const [argument] = node.arguments;
      const field = argument && ts.isObjectLiteralExpression(argument) ? argument.properties.find((property) => property.name?.getText(file) === "id") : null;
      const value = field && ts.isPropertyAssignment(field) && ts.isStringLiteralLike(field.initializer) ? field.initializer.text : null;
      found.push({ id: value, at: node.getStart(file) });
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

/** Section 2. */
function scriptSection(found) {
  const title = "kit.js";
  if (!found.files.includes("kit.js")) return { title, none: "none: a static block" };
  const encoded = notUtf8(found.folder, title);
  if (encoded) return { title, stops: true, problems: [encoded] };
  const code = packageText(found, "kit.js") ?? "";
  const syntax = scriptSyntax(code);
  if (syntax) return { title, stops: true, problems: [{ file: title, line: syntax.line, what: `a browser refuses it: ${syntax.message}` }] };
  const problems = scriptExportProblems(found).map(({ line, what }) => ({ file: title, line, what }));
  const stops = problems.length > 0;
  for (const { name, at } of usesIn(code, STORAGE)) problems.push({ file: title, line: lineAt(code, at), what: `uses ${name}: an instance keeps what a reader chose with context.state` });
  const made = registered(code);
  for (const { id, at } of made) if (id !== null && id !== found.id) problems.push({ file: title, line: lineAt(code, at), what: `it registers ${id}, and this block is ${found.id}` });
  const notes = made.length ? [] : [{ file: title, what: `no DocKit.component({ id: "${found.id}", mount(host, context) { … } }) is to be read in it, and a script may make that call in ways reading does not tell: running it says whether it starts one` }];
  for (const { line, code: number, message, refused } of diagnoseScript(code, { assets: found.assets })) {
    (refused ? problems : notes).push({ file: title, line, what: `TS${number}: ${message}` });
  }
  return { title, stops, problems: problems.sort((a, b) => (a.line ?? 0) - (b.line ?? 0)), notes };
}

/** Section 3. */
function styleSection(found) {
  const title = "style.css";
  if (!found.files.includes("style.css")) return { title, none: "none" };
  const encoded = notUtf8(found.folder, title);
  if (encoded) return { title, stops: true, problems: [encoded] };
  const css = packageText(found, "style.css") ?? "";
  const refused = styleExportProblems(found);
  const problems = [...styleReach(css, found.id), ...refused].map(({ line, what }) => ({ file: title, line, what }));
  // A rule that goes down into a slot styles the document's blocks there too: a note, as a package may mean it.
  const slots = Object.entries(found.parts ?? {}).filter(([, { edit }]) => edit === "flow").map(([name]) => name);
  const notes = slotReach(css, found.id, slots).map(({ line, what }) => ({ file: title, line, what }));
  return { title, stops: refused.length > 0, problems: problems.sort((a, b) => a.line - b.line), notes };
}

// What is wrong with a template as what "/" puts in: it is one instance of its package, with no id.
function templateProblems(id, { tree }) {
  let main = null;
  walk(tree, (node) => { main ??= node.tagName === "main" ? node : null; });
  const held = elementsOf(main ?? {});
  const words = (main?.childNodes ?? []).some((node) => node.nodeName === "#text" && node.value.trim());
  const [only] = held;
  if (held.length !== 1 || words || !isInstance(only) || attr(only, ATTRIBUTE) !== id) {
    return [{ file: TEMPLATE, line: only?.sourceCodeLocation?.startLine, what: `a template is one element, a <div ${ATTRIBUTE}="${id}"> or a <section>, and it holds ${held.length === 1 && !words ? `<${only.tagName}${attr(only, ATTRIBUTE) ? ` ${ATTRIBUTE}="${attr(only, ATTRIBUTE)}"` : ""}>` : `${held.length} element${held.length === 1 ? "" : "s"}${words ? " and words" : ""}`}` }];
  }
  const problems = [];
  walk({ childNodes: [only] }, (node) => {
    if (attr(node, "data-block-id") !== undefined) problems.push({ file: TEMPLATE, line: node.sourceCodeLocation?.startLine, what: "it writes a data-block-id, which every instance made of it would repeat: leave it out, Gallery gives a block its id" });
  });
  return problems;
}

// What a slot of a template may not hold, what "/" would make another thing of: a menu makes the blocks
// of a template's slot as a paste of them makes blocks (src/editor/components/installed/page.mjs
// blocksOfTemplate), and a paste makes a table of its cells and never a chart, a card, a table's
// caption or an instance of a block, which an Agent writes and no menu makes. [test, what it is].
const UNMADE = [
  [(node) => attr(node, "data-doc-chart") !== undefined, (node) => `a chart (<${node.tagName} data-doc-chart="${attr(node, "data-doc-chart")}">)`],
  [(node) => node.tagName === "figure", () => "a card (<figure>)"],
  [(node) => node.tagName === "caption", () => "a table's <caption>"],
  [isInstance, (node) => `an instance of ${attr(node, ATTRIBUTE)}`],
];

/** What the slots of a template (`written`, the page of its file as it is, before any conversion) hold that a menu cannot make, each at its line. */
function unmadeInSlots(id, written) {
  let instance = null;
  walk(parseReport(written), (node) => { instance ??= isInstance(node) && attr(node, ATTRIBUTE) === id ? node : null; });
  if (!instance) return [];
  const problems = [];
  const visit = (node, slot) => {
    for (const child of elementsOf(node)) {
      const found = UNMADE.find(([test]) => test(child));
      if (found) problems.push({ file: TEMPLATE, line: child.sourceCodeLocation?.startLine, what: `its slot ${attr(slot, "data-doc-slot")} holds ${found[1](child)}, which a new block from "/" would not have: a menu makes what a template's slot holds as a paste of it makes blocks, and a paste makes no chart, card, table caption or instance of a block. Keep the template's slots to blocks the page makes (paragraphs, headings, lists, quotes, code, a plain table, a disclosure), and show the rest in example.html` });
      else visit(child.tagName === "template" ? child.content : child, slot);
    }
  };
  for (const slot of instanceSlots(instance)) visit(slot, slot);
  return problems;
}

// What keeps the template out of the menus, at what it is about, for what nothing else here says of it:
// what a new block may not hold (refusedInCopy), an end tag the parser had to put in.
function notOffered(found, { tree }) {
  const problem = templateProblem(found);
  if (!problem) return [];
  const [host] = instancesOf(tree, found);
  let refused = null;
  if (host) walk({ childNodes: [host] }, (node) => { if (refusedInCopy(node.tagName, node.attrs)) refused ??= node; });
  return [{ file: TEMPLATE, line: (refused ?? host)?.sourceCodeLocation?.startLine, what: problemIn("en", problem) }];
}

/** The pages section 4 checks, what section 1 reads too: [{ file, slug, written, html, tree }], one of each file there that reads as words, each as its preview shows it. */
function checkedPages(folder) {
  return [[TEMPLATE, "component-template"], [EXAMPLE, "component-example"]].flatMap(([file, slug]) => {
    const text = fileIn(folder, file);
    if (text === null || !text.trim() || notUtf8(folder, file)) return [];
    const written = pageOfMarkup(slug, text);
    const { text: html } = shownSource(written);
    return [{ file, slug, written, html, tree: parseReport(html) }];
  });
}

/** Section 4: `pages`, those of checkedPages, read by what gallery check runs; `parts`: what section 1 said of their text parts. */
function markupSection({ id, folder, found, pages, parts }) {
  const title = "template.html and example.html";
  const problems = [];
  const notes = [];
  for (const file of [TEMPLATE, EXAMPLE]) {
    const encoded = notUtf8(folder, file);
    if (encoded) problems.push(encoded);
    else if (file === TEMPLATE && !fileIn(folder, file)?.trim() && found.template !== null) problems.push({ file, what: "it is empty" });
    else if (file === EXAMPLE && !pages.some((page) => page.file === file)) problems.push({ file, what: `there is none or it is empty: write an instance as a writer would fill it, a <div ${ATTRIBUTE}="${id}">; it is what this check runs` });
  }
  const template = pages.find((page) => page.file === TEMPLATE);
  if (template) problems.push(...templateProblems(id, template), ...unmadeInSlots(id, template.written));
  const example = pages.find((page) => page.file === EXAMPLE);
  if (example && instancesOf(example.tree, found).length === 0) problems.push({ file: EXAMPLE, what: `it holds no instance of ${id}: a <div ${ATTRIBUTE}="${id}">` });
  const reports = pages.map(({ slug, written, html, file }) => ({ file, slug, written, html, directory: path.join(folder, slug), htmlPath: path.join(folder, slug, "doc.html"), metadata: { title: slug, description: slug, type: "component" } }));
  const failures = checkReports(reports);
  for (const report of reports) {
    for (const what of failures.get(report.slug) ?? []) if (!OF_THE_PACKAGE.test(what)) problems.push(atItsLine(report.file, ofAPackage(what)));
    for (const what of notesOf(report)) notes.push(atItsLine(report.file, what));
    for (const what of readOnlyTexts(report.html)) {
      const note = atItsLine(report.file, `${what} (read-only in the preview)`);
      if (!parts.some(({ file, line }) => file === note.file && line === note.line)) notes.push(note);
    }
  }
  if (template && !problems.some(({ file }) => file === TEMPLATE)) problems.push(...notOffered(found, template));
  return { title, problems, notes };
}

/**
 * The sections of what is checked of package `id` of the workspace at `root`, those that read files
 * alone: [{ title, problems, notes, none: what is said of a file it has not, skipped: why it was not run }].
 * Problems and notes are { file, line, what }. Null when the workspace has no such package.
 */
export function readSections(root, id) {
  const catalog = readCatalog(root, undefined, { on: id });
  const folder = packageFolder(root, id);
  if (!catalog.packages.has(id) && !catalog.problems.has(id)) return null;
  keepCatalog(root, catalog); // what gallery check runs goes by the catalog in use
  const off = catalog.packages.has(id) && catalog.settings.disabled.includes(id);
  const found = catalog.packages.get(id) ?? { id, folder, files: ["kit.js", "style.css"].filter((file) => fs.existsSync(path.join(folder, file))) };
  const pages = checkedPages(folder);
  const skipped = catalog.packages.has(id) ? null : "its manifest does not load";
  const parts = skipped ? [] : pages.flatMap((page) => partsNotText(found, page));
  return {
    found: catalog.packages.get(id) ?? null,
    pages,
    sections: [
      manifestSection({ id, folder, catalog, off, parts }),
      scriptSection(found),
      styleSection(found),
      skipped ? { title: "template.html and example.html", skipped } : markupSection({ id, folder, found, pages, parts }),
    ],
  };
}

const placed = ({ file, line }) => (line ? `${file}:${line}` : file);

/** A section as the command prints it, a line each; `number`: its place among the five. What is told (the way back) is neither a problem nor a note. */
export function sectionLines({ title, problems = [], notes = [], told = [], none, skipped, unverified, pictures }, number) {
  const said = unverified ? `UNVERIFIED ${unverified}` : skipped ? `not run: ${skipped}` : none ?? (problems.length ? `${problems.length} problem${problems.length === 1 ? "" : "s"}` : `ok${notes.length ? `, ${notes.length} note${notes.length === 1 ? "" : "s"}` : ""}`);
  return [
    `${number}. ${title}: ${said}`,
    ...problems.map((problem) => `  FAIL ${placed(problem)}: ${problem.what}`),
    ...notes.map((note) => `  note ${placed(note)}: ${note.what}`),
    ...told.map((way) => `  way back ${placed(way)}: ${way.what}`),
    ...(pictures ? [picturesLine(pictures)] : []),
  ];
}

// The pictures of section 5, or of a document's instances (`documents`), by their files' names in their
// folder: the overviews first, the three widths of a theme side by side in each, then each picture at
// full size, then those of the page as the editing page draws it, and of those which are the export's
// pictures at their width.
function picturesLine({ folder, overviews, each, edited = [], asExport = [], documents = false }) {
  const where = overviews.length ? `${shown(path.join(folder, overviews[0]))}${overviews.slice(1).map((name) => ` and ${name}`).join("")}, the three widths of each theme side by side; then each at full size: ` : `${shown(folder)}: `;
  const same = asExport.length === 0 ? "" : asExport.length === edited.length ? ", each the same picture as the export's at its width: the block draws nothing more where a reader can edit" : `, ${asExport.join(" and ")} the same picture as the export's at its width`;
  const editing = edited.length ? `; and ${edited.join(" and ")}, as the editing page draws it (context.canEdit() true)${same}` : "";
  return `  Pictures (none looked at for you; ${documents ? "each instance under a line naming where it stands in the document" : "example.html above the line, template.html below it, each under its name"}): ${where}${each.join(", ")}${editing}`;
}

// What has to pass before a package can run, by what the reading of it found, or null. A selector
// that reaches outside and a word of the type check are no reason not to run it; what no browser or
// no export takes is (`stops`).
function notRunnable([manifest, script, style, markup]) {
  if (manifest.problems.length) return "the manifest";
  if (script.stops) return "kit.js";
  if (style.stops) return "style.css";
  return markup.skipped || markup.problems.length ? "template.html and example.html" : null;
}

/**
 * gallery block check <id>: prints each section and the verdict, and sets the exit code; with
 * `documents` (--documents) a section more for each document holding instances of it (lookAtDocuments).
 */
export async function checkCommand(root, id, { documents = false, elsewhere = null } = {}) {
  const read = readSections(root, id);
  if (!read) {
    console.error(missingSaid(root, id));
    process.exit(1);
  }
  console.log(`${id}: ${shown(packageFolder(root, id))}`);
  read.sections.forEach((section, index) => console.log(sectionLines(section, index + 1).join("\n")));
  const waiting = notRunnable(read.sections);
  const folder = packageFolder(root, id);
  // The block's pictures for the menus (./block-picture.mjs), made in the look's browser and written into its folder once all of it passed.
  const example = fileIn(folder, EXAMPLE);
  const picture = picturesWritten(root, id) ? (browser) => blockPictures(browser, { root, found: read.found, example }) : null;
  const look = waiting ? { title: BROWSER_SECTION, skipped: `${waiting} first` } : await lookAtPackage(root, read.found, { example, template: fileIn(folder, TEMPLATE) }, { picture });
  console.log(sectionLines(look, 5).join("\n"));
  const held = !documents ? [] : waiting ? [{ title: documentsSection(), skipped: `${waiting} first` }] : await lookAtDocuments(root, read.found, { elsewhere });
  held.forEach((section, index) => console.log(sectionLines(section, 6 + index).join("\n")));
  // The pictures of the run in one line, as page check ends: a hint, the block's two overviews named as the whole
  // of it; none needs opening.
  const runs = [look, ...held].filter(({ pictures }) => pictures).map(({ pictures: { folder: where, overviews, each, edited = [] } }) => ({ folder: where, files: [...overviews, ...each, ...edited].map((name) => path.join(where, name)) }));
  const unopened = unopenedSaid(runs, { first: look.pictures ? look.pictures.overviews.map((name) => path.join(look.pictures.folder, name)) : [] });
  if (unopened) console.log(unopened);
  const problems = [...read.sections, look, ...held].reduce((sum, { problems: found = [] }) => sum + found.length, 0);
  if (problems) {
    console.log(`FAIL ${id}: ${problems} problem${problems === 1 ? "" : "s"}`);
    process.exitCode = 1;
  } else if (look.unverified || held.some(({ unverified }) => unverified)) {
    console.log(`UNVERIFIED ${id}: the rest passed, and no browser ran ${look.unverified ? "it" : "the documents' instances"}: export a document that holds it and open that in Chrome or Edge.`);
    process.exitCode = 3;
  } else {
    // Said nowhere: nothing to look at or to do (the owner's rule, 2026-11-17: an Agent's burden only goes down).
    if (look.picture) await writePictures(folder, look.picture).catch(() => {});
    console.log(`OK   ${id}${documents ? ` and its instances in the workspace's documents` : ""}`);
  }
}
