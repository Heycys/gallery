import fs from "node:fs/promises";
import path from "node:path";
import { checkAnnotations, cleanAnchor, cleanItem, FILE, itemsText, markItems, readItems, treeText, unknownIds, withoutItems } from "../shared/annotations.mjs";
import { writeAtomic } from "../shared/files.mjs";
import { slugPattern } from "../shared/reports.mjs";
import { documentDirectory, documentFiles } from "../shared/workspace.mjs";
import { findUnits, hashOf } from "./source.mjs";

// The reader's 批注 of a report, on the server (docs/editor.md "Annotations"): <workspace>/<slug>/annotations.json,
// read, checked against the report and written here, one write at a time in the edit service's queue
// (service.mjs annotations). The check (shared/annotations.mjs checkAnnotations) runs whenever the
// report's file was written, by anyone (the preview's announcement of a change: a commit, an Agent,
// another tab), and before every answer: an annotation whose words or blocks are gone is deleted, one
// whose words moved or changed in part follows them. A new one the file does not hold yet, a block's
// id or its words being on their way in a commit that can be slower than the reader, is not judged
// until it does: it stands as it was sent, whatever is saved or written meanwhile (`waiting`, kept here
// and not in the file, for a while: a commit that never comes leaves an annotation of nothing). The
// file is written only when something changed and taken away when nothing is left. What a check
// deleted is remembered for a while, so the page that still shows it puts it back when an undo brings
// its words back (`dropped` in the answers), and told the edit service, which keeps it for the Agent's
// next gallery check or gallery export to say and says it in the dev server's log
// (dropped-annotations.mjs).

const DROPPED_FOR = 10 * 60 * 1000;
const WAITED_FOR = 10 * 60 * 1000;
// What a gallery command removed (gallery notes remove) is offered back to a page that reads it within this long (its 撤销).
const COMMAND_REMOVED_FOR = 2 * 60 * 1000;

/**
 * The units of a report's text (as its pages see it: the edit service's read) in page order, as
 * checkAnnotations takes them: [{ id, text, parent, where }], `where` the place the copy names (a Sheet
 * tab's name, the headings above it, the disclosure it is in).
 */
export function reportUnits(text) {
  const { units, boxes } = findUnits(text);
  const sorted = [...units].sort((a, b) => a.elStart - b.elStart);
  const index = new Map(sorted.map((unit, at) => [unit.id, at]));
  const texts = new Map(sorted.map((unit) => [unit.id, treeText(unit.node)]));
  const heads = { h2: null, h3: null, h4: null };
  return sorted.map((unit) => {
    // A tab's panel's blocks name their tab, a disclosure's content its title.
    const outer = [];
    for (let at = unit; at; at = at.parent === null ? null : units[at.parent]) {
      const box = boxes[at.box];
      if (box?.kind === "panel" && box.key !== null) {
        const tab = units.find((other) => other.kind === "tab" && other.parent === box.unit && other.key === box.key);
        if (tab) outer.unshift({ tab: texts.get(tab.id) });
      }
      const owner = box?.unit === null || box?.unit === undefined ? null : units[box.unit];
      if (owner?.tag === "details" && box.kind === "details") {
        const summary = owner.node.childNodes.find((child) => child.tagName === "summary");
        if (summary) outer.push({ details: treeText(summary) });
      }
    }
    const tab = outer.find((entry) => entry.tab)?.tab;
    const details = outer.find((entry) => entry.details)?.details; // the innermost
    const where = [tab, heads.h2, heads.h3, heads.h4, details].filter(Boolean);
    if (unit.tag === "h2") Object.assign(heads, { h2: texts.get(unit.id), h3: null, h4: null });
    else if (unit.tag === "h3") Object.assign(heads, { h3: texts.get(unit.id), h4: null });
    else if (unit.tag === "h4") heads.h4 = texts.get(unit.id);
    return { id: unit.blockId, text: texts.get(unit.id), parent: unit.parent === null ? null : index.get(unit.parent) ?? null, where, heading: /^h[2-4]$/.test(unit.tag) };
  });
}

/**
 * reportsDirectory: where the reports are; read(slug): the report as its pages see it ({ text } or
 * null: the edit service's read); write(file, text): writes a file whole (writeAtomic);
 * dropped(slug, items): told the annotations a check deleted (their words or blocks gone), once the
 * file without them is written, for the Agent's next check or export to say (dropped-annotations.mjs).
 * now(): the time (ms). `verify` false (gallery notes with no server running: nothing here knows the report as its pages see
 * it) reads and writes the file as it is, never checking an annotation against the report, so nothing is deleted, rewritten
 * or reordered by looking at it; the report is read only to say where each one is.
 */
export function createAnnotations({ reportsDirectory, read, write = writeAtomic, dropped: told = () => {}, now = Date.now, verify = true }) {
  const dropped = new Map(); // slug -> Map(id -> when a check deleted it)
  const commandRemoved = new Map(); // slug -> { at, items }: what a gallery command removed last, offered back as 撤销 to the page that reads it
  const waiting = new Map(); // slug -> Map(id -> when it came): new ones the file does not hold yet
  const parsed = new Map(); // slug -> { text, units }: the last report read, parsed once while it stays the same
  const unitsOf = (slug, text) => {
    const known = parsed.get(slug);
    if (known?.text === text) return known.units;
    const units = reportUnits(text);
    parsed.set(slug, { text, units });
    return units;
  };
  const fileOf = (slug) => path.join(documentDirectory(slug, reportsDirectory), FILE);
  const valid = (slug) => typeof slug === "string" && slugPattern.test(slug);

  async function load(slug) {
    const text = await fs.readFile(fileOf(slug), "utf8").catch(() => null);
    return { text, items: text === null ? [] : readItems(text) };
  }

  // The file as `items` say (none: no file); returns its version.
  async function store(slug, items, before) {
    const text = itemsText(items);
    if (text === before) return versionOf(text);
    if (text === null) await fs.rm(fileOf(slug), { force: true });
    else await write(fileOf(slug), text);
    return versionOf(text);
  }
  const versionOf = (text) => (text === null ? "" : hashOf(text));

  // The ids a check deleted lately (the page may put them back: an undo brought their words back).
  const droppedOf = (slug) => {
    const list = dropped.get(slug) ?? new Map();
    for (const [id, at] of list) if (now() - at > DROPPED_FOR) list.delete(id);
    return [...list.keys()];
  };
  const forget = (slug, ids) => ids.forEach((id) => dropped.get(slug)?.delete(id));

  // The new annotations still waited for (those waited for too long are judged as any other).
  const waitedFor = (slug) => {
    const list = waiting.get(slug) ?? waiting.set(slug, new Map()).get(slug);
    for (const [id, at] of list) if (now() - at > WAITED_FOR) list.delete(id);
    return list;
  };

  /**
   * The annotations checked against the report (and written when that changed them): { items, units,
   * places, version, missing (no report) }. `keep`: the id of one kept whatever is found.
   */
  async function check(slug, { keep = null, items: given = null, before = undefined } = {}) {
    const loaded = given ? { items: given, text: before } : await load(slug);
    const report = await read(slug).catch(() => null);
    if (!report) return { items: loaded.items, units: [], places: new Map(), version: versionOf(loaded.text), missing: true };
    const units = unitsOf(slug, report.text);
    if (!verify) {
      const version = given ? await store(slug, loaded.items, loaded.text) : versionOf(loaded.text);
      return { items: loaded.items, units, places: checkAnnotations(loaded.items, units).places, version, missing: false };
    }
    const expected = waitedFor(slug);
    const result = checkAnnotations(loaded.items, units, { keep: new Set([...expected.keys(), keep]) });
    for (const id of expected.keys()) if (!result.waiting.has(id)) expected.delete(id);
    if (result.dropped.length > 0) {
      const list = dropped.get(slug) ?? dropped.set(slug, new Map()).get(slug);
      for (const item of result.dropped) list.set(item.id, now());
    }
    const version = result.changed || given ? await store(slug, result.items, loaded.text) : versionOf(loaded.text);
    if (result.dropped.length > 0) told(slug, result.dropped);
    return { items: result.items, units, places: result.places, version, missing: false };
  }

  // What a gallery command removed lately: { at, items } while it is offered back (the page that reads it says 已删除 N 条批注 with 撤销), else none.
  const removedByCommand = (slug) => {
    const taken = commandRemoved.get(slug);
    if (taken && now() - taken.at > COMMAND_REMOVED_FOR) commandRemoved.delete(slug);
    return commandRemoved.get(slug);
  };
  const answer = (slug, { items, version }) => ({ ok: true, version, items, dropped: droppedOf(slug), ...(removedByCommand(slug) ? { commandRemoved: removedByCommand(slug) } : {}) });

  /** GET annotations?slug=: { ok, version, items, dropped }, checked first. */
  async function list(slug) {
    if (!valid(slug)) return [400, { ok: false, reason: "body" }];
    const result = await check(slug);
    if (result.missing) return [404, { ok: false, reason: "missing" }];
    return [200, answer(slug, result)];
  }

  /**
   * GET annotations?slug=&as=copy: what 复制批注 puts on the clipboard, for the workbench to write as
   * Markdown in the UI's language (shared/annotations.mjs annotationsMarkdown): { ok, title, path,
   * items: [{ where, blocks, whole, quote, text }] }, the annotations still found, in page order, those
   * marked done left out (an Agent has acted on them). `all` (GET annotations?slug=&as=notes, gallery
   * notes): every one, each also with its id, `done`, `created` and `updated`.
   */
  async function describe(slug, { all = false } = {}) {
    if (!valid(slug)) return [400, { ok: false, reason: "body" }];
    const result = await check(slug);
    if (result.missing) return [404, { ok: false, reason: "missing" }];
    let metadata = null;
    const files = documentFiles(documentDirectory(slug, reportsDirectory));
    try { metadata = JSON.parse(await fs.readFile(files.json, "utf8")); } catch {}
    const report = await read(slug).catch(() => null);
    const heading = /<h1\b[^>]*>([\s\S]*?)<\/h1>/i.exec(report?.text ?? "")?.[1]?.replace(/<[^>]*>/g, "").trim();
    const title = typeof metadata?.title === "string" && metadata.title.trim() ? metadata.title.trim() : heading || slug;
    // Where each is: the place its first unit names; a heading with none above it, itself; nothing
    // before the report's first heading, 页首 (`top`; a report with no headings: 正文).
    const headed = result.units.some((unit) => unit.heading);
    const items = result.items.filter((item) => all || !item.done).map((item) => {
      const unit = result.units[result.places.get(item.id)?.at];
      const where = unit?.where?.length ? unit.where : unit?.heading ? [unit.text] : [];
      return {
        ...(all ? { id: item.id } : {}),
        where,
        top: headed && where.length === 0,
        blocks: item.anchor.blocks.filter((id) => result.units.some((each) => each.id === id)),
        whole: item.anchor.kind === "blocks",
        quote: item.anchor.quote,
        text: item.text,
        ...(all ? { done: item.done === true, created: item.created, updated: item.updated } : {}),
      };
    });
    return [200, { ok: true, title, path: path.resolve(files.html), items }];
  }

  /**
   * POST annotations: { slug, put: item } (made or changed, by its id), { slug, remove: id },
   * { slug, clear: true } (all of them; `removed` in the answer, for 撤销), { slug, restore: [item] }
   * (put back, as they were), { slug, done: [id] } and { slug, undone: [id] } (marked as acted on, or not: gallery
   * notes done; the card goes grey on the page), { slug, removeIds: [id] } and { slug, removeDone: true } (taken out;
   * `removed` in the answer, as for `clear`). An id no annotation has refuses the whole request (404 `ids`), nothing
   * written. `by: "command"` on a removal (gallery notes remove) keeps what it took for a while, `commandRemoved` in
   * every answer after it, so that a page that reads it offers 撤销 as for a card's delete button. A `put` of a done one
   * keeps it done only while its words are the same (new words are a new suggestion).
   * Answers { ok, version, items, dropped } once written, the others checked too.
   * { slug, anchors: { id: anchor } }: where annotations' words are on the page now that the reader
   * edited them (typed into, partly deleted, split by Enter), sent by the page right before the commit
   * that writes that edit (autosave's `before`), so the check after it finds them as they are; written
   * as they come, unchecked (the file does not have the edit yet), only for annotations the file has.
   * An item has words: a `put` with none is refused (`item`), a `restore` leaves such out, and a
   * file's item with none (made before 2026-11-06, when one could mark a place) is read as none
   * (shared/annotations.mjs readItems), gone at the file's next write.
   */
  async function change(body) {
    const { slug } = body ?? {};
    if (!valid(slug)) return [400, { ok: false, reason: "body" }];
    if (!(await read(slug).catch(() => null))) return [404, { ok: false, reason: "missing" }];
    const loaded = await load(slug);
    if (body.anchors && typeof body.anchors === "object" && !Array.isArray(body.anchors)) {
      const items = loaded.items.map((item) => {
        const anchor = Object.hasOwn(body.anchors, item.id) ? cleanAnchor(body.anchors[item.id]) : null;
        return anchor && anchor.kind === item.anchor.kind ? { ...item, anchor } : item;
      });
      const version = await store(slug, items, loaded.text);
      return [200, answer(slug, { items, version })];
    }
    let items = loaded.items;
    let keep = null;
    let removed = null;
    if (body.put !== undefined) {
      const known = items.find((item) => item.id === body.put?.id);
      const made = cleanItem({ ...body.put, created: known?.created ?? body.put?.created, done: false });
      if (!made) return [400, { ok: false, reason: "item" }];
      const item = known?.done && known.text === made.text ? { ...made, done: true } : made;
      items = known ? items.map((other) => (other.id === item.id ? item : other)) : [...items, item];
      keep = item.id;
      if (!known) waitedFor(slug).set(item.id, now());
      forget(slug, [item.id]);
    } else if (typeof body.remove === "string") {
      items = items.filter((item) => item.id !== body.remove);
    } else if (body.clear === true) {
      removed = items;
      items = [];
    } else if (Array.isArray(body.done) || Array.isArray(body.undone) || Array.isArray(body.removeIds) || body.removeDone === true) {
      const ids = [body.done, body.undone, body.removeIds].find(Array.isArray) ?? [];
      if (!ids.every((id) => typeof id === "string")) return [400, { ok: false, reason: "body" }];
      const unknown = unknownIds(items, ids);
      if (unknown.length > 0) return [404, { ok: false, reason: "ids", ids: unknown }];
      if (Array.isArray(body.done) || Array.isArray(body.undone)) items = markItems(items, ids, Array.isArray(body.done));
      else ({ items, removed } = withoutItems(items, { ids, done: body.removeDone === true }));
    } else if (Array.isArray(body.restore)) {
      // Put back as they were, but never over a newer text of the same one (what a page typed offline
      // and sends late, after the reader changed it again elsewhere).
      const known = new Map(items.map((item) => [item.id, item]));
      const back = body.restore.map((item) => cleanItem(item, item?.updated)).filter((item) => item && !(known.get(item.id)?.updated > item.updated));
      const ids = new Set(back.map((item) => item.id));
      for (const id of ids) if (!known.has(id)) waitedFor(slug).set(id, now());
      items = [...items.filter((item) => !ids.has(item.id)), ...back];
      forget(slug, [...ids]);
      commandRemoved.delete(slug);
    } else return [400, { ok: false, reason: "body" }];
    if (body.put !== undefined) commandRemoved.delete(slug);
    if (body.by === "command" && removed?.length > 0) commandRemoved.set(slug, { at: now(), items: removed });
    const result = await check(slug, { keep, items, before: loaded.text });
    return [200, { ...answer(slug, result), ...(removed ? { removed } : {}) }];
  }

  /** After the report's file was written: the check, writing the file when it changed something. */
  async function afterWrite(slug) {
    if (!valid(slug)) return;
    const { text } = await load(slug);
    if (text === null) return; // nothing to check
    await check(slug);
  }

  return { list, copy: (slug) => describe(slug), notes: (slug) => describe(slug, { all: true }), change, afterWrite };
}
