import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { projectRoot } from "../../src/shared/paths.mjs";

// The systems under src/ stay apart (docs/internals.md, "Where things live"): render, editor and
// workbench each import only themselves and src/shared/ (the contracts between systems); only
// src/server/ (which wires them into dev:local) and src/cli/ (the gallery command) import several.
// Code that runs in the browser (the kit, the editor's page modules, the workbench app) imports
// nothing that needs Node.

const source = path.join(projectRoot, "src");
const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(mjs|js|ts|tsx|mts)$/.test(entry.name) && !entry.name.endsWith(".d.mts") && !entry.name.endsWith(".d.ts")) files.push(full);
  }
};
walk(source);

const importsOf = (file) => [...fs.readFileSync(file, "utf8").matchAll(/(?:^|\n)\s*(?:import|export)\s[^;]*?from\s*["']([^"']+)["']|(?:^|\n)\s*import\s*["']([^"']+)["']|\bimport\(\s*["']([^"']+)["']\s*\)/g)]
  .map((match) => match[1] ?? match[2] ?? match[3]);
const systemOf = (file) => path.relative(source, file).split(path.sep)[0];
const BROWSER = ["render/kit", "editor/page", "editor/components", "workbench/app"].map((part) => path.join(source, ...part.split("/")));
// A component's file.mjs and components/files.mjs are the server's (how it writes the components).
const serverOnly = (file) => file.startsWith(path.join(source, "editor", "components") + path.sep) && /^files?\.mjs$/.test(path.basename(file));
const inBrowser = (file) => BROWSER.some((directory) => file.startsWith(directory + path.sep)) && !serverOnly(file);
// The editor's browser modules are served as they are (src/server/routes.mjs), not bundled: they
// import only by relative path.
const RAW = ["editor/page", "editor/components"].map((part) => path.join(source, ...part.split("/")));
const served = (file) => RAW.some((directory) => file.startsWith(directory + path.sep)) && !serverOnly(file);
const MAY_IMPORT = { shared: ["shared"], render: ["shared", "render"], editor: ["shared", "editor"], workbench: ["shared", "workbench"] };

// A module whose text holds imports of the code it writes, which are no imports of its own.
const WRITES_IMPORTS = ["src/cli/release-build.mjs"];

const needsNode = new Map();
const nodeOnly = (file) => {
  if (!needsNode.has(file)) {
    needsNode.set(file, false);
    needsNode.set(file, importsOf(file).some((spec) => spec.startsWith("node:")
      || (spec.startsWith(".") && fs.existsSync(path.resolve(path.dirname(file), spec)) && nodeOnly(path.resolve(path.dirname(file), spec)))));
  }
  return needsNode.get(file);
};

const problems = [];
for (const file of files) {
  const system = systemOf(file);
  const shown = path.relative(projectRoot, file).split(path.sep).join("/");
  for (const spec of importsOf(file)) {
    if (!spec.startsWith(".")) {
      if (inBrowser(file) && spec.startsWith("node:")) problems.push(`${shown}: runs in the browser but imports ${spec}`);
      else if (served(file)) problems.push(`${shown}: is served to the preview as it is but imports ${spec} (only relative imports resolve there)`);
      continue;
    }
    const target = path.resolve(path.dirname(file), spec);
    if (!target.startsWith(source + path.sep)) {
      if (!/sdk[\\/]/.test(target)) problems.push(`${shown}: imports ${spec}, outside src/`);
      continue;
    }
    if (/\.m?js$/.test(spec) && !fs.existsSync(target) && !WRITES_IMPORTS.includes(shown)) problems.push(`${shown}: imports ${spec}, which does not exist`);
    const other = systemOf(target);
    if (MAY_IMPORT[system] && !MAY_IMPORT[system].includes(other)) problems.push(`${shown}: ${system} imports ${other} (${spec}); systems meet only in src/shared/ and src/server/`);
    if (inBrowser(file) && fs.existsSync(target) && nodeOnly(target)) problems.push(`${shown}: runs in the browser but imports ${spec}, which needs Node`);
    if (inBrowser(file) && serverOnly(target)) problems.push(`${shown}: runs in the browser but imports ${spec}, which is the server's (never served)`);
  }
}
// The launcher (src/cli/bin.mjs, package.json's bin: the package's bin/gallery.mjs) imports the
// dispatcher beside it and nothing else, by a dynamic import (its Node check comes first, in syntax
// any Node reads).
{
  const imports = importsOf(path.join(source, "cli", "bin.mjs"));
  if (imports.join() !== "./gallery.mjs") problems.push(`src/cli/bin.mjs: imports ${imports.join(", ") || "nothing"}; the launcher imports ./gallery.mjs only`);
}
assert.deepEqual(problems, [], problems.join("\n"));
assert.ok(files.length > 40, "the source tree was found");

// The editing tools (a folder of editor/page/: typing/, handle/, format-bar/ ...) import the shared
// files of page/ and the components' modules, and no other tool's folder but these (docs/editor.md,
// "Where the editing tools live"). A listed pair that no import uses any more is a stale entry.
const TOOL_IMPORTS = [
  "at-menu -> clipboard",       // what an address pasted is
  "at-menu -> links",           // the list of pages, a page block
  "block-menu -> format-bar",   // the colors' rings
  "block-menu -> slash-menu",   // the rows of types
  "changes -> annotate",        // a block's text as the server reads it (anchors.mjs readText)
  "clipboard -> formula",       // the formula a paste makes
  "clipboard -> links",         // the address rule
  "format-bar -> formula",      // its formula button opens the box
  "fold -> outline",            // the headings the outline lists (read.mjs), its folds' store (folds.mjs)
  "format-bar -> links",        // its link button opens the card
  "links -> clipboard",         // a bookmark view is built as a pasted block
  "media-menu -> emoji-picker", // the picker's popup layer
  "table -> block-menu",        // the color rows
  "table -> format-bar",        // the cells' bar is the bar's look
  "table -> formula",           // a formula in a cell
];
const pageDirectory = path.join(source, "editor", "page") + path.sep;
const toolOf = (file) => (file.startsWith(pageDirectory) && path.relative(pageDirectory, file).includes(path.sep) ? path.relative(pageDirectory, file).split(path.sep)[0] : null);
const toolEdges = new Set();
for (const file of files) {
  const tool = toolOf(file);
  if (!tool) continue;
  for (const spec of importsOf(file)) {
    if (!spec.startsWith(".")) continue;
    const other = toolOf(path.resolve(path.dirname(file), spec));
    if (other && other !== tool) toolEdges.add(`${tool} -> ${other}`);
  }
}
assert.deepEqual([...toolEdges].filter((edge) => !TOOL_IMPORTS.includes(edge)), [], "a tool imports another tool's folder: move what is shared into page/, or list it here and in docs/editor.md");
assert.deepEqual(TOOL_IMPORTS.filter((edge) => !toolEdges.has(edge)), [], "a listed tool import is no longer made: take it off this list and out of docs/editor.md");

// An engine, whatever is outside src/editor/components/, imports of a component's folder its index.mjs
// alone: it reads what a component is there and reaches what it does through the page objects it is
// handed (components/pages.mjs, docs/editor.md "Component definitions"). The listed imports are the ones
// left, each with why; a listed one that no import makes any more is a stale entry.
const COMPONENT_IMPORTS = [
  "page/convert.mjs -> flowchart/page.mjs",           // the structural conversions: a list and a flowchart made of each other
  "page/convert.mjs -> list/page.mjs",
  "page/convert.mjs -> list/join.mjs",                // whether two lists a group left side by side are one
  "page/core.mjs -> table/grid.mjs",                  // the baseline of a table's rows and cells, which the commits compare
  "page/table/cells.mjs -> table/page.mjs",           // table/ is the table's own editing, in the tools' folders for its size
  "page/table/index.mjs -> table/grid.mjs",
  "page/table/index.mjs -> table/page.mjs",
  "page/table/index.mjs -> table/slots.mjs",
  "page/table/views.mjs -> table/grid.mjs",          // what a view of the table asks, made by the table's own operations
  "page/table/views.mjs -> table/page.mjs",
  "page/table/widths.mjs -> table/page.mjs",
  "source/apply.mjs -> sheets/file.mjs",              // the file's tabs, which apply.mjs and natural.mjs write as the format's structure
  "source/natural.mjs -> sheets/file.mjs",
];
const componentDirectory = path.join(source, "editor", "components") + path.sep;
const engineDirectory = path.join(source, "editor") + path.sep;
const componentImports = new Set();
for (const file of files) {
  if (file.startsWith(componentDirectory)) continue;
  for (const spec of importsOf(file)) {
    const target = spec.startsWith(".") ? path.resolve(path.dirname(file), spec) : "";
    const inFolder = target.startsWith(componentDirectory) ? path.relative(componentDirectory, target).split(path.sep) : [];
    if (inFolder.length === 2 && inFolder[1] !== "index.mjs") componentImports.add(`${path.relative(engineDirectory, file).split(path.sep).join("/")} -> ${inFolder.join("/")}`);
  }
}
assert.deepEqual([...componentImports].filter((edge) => !COMPONENT_IMPORTS.includes(edge)), [], "an engine imports a module of a component's folder other than its index.mjs: read it from the index.mjs, or from the page objects the editor hands it (components/pages.mjs)");
assert.deepEqual(COMPONENT_IMPORTS.filter((edge) => !componentImports.has(edge)), [], "a listed import of a component's module is no longer made: take it off this list");

// The blocks that come out of the tree with their folder and their lines in the manifests (docs/editor.md,
// "Components"): nothing but those manifests imports their folders, whatever the file.
const COMES_OUT = ["bookmark", "callout", "code", "details", "divider", "embed", "file", "highlight", "image", "quote", "section", "widget"];
const MANIFESTS = ["registry.mjs", "pages.mjs", "builders.mjs", "files.mjs"].map((name) => path.join(componentDirectory, name));
const leaning = files.flatMap((file) => {
  const own = path.relative(componentDirectory, file).split(path.sep)[0];
  if (MANIFESTS.includes(file)) return [];
  return importsOf(file).filter((spec) => {
    const target = spec.startsWith(".") ? path.resolve(path.dirname(file), spec) : "";
    const [folder] = target.startsWith(componentDirectory) ? path.relative(componentDirectory, target).split(path.sep) : [];
    return COMES_OUT.includes(folder) && folder !== own;
  }).map((spec) => `${path.relative(projectRoot, file).split(path.sep).join("/")} -> ${spec}`);
});
assert.deepEqual(leaning, [], "a module imports the folder of a block that comes out of the tree whole: read it from a field of its definition (docs/editor.md, \"Component definitions\"), or from src/shared/ when it is no component's");

// editor.mjs names components by their definitions alone: index.mjs, the registry and pages.mjs, the
// one module that imports the page modules to make them. It lists every one of them.
const editorImports = importsOf(path.join(pageDirectory, "editor.mjs")).filter((spec) => spec.startsWith("../components/"));
assert.deepEqual(editorImports.filter((spec) => !/^\.\.\/components\/(?:registry|pages|[a-z]+\/index)\.mjs$/.test(spec)), [], "editor.mjs imports a component's module other than its index.mjs: it comes through components/pages.mjs");
const listed = importsOf(path.join(componentDirectory, "pages.mjs")).map((spec) => path.resolve(componentDirectory, spec));
const factories = files.filter((file) => file.startsWith(componentDirectory) && /^export function create\(/m.test(fs.readFileSync(file, "utf8")));
assert.deepEqual(factories.filter((file) => !listed.includes(file)).map((file) => path.relative(projectRoot, file)), [], "a component's page module has a create(ctx) that components/pages.mjs does not list");
assert.deepEqual(listed.filter((file) => !factories.includes(file)).map((file) => path.relative(projectRoot, file)), [], "components/pages.mjs lists a module with no create(ctx)");

// A block made again from the clipboard's description by a page module (`build`) is listed in
// builders.mjs, which is what reaches it: the worker and the unit tests have no page objects.
const builds = importsOf(path.join(componentDirectory, "builders.mjs")).filter((spec) => spec.endsWith("/page.mjs")).map((spec) => path.resolve(componentDirectory, spec));
const building = files.filter((file) => file.startsWith(componentDirectory) && /^export function build\(/m.test(fs.readFileSync(file, "utf8")));
assert.deepEqual(building.filter((file) => !builds.includes(file)).map((file) => path.relative(projectRoot, file)), [], "a component's page module has a `build` that components/builders.mjs does not list");
assert.deepEqual(builds.filter((file) => !building.includes(file)).map((file) => path.relative(projectRoot, file)), [], "components/builders.mjs lists a module with no `build`");

console.log(`Checked boundaries: ${files.length} source files, each system importing only itself and src/shared/, browser code without Node or the server's component modules, the editor's served modules by relative path only, every import resolving to a file, the editing tools importing only the other tools listed, the engines importing only a component's index.mjs but those listed, nothing but the manifests importing the folder of a block that comes out whole, editor.mjs making the components' pages through pages.mjs alone, which lists all ${factories.length}, and builders.mjs listing the ${builds.length} that make a block again.`);
