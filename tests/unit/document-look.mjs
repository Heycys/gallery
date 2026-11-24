import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import { loadKitFile } from "../../src/render/kit-build.mjs";
import { GAP_TOKENS, TEXT_TOKENS, lookCss, lookTokens, tokenValues } from "../../src/render/look-css.mjs";
import { renderReportHtml } from "../../src/render/report-html.mjs";
import { componentOf } from "../../src/shared/components/index.mjs";
import { LOOK, LOOK_ATTRIBUTES, SERIF_FONT, SIZE_FACTOR, WIDTH, effectiveLook, fullLook, lookOf, lookOfElement, lookOfWord, lookWord, ownLookFor, ownLookOf, sameLook, setLookOn, updatedOwnLook, withLook, withLookField } from "../../src/shared/document-look.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { told } from "../../src/shared/i18n/index.mjs";
import { documentLook, ownLookAt, workspaceLook, writeWorkspaceLook } from "../../src/shared/workspace-look.mjs";

// A document's look (字体与布局, src/shared/document-look.mjs, docs/render.md "A document's look"): kept
// in doc.json as `look`, each default left out; put on the page's <html> by the render (the preview, a
// build, an export alike), never in doc.html; the kit's tokens given other values by rules of those
// attributes (render/look-css.mjs, @kit-look; in tokens.css), none of which applies to a document
// without a look.

// What a look is: its known choices that are not the default.
assert.deepEqual(Object.keys(LOOK), ["font", "size", "spacing", "width", "full", "tables", "databases"]);
assert.deepEqual(LOOK_ATTRIBUTES, { font: "data-doc-font", size: "data-doc-size", spacing: "data-doc-spacing", width: "data-doc-measure", full: "data-doc-width", tables: "data-doc-tables", databases: "data-doc-databases" }, "正文宽度's is data-doc-measure; 全宽 is the kit's one data-doc-width, the reader's display menu's too; 宽表格 data-doc-tables, 宽多维表格 data-doc-databases");
assert.deepEqual(LOOK.full, ["default", "full"]);
// 宽表格 (2026-11-20): off unless doc.json says "wide"; a choice of its own beside 全宽.
assert.deepEqual(LOOK.tables, ["default", "wide"]);
// 宽多维表格 (2026-11-23): the same, for a 多维表格.
assert.deepEqual(LOOK.databases, ["default", "wide"]);
assert.deepEqual(lookOf({ databases: "wide", tables: "wide" }), { tables: "wide", databases: "wide" });
assert.equal(withLook('<html lang="zh">', { databases: "wide" }), '<html lang="zh" data-doc-databases="wide">');
assert.deepEqual(lookOf({ tables: "wide", full: "full" }), { full: "full", tables: "wide" });
assert.deepEqual(lookOf({ tables: "default" }), {});
assert.deepEqual(lookOf({ tables: true }), {}, "a value of another kind is the default");
assert.deepEqual(ownLookFor({}, { tables: "wide" }), { tables: "default" }, "off over a workspace's: kept as an explicit default");
assert.equal(withLook('<html lang="zh">', { tables: "wide" }), '<html lang="zh" data-doc-tables="wide">');
assert.equal(withLook('<html lang="zh" data-doc-tables="wide">', {}), '<html lang="zh">', "a file's own attribute is no look's: doc.json's alone");
assert.deepEqual(lookOf({ full: "full", width: "narrow" }), { width: "narrow", full: "full" }, "全宽 is a choice of its own beside 正文宽度: neither takes the other away");
assert.deepEqual(lookOf({ full: "default" }), {});
assert.deepEqual(lookOf({ full: "wide" }), {}, "a value it does not know is the default");
assert.deepEqual(lookOf({ full: true }), {}, "a value of another kind is the default");
assert.deepEqual(lookOf({ font: "serif", size: "default", spacing: "loose", width: "huge", other: 1 }), { font: "serif", spacing: "loose" });
for (const value of [null, undefined, "serif", ["serif"], 3]) assert.deepEqual(lookOf(value), {});
assert.deepEqual(fullLook({ size: "small" }), { font: "sans", size: "small", spacing: "default", width: "default", full: "default", tables: "default", databases: "default" });
assert.ok(sameLook({ font: "serif", size: "default" }, { font: "serif" }) && !sameLook({ font: "serif" }, {}));
assert.equal(lookWord({ font: "mixed", width: "wide" }), "font=mixed&width=wide");
assert.equal(lookWord({}), "");
assert.equal(lookWord({ width: "narrow", full: "full" }), "width=narrow&full=full");
assert.deepEqual(lookOfWord("width=narrow&full=full"), { width: "narrow", full: "full" });
assert.deepEqual(lookOfWord("font=mixed&width=wide&size=nope"), { font: "mixed", width: "wide" });
assert.deepEqual(lookOfWord(""), {});

// A document's own look (doc.json's): its known choices, a default too (默认 chosen over the workspace's default look).
assert.deepEqual(ownLookOf({ font: "sans", size: "default", spacing: "loose", width: "huge", other: 1 }), { font: "sans", size: "default", spacing: "loose" });
for (const value of [null, undefined, "serif", ["serif"], 3]) assert.deepEqual(ownLookOf(value), {});
// The look a document shows, choice by choice: its own, else the workspace's, else the default.
assert.deepEqual(effectiveLook(null, {}), {});
assert.deepEqual(effectiveLook(null, { size: "large", font: "serif" }), { font: "serif", size: "large" }, "none of its own: the workspace's whole");
assert.deepEqual(effectiveLook({ width: "narrow" }, { size: "large" }), { size: "large", width: "narrow" }, "its own beside the workspace's");
assert.deepEqual(effectiveLook({ size: "default", font: "mixed" }, { size: "large", font: "serif" }), { font: "mixed" }, "an explicit default over the workspace's: the default shown");
assert.deepEqual(effectiveLook({ size: "huge" }, { size: "small" }), { size: "small" }, "a value it does not know: the workspace's");
assert.deepEqual(effectiveLook({ full: "full" }, { width: "narrow" }), { width: "narrow", full: "full" }, "全宽 of its own beside the workspace's 正文宽度: both kept (全宽 wins on the page)");
assert.deepEqual(effectiveLook({ full: "default" }, { full: "full" }), {}, "全宽 switched off on a document while the workspace's is on: the default shown");
assert.deepEqual(effectiveLook(null, { full: "full" }), { full: "full" }, "none of its own: the workspace's 全宽");
// What doc.json keeps to show a look under the workspace's: each choice that is not the workspace's, a default too.
assert.deepEqual(ownLookFor({ font: "serif" }, {}), { font: "serif" });
assert.deepEqual(ownLookFor({}, { size: "large" }), { size: "default" }, "默认 over a workspace's 大号: kept as an explicit default");
assert.deepEqual(ownLookFor({ size: "large", font: "serif" }, { size: "large" }), { font: "serif" }, "a choice the workspace's makes too is left out");
assert.deepEqual(ownLookFor({ size: "large" }, { size: "large" }), {});
assert.deepEqual(ownLookFor({ full: "full" }, {}), { full: "full" }, "全宽 on: kept in doc.json");
assert.deepEqual(ownLookFor({}, { full: "full" }), { full: "default" }, "全宽 off over a workspace's: kept as an explicit default");
assert.deepEqual(ownLookFor({ full: "full" }, { full: "full" }), {}, "a 全宽 the workspace's makes too is left out");
assert.deepEqual(updatedOwnLook({ font: "serif", size: "default" }, { font: "serif" }, { font: "serif", width: "wide" }), { font: "serif", size: "default", width: "wide" }, "legacy full look preserves explicit choices whose displayed values are unchanged");
assert.deepEqual(updatedOwnLook({ font: "serif", size: "large" }, { font: "mixed" }, { font: "mixed", size: "large" }), { size: "large" }, "legacy full look can return a changed field to the inherited value");
for (const [look, workspace] of [[{ font: "mixed" }, { size: "small", width: "wide" }], [{}, { font: "serif" }], [{ spacing: "loose" }, {}]]) {
  assert.deepEqual(effectiveLook(ownLookFor(look, workspace), workspace), lookOf(look), "what is kept shows the look asked for");
}

// doc.json: the field set in its place, else last; gone when it makes no choice; an explicit default kept; the rest kept.
assert.deepEqual(Object.entries(withLookField({ title: "t", look: { font: "serif" }, type: "x" }, { size: "large" })), [["title", "t"], ["look", { size: "large" }], ["type", "x"]]);
assert.deepEqual(withLookField({ title: "t" }, { width: "narrow" }), { title: "t", look: { width: "narrow" } });
assert.deepEqual(withLookField({ title: "t", look: { font: "serif" } }, { font: "sans" }), { title: "t", look: { font: "sans" } }, "an explicit default is a choice of its own");
assert.deepEqual(withLookField({ title: "t", look: { font: "serif" } }, {}), { title: "t" });
assert.deepEqual(withLookField({ title: "t", look: { width: "narrow" } }, { width: "narrow", full: "full" }), { title: "t", look: { width: "narrow", full: "full" } }, "全宽 kept beside 正文宽度: the width it had is there when it is switched off");
assert.deepEqual(withLookField({ title: "t", look: { width: "narrow", full: "full" } }, { width: "narrow", full: "default" }), { title: "t", look: { width: "narrow", full: "default" } });
assert.deepEqual(withLookField({ title: "t" }, {}), { title: "t" });

// On <html>: the file's own look attributes taken off, doc.json's put on, nothing else touched.
assert.equal(withLook('<!doctype html>\n<html lang="zh-CN">\n<head>', { font: "serif", width: "wide" }), '<!doctype html>\n<html lang="zh-CN" data-doc-font="serif" data-doc-measure="wide">\n<head>');
assert.equal(withLook('<html data-doc-size="small" lang="en" data-doc-font=mixed><body>', {}), '<html lang="en"><body>');
assert.equal(withLook("<html><body>", { spacing: "compact" }), '<html data-doc-spacing="compact"><body>');
assert.equal(withLook("<p>no page</p>", { font: "serif" }), "<p>no page</p>");
assert.equal(withLook('<html lang="zh-CN">', { width: "narrow", full: "full" }), '<html lang="zh-CN" data-doc-measure="narrow" data-doc-width="full">', "全宽 on <html> as the kit's own data-doc-width, beside the width it overrides");
assert.equal(withLook('<html data-doc-width="full" lang="zh-CN">', {}), '<html lang="zh-CN">', "doc.json is 全宽's one home too: the file's own goes");
{
  const { window } = new JSDOM("<!doctype html><html></html>");
  const root = window.document.documentElement;
  assert.equal(setLookOn(root, { font: "mixed", size: "large" }), true);
  assert.deepEqual(lookOfElement(root), { font: "mixed", size: "large" });
  assert.equal(setLookOn(root, { size: "large", font: "mixed" }), false, "the same look changes nothing");
  assert.equal(setLookOn(root, { width: "narrow" }), true);
  assert.equal(root.outerHTML, '<html data-doc-measure="narrow"><head></head><body></body></html>');
  assert.equal(setLookOn(root, { width: "narrow", full: "full" }), true);
  assert.equal(root.outerHTML, '<html data-doc-measure="narrow" data-doc-width="full"><head></head><body></body></html>', "全宽 put on at once, the width left as it is");
  assert.deepEqual(lookOfElement(root), { width: "narrow", full: "full" });
  assert.equal(setLookOn(root, { width: "narrow" }), true);
  assert.equal(root.getAttribute("data-doc-width"), null, "全宽 off: the attribute gone, 正文宽度 as it was");
  assert.equal(root.getAttribute("data-doc-measure"), "narrow");
}
// A copy of the view keeps it (the page's state on <html>), and an import of one takes it off with the rest.
assert.ok(Object.values(LOOK_ATTRIBUTES).every((name) => componentOf("page").runtime.state.html.includes(name)));

// The kit's rules: worked out from tokens.css's values, in whole pixels.
const tokensCss = fs.readFileSync(path.join(projectRoot, "src/render/kit/styles/tokens.css"), "utf8");
assert.equal(tokensCss.split("\n@kit-look;\n").length, 2, "tokens.css says where the look's rules go, once");
const values = tokenValues(tokensCss);
assert.deepEqual(lookTokens(values, {}), {}, "the default gives no token another value");
assert.equal(values.get("--doc-content-max-width"), "712px");
// 正文宽度: fixed widths, the kit's 712px and those of 40 and 48 characters of the default 16px body text (as 712 is of 44), whatever the size.
assert.deepEqual(WIDTH, { default: 712, narrow: 648, wide: 776 });
assert.deepEqual([WIDTH.narrow, WIDTH.default, WIDTH.wide], [40.5 * 16, 44.5 * 16, 48.5 * 16], "40, 44 and 48 characters of 16px body text");
assert.deepEqual(lookTokens(values, { width: "narrow" }), { "--doc-content-max-width": "648px" });
assert.deepEqual(lookTokens(values, { width: "wide" }), { "--doc-content-max-width": "776px" });
for (const size of ["small", "large"]) {
  assert.equal(lookTokens(values, { size, width: "wide" })["--doc-content-max-width"], "776px", `${size}: 偏宽 the same 776px`);
  assert.equal(lookTokens(values, { size, spacing: "loose" })["--doc-content-max-width"], undefined, `${size}: 默认 正文宽度 the kit's 712px`);
}
// 字体大小: the type alone, every font size and its line height; no gap, no --doc-space, no width.
const small = lookTokens(values, { size: "small" });
assert.equal(small["--doc-body-font-size"], `${Math.round(16 * SIZE_FACTOR.small)}px`);
assert.deepEqual(Object.keys(small).sort(), TEXT_TOKENS.flat().sort(), "字体大小 gives the text's sizes and line heights, nothing else");
const large = lookTokens(values, { size: "large", spacing: "loose" });
const loose = lookTokens(values, { spacing: "loose" });
for (const [font, line] of TEXT_TOKENS) {
  assert.ok(parseFloat(large[font]) > parseFloat(values.get(font)), `${font} larger`);
  assert.ok(parseFloat(large[line]) > parseFloat(loose[line]), `${line} larger than 宽松's at 16px`);
}
for (const gap of [...GAP_TOKENS, "--doc-space"]) {
  assert.ok(parseFloat(loose[gap]) > parseFloat(values.get(gap) ?? "1"), `${gap} larger at 宽松`);
  assert.equal(large[gap], loose[gap], `${gap} 宽松's alone, at 大号 too`);
}
const compact = lookTokens(values, { spacing: "compact" });
assert.equal(compact["--doc-body-font-size"], undefined, "a spacing changes no font size");
assert.deepEqual([compact["--doc-body-line-height"], lookTokens(values, { spacing: "loose" })["--doc-body-line-height"]], ["24px", "28px"]);
for (const [token, value] of Object.entries({ ...small, ...large, ...compact })) assert.match(value, token === "--doc-space" ? /^[0-9.]+$/ : /^\d+px$/, token);

// The built stylesheet: every rule a rule of the look's attributes (so a document without them takes
// none), the serif one font, its controls kept in the sans, 混合体 of no weight.
const built = await loadKitFile("report.css", { fresh: true });
const css = lookCss(built);
assert.ok(built.includes(css) && !built.includes("@kit-look"), "report.css holds the look's rules where tokens.css says");
for (const line of css.split("\n")) assert.match(line, /^:root(\[data-doc-(font|size|spacing|measure)="[a-z]+"\])+ \{ (--doc-[a-z0-9-]+: [^;]+; )+\}$/, `${line}: a rule of the look's attributes giving tokens values, naming no element`);
assert.ok(css.includes(`:root[data-doc-font="serif"] { --doc-sans-font: ${values.get("--doc-font")}; --doc-font: ${SERIF_FONT}; }`), "衬线体: the serif, the sans kept as --doc-sans-font");
assert.ok(css.includes(`:root[data-doc-font="mixed"] { --doc-heading-font: ${SERIF_FONT}; }`));
assert.ok(tokensCss.includes(':root[data-doc-font="serif"] :is(.doc-display, .doc-code-language, .doc-diff-stats) { --doc-font: var(--doc-sans-font); font-family: var(--doc-font); }'), "the kit's controls keep the sans");
assert.ok(tokensCss.includes(':where(:root[data-doc-font="mixed"] :is(.doc-title, h1, h2, h3, h4)) { font-family: var(--doc-heading-font); }'), "混合体's headings, of no weight");
assert.ok(!/@import|url\(/.test(SERIF_FONT), "the serif is the system's: nothing to download");
assert.ok(!css.includes("data-doc-width"), "全宽 has no rule of the look's: the kit's own (page.css) is the one way to be wide");
const pageCss = fs.readFileSync(path.join(projectRoot, "src/render/kit/styles/page.css"), "utf8");
assert.ok(pageCss.includes(`:root[data-doc-width="full"] .doc-page {
  width: calc(100% - (2 * var(--doc-wide-gutter)));
  max-width: none;`), "the kit's one rule of the wide page, which 全宽 and the reader's display menu both set");
for (const file of ["flow.css", "page.css"]) assert.ok(fs.readFileSync(path.join(projectRoot, "src/render/kit/styles", file), "utf8").includes("* var(--doc-space, 1))"), `${file} takes its own margins at --doc-space`);

// The render: the look the document shows on the page's <html> (doc.json's over gallery.json's), the
// file's own taken off; none without either; the 写作偏好 page none, the workspace's not either.
{
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-look-"));
  try {
    const page = (look) => {
      fs.mkdirSync(path.join(workspace, "doc"), { recursive: true });
      fs.writeFileSync(path.join(workspace, "doc", "doc.json"), JSON.stringify({ title: "t", description: "d", type: "x", ...(look ? { look } : {}) }));
      const html = '<!doctype html>\n<html lang="zh-CN" data-doc-font="serif"><head><meta charset="utf-8"><title>t</title></head><body><main class="doc-page" data-doc-id="doc"><header class="doc-header"><h1 class="doc-title">t</h1></header><p>x</p></main></body></html>';
      return /<html\b[^>]*>/.exec(renderReportHtml(html, { slug: "doc", reportsDirectory: workspace, mode: "export" }).html)[0];
    };
    assert.equal(page({ size: "large", width: "narrow" }), '<html lang="zh-CN" data-doc-size="large" data-doc-measure="narrow">');
    assert.equal(page({ width: "narrow", full: "full" }), '<html lang="zh-CN" data-doc-measure="narrow" data-doc-width="full">', "全宽 on: the page's <html> says it, the width it overrides kept beside it");
    assert.equal(page(null), '<html lang="zh-CN">', "doc.json is the look's one home: the file's own attribute goes");
    assert.deepEqual(documentLook("doc", workspace), {});
    assert.deepEqual(workspaceLook(workspace), {}, "no gallery.json: the default");

    // The workspace's default look (gallery.json's `look`, beside the rest of it): a document without one of its own shows it.
    const marker = path.join(workspace, "gallery.json");
    const components = { gallery: "workspace", version: 1, components: { hidden: ["x"], disabled: [] } };
    fs.writeFileSync(marker, JSON.stringify(components, null, 2) + "\n");
    await writeWorkspaceLook(workspace, { size: "large", font: "serif", spacing: "default", width: "huge" });
    assert.deepEqual(JSON.parse(fs.readFileSync(marker, "utf8")), { ...components, look: { font: "serif", size: "large" } }, "written beside the components, each default left out");
    assert.deepEqual(workspaceLook(workspace), { font: "serif", size: "large" });
    assert.equal(page(null), '<html lang="zh-CN" data-doc-font="serif" data-doc-size="large">', "a document with none of its own: the workspace's");
    assert.equal(page({ width: "wide" }), '<html lang="zh-CN" data-doc-font="serif" data-doc-size="large" data-doc-measure="wide">', "its own beside the workspace's");
    assert.equal(page({ size: "default", font: "sans" }), '<html lang="zh-CN">', "its explicit defaults over the workspace's: the default");
    assert.deepEqual(documentLook("doc", workspace), {});
    fs.writeFileSync(path.join(workspace, "doc", "doc.json"), "{ not json");
    assert.deepEqual(documentLook("doc", workspace), { font: "serif", size: "large" }, "a doc.json that does not read: the workspace's");
    assert.equal(ownLookAt("doc", workspace).reads, false, "and it says it does not read (the watcher tells no page of it)");
    assert.deepEqual(documentLook("none", workspace), { font: "serif", size: "large" });
    assert.equal(ownLookAt("none", workspace).reads, false, "no document there: nothing to tell");
    // A document with no doc.json at all (its doc.html alone, one made by hand): the workspace's, and it reads (the watcher tells its pages).
    fs.mkdirSync(path.join(workspace, "bare"));
    fs.writeFileSync(path.join(workspace, "bare", "doc.html"), "<!doctype html><html><body></body></html>");
    assert.deepEqual(documentLook("bare", workspace), { font: "serif", size: "large" });
    assert.deepEqual(ownLookAt("bare", workspace), { own: null, instructions: false, reads: true }, "no doc.json: no look of its own, and that is what it says");
    // The 写作偏好 page shows no look, the workspace's not either.
    fs.mkdirSync(path.join(workspace, ".gallery", "pages", "prefs"), { recursive: true });
    fs.writeFileSync(path.join(workspace, ".gallery", "pages", "prefs", "doc.html"), "<!doctype html><html><body></body></html>");
    fs.writeFileSync(path.join(workspace, ".gallery", "pages", "prefs", "doc.json"), JSON.stringify({ title: "写作偏好", instructions: true, look: { size: "small" } }));
    assert.deepEqual(documentLook("prefs", workspace), {});
    // The same look again writes nothing; the default takes the field away, the rest kept in its order.
    const at = fs.statSync(marker).mtimeMs;
    await new Promise((resolve) => setTimeout(resolve, 20));
    await writeWorkspaceLook(workspace, { size: "large", font: "serif" });
    assert.equal(fs.statSync(marker).mtimeMs, at, "the same look writes nothing");
    await writeWorkspaceLook(workspace, { font: "sans" });
    assert.equal(fs.readFileSync(marker, "utf8"), JSON.stringify(components, null, 2) + "\n");
    // A workspace without a gallery.json has one made; one that does not read, or another program's, is refused and stays as it is.
    fs.rmSync(marker);
    await writeWorkspaceLook(workspace, {});
    assert.ok(!fs.existsSync(marker), "none made for the default");
    await writeWorkspaceLook(workspace, { width: "narrow" });
    assert.deepEqual(JSON.parse(fs.readFileSync(marker, "utf8")), { gallery: "workspace", version: 1, look: { width: "narrow" } });
    for (const [text, message] of [["{ not json", "gallery.json 读不出来：改好这个文件后再试"], ['{ "name": "another program" }', "gallery.json 不是 Gallery 的文件"]]) {
      fs.writeFileSync(marker, text);
      await assert.rejects(writeWorkspaceLook(workspace, { font: "serif" }), (error) => told(error) === message);
      assert.equal(fs.readFileSync(marker, "utf8"), text);
      assert.deepEqual(workspaceLook(workspace), {}, "and it says no look");
    }
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

console.log("Checked a document's look (字体与布局, 全宽): what doc.json keeps of it (each choice not the workspace's, an explicit default too, the field gone when none, the rest kept), the look shown over the workspace's default (gallery.json's, written beside the rest of it, refused when it does not read), its attributes on <html> as the render puts them (the file's own taken off), 全宽 the kit's own data-doc-width beside 正文宽度's, the kit's rules of them worked out from tokens.css in whole pixels (the size the type alone, the widths 648, 712 and 776px whatever the size, none for the default, the serif the system's, the controls kept in the sans), and a copy of the view keeping it.");
