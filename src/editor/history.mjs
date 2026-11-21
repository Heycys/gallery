import fs from "node:fs/promises";
import path from "node:path";
import { writeAtomic } from "../shared/files.mjs";
import { hashOf } from "./source.mjs";

// A document's recent versions (docs/editor.md "Recent versions"; 历史版本 in the workbench, gallery
// history): its file as it was, kept by the edit service (service.mjs keepVersion, on its disk chain, one
// at a time) in the state directory's history/<slug>/, a file <time>-<version>.html each (the time it was
// kept, to the millisecond, later than the one before it; the version the hash of the text, hashOf), with
// <time>-<version>.json beside it, who made that version: { by, kind, from? }. `by` is "reader" (the
// reader's edit: a commit of the page, 撤回, a restore of the workbench's), "agent" (an Agent: a write
// of the file the service did not make, a commit of a page of the Agent's own, gallery revert, gallery
// history --restore, an export's hand-in) or null (not known: the first version kept of a document, and
// every version kept before Gallery said who, which has no .json); `kind` what made it: commit, write
// (a write of anyone's outside the service), revert, undo (of a revert or a restore), restore (`from`:
// the version restored), hand-in, rename. The same text twice in a row is kept once (the later
// write's own word on who wins: the service knows who it wrote for). Kept: the last KEEP_ALL, and of
// those before them the last of each hour, KEEP_HOURS more at most (the oldest go first); the rest
// deleted, with their .json. Beside them summaries.json: what each changed of the one before it, as 历史版本 and
// gallery history list it (readSummariesIn). Node's built-ins, shared/files.mjs and the hash alone.

/** A recent version's file name: <time>-<version>.html, the time to the second (before 2026-11-11) or the millisecond. */
export const VERSION_NAME = /^(\d{8}T\d{6}(?:\d{3})?Z)-([a-f0-9]{16})\.html$/;
/** The recent versions kept of each document, all of them. */
export const KEEP_ALL = 30;
/** And of those before them, the last of each hour, this many more at most. */
export const KEEP_HOURS = 50;
/** Who a version is by, as kept. */
export const WRITERS = ["reader", "agent"];
/** What made it. */
export const KINDS = ["commit", "write", "revert", "undo", "restore", "hand-in", "rename", "page-icon"];

/** The folder of document `slug`'s recent versions in state directory `stateDirectory`. */
export const historyDirectory = (stateDirectory, slug) => path.join(stateDirectory, "history", slug);

// A version's time as its name says it, in ms.
function timeOf(stamp) {
  const [, y, mo, d, h, mi, s, ms = "0"] = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(\d{3})?Z$/.exec(stamp) ?? [];
  return y ? Date.UTC(+y, +mo - 1, +d, +h, +mi, +s, +ms) : 0;
}
// A time (ms) as a version's name says it: YYYYMMDDTHHMMSSmmmZ.
const stampOf = (ms) => new Date(ms).toISOString().replace(/[-:.]/g, "");

/** The names of the recent versions in `directory`, oldest first (by their time, then as named). */
async function namesIn(directory) {
  const names = (await fs.readdir(directory).catch(() => [])).filter((name) => VERSION_NAME.test(name));
  return names.map((name) => ({ name, time: timeOf(VERSION_NAME.exec(name)[1]) })).sort((a, b) => a.time - b.time || (a.name < b.name ? -1 : 1));
}

const sidecarOf = (name) => name.replace(/\.html$/, ".json");

// Who made the version `name` says, as kept beside it ({ by, kind, from } or null: none, or one that does not read).
async function readSidecar(directory, name) {
  try {
    const value = JSON.parse(await fs.readFile(path.join(directory, sidecarOf(name)), "utf8"));
    if (!value || typeof value !== "object") return null;
    return {
      by: WRITERS.includes(value.by) ? value.by : null,
      kind: KINDS.includes(value.kind) ? value.kind : null,
      ...(typeof value.from === "string" && VERSION_NAME.test(`${value.from}.html`) ? { from: value.from } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Which of `kept` (namesIn's, oldest first) stay: the last KEEP_ALL, and before them the last of each
 * hour (UTC), the latest KEEP_HOURS of those. A Set of their names.
 */
export function thinned(kept) {
  const stay = new Set(kept.slice(-KEEP_ALL).map(({ name }) => name));
  const older = kept.slice(0, Math.max(0, kept.length - KEEP_ALL));
  const lastOfHour = new Map();
  for (const entry of older) lastOfHour.set(Math.floor(entry.time / 3600000), entry.name);
  for (const name of [...lastOfHour.values()].slice(-KEEP_HOURS)) stay.add(name);
  return stay;
}

/**
 * Keep `source` among the recent versions in `directory`, by `meta`: { by ("reader", "agent"; left
 * out: not known, the version of a write outside the service, "agent" when versions were kept before
 * it, else null: the first one known), kind, from? }. The same text as the last one kept is not kept
 * again; when `meta` says who made it, what is kept beside that one says so. Resolves to the id
 * (<time>-<version>) of the version that holds it. `now`: the clock (ms).
 */
export async function keepVersionIn(directory, source, meta = {}, { now = Date.now() } = {}) {
  const version = hashOf(source);
  await fs.mkdir(directory, { recursive: true });
  const kept = await namesIn(directory);
  const last = kept.at(-1);
  const by = meta.by !== undefined ? (WRITERS.includes(meta.by) ? meta.by : null) : kept.length ? "agent" : null;
  const sidecar = { by, kind: KINDS.includes(meta.kind) ? meta.kind : "write", ...(typeof meta.from === "string" ? { from: meta.from } : {}) };
  if (last && last.name.endsWith(`-${version}.html`)) {
    if (meta.by !== undefined) await writeAtomic(path.join(directory, sidecarOf(last.name)), `${JSON.stringify(sidecar)}\n`);
    return last.name.replace(/\.html$/, "");
  }
  // Later than the last one kept, whatever the clock says (two in one millisecond, a clock set back).
  const time = Math.max(now, (last?.time ?? 0) + 1);
  const name = `${stampOf(time)}-${version}.html`;
  await writeAtomic(path.join(directory, sidecarOf(name)), `${JSON.stringify(sidecar)}\n`);
  await writeAtomic(path.join(directory, name), source);
  const all = [...kept, { name, time }];
  const stay = thinned(all);
  await Promise.all(all.filter(({ name: each }) => !stay.has(each)).flatMap(({ name: each }) => [
    fs.rm(path.join(directory, each), { force: true }),
    fs.rm(path.join(directory, sidecarOf(each)), { force: true }),
  ]));
  // A .json whose version is gone (kept when its .html failed to be written, or left by hand).
  for (const name of await fs.readdir(directory).catch(() => [])) {
    if (name.endsWith(".json") && VERSION_NAME.test(name.replace(/\.json$/, ".html")) && !stay.has(name.replace(/\.json$/, ".html"))) await fs.rm(path.join(directory, name), { force: true });
  }
  return name.replace(/\.html$/, "");
}

/**
 * The recent versions in `directory`, oldest first: [{ id (<time>-<version>), time (ISO), version,
 * by, kind, from? }] (by and kind null for one kept before Gallery said who: no .json). `text: true`:
 * each with its text too (`text`), those whose text is not of their version left out.
 */
export async function listVersionsIn(directory, { text = false } = {}) {
  const listed = [];
  for (const { name, time } of await namesIn(directory)) {
    const [, , version] = VERSION_NAME.exec(name);
    const meta = await readSidecar(directory, name);
    const entry = { id: name.replace(/\.html$/, ""), time: new Date(time).toISOString(), version, by: meta?.by ?? null, kind: meta?.kind ?? null, ...(meta?.from ? { from: meta.from } : {}) };
    if (text) {
      const source = await fs.readFile(path.join(directory, name), "utf8").catch(() => null);
      if (source === null || hashOf(source) !== version) continue;
      entry.text = source;
    }
    listed.push(entry);
  }
  return listed;
}

/**
 * The text of the version `id` (<time>-<version>, as listed) in `directory`, or null: an id that names
 * no version (nothing but VERSION_NAME's characters: no path), none kept, or a text not of its version.
 */
export async function readVersionIn(directory, id) {
  const name = `${id}.html`;
  if (typeof id !== "string" || !VERSION_NAME.test(name)) return null;
  const source = await fs.readFile(path.join(directory, name), "utf8").catch(() => null);
  return source !== null && hashOf(source) === VERSION_NAME.exec(name)[2] ? source : null;
}

// What each version changed of the one before it, as the list says it (service.mjs listHistory), kept so that
// no list works it out again: summaries.json in the folder, { v, pairs: { "<version before> <version>": said } },
// by the two texts' versions (a version thinned away gives the one after it another one before it: another pair).
// `v` says how it was worked out: another way of saying it (SUMMARIES) reads none of the old ones.
const SUMMARIES = "summaries.json";
const SUMMARIES_FORMAT = 1;

/** The summaries kept in `directory` (a Map of "<version before> <version>" to what the list said), empty when none reads. */
export async function readSummariesIn(directory) {
  try {
    const value = JSON.parse(await fs.readFile(path.join(directory, SUMMARIES), "utf8"));
    if (value?.v !== SUMMARIES_FORMAT || !value.pairs || typeof value.pairs !== "object") return new Map();
    return new Map(Object.entries(value.pairs).filter(([, said]) => said && typeof said === "object" && said.counts && Array.isArray(said.blocks)));
  } catch {
    return new Map();
  }
}

/** Keep `pairs` (readSummariesIn's) as the summaries of `directory`, those of `keep` (the pairs of the versions listed now) alone. */
export async function keepSummariesIn(directory, pairs, keep) {
  const kept = Object.fromEntries([...pairs].filter(([key]) => keep.has(key)));
  await writeAtomic(path.join(directory, SUMMARIES), `${JSON.stringify({ v: SUMMARIES_FORMAT, pairs: kept })}\n`);
}

/**
 * The version of `versions` (listVersionsIn's) a person or an Agent names by `ref`: its id, its version
 * (16 hex), or the start of either (6 characters at least): { version } (the latest of those it names
 * when they hold one text: one text is one version to restore), or { refused: "none" | "ambiguous", candidates? }.
 */
export function versionNamed(versions, ref) {
  const name = typeof ref === "string" ? ref.trim().toLowerCase() : "";
  if (!name) return { refused: "none" };
  const exact = versions.filter(({ id, version }) => id.toLowerCase() === name || version === name);
  const found = exact.length ? exact : name.length >= 6 ? versions.filter(({ id, version }) => version.startsWith(name) || id.toLowerCase().startsWith(name)) : [];
  if (!found.length) return { refused: "none" };
  if (new Set(found.map(({ version }) => version)).size > 1) return { refused: "ambiguous", candidates: found.map(({ id }) => id) };
  return { version: found.at(-1) };
}
