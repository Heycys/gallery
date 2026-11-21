import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { COMPONENTS, descriptionOf } from "../../src/editor/components/registry.mjs";
import { componentOf } from "../../src/shared/components/index.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";

// The engines read a component's definition, they do not know it by name (docs/editor.md, "Component
// definitions"). This counts, in each engine file, the places that name a concrete component:
//
//   a string      any string in the code that is a component's name, wherever it stands: a comparison
//                 of any kind in either order, a case label, a list, a return, a value (those of a
//                 data-ge-* attribute among them). The names are the registry's unit kinds, box kinds,
//                 block types and host kinds, so a new component is counted without a hand list (but
//                 "text" and "label", two host kinds that are everyone's words for a text and a label).
//   an object     each key that is a name, in a literal with two or more such keys (a table by component)
//   a predicate   a use of an isX imported from a component's folder (isCode(node))
//   an import     anything else imported from a component's folder (components/registry.mjs and
//                 components/pages.mjs are no component's: they are how an engine reads the fields)
//   a page object a read of `pages.flowchart`, or a binding of one out of `pages`
//                 (const { columns, sheets: tabs } = pages), by any component's name
//   a selector    a matches, closest, querySelector or classList.contains of a doc-* name, or a
//                 matches, closest or querySelector of the tag of a component's blocks or parts
//   a class       a .doc-* selector in any other string: one held in a const, one in a style sheet
//   an attribute  a data-ge-* attribute that is one component's own, in any string (its folder
//                 sets it, no other folder does and core.mjs does not)
//   a tag         a comparison of a localName, tagName or tag with the tag of a component's blocks
//
// It reads the syntax tree, so comments and import paths are no places, and it counts what the engines
// say and not what they mean: a string that only reads like a name (a "file" that is a media route)
// counts too, which is why the numbers are a measure to bring down and not a list of faults; such a
// line, when it is new, raises its file's number, and its commit says why. A file with no such place
// has no entry in ENGINE_NAMES. src/editor/components is the components themselves,
// page/table/ a component's own tool, the kit and the starter what the engines serve: none of them is
// an engine.

const EVERYONES_WORDS = ["text", "label"];
const NAMES = [...new Set(COMPONENTS.flatMap((component) => ["units", "boxes", "types", "hosts"].flatMap((part) => Object.keys(component[part] ?? {}))))].filter((name) => !EVERYONES_WORDS.includes(name));
const TAGS = [...new Set(COMPONENTS.flatMap((component) => [
  ...Object.values(component.units ?? {}).flatMap((unit) => (unit.match ?? []).flatMap((rule) => rule.tag ?? [])),
  ...Object.values(component.types ?? {}).map((spec) => spec.tag),
]))].filter((tag) => tag !== "div");
const ROOTS = ["src/editor", "src/transfer", "src/render", "src/cli", "src/server"];
const NOT_ENGINES = ["src/editor/components", "src/editor/page/table", "src/render/kit", "src/render/starter"];

// The tags a component's description names for its parts (a disclosure's summary, a caption's
// figcaption), beside those of its blocks.
const PART_TAGS = COMPONENTS.flatMap((component) => Object.values(componentOf(descriptionOf(component))?.parts ?? {}))
  .flatMap((part) => [...part.at.matchAll(/(?:^|[\s>+~,(])([a-z][a-z0-9]*)/g)].map((match) => match[1]))
  .filter((tag) => tag !== "div");

// The data-ge-* attributes that are one component's own: its folder sets them, no other does, and
// core.mjs, where what every block carries is written, does not.
const OWN_ATTRIBUTES = (() => {
  const folders = new Map();
  const walk = (directory, folder) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full, folder ?? entry.name);
      else if (folder && entry.name.endsWith(".mjs")) {
        for (const [, name] of fs.readFileSync(full, "utf8").matchAll(/(?:set|toggle)Attribute\("(data-ge-[a-z-]+)"/g)) folders.set(name, (folders.get(name) ?? new Set()).add(folder));
      }
    }
  };
  walk(path.join(projectRoot, "src/editor/components"), null);
  const core = fs.readFileSync(path.join(projectRoot, "src/editor/page/core.mjs"), "utf8");
  return [...folders].filter(([name, owners]) => owners.size === 1 && !core.includes(name)).map(([name]) => name);
})();

const nameSet = new Set(NAMES);
const tagSet = new Set(TAGS);
const objectNames = new Set([...NAMES, ...COMPONENTS.map((component) => component.name)]);
const SELECTING = new Set(["matches", "closest", "querySelector", "querySelectorAll", "contains"]);
const FINDING = new Set(["matches", "closest", "querySelector", "querySelectorAll"]);
const TAG_SELECTOR = new RegExp(`(?<![\\w.#\\[:-])(?:${[...new Set([...TAGS, ...PART_TAGS])].join("|")})(?![\\w-])`);
const DOC_CLASS = /\.doc-[a-z]/g;
const OWN_ATTRIBUTE = new RegExp(`(?:${OWN_ATTRIBUTES.join("|")})(?![a-z-])`, "g");
const textOf = (node) => (ts.isStringLiteralLike(node) ? node.text : null);
const fromComponent = (spec) => /(?:^|\/)components\/[^/]+\/[^/]+$/.test(spec);
const keyOf = (member) => (ts.isPropertyAssignment(member) || ts.isShorthandPropertyAssignment(member) || ts.isMethodDeclaration(member) ? member.name.text ?? null : null);
const isPages = (node) => /(?:^|\.)pages$/.test(node?.getText() ?? "");
const wordsOf = (node) => (ts.isStringLiteralLike(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node) ? node.text : null);

// What a module imports from components' folders, by the name it gives each.
const importedOf = (tree) => tree.statements.filter((statement) => ts.isImportDeclaration(statement) && fromComponent(statement.moduleSpecifier.text)).flatMap(({ importClause }) => {
  const bindings = importClause?.namedBindings;
  const named = bindings && ts.isNamedImports(bindings) ? bindings.elements.map((element) => element.name.text) : [];
  return [...(importClause?.name ? [importClause.name.text] : []), ...(bindings && ts.isNamespaceImport(bindings) ? [bindings.name.text] : []), ...named];
});

// Whether a string is what a matches, closest, querySelector or contains looks for, counted there.
const lookedFor = (node) => {
  const call = node.parent;
  return ts.isCallExpression(call) && call.arguments[0] === node && ts.isPropertyAccessExpression(call.expression) && SELECTING.has(call.expression.name.text);
};

/** How many places of a module's text name a component. */
const placesIn = (text) => {
  const tree = ts.createSourceFile("module.mjs", text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const imported = importedOf(tree);
  const predicates = new Set(imported.filter((name) => /^is[A-Z]/.test(name)));
  let places = imported.length - predicates.size;
  const visit = (node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isStringLiteralLike(node) && nameSet.has(node.text)) places++;
    const words = wordsOf(node);
    if (words !== null) {
      if (!lookedFor(node)) places += words.match(DOC_CLASS)?.length ?? 0;
      places += words.match(OWN_ATTRIBUTE)?.length ?? 0;
    }
    if (ts.isPropertyAccessExpression(node) && isPages(node.expression) && objectNames.has(node.name.text)) places++;
    if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name) && isPages(node.initializer)) {
      places += node.name.elements.filter((element) => objectNames.has((element.propertyName ?? element.name).getText())).length;
    }
    if (ts.isObjectLiteralExpression(node)) {
      const named = node.properties.filter((member) => nameSet.has(keyOf(member))).length;
      if (named >= 2) places += named;
    }
    if (ts.isIdentifier(node) && predicates.has(node.text)) places++;
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && SELECTING.has(node.expression.name.text) && node.arguments[0]) {
      const [looked] = node.arguments;
      if (/\bdoc-/.test(looked.getText())) places++;
      else if (FINDING.has(node.expression.name.text) && (ts.isStringLiteralLike(looked) || ts.isTemplateExpression(looked)) && TAG_SELECTOR.test(looked.getText())) places++;
    }
    if (ts.isBinaryExpression(node) && /^[!=]==$/.test(node.operatorToken.getText())) {
      const [side, other] = textOf(node.left) === null ? [node.left, node.right] : [node.right, node.left];
      if (tagSet.has(textOf(other)?.toLowerCase()) && /(?:localName|tagName|tag)$/.test(side.getText())) places++;
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return places;
};

// What it counts, in terms of whatever the first names are, since a component may come and go.
const [one, two] = NAMES;
const line = (code) => placesIn(`const value = ${code};`);
assert.equal(line(`kind === "${one}"`), 1, "a comparison");
assert.equal(line(`kind === '${one}'`), 1, "in either quote");
assert.equal(line(`"${one}" === kind`), 1, "in either order");
assert.equal(line(`node.getAttribute("data-ge-unit-kind") === "${one}"`), 1, "of an attribute's value");
assert.equal(line(`typeOf(node) !== "${one}"`), 1, "of a call's result");
assert.equal(line(`new Set(["${one}"]).has(kind)`), 1, "in a list of one");
assert.equal(line(`["${one}", other]`), 1, "in a list beside anything else");
assert.equal(line(`["${one}", "${two}"]`), 2, "each name of a list");
assert.equal(line(`text === "---" ? "${one}" : null`), 1, "as a value");
assert.equal(placesIn(`function f() { return "${one}"; }`), 1, "returned");
assert.equal(placesIn(`switch (role) { case "${one}": break; case "nobody": break; }`), 1, "a case label");
assert.equal(line(`{ ${one}: 1, ${two}: () => 2 }`), 2, "each key of an object with two names for keys");
assert.equal(line(`{ ${one}: 1, other: 2 }`), 0, "not with one");
assert.equal(placesIn(`import { isCode, plain } from "../components/code/index.mjs";\nconst a = isCode(node) && plain(node); list.filter(isCode);`), 3, "the uses of a component's predicate, not its import, and anything else it gives once");
assert.equal(placesIn(`import { isHost } from "./core.mjs";\nconst a = isHost(node);`), 0, "no predicate of an engine's");
assert.equal(placesIn(`import { tabOf, iconOf } from "../components/sheets/index.mjs";\nimport * as code from "../components/code/page.mjs";\nimport { pageOf } from "../page-objects.mjs";`), 3, "whatever a component's folder gives an engine, once each");
assert.equal(placesIn(`import { BLOCK_TYPES } from "../components/registry.mjs";\nimport { createPages } from "../components/pages.mjs";`), 0, "not what reads the fields");
assert.equal(line(`pages.flowchart.rows`), 1, "a page object read by name");
assert.equal(line(`ctx.pages.list`), 1, "from ctx too");
assert.equal(line(`pages.length`), 0, "not anything else of `pages`");
assert.equal(placesIn(`const { section: sections, columns, other } = pages;`), 2, "a page object bound by name");
assert.equal(placesIn(`const { section } = options;`), 0, "not out of anything else");
assert.equal(line(`node.closest("summary") || node.matches("dialog[open]")`), 2, "a tag of a component's part or block in a selector");
assert.equal(line(`node.closest(".ge-summary") || node.matches("[data-summary]") || node.closest("[data-ge-box]")`), 0, "not a class or an attribute that reads like one");
assert.equal(line(`node.contains(summary)`), 0, "not a variable called so");
assert.equal(placesIn(`const EDGED = "code, a.doc-dialog-trigger";`), 1, "a selector held in a const");
assert.equal(placesIn("const STYLE = `.doc-sheet-tab:focus { outline: 0 } .doc-link-mention { color: red }`;"), 2, "each class of a style sheet");
assert.equal(line(`node.classList.add("ge-doc-item")`), 0, "not a word with doc in it");
assert.equal(placesIn(`const a = "[${OWN_ATTRIBUTES[0]}]"; node.getAttribute("${OWN_ATTRIBUTES[0]}");`), 2, "a component's own attribute, in a selector or not");
assert.equal(line(`node.closest("[data-ge-unit]")`), 0, "not what every block carries");
assert.equal(line(`node.matches(".doc-code") || node.closest(".doc-table-wrap") || node.classList.contains("doc-note")`), 3, "a kit's class looked for");
assert.equal(line(`node.closest(".ge-menu")`), 0, "not the editor's own");
assert.equal(line(`node.localName === "${TAGS[0]}" || node.tagName !== "${TAGS[0].toUpperCase()}" || tag === "${TAGS[0]}"`), 3, "a tag compared");
assert.equal(line(`node.localName === "nobody"`), 0, "not one no component has");
assert.equal(placesIn(`// kind === "${one}"\nconst a = 1; // "${one}"\n/* ["${one}", "${two}"] */ typeof kind === "string"; blockType === "nobody";`), 0, "comments and other comparisons are no places");

const engineFiles = (entry) => {
  const full = path.join(projectRoot, entry);
  if (NOT_ENGINES.includes(entry)) return [];
  if (fs.statSync(full).isDirectory()) return fs.readdirSync(full).flatMap((name) => engineFiles(`${entry}/${name}`));
  return entry.endsWith(".mjs") ? [entry] : [];
};

// The numbers only ever go down. A number that fell is written down here (a file that came to none
// leaves the table); one that rose is a component's knowledge gone into an engine, which belongs in a
// field of its definition. An entry with a comment keeps its places on purpose, the comment says why:
// what the component system (2026-10-30) leaves in the engines on purpose (the file format's structure,
// other programs' formats, the ways resize drags), and strings that only read like a name, and a
// comment that counts them keeps that many, the rest of its number being left to bring down. An
// entry with none is what is left to bring down.
const ENGINE_NAMES = {
  "src/cli/component-look.mjs": 1, // no component: the controls (button, input, select, textarea) a custom block draws in its own markup, which gallery block check asks the export for (controlsShown)
  "src/cli/block-picture.mjs": 1, // no component: page, the place of a custom page in a manifest's places (a card is pictured on a board)
  "src/cli/component-check.mjs": 2, // what "/" cannot make in a template's slot (unmadeInSlots): a card and a table's caption, which the HTML importer, no component, makes into something else
  "src/cli/import-icons.mjs": 8, // no component: the icons' names, with their Chinese
  "src/cli/gallery.mjs": 5, // CLI command names, including global page/block/extension routing and block try run where the documents are // no component: block, the command gallery block (its module, its other name component); and doctor/serve/startup, the commands that end with no 需要处理 line (NO_NOTICE)
  "src/cli/list.mjs": 6, // no component: the keys of gallery list --json (a document's link, icon and column, a web link's), words that only read like a link mention's and a columns block's
  "src/cli/doctor.mjs": 3, // no component: node, the word of its check of the Node it runs on (an id in its JSON), and the checks' other words that only read like a name
  "src/cli/hand-in.mjs": 1, // no component: icon, the word of gallery set --icon in the line that says how to change a page's icon
  "src/cli/import.mjs": 7, // no component: the words of what an import says it made
  "src/cli/emoji.mjs": 1, // no component: list, the subcommand gallery emoji list
  "src/cli/extension.mjs": 3, // no component: list, the subcommand gallery extension list; column and columns, the keys of gallery extension list --json (an extension's sidebar.json column and its columns/ ones)
  "src/cli/extension-template.mjs": 1, // no component: node, the executable for an extension's backend
  "src/cli/preferences.mjs": 2, // no component: list, the default and matched preferences subcommand
  "src/cli/read.mjs": 2, // no component: icon and file, the keys of gallery read --json's document (as gallery list --json has them); every kind is read through its definition's `read`
  "src/cli/page.mjs": 3, // no component: gallery page list --json's page (its slug, title, icon and file, words a component's definition has too) and list, the subcommand gallery page list
  "src/cli/usage-sections.mjs": 3, // no component: block and page, the commands whose usage it keeps by subcommand, and list, the subcommand of each
  "src/cli/page-check.mjs": 4, // no component: a custom page's own markup as gallery page check reads it (its main.gallery-page, a script it may not hold, a picture that does not load, and the <embed> among the elements that show a file of assets/ in a frame)
  "src/cli/qa-baseline.mjs": 6, // what gallery qa looks at in the reading view, the kit's markup
  "src/cli/qa.mjs": 82, // what gallery qa looks at in the reading view, the kit's markup
  "src/cli/release-build.mjs": 2, // no component: esbuild's platform
  "src/cli/sandbox.mjs": 2, // "list" is the sandbox subcommand, not the document list block
  "src/cli/set.mjs": 2, // no component: the words of gallery set, which writes a document's header (it says h1.doc-title, the page's title, in a message) and names an icon's kinds, image and icon
  "src/cli/skill.mjs": 1, // no component: a word of a message
  "src/cli/trash.mjs": 1, // no component: the kind of a trash item, link
  "src/cli/ui-commands.mjs": 4, // no component: the workbench's menu items as the table names them (文档, 网页链接, a group title; the menus' files read as text by tests/unit/ui-commands.mjs)
  "src/cli/usage.mjs": 9, // no component: the command list, and block, the command gallery block (its usage, its other name component), and gallery set's usage, which says the header it writes: div.doc-icon and h1.doc-title; and gallery doctor's, which names its checks (node, skill, workspace, browser) in its --json fields
  "src/editor/annotations.mjs": 9,
  "src/editor/media-store.mjs": 7,
  "src/editor/page-service.mjs": 2, // no component: the reason a request is refused for, block (the card's block is not one the page runs), written twice
  "src/editor/page/after/index.mjs": 4, // the paragraph it makes after a block or in its place, the editor's default block, as insert/'s (a box of no kind of its own a flow)
  "src/editor/page/annotate/anchors.mjs": 5,
  "src/editor/page/annotate/card.mjs": 2,
  "src/editor/page/annotate/index.mjs": 10,
  "src/editor/page/at-menu/index.mjs": 1, // no component: inline code and a link, in which no "@" opens (a picture in the text, which leaves no room for its hint: typed-field.mjs)
  "src/editor/page/block-info.mjs": 1,
  "src/editor/page/block-menu/colors.mjs": 2,
  "src/editor/page/block-menu/index.mjs": 16,
  "src/editor/page/board/hint.mjs": 1, // no component: an ARIA role, note
  "src/editor/page/board/index.mjs": 2, // no component: the grid's cell and step beside its rect, words that only read like a table's cell and a flowchart's step (the card's instance, a custom block's, is read through components/instances.mjs: the host's own mark, never a selector of the board's)
  "src/editor/page/board/settings.mjs": 2, // no component: an ARIA role, dialog, and the form's own controls (input, select, button)
  "src/editor/page/caret.mjs": 6,
  "src/editor/page/changes/index.mjs": 4, // no component among them: the page's own title and body (main), where the server names a block by them, and a table's scope line (data-ge-lead), whose words are its table's as the server reads them
  "src/editor/page/clipboard/import/cards.mjs": 4, // an AI answer's cards: the tags of its HTML (a paragraph, the lists, the blocks no card holds) and the column attributes they map to (2026-11-20)
  "src/editor/page/clipboard/import/html.mjs": 69, // another program's formats and what they map to, kept in one place on purpose; a cell's pictures and its table alone (tableRows, 2026-11-09)
  "src/editor/page/clipboard/import/markdown.mjs": 37, // another program's formats and what they map to, kept in one place on purpose
  "src/editor/page/clipboard/import/math.mjs": 3, // another program's formats and what they map to, kept in one place on purpose
  "src/editor/page/clipboard/import/office.mjs": 18, // Word's formats (its paragraphs, list paragraphs, tables, pictures) and the HTML tags the importer reads for them (2026-11-21); "image", Word's list format for a picture bullet, a bullet (2026-11-21)
  "src/editor/page/clipboard/import/read.mjs": 4, // another program's formats and what they map to, kept in one place on purpose
  "src/editor/page/clipboard/import/to-blocks.mjs": 67, // another program's formats and what they map to, kept in one place on purpose
  "src/editor/page/clipboard/import/yuque.mjs": 43, // Yuque's formats (its node and card names) and what they map to, kept in one place on purpose
  "src/editor/page/clipboard/index.mjs": 30,
  "src/editor/page/clipboard/own/blocks.mjs": 1,
  "src/editor/page/clipboard/own/chart-keys.mjs": 1,
  "src/editor/page/clipboard/own/describe.mjs": 2,
  "src/editor/page/clipboard/own/export.mjs": 11, // no block among them: what a line of text holds, written for other programs: a link (a chip's words as the page shows them, a document's whole address), inline code, a formula in a line, a cell's list
  "src/editor/page/clipboard/own/selection.mjs": 5,
  "src/editor/page/clipboard/own/writers.mjs": 15, // the table's keys, the kinds' own vocabulary (paragraph, heading, todo, quote, code, table, tabs, image, bookmark, icon, item, node, section), and the two kinds of file a page export names
  "src/editor/page/columns/index.mjs": 22, // 1 of them the status line's kind of message "note" (the shares said while a line is dragged), which only reads like the paragraph's type of that name
  "src/editor/page/commit.mjs": 7,
  "src/editor/page/conflicts.mjs": 2,
  "src/editor/page/convert.mjs": 96,
  "src/editor/page/core.mjs": 61,
  "src/editor/page/custom-page.mjs": 1, // no component: any link of a custom page (a[href]), whose click opens it as a tab of the workbench or of its own, as present-links.mjs does for 演示视图
  "src/editor/page/drag/drop.mjs": 20, // 6 of them a place among a box's blocks named `slot` beside `box` and `nest` in an object, which only reads like the box kind of an instance's slots
  "src/editor/page/drag/index.mjs": 23, // 2 of them a place among a box's blocks named `slot` beside `box` in an object, which only reads like the box kind of an instance's slots
  "src/editor/page/drag/preview.mjs": 4,
  "src/editor/page/editor.mjs": 17, // no component among them: the status line's kind "note", a link's rel="icon" and the page's tab icon, the media routes, a paragraph (the default block), the page's own title and header, the kit's export button
  "src/editor/page/emoji-picker/emoji-tab.mjs": 4, // no component: a category of emoji, and an ARIA role
  "src/editor/page/emoji-picker/grid.mjs": 1, // no component: the picker's own pictures
  "src/editor/page/emoji-picker/index.mjs": 1, // no component: the picker's tab
  "src/editor/page/emoji-picker/support.mjs": 1, // no component: the upload of an icon
  "src/editor/page/emoji-picker/upload.mjs": 7, // no component: a picture picked, and an input's type
  "src/editor/page/export-report.mjs": 1, // no component: the status line's kind of message "note"
  "src/editor/page/format-bar/bar.mjs": 6, // no component: the inline mark `code`, the text's highlight, ARIA roles
  "src/editor/page/format-bar/brush.mjs": 3, // no component: the text's highlight, a family of colors
  "src/editor/page/format-bar/colors.mjs": 2, // no component: the same family
  "src/editor/page/format-bar/index.mjs": 25, // no component: the inline mark `code`, the text's highlight
  "src/editor/page/formula/index.mjs": 5,
  "src/editor/page/formula/panel.mjs": 1, // no component: an ARIA role
  "src/editor/page/frame.mjs": 1,
  "src/editor/page/geometry.mjs": 14,
  "src/editor/page/handle/index.mjs": 8,
  "src/editor/page/hints/index.mjs": 5,
  "src/editor/page/insert/index.mjs": 15,
  "src/editor/page/kept.mjs": 1,
  "src/editor/page/links/index.mjs": 10,
  "src/editor/page/links/views.mjs": 17,
  "src/editor/page/margin.mjs": 2,
  "src/editor/page/markdown/index.mjs": 3, // the inline mark `code`, no block's
  "src/editor/page/markdown/rules.mjs": 1, // the same mark
  "src/editor/page/marks.mjs": 5,
  "src/editor/page/media-menu/index.mjs": 3, // no component: an input's type, an ARIA role, a button's action
  "src/editor/page/notices.mjs": 2, // no component: the status line's kind of message "note"
  "src/editor/page/outline/index.mjs": 4,
  "src/editor/page/outline/list.mjs": 5,
  "src/editor/page/outline/read.mjs": 7,
  "src/editor/page/outline/tree.mjs": 6,
  "src/editor/page/overlay-layer.mjs": 2,
  "src/editor/page/own.mjs": 2, // small text's end part, of the default block, and the inline mark `code`
  "src/editor/page/present-links.mjs": 1, // no component: any link of a page read in 演示视图, one in a drawing too
  "src/editor/page/pull/apply.mjs": 2, // no component: the kit's tags (data-doc-kit, data-doc-vendor) the page served asks for and the page has (kitMissing), the render's marks of a file to load, which only read like a kit's class
  "src/editor/page/resize/index.mjs": 34, // the three ways a block is dragged, a real difference of algorithm, left here on purpose; `resizable` and `sizes` say which blocks
  "src/editor/page/select-all/index.mjs": 6,
  "src/editor/page/selection/delete.mjs": 2,
  "src/editor/page/selection/marquee.mjs": 2,
  "src/editor/page/sync-state.mjs": 5,
  "src/editor/page/text-select/index.mjs": 3,
  "src/editor/page/typed-field.mjs": 1, // a picture in the text after what is typed, which leaves no room for the "@" and "/" menus' hint (from at-menu/)
  "src/editor/page/typing/code-edges.mjs": 1, // the inline mark `code`, no block's
  "src/editor/page/typing/index.mjs": 1, // the status line's kind of message "note"
  "src/editor/page/typing/leave.mjs": 3,
  "src/editor/service.mjs": 1,
  "src/editor/source/apply.mjs": 34, // 10 of them the divider's and the tab's specials, the file format's structure, left here on purpose
  "src/editor/source/blocks.mjs": 34, // 14 of them the scan's flow(), the file format's structure, left here on purpose
  "src/editor/source/changes.mjs": 5, // the ghost of deleted blocks the page draws: an item's marker, its list's tag (ul or ol) and its number among the li
  "src/editor/source/checks.mjs": 14,
  "src/editor/source/commit.mjs": 1,
  "src/editor/source/natural.mjs": 100, // the file format's structure, left here on purpose: a new block says its parts, it does not come in here; 8 of them BECAME's, what each rule of the conversion made, said to the Agent in changeLines (the rules are this file's)
  "src/editor/source/table.mjs": 8,
  "src/editor/source/text.mjs": 2,
  "src/editor/source/units.mjs": 39, // 11 of them boxKind, the file format's structure, left here on purpose
  "src/editor/source/whole.mjs": 7, // no component: HTML's tags, those written in pairs and those that hold no markup
  "src/editor/unfurl.mjs": 1, // no component: a link's rel
  "src/render/asset-references.mjs": 19, // what the build and the checks read of the reading view, the kit's markup as the shared descriptions say it, no editor component's
  "src/render/assets.mjs": 3, // the kit's scripts by id, the code block's, the Sheet area's and the formulas' among them, which stay with the others: the component system moves none of them by default
  "src/render/chart-declarations.mjs": 14, // what the build and the checks read of the reading view, the kit's markup as the shared descriptions say it, no editor component's
  "src/render/component-checks.mjs": 11, // what the build and the checks read of the reading view, the kit's markup as the shared descriptions say it, no editor component's
  "src/render/component-runtime.mjs": 1, // no component: esbuild's platform
  "src/render/embeds.mjs": 3, // what the build and the checks read of the reading view, the kit's markup as the shared descriptions say it, no editor component's
  "src/render/emoji.mjs": 5, // the page's icon as the build shows it: the kit's markup, the kind of its value, and data-ge-icon, which the preview writes for the icon's editor to read it back
  "src/render/files.mjs": 3, // what the build and the checks read of the reading view, the kit's markup as the shared descriptions say it, no editor component's
  "src/render/identity-checks.mjs": 2, // no component: the li and p of a list item and its paragraph, whose ids gallery check holds to the place Gallery writes them (an id stays on the item)
  "src/render/images.mjs": 7, // what the build and the checks read of the reading view, the kit's markup as the shared descriptions say it, no editor component's
  "src/render/layout-notes.mjs": 4, // what the build and the checks read of the reading view, the kit's markup as the shared descriptions say it, no editor component's
  "src/render/local-paths.mjs": 1, // no component: the element <code>
  "src/render/pipeline.mjs": 11, // what the build and the checks read of the reading view, the kit's markup as the shared descriptions say it, no editor component's
  "src/render/preview-checks.mjs": 15, // no component: the preview note's own classes, .doc-checks and its parts, in its style sheet and its script
  "src/server/media-route.mjs": 2, // no component: the media routes
  "src/server/routes.mjs": 2,
  "src/server/extensions.mjs": 1, // HTTP MIME types for extension files, not document blocks
  "src/server/extension-install.mjs": 1, // "installed" is the package installation result, not the installed block host
  "src/transfer/browser.mjs": 8,
  "src/transfer/dom.mjs": 2,
  "src/transfer/import.mjs": 83, // another program's formats and what they map to, kept in one place on purpose; a table cell's pictures as an image's files (tablePictures, 2026-11-09)
  "src/transfer/markdown.mjs": 14,
  "src/transfer/carry.mjs": 1, // embed, the kind of file own-report.mjs fileKindOf gives an embed's frame: the files an export of embeds written as links leaves out, which it carries for its import
  "src/transfer/own-report.mjs": 8, // an export of this Gallery's taken back: the kinds of file it keeps, the page's tab icon, a Sheet tab's button
  "src/transfer/service.mjs": 2, // no component: the media routes
  "src/transfer/worker.mjs": 2,
};

const files = ROOTS.flatMap(engineFiles);
// The page's engines read a package through the host's fields: the marks of one, in the shared
// description of the host, are the host's folder's to read.
assert.deepEqual(files.filter((file) => file.startsWith("src/editor/page/") && /shared\/components\/installed\.mjs/.test(fs.readFileSync(path.join(projectRoot, file), "utf8"))), [], "no page engine knows what a package's marks are");
// Nor does one spell an instance's attribute: a card's instance is read through components/instances.mjs, the host's own rule (a div or section), so that a board's copy cannot drift from the server's.
assert.deepEqual(files.filter((file) => file.startsWith("src/editor/page/") && fs.readFileSync(path.join(projectRoot, file), "utf8").includes("data-doc-component")), [], "no page engine spells an instance's attribute");
const counts = Object.fromEntries(files.map((file) => [file, placesIn(fs.readFileSync(path.join(projectRoot, file), "utf8"))]).filter(([, count]) => count > 0));
const problems = [];
for (const [file, count] of Object.entries(counts)) {
  const entry = ENGINE_NAMES[file];
  if (entry === undefined) problems.push(`${file}: ${count} named places and no entry in ENGINE_NAMES: an engine reads a definition, so add a field to the component's definition (docs/editor.md, "Component definitions") instead of naming it here`);
  else if (count > entry) problems.push(`${file}: ${count} named places, more than its ${entry}: that is a component's knowledge gone into an engine, so add a field to the component's definition (docs/editor.md, "Component definitions") instead`);
  else if (count < entry) problems.push(`${file}: ${count} named places, fewer than its ${entry}: write ${count} down in ENGINE_NAMES`);
}
for (const file of Object.keys(ENGINE_NAMES)) {
  if (!counts[file]) problems.push(`${file}: no named place any more, or the file is gone: take it out of ENGINE_NAMES`);
}
assert.deepEqual(problems, [], problems.join("\n"));

const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
console.log(`Checked the engines' names: ${files.length} engine files, ${total} places in ${Object.keys(counts).length} of them naming one of ${NAMES.length} component names, each file at its number in ENGINE_NAMES.`);
