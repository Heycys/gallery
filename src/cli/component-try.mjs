import { randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { shownSource } from "../editor/source.mjs";
import { HOLD, QUIET } from "../editor/settle.mjs";
import { parseReport } from "../render/report-tree.mjs";
import { FIRST_LOOK } from "../server/catalog-watch.mjs";
import { problemIn, readCatalog } from "../shared/component-catalog.mjs";
import { isInstance, isSlot, partOf } from "../shared/components/index.mjs";
import { ATTRIBUTE, FALLBACK, FIELDS, INSTANCE, PACKAGE_ID, SLOT } from "../shared/components/installed.mjs";
import { attr, walk } from "../shared/html-tree.mjs";
import { defaultWorkspace, documentDirectory, documentFiles, layoutOf, packageFolders, slugTaken } from "../shared/workspace.mjs";
import { closed, findBrowser, lookingArguments, startBrowser } from "../transfer/browser.mjs";
import { documentNamed, UsageError } from "./arguments.mjs";
import { LAID_ANEW, LOADING, QUERIES, STEP, STILL, answered, changedLines, firstLine, laidAnewOf, linesChanged, partsSaid, refuseDialogs, stuckSaid, wentAway, watchQueries } from "./component-look.mjs";
import { unopenedSaid } from "./qa.mjs";
import { shown } from "./report-start.mjs";
import { agentPageOf, serverFor } from "./server-process.mjs";

// gallery block try <slug> [<instance id>] <gesture> [--then <key>] [--keep] | --steps <file> [--keep]
// (./usage.mjs): what a reader does to an instance of a document, made in its page, for an Agent to see
// what it writes, the gestures its component answers and not the `example` that gallery block check
// runs. A gesture is --press <selector>, --drag <selector> --to <selector>, --key <selector> <key>,
// --type <selector> <words> or --select <selector> <value>, --then <key> a key pressed after it where the
// focus is; --steps <file> a JSON list of them (stepsOf), made one after another in one page. The
// instance is any of the document's, one in another's slot too (instancesIn), named by its data-block-id
// or its package's id. By default the trial is made on a scratch copy of the document (its doc.html, its
// doc.json and assets/, in .gallery/try/try-<8 hex>/, which shared/workspace.mjs documentDirectory serves as
// any document's and lists nowhere): doc.html is never written, no page of the user's shows the trial,
// and the copy goes at its end, whatever came of it, never left to an undo; --keep makes it on the
// document itself and leaves what it wrote. The copy's page alone, editable (Agent 自用, server-process.mjs
// agentPageOf), opens on the workspace's server, found or started as gallery open does, in the browser
// gallery qa and the check look in, headless, in a profile of its own; the first gesture waits until the
// server has told its pages of each write the disk holds (toldBy): a page opened a moment after its
// package changed hears of that a moment later and loads itself again, and is taken again as it comes
// to edit, what the page before it said forgotten (takenAgain); one served before the server took the
// instance's package as the disk holds it, the instance in its fallback, is waited for until it loads
// again with it (untilTaken, by the server's rule, a wait of more than a moment said), and an instance
// that stays in its fallback is a problem, said in the console's words (a script that does not parse by
// its SyntaxError, at its line) or by what the server holds of its package (fallbackSaid). Each gesture
// is made with the pointer and the keys as a reader makes it, each selector the first element of the
// instance it finds: a press at the middle of its element; a drag pressed there, moved in steps to the
// middle of another and released a moment after the move that comes onto it, as a reader lets go on a
// card's words (a list that cancels dragover and not dragenter drops nothing then, which the check
// notes); a key pressed with the focus on its element, as Tab gives it; words typed in a field or an
// editable element pressed first (unless the focus is in it already), the caret at its end, ASCII key by
// key and the rest through an input method, composed and then committed (Input.imeSetComposition, then
// Input.insertText, as Microsoft Pinyin sends them); an option of a <select> chosen, by its value or its
// words, as a reader picks one. What each wrote is what the file holds once <html>'s data-ge-save says
// saved again: the instance's parts, each with the lines it took out and put in, said line by line
// (linesChanged, changedLines, as the check's way back counts them), and what changed outside them,
// which no component writes and is someone else's, the file read as the page shows it (shownSource: a
// first save of an edit writes an Agent's plain HTML as the kit's markup) and with data-block-id taken
// out, which a save gives the blocks it writes. Then a picture of the instance, and the undo as a reader
// makes it: the focus off a field of the instance first (what a field that writes as it loses the focus
// writes then is undone with the last step that wrote), then a Ctrl+Z for each write the page took, the
// last first, each context.edit an undo step of its own (a step that wrote twice takes two), until the
// parts are as they were before each step that wrote, ids aside; --keep makes none. Last, the file as the
// steps left it opened in a fresh page (a second scratch copy, or the document with --keep), where the
// instance is to mount, write nothing as it opens (its file the same once the page has come to edit and
// holds still, a write as it comes to edit too) and show the words and the fields' values it showed
// after the last step of what they wrote: what it wrote reads back as what it drew. What the fresh page
// shows otherwise that is none of what the steps wrote (writtenOtherwise: what the page showed and
// never wrote, a filter, an editor left open) is a note, not a problem. Steps that wrote nothing at all
// are a problem, with what came of the last (no context.edit, one refused, a drag dropped nowhere). A
// trial cut off (the page offline, a load of its own, the browser gone) says what the file held then.
// A mistake found in a step after others were made says what those wrote first (madeSaid: with --keep,
// doc.html holds it). Exits 0 when the steps wrote, the undos took it back (or --keep kept it) and a
// fresh page read it back; 1 for a problem of the package's; 2 for a mistake in the command line (an
// instance or a selector the page has not among them, a drag that ends where it starts, a steps file
// that does not read); 3 when the trial was not seen through (no server or browser, a page that loaded
// itself again, someone else's write meanwhile with --keep). The trial itself (trial, with its read
// back) takes where it is made as its host (documentHost here): gallery page try (./page-try.mjs) makes
// the same gestures, undo and read back on a custom page's card through a host of its own.

const STEPS = 10; // the moves of a drag between its start and the one that comes onto its target
const NUDGE = 6; // how far a drag moves first, in pixels: past what starts a drag
const SHORT = 3; // how far short of its target the move before the last stands, in pixels
const RELEASE = 100; // how long a drag holds still before its release, in ms: a frame or more
const WIDTH = 1024;
const HEIGHT = 900;
const TALLEST = 4000; // how tall the window grows to hold the whole instance
// How long the page may take to come to edit.
export const READY = 30_000;
// How long a write may take to begin after a gesture or an undo (a component that writes once a
// transition ends), and to reach the file.
export const BEGIN = 1500;
export const SAVING = 30_000;
// How long a page told of a write takes to load itself again, at most.
const MOMENT = 500;
// How long past the server's take of a package a page served before it is waited for to load itself
// again with it, at most: the wait ends as the page loads, looked at each TAKEN_STEP ms.
const TOLD = 5000;
const TAKEN_STEP = 200;
// The most steps a file may hold.
const MOST_STEPS = 20;
// What a written line is cut to, and how many of a part's are said.
const LINE_SAID = 160;
const LINES_SAID = 12;
// How old a scratch copy left by a trial that never ended is, at least, before another trial takes it away.
const STALE = 60 * 60 * 1000;
// The letters an input method composes before it commits a run of words that is no ASCII.
const COMPOSED = ["p", "pi", "pin"];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** The keys a reader presses, as `written` names them: one key (Enter, Space, ArrowRight, a letter) or modifiers and a key joined by "+" (Shift+Tab). */
export async function keysOf(written) {
  const { _keyDefinitions: known } = await import("puppeteer-core/internal/common/USKeyboardLayout.js");
  const keys = Object.hasOwn(known, written) ? [written] : written.split("+");
  const modifiers = new Set(["Control", "Shift", "Alt", "Meta"]);
  if (keys.some((key) => !Object.hasOwn(known, key)) || keys.slice(0, -1).some((key) => !modifiers.has(key))) {
    throw new UsageError(`Not a key: ${written} (a key as a browser names it, Enter, Space, Escape, Tab, ArrowRight, a letter or a digit, after modifiers joined by "+": Shift+Tab, Control+Enter).`);
  }
  return keys;
}

/** The gestures of a step, by the name a steps file gives each (the command line's, without its --), what each takes. */
export const GESTURES = { press: "<selector>", drag: "<selector>, with \"to\": <selector>", key: "[<selector>, <key>]", type: "[<selector>, <words>]", select: "[<selector>, <value>]" };

/**
 * A step as a steps file writes it, or as the command line gives one (`where`: "step 2 of steps.json",
 * or null): { kind, at, to?, keys?, key?, text?, value?, then? }, `then` { keys, key }, a key pressed
 * after the gesture where the focus is. One gesture a step; what it takes, written as GESTURES says.
 */
export async function stepOf(fields, where = null) {
  const said = (message) => new UsageError(where ? `${where[0].toUpperCase()}${where.slice(1)}: ${message}` : `${message[0].toUpperCase()}${message.slice(1)}`);
  if (!fields || typeof fields !== "object" || Array.isArray(fields)) throw said(`a step is an object naming one gesture: ${Object.entries(GESTURES).map(([name, takes]) => `"${name}": ${takes}`).join(", ")}, and "then": <key> after it.`);
  const unknown = Object.keys(fields).filter((name) => !Object.hasOwn(GESTURES, name) && !["to", "then", "replace"].includes(name));
  if (unknown.length) throw said(`no such field: ${unknown.join(", ")} (a step names one of ${Object.keys(GESTURES).join(", ")}, "to" with a drag, "replace": true with typing and "then" after any).`);
  const asked = Object.keys(GESTURES).filter((name) => fields[name] !== undefined);
  const option = (name) => (where ? `"${name}"` : `--${name}`);
  if (asked.length !== 1) throw said(asked.length ? `one gesture at a time: ${asked.map(option).join(" or ")}.` : where ? `name the gesture: ${Object.keys(GESTURES).map(option).join(", ")}.` : "Say the gesture: --press <selector>, --drag <selector> --to <selector>, --key <selector> <key>, --type <selector> <words> or --select <selector> <value>; or --steps <file>.");
  const [kind] = asked;
  if (fields.to !== undefined && kind !== "drag") throw said(`${option("to")} goes with ${option("drag")}: ${where ? '"drag": <selector>, "to": <selector>' : "--drag <selector> --to <selector>"}.`);
  if (kind === "drag" && fields.to === undefined) throw said(`${option("drag")} takes ${option("to")}: ${where ? '"drag": <selector>, "to": <selector>' : "--drag <selector> --to <selector>"}, where it is dropped.`);
  if (fields.replace !== undefined && kind !== "type") throw said(`${option("replace")} goes with ${option("type")}: it selects what the field holds before the words go in.`);
  if (fields.replace !== undefined && fields.replace !== true) throw said(`${option("replace")} is true: ${where ? '"replace": true' : "--replace"} selects what the field holds before the words go in.`);
  const text = (value, what) => {
    if (typeof value !== "string" || !value) throw said(`${what} is words: ${JSON.stringify(value)}.`);
    return value;
  };
  const pair = (value, second) => {
    if (!Array.isArray(value) || value.length !== 2) throw said(`${option(kind)} takes ${where ? `[<selector>, ${second}]` : `<selector> ${second}`}.`);
    return [text(value[0], "a selector"), text(value[1], second)];
  };
  const step = { kind };
  if (kind === "press") step.at = text(fields.press, "a selector");
  if (kind === "drag") Object.assign(step, { at: text(fields.drag, "a selector"), to: text(fields.to, "a selector") });
  if (kind === "key") {
    const [at, key] = pair(fields.key, "<key>");
    Object.assign(step, { at, key, keys: await keysOf(key) });
  }
  if (kind === "type") {
    [step.at, step.text] = pair(fields.type, "<words>");
    if (fields.replace) step.replace = true;
  }
  if (kind === "select") [step.at, step.value] = pair(fields.select, "<value>");
  if (fields.then !== undefined) step.then = { key: text(fields.then, "a key"), keys: await keysOf(text(fields.then, "a key")) };
  return step;
}

/**
 * The gesture the command line asks for (`values`, the options' values; `seconds`, what --key, --type and
 * --select take after their selector; `replace`, --replace: what --type's field holds is selected before the words go
 * in): a step (stepOf), or null with --steps, which the file holds.
 */
export async function gestureOf(values, seconds = {}, replace = false) {
  if (replace && values.has("--steps")) throw new UsageError('--steps <file> holds every gesture: --replace goes in a step of it, as { "type": [".name", "新名字"], "replace": true }, not beside it.');
  if (values.has("--steps")) {
    const beside = ["--press", "--drag", "--to", "--key", "--type", "--select", "--then"].filter((name) => values.has(name));
    if (beside.length) throw new UsageError(`--steps <file> holds every gesture: ${beside.join(", ")} goes in it, not beside it.`);
    return null;
  }
  const fields = {};
  for (const name of ["press", "drag", "to", "then"]) if (values.has(`--${name}`)) fields[name] = values.get(`--${name}`);
  for (const name of ["key", "type", "select"]) if (values.has(`--${name}`)) fields[name] = [values.get(`--${name}`), seconds[`--${name}`]];
  if (replace) fields.replace = true;
  return stepOf(fields);
}

/**
 * The steps of the file at `file`: a JSON list of steps (stepOf), MOST_STEPS at most. One that is not
 * there or does not read, and a step that is no step, are mistakes in the command line.
 */
export async function stepsOf(file) {
  const name = path.basename(file);
  let text;
  try {
    text = await fsp.readFile(file, "utf8");
  } catch (error) {
    throw new UsageError(`No steps file: ${shown(file)} (${error.code ?? firstLine(error)}).`);
  }
  let list;
  try {
    list = JSON.parse(text.replace(/^﻿/, ""));
  } catch (error) {
    throw new UsageError(`${name} is no JSON: ${firstLine(error)}. A steps file is a list of steps, as [{ "press": ".add" }, { "type": [".name", "新名字"], "then": "Enter" }].`);
  }
  if (!Array.isArray(list) || list.length === 0) throw new UsageError(`${name} holds no list of steps: write [{ "press": ".add" }, { "type": [".name", "新名字"], "then": "Enter" }].`);
  if (list.length > MOST_STEPS) throw new UsageError(`${name} holds ${list.length} steps, and a trial makes ${MOST_STEPS} at most: try fewer at a time.`);
  const steps = [];
  for (const [index, fields] of list.entries()) steps.push(await stepOf(fields, `step ${index + 1} of ${name}`));
  return steps;
}

// The instance around a parsed node, or null.
const instanceAround = (node) => {
  let around = node.parentNode;
  while (around && !isInstance(around)) around = around.parentNode;
  return around ?? null;
};

// The name of the slot of `outer` that a parsed node stands in, or null.
const slotAround = (node, outer) => {
  for (let around = node.parentNode; around && around !== outer; around = around.parentNode) if (isSlot(around)) return attr(around, SLOT);
  return null;
};

/**
 * The instances of component packages `text` holds, those in another's slot too, in its order, as the
 * page finds them (hostAt): [{ element, id, blockId, line, in }], `in` the instance it stands in ({ id,
 * line, slot: the slot's name, or null }) or null.
 */
export function instancesIn(text) {
  const found = [];
  walk(parseReport(text), (node) => {
    if (!isInstance(node)) return;
    const outer = instanceAround(node);
    found.push({ element: node, id: attr(node, ATTRIBUTE), blockId: attr(node, "data-block-id") ?? null, line: node.sourceCodeLocation?.startLine, in: outer ? { id: attr(outer, ATTRIBUTE), line: outer.sourceCodeLocation?.startLine, slot: slotAround(node, outer) } : null });
  }, { inTemplates: false });
  return found;
}

/** Where an instance stands (instancesIn's), as a line names it: in the file, and in what slot of what. */
export const placeSaid = ({ line, in: outer }, name) => `${name}:${line}${outer ? `, in ${outer.slot ? `the slot ${outer.slot} of ` : ""}${outer.id} at ${name}:${outer.line}` : ""}`;

// How an instance is named on the command line: its id, else its package's when it is the one of it there.
const nameOf = (instances, { id, blockId }) => blockId ?? (instances.filter((each) => each.id === id).length === 1 ? id : null);

/**
 * The instance of `instances` that `written` names (its data-block-id, or its package's id, a <name>
 * alone being local's, when the document holds one of it), the only one when it names none: its number
 * among them. A name of none, and none named of several, are mistakes in the command line.
 */
export function chosenInstance(instances, written, { slug, name }) {
  const listed = () => instances.map((each) => `  ${nameOf(instances, each) ?? "(no id yet: gallery export gives it one)"}  ${each.id} at ${placeSaid(each, name)}`).join("\n");
  if (written === null) {
    if (instances.length === 1) return 0;
    throw new UsageError(`${slug} holds ${instances.length} instances: name one, gallery block try ${slug} <instance id> …\n${listed()}`);
  }
  const byBlock = instances.findIndex(({ blockId }) => blockId === written);
  if (byBlock >= 0) return byBlock;
  const id = written.includes("/") ? written : `local/${written}`;
  const of = PACKAGE_ID.test(id) ? instances.flatMap((each, index) => (each.id === id ? [index] : [])) : [];
  if (of.length === 1) return of[0];
  throw new UsageError(of.length ? `${slug} holds ${of.length} instances of ${id}: name one by its id\n${listed()}` : `${slug} holds no instance ${written}:\n${listed()}`);
}

/** A file's text with no data-block-id, which a save gives the blocks it writes. */
export const withoutIds = (text) => text.replace(/\s+data-block-id="[^"]*"/g, "");

/** A file's text as its page shows it (its plain HTML the kit's markup, as a save writes it), without data-block-id. */
export const asShown = (text) => withoutIds(shownSource(text).text);

// The instance of `text` that `at` names: its number among instancesIn's, or a function of the text
// giving its parsed node (a custom page's card's: page-try.mjs), or null.
const instanceNamed = (text, at) => (typeof at === "function" ? at(text) : instancesIn(text)[at]?.element) ?? null;

/**
 * The parts of the instance `at` names in `text` (asShown's; instanceNamed) as custom block `found`
 * names them: each one's insides, its elements' one after another, and `outside`, the text with every
 * part's inside taken out; null when there is no such instance.
 */
export function partsOf(text, at, found) {
  const host = instanceNamed(text, at);
  if (!host || attr(host, ATTRIBUTE) !== found.id) return null;
  const spans = [];
  const parts = Object.entries(found.parts).map(([name, { at: selector }]) => {
    const insides = partOf(host, selector).filter((node) => node.sourceCodeLocation?.endTag && !isInstance(node) && instanceAround(node) === host).map(({ sourceCodeLocation: { startTag, endTag } }) => ({ start: startTag.endOffset, end: endTag.startOffset }));
    spans.push(...insides);
    return { name, text: insides.map(({ start, end }) => text.slice(start, end)).join("\n") };
  });
  const outermost = spans.sort((a, b) => a.start - b.start || b.end - a.end).filter((span, index) => !spans.slice(0, index).some((other) => other.start <= span.start && span.end <= other.end));
  let outside = "";
  let cursor = 0;
  for (const { start, end } of outermost) {
    outside += text.slice(cursor, start);
    cursor = end;
  }
  return { parts, outside: outside + text.slice(cursor) };
}

/**
 * What tells `after` from `before` (asShown's texts) of the instance `at` names (instanceNamed): { parts: [{ name,
 * removed, added, lines, how, runs }], outside: { removed, added } or null, gone }, `how` a part laid
 * out anew (laidAnewOf), `runs` the lines it took out and put in (changedLines), `gone` that the
 * instance is not there.
 */
export function changesOf(before, after, at, found) {
  const [was, now] = [partsOf(before, at, found), partsOf(after, at, found)];
  if (!was || !now) return { parts: [], outside: null, gone: true };
  const parts = was.parts.flatMap(({ name, text }, index) => (text === now.parts[index].text ? [] : [{ name, ...linesChanged(text, now.parts[index].text), how: laidAnewOf(text, now.parts[index].text), runs: changedLines(text, now.parts[index].text) }]));
  return { parts, outside: was.outside === now.outside ? null : linesChanged(was.outside, now.outside), gone: false };
}

/**
 * The lines a write took out and put in of each part (changesOf's `parts`), as the Wrote line says
 * them under it: "  - …" and "  + …", each cut to LINE_SAID characters, LINES_SAID of a part at most,
 * and with more than one part the name of each before its lines.
 */
export function writtenLines(parts) {
  const cut = (line) => (line.length > LINE_SAID ? `${line.slice(0, LINE_SAID)}…` : line);
  return parts.flatMap(({ name, runs = [] }) => {
    const lines = runs.flatMap(({ removed, added }) => [...removed.map((line) => `- ${cut(line)}`), ...added.map((line) => `+ ${cut(line)}`)]);
    const indent = parts.length > 1 ? "    " : "  ";
    const said = lines.slice(0, LINES_SAID).map((line) => `${indent}${line}`);
    if (lines.length > LINES_SAID) said.push(`${indent}… ${lines.length - LINES_SAID} more line${lines.length - LINES_SAID === 1 ? "" : "s"}`);
    return parts.length > 1 ? [`  ${name}:`, ...said] : said;
  });
}

/**
 * When the workspace's server at `root` has told its pages of each write the disk holds now, as a
 * time: the newest write of doc.html (`file`; none for a scratch copy, which no watcher tells of), of
 * gallery.json and of what stands under components/, then the catalog's first look at a change
 * (FIRST_LOOK) and the stillness a write is told after (QUIET), and a moment for a page told of it to
 * load itself again (MOMENT).
 */
export async function toldBy(root, file = null) {
  const { components, marker } = layoutOf(root);
  return (await newestWrite([file, marker, components].filter(Boolean))) + FIRST_LOOK + QUIET + MOMENT;
}

// ---------- the scratch copies ----------

/**
 * A scratch copy of the document in `directory` (its files `files`, documentFiles'), its doc.html
 * holding `text`, under .gallery/try/ of the workspace at `root`: { slug, folder, file }. Its slug is
 * try-<8 hex>, taken by no document; its doc.json and assets/ are copied, what its page reads.
 */
export async function scratchCopy(root, { directory, files, text }) {
  const { scratch } = layoutOf(root);
  await fsp.mkdir(scratch, { recursive: true });
  let slug;
  do slug = `try-${randomBytes(4).toString("hex")}`; while (slugTaken(slug, root) || existsSync(path.join(scratch, slug)));
  const folder = path.join(scratch, slug);
  await fsp.mkdir(folder);
  await fsp.cp(path.join(directory, "assets"), path.join(folder, "assets"), { recursive: true }).catch((error) => { if (error.code !== "ENOENT") throw error; });
  await fsp.copyFile(files.json, path.join(folder, path.basename(files.json))).catch((error) => { if (error.code !== "ENOENT") throw error; });
  const file = path.join(folder, path.basename(files.html));
  await fsp.writeFile(file, text);
  return { slug, folder, file };
}

/**
 * A scratch copy taken away: its folder, and what the server keeps of it by its slug in the edit
 * state (.gallery/state/<kind>/<slug>/: its recent versions, the answers to its commits, its review).
 * Never fails: what is left a later trial takes away (dropStale).
 */
export async function dropScratch(root, slug) {
  const { scratch, state } = layoutOf(root);
  await fsp.rm(path.join(scratch, slug), { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }).catch(() => {});
  for (const kind of await fsp.readdir(state).catch(() => [])) await fsp.rm(path.join(state, kind, slug), { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});
}

/** The scratch copies of trials that never ended (a process killed), STALE old or older, taken away. */
export async function dropStale(root, now = Date.now()) {
  const { scratch } = layoutOf(root);
  for (const entry of await fsp.readdir(scratch, { withFileTypes: true }).catch(() => [])) {
    if (!entry.isDirectory() || !/^try-[a-f0-9]{8}$/.test(entry.name)) continue;
    const { mtimeMs } = await fsp.stat(path.join(scratch, entry.name)).catch(() => ({ mtimeMs: now }));
    if (now - mtimeMs >= STALE) await dropScratch(root, entry.name);
  }
}

// When the newest of `paths` was last written, in ms: a file, or a folder and what stands in it.
async function newestWrite(paths) {
  const written = [...paths];
  for (const at of paths) for (const entry of await fsp.readdir(at, { recursive: true, withFileTypes: true }).catch(() => [])) written.push(path.join(entry.parentPath, entry.name));
  const times = await Promise.all(written.map((at) => fsp.stat(at).then(({ mtimeMs }) => mtimeMs, () => 0)));
  return Math.max(...times);
}

// What the server at `origin` says of the workspace's packages, as its catalog in use holds them
// (GET /__gallery/workspace/components: packageStates), or null when it does not answer.
const catalogIn = (origin) => fetch(`${origin}/__gallery/workspace/components`, { signal: AbortSignal.timeout(2000) })
  .then((response) => (response.ok ? response.json() : null))
  .then((body) => (Array.isArray(body?.packages) ? body.packages : null), () => null);

/**
 * When the workspace's server at `origin` takes what the disk at `root` holds of package `id`, by the
 * rule it takes a change under components/ by (server/catalog-watch.mjs): { by, held, behind, off,
 * stamp, state, reason }. `by` is a time: the newest write of the package's folder or of gallery.json,
 * then the catalog's first look at a change and the stillness a change is taken after (QUIET); or,
 * while the disk reads the package as not loading and the server keeps it as it was, as it keeps a
 * package half written, HOLD after that write, `held` saying why it does not load. A write is known
 * here by its file's time, which a file copied in keeps from where it was (fs.copyFileSync, cp -p,
 * Copy-Item), and the server by what the files hold: `behind`, the disk reading the package as loading
 * while the server's catalog in use has it otherwise, is a server that has not caught up with the disk
 * yet, and `stamp`, what the disk holds of the package as the catalog stamps it, tells a change seen
 * between two looks whatever its time (untilTaken). `off`: gallery.json turns it off. `state` and
 * `reason`: what the server's catalog in use says of it (packageStates's state, "none" for no such
 * package, null when the server does not answer; why it does not load, null for one turned off).
 */
export async function takenBy(root, id, origin) {
  const { components, marker } = layoutOf(root);
  const folder = packageFolders(root).find((each) => each.id.toLowerCase() === id)?.folder ?? path.join(components, ...id.split("/"));
  const [newest, listed] = await Promise.all([newestWrite([marker, folder]), catalogIn(origin)]);
  const { packages, problems, settings } = readCatalog(root);
  const entry = listed?.find((each) => each.id === id) ?? null;
  const state = listed ? entry?.state ?? "none" : null;
  const loading = state === "normal" || state === "hidden"; // as the server's catalog in use has it
  const off = settings.disabled.includes(id);
  const problem = problems.get(id);
  const held = problem && !off && loading ? problemIn("en", problem.problem) : null;
  const behind = listed !== null && packages.has(id) && !loading;
  return { by: newest + (held ? HOLD : FIRST_LOOK + QUIET), held, behind, off, stamp: (packages.get(id) ?? problem)?.stamp ?? null, state, reason: entry?.reason?.en ?? null };
}

// What the server's catalog in use has of a package (takenBy's `state` and `reason`), where the disk
// reads it as loading.
const serverHas = ({ state, reason }) => (state === "none" ? "no such custom block" : reason ? `it as not loading (${reason})` : "it turned off");

/**
 * Why an instance of package `id` shows what it holds, read-only, once the server has taken the
 * package as the disk holds it, or no more is waited for: by a parse error of its script that the
 * console gave (`unparsed`, with its line of kit.js), the kit's words on a script that never ran aside;
 * by what the console said of the package (`said`, each with its line of kit.js); else by what
 * gallery.json and the server say of it (takenBy's `off`, `behind`, `state` and `reason`: one disabled
 * with no reason is turned off, one with a reason is for an apiVersion this Gallery does not run).
 */
export function fallbackSaid(id, { said, unparsed = null, off, behind = false, state, reason }) {
  const shown = "the instance shows what it holds, read-only, so a reader can do nothing with it";
  if (unparsed) return `${shown}: its kit.js did not parse, so no component of it started, and the console says ${unparsed}`;
  if (said.length) return `${shown}: its component failed as the page started it, and the console says ${said.join("; ")}`;
  if (off) return `${shown}: ${id} is turned off in 设置 › 组件列表`;
  if (behind) return `${shown}: the server has not taken ${id} as components/ holds it, where it loads: its catalog in use has ${serverHas({ state, reason })}`;
  if (state === "disabled" && !reason) return `${shown}: ${id} is turned off in 设置 › 组件列表`;
  if (state === "broken" || state === "disabled") return `${shown}: the server has ${id} as not loading (${reason}): gallery block check ${id} says why`;
  if (state === "none") return `${shown}: the server has not taken ${id} as components/ holds it (its catalog in use has no such custom block)`;
  if (state) return `${shown}: the page was served before the server took ${id} as components/ holds it, and did not load itself again with it`;
  return `${shown}: its component failed or never started, and the console said nothing of it`;
}

// Why a wait for package `id` goes on, by what the server said of it last (takenBy's `taken`) and
// whether its take is still to come (`coming`).
const waitingSaid = (id, taken, coming) => {
  if (taken.held) return `${id} does not load as components/ holds it (${taken.held}), and the server keeps it as it was until components/ has not changed for ${HOLD / 1000}s, as it keeps a custom block written file by file`;
  if (taken.behind) return `components/ holds ${id} as loading, and the server's catalog in use still has ${serverHas(taken)}: it takes what components/ holds once that has not changed for ${QUIET / 1000}s`;
  if (coming) return `${id} or gallery.json changed a moment ago, and the server takes the change once components/ has not changed for ${QUIET / 1000}s, the page served before loading itself again for it`;
  return `the server took ${id} as components/ holds it, and the page served before is to load itself again with it`;
};

// How a wait for package `id` that ran to its end, `told` past the take, ended, by what the server
// said of it last (takenBy's `taken`).
const boundSaid = (id, taken, told) => {
  if (taken.held) return `the server still keeps ${id} as it was`;
  if (taken.behind) return `the server has still not taken ${id} as components/ holds it`;
  return `the server took ${id} as components/ holds it, and the page did not load itself again with it in ${told / 1000}s`;
};

/**
 * Called with an instance of package `id` in its fallback, on a page asked for at `loadedAt`: when
 * that was before the server took the package as the disk holds it, waits for the page to load itself
 * again (`loaded()`), as the server has it do once it has taken it, `told` past the take at most
 * (TOLD). The take is takenBy's, and comes the catalog's first look and QUIET past a look that found
 * what the disk holds of the package changed since the one before, and past the first look that found
 * the server behind the disk: a file copied in keeps the time it had, and the server goes by what the
 * files hold.
 * A package gallery.json turns off is not waited for. A wait that is to last more than a moment, or
 * has, is said on a Waiting line, and how it ended on a Waited line (`say`). What the server said of
 * the package last (takenBy's).
 */
export async function untilTaken({ root, id, origin, loadedAt, loaded, told = TOLD, say = (line) => console.log(line) }) {
  const start = Date.now();
  let stamp; // what the disk held of the package at the last look
  let changed = 0; // when a look last found it changed since the one before
  let behind = 0; // when a look first found the server behind the disk
  let waiting = false; // whether the wait has been said
  for (;; await sleep(TAKEN_STEP)) {
    const taken = await takenBy(root, id, origin);
    const now = Date.now();
    if (stamp !== undefined && taken.stamp !== stamp) changed = now;
    stamp = taken.stamp;
    if (taken.behind && !behind) behind = now;
    const by = Math.max(taken.by, ...[changed, behind].filter(Boolean).map((at) => at + FIRST_LOOK + QUIET));
    const ended = loaded() ? "the page loaded itself again"
      : taken.off ? `gallery.json turns ${id} off now`
      : loadedAt >= by ? `the page was asked for after the server took ${id} as components/ holds it`
      : now > by + told ? boundSaid(id, taken, told)
      : null;
    if (ended) {
      if (waiting) say(`Waited ${((now - start) / 1000).toFixed(1)}s: ${ended}`);
      return taken;
    }
    if (waiting || (by - now <= MOMENT && now - start <= MOMENT)) continue;
    waiting = true;
    say(`Waiting: ${waitingSaid(id, taken, by > now)}, ${Math.ceil((by + told - now) / 1000)}s more at most`);
  }
}

// ---------- in the page ----------

// The instance numbered `at` of those `instance` finds, those in another's slot too, in the page's
// order (instancesIn's); or, given `card`, the instance of the custom page's card of that data-card-id
// (one a template holds, a block that does not run there, is none).
function hostAt({ instance, at, card }) {
  if (typeof card === "string") {
    const frame = [...document.querySelectorAll(".gallery-board > .gallery-card")].find((node) => node.getAttribute("data-card-id") === card);
    return [...(frame?.children ?? [])].find((child) => child.matches(instance)) ?? null;
  }
  return [...document.querySelectorAll(instance)][at] ?? null;
}

// Called on an instance: what `selector` finds first in it, { named, words, box } (its largest box,
// `x` and `y` its middle), { hidden } for one with no box, { invalid } or { none, held: the classes of
// what it shows }.
function elementIn(host, selector) {
  const named = (node) => `<${node.localName}${node.classList.length ? ` class="${node.getAttribute("class")}"` : ""}>`;
  let node;
  try {
    node = host.querySelector(selector);
  } catch {
    return { invalid: true };
  }
  if (!node) return { none: true, held: [...new Set([...host.querySelectorAll("[class]")].filter((each) => each.getClientRects().length > 0).flatMap((each) => [...each.classList].map((name) => `.${name}`)))].slice(0, 16) };
  const words = ((node instanceof HTMLElement ? node.innerText : node.textContent) ?? "").replace(/\s+/g, " ").trim();
  const said = { named: named(node), words: words.length > 40 ? `${words.slice(0, 40)}…` : words };
  const rects = [...node.getClientRects()].filter(({ width, height }) => width > 0 && height > 0);
  if (!rects.length) return { ...said, hidden: true };
  const { left, top, right, bottom, width, height } = rects.reduce((a, b) => (a.width * a.height >= b.width * b.height ? a : b));
  return { ...said, box: { left, top, right, bottom, x: left + width / 2, y: top + height / 2 } };
}

// Called on an instance: what stands at (x, y) when it is not what `selector` finds or in it, by its tag and class.
function coveredBy(host, { selector, x, y }) {
  const node = host.querySelector(selector);
  const hit = document.elementFromPoint(x, y);
  return !hit || node.contains(hit) ? null : `<${hit.localName}${hit.classList.length ? ` class="${hit.getAttribute("class")}"` : ""}>`;
}

// Called on an instance: "same" when what `to` finds first in it is what `at` finds, "inside" when it
// stands in that, else null.
function endsOnItself(host, { at, to }) {
  const [dragged, onto] = [host.querySelector(at), host.querySelector(to)];
  return dragged === onto ? "same" : dragged.contains(onto) ? "inside" : null;
}

// Called on an instance: from now on, the edits its component asks of the page (`taken` when the editor
// took one, each an undo step of the page's: `taken` counts them all), each value data-ge-save has
// (heard as the page's editor sets it), and what came of an HTML5 drag: where it started, where it
// dropped, and the effect it ended with. stepBegins forgets all of it but the values and the count,
// for the next step.
function record(host) {
  const named = (node) => (node instanceof Element ? `<${node.localName}${node.classList.length ? ` class="${node.getAttribute("class")}"` : ""}>` : "the page");
  const heard = { edits: [], taken: 0, states: [], started: null, dropped: null, effect: null };
  addEventListener("doc-component-edit", (event) => {
    if (event.target !== host) return;
    heard.edits.push({ taken: event.defaultPrevented, parts: (event.detail?.parts ?? []).map(({ name }) => name) });
    if (event.defaultPrevented) heard.taken += 1;
  });
  new MutationObserver((records) => {
    for (const { oldValue } of records) heard.states.push(oldValue);
    heard.states.push(document.documentElement.getAttribute("data-ge-save"));
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["data-ge-save"], attributeOldValue: true });
  document.addEventListener("dragstart", (event) => { heard.started = named(event.target); }, true);
  document.addEventListener("drop", (event) => { heard.dropped = named(event.target); }, true);
  document.addEventListener("dragend", (event) => { heard.effect = event.dataTransfer?.dropEffect ?? null; }, true);
  globalThis.__galleryTry = heard;
}

// What record heard, forgotten but the values data-ge-save had and the count of the edits taken: a step
// begins. Returns { taken }, the count (where saving stands is the host's to mark: saves).
function stepBegins() {
  Object.assign(globalThis.__galleryTry, { edits: [], started: null, dropped: null, effect: null });
  return { taken: globalThis.__galleryTry.taken };
}

// Called on an instance: what a reader reads of it, its words and its fields' values (a box ticked or
// not), which a fresh page of what it wrote is to show again.
function wordsOf(host) {
  const fields = [...host.querySelectorAll("input, select, textarea")].map((field) => (field instanceof HTMLInputElement && ["checkbox", "radio"].includes(field.type) ? (field.checked ? "ticked" : "not ticked") : field.value));
  return { words: (host.innerText ?? "").replace(/\s+/g, " ").trim(), fields };
}

// Called on an element: what it holds that is typed in (a field's value, an editable element's words), cut to 40 characters.
function heldBy(node) {
  const words = node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement ? node.value : (node.textContent ?? "");
  const held = words.replace(/\s+/g, " ").trim();
  return held.length > 40 ? `${held.slice(0, 40)}…` : held;
}

// Called on an element: the words selected in the field or the editable element now, "" for none, cut to 40 characters.
function selectedIn(node) {
  const active = document.activeElement;
  let words = "";
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    try {
      words = active.value.slice(active.selectionStart ?? 0, active.selectionEnd ?? 0);
    } catch {} // a field with no selection (a number's)
  } else {
    const selection = getSelection();
    if (selection && !selection.isCollapsed && node.contains(selection.anchorNode)) words = selection.toString();
  }
  const said = words.replace(/\s+/g, " ").trim();
  return said.length > 40 ? `${said.slice(0, 40)}…` : said;
}

// Called on an element the focus is in: whether the caret stands at the end of what it holds (true), or
// before some of it (false: a press of a step before put it where the pointer landed, an arrow key moved
// it), or null where that cannot be told (a field with no caret, a number's; no selection in it).
function caretAtItsEnd(node) {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    try {
      return active.selectionStart === null ? null : active.selectionEnd === active.value.length;
    } catch {
      return null; // a field with no caret (a number's)
    }
  }
  const selection = getSelection();
  if (!selection?.rangeCount || !node.contains(selection.focusNode)) return null;
  const after = document.createRange();
  after.selectNodeContents(node);
  after.setStart(selection.focusNode, selection.focusOffset);
  return after.toString().trim() === "";
}

// Called on an element a press gave the focus: all it holds selected, as a reader's Ctrl+A in it selects it.
function selectAll(node) {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    active.select();
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(range);
}

// Called on an element: where what is typed now goes, null when it is the element, in it, or an
// editable element around it (a text part's editor), else what has the focus, by its tag.
function typingGoes(node) {
  const active = document.activeElement;
  if (active && (active === node || node.contains(active) || (active instanceof HTMLElement && active.isContentEditable && active.contains(node)))) return null;
  return `<${active?.localName ?? "body"}>`;
}

// Called on an element a press gave the focus: the caret at the end of what it holds, as a reader puts
// it before typing more (a field's own, or the selection's in an editable element).
function caretAtEnd(node) {
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    try {
      active.setSelectionRange(active.value.length, active.value.length);
    } catch {} // a field with no caret (a number's)
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  range.collapse(false);
  getSelection()?.removeAllRanges();
  getSelection()?.addRange(range);
}

// Called on an instance: the option of the <select> `selector` finds whose value or words are `value`
// chosen as a reader picks one (the focus on it, the option selected, then input and change), { chosen:
// its words }; or why not: { notSelect: what it found }, { options: those it has }, { disabled }.
function chooseIn(host, { selector, value }) {
  const node = host.querySelector(selector);
  if (!(node instanceof HTMLSelectElement)) return { notSelect: `<${node.localName}${node.classList.length ? ` class="${node.getAttribute("class")}"` : ""}>` };
  const options = [...node.options];
  const option = options.find((each) => each.value === value) ?? options.find((each) => each.textContent.trim() === value);
  if (!option) return { options: options.map((each) => (each.value === each.textContent.trim() ? each.value : `${each.value} (${each.textContent.trim()})`)) };
  if (node.disabled || option.disabled) return { disabled: true };
  node.focus();
  option.selected = true;
  node.dispatchEvent(new Event("input", { bubbles: true }));
  node.dispatchEvent(new Event("change", { bubbles: true }));
  return { chosen: option.textContent.trim() };
}

// Called on an instance: what it shows once it holds still (`still` ms at most, looked at each `step`),
// or null, as the check's putBack waits for one inside the function it runs in the page. A page given
// watchQueries holds its reads of the workspace that are not answered yet (globalThis.__galleryQueries):
// for `wait` ms at most (none by default) the instance is not still while any is, since what it reads is
// not drawn until the answer comes, and a server's first answer can take seconds.
export async function drawn(host, { still, step, wait = 0 }) {
  const watch = globalThis.__galleryQueries ?? null;
  const give = Date.now() + wait;
  const asking = () => watch !== null && watch.pending.size > 0 && Date.now() < give;
  const frame = () => new Promise((resolve) => {
    requestAnimationFrame(resolve);
    setTimeout(resolve, 100); // a page that draws no frames is not waited for
  });
  await frame();
  await frame();
  let last = host.outerHTML;
  for (let same = 0, end = Date.now() + still; same < 3;) {
    if (Date.now() > end) return null;
    await new Promise((resolve) => setTimeout(resolve, step));
    const now = host.outerHTML;
    if (asking()) {
      same = 0;
      end = Date.now() + still;
    } else same = now === last ? same + 1 : 0;
    last = now;
  }
  return last;
}

// ---------- the gesture ----------

/**
 * Where a line from `from` to `to` comes onto the box `onto`, as the distance along it, 0 when it
 * starts there.
 */
function comesOnto(from, to, { left, top, right, bottom }) {
  let enter = 0;
  for (const [start, end, low, high] of [[from.x, to.x, left, right], [from.y, to.y, top, bottom]]) {
    if (end === start) continue;
    const [a, b] = [(low - start) / (end - start), (high - start) / (end - start)];
    enter = Math.max(enter, Math.min(a, b));
  }
  return enter * Math.hypot(to.x - from.x, to.y - from.y);
}

/**
 * The points a drag of the element whose middle is `from` goes through to the middle of the box `to`:
 * a nudge that starts it, then steps to just short of where the line between the two comes onto that
 * box, and its middle last, so that the last move is the one that comes onto it.
 */
export function dragPath(from, to) {
  const length = Math.hypot(to.x - from.x, to.y - from.y);
  const along = (distance) => (length === 0 ? { x: from.x, y: from.y } : { x: from.x + ((to.x - from.x) * distance) / length, y: from.y + ((to.y - from.y) * distance) / length });
  const nudge = Math.min(NUDGE, length);
  const short = comesOnto(from, to, to) - SHORT;
  const end = short > nudge ? short : length;
  const points = [along(nudge / 2), along(nudge)];
  for (let step = 1; step <= STEPS; step++) points.push(along(nudge + ((end - nudge) * step) / STEPS));
  if (end !== length) points.push({ x: to.x, y: to.y });
  return points;
}

// What a gesture is called in what is said of it.
const NAMES = { press: "press", drag: "drag", key: "key", type: "typing", select: "choice" };

// An element as the Gesture line says it: its selector, then what it found.
const elementSaid = (selector, { named, words }) => `${selector} (${named}${words ? ` "${words}"` : ""})`;

// A selector that finds nothing a reader can reach in the instance: a mistake in the command line,
// unless the component failed to draw it, which the trial asks the console.
const unfound = (message) => Object.assign(new UsageError(message), { unfound: true });

// Keys pressed together as a reader presses them, modifiers first (keysOf's), where the focus is.
async function pressKeys(tab, keys) {
  const modifiers = keys.slice(0, -1);
  for (const modifier of modifiers) await tab.keyboard.down(modifier);
  await tab.keyboard.press(keys.at(-1));
  for (const modifier of modifiers.toReversed()) await tab.keyboard.up(modifier);
}

/**
 * Words typed where the focus is: ASCII key by key, each run of the rest through an input method, a few
 * letters composed and then the words committed (Input.imeSetComposition, Input.insertText: what
 * Microsoft Pinyin sends, and what a field that waits for compositionend before it takes Enter hears).
 * `session`: the tab's DevTools session. Says how they went in.
 */
async function typeWords(tab, session, words) {
  let composed = false;
  for (const [run] of words.matchAll(/[\x00-\x7f]+|[^\x00-\x7f]+/gu)) {
    if (/^[\x00-\x7f]/.test(run)) {
      await tab.keyboard.type(run);
      continue;
    }
    composed = true;
    for (const letters of COMPOSED) await session.send("Input.imeSetComposition", { text: letters, selectionStart: letters.length, selectionEnd: letters.length });
    await session.send("Input.insertText", { text: run });
  }
  return composed ? (/[\x00-\x7f]/.test(words) ? "its ASCII key by key and the rest through an input method" : "through an input method, composed then committed") : "key by key";
}

/**
 * The gesture `gesture` (a step: stepOf's) made on the instance `host` (a puppeteer handle) in `tab`,
 * `session` its DevTools session: { said, over, unfocused }, the words of its Gesture or Step line,
 * what stands over the middle of an element pressed, and where a key or words went that its element
 * took no focus for. Its `then`, a key, is pressed after it where the focus is. A selector that finds
 * nothing a reader can reach in the instance, a drag that ends on what it drags, and a choice of an
 * option a <select> has not, are mistakes in the command line, said before the pointer or a key does
 * anything.
 */
async function makeGesture(tab, host, gesture, session) {
  const made = await gestureMade(tab, host, gesture, session);
  if (!gesture.then) return made;
  await pressKeys(tab, gesture.then.keys);
  return { ...made, said: `${made.said}, then ${gesture.then.key} pressed where the focus was` };
}

// The gesture of makeGesture, its `then` aside.
async function gestureMade(tab, host, gesture, session) {
  const found = async (selector) => {
    const element = await answered(host.evaluate(elementIn, selector), "the page was asked what the selector finds");
    if (element.invalid) throw new UsageError(`Not a selector: ${selector}.`);
    if (element.none) throw unfound(`Nothing in the instance is ${selector}${element.held.length ? `: what it shows has ${element.held.join(", ")}` : ": it shows nothing with a class"}.`);
    if (element.hidden) throw unfound(`${selector} finds ${element.named} in the instance, which is not shown (it has no box on the page), so a reader cannot reach it: name what it shows.`);
    return element;
  };
  const at = await found(gesture.at);
  if (gesture.kind === "press") {
    const { x, y } = at.box;
    const over = await answered(host.evaluate(coveredBy, { selector: gesture.at, x, y }), "the page was asked what stands at the press");
    await tab.mouse.move(x, y);
    await tab.mouse.down();
    await tab.mouse.up();
    return { said: `a press on ${elementSaid(gesture.at, at)}, with the pointer at its middle`, over };
  }
  if (gesture.kind === "drag") {
    const to = await found(gesture.to);
    const itself = await answered(host.evaluate(endsOnItself, { at: gesture.at, to: gesture.to }), "the page was asked where the drag ends");
    if (itself) throw new UsageError(`${itself === "same" ? `--drag and --to find the same element, ${at.named}` : `--to ${gesture.to} finds ${to.named}, which stands in what --drag ${gesture.at} finds, ${at.named}`}: a drag ends where it is dropped, on another element of the instance (another column, another row), which --to names.`);
    if (Math.hypot(to.box.x - at.box.x, to.box.y - at.box.y) < NUDGE) throw new UsageError(`The middles of what --drag ${gesture.at} and --to ${gesture.to} find stand less than ${NUDGE}px apart, too near for a drag to start: name with --to where it is dropped, further off.`);
    const points = dragPath(at.box, to.box);
    await tab.mouse.move(at.box.x, at.box.y);
    await tab.mouse.down();
    for (const { x, y } of points) await tab.mouse.move(x, y);
    await sleep(RELEASE);
    await tab.mouse.up();
    return { said: `a drag of ${elementSaid(gesture.at, at)} to ${elementSaid(gesture.to, to)}, with the pointer in ${points.length} moves, released as it comes onto it` };
  }
  if (gesture.kind === "select") {
    const chosen = await answered(host.evaluate(chooseIn, { selector: gesture.at, value: gesture.value }), "the page was asked to choose the option");
    if (chosen.notSelect) throw new UsageError(`${gesture.at} finds ${chosen.notSelect} in the instance, which is no <select>: --select names a <select> the instance draws, and the option by its value or its words.`);
    if (chosen.options) throw new UsageError(`${gesture.at} has no option ${JSON.stringify(gesture.value)}: ${chosen.options.length ? `its options are ${chosen.options.join(", ")}` : "it has no option"}.`);
    if (chosen.disabled) throw new UsageError(`${gesture.at} or its option ${JSON.stringify(gesture.value)} is disabled, so a reader cannot choose it.`);
    return { said: `${JSON.stringify(chosen.chosen)} chosen in ${elementSaid(gesture.at, at)}, as a reader picks an option` };
  }
  const element = await host.$(gesture.at);
  if (gesture.kind === "type") {
    // Pressed first, the caret at the end of what it holds, unless the focus is in it already (a step
    // before gave it, or chose what the words replace).
    let pressed = false;
    const held = await answered(tab.evaluate(heldBy, element), "the page was asked what the field holds");
    if (await answered(tab.evaluate(typingGoes, element), "the page was asked where the focus is")) {
      await tab.mouse.click(at.box.x, at.box.y);
      await answered(tab.evaluate(caretAtEnd, element), "the caret went to the end");
      pressed = true;
    }
    // --replace: all it holds selected, so that the words go in its place and not after it.
    if (gesture.replace) await answered(tab.evaluate(selectAll, element), "all the field holds was selected");
    const unfocused = await answered(tab.evaluate(typingGoes, element), "the page was asked where the focus is");
    // What the words go over: what is selected in the field now (--replace's, or a step's before: Control+a), which they take the place of.
    const selected = await answered(tab.evaluate(selectedIn, element), "the page was asked what is selected");
    // Where the caret stands, where nothing put it at the end (the focus in the field already): the words
    // go in there, which is after what it holds only when it stands at its end.
    const atEnd = pressed || !held || gesture.replace || selected ? true : await answered(tab.evaluate(caretAtItsEnd, element), "the page was asked where the caret is");
    const how = await typeWords(tab, session, gesture.text);
    const first = pressed ? ", pressed first" : ", where the focus was";
    const instead = `(--replace, or "replace": true in a step, puts them in its place)`;
    const where = gesture.replace ? `${first}, ${held ? `all it held (${JSON.stringify(held)}) selected first (--replace), so that the words took its place` : "nothing in it to replace"}`
      : selected ? `${first}, ${selected === held ? "all it held" : "part of it"} (${JSON.stringify(selected)}) selected already (a step before), so that the words took its place`
        : pressed ? `, pressed first and the caret at its end${held ? `: it held ${JSON.stringify(held)}, and the words went after it ${instead}` : ""}`
          : !held ? ", where the focus was"
            : atEnd === false ? `, where the focus was, the caret inside what it held (${JSON.stringify(held)}), where a step before left it (a press puts it where the pointer lands, an arrow key moves it), so that the words went in there, not after it ${instead}`
              : atEnd ? `, where the focus was, the caret at its end: it held ${JSON.stringify(held)}, and the words went after it ${instead}`
                : `, where the focus was: it held ${JSON.stringify(held)}, and the words went in at the caret, where a step before left it ${instead}`;
    return { said: `${JSON.stringify(gesture.text)} typed in ${elementSaid(gesture.at, at)}${where}, ${how}`, unfocused, typed: true };
  }
  await answered(element.focus(), "the focus went to the element");
  const focused = await answered(tab.evaluate((node) => (document.activeElement === node || node.contains(document.activeElement) ? null : `<${document.activeElement?.localName ?? "body"}>`), element), "the page was asked where the focus is");
  await pressKeys(tab, gesture.keys);
  return { said: `${gesture.key} pressed with the focus given to ${elementSaid(gesture.at, at)}, as Tab gives it`, unfocused: focused };
}

// Whether the server at `origin` answers.
const answers = (origin) => fetch(`${origin}/__gallery/workspace/info`, { signal: AbortSignal.timeout(2000) }).then((response) => response.ok, () => false);

/**
 * Once a gesture or an undo, by what data-ge-save has said since `since` (the number of values heard
 * before it): "saved" (it left saved and came back), "unchanged" (it never left), or where it
 * stands when it stays: "held", "offline" (said so a second and the server at `origin` answering no
 * more, which would bring it back), "stopped", "reloading", "waiting" or "syncing".
 */
async function saving(tab, since, origin) {
  const start = Date.now();
  for (let held = 0, away = 0; ; await sleep(100)) {
    const { seen, now } = await answered(tab.evaluate((from) => ({ seen: globalThis.__galleryTry.states.slice(from), now: document.documentElement.getAttribute("data-ge-save") }), since), "the page was asked where saving stands");
    const left = now !== "saved" || seen.some((state) => state !== "saved");
    if (left && now === "saved") return "saved";
    if (now === "stopped" || now === "reloading") return now;
    held = now === "held" ? held + 1 : 0;
    if (held >= 3) return "held";
    away = now === "offline" ? away + 1 : 0;
    if (away > 0 && away % 10 === 0 && !(await answers(origin))) return "offline";
    if (!left && Date.now() - start > BEGIN) return "unchanged";
    if (Date.now() - start > SAVING) return now;
  }
}

// Why a page's save stays where it stands: undefined for a state that does not stay.
const stayedSaid = (state) => ({
  held: "a card waits for a reader: someone else changed the part meanwhile, and the page held its write for the reader there, which closing the page dropped",
  offline: "the page could not reach the server (offline)",
  stopped: "the page stopped saving (stopped): the server refused its write",
  reloading: "the page loaded itself again (doc.html or a custom block it holds changed meanwhile)",
  waiting: `it waited ${SAVING / 1000}s to be saved and never was`,
  syncing: `its save took more than ${SAVING / 1000}s`,
})[state];

/**
 * What is said of a trial cut off after a gesture, `why` saying why, by what the file holds then
 * (changesOf's against it before the trial's first gesture): { unverified }. On a scratch copy
 * (`scratch`), what the copy held, which goes, and that `name` holds nothing of it. With --keep, on the
 * document `name` itself: the parts as they were, what someone else wrote in them (`held`: the page held
 * its own write for the reader, so what they hold is another's), or what the gestures wrote (`gesture`
 * names them), kept. What someone else wrote outside them stays, and is said. `aside`: what "as it
 * was" sets aside (the host's: data-block-id, a custom page's card ids).
 */
export function cutOffSaid(why, { parts, outside, gone }, { gesture, name, held = false, scratch = false, aside = "data-block-id aside" }) {
  if (scratch) return { unverified: `${why}${!gone && parts.length ? `, the copy holding what the ${gesture} wrote, ${partsSaid(parts)}` : ""}: the trial was made on a scratch copy, gone now, and ${name} holds nothing of it` };
  const others = outside ? `; outside the instance's parts -${outside.removed} +${outside.added} lines someone else wrote meanwhile, which stay` : "";
  if (gone) return { unverified: `${why}, and ${name} holds the instance no more where it stood: someone else wrote the file meanwhile` };
  if (parts.length === 0) return { unverified: `${why}: ${name} is as it was${outside ? " in the instance's parts" : ""} (${aside})${others}` };
  if (held) return { unverified: `${why}: what ${name} holds of ${partsSaid(parts)} is someone else's, which stays${others}` };
  return { unverified: `${why}: ${name} holds what the ${gesture} wrote, ${partsSaid(parts)}, kept (--keep)${others}` };
}

/** Why a gesture (its `kind`) wrote nothing to `name`, by what the page heard of it (record's) and what came of the gesture: `over`, `unfocused` (makeGesture's), `refusals` (what the console said of context.edit). */
export function nothingSaid(kind, heard, { over, unfocused, refusals, name }) {
  const reasons = [];
  if (over) reasons.push(`the press landed on ${over}, which stands over it there`);
  if (unfocused) reasons.push(kind === "type" ? `the element takes no typing (a field or an editable element), so the words went to ${unfocused}` : `the element takes no focus (a button, a field or a tabindex), so the key went to ${unfocused}`);
  if (heard.started && !heard.dropped) reasons.push(`an HTML5 drag started (dragstart on ${heard.started}) and nothing took its drop where it was released (dragend's dropEffect ${heard.effect ?? "none"}): a list a card is dropped on cancels dragenter as well as dragover (preventDefault), or a release as the pointer comes onto it drops nothing`);
  else if (heard.dropped && heard.edits.length === 0) reasons.push(`it was dropped on ${heard.dropped}, and no context.edit came of it`);
  if (heard.edits.some(({ taken }) => taken)) reasons.push("context.edit was taken, and its change left what the parts hold as it was");
  else if (heard.edits.length) reasons.push(`context.edit was called and the page refused it${refusals.length ? `: the console says ${refusals.join("; ")}` : ""}`);
  else if (!heard.started) reasons.push(kind === "type" ? "no context.edit came of it: the component answers no typing there, or writes what was typed only on a key or as the field loses the focus (then Enter, --then Enter), or asked while context.canEdit() was false" : `no context.edit came of it: the component answers no ${NAMES[kind]} there, or asked while context.canEdit() was false`);
  return `the ${NAMES[kind]} wrote nothing to ${name}: ${reasons.join("; ")}`;
}

/**
 * What the page in `tab` says of itself on its console, by what it throws and by its dialogs, from
 * before it opens: { own, others, dialogs, pending, page, from }. Errors and warnings each once, by
 * their first line: those that name package `id` (its script's address, or the kit's words on it) in
 * `own`, the package's, each { line, page, unparsed } with its line of kit.js where they give one
 * (what is thrown and caught by nothing is heard by the DevTools protocol, which says where: a script
 * that does not parse never ran, and its SyntaxError has no stack, `unparsed`), the rest in `others`.
 * A dialog holds the page up until it is answered: each is refused as it comes (refuseDialogs), as
 * gallery block check does, its type in `dialogs`. `page` counts the pages the tab opened, each a
 * navigation of its own, and each word is kept with the one it was heard on: those of a page before
 * `from` are heard no more (takenAgain).
 */
export async function listen(tab, id) {
  await watchQueries(tab);
  const heard = { own: new Map(), others: new Map(), dialogs: new Map(), pending: [], page: 0, from: 0 };
  const script = new RegExp(`/__gallery/components/${id}/kit\\.js[^:\\s)]*:(\\d+)`);
  // What was said on `page`, `at` where the browser says it was when the words give no place.
  const said = (text, page, { at = "", unparsed = false } = {}) => {
    if (page < heard.from) return;
    const first = text.split("\n")[0];
    const where = script.exec(text) ?? script.exec(at);
    if (text.includes(id) || where) heard.own.set(first, { line: Number(where?.[1]) || null, page, unparsed: unparsed && script.test(at) });
    else heard.others.set(first, { page });
  };
  tab.on("request", (request) => { if (request.isNavigationRequest() && request.frame() === tab.mainFrame()) heard.page += 1; });
  tab.on("console", (message) => {
    if (!["error", "warn", "warning"].includes(message.type()) || /^Failed to load resource/.test(message.text())) return;
    const { page } = heard;
    heard.pending.push(Promise.all(message.args().map((argument) => argument.evaluate((value) => (value instanceof Error ? value.stack : String(value))).catch(() => ""))).then((words) => said(words.join(" ") || message.text(), page)));
  });
  const session = await refuseDialogs(tab, { add: (type) => heard.dialogs.set(type, { page: heard.page }) });
  session.on("Runtime.exceptionThrown", ({ exceptionDetails: { exception, text, url, lineNumber, stackTrace } }) => {
    said(exception?.description ?? String(exception?.value ?? text), heard.page, { at: url ? `${url}:${lineNumber + 1}` : "", unparsed: !stackTrace && exception?.className === "SyntaxError" });
  });
  await session.send("Runtime.enable");
  return heard;
}

/** The page `heard` listens to (listen's) taken again: what the pages before it said is forgotten, the words heard belonging to the page they were heard on, and what it said itself stays. */
export function takenAgain(heard) {
  heard.from = heard.page;
  for (const words of [heard.own, heard.others, heard.dialogs]) for (const [key, { page }] of words) if (page < heard.from) words.delete(key);
}

// What the console said so far, all of it heard: what it was given is read in the page, a moment later.
const heardAll = (heard) => Promise.race([Promise.all(heard.pending), sleep(2000)]);

// The page in `tab` come to edit: false when it did not in READY ms. One that loads itself again
// meanwhile is waited for in the page it brings.
async function cameToEdit(tab) {
  const waitFor = (selector) => tab.waitForSelector(selector, { timeout: READY }).catch((error) => {
    if (error.name === "TimeoutError") throw error;
    return tab.waitForSelector(selector, { timeout: READY });
  });
  try {
    await waitFor("[data-doc-ready]");
    await waitFor("html[data-ge-editing][data-ge-save]");
    await tab.waitForFunction(() => globalThis.__galleryTryEditable === true && document.documentElement.getAttribute("data-ge-save") === "saved", { timeout: READY });
    return true;
  } catch (error) {
    if (error.name !== "TimeoutError") throw error;
    return false;
  }
}

// The instance `where` names in `tab` (the host's `where`: { at }, its number in the page's order, or
// { card }, a custom page's card), a handle, opened and brought into view in a window as tall as it
// needs (TALLEST at most), once what it shows holds still: { host, fallback } or null when the page holds
// none of custom block `id` there.
async function shownInstance(tab, { where, id }) {
  const host = await answered(tab.evaluateHandle(hostAt, { instance: INSTANCE, ...where }), "the page was asked for the instance");
  const placed = await answered(host.evaluate((node, { fallback, id: own }) => {
    if (!(node instanceof Element) || node.getAttribute("data-doc-component") !== own) return null;
    DocKit.reveal?.(node);
    return { fallback: node.hasAttribute(fallback), height: node.getBoundingClientRect().height };
  }, { fallback: FALLBACK, id }), "the page was asked for the instance");
  if (!placed) return null;
  await tab.setViewport({ width: WIDTH, height: Math.min(TALLEST, Math.max(HEIGHT, Math.ceil(placed.height) + 240)) });
  await answered(host.evaluate((node) => node.scrollIntoView({ block: "center", behavior: "instant" })), "the instance was brought into view");
  await answered(host.evaluate(drawn, { still: STILL, step: STEP, wait: QUERIES }), "the instance held still");
  return { host, fallback: placed.fallback };
}

/**
 * Where a trial is made, what trial and its read back ask of it (`host`): a document's instance
 * (documentHost) or a custom page's card (src/cli/page-try.mjs pageHost), the gestures, the undo and
 * the read back the same.
 *   where                  what shownInstance finds the instance by: { at } (its number in the page's
 *                          order) or { card } (a custom page's card, by its data-card-id)
 *   ready(tab)             the page come to edit: false when it did not in READY ms
 *   saves(tab)             how the writes of the page in `tab` are heard, set up before it opens: { mark()
 *                          (how much was heard so far), until(since, origin) (once a gesture or an undo:
 *                          "saved", "unchanged", or where it stays, a state `stayed` says) }
 *   changes(a, b)          what tells file text `b` from `a` of the instance (changesOf's shape)
 *   plain(before, text, changed)  whether a step's write made the file's plain HTML the kit's markup
 *   stayed(state)          why a write stays where it stands, undefined for a state that does not stay
 *   outside                "others": what changed outside the instance's parts is someone else's, which
 *                          stays and leaves the trial unverified; "problem": it fails, as outsideSaid says
 *   outsideSaid(outside)   what changed outside, for a host whose outside is a problem
 *   aside                  what "as it was" sets aside ("data-block-id aside")
 *   inside                 what the Wrote line says of a write inside the parts alone (INSIDE_ALONE)
 *   framed                 optional: a function of the instance, run in the page, giving what its picture
 *                          shows (a custom page's card, its frame with it); the instance itself without one
 */
export function documentHost({ at, found }) {
  return {
    where: { at },
    ready: cameToEdit,
    saves: (tab) => ({
      mark: () => answered(tab.evaluate(() => globalThis.__galleryTry.states.length), "the page was asked where saving stands"),
      until: (since, origin) => saving(tab, since, origin),
    }),
    changes: (a, b) => changesOf(asShown(a), asShown(b), at, found),
    plain: (before, text, changed) => text === before && shownSource(before).changes.length > 0 && changed.parts.length > 0,
    stayed: stayedSaid,
    outside: "others",
    aside: "data-block-id aside",
    inside: INSIDE_ALONE,
  };
}

// The focus taken off a field of the instance the steps left it in (FIELDS: an input, a select, a
// textarea, an editable element of its own), whose Ctrl+Z is the field's and which a reader leaves before
// an undo: whether there was one. A field that writes as it loses the focus writes then, which the undo
// of the last step that wrote takes back too.
async function leaveField(tab) {
  return answered(tab.evaluate(({ instance, fields }) => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement && active.closest(instance) && active.matches(fields))) return false;
    active.blur();
    return true;
  }, { instance: INSTANCE, fields: FIELDS }), "the focus left the instance's field");
}

// One undo as a reader makes it: Ctrl+Z with the focus where the steps left it, off the instance's
// fields (leaveField). On a button or anything else the component draws the page's undo goes on from
// there, as it does from a reader's press.
async function undoOnce(tab) {
  await tab.keyboard.down("Control");
  await tab.keyboard.press("z");
  await tab.keyboard.up("Control");
}

// A number as the place of a Ctrl+Z among those of one step: "2nd".
const nth = (number) => `${number}${[11, 12, 13].includes(number % 100) ? "th" : ["th", "st", "nd", "rd"][number % 10] ?? "th"}`;

// How many times the page is taken again when it loads itself before the first gesture.
const RETAKEN = 3;

// What a step is called where a line says what came of it: the gesture's name of a trial of one ("the
// drag"), its number of one of several ("step 2").
const stepCalled = (steps, index) => (steps.length === 1 ? `the ${NAMES[steps[0].kind]}` : `step ${index + 1}`);

// What the steps are called together: the gesture's name of one, "the steps" of several.
export const stepsCalled = (steps) => (steps.length === 1 ? `the ${NAMES[steps[0].kind]}` : "the steps");

/**
 * Two of wordsOf's answers told apart: what the first shows that the second does not, or null. Words
 * by the first place they part, with a little of what stands around it; a field by its number.
 */
export function wordsDiffer(was, now) {
  if (was.words !== now.words) {
    let start = 0;
    while (start < was.words.length && was.words[start] === now.words[start]) start++;
    const around = (words) => JSON.stringify(`${start > 20 ? "…" : ""}${words.slice(Math.max(0, start - 20), start + 30)}${words.length > start + 30 ? "…" : ""}`);
    return `its words read ${around(was.words)} there and ${around(now.words)} here`;
  }
  const index = was.fields.findIndex((value, at) => value !== now.fields[at]);
  if (index >= 0 || was.fields.length !== now.fields.length) {
    const at = index >= 0 ? index : Math.min(was.fields.length, now.fields.length);
    return `its field ${at + 1} (of ${was.fields.length}) holds ${JSON.stringify(was.fields[at] ?? null)} there and ${JSON.stringify(now.fields[at] ?? null)} here`;
  }
  return null;
}

// What a box ticked or not is, of wordsOf's fields.
const TICKS = ["ticked", "not ticked"];
// The words a write of a box's state changes: JSON's booleans, an input's checked, a done flag.
const TICKED = ["true", "false", "checked", "done"];
// Entities a line of the file may write words with.
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** The words of `text`, as the read back tells what a reader reads apart: its runs of letters and digits, in lower case. */
export const wordsIn = (text) => new Set(text.normalize("NFKC").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

// A line of the file as a reader would read its words: no tags, no JSON keys, its entities read.
const readable = (line) => line.replace(/<[^>]*>/g, " ").replace(/"(?:[^"\\]|\\.)*"\s*:/g, " ").replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (all, decimal, hex, name) => {
  const point = decimal ? Number(decimal) : hex ? Number.parseInt(hex, 16) : null;
  if (point !== null) return point <= 0x10ffff ? String.fromCodePoint(point) : all;
  return ENTITIES[name.toLowerCase()] ?? all;
});

// How many times each of TICKED stands in `lines`, as one string.
const tickCount = (lines) => TICKED.map((word) => (lines.join("\n").toLowerCase().match(new RegExp(`\\b${word}\\b`, "g")) ?? []).length).join();

/**
 * What the steps wrote (trial's steps, each part's `runs`, changedLines'), as the read back looks for
 * it in what a page shows: { words, ticks }, `words` those a write put in or took out (of its lines read
 * as a reader reads them: no tags, no JSON keys), `ticks` whether a write changed how many of TICKED its
 * lines hold (a box's state written).
 */
export function writtenWords(steps) {
  const words = new Set();
  let ticks = false;
  for (const { parts } of steps) {
    for (const { runs = [] } of parts) {
      for (const { removed, added } of runs) {
        const [was, now] = [wordsIn(removed.map(readable).join("\n")), wordsIn(added.map(readable).join("\n"))];
        for (const word of now) if (!was.has(word)) words.add(word);
        for (const word of was) if (!now.has(word)) words.add(word);
        if (tickCount(removed) !== tickCount(added)) ticks = true;
      }
    }
  }
  return { words, ticks };
}

/**
 * Of two of wordsOf's answers that differ (`was` the page's after the steps, `now` a fresh page's),
 * what is of what the steps wrote (`written`, writtenWords'): the words one shows and the other does
 * not that a write put in or took out (one the same, or, of words with no spaces between them, as
 * Chinese is written, one holding the other), and "a box ticked" when the boxes differ and a write
 * changed a box's state. None: what differs is what the page showed and never wrote (a filter or a tab
 * chosen, an editor or a menu left open, words typed and not committed), which a fresh page does not keep.
 */
export function writtenOtherwise(was, now, written) {
  const read = ({ words, fields }) => wordsIn([words, ...fields.filter((value) => !TICKS.includes(value))].join(" "));
  const [there, here] = [read(was), read(now)];
  const differing = [...[...there].filter((word) => !here.has(word)), ...[...here].filter((word) => !there.has(word))];
  const spaceless = (word) => /[^\x00-\x7f]/.test(word);
  const ofWrite = (word) => [...written.words].some((each) => each === word || ([word, each].every((one) => [...one].length >= 2) && ([each, word].some((one) => spaceless(one)) && (word.includes(each) || each.includes(word)))));
  const found = differing.filter(ofWrite);
  const ticks = (view) => JSON.stringify(view.fields.filter((value) => TICKS.includes(value)));
  if (written.ticks && ticks(was) !== ticks(now)) found.push("a box ticked");
  return found;
}

/**
 * The trial in a context of `browser`: the page at `address` opened, the steps made one after another
 * on the instance numbered `at` once the server at `root` has told it of each write before, the file
 * (`file`, the document's `name`, a scratch copy's unless `keep`) read once each is saved, a picture
 * into `out`, a Ctrl+Z for each write of each step that wrote unless `keep`, then a fresh page
 * (`fresh(text)`: { address, file }, of the file as the steps left it) read back: { steps: [{ said,
 * parts, outside, taken }], others, undone, presses, readBack, aside, picture, problems, notes,
 * unverified }, `others` what someone else wrote meanwhile outside the instance's parts, `undone` the
 * steps the undo took back and `presses` its Ctrl+Z, `aside` a read back with a note on what the page
 * showed and never wrote. A mistake in the command line found at a step after others carries them
 * (`made`, the same shape).
 */
export async function trial(browser, { root, address, fresh, steps, keep, file, name, line, found, out, host }) {
  const context = await answered(browser.createBrowserContext(), "a browser context opened");
  const tab = await answered(context.newPage(), "a tab opened");
  const heard = await answered(listen(tab, found.id), "the tab was set to listen");
  const saves = host.saves(tab);
  const hearings = [heard]; // what each page said, those of the fresh page too
  const seen = { problems: [], notes: [], steps: [] };
  const problem = (what, where = `${name}:${line}`) => seen.problems.push({ where, what });
  const scratch = !keep;
  const target = scratch ? `the copy of ${name}` : name; // what the page writes
  const origin = new URL(address).origin;
  let loads = 0; // the page's loads, each a navigation of its own
  let loadedAt = 0; // when the page of the last of them was asked for
  tab.on("request", (request) => {
    if (!request.isNavigationRequest() || request.frame() !== tab.mainFrame()) return;
    loads += 1;
    loadedAt = Date.now();
  });
  let made = null; // the loads there were as the first gesture was made, null before it
  let before = null; // the file before the first gesture
  // What the file holds now against what it held before the first gesture.
  const leftNow = async () => host.changes(before, await fsp.readFile(file, "utf8").catch(() => ""));
  // The trial cut off, `why`, said by what the file holds (leftNow's).
  const cutOff = (why, left, held = false) => ({ ...seen, unverified: cutOffSaid(why, left, { gesture: steps.length === 1 ? NAMES[steps[0].kind] : "steps", name, held, scratch, aside: host.aside }).unverified });
  const stayed = host.stayed;
  const session = await answered(tab.createCDPSession(), "the tab opened a session");
  await answered(tab.evaluateOnNewDocument(() => addEventListener("doc-editable", () => { globalThis.__galleryTryEditable = true; })), "the tab was set to tell when the page takes edits");
  await answered(tab.setViewport({ width: WIDTH, height: HEIGHT }), "the window was sized");
  await answered(tab.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]), "the light theme came");
  try {
    await answered(tab.goto(address, { waitUntil: "load", timeout: 0 }), "the page opened", LOADING);
    // The page come to edit, the instance shown, every write before told it and the page listening,
    // taken again as it comes to edit when it loads itself meanwhile: one served before the server
    // took the instance's package, its instance shown as one of no package, is waited for to load
    // again with it (untilTaken).
    let instance = null;
    let taken = null; // what the server says of the package of an instance shown as one of no package
    for (let tries = 1; !instance; tries++) {
      const from = loads;
      try {
        if (!(await host.ready(tab))) return { ...seen, unverified: `the page did not come to edit in ${READY / 1000}s, so nothing was tried` };
        instance = await shownInstance(tab, { where: host.where, id: found.id });
        if (!instance) return { ...seen, unverified: `the page does not hold the instance where ${name} has it (${name} changed meanwhile?), so nothing was tried` };
        await sleep(Math.max(0, (await toldBy(root, scratch ? null : file)) - Date.now()));
        if (instance.fallback) taken = await untilTaken({ root, id: found.id, origin, loadedAt, loaded: () => loads !== from });
        if (loads !== from) throw new Error("the page loaded itself again");
        if (instance.fallback) break;
        before = await fsp.readFile(file, "utf8");
        await answered(instance.host.evaluate(record), "the page was asked to listen");
        if (loads !== from) throw new Error("the page loaded itself again");
      } catch (error) {
        if (loads === from || tries === RETAKEN) throw error;
        instance = null;
        takenAgain(heard);
      }
    }
    const { host: instanceHost } = instance;
    if (instance.fallback) {
      await heardAll(heard);
      const own = [...heard.own].map(([text, { line, unparsed }]) => ({ words: `${text}${line ? ` (kit.js:${line})` : ""}`, unparsed }));
      heard.own.clear(); // said in the line of why the instance shows what it holds
      problem(fallbackSaid(found.id, { said: own.map(({ words }) => words), unparsed: own.find(({ unparsed }) => unparsed)?.words ?? null, ...taken }));
      return await pictured(instanceHost, seen, out, host.framed);
    }
    made = loads;
    // Each step, its write read once the page has saved it: what it changed of the parts against the
    // file the step before left.
    let text = before;
    let last = null; // what the page heard of the last step, and what came of it
    for (const [index, step] of steps.entries()) {
      const called = stepCalled(steps, index);
      const { taken } = await answered(tab.evaluate(stepBegins), "the page was asked to listen");
      const since = await saves.mark();
      const gestured = await makeGesture(tab, instanceHost, step, session);
      const written = await saves.until(since, origin);
      const now = await fsp.readFile(file, "utf8").catch(() => "");
      const changed = host.changes(text, now);
      // `taken`: the edits the page took before the step began, each an undo step of its own.
      seen.steps.push({ said: gestured.said, parts: changed.parts, outside: changed.outside, plain: host.plain(before, text, changed), taken });
      if (loads > made) return cutOff(`after ${called}, ${stayed("reloading")}`, await leftNow());
      if (stayed(written)) return cutOff(`after ${called}, ${stayed(written)}`, await leftNow(), written === "held");
      if (changed.gone) return cutOff(`after ${called}`, await leftNow());
      last = { step, gestured, heard: await answered(tab.evaluate(() => globalThis.__galleryTry), "the page was asked what it heard") };
      for (const { name: part, how } of changed.parts) if (how) seen.notes.push({ where: `${name}:${line}`, what: `${called}'s write lays the part ${part} out anew (${how}): ${LAID_ANEW}` });
      if (changed.parts.length) seen.steps.at(-1).before = text;
      text = now;
    }
    await pictured(instanceHost, seen, out, host.framed);
    const after = await answered(instanceHost.evaluate(drawn, { still: STILL, step: STEP, wait: QUERIES }).then(() => instanceHost.evaluate(wordsOf)), "the instance held still");
    const writing = seen.steps.filter(({ parts }) => parts.length);
    const outside = seen.steps.map((each) => each.outside).filter(Boolean);
    // What changed outside the instance's parts: someone else's, which stays (a document's); or, where
    // nothing but the instance's own parts may change (a custom page's card), a problem of each step.
    if (host.outside === "problem") seen.steps.forEach((each, index) => { if (each.outside) problem(`${stepCalled(steps, index)} changed ${name} outside ${host.outsideSaid(each.outside)}`); });
    else if (outside.length) seen.others = { removed: outside.reduce((sum, { removed }) => sum + removed, 0), added: outside.reduce((sum, { added }) => sum + added, 0) };
    if (writing.length === 0) {
      await heardAll(heard);
      const refusals = [...heard.own.keys()].filter((words) => words.includes("context.edit"));
      for (const words of refusals) heard.own.delete(words); // said in the line of why nothing was written
      const why = nothingSaid(last.step.kind, last.heard, { ...last.gestured, refusals, name: target });
      problem(steps.length === 1 ? why : `none of the ${steps.length} steps wrote anything to ${target}; of the last, step ${steps.length}, ${why}`);
      return seen;
    }
    // The undo, as a reader makes it: the focus off a field of the instance first, then a Ctrl+Z for
    // each write the page took, the last first, until the parts are as they were before each step that
    // wrote. Each context.edit the page takes is an undo step of its own, none joined: a step that wrote
    // twice (a press that writes, and the field it takes the focus from writing as it loses it) takes two
    // Ctrl+Z, a write that came late, in the step after, is undone with that one, and what leaving the
    // field wrote with the last step that wrote; each is pressed at most as many times as the page took
    // edits from that step's start to the next's (from the last's to now), once at least.
    if (!keep) {
      const since = await saves.mark();
      if (await leaveField(tab)) {
        const state = await saves.until(since, origin);
        if (loads > made) return cutOff(`as the focus left the instance's field, ${stayed("reloading")}`, await leftNow());
        if (stayed(state)) return cutOff(`as the focus left the instance's field, ${stayed(state)}`, await leftNow(), state === "held");
      }
      const takenNow = await answered(tab.evaluate(() => globalThis.__galleryTry.taken), "the page was asked what it took");
      const single = steps.length === 1;
      let undone = 0;
      let presses = 0;
      undoing: for (const [index, step] of [...writing.entries()].toReversed()) {
        const called = stepCalled(steps, seen.steps.indexOf(step));
        const most = Math.max(1, (writing[index + 1]?.taken ?? takenNow) - step.taken);
        // The Ctrl+Z pressed so far for the step, as a line says them.
        const pressedSaid = (pressed) => (single ? (pressed === 1 ? "one Ctrl+Z" : `${pressed} Ctrl+Z`) : `${pressed === 1 ? "the Ctrl+Z" : `${pressed} Ctrl+Z`} for ${called}`);
        for (let pressed = 1; ; pressed++) {
          const ctrlZ = pressed === 1 ? `the Ctrl+Z for ${called}` : `the ${nth(pressed)} Ctrl+Z for ${called}`;
          const from = await saves.mark();
          await undoOnce(tab);
          const state = await saves.until(from, origin);
          const now = await fsp.readFile(file, "utf8").catch(() => "");
          const left = host.changes(step.before, now);
          // A page loaded again since the first gesture has no undo of it: what its Ctrl+Z did says nothing.
          if (loads > made) return cutOff(`after ${ctrlZ}, ${stayed("reloading")}`, await leftNow());
          if (stayed(state)) return cutOff(`after ${ctrlZ}, ${stayed(state)}`, await leftNow(), state === "held");
          if (left.gone) return cutOff(`after ${ctrlZ}`, await leftNow());
          if (state === "unchanged") {
            problem(`${pressed === 1 ? (single ? "one Ctrl+Z" : ctrlZ) : ctrlZ} wrote nothing, so ${target} keeps what ${called} wrote: a reader's undo does not take it back (the component keeps Ctrl+Z from the page where the focus is, or wrote by no context.edit)`);
            break undoing;
          }
          if (left.parts.length === 0) {
            presses += pressed;
            break;
          }
          if (pressed >= most) {
            problem(`after ${pressedSaid(pressed)}${most > 1 ? `, one for each write the page took of it,` : ""} ${target} is not as it was${single ? "" : ` before ${called}`}, ${partsSaid(left.parts)} still differing: a reader's undo does not give it back (the component writes again as it hears the part change)`);
            break undoing;
          }
        }
        undone += 1;
      }
      if (undone === writing.length) Object.assign(seen, { undone, presses });
    }
    if (seen.problems.length) return seen;
    // A fresh page of the file as the steps left it: the instance mounts, writes nothing as it opens,
    // and shows what the page showed after the last step, its words and its fields' values.
    await closed(tab.close());
    const note = (what) => seen.notes.push({ where: `${name}:${line}`, what });
    const read = await readBack(context, { ...(await fresh(text)), host, found, after, written: writtenWords(writing), out, hearings, problem, note, called: stepsCalled(steps) });
    seen.readBack = read.back;
    seen.aside = read.aside ?? false;
    if (read.picture) seen.fresh = read.picture;
    if (read.unverified) seen.unverified = `${read.unverified}, so it was not read back`;
    else if (seen.others) seen.unverified = `someone else wrote ${name} meanwhile, outside the instance's parts (the user's page, an Agent), which stays: try it again once the file holds still`;
    return seen;
  } catch (error) {
    if (error instanceof UsageError) {
      // A mistake found in a step after others were made (a selector, an option, known only in the
      // page) carries what those made and wrote (`made`), which tryCommand says before the mistake:
      // with --keep, doc.html holds what they wrote.
      if (seen.steps.length) error.made = seen;
      // A selector that finds nothing in an instance whose component failed is the component's.
      if (!error.unfound) throw error;
      await heardAll(heard);
      if (heard.own.size === 0 && heard.dialogs.size === 0) throw error;
      problem(`${error.message[0].toLowerCase()}${error.message.slice(1).replace(/\.$/, "")}; its component did not draw it, and the console says why`);
      return seen;
    }
    const left = made === null ? null : await leftNow();
    if (left && loads > made) return cutOff(`after a gesture, ${stayed("reloading")}`, left);
    if (await wentAway(browser)) {
      const why = `the browser went while waiting until ${error.doing ?? "the page answered"}`;
      return left ? cutOff(why, left) : { ...seen, unverified: `${why}, so nothing was tried` };
    }
    if (error.stuck) problem(`the page stopped answering while waiting until ${error.doing}: a script that never ends, or a component that changes what it hears`, "the page");
    else problem(`the trial stopped: ${firstLine(error)}`, "the page");
    return seen;
  } finally {
    const said = new Set();
    for (const each of hearings) {
      await heardAll(each);
      for (const [what, { line: at }] of each.own) if (!said.has(what) && said.add(what)) seen.problems.push({ where: at ? `kit.js:${at}` : "the page", what: `the console says ${what}` });
      for (const what of each.others.keys()) if (!said.has(what) && said.add(what)) seen.notes.push({ where: "the page", what: `the console says ${what}` });
      for (const type of each.dialogs.keys()) if (!said.has(type) && said.add(type)) seen.problems.push({ where: "the page", what: `it opened a dialog (${type}), which stops a reader's page until it is answered: show what it says in the instance` });
    }
    await closed(context.close());
  }
}

/**
 * What a trial says when the browser did not answer as it began, before any gesture (the page's own
 * stopping while it is tried is a problem of its own, in trial): FAIL, said with what it waited for.
 * The command's own finally closes the browser, and a copy it made is taken away.
 */
export function stoppedTrial(slug, error, name, keep) {
  console.log(`FAIL ${slug}: ${stuckSaid(error)}, so nothing was tried and the browser was closed${keep ? "" : `; the copy of ${name} was taken away`}. A script that never ends does this, and so may a browser that stalled: run the command once more`);
  process.exitCode = 1;
}

/**
 * The read back of a trial: the page at `address` (the file `file`, as the steps left it) opened in a
 * tab of `context`, as a reader opens it again, its instance numbered `at` of package `found` to mount,
 * to write nothing as it opens (the file's parts as they were before the page opened, once it has come
 * to edit and holds still: a write as the page comes to edit is saved before the instance is listened
 * to), and to show what the page showed after the last step (`after`, wordsOf's) of what the steps wrote
 * (`written`, writtenWords'). What it finds wrong goes to `problem`; what the fresh page shows otherwise
 * that is none of what the steps wrote (what the page showed and never wrote: a filter, an editor left
 * open) to `note`; a picture of what it shows to fresh.png in `out` when it differs; `called` names what
 * wrote. { back }: true when it read back, `aside` when it did with that note; false with a problem;
 * { unverified }: why it could not be seen through (the page not coming to edit, its server gone).
 */
async function readBack(context, { address, file, host, found, after, written, out, hearings, problem, note, called }) {
  const tab = await answered(context.newPage(), "a tab opened");
  hearings.push(await answered(listen(tab, found.id), "the fresh tab was set to listen"));
  const saves = host.saves(tab);
  const heard = hearings.at(-1);
  const origin = new URL(address).origin;
  await answered(tab.evaluateOnNewDocument(() => addEventListener("doc-editable", () => { globalThis.__galleryTryEditable = true; })), "the fresh tab was set to tell when the page takes edits");
  await answered(tab.setViewport({ width: WIDTH, height: HEIGHT }), "the window was sized");
  await answered(tab.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]), "the light theme came");
  const fresh = `a fresh page of what ${called} wrote`;
  const failed = { back: false };
  try {
    const opened = await fsp.readFile(file, "utf8");
    await answered(tab.goto(address, { waitUntil: "load", timeout: 0 }), "the fresh page opened", LOADING);
    if (!(await host.ready(tab))) return { back: false, unverified: `${fresh} did not come to edit in ${READY / 1000}s` };
    const instance = await shownInstance(tab, { where: host.where, id: found.id });
    if (!instance) {
      problem(`${fresh} does not hold the instance where the file has it: what the steps wrote is no instance of ${found.id} as the page reads it`);
      return failed;
    }
    if (instance.fallback) {
      await heardAll(heard);
      const own = [...heard.own].map(([text, { line }]) => `${text}${line ? ` (kit.js:${line})` : ""}`);
      heard.own.clear(); // said in this line
      problem(`${fresh} shows the instance in its fallback, what it holds read-only: its component failed as the page started it, ${own.length ? `and the console says ${own.join("; ")}` : "and the console said nothing of it"}: what ${called} wrote is what its mount cannot read`);
      return failed;
    }
    await answered(instance.host.evaluate(record), "the fresh page was asked to listen");
    const saved = await saves.until(await saves.mark(), origin);
    if (saved === "offline") return { back: false, unverified: `${fresh}: ${host.stayed(saved)}` };
    if (saved !== "unchanged" && saved !== "saved") {
      problem(`${fresh}: ${host.stayed(saved) ?? saved}`);
      return failed;
    }
    const opening = host.changes(opened, await fsp.readFile(file, "utf8").catch(() => ""));
    if (opening.gone) return { back: false, unverified: `${fresh}: its file holds the instance no more where it stood (someone else wrote it meanwhile)` };
    if (saved === "saved" || opening.parts.length) {
      problem(`${fresh} writes ${opening.parts.length ? partsSaid(opening.parts) : "it again"} with no gesture as it opens, so that a page would write each time it opened: draw what the parts hold as they are, and write on a gesture alone`);
      return failed;
    }
    const shows = await answered(instance.host.evaluate(drawn, { still: STILL, step: STEP, wait: QUERIES }).then(() => instance.host.evaluate(wordsOf)), "the fresh page's instance held still");
    const differs = wordsDiffer(after, shows);
    if (!differs) return { back: true };
    const picture = path.join(out, "fresh.png");
    await answered(instance.host.screenshot({ path: picture }), "the fresh page's instance was pictured").catch(() => {});
    const otherwise = `${fresh} shows the instance otherwise than the page did after ${called.replace(/^the steps$/, "the last step")}: ${differs}`;
    const ofWrite = writtenOtherwise(after, shows, written);
    if (ofWrite.length) {
      problem(`${otherwise} (the fresh page's picture: ${shown(picture)}), and what differs is of what ${called} wrote (${ofWrite.slice(0, 3).map((word) => (word === "a box ticked" ? word : JSON.stringify(word))).join(", ")}). What it draws of what it wrote is to come from its parts alone, read as it wrote them: a value kept in memory, or written in a form its mount does not read, is gone on the next page`);
      return { ...failed, picture };
    }
    note(`${otherwise}; none of it is of what ${called} wrote, and a fresh page keeps no filter or tab chosen, no editor left open, no words typed and not committed (--then Enter commits them), and need not. Its picture: ${shown(picture)}. What a reader keeps belongs in a part`);
    return { back: true, aside: true, picture };
  } catch (error) {
    if (!(await answers(origin))) return { back: false, unverified: `the server stopped answering as ${fresh} opened` };
    if (error.stuck) problem(`${fresh} stopped answering while waiting until ${error.doing}: a script that never ends, or a component that changes what it hears`, "the page");
    else problem(`${fresh} could not be read back: ${firstLine(error)}`, "the page");
    return failed;
  } finally {
    await closed(tab.close());
  }
}

// A picture of the instance `host` into `out`, its path in `seen`; none of an instance with no box.
// `framed`: the host's (a function of the instance giving the element to picture: a custom page's card).
async function pictured(host, seen, out, framed = null) {
  const picture = path.join(out, "after.png");
  try {
    const shot = framed ? await answered(host.evaluateHandle(framed), "the instance's frame was found") : host;
    await answered(shot.screenshot({ path: picture }), "the instance was pictured");
    seen.picture = picture;
  } catch (error) {
    if (error.stuck) throw error;
  }
  return seen;
}

/** How the lines of what a trial did start, which SKILL.md's table and building-blocks.md quote. */
export const TRY_LINES = { gesture: "Gesture: ", step: "Step ", wrote: "Wrote: ", undone: "Undone: ", kept: "Kept (--keep): ", readBack: "Read back: ", picture: "Picture of the instance after " };
/** What the Wrote line says of a write inside the instance's parts alone. */
export const INSIDE_ALONE = "nothing outside the instance changed (data-block-id aside)";
/** What the Picture line asks after its path. */
export const OPEN_IT = "open it when you want to see it: the lines above say what the gesture did";

/**
 * What a trial says (`result`, trial's) of document `slug` and its file `name`, its `steps`, with --keep
 * or not: { lines, code }, a line each and the exit code, 1 for a problem, 3 for a trial not seen
 * through, else 0. `host`: where it was made (documentHost's, a custom page's card's: its `aside`,
 * `inside` and what it says of a change outside the parts), a document's when none is given.
 */
export function trialSaid({ slug, name, steps, keep, host = null }, result) {
  const several = steps.length > 1;
  const target = keep ? name : `the copy of ${name}`;
  const aside = host?.aside ?? "data-block-id aside";
  const lines = stepLines({ name, several, keep, host }, result.steps);
  const wrote = result.steps.filter(({ parts }) => parts.length);
  const plainly = keep && wrote.some(({ plain }) => plain) ? ", its plain HTML the kit's markup" : "";
  // The Ctrl+Z pressed: one for each write the page took, a step that wrote twice taking two.
  const presses = result.presses ?? result.undone;
  if (keep && wrote.length) lines.push(`${TRY_LINES.kept}${name} holds what ${stepsCalled(steps)} wrote`);
  else if (result.undone) {
    const each = several
      ? presses === result.undone ? `${presses} Ctrl+Z, one for each step that wrote, the last first, each giving ${target} back as it was before its step` : `${presses} Ctrl+Z for the ${result.undone} step${result.undone === 1 ? "" : "s"} that wrote, one for each write the page took, the last first, each step's giving ${target} back as it was before it`
      : presses === 1 ? `one Ctrl+Z, and ${target} is as it was` : `${presses} Ctrl+Z, one for each write the page took of ${stepsCalled(steps)}, and ${target} is as it was`;
    lines.push(`${TRY_LINES.undone}${each} (${aside}${plainly})`);
  }
  if (result.readBack) lines.push(`${TRY_LINES.readBack}${keep ? `${name} opened again in a fresh page` : `a fresh page of what ${stepsCalled(steps)} wrote (a copy of it)`}: the instance mounts, writes nothing as it opens, and shows what the page showed after ${several ? "the last step" : stepsCalled(steps)}${result.aside ? ` of what ${several ? "they" : "it"} wrote; what else the page showed there, which nothing wrote, it does not (the note)` : ""}`);
  for (const { where, what } of result.problems) lines.push(`  FAIL ${where}: ${what}`);
  for (const { where, what } of result.notes) lines.push(`  note ${where}: ${what}`);
  if (result.picture) lines.push(`${TRY_LINES.picture}${several ? "the last step" : stepsCalled(steps)}: ${shown(result.picture)} (${OPEN_IT})`);
  // The pictures of the run in one line, as block check and page check end: a hint, none needs opening.
  const pictures = [result.picture, result.fresh].filter(Boolean);
  if (pictures.length) lines.push(unopenedSaid([{ folder: path.dirname(pictures[0]), files: pictures }]));
  const count = result.problems.length;
  if (count) return { lines: [...lines, `FAIL ${slug}: ${count} problem${count === 1 ? "" : "s"}`], code: 1 };
  if (result.unverified) return { lines: [...lines, `UNVERIFIED ${slug}: ${result.unverified}`], code: 3 };
  const parts = [...new Set(wrote.flatMap(({ parts: each }) => each.map(({ name: part }) => part)))].join(" and ");
  const back = keep ? `, kept (--keep)` : `, ${presses === 1 ? "one Ctrl+Z" : `${presses} Ctrl+Z`} took ${several ? "them" : "it"} back`;
  return { lines: [...lines, `OK   ${slug}: ${stepsCalled(steps)} wrote ${parts}${back}, and a fresh page read ${several ? "them" : "it"} back${keep ? "" : `; ${name} not written (a scratch copy)`}`], code: 0 };
}

// The lines of the steps made (trial's `steps`): each one's Gesture or Step line, and its Wrote line
// with the lines it took out and put in (Wrote: nothing of one of several). `host`: trialSaid's.
function stepLines({ several, keep, host = null }, made) {
  const lines = [];
  for (const [index, step] of made.entries()) {
    lines.push(several ? `${TRY_LINES.step}${index + 1}: ${step.said}` : `${TRY_LINES.gesture}${step.said}`);
    if (step.parts.length === 0) {
      if (several) lines.push(`${TRY_LINES.wrote}nothing`);
      continue;
    }
    const plain = keep && step.plain ? "; and the page wrote the document's plain HTML as the kit's markup, as its first save of an edit does (gallery check and gallery export say what, by line, once), which stays" : "";
    const outside = !step.outside ? `; ${host?.inside ?? INSIDE_ALONE}`
      : host?.outside === "problem" ? `; and outside ${host.outsideSaid(step.outside)}`
      : `; outside the instance's parts -${step.outside.removed} +${step.outside.added} lines someone else wrote meanwhile (the user's page, an Agent), which stay`;
    lines.push(`${TRY_LINES.wrote}${partsSaid(step.parts)}${outside}${plain}`, ...writtenLines(step.parts));
  }
  return lines;
}

/**
 * What is said of the steps a trial made before a mistake in a later one (a selector the page has not,
 * an option a <select> has not: what only the page can tell), `made` trial's as it stood then: their
 * lines, and what the file holds of them: with --keep, `name` holds what they wrote; on a scratch copy,
 * nothing of them. Said before the mistake, which exits 2.
 */
export function madeSaid({ name, steps, keep, host = null }, made) {
  const count = made.steps.length;
  const which = count === 1 ? "step 1" : `steps 1 to ${count}`;
  const wrote = made.steps.some(({ parts }) => parts.length);
  const lines = stepLines({ name, several: steps.length > 1, keep, host }, made.steps);
  const next = `step ${count + 1} was not made, for the mistake below`;
  if (!keep) lines.push(`Not made: ${next}; ${which} ${wrote ? "wrote to" : "made"} a scratch copy, gone now, and ${name} holds nothing of ${count === 1 ? "it" : "them"}`);
  else lines.push(wrote ? `${TRY_LINES.kept}${name} holds what ${which} wrote, which stays; ${next}` : `Not made: ${next}; ${which} wrote nothing to ${name}`);
  return lines;
}

/**
 * gallery block try: `named` the document and the instance, `values` the options' values, `seconds`
 * what --key, --type and --select take after their selector, `keep` --keep, `replace` --replace.
 */
// `root`: the workspace of the document (gallery.mjs finds it as gallery open does: --workspace,
// GALLERY_WORKSPACE, the nearest gallery.json, else home); the blocks are home's whatever it is
// (`home`: the catalog, and the writes under components/ the server is to have told its pages of).
export async function tryCommand(root, { named, values, seconds = {}, keep, replace = false, home = defaultWorkspace() }) {
  const gesture = await gestureOf(values, seconds, replace); // null with --steps, read once the document is known
  const steps = gesture ? [gesture] : null;
  if (named.length === 0) throw new UsageError("Name the document: gallery block try <slug> [<instance id>] and the gesture.");
  if (named.length > 2) throw new UsageError("gallery block try takes a document and an instance's id at most.");
  const stepsFile = values.has("--steps") ? path.resolve(values.get("--steps")) : null;
  const trying = steps ?? (await stepsOf(stepsFile));
  const { slug, block } = await documentNamed(named[0]);
  const directory = documentDirectory(slug, root);
  const files = documentFiles(directory);
  const file = files.html;
  const source = await fsp.readFile(file, "utf8").catch(() => null);
  if (source === null) {
    console.error(`No document "${slug}": ${shown(file)} does not exist (gallery list lists those there are).`);
    process.exit(1);
  }
  const instances = instancesIn(source);
  if (instances.length === 0) {
    console.error(`${slug} holds no instance of a custom block (an element with ${ATTRIBUTE}): gallery block list says which there are, and gallery block show <id> how to write one.`);
    process.exit(1);
  }
  const name = path.basename(file);
  const at = chosenInstance(instances, named[1] ?? block, { slug, name });
  const { id, line } = instances[at];
  // A package gallery.json turns off stands with those that do not load, said `off` (readCatalog).
  const catalog = readCatalog(home);
  const found = catalog.packages.get(id);
  if (!found) {
    const problem = catalog.problems.get(id);
    console.error(problem?.off ? `${id} is turned off in 设置 › 组件列表: its instances show what they hold, read-only, so a reader can do nothing with them.` : problem ? `${id} does not load, so its instances show what they hold, read-only: gallery block check ${id} says why.` : `No component ${id} in this workspace, so its instance shows what it holds, read-only: gallery block list says which there are.`);
    process.exit(1);
  }
  console.log(`${id} in ${slug}, ${placeSaid(instances[at], name)}: ${shown(file)}`);
  if (stepsFile) console.log(`Steps: ${trying.length} from ${shown(stepsFile)}, made one after another in one page`);
  const server = await serverFor({ slug, command: `gallery block try ${slug}` });
  if (!server.ok) {
    console.log(`UNVERIFIED ${slug}: ${server.message}`);
    process.exitCode = 3;
    return;
  }
  await dropStale(root);
  const copies = []; // the scratch copies made, each taken away at the end
  const copyOf = async (text) => {
    const copy = await scratchCopy(root, { directory, files, text });
    copies.push(copy.slug);
    return copy;
  };
  try {
    const page = keep ? { slug, file } : await copyOf(source);
    const address = agentPageOf(server.port, page.slug); // its saves no reader's edit: the Agent's, in the recent versions and the record of edits
    console.log(keep
      ? `Page: ${address} (the document's page alone, editable: the Agent's own; --keep: what ${stepsCalled(trying)} write stays in ${name}; the server runs on after this command)`
      : `Page: ${address} (a scratch copy of ${slug}, its page alone, editable, made for this trial and gone at its end: ${name} is not written, and no page of the user's shows the trial; the server runs on after this command)`);
    const executablePath = findBrowser();
    if (!executablePath) {
      console.log(`UNVERIFIED ${slug}: no Chrome, Edge or Chromium found (GALLERY_BROWSER=<its executable> picks one), so nothing was tried`);
      process.exitCode = 3;
      return;
    }
    let running;
    try {
      running = await startBrowser({ executablePath, args: lookingArguments() });
    } catch (error) {
      console.log(`UNVERIFIED ${slug}: the browser ${executablePath} did not start, twice, each time with a fresh profile (${firstLine(error)}; GALLERY_BROWSER=<its executable> picks another), so nothing was tried`);
      process.exitCode = 3;
      return;
    }
    const out = path.join(layoutOf(root).qa, slug, "try");
    try {
      await fsp.rm(out, { recursive: true, force: true });
      await fsp.mkdir(out, { recursive: true });
      // The page a read back opens, and its file: a second copy of what the steps wrote, or doc.html with --keep.
      const fresh = async (text) => {
        if (keep) return { address, file: page.file };
        const copy = await copyOf(text);
        return { address: agentPageOf(server.port, copy.slug), file: copy.file };
      };
      let result;
      try {
        result = await trial(running.browser, { root: home, address, fresh, steps: trying, keep, file: page.file, name, line, found, out, host: documentHost({ at, found }) });
      } catch (error) {
        if (error instanceof UsageError && error.made) console.log(madeSaid({ name, steps: trying, keep }, error.made).join("\n"));
        if (error.stuck) return stoppedTrial(slug, error, name, keep);
        throw error;
      }
      const { lines, code } = trialSaid({ slug, name, steps: trying, keep }, result);
      console.log(lines.join("\n"));
      process.exitCode = code;
    } finally {
      await running.close();
    }
  } finally {
    for (const copy of copies) await dropScratch(root, copy);
  }
}
