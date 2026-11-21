import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { JSDOM } from "jsdom";
import { loadKitFile } from "../../src/render/kit-build.mjs";
import { KIT_LANGUAGES, STYLE_WORDS, UI_LANGUAGE, kitLanguage, kitWords, wordIn, wordsCss } from "../../src/render/kit/words.js";
import { FLOW_LABEL, isFlowLabel } from "../../src/shared/components/list.mjs";
import { languageScript } from "../../src/shared/i18n/index.mjs";
import en from "../../src/shared/i18n/en.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { KEYS, OLD_KEYS } from "../../src/shared/renamed-storage.mjs";

// The kit's own words (src/render/kit/words.js): its chrome in Chinese and English, the UI's language
// while Gallery shows the page (data-ge-language, which the preview server's first script sets as the
// UI's modules read the language), the page's lang in a file of its own. Each word has both, filling the
// same {0}, {1}…; each word a kit script, the chart reasons (src/shared/table-chart.mjs) or a stylesheet
// says is in the part its bundle carries, and each word is said somewhere.

const HAN = /[　-〿一-鿿＀-￯]/;
const placeholders = (text) => [...text.matchAll(/\{(\d+)\}/g)].map((match) => match[1]).sort().join(",");
const read = (file) => fs.readFileSync(path.join(projectRoot, file), "utf8");
const parts = kitWords();

// ---------- the table: every key in Chinese and English ----------
const partOf = new Map();
for (const [part, table] of Object.entries(parts)) {
  for (const [key, entry] of Object.entries(table)) {
    assert.ok(!partOf.has(key), `"${key}" is a word of one part only (${partOf.get(key)}, ${part})`);
    partOf.set(key, part);
    assert.deepEqual(Object.keys(entry).sort(), [...KIT_LANGUAGES].sort(), `"${key}": zh and en`);
    for (const language of KIT_LANGUAGES) assert.ok(typeof entry[language] === "string" && entry[language].trim() !== "", `"${key}" in ${language}`);
    assert.ok(HAN.test(entry.zh) && !HAN.test(entry.en), `"${key}": Chinese in zh, none in en`);
    assert.equal(placeholders(entry.zh), placeholders(entry.en), `"${key}": the same {0}, {1}… in both`);
  }
}
assert.ok(partOf.size > 30, "the kit's words were found");
assert.deepEqual(parts.runtime.flowchart, FLOW_LABEL, "a flowchart's name is the shared one the page editor knows as the kit's");
assert.ok(Object.values(FLOW_LABEL).every(isFlowLabel) && !isFlowLabel("上线流程"), "either language's name is the kit's, an author's is not");
assert.deepEqual(Object.keys(parts.lists).sort(), ["todo-done", "todo-open"], "the lists' words: what a to-do item's box says, no more");
assert.equal(wordIn(parts.code, "en", "lines", "3", "12"), "Lines 3–12", "values filled in");
assert.equal(wordIn(parts.code, "zh", "lines", "3", "12"), "第 3–12 行");
assert.deepEqual(Object.keys(parts.charts).sort(), ["merged-cells", "table-gone"], "the charts' words: why a chart drawn from a table drew nothing, no more");
assert.deepEqual(parts.math["math-invalid"], { zh: "无效的公式", en: en["无效的公式"] }, "a formula KaTeX could not read: the page editor's words for it, in both languages");
assert.throws(() => wordIn(parts.code, "zh", "legend"), /no word "legend"/, "a part says its own words only");

// ---------- each word said is in its part, and each word is said ----------
{
  const said = new Map(Object.keys(parts).map((part) => [part, new Set()]));
  const SAYERS = { sayRuntime: "runtime", sayCode: "code", sayDisplay: "display", sayTables: "tables", sayCharts: "charts" };
  // The keys of a call's first argument (a literal, a ternary of literals, `theme-${…}`).
  const firstArgument = (text, at) => {
    let depth = 0;
    for (let index = at; index < text.length; index++) {
      const char = text[index];
      if ("([{".includes(char)) depth++;
      else if (")]}".includes(char)) { if (depth === 0) return text.slice(at, index); depth--; }
      else if (char === "," && depth === 0) return text.slice(at, index);
    }
    return "";
  };
  const kitDirectory = path.join(projectRoot, "src", "render", "kit");
  const files = [];
  (function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(js|ts)$/.test(entry.name) && entry.name !== "words.js") files.push(full);
    }
  })(kitDirectory);
  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const imported = /import \{ (say\w+) as say \} from ["'][./]+words\.js["']/.exec(text)?.[1];
    if (!imported) {
      assert.ok(!/\bsay\w*\(/.test(text.replace(/\/\/.*$/gm, "")) || !/words\.js/.test(text), `${path.relative(projectRoot, file)}: says words only through its part's say`);
      continue;
    }
    const part = SAYERS[imported];
    for (const match of text.matchAll(/\bsay\(/g)) {
      const argument = firstArgument(text, match.index + 4);
      if (argument.startsWith("...")) continue; // a chart's reason, [key, ...values]: below
      const keys = [...argument.matchAll(/(?<!={2,3}\s*)["'`]([a-z][a-z-]*)(?:\$\{[^}]*\})?["'`]/g)].map((each) => each[1]); // not what a condition compares with
      const templated = /`([a-z-]+)\$\{/.exec(argument)?.[1];
      const named = templated ? Object.keys(parts[part]).filter((key) => key.startsWith(templated)) : keys;
      assert.ok(named.length > 0, `${path.relative(projectRoot, file)}: say(${argument}) names its word`);
      for (const key of named) {
        assert.ok(Object.hasOwn(parts[part], key), `${path.relative(projectRoot, file)}: "${key}" is a word of its part (${part})`);
        said.get(part).add(key);
      }
    }
    // A chart's line of why it drew nothing: [key, ...values].
    for (const match of text.matchAll(/message: \["([a-z-]+)"/g)) said.get(part).add(match[1]);
  }
  // The reason a table gives a chart nothing to draw (fail(error, key, ...values)), said by from-table.js.
  const reasons = [...read("src/shared/table-chart.mjs").matchAll(/return fail\(.*, "([a-z][a-z-]*)"(?:, [\w.()]+)?\);/g)].map((match) => match[1]);
  assert.ok(reasons.length >= 1, "the chart reasons were found");
  for (const key of reasons) {
    assert.ok(Object.hasOwn(parts.charts, key), `table-chart.mjs: "${key}" is a word of the charts' part`);
    said.get("charts").add(key);
  }
  // The stylesheet's words: shown where report.css asks for them.
  const css = await loadKitFile("report.css");
  for (const [key, property] of Object.entries(STYLE_WORDS)) {
    assert.ok(["code", "lists", "math"].includes(partOf.get(key)) && property.startsWith("--doc-word-") && css.includes(`var(${property})`), `the stylesheet shows "${key}"`);
    said.get(partOf.get(key)).add(key);
  }
  assert.ok(css.includes(wordsCss()) && !css.includes("@kit-words"), "report.css holds the words' properties, written from the table");
  assert.ok(!/content:\s*"[^"]*[一-鿿]/.test(css.replace(/\/\*[\s\S]*?\*\//g, "").replace(wordsCss(), "")), "no Chinese of the kit's in a stylesheet's content but the table's");
  said.get("runtime").add("flowchart"); // sayRuntime("flowchart"): runtime/flowchart.js
  for (const [part, table] of Object.entries(parts)) {
    const unsaid = Object.keys(table).filter((key) => !said.get(part).has(key));
    assert.deepEqual(unsaid, [], `words of ${part} nothing says (words.js)`);
  }
}

// ---------- which language a page reads them in ----------
{
  const rootOf = (attributes) => new JSDOM(`<!doctype html><html ${attributes}><body></body></html>`).window.document.documentElement;
  const cases = [
    ["", "zh", "no lang, not in Gallery: Chinese"],
    ['lang="zh-CN"', "zh", "a Chinese file"],
    ['lang="en"', "en", "an English file"],
    ['lang="EN-gb"', "en", "en-… in any case"],
    ['lang="fr"', "zh", "another language: Chinese"],
    ['lang="english"', "zh", "a lang that is not en"],
    [`lang="zh-CN" ${UI_LANGUAGE}="en"`, "en", "Gallery's UI in English, a Chinese report"],
    [`lang="en" ${UI_LANGUAGE}="zh"`, "zh", "Gallery's UI in Chinese, an English report"],
  ];
  for (const [attributes, expected, why] of cases) assert.equal(kitLanguage(rootOf(attributes)), expected, why);
  assert.equal(kitLanguage(null), "zh", "no page: Chinese");
}

// ---------- the kit's scripts speak it: a code block, the display settings, a flowchart ----------
{
  const sources = Object.fromEntries(await Promise.all(["runtime", "state", "tokens", "code", "ui"].map(async (name) => [name, await loadKitFile(`${name}.js`)])));
  const page = async (attributes) => {
    const dom = new JSDOM(`<!doctype html><html ${attributes}><head></head><body><main class="doc-page" data-doc-id="words">
      <div class="doc-code" data-line-start="5"><div class="doc-code-title"></div><pre><code>a\nb</code></pre></div>
      <ol class="doc-flow"><li>一</li><li>二</li></ol></main></body></html>`, { url: "https://report.test/words.html", runScripts: "outside-only" });
    const w = dom.window;
    w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    w.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
    w.requestAnimationFrame = () => 0;
    w.cancelAnimationFrame = () => {};
    for (const name of ["runtime", "state", "tokens", "code", "ui"]) w.eval(sources[name]);
    // The kit starts what the page holds once it has loaded.
    if (w.document.readyState === "loading") await new Promise((resolve) => w.document.addEventListener("DOMContentLoaded", resolve, { once: true }));
    const query = (selector) => w.document.querySelector(selector);
    const said = {
      fold: query(".doc-code-fold")?.getAttribute("aria-label"),
      copy: query(".doc-code-copy")?.getAttribute("aria-label"),
      range: query(".doc-code-range")?.textContent,
      language: query(".doc-code-language")?.textContent,
      display: query(".doc-display-button")?.getAttribute("aria-label"),
      header: query(".doc-display-header")?.textContent,
      flowchart: query("ol.doc-flow")?.getAttribute("aria-label"),
    };
    dom.window.close();
    return said;
  };
  const zh = { fold: "折叠或展开代码块", copy: "复制代码", range: "第 5–6 行", language: "纯文本", display: "显示设置", header: "外观", flowchart: "流程图" };
  const en = { fold: "Collapse or expand the code block", copy: "Copy code", range: "Lines 5–6", language: "Plain text", display: "Display settings", header: "Appearance", flowchart: "Flowchart" };
  assert.deepEqual(await page('lang="zh-CN"'), zh, "a Chinese file: Chinese");
  assert.deepEqual(await page('lang="en"'), en, "an English file: English");
  assert.deepEqual(await page(`lang="zh-CN" ${UI_LANGUAGE}="en"`), en, "Gallery in English: English, whatever the document's lang");
  assert.deepEqual(await page(`lang="en" ${UI_LANGUAGE}="zh"`), zh, "Gallery in Chinese: Chinese");
}

// ---------- Gallery's first script: the UI's language on the root, as the UI's modules read it ----------
{
  const run = ({ kept = {}, browser = "en-US" } = {}) => {
    const dom = new JSDOM(`<!doctype html><html><head><script>${languageScript()}</script></head><body></body></html>`, {
      url: "https://gallery.test/generated/words.html",
      runScripts: "dangerously",
      beforeParse(window) {
        for (const [key, value] of Object.entries(kept)) window.localStorage.setItem(key, value);
        Object.defineProperty(window.navigator, "language", { value: browser });
      },
    });
    const { document } = dom.window;
    const result = { language: document.documentElement.getAttribute(UI_LANGUAGE), scripts: document.querySelectorAll("script").length };
    dom.window.close();
    return result;
  };
  assert.deepEqual(run({ browser: "zh-CN" }), { language: "zh", scripts: 0 }, "nothing chosen: the browser's language, Chinese; the script gone");
  assert.equal(run({ browser: "en-US" }).language, "en", "nothing chosen, an English browser: English");
  assert.equal(run({ kept: { [KEYS.language]: "en" }, browser: "zh-CN" }).language, "en", "English chosen");
  assert.equal(run({ kept: { [KEYS.language]: "zh" }, browser: "en-US" }).language, "zh", "Chinese chosen");
  assert.equal(run({ kept: { [OLD_KEYS.language]: "en" }, browser: "zh-CN" }).language, "en", "chosen under the old name");
  assert.equal(run({ kept: { [KEYS.language]: "fr" }, browser: "zh-CN" }).language, "zh", "no language of the UI's: the browser's");
}

console.log(`Checked the kit's own words: ${partOf.size} in Chinese and English (the same placeholders) in ${Object.keys(parts).length} parts, each a script, a chart's reason or the stylesheet says in its bundle's part and none left unsaid; spoken in the UI's language when Gallery shows the page (data-ge-language, set first as the UI reads it) and in the page's lang in a file of its own (en: English, else Chinese).`);
