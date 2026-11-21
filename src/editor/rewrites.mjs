import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { writeAtomic } from "../shared/files.mjs";

// What a reader's edit in the preview wrote of an Agent's natural HTML as the kit's markup
// (docs/editor.md, "Natural HTML"): the first commit that changes something in a report whose file
// has natural HTML writes it all as the kit's, the Agent's blocks it has not checked yet too. The
// edit service keeps each such write (when, and naturalize's changes: each rule at its line of the
// file as the Agent had left it) in its state directory (the workspace's .gallery/state/),
// rewrites/<slug>/, and gallery check and
// gallery export say them once, before anything else of that report, so the Agent learns why its
// file changed. The dev server's log says each one as it is written too.

const maxKept = 20; // writes kept of each report until a command says them
const ENTRY = /^\d{8}T\d{6}Z-[a-f0-9]{8}\.json$/; // <time>-<random>.json: by name, oldest first

const folderOf = ({ stateDirectory, slug }) => path.join(stateDirectory, "rewrites", slug);

/** Keep a write: `changes` ({ line, rule, note?, key? }, naturalize's), `time` an ISO time. */
export async function keepRewrite({ stateDirectory, reportsDirectory, slug, time, changes }) {
  const folder = folderOf({ stateDirectory, reportsDirectory, slug });
  await fs.mkdir(folder, { recursive: true });
  const stamp = time.replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  await writeAtomic(path.join(folder, `${stamp}-${randomBytes(4).toString("hex")}.json`), JSON.stringify({ time, changes }));
  const names = (await fs.readdir(folder)).filter((name) => ENTRY.test(name)).sort();
  await Promise.all(names.slice(0, Math.max(0, names.length - maxKept)).map((name) => fs.rm(path.join(folder, name), { force: true })));
}

/** The writes kept of a report, oldest first ({ time, changes }), taken away: each is said once. */
export async function takeRewrites({ stateDirectory, reportsDirectory, slug }) {
  const folder = folderOf({ stateDirectory, reportsDirectory, slug });
  const names = (await fs.readdir(folder).catch(() => [])).filter((name) => ENTRY.test(name)).sort();
  const entries = [];
  for (const name of names) {
    const file = path.join(folder, name);
    try {
      const entry = JSON.parse(await fs.readFile(file, "utf8"));
      if (typeof entry?.time === "string" && Array.isArray(entry.changes)) entries.push(entry);
    } catch {}
    await fs.rm(file, { force: true }).catch(() => {}); // locked (EPERM, EBUSY): said again next time, nothing stops
  }
  return entries;
}

// A time as the Agent reads it next to its own: the hour and minute here, the day too when it is not today.
const when = (time, today = new Date()) => {
  const date = new Date(time);
  const two = (value) => String(value).padStart(2, "0");
  const clock = `${two(date.getHours())}:${two(date.getMinutes())}`;
  return date.toDateString() === today.toDateString() ? clock : `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())} ${clock}`;
};

/**
 * What the commands print of the writes kept of report file `file` (takeRewrites' entries): a line
 * for each, its time and each rule at its line (a chart with its key), a line for each note, then
 * that those lines are the file's as the Agent had left it. None: nothing.
 */
export function rewriteLines(file, entries, { today = new Date() } = {}) {
  if (!entries.length) return [];
  const shown = path.resolve(file); // as the system writes it: an Agent uses it as it is
  const lines = [];
  for (const { time, changes } of entries) {
    const said = [];
    for (const { line, rule, key } of [...changes].sort((a, b) => a.line - b.line)) {
      const what = `line ${line} ${rule}${key ? ` ${key}` : ""}`;
      if (!said.includes(what)) said.push(what);
    }
    lines.push(`preview ${shown}: at ${when(time, today)}, when the reader edited the page, the preview wrote your natural HTML as the kit's markup: ${said.join(", ")}`);
    lines.push(...changes.filter((change) => change.note).map(({ line, rule, note }) => `  line ${line}, ${rule}: ${note}`));
  }
  lines.push("  those lines are the file's as you had left it");
  return lines;
}
