import "./workspace-env.mjs";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createEditService } from "../../src/editor/service.mjs";
import { addBlockIds, applyEdits, commitEdits, findBlocks, findUnits, hashOf, pendingBlockIds, randomBlockId as serverBlockId } from "../../src/editor/source.mjs";
import { blocksWithoutIds, placeGivenIds, startTagLabel } from "../../src/editor/source/ids.mjs";
import { BLOCK_ID, REQUEST_ID, randomBlockId, randomId, randomRequestId } from "../../src/shared/ids.mjs";
import { checkReports } from "../../src/render/pipeline.mjs";
import { loadReports } from "../../src/render/reports.mjs";
import { locate } from "../../src/editor/source/locate.mjs";
import { unitHash } from "../../src/editor/source/units.mjs";
import { newNames } from "../../src/shared/new-names.mjs";

// Block ids (data-block-id): the identity the preview editor's commits find a block by (commitEdits;
// a block that has none yet is found by what it said when the page opened); given lazily, and once to existing reports by the
// migration (add-block-ids.mjs). See "Block ids" in docs/editor.md.

const page = (body) => `<!doctype html>\n<html><head><title>t</title></head><body>\n<main>\n${body}</main>\n</body></html>\n`;
const SRC = page(`  <section class="doc-section" aria-labelledby="a" data-block-id="sa000001">
    <h2 id="a">第一章</h2>
    <p data-block-id="pa000001">甲段：我们先理解材料，再选择组件。</p>
    <p data-block-id="pa000002">重复的一段。</p>
    <p data-block-id="pa000003">重复的一段。</p>
    <figure class="doc-figure" data-surface="bounded" data-block-id="fa000001">
      <h3>卡片标题</h3>
      <p class="doc-figure-caption">卡片说明</p>
    </figure>
  </section>
  <section class="doc-section" aria-labelledby="b" data-block-id="sb000001">
    <h2 id="b">第二章</h2>
    <p data-block-id="pb000001">乙段。</p>
  </section>
`);
const strip = (html) => html.replace(/ data-block-id="[^"]*"/g, "");
const blockOf = (source, text) => findBlocks(source).find((block) => source.slice(block.innerStart, block.innerEnd).includes(text));
const unitOf = (source, text) => findUnits(source).units.find((unit) => unit.text !== undefined && source.slice(unit.elStart, unit.end).includes(text));
const keep = (block, html) => ({ id: block.id, parts: [{ keep: true, html }] });
const sequence = (prefix = "n") => {
  let count = 0;
  return () => `${prefix}${String(++count).padStart(7, "0")}`;
};

// An id binds nothing: a paragraph that has one still splits, merges, can be emptied and deleted.
{
  assert.deepEqual(Object.keys(blockOf(SRC, "甲段").caps).sort(), ["empty", "links", "merge", "remove", "split"]);
  assert.equal(findUnits(SRC).units.find((unit) => unit.blockId === "pa000001").keep, null);
}

// What a commit names a unit by: its id, and, should the file have dropped it, what the unit was
// when the page opened (`open`, `openHash`). A commit goes to the file as it is now, `current`, the version the page
// opened being `SRC`.
const ref = (source, unit) => ({ key: `u${unit.id}`, id: unit.blockId, open: unit.id, openHash: hashOf(source.slice(unit.start, unit.end)) });
const textOfUnit = (source, unit) => {
  const block = findBlocks(source).find((candidate) => candidate.self === unit.id);
  return { block, before: source.slice(block.innerStart, block.innerEnd) };
};
const commitText = (current, source, unit, html) => {
  const { before } = textOfUnit(source, unit);
  return commitEdits({ current, opening: source, ids: false, texts: [{ key: "t", block: { unit: ref(source, unit), self: true, before }, parts: [{ keep: true, html }] }] });
};

// Moved and changed by the Agent, edited by the reader elsewhere in the text: found by its id and
// merged where it is now.
{
  const line = `    <p data-block-id="pa000001">甲段：我们先理解材料，再选择组件。</p>\n`;
  const moved = SRC.replace(line, "").replace(`    <p data-block-id="pb000001">乙段。</p>\n`, `    <p data-block-id="pb000001">乙段。</p>\n    <p data-block-id="pa000001">甲段：我们先理解材料，再挑选组件。</p>\n`);
  const result = commitText(moved, SRC, unitOf(SRC, "甲段"), "甲段：我们先读懂材料，再选择组件。");
  assert.deepEqual(result.texts.map((entry) => entry.status), ["merged"]);
  assert.equal(result.text, moved.replace("我们先理解材料，再挑选组件", "我们先读懂材料，再挑选组件"));
}

// Two paragraphs with the same text that the Agent swapped: the edit goes to the reader's one.
{
  const [second, third] = [`<p data-block-id="pa000002">重复的一段。</p>`, `<p data-block-id="pa000003">重复的一段。</p>`];
  const swapped = SRC.replace(second, "@@").replace(third, second).replace("@@", third);
  const third0 = findUnits(SRC).units.find((unit) => unit.blockId === "pa000003");
  const result = commitText(swapped, SRC, third0, "第三段（人改）。");
  assert.deepEqual(result.texts.map((entry) => entry.status), ["applied"]);
  assert.ok(result.text.includes(`<p data-block-id="pa000003">第三段（人改）。</p>`) && result.text.includes(second));
}

// A card the Agent moved to the other chapter and whose caption it changed: the reader's new card
// title is found inside it (its unit's id), next to the Agent's caption.
{
  const figure = SRC.slice(SRC.indexOf("    <figure"), SRC.indexOf("</figure>") + "</figure>\n".length);
  const moved = SRC.replace(figure, "").replace("  </section>\n</main>", `${figure.replace("卡片说明", "卡片说明（AI）")}  </section>\n</main>`);
  const card = findUnits(SRC).units.find((unit) => unit.blockId === "fa000001");
  const title = findBlocks(SRC).find((block) => block.unit === card.id && SRC.slice(block.innerStart, block.innerEnd) === "卡片标题");
  const result = commitEdits({ current: moved, opening: SRC, ids: false, texts: [{ key: "t", block: { unit: ref(SRC, card), path: title.path, before: "卡片标题" }, parts: [{ keep: true, html: "新的卡片标题" }] }] });
  assert.deepEqual(result.texts.map((entry) => entry.status), ["applied"]);
  assert.ok(result.text.includes("<h3>新的卡片标题</h3>") && result.text.includes("卡片说明（AI）"));
  assert.ok(result.text.indexOf("新的卡片标题") > result.text.indexOf("乙段"), "in the chapter the card is in now");
}

// An id the file repeats (an Agent copied the block with it) is no id to find a block by: a
// conflict, nothing written. One it dropped: the block is found as it was when the page opened.
{
  const copied = SRC.replace(`    <p data-block-id="pb000001">乙段。</p>\n`, `    <p data-block-id="pb000001">乙段。</p>\n    <p data-block-id="pa000001">甲段：我们先理解材料，再选择组件。</p>\n`);
  const result = commitText(copied, SRC, unitOf(SRC, "甲段"), "甲段（人改）");
  assert.deepEqual(result.texts.map(({ status, reason }) => [status, reason]), [["conflict", "ambiguous"]]);
  assert.equal(result.text, copied);
  // The Agent wrote the file from a version it read before the ids: the ids are gone, and the block
  // is found as it was when the page opened (no id in it then).
  const plain = strip(SRC);
  const dropped = plain.replace("乙段。", "乙段（AI）。");
  const unit = unitOf(plain, "甲段");
  const { before } = textOfUnit(plain, unit);
  const kept = commitEdits({ current: dropped, opening: plain, ids: false, texts: [{ key: "t", block: { unit: { ...ref(plain, unit), id: "pa000001" }, self: true, before }, parts: [{ keep: true, html: "甲段（人改）" }] }] });
  assert.deepEqual(kept.texts.map((entry) => entry.status), ["applied"]);
  assert.equal(kept.text, dropped.replace("甲段：我们先理解材料，再选择组件。", "甲段（人改）"));
}

// Deleted around an edit: the Agent removed the chapter holding the paragraph the reader edited,
// or the block the reader moved something next to. Either is a conflict; nothing is lost silently.
{
  const chapter = SRC.slice(SRC.indexOf(`  <section class="doc-section" aria-labelledby="b"`), SRC.indexOf("</main>"));
  const gone = SRC.replace(chapter, "");
  const edited = commitText(gone, SRC, unitOf(SRC, "乙段"), "乙段（人改）。");
  assert.deepEqual(edited.texts.map(({ status, reason }) => [status, reason]), [["conflict", "missing"]]);
  const first = unitOf(SRC, "甲段");
  const second = unitOf(SRC, "乙段");
  const moved = commitEdits({ current: gone, opening: SRC, ids: false, units: [{ key: "m", unit: ref(SRC, first), move: { before: ref(SRC, second) } }] });
  assert.deepEqual(moved.units.map(({ status, reason }) => [status, reason]), [["conflict", "position"]]);
  assert.equal(moved.text, gone);
}

// Given lazily: a save names the units it edits, moves, resizes or converts for the first time,
// and every block made on the page; a unit keeps the id it has; nothing else in the file changes.
{
  const plain = strip(SRC);
  const ids = sequence("t");
  const edited = applyEdits({ current: plain, edits: [keep(blockOf(plain, "甲段"), "甲段（人改）")], ids });
  assert.equal(edited.text, plain.replace("<p>甲段：我们先理解材料，再选择组件。</p>", `<p data-block-id="t0000001">甲段（人改）</p>`));
  const field = applyEdits({ current: plain, edits: [keep(blockOf(plain, "卡片标题"), "新标题")], ids: sequence("f") });
  assert.ok(field.text.includes(`<figure class="doc-figure" data-surface="bounded" data-block-id="f0000001">\n      <h3>新标题</h3>`), "a card's text names the card");
  const split = applyEdits({ current: plain, edits: [{ id: blockOf(plain, "乙段").id, parts: [{ keep: true, html: "乙" }, { tag: "p", html: "段。" }] }], ids: sequence("s") });
  assert.ok(split.text.includes(`<p data-block-id="s0000001">乙</p>\n    <p data-block-id="s0000002">段。</p>`), "the block and the one split off it");
  const moved = applyEdits({ current: plain, edits: [], units: [{ id: unitOf(plain, "乙段").id, move: { before: unitOf(plain, "甲段").id } }], ids: sequence("m") });
  assert.ok(moved.text.includes(`<p data-block-id="m0000001">乙段。</p>\n    <p>甲段`));
  const sized = applyEdits({ current: plain, edits: [], units: [{ id: findUnits(plain).units.find((unit) => unit.kind === "figure").id, size: "--doc-span", value: ".5" }], ids: sequence("z") });
  assert.match(sized.text, /<figure class="doc-figure" data-surface="bounded" data-block-id="z0000001" style="--doc-span: 0\.5">/, "a resized card");
  const section = findUnits(plain).boxes.find((box) => box.kind === "main");
  const made = applyEdits({ current: plain, edits: [], units: [{ id: "n1", insert: { type: "section", children: [{ type: "paragraph", html: "新的一段。" }] }, place: { into: section.id } }], ids: sequence("c") });
  assert.ok(made.ok && /<section class="doc-section" data-block-id="c\d{7}">/.test(made.text) && /<p data-block-id="c\d{7}">新的一段。<\/p>/.test(made.text), "a new section and its paragraph");
  assert.equal(strip(made.text), applyEdits({ current: plain, edits: [], units: [{ id: "n1", insert: { type: "section", children: [{ type: "paragraph", html: "新的一段。" }] }, place: { into: section.id } }] }).text);

  const again = applyEdits({ current: SRC, edits: [keep(blockOf(SRC, "甲段"), "甲段（人改）")], ids });
  assert.ok(again.text.includes(`<p data-block-id="pa000001">甲段（人改）</p>`), "an id stays; no second one");
  const turned = applyEdits({ current: SRC, edits: [], units: [{ id: unitOf(SRC, "甲段").id, replace: { type: "heading2", html: "甲段" } }] });
  assert.ok(turned.ok && turned.text.includes(`<h2 data-block-id="pa000001">甲段</h2>`), "a converted block stays the same block");
  assert.equal(applyEdits({ current: plain, edits: [], ids }).text, plain, "no edits, no ids");
}

// A unit's hash leaves its block ids out (its own and those of the blocks in it, however the value is
// quoted), so ids given while a page is open (an export, add-block-ids.mjs) change no unit's hash; text
// that spells an id (in code) is the unit's words, and counts.
{
  const plain = strip(SRC);
  const hashes = (source) => findUnits(source).units.map((unit) => unitHash(source, unit));
  assert.deepEqual(hashes(SRC), hashes(plain), "with ids and without, every unit the same hash");
  assert.deepEqual(hashes(addBlockIds(plain).text), hashes(plain), "ids just given: the same");
  const quoted = SRC.replace(`<p data-block-id="pb000001">`, `<p data-block-id=pb000001>`).replace(`data-block-id="sa000001"`, `data-block-id='sa000001'`);
  assert.deepEqual(hashes(quoted).filter((hash) => !hashes(plain).includes(hash)), [], "an id written without quotes or in single quotes too");
  const spelled = (code) => page(`  <p>写法：<code>${code}</code></p>\n`);
  const [said, other] = [spelled('&lt;p data-block-id="pa000001"&gt;'), spelled("&lt;p&gt;")];
  assert.notEqual(unitHash(said, findUnits(said).units[0]), unitHash(other, findUnits(other).units[0]), "an id a code sample spells is text");
  assert.notEqual(hashes(SRC.replace("乙段。", "乙段（改）。")).at(-1), hashes(SRC).at(-1), "what a unit says still counts");
  // A start tag that ends in whitespace: the id goes in after it, and only what went in is left out.
  for (const body of ["<hr />", "<hr\n/>", '<p class="lead" >一段</p>', '<p\n    class="lead"\n  >一段</p>', '<p class="lead"\t>一段</p>']) {
    const bare = page(`  ${body}\n`);
    assert.deepEqual(hashes(addBlockIds(bare).text), hashes(bare), JSON.stringify(body));
  }
  // Ids written in capitals are ids too, for the hash and for finding a block where it was (locate).
  const capital = page('  <p>甲。</p>\n  <p>乙。</p>\n');
  const shouted = addBlockIds(capital).text.replace(/data-block-id/g, "DATA-BLOCK-ID");
  assert.deepEqual(hashes(shouted), hashes(capital), "DATA-BLOCK-ID");
  const [first] = findUnits(capital).units;
  assert.equal(locate(capital, shouted, first), findUnits(shouted).units[0].start, "found where it was");
}

// The migration: every unit gets an id, a repeated one is replaced (the first keeps it), the file
// changes nowhere else, and a second run finds nothing to do. What was given is listed in the file's
// order, each block by its start tag (as gallery check listed it before: blocksWithoutIds), and found
// at its line (placeGivenIds: what gallery export prints).
{
  const plain = strip(SRC).replace("<p>乙段。</p>", `<p data-block-id="twice">乙段。</p><p data-block-id="twice">再一段。</p>`);
  const before = blocksWithoutIds(plain);
  const { text, added, renamed, given } = addBlockIds(plain, sequence("g"));
  assert.equal(added, findUnits(plain).units.filter((unit) => !unit.blockId).length);
  assert.deepEqual(renamed, ["twice"]);
  assert.ok(text.includes(`<p data-block-id="twice">乙段。</p><p data-block-id="g`));
  assert.equal(text.replace(/(<\/p><p )data-block-id="g\d{7}"/, `$1data-block-id="twice"`).replace(/ data-block-id="g\d{7}"/g, ""), plain, "nothing else changed");
  assert.deepEqual(addBlockIds(text), { text, added: 0, renamed: [], given: [] });
  assert.equal(given.length, added, "each one given listed, not the one renamed");
  assert.deepEqual(given.slice(0, 4).map(({ tag }) => tag), ["<section class=doc-section aria-labelledby=a>", "<h2 id=a>", "<p>", "<p>"]);
  assert.ok(given.some(({ tag }) => tag === "<figure class=doc-figure data-surface=bounded>"), JSON.stringify(given));
  const placed = placeGivenIds(text, given);
  assert.deepEqual(placed.map(({ id }) => id), given.map(({ id }) => id), "in the file's order");
  const lineOf = (id) => text.slice(0, text.indexOf(`data-block-id="${id}"`)).split("\n").length;
  assert.deepEqual(placed.map(({ line }) => line), given.map(({ id }) => lineOf(id)), "each at the line its start tag opens on, here the one its id is on");
  assert.deepEqual(placed.slice(0, 3).map(({ line }) => line), [4, 5, 6]);
  assert.deepEqual(before, placed.map(({ line, tag }) => ({ line, tag })), "what was without an id, at the same lines");
  assert.deepEqual(placeGivenIds(plain, given), [], "an id the text does not hold is left out");
  const numbered = addBlockIds(strip(SRC)).text;
  assert.ok(!/<(h3|td|th|strong)\b[^>]*data-block-id/.test(numbered), "no ids on a card's text, a cell or inline elements");
  assert.ok(/<h2\b[^>]*data-block-id/.test(numbered), "a section's title is a heading like any other, with an id");
}

// A start tag as the commands show it: its attributes as written but its id and style, three at
// most, a long value cut, quoted only when it holds a space or a quote.
{
  const label = (attrs) => startTagLabel("div", Object.entries(attrs).map(([name, value]) => ({ name, value })));
  assert.equal(startTagLabel("button", [{ name: "class", value: "doc-sheet-tab" }, { name: "type", value: "button" }, { name: "data-sheet-tab", value: "opus" }]), "<button class=doc-sheet-tab type=button data-sheet-tab=opus>");
  assert.equal(label({ "data-block-id": "x1234567", style: "color: red", class: "a b", hidden: "" }), '<div class="a b" hidden>');
  assert.equal(label({ title: 'say "hi"' }), '<div title="say &quot;hi&quot;">');
  assert.equal(label({ a: "1", b: "2", c: "3", d: "4" }), "<div a=1 b=2 c=3 …>");
  assert.equal(label({ title: "x".repeat(40) }), `<div title=${"x".repeat(31)}…>`);
  assert.equal(label({ class: "a\n   b", title: "x\ty" }), '<div class="a b" title="x y">', "a value's line breaks and tabs one space each: the label keeps to its line");
  assert.equal(startTagLabel("p"), "<p>");
}

// A start tag written over several lines is said at the line it opens on (as changeLines says a
// block's line; its id goes on the line of its ">"), by the check and the export alike. An empty id
// (data-block-id="") is none: the new one takes its place, not a second attribute after it, which a
// browser would not read.
{
  const written = page(`  <p\n    class="doc-lead"\n    title="一\n\t二">一段。</p>\n  <p data-block-id="">二段。</p>\n`);
  const expected = [{ line: 4, tag: '<p class=doc-lead title="一 二">' }, { line: 8, tag: "<p>" }];
  assert.deepEqual(blocksWithoutIds(written), expected);
  const { text, given } = addBlockIds(written, sequence("e"));
  assert.deepEqual(placeGivenIds(text, given).map(({ line, tag }) => ({ line, tag })), expected, "the export says them where the check did");
  assert.ok(text.includes('  <p data-block-id="e0000002">二段。</p>') && !text.includes('data-block-id=""'), text);
  assert.equal(text.replace(/ data-block-id="e\d{7}"/g, ""), written.replace(' data-block-id=""', ""), "nothing else changed");
  assert.deepEqual(findUnits(text).units.filter((unit) => !unit.blockId), [], "none left without one");
}

// What gallery check says an export will give an id (pendingBlockIds): the blocks of the page as it
// is shown, natural HTML made the kit's, at the file's lines; none for a report whose ids repeat,
// which the hand-in leaves as it is.
{
  const natural = page(`  <h2 data-block-id="ha000001">一</h2>\n  <p>新的一段。</p>\n  <table>\n    <tr><td>1</td></tr>\n  </table>\n`);
  assert.deepEqual(pendingBlockIds(natural), [{ line: 5, tag: "<p>" }, { line: 6, tag: "<div class=doc-table-wrap>" }]);
  assert.deepEqual(pendingBlockIds(natural.replace("<p>", '<p data-block-id="ha000001">')), [], "ids that repeat: the export fails, nothing given");
}

// gallery check refuses a repeated id. The Component Catalog is an ordinary document: given its ids it passes
// the checks, and so it does with a report.json that still says "template": true (templates are
// gone: the flag means nothing).
{
  const [gallery] = (await loadReports(["component-catalog"], { directory: path.join(import.meta.dirname, "..", "fixtures") })).reports; // tests/fixtures/component-catalog/
  gallery.html = newNames(gallery.html); // as the tools read it: the Component Catalog is the user's, written in the kit's old names
  assert.equal(gallery.metadata.template, undefined, "the Component Catalog is no template");
  const migrated = addBlockIds(gallery.html).text;
  assert.ok(migrated !== gallery.html, "it is given ids as any report is");
  for (const metadata of [gallery.metadata, { ...gallery.metadata, template: true }]) {
    assert.deepEqual(checkReports([{ ...gallery, metadata, html: migrated }]).get("component-catalog") ?? [], [], "its ids pass the checks");
  }
  const html = migrated.replace(/<p data-block-id="([a-z0-9]+)">/, (tag) => `${tag.replace(">", "")}></p>${tag}`);
  const failures = checkReports([{ ...gallery, html }]).get("component-catalog") ?? [];
  assert.ok(failures.some((message) => message.startsWith("data-block-id repeats")), failures.join("\n"));
}

// Through the commit endpoint (ids on, as the preview server has them): the first commit of a
// block names it, a later commit from the same page leaves that id alone.
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-ids-"));
  const file = path.join(root, "demo", "report.html");
  await fs.mkdir(path.dirname(file));
  const source = strip(SRC);
  await fs.writeFile(file, source);
  const service = createEditService({ reportsDirectory: root, ids: sequence("e") });
  const map = JSON.parse(service.preview("demo", source).snippet.match(/<script type="application\/json"[^>]*>([^<]*)<\/script>/)[1]);
  const server = http.createServer((request, response) => service.commit(request, response));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const host = `127.0.0.1:${server.address().port}`;
  const post = (body, route = "commit") => fetch(`http://${host}/__gallery/edit/${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": service.token },
    body: JSON.stringify({ slug: "demo", opening: map.version, ...body }),
  }).then((response) => response.json());
  // A paragraph's text, named as the page names it before it has an id.
  const commitText = (words, html) => {
    const entry = map.blocks.find((candidate) => candidate.inner.includes(words));
    const unit = { key: entry.unit, open: entry.unit, hash: map.units[entry.unit].hash };
    return { texts: [{ key: "t", block: { unit, self: true, before: entry.inner }, parts: [{ keep: true, html }] }] };
  };
  try {
    assert.ok((await post(commitText("甲段", "甲段（人改）"))).ok);
    assert.ok((await fs.readFile(file, "utf8")).includes(`<p data-block-id="e0000001">甲段（人改）</p>`));
    assert.ok((await post(commitText("乙段", "乙段（人改）"))).ok, "a second commit from the page opened before");
    const text = await fs.readFile(file, "utf8");
    assert.ok(text.includes(`<p data-block-id="e0000001">甲段（人改）</p>`) && text.includes(`<p data-block-id="e0000002">乙段（人改）</p>`));
    assert.equal(strip(text), source.replace("甲段：我们先理解材料，再选择组件。", "甲段（人改）").replace("乙段。", "乙段（人改）"));

    // No endpoint takes ids out of a file again (templates, which kept none, are gone), and no page
    // is told it shows one.
    assert.equal(service.clean, undefined);
    assert.equal(JSON.parse(service.preview("demo", text).snippet.match(/<script type="application\/json"[^>]*>([^<]*)<\/script>/)[1]).template, undefined);
  } finally {
    server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

// The hand-in (an export's write of the file, POST /__gallery/edit/hand-in while a preview server runs,
// edits.handIn for the workbench's 导出): the file as its pages see it, every block given an id; asked
// again, nothing left to do. A report whose ids repeat is left as it is (the export's check names them,
// never renamed), and one whose report.json still says "template": true is handed in as any; a
// command of another directory of reports is refused (the state directory it found this server by
// may be another checkout's).
{
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-hand-in-"));
  const file = path.join(root, "demo", "report.html");
  await fs.mkdir(path.dirname(file));
  const natural = strip(SRC).replace("乙段。", "乙段<mark>标记</mark>。");
  await fs.writeFile(file, natural);
  const finish = (text) => text.replace("</head>", "<script data-kit-tag></script></head>");
  const service = createEditService({ reportsDirectory: root, ids: sequence("h"), finish });
  const server = http.createServer(service.handInRequest);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const host = `127.0.0.1:${server.address().port}`;
  const post = (body) => fetch(`http://${host}/__gallery/edit/hand-in`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: `http://${host}`, "X-Gallery-Token": service.token },
    body: JSON.stringify(body),
  }).then(async (response) => ({ status: response.status, body: await response.json() }));
  try {
    const shown = (await service.read("demo")).text;
    assert.ok(shown.includes('乙段<span class="doc-highlight-yellow">标记</span>。') && shown.includes("data-kit-tag") && (await fs.readFile(file, "utf8")) === natural, "read: the page's text, the file as written");
    const elsewhere = await post({ slug: "demo", workspace: path.join(root, "other") });
    assert.ok(elsewhere.status === 409 && elsewhere.body.reason === "elsewhere" && (await fs.readFile(file, "utf8")) === natural, "another directory's command is refused");
    const handed = await post({ slug: "demo", workspace: root });
    const text = await fs.readFile(file, "utf8");
    assert.ok(handed.body.ok && handed.body.written && handed.body.changes.map((change) => change.rule).join() === "mark", JSON.stringify(handed.body));
    assert.equal(handed.body.added, findUnits(shown).units.length, "every block given an id");
    assert.deepEqual(findUnits(text).units.filter((unit) => !unit.blockId), [], "none without one");
    assert.equal(strip(text), shown, "the page's text, the ids aside");
    // Each block given an id said with its line in the file written, its start tag and its id.
    const lines = text.split("\n");
    assert.equal(handed.body.given.length, handed.body.added);
    for (const { id, line, tag } of handed.body.given) assert.ok(lines[line - 1].includes(`data-block-id="${id}"`) && lines[line - 1].includes(tag.slice(0, -1).split(" ")[0]), `${id} on line ${line}: ${lines[line - 1]}`);
    assert.deepEqual(handed.body.given.map(({ id }) => id), handed.body.given.map(({ id }) => id).sort(), "in the file's order (the ids made in it)");
    assert.deepEqual((await post({ slug: "demo", workspace: root })).body, { ok: true, changes: [], added: 0, given: [], repeated: [], written: false, title: null, icon: null }, "a second hand-in: nothing to do");
    assert.equal(await fs.readFile(file, "utf8"), text);
    // A copy that kept its id: nothing written, the repeated id named.
    const copied = natural.replace("<p>乙段", '<p data-block-id="twice">一</p><p data-block-id="twice">乙段');
    await fs.writeFile(file, copied);
    const repeated = await service.handIn("demo");
    assert.ok(repeated.ok && !repeated.written && repeated.repeated[0]?.id === "twice" && (await fs.readFile(file, "utf8")) === copied, JSON.stringify(repeated));
    // A report.json that still says "template": true is an ordinary report's: its page shows its
    // natural HTML as the kit's, and its hand-in gives every block an id.
    await fs.writeFile(path.join(root, "demo", "report.json"), JSON.stringify({ title: "t", template: true }));
    await fs.writeFile(file, natural);
    assert.notEqual((await service.read("demo")).text, natural, "its page shows the kit's markup");
    const old = await service.handIn("demo");
    assert.ok(old.written && old.added > 0 && findUnits(await fs.readFile(file, "utf8")).units.every((unit) => unit.blockId), JSON.stringify(old));
  } finally {
    server.close();
    await fs.rm(root, { recursive: true, force: true });
  }
}

// The random ids are made in one place (src/shared/ids.mjs) for the page and the server, and the format
// each side checks is that place's: what the page proposes is always one the server takes.
{
  for (let round = 0; round < 2000; round++) {
    assert.match(randomBlockId(), BLOCK_ID, "a block id: a letter, then seven letters or digits");
    assert.match(randomRequestId(), REQUEST_ID, "a commit's id passes the server's check");
  }
  assert.equal(serverBlockId, randomBlockId, "the server makes block ids with the same function");
  assert.equal(randomId(5).length, 5);
  assert.doesNotMatch("1bcdefgh", BLOCK_ID, "a digit first is no block id");
  assert.doesNotMatch("abcdefg", BLOCK_ID);
  assert.doesNotMatch("abc", REQUEST_ID);
  assert.ok(new Set(Array.from({ length: 500 }, randomBlockId)).size > 490, "ids do not repeat");
}

console.log("Checked block ids: no binding, found by id when moved and changed (a card's text through its card), duplicates told apart, a repeated id a conflict and a dropped one found as the page opened the block, deletions around an edit as conflicts, ids given lazily (edits, card text, splits, moves, sizes, new sections; kept on conversion; none without edits), the migration and its idempotence (what it gave listed by line and start tag, as the check lists what an export will give beforehand), the repeated-id check (an old template flag nothing), the commit endpoint, a unit's hash without its ids (start tags ending in whitespace, ids in capitals too), and the hand-in (every block given an id, once, each said at its line; repeated ids left as they are, an old template flag nothing).");
