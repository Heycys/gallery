import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { makeDefaultHome } from "../../src/editor/home-page.mjs";
import { isNewDocument } from "../../src/editor/source.mjs";
import { createReportFromStarter, starterPage } from "../../src/render/reports.mjs";
import { COPY_SUFFIX, IMPORTED_FROM, LANGUAGE_VARIABLE, NEW_DESCRIPTION, UNTITLED, fileLanguage, fileWords, htmlLang, languageOf, pageLangOf, systemLanguage } from "../../src/shared/file-language.mjs";
import { HOME_TITLES, homeTitle, newPageHtml, pageFiles } from "../../src/shared/pages.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { ensureWorkspace } from "../../src/shared/workspace.mjs";
import { writeImportedPages } from "../../src/transfer/pages.mjs";

// The words Gallery itself writes into a workspace's files follow the system's language when they are
// written, GALLERY_LANGUAGE over it (src/shared/file-language.mjs): the module's rule (the locale Node
// gives, else the usual variables; a value that is not zh or en ignored), then what is written by it in
// English and in Chinese: the default home page's title and lang, a custom page's lang, the starter's
// lang, section and description (the section found, and gallery check failing while it remains, in
// both), a command's copy, an import's description. The suite runs with GALLERY_LANGUAGE=zh
// (workspace-env.mjs); the English side is set here and put back.

const HAN = /[一-鿿]/;
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "gallery-file-language-"));
const previous = process.env[LANGUAGE_VARIABLE];
assert.equal(previous, "zh", "every unit test runs with GALLERY_LANGUAGE=zh (workspace-env.mjs)");
// The system says `locale` while `run` runs (Intl's, which the module asks first), or throws.
const systemSays = (locale, run) => {
  const real = Intl.DateTimeFormat;
  Intl.DateTimeFormat = function DateTimeFormat() {
    if (locale instanceof Error) throw locale;
    return { resolvedOptions: () => ({ locale }) };
  };
  try {
    return run();
  } finally {
    Intl.DateTimeFormat = real;
  }
};
const speaking = async (language, run) => {
  process.env[LANGUAGE_VARIABLE] = language;
  try {
    return await run();
  } finally {
    process.env[LANGUAGE_VARIABLE] = previous;
  }
};

try {
  // ---------- the rule ----------
  for (const [tag, language] of [["zh", "zh"], ["zh-CN", "zh"], ["zh_TW.UTF-8", "zh"], ["ZH-Hans", "zh"], ["zh_CN:en_US", "zh"], ["en", "en"], ["en-US", "en"], ["en_GB.UTF-8", "en"], ["zho", "en"], ["fr", "en"], ["C", "en"], ["", "en"], [undefined, "en"]]) {
    assert.equal(languageOf(tag), language, `${JSON.stringify(tag)}: ${language}`);
  }
  // The locale Node gives comes first, the variables only when there is none: a Chinese Windows with Git
  // Bash says LANG=en_US.UTF-8, and on Unix Node's locale already is what they say.
  assert.equal(systemSays("zh-CN", () => systemLanguage({ LANG: "en_US.UTF-8" })), "zh", "Chinese system, LANG says English: Chinese");
  assert.equal(systemSays("en-US", () => systemLanguage({ LANG: "zh_CN.UTF-8" })), "en", "English system: English, whatever the variables say");
  assert.equal(systemSays("", () => systemLanguage({ LC_ALL: "zh_CN.UTF-8" })), "zh", "no locale: the variables");
  assert.equal(systemSays(new Error("no Intl"), () => systemLanguage({ LANG: "zh_CN.UTF-8" })), "zh", "no Intl at all: the variables too");
  assert.equal(systemSays("", () => systemLanguage({ LC_ALL: "C", LANG: "zh_CN.UTF-8" })), "zh", "C is no language: the next variable");
  assert.equal(systemSays("", () => systemLanguage({ LC_ALL: "C.UTF-8", LANGUAGE: "zh_CN:en", LANG: "en_US.UTF-8" })), "zh", "LANGUAGE's first");
  assert.equal(systemSays("", () => systemLanguage({ LANG: "POSIX" })), "en");
  assert.equal(systemSays("", () => systemLanguage({})), "en", "nothing said: English");
  // GALLERY_LANGUAGE over the system's; anything but zh and en is no choice.
  systemSays("zh-CN", () => {
    assert.equal(fileLanguage({}), "zh");
    for (const [value, language] of [["en", "en"], ["EN", "en"], [" en ", "en"], ["zh", "zh"], ["fr", "zh"], ["", "zh"], ["zh-CN", "zh"], [undefined, "zh"]]) {
      assert.equal(fileLanguage({ [LANGUAGE_VARIABLE]: value }), language, `GALLERY_LANGUAGE=${JSON.stringify(value)} on a Chinese system`);
    }
  });
  systemSays("en-US", () => {
    assert.equal(fileLanguage({}), "en");
    assert.equal(fileLanguage({ [LANGUAGE_VARIABLE]: "zh" }), "zh", "the other language, asked for");
    assert.equal(fileLanguage({ [LANGUAGE_VARIABLE]: "de" }), "en", "a value that is no language is ignored");
  });
  assert.equal(fileLanguage(), "zh", "the process's own environment: the suite's");
  assert.deepEqual([htmlLang("zh"), htmlLang("en"), htmlLang(undefined)], ["zh-CN", "en", "en"]);
  assert.deepEqual([pageLangOf("zh"), pageLangOf("en"), pageLangOf(undefined), pageLangOf("fr")], ["zh-CN", "en", null, null], "the UI's language the workbench says, else none");
  assert.deepEqual([fileWords(HOME_TITLES, "zh"), fileWords(HOME_TITLES, "en"), fileWords(HOME_TITLES)], ["首页", "Home", "首页"]);
  assert.deepEqual([NEW_DESCRIPTION, COPY_SUFFIX, UNTITLED, IMPORTED_FROM].map((words) => [fileWords(words, "zh"), fileWords(words, "en")]), [["新文档", "New document"], ["（副本）", " (copy)"], ["未命名文档", "Untitled"], ["导入自 {0}", "Imported from {0}"]]);
  assert.ok([HOME_TITLES, NEW_DESCRIPTION, COPY_SUFFIX, UNTITLED, IMPORTED_FROM].every((words) => !HAN.test(words.en)), "the English words hold no Chinese");

  // ---------- the default home page ----------
  {
    const made = async (language, name) => speaking(language, async () => {
      const root = path.join(temp, name);
      await ensureWorkspace(root);
      const answer = await makeDefaultHome(root, { env: {} });
      assert.equal(answer.did, "made", JSON.stringify(answer));
      const files = pageFiles("home", root);
      return { root, html: await fs.readFile(files.html, "utf8"), json: await fs.readFile(files.json, "utf8") };
    });
    const english = await made("en", "home-en");
    assert.equal(JSON.parse(english.json).title, "Home", "an English system: Home in page.json");
    assert.ok(english.html.includes("<title>Home</title>") && english.html.includes('<html lang="en">') && !HAN.test(english.html), "and in <title>, the page's lang en, no Chinese in the file");
    const chinese = await made("zh", "home-zh");
    assert.equal(JSON.parse(chinese.json).title, "首页");
    assert.ok(chinese.html.includes("<title>首页</title>") && chinese.html.includes('<html lang="zh-CN">'), "a Chinese system: 首页, zh-CN");
    assert.equal(homeTitle(), "首页", "the title a home made now gets: the file language's");
    // A home page made in one language is left as it is when the system's is the other (never renamed behind the user's back).
    const again = await speaking("en", () => makeDefaultHome(chinese.root, { env: {} }));
    assert.equal(again.did, "done");
    const files = pageFiles("home", chinese.root);
    assert.equal(await fs.readFile(files.json, "utf8"), chinese.json, "page.json as it was: 首页");
    assert.equal(await fs.readFile(files.html, "utf8"), chinese.html, "page.html as it was");
    // A custom page's lang follows the language too, and one asked for wins.
    assert.ok(await speaking("en", () => newPageHtml("p", "P")).then((html) => html.includes('<html lang="en">')));
    assert.ok(newPageHtml("p", "P").includes('<html lang="zh-CN">'));
    assert.ok(await speaking("en", () => newPageHtml("p", "P", { lang: "zh-CN" })).then((html) => html.includes('<html lang="zh-CN">')));
  }

  // ---------- the starter ----------
  {
    const english = await speaking("en", () => starterPage("s", "Title", "A description"));
    assert.ok(english.html.includes('<html lang="en">') && english.html.includes("Document body") && english.html.includes("Replace this section with the document's content.") && !HAN.test(english.html), "an English system: lang en, its section in English");
    assert.ok(english.html.includes("<section class=\"doc-section\" aria-labelledby=\"content-title\" data-doc-placeholder>") && english.html.includes("<!-- Starter content:"), "the section found by its mark");
    assert.ok(isNewDocument(english.html), "the review of the Agent's changes takes it as a new document's, as in Chinese");
    assert.deepEqual(english.metadata, { title: "Title", description: "A description", type: "report" });
    const chinese = await starterPage("s", "Title", "A description");
    assert.ok(chinese.html.includes('<html lang="zh-CN">') && chinese.html.includes("文档正文") && chinese.html.includes("用文档内容替换这一节。") && isNewDocument(chinese.html), "a Chinese system: as it was");
    // A lang the caller knows (the workbench's UI) says the words as well.
    const asked = await speaking("en", () => starterPage("s", "T", "D", { lang: "zh-CN" }));
    assert.ok(asked.html.includes('<html lang="zh-CN">') && asked.html.includes("文档正文"), "English system, Chinese asked");
    const other = await starterPage("s", "T", "D", { lang: "en-GB" });
    assert.ok(other.html.includes('<html lang="en-GB">') && other.html.includes("Document body"), "Chinese system, English asked");
    assert.ok((await starterPage("s", "T", "D", { lang: "fr" })).html.includes("Document body"), "a language that is not Chinese: the English words");
    // Blank (the workbench's new document, an import): no section, the lang the same.
    const blank = await speaking("en", () => starterPage("s", "T", "D", { blank: true }));
    assert.ok(blank.html.includes('<html lang="en">') && blank.html.includes("<p></p>") && !blank.html.includes("data-doc-placeholder") && !HAN.test(blank.html), "a blank one in English");
    // The marks are filled in one pass: a title that names one is written as it is.
    const named = await starterPage("s", "A __REPORT_HEADING__ & __REPORT_NOTE__", "D");
    assert.ok(named.html.includes("<title>A __REPORT_HEADING__ &amp; __REPORT_NOTE__</title>") && !named.html.includes("__REPORT_HEADING__</h2>"), "a mark in a title stays");
    // On disk, as gallery new and the workbench write it.
    const directory = path.join(temp, "documents");
    await speaking("en", () => createReportFromStarter("made-en", "Made", "New document", { directory }));
    assert.ok((await fs.readFile(path.join(directory, "made-en", "doc.html"), "utf8")).includes('<html lang="en">'));
  }

  // ---------- the gallery command ----------
  {
    const workspace = path.join(temp, "command");
    const quiet = { CLAUDE_CONFIG_DIR: path.join(temp, "agents", "claude"), CODEX_HOME: path.join(temp, "agents", "codex"), GALLERY_CACHE_DIR: path.join(temp, "cache"), GALLERY_NO_UPDATE_CHECK: "1" };
    const gallery = async (language, args) => {
      try {
        const { stdout, stderr } = await promisify(execFile)(process.execPath, [path.join(projectRoot, "src", "cli", "bin.mjs"), "--workspace", workspace, ...args], {
          cwd: temp, timeout: 120000, env: { ...process.env, ...quiet, GALLERY_DEFAULT_WORKSPACE: workspace, GALLERY_NO_PREVIEW: "1", GALLERY_NO_BROWSER: "1", GALLERY_NO_AUTOSTART: "1", GALLERY_NO_DEFAULT_TREE: "1", [LANGUAGE_VARIABLE]: language },
        });
        return { code: 0, stdout, stderr };
      } catch (error) {
        if (typeof error.code !== "number") throw error;
        return { code: error.code, stdout: error.stdout, stderr: error.stderr };
      }
    };
    const seen = new Set();
    const read = async (slug, file) => fs.readFile(path.join(workspace, slug, file), "utf8");
    for (const [language, slug, heading, description, suffix] of [["en", "from-en", "Document body", "New document", "Title (copy)"], ["zh", "from-zh", "文档正文", "新文档", "Title（副本）"]]) {
      assert.equal((await gallery(language, ["new", slug, "Title"])).code, 0, `gallery new in ${language}`);
      const html = await read(slug, "doc.html");
      assert.ok(html.includes(`<html lang="${htmlLang(language)}">`) && html.includes(heading), `${language}: the starter's lang and section`);
      assert.equal(JSON.parse(await read(slug, "doc.json")).description, description, `${language}: the description when none is given`);
      const checked = await gallery(language, ["check", slug]);
      assert.ok(checked.code !== 0 && /starter placeholder content \(\[data-doc-placeholder\]\) is still present/.test(checked.stdout + checked.stderr), `${language}: gallery check fails while the starter section remains`);
      assert.equal((await gallery(language, ["new", `${slug}-given`, "Given", "Mine"])).code, 0);
      assert.equal(JSON.parse(await read(`${slug}-given`, "doc.json")).description, "Mine", "a description given is kept as it is");
      const copied = await gallery(language, ["duplicate", slug]);
      assert.equal(copied.code, 0, copied.stderr);
      const copy = (await fs.readdir(workspace)).filter((name) => /^doc-/.test(name) && !seen.has(name));
      assert.equal(copy.length, 1, "one copy made");
      seen.add(copy[0]);
      assert.equal(JSON.parse(await read(copy[0], "doc.json")).title, suffix, `${language}: the copy's title`);
    }
  }

  // ---------- an import's description ----------
  {
    const pages = [{ title: "Page", from: "notes.md", nodes: [], raws: [], files: [], children: [] }];
    const descriptions = [];
    const run = (options) => writeImportedPages(pages, {
      create: async (slug, title, description, { lang }) => descriptions.push([description, lang]),
      slugOf: () => "imported", folderOf: () => path.join(temp, "imported"), fill: async ({ source }) => source, place: async () => {},
      ...options,
    });
    await fs.mkdir(path.join(temp, "imported"), { recursive: true });
    await fs.writeFile(path.join(temp, "imported", "doc.html"), "<html></html>");
    await fs.writeFile(path.join(temp, "imported", "doc.json"), "{}");
    await speaking("en", () => run({}));
    await run({});
    await run({ said: "来自 {0}" });
    assert.deepEqual(descriptions.map(([description]) => description), ["Imported from notes.md", "导入自 notes.md", "来自 notes.md"], "the file language's, else the one given");
  }
} finally {
  process.env[LANGUAGE_VARIABLE] = previous;
  await fs.rm(temp, { recursive: true, force: true });
}

console.log("Checked the language of the words Gallery writes into files: the locale Node gives before the variables, C no language, GALLERY_LANGUAGE over it (zh or en, else ignored); the default home page Home or 首页 with its lang, a home already made left as it is; a custom page's, the starter's lang and section in both languages (found by its mark, new-document review and gallery check the same), a lang asked for saying the words; gallery new's description, a copy's suffix and an import's description by it.");
