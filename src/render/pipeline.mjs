import { existsSync, readFileSync, readdirSync } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { assetReferenceFailures } from "./asset-references.mjs";
import { chartDeclarationFailures, tableChartReadings } from "./chart-declarations.mjs";
import { keptGrammars, pageGrammars } from "../shared/code-grammars.mjs";
import { smallerPictures } from "./export-pictures.mjs";
import { lookAttributes } from "../shared/document-look.mjs";
import { pictureCeiling } from "../shared/export-pictures.mjs";
import { documentLook } from "../shared/workspace-look.mjs";
import { glyphNames, glyphSvg, iconsOf } from "./emoji.mjs";
import { embedFailures, embedsAsLinks } from "./embeds.mjs";
import { fileFailures } from "./files.mjs";
import { imageFailures } from "./images.mjs";
import { BODY, componentOf, matchesNode } from "../shared/components/index.mjs";
import { FLOW } from "../shared/components/list.mjs";
import { attr, elementsOf, walk } from "../shared/html-tree.mjs";
import { GLYPH_SETS, ICON_COLORS, glyphOf, glyphValue, iconKind, iconMarkup, iconValueOf } from "../shared/emoji/icon-value.mjs";
import { componentFailures, componentNotes, databaseFixes, databaseReadings } from "./component-checks.mjs";
import { loadKitFile } from "./kit-build.mjs";
import { layoutNotes } from "./layout-notes.mjs";
import { localPathNotes } from "./local-paths.mjs";
import { packageExportFailures, packagesOf, withPackageCopies } from "./package-files.mjs";
import { readsWorkspace, withNetSnapshot } from "./net-snapshot.mjs";
import { exportLinks } from "./page-link-rewrite.mjs";
import { largePictureNotes } from "./picture-sizes.mjs";
import { renderReportHtml, withShownTags } from "./report-html.mjs";
import { parseReport, sourceOf } from "./report-tree.mjs";
import { NETWORK, codeUses, diagnoseReports, reportScriptSource } from "./typecheck.mjs";
import {
  ASSETS, allowedScripts, allowedStyles, earlyScriptFailures, katexFontsSourceDirectory, loadVendorFile, publicPathOf, tagFailures, withKitCopies,
} from "./assets.mjs";
import { currentCatalog } from "../shared/component-catalog.mjs";
import { exportsDirectory, generatedDirectory, kitPublicDirectory, release, reportsDirectory, vendorDirectory } from "../shared/paths.mjs";
import { referencedFile } from "../shared/media.mjs";
import { decoded, fromFile, hashAddress, hosted, pageAddress, workbenchHash } from "../shared/page-address.mjs";
import { pageLinks } from "../shared/page-links.mjs";
import { layoutOf } from "../shared/workspace.mjs";
import { documentLinks, listReportSlugs } from "../shared/reports.mjs";
import { documentDirectory, documentFiles } from "../shared/workspace.mjs";
import { loadReports } from "./reports.mjs";
import { sha256 } from "../shared/files.mjs";
import { EXPORT_CSP, GENERATOR, exportPolicy, isolateUmd, packagesMeta, sourceMeta } from "../shared/export-wrap.mjs";

// Every report is checked, built and exported on its own. A failing report is reported and
// skipped; it never prevents the other selected reports from building or exporting.

const placeholder = /__REPORT_[A-Z_]+__/;
const SIZE_LIMIT = 1_000_000;

// "12 and 40", "12, 40 and 55".
const joined = (items) => (items.length > 1 ? `${items.slice(0, -1).join(", ")} and ${items.at(-1)}` : `${items[0]}`);

/**
 * What a check says of the block ids a report repeats ([{ id, lines, columns }]: each element
 * carrying one where it is, its line, and its column too when two of them share a line, "12:40"):
 * a failure each. Which one is the copy is its author's to say. gallery export and the workbench's
 * 导出 say it so too when they leave such a report as it is (src/cli/hand-in.mjs, the transfer service).
 */
export function repeatedIdFailures(repeated) {
  return repeated.map(({ id, lines, columns }) => {
    const shared = new Set(lines).size < lines.length;
    const at = lines.map((line, index) => (shared ? `${line}:${columns[index]}` : `${line}`));
    return `data-block-id repeats: "${id}" on lines ${joined(at)}${shared ? " (line:column)" : ""}; each id names one block: remove it from the copy, which needs none (the later ${at.length > 2 ? `ones, lines ${joined(at.slice(1))}` : `one, line ${at[1]}`}, unless the copy went before its original)`;
  });
}

// A document's two file names as its messages say them: doc.html and doc.json, or an old one's
// report.html and report.json (shared/workspace.mjs documentFiles).
const fileNamesOf = ({ slug, htmlPath, metadataPath }) => {
  const files = htmlPath ? { html: htmlPath, json: metadataPath ?? htmlPath.replace(/\.html$/, ".json") } : documentFiles(documentDirectory(slug, reportsDirectory));
  return { htmlName: path.basename(files.html), jsonName: path.basename(files.json) };
};

// What makes a report one an author finished: the page's parts, its size, no starter text left, its
// blocks' ids and its main's id.
function structureFailures({ slug, html, metadata, htmlPath, metadataPath, tree = parseReport(html) }) {
  const failures = [];
  const { htmlName, jsonName } = fileNamesOf({ slug, htmlPath, metadataPath });
  // An untitled document (its h1.doc-title empty, as the workbench's 新建 makes it: docs/editor.md
  // "Title") has an empty <title> too, the page naming it 未命名文档 (report-html.mjs untitledTitle).
  const untitled = /<h1\b[^>]*\bclass="[^"]*\bdoc-title\b[^"]*"[^>]*>\s*<\/h1>/i.test(html);
  const checks = [
    [/<meta\s+name=["']viewport["']/i, "missing viewport metadata"],
    [untitled ? /<title>\s*<\/title>|<title>[^<]+<\/title>/i : /<title>[^<]+<\/title>/i, "missing document title"],
    [/<main(?:\s|>)/i, "missing semantic main element"],
    [/aria-label|aria-labelledby|<title>/i, "missing accessible labels"],
  ];
  for (const [pattern, message] of checks) {
    if (!pattern.test(html)) failures.push(message);
  }

  const bytes = Buffer.byteLength(html);
  if (bytes > SIZE_LIMIT) {
    failures.push(`the document's editable source is ${bytes.toLocaleString("en-US")} bytes, over the ${SIZE_LIMIT.toLocaleString("en-US")}-byte limit: aggregate or sample the embedded data, or split the document`);
  }

  if (placeholder.test(html)) failures.push(`${htmlName} still contains a starter placeholder such as __REPORT_TITLE__`);
  for (const [field, value] of Object.entries(metadata)) {
    if (typeof value === "string" && placeholder.test(value)) failures.push(`${jsonName} "${field}" is still a starter placeholder such as __REPORT_TITLE__`);
  }
  if (/<[a-z][^>]*\sdata-doc-placeholder\b/i.test(html)) {
    failures.push("starter placeholder content ([data-doc-placeholder]) is still present; replace it with the document's content");
  }
  // A block id names one block (the preview editor finds it by that): a copied block keeps none. The
  // ids are the elements' attributes (one a code sample spells is none; one written without quotes or
  // with character references is one), each where it is: its line, and its column too when two of
  // them share a line ("12:40", line:column).
  const blockIds = new Map(); // id -> the places of the elements carrying it
  walk(tree, (node) => {
    const id = attr(node, "data-block-id");
    const place = node.sourceCodeLocation?.attrs?.["data-block-id"] ?? node.sourceCodeLocation;
    if (id !== undefined) blockIds.set(id, [...(blockIds.get(id) ?? []), { line: place?.startLine, column: place?.startCol }]);
  });
  const repeated = [...blockIds].filter(([, places]) => places.length > 1);
  failures.push(...repeatedIdFailures(repeated.map(([id, places]) => ({ id, lines: places.map(({ line }) => line), columns: places.map(({ column }) => column) }))));
  // A report keeps its reading state under its main's id (DocState, the shared UI): the report's
  // slug, which the workspace changes along with it. Its main is the page's first (none a <template>
  // holds, which is no part of the page).
  let main = null;
  walk(tree, (node) => {
    if (!main && node.tagName === "main") main = node;
  }, { inTemplates: false });
  if (main) {
    const id = attr(main, "data-doc-id");
    if (id === undefined) failures.push(`main.doc-page needs data-doc-id="${slug}"`);
    else if (id !== slug) failures.push(`main[data-doc-id] is "${id}": it must be the document's slug "${slug}"`);
  }
  return failures;
}

// The end of the page's own <head …> start tag (as a browser reads it: none in a comment or a
// script's text, any case, with attributes), or undefined when the file writes none.
const headEnd = (tree) => elementsOf(elementsOf(tree).find((node) => node.tagName === "html") ?? {})
  .find((node) => node.tagName === "head")?.sourceCodeLocation?.startTag?.endOffset;

const STORAGE = new Set(["localStorage", "sessionStorage"]);

// The page's tags that load a script or a stylesheet: { scripts, styles } (their src and href), the
// elements of the tree, so one a comment, a code sample or a script's text spells is none.
function linkedTags(tree) {
  const scripts = [];
  const styles = [];
  walk(tree, (node) => {
    if (node.tagName === "script" && attr(node, "src") !== undefined) scripts.push(attr(node, "src"));
    const rel = node.tagName === "link" ? (attr(node, "rel") ?? "").toLowerCase().split(/\s+/) : [];
    if (rel.includes("stylesheet") && attr(node, "href") !== undefined) styles.push(attr(node, "href"));
  });
  return { scripts, styles };
}

/**
 * What any export of a report needs, whichever way it is made (gallery export, the workbench's 导出
 * through offlineReports): a <head> start tag for its policy, nothing loaded from elsewhere, no
 * network, and each file of its folder it names there, where an export holds it (render/images.mjs,
 * files.mjs, embeds.mjs, asset-references.mjs), and what an export of the component packages it uses
 * cannot hold (packageExportFailures: `catalog`, the workspace's packages). Fast, and none of the
 * authoring checks. Each is read from the page's elements and code (`tree`; `uses`: its code's uses of
 * the network's globals, or of more, codeUses in typecheck.mjs), never from text that merely spells a
 * tag or a call.
 */
export function exportFailures({ slug, html, directory = documentDirectory(slug, reportsDirectory), tree = parseReport(html), uses = codeUses(html, NETWORK, { tree }), catalog }) {
  const failures = [];
  if (headEnd(tree) === undefined) failures.push("the page writes no <head> start tag, which an export puts its Content-Security-Policy right after: write <head> … </head> before <body>");
  const externalResources = [];
  walk(tree, (node) => {
    if (!["script", "link", "img"].includes(node.tagName)) return;
    for (const name of ["src", "href"]) {
      const value = attr(node, name)?.trim();
      if (value && /^https?:\/\//i.test(value)) externalResources.push(value);
    }
  });
  if (externalResources.length > 0) {
    failures.push(`external resources are not portable: ${externalResources.join(", ")}`);
  }
  for (const { name, how, line, where } of uses) {
    if (!NETWORK.has(name)) continue;
    const what = { call: `calls ${name}(…)`, new: `creates new ${name}(…)` }[how] ?? `uses ${name}`;
    failures.push(`line ${line}: ${where} ${what}: embed its data (inline JSON, DocState); the export blocks the network`);
  }
  const { scripts, styles } = linkedTags(tree);
  for (const source of scripts) if (!allowedScripts.has(source)) failures.push(`unsupported script dependency ${source}`);
  for (const source of styles) if (!allowedStyles.has(source)) failures.push(`unsupported stylesheet dependency ${source}`);
  failures.push(...imageFailures({ html, directory, tree }), ...fileFailures({ html, directory, tree }), ...embedFailures({ html, directory, tree }), ...assetReferenceFailures({ html, directory, tree }));
  failures.push(...packageExportFailures(packagesOf(html, catalog, tree)));
  return [...new Set(failures)];
}

// What a report's script may no longer do, as each component starts from its markup now, and what
// to write instead.
const REMOVED = [
  [/\bDocSheets\.mount\s*\(/, "Sheet areas start on their own: remove DocSheets.mount (an area keeps its tab under its data-doc-sheets name)"],
  [/\bDocCode\.(?:View|DiffView|DiffStats|enhance)\b/, "code blocks are highlighted on their own, and a diff is declared as <div class=\"doc-diff\"> holding { path, lines } as JSON (sdk/doc-code.d.ts)"],
  [/\bDocTables\.(?:enhance|enhanceAll|makeSortable)\b/, "tables start on their own: remove the call"],
  [/\bDocDialogs\.(?:enhance|enhanceAll)\b/, "detail cards start on their own: remove the call"],
];

// What is wrong with the kit's tags the source writes, if it writes any (the assets' list, assets.mjs:
// the render puts in every one a report needs), a script naming a global of the kit before the kit's
// script defining it loads, what its script may no longer do, and what storage asks (of any of its
// code: its scripts, on* attributes and javascript: addresses; `uses`: its code's uses of storage's
// globals, or of more, codeUses in typecheck.mjs).
function dependencyFailures({ html, tree = parseReport(html), uses = codeUses(html, STORAGE, { tree }) }) {
  const script = reportScriptSource(html, tree);
  const failures = [...tagFailures(html, tree), ...earlyScriptFailures(html, tree)];
  for (const [pattern, instead] of REMOVED) if (pattern.test(script)) failures.push(`${script.match(pattern)[0].replace(/\s*\($/, "")} is gone: ${instead}`);
  for (const { name, line, where } of uses) if (STORAGE.has(name)) failures.push(`line ${line}: ${where} uses ${name}: use DocState instead of direct browser storage`);
  return [...new Set(failures)];
}

// Icons (.doc-icon, docs/quick-reference.md): the page's, right before its title in the
// header, one at most, and a highlight block's or a flowchart step's, first in it; each holding an icon (an image of the
// report's folder is there: asset-references.mjs, as an export embeds it). Each failure at its line.
// One that holds none says what it holds and the three kinds an icon is, an example of each as the
// file writes it (the value is src/shared/emoji/icon-value.mjs's), so the Agent writes one without
// looking them up; one whose value is an icon written in other quotes than double ones says so, with
// the icon as the file writes it.
const firstIn = (node, parent) => parent.childNodes.find((child) => child.tagName || (child.nodeName === "#text" && child.value.trim())) === node;
// What an icon may lead, first in it: a highlight block, or a flowchart's step (its number's place).
const leads = (node) => matchesNode(node, componentOf("highlight").match) || (node.tagName === "li" && matchesNode(node.parentNode, `ol.${FLOW}`));
const ICON_KINDS = `an icon is one of three kinds: an emoji, <div class="doc-icon">🎯</div>; an icon of Gallery's sets in one of ${ICON_COLORS.length} colors, <div class="doc-icon" data-icon="/icons/airplane_blue.svg"></div> (MingCute's names; Tabler's as /icons/tabler/plane_blue.svg; the colors ${ICON_COLORS.join(", ")}); or a picture of the document's folder, <div class="doc-icon"><img src="assets/logo.png" alt=""></div>`;
const wordsOf = (node) => (node.nodeName === "#text" ? node.value : (node.childNodes ?? []).map(wordsOf).join(""));
// An attribute as the file writes it, its quotes as they are (data-icon='…'), cut at 72 characters.
function writtenAttribute(html, node, name) {
  const at = node.sourceCodeLocation?.attrs?.[name];
  const text = at ? html.slice(at.startOffset, at.endOffset) : `${name}="${attr(node, name) ?? ""}"`;
  return text.length > 72 ? `${text.slice(0, 71)}…` : text;
}
// What an icon that holds no icon holds, as a message says it ({ held }: its data-icon or its
// picture's src as written, a drawing, its words, or nothing), and the icon it means (`meant`) when
// that value is one a page would read in double quotes (iconValueOf reads no other: single ones, as
// a chart's data may be written, hide it).
function heldBy(html, icon) {
  const glyph = attr(icon, "data-icon");
  if (glyph !== undefined) return { held: writtenAttribute(html, icon, "data-icon"), meant: iconKind(glyph) === "glyph" ? glyph : null };
  let picture = null;
  walk(icon, (node) => { picture ??= ["img", "svg"].includes(node.tagName) ? node : null; });
  if (picture?.tagName === "img") {
    const src = attr(picture, "src");
    return { held: `<img ${writtenAttribute(html, picture, "src")}>`, meant: iconKind(src) === "image" ? src : null };
  }
  if (picture) return { held: "an <svg>" };
  const words = wordsOf(icon).replace(/\s+/g, " ").trim();
  return { held: words ? `"${words.slice(0, 40)}"` : "nothing" };
}
// What to write for an icon of the sets whose name its set has not: the same name in the other set,
// or the names of its set that share a word with it (six at most), or nothing.
function glyphHint({ set, name, color }) {
  const other = GLYPH_SETS.find((each) => each !== set);
  if (glyphNames(other).includes(name)) return `; "${name}" is ${other === "tabler" ? "Tabler" : "MingCute"}'s: ${glyphValue(other, name, color)}`;
  const words = name.split("-").filter((word) => word.length >= 3);
  const near = glyphNames(set).filter((each) => each.split("-").some((word) => words.includes(word))).slice(0, 6);
  return near.length > 0 ? `; names of its set near it: ${near.join(", ")}` : "";
}
function iconFailures({ html, tree = parseReport(html) }) {
  const { all: icons, own } = iconsOf(tree);
  const failures = [];
  const lineOf = (icon) => icon.sourceCodeLocation?.startLine;
  if (own.length > 1) failures.push(`line ${lineOf(own[1])}: ${own.length} page icons (.doc-icon) in the header (the first at line ${lineOf(own[0])}): a document has one, right before its title`);
  for (const icon of icons) {
    const line = lineOf(icon);
    const panel = icon.parentNode;
    if (!own.includes(icon) && !(leads(panel) && firstIn(icon, panel))) failures.push(`line ${line}: an icon (.doc-icon) stands only right before the document's title, first in a highlight block (.doc-panel, .doc-summary), or first in a flowchart's step (ol.doc-flow > li, in its number's place)`);
    const value = iconValueOf(sourceOf(html, icon));
    const { held, meant } = value ? {} : heldBy(html, icon);
    if (meant) failures.push(`line ${line}: an icon (.doc-icon) holds ${held}, an icon a page reads only in double quotes: write ${iconMarkup(meant)}`);
    else if (!value) failures.push(`line ${line}: an icon (.doc-icon) holds no icon (it holds ${held}): ${ICON_KINDS}`);
    else if (iconKind(value) === "glyph" && !glyphSvg(value)) failures.push(`line ${line}: the icon ${value} is none of the icon sets' (MingCute: /icons/<name>_<color>.svg, Tabler: /icons/tabler/<name>_<color>.svg; src/shared/emoji/data/icons.json lists the names of each)${glyphHint(glyphOf(value))}`);
  }
  return [...new Set(failures)];
}

/**
 * The checks fast enough for every preview request: all but TypeScript and the chart declaration checks
 * (what an author finishes, and what any export needs: exportFailures).
 */
export function quickFailures(report) {
  const tree = parseReport(report.html);
  // The page read once: its tree (which no check changes: each only reads it), and its code's uses
  // of the network's and storage's globals (each script parsed once for both checks).
  const parsed = { ...report, tree, uses: codeUses(report.html, new Set([...NETWORK, ...STORAGE]), { tree }) };
  return [...structureFailures(parsed), ...componentFailures(report.html, tree), ...dependencyFailures(parsed), ...iconFailures(parsed), ...exportFailures(parsed)];
}

/**
 * The quick checks, the chart declaration checks and TypeScript. Returns slug -> messages for failing
 * reports only. TypeScript's word on a type alone in a report's own script (typeOnly, typecheck.mjs)
 * is no failure: each report keeps those as its `scriptNotes`, which notesOf prints.
 */
export function checkReports(reports) {
  const failures = new Map(reports.map((report) => [report.slug, [...quickFailures(report), ...chartDeclarationFailures(report.html)]]));
  const slugBySource = new Map(reports.map((report) => [path.resolve(report.htmlPath), report.slug]));
  const bySource = new Map(reports.map((report) => [path.resolve(report.htmlPath), report]));
  for (const report of reports) report.scriptNotes = [];
  if (reports.length > 0) {
    for (const { htmlPath, text, typeOnly, note } of diagnoseReports(reports)) {
      // A diagnostic outside every report comes from the shared SDK declarations and affects them all.
      if (typeOnly) {
        bySource.get(htmlPath)?.scriptNotes.push(note);
        continue;
      }
      const owners = htmlPath ? [slugBySource.get(htmlPath)] : [...failures.keys()];
      for (const slug of owners) failures.get(slug).push(htmlPath ? text : `${text} (shared SDK declaration)`);
    }
  }
  for (const [slug, messages] of failures) {
    if (messages.length === 0) failures.delete(slug);
  }
  return failures;
}

/**
 * The reports an export would fail before it writes them (gallery export's hand-in gives every block
 * an id in the file: one whose export then failed kept ids it was never exported with, a <details>
 * the check refused among them): the quick checks and the chart declaration checks of each report as
 * `prepare` reads it (its preview's text). Returns slug -> messages for those that fail, and for
 * those that do not load; TypeScript, which is slow, runs once, after the hand-in, as the export's.
 */
export async function handInBlockers(slugs = [], { prepare = null } = {}) {
  const { reports, failures } = await loadReports(slugs, { prepare });
  for (const report of reports) {
    const messages = [...quickFailures(report), ...chartDeclarationFailures(report.html)];
    if (messages.length) failures.set(report.slug, messages);
  }
  return failures;
}

/** `prepare`: what each report's text is read as (loadReports), the file left as it is. */
export async function checkSelectedReports(slugs = [], { prepare = null, directory = reportsDirectory } = {}) {
  const { reports, failures } = await loadReports(slugs, { prepare, directory });
  for (const [slug, messages] of checkReports(reports)) failures.set(slug, messages);
  return { reports, failures };
}

/**
 * Write the shared preview assets under public/kit and public/vendor (`kit`, `vendor`: other folders,
 * the release build's). Files are overwritten in place (never deleted first) so a running preview server
 * never serves a missing asset. `fresh` rebuilds the esbuild bundles instead of reusing this process's
 * cache. Nothing in the release, whose kit and vendor files are built into the package (kit/, vendor/),
 * never written as it runs.
 */
export async function writeSharedAssets({ fresh = false, kit = kitPublicDirectory, vendor = vendorDirectory } = {}) {
  if (release) return;
  const sources = ASSETS.map((asset) => [asset, asset.file ? loadKitFile(asset.file, { fresh }) : loadVendorFile(asset)]);
  await fs.mkdir(kit, { recursive: true });
  const katexFontsDirectory = path.join(vendor, "katex", "fonts");
  await fs.mkdir(katexFontsDirectory, { recursive: true });
  const katexFonts = (await fs.readdir(katexFontsSourceDirectory)).filter((fileName) => fileName.endsWith(".woff2"));
  await Promise.all(katexFonts.map((fileName) =>
    fs.copyFile(path.join(katexFontsSourceDirectory, fileName), path.join(katexFontsDirectory, fileName)),
  ));
  // /kit/<file> and /vendor/<path> (public/kit, public/vendor).
  await Promise.all(sources.map(async ([asset, source]) =>
    fs.writeFile(asset.file ? path.join(kit, asset.file) : path.join(vendor, ...asset.vendor.path.split("/").slice(2)), await source),
  ));
}

/** Remove generated `<slug>.html` files whose report source no longer exists. */
// Only the built previews (.gallery/built/): never the exports, which are the user's (a deliverable of
// a document trashed or renamed since, a file the user saved there).
async function removeOrphans(directory, slugs) {
  const entries = await fs.readdir(directory).catch(() => []);
  await Promise.all(entries
    .filter((fileName) => fileName.endsWith(".html") && !slugs.has(fileName.slice(0, -5)))
    .map((fileName) => fs.rm(path.join(directory, fileName), { force: true })));
}

async function writePreviewManifest(built, generatedDirectory) {
  const manifestPath = path.join(generatedDirectory, "reports.json");
  const previous = await fs.readFile(manifestPath, "utf8").then(JSON.parse, () => []);
  const entries = new Map(Array.isArray(previous) ? previous.map((entry) => [entry.slug, entry]) : []);
  for (const { entry } of built) entries.set(entry.slug, entry);
  const manifest = [];
  for (const [slug, entry] of [...entries].sort(([a], [b]) => a.localeCompare(b))) {
    const preview = path.join(generatedDirectory, `${slug}.html`);
    if (await fs.stat(preview).then(() => true, () => false)) manifest.push(entry);
  }
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

/** Check the selected reports, then write shared preview assets and one preview per passing report (`prepare`: checkSelectedReports). */
export async function buildReports(slugs = [], { prepare = null, directory = reportsDirectory } = {}) {
  const generatedDirectory = layoutOf(directory).built;
  const { reports, failures } = await checkSelectedReports(slugs, { prepare, directory });
  await writeSharedAssets();
  await fs.mkdir(generatedDirectory, { recursive: true });
  await removeOrphans(generatedDirectory, new Set(await listReportSlugs(directory)));

  const built = [];
  for (const report of reports) {
    const outputName = `${report.slug}.html`;
    const outputPath = path.join(generatedDirectory, outputName);
    if (failures.has(report.slug)) {
      // Previews are disposable; do not leave one that no longer matches its failing source.
      await fs.rm(outputPath, { force: true });
      continue;
    }
    const { html, removed } = renderReportHtml(report.html, { slug: report.slug, reportsDirectory: directory }); // a built preview and an export alike
    await fs.writeFile(outputPath, html);
    built.push({
      report,
      html,
      removed,
      entry: {
        slug: report.slug,
        ...report.metadata,
        preview: `/generated/${outputName}`,
        sourceSha256: sha256(report.html),
        outputSha256: sha256(html),
      },
    });
  }
  await writePreviewManifest(built, generatedDirectory);
  return { built, failures };
}

const escapeScript = (source) => source.replace(/<\/script/gi, "<\\/script");

// Each asset's text as an export embeds it: scripts unable to end their element early, UMD bundles
// isolated, KaTeX's fonts inlined.
async function loadInlineSources() {
  return new Map(await Promise.all(ASSETS.map(async (asset) => {
    let source = await (asset.file ? loadKitFile(asset.file) : loadVendorFile(asset, { inline: true }));
    if (!publicPathOf(asset).endsWith(".css")) source = escapeScript(source);
    return [asset.id, asset.umd ? isolateUmd(source) : source];
  })));
}

/**
 * The page with the export's generator and Content-Security-Policy right after its own <head …>
 * start tag (headEnd), and, given the sha256 of the report.html it was made from (`source`), the meta
 * that says so after them (sourceMeta, src/shared/export-wrap.mjs: what gallery qa compares with the
 * file as it is now), and the component packages it holds (`packages`, packagesMeta) after that; a
 * page that writes no head is an error, never an export without its policy. `policy`: the policy's
 * text, EXPORT_CSP's but where gallery export --allow-images widens what its pictures load
 * (exportPolicy, offlineReports).
 */
export function withExportPolicy(slug, html, source = null, packages = [], policy = EXPORT_CSP) {
  const at = headEnd(parseReport(html));
  if (at === undefined) throw new Error(`${slug}: the page writes no <head> start tag, which the export's Content-Security-Policy goes right after`);
  const said = source ? `\n  ${sourceMeta(source)}${packages.length > 0 ? `\n  ${packagesMeta(packages)}` : ""}` : "";
  return `${html.slice(0, at)}\n  <meta name="generator" content="${GENERATOR}">\n  <meta http-equiv="Content-Security-Policy" content="${policy}">${said}${html.slice(at)}`;
}

/**
 * The export's policy put in (before the shared scripts, whose text it need not read), the tags of the
 * component packages it uses replaced with their copies, from `catalog` (withPackageCopies), then each
 * local asset tag with its inline copy, the tags found on the page's tree as the checks find them
 * (withKitCopies: one a comment spells stays as it is, and the element after it is inlined). A script
 * or stylesheet tag still linked (one of the file's elements: not one a comment or a code sample
 * spells) is an error. `source`: the sha256 of the report.html it was made from (withExportPolicy).
 * What its blocks fetched of the net, as workspace `root` kept it, goes in too (./net-snapshot.mjs), and
 * what they read of the workspace (`workspace`: the snapshot of its kinds, workspaceOf's). `policy`: withExportPolicy's.
 * Of code.js (the asset whose `build` carries `grammars`), the grammars its code uses (shared/code-grammars.mjs
 * pageGrammars, read with its packages' scripts in; keptGrammars).
 */
function inlineReport(slug, html, sources, source = null, catalog = currentCatalog(), root = reportsDirectory, workspace = null, policy = EXPORT_CSP) {
  const packages = packagesOf(html, catalog);
  html = withPackageCopies(withNetSnapshot(withExportPolicy(slug, html, source, packages, policy), { slug, packages, root, workspace }), catalog);
  const page = html;
  html = withKitCopies(html, ({ id, element, attribute }) => {
    let source = sources.get(id);
    if (typeof source !== "string") throw new Error(`${slug}: no inline source for the asset "${id}" (loadInlineSources in src/render/pipeline.mjs)`);
    if (ASSETS.find((asset) => asset.id === id)?.build?.grammars) source = keptGrammars(source, pageGrammars(parseReport(page)));
    return `<${element} ${attribute}="${id}-inline">${source}</${element}>`;
  });
  const { scripts, styles } = linkedTags(parseReport(html));
  if (scripts.length + styles.length > 0) {
    throw new Error(`${slug}: export still contains a linked script or stylesheet`);
  }
  return html;
}

/**
 * Custom page markup `html` as one file that opens with no server, for gallery block check's picture of a
 * card (src/cli/block-picture.mjs): the tags a custom page is shown with (withShownTags with `page`: the
 * kit's every page loads, the board's, and those of the packages of `catalog` it holds instances of), each
 * a copy of its file, as an export's are. No policy and no snapshot: the picture's page answers the
 * workspace's reads and the net's itself, as the server would.
 */
export async function offlineCustomPage(html, { catalog }) {
  const sources = await loadInlineSources();
  const { html: tagged } = withShownTags(html, { page: true, catalog });
  return withKitCopies(withPackageCopies(tagged, catalog), ({ id, element, attribute }) => {
    const source = sources.get(id);
    if (typeof source !== "string") throw new Error(`no inline source for the asset "${id}" (loadInlineSources in src/render/pipeline.mjs)`);
    return `<${element} ${attribute}="${id}-inline">${source}</${element}>`;
  });
}

// A saved report's source held to what makes a component valid (componentFailures, as gallery check
// holds it) and what any export needs (exportFailures; not TypeScript, nor the other authoring
// checks): { html, sha256: of the file's bytes }; one that fails is an error, `reason` "check", with
// the report's `slug` and its `failures`, and `component`, the id of the package the first of them
// says, for the words a reader is told. `components` false: for what holds nothing of a component
// but its words, what any export needs of the page alone.
async function checkedSource(slug, directory = reportsDirectory, { components = true, catalog = currentCatalog() } = {}) {
  const folder = documentDirectory(slug, directory);
  const bytes = await fs.readFile(documentFiles(folder).html);
  const source = bytes.toString("utf8");
  const tree = parseReport(source);
  if (!components) catalog = { packages: new Map() };
  const failures = [...(components ? componentFailures(source, tree, catalog) : []), ...exportFailures({ slug, html: source, directory: folder, tree, catalog })];
  if (failures.length > 0) {
    const component = packagesOf(source, catalog, tree).find(({ id }) => failures[0].startsWith(`${id}:`) || failures[0].startsWith(`${id} (`))?.id;
    throw Object.assign(new Error(`${slug}: ${failures[0]}`), { reason: "check", slug, failures, ...(component ? { component } : {}) });
  }
  return { html: source, sha256: sha256(bytes) };
}

/**
 * Offline files of saved reports (the workbench's 导出, src/transfer/): a function of a slug and
 * { files } (false: its pictures and files left out, their links kept) giving the file an export
 * writes, the shared scripts and styles read once. Each report is held first to what makes its
 * components valid and to what any export needs: one that fails makes no file but an error,
 * `reason` "check", with its `slug` and `failures`.
 * Its `check(slug)` is for an export made of the source instead (Markdown), which holds no script or
 * style of a package: what any export needs of the page, and of its components nothing.
 * `directory`: the workspace the reports are in (the tests' fixtures), the workspace's by default.
 * `workspace(slug)`: what a document whose blocks read the workspace embeds of it (its facts'
 * snapshot, src/workbench/index.mjs), asked only of such a one; none, and such a block reads nothing there.
 * For a file another platform publishes (gallery export's options alone: never the workbench's 导出, whose
 * route gives neither): `images`, the https sources its policy lets its pictures load from besides its
 * own (exportPolicy in shared/export-wrap.mjs, which reads them strictly and throws for one that is none);
 * `embedsAsLinks`, each embed block written as a link to the page it shows (embeds.mjs embedsAsLinks), for a
 * platform that strips frames.
 * `pictures`: what makes the copies of its pictures as light as the page needs (./export-pictures.mjs
 * smallerPictures: src/transfer/browser.mjs encodePictures, passed in by the command and the workbench, which a
 * render never starts itself), none and they are embedded as they are, as with { pictures: false } for one file
 * (a Markdown export's pictures of its charts); what it did for each slug in `render.pictures` (a Map).
 * `carry`: what writes into the file what it carries besides the page (src/transfer/carry.mjs carriedExport: the
 * document's words for the display menu's copies, and its source for an import to give it back as written), given
 * { slug, source (the doc.html's text the file was made of), output (the file), copies (smallerPictures'), directory,
 * files, embedsAsLinks } and resolving to the file; passed in by what exports an offline file a reader keeps (the command, the
 * workbench), none for a picture's page. A render's `carry: false` writes none (a PDF, a chart's picture), and its
 * `rewrite(html)` changes the file before its pictures and what it carries (the links between the pages of an
 * export: src/transfer/export.mjs), so that what it carries says the file as it is written.
 */
export async function offlineReports({ directory = reportsDirectory, workspace = null, catalog = currentCatalog(), images = [], embedsAsLinks: links = false, pictures = null, carry = null } = {}) {
  const policy = exportPolicy({ images });
  const sources = await loadInlineSources();
  const render = async (slug, { files = true, pictures: lighter = true, carry: carried = true, rewrite = null } = {}) => {
    const source = await checkedSource(slug, directory, { catalog });
    const html = renderReportHtml(links ? embedsAsLinks(source.html) : source.html, { slug, files, reportsDirectory: directory, catalog }).html;
    let output = inlineReport(slug, html, sources, source.sha256, catalog, directory, await workspaceOf(workspace, slug, html, catalog), policy);
    if (rewrite) output = rewrite(output);
    let copies = [];
    if (pictures && lighter) {
      const made = await smallerPictures(output, pictures);
      render.pictures.set(slug, made.pictures);
      ({ html: output } = made);
      copies = made.pictures.copies ?? [];
    }
    return carry && carried ? carry({ slug, source: source.html, output, copies, directory, files, embedsAsLinks: links }) : output;
  };
  render.check = async (slug) => void await checkedSource(slug, directory, { components: false });
  render.pictures = new Map();
  return render;
}

// The text of document `slug`'s doc.html that a build read (its bytes' sha256 `sha`): an export carries it as written.
async function sourceAt(slug, directory, sha) {
  const bytes = await fs.readFile(documentFiles(documentDirectory(slug, directory)).html);
  if (sha && sha256(bytes) !== sha) throw new Error(`${slug}: its doc.html changed while it was exported`);
  return bytes.toString("utf8");
}

// What a document's export embeds of the workspace: `workspace(slug)`'s, where its blocks read it; null where none does.
async function workspaceOf(workspace, slug, html, catalog) {
  if (typeof workspace !== "function" || !readsWorkspace(packagesOf(html, catalog))) return null;
  return (await workspace(slug).catch(() => null)) ?? null;
}

/**
 * Build the selected reports, then write one standalone offline file per passing report (`prepare`:
 * checkSelectedReports; `workspace(slug)`: what one whose blocks read the workspace embeds of it, offlineReports';
 * `pictures`, offlineReports' too: what it did is each exported entry's `pictures`; `carry`, offlineReports' too).
 */
export async function exportReports(slugs = [], { prepare = null, workspace = null, directory = reportsDirectory, pictures = null, carry = null } = {}) {
  const exportsDirectory = layoutOf(directory).exports;
  const catalog = null; // the catalog in use, read where a document has an instance (packagesOf)
  const { built, failures } = await buildReports(slugs, { prepare, directory });
  const sources = await loadInlineSources();
  await fs.mkdir(exportsDirectory, { recursive: true }); // nothing in it removed: its files are the user's

  // The documents of this export link to each other's files, side by side; a link to any other keeps its words.
  const exporting = new Set(built.map(({ report }) => report.slug));
  const { links } = await documentLinks(directory);
  const exported = [];
  for (const { report, html } of built) {
    try {
      const linked = exportLinks(html, report.slug, (slug) => (exporting.has(slug) ? `${slug}.html` : null), { links });
      const inlined = inlineReport(report.slug, linked, sources, report.fileSha256, catalog, directory, await workspaceOf(workspace, report.slug, linked, catalog));
      const made = pictures ? await smallerPictures(inlined, pictures) : { html: inlined, pictures: null };
      const output = carry ? await carry({ slug: report.slug, source: await sourceAt(report.slug, directory, report.fileSha256), output: made.html, copies: made.pictures?.copies ?? [], directory }) : made.html;
      await fs.writeFile(path.join(exportsDirectory, `${report.slug}.html`), output);
      exported.push({ slug: report.slug, bytes: Buffer.byteLength(output), sha256: sha256(output), pictures: made.pictures });
    } catch (error) {
      failures.set(report.slug, [error.message]);
    }
  }
  return { built, exported, failures };
}

// What names a place in a page's tree: every element's id and block id.
function placesIn(tree) {
  const places = new Set();
  walk(tree, (node) => {
    for (const name of ["id", "data-block-id"]) if (attr(node, name) !== undefined) places.add(attr(node, name));
  });
  return places;
}

// A relative link that reads like one to a document and leads to none (`address`, what it is read as,
// is no document's): it leaves the folder of document `slug`, or names a page in it that is no file of
// its assets/. ../目标页/doc.html, a title for a folder, is the mistake it is here for.
function strayLink(href, address, slug) {
  if (hosted(href) || /^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(href) || referencedFile(href)) return false;
  const { pathname } = new URL(address);
  return !pathname.startsWith(`/${slug}/`) || pathname.endsWith(".html");
}

// The links of a page (its tree, in its folder `directory`, `slug` its document) to what is not there,
// each read as a click reads it: a document no folder beside it holds (../<slug>/doc.html, any other
// form of the address that needs no list, and a workbench's address, by the folders beside it, a page
// id being a folder name's), a block that document does not hold (…#<block id>), what reads like a link
// to a document and leads to none (strayLink), and within the page a #<id> no element has. A link to
// a document in its old file names reads the same (documentFiles). An address with a host may be
// another program's: nothing is said of a document that is not there, only of a block one does not
// hold. Each other document is read once.
function pageLinkNotes({ slug: self, tree, directory }) {
  const notes = [];
  const own = placesIn(tree);
  const root = directory === documentDirectory(path.basename(directory), reportsDirectory) ? reportsDirectory : path.dirname(directory);
  const others = new Map([[self, own]]); // slug -> its places, or null for no such document
  const placesOf = (slug) => {
    if (!others.has(slug)) {
      const files = documentFiles(documentDirectory(slug, root));
      others.set(slug, existsSync(files.html) ? placesIn(parseReport(readFileSync(files.html, "utf8"))) : null);
    }
    return others.get(slug);
  };
  let folders = null; // what a workbench's address is read by, once one is met
  const placeOf = (address, hash) => (hash === null ? pageAddress(address) : hashAddress(hash, (folders ??= pageLinks((existsSync(root) ? readdirSync(root) : []).map((slug) => ({ slug }))))));
  walk(tree, (node) => {
    const href = node.tagName === "a" ? attr(node, "href") : undefined;
    if (!href || href === "#" || href === "#top") return;
    const line = node.sourceCodeLocation?.startLine;
    if (href.startsWith("#")) {
      if (!own.has(decoded(href.slice(1)))) notes.push(`the link to ${href} (line ${line}) names no block or element of this document`);
      return;
    }
    const address = fromFile(href, self);
    const hash = workbenchHash(address);
    const place = placeOf(address, hash);
    if (place ? !placesOf(place.slug) : hash !== null) {
      if (!hosted(href)) notes.push(`the link to ${href} (line ${line}) names a document that is not there: gallery list has the slugs`);
    } else if (place?.block && !placesOf(place.slug).has(place.block)) notes.push(`the link to ${href} (line ${line}) names a block document ${place.slug} does not hold`);
    else if (address && !place && strayLink(href, address, self)) notes.push(`the link to ${href} (line ${line}) leads to no document: a link to one is ../<slug>/doc.html, gallery list has the slugs`);
  }, BODY);
  return notes;
}

// The look document `slug` (its folder `directory`) shows, as doc.json and gallery.json say it ({} where they do not read).
function lookAt(slug, directory) {
  try {
    return documentLook(slug, path.dirname(directory));
  } catch {
    return {};
  }
}

// The widest the export's copy of a picture of document `slug` may be: twice the reading column its look shows
// (src/shared/export-pictures.mjs pictureCeiling).
function lookCeiling(slug, directory) {
  const look = lookAt(slug, directory);
  const attributes = new Map(lookAttributes(look)); // as the render puts them on its <html>
  return pictureCeiling((name) => attributes.get(name) ?? null);
}

/**
 * The notes on a report ({ slug, html, directory, written }: `written` its file's text when `html`
 * is it as the intake makes it in memory, loadReports'), never a failure, in three kinds: `fix`,
 * those an Agent acts on first, each saying what to do (the paths of this machine in the text a
 * reader reads, localPathNotes; the pictures that make its export heavy or that it shows more than
 * once, largePictureNotes; a database the page shows read-only, each problem at its line, databaseFixes); `notes`, the rest worth a look: its layout's, its links to a document or
 * a block that is not there (pageLinkNotes), what in a table a chart
 * draws reads oddly (a column of numbers and words, a <tfoot> left out, cells past the header:
 * tableChartReadings), and what strict TypeScript says of a type alone in its own script
 * (`scriptNotes`, which checkReports gives it: advice, the browser runs the script as written); and
 * `readings`, information with nothing to do: how each chart drawn from a table reads it (its rows,
 * each column's values numbers or words), so a report as it should be prints no note; and `databases`, information too:
 * what each database holds and what each of its views shows (databaseReadings), so that a database written as
 * meant is still said, and an Agent sees what its views show without a browser.
 * `copies`: whether the export makes its pictures' copies as light as the page needs, true, or why not (the
 * command that asks knows: a Chrome or Edge on the machine, --original-images), largePictureNotes'.
 */
export function notesByKind({ slug, html, directory = documentDirectory(slug, reportsDirectory), written = html, scriptNotes = [] }, { copies = true } = {}) {
  const tree = parseReport(html);
  const charts = tableChartReadings(html);
  return {
    fix: [...localPathNotes(html, tree), ...largePictureNotes({ html, directory, tree, ceiling: lookCeiling(slug, directory), copies }), ...databaseFixes(tree)],
    notes: [...layoutNotes(html, { written }), ...componentNotes(tree), ...pageLinkNotes({ slug, tree, directory }), ...charts.notes, ...scriptNotes],
    readings: charts.readings,
    databases: databaseReadings(tree, { wideLook: lookAt(slug, directory).databases === "wide" }),
  };
}

/** The notes on a report worth a look (notesByKind's fix and notes, not its readings), those to act on first first. */
export function notesOf(report, options) {
  const { fix, notes } = notesByKind(report, options);
  return [...fix, ...notes];
}

/**
 * Print the notes of these reports (notesByKind), each a line: first those to act on, "fix <slug>:
 * …", of every report, then the rest, "note <slug>: …", then what each chart drawn from a table
 * reads, "chart <slug>: …", and what each database holds and shows, "database <slug>: …", information (an export's notes once listed chart readings first and a
 * local path last, both "note": the Agent read past the one it had to change; and a report as it
 * should be, the skill's example among them, printed a note there was nothing to do about).
 * `options`: notesByKind's (`copies`).
 */
export function reportNotes(reports, options) {
  const kinds = reports.map((report) => [report.slug, notesByKind(report, options)]);
  for (const [slug, { fix }] of kinds) for (const note of fix) console.log(`fix ${slug}: ${note}`);
  for (const [slug, { notes }] of kinds) for (const note of notes) console.log(`note ${slug}: ${note}`);
  for (const [slug, { readings }] of kinds) for (const reading of readings) console.log(`chart ${slug}: ${reading}`);
  for (const [slug, { databases }] of kinds) for (const reading of databases) console.log(`database ${slug}: ${reading}`);
}

/**
 * Print the failures of each report, "FAIL <slug>: N problems" and each on a line of its own (with
 * `exportNote`, that an earlier export stays); gallery export says them first, before its notes.
 */
export async function printFailures(failures, { exportNote = false } = {}) {
  for (const [slug, messages] of failures) {
    console.error(`\nFAIL ${slug}: ${messages.length} problem${messages.length === 1 ? "" : "s"}`);
    for (const message of messages) console.error(`  - ${message}`);
    const previous = path.join(exportsDirectory, `${slug}.html`);
    if (exportNote && await fs.stat(previous).then(() => true, () => false)) {
      console.error(`  ${previous} was not updated; it still holds an earlier export.`);
    }
  }
}

/** The last line when documents failed (`above`: their failures were said before the notes), and a failing exit code unless `allow` (--allow-failures). */
export function failureSummary(failures, { above = false, allow = process.argv.includes("--allow-failures") } = {}) {
  if (failures.size === 0) return;
  console.error(`\n${failures.size} document${failures.size === 1 ? "" : "s"} failed: ${[...failures.keys()].join(", ")}${above ? " (the failures are listed first, above)" : ""}`);
  if (!allow) process.exitCode = 1;
}

/** Print failures per document and set a failing exit code unless `allow` (--allow-failures). */
export async function reportFailures(failures, { exportNote = false, allow } = {}) {
  await printFailures(failures, { exportNote });
  failureSummary(failures, { allow });
}
