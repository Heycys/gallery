import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { JSDOM } from "jsdom";
import { instanceAround, instanceOf, packageOf } from "../../src/editor/components/instances.mjs";
import { cellsOf, gridOf } from "../../src/render/kit/board/index.js";
import { CELL, GRID, spanOf } from "../../src/shared/board-places.mjs";
import { parseReport } from "../../src/render/report-tree.mjs";
import { cardIds, cardMarkup, cardWith, cardsOf, freeCardId, oneCard, readPage, servedPage, withCard, withCardIds, withCells, withoutCard } from "../../src/shared/page-cards.mjs";
import { attr, walk } from "../../src/shared/html-tree.mjs";
import {
  FIRST_BOARD, HOME, HOME_CARDS, HOME_SIZES, PAGE_FILES, closeHomeHint, createPage, homeHintClosed, homeTitle, inPageOrder, isPageFile, listPages, markHomeMade, newPageHtml,
  pageExists, pageFiles, pageMetaOf, pageSlugRefused, pageVersion, pageVersionNow, pagesSettings, readPageMeta, renamePage,
} from "../../src/shared/pages.mjs";
import { WORKSPACE_MARK, ensureWorkspace, layoutOf, listTrash, slugTaken } from "../../src/shared/workspace.mjs";
import { closePageHint, headOf, isBlankPage, newPageSlug, pageDefaults, pageHintClosed, pageHintShown } from "../../src/shared/pages.mjs";
import { writeHead, writeOutline } from "../../src/shared/outline.mjs";
import { HEAD_NEW, HEAD_SEARCH, headOrder, headWithPage, movedInHead, storedHead } from "../../src/shared/sidebar-head.mjs";

// A workspace's custom pages (src/shared/pages.mjs; decided 2026-11-07):
// their folder and files, the one set of slugs they share with the documents, a new page's
// structure (one empty board, or none: a blank page), their list in the sidebar's head order (kept in the
// outline file: each new page last, after a page where it is told; those it names not by gallery.json's
// pages.order, then by title; no page first by its slug), a rename (page.json's title alone), what page.json
// may say of any page (defaultCards, hint) and a page's version; gallery.json's pages.homeMade written
// (markHomeMade) and a page's first-open note closed for the workspace (.gallery/hints.json).

const root = mkdtempSync(path.join(tmpdir(), "pages-"));
const savedHome = process.env.GALLERY_DEFAULT_WORKSPACE;
process.env.GALLERY_DEFAULT_WORKSPACE = root;
try {
  await ensureWorkspace(root);
  const at = (...parts) => path.join(root, ...parts);
  assert.equal(layoutOf(root).customPages, at("pages"), "the custom pages at the root, as components/");
  assert.ok(!("pages" in layoutOf(root)), "no key called pages: code written for .gallery/pages/ under that name (before the custom pages) fails, never reads pages/");
  assert.equal(layoutOf(root).preferencesPage, at(".gallery", "pages"), "the 写作偏好 page's folder keeps its place, under its own name");
  assert.deepEqual(pageFiles("home", root), { folder: at("pages", "home"), html: at("pages", "home", "page.html"), json: at("pages", "home", "page.json"), assets: at("pages", "home", "assets") });
  // A scratch copy of gallery page try's or check's (.gallery/try/<slug>/ holding a page.html) is found by
  // its slug where pages/ has no folder of it, and listed nowhere; one holding a document's file is no page.
  fs.mkdirSync(at(".gallery", "try", "try-0a1b2c3d"), { recursive: true });
  fs.writeFileSync(at(".gallery", "try", "try-0a1b2c3d", "page.html"), "<!doctype html>");
  fs.mkdirSync(at(".gallery", "try", "try-0a1b2c3e"), { recursive: true });
  fs.writeFileSync(at(".gallery", "try", "try-0a1b2c3e", "doc.html"), "<!doctype html>");
  assert.equal(pageFiles("try-0a1b2c3d", root).folder, at(".gallery", "try", "try-0a1b2c3d"), "a page's scratch copy");
  assert.ok(pageExists("try-0a1b2c3d", root) && !pageExists("try-0a1b2c3e", root), "a document's scratch copy is no page");
  assert.equal(pageFiles("try-0a1b2c3e", root).folder, at("pages", "try-0a1b2c3e"));
  assert.ok(!(await listPages(root)).some(({ slug }) => slug.startsWith("try-")), "listed nowhere");
  fs.rmSync(at(".gallery", "try"), { recursive: true, force: true });
  assert.ok(isPageFile("page.html") && isPageFile("page.json") && !isPageFile("doc.html"));
  assert.deepEqual(PAGE_FILES, { html: "page.html", json: "page.json" });

  // A new page: its title in <title> (it draws no big title: no header, no h1), one empty board; no script.
  const html = newPageHtml("reading", "读书 & <笔记>");
  const tree = parseReport(html);
  const found = { main: null, boards: [], scripts: 0, title: null };
  walk(tree, (node) => {
    if (node.tagName === "main") found.main = node;
    if (node.tagName === "div" && /\bgallery-board\b/.test(attr(node, "class") ?? "")) found.boards.push(attr(node, "data-board-id"));
    if (node.tagName === "script") found.scripts++;
  });
  assert.equal(attr(found.main, "class"), "gallery-page");
  assert.equal(attr(found.main, "data-page-id"), "reading");
  assert.deepEqual(found.boards, [FIRST_BOARD], "one board, main");
  assert.equal(found.scripts, 0, "a page writes no script");
  assert.ok(html.includes("<title>读书 &amp; &lt;笔记&gt;</title>") && !html.includes("<h1") && !html.includes("gallery-page-head"), "its title escaped, in <title> alone: the page draws no title of its own");
  assert.ok(html.includes('data-doc-effective-theme="dark"'), "and says how its own dark colors are written");
  // A blank page (the workbench's 新建页面): its main and nothing in it, which isBlankPage tells; a page with a board, or anything an Agent wrote, is none.
  const blankPage = newPageHtml("p-x", "空页", { blank: true });
  assert.ok(isBlankPage(blankPage) && !blankPage.includes("gallery-board") && blankPage.includes('<main class="gallery-page" data-page-id="p-x">'), "a blank page: an empty main");
  assert.ok(!isBlankPage(html), "one with a board is not blank");
  assert.ok(!isBlankPage(blankPage.replace("</main>", "<p>写了</p></main>")) && !isBlankPage(blankPage.replace("</main>", "</main><script>1</script>")), "nor one an Agent wrote in, or after");
  assert.ok(isBlankPage(blankPage.replace("</main>", "<!-- later --></main>")), "a comment is nothing");

  // Slugs: one set with the documents.
  fs.mkdirSync(at("notes"));
  fs.writeFileSync(at("notes", "doc.html"), "<!doctype html><main data-doc-id=\"notes\"></main>");
  assert.match(await pageSlugRefused("notes", root), /document's slug/);
  for (const kept of ["pages", "components", "exports", "con", "assets", "materials"]) assert.match(await pageSlugRefused(kept, root), /keeps for itself/, kept);
  assert.match(await pageSlugRefused("Not-A-Slug", root), /no slug/);
  assert.equal(await pageSlugRefused("home", root), null);
  const made = await createPage("home", "  首页  ", { root, icon: "🏠" });
  assert.equal(made.html, at("pages", "home", "page.html"));
  assert.deepEqual(JSON.parse(fs.readFileSync(made.json, "utf8")), { title: "首页", icon: "🏠" });
  assert.ok(pageExists("home", root) && !pageExists("none", root));
  assert.match(await pageSlugRefused("home", root), /exists already/);
  await assert.rejects(createPage("home", "又一个", { root }), { code: "EEXIST" });
  assert.ok(slugTaken("home", root), "a page's slug is taken for a new document too");
  fs.mkdirSync(at(".gallery", "trash", "abc-123"), { recursive: true });
  fs.writeFileSync(at(".gallery", "trash", "abc-123", "entry.json"), JSON.stringify({ id: "abc-123", slug: "binned", title: "扔掉的", at: 1, parent: "", index: -1 }));
  assert.match(await pageSlugRefused("binned", root), /in the trash/, "nor a slug of the trash's");
  assert.equal((await listTrash(root))[0].kind, "document", "an entry written before kinds came is a document's");

  // The list: the sidebar head's order, kept in the outline file; each page made last (after one where told); a folder with no page.html passed over.
  await createPage("zeta", "乙", { root });
  await createPage("alpha", "甲", { root });
  await createPage("reading", "读书", { root });
  fs.mkdirSync(at("pages", "half-made"));
  const slugsListed = async () => (await listPages(root)).map(({ slug }) => slug);
  assert.deepEqual(await slugsListed(), ["home", "zeta", "alpha", "reading"], "in the order they were made: each new page last among the head's rows");
  assert.deepEqual(await headOf(root), [HEAD_NEW, HEAD_SEARCH, "@home", "@zeta", "@alpha", "@reading"], "the head: 新建, 搜索, then the pages");
  assert.deepEqual(JSON.parse(fs.readFileSync(layoutOf(root).outline, "utf8")), { head: ["new", "search", "@home", "@zeta", "@alpha", "@reading"] }, "kept in the outline file, alone where it holds no tree yet");
  await createPage("after-home", "首页之后", { root, after: "home" });
  assert.deepEqual(await slugsListed(), ["home", "after-home", "zeta", "alpha", "reading"], "a page made after another: right after it (新建页面 of a page's menu)");
  fs.rmSync(pageFiles("after-home", root).folder, { recursive: true });
  // The tree written keeps the head; a head written keeps the tree.
  await writeOutline(root, { children: { "": [] } });
  assert.deepEqual(JSON.parse(fs.readFileSync(layoutOf(root).outline, "utf8")).head, ["new", "search", "@home", "@after-home", "@zeta", "@alpha", "@reading"], "a write of the tree keeps the head as it was (a page gone stays named: back in its place once restored)");
  await writeHead(root, ["search", "@alpha", "new"]);
  const file = JSON.parse(fs.readFileSync(layoutOf(root).outline, "utf8"));
  assert.ok(file.version === 2 && Array.isArray(file.groups) && file.children[""] && JSON.stringify(file.head) === '["search","@alpha","new"]', "a write of the head keeps the tree");
  assert.deepEqual(await headOf(root), ["search", "@alpha", "new", "@reading", "@home", "@zeta"], "pages it names not after it, by title as Chinese sorts (读书 首页 乙: du, shou, yi)");
  // No head kept (pages written by hand, an older Gallery's workspace): pages.order, then by title, no page first by its slug.
  fs.rmSync(layoutOf(root).outline);
  assert.deepEqual(await slugsListed(), ["reading", "alpha", "home", "zeta"], "by title, as Chinese sorts (读书 甲 首页 乙: du, jia, shou, yi): the home page among them");
  fs.writeFileSync(layoutOf(root).marker, JSON.stringify({ gallery: "workspace", version: 1, pages: { order: ["zeta", "home", "zeta", 3], homeMade: true } }));
  assert.deepEqual(pagesSettings(root), { order: ["zeta", "home"], homeMade: true }, "gallery.json's pages: its order (once each, slugs alone) and homeMade");
  assert.deepEqual(await slugsListed(), ["zeta", "home", "reading", "alpha"], "pages.order first, then by title");
  fs.writeFileSync(layoutOf(root).marker, "{ not json");
  assert.deepEqual(pagesSettings(root), { order: [], homeMade: false }, "a gallery.json that does not read says nothing");
  // homeMade written: every other key kept (pages.order, components), once; never into a gallery.json not ours or not reading.
  assert.equal(await markHomeMade(root), false, "a gallery.json that does not read: nothing written");
  assert.equal(fs.readFileSync(layoutOf(root).marker, "utf8"), "{ not json", "and left as it is");
  fs.writeFileSync(layoutOf(root).marker, JSON.stringify({ gallery: "else", pages: {} }));
  assert.equal(await markHomeMade(root), false, "another program's: nothing written");
  fs.writeFileSync(layoutOf(root).marker, JSON.stringify({ gallery: "workspace", version: 1, components: { hidden: ["quote"] }, pages: { order: ["zeta"] } }));
  assert.equal(await markHomeMade(root), true);
  assert.deepEqual(JSON.parse(fs.readFileSync(layoutOf(root).marker, "utf8")), { gallery: "workspace", version: 1, components: { hidden: ["quote"] }, pages: { order: ["zeta"], homeMade: true } }, "homeMade beside the order, the rest kept");
  const marked = fs.readFileSync(layoutOf(root).marker, "utf8");
  assert.equal(await markHomeMade(root), true);
  assert.equal(fs.readFileSync(layoutOf(root).marker, "utf8"), marked, "said already: nothing written again");
  assert.deepEqual(pagesSettings(root), { order: ["zeta"], homeMade: true });
  // Written into the file as it stands (a write no reader asked for, on a workspace's first start of a Gallery that makes the
  // home page): its line ends, indentation, lists on one line and BOM kept, the lines of homeMade (and of pages where there
  // was none) the only new ones, laid out as the members beside them are.
  const bom = String.fromCharCode(0xfeff);
  const markedAs = async (text) => {
    fs.writeFileSync(layoutOf(root).marker, text);
    assert.equal(await markHomeMade(root), true, text);
    return fs.readFileSync(layoutOf(root).marker, "utf8");
  };
  assert.equal(await markedAs(`${bom}{\r\n    "gallery": "workspace",\r\n    "version": 1,\r\n    "components": { "hidden": [], "disabled": ["local/a", "local/b"] }\r\n}\r\n`),
    `${bom}{\r\n    "gallery": "workspace",\r\n    "version": 1,\r\n    "components": { "hidden": [], "disabled": ["local/a", "local/b"] },\r\n    "pages": {\r\n        "homeMade": true\r\n    }\r\n}\r\n`,
    "CRLF, four spaces, a list on one line and a BOM: kept, pages added last as the file indents");
  assert.equal(await markedAs('{\n\t"gallery": "workspace",\n\t"pages": {\n\t\t"order": ["zeta", "home"]\n\t},\n\t"look": { "font": "serif" }\n}\n'),
    '{\n\t"gallery": "workspace",\n\t"pages": {\n\t\t"order": ["zeta", "home"],\n\t\t"homeMade": true\n\t},\n\t"look": { "font": "serif" }\n}\n',
    "tabs: homeMade after pages.order on a line of its own, pages where it stands");
  assert.equal(await markedAs('{ "gallery": "workspace", "version": 1 }'), '{ "gallery": "workspace", "version": 1, "pages": { "homeMade": true } }', "on one line: after it, on that line");
  assert.equal(await markedAs('{"gallery":"workspace","pages":{"order":[],"homeMade":false}}\n'), '{"gallery":"workspace","pages":{"order":[],"homeMade":true}}\n', "compact: homeMade false made true in its place");
  assert.equal(await markedAs('{\n  "gallery": "workspace",\n  "pages": "odd",\n  "version": 1\n}\n'), '{\n  "gallery": "workspace",\n  "pages": {\n    "homeMade": true\n  },\n  "version": 1\n}\n', "a pages that is no object: one in its place");
  assert.equal(await markedAs('{\n  "gallery": "workspace",\n  "pages": {}\n}\n'), '{\n  "gallery": "workspace",\n  "pages": {\n    "homeMade": true\n  }\n}\n', "an empty pages");
  assert.equal(await markedAs('{\n  "gallery": "workspace",\n  "note": "a \\"quoted\\" } brace",\n  "version": 1\n}\n'), '{\n  "gallery": "workspace",\n  "note": "a \\"quoted\\" } brace",\n  "version": 1,\n  "pages": {\n    "homeMade": true\n  }\n}\n', "a string holding quotes and a brace read past");
  const own = `${JSON.stringify(WORKSPACE_MARK, null, 2)}\n`;
  assert.equal(await markedAs(own), `${JSON.stringify({ ...WORKSPACE_MARK, pages: { homeMade: true } }, null, 2)}\n`, "Gallery's own gallery.json: as JSON.stringify lays it out");
  assert.deepEqual([homeTitle(), [...HOME_CARDS]], ["首页", ["gallery/today", "gallery/weather", "gallery/countdown", "gallery/habit", "gallery/stats", "gallery/todos", "gallery/heatmap", "gallery/recent", "gallery/note", "gallery/static"]], "the default home page: 首页, laid out on twelve by twelve cells (decided 2026-11-09): the greeting, the weather, a countdown, a habit, the numbers, the to-dos, the heatmap, the documents edited last, the note and a static card");
  assert.deepEqual(HOME_SIZES, { "gallery/habit": [2, 2], "gallery/todos": [4, 6], "gallery/note": [4, 4] }, "the home's cards not of their block's default size");
  // The home page's first-open note: closed once for the workspace, in .gallery/hints.json, other notes kept.
  assert.equal(homeHintClosed(root), false, "not closed yet");
  // A page's first-open note: shown where its page.json says hint, closed once for the workspace, in .gallery/hints.json, other notes kept.
  await createPage("tour", "导览", { root, hint: true, defaultCards: true });
  assert.deepEqual(JSON.parse(fs.readFileSync(pageFiles("tour", root).json, "utf8")), { title: "导览", defaultCards: true, hint: true }, "page.json says what any page may: its default cards and its note");
  assert.ok(pageDefaults("tour", root) && !pageDefaults("zeta", root) && !pageDefaults("none", root), "the default cards: the page's that says so alone");
  assert.equal(pageHintClosed(root, "tour"), false, "not closed yet");
  assert.ok(pageHintShown("tour", root) && !pageHintShown("zeta", root), "shown where page.json says hint");
  fs.writeFileSync(layoutOf(root).hints, "{ half");
  assert.equal(pageHintClosed(root, "tour"), false, "a hints.json that does not read: not closed");
  fs.writeFileSync(layoutOf(root).hints, JSON.stringify({ other: "2026-11-01T00:00:00.000Z" }));
  await closePageHint(root, "tour", "2026-11-07T08:00:00.000Z");
  assert.ok(pageHintClosed(root, "tour") && !pageHintShown("tour", root) && !pageHintClosed(root, "zeta"), "closed: that page's alone");
  assert.deepEqual(JSON.parse(fs.readFileSync(layoutOf(root).hints, "utf8")), { other: "2026-11-01T00:00:00.000Z", pages: { tour: "2026-11-07T08:00:00.000Z" } }, "kept beside the file's other notes, in .gallery/");
  fs.writeFileSync(layoutOf(root).hints, JSON.stringify({ home: "2026-11-01T00:00:00.000Z" }));
  assert.ok(pageHintClosed(root, "home") && homeHintClosed(root) && !pageHintClosed(root, "tour"), "the note closed as a Gallery said it before every page was alike (home: <when>): pages/home's");
  await closeHomeHint(root, "2026-11-08T00:00:00.000Z");
  assert.equal(JSON.parse(fs.readFileSync(layoutOf(root).hints, "utf8")).pages.home, "2026-11-08T00:00:00.000Z", "closeHomeHint, the older word: pages/home's note, as any page's");
  assert.equal(layoutOf(root).hints, at(".gallery", "hints.json"));
  assert.deepEqual(inPageOrder([{ slug: "b", title: "B" }, { slug: "a", title: "B" }, { slug: HOME, title: "Z" }]).map(({ slug }) => slug), ["a", "b", HOME], "the same title: by slug; the home page by its title as any");
  assert.deepEqual(pageMetaOf("x", { title: " ", icon: 3, defaultCards: "yes", hint: 1 }), { title: "x", icon: null, defaultCards: false, hint: false }, "no title: its slug; an icon that is no text: none; defaultCards and hint true or nothing");
  assert.match(await newPageSlug(root), /^page-[a-z][a-z0-9]{7}$/, "a new page's slug: page- and an id");
  fs.writeFileSync(pageFiles("alpha", root).json, "{ half");
  assert.deepEqual(await readPageMeta("alpha", root), { slug: "alpha", title: "alpha", icon: null, defaultCards: false, hint: false }, "a page.json that does not read: the slug");

  // A rename writes page.json's title alone: page.html as it was, the other fields kept.
  const before = fs.readFileSync(pageFiles("home", root).html, "utf8");
  assert.deepEqual(await renamePage("home", "  我的   首页 ", root), { slug: "home", title: "我的 首页", icon: "🏠", defaultCards: false, hint: false });
  assert.deepEqual(JSON.parse(fs.readFileSync(pageFiles("home", root).json, "utf8")), { title: "我的 首页", icon: "🏠" });
  assert.equal(fs.readFileSync(pageFiles("home", root).html, "utf8"), before, "page.html untouched");
  await assert.rejects(renamePage("home", "   ", root), { code: "title" });
  assert.equal(await renamePage("none", "名字", root), null, "a page not there");
  fs.rmSync(pageFiles("reading", root).json);
  assert.equal((await renamePage("reading", "书", root)).title, "书", "a page with no page.json gets one");

  // A page's version: of page.html and page.json, as they are.
  const version = await pageVersionNow("home", root);
  assert.match(version, /^[a-f0-9]{16}$/);
  assert.equal(version, pageVersion(fs.readFileSync(pageFiles("home", root).html, "utf8"), fs.readFileSync(pageFiles("home", root).json, "utf8")));
  await renamePage("home", "首页", root);
  assert.notEqual(await pageVersionNow("home", root), version, "page.json written: another version");
} finally {
  process.env.GALLERY_DEFAULT_WORKSPACE = savedHome;
  rmSync(root, { recursive: true, force: true });
}

// The sidebar's head (src/shared/sidebar-head.mjs): a stored head (keys once each, new, search, @<slug>), the
// rows in their order (new and search always, pages it names not after it), a row moved, a page's place.
{
  assert.deepEqual(storedHead(["new", "@a", "search"]), ["new", "@a", "search"]);
  for (const bad of [null, "new", ["new", "new"], ["@A"], ["@"], ["home"], [3]]) assert.equal(storedHead(bad), null, JSON.stringify(bad));
  assert.deepEqual(headOrder(null, ["a", "b"]), ["new", "search", "@a", "@b"], "none stored: 新建, 搜索, the pages");
  assert.deepEqual(headOrder(["@b", "search", "@gone"], ["a", "b"]), ["@b", "new", "search", "@a"], "a page gone passed over; 新建 before 搜索 where it names none; the rest after");
  assert.deepEqual(movedInHead(["new", "search", "@a", "@b"], "@b", "new"), ["@b", "new", "search", "@a"], "moved before a row");
  assert.deepEqual(movedInHead(["new", "search", "@a"], "new", null), ["search", "@a", "new"], "moved last");
  assert.deepEqual(headWithPage(null, ["new", "search", "@a"], "c", "a"), ["new", "search", "@a", "@c"], "a new page: after its page, the shown head standing for none stored");
  assert.deepEqual(headWithPage(["@a", "new", "search"], null, "c", "a"), ["@a", "@c", "new", "search"]);
  assert.deepEqual(headWithPage(["new", "search"], null, "c"), ["new", "search", "@c"], "else last");
}

// The cells a card is drawn at (the kit's board/, DocBoard.cellsOf), which a block reads as its size:
// data-w and data-h held to the manifest's range, 1 to 12 and 1 to 24, x so that the
// card stays on its row, a value that is no number the default 4 x 2 at 0, 0; never the raw attributes.
{
  const cells = (data) => cellsOf({ dataset: data });
  assert.deepEqual(cells({ x: "1", y: "2", w: "3", h: "4" }), { x: 1, y: 2, w: 3, h: 4 }, "a card in range: as written");
  assert.deepEqual(cells({ x: "0", y: "0", w: "4", h: "30" }), { x: 0, y: 0, w: 4, h: 24 }, "30 high: drawn, and said, 24 high");
  assert.deepEqual(cells({ x: "10", y: "-3", w: "20", h: "0" }), { x: 0, y: 0, w: 12, h: 1 }, "too wide: 12, at 0; under 1 high: 1; y at least 0");
  assert.deepEqual(cells({ x: "10", w: "4" }), { x: 8, y: 0, w: 4, h: 2 }, "past the row's end: moved back onto it");
  assert.deepEqual(cells({ w: "wide", h: "" }), { x: 0, y: 0, w: 4, h: 2 }, "no number: the default");
  assert.deepEqual([gridOf(1600), gridOf(943).columns, gridOf(600).columns, gridOf(272).cell], [{ columns: 12, cell: 64, width: 944, view: "wide" }, 8, 7, 56], "the kit's: twelve fixed cells of 64px, the narrow view's 8 where the board holds 8 to 11, a phone's room as many as it holds, smaller only under 4");
  // board.css's width of twelve columns is the rules': the board, the page's header and the home page's note at most that wide.
  const css = fs.readFileSync(new URL("../../src/render/kit/board/board.css", import.meta.url), "utf8");
  assert.equal(css.match(/--gallery-board-width: ([0-9]+)px/)?.[1], String(spanOf(GRID.columns, CELL)), "board.css's --gallery-board-width is twelve cells of CELL and their gaps");
  assert.ok(css.includes("grid-auto-rows: var(--gallery-cell, 64px)") && css.includes(`repeat(var(--gallery-columns), var(--gallery-cell, ${CELL}px))`), "and its cell before the script says one is CELL");
}

// The cards of a page.html as the server reads and writes them (src/shared/page-cards.mjs): each board's
// cards, the ids a page goes by (its own, else the lowest c<n>, a repeated or ill-formed one given another,
// the same however often read), a card's base, its cells written, a card taken out and put back byte for
// byte, a new card's markup at the board's indent, a card's markup alone, and the page as it is served
// (ids, bases, what each card's block is, a block that does not run held in a template).
{
  const card = (id, rest, inner = '<div data-doc-component="local/a"><p>x</p></div>') => `      <section class="gallery-card"${id === null ? "" : ` data-card-id="${id}"`} ${rest}>\n        ${inner}\n      </section>\n`;
  const page = `<!doctype html>\n<html><head><title>t</title></head><body>\n  <main class="gallery-page" data-page-id="p">\n    <div class="gallery-board" data-board-id="main">\n${card(null, 'data-x="0" data-y="0" data-w="4" data-h="2"')}${card("c1", 'data-x="4" data-y="0" data-w="4" data-h="2"')}${card("c1", 'data-x="8" data-y="0" data-w="40" data-h="x"')}${card("Bad Id", 'data-x="0" data-y="2" data-w="4" data-h="2"')}    </div>\n    <div class="gallery-board" data-board-id="side">\n    </div>\n  </main>\n</body></html>\n`;
  const { boards, cards } = readPage(page);
  assert.deepEqual(boards.map(({ id, cards: held }) => `${id}:${held.length}`), ["main:4", "side:0"]);
  assert.deepEqual(cards.map(({ id, x, y, w, h, block }) => `${id}@${x},${y},${w},${h}:${block}`), ["null@0,0,4,2:local/a", "c1@4,0,4,2:local/a", "c1@0,0,12,2:local/a", "Bad Id@0,2,4,2:local/a"], "as written; cells as the board draws them");
  assert.deepEqual(cardIds(cards), ["c2", "c1", "c3", "c4"], "the lowest c<n> none holds, for one with none, a repeated one and one that is no id");
  const { text: own, filled } = withCardIds(page);
  assert.deepEqual(filled, ["c2", "c3", "c4"]);
  assert.equal(withCardIds(own).text, own, "the same ids however often it is read");
  assert.ok(own.includes('<section class="gallery-card" data-card-id="c2" data-x="0"') && own.includes('data-card-id="c4" data-x="0" data-y="2"'), "written after the class, or in place of the one there");
  assert.equal(freeCardId(["c1", "c2", "c4"]), "c3");
  const listed = cardsOf(page);
  assert.ok(listed.every(({ base }) => /^[a-f0-9]{16}$/.test(base)) && new Set(listed.map(({ base }) => base)).size === 4, "a base each");
  assert.equal(cardsOf(page.replace("<p>x</p>", "<p>y</p>"))[0].base !== listed[0].base, true, "its instance changed: another base");
  assert.equal(cardsOf(page.replace("<title>t</title>", "<title>u</title>"))[0].base, listed[0].base, "the page's head changed: the same");
  const moved = withCells(own, new Map([["c2", { x: 0, y: 4, w: 4, h: 2 }]]));
  assert.equal(moved, own.replace('data-card-id="c2" data-x="0" data-y="0"', 'data-card-id="c2" data-x="0" data-y="4"'), "only the value that changed");
  const out = withoutCard(own, "c1");
  assert.ok(out.html.startsWith('<section class="gallery-card" data-card-id="c1" data-x="4"') && out.html.endsWith("</section>") && !out.text.includes('data-x="4" data-y="0"'));
  assert.equal(withoutCard(own, "none"), null);
  // A page written on one line, no line break at its end: the card alone taken out, the cards after it and the closing tags staying.
  const line = '<!doctype html><html><head><title>t</title></head><body><main class="gallery-page"><div class="gallery-board" data-board-id="main"><section class="gallery-card" data-card-id="c1" data-x="0" data-y="0" data-w="4" data-h="2"><div data-doc-component="local/a"></div></section><section class="gallery-card" data-card-id="c2" data-x="4" data-y="0" data-w="4" data-h="2"><div data-doc-component="local/a"></div></section></div></main></body></html>';
  const first = withoutCard(line, "c1");
  assert.equal(first.text, line.replace(first.html, ""), "one line: the card's markup alone");
  assert.deepEqual(readPage(first.text).cards.map(({ id }) => id), ["c2"], "the card after it stays");
  const second = withoutCard(line, "c2");
  assert.ok(second.text === line.replace(second.html, "") && second.text.endsWith("</section></div></main></body></html>"), "the last card: the closing tags stay");
  // A card that shares its line with the board's tags: its markup alone, the lines around it as they were; one on the last line of its own, with blanks after it, its line.
  const shared = '<div class="gallery-board" data-board-id="main"><section class="gallery-card" data-card-id="c1"><div data-doc-component="local/a"></div></section>\n  <section class="gallery-card" data-card-id="c2"><div data-doc-component="local/a"></div></section></div>\n';
  assert.equal(withoutCard(shared, "c1").text, '<div class="gallery-board" data-board-id="main">\n  <section class="gallery-card" data-card-id="c2"><div data-doc-component="local/a"></div></section></div>\n');
  assert.equal(withoutCard(shared, "c2").text, '<div class="gallery-board" data-board-id="main"><section class="gallery-card" data-card-id="c1"><div data-doc-component="local/a"></div></section>\n  </div>\n', "its indent stays with the end tag after it");
  const last = '<div class="gallery-board" data-board-id="main">\n  <section class="gallery-card" data-card-id="c1"><div data-doc-component="local/a"></div></section>  ';
  assert.equal(withoutCard(last, "c1").text, '<div class="gallery-board" data-board-id="main">\n', "on the last line, blanks after it: its line");
  const back = withCard(out.text, "main", out.html);
  assert.ok(back.text.includes(out.html) && back.text.split("\n").length === own.split("\n").length, "put back last on its board, on lines of its own");
  assert.equal(withCard(withoutCard(back.text, "c1").text, "main", out.html).text, back.text, "where it was last: byte for byte");
  const fresh = withCard(own, "side", cardMarkup({ id: "c9", x: 0, y: 0, w: 2, h: 2 }, '<div data-doc-component="local/b">\n  <p>新</p>\n</div>'));
  assert.ok(fresh.text.includes('    <div class="gallery-board" data-board-id="side">\n      <section class="gallery-card" data-card-id="c9" data-x="0" data-y="0" data-w="2" data-h="2">\n        <div data-doc-component="local/b">\n          <p>新</p>\n        </div>\n      </section>\n    </div>'), "a new card on an empty board, two spaces in from it, its instance two more");
  assert.equal(withCard(own, "none", out.html), null, "no such board");
  assert.ok(oneCard(out.html) && !oneCard("<p>x</p>") && !oneCard(`${out.html}${out.html}`) && !oneCard('<section class="gallery-card"><p>no instance</p></section>'), "one card holding an instance, and nothing else");
  assert.ok(cardWith(out.html, { id: "c7", x: 1, y: 2, w: 3, h: 4 }).startsWith('<section class="gallery-card" data-card-id="c7" data-x="1" data-y="2" data-w="3" data-h="4">'));
  const served = servedPage(page, { blockOf: (id) => (id === "local/a" ? { state: "document", fit: "content", bare: true } : null) });
  assert.ok(served.includes('data-ge-base="') && served.includes('data-ge-fit="content"') && served.includes("data-ge-bare") && served.includes('data-ge-state="document"') && served.includes('<template data-ge-held><div data-doc-component="local/a">'), "served: its base, its fit, bare, a block of documents held in a template");
  assert.equal(readPage(served).cards.map(({ id }) => id).join(), "c2,c1,c3,c4", "with the ids its first write gives it");
  assert.ok(!servedPage(page, { blockOf: () => null }).includes("<template"), "a block not there: the kit says so, nothing held");
}

// The instance a card holds, as the page's board reads it (src/editor/components/instances.mjs, the host's own mark) and as the
// server reads it (readPage): the same for every tag. A card of <article data-doc-component="local/memo"> is one with no instance for
// both, never an instance to the board that the service then refuses (a part's write: 409 "block"; page check fails it).
{
  const cases = {
    div: ['<div data-doc-component="local/memo"><p>a</p></div>', "local/memo"],
    section: ['<section data-doc-component="local/memo"><p>a</p></section>', "local/memo"],
    article: ['<article data-doc-component="local/memo"><p>a</p></article>', null],
    span: ['<span data-doc-component="local/memo">a</span>', null],
    none: ["<p>no instance</p>", null],
  };
  for (const [tag, [inner, block]] of Object.entries(cases)) {
    const html = `<!doctype html><html><head><title>t</title></head><body><main class="gallery-page"><div class="gallery-board" data-board-id="main"><section class="gallery-card" data-card-id="c1" data-x="0" data-y="0" data-w="4" data-h="2">${inner}</section></div></main></body></html>`;
    assert.equal(readPage(html).cards[0].block, block, `the server reads ${tag} as ${block}`);
    const card = new JSDOM(html).window.document.querySelector(".gallery-card");
    assert.equal(packageOf(instanceOf(card)), block, `and the board as the same: ${tag}`);
    assert.equal(instanceOf(card) === null, block === null, `its instance or none: ${tag}`);
  }
  const card = new JSDOM('<section class="gallery-card"><div data-doc-component="local/a"><article data-doc-component="local/b"><i id="in">x</i></article></div></section>').window.document.querySelector(".gallery-card");
  assert.equal(instanceAround(card.querySelector("#in")).getAttribute("data-doc-component"), "local/a", "what stands in an instance is in the nearest div or section of one, never an article's");
  assert.equal(instanceAround(card), null, "a card is in none");
}

console.log("Checked custom pages: pages/<slug>/ with page.html and page.json (the 写作偏好 page's folder apart), a new page's main, one board and no script, its title escaped; one set of slugs with the documents (a document's, a kept name, assets and materials, one of the trash refused); made once; listed in the sidebar head's order kept in the outline file (each new page last or after its page, the tree's writes keeping it and its writes the tree), those it names not by gallery.json's pages.order, then by title, no page first by its slug, a folder with no page.html passed over; a blank page; page.json's defaultCards and hint; a rename of page.json's title alone; a page's version; gallery.json's pages.homeMade written beside what else it holds (never into one not ours), into its own text, its layout kept, a page's note closed in .gallery/hints.json (the old home field read as pages/home's); the head's rows, moved and given a page; the cells a card is drawn at, which its block reads as its size (held to 12 by 24, never the raw attributes); the cards of a page.html as the server reads and writes them (ids filled, bases, cells written, a card out and back byte for byte, a new card at its board's indent, the page as served).");
