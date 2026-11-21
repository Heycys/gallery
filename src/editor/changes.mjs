import fs from "node:fs/promises";
import path from "node:path";
import { writeAtomic } from "../shared/files.mjs";
import { slugPattern } from "../shared/reports.mjs";
import { diffRows, hashOf, isNewDocument } from "./source.mjs";

// The Agent's changes under review, on the server (docs/editor.md "Agent's changes"): for each
// report, what the edit service last took of its file (`seen`), and while some write that was not the
// service's own waits for the reader to keep or revert it, the baseline (`base`): the report as its
// pages saw it before that write, the reader's own commits since applied to it too (the service's
// `wrote` with its replay). With a state directory they are changes/<slug>/ there (seen.html,
// base.html, state.json: { v, born, seen, base, since, at, writes }), read again at every look,
// so that the folder deleted is the review forgotten; else in memory. Never in the report's folder.
// One queue of their own runs everything here in the order it was asked, apart from the commits'.
//
// look(slug, source): the service took the file as `source` (the announcement of a write, a commit's
// read, a hand-in's, a page served). The same as seen: nothing. Else, by blocks (source/changes.mjs
// diffRows, both as pages see them): no change but ids, white space or natural HTML's writing, only
// seen follows; with none under review, one starts with seen as its baseline, unless seen is a new
// document's (isNewDocument: the starter, gallery new's or the workbench's 新建), whose first write
// moves seen alone, so that a new document is not all green, or it is the 写作偏好 page; with one
// under review, it grows (`writes`), and ends when nothing is left of it (written back).
//
// Nothing else lasts between writes: the write after the one that filled the starter starts a review
// as any. A document's first writing (`draft` in state.json, ended by gallery open of it) is gone
// since 2026-11-13 (docs/editor.md): a state.json an older Gallery wrote with it is read without it.

const VERSION = 1;
const FILES = { seen: "seen.html", base: "base.html", state: "state.json" };
const READS_KEPT = 4;

/**
 * stateDirectory: where changes/ is (or null: in memory); shown(source): the text a report's pages
 * see of its file; folderOf(slug): its folder (whose birth time tells a folder made again under the
 * same name); isPage(slug): the 写作偏好 page, never reviewed; log(text): where a failure is said;
 * now(): the clock (ms).
 */
export function createChanges({ stateDirectory = null, shown, folderOf, isPage = () => false, log = null, now = Date.now }) {
  const memory = new Map(); // slug -> { state, seen, base }, without a state directory
  const directory = (slug) => path.join(stateDirectory, "changes", slug);
  let chain = Promise.resolve();
  const inChanges = (job) => {
    const run = chain.then(job);
    chain = run.catch((error) => log?.(`changes: ${error.message}`));
    return run;
  };

  // ---------- what is kept ----------
  async function readState(slug) {
    if (!stateDirectory) return memory.get(slug)?.state ?? null;
    try {
      const state = JSON.parse(await fs.readFile(path.join(directory(slug), FILES.state), "utf8"));
      if (state?.v !== VERSION || typeof state.seen !== "string") return null;
      // An older Gallery's first writing (`draft`, until 2026-11-13) counts for nothing: read without it, gone with the next save.
      const { draft: _, ...rest } = state;
      return rest;
    } catch {
      return null;
    }
  }
  async function readText(slug, name) {
    if (!stateDirectory) return memory.get(slug)?.[name] ?? null;
    return fs.readFile(path.join(directory(slug), FILES[name]), "utf8").catch(() => null);
  }
  // The state and the texts given (a text null: taken away), the state last.
  async function save(slug, state, texts = {}) {
    if (!stateDirectory) {
      const kept = memory.get(slug) ?? {};
      memory.set(slug, { ...kept, ...texts, state });
      return;
    }
    await fs.mkdir(directory(slug), { recursive: true });
    for (const [name, text] of Object.entries(texts)) {
      if (text === null) await fs.rm(path.join(directory(slug), FILES[name]), { force: true });
      else await writeAtomic(path.join(directory(slug), FILES[name]), text);
    }
    await writeAtomic(path.join(directory(slug), FILES.state), `${JSON.stringify(state)}\n`);
  }
  async function forget(slug) {
    memory.delete(slug);
    if (stateDirectory) await fs.rm(directory(slug), { recursive: true, force: true, maxRetries: 3 });
  }
  const born = async (slug) => Math.round((await fs.stat(folderOf(slug)).catch(() => null))?.birthtimeMs ?? 0);
  // What a review is known by to the page: it changes with every write it takes in, never with the reader's commits.
  const stampOf = (state) => (state?.base ? `${state.since}|${state.writes}` : null);
  // Nothing under review, `source` seen (`seen` its hash).
  const seenOnly = (state, seen, source) => [{ v: VERSION, born: state?.born ?? 0, seen }, { seen: source, base: null }];

  // The state of `slug` as kept, null for none (or one of a folder made again since).
  async function current(slug) {
    const state = await readState(slug);
    if (!state) return null;
    const now = await born(slug);
    if (state.born && now && state.born !== now) {
      await forget(slug);
      return null;
    }
    return state;
  }

  // ---------- looking ----------
  async function lookNow(slug, source) {
    if (typeof source !== "string" || !slugPattern.test(slug) || isPage(slug)) return false;
    const hash = hashOf(source);
    const state = await current(slug);
    if (!state) {
      await save(slug, { v: VERSION, born: await born(slug), seen: hash }, { seen: source });
      return false;
    }
    if (state.seen === hash) return false;
    const seen = await readText(slug, "seen");
    const at = new Date(now()).toISOString();
    if (seen === null) {
      await save(slug, ...seenOnly(state, hash, source));
      return false;
    }
    const then = shown(seen);
    const next = shown(source);
    if (!state.base) {
      if (!diffRows(then, next)) {
        await save(slug, ...seenOnly(state, hash, source));
        return false;
      }
      // A new document's starter filled (seen a new one's): no change to review, seen alone follows.
      if (isNewDocument(then)) {
        await save(slug, ...seenOnly(state, hash, source));
        return false;
      }
      await save(slug, { ...state, seen: hash, base: hashOf(then), since: at, at, writes: 1 }, { seen: source, base: then });
      return true;
    }
    const base = await readText(slug, "base");
    if (base === null || !diffRows(base, next)) { // written back as it was: nothing left to review
      await save(slug, ...seenOnly(state, hash, source));
      return true;
    }
    const grew = diffRows(then, next) !== null; // ids, white space, the kit's writing: the same review
    await save(slug, { ...state, seen: hash, ...(grew ? { at, writes: state.writes + 1 } : {}) }, { seen: source });
    return grew;
  }

  // What the service wrote itself: `replay(base)` the baseline with the same edit applied to it.
  async function wroteNow(slug, text, replay) {
    if (!slugPattern.test(slug) || isPage(slug)) return false;
    const state = await current(slug);
    const hash = hashOf(text);
    if (!state?.base) {
      await save(slug, ...seenOnly(state ?? { born: await born(slug) }, hash, text));
      return false;
    }
    let base = await readText(slug, "base");
    if (base !== null && replay) {
      try {
        base = replay(base);
      } catch (error) {
        log?.(`changes: ${slug}: the baseline did not take the edit (${error.message})`);
      }
    }
    if (base === null || !diffRows(base, shown(text))) {
      await save(slug, ...seenOnly(state, hash, text));
      return true;
    }
    await save(slug, { ...state, seen: hash, base: hashOf(base) }, { seen: text, base });
    return false;
  }

  // The last few reads, by the baseline's hash and the version read.
  const reads = new Map();
  async function readNow(slug, source) {
    await lookNow(slug, source);
    const next = shown(source);
    const version = hashOf(next);
    const state = await current(slug);
    if (!state?.base) return { pending: false, version };
    const key = `${slug} ${state.base} ${version}`;
    let diff = reads.get(key);
    if (diff === undefined) {
      const base = await readText(slug, "base");
      diff = base === null ? null : diffRows(base, next);
      reads.set(key, diff);
      while (reads.size > READS_KEPT) reads.delete(reads.keys().next().value);
    }
    if (!diff) return { pending: false, version };
    return { pending: true, version, stamp: stampOf(state), since: state.since, writes: state.writes, ...diff };
  }

  return {
    /** The file taken as `source`: resolves with whether a review started, grew or ended. */
    look: (slug, source) => inChanges(() => lookNow(slug, source)),
    /** The service wrote `text` (`replay`: the same edit for the baseline); resolves with whether the review ended. */
    wrote: (slug, text, replay = null) => inChanges(() => wroteNow(slug, text, replay)),
    /** What the reader is to review of `source` (the file as taken): { pending: false, version } or { pending: true, version, stamp, since, writes, ...diffRows }. */
    read: (slug, source) => inChanges(() => readNow(slug, source)),
    /** The review's stamp now, null for none. */
    stamp: (slug) => inChanges(async () => stampOf(await current(slug))),
    /** What is kept of a review (for an undo of a revert): { state, seen, base }, or null. */
    snapshot: (slug) => inChanges(async () => {
      const state = await current(slug);
      return state ? { state, seen: await readText(slug, "seen"), base: await readText(slug, "base") } : null;
    }),
    /** The review ended (kept, or reverted): its baseline gone, seen kept. */
    clear: (slug) => inChanges(async () => {
      const state = await current(slug);
      if (state?.base) await save(slug, { v: VERSION, born: state.born, seen: state.seen }, { base: null });
    }),
    /** A snapshot put back. */
    restore: (slug, saved) => inChanges(async () => {
      if (!saved?.state) return;
      await save(slug, saved.state, { seen: saved.seen, base: saved.base });
    }),
    /** Everything of `slug` forgotten (its folder made, copied to or deleted for good). */
    forget: (slug) => inChanges(() => forget(slug)),
    /** Resolves once what was asked so far is done. */
    idle: () => inChanges(async () => {}),
  };
}
