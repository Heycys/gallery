import "../unit/workspace-env.mjs"; // the workspace GALLERY_WORKSPACE names, else the tests' temporary empty one
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer from "puppeteer-core";
import { kitFileNames, loadKitFile } from "../../src/render/kit-build.mjs";
import { projectRoot, reportsDirectory } from "../../src/shared/paths.mjs";
import { listReportSlugs } from "../../src/shared/reports.mjs";
import { findBrowser } from "./harness.mjs";

// What a change of the shared kit does to the pages (docs/testing.md): the same pages with given
// earlier versions of kit files and with the kit as src/render/kit/ builds it now, compared element
// by element — its attributes (a table's column widths, a chart's geometry, what scripts set) and
// its computed style (and its ::before, ::after and ::marker) — at several widths, light and dark,
// and in print, on every Sheet. For reorganizing the kit (nothing may change) or for seeing
// everything a change of one component reaches.
//
//   node tests/browser/kit-diff.mjs <name>=<earlier file>… [--reports <slug>,…] [--ignore <regex>] [--limit <n>]
//
// e.g. report.css=old/report.css tables.js=old/tables.js (a kit file's name in /kit/; a path to a
// .css alone is report.css). The pages: the editing tests' sample report
// (tests/browser/fixtures/sample/), the Component Catalog (tests/fixtures/component-catalog/) and,
// when GALLERY_WORKSPACE names a workspace, every document of it (or those of --reports; without
// it the tests' workspace is a temporary empty folder, tests/unit/workspace-env.mjs, and adds
// none), each exported by the tool itself (gallery export in a temporary studio: the workspace is
// only read and nothing in its exports/ is written, so no export can be older than the tokens or
// the sources), the kit files inlined there swapped; and a page of the kit's components nested in
// each other (COMBINATIONS: styles only), where the order of rules of the same weight decides.
// --ignore: properties whose names match are left out, for what a change takes away on purpose
// (a custom property it deletes shows on every element as one that is gone).
// --limit: differences printed per page and setting (default 40); the count above them is complete.
// Exit code 1 when anything differs, 2 for a wrong command line or a report that fails its checks.

const WIDTHS = [1280, 700, 600, 400]; // the kit's breakpoints are 760, 640 and 420
const SAMPLE = "kit-diff-sample"; // the editing tests' sample report, as a slug of the temporary studio
const SAMPLE_TITLE = "sample (tests/browser/fixtures/sample)";
const CATALOG = "component-catalog"; // the Component Catalog, every component once, under its own slug
const CATALOG_TITLE = "Component Catalog (tests/fixtures/component-catalog)";

const args = process.argv.slice(2);
const reportsAt = args.indexOf("--reports");
const slugs = reportsAt >= 0 ? (args.splice(reportsAt, 2)[1] ?? "").split(",").filter(Boolean) : [];
const ignoreAt = args.indexOf("--ignore");
const ignored = ignoreAt >= 0 ? new RegExp(args.splice(ignoreAt, 2)[1] ?? "(?!)") : null;
const limitAt = args.indexOf("--limit");
const limit = limitAt >= 0 ? Number(args.splice(limitAt, 2)[1]) : 40; // differences printed per page and setting
const earlier = new Map(args.map((arg) => (arg.includes("=") ? arg.split(/=(.*)/s).slice(0, 2) : ["report.css", arg])));
if (earlier.size === 0 || [...earlier.keys()].some((name) => !kitFileNames.includes(name)) || !(limit >= 0)) {
  console.error(`usage: node tests/browser/kit-diff.mjs <name>=<earlier file>… [--reports <slug>,…] [--ignore <regex>] [--limit <n>]   (names: ${kitFileNames.join(", ")})`);
  process.exit(2);
}
const before = new Map();
const after = new Map();
for (const [name, file] of earlier) {
  before.set(name, await fs.readFile(file, "utf8"));
  after.set(name, await loadKitFile(name));
}

// Components inside each other where the order of equally weighted rules decides: flowcharts (steps
// written as nodes, with an icon, colored, written the short way, empty; one in a panel), small text,
// code, a formula and a callout first and last in a panel; cards and tables in columns, in a panel
// and in a disclosure (cells with fills, header cells that stick, in a panel and a disclosure of a color of their own); every kind of block that takes a color, in one (a paragraph, a heading, a list item, a callout, a summary, a code block, a file, a bookmark, a formula, a disclosure, each a background and a text color); columns with shares, text and code in a column; a code block and a diff with numbered lines; a card's title in a section; tables with a span at narrow widths.
const COMBINATIONS = `<!doctype html><html lang="zh-CN" data-doc-ready><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>styles</title><style data-doc-kit="styles-inline"></style></head>
<body><main class="doc-page" data-doc-id="styles">
<header class="doc-header"><p class="doc-kicker">Kicker</p><h1 class="doc-title">标题 Title</h1><p class="doc-note">header note</p></header>
<p>Body text straight in the page, <strong>strong</strong>, <a href="#card">link</a>, <a class="doc-dialog-trigger" href="#card">entry</a>, <code>code</code>, <span class="doc-text-red">red</span> <span class="doc-highlight-yellow">mark</span> <span class="doc-math-inline">x</span>.</p>
<hr>
<div class="doc-summary"><p>Summary</p><ul><li>one<ul><li>two<ol><li>three<ul><li>four</li></ul></li></ol></li></ul></li></ul><p class="doc-note">note last</p></div>
<div class="doc-panel"><p class="doc-note">note first</p><p>text</p><div class="doc-callout"><p>callout last</p></div></div>
<div class="doc-panel"><pre class="doc-code-block"><code>code first</code></pre><div class="doc-math-block">formula last</div></div>
<div class="doc-panel"><div class="doc-callout"><p>callout first</p></div><details class="doc-details"><summary><span class="doc-details-summary-label">closed</span></summary><div class="doc-details-content"><p>inside</p></div></details></div>
<div class="doc-panel"><div class="doc-columns"><div class="doc-column"><figure class="doc-figure"><h3>card</h3></figure></div><div class="doc-column"><div class="doc-table-wrap"><table class="doc-table"><tbody><tr><td>cell</td></tr></tbody></table></div></div></div><div class="doc-code-card"><div class="doc-code-header"><span>last.js</span></div><pre class="doc-code-block"><code>x</code></pre></div></div>
<div class="doc-panel doc-highlight-blue"><div class="doc-table-wrap"><table class="doc-table"><thead><tr><th class="doc-highlight-red">a</th><th>b</th></tr></thead><tbody><tr><th scope="row" class="doc-highlight-green">r1</th><td class="doc-highlight-yellow">1</td></tr><tr><th scope="row">r2</th><td>2</td></tr></tbody><tfoot><tr><td class="doc-highlight-gray">sum</td><td>3</td></tr></tfoot></table></div></div>
<details class="doc-details doc-highlight-purple" open><summary><span class="doc-details-summary-label">colored</span></summary><div class="doc-details-content"><div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>h</th></tr></thead><tbody><tr><th scope="row">r</th></tr></tbody></table></div></div></details>
<div class="doc-summary doc-highlight-orange"><p>colored summary</p></div>
<p class="doc-highlight-yellow">colored paragraph <span class="doc-highlight-pink">mark</span></p><h2 class="doc-highlight-green">colored heading</h2><h4 class="doc-text-blue doc-highlight-gray">colored small heading</h4>
<ul><li class="doc-highlight-blue">colored item<ol><li class="doc-highlight-red">colored numbered item</li></ol></li><li class="doc-text-purple">text colored item</li></ul>
<div class="doc-callout doc-highlight-green"><p>colored callout</p></div><div class="doc-callout doc-text-red"><p>text colored callout</p></div>
<div class="doc-code doc-highlight-brown"><div class="doc-code-title">file.js</div><pre><code class="doc-code-lines"><span class="doc-code-line" data-line-number="1"><span class="doc-code-content">one</span></span></code></pre></div>
<figure class="doc-file doc-highlight-purple"><a class="doc-file-link" href="data:text/plain;base64,eA==" download="a.txt"><span class="doc-file-name">a.txt</span><span class="doc-file-size">1 B</span></a><figcaption>c</figcaption></figure>
<figure class="doc-bookmark doc-highlight-pink"><a class="doc-bookmark-card" href="https://example.com"><span class="doc-bookmark-text"><span class="doc-bookmark-title">T</span></span></a><figcaption>c</figcaption></figure>
<div class="doc-math-block doc-highlight-yellow">colored formula</div><div class="doc-math-block doc-text-green">text colored formula</div>
<details class="doc-details doc-text-orange"><summary><span class="doc-details-summary-label">text colored</span></summary><div class="doc-details-content"><p>inside</p></div></details>
<ol class="doc-flow"><li><p><strong>node title</strong></p><p>node text</p><ul><li>held</li></ul></li><li class="doc-highlight-blue"><div class="doc-icon">📮</div><p><strong>icon node</strong></p></li><li class="doc-text-red">short words<p>short text</p></li><li><p><strong></strong></p></li><li></li></ol>
<div class="doc-panel"><ol class="doc-flow"><li><p><strong>first in a panel</strong></p></li><li>last<figure class="doc-image"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""><figcaption></figcaption></figure></li></ol></div>
<section class="doc-section"><hr><h2>Section</h2><p>p</p><h3>h3</h3><p class="doc-note">note</p>
  <figure class="doc-figure doc-figure--compact" data-surface="bounded"><h2>Card h2</h2><h3>Card h3</h3><p class="doc-note">card note</p><div class="doc-chart"></div><p class="doc-figure-caption">caption</p></figure>
  <figure class="doc-figure" style="--doc-span: .6; --doc-chart-height: 300px"><h3>Spanned card</h3></figure>
  <h2>Second title</h2><p>description <strong>bold</strong></p><h3>Small title</h3><h4>h4 under it</h4>
  <div class="doc-callout"><h3>callout heading</h3><h4>callout h4</h4></div><figure class="doc-figure"><h4>card h4</h4></figure><blockquote><h3>quote h3</h3></blockquote>
  <details class="doc-details" open><summary><span class="doc-details-summary-label">Disclosure <code>c</code></span></summary><div class="doc-details-content"><h2>In a disclosure</h2><div class="doc-columns"><div class="doc-column"><div class="doc-table-wrap" style="--doc-span: .5"><table class="doc-table"><thead><tr><th>a</th><th class="number">b</th></tr></thead><tbody><tr><td>1</td><td class="number">2</td></tr></tbody></table></div></div><div class="doc-column"><div class="doc-table-wrap"><table class="doc-table doc-table--full"><tbody><tr><td>x</td></tr></tbody></table></div></div></div><p class="doc-note">n</p><div class="doc-table-wrap"><table class="doc-table"><tbody><tr><td>loose</td></tr></tbody></table></div></div></details>
  <div class="doc-table-meta"><span>Scope</span><span>Unit</span></div><div class="doc-table-wrap" style="--doc-span: 1.5; --doc-table-height: 200px"><table class="doc-table doc-table--sticky-first doc-table--auto"><thead><tr><th>Name<button class="doc-table-sort-button" type="button" contenteditable="false" data-doc-sort-arrow="desc"></button></th><th aria-sort="ascending" class="number">Value<button class="doc-table-sort-button" type="button" contenteditable="false" data-doc-sort-arrow="asc"></button></th></tr></thead><tbody><tr><td>a</td><td class="number" data-column-kind="compact">1</td></tr><tr><td>b</td><td data-column-kind="narrative">two</td></tr></tbody></table></div>
  <div class="doc-columns"><div class="doc-column" style="--doc-column-ratio: .5"><figure class="doc-figure doc-figure--compact"><h3>compact</h3></figure></div><div class="doc-column" style="--doc-column-ratio: .3"><div class="doc-table-wrap" style="--doc-span: .3"><table class="doc-table"><tbody><tr><td>t</td></tr></tbody></table></div></div><div class="doc-column" style="--doc-column-ratio: .2"><p>text column</p><figure class="doc-figure" style="--doc-chart-height: 240px"><h3>own height</h3></figure></div></div>
  <div class="doc-code"><div class="doc-code-title">file.js</div><pre style="--doc-code-height: 80px"><code class="doc-code-lines" style="--doc-code-digits: 2"><span class="doc-code-line" data-line-number="1"><span class="doc-code-content">one</span></span>
<span class="doc-code-line" data-line-number="2"><span class="doc-code-content">two</span></span></code></pre></div>
  <div class="doc-diff"><div class="doc-code-title">file.js</div><div class="doc-code-tools"><span class="doc-diff-stats"><span class="doc-diff-added">+1</span><span class="doc-diff-removed">-1</span></span></div><div class="doc-diff-body" style="--doc-code-height: 80px"><code class="doc-code-lines"><span class="doc-code-line doc-code-line--added has-accent has-colored-number" data-line-number="1"><span class="doc-code-content">added</span></span><span class="doc-code-line doc-code-line--removed has-accent" data-line-number="2"><span class="doc-code-content">removed</span></span></code></div></div>
  <blockquote><p>quote</p><p>quote last</p></blockquote>
  <div><p>plain div</p><div class="doc-columns"><div class="doc-column"><h1>column h1</h1><p>column text</p><pre><code>pre in a column</code></pre></div><div class="doc-column"><ul><li>one<ul><li>two</li></ul></li></ul></div></div><p>after columns</p></div>
  <figure class="doc-image" style="--doc-span: .6"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""><figcaption>说明文字 caption</figcaption></figure>
  <figure class="doc-image doc-image--left"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""><figcaption></figcaption></figure>
  <figure class="doc-file"><a class="doc-file-link" href="data:text/plain;base64,eA==" download="a.txt"><span class="doc-file-name">a.txt</span><span class="doc-file-size">1 B</span></a><figcaption>文件说明 caption</figcaption></figure>
  <figure class="doc-bookmark"><a class="doc-bookmark-card" href="https://example.com"><span class="doc-bookmark-text"><span class="doc-bookmark-title">T</span><span class="doc-bookmark-description">D</span><span class="doc-bookmark-url"><span class="doc-bookmark-href">https://example.com</span></span></span></a><figcaption>书签说明 caption</figcaption></figure>
  <figure class="doc-embed" style="--doc-span: .5; --doc-embed-height: 200px"><iframe class="doc-embed-frame" src="about:blank"></iframe><figcaption>嵌入说明 caption</figcaption></figure>
  <figure class="doc-embed doc-embed--file"><iframe class="doc-embed-frame" src="about:blank"></iframe><figcaption></figcaption></figure>
  <figure class="doc-image"></figure><figure class="doc-file"></figure><figure class="doc-bookmark"></figure><figure class="doc-embed"></figure>
  <div class="doc-columns"><div class="doc-column"><figure class="doc-image"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt=""><figcaption>列里的说明 caption</figcaption></figure><figure class="doc-file"></figure></div><div class="doc-column"><figure class="doc-embed" style="--doc-span: .8"><iframe class="doc-embed-frame" src="about:blank"></iframe><figcaption>列里的嵌入 caption</figcaption></figure></div></div>
  <div class="doc-math-block">formula</div>
</section>
<div class="doc-sheet-shell" data-doc-sheets>
  <div class="doc-sheet-tabs" role="tablist"><button class="doc-sheet-tab" aria-selected="true" type="button">A</button><button class="doc-sheet-tab" type="button">B</button></div>
  <div data-doc-sheet="a"><p>body in a panel</p><section class="doc-section"><h2>in a panel</h2><p>p</p></section></div>
  <div data-doc-sheet="b" hidden><p>hidden panel</p></div>
</div>
<div class="doc-columns"><div class="doc-column"><h3>group</h3><div class="doc-state-fields"><label>n</label><textarea class="doc-state-field"></textarea></div><div class="doc-state-actions"><button class="doc-button" type="button">button</button></div><div class="doc-filter-row"><button class="doc-filter-button is-active" type="button">on</button><button class="doc-filter-button" type="button">off</button></div><ul class="doc-state-list"><li>kept</li></ul><p class="doc-note">status</p></div><div class="doc-column"><p>second</p></div></div>
<dialog class="doc-dialog" id="card"><div class="doc-dialog-panel"><div class="doc-dialog-content"><h3>Card</h3><p>first</p><div class="doc-callout"><p>last</p></div></div></div></dialog>
</main>
<div class="doc-display"><button class="doc-display-button" aria-expanded="true" type="button"><svg viewBox="0 0 20 20"><path d="M3.5 6.5h7.25"></path><circle cx="13" cy="6.5" r="2.25"></circle></svg></button><div class="doc-display-menu" role="menu"><div class="doc-display-section"><div class="doc-display-header">外观</div><button class="doc-display-item" role="menuitemradio" aria-checked="true" type="button"><span class="doc-display-icon"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="3"></circle></svg></span><span class="doc-display-label">浅色</span><svg class="doc-display-check" viewBox="0 0 20 20"><path d="M5 10.5l3.25 3.25L15 7"></path></svg></button></div><div class="doc-display-section"><button class="doc-display-item" role="menuitemcheckbox" aria-checked="false" type="button"><span class="doc-display-icon"></span><span class="doc-display-label">全宽显示</span><span class="doc-display-switch"><span></span></span></button></div></div></div>
<div class="doc-sheet-dock is-visible"><button class="doc-sheet-tab" aria-selected="true" type="button">A</button></div>
</body></html>`;

// The page with these kit files inlined in place of its own (as an export inlines them).
function withKit(html, files) {
  for (const [name, text] of files) {
    const tag = name === "report.css" ? '<style data-doc-kit="styles-inline">' : `<script data-doc-kit="${name.replace(/\.js$/, "")}-inline">`;
    const start = html.indexOf(tag);
    if (start < 0) continue; // a page that does not load it (pruned, or the components page)
    const open = start + tag.length;
    const end = html.indexOf(name === "report.css" ? "</style>" : "</script>", open);
    html = html.slice(0, open) + (name === "report.css" ? text : text.replace(/<\/script/gi, "<\\/script")) + html.slice(end);
  }
  return html;
}

const directory = await fs.mkdtemp(path.join(os.tmpdir(), "report-kit-diff-"));

// The pages: each report exported as the studio exports one (the tool of the same name that
// `gallery export` runs), in a workspace of its own under the temporary directory (GALLERY_WORKSPACE)
// that holds copies of the workspace's documents, of the sample and of the Catalog. Whatever a report
// fails is the kit's business no less than its own, so a report that fails its checks stops the run.
const pages = [["components nested in each other", COMBINATIONS]];
{
  const root = path.join(directory, "studio");
  const existing = await listReportSlugs();
  const missing = slugs.filter((slug) => !existing.includes(slug));
  if (missing.length > 0) {
    console.error(`No such document in the workspace ${reportsDirectory} (GALLERY_WORKSPACE names the workspace): ${missing.join(", ")}`);
    await fs.rm(directory, { recursive: true, force: true });
    process.exit(2);
  }
  const names = slugs.length > 0 ? slugs : existing;
  for (const name of names) await fs.cp(path.join(reportsDirectory, name), path.join(root, "reports", name), { recursive: true });
  await fs.cp(path.join(projectRoot, "tests", "browser", "fixtures", "sample"), path.join(root, "reports", SAMPLE), { recursive: true });
  await fs.cp(path.join(projectRoot, "tests", "fixtures", CATALOG), path.join(root, "reports", CATALOG), { recursive: true });
  // Its main's id is its slug here, as the checks ask (main[data-doc-id]).
  const sample = path.join(root, "reports", SAMPLE, "doc.html");
  await fs.writeFile(sample, (await fs.readFile(sample, "utf8")).replace(/(<main\b[^>]*\bdata-doc-id=")[^"]*"/, (_, start) => `${start}${SAMPLE}"`));
  const exported = spawnSync(process.execPath, [path.join(projectRoot, "src", "cli", "bin.mjs"), "export", "--all"], { cwd: projectRoot, env: { ...process.env, GALLERY_WORKSPACE: path.join(root, "reports") }, encoding: "utf8" });
  if (exported.status !== 0) {
    console.error(`${exported.stdout}${exported.stderr}
A report that fails its checks has no export to compare: fix it, or name the others with --reports.`);
    await fs.rm(directory, { recursive: true, force: true });
    process.exit(2);
  }
  for (const name of [...names, SAMPLE, CATALOG]) pages.push([name === SAMPLE ? SAMPLE_TITLE : name === CATALOG ? CATALOG_TITLE : name, await fs.readFile(path.join(root, "reports", "exports", `${name}.html`), "utf8")]);
}

const executablePath = findBrowser();
if (!executablePath) throw new Error("No Chrome, Edge or Chromium found (set GALLERY_BROWSER).");
const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-first-run", "--no-default-browser-check", "--hide-scrollbars"] });

// In the page: each element's key (its path), attributes and computed style, with its
// pseudo-elements. Ids a script numbers as it draws (a chart's clip path) depend on how often it
// drew, so their numbers are left out.
const SNAPSHOT = () => {
  const numbered = (text) => text.replace(/(doc-[a-z-]+?)-\d+\b/g, "$1-N");
  const keyOf = (element) => {
    const parts = [];
    for (let node = element; node && node !== document.documentElement; node = node.parentElement) {
      const name = node.getAttribute("class")?.trim().split(/\s+/).filter((part) => part.startsWith("doc-")).join(".");
      parts.unshift(`${node.localName}${name ? `.${name}` : ""}:${[...node.parentElement.children].indexOf(node)}`);
    }
    return parts.join(" > ");
  };
  // An `auto` margin is the room the layout leaves, and Chrome's computed value of it (the used value in
  // px) is not always the same for the same page, though the element is drawn in the same place. So
  // for an element whose margin on a side is `auto` (the computed value, from the style map, says so),
  // the value written is where the element is drawn: its distance from its container's edge.
  const SIDES = { "margin-left": "left", "margin-inline-start": "left", "margin-right": "right", "margin-inline-end": "right" }; // the pages read left to right
  const autoSides = (element, pseudo) => {
    const map = pseudo ? null : element.computedStyleMap?.();
    return map ? Object.keys(SIDES).filter((name) => String(map.get(name)) === "auto") : [];
  };
  const edgeOf = (element, side) => {
    const own = element.getBoundingClientRect();
    const container = element.parentElement.getBoundingClientRect();
    return Math.round((side === "left" ? own.left - container.left : container.right - own.right) * 10) / 10;
  };
  const styleOf = (element, pseudo) => {
    const style = getComputedStyle(element, pseudo);
    if (pseudo && pseudo !== "::marker" && style.content === "none") return "";
    const auto = autoSides(element, pseudo);
    return [...style].map((name) => `${name}: ${auto.includes(name) ? `auto, ${edgeOf(element, SIDES[name])}px from the container's edge` : numbered(style.getPropertyValue(name))}`).join("\n");
  };
  const out = {};
  for (const element of document.querySelectorAll("body, body *")) {
    if (element.matches("script, style")) continue;
    const key = keyOf(element);
    out[key] = [...element.attributes].map((attribute) => `@${attribute.name}: ${numbered(attribute.value)}`).concat(styleOf(element, null)).join("\n");
    for (const pseudo of ["::before", "::after"]) {
      const style = styleOf(element, pseudo);
      if (style) out[`${key} ${pseudo}`] = style;
    }
    if (element.localName === "li") out[`${key} ::marker`] = styleOf(element, "::marker");
  }
  return out;
};

const settings = [
  ...WIDTHS.flatMap((width) => ["light", "dark"].map((scheme) => ({ width, scheme, media: "screen" }))),
  { width: 1280, scheme: "light", media: "print" },
  { width: 1280, scheme: "light", media: "screen", motion: "reduce" },
];
// Some tables of the sample (in its second and third Sheets: a table in a column, whose width is the
// table's) end at one of two widths from one load to the next when motion is reduced (the layout of
// tables/layout.js has two fixed points there); with motion as it is, they end at the same one every
// time. The Component Catalog's tables in its second to fourth Sheets do the same (360px or 712px, the kit
// before a change as after it). So that setting leaves both out until the layout has one.
const UNSTABLE_REDUCED = new Set([SAMPLE_TITLE, CATALOG_TITLE]);

async function open(file, { width, scheme, media, motion = "no-preference" }, storage = null) {
  const context = await browser.createBrowserContext();
  const page = await context.newPage();
  await page.setViewport({ width, height: 900 });
  // One call sets the media type and the features together: each of puppeteer's two calls
  // (emulateMediaType, emulateMediaFeatures) replaces the whole state the other one set, so with both
  // the second always took the first one's away (the reduced motion, or print).
  await (await page.createCDPSession()).send("Emulation.setEmulatedMedia", { media, features: [{ name: "prefers-color-scheme", value: scheme }, { name: "prefers-reduced-motion", value: motion }] });
  if (storage) await page.evaluateOnNewDocument((entries) => { for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value); }, storage);
  await page.goto(pathToFileURL(file).href, { waitUntil: "load" });
  await page.waitForFunction(() => document.documentElement.hasAttribute("data-doc-ready"), { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => globalThis.DocCode?.colorAll?.()); // code blocks a kit colors once the page is idle, colored now
  await settled(page);
  return { page, close: () => context.close() };
}

// Waits until the page has stopped drawing: what the kit's scripts write (the styles they set on
// elements, a table's widths, the scrollbars' places) and the page's height the same in four looks
// 100ms apart (at most 10s). The scripts lay out on frames and on resizes, a table in a Sheet not
// shown yet when it is shown, so a wait of fixed length shows two runs of the same kit at different
// stages whenever the machine is busy.
const settled = (page) => page.evaluate(() => new Promise((resolve) => {
  const look = () => `${document.documentElement.scrollHeight}|${[...document.querySelectorAll("[style]")].map((element) => element.getAttribute("style")).join("|")}`;
  let last = look();
  let same = 0;
  const started = Date.now();
  const check = () => {
    const now = look();
    same = now === last ? same + 1 : 0;
    last = now;
    if (same >= 4 || Date.now() - started > 10000) resolve();
    else setTimeout(check, 100);
  };
  setTimeout(check, 100);
}));

// The Sheets of a page, as the indexes of their tabs in the first tab row.
const tabCount = (page) => page.evaluate(() => document.querySelectorAll(".doc-sheet-shell .doc-sheet-tabs [data-sheet-tab]").length);
const showTab = (page, index) => page.evaluate((index) => document.querySelectorAll(".doc-sheet-shell .doc-sheet-tabs [data-sheet-tab]")[index]?.click(), index);
// What a page keeps in the browser (DocState: the Sheet shown is one of it), to draw it from the start as
// a reader coming back finds it. A Sheet the page shows after it was drawn is laid out by what happens
// to be going on at the moment it is shown (the same page ends in different widths of its tables from one
// run to the next), one the page draws shown is the same every time.
const kept = (page) => page.evaluate(() => Object.fromEntries(Object.entries(localStorage)));

let differences = 0;
let compared = 0;

// The two pages (before, after) as they are now, element by element.
async function compare(a, b, where) {
  // Each page in turn, in front: a page behind another is not given frames, so what its scripts lay out
  // on a frame would still be waiting.
  // A transition still running is finished first: one in a closed disclosure is never given frames
  // (the fading edge of a table's frame there stood at 0.93 or 0 from one load to the next, the same kit
  // on both sides), so what is compared is where each one ends.
  const snapshots = [];
  for (const { page } of [a, b]) {
    await page.bringToFront();
    await page.evaluate(() => { for (const animation of document.getAnimations()) try { animation.finish(); } catch { /* an endless one */ } });
    await settled(page);
    snapshots.push(await page.evaluate(SNAPSHOT));
  }
  const [left, right] = snapshots;
  const found = [];
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    compared++;
    if (left[key] === right[key]) continue;
    if (left[key] === undefined || right[key] === undefined) {
      found.push(`${key}: only ${left[key] === undefined ? "after" : "before"}`);
      continue;
    }
    const old = new Map(left[key].split("\n").map((line) => line.split(/: (.*)/s).slice(0, 2)));
    const now = new Map(right[key].split("\n").map((line) => line.split(/: (.*)/s).slice(0, 2)));
    for (const property of new Set([...old.keys(), ...now.keys()])) {
      if (!ignored?.test(property) && old.get(property) !== now.get(property)) found.push(`${key}\n    ${property}: ${old.get(property)} → ${now.get(property)}`);
    }
  }
  if (found.length > 0) {
    differences += found.length;
    console.log(`# ${where}: ${found.length} difference(s)`);
    for (const line of found.slice(0, limit)) console.log(`  ${line}`);
    if (found.length > limit) console.log(`  … ${found.length - limit} more (--limit ${found.length} prints all)`);
  }
}

for (const [index, [name, html]] of pages.entries()) {
  const files = [path.join(directory, `${index}-before.html`), path.join(directory, `${index}-after.html`)];
  await fs.writeFile(files[0], withKit(html, before));
  await fs.writeFile(files[1], withKit(html, after));
  for (const setting of settings) {
    if (setting.motion === "reduce" && UNSTABLE_REDUCED.has(name)) continue;
    const label = `${name} · ${setting.width}px ${setting.scheme}${setting.media === "print" ? " print" : ""}${setting.motion === "reduce" ? " reduced motion" : ""}`;
    const [a, b] = [await open(files[0], setting), await open(files[1], setting)];
    const tabs = Math.max(1, await tabCount(a.page));
    await compare(a, b, `${label}${tabs > 1 ? " · Sheet 1" : ""}`);
    for (let tab = 1; tab < tabs; tab++) {
      await a.page.bringToFront();
      await showTab(a.page, tab);
      await settled(a.page);
      const storage = await kept(a.page);
      const [c, d] = [await open(files[0], setting, storage), await open(files[1], setting, storage)];
      await compare(c, d, `${label} · Sheet ${tab + 1}`);
      await c.close();
      await d.close();
    }
    await a.close();
    await b.close();
  }
}
await browser.close();
await fs.rm(directory, { recursive: true, force: true });
console.log(differences === 0
  ? `Checked the kit (${[...earlier.keys()].join(", ")}): ${compared} element states of ${pages.length} page(s) at ${WIDTHS.join(", ")}px, light and dark, in print and with reduced motion, on every Sheet, the same before and after.`
  : `${differences} difference(s) between the kit before and after (${[...earlier.keys()].join(", ")}).`);
process.exit(differences === 0 ? 0 : 1);
