import "./workspace-env.mjs";
import { buildKitFile, loadKitFile } from "../../src/render/kit-build.mjs";
import { EXPORT_CSP, isolateUmd } from "../../src/shared/export-wrap.mjs";
import { FLOWS, FLOW_BLOCKS } from "../../src/shared/components/index.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import { QUERY_CODES, TODO_CODES, TODO_EVENT } from "../../src/shared/workspace-query.mjs";
import { componentRuntime } from "../../src/render/component-runtime.mjs";
import { COMPONENTS, RUNTIME_FIELDS, parseCompound, runtimeDescriptions } from "../../src/shared/components/index.mjs";
import { newNames } from "../../src/shared/new-names.mjs";

const sources = Object.fromEntries(await Promise.all(['runtime', 'state', 'tokens', 'sheets', 'charts', 'dialogs', 'ui', 'code', 'tables'].map(async (name) => [name, await loadKitFile(`${name}.js`)])));
const d3Source = await fs.readFile(new URL('../../node_modules/d3/dist/d3.min.js', import.meta.url), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));
const reportCss = await loadKitFile('report.css');
// The kit starts what a page holds once it has loaded (DocKit, docs/render.md), as it does for a reader.
async function started(page) {
  if (page.w.document.readyState === 'loading') await new Promise((resolve) => page.w.document.addEventListener('DOMContentLoaded', resolve, {once: true}));
  page.flush();
}
// `setup(window)`: what the page has before the kit's runtime loads (a set of fonts of the test's own).
function environment(body = '', head = '', media = () => ({matches: false, addEventListener() {}, removeEventListener() {}}), setup = () => {}) {
  const dom = new JSDOM(`<!doctype html><html><head>${head}</head><body>${body}</body></html>`, {url: 'https://report.test/report.html', runScripts: 'outside-only'});
  const w = dom.window;
  w.matchMedia = media;
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const frames = new Map(); let frame = 0;
  w.requestAnimationFrame = (fn) => { frames.set(++frame, fn); return frame; };
  w.cancelAnimationFrame = (id) => frames.delete(id);
  w.HTMLCanvasElement.prototype.getContext = () => null;
  w.SVGElement.prototype.getBBox = () => ({x: 0, y: 0, width: 0, height: 0});
  w.HTMLElement.prototype.getBoundingClientRect = () => ({width: 400, height: 300, x: 0, y: 0, left: 0, top: 0, right: 400, bottom: 300});
  const css = w.getComputedStyle.bind(w);
  w.getComputedStyle = (node) => {
    const result = css(node);
    const get = result.getPropertyValue.bind(result);
    result.getPropertyValue = (name) => get(name) || css(w.document.documentElement).getPropertyValue(name);
    return result;
  };
  for (let i = 1; i <= 6; i++) w.document.documentElement.style.setProperty(`--doc-series-${i}`, `rgb(${i * 30}, 80, 90)`);
  w.document.documentElement.style.setProperty('--doc-muted', '#777');
  function load(...names) { names.forEach((name) => w.eval(sources[name])); }
  function flush() {
    for (let pass = 0; frames.size && pass < 10; pass++) {
      const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn());
    }
    assert.equal(frames.size, 0);
  }
  setup(w);
  load('runtime', 'state', 'tokens');
  return {dom, w, load, flush};
}

// Browser restoration wins over an older embedded snapshot; transient fields reset.
const embedded = JSON.stringify([{schema: 1, id: 'notes', version: 1, state: {memo: 'embedded', filter: 'old'}}]);
const head = `<meta name="doc-export-id" content="edition-one"><script type="application/json" data-doc-state>${embedded}</script>`;
let env = environment('', head);
const options = {id: 'notes', version: 1, defaults: {memo: '', filter: 'all'}, transientKeys: ['filter']};
let state = env.w.DocState.create(options);
assert.equal(state.get('memo'), 'embedded');
state.update({memo: 'edited', filter: 'selected'});
const storageKey = env.w.localStorage.key(0);
const stored = env.w.localStorage.getItem(storageKey);
assert.equal(JSON.parse(state.serialize()).state.filter, undefined);
assert.throws(() => env.w.DocState.create(options), /already exists/);
// getOrCreate: the same state for the same version and shape of defaults, the values aside; anything else an error.
{
  const again = env.w.DocState.getOrCreate({...options, defaults: {memo: 'other', filter: 'none'}});
  assert.equal(again, state, 'the same object, whatever the defaults hold');
  assert.throws(() => env.w.DocState.getOrCreate({...options, version: 2}), /another version/, 'another version throws');
  assert.throws(() => env.w.DocState.getOrCreate({...options, defaults: {memo: ''}}), /another shape/, 'a key less throws');
  assert.throws(() => env.w.DocState.getOrCreate({...options, defaults: {memo: '', filter: 1}}), /another shape/, 'another kind of value throws');
  const nested = {id: 'nested', version: 1, defaults: {a: {b: [1, 2], c: null}}};
  const first = env.w.DocState.getOrCreate(nested);
  assert.equal(env.w.DocState.getOrCreate({...nested, defaults: {a: {c: null, b: []}}}), first, 'the shape is keys and kinds at every depth, an array of any length, in any order');
  assert.throws(() => env.w.DocState.getOrCreate({...nested, defaults: {a: {b: [], c: 'x'}}}), /another shape/);
  assert.throws(() => env.w.DocState.create(nested), /already exists/, 'and create keeps its throw');
  assert.equal(env.w.DocState.getOrCreate({...options, id: 'made-first', defaults: {x: 1}}).get('x'), 1, 'none yet: one is made');
  assert.throws(() => env.w.DocState.getOrCreate({version: 1, defaults: {}}), /non-empty id/, 'its options held as create holds them');
}
env.dom.window.close();
env = environment('', head);
env.w.localStorage.setItem(storageKey, stored);
state = env.w.DocState.create(options);
assert.deepEqual(plain(state.snapshot()), {memo: 'edited', filter: 'all'});
state.reset();
assert.equal(JSON.parse(env.w.localStorage.getItem(storageKey)).state.memo, '');
let notifications = 0; const unsubscribe = state.subscribe(() => notifications++);
state.set('memo', 'updated'); unsubscribe(); state.set('memo', 'unsubscribed');
assert.equal(notifications, 1);
env.dom.window.close();

// Code and diff: shared highlighting, safe text, the header the kit draws around a code block's
// title (fold arrow, language, copy, wrap; the arrow and wrap switch its classes), declared diffs
// (options, stats, validation) and export hydration. Code blocks and diffs start on their own (the
// kit's runtime).
{
  const languages = ['js', 'ts', 'tsx', 'jsx', 'py', 'json', 'html', 'css', 'sh', 'sql', 'yaml', 'md', 'unknown'];
  const inLanguage = '// comment\nconst value = "hello";\n';
  const diffBlock = (id, options) => `<div class="doc-diff" id="${id}"><div class="doc-code-title">${id}</div><script type="application/json">${JSON.stringify(options)}</script></div>`;
  const body = '<main class="doc-page"><div class="doc-code" id="code" data-language="typescript"><div class="doc-code-title">message.ts</div><pre><code>const message: string = &quot;&lt;script&gt;&quot;;\n// comment</code></pre></div>'
    + '<div class="doc-code" id="titled"><div class="doc-code-title">run.py</div><pre><code>def run():\n  return 1</code></pre></div>'
    + '<div class="doc-code" id="untitled" data-line-numbers="false"><div class="doc-code-title"></div><pre><code>x</code></pre></div>'
    + '<div class="doc-code" id="excerpt" data-line-start="98"><div class="doc-code-title">eval.py</div><pre><code>def run():\n  return 1\nx = 2</code></pre></div>'
    + '<div class="doc-code" id="unnumbered" data-line-start="0"><div class="doc-code-title"></div><pre><code>a\nb</code></pre></div>'
    + '<div class="doc-code" id="opened"><div class="doc-code-title">open.js</div><pre><code>const opened = 1;</code></pre></div>'
    + diffBlock('diff', {path: 'example.py', lines: [{type: 'removed', content: 'return 1', lineNumber: 2}, {type: 'added', content: 'return 2', lineNumber: 2}, {type: 'unchanged', content: ''}]})
    + diffBlock('plain', {lines: [{type: 'added', content: '<img onerror="alert(1)">'}], language: 'unknown', showLineNumbers: false, showAccentStrip: false, coloredLineNumbers: false})
    + diffBlock('same', {lines: [{type: 'unchanged', content: 'x'}]})
    + diffBlock('wrong', {lines: [{type: 'wrong', content: ''}]})
    + diffBlock('split', {lines: [{type: 'added', content: 'one\ntwo'}]})
    + languages.map((language) => `<div class="doc-code" id="lang-${language}" data-language="${language}"><div class="doc-code-title"></div><pre><code>${inLanguage.replace(/"/g, '&quot;')}</code></pre></div>`).join('')
    + '</main>';
  env = environment(body);
  const errors = [];
  env.w.console.error = (...args) => errors.push(args.map((arg) => String(arg?.message ?? arg)).join(' '));
  env.load('code');
  env.w.document.dispatchEvent(new env.w.Event('DOMContentLoaded'));
  const document = env.w.document;
  const block = document.querySelector('#code');
  const pre = block.querySelector(':scope > pre');
  const originalCode = 'const message: string = "<script>";\n// comment';
  assert.equal(pre.textContent, originalCode);
  assert.equal(pre.querySelectorAll('[data-line-number]').length, 2);
  // Its lines drawn as the page renders, in plain text (rows, numbers, folds: what lays it out); its
  // colors after the frame the page shows in, once the page is idle (here a timer), the same spans as
  // a block drawn at once (DocCode.draw); a language the kit does not color drawn whole at once.
  assert.equal(document.querySelector('.doc-code [style*="--doc-code-token-"]'), null, 'no colors before the page shows');
  assert.equal(document.querySelector('#lang-unknown .doc-code-content').innerHTML, '<span>// comment</span>', 'code in no language the kit colors drawn as it is');
  // A block opened for editing before its colors come (the page editor's code, components/code/) is the editor's.
  const opened = document.querySelector('#opened > pre');
  opened.innerHTML = '<code contenteditable="true">const opened = 2;</code>';
  const colorsCome = async (page) => {
    page.flush();
    await new Promise((resolve) => page.w.setTimeout(resolve, 30));
  };
  await colorsCome(env);
  assert.ok(pre.querySelector('[style*="--doc-code-token-keyword"]'));
  assert.equal(opened.innerHTML, '<code contenteditable="true">const opened = 2;</code>', 'a block opened before its colors came left to the editor');
  for (const each of document.querySelectorAll('.doc-code')) {
    const colored = each.querySelector(':scope > pre').innerHTML;
    env.w.DocCode.draw(each);
    assert.equal(each.querySelector(':scope > pre').innerHTML, colored, `#${each.id} colored as a block drawn at once`);
  }
  assert.equal(pre.querySelector('script'), null);
  assert.equal(pre.attributes.length, 0, 'its pre as written: nothing set on it');
  // The header around its title: the arrow before it, the toolbar after it.
  assert.deepEqual([...block.children].map((node) => node.className || node.localName), ['doc-code-fold', 'doc-code-title', 'doc-code-tools', 'pre']);
  assert.equal(block.querySelector('.doc-code-language').textContent, 'TypeScript');
  assert.equal(document.querySelector('#titled .doc-code-language').textContent, 'Python', 'its title tells its language');
  assert.ok(document.querySelector('#titled [style*="--doc-code-token-keyword"]'));
  assert.equal(document.querySelector('#untitled .doc-code-language').textContent, '纯文本');
  assert.equal(document.querySelectorAll('#untitled [data-line-number]').length, 0);
  block.querySelector('.doc-code-fold').click();
  assert.ok(block.classList.contains('doc-code--folded'), 'the arrow folds it');
  block.querySelector('.doc-code-fold').click();
  assert.equal(block.querySelector('.doc-code-wrap').getAttribute('aria-label'), '取消自动换行', 'its long lines wrap');
  block.querySelector('.doc-code-wrap').click();
  assert.ok(!block.classList.contains('doc-code--folded') && block.classList.contains('doc-code--nowrap'), 'and unfolds it; the wrap button scrolls its lines instead');
  assert.equal(block.querySelector('.doc-code-wrap').getAttribute('aria-label'), '自动换行');
  // A line that starts a structure has an arrow left of its number, which folds it: the lines inside
  // hidden, "…" after it (which unfolds it), the block's data-folded-lines.
  const titled = document.querySelector('#titled');
  const rows = () => [...titled.querySelectorAll('.doc-code-line')];
  assert.deepEqual(rows().map((row) => Boolean(row.querySelector('.doc-code-line-fold'))), [true, false], 'an arrow beside the line that starts a body');
  rows()[0].querySelector('.doc-code-line-fold').click();
  assert.equal(titled.getAttribute('data-folded-lines'), '1');
  assert.deepEqual(rows().map((row) => row.className.match(/--(folded|hidden)/g)?.join() ?? ''), ['--folded', '--hidden'], 'folded: the line inside hidden');
  assert.equal(titled.querySelector('pre').textContent, 'def run():\n  return 1', 'its code all there');
  rows()[0].querySelector('.doc-code-line-more').click();
  assert.ok(!titled.hasAttribute('data-folded-lines') && !titled.querySelector('.doc-code-line--hidden, .doc-code-line-more'), '"…" unfolds it');
  // An excerpt numbered as in its file (data-line-start): its numbers from there, as wide as the
  // last one; its folds still counted in the block from 1. A number that is none numbers from 1.
  const excerpt = document.querySelector('#excerpt');
  const numbers = (node) => [...node.querySelectorAll('.doc-code-line')].map((row) => row.dataset.lineNumber);
  assert.deepEqual(numbers(excerpt), ['98', '99', '100']);
  assert.equal(excerpt.querySelector('pre > code').style.getPropertyValue('--doc-code-digits'), '3');
  excerpt.querySelector('.doc-code-line-fold').click();
  assert.equal(excerpt.getAttribute('data-folded-lines'), '1', 'its first line folded: the block\'s line 1, numbered 98');
  assert.deepEqual(numbers(document.querySelector('#unnumbered')), ['1', '2']);
  // Its range of lines beside its title, worked out from its first number and its count (the title,
  // its own text, as written): after the title, before the toolbar; none for a block numbered from
  // 1 by default; drawn again as its lines change.
  assert.deepEqual([...excerpt.children].map((node) => node.className || node.localName), ['doc-code-fold', 'doc-code-title', 'doc-code-range', 'doc-code-tools', 'pre']);
  assert.equal(excerpt.querySelector('.doc-code-range').textContent, '第 98–100 行');
  assert.equal(excerpt.querySelector('.doc-code-title').textContent, 'eval.py');
  assert.equal(document.querySelectorAll('#unnumbered .doc-code-range, #titled .doc-code-range').length, 0, 'no range without data-line-start');
  excerpt.querySelector('pre').textContent = 'one line';
  env.w.DocCode.draw(excerpt);
  assert.equal(excerpt.querySelector('.doc-code-range').textContent, '第 98 行', 'one line: its number alone');
  // A line break ending the code (a Markdown renderer writes one before </code>) ends its last line:
  // no empty line drawn after it, and the range counts the lines shown (as the page editor's lines).
  excerpt.querySelector('pre').textContent = 'line 1\nline 2\nline 3\n';
  env.w.DocCode.draw(excerpt);
  assert.deepEqual([numbers(excerpt), excerpt.querySelector('.doc-code-range').textContent], [['98', '99', '100'], '第 98–100 行'], 'a final line break: no empty line, the range of the lines shown');
  const lines = (id) => document.querySelector(`#${id} > .doc-diff-body > code`)?.textContent;
  assert.equal(document.querySelectorAll('#diff .has-accent').length, 3);
  assert.equal(document.querySelectorAll('#diff .has-colored-number').length, 3);
  assert.equal(lines('diff'), 'return 1\nreturn 2\n');
  assert.equal(document.querySelector('#diff > .doc-diff-body').previousElementSibling.type, 'application/json', 'a diff keeps its options, its lines drawn after them');
  assert.equal(document.querySelector('#diff .doc-diff-stats').textContent, '+1−1', 'its header shows what it adds and removes');
  assert.equal(document.querySelector('#diff > .doc-diff-body').className, 'doc-diff-body', 'its body is marked by its own class alone');
  assert.equal(document.querySelector('#diff .doc-code-wrap'), null, 'a diff has no wrap button');
  assert.equal(document.querySelector('#plain img'), null);
  assert.equal(document.querySelectorAll('#plain [data-line-number], #plain .has-accent').length, 0);
  assert.equal(document.querySelector('#same .doc-diff-stats').hidden, true, 'no stats for a diff that changes nothing');
  assert.match(errors.join('\n'), /diff: .*valid type/);
  assert.match(errors.join('\n'), /diff: .*single-line/);
  assert.equal(lines('diff'), 'return 1\nreturn 2\n', 'a broken diff leaves the others drawn');
  assert.deepEqual(['View', 'DiffView', 'DiffStats', 'enhance'].filter((name) => name in env.w.DocCode), [], 'the kit exports none of the calls gallery check says are gone (REMOVED, pipeline.mjs)');
  for (const language of languages) assert.equal(document.querySelector(`#lang-${language} pre`).textContent, inLanguage, `a block of language ${language} keeps its text`);
  // An export of the view keeps a code block's and a diff's markup alone; the copy draws them again.
  const copy = env.w.DocKit.dehydrate(document.documentElement.cloneNode(true));
  assert.equal(copy.querySelector('#diff .doc-diff-body'), null, 'the lines come off');
  assert.equal(copy.querySelector('#diff').children.length, 2, 'its title and options stay');
  assert.deepEqual([...copy.querySelector('#code').children].map((node) => node.className || node.localName), ['doc-code-title', 'pre'], "the header's arrow and toolbar come off");
  const restored = environment(copy.querySelector('main').outerHTML);
  restored.w.console.error = () => {};
  restored.load('code');
  restored.w.document.dispatchEvent(new restored.w.Event('DOMContentLoaded'));
  assert.equal(restored.w.document.querySelector('#code pre').textContent, originalCode);
  await colorsCome(restored);
  assert.ok(restored.w.document.querySelector('[style*="--doc-code-token-keyword"]'));
  assert.equal(restored.w.document.querySelector('#diff > .doc-diff-body > code').textContent, 'return 1\nreturn 2\n');
  assert.equal(restored.w.document.querySelector('#diff .doc-diff-stats').textContent, '+1−1');
  restored.dom.window.close(); env.dom.window.close();
}
console.log('Checked code/diff: offline highlighting, safe text, exact source text, the header around a code block\'s title (language from data-language or the title, fold and wrap switching its classes), declared diffs (options, stats, a broken one alone), and an export of the view drawn again.');

// Formulas: drawn in every flow the components' descriptions name (a column, a disclosure's content, a
// Sheet panel…), in [data-doc-math], and nowhere else.
{
  const host = (flow, text) => (flow.startsWith('[') ? `<div ${flow.slice(1, -1)}="a">${text}</div>` : `<div class="${flow.slice(1)}">${text}</div>`);
  env = environment(FLOWS.map((flow) => host(flow, '\\(x^2\\)')).join('') + '<div data-doc-math>\\(y\\)</div><div class="not-a-flow">\\(z\\)</div>');
  const katexRoot = new URL('../../node_modules/katex/dist/', import.meta.url);
  env.w.eval(await fs.readFile(new URL('katex.min.js', katexRoot), 'utf8'));
  env.w.eval(await fs.readFile(new URL('contrib/auto-render.min.js', katexRoot), 'utf8'));
  env.w.eval(await loadKitFile('math.js'));
  env.w.DocMath.render(env.w.document);
  const drawn = (selector) => env.w.document.querySelectorAll(`${selector} .katex`).length;
  for (const flow of FLOWS) assert.equal(drawn(flow), 1, `a formula in ${flow} is drawn`);
  assert.equal(drawn('[data-doc-math]'), 1, 'and one in [data-doc-math]');
  assert.equal(drawn('.not-a-flow'), 0, 'not in any other element');
  env.dom.window.close();
  // In an instance of a component package: its slots, an inner instance's too, each the outermost of
  // its layer; none of its own region, nor of an inner one's.
  env = environment(`<main class="doc-page"><div data-doc-component="local/x"><p id="own">\\(a\\)</p><div data-doc-slot="body"><p id="slotted">\\(b\\)</p><div data-doc-component="local/y"><p id="inner">\\(c\\)</p><div data-doc-slot="body"><p id="deep">\\(d\\)</p></div></div></div></div></main>`);
  env.w.eval(await fs.readFile(new URL('katex.min.js', katexRoot), 'utf8'));
  env.w.eval(await fs.readFile(new URL('contrib/auto-render.min.js', katexRoot), 'utf8'));
  env.w.eval(await loadKitFile('math.js'));
  env.w.DocMath.render(env.w.document);
  assert.deepEqual(['own', 'slotted', 'inner', 'deep'].map((id) => drawn(`#${id}`)), [0, 1, 0, 1], 'drawn in its slots alone');
  assert.equal(env.w.document.querySelector('[data-doc-component]').getAttribute('class'), null, 'and no mark of the walk left on it');
  env.dom.window.close();
  // What KaTeX could not read is marked for the page editor's look (styles/math.css: 无效的公式): its error, its TeX kept
  // and its reason the title, KaTeX's red gone; a formula drawn with a command it does not know in red too; one colored
  // that red by its author is a formula; drawn again, nothing changes.
  env = environment(`<main class="doc-page"><p id="bad">甲 <span class="doc-math-inline">\\(\\frac{\\)</span></p><div class="doc-math-block" id="unknown">\\[x^2 + \\foo\\]</div><p id="red">\\(\\textcolor{#cc0000}{x}\\)</p></main>`);
  env.w.eval(await fs.readFile(new URL('katex.min.js', katexRoot), 'utf8'));
  env.w.eval(await fs.readFile(new URL('contrib/auto-render.min.js', katexRoot), 'utf8'));
  env.w.eval(await loadKitFile('math.js'));
  env.w.DocMath.render(env.w.document);
  const marked = (id) => {
    const node = env.w.document.querySelector(`#${id} .doc-math-invalid`);
    return node && { error: node.classList.contains('katex-error'), tex: node.querySelector('.doc-math-tex')?.textContent, reason: /^ParseError: KaTeX parse error: /.test(node.getAttribute('title')), style: node.getAttribute('style'), drawn: drawn(`#${id}`) };
  };
  assert.deepEqual(marked('bad'), { error: true, tex: '\\frac{', reason: true, style: null, drawn: 0 }, 'KaTeX\'s error marked, its TeX kept, its reason the title');
  assert.deepEqual(marked('unknown'), { error: true, tex: 'x^2 + \\foo', reason: true, style: null, drawn: 0 }, 'a command KaTeX does not know: marked, no red drawing left');
  assert.equal(marked('red'), null, 'a formula colored red by its author is drawn');
  const once = env.w.document.querySelector('main').innerHTML;
  env.w.DocMath.render(env.w.document);
  assert.equal(env.w.document.querySelector('main').innerHTML, once, 'drawn again: nothing changes');
  env.dom.window.close();
}
console.log('Checked formulas in every flow the descriptions name, and only there; what KaTeX could not read marked as 无效的公式.');

// Declared charts: of a type the report defines, drawn from their JSON once it is defined (with its
// data, width, card height and theme colors), again on a redraw and a theme change; a part kept
// until its host goes; a broken declaration logged without keeping the others from drawing; what
// DocCharts holds (define and get alone).
const chartData = [3, 1, 2];
{
  const json = (value) => `<script type="application/json">${JSON.stringify(value)}</script>`;
  const body = `<div id="broken" data-doc-chart="broken"><script type="application/json">{ "title": </script></div>`
    + `<div id="own" data-doc-chart="dots" style="--doc-chart-height: 220px">${json(chartData)}</div>`
    + `<div id="scripted" data-doc-chart="dots"></div>`
    + `<div id="part" data-doc-chart="ticker">${json({ step: 1 })}</div>`;
  env = environment(body);
  const errors = [];
  env.w.console.error = (...args) => errors.push(args.map((arg) => String(arg?.message ?? arg)).join(' '));
  env.load('charts'); env.flush();
  assert.deepEqual(Object.keys(env.w.DocCharts).sort(), ['define', 'get'], 'DocCharts holds define and get alone');
  assert.equal(env.w.DocCharts.BarChart, undefined);
  assert.equal(env.w.ReportCharts, env.w.DocCharts, 'its old name (before 2026-10-26) is it');
  const own = env.w.document.querySelector('#own');
  assert.equal(own.children.length, 1, 'a type not defined yet: nothing drawn, its data left');
  assert.equal(env.w.DocCharts.get('#own'), null);
  const calls = [];
  env.w.DocCharts.define('dots', ({host, data, tokens, width, height}) => {
    calls.push({data: [...data], width, height, color: tokens.series[0]});
    host.append(env.w.document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
  });
  env.flush();
  assert.deepEqual(plain(calls), [{data: [3, 1, 2], width: 0, height: 220, color: env.w.DocTokens.read().series[0]}], 'defined: drawn with its data, width, card height and the theme colors');
  assert.ok(own.classList.contains('doc-chart') && own.querySelector(':scope > svg') && own.firstElementChild.type === 'application/json');
  assert.equal(env.w.DocCharts.get('#scripted'), null, 'a host with no JSON is one a script draws into');
  env.w.DocCharts.get('#own').redraw([5]); env.flush();
  assert.deepEqual(plain(calls.at(-1).data), [5]);
  assert.equal(own.querySelectorAll('svg').length, 1, 'the host is emptied (but for its data) before each draw');
  env.w.DocCharts.get('#own').redraw(); env.flush();
  assert.deepEqual(plain(calls.at(-1).data), [5], 'a redraw with nothing keeps its data');
  env.w.dispatchEvent(new env.w.Event('doc-theme-change')); env.flush();
  assert.equal(calls.length, 4, 'a theme change draws again');
  assert.throws(() => env.w.DocCharts.define('dots', () => {}), /already defined/);
  assert.throws(() => env.w.DocCharts.define('Dots', () => {}), /lowercase/);
  assert.throws(() => env.w.DocCharts.define('ticks', {}), /a draw function, or a part with a mount function/);
  // A part: mounted once in its emptied host, told of a redraw (update), destroyed with its host, its
  // signal aborted then.
  const part = [];
  env.w.DocCharts.define('ticker', { mount({host, data, signal}) {
    part.push(['mount', data.step]);
    signal.addEventListener('abort', () => part.push(['aborted']));
    host.append(env.w.document.createElement('button'));
    return { update: ({data: next}) => part.push(['update', next.step]), destroy: () => part.push(['destroy']) };
  } });
  env.flush();
  env.w.DocCharts.get('#part').redraw({ step: 2 }); env.flush();
  env.w.document.querySelector('#part').remove(); env.flush();
  await Promise.resolve();
  assert.deepEqual(plain(part), [['mount', 1], ['update', 2], ['aborted'], ['destroy']], 'its signal aborted as it goes, then destroyed');
  // A broken declaration: logged, the others drawn; its handle none.
  env.w.DocCharts.define('broken', () => {});
  env.flush();
  assert.ok(errors.some((error) => /not valid JSON/.test(error)), errors.join('\n'));
  assert.equal(env.w.DocCharts.get('#broken'), null);
  env.w.DocCharts.get('#own').destroy(); env.flush();
  assert.equal(own.children.length, 1, 'destroyed: its data alone stays');
  // A tone is its token (--doc-<name>), the kit's CSS defines every tone the SDK names, and a
  // report that overrides one changes the tone with the property (tokens.success and tone('success') agree).
  {
    const sdkTones = /tone: \(name: ([^)]+)\) => string/.exec(await fs.readFile(new URL('../../skills/gallery/sdk/doc-tokens.d.ts', import.meta.url), 'utf8'))[1].match(/"([a-z]+)"/g).map((name) => name.slice(1, -1));
    assert.deepEqual(sdkTones.filter((name) => !new RegExp(`--doc-${name}:`).test(reportCss)), [], 'tokens.css defines every tone the SDK names');
    const root = env.w.document.documentElement;
    root.style.setProperty('--doc-success', 'rgb(1, 2, 3)');
    assert.equal(env.w.DocTokens.read().tone('success'), 'rgb(1, 2, 3)', 'tone() reads the token a report may override');
    assert.equal(env.w.DocTokens.read().tone('success'), env.w.DocTokens.read().success, 'as tokens.success does');
    root.style.removeProperty('--doc-success');
  }
  env.dom.window.close();
}

const tableHtml = '<table class="doc-table" id="table"><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>A</td><td>3</td></tr><tr><td>B</td><td>1</td></tr><tr><td>C</td><td>2</td></tr></tbody></table>';
env = environment(tableHtml); env.load('tables');
const tables = env.w.DocTables;
await started(env);
assert.deepEqual(Object.keys(tables).sort(), ['allocateColumnWidths', 'getState', 'layout', 'setState', 'subscribe'], 'DocTables holds what sdk/doc-tables.d.ts declares: the page editor reads cells by src/shared/number-reading.mjs, through no hook of the kit');
let sorted; tables.subscribe('#table', (next) => sorted = next);
tables.setState('#table', {sort:{column:1, direction:'asc'}});
assert.equal(env.w.document.querySelector('tbody tr td').textContent, 'B');
assert.equal(sorted.sort.direction, 'asc');
tables.setState('#table', {sort:null});
assert.equal(env.w.document.querySelector('tbody tr td').textContent, 'A');
const sortArrow = () => env.w.document.querySelector('.doc-table-sort-button').dataset.docSortArrow;
const sortHeader = () => env.w.document.querySelector('#table thead th:nth-child(2)');
const rowNames = () => [...env.w.document.querySelectorAll('#table tbody tr td:first-child')].map((cell) => cell.textContent).join('');
assert.equal(sortArrow(), 'none', 'the arrow of a header not sorted by shows both its triangles (data-doc-sort-arrow="none"; styles/table.css draws it)');
assert.equal(sortHeader().getAttribute('aria-sort'), 'none');
// A press goes round: no sort, ascending, descending, no sort (the rows as they were).
env.w.document.querySelector('.doc-table-sort-button').click();
assert.equal(tables.getState('#table').sort.direction, 'asc', 'the first press sorts ascending, a number too');
assert.deepEqual([sortArrow(), sortHeader().getAttribute('aria-sort'), rowNames()], ['asc', 'ascending', 'BCA'], 'ascending: the upward triangle alone, the rows by their numbers');
assert.match(env.w.document.querySelector('.doc-table-sort-button').getAttribute('aria-label'), /降序/, 'its label says the next press sorts descending');
env.w.document.querySelector('.doc-table-sort-button').click();
assert.equal(tables.getState('#table').sort.direction, 'desc');
assert.deepEqual([sortArrow(), sortHeader().getAttribute('aria-sort'), rowNames()], ['desc', 'descending', 'ACB'], 'descending: the downward triangle alone');
assert.match(env.w.document.querySelector('.doc-table-sort-button').getAttribute('aria-label'), /取消/, 'its label says the next press clears the sort');
env.w.document.querySelector('.doc-table-sort-button').click();
assert.equal(tables.getState('#table').sort, null, 'the third press clears the sort');
assert.deepEqual([sortArrow(), sortHeader().getAttribute('aria-sort'), rowNames()], ['none', 'none', 'ABC'], 'no sort: both triangles, the rows in the order they had');
env.w.document.querySelector('.doc-table-sort-button').click();
assert.equal(tables.getState('#table').sort.direction, 'asc', 'and round again');
tables.setState('#table', {sort:{column:1, direction:'desc'}});
assert.equal(sortArrow(), 'desc');
tables.setState('#table', {sort:{column:1, direction:'asc'}});
assert.equal(sortArrow(), 'asc');
assert.throws(() => tables.setState('#table', {sort:{column:20, direction:'asc'}}), /Invalid/);
env.dom.window.close();

// The order a table opens in (a header's data-sort-default, the sort a bound key holds) is applied unless the page holds the file's order
// (html[data-ge-order="file"]: the page the editor serves, whose blocks and table tools count rows as the file has them, so that no one
// puts the rows back); sorting by a header or a state still sorts there.
{
  const body = (attributes, header) => '<table class="doc-table" id="t"' + attributes + '><thead><tr><th>Name</th><th' + header + '>Value</th></tr></thead><tbody><tr><td>A</td><td>3</td></tr><tr><td>B</td><td>1</td></tr><tr><td>C</td><td>2</td></tr></tbody></table>';
  const rows = (page) => [...page.w.document.querySelectorAll('#t tbody tr td:first-child')].map((cell) => cell.textContent).join('');
  for (const held of [false, true]) {
    const byHeader = environment(body('', ' data-sort-default="asc"'));
    if (held) byHeader.w.document.documentElement.setAttribute('data-ge-order', 'file');
    byHeader.load('tables');
    await started(byHeader);
    assert.equal(rows(byHeader), held ? 'ABC' : 'BCA', 'its default sort ' + (held ? 'is not applied' : 'is'));
    // The bound key's sort shown as the page opens (the key set before the table started here).
    const late = environment(body(' data-doc-bind="order"', ''));
    late.load('tables');
    late.w.DocKit.bindings.set('order', {sort: {column: 1, direction: 'asc'}});
    if (held) late.w.document.documentElement.setAttribute('data-ge-order', 'file');
    await started(late);
    assert.equal(rows(late), held ? 'ABC' : 'BCA', 'the sort of the bound key ' + (held ? 'is not applied as the table starts' : 'is'));
    byHeader.w.DocTables.setState('#t', {sort: {column: 1, direction: 'asc'}});
    assert.equal(rows(byHeader), 'BCA', 'a sort asked for sorts either way');
    for (const page of [byHeader, late]) page.dom.window.close();
  }
}

// A merged header cell: one judgement for the number reading, the sort and the layout. Its second
// header cell is not the second column's (its cells' 3 and 1 are the Region's, not the Note's), so nothing is read as numbers and no header sorts (as with
// merged body cells); a footer's merged cell reads none of the columns, so it changes nothing.
for (const [name, html, merged] of [
  ['header', '<thead><tr><th colspan="2">Region</th><th>Note</th></tr></thead><tbody><tr><td>N</td><td>3</td><td>fine</td></tr><tr><td>S</td><td>1</td><td>late</td></tr></tbody>', true],
  ['body', '<thead><tr><th>Area</th><th>Name</th><th>Sales</th></tr></thead><tbody><tr><td colspan="2">N East</td><td>3</td></tr><tr><td>S</td><td>West</td><td>1</td></tr></tbody>', true],
  ['footer', '<thead><tr><th>Area</th><th>Name</th><th>Sales</th></tr></thead><tbody><tr><td>N</td><td>East</td><td>3</td></tr><tr><td>S</td><td>West</td><td>1</td></tr></tbody><tfoot><tr><td colspan="2">Total</td><td>4</td></tr></tfoot>', false],
]) {
  env = environment('<div class="doc-table-wrap"><table class="doc-table" id="merged">' + html + '</table></div>'); env.load('tables');
  const mergedTable = env.w.document.querySelector('#merged');
  env.w.DocTables.layout(mergedTable);
  assert.equal(mergedTable.querySelectorAll('.number').length > 0, !merged, 'a table with a merged ' + name + ' cell: numbers read ' + (merged ? 'for no column' : 'as ever'));
  assert.equal(mergedTable.querySelectorAll('.doc-table-sort-button').length > 0, !merged, 'a table with a merged ' + name + ' cell: sorting ' + (merged ? 'off' : 'on'));
  if (merged) assert.equal(mergedTable.querySelector('thead [data-sort-type]'), null, 'no header takes a sort type');
  if (merged) assert.equal(mergedTable.classList.contains('doc-table--auto'), false, 'a merged table is left to the browser layout');
  env.dom.window.close();
}

// Automatic column widths: balanced wrapping, protected short fields and DOM refresh.
env = environment('<div class="doc-table-wrap">' + tableHtml + '</div>'); env.load('tables');
const allocate = env.w.DocTables.allocateColumnWidths;
const inputs = [
  {key:'model', header:'Model', cells:['Model A', 'Model B']},
  {key:'score', header:'Score', cells:[92.5, 88]},
  {key:'source', header:'Source', cells:['/datasets/very-long-folder-name/benchmark-v1.jsonl']},
  {key:'description', header:'Description', cells:['这是一段没有空格的中文说明文字，需要识别为自然语言并且根据表格的可用空间正常换行。']},
];
const natural = plain(allocate(inputs, {totalWidth:2000}));
assert.deepEqual(natural.map(c => c.kind), ['compact','compact','token-heavy','narrative']);
const sumWidths = columns => columns.reduce((sum, c) => sum + c.width, 0);
const reduced = plain(allocate(inputs, {totalWidth:sumWidths(natural)-30}));
assert.ok(reduced[2].width < natural[2].width);
assert.equal(reduced[0].width, natural[0].width);
assert.ok(reduced[3].width < natural[3].width, 'Prose shares compression with paths');
assert.ok(Math.abs((reduced[2].width-24)/(natural[2].width-24)
  - (reduced[3].width-24)/(natural[3].width-24)) < 1e-9, 'Text compression is balanced independently of padding');
for (const totalWidth of [60, 200, 400, 800, 1200]) {
 const result = plain(allocate(inputs, {totalWidth}));
 assert.deepEqual(result, plain(allocate(inputs, {totalWidth})));
 assert.ok(Math.abs(result.reduce((n,c) => n+c.ratio, 0)-1)<1e-9);
 assert.ok(result.every(c => c.width >= c.softMinWidth - 1e-6 && c.width <= c.preferredWidth + 1e-6));
 assert.ok(sumWidths(result) <= Math.max(totalWidth, result.reduce((sum, c) => sum + c.softMinWidth, 0))+1e-5);
}
const matrixInputs = Array.from({length:19}, (_, index) => ({key:String(index), header:index === 0 ? '实验' : '金融长窗口', cells:index === 0 ? ['候选 A','候选 B'] : [51.2,47.8], headerWidth:index === 0 ? 60 : 117}));
const matrix = plain(allocate(matrixInputs, {totalWidth:920, font:'15px system-ui'}));
assert.ok(sumWidths(matrix) > 920, 'Wide score matrices must scroll before becoming unreadable');
assert.ok(matrix.every(column => Math.abs(column.width-column.preferredWidth)<1e-6), 'Normal compact fields keep their complete preferred width');
const mixed = plain(allocate(inputs, {totalWidth:600}));
assert.ok(sumWidths(mixed) <= 600.000001, 'Mixed content can still fit by compressing long columns');
assert.equal(mixed[0].width, natural[0].width);
assert.equal(mixed[1].width, natural[1].width);
const equal = plain(allocate(['a','b'].map(key => ({key, header:key, cells:['/long/path/'.repeat(20)]})), {totalWidth:200}));
assert.ok(Math.abs(equal[0].width - equal[1].width)<1e-6);
const floorInputs = [
 {key:'path', header:'Path', cells:['/data/'.repeat(30)], cellWidths:[600], minWidth:400},
 {key:'text', header:'Text', cells:['Long description text. '.repeat(4)], cellWidths:[1200]},
];
const floorLimited = plain(allocate(floorInputs, {totalWidth:1000}));
assert.ok(Math.abs(floorLimited[0].width-400)<1e-6, 'A bound is respected while the other column absorbs remaining compression');
assert.ok(Math.abs(floorLimited[1].width-600)<1e-6);
assert.deepEqual(plain(allocate([...floorInputs].reverse(), {totalWidth:1000})).reverse(), floorLimited, 'Column order does not affect allocation');
const p90 = plain(allocate([{key:'s', header:'S', cells:[...Array(19).fill('short'), 'x'.repeat(1000)]}], {totalWidth:10000}));
assert.ok(p90[0].preferredWidth < 100);
const shortSeries = plain(allocate([{key:'series', header:'系列', cells:['API', 'Agent']}], {totalWidth:400}));
const longestSeries = plain(allocate([{key:'series', header:'系列', cells:['Agent']}], {totalWidth:400}));
assert.equal(shortSeries[0].width, longestSeries[0].width, 'P90 must not shave characters off short labels in small tables');
const shortOutlier = plain(allocate([{key:'name', header:'Name', cells:[...Array(19).fill('A'), 'Model Kestrel']}], {totalWidth:400}));
const longestName = plain(allocate([{key:'name', header:'Name', cells:['Model Kestrel']}], {totalWidth:400}));
assert.equal(shortOutlier[0].width, longestName[0].width, 'Even infrequent labels within compact protection fit completely');
const modelNames = {key:'model', header:'模型', cells:['Kimi-K3-256K','GLM-5.3-Flash','DeepSeek-V4.1-Flash'], cellWidths:[140,150,190]};
const withRoom = plain(allocate([modelNames], {totalWidth:400}));
assert.equal(withRoom[0].width, 190, 'Spare space completes a short label above the 160px protection budget');
const withoutRoom = plain(allocate([modelNames], {totalWidth:180}));
assert.ok(withoutRoom[0].width <= 180, 'Completing labels never forces extra horizontal overflow');
assert.equal(allocate([{...modelNames, maxWidth:175}], {totalWidth:400})[0].width, 175, 'Explicit bounds still win');
const rareHugeName = {key:'rare', header:'Name', cells:[...Array(30).fill('A'),'UnusuallyWide'], cellWidths:[...Array(30).fill(50),2000]};
assert.ok(allocate([rareHugeName], {totalWidth:920})[0].width < 100, 'An outlier that cannot fit does not consume spare width');
{
  // A short text column beside columns of prose (卷数 beside 看点): its floor is its words (P90 of its
  // cells' longest words, WORD_BREAKS: 六十卷、 / 目录一卷), not its whole values, so that adding it to
  // a table of prose keeps the prose inside the frame; still past it, such columns give up their
  // longest words, the widest first, down to the median word; a table that scrolls anyway keeps their
  // words whole, and a table of short fields alone its values whole. (No canvas here: a Chinese
  // character 14px, the cells' padding 24px.)
  const prose = (key) => ({key, header:key, cells:Array(4).fill('这是一段比较长的说明文字，写满了好几行才能读完它的意思，后面还有更多更多的内容')});
  const volumes = {key:'volumes', header:'卷数', cells:['六十卷、目录一卷', '三卷', '未著录', '九卷、补遗一卷']};
  const table = [prose('书名'), volumes, prose('看点')];
  const whole = plain(allocate([volumes], {totalWidth:100}));
  assert.equal(whole[0].softMinWidth, 8*14+24, 'Alone, a short field keeps its whole value');
  const words = plain(allocate(table, {totalWidth:500}));
  assert.equal(words[1].softMinWidth, 4*14+24, 'Beside prose, its floor is its longest word');
  assert.ok(sumWidths(words) <= 500 + 1e-6 && words[1].width >= 4*14+24, `The table fits with each word whole (${sumWidths(words)})`);
  const median = plain(allocate(table, {totalWidth:487}));
  assert.ok(sumWidths(median) <= 487 + 1e-6, 'Still past the frame: its longer words give way');
  assert.ok(median[1].width < 4*14+24 && median[1].width >= (3*14+24 + 4*14+24) / 2 - 1e-6, `Down to its median word at most (${median[1].width})`);
  const scrolls = plain(allocate(table, {totalWidth:475}));
  assert.equal(scrolls[1].width, 4*14+24, 'A table that scrolls anyway keeps its words whole');
  // Never below its widest piece no line breaks in (PIECE_BREAKS: （1606）， is one), whatever the
  // frame: a column narrower would cut it anywhere, its comma starting a line. (A Latin character
  // 0.55 of the font's 14px.)
  const years = {key:'years', header:'刊印年代', cells:['庆长十一年（1606），据版本比定', '元和二年（1616）', '宽永二年（1625）', '庆长二年（1597）']};
  const piece = 3*14 + 4*14*0.55 + 24;
  const narrowest = Math.min(...Array.from({length:30}, (_, step) => plain(allocate([prose('书名'), years, prose('看点')], {totalWidth:420 + step*4}))[1].width));
  assert.ok(narrowest >= piece - 1e-6, `Never below its widest piece (${narrowest} < ${piece})`);
}
assert.equal(allocate([], {totalWidth:200}).length, 0);
assert.throws(() => allocate(inputs, {totalWidth:NaN}), /totalWidth/);
assert.throws(() => allocate([{key:'a', header:'A', cells:[], maxWidth:20}], {totalWidth:200}), /hard minimum/);
assert.throws(() => allocate([{key:'a', header:'A', cells:[Infinity]}], {totalWidth:200}), /finite/);
assert.throws(() => allocate([inputs[0],inputs[0]], {totalWidth:200}), /unique/);
assert.throws(() => allocate([{...inputs[0], cellWidths:[10]}], {totalWidth:200}), /cellWidths/);
assert.throws(() => allocate([{...inputs[0], cellWidths:[10,NaN]}], {totalWidth:200}), /cellWidths/);
const longFloor = plain(allocate([{key:'p', header:'Path', cells:['/data/'.repeat(100)]}], {totalWidth:100}));
assert.equal(longFloor[0].width, 320, 'Extreme text has a bounded readable floor, not a full-line column');
const numericTable = env.w.document.querySelector('#table');
const wrapper = numericTable.parentElement;
let availableWidth = 600;
wrapper.getBoundingClientRect = () => ({width:availableWidth});
let columns = env.w.DocTables.layout(numericTable);
assert.equal(numericTable.querySelectorAll('colgroup[data-doc-columns] col').length, 2);
assert.equal(numericTable.querySelector('td').textContent, 'A');
assert.ok(columns.every(c => c.kind === 'compact'));
assert.equal(numericTable.querySelector('th:nth-child(2)').hasAttribute('data-column-wrap'), false, 'Header and sort indicator fit the allocated numeric column');
const originalPreferred = columns[0].preferredWidth;
for (const row of numericTable.tBodies[0].rows) row.cells[0].textContent = 'a-long-model-identifier-without-spaces';
await Promise.resolve(); env.flush();
columns = env.w.DocTables.layout(numericTable);
assert.ok(columns[0].preferredWidth > originalPreferred);
availableWidth = 60;
columns = env.w.DocTables.layout(numericTable);
assert.ok(sumWidths(columns) > 96, 'Scroll at readable floors rather than forcing each column to 48px');
assert.ok(columns.every(column => column.width >= column.softMinWidth - 1e-6));
assert.equal(numericTable.querySelectorAll('colgroup').length, 1);
const narrowWidth = numericTable.style.width;
const narrowSum = sumWidths(columns);
availableWidth = 0; env.w.DocTables.layout(numericTable);
assert.equal(numericTable.style.width, narrowWidth, 'Hidden tables keep their last valid layout');
availableWidth = 500; env.w.dispatchEvent(new env.w.Event('resize')); env.flush();
assert.ok(parseFloat(numericTable.style.width) > narrowSum);
const tableSnapshot = numericTable.outerHTML;
const hydrated = environment('<div class="doc-table-wrap">'+tableSnapshot+'</div>'); hydrated.load('tables');
hydrated.w.DocTables.layout('#table');
assert.equal(hydrated.w.document.querySelectorAll('colgroup').length, 1);
hydrated.dom.window.close();
numericTable.rows[1].cells[0].colSpan = 2;
env.w.DocTables.layout(numericTable);
assert.equal(numericTable.classList.contains('doc-table--auto'), false);
assert.equal(numericTable.querySelector('colgroup[data-doc-columns]'), null);
env.dom.window.close();
// A footer's cells (<tfoot>: a total) are measured and laid out with the body's: a total wider than
// its column's numbers widens the column, and takes its kind.
{
  const footedLayout = (foot) => {
    const page = environment(`<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody><tr><td>A</td><td>3</td></tr><tr><td>B</td><td>1</td></tr></tbody>${foot}</table></div>`);
    page.w.HTMLCanvasElement.prototype.getContext = () => ({font: '', measureText(text) { return {width: text.length * 8}; }});
    page.load('tables');
    const table = page.w.document.querySelector('table');
    table.parentElement.getBoundingClientRect = () => ({width: 600});
    const columns = plain(page.w.DocTables.layout(table));
    const kinds = [...(table.tFoot?.rows[0]?.cells || [])].map((cell) => cell.dataset.columnKind ?? null);
    page.dom.window.close();
    return {columns, kinds};
  };
  const bare = footedLayout('');
  const footed = footedLayout('<tfoot><tr><td>Total</td><td>1234567890123456</td></tr></tfoot>');
  assert.ok(footed.columns[1].preferredWidth > bare.columns[1].preferredWidth, 'The total widens its column');
  assert.deepEqual(footed.kinds, footed.columns.map((column) => column.kind), 'Footer cells take their column\'s kind');
}
{
  // A word typed in a cell (a change of the table's content the kit hears) measures that cell again,
  // not every cell (layout.js cellMeasures: each cell's measure kept with what it was measured from),
  // and the widths come out as a layout measuring every cell (DocTables.layout) makes them.
  const rows = Array.from({length: 12}, (_, row) => `<tr><td>Model ${row}</td><td>${'a note of a few words '.repeat(1 + row % 3)}</td><td>${row * 1.5}</td></tr>`).join('');
  const page = environment(`<main class="doc-page"><div class="doc-table-wrap"><table class="doc-table" id="typed"><thead><tr><th>Model</th><th>Note</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table></div></main>`);
  page.load('tables');
  await started(page);
  const table = page.w.document.querySelector('#typed');
  const text = Object.getOwnPropertyDescriptor(page.w.Node.prototype, 'textContent');
  let read = 0; // the words of cells read (measureWords reads each text node)
  Object.defineProperty(page.w.Node.prototype, 'textContent', {...text, get() { if (this.nodeType === 3) read += 1; return text.get.call(this); }});
  const typedIn = table.tBodies[0].rows[4].cells[1];
  read = 0;
  typedIn.firstChild.appendData('and a few more words typed');
  await Promise.resolve(); page.flush();
  const typed = {read, columns: table.querySelector('colgroup[data-doc-columns]').outerHTML};
  read = 0;
  page.w.DocTables.layout(table);
  assert.ok(typed.read > 0 && typed.read <= 2, `the cell typed in measured again alone (${typed.read} words read; every cell: ${read})`);
  assert.ok(read >= 39, `DocTables.layout measures every cell (${read} words read)`);
  assert.equal(table.querySelector('colgroup[data-doc-columns]').outerHTML, typed.columns, 'the same widths as a layout measuring every cell');
  page.dom.window.close();
}
{
  // Fonts that load later (loadingdone, its faces): a table is laid out again, every cell measured,
  // for a face of a family it measured its words in, or KaTeX's for one holding a formula; not for
  // another's. A change made quietly (DocKit.quietly: the page editor starting) is laid out once
  // the page is idle (here a timer), not in the next frame.
  let fonts;
  const cells = (formula) => Array.from({length: 6}, (_, row) => `<tr><td style="font-family: 'Probe Sans', sans-serif">row ${row}</td><td style="font-family: 'Probe Sans', sans-serif">${row === 2 && formula ? '<span class="katex">x</span>' : `words ${row}`}</td></tr>`).join('');
  const page = environment(`<main class="doc-page"><div class="doc-table-wrap"><table class="doc-table" id="plain"><thead><tr><th>A</th><th>B</th></tr></thead><tbody>${cells(false)}</tbody></table></div><div class="doc-table-wrap"><table class="doc-table" id="formula"><thead><tr><th>A</th><th>B</th></tr></thead><tbody>${cells(true)}</tbody></table></div></main>`, '', undefined, (w) => {
    fonts = new w.EventTarget();
    fonts.ready = new Promise(() => {}); // no word that every font is in
    Object.defineProperty(w.document, 'fonts', {value: fonts});
  });
  page.load('tables');
  await started(page);
  const text = Object.getOwnPropertyDescriptor(page.w.Node.prototype, 'textContent');
  const read = new Map(); // table id -> words of its cells read, and formulas' drawings measured
  const count = (node) => {
    const id = node?.closest('table')?.id;
    if (id) read.set(id, (read.get(id) ?? 0) + 1);
  };
  Object.defineProperty(page.w.Node.prototype, 'textContent', {...text, get() {
    if (this.nodeType === 3) count(this.parentElement);
    return text.get.call(this);
  }});
  const rects = page.w.Element.prototype.getClientRects;
  page.w.Element.prototype.getClientRects = function () {
    if (this.classList.contains('katex')) count(this);
    return rects.call(this);
  };
  const loaded = (...families) => {
    read.clear();
    const event = new page.w.Event('loadingdone');
    event.fontfaces = families.map((family) => ({family}));
    fonts.dispatchEvent(event);
    page.flush();
    return Object.fromEntries(['plain', 'formula'].map((id) => [id, read.get(id) ?? 0]));
  };
  assert.deepEqual(loaded('Other Face'), {plain: 0, formula: 0}, 'a face of a family no cell is measured in: neither table laid out');
  assert.deepEqual(loaded('KaTeX_Main'), {plain: 0, formula: 1}, "KaTeX's: the table holding a formula alone, its formula's cell alone measured again");
  const both = loaded('"Probe Sans"');
  assert.ok(both.plain >= 12 && both.formula >= 11, `a face of the cells' family: both tables, every cell measured again (${JSON.stringify(both)})`);
  const plainTable = page.w.document.querySelector('#plain');
  read.clear();
  page.w.DocKit.quietly(() => { plainTable.tBodies[0].rows[0].cells[1].textContent = 'rebuilt words'; });
  page.flush();
  assert.equal(read.get('plain') ?? 0, 0, 'a quiet change: not laid out in the next frame');
  await new Promise((resolve) => page.w.setTimeout(resolve, 80));
  page.flush();
  assert.equal(read.get('plain'), 1, 'laid out once the page is idle, the cell changed measured again alone');
  page.dom.window.close();
}
console.log('Checked automatic columns: P90, CJK, balanced wrapping/water filling, readable scrolling floors, a short field beside prose never below its widest piece, ratios, mutations, resize, hidden tables and rehydration, a footer measured with the body, a word typed measuring its cell alone.');

// Inline fonts/padding and disclosure lifecycle share the regular table allocator.
const inlinePath = '/datasets/finance/reasoning/multidocument/long-context/validation-set.jsonl';
env = environment(`<details id="disclosure"><summary>Table</summary><div class="doc-table-wrap"><table class="doc-table" id="inline-table" data-doc-table-static><thead><tr><th>Path</th><th>Name</th></tr></thead><tbody><tr><td><code style="font:14px monospace;padding:1px 5px">${inlinePath}</code></td><td>X <code style="font:14px monospace;padding:1px 5px">abcdef</code> Y</td></tr></tbody></table></div></details>`, '<style>#inline-table th, #inline-table td {padding:10px 12px}</style>');
env.w.HTMLCanvasElement.prototype.getContext = () => ({font:'', measureText(text) { return {width:Array.from(text).reduce((sum, c) => sum + (/[^\x00-\xff]/.test(c) ? 15 : this.font.includes('monospace') ? 9 : 5), 0)}; }});
const disclosure = env.w.document.querySelector('#disclosure');
const inlineTable = env.w.document.querySelector('#inline-table');
let disclosureWidth = 320;
inlineTable.parentElement.getBoundingClientRect = () => ({width:disclosure.open ? disclosureWidth : 0});
env.load('tables');
assert.deepEqual(plain(env.w.DocTables.layout(inlineTable)), [], 'Closed content waits for measurable width');
disclosure.open = true; await Promise.resolve(); env.flush();
const inlineLayout = plain(env.w.DocTables.layout(inlineTable));
assert.equal(inlineLayout[0].preferredWidth, inlinePath.length*9+10+24, 'Measure code font plus code and cell padding');
assert.equal(inlineLayout[1].preferredWidth, 108, 'Mixed inline fonts retain surrounding spaces and padding');
// Inline code breaks only after a slash or at a space (styles/table.css): its column is at least as
// wide as its longest run, up to 320px of it (layout.js CODE_RUN_MAX), and the code's and the cell's
// padding; a longer run breaks where its column ends.
const longestRun = 'validation-set.jsonl'.length*9+10+24;
assert.ok(inlineLayout[0].width >= longestRun && inlineLayout[0].width < 320+24, `A path in code: its column as wide as its longest run after a slash, not the whole path (${inlineLayout[0].width})`);
assert.equal(inlineLayout[1].width >= 6*9+10+24, true, 'A short run of code whole on its line');
assert.ok(sumWidths(inlineLayout)>320, 'Use local scrolling when readable widths exceed a narrow disclosure');
disclosure.open = false; await Promise.resolve(); env.flush();
assert.deepEqual(plain(env.w.DocTables.layout(inlineTable)), inlineLayout);
disclosureWidth = 600; disclosure.open = true; await Promise.resolve(); env.flush();
assert.ok(env.w.DocTables.layout(inlineTable)[0].width > inlineLayout[0].width, 'Reopening at a wider size remeasures');
env.dom.window.close();
{
  // Columns at the widths the reader gave them (--doc-column-width): layout() still answers in the
  // shape of every layout (ColumnLayout, skills/gallery/sdk/doc-tables.d.ts), the given width in each field.
  const sized = environment('<div class="doc-table-wrap"><table class="doc-table" id="sized"><thead><tr><th style="--doc-column-width: 150px">A</th><th>B</th></tr></thead><tbody><tr><td>x</td><td>y</td></tr></tbody></table></div>');
  sized.load('tables'); await started(sized);
  const columns = plain(sized.w.DocTables.layout('#sized'));
  assert.equal(columns.length, 2);
  for (const column of columns) assert.deepEqual(Object.keys(column).sort(), ['hardMinWidth', 'key', 'kind', 'preferredWidth', 'ratio', 'softMinWidth', 'width'], 'a hand-sized table answers with every field of ColumnLayout');
  assert.deepEqual([columns[0].kind, columns[0].width, columns[0].preferredWidth, columns[0].softMinWidth, columns[0].hardMinWidth], ['compact', 150, 150, 150, 150], 'a column keeps the width it was given');
  assert.ok(Math.abs(columns[0].ratio + columns[1].ratio - 1) < 1e-9, 'the ratios share the whole');
  sized.dom.window.close();
}
{
  // Columns are read by the slots the page editor and the server read too (src/shared/table-slots.mjs):
  // a rowspan past the header row tiles no rectangle there either, so the width on its cell is not
  // read and the browser lays the table out (the kit once let a span cross the thead's end).
  const odd = environment('<div class="doc-table-wrap"><table class="doc-table" id="odd"><thead><tr><th rowspan="2" style="--doc-column-width: 150px">A</th><th>B</th></tr></thead><tbody><tr><td>y</td></tr></tbody></table></div>');
  odd.load('tables'); await started(odd);
  const oddTable = odd.w.document.querySelector('#odd');
  odd.w.DocTables.layout(oddTable);
  assert.equal(oddTable.classList.contains('doc-table--auto'), false, 'a span past the header row: no manual layout');
  assert.equal(oddTable.querySelector('colgroup[data-doc-columns]'), null);
  odd.dom.window.close();
}
{
  // A run of code under 320px whole on its line: a column of prose holding one is at least as wide
  // as it (and its padding), however narrow the frame. A run ends after its slashes (cells.js
  // codeRuns; slashes before a name start its run), never at a hyphen or around a Chinese character.
  // On a narrow screen (420px or below) a column needs no more than the room the other columns leave
  // at their floor there (a third of the room each) for it. The code
  // is drawn in its runs (.doc-code-run, a <wbr> after each slash) and joined again for an export
  // of the view; a run wider than its column lets its code break (data-run-wrap): between its names
  // first, at the <wbr> in it (`names`: after a dot, before underscores, where a lowercase letter
  // meets a capital; styles/table.css hides them in a run kept whole), else anywhere. Code in a
  // cell the page editor edits is not drawn in runs: its column holds it where Chrome breaks it
  // (after a hyphen). A number range held on one line (.doc-range) is a run too.
  const columnsFor = (code, narrow = false, {editing = false, more = false, inner = `<code style="font:14px monospace;padding:1px 5px">${code}</code>`} = {}) => {
    const page = environment(`<div class="doc-table-wrap"><table class="doc-table" id="code-run"><thead><tr><th>Name</th><th>Note</th>${more ? '<th>More</th>' : ''}</tr></thead><tbody><tr><td>A</td><td${editing ? ' contenteditable="true"' : ''}>见 ${inner} 里的说明，这一列是一段比较长的文字</td>${more ? '<td>又一列比较长的说明文字，写满了好几行</td>' : ''}</tr></tbody></table></div>`, '<style>#code-run th, #code-run td {padding:10px 12px}</style>', (query) => ({matches: narrow && query === '(max-width: 420px)', addEventListener() {}, removeEventListener() {}}));
    page.w.HTMLCanvasElement.prototype.getContext = () => ({font:'', measureText(text) { return {width:Array.from(text).reduce((sum, c) => sum + (/[^\x00-\xff]/.test(c) ? 15 : this.font.includes('monospace') ? 9 : 5), 0)}; }});
    page.load('tables');
    const table = page.w.document.querySelector('#code-run');
    table.parentElement.getBoundingClientRect = () => ({width: narrow ? 330 : 200});
    const columns = plain(page.w.DocTables.layout(table));
    const shown = table.querySelector('code, .doc-range');
    const drawn = {runs: [...shown.querySelectorAll('.doc-code-run')].map((node) => node.textContent), breaks: shown.querySelectorAll(':scope > wbr').length, names: [...shown.querySelectorAll('.doc-code-run')].map((node) => [...node.childNodes].map((part) => (part.nodeType === 3 ? part.textContent : '|')).join('')), wraps: shown.closest('td').hasAttribute('data-run-wrap')};
    const copy = table.parentElement.cloneNode(true); // an export of the view: its frame and what it holds
    page.w.DocKit.dehydrate(copy);
    drawn.copy = copy.querySelector('code')?.innerHTML;
    page.dom.window.close();
    return Object.assign(columns, {drawn});
  };
  const run = 'kit-tables-layout.js';
  const columns = columnsFor(run);
  assert.equal(columns[1].hardMinWidth, run.length*9+10+24, 'The column holds the run of code whole: its hard floor');
  assert.ok(columns[1].width >= run.length*9+10+24, 'A narrow frame scrolls rather than break the code inside a word');
  assert.deepEqual(columns.drawn, {runs: [run], breaks: 0, names: ['kit-tables-layout.|js'], wraps: false, copy: run}, 'One run, none to break, joined for a copy');
  assert.equal(columnsFor('--doc-table-height')[1].hardMinWidth, '--doc-table-height'.length*9+10+24, 'A hyphen ends no run');
  const path = columnsFor('/__local/files/<哈希>/README.md');
  assert.equal(path[1].hardMinWidth, 'README.md'.length*9+10+24, 'A slash ends a run, a Chinese character does not');
  assert.deepEqual(path.drawn, {runs: ['/__local/', 'files/', '<哈希>/', 'README.md'], breaks: 3, names: ['/__local/', 'files/', '<哈希>/', 'README.|md'], wraps: false, copy: '/__local/files/&lt;哈希&gt;/README.md'}, 'Its runs drawn with a break after each slash (none after a leading one, nor before the underscores after it), joined for a copy');
  const names = columnsFor('window.__demo.requestAnimationFrame NODE_ENV __init__.py ..', true);
  assert.deepEqual([names.drawn.names, names.drawn.copy], [['window.|__demo.|request|Animation|Frame', 'NODE|_ENV', '__init__.|py', '..'], 'window.__demo.requestAnimationFrame NODE_ENV __init__.py ..'], 'A run breaks between its names: after a dot, before underscores (not leading or trailing ones), between a lowercase letter and a capital; joined for a copy');
  assert.equal(names.drawn.wraps, true, 'wider than its column: it may break, at those places first');
  assert.equal(columnsFor(run, true)[1].hardMinWidth, run.length*9+10+24, 'On a narrow screen whole beside one column at its floor (two thirds of the room)');
  assert.equal(columnsFor(run, true, {more: true})[1].hardMinWidth, 110, 'Beside two, a third of the room at most: the table still fits');
  assert.equal(columnsFor('server/local-store.js', true)[1].hardMinWidth, 'local-store.js'.length*9+10+24, 'A file\'s name whole on a narrow screen');
  const long = columnsFor('a-file-name-longer-than-the-room-the-narrow-frame-has.js', true);
  assert.equal(long.drawn.wraps, true, 'A run wider than its column lets its code break anywhere');
  assert.equal(columns.drawn.wraps, false);
  const edited = columnsFor('src/view/theme/custom-vars.css', false, {editing: true});
  assert.deepEqual([edited[1].hardMinWidth, edited.drawn.runs], ['src/view/theme/custom-'.length*9+10+24, []], 'In a cell the page editor edits: not in runs, its column holding the code up to its hyphen, where Chrome breaks it');
  const range = columnsFor('', false, {inner: '<span class="doc-range">1,000,000–2,000,000</span>'});
  assert.deepEqual([range[1].hardMinWidth, range.drawn.wraps], [18*5 + 15 + 24, false], 'A number range whole: its column as wide as it');
  assert.equal(columnsFor('', true, {inner: `<span class="doc-range">${'1'.repeat(40)}–${'2'.repeat(40)}</span>`}).drawn.wraps, true, 'A range wider than its column may break (at its dash)');
}
{
  // At 420px or below (a phone), no column of text needs more than a third of the table's room
  // (maxReadableFloor): three columns of prose, or of short phrases, wrap them in the frame before
  // it scrolls; a column of numbers keeps its floor.
  const prose = '这一格是一段比较长的说明文字，写满了好几行才能读完它的意思';
  const phrase = '北京市朝阳区建国路';
  const widths = (narrow, cells) => {
    const body = `<div class="doc-table-wrap"><table class="doc-table" id="prose"><thead><tr>${cells.map((_, index) => `<th>${'甲乙丙'[index]}</th>`).join('')}</tr></thead><tbody>${`<tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>`.repeat(3)}</tbody></table></div>`;
    const page = environment(body, '', (query) => ({matches: narrow && query === '(max-width: 420px)', addEventListener() {}, removeEventListener() {}}));
    page.load('tables');
    const table = page.w.document.querySelector('#prose');
    table.parentElement.getBoundingClientRect = () => ({width: 328});
    const columns = plain(page.w.DocTables.layout(table));
    page.dom.window.close();
    return columns;
  };
  assert.ok(sumWidths(widths(false, [prose, prose, prose])) > 328, 'A wide screen: three prose columns at their readable floors scroll');
  const narrow = widths(true, [prose, prose, prose]);
  assert.ok(Math.abs(sumWidths(narrow) - 328) < 0.01 && narrow.every((column) => column.kind === 'narrative'), 'A narrow one: they share the frame, wrapping', JSON.stringify(narrow));
  assert.ok(sumWidths(widths(false, [phrase, phrase, phrase])) > 328, 'A wide screen: three columns of short phrases kept whole scroll');
  const phrases = widths(true, [phrase, phrase, phrase]);
  assert.ok(Math.abs(sumWidths(phrases) - 328) < 0.01 && phrases.every((column) => column.kind === 'compact'), 'A narrow one: they share the frame, wrapping', JSON.stringify(phrases));
  const numbers = widths(true, [phrase, phrase, '12,345,678,901,234']);
  assert.ok(numbers[2].softMinWidth > 328 / 3 && numbers[2].softMinWidth === numbers[2].preferredWidth, 'A column of numbers keeps its floor', JSON.stringify(numbers));
  assert.deepEqual(plain(allocate([{key: 'a', header: 'A', cells: [prose]}, {key: 'b', header: 'B', cells: [phrase.repeat(2)]}, {key: 'c', header: 'C', cells: ['/a/long/path/to/a/file/somewhere/deep.json'.repeat(2)]}], {totalWidth: 100, maxReadableFloor: 80})).map((column) => column.softMinWidth), [80, 80, 80], 'maxReadableFloor lowers every kind of floor');
  assert.equal(plain(allocate([{key: 'a', header: 'A', cells: [phrase.repeat(2)], numeric: true}], {totalWidth: 100, maxReadableFloor: 80}))[0].softMinWidth > 80, true, 'but a numeric column\'s');
  assert.throws(() => allocate([], {totalWidth: 100, maxReadableFloor: 0}), /maxReadableFloor/);
  assert.throws(() => allocate([{key: 'a', header: 'A', cells: [], numeric: 1}], {totalWidth: 100}), /numeric/);
}
{
  // A table shown whole (tables/whole.js, styles/table.css): its frame marked data-doc-whole,
  // which takes the kit's height off, when its body has 20 rows at most (a header row written in
  // the body not counted) or at least half of its body's text stands in its columns of words; not
  // a long table of data, names, paths or links. What it said is read again when its text changes.
  // An export of the view leaves the mark out.
  const sentence = '这一格是一段比较长的说明文字，读起来像正文';
  const lay = (rows, cells, head = true) => {
    const header = `<tr>${cells.map((_, index) => `<th>${index}</th>`).join('')}</tr>`;
    const body = Array.from({length: rows}, (_, row) => `<tr>${cells.map((cell) => `<td>${cell === 'n' ? row : cell}</td>`).join('')}</tr>`).join('');
    const page = environment(`<div class="doc-table-wrap"><table class="doc-table">${head ? `<thead>${header}</thead><tbody>` : `<tbody>${header}`}${body}</tbody></table></div>`);
    page.load('tables');
    const table = page.w.document.querySelector('table');
    page.w.DocTables.layout(table);
    return {page, table, whole: () => table.parentElement.hasAttribute('data-doc-whole')};
  };
  const marked = (rows, cells, head) => {
    const {page, whole} = lay(rows, cells, head);
    const result = whole();
    const copy = page.w.DocKit.dehydrate(page.w.document.documentElement.cloneNode(true));
    assert.equal(copy.querySelector('[data-doc-whole]'), null, 'an export of the view leaves the mark out');
    page.dom.window.close();
    return result;
  };
  assert.equal(marked(20, ['n', 'x']), true, 'a short table');
  assert.equal(marked(21, ['n', 'x']), false, 'a long table of data');
  assert.equal(marked(20, ['n', 'x'], false), true, 'a header row in the body is no row of it');
  assert.equal(marked(40, ['n', sentence]), true, 'a long table, a number and a sentence to a row');
  assert.equal(marked(40, ['2026-10-21', '短标题', '甲组', sentence]), true, 'a date, a title, a group and a note: a quarter of its cells, most of its text, words');
  assert.equal(marked(40, ['北京市朝阳区建国路一号', '上海市浦东新区世纪大道', '一句不算长的备注']), false, 'two columns of places and a short note: most of its text in short fields');
  assert.equal(marked(40, ['<code>/datasets/finance/reasoning/multidocument/long-context/part.jsonl</code>', 'n']), false, 'a long list of paths');
  assert.equal(marked(40, ['https://example.com/reports/2026/october/the-very-long-name-of-a-page', 'n']), false, 'a long list of links');
  const grown = lay(30, ['n', 'x']);
  assert.equal(grown.whole(), false);
  grown.table.querySelectorAll('tbody td:last-child').forEach((cell) => { cell.textContent = sentence; });
  grown.page.w.DocTables.layout(grown.table);
  assert.equal(grown.whole(), true, 'read again once its text changed');
  grown.page.dom.window.close();
  assert.match(reportCss, /\.doc-table-wrap\[data-doc-whole\] \{ max-height: var\(--doc-table-height, none\); \}/, 'a height written on the frame holds');
}
console.log('Checked inline code measurement, bounded content floors and disclosure close/reopen resizing; a run of code whole on its line (after its slashes; where Chrome breaks code the page editor edits) and a number range too, up to the room the other columns leave on a narrow screen; columns of text sharing a narrow screen; tables shown whole, short or mostly words.');

// Frame geometry: no scrollbar takes room (styles/table.css hides the system's), so a table gets the
// frame's whole inner width and a compact frame is its table plus its borders. Seven short columns
// would be 120px each (layout.js COLUMN_FLOOR), more than the frame: they share it.
const frameTable = '<div id="frame-wrap" class="doc-table-wrap" style="border:1px solid;box-sizing:border-box"><table id="frame-table" class="doc-table"><thead><tr>'+['A','B','C','D','E','F','G'].map(name=>'<th>'+name+'</th>').join('')+'</tr></thead><tbody><tr>'+Array(7).fill('<td>12.5</td>').join('')+'</tr></tbody></table></div>';
env = environment(frameTable);
const resizeCallbacks = [];
env.w.ResizeObserver = class {
 constructor(callback) { this.callback = callback; this.targets = new Set(); resizeCallbacks.push(this); }
 observe(target) { this.targets.add(target); }
 disconnect() { this.targets.clear(); }
};
const frameWrap = env.w.document.querySelector('#frame-wrap');
const frameTarget = env.w.document.querySelector('#frame-table');
let frameWidth = 800;
const outerWidth = () => frameWrap.style.width === '100%' || !frameWrap.style.width ? frameWidth : Math.min(frameWidth, parseFloat(frameWrap.style.width));
Object.defineProperty(frameWrap, 'offsetWidth', {get:() => Math.round(outerWidth())});
Object.defineProperty(frameWrap, 'clientWidth', {get:() => Math.round(outerWidth()) - 2});
frameWrap.getBoundingClientRect = () => ({width:outerWidth(), left:0, top:0, right:outerWidth(), bottom:400});
env.load('tables');
env.w.DocTables.layout(frameTarget); env.flush();
assert.equal(frameWrap.style.width, '100%');
assert.equal(parseFloat(frameTarget.style.width), 798, 'A table fills the frame inside its borders');
const notifyFrameResize = () => {
 for (const observer of resizeCallbacks) if (observer.targets.has(frameWrap)) observer.callback([{target:frameWrap, contentRect:{width:frameWrap.clientWidth}}]);
 env.flush();
};
frameWidth = 700; notifyFrameResize();
assert.equal(parseFloat(frameTarget.style.width), 698, 'A narrower frame (its card row) lays the table out again');
for (let pass=0; pass<3; pass++) { notifyFrameResize(); env.w.DocTables.layout(frameTarget); }
assert.equal(parseFloat(frameTarget.style.width), 698, 'Repeated measurement does not shrink the frame');
frameWidth = 800;
for (const row of frameTarget.rows) while (row.cells.length > 2) row.deleteCell(-1);
env.w.DocTables.layout(frameTarget);
assert.notEqual(frameWrap.style.width, '100%');
assert.ok(Math.abs(outerWidth() - parseFloat(frameTarget.style.width) - 2) < 0.001, 'Compact frames add only their borders');
assert.ok(Math.abs(parseFloat(frameTarget.style.width) - frameWrap.clientWidth) <= 0.5);
for (const row of frameTarget.rows) for (let i=2;i<19;i++) {
 const cell = env.w.document.createElement(row.parentElement.tagName === 'THEAD' ? 'th' : 'td');
 cell.textContent = row.parentElement.tagName === 'THEAD' ? '金融长窗口' : '51.2';
 row.append(cell);
}
env.w.DocTables.layout(frameTarget);
assert.equal(frameWrap.style.width, '100%');
assert.ok(parseFloat(frameTarget.style.width) > frameWrap.clientWidth, 'Genuinely wide tables still overflow locally');
// The narrowest the frame may get is the allocated layout's; a merged cell leaves the table to the
// browser, and the number goes with the layout it came from (the preview's resize handle reads it).
assert.ok(Number(frameWrap.dataset.docMinWidth) > 0, 'an allocated layout tells the frame the narrowest it may get');
frameTarget.rows[0].cells[0].colSpan = 2;
env.w.DocTables.layout(frameTarget);
assert.equal(frameTarget.classList.contains('doc-table--auto'), false, 'a merged header cell: the browser lays the table out');
assert.equal(frameWrap.dataset.docMinWidth, undefined, 'the narrowest width of the layout that went is gone with it');
frameTarget.rows[0].cells[0].colSpan = 1;
env.w.DocTables.layout(frameTarget);
assert.ok(Number(frameWrap.dataset.docMinWidth) > 0, 'laid out again: the number is back');

// The frame's own scrollbars: one layer, first in the frame and hidden from assistive technology;
// a rail for each axis that overflows, its thumb against the edge, along the part that scrolls
// (below the header, between the rounded corners), as long and as far along as the rows shown.
const layers = frameWrap.querySelectorAll(':scope > .doc-scrollbars');
assert.equal(layers.length, 1);
const layer = layers[0];
assert.equal(frameWrap.firstElementChild, layer);
assert.equal(layer.getAttribute('aria-hidden'), 'true');
assert.equal(layer.textContent, '', 'The layer adds no text to the table');
for (const corner of ['TopLeft', 'TopRight', 'BottomLeft', 'BottomRight']) frameWrap.style[`border${corner}Radius`] = '8px';
for (const side of ['Top', 'Right', 'Bottom', 'Left']) frameWrap.style[`border${side}Width`] = '1px';
const view = {tableWidth:798, tableHeight:1200, clientHeight:400, scrollTop:0, scrollLeft:0, header:45, first:120};
Object.defineProperty(frameWrap, 'clientHeight', {get:() => view.clientHeight});
// The frame's scroll size counts its rails too (one left below a table that got shorter, say).
Object.defineProperty(frameWrap, 'scrollHeight', {get:() => Math.max(view.tableHeight, view.clientHeight + 12)});
Object.defineProperty(frameTarget, 'offsetWidth', {get:() => view.tableWidth});
Object.defineProperty(frameTarget, 'offsetHeight', {get:() => view.tableHeight});
frameTarget.tHead.getBoundingClientRect = () => ({height:view.header});
frameTarget.rows[0].cells[0].getBoundingClientRect = () => ({width:view.first});
for (const name of ['scrollTop', 'scrollLeft']) Object.defineProperty(frameWrap, name, {get:() => view[name], set:(value) => { view[name] = Math.max(0, value); }});
const scrolled = () => frameWrap.dispatchEvent(new env.w.Event('scroll'));
const yRail = layer.querySelector('.doc-scrollbar--y');
const xRail = layer.querySelector('.doc-scrollbar--x');
const railValue = (name, rail = yRail) => parseFloat(rail.style.getPropertyValue(name));
const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.01, `${message}: ${actual} ≠ ${expected}`);
scrolled();
assert.ok(layer.hasAttribute('data-y') && !layer.hasAttribute('data-x'), 'Only an overflowing axis gets a rail');
assert.equal(yRail.style.left, `${frameWrap.clientWidth - 12}px`, 'The rail runs along the right edge');
assert.equal(yRail.style.top, '45px', 'The track starts below the header, which does not scroll');
near(railValue('--doc-scrollbar-track'), 400 - 45 - 7, 'The track ends where the bottom corner curves (8px radius, 1px border)');
const thumb = 348 * (400 - 45) / (1200 - 45);
near(railValue('--doc-scrollbar-thumb-size'), thumb, 'The thumb is as long as the rows shown, of those that scroll');
assert.equal(railValue('--doc-scrollbar-thumb-at'), 0);
view.scrollTop = 400; scrolled();
near(railValue('--doc-scrollbar-thumb-at'), (348 - thumb) / 2, 'Halfway down, the thumb is halfway along');
assert.ok(layer.hasAttribute('data-active'), 'Scrolling shows the scrollbars');
view.tableWidth = 1600; scrolled();
assert.ok(layer.hasAttribute('data-x'), 'A wider table gets a bottom rail too');
near(railValue('--doc-scrollbar-track'), 400 - 45 - 12, 'The vertical track stops above the bottom rail');
assert.equal(xRail.style.left, '7px', 'The bottom track starts where the left corner\'s curve ends');
assert.equal(xRail.style.top, '388px', 'The bottom rail runs along the bottom edge');
near(railValue('--doc-scrollbar-track', xRail), 798 - 7 - 12, 'and stops short of the vertical rail');
frameTarget.classList.add('doc-table--sticky-first'); scrolled();
assert.equal(xRail.style.left, '120px', 'With a sticky first column it starts after that column, which does not scroll');
near(railValue('--doc-scrollbar-thumb-size', xRail), 666 * (798 - 120) / (1600 - 120), 'its thumb as long as the columns shown, of those that scroll');
frameTarget.classList.remove('doc-table--sticky-first');
view.tableWidth = 798; view.tableHeight = 400; scrolled();
assert.ok(!layer.hasAttribute('data-y'), 'A rail left below a table that got shorter does not make its frame scroll');
view.tableHeight = 1200; scrolled();
// A press beside the thumb moves it there; dragging scrolls by the thumb's travel. Neither the
// page nor an editor (a listener on the document) hears it.
let heard = 0;
env.w.document.addEventListener('pointerdown', () => heard++, true);
const press = (type, clientY, target = yRail) => target.dispatchEvent(new env.w.MouseEvent(type, {bubbles:true, cancelable:true, button:0, clientY}));
const perPixel = 800 / (348 - thumb);
view.scrollTop = 0; scrolled();
press('pointerdown', 200);
near(view.scrollTop, (200 - thumb / 2) * perPixel, 'A press on the rail centres the thumb there');
assert.ok(yRail.hasAttribute('data-drag'));
press('pointermove', 250);
near(view.scrollTop, (250 - thumb / 2) * perPixel, 'Dragging scrolls by the thumb\'s travel');
press('pointerup', 250);
assert.ok(!yRail.hasAttribute('data-drag'));
const dragged = view.scrollTop;
press('pointermove', 300);
assert.equal(view.scrollTop, dragged, 'The drag ends with the press');
assert.equal(heard, 0, 'A press on a scrollbar is not a press on the page');
frameWrap.querySelector('td').dispatchEvent(new env.w.MouseEvent('pointerdown', {bubbles:true, button:0}));
assert.equal(heard, 1, 'A press anywhere else still is');
env.w.document.documentElement.setAttribute('data-ge-resize', 'x');
press('pointerdown', 100);
assert.equal(view.scrollTop, dragged, 'On an edge the preview\'s editor resizes from, the press is the editor\'s');
assert.equal(heard, 2);
env.w.document.documentElement.removeAttribute('data-ge-resize');
env.w.DocTables.layout(frameTarget); env.w.DocTables.layout(frameTarget);
assert.equal(frameWrap.querySelectorAll('.doc-scrollbars').length, 1, 'Laying out again draws no second layer');
env.dom.window.close();
console.log('Checked frame geometry and scrollbars: no gutter, compact/full/overflow tables, stable repeated measurement, one layer per frame, rails per overflowing axis, thumb size and place, rail presses and drags kept from the page.');

// Sheets: started on their own once the page has loaded, their tab kept under their name, keyboard
// navigation, ARIA linkage, and an area whose tabs and panels do not pair told alone.
const sheetHtml = '<div id="sheets" data-doc-sheets="test"><div class="doc-sheet-tabs"><button data-sheet-tab="a">A</button><button data-sheet-tab="b">B</button></div><section data-doc-sheet="a">A</section><section data-doc-sheet="b">B</section></div>'
  + '<div id="unpaired" data-doc-sheets="other"><div class="doc-sheet-tabs"><button data-sheet-tab="a">A</button></div><section data-doc-sheet="z">Z</section></div>';
env = environment(sheetHtml);
const sheetErrors = [];
env.w.console.error = (...args) => sheetErrors.push(args.map((arg) => String(arg?.message ?? arg)).join(' '));
env.load('sheets');
env.w.document.dispatchEvent(new env.w.Event('DOMContentLoaded'));
assert.equal(env.w.DocSheets.mount, undefined, 'areas start on their own');
const sheets = env.w.DocSheets.get('#sheets');
assert.equal(sheets.get(), 'a', 'the first tab at first');
assert.match(sheetErrors.join(' '), /sheets: .*matching panels/, 'an area that does not pair is told, alone');
assert.equal(env.w.DocSheets.get('#unpaired'), null);
sheets.set('b'); assert.equal(sheets.get(), 'b');
assert.match(env.w.localStorage.getItem(env.w.localStorage.key(0)) ?? '', /"sheet":"b"/, "the tab kept under the area's name");
assert.equal(env.w.document.querySelector('[data-doc-sheet="a"]').hidden, true);
const tab = env.w.document.querySelector('[data-sheet-tab="b"]');
tab.dispatchEvent(new env.w.KeyboardEvent('keydown', {key:'ArrowLeft'}));
assert.equal(sheets.get(), 'a');
assert.ok(tab.getAttribute('aria-controls'));
// Nothing beside the page (no copy of the tabs at the window's edge).
env.flush();
assert.equal(env.w.document.querySelector('.doc-sheet-dock'), null, 'no dock of tabs');
tab.click(); env.flush();
assert.equal(sheets.get(), 'b');
assert.equal(tab.getAttribute('aria-selected'), 'true');
tab.dispatchEvent(new env.w.KeyboardEvent('keydown', {key:'ArrowRight'}));
assert.equal(sheets.get(), 'a', 'ArrowRight goes round to the first');
sheets.destroy();
assert.equal(env.w.document.querySelector('.doc-sheet-dock'), null);
env.w.dispatchEvent(new env.w.Event('scroll')); env.flush();
env.dom.window.close();

{
  // The display button stays fixed only where the page's side holds it beside the reading column (its
  // 30px and its 16px inset), the window's width the media query reads counting a classic scrollbar
  // (17px, Windows) the page's side does not have; narrower, it scrolls away with the page.
  const column = Number(reportCss.match(/--doc-content-max-width:\s*(\d+)px/)[1]);
  const breakpoint = Number(reportCss.match(/@media \(max-width: (\d+)px\) \{\s*\.doc-display \{ position: absolute; \}/)?.[1]);
  assert.equal(breakpoint, column + 2 * (16 + 30) + 17 - 1, 'the display button scrolls away wherever it would lie over the column, a scrollbar taken from the window');
}

// Export twice: one latest snapshot, escaped user input and fresh listener binding.
const toolbarStyle = reportCss.match(/\.doc-display\s*\{[^}]+\}/)[0];
const editorTraces = '<p data-ge-block="0" data-ge-kind="flow" data-ge-caps="split merge remove links" contenteditable="true">edited <span class="doc-math-inline" data-ge-atom="k1-0" contenteditable="false">x</span></p><div class="ge-edit-bar" data-doc-dev>toolbar</div><div id="own-editable" contenteditable="true">report-owned</div>';
env = environment(`<main class="doc-page" data-doc-id="test"><div class="doc-table-wrap">${tableHtml}</div>${editorTraces}<dialog class="doc-dialog" open aria-label="名字"><div class="doc-dialog-panel"><div class="doc-dialog-content" tabindex="-1">Test</div></div></dialog><svg><path class="doc-pie-slice" tabindex="0"></path></svg></main>`, head+`<style>${toolbarStyle}</style>`);
env.load('tables', 'dialogs', 'ui'); env.flush();
if (env.w.document.readyState === 'loading') await new Promise((resolve) => env.w.document.addEventListener('DOMContentLoaded', resolve, {once: true}));
assert.equal(env.w.document.documentElement.hasAttribute('data-doc-ready'), false, 'the first paint stays held until the frame after DOMContentLoaded');
env.flush();
assert.equal(env.w.document.documentElement.hasAttribute('data-doc-ready'), true, 'ui.js reveals the held first paint after a frame');
assert.equal(env.w.document.documentElement.hasAttribute('data-doc-drawn'), true, 'the kit says its drawing is done once the page has loaded and nothing waits for a frame');
{
  // data-doc-drawn waits for the drawing an instance asked for, and for the frame that drawing's
  // answer (a resize it caused) asked for in turn.
  const probe = environment('<div id="probe"></div>');
  if (probe.w.document.readyState === 'loading') await new Promise((resolve) => probe.w.document.addEventListener('DOMContentLoaded', resolve, {once: true}));
  const root = probe.w.document.documentElement;
  const seen = [];
  probe.w.DocKit.component({id: 'probe', selector: '#probe', when: 'now', mount(host, context) {
    context.frame(() => {
      seen.push(['drew', root.hasAttribute('data-doc-drawn')]);
      context.frame(() => seen.push(['drew again', root.hasAttribute('data-doc-drawn')]));
    });
    return {};
  }});
  assert.equal(root.hasAttribute('data-doc-drawn'), false, 'not while a frame of drawing is waiting');
  probe.flush();
  assert.deepEqual(seen, [['drew', false], ['drew again', false]], 'its drawing and the one that answered it came first');
  assert.equal(root.hasAttribute('data-doc-drawn'), true, 'then the page is drawn');
  probe.dom.window.close();
}
{
  // A theme asked from outside (a workbench) is shown and not stored; null goes back to the reader's.
  const root = env.w.document.documentElement;
  const themes = [];
  env.w.addEventListener('doc-theme-change', (event) => themes.push(event.detail.theme));
  const told = []; // its old name (before 2026-10-26), for a script no tool rewrote
  env.w.addEventListener('report-theme-change', (event) => told.push(event.detail.theme));
  env.w.dispatchEvent(new env.w.CustomEvent('doc-theme-request', {detail: {theme: 'dark'}}));
  assert.equal(root.dataset.docTheme, 'dark');
  assert.ok(!(env.w.localStorage.getItem('gallery:test:display') ?? '').includes('"dark"'), 'a requested theme is not stored');
  env.w.dispatchEvent(new env.w.CustomEvent('doc-theme-request', {detail: {theme: null}}));
  assert.equal(root.dataset.docTheme, undefined, "null goes back to the reader's choice (none stored here)");
  assert.deepEqual(themes, ['dark', 'light'], 'charts are told each time');
  assert.deepEqual(told, themes, 'and a script listening to the old name');
}
{
  // The system's theme changing is told once, as a change of the theme shown (ui.js sends
  // doc-theme-change, the runtime listens to that alone), and not at all while the reader has chosen one.
  const changes = new Set();
  const system = {matches: false, addEventListener: (type, listener) => changes.add(listener), removeEventListener() {}};
  const themed = environment('<main class="doc-page" data-doc-id="theme-once"><div id="probe"></div></main>', '', () => system);
  themed.load('ui');
  const updates = [];
  themed.w.DocKit.component({id: 'tables', selector: '#probe', on: ['theme'], mount: () => ({update: (reason) => updates.push(reason)})});
  await started(themed);
  const systemChange = (dark) => { system.matches = dark; changes.forEach((listener) => listener({matches: dark})); themed.flush(); };
  systemChange(true);
  assert.deepEqual(updates, ['theme'], 'one system change tells a component that listens for the theme once');
  themed.w.dispatchEvent(new themed.w.CustomEvent('doc-theme-request', {detail: {theme: 'light'}}));
  assert.equal(updates.length, 2, 'a theme asked for is told once');
  systemChange(false);
  assert.equal(updates.length, 2, 'the system changing under a theme the reader has chosen shows nothing new and tells nothing');
  themed.dom.window.close();
}
{
  // A change made through DocKit.quietly (the page editor rebuilding its blocks as it starts) goes
  // to the instances inside it at once, marked quiet, and so does what they change as they hear it;
  // a host it adds starts as any added later does; an ordinary change is not quiet.
  const page = environment('<main class="doc-page"><div id="watched"><p>words</p></div></main>');
  await started(page);
  const heard = [];
  page.w.DocKit.component({id: 'watching', selector: '#watched', on: ['content'], mount: (host) => ({update: (reason, records, options) => {
    heard.push([reason, records.length, Boolean(options?.quiet)]);
    if (options?.quiet && !host.querySelector('.answer')) host.insertAdjacentHTML('beforeend', '<i class="answer"></i>');
  }})});
  page.w.DocKit.component({id: 'inner', selector: '.inner', mount: () => ({})});
  const watched = page.w.document.querySelector('#watched');
  const returned = page.w.DocKit.quietly(() => {
    watched.querySelector('p').replaceChildren('words', page.w.document.createElement('b'));
    watched.insertAdjacentHTML('beforeend', '<span class="inner"></span>');
    return 'done';
  });
  assert.equal(returned, 'done', 'quietly returns what the change returns');
  assert.deepEqual(heard, [['content', 2, true], ['content', 1, true]], 'the change heard at once and quiet, and the answer to it quiet too');
  assert.equal(page.w.DocKit.stats().live.inner, 1, 'a host the change adds starts');
  watched.querySelector('p').textContent = 'typed';
  await Promise.resolve();
  assert.deepEqual(heard.at(-1), ['content', 1, false], 'an ordinary change is not quiet');
  page.dom.window.close();
}
// That a focused slice draws no rectangular browser outline (chart.css) is the browser scenario declaredChart's: jsdom does not cascade the outline.
for (const slice of env.w.document.querySelectorAll('.doc-pie-slice')) {
 slice.focus();
 assert.equal(env.w.document.activeElement, slice, 'Pie keyboard focus remains available');
 slice.blur();
}
state = env.w.DocState.create(options); state.set('memo', '</ScRiPt><div>memo</div>');
let exported;
let saveRequests = 0;
env.w.showSaveFilePicker = async () => { saveRequests++; return {createWritable:async () => ({write:async (value) => exported = value, close:async () => {}})}; };
const button = env.w.document.querySelector('[data-doc-export-copy]');
{
  // The display settings: one button opening a menu (the looks, full width, the copy).
  const display = env.w.document.querySelector('.doc-display');
  const opener = display.querySelector('.doc-display-button');
  const menu = display.querySelector('.doc-display-menu');
  const root = env.w.document.documentElement;
  assert.ok(menu.hidden && opener.getAttribute('aria-expanded') === 'false' && menu.contains(button), 'One button, its menu closed, the copy in it');
  opener.click();
  assert.ok(!menu.hidden && opener.getAttribute('aria-expanded') === 'true', 'A click opens the menu');
  for (const item of menu.querySelectorAll('.doc-display-item')) if (item !== button) item.click();
  assert.equal(saveRequests, 0, 'Opening the menu, the looks and full width never invoke saving');
  const checked = [...menu.querySelectorAll('[role="menuitemradio"]')].filter((item) => item.getAttribute('aria-checked') === 'true').map((item) => item.dataset.theme);
  assert.deepEqual(checked, ['dark'], 'The look chosen last is the one checked');
  assert.equal(root.dataset.docTheme, 'dark');
  assert.equal(menu.querySelector('[role="menuitemcheckbox"]').getAttribute('aria-checked'), 'true', 'Full width: the switch on');
  assert.equal(root.dataset.docWidth, 'full');
  menu.querySelector('[data-theme="system"]').click();
  assert.equal(root.dataset.docTheme, undefined, "跟随系统: the system's look, nothing stored");
  menu.querySelector('[data-theme="dark"]').click();
  env.w.document.body.dispatchEvent(new env.w.Event('pointerdown', {bubbles: true}));
  assert.ok(menu.hidden && opener.getAttribute('aria-expanded') === 'false', 'A press elsewhere closes it');
  opener.click();
  display.dispatchEvent(new env.w.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}));
  assert.ok(menu.hidden && env.w.document.activeElement === opener, 'Esc closes it, the focus back on its button');
}
// The UI's language Gallery tells the kit (data-ge-language, src/render/kit/words.js) stays with Gallery: the copy has its own lang.
env.w.document.documentElement.setAttribute('data-ge-language', 'zh');
button.click(); await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(saveRequests, 1, 'Only explicit export activation invokes the save picker');
assert.ok(exported);
const first = new JSDOM(exported);
assert.equal(first.window.document.querySelectorAll('script[data-doc-state]').length, 1);
assert.equal(first.window.document.querySelector('colgroup[data-doc-columns], .doc-table--auto, .doc-scrollbars'), null, 'Layout and scrollbars are drawn again on opening');
assert.equal(first.window.document.querySelectorAll('[data-doc-sortable-ready], [data-doc-dialog-ready], dialog[open], dialog[aria-label], .doc-dialog-content[tabindex], .doc-table-sort-button').length, 0);
assert.equal(first.window.document.querySelector('[data-doc-dev]'), null, 'Preview-only editor UI is not exported');
assert.equal(first.window.document.documentElement.hasAttribute('data-doc-ready'), false, 'An exported file holds its first paint until its own scripts run');
assert.ok(!/data-ge-|contenteditable="(?:true|false)"[^>]*>edited/.test(exported) && !first.window.document.querySelector('p[contenteditable], .doc-math-inline[contenteditable]'), 'Editor markers are stripped from exports');
assert.equal(first.window.document.querySelector('#own-editable')?.getAttribute('contenteditable'), 'true', 'A report-owned contenteditable survives export');
const firstSnapshot = JSON.parse(first.window.document.querySelector('script[data-doc-state]').textContent);
assert.equal(firstSnapshot.find((item) => item.id === 'notes').state.memo, '</ScRiPt><div>memo</div>');
first.window.close();
const restored = environment('', '');
restored.w.document.documentElement.innerHTML = new JSDOM(exported).window.document.documentElement.innerHTML;
restored.load('tables', 'dialogs', 'ui'); await started(restored);
assert.equal(restored.w.document.querySelectorAll('.doc-table-wrap > .doc-scrollbars').length, 1, 'An exported copy draws the scrollbars of its frame once');
const restoredNotes = restored.w.DocState.create(options);
restoredNotes.set('memo', 'second export');
restored.w.showSaveFilePicker = env.w.showSaveFilePicker;
restored.w.document.querySelector('[data-doc-export-copy]').click();
await new Promise((resolve) => setTimeout(resolve, 0));
const second = new JSDOM(exported);
assert.equal(second.window.document.querySelectorAll('script[data-doc-state]').length, 1);
assert.equal(JSON.parse(second.window.document.querySelector('script[data-doc-state]').textContent).find((item) => item.id === 'notes').state.memo, 'second export');
restored.w.document.querySelector('.doc-table-sort-button').click();
assert.ok(restored.w.DocTables.getState('#table').sort);
second.window.close(); restored.dom.window.close(); env.dom.window.close();
console.log('Checked runtime: state restore/reset/export, declared charts of the report\'s own types (drawn, redrawn, parts, broken ones), table sorting, tokens, Sheets and export reinitialization (DOM tests; not visual QA).');

// Execute the maintained Component Catalog scripts against the same public APIs.
const gallery = newNames(await fs.readFile(new URL('../fixtures/component-catalog/doc.html', import.meta.url), 'utf8')); // as the tools read it (its old names new)
env = environment(gallery, '<style>.doc-table th, .doc-table td {padding:10px 12px; font-size:15px}</style>'); env.w.eval(d3Source); env.load('code', 'sheets', 'charts', 'tables', 'dialogs', 'ui');
for (const script of env.w.document.querySelectorAll('script:not([src]):not([type="application/json"])')) env.w.eval(script.textContent);
if (env.w.document.readyState === 'loading') await new Promise((resolve) => env.w.document.addEventListener('DOMContentLoaded', resolve, {once: true}));
env.flush();
assert.equal(env.w.document.querySelectorAll('script:not([src]):not([type="application/json"])').length, 1, 'one script: it defines the chart types alone');
// The old globals (before 2026-10-26) are the new ones, for a script of the report's folder no tool rewrote.
for (const name of ['Kit', 'Code', 'Sheets', 'Charts', 'Tables', 'Dialogs', 'State', 'Tokens']) assert.ok(env.w[`Doc${name}`] && env.w[`Report${name}`] === env.w[`Doc${name}`], `window.Report${name} is Doc${name}`);
// Declared charts carry no id: found by their card's title.
const galleryChart = (title) => [...env.w.document.querySelectorAll('figure.doc-figure')].find((card) => card.querySelector('h3')?.textContent === title).querySelector('[data-doc-chart], [id]');
assert.equal(env.w.document.querySelector('#text-code').closest('[data-doc-sheet]').dataset.docSheet, 'text');
assert.ok(env.w.document.querySelector('.doc-diff > .doc-code-title'), 'a diff has a code block title');
assert.equal(env.w.document.querySelectorAll('.doc-diff > .doc-diff-body .doc-code-line').length, 5, 'the declared diff is drawn in it');
assert.equal(galleryChart('每周请求量').querySelectorAll('svg > g > rect').length, 4, 'a chart of the report\'s own type draws its declared data: a bar a row');
assert.equal(galleryChart('各题得分分布').querySelectorAll('circle').length, 12);
assert.equal(galleryChart('各时段 P95 延迟').querySelectorAll('circle').length, 4, 'a line and its reference line, drawn by the type itself');
// A part: its own buttons in its host beside its svg, one line shown at a click.
const toggle = galleryChart('两个渠道的每周请求量');
assert.equal(toggle.querySelectorAll(':scope > svg path[stroke-width]').length, 2);
toggle.querySelector('.toggle-button:nth-child(2)').click();
assert.equal(toggle.querySelectorAll(':scope > svg path[stroke-width]').length, 1, 'a click shows one line');
// A figure of the page's own drawing: its marker defined in the figure, named by a prefix of its own.
assert.ok(env.w.document.querySelector('figure.doc-figure svg.flow-arrows marker#catalog-arrow'), 'a drawing in a card, its <defs> id prefixed');
const matrixTable = env.w.document.querySelector('#wide-matrix-table');
const matrixLayout = env.w.DocTables.layout(matrixTable);
assert.ok(matrixLayout.reduce((sum, c) => sum+c.width, 0) > 920);
assert.equal(matrixTable.querySelectorAll('[data-column-wrap]').length, 0, 'Component Catalog matrix headers and numbers stay on one line');
const disclosureWideTable = env.w.document.querySelector('#disclosure-wide-table');
const disclosureBlock = disclosureWideTable.closest('details');
disclosureWideTable.parentElement.getBoundingClientRect = () => ({width:disclosureBlock.open ? 858 : 0});
disclosureBlock.open = true; await Promise.resolve(); env.flush();
const disclosureWideLayout = env.w.DocTables.layout(disclosureWideTable);
assert.ok(disclosureWideTable.classList.contains('doc-table--auto'), 'Static disclosure tables also use the allocator');
assert.ok(sumWidths(disclosureWideLayout)>858, 'Wide disclosure scrolls before over-compressing names and paths');
assert.ok(disclosureWideLayout[0].width>140 && disclosureWideLayout[1].width>140);
for (const column of disclosureWideLayout.slice(0,2)) {
 assert.ok((column.preferredWidth-24)/(column.width-24) <= 3.000001, 'Typical long fields receive about three lines of measured space');
 assert.ok(column.width < column.preferredWidth, 'Long names and paths still wrap');
}

const autoWidthTable = env.w.document.querySelector('#auto-width-table');
let mixedViewport = 918;
autoWidthTable.parentElement.getBoundingClientRect = () => ({width:mixedViewport});
for (mixedViewport of [918, 782]) {
 const layout = env.w.DocTables.layout(autoWidthTable);
 // Text-width estimates use the fixture measurer, not real browser line layout.
 const estimatedLines = layout.map(c => Math.ceil((c.preferredWidth-24)/(c.width-24)-1e-9));
 assert.deepEqual(plain(estimatedLines), [1,1,2,2], 'Component Catalog paths and prose share two-line space, keeping short fields on one line');
 assert.ok(Math.abs(sumWidths(layout)-mixedViewport)<1e-5);
}
mixedViewport = 320;
const narrowMixed = env.w.DocTables.layout(autoWidthTable);
assert.ok(sumWidths(narrowMixed)>mixedViewport, 'Balanced wrapping still scrolls at readable floors');
// A chart drawn from a table: a bar for each of its rows, drawn again when a cell changes.
const channels = galleryChart('各渠道总请求量');
assert.equal(channels.querySelectorAll('svg > g > rect').length, 4, 'drawn from the table of its key');
assert.equal(channels.children.length, 1, 'its host holds no JSON');
env.w.document.querySelector('[data-doc-chart-source="channels"] tbody tr td:nth-child(2)').textContent = '600';
await new Promise((resolve) => setTimeout(resolve, 0)); env.flush();
assert.ok([...channels.querySelectorAll('svg text')].some((text) => text.textContent === '600'), 'a cell changed: drawn again');
const filter = env.w.document.querySelector('#linked-filter');
const linkedTable = env.w.document.querySelector('table[data-doc-bind="linkedSort"]');
const linkedChart = galleryChart('按周请求量');
const linkedLayout = plain(env.w.DocTables.layout(linkedTable));
assert.ok(linkedTable.classList.contains('doc-table--auto'));
assert.equal(linkedTable.querySelectorAll('[data-column-wrap]').length, 0, 'Short linked-table labels need no wrapping');
filter.value = 'agent'; filter.dispatchEvent(new env.w.Event('change')); env.flush();
assert.deepEqual(plain(env.w.DocTables.layout(linkedTable)), linkedLayout, 'Filtering does not change column widths');
assert.equal(linkedTable.querySelector('[data-doc-show="series:agent"] td').hasAttribute('data-column-wrap'), false, 'Agent stays intact after filtering');
filter.value = 'api'; filter.dispatchEvent(new env.w.Event('change')); env.flush();
assert.equal(linkedTable.querySelector('[data-doc-show="series:agent"]').hidden, true, 'the filter hides a row');
assert.equal(linkedChart.querySelectorAll('svg > g > rect').length, 2, 'the chart drawn from that table draws its rows');
filter.value = ''; filter.dispatchEvent(new env.w.Event('change')); env.flush();
assert.equal(linkedTable.querySelector('[data-doc-show="series:agent"]').hidden, false);
const done = env.w.document.querySelector('button[data-doc-bind="filter"][value="done"]');
done.click();
assert.equal(done.getAttribute('aria-pressed'), 'true');
assert.deepEqual([...env.w.document.querySelectorAll('li[data-doc-show^="filter:"]')].map((item) => item.hidden), [true, false, true]);
const memo = env.w.document.querySelector('#gallery-memo');
memo.value = 'Catalog memo'; memo.dispatchEvent(new env.w.Event('input'));
const bound = JSON.parse(env.w.DocState.serializeAll()).find((item) => /(^|:)bound$/.test(item.id)).state;
assert.equal(bound.memo, 'Catalog memo', 'a bound key is kept');
assert.equal(bound.series, undefined, 'a transient one is not');
assert.equal(bound.filter, undefined);
env.dom.window.close();
console.log('Checked Component Catalog execution: its one script defining its chart types, each drawing its declared data (a part with buttons of its own), a drawing of its own in a card, a chart drawn from a table and again when a cell changes, the declared diff, table/filter linkage by bound keys (select, rows, filter buttons) and persistent/transient keys.');

// The preview export inlines local JS/CSS/fonts, removes Vite, and keeps offline CSP.
env = environment('<main class="doc-page" data-doc-id="preview"></main>', '<link rel="stylesheet" href="/kit/example.css"><script src="/@vite/client" type="module"></script><script src="/vendor/example.js" data-doc-vendor="example"></script>');
env.w.TextDecoder = TextDecoder;
const requested = [];
env.w.fetch = async (url) => {
  requested.push(url);
  if (url.endsWith('.css')) return new Response('/* the font: url("fonts/example.woff2") */ @font-face {font-family:example;src:url("fonts/example.woff2")} body {color:gray;background:URL(fonts/example.woff2)} a::after {content:"url(fonts/example.woff2)"} b {background:image-set("fonts/example.woff2" 1x)} i {background:url(nothere.svg)}', {headers:{'content-type':'text/css'}});
  if (url.endsWith('.woff2')) return new Response(new Uint8Array([1,2,3]), {headers:{'content-type':'font/woff2'}});
  if (url.endsWith('nothere.svg')) return new Response('', {status: 404});
  if (url.endsWith('.js')) return new Response('globalThis.example = "ready";', {headers:{'content-type':'text/javascript'}});
  throw new Error(`Unexpected asset ${url}`);
};
env.load('ui');
env.w.showSaveFilePicker = async () => ({createWritable:async () => ({write:async (value) => exported = value, close:async () => {}})});
env.w.document.querySelector('[data-doc-export-copy]').click();
await new Promise((resolve) => setTimeout(resolve, 20));
const previewExport = new JSDOM(exported);
assert.equal(requested.length, 4);
assert.equal(previewExport.window.document.querySelectorAll('script[src], link[rel="stylesheet"]').length, 0);
assert.equal(previewExport.window.document.querySelector('style').textContent, '/* the font: url("fonts/example.woff2") */ @font-face {font-family:example;src:url("data:font/woff2;base64,AQID")} body {color:gray;background:URL("data:font/woff2;base64,AQID")} a::after {content:"url(fonts/example.woff2)"} b {background:image-set("data:font/woff2;base64,AQID" 1x)} i {background:url(nothere.svg)}', 'each file a stylesheet names, as CSS reads it, and nothing a comment or a string spells; what is not there as written, the copy made all the same');
// The copy's policy and its isolated UMD bundle are the CLI export's (src/shared/export-wrap.mjs, which ui.js is bundled with).
assert.equal(previewExport.window.document.querySelector('meta[http-equiv="Content-Security-Policy"]').content, EXPORT_CSP);
assert.ok(EXPORT_CSP.includes("connect-src 'none'"));
assert.ok([...previewExport.window.document.querySelectorAll('script')].some((script) => script.textContent === isolateUmd('globalThis.example = "ready";')), 'a vendor script is isolated as the CLI export isolates it');
previewExport.window.close(); env.dom.window.close();
console.log('Checked preview export: local assets and font bytes embedded, development client removed, offline CSP retained.');

for (const raw of ['broken JSON', JSON.stringify({schema:1,id:'notes',version:99,state:{memo:'wrong version'}})]) {
  for (const name of ['gallery', 'html-report-studio']) { // its key, and its key before 2026-10-26 (carried)
    env = environment('<main class="doc-page" data-doc-id="r"></main>');
    env.w.localStorage.setItem(`${name}:r:notes`, raw);
    const fresh = env.w.DocState.create(options);
    assert.equal(fresh.get('memo'), '');
    if (name !== 'gallery') assert.equal(env.w.localStorage.getItem('gallery:r:notes'), null, 'what is not this state is not carried');
    env.dom.window.close();
  }
}
env = environment();
Object.defineProperty(env.w, 'localStorage', {get() { throw new Error('Storage blocked'); }});
state = env.w.DocState.create(options);
state.set('memo', 'still usable');
assert.equal(state.get('memo'), 'still usable');
assert.equal(JSON.parse(state.serialize()).state.memo, 'still usable');
env.dom.window.close();
console.log('Checked malformed/version-mismatched storage and blocked-storage fallback.');

// A state belongs to its report (data-doc-id): "view" and "<slug>:view" are one state, and a copy
// of the report under another slug, with the same scripts, keeps a state of its own.
{
  const page = (slug) => `<main class="doc-page" data-doc-id="${slug}"></main>`;
  const view = {id: 'view', version: 1, defaults: {memo: ''}};
  env = environment(page('alpha'));
  const alpha = env.w.DocState.create(view);
  alpha.set('memo', 'alpha note');
  const stored = env.w.localStorage.getItem('gallery:alpha:view');
  assert.equal(stored, alpha.serialize(), 'what is stored is the serialized snapshot, one format');
  assert.equal(JSON.parse(stored).state.memo, 'alpha note', 'stored under the report and the state name');
  assert.throws(() => env.w.DocState.create({...view, id: 'alpha:view'}), /already exists/, 'the slug prefix names the same state');
  env.dom.window.close();
  env = environment(page('alpha'));
  env.w.localStorage.setItem('gallery:alpha:view', stored);
  assert.equal(env.w.DocState.create({...view, id: 'alpha:view'}).get('memo'), 'alpha note', 'an id written with the slug finds the same state');
  env.dom.window.close();
  env = environment(page('alpha-copy'));
  env.w.localStorage.setItem('gallery:alpha:view', stored);
  for (const id of ['view', 'alpha:view']) {
    const copy = env.w.DocState.create({...view, id});
    assert.equal(copy.get('memo'), '', `a copy of the report starts with a state of its own (${id})`);
    copy.set('memo', 'copy note');
  }
  assert.equal(JSON.parse(env.w.localStorage.getItem('gallery:alpha:view')).state.memo, 'alpha note', "and leaves the original's alone");
  assert.deepEqual([env.w.localStorage.getItem('gallery:alpha-copy:view'), env.w.localStorage.getItem('gallery:alpha-copy:alpha:view')].map((raw) => JSON.parse(raw).state.memo), ['copy note', 'copy note']);
  const embeddedCopy = JSON.stringify([{schema: 1, id: 'alpha-copy:view', version: 1, state: {memo: 'embedded'}}]);
  env.dom.window.close();
  env = environment(page('alpha-copy'), `<script type="application/json" data-doc-state>${embeddedCopy}</script>`);
  assert.equal(env.w.DocState.create(view).get('memo'), 'embedded', 'an embedded snapshot matches either way of writing the id');
  env.dom.window.close();
}
console.log('Checked state scope: per report (data-doc-id), the slug prefix as the same state, copies of a report kept apart.');

// A state kept before the product's rename (2026-10-26) under html-report-studio:<report>:<id>
// (an export's under its export id too): carried to gallery:… the first time it is made, the old
// left as it was; made again, nothing changes; a new one written first wins; the old one changed
// since (a page of the old version still open) is the reader's latest and carried again.
{
  const page = (slug, head = '') => [`<main class="doc-page" data-doc-id="${slug}"></main>`, head];
  const view = {id: 'view', version: 1, defaults: {memo: ''}};
  const payload = (memo, id = 'view') => JSON.stringify({schema: 1, id, version: 1, state: {memo}});
  const entries = () => Object.fromEntries(Array.from({length: env.w.localStorage.length}, (_, index) => env.w.localStorage.key(index)).map((key) => [key, env.w.localStorage.getItem(key)]));
  // The same browser opening the page again: what it stored, in a new page.
  const reopen = (slug, head) => {
    const kept = entries();
    env.dom.window.close();
    env = environment(...page(slug, head));
    for (const [key, value] of Object.entries(kept)) env.w.localStorage.setItem(key, value);
  };
  env = environment(...page('beta'));
  env.w.localStorage.setItem('html-report-studio:beta:view', payload('old note'));
  let beta = env.w.DocState.create(view);
  assert.equal(beta.get('memo'), 'old note', 'a state kept under the old name is restored');
  assert.equal(env.w.localStorage.getItem('gallery:beta:view'), payload('old note'), 'and carried to the new key');
  assert.equal(env.w.localStorage.getItem('html-report-studio:beta:view'), payload('old note'), 'the old one left as it was');
  beta.set('memo', 'new note');
  const once = entries();
  reopen('beta');
  beta = env.w.DocState.create(view);
  assert.equal(beta.get('memo'), 'new note', 'made again: what was changed since stays (the carry is done once)');
  assert.deepEqual(entries(), {...once}, 'and nothing in the storage changed');
  // A page of the old version, still open, writes its key: the reader's latest, carried again.
  env.w.localStorage.setItem('html-report-studio:beta:view', payload('written in an old tab'));
  reopen('beta');
  assert.equal(env.w.DocState.create(view).get('memo'), 'written in an old tab', 'the old one changed since is carried again');
  reopen('beta');
  assert.equal(env.w.DocState.create(view).get('memo'), 'written in an old tab', 'once');
  env.dom.window.close();
  // A new key written before the old one was ever looked at wins over it.
  env = environment(...page('gamma'));
  env.w.localStorage.setItem('html-report-studio:gamma:view', payload('old'));
  env.w.localStorage.setItem('gallery:gamma:view', payload('new'));
  assert.equal(env.w.DocState.create(view).get('memo'), 'new', 'the new key wins over the old one');
  assert.equal(env.w.localStorage.getItem('html-report-studio:gamma:view'), payload('old'), 'which stays');
  env.dom.window.close();
  // An export's state is kept under its export id, the old name's too.
  env = environment(...page('delta', '<meta name="doc-export-id" content="e1">'));
  env.w.localStorage.setItem('html-report-studio:delta:view:e1', payload('read in the export'));
  assert.equal(env.w.DocState.create(view).get('memo'), 'read in the export', "an export's reading state kept under the old name is restored");
  assert.equal(env.w.localStorage.getItem('gallery:delta:view:e1'), payload('read in the export'));
  env.dom.window.close();
  // Nothing under the old name: nothing is written for it.
  env = environment(...page('epsilon'));
  env.w.DocState.create(view).set('memo', 'x');
  assert.deepEqual(Object.keys(entries()), ['gallery:epsilon:view'], 'a state with no old key writes its own key alone');
  env.dom.window.close();
}
console.log('Checked state kept under the old name (html-report-studio:…): carried once to gallery:…, the old left, a new key first winning, an old tab\'s later write carried, an export\'s too.');

// Detail cards open from a link to the dialog in the text or from data-doc-dialog-open; other
// in-page links, and clicks something else already handled (the preview's text editor), are left alone.
env = environment(`<main class="doc-page" data-doc-id="dialogs">
  <p>数据集 <a class="doc-dialog-trigger" href="#detail">Atlas<strong>-Bench</strong></a>，<a href="#part">章节</a>，<a id="handled" href="#detail">已处理</a></p>
  <button class="doc-button" type="button" data-doc-dialog-open="#detail">打开</button>
  <section id="part"></section>
  <dialog class="doc-dialog" id="detail"><div class="doc-dialog-panel"><div class="doc-dialog-content"><p>话</p><h3>卡片的 <em>标题</em></h3></div></div></dialog>
  <p><a class="doc-dialog-trigger" href="#plain"><strong>入口</strong>的字</a><a href="#named">有名</a><a href="#labelled">指向</a></p>
  <dialog class="doc-dialog" id="plain"><div class="doc-dialog-panel"><div class="doc-dialog-content"><p>没有标题</p></div></div></dialog>
  <dialog class="doc-dialog" id="named" aria-label="文件的名字"><div class="doc-dialog-panel"><div class="doc-dialog-content"><h3>标题</h3></div></div></dialog>
  <dialog class="doc-dialog" id="labelled" aria-labelledby="part"><div class="doc-dialog-panel"><div class="doc-dialog-content"><h3>标题</h3></div></div></dialog>
</main>`);
env.load('dialogs');
{
  const doc = env.w.document;
  const shown = () => doc.getElementById('detail').hasAttribute('open');
  const click = (node) => {
    const event = new env.w.MouseEvent('click', {bubbles: true, cancelable: true});
    node.dispatchEvent(event);
    return event;
  };
  assert.equal(click(doc.querySelector('.doc-dialog-trigger strong')).defaultPrevented, true, 'a link to the dialog does not jump');
  assert.equal(shown(), true, 'it opens the dialog');
  assert.equal(doc.getElementById('detail').getAttribute('aria-label'), '卡片的 标题', 'as it opens it is named by its first heading, whichever block that is');
  assert.equal(doc.getElementById('detail').hasAttribute('aria-labelledby'), false, 'nothing points at that heading');
  doc.querySelector('dialog h3').remove();
  env.w.DocDialogs.close('#detail');
  assert.equal(shown(), false);
  assert.ok(click(doc.querySelector('[data-doc-dialog-open]')) && doc.getElementById('detail').getAttribute('aria-label') === '打开', 'with no heading left, by the words that opened it this time');
  env.w.DocDialogs.close('#detail');
  for (const [id, name] of [['plain', '入口的字'], ['named', '文件的名字']]) {
    click(doc.querySelector(`a[href="#${id}"]`));
    assert.equal(doc.getElementById(id).getAttribute('aria-label'), name, id);
    env.w.DocDialogs.close(`#${id}`);
  }
  env.w.DocDialogs.open('#plain', null);
  assert.equal(doc.getElementById('plain').getAttribute('aria-label'), '入口的字', 'opened by a script, by the link to it');
  env.w.DocDialogs.close('#plain');
  click(doc.querySelector('a[href="#labelled"]'));
  assert.equal(doc.getElementById('labelled').hasAttribute('aria-label'), false, "a card the file names by another element's words keeps that");
  env.w.DocDialogs.close('#labelled');
  assert.equal(click(doc.querySelector('a[href="#part"]')).defaultPrevented, false, 'a link to a section stays a jump');
  doc.getElementById('handled').addEventListener('click', (event) => event.preventDefault());
  click(doc.getElementById('handled'));
  assert.equal(shown(), false, 'a click handled already opens nothing');
  click(doc.querySelector('[data-doc-dialog-open]'));
  assert.equal(shown(), true, 'a button with data-doc-dialog-open opens it');
}
env.dom.window.close();
console.log('Checked detail cards: opened by a link to the dialog or by data-doc-dialog-open, not by other links or handled clicks; named as they open by their first heading, else the words that open them, a name of the file\'s kept.');

// The kit's runtime (DocKit, src/render/kit/runtime/): an instance from when it is found until its
// host leaves the page. A move within the page keeps it; a host taken out and put back (an undo) is
// destroyed and started again; a part of a report's own type keeps what it starts until then; a draw
// that fails stays with its chart (told next to it in the preview); counts go back where they were;
// an export of the view takes what the kit left off, the same however often.
{
  const json = (value) => `<script type="application/json">${JSON.stringify(value)}</script>`;
  const body = `<main class="doc-page" data-doc-id="kernel"><section id="place">`
    + `<figure id="card"><h3>A</h3><div id="declared" data-doc-chart="bars">${json(chartData)}</div></figure>`
    + `<figure id="part-card"><div id="part" data-doc-chart="ticker">${json({every: 1000})}</div></figure>`
    + `<figure id="broken-card"><div id="broken" data-doc-chart="fails">${json([1])}</div></figure>`
    + `<section class="doc-sheet-shell" data-doc-sheets="kernel"><div class="doc-sheet-tabs"><button class="doc-sheet-tab" type="button" data-sheet-tab="a">A</button><button class="doc-sheet-tab" type="button" data-sheet-tab="b">B</button></div><div data-doc-sheet="a"><p>a</p></div><div data-doc-sheet="b"><p>b</p></div></section>`
    + `</section></main>`;
  env = environment(body);
  const errors = [];
  env.w.console.error = (...args) => errors.push(args.map((arg) => String(arg?.message ?? arg)).join(' '));
  env.load('sheets', 'charts');
  const kit = env.w.DocKit;
  const document = env.w.document;
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0)).then(() => env.flush());
  const part = {mounted: 0, updated: 0, destroyed: 0, aborted: 0};
  env.w.DocCharts.define('ticker', {
    mount({host, data, signal}) {
      part.mounted += 1;
      signal.addEventListener('abort', () => { part.aborted += 1; });
      host.append(`every ${data.every}`);
      return {update: () => { part.updated += 1; }, destroy: () => { part.destroyed += 1; }};
    },
  });
  env.w.DocCharts.define('fails', () => { throw new Error('drawn wrong'); });
  env.w.DocCharts.define('bars', ({host, data}) => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const value of data) svg.append(Object.assign(document.createElementNS('http://www.w3.org/2000/svg', 'rect'), {textContent: String(value)}));
    host.append(svg);
  });
  document.dispatchEvent(new env.w.Event('DOMContentLoaded')); // the Sheet area starts once the page has loaded
  await settle();
  const bars = (id) => document.querySelectorAll(`#${id} rect`).length;
  assert.equal(bars('declared'), 3);
  assert.equal(document.querySelector('#part').textContent.endsWith('every 1000'), true, 'a part starts in its host');
  env.w.dispatchEvent(new env.w.Event('doc-theme-change')); env.flush();
  assert.equal(part.updated, 1, 'and is told when the theme changes');
  assert.match(errors.join('\n'), /chart: drawn wrong/, 'a failing draw is told');
  assert.match(document.querySelector('#broken-card .doc-kit-error[data-doc-dev]')?.textContent ?? '', /drawn wrong/, 'and shown next to its chart in the preview');
  const base = kit.stats();
  assert.deepEqual(plain(base.live), {chart: 3, sheets: 1});
  assert.equal(document.querySelectorAll('.doc-sheet-dock').length, 0, 'no dock of tabs beside the page');
  const place = document.querySelector('#place');
  for (let round = 0; round < 100; round++) {
    for (const id of ['card', 'part-card']) {
      const node = document.querySelector(`#${id}`);
      const next = node.nextSibling;
      place.prepend(node); place.insertBefore(node, next); // moved within the page in one go
      await settle();
      node.remove();
      await settle();
      place.insertBefore(node, next); // put back
      await settle();
    }
  }
  const area = document.querySelector('[data-doc-sheets]');
  area.remove(); await settle();
  place.append(area); await settle();
  const after = kit.stats();
  assert.deepEqual(plain(after.live), plain(base.live), 'the same instances live');
  assert.equal(after.mounted - base.mounted, 201, 'each put back started once (the area too), no move restarted one');
  assert.equal(after.destroyed - base.destroyed, 201);
  assert.equal(bars('declared'), 3, 'a declared chart put back draws again');
  assert.deepEqual(plain(part), {mounted: 101, updated: 1, destroyed: 100, aborted: 100}, 'a part started once each time it came back, destroyed (and its signal aborted) each time it left');
  assert.equal([...area.querySelectorAll(':scope > [data-doc-sheet]')].filter((panel) => !panel.hidden).length, 1);
  document.querySelector('#broken-card').remove(); await settle();
  assert.equal(document.querySelectorAll('.doc-kit-error').length, 0, 'the note goes with its chart');
  const copy = kit.dehydrate(document.documentElement.cloneNode(true));
  assert.equal(copy.querySelector('#declared').innerHTML, json(chartData), "a chart's drawing comes off, its data stays");
  assert.equal(copy.querySelector('#part').innerHTML, json({every: 1000}), 'a part comes off too');
  assert.equal(copy.querySelector('.doc-chart'), null);
  assert.ok(copy.querySelector('[data-doc-sheet="b"]').hidden, 'the Sheet shown stays shown');
  const again = kit.dehydrate(new JSDOM(copy.outerHTML).window.document.documentElement);
  assert.equal(again.outerHTML, copy.outerHTML, 'an export of an export is the same');
  env.dom.window.close();
}
// An embed's PDF held as a data: address shows through a blob: one; an export of the view writes the
// data: address back; the blob: one goes with the block.
{
  const pdf = 'data:application/pdf;base64,' + Buffer.from('%PDF-1.4').toString('base64');
  const dom = new JSDOM(`<!doctype html><html><body><main><figure class="doc-embed doc-embed--file"><iframe class="doc-embed-frame" src="${pdf}"></iframe><figcaption></figcaption></figure></main></body></html>`, {url: 'https://report.test/report.html', runScripts: 'outside-only'});
  const w = dom.window;
  const made = []; const revoked = [];
  w.URL.createObjectURL = (blob) => { made.push(blob.type); return 'blob:https://report.test/1'; };
  w.URL.revokeObjectURL = (url) => revoked.push(url);
  w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  w.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
  w.eval(sources.runtime);
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const frame = w.document.querySelector('iframe');
  assert.deepEqual([frame.getAttribute('src'), made], ['blob:https://report.test/1', ['application/pdf']], 'shown through a blob: address');
  const copy = w.DocKit.dehydrate(w.document.documentElement.cloneNode(true));
  assert.equal(copy.querySelector('iframe').getAttribute('src'), pdf, 'an export of the view keeps the data: address');
  assert.equal(copy.querySelector('iframe').hasAttribute('data-doc-blob'), false);
  w.document.querySelector('figure').remove();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(revoked, ['blob:https://report.test/1'], 'the blob: address goes with the block');
  dom.window.close();
}
// 流程图 (runtime/flowchart.js): a flowchart's steps in rows that fill its width. The lines a text takes
// are counted as the browser breaks them, and a card's height from its title and content (a
// paragraph's lines, a list's items with what they hold, a quote's paragraphs, the margins between
// blocks as the browser collapses them; a picture or any block but text, a list, a quote or a
// divider more than any card). Where neither the list nor a step says (自动), a step goes on the
// row of the one before it while the row reads well: five at most, in a flowchart 520px wide at
// least, each card 116px wide at least and as wide as its longest word needs, each title on two
// lines at most and no card taller than it is wide; else it starts the next row (a step holding a
// picture a row of its own). 向右 (data-direction="row") joins whatever the count and the lengths
// while each card keeps 116px and its longest word (a row too narrow wraps); 向下 ("column") ends
// the row; a step's own direction is the joint after it, over the list's. A step's weight
// (--doc-flow-ratio) is its share of its row among the row's (one alone takes all of it). The
// arrows: across within a row, down from a step alone in its row, turning from a row's last step to
// the next row's first, reaching back as far as the steps before it and their gaps (a calc() of the
// step's own width, so it holds at any width). The rules go into one stylesheet the document adopts,
// keyed by the list's data-doc-flow-key: rows of steps (a basis each, the arrows across and
// turning), none for a flowchart of one step a row, and the gap a step written the short way needs
// under its words. On the page: each flowchart a key and a name for screen readers (an ordinary
// list untouched), laid out again as its direction, a step's direction or its weight change or a
// step gets a long word; the numbers drawn again by a mark set for a moment, nothing written on
// the steps; an export of the view takes the key and the name off (an author's name stays); a
// flowchart leaving the page takes its rules and its name with it, and put back keeps its key.
{
  const { FLOW_ROW, cardHeight, flowLayout, flowRules, linesOf, reachOf, sharesOf, wordsOf } = await import('../../src/render/kit/runtime/flowchart.js');
  assert.deepEqual(FLOW_ROW, { most: 5, least: 116, narrow: 520, gap: 28, title: 2 });
  const word = (width) => ({ width });
  const space = { width: 4, space: true };
  assert.equal(linesOf([], 100), 0, 'no words, no line');
  assert.equal(linesOf(Array(10).fill(word(16)), 64), 3, 'Chinese characters four a line: 4, 4, 2');
  assert.equal(linesOf([word(40), space, word(40), space, word(40)], 90), 2, 'a word that would pass the edge starts the next line');
  assert.equal(linesOf([word(40), space, word(46), space], 90), 1, 'a space at the edge hangs past it');
  assert.equal(linesOf([word(250)], 100), 3, 'a word wider than a line broken in it');
  assert.equal(linesOf([word(30), space, word(250)], 100), 4, 'on lines of its own after the words before it');

  // A step as stepShape measures it: 16px characters on 26px lines, its padding 56px across and 20px down;
  // its content 5px under the title: a paragraph, a list (an item of n characters each, 5px apart, its
  // text 25px in), an item holding a list of its own, a picture.
  const cjk = (count, size = 16) => Array(count).fill(word(size));
  const items = (counts) => counts.map((count) => ({ gap: 5, pieces: cjk(count), line: 26, blocks: [] }));
  const step = ({ title = 2, longest = 16, description = 0, list = [], nested = 0, picture = false, short = false } = {}) => ({
    word: longest + 56, across: 56, down: 20, title: { pieces: cjk(title), line: 26 }, short,
    blocks: [
      ...(description ? [{ gap: 5, pieces: cjk(description), line: 26 }] : []),
      ...(list.length ? [{ gap: 5, indent: 25, items: items(list) }] : []),
      ...(nested ? [{ gap: 5, indent: 25, items: [{ gap: 0, pieces: cjk(2), line: 26, blocks: [{ gap: 5, indent: 25, items: items(Array(nested).fill(2)) }] }] }] : []),
      ...(picture ? [{ gap: 5 }] : []),
    ],
  });
  const steps = (count, shape = {}) => Array.from({ length: count }, () => step(shape));
  assert.equal(cardHeight(step({ description: 12 }), 101), 20 + 26 + 5 + 2 * 26, 'a card: its padding, its title, its paragraph in 6 characters a line');
  assert.equal(cardHeight(step({ list: [2, 2, 8] }), 101), 20 + 26 + 5 + 26 + 5 + 26 + 5 + 2 * 26, 'a list: its items one a line, the last on two in 76px (4 characters a line, 25px in)');
  assert.equal(cardHeight(step({ nested: 2 }), 101), 20 + 26 + 5 + 26 + 5 + 26 + 5 + 26, 'an item holding a list: under it, 50px in');
  assert.equal(cardHeight(step({ picture: true }), 101), Infinity, 'a picture: more than any card');
  assert.equal(cardHeight({ word: 72, across: 56, down: 20, title: { pieces: [], line: 26 }, blocks: [{ gap: 5, pieces: [], line: 26 }] }, 101), 20 + 26 + 5 + 26, 'an empty title and an empty paragraph: a line each');
  // The margins between two blocks as the browser lays them: the larger of the one's below and the
  // next one's above (they collapse), the last one's below inside the card (its padding stops it); a
  // quote's paragraphs the same inside its padding.
  const bare = { word: 72, across: 56, down: 20, title: { pieces: cjk(2), line: 26 } };
  assert.equal(cardHeight({ ...bare, blocks: [{ gap: 5, after: 8, pieces: cjk(2), line: 26 }, { gap: 5, after: 0, pieces: cjk(2), line: 26 }] }, 101), 20 + 26 + 5 + 26 + 8 + 26, 'two blocks: the larger margin between them, not both');
  assert.equal(cardHeight({ ...bare, blocks: [{ gap: 5, after: 12, pieces: cjk(2), line: 26 }] }, 101), 20 + 26 + 5 + 26 + 12, 'the last block\'s margin below inside the card');
  assert.equal(cardHeight({ ...bare, blocks: [{ gap: 5, after: 0, indent: 17, down: 4, blocks: [{ gap: 0, after: 12, pieces: cjk(2), line: 26 }, { gap: 0, after: 0, pieces: cjk(2), line: 26 }] }] }, 101), 20 + 26 + 5 + 2 + 26 + 12 + 26 + 2, 'a quote: its padding, its paragraphs and the margin between them');

  // The rows, as the lengths of each ("5+3": five steps, then three).
  const rows = (input) => flowLayout(input).rows.map((row) => row.length).join('+');
  const cases = [
    // 自动: as many as read well a row, the rest wrapping.
    [{ width: 712, steps: steps(3) }, '3'],
    [{ width: 712, steps: steps(4, { title: 4 }) }, '4'],
    [{ width: 712, steps: steps(5, { title: 4 }) }, '5'], // 120px each: five at the reading width
    [{ width: 712, steps: steps(8) }, '5+3'], // more than five: five a row, the rest the next
    [{ width: 2000, steps: steps(6) }, '5+1'],
    [{ width: 519, steps: steps(2) }, '1+1'], // a narrow flowchart: one a row
    [{ width: 520, steps: steps(2) }, '2'],
    [{ width: 712, steps: steps(1) }, '1'],
    [{ width: 712, steps: [step(), step({ longest: 300 }), step()] }, '1+1+1'], // a word wider than a card beside another
    [{ width: 712, steps: [step(), step({ title: 15 }), step(), step()] }, '3+1'], // a title on three lines in four, two in three
    [{ width: 712, steps: [step(), step({ title: 12 }), step(), step()] }, '4'], // on two
    [{ width: 712, steps: [step(), step({ description: 26 }), step(), step()] }, '3+1'], // a card taller than wide in four (181px in 157px), not in three (129px in 219px)
    [{ width: 712, steps: steps(4, { list: [2, 2] }) }, '4'], // 108px in 157px
    [{ width: 712, steps: steps(4, { list: [2, 2, 2, 2] }) }, '3+1'], // four items: 170px in four, in 219px in three
    [{ width: 712, steps: [step(), step({ nested: 4 }), step()] }, '3'], // an item and its four: 201px in 219px
    [{ width: 712, steps: [step(), step({ nested: 5 }), step()] }, '2+1'], // and five: 232px, in 342px in two
    [{ width: 712, steps: [step(), step({ picture: true }), step(), step()] }, '1+1+2'], // a picture: a row of its own
    [{ width: 0, steps: steps(2) }, '1+1'], // not shown (a hidden panel): laid out again when it is
    // 向右 on the whole: one row while each card keeps its least width and its longest word, wrapping where it would not.
    [{ width: 712, steps: [step(), step({ picture: true }), step()], direction: 'row' }, '3'],
    [{ width: 1000, steps: steps(6), direction: 'row' }, '6'],
    [{ width: 712, steps: steps(4, { title: 15 }), direction: 'row' }, '4'],
    [{ width: 712, steps: steps(8), direction: 'row' }, '5+3'], // 120px five a row: six would be 95px
    [{ width: 712, steps: [step(), step({ longest: 300 })], direction: 'row' }, '1+1'],
    [{ width: 400, steps: steps(2), direction: 'row' }, '2'], // no narrow flowchart's rule: 186px each
    // 向下 on the whole: one a row.
    [{ width: 712, steps: steps(3), direction: 'column' }, '1+1+1'],
    // A step's own: the joint after it, over the whole's.
    [{ width: 712, steps: steps(5), direction: 'column', directions: ['row', null, 'row'] }, '2+2+1'], // 纵向, 向右 on steps 1 and 3
    [{ width: 712, steps: steps(5), direction: 'row', directions: [null, null, 'column'] }, '3+2'], // 横向, 向下 on step 3
    [{ width: 712, steps: steps(4), directions: ['column'] }, '1+3'], // 自动, 向下 on step 1
    [{ width: 2000, steps: steps(6), directions: [null, null, null, null, 'row'] }, '6'], // 自动, 向右 on step 5: past five a row
    [{ width: 712, steps: steps(7), directions: [null, null, null, null, 'row', 'row'] }, '5+2'], // as long as the cards keep 116px: six would be 95px
    [{ width: 712, steps: [step(), step({ picture: true })], directions: ['row'] }, '2'], // a picture beside another, as asked
    // Weights: a step's share of its row; one too narrow for its least width wraps.
    [{ width: 712, steps: steps(3), direction: 'row', ratios: [0.8, 0.1, 0.1] }, '1+2'], // 76px beside the first: alone, then the two halves
    [{ width: 712, steps: steps(3), direction: 'row', ratios: [0.5, 0.25, 0.25] }, '3'], // 164px each of the two
    // 自动 with weights (widths a reader dragged): how many read well a row goes by equal widths, the
    // weights only by the least width, so the row stays the row it was.
    [{ width: 712, steps: steps(4, { description: 12 }) }, '4'], // 157px each: 103px tall
    [{ width: 712, steps: steps(4, { description: 12 }), ratios: [0.4, 0.2, 0.2, 0.2] }, '4'], // 126px: 129px tall, still in the row
    [{ width: 712, steps: steps(4, { description: 12 }), ratios: [0.55, 0.15, 0.15, 0.15] }, '2+2'], // 116px less a fraction beside two: under its least, wrapped
  ];
  for (const [input, expected] of cases) assert.equal(rows(input), expected, JSON.stringify({ width: input.width, steps: input.steps.length, direction: input.direction, directions: input.directions, ratios: input.ratios }));
  assert.deepEqual(wordsOf('需求 analysis-v2，评审'), ['需', '求', 'analysis-v2', '，', '评', '审'], 'a Chinese character a word of its own, a run of letters one');

  // A row's shares: the weights among the row's (a step with none weighing as the weighted ones on the whole), one alone all of it.
  const near = (values) => values.map((value) => Math.round(value * 1000) / 1000);
  assert.deepEqual(sharesOf([0, 1, 2], [0.5, 0.25, 0.25]), [0.5, 0.25, 0.25]);
  assert.deepEqual(sharesOf([0, 1], [0.4, null]), [0.5, 0.5], 'one weighted, one not: as much as the other');
  assert.deepEqual(near(sharesOf([0, 1, 2], [0.6, null, 0.2])), [0.5, 0.333, 0.167]);
  assert.deepEqual(sharesOf([3, 4], []), [0.5, 0.5], 'none weighted: equal');
  assert.deepEqual(sharesOf([2], [0.3, 0.3, 0.3]), [1], 'alone in its row: all of it');

  // Arrows: across in a row, turning from a row's last step, down from a step alone in its row; none after the last.
  const eight = flowLayout({ width: 712, steps: steps(8) });
  assert.deepEqual(eight.nodes.map((node) => node.out), ['right', 'right', 'right', 'right', 'turn', 'right', 'right', null]);
  assert.deepEqual(flowLayout({ width: 712, steps: steps(3), direction: 'column' }).nodes.map((node) => node.out), ['down', 'down', null]);
  const mixed = flowLayout({ width: 712, steps: steps(5), direction: 'row', directions: ['column', null, 'column'] }); // [1] [2 3] [4 5]
  assert.deepEqual(mixed.rows, [[0], [1, 2], [3, 4]]);
  assert.deepEqual(mixed.nodes.map((node) => node.out), ['down', 'right', 'turn', 'right', null], 'straight down from a step alone in its row, the next row\'s first right under it');
  // A turn reaches back over the steps before it in its row and their gaps: from the fifth of five
  // (120px each at 712px) 4 × 120 + 4 × 28 = 592px, as a calc() of its own width (its ::after's 100%
  // and its border: 120px) four times over plus the gaps.
  const fifth = eight.nodes[4];
  assert.deepEqual([fifth.index, fifth.count, ...near([fifth.share, fifth.before])], [4, 5, 0.2, 0.8]);
  assert.equal(Math.round(reachOf(fifth, 712)), 592);
  assert.equal(reachOf(fifth), 'calc((100% + 2px) * 4 + 112px)');
  const weighted = flowLayout({ width: 712, steps: steps(4), direction: 'row', ratios: [0.5, 0.25, 0.25, null], directions: [null, null, 'column'] });
  assert.equal(reachOf(weighted.nodes[2], 712), (712 - 56) * 0.75 + 56, 'the third of a row of halves and quarters: the first two and two gaps');
  assert.equal(reachOf(weighted.nodes[2]), 'calc((100% + 2px) * 3 + 56px)');

  // The rules: none for one step a row; rows of steps, each a share of its row's width (a pixel
  // back by its growth), the arrows across and turning; a step written the short way the list's gap
  // under its words.
  const key = 'ol.doc-flow[data-doc-flow-key="7"]';
  assert.equal(flowRules('7', flowLayout({ width: 712, steps: steps(3), direction: 'column' })), '');
  const css = flowRules('7', eight).split('\n');
  assert.equal(css[0], `${key} { flex-flow: row wrap; column-gap: 28px; }`);
  assert.ok(css.includes(`${key} > li:nth-of-type(1) { flex: 1 1 calc((100% - 112px) * 0.2 - 1px); }`), css.join('\n'));
  assert.ok(css.includes(`${key} > li:nth-of-type(6) { flex: 1 1 calc((100% - 56px) * 0.33333 - 1px); }`), css.join('\n'));
  assert.equal(css.filter((rule) => rule.includes('clip-path: var(--doc-flow-right)')).length, 6, 'an arrow across after each step but a row\'s last');
  assert.ok(css.includes(`${key} > li:nth-of-type(5)::after { --doc-flow-reach: calc((100% + 2px) * 4 + 112px); left: calc(18px - var(--doc-flow-reach)); width: calc(var(--doc-flow-reach) + 10px); clip-path: var(--doc-flow-turn-shape, none); -webkit-mask: var(--doc-flow-turn-mask, var(--doc-flow-turn)); mask: var(--doc-flow-turn-mask, var(--doc-flow-turn)); }`), css.join('\n'));
  assert.ok(flowRules('7', mixed).includes(`${key} > li:nth-of-type(1) { flex: 1 1 100%; }`), 'a step alone in its row: all of it');
  const short = flowRules('7', flowLayout({ width: 712, steps: [step({ short: true }), step()], direction: 'column' }));
  assert.equal(short, `${key} > li:nth-of-type(1) > :is(:first-child, .doc-icon + *):not(.doc-icon, div, figure, details, table, pre) { margin-top: var(--doc-list-gap); }`, 'a step written the short way: its content the list\'s gap under its words, in a column too');
  // On paper: a page's break between two rows (the next row not 34px under the one before, as the
  // browser lays the page out in pages) parts the arrow from a row's last step to it, which is left
  // out; within a page, and for a step not drawn, none.
  const { pagedApart } = await import('../../src/render/kit/runtime/flowchart.js');
  const card = (top, bottom, width = 120) => ({ top, bottom, width });
  assert.deepEqual(pagedApart([[0, 1], [2, 3], [4]], [card(0, 80), card(0, 100), card(134, 200), card(134, 180), card(234, 260)], 34), [], 'every row 34px under the one before: on one page');
  assert.deepEqual(pagedApart([[0, 1], [2, 3], [4]], [card(0, 80), card(0, 100), card(1123, 1190), card(1123, 1180), card(1224, 1260)], 34), [1], 'the second row on the next page: the first row\'s last step\'s arrow cut');
  assert.deepEqual(pagedApart([[0], [1], [2]], [card(1000, 1100), card(1123, 1160), card(1194, 1230)], 34), [0], 'a column too: a break inside the gap');
  assert.deepEqual(pagedApart([[0], [1]], [card(0, 0, 0), card(500, 560)], 34), [], 'a step not drawn: no row to part');
  assert.ok(flowRules('7', eight, { cut: [4] }).split('\n').includes(`${key} > li:nth-of-type(5)::after { content: none; }`), 'the arrow left out by a rule of the step\'s, after its turning one');
  assert.ok(flowRules('7', flowLayout({ width: 712, steps: steps(3), direction: 'column' }), { keep: true }) === `@media print { ${key} { break-inside: avoid; } }`, 'kept on one page: a print rule alone, in a column too');

  // A step's inline code measured in its own font with its own padding (jsdom: no canvas, so a
  // character other than a Chinese one is 0.6 of its font size wide): http://localhost:5180 in 20px
  // code with 5px at each side is 21 × 12 + 10 = 262px, not the 201.6px it is in the paragraph's
  // 16px (the step's widest word; a long run, src/shared/long-runs.mjs, it lays out a piece a
  // character, the code's padding on its first and last); a piece running on from the code into the
  // words after it is one piece; a step holding no code measured as before.
  {
    const { stepShape } = await import('../../src/render/kit/runtime/flowchart.js');
    const coded = environment(`<ol class="doc-flow"><li style="font-size: 16px"><p style="font-size: 16px"><strong>打开</strong></p><p style="font-size: 16px"><code style="font-size: 20px; padding: 0 5px">http://localhost:5180</code>；第一次 run <code style="font-size: 20px; padding: 0 5px">npm</code>-x</p></li><li style="font-size: 16px"><p style="font-size: 16px"><strong>打开</strong></p><p style="font-size: 16px">http://localhost:5180；第一次</p></li></ol>`);
    const [withCode, without] = coded.w.document.querySelectorAll('li');
    Object.assign(globalThis, { getComputedStyle: coded.w.getComputedStyle.bind(coded.w), document: coded.w.document }); // the module's globals: this page's
    const shape = stepShape(withCode);
    const widths = shape.blocks[0].pieces.map((piece) => Math.round(piece.width * 10) / 10);
    assert.deepEqual([shape.word, widths], [262, [17, ...Array(19).fill(12), 17, 16, 16, 16, 16, 9.6, 28.8, 9.6, 65.2]], 'code in its own font and padding; npm and -x one piece');
    assert.deepEqual(stepShape(without).word, Math.ceil(21 * 16 * 0.6), 'no code: the paragraph\'s font');
    delete globalThis.getComputedStyle;
    delete globalThis.document;
    coded.dom.window.close();
  }

  // A long run (src/shared/long-runs.mjs: more than 20 characters with no place to break inside it)
  // breaks anywhere, as the kit's span breaks it (runtime/spacing.js), and so does every run of a block
  // that breaks anywhere (word-break: break-all: one the page editor marks for holding a long run): a
  // piece a character (jsdom: no canvas, a letter 0.6 of 16px). 见 http://localhost:5180 页面 (21
  // letters) at 120px takes 3 lines in either (见 and 9 letters, 12 letters, 页面), 4 as whole words; an
  // ordinary word (internationalization, 20 letters) is one piece where the block breaks as the page
  // does: 见 internationalization 页面 at 200px takes 3 lines (见, the word, 页面), 2 where the block
  // breaks anywhere. The step's widest word is the whole run still.
  {
    const { stepShape, linesOf } = await import('../../src/render/kit/runtime/flowchart.js');
    const step = (words, look = '') => `<li style="font-size: 16px"><p style="font-size: 16px"><strong>打开</strong></p><p style="font-size: 16px;${look}">${words}</p></li>`;
    const breaking = environment(`<ol class="doc-flow">${step('见 http://localhost:5180 页面', ' word-break: break-all')}${step('见 http://localhost:5180 页面')}${step('见 internationalization 页面')}${step('见 internationalization 页面', ' word-break: break-all')}</ol>`);
    const [anywhere, long, ordinary, marked] = [...breaking.w.document.querySelectorAll('li')];
    Object.assign(globalThis, { getComputedStyle: breaking.w.getComputedStyle.bind(breaking.w), document: breaking.w.document });
    const [split, run, word, all] = [anywhere, long, ordinary, marked].map(stepShape);
    assert.deepEqual([split.blocks[0].pieces.length, run.blocks[0].pieces.length], [26, 26], 'the run a piece a character: 见, a space, 21 letters, a space, 页, 面');
    assert.deepEqual([linesOf(split.blocks[0].pieces, 120), linesOf(run.blocks[0].pieces, 120)], [3, 3], 'the line ends inside the run, as the browser breaks it');
    assert.equal(word.blocks[0].pieces.length, 6, 'an ordinary word one piece');
    assert.deepEqual([linesOf(word.blocks[0].pieces, 200), linesOf(all.blocks[0].pieces, 200)], [3, 2], 'the word carried whole to the next line, parted only where its block breaks anywhere');
    assert.ok(split.word === run.word && run.word > 200, 'its widest word the whole run still');
    delete globalThis.getComputedStyle;
    delete globalThis.document;
    breaking.dom.window.close();
  }

  // On the page (jsdom: no canvas, so a Chinese character is its font size wide; no stylesheet, so
  // no padding): a step written as a node measured by its first paragraph, its icon no block.
  const env = environment(`<main class="doc-page">
    <ol class="doc-flow" id="a"><li><p><strong>需求</strong></p></li><li><div class="doc-icon">📮</div><p><strong>设计</strong></p><p>写方案</p></li><li>上线</li></ol>
    <ol class="doc-flow" id="b" aria-label="上线流程"><li><p><strong>一</strong></p></li><li><p><strong>二</strong></p></li></ol>
    <ol id="c"><li>一</li><li>二</li></ol>
    <ol class="doc-flow" id="d"><li>需求</li><li>设计<figure class="doc-bookmark" style="display: none"></figure></li><li>上线</li></ol>
    <ol class="doc-flow" id="e"><li>需求</li><li>设计<figure class="doc-bookmark"><a href="https://example.com">书签</a></figure></li><li>上线</li></ol>
  </main>`);
  const widths = { a: 712, b: 400, d: 712, e: 712, twin: 712 };
  Object.defineProperty(env.w.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return widths[this.id] ?? 0; } });
  await started(env);
  env.flush();
  const doc = env.w.document;
  const [a, b, c] = ['a', 'b', 'c'].map((id) => doc.getElementById(id));
  const keyOf = (list) => list.getAttribute('data-doc-flow-key');
  const sheet = () => [...doc.adoptedStyleSheets[0].cssRules].map((rule) => rule.cssText);
  const allRulesOf = (list) => sheet().filter((rule) => rule.includes(`[data-doc-flow-key="${keyOf(list)}"]`));
  const rulesOf = (list) => allRulesOf(list).filter((rule) => !rule.startsWith('@media print')); // the screen's (print's: kept on one page)
  const laidOut = (list) => rulesOf(list).some((rule) => rule.includes('flex-flow'));
  assert.equal(doc.adoptedStyleSheets.length, 1, 'one stylesheet for every flowchart, adopted by the document');
  assert.deepEqual([a, b, c].map((list) => [keyOf(list), list.getAttribute('aria-label')]), [['1', '流程图'], ['2', '上线流程'], [null, null]], 'a key each and the name the kit gives; an ordinary list untouched');
  assert.deepEqual([laidOut(a), rulesOf(b).length], [true, 0], `a flowchart in rows; a narrow one one a row, no rules: ${sheet().join('\n')}`);
  assert.ok([a, b].every((list) => allRulesOf(list).some((rule) => rule.startsWith('@media print') && rule.includes('break-inside: avoid'))), `on paper each kept on one page (none taller than a page here): ${sheet().join('\n')}`);
  assert.ok(rulesOf(a).some((rule) => rule.includes('nth-of-type(3) > :is(:first-child, .doc-icon + *)')), 'the step written the short way: its gap under its words');
  assert.deepEqual(['d', 'e'].map((id) => laidOut(doc.getElementById(id))), [true, false], 'a block with no box (an empty media block a reader is not shown) is not measured; a bookmark shown reads beside no other');
  assert.deepEqual([...a.children].map((step) => step.getAttributeNames().join()), ['', '', ''], 'nothing written on the steps');
  const settled = async () => { await new Promise((resolve) => setTimeout(resolve, 0)); env.flush(); };
  a.setAttribute('data-direction', 'column');
  await settled();
  assert.equal(laidOut(a), false, 'data-direction="column": one a row');
  a.removeAttribute('data-direction');
  await settled();
  assert.equal(laidOut(a), true, 'and without it the kit fills its rows again');
  a.children[0].setAttribute('data-direction', 'column');
  await settled();
  assert.ok(rulesOf(a).some((rule) => rule.includes('nth-of-type(1)') && rule.includes('100%')) && rulesOf(a).some((rule) => rule.includes('nth-of-type(2)::after') && rule.includes('doc-flow-right')), `a step's own direction: the row ends after it: ${rulesOf(a).join('\n')}`);
  a.children[0].removeAttribute('data-direction');
  [0.25, 0.5, 0.25].forEach((ratio, index) => a.children[index].setAttribute('style', `--doc-flow-ratio: ${ratio}`));
  await settled();
  assert.ok(rulesOf(a).some((rule) => rule.includes('nth-of-type(2) {') && rule.includes('flex: 1 1 calc(') && rule.includes('0.5*')), `a step's weight: its share of its row: ${rulesOf(a).join('\n')}`);
  [...a.children].forEach((step) => step.removeAttribute('style'));
  await settled();
  // Items moved (a list put in a step): its numbers drawn again by the kit's mark for a moment, never
  // its style or its display (the page keeps its height and its scroll position), the mark gone after.
  const marks = [];
  const watch = new env.w.MutationObserver((records) => marks.push(...records.map((record) => `${record.target.localName}:${record.attributeName}`)));
  watch.observe(a, { attributes: true, subtree: true });
  a.querySelector('li').insertAdjacentHTML('beforeend', '<ul><li>internationalization-and-localization</li></ul>');
  await settled();
  watch.disconnect();
  assert.ok(rulesOf(a).some((rule) => rule.includes('nth-of-type(1) {') && rule.includes('flex: 1 1 100%')) && !rulesOf(a).some((rule) => rule.includes('nth-of-type(1)::after')), `an item of a list a step holds with a word wider than a card beside another: a row of its own, straight down from it: ${rulesOf(a).join('\n')}`);
  assert.deepEqual([...new Set(marks)], ['ol:data-doc-flow-recount'], 'the numbers drawn again by a mark the kit sets, nothing else written');
  assert.equal(a.hasAttribute('data-doc-flow-recount'), false, 'and the mark gone after');
  const copy = env.w.DocKit.dehydrate(doc.documentElement.cloneNode(true));
  assert.deepEqual([...copy.querySelectorAll('ol:not(#d, #e)')].map((list) => [keyOf(list), list.getAttribute('aria-label')]), [[null, null], [null, '上线流程'], [null, null]], 'an export of the view: the key and the name the kit gave off, the author\'s name kept');
  const d = doc.getElementById('d');
  const dKey = keyOf(d);
  d.remove();
  await settled();
  assert.deepEqual([allRulesOf(d), d.getAttribute('aria-label'), keyOf(d)], [[], null, dKey], 'a flowchart leaving the page takes its rules and the name it was given with it, its key kept');
  doc.querySelector('main').append(d);
  await settled();
  assert.deepEqual([keyOf(d), laidOut(d)], [dKey, true], 'put back (an undo): laid out by the same key');
  const twin = d.cloneNode(true);
  twin.id = 'twin';
  doc.querySelector('main').append(twin);
  await settled();
  assert.ok(keyOf(twin) && keyOf(twin) !== dKey && laidOut(twin), 'a copy carrying another\'s key gets a key of its own');
  env.dom.window.close();
}
// The runtime carries what the kernel reads of the components' descriptions, and no more (RUNTIME_FIELDS,
// put in by the build): the fields it reads are those listed, but for a package's parts, which only
// DocKit.describe says, no prose of a description is in the file, and a copy of a page made by a
// runtime with whole descriptions is the same as the one made by this.
{
  const kernel = await fs.readFile(new URL('../../src/render/kit/runtime/kernel.js', import.meta.url), 'utf8');
  const read = new Set([...kernel.matchAll(/descriptions\.get\([^)]*\)\??\.(\w+)|\bdescription\.(\w+)/g)].map((match) => match[1] ?? match[2]));
  assert.deepEqual([...read].filter((field) => field !== 'parts').sort(), [...RUNTIME_FIELDS].sort(), 'the kernel reads the fields listed in RUNTIME_FIELDS: no others');
  for (const component of COMPONENTS) for (const prose of Object.values(component.attrs ?? {})) assert.ok(!sources.runtime.includes(prose), `the description of ${component.id} stays out of the runtime: ${prose}`);
  const whole = await buildKitFile('runtime.js', {define: {__COMPONENT_RUNTIME__: JSON.stringify(COMPONENTS), __COMPONENT_FLOWS__: JSON.stringify(FLOWS), __COMPONENT_BLOCK_FLOWS__: JSON.stringify(FLOW_BLOCKS)}});
  assert.ok(whole.length - sources.runtime.length > 5000, 'whole descriptions make the runtime larger');
  // One element for each selector the descriptions say the kit marks, with every mark it sets.
  const marked = (source) => {
    const dom = new JSDOM('<!doctype html><html><body><main></main></body></html>', {url: 'https://report.test/report.html', runScripts: 'outside-only'});
    const w = dom.window;
    w.matchMedia = () => ({matches: false, addEventListener() {}, removeEventListener() {}});
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.eval(source);
    const main = w.document.querySelector('main');
    const make = (selector, names = []) => selector.split(',').forEach((part) => {
      const {tag, classes, attrs} = parseCompound(part);
      const node = w.document.createElement(tag ?? 'div');
      node.classList.add(...classes);
      for (const {name, value} of attrs) node.setAttribute(name, value ?? '');
      for (const name of names) node.setAttribute(name, '1');
      main.append(node);
    });
    for (const {runtime = {}} of COMPONENTS) {
      for (const selector of runtime.generated ?? []) make(selector);
      for (const [selector, names] of Object.entries(runtime.attrs ?? {})) make(selector, names);
      for (const [selector, names] of Object.entries(runtime.classes ?? {})) {
        const before = main.children.length;
        make(selector);
        for (const node of [...main.children].slice(before)) node.classList.add(...names);
      }
    }
    const input = main.innerHTML;
    const copy = w.DocKit.dehydrate(w.document.documentElement.cloneNode(true)).querySelector('main').innerHTML;
    dom.window.close();
    return {input, copy};
  };
  const mine = marked(sources.runtime);
  assert.notEqual(mine.copy, mine.input, 'the copy has what the kit set taken off');
  assert.deepEqual(mine, marked(whole), 'the same copy as a runtime with whole descriptions makes');
}
// The descriptions the build puts in are read from the files as they are when it runs, not as the server
// imported them at its start (a description edited under the live preview reaches the next rebuild).
{
  assert.deepEqual(componentRuntime(), JSON.parse(JSON.stringify(runtimeDescriptions())), 'the descriptions as the files hold them');
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'runtime-descriptions-'));
  try {
    await fs.cp(new URL('../../src/shared/components', import.meta.url), path.join(root, 'components'), {recursive: true});
    await fs.copyFile(new URL('../../src/shared/html-tree.mjs', import.meta.url), path.join(root, 'html-tree.mjs'));
    const entry = path.join(root, 'components', 'index.mjs');
    assert.deepEqual(componentRuntime(entry), componentRuntime(), 'a copy of the files says the same');
    const file = path.join(root, 'components', 'figure.mjs');
    const text = await fs.readFile(file, 'utf8');
    assert.ok(text.includes('match: "figure",'), 'figure.mjs holds the match');
    await fs.writeFile(file, text.replace('match: "figure",', 'match: "figure.edited",'));
    assert.equal(componentRuntime(entry).find((component) => component.id === 'figure').match, 'figure.edited', 'an edited description is read from disk');
  } finally {
    await fs.rm(root, {recursive: true, force: true});
  }
}
// 图片放大 (runtime/zoom.js, src/shared/zoom.mjs): a picture clicked opens large. Its size: fitted to
// the window (48px around it from 1020px wide, 16px below), its caption's room under it, never past
// its own size; an SVG of no size of its own as large as the window lets its shape be.
{
  const { zoomFit } = await import('../../src/render/kit/runtime/zoom.js');
  const fit = (natural, room, caption = 0, shown = {width: 0, height: 0}) => zoomFit({natural: {width: natural[0], height: natural[1]}, shown, window: {width: room[0], height: room[1]}, caption});
  assert.deepEqual(fit([3000, 2000], [1280, 900]), {width: 1184, height: 789}, 'a large picture fitted to a wide window, 48px around it');
  assert.deepEqual(fit([400, 300], [1280, 900]), {width: 400, height: 300}, 'a small one at its own size, never larger');
  assert.deepEqual(fit([2000, 1000], [800, 600]), {width: 768, height: 384}, 'a window under 1020px: 16px around it');
  assert.deepEqual(fit([1000, 1000], [1280, 900], 20), {width: 772, height: 772}, 'its caption and the gap above it taken from the height');
  assert.deepEqual(fit([0, 0], [1280, 900], 0, {width: 200, height: 100}), {width: 1184, height: 592}, 'an SVG of no size of its own: the shape it is shown in, as large as the window lets it');
}
// Which pictures open, and the viewer: opened by a click on one, closed by Esc, the close button and a
// click beside the picture, the focus back where it was; nothing written on the page but the marks
// that offer a picture that opens to the keyboard (a tab stop, a button that opens a dialog, named in
// the kit's words), on those alone, not on a control of the author's own, off while the page editor
// edits the page and off an export of the view; Enter or Space on one opens it, Esc gives the focus
// back to it; nothing while the page editor edits the page or the page prints; an export of the view
// while it is open leaves it out.
{
  let printing = false;
  const media = (query) => ({matches: query === 'print' && printing, addEventListener() {}, removeEventListener() {}});
  const body = '<button id="before">before</button><main class="doc-page">'
    + '<figure class="doc-image" id="block"><img src="assets/a.png" alt="架构图"><figcaption>系统的 <strong>三层</strong> 结构</figcaption></figure>'
    + '<div class="doc-table-wrap"><table class="doc-table"><tbody><tr><td><img id="cell" src="assets/b.png" alt=""></td></tr></tbody></table></div>'
    + '<figure class="doc-figure" id="card"><h3>卡片</h3><div><img id="drawn" src="assets/c.png" alt=""></div><p class="doc-figure-caption">卡片的说明</p></figure>'
    + '<figure class="doc-figure"><img id="twin-1" src="assets/d.png" alt=""><img id="twin-2" src="assets/e.png" alt=""><figcaption>两张</figcaption></figure>'
    + '<ol class="doc-flow"><li><p><strong>节点</strong></p><figure class="doc-image"><img id="node" src="assets/f.png" alt=""><figcaption></figcaption></figure></li></ol>'
    + '<p><a href="https://example.com"><img id="linked" src="assets/g.png" alt=""></a> <img id="small" src="assets/h.png" alt=""> <img id="broken" src="assets/missing.png" alt=""> <img id="vector" src="assets/i.svg" alt=""></p>'
    + '<div class="doc-panel"><div class="doc-icon"><img id="icon" src="assets/j.png" alt=""></div><p>面板</p></div>'
    + '<p><a class="doc-link-mention" href="https://example.com"><img class="doc-link-mention-icon" id="mention" src="assets/k.png" alt="">网页</a></p>'
    + '<figure class="doc-image"><img id="own" src="assets/m.png" alt="" aria-label="作者自己的名字"><figcaption></figcaption></figure>'
    + '<div data-doc-component="local/gallery"><figure class="doc-image"><img id="component" src="assets/n.png" alt=""></figure></div>'
    + '</main><img id="outside" src="assets/l.png" alt="">';
  const page = environment(body, '', media, (w) => {
    Object.defineProperty(w.HTMLImageElement.prototype, 'complete', {get() { return true; }});
    Object.defineProperty(w.HTMLImageElement.prototype, 'naturalWidth', {get() { return /missing|\.svg$/.test(this.getAttribute('src') ?? '') ? 0 : 1600; }});
    Object.defineProperty(w.HTMLImageElement.prototype, 'naturalHeight', {get() { return /missing|\.svg$/.test(this.getAttribute('src') ?? '') ? 0 : 1000; }});
    w.document.querySelector('#small').getBoundingClientRect = () => ({width: 20, height: 20, x: 0, y: 0, left: 0, top: 0, right: 20, bottom: 20});
  });
  await started(page);
  const {w} = page;
  const doc = w.document;
  const root = doc.documentElement;
  const {zoomable, zoomCaption} = await import('../../src/shared/zoom.mjs');
  const small = doc.querySelector('#small');
  small.getBoundingClientRect = () => ({width: 20, height: 20, x: 0, y: 0, left: 0, top: 0, right: 20, bottom: 20});
  const opens = [...doc.querySelectorAll('img')].filter((img) => zoomable(img)).map((img) => img.id || img.parentElement.id);
  assert.deepEqual(opens, ['block', 'cell', 'drawn', 'twin-1', 'twin-2', 'node', 'vector', 'own'], 'pictures of the page open: an image block, a cell, a card, a flowchart node, an SVG; not a link\'s, an icon, a small one, one that did not load, one outside the page');
  // Offered to the keyboard: each that opens but the one the author named, as a button opening a dialog.
  const marks = (img) => ['data-doc-zoom', 'tabindex', 'role', 'aria-haspopup', 'aria-label'].map((name) => img.getAttribute(name));
  const offered = () => [...doc.querySelectorAll('img[data-doc-zoom]')].map((img) => img.id || img.parentElement.id);
  assert.deepEqual(offered(), ['block', 'cell', 'drawn', 'twin-1', 'twin-2', 'node', 'vector'], 'marked: the pictures that open, not an author\'s control, nor a link\'s, an icon, a small one, a broken one, one outside the page');
  assert.deepEqual([marks(doc.querySelector('#block img')), marks(doc.querySelector('#cell'))], [['', '0', 'button', 'dialog', '放大查看：架构图'], ['', '0', 'button', 'dialog', '放大查看图片']], 'a tab stop, a button opening a dialog, named by its alt or by what it does');
  assert.deepEqual(marks(doc.querySelector('#own')), [null, null, null, null, '作者自己的名字'], 'the author\'s own name kept, nothing added');
  assert.ok(zoomable(doc.querySelector('#block img')), 'the role the runtime gave it makes it no control of its own');
  assert.deepEqual([zoomCaption(doc.querySelector('#block img'))?.textContent, zoomCaption(doc.querySelector('#drawn'))?.textContent, zoomCaption(doc.querySelector('#twin-1')), zoomCaption(doc.querySelector('#node')), zoomCaption(doc.querySelector('#cell'))],
    ['系统的 三层 结构', '卡片的说明', null, null, null], 'the caption of the image block or card it is the one picture of, one with words');

  const before = doc.querySelector('main').innerHTML;
  const click = (target, init = {}) => {
    const event = new w.MouseEvent('click', {bubbles: true, cancelable: true, button: 0, ...init});
    target.dispatchEvent(event);
    return event;
  };
  const viewer = () => doc.querySelector('dialog.doc-zoom');
  const escape = () => {
    const event = new w.KeyboardEvent('keydown', {key: 'Escape', bubbles: true, cancelable: true});
    let heard = false;
    const page = () => { heard = true; };
    w.addEventListener('keydown', page);
    (doc.activeElement ?? doc.body).dispatchEvent(event);
    w.removeEventListener('keydown', page);
    return {prevented: event.defaultPrevented, heard};
  };
  doc.querySelector('#before').focus();
  const opened = click(doc.querySelector('#block img'));
  const dialog = viewer();
  assert.ok(opened.defaultPrevented && dialog?.hasAttribute('open') && dialog.parentElement === doc.body, 'a click on an image block\'s picture opens the viewer at the end of <body>');
  assert.deepEqual([dialog.querySelector('.doc-zoom-picture').getAttribute('src'), dialog.querySelector('.doc-zoom-picture').alt, dialog.getAttribute('aria-label'), dialog.querySelector('.doc-zoom-caption')?.innerHTML],
    ['https://report.test/assets/a.png', '架构图', '架构图', '系统的 <strong>三层</strong> 结构'], 'the picture, its alt, its caption as the page shows it');
  assert.deepEqual([dialog.querySelector('.doc-zoom-picture').style.width, dialog.querySelector('.doc-zoom-picture').style.height], ['928px', '580px'], 'its size worked out (jsdom\'s window: 1024 by 768, the caption no height)');
  assert.ok(root.classList.contains('doc-zoom-open') && doc.activeElement === dialog, 'the page kept from scrolling, the focus on the viewer');
  const copy = page.w.DocKit.dehydrate(root.cloneNode(true));
  assert.ok(!copy.querySelector('.doc-zoom') && !copy.classList.contains('doc-zoom-open'), 'an export of the view while it is open leaves the viewer out');
  assert.deepEqual(escape(), {prevented: true, heard: false}, 'Esc closes it and goes no further (演示视图 ends on an Esc the window hears)');
  assert.ok(!viewer() && !root.classList.contains('doc-zoom-open') && doc.activeElement === doc.querySelector('#before'), 'closed: gone, the page scrolls again, the focus back where it was');
  assert.deepEqual(escape(), {prevented: false, heard: true}, 'closed, Esc is the page\'s again');

  // The keyboard: Enter or Space on a picture the keyboard reached opens it; Esc gives it the focus back.
  const key = (target, k, init = {}) => {
    const event = new w.KeyboardEvent('keydown', {key: k, bubbles: true, cancelable: true, ...init});
    target.dispatchEvent(event);
    return event;
  };
  const blockImg = doc.querySelector('#block img');
  blockImg.focus();
  assert.equal(doc.activeElement, blockImg, 'the picture takes the focus');
  assert.ok(key(blockImg, 'Enter').defaultPrevented && viewer()?.hasAttribute('open') && doc.activeElement === viewer(), 'Enter opens it, the focus on the viewer');
  escape();
  assert.ok(!viewer() && doc.activeElement === blockImg, 'Esc closes it, the focus back on the picture');
  assert.ok(key(blockImg, ' ').defaultPrevented && viewer(), 'Space opens it (and scrolls nothing)');
  escape();
  assert.ok(!key(blockImg, 'Enter', {ctrlKey: true}).defaultPrevented && !viewer(), 'with a modifier: the browser\'s');
  for (const id of ['small', 'own']) {
    const img = doc.querySelector(`#${id}`);
    assert.ok(!key(img, 'Enter').defaultPrevented && !viewer(), `${id}: Enter opens nothing (no mark)`);
  }
  // An export of the view: no mark; the page keeps them.
  const viewCopy = page.w.DocKit.dehydrate(root.cloneNode(true));
  assert.ok(!viewCopy.querySelector('[data-doc-zoom], img[tabindex], img[role]') && viewCopy.querySelector('#own').getAttribute('aria-label') === '作者自己的名字' && offered().length === 7, 'an export of the view takes the marks off, the author\'s name stays');

  click(doc.querySelector('#drawn'));
  assert.equal(viewer()?.querySelector('.doc-zoom-caption')?.textContent, '卡片的说明', 'a card\'s picture, its caption');
  click(viewer().querySelector('.doc-zoom-picture'));
  assert.ok(viewer(), 'a click on the picture leaves it open');
  click(viewer().querySelector('.doc-zoom-close'));
  assert.ok(!viewer(), 'the close button closes it');
  click(doc.querySelector('#cell'));
  assert.ok(viewer() && !viewer().querySelector('.doc-zoom-caption'), 'a cell\'s picture, no caption');
  click(viewer());
  assert.ok(!viewer(), 'a click beside the picture closes it');
  click(doc.querySelector('#node'));
  click(doc.querySelector('#drawn'));
  assert.equal(doc.querySelectorAll('dialog.doc-zoom').length, 1, 'one viewer at a time');
  w.dispatchEvent(new w.Event('beforeprint'));
  assert.ok(!viewer() && !root.classList.contains('doc-zoom-open'), 'printing closes it');

  for (const id of ['small', 'broken', 'icon', 'outside']) { // a link's own (navigation) is zoomable's alone above
    const event = click(doc.querySelector(`#${id}`));
    assert.ok(!viewer() && !event.defaultPrevented, `${id}: nothing opens, the click left to the page`);
  }
  assert.ok(!click(doc.querySelector('#block img'), {ctrlKey: true}).defaultPrevented && !viewer(), 'a click with a modifier is the browser\'s');
  printing = true;
  click(doc.querySelector('#block img'));
  assert.ok(!viewer(), 'nothing opens in print');
  printing = false;
  root.setAttribute('data-ge-editing', '');
  click(doc.querySelector('#block img'));
  doc.querySelector('#block img').dispatchEvent(new w.Event('pointerover', {bubbles: true}));
  assert.ok(!viewer() && !root.classList.contains('doc-zoom-hover'), 'the page edited: a click is the editor\'s (it selects the block), no zoom-in cursor');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(offered(), [], 'and no picture is a tab stop: the marks are off');
  assert.ok(!key(doc.querySelector('#block img'), 'Enter').defaultPrevented && !viewer(), 'Enter opens nothing');
  root.setAttribute('lang', 'en');
  root.removeAttribute('data-ge-editing');
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual([offered().length, doc.querySelector('#block img').getAttribute('aria-label'), doc.querySelector('#cell').getAttribute('aria-label')], [7, 'View larger: 架构图', 'View the image larger'], 'read again: the marks back, in the page\'s language');
  root.removeAttribute('lang');
  root.setAttribute('data-ge-editing', '');
  root.removeAttribute('data-ge-editing');
  await new Promise((resolve) => setTimeout(resolve, 0));

  // The zoom-in cursor, on a picture that opens alone.
  doc.querySelector('#block img').dispatchEvent(new w.Event('pointerover', {bubbles: true}));
  assert.ok(root.classList.contains('doc-zoom-hover'), 'the pointer on a picture that opens: its cursor');
  doc.querySelector('#block img').dispatchEvent(new w.Event('pointerout', {bubbles: true}));
  small.dispatchEvent(new w.Event('pointerover', {bubbles: true}));
  assert.ok(!root.classList.contains('doc-zoom-hover'), 'off it, and on a small one: none');
  assert.equal(doc.querySelector('main').innerHTML, before, 'nothing written on the page but the marks, as they were');
  assert.ok(!root.hasAttribute('class'), 'and nothing left on <html>');
  page.dom.window.close();

  // Its styles: the cursor only where the runtime says, the page kept still on screens only, the
  // viewer never printed, no motion where less is asked for.
  assert.match(reportCss, /:root\.doc-zoom-hover \.doc-page img:hover \{ cursor: zoom-in; \}/, 'the zoom-in cursor follows the runtime\'s mark');
  // The kit's one focus ring (styles/base.css) lists a picture that opens among its controls.
  assert.match(reportCss, /:where\([^{]*img\[data-doc-zoom\][^{]*\):focus-visible \{\s*outline: 2px solid var\(--doc-accent\);\s*outline-offset: 2px;/, 'the kit\'s focus ring on a picture the keyboard reached');
  assert.match(reportCss, /@media screen \{\s*:root\.doc-zoom-open \{ overflow: hidden; \}/, 'the page kept from scrolling on a screen only');
  assert.match(reportCss, /@media print \{\s*\.doc-zoom \{ display: none !important; \}/, 'never printed');
  assert.match(reportCss, /@media \(prefers-reduced-motion: reduce\) \{\s*\.doc-zoom\[open\], \.doc-zoom-picture \{ animation: none; \}/, 'no motion with reduced motion');
}
// An instance of no package: marked for the kit's look, its controls inert, with a note in the
// preview, none in an export, and all of that off a copy of the view. One whose package the page was
// told of is none, and neither is one in another instance.
{
  const body = `<main class="doc-page">
    <div data-doc-component="local/gone"><h3>题</h3><div data-doc-component="local/inner"></div><input class="field"><button class="own" inert>关</button></div>
    <section data-doc-component="local/told"></section>
    <section data-doc-component="local/broken"></section>
    <p data-doc-component="local/gone">不是实例</p>
  </main>`;
  let page = environment(body);
  page.w.DocKit.describe({ id: 'local/told', match: '[data-doc-component="local/told"]', parts: {} });
  page.w.DocKit.describe({ id: 'local/broken', problem: { zh: '清单坏了', en: 'its manifest is broken' } });
  await started(page);
  page.w.document.dispatchEvent(new page.w.Event('DOMContentLoaded'));
  const { document } = page.w;
  const gone = document.querySelector('div[data-doc-component="local/gone"]');
  assert.ok(gone.hasAttribute('data-doc-fallback'), 'it is marked');
  const broken = document.querySelector('[data-doc-component="local/broken"]');
  assert.equal(document.querySelectorAll('[data-doc-fallback]').length, 2, 'and one whose package does not load, and no other');
  assert.ok(broken.hasAttribute('data-doc-fallback') && broken.querySelector('.doc-component-note').textContent.includes('清单坏了'), 'its note says why, in the page\'s language');
  assert.ok(!gone.querySelector(':scope > .doc-component-note').textContent.includes('清单坏了'));
  assert.ok(gone.querySelector('.field').hasAttribute('inert') && gone.querySelector('.field').hasAttribute('data-doc-fallback-control'), 'its fields take nothing');
  assert.ok(!gone.querySelector('.own').hasAttribute('data-doc-fallback-control'), 'one its writer turned off is left as it is');
  const note = gone.querySelector(':scope > .doc-component-note');
  assert.ok(note.hasAttribute('data-doc-dev') && note.textContent.includes('local/gone'), 'the preview says why, its own and no export\'s');
  const copy = gone.cloneNode(true);
  document.querySelector('main').append(copy);
  await new Promise((resolve) => page.w.setTimeout(resolve, 0));
  assert.equal(copy.querySelectorAll('.doc-component-note').length, 1, 'one added later is not said twice');
  assert.equal(page.w.DocKit.description('local/told').match, '[data-doc-component="local/told"]', 'what was told of a package can be read back');
  assert.equal(page.w.DocKit.description('local/none'), null, 'and of none, nothing');
  // A script on its way to a page that has loaded, the editor's: nothing is said of it until it has
  // had its turn, and then what it started, or that it started nothing.
  page.w.DocKit.describe({ id: 'local/late', match: '[data-doc-component="local/late"]', parts: {}, script: true });
  const said = [];
  const { error: tellConsole } = page.w.console;
  page.w.console.error = (...args) => said.push(args.map((arg) => String(arg?.message ?? arg)).join(' '));
  const arriving = document.createElement('script');
  arriving.setAttribute('data-ge-arriving', 'local/late');
  document.head.append(arriving);
  const late = document.createElement('div');
  late.setAttribute('data-doc-component', 'local/late');
  document.querySelector('main').append(late);
  await new Promise((resolve) => page.w.setTimeout(resolve, 0));
  assert.ok(!late.hasAttribute('data-doc-fallback'), 'its instance waits for it');
  arriving.removeAttribute('data-ge-arriving');
  page.w.DocKit.mount(late);
  assert.ok(late.hasAttribute('data-doc-fallback') && said.some((line) => /local\/late.*started no component/.test(line)), 'come and started nothing, it shows as it stands');
  page.w.console.error = tellConsole;
  document.documentElement.setAttribute('data-ge-language', 'en');
  const told = document.createElement('div');
  told.setAttribute('data-doc-component', 'local/broken');
  document.querySelector('main').append(told);
  await new Promise((resolve) => page.w.setTimeout(resolve, 0));
  assert.match(told.querySelector('.doc-component-note').textContent, /did not load.*its manifest is broken/, 'in English where the page speaks it');
  document.documentElement.removeAttribute('data-ge-language');
  const added = document.createElement('div');
  added.setAttribute('data-doc-component', 'local/new');
  document.querySelector('main').append(added);
  await new Promise((resolve) => page.w.setTimeout(resolve, 0));
  assert.ok(added.hasAttribute('data-doc-fallback') && added.querySelector('.doc-component-note'), 'one added later is marked');
  // Its package comes after it, one of no script: what it holds is all there is to it, and no fallback.
  const arrived = document.createElement('div');
  arrived.setAttribute('data-doc-component', 'local/arrived');
  arrived.innerHTML = '<input class="later">';
  document.querySelector('main').append(arrived);
  await new Promise((resolve) => page.w.setTimeout(resolve, 0));
  assert.ok(arrived.hasAttribute('data-doc-fallback') && arrived.querySelector('.later').hasAttribute('inert'), 'of no package yet');
  page.w.DocKit.describe({ id: 'local/arrived', match: '[data-doc-component="local/arrived"]', parts: {} });
  page.w.DocKit.mount(arrived);
  assert.ok(!arrived.hasAttribute('data-doc-fallback') && !arrived.querySelector('.doc-component-note') && !arrived.querySelector('.later').hasAttribute('inert'), 'its package come, it stands as its own');
  const view = page.w.DocKit.dehydrate(document.documentElement.cloneNode(true));
  assert.equal(view.querySelectorAll('[data-doc-fallback], [data-doc-fallback-control], .doc-component-note').length, 0, 'none of it stays in a copy of the view');
  assert.ok(!view.querySelector('.field').hasAttribute('inert') && view.querySelector('.own').hasAttribute('inert'), 'the fields as they were written');
  page.dom.window.close();
  page = environment(body, '<meta name="doc-export-id" content="edition-one">');
  await started(page);
  page.w.document.dispatchEvent(new page.w.Event('DOMContentLoaded'));
  assert.ok(page.w.document.querySelector('[data-doc-fallback]') && !page.w.document.querySelector('.doc-component-note'), 'an export takes the look and no note');
  page.dom.window.close();
}
// What a script of data in such an instance holds, drawn read-only by the kit (runtime/shown-data.js),
// right after its script: an array of objects a table, an object its keys beside their values, any
// other array a list, in a cell or beside its key a line of values where it holds values alone, a
// value itself, an empty script as empty; what is deeper or longer than the bounds, past the values
// one drawing holds, and what is no JSON, said, that last to who writes the page alone. Markup in its
// keys and values is words. One drawing for each script, none for a script of code or one in another
// instance, taken off by a mount and by a copy of the view, the same in an export with no note, and
// for an instance whose component threw.
{
  const rows = Array.from({ length: 23 }, (_, index) => ({ name: `第${index + 1}项`, done: index % 2 === 0, ...(index === 0 ? { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 } : {}) }));
  const data = { title: '评分', scale: 5, open: false, none: null, tags: ['甲', '乙'], mixed: [1, 'two', { three: 3 }, [4, 5]], deep: { a: { b: { c: 1 } } }, rows, empty: [], long: '长'.repeat(250) };
  const many = Object.fromEntries(Array.from({ length: 25 }, (_, index) => [`k${index}`, index]));
  const markup = { '<img src=x onerror="window.hit=1">': '<b>粗</b>', list: ['<i>斜</i>', { "<a href='javascript:window.hit=2'>": '<td>格</td>' }], rows: [{ '<th>头</th>': '<iframe src="javascript:window.hit=3"></iframe>' }] };
  // Each of twenty rows of eight cells a table of ten rows of four, each cell a list: thousands of values.
  const inner = Array.from({ length: 10 }, (_, row) => Object.fromEntries(Array.from({ length: 4 }, (_, column) => [`c${column}`, [row, column, row * column]])));
  const wide = Array.from({ length: 20 }, () => Object.fromEntries(Array.from({ length: 8 }, (_, column) => [`列${column}`, inner])));
  const cells = [{ 名: '第 1 行', 说明: '长'.repeat(40) }];
  const body = `<main class="doc-page">
    <div data-doc-component="local/lost" data-block-id="lost"><h3>题</h3><script type="application/json">${JSON.stringify(data)}</script><div data-doc-component="local/inner"><script type="application/json">{"x":1}</script></div></div>
    <div data-doc-component="local/list" data-block-id="list"><script type="application/json">[1, "二", true]</script><script type="application/json">${JSON.stringify(many)}</script></div>
    <div data-doc-component="local/bad" data-block-id="bad"><script type="application/json">{nope</script><script>window.ran = 1</script></div>
    <section data-doc-component="local/one" data-block-id="one"><script type="application/ld+json">42</script></section>
    <div data-doc-component="local/thrown" data-block-id="thrown"><h3>题</h3><script type="application/json">{"n":3}</script></div>
    <div data-doc-component="local/markup" data-block-id="markup"><script type="application/json">${JSON.stringify(markup)}</script></div>
    <div data-doc-component="local/wide" data-block-id="wide"><script type="application/json">${JSON.stringify(wide)}</script></div>
    <div data-doc-component="local/said" data-block-id="said"><script type="application/json">"只是一句话"</script><script type="application/json">
    </script></div>
    <div data-doc-component="local/cells" data-block-id="cells"><script type="application/json">${JSON.stringify(cells)}</script></div>
  </main>`;
  let page = environment(body);
  const { DocKit, document } = page.w;
  DocKit.describe({ id: 'local/thrown', match: '[data-doc-component="local/thrown"]', parts: { title: { at: ':scope > h3', edit: 'text' }, data: { at: ':scope > script', edit: 'data' } }, script: true });
  const { error: tellConsole } = page.w.console;
  page.w.console.error = () => {};
  DocKit.component({ id: 'local/thrown', mount() { throw new Error('mount broke'); } });
  await started(page);
  document.dispatchEvent(new page.w.Event('DOMContentLoaded'));
  const host = (id) => document.querySelector(`[data-block-id="${id}"]`);
  const shown = (id) => [...host(id).querySelectorAll('.doc-component-data')].filter((node) => node.parentElement.closest('[data-doc-component]') === host(id));
  // What a node says, a space between the words of each element.
  const words = (node) => {
    const walker = node.ownerDocument.createTreeWalker(node, 4);
    const said = [];
    while (walker.nextNode()) said.push(walker.currentNode.data.trim());
    return said.filter(Boolean).join(' ');
  };
  const [drawing] = shown('lost');
  assert.equal(shown('lost').length, 1, 'one drawing for its script, none for the script of the instance in it');
  assert.ok(drawing.matches('script + dl.doc-component-data'), 'an object: keys beside their values, right after its script');
  assert.equal(host('lost').querySelector('[data-doc-component="local/inner"] .doc-component-data'), null);
  const value = (key) => [...drawing.children].find((node) => node.localName === 'dt' && node.textContent === key).nextElementSibling;
  assert.deepEqual([...drawing.querySelectorAll(':scope > dt')].map((node) => node.textContent), Object.keys(data), 'each key, in its order');
  assert.deepEqual([value('title').textContent, value('scale').textContent, value('open').textContent, value('none').textContent, value('empty').textContent], ['评分', '5', '否', '—', '（空）'], 'a value as words: false as one, null as a dash, empty as said');
  assert.deepEqual([...value('tags').querySelectorAll('li')].map(words), ['甲', '乙'], 'an array of values a list');
  assert.ok(value('tags').querySelector(':scope > ul').matches('.doc-component-line'), 'beside its key a line of its values');
  const mixed = value('mixed').querySelector(':scope > ul');
  assert.ok(!mixed.matches('.doc-component-line') && mixed.querySelector(':scope > li > dl') && mixed.querySelector(':scope > li > ul.doc-component-line'), 'one holding more than values a list of lines, a list in it a line');
  assert.deepEqual([...mixed.children].map(words), ['1', 'two', 'three 3', '4 5']);
  assert.equal(words(value('deep')), 'a b （1 项，没有展开）', 'what is three levels down said by how many it holds');
  assert.equal(value('long').textContent, `${'长'.repeat(200)}…`, 'a long text cut, and said');
  const table = value('rows').querySelector(':scope > table');
  assert.deepEqual([...table.tHead.rows[0].cells].map((cell) => cell.textContent), ['name', 'done', 'a', 'b', 'c', 'd', 'e', 'f'], 'an array of objects a table, its keys its columns, eight of them');
  assert.equal(table.tBodies[0].rows.length, 20, 'twenty rows');
  assert.deepEqual([...table.tBodies[0].rows[1].cells].map((cell) => cell.textContent), ['第2项', '否', '', '', '', '', '', ''], 'a key a row has not an empty cell');
  assert.equal(table.tBodies[0].rows[0].cells[1].textContent, '是');
  assert.equal(words(table.tFoot), '还有 3 行没有显示 还有 1 列没有显示', 'the rows and the columns left out, said');
  const [listed, keyed] = shown('list');
  assert.deepEqual([...listed.children].map(words), ['1', '二', '是'], 'an array of values at the top a list, each script its own');
  assert.ok(keyed.matches('dl') && keyed.querySelectorAll(':scope > dt').length === 20 && words(keyed.lastElementChild) === '还有 5 项没有显示', 'twenty keys and what is left, said');
  assert.equal(shown('bad').length, 1, 'a script of code is drawn as nothing');
  assert.equal(words(shown('bad')[0]), '这段数据不是 JSON：{nope', 'what is no JSON said as that, as it is written');
  assert.ok(shown('one')[0].matches('ul.doc-component-one') && words(shown('one')[0]) === '42', 'a value alone a list of one, unmarked, of any JSON type');
  assert.deepEqual(shown('said').map((node) => [node.matches('ul.doc-component-one'), words(node)]), [[true, '只是一句话'], [true, '（空）']], 'words alone the same, and a script of nothing empty');
  const marked = shown('markup')[0];
  const drawingTags = new Set(['dl', 'dt', 'dd', 'ul', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td']);
  assert.deepEqual([...new Set([...marked.querySelectorAll('*')].map((node) => node.localName))].filter((tag) => !drawingTags.has(tag)), [], 'markup in its keys and values is words: no tag but the drawing\'s own');
  assert.ok(words(marked).startsWith('<img src=x onerror="window.hit=1"> <b>粗</b> list <i>斜</i> <a href=\'javascript:window.hit=2\'> <td>格</td>') && words(marked).endsWith('<th>头</th> <iframe src="javascript:window.hit=3"></iframe>'), words(marked));
  assert.equal(page.w.hit, undefined, 'and nothing of it ran');
  const wideDrawing = shown('wide')[0];
  assert.ok(wideDrawing.querySelectorAll('*').length < 1500, `the values one drawing holds are bounded, whatever each level holds: ${wideDrawing.querySelectorAll('*').length} elements`);
  assert.match(words(wideDrawing.tFoot), /^还有 \d+ 行没有显示$/, 'and what is left out said');
  const cellsDrawn = shown('cells')[0].tBodies[0].rows[0].cells;
  assert.deepEqual([...cellsDrawn].map((cell) => cell.classList.contains('doc-component-short')), [true, false], 'a cell of a few words keeps them on one line, a long one wraps');
  assert.ok(host('thrown').hasAttribute('data-doc-fallback') && words(shown('thrown')[0]) === 'n 3', 'one whose component threw shows what its data holds');
  assert.ok(!document.querySelector('.doc-component-data :is(input, button, [contenteditable])'), 'nothing in it to change');

  // Drawn once: a scan again keeps the drawing, a node an undo puts back gets one of its own, a script
  // changed meanwhile one anew.
  DocKit.mount();
  assert.equal(shown('lost')[0], drawing, 'shown again, the same drawing');
  const put = host('lost').cloneNode(true);
  host('lost').replaceWith(put);
  await new Promise((resolve) => page.w.setTimeout(resolve, 0));
  assert.equal(shown('lost').length, 1, 'a copy put back, drawing and all: one drawing');
  put.querySelector('script').textContent = '{"title":"新"}';
  DocKit.mount(put);
  assert.equal(words(shown('lost')[0]), 'title 新', 'a script that says something else, drawn anew');

  // Off a copy of the view, and off an instance whose package comes.
  const view = DocKit.dehydrate(document.documentElement.cloneNode(true));
  assert.equal(view.querySelectorAll('.doc-component-data').length, 0, 'none of it in a copy of the view');
  assert.equal(view.querySelector('[data-block-id="lost"] script').textContent, '{"title":"新"}', 'its script as it was');
  DocKit.describe({ id: 'local/list', match: '[data-doc-component="local/list"]', parts: {} });
  DocKit.mount(host('list'));
  assert.equal(shown('list').length, 0, 'its package come, what it holds is its own');
  document.documentElement.setAttribute('data-ge-language', 'en');
  const english = document.createElement('div');
  english.setAttribute('data-doc-component', 'local/english');
  english.innerHTML = '<script type="application/json">{"done":true,"items":[]}</script>';
  document.querySelector('main').append(english);
  await new Promise((resolve) => page.w.setTimeout(resolve, 0));
  assert.equal(words(english.querySelector('.doc-component-data')), 'done Yes items (empty)', 'in the page\'s language');
  page.w.console.error = tellConsole;
  page.dom.window.close();
  page = environment(body, '<meta name="doc-export-id" content="edition-one">');
  await started(page);
  page.w.document.dispatchEvent(new page.w.Event('DOMContentLoaded'));
  const exported = page.w.document.querySelector('[data-block-id="lost"]');
  assert.ok(exported.querySelector(':scope > script + dl.doc-component-data') && !exported.querySelector('.doc-component-note'), 'an export draws it, with no note');
  assert.equal(words(page.w.document.querySelector('[data-block-id="bad"] .doc-component-data')), '{nope', 'what is no JSON as it is written, the words on it being for who writes the page');
  page.dom.window.close();
}

// A list item with no text of its own over the blocks it holds keeps a line of its own, its marker
// on it and the blocks under it, as the page editor shows it: a line break the kit puts ahead of them
// (br.doc-item-line), as the page renders and in an item added later, by the rule the page editor
// gives it its line by (keepsLine, src/shared/components/list.mjs). An empty bold or link before the
// blocks is no text. None where the item has words, has a line break of its own, holds words after
// its blocks, is a flowchart's step, is an item of a list with a class of its own or of one in a whole
// block of the document's (a widget's timeline, laid out by a grid of its children), a card or a table's
// cell, an instance's or text the editor edits. An export of the current view takes it off, the file's
// markup again.
{
  const body = `<main class="doc-page">
    <ul>
      <li><p>段落</p></li>
      <li><strong></strong><p>空粗体</p></li>
      <li><a href="https://example.com"></a><p>空链接</p></li>
      <li>有字<p>段落</p></li>
      <li>
        <div class="board"><h3>板</h3></div>
      </li>
      <li><ul><li>子项</li></ul></li>
      <li><br><p>自己的换行</p></li>
      <li><p>段落</p>后面有字</li>
      <li contenteditable="true"><p>编辑中</p></li>
    </ul>
    <ul class="doc-todo"><li data-checked><p>待办</p></li></ul>
    <ol class="doc-flow"><li><p><strong>节点</strong></p><ul><li><hr></li></ul></li></ol>
    <section class="doc-section"><h2>节</h2><div><ul><li><p>组内</p></li></ul></div></section>
    <table><tbody><tr><td><ul><li><p>格</p></li></ul></td></tr></tbody></table>
    <div class="board" data-doc-component="local/board"><ul><li><p>实例</p></li></ul></div>
    <div class="my-widget"><ol class="timeline"><li><div class="time">2026-01</div><div class="what">立项</div></li></ol></div>
    <div class="my-widget"><ul><li><p>件内</p></li></ul></div>
    <ul class="steps"><li><p>类列表</p></li></ul>
    <div><ul><li><p>页里的块</p></li></ul></div>
    <figure class="doc-figure"><ul><li><p>图里</p></li></ul></figure>
  </main>`;
  const page = environment(body);
  await started(page);
  const { DocKit, document } = page.w;
  const settled = () => new Promise((resolve) => page.w.setTimeout(resolve, 0));
  const lined = () => [...document.querySelectorAll('main li')].filter((item) => item.querySelector(':scope > br.doc-item-line')).map((item) => item.textContent.trim().replace(/\s+/g, ' ') || item.querySelector(':scope > br.doc-item-line').nextElementSibling.localName);
  assert.deepEqual(lined(), ['段落', '空粗体', '空链接', '板', '子项', '待办', 'hr', '组内'], 'an item over a paragraph (an empty bold or link before it), a whole block, a list, a to-do\'s, a node\'s list item over a divider and an item of a list a plain div groups in a section keep their lines; none other');
  const shape = (item) => [...item.childNodes].map((node) => (node.nodeType === 3 ? (node.data.trim() ? 'text' : ' ') : node.localName)).join(',');
  assert.equal(shape(document.querySelector('main > ul > li')), 'br,p', 'the line break ahead of the blocks');
  assert.equal(shape(document.querySelectorAll('main > ul > li')[4]), ' ,br,div, ', 'after the white space before them');
  assert.equal(shape(document.querySelector('.timeline > li')), 'div,div', 'a widget\'s item as written: its grid\'s first cell its first child');
  const added = document.createElement('li');
  added.innerHTML = '<figure class="doc-image"><img src="a.png" alt=""></figure>';
  document.querySelector('main > ul').append(added);
  await settled();
  assert.equal(shape(added), 'br,figure', 'an item added later keeps its line');
  const copy = DocKit.dehydrate(document.documentElement.cloneNode(true));
  assert.equal(copy.querySelectorAll('br.doc-item-line').length, 0, 'an export of the current view takes the lines off');
  assert.equal(copy.querySelector('main > ul > li').outerHTML, '<li><p>段落</p></li>', 'the item as the file writes it');
  page.dom.window.close();
}

// An instance of a component package: what stands in it is its component's. The kit's other
// components start nothing there and its spacing passes it by, and a package's component hears of the
// parts its description edits as text or data, whatever else it owns.
{
  const body = `<main class="doc-page">
    <p>外面 3–5 和<code>x</code>词</p>
    <div class="board" data-doc-component="local/board">
      <h3>标题</h3>
      <p>里面 3–5 和<code>x</code>词</p>
      <select data-doc-bind="kind"><option>甲</option></select>
      <div class="drawn"></div>
      <table><tbody><tr><td>一</td></tr></tbody></table>
    </div>
    <select data-doc-bind="other"><option>甲</option></select>
  </main>`;
  const page = environment(body);
  await started(page);
  const { DocKit, document } = page.w;
  const live = () => DocKit.stats().live;
  assert.equal(live().bind, 1, 'a control in an instance is the component\'s, the one beside it the kit\'s');
  const inside = document.querySelector('.board > p');
  assert.equal(inside.textContent, '里面 3–5 和x词', 'no space set in it');
  assert.equal(inside.querySelector('.doc-range'), null, 'no range held');
  assert.equal(document.querySelector('main > p').textContent, '外面 3–5 和 x 词', 'as there are outside it');
  assert.ok(document.querySelector('main > p .doc-range'));

  const heard = [];
  DocKit.describe({ id: 'local/board', match: '[data-doc-component="local/board"]', parts: {
    title: { at: ':scope > h3', edit: 'text' }, rows: { at: ':scope > table', edit: 'data' }, drawn: { at: ':scope > .drawn', edit: 'none' },
  } });
  DocKit.component({ id: 'local/board', on: ['source'], owns: true, mount: () => ({ update: (reason, records) => heard.push([reason, records.length]) }) });
  assert.equal(live()['local/board'], 1, 'the describe gives a package\'s component its instances');
  // What the page heard, and the next frame, in which `source` is told.
  const settled = () => new Promise((resolve) => page.w.setTimeout(() => { page.flush(); resolve(); }, 0));
  const title = document.querySelector('.board > h3');
  title.firstChild.data = '新标题';
  await settled();
  assert.deepEqual(heard, [['source', 1]], 'a change in a text part is its source, though it owns all it draws in');
  document.querySelector('.board td').textContent = '二';
  await settled();
  assert.deepEqual(heard.at(-1), ['source', 1], 'and one in a data part');
  heard.length = 0;
  document.querySelector('.board > .drawn').textContent = '画的';
  document.querySelector('.board > p').append('词');
  document.querySelector('main > p').append('词');
  await settled();
  assert.deepEqual(heard, [], 'what it draws, what its manifest does not say and what stands outside it are no source');
  DocKit.quietly(() => { title.firstChild.data = '新标题'; });
  await settled();
  assert.deepEqual(heard, [], 'a change made quietly changes no word');

  // An instance added later is no other component's either, and its own starts.
  const copy = document.querySelector('.board').cloneNode(true);
  document.querySelector('main').append(copy);
  await settled();
  assert.equal(live()['local/board'], 2);
  assert.equal(live().bind, 1);
  copy.remove();
  await settled();
  assert.equal(live()['local/board'], 1);

  // A selector of a package's own may find what stands in its instances, as another's may not, nor an instance itself.
  DocKit.component({ id: 'local/rows', selector: '.board td', mount: () => ({}) });
  assert.equal(live()['local/rows'], undefined);
  DocKit.component({ id: 'local/whole', selector: '.board', mount: () => ({}) });
  assert.equal(live()['local/whole'], undefined, 'a selector of another finding the instance starts nothing on it');
  page.dom.window.close();
}
// A package's component: what it is given, a mount that holds whatever the node held, state by
// instance, and a component that throws, which fails its own instance alone.
{
  const instance = (id, marks = '') => `<div class="tally" data-doc-component="local/tally"${id ? ` data-block-id="${id}"` : ''}${marks}><h3>题 ${id}</h3><table><tbody><tr><td>一</td></tr></tbody></table><input class="filter"></div>`;
  const body = `<main class="doc-page">${instance('one')}${instance('two')}${instance('', ' data-unnamed')}${instance('bad', ' data-bad-mount')}${instance('late', ' data-bad-update')}${instance('frame', ' data-bad-frame')}${instance('wrong', ' data-bad-part')}<p id="after">后面</p></main>`;
  const page = environment(body);
  const { DocKit, document } = page.w;
  const root = '[data-doc-component="local/tally"]';
  DocKit.describe({
    id: 'local/tally',
    match: `div${root}, section${root}`,
    parts: { title: { at: ':scope > h3', edit: 'text' }, rows: { at: ':scope > table', edit: 'none' }, later: { at: ':scope > .later', edit: 'none', optional: true } },
    runtime: { generated: [`${root} .tally-bars`], attrs: { [`${root} > table`]: ['hidden'] } },
  });
  const contexts = new Map();
  const updates = [];
  const pressed = [];
  let edited = 0;
  const errors = [];
  const logged = page.w.console.error;
  page.w.console.error = (...said) => errors.push(said.map(String).join(' '));
  DocKit.component({
    id: 'local/tally',
    on: ['source'],
    mount(host, context) {
      contexts.set(host, context);
      if (host.hasAttribute('data-bad-part')) context.part('nothing');
      context.part('rows').setAttribute('hidden', '');
      const state = context.state({ version: 1, defaults: { filter: '' } });
      const bars = document.createElement('div');
      bars.className = 'tally-bars';
      bars.textContent = `${context.part('title').textContent}: ${state.get('filter')}`;
      host.append(bars);
      if (host.hasAttribute('data-bad-mount')) throw new Error('mount broke');
      if (host.hasAttribute('data-bad-frame')) context.frame(() => { throw new Error('frame broke'); });
      host.addEventListener('click', () => pressed.push(host), { signal: context.signal });
      return {
        update() {
          if (host.hasAttribute('data-bad-update')) throw new Error('update broke');
          updates.push(host);
        },
        destroy() {
          if (host.hasAttribute('data-bad-update')) throw new Error('and so did its end');
        },
      };
    },
    dehydrate(host) {
      if (host.hasAttribute('data-bad-dehydrate')) throw new Error('dehydrate broke');
    },
  });
  await started(page);
  const hostOf = (id) => document.querySelector(`[data-block-id="${id}"]`);
  const [one, two, unnamed, bad, late, frame, wrong] = document.querySelectorAll(root);
  const settled = () => new Promise((resolve) => page.w.setTimeout(() => { page.flush(); resolve(); }, 0));
  const shown = (host) => ({ fallback: host.hasAttribute('data-doc-fallback'), bars: host.querySelectorAll('.tally-bars').length, hidden: host.querySelector('table').hasAttribute('hidden'), inert: host.querySelector('.filter').hasAttribute('inert') });
  assert.deepEqual(shown(one), { fallback: false, bars: 1, hidden: true, inert: false }, 'an instance as its component drew it');

  // What it is given.
  const context = contexts.get(one);
  assert.equal(context.part('title'), one.querySelector('h3'), 'a part read from the manifest');
  assert.equal(context.part('later'), null, 'an optional part the instance does not hold');
  assert.equal(context.canEdit(), false, 'nothing writes yet');
  assert.equal(typeof context.edit, 'function');
  assert.equal(context.edit('rows', () => { edited += 1; }), false, 'and an edit does nothing, its change never run');
  assert.equal(edited, 0);

  // Each instance's state its own, by block id, else by its place among them; one object at every call.
  const state = context.state({ version: 1, defaults: { filter: '' } });
  assert.equal(state, context.state({ version: 1, defaults: { filter: 'x' } }), 'the same state at a second call');
  assert.equal(state.id, 'local/tally:one');
  assert.match(contexts.get(unnamed).state({ version: 1, defaults: { filter: '' } }).id, /^local\/tally:[0-9a-z]+:0$/, 'one of no block id goes by a hash of its markup and its place among those of that hash');
  state.set('filter', 'mine');
  assert.equal(contexts.get(two).state({ version: 1, defaults: { filter: '' } }).get('filter'), '', 'two instances share nothing');
  assert.throws(() => context.state({ version: 2, defaults: { filter: '' } }), /another version/, 'another version is an error');

  // The instance is kept whatever mount returns, and owns its inside: what it draws is no change of the page.
  assert.equal(DocKit.stats().live['local/tally'], 3 + 1, 'those that did not throw');
  const failedBefore = DocKit.stats().failed;

  // A mount on a node an undo put back with what the last mount drew; on one dehydrated; the same DOM each time.
  const drawn = one.outerHTML;
  one.remove();
  await settled();
  document.querySelector('main').prepend(one);
  await settled();
  assert.equal(one.outerHTML, drawn.replace(': <', ': mine<').replace('题 one: ', '题 one: '), 'put back, it draws again over what it held, no second drawing');
  const again = one.outerHTML;
  const put = one.cloneNode(true);
  one.replaceWith(put);
  await settled();
  assert.equal(put.outerHTML, again, 'a copy of the node, drawing and all, the same');
  put.click();
  assert.deepEqual(pressed, [put], 'its listeners on the signal hold');
  const copy = document.documentElement.cloneNode(true);
  DocKit.dehydrate(copy);
  const clean = copy.querySelector('[data-block-id="one"]');
  assert.ok(!clean.querySelector('.tally-bars') && !clean.querySelector('table').hasAttribute('hidden'), 'dehydrate takes off what its runtime names');
  const mountedAgain = clean.cloneNode(true);
  put.replaceWith(mountedAgain);
  await settled();
  assert.equal(mountedAgain.outerHTML, again, 'mount, dehydrate, mount: the same DOM');

  // A throw in mount: told, shown as it stands, its drawing off, its neighbours going on.
  assert.deepEqual(shown(bad), { fallback: true, bars: 0, hidden: false, inert: true }, 'a mount that threw: read-only, what it drew gone');
  assert.ok(bad.nextElementSibling.matches('.doc-kit-error[data-doc-dev]'), 'told next to it in a preview');
  assert.deepEqual(shown(wrong), { fallback: true, bars: 0, hidden: false, inert: true }, 'a part the manifest does not have is a failure of that instance');
  assert.ok(errors.some((said) => said.includes('mount broke')) && errors.some((said) => said.includes('no part "nothing"')), 'and on the console');
  DocKit.mount();
  assert.deepEqual(shown(bad), { fallback: true, bars: 0, hidden: false, inert: true }, 'no scan starts it again');
  assert.deepEqual(shown(frame), { fallback: true, bars: 0, hidden: false, inert: true }, 'a drawing that threw in its frame is the same');

  // A throw in update, and what follows it.
  const lateContext = contexts.get(late);
  late.querySelector('h3').firstChild.data = '新题';
  two.querySelector('h3').firstChild.data = '新题';
  await settled();
  assert.deepEqual(shown(late), { fallback: true, bars: 0, hidden: false, inert: true }, 'an update that threw');
  assert.ok(lateContext.signal.aborted, 'its listeners gone');
  assert.deepEqual(updates, [two], 'its neighbour hears what it hears');
  assert.equal(shown(two).fallback, false);
  late.querySelector('h3').firstChild.data = '又一题';
  await settled();
  assert.deepEqual(updates, [two], 'nothing heard after it failed');

  // A copy of the view with a dehydrate that throws: made all the same, that host's runtime off too.
  mountedAgain.setAttribute('data-bad-dehydrate', '');
  const failedThen = DocKit.stats().failed;
  const clone = document.documentElement.cloneNode(true);
  DocKit.dehydrate(clone);
  assert.equal(DocKit.stats().failed, failedThen + 1, 'told');
  assert.ok(!clone.querySelector('[data-block-id="one"] .tally-bars') && !clone.querySelector('[data-block-id="two"] .tally-bars'), 'its drawing and its neighbours\' are off the copy');
  assert.ok(!clone.querySelector('[data-doc-fallback]'), 'as are the kit\'s marks');
  assert.ok(document.querySelector('[data-block-id="one"] .tally-bars'), 'and the page is as it was');
  assert.ok(failedBefore <= failedThen);

  // Mounting one whose dehydrate throws is told and goes on: it is the drawing that counts, which its runtime took off.
  const thrown = mountedAgain.cloneNode(true);
  mountedAgain.replaceWith(thrown);
  const toldBefore = DocKit.stats().failed;
  await settled();
  assert.deepEqual(shown(thrown), { fallback: false, bars: 1, hidden: true, inert: false }, 'a dehydrate that threw leaves the mount to draw, once');
  assert.equal(DocKit.stats().failed, toldBefore + 1, 'and is told');
  assert.ok(errors.at(-1).includes('dehydrate broke'), 'on the console');

  // A node put back from a failure starts anew: the kit's marks of it are the kit's to take off.
  const healed = bad.cloneNode(true);
  healed.removeAttribute('data-bad-mount');
  bad.replaceWith(healed);
  await settled();
  assert.deepEqual(shown(healed), { fallback: false, bars: 1, hidden: true, inert: false }, 'marked as one failed, it mounts as any');
  assert.ok(document.querySelector('#after'), 'and the page stands');
  page.w.console.error = logged;
  page.dom.window.close();
}

// A package's component writing back: nothing can until whoever edits the page says so, and then
// `editable` goes to who asked for it. An edit is a question put at once: the kit runs the change on the
// draft it is handed and writes nothing, so that no answer is a false, and a change that throws, or
// means to go on later, is told and is no edit. One edit may name several parts, each a draft by its name.
{
  const instance = (id, marks = '') => `<div data-doc-component="local/rows" data-block-id="${id}"${marks}><h3>题</h3><table><tbody><tr><td>一</td></tr></tbody></table><script type="application/json">{"n":0}</script></div>`;
  const page = environment(`<main class="doc-page">${instance('one')}${instance('same', ' data-doc-schema="2"')}${instance('ahead', ' data-doc-schema="3"')}${instance('words', ' data-doc-schema="new"')}${instance('empty', ' data-doc-schema=""')}${instance('failing', ' data-fails')}${instance('slow', ' data-slow')}</main>`);
  const { DocKit, document } = page.w;
  const root = '[data-doc-component="local/rows"]';
  DocKit.describe({
    id: 'local/rows',
    match: `div${root}, section${root}`,
    schema: 2,
    parts: { title: { at: ':scope > h3', edit: 'text' }, rows: { at: ':scope > table', edit: 'data' }, count: { at: ':scope > script', edit: 'data' }, cell: { at: 'td', edit: 'data', optional: true }, later: { at: ':scope > ul', edit: 'data', optional: true } },
  });
  const contexts = new Map();
  const heard = [];
  const errors = [];
  page.w.console.error = (...said) => errors.push(said.map(String).join(' '));
  let finish = null;
  DocKit.component({
    id: 'local/rows',
    on: ['editable', 'source'],
    mount(host, context) {
      contexts.set(host.getAttribute('data-block-id'), context);
      const handle = { update: (reason) => heard.push(`${host.getAttribute('data-block-id')} ${reason}`) };
      if (host.hasAttribute('data-slow')) return new Promise((resolve) => { finish = () => resolve(handle); });
      return handle;
    },
    example(host, context) {
      heard.push(`example ${context === contexts.get(host.getAttribute('data-block-id'))}`);
    },
  });
  await started(page);
  const context = contexts.get('one');
  const tick = () => new Promise((resolve) => page.w.setTimeout(() => { page.flush(); resolve(); }, 0));

  assert.equal(context.canEdit(), false, 'no one edits the page yet');
  let ran = 0;
  assert.equal(context.edit('rows', () => { ran += 1; }), false, 'an edit then is no edit');
  assert.equal(ran, 0, 'its change never run');

  page.w.dispatchEvent(new page.w.Event('doc-editable'));
  assert.deepEqual(heard, ['one editable', 'same editable', 'ahead editable', 'words editable', 'empty editable', 'failing editable'], 'told, those it can tell');
  assert.deepEqual(['one', 'same', 'ahead', 'words', 'empty'].map((id) => contexts.get(id).canEdit()), [true, true, false, false, false], 'an instance past its manifest is read-only, and one no number says is past it, nor one that says nothing');
  finish();
  await tick();
  assert.equal(heard.at(-1), 'slow editable', 'a mount that is a promise is told as its handle comes');
  assert.equal(context.edit('rows', () => { ran += 1; }), false, 'nobody took it');
  assert.equal(ran, 0, 'and its change is not run for nobody');

  // What whoever edits the page is asked.
  const asked = [];
  let answer = true;
  document.addEventListener('doc-component-edit', (event) => {
    const { parts, run } = event.detail;
    asked.push([event.target.getAttribute('data-block-id'), ...parts.map(({ name, part }) => `${name} ${part.localName}`)]);
    const drafts = Object.fromEntries(parts.map(({ name, part }) => [name, part.cloneNode(true)]));
    if (answer && run(drafts)) {
      for (const { name, part } of parts) part.replaceChildren(...drafts[name].childNodes);
      event.preventDefault();
    }
  });
  assert.equal(context.edit('rows', (table) => { table.querySelector('td').textContent = '二'; }), true, 'taken, it says so at once');
  assert.deepEqual(asked, [['one', 'rows table']]);
  assert.equal(context.part('rows').querySelector('td').textContent, '二', 'and it is done when it returns');
  assert.equal(context.edit(['rows', 'count'], ({ rows, count }) => {
    rows.querySelector('td').textContent = '三';
    count.textContent = '{"n":1}';
  }), true, 'several parts in one edit');
  assert.deepEqual(asked.at(-1), ['one', 'rows table', 'count script'], 'asked once, a draft of each by its name');
  assert.deepEqual([context.part('rows').querySelector('td').textContent, context.part('count').textContent], ['三', '{"n":1}']);
  assert.throws(() => context.edit(['rows', 'cell'], () => {}), /"cell" of local.rows is in another/, 'two parts one in the other are no two parts');
  assert.throws(() => context.edit(['rows', 'title'], () => {}), /not edited as data/);
  answer = false;
  assert.equal(context.edit('rows', () => {}), false, 'one not taken is false');
  answer = true;
  const told = errors.length;
  const failed = DocKit.stats().failed;
  assert.equal(context.edit('rows', () => { throw new Error('in the change'); }), false, 'a change that throws is no edit');
  assert.equal(context.edit('rows', async () => {}), false, 'and nor is one that means to go on later');
  assert.equal(errors.length, told + 2, 'each told');
  assert.match(errors.at(-1), /runs at once/);
  assert.equal(DocKit.stats().failed, failed + 2);
  assert.equal(context.canEdit(), true, 'and the instance goes on');
  assert.equal(context.edit('later', () => { ran += 1; }), false, 'an optional part it does not hold');
  assert.throws(() => context.edit('nothing', () => {}), /no part "nothing"/, 'a name the manifest does not have throws, as for context.part');
  assert.throws(() => context.edit('title', () => {}), /not edited as data/, 'and one that is no data part');
  assert.equal(ran, 0);

  // What the check drives, and an instance that ended.
  assert.equal(DocKit.example(document.querySelector('[data-block-id="one"]')), true);
  assert.equal(heard.at(-1), 'example true', 'its example, with its own context');
  assert.equal(DocKit.example(document.body), false, 'no instance, no example');
  contexts.get('failing').fail(new Error('gave up'));
  assert.equal(contexts.get('failing').canEdit(), false, 'one that failed cannot write');
  assert.equal(contexts.get('failing').edit('rows', () => { ran += 1; }), false);
  const leaving = contexts.get('same');
  document.querySelector('[data-block-id="same"]').remove();
  await tick();
  assert.equal(leaving.canEdit(), false, 'nor one that left the page');

  // Mounted once the page edits, it can from the start, with nothing to wait for.
  const added = document.createElement('div');
  added.innerHTML = instance('added');
  document.querySelector('main').append(added.firstElementChild);
  await tick();
  assert.equal(contexts.get('added').canEdit(), true);
  page.dom.window.close();
}

// A package's instance from the edges: a copy of it alone, how a component ends, and what it is held to.
{
  const root = (id) => `[data-doc-component="${id}"]`;
  const told = (DocKit, id, parts = {}, more = {}) => DocKit.describe({ id, match: `div${root(id)}, section${root(id)}`, parts, ...more });
  const loaded = (page) => (page.w.document.readyState === 'complete' ? null : new Promise((resolve) => page.w.addEventListener('load', resolve, { once: true })));
  const hold = (page) => {
    const errors = [];
    page.w.console.error = (...said) => errors.push(said.map(String).join(' '));
    return errors;
  };
  const settled = (page) => new Promise((resolve) => page.w.setTimeout(() => { page.flush(); resolve(); }, 0));

  // A copy of one instance, as the clipboard makes it: the root is a host too, of its drawing and of the kit's marks.
  {
    const page = environment(`<main><div class="a" data-doc-component="local/copied" data-block-id="one"><h3>题</h3><button>按</button><output></output></div><div data-doc-component="local/failing" data-block-id="two"><h3>题</h3><button>按</button></div></main>`);
    const errors = hold(page);
    const { DocKit, document } = page.w;
    told(DocKit, 'local/copied', { title: { at: ':scope > h3', edit: 'text' } }, { runtime: { generated: [`${root('local/copied')} .made`], attrs: { [root('local/copied')]: ['data-refreshed'] } } });
    told(DocKit, 'local/failing');
    DocKit.component({
      id: 'local/copied',
      mount(host) {
        host.setAttribute('data-refreshed', '');
        host.dataset.spelled = 'yes';
        host.querySelector('output').textContent = '画的';
        host.append(Object.assign(document.createElement('span'), { className: 'made', textContent: '生成的' }));
      },
      dehydrate(host) {
        host.querySelector('output').textContent = '';
        delete host.dataset.spelled;
      },
    });
    DocKit.component({ id: 'local/failing', mount() { throw new Error('no'); } });
    await started(page);
    const [drawn, failed] = document.querySelectorAll('[data-doc-component]');
    const copy = DocKit.dehydrate(drawn.cloneNode(true));
    assert.equal(copy.outerHTML, '<div class="a" data-doc-component="local/copied" data-block-id="one"><h3>题</h3><button>按</button><output></output></div>', 'a host as the root of the copy comes out as the file has it');
    assert.equal(copy.textContent, '题按', 'no word of its drawing in what the clipboard compares');
    const whole = document.documentElement.cloneNode(true);
    assert.equal(DocKit.dehydrate(whole).querySelector('[data-block-id="one"]').outerHTML, copy.outerHTML, 'the same as in a copy of the page');
    assert.ok(failed.hasAttribute('data-doc-fallback') && failed.querySelector('button').hasAttribute('inert'), 'a failed one is marked on the page');
    assert.equal(DocKit.dehydrate(failed.cloneNode(true)).outerHTML, '<div data-doc-component="local/failing" data-block-id="two"><h3>题</h3><button>按</button></div>', 'and its copy is not');
    assert.ok(drawn.querySelector('.made') && drawn.hasAttribute('data-refreshed'), 'the page keeps what it has');
    assert.ok(errors.length === 1);
    page.dom.window.close();
  }

  // context.fail as the mount runs: it ends there, whatever the mount does after it.
  {
    const body = ['fail', 'throw-after', 'frame', 'clean'].map((id) => `<div data-doc-component="local/ends" data-block-id="${id}"><h3>题</h3><input></div>`).join('');
    const page = environment(`<main>${body}</main>`);
    const errors = hold(page);
    const { DocKit, document } = page.w;
    told(DocKit, 'local/ends', { title: { at: ':scope > h3', edit: 'text' } }, { runtime: { generated: [`${root('local/ends')} .gen`] } });
    const heard = [];
    const destroyed = [];
    const contexts = new Map();
    let ran = 0;
    const observed = [];
    const { ResizeObserver } = page.w;
    page.w.ResizeObserver = ResizeObserver;
    DocKit.component({
      id: 'local/ends',
      on: ['source', 'resize'],
      mount(host, context) {
        const id = host.dataset.blockId;
        contexts.set(id, context);
        if (id !== 'clean') context.fail(new Error('no data'));
        host.append(Object.assign(document.createElement('span'), { className: 'gen', textContent: '之后' }));
        host.dataset.after = 'yes';
        if (id === 'throw-after') throw new Error('and more');
        if (id === 'frame') context.frame(() => { ran += 1; });
        return { update: (reason) => heard.push([id, reason]), destroy: () => destroyed.push(id) };
      },
      dehydrate(host) { delete host.dataset.after; },
    });
    await started(page);
    const host = (id) => document.querySelector(`[data-block-id="${id}"]`);
    for (const id of ['fail', 'throw-after', 'frame']) {
      assert.ok(host(id).hasAttribute('data-doc-fallback'), `${id}: failed`);
      assert.equal(host(id).querySelectorAll('.gen').length, 0, `${id}: what it drew after it failed is off`);
      assert.equal(host(id).dataset.after, undefined, `${id}: dehydrate ran after that`);
      assert.ok(contexts.get(id).signal.aborted, `${id}: its signal aborted`);
    }
    assert.deepEqual(destroyed, ['fail', 'frame'], 'and what its mount returned is ended');
    assert.equal(ran, 0, 'a frame asked after it failed never runs');
    const stats = DocKit.stats();
    assert.deepEqual([stats.live['local/ends'], stats.mounted], [1, 1], 'it counts as no instance');
    host('fail').querySelector('h3').firstChild.data = '新题';
    host('clean').querySelector('h3').firstChild.data = '新题';
    await settled(page);
    assert.deepEqual(heard, [['clean', 'source']], 'and hears no more');

    // A frame it asks for later, as a timer may, never takes the note off nor draws.
    const note = host('fail').nextElementSibling;
    assert.ok(note.matches('.doc-kit-error'));
    contexts.get('fail').frame(() => { ran += 1; host('fail').append('画'); });
    page.flush();
    assert.equal(ran, 0, 'nothing runs for it');
    assert.ok(note.isConnected, 'its note stays');
    assert.ok(errors.some((said) => said.includes('no data')));

    // A frame asked before it failed goes with it.
    contexts.get('clean').frame(() => { ran += 1; });
    page.w.console.error = () => {};
    contexts.get('clean').fail(new Error('later'));
    page.flush();
    assert.equal(ran, 0, 'what a failure finds queued is dropped');
    page.dom.window.close();
  }

  // What a failure takes off, what a mount that returns nothing keeps, what leaves the page after a failure.
  {
    const body = ['ends', 'silent', 'owned', 'free'].map((id) => `<div data-doc-component="local/edges" data-block-id="${id}"><h3>题</h3></div>`).join('');
    const page = environment(`<main>${body}</main>`);
    hold(page);
    const { DocKit, document } = page.w;
    told(DocKit, 'local/edges', { title: { at: ':scope > h3', edit: 'text' } });
    told(DocKit, 'local/free', { title: { at: ':scope > h3', edit: 'text' } });
    const pressed = [];
    const ended = [];
    const contexts = new Map();
    const contents = [];
    DocKit.component({
      id: 'local/edges',
      on: ['source', 'content'],
      mount(host, context) {
        const id = host.dataset.blockId;
        contexts.set(id, context);
        host.dataset.drawn = 'yes'; // what only its dehydrate knows of
        host.addEventListener('click', () => pressed.push(id), { signal: context.signal });
        if (id === 'silent') return undefined;
        return {
          update(reason) {
            if (reason === 'content') contents.push(id);
            if (id === 'ends') throw new Error('update broke');
          },
          destroy() {
            ended.push(id);
            throw new Error('and so did its end');
          },
        };
      },
      dehydrate(host) { delete host.dataset.drawn; },
    });
    await started(page);
    const host = (id) => document.querySelector(`[data-block-id="${id}"]`);
    assert.ok(!contexts.get('silent').signal.aborted, 'a mount that returns nothing is kept');
    host('silent').click();
    assert.deepEqual(pressed, ['silent'], 'its listeners with it');
    assert.equal(DocKit.stats().live['local/edges'], 4);

    // An instance owns what it draws: `content` is no word of its own drawing.
    host('owned').append('画的');
    await settled(page);
    assert.deepEqual(contents, [], 'by default a component hears nothing of what stands in its instance');

    // Failing with a handle: destroy runs, and dehydrate after it however that went.
    host('ends').querySelector('h3').firstChild.data = '新题';
    await settled(page);
    assert.deepEqual(ended, ['ends'], 'its end ran');
    assert.equal(host('ends').dataset.drawn, undefined, 'and its dehydrate though that threw');

    // A failed instance leaving the page is no failure more.
    const before = DocKit.stats().failed;
    const destroyed = DocKit.stats().destroyed;
    host('ends').remove();
    await settled(page);
    assert.deepEqual([DocKit.stats().failed, DocKit.stats().destroyed], [before, destroyed + 1], 'it has no handle left to end');
    page.dom.window.close();
  }

  // A package that says it does not own: what stands in it is its content; and what a context is given.
  {
    const page = environment(`<main><div data-doc-component="local/open" data-block-id="open"><h3>题</h3><div class="into" data-doc-component="local/inner"><h3>里</h3></div><h4 class="own">外</h4></div></main>`);
    const { DocKit, document } = page.w;
    told(DocKit, 'local/open', { heading: { at: 'h3, h4', edit: 'none' }, inner: { at: '.into', edit: 'none', optional: true }, none: { at: '.into h3', edit: 'none', optional: true } });
    const heard = [];
    let context;
    DocKit.component({
      id: 'local/open',
      owns: false,
      on: ['content'],
      mount(host, given) {
        context = given;
        return { update: (reason, records, options) => heard.push([reason, records.length, options?.quiet ?? false]) };
      },
    });
    await started(page);
    assert.equal(context.part('heading').textContent, '题', 'a part read from the file');
    assert.equal(context.part('inner'), null, 'an instance in it is no part of it');
    assert.equal(context.part('none'), null, 'nor what that one holds');
    document.querySelector('[data-block-id="open"]').querySelector('h3').remove();
    assert.equal(context.part('heading').textContent, '外', 'past what an instance in it holds, to its own');
    await settled(page);
    assert.equal(heard.at(-1)[0], 'content', 'a component that owns nothing hears its content');
    const state = context.state({ version: 1, defaults: { filter: '', seen: 1 }, transientKeys: ['filter'] });
    state.set('filter', 'x');
    assert.equal(JSON.parse(state.serialize()).state.filter, undefined, 'a state keeps out what it says is transient');
    page.dom.window.close();
  }

  // A kit's note on a node put back: the mount takes it off with the mark.
  {
    const page = environment(`<main><div data-doc-component="local/back" data-doc-fallback data-block-id="b"><div class="doc-component-note" data-doc-dev>说明</div><h3>题</h3><button data-doc-fallback-control inert>按</button></div></main>`);
    const { DocKit, document } = page.w;
    told(DocKit, 'local/back', { title: { at: ':scope > h3', edit: 'text' } });
    DocKit.component({ id: 'local/back', mount() {} });
    await started(page);
    assert.equal(document.querySelector('[data-block-id]').outerHTML, '<div data-doc-component="local/back" data-block-id="b"><h3>题</h3><button>按</button></div>', 'marks, controls and note, all the kit\'s');
    page.dom.window.close();
  }

  // `on` that is no list stays with its package's script: the rest of the page goes on.
  {
    const page = environment(`<main><div data-doc-component="local/good" data-block-id="g"><h3>题</h3></div><div data-doc-component="local/bad" data-block-id="b"><h3>题</h3></div></main>`);
    hold(page);
    const { DocKit, document } = page.w;
    told(DocKit, 'local/good', { title: { at: ':scope > h3', edit: 'text' } });
    told(DocKit, 'local/bad', { title: { at: ':scope > h3', edit: 'text' } }, { script: true });
    const heard = [];
    DocKit.component({ id: 'local/good', on: ['source'], mount: () => ({ update: (reason) => heard.push(reason) }) });
    assert.throws(() => DocKit.component({ id: 'local/bad', on: 5, mount() {} }), /`on` is a list/, 'a number');
    assert.throws(() => DocKit.component({ id: 'local/bad', on: 'source', mount() {} }), /`on` is a list/, 'and a word, which reads as one by luck');
    await started(page);
    document.querySelector('[data-block-id="g"] h3').firstChild.data = '新题';
    await settled(page);
    assert.deepEqual(heard, ['source'], 'the other instance hears what it asked for');
    const added = document.querySelector('[data-block-id="g"]').cloneNode(true);
    added.setAttribute('data-block-id', 'n');
    document.querySelector('main').append(added);
    await settled(page);
    assert.equal(DocKit.stats().live['local/good'], 2, 'and an instance added starts');
    page.dom.window.close();
  }

  // A script that came with the page and started nothing: once the page has loaded, the instance shows as it stands.
  {
    const page = environment(`<main><div data-doc-component="local/silent" data-block-id="s"><h3>题</h3><button>按</button></div><div data-doc-component="local/nojs" data-block-id="n"><h3>题</h3><button>按</button></div><div data-doc-component="local/elsewhere" data-block-id="e"><h3>题</h3></div><div data-doc-component="local/late" data-block-id="l"><h3>题</h3></div></main>`);
    const errors = hold(page);
    const { DocKit, document } = page.w;
    told(DocKit, 'local/silent', {}, { script: true });
    told(DocKit, 'local/nojs');
    told(DocKit, 'local/elsewhere'); // told for what a paste brings: no script of it is on this page
    told(DocKit, 'local/late', {}, { script: true });
    document.addEventListener('DOMContentLoaded', () => DocKit.component({ id: 'local/late', mount(host) { host.dataset.up = 'yes'; } }));
    await started(page);
    await loaded(page);
    await settled(page);
    const host = (id) => document.querySelector(`[data-block-id="${id}"]`);
    assert.ok(host('s').hasAttribute('data-doc-fallback') && host('s').querySelector('button').hasAttribute('inert'), 'marked, its controls inert');
    assert.ok(/自定义块 local\/silent 的脚本没有启动它/.test(host('s').querySelector('.doc-component-note').textContent), 'and says so');
    assert.equal(errors.filter((said) => said.includes('local/silent')).length, 1, 'and so does the console, once');
    assert.ok(!host('n').hasAttribute('data-doc-fallback') && !host('n').querySelector('button').hasAttribute('inert') && !host('n').querySelector('.doc-component-note'), 'a package with no script stays as it is');
    assert.ok(!host('e').hasAttribute('data-doc-fallback'), 'as does one whose script never was on the page');
    assert.ok(host('l').dataset.up && !host('l').hasAttribute('data-doc-fallback'), 'and one that registers as the page gets ready');
    assert.equal(errors.filter((said) => said.includes('local/late')).length, 0, 'with no word on the console');
    const added = host('s').cloneNode(true);
    added.removeAttribute('data-doc-fallback');
    added.querySelector('.doc-component-note').remove();
    added.setAttribute('data-block-id', 'a');
    document.querySelector('main').append(added);
    await settled(page);
    assert.ok(host('a').hasAttribute('data-doc-fallback') && host('a').querySelector('.doc-component-note'), 'one added later reads the same');
    assert.equal(DocKit.dehydrate(host('s').cloneNode(true)).outerHTML, '<div data-doc-component="local/silent" data-block-id="s"><h3>题</h3><button>按</button></div>', 'and comes off a copy');
    page.dom.window.close();
  }

  // A note for who writes the page: none in a presentation, as none in an export.
  {
    const page = environment(`<main><div data-doc-component="local/broke" data-block-id="b"><h3>题</h3></div></main>`);
    hold(page);
    page.w.history.replaceState({}, '', '?present');
    const { DocKit, document } = page.w;
    told(DocKit, 'local/broke');
    DocKit.component({ id: 'local/broke', mount() { throw new Error('mount broke'); } });
    await started(page);
    assert.ok(document.querySelector('[data-block-id]').hasAttribute('data-doc-fallback'), 'it fails all the same');
    assert.equal(document.querySelector('.doc-kit-error'), null, 'and tells the console alone');
    page.dom.window.close();
    assert.match(reportCss, /@media print\s*\{\s*\.doc-kit-error\s*\{\s*display:\s*none/, 'and on paper it does not show');
  }

  // A mount that is a promise: it is the instance's start, whether it comes true or not.
  {
    const body = ['good', 'bad', 'gone'].map((id) => `<div data-doc-component="local/async" data-block-id="${id}"><h3>题</h3></div>`).join('');
    const page = environment(`<main>${body}</main>`);
    hold(page);
    const { DocKit, document } = page.w;
    told(DocKit, 'local/async', { title: { at: ':scope > h3', edit: 'text' } }, { runtime: { generated: [`${root('local/async')} .gen`] } });
    const heard = [];
    const destroyed = [];
    DocKit.component({
      id: 'local/async',
      on: ['source'],
      async mount(host) {
        host.append(Object.assign(document.createElement('span'), { className: 'gen' }));
        await null;
        if (host.dataset.blockId === 'bad') throw new Error('nothing came');
        return { update: (reason) => heard.push([host.dataset.blockId, reason]), destroy: () => destroyed.push(host.dataset.blockId) };
      },
    });
    await started(page);
    const host = (id) => document.querySelector(`[data-block-id="${id}"]`);
    const gone = host('gone');
    gone.remove();
    await settled(page);
    await settled(page);
    assert.ok(host('bad').hasAttribute('data-doc-fallback') && !host('bad').querySelector('.gen'), 'one that rejects failed: its drawing off, shown as it stands');
    assert.deepEqual([DocKit.stats().failed, DocKit.stats().live['local/async']], [1, 1], 'and is counted so');
    host('good').querySelector('h3').firstChild.data = '新题';
    await settled(page);
    assert.deepEqual(heard, [['good', 'source']], 'what one resolves to is its handle');
    assert.deepEqual(destroyed, ['gone'], 'and one that ended before it came is ended');
    page.dom.window.close();
  }

  // A component that draws in every frame: the page is drawn all the same.
  {
    const page = environment(`<main><div data-doc-component="local/loop" data-block-id="l"><h3>题</h3></div><div data-doc-component="local/twice" data-block-id="t"><h3>题</h3></div></main>`);
    const { DocKit, document } = page.w;
    told(DocKit, 'local/loop');
    told(DocKit, 'local/twice');
    let frames = 0;
    const order = [];
    DocKit.component({
      id: 'local/loop',
      mount(host, context) {
        const tick = () => { frames += 1; context.frame(tick); };
        context.frame(tick);
      },
    });
    DocKit.component({
      id: 'local/twice',
      mount(host, context) {
        context.frame(() => order.push('a'));
        context.frame(() => order.push('b'));
      },
    });
    if (document.readyState === 'loading') await new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
    for (let round = 0; round < 6 && !document.documentElement.hasAttribute('data-doc-drawn'); round++) {
      try {
        page.flush();
      } catch {} // it never stops asking: flush says so
    }
    assert.ok(frames >= 30, `it did draw (${frames})`);
    assert.ok(document.documentElement.hasAttribute('data-doc-drawn'), 'the page is drawn though something still draws');
    assert.deepEqual(order, ['b'], 'of what one asks in a frame, the last runs');
    page.dom.window.close();
  }

  // A slot (data-doc-slot, a part edited as flow): what it holds is the document's. The kit's components
  // start there, a change there is no change of what the component owns, and it is told as `source`;
  // what the component leaves on the page is of its own region alone.
  {
    const page = environment(`<main><div data-doc-component="local/brief" data-block-id="b"><h3>题</h3><span class="probe" id="inRegion"></span><div class="brief-body" data-doc-slot="body"><p>一段</p><span class="probe" id="inSlot"></span><span class="brief-count" id="slotCount">文档的</span></div></div></main>`);
    const { DocKit, document } = page.w;
    told(DocKit, 'local/brief', { title: { at: ':scope > h3', edit: 'text' }, body: { at: 'div[data-doc-slot="body"], section[data-doc-slot="body"]', edit: 'flow' } }, { runtime: { generated: ['[data-doc-component="local/brief"] .brief-count'] } });
    const mounted = [];
    DocKit.component({ id: 'probe', selector: '.probe', mount(host) { mounted.push(host.id); return {}; } });
    const heard = [];
    let context;
    DocKit.component({
      id: 'local/brief',
      on: ['source'],
      mount(host, given) {
        context = given;
        const count = document.createElement('div');
        count.className = 'brief-count';
        host.append(count);
        return { update: (reason) => heard.push(reason) };
      },
    });
    await started(page);
    assert.deepEqual(mounted, ['inSlot'], "a component of the kit's starts in its slot, none in its own region");
    assert.ok(document.getElementById('slotCount'), 'a mount takes what it left off its own region alone');
    const slot = document.querySelector('[data-doc-slot]');
    assert.equal(context.part('body'), slot, 'a part edited as flow is its slot, the element');
    assert.equal(context.part('title').localName, 'h3');
    page.w.dispatchEvent(new page.w.Event('doc-editable'));
    assert.throws(() => context.edit('body', () => {}), /not edited as data/, 'which it reads and never writes');
    const added = document.createElement('span');
    added.className = 'probe';
    added.id = 'added';
    slot.querySelector('p').after(added);
    await settled(page);
    assert.ok(mounted.includes('added'), 'what is added to its slot starts: no change of what it owns');
    heard.length = 0;
    slot.querySelector('p').textContent = '改了的一段';
    await settled(page);
    assert.ok(heard.includes('source'), 'a change in its slot is told as one of what the file says of it');
    const copy = DocKit.dehydrate(document.querySelector('[data-block-id="b"]').cloneNode(true));
    assert.deepEqual([...copy.querySelectorAll('.brief-count')].map((node) => node.id), ['slotCount'], 'an export of the view takes off what it generated in its own region, none of its slot\'s');
    page.dom.window.close();
  }
  // One of no package: its own region read-only, its slot the document's still.
  {
    const page = environment(`<main><div data-doc-component="local/gone" data-block-id="g"><button id="own">按</button><div data-doc-slot="body"><button id="slotted">按</button></div></div></main>`);
    const { document } = page.w;
    await started(page);
    await loaded(page);
    assert.ok(document.getElementById('own').hasAttribute('inert') && !document.getElementById('slotted').hasAttribute('inert'), 'a control of its own region is made inert, one in its slot is not');
    page.dom.window.close();
  }
}

// What a package's component hears of the file (source), 2026-11-07: an attribute that says something of
// it in a part or a slot (a to-do item checked, a cell's spans, a look class; a class the kit toggles as
// it lays a table out is none, and hidden and open are reveal's), nothing an instance among a slot's
// blocks draws (a clock) but what its own parts say, and a frame's changes in one notice, in that frame.
{
  const page = environment(`<main class="doc-page">
    <div data-doc-component="local/outer" data-block-id="o"><h3>外</h3>
      <div data-doc-slot="body">
        <ul class="doc-todo"><li id="todo">一项</li></ul>
        <table id="cells"><tbody><tr><td id="cell">格</td></tr></tbody></table>
        <details id="fold"><summary>折</summary><p>内</p></details>
        <div data-doc-component="local/inner" data-block-id="i"><h4 id="innerTitle">内题</h4></div>
      </div>
    </div>
  </main>`);
  const { DocKit, document } = page.w;
  const heard = [];
  const revealed = [];
  DocKit.describe({ id: 'local/outer', match: '[data-doc-component="local/outer"]', parts: { title: { at: ':scope > h3', edit: 'text' }, body: { at: 'div[data-doc-slot="body"]', edit: 'flow' } } });
  DocKit.describe({ id: 'local/inner', match: '[data-doc-component="local/inner"]', parts: { title: { at: ':scope > h4', edit: 'text' } }, runtime: { generated: ['[data-doc-component="local/inner"] .tick'] } });
  DocKit.component({ id: 'local/outer', on: ['source', 'reveal'], mount: () => ({ update: (reason, records) => (reason === 'source' ? heard.push([...records].map((record) => record.type === 'attributes' ? `${record.attributeName}` : record.type)) : revealed.push(reason)) }) });
  let draw = null;
  DocKit.component({
    id: 'local/inner',
    mount(host) {
      const tick = document.createElement('span');
      tick.className = 'tick';
      host.append(tick);
      draw = (text) => { tick.textContent = text; };
      return {};
    },
  });
  await started(page);
  const settled = () => new Promise((resolve) => page.w.setTimeout(() => { page.flush(); resolve(); }, 0));
  const only = async (change) => {
    heard.length = 0;
    change();
    await settled();
    return heard.flat();
  };
  assert.deepEqual(await only(() => document.getElementById('todo').setAttribute('data-checked', '')), ['data-checked'], 'a to-do item checked in its slot is what the file says');
  assert.deepEqual(await only(() => document.getElementById('cell').setAttribute('colspan', '2')), ['colspan'], 'so is a cell\'s span');
  assert.deepEqual(await only(() => document.getElementById('cell').classList.add('doc-highlight-blue')), ['class'], 'and a look class');
  assert.deepEqual(await only(() => document.getElementById('cell').classList.add('number')), [], 'a class the kit lays a table out by is none');
  assert.deepEqual(await only(() => document.getElementById('cells').classList.add('doc-table--auto')), [], 'nor its auto layout');
  assert.deepEqual(await only(() => document.getElementById('cell').classList.replace('doc-highlight-blue', 'doc-highlight-blue')), [], 'a class written again as it was says nothing');
  revealed.length = 0;
  assert.deepEqual(await only(() => document.getElementById('fold').removeAttribute('open')), [], 'a disclosure shut is the reader\'s: no source');
  // A nested instance's drawing is its own, its words the file's.
  assert.deepEqual(await only(() => draw('12:00')), [], 'what an instance in its slot draws (a clock) is no source of the outer');
  assert.deepEqual(await only(() => { draw('12:01'); draw('12:02'); }), [], 'however often');
  assert.deepEqual(await only(() => { document.getElementById('innerTitle').firstChild.data = '新内题'; }), ['characterData'], 'what that instance\'s text part says is');
  // A frame's changes in one notice, heard in that frame, never as they are made.
  heard.length = 0;
  document.getElementById('todo').firstChild.data = '一项改';
  await new Promise((resolve) => page.w.setTimeout(resolve, 0));
  document.getElementById('todo').removeAttribute('data-checked');
  await new Promise((resolve) => page.w.setTimeout(resolve, 0));
  assert.deepEqual(heard, [], 'not heard before the frame');
  page.flush();
  assert.deepEqual(heard, [['characterData', 'data-checked']], 'two changes of two tasks, one notice in the frame');
  page.dom.window.close();
}

// A slot is the document's: what a component writes there as the kit calls it (its mount, an update, a
// frame's drawing, a timer) is put back, every change of that call with it, and the instance fails.
{
  const instance = (id) => `<div data-doc-component="local/greedy" data-block-id="${id}"><h3>题</h3><div data-doc-slot="body"><p>读者的一段</p></div></div>`;
  const page = environment(`<main class="doc-page">${['mount', 'update', 'frame', 'timer', 'off', 'clean'].map(instance).join('')}</main>`);
  const { DocKit, document } = page.w;
  const errors = [];
  page.w.console.error = (...said) => errors.push(said.map(String).join(' '));
  DocKit.describe({ id: 'local/greedy', match: '[data-doc-component="local/greedy"]', parts: { title: { at: ':scope > h3', edit: 'text' }, body: { at: 'div[data-doc-slot="body"]', edit: 'flow' } }, runtime: { generated: ['[data-doc-component="local/greedy"] .drawn'] } });
  const contexts = new Map();
  const writeIn = (host) => {
    const slot = host.querySelector('[data-doc-slot]');
    slot.querySelector('p').firstChild.data = '组件改的';
    slot.append(Object.assign(document.createElement('p'), { textContent: '组件加的' }));
    slot.setAttribute('data-x', '1');
  };
  DocKit.component({
    id: 'local/greedy',
    on: ['source'],
    mount(host, context) {
      const id = host.dataset.blockId;
      contexts.set(id, context);
      host.append(Object.assign(document.createElement('div'), { className: 'drawn', textContent: '画的' }));
      if (id === 'mount') writeIn(host);
      if (id === 'off') host.querySelector('[data-doc-slot]').remove();
      return { update: () => { if (id === 'update') writeIn(host); if (id === 'frame') context.frame(() => writeIn(host)); } };
    },
  });
  await started(page);
  const host = (id) => document.querySelector(`[data-block-id="${id}"]`);
  const slotOf = (id) => host(id).querySelector('[data-doc-slot]')?.outerHTML ?? null;
  const asWritten = '<div data-doc-slot="body"><p>读者的一段</p></div>';
  assert.deepEqual(['mount', 'off'].map(slotOf), [asWritten, asWritten], 'a mount that wrote in its slot, or took it off: put back');
  assert.ok(['mount', 'off'].every((id) => host(id).hasAttribute('data-doc-fallback') && !host(id).querySelector('.drawn')), 'and failed, its drawing off');
  assert.ok(errors.some((said) => said.includes('it wrote in its slot "body" as it mounted')), `told why: ${errors.join(' | ')}`);
  for (const id of ['update', 'frame']) host(id).querySelector('h3').firstChild.data = `题 ${id}`;
  const settled = () => new Promise((resolve) => page.w.setTimeout(() => { page.flush(); resolve(); }, 0));
  await settled();
  await settled();
  assert.deepEqual(['update', 'frame'].map(slotOf), [asWritten, asWritten], 'an update or a frame that wrote there: put back');
  assert.ok(['update', 'frame'].every((id) => host(id).hasAttribute('data-doc-fallback')), 'failed');
  assert.ok(errors.some((said) => said.includes('as it heard source')) && errors.some((said) => said.includes('as it drew in a frame')), 'each told when');
  let ran = 0;
  const timers = [];
  page.w.setTimeout = ((set) => (run, ms) => { timers.push(run); return set(() => {}, ms); })(page.w.setTimeout);
  contexts.get('timer').timeout(() => { ran += 1; writeIn(host('timer')); }, 10);
  timers.at(-1)();
  assert.ok(ran === 1 && slotOf('timer') === asWritten && host('timer').hasAttribute('data-doc-fallback'), 'and so does a timer it set');
  assert.ok(!host('clean').hasAttribute('data-doc-fallback') && host('clean').querySelector('.drawn'), 'one that keeps out of its slot draws on');
  page.dom.window.close();
}

// The state of an instance with no block id: a hash of its markup, what its parts hold left out, and its
// place among the package's instances of that hash; an edit of its words keeps it, another instance of
// other markup moved past it changes nothing; given a block id, it takes that state. On a custom page,
// its card's id.
{
  const page = environment(`<main class="doc-page" data-doc-id="notes">
    <div data-doc-component="local/keep" data-kind="a"><h3>一</h3></div>
    <div data-doc-component="local/keep" data-kind="b"><h3>二</h3></div>
    <div data-doc-component="local/keep" data-kind="a"><h3>三</h3></div>
  </main>`);
  const { DocKit, document } = page.w;
  DocKit.describe({ id: 'local/keep', match: '[data-doc-component="local/keep"]', parts: { title: { at: ':scope > h3', edit: 'text' } } });
  const contexts = new Map();
  DocKit.component({ id: 'local/keep', mount(host, context) { contexts.set(host, context); return {}; } });
  await started(page);
  const [first, second, third] = document.querySelectorAll('[data-doc-component]');
  const idOf = (host) => contexts.get(host).state({ version: 1, defaults: { open: false } }).id;
  const [a0, b0, a1] = [first, second, third].map(idOf);
  assert.ok(/^local\/keep:\w+:0$/.test(a0) && /^local\/keep:\w+:1$/.test(a1) && a0.split(':')[1] === a1.split(':')[1], `two of one markup: one hash, their places among it: ${a0} ${a1}`);
  assert.ok(/^local\/keep:\w+:0$/.test(b0) && b0 !== a0, 'one of other markup: a hash of its own, first of it');
  contexts.get(first).state({ version: 1, defaults: { open: false } }).set('open', true);
  // The page again, its words edited and the instance of other markup moved first: the same names.
  const stored = page.w.localStorage;
  const again = environment(`<main class="doc-page" data-doc-id="notes">
    <div data-doc-component="local/keep" data-kind="b"><h3>二</h3></div>
    <div data-doc-component="local/keep" data-kind="a"><h3>一，改过</h3></div>
    <div data-doc-component="local/keep" data-kind="a"><h3>三</h3></div>
  </main>`, '', undefined, (w) => { for (let at = 0; at < stored.length; at++) w.localStorage.setItem(stored.key(at), stored.getItem(stored.key(at))); });
  const kept = new Map();
  again.w.DocKit.describe({ id: 'local/keep', match: '[data-doc-component="local/keep"]', parts: { title: { at: ':scope > h3', edit: 'text' } } });
  again.w.DocKit.component({ id: 'local/keep', mount(host, context) { kept.set(host, context); return {}; } });
  await started(again);
  const [moved, edited] = again.w.document.querySelectorAll('[data-doc-component]');
  const stateOf = (host) => kept.get(host).state({ version: 1, defaults: { open: false } });
  assert.deepEqual([stateOf(edited).id, stateOf(edited).get('open'), stateOf(moved).id], [a0, true, b0], 'its words edited and another moved past it: the same state');
  again.dom.window.close();
  // Given a block id: the state its hash held.
  const named = environment(`<main class="doc-page" data-doc-id="notes">
    <div data-doc-component="local/keep" data-kind="a" data-block-id="k1"><h3>一</h3></div>
  </main>`, '', undefined, (w) => { for (let at = 0; at < stored.length; at++) w.localStorage.setItem(stored.key(at), stored.getItem(stored.key(at))); });
  let given = null;
  named.w.DocKit.describe({ id: 'local/keep', match: '[data-doc-component="local/keep"]', parts: { title: { at: ':scope > h3', edit: 'text' } } });
  named.w.DocKit.component({ id: 'local/keep', mount(host, context) { given = context; return {}; } });
  await started(named);
  const state = given.state({ version: 1, defaults: { open: false } });
  assert.deepEqual([state.id, state.get('open')], ['local/keep:k1', true], 'given a block id, it takes the state its markup\'s name held');
  assert.ok(named.w.localStorage.getItem('gallery:notes:local/keep:k1')?.includes('"open":true'), 'carried to its own name at once');
  named.dom.window.close();
  page.dom.window.close();
  // On a custom page: by its card.
  const board = environment(`<main class="gallery-page" data-page-id="home"><div class="gallery-board" data-board-id="main"><section class="gallery-card" data-card-id="c7" data-x="0" data-y="0" data-w="4" data-h="2"><div data-doc-component="local/keep" data-block-id="k9"><h3>一</h3></div></section></div></main>`);
  let carded = null;
  board.w.DocKit.describe({ id: 'local/keep', match: '[data-doc-component="local/keep"]', parts: { title: { at: ':scope > h3', edit: 'text' } } });
  board.w.DocKit.component({ id: 'local/keep', mount(host, context) { carded = context; return {}; } });
  await started(board);
  assert.equal(carded.state({ version: 1, defaults: { open: false } }).id, 'local/keep:c7', 'on a custom page, its card\'s id');
  board.dom.window.close();
}

// What a package's context holds besides (2026-11-07): its JSON read and written as it was laid out,
// the rows of a table, timers and listeners that end with it, where it is and its card's size.
{
  const scores = '\n    {\n      "scale": 5,\n      "options": [\n        { "name": "甲", "scores": [4, 3] }\n      ]\n    }\n  ';
  const body = `<main class="doc-page" data-doc-id="plan">
    <div data-doc-component="local/data" data-block-id="d"><h3>题</h3><script type="application/json">${scores}</script><table>
      <thead><tr><th>任务</th><th>状态</th><th>工时</th></tr></thead>
      <tbody>
        <tr><td>写说明</td><td>待办</td><td>3</td></tr>
        <tr><td><a href="../spec/doc.html#b2">看规格</a></td><td>进行中</td><td></td></tr>
        <tr><td><a href="#b9">本页一块</a></td><td>已完成</td><td>1.5</td></tr>
      </tbody>
    </table><div class="null"><script type="application/json"> null </script></div><div class="bad"><script type="application/json">{ nope</script></div></div>
    <div data-doc-component="local/data" data-block-id="merged"><h3>题</h3><script type="application/json">{}</script><table><tbody><tr><th>甲</th><th>乙</th></tr><tr><td colspan="2">合</td></tr></tbody></table></div>
  </main>`;
  const page = environment(body);
  const { DocKit, document } = page.w;
  DocKit.describe({ id: 'local/data', match: '[data-doc-component="local/data"]', parts: {
    title: { at: ':scope > h3', edit: 'text' }, scores: { at: ':scope > script', edit: 'data' }, tasks: { at: ':scope > table', edit: 'data' },
    bad: { at: ':scope > .bad > script', edit: 'none', optional: true }, none: { at: ':scope > ul', edit: 'data', optional: true },
    nothing: { at: ':scope > .null > script', edit: 'none', optional: true },
  } });
  const contexts = new Map();
  const errors = [];
  page.w.console.error = (...said) => errors.push(said.map(String).join(' '));
  DocKit.component({ id: 'local/data', mount(host, context) { contexts.set(host.dataset.blockId, context); return {}; } });
  await started(page);
  page.w.dispatchEvent(new page.w.Event('doc-editable'));
  document.addEventListener('doc-component-edit', (event) => {
    const { parts, run } = event.detail;
    const drafts = Object.fromEntries(parts.map(({ name, part }) => [name, part.cloneNode(true)]));
    if (run(drafts)) {
      for (const { name, part } of parts) part.replaceChildren(...drafts[name].childNodes);
      event.preventDefault();
    }
  });
  const context = contexts.get('d');
  const script = () => document.querySelector('[data-block-id="d"] > script').textContent;

  // readJSON, editJSON.
  assert.deepEqual(plain(context.readJSON('scores')), { scale: 5, options: [{ name: '甲', scores: [4, 3] }] }, 'its JSON, parsed');
  assert.equal(context.readJSON('none'), undefined, 'an optional part it does not hold: undefined, no failure');
  assert.equal(context.readJSON('nothing'), null, 'JSON that says null: null, which is no failure (undefined is what nothing read is)');
  assert.equal(context.editJSON('scores', (data) => { data.options[0].scores[1] = 5; }), true, 'a change of the draft, taken');
  assert.equal(script(), scores.replace('[4, 3]', '[4, 5]'), 'written back as it was laid out: one line changed');
  assert.equal(context.editJSON('scores', (data) => ({ ...data, scale: 10 })), true, 'a value returned stands instead');
  assert.equal(script(), scores.replace('[4, 3]', '[4, 5]').replace('"scale": 5', '"scale": 10'), 'and keeps the layout too');
  const before = script();
  assert.equal(context.editJSON('scores', (data) => { data.scale = 10; }), true, 'what changes nothing is taken');
  assert.equal(script(), before, 'and writes nothing');
  assert.equal(context.editJSON('scores', (data) => { data.note = '</script><!--'; }), true, 'what could end the script');
  assert.ok(script().includes('"note": "<\\/script>\\u003c!--"') && JSON.parse(script()).note === '</script><!--', 'is escaped, and reads back as itself');
  assert.equal(context.editJSON('scores', async () => {}), false, 'a change that means to go on later is none');
  assert.throws(() => context.editJSON('title', () => {}), /not edited as data/, 'a part not edited as data throws');
  assert.ok(!errors.some((said) => said.includes('holds no JSON')), 'nothing failed yet');
  assert.equal(context.readJSON('bad'), undefined, 'a part that holds no JSON: undefined, as what reads nothing');
  assert.ok(errors.some((said) => said.includes('its part "bad" holds no JSON')) && document.querySelector('[data-block-id="d"]').hasAttribute('data-doc-fallback'), 'and the instance fails, as fail does');
  page.dom.window.close();
}
{
  const table = `<table>
      <thead><tr><th>任务</th><th>状态</th><th>工时</th></tr></thead>
      <tbody>
        <tr><td>写说明</td><td>待办</td><td>3</td></tr>
        <tr><td><a href="../spec/doc.html#b2">看规格</a></td><td>进行中</td><td></td></tr>
        <tr><td><a href="#b9">本页一块</a></td><td>已完成</td><td>1.5</td></tr>
      </tbody>
    </table>`;
  const page = environment(`<main class="doc-page" data-doc-id="plan"><div data-doc-component="local/data" data-block-id="d"><h3>题</h3>${table}</div><div data-doc-component="local/data" data-block-id="m"><h3>题</h3><table><tbody><tr><th>甲</th><th>乙</th></tr><tr><td colspan="2">合</td></tr></tbody></table></div></main>`);
  const { DocKit, document } = page.w;
  DocKit.describe({ id: 'local/data', match: '[data-doc-component="local/data"]', parts: { title: { at: ':scope > h3', edit: 'text' }, tasks: { at: ':scope > table', edit: 'data' } } });
  const contexts = new Map();
  DocKit.component({ id: 'local/data', mount(host, context) { contexts.set(host.dataset.blockId, context); return {}; } });
  await started(page);
  page.w.dispatchEvent(new page.w.Event('doc-editable'));
  document.addEventListener('doc-component-edit', (event) => {
    const { parts, run } = event.detail;
    const drafts = Object.fromEntries(parts.map(({ name, part }) => [name, part.cloneNode(true)]));
    if (run(drafts)) {
      for (const { name, part } of parts) part.replaceChildren(...drafts[name].childNodes);
      event.preventDefault();
    }
  });
  const context = contexts.get('d');
  const body = () => document.querySelector('[data-block-id="d"] tbody').innerHTML;
  const written = body();
  let rows = context.rows('tasks');
  assert.deepEqual(plain(rows.columns), ['任务', '状态', '工时'], 'its header\'s words');
  assert.deepEqual(plain(rows.rows.map(({ values }) => values)), [{ 任务: '写说明', 状态: '待办', 工时: 3 }, { 任务: '看规格', 状态: '进行中', 工时: null }, { 任务: '本页一块', 状态: '已完成', 工时: 1.5 }], 'each row\'s values, as a chart reads them');
  assert.deepEqual(plain(rows.rows.map(({ links }) => links)), [[], [{ slug: 'spec', title: '看规格', block: 'b2' }], [{ slug: 'plan', title: '本页一块', block: 'b9' }]], 'and the links it holds to documents, this one\'s too');
  assert.ok(rows.rows[0].el === document.querySelector('[data-block-id="d"] tbody tr'), 'each row its element on the page');
  assert.equal(contexts.get('m').rows('tasks'), null, 'a table with a cell spanning others: none');
  const lines = written.split('\n');
  assert.equal(rows.move(rows.rows[0], { after: rows.rows[2], values: { 状态: '已完成' } }), true, 'a row moved, its status set as it goes');
  assert.equal(body(), [lines[0], lines[2], lines[3], lines[1].replace('<td>待办</td>', '<td>已完成</td>'), lines[4]].join('\n'), 'one write: its blank along with it, its cell changed, a row a line still');
  rows = context.rows('tasks');
  assert.equal(rows.move(rows.rows[2], { before: rows.rows[0] }), true);
  assert.equal(body(), written.replace('<td>待办</td>', '<td>已完成</td>'), 'and back before the first');
  rows = context.rows('tasks');
  assert.equal(rows.add({ 任务: '新的一项', 状态: '待办' }), true, 'a row added');
  assert.equal(body(), written.replace('<td>待办</td>', '<td>已完成</td>').replace(/\n(\s*)$/, '\n        <tr><td>新的一项</td><td>待办</td><td></td></tr>\n$1'), 'last, its own line, an empty cell for what it was not given');
  rows = context.rows('tasks');
  assert.equal(rows.add({ 任务: '插进来' }, { after: rows.rows[0] }), true);
  assert.equal(context.rows('tasks').rows[1].values.任务, '插进来', 'or after the row it names');
  rows = context.rows('tasks');
  assert.equal(rows.remove(rows.rows[1]), true, 'a row taken out');
  assert.equal(rows.remove(rows.rows[1]), false, 'one taken out already is no row of the set: false');
  rows = context.rows('tasks');
  assert.equal(rows.remove(rows.rows.at(-1)), true);
  assert.equal(body(), written.replace('<td>待办</td>', '<td>已完成</td>'), 'with its blank: the body as it was');
  assert.throws(() => rows.add({ 负责人: '甲' }), /no column "负责人"/, 'a column the header does not have throws');
  page.dom.window.close();
}
{
  // Timers and listeners end with the instance; where it is; its card's size.
  const page = environment(`<main class="doc-page"><div data-doc-component="local/timed" data-block-id="t"><h3>题</h3></div></main>`);
  const { DocKit, document } = page.w;
  DocKit.describe({ id: 'local/timed', match: '[data-doc-component="local/timed"]', parts: { title: { at: ':scope > h3', edit: 'text' } } });
  let context = null;
  DocKit.component({ id: 'local/timed', mount(host, given) { context = given; return {}; } });
  await started(page);
  assert.deepEqual([context.place, context.size], ['document', null], 'in a document: no size');
  let ticks = 0;
  let presses = 0;
  let ownPresses = 0;
  const interval = context.interval(() => { ticks += 1; }, 5);
  assert.ok(typeof interval === 'number', 'an interval gives its id');
  context.listen(document, 'click', () => { presses += 1; });
  const own = new page.w.AbortController();
  context.listen(document, 'click', () => { ownPresses += 1; }, { signal: own.signal });
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.ok(ticks > 0, 'its interval runs');
  document.body.click();
  own.abort();
  document.body.click();
  assert.deepEqual([presses, ownPresses], [2, 1], 'a listener heard, one of its own signal ended with it');
  document.querySelector('[data-block-id="t"]').remove();
  await new Promise((resolve) => page.w.setTimeout(resolve, 0));
  const then = ticks;
  await new Promise((resolve) => setTimeout(resolve, 40));
  document.body.click();
  assert.deepEqual([ticks, presses], [then, 2], 'the instance gone: its interval cleared, its listener removed');
  page.dom.window.close();

  const exported = environment(`<main class="doc-page"><div data-doc-component="local/timed"><h3>题</h3></div></main>`, '<meta name="generator" content="Gallery">');
  let there = null;
  exported.w.DocKit.describe({ id: 'local/timed', match: '[data-doc-component="local/timed"]', parts: { title: { at: ':scope > h3', edit: 'text' } } });
  exported.w.DocKit.component({ id: 'local/timed', mount(host, given) { there = given; return {}; } });
  await started(exported);
  assert.deepEqual([there.place, there.canEdit()], ['export', false], 'in an exported file');
  exported.dom.window.close();

  const board = environment(`<main class="gallery-page" data-page-id="home"><div class="gallery-board" data-board-id="main"><section class="gallery-card" data-card-id="c1" data-x="0" data-y="0" data-w="6" data-h="2" style="padding: 12px 16px"><div data-doc-component="local/timed"><h3>题</h3></div></section></div></main>`);
  let carded = null;
  board.w.DocKit.describe({ id: 'local/timed', match: '[data-doc-component="local/timed"]', parts: { title: { at: ':scope > h3', edit: 'text' } } });
  board.w.DocKit.component({ id: 'local/timed', on: ['layout'], mount(host, given) { carded = given; return {}; } });
  const card = board.w.document.querySelector('.gallery-card');
  Object.defineProperties(card, { clientWidth: { value: 400 }, clientHeight: { value: 180 } });
  await started(board);
  assert.deepEqual([carded.place, plain(carded.size)], ['page', { w: 6, h: 2, width: 368, height: 156 }], 'on a custom page: its card\'s cells and what it holds inside its padding');
  // The cells the board draws it at (card-size.mjs, the board script's rule), never the raw attributes.
  const cells = () => { const { w, h } = carded.size; return [w, h]; };
  card.parentElement.setAttribute('data-columns', '4');
  assert.deepEqual(cells(), [4, 2], "on a narrow window, no wider than the board's four columns");
  Object.assign(card.dataset, { w: '8', h: '30' });
  assert.deepEqual(cells(), [4, 24], 'a card written 8 by 30 there: drawn, and said, 4 by 24');
  card.parentElement.setAttribute('data-columns', '12');
  assert.deepEqual(cells(), [8, 24], 'twelve columns: its 8, its height held to 24');
  Object.assign(card.dataset, { w: '40', h: '0' });
  assert.deepEqual(cells(), [12, 1], 'held to 1 to 12 wide, 1 to 24 high');
  Object.assign(card.dataset, { w: 'abc', h: '' });
  assert.deepEqual(cells(), [4, 2], 'no number: the default card, 4 by 2, as the board draws it');
  Object.assign(card.dataset, { w: '6.5', h: '3' });
  card.parentElement.removeAttribute('data-columns');
  assert.deepEqual(cells(), [6, 3], 'a whole number of cells, and twelve columns where the board says none');
  // A card the board draws at a height of its own (fit content: --gallery-h, the board script's): that height, whatever data-h says.
  card.style.setProperty('--gallery-h', '5');
  assert.deepEqual(cells(), [6, 5], 'the height the board drew it at (fit content)');
  card.style.setProperty('--gallery-h', '40');
  assert.deepEqual(cells(), [6, 24], 'held to 24 all the same');
  card.style.removeProperty('--gallery-h');
  board.dom.window.close();

  // A card is the closest .gallery-card of any tag: its size, and its id names the state.
  const divided = environment(`<main class="gallery-page" data-page-id="home"><div class="gallery-board" data-board-id="main" data-columns="12"><div class="gallery-card" data-card-id="c2" data-x="0" data-y="0" data-w="3" data-h="5"><div data-doc-component="local/timed" data-block-id="t1"><h3>题</h3></div></div></div></main>`);
  let inDiv = null;
  divided.w.DocKit.describe({ id: 'local/timed', match: '[data-doc-component="local/timed"]', parts: { title: { at: ':scope > h3', edit: 'text' } } });
  divided.w.DocKit.component({ id: 'local/timed', mount(host, given) { inDiv = given; return {}; } });
  await started(divided);
  assert.deepEqual([inDiv.place, inDiv.size?.w, inDiv.size?.h, inDiv.state({ version: 1, defaults: {} }).id], ['page', 3, 5, 'local/timed:c2'], "a div.gallery-card: its cells, and its card's id for the state");
  divided.dom.window.close();
}

// The clock: one timer for all that hear it, at each whole minute, "day" for the first of a day; none
// while nobody listens.
{
  let now = new Date(2026, 10, 7, 23, 58, 30, 0).getTime();
  const timers = [];
  const page = environment(`<main class="doc-page"><div data-doc-component="local/clock" data-block-id="a"><h3>题</h3></div><div data-doc-component="local/clock" data-block-id="b"><h3>题</h3></div></main>`, '', undefined, (w) => {
    const RealDate = w.Date;
    w.Date = class extends RealDate { constructor(...given) { super(...(given.length ? given : [now])); } static now() { return now; } };
    const real = w.setTimeout.bind(w);
    w.setTimeout = (run, ms) => { if (ms >= 1000) { timers.push({ run, ms }); return 9000 + timers.length; } return real(run, ms); };
  });
  const { DocKit } = page.w;
  DocKit.describe({ id: 'local/clock', match: '[data-doc-component="local/clock"]', parts: { title: { at: ':scope > h3', edit: 'text' } } });
  assert.equal(timers.length, 0, 'no timer while nothing listens');
  const heard = [];
  DocKit.component({ id: 'local/clock', on: ['clock'], mount: (host) => ({ update: (reason, detail) => heard.push(`${host.dataset.blockId} ${reason} ${detail}`) }) });
  await started(page);
  assert.deepEqual(timers.map(({ ms }) => ms), [30_005], 'one timer for both, to the next whole minute');
  now += 30_005;
  timers.shift().run();
  assert.deepEqual(heard, ['a clock minute', 'b clock minute'], 'each told of the minute');
  now += 60_000;
  timers.shift().run();
  assert.deepEqual(heard.slice(2), ['a clock day', 'b clock day'], 'and of the first minute of another day');
  page.dom.window.close();
}

// DocKit.input: a value committed once, when the reader is done with it, never as an input method composes.
{
  const page = environment('<input id="name" value="旧名"><textarea id="note">一</textarea><select id="pick"><option>甲</option><option>乙</option></select>');
  const { DocKit, document } = page.w;
  const committed = [];
  const field = document.getElementById('name');
  const handle = DocKit.input(field, { commit: (value) => committed.push(value) });
  const key = (target, init) => target.dispatchEvent(new page.w.KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  field.focus();
  field.value = '新名';
  assert.equal(key(field, { key: 'Enter' }), false, 'Enter is the field\'s: no form sent');
  assert.deepEqual(committed, ['新名'], 'committed on Enter');
  field.dispatchEvent(new page.w.Event('blur'));
  assert.deepEqual(committed, ['新名'], 'and not again as it is left');
  field.dispatchEvent(new page.w.CompositionEvent('compositionstart'));
  field.value = '新名ni';
  key(field, { key: 'Enter', isComposing: true, keyCode: 229 });
  field.dispatchEvent(new page.w.Event('blur'));
  assert.deepEqual(committed, ['新名'], 'nothing while an input method composes, Enter or the field left');
  field.value = '新名你';
  field.dispatchEvent(new page.w.CompositionEvent('compositionend'));
  assert.deepEqual(committed, ['新名', '新名你'], 'left while it composed: committed as the composition ends');
  field.dispatchEvent(new page.w.CompositionEvent('compositionstart'));
  field.dispatchEvent(new page.w.CompositionEvent('compositionend'));
  key(field, { key: 'Enter', keyCode: 229 });
  assert.equal(committed.length, 2, 'the Enter that ends a composition (Safari\'s, keyCode 229) commits nothing');
  field.focus();
  field.value = '打错了';
  key(field, { key: 'Escape' });
  assert.equal(field.value, '新名你', 'Escape puts back what was committed');
  field.focus();
  field.value = '正在打';
  handle.set('文件里的');
  assert.deepEqual([field.value, handle.value], ['正在打', '文件里的'], 'a value set from the file while the reader types: their words stay');
  field.blur();
  handle.set('文件里的');
  assert.equal(field.value, '文件里的', 'shown once they are not typing');
  const note = document.getElementById('note');
  const notes = [];
  DocKit.input(note, { commit: (value) => notes.push(value) });
  note.value = '一\n二';
  key(note, { key: 'Enter' });
  key(note, { key: 'Enter', ctrlKey: true });
  assert.deepEqual(notes, ['一\n二'], 'in a textarea Enter is a line, Ctrl+Enter commits');
  const pick = document.getElementById('pick');
  const picked = [];
  DocKit.input(pick, { commit: (value) => picked.push(value) });
  pick.value = '乙';
  pick.dispatchEvent(new page.w.Event('change'));
  assert.deepEqual(picked, ['乙'], 'a select commits as it changes');
  page.dom.window.close();
}

// DocKit.drag: a press that moves past the threshold drags, a marker where it would drop, a release over
// a spot drops once, Escape gives it up, and the click a drag's release makes is none.
{
  const page = environment('<ol id="list"><li class="item" id="one">一</li><li class="item" id="two">二</li></ol>');
  const { DocKit, document } = page.w;
  page.w.Element.prototype.setPointerCapture = function () {};
  const list = document.getElementById('list');
  const marker = document.createElement('li');
  marker.className = 'marker';
  const dropped = [];
  let clicks = 0;
  list.addEventListener('click', () => { clicks += 1; });
  const handle = DocKit.drag(list, {
    items: '.item',
    marker,
    over: (x, y, item) => (x < 0 ? null : { into: list, before: y > 50 ? null : document.getElementById('one'), item }),
    drop: (item, spot) => dropped.push([item.id, spot.before?.id ?? 'end']),
  });
  const pointer = (type, target, x, y) => target.dispatchEvent(new page.w.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }));
  const PointerLike = (type, target, x, y) => {
    const event = new page.w.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.defineProperty(event, 'pointerId', { value: 1 });
    target.dispatchEvent(event);
  };
  const two = document.getElementById('two');
  PointerLike('pointerdown', two, 10, 10);
  PointerLike('pointermove', two, 12, 11);
  assert.ok(!two.classList.contains('doc-dragging') && !marker.isConnected, 'a move under the threshold is no drag');
  PointerLike('pointermove', two, 10, 30);
  assert.ok(two.classList.contains('doc-dragging') && marker.nextElementSibling?.id === 'one' && handle.dragging, 'past it: dragging, the marker where it would drop');
  PointerLike('pointerup', two, 10, 60);
  pointer('click', two, 10, 60);
  assert.deepEqual(dropped, [['two', 'end']], 'released over a spot: dropped there, once');
  assert.ok(!two.classList.contains('doc-dragging') && !marker.isConnected && clicks === 0, 'its marks off, and the click its release made none');
  PointerLike('pointerdown', two, 10, 10);
  PointerLike('pointermove', two, 10, 40);
  page.w.dispatchEvent(new page.w.KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
  PointerLike('pointerup', two, 10, 60);
  assert.equal(dropped.length, 1, 'Escape gives it up: nothing dropped');
  PointerLike('pointerdown', two, 10, 10);
  PointerLike('pointermove', two, -5, 40);
  PointerLike('pointerup', two, -5, 40);
  assert.ok(dropped.length === 1 && !marker.isConnected, 'released over no spot: nothing');
  await new Promise((resolve) => page.w.setTimeout(resolve, 0)); // a moment after a drag's release, as a reader's next press is
  PointerLike('pointerdown', two, 10, 10);
  PointerLike('pointerup', two, 10, 10);
  pointer('click', two, 10, 10);
  assert.equal(clicks, 1, 'a press that never moved is a press');
  page.dom.window.close();
}

// skills/gallery/sdk/doc-kit.d.ts declares what the kit holds, and what a component is given.
{
  const sdk = await fs.readFile(new URL('../../skills/gallery/sdk/doc-kit.d.ts', import.meta.url), 'utf8');
  // Each member once, an overloaded one (listen) by its several signatures.
  const members = (name) => [...new Set([...new RegExp(`export interface ${name} \\{([\\s\\S]*?)\\n\\}`).exec(sdk)[1].matchAll(/^  (?:readonly )?(\w+)[(<?:]/gm)].map((found) => found[1]))].sort();
  const page = environment('<div data-doc-component="local/x" data-block-id="b"></div>');
  const { DocKit } = page.w;
  assert.deepEqual(Object.keys(DocKit).sort(), members('DocKitApi'), 'DocKit holds what sdk/doc-kit.d.ts declares');
  let given;
  // A package whose manifest's needs hold "workspace" and a host of the net (as the catalog describes it) has every member, context.workspace and context.fetch among them.
  DocKit.describe({ id: 'local/x', match: '[data-doc-component="local/x"]', parts: {}, needs: ['workspace', 'net:api.example.com'] });
  DocKit.component({ id: 'local/x', mount(host, context) { given = context; } });
  await started(page);
  assert.deepEqual(Object.keys(given).sort(), members('DocComponentContext'), 'and a context what it declares (fetch: its needs name a host of the net)');
  assert.deepEqual(Object.keys(given.workspace).sort(), members('DocWorkspace'), 'its workspace what DocWorkspace declares (setTodo among them, in a document)');
  const refusal = await given.workspace.query('table', { slug: 'a', key: 'k' }).catch((error) => error.code);
  const unknown = await given.workspace.query('nope').catch((error) => error.code);
  assert.deepEqual([refusal, unknown], ['offline', 'kind'], 'table asked like any kind (no address of a server here: offline), a kind it does not know refused before anything is asked');
  assert.deepEqual(Object.keys(DocKit.stats()).sort(), members('DocKitStats'));
  page.dom.window.close();
  // A block whose needs name no host of the net has no fetch.
  const plain = environment('<div data-doc-component="local/y" data-block-id="c"></div>');
  let without;
  plain.w.DocKit.describe({ id: 'local/y', match: '[data-doc-component="local/y"]', parts: {}, needs: ['workspace'] });
  plain.w.DocKit.component({ id: 'local/y', mount(host, context) { without = context; } });
  await started(plain);
  assert.deepEqual(Object.keys(without).sort(), members('DocComponentContext').filter((name) => name !== 'fetch'), 'no fetch for a block that names no host');
  plain.dom.window.close();
}
{
  // One whose needs hold no "workspace": no context.workspace at all.
  const page = environment('<div data-doc-component="local/y" data-block-id="b"></div>');
  const { DocKit } = page.w;
  let given;
  DocKit.describe({ id: 'local/y', match: '[data-doc-component="local/y"]', parts: {} });
  DocKit.component({ id: 'local/y', mount(host, context) { given = context; } });
  await started(page);
  assert.ok(!('workspace' in given), 'no workspace for a block that does not need it');
  page.dom.window.close();
}
{
  // An export (its generator says so): query refuses, offline, and open does nothing.
  const page = environment('<div data-doc-component="local/z" data-block-id="b"></div>', '<meta name="generator" content="Gallery">');
  const { DocKit } = page.w;
  let given;
  DocKit.describe({ id: 'local/z', match: '[data-doc-component="local/z"]', parts: {}, needs: ['workspace'] });
  DocKit.component({ id: 'local/z', mount(host, context) { given = context; } });
  await started(page);
  assert.equal(given.place, 'export');
  assert.equal(await given.workspace.query('todos').catch((error) => error.code), 'offline', 'an export with no snapshot: query refused, offline');
  assert.equal(given.workspace.open({ slug: 'a' }), undefined, 'and open nothing');
  assert.ok(!('setTodo' in given.workspace), 'and no setTodo: a block draws its boxes read-only');
  page.dom.window.close();
}
{
  // An export whose snapshot holds the workspace: each kind answered from it as the server
  // answers, its options applied, `at` the export's time; a table's rows filtered by their cells' words, which
  // no row it gives carries; a kind it holds none of offline.
  const snapshot = {
    todos: [
      { ref: { slug: 'a', block: null, text: '一', path: [], nth: 0, version: '0123456789abcdef' }, text: '一', done: false, slug: 'a', title: 'A', path: [] },
      { ref: { slug: 'a', block: 'x1', text: '二', path: [], nth: 0, version: '0123456789abcdef' }, text: '二', done: true, slug: 'a', title: 'A', path: [] },
      { ref: { slug: 'b', block: null, text: '三', path: [], nth: 0, version: 'fedcba9876543210' }, text: '三', done: false, slug: 'b', title: 'B', path: [] },
    ],
    recent: [{ slug: 'a', title: 'A', icon: null, edited: '2026-11-07T00:00:00.000Z' }, { slug: 'b', title: 'B', icon: null, edited: '2026-11-06T00:00:00.000Z' }],
    activity: [{ date: '2026-11-06', edits: 1, words: 3 }, { date: '2026-11-07', edits: 2, words: 5 }],
    tables: { 'a#q4': { columns: ['任务', '负责人', '工时'], rows: [
      { values: { 任务: '写', 负责人: '我', 工时: 1200 }, links: [], words: { 任务: '写', 负责人: '我', 工时: '1,200' } },
      { values: { 任务: '读', 负责人: '他', 工时: 3 }, links: [], words: { 任务: '读', 负责人: '他', 工时: '3' } },
    ], total: 2 } },
    document: { slug: 'a', title: 'A', icon: null, created: '2026-11-01T08:00:00.000Z', edited: '2026-11-07T00:00:00.000Z', words: 12 },
  };
  const tag = `<script type="application/json" data-doc-snapshot data-at="2026-11-08T10:00:00.000Z">${JSON.stringify(snapshot)}</script>`;
  const page = environment('<main class="doc-page" data-doc-id="a"><div data-doc-component="local/s" data-block-id="b"></div></main>', `<meta name="generator" content="Gallery">${tag}`);
  const { DocKit } = page.w;
  let given;
  DocKit.describe({ id: 'local/s', match: '[data-doc-component="local/s"]', parts: {}, needs: ['workspace'] });
  DocKit.component({ id: 'local/s', mount(host, context) { given = context; } });
  await started(page);
  const ask = (kind, options) => given.workspace.query(kind, options).then(({ data, at }) => JSON.parse(JSON.stringify({ data, at })), (error) => error.code); // the page's objects, of its own realm
  const open = await ask('todos', { done: false });
  assert.deepEqual([open.data.map((todo) => todo.text), open.at], [['一', '三'], '2026-11-08T10:00:00.000Z'], 'to-dos from the snapshot, done: false applied, at the export\'s time');
  assert.deepEqual((await ask('todos', { slugs: ['b'] })).data.map((todo) => todo.text), ['三'], 'slugs applied');
  assert.deepEqual((await ask('recent', { limit: 1 })).data.map((one) => one.slug), ['a'], 'recent, its limit applied');
  assert.deepEqual((await ask('activity', { days: 1 })).data.map((day) => day.date), ['2026-11-07'], 'the last days');
  const mine = await ask('table', { slug: 'a', key: 'q4', where: { 负责人: '我' } });
  assert.deepEqual(mine.data, { columns: ['任务', '负责人', '工时'], rows: [{ values: { 任务: '写', 负责人: '我', 工时: 1200 }, links: [] }], total: 1 }, 'a table from the snapshot, where applied, the rows as the server gives them');
  assert.equal((await ask('table', { slug: 'a', key: 'q4', where: { 工时: '1,200' } })).data.total, 1, 'by the words as written, as the server filters');
  assert.deepEqual([await ask('stats'), await ask('table', { slug: 'a', key: 'zz' }), await ask('table', { slug: 'a' })], ['offline', 'offline', 'options'], 'a kind or a table it holds none of offline; options still checked');
  assert.deepEqual((await ask('document')).data, snapshot.document, 'document: the exported document\'s own facts, the instance\'s document where the block names none');
  assert.deepEqual([(await ask('document', { slug: 'a' })).data.created, await ask('document', { slug: 'b' })], ['2026-11-01T08:00:00.000Z', 'offline'], 'named: its own; another document\'s the export holds none of');
  page.dom.window.close();
}
{
  // setTodo: asked of whoever shows the page (TODO_EVENT, cancelable, { ask, answer }),
  // resolving to whether it changed the document; a refusal its code (TODO_CODES); none to answer offline;
  // a ref that is not one refused before anything is asked.
  const page = environment('<div data-doc-component="local/t" data-block-id="b"></div>');
  const { DocKit } = page.w;
  let given;
  DocKit.describe({ id: 'local/t', match: '[data-doc-component="local/t"]', parts: {}, needs: ['workspace'] });
  DocKit.component({ id: 'local/t', mount(host, context) { given = context; } });
  await started(page);
  const ref = { slug: 'plan', block: null, text: '写周报', path: ['本周'], nth: 0, version: '0123456789abcdef' };
  const set = (one, done) => given.workspace.setTodo(one, done).then((changed) => ['changed', changed], (error) => error.code);
  assert.equal(await set(ref, true), 'offline', 'nothing on the page answers: offline');
  const heard = [];
  const answers = [];
  page.w.addEventListener(TODO_EVENT, (event) => {
    heard.push(event.detail.ask);
    event.preventDefault();
    event.detail.answer(Promise.resolve(answers.shift()));
  });
  const outcomes = [];
  for (const answer of [{ ok: true, changed: true, block: 'n1' }, { ok: true, changed: false }, { ok: false, reason: 'changed' }, { ok: false, reason: 'ambiguous' }, { ok: false, reason: 'busy' }, { ok: false, reason: 'offline' }, { ok: false, reason: 'token' }]) {
    answers.push(answer);
    outcomes.push(await set(ref, true));
  }
  assert.deepEqual(outcomes, [['changed', true], ['changed', false], 'changed', 'ambiguous', 'busy', 'offline', 'failed'], 'resolves to whether it changed the document; refusals their codes, another reason "failed"');
  assert.ok(outcomes.filter((code) => typeof code === 'string').every((code) => TODO_CODES.includes(code)), 'never a code but TODO_CODES');
  assert.deepEqual(JSON.parse(JSON.stringify(heard[0])), { slug: 'plan', ref, done: true }, 'asked { slug, ref, done }');
  const before = heard.length;
  assert.deepEqual([await set({ ...ref, nth: -1 }, true), await set(ref, 'yes'), await set({ slug: 'plan' }, true)], ['ref', 'ref', 'ref'], 'not a ref, or done no boolean: refused');
  assert.equal(heard.length, before, 'and nothing asked');
  page.dom.window.close();
}
{
  // A page the server serves (its address there): the server's refusals of the query itself passed on as it
  // says them (kind, options, unsupported); anything else it answers (a read that failed, 500 "read";
  // another host, 403 "host"; no JSON) "failed"; no answer "offline": one of QUERY_CODES and never another.
  const page = environment('<div data-doc-component="local/v" data-block-id="b"></div>');
  const { DocKit } = page.w;
  page.w.__galleryWorkspace = '/__gallery/workspace/query';
  const answers = [];
  const asked = [];
  page.w.fetch = async (address) => {
    asked.push(address);
    const next = answers.shift();
    if (next === null) throw new TypeError('Failed to fetch');
    return { status: next.status, json: async () => { if (next.body === undefined) throw new SyntaxError('no JSON'); return next.body; } };
  };
  let given;
  DocKit.describe({ id: 'local/v', match: '[data-doc-component="local/v"]', parts: {}, needs: ['workspace'] });
  DocKit.component({ id: 'local/v', mount(host, context) { given = context; } });
  await started(page);
  const outcome = (answer) => {
    answers.push(answer);
    return given.workspace.query('todos', { done: false }).then(({ data }) => ['data', data], (error) => error.code);
  };
  const outcomes = [];
  for (const answer of [
    { status: 200, body: { ok: true, kind: 'todos', data: [], at: '2026-11-08T00:00:00.000Z' } },
    { status: 400, body: { ok: false, reason: 'options', message: 'todos: done is true or false' } },
    { status: 400, body: { ok: false, reason: 'kind', message: 'no kind' } },
    { status: 500, body: { ok: false, reason: 'read', message: 'EBUSY' } },
    { status: 403, body: { ok: false, reason: 'host' } },
    { status: 502 },
    { status: 200, body: { ok: false } },
    null,
  ]) outcomes.push(await outcome(answer));
  assert.deepEqual(outcomes, [['data', []], 'options', 'kind', 'failed', 'failed', 'failed', 'failed', 'offline'], 'the server\'s refusals of the query as it says them, any other answer that is not one "failed", none "offline"');
  assert.ok(outcomes.filter((code) => typeof code === 'string').every((code) => QUERY_CODES.includes(code)), 'never a code but QUERY_CODES');
  assert.equal(asked[0], '/__gallery/workspace/query?kind=todos&options=%7B%22done%22%3Afalse%7D', 'asked at the page\'s address');
  answers.push({ status: 404, body: { ok: false, reason: 'missing', message: 'no document "report"' } });
  assert.equal(await given.workspace.query('document').catch((error) => error.code), 'missing', 'document: no such document, missing');
  assert.equal(asked.at(-1), '/__gallery/workspace/query?kind=document&options=%7B%7D', 'on a page of no document (no .doc-page): no slug filled in, the server says what is wrong');
  page.dom.window.close();
}
{
  // document (a document's own facts): asked of the instance's own document where the block names none.
  const page = environment('<main class="doc-page" data-doc-id="plan"><div data-doc-component="local/d" data-block-id="b"></div></main>');
  const { DocKit } = page.w;
  page.w.__galleryWorkspace = '/__gallery/workspace/query';
  const asked = [];
  page.w.fetch = async (address) => {
    asked.push(address);
    return { status: 200, json: async () => ({ ok: true, kind: 'document', data: { slug: 'plan' }, at: '2026-11-08T00:00:00.000Z' }) };
  };
  let given;
  DocKit.describe({ id: 'local/d', match: '[data-doc-component="local/d"]', parts: {}, needs: ['workspace'] });
  DocKit.component({ id: 'local/d', mount(host, context) { given = context; } });
  await started(page);
  await given.workspace.query('document');
  await given.workspace.query('document', { slug: 'notes' });
  assert.deepEqual(asked.map((address) => decodeURIComponent(address.split('options=')[1])), ['{"slug":"plan"}', '{"slug":"notes"}'], 'its own document\'s slug filled in, one named kept');
  page.dom.window.close();
}
console.log("Checked the kit runtime: instances kept through moves, destroyed and started again when taken out and put back (the parts of a document's own type with what they hold), 100 rounds back to the same counts, a failing draw kept to its chart, Sheet docks with their areas, an embedded PDF shown through a blob: address, an export of the view taking what the kit left off the same every time, pictures opening large (which do, the viewer's size, its ways to close, the keyboard's way in, nothing while editing or printing, nothing written on the page but the marks that offer them to the keyboard).");
