// gallery qa's baseline (qa/<slug>/blocks.json): the report's blocks as they were last looked at,
// which a run of gallery qa compares the report with to picture the blocks changed or moved since
// (src/cli/qa.mjs blocksToPicture). gallery qa writes it after each run that failed nothing
// (nextBaseline). When there is none, the tools an Agent runs anyway write one of the report as it
// was before the round of changes it makes, so that the first look after a revision pictures what
// the revision changed, with no step of its own:
//   gallery export (exportBaselines; the workspace's export, the page's 导出报告, by the same
//     function: src/server/export.mjs; and the workbench's 导出 of an HTML or PDF file, which
//     writes no exports/<slug>.html but downloads the file: src/transfer/service.mjs) keeps the
//     report.html each export of it is made from
//     (qa/<slug>/exported.html), and, when there is no baseline, writes one of the text the export
//     BEFORE it was made from (that kept file, or a version the preview's edit service kept of it,
//     found by the sha256 that export carried), never of the text it exports now, which holds the
//     edits it is exported for;
//   gallery open (previewBaseline), when there is none, writes one of that same text when it is
//     known, else of report.html as it is: SKILL.md opens the preview before a revision starts.
// A report still holding the starter's section (gallery new's, which starts the preview) gets none:
// a new report has nothing to compare with, and its first look pictures its cards. A text older than
// the round (an export before the user's own edits too) only pictures more, never less. Neither
// command ever fails for this: a baseline not written is a first look that pictures the cards.
// No look has seen the text such a baseline is of (a run of gallery qa that failed nothing writes its
// own, and an export writes one only where there is none), so every card of it is kept as unseen: the
// first look after the round pictures what changed, then those cards, as a first look would have. A
// block of it with no id yet (a report the preview showed before its first export, which gives every
// block one) is kept by its markup alone (`idless`), so that the block the export gives an id is not
// taken as new when it is what it was (adoptIdless).
import fs from "node:fs/promises";
import path from "node:path";
import { addBlockIds, shownSource } from "../editor/source.mjs";
import { scan } from "../editor/source/blocks.mjs";
import { packagesOf } from "../render/package-files.mjs";
import { parseReport } from "../render/report-tree.mjs";
import { isInstance } from "../shared/components/index.mjs";
import { ATTRIBUTE } from "../shared/components/installed.mjs";
import { exportSourceOf } from "../shared/export-wrap.mjs";
import { sha256 } from "../shared/files.mjs";
import { attr, hasClass } from "../shared/html-tree.mjs";
import { editStateDirectory, exportsDirectory, qaDirectory, reportsDirectory } from "../shared/paths.mjs";
import { documentDirectory, documentFiles, layoutOf } from "../shared/workspace.mjs";

/**
 * Which of a report's blocks are pictured first, by what it is (`node`, the block's element; `kind`,
 * its unit's kind as the editor finds it): what an Agent draws or lays out itself, most likely to
 * clip or crowd, 0: a figure card (figure.doc-figure: a chart or a drawing of the report's own), a code
 * block (div.doc-code, a diff's div.doc-diff), a whole block (the editor's `block` unit: an
 * element of a class of the report's own, a bare <svg>, a layout or a drawing of the Agent's own), an
 * instance of a component package (isInstance: laid out by its package's style), a
 * flowchart (ol.doc-flow) and a Sheet area (section.doc-sheet-shell, data-doc-sheets);
 * columns (div.doc-columns) and another card (a figure: a picture, a file, a bookmark, an
 * embedded page) 1; a table's frame 2, after them, as a report may hold many; any other block 3. The
 * cards are those of rank 0 to 2.
 */
export function rankOf(node, kind = null) {
  if ((node.tagName === "figure" && hasClass(node, "doc-figure")) || (node.tagName === "div" && (hasClass(node, "doc-code") || hasClass(node, "doc-diff")))) return 0;
  if (kind === WHOLE || isInstance(node) || hasClass(node, "doc-flow") || hasClass(node, "doc-sheet-shell") || attr(node, "data-doc-sheets") !== undefined) return 0;
  if (node.tagName === "figure" || hasClass(node, "doc-columns")) return 1;
  if (hasClass(node, "doc-table-wrap")) return 2;
  return 3;
}

/**
 * The blocks of a report's HTML, by their data-block-id (outside a <template>), in the file's order:
 * id -> { hash: of the block's own markup (its tag, attributes, words and the elements it holds that
 * are no blocks, BLANKS as one: a block holding others changes when its own part does, not when
 * one it holds does or a block is added to it; a chart card drawn from a table, data-doc-chart-data
 * on its host, holds its table's hash too, data-doc-chart-source on the table's frame: what the
 * card draws changes with the table), rank: rankOf it, card: whether it is a card (a rank below 3),
 * whole: whether it is a whole block (the editor's `block` unit), figure: whether it is a card of the
 * editor's `figure` unit (figure.doc-figure: gallery qa reads the words of both),
 * tag: what it is (its tag and first class: "div.doc-table-wrap"), parent: the block it is in
 * (null for none), at: where it stands among the blocks of that parent (0 the first), size: how many
 * characters of the file it spans, the blocks it holds with it (what a move of it moves), bare: the
 * hash of the same markup without its own data-block-id, by which a block given an id since is known
 * (adoptIdless), package: the id of the package an instance is of, null for any other block }.
 */
export function blocksOf(html) {
  const found = new Map();
  // Each block's unit kind, as the editor finds it (the first of an id that repeats), for rankOf.
  const kinds = new Map();
  for (const unit of scan(html).units) if (unit.blockId && !kinds.has(unit.blockId)) kinds.set(unit.blockId, unit.kind);
  const reads = new Map(); // id -> the keys of the tables its charts are drawn from
  const sources = new Map(); // a table chart's key -> the block of its table, the first
  const counts = new Map(); // a parent block (null: none) -> how many blocks it holds so far
  const isBlock = (node) => Boolean(node.tagName) && attr(node, "data-block-id") !== undefined;
  const own = (node, id) => {
    if (node.nodeName === "#text") return node.value;
    if (!node.tagName || node.tagName === "template") return "";
    const key = attr(node, "data-doc-chart-data")?.trim();
    if (key) reads.get(id).push(key);
    const source = attr(node, "data-doc-chart-source")?.trim();
    if (source && !sources.has(source)) sources.set(source, id);
    const attributes = node.attrs.map(({ name, value }) => `${name}="${value}"`).sort().join(" ");
    return `<${node.tagName} ${attributes}>${(node.childNodes ?? []).map((child) => (isBlock(child) ? "" : own(child, id))).join("")}</${node.tagName}>`;
  };
  const visit = (node, parent) => {
    for (const child of node.childNodes ?? []) {
      if (!child.tagName || child.tagName === "template") continue;
      const id = attr(child, "data-block-id");
      let within = parent;
      if (id !== undefined && !found.has(id)) {
        const kind = [child.tagName, ...(attr(child, "class") ?? "").split(/\s+/).filter(Boolean).slice(0, 1)].join(".");
        const at = counts.get(parent) ?? 0;
        counts.set(parent, at + 1);
        reads.set(id, []);
        const rank = rankOf(child, kinds.get(id));
        const place = child.sourceCodeLocation;
        const size = place ? (place.endOffset ?? place.startTag?.endOffset ?? place.startOffset) - place.startOffset : 0;
        const markup = own(child, id).replace(BLANKS, " ");
        found.set(id, { hash: sha256(markup).slice(0, 16), bare: sha256(markup.replace(`data-block-id="${id}"`, "")).slice(0, 16), rank, card: rank < 3, whole: kinds.get(id) === WHOLE, figure: kinds.get(id) === FIGURE, tag: kind, parent, at, size, package: isInstance(child) ? attr(child, ATTRIBUTE) ?? null : null });
        within = id;
      }
      visit(child, within);
    }
  };
  visit(parseReport(html), null);
  // A table chart's card with its table's own hash (a key whose table is gone adds nothing: the card
  // says so, and its own markup is what changed).
  const owned = new Map([...found].map(([id, { hash, bare }]) => [id, { hash, bare }]));
  for (const [id, keys] of reads) {
    const tables = keys.map((key) => owned.get(sources.get(key))).filter(Boolean);
    if (!tables.length) continue;
    found.get(id).hash = sha256([owned.get(id).hash, ...tables.map(({ hash }) => hash)].join("|")).slice(0, 16);
    found.get(id).bare = sha256([owned.get(id).bare, ...tables.map(({ bare }) => bare)].join("|")).slice(0, 16);
  }
  return found;
}

/**
 * The hash of what a report's HTML says outside its blocks that may change how any of them looks:
 * its own <script> and <style> elements (their attributes and text, BLANKS as one) that no block holds
 * (a block's hash holds those it holds), outside a <template>: a chart of the report's own drawn
 * again by a define changed in its script, a whole block styled again by its <style>. "" when it has
 * none.
 */
export function pageOf(html) {
  const parts = [];
  const visit = (node) => {
    for (const child of node.childNodes ?? []) {
      if (!child.tagName || child.tagName === "template" || attr(child, "data-block-id") !== undefined) continue;
      if (child.tagName === "script" || child.tagName === "style") {
        const attributes = child.attrs.map(({ name, value }) => `${name}="${value}"`).sort().join(" ");
        parts.push(`<${child.tagName} ${attributes}>${(child.childNodes ?? []).map((text) => text.value ?? "").join("")}`.replace(BLANKS, " "));
      } else visit(child);
    }
  };
  visit(parseReport(html));
  return parts.length ? sha256(parts.join("|")).slice(0, 16) : "";
}

/**
 * The packages a report's HTML has instances of, each by its stamp (component-catalog.mjs: of its
 * manifest, template, script, style and the files it names, what an export is as old as): id ->
 * stamp. A package's style or script changed changes how its instances look, which none of their
 * markup says. One the workspace has not is left out.
 */
export const packageStamps = (html) => Object.fromEntries(packagesOf(html).map(({ id, stamp }) => [id, stamp]));

// The editor's unit kind of a whole block (整体块: src/editor/components/registry.mjs, its category
// "whole"), and of a card holding a figure (卡片块, figure.doc-figure: components/figure).
const WHOLE = "block";
const FIGURE = "figure";

// Blanks as HTML collapses them: spaces, tabs and line breaks. A no-break space, or another of
// Unicode's spaces, is a character a reader sees: a change to or from one changes the block.
const BLANKS = /[ \t\n\f\r]+/g;

// Who wrote a baseline, besides gallery qa (whose own says none): the export or the preview, from
// the text of the report they took it of.
export const BASELINE_FROM = ["export", "preview"];

/**
 * The blocks as gallery qa last looked at them, from what qa/<slug>/blocks.json holds (`text`, null
 * when there is none): { blocks: { id: hash }, places: { id: [its parent block or null, where it
 * stood among that parent's blocks] } (none in a file of an earlier version, which kept hashes
 * alone), moved: [the ids of blocks moved and not pictured yet], unseen: [the ids of cards a first
 * look left unpictured, not pictured yet], and, of one the export or the preview wrote of the report
 * as it was before a round of changes (none for gallery qa's own look), from: who (BASELINE_FROM),
 * time: when that text was exported or shown (ms, or null), idless: [the bare hashes of its blocks
 * that had no id yet] (left out when none), page: pageOf the report then (left out by a file of
 * an earlier version, which kept none: its script and style are taken as they were), and packages:
 * packageStamps of it then (left out when it held no instance, and by a file of an earlier version:
 * every package is taken as it was) }, or null when
 * it holds no hashes (cut short, or not written by these tools), and a look then has nothing to
 * compare with.
 */
export function readBaseline(text) {
  if (text === null || text === undefined) return null;
  try {
    const { blocks, places, moved, unseen, from, time, idless, page, packages } = JSON.parse(text) ?? {};
    if (!blocks || typeof blocks !== "object" || Array.isArray(blocks)) return null;
    const placed = places && typeof places === "object" && !Array.isArray(places) ? places : {};
    const ids = (value) => (Array.isArray(value) ? value.filter((id) => typeof id === "string") : []);
    return {
      blocks: Object.fromEntries(Object.entries(blocks).filter(([, hash]) => typeof hash === "string")),
      places: Object.fromEntries(Object.entries(placed).filter(([, place]) => Array.isArray(place) && place.length === 2
        && (place[0] === null || typeof place[0] === "string") && Number.isInteger(place[1]))),
      moved: ids(moved),
      unseen: ids(unseen),
      ...(BASELINE_FROM.includes(from) ? { from, time: Number.isFinite(time) ? time : null } : {}),
      ...(ids(idless).length ? { idless: ids(idless) } : {}),
      ...(typeof page === "string" ? { page } : {}),
      ...(packages && typeof packages === "object" && !Array.isArray(packages) ? { packages: Object.fromEntries(Object.entries(packages).filter(([, stamp]) => typeof stamp === "string")) } : {}),
    };
  } catch {
    return null;
  }
}

// The ids a baseline gives, in the text it is taken of, the blocks that have none yet (no id an export
// gives: those are random, shared/ids.mjs).
const STAND_IN = "ge-idless-";

/**
 * A baseline of a report's text (`html`) as the export or the preview writes it (`from`, one of
 * BASELINE_FROM; `time`: when that text was exported or shown, ms): every block as it is there, in
 * its place, nothing moved, and every card unseen (no look has seen this text). The text is taken as
 * the export will write it (shownSource: an Agent's natural HTML made the kit's), a block with no id
 * given a stand-in (STAND_IN), so that the blocks around it have the places and the markup they will
 * have once the export gives it one; such a block is kept by its bare hash alone (`idless`), and a
 * block in one keeps no place (its parent's id is not the one the export gives); its script and
 * style as they were (`page`, pageOf), and the packages of its instances as they are now (`packages`,
 * packageStamps: what they were when that text was written is not known). What gallery qa's next look
 * compares the report with.
 */
export function baselineOf(html, { from, time }) {
  let count = 0;
  const { text } = addBlockIds(shownSource(html).text, () => `${STAND_IN}${count++}`);
  const packages = packageStamps(text);
  const next = { blocks: {}, places: {}, moved: [], unseen: [], from, time, page: pageOf(text), ...(Object.keys(packages).length ? { packages } : {}) };
  const idless = [];
  for (const [id, { hash, bare, card, parent, at }] of blocksOf(text)) {
    if (id.startsWith(STAND_IN)) {
      idless.push(bare);
      continue;
    }
    next.blocks[id] = hash;
    if (!parent?.startsWith(STAND_IN)) next.places[id] = [parent, at];
    if (card) next.unseen.push(id);
  }
  return idless.length ? { ...next, idless } : next;
}

/**
 * A baseline (`before`: readBaseline's, or null) with the blocks of the report (`blocks`: blocksOf it)
 * that had no id when it was taken and are as they were (an id it does not hold, of a block whose bare
 * hash is one of its `idless`, each taken once) adopted: its blocks hold them with their hashes now,
 * the cards among them unseen (only a baseline the export or the preview wrote has `idless`, of a text
 * no look has seen). The ones none adopted stay; `before` itself when it has none.
 */
export function adoptIdless(blocks, before) {
  if (!before?.idless?.length) return before;
  const left = new Map();
  for (const bare of before.idless) left.set(bare, (left.get(bare) ?? 0) + 1);
  const adopted = { ...before, blocks: { ...before.blocks }, unseen: [...before.unseen] };
  for (const [id, { hash, bare, card }] of blocks) {
    if (Object.hasOwn(before.blocks, id) || !left.get(bare)) continue;
    left.set(bare, left.get(bare) - 1);
    adopted.blocks[id] = hash;
    if (card) adopted.unseen.push(id);
  }
  const idless = [...left].flatMap(([bare, count]) => Array(count).fill(bare));
  if (idless.length) adopted.idless = idless;
  else delete adopted.idless;
  return adopted;
}

// A report still holding the starter's section (gallery new's): nothing yet to compare with.
const STARTER = /<[^>]*\sdata-doc-placeholder\b/;

// Where a report's baseline and the text its last export was made from are kept.
const folderOf = (slug, root) => path.join(layoutOf(root).qa, slug);
const recordOf = (slug, root) => path.join(folderOf(slug, root), "blocks.json");
const keptOf = (slug, root) => path.join(folderOf(slug, root), "exported.html");

/** Whether `slug` has a baseline gallery qa can read (readBaseline). */
export async function hasBaseline(slug, root = reportsDirectory) {
  return readBaseline(await fs.readFile(recordOf(slug, root), "utf8").catch(() => null)) !== null;
}

/**
 * The text <workspace>/<slug>/doc.html was when its export was made from it (`said`: the sha256 the
 * export carries, exportSourceOf; null when there is no export or it says none), with when it was
 * exported (`time`, ms): the text gallery export kept of it (qa/<slug>/exported.html), or a version
 * the preview's edit service kept (a report's history before a commit, or a snapshot served to a
 * page; src/editor/service.mjs), each only when its bytes are of that sha256. Failing those, the text
 * kept of an earlier export (made before the export said, or before the edit service kept it): older
 * still, so it pictures more, never less. The text kept, though, when it was kept after the export
 * said was written and is not of it: an export made since that wrote no exports/<slug>.html (the
 * workbench's 导出) made it, the latest. { text, time } or null.
 */
export async function exportedText(slug, said, time, root = reportsDirectory) {
  const editStateDirectory = layoutOf(root).state;
  const of = async (file) => fs.readFile(file).then((bytes) => ({ bytes, file }), () => null);
  const kept = await of(keptOf(slug, root));
  const candidates = [kept];
  if (said) {
    const version = said.slice(0, 16);
    const history = path.join(editStateDirectory, "history", slug);
    const names = await fs.readdir(history).catch(() => []);
    candidates.push(...await Promise.all(names.filter((name) => name.endsWith(`-${version}.html`)).map((name) => of(path.join(history, name)))));
    candidates.push(await of(path.join(editStateDirectory, "snapshots", `${version}.html`)));
  }
  const keptAt = kept ? (await fs.stat(kept.file).catch(() => null))?.mtimeMs ?? null : null;
  const later = kept && said && time !== null && keptAt !== null && keptAt > time && sha256(kept.bytes) !== said;
  const exact = !later && said && candidates.find((found) => found && sha256(found.bytes) === said);
  const found = exact || kept;
  if (!found) return null;
  const when = exact && time !== null ? time : found === kept ? keptAt ?? time : (await fs.stat(found.file).catch(() => null))?.mtimeMs ?? time;
  return { text: found.bytes.toString("utf8"), time: when ?? null };
}

// The export of `slug` as it is on disk: { said: the sha256 of the report.html it was made from (or
// null), time: when it was written } or null when there is none.
async function exportNow(slug, root) {
  const exportsDirectory = layoutOf(root).exports;
  const file = path.join(exportsDirectory, `${slug}.html`);
  const [text, stat] = await Promise.all([fs.readFile(file, "utf8").catch(() => null), fs.stat(file).catch(() => null)]);
  return text === null || !stat ? null : { said: exportSourceOf(text), time: stat.mtimeMs };
}

// Writes `slug`'s baseline of `text` (from, time) unless it holds the starter's section or no block
// at all (nothing a look could compare with: its first look stays a first one).
async function writeBaseline(slug, text, provenance, root) {
  if (STARTER.test(text)) return false;
  const baseline = baselineOf(text, provenance);
  if (!Object.keys(baseline.blocks).length && !baseline.idless) return false;
  await fs.mkdir(folderOf(slug, root), { recursive: true });
  await fs.writeFile(recordOf(slug, root), `${JSON.stringify(baseline)}\n`);
  return true;
}

/**
 * gallery export's part, around the export of `slugs`: read before anything is written (the export
 * before, which this one replaces), then `keep(slugs exported)` after it. For each report exported:
 * with no baseline, one of the text the export before was made from (exportedText), from "export";
 * then the text this export was made from kept for the next (qa/<slug>/exported.html: report.html as
 * it is, when its sha256 is the one the new export carries; the user typing in the preview meanwhile
 * keeps nothing). `made`: slug -> the sha256 of the report.html each file was made from, for an
 * export that writes no exports/<slug>.html (the workbench's 导出, whose file is downloaded); else the
 * one exports/<slug>.html carries. Says nothing and never fails the export: what it cannot do, it leaves.
 */
export async function exportBaselines(slugs, root = reportsDirectory) {
  const before = new Map(await Promise.all(slugs.map(async (slug) => [slug, await exportNow(slug, root).catch(() => null)])));
  const keep = async (exported, made = null) => {
    for (const slug of exported) {
      try {
        if (!(await hasBaseline(slug, root))) {
          const earlier = before.get(slug);
          const text = await exportedText(slug, earlier?.said ?? null, earlier?.time ?? null, root);
          if (text) await writeBaseline(slug, text.text, { from: "export", time: text.time }, root);
        }
        const [bytes, now] = await Promise.all([fs.readFile(documentFiles(documentDirectory(slug, root)).html), made ? { said: made.get(slug) ?? null } : exportNow(slug, root)]);
        if (now?.said && sha256(bytes) === now.said) {
          await fs.mkdir(folderOf(slug, root), { recursive: true });
          await fs.writeFile(keptOf(slug, root), bytes);
        }
      } catch {} // a baseline or a kept text not written: the next look is a first one
    }
  };
  return { keep };
}

/**
 * gallery open's part (`source`: report.html as the command read it): with no baseline, one of the
 * text the report's last export was made from (exportedText), from "export"; else, never exported,
 * of `source` as it is now, from "preview" (SKILL.md runs the preview before a revision starts).
 * Nothing for a report still holding the starter's section. Whether it wrote one; never fails.
 */
export async function previewBaseline(slug, source, root = reportsDirectory) {
  try {
    if (await hasBaseline(slug, root)) return false;
    const last = await exportNow(slug, root);
    const text = await exportedText(slug, last?.said ?? null, last?.time ?? null, root);
    return await writeBaseline(slug, text?.text ?? source, text ? { from: "export", time: text.time } : { from: "preview", time: Date.now() }, root);
  } catch {
    return false;
  }
}
