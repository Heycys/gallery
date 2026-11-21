import assert from "node:assert/strict";
import { findPages, heldList, holdPages, placeIn, readPages, titleIn, webLinkIn } from "../../src/editor/page/links/pages.mjs";
import { pageId, pageLink, pageLinks } from "../../src/shared/page-links.mjs";

// The one search of a link's card, a page block's box and "@" (src/editor/page/links/pages.mjs).

const pages = (...titles) => titles.map((title, index) => ({ slug: `p${index + 1}`, title, icon: null, parent: null }));
const titles = (found) => found.map(({ title }) => title);

const list = pages("技术周报", "Report review", "周报汇总 2026", "A report", "每周的工作报告", "周 报");
assert.deepEqual(titles(findPages(list, "周报")), ["周报汇总 2026", "技术周报", "每周的工作报告", "周 报"], "the title's start, then what holds it, then its characters in order; the sidebar's order within each");
assert.deepEqual(titles(findPages(pages("my report", "report one", "reported", "Unreported"), "report")), ["report one", "reported", "my report", "Unreported"], "a word's start comes before a title that only holds it");
assert.deepEqual(titles(findPages(pages("HTTP 指南", "www 入门", "README.md 说明"), "http")), ["HTTP 指南"], "any case, and words that read like an address are words");
assert.deepEqual(titles(findPages(pages("README.md 说明"), "readme.md")), ["README.md 说明"]);
assert.deepEqual(titles(findPages(pages("abc", "acb"), "ac")), ["acb", "abc"], "fuzzy: its letters in their order, after a title that holds them together");
assert.deepEqual(titles(findPages(pages("abc", "acb"), "ca")), [], "not in another order");
assert.deepEqual(titles(findPages(pages("项目复盘"), "xiangmu")), [], "no pinyin");
assert.deepEqual(titles(findPages(pages("Q3 复盘"), "  q3  ")), ["Q3 复盘"], "the spaces at its ends are no words");

const many = pages("甲", "乙", "丙", "丁", "戊", "己", "庚", "辛");
assert.deepEqual(titles(findPages(many, "")), ["甲", "乙", "丙", "丁", "戊", "己"], "no words: the sidebar's order, six rows");
assert.equal(findPages(pages(...Array(9).fill("周报")), "周").length, 6, "six rows of a search");

// The list as the server gives it, on a server of its own.
globalThis.location = new URL("http://127.0.0.1:4173/generated/below.html");
const real = globalThis.fetch;
const answer = (body) => { globalThis.fetch = async () => ({ json: async () => body }); };
assert.deepEqual(heldList().pages, [], "no list read yet: none held");
assert.equal(heldList().links.size, 0);
const workspace = {
  outline: { children: { "": ["top", "other"], top: ["below"], below: ["deep"] } },
  instructions: "prefs",
  reports: {
    top: { slug: "top", title: "父页面" }, other: { slug: "other", title: "别的", icon: "🎯" }, below: { slug: "below", title: "子页面" }, deep: { slug: "deep", title: "孙页面" },
    prefs: { slug: "prefs", title: "写作偏好", instructions: true },
  },
  trash: [{ id: "a-b", slug: "binned", title: "别的" }],
};
answer(workspace);
const read = await readPages({ slug: "below", title: "还没保存的标题" });
assert.deepEqual(read.pages.map(({ slug }) => slug), ["top", "below", "deep", "other"], "the sidebar's order, under a page after it, and no 写作偏好");
assert.deepEqual(read.pages.map(({ parent }) => parent), [null, "父页面", "还没保存的标题", null], "each with the title of the page it is under");
assert.equal(read.pages[1].title, "还没保存的标题", "this page by the title it shows");
assert.equal(read.pages.at(-1).icon, "🎯");
assert.deepEqual(placeIn(read, "../deep/doc.html#ab12cd34"), { ...read.pages[2], block: "ab12cd34" }, "an address of it, with its block");
assert.equal(placeIn(read, `http://127.0.0.1:4173/#还没保存的标题-${pageId("below")}`)?.slug, "below", "by the link");
assert.equal(placeIn(read, "#deep/ab12cd34")?.block, "ab12cd34", "a workbench's hash alone");
assert.equal(read.links.get("top"), pageLink({ slug: "top", title: "父页面" }), "each page's link");
assert.equal(read.links.get("below"), pageLink({ slug: "below", title: "还没保存的标题" }), "this page's by the title it shows");
assert.equal(placeIn(read, `http://127.0.0.1:4173/#一个旧标题-${pageId("below")}/ab12cd34`)?.slug, "below", "the words are a label");
assert.equal(placeIn(read, `#${pageId("below")}`)?.block, null, "in a hash too, the id alone");
assert.deepEqual(read.trash.map(({ slug }) => slug), ["binned"], "the trash");
assert.equal(titleIn(read, "../deep/doc.html#ab12cd34"), "孙页面", "a title for an address");
assert.equal(titleIn(read, "../binned/doc.html"), "别的", "of a page in the trash too");
assert.equal(titleIn(read, `http://127.0.0.1:4173/#别的-${pageId("binned")}/ab12cd34`), "别的", "by its link");
assert.equal(titleIn(read, "../nothing/doc.html"), null, "none for a page there never was");
assert.equal(placeIn(read, `http://127.0.0.1:9/#别的工作区的标题-${pageId("below")}`), null, "another port: the words not its own, another program's");
assert.equal(placeIn(read, `http://127.0.0.1:9/#${read.links.get("deep")}/ab12cd34`)?.block, undefined, "other ports stay external even with matching title");
assert.equal(titleIn(read, `http://127.0.0.1:9/#别的词-${pageId("binned")}`), null, "of the trash as well");
assert.equal(titleIn(read, `http://127.0.0.1:9/#别的-${pageId("binned")}`), null);

// With no title (an untitled document) the rows say 未命名文档, as the workbench does; that is no label for a link.
answer({ outline: { children: { "": ["blank"] } }, reports: { blank: { slug: "blank", title: "" } }, trash: [] });
const untitled = await readPages();
assert.deepEqual([untitled.pages[0].title, untitled.links.get("blank")], ["未命名文档", pageId("blank")], "the id alone");
assert.equal(heldList().links.get("blank"), pageId("blank"), "and in the list held");
holdPages(() => ({ slug: "blank", title: "页面上的标题" }));
await new Promise((resolve) => setTimeout(resolve));
assert.equal(heldList().links.get("blank"), pageLink({ slug: "blank", title: "页面上的标题" }), "a page by the title it shows");
answer(workspace);

// The list held for a copy, which cannot wait: the last one read, by the title the page shows now.
let title = "子页面";
holdPages(() => ({ slug: "below", title }));
await new Promise((resolve) => setTimeout(resolve));
assert.equal(heldList().links.get("below"), pageLink({ slug: "below", title: "子页面" }));
title = "又改了的标题";
assert.equal(heldList().links.get("below"), pageLink({ slug: "below", title: "又改了的标题" }), "the title as it is now, with no read");
assert.equal(heldList().pages.find(({ slug }) => slug === "below").title, "又改了的标题");
assert.equal(heldList().links.get("top"), pageLink({ slug: "top", title: "父页面" }), "the others' links as they were");
assert.equal(heldList().named.get("binned"), pageLink({ slug: "binned", title: "别的" }), "with those of the trash for what is written");
assert.equal(heldList().links.has("binned"), false, "and only there");
title = "";
assert.equal(heldList().links.get("below"), pageLink({ slug: "below", title: "子页面" }), "a title emptied for a moment: the list's, as the workbench's address bar has it");
title = "新页";
holdPages(() => ({ slug: "newer", title }));
assert.equal(heldList().links.get("newer"), pageLink({ slug: "newer", title: "新页" }), "a page newer than the list has its own link");
assert.equal(heldList().pages.some(({ slug }) => slug === "newer"), false, "and is no page of the list");
assert.equal(placeIn(read, "../prefs/doc.html"), null, "写作偏好 is no page to link to");
assert.equal(placeIn(read, "https://example.com/"), null);
assert.equal(placeIn({ pages: [], links: pageLinks([]) }, "../top/doc.html"), null);

// The sidebar in columns (栏: shared/outline-shape.mjs), with web links: every column's documents in
// the columns' order, a document under a link a page all the same; a web link no page (no file to link to).
answer({
  outline: { version: 2, groups: [{ id: "docs" }, { id: "g-team", title: "团队" }, { id: "g-l", role: "links" }], links: ["site", "board"], children: { "": ["top", "board"], board: ["kept"], ":g-team": ["weekly"], weekly: ["deep"], ":g-l": ["site"] } },
  reports: {
    top: { slug: "top", title: "父页面" }, board: { slug: "board", title: "看板网页", kind: "link", url: "https://example.com/" }, kept: { slug: "kept", title: "挂在网页下" },
    weekly: { slug: "weekly", title: "周报" }, deep: { slug: "deep", title: "孙页面" }, site: { slug: "site", title: "周报网站", kind: "link", url: "https://weekly.example/" },
  },
  trash: [{ id: "a-c", slug: "binned", title: "别的", kind: "document" }, { id: "a-d", slug: "gone-link", title: "删掉的网页", kind: "link" }],
});
const columns = await readPages();
assert.deepEqual(columns.pages.map(({ slug }) => slug), ["top", "kept", "weekly", "deep"], "every column, in their order; no web link");
assert.deepEqual(columns.pages.map(({ parent }) => parent), [null, "看板网页", null, "周报"], "a column's top level is under nothing");
assert.deepEqual(titles(findPages(columns.pages, "周报")), ["周报"], "@ finds a document of another column, never a link");
assert.equal(placeIn(columns, "../weekly/doc.html")?.slug, "weekly", "a link card's address of it");
assert.equal(titleIn(columns, "../deep/doc.html"), "孙页面");
assert.equal(placeIn(columns, "../site/doc.html"), null, "a web link has no page");
assert.equal(columns.links.has("site"), false);
// A page alone in a tab may follow a workbench address that names a web link (the workbench opens it in its content area), though it is no page.
assert.deepEqual([...columns.webs.keys()], ["board", "site"], "the web links, by their links");
assert.ok(webLinkIn(columns, pageLink({ slug: "site", title: "周报网站" })) && webLinkIn(columns, "board") && webLinkIn(columns, encodeURIComponent(pageLink({ slug: "board", title: "看板网页" }))), "a workbench address naming a web link: by its link, its slug, written as an address bar does");
assert.ok(!webLinkIn(columns, "weekly") && !webLinkIn(columns, pageLink({ slug: "weekly", title: "周报" })) && !webLinkIn(columns, "nowhere"), "not a document's, nor one that names nothing");
assert.equal(titleIn(columns, "../gone-link/doc.html"), null, "nor one in the trash");
answer(workspace);
await readPages();

answer({ error: true });
assert.equal(await readPages(), null, "an answer that is no list");
assert.equal(heldList().links.get("top"), pageLink({ slug: "top", title: "父页面" }), "and the list held stays");
globalThis.fetch = async () => { throw new TypeError("Failed to fetch"); };
assert.equal(await readPages(), null, "no answer: no list, and no error");
globalThis.fetch = real;
