import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ASSETS, assetProblems, assetTags, earlyScriptFailures, kitTags, pruneUnusedKitTags, tagFailures, usedAssets, withKitCopies, withKitTags, withNeededKitTags } from "../../src/render/assets.mjs";
import { kitFileNames } from "../../src/render/kit-build.mjs";
import { checkReports } from "../../src/render/pipeline.mjs";
import { renderReportHtml } from "../../src/render/report-html.mjs";
import { createReportFromStarter, loadReports } from "../../src/render/reports.mjs";
import { COMPONENTS } from "../../src/shared/components/index.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { newNames } from "../../src/shared/new-names.mjs";

// The shared assets a report loads, listed once (src/render/assets.mjs): the list holds together,
// everything else follows from it: the tags the render puts in a page, and what the checks ask of
// the tags a source writes.

assert.deepEqual(assetProblems(), [], assetProblems().join("\n"));
assert.deepEqual(assetTags(["dialogs"]), ['<script src="/kit/dialogs.js" data-doc-kit="dialogs"></script>'], "what a page takes to run what a package asks for");
assert.deepEqual(assetTags(["state"]), [], "what every page loads, none");
assert.deepEqual(assetTags(["katex-auto-render", "dialogs"], (asset) => `/${asset.id}`).map((tag) => /data-doc-(?:kit|vendor)="([^"]+)"/.exec(tag)[1]), ["dialogs", "katex", "katex-auto-render"], "with what they load after, in load order");
assert.deepEqual(kitFileNames, ASSETS.filter((asset) => asset.file).map((asset) => asset.file), "kit-build.mjs makes the kit files of the list");

// The list catches what it should, before anything is built from it.
{
  const kit = (id, extra) => ({ id, file: `${id}.js`, build: { read: `${id}.js` }, api: `Doc${id}`, ...extra });
  const broken = [
    kit("a"), kit("a"),
    kit("b", { after: ["c"] }),
    kit("c", { after: ["nothing"] }),
    { id: "d", file: "d.js", api: "D" },
    { id: "e", vendor: { path: "/vendor/e.js" }, api: "e" },
    { id: "f", file: "f.js", build: { read: "f.js" } },
  ];
  const problems = assetProblems(broken, [{ id: "x", assets: ["g"] }]).join("\n");
  for (const expected of ['"a" is listed twice', '"b" loads after "c", which the list puts after it', '"c" loads after "nothing", which is no asset', '"d.js" does not say how it is made', '"e" needs its public path and its source', 'no report would keep the asset "f"', '"x" needs "g", which is no asset']) {
    assert.ok(problems.includes(expected), `${expected}\n${problems}`);
  }
}

// What an export's inline copy of each tag is (pipeline.mjs inlineReport): the element and the
// attribute come with the list, not from reading the tag's text.
for (const { id, tag, element, attribute } of kitTags) {
  assert.equal(element, tag.startsWith("<link") ? "style" : "script", `the inline element of ${id}`);
  assert.equal(attribute, ASSETS.find((asset) => asset.id === id).vendor ? "data-doc-vendor" : "data-doc-kit", `the inline attribute of ${id}`);
  assert.ok(tag.includes(`${attribute}="${id}"`), `${id}'s tag carries its mark`);
}

// The starter writes no kit tag (the render puts them in); the contract, where it still lists them,
// lists the tags of the list in its order, but those every report page gets (ui.js).
{
  const tagsIn = (file) => [...fs.readFileSync(path.join(projectRoot, file), "utf8").matchAll(/^\s*(<(?:link|script)[^>]*data-doc-(?:kit|vendor)=[^>]*>(?:<\/script>)?)\s*$/gm)].map((match) => match[1]);
  const added = new Set(ASSETS.filter((asset) => asset.added).map((asset) => asset.id));
  const tags = kitTags.filter(({ id }) => !added.has(id)).map(({ tag }) => tag);
  assert.deepEqual(tagsIn("src/render/starter/doc.html"), [], "src/render/starter/doc.html writes no kit tag");
  const contract = tagsIn("docs/report-contract.md");
  if (contract.length > 0) assert.deepEqual(contract, tags, "docs/report-contract.md");
}

// The tags a page needs are the render's to put in (withKitTags): a source writes none, and gets every
// one it needs, in the list's order, the stylesheets in its head before its own styles, the scripts in
// its body before its own script after its main (one that calls DocCharts.define runs once
// charts.js has), the reader's display settings (ui.js) only where its main has a data-doc-id;
// once, so a page with them is left as it is.
{
  const tag = (id) => kitTags.find((each) => each.id === id).tag;
  const tags = (ids, indent = "  ") => ids.map((id) => `${indent}${tag(id)}\n`).join("");
  const page = ({ head = "", main = "", after = "", id = ' data-doc-id="x"' } = {}) => `<!doctype html>\n<html lang="zh-CN">\n<head>\n  <meta charset="utf-8">\n  <title>t</title>\n${head}</head>\n<body>\n  <main class="doc-page"${id}>\n${main}  </main>\n${after}</body>\n</html>\n`;
  const style = "  <style>.mine { color: red; }</style>\n";
  const define = '  <script>\n    DocCharts.define("strip", ({ host }) => { host.textContent = "drawn"; });\n  </script>\n';
  const card = '    <figure class="doc-figure"><h3>卡</h3><div data-doc-chart="strip"><script type="application/json">[1]</script></div></figure>\n';
  const base = ["runtime", "state", "tokens", "ui"];
  const written = page({ head: style, main: card, after: define });
  const shown = withKitTags(written);
  assert.equal(shown, page({ head: tags(["styles"]) + style, main: card, after: tags(["runtime", "state", "tokens", "ui", "charts"]) + define }), shown);
  assert.equal(withKitTags(shown), shown, "put in once");
  // A chart drawn with D3 (its script names d3): D3 loaded before the charts.
  const drawnWithD3 = '  <script>\n    DocCharts.define("strip", ({ host }) => { d3.select(host).append("svg"); });\n  </script>\n';
  assert.equal(withKitTags(page({ main: card, after: drawnWithD3 })), page({ head: tags(["styles"]), main: card, after: tags(["runtime", "state", "tokens", "ui", "d3", "charts"]) + drawnWithD3 }), "D3 where the script names it");
  assert.deepEqual(tagFailures(written), [], "the checks ask a source for no tag");
  assert.deepEqual(tagFailures(shown), [], "and pass the page as shown");
  // No script of its own: the scripts at the body's end; no style of its own: the stylesheets at the head's end.
  assert.equal(withKitTags(page()), page({ head: tags(["styles"]), after: tags(base) }));
  assert.equal(withKitTags(page({ id: "" })), page({ head: tags(["styles"]), after: tags(["runtime", "state", "tokens"]), id: "" }), "no data-doc-id: no ui.js");
  // A script in the main leaves the kit's scripts after the main, even one that names a global of the kit
  // (the checks tell it to move, earlyScriptFailures): charts.js starts each card as the parser reaches
  // it, so a card below the kit's scripts could start half read.
  const inMain = '    <script>DocCharts.define("strip", () => {});</script>\n';
  assert.equal(withKitTags(page({ main: card + inMain })), page({ head: tags(["styles"]), main: card + inMain, after: tags(["runtime", "state", "tokens", "ui", "charts"]) }), "never in the main");
  const widget = "    <script>document.currentScript.remove();</script>\n";
  assert.equal(withKitTags(page({ main: widget, after: define })), page({ head: tags(["styles"]), main: widget, after: tags(["runtime", "state", "tokens", "ui", "charts"]) + define }));
  // A script in an <svg> is the SVG's, which loads no src: the kit's go before the <svg> (as before an
  // HTML script in one, in its <foreignObject>), still ahead of every script after the main.
  const svg = '  <svg width="1" height="1"><script>/* its own */</script></svg>\n';
  assert.equal(withKitTags(page({ after: svg + define })), page({ head: tags(["styles"]), after: tags(["runtime", "state", "tokens", "ui", "charts"]) + svg + define }), "before the <svg>");
  const foreign = '  <svg><foreignObject><div><script>/* its own */</script></div></foreignObject></svg>\n';
  assert.equal(withKitTags(page({ after: foreign })), page({ head: tags(["styles"]), after: tags(base) + foreign }), "before the <svg> of a <foreignObject>");
  // A page that writes no <head> and no </body>, as a browser still reads it, and line ends of its own.
  assert.equal(withKitTags('<title>t</title><main class="doc-page" data-doc-id="x"><p>x</p></main>'),
    `<title>t</title>\n${tag("styles")}<main class="doc-page" data-doc-id="x"><p>x</p></main>\n${base.map(tag).join("\n")}`);
  const crlf = page({ after: define }).replace(/\n/g, "\r\n");
  assert.ok(!/[^\r]\n/.test(withKitTags(crlf)), "CRLF stays CRLF");
  // An older source that writes the tags keeps them, and what it lacks goes among those of its kind: after
  // the last the list puts before it, else before the first; never a script among its stylesheets.
  const old = page({ head: tags(["styles", "katex-styles"]), main: card, after: tags(["runtime", "state", "tokens", "ui", "charts"]) + define });
  assert.equal(withKitTags(old), old, "an older source with every tag it needs");
  const charts = page({ main: card, after: tags(["charts"]) + define });
  assert.equal(withKitTags(charts), page({ head: tags(["styles"]), main: card, after: tags(["runtime", "state", "tokens", "ui", "charts"]) + define }), "missing ones before the first written");
  const styled = page({ head: tags(["styles"]), main: card, after: define });
  assert.equal(withKitTags(styled), page({ head: tags(["styles"]), main: card, after: tags(["runtime", "state", "tokens", "ui", "charts"]) + define }), "only stylesheets written: the scripts in the body");
  // Loaded from elsewhere (`href`: the preview server's stamps, src/server/stamps.mjs): the tags it puts
  // in and those the page writes as the kit writes them, where they are; nothing else changes.
  const stamped = (asset) => `${asset.file ? `/kit/${asset.file}` : asset.vendor.path}?v=0123456789abcdef`;
  const unstamp = (html) => html.replaceAll("?v=0123456789abcdef", "");
  for (const source of [written, charts, styled, old]) {
    const elsewhere = withKitTags(source, { href: stamped });
    assert.equal(unstamp(elsewhere), withKitTags(source), "the same page but for where the tags load from");
    assert.equal(elsewhere.split("?v=0123456789abcdef").length - 1, (withKitTags(source).match(/data-doc-(kit|vendor)=/g) ?? []).length, "every tag of the kit's");
  }
  const otherwise = page({ head: '  <link href="/kit/report.css" rel="stylesheet">\n', main: card, after: define });
  assert.ok(withKitTags(otherwise, { href: stamped }).includes('<link href="/kit/report.css" rel="stylesheet">'), "one written otherwise is left as it is (the checks name it)");
}

// A report shown, the preview's page and a build's file alike (render/report-html.mjs): one chain, so the
// unused tags go, the reader's display settings come, and the page's icon is a picture, in both modes.
{
  const tag = (id) => kitTags.find((each) => each.id === id).tag;
  const page = `<html><head>\n  ${tag("runtime")}\n  ${tag("d3")}\n</head><body><main class="doc-page" data-doc-id="x"><header class="doc-header"><div class="doc-icon">🎯</div><h1 class="doc-title">T</h1></header></main></body></html>`;
  for (const mode of ["preview", "export"]) {
    const { html, removed } = renderReportHtml(page, { slug: "x", mode });
    assert.deepEqual(removed, ["d3"], mode);
    assert.ok(!html.includes(tag("d3")) && html.includes('data-doc-kit="ui"'), `${mode}: the unused tag gone, the display settings added`);
    assert.match(html, /<div class="doc-icon"[^>]*><img alt="🎯" src="data:image\/svg\+xml;base64,/, `${mode}: the icon a picture`);
  }
  assert.ok(renderReportHtml(page, { slug: "x", mode: "preview" }).html.includes('data-ge-icon="🎯"'), "the preview says the value");
  assert.ok(!renderReportHtml(page, { slug: "x" }).html.includes("data-ge-icon"), "an export does not");
  const bare = '<html><head><title>T</title></head><body><main class="doc-page" data-doc-id="x"><div data-doc-chart="dots"></div></main></body></html>';
  for (const mode of ["preview", "export"]) {
    const { html, removed } = renderReportHtml(bare, { slug: "x", mode });
    assert.ok(removed.length === 0 && ["styles", "runtime", "state", "tokens", "ui", "charts"].every((id) => html.includes(tag(id))) && !html.includes(tag("tables")) && !html.includes(tag("d3")), `${mode}: a page that writes no tag is shown with those it needs (no D3 its script does not name)`);
  }
}

// An older file given the tags its blocks now need (a Sheet area the page editor made: sheets.js), each
// after the tags the list puts before it; nothing for one with no kit tags of that kind (the render puts
// them in), or lacking none.
{
  const tag = (id) => kitTags.find((each) => each.id === id).tag;
  const page = (tags, body) => `<html><head></head><body><main class="doc-page" data-doc-id="x">${body}</main>\n  ${tags.map(tag).join("\n  ")}\n</body></html>`;
  const area = '<section class="doc-sheet-shell" data-doc-sheets="t"><div class="doc-sheet-tabs"><button class="doc-sheet-tab" type="button" data-sheet-tab="a">A</button></div><div data-doc-sheet="a"></div></section>';
  const lacking = page(["runtime", "state", "tokens", "dialogs"], area);
  const given = withNeededKitTags(lacking);
  assert.ok(given.includes(`${tag("state")}\n  ${tag("sheets")}\n  ${tag("tokens")}`), given);
  assert.deepEqual(tagFailures(given).filter((failure) => failure.includes("sheets")), [], "the checks are content");
  assert.equal(withNeededKitTags(given), given, "nothing lacking: nothing added");
  assert.equal(withNeededKitTags(page([], area)), page([], area), "no kit tags: none added");
  const styled = page([], area).replace("<head></head>", `<head>${tag("styles")}</head>`);
  assert.equal(withNeededKitTags(styled), styled, "only the stylesheets written: no script among them");
  assert.equal(withNeededKitTags(page(["runtime", "state", "tokens"], "<p>x</p>")), page(["runtime", "state", "tokens"], "<p>x</p>"), "no block needing more");
}

// Which assets a report uses: its components' patterns, in its text outside comments and code
// samples, and the globals the code of its scripts names, outside their comments.
{
  const optional = ASSETS.filter((asset) => !asset.always && !asset.added).map((asset) => asset.id);
  const used = (body) => optional.filter((id) => usedAssets(`<main>${body}</main>`).has(id));
  const math = ["katex-styles", "katex", "katex-auto-render", "math"];
  const cases = [
    ["<p>text</p>", []],
    ['<div class="doc-code"><div class="doc-code-title"></div><pre><code>x</code></pre></div>', ["code"]],
    ["<pre>plain</pre>", []],
    ['<div class="doc-diff"></div>', ["code"]],
    ["<p>\\(x^2\\)</p>", ["katex-styles", "katex", "katex-auto-render", "math"]],
    ["<script>DocMath.render(document.body)</script>", ["katex-styles", "katex", "katex-auto-render", "math"]],
    ["<section data-doc-sheets></section>", ["sheets"]],
    ['<a class="doc-dialog-trigger" href="#d">d</a>', ["dialogs"]],
    ['<div data-doc-chart="dots"></div>', ["charts"]],
    ["<script>DocCharts.define('x', () => {})</script>", ["charts"]],
    ["<script>DocCharts.define('x', ({ host }) => d3.select(host))</script>", ["d3", "charts"]],
    ["<script>d3.select('#x')</script>", ["d3"]],
    ["<table><tr><td>1</td></tr></table>", ["tables"]],
    // What only a comment, prose or a code sample names keeps nothing (a script's comment naming
    // DocCharts: D3 and the charts are 325 KB; a code sample's \[ or $$ KaTeX's 0.7 MB).
    ["<script>\n  // A chart type of the document's own goes here (DocCharts.define, docs/components/custom-chart.md)\n</script>", []],
    ["<script>/* DocCharts.define */ /** @type {DocTables} */ const x = 1;</script><!-- DocCharts, d3 -->", []],
    ["<p>Drawn with d3, not DocCharts.</p>", []],
    ['<div class="doc-code"><div class="doc-code-title"></div><pre><code>\\[x\\] = $$y$$ and \\(z\\)</code></pre></div>', ["code"]],
    ["<p>inline <code>$$</code>, <!-- \\(x\\) --></p><textarea>\\[</textarea><style>/* \\( */</style><select><option>\\(a<option>b</select>", []],
    ['<div data-doc-chart="dots"><script type="application/json">{"title": "$ \\\\(x\\\\)", "note": "DocMath"}</script></div>', ["charts"]],
    // What runs keeps what it names, written in any way a browser runs it.
    ["<script>/* a chart of its own */\nDocCharts.define('x', () => {})</script>", ["charts"]],
    ['<script>const link = "https://x//DocCharts";</script>', ["charts"]],
    ["<script>const scheme = /https?:\\/\\//; DocCharts.define('x', () => {})</script>", ["charts"]],
    ['<script type="module">window["DocTables"]</script>', ["tables"]],
    ['<template><script>DocDialogs.open("d")</script></template>', ["dialogs"]],
    ['<button type="button" onclick="DocCharts.get(this)">b</button>', ["charts"]],
    ['<a href="javascript:DocMath.render(document.body)">a</a>', math],
    ['<a href="java&#9;script:DocCharts.get()">a</a>', ["charts"]],
    ['<a href="&#1; JavaScript&#10;:DocCharts.get()">a</a>', ["charts"]],
    // A script may write formulas and blocks into the page: its text counts as the page's.
    ['<script>document.body.insertAdjacentHTML("beforeend", "<p>\\\\(x\\\\)</p>")</script>', math],
    // A block the parser puts in a code sample (its tags written there, or one left open) is the
    // page's, as a browser shows it; one written escaped is a sample.
    ['<pre><div data-doc-chart="dots"></div></pre>', ["charts"]],
    ['<code><table class="doc-table"><tr><td>1</td></tr></table></code>', ["tables"]],
    ['<pre>open<div class="doc-card"><div data-doc-chart="dots"></div></div><table><tr><td>\\(x\\)</td></tr></table>', ["charts", "tables"]],
    ['<dialog class="doc&#45;dialog"></dialog>', ["dialogs"]], // found by its match, as the checks find it
    ['<pre><code>&lt;div data-doc-chart="dots"&gt;&lt;/div&gt;</code></pre>', []],
    // A template in an <svg> holds its children as any element does.
    ["<svg><template><text>x</text></template></svg>", []],
  ];
  for (const [body, expected] of cases) assert.deepEqual(used(body), expected, body);
  // The tags themselves never count (the D3 tag names d3).
  const all = `<head>${kitTags.map(({ tag }) => tag).join("\n")}</head><main><p>text</p></main>`;
  assert.deepEqual(pruneUnusedKitTags(all).removed, optional);
}

// What the checks ask of the tags a source writes: nothing of one that writes none, or lacks some (the
// render puts them in); each written as the kit's own tag (one written otherwise would stay linked in an
// export), once, and in the order their `after` lists ask, each with its line.
{
  const tags = (ids) => kitTags.filter(({ id }) => ids.includes(id)).map(({ tag }) => tag).join("\n");
  const base = ["styles", "runtime", "state", "tokens", "ui"];
  assert.deepEqual(tagFailures(`${tags(base)}<main></main>`), []);
  assert.deepEqual(tagFailures("<main><section data-doc-sheets></section><script>DocSheets.get('#s'); DocCharts.define('x', () => {});</script></main>"), [], "none written");
  assert.deepEqual(tagFailures(`${tags(["runtime", "state", "tokens", "charts"])}<main><div data-doc-chart="dots"></div><dialog class="doc-dialog"></dialog></main>`), [], "some written");
  assert.deepEqual(tagFailures('<head><link href="/kit/report.css" rel="stylesheet">\n<script src="/kit/runtime.js"></script></head><main></main>'), [
    `line 1: /kit/report.css is not loaded by the kit's own tag, ${tags(["styles"])}: take the tag out (the kit's tags are put in as the document is shown and exported)`,
    `line 2: /kit/runtime.js is not loaded by the kit's own tag, ${tags(["runtime"])}: take the tag out (the kit's tags are put in as the document is shown and exported)`,
  ]);
  assert.deepEqual(tagFailures(`${tags(["runtime"])}\n<main></main>\n${tags(["runtime"])}`), ["/kit/runtime.js is loaded 2 times (lines 1, 3): keep one tag, or none"]);
  assert.deepEqual(tagFailures(`<!-- ${tags(["charts"])} --><template>${tags(["d3"])}</template><main><pre><code>&lt;script src="/kit/x.js"&gt;</code></pre></main>`), [], "what a comment, a template or a sample holds loads nothing");
  const swapped = tags(base).replace(/(<script[^\n]*"state"><\/script>)\n(<script[^\n]*"tokens"><\/script>)\n(<script[^\n]*"ui"><\/script>)/, "$3\n$1\n$2");
  assert.deepEqual(tagFailures(`${swapped}<main></main>`), ["line 3: /kit/state.js (line 4) must load before /kit/ui.js", "line 3: /kit/tokens.js (line 5) must load before /kit/ui.js"]);
  // A component's markup, as a script calling its global, gets its assets from the render.
  const samples = {
    dialog: '<dialog class="doc-dialog"></dialog>',
    sheets: "<section data-doc-sheets></section>",
    chart: '<div data-doc-chart="dots"></div>',
    table: '<table class="doc-table"></table>',
    code: '<div class="doc-code"><div class="doc-code-title"></div><pre><code>x</code></pre></div>',
    diff: '<div class="doc-diff"></div>',
    math: '<div class="doc-math-block"></div>',
  };
  for (const component of COMPONENTS.filter((entry) => entry.match && entry.assets)) {
    assert.ok(samples[component.id], `a sample of ${component.id}`);
    const shown = withKitTags(`<html><head></head><body><main class="doc-page" data-doc-id="x">${samples[component.id]}</main></body></html>`);
    for (const id of component.assets) assert.ok(shown.includes(tags([id])), `${component.id}: ${id}\n${shown}`);
  }
  assert.ok(withKitTags("<main><button onclick=\"DocDialogs.open('d')\">b</button></main>").includes(tags(["dialogs"])), "a handler's global");
}

// A script that names a global of the kit stands after the kit's script defining it: one in the head,
// before the main or in it is told to move after </main> (the render puts the kit's scripts there), one
// before a tag an older source writes to move after that tag. Broad on purpose: a name in a function
// counts too. A module (it runs once the page is read), a name in a comment and a script after the
// main (one in an <svg> too) are none. Each with its line.
{
  const tag = (id) => kitTags.find((each) => each.id === id).tag;
  const page = ({ head = "", main = "", after = "" } = {}) => `<!doctype html>\n<html>\n<head>\n<title>t</title>\n${head}</head>\n<body>\n<main class="doc-page" data-doc-id="x">\n${main}</main>\n${after}</body>\n</html>\n`;
  const define = '<script>DocCharts.define("strip", () => {}); DocState.create("x");</script>\n';
  const move = (line, names) => `line ${line}: this script names ${names} before the kit's scripts load (they are put in after </main>): move the script after </main>`;
  assert.deepEqual(earlyScriptFailures(page({ after: define })), [], "after the main");
  assert.deepEqual(earlyScriptFailures(page({ after: '<svg><script>DocCharts.get(document.body);</script></svg>\n' })), [], "in an <svg> after the main");
  assert.deepEqual(earlyScriptFailures(page({ main: `<p>x</p>\n${define}` })), [move(9, "DocState and DocCharts")], "in the main");
  assert.deepEqual(earlyScriptFailures(page({ head: define })), [move(5, "DocState and DocCharts")], "in the head");
  assert.deepEqual(earlyScriptFailures(page({ main: '<script>function later() { DocState.create("x"); }</script>\n' })), [move(8, "DocState")], "named in a function");
  assert.deepEqual(earlyScriptFailures(page({ main: '<script type="module">DocCharts.get(document.body);</script>\n<script>// DocCharts.define comes later\nconst x = 1;</script>\n' })), [], "a module, a comment");
  const scripts = ["runtime", "state", "tokens", "charts"].map((id) => `${tag(id)}\n`).join("");
  assert.deepEqual(earlyScriptFailures(page({ head: scripts, main: define })), [], "an older source's tags before it");
  assert.deepEqual(earlyScriptFailures(page({ main: define, after: scripts })), [
    "line 8: this script names DocState before /kit/state.js loads (line 11): move the script after that tag",
    "line 8: this script names DocCharts before /kit/charts.js loads (line 13): move the script after that tag",
  ], "an older source's tags after it");
}

// An export's inline copies of the kit are none of a source's (an exported file copied in as one would
// load the kit twice): each fails, with its line. The export makes them on the page's tree
// (withKitCopies): a tag a comment spells stays as it is and the element after it is inlined; a tag
// written again stays linked (the export refuses that).
{
  const tag = (id) => kitTags.find((each) => each.id === id).tag;
  const source = `<!doctype html>\n<html>\n<head>\n<title>t</title>\n</head>\n<body>\n<!-- ${tag("code")} -->\n<main class="doc-page" data-doc-id="x"><div class="doc-code"><div class="doc-code-title"></div><pre><code>x</code></pre></div></main>\n<script></script>\n</body>\n</html>\n`;
  const copy = ({ id, element, attribute }) => `<${element} ${attribute}="${id}-inline">/* ${id} */</${element}>`;
  const exported = withKitCopies(renderReportHtml(source, { slug: "x" }).html, copy);
  const inlined = ["styles", "runtime", "code", "state", "tokens", "ui"];
  assert.ok(exported.includes(`<!-- ${tag("code")} -->`) && inlined.every((id) => exported.includes(`data-doc-kit="${id}-inline"`)), exported);
  assert.ok(!kitTags.some((entry) => exported.replace(`<!-- ${tag("code")} -->`, "").includes(entry.tag)), `no tag left linked\n${exported}`);
  const twice = `<main></main>\n${tag("runtime")}\n${tag("runtime")}`;
  assert.equal(withKitCopies(twice, copy), `<main></main>\n<script data-doc-kit="runtime-inline">/* runtime */</script>\n${tag("runtime")}`);
  const failures = tagFailures(exported);
  assert.equal(failures.length, 1, failures.join("\n"));
  assert.match(failures[0], /^line 5: an export's inline copy of the kit \(data-doc-kit="styles-inline", and 5 more on lines \d+, \d+, \d+, \d+ and \d+\), which a document's source never holds .*: bring an exported file in with 导入 instead of copying it in$/);
  assert.match(tagFailures('<main></main>\n<script data-doc-vendor="d3-inline"></script>')[0], /^line 2: an export's inline copy of the kit \(data-doc-vendor="d3-inline"\), which/);
}

// In a whole report.
{
  const [gallery] = (await loadReports(["component-catalog"], { directory: path.join(projectRoot, "tests", "fixtures") })).reports;
  gallery.html = newNames(gallery.html); // as the tools read it: the Component Catalog is the user's, written in the kit's old names
  const failuresOf = (html) => checkReports([{ ...gallery, html }]).get("component-catalog") ?? [];
  assert.deepEqual(failuresOf(gallery.html), [], "the Component Catalog passes");
  assert.ok(!/data-doc-(?:kit|vendor)=/.test(gallery.html), "the Component Catalog writes no kit tag");
  const dialogs = '<script src="/kit/dialogs.js" data-doc-kit="dialogs"></script>';
  assert.ok(renderReportHtml(gallery.html, { slug: gallery.slug }).html.includes(dialogs), "the render puts in the tags it needs");
  // As an older source writes it, its tags and all, it passes too; misordered, it is told where.
  const written = withKitTags(gallery.html);
  assert.deepEqual(failuresOf(written), [], "with the tags written");
  assert.deepEqual(failuresOf(written.replace(`  ${dialogs}\n`, "")), [], "with one left out");
  const misordered = failuresOf(written.replace(`  ${dialogs}\n`, "").replace("<main", `${dialogs}\n<main`));
  assert.ok(misordered.some((failure) => /^line \d+: \/kit\/runtime\.js \(line \d+\) must load before \/kit\/dialogs\.js$/.test(failure)), misordered.join("\n"));
  // A script in the main that names a global of the kit is told to move after </main>.
  const early = failuresOf(gallery.html.replace(/(<main\b[^>]*>)/, '$1\n<script>DocState.create("gallery");</script>'));
  assert.ok(early.some((failure) => /^line \d+: this script names DocState before the kit's scripts load/.test(failure)), early.join("\n"));
  // A script that starts what markup starts now is told so (REMOVED in the pipeline).
  const scripted = failuresOf(gallery.html.replace("</body>", `<script>DocTables.enhanceAll(); DocDialogs.enhanceAll();</script>\n</body>`));
  for (const call of ["DocTables.enhanceAll", "DocDialogs.enhanceAll"]) assert.ok(scripted.some((failure) => failure.startsWith(`${call} is gone: `)), `${call}\n${scripted.join("\n")}`);
}

// report.json asks for a title, a description and a type, and nothing else: a report made from the
// starter has the type "report" and no language (the page's own <html lang> says it), one that
// carries a language loads too.
{
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "report-json-"));
  try {
    const { metadata } = await createReportFromStarter("made", "标题", "说明", { directory });
    const { created, ...starter } = metadata;
    assert.deepEqual(starter, { title: "标题", description: "说明", type: "report" }, "the starter's report.json: a neutral type, the Agent's to change");
    assert.ok(Math.abs(Date.now() - Date.parse(created)) < 60_000, "and when it was made (created), which a block reads");
    fs.cpSync(path.join(directory, "made"), path.join(directory, "kept"), { recursive: true });
    fs.writeFileSync(path.join(directory, "kept", "doc.json"), JSON.stringify({ ...metadata, language: "zh-CN" }));
    fs.cpSync(path.join(directory, "made"), path.join(directory, "bare"), { recursive: true });
    fs.writeFileSync(path.join(directory, "bare", "doc.json"), JSON.stringify({ title: "标题", description: "说明" }));
    const loaded = await loadReports([], { directory });
    assert.deepEqual([...loaded.reports.map((report) => report.slug)].sort(), ["kept", "made"], "reports with and without a language load");
    assert.deepEqual([...loaded.failures], [["bare", ["doc.json is missing a non-empty type."]]], "a missing type still fails");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

console.log(`Checked shared assets: the list of ${ASSETS.length} (its checks, the kit files made from it, a starter with no tag and the contract's tags), which a report uses, the tags the render puts in (where, in what order, among an older source's; never in the main nor in an <svg>; loaded from where the preview names them, its own and the source's alike), what the checks ask of the tags a source writes (the kit's own, once, in order, no export's copy) and of a script naming the kit's globals (after the kit's scripts), and an export's copies made on the tree.`);
