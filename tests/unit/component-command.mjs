import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { packageNamed } from "../../src/cli/component.mjs";
import { readSections, sectionLines } from "../../src/cli/component-check.mjs";
import { lookAtPackage } from "../../src/cli/component-look.mjs";
import { packageFiles } from "../../src/cli/component-scaffold.mjs";
import { slotReach, styleReach } from "../../src/cli/component-style.mjs";
import { diagnoseScript } from "../../src/render/typecheck.mjs";
import { componentSettings, forgetCatalog } from "../../src/shared/component-catalog.mjs";
import { fingerprintOf, recipeFiles, shippedBlock, writingOrder } from "../../src/shared/shipped-blocks.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { shallowPackages } from "../../src/shared/workspace.mjs";
import { findBrowser, startBrowser } from "../../src/transfer/browser.mjs";

// gallery block (src/cli/component.mjs, docs/internals.md), and gallery component, its other name, which
// says the same: each subcommand run as a user runs it, in a workspace of the test's own. add puts one of
// Gallery's own blocks in as it ships and records it, updates a copy as it was added and never one
// changed since; new refuses the scope gallery and makes a block of one of Gallery's with --recipe,
// every word that named it naming the new id; list says the blocks by where they stand, and Gallery's
// own not added yet, behind, or changed since with a newer one of Gallery's (how to take it). new makes a package that loads (with --flow a slot, which show says by
// its mark), refuses an id that is taken or
// that no package can have and writes nothing over what is there; list says what there is to write
// with, then what is not and why (hidden, disabled, does not load, a manifest one level too shallow);
// show says how to write one, and why not when it cannot be used. check says each thing wrong at its
// place: a scaffold and a fixture pass, and a package with one thing wrong fails with that thing, at
// its line, and nothing else; so does the broken fixture of tests/fixtures/component-check/, with one
// thing wrong in each that can be read, and the piling one, wrong as it runs, in a real browser where
// the machine has one (each thing a page can say by a script written for it), and what writes back
// says its way back, with a note on a write that lays its part out anew and on a list that cancels
// dragover alone (the fixtures laid-anew and dragover-only); a package with a slot passes, a note on a
// rule of its style that goes down into the slot, and the slot-writer fixture, which writes in its slot a
// moment after it mounts (what it wrote as it mounted the kit would put back and fail it for itself),
// fails with that alone. With no browser, or a
// folder it cannot write, the rest stands and it exits 3; a page that stops answering or leaves itself
// ends the check all the same, with its verdict.

const run = promisify(execFile);
const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-component-"));
const workspace = path.join(root, "workspace");
// The last argument may be what the command runs with beside the test's environment: { env }.
const gallery = async (...args) => {
  const { env = {} } = typeof args.at(-1) === "object" ? args.pop() : {};
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, "--workspace", workspace, "component", ...args], { cwd: root, env: { ...process.env, GALLERY_DEFAULT_WORKSPACE: workspace, ...env, GALLERY_NO_PREVIEW: "1", GALLERY_NO_BROWSER: "1" }, maxBuffer: 1 << 24 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
const folderOf = (id) => path.join(workspace, "components", ...id.split("/"));
const filesIn = (id) => fs.readdirSync(folderOf(id)).sort();
const fixture = (id) => path.join(projectRoot, "tests", "fixtures", "components", ...id.split("/"));
// The problems of what reads files alone, each as "file:line: what", one section's or all of them.
const problemsOf = (id, section = null) => {
  forgetCatalog(workspace);
  const { sections } = readSections(workspace, id);
  return sections.filter((_, index) => section === null || index === section - 1).flatMap(({ problems = [] }) => problems).map(({ file, line, what }) => `${file}${line ? `:${line}` : ""}: ${what}`);
};
const notesOf = (id, section) => {
  forgetCatalog(workspace);
  return (readSections(workspace, id).sections[section - 1].notes ?? []).map(({ file, line, what }) => `${file}${line ? `:${line}` : ""}: ${what}`);
};

try {
  // The ids: a name alone is local's, and what no package can be is a mistake in the command line.
  assert.equal(packageNamed("kanban"), "local/kanban");
  assert.equal(packageNamed("team/kanban"), "team/kanban");
  for (const id of ["Kanban", "a/b/c", "/a", "a/", "a b", "local/-a", "con", "local/nul", "lpt1/a"]) assert.throws(() => packageNamed(id), /Not a block's id/, id);

  // What it writes: a static block has no script, --script has one and a `runtime` for what it draws.
  assert.deepEqual(Object.keys(packageFiles("local/a")), ["component.json", "template.html", "example.html", "writing.md", "style.css"], "the manifest first, no kit.js");
  assert.ok(!packageFiles("local/a")["component.json"].includes("runtime"));
  assert.ok(!packageFiles("local/a")["writing.md"].includes("kit.js"));
  const scripted = packageFiles("local/a", { script: true });
  assert.deepEqual(Object.keys(scripted).at(-1), "kit.js");
  assert.deepEqual(JSON.parse(scripted["component.json"]).runtime, { generated: [".component-drawn"] });
  assert.ok(scripted["writing.md"].includes("with the rights of a document's own script"), "a script's rights are said where its writer reads");
  // --flow: a slot, body, in place of the text paragraph: none in the template's but an empty paragraph,
  // a paragraph and a list in the example's, no class on it, and how to write it in writing.md.
  const slotted = packageFiles("local/a", { flow: true });
  assert.deepEqual(JSON.parse(slotted["component.json"]).parts, { title: { at: ":scope > h3", edit: "text" }, body: { edit: "flow" } });
  assert.ok(slotted["template.html"].includes('  <div data-doc-slot="body">\n    <p></p>\n  </div>\n</div>'), slotted["template.html"]);
  assert.match(slotted["example.html"], /<div data-doc-slot="body">\n {4}<p>[^<]+<\/p>\n {4}<ul>\n( {6}<li>[^<]+<\/li>\n){2} {4}<\/ul>\n {2}<\/div>/);
  assert.ok(slotted["writing.md"].includes('its `<div data-doc-slot="body">`: required, the document\'s own blocks'), slotted["writing.md"]);
  assert.ok(packageFiles("local/a", { flow: true, script: true })["writing.md"].includes("outside the slot: it reads the slot and never writes in it"));

  // Nothing there yet: said, with where a package comes from.
  const nothing = await gallery("list");
  assert.equal(nothing.code, 0);
  assert.match(nothing.stdout, /No custom blocks yet\..*gallery block add <name>.*gallery block new <id>/);
  assert.match(nothing.stdout, /Gallery's own blocks, to add as they are \(no check or try needed\):\ngallery\/chart-view  图表 \/ Chart  \d+\.\d+\.\d+  \(documents\)\n  说明：.*\n  gallery block add chart-view\n/, "and Gallery's own, each with its line");
  assert.ok(nothing.stdout.startsWith(`工作区：${path.resolve(workspace)}`), nothing.stdout);

  // new, with the default scope; what it says next names the check.
  const made = await gallery("new", "strip");
  assert.equal(made.code, 0, made.stderr);
  assert.ok(made.stdout.includes(`Created ${folderOf("local/strip")}: component.json, template.html, example.html, writing.md, style.css`), made.stdout);
  assert.match(made.stdout, /下一步：.*references\/building-blocks\.md.*gallery block check local\/strip/);
  assert.deepEqual(filesIn("local/strip"), ["component.json", "example.html", "style.css", "template.html", "writing.md"]);
  assert.equal((await gallery("new", "--script", "team/ticker")).code, 0);
  assert.ok(filesIn("team/ticker").includes("kit.js"));
  const flowed = await gallery("new", "--flow", "--script", "team/slotted");
  assert.equal(flowed.code, 0, flowed.stderr);
  assert.match(flowed.stdout, /下一步：.*references\/building-blocks\.md has every field and the rules, and Slots what its slot body holds; references\/block-script\.md its script and how it writes back\)/);
  assert.doesNotMatch(made.stdout, /block-script|pages-and-data/, "a block with no script and no card points to building-blocks.md alone");
  assert.ok(filesIn("team/slotted").includes("kit.js"));
  // show says a slot by its mark, and what goes in it.
  const slotShown = await gallery("show", "team/slotted");
  assert.ok(slotShown.stdout.includes("Parts (edit text: the user types there; flow: blocks of the document; none, or data: the component's):\n  title  :scope > h3  text\n  body  data-doc-slot=\"body\"  flow (blocks of the document: write any block in it)\n"), slotShown.stdout);
  fs.rmSync(folderOf("team/slotted"), { recursive: true });

  // --data: a block that keeps what a reader enters, its part a script of JSON on one line (as editJSON
  // writes it), a kit.js that reads it with readJSON, writes it with editJSON from a field (DocKit.input) and
  // buttons drawn hidden where nothing is written, and an example() that adds a line by the function the
  // field calls (so that it works on template.html's empty instance); --page: places page and a card, its
  // text parts edited as none, no kit.js; alone, together, and refused with --flow (a slot).
  const dataMade = await gallery("new", "--data", "team/ledger");
  assert.equal(dataMade.code, 0, dataMade.stderr);
  assert.deepEqual(filesIn("team/ledger"), ["component.json", "example.html", "kit.js", "style.css", "template.html", "writing.md"], "--data implies a kit.js");
  const ledgerKit = fs.readFileSync(path.join(folderOf("team/ledger"), "kit.js"), "utf8");
  for (const said of ['context.readJSON("items")', 'context.editJSON("items"', "DocKit.input(field", "example(host, context)", "remove.hidden = !writes", "field.hidden = !writes", "addItem(context, \"又一条\")"]) assert.ok(ledgerKit.includes(said), `the --data kit.js says ${said}`);
  assert.equal(fs.readFileSync(path.join(folderOf("team/ledger"), "template.html"), "utf8"), '<div data-doc-component="team/ledger">\n  <h3>标题</h3>\n  <script type="application/json">{"items":[]}</script>\n</div>\n', "the template's JSON on one line, as editJSON writes it");
  assert.ok(fs.readFileSync(path.join(folderOf("team/ledger"), "example.html"), "utf8").includes('{"items":[{"text":"第一条"},{"text":"第二条"}]}'));
  const ledgerManifest = JSON.parse(fs.readFileSync(path.join(folderOf("team/ledger"), "component.json"), "utf8"));
  assert.deepEqual([ledgerManifest.parts.items, ledgerManifest.places, ledgerManifest.card, ledgerManifest.runtime], [{ at: ":scope > script", edit: "data" }, undefined, undefined, { generated: [".component-drawn"] }]);
  assert.match(dataMade.stdout, /It keeps a list of lines \(the part items, a script of JSON on one line, as context\.editJSON writes it\)/);
  assert.match(dataMade.stdout, /gallery block try <slug> --type \.component-field "words" --then Enter/);
  assert.equal((await gallery("show", "team/ledger")).code, 0, "a --data block loads");
  const pageMade = await gallery("new", "--page", "team/glance");
  assert.equal(pageMade.code, 0, pageMade.stderr);
  assert.deepEqual(filesIn("team/glance"), ["component.json", "example.html", "style.css", "template.html", "writing.md"], "--page alone has no kit.js");
  const glanceManifest = JSON.parse(fs.readFileSync(path.join(folderOf("team/glance"), "component.json"), "utf8"));
  assert.deepEqual([glanceManifest.places, glanceManifest.card, glanceManifest.parts.title.edit, glanceManifest.parts.text.edit], [["page"], { sizes: [[4, 3], [2, 3]], resize: true }, "none", "none"]);
  assert.match(pageMade.stdout, /It is a custom page's card \(places \["page"\], a card of two sizes\): gallery page add <slug> team\/glance puts one on a page/);
  assert.match(pageMade.stdout, /references\/building-blocks\.md has every field and the rules; references\/pages-and-data\.md a card's size and settings and what it reads\)/, "a card's scaffold points to the page's reference");
  const bothMade = await gallery("new", "--data", "--page", "team/pagedata");
  assert.equal(bothMade.code, 0, bothMade.stderr);
  assert.deepEqual(filesIn("team/pagedata"), ["component.json", "example.html", "kit.js", "style.css", "template.html", "writing.md"]);
  const bothManifest = JSON.parse(fs.readFileSync(path.join(folderOf("team/pagedata"), "component.json"), "utf8"));
  assert.deepEqual([bothManifest.places, bothManifest.parts.items.edit, bothManifest.parts.title.edit], [["page"], "data", "none"]);
  assert.match(bothMade.stdout, /gallery page try <slug> <card id> <gesture> tries a reader's gesture on it \(--type \.component-field "words" --then Enter\)/);
  for (const id of ["team/ledger", "team/glance", "team/pagedata"]) fs.rmSync(folderOf(id), { recursive: true });

  // Taken: refused, nothing changed. A folder with no manifest is taken too.
  const before = fs.readFileSync(path.join(folderOf("local/strip"), "style.css"), "utf8");
  fs.writeFileSync(path.join(folderOf("local/strip"), "style.css"), `${before}/* mine */\n`);
  for (const id of ["strip", "local/strip"]) {
    const taken = await gallery("new", id);
    assert.deepEqual([taken.code, taken.stderr.trim()], [1, `Block already exists: ${folderOf("local/strip")}: gallery block show local/strip says what it is; give a new one another name.`]);
  }
  assert.ok(fs.readFileSync(path.join(folderOf("local/strip"), "style.css"), "utf8").endsWith("/* mine */\n"), "what was there stays");
  fs.mkdirSync(folderOf("local/begun"), { recursive: true });
  const begun = await gallery("new", "begun");
  assert.deepEqual([begun.code, begun.stderr.trim()], [1, `A folder is there with no component.json: ${folderOf("local/begun")}: move it, or give this block another name.`], "a folder of that name is taken, and it is no component");

  // A bad id, as a command line's mistake.
  const bad = await gallery("new", "Bad");
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /^Not a block's id: Bad .*\nUsage: gallery block new <id> \(\[--script\] \[--flow\] \[--data\] \[--page\] \| --recipe <name>\) {3}\(/);
  assert.equal(fs.existsSync(folderOf("local/Bad")), false);

  // list: those to write with, then the others and why; a manifest too shallow, whatever else there is.
  fs.mkdirSync(folderOf("local/broken"), { recursive: true });
  fs.writeFileSync(path.join(folderOf("local/broken"), "component.json"), '{ "id": "local/broken", "apiVersion": 1, "version": "2.0.0", "bogus": 1 }');
  fs.mkdirSync(folderOf("local/future"), { recursive: true });
  fs.writeFileSync(path.join(folderOf("local/future"), "component.json"), '{ "id": "local/future", "apiVersion": 99, "version": "3.0.0" }');
  fs.mkdirSync(path.join(workspace, "components", "flat"), { recursive: true });
  fs.writeFileSync(path.join(workspace, "components", "flat", "component.json"), "{}");
  assert.deepEqual(shallowPackages(workspace).map(({ name }) => name), ["flat"]);
  assert.equal((await gallery("new", "hidden-one")).code, 0);
  assert.equal((await gallery("new", "off")).code, 0);
  const marker = path.join(workspace, "gallery.json");
  const settings = JSON.parse(fs.readFileSync(marker, "utf8"));
  fs.writeFileSync(marker, JSON.stringify({ ...settings, components: { hidden: ["local/hidden-one", "callout", "paragraph", "divider", "nothing", 3], disabled: ["local/off"] } }));
  assert.deepEqual(componentSettings(workspace), { hidden: ["local/hidden-one", "callout", "paragraph", "divider", "nothing"], disabled: ["local/off"], shown: [], unlisted: [], listed: [], net: {}, packs: {}, packsOff: [] }, "what is no id is left out");
  // A block of a custom page's alone, and one of both places: each in its group, one of both said whole once.
  for (const [id, places] of [["local/board", ["page"]], ["local/both", ["document", "page"]]]) {
    assert.equal((await gallery("new", id)).code, 0);
    const manifestFile = path.join(folderOf(id), "component.json");
    fs.writeFileSync(manifestFile, JSON.stringify({ ...JSON.parse(fs.readFileSync(manifestFile, "utf8")), places, ...(id === "local/board" ? { needs: ["workspace"] } : {}) }));
  }
  const listed = await gallery("list");
  assert.equal(listed.code, 0);
  const lines = listed.stdout.trimEnd().split(/\r?\n/);
  const block = (id, version = "（available）") => [`${id}  ${id.split("/")[1]}`, `  版本：0.1.0${version}`, "  说明：一个可以反复使用的块 / A block to use again"];
  assert.equal(lines[1], "文档里可用 (in documents: 4; gallery block show <id> says how to write each):");
  assert.deepEqual(lines.slice(2, 14), [...block("local/both"), ...block("local/hidden-one", "（available; not in the document's menus, by the user's switch, and a document can still write it）"), ...block("local/strip"), ...block("team/ticker")], "a block the user's switch keeps out of the menus is still one to write with");
  assert.equal(lines[14], "自定义页可用 (on custom pages: 2):");
  assert.deepEqual(lines.slice(15, 20), [...block("local/board"), "  要用：workspace", "local/both  both  (above: in documents too)"], "a page's alone in full, with what it uses; one of both by a line");
  assert.equal(lines[20], "Not to use now:");
  assert.match(lines[21], /^local\/off {2}off {2}0\.1\.0 {2}disabled by the user: /);
  assert.equal(lines[22], "local/broken  does not load: bogus is no field a custom block's manifest writes");
  assert.equal(lines[23], "local/future  3.0.0  does not load: it needs apiVersion 99, and this Gallery runs 1");
  assert.match(lines[24], /components[\\/]flat[\\/]component\.json is one level too shallow, and no catalog reads it: a custom block is components\/<scope>\/<name>\/, so move it to components\/local\/flat\/$/);
  assert.equal(lines[25], "Gallery's own blocks, to add as they are (no check or try needed):");
  assert.equal(lines.at(-1), "Built-in blocks the user took out of the document's menus (a document can still write them): callout, divider", "the Agent's list is what hiding a built-in block reaches, and no name that hides nothing");
  for (const id of ["local/board", "local/both"]) fs.rmSync(folderOf(id), { recursive: true });

  // show: its state, its parts, how to write it and its example, from the package's own files.
  const shown = await gallery("show", "team/ticker");
  assert.equal(shown.code, 0, shown.stderr);
  assert.ok(shown.stdout.startsWith("team/ticker  ticker\n  版本：0.1.0（available）\n"), shown.stdout);
  assert.ok(shown.stdout.includes("\n  title  :scope > h3  text\n  text  :scope > p  text  (optional)\n"), shown.stdout);
  assert.ok(shown.stdout.includes(`How to write it (writing.md):\n${fs.readFileSync(path.join(folderOf("team/ticker"), "writing.md"), "utf8").trimEnd()}\n`), shown.stdout);
  assert.ok(shown.stdout.includes(`The example (example.html):\n${fs.readFileSync(path.join(folderOf("team/ticker"), "example.html"), "utf8").trimEnd()}\n`), shown.stdout);
  assert.match((await gallery("show", "hidden-one")).stdout, /版本：0\.1\.0（available; not in the document's menus, by the user's switch）/);
  assert.match((await gallery("show", "off")).stdout, /版本：0\.1\.0（disabled by the user）/);
  assert.ok(shown.stdout.includes("\n  用在：documents\n"), "where it may stand");
  fs.rmSync(path.join(folderOf("local/strip"), "writing.md"));
  fs.rmSync(path.join(folderOf("local/strip"), "example.html"));
  const bare = await gallery("show", "strip");
  assert.match(bare.stdout, /How to write it: the block has no writing\.md\.\nThe example: the block has no example\.html\./);

  // show of what cannot be used: why, exit 1.
  for (const [id, said] of [
    ["broken", /^local\/broken does not load: bogus is no field/],
    ["flat", /flat[\\/]component\.json is one level too shallow/],
    ["nothing", /^No block local\/nothing in .*: gallery block list says which there are\./],
    ["gallery/nope", /^No block gallery\/nope in .*: gallery block list says which there are\./],
  ]) {
    const refused = await gallery("show", id);
    assert.equal(refused.code, 1, id);
    assert.match(refused.stderr, said);
  }
  // check of one of Gallery's own that is not added says how it gets in; show prints what Gallery ships of it
  // (its parts, writing.md, its example) and ends with the line that adds it, for a block of a page and of a document.
  const unaddedCheck = await gallery("check", "gallery/card");
  assert.equal(unaddedCheck.code, 1);
  assert.match(unaddedCheck.stderr, /^No block gallery\/card in .*: it is one of Gallery's own, which gallery block add card puts in\./);
  const unadded = await gallery("show", "gallery/habit");
  assert.equal(unadded.code, 0, unadded.stderr);
  assert.ok(unadded.stdout.startsWith("gallery/habit  习惯打卡 / Habit tracker\n  版本：2.0.0（Gallery's own, not in this workspace yet）\n  说明：") && unadded.stdout.includes("  用在：custom pages\n"), unadded.stdout);
  assert.ok(unadded.stdout.includes("  habit  :scope > script  data\n") && unadded.stdout.includes("How to write it (writing.md):\n# 习惯打卡 (gallery/habit)") && unadded.stdout.includes('The example (example.html):\n<div data-doc-component="gallery/habit">'), unadded.stdout);
  assert.ok(unadded.stdout.trimEnd().split("\n").at(-1) === "Not in this workspace yet: gallery block add habit puts it in as it ships (no check, no try), and gallery page add <slug> habit puts a card of it on a custom page.", unadded.stdout);
  const unaddedCard = await gallery("show", "gallery/card");
  assert.equal(unaddedCard.code, 0, unaddedCard.stderr);
  assert.ok(unaddedCard.stdout.trimEnd().split("\n").at(-1).startsWith("Not in this workspace yet: gallery block add card puts it in as it ships (no check, no try), and a document writes it as the example above does"), unaddedCard.stdout);
  assert.ok(!fs.existsSync(folderOf("gallery/habit")) && !fs.existsSync(folderOf("gallery/card")), "show adds nothing");
  // A <name> alone that no block of local's is and one of Gallery's own is, is Gallery's, as add takes it (show and check):
  // testing the skill with Agents, 2026-11-09, had `show heatmap` refused, "No block local/heatmap", while `add heatmap` took it.
  const bareOwn = await gallery("show", "habit");
  assert.equal(bareOwn.code, 0, bareOwn.stderr);
  assert.equal(bareOwn.stdout, unadded.stdout, "show habit is show gallery/habit");
  const bareCheck = await gallery("check", "card");
  assert.equal(bareCheck.code, 1);
  assert.match(bareCheck.stderr, /^No block gallery\/card in .*: it is one of Gallery's own, which gallery block add card puts in\./);
  // The scope local, written, is a block of the workspace's own, with a hint where Gallery has one of the name; a block of the
  // workspace's own by that name is local's, bare or written, and one that does not load is said so, not taken for Gallery's.
  const writtenLocal = await gallery("show", "local/habit");
  assert.equal(writtenLocal.code, 1);
  assert.match(writtenLocal.stderr, /^No block local\/habit in .*: gallery block list says which there are; Gallery has a block of that name, gallery\/habit\.$/m);
  assert.equal((await gallery("new", "habit")).code, 0);
  assert.ok((await gallery("show", "habit")).stdout.startsWith("local/habit  habit\n"), "a block of local's by a name Gallery has one of is local's");
  assert.ok((await gallery("show", "local/habit")).stdout.startsWith("local/habit  habit\n"));
  fs.rmSync(folderOf("local/habit"), { recursive: true, force: true });

  // The command line.
  for (const [args, said] of [
    [[], /^Say what to do: new, add, list, show, check, try, key, pack, menu, net\./],
    [["key", "https://api.example.com"], /^Not a host a block's needs can name: https:\/\/api\.example\.com/],
    [["key", "api.example.com", "a", "b"], /^gallery block key takes a host and its key/],
    [["key", "api.example.com", "a", "--remove"], /^gallery block key <host> --remove takes no key\./],
    [["key", "api.example.com", "two\nlines"], /^A key is one line of characters, not empty\./],
    [["list", "--remove"], /^--remove goes with key, not list\./],
    [["bogus"], /^No such block command: bogus/],
    [["list", "x"], /^gallery block list takes nothing else\./],
    [["show"], /^gallery block show takes one id\./],
    [["show", "a", "b"], /^gallery block show takes one id\./],
    [["add"], /^gallery block add takes one name of Gallery's own blocks: card, chart-card, chart-view, countdown, habit, heatmap, kanban, metric, note, recent, static, stats, today, todos, weather, gallery-soft\/countdown, gallery-soft\/habit, gallery-soft\/heatmap, gallery-soft\/note, gallery-soft\/recent, gallery-soft\/static, gallery-soft\/stats, gallery-soft\/today, gallery-soft\/todos, gallery-soft\/weather\./],
    [["add", "nope"], /^No block of Gallery's own is called nope: card, chart-card, chart-view, countdown, habit, heatmap, kanban, metric, note, recent, static, stats, today, todos, weather/],
    [["show", "a", "--recipe", "card"], /^--recipe goes with new, not show\./],
    [["new", "a", "--recipe", "card", "--script"], /^--recipe makes a block of what Gallery's card holds: --script goes with a new block of none\./],
    [["new", "a", "--recipe", "card", "--data"], /^--recipe makes a block of what Gallery's card holds: --data goes with a new block of none\./],
    [["new", "a", "--recipe", "card", "--page"], /^--recipe makes a block of what Gallery's card holds: --page goes with a new block of none\.(?! card already)/],
    [["new", "a", "--recipe", "todos", "--page"], /^--recipe makes a block of what Gallery's todos holds: --page goes with a new block of none\. todos already is a card for a custom page \(its places hold page\): leave --page out\./],
    [["new", "a", "--flow", "--data"], /^--flow and --data do not go together: /],
    [["new", "a", "--flow", "--page"], /^--flow and --page do not go together: a custom page renders no document's blocks, so a block for a page has no slot\./],
    [["show", "a", "--data"], /^--data goes with new, not show\./],
    [["check", "a", "--page"], /^--page goes with new, not check\./],
    [["show", "a", "--replace"], /^--replace goes with try, not show\./],
    [["new", "a", "--recipe", "nope"], /^No block of Gallery's own is called nope: card, chart-card, chart-view, countdown, habit, heatmap, kanban, metric, note, recent, static, stats, today, todos, weather, gallery-soft\/countdown, gallery-soft\/habit, gallery-soft\/heatmap, gallery-soft\/note, gallery-soft\/recent, gallery-soft\/static, gallery-soft\/stats, gallery-soft\/today, gallery-soft\/todos, gallery-soft\/weather\./],
    [["new", "gallery/mine"], /^The scope gallery\/ is kept for Gallery's own blocks: give yours another \(local\/<name>, or a <name> alone\)\./],
    [["new", "gallery/card"], /^The scope gallery\/ is kept for Gallery's own blocks: .*; gallery block add card puts Gallery's in, and gallery block new <id> --recipe card starts one of yours from it\./],
    [["show", "a", "--script"], /^--script goes with new, not show\./],
    [["check", "a", "--flow"], /^--flow goes with new, not check\./],
    [["show", "a", "--press", ".x"], /^--press goes with try, not show\./],
    [["check", "a", "--keep"], /^--keep goes with try, not check\./],
    [["new", "a", "--bogus"], /^Unknown option: --bogus/],
    [["show", "Bad"], /^Not a block's id: Bad/],
  ]) {
    const wrong = await gallery(...args);
    assert.equal(wrong.code, 2, args.join(" "));
    assert.match(wrong.stderr, said);
  }
  assert.ok(!fs.existsSync(folderOf("gallery/mine")) && !fs.existsSync(folderOf("local/a")), "what is refused writes nothing");

  // key: a host's key kept in .gallery/keys.json, said to be there and never printed, listed by host,
  // taken away; never in gallery.json.
  {
    const keys = path.join(workspace, ".gallery", "keys.json");
    const settings = fs.readFileSync(path.join(workspace, "gallery.json"), "utf8");
    assert.match((await gallery("key")).stdout, /^No key kept/);
    const kept = await gallery("key", "api.example.com", "s3cret key");
    assert.equal(kept.code, 0, kept.stderr);
    assert.ok(kept.stdout.startsWith("Kept the key for api.example.com in ") && !kept.stdout.includes("s3cret"), kept.stdout);
    assert.deepEqual(JSON.parse(fs.readFileSync(keys, "utf8")), { "api.example.com": "s3cret key" }, "kept by host");
    assert.equal(fs.readFileSync(path.join(workspace, "gallery.json"), "utf8"), settings, "gallery.json as it was");
    const said = await gallery("key", "api.example.com");
    assert.ok(said.stdout.startsWith("A key is kept for api.example.com (never printed)") && !said.stdout.includes("s3cret"), said.stdout);
    assert.match((await gallery("key")).stdout, /^Keys kept \(\.gallery\/keys\.json\), by host: api\.example\.com\./);
    assert.match((await gallery("key", "api.example.com", "--remove")).stdout, /^Took away the key for api\.example\.com\./);
    assert.deepEqual(JSON.parse(fs.readFileSync(keys, "utf8")), {}, "taken away");
    assert.match((await gallery("key", "api.example.com", "--remove")).stdout, /^No key kept for api\.example\.com: nothing to take away\./);
  }

  // add: one of Gallery's own, unchanged, recorded; again, nothing; a copy as it was added updated by a
  // newer Gallery; one changed since never. The block command's two names say the same.
  {
    const shippedSample = path.join(projectRoot, "src", "packs", "gallery", "metric");
    const added = await gallery("add", "metric");
    assert.equal(added.code, 0, added.stderr);
    assert.ok(added.stdout.startsWith(`Added gallery/metric 1.3.0: ${folderOf("gallery/metric")}\nIt is Gallery's, as it ships: no check or try is needed`), added.stdout);
    assert.deepEqual(filesIn("gallery/metric"), fs.readdirSync(shippedSample).sort(), "every file of it");
    for (const name of filesIn("gallery/metric")) assert.equal(fs.readFileSync(path.join(folderOf("gallery/metric"), name), "utf8"), fs.readFileSync(path.join(shippedSample, name), "utf8"), `${name} as it ships`);
    const record = JSON.parse(fs.readFileSync(path.join(workspace, ".gallery", "blocks.json"), "utf8"));
    assert.deepEqual(Object.keys(record), ["gallery/metric"]);
    assert.deepEqual([record["gallery/metric"].version, record["gallery/metric"].fingerprint], ["1.3.0", fingerprintOf(shippedSample)], "its version and what its files hold");
    const again = await gallery("add", "gallery/metric");
    assert.deepEqual([again.code, again.stdout.trim()], [0, `gallery/metric 1.3.0 is in already, as Gallery ships it: ${folderOf("gallery/metric")}`], "by its id too");
    const listedNow = (await gallery("list")).stdout;
    assert.ok(listedNow.includes("gallery/metric  指标 / Metric\n  版本：1.3.0（available）\n") && !listedNow.includes("gallery block add metric") && listedNow.includes("gallery block add chart-view"), listedNow);
    assert.equal((await run(process.execPath, [bin, "--workspace", workspace, "block", "show", "gallery/metric"], { env: { ...process.env, GALLERY_DEFAULT_WORKSPACE: workspace, GALLERY_NO_BROWSER: "1" } })).stdout, (await gallery("show", "gallery/metric")).stdout, "gallery block and gallery component say the same");
    // As an older Gallery added it: updated, a file the new one has not taken out.
    const older = JSON.stringify({ ...record, "gallery/metric": { version: "0.9.0", fingerprint: "" } });
    fs.writeFileSync(path.join(folderOf("gallery/metric"), "old.css"), "/* 0.9.0 */\n");
    fs.writeFileSync(path.join(workspace, ".gallery", "blocks.json"), older.replace('"fingerprint":""', `"fingerprint":"${fingerprintOf(folderOf("gallery/metric"))}"`));
    // What a system writes into a folder it shows after that (Finder's .DS_Store as the folder is opened
    // on a Mac, ._ files beside each on a disk of another format, Explorer's Thumbs.db) is nobody's change.
    const systemFiles = [".DS_Store", "._style.css", "Thumbs.db", "desktop.ini"];
    for (const name of systemFiles) fs.writeFileSync(path.join(folderOf("gallery/metric"), name), "the system's");
    assert.match((await gallery("list")).stdout, /gallery\/metric  指标 \/ Metric  1.3.0  \(documents\)\n.*\n  gallery block add metric   \(the workspace has 1.3.0: this updates it\)/, "list says one behind");
    const updated = await gallery("add", "metric");
    assert.ok(updated.code === 0 && updated.stdout.startsWith("Updated gallery/metric from 1.3.0 to 1.3.0"), updated.stdout + updated.stderr);
    assert.ok(!fs.existsSync(path.join(folderOf("gallery/metric"), "old.css")) && fingerprintOf(folderOf("gallery/metric")) === fingerprintOf(shippedSample), "the copy is Gallery's again");
    assert.ok(systemFiles.every((name) => fs.existsSync(path.join(folderOf("gallery/metric"), name))), "the system's files left where they are");
    const viewed = await gallery("add", "metric");
    assert.ok(viewed.code === 0 && viewed.stdout.startsWith("gallery/metric 1.3.0 is in already"), `with them there it is as it ships: ${viewed.stdout}${viewed.stderr}`);
    for (const name of systemFiles) fs.rmSync(path.join(folderOf("gallery/metric"), name));
    // Changed since: never replaced.
    fs.appendFileSync(path.join(folderOf("gallery/metric"), "style.css"), "/* mine */\n");
    const changed = await gallery("add", "metric");
    assert.equal(changed.code, 1);
    assert.match(changed.stderr, /metric was changed after gallery block add put it there \(or another hand put it there\), so it is not replaced: to keep those changes, make a block of your own from Gallery's with gallery block new <id> --recipe metric and move them into it; to take Gallery's 1.3.0, delete the folder and run gallery block add metric again\./);
    assert.ok(fs.readFileSync(path.join(folderOf("gallery/metric"), "style.css"), "utf8").endsWith("/* mine */\n"), "what was there stays");
    // Changed, and Gallery's is newer than the copy: nothing puts it over the copy (a server follows
    // only a copy as it was added), and list says so with how to take Gallery's.
    const changedManifest = path.join(folderOf("gallery/metric"), "component.json");
    fs.writeFileSync(changedManifest, fs.readFileSync(changedManifest, "utf8").replace('"version": "1.3.0"', '"version": "0.9.0"'));
    assert.match((await gallery("list")).stdout, /\ngallery\/metric  指标 \/ Metric  1.3.0  \(documents\)\n  说明：[^\n]*\n  the workspace's copy \(0\.9\.0\) was changed after it was added, so it is not updated: to take Gallery's 1.3.0, delete [^\n]*metric and run gallery block add metric \(to keep the changes, gallery block new <id> --recipe metric and move them into it\)\n/, "list: a changed copy Gallery has a newer version of");
    fs.rmSync(folderOf("gallery/metric"), { recursive: true });
    // A folder of its name no add put there: as changed.
    fs.mkdirSync(folderOf("gallery/chart-card"), { recursive: true });
    fs.writeFileSync(path.join(folderOf("gallery/chart-card"), "component.json"), "{}");
    assert.equal((await gallery("add", "chart-card")).code, 1, "another hand's folder");
    fs.rmSync(path.join(workspace, "components", "gallery"), { recursive: true });

    // new --recipe: a block of one's own, of the shipped one's files, every word that named it naming the new id.
    const recipe = await gallery("new", "team/sales-chart", "--recipe", "chart-card");
    assert.equal(recipe.code, 0, recipe.stderr);
    assert.ok(recipe.stdout.includes("Made from Gallery's gallery/chart-card 1.3.0, every word that named it naming team/sales-chart"), recipe.stdout);
    // What is still the recipe's is named: how to write it and its example (not its pictures, which it does not copy: its first check that passes makes its own).
    assert.match(recipe.stdout, /and in the same files what is still chart-card's: writing\.md \(how to write it, still about chart-card\) and example\.html \(the instance check runs and show prints, still chart-card's words\), then what you came for/);
    const madeManifest = JSON.parse(fs.readFileSync(path.join(folderOf("team/sales-chart"), "component.json"), "utf8"));
    assert.deepEqual([madeManifest.id, madeManifest.version], ["team/sales-chart", "0.1.0"]);
    assert.deepEqual(filesIn("team/sales-chart"), fs.readdirSync(path.join(projectRoot, "src", "packs", "gallery", "chart-card")).filter((file) => !file.startsWith("preview-")).sort(), "the recipe's files, its pictures aside");
    const madeOf = (id, file) => fs.readFileSync(path.join(folderOf(id), file), "utf8");
    const madeScript = madeOf("team/sales-chart", "kit.js");
    assert.ok(madeScript.includes('id: "team/sales-chart"') && madeScript.includes('"team-sales-chart-bars"') && !/gallery[/-]chart-card/.test(madeScript), "its classes of its own, which two blocks on one page could not share");
    assert.ok(madeOf("team/sales-chart", "style.css").includes('[data-doc-component="team/sales-chart"] {') && madeOf("team/sales-chart", "style.css").includes("> .team-sales-chart-bars {") && !/gallery[/-]chart-card/.test(madeOf("team/sales-chart", "style.css")), "in its style too");
    assert.deepEqual(madeManifest.runtime, { generated: [":scope > .team-sales-chart-bars"] }, "and in what its manifest says it draws");
    // Written as any new block: the manifest last, whatever order the files come in.
    assert.equal(Object.keys(recipeFiles(shippedBlock("chart-card"), "team/sales-chart")).at(-1), "component.json");
    assert.deepEqual(writingOrder(Object.keys(packageFiles("local/x", { script: true }))).at(-1), "component.json", "a scaffold's, which has it first, too");
    const before = process.env.GALLERY_DEFAULT_WORKSPACE;
    process.env.GALLERY_DEFAULT_WORKSPACE = workspace; // what gallery check runs reads the catalog of the workspace in use
    try {
      assert.deepEqual(problemsOf("team/sales-chart"), [], "it passes what reads files alone, as it stands");
      // A new name that holds the old one is named once: every word renamed in one pass.
      for (const [name, from, drawn] of [["gallery-card", "card", null], ["gallery-chart-card", "chart-card", "local-gallery-chart-card-bars"]]) {
        const id = `local/${name}`;
        const made = await gallery("new", name, "--recipe", from);
        assert.equal(made.code, 0, made.stderr);
        assert.equal(JSON.parse(madeOf(id, "component.json")).id, id, `${name}: its manifest names its folder`);
        const all = filesIn(id).map((file) => madeOf(id, file)).join("\n");
        assert.ok(!all.includes("local-local-") && !all.includes("local/local-") && all.includes(`data-doc-component="${id}"`) && (!drawn || all.includes(drawn)), `${name}: no word named twice: ${all}`);
        assert.deepEqual(problemsOf(id), [], `${name}: it loads and passes as it stands`);
        fs.rmSync(folderOf(id), { recursive: true });
      }
      // A chart type a block's kit.js defines is one every page holding an instance of it has (gallery
      // check: chart-declarations.mjs definedTypes), so a chart table of that type an Agent writes in its
      // slot passes; one it does not define fails as in any document.
      assert.equal((await gallery("new", "--script", "--flow", "team/bars")).code, 0);
      const defining = (type) => fs.writeFileSync(path.join(folderOf("team/bars"), "kit.js"), `DocKit.component({ id: "team/bars", mount() { return {}; } });\nDocCharts.define("${type}", ({ host }) => { host.textContent = "bars"; });\n`);
      defining("team-bars");
      fs.writeFileSync(path.join(folderOf("team/bars"), "example.html"), '<div data-doc-component="team/bars">\n  <h3>标题</h3>\n  <div data-doc-slot="body">\n    <table data-doc-chart="team-bars"><caption>数</caption><thead><tr><th>名字</th><th>数</th></tr></thead><tbody><tr><td>甲</td><td>1</td></tr></tbody></table>\n  </div>\n</div>\n');
      assert.deepEqual(problemsOf("team/bars"), [], "the type its script defines");
      defining("team-other");
      assert.ok(problemsOf("team/bars", 4).some((said) => said.startsWith('example.html:4: data-doc-chart="team-bars"') && said.includes('does not define "team-bars"')), `one it does not: ${problemsOf("team/bars", 4).join("\n")}`);
      fs.rmSync(folderOf("team/bars"), { recursive: true });
    } finally {
      process.env.GALLERY_DEFAULT_WORKSPACE = before;
    }
    fs.rmSync(folderOf("team/sales-chart"), { recursive: true });
  }
  // ---------- check: what reads files alone ----------
  const home = process.env.GALLERY_DEFAULT_WORKSPACE;
  process.env.GALLERY_DEFAULT_WORKSPACE = workspace;
  try {
    // A package to break, one file at a time, each written back after.
    const R = '[data-doc-component="local/good"]';
    const write = (name, text) => fs.writeFileSync(path.join(folderOf("local/good"), name), text);
    const remove = (name) => fs.rmSync(path.join(folderOf("local/good"), name));
    const files = packageFiles("local/good", { script: true });
    const reset = () => Object.entries(files).forEach(([name, text]) => write(name, text));
    fs.mkdirSync(folderOf("local/good"), { recursive: true });
    reset();
    const manifest = JSON.parse(files["component.json"]);
    const withManifest = (change) => write("component.json", JSON.stringify(change(structuredClone(manifest)), null, 2));

    // A scaffold, static or scripted, passes; so does a fixture of the repository, and an official
    // example with nothing to say of it either.
    assert.deepEqual(problemsOf("local/good"), [], "a scaffold with a script");
    assert.equal((await gallery("new", "plain")).code, 0);
    assert.deepEqual(problemsOf("local/plain"), [], "a static scaffold");
    assert.equal(readSections(workspace, "local/plain").sections[1].none, "none: a static block");
    assert.equal((await gallery("new", "--flow", "slotted")).code, 0);
    assert.deepEqual(problemsOf("local/slotted"), [], "a scaffold with a slot");
    assert.deepEqual(notesOf("local/slotted", 3), [], "its style reaches into no slot");
    // What a template's slot holds is what "/" makes there, as a paste makes blocks: a chart, a card, a
    // table's caption or an instance of a block, which a paste makes into something else, fails at its
    // line, in a disclosure too, once for what holds more of it; a plain table passes.
    {
      const templateFile = path.join(folderOf("local/slotted"), "template.html");
      const made = fs.readFileSync(templateFile, "utf8");
      const holding = (inner) => {
        fs.writeFileSync(templateFile, made.replace("<p></p>", inner));
        return problemsOf("local/slotted", 4).filter((said) => said.includes('which a new block from "/" would not have')).map((said) => said.slice(0, said.indexOf(", which")));
      };
      assert.deepEqual(holding("<table><thead><tr><th>名字</th><th>数</th></tr></thead><tbody><tr><td>甲</td><td>1</td></tr></tbody></table>"), [], "a plain table");
      assert.deepEqual(holding('<table data-doc-chart="bars"><caption>标题</caption><tr><th>名字</th><th>数</th></tr><tr><td>甲</td><td>1</td></tr></table>'), ['template.html:4: its slot body holds a chart (<table data-doc-chart="bars">)']);
      assert.deepEqual(holding("<p>一段</p>\n    <table><caption>说明</caption><tr><td>1</td></tr></table>"), ["template.html:5: its slot body holds a table's <caption>"]);
      assert.deepEqual(holding('<details><summary>折</summary><figure class="doc-figure"><h3>卡</h3></figure></details>'), ["template.html:4: its slot body holds a card (<figure>)"]);
      assert.deepEqual(holding('<div data-doc-component="local/plain"><p>别的块</p></div>'), ["template.html:4: its slot body holds an instance of local/plain"]);
      fs.writeFileSync(templateFile, made);
      assert.deepEqual(problemsOf("local/slotted"), [], "as it was");
    }
    for (const id of ["local/tally", "local/strip", "local/kanban", "local/scorecard", "local/brief"]) {
      fs.cpSync(fixture(id), folderOf(id), { recursive: true });
      assert.deepEqual(problemsOf(id), [], id);
    }
    for (const id of ["local/kanban", "local/scorecard"]) assert.deepEqual([1, 2, 3, 4].flatMap((section) => notesOf(id, section)), [], `${id}: no notes`);
    assert.ok(notesOf("local/tally", 2).some((note) => /^kit\.js:16: TS18047: 'drawn' is possibly 'null'/.test(note)), "a type's word on what a browser runs as written is a note");
    assert.ok(notesOf("local/tally", 2).every((note) => !/<!--|Expression expected/.test(note)), "a comment only a classic script has is one");

    // What a section says of itself.
    assert.deepEqual(sectionLines({ title: "style.css", problems: [{ file: "style.css", line: 3, what: "x" }], notes: [{ file: "style.css", what: "y" }] }, 3), ["3. style.css: 1 problem", "  FAIL style.css:3: x", "  note style.css: y"]);
    assert.deepEqual(sectionLines({ title: "kit.js", none: "none" }, 2), ["2. kit.js: none"]);
    assert.deepEqual(sectionLines({ title: "x", skipped: "why" }, 4), ["4. x: not run: why"]);
    assert.deepEqual(sectionLines({ title: "x", notes: [{ file: "x", what: "y" }] }, 1), ["1. x: ok, 1 note", "  note x: y"]);

    // 1, the manifest, at its line.
    write("component.json", files["component.json"].replace('"version": "0.1.0",', '"version": "0.1.0"'));
    assert.match(problemsOf("local/good", 1)[0], /^component\.json:\d+: component\.json is not JSON: /);
    assert.equal(/^component\.json:(\d+)/.exec(problemsOf("local/good", 1)[0])[1], "5", "where JSON stopped reading");
    withManifest((value) => ({ ...value, parts: { ...value.parts, title: { ...value.parts.title, edit: "bogus" } } }));
    assert.deepEqual(problemsOf("local/good", 1), [`component.json:${JSON.stringify({ ...manifest }, null, 2).split("\n").findIndex((line) => line.includes('"title"')) + 1}: parts.title: edit is text, data, flow or none`]);
    withManifest((value) => ({ ...value, bogus: 1 }));
    assert.match(problemsOf("local/good", 1)[0], /^component\.json:\d+: bogus is no field a custom block's manifest writes$/);
    withManifest((value) => ({ ...value, id: "local/other" }));
    assert.match(problemsOf("local/good", 1)[0], /^component\.json:2: /, "the id's own line");
    // places, card and settings, at their lines: a page's block notes its text parts, read-only on a
    // custom page; a card no page reads is a note; a slot on a page's block, or settings with no JSON
    // part in the template, a problem.
    withManifest((value) => ({ ...value, places: ["page", "document"] }));
    assert.deepEqual(problemsOf("local/good", 1), [], "a block of both places");
    assert.deepEqual(notesOf("local/good", 1).filter((note) => /custom page/.test(note)).map((note) => note.replace(/:\d+:/, ":N:")), ["component.json:N: the part title is edited as text, which is read-only on a custom page (no editor runs there): a block whose places hold page keeps what a reader changes there in a data part, with its own field or the card's settings", "component.json:N: the part text is edited as text, which is read-only on a custom page (no editor runs there): a block whose places hold page keeps what a reader changes there in a data part, with its own field or the card's settings"]);
    withManifest((value) => ({ ...value, card: { w: 4 } }));
    assert.ok(notesOf("local/good", 1).some((note) => /^component\.json:\d+: card is for a custom page's board, and its places \(document\) hold no page: nothing reads it$/.test(note)), notesOf("local/good", 1).join("\n"));
    withManifest((value) => ({ ...value, places: ["page"], parts: { ...value.parts, body: { edit: "flow" } } }));
    assert.match(problemsOf("local/good", 1)[0], /^component\.json:\d+: with page in its places it has no slot: parts\.body is edited as flow/);
    const setting = { key: "city", label: { zh: "城市", en: "City" }, type: "text" };
    withManifest((value) => ({ ...value, settings: [setting], parts: { ...value.parts, settings: { at: ":scope > script", edit: "data", optional: true } } }));
    assert.deepEqual(problemsOf("local/good", 1), ['template.html: its manifest has settings, and the template holds 0 elements of its settings part (:scope > script): it is to hold one <script type="application/json">, the values a new card starts with ({} for each setting\'s default)']);
    write("template.html", files["template.html"].replace("</div>", '  <script type="application/json">[1]</script>\n</div>'));
    assert.deepEqual(problemsOf("local/good", 1), ["template.html:4: its settings part is not a JSON object (it is no object): write {} or the values of some of its settings, by key"]);
    write("template.html", files["template.html"].replace("</div>", '  <script type="application/json">{ "city": "上海" }</script>\n</div>'));
    assert.deepEqual(problemsOf("local/good", 1), [], "one that holds its values");
    write("template.html", files["template.html"]);
    // What a selector gets wrong, said as what to write.
    const atWritten = (at) => { withManifest((value) => ({ ...value, parts: { ...value.parts, title: { ...value.parts.title, at } } })); return problemsOf("local/good", 1)[0]; };
    assert.match(atWritten(":scope > table td"), /parts\.title\.at is wrong: selector "table td": one element, with no space in it: write each step with > \(:scope > a > b\), or the last step alone/);
    assert.match(atWritten("script[type=application/json]"), /parts\.title\.at is wrong: selector "script\[type=application\/json\]": write its value in quotes: \[type="application\/json"\]/);
    assert.match(atWritten(":scope > a:hover"), /only tag, \.class, \[attr\] and \[attr=value\]$/);
    reset();
    // A file that is no UTF-8 (what PowerShell's > writes) says that, one line a file, and nothing that reading it as words makes up.
    const utf16 = (name) => write(name, Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(files[name], "utf16le")]));
    const NOT_UTF8 = "it is not UTF-8: save it as UTF-8 (PowerShell's > writes UTF-16; Set-Content -Encoding utf8 does not)";
    for (const [name, section] of [["kit.js", 2], ["style.css", 3], ["example.html", 4], ["template.html", 4], ["writing.md", 1]]) {
      utf16(name);
      assert.deepEqual(problemsOf("local/good", section), [`${name}: ${NOT_UTF8}`], name);
      assert.equal(problemsOf("local/good").length, 1, `${name}: its own line and no other: ${problemsOf("local/good").join("\n")}`);
      reset();
    }
    utf16("component.json");
    assert.deepEqual(problemsOf("local/good", 1), ["component.json: component.json is not UTF-8: save it as UTF-8"]);
    forgetCatalog(workspace);
    assert.match((await gallery("list")).stdout, /local\/good {2}does not load: component\.json is not UTF-8: save it as UTF-8\n/, "said wherever it is read");
    reset();
    remove("template.html");
    assert.deepEqual(problemsOf("local/good"), ['template.html: there is none, and it is what "/" puts in a document: with none, no menu offers the block: write one <div data-doc-component="local/good"> with what a new instance holds']);
    forgetCatalog(workspace);
    const NOT_IN_MENUS = "  模板：the menus cannot insert it, and a document can still write it: ";
    assert.ok((await gallery("list")).stdout.includes(`local/good  good\n  版本：0.1.0（available）\n  说明：一个可以反复使用的块 / A block to use again\n${NOT_IN_MENUS}it has no template.html\n`), "the list says the menus cannot insert it");
    write("template.html", '<div data-doc-component="local/good"><h3>一</h3>');
    assert.ok((await gallery("list")).stdout.includes(`${NOT_IN_MENUS}template.html is to be one instance of this block, with an end tag of its own, and nothing else\n`), "nor one no new block can be");
    reset();
    assert.ok(!(await gallery("list")).stdout.includes("  模板："), "and nothing of one they can");
    // Chinese no word spells in pinyin, a name's whole as an input method composes it being a word of as
    // many syllables as it has characters (the fewest a word reads as: fenbiao is two, not fen-bi-a-o): a
    // note, at its line, none with such a word, whatever else it says.
    const noPinyin = (note) => /^component\.json:\d+: (?:no word of words spells its whole name \S+ in pinyin as an input method composes it, |its words are Chinese and none of them is pinyin: )/.test(note);
    const pinyinSaid = (words, name = { zh: "周报卡", en: "Weekly" }) => {
      withManifest((value) => ({ ...value, name, words }));
      assert.deepEqual(problemsOf("local/good", 1), [], `no failure: ${words}`);
      return notesOf("local/good", 1).some(noPinyin);
    };
    assert.equal(pinyinSaid("看板 任务", { zh: "good", en: "good" }), true, "Chinese words");
    assert.equal(pinyinSaid("weekly report"), true, "a Chinese name, and words no one composes");
    // The note names the package's own name and how many syllables a word of it needs, 方案打分 being an
    // example and no name of this one, and says that only the count is checked, so that letters of no
    // name that read as as many syllables pass.
    assert.ok(notesOf("local/good", 1).some((note) => note.includes("its whole name 周报卡 in pinyin as an input method composes it, its 3 Chinese characters a syllable each in one word (as 方案打分 is fangandafen)") && note.includes("What is counted is how many syllables a word reads as, not which characters they spell")), notesOf("local/good", 1).join("\n"));
    assert.equal(pinyinSaid("windowenter", { zh: "只听拖过", en: "Drops" }), false, "letters that read as four syllables, for a name of four");
    assert.equal(pinyinSaid("周报 kpi"), true, "or words of the name and letters of no syllable");
    assert.equal(pinyinSaid("weekly zhoubaoka"), false, "with its pinyin, none");
    assert.equal(pinyinSaid("kanban 看板"), true, "pinyin of fewer syllables than its name has characters");
    const [scorecard, board] = [{ zh: "方案打分", en: "Scorecard" }, { zh: "任务看板", en: "Board" }];
    assert.equal(pinyinSaid("fanganda fenbiao pingfen dafen", scorecard), true, "words of parts of its name alone");
    assert.ok(notesOf("local/good", 1).some((note) => note.includes("its whole name 方案打分 in pinyin as an input method composes it, its 4 Chinese characters a syllable each in one word")), notesOf("local/good", 1).join("\n"));
    assert.equal(pinyinSaid("fangandafen pingfen", scorecard), false, "a word of its whole name");
    assert.equal(pinyinSaid("renwu kanban", board), true);
    assert.equal(pinyinSaid("renwukanban kanban", board), false);
    assert.equal(pinyinSaid("weekly report", { zh: "Weekly", en: "Weekly" }), false, "nothing to compose");
    reset();
    // What the user turned off is theirs: nothing fails for it and nothing goes unchecked, section 4 going
    // by the manifest's parts as for one on, and a note says so. What this Gallery cannot run still fails.
    const settingsBefore = fs.readFileSync(marker, "utf8");
    fs.writeFileSync(marker, JSON.stringify({ ...JSON.parse(settingsBefore), components: { hidden: [], disabled: ["local/good"] } }));
    assert.deepEqual(problemsOf("local/good"), [], "turned off, nothing to mend");
    assert.ok(notesOf("local/good", 1).some((note) => note.startsWith("gallery.json: the user turned it off in 设置 › 组件列表")), notesOf("local/good", 1).join("\n"));
    forgetCatalog(workspace);
    assert.ok(readSections(workspace, "local/good").found, "and it can run");
    write("example.html", '<div data-doc-component="local/good"></div>\n');
    assert.ok(problemsOf("local/good", 4).some((said) => said.startsWith("example.html") && said.includes("title")), `its parts checked: ${problemsOf("local/good", 4).join("\n")}`);
    reset();
    assert.ok(problemsOf("local/future", 1).some((said) => said.includes("it needs apiVersion 99")), "another apiVersion fails");
    fs.writeFileSync(marker, settingsBefore);
    withManifest((value) => ({ ...value, parts: { body: { at: ":scope > div", edit: "text" } } }));
    write("example.html", `<div data-doc-component="local/good">\n  <div>\n    <p>一段</p>\n  </div>\n</div>\n`);
    write("template.html", `\n<div data-doc-component="local/good">\n  <div><ul><li>一项</li></ul></div>\n</div>\n`);
    const blocks = problemsOf("local/good", 1);
    assert.equal(blocks.length, 2, blocks.join("\n"));
    assert.ok(blocks.some((said) => /^template\.html:3: the part body \(:scope > div\) is edited as text and holds a block, its <ul> at line 3: /.test(said)), blocks.join("\n"));
    assert.ok(blocks.some((said) => /^example\.html:2: the part body \(:scope > div\) is edited as text and holds a block, its <p> at line 3: /.test(said)), blocks.join("\n"));
    reset();
    // A text part in a part edited as data, or around one, is the component's: the editor leaves it read-only.
    withManifest((value) => ({ ...value, parts: { ...value.parts, note: { at: ".note", edit: "text", optional: true }, rows: { at: ":scope > ul", edit: "data", optional: true } } }));
    write("example.html", `<div data-doc-component="local/good">\n  <h3>题</h3>\n  <ul><li class="note">一</li></ul>\n</div>\n`);
    assert.deepEqual(problemsOf("local/good", 1), ["example.html:3: the part note (.note) is edited as text, and stands in the part rows, edited as data, or around it, which is the component's: the editor leaves it read-only: name elements apart"]);
    reset();
    // What else is no word and no mark, in a template or an example, is said once: the editor would leave it read-only too.
    const titled = (held) => `<div data-doc-component="local/good">\n  <h3>${held}</h3>\n</div>\n`;
    write("template.html", titled("一<!-- 注 -->二"));
    assert.deepEqual(problemsOf("local/good", 1), ["template.html:2: the part title (:scope > h3) is edited as text, and the editor would leave it read-only for what it holds: an HTML comment amid the words. A text part holds words and marks alone"]);
    assert.ok(!notesOf("local/good", 4).some((note) => note.startsWith("template.html:2:")), "said once");
    write("template.html", titled("一<b>二</b><br>三"));
    assert.deepEqual(problemsOf("local/good", 1), [], "words and marks pass");
    write("template.html", files["template.html"]);
    write("example.html", titled('<button type="button">一</button>'));
    assert.match(problemsOf("local/good", 1)[0], /^example\.html:2: the part title \(:scope > h3\) is edited as text, and the editor would leave it read-only for what it holds: <button> amid the words \(the preview edits /);
    reset();

    // 2, the script, at its line.
    const scripted2 = (code) => { write("kit.js", code); return problemsOf("local/good", 2); };
    const good = files["kit.js"];
    const refused = scripted2("// one\nconst = 1;\n");
    assert.equal(refused.length, 1, "a script that does not read goes no further");
    assert.match(refused[0], /^kit\.js:2: a browser refuses it: /);
    assert.deepEqual(scripted2(`${good}fetch("/x");\n`).map((said) => said.split(":").slice(0, 3).join(":")), [`kit.js:${good.split("\n").length}: calls fetch(…)`]);
    assert.match(scripted2(`${good}eval("1");\n`)[0], /^kit\.js:\d+: calls eval\(…\): an export runs no code made from words$/);
    assert.match(scripted2(`${good}localStorage.getItem("a");\n`)[0], /^kit\.js:\d+: uses localStorage: an instance keeps what a reader chose with context\.state$/);
    // A script may register in ways reading does not tell: what runs says, and reading says what it read.
    assert.deepEqual(scripted2("const a = 1;\n"), []);
    assert.ok(notesOf("local/good", 2).some((note) => note.startsWith('kit.js: no DocKit.component({ id: "local/good", mount(host, context) { … } }) is to be read in it')), "a note");
    assert.deepEqual(scripted2('const { component } = DocKit;\ncomponent({ id: "local/good", mount() {} });\n'), [], "and it is no failure");
    assert.equal(scripted2("#!/usr/bin/env node\nDocKit.component({ id: 'local/good', mount() {} });\n")[0], "kit.js:1: a browser refuses it: Invalid or unexpected token", "read as a page holds it, in a function of its own");
    assert.match(scripted2('DocKit.component({ id: "local/good", mount() {} });\nreturn;\n')[0], /^kit\.js:2: TS1108: /, "the function it runs in lends it no return of its own");
    assert.deepEqual(scripted2(good.replace('id: "local/good"', 'id: "local/other"')), ["kit.js:3: it registers local/other, and this block is local/good"]);
    assert.match(scripted2(good.replace('context.part("title")', 'context.nope("title")'))[0], /^kit\.js:10: TS2339: Property 'nope' does not exist on type 'DocComponentContext'/);
    assert.match(scripted2(good.replace('on: ["source"]', 'on: ["bogus"]'))[0], /^kit\.js:5: TS2322: Type '"bogus"' is not assignable to type 'DocComponentSignal'/);
    assert.match(scripted2(good.replace('id: "local/good"', "id: 3"))[0], /^kit\.js:4: TS2322: /, "what the SDK declares, whatever the words say");
    assert.match(scripted2(good.replace("draw();\n    return", "drew();\n    return"))[0], /^kit\.js:11: TS2\d+: Cannot find name 'drew'/);
    assert.deepEqual(scripted2("// starts here\n<!-- as a classic script may\nDocKit.component({ id: \"local/good\", mount() {} });\n--> and ends\n"), [], "comments of a classic script");
    assert.deepEqual(diagnoseScript("const name = 1;\nconst top = name;\n"), [], "what it declares meets no global");
    // What an asset puts on a page is there for the package that asks for it, and for no other script.
    const drawing = 'DocKit.component({ id: "local/good", mount(host) { katex.render("x", host); renderMathInElement(host); } });\n';
    assert.deepEqual(scripted2(drawing).map((said) => said.split(": ").slice(1).join(": ")), ["TS2304: Cannot find name 'katex'.", "TS2304: Cannot find name 'renderMathInElement'."]);
    withManifest((value) => ({ ...value, assets: ["katex", "katex-styles", "katex-auto-render"] }));
    assert.deepEqual(scripted2(drawing), [], "as the manifest asks");
    assert.deepEqual(diagnoseScript("katex;\n").map(({ code }) => code), [2304], "and a document's script has no such name");
    write("component.json", files["component.json"]);
    assert.deepEqual(diagnoseScript('document.querySelector("a").href = "";\ndocument.querySelector("a").href = "";\n').map(({ line, refused }) => [line, refused]), [[1, false], [2, false]]);
    write("kit.js", good);

    // 3, the style, each selector at its line, what an export cannot hold among them.
    const styled = (css) => { write("style.css", css); return problemsOf("local/good", 3); };
    assert.deepEqual(styled(`/* body { } */\n${R} .a { top: 0 }\n.b { top: 0 }\n`), [`style.css:3: .b reaches outside the instance: start it at ${R}`]);
    assert.deepEqual(styled(`${R} .a,\n.b,\n${R} .c { top: 0 }\n`), [`style.css:2: .b reaches outside the instance: start it at ${R}`], "each selector of a rule, on its own line");
    assert.deepEqual(styled(`${R} + p { top: 0 }\n`), [`style.css:1: ${R} + p reaches what stands beside the instance: what it styles has to stand in it`]);
    assert.deepEqual(styled("@import 'a.css';\n"), ["style.css:1: has an @import, which an export cannot hold: write what it imports into style.css"]);
    assert.deepEqual(styled(`${R} {\n  background: url(https://example.com/a.png);\n}\n`), ["style.css:2: loads https://example.com/a.png: external resources are not portable"]);
    assert.deepEqual(styled(`${R} {\n\n  background: url(a.png);\n}\n`), ["style.css:3: names a.png, which an export cannot hold: put the file in the package and name it in its assets"]);
    assert.deepEqual(styled("@page { margin: 0 }\n"), ["style.css:1: @page reaches the paper of the whole document: an instance has no page of its own"]);
    // Every kind of selector, in the reader alone.
    const reach = (css) => styleReach(css, "local/x").map(({ line }) => line);
    const X = '[data-doc-component="local/x"]';
    assert.deepEqual(reach(`${X} { top: 0 }\n${X}::before { content: "}" }\ndiv${X}.a > .b { top: 0 }\nhtml[data-doc-theme="dark"] ${X} .c { top: 0 }\n${X} .a + .b { top: 0 }\n${X} .a:nth-child(2n+1) ~ .b { top: 0 }\n@media (max-width: 500px) { ${X} .a { top: 0 } }\n@keyframes a { from { top: 0 } to { top: 1px } }\n@font-face { font-family: "A"; src: url(data:font/woff2;base64,AA;); }\n@scope (${X}) { .a { top: 0 } }\n${X} { .a { top: 0 } &.b .c { top: 0 } > .d { top: 0 } }\n`), [], "what stays in the instance");
    assert.deepEqual(reach(`:root { --a: 1 }\nbody { top: 0 }\n* { top: 0 }\n@media print { .a { top: 0 } }\n:is(${X}) .a { top: 0 }\n:has(${X}) { top: 0 }\n[data-doc-component] .a { top: 0 }\n[data-doc-component="local/x-y"] .a { top: 0 }\n@scope (.a) { .b { top: 0 } }\n${X} { & + .a { top: 0 } + .b { top: 0 } }\n@scope (${X}) { :scope ~ .a { top: 0 } }\n`), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11], "what does not");
    // A nested selector whose & stands only in a function has nothing put in front of it: Chrome applies
    // each of these outside the instance, whatever at-rule holds it (each was held against it).
    const NESTED_OUT = [":not(&)", ":has(&)", "body:has(&)", "html:not(&)", ":is(&, h1)", ":is(&) + h2", ":where(&) ~ h2", ":is(& + h2)", ":not(&) p", "p :not(&)"];
    for (const selector of NESTED_OUT) {
      assert.deepEqual(reach(`${X} {\n  ${selector} { top: 0 }\n}\n`), [2], selector);
      assert.deepEqual(reach(`@media print {\n  ${X} {\n    ${selector} { top: 0 }\n  }\n}\n`), [3], `${selector} in @media`);
      assert.deepEqual(reach(`@layer a {\n  ${X} {\n    @media print {\n      ${selector} { top: 0 }\n    }\n  }\n}\n`), [4], `${selector} in @layer and @media`);
    }
    assert.deepEqual(reach(`${X} {\n  :not(&) {\n    p { top: 0 }\n  }\n}\n`), [2], "once, at the rule that leaves it");
    assert.deepEqual(reach(`${X} { [title="&"] { top: 0 } .a\\&b { top: 0 } :not(.a) { top: 0 } & :not(&) { top: 0 } }\n`), [], "a & no selector means, and what goes down from it");
    // A neighbour is beside the instance when & is the instance, and in it when & is something in it.
    assert.deepEqual(reach(`${X} p { & + p { top: 0 } + p { top: 0 } ~ p { top: 0 } }\n${X} { p { & + p { top: 0 } + p { top: 0 } ~ p { top: 0 } } }\n${X} > .a { @media print { + .b { top: 0 } } }\n${X} { .a { .b { + .c { top: 0 } } } }\n@scope (${X}) { p { + p { top: 0 } } }\n${X} > p { h2 & { top: 0 } }\n`), [], "beside what stands in it");
    assert.deepEqual(reach(`${X}:hover { + p { top: 0 } }\n${X} { &:hover { ~ p { top: 0 } } }\n${X}, ${X} p { & + p { top: 0 } }\n${X} { @media print { & ~ p { top: 0 } } }\n${X} { & { + p { top: 0 } } }\n`), [1, 2, 3, 4, 5], "beside the instance itself, however it is come to");
    assert.deepEqual(styled(`${R} p {\n  & + p { top: 0 }\n}\n`), [], "as a package's style");
    write("style.css", files["style.css"]);
    // Of a package with a slot, what goes down from the instance by a blank reaches the slot's blocks
    // too: a note, once at the rule that goes down; a step of > and an @scope stopping at a slot do not.
    const deep = (css) => slotReach(css, "local/x", ["body"]).map(({ line }) => line);
    assert.deepEqual(deep(`${X} { top: 0 }\n${X} > h3 { top: 0 }\n${X} p { top: 0 }\n${X} > div > p { top: 0 }\n${X} { p { top: 0 } }\n${X} { > p { top: 0 } }\n${X} { & .a { top: 0 } }\n@scope (${X}) { p { top: 0 } }\n@scope (${X}) to ([data-doc-slot]) { p { top: 0 } :scope .a { top: 0 } }\n@scope (${X}) { :scope > p { top: 0 } }\n${X} .a { > b { top: 0 } }\n@media print { ${X} li { top: 0 } }\n${X} > ul { & > li { top: 0 } }\nhtml[data-doc-theme="dark"] ${X} > h3 { top: 0 }\n@scope (${X}) to ([data-doc-slot="body"]) { p { top: 0 } }\n`), [3, 5, 7, 8, 11, 12]);
    assert.deepEqual(slotReach(`${X} p { top: 0 }\n`, "local/x", []), [], "a package with no slot has none");
    const S = '[data-doc-component="local/slotted"]';
    fs.writeFileSync(path.join(folderOf("local/slotted"), "style.css"), `${S} > h3 { margin: 0 }\n${S} p { color: var(--doc-muted) }\n`);
    assert.deepEqual(notesOf("local/slotted", 3), [`style.css:2: ${S} p also reaches the blocks in slot body, the document's: write each step with > or wrap the rules in @scope (${S}) to ([data-doc-slot])`]);
    assert.deepEqual(problemsOf("local/slotted", 3), [], "a note, no problem");
    fs.writeFileSync(path.join(folderOf("local/slotted"), "style.css"), packageFiles("local/slotted", { flow: true })["style.css"]);

    // 4, the page rules, at each file's own lines.
    const marked = (name, text) => { write(name, text); return problemsOf("local/good", 4); };
    assert.deepEqual(marked("template.html", `<div data-doc-component="local/good">\n  <h3>一</h3>\n</div>\n<p>又一个</p>\n`), ['template.html:1: a template is one element, a <div data-doc-component="local/good"> or a <section>, and it holds 2 elements']);
    assert.deepEqual(marked("template.html", '<div data-doc-component="local/other"><h3>一</h3></div>\n'), ['template.html:1: a template is one element, a <div data-doc-component="local/good"> or a <section>, and it holds <div data-doc-component="local/other">']);
    assert.deepEqual(marked("template.html", '\n<div data-doc-component="local/good"><h3 data-block-id="aaaa1111">一</h3></div>\n'), ["template.html:2: it writes a data-block-id, which every instance made of it would repeat: leave it out, Gallery gives a block its id"]);
    assert.deepEqual(marked("template.html", '\n\n<div data-doc-component="local/good"><p>一</p></div>\n'), ["template.html:3: local/good has no title (h3)"]);
    assert.deepEqual(marked("template.html", '<div data-doc-component="local/good">\n  <h3 class="doc-bogus">一</h3>\n</div>\n'), ["template.html:2: class doc-bogus is no class of the kit's: give a class of the document's own a name of its own (not doc-…)"]);
    assert.deepEqual(marked("template.html", "   \n"), ["template.html: it is empty"]);
    // What keeps a template out of the menus, at its line, and once.
    const NO_NEW_BLOCK = "cannot go into a new block: scripts, handlers, styles and Gallery's own marks stay out of a template";
    const held = (inside) => `<div data-doc-component="local/good">\n  <h3>一</h3>\n  ${inside}\n</div>\n`;
    assert.deepEqual(marked("template.html", held("<script>document.title = '一';</script>")), [`template.html:3: the <script> in template.html ${NO_NEW_BLOCK}`], "a script, as the catalog refuses it");
    assert.deepEqual(marked("template.html", held('<p onclick="go()">二</p>')), [`template.html:3: the <p> in template.html ${NO_NEW_BLOCK}`], "a handler");
    assert.deepEqual(marked("template.html", held('<p style="position: fixed">二</p>')), [`template.html:3: the <p> in template.html ${NO_NEW_BLOCK}`], "what leaves its block");
    assert.deepEqual(marked("template.html", held('<p data-ge-unit="1">二</p>')), [`template.html:3: the <p> in template.html ${NO_NEW_BLOCK}`], "a mark of the editor's");
    assert.deepEqual(marked("template.html", held('<script type="application/json">{}</script>')), [], "data is no code");
    assert.deepEqual(marked("template.html", '\n<div data-doc-component="local/good">\n  <h3>一</h3>\n'), ["template.html:2: template.html is to be one instance of this block, with an end tag of its own, and nothing else"], "an end tag the parser put in");
    const unstarted = await gallery("check", "good", { env: { GALLERY_BROWSER: path.join(root, "no-browser.exe") } });
    assert.ok(unstarted.stdout.includes("5. in a browser, under the export's policy: not run: template.html and example.html first"), unstarted.stdout);
    write("template.html", files["template.html"]);
    assert.deepEqual(marked("example.html", "<p>一段</p>\n"), ["example.html: it holds no instance of local/good: a <div data-doc-component=\"local/good\">"]);
    assert.deepEqual(marked("example.html", '<span data-doc-component="local/good">一</span>\n').at(0), 'example.html: it holds no instance of local/good: a <div data-doc-component="local/good">');
    // A picture: a package's page has no folder of its own, and is told what it has. No line is what is of the page as a whole.
    const NO_FOLDER = ": an example stands in no document: write a picture as a data: address, or draw it from style.css with a file the manifest's assets name";
    const pictured = (src) => `<div data-doc-component="local/good">\n  <h3>一</h3>\n  <img src="${src}" alt="一">\n</div>\n`;
    assert.deepEqual(marked("example.html", pictured("assets/x.png")), [`example.html:3: <img src="assets/x.png">${NO_FOLDER}`]);
    assert.deepEqual(marked("example.html", pictured("https://example.com/a.png")), [`example.html: external resources are not portable: https://example.com/a.png${NO_FOLDER}`]);
    assert.deepEqual(marked("example.html", pictured("data:image/png;base64,iVBORw0KGgo=")), [], "a data: address passes");
    remove("example.html");
    assert.deepEqual(problemsOf("local/good", 4), ['example.html: there is none or it is empty: write an instance as a writer would fill it, a <div data-doc-component="local/good">; it is what this check runs']);
    reset();

    // One that does not load is taken as far as it goes.
    write("component.json", "{");
    write("style.css", ".a { top: 0 }\n");
    const unloaded = readSections(workspace, "local/good").sections;
    assert.equal(unloaded[0].problems.length, 1);
    assert.equal(unloaded[2].problems.length, 1, "its style is read all the same");
    assert.equal(unloaded[3].skipped, "its manifest does not load");
    reset();
    assert.equal(readSections(workspace, "local/nothing"), null);

    // The broken fixture, one thing wrong in each that can be read, each at its line; nothing runs then.
    const take = (id) => fs.cpSync(path.join(projectRoot, "tests", "fixtures", "component-check", ...id.split("/")), folderOf(id), { recursive: true });
    take("local/broken");
    const broken = await gallery("check", "broken");
    assert.equal(broken.code, 1);
    const said = broken.stdout.split(/\r?\n/);
    const failing = said.filter((line) => line.startsWith("  FAIL ")).map((line) => line.slice(7));
    assert.deepEqual(failing.map((line) => line.split(": ")[0]), ["template.html:3", "kit.js:5", "kit.js:6", "style.css:3", "template.html:1", "example.html:2"], broken.stdout);
    assert.match(failing[0], /the part body \(:scope > div\) is edited as text and holds a block, its <p> at line 4/);
    assert.ok(failing.some((line) => line.startsWith("kit.js:5: calls fetch(…): the export blocks the network")), broken.stdout);
    assert.ok(failing.some((line) => /^kit\.js:6: TS2339: Property 'nope' does not exist on type 'DocComponentContext'/.test(line)), broken.stdout);
    assert.ok(failing.some((line) => line.startsWith('style.css:3: body reaches outside the instance: start it at [data-doc-component="local/broken"]')), broken.stdout);
    assert.ok(failing.some((line) => line.startsWith("template.html:1: a template is one element")), broken.stdout);
    assert.ok(failing.some((line) => line.startsWith("example.html:2: class doc-bogus is no class of the kit's")), broken.stdout);
    assert.ok(said.includes("5. in a browser, under the export's policy: not run: the manifest first"), broken.stdout);
    assert.ok(said.includes(`FAIL local/broken: ${failing.length} problems`), broken.stdout);

    // The command's verdict, with and without a browser.
    const noBrowser = { GALLERY_BROWSER: path.join(root, "no-browser.exe") };
    const unseen = await gallery("check", "local/plain", { env: noBrowser });
    assert.equal(unseen.code, 3, unseen.stdout + unseen.stderr);
    assert.deepEqual(unseen.stdout.split(/\r?\n/).slice(1, 5), ["1. manifest: ok", "2. kit.js: none: a static block", "3. style.css: ok", "4. template.html and example.html: ok"]);
    assert.match(unseen.stdout, /5\. in a browser, under the export's policy: UNVERIFIED the browser .*no-browser\.exe did not start, twice, each time with a fresh profile/);
    assert.match(unseen.stdout, /UNVERIFIED local\/plain: the rest passed, and no browser ran it: .*\n$/);
    assert.ok(unseen.stdout.startsWith(`local/plain: ${folderOf("local/plain")}\n`), unseen.stdout);
    const none = await lookAtPackage(workspace, readSections(workspace, "local/plain").found, { example: files["example.html"], template: files["template.html"] }, { find: () => null });
    assert.equal(sectionLines(none, 5)[0], "5. in a browser, under the export's policy: UNVERIFIED no Chrome, Edge or Chromium found (GALLERY_BROWSER=<its executable> picks one)");
    write("style.css", ".a { top: 0 }\n");
    const failed = await gallery("check", "good", { env: noBrowser });
    assert.equal(failed.code, 1, "what fails counts for more than what could not be looked at");
    assert.ok(failed.stdout.includes(`3. style.css: 1 problem\n  FAIL style.css:1: .a reaches outside the instance: start it at ${R}\n`), failed.stdout);
    assert.match(failed.stdout, /FAIL local\/good: 1 problem\n$/);
    reset();
    // Where it cannot write, the rest stands, and it says which folder.
    const nowhere = path.join(root, "nowhere");
    const noTemp = await gallery("check", "local/plain", { env: { TEMP: nowhere, TMP: nowhere, TMPDIR: nowhere } });
    assert.equal(noTemp.code, 3, noTemp.stdout + noTemp.stderr);
    assert.ok(noTemp.stdout.includes(`5. in a browser, under the export's policy: UNVERIFIED cannot write ${nowhere} (ENOENT)\n`), noTemp.stdout);
    assert.equal(noTemp.stderr, "", "no stack");
    const flat = await gallery("check", "flat");
    assert.equal(flat.code, 1);
    assert.match(flat.stderr, /one level too shallow/);
    assert.equal((await gallery("check", "nothing")).code, 1);
    assert.equal((await gallery("check", "Bad")).code, 2);

    // 5, in a browser: a scaffold and a fixture pass, under the export's policy, and leave their pictures.
    if (findBrowser()) {
      const pictures = (id) => fs.readdirSync(path.join(workspace, ".gallery", "qa", "components", ...id.split("/"))).sort();
      const WIDE = ["1024-dark.png", "1024-light.png", "360-dark.png", "360-light.png", "736-dark.png", "736-light.png", "edit-1024-light.png", "edit-360-light.png", "overview-dark.png", "overview-light.png"];
      // The width a picture says it has (its PNG header).
      const widthOf = (file) => fs.readFileSync(file).readUInt32BE(16);
      // What writes back says its way back, what its example wrote and that the server took it. None of
      // them draws more where a reader can edit (the board's cursor alone follows canEdit()), and the line
      // says that its edit pictures are the export's.
      const WAY_BACK = { "local/kanban": "tasks", "local/scorecard": "scores" };
      for (const id of ["local/plain", "local/good", "local/tally", "local/kanban", "local/scorecard", "local/slotted", "local/brief"]) {
        const ran = await gallery("check", id);
        assert.equal(ran.code, 0, ran.stdout + ran.stderr);
        const wayBack = WAY_BACK[id] ? ` {2}way back example\\.html:1: its example wrote ${WAY_BACK[id]} \\(-1 \\+1 of its \\d+ lines\\); the server took it; put back as an undo does, it shows what it showed\\n` : "";
        // The board's filter, the reader's own, which an export keeps, is a control an export still shows enabled: the
        // note says so, and says to leave a filter be; every other block of these has none.
        const filtering = id === "local/kanban" ? { said: ", 1 note", note: ' {2}note kit\\.js: where nothing is written \\(this look is an export: context\\.canEdit\\(\\) is false\\) the instance of example\\.html:1 still shows <input class="kanban-filter"> "筛选卡片", enabled, and the block has a data part: [^\\n]*ignore this for a control that only changes what a reader looks at, a filter or a tab, which an export keeps\\.[^\\n]*\\n' } : { said: "", note: "" };
        assert.match(ran.stdout, new RegExp(`5\\. in a browser, under the export's policy: ok${filtering.said}\\n${filtering.note}${wayBack} {2}Pictures \\(none looked at for you; example\\.html above the line, template\\.html below it, each under its name\\): .*components[\\\\/]local[\\\\/]\\w+[\\\\/]overview-light\\.png and overview-dark\\.png, the three widths of each theme side by side; then each at full size: 360-light\\.png, 736-light\\.png, 1024-light\\.png, 360-dark\\.png, 736-dark\\.png, 1024-dark\\.png; and edit-1024-light\\.png and edit-360-light\\.png, as the editing page draws it \\(context\\.canEdit\\(\\) true\\), each the same picture as the export's at its width: the block draws nothing more where a reader can edit\\n提示：10 pictures in .*\\(the whole of it: .*overview-light\\.png, .*overview-dark\\.png\\): none needs opening; open one when you want to see it\\nOK`), id);
        assert.deepEqual(pictures(id), WIDE, id);
        assert.ok(fs.statSync(path.join(workspace, ".gallery", "qa", "components", ...id.split("/"), "360-dark.png")).size > 1000);
        assert.ok(widthOf(path.join(workspace, ".gallery", "qa", "components", ...id.split("/"), "overview-light.png")) >= 360 + 736 + 1024, "the three widths side by side");
      }
      fs.writeFileSync(path.join(workspace, ".gallery", "qa", "components", "local", "plain", "old.png"), "");
      assert.equal((await gallery("check", "plain")).code, 0);
      assert.deepEqual(pictures("local/plain"), WIDE, "each run its own");

      // The running fixture: what reads well and is wrong as it runs, each thing with its place.
      take("local/piling");
      const piling = await gallery("check", "piling");
      assert.equal(piling.code, 1, piling.stdout);
      const ran = piling.stdout.split(/\r?\n/).filter((line) => line.startsWith("  FAIL ")).map((line) => line.slice(7));
      assert.ok(ran.includes("kit.js:10: the console says Error: late"), piling.stdout);
      assert.ok(ran.some((line) => /^example\.html:2: <span class="piling-badge"> piles up on each put-back \(1, then 2, then 3, then 4 of them\): it is declared in neither the manifest's runtime nor dehydrate, so an undo adds another\. Name it in component\.json: "runtime": \{ "generated": \[".piling-badge"\] \}/.test(line)), piling.stdout);      assert.ok(ran.some((line) => /^example\.html:2: the component redraws its text part title: the file says "一个例子", the page "画过的标题"/.test(line)), piling.stdout);
      assert.ok(ran.some((line) => /^example\.html:2: dehydrate does not leave it as the file has it/.test(line)), piling.stdout);
      assert.deepEqual(pictures("local/piling"), WIDE, "pictures all the same");
      // A drawn node holding others, named nowhere: one problem for each instance's file, of the outer node, with
      // what it holds and the runtime to write; what dehydrate then leaves and what piles inside it go unsaid.
      take("local/nested-pile");
      const nested = await gallery("check", "nested-pile");
      assert.equal(nested.code, 1, nested.stdout);
      const nestedSaid = nested.stdout.split(/\r?\n/).filter((line) => line.startsWith("  FAIL ")).map((line) => line.slice(7));
      assert.deepEqual(nestedSaid, [
        'example.html:1: <div class="nest-drawn"> piles up on each put-back (1, then 2, then 3, then 4 of them, with what it holds): it is declared in neither the manifest\'s runtime nor dehydrate, so an undo adds another. Name it in component.json: "runtime": { "generated": [".nest-drawn"] } (beside what generated already names), or take it off in dehydrate',
      ], nested.stdout);
      fs.rmSync(folderOf("local/nested-pile"), { recursive: true });
      // A component that writes in its slot, the document's (a line of its own there a moment after each
      // mount, from a timer of the browser's, which no call of the kit's holds; its dehydrate takes it off
      // again): that alone, once.
      take("local/slot-writer");
      const slotWriter = await gallery("check", "slot-writer");
      assert.equal(slotWriter.code, 1, slotWriter.stdout);
      assert.deepEqual(slotWriter.stdout.split(/\r?\n/).filter((line) => line.startsWith("  FAIL ")), ["  FAIL example.html:1: kit.js changed the blocks the slot body holds (p, then p p), as it mounts: a slot is the document's, its blocks the reader's: read it with context.part, never write in it or move it, and draw outside it"], slotWriter.stdout);

      // The export's look of a block with a data part (what a reader of the exported file sees, where nothing
      // is written): a form its style gives display: flex and its script hides by the hidden attribute alone is
      // hidden there, the kit holding [hidden] over the style (the bug of a ledger an Agent wrote, whose form an
      // export showed), so no note; one that never hides its form gets a note, once, naming what it still
      // shows, at kit.js. An example that changes nothing on template.html's empty instance fails at kit.js,
      // naming that instance. What a scaffold of --data and --page writes passes with nothing said.
      take("local/hidden-form");
      const hiddenForm = await gallery("check", "hidden-form");
      assert.equal(hiddenForm.code, 0, hiddenForm.stdout);
      assert.ok(!hiddenForm.stdout.includes("still shows") && /5\. in a browser, under the export's policy: ok\n/.test(hiddenForm.stdout), hiddenForm.stdout);
      take("local/leaky");
      const leaky = await gallery("check", "leaky");
      assert.equal(leaky.code, 0, leaky.stdout);
      const showing = leaky.stdout.split(/\r?\n/).filter((line) => line.startsWith("  note kit.js: where nothing is written"));
      assert.equal(showing.length, 1, `once, for both instances: ${leaky.stdout}`);
      assert.match(showing[0], /^ {2}note kit\.js: where nothing is written \(this look is an export: context\.canEdit\(\) is false\) the instance of (?:example|template)\.html:\d+ still shows <input class="ledger-field">, <button class="ledger-add"> "记一笔", enabled, and the block has a data part: /);
      assert.ok(showing[0].includes("hide it by the hidden attribute (the kit holds [hidden] over any display the style gives it) or disable it; ignore this for a control that only changes what a reader looks at"), showing[0]);
      assert.match(leaky.stdout, /5\. in a browser, under the export's policy: ok, 1 note\n/);
      take("local/empty-example");
      const emptied = await gallery("check", "empty-example");
      assert.equal(emptied.code, 1, emptied.stdout);
      const emptyFail = emptied.stdout.split(/\r?\n/).filter((line) => line.startsWith("  FAIL "));
      assert.equal(emptyFail.length, 1, emptied.stdout);
      assert.match(emptyFail[0], /^ {2}FAIL kit\.js: its example\(host, context\) changes nothing a part holds on the instance of template\.html:\d+: the check runs it on every instance of example\.html and of template\.html, and template\.html's is empty, with nothing to change a value of \(the first entry of a list it does not hold yet\)\. Make example\(\) make a change that works on an empty instance too \(add an entry, set a field\), and have it call the function a reader's control calls/);
      // Every picture of the run in one line before the verdict, as qa's and page check's end.
      const finish = emptied.stdout.split(/\r?\n/).filter(Boolean);
      // A hint: the ten pictures and their folder, the two overviews the whole of it; none needs opening (the user's 2026-11-13).
      assert.match(finish.at(-2), /^提示：10 pictures in .*[\\/]empty-example\/ \(the whole of it: .*[\\/]empty-example\/overview-light\.png, .*[\\/]empty-example\/overview-dark\.png\): none needs opening; open one when you want to see it$/, emptied.stdout);
      assert.match(finish.at(-1), /^FAIL local\/empty-example: 1 problem$/);
      for (const id of ["local/hidden-form", "local/leaky", "local/empty-example"]) fs.rmSync(folderOf(id), { recursive: true });
      for (const [flags, id] of [[["--data"], "team/ledger"], [["--page"], "team/glance"], [["--data", "--page"], "team/pagedata"]]) {
        assert.equal((await gallery("new", ...flags, id)).code, 0);
        const scaffold = await gallery("check", id);
        assert.equal(scaffold.code, 0, scaffold.stdout);
        assert.match(scaffold.stdout, /5\. in a browser, under the export's policy: ok\n/, `${id}: nothing said, no note: ${scaffold.stdout}`);
        assert.ok(!scaffold.stdout.includes("\n  note "), `${id}: no note: ${scaffold.stdout}`);
        if (flags.includes("--data")) assert.match(scaffold.stdout, /\n {2}way back example\.html:1: its example wrote items \(-1 \+1 of its 1 line\); the server took it; put back as an undo does, it shows what it showed\n/, scaffold.stdout);
        fs.rmSync(folderOf(id), { recursive: true });
      }

      // The way back to the file: what writes back and passes, and each thing that goes astray on it.
      fs.cpSync(fixture("local/rows"), folderOf("local/rows"), { recursive: true });
      const backed = await gallery("check", "rows");
      assert.equal(backed.code, 0, backed.stdout + backed.stderr);
      // Its example moves a row and leaves the blank before it behind: a line left blank, a note. Of the
      // lines that hold more than white space, two went (the row, the body's end tag) and one came (the row
      // and that end tag after it), the blank left counting for none.
      assert.match(backed.stdout, /\n {2}note example\.html:1: its example's write lays the part rows out anew \(a line left blank\): /, backed.stdout);
      assert.match(backed.stdout, /\n {2}way back example\.html:1: its example wrote rows \(-2 \+1 of its 6 lines\); the server took it; put back as an undo does, it shows what it showed\n/, backed.stdout);
      // A write that lays its JSON out anew, the names of one line written on five, and a list a row is
      // dropped on that cancels dragover alone, at the line of kit.js that listens: each a note.
      take("local/laid-anew");
      const laid = await gallery("check", "laid-anew");
      assert.equal(laid.code, 0, laid.stdout);
      assert.match(laid.stdout, /\n {2}note example\.html:1: its example's write lays the part picks out anew \(1 line became 5\): /, laid.stdout);
      // Its way back counts the lines that hold more than white space, those it takes out and puts in as
      // those the part has, never more taken out than there were (the script's text starts and ends on
      // lines of white space alone).
      assert.match(laid.stdout, /\n {2}way back example\.html:1: its example wrote picks \(-5 \+9 of its 5 lines\); /, laid.stdout);
      take("local/dragover-only");
      const dropping = await gallery("check", "dragover-only");
      const listens = fs.readFileSync(path.join(folderOf("local/dragover-only"), "kit.js"), "utf8").split("\n").findIndex((line) => line.includes('"dragover"')) + 1;
      assert.equal(dropping.code, 0, dropping.stdout);
      assert.ok(dropping.stdout.includes(`\n  note kit.js:${listens}: <ol class="drops-list"> listens for dragover and not for dragenter: `) && !dropping.stdout.includes("lays the part"), dropping.stdout);
      const dropScript = fs.readFileSync(path.join(folderOf("local/dragover-only"), "kit.js"), "utf8");
      const listening = (line) => fs.writeFileSync(path.join(folderOf("local/dragover-only"), "kit.js"), dropScript.replace('list.addEventListener("dragover"', `${line}\n    list.addEventListener("dragover"`));
      listening('list.addEventListener("dragenter", (event) => event.preventDefault(), { signal: context.signal });');
      assert.ok(!(await gallery("check", "dragover-only")).stdout.includes("not for dragenter"), "cancelling dragenter too, nothing");
      // A dragenter listener of the window's or the document's hears every drag of the page: it answers
      // for the list where it cancels one entering it, and one that cancels nothing leaves the note.
      listening('window.addEventListener("dragenter", () => {}, { signal: context.signal });');
      assert.ok((await gallery("check", "dragover-only")).stdout.includes(`\n  note kit.js:${listens + 1}: <ol class="drops-list"> listens for dragover and not for dragenter: `), "a window's listener that cancels nothing, the note");
      listening('document.addEventListener("dragenter", (event) => event.preventDefault(), { signal: context.signal });');
      assert.ok(!(await gallery("check", "dragover-only")).stdout.includes("not for dragenter"), "a document's listener that cancels it, nothing");
      fs.rmSync(folderOf("local/laid-anew"), { recursive: true });
      fs.rmSync(folderOf("local/dragover-only"), { recursive: true });
      take("local/astray");
      const astray = await gallery("check", "astray");
      assert.equal(astray.code, 1, astray.stdout);
      const wrong = astray.stdout.split(/\r?\n/).filter((line) => line.startsWith("  FAIL ")).map((line) => line.slice(7));
      for (const said of [
        /^example\.html:1: what its example wrote cannot go in the file: a script, a handler/,
        /^example\.html:5: its example: it changes what is no data part: data-moved/,
        /^example\.html:9: with what its example wrote put back, as an undo does, it does not show what it showed/,
        /^example\.html:13: a mount changes its data part rows/,
        /^example\.html:17: its example: context\.edit was not taken/,
        /^kit\.js: its example\(host, context\) changes nothing a part holds on the instance of example\.html:21: /,
        /^example\.html:25: its example: it changes the part rows's own tag or attributes, which are the file's/,
        /^example\.html:29: its example: it writes the part rows on the page, not the draft context\.edit hands it/,
        /^example\.html:33: it writes its data part rows with no reader's gesture, as it mounts, once the page takes edits/,
        /^example\.html:37: it writes its data part rows with no reader's gesture, as it hears that it can write \(the editable signal\), once the page takes edits/,
        /^example\.html:41: it writes its data part rows with no reader's gesture, as it hears its part changed \(the source signal\), once the page takes edits/,
      ]) assert.ok(wrong.some((line) => said.test(line)), `${said}: ${astray.stdout}`);
      assert.equal(wrong.filter((line) => line.includes("with no reader's gesture")).length, 3, `a write with no gesture is that instance's alone: ${astray.stdout}`);
      assert.ok(wrong.some((line) => /the console says .*Error: no/.test(line)), "what the change threw is told");
      const silent = fs.readFileSync(path.join(folderOf("local/rows"), "kit.js"), "utf8").replace(/  example\(host, context\) \{[\s\S]*?\n  \},\n/, "");
      fs.writeFileSync(path.join(folderOf("local/rows"), "kit.js"), silent);
      const unexampled = await gallery("check", "rows");
      assert.equal(unexampled.code, 0, unexampled.stdout);
      assert.match(unexampled.stdout, /note example\.html:1: it has a data part and its component offers no example of an edit/, unexampled.stdout);
      fs.rmSync(folderOf("local/astray"), { recursive: true });
      fs.rmSync(folderOf("local/rows"), { recursive: true });

      // Each other thing a page can say, one instance of the example for each, its fault its own and
      // told by its place in the file: a mount that throws, a mark no runtime or dehydrate takes off, the
      // same words written again, a part's change that does not stand, another DOM each time, a drawing
      // that never holds still, the console, a dehydrate that throws, what the policy blocks, what piles
      // up outside the instance, on the page and in its head, a mark on a part, a dialog, a window, code
      // made from words, a page wider than the window; and three that are no fault: what destroy takes
      // away again, a style left with nothing in it, and what another page says in a frame.
      write("kit.js", [
        "const FAULTS = {",
        '  throws() { throw new Error("boom"); },',
        '  marks(host) { host.setAttribute("data-seen", "yes"); },',
        '  again(host, context) { const title = context.part("title"); title.textContent = title.textContent; },',
        '  undoes(host, context) { let once = true; return { update() { if (once) context.part("text").textContent = "写回去"; once = false; } }; },',
        '  differs(host) { const drawn = document.createElement("div"); drawn.className = "component-drawn"; drawn.textContent = String(Math.random()); host.append(drawn); },',
        '  moves(host, context) { const drawn = document.createElement("div"); drawn.className = "component-drawn"; host.append(drawn); const tick = () => { drawn.textContent = String(performance.now()); context.frame(tick); }; tick(); },',
        '  tells() { console.error("said by the component"); console.warn("a warning"); },',
        '  leaves() { const left = document.createElement("aside"); left.className = "left-behind"; document.body.append(left); },',
        '  heads() { document.head.append(document.createElement("style")); },',
        '  takes() { const tip = document.createElement("div"); tip.className = "tip"; document.body.append(tip); return { destroy() { tip.remove(); } }; },',
        '  fades(host) { host.style.setProperty("opacity", "0.9"); },',
        '  scribbles(host, context) { context.part("text").setAttribute("data-seen", "yes"); },',
        '  asks() { alert("真的吗"); },',
        '  opens() { window.open("about:blank"); },',
        '  says() { setTimeout("1"); },',
        "};",
        "DocKit.component({",
        '  id: "local/good",',
        '  on: ["source"],',
        "  mount(host, context) { return FAULTS[host.dataset.fault]?.(host, context); },",
        '  dehydrate(host) { if (host.dataset.fault === "dehydrates") throw new Error("nothing to take off"); host.style.removeProperty("opacity"); },',
        "});",
        "",
      ].join("\n"));
      const instance = (fault, also = "") => `<div data-doc-component="local/good" data-fault="${fault}"><h3>一</h3><p>二</p>${also}</div>`;
      write("example.html", [instance("throws"), instance("marks"), instance("again"), instance("undoes"), instance("differs"), instance("moves"), instance("tells"), instance("dehydrates"), instance("blocks", '<iframe src="http://example.com/"></iframe>'), instance("leaves"), instance("heads"), instance("takes"), instance("fades"), instance("scribbles"), instance("asks"), instance("opens"), instance("says"), instance("wide", '<div class="wide" style="width: 2000px">宽</div>'), instance("pictures", '<img src="logo.png" alt="一">'), instance("frames", '<iframe srcdoc="&lt;script&gt;console.error(&quot;from a frame&quot;)&lt;/script&gt;"></iframe>'), ""].join("\n"));
      const zoo = await gallery("check", "good");
      reset();
      assert.equal(zoo.code, 1, zoo.stdout);
      const zooLines = zoo.stdout.split(/\r?\n/);
      const zooFailing = zooLines.filter((line) => line.startsWith("  FAIL ")).map((line) => line.slice(7));
      const has = (pattern) => assert.ok(zooFailing.some((line) => pattern.test(line)), `${pattern}\n${zoo.stdout}`);
      has(/^kit\.js:2: the console says \[DocKit\] local\/good: Error: boom$/);
      has(/^example\.html:1: its component failed or never started: the instance shows what it holds, read-only$/);
      has(/^example\.html:2: dehydrate does not leave it as the file has it, .*data-seen on <div>, null then "yes"/);
      has(/^example\.html:3: the component redraws its text part title: a mount changes it\. /);
      has(/^example\.html:4: the component redraws its text part text: a change of its words does not stand\. /);
      has(/^example\.html:5: a mount does not give the same DOM again: in <div class="component-drawn">, the words "[\d.]+" then the words "[\d.]+"$/);
      has(/^the page: the console says said by the component$/);
      has(/^kit\.js:22: the console says \[DocKit\] local\/good: Error: nothing to take off$/);
      has(/^the page: the export's policy blocks http:\/\/example\.com \(frame-src\): an export holds all it needs$/);
      assert.equal(zooFailing.filter((line) => line.includes("policy blocks http://example.com")).length, 1, "once, however often it is asked for");
      assert.ok(zooLines.includes("  note example.html:6: what it shows never holds still (an animation?), so its mounts could not be compared"), zoo.stdout);
      assert.ok(zooLines.includes("  note the page: the console says a warning"), zoo.stdout);
      has(/^example\.html:10: <aside class="left-behind"> piles up outside the instance on each put-back \(1, then 2, then 3, then 4 of them\), so an undo adds another: /);
      has(/^example\.html:11: <style> piles up outside the instance on each put-back \(\d+, then \d+, then \d+, then \d+ of them\)/);
      has(/^example\.html:14: dehydrate does not leave it as the file has it, .*data-seen on <p>, null then "yes"\. That stands in its part text, which is the file's: read a part, and draw in what is the component's$/);
      has(/^the page: it opens a dialog \(alert\), which stops a reader's page until it is answered/);
      has(/^the page: it opens a window, which takes a reader away from the page/);
      has(/^kit\.js:16: the export's policy blocks code made from words \(eval, new Function, a string given to setTimeout\): an export runs none$/);
      has(/^example\.html:18: the page is \d+px wide in a 360px window, \d+px wide in a 736px window, \d+px wide in a 1024px window: a reader scrolls the whole page sideways, and gallery qa fails it: /);
      has(/^the page: the export's policy blocks logo\.png \(img-src\): a picture of an instance is a data: address, or a file its style names$/);
      assert.ok(!zooFailing.some((line) => /policy blocks (?:file|eval) |from a frame/.test(line) || line.startsWith("example.html:12:") || line.startsWith("example.html:13:")), zoo.stdout);

      // One that says nothing of registering and starts all the same passes; one that starts nothing is told by the run.
      write("kit.js", 'const { component } = DocKit;\ncomponent({ id: "local/good", mount() {} });\n');
      const destructured = await gallery("check", "good");
      assert.equal(destructured.code, 0, destructured.stdout);
      // The page as the editing page draws it, context.canEdit() true, pictured apart from the export's:
      // a component that draws what a reader edits with only where it can edit draws otherwise there.
      write("kit.js", 'DocKit.component({\n  id: "local/good",\n  on: ["source", "editable"],\n  mount(host, context) {\n    const drawn = document.createElement("div");\n    drawn.className = "component-drawn";\n    host.append(drawn);\n    const draw = () => { drawn.textContent = context.canEdit() ? "拖动这一块来改它" : "只读"; };\n    draw();\n    return { update: draw };\n  },\n});\n');
      const editing = await gallery("check", "good");
      assert.equal(editing.code, 0, editing.stdout);
      const shot = (name) => fs.readFileSync(path.join(workspace, ".gallery", "qa", "components", "local", "good", name));
      assert.ok(!shot("edit-1024-light.png").equals(shot("1024-light.png")) && !shot("edit-360-light.png").equals(shot("360-light.png")), "as the editing page draws it, what it draws there");
      assert.ok(editing.stdout.includes("edit-360-light.png, as the editing page draws it (context.canEdit() true)\n提示：10 pictures in ") && !editing.stdout.includes("the same picture as the export's"), `what it draws there, said of no picture as the export's: ${editing.stdout}`);
      write("kit.js", "const a = 1;\n");
      const started = await gallery("check", "good");
      assert.equal(started.code, 1, started.stdout);
      assert.ok(started.stdout.includes("FAIL example.html:1: its component failed or never started: the instance shows what it holds, read-only"), started.stdout);
      reset();

      // A block of many text parts is no script that never ends, and a package with no script is never told of one.
      write("component.json", files["component.json"].replace(/"parts": \{[^}]*\}[^}]*\}\s*\},/, '"parts": { "title": { "at": ":scope > h3", "edit": "text" }, "items": { "at": "li", "edit": "text" } },'));
      remove("kit.js");
      write("example.html", `<div data-doc-component="local/good">\n  <h3>一</h3>\n  <ul>\n${Array.from({ length: 100 }, (_, at) => `    <li>第 ${at} 项</li>\n`).join("")}  </ul>\n</div>\n`);
      write("template.html", '<div data-doc-component="local/good">\n  <h3>一</h3>\n  <ul><li>一项</li></ul>\n</div>\n');
      const longBlock = await gallery("check", "good");
      assert.equal(longBlock.code, 0, longBlock.stdout);
      reset();

      // One the user turned off runs as any.
      const settingsNow = fs.readFileSync(marker, "utf8");
      fs.writeFileSync(marker, JSON.stringify({ ...JSON.parse(settingsNow), components: { hidden: [], disabled: ["local/good"] } }));
      const turnedOff = await gallery("check", "good");
      fs.writeFileSync(marker, settingsNow);
      assert.equal(turnedOff.code, 0, turnedOff.stdout);
      assert.match(turnedOff.stdout, /5\. in a browser, under the export's policy: ok/);
      assert.match(turnedOff.stdout, /note gallery\.json: the user turned it off/);
      assert.match(turnedOff.stdout, /OK {3}local\/good\n$/);

      // A package no one can write to is checked as any, and the files stay as they were.
      for (const name of Object.keys(files)) fs.chmodSync(path.join(folderOf("local/good"), name), 0o444);
      const readOnly = await gallery("check", "good");
      for (const name of Object.keys(files)) fs.chmodSync(path.join(folderOf("local/good"), name), 0o666);
      assert.equal(readOnly.code, 0, readOnly.stdout + readOnly.stderr);
      assert.equal(fs.readFileSync(path.join(folderOf("local/good"), "kit.js"), "utf8"), files["kit.js"]);

      // Where its pictures go cannot be written: said, the rest standing.
      const qa = path.join(workspace, ".gallery", "qa");
      fs.rmSync(qa, { recursive: true, force: true });
      fs.writeFileSync(qa, "");
      const noPictures = await gallery("check", "good");
      fs.rmSync(qa);
      assert.equal(noPictures.code, 3, noPictures.stdout + noPictures.stderr);
      assert.match(noPictures.stdout, /5\. in a browser, under the export's policy: UNVERIFIED cannot write .*\.gallery[\\/]qa[\\/]?.* \(E[A-Z]+\)\n/);
      assert.equal(noPictures.stderr, "", "no stack");

      // What keeps a page from opening or from staying ends the look and is said: `loading` here is
      // what the look waits for a load that never comes, a minute as a command runs it.
      const look = async (code) => {
        write("kit.js", code);
        forgetCatalog(workspace);
        const section = await lookAtPackage(workspace, readSections(workspace, "local/good").found, { example: files["example.html"], template: files["template.html"] }, { loading: 6000 });
        reset();
        return (section.problems ?? []).map(({ file, line, what }) => `${file}${line ? `:${line}` : ""}: ${what}`);
      };
      const NEVER_ENDS = "the page: it stopped answering while waiting until the page opened: a script that never ends, or a component that changes what it hears (a text part, on its source signal)";
      const inMount = (body) => `DocKit.component({\n  id: "local/good",\n  mount() { ${body} },\n});\n`;
      assert.deepEqual(await look(inMount("while (true) {}")), [NEVER_ENDS], "a script that never ends as the kit mounts");
      assert.deepEqual(await look("while (true) {}\n"), [NEVER_ENDS], "or as it is read");
      const AGAIN = "the page: it loads itself again (location.reload(), a new location.href), so a reader's page would not stay";
      assert.ok((await look(inMount("location.reload();"))).includes(AGAIN), "as it opens");
      assert.ok((await look(inMount("setTimeout(() => location.reload(), 1000);"))).includes(AGAIN), "or after");

      // A component that changes what it hears (its text part, on its source signal) stops no page: the
      // kit tells it in its next frame (2026-11-07), so that its writes go on a frame at a time, as an
      // animation would, and the check says what it does to its text part; a page that stops answering
      // ends the check all the same (the scripts that never end, above). A browser that went while it
      // waited, as Chrome may on a machine short of memory, says nothing of the page.
      const WRITES_ITS_PART = 'DocKit.component({\n  id: "local/good",\n  on: ["source"],\n  mount(host, context) { return { update() { context.part("title").textContent += "写回去"; } }; },\n});\n';
      write("kit.js", WRITES_ITS_PART);
      const stuck = await gallery("check", "good");
      reset();
      if (stuck.code === 3) assert.match(stuck.stdout, /UNVERIFIED the browser went while waiting until /);
      else {
        assert.equal(stuck.code, 1, stuck.stdout);
        assert.ok(stuck.stdout.includes("  FAIL example.html:1: the component redraws its text part title: "), stuck.stdout);
      }
      // The browser going is said as that and fails nothing, whatever the page was doing, a page with
      // nothing wrong or a stuck one (a component that never returns from what it hears, which it hears
      // as its text part is changed), and whatever the question then failed with.
      const STUCK_ON_SOURCE = 'DocKit.component({\n  id: "local/good",\n  on: ["source"],\n  mount() { return { update() { for (;;) {} } }; },\n});\n';
      for (const [code, after] of [[files["kit.js"], 300], [files["kit.js"], 1500], [files["kit.js"], 4000], [STUCK_ON_SOURCE, 8000]]) {
        write("kit.js", code);
        forgetCatalog(workspace);
        const section = await lookAtPackage(workspace, readSections(workspace, "local/good").found, { example: files["example.html"], template: files["template.html"] }, {
          start: async (options) => {
            const running = await startBrowser(options);
            setTimeout(() => running.browser.close().catch(() => {}), after);
            return running;
          },
        });
        reset();
        assert.match(section.unverified ?? "", /^the browser went /, JSON.stringify(section));
        assert.deepEqual(section.problems ?? [], [], `closed after ${after}ms`);
      }
      // A browser that does not answer as the page is set up (a context or a tab that never opens) is no
      // wait without an end: the look stops, with what it waited for, and the browser is closed (found
      // testing the skill with Agents, 2026-11-09: a check that waited 15 minutes). \`answer\` is the bound, 0.3 s here.
      for (const [hang, waited] of [["createBrowserContext", "a browser context opened"], ["newPage", "a tab opened"]]) {
        write("kit.js", files["kit.js"]);
        forgetCatalog(workspace);
        const closing = { count: 0 };
        const context = { newPage: () => new Promise(() => {}) };
        const browser = { connected: true, once() {}, createBrowserContext: () => (hang === "createBrowserContext" ? new Promise(() => {}) : Promise.resolve(context)) };
        const section = await lookAtPackage(workspace, readSections(workspace, "local/good").found, { example: files["example.html"], template: files["template.html"] }, {
          find: () => "a-browser-that-does-not-answer", start: async () => ({ browser, close: async () => { closing.count += 1; } }), answer: 300,
        });
        reset();
        assert.equal(section.unverified, undefined, JSON.stringify(section));
        assert.deepEqual((section.problems ?? []).map(({ what }) => what), [`the browser did not answer within 0.3 s, waiting until ${waited}, so the look stopped and the browser was closed`]);
        assert.equal(closing.count, 1, "the browser closed once");
      }
    }
  } finally {
    process.env.GALLERY_DEFAULT_WORKSPACE = home;
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
}

console.log("Checked gallery block (and gallery component, its other name): new (the scope gallery refused, --recipe), add (as it ships, recorded, updated, never over a changed copy), list by places with Gallery's own not added yet, show and check, each kind of refusal, what is said of a package that cannot be used, and a scaffold and the fixtures passing a check that names each thing wrong at its line.");
