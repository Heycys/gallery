import fs from "node:fs/promises";
import path from "node:path";
import { writeAtomic } from "../shared/files.mjs";

// The workspace's record of edits (编辑记录, since 2026-11-07; docs/workbench.md
// "The workspace's facts"): .gallery/state/activity.json (shared/workspace.mjs layoutOf().activity), by day and
// document, the edits and the net change of words of each, a reader's commits and the Agent's writes counted
// apart, which the 编辑热力图 (gallery/heatmap) shows through workspace.query("activity"). An edit is a write
// that changed what a document's file holds (its text's hash: a write of the same text is none), counted on
// the day it was told on the server (the reader's clock: the server's local day), or, for a document written
// while no server ran, on the day of its file's time as the next start finds it (catchUp). What it last saw
// of each document (`seen`: the file's time, the hash of its text, its words, and who made its last change of
// text, `by`, which workspace.query("document") answers as `editedBy`) is how it tells; a document
// taken away keeps what was seen of it while the trash holds it, so that one restored is no edit. A year is
// kept, of 53 weeks (the days before KEEP_DAYS ago go as it is written); it is losable, as no one's content
// is in it: a file that does not read is a record that starts again that day (`since`), with nothing
// counted for what came before. Node's built-ins and shared/files.mjs alone.

/**
 * How many days back the record keeps: 53 weeks, today and the 370 days before it, as many as the widest year
 * the 编辑热力图 draws (53 columns of a week, Monday first, the last today's: on a Sunday its first square is
 * 370 days back), so that a record older than that shows no square of its first week as one not recorded yet.
 */
export const KEEP_DAYS = 371;
/** The format's version, the file's `version`. */
export const ACTIVITY_VERSION = 1;
/** Who an edit is counted as: the reader's commit (the page's autosave, 撤回, a rename) or anyone else's write (the Agent's). */
export const WRITERS = ["reader", "agent"];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const two = (value) => String(value).padStart(2, "0");

/** The local day `time` (a Date or ms) falls on, YYYY-MM-DD. */
export function dayOf(time) {
  const date = new Date(time);
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
}

/** The day `count` days after (or before, negative) day `day` (YYYY-MM-DD), by the calendar. */
export function dayAfter(day, count) {
  const [year, month, date] = day.split("-").map(Number);
  return dayOf(new Date(year, month - 1, date + count, 12));
}

// A record that reads: its version, a day it started, and its two tables; anything else is none.
function readRecord(text) {
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  const table = (item) => item !== null && typeof item === "object" && !Array.isArray(item);
  if (!table(value) || value.version !== ACTIVITY_VERSION || !DAY.test(value.since ?? "") || !table(value.days) || !table(value.seen)) return null;
  const days = {};
  for (const [day, documents] of Object.entries(value.days)) {
    if (!DAY.test(day) || !table(documents)) continue;
    for (const [slug, counts] of Object.entries(documents)) {
      for (const by of WRITERS) {
        const pair = counts?.[by];
        if (Array.isArray(pair) && pair.length === 2 && pair.every(Number.isInteger) && pair[0] > 0) ((days[day] ??= {})[slug] ??= {})[by] = [pair[0], pair[1]];
      }
    }
  }
  const seen = {};
  for (const [slug, known] of Object.entries(value.seen)) {
    if (table(known) && Number.isFinite(known.mtime) && typeof known.hash === "string" && Number.isInteger(known.words)) seen[slug] = { mtime: known.mtime, hash: known.hash, words: known.words, ...(WRITERS.includes(known.by) ? { by: known.by } : {}) };
  }
  return { version: ACTIVITY_VERSION, since: value.since, days, seen };
}

/**
 * The record kept in `file` (.gallery/state/activity.json). `now`: the clock (a function giving a Date);
 * `wait`: how long after a change it is written (ms), so that a burst of edits is one write.
 *   load()                               the file read (once; a record that starts today where it does not read)
 *   record(slug, { hash, words, mtime, by })  what the server took of a document's file now: an edit counted
 *                                        today when its text is another than was seen, by "reader" or
 *                                        "agent", its words the change from those seen (all of them for one
 *                                        never seen); true when one was counted
 *   writer(slug)                         who made its last change of text as seen: "reader", "agent", or
 *                                        null (none seen since the record started, or one it did not count)
 *   catchUp(documents, factsOf, { kept }) at a start: each document [{ slug, mtime }] whose file's time is
 *                                        not the one seen, its facts read (factsOf(slug): { hash, words,
 *                                        edited }), counted on its file's day as the Agent's where its text
 *                                        changed (one never seen too), but on a record that starts now,
 *                                        where nothing is counted and all is seen; `kept`: the slugs whose
 *                                        seen stays though no document has it (the trash's). Resolves to the
 *                                        number counted
 *   days(count)                          the last `count` days to today, from the day the record started at
 *                                        the earliest: [{ date, edits, words, reader: { edits, words },
 *                                        agent: { edits, words } }], a day of none 0 each
 *   since                                the day the record started
 *   flush(), close()                     written now (when anything changed); close stops the timer too
 */
export function createActivity({ file, now = () => new Date(), wait = 1000 }) {
  let state = null;
  let loading = null;
  let dirty = false;
  let timer = null;
  let writing = Promise.resolve();
  const today = () => dayOf(now());

  function load() {
    loading ??= fs.readFile(file, "utf8").then(readRecord, () => null).then((read) => {
      state = read ?? { version: ACTIVITY_VERSION, since: today(), days: {}, seen: {}, fresh: true };
      if (!read) dirty = true;
      return state;
    });
    return loading;
  }

  function later() {
    dirty = true;
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      flush();
    }, wait);
    timer.unref?.();
  }

  // The days before the year kept go; what is written is the record as it reads.
  function written() {
    const first = dayAfter(today(), -(KEEP_DAYS - 1));
    for (const day of Object.keys(state.days)) if (day < first) delete state.days[day];
    const { version, since, days, seen } = state;
    return `${JSON.stringify({ version, since: since < first ? first : since, days, seen })}\n`;
  }

  function flush() {
    if (!state || !dirty) return writing;
    dirty = false;
    clearTimeout(timer);
    timer = null;
    const text = written();
    writing = writing.then(async () => {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await writeAtomic(file, text);
    }).catch(() => {}); // not writable: the record lasts as long as the server
    return writing;
  }

  // An edit of `slug` on `day`, by `by`, of `words` words.
  function count(slug, day, by, words) {
    const pair = (((state.days[day] ??= {})[slug] ??= {})[WRITERS.includes(by) ? by : "agent"] ??= [0, 0]);
    pair[0] += 1;
    pair[1] += words;
  }

  return {
    load,
    get since() {
      return state?.since ?? today();
    },
    record(slug, { hash, words, mtime, by }) {
      if (!state) return false;
      const known = state.seen[slug];
      const writer = WRITERS.includes(by) ? by : "agent";
      state.seen[slug] = { mtime, hash, words, ...(known?.hash === hash ? (known.by ? { by: known.by } : {}) : { by: writer }) };
      if (known?.hash === hash) {
        if (known.mtime !== mtime) later();
        return false;
      }
      count(slug, today(), writer, words - (known?.words ?? 0));
      later();
      return true;
    },
    async catchUp(documents, factsOf, { kept = [] } = {}) {
      await load();
      const fresh = state.fresh === true;
      delete state.fresh;
      let counted = 0;
      for (const { slug, mtime } of documents) {
        const known = state.seen[slug];
        if (known && known.mtime === mtime) continue;
        const facts = await factsOf(slug).catch(() => null);
        if (!facts) continue;
        // Who changed it while none ran is the Agent's (anyone's but the reader's, as counted); a record that starts now knows none.
        const by = known?.hash === facts.hash ? known.by : fresh ? undefined : "agent";
        state.seen[slug] = { mtime: facts.edited, hash: facts.hash, words: facts.words, ...(by ? { by } : {}) };
        dirty = true;
        if (fresh || known?.hash === facts.hash) continue;
        const day = dayOf(facts.edited);
        count(slug, day < state.since ? state.since : day, "agent", facts.words - (known?.words ?? 0));
        counted += 1;
      }
      const keep = new Set([...documents.map(({ slug }) => slug), ...kept]);
      for (const slug of Object.keys(state.seen)) {
        if (keep.has(slug)) continue;
        delete state.seen[slug];
        dirty = true;
      }
      if (dirty) later();
      return counted;
    },
    writer(slug) {
      return state?.seen[slug]?.by ?? null;
    },
    days(count = 365) {
      const end = today();
      const since = state?.since ?? end;
      let first = dayAfter(end, -(Math.max(1, Math.min(KEEP_DAYS, count)) - 1));
      if (first < since) first = since;
      const list = [];
      for (let day = first; day <= end; day = dayAfter(day, 1)) {
        const entry = { date: day, edits: 0, words: 0, reader: { edits: 0, words: 0 }, agent: { edits: 0, words: 0 } };
        for (const counts of Object.values(state?.days[day] ?? {})) {
          for (const by of WRITERS) {
            const [edits, words] = counts[by] ?? [0, 0];
            entry[by].edits += edits;
            entry[by].words += words;
            entry.edits += edits;
            entry.words += words;
          }
        }
        list.push(entry);
      }
      return list;
    },
    flush,
    async close() {
      clearTimeout(timer);
      timer = null;
      await flush();
    },
  };
}
