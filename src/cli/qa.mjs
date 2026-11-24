// gallery qa <slug>... | --all [--tiles] [--blocks <id,…>] [--no-export] [--pictures] (./usage.mjs): looks at each
// named document's export (<workspace>/exports/<slug>.html, as gallery export wrote it; a document with
// none yet, or one not made from its doc.html and its component packages as they are now, by the
// sha256 and the stamps the export carries, is exported first, as gallery export does, unless
// --no-export) as a reader's browser shows it: the system's Chrome or Edge, headless, at 1024, 736
// and 360px wide and in a laptop's 1024×768 window, every disclosure open, each Sheet shown in turn
// and each detail card opened in turn, and says what the checks cannot see, each finding with where it is in the document's file (doc.html, or
// report.html in an older document):
//   fail        the page's errors, failed requests, what the export's policy blocked (a file not
//               embedded), a broken picture, a chart that drew nothing, a chart's text outside its
//               card or cut by a clip, a formula left as written or that KaTeX refused, the page
//               wider than the window (what reaches past it: an element, or the words of a text
//               that cannot break, a long path or URL, in its block)
//   warn       at 736px and wider, a table's column out of sight or cut (the words of any of its
//               cells) or its rows below a frame of the kit's height (with how to show them all), a
//               code block or a formula block whose content scrolls inside its frame of the kit's;
//               a drawing's texts over each other; a drawing's text its viewBox scales below 11px;
//               a value axis's tick labels crowding; words past the side of their box in a whole
//               block or a figure's drawing, over what is beside them, and words or marks there cut
//               at the bottom of a box that clips them
//   info        the kit's other layout notes, a code block's title cut to fit, below 736px a code or
//               formula block that scrolls (pictured), at any width one that scrolls as the author or the reader chose
//               (a code block's own frame height, its lines unwrapped) or in a disclosure closed in
//               the file, and the tables that scroll, each named with its line and direction
//   unverified  no browser, a browser that did not start, a wait that ran out, a state that could
//               not be reached, a picture not taken
// Pictures go to <workspace>/.gallery/qa/<slug>/<the run's time>/ (a folder of the run's own, 2026-11-11_14-02-33;
// the newest RUNS_KEPT runs are kept, each earlier one taken away as a run ends, and what an earlier
// Gallery kept loose in qa/<slug>/ when one starts: startRun, endRun), each framed by what its element draws (its
// ::before and ::after, words that run out of it), not cut at its box, at 1024, 736 and 360px: flagged/
// the flagged elements; changed/ the blocks changed or moved since the baseline, qa/<slug>/blocks.json
// (a block moved with the edges of the blocks beside it, the moved first; every one of them, blocksToPicture's
// complete: a run never leaves the Agent a second run to ask for, and a block held by one pictured that its
// pictures showed at one width and not another is pictured on its own at that width, here, in a second look
// at the page), and cards/ the cards pictured though not changed (those no look has pictured yet; all of them
// when there is no baseline, when nothing changed, or when the report's own script or style changed; no more
// than the twelve a run pictures, changed blocks among them: the rest need no look, nothing changed in them, and
// stay unseen for a later run), each under a heading of its own; chart cards, code blocks, whole blocks,
// components, flowcharts and Sheet areas first, then columns and the other figures, then tables; a block another
// one pictured holds (a table in a Sheet area, the nodes of a new flowchart) in that one's picture,
// which a Sheet area holding some in another panel has again with that panel shown, a detail card
// with that card opened; blocks/ the blocks --blocks <id,…> names (instead of changed/ and cards/);
// tiles/ the page in tiles as it opens, each Sheet panel shown in turn and each detail card opened
// in tiles of their own (--tiles, instead of changed/ and cards/). It prints the findings (the tables that
// scroll as information, the findings by level, each look's counts), then, for a run of blocks named, what it
// left for a plain run, then ONE list, 要看的图（N 张）, the pictures to open: one of each place a FAIL or a
// WARN names (the narrowest width it was flagged at), the blocks --blocks named, the tiles, by its whole path
// with what it is, and 不用看：what needs no look (the pictures of the blocks changed and the cards, kept in the
// run's folder: the checks looked at them; the cards past the twelve, INFO notes, blocks hidden from readers;
// the user's 2026-11-13: a dozen pictures opened for each change)
// (checklistSaid; the pictures are named nowhere else), and last the verdict with each look's failures and
// warnings, ending with the export's absolute path after 离线文件（用户要文件时再给）：, as gallery export prints it.
// The baseline is the report as a run that failed nothing last looked at it: a run with a failure,
// one not verified, and a first one with --blocks keep it as it was; a first run (none yet) takes
// every block as it is but the cards it did not picture, which later runs picture after what
// changed; a block that showed and that no picture of its holder showed (in the middle of a tall
// section moved, pictured at its two joins) is not taken as looked at. When there is none, gallery export and gallery open write one of the document
// as it was before the round of changes (src/cli/qa-baseline.mjs), so that the first look after a
// revision pictures what it changed.
// --blocks takes ids split at commas and white space (PowerShell's gallery.ps1 joins `a,b` unquoted
// into "a b"); one the document has not is refused, before anything is exported or looked
// at. First, as gallery check and gallery export say them, what the preview wrote of the document as
// the kit's markup and the 批注 it deleted since a command last said them.
// Exits 1 when anything fails (or the export it ran first did), 3 when nothing could be looked at at all (no
// browser, or one that did not start: UNVERIFIED <why>), 4 when the pages were looked at and some places
// could not be verified (UNVERIFIED lines among the findings: a wait that ran out, a picture not taken),
// 2 when an export is missing or not made from its doc.html as it is now, with
// --no-export, or when --blocks names an id no block of the document has, else 0. A warning never fails: do not delete a column or a label to silence one.
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { packagesOf } from "../render/package-files.mjs";
import { parseReport } from "../render/report-tree.mjs";
import { MATH_IGNORED_TAGS } from "../shared/components/math.mjs";
import { newNames } from "../shared/new-names.mjs";
import { exportPackagesOf, exportSourceOf, packagesSaid } from "../shared/export-wrap.mjs";
import { sha256 } from "../shared/files.mjs";
import { attr } from "../shared/html-tree.mjs";
import { launcherFile, qaDirectory, reportsDirectory } from "../shared/paths.mjs";
import { documentDirectory, documentFiles } from "../shared/workspace.mjs";
import { KINDS, LEVELS, LOOKS, WIDE, WIDTHS, layoutNotesOf, levelOf } from "../shared/qa-levels.mjs";
import { tableHidesScript } from "../shared/table-hides.mjs";
import { closed, findBrowser, keepViolations, lookingArguments, ownMessage, settle, startBrowser } from "../transfer/browser.mjs";
import { documentArguments, UsageError } from "./arguments.mjs";
import { DELIVERABLE_LINE, deliverablePath } from "./deliverable.mjs";
import { previewSettled } from "./hand-in.mjs";
import { previewDeletions, previewRewrites } from "./natural.mjs";
import { adoptIdless, baselineOf, blocksOf, exportBaselines, packageStamps, pageOf, previewBaseline, rankOf, readBaseline } from "./qa-baseline.mjs";

// What the baseline is and who writes it (src/cli/qa-baseline.mjs), for the tests.
export { adoptIdless, baselineOf, blocksOf, exportBaselines, pageOf, previewBaseline, rankOf, readBaseline };

// Every finding gallery qa makes is one of KINDS, at its level (levelOf, src/shared/qa-levels.mjs,
// which the preview's note reads the kit's layout notes with too), in the windows of LOOKS (three
// widths in a window 900px tall, and the widest again in a laptop's window, 768px tall, which says
// only what the first look did not).
export { KINDS, LEVELS, LOOKS, WIDE, WIDTHS, layoutNotesOf, levelOf };
// The kinds pictured though they are info (below WIDE): a code or formula block that scrolls inside
// its frame, which the picture shows where it is cut.
export const PICTURED_INFO = new Set(["code-scrolls", "formula-scrolls"]);

/**
 * A finding's level at a window `width` px wide: the one it says itself (`level`: code or a formula
 * scrolling as the author or the reader chose, a code block's own frame height or its lines left
 * unwrapped, or in a disclosure closed in the file, which is info at every width, never a warning),
 * else its kind's.
 */
export const findingLevel = (finding, width) => finding.level ?? levelOf(finding.kind, width);

/**
 * Whether a finding's element is pictured in a look `width` px wide: what fails or warns there, and
 * the kinds of PICTURED_INFO where their kind is info (below WIDE), whatever level the finding says
 * itself (one that scrolls as the author or the reader chose, or in a closed disclosure, is pictured
 * on a phone as any is, and not where it is info only by its own level).
 */
export const picturedAt = (finding, width) => ["fail", "warn"].includes(findingLevel(finding, width)) || (PICTURED_INFO.has(finding.kind) && levelOf(finding.kind, width) === "info");
// A table wider or taller than its frame by this much or less scrolls by its rounding, not by its
// columns or rows (its words start its cells' padding in from their edges).
export const SCROLL_SLACK = 4;
// The blocks pictured at most when none are named (the rest named in a line, for --blocks).
export const BLOCK_PICTURES = 12;
// The changed blocks a run of gallery qa's own pictures at most (blocksToPicture's `complete`): every one of
// them, so that no run is left for the Agent to make; past this many, `rest` names them as before.
export const CHANGED_PICTURES = 60;
// How far around what an element draws its picture reaches (px: an outline, a shadow, a mark a few
// pixels past what inkOf measures), so that a picture never cuts what the page shows whole.
export const INK_MARGIN = 8;
// The frames an element's picture waits for after the scroll that brought it into view: Chrome's
// first frame after a jump may leave out what the kit's layout just broke into lines (a table's code
// in its last row at 360px, broken between its names: blank in one picture in four, painted in the
// next frame: found in a review after testing the skill with Agents, 2026-10-29), so a picture waits until
// two more are drawn.
export const SCROLL_FRAMES = 2;
// A moved block is pictured with this much of the blocks before and after it (px: the end of the one
// before, the start of the one after, however tall they are); one taller than MOVED_WHOLE as its two
// joins, its first and its last MOVED_PART px each with its neighbour's edge (a section moved: where
// it now starts and ends, in pictures an Agent can read).
export const NEIGHBOUR_EDGE = 200;
export const MOVED_WHOLE = 2000;
export const MOVED_PART = 600;

/**
 * The parts of the page a moved block is pictured in (`block`: its box; `above`, `below`: those of
 * the blocks before and after it that show, or null; { left, top, right, bottom }, the page's
 * pixels): from NEIGHBOUR_EDGE px above the block (no higher than the block before it reaches) to as
 * far below it (no lower than the block after it reaches), as wide as all three; a block taller than
 * MOVED_WHOLE in two parts, its top and its bottom MOVED_PART px each with its neighbour's edge.
 * [{ part: "" (the whole), "top" or "bottom", clip: { x, y, width, height } }].
 */
export function movedClips({ block, above = null, below = null }) {
  const boxes = [block, above, below].filter(Boolean);
  const left = Math.min(...boxes.map((box) => box.left));
  const right = Math.max(...boxes.map((box) => box.right));
  const top = above ? Math.max(Math.min(above.top, block.top), block.top - NEIGHBOUR_EDGE) : block.top;
  const bottom = below ? Math.min(Math.max(below.bottom, block.bottom), block.bottom + NEIGHBOUR_EDGE) : block.bottom;
  const clip = (from, to) => ({ x: Math.max(0, left), y: Math.max(0, from), width: right - left, height: to - Math.max(0, from) });
  if (block.bottom - block.top <= MOVED_WHOLE) return [{ part: "", clip: clip(top, bottom) }];
  return [{ part: "top", clip: clip(top, block.top + MOVED_PART) }, { part: "bottom", clip: clip(block.bottom - MOVED_PART, bottom) }];
}

/**
 * How a finding names an address (`url`) of the page at `base` (the export's own address): a data:
 * URL by its start and its length, a file beside the export by its path from there, any other by
 * its end when it is long (the file's name is what tells it).
 */
export function urlName(url, base = "") {
  if (url.startsWith("data:")) return `${url.slice(0, 30)}… (${url.length} characters)`;
  const folder = base.slice(0, base.lastIndexOf("/") + 1);
  if (folder && url.startsWith(folder) && url.length > folder.length) {
    try {
      return decodeURIComponent(url.slice(folder.length));
    } catch {
      return url.slice(folder.length);
    }
  }
  return url.length > 60 ? `…${url.slice(-59)}` : url;
}

const tidy = (text) => String(text ?? "").replace(/\s+/g, " ").trim();
const quote = (text, length = 40) => {
  const value = tidy(text);
  return `"${value.length > length ? `${value.slice(0, length - 1)}…` : value}"`;
};

/**
 * An element's words as both the page and its source read them, to find one by the other: without
 * blanks (the kit puts spaces between Chinese and Latin words as it draws), the first 120 characters.
 */
export const wordsOf = (text) => String(text ?? "").replace(/\s+/g, "").slice(0, 120);

/**
 * Where things are in a report's HTML, to name a finding's place: the line of each data-block-id, of
 * each id and of each element by its tag and words (wordsOf: the lines of all those alike, in the
 * file's order, as the page counts them); `name`, the file's (doc.html, or an old document's report.html).
 */
export function sourceIndex(html, name = "doc.html") {
  const blocks = new Map();
  const ids = new Map();
  const texts = new Map();
  const lineOf = (node, name) => (name && node.sourceCodeLocation.attrs?.[name] || node.sourceCodeLocation).startLine;
  const places = new Map(); // tag|words -> the elements' places, in the order they are left
  // The text of a node as a browser's textContent has it (a template's content is no text of the page).
  const visit = (node) => {
    if (node.nodeName === "#text") return node.value;
    if (!node.tagName && node.nodeName !== "#document") return "";
    if (node.tagName === "template") return "";
    const text = (node.childNodes ?? []).map(visit).join("");
    if (!node.tagName || !node.sourceCodeLocation) return text;
    const block = attr(node, "data-block-id");
    if (block !== undefined && !blocks.has(block)) blocks.set(block, lineOf(node, "data-block-id"));
    const id = attr(node, "id");
    if (id !== undefined && !ids.has(id)) ids.set(id, lineOf(node, "id"));
    const words = wordsOf(text);
    if (words.length >= 2) {
      const key = `${node.tagName}|${words}`;
      if (!places.has(key)) places.set(key, []);
      places.get(key).push(node.sourceCodeLocation);
    }
    return text;
  };
  visit(parseReport(html));
  // An element is left after those it holds: the file's order is where each starts.
  for (const [key, found] of places) texts.set(key, found.sort((a, b) => a.startOffset - b.startOffset).map((place) => place.startLine));
  return { blocks, ids, texts, name };
}

/**
 * Where a finding is in report.html, from what the page said of its element (`anchor`): the line of
 * its nearest data-block-id, else of its chart card's title, of its table's first header cell, of
 * the element or what holds it found by its words (the nth of those alike, as the page counted
 * them), of its nearest id or of its section's heading; named with what was found, so it can be
 * looked for (a table by its name, `anchor.table`, as the list of the tables that scroll names it,
 * else by its first header cell). A finding of the page as a whole (no anchor) is "the page".
 */
export function placeOf(anchor, index) {
  if (!anchor) return "the page";
  const file = index.name ?? "doc.html";
  const line = (text) => {
    const lines = text && index.texts.get(`${text.tag}|${text.words}`);
    return lines?.[Math.min(text.nth ?? 0, lines.length - 1)];
  };
  const table = anchor.table || anchor.header?.text;
  const about = anchor.card ? ` card ${quote(anchor.card.text)}` : table ? ` table ${quote(table)}` : "";
  const block = anchor.blocks?.find((id) => index.blocks.has(id));
  if (block !== undefined) return `${file}:${index.blocks.get(block)} [data-block-id="${block}"]${about}`;
  if (line(anchor.card)) return `${file}:${line(anchor.card)} card ${quote(anchor.card.text)}`;
  if (line(anchor.header)) return `${file}:${line(anchor.header)} table ${quote(table)}`;
  const own = anchor.texts?.find(line);
  if (own) return `${file}:${line(own)} ${own === anchor.texts[0] && own.tag === anchor.tag ? "" : `${anchor.element} in `}<${own.tag}> ${quote(own.text, 32)}`;
  const id = anchor.ids?.find((name) => index.ids.has(name));
  if (id !== undefined) return `${file}:${index.ids.get(id)} #${id}${about}`;
  if (line(anchor.section)) return `${file}:${line(anchor.section)} ${anchor.element} in the section ${quote(anchor.section.text)}`;
  return `${anchor.element}${about} (not found in ${file})`;
}

/**
 * A time as the command says it, with its zone (two shells of one machine may each have their own:
 * Git Bash's TZ and Windows' zone), as ISO 8601 has it: 2026-10-25T14:03:59+08:00.
 */
export function timeOf(ms) {
  const date = new Date(ms);
  const two = (value) => String(value).padStart(2, "0");
  const offset = -date.getTimezoneOffset();
  const zone = `${offset < 0 ? "-" : "+"}${two(Math.floor(Math.abs(offset) / 60))}:${two(Math.abs(offset) % 60)}`;
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}${zone}`;
}

/**
 * Whether an export was made from a report.html whose sha256 is `now`, as the export says (`said`:
 * exportSourceOf, null for one that says none, made before exports said it or before the kit's
 * names were doc-*: its meta was report-export-source then, and its page in the old names): { stale, why } (why:
 * how the export differs, "" when it does not). The bytes are what count, never when the files were
 * written: a report.html restored from a snapshot, or a data directory copied, keeps or loses its
 * times as it may, and an export of the same text is still that text's. An export holds the component
 * packages too: `packages`, what it says it holds and what the document's instances are of now, each as
 * packagesSaid says them; of the same text, it is stale when those differ (`packaged`).
 */
export function staleExport(said, now, packages = { said: "", now: "" }) {
  if (said === now) return packages.said === packages.now ? { stale: false, why: "" } : { stale: true, packaged: true, why: `it holds ${packages.said || "no custom block"}, the workspace has ${packages.now || "none of them"}` };
  return { stale: true, why: said ? `made from a text whose sha256 is ${said.slice(0, 12)}…, the file's is ${now.slice(0, 12)}…` : "it does not say which text it was made from: made before exports said it, or before the kit's names were doc-* (2026-10-26), whose pages gallery qa no longer reads" };
}

/**
 * The export gallery qa looks at for `slug`: { file, sha256, time: when it was written }, or {
 * problem } when there is no report, no export (`missing`), or one not made from the report's
 * report.html as the file is now and from the component packages as they are now (staleExport, by the
 * sha256 of its bytes and the packages' stamps the export carries: `stale`, with `why`, `edited` when it
 * says another text it was made from, `packaged` when it is of this text and holds other packages),
 * unless `made`: one it just made, which the report may have changed after (the user typing in the preview).
 */
export async function exportOf(slug, { made = false } = {}) {
  const source = documentFiles(documentDirectory(slug, reportsDirectory)).html;
  const file = deliverablePath(slug);
  const [sourceBytes, fileStat] = await Promise.all([fs.readFile(source).catch(() => null), fs.stat(file).catch(() => null)]);
  if (!sourceBytes) return { problem: `${slug}: no document (${source})` };
  if (!fileStat) return { problem: `${slug}: no export (${file}): run gallery export ${slug} first`, missing: true };
  const bytes = await fs.readFile(file);
  const text = bytes.toString("utf8");
  const said = exportSourceOf(text);
  const packages = { said: exportPackagesOf(text), now: packagesSaid(packagesOf(sourceBytes.toString("utf8"))) };
  const { stale, why, packaged = false } = staleExport(said, sha256(sourceBytes), packages);
  if (stale && !made) {
    return { problem: `${slug}: ${file} is not of ${source} as it is now (${why}): run gallery export ${slug} first`, stale: true, why, edited: Boolean(said) && !packaged, packaged };
  }
  return { file, sha256: sha256(bytes), time: fileStat.mtimeMs };
}

// Of `values` (distinct), the indices of a longest run that rises all along (a longest strictly
// increasing subsequence): the blocks that kept their order. Of runs as long, the one whose
// `weights` add up to most: the larger blocks keep their places, the smaller ones moved (a section
// and a paragraph swapped: the paragraph moved).
function longestRise(values, weights) {
  const best = values.map((_, index) => ({ length: 1, weight: weights[index], previous: -1 }));
  const better = (a, b) => a.length > b.length || (a.length === b.length && a.weight > b.weight);
  values.forEach((value, index) => {
    for (let at = 0; at < index; at++) {
      if (values[at] >= value) continue;
      const run = { length: best[at].length + 1, weight: best[at].weight + weights[index], previous: at };
      if (better(run, best[index])) best[index] = run;
    }
  });
  let end = -1;
  best.forEach((run, index) => { if (end < 0 || better(run, best[end])) end = index; });
  const run = [];
  for (let at = end; at >= 0; at = best[at].previous) run.unshift(at);
  return run;
}

/**
 * The blocks moved since the last look (`blocks`: blocksOf the report; `before`: readBaseline's, or
 * null): a block now in another block than it was, and of the blocks that stayed in theirs, those
 * out of the order the others kept (the fewest whose moving explains the new order: a longest run of
 * the places they had, in the order they have now, kept, of runs as long the one of the largest
 * blocks; a block added or taken out moves none), and those the last look kept as moved and not
 * pictured yet (`before.moved`) that the report still has. A Set of ids; one with no place kept
 * (new, or kept by an earlier version) is moved only as the last look kept it.
 */
export function movedBlocks(blocks, before) {
  const places = before?.places ?? {};
  const moved = new Set((before?.moved ?? []).filter((id) => blocks.has(id)));
  const stayed = new Map(); // parent -> [{ id, at: its place before, size }], in the file's order now
  for (const [id, { parent, size = 0 }] of blocks) {
    const place = places[id];
    if (!place) continue;
    if (place[0] !== parent) {
      moved.add(id);
      continue;
    }
    if (!stayed.has(parent)) stayed.set(parent, []);
    stayed.get(parent).push({ id, at: place[1], size });
  }
  for (const children of stayed.values()) {
    const kept = new Set(longestRise(children.map(({ at }) => at), children.map(({ size }) => size)).map((index) => children[index].id));
    for (const { id } of children) if (!kept.has(id)) moved.add(id);
  }
  return moved;
}

/**
 * What qa/<slug>/blocks.json keeps after a run (`blocks`: blocksOf the report; `before`:
 * readBaseline's, or null; `chosen`: blocksToPicture's (its ids pictured, and the blocks those hold,
 * `held`, pictured with them); `named`: the ids --blocks gave, or null; `verified`: whether the looks
 * saw all they meant to, nothing unverified; `failed`: whether they found a failure; `seen`: the ids
 * the looks really pictured (seenOf: those of `chosen.ids`, and of the blocks they hold those a
 * picture of them showed, or that showed nowhere), else every one of those, held or not; `page`:
 * pageOf the report now): { blocks: { id: hash }, places: { id: [parent, at] }, moved: [ids], unseen:
 * [ids], page } of the report's blocks as last looked at, or null to keep what is kept. Every block
 * takes its place as it is now. A block pictured now is looked at as it is; any other keeps the hash
 * of its last look, so a block changed and not pictured (one past BLOCK_PICTURES, or not among those
 * --blocks named, or a run of tiles alone, or one a card holds that its pictures did not show, as a
 * Sheet panel that could not be shown) is still changed at the next run; and a block moved and not
 * pictured is kept as moved (`moved`), so it is still moved at the next run, until a run pictures it,
 * whatever moved besides. A first look without --blocks takes every block as it is, as there is
 * nothing to compare with, but the cards it did not picture, kept as unseen (`unseen`: the runs after
 * picture them after what changed, until one has); so does a run that pictured the cards because the
 * report's own script or style changed (`chosen.pageChanged`), whose script and style are then taken
 * as they are, as a first look's are. The packages of the instances are taken as they are now
 * (`packages`, packageStamps), but one whose instances, pictured as its package changed, this run did
 * not all picture, which keeps the stamp it was compared with. Nothing changes after a look that found
 * a failure (the next run, after the fix, pictures what changed since the baseline again, the fix with
 * it, not the fix alone), nor after a look not verified (the next run pictures the same blocks), nor
 * after a first look with --blocks; a run of the blocks named or of tiles alone keeps the script and
 * style and the packages it was compared with.
 */
export function nextBaseline(blocks, before, chosen, { named = null, verified = true, failed = false, seen = null, page = undefined, packages = undefined } = {}) {
  if (!verified || failed || (named && !before)) return null;
  const pictured = seen ?? new Set([...chosen.ids, ...[...(chosen.held?.values() ?? [])].flat()]);
  const first = !before;
  // The cards this run meant to picture as a first look does (all of them): those it did not are unseen.
  const anew = first || chosen.pageChanged ? chosen.cards ?? [] : [];
  const unseen = [...(before?.unseen ?? []), ...anew];
  const next = {
    blocks: {}, places: {},
    moved: first ? [] : [...movedBlocks(blocks, before)].filter((id) => !pictured.has(id)),
    unseen: [...new Set(unseen)].filter((id) => blocks.has(id) && !pictured.has(id)),
  };
  for (const [id, { hash, parent, at }] of blocks) {
    const kept = first || pictured.has(id) ? hash : before.blocks[id];
    if (kept !== undefined) next.blocks[id] = kept;
    next.places[id] = [parent, at];
  }
  const kept = !first && (named || chosen.tiles) ? before.page : page;
  if (typeof kept === "string") next.page = kept;
  const stamps = !first && (named || chosen.tiles) ? before.packages : packages && Object.fromEntries(Object.entries(packages).map(([id, stamp]) => [id, (chosen.restyled?.get(id) ?? []).every((block) => pictured.has(block)) ? stamp : before.packages[id]]));
  if (stamps && Object.keys(stamps).length) next.packages = stamps;
  return next;
}

/**
 * The blocks held that a look showed and none of its pictures of their holder did (`looks`: what
 * lookAt said of each, its `held`: { covered: [ids a picture of the block holding them showed],
 * missed: [ids that showed and were in none of its pictures] }), each with the labels of the looks
 * (the widths) where: the middle of a tall block moved, pictured whole where it fits and at its two
 * joins where it does not. A picture at another width is no picture at this one (testing the skill with
 * Agents, 2026-10-30: a moved section's changed blocks were in its pictures at 1024 and 736px and in none at
 * 360px, and said nowhere). Map id -> [labels].
 */
export function missedWidths(looks) {
  const missed = new Map();
  for (const look of looks) {
    const covered = new Set(look.held?.covered ?? []);
    for (const id of look.held?.missed ?? []) if (!covered.has(id)) missed.set(id, [...(missed.get(id) ?? []), look.label ?? String(look.width)]);
  }
  return missed;
}

/**
 * The ids a run really pictured (`chosen`: blocksToPicture's; `looks`: what lookAt said of each look):
 * every id of `chosen.ids` (pictured, or shown at no width: nothing to see), and of the blocks they
 * hold, those a picture showed at each width they showed at, or that showed in none (a Sheet panel's,
 * which every look shows in turn; a block hidden from readers); one shown and in no picture of its
 * holder at some width (missedWidths) is not, and is pictured on its own at the next run, as changed.
 */
export function seenOf(chosen, looks) {
  const missed = missedWidths(looks);
  return new Set([...chosen.ids, ...[...(chosen.held?.values() ?? [])].flat().filter((id) => !missed.has(id))]);
}

/**
 * What a run's blocks are compared with, as its lines say it (`before`: readBaseline's): gallery qa's
 * own last look, or the document as it was exported, or as gallery open showed it, before the round
 * of changes (src/cli/qa-baseline.mjs), with when.
 */
export function baselineSaid(before) {
  const when = before.time ? ` of ${timeOf(before.time)}` : "";
  if (before.from === "export") return `the export${when} (the document before these changes)`;
  if (before.from === "preview") return `gallery open${when} (the document before these changes)`;
  return "the last look";
}

/**
 * Which blocks gallery qa pictures (`blocks`: blocksOf the report as it looks; `before`:
 * readBaseline's of its last look, or null; `named`: the ids --blocks gave, or null; `tiles`: a run
 * of the whole page in tiles alone, --tiles without --blocks; `page`: pageOf the report as it looks):
 * { ids: those pictured, in order; groups: [{ kind, why, ids, rest }], a heading each with its ids
 * pictured and those left past BLOCK_PICTURES (`kind`: "named", "changed" or "cards", the folder its
 * pictures go to: blocks/, changed/, cards/); why: the first group's; rest: the ids left past
 * BLOCK_PICTURES (with complete: past CHANGED_PICTURES changed blocks and the cards left of the BLOCK_PICTURES), of every group; held: a block pictured -> the blocks it holds that its picture
 * shows, pictured with it (pictured besides with each Sheet panel or detail card that holds one,
 * lookAt); cards: the cards this run meant to picture, held or left past the cap among them (those a
 * passing run does not picture stay unseen: nextBaseline); pageChanged: whether the report's own
 * script or style changed since the baseline; restyled: a package whose stamp changed since the
 * baseline (`packages`: packageStamps of the report now; one the baseline or now says nothing of is
 * as it was) -> the ids of its instances, their own markup as it was; left: of a run of named blocks,
 * what a plain run would picture and it does not ({ changed: the blocks changed or moved since the
 * baseline outside those named and the blocks they hold, restyled: those of them that are instances
 * of a package changed, packages: those packages, cards: when the script or style changed, or with no
 * baseline, the cards outside them, since: the baseline as said, first: whether there was none }),
 * else null; unknown: ids named that the report has not; moved:
 * those of ids moved since the last look; around: id -> [the block before it, the block after it] in
 * its parent (null for none), a moved block's, pictured with it; tiles: whether the whole page is
 * pictured (none of the blocks: `why` null for a run of tiles alone, which says nothing of blocks) }.
 * Those named, in the order named, each with the blocks it holds (a Sheet area named is pictured
 * with each of its panels); else, for tiles alone, none; else two groups, or three. "changed": the blocks changed since the baseline (new, or their own
 * markup changed) or moved (movedBlocks), the moved ones first (a move is most often what the user
 * asked for), then by rank (rankOf), each rank in the file's order; then, pictured into changed/ too,
 * the instances of a package changed since (restyled), under a heading of their own naming the
 * packages, their own markup as it was (a style or a script changed draws each again). "cards": with no baseline every
 * card ("no earlier look to compare with"); when the report's own script or style changed, every card
 * (a define or a rule may draw any of them again); when blocks changed, the cards no look has
 * pictured yet (`unseen`), under a heading of their own, as nothing of them changed; when nothing
 * did, every card, as a first look's; those unseen first, then by rank, each rank in the file's
 * order. A block another one pictured holds (a table in a Sheet area, a picture in columns, the nodes
 * of a new flowchart, what a moved section holds) is no picture of its own, but held by the outermost
 * of them: a changed block by a changed card or a moved block (a changed section's own words do not
 * make it a picture of all it holds) or by a block most of whose blocks changed (MOSTLY_CHANGED: it
 * is pictured whole, with the changed blocks in it, though its own words did not change), a card by
 * any card or moved block pictured. A report with no block ids (never handed in) is pictured whole.
 */
/** A block (not a card) holding at least this many changed blocks, half of those it holds or more, is pictured as a whole (blocksToPicture). */
export const MOSTLY_CHANGED = 3;
export function blocksToPicture(blocks, before, named = null, { tiles = false, page = undefined, packages = undefined, complete = false } = {}) {
  const none = { rest: [], unknown: [], moved: new Set(), around: new Map(), held: new Map(), groups: [], cards: [], pageChanged: false, changed: new Set(), restyled: new Map(), left: null };
  const order = [...blocks.keys()];
  const place = new Map(order.map((id, at) => [id, at]));
  const moved = before ? movedBlocks(blocks, before) : new Set();
  // The instances of a package changed since (its stamp, as the baseline and now say it), their own
  // markup as it was: changed all the same (testing the skill with Agents, 2026-11-05: a board's style changed
  // and gallery qa pictured nothing of it).
  const stampChanged = (id) => typeof before?.packages?.[id] === "string" && typeof packages?.[id] === "string" && before.packages[id] !== packages[id];
  const restyledIds = before ? order.filter((id) => stampChanged(blocks.get(id).package) && before.blocks[id] === blocks.get(id).hash && !moved.has(id)) : [];
  const restyled = new Map();
  for (const id of restyledIds) restyled.set(blocks.get(id).package, [...(restyled.get(blocks.get(id).package) ?? []), id]);
  const ofPackage = new Set(restyledIds);
  const changed = before ? order.filter((id) => before.blocks[id] !== blocks.get(id).hash || moved.has(id) || ofPackage.has(id)) : [];
  const unseen = new Set((before?.unseen ?? []).filter((id) => blocks.has(id) && !changed.includes(id)));
  // The outermost of `holders` a block is in, or null.
  const holderOf = (id, holders) => {
    let holder = null;
    for (let up = blocks.get(id).parent; up !== null && blocks.has(up); up = blocks.get(up).parent) if (holders.has(up)) holder = up;
    return holder;
  };
  // The blocks, not cards, most of whose blocks changed (MOSTLY_CHANGED: at least half of all the
  // blocks in it, three at least): pictured once as a whole, the changed blocks in it with it, not
  // each on its own (testing the skill with Agents, 2026-10-29: a summary whose paragraph and items were
  // rewritten took 8 of the 12 pictures, one an item, and left a changed disclosure and every card
  // unpictured). Counted are the changed blocks that would take a picture each: a block moved counts
  // for none (a move is pictured with the edges around it), nor one a changed card or a moved block
  // holds (that one's picture shows it: a new Sheet area's tabs and paragraphs are one picture).
  const changedSet = new Set(changed);
  const shownWith = new Set(changed.filter((id) => blocks.get(id).card || moved.has(id)));
  const counted = (id) => changedSet.has(id) && !moved.has(id) && holderOf(id, shownWith) === null;
  const counts = new Map(); // id -> { all, changed }: the blocks in it, at any depth
  for (const id of order) {
    for (let up = blocks.get(id).parent; up !== null && blocks.has(up); up = blocks.get(up).parent) {
      const count = counts.get(up) ?? { all: 0, changed: 0 };
      count.all += 1;
      if (counted(id)) count.changed += 1;
      counts.set(up, count);
    }
  }
  const mostly = order.filter((id) => !blocks.get(id).card && counts.has(id) && counts.get(id).changed >= MOSTLY_CHANGED && counts.get(id).changed * 2 >= counts.get(id).all);
  if (named) {
    const ids = [...new Set(named)].filter((id) => blocks.has(id));
    const holders = new Set(ids);
    const held = new Map();
    for (const id of order) {
      const holder = holders.has(id) ? null : holderOf(id, holders);
      if (holder !== null) held.set(holder, [...(held.get(holder) ?? []), id]);
    }
    const why = "the blocks named";
    // What a plain run would picture that this one does not: the blocks changed or moved outside
    // those named (each the outermost, as a plain run groups them), and the cards a change of the
    // document's own script or style may draw again (left as they were in the baseline: the next
    // plain run pictures them). Said before the verdict (describeLooks): a run of named blocks after
    // a fix pictured the tables named and never the chart the fix redrew (found testing the skill with
    // Agents, 2026-10-28).
    const pictured = new Set([...ids, ...[...held.values()].flat()]);
    const pageChanged = Boolean(before) && typeof before.page === "string" && typeof page === "string" && before.page !== page;
    const changedHolders = new Set([...changed.filter((id) => blocks.get(id).card || moved.has(id)), ...mostly]);
    // With no earlier look, a plain run pictures every card: those left are every card outside the
    // ones named (a --blocks run on a document never looked at said nothing of them, found in a review,
    // 2026-10-29).
    const cardIds = !before || pageChanged ? order.filter((id) => blocks.get(id).card && !changed.includes(id)) : [];
    const cardHolders = new Set([...changedHolders, ...cardIds]);
    const leftChanged = [...changed, ...mostly.filter((id) => !changedSet.has(id))].sort((a, b) => place.get(a) - place.get(b)).filter((id) => !pictured.has(id) && holderOf(id, changedHolders) === null);
    const leftRestyled = leftChanged.filter((id) => ofPackage.has(id));
    const left = {
      changed: leftChanged.filter((id) => !ofPackage.has(id)),
      ...(leftRestyled.length ? { restyled: leftRestyled, packages: [...new Set(leftRestyled.map((id) => blocks.get(id).package))] } : {}),
      cards: cardIds.filter((id) => !pictured.has(id) && holderOf(id, cardHolders) === null).sort((a, b) => blocks.get(a).rank - blocks.get(b).rank || place.get(a) - place.get(b)), // by rank, as a plain run takes them
      since: before ? baselineSaid(before) : "",
      first: !before,
    };
    return { ...none, ids, why, groups: [{ kind: "named", why, ids, rest: [] }], held, pageChanged, changed: new Set(changed), restyled, left, unknown: [...new Set(named)].filter((id) => !blocks.has(id)) };
  }
  if (blocks.size === 0) return { ...none, ids: [], why: "the document has no block ids (never handed in): the whole page in tiles instead", tiles: true };
  if (tiles) return { ...none, ids: [], why: null, tiles: true };
  const by = (...keys) => (a, b) => keys.reduce((sum, key) => sum || key(a) - key(b), 0);
  const rank = (id) => blocks.get(id).rank;
  const at = (id) => place.get(id);
  const since = before ? baselineSaid(before) : "";
  const pageChanged = Boolean(before) && typeof before.page === "string" && typeof page === "string" && before.page !== page;
  // The cards pictured besides what changed: all of them as a first look does, or those unseen.
  const cardIds = order.filter((id) => blocks.get(id).card && !changed.includes(id));
  const allCards = !before || pageChanged || changed.length === 0;
  const candidates = allCards ? cardIds : cardIds.filter((id) => unseen.has(id));
  // A block another pictured holds is held by the outermost (a changed one by a changed card or a
  // moved block, a card by any card or moved block pictured): its picture shows it.
  const changedHolders = new Set([...changed.filter((id) => blocks.get(id).card || moved.has(id)), ...mostly]);
  const cardHolders = new Set([...changedHolders, ...candidates]);
  const holding = new Map();
  const free = (ids, holders) => ids.filter((id) => {
    const holder = holderOf(id, holders);
    if (holder !== null) holding.set(holder, [...(holding.get(holder) ?? []), id]);
    return holder === null;
  });
  // A block most of whose blocks changed, its own words as they were, in one such block or a changed card:
  // no picture of its own, nor among the changed blocks its holder's picture says it holds.
  const own = [...free(changed, changedHolders), ...mostly.filter((id) => !changedSet.has(id) && holderOf(id, changedHolders) === null)].sort(by((id) => Number(!moved.has(id)), rank, at));
  const restyledOwn = own.filter((id) => ofPackage.has(id));
  const changedOwn = own.filter((id) => !ofPackage.has(id));
  const cards = free(candidates, cardHolders).sort(by((id) => Number(!unseen.has(id)), rank, at));
  const CARDS = "the cards (chart cards, code blocks, whole blocks, components, flowcharts and Sheet areas, then columns and the other figures, then tables)";
  const unseenFirst = cards.some((id) => unseen.has(id)) ? ", those no look has pictured yet first" : "";
  const known = typeof before?.page === "string" && typeof page === "string";
  const cardsWhy = !before ? `${CARDS}: no earlier look to compare with`
    : pageChanged ? `${CARDS.replace("the cards", "the cards, not changed themselves")}${unseenFirst}: the document's own <script> or <style> changed since ${since}, which may draw any of them`
      : changed.length ? "the cards no look has pictured yet (not changed themselves)"
        : `${CARDS}${unseenFirst}: no block changed since ${since}${known ? ", nor the document's own <script> or <style>" : ""}`;
  const groups = [
    ...(changedOwn.length ? [{ kind: "changed", why: `the blocks changed since ${since}${moved.size ? " (a moved block pictured with the edges of the blocks before and after it, the moved ones first)" : ""}`, all: changedOwn }] : []),
    ...(restyledOwn.length ? [{ kind: "changed", why: `the instances of a custom block changed since ${since} (${[...new Set(restyledOwn.map((id) => blocks.get(id).package))].join(", ")})`, all: restyledOwn }] : []),
    ...(cards.length || !own.length ? [{ kind: "cards", why: cardsWhy, all: cards }] : []),
  ];
  // BLOCK_PICTURES at most, the changed blocks first. With `complete` (gallery qa's own runs: it takes the
  // pictures an Agent had to ask for in a second run) every changed block, CHANGED_PICTURES at most, and
  // the cards that are left of the BLOCK_PICTURES; the cards past them need no look (nothing changed in
  // them: describeLooks says so), and stay unseen for a later run, as always.
  let room = BLOCK_PICTURES;
  let changedRoom = CHANGED_PICTURES;
  for (const group of groups) {
    group.ids = group.all.slice(0, Math.max(0, complete && group.kind !== "cards" ? changedRoom : room));
    group.rest = group.all.slice(group.ids.length);
    room -= group.ids.length;
    changedRoom -= group.ids.length;
    delete group.all;
  }
  const shown = groups.flatMap((group) => group.ids);
  const siblings = (id) => {
    const { parent, at: index } = blocks.get(id);
    const near = (offset) => order.find((other) => blocks.get(other).parent === parent && blocks.get(other).at === index + offset) ?? null;
    return [near(-1), near(1)];
  };
  const around = new Map(shown.filter((id) => moved.has(id)).map((id) => [id, siblings(id)]));
  const held = new Map(shown.filter((id) => holding.has(id)).map((id) => [id, holding.get(id)]));
  return {
    ...none, ids: shown, why: groups[0].why, groups, rest: groups.flatMap((group) => group.rest),
    moved: new Set(shown.filter((id) => moved.has(id))), around, held, cards: candidates, pageChanged, changed: new Set(changed), restyled,
  };
}

// ---------- in the page ----------

// Each disclosure opened (one closed in the file marked so, data-qa-closed: what scrolls in it is
// what a reader who opens it meets), each picture loaded now (a lazy one too), the detail cards
// closed in the page numbered (data-qa-card), with their titles, to be opened in turn, and the
// Sheets' tabs numbered (data-qa-tab), with the tabs a reader clicks to reach each (those of the
// Sheets it is in first) and the detail card it is in, if any (`card`: its Sheets are shown while
// that card is open). A card has the tabs that reach the Sheet panel it is in (`chain`) and the
// cards it is in (`within`, the outermost first): a card in a panel not shown, or in a card closed,
// draws nothing when opened. In the page.
function prepare(timeout) {
  const dev = (node) => Boolean(node.closest("[data-doc-dev]"));
  const details = [...document.querySelectorAll("details")].filter((node) => !dev(node));
  const closed = details.filter((node) => !node.open).length;
  details.forEach((node) => {
    if (!node.open) node.setAttribute("data-qa-closed", "");
    node.open = true;
  });
  const images = [...document.images].filter((image) => !dev(image));
  images.forEach((image) => { if (image.loading === "lazy") image.loading = "eager"; });
  const dialogs = [...document.querySelectorAll("dialog")].filter((dialog) => !dev(dialog) && !dialog.open);
  dialogs.forEach((dialog, index) => { dialog.dataset.qaCard = String(index); });
  const cardOf = (node) => node.parentElement?.closest("dialog[data-qa-card]") ?? null;
  const tabs = [...document.querySelectorAll("[data-doc-sheets] > .doc-sheet-tabs > [data-sheet-tab]")].filter((tab) => !dev(tab));
  tabs.forEach((tab, index) => { tab.dataset.qaTab = String(index); });
  const areaOf = (tab) => tab.parentElement.parentElement;
  // The tabs a reader clicks to reach the Sheet panel `node` is in, the outermost first.
  const reach = (node) => {
    const chain = [];
    for (let panel = node.closest("[data-doc-sheet]"); panel; panel = panel.parentElement.closest("[data-doc-sheet]")) {
      const outer = tabs.find((other) => areaOf(other) === panel.parentElement && other.getAttribute("data-sheet-tab") === panel.getAttribute("data-doc-sheet"));
      if (outer) chain.unshift(Number(outer.dataset.qaTab));
    }
    return chain;
  };
  const sheets = tabs.map((tab, index) => {
    const chain = [...reach(areaOf(tab)), index];
    const panel = [...areaOf(tab).children].find((child) => child.getAttribute("data-doc-sheet") === tab.getAttribute("data-sheet-tab"));
    if (panel) panel.dataset.qaPanel = String(index);
    const card = cardOf(tab);
    return { index, chain, card: card ? Number(card.dataset.qaCard) : null, label: (tab.textContent ?? "").replace(/\s+/g, " ").trim(), shown: chain.every((at) => tabs[at].getAttribute("aria-selected") === "true"), panel: Boolean(panel) };
  });
  const cards = dialogs.map((dialog, index) => {
    const entry = `[href="#${CSS.escape(dialog.id)}"]`; // what opens it, whose words name a card with no heading
    const title = [...dialog.querySelectorAll("h1, h2, h3, h4")].find((heading) => heading.textContent.trim()) ?? document.querySelector(entry);
    const within = [];
    for (let outer = cardOf(dialog); outer; outer = cardOf(outer)) within.unshift(Number(outer.dataset.qaCard));
    return { index, chain: reach(dialog), within, label: (title?.textContent || dialog.id || "").replace(/\s+/g, " ").trim() };
  });
  const loading = Promise.all(images.map((image) => image.decode().catch(() => {})));
  return Promise.race([loading.then(() => true), new Promise((resolve) => setTimeout(() => resolve(false), timeout))])
    .then((loaded) => ({ details: details.length, closed, images: images.length, loaded, sheets, cards }));
}

// Opens the detail card numbered `at` (data-qa-card) as a reader's click does (the kit's
// DocDialogs, which locks the page behind it; a dialog of the page's own by showModal), once its
// opening animation is done. Whether it shows. In the page.
function openCard(at) {
  const dialog = document.querySelector(`[data-qa-card="${at}"]`);
  if (!dialog) return Promise.resolve(false);
  if (!dialog.open) {
    if (globalThis.DocDialogs) globalThis.DocDialogs.open(dialog, null);
    else if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }
  document.activeElement?.blur?.(); // no focus ring on what took the focus, as a reader's click leaves none
  // Only the animations of time: a tab row's fade at its ends (the kit's sheets.css) runs on the strip's scroll and never finishes.
  return Promise.all(dialog.getAnimations({ subtree: true }).filter((animation) => animation.timeline === document.timeline).map((animation) => animation.finished.catch(() => {})))
    .then(() => dialog.open && dialog.getClientRects().length > 0);
}

// Closes the detail card numbered `at`. In the page.
function closeCard(at) {
  const dialog = document.querySelector(`[data-qa-card="${at}"]`);
  if (!dialog?.open) return;
  if (globalThis.DocDialogs) globalThis.DocDialogs.close(dialog);
  else if (typeof dialog.close === "function") dialog.close();
  else dialog.removeAttribute("open");
}

/**
 * Where the element `selector` finds draws, as its picture is framed (`up`: that many elements
 * above it instead, a Sheet panel's area): its box with what it holds that shows and what its own
 * and their ::before and ::after draw where they are placed absolutely (a timeline's dot at left:
 * -7px, past its box), each cut by what clips it up to the element (a table's frame that scrolls
 * shows only what is in it), the whole cut by what clips the element (a detail card's content that
 * scrolls), `margin` px around it (an outline, a shadow), inside the document: { clip: { x, y,
 * width, height } in the page's pixels, fixed: whether it stands in a fixed box (an open detail
 * card), pictured where the window shows it }, or null when it does not show. Scrolled into view
 * first, as an element's picture is, and, when that moved it, two frames drawn after the scroll
 * (SCROLL_FRAMES) before it is measured and pictured. In the page.
 */
export async function inkOf({ selector, up = 0, margin = 0, frames = 2 }) {
  let node = document.querySelector(selector);
  for (let step = 0; step < up && node; step++) node = node.parentElement;
  if (!node || node.getClientRects().length === 0) return null;
  const before = node.getBoundingClientRect();
  node.scrollIntoView({ block: "nearest", inline: "nearest" });
  const after = node.getBoundingClientRect();
  if (before.top !== after.top || before.left !== after.left) {
    const frame = () => new Promise((resolve) => {
      requestAnimationFrame(() => resolve());
      setTimeout(resolve, 100); // a page that draws no frames (hidden) is not waited for
    });
    for (let drawn = 0; drawn < frames; drawn++) await frame();
  }
  const page = (element) => element === document.body || element === document.documentElement;
  // A box cut by the elements that clip it, from `from` up to `to` (null: up to the page).
  const cut = (box, from, to) => {
    let { left, top, right, bottom } = box;
    for (let up = from; up && !page(up); up = up.parentElement) {
      const style = getComputedStyle(up);
      const x = style.overflowX !== "visible";
      const y = style.overflowY !== "visible";
      if (x || y) {
        const edge = up.getBoundingClientRect();
        if (x) [left, right] = [Math.max(left, edge.left), Math.min(right, edge.right)];
        if (y) [top, bottom] = [Math.max(top, edge.top), Math.min(bottom, edge.bottom)];
      }
      if (up === to) break;
    }
    return right > left && bottom > top ? { left, top, right, bottom } : null;
  };
  const px = (value) => parseFloat(value) || 0;
  // What a ::before or ::after placed absolutely draws (its containing block the element when it is
  // placed, else the nearest that is; the window for a fixed one), or null.
  const pseudo = (element, which) => {
    const style = getComputedStyle(element, which);
    if (["none", "normal"].includes(style.content) || style.display === "none" || !["absolute", "fixed"].includes(style.position)) return null;
    const holder = style.position === "fixed" ? null : getComputedStyle(element).position !== "static" ? element : element.offsetParent;
    const edge = holder ? holder.getBoundingClientRect() : { left: 0, top: 0, right: innerWidth, bottom: innerHeight };
    const border = holder ? getComputedStyle(holder) : null;
    const inner = { left: edge.left + px(border?.borderLeftWidth), top: edge.top + px(border?.borderTopWidth), right: edge.right - px(border?.borderRightWidth), bottom: edge.bottom - px(border?.borderBottomWidth) };
    const extra = (a, b) => (style.boxSizing === "border-box" ? 0 : px(style[`padding${a}`]) + px(style[`padding${b}`]) + px(style[`border${a}Width`]) + px(style[`border${b}Width`]));
    const width = px(style.width) + extra("Left", "Right");
    const height = px(style.height) + extra("Top", "Bottom");
    const left = style.left !== "auto" ? inner.left + px(style.left) + px(style.marginLeft) : style.right !== "auto" ? inner.right - px(style.right) - px(style.marginRight) - width : null;
    const top = style.top !== "auto" ? inner.top + px(style.top) + px(style.marginTop) : style.bottom !== "auto" ? inner.bottom - px(style.bottom) - px(style.marginBottom) - height : null;
    if (left === null || top === null || !(width > 0) || !(height > 0)) return null;
    return cut({ left, top, right: left + width, bottom: top + height }, element, node);
  };
  const boxes = [node.getBoundingClientRect()];
  const elements = [node];
  for (const child of node.querySelectorAll("*")) {
    if ((child instanceof SVGElement && child.ownerSVGElement) || child.matches("script, style, template") || child.getClientRects().length === 0) continue;
    if (getComputedStyle(child).visibility === "hidden") continue;
    elements.push(child);
    boxes.push(cut(child.getBoundingClientRect(), child.parentElement, node));
  }
  for (const element of elements) boxes.push(pseudo(element, "::before"), pseudo(element, "::after"));
  // Words that run past the box of their element (one that cannot break).
  const range = document.createRange();
  const texts = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
  for (let text = texts.nextNode(); text; text = texts.nextNode()) {
    if (!text.nodeValue.trim() || !text.parentElement || text.parentElement.closest("svg, script, style, template")) continue;
    range.selectNodeContents(text);
    for (const rect of range.getClientRects()) boxes.push(cut(rect, text.parentElement, node));
  }
  range.detach();
  const shown = boxes.filter(Boolean);
  const all = { left: Math.min(...shown.map((box) => box.left)), top: Math.min(...shown.map((box) => box.top)), right: Math.max(...shown.map((box) => box.right)), bottom: Math.max(...shown.map((box) => box.bottom)) };
  const ink = cut(all, node.parentElement, null) ?? all;
  let fixed = false;
  for (let up = node; up && !fixed; up = up.parentElement) fixed = getComputedStyle(up).position === "fixed";
  const x = visualViewport.pageLeft;
  const y = visualViewport.pageTop;
  const [width, height] = fixed ? [x + innerWidth, y + innerHeight] : [document.documentElement.scrollWidth, document.documentElement.scrollHeight];
  const left = Math.max(fixed ? x : 0, ink.left + x - margin);
  const top = Math.max(fixed ? y : 0, ink.top + y - margin);
  const right = Math.min(width, ink.right + x + margin);
  const bottom = Math.min(height, ink.bottom + y + margin);
  return right > left && bottom > top ? { clip: { x: left, y: top, width: right - left, height: bottom - top }, fixed } : null;
}

// Shows a Sheet: the tabs of its chain clicked, outermost first. Whether its panel shows. In the page.
function showSheet(chain) {
  for (const at of chain) {
    const tab = document.querySelector(`[data-qa-tab="${at}"]`);
    if (tab && tab.getAttribute("aria-selected") !== "true") tab.click();
  }
  const panel = document.querySelector(`[data-qa-panel="${chain.at(-1)}"]`);
  return Boolean(panel && !panel.hidden && panel.getClientRects().length > 0);
}

// What a reader would meet in `scope` (the page, or a Sheet's panel): [{ kind, what, anchor, shot,
// seen, url, scroll }], each element numbered once (data-qa-shot, from `next` on), shown or not, so
// that what two looks find of it is one finding, and pictured when `seen`. `ignored` are the
// elements whose text KaTeX leaves as written (MATH_IGNORED_TAGS); `slack` how far past its frame a
// table may reach without scrolling (SCROLL_SLACK); `whole` the block ids of the whole blocks and
// `drawn` those of the figure cards, whose words are measured against their boxes. Asked only where
// an element is (`place`, a selector), it gives that element's anchor. In the page, with tableHides
// put in it (__qaTableHides).
function measure({ scope, next, ignored = [], place, slack = 4, whole = [], drawn = [] }) {
  const root = scope ? document.querySelector(scope) : document.body;
  const found = [];
  if (!root) return { found, next };
  const view = document.documentElement.clientWidth;
  const round = Math.round;
  const tidy = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
  const quote = (value, length = 32) => {
    const text = tidy(value);
    return `"${text.length > length ? `${text.slice(0, length - 1)}…` : text}"`;
  };
  const outsidePage = (node) => Boolean(node.closest?.("[data-doc-dev]"));
  const shown = (node) => {
    if (!node.isConnected || node.getClientRects().length === 0) return false;
    for (let up = node; up && up.nodeType === 1; up = up.parentElement) {
      const style = getComputedStyle(up);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) return false;
      if (up.matches(".katex-mathml, .sr-only, [role=tooltip], [data-doc-dev]")) return false;
    }
    return true;
  };
  const describe = (node) => `${node.localName}${[...node.classList].filter((name) => !name.startsWith("is-")).slice(0, 2).map((name) => `.${name}`).join("")}`;
  // An element's words as its source has them (wordsOf in Node: no blanks, 120 characters), and
  // which of the elements alike it is (two equal paragraphs are two places of the file): the
  // page's elements of a tag are sorted by their words once, when a finding first asks.
  const wordsOf = (node) => (node.textContent ?? "").replace(/\s+/g, "").slice(0, 120);
  const alike = new Map(); // tag -> words -> the elements, in the page's order
  const words = (node) => {
    const own = wordsOf(node);
    if (!alike.has(node.localName)) {
      const byWords = new Map();
      for (const other of document.getElementsByTagName(node.localName)) {
        if (outsidePage(other)) continue;
        const key = wordsOf(other);
        if (!byWords.has(key)) byWords.set(key, []);
        byWords.get(key).push(other);
      }
      alike.set(node.localName, byWords);
    }
    const nth = alike.get(node.localName).get(own)?.indexOf(node) ?? 0;
    return { tag: node.localName, words: own, nth: Math.max(0, nth), text: tidy(node.textContent).slice(0, 80) };
  };
  // A note's words as a reader reads them: a part set at its right (.doc-tab: a unit, a source)
  // after a " · ", as the gap before it parts them on the page.
  const noteText = (note) => {
    const copy = note.cloneNode(true);
    for (const tab of copy.querySelectorAll(".doc-tab")) tab.before(" · ");
    return tidy(copy.textContent).replace(/^· /, "");
  };
  // A table's name (`frame`: its table or the frame around it), one for every line that names it: its
  // caption, else the title of the chart card drawn from it (data-doc-chart-source on its frame,
  // the card's host's data-doc-chart-data), else the note right above its frame (what a caption of
  // words becomes as the file is written: source/natural.mjs), else its first header cell's words,
  // else its first cell's.
  const tableNameOf = (frame) => {
    const table = frame.matches("table") ? frame : frame.querySelector("table");
    const wrap = frame.closest(".doc-table-wrap") ?? frame;
    const key = wrap.getAttribute("data-doc-chart-source")?.trim();
    const host = key ? [...document.querySelectorAll("[data-doc-chart-data]")].find((node) => node.getAttribute("data-doc-chart-data").trim() === key && !outsidePage(node)) : null;
    const title = host?.closest("figure")?.querySelector(":scope > h2, :scope > h3, :scope > h4, :scope > figcaption");
    const before = wrap.previousElementSibling;
    return tidy(table?.caption?.textContent) || tidy(title?.textContent) || (before?.matches("p.doc-note") ? noteText(before) : "")
      || tidy(table?.querySelector("th")?.textContent ?? table?.rows[0]?.cells[0]?.textContent);
  };
  // What names the element's place in the source: block ids and ids (nearest first), its chart card's
  // title, its table's first header cell (and its table's name), its words and those of what holds it
  // (up to its block's box), its section's heading.
  const anchorOf = (node) => {
    const element = node.nodeType === 1 ? node : node.parentElement;
    const blocks = [];
    const ids = [];
    for (let up = element; up && up !== document.documentElement; up = up.parentElement) {
      if (up.hasAttribute("data-block-id")) blocks.push(up.getAttribute("data-block-id"));
      if (up.id && !up.hasAttribute("data-qa-tab") && !up.hasAttribute("data-qa-panel")) ids.push(up.id);
    }
    const texts = [];
    for (let up = element, depth = 0; up && depth < 4 && !up.matches("body, main, section, [data-doc-sheet], [data-doc-sheets], .doc-columns, .doc-column"); up = up.parentElement, depth++) {
      const own = words(up);
      if (own.words.length >= 2) texts.push(own);
    }
    const title = element.closest("figure")?.querySelector(":scope > h3, :scope > figcaption, :scope > .doc-figure-caption");
    const frame = element.closest(".doc-table-wrap, table");
    const header = frame?.querySelector("th");
    const heading = element.closest("section")?.querySelector(":scope > h2, :scope > h3, :scope > h4");
    return { blocks, ids, texts, tag: element.localName, element: describe(element), card: title ? words(title) : null, header: header ? words(header) : null, table: frame ? tableNameOf(frame).slice(0, 80) : null, section: heading ? words(heading) : null };
  };
  if (place) {
    const element = document.querySelector(place);
    return { found, next, anchor: element ? anchorOf(element) : null };
  }
  const number = (node) => {
    if (!node.dataset.qaShot) node.dataset.qaShot = String(++next);
    return Number(node.dataset.qaShot);
  };
  // A finding of `node` (null: the page), pictured by `picture` (the node, its card…) when it shows;
  // `level`, one it says itself (findingLevel in Node).
  const add = (kind, node, what, { picture = node, url, measured, scroll, level } = {}) => found.push({
    kind, what, anchor: node ? anchorOf(node) : null, shot: picture ? number(picture) : null, seen: Boolean(picture && shown(picture)), url, measured, scroll, ...(level ? { level } : {}),
  });
  const cardOf = (node) => node.closest("figure") ?? node.closest("[data-doc-chart]") ?? node;
  const area = (node) => {
    const box = node.getBoundingClientRect();
    return box.width > 0 && box.height > 0;
  };

  // How far a box reaches past another (px), along the axes that count.
  const past = (box, edge, { x = true, y = true } = {}) => Math.max(
    x ? edge.left - box.left : -Infinity, x ? box.right - edge.right : -Infinity,
    y ? edge.top - box.top : -Infinity, y ? box.bottom - edge.bottom : -Infinity,
  );
  const boundsOf = (points) => ({ left: Math.min(...points.map((p) => p.x)), right: Math.max(...points.map((p) => p.x)), top: Math.min(...points.map((p) => p.y)), bottom: Math.max(...points.map((p) => p.y)) });
  // An SVG text's box on the screen: its outline's four corners through its transforms (a turned label stays thin).
  const boxOf = (label) => {
    const box = label.getBBox();
    const matrix = label.getScreenCTM();
    return boundsOf([[box.x, box.y], [box.x + box.width, box.y], [box.x + box.width, box.y + box.height], [box.x, box.y + box.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix)));
  };
  // What cuts an SVG text off: an svg that hides what overflows it, a clip-path's rectangle (in the
  // user space of what it clips), an HTML element whose overflow is hidden or clip (one that scrolls
  // hides nothing a reader cannot reach).
  const clipsOf = (label) => {
    const clips = [];
    for (let up = label.parentElement; up && up !== document.documentElement; up = up.parentElement) {
      const style = getComputedStyle(up);
      if (up instanceof SVGSVGElement && style.overflow !== "visible") clips.push(["the svg's edge", up.getBoundingClientRect(), {}]);
      const id = /url\(\s*["']?#([^)"']+)/.exec(`${up.getAttribute?.("clip-path") ?? ""} ${style.clipPath ?? ""}`)?.[1];
      const clip = id ? document.getElementById(id) : null;
      const shape = clip?.getAttribute("clipPathUnits") !== "objectBoundingBox" ? clip?.querySelector("rect") : null;
      if (shape && up.getScreenCTM) {
        const [x, y, w, h] = ["x", "y", "width", "height"].map((name) => shape[name].baseVal.value);
        clips.push(["a clip-path", boundsOf([[x, y], [x + w, y + h]].map(([px, py]) => new DOMPoint(px, py).matrixTransform(up.getScreenCTM()))), {}]);
      }
      if (!(up instanceof SVGElement)) {
        const x = /hidden|clip/.test(style.overflowX);
        const y = /hidden|clip/.test(style.overflowY);
        if (x || y) clips.push([describe(up), up.getBoundingClientRect(), { x, y }]);
      }
    }
    return clips;
  };
  const list = (items) => `${items.slice(0, 4).join("; ")}${items.length > 4 ? `; ${items.length - 4} more` : ""}`;

  // Charts that drew nothing: a host holding nothing but its data (its JSON script) and the kit's note of an error
  // (an svg, a canvas, or the HTML a chart of the report's own draws, shown with a size, is a drawing).
  const drawing = (child) => !child.matches("script, [data-doc-dev]") && (child.matches("svg, canvas") || child.querySelector("svg, canvas") || (shown(child) && area(child)));
  for (const host of root.querySelectorAll("[data-doc-chart]")) {
    if (outsidePage(host) || !shown(host) || [...host.children].some(drawing)) continue;
    add("chart-empty", host, `the ${host.getAttribute("data-doc-chart") || "chart"} chart drew nothing`, { picture: cardOf(host) });
  }

  // The text of drawings: charts' and the report's own (an svg big enough to be one, not an icon).
  const drawings = [...root.querySelectorAll("svg")].filter((svg) => {
    if (svg.parentElement.closest("svg") || outsidePage(svg) || svg.closest(".katex, .doc-icon, button") || !shown(svg)) return false;
    const box = svg.getBoundingClientRect();
    return svg.closest("[data-doc-chart], figure") || (box.width >= 120 && box.height >= 60);
  });
  // How close two tick labels may stand, in their font's size (the ticks finding below). Across:
  // less than a digit's width and a hair (0.6em, about 8px at 13px). A digit is about half an em and
  // a word space a quarter: numbers closer than a digit read as one run of digits ("0.4 0.5"), numbers
  // a digit or more apart as separate values. A whole em warned on axes that read well (a review of
  // 2026-10-29): 21 labels 0 … 100 at 1024px (13px apart), the years 2010 … 2024 at 736px (12px).
  // A phone axis an Agent drew (five labels, 0 … 8,000, along 302px) keeps 28px between them and passes;
  // 0.0 … 1.0 along it keeps 7px (0.54em) and warns, as labels touching or overlapping do. Down: a
  // quarter of a line between outlines as tall as the font, lines of text set tighter than 1.25 (a d3
  // axis 20px a tick keeps 7px at 13px).
  const CROWDED_TICKS = { across: 0.6, down: 0.25 };
  const crowded = new Map(); // a tick label of an axis the ticks finding names -> that axis
  for (const svg of drawings) {
    const card = cardOf(svg);
    const edge = card.getBoundingClientRect();
    const clipped = [];
    const outside = [];
    const labels = [...svg.querySelectorAll("text")].filter((label) => !label.closest("defs, clipPath, mask, pattern, marker, symbol") && tidy(label.textContent) && shown(label));
    for (const label of labels) {
      const box = boxOf(label);
      const cut = clipsOf(label).map(([by, clip, axes]) => [by, past(box, clip, axes)]).find(([, depth]) => depth > 1.5);
      if (cut) clipped.push(`${quote(label.textContent, 24)} ${round(cut[1])}px past ${cut[0]}`);
      else if (past(box, edge) > 1.5) outside.push(`${quote(label.textContent, 24)} ${round(past(box, edge))}px past the card's edge`);
    }
    if (clipped.length) add("chart-text-clipped", svg, list(clipped), { picture: card });
    if (outside.length) add("chart-text-outside", svg, list(outside), { picture: card });
    // Ticks that crowd: a value axis (a group of g.tick whose labels are evenly spaced numbers: 0, 20,
    // 40…, each label a number alone, with at most a sign, a currency sign and a short unit: −5, 20%,
    // $1,000, 3万; not categories that hold digits: p0.1, ×2, 第1周, Q1, which are text over text when
    // they crowd, with the advice for labels; nor dates such as 10.16, 10.23, 11.6, not evenly
    // spaced), its labels upright, whose two neighbours stand closer than CROWDED_TICKS of their
    // font's size along it. Measured, not counted: d3's
    // ticks(n) is a hint and draws as many as fit its steps, and five labels along a phone's 302px
    // axis (0, 2,000 … 8,000) stand 28px apart and read well, while nine stand touching. Across the
    // chart, the space between two labels' boxes; down it, between their outlines (as tall as the
    // font, as outlineOf below: a label's line height is no space a reader sees). Labels it names are
    // not said again as text over text (one finding, with the advice for an axis).
    const numberOf = (label) => {
      const value = /^(-?)[$¥€£]?(\d[\d,]*(?:\.\d+)?)\s*(?:%|‰|[kKMBG]|万|亿)?$/.exec(label.replace(/[−–]/g, "-"));
      return value ? Number(`${value[1]}${value[2].replace(/,/g, "")}`) : NaN;
    };
    const even = (numbers) => numbers.every(Number.isFinite) && numbers[1] !== numbers[0]
      && numbers.slice(2).every((value, at) => Math.abs(value - numbers[at + 1] - (numbers[1] - numbers[0])) <= 1e-9 * Math.max(1, Math.abs(value)));
    for (const axis of svg.querySelectorAll("g")) {
      const ticks = [...axis.children].filter((child) => child.matches("g.tick") && shown(child));
      const texts = ticks.map((tick) => tick.querySelector("text")).filter((label) => label && tidy(label.textContent) && shown(label));
      const values = texts.map((label) => tidy(label.textContent));
      if (values.length < 2 || values.length !== ticks.length || !even(values.map(numberOf))) continue;
      const placed = texts.map((label) => {
        const matrix = label.getScreenCTM();
        const size = (parseFloat(getComputedStyle(label).fontSize) || 0) * (matrix ? Math.hypot(matrix.c, matrix.d) : 1);
        return { label, box: boxOf(label), size, turned: Boolean(matrix) && Math.abs(matrix.b) > 1e-3 * Math.abs(matrix.a) };
      });
      if (placed.some((one) => one.turned || !(one.size > 0))) continue;
      const middles = placed.map(({ box }) => [(box.left + box.right) / 2, (box.top + box.bottom) / 2]);
      const across = Math.max(...middles.map(([x]) => x)) - Math.min(...middles.map(([x]) => x)) >= Math.max(...middles.map(([, y]) => y)) - Math.min(...middles.map(([, y]) => y));
      const span = ({ box, size }) => (across ? [box.left, box.right] : [(box.top + box.bottom - size) / 2, (box.top + box.bottom + size) / 2]);
      const order = [...placed].sort((a, b) => span(a)[0] - span(b)[0]);
      let closest = null;
      for (let at = 1; at < order.length; at++) {
        const gap = span(order[at])[0] - span(order[at - 1])[1];
        if (!closest || gap < closest.gap) closest = { gap, pair: [order[at - 1], order[at]] };
      }
      const size = Math.max(...placed.map((one) => one.size));
      if (!closest || closest.gap >= CROWDED_TICKS[across ? "across" : "down"] * size) continue;
      for (const { label } of placed) crowded.set(label, axis);
      const [one, other] = closest.pair.map(({ label }) => quote(label.textContent, 16));
      const apart = closest.gap < 0 ? `${one} and ${other} overlapping by ${round(-closest.gap)}px` : `${one} and ${other} ${round(closest.gap)}px apart`;
      add("ticks", svg, `${values.length} tick labels ${across ? "across" : "down"} a ${round(across ? svg.getBoundingClientRect().width : svg.getBoundingClientRect().height)}px chart crowd: ${apart}, under ${across ? "a digit's width and a hair" : "a quarter of a line"} at their ${round(size)}px (${values.slice(0, 6).join(", ")}${values.length > 6 ? ", …" : ""})`, { picture: card });
    }
  }

  // Text over text in a drawing: two of its labels whose outlines overlap (a turned label as it is
  // drawn, not its upright box). A text's outline is as tall as its font's size, about its box's
  // middle (its box holds the font's whole ascent and descent, room no glyph takes, which two turned
  // labels a line apart would share). Depth: how far two convex outlines reach into each other along
  // the axis that parts them most (0 when one parts them).
  const outlineOf = (node) => {
    const box = node.getBBox();
    const size = node instanceof SVGTextElement ? parseFloat(getComputedStyle(node).fontSize) || box.height : box.height;
    const top = box.y + Math.max(0, (box.height - size) / 2);
    const bottom = top + Math.min(box.height, size);
    const matrix = node.getScreenCTM();
    return [[box.x, top], [box.x + box.width, top], [box.x + box.width, bottom], [box.x, bottom]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(matrix));
  };
  const depth = (a, b) => {
    let least = Infinity;
    for (const shape of [a, b]) {
      for (let at = 0; at < shape.length; at++) {
        const from = shape[at];
        const to = shape[(at + 1) % shape.length];
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        if (length === 0) continue;
        const axis = { x: -(to.y - from.y) / length, y: (to.x - from.x) / length };
        const along = (points) => points.map((point) => point.x * axis.x + point.y * axis.y);
        const [one, other] = [along(a), along(b)];
        const reach = Math.min(Math.max(...one), Math.max(...other)) - Math.max(Math.min(...one), Math.min(...other));
        if (reach <= 0) return 0;
        least = Math.min(least, reach);
      }
    }
    return least === Infinity ? 0 : least;
  };
  const textsOf = (svg) => [...svg.querySelectorAll("text")].filter((label) => !label.closest("defs, clipPath, mask, pattern, marker, symbol") && tidy(label.textContent) && shown(label));
  for (const svg of drawings) {
    const labels = textsOf(svg).map((label) => ({ label, outline: outlineOf(label) }));
    const over = [];
    labels.forEach(({ label, outline }, at) => {
      for (const other of labels.slice(at + 1)) {
        if (crowded.has(label) && crowded.get(label) === crowded.get(other.label)) continue; // an axis's crowded labels: its ticks finding
        if (depth(outline, other.outline) > 1.5) over.push(`${quote(label.textContent, 20)} and ${quote(other.label.textContent, 20)} overlap`);
      }
    });
    if (over.length) add("chart-text-overlap", svg, list(over), { picture: cardOf(svg) });
  }

  // A drawing's text its viewBox scales below a readable size (SMALL_TEXT px): an svg with a viewBox
  // is drawn at the width of its box, its units scaled with it (a viewBox 800 wide drawn 340px wide
  // scales 26 units to 11px), so text sized for a wide window shrinks at a narrow one. Each shown
  // text's font size (in the units of the svg it is drawn in) times the vertical scale its
  // transforms give it on the screen (the glyph's height, a stretched drawing's too). One finding a
  // drawing, its small texts listed.
  const SMALL_TEXT = 11;
  for (const svg of drawings) {
    if (!svg.hasAttribute("viewBox")) continue;
    const small = [];
    for (const label of textsOf(svg)) {
      const matrix = label.getScreenCTM();
      const written = parseFloat(getComputedStyle(label).fontSize);
      if (!matrix || !(written > 0)) continue;
      const rendered = written * Math.hypot(matrix.c, matrix.d);
      if (rendered < SMALL_TEXT - 0.05) small.push(`${quote(label.textContent, 24)} at ${rendered.toFixed(1)}px (font-size ${+written.toFixed(2)})`);
    }
    if (!small.length) continue;
    const box = svg.viewBox.baseVal;
    const texts = `${small.length} text${small.length > 1 ? "s" : ""}`;
    add("svg-text-small", svg, `${texts} of a drawing scaled by its viewBox (${+box.width.toFixed(2)}×${+box.height.toFixed(2)} drawn ${round(svg.getBoundingClientRect().width)}px wide) render below ${SMALL_TEXT}px: ${list(small)}`, { picture: cardOf(svg) });
  }

  // Tables: each that scrolls (more than SCROLL_SLACK px past its frame: a table a few pixels wider
  // than its frame scrolls by its rounding) named with its direction; a column out of sight or cut
  // (the words of any of its cells: tableHides, the kit's measure, src/shared/table-hides.mjs) said,
  // and rows below a frame of the kit's height (none written on the frame: its --doc-table-height
  // is the author's, or the reader's drag) said with how to show them all.
  const measuredTables = new Set();
  for (const wrap of root.querySelectorAll(".doc-table-wrap")) {
    if (outsidePage(wrap) || !shown(wrap)) continue;
    measuredTables.add(wrap);
    const table = wrap.querySelector("table");
    if (!table) continue;
    const wide = Math.max(wrap.clientWidth, table.offsetWidth);
    const tall = Math.max(wrap.clientHeight, table.offsetHeight);
    const sideways = wide > wrap.clientWidth + slack;
    const down = tall > wrap.clientHeight + slack;
    const name = tableNameOf(wrap);
    if (sideways || down) {
      add("table-scrolls", wrap, [sideways && `${wide}px wide in a ${wrap.clientWidth}px frame`, down && `${tall}px tall in a ${wrap.clientHeight}px frame`].filter(Boolean).join(", "), { scroll: { sideways, down, name } });
    }
    const hides = globalThis.__qaTableHides(wrap, table);
    if (hides.said) add("table-columns", wrap, `${hides.said}: the table is ${wide}px wide in a ${wrap.clientWidth}px frame`);
    if (hides.shown < hides.rows && !wrap.style.getPropertyValue("--doc-table-height")) {
      add("table-rows", wrap, `the frame shows ${hides.shown} of ${hides.rows} rows: a reader scrolls inside it for the other ${hides.rows - hides.shown}; style="--doc-table-height: none" on its div.doc-table-wrap shows every row (or split the table where its content divides)`);
    }
  }

  // Code blocks and formula blocks whose content scrolls inside their frame (more than SCROLL_SLACK
  // px past it, as a table's): a code block's code taller than its frame (40 lines; its long lines
  // wrap, so a narrow window makes it taller), or wider; a formula wider than its column. Each at its
  // kind's level, but info at every width (pictured on a phone alone: picturedAt) where it scrolls as
  // the author or the reader chose, as a table's frame of their height warns of nothing: a code
  // block's frame of its own height (--doc-code-height on the block or its pre: the author's, or
  // the reader's drag), its lines left unwrapped (doc-code--nowrap: the author's, or the reader's
  // wrap button), and a block in a disclosure closed in the file (a reader who opens it scrolls in
  // it). And a code block's title cut to fit its header (its "…": the kit keeps a title to one line).
  const closedIn = (node) => Boolean(node.closest("details[data-qa-closed]"));
  const IN_CLOSED = "in a disclosure closed in the file: a reader who opens it scrolls";
  for (const code of root.querySelectorAll(".doc-code, .doc-diff")) {
    if (outsidePage(code) || !shown(code)) continue;
    const frame = code.querySelector(":scope > pre, :scope > .doc-diff-body");
    if (frame && shown(frame)) {
      const closed = closedIn(code);
      if (frame.scrollHeight > frame.clientHeight + slack) {
        const own = [code, frame].map((node) => node.style.getPropertyValue("--doc-code-height").trim()).find(Boolean);
        const bottom = frame.getBoundingClientRect().top + frame.clientTop + frame.clientHeight;
        const below = [...frame.querySelectorAll(".doc-code-line")].filter((line) => line.getClientRects().length > 0 && line.getBoundingClientRect().top >= bottom - 1).length;
        const why = closed ? `, ${IN_CLOSED} inside it for the rest`
          : own ? `, the block's own height (--doc-code-height: ${own}, the author's or the reader's): a reader scrolls inside it for the rest` : ": a reader scrolls inside it for the rest";
        add("code-scrolls", code, `the code is ${frame.scrollHeight}px tall, its frame ${frame.clientHeight}px${below ? ` (its last ${below} line${below === 1 ? "" : "s"} below it)` : ""}${why}`, { level: closed || own ? "info" : undefined });
      }
      if (frame.scrollWidth > frame.clientWidth + slack) {
        const unwrapped = code.classList.contains("doc-code--nowrap");
        const why = closed ? `, ${IN_CLOSED} sideways for the rest`
          : unwrapped ? ", its lines left unwrapped (doc-code--nowrap, the author's or the reader's choice): a reader scrolls sideways for the rest of its long lines" : ": a reader scrolls sideways for the rest";
        add("code-scrolls", code, `the code is ${frame.scrollWidth}px wide, its frame ${frame.clientWidth}px${why}`, { level: closed || unwrapped ? "info" : undefined });
      }
    }
    const title = code.querySelector(":scope > .doc-code-title");
    if (title && shown(title) && title.scrollWidth > title.clientWidth + 1) add("code-title-cut", code, `its title ${quote(title.textContent, 48)} is cut to fit its header (${title.scrollWidth}px of words in ${title.clientWidth}px)`);
  }
  for (const block of root.querySelectorAll(".doc-math-block")) {
    if (outsidePage(block) || !shown(block) || block.scrollWidth <= block.clientWidth + slack) continue;
    const closed = closedIn(block);
    add("formula-scrolls", block, `the formula is ${block.scrollWidth}px wide, its frame ${block.clientWidth}px${closed ? `, ${IN_CLOSED} it sideways for the rest` : ": a reader scrolls it sideways for the rest"}`, { level: closed ? "info" : undefined });
  }

  // What the kit says of its own layout (data-doc-layout); on a table measured above, what it
  // says of its columns and rows is what the measuring said (`measured`).
  for (const host of root.querySelectorAll("[data-doc-layout]")) {
    if (outsidePage(host) || !shown(host)) continue;
    add("layout", host, host.getAttribute("data-doc-layout"), { picture: host.closest("figure, .doc-table-wrap") ?? host, measured: measuredTables.has(host) });
  }

  // Formulas: TeX left as written outside code samples (the elements KaTeX leaves alone), and what KaTeX refused.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const raw = new Map();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!/\\\(|\\\[|\$\$/.test(node.nodeValue)) continue;
    const parent = node.parentElement;
    if (!parent || parent.closest([...ignored, ".katex", "[data-doc-dev]"].join(", ")) || !shown(parent)) continue;
    const block = parent.closest("p, li, h1, h2, h3, h4, td, th, figcaption, summary, blockquote, dd, dt") ?? parent;
    if (!raw.has(block)) raw.set(block, node.nodeValue);
  }
  for (const [block, text] of raw) {
    const at = text.search(/\\\(|\\\[|\$\$/);
    add("raw-formula", block, `${quote(text.slice(at, at + 40), 40)} is shown as written: the kit's math did not render it`);
  }
  for (const error of root.querySelectorAll(".katex-error")) {
    if (outsidePage(error) || !shown(error)) continue;
    add("formula-error", error, `${quote(error.textContent, 32)}: ${tidy(error.getAttribute("title")) || "KaTeX could not read it"}`);
  }

  // An address as a finding names it (urlName in Node, which lookAt puts in the page).
  const named = (url) => `"${globalThis.__qaUrlName?.(url, document.baseURI) ?? url}"`;

  // An address as the browser asks for it (a blocked picture's currentSrc stays as written).
  const resolved = (value) => {
    try {
      return new URL(value, document.baseURI).href;
    } catch {
      return value;
    }
  };

  // What the export's policy blocked (in the page's whole life: each look says it again, and its
  // element's number makes it one), with the element that asked for it: its src, href (not a
  // link's, which is followed, not fetched), poster, data, a srcset candidate, a url() of its style
  // or of a <style>; a reference within the page (#…) asks for nothing. Chrome names a file:
  // address it blocked by its scheme alone ("file"): that one is the next address of that scheme
  // asked for, and the finding says that address.
  const addressesOf = (node) => [
    ...["src", "href", "poster", "data"].filter((name) => node.hasAttribute(name) && !(name === "href" && node.matches("a, area"))).map((name) => node.getAttribute(name)),
    ...(node.getAttribute("srcset") ?? "").split(",").map((candidate) => candidate.trim().split(/\s+/)[0]),
    ...[node.getAttribute("style"), node.localName === "style" ? node.textContent : ""].flatMap((css) => [...String(css ?? "").matchAll(/url\(\s*["']?([^"')]+)/g)].map((match) => match[1])),
  ].filter((value) => value && !value.trim().startsWith("#")).map(resolved);
  const asks = [...document.querySelectorAll("*")].filter((node) => !outsidePage(node)).flatMap((node) => addressesOf(node).map((address) => ({ node, address })));
  const answered = new Set();
  for (const { url, directive } of globalThis.__qaViolations ?? []) {
    const scheme = /^[a-z][a-z\d+.-]*$/i.test(url) ? `${url.toLowerCase()}:` : null;
    const ask = asks.find((each) => (scheme ? !answered.has(each) && each.address.startsWith(scheme) : each.address === url));
    if (ask && scheme) answered.add(ask);
    const element = ask?.node ?? null;
    if (scope && !(element && root.contains(element))) continue;
    add("blocked", element, `${directive} blocked ${named(ask?.address ?? url)}${element ? ` (${describe(element)})` : ""}: the export holds every file it shows`, { url: ask?.address ?? url });
  }

  // Pictures that did not load.
  for (const image of root.querySelectorAll("img")) {
    if (outsidePage(image) || (image.complete && image.naturalWidth > 0)) continue;
    const url = image.currentSrc || image.src ? resolved(image.currentSrc || image.src) : "";
    add("image", image, `${url ? named(url) : "a picture with no src"} did not load`, { picture: image.closest("figure") ?? image, url });
  }

  // Words past the side of their own box in a whole block (`whole`: a layout of the Agent's own) or
  // in a figure's drawing (`drawn`: the cards, figure.doc-figure, whose drawing in HTML, or a chart's
  // of the report's own, is the Agent's; not the card's own title, caption and paragraphs, nor the
  // kit's line of a chart that drew nothing), which no check of the kit's measures: a text whose
  // rects (Range.getClientRects) reach more than 1.5px past the content box of the element that lays
  // it out (its nearest that is not inline), with nothing from it up to the block that clips or
  // scrolls (cut words, or words a reader scrolls to, are none of this), as a year that cannot break
  // runs out of its narrow column over the dot or the words beside it; inside the page, where the
  // page-wide check below sees nothing. Sideways only (a tight line height lets glyphs reach above
  // and below their line; downwards, what a box that clips them cuts is cutsOf's, cut-in-block).
  // Three boxes a block at most, the words past each said, pictured as the block.
  const wholeIds = new Set(whole);
  const drawnIds = new Set(drawn);
  const range = document.createRange();

  // Words and marks of a whole block or a figure's drawing cut at the bottom of a box that clips
  // them (overflow hidden or clip downwards), as a box of a fixed or a greatest height cuts content
  // taller than it, or the box around one cuts what runs out of it: the words' rects
  // (Range.getClientRects) and the marks' boxes reaching more than 1.5px past that box's padding
  // edge, a text's line by more than the room its font takes above and below a line set tighter than
  // the font (a glyph's descent is no cut). A mark: a shape of an svg (cut by the svg's edge too) or
  // an element of the page that paints a box and holds nothing (a bar, a dot), whose sides stand
  // within the box (a shape bleeding out of every side on purpose, a background's circle, is none);
  // pictures are cropped as their author chose. What clips it is what stands from it up to the page
  // with nothing between that scrolls (a reader scrolls to the rest: a table's frame, a code block,
  // a formula block, a detail card), skipping, from an element placed absolutely, what stands below
  // its containing block (none of those clips it), and stopping at one placed fixed. None of the
  // kit's own (an element of a doc- class, the block's own box apart, and what a control clips of
  // itself): its folded and collapsed parts and its frames are its own; nor a box folded to nothing
  // (1.5px tall at most: a part of the report's own that opens, a text kept for screen readers).
  // The page's closed disclosures are open here (prepare) and a Sheet's hidden panels show nothing.
  // Three boxes a block at most: Map box -> { words, marks, depth, height }.
  const KIT_CLIPS = "button, select, input, textarea, [data-doc-dev]";
  const kitBox = (node, block) => node !== block && (node.matches(KIT_CLIPS) || [...node.classList].some((name) => name.startsWith("doc-")));
  // The boxes that clip `node`'s content (`own`: a text's element) or its box (a mark), nearest first.
  const clipsAround = (node, block, own) => {
    const clips = [];
    let free = false; // placed absolutely: what stands below its containing block clips nothing of it
    for (let up = node, first = true; up && up !== document.body && up !== document.documentElement; up = up.parentElement, first = false) {
      const style = getComputedStyle(up);
      if (!first || own) {
        if (free && (style.position !== "static" || style.transform !== "none")) free = false; // its containing block
        if (!free) {
          if (/auto|scroll/.test(style.overflowY)) break;
          if (/hidden|clip/.test(style.overflowY) && !kitBox(up, block)) clips.push(up);
        }
      }
      if (style.position === "fixed") break;
      if (style.position === "absolute") free = true;
    }
    return clips;
  };
  const bottomOf = (box) => box.getBoundingClientRect().bottom - (parseFloat(getComputedStyle(box).borderBottomWidth) || 0);
  const painted = (node) => {
    const style = getComputedStyle(node);
    const seen = (color) => !/^(transparent|rgba\(.*,\s*0\))$/.test(color);
    return seen(style.backgroundColor) || style.backgroundImage !== "none"
      || ["Top", "Right", "Bottom", "Left"].some((side) => parseFloat(style[`border${side}Width`]) > 0 && style[`border${side}Style`] !== "none" && seen(style[`border${side}Color`]));
  };
  const SHAPES = "rect, circle, ellipse, line, polyline, polygon, path, use";
  const cutsOf = (block, field) => {
    const cuts = new Map();
    const cut = (box, depth, word, mark) => {
      if (!cuts.has(box) && cuts.size >= 3) return;
      const said = cuts.get(box) ?? { words: [], marks: [], depth: 0, height: box.getBoundingClientRect().height };
      if (word) said.words.push(word);
      if (mark) said.marks.push(mark);
      said.depth = Math.max(said.depth, depth);
      cuts.set(box, said);
    };
    const room = (box) => box.getBoundingClientRect().height > 1.5;
    // Words.
    const texts = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let node = texts.nextNode(); node; node = texts.nextNode()) {
      const parent = node.parentElement;
      if (!node.nodeValue.trim() || !parent || parent.closest("svg, script, style, template, .katex") || !shown(parent) || field(parent)) continue;
      const clips = clipsAround(parent, block, true).filter(room);
      if (clips.length === 0) continue;
      const style = getComputedStyle(parent);
      const line = parseFloat(style.lineHeight);
      for (const match of node.nodeValue.matchAll(/\S+/g)) {
        const end = match.index + match[0].length;
        range.setStart(node, match.index);
        range.setEnd(node, end);
        const rects = [...range.getClientRects()];
        for (const rect of rects) {
          const spare = Number.isFinite(line) ? Math.max(0, (rect.height - line) / 2) : 0;
          const box = clips.find((clip) => rect.bottom - bottomOf(clip) > 1.5 + spare);
          if (!box) continue;
          // A run of no blanks over several lines (Chinese) said from its first character cut.
          let from = match.index;
          if (rects.length > 1) {
            const limit = bottomOf(box) + 1.5 + spare;
            for (let to = end - 1; from < to;) {
              const middle = (from + to) >> 1;
              range.setStart(node, middle);
              range.setEnd(node, middle + 1);
              if ((range.getClientRects()[0]?.bottom ?? 0) > limit) to = middle;
              else from = middle + 1;
            }
          }
          cut(box, Math.max(...rects.map((each) => each.bottom)) - bottomOf(box), node.nodeValue.slice(from, end), null);
          break;
        }
      }
    }
    // Marks.
    for (const node of block.querySelectorAll("*")) {
      const shape = node instanceof SVGElement && node.matches(SHAPES) && !node.closest("defs, clipPath, mask, pattern, marker, symbol");
      const box = !shape && !(node instanceof SVGElement) && !node.matches("img, picture, video, canvas, iframe, object, embed, script, style, template") && node.children.length === 0 && !node.textContent.trim() && painted(node);
      if ((!shape && !box) || !shown(node)) continue;
      const edge = node.getBoundingClientRect();
      if (edge.width <= 0 && edge.height <= 0) continue;
      const svg = shape ? node.ownerSVGElement : null;
      const clips = [...(svg && getComputedStyle(svg).overflowY !== "visible" ? [svg] : []), ...clipsAround(svg ?? node, block, Boolean(svg))].filter(room);
      const within = (clip) => {
        const frame = clip.getBoundingClientRect();
        return edge.left >= frame.left - 1.5 && edge.right <= frame.right + 1.5 && edge.top >= frame.top - 1.5;
      };
      const clip = clips.find((each) => edge.bottom - bottomOf(each) > 1.5 && within(each));
      if (clip) cut(clip, edge.bottom - bottomOf(clip), null, shape ? node.localName : describe(node));
    }
    return cuts;
  };
  for (const block of root.querySelectorAll("[data-block-id]")) {
    const id = block.getAttribute("data-block-id");
    const card = drawnIds.has(id);
    if ((!card && !wholeIds.has(id)) || outsidePage(block) || !shown(block)) continue;
    // A card's own field (its title, caption or a paragraph straight in it), and the kit's line.
    const field = (parent) => parent.closest(".doc-chart-message") || parent.closest("h2, h3, h4, p, figcaption")?.parentElement === block;
    const past = new Map(); // the box -> { words, reach, width }
    const texts = document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    for (let node = texts.nextNode(); node && past.size < 3; node = texts.nextNode()) {
      const parent = node.parentElement;
      if (!node.nodeValue.trim() || !parent || parent.closest("svg, script, style, template, .katex") || !shown(parent) || (card && field(parent))) continue;
      let box = parent;
      while (box !== block && ["inline", "contents"].includes(getComputedStyle(box).display)) box = box.parentElement;
      let clipped = false;
      for (let up = parent; up && !clipped; up = up === block ? null : up.parentElement) {
        const style = getComputedStyle(up);
        clipped = style.overflowX !== "visible" || style.overflowY !== "visible";
      }
      if (clipped) continue;
      const style = getComputedStyle(box);
      const edge = box.getBoundingClientRect();
      const left = edge.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft);
      const right = edge.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight);
      for (const match of node.nodeValue.matchAll(/\S+/g)) {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const rects = [...range.getClientRects()];
        const reach = Math.max(0, ...rects.flatMap((rect) => [rect.right - right, left - rect.left]));
        // Words past the window's edge are the page's overflow, said below.
        if (reach <= 1.5 || rects.some((rect) => rect.right > view + 1)) continue;
        const said = past.get(box) ?? { words: [], reach: 0, width: right - left };
        said.words.push(match[0]);
        said.reach = Math.max(said.reach, reach);
        past.set(box, said);
      }
    }
    for (const [box, { words, reach, width }] of past) {
      add("overflow-in-block", box, `the words ${quote(words.join(" "), 40)} run ${round(reach)}px past the side of ${describe(box)} (${round(width)}px wide for its words), over what is beside it`, { picture: block });
    }
    // Downwards: what the box that clips it cuts at its bottom (cutsOf).
    for (const [box, { words, marks, depth, height }] of cutsOf(block, card ? field : () => false)) {
      const what = [words.length && `the words ${quote(words.join(" "), 40)}`, marks.length && `${marks.length === 1 ? "a mark" : `${marks.length} marks`} (${[...new Set(marks)].slice(0, 3).join(", ")})`].filter(Boolean).join(" and ");
      const one = words.length === 0 && marks.length === 1;
      add("cut-in-block", box, `${what} ${one ? "reaches" : "reach"} ${round(depth)}px past the bottom of ${describe(box)} (${round(height)}px tall, its overflow ${getComputedStyle(box).overflowY}), cut off there`, { picture: block });
    }
  }
  range.detach();

  // The page wider than the window, and what reaches past it outside anything that scrolls or clips:
  // an element, or else words: a text that cannot break (a long path, a URL) runs past the box of
  // its element, which ends inside the window, so no element's box says it; its words' rects do
  // (Range.getClientRects), said in the block they are in (its nearest data-block-id), with the words
  // past the edge, and pictured as that block. In a Sheet's panel too (`scope`), where the page's
  // width alone, unplaced, is said by the look of the page as it opens.
  if (document.documentElement.scrollWidth > view + 1) {
    const free = (node) => {
      for (let up = node.parentElement; up && up !== document.body; up = up.parentElement) if (getComputedStyle(up).overflowX !== "visible") return false;
      return node.nodeType !== 1 || getComputedStyle(node).position !== "fixed";
    };
    const wide = [...root.querySelectorAll("*")].filter((node) => !(node instanceof SVGElement && node.ownerSVGElement) && !outsidePage(node) && node.getBoundingClientRect().right > view + 1 && shown(node) && free(node));
    const outermost = wide.filter((node) => !wide.includes(node.parentElement)).slice(0, 3);
    const says = `the page is ${document.documentElement.scrollWidth}px wide in a ${view}px window`;
    const wideSet = new Set(wide);
    const inWide = (node) => {
      for (let up = node.parentElement; up; up = up.parentElement) if (wideSet.has(up)) return true;
      return false;
    };
    const words = new Map(); // the block (or the element) -> { node, words, right }
    const range = document.createRange();
    const texts = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = texts.nextNode(); node && words.size < 3; node = texts.nextNode()) {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue.trim() || parent.closest("svg, script, style, template") || outsidePage(parent) || inWide(node) || !shown(parent) || !free(node)) continue;
      range.selectNodeContents(node);
      if (![...range.getClientRects()].some((rect) => rect.right > view + 1)) continue;
      const block = parent.closest("[data-block-id]") ?? parent;
      if (words.has(block)) continue;
      // The words past the window's edge (a run of no blanks each), as many as the rects say.
      const past = [];
      let right = 0;
      for (const match of node.nodeValue.matchAll(/\S+/g)) {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + match[0].length);
        const reach = Math.max(...[...range.getClientRects()].map((rect) => rect.right), 0);
        if (reach <= view + 1) continue;
        past.push(match[0]);
        right = Math.max(right, reach);
      }
      if (past.length) words.set(block, { node: parent, words: past.join(" "), right });
    }
    range.detach();
    if (outermost.length === 0 && words.size === 0 && !scope) add("overflow", null, says);
    for (const node of outermost) add("overflow", node, `${says}: ${describe(node)} ${quote(node.textContent, 24)} reaches ${round(node.getBoundingClientRect().right)}px`);
    for (const [block, { node, words: past, right }] of words) {
      add("overflow", node, `${says}: the words ${quote(past, 60)} in ${describe(block)} run past its edge to ${round(right)}px (a text that cannot break)`, { picture: block });
    }
  }
  return { found, next };
}

// What the page has, to say in the summary (its detail cards are counted as they are opened). In the
// page. A chart is a declared one; a database (多维表格) is counted apart from the tables, its own block.
export function inventory() {
  const dev = (node) => Boolean(node.closest("[data-doc-dev]"));
  const count = (selector) => [...document.querySelectorAll(selector)].filter((node) => !dev(node)).length;
  return { charts: count("[data-doc-chart]"), tables: count(".doc-table-wrap"), databases: count(".doc-database"), height: document.documentElement.scrollHeight };
}

// ---------- the browser ----------

const TIMEOUT = 20_000; // each wait for the page
const TILE = 1800;

// A promise that rejects after `ms` (a picture or a page that never answers is said, not waited for).
function limited(promise, ms, what) {
  let timer = 0;
  const late = new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${what}: no answer in ${ms / 1000}s`)), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** What makes two looks' findings one: its kind, its element's anchor and its words. */
export const findingKey = (finding) => `${finding.kind}|${JSON.stringify(finding.anchor)}|${finding.what}`;

/**
 * What gallery qa sees of the export `file` with `browser` (puppeteer's) in a window `look` ({ width,
 * height: 900 unless said, label: how it is named, "1024" or "1024×768" }; a width alone is one):
 * { findings, counts, pictures, held: { covered, missed } }. A finding is { kind, what, anchor, shot,
 * seen, url, scroll, state }; an element's finding that two looks make (a picture in a Sheet, checked
 * shown or not) is one, said in the state where it shows; one `known` has (findingKey: what another
 * look found already) is left out. Each picture is framed by what its element draws (inkOf, INK_MARGIN
 * px around it), not cut at its box. Its pictures go to the folders of `out` ({ flagged, blocks,
 * tiles, folders: id -> the folder of that block's pictures, else blocks }): of what it flags that
 * shows (picturedAt: fail and warn, and the kinds of PICTURED_INFO), into flagged as
 * `<label>-<shot>-<kind>.png`; each of `blocks` (block ids) into its folder as `<label>-<id>.png`
 * where it first shows (on the page, in a Sheet's panel, or in a detail card opened), { block, file },
 * a block `around` names (id -> [the block before it, the block after it], a moved block's) with the
 * edges of those of them that show (movedClips: a tall one as its top and its bottom,
 * `<label>-<id>-top.png` and `-bottom.png`); a block `held` names (id -> the blocks it holds that its
 * picture shows, blocksToPicture's) pictured again with each Sheet panel shown in turn, or each detail
 * card opened, that holds one of them its pictures did not show yet: its Sheet area as
 * `<label>-<id>-sheet<i>.png`, the card as `<label>-<id>-card<i>.png` ({ block, part, file }), and of
 * the blocks held, those a picture showed (`covered`) and those that showed in none (`missed`: the
 * middle of a tall block moved, pictured at its two joins); `tiles` the page as it opens in tiles, into
 * tiles as `<width>-<n>.png`, each Sheet panel shown in turn in tiles of its own,
 * `<width>-sheet<i>-<n>.png` ({ tile, sheet: { number: i, label } }), and each detail card opened, as
 * the window shows it, its content scrolled a tile at a time, `<width>-card<i>-<n>.png`, and again with
 * each other panel of a Sheet in it shown, `<width>-card<i>-sheet<j>-<n>.png` ({ tile, card: { number: i,
 * label, part: "" or "sheet<j>-" } }). The Sheets in a detail card are looked at while it is open,
 * those of the page before the cards. `whole`: the ids of the whole blocks, `drawn` those of the figure
 * cards, whose words measure() reads.
 */
export async function lookAt(browser, file, look, { out, tiles = false, blocks = [], around = new Map(), held = new Map(), whole = [], drawn = [], known = null }) {
  const { width, height = 900, label = String(width) } = typeof look === "number" ? { width: look } : look;
  const named = label.replace("×", "x"); // in a file's name
  // A reader's first visit: no reading state kept. A browser that does not open a tab is waited for TIMEOUT ms, not for ever.
  let context;
  let page;
  try {
    context = await limited(browser.createBrowserContext(), TIMEOUT, "a browser context opened");
    page = await limited(context.newPage(), TIMEOUT, "a tab opened");
  } catch (error) {
    await closed(context?.close());
    return { findings: [{ kind: "unverified", what: `the browser did not open a page: ${error.message}`, anchor: null, shot: null, seen: false, state: "" }], counts: null, pictures: [], held: { covered: [], missed: [] } };
  }
  page.setDefaultTimeout(TIMEOUT);
  const findings = [];
  const pictures = [];
  const taken = new Set();
  const ofElements = new Map(); // kind|shot|what -> an element's finding, for the looks after
  const pictured = new Set(); // the blocks pictured
  const covered = new Set(); // the blocks held that a picture of their holder showed
  const missed = new Set(); // the blocks held that showed and are in no picture yet
  let state = "";
  let next = 0;
  const say = (kind, what, extra = {}) => findings.push({ kind, what, anchor: null, shot: null, seen: false, state, ...extra });
  const address = pathToFileURL(file).href;
  const name = (url) => `"${urlName(url, address)}"`;
  const folderOf = (id) => out.folders?.get(id) ?? out.blocks;
  const safe = (id) => id.replace(/[^\w-]/g, "_");
  // The page's own errors and requests (an embed block's page, online in its frame, is not the
  // report's); what the policy blocked is said with the element that asked for it, below.
  page.on("pageerror", (error) => say("error", `uncaught ${tidy(error.message).slice(0, 200)}`));
  page.on("console", (message) => {
    if (message.type() === "error" && ownMessage(message, address)) say("error", `console: ${tidy(message.text()).slice(0, 200)}`);
  });
  page.on("requestfailed", (request) => {
    if (request.frame() === page.mainFrame()) say("request", `${name(request.url())}: ${request.failure()?.errorText ?? "failed"}`, { url: request.url() });
  });
  page.on("response", (response) => {
    if (response.status() >= 400 && response.request().frame() === page.mainFrame()) say("request", `${name(response.url())}: HTTP ${response.status()}`, { url: response.url() });
  });
  await keepViolations(page);
  await page.evaluateOnNewDocument(`globalThis.__qaUrlName = ${urlName}; globalThis.__qaTableHides = ${tableHidesScript()};`);
  await page.setViewport({ width, height });
  // In the light theme, whatever the system's (the same pictures from one machine to the next); motion as it is.
  await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: "light" }]);
  const settled = async (what) => {
    for (const late of await settle(page, { timeout: TIMEOUT })) say("unverified", `${what}: waited for ${late}`);
  };
  // A picture of `clip` (the page's pixels) into `target`, as the window shows it when `fixed`. Whether
  // it was taken; one not taken is said (unverified).
  const capture = async (clip, fixed, target, what) => limited(page.screenshot({ path: target, clip, captureBeyondViewport: !fixed }), TIMEOUT, "the picture").then(() => true, (error) => {
    say("unverified", `no picture of ${what} (${error.message})`);
    return false;
  });
  // A picture of what the element `selector` finds (or the element `up` above it) draws (inkOf), into
  // `target`: the clip it was taken of, or null; one not taken is said (unverified).
  const shoot = async (selector, target, what, up = 0) => {
    const ink = await page.evaluate(inkOf, { selector, up, margin: INK_MARGIN, frames: SCROLL_FRAMES }).catch((error) => ({ error }));
    if (!ink?.clip) {
      say("unverified", `no picture of ${what} (${ink?.error?.message ?? "the element is gone or shows nothing"})`);
      return null;
    }
    return (await capture(ink.clip, ink.fixed, target, what)) ? ink.clip : null;
  };
  const meets = (box, clip) => box.left < clip.x + clip.width && box.right > clip.x && box.top < clip.y + clip.height && box.bottom > clip.y;
  // A picture of each of the blocks asked for that shows now (its first element) and has none yet;
  // of one with blocks around it (a moved block's neighbours), the parts of the page movedClips says,
  // from the boxes of the block and of those of them that show (the page's pixels). Of the blocks it
  // holds (`held`), those that show now are covered when a picture of it holds their box, else missed.
  const pictureBlocks = async () => {
    const waiting = blocks.filter((id) => !pictured.has(id));
    const showing = await page.evaluate((ids, neighbours, holds) => {
      const at = new Map(ids.map((id, index) => [id, index]));
      const visible = (node) => Boolean(node) && !node.closest("[data-doc-dev], dialog:not([open])") && node.getClientRects().length > 0;
      const first = (id) => (id === null ? null : [...document.querySelectorAll("[data-block-id]")].find((node) => node.getAttribute("data-block-id") === id && visible(node)) ?? null);
      const boxOf = (node) => {
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { left: box.left + scrollX, right: box.right + scrollX, top: box.top + scrollY, bottom: box.bottom + scrollY };
      };
      const found = [];
      for (const node of document.querySelectorAll("[data-block-id]")) {
        const index = at.get(node.getAttribute("data-block-id"));
        if (index === undefined || !visible(node)) continue;
        at.delete(node.getAttribute("data-block-id"));
        node.setAttribute("data-qa-block", String(index));
        const [above, below] = neighbours[index] ?? [];
        const inside = (holds[index] ?? []).map((id) => [id, [...node.querySelectorAll("[data-block-id]")].find((child) => child.getAttribute("data-block-id") === id && visible(child))]).filter(([, child]) => child);
        found.push({ index, boxes: neighbours[index] ? { block: boxOf(node), above: boxOf(first(above)), below: boxOf(first(below)) } : null, held: inside.map(([id, child]) => ({ id, box: boxOf(child) })) });
      }
      return found;
    }, waiting, waiting.map((id) => around.get(id) ?? null), waiting.map((id) => held.get(id) ?? []));
    for (const { index, boxes, held: inside } of showing) {
      const id = waiting[index];
      pictured.add(id);
      const file = `${named}-${safe(id)}`;
      const clips = [];
      if (!boxes) {
        const target = path.join(folderOf(id), `${file}.png`);
        const clip = await shoot(`[data-qa-block="${index}"]`, target, `the block ${id}`);
        if (clip) {
          pictures.push({ block: id, file: target });
          clips.push(clip);
        }
      }
      for (const { part, clip } of boxes ? movedClips(boxes) : []) {
        const target = path.join(folderOf(id), `${file}${part ? `-${part}` : ""}.png`);
        if (await capture(clip, false, target, `the block ${id}${part ? ` (its ${part})` : ""}`)) {
          pictures.push({ block: id, file: target });
          clips.push(clip);
        }
      }
      for (const { id: child, box } of inside) {
        if (clips.some((clip) => meets(box, clip))) covered.add(child);
        else if (!covered.has(child)) missed.add(child);
      }
      await page.evaluate((at) => document.querySelector(`[data-qa-block="${at}"]`)?.removeAttribute("data-qa-block"), index);
    }
  };
  // With a Sheet panel or a detail card shown (`scope`, its selector), each block pictured that holds
  // blocks in it its pictures did not show yet, pictured again as it shows now: the Sheet area of the
  // panel (`up` 1) or the card, `<label>-<id>-<part>.png` (part: sheet<i>, card<i>).
  const pictureHeld = async (scope, part, up) => {
    const waiting = [...held].filter(([id]) => pictured.has(id)).map(([id, ids]) => [id, ids.filter((child) => !covered.has(child))]).filter(([, ids]) => ids.length);
    if (!waiting.length) return;
    const showing = await page.evaluate((selector, list) => {
      const root = document.querySelector(selector);
      if (!root) return [];
      const shows = (id) => [...root.querySelectorAll("[data-block-id]")].some((node) => node.getAttribute("data-block-id") === id && node.getClientRects().length > 0);
      return list.map(([id, ids]) => [id, ids.filter(shows)]).filter(([, ids]) => ids.length);
    }, scope, waiting);
    for (const [id, ids] of showing) {
      const target = path.join(folderOf(id), `${named}-${safe(id)}-${part}.png`);
      if (!(await shoot(scope, target, `the block ${id} (${part})`, up))) continue;
      pictures.push({ block: id, part, file: target });
      for (const child of ids) {
        covered.add(child);
        missed.delete(child);
      }
    }
  };
  const lookHere = async (scope) => {
    const result = await page.evaluate(measure, { scope, next, ignored: MATH_IGNORED_TAGS, slack: SCROLL_SLACK, whole, drawn });
    next = result.next;
    // The kit's notes, a finding each, at their level here; on a table measured, what the measuring
    // (the kit's own measure) said of its columns and rows stands for them.
    const own = result.found.flatMap((finding) => (finding.kind !== "layout" ? [finding] : layoutNotesOf(finding.what, width)
      .filter(({ kind }) => !(finding.measured && ["table-columns", "table-rows"].includes(kind)))
      .map(({ kind, note }) => ({ ...finding, kind, what: `the kit notes ${note}` }))));
    for (const finding of own) {
      const key = finding.shot === null ? null : `${finding.kind}|${finding.shot}|${finding.what}`;
      const before = key && ofElements.get(key);
      if (!before) {
        const entry = { ...finding, state };
        findings.push(entry);
        if (key) ofElements.set(key, entry);
      } else if (!before.seen && finding.seen) Object.assign(before, finding, { state }); // found before where it did not show
    }
    // A picture of each flagged element that shows, once, as it is shown now (not of what another
    // look found, nor of what a blocked file made fail besides: below).
    const blocked = new Set(findings.filter((finding) => finding.kind === "blocked").map((finding) => finding.url));
    for (const finding of findings) {
      if (finding.shot === null || !finding.seen || taken.has(finding.shot) || !picturedAt(finding, width)) continue;
      if (known?.has(findingKey(finding)) || (["request", "image"].includes(finding.kind) && blocked.has(finding.url))) continue;
      taken.add(finding.shot);
      const target = path.join(out.flagged, `${named}-${String(finding.shot).padStart(2, "0")}-${finding.kind}.png`);
      if (await shoot(`[data-qa-shot="${finding.shot}"]`, target, finding.kind)) pictures.push({ shot: finding.shot, file: target });
    }
    if (blocks.length) await pictureBlocks();
  };
  // What a blocked file made fail besides (its request, its picture) is that block, said once; what
  // another look found already is left out.
  const result = (counts) => {
    const blocked = new Set(findings.filter((finding) => finding.kind === "blocked").map((finding) => finding.url));
    const own = findings.filter((finding) => !(["request", "image"].includes(finding.kind) && blocked.has(finding.url)) && !known?.has(findingKey(finding)));
    return { findings: own, counts, pictures, held: { covered: [...covered], missed: [...missed] } };
  };

  try {
    // Looked at once its own document is read (its DOMContentLoaded; the browser's own wait would
    // wait for the frames too): an embed block's frame, online, may load late or never, and is no
    // part of the report. What the page draws is waited for below.
    try {
      const read = new Promise((resolve) => page.once("domcontentloaded", resolve));
      const going = page.goto(address, { waitUntil: "load", timeout: 60_000 });
      going.catch(() => {});
      await Promise.race([read, going]);
      if (page.url() !== address) throw new Error(`the browser shows ${page.url()}`);
    } catch (error) {
      say("unverified", `the page did not load: ${error.message}`);
      return result(null);
    }
    await settled("the page as it opens");
    const prepared = await page.evaluate(prepare, TIMEOUT);
    if (!prepared.loaded) say("unverified", `the pictures (${prepared.images}) not all loaded in ${TIMEOUT / 1000}s`);
    if (prepared.closed) await settled(`the page with its ${prepared.closed} closed disclosure${prepared.closed === 1 ? "" : "s"} opened`);
    await lookHere(null);
    // The page in tiles TILE px tall from `top` to `bottom` (the page's pixels), as wide as the
    // window, named `<label>-<part><n>.png` (part: "" for the page, "sheet<i>-" for a panel).
    const tileArea = async (top, bottom, part, sheet = null) => {
      for (let at = top, n = 1; at < bottom; at += TILE, n++) {
        const target = path.join(out.tiles, `${named}-${part}${String(n).padStart(2, "0")}.png`);
        await limited(page.screenshot({ path: target, clip: { x: 0, y: at, width, height: Math.min(TILE, bottom - at) }, captureBeyondViewport: true }), TIMEOUT, "a tile")
          .then(() => pictures.push({ tile: true, sheet, file: target }), (error) => say("unverified", `no tile ${part}${n} (${error.message})`));
      }
    };
    // The page as it opens: each Sheet area with the panel it shows first.
    if (tiles) await tileArea(0, await page.evaluate(() => document.documentElement.scrollHeight), "");
    // A Sheet shown (the tabs of its chain clicked) and looked at, the blocks pictured that hold
    // blocks in its panel pictured again with it; with --tiles, its panel in tiles of its own
    // (`<label>-sheet<i>-<n>.png`, i its tab's number in the page, from 1), or, in a detail card
    // (`card`), the card again (`<label>-card<j>-sheet<i>-<n>.png`). Whether it showed; one that
    // stays hidden is said at its tab.
    const lookAtSheet = async (sheet, card = null) => {
      if (!(await page.evaluate(showSheet, sheet.chain))) {
        const { anchor } = await page.evaluate(measure, { next, place: `[data-qa-tab="${sheet.index}"]` });
        say("unverified", "this Sheet could not be shown: its tab was clicked and its panel stayed hidden", { anchor });
        return false;
      }
      await settled("the Sheet shown");
      await lookHere(`[data-qa-panel="${sheet.index}"]`);
      await pictureHeld(`[data-qa-panel="${sheet.index}"]`, `sheet${sheet.index + 1}`, 1);
      if (tiles && card) await tileCard(card, `sheet${sheet.index + 1}-`);
      else if (tiles) {
        const box = await page.evaluate((at) => {
          const rect = document.querySelector(`[data-qa-panel="${at}"]`)?.getBoundingClientRect();
          return rect && rect.height > 0 ? { top: Math.max(0, rect.top + scrollY), bottom: rect.bottom + scrollY } : null;
        }, sheet.index);
        if (box) await tileArea(box.top, box.bottom, `sheet${sheet.index + 1}-`, { number: sheet.index + 1, label: sheet.label });
      }
      return true;
    };
    // A detail card opened, as the window shows it, its content scrolled a tile at a time
    // (`<label>-card<i>-<part><n>.png`).
    const tileCard = async (card, part = "") => {
      for (let n = 1; n <= 20; n++) {
        const clip = await page.evaluate((at, first) => {
          const dialog = document.querySelector(`[data-qa-card="${at}"]`);
          const content = dialog?.querySelector(".doc-dialog-content") ?? dialog;
          if (!content) return null;
          if (first) content.scrollTop = 0;
          else {
            const before = content.scrollTop;
            content.scrollTop += Math.max(40, content.clientHeight - 24);
            if (content.scrollTop === before) return null;
          }
          const box = dialog.getBoundingClientRect();
          return { x: box.left + visualViewport.pageLeft, y: box.top + visualViewport.pageTop, width: box.width, height: box.height };
        }, card.index, n === 1);
        if (!clip) break;
        const target = path.join(out.tiles, `${named}-card${card.index + 1}-${part}${String(n).padStart(2, "0")}.png`);
        if (await capture(clip, true, target, `the detail card ${quote(card.label, 24)}, tile ${part}${n}`)) pictures.push({ tile: true, card: { number: card.index + 1, label: card.label, part }, file: target });
      }
    };
    // Each Sheet not shown at first and in no detail card, shown in turn (the Sheets it is in first)
    // and looked at.
    let sheetsShown = 0;
    for (const sheet of prepared.sheets) {
      if (sheet.shown || !sheet.panel || sheet.card !== null) continue;
      state = `Sheet ${quote(sheet.label, 24)}`;
      if (await lookAtSheet(sheet)) sheetsShown += 1;
    }
    // Each detail card opened in turn as a reader's click opens it (the Sheet panel it is in shown
    // and the cards it is in opened first), looked at, the blocks in it pictured (and those pictured
    // that hold blocks in it, again with it), with --tiles pictured as the window shows it; then each
    // of its Sheets' other panels shown in turn and looked at as the page's are; then closed, with
    // the cards opened for it. One that does not open is said at its place.
    let cardsOpened = 0;
    for (const card of prepared.cards) {
      state = `detail card ${quote(card.label, 24)}`;
      const scope = `[data-qa-card="${card.index}"]`;
      if (card.chain.length) await page.evaluate(showSheet, card.chain);
      for (const outer of card.within) await page.evaluate(openCard, outer);
      if (!(await page.evaluate(openCard, card.index))) {
        const { anchor } = await page.evaluate(measure, { next, place: scope });
        say("unverified", "this detail card could not be opened", { anchor });
        for (const outer of card.within.toReversed()) await page.evaluate(closeCard, outer);
        continue;
      }
      cardsOpened += 1;
      await settled("the detail card opened");
      await lookHere(scope);
      await pictureHeld(scope, `card${card.index + 1}`, 0);
      if (tiles) await tileCard(card);
      for (const sheet of prepared.sheets) {
        if (sheet.card !== card.index || sheet.shown || !sheet.panel) continue;
        state = `detail card ${quote(card.label, 24)}, Sheet ${quote(sheet.label, 24)}`;
        if (await lookAtSheet(sheet, card)) sheetsShown += 1;
      }
      await page.evaluate(closeCard, card.index);
      for (const outer of card.within.toReversed()) await page.evaluate(closeCard, outer);
    }
    state = "";
    return result({ ...(await page.evaluate(inventory)), details: prepared.details, closed: prepared.closed, sheets: sheetsShown, cards: prepared.cards.length, cardsOpened });
  } catch (error) {
    say("unverified", `the look ended early: ${error.message}`);
    return result(null);
  } finally {
    await closed(context.close());
  }
}

// ---------- what is printed ----------

const slashed = (file) => file.split(path.sep).join("/");
const plural = (count, word, words = `${word}s`) => `${count} ${count === 1 ? word : words}`;
// The looks a finding was seen in, as a line says them: "1024, 1024×768, 736px".
const looksSaid = (labels) => `${labels.join(", ")}px`;
// A look as the counts and the last line name it: "1024px", "1024×768".
const lookSaid = (label) => (label.includes("×") ? label : `${label}px`);
// A look's disclosures as its line says them: how many, and that those closed in the file were
// opened for the pictures ("2 disclosures (closed in the file, opened for the pictures)").
export function disclosuresSaid({ details, closed }) {
  if (details === 0) return "0 disclosures";
  const said = closed === 0 ? "open in the file" : `${closed === details ? "" : `${closed} `}closed in the file, opened for the pictures`;
  return `${plural(details, "disclosure")} (${said})`;
}

/**
 * Pictures (`files`, absolute paths) as a line names them: from `folder` (qa/<slug>, whose absolute
 * path a line of their own says) when they are in it, else whole, with "/" between the parts; those
 * that differ by their look alone (the label a file's name starts with: 1024, 1024x768, 736, 360) as
 * one name, their looks in braces, in the order taken: "changed/{1024,736,360}-qtrl7h36.png". Each name
 * once, in the order of its first picture.
 */
export function picturesSaid(files, folder = null) {
  const groups = new Map(); // a name with its look taken out -> { head, tail, looks }
  for (const file of files) {
    const relative = folder ? path.relative(folder, file) : "";
    const name = slashed(folder && relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : file);
    const match = /^(.*\/)?(\d+(?:x\d+)?)-([^/]+)$/.exec(name);
    const key = match ? `${match[1] ?? ""}\u0000${match[3]}` : name;
    if (!groups.has(key)) groups.set(key, match ? { head: match[1] ?? "", tail: match[3], looks: [] } : { whole: name });
    const group = groups.get(key);
    if (match && !group.looks.includes(match[2])) group.looks.push(match[2]);
  }
  return [...groups.values()].map((group) => group.whole ?? `${group.head}${group.looks.length > 1 ? `{${group.looks.join(",")}}` : group.looks[0]}-${group.tail}`);
}

/**
 * The pictures of a check or a trial (`runs`: [{ folder, files }]), in one line before the verdict: a 提示, how
 * many and where, `first` named as the ones that show it whole (a block's two overviews, a page at 1280 in the
 * light theme); nothing asks for them to be opened, any may be (the user's 2026-11-13: what the commands can show
 * stays, what the workflow asks of the Agent is kept to what it needs; ten pictures a run of gallery block check and
 * six full pages of gallery page check had been asked for, again after each fix). null for none.
 */
export function unopenedSaid(runs, { first = [] } = {}) {
  const taken = runs.map(({ folder, files }) => ({ folder, files: [...new Set(files)] })).filter(({ files }) => files.length);
  if (!taken.length) return null;
  const whole = (files, folder) => picturesSaid(files, folder).map((name) => (path.isAbsolute(name) ? name : `${slashed(folder)}/${name}`));
  const shows = taken.flatMap(({ folder, files }) => whole(files.filter((file) => first.includes(file)), folder));
  const count = taken.reduce((sum, { files }) => sum + files.length, 0);
  const where = [...new Set(taken.map(({ folder }) => `${slashed(folder)}/`))].join(", ");
  return `提示：${plural(count, "picture")} in ${where}${shows.length ? ` (the whole of it: ${shows.join(", ")})` : ""}: none needs opening; open one when you want to see it`;
}

/** How many runs of a document gallery qa keeps the pictures of (qa/<slug>/<time>/): the newest; each earlier one is taken away when a run ends. */
export const RUNS_KEPT = 5;
// A run's folder name: its time, as the clock on the wall reads it (2026-11-11_14-02-33), a number after it when another run of the same second came first.
const RUN_FOLDER = /^\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d(?:-\d+)?$/;
// What gallery qa kept in qa/<slug>/ before every run had a folder: taken away when a run starts (a run's pictures are in its own folder now).
const OLD_FOLDERS = ["flagged", "changed", "cards", "blocks", "tiles"];

/** The folder name of a run started at `date` (local time, to the second); `taken`: the names there are already. */
export function runName(date = new Date(), taken = []) {
  const two = (number) => String(number).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}_${two(date.getHours())}-${two(date.getMinutes())}-${two(date.getSeconds())}`;
  let name = stamp;
  for (let again = 2; taken.includes(name); again++) name = `${stamp}-${again}`;
  return name;
}

/** A new folder for a run in `out` (qa/<slug>/): { name, directory }; what an earlier Gallery kept there loose is taken away first. */
export async function startRun(out, date = new Date()) {
  await fs.mkdir(out, { recursive: true });
  for (const name of OLD_FOLDERS) await fs.rm(path.join(out, name), { recursive: true, force: true });
  for (const name of await fs.readdir(out)) if (name.endsWith(".png")) await fs.rm(path.join(out, name), { force: true });
  for (;;) {
    const name = runName(date, await fs.readdir(out));
    try {
      await fs.mkdir(path.join(out, name));
      return { name, directory: path.join(out, name) };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
    }
  }
}

/**
 * A run's folder once it is over: the folders in it that took no picture taken away, the run's own too
 * when it took none (so that a run with nothing to picture displaces no earlier one); then every run of
 * `out` but the newest `keep` taken away. Resolves to the names removed.
 */
export async function endRun(out, directory, keep = RUNS_KEPT) {
  for (const name of await fs.readdir(directory).catch(() => [])) await fs.rmdir(path.join(directory, name)).catch(() => {}); // only an empty one goes
  await fs.rmdir(directory).catch(() => {});
  const runs = (await fs.readdir(out).catch(() => [])).filter((name) => RUN_FOLDER.test(name)).sort().reverse();
  const old = runs.slice(keep);
  for (const name of old) await fs.rm(path.join(out, name), { recursive: true, force: true });
  return old;
}

/**
 * The list gallery qa ends with, before its verdict (`reports`: describeLooks's `pictures` of each document
 * looked at, { slug, folder, sections: [{ title, items: [{ count, names, text }] }], unneeded: [what needs
 * no look], kept: the pictures kept and not listed }): "要看的图（N 张）", the pictures to open in the order to
 * open them, in sections (the places a FAIL or a WARN names, one picture each; the blocks a run was asked to
 * picture; the tiles), numbered, each by its whole path and what it is; "要看的图（0 张）" when nothing needs a
 * look; then "不用看：" with what needs none (a plain run's pictures of the blocks changed and the cards among
 * it); then where the pictures are and how long. [] when the run took no picture and has nothing to say of any.
 */
export function checklistSaid(reports, { all = false } = {}) {
  const documents = reports.filter(Boolean);
  const total = documents.reduce((sum, { sections }) => sum + sections.reduce((own, { items }) => own + items.reduce((count, each) => count + each.count, 0), 0), 0);
  const many = documents.length > 1;
  const unneeded = documents.flatMap(({ slug, unneeded: each }) => each.map((words) => (many ? `${slug}: ${words}` : words)));
  if (!total && !unneeded.length) return [];
  const kept = documents.reduce((sum, { kept: own = 0 }) => sum + own, 0);
  const lines = [all ? `这次拍的图（${total} 张）：按需要打开，不用全看` : `要看的图（${total} 张）：${total ? "标出问题的地方各一张，文字说不清时再打开" : "没有要看的图"}`];
  let number = 0;
  for (const { slug, folder, sections } of documents) {
    for (const { title, items } of sections) {
      lines.push(`  ${many ? `${slug}: ` : ""}${title}:`);
      for (const { names, text: words } of items) lines.push(`    ${++number}. ${names.map((name) => (path.isAbsolute(name) || !folder ? name : `${slashed(folder)}/${name}`)).join(", ")}  ${words}`);
    }
  }
  lines.push(`不用看：${unneeded.length ? `${unneeded.join("；")}。` : "其余的都没有问题。"}`);
  if (total || kept) for (const { slug, folder } of documents) if (folder) lines.push(`图在 ${slashed(folder)}/（每次运行一个新文件夹，qa/${slug}/ 下只留最近 ${RUNS_KEPT} 次，更早的已删）`);
  return lines;
}

// What the last line says before the deliverable's absolute path: gallery export's label (src/cli/deliverable.mjs).
export const HAND_OVER = DELIVERABLE_LINE;
// What to do when nothing could be looked at (UNVERIFIED): SKILL.md's own look, said in the line.
export const LOOK_YOURSELF = "say in the handoff that the document's layout was not checked (take no pictures of your own unless the user asks).";
/** Why the browser did not start (startBrowser's error), without puppeteer's advice on a profile in use: an Agent cannot act on it. */
export const startFailure = (error) => tidy(error?.message).replace(/\s*Use a different `?userDataDir`? or stop the running browser first\.?/gi, "").slice(0, 300);
// What a finding of a kind asks of the author, said once under its lines, whatever its level: what
// to do when it matters to the reader, and, for one that fails nothing, that it fails nothing, so
// that no column, label or category is deleted to make it go away. Every kind that warns has one but
// table-rows, whose own words say how to show every row.
export const ADVICE = {
  overflow: "a reader scrolls the whole page sideways. Words that cannot break where they stand (a long path, URL or name): wrap each in <code>, which breaks where it must and keeps it whole for the reader to copy; an element wider than the window (a picture, a drawing, a width of your own): let it fit (max-width: 100%) or put it in a frame that scrolls; never cut or rewrite a path to silence this",
  "table-columns": "not a failure. If the reader must see the column on a desktop, write its long values compactly (a cell of numbers stays on one line, so its longest value sets the column's width: a range as a–b, fewer digits), move a unit out of its header into the line above the table, shorten the header, or split the table; never delete a column to silence this",
  "chart-text-overlap": "not a failure. If the reader must read both, shorten the labels (a unit belongs in the axis's title), move one (above its row, or a leader line) or give the drawing more room at this width; never delete a label or a category to silence this",
  "code-scrolls": "not a failure. A reader scrolls inside the frame (40 lines) for the rest; if every line must show at once, write style=\"--doc-code-height: none\" on its <pre>; never delete code to silence this",
  "formula-scrolls": "not a failure. A reader scrolls the formula sideways for the rest; if it must show whole at this width, break it into lines (\\begin{aligned} … \\end{aligned}) or into two formulas; never cut a term to silence this",
  "overflow-in-block": "not a failure. If the words run over others in the picture, give their box room at this width (a wider column in an @media rule of your <style>, or a smaller font there), or let them break (a dash or a space where a line may end); never cut the words to silence this",
  "cut-in-block": "not a failure. If the reader must see what is cut, let the box grow with what it holds (min-height instead of height or max-height, or none), give it room at this width in an @media rule of your <style>, or let it scroll (overflow: auto); never delete the words to silence this",
  ticks: "not a failure. If the numbers crowd in the picture, give that axis fewer ticks at this width with axis.tickValues([...]), at most four on a phone (the domain's ends and middle; ticks(n) is only a hint to d3 and can still draw five or more), or shorter numbers (the unit in the axis's title: 2k, 1.5万); never take the axis out to silence this",
  "svg-text-small": "not a failure. The viewBox scales the drawing's text with it: give the text a larger font-size in the viewBox's units (a viewBox 800 wide drawn 340px wide scales by 0.43, so 26 units read as 11px), or lay the drawing out for narrow widths (a viewBox of its own under an @media rule, a chart of your own drawn from its width, or HTML that wraps); never drop the labels to silence this",
};
// What a code block that scrolls sideways asks (its finding says "px wide"), said instead of
// ADVICE["code-scrolls"], which is of its height, or after it when the block scrolls both ways
// (testing the skill with Agents, 2026-10-28: a directory tree kept whole was told of heights).
export const CODE_SIDEWAYS = "not a failure. A reader scrolls sideways for the rest of its long lines; if the reader must see them whole at this width, let them wrap (take data-wrap=\"false\" off its <pre>) or break them where the code allows; a tree or a log whose lines must stay whole may scroll; never cut a line to silence this";
/** What to do, said once under a group of findings of one kind at one place ({ kind, said: words -> … }): its lines, none for a kind without advice. */
export function adviceOf(group) {
  if (group.kind !== "code-scrolls") return ADVICE[group.kind] ? [ADVICE[group.kind]] : [];
  const words = [...group.said.keys()];
  const sideways = words.some((said) => / wide, its frame /.test(said));
  return [...(!sideways || words.some((said) => / tall, its frame /.test(said)) ? [ADVICE["code-scrolls"]] : []), ...(sideways ? [CODE_SIDEWAYS] : [])];
}
// The last line when nothing failed and something warned.
export const WARNED = "none is a failure: each says what to do if it matters to the reader (never delete a column or a label to silence one)";
// What a line of a table that scrolls says of it: information, not a finding to fix.
export const SCROLLS = "a reader scrolls it: not a problem";

/**
 * The text gallery qa prints of one document's looks (`looks`: [{ width, label, laptop, findings,
 * counts, pictures }]; a look without a label is named by its width), `index`: its sourceIndex,
 * `blocks`: the blocks it pictured (blocksToPicture's, with tags: id -> what the block is; or
 * null), `folder`: qa/<slug>, which the pictures are named from (picturesSaid; null: by their whole
 * paths), `slug`: the report's, for the commands it writes. In this order, so that a reader of its
 * first lines or of its last ones misses neither the pictures nor the verdict: the folder of this
 * run's pictures, absolute; the blocks pictured, under the heading of their group (the blocks
 * changed, then the cards pictured though not changed: the folders changed/ and cards/), a line each
 * (`report.html:<line> <id> <tag.class>: <its pictures>`; a moved block with the edges of the blocks
 * beside it; a block with the blocks it holds, its pictures with each Sheet panel or detail card that
 * holds one, and those of them no picture showed; those past BLOCK_PICTURES, of each group, in a line
 * that names them and gives the command that pictures them); the pictures of the flagged elements, to
 * look at first; the tiles (the page as it opens, each Sheet panel shown in turn and each detail card
 * opened, counted apart); the tables that scroll, a line each, said as information
 * (its line and name: its caption, its chart card's title, the note above it, or its first header
 * cell; its directions, → sideways, ↓ down); then each finding by level (its own, findingLevel),
 * kind and place, with the looks it was seen in and their pictures (a kind ADVICE has saying it once
 * under them, whatever its level: adviceOf, code that scrolls sideways CODE_SIDEWAYS), info the same way but what a table that scrolls does; and last a
 * line for each look (what it found of each level, the tables that scroll each way, what the page
 * has: its disclosures, closed in the file and opened for the pictures, and its detail cards, opened in
 * turn; the laptop's window says only
 * what it added to the 1024px look); after them, of a run of named blocks, what it did not picture
 * that a plain run would (notPicturedLine). Returns { lines, levels, looks }: for each level, the places
 * said (a kind at a place, however many looks saw it and in whatever words; info: its kind at its
 * place, printed or not); for each look, { label, fail, warn } as its line counts them.
 */
export function describeLooks(looks, index, blocks = null, { folder = null, slug = "<slug>", all = false } = {}) {
  const lines = [];
  const levels = Object.fromEntries(LEVELS.map((level) => [level, 0]));
  const groups = new Map();
  const infos = new Set();
  const tables = new Map(); // place|name -> { place, name, right: [labels], down: [labels] }
  const counted = [];
  const named = (files) => picturesSaid(files, folder);
  const labelOf = (look) => look.label ?? String(look.width);
  const pictures = new Map(looks.flatMap((look) => look.pictures.filter((picture) => picture.shot !== undefined).map((picture) => [`${labelOf(look)}|${picture.shot}`, picture.file])));
  for (const look of looks) {
    const { width, findings, counts } = look;
    const label = labelOf(look);
    const seen = new Set();
    const own = Object.fromEntries(LEVELS.map((level) => [level, 0]));
    const scrolling = { right: 0, down: 0, all: 0 };
    for (const finding of findings) {
      const key = `${finding.kind}|${finding.shot ?? ""}|${finding.what}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const level = findingLevel(finding, width);
      own[level] += 1;
      const place = placeOf(finding.anchor, index);
      if (finding.kind === "table-scrolls") {
        const { sideways = false, down = false, name = "" } = finding.scroll ?? {};
        Object.assign(scrolling, { all: scrolling.all + 1, right: scrolling.right + Number(sideways), down: scrolling.down + Number(down) });
        const table = `${place}|${name}`;
        if (!tables.has(table)) tables.set(table, { place, name, right: [], down: [] });
        if (sideways && !tables.get(table).right.includes(label)) tables.get(table).right.push(label);
        if (down && !tables.get(table).down.includes(label)) tables.get(table).down.push(label);
      }
      if (level === "info") infos.add(`${finding.kind}|${place}`);
      // Of info, all but what a table that scrolls does are said one by one (those tables are listed
      // apart, with the ways they scroll; a narrow window's columns and rows out of sight are that).
      if (level === "info" && ["table-scrolls", "table-columns", "table-rows"].includes(finding.kind)) continue;
      const group = `${LEVELS.indexOf(level)}|${finding.kind}|${place}`;
      if (!groups.has(group)) {
        groups.set(group, { level, kind: finding.kind, place, said: new Map() });
        if (level !== "info") levels[level] += 1;
      }
      // The same words in several looks are one line, with each look's picture.
      const said = groups.get(group).said;
      const words = `${finding.state ? `[${finding.state}] ` : ""}${finding.what}`;
      if (!said.has(words)) said.set(words, { labels: [], pictures: [] });
      const line = said.get(words);
      if (!line.labels.includes(label)) line.labels.push(label);
      const picture = pictures.get(`${label}|${finding.shot}`);
      if (picture && !line.pictures.includes(picture)) line.pictures.push(picture);
    }
    const ways = [scrolling.right && `→ ${scrolling.right}`, scrolling.down && `↓ ${scrolling.down}`].filter(Boolean).join(", ");
    const scrolls = `${plural(scrolling.all, "table scrolls", "tables scroll")}${ways ? ` (${ways})` : ""}`;
    const cards = counts?.cards ? `, ${plural(counts.cards, "detail card")} (${counts.cardsOpened === counts.cards ? "closed in the file, opened in turn" : `${counts.cardsOpened ?? 0} of them opened`})` : "";
    const has = look.laptop ? "; only what the 1024px look did not find" : counts ? `; ${plural(counts.charts, "chart")}, ${plural(counts.tables, "table")}, ${counts.databases ? `${plural(counts.databases, "database")} (gallery check says what each view shows), ` : ""}${disclosuresSaid(counts)}, ${plural(counts.sheets, "Sheet")} shown besides the first${cards}, page ${counts.height}px tall` : "";
    counted.push({ label, fail: own.fail, warn: own.warn, line: `${look.laptop ? label : `${label.padStart(4)}px`}  fail ${own.fail} · warn ${own.warn} · unverified ${own.unverified} · ${scrolls}${has}` });
  }
  const sorted = [...groups.values()].sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));

  // The pictures of this run, for the list gallery qa ends with (checklistSaid): in sections, in the order
  // to look at them (the flagged elements, then the blocks changed and the cards, then the tiles), each
  // picture with its looks in braces and what it is; and what needs no look (`unneeded`).
  const taken = looks.flatMap((look) => look.pictures);
  const sections = [];
  const unneeded = [];
  const section = (title) => {
    const own = { title, items: [] };
    sections.push(own);
    return own;
  };
  const item = (own, files, words) => own.items.push({ count: new Set(files).size, names: named(files), text: words });
  const flagged = section("The elements flagged in the findings above");
  // One entry for each place a FAIL or a WARN names (the worst finding named), with one picture: the narrowest
  // width it was flagged at, where a layout's trouble shows most. INFO needs no look (不用看), and the other
  // widths' pictures stay in the run's folder (the user's 2026-11-13: a dozen pictures for each change).
  const widthOf = (file) => Number(/^(\d+)/.exec(path.basename(file))?.[1] ?? Infinity);
  // --pictures (`all`): every picture of each place flagged, INFO's too, each once, and every section below.
  const flaggedAt = new Map(); // place -> { files, text }
  const seenFiles = new Set();
  for (const group of sorted) {
    if (group.level === "info" && !all) continue;
    const files = [...new Set([...group.said.values()].flatMap(({ pictures: own }) => own))].filter((picture) => !all || !seenFiles.has(picture));
    if (!files.length || (!all && flaggedAt.has(group.place))) continue;
    for (const picture of files) seenFiles.add(picture);
    if (!flaggedAt.has(group.place)) flaggedAt.set(group.place, { files: [], text: `${group.level.toUpperCase()} ${group.kind} ${group.place}` });
    flaggedAt.get(group.place).files.push(...(all ? files : [files.reduce((narrow, each) => (widthOf(each) < widthOf(narrow) ? each : narrow))]));
  }
  for (const { files, text: words } of flaggedAt.values()) item(flagged, files, words);
  let kept = 0; // pictures of a plain run's changed blocks and cards: kept in the run's folder, not listed
  if (blocks) {
    const ofBlock = new Map();
    for (const picture of taken) if (picture.block !== undefined) ofBlock.set(picture.block, [...(ofBlock.get(picture.block) ?? []), picture.file]);
    // The blocks held that showed and were in no picture of their holder, with the widths where.
    const missed = missedWidths(looks);
    const tagged = (id) => `${blocks.tags?.get(id) ? `${blocks.tags.get(id)} ` : ""}${id}`;
    if (blocks.tiles && blocks.why) lines.push(`${blocks.why[0].toUpperCase()}${blocks.why.slice(1)}.`);
    const keptGroups = [];
    for (const group of blocks.groups ?? []) {
      if (!group.ids.length && !group.rest.length) continue;
      // The blocks a run was asked to picture (--blocks) are pictures to open; a plain run's pictures of the
      // blocks changed and of the cards are the checks' to look at, and what they flag is in the section
      // above: kept in the run's folder, not listed (the user's 2026-11-13).
      const asked = all || group.kind === "named";
      const own = asked ? section(`${group.why[0].toUpperCase()}${group.why.slice(1)}`) : { title: group.why, items: [] };
      if (!asked) keptGroups.push({ kind: group.kind, own });
      const hidden = [];
      for (const id of group.ids) {
        const line = index.blocks.get(id);
        const place = `${line ? `${index.name ?? "doc.html"}:${line}` : `(not in ${index.name ?? "doc.html"})`} ${id}${blocks.tags?.get(id) ? ` ${blocks.tags.get(id)}` : ""}`;
        const files = ofBlock.get(id) ?? [];
        const moved = blocks.moved?.has(id) ? " (moved: with the edges of the blocks before and after it)" : "";
        const inside = blocks.held?.get(id) ?? [];
        const changed = inside.filter((child) => blocks.changed?.has(child)).length;
        const kinds = group.kind === "named" ? plural(inside.length, "block") : [changed && plural(changed, "changed block"), inside.length - changed && plural(inside.length - changed, "card")].filter(Boolean).join(" and ");
        const again = taken.some((picture) => picture.block === id && picture.part) ? ", pictured again with each Sheet panel or detail card that holds one" : "";
        const lost = inside.filter((child) => missed.has(child));
        const where = [...new Set(lost.flatMap((child) => missed.get(child)))].map((at) => (at.includes("×") ? at : `${at}px`)).join(", ");
        const left = lost.length ? `; ${lost.length} of them not pictured at ${where}: gallery qa ${slug} --blocks ${lost.join(",")}` : "";
        const holds = inside.length ? ` (with the ${kinds} it holds${again}${left})` : "";
        if (files.length) item(own, files, `${place}${moved}${holds}`);
        else hidden.push(id);
        // A block it holds that no picture of it showed at some width, pictured on its own at that width (qa's second look).
        for (const child of inside) {
          if (!ofBlock.has(child) || group.ids.includes(child)) continue;
          const at = index.blocks.get(child);
          item(own, ofBlock.get(child), `${at ? `${index.name ?? "doc.html"}:${at}` : `(not in ${index.name ?? "doc.html"})`} ${child}${blocks.tags?.get(child) ? ` ${blocks.tags.get(child)}` : ""} (held by ${id}, whose pictures did not show it at this width: pictured on its own)`);
        }
      }
      if (hidden.length) unneeded.push(`${hidden.length === 1 ? "一个块" : `${hidden.length} 个块`}在任何宽度都不显示，读者看不到（${hidden.join(", ")}）`);
      if (group.rest.length) {
        const names = `${group.rest.slice(0, 6).map(tagged).join(", ")}${group.rest.length > 6 ? ", …" : ""}`;
        // Cards past the run's twelve: nothing changed in them and nothing is flagged; they stay unseen, and a later run pictures them.
        if (group.kind === "cards") unneeded.push(`另有 ${group.rest.length} 个没改过的卡片这次没有拍，没有改动也没有警告（${names}）`);
        else lines.push(`${plural(group.rest.length, "changed block")} past the ${CHANGED_PICTURES} a run pictures, not pictured (${names}): gallery qa ${slug} --blocks ${group.rest.join(",")}`);
      }
    }
    if (blocks.unknown.length) lines.push(`  no block of ${index.name ?? "doc.html"} has the id${blocks.unknown.length === 1 ? "" : "s"} ${blocks.unknown.join(", ")}`);
    const pictured = (kind) => keptGroups.filter((group) => group.kind === kind).reduce((sum, { own }) => sum + own.items.length, 0);
    kept = keptGroups.reduce((sum, { own }) => sum + own.items.reduce((count, each) => count + each.count, 0), 0);
    if (kept) {
      const what = [pictured("changed") && ` ${pictured("changed")} 个改动的块`, pictured("cards") && ` ${pictured("cards")} 个卡片`].filter(Boolean).join("、");
      unneeded.unshift(`这次给${what}拍的 ${kept} 张图，检查已经看过，标出的问题都在上面，不用打开`);
    }
  }
  const tiles = taken.filter((picture) => picture.tile);
  if (tiles.length && blocks?.tiles && blocks.why && !all) {
    // Tiles a plain run took by itself (a document with no block ids yet): the checks', kept, as the blocks' are.
    kept += tiles.length;
    unneeded.unshift(`这次整页分块拍的 ${tiles.length} 张图，检查已经看过，标出的问题都在上面，不用打开`);
  } else if (tiles.length) {
    const own = section("The page in tiles");
    const folderOf = (picture) => named([path.dirname(picture.file)])[0];
    const pageTiles = tiles.filter((picture) => !picture.sheet && !picture.card);
    if (pageTiles.length) own.items.push({ count: pageTiles.length, names: [`${folderOf(pageTiles[0])}/<width>-<n>.png`], text: `the page as it opens (each Sheet area with the panel it shows first): ${plural(pageTiles.length, "tile")}` });
    const panels = new Map();
    for (const { sheet } of tiles) if (sheet) panels.set(sheet.number, { ...sheet, count: (panels.get(sheet.number)?.count ?? 0) + 1 });
    if (panels.size) own.items.push({ count: tiles.filter((picture) => picture.sheet).length, names: [`${folderOf(tiles.find((picture) => picture.sheet))}/<width>-sheet<i>-<n>.png`], text: `each other Sheet panel, shown in turn: ${[...panels.values()].map(({ number, label, count }) => `sheet${number} ${quote(label, 24)} ${plural(count, "tile")}`).join(", ")}` });
    const cards = new Map();
    for (const { card } of tiles) if (card) cards.set(card.number, { ...card, count: (cards.get(card.number)?.count ?? 0) + 1 });
    if (cards.size) own.items.push({ count: tiles.filter((picture) => picture.card).length, names: [`${folderOf(tiles.find((picture) => picture.card))}/<width>-card<i>-<n>.png${tiles.some((picture) => picture.card?.part) ? " (with another panel of a Sheet in it shown, <width>-card<i>-sheet<j>-<n>.png)" : ""}`], text: `each detail card, opened in turn as the window shows it, its content scrolled a tile at a time: ${[...cards.values()].map(({ number, label, count }) => `card${number} ${quote(label, 24)} ${plural(count, "tile")}`).join(", ")}` });
  }

  // The tables that scroll, each a line of information; then the findings; then each look's counts.
  for (const { place, name, right, down } of tables.values()) {
    const where = /^(?:doc|report)\.html:\d+/.exec(place)?.[0] ?? place;
    lines.push(`${"INFO".padEnd(10)} table-scrolls: ${where}${name ? ` ${quote(name, 32)}` : ""}: ${[right.length && `→ ${looksSaid(right)}`, down.length && `↓ ${looksSaid(down)}`].filter(Boolean).join("; ")} (${SCROLLS})`);
  }
  for (const group of sorted) {
    lines.push(`${group.level.toUpperCase().padEnd(10)} ${group.kind}: ${group.place}`);
    for (const [words, { labels }] of group.said) {
      lines.push(`           ${looksSaid(labels)}: ${words}`);
    }
    for (const advice of adviceOf(group)) lines.push(`           ${advice}`);
  }
  lines.push(...counted.map(({ line }) => line));
  const left = notPicturedLine(blocks, slug);
  if (left) lines.push(left);
  levels.info = infos.size;
  if (infos.size) unneeded.push(`INFO 的 ${infos.size} 条（${infos.size === 1 ? "它" : "它们"}不是问题，读者会自己滚动表格等）`);
  return { lines, levels, looks: counted.map(({ label, fail, warn }) => ({ label, fail, warn })), pictures: { slug, folder, sections: sections.filter(({ items }) => items.length), unneeded, kept } };
}

/**
 * What a run of named blocks did not picture (`blocks`: blocksToPicture's, with tags; its `left`),
 * as the last line of the report's, before the list of the pictures not opened and the verdict, or null when it left nothing (or was no such run): the blocks
 * changed or moved since the last look outside those named, and the cards the change of the
 * document's own <script> or <style> may draw again (with no earlier look, every card outside them:
 * none was ever pictured), six of each named, with the plain run that
 * pictures them.
 */
export function notPicturedLine(blocks, slug = "<slug>") {
  const { changed = [], restyled = [], packages = [], cards = [], since = "the last look", first = false } = blocks?.left ?? {};
  if (!changed.length && !restyled.length && !cards.length) return null;
  const names = (ids) => `${ids.slice(0, 6).map((id) => `${blocks.tags?.get(id) ? `${blocks.tags.get(id)} ` : ""}${id}`).join(", ")}${ids.length > 6 ? ", …" : ""}`;
  const parts = [
    changed.length && `${plural(changed.length, "block")} changed or moved since ${since} (${names(changed)})`,
    restyled.length && `${plural(restyled.length, "instance")} of a custom block changed since ${since}, ${packages.join(", ")} (${names(restyled)})`,
    cards.length && (first ? `no earlier look: ${plural(cards.length, "card")} never pictured (${names(cards)})`
      : `${plural(cards.length, "card")} the change of the document's own <script> or <style> since ${since} may draw again (${names(cards)})`),
  ].filter(Boolean);
  return `Not pictured by this run, which pictures the blocks named alone: ${parts.join("; ")}. gallery qa ${slug} pictures them.`;
}

/**
 * The last lines gallery qa prints (`total`: the places of each level, describeLooks's `levels`
 * added up over the reports; `looks`: [{ label, fail, warn }] added up by look; `handed`: the exports
 * looked at, [{ slug, file: its absolute path, first: why this run exported it first ("stale",
 * "missing") or null }]), joined by line breaks: the verdict, each look's failures and warnings
 * repeated in it, what to do next, the other pictures there are (as commands, of the report when
 * there is one) and which exports this run made first; then, last, each export's line as gallery
 * export prints it, HAND_OVER and its absolute path alone (on the verdict's line, an Agent read the
 * path as part of the advice before it: found testing the skill with Agents, 2026-10-28). `unpictured`: the run
 * took no picture, having nothing to picture (no block changed, no card, nothing flagged), so that what
 * to do next is the run of tiles, not the pictures above (found testing the skill with Agents, 2026-11-02).
 */
export function verdictOf(total, looks, handed = [], { unpictured = false } = {}) {
  const each = looks.map(({ label, fail, warn }) => `${lookSaid(label)} fail ${fail}, warn ${warn}`).join("; ");
  const counts = each ? ` (${each})` : "";
  const first = { stale: "its file had changed since its export", missing: "it had none yet" };
  const made = handed.filter(({ first: why }) => why).map(({ slug, first: why }) => `${handed.length > 1 ? `${slug} was` : "It was"} exported first by this run (${first[why]}).`);
  const end = `${made.length ? `. ${made.join(" ")}` : ""}${handed.map(({ file }) => `\n${HAND_OVER}${file}`).join("")}`;
  if (total.fail) return `问题：failures at ${plural(total.fail, "place")}${counts}: fix them in the document's doc.html (report.html in an older document), then run this again (it exports first)${end}`;
  if (total.unverified) return `下一步：nothing failed${counts}; not verified at ${plural(total.unverified, "place")}: say so when you hand the document over${end}`;
  if (total.warn) return `下一步：nothing failed${counts}; warnings at ${plural(total.warn, "place")} to read, ${WARNED}${end}`;
  // Nothing found: nothing to open, whether or not anything was pictured (unpictured: no card and no block changed).
  return `下一步：nothing found${counts}: no picture to open; hand the document over${unpictured ? " (nothing to picture: no card and no block changed)" : ""}${end}`;
}

// ---------- the command ----------

/**
 * What gallery qa says as it exports `slug` first: why, in a reader's words (the export's path
 * named), never the hashes that refuse it with --no-export, which read as an error before an export
 * that went well (found testing the skill with Agents, 2026-10-29): no export yet; the file changed since the last
 * export (`edited`: the export says the text it was made from, another); a component package it holds
 * changed (`packaged`); or an export by a Gallery before exports said it.
 */
export function exportingFirst(slug, { missing = false, edited = false, packaged = false } = {}) {
  const file = deliverablePath(slug);
  const name = path.basename(documentFiles(documentDirectory(slug, reportsDirectory)).html);
  const why = missing ? `no export yet (${file})`
    : edited ? `${name} changed since the last export (${file})`
      : packaged ? `a custom block it uses changed since the last export (${file})`
      : `the last export (${file}) does not say which text it was made from (an older Gallery's)`;
  return `exporting first: ${why}, as gallery export ${slug} does (--no-export: refuse instead)`;
}

// A document with no export yet, or one not made from its doc.html as the file is now (of another
// text: the user typed in the page since, the file was changed after the export, or restored, or
// the export is older than the sha256 it would carry), is exported first, as gallery export does (the
// hand-in: the file written as the kit's markup, every block given an id; then the checks): the
// gallery command run as a child (its launcher, paths.mjs launcherFile, with export, in this workspace: GALLERY_WORKSPACE, its
// cwd the workspace's folder), its output said as gallery export says it. Which of them it exported:
// those whose export is now of their file as it is (exportOf, `made`: the document may have
// changed after it, the user typing in the page).
async function exportFirst(stale) {
  for (const [slug, { missing, edited, packaged }] of stale) console.log(`${slug}: ${exportingFirst(slug, { missing, edited, packaged })}`);
  const before = new Map(await Promise.all(stale.map(async ([slug]) => [slug, await fs.stat(deliverablePath(slug)).then((stat) => stat.mtimeMs, () => null)])));
  const ran = spawnSync(process.execPath, [launcherFile, "export", ...stale.map(([slug]) => slug)], { cwd: reportsDirectory, encoding: "utf8", env: { ...process.env, GALLERY_WORKSPACE: reportsDirectory }, maxBuffer: 256 * 1024 * 1024 });
  if (ran.stdout) process.stdout.write(ran.stdout);
  if (ran.stderr) process.stderr.write(ran.stderr);
  if (ran.error) console.error(`the export did not run: ${ran.error.message}`);
  const made = [];
  for (const [slug] of stale) {
    const time = await fs.stat(deliverablePath(slug)).then((stat) => stat.mtimeMs, () => null);
    if (time !== null && time !== before.get(slug) && !(await exportOf(slug, { made: true })).problem) made.push(slug);
  }
  return made;
}

/**
 * The block ids --blocks gives (`value`: its value), split at commas and white space: PowerShell
 * passes `--blocks a,b,c` unquoted as an array, which npm's gallery.ps1 joins with spaces into one
 * argument ("a b c", found testing the skill with Agents, 2026-10-29); a block id holds neither.
 */
export const namedBlocks = (value) => String(value ?? "").split(/[\s,]+/).filter(Boolean);

/** The ids of `named` (namedBlocks') that no block of report text `html` has, each once, in the order named. */
export function unknownBlocks(html, named) {
  const blocks = blocksOf(html);
  return [...new Set(named)].filter((id) => !blocks.has(id));
}

/** What gallery qa says (exit 2) of the ids --blocks names that no block of report file `file` has (`unknown`: unknownBlocks'). */
export const unknownBlocksSaid = (file, unknown) => `--blocks: no block of ${file} has the id${unknown.length === 1 ? "" : "s"} ${unknown.join(", ")}: nothing was looked at and no picture removed. Name ids as gallery qa prints them (data-block-id in the file).`;

/** gallery qa (./usage.mjs; gallery.mjs runs it). */
export async function run(argv) {
  const { slugs, options, values } = await documentArguments({ options: ["--tiles", "--no-export", "--pictures"], values: ["--blocks"], argv });
  const named = values.has("--blocks") ? namedBlocks(values.get("--blocks")) : null;
  if (named?.length === 0) throw new UsageError("--blocks takes block ids: --blocks <id,…>");
  if (named && slugs.length !== 1) throw new UsageError("--blocks names blocks of one document: name one.");
  const found = new Map();
  const problems = [];
  for (const slug of slugs) {
    const own = await exportOf(slug);
    if (own.problem && !((own.stale || own.missing) && !options.has("--no-export"))) problems.push(own.problem);
    found.set(slug, own);
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(2);
  }
  // The blocks named, each the document's, before anything is exported, emptied or looked at (testing
  // the skill with Agents, 2026-10-29: ids the document has not pictured nothing, the run before's
  // pictures were removed, and the verdict said "nothing found", exit 0).
  if (named) {
    const file = documentFiles(documentDirectory(slugs[0], reportsDirectory)).html;
    const unknown = unknownBlocks(newNames(await fs.readFile(file, "utf8").catch(() => "")), named);
    if (unknown.length) throw new UsageError(unknownBlocksSaid(path.resolve(file), unknown));
  }
  // What the preview wrote and the 批注 it deleted since a command last said them, first, as gallery
  // check and gallery export say them (an Agent whose last command is gallery qa heard of
  // neither), the server's check of the 批注 against the file as it is now run first.
  await previewSettled(slugs);
  await previewRewrites(slugs);
  await previewDeletions(slugs);
  const stale = [...found].filter(([, own]) => own.stale || own.missing);
  // Why each report this run exported first was exported, for the last line.
  const first = new Map(stale.map(([slug, own]) => [slug, own.missing ? "missing" : "stale"]));
  if (stale.length) {
    const made = await exportFirst(stale);
    const failed = stale.map(([slug]) => slug).filter((slug) => !made.includes(slug));
    for (const slug of made) found.set(slug, await exportOf(slug, { made: true }));
    if (failed.length) {
      console.error(`问题：${failed.join(", ")}: the export failed (above), so nothing was looked at: fix what it says, then run this again`);
      process.exit(1);
    }
  }
  const exports = found;
  const handed = [...exports].map(([slug, { file }]) => ({ slug, file, first: first.get(slug) ?? null }));
  // Without a browser, or with one that does not start, nothing is looked at: the exports it would
  // have looked at are named, and so is why and what to do; then each deliverable's line.
  const unverified = (why, todo) => {
    for (const [slug, { sha256: hash, time }] of exports) console.log(`${slug}: ${deliverablePath(slug)} sha256 ${hash}, exported ${timeOf(time)}`);
    console.log(`UNVERIFIED ${why}: nothing was looked at. ${todo}`);
    for (const { file } of handed) console.log(`${HAND_OVER}${file}`);
    process.exit(3);
  };
  const executablePath = findBrowser();
  if (!executablePath) unverified("no Chrome, Edge or Chromium found (GALLERY_BROWSER=<its executable> picks one)", `Install Chrome or Edge, or ${LOOK_YOURSELF}`);
  // The browser started by this process (startBrowser: never puppeteer's launch, whose kill printed
  // taskkill's error on Windows), in a fresh profile, a launch that failed tried once more with
  // another; closed on every way out (the finally below; a failure to start leaves none running).
  const started = await startBrowser({ executablePath, args: lookingArguments() })
    .catch((error) => unverified(`the browser ${executablePath} did not start, twice, each time with a fresh profile (${startFailure(error)}; GALLERY_BROWSER=<its executable> picks another)`, `Run gallery qa once more; if it says UNVERIFIED again, ${LOOK_YOURSELF}`));
  const { browser } = started;
  const total = Object.fromEntries(LEVELS.map((level) => [level, 0]));
  const perLook = new Map(); // a look's label -> { label, fail, warn } over the reports
  let pictured = false; // whether a report had anything to picture, or a look took a picture
  const listed = []; // each report's pictures for the list at the end (describeLooks's `pictures`)
  try {
    for (const [slug, { file, sha256: hash, time }] of exports) {
      // What the looks before saw of the report's blocks (kept in qa/<slug>/blocks.json), to picture
      // those changed or moved since; the blocks given an id since and as they were, known as they
      // were (adoptIdless).
      const out = path.join(qaDirectory, slug);
      const record = path.join(out, "blocks.json");
      console.log(`${slug}: ${deliverablePath(slug)} sha256 ${hash}, exported ${timeOf(time)} (${path.basename(executablePath)}, headless)`);
      const sourceFile = documentFiles(documentDirectory(slug, reportsDirectory)).html;
      const html = newNames(await fs.readFile(sourceFile, "utf8")); // its old names new, as the export made them (shared/old-names.mjs)
      const blocks = blocksOf(html);
      const before = adoptIdless(blocks, readBaseline(await fs.readFile(record, "utf8").catch(() => null)));
      const page = pageOf(html);
      const packages = packageStamps(html);
      const chosen = blocksToPicture(blocks, before, named, { tiles: options.has("--tiles") && !named, page, packages, complete: true });
      const tiles = options.has("--tiles") || Boolean(chosen.tiles);
      if (tiles || chosen.ids.length) pictured = true;
      // Each run pictures into a folder of its own, qa/<slug>/<its time>/ (the last RUNS_KEPT are kept, the
      // earlier taken away when it ends: endRun), in the folders of its kind: what it flags into flagged/
      // (every run), the blocks into blocks/ (those named), or changed/ and cards/ (the cards pictured
      // though not changed), the page into tiles/.
      const runFolder = await startRun(out);
      const folders = { flagged: path.join(runFolder.directory, "flagged"), blocks: path.join(runFolder.directory, named ? "blocks" : "changed"), tiles: path.join(runFolder.directory, "tiles") };
      const cardsFolder = path.join(runFolder.directory, "cards");
      folders.folders = new Map(chosen.groups.flatMap((group) => group.ids.map((id) => [id, group.kind === "cards" ? cardsFolder : folders.blocks])));
      for (const folder of [folders.flagged, ...(named ? [folders.blocks] : !chosen.tiles ? [folders.blocks, cardsFolder] : []), ...(tiles ? [folders.tiles] : [])]) await fs.mkdir(folder, { recursive: true });
      const whole = [...blocks].filter(([, { whole: own }]) => own).map(([id]) => id);
      const drawn = [...blocks].filter(([, { figure }]) => figure).map(([id]) => id);
      // The looks at once, each in a context of its own, its pictures named by its look (no two share a
      // file): a third of the time of one after another, the same findings and pictures. The laptop's
      // window waits for the look of its width before it, whose findings it leaves out (`known`).
      const lookOf = (look, known = null) => lookAt(browser, file, look, { out: folders, tiles: tiles && !look.laptop, blocks: look.laptop ? [] : chosen.ids, around: chosen.around, held: look.laptop ? new Map() : chosen.held, whole, drawn, known: look.laptop ? known : null });
      const running = [];
      for (const [at, look] of LOOKS.entries()) {
        const before = look.laptop ? LOOKS.slice(0, at).findIndex((other) => !other.laptop && other.width === look.width) : -1;
        running.push(before === -1 ? lookOf(look) : running[before].then((seen) => lookOf(look, new Set(seen.findings.map(findingKey)))));
      }
      const ended = await Promise.allSettled(running); // every look over before the browser closes, one that threw among them
      const threw = ended.find(({ status }) => status === "rejected");
      if (threw) throw threw.reason;
      const looks = ended.map(({ value: seen }, at) => ({ ...LOOKS[at], ...seen }));
      if (looks.some((look) => look.pictures.length)) pictured = true;
      // A block held by one pictured whose holder's pictures showed it at some width and not another (the middle
      // of a tall section moved): pictured on its own at that width, here, so that no second run is asked for.
      for (const [at, own] of looks.entries()) {
        const ids = [...missedWidths(looks)].filter(([, labels]) => labels.includes(own.label ?? String(own.width))).map(([id]) => id);
        if (!ids.length || own.laptop) continue;
        const more = await lookAt(browser, file, own, { out: folders, blocks: ids, whole, drawn, known: new Set(own.findings.map(findingKey)) });
        const done = new Set(more.pictures.filter(({ block }) => block !== undefined).map(({ block }) => block));
        looks[at] = { ...own, pictures: [...own.pictures, ...more.pictures.filter(({ block }) => block !== undefined)], held: { covered: [...new Set([...own.held.covered, ...done])], missed: own.held.missed.filter((id) => !done.has(id)) } };
        if (done.size) pictured = true;
      }
      const { lines, levels, looks: counted, pictures: listing } = describeLooks(looks, sourceIndex(html, path.basename(sourceFile)), { ...chosen, tags: new Map([...blocks].map(([id, { tag }]) => [id, tag])) }, { folder: runFolder.directory, slug, all: options.has("--pictures") });
      listed.push(listing);
      console.log(lines.join("\n"));
      for (const level of LEVELS) total[level] += levels[level];
      for (const { label, fail, warn } of counted) {
        const sum = perLook.get(label) ?? { label, fail: 0, warn: 0 };
        perLook.set(label, { label, fail: sum.fail + fail, warn: sum.warn + warn });
      }
      // The blocks as now looked at (nextBaseline), or as kept before when this look changes nothing
      // (a failure found, a look not verified).
      const verified = looks.every((look) => look.counts && !look.findings.some((finding) => finding.kind === "unverified"));
      const kept = nextBaseline(blocks, before, chosen, { named, verified, failed: levels.fail > 0, seen: seenOf(chosen, looks), page, packages }) ?? before;
      if (kept) await fs.writeFile(record, `${JSON.stringify(kept)}\n`);
      await endRun(out, runFolder.directory);
    }
  } finally {
    await started.close();
  }
  const checklist = checklistSaid(listed, { all: options.has("--pictures") });
  if (checklist.length) console.log(checklist.join("\n"));
  console.log(verdictOf(total, [...perLook.values()], handed, { unpictured: !pictured }));
  process.exitCode = total.fail ? 1 : total.unverified ? 4 : 0;
}
