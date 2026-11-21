import "./workspace-env.mjs";
import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { keyOf, pairsOf } from "../../src/cli/component.mjs";
import { answered, laidAnew, laidAnewOf, pageOfMarkup, wayBackSaid } from "../../src/cli/component-look.mjs";
import { changesOf, chosenInstance, cutOffSaid, dragPath, dropScratch, dropStale, fallbackSaid, gestureOf, instancesIn, listen, madeSaid, nothingSaid, OPEN_IT, scratchCopy, stepOf, stepsOf, stoppedTrial, takenAgain, takenBy, toldBy, trialSaid, untilTaken, withoutIds, wordsDiffer, wordsIn, writtenLines, writtenOtherwise, writtenWords } from "../../src/cli/component-try.mjs";
import { unopenedSaid } from "../../src/cli/qa.mjs";
import { TRY_SYNOPSIS } from "../../src/cli/usage.mjs";
import { HOLD, QUIET } from "../../src/editor/settle.mjs";
import { FIRST_LOOK } from "../../src/server/catalog-watch.mjs";
import { projectRoot } from "../../src/shared/paths.mjs";
import { portIsFree, processRuns } from "../../src/shared/preview-server.mjs";
import { readCatalog } from "../../src/shared/component-catalog.mjs";
import { documentDirectory, documentFiles } from "../../src/shared/workspace.mjs";
import { findBrowser } from "../../src/transfer/browser.mjs";

// gallery block try (src/cli/component-try.mjs): what a reader does on an instance of a document,
// made in the page an Agent opens, on a scratch copy of the document, and what it wrote; and gallery
// component check --documents (src/cli/component-look.mjs lookAtDocuments). Without a browser: the
// command line read as the command reads it (--key's, --type's and --select's two arguments, one
// gesture at a time, --to with --drag, --then after any, --steps alone, a key a browser names, --keep
// with try alone), a steps file read (a list of steps, each one gesture as the options name it, what is
// no step and what is no file), a mistake in either said with try's lines of the usage, the instance a
// document names (the only one, by its id, by its package's, one in another's slot said with where it
// stands), a drag's last move the one that comes onto its target, what tells one file from another,
// part by part, the lines themselves, and outside them, two pages' words and fields told apart and
// weighed against what a write put in or took out (writtenWords, writtenOtherwise), the check's way back
// of a page's third instance said of it and not of one in the first's slot (wayBackSaid), the
// scratch copy (its files, a slug no document has, taken away with what the edit state keeps of it, one
// left by a trial killed taken by the next an hour on), when the server has told its pages of the writes
// before (toldBy) and taken a package as the disk holds it (takenBy), how long a page in its fallback is
// waited for and what is said of the wait (untilTaken), what a page says, heard on a stand-in tab and
// forgotten once the page is taken again (listen, takenAgain), why an instance shows what it holds,
// read-only (fallbackSaid), a package gallery.json turns off, and what a trial says and exits with
// (trialSaid, cutOffSaid of one cut off, nothingSaid of gestures that wrote nothing, madeSaid of the
// steps made before a mistake in a later one). Where the machine
// has a browser, run as a user runs it in a workspace of its own, its server started by the command on a
// port of GALLERY_TEST_PORTS (else 4200-4260) and stopped in the end, doc.html read after each trial
// made on a scratch copy and found as it was to the byte, and no copy left: the official examples'
// board, a card dragged to another column (the line of its row changed in the tasks part, said line by
// line, nothing else, one undo giving the copy back, a fresh page reading it back), and with --keep on
// doc.html itself; the scorecard, a press and a key on a dot (one line of its JSON), the press right
// after its package was copied in, which its page shows as one of no package until the server takes it;
// a list that cancels dragover and not dragenter (tests/fixtures/component-check/local/dragover-only),
// whose drag drops nothing, exit 1 and nothing written, and passes once it cancels dragenter too; a
// press nothing answers, exit 1; a selector that finds nothing in the instance, exit 2; a drag onto the
// card it drags, exit 2; the counter of tests/fixtures/component-try/, a press its pointerdown answers,
// a key on what takes no focus, a press a box drawn over it takes, a Ctrl+Z it keeps from the page while
// its button has the focus, an undo it writes over again, a component that draws nothing and throws, its
// console's words said, and one that throws as it mounts, its instance read-only, a failure in the
// console's words; its kit.js that does not parse, a failure in the words of its SyntaxError at their
// line; its mount throwing, mended while the trial waits on a manifest half written, the page taken
// again and passing; the counter in a slot of local/brief, listed with where it stands and tried; the
// habit of tests/fixtures/component-try/, words typed in its field through an input method then Enter,
// ASCII words with no Enter, which write nothing, an option chosen, one it has not and what is no
// <select> (exit 2), words typed in its text part, steps of all of these in one page with a step that
// writes nothing, and one that writes what no mount reads, which a fresh page shows otherwise; one that
// writes as the page comes to edit; one whose field writes as it loses the focus, two writes of one
// step undone by two Ctrl+Z, and words left in the field, which leaving it writes, undone with the
// step before and a note; a line shown and never written, a note; a mistake at a step after one wrote,
// with --keep; steps files that do not read; check --documents of the scorecard, its instances in three documents, one
// failing at its line, one in a slot, no document written; and with --keep, the board's drag with
// someone else writing the file as the drag's write lands (exit 3, theirs kept) and with the server gone
// then (exit 3, the write kept).

const run = promisify(execFile);
const bin = path.join(projectRoot, "src", "cli", "bin.mjs");
const root = fs.mkdtempSync(path.join(os.tmpdir(), "gallery-component-try-"));
const previousData = process.env.GALLERY_DATA_DIR;
process.env.GALLERY_DATA_DIR = path.join(root, 'data');
const workspace = path.join(root, "workspace");
const [low, high] = (/^(\d+)-(\d+)$/.exec(process.env.GALLERY_TEST_PORTS ?? "") ?? [0, 4200, 4260]).slice(1).map(Number);
const env = { GALLERY_NO_PREVIEW: "1", GALLERY_NO_BROWSER: "1", GALLERY_NO_UPDATE_CHECK: "1" };
const gallery = async (...args) => {
  try {
    const { stdout, stderr } = await run(process.execPath, [bin, "--workspace", workspace, ...args], { cwd: root, env: { ...process.env, GALLERY_DEFAULT_WORKSPACE: workspace, ...env }, maxBuffer: 1 << 24, timeout: 240_000 });
    return { code: 0, stdout, stderr };
  } catch (error) {
    if (typeof error.code !== "number") throw error;
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
};
// The command as it runs, `heard(line)` called with each line it prints as it prints it.
const watched = (args, heard) => new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [bin, "--workspace", workspace, ...args], { cwd: root, env: { ...process.env, GALLERY_DEFAULT_WORKSPACE: workspace, ...env } });
  const timer = setTimeout(() => child.kill(), 240_000);
  const out = { stdout: "", stderr: "", rest: "" };
  child.stdout.setEncoding("utf8").on("data", (chunk) => {
    out.stdout += chunk;
    const told = (out.rest + chunk).split(/\r?\n/);
    out.rest = told.pop();
    for (const line of told) heard(line);
  });
  child.stderr.setEncoding("utf8").on("data", (chunk) => { out.stderr += chunk; });
  child.on("error", reject);
  child.on("close", (code) => {
    clearTimeout(timer);
    resolve({ code, stdout: out.stdout, stderr: out.stderr });
  });
});
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const fileOf = (slug) => path.join(workspace, slug, "doc.html");
const read = (slug) => fs.readFileSync(fileOf(slug), "utf8");
const fixture = (...at) => path.join(projectRoot, "tests", "fixtures", ...at);
let server = null; // the pid of the server the command started, stopped in the end

try {
  // --key's, --type's and --select's second argument taken out, for the selector to be the option's
  // value; a key is a browser's name of one, alone or after modifiers; one gesture at a time.
  assert.deepEqual(keyOf(["try", "a", "--key", ".dot", "Enter", "--keep"]), { argv: ["try", "a", "--key", ".dot", "--keep"], key: "Enter" });
  assert.deepEqual(keyOf(["try", "a", "--key=.dot", "Shift+Tab"]), { argv: ["try", "a", "--key=.dot"], key: "Shift+Tab" });
  assert.deepEqual(keyOf(["try", "a", "--press", ".dot"]), { argv: ["try", "a", "--press", ".dot"], key: null });
  for (const argv of [["try", "a", "--key", ".dot"], ["try", "a", "--key", ".dot", "--keep"], ["try", "a", "--key", ".dot", "--", "Enter"]]) assert.throws(() => keyOf(argv), /--key takes a selector and a key/, argv.join(" "));
  assert.deepEqual(pairsOf(["try", "a", "--type", ".name", "多喝水", "--then", "Enter"]), { argv: ["try", "a", "--type", ".name", "--then", "Enter"], seconds: { "--type": "多喝水" } });
  assert.deepEqual(pairsOf(["try", "a", "--select=.unit", "杯", "--keep"]), { argv: ["try", "a", "--select=.unit", "--keep"], seconds: { "--select": "杯" } });
  assert.deepEqual(pairsOf(["try", "a", "--type", ".n", "-1"]).seconds, { "--type": "-1" }, "words that are no option");
  assert.throws(() => pairsOf(["try", "a", "--type", ".name"]), /--type takes a selector and the words to type/);
  assert.throws(() => pairsOf(["try", "a", "--select", ".unit", "--keep"]), /--select takes a selector and an option/);
  const values = (entries) => new Map(Object.entries(entries));
  assert.deepEqual(await gestureOf(values({ "--key": ".dot" }), { "--key": "Shift+Tab" }), { kind: "key", at: ".dot", keys: ["Shift", "Tab"], key: "Shift+Tab" });
  assert.deepEqual(await gestureOf(values({ "--key": ".dot" }), { "--key": "+" }), { kind: "key", at: ".dot", keys: ["+"], key: "+" });
  assert.deepEqual(await gestureOf(values({ "--drag": ".card", "--to": ".list" })), { kind: "drag", at: ".card", to: ".list" });
  assert.deepEqual(await gestureOf(values({ "--type": ".name", "--then": "Enter" }), { "--type": "多喝水" }), { kind: "type", at: ".name", text: "多喝水", then: { key: "Enter", keys: ["Enter"] } });
  assert.deepEqual(await gestureOf(values({ "--select": ".unit" }), { "--select": "杯" }), { kind: "select", at: ".unit", value: "杯" });
  // --replace selects what the field holds before the words go in: with --type alone, in a step as "replace": true.
  assert.deepEqual(await gestureOf(values({ "--type": ".name", "--then": "Enter" }), { "--type": "多喝水" }, true), { kind: "type", at: ".name", text: "多喝水", replace: true, then: { key: "Enter", keys: ["Enter"] } });
  assert.deepEqual(await stepOf({ type: [".name", "交通"], replace: true }), { kind: "type", at: ".name", text: "交通", replace: true });
  assert.equal("replace" in await stepOf({ type: [".name", "交通"] }), false, "only where it is asked for");
  await assert.rejects(gestureOf(values({ "--press": ".add" }), {}, true), /^UsageError: --replace goes with --type: it selects what the field holds before the words go in\.$/);
  await assert.rejects(stepOf({ press: ".add", replace: true }, "step 1 of steps.json"), /^UsageError: Step 1 of steps\.json: "replace" goes with "type": it selects what the field holds before the words go in\.$/);
  await assert.rejects(stepOf({ type: [".name", "x"], replace: "yes" }, "step 1 of steps.json"), /"replace" is true: "replace": true selects what the field holds before the words go in\./);
  await assert.rejects(gestureOf(values({ "--steps": "steps.json" }), {}, true), /^UsageError: --steps <file> holds every gesture: --replace goes in a step of it, as \{ "type": \[".name", "新名字"\], "replace": true \}, not beside it\.$/);
  assert.equal(await gestureOf(values({ "--steps": "steps.json" })), null, "--steps: the file holds the gestures");
  for (const [given, said] of [[{}, /^UsageError: Say the gesture: --press <selector>, --drag <selector> --to <selector>, --key <selector> <key>, --type <selector> <words> or --select <selector> <value>; or --steps <file>\.$/], [{ "--press": "a", "--drag": "b", "--to": "c" }, /^UsageError: One gesture at a time: --press or --drag\.$/], [{ "--drag": "a" }, /^UsageError: --drag takes --to/], [{ "--press": "a", "--to": "b" }, /^UsageError: --to goes with --drag/], [{ "--steps": "s.json", "--press": "a" }, /^UsageError: --steps <file> holds every gesture: --press goes in it, not beside it\.$/], [{ "--steps": "s.json", "--then": "Enter" }, /^UsageError: --steps <file> holds every gesture: --then/]]) {
    await assert.rejects(gestureOf(values(given)), said, JSON.stringify(given));
  }
  for (const key of ["Bogus", "Enter+Shift", "Shift+"]) await assert.rejects(gestureOf(values({ "--key": ".dot" }), { "--key": key }), /Not a key/, key);
  await assert.rejects(gestureOf(values({ "--press": ".dot", "--then": "Bogus" })), /Not a key: Bogus/);

  // A step of a steps file: one gesture, named as the options name it without their --, a pair as a
  // list of two; what is no step said with its number and the file's name.
  const where = "step 2 of steps.json";
  assert.deepEqual(await stepOf({ drag: ".card", to: ".list", then: "Escape" }, where), { kind: "drag", at: ".card", to: ".list", then: { key: "Escape", keys: ["Escape"] } });
  assert.deepEqual(await stepOf({ key: [".name", "Control+a"] }, where), { kind: "key", at: ".name", key: "Control+a", keys: ["Control", "a"] });
  for (const [fields, said] of [[{ press: ".a", drag: ".b" }, /^UsageError: Step 2 of steps\.json: one gesture at a time: "press" or "drag"\.$/], [{}, /^UsageError: Step 2 of steps\.json: name the gesture: "press", "drag", "key", "type", "select"\.$/], [{ type: ".name" }, /^UsageError: Step 2 of steps\.json: "type" takes \[<selector>, <words>\]\.$/], [{ press: ".a", wait: 3 }, /^UsageError: Step 2 of steps\.json: no such field: wait/], [{ press: ".a", to: ".b" }, /"to" goes with "drag"/], [{ press: "" }, /a selector is words/], ["press", /a step is an object naming one gesture/]]) {
    await assert.rejects(stepOf(fields, where), said, JSON.stringify(fields));
  }
  {
    const files = path.join(root, "steps");
    fs.mkdirSync(files, { recursive: true });
    const file = (name, text) => {
      fs.writeFileSync(path.join(files, name), text);
      return path.join(files, name);
    };
    const steps = await stepsOf(file("good.json", '﻿[{ "press": ".add" }, { "type": [".name", "多喝水"], "then": "Enter" }]'));
    assert.deepEqual(steps.map(({ kind }) => kind), ["press", "type"], "a list of steps, a byte-order mark passed over");
    await assert.rejects(stepsOf(path.join(files, "none.json")), /^UsageError: No steps file: /);
    await assert.rejects(stepsOf(file("bad.json", "[{ press: .add }]")), /^UsageError: bad\.json is no JSON: /);
    await assert.rejects(stepsOf(file("empty.json", "[]")), /empty\.json holds no list of steps/);
    await assert.rejects(stepsOf(file("many.json", JSON.stringify(Array(21).fill({ press: ".a" })))), /holds 21 steps, and a trial makes 20 at most/);
    await assert.rejects(stepsOf(file("wrong.json", '[{ "press": ".a" }, { "tap": ".b" }]')), /^UsageError: Step 2 of wrong\.json: no such field: tap/);
  }

  // A drag's moves: a nudge, steps that stay off the target's box, and its middle last, the one move
  // that comes onto it; from inside the box, steps all the way.
  const target = { left: 400, top: 100, right: 600, bottom: 200, x: 500, y: 150 };
  const inside = (point) => point.x >= target.left && point.x <= target.right && point.y >= target.top && point.y <= target.bottom;
  const moves = dragPath({ x: 100, y: 150 }, target);
  assert.deepEqual(moves.at(-1), { x: 500, y: 150 });
  assert.ok(moves.slice(0, -1).every((point) => !inside(point)) && moves.at(-2).x > 390, `only the last move comes onto the target: ${JSON.stringify(moves)}`);
  assert.ok(Math.hypot(moves[1].x - 100, moves[1].y - 150) >= 4, "the nudge goes past what starts a drag");
  const within = dragPath({ x: 450, y: 120 }, target);
  assert.deepEqual(within.at(-1), { x: 500, y: 150 });
  assert.ok(within.every(inside), "a drag that starts in its target's box stays in it");

  // The instance a command line names: the only one, its id, its package's where the document holds
  // one of it; one in another's slot among them, said with where it stands.
  const page = (inside) => `<!doctype html><html><head><title>t</title></head><body><main class="doc-page">${inside}</main></body></html>`;
  const twoBoards = page('<div data-doc-component="local/kanban" data-block-id="b1"><h3>一</h3></div>\n<div data-doc-component="local/kanban"><h3>二</h3></div>\n<div data-doc-component="local/scorecard"><h3>三</h3></div>');
  const listed = instancesIn(twoBoards);
  assert.deepEqual(listed.map(({ id, blockId, line }) => [id, blockId, line]), [["local/kanban", "b1", 1], ["local/kanban", null, 2], ["local/scorecard", null, 3]]);
  const named = { slug: "d", name: "doc.html" };
  assert.equal(chosenInstance(listed, "b1", named), 0);
  assert.equal(chosenInstance(listed, "scorecard", named), 2);
  assert.equal(chosenInstance(listed, "local/scorecard", named), 2);
  assert.equal(chosenInstance(instancesIn(page('<div data-doc-component="local/kanban"></div>')), null, named), 0);
  assert.throws(() => chosenInstance(listed, null, named), (error) => error.name === "UsageError" && error.message === "d holds 3 instances: name one, gallery block try d <instance id> …\n  b1  local/kanban at doc.html:1\n  (no id yet: gallery export gives it one)  local/kanban at doc.html:2\n  local/scorecard  local/scorecard at doc.html:3");
  assert.throws(() => chosenInstance(listed, "kanban", named), /d holds 2 instances of local\/kanban: name one by its id/);
  assert.throws(() => chosenInstance(listed, "zz", named), /d holds no instance zz/);
  const slotted = instancesIn(page('<div data-doc-component="local/brief">\n<h3>要点</h3>\n<div data-doc-slot="body">\n<p>一</p>\n<div data-doc-component="local/counter"><h3>计</h3></div>\n</div>\n</div>\n<template><div data-doc-component="local/x"></div></template>'));
  assert.deepEqual(slotted.map(({ id, line, in: outer }) => [id, line, outer]), [["local/brief", 1], ["local/counter", 5, { id: "local/brief", line: 1, slot: "body" }]].map(([id, line, outer = null]) => [id, line, outer]), "one in a slot, none in a template");
  assert.equal(chosenInstance(slotted, "counter", named), 1);
  assert.throws(() => chosenInstance(slotted, null, named), (error) => error.message.endsWith("\n  local/counter  local/counter at doc.html:5, in the slot body of local/brief at doc.html:1"));

  // What tells two files apart, of an instance: its parts, each by the lines taken out and put in, and
  // those lines; what stands outside them; the ids a save gives taken out first.
  const board = { id: "local/kanban", parts: { title: { at: ":scope > h3", edit: "text" }, tasks: { at: ":scope > table", edit: "data" } } };
  const table = (rows) => `<div data-doc-component="local/kanban">\n<h3>板</h3>\n<table><tbody>\n${rows.map((row) => `<tr><td>${row}</td></tr>`).join("\n")}\n</tbody></table>\n</div>`;
  const was = page(`<p>前</p>\n${table(["一", "二", "三"])}`);
  assert.deepEqual(changesOf(was, page(`<p>前</p>\n${table(["二", "三", "一"])}`), 0, board), { parts: [{ name: "tasks", removed: 1, added: 1, lines: 5, how: null, runs: [{ removed: ["<tr><td>一</td></tr>"], added: [] }, { removed: [], added: ["<tr><td>一</td></tr>"] }] }], outside: null, gone: false });
  assert.deepEqual(changesOf(was, page(`<p>后</p>\n${table(["一", "二", "三"])}`), 0, board), { parts: [], outside: { removed: 1, added: 1, lines: 5 }, gone: false });
  assert.equal(changesOf(was, page("<p>前</p>"), 0, board).gone, true);
  // A write that closes JSON spread over lines to one line as its list empties is context.editJSON's own rule, of the
  // value it held and the value it wrote (which opens no part on one line: written compact, on one line, after it): no note, where the block had nothing to change (a ledger's last
  // entry taken away, two lines becoming one); a write in a layout of the block's own keeps its note.
  const spread = '\n{\n  "entries": [\n    { "words": "买菜" }\n  ]\n}\n';
  const emptied = '\n{ "entries": [] }\n';
  assert.equal(laidAnew(spread, emptied), "2 lines became 1", "what the raw difference is");
  assert.equal(laidAnewOf(spread, emptied), null, "editJSON's own rule: the one line it writes for no entries, over the lines it wrote for one");
  assert.equal(laidAnewOf(emptied, '\n{"entries":[{"words":"买菜"}]}\n'), null, "and as it fills again: one line to one line, written compact");
  const opened = '\n{\n  "entries": [\n    {\n      "words": "买菜",\n      "parts": [\n        { "at": 1 }\n      ]\n    }\n  ]\n}\n';
  assert.equal(laidAnew(spread, opened), "1 line became 2", "an entry of a spread part that comes to hold a list of objects, on lines of its own");
  assert.equal(laidAnewOf(spread, opened), null, "the rule too, in a part spread over lines");
  const ownLayout = '\n{\n  "entries": [\n    {\n      "words": "买菜"\n    }\n  ]\n}\n';
  assert.equal(laidAnewOf('\n{"entries":[{"words":"买菜"}]}\n', ownLayout), "1 line became 7", "a layout of a block's own, one line written on seven, keeps its note");
  const asWritten = changesOf(page(`<div data-doc-component="local/ledger">\n<script type="application/json">${spread}</script>\n</div>`), page(`<div data-doc-component="local/ledger">\n<script type="application/json">${emptied}</script>\n</div>`), 0, { id: "local/ledger", parts: { entries: { at: ":scope > script", edit: "data" } } });
  assert.deepEqual(asWritten.parts.map(({ name, how }) => [name, how]), [["entries", null]], "the trial says nothing of it");
  assert.equal(withoutIds(was.replace('<p>', '<p data-block-id="a1b2c3d4">').replace("<div ", '<div data-block-id="k1" ')), was);
  // The lines under a Wrote line: - and + in the order a diff gives them, each cut at 160 characters,
  // twelve of a part, its name before them where several parts were written.
  const runs = (removed, added) => [{ removed, added }];
  assert.deepEqual(writtenLines([{ name: "tasks", runs: runs(["<tr><td>一</td><td>待办</td></tr>"], ["<tr><td>一</td><td>已完成</td></tr>"]) }]), ["  - <tr><td>一</td><td>待办</td></tr>", "  + <tr><td>一</td><td>已完成</td></tr>"]);
  assert.deepEqual(writtenLines([{ name: "a", runs: runs([], ["x"]) }, { name: "b", runs: runs(["y"], []) }]), ["  a:", "    + x", "  b:", "    - y"]);
  const long = writtenLines([{ name: "json", runs: runs([], Array.from({ length: 14 }, (_, at) => `"${at}": ${"九".repeat(200)}`)) }]);
  assert.equal(long.length, 13);
  assert.equal(long[0], `  + "0": ${"九".repeat(160 - 5)}…`);
  assert.equal(long.at(-1), "  … 2 more lines");
  // Two pages' words and fields told apart, where they first part.
  assert.equal(wordsDiffer({ words: "喝水 3", fields: ["喝水", "杯"] }, { words: "喝水 3", fields: ["喝水", "杯"] }), null);
  assert.equal(wordsDiffer({ words: "今天 4 杯", fields: [] }, { words: "今天 3 杯", fields: [] }), 'its words read "今天 4 杯" there and "今天 3 杯" here');
  assert.equal(wordsDiffer({ words: "", fields: ["喝水多", "杯"] }, { words: "", fields: ["喝水", "杯"] }), 'its field 1 (of 2) holds "喝水多" there and "喝水" here');
  assert.equal(wordsDiffer({ words: "", fields: ["a", "ticked"] }, { words: "", fields: ["a"] }), 'its field 2 (of 2) holds "ticked" there and null here');

  // What a trial says and exits with, of results as a trial makes them: one gesture written, undone and
  // read back on a scratch copy; kept on doc.html; of a document's plain HTML with --keep; with someone
  // else's write outside the parts (unverified); with a problem (whatever else it is), with a note;
  // steps, one of which wrote nothing.
  const drag = { slug: "d", name: "doc.html", steps: [{ kind: "drag" }], keep: false };
  const tasks = [{ name: "tasks", removed: 1, added: 1, lines: 8, how: null, runs: runs(["<tr><td>写</td><td>待办</td></tr>"], ["<tr><td>写</td><td>已完成</td></tr>"]) }];
  const made = { steps: [{ said: "a drag of …", parts: tasks, outside: null, plain: false }], problems: [], notes: [], picture: path.join(root, "after.png") };
  const wrote = ["Wrote: tasks (-1 +1 of its 8 lines); nothing outside the instance changed (data-block-id aside)", "  - <tr><td>写</td><td>待办</td></tr>", "  + <tr><td>写</td><td>已完成</td></tr>"];
  const picture = `Picture of the instance after the drag: ${path.join(root, "after.png")} (${OPEN_IT})`;
  // And the line every picture of the run is listed in, as qa and page check end: none opened for you.
  const unopened = unopenedSaid([{ folder: root, files: [path.join(root, "after.png")] }]);
  assert.ok(unopened.startsWith("提示：1 picture in ") && unopened.endsWith(": none needs opening; open one when you want to see it"), unopened);
  assert.deepEqual(trialSaid(drag, { ...made, undone: 1, readBack: true }), { code: 0, lines: ["Gesture: a drag of …", ...wrote, "Undone: one Ctrl+Z, and the copy of doc.html is as it was (data-block-id aside)", "Read back: a fresh page of what the drag wrote (a copy of it): the instance mounts, writes nothing as it opens, and shows what the page showed after the drag", picture, unopened, "OK   d: the drag wrote tasks, one Ctrl+Z took it back, and a fresh page read it back; doc.html not written (a scratch copy)"] });
  assert.deepEqual(trialSaid({ ...drag, keep: true }, { ...made, readBack: true }), { code: 0, lines: ["Gesture: a drag of …", ...wrote, "Kept (--keep): doc.html holds what the drag wrote", "Read back: doc.html opened again in a fresh page: the instance mounts, writes nothing as it opens, and shows what the page showed after the drag", picture, unopened, "OK   d: the drag wrote tasks, kept (--keep), and a fresh page read it back"] });
  assert.deepEqual(trialSaid({ ...drag, keep: true }, { ...made, steps: [{ ...made.steps[0], plain: true }], readBack: true }).lines.slice(1, 2), [`${wrote[0]}; and the page wrote the document's plain HTML as the kit's markup, as its first save of an edit does (gallery check and gallery export say what, by line, once), which stays`]);
  assert.ok(!trialSaid(drag, { ...made, steps: [{ ...made.steps[0], plain: true }], undone: 1, readBack: true }).lines[1].includes("plain HTML"), "a scratch copy's plain HTML stays nowhere");
  const others = trialSaid({ ...drag, keep: true }, { ...made, steps: [{ ...made.steps[0], outside: { removed: 1, added: 1, lines: 30 } }], readBack: true, others: { removed: 1, added: 1 }, unverified: "someone else wrote doc.html meanwhile" });
  assert.deepEqual([others.code, others.lines[1], others.lines.at(-1)], [3, "Wrote: tasks (-1 +1 of its 8 lines); outside the instance's parts -1 +1 lines someone else wrote meanwhile (the user's page, an Agent), which stay", "UNVERIFIED d: someone else wrote doc.html meanwhile"]);
  const failed = trialSaid(drag, { ...made, problems: [{ where: "doc.html:15", what: "one" }, { where: "kit.js:3", what: "two" }], notes: [{ where: "doc.html:15", what: "three" }], unverified: "not seen through" });
  assert.deepEqual([failed.code, failed.lines.slice(4, 7), failed.lines.at(-1)], [1, ["  FAIL doc.html:15: one", "  FAIL kit.js:3: two", "  note doc.html:15: three"], "FAIL d: 2 problems"]);
  const three = { slug: "h", name: "doc.html", steps: [{ kind: "press" }, { kind: "type" }, { kind: "select" }], keep: false };
  const habit = (from, to) => [{ name: "habit", removed: 1, added: 1, lines: 1, how: null, runs: runs([from], [to]) }];
  const stepped = trialSaid(three, { problems: [], notes: [], undone: 2, readBack: true, picture: path.join(root, "after.png"), steps: [{ said: "a press on .add", parts: habit("{ 3 }", "{ 4 }"), outside: null }, { said: '"x" typed in .name', parts: [], outside: null }, { said: '"杯" chosen in .unit', parts: habit("{ 杯 }", "{ 瓶 }"), outside: null }] });
  assert.deepEqual(stepped, { code: 0, lines: ["Step 1: a press on .add", "Wrote: habit (-1 +1 of its 1 line); nothing outside the instance changed (data-block-id aside)", "  - { 3 }", "  + { 4 }", 'Step 2: "x" typed in .name', "Wrote: nothing", 'Step 3: "杯" chosen in .unit', "Wrote: habit (-1 +1 of its 1 line); nothing outside the instance changed (data-block-id aside)", "  - { 杯 }", "  + { 瓶 }", "Undone: 2 Ctrl+Z, one for each step that wrote, the last first, each giving the copy of doc.html back as it was before its step (data-block-id aside)", "Read back: a fresh page of what the steps wrote (a copy of it): the instance mounts, writes nothing as it opens, and shows what the page showed after the last step", `Picture of the instance after the last step: ${path.join(root, "after.png")} (${OPEN_IT})`, unopened, "OK   h: the steps wrote habit, 2 Ctrl+Z took them back, and a fresh page read them back; doc.html not written (a scratch copy)"] });
  // More Ctrl+Z than steps that wrote, a step that wrote twice taking two; a single gesture's two
  // writes; a read back with a note on what the page showed and never wrote.
  const twice = trialSaid(three, { problems: [], notes: [], undone: 2, presses: 3, readBack: true, steps: [{ said: "a press on .add", parts: habit("{ 3 }", "{ 4 }"), outside: null }, { said: '"x" typed in .name', parts: [], outside: null }, { said: '"杯" chosen in .unit', parts: habit("{ 杯 }", "{ 瓶 }"), outside: null }] });
  assert.ok(twice.lines.includes("Undone: 3 Ctrl+Z for the 2 steps that wrote, one for each write the page took, the last first, each step's giving the copy of doc.html back as it was before it (data-block-id aside)") && twice.lines.at(-1) === "OK   h: the steps wrote habit, 3 Ctrl+Z took them back, and a fresh page read them back; doc.html not written (a scratch copy)", twice.lines.join("\n"));
  const pressedTwice = trialSaid({ ...drag, steps: [{ kind: "press" }] }, { ...made, undone: 1, presses: 2, readBack: true, aside: true, notes: [{ where: "doc.html:15", what: "a fresh page …" }] });
  assert.deepEqual(pressedTwice.lines.filter((line) => /^(Undone|Read back|  note|OK)/.test(line)), ["Undone: 2 Ctrl+Z, one for each write the page took of the press, and the copy of doc.html is as it was (data-block-id aside)", "Read back: a fresh page of what the press wrote (a copy of it): the instance mounts, writes nothing as it opens, and shows what the page showed after the press of what it wrote; what else the page showed there, which nothing wrote, it does not (the note)", "  note doc.html:15: a fresh page …", "OK   d: the press wrote tasks, 2 Ctrl+Z took it back, and a fresh page read it back; doc.html not written (a scratch copy)"]);
  // The steps made before a mistake found in a later one: with --keep what they wrote stays, said; on a
  // scratch copy, nothing of them anywhere.
  const before2 = { steps: [{ said: "a press on .add", parts: habit("{ 3 }", "{ 4 }"), outside: null }] };
  assert.deepEqual(madeSaid({ name: "doc.html", steps: three.steps, keep: true }, before2), ["Step 1: a press on .add", "Wrote: habit (-1 +1 of its 1 line); nothing outside the instance changed (data-block-id aside)", "  - { 3 }", "  + { 4 }", "Kept (--keep): doc.html holds what step 1 wrote, which stays; step 2 was not made, for the mistake below"]);
  assert.equal(madeSaid({ name: "doc.html", steps: three.steps, keep: false }, { steps: [...before2.steps, { said: '"x" typed in .name', parts: [], outside: null }] }).at(-1), "Not made: step 3 was not made, for the mistake below; steps 1 to 2 wrote to a scratch copy, gone now, and doc.html holds nothing of them");
  assert.equal(madeSaid({ name: "doc.html", steps: three.steps, keep: true }, { steps: [{ said: '"x" typed in .name', parts: [], outside: null }] }).at(-1), "Not made: step 2 was not made, for the mistake below; step 1 wrote nothing to doc.html");
  // What a read back tells apart: the words a write put in or took out (no tags, no JSON keys, its
  // entities read), and whether it wrote a box's state; of what a fresh page shows otherwise, what is of
  // that (a word the same, or one of words with no spaces between them holding the other) and what
  // the page showed and never wrote.
  assert.deepEqual([...wordsIn("今天 喝水多, Water-2 &amp;")], ["今天", "喝水多", "water", "2", "amp"]);
  const habitRuns = (from, to) => [{ parts: [{ name: "habit", runs: runs([from], [to]) }] }];
  assert.deepEqual(writtenWords(habitRuns('{ "name": "喝水", "count": 3 }', '{ "name": "喝水", "count": 3, "title": "喝水多" }')), { words: new Set(["喝水多"]), ticks: false });
  assert.deepEqual(writtenWords(habitRuns("<li>写发布说明 &amp; 定稿</li>", '<li class="done">写发布说明 &amp; 定稿</li>')), { words: new Set(), ticks: true });
  assert.deepEqual(writtenWords(habitRuns('[{ "t": "a", "done": false }, { "t": "b", "done": true }]', '[{ "t": "a", "done": true }, { "t": "b", "done": true }]')), { words: new Set(["false"]), ticks: true });
  const view = (words, ...fields) => ({ words, fields });
  const forgotten = writtenWords(habitRuns('{ "name": "喝水" }', '{ "name": "喝水", "title": "喝水多" }'));
  assert.deepEqual(writtenOtherwise(view("每天的习惯", "喝水多", "杯"), view("每天的习惯", "喝水", "杯"), forgotten), ["喝水多", "喝水"]);
  assert.deepEqual(writtenOtherwise(view("今天喝水多 4"), view("今天喝水 3"), writtenWords(habitRuns('{ "count": 3 }', '{ "count": 4 }'))), ["4", "3"]);
  const counted = writtenWords(habitRuns('{ "count": 3 }', '{ "count": 4 }'));
  assert.deepEqual(writtenOtherwise(view("每天的习惯 4 +1 更多 坚持就好"), view("每天的习惯 4 +1 更多"), counted), [], "a line the page showed and never wrote");
  assert.deepEqual(writtenOtherwise(view("看板 todo 写发布说明", "done"), view("看板 todo 写发布说明 确定版本号", "all"), counted), [], "a filter chosen");
  assert.deepEqual(writtenOtherwise(view("x", "ticked"), view("x", "not ticked"), counted), [], "a box no write ticked");
  assert.deepEqual(writtenOtherwise(view("x", "ticked"), view("x", "not ticked"), { words: new Set(), ticks: true }), ["a box ticked"]);
  assert.deepEqual(writtenOtherwise(view("to do"), view("todo"), { words: new Set(["to"]), ticks: false }), ["to"], "words with spaces between them match whole");
  assert.deepEqual(writtenOtherwise(view("todo"), view("tod"), { words: new Set(["to"]), ticks: false }), [], "and only whole");
  // The check's way back of the instance numbered `at` is of the one putBack put back, numbered among
  // those in no instance: of a box holding another in its slot, then a third, the third's write is
  // said against the third (which holds it already: nothing changed), not against the box in the slot.
  {
    const boxes = path.join(root, "boxes");
    const folder = path.join(boxes, "components", "local", "box");
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(boxes, "gallery.json"), JSON.stringify({ gallery: "workspace", version: 1 }));
    fs.writeFileSync(path.join(folder, "component.json"), JSON.stringify({ id: "local/box", apiVersion: 1, version: "1.0.0", name: { zh: "盒子", en: "Box" }, description: { zh: "一个盒子", en: "A box" }, parts: { data: { at: ":scope > script", edit: "data" }, body: { edit: "flow" } } }));
    fs.writeFileSync(path.join(folder, "template.html"), '<div class="box" data-doc-component="local/box">\n  <script type="application/json">{ "n": 0 }</script>\n  <div data-doc-slot="body"><p>x</p></div>\n</div>\n');
    const box = (n, body) => `<div class="box" data-doc-component="local/box">\n  <script type="application/json">{ "n": ${n} }</script>\n  <div data-doc-slot="body">\n${body}\n  </div>\n</div>`;
    const source = pageOfMarkup("x", `${box(1, box(2, "<p>a</p>"))}\n${box(3, "<p>b</p>")}`);
    const found = readCatalog(boxes).packages.get("local/box");
    const wayBack = (n) => wayBackSaid({ parts: { data: `{ "n": ${n} }` } }, { source, found, at: 1, findings: [] });
    assert.deepEqual(wayBack(3), [{ kind: "wrote", back: true, parts: [{ name: "data", removed: 0, added: 0, lines: 1 }] }]);
    assert.deepEqual(wayBack(4), [{ kind: "wrote", back: true, parts: [{ name: "data", removed: 1, added: 1, lines: 1 }] }]);
  }
  // A trial cut off, by what the file holds then: on a scratch copy, unverified and doc.html holding
  // nothing of it; with --keep, the file as it was, someone else's write in a part a card held the
  // page's for, the write kept, and an instance gone, unverified too.
  const cut = { gesture: "drag", name: "doc.html" };
  const offline = "after the drag, the page could not reach the server (offline)";
  const outside = { removed: 1, added: 1, lines: 30 };
  assert.deepEqual(cutOffSaid(offline, { parts: tasks, outside: null, gone: false }, { ...cut, scratch: true }), { unverified: `${offline}, the copy holding what the drag wrote, tasks (-1 +1 of its 8 lines): the trial was made on a scratch copy, gone now, and doc.html holds nothing of it` });
  assert.deepEqual(cutOffSaid(offline, { parts: [], outside: null, gone: true }, { ...cut, scratch: true }), { unverified: `${offline}: the trial was made on a scratch copy, gone now, and doc.html holds nothing of it` });
  assert.deepEqual(cutOffSaid(offline, { parts: [], outside: null, gone: false }, cut), { unverified: `${offline}: doc.html is as it was (data-block-id aside)` });
  assert.deepEqual(cutOffSaid(offline, { parts: [], outside, gone: false }, cut), { unverified: `${offline}: doc.html is as it was in the instance's parts (data-block-id aside); outside the instance's parts -1 +1 lines someone else wrote meanwhile, which stay` });
  assert.deepEqual(cutOffSaid("after the drag, a card waits", { parts: tasks, outside: null, gone: false }, { ...cut, held: true }), { unverified: "after the drag, a card waits: what doc.html holds of tasks (-1 +1 of its 8 lines) is someone else's, which stays" });
  assert.deepEqual(cutOffSaid(offline, { parts: tasks, outside, gone: false }, cut), { unverified: `${offline}: doc.html holds what the drag wrote, tasks (-1 +1 of its 8 lines), kept (--keep); outside the instance's parts -1 +1 lines someone else wrote meanwhile, which stay` });
  assert.deepEqual(cutOffSaid(offline, { parts: [], outside: null, gone: true }, cut), { unverified: `${offline}, and doc.html holds the instance no more where it stood: someone else wrote the file meanwhile` });
  // Why a gesture wrote nothing, by what the page heard: an edit refused, with the console's words; one
  // taken that changed nothing; a drop no edit came of; an HTML5 drag dropped nowhere; words typed where
  // nothing takes them, or in a field that writes on a key; nothing at all.
  const heard = { edits: [], started: null, dropped: null, effect: null };
  const why = (kind, page, more = {}) => nothingSaid(kind, { ...heard, ...page }, { refusals: [], name: "the copy of doc.html", ...more });
  assert.equal(why("press", { edits: [{ taken: false, parts: ["count"] }] }, { refusals: ["[DocKit] local/counter: context.edit: it wrote the part count on the page"] }), "the press wrote nothing to the copy of doc.html: context.edit was called and the page refused it: the console says [DocKit] local/counter: context.edit: it wrote the part count on the page");
  assert.equal(why("key", { edits: [{ taken: true, parts: ["count"] }] }), "the key wrote nothing to the copy of doc.html: context.edit was taken, and its change left what the parts hold as it was");
  assert.equal(why("drag", { started: "<li>", dropped: "<ol>" }), "the drag wrote nothing to the copy of doc.html: it was dropped on <ol>, and no context.edit came of it");
  assert.match(why("drag", { started: "<li>", effect: "none" }), /^the drag wrote nothing to the copy of doc\.html: an HTML5 drag started \(dragstart on <li>\) and nothing took its drop where it was released \(dragend's dropEffect none\)[^;]*$/);
  assert.equal(why("press", {}), "the press wrote nothing to the copy of doc.html: no context.edit came of it: the component answers no press there, or asked while context.canEdit() was false");
  assert.equal(why("type", {}), "the typing wrote nothing to the copy of doc.html: no context.edit came of it: the component answers no typing there, or writes what was typed only on a key or as the field loses the focus (then Enter, --then Enter), or asked while context.canEdit() was false");
  assert.ok(why("type", {}, { unfocused: "<body>" }).includes("the element takes no typing (a field or an editable element), so the words went to <body>"));
  assert.ok(why("select", {}).includes("the component answers no choice there"));

  // The scratch copy: doc.html as given, doc.json and assets/ copied, a slug no document has, served by
  // documentDirectory; taken away with what the edit state keeps of it by its slug; one left by a trial
  // killed taken by the next an hour on, a newer one and a folder of no copy's name left alone.
  {
    const ws = path.join(root, "scratch");
    for (const [name, text] of [["d/doc.html", "<p>原文</p>"], ["d/doc.json", "{}"], ["d/assets/a.png", "png"], ["try-00000000/doc.html", "a document of that name"]]) {
      fs.mkdirSync(path.dirname(path.join(ws, name)), { recursive: true });
      fs.writeFileSync(path.join(ws, name), text);
    }
    const directory = path.join(ws, "d");
    const copy = await scratchCopy(ws, { directory, files: documentFiles(directory), text: "<p>副本</p>" });
    assert.match(copy.slug, /^try-[a-f0-9]{8}$/);
    assert.equal(copy.folder, path.join(ws, ".gallery", "try", copy.slug));
    assert.equal(documentDirectory(copy.slug, ws), copy.folder);
    assert.deepEqual(["doc.html", "doc.json", "assets/a.png"].map((name) => fs.readFileSync(path.join(copy.folder, name), "utf8")), ["<p>副本</p>", "{}", "png"]);
    assert.equal(fs.readFileSync(path.join(directory, "doc.html"), "utf8"), "<p>原文</p>", "the document as it was");
    for (const kind of ["history", "receipts", "changes"]) fs.mkdirSync(path.join(ws, ".gallery", "state", kind, copy.slug), { recursive: true });
    fs.mkdirSync(path.join(ws, ".gallery", "state", "history", "d"), { recursive: true });
    fs.writeFileSync(path.join(ws, ".gallery", "state", "token"), "t");
    await dropScratch(ws, copy.slug);
    assert.ok(!fs.existsSync(copy.folder) && ["history", "receipts", "changes"].every((kind) => !fs.existsSync(path.join(ws, ".gallery", "state", kind, copy.slug))), "the copy and its state gone");
    assert.ok(fs.existsSync(path.join(ws, ".gallery", "state", "history", "d")) && fs.existsSync(path.join(ws, ".gallery", "state", "token")), "a document's state stays");
    const [stale, fresh] = [await scratchCopy(ws, { directory, files: documentFiles(directory), text: "x" }), await scratchCopy(ws, { directory, files: documentFiles(directory), text: "y" })];
    fs.mkdirSync(path.join(ws, ".gallery", "try", "kept"));
    const hourAgo = new Date(Date.now() - 61 * 60 * 1000);
    for (const folder of [stale.folder, path.join(ws, ".gallery", "try", "kept")]) fs.utimesSync(folder, hourAgo, hourAgo);
    await dropStale(ws);
    assert.deepEqual(fs.readdirSync(path.join(ws, ".gallery", "try")).sort(), ["kept", fresh.slug].sort(), "the stale copy alone taken away");
  }

  // When the server has told its pages of each write the disk holds: the newest of doc.html,
  // gallery.json and what stands under components/, then the catalog's first look and the stillness a
  // write is told after; nothing written lately, no wait.
  {
    const told = path.join(root, "told");
    const files = [path.join(told, "gallery.json"), path.join(told, "d", "doc.html"), path.join(told, "components", "local", "x", "style.css")];
    for (const file of files) {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "x");
    }
    const long = new Date(Date.now() - 60_000);
    for (const at of [...files, path.join(told, "d"), path.join(told, "components"), path.join(told, "components", "local"), path.join(told, "components", "local", "x")]) fs.utimesSync(at, long, long);
    assert.ok(await toldBy(told, files[1]) < Date.now(), "nothing written lately: no wait");
    for (const file of files) {
      const now = Date.now();
      fs.utimesSync(file, new Date(now), new Date(now));
      const after = (await toldBy(told, files[1])) - now;
      assert.ok(after >= FIRST_LOOK + QUIET - 1 && after < FIRST_LOOK + QUIET + 1000, `${path.relative(told, file)} written now: told ${after}ms later`);
      fs.utimesSync(file, long, long);
    }
  }

  // When the server has taken what the disk holds of a package (takenBy), by the rule it takes a change
  // under components/ by and what its catalog in use says (a stand-in answering GET
  // /__gallery/workspace/components): the catalog's first look and QUIET after the newest write of the
  // package, and none after another package's; HOLD after it while the disk reads the package as not
  // loading and the server keeps it as it was, and not where the server has it as not loading too; the
  // server behind a disk that reads the package as loading; a package gallery.json turns off; no server
  // answering. Then how long a page in its fallback is waited for (untilTaken) and what is said of it.
  {
    const taken = path.join(root, "taken");
    const folder = path.join(taken, "components", "local", "counter");
    fs.cpSync(fixture("component-try", "local", "counter"), folder, { recursive: true });
    const long = new Date(Date.now() - 60_000);
    const settle = () => {
      for (const at of [taken, path.join(taken, "components"), path.join(taken, "components", "local"), folder, ...fs.readdirSync(folder).map((name) => path.join(folder, name))]) fs.utimesSync(at, long, long);
    };
    settle();
    let listed = [{ id: "local/counter", state: "normal", reason: null }];
    const stand = http.createServer((request, response) => {
      response.writeHead(request.url === "/__gallery/workspace/components" ? 200 : 404, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, packages: listed }));
    });
    let port = null;
    for (let candidate = low; candidate <= high && port === null; candidate++) if (await portIsFree(candidate)) port = candidate;
    assert.ok(port, `a free port in ${low}-${high}`);
    await new Promise((resolve) => stand.listen(port, "127.0.0.1", resolve));
    const origin = `http://127.0.0.1:${port}`;
    try {
      const of = async () => {
        const { by, stamp, ...rest } = await takenBy(taken, "local/counter", origin);
        return { after: by - Date.now(), ...rest };
      };
      // A file's mtime has a fraction of a millisecond where Date.now() has none, so in the millisecond of the write `after` may be up to 1ms past `wait`.
      const near = (after, wait, what) => assert.ok(after > wait - 1000 && after < wait + 1, `${what}: taken ${after}ms later`);
      const still = await of();
      assert.ok(still.after < 0, "nothing written lately: taken");
      assert.deepEqual({ ...still, after: 0 }, { after: 0, held: null, behind: false, off: false, state: "normal", reason: null });
      const other = path.join(taken, "components", "local", "other");
      fs.mkdirSync(other, { recursive: true });
      fs.writeFileSync(path.join(other, "style.css"), "/* another package's */\n");
      assert.ok((await of()).after < 0, "another package written now: taken");
      fs.appendFileSync(path.join(folder, "style.css"), "/* mended */\n");
      near((await of()).after, FIRST_LOOK + QUIET, "a file written now");
      const manifest = path.join(folder, "component.json");
      const whole = fs.readFileSync(manifest, "utf8");
      fs.writeFileSync(manifest, whole.slice(0, 40));
      const half = await of();
      near(half.after, HOLD, "a manifest half written, the server keeping the package");
      assert.match(half.held, /component\.json/, "why it does not load");
      listed = [{ id: "local/counter", state: "broken", reason: { zh: "…", en: "component.json is no JSON" } }];
      const broken = await of();
      near(broken.after, FIRST_LOOK + QUIET, "the server has it as not loading too");
      assert.deepEqual([broken.held, broken.state, broken.reason], [null, "broken", "component.json is no JSON"]);
      fs.writeFileSync(manifest, whole);
      settle();
      // The manifest whole again with the time it had, as a copy keeps it: no write lately, and the
      // server, which has the package as not loading still, behind the disk.
      const caught = await of();
      assert.ok(caught.after < 0 && caught.behind && caught.held === null, `the server behind the disk: ${JSON.stringify(caught)}`);
      fs.writeFileSync(path.join(taken, "gallery.json"), JSON.stringify({ gallery: "workspace", version: 1, components: { disabled: ["local/counter"] } }));
      const off = await of();
      assert.deepEqual([off.off, off.behind], [true, false], "turned off by gallery.json");
      fs.rmSync(path.join(taken, "gallery.json"));
      listed = [];
      const none = await of();
      assert.deepEqual([none.state, none.behind], ["none", true], "no such custom block where the server is");

      // untilTaken on a page asked for ten seconds ago, which loads itself again `loadsAt` ms into the
      // wait (null: never), past the take by 300ms at most: how long it waited, each line it said, with
      // its numbers as N, and what the server said last.
      const waited = async (loadsAt = null) => {
        const lines = [];
        const start = Date.now();
        const last = await untilTaken({ root: taken, id: "local/counter", origin, loadedAt: start - 10_000, loaded: () => loadsAt !== null && Date.now() - start >= loadsAt, told: 300, say: (line) => lines.push(line.replace(/\d+(\.\d+)?s\b/g, "Ns")) });
        return { ms: Date.now() - start, lines, last };
      };
      const meanwhile = (ms, then) => setTimeout(then, ms);
      const normal = [{ id: "local/counter", state: "normal", reason: null }];
      const notLoading = [{ id: "local/counter", state: "broken", reason: { zh: "…", en: "component.json is no JSON" } }];
      const halfWritten = (ago) => {
        fs.writeFileSync(manifest, whole.slice(0, 40));
        const at = new Date(Date.now() - ago);
        fs.utimesSync(manifest, at, at);
      };
      // Nothing written lately and the server as the disk: no wait, nothing said.
      listed = normal;
      settle();
      const quiet = await waited();
      assert.ok(quiet.ms < FIRST_LOOK + QUIET && quiet.lines.length === 0, `no wait: ${JSON.stringify(quiet)}`);
      // Another package written now: no wait for it either.
      fs.writeFileSync(path.join(other, "style.css"), "/* another package's, again */\n");
      const others = await waited();
      assert.ok(others.ms < FIRST_LOOK + QUIET && others.lines.length === 0, `another package written now: ${JSON.stringify(others)}`);
      // A file of the package written now, the page loading itself again 0.6s into the wait: said.
      fs.appendFileSync(path.join(folder, "style.css"), "/* mended again */\n");
      const own = await waited(600);
      assert.deepEqual(own.lines, ["Waiting: local/counter or gallery.json changed a moment ago, and the server takes the change once components/ has not changed for Ns, the page served before loading itself again for it, Ns more at most", "Waited Ns: the page loaded itself again"]);
      settle();
      // The server behind the disk, whose files' times are a minute old (a copy keeps them): waited for
      // until it catches up 0.4s into the wait and the page loads itself again 0.8s into it; and, when
      // it never catches up, until QUIET and 300ms past the first look that found it behind.
      listed = notLoading;
      meanwhile(400, () => { listed = normal; });
      const behind = await waited(800);
      assert.ok(behind.ms >= 800, `waited for the page: ${behind.ms}ms`);
      assert.deepEqual(behind.lines, ["Waiting: components/ holds local/counter as loading, and the server's catalog in use still has it as not loading (component.json is no JSON): it takes what components/ holds once that has not changed for Ns, Ns more at most", "Waited Ns: the page loaded itself again"]);
      listed = notLoading;
      const never = await waited();
      assert.ok(never.ms >= FIRST_LOOK + QUIET + 300 && never.ms < FIRST_LOOK + QUIET + 2000, `bounded: ${never.ms}ms`);
      assert.deepEqual([never.lines[1], never.last.behind], ["Waited Ns: the server has still not taken local/counter as components/ holds it", true]);
      assert.equal(fallbackSaid("local/counter", { said: [], ...never.last }), "the instance shows what it holds, read-only, so a reader can do nothing with it: the server has not taken local/counter as components/ holds it, where it loads: its catalog in use has it as not loading (component.json is no JSON)");
      // A manifest half written, which the server keeps the package as it was for, put back whole 0.3s
      // into the wait with the time it had a minute ago: a change seen, whatever its time, which the
      // server takes, the page loading itself again 1.2s into the wait.
      listed = normal;
      halfWritten(HOLD - 2000);
      meanwhile(300, () => {
        fs.writeFileSync(manifest, whole);
        fs.utimesSync(manifest, long, long);
      });
      const mended = await waited(1200);
      assert.ok(mended.ms >= 1200, `waited for the page: ${mended.ms}ms`);
      assert.match(mended.lines[0], /^Waiting: local\/counter does not load as components\/ holds it \(component\.json.*\), and the server keeps it as it was until components\/ has not changed for Ns, as it keeps a custom block written file by file, Ns more at most$/);
      assert.deepEqual(mended.lines.slice(1), ["Waited Ns: the page loaded itself again"]);
      // A manifest half written, the wait running to its end with the package kept as it was: said so.
      halfWritten(HOLD - 800);
      const kept = await waited();
      assert.deepEqual([kept.lines[0], kept.lines.slice(1)], [mended.lines[0], ["Waited Ns: the server still keeps local/counter as it was"]]);
      fs.writeFileSync(manifest, whole);
      settle();
    } finally {
      await new Promise((resolve) => stand.close(resolve));
    }
    const away = await takenBy(taken, "local/counter", origin);
    assert.deepEqual([away.state, away.held], [null, null], "no server answering");
  }

  // What a page says, heard on a stand-in tab (listen): a script of the package that does not parse,
  // at the line the browser says, the package's, with the kit's words on it; another script's error;
  // a dialog. Once the page that loaded itself again is taken again (takenAgain), what the page before
  // said is heard no more, words of it read after that among them, and what the new page said stays.
  {
    const frame = {};
    const session = Object.assign(new EventEmitter(), { send: async () => ({}) });
    const tab = Object.assign(new EventEmitter(), { mainFrame: () => frame, createCDPSession: async () => session, evaluateOnNewDocument: async () => {} });
    const heard = await listen(tab, "local/counter");
    const kit = "http://127.0.0.1:4800/__gallery/components/local/counter/kit.js?v=ab12";
    const opened = () => tab.emit("request", { isNavigationRequest: () => true, frame: () => frame });
    const logged = (words) => tab.emit("console", { type: () => "error", text: () => words, args: () => [{ evaluate: async () => words }] });
    const thrown = (exceptionDetails) => session.emit("Runtime.exceptionThrown", { exceptionDetails: { text: "Uncaught", ...exceptionDetails } });
    opened();
    thrown({ url: kit, lineNumber: 2, exception: { className: "SyntaxError", description: "SyntaxError: Unexpected token '{'" } });
    thrown({ url: "http://127.0.0.1:4800/other.js", lineNumber: 1, stackTrace: { callFrames: [] }, exception: { className: "ReferenceError", description: "ReferenceError: missing is not defined\n    at http://127.0.0.1:4800/other.js:2:1" } });
    logged("[DocKit] local/counter: Error: its script ran and started no component");
    session.emit("Page.javascriptDialogOpening", { type: "alert" });
    await Promise.all(heard.pending);
    assert.deepEqual([...heard.own], [["SyntaxError: Unexpected token '{'", { line: 3, page: 1, unparsed: true }], ["[DocKit] local/counter: Error: its script ran and started no component", { line: null, page: 1, unparsed: false }]]);
    assert.deepEqual([[...heard.others.keys()], [...heard.dialogs.keys()]], [["ReferenceError: missing is not defined"], ["alert"]]);
    logged("[DocKit] local/counter: Error: said as the page went");
    opened();
    thrown({ url: kit, lineNumber: 15, stackTrace: { callFrames: [] }, exception: { className: "Error", description: `Error: no count yet\n    at mount (${kit}:16:11)` } });
    takenAgain(heard);
    await Promise.all(heard.pending);
    assert.deepEqual([...heard.own], [["Error: no count yet", { line: 16, page: 2, unparsed: false }]]);
    assert.deepEqual([heard.others.size, heard.dialogs.size], [0, 0]);
  }

  // A browser that does not answer as a trial begins (a context or a tab that never opens: answered's
  // bound) is a FAIL naming what it waited for, the trial not begun, the browser closed by the command
  // (found testing the skill with Agents, 2026-11-09: a page check that waited 15 minutes), the scratch copy taken away.
  {
    const said = [];
    const log = console.log;
    console.log = (line) => said.push(line);
    const code = process.exitCode;
    try {
      const stuck = await answered(new Promise(() => {}), "a tab opened", 300).catch((error) => error);
      stoppedTrial("board", stuck, "doc.html", false);
      stoppedTrial("board", stuck, "doc.html", true);
    } finally {
      console.log = log;
      assert.equal(process.exitCode, 1);
      process.exitCode = code;
    }
    assert.deepEqual(said, [
      "FAIL board: the browser did not answer within 0.3 s, waiting until a tab opened, so nothing was tried and the browser was closed; the copy of doc.html was taken away. A script that never ends does this, and so may a browser that stalled: run the command once more",
      "FAIL board: the browser did not answer within 0.3 s, waiting until a tab opened, so nothing was tried and the browser was closed. A script that never ends does this, and so may a browser that stalled: run the command once more",
    ]);
  }

  // Why an instance shows what it holds, read-only, once no more is waited for (fallbackSaid): its
  // script not parsing, at its line, the kit's words on it aside; the console's words of its package,
  // at their line of kit.js; turned off; a server behind the disk; not loading, or for another
  // apiVersion; no such package where the server is; a page served before the server took it; nothing said.
  {
    const shown = "the instance shows what it holds, read-only, so a reader can do nothing with it";
    const why = (more) => fallbackSaid("local/counter", { said: [], off: false, state: "normal", reason: null, ...more });
    assert.equal(why({ said: ["[DocKit] local/counter: Error: no count (kit.js:16)", "[DocKit] local/counter: TypeError: x"] }), `${shown}: its component failed as the page started it, and the console says [DocKit] local/counter: Error: no count (kit.js:16); [DocKit] local/counter: TypeError: x`);
    assert.equal(why({ said: ["SyntaxError: Unexpected token '{' (kit.js:3)", "[DocKit] local/counter: Error: its script ran and started no component"], unparsed: "SyntaxError: Unexpected token '{' (kit.js:3)" }), `${shown}: its kit.js did not parse, so no component of it started, and the console says SyntaxError: Unexpected token '{' (kit.js:3)`);
    assert.equal(why({ off: true }), `${shown}: local/counter is turned off in 设置 › 组件列表`);
    assert.equal(why({ behind: true, state: "none" }), `${shown}: the server has not taken local/counter as components/ holds it, where it loads: its catalog in use has no such custom block`);
    assert.equal(why({ behind: true, state: "disabled" }), `${shown}: the server has not taken local/counter as components/ holds it, where it loads: its catalog in use has it turned off`);
    assert.equal(why({ state: "disabled" }), `${shown}: local/counter is turned off in 设置 › 组件列表`);
    assert.equal(why({ state: "broken", reason: "component.json is no JSON" }), `${shown}: the server has local/counter as not loading (component.json is no JSON): gallery block check local/counter says why`);
    assert.equal(why({ state: "disabled", reason: "it is for apiVersion 2" }), `${shown}: the server has local/counter as not loading (it is for apiVersion 2): gallery block check local/counter says why`);
    assert.equal(why({ state: "none" }), `${shown}: the server has not taken local/counter as components/ holds it (its catalog in use has no such custom block)`);
    assert.equal(why({}), `${shown}: the page was served before the server took local/counter as components/ holds it, and did not load itself again with it`);
    assert.equal(why({ state: null }), `${shown}: its component failed or never started, and the console said nothing of it`);
  }


  // A mistake in the command line, before anything runs: exit 2, said with try's lines of the usage.
  fs.mkdirSync(workspace, { recursive: true });
  assert.equal((await gallery("init")).code, 0);
  const none = await gallery("component", "try", "nothing");
  assert.deepEqual([none.code, none.stderr.split(/\r?\n/)[0]], [2, "Say the gesture: --press <selector>, --drag <selector> --to <selector>, --key <selector> <key>, --type <selector> <words> or --select <selector> <value>; or --steps <file>."]);
  assert.deepEqual(TRY_SYNOPSIS.split("\n").map((line) => line.trim().replace(/^Usage: /, "").split(" ").slice(0, 6).join(" ")), Array(6).fill("gallery block try <slug> [<instance id>]"));
  assert.ok(none.stderr.endsWith(`\n${TRY_SYNOPSIS}   (gallery block --help says more)\n`), none.stderr);
  assert.equal((await gallery("component", "check", "kanban", "--keep")).code, 2, "--keep goes with try alone");
  assert.equal((await gallery("component", "check", "kanban", "--type", ".a", "x")).code, 2, "--type goes with try alone");
  assert.equal((await gallery("component", "try", "nothing", "--press", ".x", "--documents")).code, 2, "--documents goes with check alone");
  assert.equal((await gallery("component", "try", "nothing", "--press", ".x")).code, 1, "no such document");
  // The second argument of --key, --type and --select reaches try as the command line gives it (pairsOf
  // of component.mjs, the run's `seconds`): a document there is not, no mistake in the command line.
  for (const gesture of [["--key", ".a", "Enter"], ["--type", ".a", "多喝水"], ["--select", ".a", "杯"], ["--type", ".a", "x", "--then", "Enter"]]) {
    const ran = await gallery("component", "try", "nothing", ...gesture);
    assert.ok(ran.code === 1 && ran.stderr.startsWith('No document "nothing"'), `${gesture.join(" ")}: ${ran.stderr}`);
  }

  // The workspace: the official examples, a list that cancels dragover alone, the counter, the habit and
  // the brief, each in a document, the counter in six, five with a data-trial of their own, and in
  // the brief's slot; the habit in four, one that forgets, one that writes as the page comes to edit,
  // one whose field writes as it loses the focus; the scorecard's package is copied in later, right
  // before its first trial, and stands in three documents for check --documents: as its example, with
  // JSON that does not read, and in the brief's slot.
  const packages = { kanban: fixture("components", "local", "kanban"), scorecard: fixture("components", "local", "scorecard"), brief: fixture("components", "local", "brief"), "dragover-only": fixture("component-check", "local", "dragover-only"), counter: fixture("component-try", "local", "counter"), habit: fixture("component-try", "local", "habit") };
  for (const name of ["kanban", "brief", "dragover-only", "counter", "habit"]) fs.cpSync(packages[name], path.join(workspace, "components", "local", name), { recursive: true });
  const exampleOf = (name) => fs.readFileSync(path.join(packages[name], "example.html"), "utf8").trim();
  const put = (slug, markup) => fs.writeFileSync(fileOf(slug), read(slug).replace(/\n *<!-- Starter content:[^\n]*-->\n *<section\b[^>]*data-doc-placeholder[\s\S]*?<\/section>/, `\n    <p>前面一段。</p>\n${markup}\n    <p>后面一段。</p>`));
  const inBrief = (markup) => `<div class="brief" data-doc-component="local/brief">\n  <h3>要点</h3>\n  <div class="brief-body" data-doc-slot="body">\n    <p>一段话。</p>\n${markup}\n  </div>\n</div>`;
  const documents = { board: ["kanban"], scores: ["scorecard"], drops: ["dragover-only"], count: ["counter"], covered: ["counter", "covered"], kept: ["counter", "keeps-undo"], again: ["counter", "again"], undrawn: ["counter", "undrawn"], thrown: ["counter", "throws"], habit: ["habit"], forgets: ["habit", "forgets"], stamps: ["habit", "stamps"], blurs: ["habit", "blurs"] };
  for (const [slug, [name, trial]] of Object.entries(documents)) {
    assert.equal((await gallery("new", slug, `试${name}`)).code, 0);
    put(slug, exampleOf(name).replace("data-doc-component=", trial ? `data-trial="${trial}" data-doc-component=` : "data-doc-component="));
  }
  const more = { nested: inBrief(exampleOf("counter")), "scores-broken": exampleOf("scorecard").replace('"scale": 5,', '"scale": 5,,'), "scores-nested": inBrief(exampleOf("scorecard")) };
  for (const [slug, markup] of Object.entries(more)) {
    assert.equal((await gallery("new", slug, slug)).code, 0);
    put(slug, markup);
  }
  const two = await gallery("component", "try", "board", "--press", ".x", "local/kanban", "more");
  assert.equal(two.code, 2, "a document and an instance at most");
  // A package gallery.json turns off, before anything runs: said so, exit 1.
  const marker = path.join(workspace, "gallery.json");
  const settings = fs.readFileSync(marker, "utf8");
  fs.writeFileSync(marker, JSON.stringify({ ...JSON.parse(settings), components: { disabled: ["local/counter"] } }));
  const turnedOff = await gallery("component", "try", "count", "--press", ".counter-add");
  assert.deepEqual([turnedOff.code, turnedOff.stderr.split(/\r?\n/)[0]], [1, "local/counter is turned off in 设置 › 组件列表: its instances show what they hold, read-only, so a reader can do nothing with them."]);
  fs.writeFileSync(marker, settings);
  // The instances of a document with one in a slot, listed with where it stands when none is named;
  // steps files that do not read, before anything runs.
  const nestedList = await gallery("component", "try", "nested", "--press", ".x");
  assert.equal(nestedList.code, 2, nestedList.stdout + nestedList.stderr);
  assert.ok(nestedList.stderr.startsWith("nested holds 2 instances: name one, gallery block try nested <instance id> …\n  local/brief  local/brief at doc.html:15\n  local/counter  local/counter at doc.html:19, in the slot body of local/brief at doc.html:15\n"), nestedList.stderr);
  const stepsFile = (name, text) => {
    fs.writeFileSync(path.join(root, name), text);
    return path.join(root, name);
  };
  for (const [name, text, said] of [["steps-bad.json", '[{ "press": ".habit-add", "drag": ".x" }]', 'Step 1 of steps-bad.json: one gesture at a time: "press" or "drag".'], ["steps-nojson.json", "[{ press }]", "steps-nojson.json is no JSON: "]]) {
    const refused = await gallery("component", "try", "habit", "--steps", stepsFile(name, text));
    assert.ok(refused.code === 2 && refused.stderr.startsWith(said) && refused.stderr.includes(TRY_SYNOPSIS), refused.stderr);
  }
  assert.equal((await gallery("component", "try", "habit", "--steps", path.join(root, "steps-none.json"))).code, 2, "no steps file");

  if (findBrowser()) {
    let port = null;
    for (let candidate = high; candidate >= low && port === null; candidate--) if (await portIsFree(candidate)) port = candidate;
    assert.ok(port, `a free port in ${low}-${high}`);
    env.GALLERY_PORT = String(port);
    const lines = (stdout) => stdout.trimEnd().split(/\r?\n/);
    const picture = (slug, name = "after.png") => path.join(workspace, ".gallery", "qa", slug, "try", name);
    const opened = (slug, gesture) => `Picture of the instance after ${gesture}: ${picture(slug)} (${OPEN_IT})`;
    // The line after it, every picture of the run in one place, as qa's ends (a fresh.png too where the trial took one).
    const unopened = (slug, ...names) => unopenedSaid([{ folder: path.dirname(picture(slug)), files: [picture(slug), ...names.map((name) => picture(slug, name))] }]);
    // No scratch copy left, nor what the edit state keeps of one.
    const copiesLeft = () => [...fs.readdirSync(path.join(workspace, ".gallery", "try")), ...fs.readdirSync(path.join(workspace, ".gallery", "state"), { withFileTypes: true }).filter((entry) => entry.isDirectory()).flatMap(({ name }) => fs.readdirSync(path.join(workspace, ".gallery", "state", name)).filter((each) => each.startsWith("try-")))];
    const scratchPage = (slug) => new RegExp(`^Page: http://127\\.0\\.0\\.1:${port}/generated/try-[a-f0-9]{8}\\.html\\?agent \\(a scratch copy of ${slug}, its page alone, editable, made for this trial and gone at its end: doc\\.html is not written, and no page of the user's shows the trial; the server runs on after this command\\)$`);
    const okLine = (slug, gesture, part) => `OK   ${slug}: the ${gesture} wrote ${part}, one Ctrl+Z took it back, and a fresh page read it back; doc.html not written (a scratch copy)`;
    // What gallery block new --data writes, tried as it stands (testing the skill with Agents, a scaffold of none of it was of any use):
    // a document holding the template's instance, a line typed in its field and taken away by its button, one Ctrl+Z for
    // each write, a fresh page reading it back, and nothing noted: the scaffold passes the trial as it is.
    assert.equal((await gallery("component", "new", "--data", "local/jotter")).code, 0);
    assert.equal((await gallery("new", "jotted", "记事")).code, 0);
    put("jotted", fs.readFileSync(path.join(workspace, "components", "local", "jotter", "template.html"), "utf8").trim());
    const jotLine = await gallery("component", "try", "jotted", "--type", ".component-field", "买菜 38 元", "--then", "Enter");
    assert.equal(jotLine.code, 0, jotLine.stdout + jotLine.stderr);
    assert.ok(jotLine.stdout.includes('  - {"items":[]}\n  + {"items":[{"text":"买菜 38 元"}]}') && lines(jotLine.stdout).at(-1) === okLine("jotted", "typing", "items") && !jotLine.stdout.includes("\n  note "), jotLine.stdout);
    const jotted = await gallery("component", "try", "jotted", "--steps", stepsFile("steps-jot.json", JSON.stringify([{ type: [".component-field", "地铁"], then: "Enter" }, { press: ".component-remove" }])));
    assert.equal(jotted.code, 0, jotted.stdout + jotted.stderr);
    assert.ok(jotted.stdout.includes('  - {"items":[{"text":"地铁"}]}\n  + {"items":[]}') && lines(jotted.stdout).at(-1) === "OK   jotted: the steps wrote items, 2 Ctrl+Z took them back, and a fresh page read them back; doc.html not written (a scratch copy)" && !jotted.stdout.includes("\n  note "), jotted.stdout);
    assert.equal(read("jotted").includes("买菜"), false, "doc.html as it was: the trial was made on a copy");

    // The board: a card dragged to another column on a scratch copy, its row's line in the tasks part,
    // said line by line, and nothing else, one undo giving the copy back, a fresh page reading it back;
    // doc.html as it was to the byte and no copy left; the server started by the command, on the port asked for.
    const start = read("board");
    const dragged = await gallery("component", "try", "board", "--drag", ".kanban-card", "--to", ".kanban-column:nth-child(3)");
    server = JSON.parse(fs.readFileSync(path.join(process.env.GALLERY_DATA_DIR, "server.json"), "utf8")).pid;
    assert.equal(dragged.code, 0, dragged.stdout + dragged.stderr);
    const said = lines(dragged.stdout);
    assert.match(said[1], scratchPage("board"));
    assert.deepEqual([said[0], ...said.slice(2)], [
      `local/kanban in board, doc.html:15: ${fileOf("board")}`,
      'Gesture: a drag of .kanban-card (<li class="kanban-card"> "写发布说明 小王 · 11 月 8 日") to .kanban-column:nth-child(3) (<div class="kanban-column"> "已完成 1 确定版本号 小李 · 11 月 3 日"), with the pointer in 13 moves, released as it comes onto it',
      "Wrote: tasks (-1 +1 of its 8 lines); nothing outside the instance changed (data-block-id aside)",
      "  - <tr><td>写发布说明</td><td>待办</td><td>小王</td><td>11 月 8 日</td></tr>",
      "  + <tr><td>写发布说明</td><td>已完成</td><td>小王</td><td>11 月 8 日</td></tr>",
      "Undone: one Ctrl+Z, and the copy of doc.html is as it was (data-block-id aside)",
      "Read back: a fresh page of what the drag wrote (a copy of it): the instance mounts, writes nothing as it opens, and shows what the page showed after the drag",
      opened("board", "the drag"),
      unopened("board"),
      okLine("board", "drag", "tasks"),
    ]);
    assert.equal(read("board"), start, "doc.html as it was, to the byte: the trial was made on a copy");
    assert.deepEqual(copiesLeft(), [], "no copy left");
    assert.ok(fs.statSync(picture("board")).size > 1000, "its picture");
    // With --keep, on doc.html itself: the row moved and its status the column's, in the file, read back.
    const kept = await gallery("component", "try", "board", "--drag", ".kanban-card", "--to", ".kanban-column:nth-child(3)", "--keep");
    assert.equal(kept.code, 0, kept.stdout);
    assert.ok(lines(kept.stdout).includes("Kept (--keep): doc.html holds what the drag wrote") && kept.stdout.includes("OK   board: the drag wrote tasks, kept (--keep), and a fresh page read it back") && lines(kept.stdout)[1].startsWith(`Page: http://127.0.0.1:${port}/generated/board.html?agent (the document's page alone`), kept.stdout);
    const body = read("board").slice(read("board").indexOf("<tbody>"), read("board").indexOf("</tbody>"));
    assert.ok(body.trimEnd().endsWith("<tr><td>写发布说明</td><td>已完成</td><td>小王</td><td>11 月 8 日</td></tr>"), body);
    // A press on a card, which the board does not answer: nothing written, exit 1, with what came of it.
    const before = read("board");
    const pressed = await gallery("component", "try", "board", "--press", ".kanban-card");
    assert.equal(pressed.code, 1, pressed.stdout);
    assert.ok(pressed.stdout.includes("  FAIL doc.html:15: the press wrote nothing to the copy of doc.html: no context.edit came of it: the component answers no press there, or asked while context.canEdit() was false\n") && pressed.stdout.includes("FAIL board: 1 problem"), pressed.stdout);
    assert.equal(read("board"), before, "nothing written");
    // A selector that finds nothing in the instance: a mistake in the command line, with what it shows.
    const astray = await gallery("component", "try", "board", "--press", ".kanban-nope");
    assert.equal(astray.code, 2, astray.stdout + astray.stderr);
    assert.match(astray.stderr, /^Nothing in the instance is \.kanban-nope: what it shows has \.kanban-board, .*\.kanban-card\b/);
    // A drag onto the card it drags moves no pointer: a mistake in the command line too, said with try's lines.
    const itself = await gallery("component", "try", "board", "--drag", ".kanban-card", "--to", ".kanban-card");
    assert.equal(itself.code, 2, itself.stdout + itself.stderr);
    assert.ok(itself.stderr.startsWith('--drag and --to find the same element, <li class="kanban-card">: a drag ends where it is dropped') && itself.stderr.includes(TRY_SYNOPSIS), itself.stderr);
    assert.equal(read("board"), before, "nothing written");
    assert.deepEqual(copiesLeft(), [], "no copy left by a trial that ended in a mistake");

    // The scorecard: a press on a dot and a key on another, each one line of its JSON. The press right
    // after its package was copied into the workspace, as an Agent writes a package and tries it: the
    // page opened shows the instance as one of no package until the server takes the package, which
    // it hears of a moment later and loads itself again for. The key right after the package changed,
    // as an Agent mends one, the page loading itself again for it before the gesture.
    const scorecard = path.join(workspace, "components", "local", "scorecard");
    const scores = read("scores");
    const dot = (option, criterion, score) => `.scorecard-dot[data-option="${option}"][data-criterion="${criterion}"][data-score="${score}"]`;
    for (const [gesture, how] of [[["--press", dot(2, 2, 3)], "press"], [["--key", dot(0, 1, 5), "Enter"], "key"]]) {
      if (how === "press") fs.cpSync(packages.scorecard, scorecard, { recursive: true });
      else fs.appendFileSync(path.join(scorecard, "style.css"), "/* mended */\n");
      const ran = await gallery("component", "try", "scores", ...gesture);
      assert.equal(ran.code, 0, ran.stdout + ran.stderr);
      assert.ok(lines(ran.stdout).includes("Wrote: scores (-1 +1 of its 13 lines); nothing outside the instance changed (data-block-id aside)") && ran.stdout.includes(okLine("scores", how, "scores")), ran.stdout);
      assert.equal(read("scores"), scores, `${how}: doc.html as it was`);
    }

    // check --documents: the scorecard's instances in the workspace's documents, a section each,
    // sorted by slug: its example's, as the example passes; JSON that does not read, failing at its
    // line of that document's file, the console's words (context.readJSON's) at their line of kit.js; one in the brief's slot, taken out of it alone; no document written.
    const held = Object.fromEntries(["scores", "scores-broken", "scores-nested"].map((slug) => [slug, read(slug)]));
    const checked = await gallery("component", "check", "scorecard", "--documents");
    assert.equal(checked.code, 1, checked.stdout + checked.stderr);
    const sections = lines(checked.stdout).filter((line) => /^\d+\. /.test(line));
    assert.deepEqual(sections.slice(5).map((line) => line.replace(/: (ok|\d+ problems?).*$/, ": $1")), ["6. the instances in scores/doc.html, in a browser under the export's policy: ok", "7. the instances in scores-broken/doc.html, in a browser under the export's policy: 2 problems", "8. the instances in scores-nested/doc.html, in a browser under the export's policy: ok"], checked.stdout);
    assert.ok(lines(checked.stdout).includes("  FAIL scores-broken/doc.html:15: its component failed or never started: the instance shows what it holds, read-only") && lines(checked.stdout).some((line) => /^ {2}FAIL kit\.js:\d+: the console says \[DocKit\] local\/scorecard: Error: its part "scores" holds no JSON: /.test(line)), checked.stdout);
    assert.ok(lines(checked.stdout).some((line) => line.startsWith("  way back scores-nested/doc.html:19: its example wrote scores")), checked.stdout);
    assert.ok(fs.existsSync(path.join(workspace, ".gallery", "qa", "components", "local", "scorecard", "documents", "scores-nested", "overview-light.png")), "its pictures in documents/<slug>/");
    assert.deepEqual(Object.fromEntries(Object.keys(held).map((slug) => [slug, read(slug)])), held, "no document written");

    // A list that cancels dragover and not dragenter: the release, as the pointer comes onto a row,
    // drops nothing, exit 1 and nothing written; cancelling dragenter too, the drag writes its rows.
    const drops = read("drops");
    const refused = await gallery("component", "try", "drops", "--drag", "li:nth-child(1)", "--to", "li:nth-child(3)");
    assert.equal(refused.code, 1, refused.stdout);
    assert.ok(refused.stdout.includes("  FAIL doc.html:15: the drag wrote nothing to the copy of doc.html: an HTML5 drag started (dragstart on <li>) and nothing took its drop where it was released (dragend's dropEffect none): a list a card is dropped on cancels dragenter as well as dragover (preventDefault)") && refused.stdout.includes(opened("drops", "the drag")), refused.stdout);
    assert.equal(read("drops"), drops, "nothing written, to the byte");
    const script = path.join(workspace, "components", "local", "dragover-only", "kit.js");
    fs.writeFileSync(script, fs.readFileSync(script, "utf8").replace('list.addEventListener("dragover"', 'list.addEventListener("dragenter", (event) => event.preventDefault(), { signal: context.signal });\n    list.addEventListener("dragover"'));
    const dropped = await gallery("component", "try", "drops", "--drag", "li:nth-child(1)", "--to", "li:nth-child(3)");
    assert.equal(dropped.code, 0, dropped.stdout);
    assert.ok(lines(dropped.stdout).includes("Wrote: rows (-1 +1 of its 6 lines); nothing outside the instance changed (data-block-id aside)"), dropped.stdout);
    assert.equal(read("drops"), drops, "and doc.html as it was");

    // The habit: words typed in its field through an input method, then Enter, which writes them; ASCII
    // words with no Enter, which write nothing; an option chosen; one it has not and what is no <select>,
    // mistakes in the command line; words typed in its text part, which the editor writes.
    const habit = read("habit");
    const json = (name, unit = "杯", count = 3) => `{ "name": "${name}", "unit": "${unit}", "count": ${count} }`;
    const typed = await gallery("component", "try", "habit", "--type", ".habit-name", "多", "--then", "Enter");
    assert.equal(typed.code, 0, typed.stdout + typed.stderr);
    assert.deepEqual(lines(typed.stdout).slice(2, 6), ['Gesture: "多" typed in .habit-name (<input class="habit-name">), pressed first and the caret at its end: it held "喝水", and the words went after it (--replace, or "replace": true in a step, puts them in its place), through an input method, composed then committed, then Enter pressed where the focus was', "Wrote: habit (-1 +1 of its 1 line); nothing outside the instance changed (data-block-id aside)", `  - ${json("喝水")}`, `  + ${json("喝水多")}`]);
    assert.ok(typed.stdout.includes(okLine("habit", "typing", "habit")), typed.stdout);
    const unsent = await gallery("component", "try", "habit", "--type", ".habit-name", "Water");
    assert.equal(unsent.code, 1, unsent.stdout);
    assert.ok(unsent.stdout.includes('Gesture: "Water" typed in .habit-name (<input class="habit-name">), pressed first and the caret at its end: it held "喝水", and the words went after it (--replace, or "replace": true in a step, puts them in its place), key by key\n') && unsent.stdout.includes("  FAIL doc.html:15: the typing wrote nothing to the copy of doc.html: no context.edit came of it: the component answers no typing there, or writes what was typed only on a key or as the field loses the focus (then Enter, --then Enter)"), unsent.stdout);
    const chosen = await gallery("component", "try", "habit", "--select", ".habit-unit", "瓶");
    assert.equal(chosen.code, 0, chosen.stdout + chosen.stderr);
    assert.ok(lines(chosen.stdout).includes('Gesture: "瓶" chosen in .habit-unit (<select class="habit-unit"> "杯 瓶 次"), as a reader picks an option') && lines(chosen.stdout).includes(`  + ${json("喝水", "瓶")}`) && chosen.stdout.includes(okLine("habit", "choice", "habit")), chosen.stdout);
    const noOption = await gallery("component", "try", "habit", "--select", ".habit-unit", "罐");
    assert.ok(noOption.code === 2 && noOption.stderr.startsWith('.habit-unit has no option "罐": its options are 杯, 瓶, 次.'), noOption.stderr);
    const noSelect = await gallery("component", "try", "habit", "--select", ".habit-name", "杯");
    assert.ok(noSelect.code === 2 && noSelect.stderr.startsWith('.habit-name finds <input class="habit-name"> in the instance, which is no <select>'), noSelect.stderr);
    const titled = await gallery("component", "try", "habit", "--type", "h3", "今天");
    assert.equal(titled.code, 0, titled.stdout + titled.stderr);
    assert.ok(lines(titled.stdout).includes("Wrote: title (-1 +1 of its 1 line); nothing outside the instance changed (data-block-id aside)") && lines(titled.stdout).includes("  + 每天的习惯今天") && titled.stdout.includes(okLine("habit", "typing", "title")), titled.stdout);
    // Steps in one page: a press, all the field's words chosen, a name typed key by key then Enter, a
    // unit chosen; the second writes nothing, the others a line each, three Ctrl+Z, a fresh page.
    const steps = stepsFile("steps.json", JSON.stringify([{ press: ".habit-add" }, { key: [".habit-name", "Control+a"] }, { type: [".habit-name", "Water"], then: "Enter" }, { select: [".habit-unit", "次"] }]));
    const stepped = await gallery("component", "try", "habit", "--steps", steps);
    assert.equal(stepped.code, 0, stepped.stdout + stepped.stderr);
    assert.deepEqual(lines(stepped.stdout).filter((line) => /^(Steps|Step \d|Wrote|  [-+]|Undone|Read back|OK)/.test(line)), [
      `Steps: 4 from ${steps}, made one after another in one page`,
      'Step 1: a press on .habit-add (<button class="habit-add"> "+1"), with the pointer at its middle',
      "Wrote: habit (-1 +1 of its 1 line); nothing outside the instance changed (data-block-id aside)", `  - ${json("喝水")}`, `  + ${json("喝水", "杯", 4)}`,
      "Step 2: Control+a pressed with the focus given to .habit-name (<input class=\"habit-name\">), as Tab gives it",
      "Wrote: nothing",
      'Step 3: "Water" typed in .habit-name (<input class="habit-name">), where the focus was, all it held ("喝水") selected already (a step before), so that the words took its place, key by key, then Enter pressed where the focus was',
      "Wrote: habit (-1 +1 of its 1 line); nothing outside the instance changed (data-block-id aside)", `  - ${json("喝水", "杯", 4)}`, `  + ${json("Water", "杯", 4)}`,
      'Step 4: "次" chosen in .habit-unit (<select class="habit-unit"> "杯 瓶 次"), as a reader picks an option',
      "Wrote: habit (-1 +1 of its 1 line); nothing outside the instance changed (data-block-id aside)", `  - ${json("Water", "杯", 4)}`, `  + ${json("Water", "次", 4)}`,
      "Undone: 3 Ctrl+Z, one for each step that wrote, the last first, each giving the copy of doc.html back as it was before its step (data-block-id aside)",
      "Read back: a fresh page of what the steps wrote (a copy of it): the instance mounts, writes nothing as it opens, and shows what the page showed after the last step",
      "OK   habit: the steps wrote habit, 3 Ctrl+Z took them back, and a fresh page read them back; doc.html not written (a scratch copy)",
    ]);
    assert.ok(lines(stepped.stdout).includes(opened("habit", "the last step")), stepped.stdout);
    assert.equal(read("habit"), habit, "doc.html as it was");
    // Typing where the focus was already (a step before gave it): no press, so the words go in at the caret
    // where that step left it, after what the field holds only when it stands at its end (words typed
    // just before), inside it after Home, and the Gesture line says which.
    const caret = await gallery("component", "try", "habit", "--steps", stepsFile("steps-caret.json", JSON.stringify([{ type: [".habit-name", "x"] }, { type: [".habit-name", "y"], then: "Enter" }, { key: [".habit-name", "Home"] }, { type: [".habit-name", "z"], then: "Enter" }])));
    assert.equal(caret.code, 0, caret.stdout + caret.stderr);
    const caretSaid = lines(caret.stdout);
    assert.ok(caretSaid.includes('Step 2: "y" typed in .habit-name (<input class="habit-name">), where the focus was, the caret at its end: it held "喝水x", and the words went after it (--replace, or "replace": true in a step, puts them in its place), key by key, then Enter pressed where the focus was'), caret.stdout);
    assert.ok(caretSaid.includes('Step 4: "z" typed in .habit-name (<input class="habit-name">), where the focus was, the caret inside what it held ("喝水xy"), where a step before left it (a press puts it where the pointer lands, an arrow key moves it), so that the words went in there, not after it (--replace, or "replace": true in a step, puts them in its place), key by key, then Enter pressed where the focus was'), caret.stdout);
    assert.ok(caretSaid.includes(`  + ${json("喝水xy")}`) && caretSaid.includes(`  + ${json("z喝水xy")}`), caret.stdout);
    assert.equal(read("habit"), habit, "doc.html as it was");
    // A habit that writes the name typed under a key no mount reads, and draws it from memory: the
    // page shows it, a fresh page of what it wrote does not, exit 1, the fresh page pictured.
    const forgot = await gallery("component", "try", "forgets", "--type", ".habit-name", "多", "--then", "Enter");
    assert.equal(forgot.code, 1, forgot.stdout + forgot.stderr);
    // --replace: all the field holds selected first, so that the words take its place (and not go after it, as they do
    // without: "喝水多" in the fresh page's file above), said in the Gesture line.
    const replaced = await gallery("component", "try", "habit", "--type", ".habit-name", "多", "--replace", "--then", "Enter");
    assert.equal(replaced.code, 0, replaced.stdout + replaced.stderr);
    assert.ok(lines(replaced.stdout).some((line) => line.startsWith('Gesture: "多" typed in .habit-name (<input class="habit-name">), pressed first, all it held ("喝水") selected first (--replace), so that the words took its place, through an input method, composed then committed, then Enter pressed')), replaced.stdout);
    assert.ok(replaced.stdout.includes('+ { "name": "多"') || replaced.stdout.includes('"name":"多"') || /\+ .*"name": ?"多"/.test(replaced.stdout), replaced.stdout);
    assert.ok(!replaced.stdout.includes("喝水多"), "the words took the place of what the field held, none after it");
    assert.equal(read("habit"), habit, "doc.html as it was");
    const noType = await gallery("component", "try", "habit", "--press", ".habit-add", "--replace");
    assert.equal(noType.code, 2, noType.stdout);
    assert.match(noType.stderr, /^--replace goes with --type: it selects what the field holds before the words go in\./);
    assert.ok(forgot.stdout.includes(`  FAIL doc.html:15: a fresh page of what the typing wrote shows the instance otherwise than the page did after the typing: its field 1 (of 2) holds "喝水多" there and "喝水" here (the fresh page's picture: ${picture("forgets", "fresh.png")}), and what differs is of what the typing wrote ("喝水多", "喝水"). What it draws of what it wrote is to come from its parts alone`) && !forgot.stdout.includes("Read back:"), forgot.stdout);
    assert.ok(fs.statSync(picture("forgets", "fresh.png")).size > 500, "the fresh page pictured");
    // A habit that writes as the page comes to edit, with no gesture: the fresh page's write is saved
    // before its instance is listened to, and its file is found written, exit 1.
    const stamps = read("stamps");
    const stamped = await gallery("component", "try", "stamps", "--press", ".habit-add");
    assert.equal(stamped.code, 1, stamped.stdout + stamped.stderr);
    assert.ok(stamped.stdout.includes("  FAIL doc.html:15: a fresh page of what the press wrote writes habit (-1 +1 of its 1 line) with no gesture as it opens, so that a page would write each time it opened") && lines(stamped.stdout).includes("Undone: one Ctrl+Z, and the copy of doc.html is as it was (data-block-id aside)") && !stamped.stdout.includes("Read back:"), stamped.stdout);
    assert.equal(read("stamps"), stamps, "doc.html as it was");
    // A habit whose name field writes as it loses the focus too: words typed, then a press, which writes
    // the count and, the focus leaving the field, the name, two writes of one step, undone by two Ctrl+Z;
    // and a press, then words typed and left in the field, which leaving it before the undo writes, the
    // undo of the press taking that back too, the words a note: typed, never written by a step.
    const blurs = read("blurs");
    const blurred = await gallery("component", "try", "blurs", "--steps", stepsFile("steps-blur.json", JSON.stringify([{ type: [".habit-name", "x"] }, { press: ".habit-add" }])));
    assert.equal(blurred.code, 0, blurred.stdout + blurred.stderr);
    assert.deepEqual(lines(blurred.stdout).filter((line) => /^(Step \d|Wrote|  [-+]|Undone|Read back|OK)/.test(line)), [
      'Step 1: "x" typed in .habit-name (<input class="habit-name">), pressed first and the caret at its end: it held "喝水", and the words went after it (--replace, or "replace": true in a step, puts them in its place), key by key',
      "Wrote: nothing",
      'Step 2: a press on .habit-add (<button class="habit-add"> "+1"), with the pointer at its middle',
      "Wrote: habit (-1 +1 of its 1 line); nothing outside the instance changed (data-block-id aside)", `  - ${json("喝水")}`, `  + ${json("喝水x", "杯", 4)}`,
      "Undone: 2 Ctrl+Z for the 1 step that wrote, one for each write the page took, the last first, each step's giving the copy of doc.html back as it was before it (data-block-id aside)",
      "Read back: a fresh page of what the steps wrote (a copy of it): the instance mounts, writes nothing as it opens, and shows what the page showed after the last step",
      "OK   blurs: the steps wrote habit, 2 Ctrl+Z took them back, and a fresh page read them back; doc.html not written (a scratch copy)",
    ]);
    const left = await gallery("component", "try", "blurs", "--steps", stepsFile("steps-left.json", JSON.stringify([{ press: ".habit-add" }, { type: [".habit-name", "x"] }])));
    assert.equal(left.code, 0, left.stdout + left.stderr);
    assert.ok(lines(left.stdout).includes("Undone: 2 Ctrl+Z for the 1 step that wrote, one for each write the page took, the last first, each step's giving the copy of doc.html back as it was before it (data-block-id aside)") && lines(left.stdout).includes("Read back: a fresh page of what the steps wrote (a copy of it): the instance mounts, writes nothing as it opens, and shows what the page showed after the last step of what they wrote; what else the page showed there, which nothing wrote, it does not (the note)"), left.stdout);
    assert.ok(left.stdout.includes(`  note doc.html:15: a fresh page of what the steps wrote shows the instance otherwise than the page did after the last step: its field 1 (of 2) holds "喝水x" there and "喝水" here; none of it is of what the steps wrote, and a fresh page keeps no filter or tab chosen, no editor left open, no words typed and not committed (--then Enter commits them), and need not. Its picture: ${picture("blurs", "fresh.png")}. What a reader keeps belongs in a part`), left.stdout);
    assert.ok(lines(left.stdout).includes(unopened("blurs", "fresh.png")) && lines(left.stdout).at(-1).startsWith("OK   blurs:") && lines(left.stdout).at(-2) === unopened("blurs", "fresh.png"), "after.png and fresh.png both listed, right before the verdict");
    assert.equal(read("blurs"), blurs, "doc.html as it was");
    // A line the habit shows and hides (更多) and never writes, shown by a step before the press that
    // writes: the fresh page does not show it, which is no problem, a note.
    const viewed = await gallery("component", "try", "habit", "--steps", stepsFile("steps-view.json", JSON.stringify([{ press: ".habit-more" }, { press: ".habit-add" }])));
    assert.equal(viewed.code, 0, viewed.stdout + viewed.stderr);
    assert.ok(viewed.stdout.includes('  note doc.html:15: a fresh page of what the steps wrote shows the instance otherwise than the page did after the last step: its words read "每天的习惯 杯 瓶 次 4 +1 更多 坚持就好" there and "每天的习惯 杯 瓶 次 4 +1 更多" here') && viewed.stdout.includes("OK   habit: the steps wrote habit, one Ctrl+Z took them back, and a fresh page read them back"), viewed.stdout);
    assert.equal(read("habit"), habit, "doc.html as it was");
    // With --keep, a mistake found at the second step, an option the <select> has not, after the first
    // wrote doc.html: what the first wrote is said, and that doc.html keeps it, before the mistake (exit 2).
    const mistaken = await gallery("component", "try", "habit", "--steps", stepsFile("steps-mistake.json", JSON.stringify([{ press: ".habit-add" }, { select: [".habit-unit", "罐"] }])), "--keep");
    assert.equal(mistaken.code, 2, mistaken.stdout + mistaken.stderr);
    assert.ok(lines(mistaken.stdout).includes(`  + ${json("喝水", "杯", 4)}`) && lines(mistaken.stdout).at(-1) === "Kept (--keep): doc.html holds what step 1 wrote, which stays; step 2 was not made, for the mistake below" && mistaken.stderr.startsWith('.habit-unit has no option "罐": its options are 杯, 瓶, 次.'), mistaken.stdout + mistaken.stderr);
    assert.ok(read("habit").includes(json("喝水", "杯", 4)), "doc.html holds what step 1 wrote");
    fs.writeFileSync(fileOf("habit"), habit);

    // The counter in the brief's slot: tried as any, said with where it stands.
    const nested = read("nested");
    const slotted = await gallery("component", "try", "nested", "counter", "--press", ".counter-add");
    assert.equal(slotted.code, 0, slotted.stdout + slotted.stderr);
    assert.ok(lines(slotted.stdout)[0] === `local/counter in nested, doc.html:19, in the slot body of local/brief at doc.html:15: ${fileOf("nested")}` && lines(slotted.stdout).includes(`  + { "count": 4 }`) && slotted.stdout.includes(okLine("nested", "press", "count")), slotted.stdout);
    assert.equal(read("nested"), nested, "doc.html as it was");

    // The counter: a press its pointerdown answers, as a reader's press and no click() of the DOM's
    // makes one, one line of its JSON and undone; a key on its count, which takes no focus; a press a
    // box drawn over the button takes.
    const count = read("count");
    const press = (slug) => gallery("component", "try", slug, "--press", ".counter-add");
    const counted = await press("count");
    assert.equal(counted.code, 0, counted.stdout + counted.stderr);
    assert.ok(lines(counted.stdout).includes("Wrote: count (-1 +1 of its 1 line); nothing outside the instance changed (data-block-id aside)") && counted.stdout.includes(okLine("count", "press", "count")), counted.stdout);
    assert.equal(read("count"), count, "doc.html as it was");
    const unfocused = await gallery("component", "try", "count", "--key", ".counter-count", "Enter");
    assert.equal(unfocused.code, 1, unfocused.stdout);
    assert.ok(unfocused.stdout.includes("FAIL doc.html:15: the key wrote nothing to the copy of doc.html: the element takes no focus (a button, a field or a tabindex), so the key went to <body>"), unfocused.stdout);
    const covered = read("covered");
    const under = await press("covered");
    assert.equal(under.code, 1, under.stdout);
    assert.ok(under.stdout.includes('FAIL doc.html:15: the press wrote nothing to the copy of doc.html: the press landed on <div class="counter-cover">, which stands over it there'), under.stdout);
    assert.equal(read("covered"), covered, "nothing written, to the byte");
    // A Ctrl+Z the component keeps from the page while its button has the focus, where a reader's press
    // leaves it: the undo wrote nothing, which the copy keeps and doc.html never holds.
    const unkept = read("kept");
    const keeps = await press("kept");
    assert.equal(keeps.code, 1, keeps.stdout);
    assert.ok(keeps.stdout.includes("  FAIL doc.html:15: one Ctrl+Z wrote nothing, so the copy of doc.html keeps what the press wrote: a reader's undo does not take it back") && lines(keeps.stdout).includes("Wrote: count (-1 +1 of its 1 line); nothing outside the instance changed (data-block-id aside)"), keeps.stdout);
    assert.equal(read("kept"), unkept, "doc.html as it was");
    // A component that writes its highest count back as the undo takes the part below it: after one
    // Ctrl+Z the copy is not as it was.
    const again = await press("again");
    assert.equal(again.code, 1, again.stdout);
    assert.ok(again.stdout.includes("  FAIL doc.html:15: after one Ctrl+Z the copy of doc.html is not as it was, count (-1 +1 of its 1 line) still differing: a reader's undo does not give it back"), again.stdout);
    // A component that draws nothing and throws a moment after its mount: no selector finds what a
    // reader would press, which is the component's failure, with what the console says.
    const undrawn = await press("undrawn");
    assert.equal(undrawn.code, 1, undrawn.stdout + undrawn.stderr);
    assert.ok(undrawn.stdout.includes("  FAIL doc.html:15: nothing in the instance is .counter-add: it shows nothing with a class; its component did not draw it, and the console says why\n") && /\n {2}FAIL kit\.js:\d+: the console says ReferenceError: missingHelper is not defined\n/.test(undrawn.stdout), undrawn.stdout);
    // A component that throws as it mounts, which the kit answers by showing what the instance holds,
    // read-only: a failure at once, in the words of the console, at their line of kit.js.
    const thrown = await press("thrown");
    assert.equal(thrown.code, 1, thrown.stdout + thrown.stderr);
    assert.match(thrown.stdout, /\n {2}FAIL doc\.html:15: the instance shows what it holds, read-only, so a reader can do nothing with it: its component failed as the page started it, and the console says \[DocKit\] local\/counter: Error: no count to start from \(kit\.js:16\)\n/);
    assert.ok(!thrown.stdout.includes("FAIL kit.js:") && thrown.stdout.includes("FAIL thrown: 1 problem"), thrown.stdout);
    // A kit.js that does not parse: no component of it starts, a failure in the words of its
    // SyntaxError at their line, which the kit's words on a script that started nothing do not stand for.
    const counterKit = path.join(workspace, "components", "local", "counter", "kit.js");
    const counterManifest = path.join(workspace, "components", "local", "counter", "component.json");
    const [mounts, manifestWhole] = [fs.readFileSync(counterKit, "utf8"), fs.readFileSync(counterManifest, "utf8")];
    const unparsable = `${mounts}\n}{ this does not parse\n`;
    fs.writeFileSync(counterKit, unparsable);
    await pause(FIRST_LOOK + QUIET + 1000); // the server takes it
    const unparsed = await press("count");
    assert.equal(unparsed.code, 1, unparsed.stdout + unparsed.stderr);
    const unparsedAt = unparsable.split("\n").indexOf("}{ this does not parse") + 1;
    assert.ok(lines(unparsed.stdout).some((line) => new RegExp(`^ {2}FAIL doc\\.html:15: the instance shows what it holds, read-only, so a reader can do nothing with it: its kit\\.js did not parse, so no component of it started, and the console says SyntaxError: .* \\(kit\\.js:${unparsedAt}\\)$`).test(line)), unparsed.stdout);
    assert.ok(!unparsed.stdout.includes("started no component") && !unparsed.stdout.includes("note the page") && unparsed.stdout.includes("FAIL count: 1 problem"), unparsed.stdout);
    // A package whose mount throws, mended while the trial waits for the server: the page opened first
    // throws as it mounts; the manifest is half written as the command starts, for which the server
    // keeps the package as it was (a Waiting line); once that is said, kit.js mounts and the manifest
    // is whole again, the server takes them and the page loads itself again with them, taken again,
    // what the page before said heard no more: the press writes, and one undo takes it back.
    fs.writeFileSync(counterKit, mounts.replace("mount(host, context) {", 'mount(host, context) {\n    throw new Error("no count yet");'));
    await pause(FIRST_LOOK + QUIET + 1000);
    let mended = false;
    const retaken = await watched(["component", "try", "count", "--press", ".counter-add"], (line) => {
      if (line.startsWith("local/counter in count")) fs.writeFileSync(counterManifest, manifestWhole.slice(0, 40));
      if (!line.startsWith("Waiting: ") || mended) return;
      mended = true;
      fs.writeFileSync(counterKit, mounts);
      fs.writeFileSync(counterManifest, manifestWhole);
    });
    assert.equal(retaken.code, 0, retaken.stdout + retaken.stderr);
    assert.ok(mended && lines(retaken.stdout).some((line) => /^Waiting: local\/counter does not load as components\/ holds it /.test(line)) && lines(retaken.stdout).some((line) => /^Waited [\d.]+s: the page loaded itself again$/.test(line)), retaken.stdout);
    assert.ok(retaken.stdout.includes(okLine("count", "press", "count")) && !retaken.stdout.includes("no count yet"), retaken.stdout);
    assert.equal(read("count"), count, "doc.html as it was");
    assert.deepEqual(copiesLeft(), [], "no copy left by any trial");

    // With --keep, the board's drag with the file written by someone else as the drag's write lands,
    // outside the instance: the drag's write and theirs both stay, and the trial is unverified.
    const during = async (slug, args, then) => {
      const start = read(slug);
      const peek = () => {
        try {
          return read(slug);
        } catch {
          return start; // being replaced (a write's rename)
        }
      };
      let done = false;
      const ran = gallery(...args).finally(() => { done = true; });
      while (!done && peek() === start) await new Promise((resolve) => setTimeout(resolve, 5));
      if (!done) then();
      return ran;
    };
    const rows = (text) => withoutIds(text.slice(text.indexOf("<tbody>"), text.indexOf("</tbody>")));
    const boarded = read("board");
    const moved = ["component", "try", "board", "--drag", ".kanban-card", "--to", ".kanban-column:nth-child(2)", "--keep"];
    const written = await during("board", moved, () => fs.writeFileSync(fileOf("board"), read("board").replace("前面一段。", "前面一段，有人改了。")));
    assert.equal(written.code, 3, written.stdout);
    assert.ok(lines(written.stdout).includes("Kept (--keep): doc.html holds what the drag wrote") && lines(written.stdout).includes("UNVERIFIED board: someone else wrote doc.html meanwhile, outside the instance's parts (the user's page, an Agent), which stays: try it again once the file holds still") && written.stdout.includes("\nWrote: tasks (-1 +1 of its 8 lines); outside the instance's parts -1 +1 lines someone else wrote meanwhile"), written.stdout);
    assert.ok(read("board").includes("前面一段，有人改了。") && rows(read("board")) !== rows(boarded), "theirs stays, and the drag's");
    fs.writeFileSync(fileOf("board"), boarded);
    // And with the server gone as the drag's write lands: unverified, the write kept in doc.html.
    const gone = await during("board", moved, () => {
      process.kill(JSON.parse(fs.readFileSync(path.join(process.env.GALLERY_DATA_DIR, "server.json"), "utf8")).pid);
      server = null;
    });
    assert.equal(gone.code, 3, gone.stdout);
    assert.match(gone.stdout, /\nUNVERIFIED board: /);
    assert.notEqual(rows(read("board")), rows(boarded), "the drag's write stays");

    assert.equal((await gallery("stop")).code, 0);
  }
} finally {
  if (server && processRuns(server)) {
    try {
      process.kill(server);
    } catch {} // gone meanwhile
  }
  if (previousData === undefined) delete process.env.GALLERY_DATA_DIR;
  else process.env.GALLERY_DATA_DIR = previousData;
  fs.rmSync(root, { recursive: true, force: true, maxRetries: 5 });
}

console.log(`Checked gallery block try: its command line (the gestures, --then, --steps) and its mistakes said with its usage, a steps file read, the instance it names (one in a slot too), a drag's last move onto its target, what tells two files apart and the lines themselves, two pages' words told apart, the scratch copy made and taken away, when the server has told its pages of a write and taken a package as the disk holds it, the wait for it, what a page says, why an instance shows what it holds, read-only, and what a trial says, cut off or not${findBrowser() ? "; and in a browser, on a scratch copy, doc.html never written and no copy left: a board's drag undone and read back, and kept with --keep, a scorecard's press and key, each one line of its data part, the press right after its package was copied in, check --documents of the scorecard's instances in three documents, a list that refuses a drop writing nothing, a press nothing answers, a selector that finds nothing, a drag onto itself, a habit's words typed through an input method then Enter, words with no Enter writing nothing, an option chosen, one it has not and what is no select, words in its text part, steps of them all in one page, a habit whose write no fresh page reads back, one that writes as the page comes to edit, a step that writes twice and words that write as the field loses the focus, undone write by write, a line shown and never written, a mistake at a later step with --keep, a counter in a slot, a counter's pointerdown, a key on what takes no focus, a covered press, a Ctrl+Z the component keeps, an undo it writes over, a component that draws nothing and throws, one that throws as it mounts, a script that does not parse, a package mended while the trial waits, and with --keep someone else's write during the drag and the server gone after it" : " (no browser: the gestures not made)"}.`);
