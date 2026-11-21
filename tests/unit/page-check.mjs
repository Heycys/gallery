import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GALLERYS_MARK, USERS_MARK, baselineOf, changesSaid, look, markedTheUsers, pageChanges, structureProblems } from "../../src/cli/page-check.mjs";
import { emptyRequired, emptyRequiredSaid } from "../../src/cli/page-check.mjs";
import { emptyRequiredOf, setsOf, settingsGiven } from "../../src/cli/page.mjs";
import { PAGE_ASIDE, PAGE_INSIDE_ALONE, cardChangesOf, outsideWhat, pageHost } from "../../src/cli/page-try.mjs";
import { drawn, trialSaid } from "../../src/cli/component-try.mjs";
import { answered, seconds, watching } from "../../src/cli/component-look.mjs";
import { closed } from "../../src/transfer/browser.mjs";
import { makeDefaultHome } from "../../src/editor/home-page.mjs";
import { WRITES_FILE, createPageService, pageWritesSince, withOwnAssets } from "../../src/editor/page-service.mjs";
import { withPageAssets } from "../../src/render/page-html.mjs";
import { readCatalog } from "../../src/shared/component-catalog.mjs";
import { cardsChanged, cardsOf as cardsOfHome, withCardIds } from "../../src/shared/page-cards.mjs";
import { pageFiles } from "../../src/shared/pages.mjs";
import { addShipped, shippedBlocks } from "../../src/shared/shipped-blocks.mjs";
import { ensureWorkspace, layoutOf } from "../../src/shared/workspace.mjs";

// gallery page check and gallery page try without a browser (src/cli/page-check.mjs, page-try.mjs; decided
// 2026-11-07): the structure a custom page is held to,
// each problem at its line of page.html (a page is free HTML: its own scripts, on… attributes,
// frames and stylesheets are none; no main.gallery-page where it has a board or a card, none needed
// where it has neither; a board or a card with no id, a bad one, one twice; a card outside a
// board, with no instance or two; cells that are no whole numbers, off the board or past the row's end;
// two cards sharing cells; a block not there, one of Gallery's own not added, one turned off, one of
// documents alone; a file of assets/ not there, a name the route serves none by, a picture written
// relative elsewhere, a frame of a file of assets/ that is no picture, which the route hands out for
// saving only; none of it for a stylesheet or a script there, which it serves as such, a link, a font, a
// video, a data part's script or a picture there); the changes between two
// versions (cards added, taken out, moved on their board or to another, resized, their data parts with
// the lines, a card's own markup, the page's own HTML, the blanks a card takes with it aside), the
// user's own marked by the page service's writes since (a reader's gestures, never gallery page add's),
// and the baseline they are told against (the last check that found nothing, else the page service's
// newest kept version, else none, each with its time); that a look counts the page's reads of the workspace
// while they wait (watching) and holds off calling a page still while one does (drawn's wait), which the
// look's pictures need, a server's first answer coming seconds after the page is drawn;
// that a look never waits without a bound (look with a browser whose calls hang one at a time: a step
// that is never answered, a look that is never done, a tab or a context that never closes, a tab or a
// context that never opens): a problem of the page naming what it waited for, the browser's closing left to the caller;
// what a page try says of a write outside the card's data parts (the card's place, another card, its
// own frame, the page's head) and of one inside them; and the addresses of a page's own files as the
// page is served (withPageAssets) and as a block's write brings them back (withOwnAssets).

const root = mkdtempSync(path.join(tmpdir(), "page-check-"));
try {
  await ensureWorkspace(root);
  const at = (...parts) => path.join(root, ...parts);
  // Gallery's note and habit, as gallery block add puts them in; a block of documents alone; one turned off.
  for (const block of shippedBlocks().filter(({ pack, name }) => pack === "gallery" && ["note", "habit"].includes(name))) addShipped(root, block);
  const writeBlock = (id, manifest) => {
    const folder = at("components", ...id.split("/"));
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "component.json"), JSON.stringify({ id, apiVersion: 1, version: "1.0.0", name: { zh: "块", en: "Block" }, description: { zh: "块", en: "Block" }, parts: {}, ...manifest }));
    fs.writeFileSync(path.join(folder, "template.html"), `<div data-doc-component="${id}"><p>x</p></div>\n`);
  };
  writeBlock("local/doc-only", {});
  writeBlock("local/off", { places: ["page"] });
  fs.writeFileSync(at("gallery.json"), `${JSON.stringify({ gallery: "workspace", version: 1, components: { disabled: ["local/off"] } }, null, 2)}\n`);
  const catalog = readCatalog(root);
  assert.ok(catalog.packages.has("gallery/note") && catalog.packages.has("gallery/habit") && catalog.packages.has("local/doc-only"), [...catalog.packages.keys()].join());

  const files = pageFiles("desk", root);
  fs.mkdirSync(path.join(files.folder, "assets"), { recursive: true });
  fs.writeFileSync(path.join(files.folder, "assets", "cover.png"), "png");
  const note = (text = "") => `<div data-doc-component="gallery/note">\n        <script type="application/json">{ "text": "${text}" }</script>\n      </div>`;
  const habit = (name = "") => `<div data-doc-component="gallery/habit">\n        <script type="application/json">{ "name": "${name}", "days": [] }</script>\n      </div>`;
  const page = ({ head = "", header = "<h1>桌面</h1>", cards }) => `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>桌面</title>
  <style>.hero { background: url(assets/cover.png); }</style>${head}
</head>
<body>
  <main class="gallery-page" data-page-id="desk">
    <header class="gallery-page-head">${header}</header>
    <div class="gallery-board" data-board-id="main">
${cards.map((card) => `      ${card}`).join("\n")}
    </div>
  </main>
</body>
</html>
`;
  const card = (attributes, inside) => `<section class="gallery-card" ${attributes}>\n      ${inside}\n      </section>`;
  const clean = page({ cards: [card('data-card-id="c1" data-x="0" data-y="0" data-w="4" data-h="2"', note()), card('data-card-id="c2" data-x="4" data-y="0" data-w="4" data-h="2"', habit())] });
  const check = (text) => structureProblems(text, { catalog, folder: files.folder, slug: "desk" });
  assert.deepEqual(check(clean), [], "a page as references/pages-and-data.md writes one: nothing wrong, the data parts' scripts of JSON among it");

  // A page is free HTML (the user's word of 2026-11-09): a script of its own, an on… attribute, a javascript:
  // address, a frame of a site, a stylesheet of its own are none of the check's problems.
  const running = page({ head: "\n  <script>alert(1)</script>\n  <link rel=\"stylesheet\" href=\"https://example.com/a.css\">", header: '<h1 onclick="go()">桌面</h1><a href="javascript:void 0">x</a><iframe src="https://example.com/"></iframe>', cards: [card('data-card-id="c1" data-x="0" data-y="0" data-w="4" data-h="2"', note())] });
  assert.deepEqual(check(running), [], "a page's own script, handler, frame and stylesheet: nothing wrong");
  // A page with no board and no card (its own HTML alone) needs no main.gallery-page; one with a board does.
  const free = '<!doctype html>\n<html lang="zh-CN">\n<head><meta charset="utf-8"><title>自由</title><style>body { margin: 0; }</style></head>\n<body>\n  <div id="app"></div>\n  <script type="module">document.querySelector("#app").textContent = "跑起来了";</script>\n</body>\n</html>\n';
  assert.deepEqual(check(free), [], "a page of its own HTML and script alone: nothing wrong, no main needed");

  // No main; boards and cards with no id, a bad one, one twice; a card outside a board; instances.
  const noMain = clean.replace('<main class="gallery-page" data-page-id="desk">', "<div>").replace("</main>", "</div>");
  assert.match(check(noMain).map(({ what }) => what).join("\n"), /no <main class="gallery-page">/);
  const ids = page({ cards: [
    card('data-x="0" data-y="0" data-w="4" data-h="2"', note()),
    card('data-card-id="C 2" data-x="4" data-y="0" data-w="4" data-h="2"', habit()),
    card('data-card-id="c3" data-x="8" data-y="0" data-w="4" data-h="2"', note()),
    card('data-card-id="c3" data-x="0" data-y="2" data-w="4" data-h="2"', note()),
    card('data-card-id="c5" data-x="4" data-y="2" data-w="4" data-h="2"', "<p>无实例</p>"),
    card('data-card-id="c6" data-x="8" data-y="2" data-w="4" data-h="2"', `${note()}${habit()}`),
  ] }).replace('<div class="gallery-board" data-board-id="main">', '<div class="gallery-board">\n      <section class="gallery-card" data-card-id="c9" data-x="0" data-y="9" data-w="2" data-h="2"></section>\n    </div>\n    <div class="gallery-board" data-board-id="main"><div><section class="gallery-card" data-card-id="c8"></section></div>');
  const said = check(ids).map(({ what }) => what);
  for (const want of [/^a board with no data-board-id/, /^a card with no data-card-id/, /^data-card-id="C 2": a card's id is lowercase letters/, /^data-card-id="c3" again \(line \d+ has it\)/, /^card c5 holds no instance of a custom block/, /^card c6 holds 2 instances: a card holds one/, /^a card \(class gallery-card\) that is no board's child/, /^card c9 holds no instance/]) {
    assert.ok(said.some((what) => want.test(what)), `${want}: ${said.join("\n")}`);
  }
  const twice = page({ cards: [card('data-card-id="c1" data-x="0" data-y="0" data-w="4" data-h="2"', note())] }).replace("</main>", '<div class="gallery-board" data-board-id="main"></div></main>');
  assert.ok(check(twice).some(({ what }) => /^data-board-id="main" again/.test(what)), "a board's id once");

  // Cells: whole numbers on the board, none shared.
  const cells = page({ cards: [
    card('data-card-id="c1" data-x="a" data-y="0" data-w="4" data-h="2"', note()),
    card('data-card-id="c2" data-y="0" data-w="13" data-h="0"', note()),
    card('data-card-id="c3" data-x="10" data-y="0" data-w="4" data-h="2"', note()),
    card('data-card-id="c4" data-x="0" data-y="4" data-w="4" data-h="2"', note()),
    card('data-card-id="c5" data-x="2" data-y="5" data-w="4" data-h="2"', note()),
    card('data-card-id="c6" data-x="6" data-y="4" data-w="2" data-h="2"', note()),
  ] });
  const cellsSaid = check(cells).map(({ what }) => what);
  for (const want of [/^card c1's data-x="a" is no whole number/, /^card c2 has no data-x/, /^card c2's data-w="13": w is 1 to 12/, /^card c2's data-h="0": h is 1 to 24/, /^card c3 reaches past the row's end: data-x 10 and data-w 4 make 14/, /^card c5 \(x 2, y 5, 4 × 2\) shares cells with card c4 \(x 0, y 4, 4 × 2\): no two cards of a board overlap/]) {
    assert.ok(cellsSaid.some((what) => want.test(what)), `${want}: ${cellsSaid.join("\n")}`);
  }
  assert.ok(!cellsSaid.some((what) => /card c6 .*shares/.test(what)), "a card beside another shares nothing");

  // Blocks: not there, one of Gallery's own not added, turned off, of documents alone.
  const blocks = page({ cards: ["local/none", "gallery/today", "local/off", "local/doc-only"].map((id, index) => card(`data-card-id="c${index + 1}" data-x="${index * 3}" data-y="0" data-w="3" data-h="2"`, `<div data-doc-component="${id}"></div>`)) });
  const blocksSaid = check(blocks).map(({ what }) => what);
  for (const want of [/^card c1's block local\/none: no custom block of that id in this workspace/, /^card c2's block gallery\/today: one of Gallery's own blocks, not yet in this workspace: gallery block add today/, /^card c3's block local\/off: turned off in 设置 › 组件列表/, /^card c4's block local\/doc-only: a block of documents \(its manifest's places has no "page"\)/]) {
    assert.ok(blocksSaid.some((what) => want.test(what)), `${want}: ${blocksSaid.join("\n")}`);
  }

  // Its own files: there, by a name the route serves; a picture written relative elsewhere; a link is none of it.
  const pictures = page({ header: '<h1>桌面</h1><img src="assets/cover.png" alt=""><img src="assets/gone.png" alt=""><img src="cover.png" alt=""><img src="assets/sub/a.png" alt=""><img src="/pages/desk/assets/cover.png" alt=""><img src="https://example.com/a.png" alt=""><img src="data:image/png;base64,AA==" alt=""><a href="reading">读书</a><a href="../notes/doc.html">笔记</a><i style="background: url(assets/none.png)"></i>', cards: [card('data-card-id="c1" data-x="0" data-y="0" data-w="4" data-h="2"', note())] });
  const picturesSaid = check(pictures).map(({ line, what }) => `${line} ${what}`);
  assert.equal(picturesSaid.length, 4, picturesSaid.join("\n"));
  for (const want of [/^10 <img>'s src "assets\/gone\.png": assets\/gone\.png is not in the page's folder/, /^10 <img>'s src "cover\.png" is relative to \/pages\/desk, where nothing is served: put the file in pages\/desk\/assets\//, /^10 <img>'s src "assets\/sub\/a\.png" names a file the server serves none by/, /^10 <i>'s style url\(\) "assets\/none\.png": assets\/none\.png is not in the page's folder/]) {
    assert.ok(picturesSaid.some((what) => want.test(what)), `${want}: ${picturesSaid.join("\n")}`);
  }
  // The route serves a page's own stylesheet and script as such, and hands any other file that is no picture
  // out for saving (octet-stream, nosniff, attachment): a frame of a file there downloads it; a stylesheet or a
  // script of assets/, a link to any file, a font, a video (which use its bytes) and a frame of a picture are none of it.
  for (const name of ["page.css", "app.js", "chart.html", "face.woff2", "clip.mp4", "notes.txt"]) fs.writeFileSync(path.join(files.folder, "assets", name), "x");
  const unshown = page({ head: '\n  <link rel="stylesheet" href="assets/page.css">\n  <style>@import url(assets/page.css); @font-face { font-family: Own; src: url(assets/face.woff2); }</style>\n  <script src="assets/app.js"></script>', header: '<h1>桌面</h1><iframe src="assets/chart.html"></iframe><video src="assets/clip.mp4" poster="assets/cover.png"></video><a href="assets/notes.txt" download>笔记</a><a href="assets/page.css">样式</a><iframe src="assets/cover.png"></iframe>', cards: [card('data-card-id="c1" data-x="0" data-y="0" data-w="4" data-h="2"', note())] });
  const unshownSaid = check(unshown).map(({ line, what }) => `${line} ${what}`);
  assert.equal(unshownSaid.length, 1, unshownSaid.join("\n"));
  assert.match(unshownSaid[0], /^13 <iframe>'s src "assets\/chart\.html": a frame of a file of the page's assets\/ downloads it and shows nothing, as the server hands out a page's own file that is no picture, stylesheet or script for saving only: write what it shows in the page itself, frame a site by its https address, or offer the file with a link, <a href="assets\/chart\.html" download>$/);

  // ---------- the changes ----------
  const later = page({
    header: "<h1>桌面</h1><p>新的一句</p>",
    cards: [
      card('data-card-id="c1" data-x="0" data-y="2" data-w="4" data-h="2"', note("买牛奶")),
      card('data-card-id="c3" data-x="8" data-y="0" data-w="4" data-h="4"', habit("喝水")),
      card('data-card-id="c4" data-x="0" data-y="0" data-w="4" data-h="2" title="新"', note()),
    ],
  });
  const before = page({ cards: [
    card('data-card-id="c1" data-x="0" data-y="0" data-w="4" data-h="2"', note()),
    card('data-card-id="c2" data-x="4" data-y="0" data-w="4" data-h="2"', habit()),
    card('data-card-id="c3" data-x="8" data-y="0" data-w="4" data-h="2"', habit("喝水")),
    card('data-card-id="c4" data-x="0" data-y="0" data-w="4" data-h="2"', note()),
  ] });
  const changes = pageChanges(before, later, catalog);
  assert.deepEqual(changes.removed.map(({ id }) => id), ["c2"]);
  assert.deepEqual([changes.moved.map(({ id }) => id), changes.resized.map(({ id }) => id)], [["c1"], ["c3"]]);
  assert.deepEqual(changes.data.map(({ id, parts }) => [id, parts.map(({ name }) => name)]), [["c1", ["note"]]], "the note's words alone: the habit kept its data");
  assert.deepEqual(changes.markup.map(({ id }) => id), ["c4"], "a card's own frame changed");
  assert.ok(changes.page && changes.page.removed === 1 && changes.page.added === 1, JSON.stringify(changes.page));
  const lines = changesSaid(changes, "then");
  assert.equal(lines[0], "Changes since then:");
  for (const want of ["  removed  c2 (gallery/habit), which stood at x 4, y 0, 4 × 2", "  moved    c1 (gallery/note): x 0, y 0, 4 × 2 then x 0, y 2, 4 × 2", "  resized  c3 (gallery/habit): x 8, y 0, 4 × 2 then x 8, y 0, 4 × 4", "  data     c1 (gallery/note): note (-1 +1 of its 1 line)", '           - { "text": "" }', '           + { "text": "买牛奶" }', "  markup   c4 (gallery/note): its markup outside its place and its data parts", "  page     its own HTML outside the cards: -1 +1 of its 15 lines"]) {
    assert.ok(lines.includes(want), `${want}\n${lines.join("\n")}`);
  }
  // A card added, the line it takes with it no change of the page's own; nothing changed; one card kept.
  const added = pageChanges(clean.replace(/\n      <section class="gallery-card" data-card-id="c2"[\s\S]*?<\/section>/, ""), clean, catalog);
  assert.deepEqual([added.added.map(({ id }) => id), added.page, added.kept], [["c2"], null, 1], JSON.stringify(added));
  assert.deepEqual(changesSaid(added, "then").slice(1), ["  added    c2 (gallery/habit) at x 4, y 0, 4 × 2", "  The other card as it was."]);
  assert.deepEqual(changesSaid(pageChanges(clean, clean, catalog), "then"), ["No change since then: every card where it was, with the data it had."]);
  // Ids the page service gives the cards that have none are no change.
  assert.equal(pageChanges(clean.replace(' data-card-id="c1"', ""), clean, catalog).kept, 2, "c1 by the id the page gives it");
  // A card moved to another board at the same cells is moved, each place said with its board.
  const twoBoards = (sideCards, mainCards) => page({ cards: mainCards }).replace("    </div>\n  </main>", `    </div>\n    <div class="gallery-board" data-board-id="side">\n${sideCards.map((one) => `      ${one}`).join("\n")}\n    </div>\n  </main>`);
  const c4 = card('data-card-id="c4" data-x="0" data-y="0" data-w="4" data-h="2"', note());
  const c1 = card('data-card-id="c1" data-x="4" data-y="0" data-w="4" data-h="2"', note());
  const across = pageChanges(twoBoards([c1], [c4]), twoBoards([c1, c4], []), catalog);
  assert.deepEqual([across.moved.map(({ id }) => id), across.resized, across.page, across.kept], [["c4"], [], null, 1], JSON.stringify(across));
  assert.ok(changesSaid(across, "then").includes("  moved    c4 (gallery/note): x 0, y 0, 4 × 2 on main then x 0, y 0, 4 × 2 on side"), changesSaid(across, "then").join("\n"));
  assert.deepEqual(cardsChanged(twoBoards([c1], [c4]), twoBoards([c1, c4], [])), { c4: ["cells"] }, "the page service tells a card on another board as its cells");
  assert.match(outsideWhat(twoBoards([c1], [c4]), twoBoards([c1, c4], []), "c1", { ...catalog.packages.get("gallery/note"), parts: {} }), /^card c4 \(gallery\/note\)'s place, x 0, y 0, w 4, h 2 on main then x 0, y 0, w 4, h 2 on side/, "and page try a card another gesture moved to another board");

  // The user's own changes, marked: those the page service's writes by the page (a reader's gesture)
  // made since the baseline, by card and by kind; gallery page add's (by the Agent) not, nor a change of
  // another kind on a card the page also changed.
  assert.deepEqual(cardsChanged(before, later), { c1: ["cells", "content"], c2: ["removed"], c3: ["cells"], c4: ["content"] });
  const marked = markedTheUsers(changes, [
    { at: 1, op: "place", by: "page", cards: { c1: ["cells"] } },
    { at: 2, op: "edit", by: "page", cards: { c4: ["content"] } },
    { at: 3, op: "add", by: "agent", cards: { c2: ["removed"], c3: ["cells"] } },
  ]);
  assert.deepEqual([marked.moved, marked.data, marked.markup, marked.removed, marked.resized].map((list) => list.map(({ id, user }) => `${id} ${user}`)), [["c1 true"], ["c1 false"], ["c4 true"], ["c2 false"], ["c3 false"]]);
  const markedSaid = changesSaid(marked, "then");
  assert.ok(markedSaid.includes(`  moved    c1 (gallery/note): x 0, y 0, 4 × 2 then x 0, y 2, 4 × 2 ${USERS_MARK}`) && markedSaid.includes("  data     c1 (gallery/note): note (-1 +1 of its 1 line)") && markedSaid.includes(`  markup   c4 (gallery/note): its markup outside its place and its data parts ${USERS_MARK}`), markedSaid.join("\n"));
  assert.match(markedSaid.at(-1), /^ {2}Each change marked \(the user's, on the page\) is the user's own gesture on the page since then .*: leave it as it is, never put it back\.$/);
  assert.ok(!changesSaid(changes, "then").some((line) => line.includes(USERS_MARK)), "nothing marked where the page wrote nothing");

  // The baseline: none; the page service's newest kept version; the last check that found nothing,
  // each with its time, which the page's writes since are told by.
  assert.equal(await baselineOf(root, "desk"), null);
  const kept = at(".gallery", "state", "pages", "desk");
  fs.mkdirSync(kept, { recursive: true });
  fs.writeFileSync(path.join(kept, "001762500000000-0001.html"), "older");
  fs.writeFileSync(path.join(kept, "001762500000001-0002.html"), "newer");
  const fromService = await baselineOf(root, "desk");
  assert.ok(fromService.text === "newer" && fromService.at === 1762500000001 && /^the page as it was before its last write \(\d{4}-\d\d-\d\d \d\d:\d\d, local time; used because no check has passed yet\)$/.test(fromService.since), JSON.stringify(fromService));
  fs.mkdirSync(at(".gallery", "qa", "desk"), { recursive: true });
  fs.writeFileSync(at(".gallery", "qa", "desk", "checked.html"), "checked");
  fs.utimesSync(at(".gallery", "qa", "desk", "checked.html"), new Date(1762600000000), new Date(1762600000000));
  const fromCheck = await baselineOf(root, "desk");
  assert.ok(fromCheck.text === "checked" && fromCheck.at === 1762600000000 && fromCheck.since.startsWith("the last check that found nothing ("), JSON.stringify(fromCheck));
  // The page service's writes since a time, as it tells them (a line it cannot read skipped).
  fs.writeFileSync(path.join(kept, WRITES_FILE), `${JSON.stringify({ at: 1762599999999, op: "place", by: "page", cards: { c1: ["cells"] } })}\nnot json\n${JSON.stringify({ at: 1762600000000, op: "edit", by: "page", cards: { c2: ["content"] } })}\n`);
  assert.deepEqual((await pageWritesSince(at(".gallery", "state"), "desk", fromCheck.at)).map(({ op }) => op), ["edit"], "at the baseline's time or after");
  assert.deepEqual(await pageWritesSince(at(".gallery", "state"), "none", 0), [], "a page the service never wrote");

  // The cards Gallery put on the default home page are its own, neither the user's nor the Agent's: an
  // Agent's first check of a new workspace's home page (the page as it was before the write that put
  // them there is its baseline: no check has found nothing yet) tells them marked GALLERYS_MARK, and a
  // reader's own 恢复默认卡片 from the sidebar, a write by the page, stays the user's.
  {
    const fresh = mkdtempSync(path.join(tmpdir(), "page-check-home-"));
    try {
      await ensureWorkspace(fresh);
      const made = await makeDefaultHome(fresh, { env: {} });
      assert.equal(made.did, "made", JSON.stringify(made));
      const state = layoutOf(fresh).state;
      const homeText = fs.readFileSync(pageFiles("home", fresh).html, "utf8");
      const first = await baselineOf(fresh, "home");
      assert.ok(first && first.since.startsWith("the page as it was before its last write ("), JSON.stringify(first));
      const written = await pageWritesSince(state, "home", first.at);
      assert.deepEqual(written.map(({ op, by }) => [op, by]), [["restore-defaults", "gallery"]], "Gallery's own write is told as Gallery's, not as a reader's gesture");
      const homeCatalog = readCatalog(fresh);
      const fromStart = markedTheUsers(pageChanges(first.text, homeText, homeCatalog), written);
      assert.deepEqual(fromStart.added.map(({ id, user, gallery }) => [id, user, gallery]), Array.from({ length: 10 }, (_, index) => [`c${index + 1}`, false, true]), "every default card (HOME_CARDS) of Gallery's own write");
      const said = changesSaid(fromStart, first.since);
      for (const [id, block, x, y, w, h] of [["c1", "gallery/today", 0, 0, 4, 2], ["c2", "gallery/weather", 4, 0, 4, 2], ["c3", "gallery/countdown", 8, 0, 2, 2], ["c4", "gallery/habit", 10, 0, 2, 2], ["c5", "gallery/stats", 0, 2, 8, 2], ["c6", "gallery/todos", 8, 2, 4, 6], ["c7", "gallery/heatmap", 0, 4, 8, 4], ["c8", "gallery/recent", 0, 8, 4, 4], ["c9", "gallery/note", 4, 8, 4, 4], ["c10", "gallery/static", 8, 8, 4, 4]]) {
        assert.ok(said.includes(`  added    ${id} (${block}) at x ${x}, y ${y}, ${w} × ${h} ${GALLERYS_MARK}`), said.join("\n"));
      }
      assert.ok(!said.join("\n").includes(USERS_MARK), "none of them the user's");
      assert.match(said.at(-1), /^ {2}Each change marked \(put there by Gallery\) is Gallery's own doing, not the user's and not yours: .*leave it as it is\.$/);
      assert.ok(!changesSaid(pageChanges(first.text, homeText, homeCatalog), first.since).join("\n").includes(GALLERYS_MARK), "nothing marked where the page's writes are not looked at");

      // The reader takes the weather off (a write by the page), an Agent's check finds nothing and keeps the
      // page as it was then (Gallery's own write is before it: none of it is told again), and the reader's
      // 恢复默认卡片 puts the weather back (a write by the page): that card is the user's, not Gallery's.
      const service = createPageService({ root: fresh, edits: null, stateDirectory: state, catalog: () => readCatalog(fresh) });
      const base = (id) => cardsOfHome(fs.readFileSync(pageFiles("home", fresh).html, "utf8")).find((card) => card.id === id).base;
      const [, taken] = await service.apply("home", { op: "remove", card: "c2", base: base("c2") });
      assert.ok(taken.ok, JSON.stringify(taken));
      await new Promise((resolve) => setTimeout(resolve, 20));
      const checkedHome = path.join(layoutOf(fresh).qa, "home", "checked.html");
      fs.mkdirSync(path.dirname(checkedHome), { recursive: true });
      fs.writeFileSync(checkedHome, fs.readFileSync(pageFiles("home", fresh).html, "utf8"));
      await new Promise((resolve) => setTimeout(resolve, 20));
      const [, restored] = await service.apply("home", { op: "restore-defaults" });
      assert.deepEqual(restored.added.map(({ block }) => block), ["gallery/weather"]);
      assert.deepEqual((await pageWritesSince(state, "home", 0)).map(({ op, by }) => [op, by]), [["restore-defaults", "gallery"], ["remove", "page"], ["restore-defaults", "page"]], "the journal: Gallery's own, then the reader's two");
      const second = await baselineOf(fresh, "home");
      assert.ok(second.since.startsWith("the last check that found nothing ("), second.since);
      const later = markedTheUsers(pageChanges(second.text, fs.readFileSync(pageFiles("home", fresh).html, "utf8"), homeCatalog), await pageWritesSince(state, "home", second.at));
      const laterSaid = changesSaid(later, second.since);
      assert.ok(laterSaid.includes(`  added    c2 (gallery/weather) at x 4, y 0, 4 × 2 ${USERS_MARK}`), laterSaid.join("\n"));
      assert.ok(!laterSaid.join("\n").includes(GALLERYS_MARK), "a reader's own restore is the user's, not Gallery's");
    } finally {
      rmSync(fresh, { recursive: true, force: true });
    }
  }

  // ---------- page try: a write outside the card's data parts ----------
  const found = catalog.packages.get("gallery/note");
  const data = { ...found, parts: Object.fromEntries(Object.entries(found.parts).filter(([, part]) => part.edit === "data")) };
  const inside = cardChangesOf(clean, clean.replace('{ "text": "" }', '{"text":"买牛奶"}'), { card: "c1", found: data });
  assert.deepEqual([inside.parts.map(({ name }) => name), inside.outside, inside.gone], [["note"], null, false], "the card's data part alone");
  const otherCard = cardChangesOf(clean, clean.replace('{ "name": "", "days": [] }', '{ "name": "x", "days": [] }'), { card: "c1", found: data });
  assert.deepEqual([otherCard.parts.length, otherCard.outside.what], [0, "card c2 (gallery/habit)"]);
  const placeToo = cardChangesOf(clean, clean.replace('data-card-id="c2" data-x="4" data-y="0"', 'data-card-id="c2" data-x="4" data-y="2"').replace('{ "text": "" }', '{"text":"a"}'), { card: "c1", found: data });
  assert.deepEqual([placeToo.parts.map(({ name }) => name), placeToo.outside.what], [["note"], "card c2 (gallery/habit)'s place, x 4, y 0, w 4, h 2 then x 4, y 2, w 4, h 2"]);
  assert.equal(outsideWhat(withCardIds(clean).text, withCardIds(clean.replace('data-card-id="c1"', 'data-card-id="c1" title="t"')).text, "c1", data), "card c1 (gallery/note)'s own frame (an attribute of its <section> but its place)");
  assert.equal(outsideWhat(clean, clean.replace("<title>桌面</title>", "<title>书桌</title>"), "c1", data), "the page's own HTML outside its cards (its head, its style, its header)");
  assert.equal(outsideWhat(clean, clean.replace("<title>桌面</title>", "<title>书桌</title>").replace('{ "name": "", "days": [] }', '{ "name": "x", "days": [] }'), "c1", data), "card c2 (gallery/habit); the page's own HTML outside its cards (its head, its style, its header)", "both, each named");
  assert.equal(cardChangesOf(clean, clean.replace(/<section class="gallery-card" data-card-id="c1"[\s\S]*?<\/section>/, ""), { card: "c1", found: data }).gone, true, "the card gone");
  const host = pageHost({ card: "c1", found });
  assert.deepEqual([host.where, host.aside, host.inside, host.outside], [{ card: "c1" }, PAGE_ASIDE, PAGE_INSIDE_ALONE, "problem"]);
  const step = { said: "a press on .x", parts: [{ name: "note", removed: 1, added: 1, lines: 1, runs: [{ removed: ['{ "text": "" }'], added: ['{"text":"a"}'] }] }], outside: null, taken: 0 };
  const okSaid = trialSaid({ slug: "desk", name: "page.html", steps: [{ kind: "press" }], keep: false, host }, { steps: [step], problems: [], notes: [], undone: 1, presses: 1, readBack: true });
  assert.deepEqual(okSaid.lines.slice(0, 2), ["Gesture: a press on .x", `Wrote: note (-1 +1 of its 1 line); ${PAGE_INSIDE_ALONE}`]);
  assert.ok(okSaid.lines.includes("Undone: one Ctrl+Z, and the copy of page.html is as it was (card ids aside)") && okSaid.code === 0, okSaid.lines.join("\n"));
  const outSaid = trialSaid({ slug: "desk", name: "page.html", steps: [{ kind: "press" }], keep: false, host }, { steps: [{ ...step, outside: placeToo.outside }], problems: [{ where: "page.html:12", what: `the press changed page.html outside ${host.outsideSaid(placeToo.outside)}` }], notes: [], undone: 1, presses: 1 });
  assert.equal(outSaid.lines[1], "Wrote: note (-1 +1 of its 1 line); and outside card c1's data parts: card c2 (gallery/habit)'s place, x 4, y 0, w 4, h 2 then x 4, y 2, w 4, h 2, where a reader's gesture on the card is to change its data parts alone");
  assert.ok(outSaid.lines.includes("  FAIL page.html:12: the press changed page.html outside card c1's data parts: card c2 (gallery/habit)'s place, x 4, y 0, w 4, h 2 then x 4, y 2, w 4, h 2, where a reader's gesture on the card is to change its data parts alone") && outSaid.code === 1, outSaid.lines.join("\n"));

  // ---------- a page's own files' addresses ----------
  const served = withPageAssets('<img src="assets/cover.png" srcset="assets/cover.png 1x, ./assets/big.png 2x"><i style="background: url(assets/cover.png#x)"></i><a href="assets/doc.pdf?v=1">a</a><img src="assets/sub/a.png"><img src="cover.png"><style>.a { background: url("assets/b.png") }</style>', "desk");
  assert.equal(served, '<img src="/pages/desk/assets/cover.png" srcset="/pages/desk/assets/cover.png 1x, /pages/desk/assets/big.png 2x"><i style="background: url(/pages/desk/assets/cover.png#x)"></i><a href="/pages/desk/assets/doc.pdf?v=1">a</a><img src="assets/sub/a.png"><img src="cover.png"><style>.a { background: url("/pages/desk/assets/b.png") }</style>', "each file of assets/ where the server serves it; what it serves none of as written");
  assert.equal(withPageAssets("<p>no files</p>", "desk"), "<p>no files</p>");
  assert.equal(withOwnAssets('<img src="/pages/desk/assets/cover.png" srcset="/pages/desk/assets/a.png 1x,/pages/desk/assets/b.png 2x"><i style="background:url(/pages/desk/assets/c.png)"></i><img src="/pages/other/assets/d.png">', "desk"), '<img src="assets/cover.png" srcset="assets/a.png 1x,assets/b.png 2x"><i style="background:url(assets/c.png)"></i><img src="/pages/other/assets/d.png">', "a block's write brings its page's own addresses back as the folder's");
  assert.equal(layoutOf(root).scratch, at(".gallery", "try"));

  // ---------- a look waits for what the page reads of the workspace ----------
  // The page a look pictures is given watchQueries' script (watching): each fetch of the query route is
  // counted while it waits, with the block whose kit.js asked (read from the stack), and drawn does not
  // call an instance still while one waits (`wait` ms at most): the first answer of a server that has not
  // read the workspace's documents yet comes seconds after the page is drawn, which a look took for the
  // page's stillness (found testing the skill with Agents, 2026-11-09: the home page's todos, recent and stats pictured empty,
  // the check printing OK). Run here in node, a fake fetch and location in place of the page's.
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const had = { fetch: globalThis.fetch, location: globalThis.location, frames: globalThis.requestAnimationFrame };
  try {
    const answers = [];
    globalThis.location = { href: "http://127.0.0.1:4317/pages/home" };
    globalThis.requestAnimationFrame = (frame) => setTimeout(frame, 0);
    globalThis.fetch = () => new Promise((resolve, reject) => answers.push({ resolve, reject }));
    delete globalThis.__galleryQueries;
    watching("/__gallery/workspace/query");
    const watch = globalThis.__galleryQueries;
    // A read asked from a script of that name (a block's kit.js as the page loads it), or from none.
    const asked = (address, from = null) => (from ? new Function("ask", `return ask();\n//# sourceURL=http://127.0.0.1:4317/__gallery/components/${from}/kit.js?v=1`)(() => globalThis.fetch(address)) : globalThis.fetch(address));
    asked("/__gallery/workspace/query?kind=todos&options=%7B%7D", "gallery/todos").catch(() => {});
    asked("http://127.0.0.1:4317/__gallery/workspace/query?kind=stats").catch(() => {});
    asked("/pages/home/assets/a.png"); // another address: not a read of the workspace
    asked("/__gallery/workspace/todo"); // nor is the route of a to-do's check, which starts with the same words
    assert.deepEqual([...watch.pending.values()].map(({ kind, block }) => [kind, block]), [["todos", "gallery/todos"], ["stats", null]]);
    answers[0].resolve({ ok: true });
    await pause(0);
    assert.deepEqual([...watch.pending.values()].map(({ kind }) => kind), ["stats"], "an answer takes its read out");
    answers[1].reject(new Error("offline"));
    await pause(0);
    assert.equal(watch.pending.size, 0, "so does a refusal");
    watching("/other");
    assert.equal(globalThis.__galleryQueries, watch, "a page that has the script has it once");

    // drawn: the instance holds still for 3 looks a step apart; while a read waits it does not.
    let shown = "empty";
    const host = { get outerHTML() { return shown; } };
    const answeredLater = () => { const read = asked("/__gallery/workspace/query?kind=recent"); return pause(240).then(() => answers.at(-1).resolve({ ok: true })).then(() => pause(40)).then(() => { shown = "drawn"; }).then(() => read); };
    const first = answeredLater();
    assert.equal(await drawn(host, { still: 3000, step: 20 }), "empty", "with no wait, the page is still while it waits for the answer, as every look took it");
    await first;
    shown = "empty";
    const second = answeredLater();
    assert.equal(await drawn(host, { still: 1000, step: 20, wait: 3000 }), "drawn", "with wait, it holds still once the answer has drawn what it reads, though the answer took longer than the still");
    await second;
    // A read nothing answers is waited for `wait` ms and no longer.
    asked("/__gallery/workspace/query?kind=todos").catch(() => {});
    const began = Date.now();
    assert.equal(await drawn(host, { still: 1000, step: 20, wait: 400 }), "drawn");
    assert.ok(Date.now() - began >= 400 && Date.now() - began < 2000, `waited ${Date.now() - began} ms for a read nothing answers, wait being 400`);
  } finally {
    for (const [name, value] of [["fetch", had.fetch], ["location", had.location], ["requestAnimationFrame", had.frames]]) {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    }
    delete globalThis.__galleryQueries;
  }

  // ---------- a card that asks for what no one gave ----------
  // A block's setting that is `required` (weather's city, countdown's date), left empty in a card's settings part and
  // with no default, is a note: the card draws its ask for one, and no picture says what it is for (found testing the
  // skill with Agents, 2026-11-09: a weather card handed over with `{}`, the check printing OK). One with a value, a default, or
  // no such setting is none; a part that is no JSON is another check's.
  {
    for (const block of shippedBlocks().filter(({ pack, name }) => pack === "gallery" && ["weather", "countdown", "todos"].includes(name))) addShipped(root, block);
    const held = readCatalog(root);
    const weather = (json) => `<div data-doc-component="gallery/weather"><script type="application/json">${json}</script></div>`;
    const countdown = (json) => `<div data-doc-component="gallery/countdown"><script type="application/json">${json}</script></div>`;
    const at = (n) => `data-card-id="c${n}" data-x="${(n - 1) % 3 * 4}" data-y="${Math.floor((n - 1) / 3) * 2}" data-w="4" data-h="2"`;
    const asking = page({ cards: [
      card(at(1), weather("{}")),
      card(at(2), weather('{"city":"上海","unit":"℃"}')),
      card(at(3), countdown('{"title":"春节"}')),
      card(at(4), countdown('{"title":"春节","date":"2027-02-06"}')),
      card(at(5), weather('{"city":"  "}')),
      card(at(6), `<div data-doc-component="gallery/todos"><script type="application/json">{}</script></div>`),
      card(at(7), weather("{not json")),
    ] });
    const found = emptyRequired(asking, held);
    assert.deepEqual(found.map(({ id, block, empty }) => [id, block, empty.map(({ key }) => key)]), [["c1", "gallery/weather", ["city"]], ["c3", "gallery/countdown", ["date"]], ["c5", "gallery/weather", ["city"]]]);
    assert.deepEqual(found.map(({ line }) => line), [found[0].line, found[1].line, found[2].line].sort((a, b) => a - b), "each at its card's line, in the page's order");
    assert.equal(emptyRequiredSaid(found[0]), "card c1 (gallery/weather) holds no city (City, 城市) in its settings, which it cannot show anything without: it shows its ask for one (the grip at its top right › 设置…), and no picture of the page shows what it is for. Ask the user for it, or take it from what the workspace says (写作偏好, the documents), write it in the card's settings part, and tell them in the handoff which you did");
    assert.deepEqual(emptyRequired(clean, held), [], "a page of cards whose blocks need nothing");
    // The weather block's manifest says which of its settings is the one it cannot do without.
    const city = held.packages.get("gallery/weather").settings;
    assert.deepEqual(city.map(({ key, required }) => [key, required ?? false]), [["city", true], ["unit", false]]);
    assert.deepEqual(emptyRequiredOf(held.packages.get("gallery/weather"), { unit: "℉" }).map(({ key }) => key), ["city"]);
    assert.deepEqual(emptyRequiredOf(held.packages.get("gallery/weather"), { city: "Berlin" }), []);

    // gallery page add's --set: each key=value taken out of the command line (and --set=key=value), the words after the
    // first "=" the value, whatever they hold; a --set with no value, or no key, a mistake.
    assert.deepEqual(setsOf(["add", "home", "weather", "--set", "city=上海", "--x", "4", "--set=unit=℉", "--set", "title=a=b"]), { argv: ["add", "home", "weather", "--x", "4"], given: [["city", "上海"], ["unit", "℉"], ["title", "a=b"]] });
    assert.deepEqual(setsOf(["add", "home", "weather", "--", "--set", "city=x"]), { argv: ["add", "home", "weather", "--", "--set", "city=x"], given: [] }, "after -- it is an argument");
    for (const bad of [["--set"], ["--set", "city"], ["--set", "=x"], ["--set="]]) assert.throws(() => setsOf(bad), (error) => error.name === "UsageError" && /--set takes a setting's key and its value/.test(error.message), bad.join(" "));
    // Each value held to its field's type, before anything is written.
    const weatherBlock = held.packages.get("gallery/weather");
    assert.deepEqual(settingsGiven([["city", "上海"], ["unit", "℉"]], weatherBlock), { city: "上海", unit: "℉" });
    const refused = (sets, block = weatherBlock) => { try { settingsGiven(sets, block); } catch (error) { return error.name === "UsageError" ? error.message : String(error); } return null; };
    assert.equal(refused([["town", "x"]]), 'gallery/weather has no setting "town": its settings are city (City), unit (Unit).');
    assert.equal(refused([["unit", "K"]]), "The setting unit of gallery/weather is one of ℃, ℉: --set unit=<one of them>.");
    assert.equal(refused([["city", "a"], ["city", "b"]]), "--set city is given twice.");
    assert.equal(refused([["date", "x"]], held.packages.get("gallery/countdown")), "The setting date of gallery/countdown is a date, written YYYY-MM-DD: --set date=2027-02-06.");
    assert.equal(refused([["date", "2027-2-6"]], held.packages.get("gallery/countdown")), "The setting date of gallery/countdown is a date, written YYYY-MM-DD: --set date=2027-02-06.");
    assert.deepEqual(settingsGiven([["date", "2027-02-06"], ["title", "春节"]], held.packages.get("gallery/countdown")), { date: "2027-02-06", title: "春节" });
    assert.equal(refused([["done", "maybe"]], held.packages.get("gallery/todos")), "The setting done of gallery/todos is a switch: --set done=true or --set done=false.");
    assert.deepEqual(settingsGiven([["done", "yes"]], held.packages.get("gallery/todos")), { done: true });
    assert.equal(refused([["x", "1"]], { id: "local/plain", settings: [] }), 'local/plain has no setting "x": it has no settings.');
  }

  // ---------- a look never waits without a bound ----------
  // Found testing the skill with Agents, 2026-11-09: a page check waited 15 minutes at its second picture, the page drawn and the
  // browser answering another connection. Here a browser whose calls hang one at a time stands for it.
  {
    const never = () => new Promise(() => {});
    const quick = { answer: 200, loading: 400, ready: 400, closing: 100, looking: 30_000 };
    // A tab of a fake browser: each method answers at once unless `hang` names it; `first` is what the first look finds on the page.
    const browserOf = ({ hang = [], onlyFrom = 0, cards = [] } = {}) => {
      const log = { tabs: 0, closed: 0, contexts: 0, contextsClosed: 0, pictures: [] };
      const tabOf = (number) => {
        const stuck = (name) => number >= onlyFrom && hang.includes(name);
        const call = (name, value) => (...args) => (stuck(name) ? never() : Promise.resolve(typeof value === "function" ? value(...args) : value));
        return {
          on() {},
          evaluateOnNewDocument: call("evaluateOnNewDocument", undefined),
          createCDPSession: call("createCDPSession", { send: async () => {}, on() {} }),
          setViewport: call("setViewport", undefined),
          emulateMediaFeatures: call("emulateMediaFeatures", undefined),
          goto: call("goto", undefined),
          waitForSelector: call("waitForSelector", undefined),
          evaluate: call("evaluate", (fn) => (fn.name === "looked" ? { cards: number === 0 ? cards : [], broken: [], stuck: [], wide: 0, columns: null } : true)),
          $: call("$", { evaluate: async () => "still" }),
          screenshot: call("screenshot", ({ path: file }) => log.pictures.push(file)),
          close: () => { log.closed += 1; return stuck("close") ? never() : Promise.resolve(); },
        };
      };
      const context = {
        newPage: () => { const number = log.tabs++; return number >= onlyFrom && hang.includes("newPage") ? never() : Promise.resolve(tabOf(number)); },
        close: () => { log.contextsClosed += 1; return hang.includes("contextClose") ? never() : Promise.resolve(); },
      };
      return { log, browser: { connected: true, once() {}, createBrowserContext: () => { log.contexts += 1; return hang.includes("createBrowserContext") ? never() : Promise.resolve(context); } } };
    };
    const run = async (options, limits = quick) => {
      const { log, browser } = browserOf(options);
      const began = Date.now();
      const seen = await look(browser, { address: "http://127.0.0.1:4317/pages/try-x", out: path.join(root, "pictures"), limits });
      return { seen, log, ms: Date.now() - began };
    };

    const whole = await run();
    assert.deepEqual([whole.seen.stuck, whole.seen.unverified, whole.seen.problems.length, whole.seen.pictures.length, whole.log.closed], [false, null, 0, 6, 6], "a browser that answers: six pictures, six tabs closed");

    // A picture that is never taken: the step's bound, the tab that will not close let go, the context too, the first problem named.
    const shot = await run({ hang: ["screenshot", "close", "contextClose"] });
    assert.equal(shot.seen.stuck, true);
    assert.equal(shot.seen.pictures.length, 0);
    assert.equal(shot.seen.problems.length, 1, JSON.stringify(shot.seen.problems));
    assert.match(shot.seen.problems[0].what, /^the browser did not answer within 0\.2 s, waiting until the page was pictured; the look stopped here and the browser was closed, so the looks after it were not made\. A script of the page that never ends does this/);
    assert.deepEqual(shot.seen.problems[0].looks, ["1280 light"]);
    assert.deepEqual([shot.log.tabs, shot.log.closed, shot.log.contextsClosed], [1, 1, 1], "the tab and the context asked to close, and not waited for");
    assert.ok(shot.ms < 4500, `a look that never gets its picture ends in ${shot.ms} ms`);

    // A step the browser never answers at the second look: the first look's picture and findings stand, the later looks are not made.
    const second = await run({ hang: ["$"], onlyFrom: 1, cards: [{ id: "c1", block: "gallery/note", out: true, tall: null, wide: null, fallback: false, error: null, broken: [] }] });
    assert.equal(second.seen.stuck, true);
    assert.equal(second.seen.pictures.length, 1, "the first look's picture");
    assert.equal(second.seen.problems.length, 2, JSON.stringify(second.seen.problems));
    assert.deepEqual([second.seen.problems[0].what, second.seen.problems[0].looks], ["it is drawn out of its board", ["1280 light"]]);
    assert.match(second.seen.problems[1].what, /^the browser did not answer within 0.2 s, waiting until the page's main was found; the look stopped here/);
    assert.deepEqual(second.seen.problems[1].looks, ["1280 dark"]);
    assert.equal(second.log.tabs, 2, "no third tab");

    // A tab that never opens, a context that never opens.
    const noTab = await run({ hang: ["newPage"], onlyFrom: 1 });
    assert.match(noTab.seen.problems.at(-1).what, /waiting until a tab opened; the look stopped here/);
    assert.equal(noTab.seen.pictures.length, 1);
    const noContext = await run({ hang: ["createBrowserContext"] });
    assert.match(noContext.seen.problems[0].what, /waiting until a browser context opened; the look stopped here and the browser was closed, so the looks after it were not made/);
    assert.deepEqual(noContext.seen.problems[0].looks, ["1280 light"], "said at the first look: none had begun");

    // The page that never draws and the one that never opens, said as the step they wait on.
    const undrawn = await run({ hang: ["waitForSelector"] });
    assert.match(undrawn.seen.problems[0].what, /^the browser did not answer within 0\.4 s, waiting until the page was drawn \(its html got data-doc-drawn\); /);
    const unopened = await run({ hang: ["goto"] });
    assert.match(unopened.seen.problems[0].what, /^the browser did not answer within 0\.4 s, waiting until the page opened; /);

    // What no step's bound holds, a look that goes on past its own (the whole look's): the steps' bounds
    // are long here, the look's short, and what it waited for is said as that.
    const slow = await run({ hang: ["screenshot"] }, { ...quick, answer: 3000, looking: 300 });
    assert.equal(slow.seen.stuck, true);
    assert.match(slow.seen.problems[0].what, /^the look was not done in 0\.3 s, waiting until the page was pictured; the look stopped here and the browser was closed/);
    assert.ok(slow.ms < 4500, `ended in ${slow.ms} ms`);

    // closed: waited for ms at most, and never failing; answered says how long it waited.
    const began = Date.now();
    assert.equal(await closed(never(), 80), undefined);
    assert.ok(Date.now() - began >= 70 && Date.now() - began < 1500);
    assert.equal(await closed(Promise.reject(new Error("gone"))), undefined);
    assert.equal(await closed(Promise.resolve(7)), 7);
    await assert.rejects(answered(never(), "a step", 50), (error) => error.stuck && error.doing === "a step" && error.limit === 50);
    assert.deepEqual([seconds(30_000), seconds(300), seconds(1500), seconds(120_000)], ["30 s", "0.3 s", "1.5 s", "120 s"]);
  }
} finally {
  rmSync(root, { recursive: true, force: true });
}
console.log("Checked gallery page check and page try without a browser: a page's structure, each problem at its line (a page's own scripts, frames and stylesheets none of them, no main where it has a board, ids missing, bad or twice, a card outside a board, with no instance or two, cells off the board, past its row or shared, blocks not there, not added, turned off or of documents alone, its own files not there, named as the route serves none, or written relative elsewhere; nothing of a link or a data part's script); its changes since a version (added, taken out, moved, resized, data with its lines, a card's own markup, the page's own HTML; the ids the service gives and the blanks a card takes with it aside) and the baseline they are told against; what page try says of a write outside the card's data parts and inside them; and a page's own files addressed where the server serves them, and back; a look counting the page's reads of the workspace while they wait (with the block whose kit.js asked) and drawn not calling the page still while one does, for the wait it is given and no longer; and that a look never waits without a bound (a step, a whole look, a tab, a context or a browser that does not answer, open or close: a problem naming what it waited for).");
