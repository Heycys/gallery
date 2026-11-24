import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { JSDOM } from "jsdom";
import {
  ADVICE, CODE_SIDEWAYS, KINDS, MOVED_PART, MOVED_WHOLE, NEIGHBOUR_EDGE, PICTURED_INFO, SCROLLS, WARNED, adoptIdless, missedWidths, adviceOf, baselineOf, baselineSaid, blocksOf, blocksToPicture, describeLooks, disclosuresSaid, HAND_OVER, INK_MARGIN, pageOf, seenOf,
  exportingFirst, findingLevel, layoutNotesOf, levelOf, movedBlocks, movedClips, nextBaseline, picturedAt, picturesSaid, placeOf, rankOf, readBaseline, sourceIndex, staleExport, timeOf, urlName,
  verdictOf, wordsOf, inventory, LOOK_YOURSELF, notPicturedLine, startFailure, namedBlocks, unknownBlocks, unknownBlocksSaid, inkOf, SCROLL_FRAMES, unopenedSaid,
  RUNS_KEPT, CHANGED_PICTURES, checklistSaid, endRun, runName, startRun,
} from "../../src/cli/qa.mjs";
import { handedInSource } from "../../src/editor/source.mjs";
import { noteInWords } from "../../src/shared/qa-levels.mjs";
import { withExportPolicy } from "../../src/render/pipeline.mjs";
import { checkPanel } from "../../src/render/preview-checks.mjs";
import { createReportFromStarter } from "../../src/render/reports.mjs";
import { exportSourceOf, sourceMeta } from "../../src/shared/export-wrap.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { cellColumns } from "../../src/shared/table-hides.mjs";
import { slotsOf } from "../../src/shared/table-slots.mjs";
import { findBrowser, settle, startBrowser } from "../../src/transfer/browser.mjs";
import { newNames } from "../../src/shared/new-names.mjs";

// gallery qa (src/cli/qa.mjs, docs/render.md "Quality check") and gallery open
// (src/cli/preview.mjs): the levels of the findings (a table's columns and rows out of sight, and a
// code or formula block that scrolls, warn only where a reader has room for them; the kit's
// data-missing fails, its notes of a table's columns and rows are those columns and rows, its other
// notes are info; a drawing's text its viewBox scales below 11px warns), the export's sha256 of the report.html it was made from and when it is stale, the
// blocks pictured (what the Agent draws first, then columns and other figures, then tables; a card
// in another folded into its picture; the moved first, each with its neighbours; the blocks changed
// and the cards not changed in groups of their own; every card when the report's script or style
// changed) and what is kept of them for
// the next run (blocks.json read whatever it holds, a table chart's card changed with its table, a
// moved block not pictured still moved until a run pictures it, however many moved; the cards a first
// look left unpictured kept as unseen, and a block held that no picture showed; nothing kept after a
// run that failed; where a moved block is
// pictured), the baseline the export and the preview write of the report before a round of changes
// (the text the export before was made from; none of a starter), times with their zone, the
// columns each cell ends in as the kit's slots tile them, how an address is named, a finding's
// place in report.html (a block id's line, a card's title, a table by its name, the words of the
// element or of what holds it, the second of two equal paragraphs at its own line), the text printed
// (the pictures first, from the run's folder, a block a line, their looks in braces; the tables that
// scroll by line and name, each said as information; the findings, each kind's advice at any level;
// each look's counts, disclosures closed in the file and opened for the pictures, a finding seen in
// several looks said and counted once, info said but what a scrolling table does; the verdict last
// with each look's counts and the deliverable's path), both commands' command lines, the preview's note listing the kit's
// layout notes that fail as they come and go (said in Chinese), and runs of gallery qa: on
// a report built to fail (its export missing: exported first; not of its report.html as it is now, refused with
// --no-export (exit 2) or exported first, by its sha256 whatever the files' times; a browser that
// does not start, exit 3; then looked at, exit 1, the fail lines, the pictures of its cards, of a
// changed block, of a moved one with its neighbours, of the blocks named, and of the page in tiles
// and its Sheet panel shown second in tiles of their own, each kind of run in its own folder, the
// pictures of the run before said to be removed; a path that cannot break past the window's edge,
// located by its words), and on a report built to warn (a column cut by its body's
// words, none by a list's or a paragraph's box in a cell, rows below the kit's frame, text over text
// in a drawing, a drawing's text its viewBox scales small, a figure's own words past their box, words and marks cut at the bottom of a box (and what is no cut: a frame that scrolls, a tight line, a box folded to nothing, a label placed out of the box, a cropped picture), code and formulas that scroll in their frames (info
// where the author or the reader chose it, or in a closed disclosure) and a code title cut, a table named by its chart card's title or by its note with its tab apart; the
// kit's own notes and fading edge alike), and on a report of what an Agent draws itself (a whole
// block's picture holding the dots it draws past its box, its words past their column on a phone, a
// detail card opened and its table checked and pictured, a new Sheet area pictured with each panel and
// its blocks then seen, the report's style changed alone, a detail card in a Sheet panel not shown at
// first, a Sheet in a detail card shown panel by panel).

// ---------- levels ----------
assert.equal(levelOf("table-columns", 1024), "warn");
assert.equal(levelOf("table-columns", 736), "warn");
assert.equal(levelOf("table-columns", 360), "info", "columns out of sight on a phone are the table scrolling");
assert.deepEqual(["error", "blocked", "image", "chart-empty", "chart-text-clipped", "raw-formula", "overflow"].map((kind) => levelOf(kind, 360)), Array(7).fill("fail"));
assert.deepEqual(["ticks", "chart-text-overlap", "svg-text-small", "overflow-in-block", "cut-in-block", "layout-note", "table-scrolls", "table-rows", "unverified", "anything-new"].map((kind) => levelOf(kind, 1024)), ["warn", "warn", "warn", "warn", "warn", "info", "info", "warn", "unverified", "warn"]);
assert.deepEqual(["svg-text-small", "overflow-in-block", "cut-in-block"].map((kind) => levelOf(kind, 360)), ["warn", "warn", "warn"], "at every width");
assert.ok(!("labels-hidden" in KINDS), "no kind of the shared charts' notes");
// A code block or a formula block whose content scrolls in its frame warns where a reader has room
// for it, and is info on a phone, where it is pictured all the same; a code block's title cut is info.
assert.deepEqual(["code-scrolls", "formula-scrolls", "code-title-cut"].map((kind) => [1024, 736, 360].map((width) => levelOf(kind, width))), [["warn", "warn", "info"], ["warn", "warn", "info"], ["info", "info", "info"]]);
assert.deepEqual([...PICTURED_INFO].sort(), ["code-scrolls", "formula-scrolls"]);
// A finding may say its own level: code or a formula scrolling as the author or the reader chose (a
// code block's own frame height, its lines left unwrapped) or in a disclosure closed in the file is
// info at every width, and pictured on a phone alone, as any that scrolls there is.
assert.deepEqual([1024, 360].map((width) => findingLevel({ kind: "code-scrolls" }, width)), ["warn", "info"]);
assert.deepEqual([1024, 360].map((width) => findingLevel({ kind: "code-scrolls", level: "info" }, width)), ["info", "info"]);
assert.deepEqual([1024, 360].map((width) => picturedAt({ kind: "code-scrolls" }, width)), [true, true], "its kind's level: pictured at every width");
assert.deepEqual([1024, 736, 360].map((width) => picturedAt({ kind: "formula-scrolls", level: "info" }, width)), [false, false, true], "its own: on a phone alone");
assert.deepEqual([picturedAt({ kind: "layout-note" }, 1024), picturedAt({ kind: "chart-empty" }, 360), picturedAt({ kind: "ticks" }, 360)], [false, true, true]);
// The kit's notes as it writes them: one a line, "<name>: <message>", each at its level at a width
// (the preview's note reads them with the same function: below).
assert.deepEqual(layoutNotesOf('data-missing: its table has merged cells: write each value in its own cell, the category on every row\nlabels-truncated: 2 category names cut to fit').map(({ name, kind, note }) => [name, kind, note]), [
  ["data-missing", "chart-empty", "data-missing: its table has merged cells: write each value in its own cell, the category on every row"],
  ["labels-truncated", "layout-note", "labels-truncated: 2 category names cut to fit"],
]);
assert.deepEqual(layoutNotesOf("columns-hidden: of 9 columns, 4 out of sight (\"a\") (scroll sideways)\r\nrows-hidden: the frame shows 12 of 40 rows (scroll down)\n").map(({ kind }) => kind), ["table-columns", "table-rows"]);
assert.deepEqual(["table-columns", "table-rows"].map((kind) => levelOf(kind, 360)), ["info", "info"], "a phone's scrolling table is no warning");
// The preview's note says the notes that fail in Chinese (noteInWords), or English: a chart that drew
// nothing; a note it does not know, as it is.
assert.deepEqual([
  'data-missing: no table carries data-doc-chart-source="t1": put the table back, or delete the card',
  "labels-hidden: 3 of 8 value labels did not fit; the chart shows none",
  "something-new: as it is",
].map((note) => noteInWords(note)), [
  "图表没有画出来：从表格里没读到能画的数据",
  "labels-hidden: 3 of 8 value labels did not fit; the chart shows none",
  "something-new: as it is",
]);
assert.equal(noteInWords("data-missing: x", { english: true }), "The chart was not drawn: its table gave it nothing to draw");

const notes = "data-missing: its table has merged cells\ncolumns-hidden: of 9 columns, 1 cut at the frame's edge (\"b\") (scroll sideways)\nrows-hidden: the frame shows 12 of 40 rows (scroll down)\nlabels-thinned: 4 of 12 category names left out to fit (one in 2 shown)";
assert.deepEqual([1024, 736, 360].map((width) => layoutNotesOf(notes, width).map(({ level }) => level)), [
  ["fail", "warn", "warn", "info"], ["fail", "warn", "warn", "info"], ["fail", "info", "info", "info"],
], "data-missing fails, a table's columns and rows warn where a reader has room for them, any other note is info");
assert.deepEqual(layoutNotesOf("labels-rotated").map(({ name, kind, level }) => [name, kind, level]), [["labels-rotated", "layout-note", "info"]]);
assert.deepEqual(layoutNotesOf(['data-missing: no table carries data-doc-chart-source="t1"', "data-skipped: row 2 has no name in the first column"].join("\n")).map(({ name, kind, level }) => [name, kind, level]), [["data-missing", "chart-empty", "fail"], ["data-skipped", "layout-note", "info"]], "a table chart with nothing to draw fails, what it left out is info");
assert.deepEqual(layoutNotesOf(""), []);
// A note of the shared charts there were (labels-hidden, label-collision): any other note, info.
assert.deepEqual(layoutNotesOf('label-collision: the reference line\'s label "All" lies over the line of "损失"\nlabels-hidden: 3 of 8 value labels did not fit', 360).map(({ kind, level }) => [kind, level]), [["layout-note", "info"], ["layout-note", "info"]]);

// ---------- which report.html an export was made from ----------
{
  // The export says the sha256 of the report.html it was made from right after its policy, where
  // exportSourceOf reads it (not a code sample's, nor an older export's that says none).
  const page = '<!-- <head> -->\n<HEAD data-x="1" ><title>t</title></HEAD><body><pre>&lt;meta name="doc-export-source" content="sha256:x"&gt;</pre></body>';
  assert.equal(sourceMeta("b".repeat(64)), `<meta name="doc-export-source" content="sha256:${"b".repeat(64)}">`, "named as the view copy's doc-export-id is");
  const hash = "a".repeat(64);
  const exported = withExportPolicy("alpha", page, hash);
  assert.ok(exported.includes(`<HEAD data-x="1" >\n  <meta name="generator" content="Gallery">\n  <meta http-equiv="Content-Security-Policy" content=`), exported);
  assert.ok(exported.includes(`">\n  ${sourceMeta(hash)}<title>`), exported);
  assert.equal(exportSourceOf(exported), hash);
  assert.equal(exportSourceOf(exported.replace('content="Gallery"', 'content="HTML Report Studio"')), hash, "an export made before the product's rename (2026-10-26, its generator HTML Report Studio) says it alike: not stale for that");
  assert.equal(exportSourceOf(withExportPolicy("alpha", page)), null, "an export made before exports said it says none");
  assert.equal(exportSourceOf(`<head><p>${sourceMeta(hash)}</p></head>`), null, "only where the export writes it");
  // One made before the kit's names were doc-* (2026-10-26) says none: its page is in the old names, which gallery qa does not read.
  assert.equal(exportSourceOf(exported.replace('name="doc-export-source"', 'name="report-export-source"')), null, "an export in the old names says none");
  assert.match(staleExport(null, hash).why, /before the kit's names were doc-\*/);
  // Stale is a sha256 that differs (or none said), never a time: a file restored, or copied with a
  // data directory, is judged by its bytes.
  assert.deepEqual(staleExport(hash, hash), { stale: false, why: "" });
  assert.deepEqual(staleExport("b".repeat(64), hash), { stale: true, why: "made from a text whose sha256 is bbbbbbbbbbbb…, the file's is aaaaaaaaaaaa…" });
  // Of the same text, an export holds the packages it was made with.
  assert.deepEqual(staleExport(hash, hash, { said: "local/a@1 local/b@2", now: "local/a@1 local/b@2" }), { stale: false, why: "" });
  assert.deepEqual(staleExport(hash, hash, { said: "local/a@1", now: "local/a@2" }), { stale: true, packaged: true, why: "it holds local/a@1, the workspace has local/a@2" });
  assert.deepEqual(staleExport(hash, hash, { said: "local/a@1", now: "" }), { stale: true, packaged: true, why: "it holds local/a@1, the workspace has none of them" });
  assert.match(exportingFirst("t", { packaged: true }), /a custom block it uses changed since the last export/);
  assert.match(staleExport(null, hash).why, /does not say which text it was made from/);
}

// ---------- the blocks pictured ----------
{
  const html = `<!doctype html><html><head><title>t</title></head><body><main class="doc-page">
<section class="doc-section" data-block-id="s1"><h2 data-block-id="h1">一节</h2>
<p data-block-id="p1">一段  话</p>
<div class="doc-table-wrap" data-block-id="t1"><table class="doc-table"><tr><td>1</td></tr></table></div>
<figure class="doc-image" data-block-id="i1"><img src="assets/a.png" alt=""></figure>
<figure class="doc-figure" data-block-id="f1"><h3>图</h3><div data-doc-chart="dots"><script type="application/json">[]</script></div></figure>
<ul data-block-id="u1"><li data-block-id="l1">一</li></ul>
<div class="doc-code" data-block-id="k1"><div class="doc-code-title">a.js</div><pre><code>x</code></pre></div>
<template><p data-block-id="x1">模板里的</p></template>
</section></main></body></html>`;
  const blocks = blocksOf(html);
  assert.deepEqual([...blocks.keys()], ["s1", "h1", "p1", "t1", "i1", "f1", "u1", "l1", "k1"], "every block of the page in the file's order, none of a template");
  assert.deepEqual([...blocks].filter(([, { card }]) => card).map(([id]) => id), ["t1", "i1", "f1", "k1"], "the cards: tables, figures, code blocks");
  assert.deepEqual(["f1", "k1", "i1", "t1", "p1"].map((id) => blocks.get(id).rank), [0, 0, 1, 2, 3], "chart cards and code blocks first, then other figures, then tables, then the rest");
  assert.deepEqual([blocks.get("t1").tag, blocks.get("p1").tag], ["div.doc-table-wrap", "p"]);
  assert.deepEqual(["s1", "h1", "p1", "k1", "l1"].map((id) => [blocks.get(id).parent, blocks.get(id).at]), [[null, 0], ["s1", 0], ["s1", 1], ["s1", 6], ["u1", 0]], "each block's parent block and its place among that parent's blocks");
  const look = (found) => ({ blocks: Object.fromEntries([...found].map(([id, { hash }]) => [id, hash])), places: Object.fromEntries([...found].map(([id, { parent, at }]) => [id, [parent, at]])), moved: [], unseen: [] });
  const before = look(blocks);
  const cards = "the cards (chart cards, code blocks, whole blocks, components, flowcharts and Sheet areas, then columns and the other figures, then tables)";
  const first = blocksToPicture(blocks, null);
  assert.deepEqual([first.ids, first.why, first.rest, first.unknown, first.moved.size, first.around.size], [["f1", "k1", "i1", "t1"], `${cards}: no earlier look to compare with`, [], [], 0, 0]);
  assert.deepEqual(first.groups, [{ kind: "cards", why: `${cards}: no earlier look to compare with`, ids: ["f1", "k1", "i1", "t1"], rest: [] }], "one group, pictured into cards/");
  assert.deepEqual(blocksToPicture(blocks, before).ids, ["f1", "k1", "i1", "t1"], "nothing changed: the cards again, in the same order");
  assert.equal(blocksToPicture(blocks, before).why, `${cards}: no block changed since the last look`);
  // A flowchart, a Sheet area and columns are cards too (a first look pictured none of them).
  const figures = blocksOf(`<main class="doc-page"><p data-block-id="a">话</p><ol class="doc-flow" data-block-id="b"><li data-block-id="b1"><p>一步</p></li></ol>
<section class="doc-sheet-shell" data-doc-sheets="x" data-block-id="c"></section><div class="doc-columns" data-block-id="d"><div class="doc-column" data-block-id="d1"></div></div>
<ol data-block-id="e"><li data-block-id="e1">条</li></ol><figure class="doc-figure" data-block-id="f"></figure></main>`);
  assert.deepEqual(blocksToPicture(figures, null).ids, ["b", "c", "f", "d"], "the flowchart, the Sheet area and the chart card, then the columns; no list, item, column or paragraph");
  assert.deepEqual(["b", "c", "d", "b1", "d1", "e", "e1", "a", "f"].map((id) => figures.get(id).rank), [0, 0, 1, 3, 3, 3, 3, 3, 0]);
  assert.equal(rankOf({ tagName: "section", attrs: [{ name: "data-doc-sheets", value: "x" }] }), 0, "a Sheet area by its attribute too");
  // A whole block (an element of a class of the report's own, a bare <svg>: a layout or a drawing of
  // the Agent's own) is a card too, pictured on a first look; a kit block with a class of its own
  // beside the kit's is not one.
  const drawings = blocksOf(`<main class="doc-page"><p data-block-id="a">话</p><div class="arch" data-block-id="b"><p>应用层</p></div>
<svg viewBox="0 0 10 10" data-block-id="c"><text>图</text></svg><p class="lead" data-block-id="d">导语</p></main>`);
  assert.deepEqual(["a", "b", "c", "d"].map((id) => drawings.get(id).rank), [3, 0, 0, 3]);
  assert.deepEqual(["a", "b", "c", "d"].map((id) => drawings.get(id).whole), [false, true, true, false], "the whole blocks, whose words qa measures");
  assert.deepEqual(blocksToPicture(drawings, null).ids, ["b", "c"]);
  // An instance of a component package is one too, laid out by its package's style (found testing the
  // skill with Agents, 2026-11-02: a metric strip's two instances were in no picture of a plain run).
  const instances = blocksOf(`<main class="doc-page"><p data-block-id="a">话</p><div class="strip" data-doc-component="local/strip" data-block-id="b"><h3>指标</h3></div></main>`);
  assert.deepEqual([instances.get("b").rank, instances.get("b").card, blocksToPicture(instances, null).ids], [0, true, ["b"]], "an instance: a card of the first rank");
  // A block's own words changed, a block added to another: only those, not what holds them; a chart
  // card or code block changed before a paragraph.
  const changed = blocksOf(html.replace("一段  话", "一段 新的 话").replace(`<li data-block-id="l1">一</li>`, `<li data-block-id="l1">一</li><li data-block-id="l2">二</li>`).replace("<code>x</code>", "<code>y</code>"));
  const picked = blocksToPicture(changed, before);
  assert.deepEqual([picked.ids, picked.why, picked.moved.size], [["k1", "p1", "l2"], "the blocks changed since the last look", 0], "a block added after the others moves none of them");
  // A baseline the export or the preview wrote of the report before a round of changes: its blocks as
  // they were there, said with when (timeOf, its zone in it), its cards unseen (no look has seen that
  // text: two exports before the first look, or a first look that failed, which keeps it): the blocks
  // changed first, then every card.
  const exportedAt = Date.UTC(2026, 9, 25, 6, 3, 59);
  const ofExport = baselineOf(html, { from: "export", time: exportedAt });
  assert.deepEqual(ofExport, { ...before, unseen: ["t1", "i1", "f1", "k1"], from: "export", time: exportedAt, page: "" }, "its script and style kept too (none)");
  const sinceExport = blocksToPicture(changed, readBaseline(JSON.stringify(ofExport)));
  // Those changed, then, under a heading of their own (an Agent took them for blocks it changed),
  // the cards no look has pictured yet.
  assert.deepEqual([sinceExport.ids, sinceExport.groups], [["k1", "p1", "l2", "f1", "i1", "t1"], [
    { kind: "changed", why: `the blocks changed since the export of ${timeOf(exportedAt)} (the document before these changes)`, ids: ["k1", "p1", "l2"], rest: [] },
    { kind: "cards", why: "the cards no look has pictured yet (not changed themselves)", ids: ["f1", "i1", "t1"], rest: [] },
  ]]);
  assert.equal(nextBaseline(changed, ofExport, sinceExport, { failed: true }), null, "a look that failed keeps them unseen");
  assert.deepEqual(nextBaseline(changed, ofExport, sinceExport).unseen, [], "a look that passed has seen them");
  // Blocks with no id yet (the preview opened before the first export): taken as the export will give
  // them one, each known after it by its markup (adoptIdless), the section holding them unchanged by
  // its blocks' ids; what the round changed of them pictured, then the cards.
  const draft = `<!doctype html><html><head><title>t</title></head><body><main class="doc-page">
<section class="doc-section" data-block-id="s1"><h2>一节</h2>
<p>一段话</p>
<table><tr><th>甲</th></tr><tr><td>1</td></tr></table>
<p>一段话</p>
</section></main></body></html>`;
  const ofDraft = readBaseline(JSON.stringify(baselineOf(draft, { from: "preview", time: exportedAt })));
  assert.deepEqual([ofDraft.blocks, ofDraft.places, ofDraft.idless.length, ofDraft.unseen], [{ s1: blocksOf(handedInSource(draft, {}).text).get("s1").hash }, { s1: [null, 0] }, 4, []], "the section by its id, the heading, the paragraphs and the table (made the kit's) by their markup");
  const draftExported = blocksOf(handedInSource(draft, {}).text);
  const wrap = [...draftExported].find(([, { tag }]) => tag === "div.doc-table-wrap")[0];
  const draftAdopted = adoptIdless(draftExported, ofDraft);
  assert.deepEqual([Object.keys(draftAdopted.blocks).length, draftAdopted.unseen, draftAdopted.idless], [5, [wrap], undefined], "every one known, its card unseen");
  const asWas = blocksToPicture(draftExported, draftAdopted);
  assert.deepEqual([asWas.ids, asWas.why], [[wrap], `${cards}, those no look has pictured yet first: no block changed since gallery open of ${timeOf(exportedAt)} (the document before these changes)`]);
  const draftEdited = blocksOf(handedInSource(draft.replace(/<p>一段话<\/p>\n<\/section>/, "<p>一段改过的话</p>\n</section>"), {}).text);
  const editedPara = [...draftEdited].find(([, { tag }], at, all) => tag === "p" && at === all.length - 1)[0];
  const draftAdoptedEdited = adoptIdless(draftEdited, ofDraft);
  assert.equal(draftAdoptedEdited.idless.length, 1, "the paragraph changed stays unknown");
  assert.deepEqual(blocksToPicture(draftEdited, draftAdoptedEdited).ids, [editedPara, [...draftEdited].find(([, { tag }]) => tag === "div.doc-table-wrap")[0]], "the paragraph changed, then the table no look has seen");
  // A text of no block at all: nothing a look could compare with (writeBaseline writes none).
  assert.deepEqual(baselineOf("<main class=\"doc-page\"></main>", { from: "preview", time: 0 }).blocks, {});
  assert.equal(adoptIdless(blocks, null), null);
  assert.equal(baselineSaid({ from: "preview", time: exportedAt }), `gallery open of ${timeOf(exportedAt)} (the document before these changes)`);
  assert.equal(baselineSaid({ from: "export", time: null }), "the export (the document before these changes)");
  assert.match(blocksToPicture(blocks, ofExport).why, /^the cards .*: no block changed since the export of /);
  assert.match(timeOf(exportedAt), /^2026-10-2[456]T\d\d:\d\d:59[+-]\d\d:\d\d$/, "a time with its zone");
  const zone = -new Date(exportedAt).getTimezoneOffset();
  assert.equal(new Date(timeOf(exportedAt)).getTime(), exportedAt, `read back as the same instant (zone ${zone} minutes)`);
  assert.deepEqual(blocksToPicture(blocksOf(html.replace("一段  话", "一段\n话")), before).ids, ["f1", "k1", "i1", "t1"], "blanks are one");
  // A no-break space is a character a reader sees, not a blank: a space made one is a change (found testing
  // the skill with Agents, 2026-11-02: spaces after ▲ made no-break ones, "no block changed").
  for (const space of ["\u00a0", "&nbsp;", "\u3000"]) assert.deepEqual(blocksToPicture(blocksOf(html.replace("一段  话", `一段 ${space}话`)), before).ids, ["p1"], `${JSON.stringify(space)} is no blank`);
  const named = blocksToPicture(blocks, before, ["t1", "nope", "p1", "t1"]);
  assert.deepEqual([named.ids, named.why, named.unknown], [["t1", "p1"], "the blocks named", ["nope"]], "those named, in the order named");
  // --blocks split at commas and white space (found testing the skill with Agents, 2026-10-29: PowerShell passes
  // `--blocks a,b,c` unquoted as an array, which npm's gallery.ps1 joins into one argument, "a b c");
  // the ids no block has, said before anything is looked at.
  assert.deepEqual(namedBlocks("t1,p1"), ["t1", "p1"]);
  assert.deepEqual(namedBlocks("t1 p1 f1"), ["t1", "p1", "f1"], "gallery.ps1's: joined with spaces");
  assert.deepEqual(namedBlocks(" t1, p1 ,,\tf1\n"), ["t1", "p1", "f1"], "blanks, tabs and empty parts");
  assert.deepEqual(namedBlocks(",, "), []);
  assert.deepEqual(unknownBlocks(html, ["t1", "nope", "p1", "nope", "zz"]), ["nope", "zz"], "each once, in the order named");
  assert.deepEqual(unknownBlocks(html, namedBlocks("t1 p1")), []);
  assert.equal(unknownBlocksSaid("/w/demo/doc.html", ["nope"]), "--blocks: no block of /w/demo/doc.html has the id nope: nothing was looked at and no picture removed. Name ids as gallery qa prints them (data-block-id in the file).");
  assert.match(unknownBlocksSaid("/w/demo/doc.html", ["a", "b"]), /has the ids a, b: /);
  const many = blocksOf(`<main class="doc-page">${Array.from({ length: 15 }, (_, at) => `<figure data-block-id="c${at}"></figure>`).join("")}</main>`);
  assert.deepEqual([blocksToPicture(many, null).ids.length, blocksToPicture(many, null).rest], [12, ["c12", "c13", "c14"]], "twelve at most, the rest named");
  // gallery qa's own runs (complete): every block changed or moved, not twelve (a second run asked of the
  // Agent no more), CHANGED_PICTURES at most, and the cards that are left of the twelve; a plain call, as
  // the rest of this file calls it, still twelve at most.
  {
    const ids = Array.from({ length: 20 }, (_, at) => `q${String(at).padStart(2, "0")}`);
    const twenty = (order) => blocksOf(`<main class="doc-page"><section class="doc-section" data-block-id="s"><h2 data-block-id="h">一节</h2>${order.map((id) => `<p data-block-id="${id}">段落 ${id}</p>`).join("")}</section></main>`);
    const start = readBaseline(JSON.stringify(nextBaseline(twenty(ids), null, blocksToPicture(twenty(ids), null))));
    const reversed = twenty([...ids].reverse());
    const plain = blocksToPicture(reversed, start);
    const whole = blocksToPicture(reversed, start, null, { complete: true });
    assert.deepEqual([plain.ids.length, plain.rest.length], [12, 7], "as before");
    assert.deepEqual([whole.ids.length, whole.rest, whole.moved.size, whole.groups.length], [19, [], 19, 1], "all nineteen moved, none left for a second run");
    assert.deepEqual(whole.ids.slice(0, 12), plain.ids, "in the same order");
    // The cards take what the changed blocks left of the twelve; the rest need no look and stay unseen.
    const first = blocksToPicture(many, null, null, { complete: true });
    assert.deepEqual([first.ids.length, first.rest], [12, ["c12", "c13", "c14"]], "a first look: twelve cards, the rest need none");
    const seen = readBaseline(JSON.stringify(nextBaseline(many, null, first)));
    const edited = (count) => blocksOf(`<main class="doc-page">${Array.from({ length: 15 }, (_, at) => `<figure data-block-id="c${at}">${at < count ? "改过" : ""}</figure>`).join("")}</main>`);
    const mixed = blocksToPicture(edited(5), seen, null, { complete: true });
    assert.deepEqual(mixed.groups.map(({ kind, ids: each, rest }) => [kind, each.length, rest.length]), [["changed", 5, 0], ["cards", 3, 0]], "five changed, and the cards no look has pictured");
    const wide = blocksToPicture(edited(14), seen, null, { complete: true });
    assert.deepEqual(wide.groups.map(({ kind, ids: each, rest }) => [kind, each.length, rest.length]), [["changed", 14, 0], ["cards", 0, 1]], "fourteen changed: all of them, and no room for a card");
    const crowd = (count, words) => blocksOf(`<main class="doc-page">${Array.from({ length: count }, (_, at) => `<figure data-block-id="x${at}">${words}</figure>`).join("")}</main>`);
    const sixty = CHANGED_PICTURES + 3;
    const crowded = blocksToPicture(crowd(sixty, "改过"), readBaseline(JSON.stringify(nextBaseline(crowd(sixty, ""), null, blocksToPicture(crowd(sixty, ""), null)))), null, { complete: true });
    assert.deepEqual([crowded.ids.length, crowded.rest.length], [CHANGED_PICTURES, 3], "past CHANGED_PICTURES the rest is named, as before");
  }
  // A run's folder: its time to the second, as the clock reads it, a number after it for a second run
  // in the same second; a new one made, what an earlier Gallery kept loose in qa/<slug>/ taken away;
  // the newest five kept as a run ends, a run that took no picture leaving nothing (and displacing none).
  {
    const when = new Date(2026, 10, 11, 14, 2, 33);
    assert.equal(runName(when), "2026-11-11_14-02-33");
    assert.equal(runName(when, ["2026-11-11_14-02-33"]), "2026-11-11_14-02-33-2");
    assert.equal(runName(when, ["2026-11-11_14-02-33", "2026-11-11_14-02-33-2"]), "2026-11-11_14-02-33-3");
    assert.equal(RUNS_KEPT, 5);
    const slugDir = await fs.mkdtemp(path.join(os.tmpdir(), "qa-runs-"));
    try {
      for (const name of ["flagged", "changed", "cards", "blocks", "tiles"]) {
        await fs.mkdir(path.join(slugDir, name));
        await fs.writeFile(path.join(slugDir, name, "1024-a.png"), "x");
      }
      await fs.writeFile(path.join(slugDir, "1024-b.png"), "x");
      await fs.writeFile(path.join(slugDir, "blocks.json"), "{}");
      await fs.writeFile(path.join(slugDir, "exported.html"), "x");
      for (let day = 1; day <= 7; day++) {
        const run = path.join(slugDir, `2026-11-0${day}_10-00-00`);
        await fs.mkdir(path.join(run, "cards"), { recursive: true });
        await fs.writeFile(path.join(run, "cards", "1024-a.png"), "x");
      }
      const run = await startRun(slugDir, when);
      assert.deepEqual([run.name, run.directory], ["2026-11-11_14-02-33", path.join(slugDir, "2026-11-11_14-02-33")]);
      assert.deepEqual((await fs.readdir(slugDir)).filter((name) => !name.startsWith("2026")).sort(), ["blocks.json", "exported.html"], "the loose folders and pictures are taken away; the baseline stays");
      assert.equal((await startRun(slugDir, when)).name, "2026-11-11_14-02-33-2", "a second run in the same second");
      await fs.rm(path.join(slugDir, "2026-11-11_14-02-33-2"), { recursive: true });
      // A run that took no picture: its folders (empty) and itself taken away, and it counts for none (the seven there were are cut to the five).
      await fs.mkdir(path.join(run.directory, "flagged"));
      assert.deepEqual(await endRun(slugDir, run.directory), ["2026-11-02_10-00-00", "2026-11-01_10-00-00"], "an empty run is gone and counts for none: the two oldest of the seven");
      assert.equal(await fs.access(run.directory).then(() => true, () => false), false);
      assert.equal((await fs.readdir(slugDir)).filter((name) => name.startsWith("2026")).length, 5, "the five newest, none displaced by the empty run");
      // One that took pictures: kept, the empty folder beside the pictures gone, the oldest runs past five taken away.
      const taking = await startRun(slugDir, new Date(2026, 10, 12, 9, 0, 0));
      await fs.mkdir(path.join(taking.directory, "changed"));
      await fs.mkdir(path.join(taking.directory, "flagged"));
      await fs.writeFile(path.join(taking.directory, "changed", "1024-a.png"), "x");
      assert.deepEqual(await endRun(slugDir, taking.directory), ["2026-11-03_10-00-00"], "the oldest of the six");
      assert.deepEqual((await fs.readdir(taking.directory)).sort(), ["changed"], "the folder that took none is gone");
      assert.deepEqual((await fs.readdir(slugDir)).filter((name) => name.startsWith("2026")).sort(), ["2026-11-04_10-00-00", "2026-11-05_10-00-00", "2026-11-06_10-00-00", "2026-11-07_10-00-00", "2026-11-12_09-00-00"], "the newest five");
    } finally {
      await fs.rm(slugDir, { recursive: true, force: true });
    }
  }
  assert.equal(blocksToPicture(blocksOf("<main><p>没有身份</p></main>"), null).tiles, true, "a report without block ids is pictured whole");
  const tiled = blocksToPicture(changed, before, null, { tiles: true });
  assert.deepEqual([tiled.ids, tiled.why, tiled.tiles], [[], null, true], "a run of tiles alone pictures no block");

  // A block moved: among its parent's blocks (the fewest whose moving explains the new order), or
  // into another block; counted as changed, pictured with the block before it and the block after it.
  const swap = (text, a, b) => text.replace(a, "\u0000").replace(b, a).replace("\u0000", b);
  const paragraph = `<p data-block-id="p1">一段  话</p>`;
  const list = `<ul data-block-id="u1"><li data-block-id="l1">一</li></ul>`;
  const down = blocksOf(html.replace(`${paragraph}\n`, "").replace(list, `${list}\n${paragraph}`));
  assert.deepEqual([...movedBlocks(down, before)], ["p1"], "a paragraph moved down past four blocks: it moved, not they");
  const movedDown = blocksToPicture(down, before);
  assert.deepEqual([movedDown.ids, [...movedDown.moved], movedDown.around.get("p1")], [["p1"], ["p1"], ["u1", "k1"]], "pictured between the blocks now before and after it");
  assert.match(movedDown.why, /a moved block pictured with the edges of the blocks before and after it/);
  assert.deepEqual([...movedBlocks(blocksOf(swap(html, paragraph, `<h2 data-block-id="h1">一节</h2>`)), before)].length, 1, "two blocks swapped: one moved");
  const wrapped = blocksOf(html.replace(paragraph, `<div class="doc-columns" data-block-id="c1"><div class="doc-column" data-block-id="c2">${paragraph}</div></div>`));
  assert.deepEqual([...movedBlocks(wrapped, before)], ["p1"], "into a column: moved (the columns are new)");
  // The new columns' picture shows the column and the paragraph moved into it: no picture of their own.
  const intoNew = blocksToPicture(wrapped, before);
  assert.deepEqual([intoNew.ids, [...intoNew.held]], [["c1"], [["c1", ["c2", "p1"]]]]);
  assert.deepEqual(nextBaseline(wrapped, before, intoNew), look(wrapped), "pictured in it: looked at, moved no longer");
  // A new flowchart (a card) with its new nodes and paragraphs: the flowchart alone; a block changed
  // in a card not changed itself is pictured on its own.
  const flow = (title) => blocksOf(`<main class="doc-page"><p data-block-id="p0">话</p><ol class="doc-flow" data-block-id="fl"><li data-block-id="n1"><p data-block-id="t1">${title}</p></li></ol></main>`);
  const flowBefore = look(blocksOf(`<main class="doc-page"><p data-block-id="p0">话</p></main>`));
  assert.deepEqual([blocksToPicture(flow("一步"), flowBefore).ids, [...blocksToPicture(flow("一步"), flowBefore).held]], [["fl"], [["fl", ["n1", "t1"]]]]);
  assert.deepEqual(blocksToPicture(flow("改过的一步"), look(flow("一步"))).ids, ["t1"]);
  // A block (not a card) most of whose blocks changed, three at least and half of those in it or
  // more: pictured once, whole, with the changed blocks it holds, though its own words are as they
  // were (found testing the skill with Agents, 2026-10-29: a summary rewritten took 8 of the 12 pictures, an item
  // each, and left a changed disclosure and every card unpictured); fewer, or under half: each on
  // its own, as before. A --blocks run says it the same as left.
  const summary = (items, rest = "<p data-block-id=\"x1\">别的</p>") => blocksOf(`<main class="doc-page"><section class="doc-summary" data-block-id="sm"><p data-block-id="q1">问题</p><ul data-block-id="ul">${items.map((item, at) => `<li data-block-id="i${at}">${item}</li>`).join("")}</ul></section>${rest}<figure class="doc-figure" data-block-id="fg"></figure></main>`);
  const summaryBefore = { ...look(summary(["一", "二", "三", "四"])), unseen: ["fg"] }; // its card never pictured yet
  const rewritten = blocksToPicture(summary(["一改", "二改", "三改", "四"]), summaryBefore);
  assert.deepEqual([rewritten.groups[0].ids, rewritten.held.get("sm")], [["sm"], ["i0", "i1", "i2"]], "three of the six blocks in it changed: the summary whole (its list, three of four, in it)");
  assert.deepEqual(rewritten.ids, ["sm", "fg"], "the card no look pictured yet has room");
  assert.deepEqual(blocksToPicture(summary(["一改", "二改", "三", "四"]), summaryBefore).ids, ["i0", "i1", "fg"], "two: each on its own");
  const manyHeld = summary(["一", "二", "三", "四", "五", "六", "七", "八"]);
  assert.deepEqual(blocksToPicture(summary(["一改", "二改", "三改", "四", "五", "六", "七", "八"]), { ...look(manyHeld), unseen: ["fg"] }).ids, ["i0", "i1", "i2", "fg"], "three of ten: under half, each on its own");
  assert.deepEqual(blocksToPicture(summary(["一改", "二改", "三改", "四"]), summaryBefore, ["fg"]).left.changed, ["sm"], "--blocks: the summary left, as a plain run pictures it");
  assert.deepEqual(movedBlocks(blocks, { ...before, places: {} }).size, 0, "a file of an earlier version, with no places, has no move to tell");
  assert.deepEqual(blocksToPicture(down, null).moved.size, 0, "nothing to compare with: nothing moved");
  // Two blocks swapped: the smaller moved, the larger kept its place, whichever of them comes first
  // (a section swapped with a paragraph is the paragraph moved, pictured with the section's edge).
  const pair = (...parts) => blocksOf(`<main class="doc-page">${parts.join("")}</main>`);
  const large = `<section class="doc-section" data-block-id="large"><h2 data-block-id="lh">大的一节</h2><p data-block-id="lp">${"很长的一段话。".repeat(60)}</p></section>`;
  const small = `<p data-block-id="small">短的一段</p>`;
  assert.deepEqual([...movedBlocks(pair(small, large), look(pair(large, small)))], ["small"], "the smaller moved up");
  assert.deepEqual([...movedBlocks(pair(large, small), look(pair(small, large)))], ["small"], "the smaller moved down");
  assert.ok(pair(large, small).get("large").size > pair(large, small).get("small").size * 10, "a block's size is its markup's, what it holds with it");

  // A chart drawn from a table changes with its table (its card's own markup does not).
  const charted = `<main class="doc-page"><p data-block-id="p1">话</p><figure class="doc-figure" data-block-id="f1"><h3>表格画的图</h3><div data-doc-chart="dots" data-doc-chart-data="t1"></div></figure>
<div class="doc-table-wrap" data-doc-chart-source="t1" data-block-id="t1"><table class="doc-table"><tr><th>组</th><th>值</th></tr><tr><td>甲</td><td>15</td></tr></table></div>
<figure class="doc-figure" data-block-id="f2"><div data-doc-chart="dots" data-doc-chart-data="t9"></div></figure></main>`;
  const chartLook = look(blocksOf(charted));
  assert.deepEqual(blocksToPicture(blocksOf(charted.replace("<td>15</td>", "<td>95</td>")), chartLook).ids, ["f1", "t1"], "a table's cell changed: its chart's card too");
  assert.deepEqual(blocksToPicture(blocksOf(charted.replace("<h3>表格画的图</h3>", "<h3>改过的图</h3>")), chartLook).ids, ["f1"], "the card's own title: the card alone");

  // What is kept for the next run: blocks.json read whatever it holds (cut short, null, not this
  // command's: nothing to compare with; an earlier version's, hashes alone: no places).
  assert.deepEqual(readBaseline('{"blocks":{"p1":"aa","f1":"bb","x":3}}\n'), { blocks: { p1: "aa", f1: "bb" }, places: {}, moved: [], unseen: [] });
  assert.deepEqual(readBaseline('{"blocks":{"p1":"aa"},"places":{"p1":["s1",2],"q":[null,0],"bad":["s1"],"worse":[1,2]},"moved":["p1",3,null,"q"],"unseen":["f1",2]}'), { blocks: { p1: "aa" }, places: { p1: ["s1", 2], q: [null, 0] }, moved: ["p1", "q"], unseen: ["f1"] });
  assert.deepEqual(readBaseline('{"blocks":{},"moved":"p1"}').moved, [], "moved ids are a list");
  assert.deepEqual(['{"blocks":{},"from":"export","time":5}', '{"blocks":{},"from":"preview","time":"x"}', '{"blocks":{},"from":"qa","time":5}'].map((text) => [readBaseline(text).from, readBaseline(text).time]), [["export", 5], ["preview", null], [undefined, undefined]], "who wrote it, of the tools that write one before a round of changes");
  assert.deepEqual(['{"export":"abc","blocks":{"x":', "null", "[]", '{"blocks":[1]}', '{"blocks":null}', "", null].map(readBaseline), Array(7).fill(null));
  assert.deepEqual(readBaseline(JSON.stringify(before)), before, "what a run writes reads back as it was");
  assert.deepEqual(nextBaseline(blocks, null, blocksToPicture(blocks, null)), before, "a first look takes every block as it is");
  assert.deepEqual(nextBaseline(blocks, null, blocksToPicture(blocks, null, null, { tiles: true })), before, "a first look in tiles too");
  assert.equal(nextBaseline(blocks, null, blocksToPicture(blocks, null, ["t1"]), { named: ["t1"] }), null, "a first look at blocks named keeps nothing");
  // A paragraph edited, then a look at another block named, or a run of tiles: the paragraph is
  // still changed after it.
  const edited = blocksOf(html.replace("一段  话", "一段 新的 话"));
  const afterNamed = nextBaseline(edited, before, blocksToPicture(edited, before, ["t1"]), { named: ["t1"] });
  assert.equal(afterNamed.blocks.p1, before.blocks.p1, "the paragraph not pictured keeps its last look");
  assert.deepEqual(blocksToPicture(edited, afterNamed).ids, ["p1"], "so the next run pictures it");
  assert.deepEqual(blocksToPicture(edited, nextBaseline(edited, before, blocksToPicture(edited, before, null, { tiles: true }))).ids, ["p1"], "after tiles too");
  assert.deepEqual(nextBaseline(edited, afterNamed, blocksToPicture(edited, afterNamed)), look(edited), "pictured, it is looked at");
  assert.equal(nextBaseline(edited, before, blocksToPicture(edited, before), { verified: false }), null, "a look not verified keeps what was kept");
  // A look that found a failure keeps what was kept: the run after the fix pictures the block
  // changed before it again, with the fix, not the fix alone.
  assert.equal(nextBaseline(edited, before, blocksToPicture(edited, before), { failed: true }), null);
  assert.equal(nextBaseline(edited, null, blocksToPicture(edited, null), { failed: true }), null, "a first look that failed writes none");
  const fixed = blocksOf(html.replace("一段  话", "一段 新的 话").replace("<code>x</code>", "<code>z</code>"));
  assert.deepEqual(blocksToPicture(fixed, before).ids, ["k1", "p1"]);
  // A block moved and not pictured (a run of other blocks named) is still moved at the next run, and
  // pictured, it is looked at where it is now.
  const afterMove = nextBaseline(down, before, blocksToPicture(down, before, ["t1"]), { named: ["t1"] });
  assert.deepEqual([...movedBlocks(down, afterMove)], ["p1"], "still moved");
  assert.deepEqual(movedBlocks(down, nextBaseline(down, afterMove, blocksToPicture(down, afterMove))).size, 0, "pictured: no longer moved");
  const intoColumn = nextBaseline(wrapped, before, blocksToPicture(wrapped, before, ["t1"]), { named: ["t1"] });
  assert.deepEqual([...movedBlocks(wrapped, intoColumn)], ["p1"], "into a column and not pictured: still moved");
  assert.deepEqual([intoColumn.places.p1, intoColumn.moved], [["c2", 0], ["p1"]], "kept where it is now, as moved and not pictured");
  // More blocks moved than a run pictures (twenty paragraphs reversed): those pictured are looked at
  // where they are now, the rest pictured at the next run, or at the run --blocks names them in, as
  // the line under the blocks says; then nothing has moved (each run as blocks.json keeps it).
  const ids = Array.from({ length: 20 }, (_, at) => `q${String(at).padStart(2, "0")}`);
  const twenty = (order) => blocksOf(`<main class="doc-page"><section class="doc-section" data-block-id="s"><h2 data-block-id="h">一节</h2>${order.map((id) => `<p data-block-id="${id}">段落 ${id}</p>`).join("")}</section></main>`);
  const kept = (value) => readBaseline(JSON.stringify(value));
  const start = kept(nextBaseline(twenty(ids), null, blocksToPicture(twenty(ids), null)));
  const reversed = twenty([...ids].reverse());
  const runOne = blocksToPicture(reversed, start);
  assert.deepEqual([movedBlocks(reversed, start).size, runOne.ids.length, runOne.rest.length], [19, 12, 7]);
  const afterOne = kept(nextBaseline(reversed, start, runOne));
  assert.deepEqual([...afterOne.moved].sort(), [...runOne.rest].sort(), "the moved blocks not pictured, kept as moved");
  const runTwo = blocksToPicture(reversed, afterOne);
  assert.deepEqual([[...runTwo.ids].sort(), runTwo.rest, runTwo.moved.size], [[...runOne.rest].sort(), [], 7], "the next run pictures the rest, as moved");
  const afterTwo = kept(nextBaseline(reversed, afterOne, runTwo));
  assert.deepEqual([movedBlocks(reversed, afterTwo).size, afterTwo.moved], [0, []]);
  assert.match(blocksToPicture(reversed, afterTwo).why, /no block changed since the last look/, "then nothing has moved");
  const namedRest = blocksToPicture(reversed, afterOne, runOne.rest);
  const afterNamedRest = kept(nextBaseline(reversed, afterOne, namedRest, { named: runOne.rest }));
  assert.match(blocksToPicture(reversed, afterNamedRest).why, /no block changed since the last look/, "nor after --blocks named the rest");
  const tiledRun = kept(nextBaseline(reversed, start, blocksToPicture(reversed, start, null, { tiles: true })));
  assert.equal(blocksToPicture(reversed, tiledRun).ids.length, 12, "a run of tiles alone pictures none of them: all still moved");
  // A moved block taken out before it was pictured is moved no longer.
  assert.deepEqual(movedBlocks(twenty([...ids].reverse().filter((id) => !runOne.rest.includes(id))), afterOne).size, 0, "the moved ones gone");
  // Past twelve changed, those not pictured stay changed; a block gone is no longer kept.
  const manyLook = look(many);
  manyLook.blocks = Object.fromEntries(Object.keys(manyLook.blocks).map((id) => [id, "old"]));
  const manyAfter = nextBaseline(many, { blocks: { ...manyLook.blocks, gone: "x" }, places: manyLook.places }, blocksToPicture(many, manyLook));
  assert.deepEqual([Object.values(manyAfter.blocks).filter((hash) => hash === "old").length, "gone" in manyAfter.blocks], [3, false]);
  assert.deepEqual(blocksToPicture(many, manyAfter).ids, ["c12", "c13", "c14"]);
  // A first look takes the cards it did not picture as unseen, not as looked at: the runs after
  // picture them after what changed, or first when nothing did, until one has.
  const firstOfMany = nextBaseline(many, null, blocksToPicture(many, null));
  assert.deepEqual([Object.keys(firstOfMany.blocks).length, firstOfMany.unseen], [15, ["c12", "c13", "c14"]]);
  const unchangedRun = blocksToPicture(many, firstOfMany);
  assert.deepEqual([unchangedRun.ids.slice(0, 4), unchangedRun.ids.length, unchangedRun.rest], [["c12", "c13", "c14", "c0"], 12, ["c9", "c10", "c11"]]);
  assert.match(unchangedRun.why, /^the cards .*, those no look has pictured yet first: no block changed since the last look$/);
  assert.deepEqual(nextBaseline(many, firstOfMany, unchangedRun).unseen, [], "pictured: seen");
  const manyEdited = blocksOf(`<main class="doc-page">${Array.from({ length: 15 }, (_, at) => `<figure data-block-id="c${at}">${at === 3 ? "改过" : ""}</figure>`).join("")}</main>`);
  const editedRun = blocksToPicture(manyEdited, firstOfMany);
  assert.deepEqual([editedRun.ids, editedRun.groups.map(({ kind, ids }) => [kind, ids])], [["c3", "c12", "c13", "c14"], [["changed", ["c3"]], ["cards", ["c12", "c13", "c14"]]]]);
  assert.equal(editedRun.why, "the blocks changed since the last look");
  assert.deepEqual(nextBaseline(manyEdited, firstOfMany, blocksToPicture(manyEdited, firstOfMany, ["c3"]), { named: ["c3"] }).unseen, ["c12", "c13", "c14"], "a run of others named keeps them unseen");
  assert.deepEqual(nextBaseline(manyEdited, firstOfMany, editedRun, { failed: true }), null);

  // A card in another card is folded into its picture, at a first look too (twelve places went
  // to the tables of a Sheet area and the pictures of columns already pictured whole): the tables of
  // a Sheet area and a chart in columns are no picture of their own, so the whole block, the
  // flowchart and the code block after twenty tables all come before the tables.
  const nestedHtml = () => `<main class="doc-page"><section class="doc-section" data-block-id="s"><h2 data-block-id="h">一节</h2>
${Array.from({ length: 20 }, (_, at) => `<div class="doc-table-wrap" data-block-id="t${at}"><table class="doc-table"><tr><td>${at}</td></tr></table></div>`).join("")}
<section class="doc-sheet-shell" data-doc-sheets="x" data-block-id="sh"><div data-doc-sheet="a"><div class="doc-table-wrap" data-block-id="st1"><table class="doc-table"><tr><td>甲</td></tr></table></div></div><div data-doc-sheet="b"><div class="doc-table-wrap" data-block-id="st2"><table class="doc-table"><tr><td>乙</td></tr></table></div></div></section>
<div class="doc-columns" data-block-id="co"><div class="doc-column" data-block-id="cc"><figure class="doc-figure" data-block-id="cf"><h3>图</h3></figure></div></div>
<div class="layers" data-block-id="wb"><p>层</p></div><ol class="doc-flow" data-block-id="fl"><li data-block-id="fn"><p>一步</p></li></ol>
<div class="doc-code" data-block-id="cd"><pre><code>x</code></pre></div></section></main>`;
  const nested = blocksOf(nestedHtml());
  const nestedFirst = blocksToPicture(nested, null);
  assert.deepEqual(nestedFirst.ids, ["sh", "wb", "fl", "cd", "co", "t0", "t1", "t2", "t3", "t4", "t5", "t6"], "what the Agent drew first, then the columns, then the tables");
  assert.deepEqual([...nestedFirst.held], [["sh", ["st1", "st2"]], ["co", ["cf"]]], "the Sheet area's tables and the columns' chart held");
  assert.deepEqual([nestedFirst.groups[0].rest.length, nestedFirst.cards.length], [13, 28], "the rest are tables; every card meant, held ones too");
  // What the looks really pictured: a block held whose holder's pictures did not show it (the
  // middle of a tall section moved) is not seen, though a picture at another width showed it (found
  // testing the skill with Agents, 2026-10-30: a section's changed blocks pictured at 1024 and 736px, in none at
  // 360px); one shown by a Sheet panel's picture, or in none (hidden from readers), is.
  const nestedLooks = [{ width: 360, held: { covered: ["st1"], missed: ["st2", "cf"] } }, { width: 1024, held: { covered: ["cf"], missed: [] } }];
  assert.deepEqual([...missedWidths(nestedLooks)], [["st2", ["360"]], ["cf", ["360"]]], "each block missed with the widths where");
  assert.deepEqual([...missedWidths([{ label: "1024×768", held: { covered: ["a"], missed: ["a", "b"] } }])], [["b", ["1024×768"]]], "a look's own picture of it counts; its label names it");
  const lookedAt = seenOf(nestedFirst, nestedLooks);
  assert.deepEqual([lookedAt.has("sh"), lookedAt.has("st1"), lookedAt.has("st2"), lookedAt.has("cf"), lookedAt.has("t7")], [true, true, false, false, false]);
  const afterNested = nextBaseline(nested, null, nestedFirst, { seen: lookedAt, page: "p1" });
  assert.deepEqual([afterNested.unseen, afterNested.page], [["t7", "t8", "t9", "t10", "t11", "t12", "t13", "t14", "t15", "t16", "t17", "t18", "t19", "st2", "cf"], "p1"], "the cards not pictured unseen, those held that a width's pictures did not show among them; the script and style as they are");
  // After a revision: a changed table in a Sheet area not changed is among the blocks changed (not
  // held by the area, which is no changed card), and the area, unseen, among the cards; an unseen
  // card that a changed card holds is held by it. A moved block comes first, before the blocks
  // changed earlier in the file (the section the user asked to move fell past the twelve).
  const nestLook = look(nested);
  const inSheet = blocksOf(nestedHtml().replace("<td>乙</td>", "<td>丙</td>"));
  const sheetRun = blocksToPicture(inSheet, { ...nestLook, unseen: ["sh"] });
  assert.deepEqual(sheetRun.groups.map(({ kind, ids }) => [kind, ids]), [["changed", ["st2"]], ["cards", ["sh"]]]);
  assert.deepEqual([...sheetRun.held], [], "the table changed is pictured on its own, as the Sheet panel that holds it shows it");
  const columnsNew = blocksToPicture(blocksOf(nestedHtml().replace("<h3>图</h3>", "<h3>新图</h3>").replace('class="doc-column" data-block-id="cc">', 'class="doc-column" data-block-id="cc"><p data-block-id="np">新的</p>')), { ...nestLook, unseen: ["cf"] });
  assert.deepEqual([columnsNew.groups.map(({ kind, ids }) => [kind, ids]), [...columnsNew.held]], [[["changed", ["cf", "np"]]], []], "a changed chart and paragraph in columns not changed: their own pictures");
  const twelve = Array.from({ length: 13 }, (_, at) => `<p data-block-id="w${at}">段${at}</p>`).join("");
  const movedLast = (order) => blocksOf(`<main class="doc-page">${order.join("")}</main>`);
  const sectionMoved = `<section class="doc-section" data-block-id="mv"><h2 data-block-id="mh">挪动的节</h2><p data-block-id="mp">节里的话</p><div class="doc-table-wrap" data-block-id="mt"><table class="doc-table"><tr><td>1</td></tr></table></div></section>`;
  const beforeMove = look(movedLast([sectionMoved, twelve]));
  const afterMoveRun = blocksToPicture(movedLast([twelve.replace(/段/g, "改过的段"), sectionMoved.replace("节里的话", "节里改过的话")]), beforeMove);
  assert.deepEqual([afterMoveRun.ids[0], [...afterMoveRun.held]], ["mv", [["mv", ["mp"]]]], "the section moved first, the paragraph changed in it held by it");
  assert.equal(afterMoveRun.ids.length, 12);
  // The blocks named hold all they hold: a Sheet area named is pictured with each of its panels.
  assert.deepEqual([...blocksToPicture(nested, nestLook, ["sh"]).held], [["sh", ["st1", "st2"]]]);

  // The report's own script or style changed with no block ("no block changed" over a list of
  // cards read as a contradiction): every card, said so, and those past the twelve kept unseen; a run
  // of the blocks named keeps the script and style it was compared with.
  const scripted = (code) => `<main class="doc-page"><figure class="doc-figure" data-block-id="f1"><h3>图</h3><div data-doc-chart="own"></div></figure><p data-block-id="p1">话</p></main><script>DocCharts.define("own", () => { ${code} });</script>`;
  assert.equal(pageOf(scripted("a()")), pageOf(scripted("a()").replace("<p", "\n<p")), "blocks are none of it");
  assert.notEqual(pageOf(scripted("a()")), pageOf(scripted("b()")));
  assert.equal(pageOf("<main><p data-block-id=\"p\">话</p><template><script>x()</script></template></main>"), "", "none, nor a template's");
  const scriptLook = { ...look(blocksOf(scripted("a()"))), page: pageOf(scripted("a()")) };
  const scriptRun = blocksToPicture(blocksOf(scripted("b()")), scriptLook, null, { page: pageOf(scripted("b()")) });
  assert.deepEqual([scriptRun.ids, scriptRun.pageChanged, scriptRun.groups[0].kind], [["f1"], true, "cards"]);
  assert.equal(scriptRun.why, `${cards.replace("the cards", "the cards, not changed themselves")}: the document's own <script> or <style> changed since the last look, which may draw any of them`);
  assert.equal(nextBaseline(blocksOf(scripted("b()")), scriptLook, scriptRun, { page: pageOf(scripted("b()")) }).page, pageOf(scripted("b()")));
  assert.equal(nextBaseline(blocksOf(scripted("b()")), scriptLook, blocksToPicture(blocksOf(scripted("b()")), scriptLook, ["p1"]), { named: ["p1"], page: pageOf(scripted("b()")) }).page, scriptLook.page);
  // A run of the blocks named says what it did not picture that a plain run would, before its
  // verdict (found testing the skill with Agents, 2026-10-28: a run of named tables after a fix never pictured the
  // chart the fix redrew, and said nothing): the cards the changed script may draw again, outside
  // those named, and the blocks changed or moved outside them, each the outermost; nothing when it
  // named them, or when nothing changed.
  const namedRun = blocksToPicture(blocksOf(scripted("b()")), scriptLook, ["p1"], { page: pageOf(scripted("b()")) });
  assert.deepEqual([namedRun.ids, namedRun.pageChanged, namedRun.left], [["p1"], true, { changed: [], cards: ["f1"], since: "the last look", first: false }]);
  const tagsOf = (found) => new Map([...found].map(([id, { tag }]) => [id, tag]));
  assert.equal(notPicturedLine({ ...namedRun, tags: tagsOf(blocksOf(scripted("b()"))) }, "demo"), "Not pictured by this run, which pictures the blocks named alone: 1 card the change of the document's own <script> or <style> since the last look may draw again (figure.doc-figure f1). gallery qa demo pictures them.");
  assert.equal(blocksToPicture(blocksOf(scripted("b()")), scriptLook, ["f1"], { page: pageOf(scripted("b()")) }).left.cards.length, 0, "the card named: nothing left");
  assert.equal(notPicturedLine(blocksToPicture(blocksOf(scripted("a()")), scriptLook, ["p1"], { page: pageOf(scripted("a()")) })), null, "nothing changed: no line");
  assert.equal(notPicturedLine(scriptRun), null, "a plain run: no line");
  // No earlier look (a review of 2026-10-29: a --blocks run on a document exported and never looked
  // at said nothing of the cards a plain run then pictured): every card outside those named.
  const neverLooked = blocksToPicture(blocksOf(scripted("b()")), null, ["p1"], { page: pageOf(scripted("b()")) });
  assert.deepEqual(neverLooked.left, { changed: [], cards: ["f1"], since: "", first: true });
  assert.equal(notPicturedLine({ ...neverLooked, tags: tagsOf(blocksOf(scripted("b()"))) }, "demo"), "Not pictured by this run, which pictures the blocks named alone: no earlier look: 1 card never pictured (figure.doc-figure f1). gallery qa demo pictures them.");
  assert.deepEqual(blocksToPicture(blocksOf(scripted("b()")), null, ["f1"]).left.cards, [], "the only card named: nothing left");
  const outside = blocksOf(html.replace("一段  话", "改过的一段话").replace("<li data-block-id=\"l1\">一</li>", "<li data-block-id=\"l1\">改过的一</li>"));
  const namedEdited = blocksToPicture(outside, before, ["t1"]);
  assert.deepEqual([namedEdited.left.changed, namedEdited.left.cards], [["p1", "l1"], []], "the changed blocks outside the one named; no card, the script the same");
  assert.equal(notPicturedLine({ ...namedEdited, tags: tagsOf(outside) }, "demo"), "Not pictured by this run, which pictures the blocks named alone: 2 blocks changed or moved since the last look (p p1, li l1). gallery qa demo pictures them.");
  assert.deepEqual(blocksToPicture(outside, before, ["s1"]).left.changed, [], "held by the section named: pictured with it");
  // Each line of a run's output a separate line: the not-pictured line last before the verdict.
  const namedLines = describeLooks([{ width: 1024, findings: [], counts: null, pictures: [] }], sourceIndex(html), { ...namedEdited, tags: tagsOf(outside) }, { slug: "demo" }).lines;
  assert.equal(namedLines.at(-1), notPicturedLine({ ...namedEdited, tags: tagsOf(outside) }, "demo"));
  const sameRun = blocksToPicture(blocksOf(scripted("a()")), scriptLook, null, { page: pageOf(scripted("a()")) });
  assert.equal(sameRun.why, `${cards}: no block changed since the last look, nor the document's own <script> or <style>`);
  const manyScripted = (code) => `<main class="doc-page">${Array.from({ length: 15 }, (_, at) => `<figure data-block-id="c${at}"></figure>`).join("")}</main><style>${code}</style>`;
  const manyStyled = blocksToPicture(many, { ...look(many), page: pageOf(manyScripted("a{}")) }, null, { page: pageOf(manyScripted("b{}")) });
  assert.deepEqual(nextBaseline(many, { ...look(many), page: "x" }, manyStyled, { page: "y" }).unseen, ["c12", "c13", "c14"], "past the twelve: unseen, pictured at the next run");

  // A package changed since the last look (its stamp), its instances' markup as it was (found testing
  // the skill with Agents, 2026-11-05: a board's style changed and nothing of it was pictured): its instances changed
  // blocks, under a heading of their own naming it, into changed/; with a paragraph changed too, both;
  // a baseline that says nothing of packages, or a package it does not know, pictures as before; a run
  // of the blocks named says them among what it left; and what is kept takes the stamp only once every
  // instance of it was pictured.
  const boarded = (words = "话") => blocksOf(`<main class="doc-page"><p data-block-id="p1">${words}</p><div class="board" data-doc-component="local/board" data-block-id="b1"><h3>板</h3></div><div class="board" data-doc-component="local/board" data-block-id="b2"><h3>另一块</h3></div><div class="strip" data-doc-component="local/strip" data-block-id="s1"><h3>条</h3></div></main>`);
  assert.deepEqual([boarded().get("b1").package, boarded().get("p1").package], ["local/board", null]);
  const boardLook = { ...look(boarded()), unseen: [], packages: { "local/board": "aaaa", "local/strip": "cccc" } };
  const restyledRun = blocksToPicture(boarded(), boardLook, null, { packages: { "local/board": "bbbb", "local/strip": "cccc" } });
  assert.deepEqual([restyledRun.ids, restyledRun.groups.map(({ kind, why }) => [kind, why]), [...restyledRun.restyled]], [["b1", "b2"], [["changed", "the instances of a custom block changed since the last look (local/board)"]], [["local/board", ["b1", "b2"]]]], JSON.stringify(restyledRun.groups));
  const withWords = blocksToPicture(boarded("改过的话"), boardLook, null, { packages: { "local/board": "bbbb", "local/strip": "cccc" } });
  assert.deepEqual(withWords.groups.filter(({ kind }) => kind === "changed").map(({ why, ids }) => [why, ids]), [["the blocks changed since the last look", ["p1"]], ["the instances of a custom block changed since the last look (local/board)", ["b1", "b2"]]], "a paragraph changed besides: both into changed/");
  assert.deepEqual(blocksToPicture(boarded(), look(boarded()), null, { packages: { "local/board": "bbbb" } }).ids, ["b1", "b2", "s1"], "a baseline with no packages: as it pictured before, every card");
  assert.deepEqual(blocksToPicture(boarded(), { ...boardLook, packages: { "local/strip": "cccc" } }, null, { packages: { "local/board": "bbbb", "local/strip": "cccc" } }).ids, ["b1", "b2", "s1"], "a package the baseline does not know: as it was");
  assert.deepEqual(readBaseline(JSON.stringify({ blocks: {}, packages: { "local/board": "aaaa", "local/x": 3 } })).packages, { "local/board": "aaaa" }, "blocks.json read whatever it holds");
  assert.equal(readBaseline(JSON.stringify({ blocks: {} })).packages, undefined);
  const restyledNamed = blocksToPicture(boarded(), boardLook, ["p1"], { packages: { "local/board": "bbbb", "local/strip": "cccc" } });
  assert.deepEqual([restyledNamed.left.changed, restyledNamed.left.restyled, restyledNamed.left.packages], [[], ["b1", "b2"], ["local/board"]]);
  assert.equal(notPicturedLine({ ...restyledNamed, tags: tagsOf(boarded()) }, "demo"), "Not pictured by this run, which pictures the blocks named alone: 2 instances of a custom block changed since the last look, local/board (div.board b1, div.board b2). gallery qa demo pictures them.");
  assert.deepEqual(nextBaseline(boarded(), boardLook, restyledRun, { packages: { "local/board": "bbbb", "local/strip": "cccc" } }).packages, { "local/board": "bbbb", "local/strip": "cccc" }, "pictured: taken as it is now");
  assert.deepEqual(nextBaseline(boarded(), boardLook, restyledRun, { seen: new Set(["b1"]), packages: { "local/board": "bbbb", "local/strip": "cccc" } }).packages, { "local/board": "aaaa", "local/strip": "cccc" }, "an instance of it not pictured: the stamp it was compared with");
  assert.deepEqual(nextBaseline(boarded(), boardLook, restyledNamed, { named: ["p1"], packages: { "local/board": "bbbb", "local/strip": "cccc" } }).packages, boardLook.packages, "a run of the blocks named keeps the packages it was compared with");

  // Where a moved block is pictured (page pixels): with the last NEIGHBOUR_EDGE px of the block before
  // it and the first of the block after it, however tall they are; a block taller than MOVED_WHOLE
  // as its two joins, its first and its last MOVED_PART px each with its neighbour's edge.
  const box = (top, bottom, left = 16, right = 728) => ({ left, right, top, bottom });
  assert.deepEqual(movedClips({ block: box(5000, 5300), above: box(1000, 5000), below: box(5300, 9000) }), [{ part: "", clip: { x: 16, y: 5000 - NEIGHBOUR_EDGE, width: 712, height: 300 + 2 * NEIGHBOUR_EDGE } }], "a short block between two tall ones");
  assert.deepEqual(movedClips({ block: box(100, 300), above: box(40, 90), below: null }), [{ part: "", clip: { x: 16, y: 40, width: 712, height: 260 } }], "a short neighbour whole, none after");
  assert.deepEqual(movedClips({ block: box(0, 300, 380, 728), above: box(0, 900, 16, 360), below: null }), [{ part: "", clip: { x: 16, y: 0, width: 712, height: 300 } }], "a column beside it: the part of it level with the block");
  const tall = movedClips({ block: box(2000, 2000 + MOVED_WHOLE + 1), above: box(0, 2000), below: box(2000 + MOVED_WHOLE + 1, 9000) });
  assert.deepEqual(tall.map(({ part, clip }) => [part, clip.y, clip.height]), [
    ["top", 2000 - NEIGHBOUR_EDGE, NEIGHBOUR_EDGE + MOVED_PART], ["bottom", 2000 + MOVED_WHOLE + 1 - MOVED_PART, MOVED_PART + NEIGHBOUR_EDGE],
  ], "a tall block: its two joins");
  assert.deepEqual(movedClips({ block: box(10, 20) }).map(({ clip }) => clip.height), [10], "alone");
}

// ---------- the columns each cell ends in, as the kit's slots tile them ----------
{
  const tables = [
    "<tr><th>a</th><th>b</th><th>c</th></tr><tr><td>1</td><td>2</td><td>3</td></tr>",
    "<tr><th rowspan=\"2\">a</th><th colspan=\"2\">b</th></tr><tr><th>b1</th><th>b2</th></tr><tr><td>1</td><td>2</td><td>3</td></tr>",
    "<tr><td rowspan=\"3\">a</td><td>b</td><td colspan=\"2\">c</td></tr><tr><td colspan=\"2\">d</td><td rowspan=\"2\">e</td></tr><tr><td>f</td><td>g</td></tr>",
    "<tr><td colspan=\"3\">all</td></tr><tr><td>1</td><td rowspan=\"2\" colspan=\"2\">big</td></tr><tr><td>2</td></tr>",
  ];
  const { document } = new JSDOM(`<!doctype html><body>${tables.map((rows) => `<table><tbody>${rows}</tbody></table>`).join("")}</body>`).window;
  for (const table of document.querySelectorAll("table")) {
    const slots = slotsOf([...table.rows]);
    assert.ok(slots, table.outerHTML);
    const { columnOf, columns } = cellColumns(table);
    assert.equal(columns, slots.columns, table.outerHTML);
    for (const [cell, { c, cols }] of slots.places) assert.equal(columnOf.get(cell), c + cols - 1, `${cell.textContent} in ${table.outerHTML}`);
  }
}

// ---------- an address named ----------
{
  const base = "file:///C:/Users/a/studio/exports/report.html";
  assert.equal(urlName("file:///C:/Users/a/studio/exports/missing/local%20pic.png", base), "missing/local pic.png", "a file beside the export by its path from there");
  assert.equal(urlName(`data:image/png;base64,${"A".repeat(100)}`, base), `data:image/png;base64,AAAAAAAA… (122 characters)`);
  assert.equal(urlName("https://example.com/bg.png", base), "https://example.com/bg.png");
  const long = `file:///C:/Users/a/elsewhere/${"deep/".repeat(12)}picture.png`;
  assert.equal(urlName(long, base), `…${long.slice(-59)}`, "a long one by its end, where the file's name is");
  assert.ok(urlName(long, base).endsWith("/picture.png"));
}

// ---------- a finding's place ----------
{
  const html = `<!doctype html>
<html><head><title>t</title></head>
<body>
<main class="doc-page">
  <section class="doc-section">
    <h2>第一节</h2>
    <p data-block-id="p1">有身份的段落</p>
    <p>没有身份的
      一段话（含 code 和中文）</p>
    <figure class="doc-figure">
      <h3>季度 收入</h3>
      <div data-doc-chart="dots"><script type="application/json">[]</script></div>
    </figure>
    <table><thead><tr><th>地区</th><th>收入</th></tr></thead></table>
    <div id="own-widget"><span></span></div>
    <template><p>模板里的段落</p></template>
    <p>重复的一段</p>
    <div>
      <div>套着的字</div></div>
    <p>重复的一段</p>
  </section>
</main>
</body></html>`;
  const index = sourceIndex(html);
  const text = (tag, words) => ({ tag, words: wordsOf(words), text: words });
  assert.equal(placeOf(null, index), "the page");
  assert.equal(placeOf({ blocks: ["p1"], element: "p", tag: "p" }, index), 'doc.html:7 [data-block-id="p1"]', "a block id's line");
  assert.equal(placeOf({ blocks: ["gone"], card: text("h3", "季度收入"), element: "svg", tag: "svg" }, index), 'doc.html:11 card "季度收入"', "a card by its title, its blanks aside");
  assert.equal(placeOf({ header: text("th", "地区"), element: "div.doc-table-wrap", tag: "div" }, index), 'doc.html:14 table "地区"');
  assert.equal(placeOf({ header: text("th", "地区"), table: "各地区收入", element: "div.doc-table-wrap", tag: "div" }, index), 'doc.html:14 table "各地区收入"', "a table by its name (its caption), found by its first header cell");
  assert.equal(placeOf({ blocks: ["p1"], header: text("th", "地区"), table: "各地区收入", element: "td", tag: "td" }, index), 'doc.html:7 [data-block-id="p1"] table "各地区收入"');
  assert.equal(placeOf({ texts: [text("p", "没有身份的 一段话（含 code 和中文）")], element: "p", tag: "p" }, index), 'doc.html:8 <p> "没有身份的 一段话（含 code 和中文）"', "the element by its words, across lines");
  assert.equal(placeOf({ texts: [text("p", "没有身份的一段话（含code和中文）")], element: "img", tag: "img" }, index), 'doc.html:8 img in <p> "没有身份的一段话（含code和中文）"', "what holds the element");
  assert.equal(placeOf({ ids: ["own-widget"], element: "span", tag: "span" }, index), "doc.html:15 #own-widget");
  assert.equal(placeOf({ section: text("h2", "第一节"), element: "span", tag: "span" }, index), 'doc.html:6 span in the section "第一节"');
  assert.equal(placeOf({ texts: [text("p", "模板里的段落")], element: "p", tag: "p" }, index), "p (not found in doc.html)", "a template's content is not the page");
  assert.equal(placeOf({ blocks: ["p1"], card: text("h3", "季度收入"), element: "svg", tag: "svg" }, index), 'doc.html:7 [data-block-id="p1"] card "季度收入"', "a block id first, the card named");
  // Equal elements are as many places, by which of them the page found (nth, in the file's order).
  const nth = (tag, words, at) => ({ texts: [{ ...text(tag, words), nth: at }], element: tag, tag });
  assert.deepEqual([0, 1, 5].map((at) => placeOf(nth("p", "重复的一段", at), index)), ['doc.html:17 <p> "重复的一段"', 'doc.html:20 <p> "重复的一段"', 'doc.html:20 <p> "重复的一段"']);
  assert.deepEqual([0, 1].map((at) => placeOf(nth("div", "套着的字", at), index)), ['doc.html:18 <div> "套着的字"', 'doc.html:19 <div> "套着的字"'], "the outer one first, as the page counts");

  // The text: a line a look (the laptop's window saying only what it added; the disclosures closed in
  // the file and opened for the pictures), a finding seen alike in several looks (or by two elements
  // at one place) said once, and counted once in the levels the command's last line says; info said
  // but what a table that scrolls does (the kit's other notes, a code block scrolling on a phone with
  // its picture, a code title cut), the tables that scroll listed by line and name with their
  // directions, the pictures of this run: the flagged elements', then the blocks' (a moved one with
  // its neighbours), then the tiles' folder.
  const finding = (kind, what, extra = {}) => ({ kind, what, anchor: null, shot: null, state: "", ...extra });
  const card = { blocks: [], card: text("h3", "季度收入"), element: "svg", tag: "svg" };
  const table = { blocks: [], header: text("th", "地区"), table: "各地区收入", element: "div.doc-table-wrap", tag: "div" };
  const code = { blocks: ["p1"], element: "div.doc-code", tag: "div" };
  const picture = (name) => path.join(os.tmpdir(), name);
  const looks = [1024, 360].map((width) => ({
    width,
    counts: { charts: 1, tables: 1, details: 2, closed: 2, sheets: 0, cards: width === 360 ? 1 : 0, cardsOpened: width === 360 ? 1 : 0, height: 900 },
    pictures: [
      { shot: 1, file: picture(`${width}-01-chart-empty.png`) }, { shot: 7, file: picture(`${width}-07-code-scrolls.png`) },
      { block: "p1", file: picture(`${width}-p1.png`) }, { block: "p1", part: "sheet2", file: picture(`${width}-p1-sheet2.png`) }, { tile: true, file: picture(path.join("tiles", `${width}-01.png`)) },
    ],
    held: { covered: ["h1", "h2"], missed: width === 360 ? ["h3", "h2"] : [] },
    findings: [
      finding("chart-empty", "the bar chart drew nothing", { anchor: card, shot: 1 }),
      finding("chart-empty", "the bar chart drew nothing", { anchor: card, shot: 1, state: "" }), // seen again in another state
      finding("chart-empty", "the bar chart drew nothing", { anchor: card, shot: 3 }), // another element at the same place
      finding("table-scrolls", "800px wide in a 336px frame", { anchor: table, shot: 2, scroll: { sideways: true, down: width === 360, name: "各地区收入" } }),
      finding("table-columns", "of 2 columns, 1 out of sight (\"收入\")", { anchor: table, shot: 2 }),
      finding("layout-note", "the kit notes labels-thinned: 2 of 8 category names left out to fit (one in 2 shown)", { anchor: card, shot: 5 }),
      finding("code-scrolls", `the code is ${width === 360 ? 1300 : 860}px tall, its frame 820px: a reader scrolls inside it for the rest`, { anchor: code, shot: 7 }),
      ...(width === 1024 ? [finding("code-scrolls", "the code is 1119px wide, its frame 712px, its lines left unwrapped: a reader scrolls sideways for the rest", { anchor: code, shot: 7, level: "info" })] : []),
      ...(width === 360 ? [finding("code-title-cut", 'its title "src/editor/input/text-input.js" is cut to fit its header (176px of words in 127px)', { anchor: code, shot: 7 })] : []),
    ],
  }));
  looks.splice(1, 0, { width: 1024, label: "1024×768", laptop: true, counts: null, pictures: [], findings: [
    finding("table-rows", "the frame shows 5 of 9 rows: …", { anchor: table, shot: 2 }),
    finding("table-scrolls", "400px tall in a 300px frame", { anchor: table, shot: 2, scroll: { sideways: false, down: true, name: "各地区收入" } }),
  ] });
  const folder = os.tmpdir();
  const groups = [
    { kind: "changed", why: "the blocks changed since the last look", ids: ["p1", "f9"], rest: ["q1", "q2"] },
    { kind: "cards", why: "the cards no look has pictured yet (not changed themselves)", ids: [], rest: ["c7"] },
  ];
  const chosen = { ids: ["p1", "f9"], why: groups[0].why, groups, rest: ["q1", "q2", "c7"], unknown: [], moved: new Set(["p1"]), held: new Map([["p1", ["h1", "h2", "h3"]]]), changed: new Set(["h1", "h2"]), tags: new Map([["p1", "p"], ["c7", "div.doc-table-wrap"]]) };
  const described = describeLooks(looks, index, chosen, { folder, slug: "demo" });
  const { lines, levels } = described;
  assert.deepEqual(levels, { fail: 1, warn: 3, unverified: 0, info: 5 });
  assert.deepEqual(described.looks, [{ label: "1024", fail: 2, warn: 2 }, { label: "1024×768", fail: 0, warn: 1 }, { label: "360", fail: 2, warn: 0 }], "each look's counts, for the verdict");
  // The pictures first (the blocks', a line each; the flagged ones; the tiles), the tables that
  // scroll as information, the findings, then each look's counts (an Agent that read the first
  // lines or the last ones of a long output missed half of it).
  const counts = lines.slice(-3);
  assert.equal(counts[0], "1024px  fail 2 · warn 2 · unverified 0 · 1 table scrolls (→ 1); 1 chart, 1 table, 2 disclosures (closed in the file, opened for the pictures), 0 Sheets shown besides the first, page 900px tall");
  assert.equal(counts[1], "1024×768  fail 0 · warn 1 · unverified 0 · 1 table scrolls (↓ 1); only what the 1024px look did not find");
  assert.ok(counts[2].startsWith(" 360px  fail 2 · warn 0 · unverified 0 · 1 table scrolls (→ 1, ↓ 1);"), counts[2]);
  assert.ok(counts[2].endsWith("0 Sheets shown besides the first, 1 detail card (closed in the file, opened in turn), page 900px tall"), counts[2]);
  // The pictures are named nowhere in the lines (the list at the end names them once): the blocks past
  // the sixty a run pictures are said with the command that pictures them; the tables that scroll as
  // information; the findings, each without its pictures; the counts.
  assert.deepEqual(lines.slice(0, -3), [
    "2 changed blocks past the 60 a run pictures, not pictured (q1, q2): gallery qa demo --blocks q1,q2",
    `INFO       table-scrolls: doc.html:14 "各地区收入": → 1024, 360px; ↓ 1024×768, 360px (${SCROLLS})`,
    'FAIL       chart-empty: doc.html:11 card "季度收入"',
    "           1024, 360px: the bar chart drew nothing",
    'WARN       table-columns: doc.html:14 table "各地区收入"',
    '           1024px: of 2 columns, 1 out of sight ("收入")',
    `           ${ADVICE["table-columns"]}`,
    'WARN       code-scrolls: doc.html:7 [data-block-id="p1"]',
    "           1024px: the code is 860px tall, its frame 820px: a reader scrolls inside it for the rest",
    `           ${ADVICE["code-scrolls"]}`,
    'WARN       table-rows: doc.html:14 table "各地区收入"',
    "           1024×768px: the frame shows 5 of 9 rows: …",
    'INFO       layout-note: doc.html:11 card "季度收入"',
    "           1024, 360px: the kit notes labels-thinned: 2 of 8 category names left out to fit (one in 2 shown)",
    'INFO       code-scrolls: doc.html:7 [data-block-id="p1"]',
    "           1024px: the code is 1119px wide, its frame 712px, its lines left unwrapped: a reader scrolls sideways for the rest",
    "           360px: the code is 1300px tall, its frame 820px: a reader scrolls inside it for the rest",
    // Down and sideways: what to do of each, the height's first (found testing the skill with Agents, 2026-10-28).
    `           ${ADVICE["code-scrolls"]}`,
    `           ${CODE_SIDEWAYS}`,
    'INFO       code-title-cut: doc.html:7 [data-block-id="p1"]',
    '           360px: its title "src/editor/input/text-input.js" is cut to fit its header (176px of words in 127px)',
  ]);
  // The pictures to open, for the list at the end, in sections: each place a FAIL or a WARN names, one
  // picture of it, the narrowest width it was flagged at (INFO needs none), then the tiles asked for; a
  // plain run's pictures of the blocks changed and the cards are kept, not listed (the user's 2026-11-13:
  // a dozen pictures opened for each change), and said under what needs no look.
  const listing = described.pictures;
  assert.deepEqual([listing.slug, listing.folder], ["demo", folder]);
  assert.deepEqual(listing.sections.map(({ title, items }) => [title, items.map(({ count, names, text: words }) => [count, names, words])]), [
    ["The elements flagged in the findings above", [
      [1, ["360-01-chart-empty.png"], 'FAIL chart-empty doc.html:11 card "季度收入"'],
      [1, ["1024-07-code-scrolls.png"], 'WARN code-scrolls doc.html:7 [data-block-id="p1"]'],
    ]],
    ["The page in tiles", [[2, ["tiles/<width>-<n>.png"], "the page as it opens (each Sheet area with the panel it shows first): 2 tiles"]]],
  ]);
  assert.equal(listing.kept, 4, "the changed block's four pictures kept, not listed");
  // The pictures kept, hidden blocks and the INFO notes need no look (found testing the skill with Agents,
  // 2026-10-29: "pictured" over no picture at all).
  assert.deepEqual(listing.unneeded, [
    "这次给 1 个改动的块拍的 4 张图，检查已经看过，标出的问题都在上面，不用打开",
    "一个块在任何宽度都不显示，读者看不到（f9）",
    "另有 1 个没改过的卡片这次没有拍，没有改动也没有警告（div.doc-table-wrap c7）",
    "INFO 的 5 条（它们不是问题，读者会自己滚动表格等）",
  ]);
  // The list: numbered, each picture by its whole path (the run's folder, its looks in braces), the
  // count of pictures in its heading, what needs no look after it, and where they stay and how long.
  const whole = (name) => `${folder.split(path.sep).join("/")}/${name}`;
  assert.deepEqual(checklistSaid([listing]), [
    "要看的图（4 张）：标出问题的地方各一张，文字说不清时再打开",
    "  The elements flagged in the findings above:",
    `    1. ${whole("360-01-chart-empty.png")}  FAIL chart-empty doc.html:11 card "季度收入"`,
    `    2. ${whole("1024-07-code-scrolls.png")}  WARN code-scrolls doc.html:7 [data-block-id="p1"]`,
    "  The page in tiles:",
    `    3. ${whole("tiles/<width>-<n>.png")}  the page as it opens (each Sheet area with the panel it shows first): 2 tiles`,
    `不用看：${listing.unneeded.join("；")}。`,
    `图在 ${folder.split(path.sep).join("/")}/（每次运行一个新文件夹，qa/demo/ 下只留最近 ${RUNS_KEPT} 次，更早的已删）`,
  ]);
  // Two documents: each section under its slug, one numbering, what needs no look joined, each folder said.
  const second = { slug: "other", folder: path.join(folder, "other"), sections: [{ title: "The cards", items: [{ count: 3, names: ["cards/{1024,736,360}-ab.png"], text: "doc.html:3 ab figure.doc-figure" }] }], unneeded: [] };
  const both = checklistSaid([listing, second]);
  assert.equal(both[0], "要看的图（7 张）：标出问题的地方各一张，文字说不清时再打开");
  assert.ok(both.includes("  demo: The elements flagged in the findings above:") && both.includes("  other: The cards:"), both.join("\n"));
  assert.ok(both.includes(`    4. ${path.join(folder, "other").split(path.sep).join("/")}/cards/{1024,736,360}-ab.png  doc.html:3 ab figure.doc-figure`), both.join("\n"));
  assert.ok(both.some((line) => line.startsWith("不用看：demo: 这次给 1 个改动的块拍的 4 张图")), both.join("\n"));
  assert.equal(both.filter((line) => line.startsWith("图在 ")).length, 2);
  // A run that took no picture and has nothing to say of any: no list; pictures none but what needs none: said.
  assert.deepEqual(checklistSaid([{ slug: "demo", folder, sections: [], unneeded: [] }]), []);
  assert.deepEqual(checklistSaid([{ slug: "demo", folder, sections: [], unneeded: ["INFO 的 1 条（它不是问题，读者会自己滚动表格等）"] }]), ["要看的图（0 张）：没有要看的图", "不用看：INFO 的 1 条（它不是问题，读者会自己滚动表格等）。"]);
  // Pictures kept and none to open: nothing to open, and where the kept ones are.
  assert.deepEqual(checklistSaid([{ slug: "demo", folder, sections: [], unneeded: ["这次给 1 个改动的块拍的 3 张图，检查已经看过，标出的问题都在上面，不用打开"], kept: 3 }]), ["要看的图（0 张）：没有要看的图", "不用看：这次给 1 个改动的块拍的 3 张图，检查已经看过，标出的问题都在上面，不用打开。", `图在 ${folder.split(path.sep).join("/")}/（每次运行一个新文件夹，qa/demo/ 下只留最近 ${RUNS_KEPT} 次，更早的已删）`]);
  assert.deepEqual(checklistSaid([listing]).slice(-1)[0].startsWith("图在 "), true);
  assert.deepEqual(checklistSaid([null, undefined]), []);
  // Without the folder, each picture by its whole path.
  const bare = describeLooks(looks, index).pictures;
  assert.equal(bare.sections[0].items[0].names[0], path.join(folder, "360-01-chart-empty.png").split(path.sep).join("/"));
  assert.ok(checklistSaid([bare])[2].includes(`1. ${path.join(folder, "360-01-chart-empty.png").split(path.sep).join("/")}  FAIL chart-empty`));
  // A run of tiles alone says nothing of blocks; the disclosures as the files have them. Each Sheet
  // panel shown in turn is tiled apart and counted apart, by its tab's number and words.
  const sheetTile = (width, n) => ({ tile: true, sheet: { number: 3, label: "第二页" }, file: path.join(folder, "tiles", `${width}-sheet3-0${n}.png`) });
  const tiledLooks = [{ ...looks[0], pictures: [...looks[0].pictures, sheetTile(1024, 1), sheetTile(1024, 2)] }];
  const cardTile = (n) => ({ tile: true, card: { number: 1, label: "敕版" }, file: path.join(folder, "tiles", `1024-card1-0${n}.png`) });
  tiledLooks[0].pictures.push(cardTile(1), cardTile(2));
  const tilesOnly = describeLooks(tiledLooks, index, { ids: [], why: null, rest: [], unknown: [], tiles: true, moved: new Set(), groups: [], tags: new Map() }, { folder });
  assert.ok(!tilesOnly.lines.some((line) => /^The blocks|^ {2}and \d+ blocks? more/.test(line)), tilesOnly.lines.join("\n"));
  assert.deepEqual(tilesOnly.pictures.sections.find(({ title }) => title === "The page in tiles").items.map(({ count, names, text: words }) => [count, names, words]), [
    [1, ["tiles/<width>-<n>.png"], "the page as it opens (each Sheet area with the panel it shows first): 1 tile"],
    [2, ["tiles/<width>-sheet<i>-<n>.png"], 'each other Sheet panel, shown in turn: sheet3 "第二页" 2 tiles'],
    [2, ["tiles/<width>-card<i>-<n>.png"], 'each detail card, opened in turn as the window shows it, its content scrolled a tile at a time: card1 "敕版" 2 tiles'],
  ]);
  // The pictures named by their looks in braces, from the run's folder; others whole.
  assert.deepEqual(picturesSaid([path.join(folder, "changed", "1024-ab.png"), path.join(folder, "changed", "736-ab.png"), path.join(folder, "changed", "360-ab.png"), path.join(folder, "changed", "1024-ab-top.png"), path.join(folder, "flagged", "1024x768-03-table-rows.png"), path.join(folder, "flagged", "1024x768-03-table-rows.png")], folder), [
    "changed/{1024,736,360}-ab.png", "changed/1024-ab-top.png", "flagged/1024x768-03-table-rows.png",
  ]);
  assert.deepEqual(picturesSaid([path.join(path.dirname(folder), "elsewhere.png")], folder), [path.join(path.dirname(folder), "elsewhere.png").split(path.sep).join("/")]);
  // What the summary counts as a chart: a declared one; none inside a developer's frame.
  {
    const had = globalThis.document;
    globalThis.document = new JSDOM('<main><div data-doc-chart="x"></div><div data-doc-dev><div data-doc-chart="y"></div></div><div class="doc-table-wrap"></div></main>').window.document;
    try {
      assert.deepEqual([inventory().charts, inventory().tables], [1, 1]);
    } finally {
      if (had === undefined) delete globalThis.document;
      else globalThis.document = had;
    }
  }
  // Before the verdict, the pictures of a check or a trial in one hint: how many and where, those that show it
  // whole (`first`) named, the looks of a block in braces; none needs opening (the user's 2026-11-13: the
  // commands can show, the workflow asks no look of the Agent); none taken, no line.
  const other = path.join(path.dirname(folder), "other");
  const firstOnes = [path.join(folder, "changed", "1024-ab.png"), path.join(folder, "changed", "360-ab.png")];
  assert.equal(unopenedSaid([{ folder, files: [...firstOnes, path.join(folder, "flagged", "736-01-overflow.png"), path.join(folder, "changed", "1024-ab.png")] }, { folder: other, files: [path.join(other, "cards", "1024-c7.png")] }], { first: firstOnes }), `提示：4 pictures in ${folder.split(path.sep).join("/")}/, ${other.split(path.sep).join("/")}/ (the whole of it: ${folder.split(path.sep).join("/")}/changed/{1024,360}-ab.png): none needs opening; open one when you want to see it`);
  assert.equal(unopenedSaid([{ folder, files: [path.join(folder, "after.png")] }]), `提示：1 picture in ${folder.split(path.sep).join("/")}/: none needs opening; open one when you want to see it`, "a hint, nothing asked");
  assert.ok(!/\/ \S/.test(unopenedSaid([{ folder, files: [path.join(folder, "check", "1280-light.png")] }])), "no space after a folder: each picture is one path to copy");
  assert.equal(unopenedSaid([{ folder, files: [] }]), null);
  assert.equal(unopenedSaid([]), null);
  // The verdict, last, with each look's failures and warnings, and what to do next: fix the file
  // and run qa again, which exports first (it said "export again", a step qa takes itself).
  // No more pictures asked for in any verdict (the user's 2026-11-13), nothing to open when nothing is found.
  assert.equal(verdictOf({ fail: 3, warn: 1, unverified: 0 }, described.looks), `问题：failures at 3 places (1024px fail 2, warn 2; 1024×768 fail 0, warn 1; 360px fail 2, warn 0): fix them in the document's doc.html (report.html in an older document), then run this again (it exports first)`);
  assert.equal(verdictOf({ fail: 0, warn: 2, unverified: 0 }, [{ label: "1024", fail: 0, warn: 2 }]), `下一步：nothing failed (1024px fail 0, warn 2); warnings at 2 places to read, ${WARNED}`);
  assert.equal(verdictOf({ fail: 0, warn: 0, unverified: 0 }, []), "下一步：nothing found: no picture to open; hand the document over");
  // A run that had nothing to picture (no block changed, no card): nothing to open either, no run of tiles asked for.
  const none = verdictOf({ fail: 0, warn: 0, unverified: 0 }, [{ label: "1024", fail: 0, warn: 0 }], [{ slug: "demo", file: "D", first: null }], { unpictured: true });
  assert.ok(none.startsWith("下一步：nothing found (1024px fail 0, warn 0): no picture to open; hand the document over (nothing to picture") && !none.includes("--tiles") && none.endsWith(`\n${HAND_OVER}D`), none);
  assert.match(verdictOf({ fail: 0, warn: 1, unverified: 0 }, [], [], { unpictured: true }), /^下一步：nothing failed; warnings at 1 place/, "what warns says so first");
  // The deliverable's absolute path last, as gallery export prints it (an Agent whose context was
  // cut short wrote a path of its own making), said exported first when this run did; the
  // commands for more pictures with the report's slug.
  const deliverable = path.join(folder, "exports", "demo.html");
  // Each deliverable on a line of its own, after the verdict, as gallery export prints it (on the
  // verdict's line, after its advice, an Agent read the two as one: found testing the skill with Agents, 2026-10-28).
  assert.equal(verdictOf({ fail: 0, warn: 0, unverified: 0 }, [], [{ slug: "demo", file: deliverable, first: "missing" }]), `下一步：nothing found: no picture to open; hand the document over. It was exported first by this run (it had none yet).\n${HAND_OVER}${deliverable}`);
  assert.ok(verdictOf({ fail: 1, warn: 0, unverified: 0 }, [], [{ slug: "demo", file: deliverable, first: null }]).endsWith(`(it exports first)\n${HAND_OVER}${deliverable}`));
  assert.ok(verdictOf({ fail: 0, warn: 0, unverified: 0 }, [], [{ slug: "a", file: "A", first: "stale" }, { slug: "b", file: "B", first: null }]).endsWith(`hand the document over. a was exported first by this run (its file had changed since its export).\n${HAND_OVER}A\n${HAND_OVER}B`));
  // The browser qa looks with (startBrowser): a launch that fails is tried once more, in a fresh
  // profile of its own, each profile removed (a trial install of the skill alone, 2026-10-28: a browser
  // installed did not start once, puppeteer blaming a profile in use); both failing, the error holds
  // each attempt's message, said without puppeteer's advice on the profile.
  {
    const profiles = [];
    let closed = 0;
    const exists = (folder) => fs.access(folder).then(() => true, () => false);
    const flaky = async ({ profile }) => {
      profiles.push(profile);
      assert.ok(await exists(profile), "a profile folder made for each attempt");
      if (profiles.length === 1) throw new Error("The browser is already running for x. Use a different `userDataDir` or stop the running browser first.");
      return { browser: "the browser", stop: async () => void (closed += 1) };
    };
    const started = await startBrowser({ executablePath: "chrome", start: flaky });
    assert.deepEqual([started.browser, profiles.length, new Set(profiles).size, started.failures.length], ["the browser", 2, 2, 1], "tried once more, in another profile");
    assert.equal(await exists(profiles[0]), false, "the failed attempt's profile removed");
    await started.close();
    assert.deepEqual([closed, await exists(profiles[1])], [1, false], "closed, then its profile removed");
    const tries = [];
    const failing = async ({ profile }) => {
      tries.push(profile);
      throw new Error(`no start ${tries.length}. Use a different \`userDataDir\` or stop the running browser first.`);
    };
    const error = await startBrowser({ executablePath: "chrome", start: failing }).then(() => null, (thrown) => thrown);
    assert.deepEqual([tries.length, error?.failures.length, startFailure(error)], [2, 2, "no start 2."], "twice, then the last reason without the advice");
    assert.ok(!(await Promise.all(tries.map(exists))).some(Boolean), "no profile left");
  }
  assert.deepEqual([{ details: 0, closed: 0 }, { details: 1, closed: 1 }, { details: 3, closed: 1 }, { details: 2, closed: 0 }].map(disclosuresSaid), [
    "0 disclosures", "1 disclosure (closed in the file, opened for the pictures)", "3 disclosures (1 closed in the file, opened for the pictures)", "2 disclosures (open in the file)",
  ]);
  // A column out of sight is no failure: what to do when the reader must see it is said once under
  // its lines (an Agent read "keep the columns" as leaving a header it could have shortened),
  // its long values first (found testing the skill with Agents, 2026-10-29: two rounds of shorter headers left the
  // table too wide, its cells of "0.691907 ± 0.001012" setting the column's width).
  assert.equal(ADVICE["table-columns"], "not a failure. If the reader must see the column on a desktop, write its long values compactly (a cell of numbers stays on one line, so its longest value sets the column's width: a range as a–b, fewer digits), move a unit out of its header into the line above the table, shorten the header, or split the table; never delete a column to silence this");
  // The last line says that each warning says what to do: every kind that warns has its advice, but
  // rows below a frame, whose own words say how to show them all.
  assert.match(WARNED, /each says what to do/);
  // A page wider than the window says what to do with words that cannot break; text over text,
  // and text a viewBox scales small, how to give it room, never to drop it.
  assert.equal(ADVICE["labels-hidden"], undefined);
  assert.match(ADVICE["chart-text-overlap"], /shorten the labels.*move one.*more room.*never delete a label/);
  assert.match(ADVICE["svg-text-small"], /^not a failure\. The viewBox scales the drawing's text with it: give the text a larger font-size in the viewBox's units.*never drop the labels to silence this$/);
  assert.match(ADVICE.overflow, /wrap each in <code>.*max-width: 100%.*never cut or rewrite a path/);
  // Code that scrolls says what to do in the Agent's terms, on its <pre>, never by the kit's classes
  // (a doc-code--folded on a plain <pre> does nothing); sideways, of its lines (found testing the skill with Agents, 2026-10-28).
  assert.ok(ADVICE["code-scrolls"].includes('style="--doc-code-height: none" on its <pre>') && !/div\.doc-code|doc-code--folded|folded/.test(ADVICE["code-scrolls"]), ADVICE["code-scrolls"]);
  assert.match(CODE_SIDEWAYS, /^not a failure\. .*let them wrap \(take data-wrap="false" off its <pre>\).*may scroll; never cut a line/);
  const scrolling = (...said) => ({ kind: "code-scrolls", said: new Map(said.map((words) => [words, {}])) });
  assert.deepEqual([
    adviceOf(scrolling("the code is 900px tall, its frame 820px: …")), adviceOf(scrolling("the code is 900px wide, its frame 712px: …")),
    adviceOf(scrolling("the code is 900px wide, its frame 712px: …", "the code is 900px tall, its frame 820px: …")), adviceOf({ kind: "table-rows", said: new Map() }),
  ], [[ADVICE["code-scrolls"]], [CODE_SIDEWAYS], [ADVICE["code-scrolls"], CODE_SIDEWAYS], []]);
  assert.deepEqual(Object.keys(KINDS).filter((kind) => levelOf(kind, 1024) === "warn" && !ADVICE[kind]?.startsWith("not a failure. ")), ["table-rows"]);
}

// ---------- the preview's note: the kit's layout notes that fail, as they come and go ----------
{
  const gallery = newNames(await fs.readFile(path.join(projectRoot, "tests", "fixtures", "component-catalog", "doc.html"), "utf8")); // as the tools read it (its old names new)
  const note = checkPanel("component-catalog", gallery, {}, { directory: path.join(projectRoot, "tests", "fixtures", "component-catalog") });
  const dom = new JSDOM(`<!doctype html><html><body><main><figure class="doc-figure"><h3>各题得分</h3><div data-doc-chart="dots"><svg></svg></div></figure></main>${note}</body></html>`, { runScripts: "dangerously", pretendToBeVisual: true });
  const { document } = dom.window;
  const frame = () => new Promise((resolve) => dom.window.requestAnimationFrame(() => resolve()));
  const panel = document.querySelector("details.doc-checks");
  const chart = document.querySelector("[data-doc-chart]");
  const items = () => [...panel.querySelectorAll(".doc-checks-live li")].map((item) => item.textContent);
  assert.equal(panel.hidden, true, "hidden while there is nothing to say");
  assert.equal(document.querySelectorAll("script").length, 0, "its script took itself out of the page");
  assert.equal(panel.querySelector(".doc-checks-layout"), null, "no list of 排版提示: what is no failure is gallery qa's, for the Agent");
  // Notes that are no failure (labels shortened or left out to fit) show nothing.
  chart.setAttribute("data-doc-layout", "labels-truncated: 1 category name cut to fit\nlabels-thinned: 2 of 8 category names left out to fit (one in 2 shown)");
  await frame();
  await frame();
  assert.equal(panel.hidden, true, "notes that are no failure: nothing shown");
  // What gallery qa fails (a chart that drew nothing) is a failure, as qa reads it (layoutNotesOf),
  // said in Chinese (noteInWords), the kit's words in its tooltip; a note beside it that is no
  // failure is left out.
  chart.setAttribute("data-doc-layout", "data-missing: its table has merged cells: write each value in its own cell, the category on every row\nlabels-truncated: 1 category name cut to fit");
  await frame();
  await frame();
  assert.deepEqual([panel.hidden, panel.querySelector("summary").textContent], [false, "检查未通过 · 1 项"]);
  assert.deepEqual(items(), ["图形「各题得分」：图表没有画出来：从表格里没读到能画的数据"]);
  assert.equal(panel.querySelector(".doc-checks-live li").title, "data-missing: its table has merged cells: write each value in its own cell, the category on every row", "the kit's own words in its tooltip");
  chart.removeAttribute("data-doc-layout");
  await frame();
  await frame();
  assert.equal(panel.hidden, true, "gone with the kit's note");
  // A chart with nothing to draw (a table chart's table gone: data-missing) is a failure, as the full
  // checks say, said by its card's own line of why; a card without a title is named a chart card.
  document.querySelector("h3").remove();
  chart.setAttribute("data-doc-layout", 'data-missing: no table carries data-doc-chart-source="t1": put the table back, or delete the card\ndata-skipped: row 2 has no name in the first column');
  await frame();
  await frame();
  assert.deepEqual([panel.hidden, panel.querySelector("summary").textContent, items()], [false, "检查未通过 · 1 项", ["图形：图表没有画出来：从表格里没读到能画的数据"]], "no line in the card: the note in words");
  chart.removeAttribute("data-doc-layout");
  chart.append(Object.assign(document.createElement("div"), { className: "doc-chart-message", textContent: "这张图的数据表格不在页面上了。" }));
  chart.setAttribute("data-doc-layout", 'data-missing: no table carries data-doc-chart-source="t1": put the table back, or delete the card');
  await frame();
  await frame();
  assert.deepEqual(items(), ["图形：这张图的数据表格不在页面上了。"], "the card's own line of why");
  chart.removeAttribute("data-doc-layout");
  await frame();
  await frame();
  assert.equal(panel.hidden, true, "gone with it");
  // With a failure of the fast checks, a table's columns out of sight add nothing.
  const broken = checkPanel("component-catalog", gallery.replace('data-doc-show="filter:done"', 'data-doc-show="flter:done"'), {}, { directory: path.join(projectRoot, "tests", "fixtures", "component-catalog") });
  const failing = new JSDOM(`<!doctype html><html><body><table><tr><th>地区</th></tr></table>${broken}</body></html>`, { runScripts: "dangerously", pretendToBeVisual: true });
  failing.window.document.querySelector("table").setAttribute("data-doc-layout", "columns-hidden: of 5 columns, 3 out of sight (\"a\", \"b\", \"c\") (scroll sideways)");
  await new Promise((resolve) => failing.window.requestAnimationFrame(() => failing.window.requestAnimationFrame(resolve)));
  assert.equal(failing.window.document.querySelector("details.doc-checks summary").textContent, "检查未通过 · 1 项");
  assert.equal(failing.window.document.querySelector(".doc-checks-live").hidden, true);
  dom.window.close();
  failing.window.close();
}

// ---------- the commands, in a studio of their own ----------
const run = promisify(execFile);
const root = await fs.mkdtemp(path.join(os.tmpdir(), "report-qa-"));
const previousHome = process.env.GALLERY_DEFAULT_WORKSPACE;
process.env.GALLERY_DEFAULT_WORKSPACE = path.join(root, "reports");
const command = async (name, args, env = {}) => {
  try {
    const { stdout, stderr } = await run(process.execPath, [path.join(projectRoot, "src", "cli", "bin.mjs"), name, ...args], { cwd: root, env: { ...process.env, GALLERY_WORKSPACE: path.join(root, "reports"), GALLERY_NO_BROWSER: "1", ...env }, timeout: 300_000 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
let looked = "no browser";
try {
  const reports = path.join(root, "reports");
  await fs.mkdir(reports);
  await createReportFromStarter("broken", "坏掉的报告", "让 QA 失败", { directory: reports });
  const file = path.join(reports, "broken", "doc.html");
  // What the checks pass and a reader would meet: TeX left open in a paragraph and in two equal ones,
  // a chart of the report's own that throws as it draws, a picture whose data is no picture (one in a
  // Sheet shown second), a chart the kit's notes say hid and shortened labels, a picture a script adds
  // from a file the export does not hold, a path that cannot break past the window's edge, its
  // paragraph's box inside it (one in the Sheet shown second too; nowrap, so that no page-wide
  // break the kit may add makes it fit); and a chart of the report's own drawn in HTML, which is
  // fine. A card's title stands on its card's line (where a block id would be).
  const LONG_PATH = `D:/data/${"very-long-folder-name/".repeat(8)}file.txt`;
  const html = (await fs.readFile(file, "utf8"))
    .replace(/\n[ \t]*<!-- Starter content:[^\n]*-->\n[ \t]*<section\b[^>]*\sdata-doc-placeholder\b[\s\S]*?<\/section>/, `
    <section class="doc-section">
      <h2>正文</h2>
      <p>面积写成 \\[ a^2 但没有闭合。</p>
      <figure class="doc-figure"><h3>画不出的图</h3>
        <div data-doc-chart="broken-strip"><script type="application/json">{ "rows": [] }</script></div>
      </figure>
      <p>一张坏图：<img src="data:image/png;base64,AAAA" alt="坏图"></p>
      <figure class="doc-figure"><h3>说没画出的图</h3>
        <div data-doc-chart="noted-strip"><script type="application/json">{ "rows": [1] }</script></div>
      </figure>
      <figure class="doc-figure"><h3>HTML 画的图</h3>
        <div data-doc-chart="html-strip"><script type="application/json">{ "rows": [1, 2, 3] }</script></div>
      </figure>
      <p id="late-picture">晚到的图：</p>
      <p>重复的一段 \\( x</p>
      <p>重复的一段 \\( x</p>
      <p style="white-space: nowrap">数据在 ${LONG_PATH} 里。</p>
      <section class="doc-sheet-shell" data-doc-sheets="parts">
        <div class="doc-sheet-tabs">
          <button class="doc-sheet-tab" type="button" data-sheet-tab="a">甲</button>
          <button class="doc-sheet-tab" type="button" data-sheet-tab="b">乙</button>
        </div>
        <div data-doc-sheet="a"><p>第一页</p></div>
        <div data-doc-sheet="b"><p>第二页的坏图：<img src="data:image/png;base64,BBBB" alt="第二张坏图"></p><p style="white-space: nowrap">第二页的路径 ${LONG_PATH.replace("file", "other")}</p></div>
      </section>
    </section>`)
    .replace(/\n<\/body>/, `
  <script>
    DocCharts.define("noted-strip", ({ host, width }) => {
      d3.select(host).append("svg").attr("width", width).attr("height", 40);
      host.setAttribute("data-doc-layout", "data-missing: its table has merged cells: write each value in its own cell, the category on every row\\nlabels-truncated: 2 category names cut to fit");
    });
    DocCharts.define("broken-strip", ({ data }) => {
      throw new Error("no rows to draw: " + data.rows.length);
    });
    DocCharts.define("html-strip", ({ host, data }) => {
      host.querySelector(".html-strip")?.remove();
      const bars = document.createElement("div");
      bars.className = "html-strip";
      for (const value of data.rows) {
        const bar = document.createElement("div");
        bar.style.cssText = "height: 12px; margin: 4px 0; background: #4a7; width: " + value * 60 + "px";
        bars.append(bar);
      }
      host.append(bars);
    });
    const late = document.createElement("img");
    late.src = "missing/late.png";
    late.alt = "晚到的图";
    document.querySelector("#late-picture")?.append(late);
  </script>
</body>`);
  assert.ok(html.includes("broken-strip") && html.includes("html-strip") && html.includes("data-doc-sheets"), "the report built");
  await fs.writeFile(file, html);

  // The command lines: usage, an unknown option, an option without its value, no report, not a slug;
  // nothing is looked at.
  const cases = [
    ["qa", ["--help"], 0, "Usage: gallery qa "],
    ["qa", ["broken", "--wide"], 2, "Unknown option: --wide"],
    ["qa", ["broken", "--blocks"], 2, "--blocks takes a value"],
    ["qa", ["broken", "--blocks", "--tiles"], 2, "--blocks takes a value"],
    ["qa", ["broken", "--blocks=,,"], 2, "--blocks takes block ids: --blocks <id,…>"],
    ["qa", ["broken", "--blocks", "zz000000 yy000000"], 2, `--blocks: no block of ${file} has the ids zz000000, yy000000: nothing was looked at`],
    ["qa", [], 2, "Name a document (or pass --all)."],
    ["qa", ["Broken"], 2, "Not a document's slug, link or address: Broken"],
    ["qa", ["broken", "--", "--blocks", "abc"], 2, "Not a document's slug, link or address: --blocks"],
    ["open", ["-h"], 0, "Usage: gallery open [<slug>]"],
    ["open", ["a", "b"], 2, "Name one document at most."],
    ["open", ["../broken"], 2, "Not a document's slug, link or address: ../broken"],
    ["open", ["missing"], 1, `No document "missing": ${path.join(reports, "missing", "doc.html")} does not exist`],
    ["qa", ["broken", "--tiles", "--blocks=a,b", "--no-export"], 2, `broken: no export (${path.join(reports, "exports", "broken.html")}): run gallery export broken first`],
  ];
  const results = await Promise.all(cases.map(([script, args]) => command(script, args)));
  for (const [at, [script, args, code, says]] of cases.entries()) {
    const result = results[at];
    assert.equal(result.code, code, `${script} ${args.join(" ")}\n${result.stdout}${result.stderr}`);
    assert.ok(`${result.stdout}${result.stderr}`.includes(says), `${script} ${args.join(" ")}: ${says}\n${result.stdout}${result.stderr}`);
  }
  assert.equal(await fs.access(path.join(root, "reports", ".gallery", "qa")).then(() => true, () => false), false, "nothing looked at");

  // With no export yet (and no --no-export), gallery qa exports first (it refused, and the
  // Agent ran the export itself); then, with a browser that does not start, nothing is looked at
  // (exit 3), the deliverable's absolute path said last.
  const exportFile = path.join(root, "reports", "exports", "broken.html");
  const shaOf = async (file) => createHash("sha256").update(await fs.readFile(file)).digest("hex");
  const noBrowser = { GALLERY_BROWSER: path.join(root, "no-browser.exe") };
  const exported = await command("qa", ["broken"], noBrowser);
  assert.equal(exported.code, 3, exported.stdout + exported.stderr);
  assert.ok(exported.stdout.startsWith(`broken: exporting first: no export yet (${exportFile}), as gallery export broken does (--no-export: refuse instead)\nExported ${exportFile} (`), exported.stdout);
  // Tried twice, each time in a fresh profile; what to do said in the line (run qa once more, then
  // look yourself: a trial install of the skill alone, 2026-10-28), the deliverable on the last line.
  const unverifiedLines = exported.stdout.trimEnd().split(/\r?\n/);
  assert.equal(unverifiedLines.at(-1), `${HAND_OVER}${exportFile}`, exported.stdout);
  assert.match(unverifiedLines.at(-2), /^UNVERIFIED the browser .*no-browser\.exe did not start, twice, each time with a fresh profile \(.*; GALLERY_BROWSER=<its executable> picks another\): nothing was looked at\. Run gallery qa once more; if it says UNVERIFIED again, /, exported.stdout);
  assert.ok(unverifiedLines.at(-2).endsWith(LOOK_YOURSELF), exported.stdout);
  assert.ok(!/taskkill|no running instance/i.test(exported.stdout + exported.stderr), exported.stderr);
  // The export keeps the text it was made from, for gallery qa's baseline; a first export has no
  // export before it to take one of, and writes none (the text it exports holds the edits).
  const record = path.join(root, "reports", ".gallery", "qa", "broken", "blocks.json");
  const kept = path.join(root, "reports", ".gallery", "qa", "broken", "exported.html");
  assert.equal(await shaOf(kept), exportSourceOf(await fs.readFile(exportFile, "utf8")), "the text the export was made from, kept");
  assert.equal(await fs.access(record).then(() => true, () => false), false, "no baseline of the text exported");
  // Which report.html an export is of is its sha256, never the files' times: an export older than
  // its report.html (a data directory copied, a file touched) is of it all the same, and is looked at
  // (here with a browser that does not start: nothing exported, exit 3) …
  const handedIn = await fs.readFile(file, "utf8");
  const exportedTime = (await fs.stat(exportFile)).mtimeMs;
  const later = new Date(Date.now() + 5000);
  await fs.utimes(file, later, later);
  const same = await command("qa", ["broken", "--no-export"], noBrowser);
  assert.equal(same.code, 3, same.stdout + same.stderr);
  assert.ok(!same.stdout.includes("exporting first") && (await fs.stat(exportFile)).mtimeMs === exportedTime, `an older export of the same text is its export\n${same.stdout}`);
  // … while one newer than a report.html of another text (a file restored with its old time) is not:
  // with --no-export, no export of it (exit 2, nothing exported).
  const earlier = new Date(exportedTime - 60 * 60 * 1000);
  await fs.writeFile(file, `${handedIn}\n`);
  await fs.utimes(file, earlier, earlier);
  const refused = await command("qa", ["broken", "--no-export"]);
  assert.equal(refused.code, 2);
  assert.match(refused.stderr, /^broken: \S*exports[\\/]broken\.html is not of \S*broken[\\/]doc\.html as it is now \(made from a text whose sha256 is [0-9a-f]{12}…, the file's is [0-9a-f]{12}…\): run gallery export broken first/, refused.stderr);
  assert.equal((await fs.stat(exportFile)).mtimeMs, exportedTime, "nothing exported");

  // Without, it is exported first, as gallery export does, and said so; then a browser that does not
  // start: nothing looked at, the export named, exit 3 (not a failure).
  const missing = await command("qa", ["broken"], noBrowser);
  assert.equal(missing.code, 3, missing.stdout + missing.stderr);
  const sha = await shaOf(exportFile);
  // Said in a reader's words, without the hashes the refusal above gives (found testing the skill
  // with Agents, 2026-10-29: the line read as an error before an export that went well).
  assert.match(missing.stdout, /^broken: exporting first: doc\.html changed since the last export \(\S*exports[\\/]broken\.html\), as gallery export broken does \(--no-export: refuse instead\)\nExported \S*exports[\\/]broken\.html \(/);
  assert.ok(!missing.stdout.includes("sha256 is"), missing.stdout);
  assert.ok(missing.stdout.includes(`\nbroken: ${exportFile} sha256 ${sha}, exported `), missing.stdout);
  assert.ok(missing.stdout.includes(`\nUNVERIFIED the browser ${path.join(root, "no-browser.exe")} did not start, twice, each time with a fresh profile (`), missing.stdout);
  assert.ok((await fs.stat(exportFile)).mtimeMs > Date.now() - 60_000, "exported again");
  assert.equal(exportSourceOf(await fs.readFile(exportFile, "utf8")), await shaOf(file), "the export says the report.html it was made from");
  // That export, with no baseline, wrote one of the text the export before it was made from (the
  // report before the change, not the changed text it exported), and kept its own text in its place.
  assert.deepEqual(readBaseline(await fs.readFile(record, "utf8")), baselineOf(handedIn, { from: "export", time: exportedTime }));
  assert.equal(await shaOf(kept), await shaOf(file));

  // Each place is its line of report.html as gallery qa reads it (after the export).
  const source = (await fs.readFile(file, "utf8")).split("\n");
  const lineOf = (text, from = 0) => source.findIndex((line, at) => at >= from && line.includes(text)) + 1;
  // --pictures: the runs below read which blocks and cards a run pictured, which a plain run keeps unlisted.
  const qa = await command("qa", ["broken", "--pictures"]);
  const said = qa.stdout.trimEnd().split(/\r?\n/);
  // The run's pictures are named once, in the list before the verdict (checklistSaid), parsed here:
  // its count, each section with its numbered pictures by their whole paths and what they are, what
  // needs no look, and the run's folder (qa/<slug>/<the run's time>/).
  const listingOf = (stdout) => {
    const rows = stdout.trimEnd().split(/\r?\n/);
    const start = rows.findIndex((line) => /^(?:要看的图|这次拍的图)（/.test(line)); // --pictures: every picture of the run
    if (start < 0) return null;
    const found = { count: Number(/（(\d+) 张）/.exec(rows[start])[1]), sections: [], unneeded: null, folder: null, at: start };
    for (const row of rows.slice(start + 1)) {
      const item = /^ {4}(\d+)\. (.+?) {2}(\S.*)$/.exec(row);
      if (item) found.sections.at(-1).items.push({ number: Number(item[1]), names: item[2].split(", "), text: item[3] });
      else if (/^ {2}\S/.test(row)) found.sections.push({ title: row.trim().replace(/:$/, ""), items: [] });
      else if (row.startsWith("不用看：")) found.unneeded = row;
      else if (row.startsWith("图在 ")) found.folder = /^图在 (.+)\/（/.exec(row)[1];
      else break;
    }
    return found;
  };
  // A name of pictures with its looks in braces, as the files are named.
  const expand = (name) => {
    const looks = /\{([^}]+)\}/.exec(name);
    return looks ? looks[1].split(",").map((look) => name.replace(looks[0], look)) : [name];
  };
  if (findBrowser()) assert.ok(said.at(-3).startsWith("图在 ") && listingOf(qa.stdout)?.sections[0].items[0].names[0].includes("/flagged/"), qa.stdout);
  assert.ok(said[0].startsWith(`broken: ${exportFile} sha256 ${sha}, exported `), said[0]);
  if (!findBrowser()) {
    assert.equal(qa.code, 3, qa.stdout + qa.stderr);
    assert.ok(qa.stdout.includes("UNVERIFIED no Chrome, Edge or Chromium found"), qa.stdout);
  } else {
    looked = "looked at";
    assert.equal(qa.code, 1, qa.stdout + qa.stderr);
    const at = (start) => said.findIndex((line) => line.startsWith(start));
    for (const width of [1024, 736, 360]) assert.ok(said.some((line) => new RegExp(`^ ?${width}px  fail 11 · warn 0 · unverified 0 · 0 tables scroll; 3 charts, 0 tables, 0 disclosures, 1 Sheet shown besides the first, page`).test(line)), `${width}px\n${qa.stdout}`);
    assert.ok(said.includes("1024×768  fail 0 · warn 0 · unverified 0 · 0 tables scroll; only what the 1024px look did not find"), `a laptop's window adds nothing here\n${qa.stdout}`);
    const twice = lineOf("重复的一段");
    const expected = [
      ["FAIL       error: the page", "           1024, 736, 360px: console: [DocKit] chart: Error: no rows to draw: 0"],
      [`FAIL       chart-empty: doc.html:${lineOf("画不出的图")} `, "           1024, 736, 360px: the broken-strip chart drew nothing"],
      [`FAIL       chart-empty: doc.html:${lineOf("说没画出的图")} `, "           1024, 736, 360px: the kit notes data-missing: its table has merged cells: write each value in its own cell, the category on every row"],
      [`FAIL       raw-formula: doc.html:${lineOf("面积写成")} `, '           1024, 736, 360px: "\\[ a^2 但没有闭合。" is shown as written: the kit\'s math did not render it'],
      [`FAIL       raw-formula: doc.html:${twice} `, '           1024, 736, 360px: "\\( x" is shown as written: the kit\'s math did not render it'],
      [`FAIL       raw-formula: doc.html:${lineOf("重复的一段", twice)} `, '           1024, 736, 360px: "\\( x" is shown as written: the kit\'s math did not render it'],
      [`FAIL       image: doc.html:${lineOf("一张坏图")} `, '           1024, 736, 360px: "data:image/png;base64,AAAA… (26 characters)" did not load'],
      [`FAIL       image: doc.html:${lineOf("第二页的坏图")} `, '           1024, 736, 360px: [Sheet "乙"] "data:image/png;base64,BBBB… (26 characters)" did not load'],
      [`FAIL       blocked: doc.html:${lineOf("晚到的图：")} `, '           1024, 736, 360px: img-src blocked "missing/late.png" (img): the export holds every file it shows'],
      [`INFO       layout-note: doc.html:${lineOf("说没画出的图")} `, "           1024, 736, 360px: the kit notes labels-truncated: 2 category names cut to fit"],
    ];
    for (const [head, detail] of expected) {
      const index = at(head);
      assert.ok(index > 0, `${head}\n${qa.stdout}`);
      assert.ok(said[index + 1].startsWith(detail), `${said[index + 1]}\n  is not\n${detail}`);
    }
    // A path that cannot break, past the window's edge while its paragraph's box is not: said at
    // its block's line with the words past the edge, pictured, in the Sheet shown second too, and how
    // to fix it said once under each.
    for (const [words, state] of [["数据在", ""], ["第二页的路径", '[Sheet "乙"] ']]) {
      const index = at(`FAIL       overflow: doc.html:${lineOf(words)} `);
      assert.ok(index > 0, `${words}\n${qa.stdout}`);
      const details = said.slice(index + 1, said.findIndex((line, place) => place > index && !line.startsWith("           ")));
      assert.deepEqual(details.map((line) => /^ {11}([\d, ]+)px: /.exec(line)?.[1]).filter(Boolean).flatMap((labels) => labels.split(", ")).sort(), ["1024", "360", "736"], details.join("\n"));
      for (const line of details.slice(0, -1)) assert.match(line, new RegExp(`px: ${state.replace(/[[\]"]/g, "\\$&")}the page is \\d+px wide in a \\d+px window: the words "D:/data/very-long-folder-name/.*…" in p run past its edge to \\d+px \\(a text that cannot break\\)$`));
      assert.equal(details.at(-1), `           ${ADVICE.overflow}`);
    }
    // Each said once: the second Sheet's picture in its Sheet only, the blocked file not again as its
    // request or its picture, the chart drawn in HTML not at all.
    assert.equal(said.filter((line) => line.includes("BBBB")).length, 1, qa.stdout);
    assert.ok(!said.some((line) => /^FAIL {7}request:|late\.png" did not load|html-strip/.test(line)), qa.stdout);
    // The verdict last, each look's counts in it, and qa itself exporting first.
    assert.equal(said.at(-2), `问题：failures at 11 places (1024px fail 11, warn 0; 1024×768 fail 0, warn 0; 736px fail 11, warn 0; 360px fail 11, warn 0): fix them in the document's doc.html (report.html in an older document), then run this again (it exports first)`);
    assert.equal(said.at(-1), `${HAND_OVER}${exportFile}`);
    // The pictures are named once, in the list before the verdict, each run's in a folder of its own
    // (qa/<slug>/<the run's time>/, its absolute path said last): first each flagged element at each
    // width (the noted chart's card once) in flagged/, then the cards at 1024, 736 and 360px in cards/,
    // the Sheet area among them, compared with the baseline the export wrote, of the report as it
    // was exported before, whose cards no look has seen.
    const qaRoot = path.join(root, "reports", ".gallery", "qa", "broken");
    const runsIn = async () => (await fs.readdir(qaRoot)).filter((name) => /^\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d(-\d+)?$/.test(name)).sort();
    const first = listingOf(qa.stdout);
    const runDir = first.folder;
    assert.equal(path.dirname(runDir), qaRoot.split(path.sep).join("/"), "in the document's qa folder, one folder for the run");
    const folder = (name, run = runDir) => path.join(run, name);
    assert.deepEqual(await runsIn(), [path.basename(runDir)]);
    assert.equal(first.count, 42, "ten flagged elements and the four cards, at three widths");
    assert.equal(first.sections[0].title, "The elements flagged in the findings above");
    assert.match(first.sections[1].title, /^The cards \(chart cards, code blocks, whole blocks, components, flowcharts and Sheet areas, then columns and the other figures, then tables\), those no look has pictured yet first: no block changed since the export of \d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d \(the document before these changes\), nor the document's own <script> or <style>$/, qa.stdout);
    const figures = (await fs.readFile(file, "utf8")).match(/<figure class="doc-figure" data-block-id="[^"]+"/g).map((tag) => /data-block-id="([^"]+)"/.exec(tag)[1]);
    assert.equal(figures.length, 3);
    const shell = /<section class="doc-sheet-shell"[^>]*data-block-id="([^"]+)"/.exec(await fs.readFile(file, "utf8"))?.[1];
    assert.ok(shell, "the Sheet area has its id");
    assert.deepEqual(first.sections[1].items.map(({ names, text: words }) => [names, words]), [...figures.map((id) => [id, "figure.doc-figure"]), [shell, "section.doc-sheet-shell"]].map(([id, tag]) => [[`${runDir}/cards/{1024,736,360}-${id}.png`], `doc.html:${lineOf(`data-block-id="${id}"`)} ${id} ${tag}`]), `the cards, an entry each, in rank and the file's order\n${qa.stdout}`);
    const listed = first.sections[0].items;
    assert.equal(listed.length, 10, `each flagged element, its looks in braces (the noted chart's card once)\n${qa.stdout}`);
    assert.ok(listed.every(({ text: words }) => /^FAIL \S+ doc\.html:\d+/.test(words)), listed.map(({ text: words }) => words).join("\n"));
    const flagged = (await fs.readdir(folder("flagged"))).sort();
    assert.deepEqual(listed.flatMap(({ names }) => names).flatMap(expand).map((name) => path.basename(name)).sort(), flagged, "the pictures listed are those taken");
    assert.deepEqual(listed.flatMap(({ names }) => names).every((name) => name.startsWith(`${runDir}/flagged/`)), true);
    assert.deepEqual(flagged.filter((name) => /^1024-\d/.test(name)).map((name) => name.replace(/^1024-\d+-|\.png$/g, "")).sort(), ["blocked", "chart-empty", "chart-empty", "image", "image", "overflow", "overflow", "raw-formula", "raw-formula", "raw-formula"]);
    assert.match(first.unneeded, /^不用看：INFO 的 1 条（/, "what needs no look: the kit's note, which is info");
    assert.deepEqual((await fs.readdir(qaRoot)).sort(), [path.basename(runDir), "blocks.json", "exported.html"], "the baseline and the text exported, kept for the next look, beside the run's folder");
    assert.deepEqual((await fs.readdir(runDir)).sort(), ["cards", "flagged"], "its folders: no empty one");
    // A run that failed leaves the baseline as it was.
    const baseline = await fs.readFile(record, "utf8");
    assert.equal(readBaseline(baseline).from, "export");

    // A block changed (an Agent's edit, or the user's in the preview): the export is not of the file
    // now, so it is exported first, and its pictures are of that block, then, under a heading of
    // their own and in cards/, of the cards the run before pictured and failed (its baseline
    // kept, they are still unseen); in a folder of its own, the run before's kept.
    await fs.writeFile(file, (await fs.readFile(file, "utf8")).replace("<p>第一页</p>", "<p>第一页，改过</p>").replace(/(<p[^>]*>)第一页<\/p>/, "$1第一页，改过</p>"));
    const again = await command("qa", ["broken", "--pictures"]);
    const lines = again.stdout.trimEnd().split(/\r?\n/);
    assert.ok(lines[0].startsWith("broken: exporting first: doc.html changed since the last export ("), again.stdout);
    assert.ok(!lines.some((line) => /were removed|open the \d+ pictures/.test(line)), "no rule of what is emptied, no count of what is not opened");
    const changed = /data-block-id="([^"]+)"[^>]*>第一页，改过/.exec(await fs.readFile(file, "utf8"))?.[1];
    assert.ok(changed, "the changed paragraph has its id");
    const second = listingOf(again.stdout);
    assert.notEqual(second.folder, runDir, "a new folder for the run");
    assert.deepEqual((await runsIn()).length, 2);
    assert.deepEqual(second.sections.map(({ title }) => title.replace(/ since the export of \S+ \(the document before these changes\)/, "")), [
      "The elements flagged in the findings above", "The blocks changed", "The cards no look has pictured yet (not changed themselves)",
    ], again.stdout);
    const pictured = (id, tag, into) => [[`${second.folder}/${into}/{1024,736,360}-${id}.png`], `doc.html:${lineOf(`data-block-id="${id}"`)} ${id} ${tag}`];
    assert.deepEqual(second.sections[1].items.map(({ names, text: words }) => [names, words]), [pictured(changed, "p", "changed")], again.stdout);
    assert.deepEqual(second.sections[2].items.map(({ names, text: words }) => [names, words]), [...figures.map((id) => pictured(id, "figure.doc-figure", "cards")), pictured(shell, "section.doc-sheet-shell", "cards")], again.stdout);
    const changedLine = (await fs.readFile(file, "utf8")).split("\n").findIndex((line) => line.includes(`data-block-id="${changed}"`)) + 1;
    assert.equal(lineOf(`data-block-id="${changed}"`), changedLine);
    assert.equal(await fs.readFile(record, "utf8"), baseline, "failed again: the baseline as it was");
    assert.deepEqual((await fs.readdir(folder("cards"))).length + (await fs.readdir(folder("flagged"))).length, 42, "the run before's pictures kept");

    // The blocks named, one the report has not, in one argument joined by a space (as npm's
    // gallery.ps1 passes PowerShell's `--blocks a,b`: found testing the skill with Agents, 2026-10-29): refused, exit
    // 2, before anything is exported or looked at: no folder made for it. Then the one it has: its
    // pictures in blocks/ of a new run's folder.
    const files = (ids) => ids.flatMap((id) => [1024, 736, 360].map((width) => `${width}-${id}.png`)).sort();
    const unknown = await command("qa", ["broken", "--blocks", `${figures[2]} nope`]);
    assert.equal(unknown.code, 2, unknown.stdout + unknown.stderr);
    assert.equal(unknown.stderr.split(/\r?\n/)[0], `--blocks: no block of ${file} has the id nope: nothing was looked at and no picture removed. Name ids as gallery qa prints them (data-block-id in the file).`, unknown.stderr);
    assert.equal(unknown.stdout, "", "no look, no verdict");
    assert.deepEqual([(await fs.readdir(folder("changed", second.folder))).sort(), (await fs.readdir(folder("cards", second.folder))).sort(), (await runsIn()).length], [files([changed]), files([...figures, shell]), 2], "no picture removed, no folder made");
    const named = await command("qa", ["broken", "--blocks", figures[2]]);
    const third = listingOf(named.stdout);
    assert.equal(third.sections.find(({ title }) => title === "The blocks named").items.map(({ names, text: words }) => [names, words]).flat().join("|"), [`${third.folder}/blocks/{1024,736,360}-${figures[2]}.png`, `doc.html:${lineOf(figures[2])} ${figures[2]} figure.doc-figure`].join("|"));
    assert.deepEqual([(await fs.readdir(folder("changed", second.folder))).sort(), (await fs.readdir(folder("cards", second.folder))).sort(), (await runsIn()).length], [files([changed]), files([...figures, shell]), 3], "the run before's pictures kept, this run's in a folder of its own");

    // The page in tiles alone: its tiles in tiles/, in one entry each kind, and the Sheet panel shown
    // second in tiles of its own, counted apart; no block pictured or listed.
    const tiled = await command("qa", ["broken", "--tiles"]);
    const tiledList = listingOf(tiled.stdout);
    assert.ok(!tiledList.sections.some(({ title }) => /^The blocks|^The cards/.test(title)), tiled.stdout);
    const tiles = tiledList.sections.find(({ title }) => title === "The page in tiles").items.map(({ names, text: words }) => [names, words]);
    assert.match(tiles[0][1], /^the page as it opens \(each Sheet area with the panel it shows first\): \d+ tiles$/, tiled.stdout);
    assert.deepEqual(tiles[0][0], [`${tiledList.folder}/tiles/<width>-<n>.png`]);
    assert.deepEqual(tiles[1], [[`${tiledList.folder}/tiles/<width>-sheet<i>-<n>.png`], 'each other Sheet panel, shown in turn: sheet2 "乙" 3 tiles'], tiled.stdout);
    const tileFiles = await fs.readdir(folder("tiles", tiledList.folder));
    assert.ok(["1024-01.png", "1024-sheet2-01.png", "360-sheet2-01.png"].every((name) => tileFiles.includes(name)), `the tiles taken\n${tileFiles.join("\n")}`);
    assert.deepEqual((await fs.readdir(tiledList.folder)).sort(), ["flagged", "tiles"].filter((name) => name === "tiles" || (tiledList.sections[0].title.startsWith("The elements flagged"))), "a run of tiles alone: the folders it took pictures in");
    assert.equal((await runsIn()).length, 4);

    // A block moved (after the next figure): changed, and pictured with the block before and after it.
    const text = await fs.readFile(file, "utf8");
    const moving = /\n[ \t]*<p data-block-id="[^"]+">一张坏图：<img[^>]*><\/p>/.exec(text)[0];
    const htmlCard = /\n[ \t]*<figure class="doc-figure" data-block-id="[^"]+"><h3>HTML 画的图<\/h3>[\s\S]*?<\/figure>/.exec(text)[0];
    await fs.writeFile(file, text.replace(moving, "").replace(htmlCard, `${htmlCard}${moving}`));
    const moved = await command("qa", ["broken", "--pictures"]);
    const movedList = listingOf(moved.stdout);
    const movedId = /data-block-id="([^"]+)"/.exec(moving)[1];
    const movedSection = movedList.sections.find(({ title }) => /^The blocks changed since the export of \S+ \(the document before these changes\) \(a moved block pictured with the edges of the blocks before and after it, the moved ones first\)$/.test(title));
    assert.ok(movedSection, moved.stdout);
    const movedItem = movedSection.items.find(({ text: words }) => words.includes(` ${movedId} p (moved`));
    assert.deepEqual([movedItem?.names, movedItem?.text.endsWith(" p (moved: with the edges of the blocks before and after it)")], [[`${movedList.folder}/changed/{1024,736,360}-${movedId}.png`], true], moved.stdout);
    assert.ok(movedSection.items.some(({ text: words }) => words.includes(` ${changed} p`)), `the block changed before is pictured again: no run since passed\n${moved.stdout}`);
    const pngHeight = async (picture) => (await fs.readFile(picture)).readUInt32BE(20);
    const movedHeight = await pngHeight(path.join(folder("changed", movedList.folder), `1024-${movedId}.png`));
    assert.ok(movedHeight > 100 && movedHeight <= 2 * NEIGHBOUR_EDGE + 100, `the picture holds the edge of the chart card before it, not the whole card (${movedHeight}px)`);

    // The runs a document keeps: the newest five (RUNS_KEPT), each earlier one taken away as a run
    // ends; the loose folders an earlier Gallery kept in qa/<slug>/ are taken away when one starts.
    assert.equal((await runsIn()).length, 5);
    await fs.mkdir(path.join(qaRoot, "changed"), { recursive: true });
    await fs.writeFile(path.join(qaRoot, "changed", "1024-old.png"), "x");
    await fs.writeFile(path.join(qaRoot, "1024-old.png"), "x");
    const oldest = (await runsIn())[0];
    const sixth = await command("qa", ["broken", "--tiles"]);
    const kept = await runsIn();
    assert.equal(kept.length, RUNS_KEPT);
    assert.ok(!kept.includes(oldest) && kept.includes(path.basename(listingOf(sixth.stdout).folder)), "the oldest run gone, this one kept");
    assert.deepEqual((await fs.readdir(qaRoot)).filter((name) => !/^\d{4}-/.test(name)).sort(), ["blocks.json", "exported.html"], "what an earlier Gallery kept loose is gone");
  }

  // What a reader meets in tables and drawings that warns or is info, in a report of its own: a column
  // whose body words a frame cuts though its header fits (and one whose cells reach past the frame with
  // nothing written there, a table a pixel or two wider than its frame, and columns whose words in a
  // list or in paragraphs end inside the frame though the list's or paragraphs' boxes do not, which
  // hide nothing), rows below a frame of the kit's height (at 1024px, and in a laptop's window alone),
  // and below one of the author's height (only among the tables that scroll); labels over each other
  // on one axis; a drawing's text its viewBox scales below 11px (none for text large enough); a
  // figure's own words past their box; words and marks cut at the bottom of a box in a card and a whole block, and what is none; a kit note that is info. Each table is named by its
  // caption alike in a finding and in the list of the tables that scroll.
  await createReportFromStarter("shown", "看得见的报告", "让 QA 警告", { directory: reports });
  const shownFile = path.join(reports, "shown", "doc.html");
  const widths = (list) => list.map((width, at) => `<th style="--doc-column-width: ${width}px">${["模型", "比较", "评测者", "效应", "提示数", "结论"][at]}</th>`).join("");
  const rows = (count, cells) => Array.from({ length: count }, (_, at) => `<tr>${cells.map((cell) => `<td>${cell}${cell === "行" ? at + 1 : ""}</td>`).join("")}</tr>`).join("");
  // A long table of data (more than 20 rows: the kit shows a shorter one whole) of rows close together,
  // which a frame of the kit's height holds at 1024×900 but not in a laptop's 768px window.
  const dense = Array.from({ length: 26 }, (_, at) => `<tr><td style="padding-block: 0">行${at + 1}</td><td style="padding-block: 0">1</td></tr>`).join("");
  await fs.writeFile(shownFile, (await fs.readFile(shownFile, "utf8"))
    .replace("</head>", `  <style>
    .years { display: flex; gap: 8px; }
    .year { width: 40px; white-space: nowrap; }
    .cut-box { height: 60px; overflow: hidden; }
    .cut-box p { margin: 0; line-height: 24px; }
    .cut-strip { overflow: hidden; }
    .cut-inner { height: 30px; }
    .cut-bar { display: block; width: 60px; height: 60px; background: #c33; }
    .cut-scroll { height: 40px; overflow: auto; }
    .cut-scroll p, .cut-folded p { margin: 0; }
    .cut-tight { height: 32px; overflow: hidden; font-size: 16px; line-height: 16px; }
    .cut-folded { max-height: 0; overflow: hidden; }
    .cut-holder { position: relative; height: 80px; }
    .cut-low { height: 20px; overflow: hidden; }
    .cut-free { position: absolute; top: 40px; left: 0; }
    .cut-crop { position: relative; height: 80px; overflow: hidden; }
    .cut-crop img { display: block; width: 200px; }
    .cut-blob { position: absolute; right: -30px; bottom: -30px; width: 80px; height: 80px; border-radius: 50%; background: #eee; }
  </style>
</head>`)
    .replace(/\n[ \t]*<!-- Starter content:[^\n]*-->\n[ \t]*<section\b[^>]*\sdata-doc-placeholder\b[\s\S]*?<\/section>/, `
    <section class="doc-section">
      <h2>表格</h2>
      <table><caption>生成评测</caption><thead><tr>${widths([130, 130, 130, 130, 130, 130])}</tr></thead><tbody>${rows(3, ["甲", "乙", "丙", "丁", "12", "未分出差异"])}</tbody></table>
      <table><caption>空着的末列</caption><thead><tr>${widths([130, 130, 130, 130, 130, 80])}</tr></thead><tbody>${rows(3, ["甲", "乙", "丙", "丁", "12", "是"])}</tbody></table>
      <table><caption>差一点的表</caption><thead><tr>${widths([130, 130, 130, 130, 130, 63])}</tr></thead><tbody>${rows(3, ["甲", "乙", "丙", "丁", "12", "是"])}</tbody></table>
      <table><caption>长表</caption><thead><tr><th>行</th><th>值</th></tr></thead><tbody>${rows(30, ["行", "1"])}</tbody></table>
      <div class="doc-table-wrap" style="--doc-table-height: 200px"><table class="doc-table"><thead><tr><th>定高的行</th><th>值</th></tr></thead><tbody>${rows(30, ["行", "1"])}</tbody></table></div>
      <table><caption>笔记本上的表</caption><thead><tr><th>行</th><th>值</th></tr></thead><tbody>${dense}</tbody></table>
      <table><caption>单元格里的列表</caption><thead><tr>${widths([130, 130, 130, 130, 130, 130])}</tr></thead><tbody>${rows(3, ["甲", "乙", "丙", "丁", "12", "<ul><li>是</li></ul>"])}</tbody></table>
      <table><caption>单元格里的段落</caption><thead><tr>${widths([130, 130, 130, 130, 130, 130])}</tr></thead><tbody>${rows(3, ["甲", "乙", "丙", "丁", "12", "<p>是</p><p>否</p>"])}</tbody></table>
      <figure class="doc-figure"><h3>挤在一起的图</h3>
        <div data-doc-chart="crowded-strip"><script type="application/json">{ "rows": [1] }</script></div>
      </figure>
      <figure class="doc-figure"><h3>说了排版的图</h3>
        <div data-doc-chart="thinned-strip"><script type="application/json">{ "rows": [1] }</script></div>
      </figure>
      <figure class="doc-figure"><h3>五个刻度的轴</h3>
        <div data-doc-chart="value-axis"><script type="application/json">{ "max": 8000, "narrow": 3 }</script></div>
      </figure>
      <figure class="doc-figure"><h3>挨着的刻度</h3>
        <div data-doc-chart="value-axis"><script type="application/json">{ "max": 1, "narrow": 10 }</script></div>
      </figure>
      <figure class="doc-figure"><h3>二十一个刻度的轴</h3>
        <div data-doc-chart="value-axis"><script type="application/json">{ "max": 100, "narrow": 3, "wide": 20 }</script></div>
      </figure>
      <figure class="doc-figure"><h3>十二周的轴</h3>
        <div data-doc-chart="week-axis"><script type="application/json">{ "weeks": 12 }</script></div>
      </figure>
    </section>
    <section class="doc-section">
      <h2>代码、公式和线</h2>
      <pre data-title="长代码.js"><code class="language-js">${Array.from({ length: 60 }, (_, at) => `const value${at + 1} = ${at + 1};`).join("\n")}</code></pre>
      <pre data-title="src/editor/input/text-input-handlers.js"><code class="language-js">const short = 1;</code></pre>
      <pre data-title="a.js"><code class="language-js">const a = 1;</code></pre>
      <details><summary>完整样例</summary>
        <pre data-title="折叠里的长代码.js"><code class="language-js">${Array.from({ length: 60 }, (_, at) => `const folded${at + 1} = ${at + 1};`).join("\n")}</code></pre>
        <p>\\[ ${Array.from({ length: 40 }, (_, at) => `a_{${at + 1}}`).join(" + ")} \\]</p>
      </details>
      <div class="doc-code" style="--doc-code-height: 160px"><div class="doc-code-title">定高的代码.js</div><pre><code class="language-js">${Array.from({ length: 20 }, (_, at) => `const fixed${at + 1} = ${at + 1};`).join("\n")}</code></pre></div>
      <div class="doc-code doc-code--nowrap"><div class="doc-code-title">不折行.js</div><pre><code class="language-js">const result = someFunctionName(argumentNumberOne, argumentNumberTwo, argumentNumberThree, argumentNumberFour, argumentNumberFive, argumentNumberSix);</code></pre></div>
      <p>\\[ \\sum_{i=1}^{n} \\left( a_i + b_i + c_i + d_i + e_i + f_i + g_i + h_i \\right) = x_1 + x_2 + x_3 + x_4 + x_5 \\]</p>
      <p>\\[ a + b = c \\]</p>
      <figure class="doc-figure"><h3>缩小的字</h3>
        <div data-doc-chart="shrunk-strip"><script type="application/json">{ "rows": [1] }</script></div>
      </figure>
      <figure class="doc-figure"><h3>够大的字</h3>
        <svg viewBox="0 0 300 60" role="img" aria-label="够大"><text x="10" y="40" style="font-size: 20px">读得清的字</text></svg>
      </figure>
      <figure class="doc-figure"><h3>挤出格子的字</h3>
        <div class="years"><div class="year">159716031609</div><div class="year">一六〇三</div></div>
      </figure>
      <figure class="doc-figure"><h3>切掉底部的字</h3>
        <div class="cut-box"><p>第一行文字</p><p>第二行文字</p><p>第三行被切掉的字</p></div>
      </figure>
      <figure class="doc-figure"><h3>画到底下的条</h3>
        <svg width="300" height="60" role="img" aria-label="条"><rect x="10" y="20" width="40" height="80" fill="#c33"></rect><rect x="60" y="10" width="40" height="40" fill="#3c3"></rect></svg>
      </figure>
      <div class="cut-strip"><div class="cut-inner"><span class="cut-bar"></span><span>定高框下面的标签</span></div></div>
      <figure class="doc-figure"><h3>不算切掉的</h3>
        <div class="cut-scroll"><p>能滚动的甲</p><p>能滚动的乙</p><p>能滚动的丙</p></div>
        <div class="cut-tight">gyp gyp<br>gyp jag</div>
        <div class="cut-folded"><p>收起来的内容</p></div>
        <div class="cut-holder"><div class="cut-low"><span class="cut-free">放在外面的标签</span></div></div>
        <div class="cut-crop"><img src="data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%27200%27 height=%27200%27%3E%3Crect width=%27200%27 height=%27200%27 fill=%27%23999%27/%3E%3C/svg%3E" alt="裁剪的图片"><span class="cut-blob"></span></div>
      </figure>
      <figure class="doc-figure"><h3>各组人数</h3>
        <div data-doc-chart="table-strip" data-doc-chart-data="g1"></div>
      </figure>
      <div class="doc-table-wrap" data-doc-chart-source="g1"><table class="doc-table"><thead><tr><th>组</th><th>人数</th><th style="--doc-column-width: 160px">说明</th><th style="--doc-column-width: 160px">备注</th></tr></thead><tbody>${["甲", "乙", "丙"].map((name, at) => `<tr><td>${name}</td><td>${12 + at}</td><td>一段说明的文字</td><td>备注</td></tr>`).join("")}</tbody></table></div>
      <p class="doc-note">范围：351 条记录 · 按年号<span class="doc-tab">单位：条</span></p>
      <div class="doc-table-wrap"><table class="doc-table"><thead><tr><th style="--doc-column-width: 130px">年号</th><th style="--doc-column-width: 130px">公历</th><th style="--doc-column-width: 130px">记录数</th><th style="--doc-column-width: 130px">说明</th></tr></thead><tbody>${rows(3, ["文禄", "1592", "6", "一段说明"])}</tbody></table></div>
    </section>`)
    .replace(/\n<\/body>/, `
  <script>
    DocCharts.define("crowded-strip", ({ host }) => {
      const svg = d3.select(host).append("svg").attr("width", 300).attr("height", 130);
      const axis = svg.append("g").attr("class", "axis").attr("transform", "translate(0,110)");
      for (const [x, label] of [[90, "第一个类目名称"], [120, "第二个类目名称"]]) axis.append("g").attr("class", "tick").attr("transform", "translate(" + x + ",0)").append("text").attr("text-anchor", "middle").attr("y", 12).text(label);
    });
    DocCharts.define("shrunk-strip", ({ host }) => {
      const svg = d3.select(host).append("svg").attr("viewBox", "0 0 1400 120");
      svg.append("text").attr("x", 10).attr("y", 60).style("font-size", "14px").text("缩小的文字");
      svg.append("text").attr("x", 400).attr("y", 90).style("font-size", "80px").text("大字");
    });
    DocCharts.define("table-strip", ({ host, data, width }) => {
      /** @type {DocTableRows} */
      const rows = data;
      const svg = d3.select(host).append("svg").attr("width", width).attr("height", 30 * rows.length);
      svg.selectAll("rect").data(rows).join("rect").attr("y", (_, at) => at * 30).attr("height", 20).attr("width", (row) => Number(row[rows.columns[1]]) * 10);
    });
    // A value axis as the example's lollipop drew it (ticks(n) narrow: n is a hint to d3).
    DocCharts.define("value-axis", ({ host, data, width }) => {
      /** @type {{ max: number, narrow: number }} */
      const spec = data;
      const x = d3.scaleLinear([0, spec.max], [40, width - 24]).nice();
      const svg = d3.select(host).append("svg").attr("width", width).attr("height", 60);
      svg.append("g").attr("class", "axis").attr("transform", "translate(0,30)").call(d3.axisBottom(x).ticks(width < 520 ? spec.narrow : spec.wide ?? 6));
    });
    // A band axis of categories that hold numbers (第1周 … 第12周): no value axis.
    DocCharts.define("week-axis", ({ host, data, width }) => {
      /** @type {{ weeks: number }} */
      const spec = data;
      const x = d3.scaleBand(d3.range(1, spec.weeks + 1).map((week) => "第" + week + "周"), [30, width - 10]);
      const svg = d3.select(host).append("svg").attr("width", width).attr("height", 60);
      svg.append("g").attr("class", "axis").attr("transform", "translate(0,30)").call(d3.axisBottom(x));
    });
    DocCharts.define("thinned-strip", ({ host, width }) => {
      d3.select(host).append("svg").attr("width", width).attr("height", 40);
      host.setAttribute("data-doc-layout", "labels-thinned: 2 of 8 category names left out to fit (one in 2 shown)");
    });
  </script>
</body>`));
  const shownExport = await command("export", ["shown"]);
  assert.equal(shownExport.code, 0, shownExport.stdout + shownExport.stderr);
  if (findBrowser()) {
    const shown = await command("qa", ["shown", "--pictures"]);
    const out = shown.stdout.trimEnd().split(/\r?\n/);
    const text = (await fs.readFile(shownFile, "utf8")).split("\n");
    const lineOfShown = (words) => text.findIndex((line) => line.includes(words)) + 1;
    const tableLine = (caption) => text.findIndex((line, at) => at >= lineOfShown(caption) - 1 && line.includes("doc-table-wrap")) + 1;
    assert.equal(shown.code, 0, shown.stdout + shown.stderr);
    const group = (head) => {
      const start = out.findIndex((line) => line.startsWith(head));
      assert.ok(start > 0, `${head}\n${shown.stdout}`);
      const end = out.findIndex((line, at) => at > start && !line.startsWith("           "));
      return out.slice(start + 1, end).map((line) => line.trim().replace(/ {2}\(.*\)$/, ""));
    };
    assert.deepEqual(group(`WARN       table-columns: doc.html:${tableLine("生成评测")} `), [
      `1024px: of 6 columns, 1 cut at the frame's edge ("结论"): the table is 780px wide in a 712px frame`,
      `736px: of 6 columns, 1 cut at the frame's edge ("结论"): the table is 780px wide in a 696px frame`,
      "not a failure. If the reader must see the column on a desktop, write its long values compactly (a cell of numbers stays on one line, so its longest value sets the column's width: a range as a–b, fewer digits), move a unit out of its header into the line above the table, shorten the header, or split the table; never delete a column to silence this",
    ], "a column cut by its body's words, its header fitting, and what to do if the reader must see it");
    assert.ok(out.some((line) => line.startsWith(`WARN       table-columns: doc.html:${tableLine("生成评测")} `) && line.endsWith(' table "生成评测"')), `a table named by its caption, as the tables that scroll are\n${shown.stdout}`);
    for (const caption of ["空着的末列", "差一点的表", "单元格里的列表", "单元格里的段落"]) {
      assert.ok(!out.some((line) => line.startsWith(`WARN       table-columns: doc.html:${tableLine(caption)} `)), `${caption}: no words past the edge, nothing hidden\n${shown.stdout}`);
    }
    const long = group(`WARN       table-rows: doc.html:${tableLine("长表")} `);
    assert.equal(long.length, 2, long.join("\n"));
    assert.match(long[0], /^1024, 736px: the frame shows (\d+) of 30 rows: a reader scrolls inside it for the other \d+; style="--doc-table-height: none" on its div\.doc-table-wrap shows every row \(or split the table where its content divides\)$/);
    assert.match(long[1], /^1024×768px: the frame shows \d+ of 30 rows: /);
    assert.deepEqual(group(`WARN       table-rows: doc.html:${tableLine("笔记本上的表")} `).map((line) => line.replace(/:.*/, "")), ["1024×768px"], "rows a laptop's window hides");
    assert.ok(!out.some((line) => line.includes("定高的行") && line.startsWith("WARN")), `a frame of the author's height warns of nothing\n${shown.stdout}`);
    assert.deepEqual(group(`WARN       chart-text-overlap: doc.html:${lineOfShown("挤在一起的图")} `), [`1024, 736, 360px: "第一个类目名称" and "第二个类目名称" overlap`, ADVICE["chart-text-overlap"]]);
    assert.deepEqual(group(`INFO       layout-note: doc.html:${lineOfShown("说了排版的图")} `), ["1024, 736, 360px: the kit notes labels-thinned: 2 of 8 category names left out to fit (one in 2 shown)"]);
    // Ticks measured, not counted: five labels, 0 … 8,000, along a phone's 298px axis (294px until the card's sides went from 16 to 14 there, 2026-11-17)
    // stand 28px apart and say nothing; eleven, 0.0 … 1.0, 7px apart warn there alone, once (not
    // again as text over text), with the advice for an axis.
    assert.ok(!out.some((line) => /^(FAIL|WARN|INFO) /.test(line) && line.includes(`doc.html:${lineOfShown("五个刻度的轴")} `)), `five ticks that do not crowd\n${shown.stdout}`);
    const close = group(`WARN       ticks: doc.html:${lineOfShown("挨着的刻度")} `);
    assert.match(close[0], /^360px: 11 tick labels across a 298px chart crowd: "0\.\d" and "0\.\d" [67]px apart, under a digit's width and a hair at their 13px \(0\.0, 0\.1, 0\.2, 0\.3, 0\.4, 0\.5, …\)$/, close.join("\n"));
    assert.deepEqual(close.slice(1), [ADVICE.ticks]);
    assert.ok(!ADVICE.ticks.includes("ticks(4)") && ADVICE.ticks.includes("tickValues"), ADVICE.ticks);
    assert.ok(!out.some((line) => line.startsWith(`WARN       chart-text-overlap: doc.html:${lineOfShown("挨着的刻度")} `)), shown.stdout);
    // 21 labels, 0 … 100, at 1024px stand about 13px apart and read well: nothing (a whole em warned
    // there, in a review of 2026-10-29). Categories that hold numbers (第1周 …) are no value axis: on a
    // phone they are text over text, with the advice for labels, never the ticks finding.
    assert.ok(!out.some((line) => /^(FAIL|WARN|INFO) /.test(line) && line.includes(`doc.html:${lineOfShown("二十一个刻度的轴")} `)), `21 ticks that do not crowd\n${shown.stdout}`);
    assert.ok(!out.some((line) => line.startsWith(`WARN       ticks: doc.html:${lineOfShown("十二周的轴")} `)), shown.stdout);
    const weeks = group(`WARN       chart-text-overlap: doc.html:${lineOfShown("十二周的轴")} `);
    assert.ok(weeks[0].startsWith("360px: ") && /"第\d+周" and "第\d+周" overlap/.test(weeks[0]) && weeks.at(-1) === ADVICE["chart-text-overlap"], weeks.join("\n"));
    // The tables that scroll, each a line of its own said as information (read as problems once
    // their heading was cut off), before the findings.
    const scrolling = out.filter((line) => line.startsWith("INFO       table-scrolls: "));
    assert.ok(scrolling.every((line) => line.endsWith(` (${SCROLLS})`)) && out.indexOf(scrolling.at(-1)) < out.findIndex((line) => /^(FAIL|WARN) /.test(line)), shown.stdout);
    const ways = (caption) => scrolling.find((line) => line.startsWith(`INFO       table-scrolls: doc.html:${tableLine(caption)} `))?.replace(/^.*?": /, "").replace(` (${SCROLLS})`, "");
    assert.deepEqual(["生成评测", "空着的末列", "差一点的表", "长表", "笔记本上的表"].map(ways), [
      "→ 1024, 736, 360px", "→ 1024, 736, 360px", "→ 736, 360px", "↓ 1024, 1024×768, 736, 360px", "↓ 1024×768px",
    ], `each table by its caption with its directions; one a pixel or two wider than its frame scrolls by its rounding\n${shown.stdout}`);
    assert.ok(scrolling.some((line) => line.endsWith(`"定高的行": ↓ 1024, 736, 360px (${SCROLLS})`)), shown.stdout);
    // A table drawn by a chart card is named by the card's title; one under a note by the note, its
    // tab's words after a separator.
    assert.ok(scrolling.some((line) => line.endsWith(`"各组人数": → 360px (${SCROLLS})`)), shown.stdout);
    assert.ok(scrolling.some((line) => line.endsWith(`"范围：351 条记录 · 按年号 · 单位：条": → 360px (${SCROLLS})`)), shown.stdout);
    // Code that scrolls in its frame warns where a reader has room for it; on a phone the kit shows a
    // code block whole (no frame to scroll in), so nothing is said there; a title cut on a phone is
    // info; a short block, its title whole, says nothing.
    // (A block's line: the line of the data-block-id at or before its words; a finding's head names it.)
    const heads = (line) => /^(FAIL|WARN|INFO|UNVERIFIED) /.test(line);
    const blockLineOf = (words) => {
      for (let at = text.findIndex((line) => line.includes(words)); at >= 0; at--) if (text[at].includes("data-block-id")) return at + 1;
      return 0;
    };
    const codeLine = blockLineOf("长代码.js");
    const longCode = group(`WARN       code-scrolls: doc.html:${codeLine} `);
    assert.match(longCode[0], /^1024, 736px: the code is \d+px tall, its frame 820px \(its last \d+ lines below it\): a reader scrolls inside it for the rest$/, longCode.join("\n"));
    assert.equal(longCode[1], ADVICE["code-scrolls"]);
    assert.ok(!out.some((line) => line.startsWith(`INFO       code-scrolls: doc.html:${codeLine} `)), `on a phone the long code shows whole\n${shown.stdout}`);
    const titleLine = blockLineOf("text-input-handlers.js");
    // On a phone a code block's title wraps (styles/code.css), so a long path is never cut there.
    assert.ok(!out.some((line) => line.startsWith(`INFO       code-title-cut: doc.html:${titleLine} `)), `a long title wraps on a phone\n${shown.stdout}`);
    assert.ok(!out.some((line) => line.includes(`code-scrolls: doc.html:${titleLine} `)), `short code does not scroll\n${shown.stdout}`);
    assert.ok(!out.some((line) => heads(line) && line.includes(`doc.html:${blockLineOf(">a.js<")} `)), `short code, its title whole, says nothing\n${shown.stdout}`);
    // Code that scrolls as the author or the reader chose (a frame of the block's own height, its lines
    // left unwrapped: sideways), or in a disclosure closed in the file (where SKILL.md puts a whole
    // sample), is info at every width, pictured on a phone alone (as any that scrolls there is); so
    // is a formula in a closed disclosure.
    for (const [words, kind, said] of [
      ["折叠里的长代码.js", "code-scrolls", /^1024, 736(, 360)?px: the code is \d+px tall, its frame 820px \(its last \d+ lines below it\), in a disclosure closed in the file: a reader who opens it scrolls inside it for the rest$/],
      ["定高的代码.js", "code-scrolls", /^1024, 736(, 360)?px: the code is \d+px tall, its frame 160px \(its last \d+ lines below it\), the block's own height \(--doc-code-height: 160px, the author's or the reader's\): a reader scrolls inside it for the rest$/],
      ["不折行.js", "code-scrolls", /^1024px: the code is \d+px wide, its frame 712px, its lines left unwrapped \(doc-code--nowrap, the author's or the reader's choice\): a reader scrolls sideways for the rest of its long lines$/],
      ["a_{40}", "formula-scrolls", /^1024(, 736)?(, 360)?px: the formula is \d+px wide, its frame \d+px, in a disclosure closed in the file: a reader who opens it scrolls it sideways for the rest$/],
    ]) {
      const head = `INFO       ${kind}: doc.html:${blockLineOf(words)} `;
      assert.ok(!out.some((line) => line.startsWith(head.replace("INFO", "WARN"))), `${words}: no warning\n${shown.stdout}`);
      assert.match(group(head)[0], said, `${words}\n${shown.stdout}`);
      const start = out.findIndex((line) => line.startsWith(head));
      const raw = out.slice(start + 1, out.findIndex((line, at) => at > start && !line.startsWith("           ")));
      // Its lines, then what to do, said under info too (advice at any level).
      assert.equal(raw.at(-1), `           ${words === "不折行.js" ? CODE_SIDEWAYS : ADVICE[kind]}`, "code that scrolls sideways told of its lines, not of its height");
      // Pictured on a phone alone: the list's entry for the place holds pictures at 360px only, and there is one when a line says 360px.
      const flaggedItems = (listingOf(shown.stdout)?.sections.find(({ title }) => title.startsWith("The elements flagged"))?.items ?? []).filter(({ text: item }) => item.startsWith(`INFO ${kind} doc.html:${blockLineOf(words)} `));
      const onPhone = raw.slice(0, -1).some((line) => /^\s+([\d, ×]+)px: /.exec(line)[1].split(", ").includes("360"));
      assert.equal(flaggedItems.length > 0, onPhone, `${words}: pictured on a phone alone\n${raw.join("\n")}`);
      assert.ok(flaggedItems.flatMap(({ names }) => names).every((name) => /\/flagged\/360-\d+-[\w-]+\.png$/.test(name)), `${words}: 360px alone\n${JSON.stringify(flaggedItems)}`);
    }
    // A formula wider than a phone's column scrolls there (info, pictured), not on a desktop; a short one says nothing.
    const formulaLine = blockLineOf("\\sum_{i=1}");
    assert.deepEqual(group(`INFO       formula-scrolls: doc.html:${formulaLine} `).map((line) => line.replace(/\d+px wide, its frame \d+px/, "Npx wide, its frame Mpx")), ["360px: the formula is Npx wide, its frame Mpx: a reader scrolls it sideways for the rest", ADVICE["formula-scrolls"]]);
    assert.ok(listingOf(shown.stdout).sections[0].items.some(({ names }) => names.some((name) => /\/flagged\/360-\d+-formula-scrolls\.png$/.test(name))), `pictured on a phone\n${shown.stdout}`);
    assert.ok(!out.some((line) => line.startsWith("WARN       formula-scrolls") || (heads(line) && line.includes(`doc.html:${blockLineOf("a + b = c")} `))), `a short formula, or a long one on a desktop, says nothing\n${shown.stdout}`);
    // A drawing's text its viewBox scales below 11px (a chart's own svg, viewBox 1400 wide): each
    // look its rendered size, the drawing named by its card; text large enough in its units, or in a
    // drawing whose viewBox is drawn at its own size, says nothing.
    const shrunk = group(`WARN       svg-text-small: doc.html:${lineOfShown("缩小的字")} `);
    assert.ok(shrunk.length >= 2 && shrunk.slice(0, -1).every((line) => /^[\d, ]+px: 1 text of a drawing scaled by its viewBox \(1400×120 drawn \d+px wide\) render below 11px: "缩小的文字" at \d+\.\dpx \(font-size 14\)$/.test(line)), shrunk.join("\n"));
    assert.equal(shrunk.at(-1), ADVICE["svg-text-small"]);
    assert.ok(out.some((line) => line.startsWith(`WARN       svg-text-small: doc.html:${lineOfShown("缩小的字")} `) && line.endsWith(' card "缩小的字"')), `named by its card\n${shown.stdout}`);
    assert.ok(!out.some((line) => heads(line) && line.includes(`doc.html:${lineOfShown("够大的字")} `)), `text that reads says nothing\n${shown.stdout}`);
    // Words of a figure's own drawing past the side of their box (as a whole block's are measured):
    // its title not measured.
    const crowded = group(`WARN       overflow-in-block: doc.html:${blockLineOf("挤出格子的字")} `);
    assert.match(crowded[0], /^[\d, ]+px: the words "159716031609" run \d+px past the side of div\.year \(40px wide for its words\), over what is beside it$/, crowded.join("\n"));
    assert.equal(crowded.at(-1), ADVICE["overflow-in-block"]);
    // Words and marks cut at the bottom of a box that clips them, at every width: a card's words below
    // a box of a fixed height (its last line), a shape an svg draws past its bottom edge (the shape
    // inside it says nothing), a whole block's bar and label drawn past a box of a fixed height and
    // cut by the box around it; what scrolls, a line set tighter than its font, a box folded to
    // nothing, a label placed absolutely out of the box, a cropped picture and a circle bleeding out
    // of every side on purpose say nothing.
    const cutAt = (words, line) => {
      const said = group(`WARN       cut-in-block: doc.html:${blockLineOf(words)} `);
      assert.equal(said.length, 2, said.join("\n"));
      assert.match(said[0], new RegExp(`^1024, 736, 360px: ${line}$`), said.join("\n"));
      assert.equal(said[1], ADVICE["cut-in-block"]);
    };
    cutAt("切掉底部的字", String.raw`the words "第三行被切掉的字" reach 10px past the bottom of div\.cut-box \(60px tall, its overflow hidden\), cut off there`);
    cutAt("画到底下的条", String.raw`a mark \(rect\) reaches 40px past the bottom of svg \(60px tall, its overflow hidden\), cut off there`);
    cutAt("定高框下面的标签", String.raw`the words "定高框下面的标签" and a mark \(span\.cut-bar\) reach \d+px past the bottom of div\.cut-strip \(30px tall, its overflow hidden\), cut off there`);
    assert.ok(!out.some((line) => heads(line) && line.includes(`doc.html:${blockLineOf("不算切掉的")} `)), `nothing cut there\n${shown.stdout}`);
    assert.match(out.at(-2), /^下一步：nothing failed \(1024px fail 0, warn \d+; 1024×768 fail 0, warn \d+; 736px fail 0, warn \d+; 360px fail 0, warn \d+\); warnings at 12 places to read, /);
    assert.ok(out.at(-2).endsWith(`, ${WARNED}`), out.at(-2));
    assert.equal(out.at(-1), `${HAND_OVER}${path.join(root, "reports", "exports", "shown.html")}`);
    // The kit says the same of its frames (one measure: src/shared/table-hides.mjs).
    const { default: puppeteer } = await import("puppeteer-core");
    const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 1024, height: 900 });
      await page.goto(pathToFileURL(path.join(root, "reports", "exports", "shown.html")).href, { waitUntil: "load" });
      await settle(page, { timeout: 20_000 });
      const frames = await page.evaluate(() => [...document.querySelectorAll(".doc-table-wrap")].map((wrap) => ({
        note: wrap.getAttribute("data-doc-layout"), more: wrap.querySelector(":scope > .doc-scrollbars")?.hasAttribute("data-more") ?? null, wider: wrap.querySelector("table").offsetWidth - wrap.clientWidth,
      })));
      const kitNotes = frames.map(({ note }) => note);
      assert.deepEqual(kitNotes.slice(0, 3), ['columns-hidden: of 6 columns, 1 cut at the frame\'s edge ("结论") (scroll sideways)', null, null]);
      assert.match(kitNotes[3], /^rows-hidden: the frame shows \d+ of 30 rows \(scroll down\)$/);
      assert.equal(kitNotes[5], null, "a laptop's rows fit a taller window");
      assert.deepEqual(kitNotes.slice(6, 8), [null, null], "a list's or paragraphs' box past the edge, their words inside it: nothing hidden");
      // Its right edge fades while words lie past it, not over the padding or the empty part of a
      // column past it (tables wider than their frames by more than a last column's padding).
      assert.ok(frames[1].wider > 9 && frames[6].wider > 9, JSON.stringify(frames));
      assert.deepEqual([0, 1, 2, 6, 7].map((at) => frames[at].more), [true, false, false, false, false], JSON.stringify(frames));
      await page.evaluate(() => {
        const wrap = document.querySelector(".doc-table-wrap");
        wrap.scrollLeft = wrap.scrollWidth;
      });
      await page.waitForFunction(() => !document.querySelector(".doc-table-wrap > .doc-scrollbars").hasAttribute("data-more"), { timeout: 5000 });
    } finally {
      await browser.close();
    }
  }

  // What an Agent draws itself, a detail card and a Sheet area, in a report of their own (found testing
  // the skill with Agents, 2026-10-26): a whole block (a timeline in HTML and CSS) whose dots its ::before draws past its
  // box, pictured whole (each picture cut them in half, and the Agent "fixed" its margins), whose
  // years cannot break and run past their narrow column on a phone (a warning, found nowhere before);
  // a detail card holding a table too wide for it, opened, looked at and its table pictured when
  // named; then a new Sheet area of three panels, pictured with each panel that holds what
  // changed, and taken as seen, nothing of it changed at the run after; the report's own style
  // changed alone, said so.
  await createReportFromStarter("drawn", "自己画的", "整体块、详情卡片和选项卡", { directory: reports });
  const drawnFile = path.join(reports, "drawn", "doc.html");
  const years = [["1593", "文禄敕版"], ["1597—1603", "庆长敕版"], ["1621", "元和敕版"]];
  await fs.writeFile(drawnFile, (await fs.readFile(drawnFile, "utf8"))
    .replace("</head>", `  <style>
    .tl { max-width: 300px; margin: 8px 0 8px 24px; border-left: 2px solid #999; }
    .tl-item { position: relative; display: grid; grid-template-columns: 104px 1fr; gap: 8px; padding: 6px 0 6px 16px; }
    .tl-item::before { content: ""; position: absolute; left: -9px; top: 10px; width: 16px; height: 16px; border-radius: 50%; background: #c33; }
    .tl-year { white-space: nowrap; }
    @media (max-width: 520px) { .tl-item { grid-template-columns: 40px 1fr; } }
  </style>
</head>`)
    .replace(/\n[ \t]*<!-- Starter content:[^\n]*-->\n[ \t]*<section\b[^>]*\sdata-doc-placeholder\b[\s\S]*?<\/section>/, `
    <section class="doc-section">
      <h2>时间线</h2>
      <div class="tl">${years.map(([year, name]) => `<div class="tl-item"><span class="tl-year">${year}</span><span>${name}</span></div>`).join("")}</div>
      <p>各列的意思见<a href="#wide-card">宽表</a>。</p>
      <dialog id="wide-card"><h2>宽表</h2><table><thead><tr>${Array.from({ length: 13 }, (_, at) => `<th>第${at + 1}列的名称</th>`).join("")}</tr></thead><tbody><tr>${Array.from({ length: 13 }, (_, at) => `<td>${at * 7}</td>`).join("")}</tr></tbody></table></dialog>
    </section>`));
  if (findBrowser()) {
    const drawn = (...args) => command("qa", ["drawn", "--pictures", ...args]);
    const linesOf = (result) => result.stdout.trimEnd().split(/\r?\n/);
    // A picture of a block in the list a run ends with: its entry (the pictures' whole paths, what it is) found by the name of its first picture.
    const entryOf = (result, into, id, tag, line) => {
      const list = listingOf(result.stdout);
      const item = list?.sections.flatMap(({ items }) => items).find(({ names }) => names[0] === `${list.folder}/${into}/{1024,736,360}-${id}.png`);
      assert.ok(item, `${into}/${id} is in the list\n${result.stdout}`);
      assert.ok(item.text.startsWith(`doc.html:${line} ${id} ${tag}`), item.text);
      return { ...item, folder: list.folder };
    };
    const first = await drawn();
    const firstLines = linesOf(first);
    assert.equal(first.code, 0, first.stdout + first.stderr);
    assert.ok(first.stdout.startsWith(`drawn: exporting first: no export yet (${path.join(root, "reports", "exports", "drawn.html")})`), first.stdout);
    assert.ok(firstLines.at(-2).endsWith("It was exported first by this run (it had none yet)."), firstLines.at(-2));
    assert.equal(firstLines.at(-1), `${HAND_OVER}${path.join(root, "reports", "exports", "drawn.html")}`);
    const drawnText = await fs.readFile(drawnFile, "utf8");
    const drawnLines = drawnText.split("\n");
    const idOf = (pattern) => pattern.exec(drawnText)?.[1];
    const timeline = idOf(/<div class="tl" data-block-id="([^"]+)"/);
    const cardTable = idOf(/<dialog[\s\S]*?<div class="doc-table-wrap"[^>]*data-block-id="([^"]+)"/);
    assert.ok(timeline && cardTable, drawnText);
    const lineOfDrawn = (id) => drawnLines.findIndex((line) => line.includes(`data-block-id="${id}"`)) + 1;
    // The timeline first, as a whole block; its picture holds its dots (wider than its 300px box by
    // the 7px a dot reaches past it, and the margin around it).
    const timelineEntry = entryOf(first, "cards", timeline, "div.tl", lineOfDrawn(timeline));
    const pngWidth = async (picture) => (await fs.readFile(picture)).readUInt32BE(16);
    assert.ok(await pngWidth(path.join(timelineEntry.folder, "cards", `1024-${timeline}.png`)) >= 300 + 7 + 2 * INK_MARGIN - 1, "the dots in the picture");
    // Its years run past their 40px column on a phone, over the words beside them: a warning there.
    const overflowHead = firstLines.findIndex((line) => line.startsWith(`WARN       overflow-in-block: doc.html:${lineOfDrawn(timeline)} `));
    assert.ok(overflowHead > 0, first.stdout);
    assert.match(firstLines[overflowHead + 1], /^ {11}360px: the words "1597—1603" run \d+px past the side of span\.tl-year \(40px wide for its words\), over what is beside it$/, first.stdout);
    assert.equal(firstLines[overflowHead + 2], `           ${ADVICE["overflow-in-block"]}`);
    // The detail card opened at each width: its table checked there (and pictured, as a card).
    assert.ok(firstLines.some((line) => /^ 360px .*, 1 detail card \(closed in the file, opened in turn\), page \d+px tall$/.test(line)), first.stdout);
    entryOf(first, "cards", cardTable, "div.doc-table-wrap", lineOfDrawn(cardTable)); // the table in the card pictured
    assert.ok(firstLines.some((line) => line.startsWith(`INFO       table-scrolls: doc.html:${lineOfDrawn(cardTable)} `)), `the table in the card scrolls\n${first.stdout}`);
    assert.ok(firstLines.some((line) => /^ {11}1024px: \[detail card "宽表"\] of 13 columns, /.test(line)), `its columns out of sight, said in the card\n${first.stdout}`);
    // Named, the table in the card is pictured as the card shows it; with --tiles, the card is.
    const namedCard = await drawn("--blocks", cardTable);
    entryOf(namedCard, "blocks", cardTable, "div.doc-table-wrap", lineOfDrawn(cardTable));
    const tiledCard = await drawn("--tiles");
    const tiledList = listingOf(tiledCard.stdout);
    assert.ok(tiledList.sections.flatMap(({ items }) => items).some(({ names, text: words }) => names[0].endsWith("/tiles/<width>-card<i>-<n>.png") && /^each detail card, opened in turn as the window shows it, its content scrolled a tile at a time: card1 "宽表" \d+ tiles$/.test(words)), tiledCard.stdout);
    assert.ok((await fs.readdir(path.join(tiledList.folder, "tiles"))).includes("360-card1-01.png"));
    // A new Sheet area of three panels: pictured as it opens and with each other panel, the blocks it
    // holds seen; the run after, nothing changed.
    await fs.writeFile(drawnFile, (await fs.readFile(drawnFile, "utf8")).replace(/(\n[ \t]*<p[^>]*>各列的意思)/, `
      <section class="doc-sheet-shell" data-doc-sheets="parts"><div class="doc-sheet-tabs"><button class="doc-sheet-tab" type="button" data-sheet-tab="a">甲</button><button class="doc-sheet-tab" type="button" data-sheet-tab="b">乙</button><button class="doc-sheet-tab" type="button" data-sheet-tab="c">丙</button></div>
        <div data-doc-sheet="a"><p>甲页的一段</p></div><div data-doc-sheet="b"><p>乙页的一段</p></div><div data-doc-sheet="c"><p>丙页的一段</p></div></section>$1`));
    const sheetRun = await drawn();
    const sheetLines = linesOf(sheetRun);
    const area = /<section class="doc-sheet-shell"[^>]*data-block-id="([^"]+)"/.exec(await fs.readFile(drawnFile, "utf8"))?.[1];
    const areaLine = (await fs.readFile(drawnFile, "utf8")).split("\n").findIndex((line) => line.includes(`data-block-id="${area}"`)) + 1;
    const areaEntry = entryOf(sheetRun, "changed", area, "section.doc-sheet-shell", areaLine);
    assert.match(areaEntry.text, /^doc\.html:\d+ \S+ section\.doc-sheet-shell \(with the \d+ changed blocks it holds, pictured again with each Sheet panel or detail card that holds one\)$/);
    assert.deepEqual(areaEntry.names, [`${areaEntry.folder}/changed/{1024,736,360}-${area}.png`, `${areaEntry.folder}/changed/{1024,736,360}-${area}-sheet2.png`, `${areaEntry.folder}/changed/{1024,736,360}-${area}-sheet3.png`], sheetRun.stdout);
    const after = await drawn();
    assert.ok(listingOf(after.stdout).sections.map(({ title }) => title).some((line) => /^The cards \(.*\): no block changed since the last look, nor the document's own <script> or <style>$/.test(line)), `the panels' blocks seen\n${after.stdout}`);
    // The report's style changed, no block: the cards, said so.
    await fs.writeFile(drawnFile, (await fs.readFile(drawnFile, "utf8")).replace(".tl-year { white-space: nowrap; }", ".tl-year { white-space: nowrap; font-weight: 600; }"));
    const namedAfterStyle = linesOf(await drawn("--blocks", cardTable));
    const leftLine = namedAfterStyle.find((line) => line.startsWith("Not pictured by this run"));
    assert.ok(leftLine && namedAfterStyle.indexOf(leftLine) < namedAfterStyle.findIndex((line) => /^(?:要看的图|这次拍的图)（/.test(line)) && namedAfterStyle.at(-3).startsWith("图在 "), namedAfterStyle.join("\n"));
    assert.match(leftLine, new RegExp(`^Not pictured by this run, which pictures the blocks named alone: \\d+ cards the change of the document's own <script> or <style> since the last look may draw again \\(.*div\\.tl ${timeline}.*\\)\\. gallery qa drawn pictures them\\.$`), leftLine);
    const styled = await drawn();
    assert.ok(listingOf(styled.stdout).sections.some(({ title }) => /^The cards, not changed themselves \(.*\): the document's own <script> or <style> changed since the last look, which may draw any of them$/.test(title)), styled.stdout);
    entryOf(styled, "cards", timeline, "div.tl", lineOfDrawn(timeline));
    // A detail card in the middle panel of the three is opened with that panel shown (in the panel
    // the Sheets were left on, it drew nothing: never opened, every run not verified, no baseline),
    // and a card holding a Sheet area has its other panel shown while it is open: a paragraph
    // changed there is pictured, not taken as seen unshown; the run after, nothing changed.
    await fs.writeFile(drawnFile, (await fs.readFile(drawnFile, "utf8"))
      .replace(/(乙页的一段<\/p>)/, `$1<p>见<a href="#mid-card">乙页的卡片</a>。</p><dialog id="mid-card"><h2>乙页的卡片</h2><p>卡片里的一段</p></dialog>`)
      .replace(/(\n[ \t]*<p[^>]*>各列的意思)/, `
      <p>另见<a href="#sheet-card">分页的卡片</a>。</p>
      <dialog id="sheet-card"><h2>分页的卡片</h2><section class="doc-sheet-shell" data-doc-sheets="inner"><div class="doc-sheet-tabs"><button class="doc-sheet-tab" type="button" data-sheet-tab="x">一</button><button class="doc-sheet-tab" type="button" data-sheet-tab="y">二</button></div>
        <div data-doc-sheet="x"><p>卡片的第一页</p></div><div data-doc-sheet="y"><p>卡片的第二页</p></div></section></dialog>$1`));
    const carded = await drawn();
    assert.equal(carded.code, 0, carded.stdout + carded.stderr);
    assert.ok(!/UNVERIFIED/.test(carded.stdout), carded.stdout);
    assert.ok(linesOf(carded).some((line) => /^ 360px .*, 3 detail cards \(closed in the file, opened in turn\), page \d+px tall$/.test(line)), carded.stdout);
    assert.ok(listingOf((await drawn()).stdout).sections.some(({ title }) => /^The cards \(.*\): no block changed since the last look/.test(title)), "the baseline written");
    await fs.writeFile(drawnFile, (await fs.readFile(drawnFile, "utf8")).replace("卡片的第二页", "卡片的第二页，改过"));
    const inner = /<p[^>]*data-block-id="([^"]+)"[^>]*>卡片的第二页，改过/.exec(await fs.readFile(drawnFile, "utf8"))?.[1];
    assert.ok(inner);
    const innerRun = await drawn();
    assert.ok(listingOf(innerRun.stdout).sections.flatMap(({ items }) => items).some(({ names, text: words }) => names[0].endsWith(`/changed/{1024,736,360}-${inner}.png`) && words.includes(` ${inner} p`)), innerRun.stdout);
    assert.ok(listingOf((await drawn()).stdout).sections.some(({ title }) => /^The cards \(.*\): no block changed since the last look/.test(title)), "the paragraph seen");
  }

  // A table's code broken between its names at 360px, in its last row (found reviewing a test
  // of the skill with Agents, 2026-10-29): Chrome's first frame after the jump inkOf scrolls by left that code out
  // of qa's picture of the table (one picture in four; the words beside it drawn where the broken code
  // put them), and the next frame drew it. inkOf waits SCROLL_FRAMES frames after a scroll that moved
  // its element before it is measured and pictured; every code span of the last row of each table has
  // ink in its 360px picture.
  await createReportFromStarter("codebreak", "代码断行", "窄表格里的行内代码", { directory: reports });
  const breakFile = path.join(reports, "codebreak", "doc.html");
  const breakRows = [
    ["刷新后内容没了", "本地存储服务没有运行，文档只在内存里", "用 <code>npm run dev</code> 或 <code>npm run preview</code> 打开；访问 <code>/__local/status</code> 应返回 <code>{\"ok\":true}</code>"],
    ["改了 <code>server/local-store.js</code> 没有生效", "改这个文件会让 Vite 重启，第一次可能要一分钟", "看终端有没有出现“server restarted.”，或者 touch 一下 <code>vite.config.js</code>"],
    ["控制台 <code>import('/src/x.js')</code> 读到的状态是空的", "Vite 热更新后模块网址带 <code>?t=…</code>，直接 import 得到另一份模块实例", "使用 <code>window.__demo</code>，或从 <code>fetch('/src/app/main.js')</code> 的文本里找真实网址"],
    ["颜色显示成透明", "代码用了还没抽取的 CSS 变量", "运行 <code>node scripts/extract-vars.mjs</code>"],
    ["动画、延时类检查偶尔失败", "窗口在后台时，浏览器对计时器限流，<code>requestAnimationFrame</code> 也不运行", "让窗口回到前台再跑；代码里不要依赖 <code>requestAnimationFrame</code>"],
    ["读不到配置", "<code>GALLERY_TEST_PORTS</code> 和 <code>process.env.NODE_ENV</code> 没设", "设好 <code>my_long_snake_case_name</code> 再跑 <code>getElementById</code>"],
  ];
  const breakTable = `<div class="doc-table-wrap"><table class="doc-table"><thead><tr><th>现象</th><th>原因</th><th>办法</th></tr></thead><tbody>${breakRows.map((cells) => `<tr>${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  await fs.writeFile(breakFile, (await fs.readFile(breakFile, "utf8")).replace(/\n[ \t]*<!-- Starter content:[^\n]*-->\n[ \t]*<section\b[^>]*\sdata-doc-placeholder\b[\s\S]*?<\/section>/, `
    <section><h2>在本地跑起来</h2><ol class="doc-flow">${["<code>npm install</code>", "<code>npm run dev</code>", "<code>http://localhost:5180</code>"].map((step, at) => `<li><p><strong>第 ${at + 1} 步</strong></p><p>${step}</p></li>`).join("")}</ol></section>
    ${[1, 2, 3].map((at) => `<section><h2>常见现象 ${at}</h2>${breakTable}</section>`).join("\n    ")}`));
  if (findBrowser()) {
    const broken = await command("qa", ["codebreak"]);
    assert.equal(broken.code, 0, broken.stdout + broken.stderr);
    const tableIds = [...(await fs.readFile(breakFile, "utf8")).matchAll(/<div class="doc-table-wrap"[^>]*data-block-id="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(tableIds.length, 3, "the three tables");
    const { default: puppeteer } = await import("puppeteer-core");
    const browser = await puppeteer.launch({ executablePath: findBrowser(), headless: true });
    try {
      const page = await browser.newPage();
      await page.setViewport({ width: 360, height: 900 });
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
      await page.goto(pathToFileURL(path.join(root, "reports", "exports", "codebreak.html")).href, { waitUntil: "load" });
      await settle(page, { timeout: 20_000 });
      // inkOf, as qa calls it, returns only after SCROLL_FRAMES frames drawn after its scroll.
      const ink = await page.evaluateHandle(`(${inkOf.toString()})`);
      const framesAfter = await page.evaluate(async (inkOfPage, selector, frames) => {
        let drawn = null;
        const scroll = Element.prototype.scrollIntoView;
        Element.prototype.scrollIntoView = function (...args) {
          scroll.apply(this, args);
          drawn = 0;
          const tick = () => {
            drawn += 1;
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        };
        scrollTo(0, 0);
        const found = await inkOfPage({ selector, margin: 8, frames });
        Element.prototype.scrollIntoView = scroll;
        return found?.clip ? drawn : null;
      }, ink, `[data-block-id="${tableIds.at(-1)}"]`, SCROLL_FRAMES);
      assert.ok(SCROLL_FRAMES >= 1 && framesAfter >= SCROLL_FRAMES, `frames drawn after the scroll before the picture: ${framesAfter} (SCROLL_FRAMES ${SCROLL_FRAMES})`);
      // Each table's last row: its code's boxes from the table's frame, and the code's color.
      const spans = await page.evaluate((ids) => ids.map((id) => {
        const wrap = document.querySelector(`[data-block-id="${id}"]`);
        const at = wrap.getBoundingClientRect();
        return {
          size: [Math.round(at.width), Math.round(at.height)],
          codes: [...wrap.querySelectorAll("tbody tr:last-child code")].map((code) => ({
            text: code.textContent,
            color: getComputedStyle(code).color.match(/\d+/g).slice(0, 3).map(Number),
            boxes: [...code.getClientRects()].map((box) => ({ x: box.left - at.left, y: box.top - at.top, width: box.width, height: box.height })),
          })),
        };
      }), tableIds);
      const codebreakBase = path.join(root, "reports", ".gallery", "qa", "codebreak");
      const codebreakRun = (await fs.readdir(codebreakBase)).filter((name) => /^\d{4}-/.test(name)).sort().at(-1); // the newest run's folder
      for (const [index, id] of tableIds.entries()) {
        const picture = path.join(codebreakBase, codebreakRun, "cards", `360-${id}.png`);
        const { size, codes } = spans[index];
        assert.equal(codes.length, 4, "four code spans in the last row");
        // The picture is the frame with INK_MARGIN around it; in it, pixels of the code's color over
        // each box its code draws.
        const inked = await page.evaluate(async (data, codes, margin) => {
          const image = new Image();
          image.src = `data:image/png;base64,${data}`;
          await image.decode();
          const canvas = document.createElement("canvas");
          [canvas.width, canvas.height] = [image.width, image.height];
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0);
          return { width: image.width, height: image.height, codes: codes.map(({ text, color, boxes }) => ({ text, ink: boxes.map(({ x, y, width, height }) => {
            const pixels = context.getImageData(Math.round(x + margin), Math.round(y + margin), Math.max(1, Math.round(width)), Math.max(1, Math.round(height))).data;
            let count = 0;
            for (let at = 0; at < pixels.length; at += 4) if (Math.abs(pixels[at] - color[0]) + Math.abs(pixels[at + 1] - color[1]) + Math.abs(pixels[at + 2] - color[2]) < 90) count += 1;
            return count;
          }) })) };
        }, (await fs.readFile(picture)).toString("base64"), codes, INK_MARGIN);
        assert.deepEqual([inked.width, inked.height], [size[0] + 2 * INK_MARGIN, size[1] + 2 * INK_MARGIN], `${picture}: the frame and its margin`);
        for (const { text, ink: counts } of inked.codes) assert.ok(counts.length > 1 && counts.every((count) => count >= 5), `${picture}: the code "${text}" broken over ${counts.length} lines, its ink on each: ${counts.join(", ")}`);
      }
    } finally {
      await browser.close();
    }
  }

  // gallery open's part of the baseline (src/cli/qa-baseline.mjs previewBaseline, as the
  // command calls it, in this studio): none for a report still holding the starter's section; with
  // none, one of the report as it is (from "preview"); never over one there is; and, for a report
  // exported before, one of the text its export was made from, not of the file changed since.
  const previewPart = async (slug) => {
    const module = pathToFileURL(path.join(projectRoot, "src", "cli", "qa-baseline.mjs")).href;
    const code = `import fs from "node:fs/promises"; import { previewBaseline } from ${JSON.stringify(module)}; console.log(await previewBaseline(${JSON.stringify(slug)}, await fs.readFile(process.argv[1], "utf8")));`;
    const { stdout } = await run(process.execPath, ["--input-type=module", "-e", code, path.join(reports, slug, "doc.html")], { cwd: projectRoot, env: { ...process.env, GALLERY_WORKSPACE: path.join(root, "reports") } });
    return stdout.trim() === "true";
  };
  const recordOf = (slug) => path.join(root, "reports", ".gallery", "qa", slug, "blocks.json");
  await createReportFromStarter("fresh", "新的报告", "还没写", { directory: reports });
  const freshFile = path.join(reports, "fresh", "doc.html");
  assert.equal(await previewPart("fresh"), false, "the starter: nothing to compare with");
  assert.equal(await fs.access(recordOf("fresh")).then(() => true, () => false), false);
  const written = (await fs.readFile(freshFile, "utf8")).replace(/\n[ \t]*<!-- Starter content:[^\n]*-->\n[ \t]*<section\b[^>]*\sdata-doc-placeholder\b[\s\S]*?<\/section>/, `
    <section class="doc-section" data-block-id="sa"><h2 data-block-id="ha">正文</h2><p data-block-id="pa">一段</p></section>`);
  await fs.writeFile(freshFile, written);
  const startedAt = Date.now();
  assert.equal(await previewPart("fresh"), true);
  const fresh = readBaseline(await fs.readFile(recordOf("fresh"), "utf8"));
  assert.deepEqual([Object.keys(fresh.blocks), fresh.from, fresh.time >= startedAt], [["sa", "ha", "pa"], "preview", true]);
  await fs.writeFile(freshFile, written.replace("一段", "改过的一段"));
  assert.equal(await previewPart("fresh"), false, "one there is stays");
  assert.deepEqual(readBaseline(await fs.readFile(recordOf("fresh"), "utf8")), fresh);
  // A report the preview shows before its first export (gallery new's server left alone, or
  // gallery import's): its blocks have no ids yet, and are kept by their markup, which the ids the
  // export gives them do not change (adoptIdless): nothing taken as changed that was not.
  await createReportFromStarter("draft", "草稿", "还没交", { directory: reports });
  const draftFile = path.join(reports, "draft", "doc.html");
  await fs.writeFile(draftFile, (await fs.readFile(draftFile, "utf8")).replace(/\n[ \t]*<!-- Starter content:[^\n]*-->\n[ \t]*<section\b[^>]*\sdata-doc-placeholder\b[\s\S]*?<\/section>/, `
    <section><h2>正文</h2><p>一段</p><figure class="doc-image"><img src="data:image/png;base64,AAAA" alt=""></figure></section>`));
  assert.equal(await previewPart("draft"), true);
  const draft = readBaseline(await fs.readFile(recordOf("draft"), "utf8"));
  assert.deepEqual([draft.blocks, draft.unseen, draft.idless.length >= 4, draft.from], [{}, [], true, "preview"]);
  const draftIn = blocksOf(handedInSource(await fs.readFile(draftFile, "utf8"), {}).text);
  const draftSeen = adoptIdless(draftIn, draft);
  const figureId = [...draftIn].find(([, { tag }]) => tag === "figure.doc-image")[0];
  assert.deepEqual([Object.keys(draftSeen.blocks).length, draftSeen.idless, draftSeen.unseen], [draftIn.size, undefined, [figureId]]);
  assert.deepEqual(blocksToPicture(draftIn, draftSeen).ids, [figureId], "the cards, as a first look: no block changed");
  // "shown" was exported (its text kept); changed since, with no baseline, its baseline is the text
  // its export was made from.
  await fs.rm(recordOf("shown"), { force: true });
  const shownKept = await fs.readFile(path.join(root, "reports", ".gallery", "qa", "shown", "exported.html"), "utf8");
  await fs.writeFile(shownFile, (await fs.readFile(shownFile, "utf8")).replace(/(<h2[^>]*>)表格<\/h2>/, "$1改过的表格</h2>"));
  assert.equal(await previewPart("shown"), true);
  const shownBaseline = readBaseline(await fs.readFile(recordOf("shown"), "utf8"));
  assert.deepEqual([shownBaseline.blocks, shownBaseline.from], [baselineOf(shownKept, { from: "export", time: 0 }).blocks, "export"]);
  assert.notDeepEqual(shownBaseline.blocks, baselineOf(await fs.readFile(shownFile, "utf8"), { from: "export", time: 0 }).blocks, "not the file as it is now");

  // The workspace's export's part (the page's 导出报告, POST /__gallery/workspace/export: src/server/export.mjs
  // exportOffline, as the preview server runs it, in this workspace): gallery export's rule, by its
  // function (exportBaselines). Exported a first time, the text it was made from is kept (handed in:
  // its blocks given ids) and no baseline written (no export before it); edited and exported again,
  // with no baseline, one of the text the first export was made from, from "export", never of the
  // file as it is now, and the new text kept for the next.
  const workspaceExport = async (slug) => {
    const modules = ["server/export.mjs", "editor/service.mjs"].map((file) => JSON.stringify(pathToFileURL(path.join(projectRoot, "src", file)).href));
    const code = `import { exportOffline } from ${modules[0]}; import { createEditService } from ${modules[1]}; const edits = createEditService({ stateDirectory: process.argv[1] }); const { problems, refused } = await exportOffline(edits, ${JSON.stringify(slug)}); await edits.stored(); console.log(JSON.stringify({ problems, refused })); process.exit(0);`;
    const { stdout } = await run(process.execPath, ["--input-type=module", "-e", code, path.join(root, "reports", ".gallery", "state")], { cwd: projectRoot, env: { ...process.env, GALLERY_WORKSPACE: path.join(root, "reports") }, timeout: 300_000 });
    return JSON.parse(stdout.trim().split(/\r?\n/).at(-1));
  };
  await createReportFromStarter("handed", "页面导出的报告", "从页面导出", { directory: reports });
  const handedFile = path.join(reports, "handed", "doc.html");
  await fs.writeFile(handedFile, (await fs.readFile(handedFile, "utf8")).replace(/\n[ \t]*<!-- Starter content:[^\n]*-->\n[ \t]*<section\b[^>]*\sdata-doc-placeholder\b[\s\S]*?<\/section>/, `
    <section><h2>正文</h2><p>第一段</p><p>第二段</p></section>`));
  assert.deepEqual(await workspaceExport("handed"), { problems: [] });
  const handedKept = path.join(root, "reports", ".gallery", "qa", "handed", "exported.html");
  const firstText = await fs.readFile(handedFile, "utf8");
  assert.ok(/data-block-id=/.test(firstText), "handed in: its blocks given ids");
  assert.equal(await fs.readFile(handedKept, "utf8"), firstText, "the text the export was made from, kept");
  assert.equal(await fs.access(recordOf("handed")).then(() => true, () => false), false, "no export before it: no baseline");
  await fs.writeFile(handedFile, firstText.replace("第二段", "改过的第二段"));
  assert.deepEqual(await workspaceExport("handed"), { problems: [] });
  const handedBaseline = readBaseline(await fs.readFile(recordOf("handed"), "utf8"));
  assert.deepEqual([handedBaseline.blocks, handedBaseline.from], [baselineOf(firstText, { from: "export", time: 0 }).blocks, "export"], "the baseline: the text the export before was made from");
  assert.notDeepEqual(handedBaseline.blocks, baselineOf(await fs.readFile(handedFile, "utf8"), { from: "export", time: 0 }).blocks, "not the file as it is now");
  assert.equal(await fs.readFile(handedKept, "utf8"), await fs.readFile(handedFile, "utf8"), "the new text kept for the next");

  // A package a report uses changed since the last look, as gallery qa runs: its style alone, the
  // instance pictured into changed/ and the package named; its style and a paragraph, both.
  await fs.cp(path.join(projectRoot, "tests", "fixtures", "components", "local", "strip"), path.join(reports, "components", "local", "strip"), { recursive: true });
  await createReportFromStarter("packaged", "用了组件的报告", "一个指标条", { directory: reports });
  const packagedFile = path.join(reports, "packaged", "doc.html");
  const stripExample = await fs.readFile(path.join(reports, "components", "local", "strip", "example.html"), "utf8");
  await fs.writeFile(packagedFile, (await fs.readFile(packagedFile, "utf8")).replace(/\n[ \t]*<!-- Starter content:[^\n]*-->\n[ \t]*<section\b[^>]*\sdata-doc-placeholder\b[\s\S]*?<\/section>/, `
    <section class="doc-section"><h2>指标</h2><p>这一周的数。</p>
${stripExample}
    </section>`));
  if (findBrowser()) {
    const packaged = () => command("qa", ["packaged", "--pictures"]);
    const changedIn = async () => { // the pictures of the newest run (its own folder)
      const base = path.join(reports, ".gallery", "qa", "packaged");
      const last = (await fs.readdir(base).catch(() => [])).filter((name) => /^\d{4}-/.test(name)).sort().at(-1);
      return last ? (await fs.readdir(path.join(base, last, "changed")).catch(() => [])).filter((name) => name.endsWith(".png")) : [];
    };
    const firstLook = await packaged();
    assert.equal(firstLook.code, 0, firstLook.stdout + firstLook.stderr);
    assert.ok(readBaseline(await fs.readFile(recordOf("packaged"), "utf8")).packages?.["local/strip"], "the baseline holds the package's stamp");
    const style = path.join(reports, "components", "local", "strip", "style.css");
    await fs.appendFile(style, '[data-doc-component="local/strip"] dt { font-weight: 600; }\n');
    const restyledLook = await packaged();
    assert.equal(restyledLook.code, 0, restyledLook.stdout + restyledLook.stderr);
    const stripId = [...blocksOf(await fs.readFile(packagedFile, "utf8"))].find(([, { package: id }]) => id === "local/strip")[0];
    assert.match(restyledLook.stdout, /\n {2}The instances of a custom block changed since the last look \(local\/strip\):\n/, restyledLook.stdout);
    assert.ok((await changedIn()).some((name) => name.includes(stripId)), `its instance in changed/: ${(await changedIn()).join(", ")}`);
    await fs.appendFile(style, '[data-doc-component="local/strip"] dd { font-weight: 600; }\n');
    await fs.writeFile(packagedFile, (await fs.readFile(packagedFile, "utf8")).replace("这一周的数。", "这一周的数，改过。"));
    const bothLook = await packaged();
    assert.equal(bothLook.code, 0, bothLook.stdout + bothLook.stderr);
    const paragraphId = [...blocksOf(await fs.readFile(packagedFile, "utf8"))].find(([, { tag, package: id }]) => tag === "p" && !id)[0];
    assert.ok([stripId, paragraphId].every((id) => bothLook.stdout.includes(id)) && (await changedIn()).some((name) => name.includes(stripId)) && (await changedIn()).some((name) => name.includes(paragraphId)), bothLook.stdout);
  }
} finally {
  process.env.GALLERY_DEFAULT_WORKSPACE = previousHome;
  await fs.rm(root, { recursive: true, force: true, maxRetries: 5 });
}

console.log(`Checked gallery qa and gallery open: the findings' levels and the kit's notes (read alike by both), a drawing's text scaled small and a figure's words past their box and words or marks cut at the bottom of a box, an export's sha256 of its report.html and when it is stale, the blocks pictured (by rank, what the Agent draws first, a card in another folded into it, the moved first with its neighbours' edges, of two swapped the smaller, the changed and the cards not changed in groups, every card when the script or style changed) and what is kept of them for the next run (however many moved), the column each cell ends in, an address named, a finding's place in report.html (block id, card, table, words and which of equal ones, id, section), the text printed (pictures first, the verdict last), the command lines, the preview's note of the kit's layout notes that fail, said in Chinese, the baseline the export (gallery export's and the workspace's, one rule) and the preview write (none of a starter, the text the export before was made from, its cards unseen, blocks without ids known by their markup), a report built to fail (${looked}: judged by its sha256, not its times, exported first when it had none or not of its file, the blocks pictured, then the one changed, those named, the page and a Sheet panel in tiles and a moved one, each run in its own folder, the baseline kept while it fails, a path past the window located by its words) and one built to warn (its tables' columns and rows, none cut by a list's or paragraphs' box in a cell, a laptop's window, labels over each other, code and formulas scrolling in their frames (info as the author or the reader chose, or in a closed disclosure), a code title cut, a kit note that is info, the tables that scroll by name and direction, the kit's notes and fading edges of its frames) and one of what an Agent draws (a whole block pictured with the dots past its box, its words past their column on a phone, a detail card opened, its table checked and pictured, a new Sheet area pictured with each panel and then seen, its style changed alone, a detail card in a panel not shown first opened, a Sheet in a detail card shown panel by panel and what changed there pictured).`);
