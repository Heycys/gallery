import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import { createEditService } from "../../src/editor/service.mjs";
import { findBlocks } from "../../src/editor/source.mjs";
import { ASSETS } from "../../src/render/assets.mjs";
import { componentFailures, componentNotes } from "../../src/render/component-checks.mjs";
import { renderReportHtml } from "../../src/render/report-html.mjs";
import { parseReport } from "../../src/render/report-tree.mjs";
import { API_VERSION, KIT_ASSETS, catalogStamp, componentSettings, currentCatalog, descriptionOf, descriptionsOf, forgetCatalog, keepCatalog, menuOf, packageStates, packageTags, problemIn, readCatalog, settingsLine, settingsProblem, templateProblem, writeComponentSettings } from "../../src/shared/component-catalog.mjs";
import { createCatalogWatch } from "../../src/server/catalog-watch.mjs";
import { createComponentSettings } from "../../src/server/component-settings.mjs";
import { BLOCK_ICON, CODE_ICON, SECTION_ICON } from "../../src/editor/components/icons.mjs";
import { followSettings } from "../../src/editor/components/installed/served.mjs";
import { inDocumentMenus, unlistedBy } from "../../src/shared/components/installed.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { runJob } from "../../src/transfer/jobs.mjs";

// The catalog of a workspace's component packages (src/shared/component-catalog.mjs): every field
// of a manifest read and held, a package with a problem left out with
// why, and nothing else touched by it; a package's stamps; what gallery.json says of the components;
// the catalog a process keeps and how the server takes a new one (src/server/catalog-watch.mjs), each
// case with times of its own.

const page = (body) => `<!doctype html>
<html lang="zh-CN">
<head><title>t</title></head>
<body>
  <main class="doc-page" data-doc-id="t">
    <header class="doc-header">
      <h1 class="doc-title">t</h1>
    </header>
    ${body}
  </main>
</body>
</html>
`;

const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-catalog-"));
const workspace = process.env.GALLERY_DEFAULT_WORKSPACE;
process.env.GALLERY_DEFAULT_WORKSPACE = root;
const folderOf = (id) => path.join(root, "components", ...id.split("/"));
const put = (id, file, text) => {
  fs.mkdirSync(path.dirname(path.join(folderOf(id), file)), { recursive: true });
  fs.writeFileSync(path.join(folderOf(id), file), text);
};
// A manifest that reads as one, `fields` over it (undefined: left out).
const manifest = (id, fields = {}) => ({ id, apiVersion: 1, version: "1.2.3", name: { zh: "件", en: "Piece" }, description: { zh: "一件", en: "A piece" }, words: "piece 件", parts: { title: { at: ":scope > h3", edit: "text" } }, ...fields });
const write = (id, fields) => put(id, "component.json", JSON.stringify(manifest(id, fields)));
// The reason a manifest with `fields` does not load, in English, and that it is no package.
const reason = (fields, id = "local/case") => {
  write(id, fields);
  const { packages, problems } = readCatalog();
  assert.ok(!packages.has(id), `${JSON.stringify(fields)} loads`);
  return problemIn("en", problems.get(id.toLowerCase()).problem);
};

try {
  fs.cpSync(path.join(projectRoot, "tests", "fixtures", "components"), path.join(root, "components"), { recursive: true });

  // ---------- a package that loads ----------
  {
    const { packages, problems, stamp } = readCatalog();
    assert.deepEqual([...packages.keys()], ["local/brief", "local/kanban", "local/rows", "local/scorecard", "local/strip", "local/tally"], "the fixtures' packages");
    assert.equal(problems.size, 0);
    assert.match(stamp, /^[a-f0-9]{16}$/);
    const strip = packages.get("local/strip");
    assert.equal(strip.match, 'div[data-doc-component="local/strip"], section[data-doc-component="local/strip"]');
    assert.deepEqual([strip.apiVersion, strip.version, strip.name.en, strip.description.zh, strip.markdown], [API_VERSION, "1.0.0", "Metric strip", "一排数字和它们的说明", "parts"]);
    assert.match(strip.words, /kpi/);
    assert.deepEqual(strip.assets, [], "no field is needed beyond what a menu shows");
    assert.deepEqual(strip.files, ["style.css"], "what the route gives out of it, as it stands in the folder: no script");
    assert.deepEqual([packages.get("local/tally").files, packages.get("local/tally").assets], [["kit.js", "style.css", "preview-light.webp", "preview-dark.webp", "tick.svg"], ["dialogs"]], "a file of its own its assets name among them, the kit's kept apart");
    assert.match(strip.template, /^<div class="strip" data-doc-component="local\/strip">/, "its template as it stands in the folder");
    // A slot (edit "flow"): its `at` the engines' own, by its mark, which what the manifest says goes by alone.
    const brief = packages.get("local/brief");
    assert.deepEqual(brief.parts.body, { edit: "flow", at: 'div[data-doc-slot="body"], section[data-doc-slot="body"]' });
    assert.equal(brief.parts.title.at, ":scope > h3", "its other parts as written");
    const manifestText = fs.readFileSync(path.join(root, "components", "local", "brief", "component.json"), "utf8");
    assert.equal(brief.definition, createHash("sha256").update(manifestText).digest("hex").slice(0, 16), "its definition the manifest's text, the `at` it was given no part of it");
    assert.deepEqual(readCatalog(path.join(root, "nowhere")), { packages: new Map(), problems: new Map(), settings: { hidden: [], disabled: [], shown: [], unlisted: [], listed: [], net: {}, packs: {}, packsOff: [] }, packs: new Map(), stamp: catalogStamp({ packages: new Map(), problems: new Map() }) }, "no folder, no packages");

    write("local/full", {
      runtime: { generated: [".board", ":scope > .made, .other"], attrs: { table: ["hidden"], ":scope": ["data-ready"] } },
      assets: ["charts", "math", "images/logo.png"],
      markdown: "text",
      schema: 3,
      parts: { title: { at: ":scope > h3", edit: "text", optional: true }, tasks: { at: ":scope > table", edit: "data", min: 1, max: 2 }, frame: { at: ".frame", edit: "none" } },
    });
    put("local/full", "images/logo.png", "png");
    put("local/full", "style.css", ".x {}");
    put("local/full", "preview.svg", "<svg></svg>");
    put("local/full", "preview-light.webp", "webp");
    put("local/full", "template.html", '<div data-doc-component="local/full"></div>');
    const full = readCatalog().packages.get("local/full");
    assert.equal(descriptionOf(full).schema, 3, "the kit is told how far its content's shape goes");
    const instance = '[data-doc-component="local/full"]';
    assert.deepEqual(full.runtime, {
      generated: [`${instance} .board`, `${instance} > .made, ${instance} .other`],
      attrs: { [`${instance} table`]: ["hidden"], [instance]: ["data-ready"] },
    }, "each selector with the instance as its root, as the kit's dehydrate looks through the whole page");
    assert.deepEqual([full.assets, full.files, full.markdown, full.template], [["charts", "math"], ["style.css", "preview-light.webp", "images/logo.png"], "text", '<div data-doc-component="local/full"></div>'], "the kit's by id, its own as files (a preview.svg, which nothing shows since 2026-11-17, none of them)");
    put("local/full", "template.html", '\uFEFF<div data-doc-component="local/full"></div>');
    assert.equal(readCatalog().packages.get("local/full").template, '<div data-doc-component="local/full"></div>', "a template has no byte-order mark, as a manifest has none");
    fs.rmSync(folderOf("local/full"), { recursive: true });
    for (const id of KIT_ASSETS) assert.ok(ASSETS.some((asset) => asset.id === id), `${id} is a file of the kit's`);
    assert.deepEqual(ASSETS.filter((asset) => !KIT_ASSETS.has(asset.id) && !asset.always && !asset.added && !asset.page).map(({ id }) => id), [], "every file of the kit's a page does not have anyway can be asked for (a custom page's own, the board's, on every custom page and asked for by none)");
  }

  // ---------- a package that does not load ----------
  {
    // A manifest of bad JSON, half written or not, and one that is no object.
    put("local/case", "component.json", '{ "id": "local/ca');
    assert.match(problemIn("en", readCatalog().problems.get("local/case").problem), /^component\.json is not JSON: /);
    put("local/case", "component.json", "[]");
    assert.equal(problemIn("en", readCatalog().problems.get("local/case").problem), "component.json holds no object");

    // A wrong id, and a folder no id can be.
    assert.equal(reason({ id: "local/elsewhere" }), "its id says local/elsewhere, and its folder is local/case");
    assert.equal(reason({ id: "Local/Case" }), "its id says Local/Case, and its folder is local/case");
    assert.equal(reason({}, "local/Bad_Name"), "local/Bad_Name can be no custom block's id: its scope and its name are lowercase letters, digits and dashes");
    fs.rmSync(folderOf("local/Bad_Name"), { recursive: true });
    // A name Windows keeps for a device, which a workspace that moves there could not hold.
    assert.equal(reason({}, "local/con"), "local/con can be no custom block's id: con is a name Windows keeps for a device");
    fs.rmSync(folderOf("local/con"), { recursive: true });
    assert.equal(reason({}, "com1/x"), "com1/x can be no custom block's id: com1 is a name Windows keeps for a device");
    fs.rmSync(path.join(root, "components", "com1"), { recursive: true });

    // Missing fields.
    for (const field of ["apiVersion", "version", "name", "description", "parts"]) assert.equal(reason({ [field]: undefined }), `it has no ${field}`);
    assert.equal(reason({ name: { zh: "件" } }), "name is words in both languages: { zh, en }");
    assert.equal(reason({ description: "一件" }), "description is words in both languages: { zh, en }");
    assert.equal(reason({ name: { zh: "件", en: "Piece", fr: "Pièce" } }), "name is words in both languages: { zh, en }");
    assert.equal(reason({ version: 1 }), "version is words");
    assert.equal(reason({ words: 3 }), "words is words");
    assert.equal(reason({ apiVersion: "1" }), "apiVersion is a whole number from 1");
    assert.equal(reason({ apiVersion: 0 }), "apiVersion is a whole number from 1");

    // What a manifest cannot name: the engines' words, and anything else it does not know.
    for (const field of ["category", "unit", "units", "box", "boxed", "host", "hosts", "rank", "kit"]) assert.equal(reason({ [field]: "whole" }), `${field} is no field a custom block's manifest writes`);

    // Its parts: the grammar's check, and what the parsed tree or a browser's selectors cannot read.
    assert.equal(reason({ parts: [] }), "parts is a table, by name");
    assert.equal(reason({ parts: { a: "h3" } }), "parts.a is a table, by name");
    assert.equal(reason({ parts: { a: { edit: "text" } } }), "it has no parts.a.at");
    // A slot (edit "flow"): marked in the markup by its name, one to an instance; its `at` the engines' own.
    assert.equal(reason({ parts: { a: { at: "h3", edit: "flow" } } }), 'parts.a is a slot, marked data-doc-slot="a": it has no at');
    assert.equal(reason({ parts: { a: { edit: "flow", min: 1 } } }), "parts.a is a slot, one to an instance: it has no min or max");
    assert.equal(reason({ parts: { Body: { edit: "flow" } } }), "parts.Body is a slot: its name is lowercase letters, digits and hyphens");
    assert.equal(reason({ parts: { a: { edit: "flow", optional: 1 } } }), "parts.a.optional is true or false");
    assert.equal(reason({ parts: { a: { at: "h3", edit: "fl0w" } } }), "parts.a: edit is text, data, flow or none");
    assert.equal(reason({ parts: { a: { at: "h3" } } }), "parts.a: edit is text, data, flow or none");
    assert.equal(reason({ parts: { a: { at: "h3", edit: "text", groups: false } } }), "parts.a.groups is no field a custom block's manifest writes");
    assert.equal(reason({ parts: { a: { at: "h3", edit: "text", rank: 1 } } }), "parts.a.rank is no field a custom block's manifest writes");
    assert.equal(reason({ parts: { a: { at: "h3", edit: "text", optional: "yes" } } }), "parts.a.optional is true or false");
    assert.equal(reason({ parts: { a: { at: "h3", edit: "text", min: -1 } } }), "parts.a.min is a whole number from 0");
    assert.equal(reason({ parts: { a: { at: "h3", edit: "text", min: 3, max: 1 } } }), "parts.a: min is over max, which no instance can meet");
    // What holds no text to type in, whose words a reader neither sees nor reaches.
    for (const at of [":scope > ul", ":scope > table", "details", ":scope > script", "style", ".a, :scope > svg"]) assert.equal(reason({ parts: { a: { at, edit: "text" } } }), `parts.a cannot be edited as text: a <${/[a-z]+$/.exec(at)[0]}> is no text to type in`, at);
    write("local/case", { parts: { a: { at: "h3", edit: "text", min: 2, max: 2 }, b: { at: ":scope > table", edit: "data" }, c: { at: ":scope > script", edit: "none" }, d: { at: ":scope > div > *", edit: "text" } } });
    assert.ok(readCatalog().packages.has("local/case"), "what can meet them, what is no text part, and what names no tag load");
    for (const at of ["h3 + p", "div > p", ":scope", ":scope > :scope", "[data-x=a/b]", "[data-x=1]", ".1a", '[data-x="a\\nb"]']) assert.match(reason({ parts: { a: { at, edit: "text" } } }), /^parts\.a\.at is wrong: /, at);

    // What it leaves on a page.
    assert.equal(reason({ runtime: [] }), "runtime is a table, by name");
    assert.equal(reason({ runtime: { classes: {} } }), "runtime.classes is no field a custom block's manifest writes");
    assert.equal(reason({ runtime: { generated: ".a" } }), "runtime.generated is a list of words");
    assert.match(reason({ runtime: { generated: ["a b"] } }), /^runtime\.generated is wrong: /);
    assert.match(reason({ runtime: { attrs: { "a b": ["x"] } } }), /^runtime\.attrs is wrong: /);
    for (const name of ["data-block-id", "data-doc-chart", "data-ge-block", "doc-x", "DATA-BLOCK-ID", "Data-Doc-Component", "DATA-GE-BLOCK"]) assert.equal(reason({ runtime: { attrs: { table: [name] } } }), `${name} is a name of Gallery's own, which no custom block may use`);
    // What a copy of the view would lose with what it generated: the instance, or all it holds.
    for (const selector of [":scope", "*", ":scope > *", " * ", ".made, :scope"]) assert.equal(reason({ runtime: { generated: [selector] } }), `runtime.generated: ${selector} is the whole instance, and this names only what it generates`, selector);
    write("local/case", { runtime: { generated: [":scope > .made", "* > .made"], attrs: { ":scope": ["data-ready"], "*": ["hidden"] } } });
    assert.ok(readCatalog().packages.has("local/case"), "what it generated in it, and attributes on anything");

    // What it needs.
    assert.equal(reason({ assets: "charts" }), "assets is a list of words");
    for (const asset of ["../secret.txt", "a/../b.png", "/etc/passwd", "C:/x.png", "a\\b.png", "no-such-asset"]) assert.equal(reason({ assets: [asset] }), `${asset} in assets is neither a file of the kit's nor one of the block's folder`);
    assert.equal(reason({ assets: ["gone.png"] }), "assets names gone.png, which the block's folder does not hold");

    // What every page holds of a package has a limit.
    assert.match(reason({ words: "件".repeat(100000) }), /^component\.json is \d+ KB, and every page holds it: 256 KB at most$/);
    write("local/case");
    put("local/case", "template.html", "<p></p>".repeat(40000));
    assert.equal(problemIn("en", readCatalog().problems.get("local/case").problem), "template.html is 274 KB, and every page holds it: 256 KB at most");
    fs.rmSync(path.join(folderOf("local/case"), "template.html"));

    assert.equal(reason({ markdown: "html" }), "markdown is parts or text");
    assert.equal(reason({ schema: "2" }), "schema is a whole number from 1");
    assert.equal(reason({ schema: 0 }), "schema is a whole number from 1");

    // places, card, settings and needs (decided 2026-11-07): each
    // read as a host takes it, its defaults where the manifest says nothing, and what no host could
    // take keeping the block from loading, with why.
    {
      write("local/case");
      const plain = readCatalog().packages.get("local/case");
      assert.deepEqual([plain.places, plain.needs, plain.settings], [["document"], [], []], "a manifest of none of them: a document's block, as every package before them");
      assert.deepEqual(plain.card, { sizes: null, any: false, w: 4, h: null, min: { w: 1, h: 1 }, max: { w: 12, h: 24 }, resize: false, fit: "fixed", bare: false }, "and a card 4 cells wide, as high as its content");
      const settingsPart = { title: { at: ":scope > h3", edit: "text" }, settings: { at: ":scope > script", edit: "data" } };
      const fieldsOf = { key: "city", label: { zh: "城市", en: "City" }, type: "text", default: "上海" };
      write("local/case", {
        places: ["page", "document"],
        card: { w: 6, h: 2, min: { w: 2, h: 2 }, max: { w: 12 }, resize: true, fit: "content", bare: true },
        settings: [fieldsOf, { key: "unit", label: { zh: "单位", en: "Unit" }, type: "select", options: ["℃", "℉"], default: "℃" }, { key: "startDate", label: { zh: "开始", en: "Start" }, type: "date", default: "2026-11-07" }, { key: "on", label: { zh: "开", en: "On" }, type: "switch", default: false }, { key: "days", label: { zh: "天", en: "Days" }, type: "number", default: 7 }, { key: "doc", label: { zh: "文档", en: "Document" }, type: "document" }],
        needs: ["workspace", "tables", "net:api.open-meteo.com", "net:*.example.com"],
        parts: settingsPart,
      });
      const full = readCatalog().packages.get("local/case");
      assert.deepEqual(full.places, ["page", "document"], "both places, as written");
      assert.deepEqual(full.card, { sizes: null, any: false, w: 6, h: 2, min: { w: 2, h: 2 }, max: { w: 12, h: 24 }, resize: true, fit: "content", bare: true }, "a card's bounds filled in where it says one alone");
      assert.deepEqual(full.settings.map(({ key }) => key), ["city", "unit", "startDate", "on", "days", "doc"], "each setting");
      assert.deepEqual(full.needs, ["workspace", "tables", "net:api.open-meteo.com", "net:*.example.com"]);
      write("local/case", { places: ["page"], card: { sizes: [[2, 2], [4, 2], [4, 4]], resize: true } });
      assert.deepEqual(readCatalog().packages.get("local/case").card, { sizes: [[2, 2], [4, 2], [4, 4]], any: false, w: 2, h: 2, min: { w: 1, h: 1 }, max: { w: 12, h: 24 }, resize: true, fit: "fixed", bare: false }, "with sizes, the first the default");
      write("local/case", { places: ["page"], card: { sizes: [[4, 2], [2, 1], [12, 4]], min: { w: 1, h: 1 }, resize: true } });
      assert.deepEqual(readCatalog().packages.get("local/case").card, { sizes: [[4, 2], [2, 1], [12, 4]], any: true, w: 4, h: 2, min: { w: 1, h: 1 }, max: { w: 12, h: 24 }, resize: true, fit: "fixed", bare: false }, "a min or a max beside the sizes frees the card: the sizes the common ones its menu lists, any size between them its too");
      assert.equal(menuOf(readCatalog()).find(({ id }) => id === "local/case").places.join(), "page", "the page's map has its places");

      // places
      for (const places of ["page", [], ["page", "page"], ["board"], [1], null]) assert.ok(/^places /.test(reason({ places })), JSON.stringify(places));
      assert.equal(reason({ places: ["document", "document"] }), "places names document twice");
      assert.equal(reason({ places: ["document", "page"], parts: { title: { at: ":scope > h3", edit: "text" }, body: { edit: "flow" } } }), "with page in its places it has no slot: parts.body is edited as flow, and a slot holds a document's blocks, which a custom page has none of");
      write("local/case", { places: ["document"], parts: { title: { at: ":scope > h3", edit: "text" }, body: { edit: "flow" } } });
      assert.ok(readCatalog().packages.has("local/case"), "a document's block keeps its slot");
      // card
      assert.equal(reason({ card: [] }), "card is a table, by name");
      assert.equal(reason({ card: { width: 4 } }), "card.width is no field a custom block's manifest writes");
      for (const sizes of [[], [[0, 2]], [[13, 2]], [[2, 25]], [[2]], [[2, 2.5]], "2x2"]) assert.equal(reason({ card: { sizes } }), "card.sizes is a list of [width, height], from 1 to 12 cells wide and 1 to 24 high", JSON.stringify(sizes));
      assert.equal(reason({ card: { sizes: [[2, 2], [2, 2]] } }), "card.sizes names 2x2 twice");
      for (const field of ["w", "h"]) assert.equal(reason({ card: { sizes: [[2, 2]], [field]: 2 } }), `with card.sizes, write no card.${field}: the first size is the default`);
      assert.equal(reason({ card: { sizes: [[2, 2], [6, 2]], max: { w: 4 } } }), "card.sizes names 6x2 outside card.min to card.max", "a size outside the bounds written beside the sizes");
      assert.equal(reason({ card: { sizes: [[2, 2], [1, 1]], min: { w: 2, h: 2 } } }), "card.sizes names 1x1 outside card.min to card.max");
      assert.equal(reason({ card: { w: 13 } }), "card.w is a whole number from 1 to 12");
      assert.equal(reason({ card: { h: 0 } }), "card.h is a whole number from 1 to 24");
      assert.equal(reason({ card: { min: 2 } }), "card.min is { w, h }, in cells");
      assert.equal(reason({ card: { max: { w: 2, d: 1 } } }), "card.max.d is no field a custom block's manifest writes");
      assert.equal(reason({ card: { min: { h: 30 } } }), "card.min.h is a whole number from 1 to 24");
      assert.equal(reason({ card: { min: { w: 6 }, max: { w: 4 } } }), "card.min.w is over card.max.w");
      assert.equal(reason({ card: { max: { w: 3 } } }), "the default card.w is 4, outside card.min to card.max (1 to 3)", "w left out is 4, which its bounds hold too");
      assert.equal(reason({ card: { h: 2, min: { h: 3 } } }), "the default card.h is 2, outside card.min to card.max (3 to 24)");
      assert.equal(reason({ card: { resize: "yes" } }), "card.resize is true or false");
      assert.equal(reason({ card: { bare: 1 } }), "card.bare is true or false");
      assert.equal(reason({ card: { fit: "grow" } }), "card.fit is fixed or content");
      // card.consent: the line its card's consent banner says, in both languages, which the kit is told in the block's description.
      for (const consent of ["允许联网之后显示汇率", { zh: "允许联网之后显示汇率" }, { zh: "", en: "x" }, { zh: "允许", en: "Allow", fr: "Autoriser" }]) assert.equal(reason({ card: { consent } }), "card.consent is words in both languages: { zh, en }", JSON.stringify(consent));
      write("local/case", { places: ["page"], card: { consent: { zh: "允许联网之后显示汇率", en: "Allow internet access to show the rates" } } });
      const said = readCatalog().packages.get("local/case");
      assert.deepEqual([said.card.consent, descriptionOf(said).consent], [{ zh: "允许联网之后显示汇率", en: "Allow internet access to show the rates" }, { zh: "允许联网之后显示汇率", en: "Allow internet access to show the rates" }], "card.consent read, and told to the kit");
      write("local/case", { places: ["page"] });
      assert.ok(!("consent" in readCatalog().packages.get("local/case").card) && !("consent" in descriptionOf(readCatalog().packages.get("local/case"))), "none written, none told: the kit's own line");
      // settings
      const withSettings = (settings, parts = settingsPart) => reason({ settings, parts });
      assert.equal(withSettings({}), "settings is a list of fields");
      assert.equal(withSettings([3]), "settings[0] is a table, by name");
      assert.equal(withSettings([{ ...fieldsOf, hint: "x" }]), "settings[0].hint is no field a custom block's manifest writes");
      for (const key of ["City", "1st", "start-date", "", 3]) assert.equal(withSettings([{ ...fieldsOf, key }]), "settings[0]: its key starts with a lowercase letter and has letters and digits alone (city, startDate)", String(key));
      assert.equal(withSettings([fieldsOf, fieldsOf]), "settings has the key city twice");
      assert.equal(withSettings([{ ...fieldsOf, label: "城市" }]), "settings[0].label is words in both languages: { zh, en }");
      assert.equal(withSettings([{ ...fieldsOf, type: "color" }]), "settings[0]: its type is one of text, number, select, date, switch, document");
      assert.equal(withSettings([{ ...fieldsOf, type: "select", default: undefined }]), "settings[0] is a select: it has options, a list of words");
      assert.equal(withSettings([{ ...fieldsOf, type: "select", options: ["a", "a"], default: "a" }]), "settings[0]: its options name a twice");
      assert.equal(withSettings([{ ...fieldsOf, options: ["a"] }]), "settings[0] is no select: it has no options");
      // required: a setting the card shows nothing without (weather's city), true or false; page check notes a card that leaves it empty.
      for (const required of ["yes", 1, null]) assert.equal(withSettings([{ ...fieldsOf, required }]), "settings[0]: required is true or false", String(required));
      for (const [type, value] of [["text", 3], ["number", "3"], ["select", "b"], ["date", "11/07"], ["switch", "on"], ["document", null]]) {
        assert.equal(withSettings([{ ...fieldsOf, type, ...(type === "select" ? { options: ["a"] } : {}), default: value }]), `settings[0]: its default is no ${type}`, type);
      }
      const noPart = "with settings, its parts have one named settings, edited as data, a <script type=\"application/json\"> that holds the values of the card's settings";
      assert.equal(withSettings([fieldsOf], { title: { at: ":scope > h3", edit: "text" } }), noPart, "settings, and no part to keep them");
      assert.equal(withSettings([fieldsOf], { settings: { at: ":scope > h3", edit: "text" } }), noPart, "one edited as text");
      assert.equal(withSettings([fieldsOf], { settings: { at: ":scope > table", edit: "data" } }), noPart, "one that is no JSON");
      write("local/case", { settings: [] });
      assert.ok(readCatalog().packages.has("local/case"), "settings of none need no part");
      // needs
      assert.equal(reason({ needs: "workspace" }), "needs is a list of words");
      for (const need of ["files", "net:", "net:API.example.com", "net:example.com:443", "net:example.com/path", "net:http://example.com", "net:*", "net:a..b", 3]) {
        assert.equal(reason({ needs: [need] }), `${typeof need === "string" ? need : 3} in needs is none Gallery knows: workspace, tables and net:<host> (a lowercase host name, no port and no path, *. first for its subdomains)`, String(need));
      }
      assert.equal(reason({ needs: ["tables", "tables"] }), "needs names tables twice");
    }

    // A future apiVersion: disabled, with why, its version shown, whatever else it holds now.
    write("local/later", { apiVersion: API_VERSION + 1, version: "9.0.0", parts: { a: { at: "h3", edit: "flow" } }, sockets: {} });
    const later = readCatalog().problems.get("local/later");
    assert.deepEqual([later.disabled, later.version, problemIn("en", later.problem), problemIn("zh", later.problem)], [true, "9.0.0", `it needs apiVersion ${API_VERSION + 1}, and this Gallery runs ${API_VERSION}`, `这个自定义块要 apiVersion ${API_VERSION + 1}，这一版 Gallery 只支持 ${API_VERSION}`]);
    assert.equal(readCatalog().problems.get("local/case").disabled, false, "any other problem is no switch");

    // A folder with no manifest is no package, and no problem: one being written, or a document's.
    put("local/no-manifest", "kit.js", "");
    assert.ok(!readCatalog().problems.has("local/no-manifest"));

    // A manifest that is a link out of the folder is none it holds.
    const outside = path.join(root, "outside.json");
    fs.writeFileSync(outside, JSON.stringify(manifest("local/linked")));
    fs.mkdirSync(folderOf("local/linked"), { recursive: true });
    let linked = true;
    try {
      fs.symlinkSync(outside, path.join(folderOf("local/linked"), "component.json"));
    } catch {
      linked = false; // no right to make links here
    }
    if (linked) assert.equal(problemIn("en", readCatalog().problems.get("local/linked").problem), "component.json cannot be read");
    fs.rmSync(folderOf("local/linked"), { recursive: true });

    // A folder in another case: what an instance of the package names finds why, as that folder is
    // the package's to a system that does not tell the two apart.
    put("Upper/kanban", "component.json", JSON.stringify(manifest("upper/kanban")));
    forgetCatalog();
    assert.equal(problemIn("en", currentCatalog().problems.get("upper/kanban").problem), "Upper/kanban can be no custom block's id: its scope and its name are lowercase letters, digits and dashes");
    assert.match(componentNotes(parseReport(page('<div data-doc-component="upper/kanban"><h3>词</h3></div>')))[0], /package upper\/kanban does not load \(Upper\/kanban can be no custom block's id/);
    assert.ok(descriptionsOf(currentCatalog()).some(({ id, problem }) => id === "upper/kanban" && problem), "and the kit is told it by that id");
    fs.rmSync(path.join(root, "components", "Upper"), { recursive: true });
    forgetCatalog();
  }

  // ---------- a problem touches nothing else ----------
  {
    put("local/case", "component.json", "{ id: ");
    forgetCatalog();
    const { packages, problems } = readCatalog();
    assert.ok(packages.has("local/strip"), "the other package stays");
    assert.ok(problems.size >= 2, "each manifest apart");

    const body = `<div class="strip" data-doc-component="local/strip"><h3>好的</h3><dl></dl></div>
    <div data-doc-component="local/case"><h3>坏的</h3><dl></dl></div>
    <div data-doc-component="local/later"><h3>以后的</h3></div>`;
    const source = page(body);
    assert.deepEqual(findBlocks(source).map(({ kind, tag }) => [kind, tag]), [["title", "h1"], ["installed", "h3"]], "the scan takes the parts of the one that loads");
    assert.deepEqual(componentFailures(source), [], "no failure of the document");
    const notes = componentNotes(parseReport(source));
    assert.equal(notes.length, 2, "a note of each that does not load");
    assert.match(notes[0], /<div data-doc-component="local\/case">: package local\/case does not load \(component\.json is not JSON: .*\): the block shows what it holds, read-only/);
    assert.match(notes[1], /package local\/later does not load \(it needs apiVersion 2, and this Gallery runs 1\)/);

    // What a preview tells the kit: every package, by one path, why for those that do not load.
    const told = descriptionsOf(readCatalog());
    assert.deepEqual(told.find(({ id }) => id === "local/strip"), { id: "local/strip", match: readCatalog().packages.get("local/strip").match, parts: readCatalog().packages.get("local/strip").parts }, "what the kit reads, no prose");
    const broken = told.find(({ id }) => id === "local/later");
    assert.deepEqual(Object.keys(broken), ["id", "problem"]);
    assert.match(broken.problem.zh, /apiVersion 2/);
    assert.match(broken.problem.en, /needs apiVersion 2/);
    const { html } = renderReportHtml(page("<p>词</p>"), { slug: "t", mode: "preview" });
    assert.ok(html.includes('DocKit.describe({"id":"local/strip"') && html.includes('DocKit.describe({"id":"local/later","problem"'), "written in a preview, an instance of it there or not");
    assert.ok(!renderReportHtml(page("<p>词</p>"), { slug: "t" }).html.includes("DocKit.describe"), "and in no export");
    put("local/case", "component.json", '{ "id": "</script><script>alert(1)</script>" }');
    forgetCatalog();
    assert.ok(!renderReportHtml(page("<p>词</p>"), { slug: "t", mode: "preview" }).html.includes("<script>alert"), "what a manifest says stays in its string");
    fs.rmSync(folderOf("local/case"), { recursive: true });
  }

  // ---------- the stamps ----------
  {
    const stamps = () => {
      const catalog = readCatalog();
      const { stamp, definition } = catalog.packages.get("local/stamped");
      return { catalog: catalog.stamp, stamp, definition };
    };
    write("local/stamped");
    const first = stamps();
    assert.deepEqual(stamps(), first, "the same files, the same stamps");
    assert.match(first.definition, /^[a-f0-9]{16}$/);

    put("local/stamped", "kit.js", "// one");
    const script = stamps();
    assert.ok(script.stamp !== first.stamp && script.catalog !== first.catalog, "a script of it is in its stamp and the catalog's");
    assert.equal(script.definition, first.definition, "and no part of what the manifest says");

    put("local/stamped", "style.css", ".a {}");
    const style = stamps();
    assert.notEqual(style.stamp, script.stamp);
    put("local/stamped", "template.html", "<div></div>");
    const template = stamps();
    assert.notEqual(template.stamp, style.stamp);
    put("local/stamped", "preview-light.webp", "light");
    const preview = stamps();
    assert.notEqual(preview.stamp, template.stamp, "a picture the menus show is in its stamp");
    put("local/stamped", "preview-dark.webp", "dark");
    const pictured = stamps();
    assert.notEqual(pictured.stamp, preview.stamp, "both");

    put("local/stamped", "preview.svg", "<svg></svg>");
    put("local/stamped", "writing.md", "# 写法");
    put("local/stamped", "example.html", "<div></div>");
    assert.deepEqual(stamps(), pictured, "what reaches no page changes no stamp (a drawing of before among it)");

    write("local/stamped", { version: "1.2.4" });
    const said = stamps();
    assert.ok(said.definition !== pictured.definition && said.stamp !== pictured.stamp && said.catalog !== pictured.catalog, "the manifest changes all three");

    write("local/stamped", { assets: ["data/a.json"] });
    put("local/stamped", "data/a.json", "1");
    const asset = stamps();
    put("local/stamped", "data/a.json", "2");
    assert.notEqual(stamps().stamp, asset.stamp, "a file its assets name is in it too");

    const alone = readCatalog().stamp;
    write("local/other");
    const withOther = readCatalog().stamp;
    assert.notEqual(withOther, alone, "another package changes the catalog's");
    put("local/other", "component.json", "{ id: ");
    const broken = readCatalog();
    assert.notEqual(broken.stamp, withOther, "so does one that stops loading");
    put("local/other", "component.json", "{ id: 1");
    assert.notEqual(readCatalog().stamp, broken.stamp, "or says something else that does not");
    fs.rmSync(folderOf("local/other"), { recursive: true });
    assert.notEqual(readCatalog().stamp, broken.stamp, "or goes");

    // What a problem says is in its stamp, whichever file moved it: its pages show that.
    write("local/reason", { assets: ["a.png", "b.png"] });
    const before = readCatalog();
    put("local/reason", "a.png", "png");
    const after = readCatalog();
    assert.deepEqual([before, after].map(({ problems }) => problemIn("en", problems.get("local/reason").problem)), ["assets names a.png, which the block's folder does not hold", "assets names b.png, which the block's folder does not hold"]);
    assert.ok(after.problems.get("local/reason").stamp !== before.problems.get("local/reason").stamp && after.stamp !== before.stamp, "its reason moved, and so did the stamps");
    fs.rmSync(folderOf("local/reason"), { recursive: true });

    // A file that has not changed is not read again for a stamp, however large; what its size or
    // its time says is new is.
    write("local/large", { assets: ["data.bin"] });
    put("local/large", "data.bin", "one");
    const data = path.join(folderOf("local/large"), "data.bin");
    const settled = new Date(Date.now() - 60000);
    fs.utimesSync(data, settled, settled);
    const stampNow = () => readCatalog().packages.get("local/large").stamp;
    const held = stampNow();
    const realRead = fs.readFileSync;
    let reads = 0;
    fs.readFileSync = (file, ...rest) => {
      if (String(file).endsWith("data.bin")) reads++;
      return realRead(file, ...rest);
    };
    syncBuiltinESMExports();
    try {
      assert.equal(stampNow(), held, "the same file");
      assert.equal(reads, 0, "not read for it");
      put("local/large", "data.bin", "two");
      const later = new Date(Date.now() - 50000);
      fs.utimesSync(data, later, later);
      assert.notEqual(stampNow(), held, "another file of the same size, under another time");
      assert.equal(reads, 1);
    } finally {
      fs.readFileSync = realRead;
      syncBuiltinESMExports();
    }
    fs.rmSync(folderOf("local/large"), { recursive: true });
  }

  // ---------- what the page holds ----------
  {
    write("local/menu", { words: "menu 菜单" });
    put("local/menu", "template.html", '<div data-doc-component="local/menu"><h3>题</h3></div>');
    put("local/menu", "preview-light.webp", "light");
    put("local/menu", "preview-dark.webp", "dark");
    put("local/menu", "preview-light.en.webp", "light, in English"); // its English pair (LANGUAGE_PICTURES), as Gallery's own ship one
    put("local/menu", "preview-dark.en.webp", "dark, in English");
    write("local/alpha");
    put("local/alpha", "preview-light.webp", "light"); // one picture of the two: none to show
    put("local/alpha", "preview-light.en.webp", "light"); // and an English pair without its own: none either
    put("local/alpha", "preview-dark.en.webp", "dark");
    write("local/two");
    put("local/two", "template.html", '<div data-doc-component="local/two"></div><p>和一段</p>');
    write("local/other");
    put("local/other", "template.html", '<div data-doc-component="local/menu"></div>');
    write("local/spoken");
    put("local/spoken", "template.html", '<!-- 它的说明 -->\n<section data-doc-component="local/spoken"><h3>题</h3></section>\n');
    write("local/asks", { assets: ["dialogs"] });
    // A template of each shape no menu is to offer, and one whose parser's repairs are the file's.
    const shapes = {
      "no-end": '<div data-doc-component="local/no-end"><h3>题</h3>',
      "open-comment": '<div data-doc-component="local/open-comment"><h3>题</h3><!-- ',
      "open-field": '<div data-doc-component="local/open-field"><h3>题</h3><textarea>',
      "open-drawing": '<div data-doc-component="local/open-drawing"><h3>题</h3><svg><title>',
      marked: '<div data-ge-unit="3" data-doc-component="local/marked"><h3 data-ge-block="1">题</h3></div>',
      scripted: '<div data-doc-component="local/scripted"><h3>题</h3><script>window.ran = 1</script></div>',
      handled: '<div data-doc-component="local/handled"><h3 onclick="x()">题</h3></div>',
      styled: '<div data-doc-component="local/styled"><h3>题</h3><style>main { display: none; }</style></div>',
      "no-part": '<div data-doc-component="local/no-part"><p>没有题</p></div>',
    };
    for (const [name, text] of Object.entries(shapes)) {
      write(`local/${name}`);
      put(`local/${name}`, "template.html", text);
    }
    write("local/too-many", { parts: { title: { at: ":scope > h3", edit: "text", max: 1 } } });
    put("local/too-many", "template.html", '<div data-doc-component="local/too-many"><h3>一</h3><h3>二</h3></div>');
    write("local/loose");
    put("local/loose", "template.html", '<div data-doc-component=local/loose><h3>题<br/></h3></section><p>段<b>词</div>');
    write("local/optional", { parts: { title: { at: ":scope > h3", edit: "text", optional: true } } });
    put("local/optional", "template.html", '<div data-doc-component="local/optional"><script type="application/json">{}</script></div>');
    put("local/broken", "component.json", "{ id: ");
    forgetCatalog();
    const { snippet } = createEditService({ reportsDirectory: root }).preview("t", page("<p>词</p>"), { kitTags: (ids) => ids.map((id) => `<script data-doc-kit="${id}"></script>`) });
    const written = /<script type="application\/json" id="doc-edit-map" data-doc-dev>(.*)<\/script>/.exec(snippet)[1];
    assert.ok(!written.includes("<"), "a template's markup stays in the map's text");
    const map = JSON.parse(written);
    const odd = [...Object.keys(shapes), "too-many", "loose", "optional"].map((name) => `local/${name}`);
    assert.deepEqual(map.components.map(({ id }) => id), ["local/alpha", "local/asks", "local/brief", "local/kanban", "local/menu", "local/other", "local/rows", "local/scorecard", "local/spoken", "local/strip", "local/stamped", "local/tally", "local/two", ...odd].sort(), "each package that loads, by id");
    const menu = map.components.find(({ id }) => id === "local/menu");
    const { stamp, definition } = currentCatalog().packages.get("local/menu");
    assert.deepEqual(menu, {
      id: "local/menu", version: "1.2.3", name: { zh: "件", en: "Piece" }, description: { zh: "一件", en: "A piece" }, words: "menu 菜单", definition, stamp,
      template: '<div data-doc-component="local/menu"><h3>题</h3></div>', picture: { light: `/__gallery/components/local/menu/preview-light.webp?v=${stamp}`, dark: `/__gallery/components/local/menu/preview-dark.webp?v=${stamp}`, en: { light: `/__gallery/components/local/menu/preview-light.en.webp?v=${stamp}`, dark: `/__gallery/components/local/menu/preview-dark.en.webp?v=${stamp}` } }, state: "normal", places: ["document"], listed: true, needs: [], settings: [], markdown: "parts",
      tags: packageTags(currentCatalog().packages.get("local/menu")), kit: [], pack: { id: "local", name: { zh: "默认块包", en: "Default pack" } },
    }, "what the menu shows and what it puts in, and what loads it in a page served without it");
    fs.writeFileSync(path.join(root, "gallery.json"), JSON.stringify({ gallery: "workspace", version: 1, components: { hidden: ["quote", "local/menu", "code"] } }));
    forgetCatalog();
    const heldBack = JSON.parse(/<script type="application\/json" id="doc-edit-map" data-doc-dev>(.*)<\/script>/.exec(createEditService({ reportsDirectory: root }).preview("t", page("<p>词</p>")).snippet)[1]);
    assert.deepEqual(heldBack.hidden, ["quote", "local/menu", "code"], "a page's `hidden` is gallery.json's, as the event stream says it");
    assert.equal(heldBack.components.find(({ id }) => id === "local/menu").state, "hidden");
    fs.rmSync(path.join(root, "gallery.json"));
    forgetCatalog();
    assert.ok(map.components.find(({ id }) => id === "local/brief").template.includes('data-doc-slot="body"'), "a package with a slot has its template in the map, as any");
    const alpha = map.components.find(({ id }) => id === "local/alpha");
    assert.deepEqual([alpha.template, alpha.picture], [null, null], "what a package does not hold (its pictures both, or none)");
    const template = (id) => map.components.find((entry) => entry.id === id).template;
    assert.equal(template("local/two"), null, "a template of more than one instance puts nothing in");
    assert.equal(template("local/other"), null, "and so does another package's");
    assert.equal(template("local/spoken"), '<section data-doc-component="local/spoken"><h3>题</h3></section>', "one element, a comment beside it left out");
    assert.deepEqual(map.components.find((entry) => entry.id === "local/asks").kit, ['<script data-doc-kit="dialogs"></script>'], "the tags of the kit's files it asks for, as the render writes them");
    for (const name of [...Object.keys(shapes), "too-many"]) assert.equal(template(`local/${name}`), null, `no menu offers ${shapes[name] ?? name}`);
    assert.equal(template("local/loose"), '<div data-doc-component="local/loose"><h3>题<br></h3><p>段<b>词</b></p></div>', "what the parser put right is right in what is written, what it dropped stays out");
    assert.equal(template("local/optional"), '<div data-doc-component="local/optional"><script type="application/json">{}</script></div>', "an optional part left out, and data, which is no code");
    const why = (id) => { const problem = templateProblem(currentCatalog().packages.get(id)); return problem && problemIn("en", problem); };
    assert.equal(why("local/no-end"), "template.html is to be one instance of this block, with an end tag of its own, and nothing else", "and what says why");
    assert.equal(why("local/two"), "template.html is to be one instance of this block, with an end tag of its own, and nothing else");
    assert.equal(why("local/marked"), "the <div> in template.html cannot go into a new block: scripts, handlers, styles and Gallery's own marks stay out of a template");
    assert.equal(why("local/scripted"), "the <script> in template.html cannot go into a new block: scripts, handlers, styles and Gallery's own marks stay out of a template");
    assert.equal(why("local/no-part"), "template.html does not hold as many of title as its manifest says");
    assert.equal(why("local/too-many"), "template.html does not hold as many of title as its manifest says");
    assert.deepEqual([why("local/alpha"), why("local/menu"), why("local/strip"), why("local/tally")], [null, null, null, null], "none, or one of a package with no template");
    for (const id of ["local/menu", "local/alpha", "local/two", "local/other", "local/spoken", "local/asks", "local/broken", ...odd]) fs.rmSync(folderOf(id), { recursive: true });
    forgetCatalog();
  }

  // ---------- what gallery.json says of the components ----------
  {
    const file = path.join(root, "gallery.json");
    const NONE = { hidden: [], disabled: [], shown: [], unlisted: [], listed: [], net: {}, packs: {}, packsOff: [] };
    const say = (value) => fs.writeFileSync(file, typeof value === "string" ? value : `${JSON.stringify(value)}\n`);
    const ours = (components) => ({ gallery: "workspace", version: 1, components });
    assert.deepEqual(componentSettings(), NONE, "no file: nothing is hidden");

    // A file edited by hand holds what it holds, and the catalog is read whatever that is. One that
    // cannot be read as a workspace's says nothing either, and says why, in what it is read by.
    for (const junk of ["{ half", "", "null", "[]", '"words"', "7", ours("words"), ours([]), ours({ hidden: "local/strip" }), ours({ hidden: 3, disabled: { id: 1 } }), ours(null), ours({})]) {
      say(junk);
      assert.deepEqual(componentSettings(), NONE, `${JSON.stringify(junk)} says nothing`);
      const { packages, settings } = readCatalog();
      const { problem, ...said } = settings;
      assert.deepEqual([packages.has("local/strip"), packages.has("local/tally"), said], [true, true, NONE], "and every package loads");
      assert.equal(Boolean(problem), typeof junk === "string", "why, where it is not the mark's");
    }
    say("{ half");
    assert.deepEqual(settingsProblem(readCatalog()), { zh: "gallery.json 读不出来：改好这个文件后再试", en: "gallery.json can't be read: fix the file and try again" }, "in both languages");
    say({ name: "another program" });
    assert.deepEqual(settingsProblem(readCatalog()), { zh: "gallery.json 不是 Gallery 的文件", en: "gallery.json isn't Gallery's file" });
    say(ours({}));
    assert.equal(settingsProblem(readCatalog()), null, "one that reads has none");
    assert.deepEqual(readCatalog().settings, NONE, "nor a word of it");
    // While it does not read, what held it goes on by what it said last: nothing turns on by a slip.
    const lastGood = { hidden: ["code"], disabled: ["local/tally"], shown: [] };
    say(`{ "gallery": "workspace", "version": 1, "components": { "disabled": ["local/tally"], } }`);
    const slipped = readCatalog(root, lastGood);
    assert.ok(!slipped.packages.has("local/tally") && slipped.problems.get("local/tally").off, "held, the package stays off");
    assert.deepEqual([slipped.settings.hidden, slipped.settings.disabled], [lastGood.hidden, lastGood.disabled], "and what is hidden stays");
    assert.equal(readCatalog().packages.has("local/tally"), true, "with nothing to hold, it has said nothing");
    say(ours(lastGood));
    const mended = readCatalog();
    assert.notEqual(slipped.stamp, mended.stamp, "the catalog's stamp says it does not read");
    assert.equal(slipped.problems.get("local/tally").stamp, mended.problems.get("local/tally").stamp, "and no package's moves");
    fs.rmSync(file);
    assert.deepEqual(readCatalog(root, lastGood).settings, NONE, "a file that is not there is no slip: it holds nothing");
    say(ours({ hidden: ["local/strip", "code", "local/strip", 3, null, { id: 1 }, "", "a b", "new\nline", "Local/Strip", "a/b/c"], disabled: ["local/tally", "code", "local/tally", "local/none", 7] }));
    assert.deepEqual(componentSettings(), { hidden: ["local/strip", "code"], disabled: ["local/tally", "local/none"], shown: [], unlisted: [], listed: [], net: {}, packs: {}, packsOff: [] }, "what can be an id, once; only a package disabled; one that names nothing stays, as it may come back");
    say(`\uFEFF${JSON.stringify(ours({ hidden: ["code"] }))}`);
    assert.deepEqual(componentSettings().hidden, ["code"], "an editor's byte-order mark");
    say({ name: "another program", components: { hidden: ["code"] } });
    assert.deepEqual(componentSettings(), NONE, "another program's file of that name says nothing of Gallery's");

    // Normal, hidden and disabled, and what each is to what reads a catalog.
    const uses = page('<div data-doc-component="local/tally" class="tally"><h3>题</h3></div>');
    const shown = (mode) => renderReportHtml(uses, { slug: "t", mode, reportsDirectory: root }).html;
    say(ours({}));
    forgetCatalog();
    const normal = readCatalog();
    const fixture = ({ id }) => id === "local/strip" || id === "local/tally";
    assert.deepEqual(menuOf(normal).filter(fixture).map(({ state }) => state), ["normal", "normal"], "the map says each package's state");
    assert.deepEqual(packageStates(normal).filter(fixture).map(({ id, state, reason, hidden, disabled }) => [id, state, reason, hidden, disabled]), [["local/strip", "normal", null, false, false], ["local/tally", "normal", null, false, false]], "and so does a list");
    say(ours({ hidden: ["local/tally"] }));
    const hidden = readCatalog();
    assert.equal(hidden.packages.get("local/tally").stamp, normal.packages.get("local/tally").stamp, "hidden, the package is what it was");
    assert.equal(hidden.packages.get("local/tally").definition, normal.packages.get("local/tally").definition);
    assert.notEqual(hidden.stamp, normal.stamp, "and the catalog is another: a page is served anew");
    assert.equal(menuOf(hidden).find(({ id }) => id === "local/tally").state, "hidden", "a menu reads it from what it is handed");
    assert.deepEqual(descriptionsOf(hidden), descriptionsOf(normal), "the kit is told as ever");
    forgetCatalog();
    assert.match(shown("export"), /data-doc-package="local\/tally"/, "it exports whole");
    say(ours({ disabled: ["local/tally"], hidden: ["local/tally"] }));
    forgetCatalog();
    const disabled = currentCatalog();
    assert.ok(!disabled.packages.has("local/tally") && disabled.problems.get("local/tally").off, "disabled, it is one that does not load");
    assert.notEqual(disabled.problems.get("local/tally").stamp, normal.packages.get("local/tally").stamp, "its stamp another: a page holding it hears");
    assert.equal(problemIn("zh", disabled.problems.get("local/tally").problem), "在设置里停用了");
    assert.equal(problemIn("en", disabled.problems.get("local/tally").problem), "turned off in the settings");
    assert.deepEqual(descriptionsOf(disabled).find(({ id }) => id === "local/tally"), { id: "local/tally", problem: { zh: "在设置里停用了", en: "turned off in the settings" } }, "the fallback's note says why, no part told");
    assert.deepEqual(menuOf(disabled).filter(fixture).map(({ id }) => id), ["local/strip"], "a page's map holds what loads");
    const { version, name, description } = normal.packages.get("local/tally");
    assert.deepEqual(packageStates(disabled).find(({ id }) => id === "local/tally"), { id: "local/tally", pack: "local", version, name, description, state: "disabled", reason: null, template: true, places: ["document"], needs: [], hidden: true, shown: false, disabled: true, unlisted: false, listedByDefault: true, allowed: [], menu: false }, "a list keeps what it says of itself, and needs no reason");
    for (const mode of ["preview", "export"]) assert.ok(!/data-doc-package="local\/tally"/.test(shown(mode)) && !shown(mode).includes("/__gallery/components/local/tally"), `nothing of it on a page: ${mode}`);
    const notes = componentNotes(parseReport(uses));
    assert.match(notes[0], /does not load \(turned off in the settings\)/, "gallery check gives a note");
    assert.deepEqual(componentFailures(uses), [], "never a failure");
    assert.deepEqual(findBlocks(uses).filter(({ text }) => text === "题"), [], "and no text block in it: read-only");

    // `shown` and the one rule of the document's menus (inDocumentMenus): a block of
    // the document's is offered unless hidden, one of a custom page's alone only where shown, one
    // disabled never; the server's states and the page's (followSettings) go by it alike.
    {
      const both = { hidden: [], shown: [], disabled: [] };
      assert.equal(inDocumentMenus(undefined, both, "local/a"), true, "no places: a document's");
      assert.equal(inDocumentMenus(["document"], { ...both, hidden: ["local/a"] }, "local/a"), false, "hidden");
      assert.equal(inDocumentMenus(["page", "document"], { ...both, shown: ["local/a"], hidden: ["local/a"] }, "local/a"), false, "a document's block hidden is hidden whatever shown says");
      assert.equal(inDocumentMenus(["page"], both, "local/a"), false, "a page's alone is off by default");
      assert.equal(inDocumentMenus(["page"], { ...both, shown: ["local/a"] }, "local/a"), true, "and on where shown");
      assert.equal(inDocumentMenus(["page"], { ...both, shown: ["local/a"], disabled: ["local/a"] }, "local/a"), false, "disabled: never");
      assert.equal(inDocumentMenus(["page"], { shown: ["local/a"] }, "local/a"), true, "a list left out is none");
      assert.equal(inDocumentMenus(["document"], { ...both, unlisted: ["local/a"] }, "local/a"), false, "unlisted: no menu offers it, whatever its places");
      assert.equal(inDocumentMenus(["page"], { ...both, shown: ["local/a"], unlisted: ["local/a"] }, "local/a"), false, "and one shown is no exception");
      assert.equal(inDocumentMenus(["document"], { ...both, unlisted: ["local/b"] }, "local/a"), true, "another's entry is none of its own");
      write("local/board", { places: ["page"] });
      put("local/board", "template.html", '<div data-doc-component="local/board"><h3>题</h3></div>');
      say(ours({}));
      const off = readCatalog();
      assert.equal(menuOf(off).find(({ id }) => id === "local/board").state, "hidden", "a page's block: no document menu offers it");
      const row = (catalog) => packageStates(catalog).find(({ id }) => id === "local/board");
      assert.deepEqual([row(off).state, row(off).places, row(off).hidden, row(off).shown, row(off).menu], ["hidden", ["page"], false, false, false], "and its row says why: its places, its switch off");
      say(ours({ shown: ["local/board", "local/board", "code", 3] }));
      const on = readCatalog();
      assert.deepEqual(on.settings.shown, ["local/board"], "shown: the ids of packages, once each");
      assert.notEqual(on.stamp, off.stamp, "the catalog's stamp says what is shown");
      assert.equal(menuOf(on).find(({ id }) => id === "local/board").state, "normal", "shown, it is offered");
      assert.deepEqual([row(on).state, row(on).shown, row(on).menu], ["normal", true, true]);
      assert.equal(settingsLine(on.settings), "settings   local/board    ", "the event stream's line carries it");
      say(ours({ shown: ["local/board"], disabled: ["local/board"] }));
      assert.equal(packageStates(readCatalog()).find(({ id }) => id === "local/board").menu, true, "disabled, its menu switch says what it would be: the two are switches of their own");
      // The page's own list, as the event stream says the settings.
      const entries = [{ id: "local/board", places: ["page"], state: "hidden" }, { id: "local/strip", places: ["document"], state: "normal" }];
      followSettings(entries, { hidden: ["local/strip"], disabled: [], shown: ["local/board"] });
      assert.deepEqual(entries.map(({ state }) => state), ["normal", "hidden"], "the page follows the same rule");
      followSettings(entries, { hidden: [], disabled: [] });
      assert.deepEqual(entries.map(({ state }) => state), ["hidden", "normal"], "a line with no shown: none shown");
      followSettings(entries, { hidden: [], disabled: [], shown: ["local/board"], unlisted: ["local/board", "local/strip"] });
      assert.deepEqual(entries.map(({ state }) => state), ["hidden", "hidden"], "a line that unlists a block takes it out of the menus, one shown too");
      // Written as the switch writes it: shown only where it holds something or was there.
      say(ours({ hidden: [], disabled: [] }));
      await writeComponentSettings(root, { id: "local/board", shown: true });
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "gallery.json"), "utf8")).components, { hidden: [], disabled: [], shown: ["local/board"] }, "a page's block turned on");
      await writeComponentSettings(root, { id: "local/board", shown: false });
      assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, "gallery.json"), "utf8")).components, { hidden: [], disabled: [], shown: [] }, "and off again, the list kept");
      say(ours({}));
      await writeComponentSettings(root, { id: "local/strip", hidden: true });
      assert.ok(!("shown" in JSON.parse(fs.readFileSync(path.join(root, "gallery.json"), "utf8")).components), "a file that never had it gets none");
      fs.rmSync(folderOf("local/board"), { recursive: true });
      say(ours({}));
    }

    // `unlisted`, the master switch of 设置 › 组件列表 (2026-11-09): a block no menu and no library offers (the
    // document's "/" and its kin, 添加自定义块), what is written of it showing as ever (it
    // loads, so it is neither disabled nor broken). A block no entry names is listed. Read as a hand wrote
    // it, written where it holds something or was there, told on the line, in the stamp and in a row.
    {
      write("local/board", { places: ["document", "page"] });
      put("local/board", "template.html", '<div data-doc-component="local/board"><h3>题</h3></div>');
      say(ours({ unlisted: ["local/board", "local/board", "code", 3, "not an id"] }));
      const gone = readCatalog();
      assert.deepEqual(gone.settings.unlisted, ["local/board"], "unlisted: the ids of packages, once each");
      const listedAgain = (catalog) => packageStates(catalog).find(({ id }) => id === "local/board");
      assert.deepEqual([menuOf(gone).find(({ id }) => id === "local/board").state, gone.packages.has("local/board")], ["hidden", true], "no menu offers it and it loads as any");
      assert.deepEqual([listedAgain(gone).unlisted, listedAgain(gone).menu, listedAgain(gone).state], [true, true, "hidden"], "its row: the master switch off, its menu switch what it would be (the switches are their own)");
      say(ours({}));
      const back = readCatalog();
      assert.notEqual(back.stamp, gone.stamp, "the stamp says what is unlisted: a page hears it");
      assert.deepEqual([menuOf(back).find(({ id }) => id === "local/board").state, listedAgain(back).unlisted], ["normal", false], "a block no entry names is listed");
      assert.equal(settingsLine(gone.settings), "settings     local/board  ", "the line's fifth list");
      // A held catalog, a file that does not read: what was in use.
      say("{ half");
      assert.deepEqual(readCatalog(root, gone.settings).settings.unlisted, ["local/board"], "a slip by hand leaves it as it was");
      say(ours({}));
      // Written as the switch writes it: kept where it was, none where it never was.
      await writeComponentSettings(root, { id: "local/board", hidden: true });
      assert.ok(!("unlisted" in JSON.parse(fs.readFileSync(file, "utf8")).components), "a file that never had it gets none");
      await writeComponentSettings(root, { id: "local/board", unlisted: true });
      assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).components, { hidden: ["local/board"], disabled: [], unlisted: ["local/board"] }, "the master switch off");
      await writeComponentSettings(root, { id: "local/board", unlisted: false });
      assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).components, { hidden: ["local/board"], disabled: [], unlisted: [] }, "and on again, the list kept");
      fs.rmSync(folderOf("local/board"), { recursive: true });
      say(ours({}));
    }

    // A manifest's `listed: false` (2026-11-20, Gallery's card and chart card): the master switch off until the
    // user turns it on, which gallery.json's `listed` says (unlistedBy); an entry of `unlisted` of before says
    // nothing of it then. The same rule on the server, in a row, on the page's line and in its own list.
    {
      write("local/quiet", { listed: false });
      put("local/quiet", "template.html", '<div data-doc-component="local/quiet"><h3>题</h3></div>');
      say(ours({}));
      const quiet = readCatalog();
      const row = (catalog) => packageStates(catalog).find(({ id }) => id === "local/quiet");
      assert.deepEqual([quiet.packages.get("local/quiet").listed, menuOf(quiet).find(({ id }) => id === "local/quiet").state, menuOf(quiet).find(({ id }) => id === "local/quiet").listed], [false, "hidden", false], "off by its manifest: no menu offers it, and it loads as any");
      assert.deepEqual([row(quiet).unlisted, row(quiet).listedByDefault, row(quiet).menu], [true, false, true], "its row: the master switch off, its menu switch its own");
      assert.equal(unlistedBy("local/quiet", false, { unlisted: [], listed: ["local/quiet"] }), false, "listed by the user: on");
      assert.equal(unlistedBy("local/quiet", false, { unlisted: ["local/quiet"], listed: ["local/quiet"] }), false, "an entry of unlisted of before is none of its switch");
      assert.equal(unlistedBy("local/quiet", true, { listed: [] , unlisted: [] }), false, "a block listed by its manifest is on where no entry names it");
      say(ours({ listed: ["local/quiet", "local/quiet", 3] }));
      const on = readCatalog();
      assert.deepEqual([on.settings.listed, menuOf(on).find(({ id }) => id === "local/quiet").state, row(on).unlisted], [["local/quiet"], "normal", false], "turned on: offered");
      assert.notEqual(on.stamp, quiet.stamp, "the stamp says it");
      assert.equal(settingsLine(on.settings), "settings       local/quiet", "the line's seventh list");
      const entries = [{ id: "local/quiet", places: ["document"], listed: false, state: "hidden" }];
      followSettings(entries, { hidden: [], disabled: [], listed: ["local/quiet"] });
      assert.equal(entries[0].state, "normal", "the page follows the same rule");
      followSettings(entries, { hidden: [], disabled: [], unlisted: [] });
      assert.equal(entries[0].state, "hidden", "and a line without it: off again");
      // The dialog's switch writes `listed` for it, and takes it out of `unlisted` as it turns on.
      say(ours({ unlisted: ["local/quiet"] }));
      forgetCatalog(root);
      const panel = createComponentSettings({ root, taken: () => forgetCatalog(root) });
      let answer = await panel.write({ id: "local/quiet", unlisted: false });
      assert.deepEqual([JSON.parse(fs.readFileSync(file, "utf8")).components.listed, JSON.parse(fs.readFileSync(file, "utf8")).components.unlisted, answer.packages.find(({ id }) => id === "local/quiet").unlisted], [["local/quiet"], [], false], "on: in listed, out of unlisted");
      answer = await panel.write({ id: "local/quiet", unlisted: true });
      assert.deepEqual([JSON.parse(fs.readFileSync(file, "utf8")).components.listed, answer.packages.find(({ id }) => id === "local/quiet").unlisted, answer.packages.find(({ id }) => id === "local/quiet").state], [[], true, "hidden"], "off: out of listed");
      write("local/quiet", { listed: "no" });
      forgetCatalog(root);
      assert.ok(readCatalog().problems.has("local/quiet"), "a listed that is no boolean keeps it from loading");
      fs.rmSync(folderOf("local/quiet"), { recursive: true });
      say(ours({}));
      forgetCatalog(root);
    }

    // The reader's consents to the net (components.net): of a package, the hosts its needs
    // name that it was allowed to reach; read as a hand wrote them, written by the switch, told on the
    // event stream's line, in the catalog's stamp, and in a list as allowed.
    {
      write("local/rates", { places: ["page"], needs: ["net:api.example.com", "net:*.cdn.example.com"] });
      say(ours({ net: { "local/rates": ["api.example.com", "api.example.com", "*.cdn.example.com", "Bad Host", 3], "not an id": ["x.com"], "local/empty": [], "local/odd": "x.com" } }));
      const allowed = readCatalog();
      assert.deepEqual(allowed.settings.net, { "local/rates": ["api.example.com", "*.cdn.example.com"] }, "hosts that can be a needs', once each, of an id; none for none");
      assert.equal(settingsLine(allowed.settings), "settings    local/rates@*.cdn.example.com,local/rates@api.example.com   ", "the line's fourth list, <id>@<host> each, sorted");
      assert.deepEqual(packageStates(allowed).find(({ id }) => id === "local/rates").allowed, ["api.example.com", "*.cdn.example.com"], "its row: what it may reach");
      say(ours({ net: { "local/rates": ["api.example.com", "elsewhere.example.org"] } }));
      const some = readCatalog();
      assert.notEqual(some.stamp, allowed.stamp, "the catalog's stamp says the consents: a page hears them change");
      assert.deepEqual(packageStates(some).find(({ id }) => id === "local/rates").allowed, ["api.example.com"], "a host its needs no longer name is none of its row's");
      say(ours({ hidden: [] }));
      await writeComponentSettings(root, { id: "local/rates", net: ["api.example.com", "*.cdn.example.com"] });
      assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).components, { hidden: [], disabled: [], net: { "local/rates": ["api.example.com", "*.cdn.example.com"] } }, "a consent written under its id");
      await writeComponentSettings(root, { id: "local/rates", net: [] });
      assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).components, { hidden: [], disabled: [] }, "taken back: its id goes, and components.net with its last");
      say(ours({ net: { "local/other": ["x.example.com"] } }));
      await writeComponentSettings(root, { id: "local/rates", hidden: true });
      assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).components.net, { "local/other": ["x.example.com"] }, "another switch leaves the consents as they are");
      // The switch of 设置 › 组件列表: all of a block's hosts at once, or none; refused for a block that names none, or a built-in.
      keepCatalog(root, readCatalog());
      const switches = createComponentSettings({ root, taken: () => keepCatalog(root, readCatalog()) });
      let said = await switches.write({ id: "local/rates", net: true });
      assert.deepEqual([said.packages.find(({ id }) => id === "local/rates").allowed, currentCatalog(root).settings.net["local/rates"]], [["api.example.com", "*.cdn.example.com"], ["api.example.com", "*.cdn.example.com"]], "allowed: every host its needs name, in use as it answers");
      said = await switches.write({ id: "local/rates", net: false });
      assert.deepEqual(said.packages.find(({ id }) => id === "local/rates").allowed, [], "taken back");
      for (const [change, says] of [[{ id: "local/strip", net: true }, /这个块不联网/], [{ id: "code", net: true }, /内置块只能隐藏/], [{ id: "local/rates", net: "yes" }, /开关的值不对/]]) await assert.rejects(switches.write(change), says, JSON.stringify(change));
      assert.deepEqual(descriptionsOf(readCatalog()).find(({ id }) => id === "local/rates").needs, ["net:api.example.com", "net:*.cdn.example.com"], "the kit is told its needs: what its context is given");
      assert.ok(!("needs" in descriptionsOf(readCatalog()).find(({ id }) => id === "local/strip")), "and of a block that names none, nothing");
      fs.rmSync(folderOf("local/rates"), { recursive: true });
      say(ours({}));
      keepCatalog(root, readCatalog());
    }

    // Of the packages that do not load of themselves, what a list says, and that the settings change nothing of it.
    write("local/future", { apiVersion: 99 });
    put("local/broken", "component.json", "{ id: ");
    say(ours({ hidden: ["local/broken", "code"], disabled: ["local/broken", "local/none"] }));
    const states = Object.fromEntries(packageStates(readCatalog()).map((entry) => [entry.id, entry]));
    assert.deepEqual([states["local/future"].state, states["local/future"].version, states["local/future"].name], ["disabled", "1.2.3", null], "an apiVersion it does not run: disabled");
    assert.match(states["local/future"].reason.zh, /apiVersion 99/, "said so");
    assert.match(states["local/future"].reason.en, /apiVersion 99/);
    assert.equal(states["local/broken"].state, "broken", "a broken one is no setting's");
    assert.ok(states["local/broken"].reason.en.length > 0 && states["local/broken"].hidden && states["local/broken"].disabled, "it says why, the file's words kept");
    assert.ok(!("local/none" in states) && !("code" in states), "none but the workspace's packages");
    assert.equal(states["local/broken"].template, false, "one that does not read has none to say");
    assert.equal(packageStates(readCatalog()).find(({ id }) => id === "local/strip").template, true, "a list says which a menu can put in");
    write("local/unfit");
    put("local/unfit", "template.html", "<p>不是实例</p>");
    assert.equal(packageStates(readCatalog()).find(({ id }) => id === "local/unfit").template, false, "and a template no new block can be is none of those");
    fs.rmSync(folderOf("local/unfit"), { recursive: true });
    for (const id of ["local/future", "local/broken"]) fs.rmSync(folderOf(id), { recursive: true });

    // The server's write: all else the file holds kept, nothing but the list changed, and no trace.
    say({ gallery: "workspace", version: 1, name: "我的", components: { later: 1, hidden: ["keep", "keep", 3] } });
    await writeComponentSettings(root, { id: "local/strip", hidden: true });
    await writeComponentSettings(root, { id: "local/tally", disabled: true });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { gallery: "workspace", version: 1, name: "我的", components: { later: 1, hidden: ["keep", "local/strip"], disabled: ["local/tally"] } }, "written with what it held");
    assert.ok(fs.readFileSync(file, "utf8").endsWith("}\n"), "as a person reads it");
    await writeComponentSettings(root, { id: "local/strip", hidden: true });
    assert.deepEqual(componentSettings().hidden, ["keep", "local/strip"], "once");
    await writeComponentSettings(root, { id: "local/strip", hidden: false, disabled: true });
    assert.deepEqual(componentSettings(), { hidden: ["keep"], disabled: ["local/tally", "local/strip"], shown: [], unlisted: [], listed: [], net: {}, packs: {}, packsOff: [] }, "each list as it is told");
    assert.deepEqual(fs.readdirSync(root).filter((name) => name.includes("gallery.json") && name !== "gallery.json"), [], "no temp file left");
    const refused = async (text, expected) => {
      say(text);
      await assert.rejects(writeComponentSettings(root, { id: "local/strip", hidden: true }), expected);
      assert.equal(fs.readFileSync(file, "utf8").trimEnd(), typeof text === "string" ? text : JSON.stringify(text), "the file left as it was");
    };
    await refused("{ half", /gallery\.json 读不出来/);
    await refused({ name: "another program" }, /^Error: gallery\.json 不是 Gallery 的文件$/);
    // A byte-order mark is no slip: it reads, and goes with the write.
    say(`\uFEFF${JSON.stringify(ours({ hidden: ["code"], later: 1 }))}`);
    await writeComponentSettings(root, { id: "quote", hidden: true });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")).components, { hidden: ["code", "quote"], later: 1, disabled: [] }, "over a byte-order mark");
    // Changed between the read and the rename: refused, the hand's text left, no temp file.
    const handy = fsp.readFile;
    say(ours({ hidden: ["code"] }));
    fsp.readFile = async (...asked) => {
      fsp.readFile = handy;
      const read = await handy(...asked);
      fs.writeFileSync(file, "the hand's");
      return read;
    };
    await assert.rejects(writeComponentSettings(root, { id: "quote", hidden: true }), /gallery\.json 刚刚被改过/);
    fsp.readFile = handy;
    assert.equal(fs.readFileSync(file, "utf8"), "the hand's", "what was written under it is left");
    assert.deepEqual(fs.readdirSync(root).filter((name) => name.includes("gallery.json") && name !== "gallery.json"), [], "and no temp file");
    // A file the system will not let be written (read-only, held by another program): said as that,
    // after writeAtomic's tries, with no path and no system's words in what a toast shows.
    say(ours({}));
    const rename = fsp.rename;
    const later = globalThis.setTimeout;
    globalThis.setTimeout = (run) => later(run, 0); // writeAtomic's tries, with no time between them
    for (const code of ["EPERM", "EACCES", "EBUSY", "EROFS"]) {
      fsp.rename = async () => { throw Object.assign(new Error(`${code}: operation not permitted, rename 'C:\\temp' -> 'C:\\gallery.json'`), { code }); };
      await assert.rejects(writeComponentSettings(root, { id: "quote", hidden: true }), /^Error: gallery\.json 写不进去：可能是只读的，或被别的程序占着$/, code);
    }
    fsp.rename = async () => { throw Object.assign(new Error("no room"), { code: "ENOSPC" }); };
    await assert.rejects(writeComponentSettings(root, { id: "quote", hidden: true }), /no room/, "any other failure is no such thing");
    fsp.rename = rename;
    globalThis.setTimeout = later;
    assert.deepEqual(componentSettings(), NONE, "nothing written");
    fs.rmSync(file);
    await writeComponentSettings(root, { id: "code", hidden: true });
    assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { gallery: "workspace", version: 1, components: { hidden: ["code"], disabled: [] } }, "no file: one is made, with the mark that makes it ours");
    assert.equal(settingsLine(componentSettings()), "settings code      ", "what a page hears of it");
    fs.rmSync(file);
    forgetCatalog();

    // 设置 › 组件列表: what it lists, and the one change it makes, in use as it answers.
    let takes = 0;
    const panel = createComponentSettings({ root, taken: () => { takes += 1; keepCatalog(root, readCatalog()); } });
    const listed = panel.read();
    assert.ok(listed.packages.some(({ id, state }) => id === "local/strip" && state === "normal"), "a package with its state");
    const block = (id, from = listed) => from.blocks.find((entry) => entry.id === id);
    assert.deepEqual(block("code"), { id: "code", name: { zh: "代码块", en: "Code" }, icon: CODE_ICON, hidden: false, hideable: true }, "a block in both languages, whatever the server speaks, with its mark");
    assert.equal(block("section").icon, SECTION_ICON, "分区, which no menu offers, shows its unit's icon");
    assert.ok(listed.blocks.every(({ icon }) => /^<svg viewBox="0 0 20 20"/.test(icon)), "every built-in line has its mark");
    assert.deepEqual(["paragraph", "heading", "list", "section"].map((id) => [block(id).name.zh, block(id).hideable]), [["文本", false], ["标题", false], ["列表", false], ["分区", false]], "the four, locked");
    assert.equal(listed.problem, null, "a file that reads has nothing to say");
    assert.ok(!block("installed") && !block("columns"), "what no menu offers has no switch");
    let answer = await panel.write({ id: "code", hidden: true });
    assert.deepEqual([takes, block("code", answer).hidden, currentCatalog().settings.hidden], [1, true, ["code"]], "in use as it answers");
    answer = await panel.write({ id: "local/tally", disabled: true });
    assert.equal(answer.packages.find(({ id }) => id === "local/tally").state, "disabled", "a package off");
    assert.ok(!currentCatalog().packages.has("local/tally"));
    answer = await panel.write({ id: "local/tally", disabled: false });
    assert.equal(answer.packages.find(({ id }) => id === "local/tally").state, "normal", "and on");
    answer = await panel.write({ id: "local/tally", shown: true });
    assert.deepEqual([answer.packages.find(({ id }) => id === "local/tally").shown, currentCatalog().settings.shown], [true, ["local/tally"]], "shown written and in use as it answers");
    answer = await panel.write({ id: "local/tally", shown: false });
    assert.equal(listed.packageIcon, BLOCK_ICON, "every custom block has one mark, the card of text");
    assert.ok(/^<svg viewBox="0 0 20 20"/.test(listed.packageIcon), "on the 20 box of the icons beside it");
    answer = await panel.write({ id: "local/tally", unlisted: true });
    assert.deepEqual([answer.packages.find(({ id }) => id === "local/tally").unlisted, answer.packages.find(({ id }) => id === "local/tally").state, currentCatalog().settings.unlisted], [true, "hidden", ["local/tally"]], "the master switch off, in use as it answers: its instances load as ever");
    assert.ok(currentCatalog().packages.has("local/tally"), "it still loads");
    answer = await panel.write({ id: "local/tally", unlisted: false });
    assert.deepEqual([answer.packages.find(({ id }) => id === "local/tally").unlisted, answer.packages.find(({ id }) => id === "local/tally").state], [false, "normal"], "and on again");
    const before = fs.readFileSync(file, "utf8");
    for (const [change, says] of [
      [{ id: "paragraph", hidden: true }, /这个块不能隐藏/],
      [{ id: "section", hidden: true }, /这个块不能隐藏/],
      [{ id: "code", disabled: true }, /内置块只能隐藏/],
      [{ id: "code", shown: true }, /内置块只能隐藏/],
      [{ id: "code", unlisted: true }, /内置块只能隐藏/],
      [{ id: "local/strip", unlisted: "yes" }, /开关的值不对/],
      [{ id: "local/strip", shown: "yes" }, /开关的值不对/],
      [{ id: "not one", hidden: true }, /没有这个组件/],
      [{ id: ["local/strip"], hidden: true }, /没有这个组件/],
      [{ hidden: true }, /没有这个组件/],
      [{ id: "local/strip", hidden: "yes" }, /开关的值不对/],
    ]) await assert.rejects(panel.write(change), says, JSON.stringify(change));
    assert.equal(fs.readFileSync(file, "utf8"), before, "what is refused writes nothing");
    // What a hand wrote of what cannot be hidden is not hidden, whatever the file says.
    say(ours({ hidden: ["paragraph", "section", "code"] }));
    keepCatalog(root, readCatalog());
    assert.deepEqual(["paragraph", "section", "code"].map((id) => block(id, panel.read()).hidden), [false, false, true], "a hand's `paragraph` shows as what it is");
    // A file that does not read: the page says so, and nothing it holds moves.
    say("{ half");
    const { settings: heldSettings } = currentCatalog();
    keepCatalog(root, readCatalog(root, heldSettings));
    const unread = panel.read();
    assert.equal(unread.problem.zh, "gallery.json 读不出来：改好这个文件后再试", "why it cannot be changed");
    assert.ok(block("code", unread).hidden, "its switches as it said last");
    await assert.rejects(panel.write({ id: "code", hidden: false }), /gallery\.json 读不出来/);
    fs.rmSync(file);
    forgetCatalog();
  }

  // ---------- the catalog in use ----------
  {
    forgetCatalog();
    const first = currentCatalog();
    assert.equal(currentCatalog(), first, "read once, whoever asks");
    assert.equal(currentCatalog(root), first, "by the workspace's folder, however it is named");
    write("local/late");
    assert.equal(currentCatalog(), first, "a disk changed since is not read");
    assert.ok(readCatalog().packages.has("local/late"), "readCatalog is the disk");
    keepCatalog(root, readCatalog());
    assert.ok(currentCatalog().packages.has("local/late"), "the server puts a new one in its place");
    fs.rmSync(folderOf("local/late"), { recursive: true });
    forgetCatalog();
    assert.ok(!currentCatalog().packages.has("local/late"), "forgotten, the next ask reads the disk");
  }

  // ---------- in a worker ----------
  {
    // The conversion's jobs read the same catalog, each what the disk says as it runs: a package
    // broken between two of them keeps its instance's words out of no export.
    write("local/worked");
    const source = page('<div data-doc-component="local/worked"><h3>标题</h3><p>它的词</p></div>');
    const markdown = async () => (await runJob("markdown", { source, title: "t", pictures: false })).text;
    assert.equal(await markdown(), "# t\n\n标题", "its manifest's parts");
    put("local/worked", "component.json", "{ id: ");
    assert.equal(await markdown(), "# t\n\n标题 · 它的词", "broken, the next job writes what it holds");
    fs.rmSync(folderOf("local/worked"), { recursive: true });
  }

  // ---------- the server's watch ----------
  {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const until = async (test, label) => {
      for (const start = Date.now(); !test(); await wait(5)) assert.ok(Date.now() - start < 15000, label);
    };
    const QUIET = 60;
    const HOLD = 1200;
    const told = [];
    const changes = []; // the ids told with each catalog
    forgetCatalog();
    const watch = createCatalogWatch({ root, tell: (catalog, ids) => { told.push(catalog); changes.push(ids); }, delay: 5, quiet: QUIET, hold: HOLD, limit: 6000 });
    const heard = (run) => {
      run();
      watch.changed();
    };
    const versionOf = (id) => currentCatalog().packages.get(id)?.version;

    // A package added while a page is open: taken once the disk has stood still, its pages told once.
    const written = Date.now();
    heard(() => write("local/watched"));
    await until(() => told.length === 1, "a package added is taken");
    assert.ok(Date.now() - written >= QUIET, "not while the disk may still move");
    assert.ok(currentCatalog().packages.has("local/watched"));
    assert.equal(told[0], currentCatalog(), "and told as it stands");
    assert.deepEqual(changes[0], ["local/watched"], "with the package that changed, and no other");

    // Written file by file: one look over what came meanwhile.
    heard(() => put("local/watched", "kit.js", "// one"));
    heard(() => put("local/watched", "style.css", ".a {}"));
    await until(() => told.length === 2, "the files of one write");
    await wait(QUIET * 2);
    assert.equal(told.length, 2, "taken once");
    assert.deepEqual(changes[1], ["local/watched"]);

    // What changes no stamp tells nothing: the same bytes again, what reaches no page.
    heard(() => put("local/watched", "kit.js", "// one"));
    heard(() => put("local/watched", "writing.md", "# 写法"));
    await wait(QUIET * 3);
    assert.equal(told.length, 2, "nothing to tell");

    // A manifest half written, then finished: the package never goes off, and takes what it says.
    const whole = JSON.stringify(manifest("local/watched", { version: "2.0.0" }));
    heard(() => put("local/watched", "component.json", whole.slice(0, 40)));
    await wait(QUIET * 3);
    assert.equal(told.length, 2, "half written, its pages hear nothing");
    assert.equal(versionOf("local/watched"), "1.2.3", "and it runs as it was");
    assert.ok(!currentCatalog().problems.has("local/watched"));
    heard(() => put("local/watched", "component.json", whole));
    await until(() => told.length === 3, "finished, it is taken");
    assert.equal(versionOf("local/watched"), "2.0.0");

    // Half written and put back as it was: nothing happened.
    heard(() => put("local/watched", "component.json", whole.slice(0, 40)));
    await wait(QUIET * 3);
    heard(() => put("local/watched", "component.json", whole));
    await wait(QUIET * 3);
    assert.equal(told.length, 3, "nothing to tell");

    // Its manifest taken away with its folder standing, and written again, a delete and a write of
    // one change: the package is held as for one half written, and never goes off.
    heard(() => fs.rmSync(path.join(folderOf("local/watched"), "component.json")));
    await wait(QUIET * 3);
    assert.equal(told.length, 3, "its pages hear nothing");
    assert.equal(versionOf("local/watched"), "2.0.0", "and it runs as it was");
    heard(() => put("local/watched", "component.json", whole));
    await wait(QUIET * 3);
    assert.equal(told.length, 3, "nothing to tell");

    // Another package's change goes through while one is held, and leaves it held.
    heard(() => put("local/watched", "component.json", whole.slice(0, 40)));
    await wait(QUIET * 3);
    heard(() => write("local/beside"));
    await until(() => told.length === 4, "another package taken meanwhile");
    assert.equal(versionOf("local/watched"), "2.0.0", "the one held stays");
    assert.deepEqual(changes[3], ["local/beside"], "and its pages hear of that one alone");

    // Left so, it is its author's: it goes off, says why, and its pages hear; finished later, it is back.
    await until(() => told.length === 5, "held no longer");
    assert.ok(!currentCatalog().packages.has("local/watched") && currentCatalog().problems.has("local/watched"), "it does not load");
    heard(() => put("local/watched", "component.json", whole));
    await until(() => told.length === 6, "back");
    assert.equal(versionOf("local/watched"), "2.0.0");

    // A problem no package ever had is told as it stands: there is nothing to hold.
    heard(() => put("local/new-broken", "component.json", "{ id: "));
    await until(() => told.length === 7, "a package that never loaded");
    assert.ok(currentCatalog().problems.has("local/new-broken"));
    fs.rmSync(folderOf("local/new-broken"), { recursive: true });

    // A package deleted while a page is open: gone once the disk is quiet, nothing held for it.
    heard(() => fs.rmSync(folderOf("local/beside"), { recursive: true }));
    await until(() => told.length === 8, "a package deleted");
    assert.ok(!currentCatalog().packages.has("local/beside") && !currentCatalog().problems.has("local/beside"));
    assert.deepEqual(changes[7], ["local/beside", "local/new-broken"], "each that changed in the moment");

    // Its manifest taken away and left so: held, and gone once that is over.
    heard(() => write("local/thin"));
    await until(() => told.length === 9, "another package added");
    heard(() => fs.rmSync(path.join(folderOf("local/thin"), "component.json")));
    await wait(QUIET * 3);
    assert.ok(currentCatalog().packages.has("local/thin"), "held");
    await until(() => told.length === 10, "held no longer");
    assert.ok(!currentCatalog().packages.has("local/thin") && !currentCatalog().problems.has("local/thin"), "gone, as a folder with no manifest is no package");
    assert.deepEqual(changes[9], ["local/thin"]);
    fs.rmSync(folderOf("local/thin"), { recursive: true });

    // A folder taken away and written again within the moment: the same package.
    const before = told.length;
    fs.rmSync(folderOf("local/watched"), { recursive: true });
    watch.changed();
    put("local/watched", "component.json", whole);
    put("local/watched", "kit.js", "// one");
    put("local/watched", "style.css", ".a {}");
    await wait(QUIET * 3);
    assert.equal(told.length, before, "nothing to tell");

    // A watcher that fires without end, as one of a removed folder can on Windows: a look is not put
    // off by it, and what the disk says is taken.
    const noise = setInterval(() => watch.changed(), 1);
    try {
      heard(() => write("local/noisy"));
      await until(() => told.length === before + 1, "taken amid the noise");
    } finally {
      clearInterval(noise);
    }

    // Written again and again, it is held for its limit at most: the writes come 30ms apart, further than the
    // 10ms of quiet a look needs, and each leaves the manifest half written, so that the first look to find it
    // held 120ms gives it up. On a clock of its own, the watch's timers fired by hand (`now`, `timers`): on the
    // real one a look due before the next write comes after it when the machine is busy, and every look then
    // sees a manifest that has just changed and settles none, which says nothing of the limit (the real clock's
    // version of this loop, alone on a machine kept busy, was told after 0.5 to 1.4 s or not within 5, and after
    // 150ms on an idle one).
    {
      let clock = 0;
      const timed = [];
      const timers = {
        set(run, ms) {
          const timer = { at: clock + ms, run, unref() {} };
          timed.push(timer);
          return timer;
        },
        clear(timer) {
          if (timed.includes(timer)) timed.splice(timed.indexOf(timer), 1);
        },
      };
      // Time goes on by `ms`, each timer that falls due run at its own time, in order, those it sets too.
      const advance = (ms) => {
        const end = clock + ms;
        for (let next = null; (next = timed.filter((timer) => timer.at <= end).sort((a, b) => a.at - b.at)[0]);) {
          timed.splice(timed.indexOf(next), 1);
          clock = Math.max(clock, next.at);
          next.run();
        }
        clock = end;
      };
      const limited = [];
      const short = createCatalogWatch({ root, tell: (catalog) => limited.push({ catalog, at: clock }), delay: 5, quiet: 10, hold: 200, limit: 120, now: () => clock, timers });
      for (let count = 0; limited.length === 0; count++) {
        assert.ok(clock < 1000, "held no longer than its limit");
        put("local/noisy", "component.json", `{ "half": ${count}`);
        short.changed();
        advance(30);
      }
      assert.ok(limited[0].at >= 120 && limited[0].at <= 120 + 30 + 10, `held for its limit and no longer than the next look after it: told at ${limited[0].at}ms`);
      assert.ok(currentCatalog().problems.has("local/noisy"));
      short.close();
      assert.equal(timed.length, 0, "and nothing left to fire");
    }

    watch.changed();
    watch.close();
    await wait(QUIET);
    assert.equal(told.length, before + 1, "closed, nothing more is looked at");

    // gallery.json edited by hand: heard as a package is, once the disk has stood still. Hidden, no
    // package changed, so no page hears of one, and what is told says so. Disabled, the package does.
    const settings = (components) => fs.writeFileSync(path.join(root, "gallery.json"), JSON.stringify({ gallery: "workspace", version: 1, components }));
    const heardOf = [];
    write("local/set");
    forgetCatalog();
    const set = createCatalogWatch({ root, tell: (catalog, ids) => heardOf.push({ catalog, ids }), delay: 5, quiet: QUIET, hold: HOLD, limit: 6000 });
    const hiddenAt = Date.now();
    settings({ hidden: ["local/set", "code"] });
    set.changed();
    await until(() => heardOf.length === 1, "a package hidden");
    assert.ok(Date.now() - hiddenAt >= QUIET, "by hand, as a file that may still move");
    assert.deepEqual(heardOf[0].ids, [], "no package changed");
    assert.deepEqual(heardOf[0].catalog.settings.hidden, ["local/set", "code"], "and what is told holds what is hidden");
    assert.ok(currentCatalog().packages.has("local/set"), "it runs");
    // Written by the server, it is in use as the write returns, and no look is left to do it again.
    settings({ disabled: ["local/set"] });
    set.taken();
    assert.equal(heardOf.length, 2, "at once");
    assert.ok(!currentCatalog().packages.has("local/set") && currentCatalog().problems.get("local/set").off, "turned off, with no hold: it is no package half written");
    assert.deepEqual(heardOf[1].ids, ["local/set"], "its pages hear of it");
    settings({});
    set.taken();
    assert.equal(heardOf.length, 3, "and on again");
    assert.ok(currentCatalog().packages.has("local/set"));
    assert.deepEqual(heardOf[2].ids, ["local/set"]);
    await wait(QUIET * 2);
    assert.equal(heardOf.length, 3, "nothing more to tell");
    // Half written and held, then turned off: the setting is what it is, whatever the disk says.
    put("local/set", "component.json", "{ half");
    set.changed();
    await wait(QUIET * 3);
    assert.ok(currentCatalog().packages.has("local/set"), "held");
    settings({ disabled: ["local/set"] });
    set.taken();
    assert.ok(!currentCatalog().packages.has("local/set"), "no hold for one disabled");
    write("local/set");
    // A slip in the file by hand: what it said stays in use for as long as it stays so, and who asks
    // hears why (the stamp moves, no package with it), then, mended, that it is over.
    settings({ disabled: ["local/set"], hidden: ["code"] });
    set.taken();
    const heardBefore = heardOf.length;
    fs.writeFileSync(path.join(root, "gallery.json"), '{ "gallery": "workspace", "version": 1, "components": { "disabled": ["local/set"], } }');
    set.changed();
    await until(() => heardOf.length === heardBefore + 1, "the slip");
    assert.ok(!currentCatalog().packages.has("local/set"), "a package off stays off");
    assert.deepEqual(currentCatalog().settings.hidden, ["code"], "what is hidden stays");
    assert.deepEqual(heardOf.at(-1).ids, [], "no package changed");
    assert.ok(settingsProblem(heardOf.at(-1).catalog), "and what is told says why");
    await wait(HOLD + QUIET);
    assert.ok(!currentCatalog().packages.has("local/set"), "however long it stays so");
    settings({ disabled: ["local/set"], hidden: ["code"] });
    set.changed();
    await until(() => heardOf.length === heardBefore + 2, "mended");
    assert.equal(settingsProblem(currentCatalog()), null, "said no more");
    assert.deepEqual(heardOf.at(-1).ids, [], "and no page goes for it");
    set.close();
    fs.rmSync(path.join(root, "gallery.json"));
    forgetCatalog();
  }
} finally {
  process.env.GALLERY_DEFAULT_WORKSPACE = workspace;
  fs.rmSync(root, { recursive: true, force: true });
}

// ---------- what "/" finds a custom block by (shared/pinyin.mjs): its words, then the initials of its pinyin ----------
{
  const { initialsOfName, initialsOfWord, searchWords, syllablesOf } = await import("../../src/shared/pinyin.mjs");
  assert.deepEqual(syllablesOf("daojishi"), ["dao", "ji", "shi"], "a word of pinyin read as the fewest syllables");
  assert.deepEqual(syllablesOf("xian"), ["xian"], "xian is one syllable, as an input method composes it");
  assert.equal(syllablesOf("countdown"), null, "an English word is none");
  assert.equal(initialsOfWord("daojishi"), "djs");
  assert.equal(initialsOfWord("renwukanban"), "rwkb");
  assert.equal(initialsOfWord("kanban"), "kb");
  assert.equal(initialsOfWord("xian"), null, "a word of one syllable has no initials of its own: it is found by its start");
  assert.equal(initialsOfWord("countdown"), null);
  assert.equal(initialsOfName("倒计时"), "djs", "a Chinese name's characters by the platform's pinyin collation");
  assert.equal(initialsOfName("待办清单"), "dbqd");
  assert.equal(initialsOfName("A4 表格"), "a4bg", "letters and digits as they are, spaces left out");
  assert.equal(initialsOfName("卡"), "", "one character has initials no more than a word of one syllable");
  const words = (name, id, given) => searchWords({ name, id, words: given }).split(" ");
  assert.ok(words({ zh: "倒计时", en: "Countdown" }, "local/djs", "daojishi countdown").includes("djs"), "倒计时 is found by djs");
  assert.ok(words({ zh: "待办清单", en: "Checklist" }, "local/daiban", "todo list").includes("dbqd"), "a name its words do not spell in pinyin is found by its initials all the same");
  assert.ok(words({ zh: "我的待办", en: "My todos" }, "gallery/todos", "wodedaiban daiban todo 待办").includes("wddb"), "and 我的待办 by wddb");
  assert.deepEqual(words({ zh: "倒计时", en: "Countdown" }, "local/djs", "daojishi countdown").slice(0, 4), ["倒计时", "countdown", "local/djs", "daojishi"], "the names, the id and the manifest's words come first, as they were");
}

console.log("Checked the catalog of component packages: every field of a manifest read, the instance the root of what it leaves; a template in one piece and whole as it is written, and one no new block can be in no menu, with why; bad JSON, a wrong id, a device's name, missing fields, the engines' words, a part of a bad selector, one no instance can meet or that holds no text, closed names in any case, what would take the whole instance from a copy, a manifest or a template too long for every page, assets out of the folder and a future apiVersion each keeping its package alone from loading, with why, in either language, to the fallback's note and gallery check, a folder in another case found by the id an instance names; a package's stamp and its definition kept apart, the catalog's, and a problem's holding its reason, no file read again that has not changed; what gallery.json says of the components, read whatever it holds and written with what else it holds, a write refused in the reader's words for a file that does not read, is another program's, changed under it or cannot be written, a package hidden running as it was and one disabled no package to anything that loads one; places, card, settings and needs read with their defaults and each check that keeps a block from loading; shown, and the one rule of the document's menus (inDocumentMenus) the server and the page both go by; the catalog a process keeps, and the server taking a new one from what the disk says once it stands still, told with the packages that changed: a package added or deleted, a manifest half written or taken away held then finished or left, a setting by hand or at once, a gallery.json that does not read held as it last said, nothing told of what changes no stamp, whatever the watcher fires.");
