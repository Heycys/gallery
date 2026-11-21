import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createEditService } from "../../src/editor/service.mjs";
import { KEEP, WRITES_FILE, createPageService } from "../../src/editor/page-service.mjs";
import { withPageAssets } from "../../src/render/page-html.mjs";
import { readCatalog } from "../../src/shared/component-catalog.mjs";
import { jsonIn } from "../../src/shared/json-layout.mjs";
import { freeSpot } from "../../src/shared/board-places.mjs";
import { baseOf, cardsOf, readPage, servedPage, withCardIds } from "../../src/shared/page-cards.mjs";
import { HOME_CARDS, createPage, homeCardsTold, pageFiles, pageHintClosed, pageVersion } from "../../src/shared/pages.mjs";
import { packsDirectory, projectRoot } from "../../src/shared/paths.mjs";
import { ensureWorkspace, layoutOf } from "../../src/shared/workspace.mjs";

// The page service (src/editor/page-service.mjs): POST /__gallery/pages/<slug>/cards over a
// server of its own, in a workspace of its own, with the edit service's checks (Host, Origin, the token,
// JSON) and its queue: each op by card id against that card's base (refused changed, refused gone), a
// write of someone else's elsewhere in the page leaving it working, ids filled on the first write, add by
// the first free spot and the block's default size (Gallery's own put in first), remove and the add that
// puts it back as it was, edit and settings through the editor's rewrite of a data part, arrange (a
// move's undo), the versions kept (KEEP), restore-defaults (a page's whose page.json says defaultCards, the default home's: its default cards it
// misses put in at free spots, Gallery's own put in first, one turned off skipped, nothing else written);
// POST hint (a page's first-open note closed, that page's alone); and GET library.

const root = mkdtempSync(path.join(tmpdir(), "page-service-"));
const state = mkdtempSync(path.join(tmpdir(), "page-service-state-"));
const shipped = mkdtempSync(path.join(tmpdir(), "page-service-shipped-"));
await ensureWorkspace(root);
const fixtures = path.join(projectRoot, "tests", "fixtures", "page-blocks");
fs.cpSync(path.join(fixtures, "local"), path.join(root, "components", "local"), { recursive: true });
fs.cpSync(path.join(projectRoot, "tests", "fixtures", "components", "local", "tally"), path.join(root, "components", "local", "tally"), { recursive: true });
fs.cpSync(path.join(fixtures, "shipped"), shipped, { recursive: true });
fs.writeFileSync(layoutOf(root).marker, `${JSON.stringify({ gallery: "workspace", version: 1, components: { disabled: ["local/span"] } }, null, 2)}\n`);

await createPage("home", "首页", { root, defaultCards: true });
const files = pageFiles("home", root);
const instance = (id, inner = "") => `<div data-doc-component="${id}">${inner}</div>`;
const card = (id, x, y, w, h, block, inner) => `      <section class="gallery-card"${id ? ` data-card-id="${id}"` : ""} data-x="${x}" data-y="${y}" data-w="${w}" data-h="${h}">\n        ${instance(block, inner)}\n      </section>\n`;
const first = fs.readFileSync(files.html, "utf8").replace('<div class="gallery-board" data-board-id="main">\n', (board) => board
  + card(null, 0, 0, 4, 2, "local/memo", '<script type="application/json" class="memo-data">{ "text": "早" }</script>')
  + card(null, 4, 0, 4, 2, "local/prefs", '<script type="application/json" class="prefs-settings">{\n          "title": "旧标题"\n        }</script>')
  + card("keep", 8, 0, 4, 2, "local/hello", "<p>你好</p>")
  + card("low", 0, 2, 4, 2, "local/tally", "<h3>计数</h3>"));
fs.writeFileSync(files.html, first);

const edits = createEditService({ stateDirectory: state, finish: (text) => text });
let taken = 0;
// As the server makes it (src/server/routes.mjs): the parts its edits answer with as the page shows them.
const service = createPageService({ root, edits, stateDirectory: state, catalog: () => readCatalog(root), catalogTaken: () => { taken += 1; }, shipped, shown: withPageAssets });
const server = http.createServer((request, response) => {
  const [, slug, what] = request.url.match(/^\/__gallery\/pages\/([a-z0-9-]+)\/(cards|library|hint|picture)/) ?? [];
  if (!slug) {
    response.statusCode = 404;
    return response.end();
  }
  service.handle(request, response, slug, what);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const host = `127.0.0.1:${server.address().port}`;
const post = async (body, { token = edits.token, origin = `http://${host}`, type = "application/json", slug = "home" } = {}) => {
  const response = await fetch(`http://${host}/__gallery/pages/${slug}/cards`, { method: "POST", headers: { "Content-Type": type, Origin: origin, "X-Gallery-Token": token }, body: typeof body === "string" ? body : JSON.stringify(body) });
  return { status: response.status, ...(await response.json()) };
};
const read = () => fs.readFileSync(files.html, "utf8");
const cardIn = (text, id) => readPage(text).cards.find((one) => one.id === id);
const base = (id) => baseOf(withCardIds(read()).text, cardIn(withCardIds(read()).text, id));
const kept = () => fs.readdirSync(path.join(state, "pages", "home")).filter((name) => name.endsWith(".html"));

try {
  // The checks every write of the server has.
  assert.equal((await post({ op: "remove", card: "keep", base: "x" }, { token: "nope" })).status, 403, "another token");
  assert.equal((await post({ op: "remove", card: "keep", base: "x" }, { origin: "http://evil.example" })).status, 403, "another origin");
  assert.equal((await post("op=remove", { type: "text/plain" })).status, 415, "no JSON");
  assert.equal((await post({ op: "nothing" })).reason, "op");
  assert.equal((await post({ op: "remove", card: "keep", base: "x" }, { slug: "none" })).status, 404, "no such page");
  assert.equal((await post({ op: "remove", card: "keep", base: "x", workspace: tmpdir() })).reason, "elsewhere", "a command of another workspace");
  assert.equal(read(), first, "nothing written by any of them");

  // The page as served: each card with the id its first write will give it, and its base.
  const shown = servedPage(first, { blockOf: (id) => ({ "local/memo": { state: "page" }, "local/hello": { state: "page", bare: true }, "local/prefs": { state: "page" }, "local/tally": { state: "document" } })[id] ?? null });
  const servedIds = readPage(shown).cards.map((one) => one.id);
  assert.deepEqual(servedIds, ["c1", "c2", "keep", "low"], "the cards with no id served as c1 and c2");
  const servedBase = /data-card-id="c1"/.test(shown) && shown.match(/data-ge-base="([a-f0-9]{16})" data-card-id="c1"/)?.[1];
  assert.equal(servedBase, base("c1"), "and with their bases");
  assert.match(shown, /data-ge-state="document"[^>]*>\s*<template data-ge-held><div data-doc-component="local\/tally">/, "a block of documents alone held in a template");

  // place: c2 onto c1's spot; c1 under it; ids filled; the file kept before.
  const placed = await post({ op: "place", card: "c2", x: 0, y: 0, w: 4, h: 2, base: base("c2") });
  assert.equal(placed.ok, true, JSON.stringify(placed));
  const meta = fs.readFileSync(files.json, "utf8");
  assert.equal(placed.version, pageVersion(read(), meta));
  assert.equal(placed.before, pageVersion(first, meta), "applied to the version the page was served");
  assert.deepEqual(placed.cards.map(({ id, x, y }) => `${id}@${x},${y}`), ["c1@0,2", "c2@0,0", "keep@8,0", "low@0,4"], "c1 pushed under c2, the card under it under c1");
  assert.ok(placed.cards.every((one) => one.base === base(one.id)), "each card's base as the file has it now");
  assert.match(read(), /<section class="gallery-card" data-card-id="c1" data-x="0" data-y="2"/, "the ids written with the first write, after the class");
  assert.equal(kept().length, 1);
  assert.equal(fs.readFileSync(path.join(state, "pages", "home", kept()[0]), "utf8"), first, "the file as it was, kept");
  // Every other byte stays.
  assert.equal(read().replace(/ data-card-id="c[12]"/g, "").replace(/data-x="\d+" data-y="\d+"/g, ""), first.replace(/data-x="\d+" data-y="\d+"/g, ""));

  // Held to the card's base: changed by someone else, refused; gone, refused; another card changed, it goes on.
  const stale = base("keep");
  fs.writeFileSync(files.html, read().replace("<p>你好</p>", "<p>你好呀</p>"));
  assert.deepEqual(await post({ op: "remove", card: "keep", base: stale }), { status: 409, ok: false, refused: "changed" });
  assert.deepEqual(await post({ op: "remove", card: "gone", base: stale }), { status: 409, ok: false, refused: "gone" });
  const elsewhere = await post({ op: "place", card: "c2", x: 0, y: 0, w: 4, h: 2, base: base("c2") });
  assert.equal(elsewhere.ok, true, "a card someone else changed is no matter of another's");
  fs.writeFileSync(files.html, read().replace("</title>", "</title>\n  <meta name=\"description\" content=\"头\">"));
  const afterHead = await post({ op: "place", card: "low", x: 4, y: 2, w: 4, h: 2, base: base("low") });
  assert.equal(afterHead.ok, true, "nor the page's head");
  assert.notEqual(afterHead.before, elsewhere.version, "and its answer says the page was written meanwhile (before is not the last version it gave)");

  // A resize: the nearest of the sizes; held to min and max; none for a block that does not resize.
  const memo = cardIn(read(), "c1");
  const sized = await post({ op: "place", card: "c1", x: memo.x, y: memo.y, w: 5, h: 4, base: base("c1") });
  assert.deepEqual([sized.cards.find((one) => one.id === "c1").w, sized.cards.find((one) => one.id === "c1").h], [4, 4], "memo: 5x4 asked, 4x4 its nearest size");
  assert.equal((await post({ op: "place", card: "c2", x: 0, y: 0, w: 5, h: 4, base: base("c2") })).reason, "resize", "prefs does not resize");
  assert.equal((await post({ op: "place", card: "keep", x: 8, y: 0, w: 2, h: 2, base: base("keep") })).reason, "resize", "hello does not resize");
  // A move that pushes, and its undo (arrange) that puts them back up.
  const before = cardsOf(read());
  const pushing = await post({ op: "place", card: "keep", x: 0, y: 0, w: 6, h: 1, base: base("keep") });
  assert.equal(pushing.reason, "resize");
  const moving = await post({ op: "place", card: "low", x: 0, y: 0, w: 4, h: 2, base: base("low") });
  const pushed = moving.cards.filter((one) => before.find((was) => was.id === one.id && (was.x !== one.x || was.y !== one.y)));
  assert.ok(pushed.length >= 2, `low moved to the top pushed c2 and what is under it: ${JSON.stringify(moving.cards)}`);
  const undone = await post({ op: "arrange", cards: pushed.map((one) => ({ card: one.id, ...before.find((was) => was.id === one.id), base: base(one.id) })) });
  assert.deepEqual(undone.cards.map(({ id, x, y, w, h }) => `${id}@${x},${y},${w},${h}`), before.map(({ id, x, y, w, h }) => `${id}@${x},${y},${w},${h}`), "arrange: every card back where it was");
  assert.equal((await post({ op: "arrange", cards: [{ card: "low", x: 0, y: 0, w: 4, h: 2, base: "stale" }] })).refused, "changed");

  // add: the first free spot, the block's first size; or where it is told; refused for a block of documents, one turned off, one not there.
  const spot = freeSpot(cardsOf(read()), { w: 4, h: 2 });
  const added = await post({ op: "add", block: "local/memo" });
  assert.equal(added.ok, true, JSON.stringify(added));
  const made = added.cards.find((one) => one.id === added.card);
  assert.deepEqual({ x: made.x, y: made.y, w: made.w, h: made.h, block: made.block }, { ...spot, w: 4, h: 2, block: "local/memo" }, "the first free spot, memo's first size 4x2");
  assert.ok(added.html.startsWith(`<section class="gallery-card" data-card-id="c3" data-x="${spot.x}" data-y="${spot.y}" data-w="4" data-h="2">\n        <div data-doc-component="local/memo">\n          <script type="application/json" class="memo-data">`), `a card of its template, as far in as the board's cards: ${added.html}`);
  assert.equal(added.measure, false);
  assert.deepEqual(added.pushed, [], "a free spot: none pushed");
  const unpushed = cardsOf(read());
  const told = await post({ op: "add", block: "local/prefs", board: "main", x: 0, y: 0 });
  assert.deepEqual(told.cards.filter((one) => one.y === 0 || one.id === told.card).map(({ id, x, y }) => `${id}@${x},${y}`).find((one) => one.startsWith(told.card)), `${told.card}@0,0`, "put where it is told, those it meets pushed down");
  const movedIds = told.cards.filter((one) => one.id !== told.card && unpushed.some((was) => was.id === one.id && was.y !== one.y)).map(({ id }) => id);
  assert.ok(movedIds.length > 0 && JSON.stringify([...told.pushed].sort()) === JSON.stringify(movedIds.sort()), `pushed: the ids of the cards it moved down, and only those: ${JSON.stringify({ pushed: told.pushed, movedIds })}`);
  assert.equal((await post({ op: "add", block: "local/tally" })).reason, "places", "a block of documents alone");
  assert.equal((await post({ op: "add", block: "local/span" })).reason, "disabled", "a block turned off");
  assert.equal((await post({ op: "add", block: "local/none" })).reason, "missing");
  // Gallery's own, not yet in the workspace: put in, then the card.
  assert.equal(fs.existsSync(path.join(root, "components", "gallery", "tile")), false);
  const tile = await post({ op: "add", block: "gallery/tile" });
  assert.equal(tile.ok, true, JSON.stringify(tile));
  assert.ok(fs.existsSync(path.join(root, "components", "gallery", "tile", "component.json")) && taken === 1, "gallery/tile copied into components/, the catalog taken at once");
  assert.deepEqual(tile.cards.find((one) => one.id === tile.card).w, 2, "at its own size");

  // A block that says no height (no card): added 4 x 2 with `measure`, and placed at the height the page measured though it does not resize; its width stays its own.
  const plain = path.join(root, "components", "local", "plain");
  fs.mkdirSync(plain, { recursive: true });
  fs.writeFileSync(path.join(plain, "component.json"), JSON.stringify({ id: "local/plain", apiVersion: 1, version: "1.0.0", name: { zh: "无高", en: "Plain" }, description: { zh: "不写高度", en: "No height" }, words: "plain", parts: { text: { at: ":scope > p", edit: "none" } }, places: ["page"] }));
  fs.writeFileSync(path.join(plain, "template.html"), '<div data-doc-component="local/plain"><p>字</p></div>\n');
  const measured = await post({ op: "add", block: "local/plain" });
  const made2 = measured.cards.find((one) => one.id === measured.card);
  assert.ok(measured.ok && measured.measure === true && made2.w === 4 && made2.h === 2, JSON.stringify(measured));
  const taller = await post({ op: "place", card: measured.card, x: made2.x, y: made2.y, w: 4, h: 3, base: base(measured.card) });
  assert.equal(taller.cards.find((one) => one.id === measured.card).h, 3, "its height the page measured");
  assert.equal((await post({ op: "place", card: measured.card, x: made2.x, y: made2.y, w: 5, h: 3, base: base(measured.card) })).reason, "resize", "its width its own");
  assert.equal((await post({ op: "remove", card: measured.card, base: base(measured.card) })).ok, true);

  // remove, and the add that puts it back: the file as it was, byte for byte.
  const withTile = read();
  const removed = await post({ op: "remove", card: tile.card, base: base(tile.card) });
  assert.equal(removed.removed.id, tile.card);
  assert.ok(!read().includes("gallery/tile"));
  const back = await post({ op: "add", html: removed.removed.html, board: removed.removed.board });
  assert.equal(back.card, tile.card);
  assert.equal(read(), withTile, "put back as it was");
  assert.equal((await post({ op: "add", html: '<section class="gallery-card" data-card-id="x"><div data-doc-component="local/hello" onclick="x()"><p>a</p></div></section>' })).reason, "html", "nothing that would run");
  assert.equal((await post({ op: "add", html: "<p>no card</p>" })).reason, "html");

  // edit: a data part, through the editor's rewrite; what is not one refused.
  const edited = await post({ op: "edit", card: "c1", part: "note", html: '{ "text": "早上好" }', base: base("c1") });
  assert.equal(edited.ok, true, JSON.stringify(edited));
  assert.deepEqual(edited.parts.note, { was: '{ "text": "早" }', now: '{ "text": "早上好" }' });
  assert.ok(read().includes('<script type="application/json" class="memo-data">{ "text": "早上好" }</script>'));
  assert.equal((await post({ op: "edit", card: "c1", part: "note", html: '{ "text": "</script><script>x()" }', base: base("c1") })).reason, "part", "what would end the script");
  assert.equal((await post({ op: "edit", card: "c1", part: "title", html: "x", base: base("c1") })).reason, "part", "no such data part");
  assert.equal((await post({ op: "edit", card: "c1", parts: { note: '{ "text": "两部分" }' }, base: base("c1") })).ok, true, "parts: several at once");

  // settings: validated by the manifest's fields, written as the part was laid out.
  const set = await post({ op: "settings", card: "c2", values: { title: "新标题", count: 7, mode: "详细", day: "2026-11-08", framed: true, doc: "notes" }, base: base("c2") });
  assert.equal(set.ok, true, JSON.stringify(set));
  assert.equal(JSON.stringify(JSON.parse(set.parts.settings.now)), JSON.stringify({ title: "新标题", count: 7, mode: "详细", day: "2026-11-08", framed: true, doc: "notes" }));
  assert.equal(set.parts.settings.now, jsonIn(set.parts.settings.was, { title: "新标题", count: 7, mode: "详细", day: "2026-11-08", framed: true, doc: "notes" }), "laid out as the kit lays its JSON out (jsonIn)");
  assert.ok(read().includes(`class="prefs-settings">${set.parts.settings.now}</script>`));
  for (const values of [{ nope: 1 }, { count: "seven" }, { mode: "别的" }, { day: "明天" }, { framed: "yes" }]) assert.equal((await post({ op: "settings", card: "c2", values, base: base("c2") })).reason, "values", JSON.stringify(values));
  assert.equal((await post({ op: "settings", card: "c1", values: {}, base: base("c1") })).reason, "settings", "a block with no settings");
  // add with settings (gallery page add --set): the card made with them in the one write, held to the same fields; a value the block
  // refuses, or a block with none, refuses the add and writes nothing.
  const withValues = await post({ op: "add", block: "local/prefs", settings: { title: "带设置的", count: 3 } });
  assert.equal(withValues.ok, true, JSON.stringify(withValues));
  assert.ok(/"title":s*"带设置的"/.test(withValues.html) && /"count":s*3/.test(withValues.html), withValues.html);
  const unset = read();
  for (const settings of [{ count: "seven" }, { nope: 1 }]) assert.equal((await post({ op: "add", block: "local/prefs", settings })).reason, "values", JSON.stringify(settings));
  assert.equal((await post({ op: "add", block: "local/memo", settings: { a: 1 } })).reason, "settings", "a block with no settings");
  assert.equal(read(), unset, "a refused add writes nothing");

  // Several ops at once: one at a time, each on what the one before wrote. The two requests may reach
  // the server in either order, so whichever came second is applied to what the first wrote.
  const [one, two] = await Promise.all([
    post({ op: "place", card: "keep", x: 8, y: 6, w: 4, h: 2, base: base("keep") }),
    post({ op: "edit", card: "c1", part: "note", html: '{ "text": "一起" }', base: base("c1") }),
  ]);
  assert.ok(one.ok && two.ok && (two.before === one.version || one.before === two.version), "the second applied to what the first wrote", JSON.stringify({ one, two }));
  assert.ok(read().includes('{ "text": "一起" }') && cardsOf(read()).some((card) => card.id === "keep" && card.x === 8 && card.y === 6), "both written");

  // The versions kept: the last KEEP.
  for (let n = 0; n < KEEP + 3; n++) await post({ op: "edit", card: "c1", part: "note", html: `{ "text": "${n}" }`, base: base("c1") });
  assert.equal(kept().length, KEEP);

  // A part holding a picture of the page's own: the page sends it as served (/pages/<slug>/assets/…),
  // the file holds assets/…, and the answer's parts are as the page shows them, so that its undo puts
  // back a picture that loads, and sending one back writes the file's form again. Put on by an add that
  // says agent: true, as gallery page add's does.
  const pic = path.join(root, "components", "local", "pic");
  fs.mkdirSync(pic, { recursive: true });
  fs.writeFileSync(path.join(pic, "component.json"), JSON.stringify({ id: "local/pic", apiVersion: 1, version: "1.0.0", name: { zh: "图", en: "Picture" }, description: { zh: "一张图", en: "A picture" }, words: "pic", parts: { body: { at: ":scope > div.pic-body", edit: "data" } }, places: ["page"], card: { w: 4, h: 2 } }));
  fs.writeFileSync(path.join(pic, "template.html"), '<div data-doc-component="local/pic"><div class="pic-body"><img src="assets/cover.png" alt=""></div></div>\n');
  const picture = await post({ op: "add", block: "local/pic", agent: true });
  assert.equal(picture.ok, true, JSON.stringify(picture));
  const drawn = await post({ op: "edit", card: picture.card, part: "body", html: '<img src="/pages/home/assets/cover.png" alt=""><p>封面</p>', base: base(picture.card) });
  assert.deepEqual(drawn.parts.body, { was: '<img src="/pages/home/assets/cover.png" alt="">', now: '<img src="/pages/home/assets/cover.png" alt=""><p>封面</p>' }, "the parts as the page shows them");
  assert.ok(read().includes('<div class="pic-body"><img src="assets/cover.png" alt=""><p>封面</p></div>') && !read().includes("/pages/home/assets/"), "the file holds its folder's addresses");
  const backAgain = await post({ op: "edit", card: picture.card, part: "body", html: drawn.parts.body.was, base: base(picture.card) });
  assert.ok(backAgain.ok && read().includes('<div class="pic-body"><img src="assets/cover.png" alt=""></div>'), "the undo's part, sent back as shown, written as the file had it");

  // Each write told in writes.jsonl: by the page (a reader's gesture) or by the Agent (agent: true), the
  // cards it changed and how (cardsChanged's kinds), the ids the first write filled no change.
  const writes = fs.readFileSync(path.join(state, "pages", "home", WRITES_FILE), "utf8").trim().split("\n").map((line) => JSON.parse(line));
  assert.ok(writes.every((write) => typeof write.at === "number") && writes.every((write, index) => index === 0 || write.at >= writes[index - 1].at), "each with its time, in order");
  assert.deepEqual({ ...writes[0], at: 0 }, { at: 0, op: "place", by: "page", cards: { c1: ["cells"], c2: ["cells"], low: ["cells"] } }, "the first place: c2 moved, c1 and the card under it pushed, the ids filled none");
  assert.deepEqual(writes.filter((write) => write.by === "agent").map(({ op, cards }) => [op, cards[picture.card]]), [["add", ["added"]]], "the Agent's add alone by the Agent");
  assert.deepEqual(writes.at(-1).cards, { [picture.card]: ["content"] }, "an edit: its card's content");
  assert.equal(writes.filter((write) => write.op === "settings" || write.op === "edit").every((write) => write.by === "page"), true);

  // Two views (the user's word of 2026-11-13), on a page of its own: an add in the wide view on a board never arranged narrow
  // writes no narrow place; place with view "narrow" writes the narrow view's places (data-narrow-*), every card of the board's
  // (the view as drawn, the flow of the wide places, its start), the wide places as they were; an add then (either view) puts
  // the card at the narrow view's first free spot too; arrange with view "narrow" (an undo) writes the narrow places alone;
  // remove and the add that puts it back (its undo) keep the card's narrow place.
  {
    await createPage("views", "两种视图", { root });
    const viewFiles = pageFiles("views", root);
    fs.writeFileSync(viewFiles.html, fs.readFileSync(viewFiles.html, "utf8").replace('<div class="gallery-board" data-board-id="main">\n', (board) => board
      + card("a", 0, 0, 4, 2, "local/memo", "") + card("b", 4, 0, 4, 2, "local/memo", "") + card("c", 8, 0, 4, 2, "local/memo", "")));
    const viewRead = () => fs.readFileSync(viewFiles.html, "utf8");
    const viewBase = (id) => { const own = withCardIds(viewRead()).text; return baseOf(own, cardIn(own, id)); };
    const viewPost = (body) => post(body, { slug: "views" });
    const wideAt = () => Object.fromEntries(readPage(viewRead()).cards.map((one) => [one.id, `${one.x},${one.y},${one.w},${one.h}`]));
    const narrowAt = () => Object.fromEntries(readPage(viewRead()).cards.map((one) => [one.id, one.narrow && `${one.narrow.x},${one.narrow.y},${one.narrow.w},${one.narrow.h}`]));

    const d = await viewPost({ op: "add", block: "local/memo", board: "main" });
    assert.equal(d.ok, true, JSON.stringify(d));
    assert.ok(Object.values(narrowAt()).every((one) => one === null), "a wide add on a board never arranged narrow: no narrow place written");
    const wide = wideAt();
    assert.deepEqual(wide, { a: "0,0,4,2", b: "4,0,4,2", c: "8,0,4,2", [d.card]: "0,2,4,2" });

    // The narrow view as drawn (8 columns: a 0,0, b 4,0, c 0,2, d 4,2); c dragged to its top-left: a pushed under it.
    const placed = await viewPost({ op: "place", view: "narrow", card: "c", x: 0, y: 0, w: 4, h: 2, base: viewBase("c") });
    assert.equal(placed.ok, true, JSON.stringify(placed));
    assert.deepEqual(narrowAt(), { a: "0,2,4,2", b: "4,0,4,2", c: "0,0,4,2", [d.card]: "4,2,4,2" }, "every card's narrow place written, the view as it was drawn but c's move");
    assert.deepEqual(wideAt(), wide, "the wide places as they were");
    assert.deepEqual(placed.cards.find((one) => one.id === "c").narrow, { x: 0, y: 0, w: 4, h: 2 }, "the answer says each card's narrow place");
    assert.match(viewRead(), /data-narrow-x="0" data-narrow-y="0" data-narrow-w="4" data-narrow-h="2"/, "written as data-narrow-x, -y, -w and -h");

    // An add in the narrow view: the wide view's first free spot, and the narrow view's.
    const e = await viewPost({ op: "add", block: "local/memo", board: "main", view: "narrow" });
    assert.equal(e.ok, true, JSON.stringify(e));
    assert.deepEqual([wideAt()[e.card], narrowAt()[e.card]], ["4,2,4,2", "0,4,4,2"], "on both views: each at its first free spot");
    // An add in the wide view, the board arranged narrow: on the narrow view too.
    const f = await viewPost({ op: "add", block: "local/memo", board: "main" });
    assert.deepEqual([wideAt()[f.card], narrowAt()[f.card]], ["8,2,4,2", "4,4,4,2"], "a wide add: the narrow view's first free spot too");

    // arrange in the narrow view (an undo's): c lower; the narrow places alone written, none moved up.
    const arranged = await viewPost({ op: "arrange", view: "narrow", cards: [{ card: "c", x: 0, y: 6, w: 4, h: 2, base: viewBase("c") }] });
    assert.equal(arranged.ok, true, JSON.stringify(arranged));
    assert.equal(narrowAt().c, "0,6,4,2");
    assert.equal(narrowAt().a, "0,2,4,2", "a stays where it was pushed: never up");
    assert.equal(wideAt().c, "8,0,4,2", "c's wide place as it was");

    // remove, and its undo: the card's narrow place back with it.
    const removed = await viewPost({ op: "remove", card: "c", base: viewBase("c") });
    assert.match(removed.removed.html, /data-narrow-y="6"/, "the card removed with its narrow place");
    const back = await viewPost({ op: "add", html: removed.removed.html, board: "main" });
    assert.equal(back.ok, true, JSON.stringify(back));
    assert.deepEqual([wideAt().c, narrowAt().c], ["8,0,4,2", "0,6,4,2"], "put back at its places in both views");
  }

  // A drop's exchange (the user's word of 2026-11-19, the README's third act): place with `swap` writes the two exchanged where
  // that is clean on the file as it is now, both told as changed; the page's undo of it (arrange of both, as the board sends it)
  // puts the file back byte for byte, its redo exchanges them again; the other way gives the same board; a place with no swap
  // (gallery page card --move) pushes as it did; a swap no longer clean (the Agent wrote meanwhile) is a place of none; a swap
  // that is no string refused; the narrow view's own cells exchanged, the wide ones untouched.
  {
    await createPage("swap", "交换", { root });
    const swapFiles = pageFiles("swap", root);
    fs.writeFileSync(swapFiles.html, fs.readFileSync(swapFiles.html, "utf8").replace('<div class="gallery-board" data-board-id="main">\n', (board) => board
      + card("count", 0, 0, 4, 2, "local/memo", "") + card("note", 4, 0, 4, 2, "local/memo", "") + card("todos", 0, 2, 8, 4, "local/memo", "") + card("recent", 8, 2, 4, 4, "local/memo", "")));
    const start = fs.readFileSync(swapFiles.html, "utf8");
    const swapRead = () => fs.readFileSync(swapFiles.html, "utf8");
    const swapBase = (id) => { const own = withCardIds(swapRead()).text; return baseOf(own, cardIn(own, id)); };
    const swapPost = (body) => post(body, { slug: "swap" });
    const cellsNow = () => Object.fromEntries(readPage(swapRead()).cards.map((one) => [one.id, `${one.x},${one.y},${one.w},${one.h}`]));
    const exchanged = { count: "0,0,4,2", note: "4,0,4,2", todos: "4,2,8,4", recent: "0,2,4,4" };

    const swapped = await swapPost({ op: "place", card: "recent", x: 0, y: 2, w: 4, h: 4, swap: "todos", base: swapBase("recent") });
    assert.equal(swapped.ok, true, JSON.stringify(swapped));
    assert.deepEqual(cellsNow(), exchanged, "recent edits dropped on the to-dos: the two exchanged, the first row untouched");
    const told = fs.readFileSync(path.join(state, "pages", "swap", WRITES_FILE), "utf8").trim().split("\n").map((line) => JSON.parse(line)).at(-1);
    assert.deepEqual([told.op, told.cards], ["place", { recent: ["cells"], todos: ["cells"] }], "told: a place that changed the two cards' cells");
    // The page's undo: arrange of every card the step moved, back where it was (history.mjs "cells"); its redo the other way.
    const undone = await swapPost({ op: "arrange", cards: [{ card: "recent", x: 8, y: 2, w: 4, h: 4, base: swapBase("recent") }, { card: "todos", x: 0, y: 2, w: 8, h: 4, base: swapBase("todos") }] });
    assert.ok(undone.ok && swapRead() === start, "one undo: both back, the file as it was byte for byte");
    const redone = await swapPost({ op: "arrange", cards: [{ card: "recent", x: 0, y: 2, w: 4, h: 4, base: swapBase("recent") }, { card: "todos", x: 4, y: 2, w: 8, h: 4, base: swapBase("todos") }] });
    assert.ok(redone.ok && JSON.stringify(cellsNow()) === JSON.stringify(exchanged), "its redo: exchanged again");
    fs.writeFileSync(swapFiles.html, start);
    const otherWay = await swapPost({ op: "place", card: "todos", x: 4, y: 2, w: 8, h: 4, swap: "recent", base: swapBase("todos") });
    assert.ok(otherWay.ok && JSON.stringify(cellsNow()) === JSON.stringify(exchanged), `the to-dos dropped on recent edits: the same board ${JSON.stringify(cellsNow())}`);
    // A place asked by its cells: as it was, the card met pushed down.
    fs.writeFileSync(swapFiles.html, start);
    await swapPost({ op: "place", card: "recent", x: 0, y: 2, w: 4, h: 4, base: swapBase("recent") });
    assert.deepEqual(cellsNow(), { count: "0,0,4,2", note: "4,0,4,2", todos: "0,6,8,4", recent: "0,2,4,4" }, "no swap (gallery page card --move): the to-dos pushed down under it");
    // The Agent wrote meanwhile (the to-dos two rows higher, a card under recent edits): the exchange would put the to-dos on it, so
    // the drop is a place of none, the card met pushed down; the file as the Agent left it otherwise.
    fs.writeFileSync(swapFiles.html, start.replace('data-card-id="todos" data-x="0" data-y="2" data-w="8" data-h="4"', 'data-card-id="todos" data-x="0" data-y="2" data-w="8" data-h="6"')
      .replace('<div class="gallery-board" data-board-id="main">\n', (board) => board + card("under", 8, 6, 4, 2, "local/memo", "")));
    const stale = await swapPost({ op: "place", card: "recent", x: 0, y: 2, w: 4, h: 4, swap: "todos", base: swapBase("recent") });
    assert.ok(stale.ok, JSON.stringify(stale));
    assert.deepEqual(cellsNow(), { under: "8,6,4,2", count: "0,0,4,2", note: "4,0,4,2", todos: "0,6,8,6", recent: "0,2,4,4" }, "a swap no longer clean: written as a place, the to-dos under recent edits");
    assert.equal((await swapPost({ op: "place", card: "recent", x: 8, y: 2, w: 4, h: 4, swap: 3, base: swapBase("recent") })).reason, "swap", "a swap that is no card's id: refused");
    // The narrow view (8 columns, never arranged: the wide places flowed, count 0,0, note 4,0, todos 0,2 (8 wide), recent 0,6): recent
    // dropped on the to-dos above it, which go down to its place, every narrow place written, the wide ones untouched.
    fs.writeFileSync(swapFiles.html, start);
    const narrowSwap = await swapPost({ op: "place", view: "narrow", card: "recent", x: 0, y: 2, w: 4, h: 4, swap: "todos", base: swapBase("recent") });
    assert.equal(narrowSwap.ok, true, JSON.stringify(narrowSwap));
    const narrowNow = Object.fromEntries(readPage(swapRead()).cards.map((one) => [one.id, one.narrow && `${one.narrow.x},${one.narrow.y},${one.narrow.w},${one.narrow.h}`]));
    assert.deepEqual(narrowNow, { count: "0,0,4,2", note: "4,0,4,2", todos: "0,6,8,4", recent: "0,2,4,4" }, "narrow: exchanged in the narrow view's cells");
    assert.deepEqual(cellsNow(), { count: "0,0,4,2", note: "4,0,4,2", todos: "0,2,8,4", recent: "8,2,4,4" }, "and the wide places as they were");
  }

  // restore-defaults: a page's with the default cards alone (page.json's defaultCards, no slug); here Gallery's own today and note are none of the test's
  // folder of them, nor in the workspace: both skipped as missing, nothing written.
  await createPage("other", "别的", { root });
  const notHome = await post({ op: "restore-defaults" }, { slug: "other" });
  assert.deepEqual([notHome.status, notHome.reason], [409, "defaults"], "restore-defaults on a page without the default cards: refused");
  const unrestored = read();
  const keptBefore = kept().length;
  const none = await post({ op: "restore-defaults" });
  assert.ok(none.ok && none.added.length === 0 && JSON.stringify(none.skipped.map(({ block, reason }) => [block, reason])) === JSON.stringify(HOME_CARDS.map((block) => [block, "missing"])), JSON.stringify(none));
  assert.ok(read() === unrestored && kept().length === keptBefore, "nothing written, no version kept");
  // POST hint: a page's note closed for the workspace, that page's alone; a page not there refused.
  const hint = (slug) => fetch(`http://${host}/__gallery/pages/${slug}/hint`, { method: "POST", headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": edits.token }, body: "{}" }).then(async (response) => ({ status: response.status, ...(await response.json()) }));
  assert.equal((await hint("nowhere")).reason, "missing", "no page there");
  assert.equal(pageHintClosed(root, "home"), false);
  assert.ok((await hint("home")).ok && pageHintClosed(root, "home") && !pageHintClosed(root, "other"), "the home page's note closed, kept in .gallery/hints.json, its alone");
  const forged = await fetch(`http://${host}/__gallery/pages/home/hint`, { method: "POST", headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": "nope" }, body: "{}" });
  assert.equal(forged.status, 403, "checked as every write: another token refused");

  // The library: the blocks whose places hold page and that load, and Gallery's own not yet in.
  fs.rmSync(path.join(root, "components", "gallery"), { recursive: true });
  const library = await (await fetch(`http://${host}/__gallery/pages/home/library`)).json();
  const ids = library.blocks.map(({ id }) => id);
  assert.ok(["local/memo", "local/prefs", "local/grow", "local/hello", "gallery/tile"].every((id) => ids.includes(id)), JSON.stringify(ids));
  assert.ok(!ids.includes("local/tally") && !ids.includes("local/span"), "no block of documents alone, none turned off");
  const own = library.blocks.find(({ id }) => id === "gallery/tile");
  const route = (theme, language = "") => new RegExp(`^/__gallery/pages/home/picture\\?id=gallery%2Ftile&theme=${theme}${language ? `&language=${language}` : ""}&v=[0-9a-z]+-[0-9a-z]+$`);
  assert.ok(own.installed === false && own.size.w === 2 && Object.keys(own.picture).join() === "light,dark" && route("light").test(own.picture.light) && route("dark").test(own.picture.dark),
    `Gallery's own not added yet: its pictures by the page service's route, each under its mark: ${JSON.stringify(own)}`);
  // The route: the picture's bytes as the package ships them, kept for good under its mark; none of a block that is not Gallery's own, nor of another theme or language.
  const tilePicture = (file) => fs.readFileSync(path.join(shipped, "gallery", "tile", file));
  const darkPicture = await fetch(`http://${host}${own.picture.dark}`);
  assert.ok(darkPicture.status === 200 && darkPicture.headers.get("content-type") === "image/webp" && darkPicture.headers.get("cache-control").includes("immutable") && Buffer.from(await darkPicture.arrayBuffer()).equals(tilePicture("preview-dark.webp")), "the route gives the dark picture's bytes");
  assert.equal((await fetch(`http://${host}${own.picture.dark.replace(/&v=.*/, "&v=old")}`)).headers.get("cache-control"), "no-store", "under another mark (a picture made again since): given, not kept");
  for (const query of ["id=local%2Fmemo&theme=light", "id=gallery%2Ftile&theme=sepia", "id=gallery%2Fnone&theme=light", "id=gallery%2Ftile&theme=light&language=en", "id=gallery%2Ftile&theme=light&language=fr"]) assert.equal((await fetch(`http://${host}/__gallery/pages/home/picture?${query}`)).status, 404, `none for ${query}`);
  // Its English pair (LANGUAGE_PICTURES), where it ships one: beside its own, by the same route with &language=en.
  fs.writeFileSync(path.join(shipped, "gallery", "tile", "preview-light.en.webp"), tilePicture("preview-light.webp"));
  fs.writeFileSync(path.join(shipped, "gallery", "tile", "preview-dark.en.webp"), Buffer.concat([tilePicture("preview-dark.webp"), Buffer.from([0])]));
  const english = (await (await fetch(`http://${host}/__gallery/pages/home/library?language=en`)).json()).blocks.find(({ id }) => id === "gallery/tile").picture;
  assert.ok(route("light").test(english.light) && route("light", "en").test(english.en?.light) && route("dark", "en").test(english.en?.dark), `its English pair beside its own: ${JSON.stringify(english)}`);
  assert.ok(Buffer.from(await (await fetch(`http://${host}${english.en.dark}`)).arrayBuffer()).equals(tilePicture("preview-dark.en.webp")), "the route gives the English one's bytes");
  for (const file of ["preview-light.en.webp", "preview-dark.en.webp"]) fs.rmSync(path.join(shipped, "gallery", "tile", file));
  assert.equal(library.blocks.find(({ id }) => id === "local/memo").picture, null, "a block of the workspace's with no pictures: none");
  assert.ok(library.blocks.find(({ id }) => id === "local/prefs").settings, "says which have settings");
  // Gallery's own, not in the workspace and turned off by gallery.json (which the catalog says only of one there): not listed, and an add of it refused before anything is put in.
  const marker = fs.readFileSync(layoutOf(root).marker, "utf8");
  fs.writeFileSync(layoutOf(root).marker, `${JSON.stringify({ gallery: "workspace", version: 1, components: { disabled: ["local/span", "gallery/tile"] } }, null, 2)}\n`);
  const offList = (await (await fetch(`http://${host}/__gallery/pages/home/library`)).json()).blocks.map(({ id }) => id);
  assert.ok(!offList.includes("gallery/tile") && offList.includes("local/memo"), `turned off: not in the library: ${JSON.stringify(offList)}`);
  const takenBefore = taken;
  const unchanged = read();
  assert.equal((await post({ op: "add", block: "gallery/tile" })).reason, "disabled", "an add of it: refused as turned off");
  assert.ok(!fs.existsSync(path.join(root, "components", "gallery", "tile")) && taken === takenBefore && read() === unchanged, "nothing put into components/, nothing written");
  fs.writeFileSync(layoutOf(root).marker, marker);

  // restore-defaults with Gallery's own blocks as the package has them, on a home page of a workspace of
  // its own whose note an Agent wrote and whose today was taken out (the others of HOME_CARDS never put
  // on): today and the rest put back in HOME_CARDS' order, each at the first free spot the ones before
  // it left, by its default size, added to components/ first; the note and every other byte as they
  // were; every default card told of (hints.json's homeCards); again, nothing missing, nothing written;
  // today turned off in gallery.json: skipped as such.
  const home = mkdtempSync(path.join(tmpdir(), "page-service-home-"));
  try {
    await ensureWorkspace(home);
    await createPage("home", "首页", { root: home, defaultCards: true });
    const homeFile = pageFiles("home", home).html;
    const note = '<div data-doc-component="gallery/note">\n          <script type="application/json">{ "text": "我写的" }</script>\n        </div>';
    const written = fs.readFileSync(homeFile, "utf8").replace('<div class="gallery-board" data-board-id="main">\n', (board) => `${board}      <section class="gallery-card" data-card-id="mine" data-x="0" data-y="0" data-w="4" data-h="2">\n        ${note}\n      </section>\n`);
    fs.writeFileSync(homeFile, written);
    fs.cpSync(path.join(packsDirectory, "gallery", "note"), path.join(home, "components", "gallery", "note"), { recursive: true });
    const own = createPageService({ root: home, edits: null, stateDirectory: path.join(home, ".gallery", "state"), catalog: () => readCatalog(home) });
    assert.deepEqual(homeCardsTold(home), ["gallery/today", "gallery/note"], "a home whose hints say nothing of its cards was told of the first two");
    const [status, restored] = await own.apply("home", { op: "restore-defaults" });
    const now = fs.readFileSync(homeFile, "utf8");
    const today = readPage(now).cards.find(({ block }) => block === "gallery/today");
    const put = HOME_CARDS.filter((id) => id !== "gallery/note");
    assert.ok(status === 200 && JSON.stringify(restored.added.map(({ block }) => block)) === JSON.stringify(put) && restored.added[0].card === today.id && restored.skipped.length === 0, JSON.stringify(restored));
    assert.deepEqual(restored.added[0].name, { zh: "问候与日期", en: "Greeting and date" }, "named by its manifest, in both languages");
    assert.deepEqual({ x: today.x, y: today.y, w: today.w, h: today.h }, { ...freeSpot([{ id: "mine", x: 0, y: 0, w: 4, h: 2 }], { w: 4, h: 2 }), w: 4, h: 2 }, "at the first free spot, by its default size");
    assert.deepEqual(readPage(now).cards.map(({ block, x, y, w, h }) => [block, x, y, w, h]), [["gallery/note", 0, 0, 4, 2], ["gallery/today", 4, 0, 4, 2], ["gallery/weather", 8, 0, 4, 2], ["gallery/countdown", 0, 2, 2, 2], ["gallery/habit", 2, 2, 2, 2], ["gallery/stats", 4, 2, 8, 2], ["gallery/todos", 0, 4, 4, 6], ["gallery/heatmap", 4, 4, 8, 4], ["gallery/recent", 4, 8, 4, 4], ["gallery/static", 8, 8, 4, 4]], "each after the one before it, at the first free spot by its size on the home (HOME_SIZES: the habit 2 x 2, the to-dos 4 x 6), the Agent's note where it stood");
    for (const id of put) assert.ok(fs.existsSync(path.join(home, "components", ...id.split("/"), "component.json")), `Gallery's own ${id} put into the workspace first`);
    const cut = (text) => readPage(text).cards.filter(({ id }) => id !== "mine").reduceRight((rest, card) => rest.slice(0, card.start) + rest.slice(card.end), text);
    assert.equal(cut(now).replace(/\n\s*\n/g, "\n"), written.replace(/\n\s*\n/g, "\n"), "every other byte as it was: the Agent's note untouched");
    assert.equal(restored.added[0].html, now.slice(today.start, today.end), "the card as written, for the page's undo");
    assert.deepEqual(homeCardsTold(home), [...HOME_CARDS], "every default card told of: the home page's note of new cards says nothing again");
    const [, again] = await own.apply("home", { op: "restore-defaults" });
    assert.ok(again.added.length === 0 && again.skipped.length === 0 && fs.readFileSync(homeFile, "utf8") === now, "nothing missing: nothing written");
    const lacking = now.slice(0, today.start) + now.slice(today.end); // today taken out again, the rest there (what the disabled check below starts from)
    // Who wrote it, as writes.jsonl tells it: a restore-defaults that comes as a request is a reader's
    // gesture (a body that says `by` or `agent: false` changes nothing of it), only Gallery's own call of the
    // service (makeDefaultHome, apply's `by` option) is told as Gallery's.
    const journal = () => fs.readFileSync(path.join(home, ".gallery", "state", "pages", "home", WRITES_FILE), "utf8").trim().split("\n").map((line) => JSON.parse(line));
    fs.writeFileSync(homeFile, written);
    await own.apply("home", { op: "restore-defaults", by: "gallery" });
    fs.writeFileSync(homeFile, written);
    await own.apply("home", { op: "restore-defaults" }, { by: "gallery" });
    assert.deepEqual(journal().map(({ op, by }) => [op, by]), [["restore-defaults", "page"], ["restore-defaults", "page"], ["restore-defaults", "gallery"]], "a request's own `by` is no writer: Gallery's call alone is told as Gallery's");
    assert.deepEqual(Object.values(journal().at(-1).cards), put.map(() => ["added"]), "and what it changed (each card it put in) told as any write's");
    fs.writeFileSync(homeFile, lacking);
    fs.writeFileSync(layoutOf(home).marker, `${JSON.stringify({ gallery: "workspace", version: 1, components: { disabled: ["gallery/today"] } }, null, 2)}\n`);
    const [, off] = await own.apply("home", { op: "restore-defaults" });
    assert.ok(off.added.length === 0 && off.skipped.length === 1 && off.skipped[0].block === "gallery/today" && off.skipped[0].reason === "disabled" && fs.readFileSync(homeFile, "utf8") === lacking, JSON.stringify(off));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
} finally {
  server.close();
  fs.rmSync(root, { recursive: true, force: true });
  fs.rmSync(state, { recursive: true, force: true });
  fs.rmSync(shipped, { recursive: true, force: true });
}

console.log("Checked the page service: its writes checked as the server's (token, origin, JSON, workspace), each op by card id against that card's base (changed or gone refused, another card's change or the head's no matter, the answer saying the page was written meanwhile), ids filled on the first write as the page was served them, place pushing down and resizing to the block's sizes (none for one that does not resize), a drop's place with swap exchanging two cards where that is clean on the file as it is (undone and done again by arrange, both ways the same board, a swap no longer clean written as a place, the narrow view's own), arrange putting cards back, add at the first free spot or where told (Gallery's own put in first; a block of documents, one turned off or missing refused), remove and its add putting the file back byte for byte, nothing that would run, edit and settings through the editor's rewrite, several ops one at a time, the last 20 versions kept, restore-defaults (a page's with the default cards alone: its default cards it misses at free spots, Gallery's own put in first, every other byte kept, nothing written when none is missing, one turned off or not there skipped), a page's note closed by POST hint, the library.");
