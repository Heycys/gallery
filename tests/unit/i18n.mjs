import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import EN from "../../src/shared/i18n/en.mjs";
import { inLanguage, refusal, said, saying, t, told } from "../../src/shared/i18n/index.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";

// The UI's two languages (src/shared/i18n/): every Chinese string the workbench and the page editor
// show goes through t() and has its English in en.mjs, with the same {0}, {1}… in it; no Chinese
// string of theirs is left outside t() (a block's search words, `words`, are data: Chinese, pinyin
// and English already; `glance`, a block's row for an Agent, is no UI's; a console message is the developer's); the messages the server sends the UI
// (written in Chinese, looked up where they are shown: told(), say(), toast()) have their English
// too, one with parts filled in sent as said()'s template and its values (a template literal that
// composes Chinese with values is no message the UI could look up), each said() template a literal
// with its English; and en.mjs holds nothing else (no entry left behind by a string that changed). An
// English entry is a string or, for words a count changes (1 conflict, 2 conflicts), a function of the
// values t() was given: it must fill in every value the Chinese does, in the forms a reader meets, and
// the plurals that matter are held below.

const HAN = /[一-鿿]/;
const UI = ["src/workbench/app", "src/editor/page", "src/editor/components"];
// The server's files whose messages the UI shows (failures, refusals), and the strings of theirs that
// are a report's content or a developer's (a new report's title, an export's file name), not messages.
const SERVER = ["src/shared/preference-documents.mjs", "src/editor/service.mjs", "src/editor/media-store.mjs", "src/editor/net-fetch.mjs", "src/editor/unfurl.mjs", "src/workbench/service.mjs", "src/server/extensions.mjs", "src/server/extension-install.mjs", "src/shared/extension-manifest.mjs", "src/shared/web-links.mjs", "src/transfer/service.mjs", "src/transfer/browser.mjs", "src/transfer/jobs.mjs", "src/transfer/zip.mjs"];
const CONTENT = new Set(["未命名文档", "新文档", "写作偏好", "preferences/通用写作.md", "preferences/项目报告写作.md", "Agent 每次写报告前都会先读的写作偏好", "（副本）"]);

const files = (directories) => directories.flatMap((directory) => {
  const full = path.join(projectRoot, directory);
  if (fs.statSync(full).isFile()) return [full];
  const found = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const next = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(next);
      else if (/\.(mjs|ts|tsx)$/.test(entry.name) && !entry.name.endsWith(".d.ts") && !/^files?\.mjs$/.test(entry.name)) found.push(next);
    }
  };
  walk(full);
  return found;
});
// Each file as what it is: a .ts file read as JavaScript takes a type argument (WeakMap<K, Promise<V>>) for
// JSX and loses track of the strings after it.
const parse = (file) => ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".ts") ? ts.ScriptKind.TS : ts.ScriptKind.JS);
const shown = (file) => path.relative(projectRoot, file).split(path.sep).join("/");
const inside = (node, test) => {
  for (let at = node.parent; at; at = at.parent) if (test(at)) return true;
  return false;
};
const isCallOf = (node, names) => ts.isCallExpression(node) && names.test(node.expression.getText());

const keys = new Map(); // key -> where
const loose = [];
for (const file of files(UI)) {
  const sf = parse(file);
  const visit = (node) => {
    if (isCallOf(node, /^t$/) && node.arguments[0] && (ts.isStringLiteral(node.arguments[0]) || ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))) {
      keys.set(node.arguments[0].text, `${shown(file)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
      node.arguments.slice(1).forEach(visit);
      return;
    }
    const text = (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : ts.isTemplateExpression(node) ? [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join("") : ts.isJsxText(node) ? node.getText() : "")
      .replace(/\/\*[\s\S]*?\*\//g, ""); // a style sheet's comments say nothing to the reader
    // Not the UI's: a block's search words and its row of "Blocks at a glance", and how gallery read writes it (its
    // definition's `read`, and what a component's folder writes it with, named read… or READ…: the command's words,
    // in Chinese as every command's fixed words are, never shown in the browser).
    const notShown = (at) => (ts.isPropertyAssignment(at) && ["words", "glance", "read"].includes(at.name.getText()))
      || ((ts.isFunctionDeclaration(at) || ts.isVariableDeclaration(at)) && /^(?:read[A-Z]|READ)/.test(at.name?.getText() ?? ""));
    if (HAN.test(text) && !inside(node, (at) => notShown(at) || isCallOf(at, /^console\./))) {
      loose.push(`${shown(file)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${text.trim().slice(0, 40)}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
assert.deepEqual(loose, [], `Chinese the UI shows without t():\n${loose.join("\n")}`);
assert.ok(keys.size > 800, "the UI's strings were found");

const messages = new Set();
const composed = [];
for (const file of files(SERVER)) {
  const sf = parse(file);
  const visit = (node) => {
    const logged = () => inside(node, (at) => isCallOf(at, /^console\./));
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && HAN.test(node.text) && !CONTENT.has(node.text) && !logged()) messages.add(node.text);
    const parts = ts.isTemplateExpression(node) ? [node.head.text, ...node.templateSpans.map((span) => span.literal.text)].join("") : "";
    if (HAN.test(parts) && !logged()) composed.push(`${shown(file)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${node.getText().slice(0, 50)}`);
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
assert.deepEqual(composed, [], `server messages composed with their values, which the UI cannot look up whole: send said(text, ...values) (src/shared/i18n/index.mjs):\n${composed.join("\n")}`);

// Every said() of the server's code (anywhere under src/ but the UI's, in a file that imports it) names
// its template as a literal, which has its English as any message does.
const templates = [];
const unnamed = [];
const ui = (file) => UI.some((directory) => file.startsWith(path.join(projectRoot, directory) + path.sep));
const importsSaid = (file) => /import\s*\{[^}]*\bsaid\b[^}]*\}\s*from\s*"[^"]*i18n\/index\.mjs"/.test(fs.readFileSync(file, "utf8"));
for (const file of files(["src"]).filter((file) => !ui(file) && importsSaid(file))) {
  const sf = parse(file);
  const visit = (node) => {
    if (isCallOf(node, /^said$/)) {
      const first = node.arguments[0];
      if (first && (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))) templates.push(first.text);
      else unnamed.push(`${shown(file)}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
}
assert.deepEqual(unnamed, [], `said() with a template that is no literal (en.mjs could not be checked for it):\n${unnamed.join("\n")}`);
assert.ok(templates.length >= 10, "the server's said() templates were found");
for (const text of templates) messages.add(text);

const placeholders = (text) => [...text.matchAll(/\{(\d+)\}/g)].map((match) => match[1]).sort().join(",");
// What an entry says: a string as it is; a function (a plural) three times, with a mark for each value the
// Chinese key fills in (a count it cannot tell is many) and with each of them 1 and 2, the forms a reader meets.
const valuesOf = (key) => Math.max(0, ...[...key.matchAll(/\{(\d+)\}/g)].map((match) => Number(match[1]) + 1));
const marks = (key) => Array.from({ length: valuesOf(key) }, (_, index) => `<${index}>`);
const forms = (key, entry) => (typeof entry === "function" ? [marks(key), marks(key).map(() => 1), marks(key).map(() => 2)].map((values) => entry(...values)) : [entry]);
const missing = [...keys.keys(), ...messages].filter((key) => !["string", "function"].includes(typeof EN[key]) || (typeof EN[key] === "string" && EN[key].trim() === ""));
assert.deepEqual(missing, [], `strings with no English (en.mjs):\n${missing.map((key) => `${JSON.stringify(key)}  ${keys.get(key) ?? "(a server message)"}`).join("\n")}`);
// A function fills in the same values as the Chinese when its form for marks has every mark of them, and every form is a string.
const mismatched = Object.entries(EN).filter(([key, value]) => (typeof value === "function"
  ? !forms(key, value).every((form) => typeof form === "string") || !marks(key).every((mark) => forms(key, value)[0].includes(mark))
  : placeholders(key) !== placeholders(value)));
assert.deepEqual(mismatched.map(([key]) => key), [], "the English fills in the same {0}, {1}… as the Chinese (a function of the values: every one)");
assert.ok(Object.values(EN).filter((value) => typeof value === "function").length >= 30, "the plurals were found");
// English entries made ahead of the later waves of the interface refinement (2026-11-17), which use them: each may stand unused until its wave lands; a wave takes its key out of this list.
const AHEAD = new Set([]);
const stale = Object.keys(EN).filter((key) => !keys.has(key) && !messages.has(key) && !AHEAD.has(key));
assert.deepEqual(stale, [], `entries no string uses (en.mjs):\n${stale.join("\n")}`);
assert.deepEqual(Object.entries(EN).filter(([key, value]) => forms(key, value).some((form) => HAN.test(form) || (typeof value === "function" && /\{\d+\}/.test(form)))).map(([key]) => key), [], "the English holds no Chinese, and a function's no {0} left unfilled, in any of its forms");

// English at one and at many (en.mjs many() and one()): the count and its noun agree, and so do the verb
// and the pronoun after them; Chinese says the same at both; a count given as text counts as well.
{
  const english = (text, ...values) => inLanguage("en", () => t(text, ...values));
  const chinese = (text, ...values) => inLanguage("zh", () => t(text, ...values));
  const conflicts = "{0} 处冲突待处理";
  assert.equal(english(conflicts, 1), "1 conflict to resolve", "the top bar and the conflict card's head at one");
  assert.equal(english(conflicts, 3), "3 conflicts to resolve");
  assert.equal(english("{0} 处内容待处理", 1), "1 item to resolve");
  assert.equal(english("{0} 处内容待处理", 2), "2 items to resolve");
  assert.equal(chinese(conflicts, 1), "1 处冲突待处理", "Chinese has no plural");
  assert.equal(chinese(conflicts, 3), "3 处冲突待处理");
  const notice = "{0} 处修改和文件的最新版本冲突，没有保存：在左下方选择怎么处理。";
  assert.equal(english(notice, 1), "1 edit conflicts with the file's latest version and wasn't saved: choose what to do at the bottom left.", "the verb agrees at one");
  assert.equal(english(notice, 2), "2 edits conflict with the file's latest version and weren't saved: choose what to do at the bottom left.", "and at many");
  assert.equal(english("自定义块刚刚变了，{0} 处修改没有保存：在左下方选择怎么处理。", 1), "A custom block just changed and 1 edit wasn't saved: choose what to do at the bottom left.");
  assert.equal(english("{0} 处内容文档存不下，没有保存：在左下方选择怎么处理。", 4), "4 items can't be stored in the document and weren't saved: choose what to do at the bottom left.");
  const lost = "有 {0} 处修改没能放回文件，列在右下方：复制保存好再标记处理完。";
  assert.equal(english(lost, 1), "1 change couldn't go back into the file; it's listed at the bottom right: copy it somewhere safe, then mark it done.", "the pronouns agree too");
  assert.equal(english(lost, 2), "2 changes couldn't go back into the file; they're listed at the bottom right: copy them somewhere safe, then mark them done.");
  assert.equal(english("{0} 块", 1), "1 block");
  assert.equal(english("{0} 块", 2), "2 blocks");
  assert.equal(english("{0}和折叠的 {1} 块", "Heading", 1), "Heading and the 1 block folded under it", "a part that is no count is left as given");
  assert.equal(english("还有 {0} 块", 1), "1 more block");
  assert.equal(english("还有 {0} 块", 5), "5 more blocks");
  assert.equal(english("{0} 个条目", 1), "1 entry", "a plural of its own: entries");
  assert.equal(english("{0} 个条目", 2), "2 entries");
  assert.equal(english("{0} {1} 行", "Added", 1), "Added 1 row", "a count in the second place, a verb in the first");
  assert.equal(english("{0} 列 × {1} 行", 1, 1), "1 column × 1 row");
  assert.equal(english("{0} 列 × {1} 行", 3, 12), "3 columns × 12 rows");
  assert.equal(english("已导入 {0} 个页面，{1} 个文件不支持：{2}", 1, 1, "a.xyz"), "Imported 1 page; 1 file not supported: a.xyz");
  assert.equal(english("已导入 {0} 个页面，{1} 个文件不支持：{2}", 5, 2, "a.xyz, b.xyz"), "Imported 5 pages; 2 files not supported: a.xyz, b.xyz");
  assert.equal(english("永久删除回收区中的全部 {0} 项？", 1), "Permanently delete the 1 item in the trash?");
  assert.equal(english("永久删除回收区中的全部 {0} 项？", 9), "Permanently delete all 9 items in the trash?");
  assert.equal(english("{0} 个字", "1"), "1 word", "a count written as text");
  assert.equal(english("{0} 个字", "1,234"), "1,234 words", "and one with a separator, which is many");
  assert.equal(english("已复制 {0} 项，原项保留", 1), "Copied 1 item; original kept");
  assert.equal(english("已复制 {0} 项，原项保留", 3), "Copied 3 items; originals kept");
  assert.equal(english("已删除「{0}」栏，里面的 {1} 项回到了「{2}」", "A", 1, "B"), "Removed the column “A”: its 1 entry went back to “B”");
  const annotations = "以下是我对这份文档的批注，共 {0} 条。请逐条按“建议”修改底稿；每条给出它在文档里的位置、块的 data-block-id 和批注的原文。";
  assert.ok(english(annotations, 1).startsWith("This is my 1 annotation on this document."));
  assert.ok(english(annotations, 7).startsWith("These are my 7 annotations on this document."));
  assert.equal(english("{0}已成功导入", "a.md"), "a.md imported", "a string entry is filled as before");
  // A server's message with a count, said in English by told(): the same entries.
  assert.equal(inLanguage("en", () => told({ ok: false, text: "{0} 块", values: [1] })), "1 block");
}

// What the UI says of a server's message (told): its template in the UI's language with its values as
// they are (an Agent's check line stays the Agent's), else its whole message looked up, else as it is.
{
  const answer = { ok: false, reason: "check", ...said("「{0}」没有通过导出前的检查，没有生成文件：{1}", "周报", "line 3: <img> without alt") };
  assert.equal(answer.message, "「周报」没有通过导出前的检查，没有生成文件：line 3: <img> without alt", "the server's own message: the Chinese filled in");
  assert.equal(inLanguage("en", () => told(answer)), "“周报” didn't pass the checks before export, so no file was made: line 3: <img> without alt");
  assert.equal(inLanguage("zh", () => told(answer)), answer.message);
  assert.equal(inLanguage("en", () => told({ ok: false, message: "找不到这份文档" })), "Document not found", "a whole message, as before");
  assert.equal(inLanguage("en", () => told({ ok: false, message: "ENOENT: no such file" })), "ENOENT: no such file", "a message with no entry: as it is");
  assert.equal(told({ ok: false, reason: "body" }), null, "nothing said");
  const error = refusal(said("{0} 已加密", "a.docx"), { reason: "zip" });
  assert.deepEqual([error.message, error.reason], ["a.docx 已加密", "zip"], "an error of it says the Chinese filled in (the log)");
  assert.deepEqual(saying(error), { message: "a.docx 已加密", text: "{0} 已加密", values: ["a.docx"] }, "an error carries its template into an answer");
  assert.deepEqual(saying(new Error("plain")), { message: "plain" });
  assert.equal(inLanguage("en", () => told(saying(error))), "a.docx is encrypted");
}

console.log(`Checked the UI's languages: ${keys.size} strings of the workbench and the page editor and ${messages.size} of the server's messages (${templates.length} said() templates), each with its English (the same placeholders; a count's words a function of it, held at one and at many), none shown without t(), none of the server's composed with its values, no entry left behind; told() says a server's template in the UI's language.`);
