import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import { applyEdits, commitEdits, findBlocks, findUnits, handedInSource, instrument, naturalize, readOnlyTexts, shownSource, writingNotes } from "../../src/editor/source.mjs";
import { BOXED, COMPONENT_ATTRIBUTES, COPIED_AS_ITSELF, HOSTS, UNIT_KINDS, ownerOf } from "../../src/editor/components/registry.mjs";
import { currentCatalog, forgetCatalog } from "../../src/shared/component-catalog.mjs";
import { chartDeclarationFailures } from "../../src/render/chart-declarations.mjs";
import { componentFailures, componentNotes } from "../../src/render/component-checks.mjs";
import { packagesOf } from "../../src/render/package-files.mjs";
import { parseReport } from "../../src/render/report-tree.mjs";
import { newNames } from "../../src/shared/new-names.mjs";
import { componentAt, heldBy, heldWithin, slotsIn } from "../../src/shared/components/installed.mjs";
import { LOOK_CLASSES, SOURCE_ATTRIBUTES, lookChanged } from "../../src/shared/component-source.mjs";
import { CELL_LOOKS } from "../../src/editor/components/table/index.mjs";
import table from "../../src/shared/components/table.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";

// An instance of a component package (src/shared/components/installed.mjs): the
// boundary holds through every system, with no package installed as with one.

const page = (body, head = "") => `<!doctype html>
<html lang="zh-CN">
<head><title>t</title>${head}</head>
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

// Natural HTML of every rule's, and old names, which naturalize takes anywhere but in an instance.
const INSIDE = `
      <p>词 \\(x^2\\) 和 <mark>标记</mark> <kbd>k</kbd> <span style="color: red">红</span></p>
      <p>\\[ y \\]</p>
      <pre>code</pre>
      <figure><img src="a.png" width="300"><figcaption>图</figcaption></figure>
      <img src="b.png" alt="">
      <table><caption>说明</caption><tr><th>头</th></tr><tr><td>格</td></tr></table>
      <table data-doc-chart="slope"><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>2</td></tr></table>
      <details><summary>题</summary>词</details>
      <aside>旁注</aside>
      <ul class="contains-task-list"><li class="task-list-item"><input type="checkbox" class="task-list-item-checkbox"> 待办</li></ul>
      <ol data-flow><li>步骤</li></ol>
      <section data-doc-sheets="views"><section><h2>甲</h2><p>一</p></section></section>
      <p><a class="doc-bookmark" href="https://example.com">书签</a></p>
      <dialog id="inner"><h2>卡片</h2>词</dialog>
      <dialog class="doc-dialog" id="old"><div class="doc-dialog-panel"><div class="doc-dialog-header"><h3 class="doc-dialog-title">旧</h3></div><div class="doc-dialog-content"><p>词</p></div></div></dialog>
      words straight in it, then a line\u2028separator
      <div class="report-note" data-report-kind="old">旧名字</div>
      <style>.report-note { color: var(--report-accent); }</style>
      <script>ReportKit.mount();</script>
    `;
const instance = `<div class="board" data-doc-component="local/board" data-block-id="a3f18b2c">${INSIDE}</div>`;

// What stands in an instance, as a file holds it.
const insideOf = (text) => text.slice(text.indexOf(INSIDE), text.indexOf(INSIDE) + INSIDE.length);

// ---------- the definition ----------
assert.equal(UNIT_KINDS[0].kind, "installed", "ranked ahead of every other rule");
assert.ok(UNIT_KINDS.slice(1).every((rule) => rule.kind !== "installed"));
assert.ok(BOXED.has("installed") && COPIED_AS_ITSELF.has("installed") && HOSTS.installed && COMPONENT_ATTRIBUTES.includes("data-doc-component"));

// ---------- the units and the text blocks ----------
{
  // On a div or a section, whatever class it carries: what it is goes before the class.
  const source = page(`<div data-doc-component="local/a"><p>甲</p></div>
    <section class="doc-section" data-doc-component="local/b"><h2>乙</h2><p>丙</p></section>
    <div class="doc-panel" data-doc-component="local/c"><p>丁</p></div>
    <p>戊</p>`);
  const { units, boxes } = findUnits(source);
  assert.deepEqual(units.filter(({ kind }) => kind === "installed").length, 3, "each an instance");
  assert.deepEqual(units.map(({ kind }) => kind), ["installed", "installed", "installed", "paragraph"], "a block of its own, no block in it");
  assert.ok(!boxes.some(({ kind }) => kind === "section" || kind === "highlight"), "no box");
  assert.deepEqual(findBlocks(source).map(({ kind }) => kind), ["title", "flow"], "with no package, no text block in it");
}
{
  // The walks of the scan that go past a flow stop at one too.
  const held = page(`<figure class="doc-figure"><div data-doc-component="local/a"><table><tr><td>格</td></tr></table></div></figure>
    <details class="doc-details"><summary class="doc-details-summary"><span class="doc-details-summary-label">题</span></summary><div data-doc-component="local/a"><p>甲</p></div></details>
    <figure class="doc-figure"><div data-doc-chart="x"><div data-doc-component="local/a"><table><tr><td>格</td></tr></table></div></div></figure>`);
  assert.deepEqual(findBlocks(held).filter(({ kind }) => kind === "cell" || kind === "flow" || kind === "text"), [], "no cell, no paragraph");
}

// ---------- naturalize ----------
{
  const source = page(`<p>外面 \\(y\\) <a href="#inner">链接</a></p>\n    ${instance}\n    <pre>outside</pre>`);
  const { text, changes } = naturalize(source);
  assert.equal(insideOf(text), INSIDE, "byte for byte");
  assert.ok(text.includes('<span class="doc-math-inline">\\(y\\)</span>') && text.includes('class="doc-code"'), "what stands around it is taken in");
  assert.ok(text.includes('<a href="#inner">链接</a>'), "a card in an instance is no detail card");
  assert.ok(!changes.some(({ rule }) => rule === "dialog link"));
  assert.equal(insideOf(shownSource(source).text), INSIDE, "as a page sees it");
  assert.equal(insideOf(handedInSource(source, {}).text), INSIDE, "as a hand-in writes it");
}
{
  // Nothing in it is a word of old names, naturalize's first step.
  assert.equal(insideOf(newNames(page(`<div class="report-x">外</div>${instance}`))), INSIDE);
  assert.ok(newNames(page(`<div class="report-note">外</div>${instance}`)).includes('<div class="doc-note">外</div>'));
  // A detail card outside main in an instance stays where it is.
  const outside = page(`<p>词</p>`).replace("</main>", `</main>\n  ${instance}`);
  assert.equal(insideOf(naturalize(outside).text), INSIDE);
}
{
  // On no tag of the rule's, the attribute makes no instance: a paragraph is a paragraph.
  const text = page('<p data-doc-component="local/a">词</p>');
  assert.deepEqual(findUnits(text).units.map(({ kind }) => kind), ["paragraph"]);
}

// ---------- what the Agent is told ----------
{
  const source = page(instance);
  assert.deepEqual(readOnlyTexts(source), [], "nothing in it is text the preview leaves read-only");
  assert.deepEqual(writingNotes(source), [], "nothing in it is a block to say anything of");
}

// ---------- the checks ----------
{
  // What it holds is checked by nothing but the kit's own names, closed there too: all the rules of the
  // kit's markup above are no rule of its, whatever class says so, and its old names are its own.
  const failures = (body) => componentFailures(page(body)).map((failure) => failure.replace(/ \(line \d+\)/, "").replace(/:.*/, ""));
  assert.deepEqual(failures(instance), ["class doc-dialog-header is gone", "class doc-dialog-title is gone"], "a name the kit gave up stays closed");
  assert.deepEqual(chartDeclarationFailures(page(instance)), [], "a chart's mark in it declares nothing");
  assert.deepEqual(failures('<div data-doc-component="local/gone"><div class="doc-code"></div><div class="doc-panel"><pre>x</pre></div><span data-doc-bind="k">词</span><a class="doc-bookmark" href="https://example.com">书签</a></div>'), [], "parts, a pre in a flow and a bind");
  assert.deepEqual(failures('<section class="doc-section" data-doc-component="local/gone"><h2>乙</h2><pre>x</pre></section>'), [], "its own class is no flow");
  assert.deepEqual(failures('<div class="doc-code" data-doc-component="local/gone" data-start="x"></div>'), [], "nor a component");
  assert.deepEqual(failures('<div class="report-note" data-doc-component="local/gone"><p class="report-kept">词</p></div>'), [], "report-* is no name of the kit's there");
  assert.deepEqual(failures('<div class="doc-nothing" data-doc-component="local/gone"><p class="doc-nowhere" data-doc-nothing="">词</p></div>'), ["class doc-nothing is no class of the kit's", "class doc-nowhere is no class of the kit's", "data-doc-nothing is no attribute of the kit's"], "doc-* is, on it and in it");
  assert.deepEqual(failures('<div data-doc-component="local/gone"><p data-doc-show="k:v">词</p><p data-doc-component="kanban">词</p><div data-doc-component="other/inner"></div></div>'), [], "what it holds of an instance is none");
  assert.deepEqual(failures('<div data-doc-component="local/gone"><select data-doc-bind="k"></select></div><p data-doc-show="k:v">词</p>'), ['data-doc-show="k'], "and a key bound in it binds nothing outside it, as the kit starts no bind there");
  assert.deepEqual(componentNotes(parseReport(page('<div data-doc-component="local/gone"><div data-doc-component="local/inner"></div></div>'))).length, 1, "one note, of the instance the kit marks");
}

// ---------- whose it is on the page ----------
{
  const { document } = new JSDOM('<main><div data-doc-component="local/a"><h3 data-ge-kind="installed">题</h3><div class="doc-code"><pre>x</pre></div></div></main>').window;
  assert.equal(ownerOf(document.querySelector("h3")), "installed", "a text part is its");
  assert.equal(ownerOf(document.querySelector("pre")), "installed", "and so is all else, whatever its class");
}

// ---------- the text parts ----------
{
  // A workspace of the test's own: the fixtures' package, and a manifest of each shape the test needs.
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-catalog-"));
  fs.cpSync(path.join(projectRoot, "tests", "fixtures", "components"), path.join(root, "components"), { recursive: true });
  const write = (id, parts) => {
    fs.mkdirSync(path.join(root, "components", id), { recursive: true });
    fs.writeFileSync(path.join(root, "components", id, "component.json"), JSON.stringify({ id, apiVersion: 1, version: "1.0.0", name: { zh: "件", en: "Piece" }, description: { zh: "一件", en: "A piece" }, parts }));
    forgetCatalog(root);
  };
  write("local/bom", { a: { at: ":scope > h3", edit: "text" } });
  const workspace = process.env.GALLERY_DEFAULT_WORKSPACE;
  process.env.GALLERY_DEFAULT_WORKSPACE = root;
  try {
    assert.deepEqual(packagesOf('<div data-doc-component="local/strip"></div><div data-doc-component=local/gone></div>').map(({ id }) => id), ["local/strip"]);
    assert.deepEqual(packagesOf('<DIV DATA-DOC-COMPONENT=local/strip></DIV>').map(({ id }) => id), ["local/strip"], "HTML reads a tag and a name in any case");

    const body = `<div class="strip" data-doc-component="local/strip" data-block-id="a3f18b2c">
      <h3>本周指标</h3>
      <p class="strip-caption">截至周五</p>
      <dl><dt>收入</dt><dd>12</dd></dl>
      <p>不是它声明的</p>
      <div data-doc-component="local/bom"><h3>里面的</h3></div>
    </div>`;
    const source = page(body);
    const blocks = findBlocks(source);
    assert.deepEqual(blocks.map(({ kind, tag }) => [kind, tag]), [["title", "h1"], ["installed", "h3"], ["installed", "p"]], "the parts it declares as text, and nothing else: no part of it in another instance");
    write("local/anywhere", { a: { at: "p.any", edit: "text" } });
    assert.deepEqual(findBlocks(page('<div data-doc-component="local/anywhere"><p class="any">甲</p><div data-doc-component="local/strip"><p class="any">乙</p></div></div>')).filter(({ kind }) => kind === "installed").length, 1, "an inner instance's is its own, a selector for any descendant or not");
    const unit = findUnits(source).units[0];
    assert.equal(blocks[1].unit, unit.id, "they belong to the instance");
    assert.equal(blocks[1].self, null);
    assert.deepEqual(blocks[1].path, ["unit", ["h3", 0, 1]]);
    assert.deepEqual(Object.keys(blocks[1].caps).sort(), ["empty", "links"], "words, emptied but never split, joined or taken out");
    assert.deepEqual(findBlocks(page('<div data-doc-component="local/gone"><h3>词</h3></div>')).map(({ kind }) => kind), ["title"], "no package, no text part");
    assert.deepEqual(findBlocks(page('<section data-doc-component="local/strip"><h3>词</h3></section>')).map(({ kind }) => kind), ["title", "installed"], "on a section too");

    // What no part can be: an element the parser implied, and a part in another.
    write("local/odd", { body: { at: ":scope > table > *", edit: "text" }, title: { at: "h3", edit: "text" }, word: { at: "b", edit: "text" } });
    assert.deepEqual(findBlocks(page('<div data-doc-component="local/odd"><table><tr><td>格</td></tr></table><h3>题<b>词</b></h3></div>')).map(({ kind, tag }) => [kind, tag]), [["title", "h1"], ["installed", "h3"]]);

    // What holds no text stays out of a part that names no tag: a selector finds it, and no block comes of it.
    write("local/hidden", { a: { at: ".part", edit: "text" } });
    assert.deepEqual(findBlocks(page('<div data-doc-component="local/hidden"><script class="part">let a;</script><style class="part">.a {}</style><p class="part">词</p></div>')).filter(({ kind }) => kind === "installed").map(({ tag }) => tag), ["p"]);

    // A word on its way as the package changes: a text part its package no longer edits is no block
    // of the file's, in an instance that is as the page has it. The commit says so, for the page to
    // say it; an instance an Agent changed is a change of structure, as any.
    {
      write("local/moved", { title: { at: ":scope > h3", edit: "text" } });
      const opened = page('<div data-doc-component="local/moved" data-block-id="a3f18b2c"><h3>标题</h3></div>');
      const { map } = instrument(opened);
      const block = map.blocks.find(({ kind }) => kind === "installed");
      const { hash } = map.units[block.unit];
      const commit = (current) => commitEdits({ current, opening: opened, texts: [{ key: "t", block: { unit: { key: "u", id: "a3f18b2c", hash }, path: block.path, before: "标题" }, parts: [{ keep: true, html: "标题甲" }] }] });
      assert.equal(commit(opened).texts[0].status, "applied", "as it stood");
      write("local/moved", {});
      assert.deepEqual(commit(opened).texts.map(({ status, reason }) => [status, reason]), [["conflict", "package"]], "no such part any more");
      fs.rmSync(path.join(root, "components", "local", "moved"), { recursive: true });
      forgetCatalog(root);
      assert.equal(commit(opened).texts[0].reason, "package", "no such package");
      assert.equal(commit(opened.replace("<h3>标题</h3>", "<h3>标题</h3><p>加的</p>")).texts[0].reason, "structure", "the instance changed");
    }

    // A part declared as text that can be no text block: read-only on the page, and the Agent is told.
    write("local/blocky", { a: { at: ":scope > .blocky", edit: "text" }, b: { at: ":scope > h3", edit: "text" } });
    assert.deepEqual(readOnlyTexts(page('<div data-doc-component="local/blocky"><div class="blocky"><p>甲</p></div><h3>题</h3><p class="own">它自己的</p></div>')).map((note) => note.replace(/^line \d+: /, "")), ["<div>: a block (<p>) amid the words: give the words a paragraph of their own"]);

    // Any element, a list and a chain to any element read as a browser reads them, in the file's
    // order, an element two parts name being one text block, and an instance in it none of them.
    const parts = (name, at, body) => {
      write(`local/${name}`, { a: { at, edit: "text" }, b: { at: "h4", edit: "text", optional: true } });
      const source = page(`<div data-doc-component="local/${name}">${body}</div>`);
      assert.deepEqual(componentFailures(source), [], at);
      return findBlocks(source).filter(({ kind }) => kind === "installed").map(({ tag }) => tag);
    };
    const three = "<h3>一</h3><h4>二</h4><p>三</p>";
    assert.deepEqual(parts("every-child", ":scope > *", three), ["h3", "h4", "p"]);
    assert.deepEqual(parts("every-element", "*", three), ["h3", "h4", "p"]);
    assert.deepEqual(parts("every-grandchild", ":scope > div > *", `<div><h3>一</h3></div><p>二</p>`), ["h3"]);
    assert.deepEqual(parts("a-list", ":scope > p, :scope > h3", three), ["h3", "h4", "p"], "in the file's order");
    assert.deepEqual(parts("a-mixed-list", "p, :scope > h3", "<div><p>一</p></div><h3>二</h3>"), ["p", "h3"]);
    assert.deepEqual(parts("no-inner", ":scope > *", '<h3>一</h3><div data-doc-component="local/strip">词</div>'), ["h3"], "an instance in it is no part of it");

    // The checks: an instance of a package by its parts, one of none by a note.
    const failures = (body) => componentFailures(page(body));
    assert.deepEqual(failures(fs.readFileSync(path.join(root, "components", "local", "strip", "example.html"), "utf8")), [], "the fixtures' example");
    assert.deepEqual(failures('<div data-doc-component="local/strip"><h3>题</h3><dl></dl></div>'), []);
    assert.deepEqual(failures('<div data-doc-component="local/strip"><dl></dl></div>'), ["local/strip (line 9) has no title (h3)"]);
    assert.deepEqual(failures('<div data-doc-component="local/strip"><h3>一</h3><dl></dl></div><section data-doc-component="local/strip"><h3>二</h3></section>'), ["local/strip (line 9) has no metrics (dl)"], "each instance, an optional part left out");
    assert.deepEqual(failures('<div data-doc-component="local/gone"><span>自由的内部</span><pre>x</pre></div>'), [], "an instance of no package is no failure");
    assert.deepEqual(componentNotes(parseReport(page('<div data-doc-component="local/gone"><p>词</p></div><div data-doc-component="local/strip"><h3>题</h3><dl></dl></div>'))), ['line 9: <div data-doc-component="local/gone">: no package local/gone in this workspace (components/local/gone/component.json): the block shows what it holds, read-only, and moves, copies and deletes whole']);
    assert.deepEqual(componentNotes(parseReport(page("<p>词</p>"))), []);
    assert.deepEqual(failures('<p data-doc-component="local/strip">词</p>'), ["data-doc-component (line 9) on a <p>: an instance of a component is a block-level <div> or <section>"]);
    assert.deepEqual(failures('<div data-doc-component="kanban"></div>'), ['data-doc-component="kanban" (line 9) names no custom block: write <scope>/<name>, the id of a custom block of the workspace\'s components/ folder']);
    assert.deepEqual(failures('<div data-doc-component="local/gone"><p>$x^2$ 是组件的</p></div>'), [], "a dollar in an instance is the component's");
    assert.deepEqual(failures('<div data-doc-fallback data-doc-component="local/gone"></div>'), ["data-doc-fallback (line 9) is the kit's to set: remove it"]);

    // Made on the page: what is written is what the manifest says or what was checked here, never
    // what the page drew, with an id of its own and ids as a copy's.
    {
      const made = (node, current = page("<p>词</p>")) => commitEdits({ current, opening: current, texts: [], touch: [], pageIds: [], units: [{ key: "n1", insert: { ...node, key: "n1", blockId: "abcd1234" }, place: { into: { main: true } } }] });
      const written = made({ type: "installed", package: "local/strip" });
      assert.equal(written.units[0].status, "applied");
      assert.match(written.text, /<div class="strip" data-doc-component="local\/strip" data-block-id="abcd1234">\s+<h3>新的指标<\/h3>\s+<p class="strip-caption">写上这些数字的说明<\/p>/, "its manifest's markup, with the id the page proposed");
      assert.equal(written.made.n1, "abcd1234", "the id the page proposed");
      assert.deepEqual(written.file.abcd1234.blocks.map(({ path, kind, caps, inner }) => [path, kind, caps.sort(), inner]), [[["unit", ["h3", 0, 1]], "installed", ["empty", "links"], "新的指标"], [["unit", ["p", 0, 1]], "installed", ["empty", "links"], "写上这些数字的说明"]], "the file says what its text blocks are");
      assert.equal(made({ type: "installed", package: "local/strip" }, written.text).text, written.text, "sent twice, written once");
      const tally = made({ type: "installed", package: "local/tally" });
      assert.ok(tally.text.includes('<label for="c1-tally-note">备注 <input id="c1-tally-note"') && !tally.text.includes("A new tally"), `an id it names itself given a prefix of its own, a comment beside it left out:\n${tally.text}`);
      const instead = made({ type: "installed", package: "local/strip", template: '<div data-doc-component="local/strip"><script>x</script></div>' });
      assert.equal(instead.text, written.text, "what else a page sends is no part of it");
      for (const id of ["local/bom", "../strip", 3, undefined]) {
        const refused = made({ type: "installed", package: id });
        assert.deepEqual(refused.units.map(({ status, reason }) => [status, reason]), [["conflict", "invalid"]], `no template of ${id}`);
      }
      assert.deepEqual(made({ type: "installed", package: "local/gone" }).units.map(({ status, reason }) => [status, reason]), [["conflict", "no-package"]], "its package gone, which the reader is told");

      const copy = '<div class="strip" data-doc-component="local/strip" data-block-id="zzzz1111"><h3>带来的</h3><label for="f">词 <input id="f"></label><span id="own">它的</span></div>';
      const carried = made({ type: "installed", package: "local/strip", html: copy });
      assert.ok(carried.text.includes('<div class="strip" data-doc-component="local/strip" data-block-id="abcd1234"><h3>带来的</h3><label for="c1-f">词 <input id="c1-f"></label><span>它的</span></div>'), `a copy's markup, as a copy's ids go:\n${carried.text}`);
      assert.equal(made({ type: "installed", package: "local/gone", html: '<div data-doc-component="local/gone"><h3>词</h3></div>' }).units[0].status, "applied", "of a package this workspace has not: it shows as one of none");
      for (const html of [
        '<div data-doc-component="local/tally"></div>', // another package's
        '<p data-doc-component="local/strip"></p>', '<div data-doc-component="local/strip"></div><p>和一段</p>', "", 7,
        '<div data-doc-component="local/strip"><script>x()</script></div>',
        '<div data-doc-component="local/strip" onclick="x()"></div>',
        '<div data-doc-component="local/strip"><img src=x ONERROR=x()></div>',
        '<div data-doc-component="local/strip"><a href="java\nscript:x()">词</a></div>',
        '<div data-doc-component="local/strip"><iframe srcdoc="x"></iframe></div>',
        '<div data-doc-component="local/strip"><template><script>x()</script></template></div>',
        '<div data-doc-component="local/strip"><p data-ge-unit="3">词</p></div>',
        '<div data-doc-component="local/strip"><svg><a><animate attributeName="href" to="javascript:x()"></animate></a></svg></div>',
        // No end tag of its own: what stands after it in the file would stand in it.
        '<div data-doc-component="local/strip"><h3>词', '<div data-doc-component="local/strip"><h3>词</h3><!-- ', '<div data-doc-component="local/strip"><h3>词</h3><textarea>', '<div data-doc-component="local/strip"><svg><title>',
        // What takes the page over from where it stands.
        '<div data-doc-component="local/strip"><style>main { display: none; }</style></div>', '<div data-doc-component="local/strip" style="position:fixed;inset:0"></div>',
      ]) assert.deepEqual(made({ type: "installed", package: "local/strip", html }).units.map(({ status, reason }) => [status, reason]), [["conflict", "invalid"]], `refused: ${html}`);
      assert.equal(made({ type: "installed", package: "local/strip", html: '<div data-doc-component="local/strip"><script type="application/json">{"a": 1}</script></div>' }).units[0].status, "applied", "data is no code");

      // What the parser put right is right in the file: what it dropped there would close what stands around the block.
      const closed = made({ type: "installed", package: "local/strip", html: '<div data-doc-component="local/strip"><h3>题</h3></main><p>段</p><b>词</div>' }, page("<p>词</p>\n<p>末段</p>"));
      assert.equal(closed.units[0].status, "applied");
      assert.ok(closed.text.includes('data-block-id="abcd1234"><h3>题</h3><p>段</p><b>词</b></div>') && closed.text.split("</main>").length === 2, `an end tag of what stands around it stays out:\n${closed.text}`);
      assert.deepEqual(findUnits(closed.text).units.map(({ kind }) => kind), ["paragraph", "paragraph", "installed"], "and the block is one the scan finds");

      // A copy within the document, sent twice (its answer lost): written once, as a block made there.
      const opened = page('<div class="strip" data-doc-component="local/strip" data-block-id="aaaa1111"><h3>题</h3><dl></dl></div>');
      const unit = instrument(opened).map.units.find(({ kind }) => kind === "installed");
      const copied = (current) => commitEdits({ current, opening: opened, texts: [], touch: [], pageIds: [], units: [{ key: "n1", insert: { copy: { key: "u", id: "aaaa1111", hash: unit.hash }, key: "n1", blockId: "abcd1234" }, place: { into: { main: true } } }] });
      const once = copied(opened);
      assert.equal(once.text.split('data-doc-component="local/strip"').length, 3, "its copy");
      assert.equal(copied(once.text).text, once.text, "sent twice, written once");

      // A template's ids it does not name itself go, as a copy's.
      fs.writeFileSync(path.join(root, "components", "local", "bom", "template.html"), '<div data-doc-component="local/bom"><h3 id="own">题</h3></div>');
      forgetCatalog(root);
      assert.ok(made({ type: "installed", package: "local/bom" }).text.includes('data-block-id="abcd1234"><h3>题</h3>'), "an id no one names names nothing twice");
    }

    // Its words change in the file, and nothing else does.
    const edited = applyEdits({ current: source, edits: [{ id: blocks[1].id, parts: [{ keep: true, html: "这周的<strong>指标</strong>" }] }] });
    assert.ok(edited.ok);
    assert.equal(edited.text, source.replace("本周指标", "这周的<strong>指标</strong>"));
    assert.equal(applyEdits({ current: source, edits: [{ id: blocks[1].id, parts: [{ keep: true, html: "" }] }] }).text, source.replace("本周指标", ""), "emptied, it stays");
    assert.equal(applyEdits({ current: source, edits: [{ id: blocks[1].id, parts: [] }] }).ok, false, "it does not go on its own");
    assert.equal(applyEdits({ current: source, edits: [{ id: blocks[1].id, parts: [{ keep: true, html: "一" }, { tag: "p", html: "二" }] }] }).ok, false, "nor split");
  } finally {
    process.env.GALLERY_DEFAULT_WORKSPACE = workspace;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// ---------- slots ----------
// A part edited as flow (data-doc-slot="<name>" in an instance's own markup): what it holds is the
// document's blocks, read, edited, checked and written as anywhere in a flow, with a package or none.
{
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-slots-"));
  fs.cpSync(path.join(projectRoot, "tests", "fixtures", "components"), path.join(root, "components"), { recursive: true });
  const write = (id, parts) => {
    fs.mkdirSync(path.join(root, "components", id), { recursive: true });
    fs.writeFileSync(path.join(root, "components", id, "component.json"), JSON.stringify({ id, apiVersion: 1, version: "1.0.0", name: { zh: "件", en: "Piece" }, description: { zh: "一件", en: "A piece" }, parts }));
    forgetCatalog(root);
  };
  const workspace = process.env.GALLERY_DEFAULT_WORKSPACE;
  process.env.GALLERY_DEFAULT_WORKSPACE = root;
  forgetCatalog(root);
  const brief = (inside, { id = "local/brief", block = "brief001", title = "<h3>要点</h3>", around = "" } = {}) => `<div class="brief" data-doc-component="${id}" data-block-id="${block}">
      ${title}
      <div class="brief-body" data-doc-slot="body">${inside}</div>${around}
    </div>`;
  const BODY = `
        <p data-block-id="para0001">第一段</p>
        <ul data-block-id="list0001">
          <li>一项</li>
        </ul>
      `;
  try {
    // The scan: the instance one unit, its slot a box of kind "slot" keyed by its name, what it holds units.
    for (const id of ["local/brief", "local/gone"]) {
      const source = page(`<p data-block-id="before01">前面</p>\n    ${brief(BODY, { id })}\n    <p data-block-id="after001">后面</p>`);
      const { units, boxes } = findUnits(source);
      const instanceUnit = units.find(({ kind }) => kind === "installed");
      const slot = boxes.find(({ kind }) => kind === "slot");
      assert.ok(slot && slot.unit === instanceUnit.id && slot.key === "body", `${id}: its slot a box of the instance's, by name`);
      assert.deepEqual(units.filter(({ box }) => box === slot.id).map(({ kind, tag }) => [kind, tag]), [["paragraph", "p"], ["list", "ul"]], `${id}: what it holds, units of their own`);
      const blocks = findBlocks(source).map((block) => ({ ...block, inner: source.slice(block.innerStart, block.innerEnd) }));
      const first = blocks.find(({ inner }) => inner === "第一段");
      assert.equal(first.kind, "flow", `${id}: a paragraph of the document's`);
      assert.equal(first.self, units.find(({ blockId }) => blockId === "para0001").id, `${id}: its own unit's text`);
      assert.ok(blocks.some(({ kind, inner }) => kind === "flow" && inner === "一项"), `${id}: and the list's item`);
      assert.equal(blocks.filter(({ kind }) => kind === "installed").length, id === "local/brief" ? 1 : 0, `${id}: the title a text part where the package says so`);
    }
    // A text part named at any depth reaches none of what a slot holds.
    write("local/deep", { title: { at: "h3", edit: "text" }, body: { edit: "flow" } });
    const deep = page(brief("<h3>插槽里的标题</h3>", { id: "local/deep" }));
    assert.deepEqual(findBlocks(deep).map(({ kind, innerStart, innerEnd }) => [kind, deep.slice(innerStart, innerEnd)]), [["title", "t"], ["installed", "要点"], ["flow", "插槽里的标题"]]);

    // What is no slot's box: a second of the name, one on a <p>, one in a slot, one in a data part.
    write("local/both", { title: { at: ":scope > h3", edit: "text" }, rows: { at: ":scope > table", edit: "data" }, body: { edit: "flow" } });
    const slotBoxes = (body) => findUnits(page(body)).boxes.filter(({ kind }) => kind === "slot").map(({ key }) => key);
    assert.deepEqual(slotBoxes(brief("<p>甲</p>", { around: '\n      <div data-doc-slot="body"><p>乙</p></div>' })), ["body"], "the first of a name");
    assert.deepEqual(slotBoxes('<div data-doc-component="local/brief"><h3>题</h3><p data-doc-slot="body">词</p></div>'), [], "a slot is a div or a section");
    assert.deepEqual(slotBoxes(brief('<div data-doc-slot="inner"><p>乙</p></div>')), ["body"], "one in a slot is a plain block of the document's");
    assert.deepEqual(slotBoxes('<div data-doc-component="local/gone"><div class="x"><div data-doc-slot="body"><p>乙</p></div></div></div>'), ["body"], "deeper in its own markup, a slot still");
    assert.deepEqual(slotBoxes('<div data-doc-component="local/gone"><div data-doc-component="local/inner"><div data-doc-slot="body"><p>乙</p></div></div></div>'), [], "an instance's in another instance's own region is that one's");
    assert.deepEqual(slotBoxes('<div data-doc-component="local/brief"><h3>题</h3><div data-doc-slot="body">零散的字</div></div>'), [], "words straight in it: no box");
    assert.deepEqual(slotBoxes('<div data-doc-component="local/brief"><h3>题</h3><div data-doc-slot="body"></div></div>'), ["body"], "an empty one takes blocks");

    // Naturalize: what a slot holds is made the kit's as in any flow; the instance's own region stays byte for byte.
    {
      const own = '<h3>题 \\(z\\) <mark>不动</mark></h3>';
      const source = page(`<div class="brief" data-doc-component="local/brief">${own}<div class="brief-body" data-doc-slot="body">零散的字 \\(x\\)</div><div class="report-note">组件的旧名字</div></div>`);
      const { text } = naturalize(source);
      assert.ok(text.includes(`${own}<div class="brief-body" data-doc-slot="body"><p>零散的字 <span class="doc-math-inline">\\(x\\)</span></p></div>`), `its loose words a paragraph, its formula the kit's:\n${text}`);
      assert.ok(text.includes('<div class="report-note">组件的旧名字</div>'), "its own region's old names its own");
      const named = newNames(page(brief('<p class="report-note">插槽里的旧名字</p>', { around: '<p class="report-kept">组件的</p>' })));
      assert.ok(named.includes('<p class="doc-note">插槽里的旧名字</p>') && named.includes('<p class="report-kept">组件的</p>'), `a slot's old names migrate, its region's not:\n${named}`);
    }

    // What the Agent is told of a slot is what it is told of any flow.
    const said = (body) => readOnlyTexts(page(body)).map((note) => note.replace(/^line \d+: /, ""));
    assert.ok(said(brief('<p>词 <button>按钮</button></p>')).length === 1, "a text it leaves read-only is said");
    assert.deepEqual(said(brief('<p>词 <button>按钮</button></p>')), said('<p>词 <button>按钮</button></p>'), "as anywhere");
    assert.equal(writingNotes(page(brief('<div class="kpi"><p>整体</p></div>'))).length, 1, "a whole block in it is said");
    assert.deepEqual(writingNotes(page('<div data-doc-component="local/brief"><h3>题</h3><div class="kpi"><p>组件的</p></div><div data-doc-slot="body"></div></div>')), [], "and none in its own region");

    // The checks: a slot holds the document's blocks, checked as in any flow; the slot itself as the manifest says.
    {
      const failures = (body) => componentFailures(page(body)).map((failure) => failure.replace(/ \(line \d+\)/g, ""));
      assert.deepEqual(failures(fs.readFileSync(path.join(root, "components", "local", "brief", "example.html"), "utf8")), [], "the fixture's example");
      assert.deepEqual(failures(brief("<pre>x</pre>")).map((failure) => failure.replace(/:.*/, "")), ["<pre> straight in the text"], "a <pre> straight in it");
      assert.deepEqual(failures(brief('<p class="doc-nowhere">词</p>')).map((failure) => failure.replace(/:.*/, "")), ["class doc-nowhere is no class of the kit's"], "its names, as the document's");
      assert.deepEqual(failures('<div data-doc-slot="body"><p>词</p></div>'), ['data-doc-slot="body" stands outside any instance\'s own markup: a slot is a part of a component package\'s instance, written in its template'], "in the document");
      assert.deepEqual(failures(brief('<div data-doc-slot="x"><p>词</p></div>')), ['data-doc-slot="x" stands outside any instance\'s own markup: a slot is a part of a component package\'s instance, written in its template'], "in a slot");
      assert.deepEqual(failures('<div data-doc-component="local/both"><h3>题</h3><table><tr><td><div data-doc-slot="body"><p>词</p></div></td></tr></table></div>'), ['local/both has no body (data-doc-slot="body")', 'data-doc-slot="body" stands outside any instance\'s own markup: a slot is a part of a component package\'s instance, written in its template'], "in a data part");
      assert.deepEqual(failures(brief('<p>甲</p>').replace('<h3>要点</h3>', '<h3>要点</h3><p data-doc-slot="body">乙</p>')), ["data-doc-slot on a <p>: a slot is a block-level <div> or <section>"]);
      assert.deepEqual(failures('<div data-doc-component="local/gone" data-doc-slot="body"><p>词</p></div>'), ['data-doc-slot="body" on the instance itself: a slot is an element inside it']);
      assert.deepEqual(failures(brief("<p>甲</p>", { around: '\n      <div data-doc-slot="foot"><p>乙</p></div>' })), ['local/brief: slot "foot" is no part of its manifest edited as flow']);
      assert.deepEqual(failures('<div data-doc-component="local/brief"><h3>题</h3></div>'), ['local/brief has no body (data-doc-slot="body")']);
      assert.deepEqual(failures(brief("<p>甲</p>", { around: '\n      <div data-doc-slot="body"><p>乙</p></div>' })), ['local/brief: slot "body" twice']);
      assert.deepEqual(failures(brief("<p>甲</p>").replace('data-doc-slot="body"', 'data-doc-slot="body" data-block-id="slot0001"')), ['data-doc-slot="body": a slot is no block: it carries no data-block-id']);
      assert.deepEqual(failures(brief('<div data-doc-component="local/strip"><dl></dl></div>')), ["local/strip has no title (h3)"], "an instance in a slot is the document's, checked by its parts");
      assert.deepEqual(packagesOf(page(brief('<div data-doc-component="local/strip"><h3>题</h3><dl></dl></div>'))).map(({ id }) => id), ["local/brief", "local/strip"], "and its package comes with the page");
    }

    // Written in the file: a block moved into it, one made in it, its last one deleted.
    {
      const source = page(`<p data-block-id="before01">前面</p>\n    ${brief(BODY)}\n    <p data-block-id="after001">后面</p>`);
      const { map } = instrument(source);
      const unitOf = (blockId) => map.units.find((unit) => unit.blockId === blockId);
      const instanceRef = { key: unitOf("brief001").id, id: "brief001", hash: unitOf("brief001").hash };
      const into = { into: { unit: instanceRef, kind: "slot", key: "body" } };
      const slotOf = (text) => text.slice(text.indexOf('data-doc-slot="body">') + 21, text.indexOf("</div>", text.indexOf('data-doc-slot="body">')));
      const moved = commitEdits({ current: source, opening: source, units: [{ key: "u1", unit: { key: unitOf("before01").id, id: "before01" }, move: into }] });
      assert.equal(moved.units[0].status, "applied", JSON.stringify(moved.units));
      assert.ok(slotOf(moved.text).includes('<p data-block-id="before01">前面</p>') && !moved.text.slice(0, moved.text.indexOf("brief001")).includes("前面"), `moved into the slot:\n${moved.text}`);
      const made = commitEdits({ current: source, opening: source, units: [{ key: "n1", insert: { type: "paragraph", html: "新的一段", key: "n1", blockId: "newp0001" }, place: into }] });
      assert.equal(made.units[0].status, "applied", JSON.stringify(made.units));
      assert.match(slotOf(made.text), /<\/ul>\n {8}<p data-block-id="newp0001">新的一段<\/p>\n {6}$/, `made in it, at its blocks' indent:\n${made.text}`);
      const lone = page(brief('\n        <p data-block-id="para0001">唯一</p>\n      '));
      const loneMap = instrument(lone).map;
      const para = loneMap.units.find((unit) => unit.blockId === "para0001");
      const emptied = commitEdits({ current: lone, opening: lone, units: [{ key: "x", unit: { key: para.id, id: "para0001", hash: para.hash }, remove: true }] });
      assert.equal(emptied.units[0].status, "applied");
      assert.deepEqual(findUnits(emptied.text).boxes.filter(({ kind }) => kind === "slot").length, 1, "emptied, it is a box still");

      // What its component writes goes in when someone changed what the slot holds: the instance's hash changed, its parts did not.
      const both = page(`<div class="both" data-doc-component="local/both" data-block-id="both0001">
      <h3>题</h3>
      <table><tbody><tr><td>一</td></tr></tbody></table>
      <div data-doc-slot="body"><p>插槽</p></div>
    </div>`);
      const ref = { key: 0, id: "both0001" };
      const opened = instrument(both).map.units.find((unit) => unit.blockId === "both0001");
      const theirs = both.replace("<p>插槽</p>", "<p>插槽（AI 改过）</p>");
      const written = commitEdits({ current: theirs, opening: both, units: [{ key: "u", unit: { ...ref, hash: opened.hash }, hash: opened.hash, definition: currentCatalog(root).packages.get("local/both").definition, source: { rows: "<tbody><tr><td>二</td></tr></tbody>" }, parts: { rows: opened.parts.rows } }] });
      assert.equal(written.units[0].status, "applied", JSON.stringify(written.units));
      assert.ok(written.text.includes("插槽（AI 改过）") && written.text.includes("<td>二</td>"), "both in the file");
    }

    // An instance with a slot made on the page: what a clipboard brings holds no blocks in it, which come
    // apart (`children`, each in the slot `boxKeys` names) and are written in the slot as blocks made on
    // the page, each with its id; from its template likewise, its slot's blocks the page's.
    {
      const current = page('<p data-block-id="para0001">词</p>');
      const sent = (insert) => commitEdits({ current, opening: current, texts: [], touch: [], pageIds: [], units: [{ key: "n1", insert: { type: "installed", package: "local/brief", ...insert, key: "n1", blockId: "abcd1234" }, place: { into: { main: true } } }] });
      const made = (html, more = {}) => sent({ html, ...more }).units[0];
      const EMPTY = '<div data-doc-component="local/brief"><h3>题</h3><div data-doc-slot="body">\n  </div></div>';
      assert.deepEqual([made('<div data-doc-component="local/brief"><h3>题</h3><div data-doc-slot="body"><p>带来的</p></div></div>')].map(({ status, reason }) => [status, reason]), [["conflict", "invalid"]], "a slot with blocks in its markup: refused");
      assert.equal(made(EMPTY).status, "applied", "an empty one: written");
      const children = [{ type: "paragraph", html: "一段", key: "c1", blockId: "slotp001" }, { type: "bullets", children: [{ type: "item", html: "一项", key: "c3", blockId: "slotl002" }], key: "c2", blockId: "slotu003" }];
      // Its blocks a step in from the slot's line, the instance's lines as its markup has them; all on its
      // line where the slot stands on the instance's.
      const LINES = '<div data-doc-component="local/brief">\n  <h3>题</h3>\n  <div data-doc-slot="body">\n  </div>\n</div>';
      const carried = sent({ html: LINES, children, boxKeys: ["body", "body"] });
      assert.equal(carried.units[0].status, "applied", JSON.stringify(carried.units));
      assert.ok(carried.text.includes('<div data-doc-component="local/brief" data-block-id="abcd1234">\n  <h3>题</h3>\n  <div data-doc-slot="body">\n    <p data-block-id="slotp001">一段</p>\n    <ul data-block-id="slotu003">\n      <li data-block-id="slotl002">一项</li>\n    </ul>\n  </div>\n</div>'), carried.text);
      assert.ok(sent({ html: EMPTY, children, boxKeys: ["body", "body"] }).text.includes('<div data-doc-slot="body"><p data-block-id="slotp001">一段</p><ul data-block-id="slotu003"><li data-block-id="slotl002">一项</li></ul></div></div>'));
      assert.deepEqual(new Map(Object.entries(carried.made)), new Map([["n1", "abcd1234"], ["c1", "slotp001"], ["c2", "slotu003"], ["c3", "slotl002"]]), "each block it holds by the key it was made under");
      const scanned = findUnits(carried.text);
      const slot = scanned.boxes.find(({ kind }) => kind === "slot");
      assert.deepEqual(scanned.units.filter((unit) => unit.box === slot.id).map(({ blockId }) => blockId), ["slotp001", "slotu003"], "the slot's blocks, units of its box");
      for (const [insert, why] of [
        [{ html: EMPTY, children, boxKeys: ["body"] }, "a key for each block"],
        [{ html: EMPTY, children, boxKeys: ["body", "foot"] }, "a slot it has"],
        [{ html: EMPTY, children: [{ type: "section", children: [{ type: "paragraph", html: "节" }] }], boxKeys: ["body"] }, "a block the slot takes"],
        [{ html: EMPTY, children: "x", boxKeys: [] }, "a list"],
      ]) assert.equal(made(insert.html, insert).reason, "invalid", why);
      // A block of the file taken into it, as into any block made on the page.
      const para = instrument(current).map.units.find((unit) => unit.blockId === "para0001");
      const moving = sent({ html: LINES, children: [{ unit: { key: para.id, id: "para0001", hash: para.hash } }], boxKeys: ["body"] });
      assert.equal(moving.units[0].status, "applied", JSON.stringify(moving.units));
      assert.ok(moving.text.includes('<div data-doc-slot="body">\n    <p data-block-id="para0001">词</p>\n  </div>') && moving.text.split("词").length === 2, moving.text);
      // From its template: written with its slot emptied when its blocks come apart, and refused when none do.
      const fromMenu = sent({ children: [{ type: "paragraph", html: "写的", key: "c1", blockId: "slotp001" }], boxKeys: ["body"] });
      assert.equal(fromMenu.units[0].status, "applied", JSON.stringify(fromMenu.units));
      assert.ok(fromMenu.text.includes('<div class="brief-body" data-doc-slot="body">\n    <p data-block-id="slotp001">写的</p>\n  </div>') && !fromMenu.text.includes("<p></p>"), fromMenu.text);
      assert.equal(sent({ children: [], boxKeys: [] }).text.includes('<div class="brief-body" data-doc-slot="body"></div>'), true, "nothing in it yet: an empty slot");
      const old = sent({});
      assert.deepEqual([old.units[0].status, old.units[0].reason, old.text], ["conflict", "invalid", current], "its template with nothing apart (a page from before): none written");
    }

    // On the page: whose an element is, folded from the outermost region in (installed.mjs heldBy).
    {
      const { document } = new JSDOM(`<main>
        <div id="i" data-doc-component="local/brief"><h3 id="t">题</h3>
          <div id="s" data-doc-slot="body"><p id="p">词</p><div class="doc-code" id="code"><pre>x</pre></div>
            <div id="j" data-doc-component="local/gone"><b id="jb">内</b><div id="js" data-doc-slot="body"><p id="jp">深</p></div></div>
          </div>
          <div id="k" data-doc-component="local/gone"><div id="ks" data-doc-slot="body"><p id="kp">组件的</p></div></div>
        </div>
        <div id="stray" data-doc-slot="x"><p id="sp">散</p></div></main>`).window;
      const at = (id) => document.getElementById(id);
      const heldOf = (id) => heldBy(at(id))?.id ?? null;
      assert.deepEqual(["i", "t", "s", "p", "j", "jb", "js", "jp", "k", "ks", "kp", "stray", "sp"].map(heldOf), [null, "i", "i", null, null, "j", "j", null, "i", "i", "i", null, null]);
      assert.deepEqual(["i", "t", "s", "p", "jb", "js", "ks", "kp"].map((id) => componentAt(at(id))), [false, true, false, false, true, false, true, true], "a slot that opens the document's is none of the component's, one in its region is");
      assert.deepEqual(slotsIn(at("i")).map((slot) => slot.id), ["s"], "an instance's own slots, none of an inner one's");
      // Where what an element holds stands (heldWithin): what a change of its children is, for `source`.
      const within = (id) => heldWithin(at(id))?.id ?? null;
      assert.deepEqual(["i", "t", "s", "p", "j", "jb", "js", "k", "ks", "stray"].map(within), ["i", "i", null, null, "j", "j", null, "i", "i", null], "an instance's inside its own, its own slot's the document's; an instance and a slot in a component's region that region's, as heldBy has them");
      assert.equal(ownerOf(at("p")), "paragraph", "a slot's paragraph is a paragraph, no one block's");
      assert.equal(ownerOf(at("code")), "code", "a slot's code block is the code block's");
      assert.equal(ownerOf(at("t")), "installed", "its text part is its");
      assert.equal(ownerOf(at("s")), "installed", "and so is the slot itself");
      assert.equal(ownerOf(at("jb")), "installed", "an instance's in a slot is that one's");
      assert.equal(ownerOf(at("kp")), "installed", "and what an inner instance's slot holds in its own region the outer one's");
    }
  } finally {
    process.env.GALLERY_DEFAULT_WORKSPACE = workspace;
    forgetCatalog(root);
    fs.rmSync(root, { recursive: true, force: true });
  }
}

// What a component hearing source hears of attributes (src/shared/component-source.mjs): each of the table
// description's data-sort-* listed, as an observer takes them one by one, and every class that is a cell's
// look (the editor's CELL_LOOKS, the block colors among them) a look class; a class the kit toggles none.
{
  const sorts = Object.keys(table.attrs).filter((name) => name.startsWith("data-sort-"));
  assert.deepEqual(SOURCE_ATTRIBUTES.filter((name) => name.startsWith("data-sort-")).sort(), sorts.sort(), "every data-sort-* the table description has");
  assert.ok(["data-checked", "rowspan", "colspan"].every((name) => SOURCE_ATTRIBUTES.includes(name)) && !SOURCE_ATTRIBUTES.some((name) => ["hidden", "open", "class"].includes(name)));
  assert.deepEqual(CELL_LOOKS.filter((name) => !LOOK_CLASSES.has(name)), [], "a cell's look classes are look classes");
  assert.deepEqual([lookChanged("a doc-text-red", "doc-text-red b"), lookChanged("number", "number doc-bold"), lookChanged("doc-table", "doc-table doc-table--auto"), lookChanged(null, "doc-highlight-gray"), lookChanged("doc-code doc-code--folded", "doc-code")], [false, true, false, true, false], "a look class changed, or not");
}

// The kit holds [hidden] over any display a block's style gives what stands in an instance (a ledger's form
// hidden where nothing is written, a rule of its own saying display: flex), up to a slot, whose blocks are the
// document's and keep their own rules (a Sheet panel, an empty figure the editor shows); a package's data part
// and a hidden table (the board's) stay hidden as they were.
{
  const css = fs.readFileSync(path.join(projectRoot, "src", "render", "kit", "styles", "installed.css"), "utf8");
  assert.match(css, /@scope \(\[data-doc-component\]\) to \(\[data-doc-slot\]\) \{\s*:scope \[hidden\] \{\s*display: none !important;\s*\}\s*\}/, "installed.css: [hidden] in an instance, to its slots, display: none !important");
  assert.ok(!/\[data-doc-slot\][^{}]*\[hidden\][^{}]*!important/.test(css.replace(/@scope[^{]*\{[\s\S]*?\n\}\n/, "")), "and in no other rule of that file one that reaches into a slot");
}

console.log("Checked instances of component packages: ranked ahead of every rule, one block with no box, naturalize and old names passing by what it holds byte for byte in every walk, nothing said of its inside; the text parts a manifest declares and no others, their words written in the file and nothing else; the checks by its parts, or a note for no package; its slots the document's, by one rule of regions: boxes the scan goes on in, made the kit's, checked, told of and written as any flow, with a package or none, and one made on the page written with their blocks apart from its markup, each with the id the page knows it by.");
